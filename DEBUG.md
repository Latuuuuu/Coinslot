# Coinslot 手動驗證指南

> 最後更新：2026-09-26
> 目前進度：HANDOFF 第 13 節步驟 1–9 已完成；金額為有號整數（支出負、收入正），可以用 `+` 記收入；伺服器更新用 `deploy.sh`。
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
Test Files  10 passed (10)
     Tests  117 passed (117)
```

| 測試檔 | 驗證內容 |
|---|---|
| `test/config.test.ts` | 環境變數預設值、格式錯誤時的訊息 |
| `test/parse.test.ts` | HANDOFF 4.1 所有範例、全形、千分位、各種拒絕情況 |
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
| `/undo` `/today` `/week` `/report` | 輸出和 Discord 上看到的完全相同 |
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
> This week (9/21–9/27)
5 entries · Spent -$1,460 · Earned +$500 · Net -$960

Top spending
耳機 -$1,200
午餐 ×2 -$200
宵夜 -$60
> Undid 薪水 +$500
> **Weekly report 9/21–9/27**
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
| `Registered 5 guild commands: /log /undo /today /week /export` | 成功 |
| `Missing Access ...` 並附一個邀請網址 | bot 還沒加入私人伺服器，或 `GUILD_ID` 錯了 → 開那個網址把 bot 加進去 |
| `Unauthorized ...` | `DISCORD_TOKEN` 錯誤 → 到 Developer Portal 重設 |

### 5.2 啟動 bot

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
| `/week` | `This week (M/D–M/D)`、合計一行、空一行、`Top spending` 與最多三行 |
| `/undo` | `Undid 早餐 -$60`；再跑一次 `/today` 應該少一筆 |
| `/export` | 附上 `coinslot-YYYYMMDD.csv`，Excel 打開中文不亂碼；`amount` 是 `-60` 這種純數字 |

同一個備註記兩次（例如兩次 `麥當勞 -119`）後，`/week` 應出現 `麥當勞 ×2 -$238`。
| 別人使用任一指令 | `Not authorized.` |

## 6. 排程（步驟 7）

排程時間不想等的話，可以暫時把 `.env` 的時間改成 1–2 分鐘後再重啟 bot，驗證完記得改回來：

```bash
# 例：現在是 18:03（台北時間）
REMINDER_TIME=18:05 WEEKLY_REPORT='SAT 18:05' DB_PATH=./data/coinslot.db npm run dev
```

（命令列上的值會蓋過 `.env`；`WEEKLY_REPORT` 的星期要填今天。）

| 情境 | 預期 |
|---|---|
| 今天**沒有**紀錄，到了提醒時間 | 記帳頻道出現 `@你 Nothing logged today. Spent it? Slot it.`，而且真的收到通知；log 顯示 `Reminder sent` |
| 今天**已有**紀錄，到了提醒時間 | 不發訊息；log 顯示 `Reminder skipped (already logged today)` |
| 到了週報時間 | 記帳頻道出現 `**Weekly report M/D–M/D**`、合計、`Last week: Spent …`、`Top spending`（每項一行） |

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
| GitHub 上沒有新 commit | `OK Already up to date: <hash> <訊息>`，bot 不會重啟 |
| 有新 commit | 列出 `Incoming commits:`，依序 build → 停止 → 備份 → 啟動，最後 `OK Deployed ...` |
| 這次的更新含 migration（例如第一次從正數金額升級） | 多印一行 `Applied migrations ...; backup: /data/backups/pre-migration-....db` |
| `src/discord/commands/` 有改 | 出現 `Slash command definitions changed` 與 `Slash commands re-registered` |
| 在伺服器上改過程式檔 | `FAIL tracked files were edited on the server ...`，什麼都不會動 |
| build 失敗 | `WARN Build failed; the running bot was not touched.`，舊 bot 繼續運作，並印出回復指令 |
| bot 啟動失敗（例如 token 錯） | `WARN The bot failed to start.`、最近的 log、回復指令（含還原資料庫） |

更新後確認資料還在：

- `ls data/backups/` 多一個 `manual-<時間>/`，裡面有 `coinslot.db`
- Discord 上 `/today`、`/week` 仍看得到更新前的紀錄

## 9. 已知限制

- `/log` 的 autocomplete（常用 note 建議）未實作，是 HANDOFF 列的加分項。
- slash commands 只註冊在私人伺服器（未啟用 User Install），所以**私訊中只能用純文字記帳**，不能用 `/` 指令。
