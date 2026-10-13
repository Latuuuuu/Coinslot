# Coinslot 手動驗證指南

> 最後更新：2026-09-26
> 目前進度：HANDOFF 第 13 節步驟 1–9 已完成；有號金額與收入；`/month`、查詢過去的週/月、每日明細、每月月報；伺服器更新用 `deploy.sh`。
> 第 1–4 節不需要 Discord 就能驗證；第 5 節以後需要先完成 README 的 Developer Portal 設定。

所有指令都在專案根目錄 `/home/latuuu/DIT/Coinslot` 執行。

## 0. 前置

```bash
node -v          # 應為 v24.x
npm install      # 第一次或 package.json 有變動時
```

> **本機執行時 `DB_PATH` 的注意事項**：`.env` 若寫 `DB_PATH=/data/coinslot.db`，本機沒有權限建立 `/data`。
> 本機請改成 `DB_PATH=./data/coinslot.db`（Docker 會自動改用 `/data/coinslot.db`，不受 `.env` 影響），
> 或在指令前加 `DB_PATH=./data/coinslot.db` 臨時覆蓋。

## 1. 自動檢查（一次跑完）

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
```

預期：每一段都沒有錯誤，最後看到

```
Test Files  12 passed (12)
     Tests  157 passed (157)
```

| 測試檔 | 驗證內容 |
|---|---|
| `test/config.test.ts` | 環境變數預設值、格式錯誤時的訊息 |
| `test/parse.test.ts` | HANDOFF 4.1 所有範例、全形、千分位、各種拒絕情況 |
| `test/period-lookup.test.ts` | 月份區間、閏年、`/week N`／`/month N` 的查詢與跨年規則、第 53 週 |
| `test/format-period.test.ts` | 週／月標題、每日明細、月報、長訊息切段（含一整個月 150 筆） |
| `test/period.test.ts` | 台北時間跨日、跨週邊界（在洛杉磯時區下執行，確認不受容器 TZ 影響） |
| `test/repository.test.ts` | SQLite 寫入、有號金額、`amount = 0` 被拒、軟刪除、區間查詢 |
| `test/migrations.test.ts` | 舊資料正數 → 負數、重複執行不出錯、執行前備份、失敗會 rollback |
| `test/stats.test.ts` | 支出／收入／淨額合計、備註正規化與分組、Top spending 排序 |
| `test/ledger.test.ts` | 記帳（支出與收入）、撤銷、今日、本週、週報、收入也算「今天有紀錄」 |
| `test/format.test.ts` | 金額格式、合計、`×n`、`(no note)`、規格中的範例輸出、CSV |
| `test/access.test.ts` | 白名單：只處理擁有者在記帳頻道或私訊的訊息 |
| `test/jobs.test.ts` | 提醒是否該發、週報內容、cron 時區、備份與保留 14 份、心跳 |

想只跑某一個檔案或邊改邊測：

```bash
npx vitest run test/parse.test.ts
npm run test:watch
```

## 2. 互動式 Playground（不需要 Discord）

Playground 直接呼叫解析器和 ledger 核心，不需要 `.env`。

```bash
npm run playground                         # 資料存在記憶體，離開就消失
npm run playground -- ./data/play.db       # 資料存成檔案（先 mkdir -p data）
```

### 可用指令

| 輸入 | 作用 |
|---|---|
| `午餐 -120`、`+500 薪水` 等任何文字 | 當作記帳，成功回 `Logged 午餐 -$120`／`Logged 薪水 +$500`，失敗回 `Rejected: <原因>` |
| `/parse <文字>` | 只解析、不存檔 |
| `/now <時間>` | 假裝現在是某個時間，例如 `/now 2026-09-27T23:59+08:00` |
| `/now` | 回到真實時間 |
| `/range` | 顯示「今天」「本週」對應的 UTC 範圍 |
| `/undo` `/today` `/report` | 輸出和 Discord 上看到的完全相同 |
| `/week [n] [-a]` | 等同 `/week week:n detail:True`，例如 `/week 36 -a` |
| `/month [n] [-a]` | 等同 `/month month:n detail:True`，例如 `/month 9 -a` |
| `/mreport` | 月報（以 `/now` 設定的時間為準，報上個月） |
| `/all` | 原始資料列（有號金額、UTC 時間） |
| `/help` `/quit` | 說明、離開 |

### 建議的驗證流程

```bash
printf '%s\n' \
  '/now 2026-09-26T23:50+08:00' \
  '-60 宵夜' \
  '/now 2026-09-27T00:10+08:00' \
  '午餐 -１２０' \
  '-1,200 耳機' \
  '午餐  -80' \
  '+500 薪水' \
  '今天好累' \
  '+0 薪水' \
  '/today' \
  '/week' \
  '/undo' \
  '/report' \
  '/quit' | npm run -s playground
```

預期輸出（節錄）：

```
> Logged 午餐 -$80
> Logged 薪水 +$500
> Rejected: no_amount
> Rejected: invalid_amount
> Today: 4 entries · Spent -$1,400 · Earned +$500 · Net -$900

00:10 午餐 -$120
00:10 耳機 -$1,200
00:10 午餐 -$80
00:10 薪水 +$500
> This week · W39 (9/21–9/27)
5 entries · Spent -$1,460 · Earned +$500 · Net -$960

Top spending
耳機 -$1,200
午餐 ×2 -$200
宵夜 -$60
> Undid 薪水 +$500
> **Weekly report · W39 (9/21–9/27)**
4 entries · Spent -$1,460
Last week: no spending

Top spending
耳機 -$1,200
午餐 ×2 -$200
宵夜 -$60
```

確認重點：

1. 宵夜記在 9/26 23:50，算前一天 → `/today` 只有 4 筆；但同一週 → `/week` 有 5 筆。
2. 兩筆「午餐」合併成 `午餐 ×2 -$200`。
3. `+500 薪水` 記成收入：合計多出 `Earned +$500 · Net …`，但**不會**出現在 Top spending。
4. `/undo` 刪掉最後一筆（薪水）後，週報沒有收入，所以不再顯示 `Earned`／`Net`。
5. `+0 薪水` 被拒絕（金額必須 1～10,000,000）。

### 查詢過去的週／月與明細

```bash
printf '%s\n' \
  '/now 2026-08-20T12:00+08:00' '-1,500 八月房租' \
  '/now 2026-09-01T09:00+08:00' '-1,500 房租' \
  '/now 2026-09-03T10:00+08:00' '修腳踏車 -1,750' \
  '/now 2026-09-05T12:05+08:00' '麥當勞 -119' \
  '/now 2026-09-05T18:40+08:00' '麥當勞 -119' \
  '/now 2026-09-30T09:00+08:00' '+42,000 薪水' \
  '/now 2026-10-12T08:10+08:00' '咖啡 -65' \
  '/now 2026-10-13T12:05+08:00' '午餐 -120' \
  '/now 2026-10-13T20:00+08:00' '+500 發票中獎' \
  '/week' '/week 36 -a' '/week 45' '/week 53' '/month' '/month 9 -a' '/month 12' \
  '/now 2026-10-01T21:00+08:00' '/mreport' '/quit' | npm run -s playground
```

預期輸出（節錄）：

```
> This week · W42 (10/12–10/18)
3 entries · Spent -$185 · Earned +$500 · Net +$315
...
> W36 (8/31–9/6)
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
> W45 2025 (11/3–11/9)
Nothing logged yet.
> 2025 has no week 53.
> This month · Oct 2026
...
> Sep 2026
5 entries · Spent -$3,488 · Earned +$42,000 · Net +$38,512
...
Wed 9/30 · 1 entry · Spent $0 · Earned +$42,000 · Net +$42,000
09:00 薪水 +$42,000
> Dec 2025
Nothing logged yet.
> **Monthly report · Sep 2026**
5 entries · Spent -$3,488 · Earned +$42,000 · Net +$38,512
Previous month: Spent -$1,500 · Change -$1,988 (spent more)
...
```

確認重點：

1. 本週標題有週數（`W42`）；過去的週沒有 `This week`。
2. `-a`（Discord 上是 `detail:True`）會依日期分段，沒有紀錄的日子不列；8/20 的八月房租不在第 36 週（8/31 起）。
3. 現在是 10 月，`/week 45`、`/month 12` 還沒開始 → 改查 2025 年，標題標出年份。
4. 2025 年只有 52 週 → `2025 has no week 53.`
5. 月報報的是上個月（9 月），和 8 月的支出比較。
6. 明細很長時，playground 會顯示 `--- message 1/2 ---` 這樣的分隔，等同 Discord 上拆成的多則訊息。

### 解析器檢查清單

| 輸入 | 預期 |
|---|---|
| `-120 午餐` / `午餐 -120` / `120 午餐` | `amount: -120, note: '午餐'` |
| `-1,200 耳機` | `amount: -1200` |
| `-120元 早餐` | `amount: -120, note: '早餐'` |
| `-１２０ 午餐`、`－１，２００　耳機`（全形） | 正常解析 |
| `-50 7-11 咖啡` | `amount: -50, note: '7-11 咖啡'` |
| `-120` | `amount: -120, note: ''`（允許沒有備註） |
| `今天好累`、`午餐 吃了 -120 元`、`-12.5 咖啡`、`-1,20 午餐` | `reason: 'no_amount'` |
| `+500 薪水` / `薪水 +500` / `＋５００ 薪水`（全形） | `amount: 500, note: '薪水'`（收入） |
| `2 張發票 +400` | `amount: 400, note: '2 張發票'`（有正負號的一端優先） |
| `-0 午餐`、`+0 薪水`、`-10,000,001 車`、`+10,000,001 x` | `reason: 'invalid_amount'` |

### 時間邊界檢查清單

| 設定時間（台北） | `/range` 預期 |
|---|---|
| `/now 2026-09-27T00:00+08:00` | today.start = `2026-09-26T16:00:00.000Z` |
| `/now 2026-09-27T23:59+08:00`（週日） | week.start = `2026-09-20T16:00:00.000Z`（仍是本週） |
| `/now 2026-09-28T00:30+08:00`（週一） | week.start = `2026-09-27T16:00:00.000Z`（新的一週） |

## 3. 直接查看資料庫

本機沒有安裝 `sqlite3` CLI，用 Node 查看：

```bash
node -e "const D=require('better-sqlite3');const db=new D('./data/coinslot.db',{readonly:true});console.table(db.prepare('SELECT * FROM entries').all())"
```

（查 playground 的資料就把路徑換成 `./data/play.db`。）

確認：

- `amount` 是有號整數：支出為**負數**，而且不會是 0
- `created_at` 是 UTC 並以 `Z` 結尾
- `/undo` 過的那筆 `deleted_at` 有值，但資料列還在（軟刪除）
- `source`：純文字為 `text`、`/log` 為 `slash`

### Migration 紀錄

```bash
node -e "const D=require('better-sqlite3');const db=new D('./data/coinslot.db',{readonly:true});console.table(db.prepare('SELECT * FROM schema_migrations').all())"
```

預期：有 `001_initial` 和 `002_signed_amounts` 兩列。

### 在複本上試跑 migration（不動原檔）

```bash
mkdir -p /tmp/coinslot-mig && cp data/coinslot.db /tmp/coinslot-mig/
npx tsx -e "import { openDatabase } from './src/db/repository.ts'; const db = openDatabase('/tmp/coinslot-mig/coinslot.db', { onMigrated: (r) => console.log(r) }); console.table(db.prepare('SELECT id, amount, note FROM entries').all())"
ls /tmp/coinslot-mig/backups
```

預期：

- 第一次執行：印出 `applied: ['001_initial', '002_signed_amounts']` 與 `backupFile`；表格裡的金額變成負數；`backups/` 出現 `pre-migration-*.db`。
- 同一個指令再跑一次：不會印出 migration 結果，金額也**不會**被翻回正數。
- 驗證完：`rm -rf /tmp/coinslot-mig`

真正的資料庫會在 bot 啟動時自動轉換，log 會出現 `Applied migrations 001_initial, 002_signed_amounts; backup: ...`。

## 4. 設定檢查（不會印出 token）

```bash
npx tsx -e "import {loadDotEnv} from './src/env.ts'; import {loadConfig} from './src/config.ts'; loadDotEnv(); try { const c = loadConfig(); console.log('OK', { timezone: c.timezone, reminder: c.reminderTime, weekly: c.weeklyReport, dbPath: c.dbPath, heartbeat: !!c.uptimeKumaPushUrl }) } catch (e) { console.log(e.message) }"
```

預期：印出 `OK { ... }`。若有錯，會列出哪個變數、錯在哪裡。

## 5. Discord 連線（步驟 5–6）

### 5.1 註冊指令

```bash
npm run register
```

| 結果 | 意思 / 處理 |
|---|---|
| `Registered 6 guild commands: /log /undo /today /week /month /export` | 成功 |
| `Missing Access ...` 並附一個邀請網址 | bot 還沒加入私人伺服器，或 `GUILD_ID` 錯了 → 開那個網址把 bot 加進去 |
| `Unauthorized ...` | `DISCORD_TOKEN` 錯誤 → 到 Developer Portal 重設 |

### 5.2 啟動 bot

> ⚠️ **先確認 Proxmox 上的 bot 已停止**（在 LXC 上 `docker compose stop`），或改用另一個測試用 application 的 token。
> 同一個 token 同時跑兩個 bot，兩邊都會回應，看到的格式可能是舊版的，紀錄也會分散在兩個資料庫。
> 本機測完記得停掉（`Ctrl+C`；用 Docker 跑的話 `docker compose down`），再到 LXC `docker compose start`。

```bash
DB_PATH=./data/coinslot.db npm run dev
```

預期 log：

```
... Applied migrations 001_initial, 002_signed_amounts; backup: data/backups/pre-migration-....db   ← 只有第一次
... Logged in as Coinslot#xxxx
... Scheduled reminder: next run 2026-...
... Scheduled weekly-report: next run 2026-...
... Scheduled backup: next run 2026-...
```

若看到 `Message Content Intent is not enabled` → Developer Portal → Bot → 開啟 **Message Content Intent**。

### 5.3 純文字記帳

| 在哪裡、做什麼 | 預期 |
|---|---|
| 記帳頻道輸入 `午餐 -120` | bot 回覆 `Logged 午餐 -$120`（不會 ping 你） |
| 記帳頻道輸入 `-１，２００ 耳機` | `Logged 耳機 -$1,200` |
| 記帳頻道輸入 `今天好累` | 訊息被加上 ❓，bot 不回話 |
| 記帳頻道輸入 `+500 薪水` | `Logged 薪水 +$500`；之後 `/today` 出現 `Earned +$500 · Net …` |
| 記帳頻道輸入 `+0 薪水` | `Amount must be $1–$10,000,000.` |
| **其他頻道**輸入 `午餐 -120` | 沒有任何反應 |
| **私訊 bot** 輸入 `-85 飲料` | `Logged 飲料 -$85` |
| 輸入 `-50 @everyone` | 回覆裡有 `@everyone` 字樣，但**不會**真的通知任何人 |
| 請別人（或分身帳號）在記帳頻道輸入 | 沒有反應 |

### 5.4 Slash commands（回覆都只有你看得到）

| 指令 | 預期 |
|---|---|
| `/log text:早餐 -60` | `Logged 早餐 -$60` |
| `/today` | 第一行 `Today: N entries · Spent -$…`，空一行後每筆一行 `HH:mm 備註 -$金額` |
| `/week` | `This week · W<週數> (M/D–M/D)`、合計一行、空一行、`Top spending` 與最多三行 |
| `/week week:18` | `W18 (4/27–5/3)` 與該週的合計（沒有 `This week`） |
| `/week week:18 detail:True` | 摘要之後，每天一段：`Mon 4/27 · N entries · Spent …`，下面每筆一行 |
| `/week week:53` | 今年還沒到第 53 週 → 查去年；去年沒有第 53 週 → `2025 has no week 53.` |
| `/month` | `This month · Oct 2026`、合計、`Top spending` 最多五行 |
| `/month month:9 detail:True` | `Sep 2026` 與 9 月每天的明細；太長時拆成多則訊息（都只有你看得到） |
| `/month month:12`（在 12 月以前） | 查去年 12 月，標題 `Dec 2025` |
| `/undo` | `Undid 早餐 -$60`；再跑一次 `/today` 應該少一筆 |
| `/export` | 附上 `coinslot-YYYYMMDD.csv`，Excel 打開中文不亂碼；`amount` 是 `-60` 這種純數字 |

同一個備註記兩次（例如兩次 `麥當勞 -119`）後，`/week` 應出現 `麥當勞 ×2 -$238`。
| 別人使用任一指令 | `Not authorized.` |

## 6. 排程（步驟 7）

排程時間不想等的話，可以暫時把 `.env` 的時間改成 1–2 分鐘後再重啟 bot，驗證完記得改回來：

```bash
# 例：現在是 18:03（台北時間）
REMINDER_TIME=18:05 WEEKLY_REPORT='SAT 18:05' MONTHLY_REPORT='13 18:05' DB_PATH=./data/coinslot.db npm run dev
```

（命令列上的值會蓋過 `.env`；`WEEKLY_REPORT` 的星期、`MONTHLY_REPORT` 的日期都要填今天，`MONTHLY_REPORT` 的日期只能 1–28。）

| 情境 | 預期 |
|---|---|
| 今天**沒有**紀錄，到了提醒時間 | 記帳頻道出現 `@你 Nothing logged today. Spent it? Slot it.`，而且真的收到通知；log 顯示 `Reminder sent` |
| 今天**已有**紀錄，到了提醒時間 | 不發訊息；log 顯示 `Reminder skipped (already logged today)` |
| 到了週報時間 | 記帳頻道出現 `**Weekly report · W<週數> (M/D–M/D)**`、合計、`Last week: Spent …`、`Top spending`（每項一行） |
| 到了月報時間 | 記帳頻道出現 `**Monthly report · <上個月>**`、合計、`Previous month: Spent …`、`Top spending`（最多五行） |

## 7. 備份與心跳（步驟 8）

備份預設每天 04:00 執行。想立即測試：

```bash
npx tsx -e "import {openDatabase} from './src/db/repository.ts'; import {backupDatabase} from './src/jobs/backup.ts'; const db = openDatabase('./data/coinslot.db'); backupDatabase(db, './data/backups', new Date(), 'Asia/Taipei').then(console.log)"
ls data/backups
```

預期：`data/backups/coinslot-YYYY-MM-DD.db` 出現，且可以用第 3 節的指令打開（路徑換成備份檔）。

心跳：設定 `UPTIME_KUMA_PUSH_URL` 後啟動 bot，Uptime Kuma 的 Push 監控應在 1 分鐘內變成綠色；停掉 bot 後，超過心跳間隔會變紅。

## 8. Docker（步驟 8）

```bash
docker compose build
mkdir -p data
docker compose run --rm coinslot node dist/discord/register.js
docker compose up -d
docker compose logs -f           # 看到 Logged in as ... 即成功，Ctrl+C 離開 log
```

檢查：

- `docker compose ps` 狀態為 `running`
- 在 Discord 記一筆後，`ls data/` 有 `coinslot.db`，而且擁有者是 uid 1000
- `docker compose restart` 後 `/today` 的資料還在（資料有存到 volume）
- `docker compose down` 停止

若 log 出現 `SQLITE_CANTOPEN` 或 permission denied：`sudo chown 1000:1000 data`。

### 8.1 用 `deploy.sh` 更新（在 LXC 上）

```bash
cd /opt/coinslot
./deploy.sh --help     # 看選項
./deploy.sh            # 更新
```

| 情境 | 預期 |
|---|---|
| 正在跑的已經是最新 commit | `OK Already deployed: <hash> <訊息>`，bot 不會重啟 |
| 先手動 `git pull` 過，但容器還是舊版 | `==> Running <舊 hash>, deploying <新 hash>`，照常重建 |
| 容器是用 `deploy.sh` 以外的方式啟動的（沒有版本標籤） | `==> Running version unknown ...`，照常重建 |
| 有新 commit | 列出 `Incoming commits:`，依序 build → 停止 → 備份 → 啟動，最後 `OK Deployed ...` |
| 這次的更新含 migration（例如第一次從正數金額升級） | 多印一行 `Applied migrations ...; backup: /data/backups/pre-migration-....db` |
| `src/discord/commands/` 有改 | 出現 `Slash command definitions changed` 與 `Slash commands re-registered` |
| 在伺服器上改過程式檔 | `FAIL tracked files were edited on the server ...`，什麼都不會動 |
| build 失敗 | `WARN Build failed; the running bot was not touched.`，舊 bot 繼續運作，並印出回復指令 |
| bot 啟動失敗（例如 token 錯） | `WARN The bot failed to start.`、最近的 log、回復指令（含還原資料庫） |

更新後確認版本與資料：

- `docker inspect coinslot -f '{{ index .Config.Labels "coinslot.revision" }}'` 等於 `git rev-parse HEAD`
- Discord 上 `/today` 是新格式（例如 `Today: 2 entries · Spent -$281`）；若仍是舊格式，檢查是否還有其他地方在跑同一個 bot
- `ls data/backups/` 多一個 `manual-<時間>/`，裡面有 `coinslot.db`
- 更新前的紀錄還在：用 `/week` 或下一節的指令確認（`/today` 只列**今天**的紀錄，過了午夜就看不到昨天的）

### 8.2 在 LXC 上直接查資料庫

Discord 上看不到預期的紀錄時，用這些指令直接看伺服器上的資料庫。全部是**唯讀**，bot 可以繼續跑。
指令透過容器裡的 Node 執行（LXC 上不用另外裝 sqlite3），所以 bot 要在執行中（`docker compose ps` 狀態為 `running`）。

```bash
cd /opt/coinslot
```

**列出所有紀錄**（含已撤銷的，時間換算成台北時間）：

```bash
docker compose exec coinslot node -e "const D=require('better-sqlite3');const db=new D('/data/coinslot.db',{readonly:true});console.table(db.prepare(\"SELECT id,amount,note,source,datetime(created_at,'+8 hours') AS taipei,deleted_at FROM entries ORDER BY id\").all())"
```

**每天的筆數與合計**（不含已撤銷）：

```bash
docker compose exec coinslot node -e "const D=require('better-sqlite3');const db=new D('/data/coinslot.db',{readonly:true});console.table(db.prepare(\"SELECT date(created_at,'+8 hours') AS day,COUNT(*) AS n,SUM(CASE WHEN amount<0 THEN amount ELSE 0 END) AS spent,SUM(CASE WHEN amount>0 THEN amount ELSE 0 END) AS earned FROM entries WHERE deleted_at IS NULL GROUP BY day ORDER BY day\").all())"
```

**已套用的 migration**：

```bash
docker compose exec coinslot node -e "const D=require('better-sqlite3');const db=new D('/data/coinslot.db',{readonly:true});console.table(db.prepare('SELECT * FROM schema_migrations').all())"
```

**備份檔**：

```bash
ls -la data/backups/
```

範例輸出（列出所有紀錄）：

```
┌─────────┬────┬────────┬──────────┬────────┬───────────────────────┬────────────┐
│ (index) │ id │ amount │ note     │ source │ taipei                │ deleted_at │
├─────────┼────┼────────┼──────────┼────────┼───────────────────────┼────────────┤
│ 0       │ 1  │ -162   │ '肯德基' │ 'text' │ '2026-09-26 21:46:36' │ null       │
│ 1       │ 2  │ -119   │ '麥當勞' │ 'text' │ '2026-09-26 23:21:51' │ null       │
└─────────┴────┴────────┴──────────┴────────┴───────────────────────┴────────────┘
```

怎麼判讀：

| 看到的結果 | 意思 |
|---|---|
| 有紀錄，金額是 `-162` 這種負數 | 資料都在，migration 也已套用；Discord 看不到多半是查的區間不對（例如過了午夜用 `/today`） |
| 有紀錄，但金額是正數 | migration 沒跑：bot 可能還是舊版，確認 `docker inspect` 的 revision（8.1 節）後重跑 `./deploy.sh` |
| `deleted_at` 有值 | 那筆被 `/undo` 撤銷了，統計不會算它 |
| 表格是空的 | 伺服器上沒有這些紀錄。若之前曾在本機跑過 bot，紀錄可能只存在本機的 `data/coinslot.db`，**不要**直接用本機的檔案覆蓋伺服器的 |
| `service "coinslot" is not running` | bot 沒在跑；先 `docker compose up -d`，或改用下面「bot 停止時」的指令 |

bot 停止時，改用一次性的容器查詢（同樣唯讀）：

```bash
docker compose run --rm --no-deps coinslot node -e "const D=require('better-sqlite3');const db=new D('/data/coinslot.db',{readonly:true});console.table(db.prepare(\"SELECT id,amount,note,datetime(created_at,'+8 hours') AS taipei,deleted_at FROM entries ORDER BY id\").all())"
```

## 9. 已知限制

- `/log` 的 autocomplete（常用 note 建議）未實作，是 HANDOFF 列的加分項。
- slash commands 只註冊在私人伺服器（未啟用 User Install），所以**私訊中只能用純文字記帳**，不能用 `/` 指令。
