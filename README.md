# 移民署人次抓取管線

由 GitHub Actions 每小時抓取移民署各機場人次預報，存成 `data/immigration.json`，
透過 GitHub Pages 發布成固定網址，供「即時航班看板」的航廈人流橫幅讀取（避免瀏覽器 CORS）。

抓取代碼：`TPE11`（桃園 T1 入境）、`TPE12`（T2 入境）、`TPE51`（T1 出境）、`TPE52`（T2 出境）。

## 一次性設定步驟

### 1. 建立 repo 並上傳這些檔案
把以下結構放到你的 GitHub repo：
```
.github/workflows/immigration.yml
scripts/fetch-immigration.mjs
data/immigration.json        （初始佔位檔，首次執行後會被覆蓋）
README.md
```

### 2. 開啟 Actions 的寫入權限
Repo → **Settings** → **Actions** → **General** → 最下方 **Workflow permissions**
→ 選 **Read and write permissions** → Save。
（workflow 需要這個權限才能把更新後的 JSON push 回 repo。）

### 3. 開啟 GitHub Pages
Repo → **Settings** → **Pages** →
Source 選 **Deploy from a branch**，Branch 選 **main**、資料夾選 **/ (root)** → Save。
稍等一兩分鐘，Pages 會給你一個網址，例如：
`https://<你的帳號>.github.io/<repo名>/`

你的 JSON 固定網址就是：
`https://<你的帳號>.github.io/<repo名>/data/immigration.json`

### 4. 第一次手動觸發（測試）
Repo → **Actions** → 左側選「抓取移民署人次」→ 右側 **Run workflow** →
跑完後看 `data/immigration.json` 是否更新成真實數字。

### 5. 把網址填進看板
打開「即時航班看板.html」，找到這一行（在 JS 區塊，搜尋 `PAX_URL`）：
```js
var PAX_URL = "";
```
改成你的 Pages JSON 網址：
```js
var PAX_URL = "https://<你的帳號>.github.io/<repo名>/data/immigration.json";
```
存檔後，到離看板的 KPI 下方就會出現「🛂 航廈人流」橫幅。

## 之後
workflow 會每小時（每小時的第 5 分鐘）自動抓取並更新。無需再手動操作。
若要調整抓取代碼或壅擠分級門檻，改 `scripts/fetch-immigration.mjs` 即可。
