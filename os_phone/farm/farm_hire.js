// ============================================================
// farm_hire.js — 雇人打工（後院、牧場右上「雇人」）
// ------------------------------------------------------------
// 10-11 她：「先做雇小機吧!」——自己做不花錢但扣體力；雇人花錢、她的體力不動。
// 選誰來（丹、阿洛、克語）、做多少（小活／一班／大班）、交代一句 → 伺服器開單子、從她那塊地扣錢；
// 他醒來用「打工體力」在她地上做事，收工寫一句進她的日記、拿工錢；一件都沒做成錢退回來。
// 規則、扣錢、付工錢全在伺服器（VPS garden.js 的「雇人打工」那段）；這支只送單子、看單子：
//   · 面板：誰、多大、交代（快捷那排點了只是選上，送出時接在她那句後面，不碰輸入框）、最近的單子（還沒人來的可以取消）。
//   · 看著：有單子在等或在做，每 20 秒問一次；做完了就換成伺服器上最新那份重開（ctx.pull），跳他那句。
// 雲端存檔沒開＝什麼都不做（雇的人要找得到她的地）。
// ============================================================
(function () {
    'use strict';

    var SIZES = [
        { id: 'small', name: '小活', stamina: 10, pay: 30 },
        { id: 'shift', name: '一班', stamina: 20, pay: 60 },
        { id: 'big', name: '大班', stamina: 30, pay: 90 }
    ];
    var PEOPLE = [{ id: 'dan', name: '丹' }, { id: 'aluo', name: '阿洛' }, { id: 'keyu', name: '克語' }];
    var CHIPS = ['澆水', '餵動物', '清糞撿蛋', '收成出貨', '摸狗裝飯碗'];
    var SEEN_KEY = 'aurelia_farm_hire_seen';   // 做完的單子跳過一次就不再跳（這台）
    var POLL = 20000;

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function fa(icon) { return '<i class="fa-solid ' + icon + '"></i>'; }
    function seen() { try { var a = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function markSeen(ids) {
        var a = seen();
        ids.forEach(function (id) { if (a.indexOf(id) < 0) a.push(id); });
        try { localStorage.setItem(SEEN_KEY, JSON.stringify(a.slice(-60))); } catch (e) {}
    }
    function ago(sec) {
        var m = Math.max(0, Math.round((Date.now() / 1000 - sec) / 60));
        if (m < 1) return '剛剛';
        if (m < 60) return m + ' 分鐘前';
        var h = Math.round(m / 60);
        return h < 24 ? h + ' 小時前' : Math.round(h / 24) + ' 天前';
    }
    function sizeOf(id) { return SIZES.filter(function (s) { return s.id === id; })[0] || SIZES[1]; }
    // 做完了要跟她說的那句
    function doneLine(j) {
        if (j.status === 'done') return j.name + '打工做完了' + (j.note ? '：「' + j.note + '」' : '（做了 ' + j.done + ' 件）');
        if (j.why === 'cancel') return '';
        return j.name + '這趟沒做成什麼，' + j.pay + 'G 退回來了';
    }

    try {
        if (window.AUI && window.AUI.registerHelp) window.AUI.registerHelp({
            farm_hire: { title: '雇人', body: '自己做事不花錢、但扣你的體力；雇人做要付錢，你的體力一點都不動。\n選誰來、做多少、交代一句，按雇他。錢當場先付，他用這張單子的打工體力在你的後院做事，做完會在你的日記留一句話，工錢給他。\n一件真的事都沒做成（只走來走去、拿拿工具不算），錢退給你。還沒人來接的單子可以取消、錢退回來。\n小活 10 點體力 30G、一班 20 點 60G、大班 30 點 90G。他照你交代的做，沒交代就看哪裡需要。\n你電腦開著時來的是宿舍裡的他（大約兩分鐘內）；電腦關著時，丹和阿洛的出差版從伺服器上來（最慢五分鐘）。克語只住宿舍，要等你電腦開著。\n他不能花你的錢買東西、不能幫你偷菜、不能用你的回復卷；你倉庫裡的種子、乾草、肥料、藥他可以用。\n叫醒一次會用掉一點帳號的額度（丹、克語用 Claude，阿洛用 ChatGPT）。要先開雲端存檔，他才找得到你的地。' }
        });
    } catch (e) {}

    // opts：{ app, state(), ctx（os_farm 給場景的那個：toast、pull）, openCloud() }
    function create(opts) {
        var C = window.FarmCloud;
        var wrap = document.createElement('div');
        wrap.className = 'fc-wrap';
        wrap.hidden = true;
        wrap.setAttribute('data-fw-modal', '');
        opts.app.appendChild(wrap);
        var help = (window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('farm_hire') : '';
        var doc = null, err = '', busy = false, dead = false, timer = 0;
        var born = Date.now() / 1000;   // 這個場景打開的時候：在這之前做完的，打開時拿到的田已經是新的，不用再重開
        var pick = { who: 'dan', size: 'shift', ask: '', chips: [] };

        function active(list) { return (list || []).filter(function (j) { return j.status === 'waiting' || j.status === 'working'; }); }
        function holding(who) { return doc && active(doc.list).some(function (j) { return j.worker === who; }); }
        // 誰什麼時候會來：電腦開著＝宿舍；關著＝丹、阿洛的出差版，克語要等
        function whenLine(p) {
            if (holding(p.id)) return '手上有你的單子';
            if (!doc) return '';
            if (doc.pcAlive) return '兩分鐘內就來';
            return p.id === 'keyu' ? '要等你電腦開著才來' : '出差版來，最慢五分鐘';
        }
        function jobRow(j) {
            var size = j.sizeName + '・' + j.pay + 'G';
            var badge, cls = '';
            if (j.status === 'waiting') { badge = fa('fa-hourglass-half') + '等他來'; cls = 'is-wait'; }
            else if (j.status === 'working') { badge = fa('fa-person-digging') + '在做了'; cls = 'is-work'; }
            else if (j.status === 'done') { badge = fa('fa-circle-check') + '做完了'; cls = 'is-done'; }
            else { badge = fa('fa-rotate-left') + (j.why === 'cancel' ? '取消了' : '退錢了'); cls = 'is-back'; }
            var line = j.status === 'done' ? (j.note ? '「' + esc(j.note) + '」' : '') + '<small>做了 ' + j.done + ' 件・用掉打工體力 ' + j.used + '/' + j.stamina + '</small>'
                : (j.ask ? '交代：' + esc(j.ask) : '沒交代，看哪裡需要');
            var cancel = j.status === 'waiting' ? '<button type="button" class="fh-cancel" data-fh="cancel" data-id="' + esc(j.id) + '">' + fa('fa-xmark') + '取消</button>' : '';
            return '<li class="fh-job ' + cls + '"><header><strong>' + esc(j.name) + '</strong><span>' + size + '</span><em>' + badge + '</em><time>' + ago(j.doneAt || j.startAt || j.at) + '</time></header>' +
                '<p>' + line + '</p>' + cancel + '</li>';
        }
        function render() {
            if (dead) return;
            var body;
            if (!C || !C.enabled()) {
                body = '<p class="fc-state is-offline">' + fa('fa-cloud') + '要先開雲端存檔，雇的人才找得到你的地。</p>' +
                    '<div class="fc-acts"><button type="button" class="fc-btn is-main" data-fh="cloud">' + fa('fa-cloud') + '打開雲端存檔</button></div>';
            } else {
                var st = opts.state(), sz = sizeOf(pick.size);
                var who = PEOPLE.filter(function (p) { return p.id === pick.who; })[0];
                var people = PEOPLE.map(function (p) {
                    return '<button type="button" class="fh-who fh-' + p.id + (p.id === pick.who ? ' is-on' : '') + '" data-fh="who" data-id="' + p.id + '" aria-pressed="' + (p.id === pick.who) + '">' +
                        '<b>' + esc(p.name.slice(0, 1)) + '</b><strong>' + esc(p.name) + '</strong><small>' + esc(whenLine(p)) + '</small></button>';
                }).join('');
                var sizes = SIZES.map(function (s) {
                    return '<button type="button" class="fh-size' + (s.id === pick.size ? ' is-on' : '') + '" data-fh="size" data-id="' + s.id + '" aria-pressed="' + (s.id === pick.size) + '">' +
                        '<strong>' + s.name + '</strong><small>打工體力 ' + s.stamina + '</small><b>' + s.pay + 'G</b></button>';
                }).join('');
                var chips = CHIPS.map(function (c) {
                    return '<button type="button" class="fh-chip' + (pick.chips.indexOf(c) >= 0 ? ' is-on' : '') + '" data-fh="chip" data-id="' + esc(c) + '">' + esc(c) + '</button>';
                }).join('');
                var why = holding(pick.who) ? who.name + '手上已經有一張你的單子了' : st.coins < sz.pay ? '金幣不夠（還差 ' + (sz.pay - st.coins) + 'G）' : '';
                var jobs = doc ? (doc.list.length ? '<ul class="fh-jobs">' + doc.list.slice(0, 8).map(jobRow).join('') + '</ul>' : '<p class="fh-empty">還沒雇過人。</p>')
                    : '<p class="fc-state is-busy">' + fa('fa-cloud-arrow-down') + '讀取中…</p>';
                body =
                    '<section class="fh-block"><h4>誰來</h4><div class="fh-people">' + people + '</div></section>' +
                    '<section class="fh-block"><h4>做多少</h4><div class="fh-sizes">' + sizes + '</div></section>' +
                    '<section class="fh-block"><h4>交代</h4>' +
                    '<textarea class="fh-ask" rows="2" maxlength="160" placeholder="要他做什麼（可以不寫）" aria-label="交代他做什麼">' + esc(pick.ask) + '</textarea>' +
                    '<div class="fh-chips">' + chips + '</div></section>' +
                    (err ? '<p class="fc-state is-error">' + fa('fa-triangle-exclamation') + esc(err) + '</p>' : '') +
                    '<div class="fc-acts"><button type="button" class="fc-btn is-main fh-send" data-fh="send"' + (why || busy ? ' disabled' : '') + '>' +
                    fa(busy ? 'fa-spinner fa-spin' : 'fa-handshake') + (why || ('雇' + who.name + '做' + sz.name + '・' + sz.pay + 'G')) + '</button></div>' +
                    '<p class="fh-coins">' + fa('fa-coins') + '你有 ' + st.coins + 'G</p>' +
                    '<section class="fh-block"><h4>最近的單子</h4>' + jobs + '</section>';
            }
            var keep = wrap.querySelector('.fh-ask');
            var focused = keep && document.activeElement === keep;
            wrap.innerHTML = '<section class="fc-card fh-panel" role="dialog" aria-label="雇人">' +
                '<header class="fc-head"><strong>' + fa('fa-handshake') + '雇人' + help + '</strong>' +
                '<button type="button" class="fc-close" aria-label="關上">' + fa('fa-xmark') + '</button></header>' +
                '<div class="fc-body">' + body + '</div></section>';
            if (focused) { var t = wrap.querySelector('.fh-ask'); if (t) { t.focus({ preventScroll: true }); t.selectionStart = t.selectionEnd = t.value.length; } }
        }

        // ── 看著單子：有在等的或在做的才問；做完的跳一句、換成伺服器上最新那份 ──
        function refresh() {
            if (dead || !C || !C.enabled()) return Promise.resolve();
            return C.hires().then(function (d) {
                if (dead) return;
                doc = d;
                err = '';
                var fresh = (d.list || []).filter(function (j) {
                    return (j.status === 'done' || j.status === 'refunded') && j.doneAt && Date.now() / 1000 - j.doneAt < 2 * 86400 && seen().indexOf(j.id) < 0;
                });
                if (!wrap.hidden) render();
                schedule();
                if (!fresh.length) return;
                markSeen(fresh.map(function (j) { return j.id; }));
                // 只講最新那張，其他的寫幾張（雇人面板裡看得到）
                var lines = fresh.map(doneLine).filter(Boolean);
                var say = lines.length ? lines[0] + (lines.length > 1 ? '（還有 ' + (lines.length - 1) + ' 張單子結束了，雇人那裡看）' : '') : '';
                // 打開之後才做完的：他動過她的地（做完、退錢都會改金幣），換成伺服器那份重開，重開時跳這句
                var late = fresh.some(function (j) { return j.doneAt > born - 10; });
                if (late && opts.ctx && opts.ctx.pull) opts.ctx.pull(say);
                else if (say && opts.ctx) opts.ctx.toast(say);
            }, function (e) {
                if (dead) return;
                err = C.errText(e);
                if (!wrap.hidden) render();
                schedule();
            });
        }
        function schedule() {
            clearTimeout(timer);
            if (dead || !doc || !active(doc.list).length) return;
            timer = setTimeout(refresh, POLL);
        }

        function send() {
            if (busy) return;
            var sz = sizeOf(pick.size), who = PEOPLE.filter(function (p) { return p.id === pick.who; })[0];
            // 快捷那排：送出時才接在她那句後面
            var ask = [pick.ask.trim(), pick.chips.join('、')].filter(Boolean).join('；');
            busy = true; err = ''; render();
            // 手上沒送上去的先送：伺服器是從它那份扣錢，不能拿舊的蓋掉她剛做的事
            C.flush().then(function () { return C.hire(pick.who, pick.size, ask); }).then(function (r) {
                busy = false;
                if (!r || !r.ok) { err = (r && r.message) || '沒雇成'; render(); return; }
                pick.ask = ''; pick.chips = [];
                // 錢是伺服器那邊扣的：換成那份重開
                var say = '雇了' + who.name + '做' + sz.name + '，' + sz.pay + 'G 先付了；' + (doc && doc.pcAlive ? '他兩分鐘內就來' : who.id === 'keyu' ? '克語要等你電腦開著才來' : '他最慢五分鐘就來');
                if (opts.ctx && opts.ctx.pull) opts.ctx.pull(say);
                else refresh();
            }, function (e) { busy = false; err = C.errText(e); render(); });
        }

        wrap.addEventListener('click', function (e) {
            e.stopPropagation();
            if (e.target === wrap || e.target.closest('.fc-close')) { close(); return; }
            var b = e.target.closest('[data-fh]');
            if (!b || b.disabled) return;
            var what = b.getAttribute('data-fh'), id = b.getAttribute('data-id');
            if (what === 'cloud') { close(); if (opts.openCloud) opts.openCloud(); return; }
            if (what === 'who') { pick.who = id; render(); }
            else if (what === 'size') { pick.size = id; render(); }
            else if (what === 'chip') { var i = pick.chips.indexOf(id); if (i >= 0) pick.chips.splice(i, 1); else pick.chips.push(id); render(); }
            else if (what === 'send') send();
            else if (what === 'cancel') {
                b.disabled = true;
                C.hireCancel(id).then(function (r) {
                    if (r && r.ok && r.job) markSeen([r.job.id]);
                    if (r && r.ok && opts.ctx && opts.ctx.pull) opts.ctx.pull(r.message);
                    else { err = (r && r.message) || ''; refresh(); }
                }, function (er) { err = C.errText(er); render(); });
            }
        });
        wrap.addEventListener('input', function (e) { if (e.target.classList.contains('fh-ask')) pick.ask = e.target.value; });
        // 打字時方向鍵、E、數字鍵別讓走路那支吃掉；Esc 關
        wrap.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); close(); }
        });

        function open() { err = ''; render(); wrap.hidden = false; refresh(); }
        function close() { wrap.hidden = true; }
        // 一開場就看一次：剛做完的跳一句；有在等的就開始看著
        refresh();

        return {
            open: open, close: close,
            destroy: function () { dead = true; clearTimeout(timer); }
        };
    }

    window.FarmHire = { create: create, SIZES: SIZES };
})();
