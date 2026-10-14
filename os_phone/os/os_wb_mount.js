// ----------------------------------------------------------------
// [檔案] os_wb_mount.js
// 路徑：os_phone/os/os_wb_mount.js
// 職責：右上角「關於我」下拉窗的「世界書」分頁——這段聊天現在讀了哪幾本世界書、掛上拿掉。只有酒館版。
//   10-14 她：酒館的附屬世界書要 Shift＋點角色卡的世界書鈕才看得到；奧瑞亞卡的書又是程式照「在奧瑞亞／在異世界」自動換的，
//   怕哪天程式卡住自己沒發現 → 這頁一打開就寫「奧瑞亞・掛對了」，或哪本不該在、哪本沒掛，點「修好」重掛。
//   奧瑞亞那三本由 core/void/worldgate.js 換（AURELIA_WORLDGATE.diagnose／repair）；該在哪個世界問 OS_WORLDGATE.getCurrentWorld。
//   其他書走酒館助手：getCharLorebooks／setCurrentCharLorebooks（這張卡）、getChatLorebook／setChatLorebook（這段聊天）、
//   getLorebookSettings／setLorebookSettings（每張卡都讀＝酒館的全域世界書）。
// ⚠️ 這頁裝在下拉窗裡：下拉窗的開關是看「點到的東西還在不在窗裡」，
//   所以點按鈕後一律 setTimeout 再重畫，不然被點的那顆先被換掉，窗會以為點到外面而收起來。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const _th = () => win.TavernHelper || window.TavernHelper || null;
    const _gate = () => win.AURELIA_WORLDGATE || window.AURELIA_WORLDGATE || null;
    const _wg = () => win.OS_WORLDGATE || window.OS_WORLDGATE || null;
    const _aui = () => win.AUI || window.AUI || null;
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const LIST_MAX = 40;

    let _host = null, _q = '', _busy = false, _st = null;

    try {
        const A = _aui();
        if (A && A.registerHelp) A.registerHelp({
            wb_mount: { title: '世界書', body:
                '這裡列的是這段聊天現在會讀的世界書，跟酒館世界書面板裡掛的是同一份，在這裡拿掉、掛上，酒館那邊也跟著變。\n' +
                '「這張卡讀的」＝掛在角色卡上的書（酒館的主要＋附加世界書）；「每張卡都讀」＝酒館的全域世界書，換哪張卡都在。\n' +
                '奧瑞亞卡的三本書是程式自動換的：在奧瑞亞讀「奧瑞亞世界」和「人物核心」，從世界門進異世界改讀「視差」，回來再換回去。每一輪都會檢查一次。\n' +
                '上面那格變紅就是沒換好，按「修好」會照這段聊天現在在哪重掛。' } });
    } catch (e) {}

    function _cardName() {
        try {
            const c = win.SillyTavern.getContext();
            const ch = c.characters && c.characterId != null ? c.characters[c.characterId] : null;
            return (ch && ch.name) || '';
        } catch (e) { return ''; }
    }

    async function _read() {
        const TH = _th();
        if (!TH) return null;
        const name = _cardName();
        let char = { primary: null, additional: [] }, chat = null, glob = [], all = [];
        if (name) { try { const c = TH.getCharLorebooks(); if (c) char = { primary: c.primary || null, additional: (c.additional || []).slice() }; } catch (e) {} }
        try { chat = TH.getChatLorebook ? (TH.getChatLorebook() || null) : null; } catch (e) {}
        try { glob = ((TH.getLorebookSettings() || {}).selected_global_lorebooks || []).slice(); } catch (e) {}
        try { all = (TH.getLorebooks() || []).slice().sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant')); } catch (e) {}
        const g = _gate();
        let dx = null, world = null;
        if (name && g && g.diagnose) {
            dx = g.diagnose(false);   // 先問這張卡歸不歸奧瑞亞管；是的話才去問世界門這段聊天在哪
            if (dx && dx.ours) {
                try { world = (await _wg()?.getCurrentWorld?.()) || null; } catch (e) {}
                dx = g.diagnose(!!world);
            }
        }
        const auto = dx && dx.ours && g.BOOKS ? Object.values(g.BOOKS) : [];
        return { name, char, chat, glob, all, dx, world, auto };
    }

    function _row(book, kind, auto) {
        const right = auto
            ? '<span class="wbm-auto">自動換</span>'
            : '<button type="button" class="wbm-x" data-rm="' + kind + '" data-book="' + esc(book) + '" aria-label="拿掉' + esc(book) + '" title="拿掉"><i class="fa-solid fa-xmark"></i></button>';
        return '<div class="wbm-row"><i class="fa-solid fa-book wbm-ico"></i><span class="wbm-name">' + esc(book) + '</span>' + right + '</div>';
    }
    function _section(title, rows, empty) {
        return '<div class="wbm-sec"><div class="wbm-sec-t">' + title + '</div>' + (rows.length ? rows.join('') : '<div class="wbm-empty">' + empty + '</div>') + '</div>';
    }
    function _stateHtml(s) {
        if (!s.dx || !s.dx.ours) return '';
        const help = (_aui() && _aui().helpBtn) ? _aui().helpBtn('wb_mount') : '';
        const where = s.world ? '異世界「' + esc(s.world.name || '') + '」' : '奧瑞亞';
        if (!s.dx.problems.length) {
            return '<div class="wbm-state is-ok"><i class="fa-solid fa-circle-check"></i><b>' + where + '・掛對了</b>' + help + '</div>';
        }
        const canFix = !(s.dx.missing && s.dx.missing.length);
        return '<div class="wbm-state is-bad"><div class="wbm-state-hd"><i class="fa-solid fa-triangle-exclamation"></i><b>' + where + '・掛錯了</b>' + help + '</div>' +
            '<ul class="wbm-probs">' + s.dx.problems.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>' +
            (canFix ? '<button type="button" class="wbm-fix"><i class="fa-solid fa-screwdriver-wrench"></i> 修好</button>' : '') + '</div>';
    }
    function _listHtml(s) {
        // 奧瑞亞卡自己的三本歸程式換，不列出來給她手動掛（手動掛上視差＝兩個世界同時在場，下一輪又會被換掉）
        const reading = new Set([s.char.primary, ...s.char.additional, s.chat, ...s.glob, ...s.auto].filter(Boolean));
        const q = _q.trim().toLowerCase();
        const pool = s.all.filter(b => !reading.has(b) && (!q || String(b).toLowerCase().includes(q)));
        if (!pool.length) return '<div class="wbm-empty">' + (q ? '找不到書名有「' + esc(_q.trim()) + '」的書' : '其他書都掛上了') + '</div>';
        const more = pool.length > LIST_MAX ? '<div class="wbm-empty">還有 ' + (pool.length - LIST_MAX) + ' 本，打書名找</div>' : '';
        return pool.slice(0, LIST_MAX).map(b =>
            '<div class="wbm-row"><i class="fa-solid fa-book wbm-ico"></i><span class="wbm-name">' + esc(b) + '</span>' +
            (s.name ? '<button type="button" class="wbm-add" data-add="char" data-book="' + esc(b) + '">這張卡</button>' : '') +
            '<button type="button" class="wbm-add" data-add="glob" data-book="' + esc(b) + '">每張卡</button></div>'
        ).join('') + more;
    }

    async function render(container) {
        if (container) _host = container;
        if (!_host) return;
        if (!_th()) { _host.innerHTML = '<div class="wbm"><div class="wbm-empty">酒館助手還沒就緒，等一下再打開</div></div>'; return; }
        if (!_host.querySelector('.wbm')) _host.innerHTML = '<div class="wbm"><div class="wbm-empty">讀取中…</div></div>';
        const s = await _read();
        if (!s) return;
        _st = s;
        const charRows = [s.char.primary, ...s.char.additional].filter(Boolean).map(b => _row(b, 'char', s.auto.includes(b)));
        _host.innerHTML = '<div class="wbm">' +
            _stateHtml(s) +
            (s.name ? _section('「' + esc(s.name) + '」讀的', charRows, '沒有掛書') : '<div class="wbm-empty">現在沒有開角色卡</div>') +
            (s.chat ? _section('這段聊天讀的', [_row(s.chat, 'chat', false)], '') : '') +
            _section('每張卡都讀', s.glob.map(b => _row(b, 'glob', false)), '沒有') +
            '<div class="wbm-sec"><div class="wbm-sec-t">掛上別的書</div>' +
            '<input type="search" class="wbm-search" placeholder="打書名找" value="' + esc(_q) + '">' +
            '<div class="wbm-list">' + _listHtml(s) + '</div></div>' +
            '</div>';
        const inp = _host.querySelector('.wbm-search');
        inp.addEventListener('input', () => {
            _q = inp.value;
            const list = _host.querySelector('.wbm-list');
            if (list && _st) list.innerHTML = _listHtml(_st);
        });
        _host.querySelector('.wbm').addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn || btn.classList.contains('aui-help')) return;
            setTimeout(() => _act(btn), 0);   // 等這一下點擊走完再動畫面（見檔頭 ⚠️）
        });
    }

    async function _act(btn) {
        if (_busy || !_st) return;
        const TH = _th();
        if (!TH) return;
        const book = btn.getAttribute('data-book') || '';
        const A = _aui();
        _busy = true;
        try {
            if (btn.classList.contains('wbm-fix')) {
                const r = await _gate()?.repair?.(!!_st.world);
                if (A && A.toast) A.toast(r && r.ok ? '重掛好了' : '沒修好：' + ((r && r.msg) || '世界書 API 不可用'));
            } else if (btn.hasAttribute('data-rm')) {
                const kind = btn.getAttribute('data-rm');
                if (kind === 'char') {
                    const c = _st.char;
                    await TH.setCurrentCharLorebooks({ primary: c.primary === book ? null : c.primary, additional: c.additional.filter(b => b !== book) });
                } else if (kind === 'chat') {
                    await TH.setChatLorebook(null);
                } else if (kind === 'glob') {
                    TH.setLorebookSettings({ selected_global_lorebooks: _st.glob.filter(b => b !== book) });
                }
            } else if (btn.hasAttribute('data-add')) {
                if (btn.getAttribute('data-add') === 'char') {
                    const c = _st.char;
                    // 奧瑞亞卡的主要那格歸程式換（進異世界時刻意空著），她加的一律放附加
                    if (!c.primary && !(_st.dx && _st.dx.ours)) await TH.setCurrentCharLorebooks({ primary: book, additional: c.additional });
                    else await TH.setCurrentCharLorebooks({ primary: c.primary, additional: c.additional.concat(book) });
                } else {
                    TH.setLorebookSettings({ selected_global_lorebooks: _st.glob.concat(book) });
                }
            }
        } catch (e) {
            console.warn('[WbMount] 掛書失敗', e);
            if (A && A.toast) A.toast('沒改成：' + ((e && e.message) || e));
        } finally {
            _busy = false;
        }
        render();
    }

    win.OS_WB_MOUNT = window.OS_WB_MOUNT = { render };
})();
