# Coinslot

> Spent it? Slot it.

個人記帳用的 Discord bot。只輸入「關鍵字 + 金額」就記好一筆，每晚沒記帳會提醒，每週日發週報。

## 使用方式

在記帳頻道或 bot 私訊直接打字：

```
午餐 -120
-1,200 耳機
120 早餐          ← 負號可省略（視為支出）
-１２０ 飲料       ← 全形也可以
+500 薪水         ← + 開頭是收入
薪水 +50,000
```

- 支出用 `-` 或不帶符號，收入一定要加 `+`
- 成功：bot 回一行 `Logged 午餐 -$120`、`Logged 薪水 +$500`
- 看不出金額：bot 在你的訊息加上 ❓（不會回訊息打擾你）
- 金額不合理（0 或超過 10,000,000）：回一行說明

| 指令 | 說明 |
|---|---|
| `/log text:午餐 -120` | 同純文字輸入 |
| `/undo` | 刪除最後一筆（軟刪除，資料庫仍保留） |
| `/today` | 今天的每一筆與合計 |
| `/week` | 本週合計，與依備註加總的支出前三名（Top spending） |
| `/week week:18` | 今年第 18 週（ISO 週，週一開始） |
| `/month` | 本月合計與支出前五名 |
| `/month month:9` | 今年 9 月 |
| `detail:True` | 加在 `/week`、`/month` 後面，依日期列出每一筆 |
| `/export` | 下載全部紀錄 CSV（Excel 可直接開） |

所有指令回覆都只有你看得到（ephemeral）。

### 查詢過去的週與月

- 打 `/week` 或 `/month` 後，Discord 會跳出可選的欄位：`week`（1–53）或 `month`（1–12），以及 `detail`（True / False）。
- **週數**是 ISO 週：週一開始，第 1 週是包含該年第一個週四的那週（例如 2026 年第 1 週是 2025/12/29–2026/1/4）。
  `/week` 的標題會顯示目前是第幾週，例如 `This week · W42 (10/12–10/18)`。
- **跨年**：指定的週或月在今年還沒開始時，會改查**去年**的，標題會標出年份。
  例如 2027 年 1 月打 `/month month:12` → 2026 年 12 月；10 月打 `/week week:45` → `W45 2025 (11/3–11/9)`。
- 該年沒有那一週時（例如 2025 年只有 52 週），回覆 `2025 has no week 53.`。
- 明細太長時，會依日期拆成多則訊息；超過 5 則就改成回覆摘要並附上完整明細的 `.txt` 檔。
  一個月約 150 筆時是 2 則訊息，超過約 450 筆才會改成附檔。

### 顯示格式

`/today`：

```
Today: 5 entries · Spent -$2,383

23:21 麥當勞 -$119
23:22 麥當勞 -$119
23:22 肯德基 -$162
23:23 修腳踏車 -$1,750
23:24 褲架 菜瓜布 抹布 -$233
```

有收入時，合計多出 `Earned` 和 `Net`：

```
Today: 3 entries · Spent -$238 · Earned +$500 · Net +$262

12:05 麥當勞 -$119
18:40 麥當勞 -$119
20:00 發票中獎 +$500
```

`/week`：

```
This week · W39 (9/21–9/27)
5 entries · Spent -$2,383

Top spending
修腳踏車 -$1,750
麥當勞 ×2 -$238
褲架 菜瓜布 抹布 -$233
```

`/week week:36 detail:True`（過去的週，加上每日明細；沒有紀錄的日子不列）：

```
W36 (8/31–9/6)
4 entries · Spent -$3,488

Top spending
修腳踏車 -$1,750
房租 -$1,500
麥當勞 ×2 -$238

Tue 9/1 · 1 entry · Spent -$1,500
09:00 房租 -$1,500

Thu 9/3 · 1 entry · Spent -$1,750
10:00 修腳踏車 -$1,750

Sat 9/5 · 2 entries · Spent -$238
12:05 麥當勞 -$119
18:40 麥當勞 -$119
```

`/month month:9`（本月的標題是 `This month · Oct 2026`）：

```
Sep 2026
5 entries · Spent -$3,488 · Earned +$42,000 · Net +$38,512

Top spending
修腳踏車 -$1,750
房租 -$1,500
麥當勞 ×2 -$238
```

週報多一行與上週**支出**的比較：

```
**Weekly report · W39 (9/21–9/27)**
5 entries · Spent -$2,383
Last week: Spent -$1,200 · Change -$1,183 (spent more)

Top spending
...
```

月報（每月 1 號，報上個月）與前一個月比較：

```
**Monthly report · Sep 2026**
5 entries · Spent -$3,488 · Earned +$42,000 · Net +$38,512
Previous month: Spent -$1,500 · Change -$1,988 (spent more)

Top spending
...
```

規則：

- **金額**：支出 `-$119`、收入 `+$500`（ASCII 的 `-`、`+`，有千分位）；合計也帶正負號。
- **合計**：只有支出時顯示 `Spent`；有收入時才加上 `Earned` 和 `Net`，例如
  `6 entries · Spent -$2,383 · Earned +$500 · Net -$1,883`。
- **Top spending**：只計支出，依備註加總後取前幾名（週 3 項、月 5 項）。備註去掉頭尾空白、連續空白合併後完全相同才算同一項；
  多筆時加 `×n`；沒有備註的歸為 `(no note)`。排序依支出金額 → 筆數 → 最近一筆的時間。
- **Change**：這期支出減上一期支出，沿用同樣的正負號：負數代表這期花得比較多。
- **明細**：每天一段，標題是當天的合計，下面每筆一行；用台北時間分日。
- 每項各佔一行；Discord 用比例字型，所以不用空格對齊。
- `/export` 的 CSV 不套用以上格式，`amount` 是純數字的有號整數（支出為負），方便在 Excel 加總。

排程（皆為台北時間）：

- **每晚 22:00**：今天沒有任何紀錄時，在記帳頻道提醒並 mention 你
- **週日 21:00**：週報（合計、Top spending、與上週支出比較）
- **每月 1 號 21:00**：月報（上個月的合計、Top spending、與前一個月支出比較）
- **每天 04:00**：備份資料庫到 `data/backups/`，保留最近 14 份

## 網頁介面

除了 Discord，也可以用瀏覽器（手機或電腦）操作，分成兩頁：

- **行事曆**：月曆上每格顯示當天支出，支出越多顏色越深，有收入的日子右上角有綠點。
  - 點**日期**：看當天每一筆，可以**編輯**（金額、備註、日期、時間）、**刪除**、**補記**（同樣打 `午餐 -120`，可指定時間）。
  - 點最左欄的**週數**（例如 `W41`）：該週的摘要與每日明細，等同 `/week 41 -a`。
  - 下方是整月合計與 Top spending 前 5；「每日明細」看整個月每一筆。
  - `‹ ›` 切換月份，可以一路往回看過去的月份。
- **聊天室**：和 Discord 一樣打字記帳，支援 `/today`、`/week [n] [-a]`、`/month [n] [-a]`、`/undo`、`/export`、`/help`；輸入 `/` 會跳出指令提示。
  對話紀錄存在伺服器，手機、電腦看到的是同一份。

版面：手機一次顯示一頁，**左右滑動**（或點上方的「行事曆／聊天室」）切換；寬螢幕（≥ 900px）兩頁並排。支援深色模式。

### 各自獨立的 `/undo`

| 在哪裡記的 | 紀錄來源 | 誰的 `/undo` 會撤銷它 |
|---|---|---|
| Discord 打字或 `/log` | `text`／`slash` | 只有 Discord 的 `/undo` |
| 網頁聊天室 | `web` | 只有網頁聊天室的 `/undo` |
| 行事曆補記 | `calendar` | 都不會；在行事曆上直接刪除 |

行事曆上的編輯與刪除可以處理任何來源的紀錄。日明細裡每筆下方會標示來源（Discord／網頁聊天／行事曆）。

### 加到手機主畫面

用 Safari（iPhone）或 Chrome（Android）開網頁 → 分享／選單 →「加入主畫面」，之後會像 app 一樣全螢幕開啟。
iPhone 主畫面的圖示要用 PNG：把 `coinslot-avatar-copper.png` 複製成 `web/public/apple-touch-icon.png` 再部署；沒有這個檔案時 iPhone 會用網頁截圖當圖示。

## 預設值與設計決定

| 項目 | 預設 | 調整方式 |
|---|---|---|
| 一週起始 | 週一 | 固定（ISO 週） |
| 提醒時間 | 22:00 | `REMINDER_TIME` |
| 週報時間 | 週日 21:00 | `WEEKLY_REPORT` |
| 月報時間 | 每月 1 號 21:00 | `MONTHLY_REPORT` |
| 週數 | ISO 週（週一開始） | 固定 |
| 時區 | Asia/Taipei | `TIMEZONE`（不依賴容器 TZ） |
| User Install | 不啟用 | 只註冊私人伺服器的 guild command |
| 金額 | 新台幣整數；支出用 `-` 或不帶符號，收入用 `+` | — |
| 資料表示 | `amount` 為有號整數：支出為負、收入為正，`SUM` 即淨額 | — |

## Discord Developer Portal 設定

1. 到 <https://discord.com/developers/applications> 建立 Application，名稱 `Coinslot`，上傳頭像 `coinslot-avatar-copper.png`。
2. **General Information**：複製 Application ID → `DISCORD_APP_ID`。
3. **Bot** 頁面：
   - Reset Token → 複製到 `.env` 的 `DISCORD_TOKEN`（只存在本機 `.env`，不要貼到任何地方）
   - 開啟 **Message Content Intent**（沒開會出現 `Used disallowed intents`）
   - 建議關閉 **Public Bot**，避免別人把它加到其他伺服器
4. **邀請 bot 到私人伺服器**，開啟下面網址（把 `<APP_ID>` 換掉）：

   ```
   https://discord.com/oauth2/authorize?client_id=<APP_ID>&scope=bot+applications.commands&permissions=101440
   ```

   權限：View Channel、Send Messages、Read Message History、Add Reactions、Attach Files。
   `npm run register` 失敗時也會印出帶好 `guild_id` 的邀請網址。
5. Discord 設定 → 進階 → 開啟**開發者模式**，然後右鍵複製：
   - 私人伺服器 ID → `GUILD_ID`
   - 記帳頻道 ID → `LEDGER_CHANNEL_ID`
   - 你自己的使用者 ID → `OWNER_USER_ID`
6. 註冊 slash commands：`npm run register`（指令有變動時再跑一次）。

## 環境變數

複製 `.env.example` 為 `.env` 後填寫。

| 變數 | 必填 | 說明 |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Bot token |
| `DISCORD_APP_ID` | ✅ | Application ID |
| `GUILD_ID` | ✅ | 私人伺服器 ID |
| `LEDGER_CHANNEL_ID` | ✅ | 記帳與提醒頻道 ID |
| `OWNER_USER_ID` | ✅ | 唯一允許使用的使用者 ID，其他人一律忽略 |
| `TIMEZONE` | | 預設 `Asia/Taipei` |
| `REMINDER_TIME` | | `HH:MM`，預設 `22:00` |
| `WEEKLY_REPORT` | | `DAY HH:MM`（`MON`…`SUN`），預設 `SUN 21:00` |
| `MONTHLY_REPORT` | | `D HH:MM`（D 為 1–28，確保每個月都有這天），預設 `1 21:00`，報上個月 |
| `DB_PATH` | | 本機預設 `./data/coinslot.db`；Docker 固定為 `/data/coinslot.db` |
| `UPTIME_KUMA_PUSH_URL` | | Uptime Kuma push 網址；有設定就每分鐘送一次心跳（連線正常時才送） |
| `WEB_PORT` | | 網頁介面的 port，預設 `8080`（Docker 只綁在 LXC 的 `127.0.0.1`） |
| `WEB_ALLOWED_USERS` | | 允許使用網頁的 Tailscale 帳號（逗號分隔，例如 `you@gmail.com`）；留空不檢查 |
| `WEB_ONLY` | | 開發用：`1` = 只開網頁，不登入 Discord、不跑排程 |

設定錯誤時程式啟動會直接列出是哪個變數有問題。token 一旦外洩，立刻到 Developer Portal 重設。

## 本機開發

需要 Node.js 24。

```bash
npm install
cp .env.example .env     # 填好後
npm run register         # 註冊 slash commands
npm run dev              # 啟動 bot（檔案變動會自動重啟）
```

| 指令 | 說明 |
|---|---|
| `npm test` | 單元測試 |
| `npm run typecheck` / `lint` / `format` | 型別檢查、lint、格式化 |
| `npm run playground` | 不連 Discord，直接在終端機試記帳（見 DEBUG.md） |
| `npm run build` / `start` | 編譯後端與前端後執行 |
| `npm run build:web` | 只 build 前端（輸出到 `dist/public`） |
| `npm run dev:web` | 前端開發伺服器（http://localhost:5173，`/api` 轉到本機 8080） |

### 本機開發網頁介面

**本機不要登入 Discord**（否則會和 Proxmox 上的 bot 同時回應），用 `WEB_ONLY=1` 搭配另一個資料庫：

```bash
# 終端機 1：後端（只開網頁 API，資料存在 data/dev.db）
WEB_ONLY=1 DB_PATH=./data/dev.db npm run dev
# 終端機 2：前端（改了畫面會即時更新）
npm run dev:web
```

開 http://localhost:5173。只想看 build 好的版本：`npm run build:web` 後直接開 http://localhost:8080。

手動驗證方式見 [DEBUG.md](DEBUG.md)。

## 部署（DIT Proxmox LXC + Docker Compose）

1. **部署前先知會 DIT 其他管理員**，避免容器被誤刪。
2. 在 Proxmox 開一個**獨立的 LXC**（Debian 12 即可，1 核 / 512MB RAM / 4GB 硬碟足夠）。
   LXC 內要跑 Docker 需在 Options → Features 開啟 `nesting`（非特權容器另需 `keyctl`）。
3. 在 LXC 內安裝 Docker 與 Compose plugin。
4. 把程式碼 clone 到 LXC（**不要放進社團共用的 repo**），並建立 `.env`：

   ```bash
   git clone https://github.com/Latuuuuu/Coinslot.git /opt/coinslot
   cd /opt/coinslot
   cp .env.example .env && nano .env
   chmod 600 .env
   mkdir -p data && chown 1000:1000 data    # 容器以 uid 1000 執行
   ```

   repo 若是 private，建議在 LXC 產生 SSH key，加到 GitHub repo 的 **Settings → Deploy keys**（唯讀），
   改用 `git@github.com:Latuuuuu/Coinslot.git` clone。

5. 第一次啟動：

   ```bash
   ./deploy.sh --no-pull --force --register
   ```

   看到 `OK Logged in as Coinslot#xxxx` 即成功。

### 更新版本

在本機 commit 並 push 到 GitHub 後，在 LXC 上：

```bash
cd /opt/coinslot
./deploy.sh
```

`deploy.sh` 會依序：

1. `git fetch` 並拉下新 commit；伺服器上的檔案被改過會停下來，不會覆蓋。
   接著比對**正在跑的容器**是用哪個 commit 建的（映像檔的 `coinslot.revision` 標籤），跟目前程式碼相同才直接結束。
   所以就算先手動 `git pull` 過，`deploy.sh` 仍會重建。
2. `git merge --ff-only` 拉下新版本，列出這次更新的 commit
3. 建置新映像檔（這段時間舊的 bot 還在運作）
4. 停止 bot，把 `data/coinslot.db*` 複製到 `data/backups/manual-<時間>/`（保留最近 10 份）
5. `src/discord/commands/` 有變動時自動重新註冊 slash commands
6. 啟動 bot，等到 log 出現 `Logged in as` 才算成功；有 migration 會印出來
7. 失敗時印出最近的 log 和**回復到上一版的指令**（含還原資料庫）

| 選項 | 用途 |
|---|---|
| `--force` | 正在跑的已經是最新版也重建、重啟 |
| `--register` | 強制重新註冊 slash commands |
| `--no-pull` | 不碰 git，直接部署目前的程式碼 |

**同一個 token 只能有一個 bot 在跑**。本機 `npm run dev` 或本機的 `docker compose up` 和 Proxmox 上的 bot 同時跑時，
兩個都會回應：你可能看到舊版格式的回覆、重複的回覆，log 會出現 `Interaction has already been acknowledged`（40060），
紀錄也會分別寫進兩邊的資料庫。本機測試前先停掉 Proxmox 上的 bot，或另外建一個測試用的 Discord application。

想直接看伺服器上的資料庫（確認紀錄在不在、migration 有沒有跑），見 [DEBUG.md](DEBUG.md) 的「8.2 在 LXC 上直接查資料庫」。

**資料不會因為更新而消失**：資料庫在 `data/`（掛進容器的 volume），不在映像檔也不在 git 裡。
不要刪掉 `/opt/coinslot` 重新 clone，也不要把本機整個資料夾 rsync 過去（會用本機的 `data/`、`.env` 蓋掉伺服器上的）。

### 備份與還原

- 每天 04:00 自動備份到 `data/backups/coinslot-YYYY-MM-DD.db`，保留 14 份。
- 每次跑 `deploy.sh` 前會另外備份到 `data/backups/manual-<時間>/`，保留 10 份。
- 社團 Proxmox 若有 vzdump 排程，這個 LXC 也會被備份到社團儲存空間。**是否排除請自行決定**（記帳資料會因此出現在社團儲存空間）。
- 還原：

  ```bash
  docker compose stop
  cp data/backups/coinslot-2026-09-26.db data/coinslot.db
  rm -f data/coinslot.db-wal data/coinslot.db-shm
  docker compose start
  ```

### 網頁介面（Tailscale）

網頁只綁在 LXC 的 `127.0.0.1:8080`，DIT 內網的其他人連不到；透過 Tailscale 只讓你自己的裝置連線。

1. **讓 LXC 能跑 Tailscale**（非特權 LXC 需要 `/dev/net/tun`）。在 **Proxmox 主機**上編輯 `/etc/pve/lxc/<CTID>.conf`，加上：

   ```
   lxc.cgroup2.devices.allow: c 10:200 rwm
   lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
   ```

   然後重開這個 LXC。（這會動到 Proxmox 主機的設定，先跟 DIT 其他管理員說一聲。）

2. **在 LXC 裡安裝並登入 Tailscale**：

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   tailscale up            # 照提示開網址，用你的帳號登入
   ```

3. 在 Tailscale 管理後台（DNS 頁面）開啟 **MagicDNS** 與 **HTTPS Certificates**。

4. **把網頁掛到 tailnet 上**（HTTPS、自動憑證、開機後自動恢復）：

   ```bash
   tailscale serve --bg 8080
   tailscale serve status   # 顯示網址，例如 https://coinslot.<你的 tailnet>.ts.net
   ```

5. 手機和電腦安裝 Tailscale app 並登入同一個帳號，就能開上面的網址。

6. （建議）在 `.env` 設定 `WEB_ALLOWED_USERS=你的 Tailscale 登入帳號`，再跑一次 `./deploy.sh --force`。
   `tailscale serve` 會把訪客帳號放在 `Tailscale-User-Login` header，不在名單上的一律 403。
   設定後直接在 LXC 上 `curl localhost:8080` 也會是 403（沒有那個 header），這是正常的。

網頁和 bot 是同一個容器，`deploy.sh` 不用改；更新後網頁也一起更新。

### 資料庫 migration

- schema 由 [src/db/migrations.ts](src/db/migrations.ts) 管理，**啟動時自動套用**，已套用的紀錄在 `schema_migrations` 資料表。
- 套用前若資料庫裡已經有資料，會先存一份快照到 `data/backups/pre-migration-<時間>.db`。這類檔案不算在 14 份的自動清理裡，確認沒問題後可以自行刪除。
- `002_signed_amounts`：把舊版的正數金額轉成負數（支出），限制條件改成 `amount != 0`。
- `003_web`：`entries` 加 `updated_at`（網頁編輯時記錄），新增 `chat_messages`（網頁聊天紀錄）。
- 重複執行是安全的：每個 migration 和它的紀錄在同一個 transaction 裡，已套用的會跳過。
- 新增 migration 時只能往後加，不要修改已套用的內容。

### 監控

在 Uptime Kuma 建立 **Push** 類型的監控，心跳間隔設 60 秒，把 push 網址填進 `UPTIME_KUMA_PUSH_URL`。bot 斷線時不會送心跳，Uptime Kuma 就會通知。

## 專案結構

```
src/
  config.ts          環境變數驗證（zod）
  core/              業務邏輯，不依賴 Discord
    parse.ts         「午餐 -120」→ { amount, note }
    period.ts        台北時間的今天／週／月 → UTC 範圍；週數與月份查詢（含跨年規則）
    ledger.ts        記帳、撤銷（Discord／網頁分開）、編輯、刪除、查詢、統計
    commands.ts      文字指令（網頁聊天室與 playground 共用）
    calendar.ts      依台北日期分組
    stats.ts         支出／收入／淨額合計、依備註分組的 Top spending
    format.ts        回覆、週報、月報、每日明細、長訊息切段、CSV
  db/
    migrations.ts    schema 與 migration（啟動時自動套用）
    repository.ts    repository 介面與 SQLite 實作（介面為 async，方便將來換 D1）
  discord/           client、訊息與指令處理、指令註冊
  jobs/              提醒、週報、月報、備份、心跳排程
  web/               網頁 API（Hono）與靜態檔服務
  index.ts           進入點（bot 與網頁在同一個程式）
web/                 網頁前端（Vite + React），build 到 dist/public
test/                單元測試（Vitest）
scripts/playground.ts  終端機互動測試
deploy.sh            伺服器上的更新腳本（pull → build → 備份 → 重啟 → 確認）
```

將來若要搬到 Cloudflare Workers（HTTP Interactions），只需替換 `discord/`、`jobs/` 與 `db/` 的實作，`core/` 可以直接沿用；網頁 API 用的 Hono 也能直接跑在 Workers 上。

## 品牌

| 名稱 | 色碼 |
|---|---|
| Copper | `#A85A24` |
| Tan | `#E3B47E` |
| Umber | `#7E4219` |
| Clay | `#C98446` |
| Slot | `#2A1508` |
| Paper | `#F4EFE6` |
| Ink | `#1E1B17` |
