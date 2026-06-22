# VN 組件重新設計 — 兩層換頁、暖色、底部刪除 — 設計

- 日期：2026-06-23
- 狀態：✅ 設計定稿（Rae 看過四螢幕 mockup 點頭）；待寫實作計畫
- 範圍檔案：`os_phone/os/os_studio.js`（VN 組件展廳區 ~2835–3310 + `loadStudioGallery`）、`css/os_studio.css`
- 取代：[2026-06-21-vn-component-groups-design.md](2026-06-21-vn-component-groups-design.md) 的「折疊清單」部分（群組**資料模型保留**，只把折疊 UI 砍掉換兩層換頁）

## 問題（Rae 實機用 b562e99 那版的痛點）

1. **摺疊很醜**：第一層是雙層折疊 — 群組資料夾（▸▾）裡再塞「每張組件卡也能折疊」（▸▾）。兩層箭頭，正是 [[feedback_no_fold_two_layer_clean_ui]] 禁的那種。
2. **打開組件超級長**：組件卡一展開就直接跑完整即時預覽（手機/中間/全屏三 tab + 真渲染整個面板），清單被撐爆。
3. **手機很擠**：卡 header 一行塞「折疊鈕＋標題＋開關＋管理›」，390px 下擠成一團。
4. **刪除難按**：刪除是第二層詳情卡裡 8 顆按鈕擠成一排的第 7 顆（[os_studio.js:2869](../../../os_phone/os/os_studio.js)），又小又擠。

## 鎖定的決定（Rae 拍板）

- **參考圖**：`參考資料/04-vn-components-flow.png` 的四步流程當藍本。
- **刪除位置**：詳情頁**底部獨立紅色按鈕**（不收進 ⋯ 選單——守 [[feedback_no_fold_two_layer_clean_ui]]「操作別藏進 ⋯/摺疊」）。
- **群組**：資料夾 → **頂部標籤 chip 篩選**，選某組才冒出「整組一鍵開關＋⚙️管理」；**保留批次開關功能**。
- **打包**：新增**多選打包頁**（勾子集→打包），取代「整個展廳一次匯出」當主流程。
- **返回列**：每個第二層頁（詳情/設置/打包）**沿用世界書的 `.swb-bar` + `#swb-back`（‹）**，返回行為與世界書一致（Rae 明確要求）。

## 設計

### 0. 換頁路由（照搬世界書 `_wbView` 模式）

VN 組件改成單一 `renderVnComponents()` 路由，靠狀態 `_vcView` 分派；任何時刻只顯示一頁。對齊 `renderWorldbookPanel()` 的寫法（[os_studio.js:1179](../../../os_phone/os/os_studio.js)）。

- 狀態：
  - `_vcView`：`'browse' | 'detail' | 'settings' | 'package'`（預設 `browse`）
  - `_vcCurrentTpl`：詳情/設置頁正在看的組件
  - `_vcFilterGroupId`：目前選的標籤群組（`null`/`'all'` = 全部）
  - `_vcPackSel`：`Set<tplId>`，打包頁的勾選集
- 子頁（detail/settings/package）頂部都是 `.swb-bar`：`<button class="swb-iconbtn" id="swb-back">‹</button>` + `.swb-bar-title`（+ 右側可選 icon 鈕）。
- 返回硬接上一層：detail→browse、settings→detail、package→browse。
- **瀏覽層（browse）= VN 組件 tab 的根，不放 swb-back**（跟世界書 `picker` 頁一樣）；要回創作室首頁走既有的 `studio-back-btn`。子頁才有 swb-back。
- **進詳情不銷毀瀏覽 DOM、保留捲動位置**（沿用現有 `_savedGalleryScroll` 思路；改動完才 reload）。

### 1. ① 組件資料庫（瀏覽層，平鋪不折疊）

`loadStudioGallery()` 重寫成平鋪渲染：

- **頂部 `.swb-bar`**：標題「VN 組件」+ 🔍 搜尋鈕 + ＋（新群組）。
- **搜尋框**：依組件標題/tagId 即時篩。
- **標籤 chip 列**（橫向，可換行）：`全部`(預設選) / 各群組名 / `＋ 群組`。點 chip → 設 `_vcFilterGroupId` 只篩顯示該組成員（成員關係讀現有 `tpl.groupIds[]`）。
- **批次開關條**（只在選了某個群組 chip 時出現）：「『X』整組一鍵開關」+ 開關(衍生態 on/off/partial，沿用現有 `_groupState`/`_setGroupActive`) + ⚙️（開現有 `_openGroupManage`：改名/指派成員/刪群組）。`全部` 時不顯示此條。
- **輕卡列表**（取代 `_renderComponentCard` 的折疊卡）：每張一橫列
  - 左：**縮圖**（見 §5 lazy 縮圖）
  - 中：標題 + 標籤小 chip（該組件所屬群組名）
  - 右：啟用狀態綠點（`isActive` 真→綠、假→灰）+ `›` chevron
  - 整列可點 → `_vcView='detail'`、`_vcCurrentTpl=tpl`、re-render。
  - **卡上不放任何操作鈕**（開關/管理/刪除全進第二層）→ header 不再擠。
- **底部**：`選擇並打包` 鈕 → `_vcView='package'`。

### 2. ② 組件詳情（點卡進來）

重構現有 `_buildComponentCard`：把「一牆 8 顆按鈕」拆成「主操作 + 次操作 + 設置入口 + 底部刪除」。

- 頂部 `.swb-bar`：‹返回 + 組件標題。
- **大預覽**：手機/中間/全屏 segmented（沿用 `studio-pv-tabs` + `_activatePreview`），這裡才跑即時渲染（瀏覽層只用縮圖）。
- **主操作**：`✏️ 繼續編輯`（wine filled 全寬，沿用 `_enterEditMode` 流程與確認文案）。
- **次操作列**：`複製組件`（新：深拷貝 tpl、改 tagId 防撞、`saveVNTagTemplate`）、`📦 匯出`（沿用 `exportOneVnUiTemplate`）。
- **設置入口**：`使用與設置 ›` → `_vcView='settings'`。
- **底部獨立紅鈕**：與上方主/次操作用 divider 分開，`🗑 刪除組件`（紅、全寬；沿用現有刪除：confirm → `deleteUITemplate` → `syncActiveTagsToLocal` → `VN_DynamicParser.init` → 回 browse）。

### 3. ③ 使用與設置（把按鈕牆拆過來）

新頁，承接詳情頁拆出的設定類操作：

- 頂部 `.swb-bar`：‹返回（回 detail）+「使用與設置」。
- `啟用這個組件`：toggle（`isActive`，沿用 `_setComponentActive`）。
- `歸到群組`：多選 chip（寫 `tpl.groupIds`，沿用 `_buildGroupAssignRow` 邏輯，外觀改 chip）。
- `觸發格式`：`demoFormat` 檢視 + ✏️ 編輯（沿用現有 fmt 編輯/儲存/取消那組）。
- `整合`：注入酒館正則（`importToSillyTavern`）、裝到手機（現有 phoneBtn 切換）、大廳（`lobbyEnabled` toggle）。
- `進階`：📝 編輯原碼（`openRawEditModal`）。

### 4. ④ 選擇並打包（分享給朋友）

- 頂部 `.swb-bar`：‹返回（回 browse）+「選擇並打包」+ 右側「全選」。
- 清單：每列 checkbox + 縮圖 + 名（勾選寫 `_vcPackSel`）。
- 底部：「已選擇 N 個組件」+ `驗證並打包`（`N>0` 才可按；把選中的 tpl 陣列丟給**現有 `_downloadVnUiPack(selected, filename)`**——只是讓使用者挑子集，打包/下載/toast 全沿用）。
- **舊的「整個展廳一次匯出」獨立鈕移除**：此頁按「全選 → 驗證並打包」＝等效整包，不再另留按鈕。匯入包（`importVnUiPack`）保留，入口放瀏覽層 ＋/🔍 旁。

### 5. lazy 縮圖（解「超長」+ 效能）

- 瀏覽層輕卡縮圖 = **縮小版預覽**：固定小框（約 56–64px 高）、`transform:scale()` 縮、`overflow:hidden`、`pointer-events:none`，看起來像縮圖。
- **捲到才渲**：用 `IntersectionObserver`，卡進視窗才渲染那一個縮圖（沿用 `_activatePreview` 的 lazy 精神，但縮小版）。沒進視窗的不跑 → 清單再多也不卡。
- 渲不出來/無 html 的退回 icon 佔位。

### 6. 資料模型（零遷移）

- 群組：現有 `vn_component_groups`（localStorage）+ `tpl.groupIds[]` **原樣保留**，只換外觀（資料夾→chip）。
- 啟用：現有 `isActive` + `syncActiveTagsToLocal()` + `VN_DynamicParser` 管線**完全不動**。AI 仍只讀各組件 `isActive`。
- **移除** `VN_FOLD_KEY`（折疊狀態）— 不再有折疊。

### 7. 配色統一（順手）

- VN 組件從舊冷灰藍 `sgc-*`（`rgba(228,232,245,…)` / `#1A1C28`）搬到創作室暖色 `--jrpg-*`（與世界書 `swb-*` 同源）。
- **返回列、主/次鈕、卡、chip、開關直接重用 `swb-*` 類別**（`.swb-bar`/`.swb-iconbtn`/`.swb-primary`/`.swb-secondary`/`.swb-card`/`.swb-tag`/`.swb-seg`），不夠的新增 `vc-*`，吃 `--jrpg-*` 變數。
- **所有 CSS 進 `css/os_studio.css`，JS 內不寫 inline style**（[[feedback_no_inline_style_ever]]）。

## 不做（本次範圍外）

- 綁世界觀/chatId 自動套用（Rae 一貫要手動）。
- v2「成員仍在他組則不關」的聰明批次規則（沿用 2026-06-21 spec 的 v1 單純批次）。
- 縮圖改「截圖快照」存檔（先用 lazy live 縮圖；要更省再說）。

## 驗證

- 純邏輯（群組篩選、批次衍生態 all/none/partial、打包子集挑選、複製組件改 tagId 防撞）可抽函式 Node 測。
- 兩層換頁/返回/lazy 縮圖/暖色靠 Rae 酒館實機驗收（TauriTavern 無法本地預覽）。
- 返回行為逐頁對照世界書：detail→browse、settings→detail、package→browse 都要回對層、不直接關窗。
