/**
 * core/void/canvas.js — 大廳畫布面板引擎（LobbyPanelAPI + 渲染/解析/模板）
 * 從 void_terminal.js 抽出。橋：VoidTerminal._bridge.is404()。userName 走 VoidTerminal.getUserName()。
 */
(function (VoidCanvas) {
    'use strict';

    function _bridge() { return window.VoidTerminal && window.VoidTerminal._bridge; }

    // LobbyPanelAPI (LP)：注入進每個面板 JS 的 context 物件
    function _makeLobbyPanelAPI() {
        return {
            charName: (_bridge() && _bridge().is404()) ? '柴郡' : '瀅瀅',
            userName: (window.VoidTerminal && window.VoidTerminal.getUserName()) || '委託人',

            // 帶角色人設向 API 送訊息，回傳純文字回覆
            chat: async function(userText) {
                if (!window.OS_API) throw new Error('API 未連線');
                const charName = this.charName;
                const userName = this.userName;

                const persona = (_bridge() && _bridge().is404())
                    ? `你是「柴郡 (Cheshire)」，404號房的管理員，嘴賤、怕麻煩、具數位領地意識。\n現在你正在協助用戶進行一個互動小遊戲，用角色風格簡短回應即可。`
                    : `你是「瀅瀅 (Yingying)」，視差書咖的天然呆店長兼小說家。\n現在你正在協助用戶進行一個互動小遊戲，用角色風格簡短回應即可。`;

                const messages = [
                    { role: 'system', content: persona },
                    { role: 'user',   content: userText }
                ];

                let config = {};
                if (window.OS_SETTINGS) {
                    const sec = window.OS_SETTINGS.getSecondaryConfig?.();
                    config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : window.OS_SETTINGS.getConfig();
                }

                return new Promise((resolve, reject) => {
                    window.OS_API.chat(messages, config, null,
                        (reply) => resolve(reply.replace(/^"|"$/g, '').trim()),
                        reject
                    );
                });
            },

            // 專為棋盤/回合制遊戲設計的 move 方法
            // board2d: 二維陣列，每格值為 'AI'|'USER'|null
            // opts: { aiSymbol, userSymbol, gameName, extraContext }
            // 回傳: { row, col, line } — row/col 是落子座標，line 是角色台詞
            move: async function(board2d, opts = {}) {
                if (!window.OS_API) throw new Error('API 未連線');
                const size = board2d.length;
                const aiSym   = opts.aiSymbol   || '●';
                const userSym = opts.userSymbol  || '○';
                const game    = opts.gameName    || '棋盤遊戲';

                // 把棋盤 render 成帶座標的 ASCII 矩陣
                const colHeader = '    ' + Array.from({length: size}, (_, i) => String(i).padStart(2)).join('');
                const rows = board2d.map((row, r) =>
                    String(r).padStart(2) + ' |' + row.map(cell =>
                        cell === 'AI' ? ` ${aiSym}` : cell === 'USER' ? ` ${userSym}` : ' .'
                    ).join('')
                );
                const boardText = [colHeader, ...rows].join('\n');

                const persona = (_bridge() && _bridge().is404())
                    ? `你是「柴郡 (Cheshire)」，嘴賤、具數位領地意識的 404 號房管理員。`
                    : `你是「瀅瀅 (Yingying)」，視差書咖天然呆店長兼小說家。`;

                const prompt = `${persona}
你正在與用戶（${this.userName}）對戰「${game}」。
你的棋子：${aiSym}　用戶棋子：${userSym}

當前棋盤（行/列從 0 開始）：
${boardText}

${opts.extraContext || ''}
請分析棋盤，選出最佳落子位置（優先封堵對手連線，其次延伸自己連線）。
必須嚴格按以下格式回應，不可省略任何欄位：
MOVE:(行),(列)
LINE:[用角色風格說一句話，10-20字]`;

                const messages = [
                    { role: 'system', content: prompt }
                ];

                let config = {};
                if (window.OS_SETTINGS) {
                    const sec = window.OS_SETTINGS.getSecondaryConfig?.();
                    config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : window.OS_SETTINGS.getConfig();
                }

                const raw = await new Promise((resolve, reject) => {
                    window.OS_API.chat(messages, config, null,
                        (reply) => resolve(reply.replace(/^"|"$/g, '').trim()),
                        reject
                    );
                });

                // 解析 MOVE:(r),(c) 和 LINE:...
                const moveMatch = raw.match(/MOVE:\s*(\d+)\s*,\s*(\d+)/i);
                const lineMatch = raw.match(/LINE:\s*(.+)/i);
                if (!moveMatch) {
                    console.warn('[LP.move] 無法解析座標，raw:', raw);
                    return { row: -1, col: -1, line: raw.slice(0, 40) };
                }
                return {
                    row:  parseInt(moveMatch[1]),
                    col:  parseInt(moveMatch[2]),
                    line: lineMatch ? lineMatch[1].trim() : ''
                };
            },

            // 生圖：回傳圖片 URL（預覽環境返回佔位圖）
            // type: 'item' | 'scene' | 'char' | 'pet'
            image: async function(prompt, type = 'item') {
                if (window.__IS_PREVIEW || !window.OS_IMAGE_MANAGER) {
                    return `https://via.placeholder.com/400x300/1a0a02/FBDFA2?text=Preview`;
                }
                return await window.OS_IMAGE_MANAGER.generate(prompt, type);
            },

            // 關閉畫布
            close: function() { _closeLobbyCanvas(); }
        };
    }

    function _closeLobbyCanvas() {
        const overlay = document.getElementById('lobby-canvas-overlay');
        const area    = document.getElementById('lobby-canvas-area');
        if (!area) return;
        area.style.animation = 'lcaSlideOut 0.25s ease forwards';
        setTimeout(() => {
            if (overlay) overlay.style.display = 'none';
            area.style.animation = '';
            const content = document.getElementById('lca-content');
            if (content) content.innerHTML = '';
            window.__LP = null;
        }, 260);
    }
    // 暴露給 os_studio / lobbyPanel JS 裡的 onclick 使用
    window._closeLobbyCanvas = _closeLobbyCanvas;

    // 把 content 內所有 onclick 屬性重新綁定到含 LP 的作用域，解決閉包隔離問題
    function _rewireOnclicks(container, LP) {
        container.querySelectorAll('[onclick]').forEach(el => {
            const code = el.getAttribute('onclick');
            el.removeAttribute('onclick');
            el.addEventListener('click', (e) => {
                try { new Function('container', 'LP', 'event', code)(container, LP, e); }
                catch(err) { console.warn('[LobbyPanel] onclick 執行失敗:', err); }
            });
        });
    }

    function _renderLobbyPanel(panelData) {
        const overlay = document.getElementById('lobby-canvas-overlay');
        const area    = document.getElementById('lobby-canvas-area');
        const content = document.getElementById('lca-content');
        const titleEl = document.getElementById('lca-title');
        if (!overlay || !area || !content) return;

        // 注入 CSS
        const styleId = 'lobby-panel-style';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = styleId; document.head.appendChild(styleEl); }
        styleEl.textContent = panelData.css || '';

        // 渲染 HTML
        content.innerHTML = panelData.html || '';
        if (titleEl) titleEl.textContent = panelData.title || '🎮 互動面板';

        // 顯示覆蓋層
        overlay.style.display = 'flex';
        area.style.animation = 'lcaSlideIn 0.3s ease';

        // 執行 JS（傳入 container 與 LP；同時暴露 window.__LP 供 onclick 使用）
        const LP = _makeLobbyPanelAPI();
        window.__LP = LP;
        if (panelData.js) {
            try {
                const fn = new Function('container', 'LP', panelData.js);
                fn(content, LP);
            } catch(e) {
                console.error('[LobbyPanel] JS 執行錯誤:', e);
                content.innerHTML += `<div style="color:#fc8181;font-size:11px;padding:8px;">⚠️ 面板 JS 錯誤: ${e.message}</div>`;
            }
        }
        // 重綁所有 onclick，讓閉包函數在有 LP 的作用域內執行
        _rewireOnclicks(content, LP);
    }

    // 從 AI 回覆中解析 <lobbyPanel>...</lobbyPanel>
    function _parseLobbyPanel(replyText) {
        const match = replyText.match(/<lobbyPanel>([\s\S]*?)<\/lobbyPanel>/i);
        if (!match) return null;
        let raw = match[1].trim();
        // 第一次嘗試直接 parse
        try { return JSON.parse(raw); } catch(e1) {}
        // 修復 AI 常見問題：字串值內的真實換行 → \n
        try {
            const fixed = raw
                .replace(/("(?:[^"\\]|\\.)*")/gs, m =>
                    m.replace(/\n/g, '\\n').replace(/\r/g, ''))
                .replace(/,\s*([\]}])/g, '$1'); // 移除尾逗號
            return JSON.parse(fixed);
        } catch(e2) {}
        // 最後嘗試：用正則拆出 title / html / css / js 四個欄位
        try {
            const get = (key) => {
                const r = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 's');
                const m = raw.match(r);
                return m ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '';
            };
            const title = get('title'); const html = get('html');
            const css = get('css');     const js   = get('js');
            if (html) return { title, html, css, js };
        } catch(e3) {}
        console.warn('[LobbyPanel] JSON 無法修復，已跳過');
        return null;
    }

    // 「大廳顯示」＝組件在固定 id 的大廳組裡（取代舊每組件 lobbyEnabled 開關；舊旗標仍相容）
    const LOBBY_GROUP_ID = 'g_lobby';
    function _isLobbyTpl(t) { return !!(t && ((Array.isArray(t.groupIds) && t.groupIds.includes(LOBBY_GROUP_ID)) || t.lobbyEnabled)); }

    // 從 DB 取得大廳組模板，組裝上下文說明字串（注入 sysPrompt 用）
    async function _buildLobbyTemplateCtx() {
        try {
            const db = window.OS_DB;
            if (!db || typeof db.getAllVNTagTemplates !== 'function') return '';
            const templates = await db.getAllVNTagTemplates();
            const lobby = templates.filter(t => _isLobbyTpl(t) && t.isActive);
            if (!lobby.length) return '';
            const lines = lobby.map(t =>
                `- [${t.tagId}]：${t.usageDesc || '無說明'}${t.demoFormat ? `\n  調用示例：${t.demoFormat}` : ''}`
            );
            return `【已安裝大廳模板（快捷調用）】\n如果以下模板符合需求，直接在回覆末尾用 <lobbyTemplate>tagId</lobbyTemplate> 調用，無需再寫 <lobbyPanel> JSON：\n${lines.join('\n')}`;
        } catch(e) {
            return '';
        }
    }

    // 從 DB 載入指定 tagId 的大廳模板並渲染到畫布
    async function _renderLobbyTemplate(tagId) {
        try {
            const db = window.OS_DB;
            if (!db || typeof db.getAllVNTagTemplates !== 'function') return;
            const templates = await db.getAllVNTagTemplates();
            const tpl = templates.find(t => t.tagId === tagId && _isLobbyTpl(t));
            if (!tpl) {
                console.warn('[LobbyTemplate] 找不到模板或大廳未啟用:', tagId);
                return;
            }
            _renderLobbyPanel({
                title: tpl.usageDesc || `🎮 ${tpl.tagId}`,
                html:  tpl.html || '',
                css:   tpl.css  || '',
                js:    tpl.js   || ''
            });
        } catch(e) {
            console.error('[LobbyTemplate] 載入失敗:', e);
        }
    }

    // 偵測回覆裡任意已安裝的 VN 區塊標籤 <tagId>lines</tagId>，用模板 JS 渲染
    async function _detectAndRenderVNBlock(replyText) {
        try {
            const db = window.OS_DB;
            if (!db || typeof db.getAllVNTagTemplates !== 'function') return null;
            const templates = await db.getAllVNTagTemplates();
            const active = templates.filter(t => (t.isActive || _isLobbyTpl(t)) && t.isBlock && t.tagId);
            for (const tpl of active) {
                const safeId = tpl.tagId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(`<${safeId}>([\\s\\S]*?)<\\/${safeId}>`, 'i');
                const m = replyText.match(re);
                if (!m) continue;
                const lines = m[1].split('\n').map(l => l.trim()).filter(Boolean);
                // 用 VN 模板 JS 渲染到大廳畫布（container/lines/onComplete 簽名）
                const area    = document.getElementById('lobby-canvas-area');
                const content = document.getElementById('lca-content');
                const titleEl = document.getElementById('lca-title');
                if (!area || !content) return m[0]; // 有匹配，但 DOM 未就緒
                const styleId = 'lobby-panel-style';
                let styleEl = document.getElementById(styleId);
                if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = styleId; document.head.appendChild(styleEl); }
                styleEl.textContent = tpl.css || '';
                content.innerHTML = tpl.html || '';
                if (titleEl) titleEl.textContent = tpl.usageDesc || `🎮 ${tpl.tagId}`;
                area.style.display = 'flex';
                area.style.animation = 'lcaSlideIn 0.3s ease';
                const LP2 = _makeLobbyPanelAPI();
                window.__LP = LP2;
                if (tpl.js) {
                    try {
                        const fn = new Function('container', 'lines', 'onComplete', 'LP', tpl.js);
                        fn(content, lines, _closeLobbyCanvas, LP2);
                    } catch(e) {
                        console.error('[VNBlock] JS 執行錯誤:', e);
                        content.innerHTML += `<div style="color:#fc8181;font-size:11px;padding:8px;">⚠️ ${e.message}</div>`;
                    }
                }
                _rewireOnclicks(content, LP2);
                return m[0]; // 回傳匹配到的原始字串，供外層剝除
            }
        } catch(e) { console.warn('[VNBlock] 偵測失敗:', e); }
        return null;
    }

    VoidCanvas.closeCanvas            = _closeLobbyCanvas;
    VoidCanvas.renderPanel            = _renderLobbyPanel;
    VoidCanvas.parseLobbyPanel        = _parseLobbyPanel;
    VoidCanvas.buildTemplateCtx       = _buildLobbyTemplateCtx;
    VoidCanvas.renderTemplate         = _renderLobbyTemplate;
    VoidCanvas.detectAndRenderVNBlock = _detectAndRenderVNBlock;
    VoidCanvas.makeLobbyPanelAPI      = _makeLobbyPanelAPI;
    VoidCanvas.rewireOnclicks         = _rewireOnclicks;

    console.log('✅ VoidCanvas（大廳畫布面板引擎）模組就緒');
})(window.VoidCanvas = window.VoidCanvas || {});
