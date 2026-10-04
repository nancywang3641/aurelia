// ----------------------------------------------------------------
// [檔案] os_jev_conn.js
// 路徑：os_phone/os/os_jev_conn.js
// 職責：決策模型（Jev 那種只做選擇題、打分數、是非題的模型）連到哪裡：網址、模型、鑰匙三格。
//   設置→API→決策模型那頁填。10-04 以前網址跟模型寫死在每一支用到它的檔案裡（Vercel AI Gateway＋typesafe-ai/jev），
//   鑰匙填在大廳設置；她：「先把jev接口放到 設置吧? 感覺先不要特定URL，這樣到時候我朋友也可以搞一個?」
//   三格都填了才算能用（ready）；少一格就跟以前沒填鑰匙一樣，各功能照舊走自己的退路。
// 誰在讀：書咖的丹（core/void/npc_decide.js）、記憶影子比對（os_jev_shadow.js）、立繪什麼時候收（os_jev_stage.js）、
//   音效和音樂（os_jev_sfx.js）、劇情地點對到地圖（map/vn_map_link.js）。它們直接讀下面三格存檔（不等這支載好），
//   這支只管預設搬家與設置頁讀寫。
// 存檔：localStorage npc_decide_url／npc_decide_model／npc_decide_key（鑰匙沿用舊名，已經填過的不用重填）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    if (win.OS_JEV_CONN) { if (win !== window) window.OS_JEV_CONN = win.OS_JEV_CONN; return; }

    const LS = { url: 'npc_decide_url', model: 'npc_decide_model', key: 'npc_decide_key' };

    function _read(k) { try { return (localStorage.getItem(LS[k]) || '').trim(); } catch (e) { return ''; } }
    function get() { return { url: _read('url'), model: _read('model'), key: _read('key') }; }
    function set(patch) {
        Object.keys(patch || {}).forEach(k => {
            if (!LS[k]) return;
            try { localStorage.setItem(LS[k], String(patch[k] == null ? '' : patch[k]).trim()); } catch (e) {}
        });
    }
    function ready() { const c = get(); return !!(c.url && c.model && c.key); }

    // 搬家：10-04 以前填過鑰匙的裝置，網址跟模型是寫死的那組——補進存檔，照舊能用。
    //   沒填過鑰匙的（新裝的、朋友的）三格都空著，自己填。只做一次：網址那格存過（就算是空字串）就不再動。
    try {
        if (localStorage.getItem(LS.url) === null && _read('key')) {
            set({ url: 'https://ai-gateway.vercel.sh/v1/evaluate', model: 'typesafe-ai/jev' });
        }
    } catch (e) {}

    // 測試：問一題是非題，回 { ok, ms, msg }。設置頁的按鈕用；一按一通。
    async function test() {
        const c = get();
        if (!ready()) return { ok: false, msg: '三格要都填' };
        const t0 = Date.now();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        try {
            const res = await fetch(c.url, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + c.key, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: c.model, state: { '天氣': '下雨' }, questions: { umbrella: { type: 'boolean', instructions: '出門要不要帶傘？' } } }),
                signal: ctrl.signal,
            });
            const data = await res.json().catch(() => null);
            const ms = Date.now() - t0;
            if (!res.ok || !data || !data.answers) {
                return { ok: false, ms, msg: (data && data.error && (data.error.message || data.error)) || ('HTTP ' + res.status) };
            }
            const p = data.answers.umbrella && data.answers.umbrella.probability;
            return { ok: true, ms, msg: typeof p === 'number'
                ? '連上了：問它「下雨天要不要帶傘」，它覺得要的機率 ' + Math.round(p * 100) + '%'
                : '連上了，但回答的樣子跟 Jev 不一樣，功能可能讀不懂' };
        } catch (e) {
            return { ok: false, ms: Date.now() - t0, msg: ctrl.signal.aborted ? '15 秒沒回應' : ((e && e.message) || String(e)) };
        } finally { clearTimeout(timer); }
    }

    win.OS_JEV_CONN = { get, set, ready, test, LS };
    if (win !== window) window.OS_JEV_CONN = win.OS_JEV_CONN;
})();
