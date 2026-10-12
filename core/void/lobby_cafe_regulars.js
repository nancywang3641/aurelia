// ----------------------------------------------------------------
// [檔案] core/void/lobby_cafe_regulars.js
// 職責：☕ 書咖的 12 位常客出現在大廳的書咖場景裡。
//   照書咖的到店紀錄：現在在店裡的站在客人出沒區；剛到的從門口一跳一跳進來，待一陣子再跳出去。
//   點他＝跳一行字（誰、什麼習性、今天點了什麼），不叫模型。
//   長相＝三視圖長條圖（素材庫 cafe_guests_v1/，[正面｜側面朝右｜背面]），這裡拼成 3×4 走路圖：
//   往下走看正面、往上走看背面、左右看側面；走路那兩格往上提一點＝跳（她 10-13 定：先用跳的當走路）。
//   誰、長什麼樣在 os_cafe_regulars.js；幾點到店在 os_cafe.js 的結算——這裡每 30 秒叫一次「悄悄補算」，不叫模型。
// 依賴：window.LobbyStage._b 橋（必須排在 lobby_stage.js 後面）；lobby_npcs.js 的 initNpcs 在書咖場景叫 mount()。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const W = window.parent || window;
    const LOOK_BASE = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@main/cafe_guests_v1/';
    const NPC_H = 200;          // 跟雷伊、丹一樣高（舞台會再乘人物縮放）
    const HOP = 0.07;           // 跳多高（佔一格高的比例；長條圖頭頂留了這麼多空）
    const TICK_MS = 30000;      // 多久看一次誰到、誰走
    const MAX_IN = 6;           // 店裡最多同時幾位常客
    const STAY_PEND = 30;       // 還沒結算到的（只知道幾點到）先當待 30 分

    // 長條圖 → 3×4 走路圖（列：往下／往左／往右／往上；欄：跳起來／站著／跳起來）
    const _sheets = new Map();
    function _sheetOf(look) {
        if (_sheets.has(look)) return _sheets.get(look);
        const p = new Promise((res) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';   // 要畫進畫布再拿出來
            img.onload = () => {
                try {
                    const cw = Math.floor(img.naturalWidth / 3), ch = img.naturalHeight;
                    const cv = document.createElement('canvas'); cv.width = cw * 3; cv.height = ch * 4;
                    const g = cv.getContext('2d');
                    const hop = Math.round(ch * HOP);
                    const view = [0, 1, 1, 2], mirror = [false, true, false, false];   // 往左＝側面翻過來
                    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
                        const dy = c === 1 ? 0 : -hop;
                        g.save();
                        if (mirror[r]) { g.translate(c * cw + cw, r * ch); g.scale(-1, 1); g.drawImage(img, view[r] * cw, 0, cw, ch, 0, dy, cw, ch); }
                        else g.drawImage(img, view[r] * cw, 0, cw, ch, c * cw, r * ch + dy, cw, ch);
                        g.restore();
                    }
                    cv.toBlob(b => res(b ? URL.createObjectURL(b) : null), 'image/png');
                } catch (e) { console.warn('[CafeRegulars] 拼走路圖失敗', look, e); res(null); }
            };
            img.onerror = () => res(null);
            img.src = LOOK_BASE + look + '.webp';
        });
        _sheets.set(look, p);
        p.then(v => { if (!v) _sheets.delete(look); });   // 沒拿到圖下次再試
        return p;
    }
    function _hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }
    // 待多久（分鐘）：賣完走掉的一下下、沒點東西的一會兒、有點的 25～44 分
    function _stay(l) {
        if (l.miss) return 4;
        if (!l.price) return 6;
        return 25 + (_hash(String(l.id || (l.key + ':' + l.t))) % 20);
    }

    let _live = null;
    function mount() {
        const LS = window.LobbyStage, _b = LS && LS._b;
        const REG = W.OS_CAFE_REGULARS || window.OS_CAFE_REGULARS;
        const CAFE = W.OS_CAFE || window.OS_CAFE;
        if (!_b || !REG || !CAFE || !CAFE._b || !CAFE._b.settleQuiet) return false;
        if (_live) _live.stop();
        const S = _b.S, B = CAFE._b, world = S.world;
        const alive = () => S.active && S.scene === 'cafe' && S.world === world;
        const mine = new Map();   // 常客 key → 舞台上的他
        let first = true, busy = false, tickT = null, pollT = null;

        const stop = () => { clearInterval(tickT); clearInterval(pollT); if (_live && _live.world === world) _live = null; };
        const remove = (n) => {
            [n.el, n.tag, n.hint].forEach(el => { try { el && el.remove(); } catch (e) {} });
            const i = S.npcs.indexOf(n); if (i >= 0) S.npcs.splice(i, 1);
        };
        const door = () => { const P = _b.CFG.points; return P.arrive || P.player || { x: 720, y: 870 }; };
        // 站哪：出沒區裡撒 24 個點，挑周圍最空、離別人遠的（同 lobby_npcs 的客人刷位）
        const spot = () => {
            const Z = _b.CFG.points.npcZone || { x: 200, y: 600, w: 1000, h: 250 };
            let best = null, bs = -1;
            for (let t = 0; t < 24; t++) {
                const x = Z.x + Math.random() * Z.w, y = Z.y + Math.random() * Z.h;
                if (_b.blocked(x, y)) continue;
                let sc = _b.whiteRatio(x, y, 70);
                if (S.npcs.some(n => n && Math.hypot(n.x - x, n.y - y) < 120)) sc -= 0.5;
                if (sc > bs) { bs = sc; best = { x, y }; }
            }
            return best || _b.findFreeSpot(Z.x + Z.w / 2, Z.y + Z.h / 2);
        };
        const say = (p, n) => {
            const ty = REG.TYPES[p.type] || {};
            const tr = (p.traits || []).map(t => (REG.TRAITS[t] || {}).label).filter(Boolean).join('、');
            const what = (n._entry && n._entry.line) || '剛進來，還在看菜單。';
            try { (W.AUI || window.AUI).toast(p.name + '（' + (ty.label || '常客') + (tr ? '・' + tr : '') + '）' + what); } catch (e) {}
        };
        const spawn = (p, e, sheet, walkIn) => {
            const ty = REG.TYPES[p.type] || {};
            const to = spot(), from = walkIn ? door() : to;
            const n = _b.addNpc({
                key: 'cafe_reg_' + p.key, name: p.name, subTitle: (ty.label || '常客') + ' · 書咖常客',
                x: from.x, y: from.y, h: NPC_H, src: { sheet },
                scriptOnly: true,   // 照腳本跑：不進小劇場配對、不開對話（點他只跳一行字）
                homeRect: _b.CFG.points.npcZone, onInteract: () => say(p, n),
            });
            n.wanderT = Infinity;   // 不亂晃：只照進門、出門走
            n._entry = e;
            if (walkIn) n.dest = { x: to.x, y: to.y };
            return n;
        };
        const leave = (n) => { n._leaving = true; const d = door(); n.dest = { x: d.x, y: d.y + 40 }; };

        const tick = async () => {
            if (busy) return;
            if (!alive()) { stop(); return; }
            busy = true;
            try {
                try { await B.settleQuiet(); } catch (e) {}   // 到時間的客人放進來（不叫模型）
                if (!alive()) return;
                const now = Date.now(), today = B.dayNum(now), nowMin = B.minOf(now);
                const [logs, pend] = await Promise.all([B.get('visits', []), B.get('pending', [])]);
                if (!alive()) return;
                const inn = new Map();
                const consider = (e, until) => {
                    if (e.t > nowMin || until <= nowMin) return;
                    const c = inn.get(e.key);
                    if (!c || e.t >= c.t) inn.set(e.key, { t: e.t, line: e.line || '', until });
                };
                (logs || []).forEach(l => { if (l && l.day === today && !l.ev && /^g_/.test(l.key || '')) consider(l, l.t + _stay(l)); });
                (pend || []).forEach(p => { if (p && p.day === today && /^g_/.test(p.key || '')) consider(p, p.t + STAY_PEND); });
                for (const [k, n] of mine) {
                    if (!inn.has(k)) { if (!n._leaving) leave(n); }
                    else n._entry = inn.get(k);
                }
                let count = 0; mine.forEach(n => { if (!n._leaving) count++; });
                for (const [k, e] of inn) {
                    if (mine.has(k) || count >= MAX_IN) continue;
                    const p = REG.PEOPLE.find(x => x.key === k);
                    if (!p || !p.look) continue;
                    const sheet = await _sheetOf(p.look);
                    if (!sheet || !alive() || mine.has(k)) continue;
                    mine.set(k, spawn(p, e, sheet, !first));   // 第一次看＝本來就在店裡的直接站好；之後到的從門口跳進來
                    count++;
                }
                first = false;
            } catch (e) { console.warn('[CafeRegulars] 看誰在店裡失敗', e); }
            finally { busy = false; }
        };
        // 走到了就轉回正面站好；要走的走到門口就收掉
        const poll = () => {
            if (!alive()) { stop(); return; }
            for (const [k, n] of mine) {
                if (S.npcs.indexOf(n) < 0) { mine.delete(k); continue; }
                if (n._leaving) { if (!n.dest) { remove(n); mine.delete(k); } continue; }
                if (!n.dest && n.dir !== 0) { n.dir = 0; n.frame = 1; n.animT = 0; _b.placeActor(n); }
            }
        };
        tickT = setInterval(tick, TICK_MS);
        pollT = setInterval(poll, 400);
        _live = { world, stop, tick, mine };
        tick();
        return true;
    }

    window.LobbyCafeRegulars = {
        mount,
        sheetOf: _sheetOf,          // 測試用：拿某個長相拼好的走路圖
        _live: () => _live,         // console 診斷用：現在舞台上有誰
    };
})();
