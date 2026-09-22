// ----------------------------------------------------------------
// [檔案] os_jev_stage.js
// 路徑：os_phone/os/os_jev_stage.js
// 職責：VN 立繪什麼時候收，交給 Jev（決策模型）判斷。
//   每章劇本載入時（vn_core loadScript 尾巴，不 await），把這章切成一段一段（一句台詞或一段旁白算一段，換背景算換場），
//   整場全文交給 Jev；每個人每次開口之後問一題：「他說完這句之後、到他下次開口之前，從第幾段起就不在現場了？」
//   選項＝中間那幾段的段號＋「一直都在」。Jev 選了段號，播到那一段之前就收他的立繪（vn_core _jevStageHit）。
//   Jev 有回答的那一章：AI 寫的第五欄 Leave、[Exit]、「幾行沒開口自動收」都不用，整章聽 Jev。
//   沒填鑰匙、關掉、Jev 沒回應 → 這章照舊聽 AI 寫的 Stay/Leave。一章只聽一邊，不混著用。
// 為什麼（2026-09-23，見丹的記憶 project_jev_optimization_ideas 4a3）：丹寫的四章考卷（9 個真的離場點）
//   AI 的第五欄只收對 1 個；「5 段沒開口自動收」0 個對、收錯 32 次；Jev 選段號 9/9、收錯 2 次。
//   她說這不用影子跑：只是分類，在某個區塊把人拿掉。
// 花費：一章大約每句台詞一題，每通最多 40 題；市價一章約台幣 0.02 元以下，帳記在 OS_JEV_USAGE。
// 鑰匙：沿用大廳設置「決策模型鑰匙」（localStorage npc_decide_key）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    if (win.OS_JEV_STAGE) { if (win !== window) window.OS_JEV_STAGE = win.OS_JEV_STAGE; return; }

    const JEV_URL = 'https://ai-gateway.vercel.sh/v1/evaluate';
    const JEV_MODEL = 'typesafe-ai/jev';
    const LOG_LS = 'jev_stage_log';
    const ON_LS = 'jev_stage_on';
    const LOG_MAX = 20;
    const Q_PER_CALL = 40;
    const MAX_CALLS = 8;          // 題目多到要叫超過這麼多通 → 這章不問 Jev，照 AI 的
    const SEG_MAX = 200;          // 送給 Jev 的每段最多這麼長
    const TXT_MAX = 50;           // 記錄裡每段只留這麼長
    const STAY = '一直都在';

    function _key() { try { return (localStorage.getItem('npc_decide_key') || '').trim(); } catch (e) { return ''; } }
    function isOn() { try { return localStorage.getItem(ON_LS) !== '0'; } catch (e) { return true; } }
    function setOn(on) { try { localStorage.setItem(ON_LS, on ? '1' : '0'); } catch (e) {} }
    function getLog() { try { return JSON.parse(localStorage.getItem(LOG_LS) || '[]'); } catch (e) { return []; } }
    function _push(entry) {
        const log = getLog().filter(e => e.key !== entry.key);
        log.unshift(entry);
        if (log.length > LOG_MAX) log.length = LOG_MAX;
        try { localStorage.setItem(LOG_LS, JSON.stringify(log)); }
        catch (e) { try { localStorage.setItem(LOG_LS, JSON.stringify(log.slice(0, 5))); } catch (e2) {} }
    }
    function clearLog() { try { localStorage.removeItem(LOG_LS); } catch (e) {} }
    function _clean(s) { return String(s || '').replace(/<[^>]+>/g, ' ').replace(/#[A-Za-z0-9_\-&]+#/g, '').replace(/\s+/g, ' ').trim(); }
    function _cut(s, n) { s = _clean(s); return s.length > n ? s.slice(0, n) + '…' : s; }

    // 劇本（vn_core 切好的一行一行）→ 一段一段＋場景切點＋AI 寫的離場點
    //   每段記下它在劇本裡是哪一行（line＝那一行原文、occ＝同樣的原文前面出現過幾次），vn_core 播到那一行就知道到了
    function _parse(script) {
        const segs = [];          // { p, scene, who: 名字或 ''（旁白）, text, line, occ }
        const aiLeave = [];       // { name, scene, from }：從第 from 段起 AI 讓他不在
        let scene = 0, cols = 0, colMissing = 0;
        const pendingExit = [];
        const lines = (script || []).map(r => (typeof r === 'string' ? r : String(r || '')));
        const seen = {};
        let block = null;         // 正在 <call>／<chat>／<browser>… 裡面：{ tag, buf, line, occ }
        const add = (who, text, line, occ) => segs.push({ p: segs.length + 1, scene, who, text, line, occ });
        lines.forEach((raw, i) => {
            const occ = seen[raw] = (seen[raw] == null ? 0 : seen[raw] + 1);
            const l = raw.trim();
            if (!l) return;
            // 🚨 電話、手機聊天、瀏覽器這些區塊裡的人不在現場：電話裡的 [Char] 是聲音（引擎也不立立繪），
            //    聊天室的 [林渝] 訊息是手機畫面。電話逐句當旁白給 Jev 看；其他區塊收成一段「手機畫面」。
            if (block) {
                if (l.toLowerCase().indexOf('</' + block.tag + '>') === 0) {
                    if (block.tag !== 'call' && block.buf.length) add('', '（手機畫面）' + _cut(block.buf.join(' '), 120), block.line, block.occ);
                    block = null;
                } else if (block.tag === 'call') {
                    const mcc = l.match(/^\[(Char|Nar)\|([\s\S]*)\]$/i);
                    if (mcc) {
                        const ps = mcc[2].split('|');
                        add('', mcc[1].toLowerCase() === 'char' ? '（電話裡）' + (ps[0] || '').trim() + '：' + _clean(ps.slice(2).join(' ')) : '（通話中）' + _clean(ps[0]), raw, occ);
                    }
                } else {
                    const tx = _clean(l.replace(/^\[With:[^\]]*\]/i, '').replace(/^\[Time\].*/i, ''));
                    if (tx) block.buf.push(tx);
                }
                return;
            }
            const mo = l.match(/^<([A-Za-z][\w-]*)(?:\s[^>]*)?>$/);
            if (mo && !/\/>$/.test(l)) {
                const tag = mo[1].toLowerCase();
                if (lines.slice(i + 1).some(x => x.trim().toLowerCase().indexOf('</' + tag + '>') === 0)) { block = { tag, buf: [], line: raw, occ }; return; }
            }
            if (/^\[Bg\|/i.test(l)) { scene++; pendingExit.length = 0; return; }
            const mx = l.match(/^\[Exit\|([^|\]]+)/i);
            if (mx) { pendingExit.push(mx[1].trim()); return; }
            const mc = l.match(/^\[Char\|([\s\S]*)\]$/i);
            if (mc) {
                const parts = mc[1].split('|');
                const who = (parts[0] || '').trim();
                const last = (parts[parts.length - 1] || '').trim().toLowerCase();
                cols++;
                if (last === 'stay' || last === 'leave') parts.pop(); else colMissing++;
                if (!who) return;
                add(who, _clean(parts.slice(2).join(' ')), raw, occ);   // 第五欄剝掉：Jev 看不到 AI 寫的 Stay/Leave
                if (last === 'leave') aiLeave.push({ name: who, scene, from: segs.length + 1 });
            } else {
                let text;
                const mn = l.match(/^\[Nar\|([\s\S]*)\]$/i);
                if (mn) text = mn[1].split('|')[0];
                else if (/^\[[A-Za-z_]+[\|\]]/.test(l) || /^</.test(l)) return;   // 其他標籤（音樂、音效、插圖、選項、卡片…）不算一段
                else text = l;
                text = _clean(text);
                if (!text) return;
                add('', text, raw, occ);
            }
            // [Exit] 寫在兩段中間 → 從剛剛這段起就算不在（它是這一段之前寫的）
            while (pendingExit.length) aiLeave.push({ name: pendingExit.shift(), scene, from: segs.length });
        });
        return { segs, aiLeave, cols, colMissing };
    }

    async function _ask(body) {
        let last = '';
        for (let i = 0; i < 3; i++) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 30000);
            try {
                const res = await fetch(JEV_URL, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + _key(), 'Content-Type': 'application/json' },
                    body: JSON.stringify(body), signal: ctrl.signal,
                });
                const d = await res.json().catch(() => null);
                try { win.OS_JEV_USAGE && win.OS_JEV_USAGE.add('stage', d, !!(res.ok && d && d.answers)); } catch (e) {}
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

    // 每個人每次開口之後一題：到他下次開口（或這場結束）之前，從第幾段起不在
    function _questions(ss) {
        const qs = [];
        ss.forEach((s, i) => {
            if (!s.who) return;
            const nx = ss.findIndex((x, j) => j > i && x.who === s.who);
            const between = ss.slice(i + 1, nx < 0 ? ss.length : nx);
            if (!between.length) return;
            if (nx >= 0 && between.length < 2) return;   // 兩句中間只隔一段：不可能走掉又馬上回來開口，問了只會收錯
            const end = nx < 0 ? '這場戲結束' : '他下一次在 P' + ss[nx].p + ' 開口';
            const criteria = {};
            between.forEach(x => { criteria['P' + x.p] = '從 P' + x.p + ' 這段起不在'; });
            criteria[STAY] = '中間一直都在現場';
            qs.push({
                id: 'q' + s.p, name: s.who,
                q: { type: 'choice', criteria, instructions: '「' + s.who + '」在 P' + s.p + ' 說完話之後，到' + end + '之前，他是從第幾段起就不在這個場景裡了？（講電話、傳訊息、只被別人提到、回憶裡出現，都不算在場；如果中間一直都在，選「' + STAY + '」）' },
            });
        });
        return qs;
    }

    function _toPlan(e) { return { removals: (e.removals || []).map(r => ({ name: r.name, p: r.p, line: r.line, occ: r.occ })) }; }

    const _running = {};
    // 回 Promise：{ removals:[{ name, p, line, occ }] }＝這章聽 Jev；null＝這章照舊聽 AI
    async function plan(script, msgId) {
        script = Array.isArray(script) ? script : [];
        if (!isOn() || !script.length || !_key()) return null;
        const key = String(msgId == null ? '?' : msgId) + ':' + script.length + ':' + _cut(script.join(' '), 40);
        const hit = getLog().find(e => e.key === key && e.removals);
        if (hit) return _toPlan(hit);                     // 同一章重開、重播：用上次的答案，不再叫
        if (_running[key]) return _running[key];
        const job = (async () => {
            const { segs, aiLeave, cols, colMissing } = _parse(script);
            const entry = { at: new Date().toLocaleString(), key, msgId: msgId == null ? null : String(msgId), segs: segs.length, cols, colMissing };
            const segText = (p) => { const s = segs[p - 1]; return s ? (s.who ? s.who + '：' : '') + _cut(s.text, TXT_MAX) : ''; };
            entry.ai = aiLeave.map(a => ({ name: a.name, p: a.from, text: segText(a.from) }));
            try {
                const bySc = {};
                segs.forEach(s => { (bySc[s.scene] || (bySc[s.scene] = [])).push(s); });
                const jobs = [];
                Object.keys(bySc).forEach(sc => {
                    const ss = bySc[sc];
                    const qs = _questions(ss);
                    if (!qs.length) return;
                    const state = { '這一場戲（逐段，P 後面是段號）': ss.map(s => 'P' + s.p + ' ' + (s.who ? s.who + '：「' + _cut(s.text, SEG_MAX) + '」' : '旁白：' + _cut(s.text, SEG_MAX))) };
                    for (let i = 0; i < qs.length; i += Q_PER_CALL) jobs.push({ state, qs: qs.slice(i, i + Q_PER_CALL) });
                });
                if (jobs.length > MAX_CALLS) throw new Error('題目太多（要叫 ' + jobs.length + ' 通），這章照 AI 的');
                const removals = [];
                let ms = 0, n = 0;
                for (const j of jobs) {
                    const questions = {};
                    j.qs.forEach(x => { questions[x.id] = x.q; });
                    const t0 = Date.now();
                    const d = await _ask({ model: JEV_MODEL, state: j.state, questions });
                    ms += Date.now() - t0;
                    j.qs.forEach(x => {
                        n++;
                        const a = d.answers[x.id];
                        if (!a || !a.choice || a.choice === STAY) return;
                        const p = parseInt(String(a.choice).replace(/^P/i, ''));
                        const s = segs[p - 1];
                        if (!s) return;
                        const pr = a.probabilities && typeof a.probabilities[a.choice] === 'number' ? Math.round(a.probabilities[a.choice] * 100) / 100 : null;
                        removals.push({ name: x.name, p, line: s.line, occ: s.occ, pr, text: segText(p) });
                    });
                }
                removals.sort((a, b) => a.p - b.p);
                entry.calls = jobs.length; entry.qs = n; entry.ms = ms; entry.removals = removals;
                _push(entry);
                return _toPlan(entry);
            } catch (e) {
                entry.error = String((e && e.message) || e);
                _push(entry);
                return null;
            } finally { delete _running[key]; }
        })();
        _running[key] = job;
        return job;
    }

    // DEBUG 面板用：把最近幾章排成給人看的文字
    function report(limit) {
        const log = getLog().slice(0, limit || 5);
        if (!log.length) return '還沒有記錄。在酒館裡播一章 VN，這裡就會有。';
        const L = [];
        L.push('立繪交給 Jev 收：' + (isOn() ? '開著' : '關著（照 AI 寫的 Stay/Leave）'));
        L.push('段號 P 是這一章裡第幾段（一句台詞或一段旁白算一段）');
        log.forEach((e, i) => {
            L.push('');
            L.push('══ 第 ' + (i + 1) + ' 章（' + e.at + (e.msgId != null ? '，第 ' + e.msgId + ' 樓' : '') + '）共 ' + e.segs + ' 段');
            if (e.error) { L.push('  Jev 沒成：' + e.error + ' → 這章照 AI 寫的 Stay/Leave'); }
            else {
                L.push('  這章聽 Jev｜叫了 ' + e.calls + ' 通、' + e.qs + ' 題，花 ' + ((e.ms || 0) / 1000).toFixed(1) + ' 秒');
                if (!e.removals.length) L.push('  Jev 收的立繪：（沒有，大家都待到換場）');
                else { L.push('  Jev 收的立繪：'); e.removals.forEach(r => L.push('    P' + r.p + ' 收 ' + r.name + (r.pr != null ? '（' + Math.round(r.pr * 100) + '%）' : '') + '｜' + r.text)); }
            }
            if (e.cols) L.push('  AI 寫的台詞 ' + e.cols + ' 句' + (e.colMissing ? '，其中 ' + e.colMissing + ' 句沒寫 Stay/Leave' : ''));
            if (!e.ai || !e.ai.length) L.push('  AI 自己寫的離場：（沒有）');
            else { L.push('  AI 自己寫的離場（Leave／Exit）：'); e.ai.forEach(r => L.push('    P' + r.p + ' ' + r.name + '｜' + r.text)); }
        });
        return L.join('\n');
    }

    win.OS_JEV_STAGE = { plan, report, getLog, clearLog, isOn, setOn, _parse };
    if (win !== window) window.OS_JEV_STAGE = win.OS_JEV_STAGE;
})();
