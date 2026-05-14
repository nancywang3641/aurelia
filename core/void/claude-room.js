/**
 * core/void/claude-room.js — Claude 房間 UI 層
 * 從 void_terminal.js 抽出。橋：activeHistory() / scheduleSave() / isClaudeRoom()。會呼叫 VoidAmbient。
 * 注意：與 core/claude_terminal.js 不同 —— 那個是後端（API/持久化），本檔是 UI。
 */
(function (VoidClaudeRoom) {
    'use strict';

    function _bridge() { return window.VoidTerminal._bridge; }

    let _pendingClaudeAttachments = []; // 當前訊息要附的檔（每筆 {path, filename, mime, size}），送出後清空

    // 套用 Claude 場景的 UI（不負責切場動畫，給 enter/loadState 共用）
    function _applyClaudeRoomUi() {
        const tab = document.getElementById('aurelia-home-tab');
        if (!tab) return;
        tab.classList.remove('mode-404');
        tab.classList.add('mode-claude');

        const bg = tab.querySelector('.void-bg');
        if (bg) bg.style.backgroundColor = '#1a1a2e';

        // 舊的 VN 立繪在 mode-claude 被 CSS 藏起來；新的聊天室立繪在 .claude-portrait-img
        // 但 iris-avatar 還是要保留設定（以防 mode 切回去時殘留）
        const avatar = document.getElementById('iris-avatar');
        if (avatar) {
            avatar.style.opacity = '1';
            avatar.style.display = '';
        }
        // 新聊天室立繪設成 living（會動的）
        _setClaudePortraitState('living');

        // 更新 inline picker bar 文字
        _updateClaudePickerLabel();

        const titleEl = document.getElementById('home-chat-title');
        if (titleEl) titleEl.textContent = "Claude's Room · 月光終端";

        // 輸入框配色由 CSS .void-tab.mode-claude .void-input 接管，這裡只改 placeholder
        const inputField = document.getElementById('iris-input');
        if (inputField) inputField.placeholder = '對 Claude 說點什麼...';

        const nameBox = document.getElementById('iris-name-tag');
        if (nameBox) {
            nameBox.style.display = 'block';
            const _s = nameBox.querySelector('span'); if (_s) _s.textContent = 'Claude';
        }

        // 隱藏瀅瀅 / 柴郡的歷史按鈕，顯示 Claude 自己的
        const irisHistBtn     = document.getElementById('iris-hist-btn');
        const cheshireHistBtn = document.getElementById('cheshire-hist-btn');
        const claudeHistBtn   = document.getElementById('claude-hist-btn');
        if (irisHistBtn) irisHistBtn.style.display = 'none';
        if (cheshireHistBtn) cheshireHistBtn.style.display = 'none';
        if (claudeHistBtn) claudeHistBtn.style.display = '';

        // 清掉世界頻道氣泡層（避免瀅瀅的訊息殘留）
        const layer = document.getElementById('void-bubble-layer');
        if (layer) { layer.innerHTML = ''; }

        // BGM 靜音
        VoidAmbient.pauseBgm();

        // bottom nav 還原 home active 顏色
        const nav = document.getElementById('aurelia-bottom-nav');
        if (nav) {
            nav.classList.remove('mode-404');
            nav.querySelectorAll('.nav-button').forEach(b => {
                const isHome = b.dataset.navId === 'nav-home';
                if (isHome) b.classList.add('active-gold');
                else b.classList.remove('active-gold');
            });
        }
        document.getElementById('aurelia-phone-screen')?.classList.remove('mode-404');
    }

    function _updateClaudePortalBtn() {
        const btn = document.getElementById('claude-portal-btn');
        if (!btn) return;
        const label = btn.querySelector('.void-mode-toggle-label');
        if (_bridge().isClaudeRoom()) {
            if (label) label.textContent = '⬡ 視差書咖';
            btn.title = '返回視差書咖';
        } else {
            if (label) label.textContent = '🦀 Claude';
            btn.title = '進入 Claude 的房間';
        }
    }

    // Claude 回覆切多頁（套奧瑞亞 VN 翻頁體驗，避免長文字爆出對話框）
    // 優先度：段落空行 > 單換行 > 句末標點 > 逗號 > 字數硬切
    // ===== Claude inline picker（聊天室上方橫條：model / effort / endpoint） =====

    const CLAUDE_MODELS = [
        { id: 'claude-opus-4-7',           label: 'Opus 4.7 ⭐'   },
        { id: 'claude-opus-4-6',           label: 'Opus 4.6'      },
        { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6'    },
        { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5'     },
    ];
    const CLAUDE_EFFORTS = [
        { id: 'off',    label: 'Off · 不思考' },
        { id: 'low',    label: 'Low · 簡單問題跳過' },
        { id: 'medium', label: 'Medium · 自動判斷（建議）' },
        { id: 'high',   label: 'High · 多數題都思考' },
        { id: 'xhigh',  label: 'xHigh · 深度思考' },
        { id: 'max',    label: 'Max · 不留餘地' },
    ];

    function _getClaudeRoomCfg() {
        return (window.OS_SETTINGS && window.OS_SETTINGS.getClaudeRoomConfig)
            ? window.OS_SETTINGS.getClaudeRoomConfig() : null;
    }
    function _saveClaudeRoomCfg(cfg) {
        if (window.OS_SETTINGS && window.OS_SETTINGS.saveClaudeRoomConfig) {
            window.OS_SETTINGS.saveClaudeRoomConfig(cfg);
        }
    }
    function _shortModelLabel(modelId) {
        const m = CLAUDE_MODELS.find(x => x.id === modelId);
        return m ? m.label.replace(' ⭐', '') : (modelId || 'Opus 4.7');
    }
    function _shortEffortLabel(eff) {
        if (!eff) return '🧠 預設';
        if (eff === 'off') return '🧠 off';
        return '🧠 ' + eff;
    }
    function _shortEndpointLabel(cfg) {
        const presets = cfg?.presets || [];
        const active = presets.find(p => p.id === cfg.activePresetId) || presets[0];
        if (!active) return '⚠️ 沒設定';
        // 偵測 URL 類型自動配 emoji
        const url = active.url || '';
        let emoji = '🌐';
        if (/api\.anthropic\.com/i.test(url)) emoji = '🌐';
        else if (/dancc\.|localhost|127\.0\.0\.1/i.test(url)) emoji = '🏠';
        else if (/cc\.|vps/i.test(url)) emoji = '☁️';
        return `${emoji} ${active.name || active.id}`;
    }

    function _isAnthropicDirect(url) {
        return /api\.anthropic\.com/i.test(url || '') || (url || '').endsWith('/v1/messages');
    }

    /** 聊天室上方那條橫條的文字更新 */
    function _updateClaudePickerLabel() {
        const cfg = _getClaudeRoomCfg();
        if (!cfg) return;
        const m = document.getElementById('claude-pick-model');
        const e = document.getElementById('claude-pick-effort');
        const ep = document.getElementById('claude-pick-endpoint');
        const bk = document.getElementById('claude-pick-backend');
        if (m)  m.textContent  = _shortModelLabel(cfg.inlineModel || cfg.model);
        if (e)  e.textContent  = _shortEffortLabel(cfg.inlineEffort);
        if (ep) ep.textContent = _shortEndpointLabel(cfg);
        // backend 在 Anthropic 直連模式下沒意義，藏起來
        if (bk) {
            const presets = cfg?.presets || [];
            const active = presets.find(p => p.id === cfg.activePresetId) || presets[0];
            const direct = active && _isAnthropicDirect(active.url);
            bk.style.display = direct ? 'none' : '';
        }
    }

    /** popup 內容生成 + 展開 */
    function _openClaudePickerPopup() {
        const cfg = _getClaudeRoomCfg();
        if (!cfg) return;
        const popup = document.getElementById('claude-picker-popup');
        if (!popup) return;
        const curModel   = cfg.inlineModel   || cfg.model || 'claude-opus-4-7';
        const curEffort  = cfg.inlineEffort  || '';
        const curBackend = cfg.inlineBackend || '';
        const curPresetId = cfg.activePresetId || '';

        const sectionHtml = (title, list, curId, dataKey) => `
            <div class="claude-picker-section-title">${title}</div>
            ${list.map(it => `
                <div class="claude-picker-item${curId === it.id ? ' active' : ''}" data-${dataKey}="${it.id}">
                    <span class="claude-picker-check">${curId === it.id ? '✓' : ''}</span>
                    <span>${it.label}</span>
                </div>
            `).join('')}
        `;

        // 連線預設 section（從 cfg.presets）
        const presets = cfg.presets || [];
        const presetList = presets.map(p => ({
            id: p.id,
            label: (p.name || p.id) + (p.url ? '' : ' (未設定)'),
        }));

        popup.innerHTML = `
            ${sectionHtml('連線預設',     presetList,        curPresetId, 'preset')}
            ${sectionHtml('Model',        CLAUDE_MODELS,     curModel,    'model')}
            ${sectionHtml('Thinking 思考', CLAUDE_EFFORTS,    curEffort || 'medium', 'effort')}
        `;
        popup.style.display = 'block';

        // 綁項目點擊
        popup.querySelectorAll('[data-preset]').forEach(el => el.onclick = () => {
            const c = _getClaudeRoomCfg();
            c.activePresetId = el.dataset.preset;
            _saveClaudeRoomCfg(c);
            // sid 已經 per-preset 存了，切過去自動取對應 sid（不用清也不會混）
            _updateClaudePickerLabel(); _openClaudePickerPopup();
        });
        popup.querySelectorAll('[data-model]').forEach(el => el.onclick = () => {
            const c = _getClaudeRoomCfg(); c.inlineModel = el.dataset.model; _saveClaudeRoomCfg(c);
            _updateClaudePickerLabel(); _openClaudePickerPopup();
        });
        popup.querySelectorAll('[data-effort]').forEach(el => el.onclick = () => {
            const c = _getClaudeRoomCfg(); c.inlineEffort = el.dataset.effort; _saveClaudeRoomCfg(c);
            _updateClaudePickerLabel(); _openClaudePickerPopup();
        });
    }

    function _closeClaudePickerPopup() {
        const p = document.getElementById('claude-picker-popup');
        if (p) p.style.display = 'none';
    }

    // 點 popup 外面關閉
    document.addEventListener('click', (e) => {
        const popup = document.getElementById('claude-picker-popup');
        if (!popup || popup.style.display === 'none') return;
        const btn = document.getElementById('claude-picker-btn');
        if (popup.contains(e.target) || (btn && btn.contains(e.target))) return;
        _closeClaudePickerPopup();
    });

    // ===== Claude 聊天室渲染（取代 VN 翻頁） =====

    // 切換上半立繪狀態（idle / living / thinking / happy / error）
    function _setClaudePortraitState(state) {
        const img = document.getElementById('claude-portrait-img');
        if (!img) return;
        const ASSETS = (window.ClaudeTerminal && window.ClaudeTerminal.ASSETS) || {};
        const FB = (window.ClaudeTerminal && window.ClaudeTerminal.FALLBACK_URL) || '';
        img.onerror = function(){ this.onerror = null; this.src = FB; };
        img.src = ASSETS[state] || ASSETS.living || ASSETS.idle || FB;
    }

    function _scrollClaudeChatToBottom() {
        const stream = document.getElementById('claude-chat-stream');
        if (stream) stream.scrollTop = stream.scrollHeight;
    }

    /** 加一條氣泡到 chat-stream。
     *  role: 'user' | 'assistant'
     *  opts.thinking: 字串 → 在氣泡上方塞折疊 thinking 區塊（之後 cc-bridge 真的吐 thinking 再用）
     */
    /** 從 mime / filename 推一個合適 emoji icon 給附件 chip 用 */
    function _attachIcon(mime, filename) {
        const ext = ((filename || '').split('.').pop() || '').toLowerCase();
        if (['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext)) return '🖼️';
        if (ext === 'pdf') return '📄';
        if (['md','txt','log','csv','yaml','yml','toml'].includes(ext)) return '📝';
        if (['js','ts','tsx','jsx','py','html','css','json','sh','bat','rb','go','rs','c','cpp','java'].includes(ext)) return '⚡';
        if (typeof mime === 'string') {
            if (mime.startsWith('image/')) return '🖼️';
            if (mime === 'application/pdf') return '📄';
            if (mime.startsWith('text/')) return '📝';
        }
        return '📎';
    }

    /** 把 tools_used list 摘成「改了 X 個檔、跑了 Y 個命令...」一行字 */
    function _summarizeToolsUsed(toolsUsed) {
        if (!Array.isArray(toolsUsed) || !toolsUsed.length) return '';
        const counts = {};
        for (const t of toolsUsed) {
            const name = (t && t.name) || 'unknown';
            counts[name] = (counts[name] || 0) + 1;
        }
        const cnt = k => counts[k] || 0;
        const e = cnt('Edit') + cnt('Write') + cnt('MultiEdit') + cnt('NotebookEdit');
        const b = cnt('Bash');
        const r = cnt('Read');
        const s = cnt('Grep') + cnt('Glob');
        const w = cnt('WebFetch') + cnt('WebSearch');
        const known = e + b + r + s + w;
        const other = toolsUsed.length - known;
        const parts = [];
        if (e) parts.push(`改了 ${e} 個檔`);
        if (b) parts.push(`跑了 ${b} 個命令`);
        if (r) parts.push(`讀了 ${r} 個檔`);
        if (s) parts.push(`搜了 ${s} 次`);
        if (w) parts.push(`抓了 ${w} 個網頁`);
        if (other) parts.push(`其他 ${other} 個工具`);
        return parts.length ? parts.join('、') : `用了 ${toolsUsed.length} 個工具`;
    }

    /** 拿 tool 的主要輸入欄位作為 detail（檔名 / 命令前 80 字 / pattern 前 60 字 等） */
    function _toolDetailLine(tool) {
        const inp = (tool && tool.input) || {};
        const name = tool && tool.name;
        if (!name) return '';
        if (name === 'Edit' || name === 'Write' || name === 'MultiEdit' || name === 'NotebookEdit' || name === 'Read') {
            const p = (inp.file_path || inp.notebook_path || '');
            return p ? p.replace(/^.*[\\/]/, '') : '';  // basename only
        }
        if (name === 'Bash')      return (inp.command || '').slice(0, 80);
        if (name === 'Grep')      return (inp.pattern || '').slice(0, 60) + (inp.path ? ` in ${inp.path.replace(/^.*[\\/]/, '')}` : '');
        if (name === 'Glob')      return (inp.pattern || '').slice(0, 60);
        if (name === 'WebFetch')  return (inp.url || '').slice(0, 80);
        if (name === 'WebSearch') return (inp.query || '').slice(0, 60);
        return '';
    }

    let _claudeMdConverter = null;
    function _claudeMarkdownToSafeHtml(text) {
        if (!window.showdown || !window.DOMPurify) return null;
        if (!_claudeMdConverter) {
            _claudeMdConverter = new window.showdown.Converter({
                tables: true,
                strikethrough: true,
                simpleLineBreaks: true,
                openLinksInNewWindow: true,
                disableForced4SpacesIndentedSublists: true,
                ghCodeBlocks: true,
                tasklists: true,
            });
        }
        const html = _claudeMdConverter.makeHtml(String(text == null ? '' : text));

        // sanitize：放行 input 給 task list checkbox，下面後處理會把非 checkbox 的 input 砍掉
        const safe = window.DOMPurify.sanitize(html, {
            ADD_TAGS: ['input'],
            ADD_ATTR: ['type', 'disabled', 'checked'],
        });

        // 後處理：(1) 過濾 input 只留 disabled checkbox  (2) hljs 套語法高亮
        const tmp = document.createElement('div');
        tmp.innerHTML = safe;

        tmp.querySelectorAll('input').forEach(el => {
            if (el.getAttribute('type') !== 'checkbox') {
                el.remove();
            } else {
                el.setAttribute('disabled', '');  // 強制 disabled，使用者點不到
            }
        });

        if (window.hljs) {
            tmp.querySelectorAll('pre code').forEach(el => {
                try {
                    window.hljs.highlightElement(el);
                } catch (_) { /* 忽略：可能已 highlighted 或語言未支援 */ }
            });
        }

        return tmp.innerHTML;
    }

    function _renderClaudeBubble(role, content, opts = {}) {
        const stream = document.getElementById('claude-chat-stream');
        if (!stream) return;
        const isUser = role === 'user';
        const wrap = document.createElement('div');
        wrap.className = 'claude-bubble-wrap ' + (isUser ? 'from-user' : 'from-claude');

        if (!isUser && opts.thinking) {
            const t = document.createElement('div');
            t.className = 'claude-thinking';
            const header = document.createElement('div');
            header.className = 'claude-thinking-header';
            header.innerHTML = '<span class="claude-thinking-toggle">▶</span><span>💭 thinking...</span>';
            const body = document.createElement('div');
            body.className = 'claude-thinking-content';
            body.textContent = opts.thinking;
            t.appendChild(header); t.appendChild(body);
            t.addEventListener('click', () => t.classList.toggle('open'));
            wrap.appendChild(t);
        }

        // tool summary 摺疊塊（仿 Claude.ai 桌面端「Edited 2 files, ran a command」）
        if (!isUser && Array.isArray(opts.toolsUsed) && opts.toolsUsed.length) {
            const ts = document.createElement('div');
            ts.className = 'claude-tool-summary';

            const tsHeader = document.createElement('div');
            tsHeader.className = 'claude-tool-summary-header';
            const summary = _summarizeToolsUsed(opts.toolsUsed);
            tsHeader.innerHTML = `<span class="claude-tool-summary-toggle">▶</span><span>🔧 ${summary}</span>`;

            const tsBody = document.createElement('div');
            tsBody.className = 'claude-tool-summary-body';
            opts.toolsUsed.forEach(tool => {
                const item = document.createElement('div');
                item.className = 'claude-tool-summary-item';
                const nameSpan = document.createElement('span');
                nameSpan.className = 'claude-tool-summary-name';
                nameSpan.textContent = (tool && tool.name) || 'unknown';
                item.appendChild(nameSpan);
                const detail = _toolDetailLine(tool);
                if (detail) {
                    const detailSpan = document.createElement('span');
                    detailSpan.className = 'claude-tool-summary-detail';
                    detailSpan.textContent = detail;
                    item.appendChild(document.createTextNode(' '));
                    item.appendChild(detailSpan);
                }
                tsBody.appendChild(item);
            });

            ts.appendChild(tsHeader);
            ts.appendChild(tsBody);
            ts.addEventListener('click', () => ts.classList.toggle('open'));
            wrap.appendChild(ts);
        }

        const bubble = document.createElement('div');
        bubble.className = 'claude-bubble ' + (isUser ? 'from-user' : 'from-claude');
        if (isUser || opts.suppressMarkdown) {
            // User 訊息 / streaming 中：raw text 顯示（streaming 期間每 chunk re-render
            // 一次 markdown 太貴，stream 結束最後一次 render 才開 markdown）
            bubble.textContent = content;
        } else {
            // Claude 回覆：解析 markdown 後 sanitize 再插入
            const safeHtml = _claudeMarkdownToSafeHtml(content);
            if (safeHtml !== null) {
                bubble.innerHTML = safeHtml;
                bubble.classList.add('claude-bubble-md');
            } else {
                bubble.textContent = content;
            }
        }

        // 附件 chip（顯示這條訊息附了哪些檔）
        if (Array.isArray(opts.attachments) && opts.attachments.length) {
            const attachBox = document.createElement('div');
            attachBox.className = 'claude-bubble-attachments';
            opts.attachments.forEach(a => {
                const item = document.createElement('span');
                item.className = 'claude-bubble-attach-item';
                item.textContent = `${_attachIcon(a.mime, a.filename)} ${a.filename || 'file'}`;
                attachBox.appendChild(item);
            });
            bubble.appendChild(attachBox);
        }

        wrap.appendChild(bubble);

        // 用量 footer：只在 Claude 氣泡 + 有 usage 時顯示
        if (!isUser && opts.usage && (opts.usage.input_tokens || opts.usage.output_tokens)) {
            const u = opts.usage;
            const cost = (typeof u.total_cost_usd === 'number' && u.total_cost_usd > 0)
                ? `$${u.total_cost_usd.toFixed(4)}` : '$0.0000';
            const cacheNote = (u.cache_read_input_tokens > 0)
                ? ` · cache ${u.cache_read_input_tokens}r` : '';
            const footer = document.createElement('div');
            footer.className = 'claude-bubble-usage';
            footer.title = `model: ${u.model || '?'}\ninput: ${u.input_tokens || 0}\noutput: ${u.output_tokens || 0}\ncache write: ${u.cache_creation_input_tokens || 0}\ncache read: ${u.cache_read_input_tokens || 0}\ncost: ${cost}`;
            footer.textContent = `💰 ${cost} · ${u.input_tokens || 0}↑ ${u.output_tokens || 0}↓${cacheNote}`;
            wrap.appendChild(footer);
        }

        stream.appendChild(wrap);
        _scrollClaudeChatToBottom();
    }

    /** 進入 Claude 房間時用：把 IRIS_STATE.history 全部 render 成氣泡（含附件 + thinking + usage） */
    function _hydrateClaudeStream() {
        const stream = document.getElementById('claude-chat-stream');
        if (!stream) return;
        stream.innerHTML = '';
        (_bridge().activeHistory() || []).forEach(m => {
            _renderClaudeBubble(
                m.role === 'user' ? 'user' : 'assistant',
                m.content,
                {
                    attachments: m.attachments || [],
                    thinking: m.thinking || null,
                    usage: m.usage || null,
                    toolsUsed: (Array.isArray(m.tools_used) && m.tools_used.length) ? m.tools_used : null,
                }
            );
        });
        _scrollClaudeChatToBottom();
    }

    // ===== 附件 chip 預覽列（輸入框上方）=====
    function _renderClaudeAttachChips() {
        const row = document.getElementById('claude-attach-chips');
        if (!row) return;
        row.innerHTML = '';
        _pendingClaudeAttachments.forEach((a, idx) => {
            const chip = document.createElement('div');
            chip.className = 'claude-attach-chip';
            chip.title = a.path || a.filename;
            const icon = document.createElement('span');
            icon.textContent = _attachIcon(a.mime, a.filename);
            const name = document.createElement('span');
            name.className = 'claude-attach-chip-name';
            name.textContent = a.filename || 'file';
            const x = document.createElement('span');
            x.className = 'claude-attach-chip-x';
            x.textContent = '×';
            x.title = '移除';
            x.addEventListener('click', (e) => {
                e.stopPropagation();
                _pendingClaudeAttachments.splice(idx, 1);
                _renderClaudeAttachChips();
            });
            chip.appendChild(icon); chip.appendChild(name); chip.appendChild(x);
            row.appendChild(chip);
        });
    }

    /** 觸發隱藏的 file input、上傳到 cc-bridge、push 進 _pendingClaudeAttachments */
    async function _handleClaudeFilePick(fileList) {
        if (!fileList || !fileList.length) return;
        if (!window.ClaudeTerminal || typeof window.ClaudeTerminal.uploadFiles !== 'function') {
            _renderClaudeBubble('assistant', '⚠️ ClaudeTerminal 未載入，無法上傳。');
            return;
        }
        // 顯示「上傳中」chip
        const placeholderIdx = _pendingClaudeAttachments.length;
        Array.from(fileList).forEach(f => {
            _pendingClaudeAttachments.push({
                _uploading: true,
                filename: f.name,
                mime: f.type || '',
                size: f.size,
            });
        });
        _renderClaudeAttachChips();

        try {
            const result = await window.ClaudeTerminal.uploadFiles(fileList);
            // 用 server 回傳的真實路徑替換 placeholder
            (result.files || []).forEach((meta, i) => {
                _pendingClaudeAttachments[placeholderIdx + i] = {
                    path: meta.path,
                    filename: meta.filename,
                    mime: meta.mime,
                    size: meta.size,
                };
            });
        } catch (e) {
            // 上傳失敗：拔掉 placeholder
            _pendingClaudeAttachments.splice(placeholderIdx, fileList.length);
            const raw = (e && e.message) || '未知錯誤';
            _renderClaudeBubble('assistant', '⚠️ 上傳失敗：' + raw);
        }
        _renderClaudeAttachChips();
    }

    // 把 Claude 回覆 append 成一條氣泡 + 立繪 happy → living
    function _renderClaudeReply(text) {
        _renderClaudeBubble('assistant', text);
        _setClaudePortraitState('happy');
        setTimeout(() => _setClaudePortraitState('living'), 600);
    }

    // 發送 Claude 房間訊息（走 cc-bridge / OpenAI 兼容；持久化由 ClaudeTerminal 處理）
    async function _sendClaudeMessage(text) {
        if (!window.ClaudeTerminal) {
            _renderClaudeReply('⚠️ ClaudeTerminal 模組未載入。');
            return;
        }
        if (!window.ClaudeTerminal.isConfigured()) {
            _renderClaudeReply('⚠️ 還沒設定 cc-bridge URL / Key。\n\n去「寫作 → API 設置 → 🦀 Claude 的房間」填好。');
            return;
        }

        // 快照當前附件（only paths from server，不送 _uploading placeholder），送出後清空
        const attachmentsSnapshot = _pendingClaudeAttachments
            .filter(a => a && a.path)
            .map(a => ({ path: a.path, filename: a.filename, mime: a.mime, size: a.size }));
        _pendingClaudeAttachments = [];
        _renderClaudeAttachChips();

        // 即時把 user message（含附件）push 進 history + 立刻 render 成右側橘氣泡
        _bridge().activeHistory().push({
            role: 'user', content: text, ts: Date.now(),
            attachments: attachmentsSnapshot.length ? attachmentsSnapshot : undefined,
        });
        _renderClaudeBubble('user', text, { attachments: attachmentsSnapshot });

        // 立繪切 thinking
        _setClaudePortraitState('thinking');

        try {
            // streaming 漸進式 render：stream 期間每收到 text/tool 事件就 destroy 舊 wrapper
            // 重 render 一個（用 suppressMarkdown 跳過 markdown，避免每 chunk 重 render markdown 閃爍）
            // stream 結束後最終 render 才開 markdown
            const acc = { text: '', tools: [] };
            let streamWrap = null;
            const stream = document.getElementById('claude-chat-stream');

            const rerenderStreaming = () => {
                if (streamWrap && streamWrap.parentNode) {
                    streamWrap.parentNode.removeChild(streamWrap);
                }
                _renderClaudeBubble('assistant', acc.text || '⏳ ...', {
                    toolsUsed: acc.tools.length ? acc.tools : null,
                    suppressMarkdown: true,
                });
                streamWrap = stream && stream.lastElementChild;
            };

            const onProgress = (ev) => {
                if (!ev) return;
                if (ev.type === 'text') {
                    acc.text = ev.accumulated || (acc.text + (ev.delta || ''));
                    rerenderStreaming();
                } else if (ev.type === 'tool_use' && ev.tool) {
                    acc.tools.push(ev.tool);
                    rerenderStreaming();
                }
            };

            const result = await window.ClaudeTerminal.send(text, attachmentsSnapshot, onProgress);
            const reply = result.reply;
            const thinking = result.thinking || null;
            const usage = result.usage || null;
            const toolsUsed = (Array.isArray(result.toolsUsed) && result.toolsUsed.length) ? result.toolsUsed : null;

            // 累計到額度面板（💰 app）
            if (usage && window.OS_SPEND_PANEL && typeof window.OS_SPEND_PANEL.record === 'function') {
                try { window.OS_SPEND_PANEL.record(usage); } catch (_) {}
            }

            // 移除 stream 期間最後一個 placeholder wrap，下面做最終 render（含 markdown）
            if (streamWrap && streamWrap.parentNode) {
                streamWrap.parentNode.removeChild(streamWrap);
                streamWrap = null;
            }

            // assistant reply 寫進 history（含 thinking / usage / tools_used 一起存）
            const assistantRecord = { role: 'assistant', content: reply, ts: Date.now() };
            if (thinking) assistantRecord.thinking = thinking;
            if (usage) assistantRecord.usage = usage;
            if (toolsUsed) assistantRecord.tools_used = toolsUsed;
            _bridge().activeHistory().push(assistantRecord);

            // session_id resume 失敗：cc-bridge 退回新 session、Claude 不記得前文
            if (result.sessionFallback) {
                _renderClaudeBubble('assistant',
                    '⚠️ 之前的 session 失效了（cc-bridge 重啟過 / log 被清 / 太久沒聊）。\n\n' +
                    '我從零開始記新對話了。如果想讓我知道之前聊過什麼，把重點再講一次給我聽吧。\n\n' +
                    '---\n\n' + reply,
                    { thinking, usage, toolsUsed }
                );
                _setClaudePortraitState('happy');
                setTimeout(() => _setClaudePortraitState('living'), 600);
            } else {
                _renderClaudeBubble('assistant', reply, { thinking, usage, toolsUsed });
                _setClaudePortraitState('happy');
                setTimeout(() => _setClaudePortraitState('living'), 600);
            }
            _bridge().scheduleSave();
        } catch (e) {
            // 失敗：回滾剛 push 的 user message
            if (_bridge().activeHistory().length > 0 && _bridge().activeHistory()[_bridge().activeHistory().length - 1].role === 'user') {
                _bridge().activeHistory().pop();
            }

            _setClaudePortraitState('error');

            const raw = (e && e.message) || '未知錯誤';
            const [code, ...rest] = raw.split(':');
            const detail = rest.join(':') || raw;
            let userMsg;
            switch (code) {
                case 'NOT_CONFIGURED': userMsg = '⚠️ 還沒設定 cc-bridge URL / Key。\n\n去「寫作 → API 設置 → 🦀 Claude 的房間」填好。'; break;
                case 'AUTH':           userMsg = '🔒 ' + detail; break;
                case 'NETWORK':        userMsg = '🌐 ' + detail; break;
                case 'SERVER':         userMsg = '💥 ' + detail; break;
                case 'EMPTY':          userMsg = '🤔 ' + detail; break;
                case 'API':            userMsg = '⚠️ API 錯誤：' + detail; break;
                case 'BAD_JSON':       userMsg = '⚠️ ' + detail; break;
                case 'SETTINGS_MISSING': userMsg = '⚠️ ' + detail; break;
                default:               userMsg = '⚠️ ' + raw;
            }
            _renderClaudeBubble('assistant', userMsg);
            setTimeout(() => _setClaudePortraitState('living'), 1500);
        }
    }

    VoidClaudeRoom.applyRoomUi       = _applyClaudeRoomUi;
    VoidClaudeRoom.updatePortalBtn   = _updateClaudePortalBtn;
    VoidClaudeRoom.updatePickerLabel = _updateClaudePickerLabel;
    VoidClaudeRoom.openPicker        = _openClaudePickerPopup;
    VoidClaudeRoom.closePicker       = _closeClaudePickerPopup;
    VoidClaudeRoom.setPortraitState  = _setClaudePortraitState;
    VoidClaudeRoom.renderBubble      = _renderClaudeBubble;
    VoidClaudeRoom.renderReply       = _renderClaudeReply;
    VoidClaudeRoom.hydrateStream     = _hydrateClaudeStream;
    VoidClaudeRoom.handleFilePick    = _handleClaudeFilePick;
    VoidClaudeRoom.sendMessage       = _sendClaudeMessage;

    console.log('✅ VoidClaudeRoom（Claude 房間 UI）模組就緒');
})(window.VoidClaudeRoom = window.VoidClaudeRoom || {});
