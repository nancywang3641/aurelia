// ----------------------------------------------------------------
// [檔案] os_cafe_staff.js
// 路徑：os_phone/os/os_cafe_staff.js
// 職責：☕🧑‍🍳 書咖店員——她從小機／跑團角色挑一位當店員、排一天幾點上班；
//   到點（奧瑞亞開著）店員上一班：腳本排好的客人＋Jev 出的插曲 → 店員叫一通模型決定怎麼接、寫值班日記 → 照表結算 → 來找她。
//   規則在外面：插曲別人出題、做法只能從表上挑、錢和人氣照表算（同後院：AI 自己出題會挑簡單的）。
//   資料全在 app_data book_cafe（staff／shifts），跟書咖同一包備份。
// ⚠️ 排在 os_cafe.js 後面載入；OS_XIAOJI、OS_XIAOJI_MEM、ClawdPortrait 比這支晚到，一律呼叫當下才找
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    // ── 插曲表：Jev 從這裡挑題目，店員只能從 opts 挑做法；pt＝這杯價格的幾倍，incl＝那位客人之後多常來（陣列＝擲骰：前面那個是好結果）──
    const INCIDENTS = {
        no_money: { label: '忘了帶錢', ask: '結帳時發現忘了帶錢', def: 'credit', opts: {
            treat:  { label: '請客', pt: -1, incl: 0.06 },
            credit: { label: '記帳', pt: 0, incl: 0 } } },
        custom: { label: '想點菜單上沒有的', ask: '想點一杯菜單上沒有的東西', def: 'decline', opts: {
            try:     { label: '試做一杯', pt: 0.5, incl: 0.04 },
            decline: { label: '婉拒', pt: 0, incl: -0.02 } } },
        spill: { label: '打翻了飲料', ask: '不小心打翻了飲料', def: 'wipe', opts: {
            remake: { label: '重做一杯', pt: -0.5, incl: 0.04 },
            wipe:   { label: '擦乾就好', pt: 0, incl: -0.03 } } },
        complain: { label: '嫌不好喝', ask: '覺得今天這杯不好喝', def: 'explain', opts: {
            refund:  { label: '退錢', pt: -1, incl: 0.02 },
            explain: { label: '講這杯的想法', pt: 0, incl: [0.03, -0.03] } } },
        chat: { label: '想找店員聊天', ask: '想找店員聊天', def: 'busy', opts: {
            chat: { label: '陪他聊', pt: 0.3, incl: 0.04 },
            busy: { label: '說在忙', pt: 0, incl: -0.02 } } },
        friend: { label: '帶了朋友來', ask: '帶了一個朋友一起來', def: 'normal', opts: {
            welcome: { label: '招待新朋友', pt: 0.5, incl: 0.05 },
            normal:  { label: '照常', pt: 1, incl: 0 } } },
        quiet: { label: '想安靜看書', ask: '只想安靜看書、不想被打擾', def: 'leave', opts: {
            leave: { label: '不打擾', pt: 0, incl: 0.03 },
            book:  { label: '推薦一本書', pt: 0, incl: [0.05, -0.03] } } },
    };
    const KINDS = Object.keys(INCIDENTS);
    const LOCAL_RATE = 0.12;   // 沒有 Jev 鑰匙：每位客人這個機率出一件插曲
    const MAX_INC = 3;         // 一班最多處理幾件插曲

    // ── 純邏輯（tmp/cafe_staff_test.cjs 直接測）──
    function normTimes(list) {
        const arr = Array.isArray(list) ? list : String(list || '').split(/[,，、;；\s]+/);
        const out = [];
        arr.forEach(x => {
            const m = String(x || '').trim().match(/^(\d{1,2}):(\d{2})$/);
            if (!m) return;
            const h = +m[1], mi = +m[2];
            if (h > 23 || mi > 59) return;
            const s = String(h).padStart(2, '0') + ':' + m[2];
            if (out.indexOf(s) < 0) out.push(s);
        });
        return out.sort().slice(0, 6);
    }
    // 最近一個已經過了的上班時間；比上一班晚才算到點（好幾天沒開也只回最近那一格＝只上一班）
    function dueSlot(times, lastAt, now) {
        const ts = normTimes(times).slice().reverse();
        if (!ts.length) return null;
        for (let d = 0; d <= 7; d++) {
            const base = new Date(now); base.setHours(0, 0, 0, 0); base.setDate(base.getDate() - d);
            for (const t of ts) {
                const [h, mi] = t.split(':').map(Number);
                const slot = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, mi).getTime();
                if (slot <= now) return slot > (lastAt || 0) ? slot : null;
            }
        }
        return null;
    }
    function _attr(s, name) {
        const m = String(s || '').match(new RegExp(name + '\\s*=\\s*["“”\'「]([^"“”\'」]*)["“”\'」]', 'i'));
        return m ? m[1].trim() : '';
    }
    function _tag(text, name) {
        const m = String(text || '').match(new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '>', 'i'));
        return m ? m[1].trim() : null;
    }
    // 店員的回覆 → { handles:{插曲序號:{do,say}}, recommend, diary, notify, plan }
    function parseReply(text, o) {
        o = o || {};
        const incs = o.incidents || [], menuNames = o.menuNames || [];
        const t = String(text || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
        const handles = {};
        const re = /<handle\b([^>]*)>([\s\S]*?)<\/handle>/gi;
        let m;
        while ((m = re.exec(t))) {
            const who = _attr(m[1], 'who'), code = _attr(m[1], 'do');
            let idx = incs.findIndex((x, i) => !(i in handles) && x.who === who);
            if (idx < 0 && who) idx = incs.findIndex((x, i) => !(i in handles) && x.who && (who.indexOf(x.who) >= 0 || x.who.indexOf(who) >= 0));
            if (idx < 0) continue;
            const spec = INCIDENTS[incs[idx].kind];
            if (!spec) continue;
            handles[idx] = { do: spec.opts[code] ? code : spec.def, say: m[2].trim().slice(0, 60) };
        }
        let recommend = null;
        const rec = _tag(t, 'recommend');
        if (rec) {
            const raw = rec.replace(/[「」『』"“”]/g, '').trim();
            if (menuNames.indexOf(raw) >= 0) recommend = raw;
            else { const hits = menuNames.filter(n => n && raw.indexOf(n) >= 0); if (hits.length === 1) recommend = hits[0]; }
        }
        const anyTag = /<(handle|recommend|diary|notify|plan)\b/i.test(t);
        let diary = _tag(t, 'diary');
        if (diary == null) diary = anyTag ? '' : t.replace(/<[^>]+>/g, '').trim();
        const notify = (_tag(t, 'notify') || '').slice(0, 60);
        let plan = null;
        if (o.selfPlan) {
            const pm = t.match(/<plan\b([^>]*)>([\s\S]*?)<\/plan>/i);
            if (pm) { const times = normTimes(_attr(pm[1], 'times')); if (times.length) plan = { times, note: pm[2].trim().slice(0, 100) }; }
        }
        return { handles, recommend, diary: diary.slice(0, 200), notify, plan };
    }
    // 照表算：每件插曲一列 { key, who, kind, do, label, say, pt, incl }，pt 加總
    function applyHandles(incs, handles, rand) {
        rand = rand || Math.random;
        let pt = 0;
        const rows = (incs || []).map((inc, i) => {
            const spec = INCIDENTS[inc.kind];
            const h = handles && handles[i];
            const code = (h && spec.opts[h.do]) ? h.do : spec.def;
            const opt = spec.opts[code];
            const p = Math.round(opt.pt * (inc.price || 0));
            const incl = Array.isArray(opt.incl) ? (rand() < 0.5 ? opt.incl[0] : opt.incl[1]) : opt.incl;
            pt += p;
            return { key: inc.key, who: inc.who, kind: inc.kind, do: code, label: opt.label, say: (h && h.say) || '', pt: p, incl };
        });
        return { pt, rows };
    }
    // Jev 的一題答案 → 照機率抽一件（大多是沒事）
    function pickIncident(a, rand) {
        rand = rand || Math.random;
        if (!a) return { kind: 'none', p: 0 };
        let kind = a.choice, p = 1;
        if (a.probabilities && typeof a.probabilities === 'object') {
            const r = rand(); let acc = 0; kind = null;
            for (const k of Object.keys(a.probabilities)) { acc += Number(a.probabilities[k]) || 0; if (r < acc) { kind = k; break; } }
            if (!kind) kind = a.choice;
            p = Number(a.probabilities[kind]) || 0;
        }
        return INCIDENTS[kind] ? { kind, p } : { kind: 'none', p: kind === 'none' ? p : 0 };
    }
    function rankIncidents(cands, cap) {
        return (cands || []).filter(c => c && INCIDENTS[c.kind]).sort((a, b) => b.p - a.p).slice(0, cap || MAX_INC);
    }
    function localIncidents(visits, rand) {
        rand = rand || Math.random;
        return (visits || []).map(() => {
            if (rand() >= LOCAL_RATE) return { kind: 'none', p: 0 };
            return { kind: KINDS[Math.min(KINDS.length - 1, Math.floor(rand() * KINDS.length))], p: LOCAL_RATE };
        });
    }
    function jevQuestions(visits) {
        const criteria = { none: '什麼事都沒發生' };
        KINDS.forEach(k => { criteria[k] = INCIDENTS[k].ask; });
        const qs = {};
        (visits || []).forEach((v, i) => {
            qs['v' + i] = { type: 'choice', criteria,
                instructions: '客人「' + v.name + '」今天在書咖' + (v.item ? '點了「' + v.item + '」' : '沒點東西') + '。' + (v.line || '') +
                    ' 照這位客人的個性，今天在店裡會發生下面哪件事？大多數客人什麼事都沒有。' };
        });
        return qs;
    }

    // ── 資料 ──
    const DEF = { pick: null, on: false, times: ['12:00', '20:00'], selfPlan: false, by: 'rae', note: '', noteAt: 0, lastAt: 0, running: 0, unread: false };
    const RUN_STALE = 5 * 60000;   // 「正在上班」超過這麼久當作沒在跑（分頁中途被關掉）
    const BATCH_MAX = 30, JEV_MAX = 10, KEEP_SHIFTS = 40;
    function _g(n) { return win[n] || window[n]; }
    function _B() { const c = _g('OS_CAFE'); return (c && c._b) || null; }
    function _ls() { return win.localStorage || window.localStorage; }
    function _mkId() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    async function get() {
        const B = _B();
        let v = null;
        try { if (B) v = await B.get('staff', null); } catch (e) {}
        const o = Object.assign({}, DEF, (v && typeof v === 'object') ? v : {});
        o.times = normTimes(o.times);
        return o;
    }
    async function save(patch) {
        const B = _B(); if (!B) return null;
        const v = await B.getStrict('staff', null);   // 讀不到就丟錯：別拿預設值把她的店員設定整份蓋掉
        const next = Object.assign({}, DEF, (v && typeof v === 'object') ? v : {}, patch || {});
        next.times = normTimes(next.times);
        await B.set('staff', next);
        return next;
    }
    // 挑人、休息後再叫他上班：以前沒人處理過的客人標成「之前的」，不算進他的下一班
    //   （不然一週前的客人會被當成這一班，請客真的從錢包扣、經歷簿記下沒發生過的事）
    async function _markPre() {
        const B = _B(); if (!B) return;
        const cur = await B.getStrict('visits', []);
        let n = 0;
        cur.forEach(l => { if (l && !l.sh) { l.sh = 'pre'; n++; } });
        if (n) await B.set('visits', cur);
    }
    async function pickStaff(x) { await _markPre(); return save({ pick: x, on: true, lastAt: Date.now(), running: 0 }); }
    async function setOn(on) {
        if (!on) return save({ on: false });
        await _markPre();
        return save({ on: true, lastAt: Date.now() });
    }
    // 改上班時間：加一個今天已經過了的時間，不會馬上自動上一班（花錢）
    async function setTimes(times) { const cur = await get(); return save({ times: normTimes(times), by: 'rae', lastAt: Math.max(cur.lastAt || 0, Date.now()) }); }

    // ── 名單：小機（宿舍名冊上 provider=xiaoji）＋跑團角色（大廳客人池，各故事最新一輪；同名只留一個）──
    async function candidates() {
        const out = { xiaoji: [], guest: [] };
        let cfg = null;
        try { cfg = JSON.parse(_ls().getItem('os_claude_room_config') || 'null'); } catch (e) {}
        const X = _g('OS_XIAOJI');
        for (const r of ((cfg && Array.isArray(cfg.residents)) ? cfg.residents : [])) {
            if (!r || r.provider !== 'xiaoji') continue;
            let body = 'hamster';
            try { if (X && X.get) body = X.bodyOf(await X.get(r.id)); } catch (e) {}
            out.xiaoji.push({ type: 'xiaoji', id: r.id, name: r.name || '小機', body });
        }
        try {
            const LN = _g('LobbyNpcs');
            const pool = (LN && LN.rollGuestPool) ? await LN.rollGuestPool() : [];
            const seen = new Set();
            (pool || []).forEach(g => {
                if (!g || !g.rawName) return;
                const key = 'jr_' + g.rawName;
                if (seen.has(key)) return;
                seen.add(key);
                out.guest.push({ type: 'guest', key, name: g.name || g.rawName, rawName: g.rawName, chatId: g.chatId || '', story: g.storyTitle || '' });
            });
        } catch (e) {}
        return out;
    }

    // 臉：小機＝宿舍那套像素臉（房間沒載入就沒有）；跑團角色＝頭像快取裡他的大頭
    const _faceMemo = new Map();
    async function faceOf(pick) {
        if (!pick) return '';
        const k = pick.type + ':' + (pick.id || pick.key);
        if (_faceMemo.has(k)) return _faceMemo.get(k);
        let url = '';
        try {
            if (pick.type === 'xiaoji') {
                const CP = _g('ClawdPortrait');
                if (CP && CP.faceOf) url = await CP.faceOf(pick.body || 'hamster');
            } else {
                const LN = _g('LobbyNpcs');   // 跟大廳客人同一套認名字（名_姓、各種拼法）
                const r = (LN && LN.guestLook) ? await LN.guestLook({ chatId: pick.chatId, rawName: pick.rawName || pick.name, name: pick.name }) : null;
                url = (r && r.head) || '';
            }
        } catch (e) {}
        if (url) _faceMemo.set(k, url);
        return url;
    }
    // 站進場景的小機描一圈深色外框，粗細＝宿舍畫像一格像素（8px）。
    //   倉鼠的身體色跟書咖木地板同一色系，沒框會融進地板（她 10-09 看了三種小樣挑這個：tmp/staff_outline_LAB.html）。
    //   宿舍房間裡的樣子不動（房間的底不撞色），只有站進大廳場景的這張加。腳下的淡影子不算身體、不描。
    const OUTLINE_PX = 8, OUTLINE_COLOR = '#2b211c';
    function _outlined(src) {
        const D = win.document || document;
        const w = src.width, h = src.height, pad = OUTLINE_PX + 2;
        const px = src.getContext('2d').getImageData(0, 0, w, h).data;
        const mask = D.createElement('canvas'); mask.width = w; mask.height = h;
        const mc = mask.getContext('2d'), md = mc.createImageData(w, h);
        for (let i = 3; i < px.length; i += 4) if (px[i] > 60) md.data[i] = 255;
        mc.putImageData(md, 0, 0);
        mc.globalCompositeOperation = 'source-in'; mc.fillStyle = OUTLINE_COLOR; mc.fillRect(0, 0, w, h);
        const out = D.createElement('canvas'); out.width = w + pad * 2; out.height = h + pad * 2;
        const o = out.getContext('2d'); o.imageSmoothingEnabled = false;
        [[OUTLINE_PX, 0], [-OUTLINE_PX, 0], [0, OUTLINE_PX], [0, -OUTLINE_PX]].forEach(([dx, dy]) => o.drawImage(mask, pad + dx, pad + dy));
        o.drawImage(src, pad, pad);
        return out;
    }
    // 站在書咖櫃台的樣子：小機穿上它在宿舍換的衣服（衣櫃那套），拿不到就用沒打扮的（一樣描框）
    async function lookOf(pick) {
        if (!pick || pick.type !== 'xiaoji') return faceOf(pick);
        const CP = _g('ClawdPortrait'), RW = _g('RoomWear'), X = _g('OS_XIAOJI');
        if (!CP || !CP.renderStill || !CP.crop) return '';
        const stand = async (wear) => {
            const cv = (win.document || document).createElement('canvas');
            await CP.renderStill(cv, wear, 'idle', 1, pick.body || 'hamster');
            return CP.crop(_outlined(cv)) || '';
        };
        try {
            const rec = (X && X.get) ? await X.get(pick.id) : null;
            const wear = (RW && RW.client && rec && rec.wear) ? RW.client(rec.wear) : null;
            return await stand(wear);
        } catch (e) {
            try { return await stand(null); } catch (e2) { return faceOf(pick); }
        }
    }

    // 上班當下找人：還在不在、用什麼身分說話、走哪個接口
    async function _resolve(pick) {
        if (!pick) return null;
        if (pick.type === 'xiaoji') {
            const X = _g('OS_XIAOJI'), MEM = _g('OS_XIAOJI_MEM');
            if (!X || !X.get || !X.connConfig) return null;
            const list = (await candidates()).xiaoji;
            const me = list.find(x => x.id === pick.id);
            if (!me) return null;
            const rec = await X.get(pick.id);
            const bodyName = ((X.BODIES || []).find(b => b.id === X.bodyOf(rec)) || {}).name || '';
            let lines = '';
            try { if (MEM && MEM.personaLines) lines = await MEM.personaLines(pick.id); } catch (e) {}
            const user = X.USER || '使用者';
            const sys = '你是' + me.name + '，' + (bodyName ? '一隻' + bodyName + '樣子的' : '') + '小 AI，住在奧瑞亞的宿舍。' +
                (rec.about ? '\n' + user + '對你的描述：' + String(rec.about).slice(0, 300) : '') + (lines ? '\n' + lines : '') +
                '\n今天你在視差書咖當店員。書咖是' + user + '開的店，她現在不在店裡，回來會看你留的值班日記。';
            return { name: me.name, owner: user, sys, conn: X.connConfig(rec), rid: pick.id };
        }
        const B = _B();
        const roster = B ? await B.roster() : [];
        const r = (roster || []).find(x => x.stableKey === pick.key);
        if (!r) return null;
        const sys = '你是' + r.name + '。以下是你的人設：\n' + String(r.persona || '').slice(0, 800) +
            '\n今天你在視差書咖幫忙顧店。書咖的店主現在不在店裡，回來會看你留的值班日記。';
        return { name: r.name, owner: '店主', sys, conn: null, rid: null, selfKeys: roster.filter(x => x.stableKey === pick.key).map(x => x.key) };
    }

    // ── Jev 出題：一位客人一題，一通（最多 10 位）；沒鑰匙或失敗＝本地擲骰 ──
    async function _jevAsk(body) {
        const J = _g('OS_JEV_CONN');
        const c = J && J.get ? J.get() : {};
        let last = '';
        for (let i = 0; i < 2; i++) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 20000);
            try {
                const res = await fetch(c.url, { method: 'POST', headers: { 'Authorization': 'Bearer ' + c.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
                const d = await res.json().catch(() => null);
                try { const U = _g('OS_JEV_USAGE'); if (U) U.add('cafe', d, !!(res.ok && d && d.answers)); } catch (e) {}
                if (res.ok && d && d.answers) return d;
                last = (d && d.error && d.error.message) || ('HTTP ' + res.status);
                if (res.status !== 503 && res.status !== 429 && res.status < 500) break;
            } catch (e) { last = (e && e.name === 'AbortError') ? '逾時' : String((e && e.message) || e); }
            finally { clearTimeout(timer); }
            await new Promise(r => setTimeout(r, 2500));
        }
        throw new Error(last || '沒有回應');
    }
    async function _incidents(visits, roster) {
        const idx = visits.map((v, i) => i);
        for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
        const pickIdx = idx.slice(0, JEV_MAX).sort((a, b) => a - b);
        const sample = pickIdx.map(i => visits[i]);
        const J = _g('OS_JEV_CONN');
        if (J && J.ready && J.ready()) {
            try {
                const brief = {};
                sample.forEach(v => { const r = (roster || []).find(x => x.key === v.key); if (r && r.persona) brief[v.name] = String(r.persona).slice(0, 160); });
                const d = await _jevAsk({ model: J.get().model, state: { '地點': '視差書咖', '客人的個性': brief }, questions: jevQuestions(sample) });
                return sample.map((v, j) => Object.assign({ i: pickIdx[j] }, pickIncident(d.answers['v' + j])));
            } catch (e) { console.warn('[CafeStaff] Jev 出題失敗，改本地擲骰', e); }
        }
        return localIncidents(sample).map((x, j) => Object.assign({ i: pickIdx[j] }, x));
    }

    // ── 店員那一通的話 ──
    function _prompt(who, st, menu, visits, incs, rec) {
        const L = [];
        const d = new Date(st.lastAt || Date.now());
        L.push('【這一班】從 ' + (st.lastAt ? (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '開店') + ' 到現在');
        L.push('【菜單】' + (menu.length ? menu.map(m => m.name + '（' + m.price + ' PT）').join('、') : '還沒有上架的飲品'));
        L.push('【目前推薦】' + (rec && rec.name ? rec.name : '還沒有'));
        L.push('', '【這段時間的客人】（時間・名字・點了什麼・當時的樣子）');
        const B = _B(), today = B ? B.dayNum(Date.now()) : null;
        const md = day => { const t = new Date(day * 86400000); return (t.getMonth() + 1) + '/' + t.getDate() + ' '; };
        visits.forEach(v => L.push('- ' + (v.day != null && v.day !== today ? md(v.day) : '') + (B ? B.hm(v.t) : '') + ' ' + v.name + (v.item ? ' 點了' + v.item : '') + '：' + v.line));
        if (incs.length) {
            L.push('', '【插曲】每件挑一種做法，寫做法代碼');
            incs.forEach((x, i) => {
                const sp = INCIDENTS[x.kind];
                L.push((i + 1) + '. ' + x.who + '：' + sp.ask + '。做法：' + Object.keys(sp.opts).map(k => k + '＝' + sp.opts[k].label).join('；'));
            });
        }
        if (st.selfPlan) {
            L.push('', '【你的上班時間】現在排的是 ' + (st.times.length ? st.times.join('、') : '還沒排') + '。' + (st.note ? '上一班留給自己的交接條：' + st.note : '') + '你可以重新排，一天最多六個時間。');
        }
        L.push('', '【要交的東西】只交下面這些標籤，標籤外面不要寫字：');
        if (incs.length) L.push('<handle who="客人名字" do="做法代碼">你對他說的話或做的事，一句</handle>　每件插曲一個');
        L.push('<recommend>菜單上一個品名</recommend>　接下來想推薦給客人的那杯；不想換就寫「不換」');
        L.push('<diary>值班日記</diary>　用你自己的口吻寫這一班發生的事，150 字以內');
        L.push('<notify>傳給' + who.owner + '的一句話</notify>　40 字以內');
        if (st.selfPlan) L.push('<plan times="HH:MM,HH:MM">留給下一班自己的交接條</plan>　times 是你想上班的時間，交接條 100 字以內');
        return [{ role: 'system', content: who.sys }, { role: 'user', content: L.join('\n') }];
    }
    const _cfg = { CALL_TIMEOUT: 180000 };   // 模型三分鐘不回＝這班沒上成（不然整個分頁永遠卡在「上班中」）
    function _call(who, msgs) {
        const A = _g('OS_API');
        if (!A || !A.chat) return Promise.reject(new Error('沒有模型可以叫'));
        let config, options;
        if (who.conn) { config = Object.assign({}, who.conn.config); options = Object.assign({}, who.conn.options); }
        else {
            const S = _g('OS_SETTINGS') || {};
            const sec = S.getSecondaryConfig ? S.getSecondaryConfig() : null;
            const base = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : (S.getConfig ? S.getConfig() : {});
            config = Object.assign({}, base, { customCot: '', customCotMap: {}, usePresetPrompts: false });   // 每班不多送她整份預設（同小機那條）
            options = { task: 'cafe' };
        }
        config.route = 'cafe_staff';
        const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        return new Promise((resolve, reject) => {
            let over = false;
            const timer = setTimeout(() => { over = true; try { if (ctrl) ctrl.abort(); } catch (e) {} reject(new Error('逾時')); }, _cfg.CALL_TIMEOUT);
            A.chat(msgs, config, null,
                t => { if (over) return; clearTimeout(timer); resolve(t); },
                e => { if (over) return; clearTimeout(timer); reject(e); },
                Object.assign(options, { label: '書咖值班', keepCodeFences: true, signal: ctrl ? ctrl.signal : undefined }));
        });
    }

    // ── 上一班 ──
    let _busy = null;
    const _listeners = new Set();
    function _emit() { _listeners.forEach(f => { try { f(); } catch (e) {} }); try { const B = _B(); if (B) B.refresh(); } catch (e) {} }
    function runShift(o) {
        if (_busy) return _busy;
        const job = () => _shift(o || {});
        const L = (win.navigator && win.navigator.locks) || (typeof navigator !== 'undefined' && navigator.locks) || null;
        _busy = (L && L.request ? L.request('aurelia_cafe_shift', { ifAvailable: true }, lock => lock ? job() : { skipped: 'locked' }) : job())
            .finally(() => { _busy = null; });
        return _busy;
    }
    async function _shift(o) {
        const B = _B();
        if (!B) return { skipped: 'nocafe' };
        let st = await get();
        if (!st.pick) return { skipped: 'nopick' };
        if (!o.force && (!st.on || !dueSlot(st.times, st.lastAt, Date.now()))) return { skipped: 'notdue' };
        if (st.running && Date.now() - st.running < RUN_STALE) return { skipped: 'running' };
        const who0 = await _resolve(st.pick);
        if (!who0 && !o.force) { await save({ lastAt: Date.now() }); _emit(); return { skipped: 'missing' }; }   // 頁面上會寫「找不到他」，排程不另外吵她
        st = await save({ running: Date.now() });
        _emit();
        const rec = { id: _mkId(), at: Date.now(), from: st.lastAt || 0, staff: { type: st.pick.type, id: st.pick.id || st.pick.key, name: st.pick.name },
            visits: 0, cups: 0, earned: 0, pt: 0, quiet: false, error: '', incidents: [], recommend: null, diary: '', notify: '', plan: null };
        let who = null, done = [], committed = false;
        try {
            who = who0;
            if (!who) throw new Error('找不到' + st.pick.name);
            try { await B.settle(); } catch (e) {}
            const roster = await B.roster();
            const logs = await B.get('visits', []);
            const mine = new Set(who.selfKeys || []);
            const fresh = (logs || []).filter(l => l && !l.sh && !l.ev && l.key);
            done = fresh.map(l => l.id);   // 店員自己來喝的那筆也算處理過
            const visits = fresh.filter(l => !mine.has(l.key)).slice(0, BATCH_MAX).reverse();   // 舊到新
            rec.visits = visits.length; rec.cups = visits.filter(v => v.price).length; rec.earned = visits.reduce((s, v) => s + (v.price || 0), 0);
            if (!visits.length) rec.quiet = true;
            else {
                const menu = await B.menu();
                const shop = await B.shop();
                const top = rankIncidents(await _incidents(visits, roster));
                const incs = top.sort((a, b) => a.i - b.i).map(c => ({ key: visits[c.i].key, who: visits[c.i].name, kind: c.kind, price: visits[c.i].price || 0 }));
                const reply = await _call(who, _prompt(who, st, menu, visits, incs, shop.recommend));
                const parsed = parseReply(reply, { incidents: incs, menuNames: menu.map(m => m.name), selfPlan: st.selfPlan });
                const applied = applyHandles(incs, parsed.handles);
                Object.assign(rec, { incidents: applied.rows, pt: applied.pt, diary: parsed.diary, notify: parsed.notify, recommend: parsed.recommend, plan: parsed.plan });
                // 照表結算：常來的機率、推薦那杯、錢（從這裡開始寫了＝這批算處理過，後面出錯也不重套）
                const npcs = await B.getStrict('npc', {});
                committed = true;
                applied.rows.forEach(r => { const s = npcs[r.key]; if (s && r.incl) s.incl = Math.round(Math.min(1, Math.max(0.1, (s.incl || 0.5) + r.incl)) * 1000) / 1000; });
                await B.set('npc', npcs);
                if (parsed.recommend) {
                    const m = menu.find(x => x.name === parsed.recommend);
                    const shopNow = await B.getStrict('shop', {});
                    shopNow.recommend = { id: m.id, name: m.name, by: who.name, at: Date.now() };
                    await B.set('shop', shopNow);
                }
                const PT = _g('OS_PT');
                if (PT && applied.pt > 0 && PT.addPT) await PT.addPT(applied.pt, { reason: '書咖值班' });
                else if (PT && applied.pt < 0 && PT.spendPT) { const r = await PT.spendPT(-applied.pt, '書咖值班'); if (r && !r.ok) rec.ptShort = true; }
            }
        } catch (e) {
            rec.error = String((e && e.message) || e).slice(0, 120);
            if (!committed) done = [];   // 沒上成：這批客人留給下一班
        }
        try {
            if (done.length) {
                const cur = await B.getStrict('visits', []);
                const ids = new Set(done);
                cur.forEach(l => { if (ids.has(l.id)) l.sh = rec.id; });
                await B.set('visits', cur);
            }
            const shifts = await B.getStrict('shifts', []);
            shifts.unshift(rec);
            await B.set('shifts', shifts.slice(0, KEEP_SHIFTS));
            const patch = { running: 0, lastAt: Date.now(), unread: !rec.quiet || !!rec.error };
            if (rec.plan && st.selfPlan) Object.assign(patch, { times: rec.plan.times, note: rec.plan.note, noteAt: Date.now(), by: 'self' });
            await save(patch);
        } catch (e) { try { await save({ running: 0 }); } catch (e2) {} }
        if (who && who.rid && !rec.quiet && !rec.error) _remember(who.rid, rec);
        _notify(rec, who);
        _emit();
        return rec;
    }
    function _shiftText(rec) {
        const inc = rec.incidents.map(r => r.who + INCIDENTS[r.kind].label + '，我' + r.label + (r.say ? '：「' + r.say + '」' : '')).join('；');
        return (rec.diary || '值了一班。') + '（這班 ' + rec.visits + ' 位客人' + (inc ? '；' + inc : '') + (rec.recommend ? '；改推' + rec.recommend : '') + '）';
    }
    async function _remember(rid, rec) {
        const MEM = _g('OS_XIAOJI_MEM');
        if (!MEM || !MEM.log) return;
        try {
            await MEM.log(rid, { kind: 'cafe', text: _shiftText(rec) });
            if (MEM.embedPending) MEM.embedPending(rid).catch(() => {});
        } catch (e) { console.warn('[CafeStaff] 寫進經歷簿失敗', e); }
    }
    function _notify(rec, who) {
        if (rec.quiet && !rec.error) return;
        const name = (who && who.name) || rec.staff.name || '店員';
        const text = rec.error ? '這班沒上成：' + rec.error : (rec.notify || '上完一班了。');
        let hidden = false;
        try { hidden = (win.document || document).visibilityState === 'hidden'; } catch (e) {}
        if (hidden) { try { const K = _g('OS_KEEPALIVE'); if (K && K.notify) K.notify(name + '（書咖）', text, 'cafe-shift'); } catch (e) {} return; }
        try { const A = _g('AUI'); if (A && A.toast) A.toast(name + '（書咖）：' + text, { type: rec.error ? 'warn' : 'info' }); } catch (e) {}
    }

    // ── 排程：奧瑞亞開著時每分鐘看一次；好幾天沒開也只補最近那一班 ──
    async function tick() {
        try {
            const st = await get();
            if (!st.on || !st.pick) return;
            if (st.running && Date.now() - st.running < RUN_STALE) return;
            if (!dueSlot(st.times, st.lastAt, Date.now())) return;
            await runShift({});
        } catch (e) { console.warn('[CafeStaff] 排程', e); }
    }
    let _ticking = false;
    function start() {
        if (_ticking) return;
        _ticking = true;
        setTimeout(() => { tick(); setInterval(tick, 60000); }, 20000);
    }

    // ── 店員頁（書咖櫃台窗第七頁）──
    try {
        const A = _g('AUI');
        if (A && A.registerHelp) A.registerHelp({ cafe_staff: { title: '店員', body:
            '挑一位小機或跑團角色當書咖的店員，照你排的時間上班。\n' +
            '每上一班會叫一次模型：小機用他自己的門卡，跑團角色用設置裡「書咖」那一列。這段時間沒有客人就不叫。\n' +
            '上班前會先算好這段時間的客人；如果那天還沒算過，第一次上門的客人定口味、本命或吃膩的事也會在這時候叫模型（跟你打開櫃台時一樣，一天一次）。\n' +
            '店員會處理客人的小插曲（忘了帶錢、打翻飲料……）、決定接下來推薦哪一杯、寫值班日記。請客、退錢會從錢包扣，小費會進錢包。\n' +
            '小機會把值班的事記進自己的經歷簿，之後聊天記得；跑團角色只記在店裡。\n' +
            '奧瑞亞關著的時候不上班；下次打開，錯過的只補一班。\n' +
            '打開「讓他自己排」：他每次下班會自己排下一次的上班時間（一天最多六個），還會留一張交接條給自己。' } });
    } catch (e) {}
    let _pickerOpen = false, _lastCands = null;
    function _pad(n) { return String(n).padStart(2, '0'); }
    function _faceFallback(x) { return x.type === 'xiaoji' ? '<i class="fa-solid fa-paw"></i>' : esc(String(x.name || '?').slice(0, 1)); }
    function _faceImg(x, url) { return '<img alt="" class="' + (x.type === 'xiaoji' ? 'is-px' : '') + '" src="' + esc(url) + '">'; }
    function _ensureStyle(doc) {
        if (doc.getElementById('os-cafe-staff-style')) return;
        const st = doc.createElement('style');
        st.id = 'os-cafe-staff-style';
        st.textContent =
            '.ocs-top{display:flex;gap:12px;align-items:center;margin-bottom:10px;}' +
            '.ocs-frame{width:96px;height:96px;flex:none;box-sizing:border-box;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border:1.5px solid #b98a55;background:rgba(255,253,248,.78);color:#6a4b30;padding:0;font:inherit;}' +
            '.ocs-frame.is-empty{border-style:dashed;border-color:#c4a67c;background:transparent;cursor:pointer;color:#9b7a57;font-size:12px;}.ocs-frame.is-empty i{font-size:20px;}' +
            '.ocs-frame.is-off{filter:grayscale(.5);opacity:.75;}.ocs-frame.is-missing{border-style:dashed;border-color:#c45243;}' +
            '.ocs-face{width:52px;height:52px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#efe3d2;color:#8a5c34;font-size:22px;font-weight:800;}' +
            '.ocs-face img,.ocs-cface img{width:100%;height:100%;object-fit:cover;}.ocs-face img.is-px,.ocs-cface img.is-px{image-rendering:pixelated;object-fit:contain;}' +
            '.ocs-fname{font-size:12px;font-weight:800;max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
            '.ocs-side{display:flex;flex-direction:column;gap:8px;min-width:0;}' +
            '.ocs-state{align-self:flex-start;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#efe3d2;color:#896b4d;}.ocs-state.is-on{background:rgba(78,139,87,.15);color:#3c6b44;}.ocs-state.is-missing{background:rgba(196,82,67,.12);color:#a5402f;}' +
            '.ocs-acts{display:flex;gap:6px;flex-wrap:wrap;}.ocs-acts button{padding:5px 11px;border:1px solid #d3bf9f;border-radius:9px;background:rgba(255,255,255,.6);color:#6a4b30;font-size:11px;cursor:pointer;}' +
            '.ocs-hint{color:#9b8267;font-size:12px;line-height:1.6;}' +
            '.ocs-picker{margin:0 0 10px;padding:9px;border:1px solid rgba(194,164,124,.5);border-radius:12px;background:rgba(255,253,248,.6);}' +
            '.ocs-glabel{margin:2px 2px 6px;color:#7e5b39;font-size:11px;font-weight:800;}.ocs-gnone{color:#a18465;font-size:11px;margin:0 2px 8px;}' +
            '.ocs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:6px;margin-bottom:8px;}' +
            '.ocs-cand{display:flex;flex-direction:column;align-items:center;gap:4px;padding:7px 4px;border:1px solid #dcc9aa;border-radius:10px;background:rgba(255,255,255,.55);color:#5a4030;cursor:pointer;min-width:0;font:inherit;}.ocs-cand.is-cur{border-color:#8a5c34;background:#f2dfc6;}' +
            '.ocs-cface{width:40px;height:40px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#efe3d2;color:#8a5c34;font-weight:800;}' +
            '.ocs-cname{font-size:11px;font-weight:700;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.ocs-cand small{font-size:9px;color:#a18465;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
            '.ocs-block{display:flex;flex-direction:column;gap:9px;padding:10px;border:1px solid rgba(194,164,124,.5);border-radius:12px;background:rgba(255,253,248,.58);margin-bottom:12px;}' +
            '.ocs-label{color:#7e5b39;font-size:11px;font-weight:800;}' +
            '.ocs-times{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}' +
            '.ocs-time{display:inline-flex;align-items:center;gap:4px;padding:3px 4px 3px 9px;border-radius:999px;background:#fffaf0;border:1px solid #d7b27a;font-size:12px;font-weight:700;color:#5a4030;}' +
            '.ocs-time button{display:grid;place-items:center;width:18px;height:18px;padding:0;border:0;border-radius:50%;background:#ead3a4;color:#6c4a22;font-size:9px;cursor:pointer;}' +
            '.ocs-add{display:grid;place-items:center;width:26px;height:26px;padding:0;border:1.5px dashed #b89a6a;border-radius:999px;background:transparent;color:#8b5a2b;cursor:pointer;font-size:11px;}' +
            '.ocs-newtime{height:26px;border:1px solid #d3bf9f;border-radius:8px;background:#fff;color:#4a3828;padding:0 6px;font-size:12px;}.ocs-none{color:#a18465;font-size:11px;}' +
            '.ocs-row{display:flex;align-items:center;justify-content:space-between;color:#6a4b30;font-size:12px;}' +
            '.ocs-switch{position:relative;width:40px;height:22px;padding:0;border:2px solid #b89a6a;border-radius:999px;background:#e9d6ae;cursor:pointer;flex:none;}' +
            '.ocs-switch i{position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fffaf0;box-shadow:0 1px 3px rgba(63,42,18,.3);transition:transform .15s;}' +
            '.ocs-switch[aria-checked="true"]{background:#557b48;border-color:#3e5d34;}.ocs-switch[aria-checked="true"] i{transform:translateX(18px);}' +
            '.ocs-by{color:#8b5a2b;font-size:11px;}' +
            '.ocs-note{display:flex;gap:6px;margin:0;padding:6px 9px;border-radius:9px;background:#fffaf0;border:1px dashed #d7b27a;font-size:12px;line-height:1.5;color:#4a3218;}.ocs-note i{margin-top:3px;color:#c9a46a;}' +
            '.ocs-block .oc-action{margin-top:2px;}' +
            '.ocs-shift{margin-bottom:8px;padding:9px 10px;border:1px solid rgba(194,164,124,.5);border-radius:10px;background:rgba(255,253,248,.58);display:flex;flex-direction:column;gap:6px;}.ocs-shift.is-quiet{opacity:.72;}' +
            '.ocs-shead{display:flex;align-items:baseline;gap:4px;color:#5a4030;font-size:12px;}.ocs-ssum{margin-left:auto;color:#a9744a;font-weight:700;font-size:11px;white-space:nowrap;}' +
            '.ocs-inc{display:flex;gap:6px;align-items:baseline;font-size:12px;color:#5a4030;line-height:1.5;}.ocs-inc>i{color:#c9a06a;font-size:10px;}.ocs-inc b{margin-left:auto;white-space:nowrap;font-size:11px;}.ocs-inc b.neg{color:#b65050;}.ocs-inc b.pos{color:#4e8155;}' +
            '.ocs-diary{margin:0;padding:7px 10px;background:rgba(169,116,74,.08);border-left:3px solid #c9a06a;border-radius:6px;color:#5a4030;font-size:12px;line-height:1.65;}' +
            '.ocs-say,.ocs-rec{font-size:11px;color:#8a6c4f;line-height:1.5;}.ocs-err{font-size:11px;color:#a5402f;}' +
            '@media (max-width:760px){.ocs-frame{width:84px;height:84px;}.ocs-face{width:44px;height:44px;}}';
        doc.head.appendChild(st);
    }
    function _pickerHtml(c, pick) {
        const cur = pick ? (pick.id || pick.key) : '';
        const item = x => '<button class="ocs-cand' + ((x.id || x.key) === cur ? ' is-cur' : '') + '" data-ocs="choose" data-type="' + x.type + '" data-id="' + esc(x.id || x.key) + '">' +
            '<span class="ocs-cface" data-cface="' + esc(x.type + ':' + (x.id || x.key)) + '">' + _faceFallback(x) + '</span><span class="ocs-cname">' + esc(x.name) + '</span>' +
            (x.story ? '<small>' + esc(x.story) + '</small>' : '') + '</button>';
        const group = (label, list, none) => '<div class="ocs-glabel">' + label + '</div>' + (list.length ? '<div class="ocs-grid">' + list.map(item).join('') + '</div>' : '<div class="ocs-gnone">' + none + '</div>');
        return '<div class="ocs-picker">' + group('小機', c.xiaoji, '還沒有收下小機') + group('跑團角色', c.guest, '還沒有跑團角色') + '</div>';
    }
    function _shiftHtml(r) {
        const d = new Date(r.at);
        const when = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + _pad(d.getHours()) + ':' + _pad(d.getMinutes());
        const sum = r.error ? '沒上成' : r.quiet ? '沒有客人' : '客人 ' + r.visits + ' 位・+' + r.earned + ' PT';
        let h = '<div class="ocs-shift' + (r.error ? ' is-err' : r.quiet ? ' is-quiet' : '') + '"><div class="ocs-shead"><b>' + when + '</b>・' + esc(r.staff && r.staff.name) + '<span class="ocs-ssum">' + sum + '</span></div>';
        if (r.error) h += '<div class="ocs-err">' + esc(r.error) + '</div>';
        (r.incidents || []).forEach(x => {
            h += '<div class="ocs-inc"><i class="fa-solid fa-bolt"></i><span>' + esc(x.who) + esc((INCIDENTS[x.kind] || {}).label || '') + ' → ' + esc(x.label) + (x.say ? '「' + esc(x.say) + '」' : '') + '</span>' +
                (x.pt ? '<b class="' + (x.pt < 0 ? 'neg' : 'pos') + '">' + (x.pt > 0 ? '+' : '') + x.pt + '</b>' : '') + '</div>';
        });
        if (r.diary) h += '<p class="ocs-diary">' + esc(r.diary) + '</p>';
        if (r.notify) h += '<div class="ocs-say"><i class="fa-regular fa-comment"></i> ' + esc(r.notify) + '</div>';
        if (r.recommend) h += '<div class="ocs-rec"><i class="fa-solid fa-thumbs-up"></i> 改推「' + esc(r.recommend) + '」</div>';
        if (r.ptShort) h += '<div class="ocs-err">錢包不夠，這班請客、退錢的錢沒扣到。</div>';
        return h + '</div>';
    }
    async function renderTab(body) {
        const doc = body.ownerDocument || win.document;
        _ensureStyle(doc);
        const B = _B();
        let st = await get();
        const shifts = B ? await B.get('shifts', []) : [];
        if (st.unread) st = await save({ unread: false });   // 看到了
        const pick = st.pick;
        const cands = (pick || _pickerOpen) ? await candidates() : null;
        _lastCands = cands;
        if (!body.isConnected) return;
        const missing = !!pick && (pick.type === 'xiaoji' ? !cands.xiaoji.some(x => x.id === pick.id) : !cands.guest.some(x => x.key === pick.key));
        const busy = !!_busy || !!(st.running && Date.now() - st.running < RUN_STALE);
        const A = _g('AUI');
        let h = '<div class="ocs-wrap"><div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-id-badge"></i> 店員</span>' + (A && A.helpBtn ? A.helpBtn('cafe_staff') : '') + '</div><div class="ocs-top">';
        if (!pick) {
            h += '<button class="ocs-frame is-empty" data-ocs="pick"><i class="fa-solid fa-plus"></i><span>選店員</span></button><div class="ocs-side"><div class="ocs-hint">還沒有店員，書咖照平常開。</div></div>';
        } else {
            const cls = missing ? 'is-missing' : st.on ? 'is-on' : 'is-off';
            const label = missing ? '找不到他' : busy ? '上班中…' : st.on ? '值班中' : '休息中';
            h += '<div class="ocs-frame ' + cls + '"><span class="ocs-face" data-face>' + _faceFallback(pick) + '</span><span class="ocs-fname">' + esc(pick.name) + '</span></div>' +
                '<div class="ocs-side"><span class="ocs-state ' + cls + '">' + label + '</span><div class="ocs-acts"><button data-ocs="pick">' + (_pickerOpen ? '收起名單' : '換人') + '</button>' +
                '<button data-ocs="toggle">' + (st.on ? '讓他休息' : '叫他上班') + '</button></div></div>';
        }
        h += '</div>';
        if (_pickerOpen && cands) h += _pickerHtml(cands, pick);
        if (pick && !missing) {
            h += '<div class="ocs-block"><div class="ocs-label">上班時間</div><div class="ocs-times">' +
                st.times.map(t => '<span class="ocs-time">' + t + '<button data-ocs="del" data-t="' + t + '" aria-label="刪掉 ' + t + '"><i class="fa-solid fa-xmark"></i></button></span>').join('') +
                (st.times.length ? '' : '<span class="ocs-none">還沒排</span>') +
                (st.times.length < 6 ? '<button class="ocs-add" data-ocs="add" aria-label="加一個時間"><i class="fa-solid fa-plus"></i></button>' : '') + '</div>' +
                '<div class="ocs-row"><span>讓他自己排</span><button class="ocs-switch" role="switch" aria-checked="' + (st.selfPlan ? 'true' : 'false') + '" data-ocs="self"><i></i></button></div>' +
                (st.by === 'self' ? '<div class="ocs-by"><i class="fa-solid fa-pen"></i> 他自己排的</div>' : '') +
                (st.note ? '<p class="ocs-note"><i class="fa-solid fa-note-sticky"></i><span>' + esc(st.note) + '</span></p>' : '') +
                '<button class="oc-action" data-ocs="now"' + (busy ? ' disabled' : '') + '>' + (busy ? '<i class="fa-solid fa-spinner fa-spin"></i> 上班中…' : '<i class="fa-solid fa-bell-concierge"></i> 現在叫他上班') + '</button></div>';
        }
        h += '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-clipboard-list"></i> 值班紀錄</span><span class="oc-section-note">' + shifts.length + ' 班</span></div>' +
            (shifts.length ? shifts.map(_shiftHtml).join('') : '<div class="oc-empty"><i class="fa-solid fa-mug-saucer"></i>還沒有人上過班。</div>') + '</div>';
        body.innerHTML = h;
        const wrap = body.querySelector('.ocs-wrap');
        const rr = () => renderTab(body);
        if (pick) { const f = wrap.querySelector('[data-face]'); faceOf(pick).then(u => { if (u && f && f.isConnected) f.innerHTML = _faceImg(pick, u); }); }
        if (_pickerOpen && cands) [].concat(cands.xiaoji, cands.guest).forEach(x => {
            faceOf(x).then(u => { const id = x.type + ':' + (x.id || x.key); const el = [].find.call(wrap.querySelectorAll('[data-cface]'), e => e.getAttribute('data-cface') === id); if (u && el) el.innerHTML = _faceImg(x, u); });
        });
        wrap.addEventListener('click', async ev => {
            const b = ev.target.closest('[data-ocs]');
            if (!b || !wrap.contains(b)) return;
            const act = b.dataset.ocs;
            if (act === 'pick') { _pickerOpen = !_pickerOpen; return rr(); }
            if (act === 'choose') {
                const list = _lastCands ? [].concat(_lastCands.xiaoji, _lastCands.guest) : [];
                const x = list.find(c => c.type === b.dataset.type && (c.id || c.key) === b.dataset.id);
                if (!x) return;
                _pickerOpen = false;
                await pickStaff(x);
                return rr();
            }
            if (act === 'toggle') { const cur = await get(); await setOn(!cur.on); return rr(); }
            if (act === 'self') { const cur = await get(); await save({ selfPlan: !cur.selfPlan }); return rr(); }
            if (act === 'del') { const cur = await get(); await setTimes(cur.times.filter(t => t !== b.dataset.t)); return rr(); }
            if (act === 'add') {
                const inp = doc.createElement('input');
                inp.type = 'time'; inp.className = 'ocs-newtime'; inp.setAttribute('aria-label', '新的上班時間');
                b.replaceWith(inp);
                try { inp.focus({ preventScroll: true }); } catch (e) {}
                let done = false;
                const commit = async () => {
                    if (done) return; done = true;
                    const cur = await get();
                    if (inp.value) await setTimes(cur.times.concat(inp.value));
                    rr();
                };
                inp.addEventListener('change', commit);
                inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { done = true; rr(); } });
                inp.addEventListener('blur', commit);
                return;
            }
            if (act === 'now') {
                b.disabled = true;
                const r = await runShift({ force: true });
                if (r && r.skipped) { try { const A2 = _g('AUI'); if (A2 && A2.toast) A2.toast('他正在另一個視窗上班，等一下再來看。', { type: 'info' }); } catch (e) {} rr(); }
                return;
            }
        });
    }

    const OS_CAFE_STAFF = {
        INCIDENTS, get, save, pickStaff, setOn, setTimes, candidates, faceOf, lookOf, runShift, tick, start, renderTab, _cfg,
        onChange(f) { _listeners.add(f); return () => _listeners.delete(f); },
        isBusy: () => !!_busy,
        // 給 SN 32 樓白板共用：上班時間怎麼整理、到點沒；站進大廳場景的小機描框（同一套才長得一樣）
        times: { normTimes, dueSlot },
        outline: _outlined,
        _pure: { normTimes, dueSlot, parseReply, applyHandles, pickIncident, rankIncidents, localIncidents, jevQuestions, INCIDENTS },
    };
    win.OS_CAFE_STAFF = OS_CAFE_STAFF;
    if (win !== window) { try { window.OS_CAFE_STAFF = OS_CAFE_STAFF; } catch (e) {} }
    try { if ((win.document || {}).readyState !== undefined) start(); } catch (e) {}
})();
