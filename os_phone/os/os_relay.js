// ----------------------------------------------------------------
// [手機] os_relay.js —— 把回覆交給伺服器跑（請求托管）
// 職責：
//   手機版的 AI 回覆本來是在這支手機上跑的。切出去、鎖屏、或系統要省電，
//   那一輪就斷在半路。這裡把「去要回覆」這件事丟給一直醒著的機器：
//     送出 → 伺服器替手機打上游 API（手機可以睡）→ 好了推一則通知
//     → 回到 app，這支把結果收回來，交給登記過的 app 變成訊息。
//   伺服器端在 VPS：/home/rae/aurelia-relay（只聽本機，外面走 Cloudflare Tunnel）。
// 設定：設置 → 系統 →「回覆交給伺服器跑」，存在 localStorage 'aurelia_relay_cfg'
//   { on, url, token }。網址與通行碼都是她自己填的格子，不內建任何站。
// 🚨 伺服器不存她的 API key：每次請求由這裡把上游設定帶上去，用完就丟。
// 對外：OS_RELAY.enabled() / submit(job) / collect() / onResult(app, fn) / test()
// ----------------------------------------------------------------
(function () {
    const win = window.parent || window;
    const CFG_KEY = 'aurelia_relay_cfg';
    const PEND_KEY = 'aurelia_relay_pending';   // 送出去還沒收回來的：{id: {app, chatId, at}}
    const TIMEOUT = 20000;

    const _handlers = {};
    let _collecting = false;

    function cfg() {
        try { const o = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; }
        catch (e) { return {}; }
    }
    function setCfg(patch) {
        const next = Object.assign(cfg(), patch || {});
        try { localStorage.setItem(CFG_KEY, JSON.stringify(next)); } catch (e) {}
        return next;
    }
    function base() {
        let u = String(cfg().url || '').trim().replace(/\/+$/, '');
        if (!u) return '';
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        return u;
    }
    function enabled() { const c = cfg(); return !!(c.on && base() && String(c.token || '').trim()); }

    async function api(path, opts) {
        const o = opts || {};
        const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = setTimeout(function () { try { if (ctl) ctl.abort(); } catch (e) {} }, o.timeout || TIMEOUT);
        try {
            const res = await fetch(base() + path, {
                method: o.method || 'GET',
                headers: Object.assign({ 'Authorization': 'Bearer ' + String(cfg().token || '').trim() },
                    o.body ? { 'Content-Type': 'application/json' } : {}),
                body: o.body ? JSON.stringify(o.body) : undefined,
                signal: ctl ? ctl.signal : undefined
            });
            const text = await res.text();
            let data = null;
            try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
            if (!res.ok) throw new Error((data && data.error) || ('伺服器回 ' + res.status));
            return data;
        } finally { clearTimeout(timer); }
    }

    function pending() {
        try { const o = JSON.parse(localStorage.getItem(PEND_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; }
        catch (e) { return {}; }
    }
    function savePending(o) { try { localStorage.setItem(PEND_KEY, JSON.stringify(o || {})); } catch (e) {} }

    // job = { app, chatId, title, upstream:{url,key,body}, notify:{title,body,url} }
    async function submit(job) {
        if (!enabled()) throw new Error('沒有開「回覆交給伺服器跑」');
        const r = await api('/v1/job', { method: 'POST', body: job });
        const id = r && r.id;
        if (id) {
            const p = pending();
            p[id] = { app: job.app || '', chatId: job.chatId || '', at: Date.now() };
            savePending(p);
            if (!job.runAt) startPolling();   // 預約的（心跳）不用一直問，到點自然會推
        }
        return id;
    }

    // 回到 app 時把跑完的結果收回來，交給登記的 app 處理
    async function collect() {
        if (!enabled() || _collecting) return 0;
        _collecting = true;
        let done = 0;
        try {
            const list = (await api('/v1/jobs')).jobs || [];
            for (const row of list) {
                let full = null;
                try { full = await api('/v1/job/' + row.id, { timeout: 30000 }); } catch (e) { continue; }
                const p = pending();
                const mine = p[row.id] || {};
                const app = full.app || mine.app || '';
                const fn = _handlers[app];
                try {
                    if (typeof fn === 'function') await fn(full);
                    else console.warn('[Relay] 沒有人認領這個結果：' + app);
                } catch (e) { console.warn('[Relay] 處理結果失敗:', e); }
                delete p[row.id];
                savePending(p);
                try { await api('/v1/job/' + row.id + '/ack', { method: 'POST' }); } catch (e) {}
                done++;
            }
        } catch (e) {
            console.warn('[Relay] 收結果失敗:', (e && e.message) || e);
        } finally { _collecting = false; }
        if (done) console.log('[Relay] 收回 ' + done + ' 筆結果');
        return done;
    }

    function onResult(app, fn) { _handlers[app] = fn; }

    // 🚨 手上還有沒收回來的工作時，留在 app 裡也要去收。
    //    以前只有「切走再切回來」才收（visibilitychange / focus），所以她一直待在聊天室裡
    //    的話，伺服器早就跑完了也沒人去拿 —— 畫面就停在「正在輸入」，看起來像生成超慢。
    //    沒有待收的工作就把輪詢關掉，不留一個永遠在跑的計時器。
    //    剛送出那幾秒問得密一點（短回覆常常兩三秒就好了），之後拉長到五秒一次。
    //    不看 visibilityState：手機一進背景計時器本來就停了，多那個判斷只會讓
    //    「視窗被擋住但其實開著」的情況收不到（桌機分頁、預覽窗都算 hidden）。
    const POLL_STEPS = [1500, 2000, 3000, 4000, 5000];
    let _pollTimer = null, _pollStep = 0;
    function startPolling() {
        if (_pollTimer || !enabled()) return;
        _pollStep = 0;
        const tick = async function () {
            _pollTimer = null;
            if (!enabled() || !Object.keys(pending()).length) return;
            try { await collect(); } catch (e) {}
            if (!Object.keys(pending()).length) return;
            const wait = POLL_STEPS[Math.min(_pollStep++, POLL_STEPS.length - 1)];
            _pollTimer = setTimeout(tick, wait);
        };
        _pollTimer = setTimeout(tick, POLL_STEPS[0]);
    }
    function stopPolling() { if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null; } }

    async function test() {
        const u = base();
        if (!u) throw new Error('還沒填網址');
        const res = await fetch(u + '/health', { method: 'GET' });
        if (!res.ok) throw new Error('連得上但回 ' + res.status);
        await api('/v1/jobs');   // 通行碼對不對
        return true;
    }

    // 回到前台就收一次（推送點進來、或她自己切回來都會走到）
    try {
        win.document.addEventListener('visibilitychange', function () {
            if (win.document.visibilityState === 'visible') setTimeout(collect, 400);
        });
        win.addEventListener('focus', function () { setTimeout(collect, 400); });
    } catch (e) {}
    setTimeout(function () { if (enabled()) { collect(); if (Object.keys(pending()).length) startPolling(); } }, 3000);

    win.OS_RELAY = { cfg: cfg, setCfg: setCfg, enabled: enabled, base: base, submit: submit, collect: collect, onResult: onResult, test: test, pending: pending, startPolling: startPolling, stopPolling: stopPolling };
    if (win !== window) window.OS_RELAY = win.OS_RELAY;
    console.log('📡 [Relay] 請求托管已載入' + (enabled() ? '（開著）' : '（沒開）'));
})();
