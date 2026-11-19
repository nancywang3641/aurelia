// ----------------------------------------------------------------
// [檔案] core/void/lobby_cafe_regulars.js
// 職責：☕ 書咖的 12 位常客出現在大廳的書咖場景裡。
//   照書咖的到店紀錄：現在在店裡的站在客人出沒區；剛到的從門口一跳一跳進來，待一陣子再跳出去。
//   點他＝跳一行字（誰、什麼習性、今天點了什麼），不叫模型。
//   長相＝隔壁衣櫥（小火苗衣櫥）裡那 18 位常客拍下來的圖（11-15 她：「先把隔壁的小人搬過來，比如那些客人」→「好，18 位都換」）：
//   素材庫 cafe_dolls_v1/walk/<長相>.webp 是拼好的 3×4 走路圖（列：往下／往左／往右／往上；欄：踏一步／站著／踏另一步），
//   往下走看正面、往上走看背面（都是一跳一跳，衣櫥裡正面的走路就是跳）、左右看側面（腳會踏步）。
//   18 位同一個格子大小、同一個比例，腳底在格底、身體中心在格子正中。不是像素圖，舞台上要平滑縮（smooth）。
//   🔁 她之後在衣櫥改了頭髮、衣服：收成衣櫥內建後跑本機 tmp/doll_bake/bake.cjs <長相> → sheet.py → 傳素材庫 → 換下面的 DOLL_REF。
//   舊圖（阿洛畫的三視圖長條圖 cafe_guests_v1/、坐姿 cafe_guests_sit_v1/）還在素材庫，徵人頁（os_cafe_hire.js）的應徵者照片還在用。
//   誰、長什麼樣在 os_cafe_regulars.js；幾點到店在 os_cafe.js 的結算——這裡每 30 秒叫一次「悄悄補算」，不叫模型。
//   🪑 坐姿（10-16 起有；她：「是不是可以砍到椅子上?」）＝衣櫥的側面坐姿（朝右，cafe_dolls_v1/sit/），18 位的屁股都在圖上同一個高度：
//   進門走到一張空椅子坐下、要走了站起來走出去；椅子坐滿了才照舊站在客人出沒區。
//   椅子照她現在的擺設找（擺設模式搬過、翻過都認）：chair_l 椅背在左＝朝右坐；chair_r 朝左＝坐姿翻過來。
//   坐著＝換一張「每格都是坐姿」的走路圖（舞台只認走路圖），圖底多留一段透明：腳底那條線壓到椅子前面才畫在椅子前面，屁股才對得到椅面。
// 依賴：window.LobbyStage._b 橋（必須排在 lobby_stage.js 後面）；lobby_npcs.js 的 initNpcs 在書咖場景叫 mount()。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const W = window.parent || window;
    // 🚨 素材庫鎖 commit 抓（sound-files 超過 jsDelivr 的上限，用 @main 抓沒人抓過的圖會隨機 403）；抓不到再換 raw（_retry）
    const DOLL_REF = '0c996afff9c88746e045fde5ce44c9e42ac0ac83';
    const WALK_BASE = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@' + DOLL_REF + '/cafe_dolls_v1/walk/';
    const NPC_H = 209;          // 一格多高（舞台會再乘人物縮放）：格子上面留了放馬尾、帽子的空，人本身大約 174＝跟雷伊、丹差不多高
    const TICK_MS = 30000;      // 多久看一次誰到、誰走
    const MAX_IN = 6;           // 店裡最多同時幾位常客
    const STAY_PEND = 30;       // 還沒結算到的（只知道幾點到）先當待 30 分
    const SIT_BASE = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@' + DOLL_REF + '/cafe_dolls_v1/sit/';
    const SIT_H = 192;          // 坐姿圖多高（跟站著同一個比例：坐姿圖 448 高、走路圖一格 487 高）
    const SEAT_X = 0.62;        // 椅面中心在椅子圖的哪裡（朝右那張；朝左的取 1−）
    const SEAT_Y = 0.55;
    const HIP_AT = 0.967;       // 坐姿圖從上往下多少是屁股（對到椅面）；拼圖時 18 位都對在這條線上

    // 抓不到的圖換 raw 再試一次（素材庫超過 jsDelivr 的上限會隨機 403，見 lobby_stage.js 的 _sfRetry）
    function _retry(img, onFail) {
        const b = window.LobbyStage && window.LobbyStage._b;
        if (b && b.sfRetry) b.sfRetry(img, onFail); else img.onerror = onFail;
    }
    // 走路圖：素材庫那張已經拼好（3×4），這裡只確認抓得到，回那個網址（換過 raw 的話回 raw 那個）
    const _sheets = new Map();
    function _sheetOf(look) {
        if (_sheets.has(look)) return _sheets.get(look);
        const p = new Promise((res) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';   // 舞台要讀它量腳印寬，同一種抓法才吃得到同一份快取
            img.onload = () => res(img.src);
            _retry(img, () => res(null));
            img.src = WALK_BASE + look + '.webp';
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
            _retry(img, () => res(null));
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
        let first = true, busy = false, tickT = null, pollT = null, serveT = null;

        const stop = () => { clearInterval(tickT); clearInterval(pollT); clearInterval(serveT); if (_live && _live.world === world) _live = null; };
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
                // 🍽 點了東西的：本來就在店裡的已經上過餐；剛進來的等店員來點餐、送餐（沒有店員就自己去櫃檯拿：過一會兒就有）
                n._svc = !(n._entry && n._entry.item) ? 'none' : n._walkedIn ? 'wait' : 'served';
                n._svcAt = Date.now();
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
                x: from.x, y: from.y, h: NPC_H, src: { sheet }, smooth: true,
                scriptOnly: true,   // 照腳本跑：不進小劇場配對、不開對話（點他只跳一行字）
                homeRect: _b.CFG.points.npcZone, onInteract: () => say(p, n),
            });
            n.wanderT = Infinity;   // 不亂晃：只照進門、出門走
            n._entry = e;
            // 🫧 停下來、坐下時換成衣櫥活的那套（會呼吸、眨眼，點了東西會吃）；拿不到衣櫥就照舊這張走路圖（lobby_ember.js）
            // entry：她點來送他的（n._gift）蓋過他自己點的
            if (window.LobbyEmber) window.LobbyEmber.bind(n, p.look, { entry: () => n._gift ? Object.assign({}, n._entry, n._gift) : n._entry, served: () => n._svc === 'served' });
            n._look = p.look;
            n._walkedIn = !!walkIn;
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

        // ---------- 🍽 點餐、送餐（11-19 她：「整套接」）----------
        //   雇來的員工（lobby_npcs 的 cafe_crew，接上衣櫥的才算）：從櫃檯後面繞出來 → 走到那桌前面記點餐 → 回櫃檯備餐 → 端盤送過去放下 → 回櫃檯。
        //   一次服務一桌，照坐下的先後。沒有員工（或衣櫥接不上）：坐下過一會兒自己就有了（當作去櫃檯拿）。
        //   動作全照衣櫥原樣（記點餐 writing、端盤 tray、送餐走路 trayWalk、走路 walk），lobby_ember.js 畫。
        const SV = { write: 6.4, prep: 5, place: 1.2, self: 8 };   // 秒：記點餐（衣櫥那段 3.2 秒播兩遍）、備餐、放下、沒店員時自己拿
        let job = null;   // { g: 常客, crew, stage, at }
        const crewOf = () => S.npcs.find(n => n && n.key === 'cafe_crew' && n._ember && n._ember.ready && n.el && n.el.isConnected) || null;
        // 櫃檯在哪（她的擺設）：從櫃檯後面出來要繞過右邊那頭
        const lanes = () => {
            const o = (_b.CFG.layout || []).find(o => /_counter_/.test(o.file || '') && !o._plotOff);
            if (!o) return null;
            const s = o.s || 1;
            return { exitX: o.x + o.w * s + 70, bottom: o.y + o.h * s, frontY: o.y + o.h * s + 25 };
        };
        const routeTo = (n, to) => {
            const R = lanes(), pts = [];
            if (R) {
                const behind = p => p.y < R.bottom;
                if (behind(n) && !behind(to)) pts.push({ x: R.exitX, y: n.y }, { x: R.exitX, y: R.frontY });
                else if (!behind(n) && behind(to)) pts.push({ x: R.exitX, y: R.frontY }, { x: R.exitX, y: to.y });
            }
            pts.push({ x: to.x, y: to.y });
            n._route = pts;
            n._emberPose = null;
            n.dest = n._route.shift();
        };
        const arrived = (n) => {
            if (n.dest) return false;
            if (n._route && n._route.length) { n.dest = n._route.shift(); return false; }
            return true;
        };
        // 服務那桌時站哪：桌子前面、對面那一側（站他正前面會把他整個擋住）；對面那張椅子有人坐，就站他椅子外側。臉朝他
        const tableOf = (seat) => {
            let best = null, bd = 1e9;
            (_b.CFG.layout || []).forEach(o => {
                if (!/_table_v/.test(o.file || '') || o._plotOff) return;
                const s = o.s || 1, cx = o.x + o.w * s / 2, by = o.y + o.h * s;
                const d = Math.hypot(cx - seat.sx, by - seat.bottom);
                if (d < bd) { bd = d; best = { cx, by }; }
            });
            return best && bd < 220 ? best : null;
        };
        const spotOf = (g) => {
            const seat = g._seat, T = tableOf(seat);
            const taken = T && [...mine.values()].some(o => o !== g && o._seat && o._seat.right !== seat.right && (t => t && t.cx === T.cx && t.by === T.by)(tableOf(o._seat)));
            const p = !T ? { x: seat.stand.x + (seat.right ? -60 : 60), y: seat.stand.y }
                : taken ? { x: seat.sx + (seat.right ? -78 : 78), y: seat.bottom + 6 }
                : { x: T.cx + (seat.right ? 48 : -48), y: T.by + 20 };
            return Object.assign(p, { mirror: g.x > p.x });   // 衣櫥側面臉朝左；他在右邊要翻過來
        };
        const goHome = (c) => { c._tray = false; routeTo(c, c._home); };

        // ---------- 🎁 她點餐送人（os_cafe 菜單頁「點一份」）：排在常客的單前面，店員備好就端過去 ----------
        //   送到：常客坐著的就吃她送的那份；其他人（書裡的角色、瀅瀅…）頭上冒一下「收到了」。
        //   有機率湊一場小劇場（收到的人＋旁邊最近的一位，這一場的由來寫進去）；只配對、不叫模型，她點泡泡「查看」才生成
        const GIFT_THEATER = 0.5;
        const gifts = [];   // { key, item, note, at }
        const deliver = (o) => {
            if (!o || !o.key || !alive()) return false;
            if (!S.npcs.some(n => n && n.key === o.key)) return false;
            gifts.push({ key: o.key, item: String(o.item || ''), note: String(o.note || '').slice(0, 40), at: Date.now() });
            return true;
        };
        const toast = (s) => { try { (W.AUI || window.AUI).toast(s); } catch (e) {} };
        const giftPop = (r, item) => {
            const el = document.createElement('div');
            el.className = 'lstage-gift-pop';
            el.innerHTML = '<i class="fa-solid fa-gift"></i><span></span>';
            el.lastChild.textContent = item;
            el.style.left = Math.round(r.x) + 'px';
            el.style.top = Math.round(r.y - (r.h || 120) - 78) + 'px';   // 比小劇場泡泡（頭頂上 40）再高一層，兩個一起出現才不疊
            S.world.appendChild(el);
            setTimeout(() => el.remove(), 6200);
        };
        const receive = (gf) => {
            const r = S.npcs.find(n => n && n.key === gf.key && n.el && n.el.isConnected);
            const name = r ? r.name : '對方';
            if (!r || !alive()) { toast(name + '已經走了，「' + gf.item + '」先放在櫃檯'); return; }
            if ([...mine.values()].includes(r) && r._seat) {   // 常客：吃她送的這份
                r._gift = { item: gf.item, line: '' };
                r._svc = 'served';
                const b = r._ember;
                if (b) { b.bites = 0; b.act = null; b.nextEat = 0; b.wasServed = true; }
                if (job && job.g === r) job.cancel = true;
            }
            giftPop(r, gf.item);
            toast('「' + gf.item + '」送到' + r.name + '面前了');
            // 🎬 有機率湊一場小劇場
            const T = window.LobbyTheater;
            if (!T || !T.startWith || !T.eligible || Math.random() >= GIFT_THEATER) return;
            const pool = T.eligible();
            if (pool.indexOf(r) < 0) return;   // 常客照腳本跑、沒人設，不湊
            const b = pool.filter(n => n !== r).sort((x, y) => Math.hypot(x.x - r.x, x.y - r.y) - Math.hypot(y.x - r.x, y.y - r.y))[0];
            if (!b) return;
            // 🚨 11-19 她：「我送餐點給別人，別人誤以為是小劇情的人」——只寫「委託人不在這一幕」，模型就把送的人安到旁邊那位身上。
            //   送的人、不是誰、怎麼知道的都寫死；小劇場規則「不把委託人寫進來」這一場要開一個口（可以提起她，她不出場）
            const extra = '送這份東西的人是委託人（玩家）：委託人在視差書咖點了一份「' + gf.item + '」，請店員端到' + r.name + '面前' +
                (gf.note ? '，還附了一張紙條：「' + gf.note + '」' : '') + '。店員放下時說了「這是委託人點給你的」，所以' + r.name + '知道是委託人送的。\n' +
                '- 不是' + b.name + '送的，也不是店員送的：' + b.name + '只是剛好在旁邊看到，兩人都不能誤會成是對方送的。\n' +
                '- 這一場例外：兩人可以聊起委託人、猜委託人為什麼送、要不要回禮，但委託人本人不在場、不出場、沒有台詞。\n' +
                '- 這一場從' + r.name + '剛收到這份東西聊起。' + _whoSent(r);
            if (T.startWith(r, b, extra)) toast(r.name + '和' + b.name + '好像聊起來了，點他們頭上的泡泡可以偷聽');
        };
        // 委託人是誰（11-19 她：「會注入用戶的人設喔?」→「補上」）：照大廳一對一聊天那套，收到的人認得的那個她
        //   （書裡的角色＝那個故事那一輪的人設，管理員＝現在用的；void_terminal.js 的 userPersonaFor）。寫「委託人」不寫「她」：人設不一定是女生
        const _whoSent = (r) => {
            const VT = W.VoidTerminal || window.VoidTerminal;
            const p = VT && VT.userPersonaFor ? VT.userPersonaFor(r) : null;
            if (!p || !p.name) return '';
            return '\n\n【委託人是誰（' + r.name + '認得的委託人）】\n' + p.name + (p.desc ? '：' + p.desc : '') +
                '\n- 兩人提起委託人時照這個認識、可以叫這個名字；委託人本人照樣不出場、沒有台詞。';
        };
        // 送到誰旁邊：坐著的常客照桌子那套；其他人站他旁邊（靠櫃檯出口那側），臉朝他
        const giftSpot = (r) => {
            if ([...mine.values()].includes(r) && r._seat) return spotOf(r);
            const R = lanes(), ex = R ? R.exitX : r.x;
            const p = { x: r.x + (r.x > ex ? -72 : 72), y: r.y + 4 };
            return Object.assign(p, { mirror: r.x > p.x });
        };
        const giftStep = (crew, now) => {
            const gf = job.gift, r = S.npcs.find(n => n && n.key === gf.key);
            const pose = (motion) => { crew._emberPose = { motion, view: 'side', mirror: job.spot.mirror }; };
            if (job.stage !== 'back' && (!r || S.npcs.indexOf(r) < 0 || r._leaving)) { receive(gf); goHome(crew); job.stage = 'back'; return; }
            switch (job.stage) {
                case 'gprep':
                    if (!arrived(crew) || now - job.at < SV.prep * 1000) break;
                    if (r === crew) { receive(gf); job = null; break; }   // 送給店員自己：做好就是他的
                    crew._tray = true;
                    job.spot = giftSpot(r);
                    routeTo(crew, job.spot);
                    job.stage = 'gto';
                    break;
                case 'gto':
                    if (arrived(crew)) { pose('tray'); job.stage = 'gplace'; job.at = now; }
                    break;
                case 'gplace':
                    if (now - job.at > SV.place * 1000) { receive(gf); goHome(crew); job.stage = 'back'; }
                    break;
                case 'back':
                    if (arrived(crew)) { crew._emberPose = null; job = null; }
                    break;
            }
        };

        const serve = () => {
            const now = Date.now();
            const guests = [...mine.values()].filter(g => g && !g._leaving && S.npcs.indexOf(g) >= 0);
            guests.forEach(g => { if (g._svc === 'none' && g._entry && g._entry.item) { g._svc = 'wait'; g._svcAt = now; } });
            const crew = crewOf();
            if (job && (job.crew !== crew)) { if (job.gift && job.stage !== 'back') gifts.unshift(job.gift); job = null; }   // 下班、換人了（她的那份還沒送到：排回去）
            if (!crew) {   // 沒店員：自己去櫃檯拿；她點的過幾秒直接送到
                guests.forEach(g => { if ((g._svc === 'wait' || g._svc === 'ordered') && now - g._svcAt > SV.self * 1000) g._svc = 'served'; });
                while (gifts.length && now - gifts[0].at > 4000) receive(gifts.shift());
                return;
            }
            if (!crew._home) { crew._home = { x: crew.x, y: crew.y }; crew._emberWalk = true; crew.noWander = false; crew.wanderT = Infinity; }
            const gone = g => !g || g._leaving || S.npcs.indexOf(g) < 0 || !g._seat;
            if (!job) {
                if (!arrived(crew)) return;   // 還在走回櫃檯
                crew._emberPose = null;
                crew.scriptOnly = false;      // 在櫃檯閒著：可以被小劇場拉去聊天
                if (crew._theaterFrozen) return;   // 正在小劇場裡聊：聊完再去
                crew.scriptOnly = true;       // 接下來要送餐：送完之前別被拉去聊天（被凍住會停在半路）
                if (gifts.length) { job = { gift: gifts.shift(), crew, stage: 'gprep', at: now }; return; }   // 她點的先送
                const g = guests.filter(g => g._seat && (g._svc === 'wait' || g._svc === 'ordered')).sort((a, b) => a._svcAt - b._svcAt)[0];
                if (!g) { crew.scriptOnly = false; return; }
                if (g._svc === 'ordered') { job = { g, crew, stage: 'prep', at: now }; return; }   // 點過了（上一位店員點的）：直接備餐
                job = { g, crew, stage: 'toOrder', spot: spotOf(g) };
                routeTo(crew, job.spot);
                return;
            }
            if (job.gift) { giftStep(crew, now); return; }
            const g = job.g;
            if ((gone(g) || job.cancel) && job.stage !== 'back') { goHome(crew); job.stage = 'back'; return; }
            const pose = (motion) => { crew._emberPose = { motion, view: 'side', mirror: job.spot.mirror }; };
            switch (job.stage) {
                case 'toOrder':
                    if (arrived(crew)) { pose('writing'); job.stage = 'writing'; job.at = now; }
                    break;
                case 'writing':
                    if (now - job.at > SV.write * 1000) { g._svc = 'ordered'; goHome(crew); job.stage = 'toPrep'; }
                    break;
                case 'toPrep':
                    if (arrived(crew)) { crew._emberPose = null; job.stage = 'prep'; job.at = now; }
                    break;
                case 'prep':
                    if (!arrived(crew)) break;
                    if (now - job.at > SV.prep * 1000) {
                        crew._tray = true;
                        job.spot = spotOf(g);
                        routeTo(crew, job.spot);
                        job.stage = 'toServe';
                    }
                    break;
                case 'toServe':
                    if (arrived(crew)) { pose('tray'); job.stage = 'placing'; job.at = now; }
                    break;
                case 'placing':
                    if (now - job.at > SV.place * 1000) { g._svc = 'served'; goHome(crew); job.stage = 'back'; }
                    break;
                case 'back':
                    if (arrived(crew)) { crew._emberPose = null; job = null; }
                    break;
            }
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
                    if (!c || e.t >= c.t) inn.set(e.key, { t: e.t, line: e.line || '', item: e.price ? (e.item || '') : '', until });   // item：有買到東西才有（坐著會吃它）
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
        // 送餐那段 0.1 秒看一次（轉角接下一段路才不會停一下）
        const serveTick = () => {
            if (!alive()) { stop(); return; }
            try { serve(); } catch (e) { console.warn('[CafeRegulars] 送餐那段出錯', e); job = null; }
        };
        tickT = setInterval(tick, TICK_MS);
        pollT = setInterval(poll, 400);
        serveT = setInterval(serveTick, 100);
        _live = { world, stop, tick, poll, serveTick, mine, deliver, gifts: () => gifts, seats: () => _seatsOf(_b.CFG), job: () => job, bind:(p, e, sheet) => { const n = spawn(p, e, sheet, true); mine.set(p.key, n); return n; } };   // seats／job／bind：console 診斷、測試用
        tick();
        return true;
    }

    // 🎁 點一份送人：現在書咖裡能送給誰（她自己、正要走的不算）；大廳不在書咖＝空的
    function targets() {
        const LS = window.LobbyStage, S = LS && LS._S;
        if (!_live || !S || !S.active || S.scene !== 'cafe' || S.world !== _live.world) return [];
        const seen = new Set();
        return (S.npcs || []).filter(n => n && n !== S.player && n.name && n.key && n.el && n.el.isConnected && !n._leaving && !seen.has(n.key) && seen.add(n.key))
            .map(n => ({ key: n.key, name: n.name }));
    }

    window.LobbyCafeRegulars = {
        mount,
        targets,
        deliver: (o) => !!(_live && _live.deliver(o)),   // { key, item, note } → 店員端過去；不在書咖回 false
        sheetOf: _sheetOf,          // 測試用：拿某個長相拼好的走路圖
        _live: () => _live,         // console 診斷用：現在舞台上有誰
    };
})();
