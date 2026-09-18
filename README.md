# STARLUX Galactic Lounge

星宇航空 T1 / T2 機場貴賓室管理系統。單檔 HTML PWA，Supabase 提供 realtime 資料同步。

## 功能

- **座位圖**：4 區共 42 席，即時狀態同步（空位 / 使用中 / 待清潔 / 清潔中）
- **帶位流程**：三種模式
  - 輸入航班（TDX 自動帶入 STD）
  - 掃描登機證 QR / Barcode（IATA BCBP）
  - 手動輸入（臨時客人）
- **航班色帶**：紅=30 分內起飛 / 金=30-60 分 / 綠=60 分以上
- **多人聊天**：櫃檯 ⇄ 貴賓室 ⇄ 清潔 ⇄ 餐飲 ⇄ 主管
- **備品盤點**：低量警示
- **RWD**：iPad / iPhone / 桌機自適應
- **PWA**：可加入 iOS/Android 主畫面全螢幕使用

## 技術架構

```
[平板 / 手機] ─→ index.html (PWA)
                 └─→ Supabase
                     ├─ Postgres (seats, flights, channels, messages)
                     ├─ Realtime (WebSocket 廣播)
                     └─ Edge Function: sync-tdx-flights
                         └─→ TDX FIDS API（每 5 分鐘）
```

## 部署步驟

### 1. 建立 Supabase 專案

1. 到 [supabase.com](https://supabase.com) 註冊、建新專案（Region 選 **Northeast Asia (Tokyo)**）
2. SQL Editor 執行 [`sql/schema.sql`](sql/schema.sql)
3. Project Settings → API 複製 `Project URL` 和 `anon public key`

### 2. 貼憑證到 index.html

搜尋這兩個字串並取代：

```javascript
const SUPABASE_URL = 'PASTE_YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'PASTE_YOUR_SUPABASE_ANON_KEY';
```

### 3. 部署到 GitHub Pages

```bash
git add .
git commit -m "deploy"
git push
```

到 Settings → Pages 啟用即可。

### 4. 部署 TDX 同步 Edge Function（可選，先跳過也能用種子資料測）

需要 [TDX 註冊](https://tdx.transportdata.tw/register)拿到 Client ID / Secret。

```bash
npm install -g supabase
supabase login
supabase link --project-ref [your-project-ref]

# 設定祕密
supabase secrets set TDX_CLIENT_ID=your_id
supabase secrets set TDX_CLIENT_SECRET=your_secret

# 部署
supabase functions deploy sync-tdx-flights --no-verify-jwt

# 測試
curl -X POST https://[your-project-ref].supabase.co/functions/v1/sync-tdx-flights
```

排程每 5 分鐘同步（在 Supabase SQL Editor 執行）：

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-tdx-flights',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://[your-project-ref].supabase.co/functions/v1/sync-tdx-flights',
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  $$
);
```

## 使用方式

1. 手機 / iPad 用 Safari 打開部署好的網址
2. 分享 → 「加入主畫面」→ 從主畫面點開就是全螢幕 App 體驗
3. 首次開啟會要求設定身份（姓名 + 角色）
4. 掃描登機證需要授權相機權限（iOS 需 HTTPS，GitHub Pages 已自動提供）

## 各角色使用場景

| 角色 | 主要裝置 | 主要動作 |
|------|---------|---------|
| 劃位櫃檯 | iPad | 掃登機證帶位、通知貴賓室 |
| 貴賓室帶位員 | iPad | 引導入座、觀察即將登機 |
| 清潔人員 | iPhone | 收待清潔通知、標記完成 |
| 值班主管 | iPad + 桌機 | 綜觀座位圖、統計、聊天 |

## 上線前待辦

- [ ] Supabase RLS 政策收緊（目前為 `allow all`，正式版需綁 Supabase Auth + 角色權限）
- [ ] Service Worker 做離線快取
- [ ] 完整 `manifest.json`（PWA icon、名稱）
- [ ] 環境變數化憑證（build step 注入）
- [ ] 錯誤追蹤（Sentry 或類似工具）

## 開發歷程

- v1：單檔 HTML mock（無 realtime）
- v2：加 Supabase realtime 聊天
- v3：座位表 realtime + 帶位精靈（TDX 查詢 + BCBP 掃描）
- v4：RWD 適配 iPad / iPhone + PWA 準備 ← **目前版本**

## 授權

Internal use only.
