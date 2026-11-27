// ----------------------------------------------------------------
// [檔案] core/void/lobby_cafe_regulars.js
// 職責：☕ 書咖的 12 位常客出現在大廳的書咖場景裡。
//   照書咖的到店紀錄：現在在店裡的站在客人出沒區；剛到的從門口一跳一跳進來，待一陣子再跳出去。
//   點他＝跳一行字（誰、什麼習性、今天點了什麼），不叫模型。
//   長相＝隔壁衣櫥（小火苗衣櫥）裡那 18 位常客拍下來的圖（11-15 起 18 位都換成衣櫥版）：
//   素材庫 cafe_dolls_v1/walk/<長相>.webp 是拼好的 3×4 走路圖（列：往下／往左／往右／往上；欄：踏一步／站著／踏另一步），
//   往下走看正面、往上走看背面（都是一跳一跳，衣櫥裡正面的走路就是跳）、左右看側面（腳會踏步）。
//   18 位同一個格子大小、同一個比例，腳底在格底、身體中心在格子正中。不是像素圖，舞台上要平滑縮（smooth）。
//   🔁 之後在衣櫥改了頭髮、衣服：收成衣櫥內建後跑本機 tmp/doll_bake/bake.cjs <長相> → sheet.py → 傳素材庫 → 換下面的 DOLL_REF。
//   舊圖（阿洛畫的三視圖長條圖 cafe_guests_v1/、坐姿 cafe_guests_sit_v1/）還在素材庫，徵人頁（os_cafe_hire.js）的應徵者照片還在用。
//   誰、長什麼樣在 os_cafe_regulars.js；幾點到店在 os_cafe.js 的結算——這裡每 30 秒叫一次「悄悄補算」，不叫模型。
//   🪑 坐姿（10-16 起有）＝衣櫥的側面坐姿（朝右，cafe_dolls_v1/sit/），18 位的屁股都在圖上同一個高度：
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
    const _isMix = (look) => typeof look === 'string' && look.indexOf('mix:') === 0;   // 路過的客人（lobby_ember.js 的 mixLook：'mix:頭|衣服|膚色'）
    //   路人整個人都是衣櫥畫的；舞台底下墊的圖（點他、量大小用，會被衣櫥那層蓋住、變透明）借衣服那位常客拍好的走路圖、坐姿圖
    const _baseLook = (look) => _isMix(look) ? String(look).slice(4).split('|')[1] : look;
    function _sheetOf(look) {
        look = _baseLook(look);
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
        look = _baseLook(look);
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
        let first = true, busy = false, tickT = null, pollT = null, serveT = null, walkT = null, guestT = null, guestPT = null;
        const _isWalker = (k) => String(k).indexOf('w_') === 0;   // 路過的客人（不在常客名冊、不在到店紀錄）

        const stop = () => { try { window.LobbyCafePests && window.LobbyCafePests.stop(); } catch (e) {} clearInterval(tickT); clearInterval(pollT); clearInterval(serveT); clearInterval(walkT); clearInterval(guestT); clearInterval(guestPT); if (_live && _live.world === world) _live = null; };
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
            if (p.walkin) { try { (W.AUI || window.AUI).toast('路過的客人：' + ((n._entry && n._entry.line) || '進來坐一下。')); } catch (e) {} return; }
            const ty = REG.TYPES[p.type] || {};
            const tr = (p.traits || []).map(t => (REG.TRAITS[t] || {}).label).filter(Boolean).join('、');
            const what = (n._entry && n._entry.line) || '剛進來，還在看菜單。';
            try { (W.AUI || window.AUI).toast(p.name + '（' + (ty.label || '常客') + (tr ? '・' + tr : '') + '）' + what); } catch (e) {}
        };
        // 空椅子：別的常客坐著或正走過去的不算；挑一張隨機的（每次進來不會都擠同一張）
        const freeSeat = () => {
            const used = new Set();
            S.npcs.forEach(n => { const s = n && (n._seat || n._seatWant); if (s) used.add(s.i); });   // 常客、路人、坐下來的故事角色都算
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
                if (n._ember && n._ember.on) n.el.style.opacity = '0';   // 衣櫥那層蓋著：換圖別讓底下那張閃一下
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
            if (n._ember && n._ember.on) n.el.style.opacity = '0';
        };
        const spawn = (p, e, sheet, walkIn) => {
            const ty = REG.TYPES[p.type] || {};
            const seat = freeSeat();
            const to = seat ? seat.stand : spot(), from = walkIn ? door() : to;
            const n = _b.addNpc({
                key: 'cafe_reg_' + p.key, name: p.name, subTitle: p.walkin ? '路過的客人' : (ty.label || '常客') + ' · 書咖常客',
                x: from.x, y: from.y, h: NPC_H, src: { sheet }, smooth: true,
                scriptOnly: true,   // 照腳本跑：不進小劇場配對、不開對話（點他只跳一行字）
                homeRect: _b.CFG.points.npcZone, onInteract: () => say(p, n),
            });
            n.wanderT = Infinity;   // 不亂晃：只照進門、出門走
            n._entry = e;
            // 🫧 停下來、坐下時換成衣櫥活的那套（會呼吸、眨眼，點了東西會吃）；拿不到衣櫥就照舊這張走路圖（lobby_ember.js）
            // entry：她點來送他的（n._gift）蓋過他自己點的
            if (window.LobbyEmber) window.LobbyEmber.bind(n, p.look, { entry: () => n._gift ? Object.assign({}, n._entry, n._gift) : n._entry, served: () => n._svc === 'served', walker: !!p.walkin });
            if (p.walkin) { n._emberWalk = true; try { n.el.style.opacity = '0'; } catch (e) {} }   // 路人：走路也照衣櫥畫（同店員）；底下借來的圖一開始就藏著
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

        // ---------- 🪑 不倒翁的故事角色：會走去坐、收到吃的坐下來吃（11-23 起；以前收到吃的還是站著）----------
        //   誰：大廳刷出來的故事角色（key 開頭 jr_／bk_），身上是不倒翁（lobby_doll_cut.js 綁著、有側面原圖）。其他長相的照舊站著。
        //   坐姿、吃一口全照衣櫥（lobby_doll_cut.js 的 sitPose／eat，數字是從衣櫥坐桌前、叉子吃一口量的）。
        //   平常：每 30 秒每位有一點機會走去空椅子坐 1～2.5 分鐘，或換個地方站；收到她點的：走去坐下吃（吃 6 口），坐 2.5 分鐘才起來。
        //   走的時候暫時解開「站定」（noWander）、不擋路（avoidBlocks），到了再設回去。正在跟她講話、在小劇場裡的不動他。
        const DC = () => window.LobbyDollCut;
        const _dollGuest = (n) => !!(n && /^(jr_|bk_)/.test(n.key || '') && onStage(n) && DC() && DC().canSit && DC().canSit(n));
        const _busy = (n) => S.talkTarget === n || n._theaterFrozen || n.follow;
        const _walkTo = (n, to) => {
            if (!n._gKeep) n._gKeep = { noWander: n.noWander, avoidBlocks: n.avoidBlocks };
            n.noWander = false; n.wanderT = Infinity; n.avoidBlocks = false;
            n.dest = { x: to.x, y: to.y };
        };
        const _settle = (n) => { if (n._gKeep) { n.noWander = n._gKeep.noWander; n.avoidBlocks = n._gKeep.avoidBlocks; n._gKeep = null; } n.walking = false; n.dir = 0; n.frame = 1; };
        const guestSit = (n, eatIt, stayS) => {
            if (!_dollGuest(n) || n._gSit || _busy(n)) return false;
            const seat = freeSeat();
            if (!seat) return false;
            n._seatWant = seat;
            n._gSit = { seat, eat: !!eatIt, phase: 'go', stay: stayS || 60 + Math.random() * 90 };
            _walkTo(n, seat.stand);
            return true;
        };
        const guestEat = (n) => {
            if (n._gSit && n._gSit.phase === 'sit') { DC().eat(n); n._gSit.until = Math.max(n._gSit.until, Date.now() + 150000); return; }
            if (n._gSit) { n._gSit.eat = true; n._gSit.stay = Math.max(n._gSit.stay, 150); return; }
            guestSit(n, true, 150);
        };
        const guestUp = (n) => {
            const g = n._gSit; if (!g) return;
            if (g.phase === 'sit') { DC().sitPose(n, null); n.x = g.seat.stand.x; n.y = g.seat.stand.y; n.h = n._standH || n.h; _b.placeActor(n); }
            n._seat = null; n._seatWant = null; n._gSit = null; n.dest = null; _settle(n);
        };
        const guestPoll = () => {
            const now = Date.now();
            S.npcs.forEach(n => {
                const g = n && n._gSit; if (!g) return;
                if (!onStage(n)) { n._gSit = null; return; }
                if (g.phase === 'go') {
                    if (_busy(n)) return;
                    if (n.dest) return;
                    // 走到椅子前面了：坐下（蛋底對到椅面；腳底那條線壓到椅子底邊前面，前後才排在椅子前面）
                    n._standH = n._standH || n.h;
                    n._seat = g.seat; n._seatWant = null;
                    n.x = g.seat.sx; n.y = g.seat.bottom + 2;
                    _settle(n); n.noWander = true;
                    _b.placeActor(n);
                    DC().sitPose(n, g.seat);
                    if (g.eat) DC().eat(n);
                    g.phase = 'sit'; g.until = now + g.stay * 1000;
                } else if (g.phase === 'sit' && now > g.until && !_busy(n)) guestUp(n);
            });
            // 換地方站：走到了就站定
            S.npcs.forEach(n => { if (n && n._gMove && !n.dest) { n._gMove = false; _settle(n); } });
        };
        const guestIdle = () => {
            if (document.hidden) return;
            S.npcs.forEach(n => {
                if (!_dollGuest(n) || n._gSit || n._gMove || _busy(n) || n.dest) return;
                const r = Math.random();
                if (r < 0.12) guestSit(n, false);
                else if (r < 0.25) { const to = spot(); if (to) { n._gMove = true; _walkTo(n, to); } }
            });
        };
        // ---------- 🍽 點餐、送餐（11-19 整套接上）----------
        //   雇來的員工（lobby_npcs 的 cafe_crew，接上衣櫥的才算）：從櫃檯後面繞出來 → 走到那桌前面記點餐 → 回櫃檯備餐 → 端盤送過去放下 → 回櫃檯。
        //   一次服務一桌，照坐下的先後。沒有員工（或衣櫥接不上）：坐下過一會兒自己就有了（當作去櫃檯拿）。
        //   動作全照衣櫥原樣（記點餐 writing、端盤 tray、送餐走路 trayWalk、走路 walk），lobby_ember.js 畫。
        const SV = { write: 6.4, prep: 5, place: 1.2, self: 8 };   // 秒：記點餐（衣櫥那段 3.2 秒播兩遍）、備餐、放下、沒店員時自己拿
        let job = null;   // { g: 常客, crew, stage, at }
        // 誰送：雇來的員工（衣櫥那套還沒載好也算：照舊那張圖走過去，載好了才有端盤、記點餐的動作）；
        //   這一班沒有員工，她點的那份改由瀅瀅端過去（11-20：以前沒員工、或衣櫥還沒載好，就直接算送到，店員卡在原地卻說送到了）
        const onStage = n => n && n.el && n.el.isConnected && S.npcs.indexOf(n) >= 0;
        const crewOf = () => S.npcs.find(n => n && n.key === 'cafe_crew' && onStage(n)) || null;
        const yingOf = () => S.npcs.find(n => n && n.key === 'ying' && onStage(n)) || null;
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
        // 送完了：瀅瀅放回去照常在櫃檯那條晃、可以被拉去小劇場（員工照舊站著等下一單）
        const _release = (c) => {
            if (!c) return;
            c._tray = false; c._emberPose = null;
            if (c.key === 'cafe_crew') return;
            c.scriptOnly = false; c._emberWalk = false; c._home = null; c._route = null;
            c.wanderT = c._wanderKeep != null && isFinite(c._wanderKeep) ? c._wanderKeep : 2000; c._wanderKeep = null;
        };

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
            else if (_dollGuest(r)) guestEat(r);   // 🪑 不倒翁的故事角色：走去空椅子坐下來吃（已經坐著就直接吃）
            giftPop(r, gf.item);
            toast('「' + gf.item + '」送到' + r.name + '面前了');
            // 🎬 有機率湊一場小劇場
            const T = window.LobbyTheater;
            if (!T || !T.startWith || !T.eligible || Math.random() >= GIFT_THEATER) return;
            const pool = T.eligible();
            if (pool.indexOf(r) < 0) return;   // 常客照腳本跑、沒人設，不湊
            const b = pool.filter(n => n !== r).sort((x, y) => Math.hypot(x.x - r.x, x.y - r.y) - Math.hypot(y.x - r.x, y.y - r.y))[0];
            if (!b) return;
            // 🚨 11-19：送餐點給別人，收到的人誤以為送的人是小劇場裡的人——只寫「委託人不在這一幕」，模型就把送的人安到旁邊那位身上。
            //   送的人、不是誰、怎麼知道的都寫死；小劇場規則「不把委託人寫進來」這一場要開一個口（可以提起她，她不出場）
            const extra = '送這份東西的人是委託人（玩家）：委託人在視差書咖點了一份「' + gf.item + '」，請店員端到' + r.name + '面前' +
                (gf.note ? '，還附了一張紙條：「' + gf.note + '」' : '') + '。店員放下時說了「這是委託人點給你的」，所以' + r.name + '知道是委託人送的。\n' +
                '- 不是' + b.name + '送的，也不是店員送的：' + b.name + '只是剛好在旁邊看到，兩人都不能誤會成是對方送的。\n' +
                '- 這一場例外：兩人可以聊起委託人、猜委託人為什麼送、要不要回禮，但委託人本人不在場、不出場、沒有台詞。\n' +
                '- 這一場從' + r.name + '剛收到這份東西聊起。' + _whoSent(r);
            if (T.startWith(r, b, extra)) toast(r.name + '和' + b.name + '好像聊起來了，點他們頭上的泡泡可以偷聽');
        };
        // 委託人是誰（11-19 補上用戶人設）：照大廳一對一聊天那套，收到的人認得的那個她
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
                    if (r === crew) { receive(gf); _release(crew); job = null; break; }   // 送給店員（或瀅瀅）自己：做好就是他的
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
                    if (arrived(crew)) { _release(crew); job = null; }
                    break;
            }
        };

        const serve = () => {
            const now = Date.now();
            const guests = [...mine.values()].filter(g => g && !g._leaving && S.npcs.indexOf(g) >= 0);
            guests.forEach(g => { if (g._svc === 'none' && g._entry && g._entry.item) { g._svc = 'wait'; g._svcAt = now; } });
            const crew0 = crewOf();
            // 正在送的那位不在了（下班、換人、離開舞台）：她的那份還沒送到就排回去
            if (job && (!onStage(job.crew) || (crew0 && job.crew !== crew0 && job.crew.key === 'cafe_crew'))) { if (job.gift && job.stage !== 'back') gifts.unshift(job.gift); _release(job.crew); job = null; }
            const ying = !crew0 ? yingOf() : null;
            const crew = job ? job.crew : (crew0 || (gifts.length && ying && S.talkTarget !== ying && !ying._theaterFrozen ? ying : null));
            if (!crew || crew.key !== 'cafe_crew') {   // 沒員工：常客自己去櫃檯拿
                guests.forEach(g => { if ((g._svc === 'wait' || g._svc === 'ordered') && now - g._svcAt > SV.self * 1000) g._svc = 'served'; });
            }
            if (!crew) {   // 連瀅瀅都不在（或正在跟妳聊、在小劇場裡）：她點的等一下，太久就直接送到
                while (gifts.length && now - gifts[0].at > (ying ? 60000 : 4000)) receive(gifts.shift());
                return;
            }
            if (crew.key !== 'cafe_crew' && !job && !gifts.length) return;   // 瀅瀅只幫忙送她點的，常客的單不歸她
            if (!crew._home || crew.key !== 'cafe_crew' && !job) {
                // 員工：櫃檯後面那個站位就是家；瀅瀅會在櫃檯那條晃，從她現在站的地方出發、送完回這裡（漫步先停，送完放回去）
                crew._home = { x: crew.x, y: crew.y }; crew._emberWalk = true; crew.noWander = false;
                if (crew.key !== 'cafe_crew' && crew._wanderKeep == null) crew._wanderKeep = crew.wanderT;
                crew.wanderT = Infinity;
            }
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
                    if (_isWalker(k)) continue;   // 路過的客人不在到店紀錄裡：自己的時間到了才走（walkin）
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
        // ---------- 🚶 路過的客人（11-23：隨機頭髮，不要每次都一樣造型）----------
        //   常客照舊；另外偶爾有沒名字的路人走進來，頭髮、衣服、膚色每個都隨機（lobby_ember.js 的 mixLook，拿現成常客的頭配別人的衣服，不叫衣櫥重做）。
        //   走路、坐下、離開全程衣櫥畫（n._emberWalk＋walker，同店員），不另外烤圖。
        //   從門口走進來 → 有空椅子就坐（沒有就不進來）→ 待 1.5～4 分鐘 → 走出去。不點餐、不算進書咖的帳、不進小劇場；點他跳一行字。
        //   她點一份送他照樣送得到（受到的跟常客一樣坐著吃）。衣櫥接不上（網頁版、朋友的酒館）＝不會有路人。
        const WALKIN_MAX = 2, WALKIN_EVERY = 25000, WALKIN_P = 0.3;
        const WALKIN_LINES = ['路過進來坐一下。', '在等人，先進來坐坐。', '外面太冷了，進來躲一下。', '看到招牌，好奇進來看看。', '走累了，借個位子歇腳。'];
        let walkSeq = 0, walkBusy = false;
        const walkin = async () => {
            if (!alive() || walkBusy) return;
            const now = Date.now();
            for (const [k, n] of mine) if (_isWalker(k) && !n._leaving && now > n._until) leave(n);
            const LE = window.LobbyEmber;
            if (!LE || !LE.mixLook || document.hidden) return;
            let walkers = 0, count = 0;
            mine.forEach((n, k) => { if (n._leaving) return; count++; if (_isWalker(k)) walkers++; });
            if (walkers >= WALKIN_MAX || count >= MAX_IN || !freeSeat() || Math.random() > WALKIN_P) return;
            walkBusy = true;
            try {
                const look = await LE.mixLook();
                if (!look || !alive() || !LE.prepare || !(await LE.prepare(look)) || !alive()) return;
                const sheet = await _sheetOf(look);
                if (!sheet || !alive() || !freeSeat()) return;
                const id = 'w_' + (++walkSeq) + '_' + Date.now().toString(36);
                const n = spawn({ key: id, name: '路過的客人', look, walkin: true }, { line: WALKIN_LINES[Math.floor(Math.random() * WALKIN_LINES.length)], item: '' }, sheet, true);
                n._until = Date.now() + (90 + Math.random() * 150) * 1000;
                mine.set(id, n);
            } catch (e) { console.warn('[CafeRegulars] 路過的客人沒進來', e); }
            finally { walkBusy = false; }
        };
        // 送餐那段 0.1 秒看一次（轉角接下一段路才不會停一下）
        const serveTick = () => {
            if (!alive()) { stop(); return; }
            try { serve(); } catch (e) { console.warn('[CafeRegulars] 送餐那段出錯', e); job = null; }
        };
        tickT = setInterval(tick, TICK_MS);
        pollT = setInterval(poll, 400);
        serveT = setInterval(serveTick, 100);
        walkT = setInterval(walkin, WALKIN_EVERY);
        guestT = setInterval(guestIdle, 30000);
        guestPT = setInterval(guestPoll, 400);
        _live = { world, stop, tick, poll, serveTick, walkin, guestSit, guestEat, guestUp, guestIdle, mine, deliver, gifts: () => gifts, seats: () => _seatsOf(_b.CFG), job: () => job, bind:(p, e, sheet) => { const n = spawn(p, e, sheet, true); mine.set(p.key, n); return n; } };   // seats／job／bind：console 診斷、測試用
        tick();
        try { window.LobbyCafePests && window.LobbyCafePests.mount(world); } catch (e) { console.warn('[CafeRegulars] 店況（老鼠蟑螂髒汙）沒畫上去', e); }   // 🐀 lobby_cafe_pests.js
        return true;
    }

    // ---------- 🚶 書咖以外的地方也有路人（11-25：大廳原本太空）----------
    //   跟書咖的「路過的客人」同一套：長相 LobbyEmber.mixLook（頭髮、衣服、膚色隨機）、進門前 prepare 做好、走路站著全程衣櫥畫，
    //   舞台底下墊的圖照樣借衣服那位常客拍好的走路圖（_sheetOf）。衣櫥接不上（網頁版、朋友的酒館）＝不會有路人。
    //   差別：這裡沒有椅子、不點餐——從門口（points.arrive）走進來 → 走到出沒區一個空的地方站著 → 偶爾換個地方 → 時間到走回門口收掉。
    //   進場時先放一兩位已經站在裡面的（不然一進來還是空的），之後每 20 秒有機會再來一位，最多同時 WALK_CFG[場景].max 位。
    //   不進小劇場、不開對話（scriptOnly），點他跳一行字。誰叫：lobby_npcs.js 的 initNpcs（大廳那段）。
    const WALK_CFG = {
        hall: { max: 4, first: 2, every: 20000, p: 0.45,
            lines: ['來看看世界門長什麼樣子。', '跟朋友約在這裡碰面。', '第一次來，到處看看。', '聽說這裡可以去別的世界。', '路過，進來吹個冷氣。', '在等導覽，先逛一下。'] },
    };
    let _walk = null;
    function mountWalkers() {
        const LS = window.LobbyStage, _b = LS && LS._b, LE = window.LobbyEmber;
        if (!_b || !LE || !LE.mixLook) return false;
        const S = _b.S, scene = S.scene, world = S.world, C = WALK_CFG[scene];
        if (!C) return false;
        if (_walk) _walk.stop();
        const alive = () => S.active && S.scene === scene && S.world === world;
        const mine = new Map();
        let seq = 0, busy = false, firstLeft = C.first;
        const Z = () => _b.CFG.points.npcZone || { x: 200, y: 600, w: 1000, h: 250 };
        const door = () => { const P = _b.CFG.points; return P.arrive || P.player || { x: 720, y: 870 }; };
        const spot = (near) => {   // 出沒區裡挑空曠、離別人遠的地方（同書咖 spot）；near＝換地方時別只挪一點點
            const z = Z(); let best = null, bs = -1;
            for (let t = 0; t < 24; t++) {
                const x = z.x + Math.random() * z.w, y = z.y + Math.random() * z.h;
                if (_b.blocked(x, y) || (near && Math.hypot(near.x - x, near.y - y) < 160)) continue;
                let sc = _b.whiteRatio(x, y, 70);
                if (S.npcs.some(n => n && Math.hypot(n.x - x, n.y - y) < 120)) sc -= 0.5;
                if (sc > bs) { bs = sc; best = { x, y }; }
            }
            return best;
        };
        const remove = (n) => {
            [n.el, n.tag, n.hint].forEach(el => { try { el && el.remove(); } catch (e) {} });
            const i = S.npcs.indexOf(n); if (i >= 0) S.npcs.splice(i, 1);
        };
        const leave = (n) => { n._leaving = true; const d = door(); n.dest = { x: d.x, y: d.y + 40 }; };
        const come = async (walkIn) => {
            if (busy || !alive()) return;
            busy = true;
            try {
                const look = await LE.mixLook();
                if (!look || !alive() || !LE.prepare || !(await LE.prepare(look)) || !alive()) return;
                const sheet = await _sheetOf(look);
                const to = sheet && alive() && spot();
                if (!to) return;
                const from = walkIn ? door() : to;
                const line = C.lines[Math.floor(Math.random() * C.lines.length)];
                const id = 'w_' + scene + '_' + (++seq) + '_' + Date.now().toString(36);
                const n = _b.addNpc({
                    key: id, name: '路人', subTitle: '路過的人',
                    x: from.x, y: from.y, h: NPC_H, src: { sheet }, smooth: true,
                    scriptOnly: true, homeRect: Z(),
                    onInteract: () => { try { (W.AUI || window.AUI).toast('路人：' + line); } catch (e) {} },
                });
                n.wanderT = Infinity;
                n._entry = { line, item: '' };
                LE.bind(n, look, { entry: () => n._entry, served: () => false, walker: true });
                n._emberWalk = true; try { n.el.style.opacity = '0'; } catch (e) {}   // 走路也照衣櫥畫；底下借來的圖一開始就藏著
                n._look = look;
                n._until = Date.now() + (120 + Math.random() * 180) * 1000;   // 待 2～5 分鐘
                n._moveAt = Date.now() + (40 + Math.random() * 60) * 1000;    // 過一陣子可能換個地方站
                if (walkIn) n.dest = { x: to.x, y: to.y };
                mine.set(id, n);
            } catch (e) { console.warn('[Walkers] 路人沒進來', scene, e); }
            finally { busy = false; }
        };
        const tick = async () => {
            if (!alive()) { stop(); return; }
            if (document.hidden) return;
            const now = Date.now();
            for (const [, n] of mine) {
                if (n._leaving || S.talkTarget === n || n._theaterFrozen) continue;
                if (now > n._until) { leave(n); continue; }
                if (!n.dest && now > n._moveAt) {
                    n._moveAt = now + (50 + Math.random() * 70) * 1000;
                    if (Math.random() < 0.5) { const to = spot(n); if (to) n.dest = to; }
                }
            }
            let count = 0; mine.forEach(n => { if (!n._leaving) count++; });
            if (firstLeft > 0) { firstLeft--; await come(false); return; }   // 一開始那一兩位：已經站在裡面
            if (count < C.max && Math.random() < C.p) await come(true);
        };
        // 走到了：轉回正面站好；要走的走到門口就收掉
        const poll = () => {
            if (!alive()) { stop(); return; }
            for (const [k, n] of mine) {
                if (S.npcs.indexOf(n) < 0) { mine.delete(k); continue; }
                if (n._leaving) { if (!n.dest) { remove(n); mine.delete(k); } continue; }
                if (!n.dest && n.dir !== 0) { n.dir = 0; n.frame = 1; n.animT = 0; _b.placeActor(n); }
            }
        };
        const tickT = setInterval(tick, C.every), pollT = setInterval(poll, 400);
        const fastT = setInterval(() => { if (firstLeft > 0) tick(); else clearInterval(fastT); }, 1500);   // 開場那一兩位不要等 20 秒
        const stop = () => { clearInterval(tickT); clearInterval(pollT); clearInterval(fastT); if (_walk && _walk.world === world) _walk = null; };
        _walk = { world, scene, stop, tick, mine };
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
        mountWalkers,               // 🚶 書咖以外的路人（大廳）；lobby_npcs.js 的 initNpcs 叫
        _walk: () => _walk,         // console 診斷用
        targets,
        deliver: (o) => !!(_live && _live.deliver(o)),   // { key, item, note } → 店員端過去；不在書咖回 false
        sheetOf: _sheetOf,          // 測試用：拿某個長相拼好的走路圖
        _live: () => _live,         // console 診斷用：現在舞台上有誰
    };
})();
