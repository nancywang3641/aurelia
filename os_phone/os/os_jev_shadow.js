// ----------------------------------------------------------------
// [檔案] os_jev_shadow.js
// 路徑：os_phone/os/os_jev_shadow.js
// 職責：記憶召回的「Jev 影子比對」——只看、不改。
//   酒館版每回合副模型抽狀態時兼「記憶導演」：向量撈出跟剛剛那一回合最像的一批記憶（A1…An），
//   副模型挑出下一輪要提醒正文的幾條（state_runtime → OS_VECTOR_INJECT.setPendingRecall）。
//   這支在副模型挑完之後，把「同一批候選、同一段剛發生的劇情」也交給 Jev（決策模型）排一次，
//   兩邊的選擇並排記下來，給 DEBUG 面板「記憶 Jev 影子比對」看。**實際送出去的永遠是副模型挑的**。
// 為什麼（2026-09-23 實驗，見丹的記憶 project_jev_optimization_ideas）：她的真跑團 8 回合，
//   Jev 取排名前 8 必要的全送到、送出量只有副模型的一半；副模型判「過期」大量冤枉還成立的舊事。
//   但只考過兩個短故事、Jev 服務又不穩 → 先在她真的玩的時候影子跑，對過再決定要不要接手。
// 花費：每回合一通 Jev（候選數 × 2 題），約台幣 0.005 元以下。沒填鑰匙、關掉、或 Jev 掛了 → 這輪不比，不影響任何東西。
// 鑰匙：沿用大廳設置「決策模型鑰匙」（localStorage npc_decide_key，npc_decide.js 那把）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    if (win.OS_JEV_SHADOW) return;

    const JEV_URL = 'https://ai-gateway.vercel.sh/v1/evaluate';
    const JEV_MODEL = 'typesafe-ai/jev';
    const LOG_LS = 'jev_shadow_log';
    const ON_LS = 'jev_shadow_on';
    const LOG_MAX = 30;
    const TOP_N = 8;              // 實驗：固定分數門檻在兩主角的故事會漏（好東西只拿 1.1～1.3），排名前 8 才全送到
    const OUTDATED_BELOW = 0.5;
    const TXT_MAX = 70;           // 記錄裡每條記憶只留前 70 字，免得撐爆 localStorage
    const SCENE_MAX = 3000;       // 送給 Jev 的「剛發生的劇情」最多這麼長

    function _key() { try { return (localStorage.getItem('npc_decide_key') || '').trim(); } catch (e) { return ''; } }
    function isOn() { try { return localStorage.getItem(ON_LS) !== '0'; } catch (e) { return true; } }
    function setOn(on) { try { localStorage.setItem(ON_LS, on ? '1' : '0'); } catch (e) {} }
    function getLog() { try { return JSON.parse(localStorage.getItem(LOG_LS) || '[]'); } catch (e) { return []; } }
    function _push(entry) {
        const log = getLog();
        log.unshift(entry);
        if (log.length > LOG_MAX) log.length = LOG_MAX;
        try { localStorage.setItem(LOG_LS, JSON.stringify(log)); }
        catch (e) { try { localStorage.setItem(LOG_LS, JSON.stringify(log.slice(0, 5))); } catch (e2) {} }
    }
    function clearLog() { try { localStorage.removeItem(LOG_LS); } catch (e) {} }
    function _short(s) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > TXT_MAX ? s.slice(0, TXT_MAX) + '…' : s; }
    function _memText(m) { return String((m && (m.summary || m.text)) || '').replace(/\s+/g, ' ').trim(); }

    async function _ask(body) {
        let last = '';
        for (let i = 0; i < 3; i++) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 25000);
            try {
                const res = await fetch(JEV_URL, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + _key(), 'Content-Type': 'application/json' },
                    body: JSON.stringify(body), signal: ctrl.signal,
                });
                const d = await res.json().catch(() => null);
                try { win.OS_JEV_USAGE && win.OS_JEV_USAGE.add('memory', d, !!(res.ok && d && d.answers)); } catch (e) {}
                if (res.ok && d && d.answers) return d;
                last = (d && d.error && d.error.message) || ('HTTP ' + res.status);
                if (res.status !== 503 && res.status !== 429 && res.status < 500) break;   // 不是「忙線」那種就別重試
            } catch (e) {
                last = (e && e.name === 'AbortError') ? '逾時' : String((e && e.message) || e);
            } finally { clearTimeout(timer); }
            await new Promise(r => setTimeout(r, 2500));
        }
        throw new Error(last || '沒有回應');
    }

    // map：{ A1: 記憶物件, … }（getCatalogForPicking 回的那份）；query：剛發生的那一回合；picked：副模型挑的代號
    async function compare(opts) {
        const o = opts || {};
        const map = o.map || {};
        const codes = Object.keys(map);
        const entry = { at: new Date().toLocaleString(), msgId: o.msgId == null ? null : String(o.msgId), n: codes.length };
        try {
            if (!isOn()) return;
            if (!codes.length) return;
            if (!_key()) { entry.skip = '沒填決策模型鑰匙'; _push(entry); return; }
            const scene = String(o.query || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(-SCENE_MAX);
            const qs = {};
            codes.forEach(c => {
                const t = _memText(map[c]);
                qs[c + '_need'] = { type: 'score', instructions: '寫下一回合的劇情時，這條過往記憶「' + t + '」有多需要被提醒？', criteria: ['用不到', '可能有點用', '很有用', '一定要知道'] };
                qs[c + '_true'] = { type: 'boolean', instructions: '根據剛發生的劇情和其他記憶，這條「' + t + '」現在還成立嗎？' };
            });
            const t0 = Date.now();
            const d = await _ask({
                model: JEV_MODEL,
                state: { '剛發生的這一回合劇情': scene, '候選的過往記憶（依時間先後）': codes.map(c => c + '：' + _memText(map[c])) },
                questions: qs,
            });
            entry.ms = Date.now() - t0;
            entry.tokens = d.usage && d.usage.inputTokens;
            const A = d.answers;
            const rows = codes.map(c => ({
                code: c, text: _short(_memText(map[c])),
                need: A[c + '_need'] && typeof A[c + '_need'].score === 'number' ? Math.round(A[c + '_need'].score * 100) / 100 : null,
                stillTrue: A[c + '_true'] && typeof A[c + '_true'].probability === 'number' ? Math.round(A[c + '_true'].probability * 100) / 100 : null,
            }));
            const ranked = rows.filter(r => r.need != null).sort((a, b) => b.need - a.need);
            const jevTop = ranked.slice(0, TOP_N).map(r => r.code);
            const sub = (Array.isArray(o.picked) ? o.picked : []).map(c => String(c).trim().toUpperCase()).filter(c => map[c]);
            const byCode = {}; rows.forEach(r => { byCode[r.code] = r; });
            const view = (c) => ({ code: c, text: byCode[c] ? byCode[c].text : '', need: byCode[c] ? byCode[c].need : null, rank: ranked.findIndex(r => r.code === c) + 1 });
            entry.sub = sub.map(view);
            entry.jev = jevTop.map(view);
            entry.both = sub.filter(c => jevTop.indexOf(c) >= 0);
            entry.onlySub = sub.filter(c => jevTop.indexOf(c) < 0).map(view);
            entry.onlyJev = jevTop.filter(c => sub.indexOf(c) < 0).map(view);
            entry.outdated = rows.filter(r => r.stillTrue != null && r.stillTrue < OUTDATED_BELOW).map(r => ({ code: r.code, text: r.text, stillTrue: r.stillTrue }));
            _push(entry);
        } catch (e) {
            entry.error = String((e && e.message) || e);
            _push(entry);
        }
    }

    // DEBUG 面板用：把最近幾輪排成給人看的文字
    function report(limit) {
        const log = getLog().slice(0, limit || 10);
        if (!log.length) return '還沒有比對記錄。在酒館裡照常玩幾回合（要開著記憶功能、填了決策模型鑰匙），這裡就會有。';
        const L = [];
        L.push('影子比對：' + (isOn() ? '開著' : '關著') + '｜實際送給正文的一律是副模型挑的，這裡只是對照');
        log.forEach((e, i) => {
            L.push('');
            L.push('── 第 ' + (i + 1) + ' 筆（' + e.at + (e.msgId != null ? '，第 ' + e.msgId + ' 樓' : '') + '）候選 ' + e.n + ' 條');
            if (e.skip) { L.push('  沒比：' + e.skip); return; }
            if (e.error) { L.push('  Jev 沒回應：' + e.error); return; }
            L.push('  兩邊都挑：' + (e.both.length ? e.both.join('、') : '（沒有）') + (e.ms ? '　｜Jev 花 ' + (e.ms / 1000).toFixed(1) + ' 秒' : ''));
            L.push('  只有副模型挑（Jev 排第幾）：');
            (e.onlySub.length ? e.onlySub : [{ code: '', text: '（沒有）' }]).forEach(x => L.push('    ' + (x.code ? x.code + '〔第 ' + x.rank + ' 名，' + x.need + '〕' : '') + x.text));
            L.push('  只有 Jev 挑（分數 0～3）：');
            (e.onlyJev.length ? e.onlyJev : [{ code: '', text: '（沒有）' }]).forEach(x => L.push('    ' + (x.code ? x.code + '〔' + x.need + '〕' : '') + x.text));
            if (e.outdated && e.outdated.length) {
                L.push('  Jev 覺得已經不成立：');
                e.outdated.forEach(x => L.push('    ' + x.code + '〔' + x.stillTrue + '〕' + x.text));
            }
        });
        return L.join('\n');
    }

    win.OS_JEV_SHADOW = { compare, report, getLog, clearLog, isOn, setOn };
    if (win !== window) window.OS_JEV_SHADOW = win.OS_JEV_SHADOW;
})();
