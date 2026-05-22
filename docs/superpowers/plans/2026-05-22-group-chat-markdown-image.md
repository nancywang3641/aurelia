# 群聊區 Markdown + 圖片附件 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把單人房間的 markdown 渲染與圖片/附件功能補進群聊區，讓群聊跟單聊平手。

**Architecture:** Markdown 重用單人房間 `_claudeMarkdownToSafeHtml`（export 後共用），群聊 AI 氣泡套既有 `.claude-bubble-md` CSS。圖片走「上傳 cc-bridge 拿路徑 + 前端做 base64 縮圖存 transcript」；附件隨傳話增量送進 `sendGroup` → cc-bridge 餵兩個 AI。

**Tech Stack:** 原生瀏覽器 JS（IIFE 模組掛 window）、SillyTavern 第三方擴展。無測試框架 —— 每個 JS 任務以 `node --check` 驗語法，最後由 Rae 在酒館實測。

**設計來源：** `docs/superpowers/specs/2026-05-22-group-chat-markdown-image-design.md`

---

## 檔案結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `core/chat_room.js` | 修改 | export `VoidClaudeRoom.markdownToSafeHtml` |
| `core/chat_group.js` | 修改 | markdown 套用、附件狀態 / 上傳 / 縮圖 / 顯示 / 增量收集 |
| `core/claude_terminal.js` | 修改 | `sendGroup` 帶 `attachments` |
| `core/chat_window.js` | 修改 | 群聊模式接 📎 按鈕、`submitInput` 允許純附件送出 |
| `css/chat_window.css` | 修改 | 待送附件列、氣泡內附件、放大 overlay 樣式 |

**計畫層決定（與 spec 用字略有出入，更省）：**
- 群聊 AI 氣泡用既有 class `claude-bubble-md`（不是 `cg-bubble-md`）→ 直接吃 `aurelia_core.css` 既有 markdown 樣式，markdown 不需新 CSS。
- 待送附件 chip 渲染進既有容器 `#claude-attach-chips`（不新增 HTML 元素），群聊用 `cg-pending-*` class 區隔。

---

## Task 1：Markdown 渲染

**Files:**
- Modify: `core/chat_room.js`
- Modify: `core/chat_group.js`

- [ ] **Step 1：chat_room.js — export markdown 渲染器**

在 `core/chat_room.js` 找到 `VoidClaudeRoom.sendMessage = _sendClaudeMessage;` 那行，在它下面加一行：

```js
    VoidClaudeRoom.markdownToSafeHtml = _claudeMarkdownToSafeHtml;
```

- [ ] **Step 2：chat_group.js — 加 `_setBubbleContent` helper**

在 `core/chat_group.js` 的 `function _renderBubble(` 那行之前，加入：

```js
    // 把內容塞進氣泡：AI → markdown 渲染；Rae → 純文字。一律先剝遊戲標記。
    function _setBubbleContent(bubbleEl, speaker, content) {
        const clean = _stripForDisplay(content);
        if (speaker !== 'rae' && window.VoidClaudeRoom
            && typeof window.VoidClaudeRoom.markdownToSafeHtml === 'function') {
            const html = window.VoidClaudeRoom.markdownToSafeHtml(clean);
            if (html !== null && html !== undefined) {
                bubbleEl.innerHTML = html;
                bubbleEl.classList.add('claude-bubble-md');
                return;
            }
        }
        bubbleEl.textContent = clean;
    }
```

- [ ] **Step 3：chat_group.js — `_renderBubble` 改用 `_setBubbleContent`**

在 `_renderBubble` 裡，把這行：

```js
        b.textContent = _stripForDisplay(content);
```

換成：

```js
        _setBubbleContent(b, speaker, content);
```

- [ ] **Step 4：chat_group.js — `_runTurn` 最終渲染改用 `_setBubbleContent`**

在 `_runTurn` 裡找到最終渲染那段：

```js
        } else if (bubbleEl) {
            bubbleEl.classList.remove('cg-typing');
            bubbleEl.textContent = displayText;
        }
```

換成：

```js
        } else if (bubbleEl) {
            bubbleEl.classList.remove('cg-typing');
            _setBubbleContent(bubbleEl, provider, result.reply);
        }
```

（streaming 期間的 `onProgress` 維持 `bubbleEl.textContent = _stripForDisplay(acc)` 不動 —— 串流純文字、結束才 markdown。）

- [ ] **Step 5：驗證語法**

Run: `node --check core/chat_room.js && node --check core/chat_group.js`
Expected: 無輸出。

- [ ] **Step 6：Commit**

```bash
git add core/chat_room.js core/chat_group.js
git commit -m "群聊圖文 task1：群聊氣泡接 markdown 渲染"
```

---

## Task 2：`sendGroup` 帶附件

**Files:**
- Modify: `core/claude_terminal.js`

- [ ] **Step 1：`sendGroup` body 加 attachments**

在 `core/claude_terminal.js` 的 `ClaudeTerminal.sendGroup` 函式裡，找到：

```js
        if (sid) body.session_id = sid;
```

在它下面加一行：

```js
        if (Array.isArray(opts.attachments) && opts.attachments.length) body.attachments = opts.attachments;
```

- [ ] **Step 2：驗證語法**

Run: `node --check core/claude_terminal.js`
Expected: 無輸出。

- [ ] **Step 3：Commit**

```bash
git add core/claude_terminal.js
git commit -m "群聊圖文 task2：sendGroup 帶 attachments"
```

---

## Task 3：附件狀態 + 上傳 + 縮圖

**Files:**
- Modify: `core/chat_group.js`

- [ ] **Step 1：加待送附件模組變數**

在 `core/chat_group.js` 的 `let _game = null;` 那行下面加一行：

```js
    let _pendingAttachments = [];   // 待送附件：{path,filename,mime,size,thumb} 或 {_uploading:true,filename,mime,size}
```

- [ ] **Step 2：加縮圖 + 取容器 helper**

在 `_renderSystemLine` 函式之後加入：

```js
    // 把圖檔縮到長邊 ≤ maxEdge、轉 JPEG base64 data URL。失敗回 null。
    function _makeThumb(file, maxEdge) {
        return new Promise(function (resolve) {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = function () {
                URL.revokeObjectURL(url);
                let w = img.naturalWidth || 1, h = img.naturalHeight || 1;
                const scale = Math.min(1, maxEdge / Math.max(w, h));
                w = Math.max(1, Math.round(w * scale));
                h = Math.max(1, Math.round(h * scale));
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', 0.82));
                } catch (e) { resolve(null); }
            };
            img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
            img.src = url;
        });
    }

    // 待送附件 chip 列（重用浮窗既有的 #claude-attach-chips 容器）
    function _attachChipsEl() {
        const body = (window.ChatWindow && typeof window.ChatWindow.getBody === 'function')
            ? window.ChatWindow.getBody() : null;
        return body ? body.querySelector('#claude-attach-chips') : null;
    }

    function _renderPendingAttachments() {
        const row = _attachChipsEl();
        if (!row) return;
        row.innerHTML = '';
        _pendingAttachments.forEach(function (a, idx) {
            const chip = document.createElement('div');
            chip.className = 'cg-pending-chip' + (a._uploading ? ' cg-pending-uploading' : '');
            if (a.thumb) {
                const im = document.createElement('img');
                im.className = 'cg-pending-thumb';
                im.src = a.thumb;
                chip.appendChild(im);
            } else {
                const ic = document.createElement('span');
                ic.textContent = a._uploading ? '⏳' : '📎';
                chip.appendChild(ic);
            }
            const nm = document.createElement('span');
            nm.className = 'cg-pending-name';
            nm.textContent = a.filename || 'file';
            chip.appendChild(nm);
            const x = document.createElement('span');
            x.className = 'cg-pending-x';
            x.textContent = '×';
            x.addEventListener('click', function (e) {
                e.stopPropagation();
                _pendingAttachments.splice(idx, 1);
                _renderPendingAttachments();
            });
            chip.appendChild(x);
            row.appendChild(chip);
        });
    }
```

- [ ] **Step 3：加 `handleFilePick` + `hasPending` 對外接口**

在 `ChatGroup.isBusy = function () { return _busy; };` 那行之前加入：

```js
    // 選檔 → 上傳 cc-bridge + 圖檔做縮圖 → 進 _pendingAttachments
    ChatGroup.handleFilePick = async function (fileList) {
        if (!fileList || !fileList.length) return;
        if (!window.ClaudeTerminal || typeof window.ClaudeTerminal.uploadFiles !== 'function') {
            _renderSystemLine('⚠️ ClaudeTerminal 未載入，無法上傳。');
            return;
        }
        const baseIdx = _pendingAttachments.length;
        const files = Array.from(fileList);
        files.forEach(function (f) {
            _pendingAttachments.push({ _uploading: true, filename: f.name, mime: f.type || '', size: f.size });
        });
        _renderPendingAttachments();

        // 圖檔做縮圖（跟上傳並行）
        const thumbs = await Promise.all(files.map(function (f) {
            return (f.type && f.type.indexOf('image/') === 0) ? _makeThumb(f, 720) : Promise.resolve(null);
        }));

        try {
            const result = await window.ClaudeTerminal.uploadFiles(fileList);
            (result.files || []).forEach(function (meta, i) {
                _pendingAttachments[baseIdx + i] = {
                    path: meta.path, filename: meta.filename, mime: meta.mime, size: meta.size,
                    thumb: thumbs[i] || null,
                };
            });
        } catch (e) {
            _pendingAttachments.splice(baseIdx, files.length);
            _renderSystemLine('⚠️ 上傳失敗：' + ((e && e.message) || '未知錯誤'));
        }
        _renderPendingAttachments();
    };

    // 有沒有上傳完成、可送的附件（給 chat_window 的 submitInput 判斷純附件送出用）
    ChatGroup.hasPending = function () {
        return _pendingAttachments.some(function (a) { return a && a.path; });
    };
```

- [ ] **Step 4：`hydrate` 進群聊時清空待送附件**

在 `ChatGroup.hydrate` 函式裡，找到開頭：

```js
    ChatGroup.hydrate = function (streamEl) {
        _streamEl = streamEl;
        if (!_streamEl) return;
```

換成：

```js
    ChatGroup.hydrate = function (streamEl) {
        _streamEl = streamEl;
        _pendingAttachments = [];
        _renderPendingAttachments();
        if (!_streamEl) return;
```

- [ ] **Step 5：驗證語法**

Run: `node --check core/chat_group.js`
Expected: 無輸出。

- [ ] **Step 6：Commit**

```bash
git add core/chat_group.js
git commit -m "群聊圖文 task3：附件上傳 + 縮圖 + 待送列"
```

---

## Task 4：群聊模式接 📎 按鈕

**Files:**
- Modify: `core/chat_window.js`

- [ ] **Step 1：`fileInput.onchange` 依 provider 分流**

在 `core/chat_window.js` 的 `_bindChatInput` 裡，找到：

```js
            fileInput.onchange = async (e) => {
                const files = e.target.files;
                if (files && files.length && window.VoidClaudeRoom) {
                    await window.VoidClaudeRoom.handleFilePick(files);
                }
                fileInput.value = '';
            };
```

換成：

```js
            fileInput.onchange = async (e) => {
                const files = e.target.files;
                if (files && files.length) {
                    if (_provider === 'group' && window.ChatGroup
                        && typeof window.ChatGroup.handleFilePick === 'function') {
                        await window.ChatGroup.handleFilePick(files);
                    } else if (window.VoidClaudeRoom) {
                        await window.VoidClaudeRoom.handleFilePick(files);
                    }
                }
                fileInput.value = '';
            };
```

- [ ] **Step 2：`submitInput` 允許純附件送出（群聊）**

找到 `ChatWindow.submitInput` 函式，整段換成：

```js
    ChatWindow.submitInput = function () {
        if (!_winEl) return;
        const input = _winEl.querySelector('#cw-input');
        if (!input) return;
        const txt = input.value.trim();
        const groupHasAttach = _provider === 'group' && window.ChatGroup
            && typeof window.ChatGroup.hasPending === 'function' && window.ChatGroup.hasPending();
        if (!txt && !groupHasAttach) return;
        input.value = '';
        input.style.height = 'auto';
        if (_provider === 'group') {
            if (window.ChatGroup && typeof window.ChatGroup.sendUserMessage === 'function') {
                window.ChatGroup.sendUserMessage(txt);
            }
        } else if (window.VoidClaudeRoom && typeof window.VoidClaudeRoom.sendMessage === 'function') {
            window.VoidClaudeRoom.sendMessage(txt);
        }
    };
```

- [ ] **Step 3：驗證語法**

Run: `node --check core/chat_window.js`
Expected: 無輸出。

- [ ] **Step 4：Commit**

```bash
git add core/chat_window.js
git commit -m "群聊圖文 task4：群聊模式接 📎 按鈕 + 純附件送出"
```

---

## Task 5：送出帶附件 + 增量收集

**Files:**
- Modify: `core/chat_group.js`

- [ ] **Step 1：加 `_collectDeltaAttachments`**

在 `core/chat_group.js` 的 `_buildDelta` 函式之後加入：

```js
    // 跟 _buildDelta 同範圍：收集增量涵蓋的 rae 附件（去掉 thumb，cc-bridge 只要 path）
    function _collectDeltaAttachments(provider) {
        const out = [];
        for (let i = _seen[provider] + 1; i < _transcript.length; i++) {
            const m = _transcript[i];
            if (m.speaker === provider) continue;
            if (Array.isArray(m.attachments)) {
                m.attachments.forEach(function (a) {
                    if (a && a.path) out.push({ path: a.path, filename: a.filename, mime: a.mime, size: a.size });
                });
            }
        }
        return out;
    }
```

- [ ] **Step 2：`_runTurn` 把附件傳給 `sendGroup`**

在 `_runTurn` 裡找到開頭：

```js
        let delta = _buildDelta(provider);
        if (!delta.trim()) {
```

換成（多收一行附件）：

```js
        let delta = _buildDelta(provider);
        const deltaAttachments = _collectDeltaAttachments(provider);
        if (!delta.trim()) {
```

接著在同函式找到 `sendGroup` 呼叫：

```js
            result = await window.ClaudeTerminal.sendGroup({
                provider: provider,
                sessionId: _lsGet(_sidKey(provider)),
                userText: delta,
                onProgress: function (ev) {
```

把 `userText: delta,` 那行下面加一行 `attachments: deltaAttachments,`：

```js
            result = await window.ClaudeTerminal.sendGroup({
                provider: provider,
                sessionId: _lsGet(_sidKey(provider)),
                userText: delta,
                attachments: deltaAttachments,
                onProgress: function (ev) {
```

- [ ] **Step 3：`sendUserMessage` 整段替換（消費待送附件）**

把現有的 `ChatGroup.sendUserMessage` 函式整段換成：

```js
    // ── 你發訊息 ──
    ChatGroup.sendUserMessage = async function (text) {
        text = text || '';
        const hasAtt = _pendingAttachments.some(function (a) { return a && a.path; });
        if (!text.trim() && !hasAtt) return;
        // 一般忙碌中（非遊戲）→ 擋，不動 pending，使用者可稍後重送
        if (!_game && _busy) return;

        // 快照待送附件（只取上傳完成、有 path 的），清空 pending
        const atts = _pendingAttachments
            .filter(function (a) { return a && a.path; })
            .map(function (a) {
                return { path: a.path, filename: a.filename, mime: a.mime, size: a.size, thumb: a.thumb || null };
            });
        _pendingAttachments = [];
        _renderPendingAttachments();

        const entry = { speaker: 'rae', content: text, ts: Date.now() };
        if (atts.length) entry.attachments = atts;

        // 遊戲進行中：只進 transcript + 渲染，不另起一輪（迴圈下個回合自然帶到）
        if (_game) {
            _transcript.push(entry);
            _renderBubble('rae', text, atts);
            _save();
            return;
        }

        _busy = true;
        try {
            _transcript.push(entry);
            _renderBubble('rae', text, atts);
            _save();

            // 兩個 AI 每次都拿到發言權，各自用 [PASS] 決定回不回；骰子只決定順序。
            const order = Math.random() < 0.5 ? ['claude', 'codex'] : ['codex', 'claude'];
            const r0 = await _runTurn(order[0]);
            if (_maybeStartGame(order[0], r0)) return;
            const r1 = await _runTurn(order[1]);
            if (_maybeStartGame(order[1], r1)) return;
        } finally {
            if (!_game) _busy = false;
        }
    };
```

- [ ] **Step 4：驗證語法**

Run: `node --check core/chat_group.js`
Expected: 無輸出。

- [ ] **Step 5：Commit**

```bash
git add core/chat_group.js
git commit -m "群聊圖文 task5：送出帶附件 + 增量收集附件"
```

---

## Task 6：氣泡顯示附件 + 點擊放大

**Files:**
- Modify: `core/chat_group.js`

- [ ] **Step 1：加圖片放大 overlay**

在 `core/chat_group.js` 的 `_renderSystemLine` 函式之後加入：

```js
    // 點縮圖 → 全螢幕放大 overlay（點任意處關閉）
    function _openImageOverlay(src) {
        const ov = document.createElement('div');
        ov.className = 'cg-img-overlay';
        const im = document.createElement('img');
        im.src = src;
        ov.appendChild(im);
        ov.addEventListener('click', function () {
            if (ov.parentNode) ov.parentNode.removeChild(ov);
        });
        document.body.appendChild(ov);
    }
```

- [ ] **Step 2：`_renderBubble` 加 attachments 參數 + 渲染附件**

把現有的 `_renderBubble` 函式整段換成：

```js
    function _renderBubble(speaker, content, attachments) {
        if (!_streamEl) return null;
        const wrap = document.createElement('div');
        wrap.className = 'cg-bubble-wrap cg-from-' + speaker;
        if (speaker !== 'rae') {
            const hdr = document.createElement('div');
            hdr.className = 'cg-bubble-hdr cg-hdr-' + speaker;
            hdr.textContent = (speaker === 'codex' ? '🔷 Codex' : '🦀 Claude');
            wrap.appendChild(hdr);
        }
        const b = document.createElement('div');
        b.className = 'cg-bubble cg-from-' + speaker;
        _setBubbleContent(b, speaker, content);

        // 附件：圖片 → 內嵌縮圖（點放大）；非圖 → 📎 chip
        if (Array.isArray(attachments) && attachments.length) {
            const box = document.createElement('div');
            box.className = 'cg-bubble-attachments';
            attachments.forEach(function (a) {
                if (a && a.thumb && a.mime && a.mime.indexOf('image/') === 0) {
                    const im = document.createElement('img');
                    im.className = 'cg-attach-img';
                    im.src = a.thumb;
                    im.addEventListener('click', function () { _openImageOverlay(a.thumb); });
                    box.appendChild(im);
                } else {
                    const chip = document.createElement('span');
                    chip.className = 'cg-attach-chip';
                    chip.textContent = '📎 ' + ((a && a.filename) || 'file');
                    box.appendChild(chip);
                }
            });
            b.appendChild(box);
        }

        wrap.appendChild(b);
        _streamEl.appendChild(wrap);
        _scrollBottom();
        return b;
    }
```

- [ ] **Step 3：`hydrate` 重渲染時帶附件**

在 `ChatGroup.hydrate` 裡找到：

```js
        _transcript.forEach(function (m) {
            // 系統注入提示、純標記行（如落子）剝完是空的 —— 不渲染
            if (m.speaker === 'rae' && m.content && m.content.indexOf('（系統）') === 0) return;
            if (!_stripForDisplay(m.content)) return;
            _renderBubble(m.speaker, m.content);
        });
```

換成：

```js
        _transcript.forEach(function (m) {
            // 系統注入提示、純標記行（如落子）剝完是空的 —— 不渲染
            if (m.speaker === 'rae' && m.content && m.content.indexOf('（系統）') === 0) return;
            const hasAtt = Array.isArray(m.attachments) && m.attachments.length;
            if (!_stripForDisplay(m.content) && !hasAtt) return;
            _renderBubble(m.speaker, m.content, m.attachments);
        });
```

- [ ] **Step 4：驗證語法**

Run: `node --check core/chat_group.js`
Expected: 無輸出。

- [ ] **Step 5：Commit**

```bash
git add core/chat_group.js
git commit -m "群聊圖文 task6：氣泡顯示附件 + 點擊放大"
```

---

## Task 7：CSS + 端到端驗收

**Files:**
- Modify: `css/chat_window.css`

- [ ] **Step 1：加附件相關樣式**

在 `css/chat_window.css` 最末端（`#aurelia-chat-window .cw-canvas-err { ... }` 規則之後）加入：

```css
/* ============================================================
 * 群聊區附件（待送列 / 氣泡內附件 / 放大 overlay）
 * ============================================================ */

/* 待送附件列：渲染進共用的 #claude-attach-chips（:not(:empty) 規則已使其顯示） */
#aurelia-chat-window .cg-pending-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 6px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    font-size: 12px;
    color: #cfd2e6;
    max-width: 180px;
}
#aurelia-chat-window .cg-pending-chip.cg-pending-uploading {
    opacity: 0.6;
}
#aurelia-chat-window .cg-pending-thumb {
    width: 28px;
    height: 28px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
}
#aurelia-chat-window .cg-pending-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
#aurelia-chat-window .cg-pending-x {
    cursor: pointer;
    color: #ff9b78;
    font-weight: 700;
    flex-shrink: 0;
}

/* 氣泡內附件 */
#aurelia-chat-window .cg-bubble-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
}
#aurelia-chat-window .cg-attach-img {
    max-width: 220px;
    max-height: 220px;
    border-radius: 8px;
    cursor: zoom-in;
    display: block;
}
#aurelia-chat-window .cg-attach-chip {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    background: rgba(0, 0, 0, 0.06);
    border-radius: 8px;
    font-size: 12px;
    color: #555;
}

/* 圖片放大 overlay（掛 body、非 scoped） */
.cg-img-overlay {
    position: fixed;
    inset: 0;
    z-index: 10010;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.82);
    cursor: zoom-out;
}
.cg-img-overlay img {
    max-width: 92vw;
    max-height: 92vh;
    border-radius: 6px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
}
```

- [ ] **Step 2：Commit**

```bash
git add css/chat_window.css
git commit -m "群聊圖文 task7：群聊附件樣式"
```

- [ ] **Step 3：端到端驗收（由 Rae 在酒館實測）**

重新載入酒館擴展，開「👥 群聊區」，逐項確認：

1. **Markdown** —— 叫 AI「用清單跟粗體回我」，AI 氣泡裡 `**粗體**`、清單、程式碼框正常渲染成樣式，不是生文字；Rae 自己的氣泡維持純文字。
2. **streaming** —— AI 回覆串流時是純文字逐字出，串流結束瞬間轉成 markdown 排版（不閃爍）。
3. **發圖** —— 點 📎 選一張圖 → 輸入框上方出現縮圖 chip → 送出 → 自己的氣泡裡直接看到那張圖；點圖會全螢幕放大。
4. **AI 看得到** —— 發圖後問「我剛剛發的圖裡有什麼」，Claude 跟 Codex 都答得出來。
5. **純附件送出** —— 只選圖、不打字，也送得出去。
6. **非圖檔** —— 附一個 .txt / .pdf → 氣泡顯示成「📎 檔名」chip。
7. **重載後** —— 重新整理酒館、重開群聊，舊訊息裡的圖還在。
8. **遊戲中發圖** —— 對弈進行中發一張圖，不中斷遊戲，AI 下一回合看得到。
9. **Console** —— 全程 F12 無紅字錯誤。

發現問題 → 回報，按 investigate 流程修。

---

## 自我檢查（已對 spec 核對）

- **spec §三 Markdown（export / `_setBubbleContent` / `_renderBubble` / `_runTurn` / streaming）** → Task 1 全涵蓋。CSS 重用既有 `.claude-bubble-md`（計畫層決定），無需新 markdown CSS。✅
- **spec §4.1 待送附件狀態** → Task 3 Step 1（`_pendingAttachments`）。✅
- **spec §4.2 選檔→上傳→縮圖** → Task 3 Step 2-3（`_makeThumb` 720px / 0.82、`handleFilePick`、`uploadFiles`、placeholder）。✅
- **spec §4.3 待送附件列** → Task 3 Step 2（`_renderPendingAttachments`，重用 `#claude-attach-chips`）。✅
- **spec §4.4 送出（快照、純附件可送、transcript 帶 attachments）** → Task 5 Step 3 + Task 4 Step 2（`submitInput` 純附件）。✅
- **spec §4.5 氣泡顯示（圖內嵌 / chip / 放大 / hydrate）** → Task 6。✅
- **spec §4.6 傳給 AI（`_collectDeltaAttachments` 去 thumb、`sendGroup` body、去重、遊戲中）** → Task 5 Step 1-2 + Task 2。✅
- **spec §六 錯誤處理**：上傳失敗 → Task 3 `handleFilePick` catch；`markdownToSafeHtml` null fallback → Task 1 `_setBubbleContent`；縮圖失敗回 null → Task 3 `_makeThumb`；thumb 不進 cc-bridge → Task 5 `_collectDeltaAttachments` 不含 thumb。✅
- **型別一致性**：附件物件 `{path,filename,mime,size,thumb}` —— Task 3 產生、Task 5 快照與收集（收集時去 thumb）、Task 6 顯示，欄位一致。`ChatGroup.handleFilePick` / `hasPending` / `sendUserMessage` 簽名 —— Task 3/4/5 一致。✅

未發現缺漏。
