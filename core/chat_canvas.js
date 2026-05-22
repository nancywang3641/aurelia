/**
 * core/chat_canvas.js — 群聊區通用畫布
 * AI 用 <lobbyPanel> marker 產互動 HTML，渲染進群聊浮窗上方的畫布區。
 * panel JS 透過 LP 走訂閱(cc-bridge) 跟 Claude / Codex 互動。
 * 解析 / rewire 共用 VoidCanvas。
 */
(function (ChatCanvas) {
    'use strict';

    let _canvasEl = null;   // #cw-canvas（含 bar + content）
    let _tabEl = null;      // 收合後的細 tab

    // ── host 接口 LP（訂閱版）──
    function _makeChatPanelAPI() {
        return {
            // panel 向某個 AI 問一句、回純文字
            chat: async function (text, opts) {
                opts = opts || {};
                const provider = opts.provider === 'codex' ? 'codex' : 'claude';
                if (!window.ClaudeTerminal || typeof window.ClaudeTerminal.sendRaw !== 'function') {
                    throw new Error('ClaudeTerminal 未載入');
                }
                const r = await window.ClaudeTerminal.sendRaw({
                    provider: provider,
                    messages: [{ role: 'user', content: String(text == null ? '' : text) }],
                });
                return (r.reply || '').trim();
            },

            // 回合制棋盤落子。board2d：二維陣列，每格 'AI'|'USER'|null。回 {row,col,line}
            move: async function (board2d, opts) {
                opts = opts || {};
                const provider = opts.provider === 'codex' ? 'codex' : 'claude';
                if (!window.ClaudeTerminal || typeof window.ClaudeTerminal.sendRaw !== 'function') {
                    throw new Error('ClaudeTerminal 未載入');
                }
                const size = board2d.length;
                const aiSym   = opts.aiSymbol   || '●';
                const userSym = opts.userSymbol || '○';
                const game    = opts.gameName   || '棋盤遊戲';
                const colHeader = '    ' + Array.from({ length: size }, function (_, i) {
                    return String(i).padStart(2);
                }).join('');
                const rows = board2d.map(function (row, r) {
                    return String(r).padStart(2) + ' |' + row.map(function (cell) {
                        return cell === 'AI' ? ' ' + aiSym : cell === 'USER' ? ' ' + userSym : ' .';
                    }).join('');
                });
                const boardText = [colHeader].concat(rows).join('\n');
                const prompt = '你正在玩「' + game + '」。你的棋子：' + aiSym + '　對手棋子：' + userSym + '\n\n' +
                    '當前棋盤（行 / 列從 0 開始）：\n' + boardText + '\n\n' +
                    (opts.extraContext || '') +
                    '\n請分析棋盤、選最佳落子。嚴格按以下格式回應、不可省略任何欄位：\n' +
                    'MOVE:(行),(列)\nLINE:[用一句話講，10-20 字]';
                const r = await window.ClaudeTerminal.sendRaw({
                    provider: provider,
                    messages: [{ role: 'system', content: prompt }],
                });
                const raw = (r.reply || '').trim();
                const mv = raw.match(/MOVE:\s*(\d+)\s*,\s*(\d+)/i);
                const ln = raw.match(/LINE:\s*(.+)/i);
                if (!mv) return { row: -1, col: -1, line: raw.slice(0, 40) };
                return {
                    row: parseInt(mv[1], 10),
                    col: parseInt(mv[2], 10),
                    line: ln ? ln[1].trim() : '',
                };
            },

            // 生圖，回圖片 URL
            image: async function (prompt, type) {
                if (window.__IS_PREVIEW || !window.OS_IMAGE_MANAGER) {
                    return 'https://via.placeholder.com/400x300/1e1e2a/cfd2e6?text=Preview';
                }
                return await window.OS_IMAGE_MANAGER.generate(prompt, type || 'item');
            },

            close: function () { ChatCanvas.close(); },
        };
    }

    function _hasContent() {
        const c = _canvasEl && _canvasEl.querySelector('.cw-canvas-content');
        return !!(c && c.children.length);
    }

    // ── 掛載畫布區（由 chat_window 在群聊模式給 #cw-canvas / #cw-canvas-tab 元素）──
    ChatCanvas.mount = function (canvasEl, tabEl) {
        _canvasEl = canvasEl;
        _tabEl = tabEl;
        if (_canvasEl) {
            const collapseBtn = _canvasEl.querySelector('.cw-canvas-collapse');
            const closeBtn = _canvasEl.querySelector('.cw-canvas-close');
            if (collapseBtn) collapseBtn.addEventListener('click', function () { ChatCanvas.collapse(); });
            if (closeBtn) closeBtn.addEventListener('click', function () { ChatCanvas.close(); });
        }
        if (_tabEl) _tabEl.addEventListener('click', function () { ChatCanvas.expand(); });
    };

    ChatCanvas.expand = function () {
        if (_canvasEl) _canvasEl.style.display = 'flex';
        if (_tabEl) _tabEl.style.display = 'none';
    };

    // 收合：藏畫布、留 tab（內容保留，可重新展開）
    ChatCanvas.collapse = function () {
        if (_canvasEl) _canvasEl.style.display = 'none';
        if (_tabEl) _tabEl.style.display = _hasContent() ? 'flex' : 'none';
    };

    // 關閉：清掉內容、收 tab
    ChatCanvas.close = function () {
        if (_canvasEl) {
            _canvasEl.style.display = 'none';
            const c = _canvasEl.querySelector('.cw-canvas-content');
            if (c) c.innerHTML = '';
        }
        if (_tabEl) _tabEl.style.display = 'none';
        window.__CW_LP = null;
    };

    // ── 渲染一個 panel（panelData: {title, html, css, js}）──
    ChatCanvas.render = function (panelData) {
        if (!_canvasEl || !panelData) return;
        const content = _canvasEl.querySelector('.cw-canvas-content');
        const titleEl = _canvasEl.querySelector('.cw-canvas-title');
        if (!content) return;

        let styleEl = document.getElementById('cw-canvas-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'cw-canvas-style';
            document.head.appendChild(styleEl);
        }
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
                content.innerHTML += '<div class="cw-canvas-err">⚠️ 畫布 JS 錯誤：' + ((e && e.message) || e) + '</div>';
            }
        }
        // 重綁 onclick（共用 VoidCanvas 的 rewire，讓 onclick 在有 LP 的作用域跑）
        if (window.VoidCanvas && typeof window.VoidCanvas.rewireOnclicks === 'function') {
            window.VoidCanvas.rewireOnclicks(content, LP);
        }
    };

    console.log('✅ ChatCanvas（群聊區通用畫布）模組就緒');
})(window.ChatCanvas = window.ChatCanvas || {});
