# Coinslot 手動驗證指南

> 最後更新：2026-09-26
> 目前進度：HANDOFF 第 13 節步驟 1–9 的程式碼都已完成。
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
Test Files  8 passed (8)
     Tests  70 passed (70)
```

| 測試檔 | 驗證內容 |
|---|---|
| `test/config.test.ts` | 環境變數預設值、格式錯誤時的訊息 |
| `test/parse.test.ts` | HANDOFF 4.1 所有範例、全形、千分位、各種拒絕情況 |
| `test/period.test.ts` | 台北時間跨日、跨週邊界（在洛杉磯時區下執行，確認不受容器 TZ 影響） |
| `test/repository.test.ts` | SQLite 寫入、軟刪除、區間查詢 |
| `test/ledger.test.ts` | 記帳、撤銷、今日、本週、週報與上週比較 |
| `test/format.test.ts` | 所有回覆文字、週報、CSV（含 Excel 公式注入防護） |
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
| `午餐 -120` 等任何文字 | 當作記帳，成功回 `Logged 午餐 -120`，失敗回 `Rejected: <原因>` |
| `/parse <文字>` | 只解析、不存檔 |
| `/now <時間>` | 假裝現在是某個時間，例如 `/now 2026-09-27T23:59+08:00` |
| `/now` | 回到真實時間 |
| `/range` | 顯示「今天」「本週」對應的 UTC 範圍 |
| `/undo` `/today` `/week` `/report` `/all` | 對應 ledger 的撤銷、今日、本週、週報、全部 |
| `/help` `/quit` | 說明、離開 |

### 建議的驗證流程

```bash
printf '%s\n' \
  '/now 2026-09-26T23:50+08:00' \
  '-60 宵夜' \
  '/now 2026-09-27T00:10+08:00' \
  '午餐 -１２０' \
  '-1,200 耳機' \
  '今天好累' \
  '+500 薪水' \
  '/today' \
  '/week' \
  '/undo' \
  '/report' \
  '/quit' | npm run -s playground
```

預期重點：

1. `宵夜` 記在 9/26 23:50，`午餐` 和 `耳機` 記在 9/27 00:10 → `/today` 只有 **2 筆、合計 1320**（宵夜算前一天）。
2. 9/26（六）和 9/27（日）屬於同一週 → `/week` 有 **3 筆、合計 1380**，最大的是耳機 1200。
3. `今天好累` → `Rejected: no_amount`；`+500 薪水` → `Rejected: invalid_amount`（MVP 不記收入）。
4. `/undo` 刪掉最後一筆（耳機）→ `/report` 的 `total` 變成 **180**。

### 解析器檢查清單

| 輸入 | 預期 |
|---|---|
| `-120 午餐` / `午餐 -120` / `120 午餐` | `amount: 120, note: '午餐'` |
| `-1,200 耳機` | `amount: 1200` |
| `-120元 早餐` | `amount: 120, note: '早餐'` |
| `-１２０ 午餐`、`－１，２００　耳機`（全形） | 正常解析 |
| `-50 7-11 咖啡` | `amount: 50, note: '7-11 咖啡'` |
| `-120` | `amount: 120, note: ''`（允許沒有備註） |
| `今天好累`、`午餐 吃了 -120 元`、`-12.5 咖啡`、`-1,20 午餐` | `reason: 'no_amount'` |
| `-0 午餐`、`+500 薪水`、`-10,000,001 車` | `reason: 'invalid_amount'` |

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

- `amount` 是正整數
- `created_at` 是 UTC 並以 `Z` 結尾
- `/undo` 過的那筆 `deleted_at` 有值，但資料列還在（軟刪除）
- `source`：純文字為 `text`、`/log` 為 `slash`

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
... Logged in as Coinslot#xxxx
... Scheduled reminder: next run 2026-...
... Scheduled weekly-report: next run 2026-...
... Scheduled backup: next run 2026-...
```

若看到 `Message Content Intent is not enabled` → Developer Portal → Bot → 開啟 **Message Content Intent**。

### 5.3 純文字記帳

| 在哪裡、做什麼 | 預期 |
|---|---|
| 記帳頻道輸入 `午餐 -120` | bot 回覆 `Logged 午餐 -120`（不會 ping 你） |
| 記帳頻道輸入 `-１，２００ 耳機` | `Logged 耳機 -1,200` |
| 記帳頻道輸入 `今天好累` | 訊息被加上 ❓，bot 不回話 |
| 記帳頻道輸入 `+500 薪水` | `Amount must be 1–10,000,000 (expenses only).` |
| **其他頻道**輸入 `午餐 -120` | 沒有任何反應 |
| **私訊 bot** 輸入 `-85 飲料` | `Logged 飲料 -85` |
| 輸入 `-50 @everyone` | 回覆裡有 `@everyone` 字樣，但**不會**真的通知任何人 |
| 請別人（或分身帳號）在記帳頻道輸入 | 沒有反應 |

### 5.4 Slash commands（回覆都只有你看得到）

| 指令 | 預期 |
|---|---|
| `/log text:早餐 -60` | `Logged 早餐 -60` |
| `/today` | `Today: N entries, 合計`，下面列出每筆的台北時間 |
| `/week` | `This week (M/D–M/D): ...` 與 `Top:` 最大三筆 |
| `/undo` | `Undid 早餐 -60`；再跑一次 `/today` 應該少一筆 |
| `/export` | 附上 `coinslot-YYYYMMDD.csv`，用 Excel 打開中文不會亂碼 |
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
| 到了週報時間 | 記帳頻道出現 `**Weekly report M/D–M/D**`、合計、與上週比較、`Top:` |

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

## 9. 已知限制

- `/log` 的 autocomplete（常用 note 建議）未實作，是 HANDOFF 列的加分項。
- slash commands 只註冊在私人伺服器（未啟用 User Install），所以**私訊中只能用純文字記帳**，不能用 `/` 指令。
