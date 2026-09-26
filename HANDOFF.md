# Coinslot 交接文件

> 最後更新：2026-09-26
> 用途：從 claude.ai 的規劃對話交接到 Claude Code 開始實作。開工前請完整讀過一次。

## 1. 專案是什麼

Coinslot 是一個**個人記帳用的 Discord bot**，使用者只有一個人（Latuuu）。目標不是做一個功能完整的記帳軟體，而是讓「記一筆」的成本低到不會再因為懶而放棄。

使用者之前記帳失敗過幾次，原因都是記一筆太麻煩、記了也沒有回饋。所以整個專案的設計原則是：

- **一筆 5 秒內完成**：只輸入「一個關鍵字 + 金額」，例如 `午餐 -120`。分類、付款方式、備註一律不強迫。
- **每週要有回饋**：每週自動發一則摘要，讓記帳有「看得到結果」的感覺。
- **先用再加功能**：MVP 做完後先實際使用兩週，確認習慣養成，才開始擴充。**不要主動加 MVP 範圍外的功能。**

## 2. 已確定的決策

| 項目 | 決定 | 原因 |
|---|---|---|
| 語言 / 框架 | TypeScript + discord.js v14（最新版） | 將來若搬到 Cloudflare Workers，核心邏輯可直接沿用 |
| 連線方式 | Gateway（常駐程式） | 唯一能讀一般訊息、支援純文字 `午餐 -120` 輸入的方式 |
| 部署位置 | DIT Robotics 的 Proxmox，獨立一個 LXC，Docker Compose | 使用者沒有私人常駐機器；Gateway 只需對外連線，不需公開網址或 Cloudflare Tunnel |
| 資料庫 | SQLite（better-sqlite3） | 簡單；Cloudflare D1 也是 SQLite，未來可直接遷移 |
| 隱私 | 只在「只有使用者一人的私人 Discord 伺服器」和「bot 私訊」中使用 | 使用者不希望任何人看到記帳紀錄 |
| 名稱 / 品牌 | Coinslot，標語 “Spent it? Slot it.” | 見第 9 節 |

**未來可能的遷移**：如果之後想把專案做大，可能搬到 Cloudflare Workers + D1 或其他主機。搬到 Workers 代表改成 HTTP Interactions，只能用 slash command、失去純文字輸入。這不是現在要做的事，但架構要讓它可行（見第 5 節）。

## 3. Discord 設定

- **安裝方式**：Guild Install 到使用者的私人伺服器（scope：`bot` + `applications.commands`）。User Install 為選用，打開的話使用者能在任何地方用 `/log`。
- **Privileged Intent**：在 Developer Portal 開啟 **Message Content Intent**，否則讀不到頻道裡的純文字。
- **Gateway intents**：`Guilds`、`GuildMessages`、`MessageContent`、`DirectMessages`。
- **Partials**：必須加 `Partials.Channel`，否則 discord.js 收不到私訊的 `messageCreate`。
- **指令註冊**：
  - 開發期間註冊為私人伺服器的 **guild command**，更新立即生效。
  - 若啟用 User Install，另外註冊 global command，並設定 `setIntegrationTypes(GuildInstall, UserInstall)` 與 `setContexts(Guild, BotDM, PrivateChannel)`。
- **Ephemeral**：在私人伺服器和私訊以外的地方，所有回覆必須是 ephemeral（`flags: MessageFlags.Ephemeral`，新版 discord.js 已不建議用 `ephemeral: true`）。為了簡單，slash command 一律 ephemeral 也可以。
- **白名單**：只處理 `OWNER_USER_ID` 發出的訊息與指令，其他人一律忽略（或回覆 ephemeral 的「無權限」）。

## 4. MVP 功能範圍

### 4.1 純文字記帳

在設定的記帳頻道（`LEDGER_CHANNEL_ID`）或 bot 私訊中，使用者直接打字：

```
-120 午餐
午餐 -120
-1,200 耳機
-85 飲料
-120元 早餐
-１２０ 午餐      ← 全形數字
```

成功時回覆一行，例如：`Logged 午餐 -120`。解析邏輯必須是純函式，並有單元測試涵蓋上面所有範例。

### 4.2 Slash commands

| 指令 | 說明 |
|---|---|
| `/log text:<string>` | 單一文字欄位，內容與純文字輸入相同（`120 午餐`），共用同一個解析器 |
| `/undo` | 軟刪除最後一筆（設定 `deleted_at`），回覆刪了哪一筆 |
| `/today` | 今日筆數與合計，列出今天的每一筆 |
| `/week` | 本週合計、筆數、金額最大的三筆 |
| `/export` | 匯出全部（未刪除）紀錄為 CSV 附件 |

`/log` 的 `text` 可以做 autocomplete，帶出最近常用的 note（加分項，非必要）。

### 4.3 排程

排程時間一律以 **Asia/Taipei** 計算，不依賴容器的 TZ 設定。

- **每晚提醒**（預設 22:00）：如果今天沒有任何紀錄，在記帳頻道發一則提醒並 mention 使用者。今天已經有紀錄就不發。
- **週報**（預設週日 21:00）：本週合計、筆數、金額最大的三筆、與上週合計的比較。

提醒和週報發到私人伺服器的記帳頻道即可，不需要私訊。

## 5. 架構

核心原則：**業務邏輯不依賴 Discord**。Discord 那層只負責收訊息、呼叫核心、送出回覆。將來改成 HTTP Interactions 時只替換 `discord/` 那層。

建議的目錄結構：

```
src/
  config.ts          # 讀取並驗證環境變數（建議用 zod）
  core/
    parse.ts         # 解析「120 午餐」→ { amount, note } | error（純函式）
    period.ts        # 台北時間的「今天」「本週」邊界 → UTC 範圍（純函式）
    ledger.ts        # 記帳、撤銷、查詢、統計（透過 repository 介面）
    format.ts        # 回覆與週報的文字格式
  db/
    schema.sql
    repository.ts    # 定義介面 + SQLite 實作
  discord/
    client.ts        # 建立 client、intents、partials
    messages.ts      # messageCreate handler
    commands/        # 每個 slash command 一個檔案
    register.ts      # 註冊指令的獨立腳本（npm run register）
  jobs/
    reminder.ts
    weekly.ts
  index.ts
test/
```

時間處理建議用 Luxon 或同等函式庫；排程可用 croner（支援 timezone 選項）。

## 6. 資料模型

```sql
CREATE TABLE IF NOT EXISTS entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,          -- Discord user ID（snowflake 用字串存）
  amount      INTEGER NOT NULL CHECK (amount > 0),  -- 新台幣整數
  note        TEXT    NOT NULL DEFAULT '',
  category    TEXT,                      -- MVP 不使用，保留欄位
  source      TEXT    NOT NULL,          -- 'text' | 'slash'
  created_at  TEXT    NOT NULL,          -- UTC ISO 8601
  deleted_at  TEXT                       -- 軟刪除
);

CREATE INDEX IF NOT EXISTS idx_entries_user_created
  ON entries (user_id, created_at);
```

注意事項：

- **金額用整數**，不要用浮點數。
- **時間存 UTC**，查詢「今天」「本週」時由 `period.ts` 把台北時間的邊界換算成 UTC 範圍。凌晨的消費才不會算錯天。
- **一週從週一開始**（可調整，見第 11 節）。
- SQL 保持標準、簡單，避免 D1 不支援的 SQLite 擴充功能，以便將來遷移。
- 保留 `user_id` 欄位，雖然現在只有一個使用者。

## 7. 環境變數

```
DISCORD_TOKEN=
DISCORD_APP_ID=
GUILD_ID=                 # 私人伺服器
LEDGER_CHANNEL_ID=        # 記帳與提醒頻道
OWNER_USER_ID=            # 唯一允許的使用者
TIMEZONE=Asia/Taipei
REMINDER_TIME=22:00
WEEKLY_REPORT=SUN 21:00
DB_PATH=/data/coinslot.db
UPTIME_KUMA_PUSH_URL=     # 選用，心跳監控
```

`.env` 必須列在 `.gitignore`，並提供 `.env.example`。token 一旦外洩立刻到 Developer Portal 重設。

## 8. 部署

- 在 DIT Proxmox 開一個**獨立的 LXC** 給 Coinslot，不和社團其他服務放在一起。
- Docker Compose：`restart: unless-stopped`；`./data` 掛載成 volume，存放 SQLite 與備份。
- better-sqlite3 是原生模組，Dockerfile 需確保能在映像裡編譯或使用預編譯版本（例如 `node:22-bookworm-slim` + 建置依賴，或使用 multi-stage build）。
- **備份**：每晚用 better-sqlite3 的 backup API 備份到 `data/backups/`，保留最近 14 份。社團 Proxmox 若有 vzdump 排程，這個容器也會被備份到社團儲存空間，使用者要自行決定是否排除。
- **監控**：若有設定 `UPTIME_KUMA_PUSH_URL`，每分鐘送一次心跳。
- 部署前要知會 DIT 的其他管理員，避免被誤刪。
- 程式碼不要放進社團共用的 repo。

## 9. 品牌素材

- 名稱：**Coinslot**；標語：**Spent it? Slot it.**
- Logo：Flat copper 版本，扁平風格的投幣器（圓形外框 + 直立投幣孔）
- 頭像：`coinslot-avatar-copper.png`（1024×1024，使用者手上已有），上傳到 Developer Portal
- 色票：

| 名稱 | 色碼 | 用途 |
|---|---|---|
| Copper | `#A85A24` | 底板 |
| Tan | `#E3B47E` | 外框 |
| Umber | `#7E4219` | 框緣、強調色 |
| Clay | `#C98446` | 內盤 |
| Slot | `#2A1508` | 投幣孔 |
| Paper | `#F4EFE6` | 背景 |
| Ink | `#1E1B17` | 文字 |

若 bot 回覆使用 embed，側邊色條可用 Copper `#A85A24`。

## 10. 注意事項

- Slash command 必須在 **3 秒內**回應；SQLite 很快，一般不成問題，但若之後有耗時操作（例如產生圖表）要先 `deferReply`。
- global command 更新後，Discord 客戶端有時需要重新整理才看得到。
- 備註裡不應出現卡號、帳號等敏感資訊（這是使用習慣，不用程式擋）。
- 回覆保持一行、簡短。這個 bot 的價值在於「不打擾」。

## 11. 待決定事項

開工時可以詢問使用者，或先用預設值並在 README 註明：

- 一週從週一或週日開始（預設週一）
- 提醒與週報時間（預設 22:00、週日 21:00）
- 是否同時啟用 User Install
- 程式碼註解與 commit message 使用中文或英文
- Node.js 版本（建議目前的 LTS）

## 12. MVP 範圍外（先不要做）

分類與預算、電子發票載具匯入、圖表與 dashboard、收入紀錄、多使用者支援、遷移到 Cloudflare Workers。等 MVP 實際使用兩週後再討論。

## 13. 建議的實作順序

1. 初始化專案：TypeScript、ESLint/Prettier、測試框架（Vitest）、`.env.example`、`.gitignore`
2. `core/parse.ts` + 完整單元測試
3. `core/period.ts` + 測試（特別測試台北時間跨日、跨週的邊界）
4. `db/` schema 與 repository，`core/ledger.ts`
5. Discord client：先做到在記帳頻道與私訊中收到純文字並成功記帳
6. Slash commands 與 `register.ts`
7. 排程：每晚提醒、週報
8. Dockerfile、docker-compose.yml、備份、心跳
9. README：Developer Portal 設定步驟、部署步驟、環境變數說明
