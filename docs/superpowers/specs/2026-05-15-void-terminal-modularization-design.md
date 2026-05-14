# 大廳模組化重構設計（void_terminal.js）

> 日期：2026-05-15
> 狀態：設計定稿，待 Rae 審閱
> 類型：純結構重構，**零行為改動**

## 1. 背景與目標

`core/void_terminal.js` 是大廳的 UI 與敘事引擎，目前 **3464 行**，是專案第 4 大檔。它在單一 IIFE 裡塞了約 19 種職責（BGM、瀅瀅／柴郡／Claude 三場景、對話持久化、404 彩蛋、成就面板、商店面板、登入介面…），維護時難以定位、難以閱讀。

**目標**：把檔案拆成「核心 + 6 個各司其職的小模組」，搬進專屬資料夾 `core/void/`。

**鐵則**：**零行為改動**。拆完大廳長得、用起來必須一模一樣。這次只搬程式碼、不改邏輯、不改 UI、不改 prompt 內容、不順手修 bug。

**這次不做**（另開任務）：改樣式（Rae 另外請 GPT 出設計圖）、清死碼。

## 2. 現狀分析：兩種肉

讀完 3464 行後，檔案明確分成兩部分。

### 纏死的核心（約 2/3）

靠閉包共用 `IRIS_STATE`、`is404Room`、`isClaudeRoom`、`_irisHistoryBackup` / `_cheshireHistoryBackup` / `_claudeHistoryBackup`、`visit404Count` 等變數。要拆就得動共用狀態 —— 風險高，**這次不碰**。包含：

- 狀態宣告區（L45-74）—— 整塊留核心，唯 `_pendingClaudeAttachments`（L68）隨 `claude-room.js` 搬出
- 對話歷史持久化 `getChatId` / `debouncedSave` / `saveLobbyHistory` / `loadLobbyHistory`（L436-506）
- `_updatePortalBtn` / `_applyLoadedLobbyState`（L799-912）
- `VoidTerminal.createTab` 主渲染（L914-1455，含約 540 行 HTML 模板）
- 歷史對話面板 `getCharHistory` / `setCharHistory` / `renderHistoryList`…（L1457-1656）
- 場景切換 `enterClaudeRoom` / `exitClaudeRoom`（L1759-1876）、`enter404Room` / `restoreLobby`（L2471-2583）
- VN 打字機引擎 `parseVnText` / `playIrisSequence` / `advanceIrisVn`（L2585-2674）
- `sendIrisMessage` 對話核心（L3001-3303）
- 生命週期 `onShow` / `onHide`、可見性監聽、外部控制 API、互動與放置反應、世界頻道、時間工具

### 鬆的葉子（約 1/3）

只摸 DOM 與 `window.OS_*` 全域物件，最多需要核心 1-2 個值。扯出來幾乎零風險 —— **這次拆的就是這些**。

## 3. 目標結構

新資料夾 `core/void/`，6 個模組：

| 新檔 | 內容 | 原始行段 | 約行數 |
|---|---|---|--:|
| `prompts.js` | 瀅瀅／柴郡 sysPrompt 模板（從 `sendIrisMessage` 抽成純函式） | L3048-3136 | ~120 |
| `claude-room.js` | Claude 房間 UI：picker + 氣泡渲染 + markdown + 附件 + send | L1682-1757, L1880-2468 | ~660 |
| `canvas.js` | 大廳畫布面板引擎（`LobbyPanelAPI` + 渲染／解析／模板） | L2676-2971 | ~295 |
| `panels.js` | 成就面板 + 404 商店面板 | L3305-3420 | ~115 |
| `ambient.js` | BGM 系統 + 大廳背景時段切換 | L76-114, L153-223 | ~110 |
| `login.js` | 登入畫面 + 存檔管理 | L508-797 | ~290 |

核心 `void_terminal.js` 從 3464 → **約 1900 行**，職責收斂成「狀態 + 持久化 + 場景調度 + 主渲染 + VN 引擎 + 對話核心」。

> 核心 ~1900 行不是「不夠小」—— 纏死的那 2/3 本來就動不得（見 §2）。重點是「亂」被解決：核心變成一條清楚主線，6 個模組各管一件事。

## 4. 模組詳細

每個模組都是獨立檔、獨立 IIFE，公開 API 掛在 `window.VoidXxx`，收尾沿用核心既有模式：`})(window.VoidXxx = window.VoidXxx || {});`。

### 4.1 `prompts.js`（~120 行）

- **搬入**：`sendIrisMessage` 裡那段內嵌的 sysPrompt 模板字串（`is404Room ? \`…柴郡…\` : \`…瀅瀅…\``，L3048-3136）。
- **公開 API**：`VoidPrompts.buildSysPrompt(scene, ctx)`，`scene` ∈ `'iris'` / `'cheshire'`，`ctx = { userName, visit404Count, timeCtx, lobbyTemplateSec, supplement, justReturnedFrom404 }`。
- **用到的橋**：無。純函式。
- **核心改動**：`sendIrisMessage` 本來就已算好這些 context 值，改成 `const sysPrompt = VoidPrompts.buildSysPrompt(is404Room ? 'cheshire' : 'iris', { … })`。模板字串一字不改。

### 4.2 `claude-room.js`（~660 行）

> 與既有的 `core/claude_terminal.js` 不同 —— 那個是後端（API／持久化），本模組是 Claude 房間的 UI 層。

- **搬入**：
  - `_applyClaudeRoomUi`、`_updateClaudePortalBtn`（L1682-1757）
  - inline picker：`CLAUDE_MODELS` / `CLAUDE_EFFORTS` 常數、`_getClaudeRoomCfg` / `_saveClaudeRoomCfg` / `_shortModelLabel` / `_shortEffortLabel` / `_shortEndpointLabel` / `_isAnthropicDirect` / `_updateClaudePickerLabel` / `_openClaudePickerPopup` / `_closeClaudePickerPopup` + popup 外點關閉的 document click listener（L1880-2017）
  - 渲染：`_setClaudePortraitState` / `_scrollClaudeChatToBottom` / `_attachIcon` / `_summarizeToolsUsed` / `_toolDetailLine` / `_claudeMarkdownToSafeHtml` / `_renderClaudeBubble` / `_hydrateClaudeStream`（L2019-2268）
  - 附件 + send：`_renderClaudeAttachChips` / `_handleClaudeFilePick` / `_renderClaudeReply` / `_sendClaudeMessage`（L2270-2468）+ `_pendingClaudeAttachments` 變數（原宣告於核心狀態區 L68，隨本模組搬出）
- **留在核心**：`enterClaudeRoom` / `exitClaudeRoom`（它們 mutate 場景狀態，屬「場景調度」）—— 改成呼叫本模組的 API。
- **公開 API**：`VoidClaudeRoom.{ applyRoomUi, updatePortalBtn, hydrateStream, renderBubble, renderReply, setPortraitState, sendMessage, handleFilePick, openPicker, closePicker, updatePickerLabel }`。
- **用到的橋**：`activeHistory()`（讀 + push `IRIS_STATE.history`）、`scheduleSave()`。
- **模組間依賴**：`_applyClaudeRoomUi` 要暫停 BGM → 呼叫 `VoidAmbient.pauseBgm()`。
- **核心改動**：`enterClaudeRoom` / `exitClaudeRoom` 改呼叫 `VoidClaudeRoom.applyRoomUi()` / `.hydrateStream()` / `.updatePortalBtn()`；`sendIrisMessage` 的 `if (isClaudeRoom) return _sendClaudeMessage(text)` → `return VoidClaudeRoom.sendMessage(text)`；`createTab` 的附件鈕／picker 鈕／file input 接線 → `VoidClaudeRoom.*`；歷史面板 `getCharHistory` / `setCharHistory` 的 claude 分支 → `VoidClaudeRoom.renderBubble` / `.setPortraitState`；`_applyLoadedLobbyState` 的 claude 分支 → `VoidClaudeRoom.applyRoomUi` / `.updatePortalBtn`。

### 4.3 `canvas.js`（~295 行）

- **搬入**：大廳畫布面板引擎 `_makeLobbyPanelAPI` / `_closeLobbyCanvas` / `_rewireOnclicks` / `_renderLobbyPanel` / `_parseLobbyPanel` / `_buildLobbyTemplateCtx` / `_renderLobbyTemplate` / `_detectAndRenderVNBlock`（L2676-2971）。
- **公開 API**：`VoidCanvas.{ closeCanvas, renderPanel, parseLobbyPanel, buildTemplateCtx, renderTemplate, detectAndRenderVNBlock }`。
- **用到的橋**：`is404()`（`_makeLobbyPanelAPI` 判角色名）。`userName` 走既有公開的 `VoidTerminal.getUserName()`。
- **必須保留**：`window._closeLobbyCanvas = closeCanvas;`（L2809 原本就有 —— lobby-panel JS 用 inline onclick 呼叫它）。
- **核心改動**：`sendIrisMessage` 的 `_parseLobbyPanel` / `_renderLobbyPanel` / `_buildLobbyTemplateCtx` / `_renderLobbyTemplate` 呼叫 → `VoidCanvas.*`；`createTab` 的 `lca-close` 鈕接線 → `VoidCanvas.closeCanvas`。

### 4.4 `panels.js`（~115 行）

- **搬入**：成就面板 `openAchievementPanel` / `closeAchievementPanel` / `renderAchievementList`（L3305-3381）+ 404 商店面板 `openStorePanel` / `closeStorePanel` / `_renderStoreContent`（L3383-3420）。
- **公開 API**：`VoidPanels.{ openAchievement, closeAchievement, refreshAchievement, openStore, closeStore }`。
- **用到的橋**：無。純 DOM + `window.OS_ACHIEVEMENT` / `window.OS_404_STORE` / `window.OS_DB`。
- **核心改動**：`createTab` 的 `achievement-hist-btn` / `ach-close-btn` / `store-shop-btn` / `store-close-btn` 接線 → `VoidPanels.*`；`VoidTerminal.openStorePanel` 與 `VoidTerminal.refreshAchievementPanel` 改成 delegate 到 `VoidPanels`（公開介面名稱不變，外部模組無感）。

### 4.5 `ambient.js`（~110 行）

- **搬入**：BGM 系統 `getLobbyBgmEl` / `playLobbyBgm` / `switchLobbyBgm` / `toggleLobbyBgm` / `initBgmState` IIFE / `bgmEnabled` 與相關常數（L153-223）+ 大廳背景時段切換 `_getCafeBgPeriod` / `_msToNextCafePeriod` / `_scheduleCafeBgUpdate` 與 BG URL 模板（L76-114）。
- **公開 API**：`VoidAmbient.{ playBgm, switchBgm, pauseBgm, toggleBgm, currentBgUrl, getBgmEl, isEnabled }`。`playBgm` / `switchBgm` 收場景鍵（`'lobby'` / `'404'`），URL 由模組內部對應（取代核心傳 `URLS.BGM_*`）。
- **用到的橋**：`isActivitySuspended()`（`playLobbyBgm` / `toggleLobbyBgm` 會檢查）。
- **核心改動**：核心所有 `playLobbyBgm` / `switchLobbyBgm` / `toggleLobbyBgm` / `getLobbyBgmEl` 呼叫 → `VoidAmbient.*`；`createTab` 的 `URLS.BG` → `VoidAmbient.currentBgUrl()`，BGM 鈕接線 → `VoidAmbient.toggleBgm`。核心 `URLS` 物件保留 `IRIS_AVATAR`（瀅瀅立繪，場景還原用），`BG` / `BGM_LOBBY` / `BGM_404` 移入 ambient。核心兩處直接讀 `bgmEnabled` 的地方 —— `resumeLobbyActivity`（外部控制 API）與 `createTab` 的 BGM 鈕初始圖示 —— 改用 `VoidAmbient.isEnabled()`。

### 4.6 `login.js`（~290 行）

- **搬入**：`_truncateId` / `_formatSessionTime` / `_injectLoginCss` / `showLoginScreen` / `renderSessionManager` / `closeLoginScreen` / `_renderSessionList`（L508-797）。
- **公開 API**：`VoidLogin.{ showLoginScreen, closeLoginScreen }`（其餘為模組內部）。
- **用到的橋**（最多 —— 這是「半纏」模組的代價）：`loadLobbyHistory(id)` / `saveLobbyHistory()` / `applyLoadedLobbyState()` / `getChatId()` / `applyLayoutMode()` / `getUserName()` / `setUserName(v)` / `resetActiveHistory()`。
- **核心改動**：`createTab` 與 `onShow` 的 `showLoginScreen(tab)` 呼叫 → `VoidLogin.showLoginScreen(tab)`；`VoidTerminal.logout` 的 `showLoginScreen` 呼叫同改。

## 5. 核心內部橋

核心開一個內部物件 `window.VoidTerminal._bridge`，只放葉子真正需要的存取器。模組**原地不動**核心的 `let`，透過橋「借看／借用」。

| 橋成員 | 內容 | 誰用 |
|---|---|---|
| `activeHistory()` | 回傳 `IRIS_STATE.history`（live 參照，可 push） | claude-room |
| `scheduleSave()` | = `debouncedSave()` | claude-room |
| `is404()` | 回傳 `is404Room` | canvas |
| `isActivitySuspended()` | 回傳 `_isActivitySuspended` | ambient |
| `loadLobbyHistory(id)` / `saveLobbyHistory()` / `applyLoadedLobbyState()` / `getChatId()` / `applyLayoutMode()` / `getUserName()` / `setUserName(v)` / `resetActiveHistory()` | 核心函式直通。`setUserName(v)` 為裸 setter（只 `IRIS_STATE.userName = v`，不觸發 save）；`resetActiveHistory` 為新增小函式：`IRIS_STATE.history = []; _irisHistoryBackup = []; _cheshireHistoryBackup = []` | login |

`_bridge` 在 `void_terminal.js` 載入時就建好。因為核心**最後**載入，任何模組函式被觸發時（使用者互動 = 執行時）`_bridge` 必定已存在。

## 6. 載入接線

兩個入口各加 6 行，**葉子排在 `void_terminal` 之前**。

**`index.js`** `MODULE_LOAD_ORDER`（在 L22 `claude_terminal` 之後、L23 `void_terminal` 之前插入）：

```js
{ name: 'void_prompts',     path: './scripts/extensions/third-party/my-tavern-extension/core/void/prompts.js',     key: 'voidPrompts' },
{ name: 'void_ambient',     path: './scripts/extensions/third-party/my-tavern-extension/core/void/ambient.js',     key: 'voidAmbient' },
{ name: 'void_panels',      path: './scripts/extensions/third-party/my-tavern-extension/core/void/panels.js',      key: 'voidPanels' },
{ name: 'void_canvas',      path: './scripts/extensions/third-party/my-tavern-extension/core/void/canvas.js',      key: 'voidCanvas' },
{ name: 'void_claude_room', path: './scripts/extensions/third-party/my-tavern-extension/core/void/claude-room.js', key: 'voidClaudeRoom' },
{ name: 'void_login',       path: './scripts/extensions/third-party/my-tavern-extension/core/void/login.js',       key: 'voidLogin' },
```

**`index.html`**（在 L35 `claude_terminal.js` 之後、L36 `void_terminal.js` 之前插入）：

```html
<script src="core/void/prompts.js"></script>
<script src="core/void/ambient.js"></script>
<script src="core/void/panels.js"></script>
<script src="core/void/canvas.js"></script>
<script src="core/void/claude-room.js"></script>
<script src="core/void/login.js"></script>
```

排序原因：`ambient.js` 在 `claude-room.js` 之前（claude-room 的 `_applyClaudeRoomUi` 會呼叫 `VoidAmbient.pauseBgm()`）。`ambient.js` 用到 `window.AureliaVoidStyles`（定義在 `ui_utilities.js` L338）—— `ui_utilities` 已在 `void_terminal` 之前載入，葉子插在它後面自然滿足。

## 7. 執行順序為什麼安全

所有跨檔呼叫都是**執行時**（使用者點了才跑），不是**載入時**。各模組的載入時程式碼都自給自足：

- `ambient.js`：`initBgmState`（讀 localStorage）+ `_scheduleCafeBgUpdate`（`setTimeout`，定時器數小時後才 fire）
- `claude-room.js`：一個 `document.addEventListener('click')`（listener body 只呼叫同檔函式）
- 其餘 4 個：無載入時程式碼

所以即使順序排錯，最差是 console 報一聲 undefined，不會白畫面。但仍照「葉子先、核心後」最乾淨。

## 8. 驗證策略

這是重構，驗證比寫扣重要。**驗證目標以酒館版為主**（Rae 日常用酒館版），PWA 版做基本確認。

**三層保險：**

1. **每抽一個模組 commit 一次** —— 6 模組 = 6 個 commit（外加 1 個建資料夾／接線的前置 commit）。哪個 commit 拆壞，git bisect 一眼看出，單獨退那筆。

2. **靜態檢查（丹做）** —— 每個搬走的函式：引用接得上嗎？每個 `VoidTerminal.xxx` 公開介面還在嗎？`_bridge` 有沒有漏接？inline onclick 用到的全域還在嗎？

3. **手動煙霧測試（Rae 做）** —— 照清單走一遍，F12 console 應只有 `✅…就緒` + 6 個模組 log，零紅字：
   - [ ] 開大廳 → 登入畫面 → 輸入代號 → 進入
   - [ ] 跟瀅瀅對話（送訊息、打字機效果、世界頻道氣泡）
   - [ ] 戳瀅瀅（反應框 + 語音）；放置語音
   - [ ] BGM 開關鈕、全屏鈕 ⛶
   - [ ] 輸入 `ERR_404` → 進 404 → 跟柴郡對話 → 頂部傳送鈕回大廳
   - [ ] 進 Claude 房間 → 送訊息 → picker 換 model → 附加檔案 → 退出
   - [ ] 歷史面板（瀅瀅／柴郡／Claude 三個）→ 編輯／刪除／回退／清空 → Claude「開新對話」
   - [ ] 成就面板、黑市面板開關
   - [ ] 觸發大廳畫布面板（AI 回覆帶 `<lobbyPanel>`）
   - [ ] 切 chatId → 場景重置／自動登入
   - [ ] 重整頁面 → 自動還原（登入狀態 + 場景 + 歷史）

## 9. 風險與緩解

| 風險 | 緩解 |
|---|---|
| 載入順序錯 | 跨檔呼叫全是執行時 + 核心最後載 → `_bridge` 必先於任何模組函式存在 |
| inline onclick 全域 | `window._closeLobbyCanvas`（L2809）被 lobby-panel JS 用 inline onclick 呼叫 → `canvas.js` 必須保留 `window._closeLobbyCanvas = …` |
| 雙入口漏接 | `index.js` / `index.html` 兩邊都要加 6 行，漏一邊一個版本就壞 → commit 前 diff 兩檔都檢查 |
| 模組間互呼 | claude-room → ambient（`pauseBgm`）→ ambient 必須排在 claude-room 前 |
| `'use strict'` | 每個新檔開頭都加，與核心一致 |
| login 雙存 | `doLogin` 自己會 `await saveLobbyHistory()` → 橋的 `setUserName(v)` 設計為裸 setter（不觸發 debounce save）；核心既有的公開 `VoidTerminal.setUserName` 維持原 debounce 行為不變 |

## 10. 不做什麼（YAGNI）

- 不動纏死的核心 —— 只搬，不改邏輯
- 零行為改動 —— 不修 bug、不改 UI、`prompts.js` 是「搬字串」一字不改
- 不改樣式（另一個任務 —— Rae 請 GPT 出設計圖）
- 不清死碼（README「☠️ 死碼待清理」是另一個 TODO）
- 不碰 `claude_terminal.js`（已是獨立檔）、不碰 `ui_utilities.js` 的 `AureliaVoidStyles`

## 11. 完成後

- 更新 `README.md`「目錄結構」：`core/` 區塊加 `core/void/` 6 個檔、`void_terminal.js` 行數更新
- CHANGELOG 在 `_archive/CHANGELOG.md`，視 Rae 習慣決定要不要記
