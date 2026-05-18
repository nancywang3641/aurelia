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
