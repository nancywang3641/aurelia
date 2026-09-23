// ----------------------------------------------------------------
// [檔案] os_jev_usage.js
// 路徑：os_phone/os/os_jev_usage.js
// 職責：Jev（決策模型）呼叫的「次數＋花費」帳本，給 DEBUG 面板看。
//   每一通 Jev 回來都記一筆：哪個功能叫的、成功或失敗、讀了多少字（token）、花多少錢。
//   錢照 Vercel 回的兩個數字記：cost＝真的從她帳上扣的（免費額度還沒用完時是 0）、marketCost＝照市價算的。
//   按天分格存（localStorage jev_usage），留最近 62 天。
// 誰會記：記憶影子比對（os_jev_shadow.js）、立繪什麼時候收（os_jev_stage.js）、書咖的丹（core/void/npc_decide.js）。
//   它們都寫 window.OS_JEV_USAGE?.add(...)：這支沒載到就少記，不影響功能本身。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    if (win.OS_JEV_USAGE) { if (win !== window) window.OS_JEV_USAGE = win.OS_JEV_USAGE; return; }

    const LS = 'jev_usage';
    const KEEP_DAYS = 62;
    const USD_TWD = 32;   // 只拿來給她一個台幣的感覺，不是精算
    const TAGS = { memory: '記憶影子比對', stage: '立繪什麼時候收', sfx: '音效和音樂', npc: '書咖的丹' };

    function _day(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
    function _load() { try { const o = JSON.parse(localStorage.getItem(LS) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; } }
    function _save(o) {
        const days = Object.keys(o).sort();
        while (days.length > KEEP_DAYS) delete o[days.shift()];
        try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {}
    }
    function _num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

    // tag：memory／stage／npc；data：Jev 回的整包（失敗傳 null）；ok：這通有沒有拿到答案
    function add(tag, data, ok) {
        try {
            const o = _load();
            const d = _day();
            const day = o[d] || (o[d] = {});
            const r = day[tag] || (day[tag] = { n: 0, fail: 0, inTok: 0, outTok: 0, cost: 0, market: 0 });
            r.n++;
            if (!ok) r.fail++;
            const u = data && data.usage;
            if (u) { r.inTok += _num(u.inputTokens); r.outTok += _num(u.outputTokens); }
            const gw = data && data.providerMetadata && data.providerMetadata.gateway;
            if (gw) { r.cost += _num(gw.cost); r.market += _num(gw.marketCost); }
            _save(o);
        } catch (e) {}
    }

    function _sum(o, days) {
        const out = {};
        days.forEach(d => {
            const day = o[d] || {};
            Object.keys(day).forEach(t => {
                const a = out[t] || (out[t] = { n: 0, fail: 0, inTok: 0, outTok: 0, cost: 0, market: 0 });
                Object.keys(a).forEach(k => { a[k] += _num(day[t][k]); });
            });
        });
        return out;
    }
    function _usd(v) { return v < 0.01 ? v.toFixed(5) : v.toFixed(3); }
    function _block(title, s) {
        const L = ['【' + title + '】'];
        const ts = Object.keys(s);
        if (!ts.length) { L.push('  沒有叫過'); return L; }
        let n = 0, fail = 0, cost = 0, market = 0;
        ts.forEach(t => {
            const a = s[t];
            n += a.n; fail += a.fail; cost += a.cost; market += a.market;
            L.push('  ' + (TAGS[t] || t) + '：' + a.n + ' 次' + (a.fail ? '（失敗 ' + a.fail + '）' : '')
                + '，讀了 ' + a.inTok.toLocaleString() + ' token，市價 $' + _usd(a.market) + '，實扣 $' + _usd(a.cost));
        });
        L.push('  合計 ' + n + ' 次' + (fail ? '（失敗 ' + fail + '）' : '') + '，市價 $' + _usd(market)
            + '（約台幣 ' + (market * USD_TWD).toFixed(3) + ' 元），實扣 $' + _usd(cost));
        return L;
    }

    function report() {
        const o = _load();
        const all = Object.keys(o).sort();
        if (!all.length) return '還沒有 Jev 的呼叫記錄。';
        const today = _day();
        const wk = []; for (let i = 0; i < 7; i++) wk.push(_day(new Date(Date.now() - i * 86400000)));
        const month = today.slice(0, 7);
        const L = [];
        L.push('「市價」是照 Jev 定價算的；「實扣」是真的從 Vercel 帳上扣的，免費額度還沒用完時是 0。');
        L.push('');
        L.push(..._block('今天 ' + today, _sum(o, [today])));
        L.push(..._block('最近 7 天', _sum(o, wk)));
        L.push(..._block('這個月 ' + month, _sum(o, all.filter(d => d.indexOf(month) === 0))));
        L.push(..._block('全部（從 ' + all[0] + ' 起）', _sum(o, all)));
        return L.join('\n');
    }
    function clear() { try { localStorage.removeItem(LS); } catch (e) {} }

    win.OS_JEV_USAGE = { add, report, clear };
    if (win !== window) window.OS_JEV_USAGE = win.OS_JEV_USAGE;
})();
