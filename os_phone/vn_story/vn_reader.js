// ----------------------------------------------------------------
// [檔案] vn_reader.js — 獨立劇情閱讀器
// 職責：從 OS_DB 直接讀取 VN 章節，不依賴 VN 面板是否啟動。
//       暴露 window.VN_READER.show() 供大廳按鈕直接呼叫。
// ----------------------------------------------------------------
(function () {
    'use strict';

    const win = window.parent || window;
    let _overlay = null;
    let _activeStoryId = '';

    // ── 取得/建立 overlay DOM ─────────────────────────────────────
    function _ensureDOM(mountInto) {
        const container = mountInto
            || document.getElementById('aurelia-phone-screen')
            || document.getElementById('aurelia-embedded-root')
            || document.body;

        // 已建過：若指定了新容器(如手機殼)而目前不在裡面 → 搬過去
        if (_overlay && document.contains(_overlay)) {
            if (mountInto && _overlay.parentElement !== mountInto) mountInto.appendChild(_overlay);
            return _overlay;
        }

        _overlay = document.createElement('div');
        _overlay.id = 'vn-reader-sa';
        _overlay.style.cssText = [
            'position:absolute;inset:0;',
            'background:rgba(6,6,10,0.98);',
            'z-index:200;',
            'display:none;flex-direction:column;',
        ].join('');

        _overlay.innerHTML = `
            <div id="vn-reader-sa-hd" style="display:flex;justify-content:space-between;align-items:center;
                 padding:calc(14px + env(safe-area-inset-top,0px)) 20px 14px;
                 border-bottom:1px solid rgba(212,175,55,0.2);flex-shrink:0;box-sizing:border-box;">
                <div style="color:#d4af37;font-size:1rem;letter-spacing:2px;
                            font-family:'Playfair Display','Noto Serif TC',serif;">
                    <i class="fa-solid fa-book-open vrd-hd-ico"></i> 劇情閱讀器</div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div id="vn-reader-sa-close" class="vrd-hd-icobtn vrd-hd-close">
                        <i class="fa-solid fa-xmark"></i></div>
                </div>
            </div>
            <div id="vn-reader-sa-tabs"
                 style="display:none;flex-shrink:0;gap:2px;padding:8px 14px 0;
                        overflow-x:auto;border-bottom:1px solid rgba(255,255,255,0.05);
                        scrollbar-width:none;"></div>
            <div id="vn-reader-sa-body"
                 style="flex:1;overflow-y:auto;
                        padding:16px 14px calc(100px + env(safe-area-inset-bottom, 0px));
                        display:flex;flex-direction:column;gap:16px;
                        scrollbar-width:thin;scrollbar-color:#222 transparent;"></div>`;

        container.appendChild(_overlay);

        _overlay.querySelector('#vn-reader-sa-close').onclick        = () => VN_READER.hide();

        return _overlay;
    }

    // ⛔ 閱讀器的「大總結」鈕已移除：大總結收斂到「故事日誌 → 故事管理」一處(CTX 那顆是快捷)，
    //    閱讀器專心當正文檢視層。兩版都一樣，不再一邊一個入口。

    // ── 章節摘要標記（換 PRESET 後摘要格式會變，讓使用者自己填）──────
    const SUM_OPEN_KEY  = 'vn_reader_sum_open';
    const SUM_CLOSE_KEY = 'vn_reader_sum_close';
    const SUM_OPEN_DEF  = '<summary>';
    const SUM_CLOSE_DEF = '</summary>';

    function _getSumMarks() {
        let o = '', c = '';
        try { o = localStorage.getItem(SUM_OPEN_KEY)  || ''; } catch (e) {}
        try { c = localStorage.getItem(SUM_CLOSE_KEY) || ''; } catch (e) {}
        o = o.trim(); c = c.trim();
        if (!o || !c) return { open: SUM_OPEN_DEF, close: SUM_CLOSE_DEF, custom: false };
        return { open: o, close: c, custom: (o !== SUM_OPEN_DEF || c !== SUM_CLOSE_DEF) };
    }

    function _rxEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, function (m) { return '\\' + m; }); }

    function _sumRegex(open, close) {
        return new RegExp(_rxEsc(open) + '([\\s\\S]*?)' + _rxEsc(close), 'i');
    }

    // 把「摘要區塊」整個剝掉（自訂標記與預設 <summary> 都剝）——給正文清洗與上下文壓縮共用。
    function _stripSummaryBlocks(text) {
        let s = String(text == null ? '' : text);
        const m = _getSumMarks();
        if (m.custom) {
            try { s = s.replace(new RegExp(_rxEsc(m.open) + '[\\s\\S]*?' + _rxEsc(m.close), 'gi'), ''); } catch (e) {}
        }
        return s.replace(/<summary>[\s\S]*?<\/summary>/gi, '');
    }

    // 拿一段「最新章節原文」來試抓，給設定頁的即時預覽用（兩版各自的來源）。
    async function _sampleContent() {
        if (_readerSorted.length) return _readerSorted[_readerSorted.length - 1].content || '';
        try {
            if ((win.OS_API?.isStandalone?.()) && win.OS_DB?.getAllVnChapters) {
                const sid = win.OS_AVS_ADAPTER?.getStoryId?.() || '';
                const all = (await win.OS_DB.getAllVnChapters()) || [];
                const list = sid ? all.filter(c => c.storyId === sid) : all;
                if (list.length) return list[list.length - 1].content || '';
            } else {
                const msgs = await _fetchFullMessages();
                for (let i = msgs.length - 1; i >= 0; i--) {
                    const t = (msgs[i] && (msgs[i].message || msgs[i].mes)) || '';
                    if (t.indexOf('<content>') >= 0) return t;
                }
            }
        } catch (e) {}
        return '';
    }

    // 給設定頁：拿一對標記去試抓最新一章，回 { state, text }。
    //   state: 'ok' 抓到 / 'empty' 抓到但裡面空的 / 'miss' 抓不到 / 'nosample' 沒有章節可試
    async function _sumTry(open, close) {
        const o = String(open || '').trim() || SUM_OPEN_DEF;
        const c = String(close || '').trim() || SUM_CLOSE_DEF;
        const sample = await _sampleContent();
        if (!sample) return { state: 'nosample', text: '' };
        let m = null;
        try { m = sample.match(_sumRegex(o, c)); } catch (e) {}
        if (!m) return { state: 'miss', text: '' };
        const t = m[1].trim().replace(/<[^>]+>/g, '').trim();
        return t ? { state: 'ok', text: t } : { state: 'empty', text: '' };
    }

    // 抽章節摘要：先用使用者設的標記，抓不到再退回預設 <summary>；都沒有回空字串。
    function _extractSummary(content) {
        if (!content) return '';
        const marks = _getSumMarks();
        let m = null;
        try { m = content.match(_sumRegex(marks.open, marks.close)); } catch (e) {}
        if (!m && marks.custom) {
            try { m = content.match(_sumRegex(SUM_OPEN_DEF, SUM_CLOSE_DEF)); } catch (e) {}
        }
        return m ? m[1].trim().replace(/<[^>]+>/g, '').trim() : '';
    }

    // ── strip VN tags → 純文字 ────────────────────────────────────
    function _strip(text) {
        if (!text) return '';
        let s = text;
        s = s.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, '');
        s = s.replace(/<summary>[\s\S]*?<\/summary>/gi, '');
        // 自訂摘要標記也一起剝掉，免得摘要跟著正文一起顯示
        const _sm = _getSumMarks();
        if (_sm.custom) {
            try { s = s.replace(new RegExp(_rxEsc(_sm.open) + '[\\s\\S]*?' + _rxEsc(_sm.close), 'gi'), ''); } catch (e) {}
        }
        s = s.replace(/<avatar>[\s\S]*?<\/avatar>/gi, '');
        s = s.replace(/<status>[\s\S]*?<\/status>/gi, '');
        const cm = s.match(/<content>([\s\S]*?)<\/content>/i);
        if (cm) s = cm[1];
        else s = s.replace(/<\/?(content)[^>]*>/gi, '');
        s = s.replace(/\[Char\|([^|]+)\|[^|]*\|([^|\]]+)(?:\|[^\]]+)?\]/g, (_, n, d) => `${n.trim()}：${d.trim()}`);
        s = s.replace(/\[Nar\|([^|\]]+)(?:\|[^\]]+)?\]/g, (_, t) => `　　${t.trim()}`);
        s = s.replace(/\[Inner\|[^|]+\|([^|\]]+)(?:\|[^\]]+)?\]/g, (_, t) => `（${t.trim()}）`);
        s = s.replace(/\[(Story|Chapter|Protagonist|Area|BGM|Bg|Trans|Item|SessionEnd|Achievement|Choice|Quest)[^\]]*\]/gi, '');
        s = s.replace(/\[[^\[\]\n]{1,80}\]/g, '');
        s = s.replace(/<[^>]+>/g, '');
        s = s.replace(/\n{3,}/g, '\n\n').trim();
        return s;
    }

    function _toHtml(text) {
        return text
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/\n\n+/g,'</p><p style="margin:0 0 0.8em">')
            .replace(/\n/g,'<br>');
    }

    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function escAttr(s) { return esc(s).replace(/"/g,'&quot;'); }

    // ── 模式偵測：有 TavernHelper 且非 standalone 視為酒館模式 ────
    function _isTavernMode() {
        if (win.OS_API?.isStandalone?.()) return false;
        return !!win.TavernHelper;
    }

    // 完整讀取當前聊天訊息：優先 getChatHistoryDetail(直接讀聊天檔、繞過 lazy-load 窗口、不展開全樓→不卡死)，失敗退回 getChatMessages(窗口版)
    async function _fetchFullMessages() {
        const helper = win.TavernHelper;
        if (!helper) return [];
        try {
            if (helper.getChatHistoryBrief && helper.getChatHistoryDetail) {
                const brief = await helper.getChatHistoryBrief('current');
                const detail = await helper.getChatHistoryDetail(brief);
                if (detail && typeof detail === 'object') {
                    const cid = (win.OS_AVS_ADAPTER?.getCurrentChatId?.() || (helper.getCurrentChatId && helper.getCurrentChatId()) || '');
                    const keys = Object.keys(detail);
                    let key = keys.find(k => k === cid + '.jsonl' || k.replace(/\.jsonl?$/i, '') === cid);
                    if (!key) key = keys.find(k => cid && k.indexOf(cid) === 0);   // 前綴匹配
                    if (!key && keys.length === 1) key = keys[0];
                    const arr = key ? detail[key] : null;
                    if (Array.isArray(arr) && arr.length) return arr;
                }
            }
        } catch (e) { console.warn('[VN_READER] 讀全歷史失敗，退回 getChatMessages:', e?.message || e); }
        try {
            const lastId = helper.getLastMessageId?.();
            if (lastId != null && lastId >= 0) return helper.getChatMessages(`0-${lastId}`) || [];
        } catch (e) { console.error('[VN_READER] getChatMessages 失敗:', e); }
        return [];
    }

    // 拿當前聊天室「出現過的角色」清單(名字+出現次數)：讀全檔(繞 lazy-load)+ parse [Char|名]/[Avatar|名]。
    // 給應用/面板做角色選單用——不靠會延遲的大總結、不靠被懶載窗口的 DOM。
    async function _getCurrentChars() {
        let msgs = [];
        try { msgs = await _fetchFullMessages(); } catch (e) {}
        const count = new Map();
        const re = /\[(?:Char|Avatar)\|([^|\]]+)/g;
        (msgs || []).forEach(function (m) {
            const t = (m && (m.message || m.mes)) || '';
            if (!t) return;
            let mt;
            while ((mt = re.exec(t))) {
                const n = (mt[1] || '').trim();
                if (n && n.charAt(0) !== '{') count.set(n, (count.get(n) || 0) + 1);   // 濾掉 {佔位}
            }
        });
        return Array.from(count, function (kv) { return { name: kv[0], count: kv[1] }; })
            .sort(function (a, b) { return b.count - a.count; });
    }

    // ── 從酒館 TavernHelper 拉訊息，組成統一 chapter 格式 ─────────
    async function _fetchTavernChapters() {
        const allMsgs = await _fetchFullMessages();
        if (!allMsgs.length) return [];

        const chapters = [];
        let chapterIndex = 0;
        let pendingUserText = '';

        allMsgs.forEach(m => {
            // user 訊息：暫存，等下個 assistant 訊息配對成章節的 request
            if (m.role === 'user' || m.is_user === true) {
                pendingUserText = m.message || m.mes || '';
                return;
            }

            const text = m.message || m.mes || '';
            // 過濾沒 <content> 標籤的（純對話/系統訊息）
            if (!text.includes('<content>')) {
                pendingUserText = '';
                return;
            }

            chapterIndex++;
            let chTitle = `對話紀錄 ${chapterIndex}`;
            const chMatch = text.match(/\[Chapter\|(?:\d+\|)?([^\]|]+)\]/i);
            const storyMatch = text.match(/\[Story\|([^\]]+)\]/i);
            if (chMatch) chTitle = chMatch[1].trim();
            else if (storyMatch) chTitle = storyMatch[1].trim();

            // thinking 抽取（兼容 <think> 跟 <thinking>）
            let thinking = '';
            const thMatch = text.match(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/i);
            if (thMatch) thinking = thMatch[1].trim();

            // createdAt
            let createdAt = Date.now();
            if (m.send_date) {
                const t = typeof m.send_date === 'number' ? m.send_date : Date.parse(m.send_date);
                if (!isNaN(t)) createdAt = t;
            }

            chapters.push({
                id: `tv_${m.message_id ?? chapterIndex}`,
                storyId: '__tavern__',
                storyTitle: '當前對話',
                title: chTitle,
                request: pendingUserText,
                content: text,
                thinking: thinking,
                createdAt: createdAt
            });

            pendingUserText = '';
        });

        return chapters;
    }

    // 章節資料快取（給 _openChapter 用 index 取全文）
    let _readerSorted = [];
    let _readerBody = null;
    let _readerQuery = '';     // 搜尋關鍵字（返回章節列表時保留）
    let _readerFlow  = false;  // false=一章一張卡，true=整本攤成一頁連著讀

    // 純文字/摘要各算一次就存在章節物件上：搜尋是逐鍵重算的，章節多的時候不能每次都重跑 _strip
    function _chPlain(ch)   { if (ch._plain == null) ch._plain = _strip(ch.content || ''); return ch._plain; }
    function _chSummary(ch) { if (ch._sum   == null) ch._sum   = _extractSummary(ch.content || '') || ''; return ch._sum; }
    function _chHit(ch, q) {
        if (!q) return true;
        return String(ch.title || '').toLowerCase().includes(q)
            || _chSummary(ch).toLowerCase().includes(q)
            || _chPlain(ch).toLowerCase().includes(q);
    }
    function _nlToBr(s) { return esc(s).replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>'); }

    function _cardHtml(ch, i) {
        const sum = _chSummary(ch) || _chPlain(ch);
        const cut = sum.slice(0, 100) + (sum.length > 100 ? '…' : '');
        const ts  = ch.createdAt ? new Date(ch.createdAt).toLocaleDateString('zh-TW') : '';
        return `<div class="vrd-card" onclick="window.VN_READER._openChapter(${i})">
            <div class="vrd-card-hd">
                <span class="vrd-card-no">CH.${String(i+1).padStart(2,'0')}</span>
                <span class="vrd-card-title">${esc(ch.title || '未命名章節')}</span>
                <span class="vrd-card-time">${ts}</span>
            </div>
            <div class="vrd-card-summary">${cut.trim() ? _nlToBr(cut) : '<span class="vrd-dim">（無摘要）</span>'}</div>
            <div class="vrd-card-readmore">點此看全文 →</div>
        </div>`;
    }
    function _flowHtml(ch, i) {
        const txt = _chPlain(ch);
        return `<div class="vrd-flow">
            <div class="vrd-flow-hd">
                <span class="vrd-card-no">CH.${String(i+1).padStart(2,'0')}</span>
                <span class="vrd-card-title">${esc(ch.title || '未命名章節')}</span>
                <span class="vrd-hd-btn" onclick="window.VN_READER._openChapter(${i})">單章</span>
            </div>
            <div class="vrd-flow-body">${txt.trim() ? _toHtml(txt) : '<span class="vrd-dim">（無內容）</span>'}</div>
        </div>`;
    }

    function _paintList() {
        const wrap = document.getElementById('vrd-list');
        if (!wrap) return;
        const q = _readerQuery.trim().toLowerCase();
        const hits = _readerSorted.map((ch, i) => ({ ch, i })).filter(o => _chHit(o.ch, q));
        const cnt = document.getElementById('vrd-count');
        if (cnt) cnt.textContent = q
            ? (hits.length ? `找到 ${hits.length} 章` : '沒有符合的章節')
            : `共 ${_readerSorted.length} 章`;
        if (!hits.length) { wrap.innerHTML = '<div class="vrd-empty">換個字再找找看。</div>'; return; }
        wrap.innerHTML = _readerFlow
            ? hits.map(o => _flowHtml(o.ch, o.i)).join('')
            : '<div class="vrd-cards">' + hits.map(o => _cardHtml(o.ch, o.i)).join('') + '</div>';
    }

    // ── 渲染章節列表：上面一條搜尋＋閱讀方式，下面卡片或連續內文 ──────
    function _renderChapters(chapters, body) {
        const sorted = [...chapters].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        _readerSorted = sorted; _readerBody = body;
        if (!sorted.length) {
            body.innerHTML = '<div class="vrd-empty">此故事還沒有章節記錄。</div>';
            return;
        }
        body.innerHTML = `
            <div class="vrd-tools">
                <div class="vrd-search">
                    <i class="fa-solid fa-magnifying-glass vrd-search-ico" aria-hidden="true"></i>
                    <input id="vrd-q" class="vrd-search-input" type="text" placeholder="找一段內容或章節名" value="${escAttr(_readerQuery)}">
                </div>
                <button class="vrd-mode-btn" id="vrd-mode" type="button">
                    <i class="fa-solid ${_readerFlow ? 'fa-align-left' : 'fa-table-cells-large'}" aria-hidden="true"></i>
                    <span>${_readerFlow ? '連著讀' : '一章一張'}</span>
                </button>
            </div>
            <div class="vrd-count" id="vrd-count"></div>
            <div id="vrd-list"></div>`;
        const q = body.querySelector('#vrd-q');
        if (q) {
            let t = null;
            q.oninput = () => { clearTimeout(t); t = setTimeout(() => { _readerQuery = q.value; _paintList(); }, 150); };
        }
        const m = body.querySelector('#vrd-mode');
        if (m) m.onclick = () => { _readerFlow = !_readerFlow; _renderChapters(_readerSorted, body); };
        _paintList();
        body.scrollTop = 0;
    }

    // ── 點進某章 → 看全文（master-detail）──────────────────────────
    function _openChapter(i) {
        const body = _readerBody || document.getElementById('vn-reader-sa-body');
        const ch = _readerSorted[i];
        if (!body || !ch) return;
        const id        = ch.id || `ch_${i}`;
        const content   = ch.content || '';
        const novelText = `<p style="margin:0">${_toHtml(_strip(content))}</p>`;
        const rawText   = esc(content);
        // thinking 優先用存起來的欄位；舊章節只把 <think> 寫在正文裡沒有這個欄位 → 現場抽一次，
        //   不然那段會被 _strip 清掉、在閱讀器裡整段消失。
        let _think = ch.thinking || '';
        if (!_think) { const _tm = content.match(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/i); if (_tm) _think = _tm[1].trim(); }
        const thinkText = esc(_think);
        const userText  = ch.request ? esc(ch.request) : '';
        const ts        = ch.createdAt ? new Date(ch.createdAt).toLocaleString('zh-TW') : '';
        const userBlock = userText ? `<div class="vn-reader-msg user"><div class="vn-reader-label"><i class="fa-solid fa-user" aria-hidden="true"></i> 我說的</div><div class="vn-reader-bubble">${userText}</div></div>` : '';
        const thinkBlock = thinkText ? `<div class="vn-reader-think-wrap" id="vrth-${id}"><div class="vn-reader-think-hd" onclick="window.VN_READER._thinkToggle('${id}')"><i class="fa-solid fa-chevron-right rth-arrow" aria-hidden="true"></i><span>思考了一段時間</span></div><div class="vn-reader-think-body">${thinkText}</div></div>` : '';

        // 摘要與「這章開始時的數值」：PWA 的章節本來就存著，以前沒地方看 —— 檢查劇情對不對得上就靠這兩塊
        const sumText = _chSummary(ch);
        const sumBlock = sumText.trim() ? _foldHtml(`vrsum-${id}`, 'fa-align-left', '這章的摘要', _nlToBr(sumText)) : '';
        const st = ch.avsStateBefore;
        let stBlock = '';
        if (st && typeof st === 'object' && Object.keys(st).length) {
            const rows = Object.keys(st).map(k => {
                const v = st[k];
                const txt = (v && typeof v === 'object') ? JSON.stringify(v) : String(v);
                return `<div class="vrd-kv"><span class="vrd-kv-k">${esc(k)}</span><span class="vrd-kv-v">${esc(txt)}</span></div>`;
            }).join('');
            stBlock = _foldHtml(`vrst-${id}`, 'fa-sliders', '這章開始時的數值', rows);
        }

        body.innerHTML = `
            <div class="vrd-detail-bar">
                <button class="vrd-back-btn" onclick="window.VN_READER._backToCards()"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> 返回章節</button>
                <span class="vrd-detail-title">CH.${String(i+1).padStart(2,'0')}　${esc(ch.title || '')}</span>
                <button class="vn-reader-act-btn" onclick="window.VN_READER._toggle('${id}',this)"><i class="fa-solid fa-code" aria-hidden="true"></i> 原始文字</button>
            </div>
            <div class="vrd-detail-time">${ts}</div>
            ${userBlock}
            ${thinkBlock}
            ${sumBlock}
            ${stBlock}
            <div class="vn-reader-bubble novel-view" id="vrb-novel-${id}">${novelText || '<span class="vrd-dim">（無內容）</span>'}</div>
            <div class="vn-reader-bubble raw-view" id="vrb-raw-${id}">${rawText}</div>`;
        body.scrollTop = 0;
    }
    // 通用摺疊區塊（摘要／數值共用，長相跟既有的「思考了一段時間」同一套）
    function _foldHtml(id, icon, label, innerHtml) {
        return `<div class="vrd-fold" id="${id}">
            <div class="vrd-fold-hd" onclick="window.VN_READER._foldToggle('${id}')">
                <i class="fa-solid fa-chevron-right vrd-fold-arrow" aria-hidden="true"></i>
                <i class="fa-solid ${icon} vrd-fold-ico" aria-hidden="true"></i>
                <span>${label}</span>
            </div>
            <div class="vrd-fold-body">${innerHtml}</div>
        </div>`;
    }
    function _backToCards() {
        if (_readerBody && _readerSorted.length) _renderChapters(_readerSorted, _readerBody);
    }

    // ── 公開 API ──────────────────────────────────────────────────
    const VN_READER = {

        clean: _strip,   // VN 格式 → 純小說正文(抽 <content>、[Char]→「名：台詞」、去所有 VN 標籤)；給 app 上下文清洗共用
        // 🚨 摘要標記是「唯一真相」：Rae 會照別人家 preset 改摘要標籤(<meow_FM>、<draft>…)，
        //   所以誰要抓摘要都得走這兩支，別再各自寫死 /<summary>…<\/summary>/。
        //   寫死的後果是靜默的：上下文壓縮抓不到就把那章壓成空字串＝整章從歷史消失。
        sumExtract: _extractSummary,        // 章節原文 → 摘要純文字(抓不到回 '')
        sumStrip: _stripSummaryBlocks,      // 章節原文 → 剝掉摘要區塊後的文字
        sumMarks: _getSumMarks,             // 目前設的標記 { open, close, custom }
        sumTry: _sumTry,                    // 設定頁的「試抓」預覽：拿一對標記去抓最新一章
        sumDefaults: () => ({ open: SUM_OPEN_DEF, close: SUM_CLOSE_DEF }),
        fetchFullChat: _fetchFullMessages,   // 完整讀當前聊天(讀檔繞 lazy-load、不展開不卡死)；給大總結等共用
        getCurrentChars: _getCurrentChars,   // 當前聊天室出現過的角色 [{name,count}]；給 app/面板做角色選單(繞懶載、不等總結)

        async show(mountInto) {
            const overlay = _ensureDOM(mountInto);
            overlay.style.display = 'flex';

            const body   = overlay.querySelector('#vn-reader-sa-body');
            const tabsEl = overlay.querySelector('#vn-reader-sa-tabs');

            body.innerHTML = '<div style="text-align:center;color:#333;font-size:0.82rem;padding:40px;">載入中...</div>';

            // 🔥 酒館模式：從 TavernHelper 拿當前 chat 訊息
            if (_isTavernMode()) {
                const chapters = await _fetchTavernChapters();
                if (!chapters.length) {
                    body.innerHTML = '<div style="text-align:center;color:#333;font-size:0.82rem;padding:40px;line-height:1.6;">當前聊天無含 &lt;content&gt; 標籤的章節<br><span style="font-size:0.78rem;color:#444;">(需要 AI 用 VN 格式回覆才會被識別)</span></div>';
                    tabsEl.style.display = 'none';
                    return;
                }
                tabsEl.style.display = 'none';
                _activeStoryId = '__tavern__';
                _renderChapters(chapters, body);
                return;
            }

            // PWA 模式：從 OS_DB 拿章節
            let allChapters = [];
            try { allChapters = await (win.OS_DB?.getAllVnChapters?.() || []); } catch(e) {}

            if (!allChapters.length) {
                body.innerHTML = '<div style="text-align:center;color:#333;font-size:0.82rem;padding:40px;">尚無章節記錄</div>';
                return;
            }

            // 按 storyId 分組
            const groups = {};
            allChapters.forEach(ch => {
                const gid = ch.storyId || '__legacy__';
                if (!groups[gid]) groups[gid] = { storyTitle: ch.storyTitle || '舊版資料', storyId: ch.storyId || '', chapters: [] };
                groups[gid].chapters.push(ch);
            });
            const sorted = Object.values(groups).sort((a, b) => {
                const aMax = Math.max(...a.chapters.map(c => c.createdAt || 0));
                const bMax = Math.max(...b.chapters.map(c => c.createdAt || 0));
                return bMax - aMax;
            });

            const currentId = win.VN_Core?._currentStoryId || localStorage.getItem('vn_current_story_id') || '';
            let active = sorted.find(g => g.storyId && g.storyId === currentId) || sorted[0];
            _activeStoryId = active.storyId || '';

            // 建 Tab 列
            tabsEl.innerHTML = '';
            if (sorted.length > 1) {
                tabsEl.style.display = 'flex';
                sorted.forEach(group => {
                    const tab = document.createElement('div');
                    tab.className = 'vn-reader-tab' + (group === active ? ' active' : '');
                    tab.textContent = group.storyTitle;
                    tab.onclick = () => {
                        tabsEl.querySelectorAll('.vn-reader-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        _activeStoryId = group.storyId || '';
                        _renderChapters(group.chapters, body);
                    };
                    tabsEl.appendChild(tab);
                });
            } else {
                tabsEl.style.display = 'none';
            }

            _renderChapters(active.chapters, body);
        },

        hide() {
            if (_overlay) _overlay.style.display = 'none';
        },

        // ⛔ 大總結的檢視/編輯已搬到「故事日誌 → 故事管理」(os_story_tools 的獨立版分支)：
        //    以前 CTX、這裡、VN 內建舊閱讀器三個地方各有一顆大總結鈕，改成一處。

        // ⛔ 閱讀器設置已搬到「劇情設置 → 摘要標記」，跟「保留最近幾章全文」放在一起：
        //    那兩格是同一件事的兩半(一個定義摘要長怎樣、一個決定何時用摘要)，分兩個地方找不到。

        // ── 內部輔助（供 onclick 呼叫）────────────────────────────
        _thinkToggle(id) {
            document.getElementById(`vrth-${id}`)?.classList.toggle('open');
        },
        _foldToggle(id) {
            document.getElementById(id)?.classList.toggle('open');
        },
        // 切換小說 ↔ 原始 tag（互斥顯示，不展開在底部）
        _toggle(id, btn) {
            const novel = document.getElementById(`vrb-novel-${id}`);
            const raw   = document.getElementById(`vrb-raw-${id}`);
            if (!novel || !raw) return;
            const showRaw = !raw.classList.contains('active');
            raw.classList.toggle('active', showRaw);
            novel.classList.toggle('hidden', showRaw);
            btn.classList.toggle('active', showRaw);
            btn.innerHTML = showRaw
                ? '<i class="fa-solid fa-book-open" aria-hidden="true"></i> 看小說'
                : '<i class="fa-solid fa-code" aria-hidden="true"></i> 原始文字';
        },
        // 章節選擇卡片 → 看全文 / 返回章節
        _openChapter,
        _backToCards,

    };

    win.VN_READER = VN_READER;
    console.log('[PhoneOS] 獨立閱讀器模組 (vn_reader.js) 已載入');
})();
