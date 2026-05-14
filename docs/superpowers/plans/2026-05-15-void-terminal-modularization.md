# 大廳模組化重構 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 3464 行的 `core/void_terminal.js` 拆成「核心 + `core/void/` 下 6 個小模組」，零行為改動。

**Architecture:** 只抽「鬆耦合的葉子」（只摸 DOM 與 `window.OS_*`）成獨立 IIFE 檔，公開 API 掛 `window.VoidXxx`；纏死的核心（共用 `IRIS_STATE` / `is404Room` 等閉包狀態）原地不動。核心開一個內部橋 `VoidTerminal._bridge` 讓葉子借用少數核心狀態／函式。設計細節見 spec：`docs/superpowers/specs/2026-05-15-void-terminal-modularization-design.md`。

**Tech Stack:** 純前端 JS（IIFE 模式、無模組打包），雙入口載入（`index.js` 酒館 / `index.html` PWA）。

**驗證方式（重要）：** 本專案沒有測試框架（SillyTavern UI 擴展）。這是純搬程式碼的重構，每個任務的驗證 = `node --check`（語法）+ Grep 靜態檢查（舊函式名在核心已歸零、新檔有 export、無懸空引用）。最終驗證 = Rae 在酒館版手動煙霧測試（Task 8）。此驗證策略已在 spec §8 由 Rae 核准。

**任務順序：** 由安全到危險、且滿足相依（`ambient` 必須在 `claude-room` 之前，因為 `claude-room` 會呼叫 `VoidAmbient`）。每任務一個 commit，共 9 個 commit。

**行號說明：** 文中行號為「重構前」的 `void_terminal.js` 位置，僅供定位。每抽一個模組行號會位移 —— 執行每個任務前先 Read 當前檔案、用「區段註解 / 函式名」這類穩定錨點定位，不要硬套行號。

---

### Task 1: 內部橋 scaffold

在 `void_terminal.js` 加入 `_bridge` 物件與 `resetActiveHistory` 輔助函式。本任務不抽任何東西，只鋪基礎設施。`_bridge` 的 getter 都是惰性箭頭函式，引用的 `let`（`IRIS_STATE` / `is404Room` / `_isActivitySuspended`）與函式（`debouncedSave` / `loadLobbyHistory`…）此時皆已宣告。

**Files:**
- Modify: `core/void_terminal.js`（在結尾 `console.log('✅ 大廳敘事引擎...')` 之前插入，約 L3462 前）

- [ ] **Step 1: 加入 `_bridge` 與 `resetActiveHistory`**

在 `void_terminal.js` 結尾、`console.log('✅ 大廳敘事引擎 (VoidTerminal) 模組就緒 ...')` 那行**之前**插入：

```js
    // ===== 內部橋（給 core/void/ 子模組借用核心狀態與函式）=====
    function resetActiveHistory() {
        IRIS_STATE.history = [];
        _irisHistoryBackup = [];
        _cheshireHistoryBackup = [];
    }
    VoidTerminal._bridge = {
        // claude-room.js
        activeHistory: () => IRIS_STATE.history,
        scheduleSave:  () => debouncedSave(),
        isClaudeRoom:  () => isClaudeRoom,
        // canvas.js
        is404: () => is404Room,
        // ambient.js
        isActivitySuspended: () => _isActivitySuspended,
        // login.js
        loadLobbyHistory:      (id) => loadLobbyHistory(id),
        saveLobbyHistory:      () => saveLobbyHistory(),
        applyLoadedLobbyState: () => _applyLoadedLobbyState(),
        getChatId:             () => getChatId(),
        applyLayoutMode:       () => applyLayoutMode(),
        setCurrentChatId:      (id) => { _currentChatId = id; },
        setUserName:           (v) => { IRIS_STATE.userName = v; },
        resetActiveHistory:    () => resetActiveHistory(),
    };
```

- [ ] **Step 2: 語法檢查**

Run: `node --check core/void_terminal.js`
Expected: 無輸出（語法正確）

- [ ] **Step 3: 確認 `_bridge` 引用的名稱都存在**

Grep `core/void_terminal.js` for `function debouncedSave|function loadLobbyHistory|function saveLobbyHistory|function _applyLoadedLobbyState|function getChatId|function applyLayoutMode`
Expected: 6 個函式定義都在（`_bridge` 的 getter 不會炸）

- [ ] **Step 4: Commit**

```bash
git add core/void_terminal.js
git commit -m "大廳重構 1/9：加 VoidTerminal._bridge 內部橋 scaffold"
```

---

### Task 2: 抽 `panels.js`（成就面板 + 404 商店面板）

最安全的一塊 —— 零橋接，6 個函式只摸 DOM 與 `window.OS_ACHIEVEMENT` / `window.OS_404_STORE` / `window.OS_DB`。

**Files:**
- Create: `core/void/panels.js`
- Modify: `core/void_terminal.js`（移出 `// ===== 成就面板 =====` 與 `// ===== 404 商店面板 =====` 兩個區段；改 6 處呼叫點 + 2 處 export）
- Modify: `index.js`、`index.html`

- [ ] **Step 1: 建 `core/void/panels.js`**

```js
/**
 * core/void/panels.js — 成就面板 + 404 商店面板
 * 從 void_terminal.js 抽出。零橋接：只摸 DOM + window.OS_*。
 */
(function (VoidPanels) {
    'use strict';

    // ── 成就面板：移入 openAchievementPanel / closeAchievementPanel / renderAchievementList ──
    // （此處貼入 void_terminal.js「// ===== 成就面板 =====」區段的三個函式，一字不改）

    // ── 404 商店面板：移入 openStorePanel / closeStorePanel / _renderStoreContent ──
    // （此處貼入 void_terminal.js「// ===== 404 商店面板 =====」區段的三個函式，一字不改）

    // refreshAchievement：原 VoidTerminal.refreshAchievementPanel 的函式體（render + 按鈕圓點）搬進來
    function refreshAchievement() {
        const overlay = document.getElementById('achievement-panel-overlay');
        if (overlay && overlay.style.display !== 'none') renderAchievementList();
        const achBtn = document.getElementById('achievement-hist-btn');
        if (achBtn && window.OS_ACHIEVEMENT) {
            const hasPending = window.OS_ACHIEVEMENT.getPending().length > 0;
            if (hasPending) achBtn.classList.add('has-pending');
            else            achBtn.classList.remove('has-pending');
        }
    }

    VoidPanels.openAchievement       = openAchievementPanel;
    VoidPanels.closeAchievement      = closeAchievementPanel;
    VoidPanels.renderAchievementList = renderAchievementList;
    VoidPanels.refreshAchievement    = refreshAchievement;
    VoidPanels.openStore             = openStorePanel;
    VoidPanels.closeStore            = closeStorePanel;

    console.log('✅ VoidPanels（成就 + 商店面板）模組就緒');
})(window.VoidPanels = window.VoidPanels || {});
```

- [ ] **Step 2: 從 `void_terminal.js` 剪出兩個區段**

剪掉 `// ===== 成就面板 =====`（含 `openAchievementPanel` / `closeAchievementPanel` / `renderAchievementList`）與 `// ===== 404 商店面板 =====`（含 `openStorePanel` / `closeStorePanel` / `_renderStoreContent`）整段，貼進 `panels.js` Step 1 標註的位置。

- [ ] **Step 3: 改核心 4 處呼叫點 + 2 處 export**

在 `void_terminal.js` 的 `createTab` setTimeout 接線區：
```
openAchievementPanel              → VoidPanels.openAchievement
closeAchievementPanel             → VoidPanels.closeAchievement
openStorePanel（addEventListener）→ VoidPanels.openStore
closeStorePanel                   → VoidPanels.closeStore
```
結尾 export 區：
```js
// 改前：
VoidTerminal.openStorePanel = openStorePanel;
// 改後：
VoidTerminal.openStorePanel = () => VoidPanels.openStore();
```
```js
// 改前：VoidTerminal.refreshAchievementPanel = function() { ...完整函式體... };
// 改後：
VoidTerminal.refreshAchievementPanel = () => VoidPanels.refreshAchievement();
```

- [ ] **Step 4: 接線 —— `index.js` + `index.html`**

`index.js` `MODULE_LOAD_ORDER`：在 `void_terminal` 那筆**之前**插入：
```js
    { name: 'void_panels', path: './scripts/extensions/third-party/my-tavern-extension/core/void/panels.js', key: 'voidPanels' },
```
`index.html`：在 `<script src="core/void_terminal.js"></script>` **之前**插入：
```html
    <script src="core/void/panels.js"></script>
```

- [ ] **Step 5: 語法檢查**

Run: `node --check core/void/panels.js && node --check core/void_terminal.js && node --check index.js`
Expected: 無輸出

- [ ] **Step 6: 靜態檢查 —— 舊名歸零**

Grep `core/void_terminal.js` for `openAchievementPanel|closeAchievementPanel|renderAchievementList|openStorePanel|closeStorePanel|_renderStoreContent`
Expected: **0 筆**（全部移出、所有呼叫點已改成 `VoidPanels.*`）

Grep `core/void/panels.js` for `VoidPanels\.(openAchievement|closeAchievement|openStore|closeStore|refreshAchievement|renderAchievementList)\s*=`
Expected: 6 筆 export 都在

- [ ] **Step 7: Commit**

```bash
git add core/void/panels.js core/void_terminal.js index.js index.html
git commit -m "大廳重構 2/9：抽 core/void/panels.js（成就 + 商店面板）"
```

---

### Task 3: 抽 `prompts.js`（瀅瀅 / 柴郡 sysPrompt 模板）

把 `sendIrisMessage` 裡內嵌的兩大段 sysPrompt 模板字串抽成純函式。**模板文字一字不改**，只把區域變數引用對應到參數。

**Files:**
- Create: `core/void/prompts.js`
- Modify: `core/void_terminal.js`（`sendIrisMessage` 內 `const sysPrompt = is404Room ? ... : ...;` 區塊，約 L3048-3136）
- Modify: `index.js`、`index.html`

- [ ] **Step 1: 建 `core/void/prompts.js`**

```js
/**
 * core/void/prompts.js — 瀅瀅 / 柴郡 sysPrompt 模板
 * 從 void_terminal.js 的 sendIrisMessage 抽出。純函式，零橋接。
 */
(function (VoidPrompts) {
    'use strict';

    // buildSysPrompt(scene, ctx)
    //   scene: 'iris' | 'cheshire'
    //   ctx: { userName, visit404Count, timeCtx, lobbyTemplateSec, supplement, justReturnedFrom404 }
    function buildSysPrompt(scene, ctx) {
        const { userName, visit404Count, timeCtx, lobbyTemplateSec, supplement, justReturnedFrom404 } = ctx;
        if (scene === 'cheshire') {
            return `你現在是「柴郡 (Cheshire)」，404號房的管理員...`;
            // ↑ 貼入 sendIrisMessage 原 `is404Room ?` 分支的 backtick 模板，一字不改，
            //   再把模板內的變數引用做下列對應。
        }
        return `你現在是「瀅瀅 (Yingying)」，LUNA-VII 敘事採集端 AI...`;
        // ↑ 貼入原 `: ` else 分支的 backtick 模板，同樣做變數對應。
    }

    VoidPrompts.buildSysPrompt = buildSysPrompt;
    console.log('✅ VoidPrompts（角色提示詞模板）模組就緒');
})(window.VoidPrompts = window.VoidPrompts || {});
```

- [ ] **Step 2: 貼入模板並做變數對應**

把 `sendIrisMessage` 內 `const sysPrompt = is404Room ? \`柴郡模板\` : \`瀅瀅模板\`;` 的兩段 backtick 內容分別貼進 `buildSysPrompt` 的 `cheshire` 分支與 else 分支。模板內這 6 個區域變數引用做對應改名（其餘文字一字不動）：

| 模板原本寫 | 改成 |
|---|---|
| `${currentUserName}` | `${userName}` |
| `${visit404Count ...}` | `${visit404Count ...}`（同名，不改） |
| `${_buildTimeCtx()}` | `${timeCtx}` |
| `${lobbyTemplateSec}` | `${lobbyTemplateSec}`（同名，不改） |
| `${cheshireSupplement ? ...}` / `${irisSupplement ? ...}` | `${supplement ? ...}` |
| `${_justReturnedFrom404 ? ...}` | `${justReturnedFrom404 ? ...}` |

- [ ] **Step 3: 改 `sendIrisMessage` 的呼叫點**

`void_terminal.js` `sendIrisMessage` 內，把整個 `const sysPrompt = is404Room ? \`...\` : \`...\`;` 區塊（約 L3048-3136）換成：

```js
            const sysPrompt = VoidPrompts.buildSysPrompt(is404Room ? 'cheshire' : 'iris', {
                userName: currentUserName,
                visit404Count,
                timeCtx: _buildTimeCtx(),
                lobbyTemplateSec,
                supplement: is404Room ? cheshireSupplement : irisSupplement,
                justReturnedFrom404: _justReturnedFrom404,
            });
```

> 注意：`_buildTimeCtx`、`currentUserName`、`lobbyTemplateSec`、`irisSupplement`、`cheshireSupplement`、`_justReturnedFrom404`、`visit404Count` 全部維持在核心，不動。

- [ ] **Step 4: 接線**

`index.js` `MODULE_LOAD_ORDER`：在 `void_terminal` 之前、`void_panels` 之後插入：
```js
    { name: 'void_prompts', path: './scripts/extensions/third-party/my-tavern-extension/core/void/prompts.js', key: 'voidPrompts' },
```
`index.html`：在 `core/void_terminal.js` 之前、`core/void/panels.js` 之後插入：
```html
    <script src="core/void/prompts.js"></script>
```

- [ ] **Step 5: 語法檢查**

Run: `node --check core/void/prompts.js && node --check core/void_terminal.js && node --check index.js`
Expected: 無輸出

- [ ] **Step 6: 靜態檢查**

Grep `core/void_terminal.js` for `你現在是「柴郡|你現在是「瀅瀅`
Expected: **0 筆**（模板已移出）

Grep `core/void_terminal.js` for `VoidPrompts.buildSysPrompt`
Expected: 1 筆（呼叫點）

- [ ] **Step 7: Commit**

```bash
git add core/void/prompts.js core/void_terminal.js index.js index.html
git commit -m "大廳重構 3/9：抽 core/void/prompts.js（角色 sysPrompt 模板）"
```

---

### Task 4: 抽 `ambient.js`（BGM 系統 + 大廳背景時段切換）

需要 1 個橋 getter（`isActivitySuspended`）。`bgmEnabled` 變數（原 L71，在狀態宣告區）隨本模組搬出。`URLS` 物件要**拆開**：`BGM_LOBBY` / `BGM_404` / `BG`-時段邏輯移入 ambient，`IRIS_AVATAR` 留核心。

**Files:**
- Create: `core/void/ambient.js`
- Modify: `core/void_terminal.js`（移出 BGM 系統 + BG 時段切換 + `bgmEnabled`；拆 `URLS`；改約 13 處呼叫點）
- Modify: `index.js`、`index.html`

- [ ] **Step 1: 建 `core/void/ambient.js`**

```js
/**
 * core/void/ambient.js — 大廳 BGM 系統 + 背景時段切換
 * 從 void_terminal.js 抽出。橋：VoidTerminal._bridge.isActivitySuspended()。
 */
(function (VoidAmbient) {
    'use strict';

    const BGM_URLS = {
        lobby: 'https://nancywang3641.github.io/sound-files/home-page/home_yingcafe.mp3',
        404:   'https://nancywang3641.github.io/sound-files/home-page/home_room404.mp3',
    };
    const BASE_BG = 'https://nancywang3641.github.io/sound-files/home-page/';

    let bgmEnabled = true;
    // ── 移入：BGM 常數（BGM_VOLUME / _bgmRetryTimer / _bgmRetryCount / BGM_MAX_RETRY / BGM_RETRY_DELAY）──
    // ── 移入：getLobbyBgmEl / playLobbyBgm / switchLobbyBgm / toggleLobbyBgm（一字不改，內部改動見 Step 2）──
    // ── 移入：_getCafeBgPeriod / _msToNextCafePeriod / _scheduleCafeBgUpdate / _cafeBgTimer ──
    // ── 移入：initBgmState 那個 IIFE ──

    function _bridge() { return window.VoidTerminal && window.VoidTerminal._bridge; }

    VoidAmbient.getBgmEl     = getLobbyBgmEl;
    VoidAmbient.playBgm      = (scene) => playLobbyBgm(BGM_URLS[scene]);
    VoidAmbient.switchBgm    = (scene) => switchLobbyBgm(BGM_URLS[scene]);
    VoidAmbient.pauseBgm     = () => { const a = getLobbyBgmEl(); if (a) a.pause(); };
    VoidAmbient.toggleBgm    = toggleLobbyBgm;
    VoidAmbient.isEnabled    = () => bgmEnabled;
    VoidAmbient.currentBgUrl = () => `${BASE_BG}YingyingCafe_${_getCafeBgPeriod()}.png`;

    console.log('✅ VoidAmbient（BGM + 背景時段）模組就緒');
})(window.VoidAmbient = window.VoidAmbient || {});
```

- [ ] **Step 2: 移入程式碼，並把 `_isActivitySuspended` 改走橋**

從 `void_terminal.js` 移出（剪下貼入 ambient.js）：
- `// ===== BGM 系統 =====` 整段（`initBgmState` IIFE、`getLobbyBgmEl`、`BGM_VOLUME` 等常數、`playLobbyBgm`、`switchLobbyBgm`、`toggleLobbyBgm`）
- BG 時段切換段（`_getCafeBgPeriod`、`_msToNextCafePeriod`、`_scheduleCafeBgUpdate`、`_cafeBgTimer`，約 L76-114 但**不含** `URLS` 物件）
- 狀態宣告區的 `let bgmEnabled = true;`（原 L71）

`playLobbyBgm` 與 `toggleLobbyBgm` 內原本讀 `_isActivitySuspended` 的地方 → 改成 `_bridge() && _bridge().isActivitySuspended()`。

`_scheduleCafeBgUpdate` 內原本 `window.AureliaVoidStyles.inject(URLS.BG)` → 改成 `window.AureliaVoidStyles.inject(VoidAmbient.currentBgUrl())`。

- [ ] **Step 3: 拆 `void_terminal.js` 的 `URLS` 物件**

`URLS` 物件（原 L83-90）只保留 `IRIS_AVATAR`，刪掉 `BG` getter、`BGM_LOBBY`、`BGM_404`：
```js
    const URLS = {
        IRIS_AVATAR: 'https://nancywang3641.github.io/sound-files/char_presets/ying.png',
    };
```

- [ ] **Step 4: 改核心呼叫點**

> 本任務後 `getLobbyBgmEl` / `playLobbyBgm` / `switchLobbyBgm` / `toggleLobbyBgm` / `bgmEnabled` 都已移出核心，**所有**呼叫點都必須改完（含還留在核心的 `_applyClaudeRoomUi`、`enter404Room`、`restoreLobby`、`exitClaudeRoom`），否則核心有懸空引用。

| `void_terminal.js` 原本 | 改成 | 出現位置（重構前行號，需重新定位） |
|---|---|---|
| `const audio = getLobbyBgmEl(); if (audio) audio.pause();` | `VoidAmbient.pauseBgm();` | 可見性監聽 L332、`onHide` L400、`suspendLobbyActivity` L408、`_applyClaudeRoomUi` L1730 |
| `playLobbyBgm(bgmUrl)`（`bgmUrl = is404Room ? URLS.BGM_404 : URLS.BGM_LOBBY`） | `VoidAmbient.playBgm(is404Room ? '404' : 'lobby')` | 可見性監聽 L344、`onShow` L356 |
| `const audio = getLobbyBgmEl(); if (audio && bgmEnabled) audio.play()…` | `const audio = VoidAmbient.getBgmEl(); if (audio && VoidAmbient.isEnabled()) audio.play()…` | `resumeLobbyActivity` L417-418 |
| `switchLobbyBgm(URLS.BGM_404)` | `VoidAmbient.switchBgm('404')` | `_applyLoadedLobbyState` L860、`enter404Room` L2488 |
| `switchLobbyBgm(URLS.BGM_LOBBY)` | `VoidAmbient.switchBgm('lobby')` | `_applyLoadedLobbyState` L892、`exitClaudeRoom` L1837、`restoreLobby` L2543 |
| `bgmBtn.textContent = bgmEnabled ? '🔊' : '🔇';` | `bgmBtn.textContent = VoidAmbient.isEnabled() ? '🔊' : '🔇';` | `createTab` L1272 |
| `bgmBtn.onclick = toggleLobbyBgm;` | `bgmBtn.onclick = VoidAmbient.toggleBgm;` | `createTab` L1273 |
| `window.AureliaVoidStyles.inject(URLS.BG)` | `window.AureliaVoidStyles.inject(VoidAmbient.currentBgUrl())` | `createTab` L916 |

> `_applyClaudeRoomUi` 的 BGM-pause 行在本任務就改成 `VoidAmbient.pauseBgm();`；Task 6 把 `_applyClaudeRoomUi` 搬進 `claude-room.js` 時，這行已是正確的，原樣搬走即可。

- [ ] **Step 5: 接線**

`index.js`：`void_panels` 之後、`void_terminal` 之前插入：
```js
    { name: 'void_ambient', path: './scripts/extensions/third-party/my-tavern-extension/core/void/ambient.js', key: 'voidAmbient' },
```
`index.html`：`core/void/panels.js` 之後、`core/void_terminal.js` 之前插入：
```html
    <script src="core/void/ambient.js"></script>
```

- [ ] **Step 6: 語法檢查**

Run: `node --check core/void/ambient.js && node --check core/void_terminal.js && node --check index.js`
Expected: 無輸出

- [ ] **Step 7: 靜態檢查**

Grep `core/void_terminal.js` for `function playLobbyBgm|function switchLobbyBgm|function toggleLobbyBgm|function getLobbyBgmEl|let bgmEnabled|URLS.BGM_|URLS.BG\b`
Expected: **0 筆**

Grep `core/void_terminal.js` for `\bplayLobbyBgm\(|\bswitchLobbyBgm\(|\btoggleLobbyBgm\b|\bgetLobbyBgmEl\(|\bbgmEnabled\b`
Expected: **0 筆**（所有呼叫點已改 `VoidAmbient.*`）

- [ ] **Step 8: Commit**

```bash
git add core/void/ambient.js core/void_terminal.js index.js index.html
git commit -m "大廳重構 4/9：抽 core/void/ambient.js（BGM + 背景時段切換）"
```

---

### Task 5: 抽 `canvas.js`（大廳畫布面板引擎）

需要 1 個橋 getter（`is404`）。`userName` 走既有公開的 `VoidTerminal.getUserName()`。

> **spec §4.3 修正：** 公開 API 除了 spec 列的，還要加 `makeLobbyPanelAPI` 與 `rewireOnclicks` —— 因為 `sendIrisMessage` 裡有一段 inline VN-block 偵測（約 L3213-3256）直接呼叫這兩個函式。

> `_detectAndRenderVNBlock`（約 L2930）目前**無呼叫點**（已被 `sendIrisMessage` 的 inline 版取代）。它仍隨本區段搬入 `canvas.js`，但**不要刪**（spec §10：零行為改動、不碰死碼）。

**Files:**
- Create: `core/void/canvas.js`
- Modify: `core/void_terminal.js`（移出 `// ===== 大廳畫布面板引擎 =====` 整段；改約 8 處呼叫點）
- Modify: `index.js`、`index.html`

- [ ] **Step 1: 建 `core/void/canvas.js`**

```js
/**
 * core/void/canvas.js — 大廳畫布面板引擎（LobbyPanelAPI + 渲染/解析/模板）
 * 從 void_terminal.js 抽出。橋：VoidTerminal._bridge.is404()。userName 走 VoidTerminal.getUserName()。
 */
(function (VoidCanvas) {
    'use strict';

    function _bridge() { return window.VoidTerminal && window.VoidTerminal._bridge; }

    // ── 移入：_makeLobbyPanelAPI / _closeLobbyCanvas / _rewireOnclicks / _renderLobbyPanel
    //         / _parseLobbyPanel / _buildLobbyTemplateCtx / _renderLobbyTemplate / _detectAndRenderVNBlock ──
    // （整段「// ===== 大廳畫布面板引擎 =====」一字不改貼入；內部改動見 Step 2）

    // 給 lobby-panel 的 inline onclick 用（原 void_terminal.js L2809 就有）
    window._closeLobbyCanvas = _closeLobbyCanvas;

    VoidCanvas.closeCanvas           = _closeLobbyCanvas;
    VoidCanvas.renderPanel           = _renderLobbyPanel;
    VoidCanvas.parseLobbyPanel       = _parseLobbyPanel;
    VoidCanvas.buildTemplateCtx      = _buildLobbyTemplateCtx;
    VoidCanvas.renderTemplate        = _renderLobbyTemplate;
    VoidCanvas.detectAndRenderVNBlock = _detectAndRenderVNBlock;
    VoidCanvas.makeLobbyPanelAPI     = _makeLobbyPanelAPI;
    VoidCanvas.rewireOnclicks        = _rewireOnclicks;

    console.log('✅ VoidCanvas（大廳畫布面板引擎）模組就緒');
})(window.VoidCanvas = window.VoidCanvas || {});
```

- [ ] **Step 2: 移入程式碼，把 `is404Room` / `IRIS_STATE.userName` 改走橋**

從 `void_terminal.js` 剪出 `// ===== 大廳畫布面板引擎 =====` 整段（8 個函式 + `window._closeLobbyCanvas = ...` 那行），貼入 canvas.js。

`_makeLobbyPanelAPI` 內：
- `charName: is404Room ? '柴郡' : '瀅瀅'` → `charName: (_bridge() && _bridge().is404()) ? '柴郡' : '瀅瀅'`
- `userName: IRIS_STATE.userName || '委託人'` → `userName: (window.VoidTerminal && window.VoidTerminal.getUserName()) || '委託人'`
- `chat` / `move` 方法內的 `is404Room` 判斷同樣改 `_bridge().is404()`

- [ ] **Step 3: 改核心呼叫點**

| `void_terminal.js` 原本 | 改成 | 位置 |
|---|---|---|
| `lcaCloseBtn.addEventListener('click', _closeLobbyCanvas)` | `... 'click', VoidCanvas.closeCanvas)` | `createTab` L1339 |
| `await _buildLobbyTemplateCtx()` | `await VoidCanvas.buildTemplateCtx()` | `sendIrisMessage` L3046 |
| `_parseLobbyPanel(reply)` | `VoidCanvas.parseLobbyPanel(reply)` | `sendIrisMessage` L3197 |
| `_renderLobbyPanel(lobbyPanelData)` | `VoidCanvas.renderPanel(lobbyPanelData)` | `sendIrisMessage` L3200 |
| `_renderLobbyTemplate(tplTagId)` | `VoidCanvas.renderTemplate(tplTagId)` | `sendIrisMessage` L3209 |
| `_makeLobbyPanelAPI()` | `VoidCanvas.makeLobbyPanelAPI()` | `sendIrisMessage` inline block L3243 |
| `_closeLobbyCanvas`（傳給 `fn(...)` 當參數） | `VoidCanvas.closeCanvas` | `sendIrisMessage` inline block L3247 |
| `_rewireOnclicks(content, LP3)` | `VoidCanvas.rewireOnclicks(content, LP3)` | `sendIrisMessage` inline block L3249 |

- [ ] **Step 4: 接線**

`index.js`：`void_ambient` 之後、`void_terminal` 之前：
```js
    { name: 'void_canvas', path: './scripts/extensions/third-party/my-tavern-extension/core/void/canvas.js', key: 'voidCanvas' },
```
`index.html`：`core/void/ambient.js` 之後、`core/void_terminal.js` 之前：
```html
    <script src="core/void/canvas.js"></script>
```

- [ ] **Step 5: 語法檢查**

Run: `node --check core/void/canvas.js && node --check core/void_terminal.js && node --check index.js`
Expected: 無輸出

- [ ] **Step 6: 靜態檢查**

Grep `core/void_terminal.js` for `function _makeLobbyPanelAPI|function _closeLobbyCanvas|function _rewireOnclicks|function _renderLobbyPanel|function _parseLobbyPanel|function _buildLobbyTemplateCtx|function _renderLobbyTemplate|function _detectAndRenderVNBlock`
Expected: **0 筆**

Grep `core/void_terminal.js` for `_makeLobbyPanelAPI\(|_closeLobbyCanvas|_rewireOnclicks\(|_renderLobbyPanel\(|_parseLobbyPanel\(|_buildLobbyTemplateCtx\(|_renderLobbyTemplate\(`
Expected: **0 筆**（呼叫點全改 `VoidCanvas.*`）

- [ ] **Step 7: Commit**

```bash
git add core/void/canvas.js core/void_terminal.js index.js index.html
git commit -m "大廳重構 5/9：抽 core/void/canvas.js（大廳畫布面板引擎）"
```

---

### Task 6: 抽 `claude-room.js`（Claude 房間 UI）

最大一塊（~660 行）。需要 2 個橋（`activeHistory` / `scheduleSave`），並會呼叫 `VoidAmbient`（故必須在 Task 4 之後）。`enterClaudeRoom` / `exitClaudeRoom` **留在核心**（它們 mutate 場景狀態），改成呼叫本模組。`_pendingClaudeAttachments` 變數（原狀態區 L68）隨本模組搬出。

**搬入清單**（從 `void_terminal.js` 剪出，皆一字不改）：
- `_applyClaudeRoomUi`、`_updateClaudePortalBtn`（`// ===== 🦀 Claude 房間 =====` 區段內，**但不含** `enterClaudeRoom` / `exitClaudeRoom`）
- inline picker 整段：`CLAUDE_MODELS` / `CLAUDE_EFFORTS` / `_getClaudeRoomCfg` / `_saveClaudeRoomCfg` / `_shortModelLabel` / `_shortEffortLabel` / `_shortEndpointLabel` / `_isAnthropicDirect` / `_updateClaudePickerLabel` / `_openClaudePickerPopup` / `_closeClaudePickerPopup` + 「點 popup 外面關閉」的 `document.addEventListener('click', ...)`
- 渲染整段：`_setClaudePortraitState` / `_scrollClaudeChatToBottom` / `_attachIcon` / `_summarizeToolsUsed` / `_toolDetailLine` / `_claudeMarkdownToSafeHtml` / `_renderClaudeBubble` / `_hydrateClaudeStream`
- 附件 + send 整段：`_renderClaudeAttachChips` / `_handleClaudeFilePick` / `_renderClaudeReply` / `_sendClaudeMessage`
- `let _pendingClaudeAttachments = [];`（原狀態區 L68）

**Files:**
- Create: `core/void/claude-room.js`
- Modify: `core/void_terminal.js`（移出上述；改 14 處呼叫點）
- Modify: `index.js`、`index.html`

- [ ] **Step 1: 建 `core/void/claude-room.js`**

```js
/**
 * core/void/claude-room.js — Claude 房間 UI 層
 * 從 void_terminal.js 抽出。橋：activeHistory() / scheduleSave()。會呼叫 VoidAmbient。
 * 注意：與 core/claude_terminal.js 不同 —— 那個是後端（API/持久化），本檔是 UI。
 */
(function (VoidClaudeRoom) {
    'use strict';

    function _bridge() { return window.VoidTerminal._bridge; }

    let _pendingClaudeAttachments = [];

    // ── 移入：上方「搬入清單」的全部函式與常數，一字不改（內部改動見 Step 2）──

    VoidClaudeRoom.applyRoomUi        = _applyClaudeRoomUi;
    VoidClaudeRoom.updatePortalBtn    = _updateClaudePortalBtn;
    VoidClaudeRoom.updatePickerLabel  = _updateClaudePickerLabel;
    VoidClaudeRoom.openPicker         = _openClaudePickerPopup;
    VoidClaudeRoom.closePicker        = _closeClaudePickerPopup;
    VoidClaudeRoom.setPortraitState   = _setClaudePortraitState;
    VoidClaudeRoom.renderBubble       = _renderClaudeBubble;
    VoidClaudeRoom.renderReply        = _renderClaudeReply;
    VoidClaudeRoom.hydrateStream      = _hydrateClaudeStream;
    VoidClaudeRoom.handleFilePick     = _handleClaudeFilePick;
    VoidClaudeRoom.sendMessage        = _sendClaudeMessage;

    console.log('✅ VoidClaudeRoom（Claude 房間 UI）模組就緒');
})(window.VoidClaudeRoom = window.VoidClaudeRoom || {});
```

- [ ] **Step 2: 移入程式碼，改內部引用**

從 `void_terminal.js` 剪出「搬入清單」全部，貼進 claude-room.js。然後改模組內部對核心狀態/函式的引用：
- `_sendClaudeMessage` 內 `IRIS_STATE.history` → `_bridge().activeHistory()`（讀與 `.push()` 都用這個；它回傳 live 參照）
- `_hydrateClaudeStream` 內 `IRIS_STATE.history` → `_bridge().activeHistory()`
- `_sendClaudeMessage` 內 `debouncedSave()` → `_bridge().scheduleSave()`
- `_updateClaudePortalBtn` 內 `if (isClaudeRoom)` → `if (_bridge().isClaudeRoom())`

> `_applyClaudeRoomUi` 的 BGM-pause 行 Task 4 已改成 `VoidAmbient.pauseBgm();`，原樣搬入、不用再動。
> `_sendClaudeMessage` 內對 `window.ClaudeTerminal` / `window.OS_SPEND_PANEL` 的引用不動（那是外部模組）。

- [ ] **Step 3: 改核心 14 處呼叫點**

| 原本 | 改成 | 所在函式（重構前行號） |
|---|---|---|
| `_applyClaudeRoomUi()` | `VoidClaudeRoom.applyRoomUi()` | `_applyLoadedLobbyState` L818、`enterClaudeRoom` L1795 |
| `_updateClaudePortalBtn()` | `VoidClaudeRoom.updatePortalBtn()` | `_applyLoadedLobbyState` L833、`createTab` L1326、`enterClaudeRoom` L1804、`exitClaudeRoom` L1872 |
| `_handleClaudeFilePick(files)` | `VoidClaudeRoom.handleFilePick(files)` | `createTab` L1168 |
| `_closeClaudePickerPopup()` | `VoidClaudeRoom.closePicker()` | `createTab` L1181 |
| `_openClaudePickerPopup()` | `VoidClaudeRoom.openPicker()` | `createTab` L1183 |
| `_renderClaudeBubble('assistant', ...)` | `VoidClaudeRoom.renderBubble('assistant', ...)` | `createTab` 的 `hist-new-claude-conv` handler L1416、`enterClaudeRoom` L1800 |
| `_setClaudePortraitState('living')` | `VoidClaudeRoom.setPortraitState('living')` | `createTab` 的 `hist-new-claude-conv` handler L1417 |
| `_hydrateClaudeStream()` | `VoidClaudeRoom.hydrateStream()` | `enterClaudeRoom` L1798 |
| `return _sendClaudeMessage(text)` | `return VoidClaudeRoom.sendMessage(text)` | `sendIrisMessage` L3010 |

- [ ] **Step 4: 接線**

`index.js`：`void_canvas` 之後、`void_terminal` 之前：
```js
    { name: 'void_claude_room', path: './scripts/extensions/third-party/my-tavern-extension/core/void/claude-room.js', key: 'voidClaudeRoom' },
```
`index.html`：`core/void/canvas.js` 之後、`core/void_terminal.js` 之前：
```html
    <script src="core/void/claude-room.js"></script>
```

- [ ] **Step 5: 語法檢查**

Run: `node --check core/void/claude-room.js && node --check core/void_terminal.js && node --check index.js`
Expected: 無輸出

- [ ] **Step 6: 靜態檢查**

Grep `core/void_terminal.js` for `function _applyClaudeRoomUi|function _updateClaudePortalBtn|function _sendClaudeMessage|function _renderClaudeBubble|function _hydrateClaudeStream|function _handleClaudeFilePick|function _openClaudePickerPopup|_pendingClaudeAttachments`
Expected: **0 筆**

Grep `core/void_terminal.js` for `_applyClaudeRoomUi\(|_updateClaudePortalBtn\(|_sendClaudeMessage\(|_renderClaudeBubble\(|_setClaudePortraitState\(|_hydrateClaudeStream\(|_handleClaudeFilePick\(|_openClaudePickerPopup\(|_closeClaudePickerPopup\(`
Expected: **0 筆**（全改 `VoidClaudeRoom.*`）

> 確認 `enterClaudeRoom` / `exitClaudeRoom` **仍在** `void_terminal.js`（它們留核心）：Grep `function enterClaudeRoom|function exitClaudeRoom` → 應為 2 筆。

- [ ] **Step 7: Commit**

```bash
git add core/void/claude-room.js core/void_terminal.js index.js index.html
git commit -m "大廳重構 6/9：抽 core/void/claude-room.js（Claude 房間 UI）"
```

---

### Task 7: 抽 `login.js`（登入畫面 + 存檔管理）

橋接最多的一塊（半纏模組）。8 個橋成員：`loadLobbyHistory` / `saveLobbyHistory` / `applyLoadedLobbyState` / `getChatId` / `applyLayoutMode` / `getUserName` / `setUserName` / `resetActiveHistory`。

**搬入清單**：`_truncateId` / `_formatSessionTime` / `_injectLoginCss` / `showLoginScreen` / `renderSessionManager` / `closeLoginScreen` / `_renderSessionList`（即 `// ===== 對話歷史持久化 =====` 之後、`_updatePortalBtn` 之前那一整段登入相關函式 —— 注意 `getChatId` / `debouncedSave` / `saveLobbyHistory` / `loadLobbyHistory` **不搬**，它們留核心）。

**Files:**
- Create: `core/void/login.js`
- Modify: `core/void_terminal.js`（移出上述 7 個函式；改 3 處呼叫點）
- Modify: `index.js`、`index.html`

- [ ] **Step 1: 建 `core/void/login.js`**

```js
/**
 * core/void/login.js — 登入畫面 + 存檔管理
 * 從 void_terminal.js 抽出。橋：loadLobbyHistory / saveLobbyHistory / applyLoadedLobbyState
 *   / getChatId / applyLayoutMode / getUserName / setUserName / resetActiveHistory。
 */
(function (VoidLogin) {
    'use strict';

    function _b() { return window.VoidTerminal._bridge; }

    // ── 移入：_truncateId / _formatSessionTime / _injectLoginCss / showLoginScreen
    //         / renderSessionManager / closeLoginScreen / _renderSessionList ──
    // （一字不改貼入；內部改動見 Step 2）

    VoidLogin.showLoginScreen  = showLoginScreen;
    VoidLogin.closeLoginScreen = closeLoginScreen;

    console.log('✅ VoidLogin（登入 + 存檔管理）模組就緒');
})(window.VoidLogin = window.VoidLogin || {});
```

- [ ] **Step 2: 移入程式碼，改內部引用走橋**

從 `void_terminal.js` 剪出 7 個函式，貼入 login.js。模組內部對核心的引用改走 `_b()`：
- `loadLobbyHistory(...)` → `_b().loadLobbyHistory(...)`
- `saveLobbyHistory()` → `_b().saveLobbyHistory()`
- `_applyLoadedLobbyState()` → `_b().applyLoadedLobbyState()`（含 `closeLoginScreen` 內那一處）
- `getChatId()` → `_b().getChatId()`
- `applyLayoutMode()` → `_b().applyLayoutMode()`
- `showLoginScreen` 內 `_currentChatId = currentId;` → `_b().setCurrentChatId(currentId);`
- 寫 `IRIS_STATE.userName = val`（`doLogin` 內，兩處）→ `_b().setUserName(val)`
- `_renderSessionList` 刪當前存檔分支的 `IRIS_STATE.history = []; _cheshireHistoryBackup = []; _irisHistoryBackup = [];` → `_b().resetActiveHistory()`

> login.js 不讀 `IRIS_STATE.userName`（`showLoginScreen` 的 `savedName` 來自 DB），故橋不需要 `getUserName`。

- [ ] **Step 3: 改核心 3 處呼叫點**

| 原本 | 改成 | 所在函式（重構前行號） |
|---|---|---|
| `showLoginScreen(homeTab)` | `VoidLogin.showLoginScreen(homeTab)` | `onShow` L391 |
| `showLoginScreen(tab)` | `VoidLogin.showLoginScreen(tab)` | `createTab` setTimeout L1448 |
| `showLoginScreen(t)` | `VoidLogin.showLoginScreen(t)` | `VoidTerminal.logout` L3429 |

- [ ] **Step 4: 接線**

`index.js`：`void_claude_room` 之後、`void_terminal` 之前：
```js
    { name: 'void_login', path: './scripts/extensions/third-party/my-tavern-extension/core/void/login.js', key: 'voidLogin' },
```
`index.html`：`core/void/claude-room.js` 之後、`core/void_terminal.js` 之前：
```html
    <script src="core/void/login.js"></script>
```

- [ ] **Step 5: 語法檢查**

Run: `node --check core/void/login.js && node --check core/void_terminal.js && node --check index.js`
Expected: 無輸出

- [ ] **Step 6: 靜態檢查**

Grep `core/void_terminal.js` for `function showLoginScreen|function renderSessionManager|function closeLoginScreen|function _renderSessionList|function _truncateId|function _formatSessionTime|function _injectLoginCss`
Expected: **0 筆**

Grep `core/void_terminal.js` for `showLoginScreen\(|closeLoginScreen\(|renderSessionManager\(`
Expected: **0 筆**（3 處呼叫點全改 `VoidLogin.*`）

> 確認核心仍保有 `getChatId` / `debouncedSave` / `saveLobbyHistory` / `loadLobbyHistory`：Grep `function getChatId|function debouncedSave|function saveLobbyHistory|function loadLobbyHistory` → 應為 4 筆。

- [ ] **Step 7: Commit**

```bash
git add core/void/login.js core/void_terminal.js index.js index.html
git commit -m "大廳重構 7/9：抽 core/void/login.js（登入 + 存檔管理）"
```

---

### Task 8: 更新 README.md

spec §11：更新「目錄結構」段落。

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 量出實際行數**

Run: `wc -l core/void_terminal.js core/void/*.js`
記下 7 個檔的實際行數。

- [ ] **Step 2: 改 `README.md` 的 `### 根目錄` / `core/` 表**

- `void_terminal.js` 那列：行數 `3464` → 實際值；功能描述改為「大廳核心：狀態 + 持久化 + 場景調度 + 主渲染 + VN 引擎 + 對話核心」。
- 在 `core/` 相關表格後新增一個 `### core/void/ — 大廳子模組` 小節，列出 6 個檔（用 Step 1 量到的行數）：

```markdown
### `core/void/` — 大廳子模組

| 檔案 | 版本 | 功能 | window | 行數 |
|---|:--:|---|---|--:|
| `claude-room.js` | ⚪ | Claude 房間 UI：picker + 氣泡渲染 + markdown + 附件 + send | `VoidClaudeRoom` | （量） |
| `login.js` | ⚪ | 登入畫面 + 存檔管理 | `VoidLogin` | （量） |
| `canvas.js` | ⚪ | 大廳畫布面板引擎（LobbyPanelAPI + 渲染/解析/模板） | `VoidCanvas` | （量） |
| `prompts.js` | ⚪ | 瀅瀅／柴郡 sysPrompt 模板（純函式） | `VoidPrompts` | （量） |
| `panels.js` | ⚪ | 成就面板 + 404 商店面板 | `VoidPanels` | （量） |
| `ambient.js` | ⚪ | BGM 系統 + 大廳背景時段切換 | `VoidAmbient` | （量） |
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "大廳重構 8/9：README 目錄結構同步 core/void/"
```

---

### Task 9: 最終驗證 —— 手動煙霧測試（Rae）

純搬程式碼的重構，唯一能證明「零行為改動」的是大廳實際跑起來一模一樣。**驗證目標：酒館版**（spec §8）。

**Files:** 無（驗證任務）

- [ ] **Step 1: 執行者最終靜態掃描**

確認 6 個模組檔都有 `console.log('✅ Void... 模組就緒')`、都正確 `})(window.VoidXxx = ...)` 收尾。
Run: `node --check core/void_terminal.js core/void/*.js index.js`
Expected: 無輸出。
（若 SillyTavern web server 可達，可選擇用 /browse 載入擴展、看 console。）

- [ ] **Step 2: Rae 在酒館版手動走清單**

開大廳，F12 console 應只有 7 行 `✅...就緒`（6 模組 + 核心），**零紅字**。逐項確認行為與重構前一致：

- [ ] 開大廳 → 登入畫面 → 輸入代號 → 進入
- [ ] 跟瀅瀅對話（送訊息、打字機效果、世界頻道氣泡）
- [ ] 戳瀅瀅（反應框 + 語音）；放置語音（可暫時調短 `IDLE_INTERVAL` 測）
- [ ] BGM 開關鈕、全屏鈕 ⛶
- [ ] 輸入 `ERR_404` → 進 404 → 跟柴郡對話 → 頂部傳送鈕回大廳
- [ ] 進 Claude 房間 → 送訊息 → picker 換 model → 附加檔案 → 退出
- [ ] 歷史面板（瀅瀅／柴郡／Claude 三個）→ 編輯／刪除／回退／清空 → Claude「開新對話」
- [ ] 成就面板、黑市面板開關
- [ ] 觸發大廳畫布面板（AI 回覆帶 `<lobbyPanel>`）
- [ ] 切 chatId → 場景重置／自動登入
- [ ] 重整頁面 → 自動還原（登入狀態 + 場景 + 歷史）

- [ ] **Step 3: 有問題就 bisect**

若某項壞掉：因為每個模組各一 commit（共 7 個重構 commit），`git log --oneline` 找到對應模組的 commit、`git show` 看那次改動、定位問題修掉（修完補一個 commit，不要 amend）。

---

## Self-Review

**1. Spec coverage：**
- spec §3 的 6 模組 → Task 2-7 各一 ✅
- spec §5 內部橋 → Task 1 ✅
- spec §6 載入接線 → 每個 Task 的 Step 4（`index.js` + `index.html`）✅
- spec §8 三層驗證 → 每 Task commit（層 1）+ 每 Task 的 `node --check` / Grep（層 2）+ Task 9（層 3）✅
- spec §9 風險：載入順序（任務順序滿足 ambient→claude-room）✅、inline onclick（Task 5 Step 1 保留 `window._closeLobbyCanvas`）✅、雙入口（每 Task Step 4 同改兩檔）✅、`'use strict'`（每個 skeleton 都有）✅、login 雙存（橋的 `setUserName` 為裸 setter，Task 1）✅
- spec §11 完成後 → Task 8 ✅

**2. Placeholder scan：** 模組檔內「移入：…」是「把現存程式碼一字不改搬過來」的精確指令（附穩定錨點），非 placeholder。新程式碼（skeleton / 橋 / 呼叫點改動 / 接線）皆已給完整 code。Task 8 行數「（量）」配 Step 1 的 `wc -l` —— 是「量了填」，非 placeholder。

**3. Type consistency：** 公開 API 命名跨任務一致 —— `VoidPanels.openAchievement`（Task 2）、`VoidAmbient.playBgm/switchBgm/isEnabled`（Task 4）、`VoidCanvas.closeCanvas/makeLobbyPanelAPI`（Task 5）、`VoidClaudeRoom.applyRoomUi/sendMessage`（Task 6）、`VoidLogin.showLoginScreen`（Task 7）、`_bridge` 成員名（Task 1 定義，Task 4/5/6/7 引用）皆對齊。spec §4.3 的 API 清單在 Task 5 已明確補上 `makeLobbyPanelAPI` / `rewireOnclicks`。

**4. 與 spec 的差異（精確 call-site 分析後的精修，以本 plan 為準）：**
- `_bridge` 比 spec §5 多 2 個、少 1 個：加 `isClaudeRoom`（`_updateClaudePortalBtn` 讀它）、`setCurrentChatId`（`showLoginScreen` 寫 `_currentChatId`）；移除 `getUserName`（與既有公開的 `VoidTerminal.getUserName()` 重複，canvas／login 直接用公開那個）。
- spec §4.3 canvas API 補上 `makeLobbyPanelAPI` / `rewireOnclicks`（`sendIrisMessage` 的 inline VN-block 區塊直接用）。
- 以上皆為設計→計畫階段、用實際 grep 出來的呼叫點精修的結果，不影響架構與「零行為改動」鐵則。
