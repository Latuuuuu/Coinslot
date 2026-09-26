# Coinslot

> Spent it? Slot it.

個人記帳用的 Discord bot。只輸入「關鍵字 + 金額」就記好一筆，每晚沒記帳會提醒，每週日發週報。

## 使用方式

在記帳頻道或 bot 私訊直接打字：

```
午餐 -120
-1,200 耳機
120 早餐          ← 負號可省略
-１２０ 飲料       ← 全形也可以
```

- 成功：bot 回一行 `Logged 午餐 -120`
- 看不出金額：bot 在你的訊息加上 ❓（不會回訊息打擾你）
- 金額不合理（0、`+` 開頭的收入、超過 10,000,000）：回一行說明

| 指令 | 說明 |
|---|---|
| `/log text:午餐 -120` | 同純文字輸入 |
| `/undo` | 刪除最後一筆（軟刪除，資料庫仍保留） |
| `/today` | 今天的每一筆與合計 |
| `/week` | 本週合計、筆數、最大三筆 |
| `/export` | 下載全部紀錄 CSV（Excel 可直接開） |

所有指令回覆都只有你看得到（ephemeral）。

排程（皆為台北時間）：

- **每晚 22:00**：今天沒有任何紀錄時，在記帳頻道提醒並 mention 你
- **週日 21:00**：週報（合計、筆數、最大三筆、與上週比較）
- **每天 04:00**：備份資料庫到 `data/backups/`，保留最近 14 份

## 預設值與設計決定

| 項目 | 預設 | 調整方式 |
|---|---|---|
| 一週起始 | 週一 | 固定（ISO 週） |
| 提醒時間 | 22:00 | `REMINDER_TIME` |
| 週報時間 | 週日 21:00 | `WEEKLY_REPORT` |
| 時區 | Asia/Taipei | `TIMEZONE`（不依賴容器 TZ） |
| User Install | 不啟用 | 只註冊私人伺服器的 guild command |
| 金額 | 新台幣整數，只記支出 | — |

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
| `DB_PATH` | | 本機預設 `./data/coinslot.db`；Docker 固定為 `/data/coinslot.db` |
| `UPTIME_KUMA_PUSH_URL` | | Uptime Kuma push 網址；有設定就每分鐘送一次心跳（連線正常時才送） |

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
| `npm run build` / `start` | 編譯後執行 |

手動驗證方式見 [DEBUG.md](DEBUG.md)。

## 部署（DIT Proxmox LXC + Docker Compose）

1. **部署前先知會 DIT 其他管理員**，避免容器被誤刪。
2. 在 Proxmox 開一個**獨立的 LXC**（Debian 12 即可，1 核 / 512MB RAM / 4GB 硬碟足夠）。
   LXC 內要跑 Docker 需在 Options → Features 開啟 `nesting`（非特權容器另需 `keyctl`）。
3. 在 LXC 內安裝 Docker 與 Compose plugin。
4. 把程式碼放到 LXC（**不要放進社團共用的 repo**），例如 `/opt/coinslot`，並建立 `.env`：

   ```bash
   cd /opt/coinslot
   cp .env.example .env && nano .env
   chmod 600 .env
   mkdir -p data && chown 1000:1000 data    # 容器以 uid 1000 執行
   ```

5. 註冊指令並啟動：

   ```bash
   docker compose build
   docker compose run --rm coinslot node dist/discord/register.js
   docker compose up -d
   docker compose logs -f     # 看到 "Logged in as Coinslot#xxxx" 即成功
   ```

更新版本：`docker compose up -d --build`（指令有變動時先重跑上面的 register）。

### 備份與還原

- 每天 04:00 自動備份到 `data/backups/coinslot-YYYY-MM-DD.db`，保留 14 份。
- 社團 Proxmox 若有 vzdump 排程，這個 LXC 也會被備份到社團儲存空間。**是否排除請自行決定**（記帳資料會因此出現在社團儲存空間）。
- 還原：

  ```bash
  docker compose stop
  cp data/backups/coinslot-2026-09-26.db data/coinslot.db
  rm -f data/coinslot.db-wal data/coinslot.db-shm
  docker compose start
  ```

### 監控

在 Uptime Kuma 建立 **Push** 類型的監控，心跳間隔設 60 秒，把 push 網址填進 `UPTIME_KUMA_PUSH_URL`。bot 斷線時不會送心跳，Uptime Kuma 就會通知。

## 專案結構

```
src/
  config.ts          環境變數驗證（zod）
  core/              業務邏輯，不依賴 Discord
    parse.ts         「午餐 -120」→ { amount, note }
    period.ts        台北時間的今天／本週 → UTC 範圍
    ledger.ts        記帳、撤銷、查詢、統計
    format.ts        回覆、週報、CSV 文字格式
  db/                SQLite schema 與 repository（介面為 async，方便將來換 D1）
  discord/           client、訊息與指令處理、指令註冊
  jobs/              提醒、週報、備份、心跳排程
  index.ts           進入點
test/                單元測試（Vitest）
scripts/playground.ts  終端機互動測試
```

將來若要搬到 Cloudflare Workers（HTTP Interactions），只需替換 `discord/`、`jobs/` 與 `db/` 的實作，`core/` 可以直接沿用。

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
