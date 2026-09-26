#!/usr/bin/env bash
# Update Coinslot on the server (Proxmox LXC): pull, rebuild, back up the DB, restart, verify.
#
# Usage: ./deploy.sh [options]
#   --force      rebuild and restart even if there are no new commits
#   --register   re-register slash commands (automatic when src/discord/commands changed)
#   --no-pull    skip git; deploy the code already on disk
#   -h, --help   show this help
#
# Data in ./data is never touched except for the backup copy made before restarting.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

FORCE=0
REGISTER=0
PULL=1
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --register) REGISTER=1 ;;
    --no-pull) PULL=0 ;;
    -h | --help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (see --help)" >&2
      exit 2
      ;;
  esac
done

SERVICE=coinslot
DB=data/coinslot.db
KEEP_MANUAL_BACKUPS=10
LOGIN_TIMEOUT=90 # seconds to wait for "Logged in as"
APP_UID=1000     # the image runs as the "node" user

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m OK\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARN\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31mFAIL\033[0m %s\n' "$*" >&2
  exit 1
}

# ---------------------------------------------------------------- preflight
command -v docker >/dev/null || die "docker not found"
docker compose version >/dev/null 2>&1 || die "docker compose plugin not found"
[[ -f .env ]] || die ".env not found (cp .env.example .env, then fill it in)"
mkdir -p data
data_owner=$(stat -c %u data)
[[ "$data_owner" == "$APP_UID" ]] ||
  warn "data/ is owned by uid $data_owner but the container runs as uid $APP_UID (fix: chown -R $APP_UID:$APP_UID data)"

PREV=$(git rev-parse HEAD)
BACKUP_DIR=""

# Commit baked into the running container ("" if not running or built outside deploy.sh).
running_revision() {
  local id
  id=$(docker compose ps -q --status running "$SERVICE" 2>/dev/null || true)
  [[ -n "$id" ]] || return 0
  docker inspect -f '{{ index .Config.Labels "coinslot.revision" }}' "$id" 2>/dev/null || true
}

rollback_hint() {
  echo
  echo "To roll back to the previous version ($(git log -1 --format='%h %s' "$PREV")):"
  echo "  git reset --hard $PREV"
  if [[ -n "$BACKUP_DIR" ]]; then
    echo "  docker compose stop"
    echo "  rm -f $DB-wal $DB-shm && cp -p $BACKUP_DIR/coinslot.db* data/"
  fi
  echo "  docker compose up -d --build"
}

# ---------------------------------------------------------------- 1. pull
if ((PULL)); then
  [[ -z "$(git status --porcelain --untracked-files=no)" ]] ||
    die "tracked files were edited on the server; inspect with 'git status' and discard with 'git checkout -- .'"
  info "Fetching updates"
  git fetch --quiet
  UPSTREAM=$(git rev-parse '@{u}')
  if [[ "$UPSTREAM" != "$PREV" ]]; then
    echo "Incoming commits:"
    git log --format='  %h %s' "$PREV..$UPSTREAM"
    git merge --ff-only --quiet "$UPSTREAM" ||
      die "cannot fast-forward (server history diverged from GitHub)"
  fi
fi
NEW=$(git rev-parse HEAD)

# Skip only when the running container was built from exactly this commit.
# Comparing git alone is not enough: a manual `git pull` updates the code but not the container.
RUNNING=$(running_revision)
if [[ "$RUNNING" == "$NEW" ]] && ((!FORCE)); then
  ok "Already deployed: $(git log -1 --format='%h %s')"
  echo "   Use --force to rebuild and restart anyway."
  exit 0
fi
if [[ -z "$RUNNING" || "$RUNNING" == "unknown" ]]; then
  info "Running version unknown (bot stopped or started outside deploy.sh); deploying $(git rev-parse --short HEAD)"
elif [[ "$RUNNING" != "$NEW" ]]; then
  info "Running $(git rev-parse --short "$RUNNING" 2>/dev/null || echo "${RUNNING:0:7}"), deploying $(git rev-parse --short HEAD)"
fi
# The running commit is the real "previous version" (rollback target, command diff),
# even if the code was already pulled by hand.
if [[ -n "$RUNNING" ]] && git cat-file -e "$RUNNING^{commit}" 2>/dev/null; then
  PREV=$RUNNING
fi

if [[ "$NEW" != "$PREV" ]] && ! git diff --quiet "$PREV" "$NEW" -- src/discord/commands; then
  info "Slash command definitions changed; they will be re-registered"
  REGISTER=1
fi

# ---------------------------------------------------------------- 2. build (old container keeps running)
info "Building image"
export COINSLOT_REVISION="$NEW"
if ! docker compose build --quiet; then
  warn "Build failed; the running bot was not touched."
  rollback_hint
  exit 1
fi

# ---------------------------------------------------------------- 3. stop + back up
info "Stopping the bot"
docker compose stop "$SERVICE" >/dev/null 2>&1 || true

if [[ -f "$DB" ]]; then
  BACKUP_DIR="data/backups/manual-$(date +%Y%m%d-%H%M%S)"
  [[ -e "$BACKUP_DIR" ]] && BACKUP_DIR+="-$$"
  mkdir -p "$BACKUP_DIR"
  # Stopped, so the -wal/-shm files are consistent with the main file.
  cp -p "$DB"* "$BACKUP_DIR"/
  ok "Database backed up to $BACKUP_DIR"

  mapfile -t old_backups < <(ls -1d data/backups/manual-* 2>/dev/null | sort | head -n -"$KEEP_MANUAL_BACKUPS")
  if ((${#old_backups[@]})); then
    rm -rf -- "${old_backups[@]}"
    echo "   Pruned ${#old_backups[@]} old manual backup(s); keeping $KEEP_MANUAL_BACKUPS"
  fi
  # The container's nightly backup job writes here as uid $APP_UID.
  [[ $EUID -eq 0 ]] && chown -R "$APP_UID:$APP_UID" data/backups
else
  warn "No database at $DB yet; skipping backup (first deploy?)"
fi

# ---------------------------------------------------------------- 4. register commands
if ((REGISTER)); then
  info "Registering slash commands"
  docker compose run --rm --no-deps "$SERVICE" node dist/discord/register.js ||
    warn "Command registration failed; the bot will still start. Retry with: ./deploy.sh --no-pull --force --register"
fi

# ---------------------------------------------------------------- 5. start + verify
info "Starting the bot"
since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker compose up -d "$SERVICE" >/dev/null

logs=""
for ((i = 0; i < LOGIN_TIMEOUT; i += 3)); do
  logs=$(docker compose logs --no-color --no-log-prefix --since "$since" "$SERVICE" 2>/dev/null || true)
  grep -q 'Logged in as' <<<"$logs" && break
  grep -qE 'Login failed|Invalid environment|Message Content Intent' <<<"$logs" && break
  sleep 3
done

grep -E 'Applied migrations' <<<"$logs" | sed 's/^/   /' || true
if grep -q 'Logged in as' <<<"$logs"; then
  ok "$(grep -m1 -o 'Logged in as .*' <<<"$logs")"
else
  if grep -qE 'Login failed|Invalid environment|Message Content Intent' <<<"$logs"; then
    warn "The bot failed to start. Recent logs:"
  else
    warn "The bot did not log in within ${LOGIN_TIMEOUT}s. Recent logs:"
  fi
  tail -n 30 <<<"$logs" | sed 's/^/   /'
  rollback_hint
  exit 1
fi

# ---------------------------------------------------------------- 6. tidy up
docker image prune -f >/dev/null 2>&1 || true

echo
ok "Deployed $(git log -1 --format='%h %s')"
[[ -n "$BACKUP_DIR" ]] && echo "   Backup: $BACKUP_DIR"
((REGISTER)) && echo "   Slash commands re-registered"
echo "   Follow logs: docker compose logs -f"
