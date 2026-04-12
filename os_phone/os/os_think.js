// ----------------------------------------------------------------
// [檔案] os_think.js (V1.2 - 持久化 + 面板標籤 + 用戶輸入記錄)
// 職責：全局攔截並展示 AI 的 <think>...</think> 思考過程。
// 架構：OS 層浮動組件 + SYS 選單全屏面板，所有面板共用。
//       新面板只要走 os_api_engine → cleanRawOutput，即自動擷取。
// ----------------------------------------------------------------
(function() {
    const win = window.parent || window;
    const MAX_ENTRIES = 50;
    const STORAGE_KEY = 'os_think_log';

    let _ctx = null; // 當前 API 呼叫的 context，由 setContext() 設定
    let entries  = [];
    let isOpen   = false;
    let mounted  = false;
    let _toggle  = null, _panel = null, _body = null, _badge = null;
    let _mountTries = 0;

    // ── 持久化 ──────────────────────────────────────────────────────────
    function loadFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) entries = JSON.parse(raw);
        } catch(e) { entries = []; }
    }
    function saveToStorage() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES))); } catch(e) {}
    }
    loadFromStorage();

    // ── CSS ──────────────────────────────────────────────────────────
    const CSS = `
        /* ── 浮動開關按鈕 ── */
        #os-think-btn {
            position: absolute;
            top: 7px; right: 8px;
            z-index: 9100;
            width: 28px; height: 28px;
            background: rgba(13,13,25,0.6);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            font-size: 13px;
            transition: opacity .3s, border-color .25s, background .25s;
            opacity: 0.25;           /* 平常淡顯，有內容才亮 */
            backdrop-filter: blur(4px);
            user-select: none;
        }
        #os-think-btn:hover          { opacity: 0.7; }
        #os-think-btn.has-content    { opacity: 1; border-color: rgba(212,175,55,.4); }
        #os-think-btn.open           { background: rgba(212,175,55,.18); border-color: #d4af37; opacity: 1; }
        #os-think-btn .think-badge {
            position: absolute; top: -4px; right: -4px;
            min-width: 14px; height: 14px;
            background: #d4af37; border-radius: 7px;
            font-size: 9px; line-height: 14px; text-align: center;
            color: #000; font-weight: 700; padding: 0 2px;
            display: none;
        }

        /* ── 滑入式面板 ── */
        #os-think-panel {
            position: absolute;
            top: 0; left: 0; right: 0;
            max-height: 62%;
            background: rgba(9,9,18,0.97);
            border-bottom: 1px solid #1e1e3a;
            z-index: 9099;
            transform: translateY(-101%);
            transition: transform .3s cubic-bezier(.4,0,.2,1);
            display: flex; flex-direction: column;
            backdrop-filter: blur(12px);
            box-shadow: 0 6px 30px rgba(0,0,0,.7);
        }
        #os-think-panel.open { transform: translateY(0); }

        /* ── 面板標題 ── */
        #os-think-head {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 12px 9px;
            border-bottom: 1px solid #1a1a2e;
            flex-shrink: 0;
        }
        #os-think-head-title { flex:1; font-size:13px; font-weight:700; color:#d4af37; letter-spacing:.4px; }
        #os-think-clear {
            font-size:11px; color:#444; cursor:pointer;
            padding:2px 7px; border:1px solid #222; border-radius:4px;
            transition:color .15s, border-color .15s;
        }
        #os-think-clear:hover { color:#aaa; border-color:#555; }
        #os-think-close {
            font-size:20px; color:#444; cursor:pointer; line-height:1;
            transition:color .15s; padding: 0 2px;
        }
        #os-think-close:hover { color:#ddd; }

        /* ── 面板內容 ── */
        #os-think-body {
            flex:1; overflow-y:auto; padding:10px 12px 14px;
            scrollbar-width:thin; scrollbar-color:#1e1e3a transparent;
        }
        #os-think-body::-webkit-scrollbar { width:4px; }
        #os-think-body::-webkit-scrollbar-thumb { background:#1e1e3a; border-radius:2px; }

        .think-entry          { margin-bottom:16px; }
        .think-entry-meta     { font-size:10px; color:#444; margin-bottom:4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .think-entry-meta::after { content:''; flex:1; height:1px; background:#141428; min-width:20px; }
        .think-entry-panel    { background:rgba(212,175,55,.12); color:#a07828; border:1px solid rgba(212,175,55,.2); border-radius:3px; padding:1px 5px; font-size:9px; letter-spacing:.3px; white-space:nowrap; }
        .think-entry-input    { color:#3a5a3a; font-style:italic; font-size:9.5px; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .think-entry-content  {
            font-size:12px; color:#7a7aaa; line-height:1.7;
            white-space:pre-wrap; word-break:break-word;
            background:rgba(255,255,255,.02); border-left:2px solid #1e1e4a;
            padding:8px 10px; border-radius:0 4px 4px 0;
        }
        .think-entry-raw-toggle {
            font-size:9.5px; color:#2a3a2a; cursor:pointer; margin-top:5px;
            padding:3px 8px; border:1px solid #1a2a1a; border-radius:3px;
            display:inline-block; transition:color .15s, border-color .15s;
        }
        .think-entry-raw-toggle:hover { color:#5a8a5a; border-color:#2a4a2a; }
        .think-entry-raw {
            display:none; margin-top:6px; font-size:11px; color:#3a6a3a; line-height:1.6;
            white-space:pre-wrap; word-break:break-word;
            background:rgba(0,255,60,.02); border-left:2px solid #0a2a0a;
            padding:8px 10px; border-radius:0 4px 4px 0;
        }
        .think-entry-raw.open { display:block; }
        .think-empty {
            text-align:center; color:#2a2a4a; padding:30px 16px;
            font-size:12px; line-height:1.9;
        }
        .think-empty small { display:block; color:#1e1e30; font-size:10px; margin-top:4px; }

        /* ── SYS 全屏模式 (由 launchApp 使用) ── */
        .think-launch-wrap {
            background:#0a0a14; color:#e0e0e0;
            height:100%; display:flex; flex-direction:column; font-family:sans-serif;
        }
        .think-launch-head {
            display:flex; align-items:center; gap:8px;
            padding:0 12px; height:48px;
            background:#0d0d1e; border-bottom:1px solid #1e1e3a; flex-shrink:0;
        }
        .think-launch-back { font-size:22px; cursor:pointer; color:#d4af37; line-height:1; user-select:none; }
        .think-launch-title { flex:1; font-size:15px; font-weight:700; }
        .think-launch-clr   { font-size:12px; color:#555; cursor:pointer; padding:4px 10px; border:1px solid #2a2a3a; border-radius:4px; }
        .think-launch-clr:hover { color:#aaa; border-color:#555; }
        .think-launch-body  { flex:1; overflow-y:auto; padding:12px; }
    `;

    // ── Helpers ───────────────────────────────────────────────────────
    function esc(s) {
        return String(s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function formatTime(d) {
        const p = n => String(n).padStart(2,'0');
        return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }
    function getFrame() {
        const doc = (win !== window) ? win.document : document;
        return doc.getElementById('phone-frame-hardware');
    }
    function injectCSS(doc) {
        if (doc.getElementById('os-think-css')) return;
        const s = doc.createElement('style');
        s.id = 'os-think-css'; s.innerHTML = CSS;
        doc.head.appendChild(s);
    }

    // ── 重試掛載浮動元件（等 phone_system 建好 frame）─────────────────
    function tryMount() {
        const frame = getFrame();
        if (!frame) {
            _mountTries++;
            if (_mountTries < 25) setTimeout(tryMount, 400); // 最多等 10 秒
            return;
        }
        if (mounted) return;
        const doc = frame.ownerDocument;
        injectCSS(doc);

        // 滑入面板
        _panel = doc.createElement('div');
        _panel.id = 'os-think-panel';
        _panel.innerHTML = `
            <div id="os-think-head">
                <span id="os-think-head-title">💭 AI 思考過程</span>
                <span id="os-think-clear">清空</span>
                <span id="os-think-close">×</span>
            </div>
            <div id="os-think-body">
                <div class="think-empty">尚無思考記錄<small>當 AI 輸出 &lt;think&gt; 區塊時自動出現</small></div>
            </div>
        `;
        frame.appendChild(_panel);
        _body = _panel.querySelector('#os-think-body');
        _panel.querySelector('#os-think-close').onclick = closePanel;
        _panel.querySelector('#os-think-clear').onclick = clearAll;

        // 浮動按鈕
        _toggle = doc.createElement('div');
        _toggle.id = 'os-think-btn';
        _toggle.title = '💭 AI 思考過程';
        _toggle.innerHTML = `💭<span class="think-badge">0</span>`;
        _toggle.onclick = toggle;
        frame.appendChild(_toggle);
        _badge = _toggle.querySelector('.think-badge');

        mounted = true;
        syncBadge();
        if (entries.length > 0) renderEntries();
    }

    // ── 渲染單筆 entry ────────────────────────────────────────────────
    function entryHtml(e, idx, total) {
        const uid = `think-${e.timestamp || idx}`;
        const panelTag  = e.panel     ? `<span class="think-entry-panel">${esc(e.panel)}</span>` : '';
        const inputTag  = e.userInput ? `<span class="think-entry-input">▶ ${esc(e.userInput.slice(0, 60))}${e.userInput.length > 60 ? '…' : ''}</span>` : '';
        const rawBlock  = e.rawOutput ? `
            <span class="think-entry-raw-toggle" onclick="this.nextElementSibling.classList.toggle('open');this.textContent=this.nextElementSibling.classList.contains('open')?'▲ 收起 AI 原始輸出':'▼ 展開 AI 原始輸出'">▼ 展開 AI 原始輸出</span>
            <div class="think-entry-raw">${esc(e.rawOutput)}</div>` : '';
        return `
            <div class="think-entry">
                <div class="think-entry-meta">#${total - idx} · ${esc(e.time)} ${panelTag} ${inputTag}</div>
                <div class="think-entry-content">${esc(e.content)}</div>
                ${rawBlock}
            </div>`;
    }

    // ── 渲染 ─────────────────────────────────────────────────────────
    function renderEntries() {
        if (!_body) return;
        if (entries.length === 0) {
            _body.innerHTML = '<div class="think-empty">尚無思考記錄<small>當 AI 輸出 &lt;think&gt; 區塊時自動出現</small></div>';
            return;
        }
        _body.innerHTML = entries.map((e, i) => entryHtml(e, i, entries.length)).join('');
    }

    // 全屏版本（launchApp 用）
    function renderLaunch(body) {
        if (entries.length === 0) {
            body.innerHTML = '<div class="think-empty" style="padding:50px">尚無思考記錄<small>當 AI 輸出 &lt;think&gt; 區塊時自動出現</small></div>';
            return;
        }
        body.innerHTML = entries.map((e, i) => entryHtml(e, i, entries.length)).join('');
    }

    function syncBadge() {
        if (!_toggle || !_badge) return;
        const n = entries.length;
        if (n > 0) {
            _toggle.classList.add('has-content');
            _badge.style.display = 'block';
            _badge.textContent = n > 9 ? '9+' : n;
        } else {
            _toggle.classList.remove('has-content');
            _badge.style.display = 'none';
        }
    }

    // ── Open / Close ──────────────────────────────────────────────────
    function openPanel() {
        if (!_panel) { tryMount(); setTimeout(openPanel, 500); return; }
        isOpen = true;
        _panel.classList.add('open');
        if (_toggle) _toggle.classList.add('open');
        renderEntries();
    }
    function closePanel() {
        isOpen = false;
        if (_panel) _panel.classList.remove('open');
        if (_toggle) _toggle.classList.remove('open');
    }
    function toggle() { isOpen ? closePanel() : openPanel(); }

    function clearAll() {
        entries = [];
        _ctx = null;
        saveToStorage();
        syncBadge();
        renderEntries();
        closePanel();
    }

    // ── launchApp（供 SYS 選單的全屏模式）────────────────────────────
    function launchApp(container) {
        const doc = container.ownerDocument || document;
        injectCSS(doc);
        container.innerHTML = `
            <div class="think-launch-wrap">
                <div class="think-launch-head">
                    <span class="think-launch-back pm-back-btn">‹</span>
                    <span class="think-launch-title">💭 AI 思考過程</span>
                    <span class="think-launch-clr" id="think-launch-clr">清空</span>
                </div>
                <div class="think-launch-body" id="think-launch-body"></div>
            </div>
        `;
        const body = container.querySelector('#think-launch-body');
        renderLaunch(body);
        container.querySelector('#think-launch-clr').onclick = function() {
            clearAll();
            renderLaunch(body);
        };
    }

    // ── Public API ────────────────────────────────────────────────────
    win.OS_THINK = {
        /**
         * 在 API 呼叫前設定 context，讓 push() 知道是哪個面板、用戶輸入什麼
         * @param {{ panel: string, userInput?: string }} ctx
         */
        setContext(ctx) { _ctx = ctx || null; },

        /**
         * 推入思考記錄（由 os_api_engine.cleanRawOutput 自動呼叫）
         * 帶入當前 _ctx（panel + userInput）一起存檔
         * @param {string} content - <think> 內容
         * @param {string} [rawOutput] - AI 完整原始輸出（選填）
         */
        push(content, rawOutput) {
            if (!content || !String(content).trim()) return;
            if (!mounted) tryMount();
            const entry = {
                content:   String(content).trim(),
                rawOutput: rawOutput ? String(rawOutput).trim() : '',
                time:      formatTime(new Date()),
                timestamp: Date.now(),
                panel:     _ctx?.panel     || '',
                userInput: _ctx?.userInput || ''
            };
            entries.unshift(entry);
            if (entries.length > MAX_ENTRIES) entries.pop();
            saveToStorage();
            syncBadge();
            if (isOpen) renderEntries();
        },
        clear: clearAll,
        open:  openPanel,
        close: closePanel,
        toggle,
        launchApp,          // ← 供 control_center.showOsApp 使用
        get hasContent() { return entries.length > 0; },
        /** 取最新一筆思考記錄（給 VN 小窗 / 存檔用） */
        getLatest() { return entries[0] || null; }
    };

    // 啟動重試掛載
    setTimeout(tryMount, 600);
    console.log('[PhoneOS] OS_THINK 模組已載入，等待掛載至 phone frame...');
})();
