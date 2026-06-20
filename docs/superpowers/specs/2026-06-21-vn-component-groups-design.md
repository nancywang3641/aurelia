# VN 組件 群組 + 折疊清單 — 設計

- 日期：2026-06-21
- 狀態：設計已與 Rae 對齊，待實作
- 範圍檔案：`os_phone/os/os_db.js`、`os_phone/os/os_studio.js`、`css/os_studio.css`

## 問題

VN 組件（純展示面板，存為 VN tag template）越來越多、跨多種世界觀（古代／現代／…），但：
1. 清單是一長排預覽卡，看過的舊卡沒法收起來，越來越長難找。
2. 不同世界觀要不同組件，現在切世界觀得「一個一個」手動開關 `isActive`，很煩。

## 目標

1. 清單可折疊收納（看過的卡收起來）。
2. 把組件「打包成組／資料夾」按世界觀分類，**每組一個拉桿一鍵批次開關**成員，切世界觀少點幾十下。
3. **手動**——不綁世界觀自動套（Rae 明確：她自己開關）。

## 設計

### 1. 資料模型（最小改、重用現有 `isActive`）

- **群組定義**存 localStorage `vn_component_groups` = `[{ id, name }]`（純清單，不存成員——成員關係掛在組件上）。
- **每個 VN tag template 加** `groupIds: string[]`（預設 `[]`）。一個組件可歸 **0～多組**（通用卡如純數值面板可同掛「古代」+「現代」）。沒有 `groupIds` 或空陣列 = 未分組。
  - 寫回走現有 `OS_DB.saveVNTagTemplate(tpl)`（tpl 多帶一個欄位即可，無需 schema migration）。
- **AI 讀的還是各組件 `isActive`**：現有 `syncActiveTagsToLocal()` / `VN_DynamicParser` 管線**完全不動**。群組只是上層的整理與批次操作。

### 2. 群組拉桿語意 = 批次動作（不是新的啟用層）

- 開群組拉桿 → 把該組所有成員 `isActive = true`；關 → 全 `false`。存檔 + `syncActiveTagsToLocal()` + `VN_DynamicParser.init()`（沿用現有 toggle 既有那串）。
- 群組拉桿的「目前態」= 顯示衍生值：成員全開→顯示開、全關→顯示關、部分→顯示半開（indeterminate）。
- 換世界觀：關「古代組」拉桿（古代成員全停）→ 開「現代組」拉桿（現代成員全啟）。手動兩下。
- **已知取捨（v1 簡單版）**：通用卡同屬兩組時，關其中一組會把它也關掉。v1 就照單純批次；未來要的話再加「成員若仍在另一個『開著』的組裡就不關」的聰明規則。spec 標記為 v2 可選。

### 3. 清單 UI（兩層折疊，資料夾感）

改寫 `loadStudioGallery()`（os_studio.js ~2473）的渲染：

- **群組資料夾** = 可折疊區塊。folder header 一行：
  `▸/▾ 群組名　[群組拉桿]　⚙️管理`
  - 群組拉桿 = 上述批次開關。
  - ⚙️管理 = 改名 / 刪除群組 / 批次指派成員（見 §4）。
  - folder 收合 → 整組成員藏起來。
- folder 內 = **組件卡**，每張**可折疊**。卡 header 一行：
  `▸/▾ 標題　[啟用拉桿]　管理 ›`
  - 啟用拉桿 = 單一組件 `isActive` 開關（取代第二層那顆「啟用/停用」按鈕；按鈕仍可留在第二層）。
  - 管理 › = 進現有第二層詳情卡（`_openComponentDetail`，不動）。
  - 卡收合 → 只藏「預覽」；header（拉桿/管理）永遠在。看過的舊卡收起來。
- 固定一個「**未分組**」區（同樣是可折疊 folder，但沒有群組拉桿、或拉桿批次開關未分組全部——v1 先不給未分組拉桿，只當收納區）。
- **折疊狀態記憶**：群組 folder 與單卡的展開/收合存 localStorage（如 `vn_gallery_fold_state`），重開維持。

> 與「不准摺疊」鐵則（[[feedback_no_fold_two_layer_clean_ui]]）的關係：那條禁的是「把**操作**藏進摺疊/⋯」。這裡操作（拉桿、管理）永遠在 header 可見，**只折疊占空間的預覽**，且是 Rae 本人明確要求收納舊卡 → 不衝突。

### 4. 群組管理

- **新增群組**：清單頂部「＋ 新群組」→ 輸入名稱 → push 進 `vn_component_groups`。
- **改名 / 刪除**：folder header ⚙️。刪群組**不刪組件**，只把成員的 `groupIds` 移除該 id（退回未分組）。
- **指派成員到群組**：兩個入口
  - 組件第二層詳情卡（`_buildComponentCard`）加「歸到群組」多選（勾要屬於哪些組）。
  - folder header ⚙️ 的「批次指派」：列出所有組件、勾選加入本組。

## 不做（本次範圍外）

- 綁世界觀/chatId 自動套用（Rae 明確要手動）。
- 群組匯出/匯入包（現有 `_wireVnUiPackButtons` 是整個展廳匯出，群組維度之後再說）。
- v2 的「成員仍在他組則不關」聰明規則。

## 驗證

- 純邏輯（群組拉桿衍生態 all/none/partial、批次 set isActive、刪組退回未分組、多組成員）可用 Node 抽函式測。
- UI 折疊/渲染靠 Rae 酒館實機驗收（TauriTavern 無法本地預覽）。
