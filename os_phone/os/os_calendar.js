// ----------------------------------------------------------------
// [檔案] os_calendar.js
// 職責：手機的日曆 app。讀寫 OS_MC_STATUS（主角狀態與故事時鐘）同一份資料：
//   月曆格、有約定的日子打點、今天照故事時鐘標亮；點某天看當天約定，能自己加一筆或刪掉。
//   AI 從劇情寫進來的（[Event|]）跟你手動加的一起放，來源用小標區分。
//   一天照時段（早上／中午／下午／晚上／深夜）分段、左欄寫鐘點；地圖接的委託也佔一格（10-10）。
//   點標頭的「今天」可以改故事日期，時鐘從那裡接下去。
//   openToday()：劇情結束那排「日曆」鍵開的小卡，只看今天的行程（10-13）。
//   今天那條底下一區「還沒定日子」：劇情約了「改天」「下次」、還沒說哪天的，約好日子就搬到那天；右邊可以自己定日子（10-16）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const doc = win.document;
    const WD = ['日', '一', '二', '三', '四', '五', '六'];

    const CSS = `
        .cal-shell { width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--os-page-bg); font-family: sans-serif; position: relative; overflow: hidden; }
        .cal-header { height: calc(45px + env(safe-area-inset-top, 0px)); padding-top: env(safe-area-inset-top, 0px); display: flex; align-items: center; justify-content: center; background: var(--os-surface); border-bottom: 1px solid rgba(var(--os-ink-rgb), 0.15); position: relative; flex-shrink: 0; }
        .cal-header-title { font-weight: bold; font-size: 17px; color: var(--os-ink); }
        .cal-header-btn { position: absolute; left: 15px; width: 30px; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 18px; color: var(--os-ink); cursor: pointer; }
        .cal-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
        .cal-today { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--os-surface); border-bottom: 1px solid rgba(var(--os-ink-rgb), 0.12); cursor: pointer; }
        .cal-today-label { font-size: 12px; color: var(--os-ink-soft); }
        .cal-today-date { font-size: 22px; font-weight: bold; color: var(--os-ink); margin-top: 2px; }
        .cal-today-time { font-size: 13px; color: #e05a3d; margin-left: 8px; font-weight: normal; }
        .cal-today-edit { color: var(--os-ink-soft); font-size: 14px; }
        .cal-month-nav { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 6px; }
        .cal-month-title { font-size: 16px; font-weight: bold; color: var(--os-ink); }
        .cal-nav-btn { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--os-ink); cursor: pointer; background: var(--os-surface); border: 1px solid rgba(var(--os-ink-rgb), 0.12); }
        .cal-nav-btn:active { background: rgba(var(--os-ink-rgb), 0.08); }
        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); padding: 0 10px 8px; gap: 2px; }
        .cal-wd { text-align: center; font-size: 11px; color: var(--os-ink-soft); padding: 4px 0; }
        .cal-cell { aspect-ratio: 1 / 1; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 10px; cursor: pointer; font-size: 14px; color: var(--os-ink); position: relative; }
        .cal-cell.cal-empty { cursor: default; }
        .cal-cell.cal-is-today { background: #e05a3d; color: var(--os-surface); font-weight: bold; }
        .cal-cell.cal-selected:not(.cal-is-today) { background: var(--os-surface); box-shadow: inset 0 0 0 2px #e05a3d; }
        .cal-cell.cal-past { color: var(--os-ink-soft); }
        .cal-dot { width: 5px; height: 5px; border-radius: 50%; background: #e05a3d; position: absolute; bottom: 5px; }
        .cal-cell.cal-is-today .cal-dot { background: var(--os-surface); }
        .cal-day-panel { background: var(--os-surface); border-top: 8px solid rgba(var(--os-ink-rgb), 0.10); min-height: 160px; padding-bottom: 20px; }
        .cal-day-head { padding: 12px 16px 6px; font-size: 13px; font-weight: bold; color: var(--os-ink); display: flex; justify-content: space-between; align-items: center; }
        .cal-day-rel { font-size: 11px; color: var(--os-ink-soft); font-weight: normal; }
        .cal-ev { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid rgba(var(--os-ink-rgb), 0.06); }
        .cal-ev-bar { width: 3px; height: 28px; border-radius: 2px; background: #e05a3d; flex-shrink: 0; }
        .cal-ev.cal-ev-me .cal-ev-bar { background: #3d8be0; }
        .cal-ev-text { flex: 1; min-width: 0; cursor: pointer; }
        .cal-ev-title { font-size: 14px; color: var(--os-ink); word-break: break-word; }
        .cal-ev.cal-ev-done .cal-ev-title { color: var(--os-ink-soft); }
        .cal-ev.cal-ev-done .cal-ev-bar { opacity: 0.35; }
        .cal-ev-state { font-size: 12px; margin-left: 4px; }
        .cal-ev-src { font-size: 11px; color: var(--os-ink-soft); margin-top: 2px; }
        .cal-slot { padding: 12px 16px 2px; font-size: 11px; font-weight: bold; color: var(--os-ink-soft); letter-spacing: 1px; }
        .cal-ev-time { width: 40px; flex-shrink: 0; font-size: 12px; color: var(--os-ink-soft); font-variant-numeric: tabular-nums; }
        .cal-ev.cal-ev-mis { background: rgba(214, 150, 40, 0.10); }
        .cal-ev.cal-ev-mis .cal-ev-bar { background: #d69628; }
        .cal-ev-ico { margin-right: 6px; color: #d69628; font-size: 12px; }
        .cal-ev-del { color: rgba(var(--os-ink-rgb), 0.25); padding: 6px; cursor: pointer; font-size: 14px; }
        .cal-ev-del:active { color: #ff4444; }
        /* 還沒定日子（10-16）：今天那條底下、月曆上面；左邊那條用虛線表示還沒有日子 */
        .cal-und { background: var(--os-surface); border-bottom: 8px solid rgba(var(--os-ink-rgb), 0.10); padding-bottom: 4px; }
        .cal-und-head { padding: 12px 16px 4px; font-size: 13px; font-weight: bold; color: var(--os-ink); display: flex; align-items: center; gap: 6px; }
        .cal-und-head i { color: #e05a3d; }
        .cal-ev.cal-ev-und .cal-ev-bar { background: repeating-linear-gradient(180deg, #e05a3d 0 4px, transparent 4px 7px); }
        .cal-ev.cal-ev-und.cal-ev-me .cal-ev-bar { background: repeating-linear-gradient(180deg, #3d8be0 0 4px, transparent 4px 7px); }
        .cal-ev-date { color: rgba(var(--os-ink-rgb), 0.45); padding: 6px; cursor: pointer; font-size: 15px; }
        .cal-ev-date:active { color: #e05a3d; }
        .cal-empty-note { text-align: center; color: var(--os-ink-soft); font-size: 13px; padding: 24px 0 8px; }
        .cal-add { display: flex; gap: 8px; padding: 12px 16px 0; }
        .cal-add-input { flex: 1; min-width: 0; border: none; outline: none; font-size: 14px; background: var(--os-page-bg); border-radius: 10px; padding: 10px 12px; font-family: inherit; color: var(--os-ink); }
        .cal-add-btn { width: 40px; border-radius: 10px; background: #e05a3d; color: var(--os-surface); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 15px; }
        .cal-add-btn:active { opacity: 0.75; }

        /* 📅 今天的行程（openToday，劇情結束那排「日曆」鍵）：疊在劇情畫面上，黑金跟劇情末尾那排鍵同一套；進出照委託完成卡 */
        .caltd-mask { position: fixed; inset: 0; z-index: 100050; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; animation: caltdIn .3s ease-out; cursor: pointer; font-family: 'Noto Sans TC', sans-serif; }
        .caltd-mask.out { animation: caltdOut .28s ease-in forwards; }
        .caltd-mask.out .caltd-card { animation: caltdDown .28s ease-in forwards; }
        @keyframes caltdIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes caltdOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes caltdUp { from { transform: translateY(32px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes caltdDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(32px); opacity: 0; } }
        .caltd-card { width: min(360px, 100%); max-height: min(78vh, 640px); display: flex; flex-direction: column; box-sizing: border-box; background: linear-gradient(160deg, #1b1610, #0d0b08); border: 1px solid rgba(212,175,55,.55); border-radius: 14px; color: #eee; box-shadow: 0 18px 44px rgba(0,0,0,.55), 0 0 0 4px rgba(212,175,55,.08); animation: caltdUp .4s cubic-bezier(.2,.9,.3,1); cursor: default; overflow: hidden; }
        .caltd-head { flex-shrink: 0; display: flex; align-items: flex-start; gap: 10px; padding: 16px 16px 12px; border-bottom: 1px solid rgba(212,175,55,.22); }
        .caltd-head-main { flex: 1; min-width: 0; }
        .caltd-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; letter-spacing: 2px; color: #1a1408; background: #D4AF37; border-radius: 999px; padding: 3px 12px; font-weight: 700; }
        .caltd-date { margin-top: 10px; font-size: 20px; font-weight: 700; color: #fff; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
        .caltd-now { font-size: 14px; font-weight: 600; color: #ffd76a; font-variant-numeric: tabular-nums; }
        .caltd-x { flex-shrink: 0; width: 30px; height: 30px; margin: -4px -6px 0 0; padding: 0; border: none; border-radius: 50%; background: transparent; color: #b9b2a3; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .caltd-x:hover { color: #fff; background: rgba(255,255,255,.08); }
        .caltd-body { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 4px 0 12px; scrollbar-width: thin; scrollbar-color: rgba(212,175,55,.35) transparent; }
        .caltd-body::-webkit-scrollbar { width: 4px; }
        .caltd-body::-webkit-scrollbar-thumb { background: rgba(212,175,55,.35); border-radius: 2px; }
        .caltd-body::-webkit-scrollbar-track { background: transparent; }
        .caltd-slot { padding: 12px 16px 4px; font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #D4AF37; }
        .caltd-ev { display: flex; align-items: center; gap: 10px; padding: 8px 16px; }
        .caltd-time { width: 40px; flex-shrink: 0; font-size: 12px; color: #b9b2a3; font-variant-numeric: tabular-nums; }
        .caltd-bar { width: 3px; align-self: stretch; min-height: 26px; border-radius: 2px; background: #e05a3d; flex-shrink: 0; }
        .caltd-ev.caltd-me .caltd-bar { background: #3d8be0; }
        .caltd-ev.caltd-mis .caltd-bar { background: #d69628; }
        .caltd-text { flex: 1; min-width: 0; }
        .caltd-title { font-size: 14px; color: #f2ede3; line-height: 1.45; word-break: break-word; }
        .caltd-title i { margin-right: 6px; color: #d69628; font-size: 12px; }
        .caltd-state { margin-left: 4px; font-size: 12px; color: #b9b2a3; }
        .caltd-src { margin-top: 2px; font-size: 11px; color: #8f887b; }
        .caltd-ev.caltd-past .caltd-title, .caltd-ev.caltd-done .caltd-title { color: #8f887b; }
        .caltd-ev.caltd-past .caltd-bar, .caltd-ev.caltd-done .caltd-bar { opacity: .35; }
        .caltd-nowline { display: flex; align-items: center; gap: 8px; padding: 6px 16px; font-size: 11px; font-weight: 700; color: #ffd76a; letter-spacing: 1px; font-variant-numeric: tabular-nums; }
        .caltd-nowline::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(255,215,106,.8), rgba(255,215,106,0)); }
        .caltd-empty { padding: 34px 20px 26px; text-align: center; color: #b9b2a3; font-size: 14px; }
        .caltd-empty i { display: block; font-size: 26px; color: rgba(212,175,55,.5); margin-bottom: 10px; }
        .caltd-empty-sub { margin-top: 6px; font-size: 12px; color: #8f887b; line-height: 1.6; }
    `;
    function injectCss(d) {
        if (!d || d.getElementById('os-calendar-css')) return;
        const st = d.createElement('style'); st.id = 'os-calendar-css'; st.textContent = CSS;
        (d.head || d.documentElement).appendChild(st);
    }

    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function S() { return win.OS_MC_STATUS || window.OS_MC_STATUS; }

    let _root = null;
    let _view = null;        // { y, m } 正在看的月份
    let _sel = null;         // { y?, m, d } 選中的那天
    let _state = null;

    function anchorYear(st) { return (st && st.date && st.date.y) || new Date().getFullYear(); }
    function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
    function firstWeekday(y, m) { return new Date(y, m - 1, 1).getDay(); }
    function sameDay(a, b) { return !!(a && b && a.m === b.m && a.d === b.d && (a.y || 0) === (b.y || 0)); }
    function eventsOn(st, y, m, d) {
        return (st.events || []).filter(e => e.date && e.date.m === m && e.date.d === d && (!e.date.y || !y || e.date.y === y));
    }
    function relLabel(st, day) {
        if (!st.date) return '';
        const dd = S().dayDiff(st.date, day);
        if (dd === 0) return '今天';
        if (dd === 1) return '明天';
        if (dd === -1) return '昨天';
        return dd > 0 ? (dd + ' 天後') : (Math.abs(dd) + ' 天前');
    }

    // 一天照時段分段（她 10-10：「日歷要不要再擴展至日時段，然後分成時段來放」）：早上／中午／下午／晚上／深夜，沒說幾點的放最後。
    //   左邊那欄寫鐘點（只說了時段的空著，段名就是時段）；委託卡另一個顏色，寫幾點接的、幾點辦完。
    function srcText(e) {
        if (e.src === 'me') return '自己記的';
        if (e.src === 'wx') return e.edited ? '在微信說好的，改過' : '在微信說好的';
        return e.edited ? '劇情裡說好的，改過' : '劇情裡說好的';
    }
    function rowHtml(e) {
        const clock = S().minsOf && S().minsOf(e.time) != null ? e.time : '';
        const state = e.done || e.src === 'mission' ? '<span class="cal-ev-state">' + esc(S().doneLabel ? S().doneLabel(e) : '') + '</span>' : '';
        if (e.src === 'mission') {
            const span = (clock ? clock + ' 接的' : '從地圖接的') + (e.endTime ? '，' + e.endTime + (e.done === 'cancel' ? ' 不辦了' : ' 辦完') : '');
            return `
            <div class="cal-ev cal-ev-mis${e.done ? ' cal-ev-done' : ''}">
                <div class="cal-ev-time">${esc(clock)}</div>
                <div class="cal-ev-bar"></div>
                <div class="cal-ev-text"><div class="cal-ev-title"><i class="fa-solid fa-briefcase cal-ev-ico"></i>委託：${esc(e.title)}${state}</div><div class="cal-ev-src">${esc(span)}</div></div>
                <div class="cal-ev-del" data-id="${esc(e.id)}"><i class="fa-solid fa-trash"></i></div>
            </div>`;
        }
        return `
            <div class="cal-ev${e.src === 'me' ? ' cal-ev-me' : ''}${e.done ? ' cal-ev-done' : ''}">
                <div class="cal-ev-time">${esc(clock)}</div>
                <div class="cal-ev-bar"></div>
                <div class="cal-ev-text" data-edit="${esc(e.id)}"><div class="cal-ev-title">${esc(e.title)}${state}</div><div class="cal-ev-src">${srcText(e)}</div></div>
                <div class="cal-ev-del" data-id="${esc(e.id)}"><i class="fa-solid fa-trash"></i></div>
            </div>`;
    }
    // 還沒定日子的一筆：左邊不寫鐘點（虛線那條就是「還沒日子」），右邊多一顆「定日子」
    function undRow(e) {
        const id = esc(e.id);
        const state = e.done ? '<span class="cal-ev-state">' + esc(S().doneLabel ? S().doneLabel(e) : '') + '</span>' : '';
        return `
            <div class="cal-ev cal-ev-und${e.src === 'me' ? ' cal-ev-me' : ''}${e.done ? ' cal-ev-done' : ''}">
                <div class="cal-ev-bar"></div>
                <div class="cal-ev-text" data-edit="${id}"><div class="cal-ev-title">${esc(e.title)}${state}</div><div class="cal-ev-src">${srcText(e)}${e.when ? '・' + esc(e.when) : ''}</div></div>
                ${e.done ? '' : `<div class="cal-ev-date" data-setdate="${id}" title="定日子"><i class="fa-solid fa-calendar-plus"></i></div>`}
                <div class="cal-ev-del" data-id="${id}"><i class="fa-solid fa-trash"></i></div>
            </div>`;
    }
    // 「還沒定日子」那區（她 10-16 選的：同一本日曆最上面多一區，之後約好日子就自己搬過去）：
    //   還沒結束的照最近提過的排；做完／取消的留最近三件、淡掉。都沒有就整區不出現。
    function undatedHtml(st) {
        const open = S().undated ? S().undated(st) : [];
        const done = (st.events || []).filter(e => !e.date && e.done && e.done !== 'gone' && e.src !== 'mission')
            .sort((a, b) => (b.doneTs || 0) - (a.doneTs || 0)).slice(0, 3);
        if (!open.length && !done.length) return '';
        return `<div class="cal-und"><div class="cal-und-head"><i class="fa-regular fa-calendar"></i>還沒定日子</div>${open.map(undRow).join('')}${done.map(undRow).join('')}</div>`;
    }

    function dayHtml(st, evs) {
        const slots = (S().SLOTS || []).concat(['']);
        const slotOf = e => (S().slotOf ? S().slotOf(e.time) : '');
        return slots.map(id => {
            const list = evs.filter(e => slotOf(e) === id);
            if (!list.length) return '';
            return `<div class="cal-slot">${id || '沒說幾點'}</div>` + list.map(rowHtml).join('');
        }).join('');
    }

    function render() {
        if (!_root || !_state) return;
        const st = _state;
        const y = _view.y, m = _view.m;
        const today = st.date;
        const dim = daysInMonth(y, m), fw = firstWeekday(y, m);
        let cells = WD.map(w => `<div class="cal-wd">${w}</div>`).join('');
        for (let i = 0; i < fw; i++) cells += '<div class="cal-cell cal-empty"></div>';
        for (let d = 1; d <= dim; d++) {
            const day = { y: y, m: m, d: d };
            const isToday = today && sameDay({ y: today.y || y, m: today.m, d: today.d }, day);
            const isSel = _sel && sameDay({ y: _sel.y || y, m: _sel.m, d: _sel.d }, day);
            const past = today ? S().dayDiff(today, day) < 0 : false;
            const has = eventsOn(st, y, m, d).length > 0;
            cells += `<div class="cal-cell${isToday ? ' cal-is-today' : ''}${isSel ? ' cal-selected' : ''}${past ? ' cal-past' : ''}" data-d="${d}">${d}${has ? '<span class="cal-dot"></span>' : ''}</div>`;
        }
        const sel = _sel || (today ? { y: today.y || y, m: today.m, d: today.d } : { y: y, m: m, d: 1 });
        const evs = eventsOn(st, sel.y, sel.m, sel.d);
        const evHtml = evs.length ? dayHtml(st, evs) : '<div class="cal-empty-note">這天沒有約定</div>';

        _root.innerHTML = `
            <div class="cal-shell">
                <div class="cal-header sysh">
                    <div class="cal-header-btn sysh-back" data-act="home"><i class="fa-solid fa-chevron-left"></i></div>
                    <div class="cal-header-title sysh-title">日曆</div>
                </div>
                <div class="cal-body">
                    <div class="cal-today" data-act="set-today">
                        <div>
                            <div class="cal-today-label">今天</div>
                            <div class="cal-today-date">${today ? esc(S().fmtDate(today)) : '還沒定'}${today && st.time ? `<span class="cal-today-time">${esc(st.time)}</span>` : ''}</div>
                        </div>
                        <div class="cal-today-edit"><i class="fa-solid fa-pen"></i></div>
                    </div>
                    ${undatedHtml(st)}
                    <div class="cal-month-nav">
                        <div class="cal-nav-btn" data-act="prev"><i class="fa-solid fa-chevron-left"></i></div>
                        <div class="cal-month-title">${y} 年 ${m} 月</div>
                        <div class="cal-nav-btn" data-act="next"><i class="fa-solid fa-chevron-right"></i></div>
                    </div>
                    <div class="cal-grid">${cells}</div>
                    <div class="cal-day-panel">
                        <div class="cal-day-head"><span>${sel.m} 月 ${sel.d} 日</span><span class="cal-day-rel">${esc(relLabel(st, sel))}</span></div>
                        ${evHtml}
                        <div class="cal-add">
                            <input type="text" class="cal-add-input" id="cal-add-input" placeholder="這天要做什麼">
                            <div class="cal-add-btn" data-act="add"><i class="fa-solid fa-plus"></i></div>
                        </div>
                    </div>
                </div>
            </div>`;
        _root.querySelector('.cal-shell').addEventListener('click', onClick);
        const inp = _root.querySelector('#cal-add-input');
        if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addFromInput(); } });
    }

    async function onClick(e) {
        const cell = e.target.closest('.cal-cell:not(.cal-empty)');
        if (cell) { _sel = { y: _view.y, m: _view.m, d: parseInt(cell.dataset.d, 10) }; render(); return; }
        const del = e.target.closest('.cal-ev-del');
        if (del) { await S().removeEvent(del.dataset.id); _state = await S().load(); render(); return; }
        const setd = e.target.closest('[data-setdate]');
        if (setd) {
            const id = setd.dataset.setdate;
            const v = await prompt('定在哪一天', '', '例如 10/20 18:00、明天晚上');
            if (v == null || !v.trim()) return;
            await S().updateEvent(id, { date: v.trim() });
            _state = await S().load();
            const ev = (_state.events || []).find(x => x.id === id);
            if (!ev || !ev.date) { toast('看不懂這個日期'); return; }
            _view = { y: ev.date.y || anchorYear(_state), m: ev.date.m };   // 跳到那天，看得到它搬過去了
            _sel = { y: ev.date.y || _view.y, m: ev.date.m, d: ev.date.d };
            render();
            return;
        }
        const edit = e.target.closest('[data-edit]');
        if (edit) {
            const ev = (_state.events || []).find(x => x.id === edit.dataset.edit);
            if (!ev) return;
            const v = await prompt('改一下', (S().minsOf && S().minsOf(ev.time) != null ? ev.time + ' ' : '') + ev.title, '');
            if (v == null || !v.trim()) return;
            await S().updateEvent(ev.id, { title: v.trim() });
            _state = await S().load();
            render();
            return;
        }
        const act = e.target.closest('[data-act]');
        if (!act) return;
        const a = act.dataset.act;
        if (a === 'home') { const PS = win.PhoneSystem || window.PhoneSystem; if (PS && PS.goHome) PS.goHome(); return; }
        if (a === 'prev') { _view.m--; if (_view.m < 1) { _view.m = 12; _view.y--; } render(); return; }
        if (a === 'next') { _view.m++; if (_view.m > 12) { _view.m = 1; _view.y++; } render(); return; }
        if (a === 'add') { addFromInput(); return; }
        if (a === 'set-today') {
            const cur = _state.date ? S().fmtDate(_state.date) + (_state.time ? ' ' + _state.time : '') : '';
            const v = await prompt('今天是哪一天', cur, '例如 6/20 18:30');
            if (v == null) return;
            const d = S().parseDate(v);
            if (!d) { toast('看不懂這個日期'); return; }
            await S().setDate(v, '');
            _state = await S().load();
            _view = { y: _state.date.y || anchorYear(_state), m: _state.date.m };
            _sel = null;
            render();
        }
    }
    async function addFromInput() {
        const inp = _root && _root.querySelector('#cal-add-input');
        const title = inp ? inp.value.trim() : '';
        if (!title) return;
        const sel = _sel || (_state.date ? { y: _state.date.y, m: _state.date.m, d: _state.date.d } : { y: _view.y, m: _view.m, d: 1 });
        const dateStr = (sel.y ? sel.y + '/' : '') + sel.m + '/' + sel.d;
        await S().addEvent(dateStr, title, '', 'me');
        _state = await S().load();
        render();
    }

    // 小輸入視窗／提示條：走全站同一套（core/aurelia_dialog.js）
    function prompt(title, value, hint) { return AUI.prompt(title, value, { placeholder: hint || '' }); }
    function toast(msg) { AUI.toast(msg); }

    // ── 📅 今天的行程 ───────────────────────────────────────────────
    //   10-13 她：「VN結束畫面那裡的日曆可不可以簡化成當天的行程表就好? 不需要到每日?」
    //   只看今天：照時段分段、左邊鐘點、過了的淡掉、「現在」那條線擺在接下來那一件前面。只讀——
    //   要翻別天、自己加一筆，去手機上的日曆 app（那個照留）。進出跟委託完成卡同一套：往上滑進來，點旁邊或 ✕ 往下滑走。
    let _todayEl = null;
    function todayHtml(st) {
        const head = (inner) => `
            <div class="caltd-head">
                <div class="caltd-head-main">
                    <div class="caltd-tag"><i class="fa-solid fa-calendar-day"></i>今天的行程</div>
                    ${inner}
                </div>
                <button type="button" class="caltd-x" data-act="close" title="關閉"><i class="fa-solid fa-xmark"></i></button>
            </div>`;
        if (!st || !st.date) {
            return head('') + '<div class="caltd-body"><div class="caltd-empty"><i class="fa-regular fa-calendar"></i>這個故事還沒有日期<div class="caltd-empty-sub">劇情寫到日期就會自己記上；也可以在手機的日曆點「今天」自己設</div></div></div>';
        }
        const d = st.date;
        const dateLine = `<div class="caltd-date">${d.m} 月 ${d.d} 日${st.time ? `<span class="caltd-now">${esc(st.time)}</span>` : ''}</div>`;
        const evs = eventsOn(st, d.y || anchorYear(st), d.m, d.d);
        if (!evs.length) {
            return head(dateLine) + '<div class="caltd-body"><div class="caltd-empty"><i class="fa-regular fa-calendar-check"></i>今天沒有約定<div class="caltd-empty-sub">劇情裡說好的事、接的委託，會自己記進來</div></div></div>';
        }
        const M = S();
        const slots = (M.SLOTS || []).concat(['']);
        const slotOf = e => (M.slotOf ? M.slotOf(e.time) : '');
        const minsOf = e => (M.minsOf ? M.minsOf(e.time) : null);
        const now = M.minsOf ? M.minsOf(st.time) : null;
        const nowSlot = st.time ? slots.indexOf(slotOf({ time: st.time })) : -1;
        // 過了：寫了鐘點的看鐘點；只寫時段的看那個時段是不是已經過去
        const past = e => {
            if (now == null) return false;
            const m = minsOf(e);
            if (m != null) return m < now;
            const si = slots.indexOf(slotOf(e));
            return si >= 0 && nowSlot >= 0 && si < nowSlot && slotOf(e) !== '';
        };
        // 同一段裡照時間排（只寫時段的排在那段最前面）
        const items = [];
        slots.forEach(id => {
            const list = evs.filter(e => slotOf(e) === id).sort((a, b) => (minsOf(a) == null ? -1 : minsOf(a)) - (minsOf(b) == null ? -1 : minsOf(b)));
            if (!list.length) return;
            items.push({ slot: id || '沒說幾點' });
            list.forEach(e => items.push({ e: e }));
        });
        // 「現在」那條線：擺在第一件還沒過、還沒辦完的前面（那件是一段的第一件就擺在段名前面）；全部都過了就擺最後
        if (now != null) {
            let at = items.findIndex(it => it.e && !past(it.e) && !it.e.done && slotOf(it.e) !== '');
            if (at < 0) at = items.length;
            else if (at > 0 && items[at - 1].slot) at--;
            items.splice(at, 0, { now: true });
        }
        const row = (e) => {
            const clock = minsOf(e) != null ? e.time : '';
            const cls = 'caltd-ev' + (e.src === 'me' ? ' caltd-me' : '') + (e.src === 'mission' ? ' caltd-mis' : '') + (e.done ? ' caltd-done' : '') + (past(e) ? ' caltd-past' : '');
            const state = (e.done || e.src === 'mission') && M.doneLabel ? `<span class="caltd-state">${esc(M.doneLabel(e))}</span>` : '';
            const title = e.src === 'mission' ? `<i class="fa-solid fa-briefcase"></i>委託：${esc(e.title)}` : esc(e.title);
            const sub = e.src === 'mission'
                ? (clock ? clock + ' 接的' : '從地圖接的') + (e.endTime ? '，' + e.endTime + (e.done === 'cancel' ? ' 不辦了' : ' 辦完') : '')
                : srcText(e);
            return `<div class="${cls}"><div class="caltd-time">${esc(clock)}</div><div class="caltd-bar"></div>`
                + `<div class="caltd-text"><div class="caltd-title">${title}${state}</div><div class="caltd-src">${esc(sub)}</div></div></div>`;
        };
        const body = items.map(it => it.now ? `<div class="caltd-nowline">現在 ${esc(st.time)}</div>`
            : it.slot ? `<div class="caltd-slot">${esc(it.slot)}</div>` : row(it.e)).join('');
        return head(dateLine) + '<div class="caltd-body">' + body + '</div>';
    }
    function paintToday(el, st) {
        const card = el.querySelector('.caltd-card');
        if (!card) return;
        card.innerHTML = todayHtml(st);
        const body = card.querySelector('.caltd-body'), line = card.querySelector('.caltd-nowline');
        if (body && line && body.scrollHeight > body.clientHeight + 4) body.scrollTop = Math.max(0, line.offsetTop - body.offsetTop - 56);
    }
    function closeToday() {
        const el = _todayEl;
        if (!el || el._closing) return;
        el._closing = true;
        el.classList.add('out');
        setTimeout(() => { try { el.remove(); } catch (e) {} if (_todayEl === el) _todayEl = null; }, 280);
    }
    async function openToday() {
        if (!S()) { toast('日曆還在載入，等一下再按'); return; }
        injectCss(doc);
        if (_todayEl) { try { _todayEl.remove(); } catch (e) {} }
        const mask = doc.createElement('div');
        mask.className = 'caltd-mask';
        mask.innerHTML = '<div class="caltd-card"><div class="caltd-body"><div class="caltd-empty">讀取中…</div></div></div>';
        mask.addEventListener('click', e => {
            if (e.target === mask || e.target.closest('[data-act="close"]')) closeToday();
        });
        doc.body.appendChild(mask);
        _todayEl = mask;
        const st = await S().load();
        if (_todayEl !== mask) return;
        paintToday(mask, st);
    }

    async function launch(container) {
        if (!container) return;
        injectCss(doc); if (doc !== document) injectCss(document);
        _root = container;
        container.innerHTML = '<div class="cal-shell"><div class="cal-empty-note">載入中…</div></div>';
        if (!S()) { container.innerHTML = '<div class="cal-shell"><div class="cal-empty-note">狀態模組還沒載入</div></div>'; return; }
        _state = await S().load();
        const y = anchorYear(_state);
        _view = { y: y, m: _state.date ? _state.date.m : (new Date().getMonth() + 1) };
        _sel = null;
        render();
    }
    // 劇情那邊寫了新東西（AI 的 [Event|]／[Date|]）→ 開著的日曆跟著更新
    try { win.addEventListener('aurelia:mc-status', async () => { if (_root && _root.isConnected && _root.querySelector('.cal-shell')) { _state = await S().load(); render(); } }); } catch (e) {}
    try { win.addEventListener('aurelia:mc-status', async () => {
        const el = _todayEl;
        if (!el || el._closing || !el.isConnected) return;
        const st = await S().load();
        if (_todayEl === el) paintToday(el, st);
    }); } catch (e) {}

    win.OS_CALENDAR = { launch: launch, openToday: openToday, closeToday: closeToday };
    if (win !== window) window.OS_CALENDAR = win.OS_CALENDAR;

    // 登記進手機（跟微博同一條路：PhoneSystem.install → __PHONE_APPS，手機殼與 PWA 都從那裡開）
    function install() {
        const PS = win.PhoneSystem || window.PhoneSystem;
        if (PS && PS.install) PS.install('日曆', '<i class="fa-solid fa-calendar-days"></i>', '#e05a3d', function (c) { launch(c); });
        else setTimeout(install, 500);
    }
    install();
    console.log('📅 [Calendar] 日曆 app 已載入');
})();
