# 創作室「🌍 世界書」tab — 設計

- 日期：2026-06-21
- 狀態：✅ 已實作（commit b9b277e，2026-06-21）；待 Rae 酒館實機驗收
- 範圍：`os_phone/os/os_studio.js`（加 tab + 接線）、新檔 `os_phone/os/os_studio_worldbook.js`（主邏輯）、`css/os_studio.css`

## 問題 / 目標

創作室原本的世界書創建邏輯已退役（隨「世界觀草稿」模式停掉，os_studio.js:790 按鈕永久隱藏）。Rae 最近在調 NSFW，沒法在官方平台聊那些規則，需要：
- 跟（副模型/studio AI）大聊特聊 NSFW 規則，讓 AI 幫**改條目 / 新增條目**。
- **二改別人角色卡的世界書**：用**複製的副本**改，**絕不動到原始世界書**。

酒館助手 API 齊全：`getLorebooks` / `createLorebook` / `getLorebookEntries` / `createLorebookEntries` / `setLorebookEntries` / `deleteLorebookEntries`。`LorebookEntry` 白話欄位：`comment`(標題)、`keys`(觸發關鍵字 string[])、`content`(內容)、`enabled`(啟用)。

## 設計

### 入口
創作室新 tab「🌍 世界書」（mode 切換，跟 預覽/原碼/VN組件 並列）。

### 第一層：選工作對象（乾淨瀏覽 → 點進第二層）
- ➕ **新建空白世界書**：輸入名 → `createLorebook(名)`。
- 📋 **從現有複製**（二改主路）：列 `getLorebooks()` → 選一個 → `createLorebook("[VN副本]-原名")` + `getLorebookEntries(原)` → `createLorebookEntries(副本, 條目)`（**原檔不動**）。
- ✏️ **編輯現有**（進階·帶明顯紅字警告「會直接改原檔」）：直接選一個世界書當工作對象。

### 第二層：編輯工作區
- **條目清單**：每條顯示 標題(comment) / 關鍵字(keys join) / 內容預覽 / 啟用 toggle。可折疊（重用 VN 組件折疊風格精神）。
- **對話框**：Rae 打字討論 NSFW 規則 → AI 讀「目前條目清單 + 她的訊息」→ 回覆對話 + 當要實際改時輸出結構化操作。
- **AI 操作格式**（system prompt 規範）：只輸出要動的，沒提到的條目一律不碰：
  - 新增：`<wb op="add"><comment>標題</comment><keys>關鍵字1,關鍵字2</keys><content>內容</content></wb>`
  - 改：`<wb op="update" uid="5">…同上欄位、只放要改的…</wb>`
  - 刪：`<wb op="del" uid="5"/>`
- **套用＝先預覽再確認**：程式解析 `<wb>` → 顯示 **diff 預覽**（新增/改哪條/刪哪條）→ Rae 按「✅ 套用」才真的寫：
  - add → `createLorebookEntries(工作WB, [{comment,keys,content,enabled:true,...預設}])`
  - update → `setLorebookEntries(工作WB, [{uid, ...改的欄位}])`（**其他欄位 position/depth/order… 保留原值不動**，只動 comment/keys/content/enabled）
  - del → `deleteLorebookEntries(工作WB, [uid])`
- AI 只碰白話四欄（comment/keys/content/enabled）；進階欄位一律沿用原條目。

### 安全
- 複製/新建模式：原始世界書**永不寫入**。
- 編輯現有：紅字警告 + 每次寫入仍走 diff 預覽確認。
- 任何寫入前都要 Rae 按確認，AI 不直接落地。

## 不做（範圍外）
- 進階條目欄位（position/depth/order/probability/logic…）的 UI 編輯——保留原值。
- 世界書匯入/匯出檔、跨裝置搬運。
- 綁定世界書到角色卡（rebind）——這裡只負責建/改條目，綁定走酒館原生。

## 驗證
- 純函式（解析 `<wb>` 操作、複製條目欄位映射、diff 計算）可 Node 測。
- 實際 API 寫入靠 Rae 酒館實機驗收（TauriTavern 無法本地測）。
