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
    setTimeout(function () { if (enabled()) collect(); }, 3000);

    win.OS_RELAY = { cfg: cfg, setCfg: setCfg, enabled: enabled, base: base, submit: submit, collect: collect, onResult: onResult, test: test, pending: pending };
    if (win !== window) window.OS_RELAY = win.OS_RELAY;
    console.log('📡 [Relay] 請求托管已載入' + (enabled() ? '（開著）' : '（沒開）'));
})();
