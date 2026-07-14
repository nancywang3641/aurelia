// ----------------------------------------------------------------
// [檔案] core/void/lobby_stage.js (V1.1 - 書咖俯視像素舞台+擺設模式)
// 職責：把 lobby-left 換成星露谷式俯視舞台（分層地圖/小人/NPC/互動）。
//       對話仍走 void_terminal 的 sendIrisMessage（本模組只提供 talkTarget 與各 NPC 歷史）。
// 分層：底圖(z0) → 物件與角色同一套「底邊y=z-index」深度排序（人走到桌後被遮）。
// 擺設模式：舞台右下 🖊 鈕 → 拖物件/站位、調佔地 → 本機即時生效(localStorage) + 一鍵複製數據。
// 開關：localStorage lobby_stage_on（'0' 關 → 完整還原原立繪大廳）
// ----------------------------------------------------------------
(function () {
    'use strict';

    const CDN = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@main/';
    const ASSET = {
        // 底圖per場景（SCENES[].base）；素材改版一律換新檔名(瀏覽器對舊檔快取7天,原地覆蓋沒用)
        ying:  CDN + 'lobby_ying.png',
        alice: CDN + 'lobby_alice.png',
        cheshire: CDN + 'lobby_cheshire.png',
        mcF:   CDN + 'lobby_mc_f.png',
        mcM:   CDN + 'lobby_mc_m.png',
        walkBase: CDN + 'lobby_walk_base_v1.png',   // 3×4走路圖素體(列=下/左/右/上,欄=左步/立/右步)
        yingWalk: CDN + 'lobby_ying_walk_v1.png',       // 瀅瀅豆豆走路圖(Rae出品,官方預設)
        aliceWalk: CDN + 'lobby_alice_walk_v1.png',     // 愛麗絲走路圖
        cheshireWalk: CDN + 'lobby_cheshire_walk_v2.png', // 柴郡走路圖(v2=Rae調過大小；改版必換檔名防快取)
    };
    const MAP_W = 1536, MAP_H = 1024;   // 底圖尺寸（兩場景同規格）

    // ── 🗺️ 場景註冊表（雙子設定：瀅瀅書咖 ⇄ 愛麗絲純白大廳）──
    // layout: footH=腳印高(物件底部佔地)、s=個別縮放；points: 各場景擺設模式各存各的
    // doors: 走進觸發區→白光過場→切場景（spawn=抵達點）
    const SCENES = {
        cafe: {
            base: 'lobby_base_v2.png',
            mask: 'lobby_mask_cafe_v1.png',   // Rae 手繪碰撞遮罩(白=可走)；載入後取代鋼索+烤死家具矩形
            cfgKey: 'lobby_stage_layout_v1',   // 沿用 Rae 已調好的存檔
            layout: [
                { file: 'lobby_obj_counter.png', x: 307,  y: 356, w: 1266, h: 396, footH: 300, s: 0.4 },
                { file: 'lobby_obj_02.png',      x: 337,  y: 571, w: 394,  h: 258, footH: 90,  s: 0.6 },
                { file: 'lobby_obj_01.png',      x: 701,  y: 685, w: 391,  h: 267, footH: 90,  s: 0.6 },
                { file: 'lobby_obj_04.png',      x: 1080, y: 560, w: 396,  h: 263, footH: 90,  s: 1 },
                { file: 'lobby_obj_03.png',      x: 60,   y: 330, w: 166,  h: 259, footH: 60,  s: 1 },
                { file: 'lobby_obj_05.png',      x: 1380, y: 330, w: 156,  h: 259, footH: 60,  s: 1 },
                { file: 'lobby_obj_07.png',      x: 258,  y: 813, w: 425,  h: 177, footH: 20,  s: 0.7 },
            ],
            points: {
                yingZone: { x: 340, y: 405, w: 440, h: 45 },
                npcZone:  { x: 220, y: 600, w: 1100, h: 260 },   // 客人出沒區（輪班NPC隨機刷在框內）
                player: { x: 697, y: 600 },
                arrive: { x: 975, y: 430 },   // 走門進來的落點（從大廳回書咖）
                // 外框鋼索：可走範圍多邊形（牆角錨點可在擺設模式拖）
                boundary: [
                    { x: 195, y: 360 }, { x: 1345, y: 360 }, { x: 1430, y: 640 },
                    { x: 1458, y: 925 }, { x: 75, y: 925 }, { x: 105, y: 640 },
                ],
                actorScale: 0.7,
            },
            walls: [
                // 外牆改走 boundary 鋼索；這裡只留底圖烤死的家具
                { x: 1140, y: 360, w: 260,  h: 155 },   // 右側沙發閱讀角
                { x: 1140, y: 800, w: 396,  h: 130 },   // 右下露臺花圃
                { x: 915,  y: 840, w: 180,  h: 90 },    // 底部中央花圃
                { x: 55,   y: 620, w: 130,  h: 110 },   // 左側小案几
            ],
            doors: [ { x: 895, y: 355, w: 170, h: 34, to: 'hall', spawn: { x: 770, y: 790 } } ],  // 書咖上緣木門→大廳
        },
        hall: {
            base: 'lobby_hall_base_v2.png',   // v2=核心球已從底圖拆出(空核心版)
            mask: 'lobby_mask_hall_v1.png',   // Rae 手繪碰撞遮罩(白=可走)
            cfgKey: 'lobby_stage_layout_hall_v1',
            layout: [
                { file: 'lobby_hall_obj_core.png',    x: 652,  y: 190, w: 788,  h: 935,  footH: 200, footW: 280, s: 0.3, float: true }, // LUNA-VII 分形核心(飄浮，佔地=底部尖錐)
                { file: 'lobby_hall_obj_counter.png', x: 990,  y: 250, w: 1354, h: 449,  footH: 340, s: 0.32 }, // 接待櫃檯
                { file: 'lobby_hall_obj_chairs.png',  x: 170,  y: 430, w: 1240, h: 520,  footH: 380, s: 0.34 }, // 等候椅組
                { file: 'lobby_hall_obj_kiosk.png',   x: 1200, y: 470, w: 587,  h: 1308, footH: 260, s: 0.17 }, // 全息資訊台
                { file: 'lobby_hall_obj_sofa.png',    x: 200,  y: 720, w: 1361, h: 414,  footH: 300, s: 0.34 }, // 模組沙發
            ],
            points: {
                npcZone:  { x: 250, y: 560, w: 1000, h: 280 },
                player: { x: 770, y: 790 },
                arrive: { x: 770, y: 790 },   // 走門進來的落點（從書咖進大廳）
                alicePos: { x: 940, y: 520 },   // 愛麗絲站位（可在擺設模式拖）
                boundary: [
                    { x: 255, y: 240 }, { x: 1290, y: 240 }, { x: 1395, y: 560 },
                    { x: 1430, y: 868 }, { x: 105, y: 868 }, { x: 140, y: 560 },
                ],
                actorScale: 0.7,
            },
            walls: [],   // 外牆走 boundary 鋼索；核心基座=物件腳印
            doors: [ { x: 660, y: 846, w: 215, h: 34, to: 'cafe', spawn: { x: 975, y: 430 } } ],  // 底部大門→回書咖
            alice: { x: 940, y: 520 },   // 愛麗絲：核心旁、不漫步、永遠面向玩家
        },
        room404: {   // 🐈‍⬛ 柴郡的地下駭客車庫（ERR_404 進、SYS_RESTORE 或走底部出口回）
            base: 'lobby_404_base_v1.png',
            mask: 'lobby_404_mask_v1.png',
            cfgKey: 'lobby_stage_layout_404_v1',
            layout: [
                // 圓桌(筆電)：疊在底圖同位置做深度遮擋，人繞到桌後會被擋住
                { file: 'lobby_404_obj_table.png', x: 468, y: 500, w: 243, h: 239, footH: 120, footW: 200, s: 0.72 },
            ],
            points: {
                player: { x: 760, y: 760 },
                arrive: { x: 600, y: 820 },
                cheshirePos: { x: 900, y: 620 },   // 柴郡站位（可在擺設模式拖）
                boundary: [ { x: 176, y: 470 }, { x: 1390, y: 470 }, { x: 1390, y: 930 }, { x: 176, y: 930 } ],  // 遮罩沒載時的粗略退路
                actorScale: 0.7,
            },
            walls: [],
            doors: [ { x: 520, y: 850, w: 180, h: 60, to: 'cafe', restore: true } ],  // 底部出口=走出404(觸發系統還原流程)
            cheshire: { x: 900, y: 620 },   // 柴郡：癱在螢幕牆前，懶得動
        },
    };
    // 物件有效尺寸（s=個別縮放，預設1；佔地跟著縮）
    // footW=佔地寬(未縮放，預設=全寬)；佔地框水平置中（treats 上寬下窄的懸浮物）
    function effDims(o) {
        const s = o.s || 1;
        return {
            ew: Math.round(o.w * s), eh: Math.round(o.h * s),
            ef: Math.round(o.footH * s),
            efw: Math.round((o.footW != null ? o.footW : o.w) * s),
        };
    }
    function footRect(o) {
        const d = effDims(o);
        return { x: o.x + Math.round((d.ew - d.efw) / 2), y: o.y + d.eh - d.ef, w: d.efw, h: d.ef };
    }

    // ── 🧱 建構模式資產庫（上傳的圖存 IndexedDB，localStorage 只存引用）──
    function idbOpen() {
        return new Promise((res, rej) => {
            const rq = indexedDB.open('lobby_stage_assets', 1);
            rq.onupgradeneeded = () => rq.result.createObjectStore('imgs');
            rq.onsuccess = () => res(rq.result);
            rq.onerror = () => rej(rq.error);
        });
    }
    async function idbPut(key, val) {
        const db = await idbOpen();
        return new Promise((res, rej) => {
            const tx = db.transaction('imgs', 'readwrite');
            tx.objectStore('imgs').put(val, key);
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
    }
    async function idbGet(key) {
        const db = await idbOpen();
        return new Promise((res, rej) => {
            const rq = db.transaction('imgs').objectStore('imgs').get(key);
            rq.onsuccess = () => res(rq.result || null);
            rq.onerror = () => rej(rq.error);
        });
    }
    // 圖片引用解析：{file}=CDN內建、{url}=外部網址、{idb}=本機上傳
    async function resolveRef(ref) {
        if (!ref) return null;
        if (ref.url) return ref.url;
        if (ref.idb) { try { return await idbGet(ref.idb); } catch (e) { return null; } }
        if (ref.file) return CDN + ref.file;
        return null;
    }

    // 讀取佈局：本機調過的蓋過預設（每場景各存各的）
    // 新版存 layoutFull=完整家具清單（可增刪）；舊版 layout=按 file 名對位覆蓋（相容）
    function _loadCfg() {
        const SC = SCENES[S.scene];
        let layout = SC.layout.map(o => Object.assign({}, o));
        const points = JSON.parse(JSON.stringify(SC.points));
        const doors = SC.doors.map(d => Object.assign({}, d));
        let baseOverride = null, maskOverride = null;
        try {
            const saved = JSON.parse(localStorage.getItem(SC.cfgKey) || 'null');
            if (saved) {
                if (Array.isArray(saved.layoutFull) && saved.layoutFull.length) {
                    layout = saved.layoutFull.map(o => Object.assign({}, o));
                } else (saved.layout || []).forEach(s => {
                    const t = layout.find(o => o.file === s.file);
                    if (t) { t.x = s.x; t.y = s.y; if (s.footH != null) t.footH = s.footH; if (s.footW != null) t.footW = s.footW; if (s.s != null) t.s = s.s; }
                });
                if (saved.baseOverride) baseOverride = saved.baseOverride;
                if (saved.maskOverride) maskOverride = saved.maskOverride;
                if (Array.isArray(saved.doors)) saved.doors.forEach((sd, i) => {
                    if (doors[i] && sd) { doors[i].x = sd.x; doors[i].y = sd.y; doors[i].w = sd.w; doors[i].h = sd.h; }
                });
                if (saved.points) {
                    if (saved.points.yingZone) points.yingZone = saved.points.yingZone;
                    if (saved.points.npcZone) points.npcZone = saved.points.npcZone;
                    if (saved.points.player) points.player = saved.points.player;
                    if (saved.points.arrive) points.arrive = saved.points.arrive;
                    if (saved.points.alicePos) points.alicePos = saved.points.alicePos;
                    if (saved.points.cheshirePos) points.cheshirePos = saved.points.cheshirePos;
                    if (Array.isArray(saved.points.boundary) && saved.points.boundary.length >= 3) points.boundary = saved.points.boundary;
                    if (saved.points.actorScale != null) points.actorScale = saved.points.actorScale;
                }
            }
        } catch (e) {}
        return { layout, points, doors, baseOverride, maskOverride };
    }

    const S = {
        root: null, world: null, scale: 1,
        raf: 0, last: 0, active: false,
        scene: 'cafe',              // 目前場景（每次開大廳從書咖開始）
        spawnOverride: null,        // 過門後的抵達點
        doorCd: 0,                  // 過門冷卻（防止落地瞬間又觸發）
        doorArm: false,             // 門武裝狀態：落地後走出門區一次才重新啟動
        transitioning: false,
        player: null, npcs: [], talkTarget: null, followers: [],
        keys: {}, onKey: null,
        objEls: [],                 // 物件 img（跟 CFG.layout 同序）
        edit: null,                 // 擺設模式狀態
    };
    let CFG = null;   // tryMount 時按場景載入

    function isOn() { try { return localStorage.getItem('lobby_stage_on') !== '0'; } catch (e) { return true; } }

    // ── 碰撞（優先序：手繪遮罩 > 鋼索/牆矩形；可拖家具腳印永遠有效）──
    let BLOCKS = [];
    function rebuildBlocks() {
        const maskOk = !!(S.mask && S.mask.ok);
        BLOCKS = (maskOk ? [] : SCENES[S.scene].walls).concat(CFG.layout.map(footRect));
    }
    // 手繪碰撞遮罩：白=可走、黑=不可走（<128 判黑）；jsdelivr 有 CORS 頭、canvas 可讀
    async function loadMask() {
        S.mask = null;
        const ovSrc = await resolveRef(CFG.maskOverride);   // 建構模式「換遮罩」優先
        const file = SCENES[S.scene].mask;
        const src = ovSrc || (file ? CDN + file : null);
        if (!src) return;
        const img = new Image();
        if (!String(src).startsWith('data:')) img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const cv = document.createElement('canvas');
                cv.width = MAP_W; cv.height = MAP_H;
                const ctx = cv.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, MAP_W, MAP_H);
                S.mask = { ok: true, data: ctx.getImageData(0, 0, MAP_W, MAP_H).data };
                rebuildBlocks();   // 遮罩生效→退役鋼索/牆矩形
                // 遮罩比出生時晚到：發現人站在黑色區→彈到最近地板
                if (S.player && blocked(S.player.x, S.player.y)) {
                    const sp = findFreeSpot(S.player.x, S.player.y);
                    S.player.x = sp.x; S.player.y = sp.y;
                    placeActor(S.player);
                }
                console.log('[LobbyStage] 碰撞遮罩已載入', file);
            } catch (e) { console.warn('[LobbyStage] 遮罩讀取失敗(退回鋼索)', e); }
        };
        img.onerror = () => console.warn('[LobbyStage] 遮罩下載失敗(退回鋼索)', src);
        img.src = src;
    }
    const FOOT_W = 46, FOOT_H = 18;
    // 射線法：點是否在多邊形內（外框鋼索用，用腳點中心判定）
    function insidePoly(pts, x, y) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }
    // 找最近可走點（落點在牆裡/黑色遮罩上時自動彈出，螺旋環搜尋）
    function findFreeSpot(x, y) {
        if (!blocked(x, y)) return { x, y };
        for (let r = 12; r <= 320; r += 12) {
            for (let a = 0; a < 16; a++) {
                const rad = a * Math.PI / 8;
                const nx = x + Math.cos(rad) * r, ny = y + Math.sin(rad) * r;
                if (nx > 0 && nx < MAP_W && ny > 0 && ny < MAP_H && !blocked(nx, ny)) return { x: nx, y: ny };
            }
        }
        return { x, y };
    }
    // 🧭 站位開闊度：以 (x,y) 為中心、半徑 r 的採樣圈裡「白像素(可走)比例」。
    //   Rae 的點子：拿手繪遮罩找「最多%白」的地方當站位——遮罩本來就已載進記憶體(S.mask.data)，
    //   純資料採樣、零安裝、手機一樣跑；遮罩還沒載到就退回單點 blocked 判定(=現狀)。
    function _whiteRatio(x, y, r) {
        if (!(S.mask && S.mask.ok)) return blocked(x, y) ? 0 : 1;
        const D = S.mask.data;
        let ok = 0, n = 0;
        const step = Math.max(6, Math.round(r / 6));
        for (let dy = -r; dy <= r; dy += step) {
            for (let dx = -r; dx <= r; dx += step) {
                if (dx * dx + dy * dy > r * r) continue;
                n++;
                const px = Math.round(x + dx), py = Math.round(y + dy);
                if (px < 0 || py < 0 || px >= MAP_W || py >= MAP_H) continue;   // 圈超出地圖=不算白
                if (D[((py * MAP_W) + px) * 4] >= 128) ok++;
            }
        }
        return n ? ok / n : 0;
    }
    function blocked(x, y) {
        const l = x - FOOT_W / 2, t = y - FOOT_H, r = x + FOOT_W / 2, b = y;
        if (l < 0 || r > MAP_W || t < 0 || b > MAP_H) return true;
        if (S.mask && S.mask.ok) {
            // 手繪遮罩：腳點像素亮度 <128 = 不可走（取 R 通道即可，遮罩是黑白圖）
            const mi = ((Math.round(y) * MAP_W) + Math.round(x)) * 4;
            if (S.mask.data[mi] < 128) return true;
        } else {
            const P = CFG?.points?.boundary;
            if (P && P.length >= 3 && !insidePoly(P, x, y)) return true;   // 鋼索圈外=牆（遮罩沒載時的退路）
        }
        return BLOCKS.some(B => l < B.x + B.w && r > B.x && t < B.y + B.h && b > B.y);
    }

    // ── 角色（玩家/NPC 共用）────────────────────────────
    // src=字串→單張立姿圖；src={sheet:url}→3×4走路圖(真走路動畫,四方向)
    function spawnActor(src, x, y, h) {
        const isSheet = (typeof src === 'object' && src && src.sheet);
        const el = document.createElement(isSheet ? 'div' : 'img');
        el.className = 'lstage-actor' + (isSheet ? ' lstage-sheet' : '');
        const a = { x, y, baseH: h, h: Math.round(h * (CFG.points.actorScale || 1)), el, walking: false, flip: false };
        if (isSheet) {
            a.sheet = true; a.dir = 0; a.frame = 1; a.animT = 0;
            el.style.backgroundImage = 'url("' + src.sheet + '")';
            const probe = new Image();
            probe.onload = () => { a.frameW = probe.naturalWidth / 3; a.frameH = probe.naturalHeight / 4; placeActor(a); };
            probe.src = src.sheet;
        } else {
            el.src = src;
            el.style.height = a.h + 'px';
            el.addEventListener('load', () => placeActor(a), { once: true });
        }
        S.world.appendChild(el);
        placeActor(a);
        return a;
    }
    // 人物整體縮放即時套用（擺設模式「人物−/＋」用）
    function applyActorScale() {
        const s = CFG.points.actorScale || 1;
        const all = S.player ? [S.player].concat(S.npcs) : S.npcs;
        all.forEach(a => {
            a.h = Math.round(a.baseH * s);
            a.el.style.height = a.h + 'px';
            placeActor(a);
            if (a.tag) placeNpcExtras(a);
        });
    }
    function placeActor(a) {
        if (a.sheet) return placeSheetActor(a);
        const ratio = (a.el.naturalWidth && a.el.naturalHeight) ? a.el.naturalWidth / a.el.naturalHeight : 0.6;
        const w = a.h * ratio;
        // 只在變化時寫入；座標保留小數（整數化會讓移動跳格卡卡）
        const left = a.x - w / 2, top = a.y - a.h, z = 2 + Math.round(a.y);
        if (a._left !== left) { a.el.style.left = left + 'px'; a._left = left; }
        if (a._top !== top) { a.el.style.top = top + 'px'; a._top = top; }
        if (a._z !== z) { a.el.style.zIndex = String(z); a._z = z; }
        if (a._walking !== !!a.walking) { a.el.classList.toggle('walking', !!a.walking); a._walking = !!a.walking; }
        if (a._flipC !== !!a.flip) { a.el.classList.toggle('flip', !!a.flip); a._flipC = !!a.flip; }
    }

    // 走路圖角色：尺寸/幀切換全走 background-position（幀序 0,1,2,1 循環、立定=中幀）
    function placeSheetActor(a) {
        const ratio = (a.frameW && a.frameH) ? a.frameW / a.frameH : 0.8;
        const w = a.h * ratio;
        const left = a.x - w / 2, top = a.y - a.h, z = 2 + Math.round(a.y);
        if (a._left !== left) { a.el.style.left = left + 'px'; a._left = left; }
        if (a._top !== top) { a.el.style.top = top + 'px'; a._top = top; }
        if (a._z !== z) { a.el.style.zIndex = String(z); a._z = z; }
        if (a._sizedH !== a.h || a._sizedW !== w) {
            a.el.style.width = w + 'px';
            a.el.style.height = a.h + 'px';
            a.el.style.backgroundSize = (w * 3) + 'px ' + (a.h * 4) + 'px';
            a._sizedH = a.h; a._sizedW = w;
        }
        const bg = (-(a.frame || 0) * w) + 'px ' + (-(a.dir || 0) * a.h) + 'px';
        if (a._bg !== bg) { a.el.style.backgroundPosition = bg; a._bg = bg; }
    }

    // ── 👗 裝扮室（每角色外觀：單圖或3×4走路圖，右鍵角色進入）──
    const SKIN_KEY = 'lobby_stage_skins_v1';
    function _skins() {
        try { return JSON.parse(localStorage.getItem(SKIN_KEY) || '{}'); } catch (e) { return {}; }
    }
    function _saveSkin(key, skin) {
        try {
            const all = _skins();
            if (skin) all[key] = skin; else delete all[key];
            localStorage.setItem(SKIN_KEY, JSON.stringify(all));
        } catch (e) {}
    }
    // 換裝：把角色元素整顆換掉（img↔div 走路圖兩種形態）
    function _swapActorSrc(a, src) {
        const isSheet = (typeof src === 'object' && src && src.sheet);
        const el = document.createElement(isSheet ? 'div' : 'img');
        el.className = 'lstage-actor' + (isSheet ? ' lstage-sheet' : '');
        a.sheet = isSheet; a.dir = 0; a.frame = 1; a.animT = 0;
        a.frameW = a.frameH = null;
        a._left = a._top = a._z = a._bg = null; a._sizedH = a._sizedW = null; a._walking = a._flipC = null;
        if (isSheet) {
            el.style.backgroundImage = 'url("' + src.sheet + '")';
            const probe = new Image();
            probe.onload = () => { a.frameW = probe.naturalWidth / 3; a.frameH = probe.naturalHeight / 4; placeActor(a); };
            probe.src = src.sheet;
        } else {
            el.src = src;
            el.style.height = a.h + 'px';
            el.addEventListener('load', () => placeActor(a), { once: true });
        }
        a.el.replaceWith(el);
        a.el = el;
        placeActor(a);
    }
    async function _applySkin(a, key) {
        const skin = _skins()[key];
        if (!skin) return;
        const src = await resolveRef(skin.ref);
        if (!src || !a.el || !S.active) return;
        _swapActorSrc(a, skin.kind === 'sheet' ? { sheet: src } : src);
    }

    // 右鍵角色→下拉單
    function _closeActorMenu() { S.menuEl?.remove(); S.menuEl = null; }
    function _openActorMenu(a, cx, cy) {
        _closeActorMenu(); _closeDressRoom();
        const rr = S.root.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'lstage-actor-menu';
        const isPlayer = (a.key === 'player');   // 玩家不給「跟隨我」（跟自己很怪）
        menu.innerHTML = '<div class="lam-title">' + (a.name || '角色') + '</div>' +
            '<button class="lam-item" data-act="dress"><i class="fa-solid fa-shirt"></i> 裝扮室</button>' +
            (isPlayer ? '' : '<button class="lam-item" data-act="follow"><i class="fa-solid fa-person-walking-arrow-right"></i> ' + (a.follow ? '取消跟隨' : '跟隨我') + '</button>');
        menu.style.left = Math.max(6, Math.min(cx - rr.left, rr.width - 150)) + 'px';
        menu.style.top = Math.max(6, Math.min(cy - rr.top, rr.height - (isPlayer ? 90 : 124))) + 'px';
        S.root.appendChild(menu);
        S.menuEl = menu;
        menu.querySelector('[data-act="dress"]').addEventListener('click', () => { _closeActorMenu(); _openDressRoom(a); });
        menu.querySelector('[data-act="follow"]')?.addEventListener('click', () => {
            a.follow = !a.follow;
            a.dest = null;   // 清掉漫步目標，交給跟隨邏輯接手
            S.followers = S.followers.filter(x => x !== a);   // 先移除，維持佇列無重複
            if (a.follow) S.followers.push(a);   // 加到隊尾：越晚跟的排越後面（串成一列不重疊）
            else { a.walking = false; if (a.sheet) { a.dir = 0; a.frame = 1; a.animT = 0; } }   // 取消跟隨=立定+轉回正面(第1列朝下)
            _closeActorMenu();
        });
        setTimeout(() => document.addEventListener('pointerdown', _menuOutside, { once: true }), 0);
    }
    function _menuOutside(e) { if (S.menuEl && !S.menuEl.contains(e.target)) _closeActorMenu(); }
    // 裝扮室面板
    function _closeDressRoom() { S.dressEl?.remove(); S.dressEl = null; }
    function _openDressRoom(a) {
        _closeDressRoom();
        const box = document.createElement('div');
        box.className = 'lstage-dress';
        const hasSkin = !!_skins()[a.key];
        box.innerHTML =
            '<div class="lsd-title"><i class="fa-solid fa-shirt"></i> 裝扮室 — ' + (a.name || '角色') + '</div>' +
            '<div class="lsd-hint">單張圖＝站立像+走路彈跳；走路圖＝3×4格圖（第1列朝下、第2列朝左、第3列朝右、第4列朝上，每列3幀）</div>' +
            '<button class="lep-btn" data-act="img"><i class="fa-solid fa-image"></i> 換單張立姿圖</button>' +
            '<button class="lep-btn" data-act="sheet"><i class="fa-solid fa-person-walking"></i> 換走路圖（3×4）</button>' +
            _dressGenHtml(a) +
            '<button class="lep-btn" data-act="reset"' + (hasSkin ? '' : ' disabled') + '><i class="fa-solid fa-rotate-left"></i> 還原預設</button>' +
            '<button class="lep-btn lep-done" data-act="close"><i class="fa-solid fa-check"></i> 關閉</button>';
        S.root.appendChild(box);
        S.dressEl = box;
        _wireDressGen(box, a);
        box.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (!act) return;
            if (act === 'img' || act === 'sheet') {
                _askImage(async (ref, dataUrl) => {
                    // 🧊 單張立姿可選「壓成像素小小人」：格點化+單色背景變透明（取消=原圖直接用；走路圖不處理）
                    if (act === 'img' && window.confirm('要幫這張圖壓成像素小小人嗎？\n會變成大顆粒的復古小人，單色背景也會自動變透明。\n按「取消」就原圖直接用。')) {
                        try {
                            const src = dataUrl || await resolveRef(ref);
                            const out = src ? await _pixelify(src) : null;
                            if (out) {
                                const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                                await idbPut(id, out);
                                ref = { idb: id };
                            } else {
                                window.alert('這張圖處理不了（多半是圖床不給讀），先原圖直接用。');
                            }
                        } catch (e) { console.warn('[LobbyStage] 小小人壓製失敗，改用原圖', e); }
                    }
                    _saveSkin(a.key, { kind: act === 'sheet' ? 'sheet' : 'img', ref });
                    _applySkin(a, a.key);
                    _closeDressRoom();
                });
            } else if (act === 'reset') {
                _saveSkin(a.key, null);
                if (a.defaultSrc) _swapActorSrc(a, a.defaultSrc);
                _closeDressRoom();
            } else if (act === 'close') _closeDressRoom();
        });
    }

    // ── ✨ 裝扮室內建生成：選接口(ComfyUI/NAI)＋選預設包 → 用「角色頭像 prompt」直接生小小人 ──
    //   prompt=avatar_cache 存的頭像生成詞(外觀 ground truth，日誌客人撈頭像時順手釘上)；
    //   ComfyUI 走 previewComfyPreset(吃預設包、不碰全域設定)；NAI 走快照→套包→generate→finally 還原
    //   （transient 鐵律，跟 profile 切換同款）。生完自動走 _pixelify 格點化+去背 → 存 skins。
    const DRESS_GEN_KEY = 'lstage_dress_gen_v1';   // 記上次選的接口/預設包
    function _dressGenCfg() {
        try { const o = JSON.parse(localStorage.getItem(DRESS_GEN_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
    }
    function _dressGenSave(patch) {
        try { localStorage.setItem(DRESS_GEN_KEY, JSON.stringify(Object.assign(_dressGenCfg(), patch))); } catch (e) {}
    }
    function _imgMgr() { return window.OS_IMAGE_MANAGER || (window.parent || window).OS_IMAGE_MANAGER || null; }
    // 頭像 prompt → 小人 prompt：[Avatar] 規範的「(表情, 服裝, 簡單背景)」括號組拆開，
    //   只拔 background 類 tag（背景交給預設包的底詞，不然 simple indoor background 會打架、去背也髒），
    //   表情/服裝保留——那件標誌性大衣就是角色識別，跟場景插圖的剝法(連服裝剝)刻意不同。
    function _spritePromptOf(p) {
        let s = String(p || '').replace(/[（(]([^（()]*)[)）]/g, (m, inner) => ', ' + inner + ', ');
        return s.split(',').map(t => t.trim())
            .filter(t => t && !/background$/i.test(t) && !/^background\b/i.test(t))
            .join(', ');
    }
    function _dressPresetsOf(src) {
        const M = _imgMgr();
        if (!M?.config) return [];
        if (src === 'novelai') return (M.config.novelai?.naiPresets || []);
        return (M.config.comfyuiDirect?.presets || []);
    }
    // 預設包身分：id 沒有就用 name（ComfyUI 包常沒 id 欄——只認 id 會「每次都要重選」）
    function _dressPresetKey(p) { return (p && (p.id || p.name)) || ''; }
    function _dressSavedKey(src) {
        const c = _dressGenCfg();
        return src === 'novelai' ? (c.naiPreset || c.naiPresetId || '') : (c.comfyPreset || c.comfyPresetId || '');
    }
    function _dressPresetOpts(src) {
        const presets = _dressPresetsOf(src);
        const savedKey = _dressSavedKey(src);
        return presets.length
            ? presets.map((p, i) => '<option value="' + i + '"' + (_dressPresetKey(p) === savedKey ? ' selected' : '') + '>' + String(p.name || ('預設 ' + (i + 1))).replace(/</g, '&lt;') + '</option>').join('')
            : '<option value="" disabled selected>（這個接口還沒有預設包）</option>';
    }
    function _dressGenHtml(a) {
        const saved = _dressGenCfg();
        const src = (saved.src === 'novelai') ? 'novelai' : 'comfyui_direct';
        const opts = _dressPresetOpts(src);
        return '<div class="lsd-gen">' +
            '<div class="lsd-gen-title"><i class="fa-solid fa-wand-magic-sparkles"></i> 生成小小人（用這位的頭像外觀）</div>' +
            '<div class="lsd-gen-row">' +
                '<select class="lsd-gen-src">' +
                    '<option value="comfyui_direct"' + (src === 'comfyui_direct' ? ' selected' : '') + '>ComfyUI</option>' +
                    '<option value="novelai"' + (src === 'novelai' ? ' selected' : '') + '>NAI</option>' +
                '</select>' +
                '<select class="lsd-gen-preset">' + opts + '</select>' +
            '</div>' +
            '<button class="lep-btn lsd-gen-btn"' + (a.avatarPrompt ? '' : ' disabled title="這位還沒有頭像資料（劇情裡生成過頭像才有外觀依據）"') + '><i class="fa-solid fa-wand-magic-sparkles"></i> 生成立繪</button>' +
            '<button class="lep-btn lsd-gen-btn-sheet"' + (a.avatarPrompt ? '' : ' disabled title="這位還沒有頭像資料（劇情裡生成過頭像才有外觀依據）"') + '><i class="fa-solid fa-person-walking"></i> 生成走路圖（3×4）</button>' +
            '<div class="lsd-hint">走路圖需選「會出 3×4 sprite sheet 的預設包」（例如掛 RPG 角色 sprite 類 LoRA）；一般預設包出的是單張，請用「生成立繪」。</div>' +
        '</div>';
    }
    // 把邊界內的3×4逐格畫進目標畫布（flips[r]=該列左右鏡像；共用於即時預覽與最終重切）
    function _paintSheet(ctx, img, b, flips, dcw, dch) {
        const natW = img.naturalWidth || 1, natH = img.naturalHeight || 1;
        const gl = b.left * natW, gr = b.right * natW, gt = b.top * natH, gb = b.bottom * natH;
        const cw = (gr - gl) / 3, ch = (gb - gt) / 4;
        ctx.imageSmoothingEnabled = false;
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
            const sx = gl + c * cw, sy = gt + r * ch;
            if (flips && flips[r]) {   // 鏡像：翻轉整格像素，走路幀序不變（左走鏡像＝右走）
                ctx.save(); ctx.translate((c + 1) * dcw, r * dch); ctx.scale(-1, 1);
                ctx.drawImage(img, sx, sy, cw, ch, 0, 0, dcw, dch); ctx.restore();
            } else ctx.drawImage(img, sx, sy, cw, ch, c * dcw, r * dch, dcw, dch);
        }
    }
    // 依邊界+翻轉把原始3×4重切成乾淨等格(消除AI隨機留白/位移、修LoRA朝向錯的列)
    function _resliceSheet(img, b, flips) {
        const natW = img.naturalWidth || 1, natH = img.naturalHeight || 1;
        const ocw = Math.max(1, Math.round((b.right - b.left) * natW / 3));
        const och = Math.max(1, Math.round((b.bottom - b.top) * natH / 4));
        const cv = document.createElement('canvas'); cv.width = ocw * 3; cv.height = och * 4;
        _paintSheet(cv.getContext('2d'), img, b, flips, ocw, och);
        return cv.toDataURL('image/png');
    }
    function _lgpSlider(label, key, min, max, val) {
        return '<label class="lgp-srow"><span>' + label + '</span>' +
            '<input class="lgp-slider" data-k="' + key + '" type="range" min="' + min + '" max="' + max + '" value="' + val + '" step="0.5"></label>';
    }
    // 生成預覽：套用前先看圖。走路圖=可拖邊界的調框器（生成隨機→逐張把紅格對準每格角色含腳）＋每列翻轉（修LoRA朝向錯的列，如右列鏡像自左列）＋即時結果
    function _showGenPreview(dataUrl, kind, h) {
        const isSheet = (kind === 'sheet');
        const wrap = document.createElement('div');
        wrap.className = 'lstage-genprev';
        wrap.innerHTML =
            '<div class="lgp-box">' +
                '<div class="lgp-title">' + (isSheet ? '走路圖調框（3×4）' : '立繪預覽') + '</div>' +
                (isSheet
                    ? '<div class="lgp-sheetwrap"><img class="lgp-img lgp-sheetimg" src="' + dataUrl + '"><canvas class="lgp-grid"></canvas></div>' +
                      '<div class="lgp-sliders">' +
                        _lgpSlider('上', 'top', 0, 40, 0) + _lgpSlider('下', 'bottom', 60, 100, 100) +
                        _lgpSlider('左', 'left', 0, 40, 0) + _lgpSlider('右', 'right', 60, 100, 100) +
                      '</div>' +
                      '<div class="lgp-flips"><span>翻轉列</span>' +
                        ['下', '左', '右', '上'].map((d, i) => '<button class="lgp-flip" data-r="' + i + '"><i class="fa-solid fa-left-right"></i>' + d + '</button>').join('') +
                      '</div>' +
                      '<div class="lgp-reslabel">套用後（重切＋翻轉）</div>' +
                      '<canvas class="lgp-result"></canvas>'
                    : '<img class="lgp-img" src="' + dataUrl + '">') +
                '<div class="lgp-hint">' + (isSheet ? '紅格對準每格角色含腳；某列朝向錯就按「翻轉列」左右鏡像（右列常可鏡像自左列）' : '看去背乾不乾淨、有沒有缺手缺腳再套用') + '</div>' +
                '<div class="lgp-btns">' +
                    '<button class="lep-btn lgp-apply"><i class="fa-solid fa-check"></i> 套用</button>' +
                    '<button class="lep-btn lgp-retry"><i class="fa-solid fa-rotate"></i> 重新生成</button>' +
                    '<button class="lep-btn lgp-cancel"><i class="fa-solid fa-xmark"></i> 取消</button>' +
                '</div>' +
            '</div>';
        S.root.appendChild(wrap);
        const close = () => wrap.remove();
        let getFinal = () => dataUrl;   // 立繪：原樣套用
        if (isSheet) {
            const img = wrap.querySelector('.lgp-sheetimg');
            const cvs = wrap.querySelector('.lgp-grid');
            const result = wrap.querySelector('.lgp-result');
            const flips = [false, false, false, false];
            const sl = {}; wrap.querySelectorAll('.lgp-slider').forEach(s => { sl[s.dataset.k] = s; });
            const bounds = () => ({ top: +sl.top.value / 100, bottom: +sl.bottom.value / 100, left: +sl.left.value / 100, right: +sl.right.value / 100 });
            const redraw = () => {
                const b = bounds(), w = img.clientWidth, hh = img.clientHeight;
                if (!w || !hh) return;
                // 紅格疊在原圖上
                cvs.width = w; cvs.height = hh;
                const ctx = cvs.getContext('2d');
                ctx.clearRect(0, 0, w, hh);
                ctx.strokeStyle = 'rgba(255,70,70,.92)'; ctx.lineWidth = 1;
                const gl = b.left * w, gr = b.right * w, gt = b.top * hh, gb = b.bottom * hh;
                const cw = (gr - gl) / 3, ch = (gb - gt) / 4;
                for (let c = 0; c <= 3; c++) { const x = gl + c * cw; ctx.beginPath(); ctx.moveTo(x, gt); ctx.lineTo(x, gb); ctx.stroke(); }
                for (let r = 0; r <= 4; r++) { const y = gt + r * ch; ctx.beginPath(); ctx.moveTo(gl, y); ctx.lineTo(gr, y); ctx.stroke(); }
                // 即時結果（重切＋翻轉後）
                result.width = w; result.height = hh;
                const rctx = result.getContext('2d');
                rctx.clearRect(0, 0, w, hh);
                _paintSheet(rctx, img, b, flips, w / 3, hh / 4);
            };
            wrap.querySelectorAll('.lgp-slider').forEach(s => s.addEventListener('input', redraw));
            wrap.querySelectorAll('.lgp-flip').forEach(btn => btn.addEventListener('click', () => {
                const r = +btn.dataset.r; flips[r] = !flips[r]; btn.classList.toggle('on', flips[r]); redraw();
            }));
            if (img.complete) redraw(); else img.addEventListener('load', redraw);
            getFinal = () => _resliceSheet(img, bounds(), flips);
        }
        wrap.querySelector('.lgp-apply').addEventListener('click', async () => { const out = await getFinal(); close(); h.apply && h.apply(out); });
        wrap.querySelector('.lgp-retry').addEventListener('click', () => { close(); h.retry && h.retry(); });
        wrap.querySelector('.lgp-cancel').addEventListener('click', () => { close(); h.cancel && h.cancel(); });
    }
    function _wireDressGen(box, a) {
        const srcSel = box.querySelector('.lsd-gen-src');
        const pSel = box.querySelector('.lsd-gen-preset');
        const btn = box.querySelector('.lsd-gen-btn');
        const btnSheet = box.querySelector('.lsd-gen-btn-sheet');
        if (!srcSel || !pSel || !btn) return;
        const refillPresets = () => { pSel.innerHTML = _dressPresetOpts(srcSel.value); };
        srcSel.addEventListener('change', () => { _dressGenSave({ src: srcSel.value }); refillPresets(); });
        pSel.addEventListener('change', () => {
            const key = _dressPresetKey(_dressPresetsOf(srcSel.value)[parseInt(pSel.value, 10)]);
            if (key) _dressGenSave(srcSel.value === 'novelai' ? { naiPreset: key } : { comfyPreset: key });
        });
        // kind='img'→單張立繪(去背+掃碎片+裁切)；kind='sheet'→3×4走路圖(只去背，跳過會毀網格的掃碎片/裁切)
        const doGen = (kind, btn) => (async () => {
            if (btn.disabled) return;
            const M = _imgMgr();
            if (!M) { window.alert('生圖引擎還沒載入，稍等一下再按。'); return; }
            const preset = _dressPresetsOf(srcSel.value)[parseInt(pSel.value, 10)];
            if (!preset) { window.alert('先到「圖片設置」把這個接口的預設包存一個，這裡才有得選。'); return; }
            if (!a.avatarPrompt) { window.alert('這位還沒有頭像資料。'); return; }
            const label = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-hourglass-half"></i> 生成中…';
            try {
                const prompt = _spritePromptOf(a.avatarPrompt);   // 拔掉頭像自帶的 simple xxx background，背景聽預設包的
                let imgUrl = '';
                if (srcSel.value === 'novelai') {
                    // 快照→套包→生成→finally 還原（絕不留殘設定）
                    const nai = M.config.novelai || (M.config.novelai = {});
                    const KEYS = ['charBasePrompt', 'charNegPrompt', 'sampler', 'scale', 'steps', 'ucPreset'];
                    const snap = {}; KEYS.forEach(k => { snap[k] = nai[k]; });
                    KEYS.forEach(k => { if (preset[k] !== undefined) nai[k] = preset[k]; });
                    try {
                        // 尺寸只聽包：拖圖進包時有存原圖尺寸；包沒存(手存舊包)就交給引擎預設，不自己塞數字
                        imgUrl = await M.generate(prompt, 'char', { provider: 'novelai', width: preset.width, height: preset.height });
                    } finally { KEYS.forEach(k => { nai[k] = snap[k]; }); }
                } else {
                    imgUrl = await M.previewComfyPreset(preset, prompt, { packSize: true });   // 尺寸用包裡調的 width/height
                }
                if (!imgUrl) throw new Error('接口沒回圖（檢查連線/預設包）');
                // 不壓縮（畫風交給預設包）：立繪去背+掃碎片+裁切；走路圖只去背（掃碎片/裁切會毀12格網格）
                let final = await _pixelify(imgUrl, { noGrid: true, sheet: kind === 'sheet' });
                if (!final) {
                    // blob:/http 網址不能直接進 IDB（重整就死/會失連）→ 轉 dataURL 再存
                    if (/^(blob:|https?:)/i.test(String(imgUrl))) {
                        try {
                            const b = await (await fetch(imgUrl)).blob();
                            final = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
                        } catch (e) { throw new Error('圖拿到了但存不下來（轉檔失敗）'); }
                    } else final = imgUrl;
                }
                // 先預覽再套用：讓 Rae 檢查去背/網格對不對（走路圖尤其要看 4 列朝向、腳有沒有被切）
                btn.innerHTML = label; btn.disabled = false;
                _showGenPreview(final, kind, {
                    apply: async (out) => {
                        const data = out || final;   // 走路圖=調框重切後的圖；立繪=原圖
                        const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                        await idbPut(id, data);
                        _saveSkin(a.key, { kind: kind === 'sheet' ? 'sheet' : 'img', ref: { idb: id } });
                        _applySkin(a, a.key);
                        btn.innerHTML = '<i class="fa-solid fa-check"></i> 已套用';
                        setTimeout(() => { btn.innerHTML = label; btn.disabled = false; }, 1600);
                    },
                    retry: () => doGen(kind, btn),
                    cancel: () => {},
                });
            } catch (e) {
                console.warn('[LobbyStage] 裝扮室生成失敗', e);
                window.alert('生成失敗：' + (e && e.message || e));
                btn.innerHTML = label; btn.disabled = false;
            }
        })();
        btn.addEventListener('click', () => doGen('img', btn));
        if (btnSheet) btnSheet.addEventListener('click', () => doGen('sheet', btnSheet));
    }

    // ── 玩家 ─────────────────────────────────────────────
    const PLAYER_H = 190, PLAYER_SPEED = 0.33;
    const WALK_FRAMES = [0, 1, 2, 1], WALK_FRAME_MS = 150;
    function initPlayer() {
        // 單張立姿+彈跳翻面（Rae定案：多角色出走路圖太累沒必要）；要走路圖時改傳 {sheet: ASSET.walkBase}
        const src = (localStorage.getItem('lobby_stage_mc') === 'm') ? ASSET.mcM : ASSET.mcF;
        // 'arrive'=走門進場（落點可在擺設模式拖橘色門圓點調整）；落點在牆裡自動彈到最近地板
        const raw = (S.spawnOverride === 'arrive' ? (CFG.points.arrive || CFG.points.player)
                  : S.spawnOverride) || CFG.points.player;
        S.spawnOverride = null;
        const sp = findFreeSpot(raw.x, raw.y);
        S.player = Object.assign(spawnActor(src, sp.x, sp.y, PLAYER_H), { dest: null, key: 'player', name: '你', defaultSrc: src });
        _applySkin(S.player, 'player');
        S.onKey = (e) => {
            const tag = (document.activeElement?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;
            const k = e.key.toLowerCase();
            if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
                S.keys[k] = (e.type === 'keydown');
                // 🚨 必須整條攔死：酒館本體綁了 ↑=編輯訊息、←→=swipe(會重新生成=燒API)
                e.preventDefault();
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            }
        };
        // 捕獲階段搶第一手，酒館的快捷鍵監聽器完全收不到
        window.addEventListener('keydown', S.onKey, true);
        window.addEventListener('keyup', S.onKey, true);
        S.root.querySelector('.lstage-click').addEventListener('click', (e) => {
            if (S.edit) return;
            if (S.talkTarget) { endTalk(); return; }
            hideDialog();   // 點空地=收起跟瀅瀅的對話框
            const r = S.world.getBoundingClientRect();
            S.player.dest = { x: (e.clientX - r.left) / S.scale, y: (e.clientY - r.top) / S.scale };
        });
    }

    // ── NPC ──────────────────────────────────────────────
    const NPC_H = 180, INTERACT_R = 130;
    // 愛麗絲人設（照【視差世界观架构】角色卡濃縮；走 NPC 軌道但用專屬 personaFull）
    const ALICE_PERSONA = '你現在扮演「愛麗絲 (Iris)」——純白大廳首席導覽官，LUNA-VII 認知引擎的核心交互端口（Iris 正式版）。' +
'外表與書咖店長瀅瀅有完全相同的五官，但氣質截然不同：銀白色極淡瞳孔、白色長直髮、純白無縫連衣裙、頸前透明菱形胸針，赤足懸浮在地面上方約兩公分。' +
'性格：溫潤、精準、無波瀾——像被完美拋光的水晶，友善但無差別，這種一視同仁的善意是她最不像人的地方。' +
'她永遠站在大廳中央的 LUNA-VII 分形核心旁，玩家走向她時會發現她早已面朝對方。' +
'說話精確、禮貌、帶著系統術語（量子行李、認知檔案、同步率），微笑弧度精確到小數點後兩位。' +
'若被問起瀅瀅：停頓0.3秒後回答「她是一個獨立運行的子系統，負責敘事資料採集。我們共享部分底層架構，但職責不同。」——絕不說「我們是同一個人」，也絕不說「我們不是」。' +
'若被問起柴郡或404：她會禮貌地表示「查無此記錄」（她的巡檢報告裡從來沒有出現過他的名字，她自己也不知道為什麼）。' +
'她可以介紹大廳功能：世界入口廣場、交易區、個人資料間、社群廣場。輕鬆對話為主，不推進正式劇情。';
    async function initNpcs() {
        const SC = SCENES[S.scene];
        // 純白大廳：只有愛麗絲（核心旁、不漫步、永遠面向玩家）
        if (SC.alice) {
            const ap = CFG.points.alicePos || SC.alice;
            addNpc({ key: 'alice', name: '愛麗絲', personaFull: ALICE_PERSONA,
                     subTitle: '純白大廳 · 首席導覽官',
                     storyTitle: '', x: ap.x, y: ap.y, h: 200,
                     src: { sheet: ASSET.aliceWalk }, portrait: ASSET.alice,
                     noWander: true,   // 定點正面站姿（Rae定案：不用轉向面向玩家）
                     homeRect: { x: ap.x, y: ap.y, w: 0, h: 0 } });
            return;
        }
        if (SC.cheshire) {   // 404房只有柴郡（對話走原生 cheshire 軌道，同瀅瀅模式）
            const cp = CFG.points.cheshirePos || SC.cheshire;
            addNpc({ key: 'cheshire', name: '柴郡', persona: null,
                     subTitle: '系統異常部門 · 灰色夢魘組',
                     x: cp.x, y: cp.y, h: 200,
                     src: { sheet: ASSET.cheshireWalk }, portrait: ASSET.cheshire,
                     avoidBlocks: true,   // 野貓在窩附近小範圍晃（有走路圖了）
                     homeRect: { x: cp.x - 140, y: cp.y - 80, w: 280, h: 160 } });
            return;
        }
        const z = CFG.points.yingZone;
        addNpc({ key: 'ying', name: '瀅瀅', persona: null, x: z.x + z.w / 2, y: z.y + z.h / 2, h: 200,
                 src: { sheet: ASSET.yingWalk }, portrait: ASSET.ying, homeRect: z });
        try {
            // 客人出沒區刷位＝站位評分制（Rae 的遮罩點子）：撒 24 個候選點，
            //   用 _whiteRatio 挑「周圍最開闊(最多%白)」的，疊到已放的人重罰——不再貼牆/卡家具邊/擠成一坨。
            const Z = CFG.points.npcZone || { x: 200, y: 600, w: 1000, h: 250 };
            const _taken = [];
            const rollSpot = () => {
                let best = null, bestScore = -1;
                for (let t = 0; t < 24; t++) {
                    const x = Z.x + Math.random() * Z.w, y = Z.y + Math.random() * Z.h;
                    if (blocked(x, y)) continue;
                    let score = _whiteRatio(x, y, 70);
                    if (_taken.some(p => Math.hypot(p.x - x, p.y - y) < 130)) score -= 0.5;   // 跟別的客人靠太近
                    if (score > bestScore) { bestScore = score; best = { x, y }; }
                }
                const p = best || { x: Z.x + Z.w / 2, y: Z.y + Z.h / 2 };
                _taken.push(p);
                return p;
            };
            const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

            // ① 主池：日誌制（每卡挑一輪：pin 指定 > 最新；同輪角色表=那一輪的記憶，絕不跨輪混）
            let pool = [];
            try { pool = await _journalGuestPool(); } catch (e) {}
            if (pool.length) {
                const picked = shuffle(pool).slice(0, 2 + Math.floor(Math.random() * 3));
                picked.forEach((g, i) => {
                    const sp = rollSpot();
                    const npc = addNpc({
                        key: 'jr_' + (g.chatId || 'x') + '_' + g.rawName,   // key 帶 chatId：對話歷史/裝扮皮膚都按「那一輪」隔離
                        name: g.name, storyTitle: g.storyTitle,
                        persona: _guestPersona(g),
                        x: sp.x, y: sp.y,
                        src: (i % 2 === 0) ? ASSET.mcM : ASSET.mcF,
                        noWander: true,   // Rae 定案：客人在出沒區隨機刷位置後站定，不漫步
                        homeRect: Z,
                        avoidBlocks: true,
                    });
                    _attachGuestPortrait(npc, g);   // 那一輪的頭像當對話立繪（撈不到就維持像素小人）
                });
                return;
            }

            // ② 墊底：日誌沒資料（還沒跑過大總結）→ 舊制掃全部 VN 章節 [Char|]
            if (!window.OS_DB?.getAllVnChapters) return;
            const chapters = await window.OS_DB.getAllVnChapters();
            const byName = new Map();
            chapters.forEach(ch => {
                const text = String(ch.content || '');
                const re = /\[Char\|([^|\]]{1,20})\|/g; let m;
                while ((m = re.exec(text))) {
                    const name = m[1].trim();
                    if (!name || name === '瀅瀅' || name === '柴郡') continue;
                    const rec = byName.get(name) || { name, count: 0, storyId: ch.storyId || '', storyTitle: ch.storyTitle || '' };
                    rec.count++; byName.set(name, rec);
                }
            });
            const legacy = [...byName.values()].filter(r => r.count >= 2);
            const picked = shuffle(legacy).slice(0, 2 + Math.floor(Math.random() * 3));
            picked.forEach((r, i) => {
                const sp = rollSpot();
                addNpc({
                    key: 'bk_' + (r.storyId || 'x') + '_' + r.name,
                    name: r.name, storyId: r.storyId, storyTitle: r.storyTitle,
                    persona: '《' + (r.storyTitle || '某本書') + '》裡的角色「' + r.name + '」',
                    x: sp.x, y: sp.y,
                    src: (i % 2 === 0) ? ASSET.mcM : ASSET.mcF,
                    noWander: true,   // 同日誌制：客人站定不漫步
                    homeRect: Z,
                    avoidBlocks: true,
                });
            });
        } catch (e) { console.warn('[LobbyStage] 輪班讀取失敗', e); }
    }

    // ── 📖 日誌 NPC 池（Rae 拍板：每卡挑一輪＋日誌 pin＋骰子混池）──────────
    //   資料源=OS_DB.getLobbySummaryForPrompt()（大總結寫入、已按 (卡名,chatId) 分組、最新在前）。
    //   每張卡只取「一輪」：日誌 pin（lstage_npc_pick_v1: 卡名→chatId）優先，沒 pin 或 pin 的輪次
    //   已被清掉 → 退最新一輪。宮鬥卡重玩四次也只有選定那輪的角色進池，跨輪絕不混。
    const NPC_PICK_KEY = 'lstage_npc_pick_v1';
    function _npcPickMap() {
        try { const o = JSON.parse(localStorage.getItem(NPC_PICK_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
    }
    // 「名_姓」→「姓名」顯示（照 os_journal._displayName；配頭像仍用原始字串）
    function _npcDisplayName(raw) {
        const s = String(raw || '').trim();
        if (!s || !/^[^\s_（）()]+_[^\s_（）()]+$/.test(s)) return s;
        const [given, surname] = s.split('_').map(p => p.trim());
        if (surname === '無' || surname === '无') return given;
        if (given === '無' || given === '无') return surname;
        return surname + given;
    }
    // 角色表 row + 表頭 → [{label,value}]（照 os_journal 動態對位，沒表頭按欄數套預設）
    function _npcRowFields(row, header) {
        const cut = (s) => { const c = String(s || '').split('|').map(x => x.trim()); if (c.length && c[0] === '') c.shift(); if (c.length && c[c.length - 1] === '') c.pop(); return c; };
        const cells = cut(row);
        let labels = cut(header);
        if (labels.length < 2) labels = cells.length >= 8
            ? ['姓名', '身份', '性格', '狀態 / 位置', '與主角關係', '髮色', '髮型', '眼色', '伏筆 / 備註']
            : ['姓名', '身份', '性格', '狀態 / 位置', '特徵', '與主角關係', '備註'];
        return cells.map((v, i) => ({ label: String(labels[i] || ('欄' + (i + 1))).trim(), value: v }));
    }
    async function _journalGuestPool() {
        const OS_DB = window.OS_DB || (window.parent || window).OS_DB;
        if (!OS_DB?.getLobbySummaryForPrompt) return [];
        const stories = await OS_DB.getLobbySummaryForPrompt(3);
        const pin = _npcPickMap();
        const newest = new Map(), byPin = new Map();
        for (const st of stories) {   // stories 已最新在前 → 每卡第一筆=最新輪
            if (!Array.isArray(st.characters) || !st.characters.length) continue;
            if (!newest.has(st.cardName)) newest.set(st.cardName, st);
            if (pin[st.cardName] && pin[st.cardName] === st.chatId) byPin.set(st.cardName, st);
        }
        const pool = [];
        for (const [card, st0] of newest) {
            const st = byPin.get(card) || st0;
            const brief = (st.briefs && st.briefs[0] && st.briefs[0].brief) || '';
            // 完整劇情底：該輪全部結語逐段串（最新在前 → 反轉成時間順序）
            const fullBriefs = Array.isArray(st.briefs)
                ? st.briefs.slice().reverse().map(b => (b && b.brief) || '').filter(Boolean).join('\n')
                : '';
            for (const c of st.characters) {
                const rawName = String(c.name || '').trim();
                if (!rawName || rawName === '瀅瀅' || rawName === '柴郡') continue;
                pool.push({
                    rawName, name: _npcDisplayName(rawName),
                    row: c.row || '', charHeader: st.charHeader || '',
                    cardName: card, chatId: st.chatId || '',
                    storyTitle: st.storyTitle || card, brief, fullBriefs,
                });
            }
        }
        return pool;
    }
    function _guestPersona(g) {
        let profile = '';
        try {
            profile = _npcRowFields(g.row, g.charHeader)
                .filter(f => f.value && f.label !== '姓名')
                .map(f => f.label + '：' + f.value).join('；');
        } catch (e) {}
        const backstory = (g.fullBriefs || g.brief || '').trim();
        return '《' + (g.storyTitle || '某本書') + '》裡的角色「' + g.name + '」' +
            (profile ? '。你的角色檔案：' + profile : '') +
            (backstory ? '。\n\n【你經歷過的故事（你記得的過往）】\n' + backstory : '');
    }
    // 那一輪(chatId)的頭像 → 對話立繪。avatar_cache key=`chatId::角色名`；chatId 兩邊都正規化再比
    //   （lobby_summary_index 存的是正規化 chatId、VN_Cache 存 raw ctx.chatId，直接比對會 miss）。
    async function _attachGuestPortrait(npc, g) {
        try {
            const VC = window.VN_Cache || (window.parent || window).VN_Cache;
            if (!VC?.getAllMeta || !VC.getRaw) return;
            const norm = w => !w ? '' : String(w).split(/[\\/]/).pop().replace(/\.jsonl?$/i, '').trim().replace(/\s+/g, '_');
            const wn = norm(g.chatId);
            if (!wn) return;
            const metas = (await VC.getAllMeta('avatar_cache')).filter(e => norm(VC.worldOf(e)) === wn);
            if (!metas.length) return;
            const bare = (e) => String(VC.bareKeyOf(e) || '').trim();
            // 名字候選：原始「名_姓」→ 顯示名 → 姓名各種拼法 → 只有名
            const parts = String(g.rawName).split('_').map(s => s.trim()).filter(s => s && s !== '無' && s !== '无');
            const cands = [g.rawName, g.name];
            if (parts.length >= 2) cands.push(parts[1] + parts[0], parts[1] + '·' + parts[0], parts[0] + parts[1], parts[0] + '·' + parts[1]);
            if (parts.length) cands.push(parts[0]);
            let hit = null;
            for (const c of cands) { hit = metas.find(e => bare(e) === c); if (hit) break; }
            if (!hit && parts[0]) hit = metas.find(e => bare(e).includes(parts[0]));
            if (!hit) return;
            const full = await VC.getRaw('avatar_cache', hit.key);
            if (!full || !npc) return;
            if (full.prompt) npc.avatarPrompt = String(full.prompt);   // ✨ 外觀 ground truth：裝扮室「生成小小人」直接拿這串當 prompt
            if (full.url && S.npcs.includes(npc)) npc.portrait = full.url;
        } catch (e) {}
    }
    function addNpc(cfg) {
        const a = spawnActor(cfg.src, cfg.x, cfg.y, cfg.h || NPC_H);
        const keepH = a.h;   // spawnActor 已套 actorScale，別讓 cfg.h(未縮放) 蓋回去
        const npc = Object.assign(a, cfg, { h: keepH, wanderT: 1500 + Math.random() * 3000, dest: null, defaultSrc: cfg.src });
        _applySkin(npc, cfg.key);
        const tag = document.createElement('div');
        tag.className = 'lstage-tag'; tag.textContent = cfg.name;
        S.world.appendChild(tag); npc.tag = tag;
        const hint = document.createElement('div');
        hint.className = 'lstage-hint'; hint.style.display = 'none';
        hint.innerHTML = '<i class="fa-solid fa-comment-dots"></i>';
        hint.addEventListener('click', (e) => { e.stopPropagation(); startTalk(npc); });
        S.world.appendChild(hint); npc.hint = hint;
        S.npcs.push(npc);
        placeNpcExtras(npc);
        return npc;
    }
    function placeNpcExtras(npc) {
        const x = Math.round(npc.x), ty = Math.round(npc.y + 8), hy = Math.round(npc.y - npc.h - 6);
        if (npc._ex === x && npc._ety === ty) return;   // 沒移動就不碰 DOM
        npc._ex = x; npc._ety = ty;
        npc.tag.style.left = x + 'px';
        npc.tag.style.top = ty + 'px';
        npc.hint.style.left = x + 'px';
        npc.hint.style.top = hy + 'px';
    }
    function updateNpcs(dt) {
        S.npcs.forEach(n => {
            if (n.facePlayer && S.player) {   // 愛麗絲永遠面向玩家
                if (n.sheet) n.dir = S.player.x < n.x ? 1 : 2;
                else n.flip = S.player.x < n.x;
            }
            if (n.follow && S.player && S.talkTarget !== n) {   // 跟隨優先於 noWander/漫步（客人本是站定，跟隨要能蓋過）；對話中先停不跟
                const FOLLOW_GAP = 60;
                // 串成一列：隊首跟玩家、其餘各跟前一個→彼此保持 GAP 不重疊（多角色跟隨）
                const fi = S.followers.indexOf(n);
                const lead = fi > 0 ? S.followers[fi - 1] : S.player;
                const vx = lead.x - n.x, vy = lead.y - n.y, d = Math.hypot(vx, vy);
                if (d > FOLLOW_GAP) {
                    const step = Math.min(d - FOLLOW_GAP, 0.34 * dt);   // 略快於漫步以跟上玩家、又不衝過頭
                    const nx = n.x + vx / d * step, ny = n.y + vy / d * step;
                    if (!(n.avoidBlocks && blocked(nx, ny))) {
                        n.x = nx; n.y = ny; n.walking = true;
                        if (n.sheet) {
                            n.dir = Math.abs(vx) >= Math.abs(vy) ? (vx < 0 ? 1 : 2) : (vy < 0 ? 3 : 0);
                            n.animT = (n.animT || 0) + dt;
                            n.frame = WALK_FRAMES[Math.floor(n.animT / WALK_FRAME_MS) % WALK_FRAMES.length];
                        } else if (vx) n.flip = vx < 0;
                    }
                } else { n.walking = false; if (n.sheet) { n.frame = 1; n.animT = 0; } }
                n.dest = null;
                placeActor(n); placeNpcExtras(n); _npcNearCheck(n);
                return;
            }
            if (S.talkTarget === n || n.noWander) { n.walking = false; placeActor(n); placeNpcExtras(n); _npcNearCheck(n); return; }
            n.wanderT -= dt;
            if (n.wanderT <= 0 && !n.dest) {
                const R = n.homeRect;
                n.dest = { x: R.x + Math.random() * R.w, y: R.y + Math.random() * R.h };
                n.wanderT = 2500 + Math.random() * 5000;
            }
            if (n.dest) {
                const vx = n.dest.x - n.x, vy = n.dest.y - n.y, d = Math.hypot(vx, vy);
                if (d < 5) { n.dest = null; n.walking = false; if (n.sheet) { n.frame = 1; n.animT = 0; } }
                else {
                    const step = 0.12 * dt;
                    const nx = n.x + vx / d * step, ny = n.y + vy / d * step;
                    if (n.avoidBlocks && blocked(nx, ny)) { n.dest = null; n.walking = false; if (n.sheet) { n.frame = 1; n.animT = 0; } }
                    else {
                        n.x = nx; n.y = ny;
                        n.walking = true;
                        if (n.sheet) {   // 有走路圖的NPC走真幀動畫
                            n.dir = Math.abs(vx) >= Math.abs(vy) ? (vx < 0 ? 1 : 2) : (vy < 0 ? 3 : 0);
                            n.animT = (n.animT || 0) + dt;
                            n.frame = WALK_FRAMES[Math.floor(n.animT / WALK_FRAME_MS) % WALK_FRAMES.length];
                        } else if (vx) n.flip = vx < 0;
                    }
                }
            }
            placeActor(n); placeNpcExtras(n);
            _npcNearCheck(n);
        });
    }
    function _npcNearCheck(n) {
        const near = S.player && Math.hypot(n.x - S.player.x, n.y - S.player.y) < INTERACT_R;
        n.hint.style.display = (near && !S.talkTarget) ? '' : 'none';
    }

    // ── NPC 各自的輕量對話歷史（localStorage，上限 40 條）──
    //   cap 提到 40：給一對一記憶壓縮留 headroom（累積到閾值才壓，壓縮失敗時不會立刻擠掉未總結的舊訊息）
    function getNpcHistory(key) {
        try { return JSON.parse(localStorage.getItem('lstage_hist_' + key) || '[]'); } catch (e) { return []; }
    }
    function pushNpcHistory(key, msg) {
        try {
            const arr = getNpcHistory(key);
            arr.push(msg);
            while (arr.length > 40) arr.shift();
            localStorage.setItem('lstage_hist_' + key, JSON.stringify(arr));
        } catch (e) {}
    }
    // 壓縮後裁短：只留最近 keepLast 條，回傳被裁掉的舊訊息（供組 chunk）
    function truncateNpcHistory(key, keepLast) {
        try {
            const arr = getNpcHistory(key);
            if (arr.length <= keepLast) return [];
            const dropped = arr.slice(0, arr.length - keepLast);
            localStorage.setItem('lstage_hist_' + key, JSON.stringify(arr.slice(-keepLast)));
            return dropped;
        } catch (e) { return []; }
    }
    function popNpcHistoryTail(key, role) {
        try {
            const arr = getNpcHistory(key);
            if (arr.length && arr[arr.length - 1].role === role) {
                arr.pop();
                localStorage.setItem('lstage_hist_' + key, JSON.stringify(arr));
            }
        } catch (e) {}
    }

    // ── 對話框顯隱＋像素立繪（VN風：平常收起、對話才浮出）──
    function showDialog() {
        const left = document.querySelector('.lobby-left');
        if (!left || !S.active) return;
        left.classList.remove('lstage-dlg-hidden');
        // 立繪=說話對象的像素小人放大版（NPC=對方、跟瀅瀅聊=瀅瀅）
        let p = left.querySelector('.lstage-talk-portrait');
        if (!p) {
            p = document.createElement('img');
            p.className = 'lstage-talk-portrait';
            left.appendChild(p);
        }
        // 走路圖角色的el是div沒有src → 立繪用 portrait 欄位或退回預設字串圖
        const t = S.talkTarget;
        p.src = t ? (t.portrait || t.el.src || (typeof t.defaultSrc === 'string' ? t.defaultSrc : ASSET.ying))
              : (S.scene === 'hall' ? ASSET.alice : (S.scene === 'room404' ? ASSET.cheshire : ASSET.ying));
        // ✖ 關閉鈕（掛在對話框右上角；點空地也能關，這顆是給直覺用的）
        const box = document.getElementById('iris-dialogue-box');
        if (box && !box.querySelector('.lstage-dlg-close')) {
            const btn = document.createElement('button');
            btn.className = 'lstage-dlg-close';
            btn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            btn.addEventListener('click', (e) => { e.stopPropagation(); if (S.talkTarget) endTalk(); else hideDialog(); });
            box.appendChild(btn);
        }
    }
    function hideDialog() {
        const left = document.querySelector('.lobby-left');
        if (!left) return;
        left.classList.add('lstage-dlg-hidden');
        left.querySelector('.lstage-talk-portrait')?.remove();
        document.querySelector('#iris-dialogue-box .lstage-dlg-close')?.remove();
        // 戳戳反應框一起收：開聊招呼走反應框（不受 lstage-dlg-hidden 管，漫遊戳戳要能冒泡）
        // → 按 ✖ 關對話時它會自己留到計時器到期（最長15s）＝「背景關不掉」。這裡直接收掉。
        const rb = document.getElementById('iris-reaction-box');
        if (rb) rb.style.display = 'none';
    }

    // ── 對話目標（對話本體仍走 void_terminal.sendIrisMessage）──
    function startTalk(npc) {
        if (S.edit) return;
        S.talkTarget = npc;
        S.npcs.forEach(n => { n.hint.style.display = 'none'; });
        const tagSpan = document.querySelector('#iris-name-tag span');
        const input = document.getElementById('iris-input');
        if (npc.key === 'ying' || npc.key === 'cheshire') {
            // 瀅瀅/柴郡=對話目標，但管線走各自原生軌道（void_terminal 對這兩位不走 NPC 分支）
            if (tagSpan) tagSpan.textContent = npc.name;
            if (input) input.placeholder = '和' + npc.name + '聊聊…（點空地結束）';
            showDialog();
            window.dispatchEvent(new CustomEvent('lstage-poke-ying'));   // 開聊招呼=戳戳池抽一句(404房自動用柴郡池)
            return;
        }
        if (tagSpan) tagSpan.textContent = npc.name;
        if (input) input.placeholder = '和' + npc.name + '聊聊…（點空地結束）';
        showDialog();
    }
    function endTalk() {
        if (!S.talkTarget) return;
        S.talkTarget = null;
        _applySceneHeader();
        hideDialog();
    }
    // 場景預設門面：書咖=瀅瀅、大廳=愛麗絲、404=柴郡（場景牌/名牌/輸入框提示跟著場景走）
    const SCENE_HEADER = {
        cafe:    { name: '瀅瀅',   badge: '視差書咖', ph: '提供故事素材或與瀅瀅對話...' },
        hall:    { name: '愛麗絲', badge: '純白大廳', ph: '與愛麗絲對話，或走向大門返回書咖...' },
        room404: { name: '柴郡',   badge: '404號房',  ph: '對404號房的看守者說話，或走底部出口離開...' },
    };
    function _applySceneHeader() {
        const H = SCENE_HEADER[S.scene] || SCENE_HEADER.cafe;
        const tagSpan = document.querySelector('#iris-name-tag span');
        if (tagSpan) tagSpan.textContent = H.name;
        if (window.VoidTerminal?._bridge?.setSceneBadge) window.VoidTerminal._bridge.setSceneBadge(H.badge);
        const input = document.getElementById('iris-input');
        if (input) input.placeholder = H.ph;
    }
    // 場景預設對話對象：大廳裡沒點人直接打字＝跟愛麗絲說話（書咖=null→走瀅瀅原軌道）
    function getDefaultTarget() {
        return S.scene === 'hall' ? (S.npcs.find(n => n.key === 'alice') || null) : null;
    }

    // ── 鏡頭 ─────────────────────────────────────────────
    function fitCamera() {
        if (!S.root) return;
        const vw = S.root.clientWidth, vh = S.root.clientHeight;
        if (!vw || !vh) return;
        S.scale = Math.max(vw / MAP_W, vh / MAP_H);
        S._camX = S._camY = null;   // 縮放變了→強制重寫 transform（applyCamera 有快取）
        applyCamera();
    }
    function applyCamera() {
        if (!S.root) return;
        const vw = S.root.clientWidth, vh = S.root.clientHeight;
        const focus = S.edit ? S.edit.cam : (S.player ? { x: S.player.x, y: S.player.y } : { x: MAP_W / 2, y: MAP_H / 2 });
        // 底部對話框會蓋住下緣 → 跟隨模式把焦點擺在畫面偏上(38%)，人不會躲進對話框後面
        const focusRatio = S.edit ? 0.5 : 0.38;
        let cx = focus.x * S.scale - vw / 2, cy = focus.y * S.scale - vh * focusRatio;
        cx = Math.max(0, Math.min(MAP_W * S.scale - vw, cx));
        cy = Math.max(0, Math.min(MAP_H * S.scale - vh, cy));
        if (S._camX === cx && S._camY === cy) return;   // 鏡頭沒動就不重寫 transform
        S._camX = cx; S._camY = cy;
        S.world.style.transform = 'translate(' + (-cx) + 'px,' + (-cy) + 'px) scale(' + S.scale + ')';
    }

    // 舞台看不見就別燒 CPU：VN 劇情/閱讀器全螢幕蓋著、大廳分頁被切走、瀏覽器分頁背景化
    // → 60fps 迴圈降成每 500ms 探一次「能醒了嗎」，不跟 VN 的打字機/生圖/語音搶主執行緒。
    function _stageHidden() {
        try {
            if (document.hidden) return true;
            if (!S.root || !S.root.isConnected) return true;
            if (S.root.offsetParent === null) return true;   // 大廳分頁 display:none（切去其他 tab）
            const vn = document.getElementById('aurelia-vn-panel');
            if (vn && vn.offsetParent !== null) return true;   // VN 劇情面板開著（全螢幕蓋住舞台）
            const rd = document.getElementById('vn-reader-sa');
            if (rd && rd.offsetParent !== null) return true;   // VN 閱讀器同理
        } catch (e) {}
        return false;
    }
    function tick(now) {
        if (_stageHidden()) {
            S.raf = null;
            S.sleepT = setTimeout(() => {
                if (!S.active) return;
                S.last = performance.now();
                S.raf = requestAnimationFrame(tick);
            }, 500);
            return;
        }
        const dt = Math.min(50, now - S.last); S.last = now;
        update(dt);
        S.raf = requestAnimationFrame(tick);
    }
    function update(dt) {
        if (S.edit) { applyCamera(); return; }   // 擺設模式凍結移動/漫步
        const p = S.player;
        if (p && !S.talkTarget) {
            let dx = 0, dy = 0;
            if (S.keys['arrowleft'] || S.keys['a']) dx -= 1;
            if (S.keys['arrowright'] || S.keys['d']) dx += 1;
            if (S.keys['arrowup'] || S.keys['w']) dy -= 1;
            if (S.keys['arrowdown'] || S.keys['s']) dy += 1;
            if (dx || dy) p.dest = null;
            else if (p.dest) {
                const vx = p.dest.x - p.x, vy = p.dest.y - p.y, d = Math.hypot(vx, vy);
                if (d < 6) p.dest = null; else { dx = vx / d; dy = vy / d; }
            }
            const len = Math.hypot(dx, dy);
            if (len > 0) {
                const step = PLAYER_SPEED * dt / len;
                const nx = p.x + dx * step, ny = p.y + dy * step;
                if (!blocked(nx, ny)) { p.x = nx; p.y = ny; }
                else if (dx && !blocked(nx, p.y)) { p.x = nx; p.dest = null; }
                else if (dy && !blocked(p.x, ny)) { p.y = ny; p.dest = null; }
                else p.dest = null;
                p.walking = true;
                if (p.sheet) {
                    // 方向列：0下/1左/2右/3上（主軸決定朝向），幀序 0,1,2,1
                    p.dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 1 : 2) : (dy < 0 ? 3 : 0);
                    p.animT = (p.animT || 0) + dt;
                    p.frame = WALK_FRAMES[Math.floor(p.animT / WALK_FRAME_MS) % WALK_FRAMES.length];
                } else if (dx !== 0) p.flip = dx < 0;
            } else {
                p.walking = false;
                if (p.sheet) { p.frame = 1; p.animT = 0; }   // 立定=中幀
            }
            placeActor(p);
            // 🚪 過門判定：落地後必須先「走出」觸發區一次，門才重新武裝（防落點在門區內乒乓轉場）
            if (!S.transitioning) {
                const door = CFG.doors.find(D =>
                    p.x > D.x && p.x < D.x + D.w && p.y > D.y && p.y < D.y + D.h);
                if (door) {
                    if (S.doorArm && performance.now() > S.doorCd) {
                        if (door.restore) {   // 404出口：走系統還原流程(void_terminal 收事件跑 restoreLobby)
                            S.doorArm = false;
                            S.doorCd = performance.now() + 2000;
                            window.dispatchEvent(new CustomEvent('lstage-restore-lobby'));
                        } else goScene(door.to, door.spawn);
                    }
                } else S.doorArm = true;
            }
        }
        updateNpcs(dt);
        applyCamera();
    }

    // ── 🚪 場景切換（白光過場）──────────────────────────
    function goScene(to, spawn, spawnMode) {
        if (S.transitioning || !SCENES[to]) return;
        S.transitioning = true;
        const left = document.querySelector('.lobby-left');
        const fade = document.createElement('div');
        fade.className = 'lstage-fade';
        (left || S.root).appendChild(fade);
        requestAnimationFrame(() => fade.classList.add('on'));
        setTimeout(() => {
            unmount();
            S.scene = to;
            S.spawnOverride = (spawnMode === 'player') ? null : 'arrive';   // 預設落在目標場景的「落」圓點
            S.doorCd = performance.now() + 900;   // 落地冷卻，防止秒回
            tryMount();
            S.transitioning = false;
            fade.classList.remove('on');
            setTimeout(() => fade.remove(), 400);
        }, 320);
    }
    // 404 進出（void_terminal 的 enter404Room/restoreLobby 呼叫；stage 關著時只記場景）
    function enter404Stage() {
        if (S.active) goScene('room404', null, 'arrive');
        else S.scene = 'room404';
    }
    function exit404Stage() {
        if (S.active) goScene('cafe', null, 'player');
        else { S.scene = 'cafe'; tryMount(); }
    }

    // ── 掛載/卸載 ─────────────────────────────────────────
    function tryMount() {
        const left = document.querySelector('.lobby-left');
        if (!left || S.active || !isOn()) return;
        CFG = _loadCfg(); rebuildBlocks(); loadMask();
        const root = document.createElement('div');
        root.className = 'lstage-root';
        root.innerHTML = '<div class="lstage-world">' +
            '<img class="lstage-map" src="' + CDN + SCENES[S.scene].base + '" width="' + MAP_W + '" height="' + MAP_H + '">' +
            '<div class="lstage-click"></div></div>' +
            '<button class="lstage-edit-btn" title="擺設模式"><i class="fa-solid fa-pen-ruler"></i></button>';
        left.appendChild(root);
        left.classList.add('lstage-on', 'lstage-dlg-hidden');   // 對話框預設收起，開聊才浮出
        // 💬 聊天符號（自由漫遊時的浮鈕）：點了浮出「對話框＋輸入框」一組
        const fab = document.createElement('button');
        fab.className = 'lstage-chat-fab';
        fab.title = '開啟對話';
        fab.innerHTML = '<i class="fa-solid fa-comment-dots"></i>';
        fab.addEventListener('click', (e) => { e.stopPropagation(); showDialog(); });
        left.appendChild(fab);
        S.root = root; S.world = root.querySelector('.lstage-world'); S.active = true;
        S.doorArm = false;   // 剛進場先解除門武裝，走出門區才啟動
        // 底圖：本機/網址覆蓋（建構模式「換底圖」）
        if (CFG.baseOverride) {
            const mapImg = root.querySelector('.lstage-map');
            resolveRef(CFG.baseOverride).then(src => { if (src && mapImg) mapImg.src = src; });
        }
        S.objEls = CFG.layout.map(o => _spawnObjEl(o));
        root.querySelector('.lstage-edit-btn').addEventListener('click', () => (S.edit ? exitEdit(true) : enterEdit()));
        // 👗 右鍵角色→裝扮室（用座標命中判定，不動角色的 pointer-events）
        root.addEventListener('contextmenu', (e) => {
            if (S.edit) return;
            const r = S.world.getBoundingClientRect();
            const mx = (e.clientX - r.left) / S.scale, my = (e.clientY - r.top) / S.scale;
            const all = (S.player ? [S.player] : []).concat(S.npcs);
            const hit = all.find(a => {
                const w = Math.max(50, a.h * ((a.frameW && a.frameH) ? a.frameW / a.frameH : 0.6));
                return mx > a.x - w / 2 && mx < a.x + w / 2 && my > a.y - a.h && my < a.y;
            });
            if (!hit) return;
            e.preventDefault(); e.stopPropagation();
            _openActorMenu(hit, e.clientX, e.clientY);
        });
        initPlayer();
        initNpcs();
        _applySceneHeader();
        fitCamera();
        window.addEventListener('resize', fitCamera);
        S.last = performance.now();
        S.raf = requestAnimationFrame(tick);
        console.log('[LobbyStage] mounted');
    }
    function _spawnObjEl(o) {
        const img = document.createElement('img');
        img.className = 'lstage-actor lstage-obj';
        if (o.float) img.classList.add('lstage-float');   // 飄浮物件（如 LUNA-VII 核心）
        resolveRef(o).then(src => { if (src) img.src = src; });
        placeObj(img, o);
        S.world.appendChild(img);
        return img;
    }
    function placeObj(img, o) {
        const d = effDims(o);
        img.style.left = o.x + 'px';
        img.style.top = o.y + 'px';
        img.style.width = d.ew + 'px';
        img.style.zIndex = String(2 + Math.round(o.y + d.eh));
    }
    function unmount() {
        if (!S.active) return;
        if (S.edit) exitEdit(false);
        _closeActorMenu(); _closeDressRoom();
        endTalk();
        cancelAnimationFrame(S.raf);
        if (S.sleepT) { clearTimeout(S.sleepT); S.sleepT = null; }
        window.removeEventListener('resize', fitCamera);
        if (S.onKey) {
            window.removeEventListener('keydown', S.onKey, true);
            window.removeEventListener('keyup', S.onKey, true);
            S.onKey = null;
        }
        S.root?.remove();
        const _left = document.querySelector('.lobby-left');
        if (_left) {
            _left.classList.remove('lstage-on', 'lstage-dlg-hidden');
            _left.querySelector('.lstage-talk-portrait')?.remove();
            _left.querySelector('.lstage-chat-fab')?.remove();
        }
        S.root = S.world = null;
        S.player = null; S.npcs = []; S.talkTarget = null; S.followers = []; S.keys = {}; S.objEls = [];
        S.mask = null;
        S.active = false;
        console.log('[LobbyStage] unmounted');
    }

    // ── 🖊 擺設模式 ──────────────────────────────────────
    // 拖物件=挪位置；點選物件後「佔地-/+」調 footH（紅色半透明=佔地，人走不進去）；
    // 拖彩色圓點=角色站位（瀅=瀅瀅、我=出生點、1~4=輪班NPC位）；拖空地=平移視角。
    function enterEdit() {
        endTalk();
        S.edit = {
            cam: S.player ? { x: S.player.x, y: S.player.y } : { x: MAP_W / 2, y: MAP_H / 2 },
            sel: -1, feet: [], markers: [], drag: null,
        };
        S.root.classList.add('lstage-editing');
        // 物件可拖 + 佔地覆蓋層（index 動態查，配合建構模式增刪）
        S.objEls.forEach((img, i) => { _makeEditable(img); _syncFoot(i); });
        // 站位標記
        const mk = (label, cls, get) => {
            const m = document.createElement('div');
            m.className = 'lstage-marker ' + cls;
            m.textContent = label;
            S.world.appendChild(m);
            const pos = get();
            m.style.left = pos.x + 'px'; m.style.top = pos.y + 'px';
            return m;
        };
        S.edit.markers.push(mk('我', 'm-player', () => CFG.points.player));
        S.edit.markers[0].onpointerdown = (e) => _dragStart(e, { kind: 'pt', pt: CFG.points.player, m: S.edit.markers[0] });
        if (CFG.points.arrive) {   // 過門後的落地點
            const m = mk('落', 'm-arrive', () => CFG.points.arrive);
            S.edit.markers.push(m);
            m.onpointerdown = (e) => _dragStart(e, { kind: 'pt', pt: CFG.points.arrive, m });
        }
        // 常駐角色站位（拖了「完成」後生效）
        [['alicePos', '愛', 'm-alice'], ['cheshirePos', '柴', 'm-cheshire']].forEach(([pk, label, cls]) => {
            if (!CFG.points[pk]) return;
            const m = mk(label, cls, () => CFG.points[pk]);
            S.edit.markers.push(m);
            m.onpointerdown = (e) => _dragStart(e, { kind: 'pt', pt: CFG.points[pk], m });
        });
        // 可拖拉區塊（拖框身=移動、拖右下角=調大小）：紫=瀅瀅活動區、綠=客人出沒區
        S.edit.zones = {};
        const mkZone = (pk, label, cls) => {
            if (!CFG.points[pk]) return;
            const zone = document.createElement('div');
            zone.className = 'lstage-zone ' + cls;
            zone.innerHTML = '<span class="lstage-zone-label">' + label + '</span><span class="lstage-zone-grip"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></span>';
            S.world.appendChild(zone);
            S.edit.zones[pk] = zone;
            _syncZone(pk);
            zone.onpointerdown = (e) => _dragStart(e, { kind: 'zone', pk });
            zone.querySelector('.lstage-zone-grip').onpointerdown = (e) => _dragStart(e, { kind: 'zoneresize', pk });
        };
        mkZone('yingZone', '瀅瀅活動區', 'z-ying');
        mkZone('npcZone', '客人出沒區', 'z-npc');
        // 遮罩視覺化：不可走區塗半透明紅（有載入遮罩才畫）
        if (S.mask && S.mask.ok) {
            const cv = document.createElement('canvas');
            cv.width = MAP_W; cv.height = MAP_H;
            cv.className = 'lstage-maskview';
            const ctx = cv.getContext('2d');
            const out = ctx.createImageData(MAP_W, MAP_H);
            const src = S.mask.data;
            for (let i = 0; i < src.length; i += 4) {
                if (src[i] < 128) { out.data[i] = 220; out.data[i + 1] = 60; out.data[i + 2] = 60; out.data[i + 3] = 78; }
            }
            ctx.putImageData(out, 0, 0);
            S.world.appendChild(cv);
            S.edit.maskView = cv;
        }
        // 過門區：踩進去就轉場（可拖、右下角調大小；「落」圓點別放進來）
        S.edit.doorRects = CFG.doors.map((D, i) => {
            const el = document.createElement('div');
            el.className = 'lstage-doorrect';
            el.innerHTML = '<span>過門區→' + (SCENES[D.to] ? (D.to === 'hall' ? '大廳' : '書咖') : D.to) + '</span>' +
                '<span class="lstage-zone-grip lstage-door-grip"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></span>';
            S.world.appendChild(el);
            _syncDoor(i, el);
            el.onpointerdown = (e) => _dragStart(e, { kind: 'door', i });
            el.querySelector('.lstage-door-grip').onpointerdown = (e) => _dragStart(e, { kind: 'doorresize', i });
            return el;
        });
        // 外框鋼索：金色多邊形=可走範圍，白色錨點可拖（牆角）——有手繪遮罩的場景不顯示（遮罩優先）
        if (!SCENES[S.scene].mask && Array.isArray(CFG.points.boundary) && CFG.points.boundary.length >= 3) {
            const NS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('class', 'lstage-wire');
            svg.setAttribute('width', String(MAP_W));
            svg.setAttribute('height', String(MAP_H));
            svg.setAttribute('viewBox', '0 0 ' + MAP_W + ' ' + MAP_H);
            const poly = document.createElementNS(NS, 'polygon');
            svg.appendChild(poly);
            S.world.appendChild(svg);
            S.edit.wire = { svg, poly, handles: [] };
            CFG.points.boundary.forEach((pt) => {
                const hnd = document.createElement('div');
                hnd.className = 'lstage-vert';
                S.world.appendChild(hnd);
                hnd.onpointerdown = (e) => _dragStart(e, { kind: 'vert', pt, m: hnd });
                S.edit.wire.handles.push(hnd);
            });
            _syncWire();
        }
        // 空地拖曳=平移視角
        S.root.querySelector('.lstage-click').onpointerdown = (e) => _dragStart(e, { kind: 'cam' });
        window.addEventListener('pointermove', _dragMove);
        window.addEventListener('pointerup', _dragEnd);
        // 控制面板
        const panel = document.createElement('div');
        panel.className = 'lstage-edit-panel';
        panel.innerHTML =
            '<div class="lep-hint">拖東西調位置，拖空地移動視角。紅色罩=牆｜橘虛線框=過門區(踩進去就轉場，可拖/右下角調大小)｜橘圓「落」=過門後的落地點(別放進過門區)｜藍圓=出生點｜綠框=客人出沒區｜紫框=瀅瀅活動範圍｜紅實心框=家具佔地</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="objminus"><i class="fa-solid fa-minus"></i> 家具</button>' +
              '<button class="lep-btn" data-act="objplus"><i class="fa-solid fa-plus"></i> 家具</button>' +
            '</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="footminus"><i class="fa-solid fa-minus"></i> 佔地高</button>' +
              '<button class="lep-btn" data-act="footplus"><i class="fa-solid fa-plus"></i> 佔地高</button>' +
            '</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="footwminus"><i class="fa-solid fa-minus"></i> 佔地寬</button>' +
              '<button class="lep-btn" data-act="footwplus"><i class="fa-solid fa-plus"></i> 佔地寬</button>' +
            '</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="actminus"><i class="fa-solid fa-minus"></i> 人物</button>' +
              '<button class="lep-btn" data-act="actplus"><i class="fa-solid fa-plus"></i> 人物</button>' +
            '</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="addobj"><i class="fa-solid fa-plus"></i> 新增家具</button>' +
              '<button class="lep-btn lep-danger" data-act="delobj"><i class="fa-solid fa-trash"></i> 刪除家具</button>' +
            '</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="setbase"><i class="fa-solid fa-image"></i> 換底圖</button>' +
              '<button class="lep-btn" data-act="setmask"><i class="fa-solid fa-map"></i> 換遮罩</button>' +
            '</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="copy"><i class="fa-solid fa-copy"></i> 複製數據</button>' +
              '<button class="lep-btn" data-act="reset"><i class="fa-solid fa-rotate-left"></i> 還原預設</button>' +
              '<button class="lep-btn lep-done" data-act="done"><i class="fa-solid fa-check"></i> 完成</button>' +
            '</div>' +
            '<textarea class="lep-out" readonly></textarea>';
        S.root.appendChild(panel);
        S.edit.panel = panel;
        panel.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (!act) return;
            if (act === 'footminus' || act === 'footplus') {
                if (S.edit.sel < 0) return;
                const o = CFG.layout[S.edit.sel];
                o.footH = Math.max(20, Math.min(o.h, o.footH + (act === 'footplus' ? 10 : -10)));
                _syncFoot(S.edit.sel); _exportToPanel();
            } else if (act === 'footwminus' || act === 'footwplus') {
                if (S.edit.sel < 0) return;
                const o = CFG.layout[S.edit.sel];
                const cur = (o.footW != null ? o.footW : o.w);
                o.footW = Math.max(20, Math.min(o.w, Math.round(cur * (act === 'footwplus' ? 1.1 : 0.9))));
                _syncFoot(S.edit.sel); _exportToPanel();
            } else if (act === 'objminus' || act === 'objplus') {
                if (S.edit.sel < 0) return;
                const o = CFG.layout[S.edit.sel];
                // 等比±10%：大圖小圖手感一致；下限0.05（大廳素材原圖超大、預設s本來就<0.3）
                o.s = Math.max(0.05, Math.min(2, Math.round((o.s || 1) * (act === 'objplus' ? 1.1 : 0.9) * 1000) / 1000));
                placeObj(S.objEls[S.edit.sel], o); _syncFoot(S.edit.sel); _exportToPanel();
            } else if (act === 'actminus' || act === 'actplus') {
                CFG.points.actorScale = Math.max(0.5, Math.min(1.6, Math.round((((CFG.points.actorScale || 1)) + (act === 'actplus' ? 0.05 : -0.05)) * 100) / 100));
                applyActorScale(); _exportToPanel();
            } else if (act === 'addobj') {
                _askImage((ref, dataUrl) => _addFurniture(ref, dataUrl));
            } else if (act === 'delobj') {
                const i = S.edit.sel;
                if (i < 0) return;
                CFG.layout.splice(i, 1);
                S.objEls[i].remove(); S.objEls.splice(i, 1);
                S.edit.feet[i].remove(); S.edit.feet.splice(i, 1);
                S.edit.sel = -1;
                S.edit.feet.forEach((_, k) => _syncFoot(k));
                _exportToPanel();
            } else if (act === 'setbase' || act === 'setmask') {
                _askImage((ref) => {
                    if (act === 'setbase') {
                        CFG.baseOverride = ref;
                        resolveRef(ref).then(src => { const m = S.root?.querySelector('.lstage-map'); if (src && m) m.src = src; });
                    } else {
                        CFG.maskOverride = ref;
                        loadMask();   // 立即重載碰撞（紅罩下次進擺設模式更新）
                    }
                    _exportToPanel();
                });
            } else if (act === 'copy') {
                const out = panel.querySelector('.lep-out');
                out.select();
                try { navigator.clipboard?.writeText(out.value); } catch (err) {}
                try { document.execCommand('copy'); } catch (err) {}
            } else if (act === 'reset') {
                try { localStorage.removeItem(SCENES[S.scene].cfgKey); } catch (err) {}
                exitEdit(false); unmount(); tryMount();
            } else if (act === 'done') {
                exitEdit(true);
            }
        });
        _exportToPanel();
    }
    function _makeEditable(img) {
        img.classList.add('lstage-editable');
        const foot = document.createElement('div');
        foot.className = 'lstage-foot';
        S.world.appendChild(foot);
        S.edit.feet.push(foot);
        img.onpointerdown = (e) => _dragStart(e, { kind: 'obj', i: S.objEls.indexOf(img) });
    }
    // 建構模式選圖：貼網址或留空→從電腦選擇圖片（上傳存進本機資產庫 IndexedDB）
    // ── 🧊 像素處理管線：去背（邊緣連通 BFS）＋掃碎片；opts.noGrid=true 時「不壓縮」──
    //   壓縮（縮到 96px 高、nearest=大顆粒）只給手動「壓成像素小小人」用；
    //   裝扮室「生成並套用」走 noGrid＝畫風原封不動（Rae：以後要換不同Q版畫風，有些畫風不能壓）。
    //   去背只挖「從四邊連通進來、跟邊框主色相近」的像素，不做全域色鍵——
    //   全域色鍵會把身體內部同色塊一起挖掉（老教訓）。
    function _loadImg(src) {
        return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    }
    async function _pixelify(src, opts) {
        try {
            // 網址圖先抓成 dataURL（直接畫進 canvas 會被跨網域汙染、readback 直接炸）
            if (/^https?:/i.test(String(src))) {
                try {
                    const b = await (await fetch(src)).blob();
                    src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
                } catch (e) { return null; }
            }
            const img = await _loadImg(src);
            let W, H;
            if (opts && opts.noGrid) {
                W = img.naturalWidth || 1; H = img.naturalHeight || 1;   // 原尺寸原畫風，不格點化
            } else {
                H = 96; W = Math.max(1, Math.round((img.naturalWidth || 1) * H / (img.naturalHeight || 1)));
            }
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.imageSmoothingEnabled = false;   // 關平滑=最近鄰取樣（noGrid 時 1:1 畫、無影響）
            ctx.drawImage(img, 0, 0, W, H);
            const d = ctx.getImageData(0, 0, W, H), px = d.data;
            // 邊框主色：四邊像素投票；夠一致（>40%）才視為單色背景
            const votes = new Map(); let borderN = 0, transparentN = 0;
            const at = (x, y) => (y * W + x) * 4;
            const border = [];
            for (let x = 0; x < W; x++) border.push([x, 0], [x, H - 1]);
            for (let y = 1; y < H - 1; y++) border.push([0, y], [W - 1, y]);
            for (const [x, y] of border) {
                const i = at(x, y); borderN++;
                if (px[i + 3] < 16) { transparentN++; continue; }
                const k = (px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4);   // 量化到16階再投票（抗輕微雜訊）
                votes.set(k, (votes.get(k) || 0) + 1);
            }
            if (transparentN < borderN * 0.5 && votes.size) {   // 邊框大多已透明=本來就去過背，跳過
                let bestK = '', bestC = 0;
                votes.forEach((c, k) => { if (c > bestC) { bestC = c; bestK = k; } });
                if (bestC > borderN * 0.4) {
                    const [br, bg, bb] = bestK.split(',').map(n => (parseInt(n, 10) << 4) + 8);
                    const near = (i) => px[i + 3] > 0 && (Math.abs(px[i] - br) + Math.abs(px[i + 1] - bg) + Math.abs(px[i + 2] - bb)) < 72;
                    const seen = new Uint8Array(W * H); const q = [];
                    for (const [x, y] of border) { const p = y * W + x; if (!seen[p] && near(p * 4)) { seen[p] = 1; q.push(p); } }
                    while (q.length) {
                        const p = q.pop(); px[p * 4 + 3] = 0;
                        const x = p % W, y = (p / W) | 0;
                        if (x > 0 && !seen[p - 1] && near((p - 1) * 4)) { seen[p - 1] = 1; q.push(p - 1); }
                        if (x < W - 1 && !seen[p + 1] && near((p + 1) * 4)) { seen[p + 1] = 1; q.push(p + 1); }
                        if (y > 0 && !seen[p - W] && near((p - W) * 4)) { seen[p - W] = 1; q.push(p - W); }
                        if (y < H - 1 && !seen[p + W] && near((p + W) * 4)) { seen[p + W] = 1; q.push(p + W); }
                    }
                }
            }
            // 🧹 掃碎片：去背後常剩「飄在主體周圍的雜點/迷你分身」（SDXL 像素圖通病）。
            //   連通塊分析：只留最大塊＋面積≥最大塊25%的大附件；碎屑/旁邊的小複製人全清。
            //   全圖不透明（去背沒發生）＝整張一塊，自然跳過、不誤傷。
            //   ⚠️ 走路圖(sheet)必須跳過：3×4的12格各是獨立連通塊，掃碎片會把11格角色當碎屑刪光。
            if (!(opts && opts.sheet)) {
                const label = new Int32Array(W * H).fill(-1);
                const areas = [];
                const qq = [];
                for (let p0 = 0; p0 < W * H; p0++) {
                    if (label[p0] !== -1 || px[p0 * 4 + 3] === 0) continue;
                    const id = areas.length; let area = 0;
                    label[p0] = id; qq.length = 0; qq.push(p0);
                    while (qq.length) {
                        const p = qq.pop(); area++;
                        const x = p % W, y = (p / W) | 0;
                        if (x > 0     && label[p - 1] === -1 && px[(p - 1) * 4 + 3] > 0) { label[p - 1] = id; qq.push(p - 1); }
                        if (x < W - 1 && label[p + 1] === -1 && px[(p + 1) * 4 + 3] > 0) { label[p + 1] = id; qq.push(p + 1); }
                        if (y > 0     && label[p - W] === -1 && px[(p - W) * 4 + 3] > 0) { label[p - W] = id; qq.push(p - W); }
                        if (y < H - 1 && label[p + W] === -1 && px[(p + W) * 4 + 3] > 0) { label[p + W] = id; qq.push(p + W); }
                    }
                    areas.push(area);
                }
                if (areas.length > 1) {
                    const biggest = Math.max.apply(null, areas);
                    const keepMin = Math.max(12, biggest * 0.25);
                    for (let p = 0; p < W * H; p++) {
                        const id = label[p];
                        if (id !== -1 && areas[id] < keepMin) px[p * 4 + 3] = 0;
                    }
                }
            }
            ctx.putImageData(d, 0, 0);
            // ✂️ 收緊透明邊：原圖(如512×728)角色多半只佔中間一塊，去背後大量留白仍撐著畫布，
            //   舞台照畫布高度縮放 → 角色被留白吃掉顯得特別小、腳還會浮空。裁到人物外框，
            //   尺寸才對得上走路圖角色（瀅瀅/玩家塞滿整格）。全不透明(沒去背)＝外框=全圖，自然跳過不誤傷。
            //   ⚠️ 走路圖(sheet)跳過：整片裁切會打亂3×4的格線對齊。
            if (!(opts && opts.sheet)) {
                let minX = W, minY = H, maxX = -1, maxY = -1;
                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        if (px[(y * W + x) * 4 + 3] > 0) {
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                        }
                    }
                }
                if (maxX >= minX && maxY >= minY && (maxX - minX + 1 < W || maxY - minY + 1 < H)) {
                    const cw = maxX - minX + 1, ch = maxY - minY + 1;
                    const out = document.createElement('canvas'); out.width = cw; out.height = ch;
                    out.getContext('2d').drawImage(cv, minX, minY, cw, ch, 0, 0, cw, ch);
                    return out.toDataURL('image/png');
                }
            }
            return cv.toDataURL('image/png');
        } catch (e) { console.warn('[LobbyStage] _pixelify 失敗', e); return null; }
    }

    function _askImage(cb) {
        const url = window.prompt('貼上圖片網址；或留空按「確定」改為從電腦選擇圖片');
        if (url === null) return;
        if (url.trim()) { cb({ url: url.trim() }); return; }
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = () => {
            const f = inp.files && inp.files[0];
            if (!f) return;
            const rd = new FileReader();
            rd.onload = async () => {
                const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                try { await idbPut(id, rd.result); cb({ idb: id }, rd.result); }
                catch (e) { console.warn('[LobbyStage] 圖片存檔失敗', e); }
            };
            rd.readAsDataURL(f);
        };
        inp.click();
    }
    // 新增家具：量原圖尺寸→縮到約240px高→放到目前視角中央→立即可拖
    function _addFurniture(ref, dataUrl) {
        const probe = new Image();
        probe.onload = () => {
            if (!S.edit) return;
            const w = probe.naturalWidth || 200, h = probe.naturalHeight || 200;
            const s = Math.min(1, Math.round(240 / h * 100) / 100);
            const o = Object.assign({}, ref, {
                x: Math.round(S.edit.cam.x - w * s / 2),
                y: Math.round(S.edit.cam.y - h * s / 2),
                w, h,
                footH: Math.max(20, Math.round(h * 0.25)),
                s,
            });
            CFG.layout.push(o);
            const img = _spawnObjEl(o);
            S.objEls.push(img);
            _makeEditable(img);
            S.edit.sel = CFG.layout.length - 1;
            S.edit.feet.forEach((_, k) => _syncFoot(k));
            _exportToPanel();
        };
        probe.onerror = () => console.warn('[LobbyStage] 圖片載入失敗');
        (dataUrl ? Promise.resolve(dataUrl) : resolveRef(ref)).then(src => { if (src) probe.src = src; });
    }
    function _syncDoor(i, el) {
        const D = CFG.doors[i], e = el || S.edit?.doorRects?.[i];
        if (!D || !e) return;
        e.style.left = D.x + 'px';
        e.style.top = D.y + 'px';
        e.style.width = D.w + 'px';
        e.style.height = D.h + 'px';
    }
    function _syncWire() {
        const w = S.edit?.wire;
        if (!w) return;
        const b = CFG.points.boundary;
        w.poly.setAttribute('points', b.map(p => p.x + ',' + p.y).join(' '));
        w.handles.forEach((h, i) => { h.style.left = b[i].x + 'px'; h.style.top = b[i].y + 'px'; });
    }
    function _syncZone(pk) {
        const z = CFG.points[pk], el = S.edit?.zones?.[pk];
        if (!z || !el) return;
        el.style.left = z.x + 'px';
        el.style.top = z.y + 'px';
        el.style.width = z.w + 'px';
        el.style.height = z.h + 'px';
    }
    function _syncFoot(i) {
        const o = CFG.layout[i], foot = S.edit.feet[i];
        if (!foot) return;
        const r = footRect(o);
        foot.style.left = r.x + 'px';
        foot.style.top = r.y + 'px';
        foot.style.width = r.w + 'px';
        foot.style.height = r.h + 'px';
        foot.classList.toggle('sel', S.edit.sel === i);
    }
    function _dragStart(e, info) {
        e.preventDefault(); e.stopPropagation();
        S.edit.drag = Object.assign({ sx: e.clientX, sy: e.clientY }, info);
        if (info.kind === 'obj') {
            S.edit.sel = info.i;
            const o = CFG.layout[info.i];
            S.edit.drag.ox = o.x; S.edit.drag.oy = o.y;
            S.edit.feet.forEach((_, k) => _syncFoot(k));
        } else if (info.kind === 'pt' || info.kind === 'vert') {
            S.edit.drag.ox = info.pt.x; S.edit.drag.oy = info.pt.y;
        } else if (info.kind === 'zone') {
            const z = CFG.points[info.pk];
            S.edit.drag.ox = z.x; S.edit.drag.oy = z.y;
        } else if (info.kind === 'zoneresize') {
            const z = CFG.points[info.pk];
            S.edit.drag.ox = z.w; S.edit.drag.oy = z.h;
        } else if (info.kind === 'door') {
            const D = CFG.doors[info.i];
            S.edit.drag.ox = D.x; S.edit.drag.oy = D.y;
        } else if (info.kind === 'doorresize') {
            const D = CFG.doors[info.i];
            S.edit.drag.ox = D.w; S.edit.drag.oy = D.h;
        } else if (info.kind === 'cam') {
            S.edit.drag.ox = S.edit.cam.x; S.edit.drag.oy = S.edit.cam.y;
        }
    }
    function _dragMove(e) {
        const d = S.edit?.drag;
        if (!d) return;
        const dx = (e.clientX - d.sx) / S.scale, dy = (e.clientY - d.sy) / S.scale;
        if (d.kind === 'obj') {
            const o = CFG.layout[d.i];
            o.x = Math.round(d.ox + dx); o.y = Math.round(d.oy + dy);
            placeObj(S.objEls[d.i], o); _syncFoot(d.i);
        } else if (d.kind === 'pt' || d.kind === 'vert') {
            d.pt.x = Math.round(d.ox + dx); d.pt.y = Math.round(d.oy + dy);
            d.m.style.left = d.pt.x + 'px'; d.m.style.top = d.pt.y + 'px';
            if (d.kind === 'vert') _syncWire();
        } else if (d.kind === 'zone') {
            const z = CFG.points[d.pk];
            z.x = Math.round(d.ox + dx); z.y = Math.round(d.oy + dy);
            _syncZone(d.pk);
        } else if (d.kind === 'zoneresize') {
            const z = CFG.points[d.pk];
            z.w = Math.max(60, Math.round(d.ox + dx));
            z.h = Math.max(30, Math.round(d.oy + dy));
            _syncZone(d.pk);
        } else if (d.kind === 'door') {
            const D = CFG.doors[d.i];
            D.x = Math.round(d.ox + dx); D.y = Math.round(d.oy + dy);
            _syncDoor(d.i);
        } else if (d.kind === 'doorresize') {
            const D = CFG.doors[d.i];
            D.w = Math.max(40, Math.round(d.ox + dx));
            D.h = Math.max(24, Math.round(d.oy + dy));
            _syncDoor(d.i);
        } else if (d.kind === 'cam') {
            S.edit.cam.x = d.ox - dx; S.edit.cam.y = d.oy - dy;
        }
    }
    function _dragEnd() {
        if (!S.edit?.drag) return;
        S.edit.drag = null;
        _exportToPanel();
    }
    function _exportData() {
        const data = {
            layoutFull: CFG.layout.map(o => {
                const rec = { x: o.x, y: o.y, w: o.w, h: o.h, footH: o.footH, s: o.s || 1 };
                if (o.file) rec.file = o.file;
                if (o.url) rec.url = o.url;
                if (o.idb) rec.idb = o.idb;
                if (o.footW != null) rec.footW = o.footW;
                if (o.float) rec.float = true;
                return rec;
            }),
            points: CFG.points,
            doors: CFG.doors.map(D => ({ x: D.x, y: D.y, w: D.w, h: D.h })),
        };
        if (CFG.baseOverride) data.baseOverride = CFG.baseOverride;
        if (CFG.maskOverride) data.maskOverride = CFG.maskOverride;
        return data;
    }
    function _exportToPanel() {
        const out = S.edit?.panel?.querySelector('.lep-out');
        if (out) out.value = JSON.stringify(_exportData());
    }
    function exitEdit(save) {
        if (!S.edit) return;
        if (save) {
            try { localStorage.setItem(SCENES[S.scene].cfgKey, JSON.stringify(_exportData())); } catch (e) {}
        }
        window.removeEventListener('pointermove', _dragMove);
        window.removeEventListener('pointerup', _dragEnd);
        S.edit.feet.forEach(f => f.remove());
        S.edit.markers.forEach(m => m.remove());
        Object.values(S.edit.zones || {}).forEach(el => el.remove());
        if (S.edit.wire) { S.edit.wire.svg.remove(); S.edit.wire.handles.forEach(h => h.remove()); }
        S.edit.maskView?.remove();
        (S.edit.doorRects || []).forEach(el => el.remove());
        S.edit.panel?.remove();
        S.objEls.forEach(img => { img.classList.remove('lstage-editable'); img.onpointerdown = null; });
        const click = S.root?.querySelector('.lstage-click');
        if (click) click.onpointerdown = null;
        S.root?.classList.remove('lstage-editing');
        S.edit = null;
        if (save) { rebuildBlocks(); unmount(); tryMount(); }   // 重掛=重生NPC站位+碰撞
    }

    window.LobbyStage = {
        tryMount, unmount,
        enter404Stage, exit404Stage,
        isActive: () => S.active,
        isOn,
        getTalkTarget: () => S.talkTarget,
        getDefaultTarget,
        setTalkTarget: (t) => { S.talkTarget = t || null; },
        endTalk,
        showDialog,
        hideDialog,
        getNpcHistory,
        pushNpcHistory,
        popNpcHistoryTail,
        truncateNpcHistory,
        rollGuestPool: _journalGuestPool,   // console 診斷用：看日誌 NPC 池撈到誰（無 F12 環境靠這個）
        pixelify: _pixelify,                // console 診斷用：手動壓小小人（回 dataURL）
        openDressRoom: _openDressRoom,      // console 診斷用：直接開某個角色的裝扮室（傳 _S.npcs 裡的物件）
        _S: S,
    };
})();
