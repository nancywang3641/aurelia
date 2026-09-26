// ----------------------------------------------------------------
// [檔案] vn_map_link.js
// 路徑：os_phone/map/vn_map_link.js
// 職責：VN 劇情 → 地圖。每章劇本載入時（vn_core loadScript 尾巴，不 await）：
//   ① 地點：每個 [Bg|季節|時段_地點名|…] 的地點名 → 對到地圖上的地點（sceneId）。最後一場＝主角現在在哪（getHere）。
//   ② 人：每一場開口的人（[Char|名字|…]，電話／手機畫面裡的不算）→ 寫進地圖的即時位置（WORLD_RUNTIME.setPatch，一章一個 patch）。
// 地點怎麼對（同一個地方別變成好幾格）：
//   程式先比：去掉時段前綴、空白標點、簡轉繁後，名字相同或互相包含（地點裡的某個房間、門口）就算同一個。
//   比不到的，一章只叫一次 Jev（choice 題：候選＝名字最像的幾個地圖地點＋「新的地方」），答案記在別名表，同一個名字之後不再問。
//   沒填 Jev 鑰匙：比不到就當新的地方。新的地方加進「劇情去過的地方」（Z_DYNAMIC 那一區）。
// 還沒生成地圖的聊天：只記「劇情去過的地方」，按「直接畫地圖」時一起交給模型排進地圖（world_painter.buildFormPrompt）。
// 存：OS_DB 通用資料 vn_map_link，綁這個聊天（刪故事跟著清）：{ here, alias, visited }。
// 花費：程式比對不叫任何模型；Jev 一章最多一通、只問比不到的名字。帳記在 OS_JEV_USAGE（place）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    if (win.VN_MAP_LINK) { if (win !== window) window.VN_MAP_LINK = win.VN_MAP_LINK; return; }
    console.log('[PhoneOS] 載入劇情↔地圖連結...');

    const APP = 'vn_map_link';
    const JEV_URL = 'https://ai-gateway.vercel.sh/v1/evaluate';
    const JEV_MODEL = 'typesafe-ai/jev';
    const NEW = '新的地方';
    const MAX_CAND = 8;          // 每題最多幾個候選地點（加「新的地方」）
    const Q_PER_CALL = 12;       // 一通最多幾題；超過的這章先當新的地方，下一章再問
    const LIVE_HOURS = 12;       // 即時位置多久沒更新就過期（地圖上不再站那裡）
    const VISITED_MAX = 60;

    let _st = null, _stChat = null;
    function _chat() { try { return (win.OS_STORY_TOOLS && win.OS_STORY_TOOLS.getChatId && win.OS_STORY_TOOLS.getChatId()) || ''; } catch (e) { return ''; } }
    function _key() { try { return (localStorage.getItem('npc_decide_key') || '').trim(); } catch (e) { return ''; } }
    async function _load() {
        const chat = _chat();
        if (_st && _stChat === chat) return _st;
        let v = null;
        try { if (chat && win.OS_DB && win.OS_DB.getAppData) v = await win.OS_DB.getAppData(APP, 'state', chat); } catch (e) {}
        _st = (v && typeof v === 'object') ? v : {};
        _st.alias = _st.alias || {}; _st.visited = Array.isArray(_st.visited) ? _st.visited : [];
        _stChat = chat;
        return _st;
    }
    async function _save() {
        const chat = _chat();
        if (!chat || !_st || _stChat !== chat) return;
        try { if (win.OS_DB && win.OS_DB.saveAppData) await win.OS_DB.saveAppData(APP, 'state', _st, chat); } catch (e) { console.warn('[劇情↔地圖] 存檔失敗:', e); }
    }

    // ---------- 名字 ----------
    function _fold(s) { try { return (win.WX_ZH && win.WX_ZH.fold) ? win.WX_ZH.fold(s) : s; } catch (e) { return s; } }
    function placeOf(bgParts) {   // [Bg|季節|時段_地點名|…] → 地點名；舊的單格 [Bg|描述] 沒有地點
        if (!bgParts || bgParts.length < 2) return '';
        const raw = String(bgParts[1] || '').trim();
        const i = raw.indexOf('_');
        return (i >= 0 ? raw.slice(i + 1) : raw).replace(/_/g, ' ').trim();
    }
    function norm(s) { return _fold(String(s || '')).toLowerCase().replace(/[\s·・\-_,，.。、'"「」『』（）()\[\]【】]/g, ''); }
    function _bigrams(s) { const o = {}; for (let i = 0; i < s.length - 1; i++) o[s.slice(i, i + 2)] = 1; if (s.length === 1) o[s] = 1; return o; }
    function _sim(a, b) {   // 兩個名字有幾成字對字重疊（0～1）
        const A = _bigrams(a), B = _bigrams(b), ka = Object.keys(A), kb = Object.keys(B);
        if (!ka.length || !kb.length) return 0;
        let n = 0; ka.forEach(k => { if (B[k]) n++; });
        return 2 * n / (ka.length + kb.length);
    }

    // 地圖上所有地點（含劇情去過的那區）：[{ sceneId, name, zone, n }]
    function _places(world) {
        const out = [];
        Object.keys((world && world.zones) || {}).forEach(zid => {
            const z = world.zones[zid];
            Object.keys((z && z.facilities) || {}).forEach(fk => {
                const f = z.facilities[fk];
                const sid = f.sceneId || (zid + '_' + fk);
                [f.name, f.shortName].filter(Boolean).forEach((nm, j) => {
                    const n = norm(nm);
                    if (n) out.push({ sceneId: sid, name: f.name || nm, zone: z.name || zid, n, short: j === 1 });
                });
            });
        });
        return out;
    }
    // 程式比對：一樣、或互相包含（長的那個至少 2 個字）；多個命中取名字最長的（最具體）
    function _match(name, places) {
        const n = norm(name);
        if (!n) return null;
        let best = null;
        places.forEach(p => {
            const hit = p.n === n || (Math.min(p.n.length, n.length) >= 2 && (n.indexOf(p.n) >= 0 || p.n.indexOf(n) >= 0));
            if (hit && (!best || p.n.length > best.n.length)) best = p;
        });
        return best ? best.sceneId : null;
    }

    // ---------- 劇本 → 一場一場 ----------
    // 回 [{ place, who: [名字…] }]，照出場順序；電話／手機聊天／瀏覽器這些區塊裡的人不算在場
    function parseScenes(script) {
        const scenes = [];
        let cur = null, block = null;
        const lines = (script || []).map(r => (typeof r === 'string' ? r : String(r || '')));
        lines.forEach((raw, i) => {
            const l = raw.trim();
            if (!l) return;
            if (block) { if (l.toLowerCase().indexOf('</' + block + '>') === 0) block = null; return; }
            const mo = l.match(/^<([A-Za-z][\w-]*)(?:\s[^>]*)?>$/);
            if (mo && !/\/>$/.test(l) && lines.slice(i + 1).some(x => x.trim().toLowerCase().indexOf('</' + mo[1].toLowerCase() + '>') === 0)) { block = mo[1].toLowerCase(); return; }
            const mb = l.match(/^\[Bg\|([\s\S]*)\]$/i);
            if (mb) { cur = { place: placeOf(mb[1].split('|')), desc: (mb[1].split('|')[2] || '').slice(0, 80), who: [] }; scenes.push(cur); return; }
            const mc = l.match(/^\[Char\|([^|\]]+)/i);
            if (mc && cur) { const w = mc[1].trim(); if (w && cur.who.indexOf(w) < 0) cur.who.push(w); }
        });
        return scenes.filter(s => s.place || s.who.length);
    }

    // ---------- Jev：比不到的名字，一章一通 ----------
    async function _askJev(items, places) {
        const questions = {}, qs = [];
        items.slice(0, Q_PER_CALL).forEach((it, i) => {
            const n = norm(it.name);
            const seen = {}, cand = [];
            places.map(p => ({ p, s: _sim(n, p.n) })).sort((a, b) => b.s - a.s).forEach(x => {
                if (cand.length >= MAX_CAND || seen[x.p.sceneId]) return;
                seen[x.p.sceneId] = 1; cand.push(x.p);
            });
            if (!cand.length) return;
            const criteria = {};
            cand.forEach(p => { criteria[p.name] = '就是「' + p.name + '」（' + p.zone + '），或是在它裡面的某個房間、門口、角落'; });
            criteria[NEW] = '跟上面每一個都不是同一個地方';
            const id = 'q' + i;
            questions[id] = { type: 'choice', criteria, instructions: '劇情裡寫的地點「' + it.name + '」' + (it.desc ? '（那一場的樣子：' + it.desc + '）' : '') + '，跟地圖上的哪一個是同一個地方？名字寫法不同、簡繁不同、多寫了樓層或房間，都算同一個地方；只是同一類的店（兩家不同的咖啡館）不算。' };
            qs.push({ id, it, cand });
        });
        if (!qs.length) return {};
        const body = { model: JEV_MODEL, state: { '這個故事地圖上已有的地點': places.filter(p => !p.short).map(p => p.name + '（' + p.zone + '）').slice(0, 120) }, questions };
        let d = null;
        for (let t = 0; t < 3 && !d; t++) {
            const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 30000);
            try {
                const res = await fetch(JEV_URL, { method: 'POST', headers: { 'Authorization': 'Bearer ' + _key(), 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
                const j = await res.json().catch(() => null);
                try { win.OS_JEV_USAGE && win.OS_JEV_USAGE.add('place', j, !!(res.ok && j && j.answers)); } catch (e) {}
                if (res.ok && j && j.answers) d = j;
                else if (res.status !== 503 && res.status !== 429 && res.status < 500) break;
            } catch (e) {} finally { clearTimeout(timer); }
            if (!d) await new Promise(r => setTimeout(r, 2500 * (t + 1)));
        }
        const out = {};
        if (!d) return out;
        qs.forEach(q => {
            const a = d.answers[q.id];
            if (!a || !a.choice) return;
            if (a.choice === NEW) { out[q.it.name] = NEW; return; }
            const p = q.cand.find(c => c.name === a.choice);
            if (p) out[q.it.name] = p.sceneId;
        });
        return out;
    }

    // ---------- 主入口：一章 ----------
    const _running = {};
    async function onChapter(script, msgId) {
        const scenes = parseScenes(Array.isArray(script) ? script : []);
        if (!scenes.length) return null;
        const WR = win.WORLD_RUNTIME;
        if (WR && WR.isPreview && WR.isPreview()) return null;   // 在預覽別的世界：不動
        const key = _chat() + ':' + msgId + ':' + scenes.map(s => s.place + '/' + s.who.join(',')).join('|');
        if (_running[key]) return _running[key];
        const job = (async () => {
            const st = await _load();
            const names = [];
            scenes.forEach(s => { if (s.place && names.indexOf(s.place) < 0) names.push(s.place); });
            names.forEach(nm => { if (st.visited.indexOf(nm) < 0) st.visited.push(nm); });
            if (st.visited.length > VISITED_MAX) st.visited = st.visited.slice(-VISITED_MAX);
            const world = WR && WR.getCurrentWorld ? WR.getCurrentWorld() : null;
            if (!world || !world.zones) {   // 還沒有地圖：先記下去過哪些地方
                st.here = { place: scenes[scenes.length - 1].place || (st.here && st.here.place) || '', sceneId: '', msgId: String(msgId), at: Date.now() };
                await _save();
                return st.here;
            }
            const worldTag = world.id || world.name || '';
            if (st.aliasWorld !== worldTag) { st.alias = {}; st.aliasWorld = worldTag; }   // 換了地圖（重新生成）：舊的對應作廢
            const resolved = {};
            let places = _places(world);
            const unknown = [];
            names.forEach(nm => {
                const a = st.alias[norm(nm)];
                if (a && places.some(p => p.sceneId === a)) { resolved[nm] = a; return; }
                const m = _match(nm, places);
                if (m) { resolved[nm] = m; st.alias[norm(nm)] = m; return; }
                unknown.push({ name: nm, desc: (scenes.find(s => s.place === nm) || {}).desc || '' });
            });
            if (unknown.length && _key() && places.length) {
                const ans = await _askJev(unknown, places);
                unknown.forEach(u => { const a = ans[u.name]; if (a && a !== NEW) { resolved[u.name] = a; st.alias[norm(u.name)] = a; } });
            }
            for (const u of unknown) {   // Jev 說是新的、沒問到、沒鑰匙 → 劇情去過的地方
                if (resolved[u.name]) continue;
                const sid = WR.addDynamicFacility ? await WR.addDynamicFacility(u.name, { keep: true }) : null;   // keep：沒人站著也別清掉（主角去過的地方）
                if (sid) { resolved[u.name] = sid; st.alias[norm(u.name)] = sid; }
            }
            // 主角：最後一場有地點的那一場
            const lastPlaced = scenes.slice().reverse().find(s => s.place && resolved[s.place]);
            if (lastPlaced) st.here = { place: lastPlaced.place, sceneId: resolved[lastPlaced.place], msgId: String(msgId), at: Date.now() };
            // 人：每個人這章最後出現的那一場
            const lastAt = {};
            scenes.forEach(s => { if (s.place && resolved[s.place]) s.who.forEach(w => { lastAt[w] = resolved[s.place]; }); });
            const until = Date.now() + LIVE_HOURS * 3600 * 1000;
            const moves = Object.keys(lastAt).map(w => ({ character: w, location_id: lastAt[w], action: '', category: 'Outing', until_ts: until }));
            let mc = '';
            try { mc = (win.SillyTavern && win.SillyTavern.getContext && win.SillyTavern.getContext().name1) || ''; } catch (e) {}
            if (moves.length && WR.setPatch) await WR.setPatch(msgId, moves, mc);
            await _save();
            return st.here;
        })().catch(e => { console.warn('[劇情↔地圖] 這章沒接上:', e); return null; }).finally(() => { delete _running[key]; });
        _running[key] = job;
        return job;
    }

    // 地圖用：主角現在在哪（對到目前這張地圖上的 zoneId／facKey；對不到就只有地點名）
    function getHere() {
        const st = _st && _stChat === _chat() ? _st : null;
        if (!st || !st.here) return null;
        const WR = win.WORLD_RUNTIME, world = WR && WR.getCurrentWorld ? WR.getCurrentWorld() : null;
        const out = { place: st.here.place, sceneId: st.here.sceneId, zoneId: '', facKey: '' };
        if (world && world.zones && st.here.sceneId) {
            Object.keys(world.zones).some(zid => {
                const fs = world.zones[zid].facilities || {};
                const fk = Object.keys(fs).find(k => (fs[k].sceneId || (zid + '_' + k)) === st.here.sceneId);
                if (fk) { out.zoneId = zid; out.facKey = fk; return true; }
                return false;
            });
        }
        return out;
    }
    // 生成地圖用：這個故事劇情裡去過的地方
    function visited() { return (_st && _stChat === _chat() && _st.visited) ? _st.visited.slice() : []; }

    win.VN_MAP_LINK = { onChapter, getHere, visited, load: _load, parseScenes, placeOf, norm };
    if (win !== window) window.VN_MAP_LINK = win.VN_MAP_LINK;
})();
