// ----------------------------------------------------------------
// [檔案] os_jev_stage_shadow.js
// 路徑：os_phone/os/os_jev_stage_shadow.js
// 職責：VN 立繪離場的「Jev 影子比對」——只看、不改。
//   現在立繪什麼時候收，靠正文 AI 在每句 [Char|名|表情|台詞|Stay/Leave] 的第五欄寫 Leave、或寫 [Exit|名]；
//   都沒寫就靠引擎「幾行沒開口自動收」。這支在每章劇本載入後（vn_core loadScript 尾巴，不 await），
//   把這一章切成一段一段，對每場戲裡說過話的人，逐段問 Jev「這段他本人在不在現場」（只問他沒開口的那幾段），
//   算出 Jev 認為他從第幾段起不在，跟 AI 寫的 Leave／Exit 並排記下來，給 DEBUG 面板看。
//   **舞台上實際怎麼收立繪完全不變**，照舊聽 AI 的第五欄。
// 為什麼（2026-09-23，見丹的記憶 project_jev_optimization_ideas 4a3）：她想拿掉第五欄、讓 Jev 判斷什麼時候收立繪。
//   實測兩次全對（離開又回來、講電話、只被聊到都分得出來），但只考過短篇 → 先在她真的玩的時候影子跑，對過幾天再決定。
// 花費：一章幾十段 × 在場幾個人，拆成每通最多 60 題，最多 4 通；市價一章約台幣 0.01 元上下，帳記在 OS_JEV_USAGE。
// 鑰匙：沿用大廳設置「決策模型鑰匙」（localStorage npc_decide_key）。沒填、關掉、或 Jev 掛了 → 這章不比，不影響任何東西。
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
    const Q_PER_CALL = 60;        // 目前實測過最多 80 題一通（記憶影子比對 40 條 × 2）；保守一點
    const MAX_CALLS = 4;          // 一章最多叫幾通，超過的場景這章就不比
    const SEG_MAX = 160;          // 送給 Jev 的每段最多這麼長
    const TXT_MAX = 50;           // 記錄裡每段只留這麼長
    const ABSENT_BELOW = 0.5;
    const NEAR = 1;               // 兩邊差一段以內算一致（Leave 寫在告別台詞上，Exit 寫在下一行，本來就會差一點）

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
    function _staleLimit() { const n = parseInt(localStorage.getItem('vn_sprite_stale_limit')); return (isNaN(n) || n < 1) ? 5 : n; }

    // 劇本（vn_core 切好的一行一行）→ 一段一段＋場景切點＋AI 寫的離場點
    function _parse(script) {
        const segs = [];          // { p, scene, who: 名字或 ''（旁白）, text }
        const aiLeave = [];       // { name, scene, from }：從第 from 段起 AI 讓他不在
        let scene = 0, cols = 0, colMissing = 0;
        const pendingExit = [];
        (script || []).forEach(raw => {
            const l = String(raw || '').trim();
            if (!l) return;
            if (/^\[Bg\|/i.test(l)) { scene++; pendingExit.length = 0; return; }
            const mx = l.match(/^\[Exit\|([^|\]]+)/i);
            if (mx) { pendingExit.push(mx[1].trim()); return; }
            let who = '', text = '';
            const mc = l.match(/^\[Char\|([\s\S]*)\]$/i);
            if (mc) {
                const parts = mc[1].split('|');
                who = (parts[0] || '').trim();
                const last = (parts[parts.length - 1] || '').trim().toLowerCase();
                cols++;
                if (last === 'stay' || last === 'leave') parts.pop(); else colMissing++;
                text = parts.slice(2).join(' ');
                if (!who) return;
                segs.push({ p: segs.length + 1, scene, who, text: _clean(text) });
                if (last === 'leave') aiLeave.push({ name: who, scene, from: segs.length + 1 });
            } else {
                const mn = l.match(/^\[Nar\|([\s\S]*)\]$/i);
                if (mn) text = mn[1].split('|')[0];
                else if (/^\[[A-Za-z_]+[\|\]]/.test(l) || /^</.test(l)) return;   // 其他標籤（音樂、音效、插圖、選項、卡片…）不算一段
                else text = l;
                text = _clean(text);
                if (!text) return;
                segs.push({ p: segs.length + 1, scene, who: '', text });
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
                if (res.status !== 503 && res.status !== 429 && res.status < 500) break;
            } catch (e) {
                last = (e && e.name === 'AbortError') ? '逾時' : String((e && e.message) || e);
            } finally { clearTimeout(timer); }
            await new Promise(r => setTimeout(r, 2500));
        }
        throw new Error(last || '沒有回應');
    }

    // 某人在某場的「不在場起點」清單：連續在場 → 某段起不在 → （說不定又回來）
    function _jevLeaves(sceneSegs, name, prob) {
        const out = [];
        let present = false;
        sceneSegs.forEach(s => {
            const here = s.who === name ? 1 : prob[s.p];
            if (here == null) return;
            if (here >= ABSENT_BELOW) present = true;
            else if (present) { present = false; out.push({ from: s.p, prob: here }); }
        });
        return out;
    }

    const _running = {};
    async function compare(opts) {
        const o = opts || {};
        const script = Array.isArray(o.script) ? o.script : [];
        if (!isOn() || !script.length) return;
        const key = String(o.msgId == null ? '?' : o.msgId) + ':' + script.length + ':' + _cut(script.join(' '), 40);
        if (_running[key] || getLog().some(e => e.key === key)) return;   // 同一章重開、重播不再叫
        _running[key] = 1;
        const { segs, aiLeave, cols, colMissing } = _parse(script);
        const entry = { at: new Date().toLocaleString(), key, msgId: o.msgId == null ? null : String(o.msgId), segs: segs.length, cols, colMissing, scenes: [] };
        try {
            if (!_key()) { entry.skip = '沒填決策模型鑰匙'; _push(entry); return; }
            const bySc = {};
            segs.forEach(s => { (bySc[s.scene] || (bySc[s.scene] = [])).push(s); });
            let calls = 0, qs = 0, ms = 0;
            const limit = _staleLimit();
            for (const sc of Object.keys(bySc)) {
                const ss = bySc[sc];
                const names = [];
                ss.forEach(s => { if (s.who && names.indexOf(s.who) < 0) names.push(s.who); });
                if (!names.length) continue;
                // 題目：每個人從第一次開口之後、他沒開口的每一段
                const qlist = [];
                names.forEach((name, ni) => {
                    const first = ss.find(s => s.who === name).p;
                    ss.forEach(s => {
                        if (s.p <= first || s.who === name) return;
                        qlist.push({ id: 'c' + ni + '_p' + s.p, name, p: s.p });
                    });
                });
                const sceneOut = { scene: Number(sc), from: ss[0].p, to: ss[ss.length - 1].p, people: [] };
                const prob = {}; names.forEach(n => { prob[n] = {}; });
                if (qlist.length) {
                    const need = Math.ceil(qlist.length / Q_PER_CALL);
                    if (calls + need > MAX_CALLS) { sceneOut.skip = '題目太多（' + qlist.length + ' 題），這場沒比'; entry.scenes.push(sceneOut); continue; }
                    const state = {
                        '這一場戲（逐段，P 後面是段號）': ss.map(s => 'P' + s.p + ' ' + (s.who ? s.who + '：「' + _cut(s.text, SEG_MAX) + '」' : '旁白：' + _cut(s.text, SEG_MAX))),
                        '這場戲裡說過話的人': names,
                    };
                    for (let i = 0; i < qlist.length; i += Q_PER_CALL) {
                        const part = qlist.slice(i, i + Q_PER_CALL);
                        const questions = {};
                        part.forEach(q => {
                            questions[q.id] = { type: 'boolean', instructions: '第 P' + q.p + ' 段發生的當下，「' + q.name + '」本人在不在這個場景裡？（講電話、傳訊息、只被別人提到、回憶裡出現，都不算在場）' };
                        });
                        const t0 = Date.now();
                        const d = await _ask({ model: JEV_MODEL, state, questions });
                        ms += Date.now() - t0; calls++; qs += part.length;
                        part.forEach(q => {
                            const a = d.answers[q.id];
                            if (a && typeof a.probability === 'number') prob[q.name][q.p] = Math.round(a.probability * 100) / 100;
                        });
                    }
                }
                const segText = (p) => { const s = segs[p - 1]; return s ? (s.who ? s.who + '：' : '') + _cut(s.text, TXT_MAX) : '（這場結束）'; };
                names.forEach(name => {
                    const ai = aiLeave.filter(a => a.name === name && a.scene === Number(sc)).map(a => a.from);
                    const jev = _jevLeaves(ss, name, prob[name]);
                    const used = {};
                    const agree = [], onlyAi = [], onlyJev = [];
                    ai.forEach(f => {
                        const hit = jev.find((j, k) => !used[k] && Math.abs(j.from - f) <= NEAR);
                        if (hit) { used[jev.indexOf(hit)] = 1; agree.push(f); }
                        else onlyAi.push({ from: f, jevProb: prob[name][f] == null ? null : prob[name][f], text: segText(f) });
                    });
                    jev.forEach((j, k) => { if (!used[k]) onlyJev.push({ from: j.from, prob: j.prob, text: segText(j.from) }); });
                    // 兩邊都沒讓他走時，引擎會在他 N 行沒開口後自動收（第五欄拿掉後，Jev 沒判到的就是走這條）
                    let lastSpoke = 0, sweep = null;
                    ss.forEach(s => { if (sweep) return; if (s.who === name) lastSpoke = s.p; else if (lastSpoke && s.p - lastSpoke >= limit) sweep = s.p; });
                    sceneOut.people.push({ name, ai, jev: jev.map(j => j.from), agree, onlyAi, onlyJev, sweep });
                });
                entry.scenes.push(sceneOut);
            }
            entry.calls = calls; entry.qs = qs; entry.ms = ms;
            _push(entry);
        } catch (e) {
            entry.error = String((e && e.message) || e);
            _push(entry);
        } finally { delete _running[key]; }
    }

    // DEBUG 面板用：把最近幾章排成給人看的文字
    function report(limit) {
        const log = getLog().slice(0, limit || 5);
        if (!log.length) return '還沒有比對記錄。在酒館裡照常玩（VN 播一章），這裡就會有。';
        const L = [];
        L.push('立繪離場影子比對：' + (isOn() ? '開著' : '關著') + '｜舞台上實際照 AI 寫的 Stay/Leave 收立繪，這裡只是對照');
        L.push('段號 P 是這一章裡第幾段（一句台詞或一段旁白算一段）');
        log.forEach((e, i) => {
            L.push('');
            L.push('══ 第 ' + (i + 1) + ' 章（' + e.at + (e.msgId != null ? '，第 ' + e.msgId + ' 樓' : '') + '）共 ' + e.segs + ' 段');
            if (e.cols) L.push('  台詞 ' + e.cols + ' 句，' + (e.colMissing ? '其中 ' + e.colMissing + ' 句 AI 沒寫 Stay/Leave' : '每句都有寫 Stay/Leave'));
            if (e.skip) { L.push('  沒比：' + e.skip); return; }
            if (e.error) { L.push('  Jev 沒回應：' + e.error); return; }
            L.push('  Jev 叫了 ' + e.calls + ' 通、' + e.qs + ' 題，花 ' + ((e.ms || 0) / 1000).toFixed(1) + ' 秒');
            let agreeN = 0, diffN = 0;
            (e.scenes || []).forEach((sc, si) => {
                L.push('  ── 第 ' + (si + 1) + ' 場（P' + sc.from + '～P' + sc.to + '）' + (sc.skip ? '：' + sc.skip : ''));
                (sc.people || []).forEach(p => {
                    agreeN += p.agree.length; diffN += p.onlyAi.length + p.onlyJev.length;
                    if (!p.ai.length && !p.jev.length) {
                        L.push('    ' + p.name + '：兩邊都判一直在場到這場結束' + (p.sweep ? '（引擎會在 P' + p.sweep + ' 因為太久沒開口自動收）' : ''));
                        return;
                    }
                    if (p.agree.length) L.push('    ' + p.name + '：一致，P' + p.agree.join('、P') + ' 起不在');
                    p.onlyAi.forEach(x => L.push('    ' + p.name + '：AI 寫 P' + x.from + ' 起不在，Jev 覺得還在'
                        + (x.jevProb != null ? '（' + Math.round(x.jevProb * 100) + '%）' : '') + '｜P' + x.from + ' ' + x.text));
                    p.onlyJev.forEach(x => L.push('    ' + p.name + '：Jev 覺得 P' + x.from + ' 起就不在（在場 ' + Math.round(x.prob * 100) + '%），AI 沒寫離場'
                        + (p.sweep ? '，引擎 P' + p.sweep + ' 才自動收' : '') + '｜P' + x.from + ' ' + x.text));
                });
            });
            L.push('  小計：一致 ' + agreeN + ' 處，不一致 ' + diffN + ' 處');
        });
        return L.join('\n');
    }

    win.OS_JEV_STAGE = { compare, report, getLog, clearLog, isOn, setOn, _parse };
    if (win !== window) window.OS_JEV_STAGE = win.OS_JEV_STAGE;
})();
