/**
 * os_phone/vn_story/vn_end_brief.js — 章末簡報卡（2026-11-08）
 *
 * 一章播完、這個世界沒有自己的章末面板時，#vn-end-basic 變成一張簡報卡：
 *   章名、時間地點、「這一章」三句、小牌子（新線索／下一件行程／狀態變化／角色卡畫面）、繼續、五個入口、角落的重新生成。
 * 11-09 起「一頁看完」：線索、今天的行程、狀態變化、日誌在卡片旁邊那一欄（#vn-end-side）打開，不跳窗；
 *   角色卡作者做的畫面（小劇場、結語、卡片的狀態欄）不塞進欄裡，「角色卡畫面」小牌子整頁開資料中心那一頁、照原樣。
 * 11-13 起「繼續」也在這一欄打開（她：「選擇器直接崁入到繼續按鈕裡好了，感覺也沒必要分開」）：
 *   上面是這一章的選項卡（正則把 <branches> 畫成的那張，例如帶插圖的選擇器），整張搬過來、直接展開；
 *   沒有選項卡就列出 <branches> 那幾個選項；底下一條輸入框，點選項填進去、按發送就送出。
 *   選項卡搬進來以後，「角色卡畫面」小牌子不再列它。
 * 這支只負責「把字填進去」：
 *   骨架在 vn_styles.js（#vn-end-basic 那段）、樣式在 css/vn_styles.css（「章末簡報」那段）、
 *   每顆按鈕做什麼在 vn_core.js 章末那段的 acts（這裡的小牌子也是借那份，不另寫開 app 的邏輯）。
 * 小樣在本機 參考資料/VN_END_LAB.html。必須排在 vn_core.js 後面載入。
 *
 * 資料從哪來（都是現成的，這裡不存任何東西）：
 *   章名     這一章劇本 <ChapterCard> 裡的 [Chapter|號|名]、[Story|…]（跟章節卡同一份）
 *   時間     OS_MC_STATUS 的故事日期與時刻（「主角狀態」關掉就不顯示）
 *   地點     最後一個場景的名字（VN_Core._sceneName，場景牌上那行）
 *   這一章   VN_READER.sumExtract：AI 有寫摘要才有，沒寫整塊不出現
 *   新線索   OS_STORY_THREADS.unseenCount：最新一章冒出來、還沒打開線索頁看過的
 *   下一件   OS_MC_STATUS.upcoming 的第一件
 *   CTX      VN_CtxMonitor.quickPct：上一次送出去的量 ÷ 自己設的警戒上限
 */
(function () {
    'use strict';
    const win = window.parent || window;

    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let _seq = 0;          // 每填一次加一：非同步讀回來時，已經換到下一章就不寫
    let _acts = null;      // vn_core 章末那組行為
    // 小牌子要的東西（線索數字、狀態變化變了重畫時，其他幾塊照留）：新線索幾條、下一件行程、狀態變化幾項、角色卡作者做的幾頁
    let _tile = { nNew: 0, ev: null, nChg: 0, cards: [] };
    let _sideKey = '';     // 旁邊那一欄現在開的是哪一頁（'' ＝收著）
    let _sideSeq = 0;      // 每換一頁加一：非同步讀回來時已經換頁／收起來就不寫
    let _opts = [];        // 這一章的選項（<branches> 那幾行；網頁版先看播放器收好的那份）
    let _goOff = null;     // 「繼續」那頁掛在酒館輸入框上的監聽，換頁／收起來要拆

    function _standalone() { return win.OS_API?.isStandalone?.() ?? false; }

    function _root() { return document.getElementById('vn-end-basic'); }
    function _alive(n) { const r = _root(); return n === _seq && !!r && r.classList.contains('vne-brief'); }

    // 章名：先用這章播過的章節卡，沒播到（例如直接跳到末尾）就自己掃一次劇本
    function _chapterOf(core) {
        let d = core && core._ccData;
        if (!d && core && Array.isArray(core.script) && typeof core._collectChapterCard === 'function') {
            const i = core.script.findIndex(l => /^<ChapterCard>$/i.test(l));
            if (i >= 0) { try { d = core._collectChapterCard(i); } catch (e) {} }
        }
        d = d || {};
        const num = String(d.num || '').trim();
        const kicker = /^\d+$/.test(num) ? 'Chapter ' + (num.length < 2 ? '0' + num : num) : num;
        return { kicker: kicker, title: String(d.title || d.story || '').trim(), where: String(d.where || '').trim() };
    }

    // 摘要區塊裡只有標題的那幾行（11-09：她的正文把摘要包成摺疊，摺疊的標題「🌀摘要」和底下的小標「【摘要】」
    //   被當成三句裡的兩句印出來）。拿掉表情符號、括號、冒號之後只剩「摘要／總結／概要…」的，整行不要；
    //   小標跟內容寫在同一行（「【摘要】應子騫…」「摘要：…」）的，只剝掉前面那截
    const SUM_WORD = '(?:本章|本回|這一章|这一章|本話|本话)?(?:摘要|總結|总结|概要|提要|梗概|小結|小结|回顧|回顾|大綱|大纲|summary)';
    const _pic = /[☀-➿️‍]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]/g;
    const _labelOnly = new RegExp('^' + SUM_WORD + '$', 'i');
    const _labelHead = new RegExp('^(?:[【\\[〔「『(（<《]\\s*' + SUM_WORD + '\\s*[】\\]〕」』)）>》]|' + SUM_WORD + '\\s*[:：])\\s*', 'i');
    function _dropLabel(line) {
        const s = String(line || '').replace(_pic, '').trim();
        if (_labelOnly.test(s.replace(/[\s【】[\]〔〕「」『』()（）<>《》:：*#=\-—_~|]/g, ''))) return '';
        return s.replace(_labelHead, '').trim();
    }

    // 這一章：摘要拆成最多三句（AI 多半一行一句；寫成一整段就照句號切）
    function _sumLines(core) {
        const R = win.VN_READER || window.VN_READER;
        const raw = (core && core._scriptRawText) || '';
        if (!R || typeof R.sumExtract !== 'function' || !raw) return [];
        let t = '';
        try { t = R.sumExtract(raw) || ''; } catch (e) {}
        if (!t) return [];
        const clean = s => s.replace(/^\s*(?:[-*•・]|\d+\s*[.、)）]|[①-⑩])\s*/, '').trim();
        const rows = t.split(/\n+/).map(_dropLabel).map(clean).filter(Boolean);
        let parts = rows;
        // 🚨 別用 (?<=…) 往回看：iOS 16.4 以前的 Safari 不認得，整支檔案會載不起來
        if (parts.length < 2) parts = rows.join('').replace(/([。！？!?])/g, '$1\n').split('\n').map(clean).filter(Boolean);
        return parts.slice(0, 3).map(s => {
            s = s.replace(/[。．.]$/, '');
            return s.length > 60 ? s.slice(0, 59) + '…' : s;
        });
    }

    function _status() { return win.OS_MC_STATUS || window.OS_MC_STATUS; }

    async function _statusNow() {
        const M = _status();
        if (!M || typeof M.load !== 'function') return null;
        if (typeof M.isOn === 'function' && !M.isOn()) return null;
        try { return await M.load(); } catch (e) { return null; }
    }

    function _nextEvent(st) {
        const M = _status();
        if (!M || !st || typeof M.upcoming !== 'function') return null;
        let list = [];
        try { list = M.upcoming(st) || []; } catch (e) {}
        const e = list[0];
        if (!e || !e.title) return null;
        let day = '';
        if (e.date) {
            const dd = (st.date && M.dayDiff) ? M.dayDiff(st.date, e.date) : null;
            day = dd === 0 ? '今天' : (dd === 1 ? '明天' : M.fmtDate(e.date));
        }
        return { when: (day + (e.time ? ' ' + e.time : '')).trim(), title: String(e.title) };
    }

    async function _newClues() {
        const T = win.OS_STORY_THREADS || window.OS_STORY_THREADS;
        if (!T || typeof T.unseenCount !== 'function') return 0;
        try { return (await T.unseenCount()) || 0; } catch (e) { return 0; }
    }

    // 這一章的選項：<branches> 裡真正給人點的那幾行（拆法跟 vn_core loadScript 那段一樣：
    //   選項插圖卡的 <panels>（角色外觀＋每格分鏡）、摺疊的 <summary> 標題、整行只有標籤的都不算；開頭的「A.」拿掉）
    function _branchOpts(core) {
        const raw = String((core && core._scriptRawText) || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
        const m = raw.match(/<branches>([\s\S]*?)<\/branches>/i);
        if (!m) return [];
        return m[1].replace(/<panels>[\s\S]*?<\/panels>/gi, '').replace(/<summary>[\s\S]*?<\/summary>/gi, '')
            .split('\n').map(l => l.trim()).filter(Boolean)
            .filter(l => !/^<\/?[A-Za-z][\w-]*[^>]*>$/.test(l))
            .map(l => l.replace(/<br\s*\/?>/gi, '').replace(/^\[Choice\|([\s\S]*)\]$/, '$1')
                .replace(/^(?:[A-Ha-h][.．、:：]|[0-9]+[.．、]|[-*•])\s*/, '').trim())
            .filter(Boolean);
    }
    // 網頁版播放器播到選項會先收好一份（_pendingChoices），有就用那份；酒館播放器不收，照原文拆
    function _choiceOpts(core) {
        if (_standalone()) {
            const A = window.VN_StandaloneArchive;
            if (A && Array.isArray(A._pendingChoices) && A._pendingChoices.length) return A._pendingChoices.map(String);
        }
        return _branchOpts(core);
    }
    // 角色卡作者做的哪一頁是「選項卡」：頁面原文裡找得到這一章的選項（兩個以上；只有一個選項就一個）
    const _nz = s => String(s == null ? '' : s).replace(/\s+/g, '');
    function _isPicker(text, opts) {
        if (!text || !opts || !opts.length) return false;
        const T = _nz(text);
        let hit = 0;
        opts.forEach(o => { const k = _nz(o).slice(0, 12); if (k.length >= 4 && T.indexOf(k) >= 0) hit++; });
        return hit >= Math.min(2, opts.length);
    }

    async function _ctxPct() {
        const C = win.VN_CtxMonitor || window.VN_CtxMonitor;
        if (!C || typeof C.quickPct !== 'function') return null;
        try { return await C.quickPct(); } catch (e) { return null; }
    }

    function _renderHead(root, ch, when, where) {
        const meta = [];
        if (when) meta.push('<span><i class="fa-regular fa-clock"></i>' + esc(when) + '</span>');
        if (where) meta.push('<span><i class="fa-solid fa-location-dot"></i>' + esc(where) + '</span>');
        root.querySelector('.vne-kicker').textContent = ch.kicker;
        root.querySelector('.vne-title').textContent = ch.title;
        root.querySelector('.vne-meta').innerHTML = meta.join('');
        root.querySelector('.vne-head').classList.toggle('vne-off', !ch.kicker && !ch.title && !meta.length);
    }

    // 小牌子：新線索、下一件行程、狀態變化在旁邊那一欄打開；角色卡畫面整頁開資料中心那一頁（作者做的東西照原樣，不塞進欄裡）
    function _renderTiles(root) {
        const box = root.querySelector('.vne-tiles');
        if (!box) return;
        const t = _tile, list = [];
        if (t.nNew > 0) list.push({ k: 'threads', ic: 'fa-solid fa-diagram-project', badge: t.nNew, lb: '新線索', v: t.nNew + ' 條還沒看' });
        if (t.ev) list.push({ k: 'today', ic: 'fa-regular fa-calendar', lb: '下一件行程', v: [t.ev.when, t.ev.title].filter(Boolean).join('・') });
        if (t.nChg > 0) list.push({ k: 'changes', ic: 'fa-solid fa-chart-simple', lb: '狀態變化', v: t.nChg + ' 項' });
        if (t.cards.length) list.push({ k: 'card', ic: 'fa-solid fa-masks-theater', lb: '角色卡畫面', v: t.cards.map(c => c.title).join('・'), page: true });
        box.innerHTML = list.map(x => '<button type="button" class="vne-tile' + (x.k === 'card' ? ' vne-tile-card' : '') + (x.k === _sideKey ? ' vne-on' : '') + '" data-vne="' + x.k + '">'
            + '<span class="vne-orb"><i class="' + x.ic + '"></i>' + (x.badge ? '<span class="vne-badge">' + x.badge + '</span>' : '') + '</span>'
            + '<span class="vne-tile-txt"><span class="vne-tile-k">' + x.lb + '</span><span class="vne-tile-v">' + esc(x.v) + '</span></span>'
            + '<i class="fa-solid ' + (x.page ? 'fa-up-right-from-square' : 'fa-chevron-right') + '"></i></button>').join('');
        box.classList.toggle('vne-tiles-grid', list.length >= 3);
        box.querySelectorAll('[data-vne]').forEach(b => { b.onclick = () => _tileClick(b.dataset.vne); });
        root.classList.toggle('vne-has-new', t.nNew > 0);
        if (_sideKey) _measure();   // 小牌子變多變少＝卡片變高變矮，旁邊那欄跟著
    }
    function _tileClick(k) {
        if (k === 'card') { const f = _acts && _acts.card; if (typeof f === 'function') f(); return; }
        if (_briefOn()) { openSide(k); return; }
        const f = _acts && _acts[k === 'today' ? 'calendar' : k];
        if (typeof f === 'function') f();
    }

    // ── 簡報卡旁邊那一欄（11-09 她選「旁邊多一欄」，小樣在本機 參考資料/VN_END_ONEGO_LAB.html）──
    //   寬的畫面：卡片往左讓、右邊多一欄；窄的畫面：卡片縮成一條（章名＋繼續），這欄拿上面整塊。長相全在 css/vn_styles.css。
    //   線索那頁就是正式的線索頁（OS_STORY_THREADS.mountInto），新線索演出照舊在這裡播；今天的行程借日曆那張小卡（OS_CALENDAR.todayInto）；
    //   狀態變化借「本輪更新」那份（OS_AVS.updList）；日誌是這個故事最近幾次大總結的結語（OS_DB.getLobbySummaryForPrompt）。
    function _side() { return document.getElementById('vn-end-side'); }
    function _briefOn() { const r = _root(); return !!r && r.classList.contains('vne-brief'); }
    function _threads() { return win.OS_STORY_THREADS || window.OS_STORY_THREADS; }
    const SIDE_MARK = { threads: ['#vn-end-btn-threads', '.vne-tile[data-vne="threads"]'], today: ['.vne-tile[data-vne="today"]'],
        changes: ['.vne-tile[data-vne="changes"]'], journal: ['#vn-end-btn-journal'], go: ['#vn-end-btn-go'] };
    function _markOn(key) {
        const root = _root();
        if (!root) return;
        root.querySelectorAll('.vne-on').forEach(n => n.classList.remove('vne-on'));
        (SIDE_MARK[key] || []).forEach(sel => root.querySelectorAll(sel).forEach(n => n.classList.add('vne-on')));
    }
    // 卡片多高＝這欄多高（寬的時候並排一樣高；窄的時候卡片那條上面全給這欄）。只能是量出來的數，所以寫在變數上
    function _measure() {
        const root = _root(), side = _side();
        if (root && side) side.style.setProperty('--vne-card-h', root.offsetHeight + 'px');
    }
    // 線索頁是同一份（資料中心的線索分頁也掛它）：只拆還掛在這欄裡的那份
    function _dropThreads(side) {
        const T = _threads();
        if (side && side.querySelector('.sthr-embed') && T && typeof T.closePanel === 'function') { try { T.closePanel(); } catch (e) {} }
    }
    const _sh = (t, s) => '<div class="vne-sh"><span class="vne-sh-t">' + esc(t) + '</span>' + (s ? '<span class="vne-sh-s">' + esc(s) + '</span>' : '') + '</div>';
    const _more = (act, label) => '<button type="button" class="vne-side-more" data-vne-act="' + act + '">' + esc(label) + '<i class="fa-solid fa-chevron-right"></i></button>';
    const _wait = (t, msg) => _sh(t) + '<div class="vne-sc"><div class="vne-empty">' + esc(msg) + '</div></div>';
    const SIDE_FILL = {
        async threads(body) {
            const T = _threads();
            if (!T || typeof T.mountInto !== 'function') { body.innerHTML = _wait('線索', '線索還在載入，等一下再按'); return; }
            await T.mountInto(body);
        },
        async today(body) {
            const C = win.OS_CALENDAR || window.OS_CALENDAR;
            if (!C || typeof C.todayInto !== 'function') { body.innerHTML = _wait('今天的行程', '日曆還在載入，等一下再按'); return; }
            await C.todayInto(body);
        },
        changes(body) {
            const A = win.OS_AVS || window.OS_AVS;
            const u = (A && typeof A.updList === 'function') ? A.updList() : { n: 0, rows: [], empty: '狀態欄還在載入，等一下再按' };
            body.innerHTML = _sh('這一章的狀態變化', u.n ? u.n + ' 項' : '') + '<div class="vne-sc">'
                + (u.n ? u.rows.map(r => '<div class="vne-chg"><span class="vne-chg-k">' + esc(r.k) + '</span><span class="vne-chg-v">' + esc(r.v) + '</span></div>').join('')
                       : '<div class="vne-empty">' + esc(u.empty || '這一章沒有變化') + '</div>')
                + _more('avs', '完整的狀態欄在資料中心') + '</div>';
        },
        async journal(body, seq) {
            body.innerHTML = _wait('日誌', '讀取中…');
            let story = null;
            try {
                const db = win.OS_DB || window.OS_DB, ST = win.OS_STORY_TOOLS || window.OS_STORY_TOOLS;
                const id = (ST && typeof ST.getChatId === 'function') ? ST.getChatId() : '';
                const all = (db && typeof db.getLobbySummaryForPrompt === 'function') ? await db.getLobbySummaryForPrompt(3) : [];
                story = (all || []).find(s => s && id && s.chatId === id) || null;
            } catch (e) {}
            if (seq !== _sideSeq || !body.isConnected) return;
            const day = ts => { if (!ts) return ''; const d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate(); };
            const briefs = story ? (story.briefs || []).filter(b => b && b.brief) : [];
            body.innerHTML = _sh('日誌', story ? (story.storyTitle || story.cardName || '') : '') + '<div class="vne-sc">'
                + (briefs.length ? briefs.map(b => '<div class="vne-jr"><div class="vne-jr-d">' + esc(day(b.ts)) + '</div><div class="vne-jr-t">' + esc(b.brief) + '</div></div>').join('')
                                 : '<div class="vne-empty">這個故事還沒有日誌<small>做過大總結，這裡就會有一段一段的回顧</small></div>')
                + _more('journal', '看全部日誌') + '</div>';
        },
        // 「繼續」：選項卡（或選項）＋輸入框。點選項＝填進輸入框，按發送才送出（跟資料中心那頁一樣，可以改了再送）
        async go(body, seq) {
            const opts = _opts.slice();
            const pwa = _standalone();
            body.innerHTML = _sh('做出選擇', opts.length ? opts.length + ' 個選項' : '')
                + '<div class="vne-sc vne-go-sc"><div class="vne-go-card"></div><div class="vne-go-opts"></div><div class="ue-mission-chips vne-go-chips"></div></div>'
                + '<div class="vne-go-bar"><textarea class="vne-go-in" rows="1" placeholder="點選項填入，或直接輸入…"></textarea>'
                + '<button type="button" class="vne-go-send">發送<i class="fa-solid fa-caret-right"></i></button></div>';
            const inp = body.querySelector('.vne-go-in'), sendBtn = body.querySelector('.vne-go-send');
            const cardBox = body.querySelector('.vne-go-card'), optBox = body.querySelector('.vne-go-opts');
            // 酒館：這格跟酒館的輸入框是同一句話（選項卡點下去是寫進酒館輸入框的 /setinput，要跟著出現在這裡；這裡打的也寫回去）
            const tv = pwa ? null : _tavernInput(inp);
            const settle = new Set();
            const send = async () => {
                if (pwa) {
                    let val = inp.value.trim();
                    // 沒打字直接按發送：地圖收著委託或搭話的話，那段就當這一句送出去（同資料中心選項頁）
                    const M = win.AUREALIS_MAP || window.AUREALIS_MAP;
                    if (!val && M && M.missionHeldText) { try { val = String((await M.missionHeldText()) || '').trim(); } catch (e) {} }
                    if (!val) { try { inp.focus({ preventScroll: true }); } catch (e) {} return; }
                    if (settle.size) val += '\n[結算委託] ' + [...settle].join('、');
                    const V = window.VN_Core;
                    if (V && typeof V.sendPlayerLine === 'function' && V.sendPlayerLine(val)) closeSide();
                    return;
                }
                if (!tv) { _toast('找不到酒館的輸入框，請到資料中心送出'); return; }
                tv.push();
                const d = win.document || document;
                const btn = d.getElementById('send_but');
                if (!btn) { _toast('找不到酒館的送出鍵，請到資料中心送出'); return; }
                btn.click();
                closeSide();
            };
            sendBtn.onclick = send;
            inp.onkeydown = (e) => {
                const U = win.AUI || window.AUI;
                if (U && typeof U.enterSends === 'function' && U.enterSends(e)) { e.preventDefault(); send(); }
            };
            // 選項：點了填進輸入框、亮起來（選項卡自己就有選項的話不另外列，免得同一組選項出現兩次）
            const listOpts = () => {
                optBox.innerHTML = opts.map((o, i) => '<button type="button" class="vne-opt" data-i="' + i + '"><span class="vne-opt-k">' + String.fromCharCode(65 + i) + '</span><span class="vne-opt-t">' + esc(o) + '</span></button>').join('');
                optBox.querySelectorAll('.vne-opt').forEach(b => {
                    b.onclick = () => {
                        inp.value = opts[+b.dataset.i];
                        if (tv) tv.push();
                        optBox.querySelectorAll('.vne-opt').forEach(x => x.classList.toggle('vne-on', x === b));
                        try { inp.focus({ preventScroll: true }); } catch (e) {}
                    };
                });
            };
            // 網頁版：還沒結算的地圖委託排一排「結算委託・名字」（同資料中心選項頁；酒館那邊送出時自己會併）
            if (pwa) {
                const M = win.AUREALIS_MAP || window.AUREALIS_MAP;
                const chipBox = body.querySelector('.vne-go-chips');
                if (M && M.missionsRunning) {
                    Promise.resolve(M.missionsRunning()).then(list => {
                        if (!list || !list.length || seq !== _sideSeq || !chipBox.isConnected) return;
                        chipBox.innerHTML = list.map((m, i) => '<button type="button" class="ue-mission-chip" data-i="' + i + '"><i class="fa-solid fa-stamp"></i>結算委託・' + esc(m.title) + '</button>').join('');
                        chipBox.classList.add('on');
                        chipBox.querySelectorAll('.ue-mission-chip').forEach(b => {
                            b.onclick = () => {
                                const t = list[+b.dataset.i].title;
                                if (settle.has(t)) settle.delete(t); else settle.add(t);
                                b.classList.toggle('picked', settle.has(t));
                            };
                        });
                    }).catch(() => {});
                }
            }
            // 選項卡：酒館要等最後一樓煮好（TauriTavern 沒捲到就沒有），慢的話先寫一行讀取中
            const slow = setTimeout(() => { if (seq === _sideSeq && cardBox.isConnected && !cardBox.firstChild) cardBox.innerHTML = '<div class="vne-empty">讀取選項卡…</div>'; }, 300);
            const cards = opts.length ? await _fullCards() : [];
            clearTimeout(slow);
            if (seq !== _sideSeq || !body.isConnected) return;
            const pick = cards.find(c => _isPicker(c.text, opts));
            cardBox.innerHTML = '';
            if (pick) _mountPicker(cardBox, pick);
            // 網頁版的選項卡多半是酒館的正則寫的，點了寫不進這格（網頁版沒有酒館輸入框）→ 選項照樣列
            if (!pick || pwa) listOpts();
            if (!opts.length && !pick) { try { inp.focus({ preventScroll: true }); } catch (e) {} }
        },
    };
    function _toast(msg) { try { (win.AUI || window.AUI).toast(msg); } catch (e) {} }

    // 酒館的輸入框（#send_textarea）跟「繼續」那頁的輸入框綁成同一句：
    //   選項卡點選項是 /setinput 寫進酒館的輸入框（會發 input 事件）→ 抄過來；這裡打的字 → 寫回去（選項卡是接在酒館輸入框後面寫的）
    function _tavernInput(inp) {
        const d = win.document || document;
        const ta = d.getElementById('send_textarea');
        if (!ta) return null;
        inp.value = ta.value || '';
        let mute = false;
        const fromTa = () => { if (!mute && inp.isConnected) inp.value = ta.value; };
        const push = () => {
            mute = true;
            ta.value = inp.value;
            try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
            mute = false;
        };
        ta.addEventListener('input', fromTa);
        inp.addEventListener('input', push);
        _goOff = () => { ta.removeEventListener('input', fromTa); };
        return { push: push };
    }
    // 角色卡作者做的頁面整份（要搬進「繼續」那頁用）：酒館＝最後一樓的 .TH-render（跟資料中心同一套抓法），網頁版＝這一章原文套卡片正則
    async function _fullCards() {
        try {
            if (_standalone()) {
                const A = window.VN_StandaloneArchive;
                const list = (A && typeof A.cardPanels === 'function') ? ((await A.cardPanels()) || []) : [];
                return list.map(c => ({ title: c.title, text: String(c.html || ''), html: String(c.html || ''), pwa: true }));
            }
            const H = win.AureliaHtmlExtractor || window.AureliaHtmlExtractor;
            return (H && typeof H.cardPanelsFull === 'function') ? ((await H.cardPanelsFull()) || []) : [];
        } catch (e) { return []; }
    }
    // 選項卡掛進來：酒館那份是酒館助手煮好的 .TH-render 整塊照搬（同資料中心）；網頁版是卡片正則套出來的片段，先消毒（同資料中心 _mountCard）。
    //   選項卡在聊天裡多半預設收著（摺疊 <details>、MoM 美化那一系列的 .post-it-collapsible），這裡就是來點選項的 → 載好直接打開
    function _mountPicker(box, c) {
        if (c.pwa) {
            const V = window.VN_Core;
            const safe = (V && typeof V._safeRegexCard === 'function') ? V._safeRegexCard(c.html) : esc(c.html);
            box.innerHTML = '<div class="native-render-wrapper">' + safe + '</div>';
            const CR = win.OS_CARD_REGEX || window.OS_CARD_REGEX;
            try { if (CR && CR.fitCardFrames) CR.fitCardFrames(box); } catch (e) {}
        } else {
            box.innerHTML = '<div class="native-render-wrapper">' + c.html + '</div>';
        }
        box.querySelectorAll('iframe').forEach(fr => {
            const open = () => {
                try {
                    const fd = fr.contentDocument;
                    if (!fd) return;
                    fd.querySelectorAll('details:not([open])').forEach(x => x.setAttribute('open', ''));
                    fd.querySelectorAll('.post-it-collapsible:not(.open)').forEach(x => x.classList.add('open'));
                } catch (e) {}
            };
            fr.addEventListener('load', () => { open(); setTimeout(open, 300); });
            try { if (fr.contentDocument && fr.contentDocument.readyState === 'complete') { open(); setTimeout(open, 300); } } catch (e) {}
        });
    }
    // 換頁／收起來：拆掉輸入框的監聽，選項卡自帶的聲音先停（iframe 等一下跟著整頁清掉）
    function _dropGo(side) {
        if (_goOff) { try { _goOff(); } catch (e) {} _goOff = null; }
        const box = side && side.querySelector('.vne-go-card');
        const CR = win.OS_CARD_REGEX || window.OS_CARD_REGEX;
        if (box && box.querySelector('iframe, audio, video') && CR && CR.stopMedia) { try { CR.stopMedia(box); } catch (e) {} }
    }
    // 打開某一頁；同一頁再按一次＝收起來
    async function openSide(key) {
        const root = _root(), side = _side();
        if (!root || !side || !_briefOn() || !SIDE_FILL[key]) return false;
        if (_sideKey === key) { closeSide(); return true; }
        _dropThreads(side);
        _dropGo(side);
        _sideKey = key;
        const seq = ++_sideSeq;
        root.classList.add('vne-side-open');
        _markOn(key);
        const body = side.querySelector('.vne-side-body');
        body.innerHTML = '';
        side.onclick = (ev) => {
            const t = ev.target;
            if (t.closest('.vne-side-back')) { closeSide(); return; }
            const m = t.closest('[data-vne-act]');
            if (m) { const f = _acts && _acts[m.dataset.vneAct]; if (typeof f === 'function') f(); }
        };
        if (!side.classList.contains('vne-side-on')) {
            side.classList.add('vne-side-on');
            requestAnimationFrame(() => { _measure(); requestAnimationFrame(() => { if (seq === _sideSeq) side.classList.add('vne-side-in'); }); });
        } else _measure();
        setTimeout(() => { if (seq === _sideSeq) _measure(); }, 420);   // 卡片往左讓／縮成一條要 0.38 秒，站穩了再量一次
        try { await SIDE_FILL[key](body, seq); }
        catch (e) { console.warn('[VN_EndBrief] 旁邊那欄打不開', key, e); if (seq === _sideSeq) body.innerHTML = _wait('', '這一頁沒打開，再按一次試試'); }
        return true;
    }
    function closeSide(now) {
        const root = _root(), side = _side();
        _dropThreads(side);
        _dropGo(side);
        _sideKey = '';
        _sideSeq++;
        if (root) { root.classList.remove('vne-side-open'); root.querySelectorAll('.vne-on').forEach(n => n.classList.remove('vne-on')); }
        if (!side) return;
        side.classList.remove('vne-side-in');
        const done = () => {
            if (_sideKey) return;
            side.classList.remove('vne-side-on');
            const b = side.querySelector('.vne-side-body');
            if (b) b.innerHTML = '';
        };
        if (now) done(); else setTimeout(done, 300);
    }
    try { win.addEventListener('resize', () => { if (_sideKey) _measure(); }); } catch (e) {}

    // 底下那排的線索、日誌：簡報卡上在旁邊那欄開；世界面板漏做、補上來的那幾顆（直排）照舊開資料中心／手機日誌
    function _bindEnts() {
        const th = document.getElementById('vn-end-btn-threads'), jr = document.getElementById('vn-end-btn-journal'), go = document.getElementById('vn-end-btn-go');
        if (th) th.onclick = () => { if (_briefOn()) openSide('threads'); else if (_acts && _acts.threads) _acts.threads(); };
        if (jr) jr.onclick = () => { if (_briefOn()) openSide('journal'); else if (_acts && _acts.journal) _acts.journal(); };
        // 繼續：簡報卡上在旁邊那欄開「做出選擇」（11-13）；世界面板那種直排的照舊開選項頁／資料中心
        if (go) go.onclick = () => { if (_briefOn()) { openSide('go'); return; } closeSide(); if (_acts && _acts.go) _acts.go(); };
    }
    function _chgCount() {
        const A = win.OS_AVS || window.OS_AVS;
        try { return (A && typeof A.updList === 'function') ? (A.updList().n || 0) : 0; } catch (e) { return 0; }
    }
    // 角色卡作者做的那幾頁（名字＋頁面原文，原文拿來認哪一頁是選項卡）：網頁版問資料中心解析這一章的原文；酒館問最後一樓現在看得到的
    async function _peekCards() {
        try {
            if (win.OS_API?.isStandalone?.() ?? false) {
                const A = window.VN_StandaloneArchive;
                return (A && typeof A.peekCardPanels === 'function') ? ((await A.peekCardPanels()) || []) : [];
            }
            const H = win.AureliaHtmlExtractor || window.AureliaHtmlExtractor;
            return (H && typeof H.peekCardPanels === 'function') ? (H.peekCardPanels() || []) : [];
        } catch (e) { return []; }
    }

    function _setCtx(root, pct) {
        const ring = root.querySelector('.vne-ctx');
        const lab = root.querySelector('.vne-pct');
        if (!ring || !lab) return;
        if (pct == null || !isFinite(pct)) {
            ring.classList.remove('vne-ctx-on', 'vne-ctx-warn');
            ring.style.removeProperty('--vne-pct');
            lab.textContent = '';
            return;
        }
        const p = Math.max(0, Math.min(100, Math.round(pct)));
        ring.style.setProperty('--vne-pct', String(p));   // 圈圈亮多少＝用了多少，只能是算出來的數
        ring.classList.add('vne-ctx-on');
        ring.classList.toggle('vne-ctx-warn', p >= 70);
        lab.textContent = p + '%';
    }

    // 一章播完叫這個：先把同步拿得到的填上（章名、地點、這一章），其他的讀到再補
    function fill(core, acts) {
        if (acts) _acts = acts;
        const root = _root();
        if (!root) return;
        closeSide(true);   // 上一章開著的那欄收乾淨（新的一章從卡片開始）
        const n = ++_seq;
        const ch = _chapterOf(core);
        const where = (core && core._sceneName) || ch.where;
        _renderHead(root, ch, '', where);
        const lines = _sumLines(core);
        root.querySelector('.vne-points').innerHTML = lines.map(s => '<li>' + esc(s) + '</li>').join('');
        root.querySelector('.vne-sum').classList.toggle('vne-off', !lines.length);
        _opts = _choiceOpts(core);
        _tile = { nNew: 0, ev: null, nChg: _chgCount(), cards: [] };
        _renderTiles(root);
        _bindEnts();
        _setCtx(root, null);
        (async () => {
            const st = await _statusNow();
            if (n !== _seq) return;
            const M = _status();
            const when = (st && st.date && M) ? (M.fmtDate(st.date) + (st.time ? ' ' + st.time : '')) : '';
            _renderHead(root, ch, when, where);
            _tile.ev = _nextEvent(st);
            const nNew = await _newClues();
            if (n !== _seq) return;
            _tile.nNew = nNew;
            const cards = await _peekCards();
            if (n !== _seq) return;
            _tile.cards = cards.filter(c => !_isPicker(c.text, _opts));   // 選項卡在「繼續」裡了，小牌子不再列它
            _renderTiles(root);
            const pct = await _ctxPct();
            if (n !== _seq) return;
            _setCtx(root, pct);
        })().catch(e => console.warn('[VN_EndBrief] 簡報卡填資料失敗', e));
    }

    // 線索帳記好了／線索頁看過了（旁邊那欄演完新線索也算）→ 簡報卡開著就重算那個數字
    function _cardUp() {
        const ov = document.getElementById('vn-end-overlay');
        const root = _root();
        return (ov && ov.classList.contains('active') && root && root.classList.contains('vne-brief')) ? root : null;
    }
    function refreshClues() {
        const root = _cardUp();
        if (!root) return;
        const n = _seq;
        _newClues().then(k => { if (_alive(n)) { _tile.nNew = k; _renderTiles(root); } });
    }
    win.addEventListener('aurelia:story-threads', refreshClues);
    win.addEventListener('aurelia:threads-seen', refreshClues);
    // 副模型抽完狀態（可能比劇情播完晚）→「狀態變化」那塊跟著
    win.addEventListener('AVS_VARS_UPDATED', () => {
        const root = _cardUp();
        if (!root) return;
        const k = _chgCount();
        if (k !== _tile.nChg) { _tile.nChg = k; _renderTiles(root); }
    });

    const API = { fill: fill, refreshClues: refreshClues, openSide: openSide, closeSide: closeSide };
    window.VN_EndBrief = API;
    if (win !== window) win.VN_EndBrief = API;
})();
