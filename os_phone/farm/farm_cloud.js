// ============================================================
// farm_cloud.js — 後院存檔放伺服器（可選）：手機和電腦同一塊田
// ------------------------------------------------------------
// 09-29 她：「好 先做存檔上VPS」。手機版和酒館的 localStorage 各自一份，同一個人兩邊各一塊田。
// 開了之後：開後院時先拿伺服器上最新的那份；玩的時候每次存檔順便送上去（停手一秒半才送，一次送一份）。
// 🚨 沒開＝跟以前一樣只存在這台，其他功能一個都不受影響（奧瑞亞要能給沒有伺服器的朋友用）。
// 伺服器是 aurelia-relay（跟手機版「回覆交給伺服器跑」同一台、同一組網址通行碼），端點 /v1/farm/<地名>：
//   GET 拿 { rev, updatedAt, state }；POST { state, baseRev } 存，baseRev 跟伺服器現在的版號不同＝另一台先存過 → 409 回最新那份。
// 版號記在這台的 aurelia_farm_cloud_meta { rev, dirty }：rev＝這台最後一次跟伺服器對上的版號，dirty＝這台有還沒送上去的改動。
// 設定 aurelia_farm_cloud { on, url, token }：網址、通行碼是她自己填的格子；手機版填過托管的話面板會先帶進來。
// ============================================================
(function () {
    'use strict';

    var CFG_KEY = 'aurelia_farm_cloud';
    var META_KEY = 'aurelia_farm_cloud_meta';
    var BACKUP_KEY = 'aurelia_farm_v1_backup';   // 這台的田被換掉之前，原樣留一份
    var SLOT = 'rae';                            // 她的那塊地；之後阿洛、丹在伺服器上各一塊
    var PUSH_WAIT = 1500;
    var TIMEOUT = 8000;

    function read(key) { try { var o = JSON.parse(localStorage.getItem(key) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
    function write(key, o) { try { localStorage.setItem(key, JSON.stringify(o)); } catch (e) {} }

    function cfg() { return read(CFG_KEY); }
    function setCfg(patch) { var c = Object.assign(cfg(), patch || {}); write(CFG_KEY, c); return c; }
    function meta() { return read(META_KEY); }
    function setMeta(patch) { var m = Object.assign(meta(), patch || {}); write(META_KEY, m); return m; }
    function base(c) {
        var u = String((c || cfg()).url || '').trim().replace(/\/+$/, '');
        if (!u) return '';
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        return u;
    }
    function enabled() { var c = cfg(); return !!(c.on && base(c) && String(c.token || '').trim()); }
    // 面板要先帶進去的網址、通行碼：自己存過的優先，沒有就借手機版托管那組
    function prefill() {
        var c = cfg();
        if (c.url || c.token) return { url: c.url || '', token: c.token || '' };
        var r = {};
        try { r = (window.OS_RELAY && window.OS_RELAY.cfg && window.OS_RELAY.cfg()) || {}; } catch (e) {}
        return { url: r.url || '', token: r.token || '' };
    }

    // ── 狀態（給按鈕和面板看）──
    var status = { kind: enabled() ? 'idle' : 'off', msg: '' };
    var listeners = [];
    function setStatus(kind, msg) {
        status = { kind: kind, msg: msg || '', rev: meta().rev || 0, at: meta().syncedAt || 0 };
        listeners.forEach(function (fn) { try { fn(status); } catch (e) {} });
    }
    function onStatus(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }

    // 錯誤講人話：畫面上不出現英文原文
    function errText(e) {
        var m = String((e && e.message) || e || '');
        if (e && e.name === 'AbortError') return '伺服器太久沒回應';
        if (/failed to fetch|networkerror|load failed|network/i.test(m)) return '連不上伺服器';
        return m;
    }
    function api(method, body, c, keepalive, slot) {
        c = c || cfg();
        var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = setTimeout(function () { try { if (ctl) ctl.abort(); } catch (e) {} }, TIMEOUT);
        return fetch(base(c) + '/v1/farm/' + (slot || SLOT), {
            method: method,
            headers: Object.assign({ 'Authorization': 'Bearer ' + String(c.token || '').trim() }, body ? { 'Content-Type': 'application/json' } : {}),
            body: body ? JSON.stringify(body) : undefined,
            keepalive: !!keepalive,
            signal: ctl ? ctl.signal : undefined
        }).then(function (res) {
            return res.text().then(function (t) {
                var data = null;
                try { data = JSON.parse(t); } catch (e) { data = null; }
                if (res.status === 409) return { conflict: true, doc: data };
                if (!res.ok) throw new Error(res.status === 401 ? '通行碼不對' : ((data && data.error) || ('伺服器回 ' + res.status)));
                return data;
            });
        }).finally(function () { clearTimeout(timer); });
    }

    // 誰玩得比較多（兩邊都還沒對過的第一次才用得到）：先比第幾日，再比日記幾行、收成幾次。
    // 🚨 不比金幣：買種子、買乾草會讓金幣變少，玩過的反而輸給全新的田（09-29 電腦那塊就這樣被手機的空田蓋掉）。
    // 全新沒動過的田（第 1 日、日記只有開場那一行、田都空的）一律讓給對方。
    function untouched(st) {
        return !st || ((Number(st.day) || 1) <= 1 && (st.logs || []).length <= 1 &&
            !(st.plots || []).some(function (p) { return p && p.stage && p.stage !== 'empty'; }));
    }
    function progress(st) {
        if (!st) return [-1, 0, 0];
        return [Number(st.day) || 0, (st.logs || []).length, Number(st.stats && st.stats.totalHarvested) || 0];
    }
    function ahead(a, b) {
        if (untouched(a)) return false;
        if (untouched(b)) return true;
        var p = progress(a), q = progress(b);
        for (var i = 0; i < p.length; i++) if (p[i] !== q[i]) return p[i] > q[i];
        return false;
    }
    function backupLocal(raw) { if (raw) try { localStorage.setItem(BACKUP_KEY, JSON.stringify(raw)); } catch (e) {} }

    // 最後一次跟伺服器一致的那份（字串）：存檔內容沒變就不送，免得每開一次後院就多一版
    var lastJson = '';
    function pushNow(state, force) {
        var m = meta(), j = JSON.stringify(state);
        return api('POST', { state: state, baseRev: m.rev || 0, force: !!force }).then(function (r) {
            if (r && r.conflict) return r;
            setMeta({ rev: r.rev, dirty: false, syncedAt: Date.now() });
            lastJson = j;
            return r;
        });
    }
    function done(out) { if (out && out.raw) lastJson = JSON.stringify(out.raw); return out; }

    // 打開後院前：決定這次用哪一份田。回 { raw, note }；note 給 os_farm 跳一句提示
    //   沒開 → 這台的；連不上 → 這台的（改動先留著，下次連上再送）
    function openSync(localRaw) {
        if (!enabled()) { setStatus('off'); return Promise.resolve({ raw: localRaw }); }
        setStatus('busy', '拿最新的田…');
        var m = meta();
        return api('GET').then(function (doc) { return decide(doc); }).then(done).catch(function (e) {
            setStatus('offline', errText(e) + '。先玩這台的，連上後自動補上去');
            return { raw: localRaw };
        });
        function decide(doc) {
            var remote = doc && doc.state, rrev = (doc && doc.rev) || 0;
            // 伺服器上還沒有：這台的送上去
            if (!remote) {
                if (!localRaw) { setStatus('idle'); return { raw: localRaw }; }
                return pushNow(localRaw, true).then(function () { setStatus('ok'); return { raw: localRaw, note: '這塊田已經存到伺服器了' }; });
            }
            // 這台從沒跟伺服器對過（剛開這個功能）：誰玩得多用誰，另一份這台留著
            if (m.rev == null) {
                if (localRaw && ahead(localRaw, remote)) {
                    setMeta({ rev: rrev });
                    return pushNow(localRaw, true).then(function () { setStatus('ok'); return { raw: localRaw, note: '這台的田比較新，已經存到伺服器了' }; });
                }
                backupLocal(localRaw);
                setMeta({ rev: rrev, dirty: false, syncedAt: Date.now() });
                setStatus('ok');
                return { raw: remote, note: localRaw ? '換成伺服器上的田了（這台原本那份另外留著）' : '' };
            }
            if (rrev === m.rev) {
                if (!m.dirty) { setStatus('ok'); return { raw: localRaw || remote }; }
                return pushNow(localRaw).then(function (r) {
                    if (r && r.conflict) { backupLocal(localRaw); setMeta({ rev: r.doc.rev, dirty: false, syncedAt: Date.now() }); setStatus('ok'); return { raw: r.doc.state, note: '另一台裝置剛存過，換成最新的了' }; }
                    setStatus('ok'); return { raw: localRaw };
                });
            }
            // 伺服器比較新（另一台玩過）
            if (m.dirty) backupLocal(localRaw);
            setMeta({ rev: rrev, dirty: false, syncedAt: Date.now() });
            setStatus('ok');
            return { raw: remote, note: m.dirty ? '另一台裝置玩得比較新，換成那邊的了（這台沒送上去的另外留著）' : '' };
        }
    }

    // 玩的時候：每次存檔叫這個，停手 PUSH_WAIT 才送
    var timer = 0, pending = null, inflight = false, onNewer = null;
    function changed(state) {
        if (!enabled()) return;
        if (JSON.stringify(state) === lastJson && !pending) return;
        setMeta({ dirty: true });
        pending = state;
        clearTimeout(timer);
        timer = setTimeout(flush, PUSH_WAIT);
    }
    function flush(keepalive) {
        clearTimeout(timer);
        if (!enabled() || !pending || inflight) return Promise.resolve();
        var st = pending;
        pending = null;
        inflight = true;
        setStatus('busy', '存上去…');
        var m = meta();
        var req = keepalive
            ? api('POST', { state: st, baseRev: m.rev || 0 }, null, true).then(function (r) {
                if (r && !r.conflict) { setMeta({ rev: r.rev, dirty: false, syncedAt: Date.now() }); lastJson = JSON.stringify(st); }
                return r;
            })
            : pushNow(st);
        return req.then(function (r) {
            inflight = false;
            if (r && r.conflict) {
                // 另一台在這中間存過：這台手上這份不能蓋上去，換成最新的
                setMeta({ rev: r.doc.rev, dirty: false, syncedAt: Date.now() });
                lastJson = JSON.stringify(r.doc.state);
                setStatus('ok');
                if (onNewer) onNewer(r.doc.state);
                return;
            }
            setStatus('ok');
            if (pending) flush();
        }).catch(function (e) {
            inflight = false;
            pending = pending || st;
            setStatus('offline', errText(e) + '。改動先留在這台，下次再送');
        });
    }
    function setOnNewer(fn) { onNewer = fn; }

    // 面板按「連線」：先試這組網址通行碼，通了才開
    function connect(url, token) {
        var c = { url: url, token: token, on: true };
        setStatus('busy', '連線中…');
        return api('GET', null, c).then(function () {
            setCfg(c);
            write(META_KEY, {});   // 當成這台第一次對：讓 openSync 比一比誰玩得多
            lastJson = '';
            return true;
        }).catch(function (e) {
            setStatus('error', errText(e));
            throw e;
        });
    }
    function disconnect() {
        clearTimeout(timer);
        pending = null;
        setCfg({ on: false });
        write(META_KEY, {});
        lastJson = '';
        setStatus('off');
    }

    // ── 面板（後院、牧場右上那顆「雲端」按鈕打開）──────────
    // 沒連：網址、通行碼、連線。連著：現在同步到哪、立即同步、關掉。說明放小問號。
    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function fa(icon) { return '<i class="fa-solid ' + icon + '"></i>'; }
    try {
        if (window.AUI && window.AUI.registerHelp) window.AUI.registerHelp({
            farm_cloud: { title: '雲端存檔', body: '開了之後，手機和電腦打開後院時都會先拿伺服器上最新的那塊田，玩的時候自動存上去，兩邊玩的是同一塊田。\n網址和通行碼跟手機版「回覆交給伺服器跑」是同一組。\n沒開就只存在這台裝置上，其他都照常。' }
        });
    } catch (e) {}
    function statusLine(s) {
        var at = s.at ? new Date(s.at) : null;
        var hm = at ? ('0' + at.getHours()).slice(-2) + ':' + ('0' + at.getMinutes()).slice(-2) : '';
        if (s.kind === 'busy') return fa('fa-cloud-arrow-up') + esc(s.msg || '同步中…');
        if (s.kind === 'offline' || s.kind === 'error') return fa('fa-triangle-exclamation') + esc(s.msg);
        if (s.kind === 'ok' || s.kind === 'idle') return fa('fa-circle-check') + '已同步' + (s.rev ? '・第 ' + s.rev + ' 版' : '') + (hm ? '・' + hm : '');
        return '';
    }
    // opts：{ app, onConnected() }；回傳 { open, close, destroy, paintButtons(root) }
    function panel(opts) {
        var wrap = document.createElement('div');
        wrap.className = 'fc-wrap';
        wrap.hidden = true;
        wrap.setAttribute('data-fw-modal', '');
        opts.app.appendChild(wrap);
        var help = (window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('farm_cloud') : '';
        function render() {
            var on = enabled(), s = status, pf = prefill();
            var body = on
                ? '<p class="fc-state is-' + esc(s.kind) + '">' + statusLine(s) + '</p>' +
                  '<p class="fc-where">' + fa('fa-server') + esc(base()) + '</p>' +
                  '<div class="fc-acts"><button type="button" class="fc-btn is-main" data-fc="sync">' + fa('fa-rotate') + '立即同步</button>' +
                  '<button type="button" class="fc-btn" data-fc="off">' + fa('fa-power-off') + '關掉</button></div>'
                : '<label class="fc-field"><span>網址</span><input type="text" data-fc="url" value="' + esc(pf.url) + '" autocomplete="off" spellcheck="false"></label>' +
                  '<label class="fc-field"><span>通行碼</span><input type="password" data-fc="token" value="' + esc(pf.token) + '" autocomplete="off"></label>' +
                  (s.kind === 'error' || s.kind === 'busy' ? '<p class="fc-state is-' + esc(s.kind) + '">' + statusLine(s) + '</p>' : '') +
                  '<div class="fc-acts"><button type="button" class="fc-btn is-main" data-fc="connect">' + fa('fa-plug') + '連線</button></div>';
            wrap.innerHTML = '<section class="fc-card" role="dialog" aria-label="雲端存檔">' +
                '<header class="fc-head"><strong>' + fa('fa-cloud') + '雲端存檔' + help + '</strong>' +
                '<button type="button" class="fc-close" aria-label="關上">' + fa('fa-xmark') + '</button></header>' +
                '<div class="fc-body">' + body + '</div></section>';
        }
        function paintButtons() {
            var s = status;
            Array.prototype.forEach.call(opts.app.querySelectorAll('[data-farm-cloud]'), function (b) {
                b.classList.toggle('is-on', enabled() && (s.kind === 'ok' || s.kind === 'idle'));
                b.classList.toggle('is-busy', s.kind === 'busy');
                b.classList.toggle('is-warn', enabled() && (s.kind === 'offline' || s.kind === 'error'));
                b.title = enabled() ? '雲端存檔：' + (s.kind === 'offline' ? '連不上' : s.kind === 'busy' ? '同步中' : '已同步') : '雲端存檔（沒開）';
            });
        }
        var off = onStatus(function () { paintButtons(); if (!wrap.hidden) render(); });
        function open() { render(); wrap.hidden = false; var i = wrap.querySelector('input[data-fc="url"]'); if (i && !i.value) i.focus({ preventScroll: true }); }
        function close() { wrap.hidden = true; }
        wrap.addEventListener('click', function (e) {
            e.stopPropagation();
            if (e.target === wrap || e.target.closest('.fc-close')) { close(); return; }
            var b = e.target.closest('button[data-fc]');
            if (!b || b.disabled) return;
            var what = b.getAttribute('data-fc');
            if (what === 'connect') {
                var url = (wrap.querySelector('[data-fc="url"]').value || '').trim();
                var token = (wrap.querySelector('[data-fc="token"]').value || '').trim();
                if (!url || !token) { setStatus('error', '網址跟通行碼都要填'); return; }
                b.disabled = true;
                connect(url, token).then(function () { close(); if (opts.onConnected) opts.onConnected(); }, function () { b.disabled = false; });
            } else if (what === 'sync') {
                b.disabled = true;
                if (opts.onConnected) opts.onConnected();   // 跟剛連上一樣：拿最新的、這台有新的就送上去
            } else if (what === 'off') {
                disconnect();
            }
        });
        // 輸入框裡打字不讓後院的小人接到按鍵；Esc 關面板
        wrap.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } });
        paintButtons();
        return { open: open, close: close, paintButtons: paintButtons, destroy: function () { off(); } };
    }

    // 看別人的地（看板排行榜、去他家做客用）：阿洛、丹在 VPS 上顧的那兩塊。只讀。
    function peek(slot) { return enabled() ? api('GET', null, null, false, slot) : Promise.reject(new Error('off')); }

    // ── 偷菜（規則只在 VPS 的 garden.js；relay 的 /v1/farm-steal、/v1/farm-steals 轉過去）──
    // steal：她去 owner 家偷第 plot 塊田（0 起算）。回 { ok, coins, crop, message, record }；偷不了是 ok:false＋message（不是錯誤）
    function steal(owner, plot) { return call('POST', '/v1/farm-steal', { owner: owner, plot: plot }); }
    // 最近的偷吃紀錄＋每個人一共偷吃幾口：{ recent: [{ at, thief, owner, plot, crop, plantedDay, coins }], total: { rae, dan, aluo } }
    function steals() { return enabled() ? call('GET', '/v1/farm-steals') : Promise.reject(new Error('off')); }
    // 打開後院時：拿「別人偷吃她、她還沒看過」的那幾筆（伺服器同時記成看過了，兩台不會各寫一次日記）
    function claimSteals() { return enabled() ? call('POST', '/v1/farm-steals/claim', {}) : Promise.resolve({ list: [] }); }

    // ── 住戶醒來時間（她在這裡調，VPS 上每 5 分鐘照這份叫人；伺服器那半見 relay 的 /v1/farm-schedule）──
    function call(method, p, body) {
        var c = cfg();
        var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var t = setTimeout(function () { try { if (ctl) ctl.abort(); } catch (e) {} }, TIMEOUT);
        return fetch(base(c) + p, {
            method: method,
            headers: Object.assign({ 'Authorization': 'Bearer ' + String(c.token || '').trim() }, body ? { 'Content-Type': 'application/json' } : {}),
            body: body ? JSON.stringify(body) : undefined,
            signal: ctl ? ctl.signal : undefined
        }).then(function (res) {
            if (!res.ok) throw new Error(res.status === 401 ? '通行碼不對' : '伺服器回 ' + res.status);
            return res.json();
        }).finally(function () { clearTimeout(t); });
    }
    var PEOPLE = [{ id: 'aluo', name: '阿洛' }, { id: 'dan', name: '丹' }];
    try {
        if (window.AUI && window.AUI.registerHelp) window.AUI.registerHelp({
            farm_residents: { title: '住戶顧田', body: '打開之後，阿洛和丹會在你排的時間自己醒來，到伺服器上顧他們自己那塊後院，顧完寫日記。\n醒一次會用掉一點你帳號的額度（丹用 Claude，阿洛用 ChatGPT）。\n時間是台灣時間；伺服器每 5 分鐘看一次，所以會晚幾分鐘。「現在叫他起來」也是等下一次看的時候才叫。\n他們要先在伺服器上登入過才叫得起來。每天清晨 4 點結算他們兩塊地。' }
        });
    } catch (e) {}
    function when(sec) {
        var d = new Date(sec * 1000), now = new Date();
        var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
        var y = new Date(now); y.setDate(now.getDate() - 1);
        if (d.toDateString() === y.toDateString()) return '昨天 ' + hm;
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
    }
    function lastLine(st, queued) {
        if (queued) return fa('fa-hourglass-half') + '排好了，幾分鐘內就起來';
        if (!st) return fa('fa-moon') + '還沒醒過';
        var what = st.code === 0 ? '顧完了' : st.code === 124 ? '顧太久被叫停了' : '沒叫起來（可能還沒登入）';
        return fa(st.code === 0 ? 'fa-circle-check' : 'fa-triangle-exclamation') + '上次醒來：' + when(st.at) + '・' + what;
    }
    // opts：{ app, openCloud() }
    function residentsPanel(opts) {
        var wrap = document.createElement('div');
        wrap.className = 'fc-wrap';
        wrap.hidden = true;
        wrap.setAttribute('data-fw-modal', '');
        opts.app.appendChild(wrap);
        var help = (window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('farm_residents') : '';
        var doc = null, err = '', adding = null;
        function card(p) {
            var sc = (doc.schedule || {})[p.id] || { on: false, times: [] };
            var st = (doc.status || {})[p.id], queued = (doc.wakeQueued || {})[p.id];
            var times = sc.times.map(function (t) {
                return '<span class="fr-time">' + esc(t) + '<button type="button" data-fr="del" data-who="' + p.id + '" data-t="' + esc(t) + '" aria-label="拿掉 ' + esc(t) + '">' + fa('fa-xmark') + '</button></span>';
            }).join('');
            var add = adding === p.id
                ? '<input type="time" class="fr-new" data-who="' + p.id + '" aria-label="新的醒來時間">'
                : (sc.times.length < 6 ? '<button type="button" class="fr-add" data-fr="add" data-who="' + p.id + '" aria-label="加一個時間">' + fa('fa-plus') + '</button>' : '');
            return '<section class="fr-card' + (sc.on ? ' is-on' : '') + '">' +
                '<header><strong>' + p.name + '</strong>' +
                '<button type="button" class="fr-switch" role="switch" aria-checked="' + (sc.on ? 'true' : 'false') + '" data-fr="toggle" data-who="' + p.id + '" aria-label="' + p.name + '自己醒來"><i></i></button></header>' +
                '<div class="fr-times"><span class="fr-label">醒來時間</span>' + (times || '<span class="fr-none">還沒排</span>') + add + '</div>' +
                '<p class="fr-last">' + lastLine(st, queued) + '</p>' +
                '<button type="button" class="fc-btn" data-fr="wake" data-who="' + p.id + '"' + (queued ? ' disabled' : '') + '>' + fa('fa-bell') + '現在叫他起來</button>' +
                '</section>';
        }
        function render() {
            var body;
            if (!enabled()) {
                body = '<p class="fc-state is-offline">' + fa('fa-cloud') + '要先開雲端存檔，他們才找得到自己的地。</p>' +
                    '<div class="fc-acts"><button type="button" class="fc-btn is-main" data-fr="cloud">' + fa('fa-cloud') + '打開雲端存檔</button></div>';
            } else if (!doc) {
                body = '<p class="fc-state ' + (err ? 'is-error' : 'is-busy') + '">' + fa(err ? 'fa-triangle-exclamation' : 'fa-cloud-arrow-down') + esc(err || '讀取中…') + '</p>';
            } else {
                body = PEOPLE.map(card).join('') + '<p class="fr-foot">' + fa('fa-moon') + '每天清晨 ' + esc(doc.settle || '04:00') + ' 結算他們兩塊地</p>' +
                    (err ? '<p class="fc-state is-error">' + fa('fa-triangle-exclamation') + esc(err) + '</p>' : '');
            }
            wrap.innerHTML = '<section class="fc-card fr-panel" role="dialog" aria-label="住戶顧田">' +
                '<header class="fc-head"><strong>' + fa('fa-user-clock') + '住戶顧田' + help + '</strong>' +
                '<button type="button" class="fc-close" aria-label="關上">' + fa('fa-xmark') + '</button></header>' +
                '<div class="fc-body">' + body + '</div></section>';
            var inp = wrap.querySelector('.fr-new');
            if (inp) inp.focus({ preventScroll: true });
        }
        function load() {
            err = '';
            if (!enabled()) { render(); return; }
            call('GET', '/v1/farm-schedule').then(function (d) { doc = d; render(); }, function (e) { err = errText(e); render(); });
        }
        function saveSchedule(who, patch) {
            var body = {}; body[who] = patch;
            var sc = doc.schedule[who];
            Object.assign(sc, patch);   // 先畫出來，伺服器回來再照它的
            render();
            call('POST', '/v1/farm-schedule', body).then(function (d) { doc = d; err = ''; render(); }, function (e) { err = '沒存到：' + errText(e); render(); });
        }
        function addTime(who, v) {
            adding = null;
            if (!/^\d\d:\d\d$/.test(v || '')) { render(); return; }
            var times = doc.schedule[who].times.concat([v]).filter(function (t, i, a) { return a.indexOf(t) === i; }).sort();
            saveSchedule(who, { times: times });
        }
        function open() { doc = null; adding = null; render(); wrap.hidden = false; load(); }
        function close() { wrap.hidden = true; }
        wrap.addEventListener('click', function (e) {
            e.stopPropagation();
            if (e.target === wrap || e.target.closest('.fc-close')) { close(); return; }
            var b = e.target.closest('[data-fr]');
            if (!b || b.disabled) return;
            var what = b.getAttribute('data-fr'), who = b.getAttribute('data-who');
            if (what === 'cloud') { close(); if (opts.openCloud) opts.openCloud(); return; }
            if (!doc) return;
            if (what === 'toggle') saveSchedule(who, { on: !doc.schedule[who].on });
            else if (what === 'del') saveSchedule(who, { times: doc.schedule[who].times.filter(function (t) { return t !== b.getAttribute('data-t'); }) });
            else if (what === 'add') { adding = who; render(); }
            else if (what === 'wake') {
                b.disabled = true;
                call('POST', '/v1/farm-wake/' + who).then(function (d) { doc = d; render(); }, function (e) { err = errText(e); render(); });
            }
        });
        // 時間格：選好（change）或離開格子就收；Enter 也收、Esc 取消
        wrap.addEventListener('change', function (e) { var i = e.target.closest('.fr-new'); if (i && i.value) addTime(i.getAttribute('data-who'), i.value); });
        wrap.addEventListener('focusout', function (e) { var i = e.target.closest && e.target.closest('.fr-new'); if (i) setTimeout(function () { if (adding) addTime(i.getAttribute('data-who'), i.value); }, 150); });
        wrap.addEventListener('keydown', function (e) {
            e.stopPropagation();
            var i = e.target.closest && e.target.closest('.fr-new');
            if (i && e.key === 'Enter') { e.preventDefault(); addTime(i.getAttribute('data-who'), i.value); return; }
            if (e.key === 'Escape') { e.preventDefault(); if (adding) { adding = null; render(); } else close(); }
        });
        return { open: open, close: close, destroy: function () {} };
    }

    window.FarmCloud = {
        cfg: cfg, prefill: prefill, enabled: enabled, base: base, meta: meta,
        status: function () { return status; }, onStatus: onStatus,
        openSync: openSync, changed: changed, flush: flush, setOnNewer: setOnNewer,
        connect: connect, disconnect: disconnect, panel: panel, peek: peek, residentsPanel: residentsPanel, BACKUP_KEY: BACKUP_KEY,
        steal: steal, steals: steals, claimSteals: claimSteals, errText: errText
    };
})();
