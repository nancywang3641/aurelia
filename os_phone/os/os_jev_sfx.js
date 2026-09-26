// ----------------------------------------------------------------
// [檔案] os_jev_sfx.js
// 路徑：os_phone/os/os_jev_sfx.js
// 職責：VN 的音效和背景音樂交給 Jev（決策模型）配，正文 AI 不再選（也不再每輪讀那兩張清單）。
//   開關：設置→一般→素材「音效和音樂交給 Jev 配」（localStorage jev_sfx_on）。真的生效還要有決策模型鑰匙（npc_decide_key）。
//   生效時 os_vn_rules 會把 BGM／音效清單和那串「翻書≠撕紙」規則從 VN 指令拿掉、vn_core 不理 AI 寫的 #音效# 和 [BGM|]。
// 怎麼問（她 09-23 拍板 B1）：每一格旁白先問「這格發出哪一類聲音」（類別名附幾個範例，加「不放」），
//   有的再問「這一類裡哪一個」；一次最多 10 題（Jev 一批題目太多會回 503）。音樂：每一場（換背景算一場）問一題「配哪首」。
//   考卷（參考資料/STAGE_JEV_LAB）：一定要放的 12/15、硬塞類似的 0、音樂 5/5；一章市價約台幣 0.05 元。
// 什麼時候問：正文 AI 還在寫的時候就開始（vn_avatar_earlybird 每 1.5 秒把寫到一半的正文餵進 feed），
//   後面已經有換行的格才問；一場寫完（換背景或整章結束）才問那場的音樂。章節載入時（plan）把還沒問的補問完，排成時間表交給 vn_core。
// 鑰匙：沿用大廳設置「決策模型鑰匙」。沒鑰匙、關掉、Jev 沒回應 → 那一章照舊聽 AI 寫的（此時清單也照舊送給 AI）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    if (win.OS_JEV_SFX) { if (win !== window) window.OS_JEV_SFX = win.OS_JEV_SFX; return; }

    const JEV_URL = 'https://ai-gateway.vercel.sh/v1/evaluate';
    const JEV_MODEL = 'typesafe-ai/jev';
    const ON_LS = 'jev_sfx_on';
    const LOG_LS = 'jev_sfx_log';
    const LOG_MAX = 20;
    const Q_PER_CALL = 10;
    const NONE = '不放';
    const SEG_MAX = 200;
    const TXT_MAX = 40;
    const MAX_BGM_PER_CHAPTER = 3;   // 她原本的規則「一章最多換 2 次」：第一場一首＋最多換兩次
    const RULE = '只有這一格「真的發出」清單上這個聲音時才選它。清單裡沒有一模一樣的聲音（例如磨豆機、唱歌、吹蠟燭）就選「' + NONE + '」，不要拿類似的來代替；只是提到、回憶、或聲音已經停了也選「' + NONE + '」。大部分的格都應該是「' + NONE + '」。';

    function _key() { try { return (localStorage.getItem('npc_decide_key') || '').trim(); } catch (e) { return ''; } }
    function isOn() { try { return localStorage.getItem(ON_LS) === '1'; } catch (e) { return false; } }
    function setOn(on) { try { localStorage.setItem(ON_LS, on ? '1' : '0'); } catch (e) {} }
    function active() { return isOn() && !!_key(); }
    function getLog() { try { return JSON.parse(localStorage.getItem(LOG_LS) || '[]'); } catch (e) { return []; } }
    function _push(entry) {
        const log = getLog().filter(e => e.key !== entry.key);
        log.unshift(entry);
        if (log.length > LOG_MAX) log.length = LOG_MAX;
        try { localStorage.setItem(LOG_LS, JSON.stringify(log)); }
        catch (e) { try { localStorage.setItem(LOG_LS, JSON.stringify(log.slice(0, 5))); } catch (e2) {} }
    }
    function clearLog() { try { localStorage.removeItem(LOG_LS); } catch (e) {} }
    function _cut(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
    function _VR() { return win.OS_VN_RULES || window.OS_VN_RULES || null; }
    function _ST() { return win.OS_JEV_STAGE || window.OS_JEV_STAGE || null; }

    // ── 清單：跟 VN 指令同一份（設置→素材裡改過的、世界題材開關關掉的，都照那邊）──
    // 音效分類：{ 類名: [id…] }（清單裡的 # 標題就是類）；音樂：[id…]
    function lists() {
        const VR = _VR();
        if (!VR || !VR.getLists || !VR.isOn) return { cats: {}, bgm: [] };
        const cats = {};
        VR.getLists('sfx').filter(x => VR.isOn(x.id)).forEach(x => {
            let cur = '';
            String(x.content || '').split('\n').map(l => l.trim()).forEach(l => {
                if (!l || l[0] === '<') return;
                if (l[0] === '#') { cur = l.replace(/^#+\s*/, ''); if (/清单|清單/.test(cur)) cur = ''; return; }
                if (!cur || !/^[A-Za-z0-9_\-&]+$/.test(l)) return;
                (cats[cur] || (cats[cur] = [])).push(l);
            });
        });
        const bgm = [];
        VR.getLists('bgm').filter(x => VR.isOn(x.id)).forEach(x => {
            String(x.content || '').split('\n').map(l => l.trim()).forEach(l => { if (l && /^[A-Za-z0-9_\-&]+$/.test(l) && bgm.indexOf(l) < 0) bgm.push(l); });
        });
        return { cats, bgm };
    }

    async function _ask(body) {
        let last = '';
        for (let i = 0; i < 4; i++) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 30000);
            try {
                const res = await fetch(JEV_URL, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + _key(), 'Content-Type': 'application/json' },
                    body: JSON.stringify(body), signal: ctrl.signal,
                });
                const d = await res.json().catch(() => null);
                try { win.OS_JEV_USAGE && win.OS_JEV_USAGE.add('sfx', d, !!(res.ok && d && d.answers)); } catch (e) {}
                if (res.ok && d && d.answers) return d;
                last = (d && d.error && d.error.message) || ('HTTP ' + res.status);
                if (res.status !== 503 && res.status !== 429 && res.status < 500) break;
            } catch (e) {
                last = (e && e.name === 'AbortError') ? '逾時' : String((e && e.message) || e);
            } finally { clearTimeout(timer); }
            await new Promise(r => setTimeout(r, 2500 * (i + 1)));
        }
        throw new Error(last || '沒有回應');
    }
    function _pick(a) { return (a && a.choice && a.choice !== NONE) ? a.choice : null; }

    // ── 正文 → 一格一格（借 os_jev_stage 的切法：誰說的、旁白、換場、電話／手機區塊）──
    function _segsOf(lines) {
        const ST = _ST();
        if (!ST || !ST._parse) return [];
        return ST._parse(lines).segs;
    }
    function _isNarr(s) { return !s.who && !/^[<\[]/.test(String(s.line || '').trim()); }   // 真的旁白格（不是電話裡的台詞、不是手機畫面區塊）
    function _stateOf(ss) { return { '這一場戲（逐段，P 後面是格號）': ss.map(s => 'P' + s.p + ' ' + (s.who ? s.who + '：「' + _cut(s.text, SEG_MAX) + '」' : '旁白：' + _cut(s.text, SEG_MAX))) }; }

    // ── 答案快取：同一格文字問過就不再問（swipe、重播、plan 補問都吃這份）──
    const _sfxCache = new Map();   // 格原文 → 音效 id 或 null
    const _bgmCache = new Map();   // 場的第一格原文 → 曲名或 null
    const _asking = new Set();     // 正在問的格原文（避免 feed 連續兩次重複問）
    let _stats = { calls: 0, ms: 0 };
    let _chain = Promise.resolve();   // 一次只跑一條問答（feed 每 1.5 秒來一次，別同時發好幾串）
    function _enqueue(job) { const p = _chain.then(job, job); _chain = p.catch(() => {}); return p; }

    // 問一批旁白格（同一場）：先問類別，再問那一類裡哪一個
    async function _askSfx(ss, targets) {
        const { cats } = lists();
        const catNames = Object.keys(cats);
        if (!catNames.length || !targets.length) { targets.forEach(s => _sfxCache.set(s.line, null)); return; }
        targets.forEach(s => _asking.add(s.line));
        try {
            const state = _stateOf(ss);
            const cc = {}; catNames.forEach(c => { cc[c] = c + '（' + cats[c].slice(0, 6).join('、') + '…）'; }); cc[NONE] = '這格沒有清單上的聲音';
            const picked = {};
            for (let i = 0; i < targets.length; i += Q_PER_CALL) {
                const part = targets.slice(i, i + Q_PER_CALL);
                const qs = {}; part.forEach(s => { qs['p' + s.p] = { type: 'choice', criteria: cc, instructions: '第 P' + s.p + ' 格有沒有發出下面哪一類的聲音？' + RULE }; });
                const t0 = Date.now();
                const d = await _ask({ model: JEV_MODEL, state, questions: qs });
                _stats.calls++; _stats.ms += Date.now() - t0;
                part.forEach(s => { const c = _pick(d.answers['p' + s.p]); if (c && cats[c]) picked[s.p] = { s, cat: c }; else _sfxCache.set(s.line, null); });
            }
            const hits = Object.values(picked);
            for (let i = 0; i < hits.length; i += Q_PER_CALL) {
                const part = hits.slice(i, i + Q_PER_CALL);
                const qs = {}; part.forEach(h => { const c = {}; cats[h.cat].forEach(id => { c[id] = id; }); c[NONE] = '這一類裡沒有對的聲音'; qs['p' + h.s.p] = { type: 'choice', criteria: c, instructions: '第 P' + h.s.p + ' 格要配哪個音效？' + RULE }; });
                const t0 = Date.now();
                const d = await _ask({ model: JEV_MODEL, state, questions: qs });
                _stats.calls++; _stats.ms += Date.now() - t0;
                part.forEach(h => { _sfxCache.set(h.s.line, _pick(d.answers['p' + h.s.p])); });
            }
        } finally { targets.forEach(s => _asking.delete(s.line)); }
    }
    async function _askBgm(ss) {
        const first = ss[0]; if (!first) return;
        const { bgm } = lists();
        if (!bgm.length) { _bgmCache.set(first.line, null); return; }
        _asking.add('bgm:' + first.line);
        try {
            const c = {}; bgm.forEach(b => { c[b] = b; });
            const t0 = Date.now();
            const d = await _ask({ model: JEV_MODEL, state: _stateOf(ss), questions: { bgm: { type: 'choice', criteria: c, instructions: '這一場戲的背景音樂要用哪一首？（只看曲名判斷氣氛）' } } });
            _stats.calls++; _stats.ms += Date.now() - t0;
            const a = d.answers.bgm;
            _bgmCache.set(first.line, (a && a.choice && bgm.indexOf(a.choice) >= 0) ? a.choice : null);
        } catch (e) { /* 這場問不到就先不記，plan 時再補 */ }
        finally { _asking.delete('bgm:' + first.line); }
    }

    // 正文的原文（可能還在寫）→ 一行一行（跟 vn_core loadScript 同一種切法的簡化版）
    function _linesOf(text, final) {
        const noCot = String(text || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
        const ci = noCot.indexOf('<content>');
        if (ci < 0) return [];
        let body = noCot.slice(ci + 9);
        const ce = body.indexOf('</content>');
        if (ce >= 0) body = body.slice(0, ce);
        else if (!final) body = body.slice(0, body.lastIndexOf('\n') + 1);   // 最後一行可能寫到一半，先不要
        return body.replace(/<!--[\s\S]*?-->/g, '').split('\n').map(l => l.trim()).filter(Boolean);
    }
    // 對一份已切好的格（整章或寫到一半的），把還沒問的都問掉；wait=true 等問完
    function _work(segs, final) {
        const bySc = {}; segs.forEach(s => { (bySc[s.scene] || (bySc[s.scene] = [])).push(s); });
        const scenes = Object.keys(bySc).map(k => bySc[k]);
        return _enqueue(async () => {
            for (let i = 0; i < scenes.length; i++) {
                const ss = scenes[i];
                const todo = ss.filter(s => _isNarr(s) && !_sfxCache.has(s.line) && !_asking.has(s.line));
                // 還在寫的時候：這場累積滿 10 格才問（省次數）；最後一場整章寫完才一定問
                const sceneDone = final || i < scenes.length - 1;
                // 🎵 音樂先問（一場一題），再問音效：09-26 她那章叫了 14 通被拒 7 通（429/503），音樂排在一堆音效後面，
                //    輪到時剛好被拒 → 那幾場沒音樂；時間表也拖到 50 秒，章節卡關掉才換歌。
                if (sceneDone && ss[0] && !_bgmCache.has(ss[0].line) && !_asking.has('bgm:' + ss[0].line)) await _askBgm(ss);
                if (todo.length && (sceneDone || todo.length >= Q_PER_CALL)) { try { await _askSfx(ss, todo); } catch (e) { if (i === scenes.length - 1) throw e; } }   // 音效被拒不要擋住後面幾場的音樂
            }
        });
    }

    // 早鳥：正文 AI 還在寫，每 1.5 秒餵一次；final=true 是整則落地
    function feed(text, final) {
        if (!active()) return;
        try {
            const lines = _linesOf(text, !!final);
            if (!lines.length) return;
            _work(_segsOf(lines), !!final);
        } catch (e) {}
    }

    // 章節載入：把還沒問的補問完，排成時間表。回 { sfx:[{line,occ,id}], bgm:[{line,occ,id}] } 或 null（這章照舊）
    async function plan(script, msgId) {
        if (!active() || !Array.isArray(script) || !script.length) return null;
        const segs = _segsOf(script);
        if (!segs.length) return null;
        const key = String(msgId == null ? '?' : msgId) + ':' + script.length + ':' + _cut(script.join(' '), 40);
        const _U = win.OS_JEV_USAGE;
        const saved = _U && _U.loadPlan ? await _U.loadPlan('sfx', script) : null;   // 重開、重播同一章：用存下來的，一通都不叫
        if (saved && Array.isArray(saved.sfx) && Array.isArray(saved.bgm)) return saved;
        const t0 = Date.now(); _stats = { calls: 0, ms: 0 };
        const entry = { at: new Date().toLocaleString(), key, msgId: msgId == null ? null : String(msgId), segs: segs.length };
        try {
            await _work(segs, true);
        } catch (e) { entry.error = String((e && e.message) || e); }
        const sfx = [], bgm = [];
        const bySc = {}; segs.forEach(s => { (bySc[s.scene] || (bySc[s.scene] = [])).push(s); });
        let bgmCount = 0, lastBgm = null;
        Object.keys(bySc).forEach(k => {
            const ss = bySc[k];
            const id = _bgmCache.get(ss[0].line);
            if (id && id !== lastBgm && bgmCount < MAX_BGM_PER_CHAPTER) { bgm.push({ line: ss[0].line, occ: ss[0].occ, id, p: ss[0].p }); lastBgm = id; bgmCount++; }
            ss.forEach(s => { if (_isNarr(s) && _sfxCache.get(s.line)) sfx.push({ line: s.line, occ: s.occ, id: _sfxCache.get(s.line), p: s.p, text: _cut(s.text, TXT_MAX) }); });
        });
        const missing = segs.filter(s => _isNarr(s) && !_sfxCache.has(s.line)).length;
        entry.calls = _stats.calls; entry.ms = Date.now() - t0; entry.jevMs = _stats.ms;
        entry.sfx = sfx.map(x => ({ p: x.p, id: x.id, text: x.text }));
        entry.bgm = bgm.map(x => ({ p: x.p, id: x.id }));
        entry.missing = missing;
        _push(entry);
        if (entry.error && !sfx.length && !bgm.length) return null;   // 完全沒問到 → 這章照舊
        const out = { sfx: sfx.map(x => ({ line: x.line, occ: x.occ, id: x.id })), bgm: bgm.map(x => ({ line: x.line, occ: x.occ, id: x.id })) };
        // 只存問齊的：有一題被拒（音效沒問到、某一場的音樂沒問到）就不存，下次重開再補問，別把缺音樂的那一版存死
        const allBgmAsked = Object.keys(bySc).every(k => _bgmCache.has(bySc[k][0].line));
        if (!entry.error && !missing && allBgmAsked) { try { if (_U && _U.savePlan) _U.savePlan('sfx', script, out); } catch (e) {} }
        return out;
    }

    function report(limit) {
        const log = getLog().slice(0, limit || 5);
        const head = '音效和音樂交給 Jev：' + (isOn() ? (_key() ? '開著' : '開著，但沒填決策模型鑰匙 → 沒生效') : '關著（正文 AI 自己選）');
        if (!log.length) return head + '\n還沒有記錄。開著的話播一章 VN 就會有。';
        const L = [head, '格號 P 是這一章裡第幾格（一句台詞或一段旁白算一格）'];
        log.forEach((e, i) => {
            L.push('');
            L.push('══ 第 ' + (i + 1) + ' 章（' + e.at + (e.msgId != null ? '，第 ' + e.msgId + ' 樓' : '') + '）共 ' + e.segs + ' 格');
            if (e.error) L.push('  Jev 中途沒回應：' + e.error + (e.sfx && e.sfx.length ? '（問到的部分照用）' : ' → 這章照 AI 寫的'));
            L.push('  章節載入時補問 ' + (e.calls || 0) + ' 通、等了 ' + ((e.ms || 0) / 1000).toFixed(1) + ' 秒' + (e.missing ? '（' + e.missing + ' 格沒問到）' : ''));
            L.push('  音樂：' + ((e.bgm && e.bgm.length) ? e.bgm.map(b => 'P' + b.p + ' 起 ' + b.id).join('；') : '（沒選）'));
            if (!e.sfx || !e.sfx.length) L.push('  音效：（這章都不放）');
            else { L.push('  音效：'); e.sfx.forEach(x => L.push('    P' + x.p + ' ' + x.id + '｜' + x.text)); }
        });
        return L.join('\n');
    }

    win.OS_JEV_SFX = { isOn, setOn, active, feed, plan, lists, report, getLog, clearLog };
    if (win !== window) window.OS_JEV_SFX = win.OS_JEV_SFX;
})();
