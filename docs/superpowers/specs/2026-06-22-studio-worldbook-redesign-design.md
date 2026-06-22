# 創作室「世界書」UI 重構設計

日期：2026-06-22
範圍：**只重做世界書那一塊**。應用工坊、製作互動面板、劇情主題維持現狀，之後另開 session 分批照 GPT 簡報（`參考資料/studio-ui-redesign/CLAUDE-UI-REBUILD-BRIEF.md`）做。

## 問題

現在 `_wbRenderEditor`（os_studio.js:1202）把**條目清單 + AI 對話 + 待套用改動 + 輸入框 + 主/副模型切換**全塞進一個視窗（見 `參考資料/studio-ui-redesign/` 截圖對照），普通用戶看不懂、像工程控制室。違反鐵律「不准摺疊、兩層乾淨瀏覽→點進操作頁」（memory `feedback_no_fold_two_layer_clean_ui`）。

另外現有 `.swb-*` CSS 寫死深藍 navy `#1A1C28`，跟創作室外殼已有的暖色 JRPG 羊皮紙主題（`--jrpg-*` 變數）打架。

## 解法：5 個獨立換頁

把世界書拆成一條換頁路徑，任何時刻只顯示一頁，返回鍵固定回上一層。全程吃 `--jrpg-*` 變數（不寫死 navy、也不硬塞 GPT 的 hex），無 UID/JSON 露出。

```
① 選世界書 ──tap書──▶ ② 瀏覽條目 ──tap條目──▶ ③ 條目詳情(編輯)
                          │  ┌──「請AI整理」──▶ ④ AI討論 ──「查看N項建議」──▶ ⑤ 確認改動
                          └──「新增條目」────▶ ③ 條目詳情(新增)
```

### 視圖狀態（取代現在的 `_wbWorking` null/set 二態）

新增 module 閉包變數：
- `_wbView`：`'picker' | 'entries' | 'detail' | 'chat' | 'confirm'`（預設 `'picker'`）
- `_wbEntryEditing`：詳情頁正在編的條目（`null`=新增，否則是該條目物件的 uid）
- 沿用：`_wbWorking`、`_wbEntries`、`_wbChat`、`_wbPending`、`_wbModel`

`renderWorldbookPanel()` 改成依 `_wbView` 分派到 5 個 render 函式。每頁的返回鈕硬接它的上一層：
- entries → picker（清 `_wbWorking`）
- detail → entries
- chat → entries
- confirm → chat

### ① 選世界書 `_wbRenderPicker`
- 標題「整理世界書」+ 一句說明
- 主按鈕「➕ 新增世界書」（點開一行命名輸入 + 確認，沿用 `_wbCreateNew`）
- 每本書一張卡：書名 · **條目數**（逐本 `getLorebookEntries().length` 算）· 右箭頭 › · 三點選單 ⋮
  - ⚠️ **GPT 卡片上的「最近修改時間」拿掉**：`getLorebooks()` 只回 `string[]`，API 完全沒有 mtime，不假裝。
  - ⋮ 選單（小 action sheet，**非原地展開一排按鈕**）：📋 建立安全副本後編輯 ／ ✏️ 直接改原檔（紅字 confirm）／ 🗑 刪除世界書（紅字 confirm，呼叫 `deleteLorebook`）
  - **點卡片本體**：若書名以 `[VN副本]` 開頭 → 直接進 entries（已是安全副本，不囉嗦）；否則跳小對話框問「📋 建安全副本(推薦) ／ ✏️ 直接改原檔」，選完才進 entries。對應 GPT「優先安全副本／先簡單詢問」。
  - 條目數逐本載入：picker 進場先畫卡（數字顯示「…」），再非同步補上數字，避免阻塞。

### ② 瀏覽條目 `_wbRenderEntries`
- 頂列：‹返回 · 書名 · 安全章（`[VN副本]`→綠「副本·原檔安全」／否則琥珀「⚠️ 直接改原檔」）
- 搜尋框（即時過濾標題/關鍵字/內容）
- 篩選段控：全部 ／ 已啟用 ／ 已停用
- 條目卡：標題 · 兩行內容摘要 · 關鍵字標籤(chips) · 啟用 toggle(`sgc-switch`，live `setLorebookEntries`) · 右箭頭。**不顯示 UID**（uid 藏 `data-uid`）。
  - 點卡片本體 → detail（編輯該條）
  - toggle 即時生效（沿用現有邏輯）
- 底部固定列：主按鈕「🤖 請 AI 幫我整理」→ chat ；次按鈕「＋ 新增條目」→ detail(新增)
- 空狀態：用 `assets/studio-worldbook.png` 風格的空畫面 + 「跟 AI 說要加什麼」

### ③ 條目詳情/編輯 `_wbRenderDetail`（本次新增的手動編輯線）
- 頂列：‹返回（回 entries）· 標題「編輯條目」或「新增條目」
- 乾淨表單（無 UID/JSON）：
  - 標題（comment）：單行輸入
  - 關鍵字（keys）：單行輸入，輔助字「用、分隔，留空＝常駐」
  - 內容（content）：大 textarea
  - 啟用：toggle
- 底部：主按鈕「儲存」
  - 新增 → `createLorebookEntries(_wbWorking, [{comment,keys,content,enabled}])`
  - 既有 → `setLorebookEntries(_wbWorking, [{uid,comment,keys,content,enabled}])`
  - 存完 → 回 entries、重抓 `_wbEntries`
- 既有條目才有的「🗑 刪除這條」紅字按鈕，單獨擺最底（`deleteLorebookEntries`），與儲存分組（危險操作不混一般操作）。

### ④ 和 AI 討論 `_wbRenderChat`
- 頂列：‹返回（回 entries）· 書名 + 條目數 · 右上「⚙️ 進階」→ 小 sheet 放主/副模型段控（移出主畫面，沿用 `_wbModel` 預設）
- 只有對話泡泡（user/assistant）+ 輸入框 + 送出（沿用 `_wbSend`、`_WB_SYS`、`chatMain`/`chatSecondary`，NSFW 照常）
- AI 回完且 `_wbParseOps` 有結果 → 底部冒固定條「查看 N 項建議 ›」→ confirm。**這頁不攤開條目清單、不攤開 pending 內容。**

### ⑤ 確認改動 `_wbRenderConfirm`
- 頂列：‹返回修改（回 chat）· 標題「確認改動」
- 每項一張卡，顏色分：新增=綠左邊框/綠章；修改=琥珀；刪除=紅
  - 卡上直接顯示：操作章 + 標題 + 內容預覽（del 顯示要刪的標題）。**不做手風琴/原地展開**（守 memory「不准摺疊」；GPT 那句「需要時才展開」改成直接顯示預覽，因 ops 通常 1~5 項）。
- 底部固定：‹返回修改 ／ 主按鈕「✅ 套用 N 項改動」
- 套用走現有 `_wbApply` 寫入邏輯（create/set/delete）。**保留鐵律：AI 回完不自動套用，按確認才寫。**
- 套用後：toast「已套用 N 項 ✓」、清 `_wbPending`、靜默重抓 `_wbEntries`、回到 ④ chat（對話可繼續）。

## 保留不動
AI prompt `_WB_SYS`、解析 `_wbParseOps`、寫入 `_wbApply`、`[VN副本]-` 複製 `_wbCopyBook`、新建 `_wbCreateNew`、原檔 confirm 警告、主/副模型 `_wbSend`、NSFW、lorebook API、IndexedDB schema、App 安裝格式。**app_store.js、主題、面板完全不碰。**

## 檔案
- `os_phone/os/os_studio.js`：重寫 `renderWorldbookPanel` + `_wbRender*`（拆成 5 個 view render + view router）。helper（`_wbParseOps`/`_wbApply`/`_WB_SYS`/`_wbCopyBook`/`_wbCreateNew`）保留、必要時微調簽名。
- `css/os_studio.css`：把 `.swb-*` 整段換成 view-based class，吃 `--jrpg-*` 變數、拔掉 navy 寫死。CSS 全進 css/、無 inline style（memory `feedback_no_inline_style_ever`）。

## 驗收
- 390px 寬無橫向捲動；每頁只有一個實心主按鈕；返回永遠回上一層。
- 一般流程看不到 UID/JSON/HTML/模型術語。
- 條目清單、AI 對話、改動確認**不再同屏**。
- 刪除、解除/直接改原檔都有警告；AI 改動仍須確認才寫。
- 世界書段視覺跟外殼羊皮紙主題和諧（吃 `--jrpg-*`）。

## 兩個預設（已對齊用戶，可推翻）
1. 點書卡 → 跳對話框問副本/直接（已是副本則跳過不問）。
2. ⑤套用後回 ④ AI 討論頁 + toast，不甩回條目列表。
