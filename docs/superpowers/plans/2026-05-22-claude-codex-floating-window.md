# Claude / Codex 房間獨立浮窗 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Claude / Codex 聊天室從奧瑞亞大廳場景抽成獨立可拖動浮窗,各自一個窗、一次只開一個,工作檯/額度/設置/Recents 當窗內子面板。

**Architecture:** 新增 `core/chat_window.js`（`window.ChatWindow`）負責浮動框外殼 + 拖動 + 開關 + 子面板路由。聊天室 UI 層 `claude-room.js` 從 `core/void/` 移到 `core/`、bridge 改接 `ChatWindow`、改用浮窗自己的輸入框。`void_terminal.js` / `os_settings.js` / `control_center.js` 清掉舊聊天室程式碼。

**Tech Stack:** 原生 JS（IIFE 模組掛 window）、無建置、無測試框架。驗收一律靠「重載 SillyTavern → 開面板 → 手動操作確認」。

**設計依據:** `docs/superpowers/specs/2026-05-22-claude-codex-floating-window-design.md`

**測試環境說明:** 此擴展由 SillyTavern 自動載入。每次驗收 = 在 SillyTavern 重新整理頁面、開奧瑞亞面板、照步驟點。無 pytest / npm。

**遷移期說明:** Phase 1~2 之間舊聊天室仍可用（🦀/🔷 按鈕到 Phase 2 結束才改接浮窗）。Phase 4 才刪舊死碼。每個 Task 完 commit 一次。

---

## 檔案結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `core/chat_window.js` | 新建 | `window.ChatWindow` — 浮動框外殼、拖動、開關、互斥、子面板路由 |
| `css/chat_window.css` | 新建 | 浮窗 + 聊天室 + 子面板的全部樣式 |
| `core/chat_room.js` | 由 `core/void/claude-room.js` 移來 | 聊天室 UI 層（氣泡 / markdown / picker / 附件 / send），bridge 改接 ChatWindow |
| `core/void/claude-room.js` | 刪除（移走後） | — |
| `core/claude_terminal.js` | 修改 | 接收從 os_settings 移來的設定資料層；歷史對接維持 |
| `core/void_terminal.js` | 修改 | 移除聊天室場景（`enterClaudeRoom`/`exitClaudeRoom`/`mode-claude`/Claude HTML/Recents/conv chip/歷史 backup）；🦀/🔷 按鈕改接 ChatWindow |
| `os_phone/os/os_settings.js` | 修改 | 移除「🦀 Claude 的房間」設置分頁 |
| `core/control_center.js` | 修改 | `GAME_APP_MAP` 移除 `workbench` / `spend` |
| `index.js` | 修改 | `MODULE_LOAD_ORDER` 調整、loadCSS 加 `chat_window.css` |
| `index.html` | 修改 | `<script>` 順序調整 |

---

## Phase 1 — 浮窗外殼

目標:可拖動、固定尺寸的空浮窗,能開能關,開窗時奧瑞亞主面板隱藏、關窗還原。此階段舊聊天室不動,浮窗用 console 呼叫測試。

### Task 1.1：建立 `core/chat_window.js` 外殼

**Files:**
- Create: `core/chat_window.js`

- [ ] **Step 1：寫 `core/chat_window.js`**

```javascript
/**
 * core/chat_window.js — Claude / Codex 獨立浮窗外殼
 * 職責：浮動框、標題列拖動、開關、跟奧瑞亞主面板互斥、子面板路由。
 * 聊天室 UI 由 chat_room.js（window.VoidClaudeRoom）渲染進 #cw-body。
 */
(function (ChatWindow) {
    'use strict';

    const WIN_ID = 'aurelia-chat-window';
    const AURELIA_FRAME_ID = 'aurelia-phone-frame';

    let _winEl = null;
    let _provider = 'claude';        // 'claude' | 'codex'
    let _isOpen = false;
    let _subPanel = null;            // 當前開啟的子面板名（null = 沒開）
    let _aureliaPrevDisplay = null;  // 開窗前奧瑞亞 frame 的 display，關窗還原

    const IDENTITY = {
        claude: '🦀 Claude’s Room',
        codex:  '🔷 Codex’s Room',
    };

    function _sizeForViewport() {
        const mobile = window.matchMedia('(max-width: 560px)').matches;
        if (mobile) {
            return {
                w: Math.min(window.innerWidth - 20, 440),
                h: Math.min(window.innerHeight - 60, 660),
            };
        }
        return { w: 480, h: 700 };
    }

    function _centerPos(size) {
        return {
            left: Math.max(8, (window.innerWidth  - size.w) / 2),
            top:  Math.max(8, (window.innerHeight - size.h) / 2),
        };
    }

    function _buildWindow() {
        const el = document.createElement('div');
        el.id = WIN_ID;
        el.className = 'cw-window';
        el.innerHTML = `
            <div class="cw-titlebar" id="cw-titlebar">
                <span class="cw-identity" id="cw-identity">${IDENTITY.claude}</span>
                <div class="cw-toolbar">
                    <button class="cw-tool-btn" data-panel="settings"  type="button" title="設置">⚙️</button>
                    <button class="cw-tool-btn" data-panel="workbench" type="button" title="工作檯">🛠️</button>
                    <button class="cw-tool-btn" data-panel="spend"     type="button" title="額度">💰</button>
                    <button class="cw-tool-btn" data-panel="recents"   type="button" title="Recents">🕘</button>
                </div>
                <button class="cw-close" id="cw-close" type="button" title="關閉">✕</button>
            </div>
            <div class="cw-body" id="cw-body"></div>
            <div class="cw-subpanel" id="cw-subpanel" style="display:none;">
                <div class="cw-subpanel-head">
                    <span class="cw-subpanel-title" id="cw-subpanel-title"></span>
                    <button class="cw-subpanel-close" id="cw-subpanel-close" type="button">✕</button>
                </div>
                <div class="cw-subpanel-body" id="cw-subpanel-body"></div>
            </div>`;
        document.body.appendChild(el);

        el.querySelector('#cw-close').addEventListener('click', () => ChatWindow.close());
        el.querySelector('#cw-subpanel-close').addEventListener('click', () => ChatWindow.closeSubPanel());
        el.querySelectorAll('.cw-tool-btn').forEach(b => {
            b.addEventListener('click', () => ChatWindow.openSubPanel(b.dataset.panel));
        });
        _bindDrag(el.querySelector('#cw-titlebar'), el);

        const size = _sizeForViewport();
        const pos = _centerPos(size);
        el.style.width  = size.w + 'px';
        el.style.height = size.h + 'px';
        el.style.left   = pos.left + 'px';
        el.style.top    = pos.top + 'px';
        return el;
    }

    function _bindDrag(handle, win) {
        let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
        handle.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return;  // 點按鈕不觸發拖動
            dragging = true;
            sx = e.clientX; sy = e.clientY;
            const r = win.getBoundingClientRect();
            ox = r.left; oy = r.top;
            handle.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        handle.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const w = win.offsetWidth, h = win.offsetHeight;
            let nx = ox + (e.clientX - sx);
            let ny = oy + (e.clientY - sy);
            nx = Math.max(0, Math.min(nx, window.innerWidth  - w));
            ny = Math.max(0, Math.min(ny, window.innerHeight - h));
            win.style.left = nx + 'px';
            win.style.top  = ny + 'px';
        });
        const end = (e) => {
            if (!dragging) return;
            dragging = false;
            try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
        };
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    }

    function _hideAurelia() {
        const frame = document.getElementById(AURELIA_FRAME_ID);
        if (frame) {
            _aureliaPrevDisplay = frame.style.display;
            frame.style.display = 'none';
        }
    }
    function _showAurelia() {
        const frame = document.getElementById(AURELIA_FRAME_ID);
        if (frame && _aureliaPrevDisplay !== null) {
            frame.style.display = _aureliaPrevDisplay;
        }
        _aureliaPrevDisplay = null;
    }

    ChatWindow.open = function (provider) {
        provider = provider === 'codex' ? 'codex' : 'claude';
        _provider = provider;
        if (!_winEl) _winEl = _buildWindow();
        const idEl = _winEl.querySelector('#cw-identity');
        if (idEl) idEl.textContent = IDENTITY[provider];
        _winEl.classList.toggle('cw-codex', provider === 'codex');
        _winEl.style.display = 'flex';
        if (!_isOpen) _hideAurelia();
        _isOpen = true;
        ChatWindow.closeSubPanel();
    };

    ChatWindow.close = function () {
        if (!_isOpen) return;
        if (_winEl) _winEl.style.display = 'none';
        ChatWindow.closeSubPanel();
        _showAurelia();
        _isOpen = false;
    };

    ChatWindow.openSubPanel = function (name) {
        if (!_winEl) return;
        // Phase 3 接內容；此階段先只切顯示
        _subPanel = name;
        const sp = _winEl.querySelector('#cw-subpanel');
        const title = _winEl.querySelector('#cw-subpanel-title');
        if (title) title.textContent = name;
        if (sp) sp.style.display = 'flex';
    };

    ChatWindow.closeSubPanel = function () {
        _subPanel = null;
        if (!_winEl) return;
        const sp = _winEl.querySelector('#cw-subpanel');
        if (sp) sp.style.display = 'none';
    };

    ChatWindow.isOpen      = function () { return _isOpen; };
    ChatWindow.getProvider = function () { return _provider; };
    ChatWindow.getBody     = function () { return _winEl && _winEl.querySelector('#cw-body'); };
    ChatWindow.getSubPanelBody = function () { return _winEl && _winEl.querySelector('#cw-subpanel-body'); };

    console.log('✅ ChatWindow（Claude/Codex 浮窗外殼）模組就緒');
})(window.ChatWindow = window.ChatWindow || {});
```

- [ ] **Step 2：commit**

```bash
git add core/chat_window.js
git commit -m "Claude/Codex 浮窗 phase1：新增 ChatWindow 外殼模組"
```

### Task 1.2：建立 `css/chat_window.css`

**Files:**
- Create: `css/chat_window.css`

- [ ] **Step 1：寫 `css/chat_window.css`**

樣式全部以 `#aurelia-chat-window` / `.cw-` 前綴 scoped（遵守專案「不污染酒館、不寫 inline style」慣例）。需涵蓋:

- `#aurelia-chat-window.cw-window`：`position:fixed; z-index:10000; display:none; flex-direction:column; background:#1a1a2e; border-radius:10px; box-shadow:0 12px 48px rgba(0,0,0,0.5); overflow:hidden;`
- `.cw-window.cw-codex`：背景改 `#0e1c2e`（Codex 深藍）
- `.cw-titlebar`：`flex; align-items:center; gap:8px; padding:8px 10px; cursor:move; user-select:none; background:rgba(0,0,0,0.3);`
- `.cw-identity`：`flex:1; font-weight:700; color:#FFF5E1; font-size:13px;`
- `.cw-toolbar`：`display:flex; gap:4px;`；`.cw-tool-btn`：小圖示鈕,`background:none; border:none; cursor:pointer; font-size:15px; padding:2px 4px;`
- `.cw-close`：`background:none; border:none; color:#FFF5E1; cursor:pointer; font-size:15px;`
- `.cw-body`：`flex:1; position:relative; overflow:hidden; display:flex; flex-direction:column;`
- `.cw-subpanel`：`position:absolute; inset:0; z-index:5; background:#1a1a2e; flex-direction:column;`（`display` 由 JS 控制）
- `.cw-subpanel-head`：`flex; align-items:center; justify-content:space-between; padding:8px 10px;`
- `.cw-subpanel-body`：`flex:1; overflow:auto;`

- [ ] **Step 2：在 `index.js` 註冊此 CSS**

`index.js` 約 line 249（`void_claude_recents.css` 那批附近）的 `loadCSS` 區塊加一行:
```javascript
        await loadCSS('./scripts/extensions/third-party/my-tavern-extension/css/chat_window.css');
```

- [ ] **Step 3：commit**

```bash
git add css/chat_window.css index.js
git commit -m "Claude/Codex 浮窗 phase1：浮窗 CSS + 註冊載入"
```

### Task 1.3：把 `chat_window.js` 接進載入流程

**Files:**
- Modify: `index.js`（`MODULE_LOAD_ORDER`）
- Modify: `index.html`（`<script>` 清單）

- [ ] **Step 1：`index.js` 的 `MODULE_LOAD_ORDER` 加入 chat_window**

在 `void_claude_room` 之後、`void_terminal` 之前加:
```javascript
    { name: 'chat_window', path: './scripts/extensions/third-party/my-tavern-extension/core/chat_window.js', key: 'chatWindow' },
```

- [ ] **Step 2：`index.html` 對應位置加 `<script>`**

讀 `index.html` 找到 `core/void/claude-room.js` 與 `core/void_terminal.js` 的 `<script>`,在兩者之間插:
```html
<script src="./core/chat_window.js"></script>
```
（實際相對路徑依 index.html 既有寫法為準）

- [ ] **Step 3：驗收**

重載 SillyTavern → F12 console 輸入 `ChatWindow.open('claude')` → 應彈出空浮窗、標題「🦀 Claude's Room」、奧瑞亞面板消失。拖標題列可移動。輸入 `ChatWindow.open('codex')` → 標題變「🔷 Codex's Room」、底色轉深藍。`ChatWindow.close()` → 浮窗消失、奧瑞亞面板還原。

- [ ] **Step 4：commit**

```bash
git add index.js index.html
git commit -m "Claude/Codex 浮窗 phase1：接入載入流程，外殼可開關拖動"
```

---

## Phase 2 — 搬聊天室 UI + 解除大廳共用

目標:把聊天室 UI 整套搬進浮窗,浮窗有自己的輸入框/送出鈕/氣泡層;`claude-room.js` 移出 `void/`、bridge 改接 ChatWindow;歷史改直連 `claude_terminal.js`。結束時把大廳 🦀/🔷 按鈕改接 ChatWindow,新浮窗成為正式聊天室。

### Task 2.1：浮窗 body 加入聊天室 DOM 骨架

**Files:**
- Modify: `core/chat_window.js`

- [ ] **Step 1：在 `_buildWindow()` 的 `#cw-body` 內填入聊天室骨架**

把 `void_terminal.js` createTab 模板（約 line 755~818）裡的聊天室元素搬成浮窗自己的 DOM。`#cw-body` 改成:
```html
<div class="cw-portrait-area">
  <img id="claude-portrait-img" class="claude-portrait-img" alt="Clawd">
  <div id="codex-portrait-sprite" class="codex-portrait-sprite"></div>
  <div class="claude-conv-chip" id="claude-conv-chip" title="點開 Recents 多會話列表">
    <span class="ccc-tab" id="ccc-tab">☕</span>
    <span class="ccc-title" id="ccc-title">—</span>
    <span class="ccc-arrow">▾</span>
  </div>
</div>
<div class="claude-chat-stream" id="claude-chat-stream"></div>
<div class="claude-picker-bar" id="claude-picker-bar">
  <button class="claude-picker-btn" id="claude-picker-btn" type="button">
    <span id="claude-pick-model">Opus 4.7</span>
    <span class="claude-pick-sep" id="claude-pick-sep1">·</span>
    <span id="claude-pick-effort">🧠 medium</span>
    <span class="claude-pick-sep" id="claude-pick-sep2">·</span>
    <span id="claude-pick-endpoint">☁️ VPS</span>
    <span class="claude-pick-arrow">▼</span>
  </button>
</div>
<div class="claude-picker-popup" id="claude-picker-popup" style="display:none;"></div>
<div class="claude-attach-chips" id="claude-attach-chips"></div>
<input type="file" id="claude-file-input" multiple style="display:none;"
       accept="image/*,application/pdf,.txt,.md,.json,.csv,.js,.ts,.py,.html,.css,.yml,.yaml,.toml,.log">
<div class="cw-input-row">
  <textarea id="cw-input" class="cw-input" placeholder="對 Claude 說點什麼..." rows="1" autocomplete="off"></textarea>
  <button class="cw-attach-btn" id="claude-attach-btn" type="button" title="附加檔案">📎</button>
  <button class="cw-send-btn" id="cw-send-btn" type="button"><i class="fa-solid fa-paper-plane"></i></button>
</div>
```

注意:輸入框 id 用 `cw-input`、送出鈕用 `cw-send-btn`（**不沿用** `iris-input`/`iris-send-btn`,這就是解除共用）。氣泡層 id 維持 `claude-chat-stream`、picker / 附件相關 id 維持原名（讓 chat_room.js 改動最小）。

- [ ] **Step 2：`chat_window.js` 加事件綁定**

`_buildWindow()` 結尾加:輸入框 Enter 送出 / Shift+Enter 換行 / autoGrow;送出鈕 onclick → `VoidClaudeRoom.sendMessage(輸入框內容)`;📎 按鈕 → file input;picker 按鈕 → `VoidClaudeRoom.openPicker/closePicker`。邏輯照搬 `void_terminal.js` createTab 約 line 885~929 的對應段落,選擇器換成浮窗自己的元素。

- [ ] **Step 3：擴充 `css/chat_window.css`**

把大廳 CSS（`css/vn_styles.css` 等）裡 `.claude-chat-panel` / `.claude-chat-stream` / `.claude-bubble*` / `.claude-picker*` / `.claude-attach*` / `.claude-portrait*` / `.codex-portrait-sprite` / `.claude-conv-chip` / `.claude-thinking` / `.claude-tool-summary` / `.claude-ask*` 等聊天室樣式複製進 `chat_window.css`,外層 scope 換成 `#aurelia-chat-window`。加上 `.cw-input-row` / `.cw-input` / `.cw-send-btn` / `.cw-attach-btn` 新樣式。

- [ ] **Step 4：驗收 + commit**

console `ChatWindow.open('claude')` → 浮窗應顯示立繪、空氣泡區、picker 橫條、輸入列（此時送訊息還不會動,Task 2.2 才接）。
```bash
git add core/chat_window.js css/chat_window.css
git commit -m "Claude/Codex 浮窗 phase2：浮窗 body 加入聊天室 DOM 骨架"
```

### Task 2.2：`claude-room.js` 移檔 + bridge 改接 ChatWindow

**Files:**
- Create: `core/chat_room.js`（內容來自 `core/void/claude-room.js`）
- Delete: `core/void/claude-room.js`
- Modify: `index.js`、`index.html`

- [ ] **Step 1：複製 `core/void/claude-room.js` → `core/chat_room.js`**

- [ ] **Step 2：改 `chat_room.js` 的 bridge 與輸入框引用**

`claude-room.js` 目前 `_bridge()` 回 `window.VoidTerminal._bridge`,用到:
- `_bridge().chatProvider()` → 改成 `window.ChatWindow.getProvider()`
- `_bridge().isClaudeRoom()` → 改成 `window.ChatWindow.isOpen()`
- `_bridge().activeHistory()` → 改成讀 `ClaudeTerminal` 當前 conv 的訊息陣列（見 Task 2.3）
- `_bridge().scheduleSave()` → 改呼叫 `ClaudeTerminal` 的存檔（見 Task 2.3）
- `_bridge().sendIris` → 移除（送出鈕還原邏輯改成還原成浮窗自己的 send handler）

`_applyClaudeRoomUi()` 裡所有抓 `aurelia-home-tab` / `iris-input` / `iris-name-tag` / `iris-avatar` / `iris-hist-btn` / `mode-claude` 的程式碼:浮窗不需要「變裝大廳」,整個 `_applyClaudeRoomUi` 簡化成只設浮窗內部（picker label、立繪 state、placeholder）。

`_sendClaudeMessage` 裡 `document.getElementById('iris-send-btn')` → 改 `cw-send-btn`;`finally` 還原 onclick 改成還原浮窗的 send handler。

- [ ] **Step 3：刪除 `core/void/claude-room.js`,更新載入清單**

`index.js` `MODULE_LOAD_ORDER`:`void_claude_room` 的 path 改 `core/chat_room.js`;順序移到 `chat_window` 之後。`index.html` 對應 `<script>` 路徑改 `core/chat_room.js`。

- [ ] **Step 4：commit**

```bash
git add core/chat_room.js index.js index.html
git rm core/void/claude-room.js
git commit -m "Claude/Codex 浮窗 phase2：claude-room.js 移出 void/、bridge 改接 ChatWindow"
```

### Task 2.3：歷史改直連 `claude_terminal.js` 多會話層

**Files:**
- Modify: `core/chat_window.js`、`core/chat_room.js`
- Modify: `core/claude_terminal.js`（如需補 helper）

- [ ] **Step 1：ChatWindow.open 載入當前 conv 歷史並渲染**

`ChatWindow.open(provider)` 內,設定 `ClaudeTerminal.setProvider(provider)` 後,讀當前 active conv 的訊息（`ClaudeTerminal.loadHistory()` 已存在,回 `[{role,content,...}]`),呼叫 `VoidClaudeRoom.hydrateStream()` 渲染;空歷史時 `VoidClaudeRoom.renderBubble('assistant', 歡迎詞)`。歡迎詞依 provider。

- [ ] **Step 2：`chat_room.js` 的 history 操作改接 ClaudeTerminal**

`activeHistory()` 原本回大廳 `IRIS_STATE.history`。改成:在 `chat_room.js` 內維護一個 `_roomHistory` 陣列,`hydrateStream` 時由 ChatWindow 灌入,`_sendClaudeMessage` push 進去;送完呼叫 `ClaudeTerminal` 的存檔（沿用現有 `loadHistory`/存檔機制 — 確認 `claude_terminal.js` 既有的 conv 存檔 API 名稱後對接）。`scheduleSave()` 改成呼叫該存檔。

- [ ] **Step 3：驗收 + commit**

console `ChatWindow.open('claude')` → 送一則訊息 → 應正常呼叫 cc-bridge、氣泡渲染、立繪動。關窗再開,歷史還在。切 `ChatWindow.open('codex')` 走 codex 線。
```bash
git add core/chat_window.js core/chat_room.js core/claude_terminal.js
git commit -m "Claude/Codex 浮窗 phase2：歷史改直連 claude_terminal 多會話層"
```

### Task 2.4：大廳 🦀/🔷 按鈕改接 ChatWindow

**Files:**
- Modify: `core/void_terminal.js`

- [ ] **Step 1：改按鈕 click handler**

`void_terminal.js` 約 line 1079~1101,`claudePortalBtn` / `codexPortalBtn` 的 click 邏輯改成:
```javascript
if (claudePortalBtn) {
    claudePortalBtn.addEventListener('click', () => {
        if (window.ChatWindow) window.ChatWindow.open('claude');
    });
}
if (codexPortalBtn) {
    codexPortalBtn.addEventListener('click', () => {
        if (window.ChatWindow) window.ChatWindow.open('codex');
    });
}
```
（此 Task 只改按鈕接線;`enterClaudeRoom`/`exitClaudeRoom` 函式與其它舊碼 Phase 4 才刪。）

- [ ] **Step 2：驗收 + commit**

重載 → 開奧瑞亞面板 → 大廳點 🦀 → 浮窗開、面板隱藏 → 聊天正常 → ✕ → 回大廳。點 🔷 走 Codex。
```bash
git add core/void_terminal.js
git commit -m "Claude/Codex 浮窗 phase2：大廳傳送門按鈕改開浮窗"
```

---

## Phase 3 — 子面板（設置 / 工作檯 / 額度 / Recents）

目標:浮窗工具列四顆鈕接上真正內容。

### Task 3.1：設定資料層移進 `claude_terminal.js`

**Files:**
- Modify: `core/claude_terminal.js`、`os_phone/os/os_settings.js`、`core/chat_room.js`

- [ ] **Step 1：把資料層函式移進 `claude_terminal.js`**

`os_settings.js` 的 `loadClaudeRoomConfig` / `saveClaudeRoomConfig` / `getActivePreset`（含 migrate 邏輯、`CLAUDE_ROOM_STORAGE_KEY`、`getActiveClaudeEndpoint` 相容層）整段移進 `claude_terminal.js`,掛成 `ClaudeTerminal.getClaudeRoomConfig` / `saveClaudeRoomConfig` / `getActiveClaudePreset` / `getActiveClaudeEndpoint`。

- [ ] **Step 2：更新引用點**

全專案 grep `OS_SETTINGS.getClaudeRoomConfig` / `saveClaudeRoomConfig` / `getActiveClaudeEndpoint` / `getActiveClaudePreset`,改指到 `ClaudeTerminal`。重點檔:`chat_room.js`（`_getClaudeRoomCfg`/`_saveClaudeRoomCfg`）、`claude_terminal.js` 內部。

- [ ] **Step 3：commit**

```bash
git add core/claude_terminal.js os_phone/os/os_settings.js core/chat_room.js
git commit -m "Claude/Codex 浮窗 phase3：Claude 設定資料層移進 claude_terminal"
```

### Task 3.2：⚙️ 設置子面板

**Files:**
- Modify: `core/chat_window.js`、`os_phone/os/os_settings.js`

- [ ] **Step 1：抽出設置 UI**

把 `os_settings.js` 的 `#view-claude-room` HTML（presets 清單、maxTokens/temp/topP、測試連線;約 line 913~952）與其 binding（約 line 2029~2050 附近 + presets 清單渲染）抽成一個可重用函式 — 建議放在 `chat_window.js` 內的 `_renderSettingsPanel(container)`,渲染進 `getSubPanelBody()`。

- [ ] **Step 2：`openSubPanel('settings')` 接上**

`ChatWindow.openSubPanel` 內 `name==='settings'` → 呼叫 `_renderSettingsPanel(getSubPanelBody())`。

- [ ] **Step 3：驗收 + commit**

開浮窗 → ⚙️ → 設置面板出現,可改 preset、測試連線。
```bash
git add core/chat_window.js os_phone/os/os_settings.js
git commit -m "Claude/Codex 浮窗 phase3：⚙️ 設置子面板"
```

### Task 3.3：🛠️ 工作檯 / 💰 額度子面板

**Files:**
- Modify: `core/chat_window.js`

- [ ] **Step 1：`openSubPanel` 接 workbench / spend**

```javascript
if (name === 'workbench' && window.OS_WORKBENCH) {
    window.OS_WORKBENCH.launch(getSubPanelBody());
} else if (name === 'spend' && window.OS_SPEND_PANEL) {
    window.OS_SPEND_PANEL.launch(getSubPanelBody());
}
```
（先確認 `OS_WORKBENCH` / `OS_SPEND_PANEL` 的 launch 方法名與簽章;`os_workbench.js` 入口註解寫 `data-app-launch="workbench"`,實際 launch fn 名稱以模組匯出為準。）開子面板前先清空 `getSubPanelBody()` 的 innerHTML。

- [ ] **Step 2：驗收 + commit**

開浮窗 → 🛠️ → 工作檯出現;💰 → 額度出現。
```bash
git add core/chat_window.js
git commit -m "Claude/Codex 浮窗 phase3：🛠️ 工作檯 / 💰 額度子面板"
```

### Task 3.4：🕘 Recents 子面板

**Files:**
- Modify: `core/chat_window.js`
- 參考來源: `core/void_terminal.js`（Recents 視窗渲染,約 line 1535~1610）、conv chip 更新（`_updateClaudeConvChip`）

- [ ] **Step 1：搬 Recents 渲染**

把 `void_terminal.js` 的 Recents 多會話列表渲染（tab bar、conv 清單、新會話、改名/刪除/右鍵選單）搬成 `chat_window.js` 的 `_renderRecentsPanel(container)`,渲染進 `getSubPanelBody()`。conv 切換後呼叫 `VoidClaudeRoom.hydrateStream()` 重渲染氣泡 + 關子面板。

- [ ] **Step 2：搬 conv chip 更新**

`_updateClaudeConvChip` / `window._VoidClaudeUpdateChip` 邏輯搬進 `chat_window.js`,更新浮窗內 `#ccc-tab`/`#ccc-title`;conv chip 點擊 → `openSubPanel('recents')`。

- [ ] **Step 3：驗收 + commit**

開浮窗 → 🕘 或點會話小卡 → Recents 出現,可切會話 / 改名 / 刪除 / 開新會話。
```bash
git add core/chat_window.js
git commit -m "Claude/Codex 浮窗 phase3：🕘 Recents 多會話子面板"
```

---

## Phase 4 — 清理舊碼

目標:刪掉 `void_terminal.js` / `os_settings.js` / `control_center.js` 裡已沒人用的舊聊天室程式碼,大廳回歸純 瀅瀅+柴郡。

### Task 4.1：清 `void_terminal.js`

**Files:**
- Modify: `core/void_terminal.js`

- [ ] **Step 1：刪除舊聊天室程式碼**

逐項刪除並確認無殘留引用:
- `enterClaudeRoom` / `exitClaudeRoom` 函式
- `isClaudeRoom` / `_chatProvider` / `_claudeHistoryBackup` / `_codexHistoryBackup` 狀態與所有判斷分支
- `createTab` 模板裡 `.claude-chat-panel`（line ~755~768）、`.claude-picker-bar`/popup（~797~808）、`.claude-attach-chips`/file input（~810~812）、`claude-hist-btn`、`workbench`/`spend` 按鈕（~793~794）
- createTab 事件綁定裡 Claude 附件 / picker 段（~903~929）
- Recents 視窗、conv chip、`_updateClaudeConvChip`、`_updatePortalBtn` 中 claude 相關
- `_saveLobbyHistory` / `_loadLobbyHistory` 裡 `claudeHistory`/`codexHistory`/`chatProvider` 欄位
- `_bridge` 物件裡 `isClaudeRoom`/`chatProvider`/`sendIris` 等只給 claude-room 用的成員
- `sendIrisMessage` 裡 `if (isClaudeRoom) return VoidClaudeRoom.sendMessage(...)` 分支
- `VoidClaudeRoom.updatePortalBtn()` 呼叫 → 改成自己更新 🦀/🔷 按鈕 label（或保留按鈕為固定文字）

`mode-claude`/`mode-codex` 已無人加 class,相關殘留判斷一併清。

- [ ] **Step 2：驗收 + commit**

重載 → 大廳瀅瀅、柴郡 404、章節、閱讀器、塔羅等全部正常 → 🦀/🔷 開浮窗正常。
```bash
git add core/void_terminal.js
git commit -m "Claude/Codex 浮窗 phase4：清除 void_terminal 舊聊天室場景程式碼"
```

### Task 4.2：清 `os_settings.js`

**Files:**
- Modify: `os_phone/os/os_settings.js`

- [ ] **Step 1：刪除「🦀 Claude 的房間」設置分頁**

刪 `data-tab="claude-room"` 的 set-tab（line ~718）、`#view-claude-room` 整塊 view（~913~952）、相關 binding（~2029~2050）。資料層已在 Task 3.1 移走,此處只刪 UI。確認 `claudeRoomConfig` 等已無殘留引用。

- [ ] **Step 2：驗收 + commit**

開「寫作 → API 設置」→ 分頁列沒有「🦀 Claude 的房間」,其它分頁正常。
```bash
git add os_phone/os/os_settings.js
git commit -m "Claude/Codex 浮窗 phase4：os_settings 移除 Claude 房間設置分頁"
```

### Task 4.3：清 `control_center.js`

**Files:**
- Modify: `core/control_center.js`

- [ ] **Step 1：`GAME_APP_MAP` 移除 workbench / spend**

刪 `GAME_APP_MAP` 裡 `workbench:` / `spend:` 兩行（line ~725、727）。確認 `data-app-launch="workbench"`/`"spend"` 按鈕已在 Task 4.1 從大廳模板刪除,無其它入口。

- [ ] **Step 2：驗收 + commit**

重載 → 工作檯 / 額度只能從浮窗工具列開,大廳無殘留按鈕。
```bash
git add core/control_center.js
git commit -m "Claude/Codex 浮窗 phase4：control_center 移除 workbench/spend 遊戲 App 入口"
```

### Task 4.4：CSS 殘留清理 + README

**Files:**
- Modify: `css/vn_styles.css` 等含聊天室樣式的大廳 CSS、`README.md`

- [ ] **Step 1：清大廳 CSS 裡的聊天室殘留**

`vn_styles.css` / `lobby.css` 等已搬進 `chat_window.css` 的 `.claude-*` / `mode-claude` / `mode-codex` 規則刪除（確認大廳已不用）。

- [ ] **Step 2：更新 README.md**

README 對應「core/void/」「Claude 房間」段落更新成新結構（`core/chat_window.js` + `core/chat_room.js`）。README 本地檔,**改但不 commit**。

- [ ] **Step 3：commit（不含 README）**

```bash
git add css/vn_styles.css css/lobby.css
git commit -m "Claude/Codex 浮窗 phase4：清除大廳 CSS 聊天室殘留"
```

---

## 自我檢查（spec 對照）

- ✅ 浮窗外殼 + 拖動 + 固定尺寸 + 互斥 → Phase 1
- ✅ 兩個窗、一次一個 → ChatWindow.open 單一 `_winEl`、provider 切換
- ✅ 大廳 🦀/🔷 進、✕ 出 → Task 2.4 / Phase 1 close
- ✅ 解除 iris-input/iris-send-btn 共用 → Task 2.1（cw-input/cw-send-btn）、2.2
- ✅ 歷史改直連 claude_terminal → Task 2.3
- ✅ 設定資料層移進 claude_terminal → Task 3.1
- ✅ ⚙️設置 / 🛠️工作檯 / 💰額度 / 🕘Recents 子面板 → Task 3.2~3.4
- ✅ 清 void_terminal / os_settings / control_center → Phase 4
- ✅ 工作檯/額度模組檔留原地、只搬入口 → Task 3.3（呼叫既有 launch）
- ✅ claude-room.js 移出 void/、全域名沿用 → Task 2.2
