// ----------------------------------------------------------------
// [檔案] os_dashboard.js
// 路徑：os_phone/os/os_dashboard.js
// 職責：🎛️「控制台」獨立窗口（大廳右側 dock 開啟）——整個奧瑞亞的中轉站看板。
//   書籤①今天　＝每天用了多少（次數／送出回來 Tokens／生圖）＋哪件事最花＋近 14 天
//   書籤②通道　＝哪件事走哪個模型（可直接改）＋主／副／自訂通道各自的今日用量＋新增編輯通道
//   書籤③記錄　＝這次開機以來每一次呼叫（送出的 prompt、回來的原文、錯誤、複製）
//   書籤④訊息　＝系統訊息（她的殼沒有 devtools，訊息只有這裡看得到）
//   長期數字來自 os_usage.js（IndexedDB，關掉 app 不歸零）；記錄與訊息是這次開機的環形緩衝。
//   視覺＝白藍視差風（同房產手帳）。純前端、零伺服器。
// 🚨 調試／微調／作弊那類工具不搬進來，繼續留在本機的 DEBUG.js。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const d = win.document;

    // ================================================================
    // 系統訊息收集：載入當下就開始接，不是開了面板才接（不然早期訊息全漏）
    // 做法沿用本機 DEBUG.js：掛 window/parent/top 三個視窗、每 2 秒重掛回去
    // （酒館與各擴展也會重包 console，不重掛就會被擠掉），原生輸出照樣保留。
    // ================================================================
    const MSG_MAX = 400;
    const MSGS = [];
    let _msgSeq = 0;
    const NOISE = /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i;

    function _fmtArg(a) {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.message + (a.stack ? ('\n' + a.stack) : '');
        try { return JSON.stringify(a); } catch (e) { return String(a); }
    }
    function _clock(ms) {
        try { return new Date(ms == null ? Date.now() : ms).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
        catch (e) { return ''; }
    }
    function _pushMsg(ty, args) {
        try {
            const m = Array.prototype.map.call(args, _fmtArg).join(' ');
            if (NOISE.test(m)) return;
            MSGS.push({ id: ++_msgSeq, ty: ty, t: Date.now(), m: m });
            while (MSGS.length > MSG_MAX) MSGS.shift();
        } catch (e) {}
    }
    const WINS = [];
    [window, window.parent, window.top].forEach(function (w) { try { if (w && w.console && WINS.indexOf(w) < 0) WINS.push(w); } catch (e) {} });
    function _hookConsole() {
        WINS.forEach(function (ww) {
            ['log', 'warn', 'error', 'info'].forEach(function (k) {
                try {
                    const cur = ww.console[k];
                    if (cur && cur.__dshL === MSGS) return;
                    const orig = (cur && cur.__dshO) || cur;
                    const ob = (orig && orig.bind) ? orig.bind(ww.console) : function () {};
                    const FLAG = '__DSH_IN_' + k;
                    // 重入閂：別的攔截器包在外面時，重掛會疊出好幾層，同一句話會被記好幾次
                    const wf = function () {
                        const top = !win[FLAG];
                        if (top) { win[FLAG] = true; try { _pushMsg(k, arguments); } catch (e) {} }
                        try { ob.apply(null, arguments); } catch (e) {}
                        if (top) win[FLAG] = false;
                    };
                    wf.__dshL = MSGS; wf.__dshO = orig;
                    ww.console[k] = wf;
                } catch (e) {}
            });
        });
    }
    if (!win.__DSH_CONSOLE_ON) {
        win.__DSH_CONSOLE_ON = true;
        _hookConsole();
        setInterval(_hookConsole, 2000);
        try {
            win.addEventListener('error', function (e) { _pushMsg('error', ['[錯誤] ' + (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || '')]); });
            win.addEventListener('unhandledrejection', function (e) { const r = e && e.reason; _pushMsg('error', ['[未處理的失敗] ' + ((r && r.message) || _fmtArg(r))]); });
        } catch (e) {}
    }

    // ================================================================
    // 小工具
    // ================================================================
    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function _n(v) { return (Number(v) || 0).toLocaleString('en-US'); }
    function _hostOf(u) {
        try { return new URL(String(u)).host; } catch (e) { return String(u || '').replace(/^https?:\/\//, '').split('/')[0]; }
    }
    function _toast(m) { try { (win.AUI || window.AUI).toastr.info(m); } catch (e) {} }
    function _confirm(m) {
        const A = win.AUI || window.AUI;
        if (A && A.confirm) return A.confirm(m);
        return Promise.resolve(false);   // 對話框模組沒載到就不做會回不來的事
    }

    // 複製：酒館殼裡 clipboard 是「非同步失敗」，try/catch 抓不到 → 三層退路，每層都要有回饋
    function _copy(text, label, cb) {
        const tx = String(text == null ? '' : text);
        const done = function () { try { cb && cb('已複製 ' + tx.length.toLocaleString() + ' 字'); } catch (e) {} };
        const manual = function () {
            const ov = d.createElement('div');
            ov.className = 'dsh-copybox';
            ov.innerHTML = '<div class="dsh-copybox-in"><div class="dsh-copybox-h">' + _esc(label || '內容') +
                '（' + tx.length.toLocaleString() + ' 字）　—　已經幫你全選好了，直接按 Ctrl+C</div>' +
                '<textarea readonly class="dsh-copybox-ta"></textarea><button class="dsh-btn dsh-copybox-x">關閉</button></div>';
            d.body.appendChild(ov);
            const ta = ov.querySelector('textarea');
            ta.value = tx;
            ov.querySelector('.dsh-copybox-x').onclick = function () { ov.remove(); };
            ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
            setTimeout(function () { try { ta.focus(); ta.select(); ta.setSelectionRange(0, tx.length); } catch (e) {} }, 30);
            try { cb && cb('請按 Ctrl+C'); } catch (e) {}
        };
        const viaExec = function () {
            try {
                const ta = d.createElement('textarea');
                ta.value = tx;
                ta.className = 'dsh-offscreen';
                d.body.appendChild(ta);
                ta.focus(); ta.select();
                let ok = false;
                try { ok = d.execCommand('copy'); } catch (e) {}
                ta.remove();
                if (ok) { done(); return; }
            } catch (e) {}
            manual();
        };
        try {
            if (win.navigator && win.navigator.clipboard && win.navigator.clipboard.writeText) {
                win.navigator.clipboard.writeText(tx).then(done, viaExec);
                return;
            }
        } catch (e) {}
        viaExec();
    }
    function _flash(el, msg, ms) {
        if (!el) return;
        const o = el.textContent;
        el.textContent = msg;
        setTimeout(function () { el.textContent = o; }, ms || 1800);
    }

    function _U() { return win.OS_USAGE || window.OS_USAGE || null; }
    function _S() { return win.OS_SETTINGS || window.OS_SETTINGS || null; }
    function _apiLog() {
        for (let i = 0; i < WINS.length; i++) { try { if (WINS[i] && WINS[i].AURELIA_API_LOG) return WINS[i].AURELIA_API_LOG; } catch (e) {} }
        return win.AURELIA_API_LOG || [];
    }
    const TASK_FALLBACK = {
        story: '正文（故事）', phone_chat: '手機聊天', summary: '大總結',
        extract: '狀態抽取 / 人物檔案', illust: '插圖描述', map: '地圖探索', heartbeat: '主動找我'
    };
    function _tasks() {
        const S = _S();
        if (S && Array.isArray(S.LLM_TASKS) && S.LLM_TASKS.length) return S.LLM_TASKS;
        return Object.keys(TASK_FALLBACK).map(function (k) { return { id: k, name: TASK_FALLBACK[k], def: 'main' }; });
    }
    function _taskName(id) {
        if (!id || id === '(未標)') return '沒有標記的';
        const t = _tasks().find(function (x) { return x.id === id; });
        return t ? t.name : id;
    }
    const SRC_NAME = {
        pollinations: 'Pollinations', novelai: 'NovelAI', tavern_sd: '酒館原生生圖',
        comfyui_direct: 'ComfyUI', custom_api: '自訂生圖接口'
    };

    // ================================================================
    // 窗口
    // ================================================================
    let _root = null, _tab = 'today', _timer = null;
    let _days = [], _pickDay = '';
    let _logFilter = 'all';
    const _openLogs = {};   // 展開的呼叫記錄（重畫時要記得誰是開著的）

    const TAB_NAME = { today: '今天', chan: '通道', log: '記錄', msg: '訊息' };

    function open() {
        if (_root) { close(); return; }
        const U = _U();
        _pickDay = U ? U.dayKey() : '';
        _root = d.createElement('div');
        _root.id = 'dsh-root';
        _root.innerHTML =
            '<div class="dsh-book">' +
            '  <button class="dsh-close" title="關閉"><i class="fa-solid fa-xmark"></i></button>' +
            '  <div class="dsh-title-row"><div class="dsh-wing"></div><h1 class="dsh-h1">控制台</h1><div class="dsh-wing r"></div></div>' +
            '  <div class="dsh-head">' +
            '    <div class="dsh-tabs">' +
            Object.keys(TAB_NAME).map(function (k) {
                return '<button class="dsh-tab' + (k === _tab ? ' on' : '') + '" data-tab="' + k + '">' + TAB_NAME[k] + '</button>';
            }).join('') +
            '    </div>' +
            '    <div class="dsh-pill" id="dsh-pill"><i class="fa-solid fa-bolt"></i><span>—</span></div>' +
            '  </div>' +
            '  <div class="dsh-page" id="dsh-page"></div>' +
            '</div>';
        d.body.appendChild(_root);
        _root.querySelector('.dsh-close').onclick = close;
        _root.addEventListener('click', function (e) { if (e.target === _root) close(); });
        _root.querySelectorAll('.dsh-tab').forEach(function (b) {
            b.onclick = function () { _switch(b.dataset.tab); };
        });
        _render();
        // 記錄與訊息會一直有新的進來 → 開著的時候自己跟上
        _timer = setInterval(function () {
            if (!_root) return;
            if (_tab === 'log' || _tab === 'msg') _render();
            else if (_tab === 'today') _render();
        }, 4000);
    }
    function close() {
        if (_timer) { clearInterval(_timer); _timer = null; }
        if (_root) { try { _root.remove(); } catch (e) {} _root = null; }
    }
    function _switch(tab) {
        _tab = tab;
        if (!_root) return;
        _root.querySelectorAll('.dsh-tab').forEach(function (t) { t.classList.toggle('on', t.dataset.tab === _tab); });
        _render();
    }

    async function _render() {
        if (!_root) return;
        const page = _root.querySelector('#dsh-page');
        if (!page) return;
        if (_tab === 'today') await _renderToday(page);
        else if (_tab === 'chan') await _renderChannels(page);
        else if (_tab === 'log') _renderLogs(page);
        else _renderMsgs(page);
        _updatePill();
    }

    async function _updatePill() {
        const U = _U();
        const el = _root && _root.querySelector('#dsh-pill span');
        if (!el || !U) return;
        try {
            const t = await U.today();
            el.textContent = '今天 ' + _n(t.n) + ' 次' + (t.img ? ' · 生圖 ' + _n(t.img) : '');
        } catch (e) {}
    }

    // ── 書籤①：今天 ────────────────────────────────────────────────
    function _sec(name) {
        return '<div class="dsh-sec"><span class="d"></span><b>' + _esc(name) + '</b><span class="d r"></span></div>';
    }
    function _diffText(cur, prev) {
        if (!prev) return cur ? '昨天沒有' : '';
        const dv = cur - prev;
        if (!dv) return '跟前一天一樣';
        const pct = Math.round(Math.abs(dv) / prev * 100);
        return '<span class="' + (dv > 0 ? 'up' : 'down') + '">' + (dv > 0 ? '↑' : '↓') + ' ' + pct + '%</span> 前一天 ' + _n(prev);
    }
    function _barGroup(map, valueOf, nameOf, rightOf) {
        const rows = Object.keys(map || {}).map(function (k) {
            return { k: k, v: valueOf(map[k]), n: map[k].n || 0 };
        }).filter(function (r) { return r.v > 0 || r.n > 0; }).sort(function (a, b) { return b.v - a.v; });
        if (!rows.length) return '';
        const max = rows[0].v || 1;
        return '<div class="dsh-bars">' + rows.map(function (r) {
            // --w 是依資料算出來的比例，只能由程式帶進來 → 用 CSS 變數，不寫 inline 樣式
            return '<div class="dsh-bar-row">' +
                '<span class="dsh-bar-name" title="' + _esc(nameOf(r.k)) + '">' + _esc(nameOf(r.k)) + '</span>' +
                '<span class="dsh-bar-track"><span class="dsh-bar-fill" style="--w:' + Math.max(2, Math.round(r.v / max * 100)) + '%"></span></span>' +
                '<span class="dsh-bar-num">' + rightOf(r) + '</span>' +
                '</div>';
        }).join('') + '</div>';
    }
    const _rightTok = function (r) { return _n(r.n) + ' 次　' + _n(r.v) + ' Tokens'; };
    const _rightImg = function (r) { return _n(r.n) + ' 張'; };

    async function _renderToday(page) {
        const U = _U();
        if (!U) { page.innerHTML = '<div class="dsh-empty"><i class="fa-solid fa-plug-circle-xmark"></i>用量記錄還沒啟動。</div>'; return; }
        const today = U.dayKey();
        _days = await U.days(U.shiftDay(today, -13), today);
        if (!_days.some(function (x) { return x.id === _pickDay; })) _pickDay = today;
        const cur = _days.find(function (x) { return x.id === _pickDay; }) || _days[_days.length - 1];
        const idx = _days.indexOf(cur);
        const prev = idx > 0 ? _days[idx - 1] : null;
        const isToday = cur.id === today;
        const maxN = Math.max.apply(null, _days.map(function (x) { return x.n + x.img; }).concat([1]));

        const spark = '<div class="dsh-spark">' + _days.map(function (x) {
            const h = Math.round((x.n + x.img) / maxN * 100);
            // --h 同上：柱子高度是當天用量的比例
            return '<div class="dsh-spark-col' + (x.id === _pickDay ? ' on' : '') + '" data-day="' + x.id + '" title="' + x.id + '：' + _n(x.n) + ' 次">' +
                '<span class="dsh-spark-bar" style="--h:' + h + '%"></span>' +
                '<span class="dsh-spark-lbl">' + x.id.slice(5).replace('-', '/') + '</span>' +
                '</div>';
        }).join('') + '</div>';

        const empty = (!cur.n && !cur.img);
        const WD = ['日', '一', '二', '三', '四', '五', '六'];
        const dparts = cur.id.split('-');
        const wd = WD[new Date(+dparts[0], +dparts[1] - 1, +dparts[2]).getDay()];
        let html = '';
        html += '<div class="dsh-daybar"><b>' + (isToday ? '今天' : (dparts[1] + ' 月 ' + (+dparts[2]) + ' 日')) + '</b>' +
            '<span class="dsh-note">星期' + wd + '</span><span class="sp"></span>' +
            (isToday ? '' : '<span class="dsh-chip" id="dsh-back-today">回到今天</span>') + '</div>';
        html += '<div class="dsh-stats">' +
            '<div class="dsh-stat"><span class="dsh-stat-k">呼叫次數</span><span class="dsh-stat-v">' + _n(cur.n) +
            (cur.fail ? '<small>· 失敗 ' + _n(cur.fail) + '</small>' : '') + '</span><span class="dsh-stat-sub">' + _diffText(cur.n, prev && prev.n) + '</span></div>' +
            '<div class="dsh-stat"><span class="dsh-stat-k">送出 Tokens</span><span class="dsh-stat-v">' + _n(cur.inTok) + '</span><span class="dsh-stat-sub">' + _diffText(cur.inTok, prev && prev.inTok) + '</span></div>' +
            '<div class="dsh-stat"><span class="dsh-stat-k">回來 Tokens</span><span class="dsh-stat-v">' + _n(cur.outTok) + '</span><span class="dsh-stat-sub">' + _diffText(cur.outTok, prev && prev.outTok) + '</span></div>' +
            '<div class="dsh-stat"><span class="dsh-stat-k">生圖</span><span class="dsh-stat-v">' + _n(cur.img) + '<small>張</small></span><span class="dsh-stat-sub">' + _diffText(cur.img, prev && prev.img) + '</span></div>' +
            '</div>';

        if (empty) {
            html += '<div class="dsh-empty"><i class="fa-solid fa-mug-hot"></i>' +
                (isToday ? '今天還沒跟模型講過話。' : (_pickDay + ' 這天沒有任何紀錄。')) +
                '<br><small>之後每一次對話、總結、生圖都會記在這裡，關掉也不會歸零。</small></div>';
        } else {
            const byTask = _barGroup(cur.task, function (b) { return (b.inTok || 0) + (b.outTok || 0); }, _taskName, _rightTok);
            if (byTask) html += _sec('哪件事最花') + byTask;
            const byChan = _barGroup(cur.chan, function (b) { return (b.inTok || 0) + (b.outTok || 0); }, function (k) { return k; }, _rightTok);
            if (byChan) html += _sec('走哪條通道') + byChan;
            if (cur.img) {
                const bySrc = _barGroup(cur.src, function (b) { return b.n || 0; }, function (k) { return SRC_NAME[k] || k; }, _rightImg);
                if (bySrc) html += _sec('生圖走哪裡') + bySrc;
            }
        }
        html += _sec('最近十四天') + spark +
            '<div class="dsh-actions"><span class="dsh-note">點柱子看那一天</span><span class="sp"></span>' +
            '<button class="dsh-btn" id="dsh-clear-usage">清空所有用量紀錄</button></div>';

        page.innerHTML = html;
        page.querySelectorAll('.dsh-spark-col').forEach(function (c) {
            c.onclick = function () { _pickDay = c.dataset.day; _render(); };
        });
        const bt = page.querySelector('#dsh-back-today');
        if (bt) bt.onclick = function () { _pickDay = today; _render(); };
        const cl = page.querySelector('#dsh-clear-usage');
        if (cl) cl.onclick = async function () {
            const ok = await _confirm('把所有的用量紀錄清掉？每天的數字會全部歸零，而且回不來。');
            if (!ok) return;
            await _U().clearAll();
            _toast('用量紀錄已清空。');
            _render();
        };
    }

    // ── 書籤②：通道 ────────────────────────────────────────────────
    async function _renderChannels(page) {
        const S = _S(), U = _U();
        if (!S) { page.innerHTML = '<div class="dsh-empty"><i class="fa-solid fa-plug-circle-xmark"></i>設定模組還沒載入。</div>'; return; }
        const routes = S.getRoutes ? S.getRoutes() : {};
        const chans = S.getChannels ? S.getChannels() : [];
        const main = S.getConfig ? S.getConfig() : {};
        const sec = S.getSecondaryConfig ? S.getSecondaryConfig() : {};
        const day = U ? await U.today() : null;
        const useOf = function (name) {
            const b = day && day.chan && day.chan[name];
            if (!b) return '今天還沒用到';
            return '今天 ' + _n(b.n) + ' 次 · ' + _n((b.inTok || 0) + (b.outTok || 0)) + ' Tokens';
        };

        const opts = function (picked) {
            let o = '<option value="main"' + (picked === 'main' ? ' selected' : '') + '>主模型</option>' +
                    '<option value="sec"' + (picked === 'sec' ? ' selected' : '') + '>副模型</option>';
            chans.forEach(function (c) {
                o += '<option value="' + _esc(c.id) + '"' + (picked === c.id ? ' selected' : '') + '>' + _esc(c.name || '未命名通道') + '</option>';
            });
            return o;
        };

        let html = _sec('哪件事走哪個模型') + '<div class="dsh-routes">' +
            _tasks().map(function (t) {
                return '<label class="dsh-route-row"><span>' + _esc(t.name) + '</span>' +
                    '<select class="dsh-sel" data-task="' + _esc(t.id) + '">' + opts(routes[t.id] || t.def) + '</select></label>';
            }).join('') + '</div>';

        html += _sec('我的通道');
        html += '<div class="dsh-chans">';
        html += '<div class="dsh-chan"><span class="dsh-chan-name">主模型</span>' +
            '<span class="dsh-chan-meta">模型 <b>' + _esc(main.model || '（沒填）') + '</b><br>' +
            (main.useSystemApi ? '跟著酒館的連線走' : ('直連 ' + _esc(_hostOf(main.url) || '（沒填網址）'))) + '</span>' +
            '<span class="dsh-chan-use">' + useOf('主模型') + '</span></div>';
        html += '<div class="dsh-chan"><span class="dsh-chan-name">副模型</span>' +
            '<span class="dsh-chan-meta">模型 <b>' + _esc(sec.model || '（沒填）') + '</b><br>' +
            (sec.useSystemApi ? '跟著酒館的連線走' : ('直連 ' + _esc(_hostOf(sec.url) || '（沒填網址）'))) + '</span>' +
            '<span class="dsh-chan-use">' + useOf('副模型') + '</span></div>';
        chans.forEach(function (c) {
            const bad = (!c.url || !c.key);
            html += '<div class="dsh-chan"><span class="dsh-chan-name">' + _esc(c.name || '未命名通道') + '</span>' +
                '<span class="dsh-chan-meta">模型 <b>' + _esc(c.model || '（沒填）') + '</b><br>' + _esc(_hostOf(c.url) || '（沒填網址）') +
                (bad ? '<br>還沒填完，指到這條的會先走原本的主／副模型' : '') + '</span>' +
                '<span class="dsh-chan-use">' + useOf(c.name || '未命名通道') + '</span>' +
                '<span class="dsh-chan-btns"><button class="dsh-btn" data-edit="' + _esc(c.id) + '">編輯</button>' +
                '<button class="dsh-btn warn" data-del="' + _esc(c.id) + '">刪掉</button></span></div>';
        });
        html += '</div>';
        html += '<div class="dsh-actions"><button class="dsh-btn solid" id="dsh-add-chan"><i class="fa-solid fa-plus"></i> 新增一條通道</button></div>';

        page.innerHTML = html;
        page.querySelectorAll('.dsh-sel').forEach(function (s) {
            s.onchange = function () {
                const r = S.getRoutes ? S.getRoutes() : {};
                r[s.dataset.task] = s.value;
                S.saveRoutes && S.saveRoutes(r);
                _toast('改好了：' + _taskName(s.dataset.task) + ' → ' + (s.options[s.selectedIndex] || {}).text);
            };
        });
        page.querySelectorAll('[data-edit]').forEach(function (b) {
            b.onclick = function () { _chanSheet(chans.find(function (c) { return c.id === b.dataset.edit; })); };
        });
        page.querySelectorAll('[data-del]').forEach(function (b) {
            b.onclick = async function () {
                const c = chans.find(function (x) { return x.id === b.dataset.del; });
                if (!c) return;
                const ok = await _confirm('把「' + (c.name || '未命名通道') + '」刪掉？指到它的那幾件事會回去走主／副模型。');
                if (!ok) return;
                S.saveChannels(chans.filter(function (x) { return x.id !== c.id; }));
                const r = S.getRoutes();
                Object.keys(r).forEach(function (k) { if (r[k] === c.id) delete r[k]; });
                S.saveRoutes(r);
                _toast('刪掉了。');
                _render();
            };
        });
        const add = page.querySelector('#dsh-add-chan');
        if (add) add.onclick = function () { _chanSheet(null); };
    }

    // 通道的新增／編輯（跟設置頁同一份資料：OS_SETTINGS.getChannels / saveChannels）
    function _chanSheet(chan) {
        const S = _S();
        const isNew = !chan;
        const c = chan || { id: 'ch_' + Date.now().toString(36), name: '', url: '', key: '', model: '', maxTokens: '', temperature: '' };
        const sheet = d.createElement('div');
        sheet.className = 'dsh-sheet';
        sheet.innerHTML = '<div class="dsh-sheet-card">' +
            '<div class="dsh-sheet-h">' + (isNew ? '新增通道' : '編輯通道') + '</div>' +
            '<label class="dsh-field"><span>名字</span><input class="dsh-input" data-f="name" value="' + _esc(c.name) + '" placeholder="自己看得懂就好"></label>' +
            '<label class="dsh-field"><span>網址</span><input class="dsh-input" data-f="url" value="' + _esc(c.url) + '" placeholder="https://…/v1"></label>' +
            '<label class="dsh-field"><span>金鑰</span><input class="dsh-input" data-f="key" type="password" value="' + _esc(c.key) + '" placeholder="sk-…"></label>' +
            '<label class="dsh-field"><span>模型</span><input class="dsh-input" data-f="model" value="' + _esc(c.model) + '" placeholder="模型名稱"></label>' +
            '<div class="dsh-two">' +
            '<label class="dsh-field"><span>最大輸出</span><input class="dsh-input" data-f="maxTokens" value="' + _esc(c.maxTokens) + '" placeholder="不填照舊"></label>' +
            '<label class="dsh-field"><span>溫度</span><input class="dsh-input" data-f="temperature" value="' + _esc(c.temperature) + '" placeholder="不填照舊"></label>' +
            '</div>' +
            '<div class="dsh-actions"><button class="dsh-btn" data-x>取消</button><span class="sp"></span><button class="dsh-btn solid" data-ok>存起來</button></div>' +
            '</div>';
        d.body.appendChild(sheet);
        const closeSheet = function () { try { sheet.remove(); } catch (e) {} };
        sheet.onclick = function (e) { if (e.target === sheet) closeSheet(); };
        sheet.querySelector('[data-x]').onclick = closeSheet;
        sheet.querySelector('[data-ok]').onclick = function () {
            sheet.querySelectorAll('[data-f]').forEach(function (i) { c[i.dataset.f] = i.value.trim(); });
            if (!c.name) { _toast('先給它一個名字。'); return; }
            const list = S.getChannels();
            const at = list.findIndex(function (x) { return x.id === c.id; });
            if (at < 0) list.push(c); else list[at] = c;
            S.saveChannels(list);
            closeSheet();
            _toast('存好了。');
            _render();
        };
    }

    // ── 書籤③：記錄 ────────────────────────────────────────────────
    function _oneLogText(r) {
        return [
            '時間：' + _clock(r.t),
            '連線：' + (r.cat === 'main' ? '主模型' : r.cat === 'sec' ? '副模型' : '其他'),
            '用途：' + (r.task ? _taskName(r.task) : '') + (r.route ? ('（' + r.route + '）') : (r.task ? '' : '（沒標）')),
            '狀態：' + (r.ok === null ? '進行中' : r.ok ? ('成功 ' + r.ms + 'ms') : ('失敗 ' + r.ms + 'ms')),
            'Tokens：送出 ' + (r.inTok == null ? '—' : r.inTok) + ' / 回來 ' + (r.outTok == null ? '—' : r.outTok),
            '',
            '── 送出的 prompt ──', r.prompt || '（空）',
            '',
            '── 回來的原文 ──', r.ok === false ? ('（失敗）' + (r.err || '')) : (r.raw || '（空）')
        ].join('\n');
    }
    function _renderLogs(page) {
        const all = _apiLog();
        const arr = all.filter(function (r) { return _logFilter === 'all' || r.cat === _logFilter; }).slice().reverse();
        const CHIPS = [['all', '全部'], ['main', '主模型'], ['sec', '副模型'], ['aux', '其他']];
        let html = '<div class="dsh-actions"><span class="dsh-chips">' +
            CHIPS.map(function (c) { return '<span class="dsh-chip' + (_logFilter === c[0] ? ' on' : '') + '" data-f="' + c[0] + '">' + c[1] + '</span>'; }).join('') +
            '</span><span class="sp"></span><button class="dsh-btn" id="dsh-copy-page">複製這頁</button></div>';
        if (!arr.length) {
            html += '<div class="dsh-empty"><i class="fa-solid fa-inbox"></i>這次開起來以後還沒有呼叫。' +
                '<br><small>這一頁記的是這次開機以來每一次跟模型講話的原文；每天的數字在「今天」那一頁，關掉也不會不見。</small></div>';
        } else {
            html += '<div class="dsh-logs">' + arr.map(function (r) {
                const on = !!_openLogs[r.id];
                const st = r.ok === null ? '<span class="dsh-log-st">進行中</span>'
                    : r.ok ? '<span class="dsh-log-st ok" title="花了多久">' + _n(r.ms) + 'ms</span>'
                           : '<span class="dsh-log-st bad">失敗</span>';
                return '<div class="dsh-log" data-id="' + r.id + '">' +
                    '<div class="dsh-log-head">' +
                    '<span class="dsh-log-t">' + _clock(r.t) + '</span>' +
                    '<span class="dsh-badge ' + (r.cat || 'aux') + '">' + (r.cat === 'main' ? '主' : r.cat === 'sec' ? '副' : '其他') + '</span>' +
                    '<span class="dsh-log-task">' + _esc(r.task ? _taskName(r.task) : (r.route || '（沒標）')) + '</span>' +
                    '<span class="dsh-log-sp"></span>' +
                    '<span class="dsh-log-tok" title="送出 / 回來 Tokens">↑' + (r.inTok == null ? '—' : _n(r.inTok)) + ' ↓' + (r.outTok == null ? '—' : _n(r.outTok)) + '</span>' +
                    st + '</div>' +
                    '<div class="dsh-log-body' + (on ? '' : ' dsh-hide') + '">' +
                    (r.ok === false ? '<div class="dsh-pre-k">錯誤</div><pre class="dsh-pre">' + _esc(r.err || '') + '</pre>' : '') +
                    '<div class="dsh-pre-k">送出的 prompt</div><pre class="dsh-pre">' + _esc(r.prompt || '（空）') + '</pre>' +
                    '<div class="dsh-pre-k">回來的原文</div><pre class="dsh-pre">' + _esc(r.raw || '（空）') + '</pre>' +
                    '<div class="dsh-actions"><span class="sp"></span><button class="dsh-btn" data-one="' + r.id + '">複製這筆</button></div>' +
                    '</div></div>';
            }).join('') + '</div>';
        }
        page.innerHTML = html;
        page.querySelectorAll('[data-f]').forEach(function (c) {
            c.onclick = function () { _logFilter = c.dataset.f; _render(); };
        });
        page.querySelectorAll('.dsh-log-head').forEach(function (h) {
            h.onclick = function () {
                const box = h.parentElement;
                const id = box.dataset.id;
                _openLogs[id] = !_openLogs[id];
                box.querySelector('.dsh-log-body').classList.toggle('dsh-hide', !_openLogs[id]);
            };
        });
        page.querySelectorAll('[data-one]').forEach(function (b) {
            b.onclick = function (e) {
                e.stopPropagation();   // 不然點下去順便把那列收合
                const r = all.find(function (x) { return String(x.id) === b.dataset.one; });
                if (r) _copy(_oneLogText(r), '這一筆呼叫', function (m) { _flash(b, m); });
            };
        });
        const cp = page.querySelector('#dsh-copy-page');
        if (cp) cp.onclick = function () {
            _copy(arr.map(_oneLogText).join('\n\n════════\n\n'), '呼叫記錄', function (m) { _flash(cp, m); });
        };
    }

    // ── 書籤④：訊息 ────────────────────────────────────────────────
    function _renderMsgs(page) {
        const arr = MSGS.slice().reverse();
        let html = '<div class="dsh-actions"><span class="dsh-note">最新的在最上面</span><span class="sp"></span>' +
            '<button class="dsh-btn" id="dsh-copy-msgs">複製這頁</button>' +
            '<button class="dsh-btn warn" id="dsh-clear-msgs">清掉</button></div>';
        if (!arr.length) {
            html += '<div class="dsh-empty"><i class="fa-solid fa-feather"></i>目前沒有任何系統訊息。' +
                '<br><small>奧瑞亞跑起來說的話、出的錯，都會出現在這裡。</small></div>';
        } else {
            html += '<div class="dsh-msgs">' + arr.map(function (m) {
                return '<div class="dsh-msg ' + m.ty + '"><span class="ts">' + _clock(m.t) + '</span>' + _esc(m.m) + '</div>';
            }).join('') + '</div>';
        }
        page.innerHTML = html;
        const cp = page.querySelector('#dsh-copy-msgs');
        if (cp) cp.onclick = function () {
            _copy(arr.map(function (m) { return _clock(m.t) + ' [' + m.ty + '] ' + m.m; }).join('\n'), '系統訊息', function (x) { _flash(cp, x); });
        };
        const cl = page.querySelector('#dsh-clear-msgs');
        if (cl) cl.onclick = function () { MSGS.length = 0; _render(); };
    }

    // copy：手機殼 app 載入失敗時也要能一鍵把錯誤複製給我，共用同一套三層退路
    win.OS_DASHBOARD = { open: open, close: close, messages: MSGS, copy: _copy };
    if (win !== window) { try { window.OS_DASHBOARD = win.OS_DASHBOARD; } catch (e) {} }
    console.log('[PhoneOS] 載入控制台 (OS_DASHBOARD)');
})();
