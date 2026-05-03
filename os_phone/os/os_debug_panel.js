// ================================================================
// [檔案] os_debug_panel.js — 奧瑞亞 API 觀測樞紐 (Aurelia API Inspector)
// 完全獨立，不影響任何原始邏輯。具備智慧提示詞折疊與玻璃擬態 UI。
// 移除方式：從 index.js PHONE_FILES 刪除這一行即可。
// ================================================================
(function () {
    'use strict';
    if (window._OS_DEBUG_PANEL_LOADED) return;
    window._OS_DEBUG_PANEL_LOADED = true;

    const MAX_LOGS  = 20;
    const STORE_KEY = '_os_debug_logs';
    let logs        = [];
    let visible     = false;

    // 注入到 parent window（讓 panel 浮在整個 ST 介面上）
    const pWin = window.parent || window;
    const pDoc = pWin.document;

    // ================================================================
    // CSS - 奧瑞亞統一玻璃擬態 (Aurelia Void Style) & 移動端適配
    // ================================================================
    const styleEl = pDoc.createElement('style');
    styleEl.id = 'os-debug-panel-css';
    styleEl.textContent = `
        #os-dbg-toggle {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            padding: 4px 6px;
            line-height: 1;
            opacity: 0.6;
            transition: opacity .2s, filter .2s;
            color: inherit;
            position: static;
        }
        #os-dbg-toggle:hover { opacity: 1; }
        #os-dbg-toggle.active { opacity: 1; filter: drop-shadow(0 0 6px #63b3ed); }

        /* 奧瑞亞主面板 */
        #os-dbg-panel {
            position: fixed;
            bottom: 80px;
            right: 16px;
            width: 560px;
            max-width: calc(100vw - 32px);
            height: 70vh;
            max-height: 700px;
            background: rgba(15, 15, 25, 0.85);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 12px;
            display: none;
            flex-direction: column;
            z-index: 99998;
            font-family: 'Noto Sans TC', monospace, sans-serif;
            font-size: 12px;
            color: #e2e8f0;
            box-shadow: 0 16px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
            overflow: hidden;
            animation: dbgSlideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        #os-dbg-panel.open { display: flex; }

        @keyframes dbgSlideUp {
            from { opacity: 0; transform: translateY(20px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* 頂部控制列 */
        #os-dbg-header {
            display: flex;
            align-items: center;
            padding: 10px 14px;
            background: rgba(0, 0, 0, 0.3);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            flex-shrink: 0;
            gap: 10px;
            cursor: move;
            user-select: none;
        }
        #os-dbg-title { flex: 1; color: #63b3ed; font-weight: bold; font-size: 13px; letter-spacing: 0.5px; }
        #os-dbg-count { font-size: 10px; color: #718096; font-family: monospace; }
        .os-dbg-hbtn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #a0aec0;
            border-radius: 6px;
            padding: 3px 10px;
            cursor: pointer;
            font-size: 11px;
            transition: all 0.2s;
        }
        .os-dbg-hbtn:hover { background: rgba(255, 255, 255, 0.15); color: #fff; }
        .os-dbg-hbtn.danger:hover { background: rgba(231, 76, 60, 0.2); color: #fc8181; border-color: rgba(231, 76, 60, 0.4); }

        /* 主體區塊 */
        #os-dbg-body {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
            scrollbar-width: thin;
            scrollbar-color: rgba(255,255,255,0.2) transparent;
        }
        #os-dbg-body::-webkit-scrollbar { width: 4px; }
        #os-dbg-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }

        /* 請求紀錄單元 */
        .os-dbg-entry {
            background: rgba(0, 0, 0, 0.25);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            margin-bottom: 8px;
            overflow: hidden;
            transition: border-color 0.2s;
        }
        .os-dbg-entry.open { border-color: rgba(99, 179, 237, 0.3); }
        .os-dbg-entry-head {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 9px 12px;
            cursor: pointer;
            transition: background 0.15s;
        }
        .os-dbg-entry-head:hover { background: rgba(255, 255, 255, 0.05); }
        .os-dbg-seq   { color: #4a5568; width: 32px; flex-shrink: 0; font-family: monospace; font-weight: bold; }
        .os-dbg-time  { color: #a0aec0; flex-shrink: 0; font-size: 11px; }
        .os-dbg-badge {
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 12px;
            flex-shrink: 0;
            font-weight: bold;
            letter-spacing: 0.5px;
        }
        .os-dbg-badge.ok   { background: rgba(7, 193, 96, 0.15); color: #4ade80; border: 1px solid rgba(7, 193, 96, 0.3); }
        .os-dbg-badge.err  { background: rgba(231, 76, 60, 0.15); color: #fc8181; border: 1px solid rgba(231, 76, 60, 0.3); }
        .os-dbg-badge.pend { background: rgba(212, 175, 55, 0.15); color: #fbd38d; border: 1px solid rgba(212, 175, 55, 0.3); }
        .os-dbg-model { color: #9fa8da; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
        .os-dbg-meta  { color: #718096; font-size: 10px; flex-shrink: 0; font-family: monospace; }
        .os-dbg-arrow { color: #718096; flex-shrink: 0; transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1); font-size: 10px; }
        .os-dbg-entry.open .os-dbg-arrow { transform: rotate(90deg); color: #63b3ed; }

        .os-dbg-detail {
            display: none;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            background: rgba(0, 0, 0, 0.15);
        }
        .os-dbg-entry.open .os-dbg-detail { display: block; }

        .os-dbg-section { padding: 10px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.03); }
        .os-dbg-section:last-child { border-bottom: none; }
        .os-dbg-sec-label {
            font-size: 11px;
            color: #a0aec0;
            letter-spacing: .08em;
            text-transform: uppercase;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: bold;
        }
        .os-dbg-copy {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #cbd5e0;
            border-radius: 4px;
            padding: 2px 8px;
            cursor: pointer;
            font-size: 10px;
            transition: 0.2s;
        }
        .os-dbg-copy:hover { background: rgba(255, 255, 255, 0.15); color: #fff; }
        
        /* 程式碼區塊 */
        .os-dbg-pre {
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            padding: 10px;
            overflow-x: auto;
            overflow-y: auto;
            max-height: 240px;
            white-space: pre-wrap;
            word-break: break-word;
            color: #e2e8f0;
            font-size: 11px;
            line-height: 1.6;
            font-family: monospace;
        }
        .os-dbg-pre::-webkit-scrollbar { width: 4px; height: 4px; }
        .os-dbg-pre::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }

        /* 聊天訊息列表 */
        .os-dbg-msg-list { padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
        .os-dbg-msg {
            border-left: 3px solid;
            padding: 8px 10px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 0 6px 6px 0;
            border-top: 1px solid rgba(255,255,255,0.02);
            border-right: 1px solid rgba(255,255,255,0.02);
            border-bottom: 1px solid rgba(255,255,255,0.02);
        }
        /* 奧瑞亞角色色彩識別 */
        .os-dbg-msg[data-role="system"]    { border-left-color: #b09aff; background: rgba(176, 154, 255, 0.05); }
        .os-dbg-msg[data-role="user"]      { border-left-color: #4ade80; background: rgba(74, 222, 128, 0.05); }
        .os-dbg-msg[data-role="assistant"] { border-left-color: #63b3ed; background: rgba(99, 179, 237, 0.05); }
        
        .os-dbg-msg-role {
            font-size: 10px;
            color: #a0aec0;
            text-transform: uppercase;
            letter-spacing: .08em;
            margin-bottom: 6px;
            font-weight: bold;
        }
        .os-dbg-msg-content {
            color: #cbd5e0;
            font-size: 12px;
            line-height: 1.6;
        }

        /* 💡 智慧提示詞折疊區塊 (Aurelia Prompts) */
        .os-dbg-prompt-block {
            margin-top: 6px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            overflow: hidden;
            transition: border-color 0.2s;
        }
        .os-dbg-prompt-block.open {
            border-color: rgba(176, 154, 255, 0.4);
        }
        .os-dbg-prompt-title {
            padding: 7px 10px;
            font-size: 11px;
            color: #cbd5e0;
            cursor: pointer;
            background: rgba(0, 0, 0, 0.3);
            user-select: none;
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: bold;
            transition: background 0.15s, color 0.15s;
        }
        .os-dbg-prompt-title:hover { background: rgba(0, 0, 0, 0.5); color: #fff; }
        .os-dbg-prompt-icon { transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); font-size: 10px; color: #718096; }
        .os-dbg-prompt-block.open .os-dbg-prompt-icon { transform: rotate(90deg); color: #b09aff; }
        .os-dbg-prompt-content {
            display: none;
            padding: 10px;
            font-size: 11px;
            color: #a0aec0;
            white-space: pre-wrap;
            word-break: break-word;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            background: rgba(0, 0, 0, 0.1);
            max-height: 300px;
            overflow-y: auto;
            scrollbar-width: thin;
        }
        .os-dbg-prompt-block.open .os-dbg-prompt-content { display: block; }


        .os-dbg-empty {
            text-align: center;
            color: #4a5568;
            padding: 50px 20px;
            font-size: 13px;
            letter-spacing: 0.5px;
        }

        /* 底部狀態列 */
        #os-dbg-status-bar {
            display: flex;
            align-items: center;
            padding: 6px 14px;
            background: rgba(0, 0, 0, 0.4);
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            font-size: 10px;
            color: #a0aec0;
            flex-shrink: 0;
            gap: 8px;
        }
        #os-dbg-live-dot {
            width: 8px; height: 8px;
            border-radius: 50%;
            background: #4ade80;
            box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
            animation: os-dbg-pulse 2s infinite;
            flex-shrink: 0;
        }
        @keyframes os-dbg-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%      { opacity: .4; transform: scale(0.8); }
        }

        /* 移動端適配 (Mobile Responsive) */
        @media (max-width: 600px) {
            #os-dbg-panel {
                width: 100vw;
                max-width: 100vw;
                height: 85vh;
                max-height: none;
                bottom: 0;
                right: 0;
                border-radius: 20px 20px 0 0;
                border-bottom: none;
                border-right: none;
                border-left: none;
            }
            .os-dbg-pre, .os-dbg-prompt-content { font-size: 10px; }
            #os-dbg-header { padding: 12px 16px; }
        }
    `;
    pDoc.head.appendChild(styleEl);

    // ================================================================
    // Panel HTML
    // ================================================================
    const panelEl = pDoc.createElement('div');
    panelEl.id = 'os-dbg-panel';
    panelEl.innerHTML = `
        <div id="os-dbg-header">
            <span id="os-dbg-title">🔍 奧瑞亞 API 觀測樞紐</span>
            <span id="os-dbg-count"></span>
            <button class="os-dbg-hbtn danger" id="os-dbg-clear">🗑️ 清除</button>
            <button class="os-dbg-hbtn" id="os-dbg-close">✕</button>
        </div>
        <div id="os-dbg-body"></div>
        <div id="os-dbg-status-bar">
            <span id="os-dbg-live-dot"></span>
            <span id="os-dbg-status-text">系統監聽中…</span>
            <span style="flex:1"></span>
            <span id="os-dbg-last-url" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;font-family:monospace;"></span>
        </div>
    `;
    pDoc.body.appendChild(panelEl);

    // Toggle button — 優先插在 #lobby-bgm-toggle 旁邊，找不到才 fixed fallback
    const toggleBtn = pDoc.createElement('button');
    toggleBtn.id = 'os-dbg-toggle';
    toggleBtn.textContent = '🔍';
    toggleBtn.title = 'Aurelia API Inspector';

    function _placeToggleBtn() {
        const anchor = pDoc.getElementById('lobby-bgm-toggle');
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(toggleBtn, anchor);
            toggleBtn.style.position = 'static';
            toggleBtn.style.bottom = '';
            toggleBtn.style.right = '';
            return true;
        }
        return false;
    }

    if (!_placeToggleBtn()) {
        pDoc.body.appendChild(toggleBtn);
        const _obs = new MutationObserver(() => {
            if (_placeToggleBtn()) _obs.disconnect();
        });
        _obs.observe(pDoc.body, { childList: true, subtree: true });
    }

    // ── Events ──
    toggleBtn.addEventListener('click', togglePanel);
    panelEl.querySelector('#os-dbg-close').addEventListener('click', () => closePanel());
    panelEl.querySelector('#os-dbg-clear').addEventListener('click', () => { logs.length = 0; renderLogs(); });

    // Draggable header (Desktop only)
    const header = panelEl.querySelector('#os-dbg-header');
    let dragState = null;
    header.addEventListener('mousedown', e => {
        if (window.innerWidth <= 600 || e.target.tagName === 'BUTTON') return;
        dragState = { startX: e.clientX - panelEl.offsetLeft, startY: e.clientY - panelEl.offsetTop };
    });
    pDoc.addEventListener('mousemove', e => {
        if (!dragState) return;
        panelEl.style.right = 'auto';
        panelEl.style.bottom = 'auto';
        panelEl.style.left = Math.max(0, e.clientX - dragState.startX) + 'px';
        panelEl.style.top  = Math.max(0, e.clientY - dragState.startY) + 'px';
    });
    pDoc.addEventListener('mouseup', () => { dragState = null; });

    // ================================================================
    // Render & Parser Logic
    // ================================================================

    // 💡 核心功能：讀取 os_prompts 並格式化折疊系統提示詞
    function formatMessageContent(content, role) {
        if (typeof content !== 'string') return escHtml(JSON.stringify(content, null, 2));
        
        // 若非 System，則視長度決定是否包裹 (一般對話不折疊)
        if (role !== 'system') {
            if (content.length > 500) {
                return `<div class="os-dbg-prompt-block">
                    <div class="os-dbg-prompt-title" onclick="this.parentElement.classList.toggle('open')">
                        <span class="os-dbg-prompt-icon">▶</span> 📜 [點擊展開] 完整長內容 (${content.length} 字)
                    </div>
                    <div class="os-dbg-prompt-content">${escHtml(content)}</div>
                </div>`;
            }
            return `<div style="white-space:pre-wrap; word-break:break-word;">${escHtml(content)}</div>`;
        }

        // 針對 System Role 進行解析與切塊
        let knownPrompts = [];
        const winNode = window.parent || window;
        if (winNode.OS_PROMPTS) {
            // 抓取自訂條目
            winNode.OS_PROMPTS.getEntries().forEach(e => {
                if (e.content && e.content.trim()) {
                    knownPrompts.push({ name: '📝 條目: ' + e.name, content: e.content.trim() });
                }
            });
            // 抓取全域 CoT
            const uCot = winNode.OS_PROMPTS.get('universal_cot');
            if (uCot && uCot.trim()) knownPrompts.push({ name: '🔷 全域 CoT 思考鏈', content: uCot.trim() });
            // 抓取人設
            const iris = winNode.OS_PROMPTS.get('iris_system');
            if (iris && iris.trim()) knownPrompts.push({ name: '🌸 愛麗絲 (Iris) 人設', content: iris.trim() });
            const chess = winNode.OS_PROMPTS.get('cheshire_system');
            if (chess && chess.trim()) knownPrompts.push({ name: '😸 柴郡貓 (Cheshire) 人設', content: chess.trim() });
        }

        // 找出所有匹配的段落
        let matches = [];
        let remaining = content;
        knownPrompts.forEach(p => {
            let idx = remaining.indexOf(p.content);
            if (idx !== -1) {
                matches.push({ name: p.name, content: p.content, index: idx, length: p.content.length });
            }
        });

        // 照出現順序排序
        matches.sort((a, b) => a.index - b.index);

        // 如果完全沒有匹配到任何已知模塊，直接整包折疊
        if (matches.length === 0) {
            return `<div class="os-dbg-prompt-block">
                <div class="os-dbg-prompt-title" onclick="this.parentElement.classList.toggle('open')">
                    <span class="os-dbg-prompt-icon">▶</span> ⚙️ 系統提示詞 (System Prompt)
                </div>
                <div class="os-dbg-prompt-content">${escHtml(content)}</div>
            </div>`;
        }

        // 組合 HTML (將匹配到的與未匹配到的空隙分別包裝)
        let html = '';
        let lastIdx = 0;
        matches.forEach(m => {
            if (m.index >= lastIdx) {
                let before = remaining.substring(lastIdx, m.index).trim();
                if (before) {
                    html += `<div class="os-dbg-prompt-block">
                        <div class="os-dbg-prompt-title" onclick="this.parentElement.classList.toggle('open')">
                            <span class="os-dbg-prompt-icon">▶</span> ⚙️ [面板預設/硬編碼格式]
                        </div>
                        <div class="os-dbg-prompt-content">${escHtml(before)}</div>
                    </div>`;
                }
                
                // 找到的主標題區塊
                html += `<div class="os-dbg-prompt-block">
                    <div class="os-dbg-prompt-title" onclick="this.parentElement.classList.toggle('open')">
                        <span class="os-dbg-prompt-icon">▶</span> ${escHtml(m.name)}
                    </div>
                    <div class="os-dbg-prompt-content">${escHtml(m.content)}</div>
                </div>`;
                
                lastIdx = m.index + m.length;
            }
        });
        
        let after = remaining.substring(lastIdx).trim();
        if (after) {
            html += `<div class="os-dbg-prompt-block">
                <div class="os-dbg-prompt-title" onclick="this.parentElement.classList.toggle('open')">
                    <span class="os-dbg-prompt-icon">▶</span> ⚙️ [未命名尾端/硬編碼格式]
                </div>
                <div class="os-dbg-prompt-content">${escHtml(after)}</div>
            </div>`;
        }

        return html;
    }


    function renderLogs() {
        const body = panelEl.querySelector('#os-dbg-body');
        const count = panelEl.querySelector('#os-dbg-count');
        count.textContent = logs.length ? `(${logs.length}/${MAX_LOGS})` : '';

        if (!logs.length) {
            body.innerHTML = '<div class="os-dbg-empty">🌌 觀測樞紐目前為空<br><span style="font-size:10px; opacity:0.6; margin-top:8px; display:inline-block;">等待系統發出 API 請求...</span></div>';
            return;
        }

        // Keep expanded states
        const openIds = new Set([...body.querySelectorAll('.os-dbg-entry.open')].map(el => el.dataset.id));
        body.innerHTML = '';

        logs.forEach((log, idx) => {
            const entry = pDoc.createElement('div');
            entry.className = 'os-dbg-entry' + (openIds.has(String(log.id)) ? ' open' : '');
            entry.dataset.id = log.id;

            const badgeClass = log.status === 'pending' ? 'pend' : (log.status === 'error' || log.status >= 400) ? 'err' : 'ok';
            const badgeText  = log.status === 'pending' ? '執行中' : log.status === 'error' ? 'ERR' : log.status;
            const dur = log.duration != null ? `${(log.duration/1000).toFixed(1)}s` : '—';

            entry.innerHTML = `
                <div class="os-dbg-entry-head">
                    <span class="os-dbg-seq">#${logs.length - idx}</span>
                    <span class="os-dbg-time">${log.timestamp}</span>
                    <span class="os-dbg-badge ${badgeClass}">${badgeText}</span>
                    <span class="os-dbg-model" title="${log.model}">${log.model}</span>
                    <span class="os-dbg-meta">${log.messageCount} msgs · ${dur}</span>
                    <span class="os-dbg-arrow">▶</span>
                </div>
                <div class="os-dbg-detail">
                    ${renderRequest(log)}
                    ${renderResponse(log)}
                </div>`;

            entry.querySelector('.os-dbg-entry-head').addEventListener('click', () => {
                entry.classList.toggle('open');
            });

            // Copy buttons
            entry.querySelectorAll('.os-dbg-copy').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const target = btn.dataset.copy;
                    const text = target === 'req'
                        ? JSON.stringify(log.request, null, 2)
                        : (typeof log.response === 'object' ? JSON.stringify(log.response, null, 2) : String(log.responseText || ''));
                    navigator.clipboard?.writeText(text).catch(() => {});
                    btn.textContent = '✓ 成功'; setTimeout(() => { btn.textContent = '複製'; }, 1200);
                });
            });

            body.appendChild(entry);
        });
    }

    function renderRequest(log) {
        if (!log.request) return '';
        const msgs = log.request.messages || [];
        const msgsHtml = msgs.map(m => {
            return `<div class="os-dbg-msg" data-role="${m.role}">
                <div class="os-dbg-msg-role">${m.role}</div>
                <div class="os-dbg-msg-content">${formatMessageContent(m.content, m.role)}</div>
            </div>`;
        }).join('');
        const meta = JSON.stringify({ model: log.request.model, temperature: log.request.temperature, max_tokens: log.request.max_tokens, stream: log.request.stream }, null, 2);
        return `<div class="os-dbg-section">
            <div class="os-dbg-sec-label">📤 Request Payload (${msgs.length} msgs)<span style="flex:1"></span><button class="os-dbg-copy" data-copy="req">📋 複製 JSON</button></div>
            <div class="os-dbg-pre" style="margin-bottom:8px;max-height:80px;">${escHtml(meta)}</div>
            <div class="os-dbg-msg-list">${msgsHtml}</div>
        </div>`;
    }

    function renderResponse(log) {
        if (log.status === 'pending') {
            return `<div class="os-dbg-section"><div class="os-dbg-sec-label">📥 Response Stream</div><div style="color:#fbd38d;font-size:11px;padding:8px 0;">🧬 系統等待神經網絡回傳中…</div></div>`;
        }
        const display = typeof log.response === 'object' && log.response !== null
            ? JSON.stringify(log.response, null, 2)
            : String(log.responseText || log.response || '(empty)');
        return `<div class="os-dbg-section">
            <div class="os-dbg-sec-label">📥 Response Data${log.error ? ' <span style="color:#fc8181;margin-left:8px;">❌ ' + escHtml(log.error) + '</span>' : ''}<span style="flex:1"></span><button class="os-dbg-copy" data-copy="res">📋 複製</button></div>
            <div class="os-dbg-pre">${escHtml(display)}</div>
        </div>`;
    }

    function escHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // ================================================================
    // Panel toggle
    // ================================================================
    function togglePanel() {
        visible = !visible;
        panelEl.classList.toggle('open', visible);
        toggleBtn.classList.toggle('active', visible);
    }
    function closePanel() {
        visible = false;
        panelEl.classList.remove('open');
        toggleBtn.classList.remove('active');
    }

    // ================================================================
    // Direct Hook（由 os_api_engine.js 呼叫，不依賴 fetch 攔截）
    // ================================================================
    const _pendingLogs = new Map();

    window._OS_DBG_REQUEST = function(id, requestBody, url, model) {
        const statusText = panelEl.querySelector('#os-dbg-status-text');
        const lastUrl    = panelEl.querySelector('#os-dbg-last-url');
        const urlShort   = (url || '').replace(/^https?:\/\/[^/]+/, '') || url;
        if (statusText) statusText.textContent = '⏳ 網路請求交涉中…';
        if (lastUrl)    lastUrl.textContent    = urlShort;

        const log = {
            id,
            timestamp:    new Date().toLocaleTimeString('zh-TW', { hour12: false }),
            url:          url || '',
            model:        model || requestBody?.model || '?',
            messageCount: (requestBody?.messages || []).length,
            request:      requestBody,
            response:     null,
            responseText: '',
            duration:     null,
            status:       'pending',
            error:        null,
        };
        _pendingLogs.set(id, log);
        logs.unshift(log);
        if (logs.length > MAX_LOGS) logs.pop();
        renderLogs();
    };

    window._OS_DBG_RESPONSE = function(id, status, text, duration) {
        const log = _pendingLogs.get(id);
        if (!log) return;
        _pendingLogs.delete(id);

        log.duration = duration;
        if (status === 'error') {
            log.status = 'error';
            log.error  = text;
            log.responseText = text;
        } else {
            log.status       = status;
            log.responseText = typeof text === 'string' ? text : '';
            log.response     = text;
        }

        const statusText = panelEl.querySelector('#os-dbg-status-text');
        if (statusText) {
            statusText.textContent = status === 'error'
                ? `❌ 網路中斷或異常 · ${(duration/1000).toFixed(1)}s`
                : `✅ 數據接收完畢 (${status}) · ${(duration/1000).toFixed(1)}s`;
        }
        updateLog(log);
    };

    function updateLog(log) {
        const idx = logs.findIndex(l => l.id === log.id);
        if (idx >= 0) { logs[idx] = log; renderLogs(); }
    }

    console.log('[Aurelia_UI] 🔍 奧瑞亞 API 觀測樞紐已就緒。點擊右下角 🔍 按鈕開啟。');
})();