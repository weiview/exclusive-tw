# 獨家片單 — 台灣 Netflix vs HBO Max

列出台灣地區「只在 Netflix」或「只在 HBO Max」以訂閱方式上架的電影與影集，可依類型、形式篩選與搜尋。

## 運作方式

1. `scripts/fetch-data.mjs` 透過 TMDB API（上架資料來自 JustWatch）抓取兩個平台在 TW 地區的全部片單（電影＋影集，只算訂閱制 flatrate）。
2. 以 TMDB id 比對，只出現在其中一邊的即為獨家；類型使用 TMDB 繁中類型名稱。
3. 結果寫入 `public/data.json`，`public/index.html` 讀取後在瀏覽器端篩選。

## 本機執行

需要 Node 18 以上，以及一組 TMDB 金鑰（免費申請：TMDB 帳號 → 設定 → API）。

```bash
export TMDB_TOKEN=你的金鑰    # v4 讀取權杖（eyJ 開頭）或 v3 API 金鑰皆可
npm run fetch                # 產生 public/data.json，約需數分鐘
npm start                    # 開啟 http://localhost:3000
```

## 部署到 GitHub Pages（每天自動更新）

1. 把整個資料夾推到 GitHub repo 的 `main` 分支。
2. Repo → Settings → Secrets and variables → Actions → 新增 `TMDB_TOKEN`。
3. Repo → Settings → Pages → Source 選 **GitHub Actions**。
4. 到 Actions 手動執行一次「更新片單並部署」，之後每天台灣時間 03:17 自動更新。

## 已知限制

- 上架資料以 JustWatch 為準，與平台實際狀況可能有一兩天落差。
- TMDB discover 單次查詢最多 500 頁（10,000 筆），若某平台某形式超過會在 log 中警告。
- 網址會記住篩選條件（例如 `#p=mx&g=犯罪`），可直接分享。

This product uses the TMDB API but is not endorsed or certified by TMDB.
