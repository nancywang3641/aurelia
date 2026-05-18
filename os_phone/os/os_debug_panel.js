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