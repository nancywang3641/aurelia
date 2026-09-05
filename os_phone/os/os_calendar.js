// ----------------------------------------------------------------
// [檔案] os_calendar.js
// 職責：手機的日曆 app。讀寫 OS_MC_STATUS（主角狀態與故事時鐘）同一份資料：
//   月曆格、有約定的日子打點、今天照故事時鐘標亮；點某天看當天約定，能自己加一筆或刪掉。
//   AI 從劇情寫進來的（[Event|]）跟你手動加的一起放，來源用小標區分。
//   點標頭的「今天」可以改故事日期，時鐘從那裡接下去。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const doc = win.document;
    const WD = ['日', '一', '二', '三', '四', '五', '六'];

    const CSS = `
        .cal-shell { width: 100%; height: 100%; display: flex; flex-direction: column; background: #f5f5f7; font-family: sans-serif; position: relative; overflow: hidden; }
        .cal-header { height: calc(45px + env(safe-area-inset-top, 0px)); padding-top: env(safe-area-inset-top, 0px); display: flex; align-items: center; justify-content: center; background: #fff; border-bottom: 1px solid #e6e6e6; position: relative; flex-shrink: 0; }
        .cal-header-title { font-weight: bold; font-size: 17px; color: #1a1a1a; }
        .cal-header-btn { position: absolute; left: 15px; width: 30px; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #333; cursor: pointer; }
        .cal-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
        .cal-today { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #fff; border-bottom: 1px solid #eee; cursor: pointer; }
        .cal-today-label { font-size: 12px; color: #999; }
        .cal-today-date { font-size: 22px; font-weight: bold; color: #1a1a1a; margin-top: 2px; }
        .cal-today-time { font-size: 13px; color: #e05a3d; margin-left: 8px; font-weight: normal; }
        .cal-today-edit { color: #bbb; font-size: 14px; }
        .cal-month-nav { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 6px; }
        .cal-month-title { font-size: 16px; font-weight: bold; color: #1a1a1a; }
        .cal-nav-btn { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #555; cursor: pointer; background: #fff; border: 1px solid #eee; }
        .cal-nav-btn:active { background: #f0f0f0; }
        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); padding: 0 10px 8px; gap: 2px; }
        .cal-wd { text-align: center; font-size: 11px; color: #999; padding: 4px 0; }
        .cal-cell { aspect-ratio: 1 / 1; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 10px; cursor: pointer; font-size: 14px; color: #333; position: relative; }
        .cal-cell.cal-empty { cursor: default; }
        .cal-cell.cal-is-today { background: #e05a3d; color: #fff; font-weight: bold; }
        .cal-cell.cal-selected:not(.cal-is-today) { background: #fff; box-shadow: inset 0 0 0 2px #e05a3d; }
        .cal-cell.cal-past { color: #bbb; }
        .cal-dot { width: 5px; height: 5px; border-radius: 50%; background: #e05a3d; position: absolute; bottom: 5px; }
        .cal-cell.cal-is-today .cal-dot { background: #fff; }
        .cal-day-panel { background: #fff; border-top: 8px solid #ececef; min-height: 160px; padding-bottom: 20px; }
        .cal-day-head { padding: 12px 16px 6px; font-size: 13px; font-weight: bold; color: #333; display: flex; justify-content: space-between; align-items: center; }
        .cal-day-rel { font-size: 11px; color: #999; font-weight: normal; }
        .cal-ev { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid #f3f3f3; }
        .cal-ev-bar { width: 3px; height: 28px; border-radius: 2px; background: #e05a3d; flex-shrink: 0; }
        .cal-ev.cal-ev-me .cal-ev-bar { background: #3d8be0; }
        .cal-ev-text { flex: 1; min-width: 0; }
        .cal-ev-title { font-size: 14px; color: #1a1a1a; word-break: break-word; }
        .cal-ev-src { font-size: 11px; color: #999; margin-top: 2px; }
        .cal-ev-del { color: #ccc; padding: 6px; cursor: pointer; font-size: 14px; }
        .cal-ev-del:active { color: #ff4444; }
        .cal-empty-note { text-align: center; color: #aaa; font-size: 13px; padding: 24px 0 8px; }
        .cal-add { display: flex; gap: 8px; padding: 12px 16px 0; }
        .cal-add-input { flex: 1; min-width: 0; border: none; outline: none; font-size: 14px; background: #f5f5f7; border-radius: 10px; padding: 10px 12px; font-family: inherit; color: #1a1a1a; }
        .cal-add-btn { width: 40px; border-radius: 10px; background: #e05a3d; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 15px; }
        .cal-add-btn:active { opacity: 0.75; }
        .cal-prompt-mask { position: absolute; inset: 0; z-index: 50; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; padding: 24px; }
        .cal-prompt-card { width: 100%; background: #fff; border-radius: 14px; padding: 18px 16px 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.25); display: flex; flex-direction: column; gap: 12px; }
        .cal-prompt-title { font-size: 15px; font-weight: bold; color: #1a1a1a; text-align: center; }
        .cal-prompt-hint { font-size: 12px; color: #999; text-align: center; margin-top: -6px; }
        .cal-prompt-input { width: 100%; box-sizing: border-box; border: none; outline: none; font-size: 15px; color: #1a1a1a; background: #f5f5f7; border-radius: 10px; padding: 11px 12px; font-family: inherit; }
        .cal-prompt-btns { display: flex; gap: 10px; }
        .cal-prompt-btn { flex: 1; text-align: center; padding: 11px 0; border-radius: 10px; font-size: 15px; cursor: pointer; user-select: none; }
        .cal-prompt-cancel { background: #f2f2f2; color: #333; }
        .cal-prompt-ok { background: #e05a3d; color: #fff; font-weight: bold; }
        .cal-prompt-btn:active { opacity: 0.75; }
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
        const evHtml = evs.length ? evs.map(e => `
            <div class="cal-ev${e.src === 'me' ? ' cal-ev-me' : ''}">
                <div class="cal-ev-bar"></div>
                <div class="cal-ev-text"><div class="cal-ev-title">${esc(e.title)}</div><div class="cal-ev-src">${e.src === 'me' ? '自己記的' : '劇情裡說好的'}</div></div>
                <div class="cal-ev-del" data-id="${esc(e.id)}"><i class="fa-solid fa-trash"></i></div>
            </div>`).join('') : '<div class="cal-empty-note">這天沒有約定</div>';

        _root.innerHTML = `
            <div class="cal-shell">
                <div class="cal-header">
                    <div class="cal-header-btn" data-act="home"><i class="fa-solid fa-chevron-left"></i></div>
                    <div class="cal-header-title">日曆</div>
                </div>
                <div class="cal-body">
                    <div class="cal-today" data-act="set-today">
                        <div>
                            <div class="cal-today-label">今天</div>
                            <div class="cal-today-date">${today ? esc(S().fmtDate(today)) : '還沒定'}${today && st.time ? `<span class="cal-today-time">${esc(st.time)}</span>` : ''}</div>
                        </div>
                        <div class="cal-today-edit"><i class="fa-solid fa-pen"></i></div>
                    </div>
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

    // 小輸入視窗：回字串，取消回 null
    function prompt(title, value, hint) {
        return new Promise(resolve => {
            const host = _root.querySelector('.cal-shell') || _root;
            const mask = doc.createElement('div');
            mask.className = 'cal-prompt-mask';
            mask.innerHTML = `<div class="cal-prompt-card"><div class="cal-prompt-title"></div><div class="cal-prompt-hint"></div><input type="text" class="cal-prompt-input"><div class="cal-prompt-btns"><div class="cal-prompt-btn cal-prompt-cancel">取消</div><div class="cal-prompt-btn cal-prompt-ok">確定</div></div></div>`;
            mask.querySelector('.cal-prompt-title').textContent = title || '';
            mask.querySelector('.cal-prompt-hint').textContent = hint || '';
            const inp = mask.querySelector('.cal-prompt-input');
            inp.value = value || '';
            const done = v => { mask.remove(); resolve(v); };
            mask.querySelector('.cal-prompt-ok').onclick = ev => { ev.stopPropagation(); done(inp.value); };
            mask.querySelector('.cal-prompt-cancel').onclick = ev => { ev.stopPropagation(); done(null); };
            inp.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); done(inp.value); } };
            mask.onclick = ev => { if (ev.target === mask) done(null); };
            host.appendChild(mask);
            setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) {} }, 30);
        });
    }
    function toast(msg) {
        const t = doc.createElement('div');
        t.className = 'wb-toast';   // 跟微博同一款提示條（wb_theme 已注入全域）
        t.textContent = msg;
        doc.body.appendChild(t);
        setTimeout(() => t.remove(), 2100);
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

    win.OS_CALENDAR = { launch: launch };
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
