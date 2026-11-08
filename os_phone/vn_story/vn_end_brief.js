/**
 * os_phone/vn_story/vn_end_brief.js — 章末簡報卡（2026-11-08）
 *
 * 一章播完、這個世界沒有自己的章末面板時，#vn-end-basic 變成一張簡報卡：
 *   章名、時間地點、「這一章」三句、新線索／下一件行程兩塊小牌子、繼續、五個入口、角落的重新生成。
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
    let _lastEv = null;    // 這次的「下一件行程」（線索數字變了重畫小牌子時要留著它）

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

    function _renderTiles(root, nNew, ev) {
        const box = root.querySelector('.vne-tiles');
        if (!box) return;
        let h = '';
        if (nNew > 0) {
            h += '<button type="button" class="vne-tile" data-vne="threads">'
               + '<span class="vne-orb"><i class="fa-solid fa-diagram-project"></i><span class="vne-badge">' + nNew + '</span></span>'
               + '<span class="vne-tile-txt"><span class="vne-tile-k">新線索</span><span class="vne-tile-v">' + nNew + ' 條還沒看</span></span>'
               + '<i class="fa-solid fa-chevron-right"></i></button>';
        }
        if (ev) {
            h += '<button type="button" class="vne-tile" data-vne="calendar">'
               + '<span class="vne-orb"><i class="fa-regular fa-calendar"></i></span>'
               + '<span class="vne-tile-txt"><span class="vne-tile-k">下一件行程</span><span class="vne-tile-v">' + esc([ev.when, ev.title].filter(Boolean).join('・')) + '</span></span>'
               + '<i class="fa-solid fa-chevron-right"></i></button>';
        }
        box.innerHTML = h;
        box.querySelectorAll('[data-vne]').forEach(b => {
            b.onclick = () => { const f = _acts && _acts[b.dataset.vne]; if (typeof f === 'function') f(); };
        });
        root.classList.toggle('vne-has-new', nNew > 0);
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
        const n = ++_seq;
        const ch = _chapterOf(core);
        const where = (core && core._sceneName) || ch.where;
        _renderHead(root, ch, '', where);
        const lines = _sumLines(core);
        root.querySelector('.vne-points').innerHTML = lines.map(s => '<li>' + esc(s) + '</li>').join('');
        root.querySelector('.vne-sum').classList.toggle('vne-off', !lines.length);
        _lastEv = null;
        _renderTiles(root, 0, null);
        _setCtx(root, null);
        (async () => {
            const st = await _statusNow();
            if (n !== _seq) return;
            const M = _status();
            const when = (st && st.date && M) ? (M.fmtDate(st.date) + (st.time ? ' ' + st.time : '')) : '';
            _renderHead(root, ch, when, where);
            _lastEv = _nextEvent(st);
            const nNew = await _newClues();
            if (n !== _seq) return;
            _renderTiles(root, nNew, _lastEv);
            const pct = await _ctxPct();
            if (n !== _seq) return;
            _setCtx(root, pct);
        })().catch(e => console.warn('[VN_EndBrief] 簡報卡填資料失敗', e));
    }

    // 線索帳記好了／線索頁看過了 → 簡報卡開著就重算那個數字
    function refreshClues() {
        const ov = document.getElementById('vn-end-overlay');
        const root = _root();
        if (!ov || !ov.classList.contains('active') || !root || !root.classList.contains('vne-brief')) return;
        const n = _seq;
        _newClues().then(k => { if (_alive(n)) _renderTiles(root, k, _lastEv); });
    }
    win.addEventListener('aurelia:story-threads', refreshClues);
    win.addEventListener('aurelia:threads-seen', refreshClues);

    const API = { fill: fill, refreshClues: refreshClues };
    window.VN_EndBrief = API;
    if (win !== window) win.VN_EndBrief = API;
})();
