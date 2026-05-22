# 群聊區通用畫布 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 群聊浮窗上方加一個可收合的通用畫布區 —— AI 用 `<lobbyPanel>` marker 產互動 HTML(下棋 / 工具),panel JS 透過 `LP` host 接口走訂閱(cc-bridge)跟 Claude/Codex 互動。

**Architecture:** 新增 `core/chat_canvas.js`（`ChatCanvas`：畫布區 UI + 渲染 + 訂閱版 `LP`）。渲染解析共用既有 `VoidCanvas`。`chat_group.js` 偵測 AI 回覆裡的 marker 交給它。`claude_terminal.js` 加通用 cc-bridge 送訊息入口 `sendRaw`。

**Tech Stack:** 原生 JS（IIFE 掛 window）、cc-bridge SSE streaming、`new Function` 跑 AI 生成 JS、無建置、無測試框架。

**設計依據:** `docs/superpowers/specs/2026-05-22-chat-canvas-design.md`

**驗收方式:** `node --check` 驗語法 + 靜態 server 預覽（`.claude/launch.json` 的 `aurelia-pwa`）用 `preview_eval` 驗行為。每個 Task 完 commit。

---

## 檔案結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `core/chat_canvas.js` | 新建 | `window.ChatCanvas` — 畫布區 UI（收合/展開）+ 渲染（共用 VoidCanvas 解析）+ 訂閱版 `LP` |
| `core/claude_terminal.js` | 修改 | 新增 `sendRaw`（通用 cc-bridge 送訊息）；`GROUP_SYSTEM_PROMPT` 加畫布能力說明 |
| `core/chat_window.js` | 修改 | 群聊模式 `#cw-body` 頂部加 `#cw-canvas` 容器 + 收合 tab |
| `core/chat_group.js` | 修改 | AI 回覆後偵測 `<lobbyPanel>` → 剝掉 + 交給 `ChatCanvas.render` |
| `css/chat_window.css` | 修改 | 畫布區收合/展開、bar、內容樣式 |
| `index.js` / `index.html` | 修改 | 登記 `chat_canvas.js` |

---

## Task 1：claude_terminal.js — sendRaw + 畫布能力說明

**Files:** Modify `core/claude_terminal.js`

- [ ] **Step 1：新增 `ClaudeTerminal.sendRaw`**

`sendGroup` 綁了群聊系統提示;畫布的 `LP` 要送任意 messages（`LP.move` 自帶棋局 prompt）。新增通用入口。

讀 `sendGroup`（task1 群聊那次加的）了解 SSE 解析。為避免第三份 SSE 解析複製，把 `sendGroup` 的 SSE 解析迴圈抽成共用 helper `_parseCcBridgeStream(resp, onProgress)` → `{ reply, sessionId, usage }`，讓 `sendGroup` 與 `sendRaw` 共用。`_sendCcBridge`（舊的單房間路徑）不動。

`sendRaw` 契約：
```javascript
/**
 * 通用 cc-bridge 送訊息：指定 provider + 任意 messages，不綁 conv、不強制 system prompt。
 * opts: { provider:'claude'|'codex', messages:[{role,content}], onProgress, signal }
 * 回傳 { reply, usage }
 */
ClaudeTerminal.sendRaw = async function(opts) {
    opts = opts || {};
    const provider = opts.provider === 'codex' ? 'codex' : 'claude';
    const cfg = ClaudeTerminal.getConfig();
    if (!cfg || !cfg.url || !cfg.key) throw new Error('NOT_CONFIGURED:還沒設定連線');
    const body = {
        model: cfg.model,
        messages: opts.messages || [],
        stream: true,
        max_tokens: cfg.maxTokens,
    };
    if (provider === 'codex') body.cc_backend = 'codex';
    if (Number.isFinite(cfg.temperature)) body.temperature = cfg.temperature;
    if (Number.isFinite(cfg.top_p)) body.top_p = cfg.top_p;
    // POST cfg.url（headers: Authorization Bearer cfg.key + Accept text/event-stream）
    // → 共用 _parseCcBridgeStream → 回 { reply, usage }
    // 錯誤處理沿用 sendGroup（NOT_CONFIGURED / NETWORK / AUTH / SERVER / API / EMPTY）
};
```

- [ ] **Step 2：`GROUP_SYSTEM_PROMPT` 加畫布能力說明**

在 `GROUP_SYSTEM_PROMPT(selfName, otherName)` 回傳的字串末尾加一段：

```
- 你可以產生「互動畫布」：在回覆裡放一段 <lobbyPanel>{ "title":"...", "html":"...", "css":"...", "js":"..." }</lobbyPanel>（合法 JSON）。html/css/js 會被渲染成群聊上方的畫布。
- panel 的 js 裡可調用 host 物件 LP：
  · LP.chat(文字, {provider:'claude'|'codex'}) → 問某個 AI、回字串
  · LP.move(二維棋盤, {provider, aiSymbol, userSymbol, gameName}) → 回合制落子，回 {row,col,line}
  · LP.image(描述) → 生圖、回 URL
  · LP.close() → 關畫布
- 想做下棋、小工具、展示網頁時才用畫布；單純聊天不用。
```

- [ ] **Step 3：驗收 + commit**

`node --check core/claude_terminal.js`。
```bash
git add core/claude_terminal.js
git commit -m "群聊畫布 task1：claude_terminal 加 sendRaw + 群聊提示畫布說明"
```

---

## Task 2：chat_canvas.js — 畫布模組

**Files:** Create `core/chat_canvas.js`

- [ ] **Step 1：寫 `core/chat_canvas.js`**

```javascript
/**
 * core/chat_canvas.js — 群聊區通用畫布
 * AI 用 <lobbyPanel> marker 產互動 HTML，渲染進群聊浮窗上方的畫布區。
 * panel JS 透過 LP 走訂閱(cc-bridge) 跟 Claude/Codex 互動。
 * 解析 / rewire 共用 VoidCanvas。
 */
(function (ChatCanvas) {
    'use strict';

    let _canvasEl = null;   // #cw-canvas（含 bar + content）
    let _tabEl = null;      // 收合後的細 tab

    // ── host 接口 LP（訂閱版）──
    function _makeChatPanelAPI() {
        return {
            chat: async function (text, opts) {
                opts = opts || {};
                const provider = opts.provider === 'codex' ? 'codex' : 'claude';
                if (!window.ClaudeTerminal || !window.ClaudeTerminal.sendRaw) throw new Error('ClaudeTerminal 未載入');
                const r = await window.ClaudeTerminal.sendRaw({
                    provider: provider,
                    messages: [{ role: 'user', content: String(text || '') }],
                });
                return (r.reply || '').trim();
            },

            move: async function (board2d, opts) {
                opts = opts || {};
                const provider = opts.provider === 'codex' ? 'codex' : 'claude';
                const size = board2d.length;
                const aiSym   = opts.aiSymbol   || '●';
                const userSym = opts.userSymbol || '○';
                const game    = opts.gameName   || '棋盤遊戲';
                const colHeader = '    ' + Array.from({ length: size }, (_, i) => String(i).padStart(2)).join('');
                const rows = board2d.map((row, r) =>
                    String(r).padStart(2) + ' |' + row.map(cell =>
                        cell === 'AI' ? ' ' + aiSym : cell === 'USER' ? ' ' + userSym : ' .'
                    ).join(''));
                const boardText = [colHeader].concat(rows).join('\n');
                const prompt = '你正在玩「' + game + '」。你的棋子：' + aiSym + '　對手棋子：' + userSym + '\n\n' +
                    '當前棋盤（行/列從 0 開始）：\n' + boardText + '\n\n' +
                    (opts.extraContext || '') +
                    '\n請分析棋盤、選最佳落子。嚴格按以下格式回應、不可省略：\nMOVE:(行),(列)\nLINE:[一句話，10-20字]';
                const r = await window.ClaudeTerminal.sendRaw({
                    provider: provider,
                    messages: [{ role: 'system', content: prompt }],
                });
                const raw = (r.reply || '').trim();
                const mv = raw.match(/MOVE:\s*(\d+)\s*,\s*(\d+)/i);
                const ln = raw.match(/LINE:\s*(.+)/i);
                if (!mv) return { row: -1, col: -1, line: raw.slice(0, 40) };
                return { row: parseInt(mv[1], 10), col: parseInt(mv[2], 10), line: ln ? ln[1].trim() : '' };
            },

            image: async function (prompt, type) {
                if (window.__IS_PREVIEW || !window.OS_IMAGE_MANAGER) {
                    return 'https://via.placeholder.com/400x300/1e1e2a/cfd2e6?text=Preview';
                }
                return await window.OS_IMAGE_MANAGER.generate(prompt, type || 'item');
            },

            close: function () { ChatCanvas.close(); },
        };
    }

    // ── 掛載畫布區（由 chat_window 在群聊模式給 #cw-canvas 元素）──
    ChatCanvas.mount = function (canvasEl, tabEl) {
        _canvasEl = canvasEl;
        _tabEl = tabEl;
        if (_canvasEl) {
            const collapseBtn = _canvasEl.querySelector('.cw-canvas-collapse');
            const closeBtn = _canvasEl.querySelector('.cw-canvas-close');
            if (collapseBtn) collapseBtn.addEventListener('click', () => ChatCanvas.collapse());
            if (closeBtn) closeBtn.addEventListener('click', () => ChatCanvas.close());
        }
        if (_tabEl) _tabEl.addEventListener('click', () => ChatCanvas.expand());
    };

    ChatCanvas.expand = function () {
        if (_canvasEl) _canvasEl.style.display = 'flex';
        if (_tabEl) _tabEl.style.display = 'none';
    };
    ChatCanvas.collapse = function () {
        // 收合：藏畫布、留 tab（內容保留）
        if (_canvasEl) _canvasEl.style.display = 'none';
        if (_tabEl && _hasContent()) _tabEl.style.display = 'flex';
    };
    ChatCanvas.close = function () {
        // 關閉：清掉內容
        if (_canvasEl) {
            _canvasEl.style.display = 'none';
            const c = _canvasEl.querySelector('.cw-canvas-content');
            if (c) c.innerHTML = '';
        }
        if (_tabEl) _tabEl.style.display = 'none';
        window.__CW_LP = null;
    };

    function _hasContent() {
        const c = _canvasEl && _canvasEl.querySelector('.cw-canvas-content');
        return !!(c && c.children.length);
    }

    // ── 渲染一個 panel ──
    ChatCanvas.render = function (panelData) {
        if (!_canvasEl || !panelData) return;
        const content = _canvasEl.querySelector('.cw-canvas-content');
        const titleEl = _canvasEl.querySelector('.cw-canvas-title');
        if (!content) return;

        let styleEl = document.getElementById('cw-canvas-style');
        if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'cw-canvas-style'; document.head.appendChild(styleEl); }
        styleEl.textContent = panelData.css || '';

        content.innerHTML = panelData.html || '';
        if (titleEl) titleEl.textContent = panelData.title || '🎮 畫布';
        ChatCanvas.expand();

        const LP = _makeChatPanelAPI();
        window.__CW_LP = LP;
        if (panelData.js) {
            try {
                new Function('container', 'LP', panelData.js)(content, LP);
            } catch (e) {
                content.innerHTML += '<div class="cw-canvas-err">⚠️ 畫布 JS 錯誤：' + (e && e.message) + '</div>';
            }
        }
        // 重綁 onclick（共用 VoidCanvas 的 rewire，讓 onclick 在有 LP 的作用域跑）
        if (window.VoidCanvas && typeof window.VoidCanvas.rewireOnclicks === 'function') {
            window.VoidCanvas.rewireOnclicks(content, LP);
        }
    };

    console.log('✅ ChatCanvas（群聊區通用畫布）模組就緒');
})(window.ChatCanvas = window.ChatCanvas || {});
```

- [ ] **Step 2：`node --check core/chat_canvas.js` + commit**

```bash
git add core/chat_canvas.js
git commit -m "群聊畫布 task2：新增 ChatCanvas 模組（渲染 + 訂閱版 LP）"
```

---

## Task 3：chat_window.js — 群聊模式加畫布區

**Files:** Modify `core/chat_window.js`

- [ ] **Step 1：`_buildWindow` 的 `#cw-body` 頂部加 `#cw-canvas`**

在 `#cw-body` 內、`claude-portrait-area` 之前，加畫布區（預設 `display:none`，群聊有畫布時才顯示）+ 收合 tab：

```html
<div id="cw-canvas" class="cw-canvas" style="display:none;">
    <div class="cw-canvas-bar">
        <span class="cw-canvas-title">🎮 畫布</span>
        <button class="cw-canvas-collapse" type="button" title="收合">▲</button>
        <button class="cw-canvas-close" type="button" title="關閉">✕</button>
    </div>
    <div class="cw-canvas-content"></div>
</div>
<div id="cw-canvas-tab" class="cw-canvas-tab" style="display:none;">▾ 展開畫布</div>
```

- [ ] **Step 2：`_buildWindow` 結尾掛載 ChatCanvas**

`_bindChatInput(el)` 附近加：
```javascript
        if (window.ChatCanvas && typeof window.ChatCanvas.mount === 'function') {
            window.ChatCanvas.mount(el.querySelector('#cw-canvas'), el.querySelector('#cw-canvas-tab'));
        }
```

- [ ] **Step 3：切換房間時清畫布**

`_loadRoom(provider)`：非群聊（`provider !== 'group'`）時，呼叫 `window.ChatCanvas && window.ChatCanvas.close()`（離開群聊就收掉畫布，避免殘留在單人房間）。群聊模式不主動清（保留畫布）。

- [ ] **Step 4：`node --check` + commit**

```bash
git add core/chat_window.js
git commit -m "群聊畫布 task3：群聊浮窗上方加畫布區容器"
```

---

## Task 4：chat_group.js — 偵測 marker 交給畫布

**Files:** Modify `core/chat_group.js`

- [ ] **Step 1：`_runTurn` 收到 AI 回覆後偵測 `<lobbyPanel>`**

`_runTurn` 裡，拿到 `result.reply` 後、push 進 transcript 前：用 `VoidCanvas.parseLobbyPanel` 偵測。若有 panel → 從顯示文字剝掉 marker、把 panelData 交給 `ChatCanvas.render`。

在 `_runTurn` 內，`const reply = (result.reply || '').trim();` 之後加：
```javascript
        // 偵測 <lobbyPanel> 畫布 marker
        let displayText = result.reply;
        if (window.VoidCanvas && typeof window.VoidCanvas.parseLobbyPanel === 'function') {
            const panel = window.VoidCanvas.parseLobbyPanel(result.reply);
            if (panel) {
                displayText = result.reply.replace(/<lobbyPanel>[\s\S]*?<\/lobbyPanel>/i, '').trim();
                if (window.ChatCanvas && typeof window.ChatCanvas.render === 'function') {
                    window.ChatCanvas.render(panel);
                }
            }
        }
```
然後氣泡渲染 / transcript push 用 `displayText`（而非原 `result.reply`）—— 若 `displayText` 剝完是空字串，代表這則 AI 回覆只有畫布、沒對話文字：不渲染空氣泡、不進 transcript（但畫布已渲染）。`[PASS]` 判定仍對原 `reply` 做。

- [ ] **Step 2：`node --check` + commit**

```bash
git add core/chat_group.js
git commit -m "群聊畫布 task4：群聊偵測 lobbyPanel marker → 渲染畫布"
```

---

## Task 5：css/chat_window.css — 畫布區樣式

**Files:** Modify `css/chat_window.css`

- [ ] **Step 1：加畫布區樣式**

- `#aurelia-chat-window .cw-canvas`：`flex-direction:column; flex:0 0 45%; min-height:0; background:#16161f; border-bottom:1px solid rgba(255,255,255,0.1);`（佔窗身上半 45%）
- `.cw-canvas-bar`：`flex; align-items:center; gap:6px; padding:5px 8px;`；`.cw-canvas-title { flex:1; font-size:12px; color:#cfd2e6; }`；`.cw-canvas-collapse / .cw-canvas-close`：小圖示鈕。
- `.cw-canvas-content`：`flex:1; overflow:auto; min-height:0;`
- `.cw-canvas-tab`：`display:flex; align-items:center; justify-content:center; padding:4px; font-size:11px; color:#9a93a8; background:#16161f; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.08);`（收合後的細條）
- `.cw-canvas-err`：`color:#d9534f; font-size:11px; padding:6px;`
- 群聊模式：`#cw-canvas` / `#cw-canvas-tab` 只在 `.cw-body-group` 下才可能顯示;單人房間模式一律 `display:none`（加 `#aurelia-chat-window:not(.cw-group) #cw-canvas, ...tab { display:none !important; }`）。

- [ ] **Step 2：commit**

```bash
git add css/chat_window.css
git commit -m "群聊畫布 task5：畫布區樣式"
```

---

## Task 6：登記 chat_canvas.js 載入

**Files:** Modify `index.js`、`index.html`

- [ ] **Step 1：`index.js` MODULE_LOAD_ORDER**

在 `chat_group` 之後加：
```javascript
    { name: 'chat_canvas', path: './scripts/extensions/third-party/my-tavern-extension/core/chat_canvas.js', key: 'chatCanvas' },
```

- [ ] **Step 2：`index.html` `<script>`**

在 `core/chat_group.js` 之後加：
```html
    <script src="core/chat_canvas.js"></script>
```

- [ ] **Step 3：驗收**

預覽重載 → `ChatWindow.open('group')` → `ChatGroup` / `ChatCanvas` 都存在。
手動測渲染：`ChatCanvas.render({title:'測試',html:'<div style=color:white>hello</div>',css:'',js:''})` → 畫布區應展開、顯示 hello。
`ChatCanvas.close()` → 收掉。
（真正 AI 產畫布要 cc-bridge 設定好才會動。）

- [ ] **Step 4：commit**

```bash
git add index.js index.html
git commit -m "群聊畫布 task6：接入 chat_canvas.js 載入"
```

---

## 自我檢查（spec 對照）

- ✅ 畫布區（群聊上方、可收合）→ Task 3（`#cw-canvas` + tab）、Task 5（CSS）
- ✅ AI 用 `<lobbyPanel>` marker 產畫布 → Task 4（`parseLobbyPanel` 偵測）
- ✅ host 接口 `LP`（chat/move/image/close）走訂閱 → Task 2（`_makeChatPanelAPI` → `sendRaw`）
- ✅ 通用 cc-bridge 入口 `sendRaw` → Task 1
- ✅ 對弈：`LP.move` 可指定 provider → Task 2（`move` 的 `opts.provider`）
- ✅ 渲染解析共用 VoidCanvas → Task 2（`rewireOnclicks`）、Task 4（`parseLobbyPanel`）
- ✅ 群聊系統提示加畫布說明 → Task 1 Step 2
- ✅ v1 只群聊、單人房間不顯示畫布 → Task 5（`:not(.cw-group)` 隱藏）、Task 3 Step 3（離開群聊 close）
- 註：`new Function` 跑 AI JS = 沿用 VoidCanvas 既有信任假設，不額外加沙箱（spec §九）。
- 註：JSX/React、多畫布、跨重載持久化 = 不在 v1（spec §八）。
