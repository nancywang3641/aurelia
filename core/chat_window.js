/**
 * core/chat_window.js — Claude / Codex 獨立浮窗外殼
 * 職責：浮動框、標題列拖動、開關、子面板路由、啟動選單。
 * 純浮層 —— 浮在最上層，不隱藏 / 不影響奧瑞亞大廳。
 * 聊天室 UI 由 chat_room.js（window.VoidClaudeRoom）渲染進 #cw-body。
 */
(function (ChatWindow) {
    'use strict';

    const WIN_ID = 'aurelia-chat-window';

    let _winEl = null;
    let _menuEl = null;              // Claude/Codex 啟動選單
    let _provider = 'claude';        // 'claude' | 'codex'
    let _isOpen = false;
    let _subPanel = null;            // 當前開啟的子面板名（null = 沒開）

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
        return {
            w: 480,
            h: Math.min(700, window.innerHeight - 40),
        };
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
            <div class="cw-body" id="cw-body">
                <div class="claude-portrait-area">
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
            </div>
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
        _bindChatInput(el);

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

    function _bindChatInput(el) {
        const input = el.querySelector('#cw-input');
        const sendBtn = el.querySelector('#cw-send-btn');
        const attachBtn = el.querySelector('#claude-attach-btn');
        const fileInput = el.querySelector('#claude-file-input');
        const pickerBtn = el.querySelector('#claude-picker-btn');

        if (sendBtn) sendBtn.onclick = ChatWindow.submitInput;
        if (input) {
            input.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                    e.preventDefault();
                    ChatWindow.submitInput();
                }
            };
            const autoGrow = () => {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 160) + 'px';
            };
            input.addEventListener('input', autoGrow);
            autoGrow();
        }
        if (attachBtn && fileInput) {
            attachBtn.onclick = () => fileInput.click();
            fileInput.onchange = async (e) => {
                const files = e.target.files;
                if (files && files.length && window.VoidClaudeRoom) {
                    await window.VoidClaudeRoom.handleFilePick(files);
                }
                fileInput.value = '';
            };
        }
        if (pickerBtn) {
            pickerBtn.onclick = (e) => {
                e.stopPropagation();
                const popup = el.querySelector('#claude-picker-popup');
                if (popup && popup.style.display !== 'none') {
                    if (window.VoidClaudeRoom) window.VoidClaudeRoom.closePicker();
                } else {
                    if (window.VoidClaudeRoom) window.VoidClaudeRoom.openPicker();
                }
            };
        }
    }

    // 載入當前 provider 的 conv 歷史並渲染進浮窗
    async function _loadRoom(provider) {
        if (window.ClaudeTerminal && typeof window.ClaudeTerminal.setProvider === 'function') {
            window.ClaudeTerminal.setProvider(provider);
        }
        let hist = [];
        if (window.ClaudeTerminal && typeof window.ClaudeTerminal.loadHistory === 'function') {
            try { hist = await window.ClaudeTerminal.loadHistory(); } catch (_) { hist = []; }
        }
        const room = window.VoidClaudeRoom;
        if (!room) return;
        if (typeof room.setHistory === 'function') room.setHistory(hist || []);
        if (typeof room.applyRoomUi === 'function') room.applyRoomUi();
        if (typeof room.hydrateStream === 'function') room.hydrateStream();
        if ((!hist || !hist.length) && typeof room.renderBubble === 'function') {
            room.renderBubble('assistant', provider === 'codex'
                ? '這裡是 Codex 的房間，跟外面是分開的線。說吧。'
                : '在這裡，我跟妳的對話跟外面是兩條線。妳說什麼吧。');
        }
    }

    ChatWindow.open = async function (provider) {
        provider = provider === 'codex' ? 'codex' : 'claude';
        _provider = provider;
        if (!_winEl) _winEl = _buildWindow();
        const idEl = _winEl.querySelector('#cw-identity');
        if (idEl) idEl.textContent = IDENTITY[provider];
        _winEl.classList.toggle('cw-codex', provider === 'codex');
        _winEl.style.display = 'flex';
        _isOpen = true;
        if (_menuEl) _menuEl.style.display = 'none';
        ChatWindow.closeSubPanel();
        await _loadRoom(provider);
    };

    ChatWindow.close = function () {
        if (!_isOpen) return;
        if (_winEl) _winEl.style.display = 'none';
        ChatWindow.closeSubPanel();
        _isOpen = false;
    };

    // 啟動選單：點酒館輸入列那顆鈕 → 跳小選單選 Claude / Codex
    ChatWindow.toggleLauncherMenu = function (anchorEl) {
        if (_menuEl && _menuEl.style.display !== 'none') {
            _menuEl.style.display = 'none';
            return;
        }
        if (!_menuEl) {
            _menuEl = document.createElement('div');
            _menuEl.id = 'cw-launcher-menu';
            _menuEl.innerHTML =
                '<button class="cw-lm-item" data-p="claude" type="button">🦀 Claude 的房間</button>' +
                '<button class="cw-lm-item" data-p="codex" type="button">🔷 Codex 的房間</button>';
            document.body.appendChild(_menuEl);
            _menuEl.querySelectorAll('.cw-lm-item').forEach(b => {
                b.addEventListener('click', () => {
                    _menuEl.style.display = 'none';
                    ChatWindow.open(b.dataset.p);
                });
            });
            document.addEventListener('click', (e) => {
                if (!_menuEl || _menuEl.style.display === 'none') return;
                if (_menuEl.contains(e.target)) return;
                if (e.target && e.target.closest && e.target.closest('#aurelia-chat-launcher')) return;
                _menuEl.style.display = 'none';
            });
        }
        _menuEl.style.display = 'flex';
        const r = anchorEl.getBoundingClientRect();
        const mw = _menuEl.offsetWidth || 170;
        const mh = _menuEl.offsetHeight || 84;
        let left = r.left;
        if (left + mw > window.innerWidth) left = window.innerWidth - mw - 8;
        _menuEl.style.left = Math.max(8, left) + 'px';
        _menuEl.style.top = Math.max(8, r.top - mh - 6) + 'px';
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

    ChatWindow.submitInput = function () {
        if (!_winEl) return;
        const input = _winEl.querySelector('#cw-input');
        if (!input) return;
        const txt = input.value.trim();
        if (!txt) return;
        input.value = '';
        input.style.height = 'auto';
        if (window.VoidClaudeRoom && typeof window.VoidClaudeRoom.sendMessage === 'function') {
            window.VoidClaudeRoom.sendMessage(txt);
        }
    };

    ChatWindow.isOpen      = function () { return _isOpen; };
    ChatWindow.getProvider = function () { return _provider; };
    ChatWindow.getBody     = function () { return _winEl && _winEl.querySelector('#cw-body'); };
    ChatWindow.getSubPanelBody = function () { return _winEl && _winEl.querySelector('#cw-subpanel-body'); };

    console.log('✅ ChatWindow（Claude/Codex 浮窗外殼）模組就緒');
})(window.ChatWindow = window.ChatWindow || {});
