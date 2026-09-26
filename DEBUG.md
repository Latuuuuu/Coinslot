# Coinslot 手動驗證指南

> 最後更新：2026-09-26
> 目前進度：HANDOFF 第 13 節步驟 1–4（專案骨架、解析器、台北時間區間、資料層與 ledger）。
> Discord、排程、Docker 還沒做，所以**現在還不能在 Discord 上測試**。以下全部在本機終端機執行。

所有指令都在專案根目錄 `/home/latuuu/DIT/Coinslot` 執行。

## 0. 前置

```bash
node -v          # 應為 v24.x
npm install      # 第一次或 package.json 有變動時
```

## 1. 自動檢查（一次跑完）

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
```

預期：每一段都沒有錯誤，最後看到

```
Test Files  5 passed (5)
     Tests  47 passed (47)
```

| 測試檔 | 驗證內容 |
|---|---|
| `test/config.test.ts` | 環境變數預設值、格式錯誤時的訊息 |
| `test/parse.test.ts` | HANDOFF 4.1 所有範例、全形、千分位、各種拒絕情況 |
| `test/period.test.ts` | 台北時間跨日、跨週邊界（在洛杉磯時區下執行，確認不受容器 TZ 影響） |
| `test/repository.test.ts` | SQLite 寫入、軟刪除、區間查詢 |
| `test/ledger.test.ts` | 記帳、撤銷、今日、本週、週報與上週比較 |

想只跑某一個檔案或邊改邊測：

```bash
npx vitest run test/parse.test.ts
npm run test:watch
```

## 2. 互動式 Playground（最主要的人工驗證方式）

Playground 不需要 Discord，也不需要 `.env`，直接呼叫解析器和 ledger 核心。

```bash
npm run playground                         # 資料存在記憶體，離開就消失
npm run playground -- ./data/play.db       # 資料存成檔案，可重複開啟（data/ 已被 .gitignore 排除）
```

> 用檔案模式前請先 `mkdir -p data`。

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

把下面整段貼進 playground，或直接用管線一次跑完：

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

用 `/parse` 逐一確認：

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

本機沒有安裝 `sqlite3` CLI，可以用 Node 查看檔案模式產生的資料庫：

```bash
node -e "const D=require('better-sqlite3');const db=new D('./data/play.db',{readonly:true});console.table(db.prepare('SELECT * FROM entries').all())"
```

確認：

- `amount` 是正整數
- `created_at` 是 UTC 並以 `Z` 結尾
- `/undo` 過的那筆 `deleted_at` 有值，而且沒有真的被刪掉（軟刪除）
- `source` 是 `text`

## 4. 環境變數驗證

目前還沒有主程式會讀 `.env`，可以直接呼叫 `loadConfig` 看錯誤訊息：

```bash
npx tsx -e "import {loadConfig} from './src/config.ts'; try { loadConfig({ DISCORD_TOKEN: 'x', DISCORD_APP_ID: '1', GUILD_ID: '223456789012345678', LEDGER_CHANNEL_ID: '323456789012345678', OWNER_USER_ID: '423456789012345678', REMINDER_TIME: '25:00' }) } catch (e) { console.log(e.message) }"
```

預期：

```
Invalid environment configuration:
  DISCORD_APP_ID: must be a Discord snowflake ID
  REMINDER_TIME: must be HH:MM (24h)
```

## 5. Production build

```bash
npm run build && ls dist/db/schema.sql && rm -rf dist
```

預期：build 沒有錯誤，而且 `dist/db/schema.sql` 存在（程式執行時要讀它建表）。

## 6. 目前還不能驗證的項目

| 項目 | 對應步驟 |
|---|---|
| Discord 純文字記帳、私訊 | 5 |
| Slash commands、`/export` CSV | 6 |
| 每晚提醒、週報排程 | 7 |
| Docker、備份、心跳 | 8 |

每做完一個步驟，這份文件會補上對應的驗證方式。
