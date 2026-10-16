// ----------------------------------------------------------------
// [檔案] core/void/lobby_cafe_regulars.js
// 職責：☕ 書咖的 12 位常客出現在大廳的書咖場景裡。
//   照書咖的到店紀錄：現在在店裡的站在客人出沒區；剛到的從門口一跳一跳進來，待一陣子再跳出去。
//   點他＝跳一行字（誰、什麼習性、今天點了什麼），不叫模型。
//   長相＝三視圖長條圖（素材庫 cafe_guests_v1/，[正面｜側面朝右｜背面]），這裡拼成 3×4 走路圖：
//   往下走看正面、往上走看背面、左右看側面；走路那兩格往上提一點＝跳（她 10-13 定：先用跳的當走路）。
//   誰、長什麼樣在 os_cafe_regulars.js；幾點到店在 os_cafe.js 的結算——這裡每 30 秒叫一次「悄悄補算」，不叫模型。
//   🪑 10-16 有坐姿了（阿洛畫的 18 張，素材庫 cafe_guests_sit_v1/，朝右斜正面；她：「是不是可以砍到椅子上?」）：
//   進門走到一張空椅子坐下、要走了站起來走出去；椅子坐滿了才照舊站在客人出沒區。
//   椅子照她現在的擺設找（擺設模式搬過、翻過都認）：chair_l 椅背在左＝朝右坐；chair_r 朝左＝坐姿翻過來。
//   坐著＝換一張「每格都是坐姿」的走路圖（舞台只認走路圖），圖底多留一段透明：腳底那條線壓到椅子前面才畫在椅子前面，屁股才對得到椅面。
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
    const SIT_BASE = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@5352eb1/cafe_guests_sit_v1/';
    const SIT_H = 152;          // 坐著多高（跟站著的同一顆頭大小：站著那格 200、身體約 174）
    const SEAT_X = 0.62;        // 椅面中心在椅子圖的哪裡（朝右那張；朝左的取 1−）
    const SEAT_Y = 0.55;
    const HIP_AT = 0.86;        // 坐姿圖從上往下多少是屁股（對到椅面）

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
    // 坐姿 → 每格都是坐姿的 3×4 走路圖；mirror＝朝左坐；padF＝圖底多留幾成透明（見檔頭）
    const _sitImgs = new Map(), _sitSheets = new Map();
    function _sitImgOf(look) {
        if (_sitImgs.has(look)) return _sitImgs.get(look);
        const p = new Promise((res) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => res(img);
            img.onerror = () => res(null);
            img.src = SIT_BASE + look + '.webp';
        });
        _sitImgs.set(look, p);
        p.then(v => { if (!v) _sitImgs.delete(look); });
        return p;
    }
    function _sitSheetOf(look, mirror, padF) {
        const key = look + '|' + (mirror ? 1 : 0) + '|' + padF;
        if (_sitSheets.has(key)) return _sitSheets.get(key);
        const p = _sitImgOf(look).then(img => new Promise((res) => {
            if (!img) { res(null); return; }
            try {
                const cw = img.naturalWidth, ih = img.naturalHeight, ch = ih + Math.round(ih * padF);
                const cv = document.createElement('canvas'); cv.width = cw * 3; cv.height = ch * 4;
                const g = cv.getContext('2d');
                for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
                    g.save();
                    if (mirror) { g.translate(c * cw + cw, r * ch); g.scale(-1, 1); g.drawImage(img, 0, 0); }
                    else g.drawImage(img, c * cw, r * ch);
                    g.restore();
                }
                cv.toBlob(b => res(b ? URL.createObjectURL(b) : null), 'image/png');
            } catch (e) { console.warn('[CafeRegulars] 拼坐姿圖失敗', look, e); res(null); }
        }));
        _sitSheets.set(key, p);
        p.then(v => { if (!v) _sitSheets.delete(key); });
        return p;
    }
    // 書咖現在的椅子（她的擺設）：坐哪裡、朝哪邊、椅子底邊、站起來站哪
    function _seatsOf(CFG) {
        return (CFG.layout || []).map((o, i) => {
            const m = String(o.file || '').match(/chair_([lr])_/);
            if (!m || o._plotOff) return null;
            const s = o.s || 1, w = o.w * s, h = o.h * s;
            const right = (m[1] === 'l') !== !!o.flipX;
            return { i, right, sx: o.x + w * (right ? SEAT_X : 1 - SEAT_X), sy: o.y + h * SEAT_Y,
                bottom: o.y + h + (o.zb || 0), stand: { x: o.x + w / 2, y: o.y + h + 16 } };
        }).filter(Boolean);
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
        // 空椅子：別的常客坐著或正走過去的不算；挑一張隨機的（每次進來不會都擠同一張）
        const freeSeat = () => {
            const used = new Set();
            mine.forEach(n => { const s = n._seat || n._seatWant; if (s) used.add(s.i); });
            const free = _seatsOf(_b.CFG).filter(s => !used.has(s.i));
            return free.length ? free[Math.floor(Math.random() * free.length)] : null;
        };
        // 坐下：換成坐姿那張圖，腳底線壓到椅子底邊前面一點（才畫在椅子前面），多出來的高度留成圖底透明
        const sitDown = async (n, seat) => {
            n._sitting = true;
            try {
                const sitH = SIT_H * (n._standH / NPC_H);
                const feetY = seat.sy + sitH * (1 - HIP_AT);
                const padF = Math.max(0, Math.ceil(((seat.bottom + 2 - feetY) / sitH) * 50) / 50);   // 0.02 一格，同樣留白的共用一張圖
                const sheet = await _sitSheetOf(n._look, !seat.right, padF);
                if (!sheet) { n._seatWant = null; return false; }   // 坐姿圖拿不到：站在椅子前面就好，別每 0.4 秒重抓
                if (!alive() || n._leaving || S.npcs.indexOf(n) < 0) return false;
                n._seat = seat; n._seatWant = null;
                n.dest = null; n.walking = false; n.dir = 0; n.frame = 1;
                n.x = seat.sx; n.y = feetY + padF * sitH;
                n.h = Math.round(sitH * (1 + padF));
                _b.swapActorSrc(n, { sheet });
                return true;
            } finally { n._sitting = false; }
        };
        // 站起來：換回走路圖、站到椅子前面（她換過他的外觀就套回去）
        const standUp = (n) => {
            const seat = n._seat;
            n._seat = null;
            n.h = n._standH;
            if (seat) { n.x = seat.stand.x; n.y = seat.stand.y; }
            _b.swapActorSrc(n, n.defaultSrc);
            try { if (_b.skins && _b.skins()[n.key]) _b.applySkin(n, n.key); } catch (e) {}
        };
        const spawn = (p, e, sheet, walkIn) => {
            const ty = REG.TYPES[p.type] || {};
            const seat = freeSeat();
            const to = seat ? seat.stand : spot(), from = walkIn ? door() : to;
            const n = _b.addNpc({
                key: 'cafe_reg_' + p.key, name: p.name, subTitle: (ty.label || '常客') + ' · 書咖常客',
                x: from.x, y: from.y, h: NPC_H, src: { sheet },
                scriptOnly: true,   // 照腳本跑：不進小劇場配對、不開對話（點他只跳一行字）
                homeRect: _b.CFG.points.npcZone, onInteract: () => say(p, n),
            });
            n.wanderT = Infinity;   // 不亂晃：只照進門、出門走
            n._entry = e;
            n._look = p.look;
            n._standH = n.h;
            n._seatWant = seat;     // 走到椅子前面（poll 看到走到了）就坐下；本來就在店裡的直接坐好
            if (walkIn) n.dest = { x: to.x, y: to.y };
            else if (seat) sitDown(n, seat);
            return n;
        };
        const leave = (n) => {
            n._leaving = true; n._seatWant = null;
            if (n._seat) standUp(n);
            const d = door(); n.dest = { x: d.x, y: d.y + 40 };
        };

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
        // 走到了：有椅子的坐下，沒有的轉回正面站好；要走的走到門口就收掉
        const poll = () => {
            if (!alive()) { stop(); return; }
            for (const [k, n] of mine) {
                if (S.npcs.indexOf(n) < 0) { mine.delete(k); continue; }
                if (n._leaving) { if (!n.dest) { remove(n); mine.delete(k); } continue; }
                if (!n.dest && n._seatWant && !n._seat && !n._sitting) { sitDown(n, n._seatWant); continue; }
                if (!n.dest && !n._seat && n.dir !== 0) { n.dir = 0; n.frame = 1; n.animT = 0; _b.placeActor(n); }
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
