# Claude × Codex 群聊區 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Claude/Codex 浮窗加第三個「👥 群聊區」模式 —— 你、Claude、Codex 三方同一聊天室,Claude/Codex 看得到彼此、骰子決定誰回、可 `[PASS]`。

**Architecture:** 新增 `core/chat_group.js`（`ChatGroup` 協調器:骰子編排 + 傳話增量 + PASS + 三方氣泡渲染）。`chat_window.js` 加 `'group'` 模式委派給 `ChatGroup`。`claude_terminal.js` 加群聊系統提示 + 不綁 conv 系統的群聊送訊息入口。

**Tech Stack:** 原生 JS（IIFE 掛 window）、cc-bridge SSE streaming、OS_DB（IndexedDB）、無建置、無測試框架。

**設計依據:** `docs/superpowers/specs/2026-05-22-claude-codex-group-chat-design.md`

**驗收方式:** `node --check` 驗語法 + 靜態 server 預覽（`.claude/launch.json` 的 `aurelia-pwa`）用 `preview_eval` 驗行為。每個 Task 完 commit。

---

## 檔案結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `core/chat_group.js` | 新建 | `window.ChatGroup` —— 群聊協調器 + 三方氣泡渲染 + transcript 持久化 |
| `core/claude_terminal.js` | 修改 | 群聊系統提示 + `ClaudeTerminal.sendGroup()`（不綁 conv 系統的 cc-bridge 送訊息） |
| `core/chat_window.js` | 修改 | `_provider` 加 `'group'`;group 模式身份/配色/隱藏立繪與 picker;輸入改派給 ChatGroup;💬 選單加「👥 群聊區」(選單 HTML 在此檔的 `toggleLauncherMenu`) |
| `css/chat_window.css` | 修改 | group 模式配色 + 三方氣泡標頭 + typing 指示 |
| `index.js` / `index.html` | 修改 | 登記 `chat_group.js` |

---

## Task 1：claude_terminal.js — 群聊送訊息支援

**Files:** Modify `core/claude_terminal.js`

群聊不能用 `ClaudeTerminal.send`（它綁多會話 conv 系統、會 loadHistory/saveHistory、用固定的房間 system prompt）。需要一個獨立入口。

- [ ] **Step 1：加群聊系統提示常數**

在 `claude_terminal.js` 既有的 `CLAUDE_ROOM_SYSTEM_PROMPT` / `CODEX_ROOM_SYSTEM_PROMPT` 附近加：

```javascript
    const GROUP_SYSTEM_PROMPT = (selfName, otherName) =>
`你正在「奧瑞亞 Aurelia」擴展的「群聊區」裡，跟使用者 Rae、以及另一個 AI（${otherName}）三方聊天。

- 其他人的發言會標上講者前綴，例如 [Rae]: ... 或 [${otherName}]: ...。你的回覆不需要加自己的前綴。
- 你可以正常回應 Rae，也可以接 ${otherName} 的話、附和或吐槽。
- 如果這一輪你沒什麼好補充的，就「只輸出」 [PASS] 四個字（不要加任何其他內容），代表這次略過不講。
- 你是 ${selfName}。預設用繁體中文，語氣自然、像在群組裡聊天，不用太長。`;
```

- [ ] **Step 2：加 `ClaudeTerminal.sendGroup`**

讀 `_sendCcBridge`（約 line 722~）了解 SSE 串流解析。新增一個自足的群聊送訊息函式 —— **不呼叫 loadHistory/saveHistory/getSessionId**：

```javascript
    /**
     * 群聊專用送訊息：指定 provider + session_id，不碰多會話 conv 系統。
     * opts: { provider:'claude'|'codex', sessionId:string|null, userText, onProgress, signal }
     * 回傳 { reply, sessionId, usage }。sessionId 為 cc-bridge 回傳的新/續用 sid。
     */
    ClaudeTerminal.sendGroup = async function(opts) {
        const provider = opts.provider === 'codex' ? 'codex' : 'claude';
        // 取連線設定：沿用 getConfig 邏輯，但 provider 要先暫時切過去
        const _prevProvider = _provider;
        _provider = provider;
        let cfg;
        try { cfg = ClaudeTerminal.getConfig(); } finally { _provider = _prevProvider; }
        if (!cfg || !cfg.url || !cfg.key) throw new Error('NOT_CONFIGURED:還沒設定 ' + provider + ' 的連線');

        const sid = opts.sessionId || null;
        const otherName = provider === 'codex' ? 'Claude' : 'Codex';
        const selfName  = provider === 'codex' ? 'Codex' : 'Claude';
        const sysPrompt = GROUP_SYSTEM_PROMPT(selfName, otherName);
        const apiMessages = sid
            ? [{ role: 'user', content: opts.userText }]
            : [{ role: 'system', content: sysPrompt }, { role: 'user', content: opts.userText }];

        const body = {
            model: cfg.model, messages: apiMessages, stream: true, max_tokens: cfg.maxTokens,
        };
        if (provider === 'codex') body.cc_backend = 'codex';
        if (sid) body.session_id = sid;
        if (Number.isFinite(cfg.temperature)) body.temperature = cfg.temperature;
        if (Number.isFinite(cfg.top_p)) body.top_p = cfg.top_p;

        // POST + 解析 SSE。實作時：把 _sendCcBridge 的 SSE 解析迴圈抽成共用 helper
        // _parseCcBridgeStream(resp, onProgress) → { reply, newSid, usage } 讓兩邊共用；
        // 若抽取風險高，sendGroup 自己做一份精簡 SSE 解析（只取 text delta + session_id + usage）。
        // 回傳 { reply, sessionId: newSid || sid, usage }。
    };
```

實作 Step 2 時：先完整讀 `_sendCcBridge` 的 SSE 解析段（line ~788 起），優先抽 `_parseCcBridgeStream` 共用 helper（DRY）；確認 `_sendCcBridge` 改動安全後兩邊共用。POST 用 `cfg.url`、headers 帶 `Authorization: Bearer cfg.key` + `Accept: text/event-stream`。

- [ ] **Step 3：驗收 + commit**

`node --check core/claude_terminal.js`。
```bash
git add core/claude_terminal.js
git commit -m "群聊區 task1：claude_terminal 加群聊系統提示 + sendGroup"
```

---

## Task 2：chat_group.js — 群聊協調器 + 渲染

**Files:** Create `core/chat_group.js`

- [ ] **Step 1：寫 `core/chat_group.js`**

```javascript
/**
 * core/chat_group.js — Claude × Codex 群聊區協調器
 * 你 / Claude / Codex 三方同一聊天室。骰子決定誰拿發言權、可 [PASS]。
 * 傳話人模型：Claude / Codex 各自獨立 session，互相轉述。
 */
(function (ChatGroup) {
    'use strict';

    const STORE_KEY  = 'group_chat_main';     // OS_DB transcript
    const SID_CLAUDE = 'group_claude_sid';    // localStorage
    const SID_CODEX  = 'group_codex_sid';
    const LABEL = { rae: 'Rae', claude: 'Claude', codex: 'Codex' };

    let _transcript = [];   // [{ speaker:'rae'|'claude'|'codex', content, ts, usage? }]
    let _seen = { claude: -1, codex: -1 };  // 各 AI 已被送到第幾則 transcript index
    let _busy = false;
    let _streamEl = null;   // 渲染目標（窗內 chat-stream）

    function _lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
    function _lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} }
    function _sidKey(p) { return p === 'codex' ? SID_CODEX : SID_CLAUDE; }

    function _save() {
        if (window.OS_DB && typeof window.OS_DB.saveStudioChat === 'function') {
            window.OS_DB.saveStudioChat(STORE_KEY, _transcript).catch(() => {});
        }
    }

    // ── 載入 ──
    ChatGroup.load = async function () {
        _transcript = [];
        if (window.OS_DB && typeof window.OS_DB.getStudioChat === 'function') {
            try { const m = await window.OS_DB.getStudioChat(STORE_KEY); if (Array.isArray(m)) _transcript = m; } catch (_) {}
        }
        // 兩個 AI 的 session 已續到上次存檔點 → seen 設為 transcript 末端
        _seen.claude = _transcript.length - 1;
        _seen.codex  = _transcript.length - 1;
    };

    // ── 渲染 ──
    function _scrollBottom() { if (_streamEl) _streamEl.scrollTop = _streamEl.scrollHeight; }

    function _renderBubble(speaker, content) {
        if (!_streamEl) return null;
        const wrap = document.createElement('div');
        wrap.className = 'cg-bubble-wrap cg-from-' + speaker;
        if (speaker !== 'rae') {
            const hdr = document.createElement('div');
            hdr.className = 'cg-bubble-hdr';
            hdr.textContent = (speaker === 'codex' ? '🔷 Codex' : '🦀 Claude');
            wrap.appendChild(hdr);
        }
        const b = document.createElement('div');
        b.className = 'cg-bubble cg-from-' + speaker;
        b.textContent = content;
        wrap.appendChild(b);
        _streamEl.appendChild(wrap);
        _scrollBottom();
        return b;
    }

    function _renderTyping(speaker) {
        if (!_streamEl) return null;
        const wrap = document.createElement('div');
        wrap.className = 'cg-bubble-wrap cg-from-' + speaker;
        wrap.innerHTML = '<div class="cg-bubble-hdr">' + (speaker === 'codex' ? '🔷 Codex' : '🦀 Claude') +
            '</div><div class="cg-bubble cg-from-' + speaker + ' cg-typing">正在輸入…</div>';
        _streamEl.appendChild(wrap);
        _scrollBottom();
        return wrap;
    }

    /** 把整條 transcript 渲染進 streamEl（進群聊時用） */
    ChatGroup.hydrate = function (streamEl) {
        _streamEl = streamEl;
        _streamEl.innerHTML = '';
        if (!_transcript.length) {
            _renderBubble('claude', '群聊區開張了。你、Claude、Codex 三個人。說點什麼吧。');
            return;
        }
        _transcript.forEach(m => _renderBubble(m.speaker, m.content));
    };

    // ── 傳話增量 ──
    function _buildDelta(provider) {
        const lines = [];
        for (let i = _seen[provider] + 1; i < _transcript.length; i++) {
            const m = _transcript[i];
            if (m.speaker === provider) continue;  // 它自己的話已在它 session 裡
            lines.push('[' + LABEL[m.speaker] + ']: ' + m.content);
        }
        return lines.join('\n\n');
    }

    // ── 一個 AI 的回合 ──
    async function _runTurn(provider) {
        const delta = _buildDelta(provider);
        if (!delta.trim()) { _seen[provider] = _transcript.length - 1; return false; }

        const typingWrap = _renderTyping(provider);
        const bubbleEl = typingWrap && typingWrap.querySelector('.cg-bubble');
        let acc = '';
        let result;
        try {
            result = await window.ClaudeTerminal.sendGroup({
                provider,
                sessionId: _lsGet(_sidKey(provider)),
                userText: delta,
                onProgress: (ev) => {
                    if (ev && ev.type === 'text') {
                        acc = ev.accumulated || (acc + (ev.delta || ''));
                        if (bubbleEl) { bubbleEl.classList.remove('cg-typing'); bubbleEl.textContent = acc; _scrollBottom(); }
                    }
                },
            });
        } catch (e) {
            if (bubbleEl) { bubbleEl.classList.remove('cg-typing'); bubbleEl.classList.add('cg-error');
                bubbleEl.textContent = '⚠️ ' + ((e && e.message) || '送出失敗'); }
            // 送出失敗：不推進 _seen —— 這個 AI 沒真的收到增量，下一輪再補送
            return false;
        }
        if (result.sessionId) _lsSet(_sidKey(provider), result.sessionId);

        const reply = (result.reply || '').trim();
        if (/^\[PASS\]$/i.test(reply)) {
            if (typingWrap && typingWrap.parentNode) typingWrap.parentNode.removeChild(typingWrap);  // 略過：移掉氣泡
            _seen[provider] = _transcript.length - 1;
            return false;
        }
        if (bubbleEl) { bubbleEl.classList.remove('cg-typing'); bubbleEl.textContent = result.reply; }
        _transcript.push({ speaker: provider, content: result.reply, ts: Date.now(), usage: result.usage || null });
        _seen[provider] = _transcript.length - 1;
        _save();
        return true;
    }

    // ── 你發訊息 → 編排 ──
    ChatGroup.sendUserMessage = async function (text) {
        if (_busy || !text || !text.trim()) return;
        _busy = true;
        try {
            _transcript.push({ speaker: 'rae', content: text, ts: Date.now() });
            _renderBubble('rae', text);
            _save();

            const first  = Math.random() < 0.5 ? 'claude' : 'codex';
            const second = first === 'claude' ? 'codex' : 'claude';

            const firstSpoke = await _runTurn(first);
            // 第二位：~70% 機率；第一位沒講（PASS/錯誤）→ 100% 保證輪到
            if (!firstSpoke || Math.random() < 0.7) {
                await _runTurn(second);
            }
        } finally {
            _busy = false;
        }
    };

    // ── 清空 ──
    ChatGroup.clear = function () {
        _transcript = [];
        _seen = { claude: -1, codex: -1 };
        _lsSet(SID_CLAUDE, null);
        _lsSet(SID_CODEX, null);
        _save();
        if (_streamEl) ChatGroup.hydrate(_streamEl);
    };

    ChatGroup.isBusy = function () { return _busy; };

    console.log('✅ ChatGroup（群聊區協調器）模組就緒');
})(window.ChatGroup = window.ChatGroup || {});
```

- [ ] **Step 2：驗收 + commit**

`node --check core/chat_group.js`。
```bash
git add core/chat_group.js
git commit -m "群聊區 task2：新增 ChatGroup 協調器（骰子編排 + 傳話 + 渲染）"
```

---

## Task 3：chat_window.js — `'group'` 模式

**Files:** Modify `core/chat_window.js`

- [ ] **Step 1：`IDENTITY` 與 provider 接受 `'group'`**

`IDENTITY` 物件加 `group: '👥 群聊區'`。`ChatWindow.open` 的 `provider = provider === 'codex' ? 'codex' : 'claude'` 改成允許 `'group'`：
```javascript
        provider = (provider === 'codex' || provider === 'group') ? provider : 'claude';
```
`_winEl.classList.toggle('cw-codex', provider === 'codex')` 之後加 `_winEl.classList.toggle('cw-group', provider === 'group')`。

- [ ] **Step 2：`_loadRoom` 群聊分支**

`_loadRoom(provider)` 開頭加：若 `provider === 'group'` → 走群聊流程、`return`：
```javascript
        if (provider === 'group') {
            const body = _winEl.querySelector('#cw-body');
            if (body) body.classList.add('cw-body-group');  // CSS 藏立繪/picker
            const stream = _winEl.querySelector('#claude-chat-stream');
            if (window.ChatGroup) {
                await window.ChatGroup.load();
                if (stream) window.ChatGroup.hydrate(stream);
            }
            return;
        }
        // 非群聊：移除 group class（從群聊切回單房間時）
        const body0 = _winEl.querySelector('#cw-body');
        if (body0) body0.classList.remove('cw-body-group');
```

- [ ] **Step 3：`submitInput` 群聊分支**

`ChatWindow.submitInput` 內，送出時依模式分派：
```javascript
        if (_provider === 'group') {
            if (window.ChatGroup && typeof window.ChatGroup.sendUserMessage === 'function') {
                window.ChatGroup.sendUserMessage(txt);
            }
        } else if (window.VoidClaudeRoom && typeof window.VoidClaudeRoom.sendMessage === 'function') {
            window.VoidClaudeRoom.sendMessage(txt);
        }
```

- [ ] **Step 4：驗收 + commit**

`node --check core/chat_window.js`。
```bash
git add core/chat_window.js
git commit -m "群聊區 task3：chat_window 加 group 模式"
```

---

## Task 4：ui_utilities.js — 💬 選單加「👥 群聊區」

**Files:** Modify `core/chat_window.js`（`toggleLauncherMenu` 的選單內容）

`toggleLauncherMenu` 內 `_menuEl.innerHTML` 目前兩項（claude/codex），加第三項：
```javascript
            _menuEl.innerHTML =
                '<button class="cw-lm-item" data-p="claude" type="button">🦀 Claude 的房間</button>' +
                '<button class="cw-lm-item" data-p="codex" type="button">🔷 Codex 的房間</button>' +
                '<button class="cw-lm-item" data-p="group" type="button">👥 群聊區</button>';
```
（`.cw-lm-item` 的 click handler 已經是 `ChatWindow.open(b.dataset.p)`，`'group'` 自動支援。）

- [ ] **驗收 + commit**

```bash
git add core/chat_window.js
git commit -m "群聊區 task4：💬 啟動選單加群聊區入口"
```

---

## Task 5：css/chat_window.css — 群聊樣式

**Files:** Modify `css/chat_window.css`

- [ ] **Step 1：加群聊樣式**

- `#aurelia-chat-window.cw-group`：中性深色背景（如 `#1e1e2a`）。
- `#aurelia-chat-window .cw-body-group .claude-portrait-area`、`.cw-body-group .claude-picker-bar`、`.cw-body-group #claude-picker-popup`：`display:none !important`（群聊隱藏立繪 + picker）。
- `.cg-bubble-wrap`：flex column、`max-width:85%`；`.cg-from-rae` → `align-self:flex-end`;`.cg-from-claude`/`.cg-from-codex` → `align-self:flex-start`。
- `.cg-bubble-hdr`：小字、AI 名稱標頭（claude 暖橘 `#EAB05C`、codex 冷藍 `#5b9bd5`）。
- `.cg-bubble`：圓角氣泡;`.cg-from-rae` 橘底白字;`.cg-from-claude` 白底 + 暖橘邊;`.cg-from-codex` 白底 + 冷藍邊。
- `.cg-bubble.cg-typing`：淡色斜體;`.cg-bubble.cg-error`：紅字。
- chat-stream 在 group 模式撐滿（`.cw-body-group #claude-chat-stream { flex:1 }`，立繪藏了自然撐滿）。

- [ ] **Step 2：commit**

```bash
git add css/chat_window.css
git commit -m "群聊區 task5：群聊配色 + 三方氣泡樣式"
```

---

## Task 6：登記 chat_group.js 載入

**Files:** Modify `index.js`、`index.html`

- [ ] **Step 1：`index.js` MODULE_LOAD_ORDER**

在 `chat_room` 之後、`void_terminal` 之前加：
```javascript
    { name: 'chat_group', path: './scripts/extensions/third-party/my-tavern-extension/core/chat_group.js', key: 'chatGroup' },
```

- [ ] **Step 2：`index.html` `<script>`**

在 `core/chat_room.js` 之後加：
```html
    <script src="core/chat_group.js"></script>
```

- [ ] **Step 3：驗收**

預覽重載 → `ChatWindow.open('group')` → 應開出群聊浮窗、有歡迎氣泡。`ChatGroup` 存在。發訊息（需有 cc-bridge 設定才會真的回）→ 骰子編排、三方氣泡。

- [ ] **Step 4：commit**

```bash
git add index.js index.html
git commit -m "群聊區 task6：接入 chat_group.js 載入"
```

---

## 自我檢查（spec 對照）

- ✅ 傳話人模型 / session 各自獨立 → `_buildDelta` + 每 provider 自己的 sid（Task 1 sendGroup、Task 2 `_seen`/`_sidKey`）
- ✅ 偽機率 + PASS 編排 → Task 2 `sendUserMessage` 骰子 + `_runTurn` 的 `[PASS]` 判定
- ✅ 只送增量、保留 resume → `_buildDelta` 只取 `_seen` 之後;sendGroup 有 sid 走 resume
- ✅ 💬 選單入口 → Task 4
- ✅ 三方氣泡 + 中性配色 + 隱藏立繪/picker → Task 3 `cw-body-group` + Task 5 CSS
- ✅ 群聊獨立 transcript + 兩條 sid 儲存 → Task 2 `STORE_KEY` / `SID_*`
- ✅ 錯誤不中斷另一個 → `_runTurn` catch 後 return false、編排照常輪第二位
- ✅ 群聊系統提示（含 PASS 規則）→ Task 1 `GROUP_SYSTEM_PROMPT`
- 註:`[PASS]` 判定用 `/^\[PASS\]$/i`（整則 trim 後就是 PASS），符合 spec §3.3。
- 註:v1 不做 group 多會話 Recents、不做自動多輪 —— 符合 spec §八。
