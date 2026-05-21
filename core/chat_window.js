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
