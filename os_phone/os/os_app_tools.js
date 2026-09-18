// ----------------------------------------------------------------
// [檔案] os_app_tools.js
// 路徑：os_phone/os/os_app_tools.js
// 職責：創作室做的 app 能用的「手機本身的東西」，四個 st（預覽／手機 app／酒館正則版／劇情裡的共用面板）都叫這一份：
//   ・clock()            故事裡現在幾月幾號幾點＋接下來的約定（主角狀態那個故事時鐘，OS_MC_STATUS）
//   ・share()            以她的身分把一張分享卡送進某個聊天室（跟微博分享同一條路）
//   ・pay() / balance()  手機錢包（WX_WALLET）扣錢；扣成功就記進手機事件簿，劇情會知道錢花在哪
//   ・badge()            桌面圖標右上角的紅點，一個故事一份，她打開那個 app 就清掉
//   ・notify()           手機通知（她在設置開了通知才會出現，OS_KEEPALIVE.notify）
//   ・自己動（wake）      app 詳情頁「自己動」：開關＋多久一次＋機率，跟聊天室「他會主動找我」同一套節奏。
//                        時間到就在背景把那個 app 開起來（看不見），跑它用 st.onWake 登記的那段，跑完關掉。
//                        🚨 只有手機（酒館或 PWA 那一頁）開著時才叫得醒——app 自己的程式只能在頁面裡跑，伺服器替不了。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    function _db() { return win.OS_DB || window.OS_DB; }
    function _cid() { try { const d = _db(); const c = d && d.currentChatId ? d.currentChatId() : null; return c == null ? null : String(c); } catch (e) { return null; } }
    function _ls(k, def) { try { const v = JSON.parse(win.localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
    function _lsSet(k, v) { try { win.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    function _s(v) { return String(v == null ? '' : v).trim(); }

    // ── 故事時鐘 ──
    async function clock() {
        const out = { date: '', time: '', upcoming: [] };
        const M = win.OS_MC_STATUS;
        if (!M || !M.load) return out;
        try {
            const st = await M.load();
            if (!st) return out;
            out.date = st.date ? M.fmtDate(st.date) : '';
            out.time = st.time || '';
            out.upcoming = (M.upcoming ? M.upcoming(st) : []).map(function (e) { return { date: M.fmtDate(e.date), title: String(e.title || '') }; });
        } catch (e) {}
        return out;
    }

    // ── 分享到聊天室 ──
    //   卡片寫法 [AppShare: 來源|標題|內容]，畫法在 wx_view（MSG_TAG.APPSHARE）
    async function share(from, contactId, title, text) {
        const W = win.wxApp;
        contactId = _s(contactId);
        title = _s(title); text = _s(text);
        if (!W || !W.shareCard || !contactId || (!title && !text)) return false;
        const clean = function (s) { return String(s).replace(/[|｜\]\n\r]+/g, ' ').trim(); };
        const src = clean(from || 'App') || 'App';
        const body = '[AppShare: ' + src + '|' + clean(title).slice(0, 60) + '|' + clean(text).slice(0, 200) + ']';
        try { return await W.shareCard(contactId, body, '[' + src + '] ' + (title || text).slice(0, 24)); } catch (e) { return false; }
    }

    // ── 錢包 ──
    async function balance() {
        const W = win.WX_WALLET;
        if (!W) return 0;
        try { if (W.load) await W.load(); } catch (e) {}
        return W.getBalance();
    }
    async function pay(from, amount, why) {
        const W = win.WX_WALLET;
        const amt = Math.round(Number(amount) * 100) / 100;
        if (!W || !(amt > 0)) return false;
        try { if (W.load) await W.load(); } catch (e) {}
        const src = _s(from) || 'App';
        why = _s(why);
        const ok = W.transaction(-amt, src + (why ? '：' + why : ''));
        if (!ok) return false;
        try { if (win.OS_PHONE_EVENTS) await win.OS_PHONE_EVENTS.record({ room: src, line: '花了' + W.money(amt) + (why ? '：' + why : '') }); } catch (e) {}
        return true;
    }

    // ── 紅點（一個故事一份）──
    const BADGE_KEY = 'aurelia_app_badges';
    function _badgeScope() { return _cid() || '_nochat'; }
    function getBadge(appId) {
        const all = _ls(BADGE_KEY, {});
        const m = all[_badgeScope()] || {};
        return Math.max(0, parseInt(m[String(appId)], 10) || 0);
    }
    function badge(appId, n) {
        if (appId == null || appId === '') return;
        const all = _ls(BADGE_KEY, {});
        const sc = _badgeScope();
        const m = all[sc] = all[sc] || {};
        const v = Math.max(0, Math.min(99, parseInt(n, 10) || 0));
        if (v) m[String(appId)] = v; else delete m[String(appId)];
        if (!Object.keys(m).length) delete all[sc];
        _lsSet(BADGE_KEY, all);
        try { if (win.VoidPhoneShell && win.VoidPhoneShell.paintBadges) win.VoidPhoneShell.paintBadges(); } catch (e) {}
    }

    // ── 通知 ──
    async function notify(title, text) {
        text = _s(text);
        if (!text) return false;
        try { const K = win.OS_KEEPALIVE; return (K && K.notify) ? await K.notify(_s(title) || '奧瑞亞', text, 'app-' + _s(title)) : false; } catch (e) { return false; }
    }

    // ── 自己動 ──
    const WAKE_KEY = 'aurelia_app_wake';
    const WAKE_DEF = { mins: 180, chance: 60 };
    const WAKE_TIMEOUT = 120 * 1000;     // app 的那段最多跑這麼久（叫 AI 會等一陣子）
    const TICK_MS = 60 * 1000;
    function wakeCfg(appId) {
        const c = _ls(WAKE_KEY, {})[String(appId)] || {};
        const mins = parseInt(c.mins, 10), chance = parseInt(c.chance, 10);
        return {
            on: !!c.on,
            mins: (isFinite(mins) && mins > 0) ? mins : WAKE_DEF.mins,
            chance: (isFinite(chance) && chance >= 0) ? Math.min(100, chance) : WAKE_DEF.chance,
            last: c.last || 0
        };
    }
    function setWakeCfg(appId, patch) {
        const all = _ls(WAKE_KEY, {});
        const cur = all[String(appId)] || {};
        Object.keys(patch || {}).forEach(function (k) { cur[k] = patch[k]; });
        if (patch && patch.on) cur.last = cur.last || Date.now();   // 剛打開：從現在起算，不要一開就來
        all[String(appId)] = cur;
        _lsSet(WAKE_KEY, all);
    }
    // 這個 app 有沒有寫「自己動」那段（沒寫的，詳情頁不給那組設定——開了也不會動）
    //   st.onWake（創作室）或 window.stOnWake（自己寫的 app）；創作室包出來的頁面本身帶著 st.onWake 的轉接那行，先拿掉再看
    const ST_WRAPPER = 'onWake:function(f){try{if(window.stOnWake)window.stOnWake(f);}catch(e){}}';
    function canWake(rec) { return !!(rec && /onWake\s*\(/i.test(String(rec.html || '').split(ST_WRAPPER).join(''))); }
    function _isOpen(appId) {
        try { return !!win.document.querySelector('.aps-mount iframe.app-iframe[data-app-id="' + String(appId).replace(/"/g, '') + '"]'); } catch (e) { return false; }
    }

    let _running = null;   // { appId, done, timer, cleanup }
    function _finish(ok) {
        const r = _running;
        if (!r) return;
        _running = null;
        clearTimeout(r.timer);
        try { r.cleanup && r.cleanup(); } catch (e) {}
        try { r.host && r.host.remove(); } catch (e) {}
        r.done(!!ok);
    }
    // app 那邊跑完回報（bridge 的 window.onWake 呼叫）
    function wakeDone(appId, ok) { if (_running && String(_running.appId) === String(appId)) _finish(ok); }

    function runWake(rec) {
        return new Promise(function (resolve) {
            if (_running || !rec || !rec.html || !win.AppRuntime || !win.AppRuntime.mountAppIframe) { resolve(false); return; }
            const host = win.document.createElement('div');
            host.className = 'aps-wake-host';
            host.setAttribute('aria-hidden', 'true');
            win.document.body.appendChild(host);
            const r = _running = { appId: rec.id, done: resolve, host: host, timer: 0, cleanup: null };
            r.timer = setTimeout(function () { console.warn('[自己動] 「' + (rec.name || rec.id) + '」跑太久，收掉'); _finish(false); }, WAKE_TIMEOUT);
            r.cleanup = win.AppRuntime.mountAppIframe(host, rec.html, { preview: false, appId: rec.id, provider: rec.provider, wake: true });
        });
    }

    async function tickWake() {
        if (_running || _cid() == null) return;        // 沒開故事不叫：app 存的東西大多跟著故事走
        const D = _db();
        if (!D || !D.getAllPhoneApps) return;
        const cfgAll = _ls(WAKE_KEY, {});
        const ids = Object.keys(cfgAll).filter(function (id) { return cfgAll[id] && cfgAll[id].on; });
        if (!ids.length) return;
        const now = Date.now();
        const apps = (await D.getAllPhoneApps()) || [];
        for (let i = 0; i < ids.length; i++) {
            const c = wakeCfg(ids[i]);
            if (now - c.last < c.mins * 60 * 1000) continue;
            const rec = apps.find(function (a) { return a && String(a.id) === ids[i]; });
            if (!rec || !canWake(rec)) continue;
            setWakeCfg(ids[i], { last: now });                  // 不管擲中沒，重新計時
            if (_isOpen(ids[i])) continue;                      // 她正開著這個 app：不在背後再開一份
            if (Math.random() * 100 >= c.chance) continue;
            console.log('⏰ [自己動] 叫醒「' + (rec.name || rec.id) + '」');
            await runWake(rec);
            break;                                              // 一次只叫一個
        }
    }
    setTimeout(function () { setInterval(function () { tickWake().catch(function () {}); }, TICK_MS); }, 15000);

    const API = {
        clock: clock, share: share, pay: pay, balance: balance,
        badge: badge, getBadge: getBadge, notify: notify,
        wakeCfg: wakeCfg, setWakeCfg: setWakeCfg, canWake: canWake, wakeDone: wakeDone, runWake: runWake, tickWake: tickWake,
        wakeDefaults: function () { return Object.assign({}, WAKE_DEF); }
    };
    win.OS_APP_TOOLS = API;
    if (win !== window) window.OS_APP_TOOLS = API;
})();
