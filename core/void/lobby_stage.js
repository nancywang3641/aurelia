// ----------------------------------------------------------------
// [檔案] core/void/lobby_stage.js (V1.1 - 書咖俯視像素舞台+擺設模式)
// 職責：把 lobby-left 換成星露谷式俯視舞台（分層地圖/小人/NPC/互動）。
//       對話仍走 void_terminal 的 sendIrisMessage（本模組只提供 talkTarget 與各 NPC 歷史）。
// 分層：底圖(z0) → 物件與角色同一套「底邊y=z-index」深度排序（人走到桌後被遮）。
// 擺設模式：舞台右下 🖊 鈕 → 拖物件/站位、調佔地 → 本機即時生效(localStorage) + 一鍵複製數據（實作拆在 lobby_editor.js）。
// 開關：localStorage lobby_stage_on（'0' 關 → 完整還原原立繪大廳）
// ----------------------------------------------------------------
(function () {
    'use strict';

    const CDN = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@main/';
    const ASSET = {
        // 底圖per場景（SCENES[].base）；素材改版一律換新檔名(瀏覽器對舊檔快取7天,原地覆蓋沒用)
        ying:  CDN + 'lobby_ying_v2.png',    // 瀅瀅立繪(v2=Rae修圖;改版必換檔名防快取)
        alice: CDN + 'lobby_alice_v2.png',   // 愛麗絲立繪(v2)
        cheshire: CDN + 'lobby_cheshire.png',
        mcF:   CDN + 'lobby_mc_f_silhouette.png',   // 通用小人預設=剪影版(Rae定案 2026-07-15)；換裝在裝扮室
        mcM:   CDN + 'lobby_mc_m_silhouette.png',
        walkBase: CDN + 'lobby_walk_base_v1.png',   // 3×4走路圖素體(列=下/左/右/上,欄=左步/立/右步)
        yingWalk: CDN + 'lobby_ying_walk_v2.png',       // 瀅瀅豆豆走路圖(v2=Rae修圖)
        aliceWalk: CDN + 'lobby_alice_walk_v2.png',     // 愛麗絲走路圖(v2)
        cheshireWalk: CDN + 'lobby_cheshire_walk_v2.png', // 柴郡走路圖(v2=Rae調過大小；改版必換檔名防快取)
        rayWalk:  CDN + 'lobby_ray_walk_v1.png',   // 雷伊走路圖(SN自發登場)
        danWalk:  CDN + 'lobby_dan_walk_v2.png',   // 丹走路圖(v2=Rae修圖)
        ray:      CDN + 'lobby_ray.png',           // 雷伊對話立繪
        dan:      CDN + 'lobby_dan.png',           // 丹對話立繪
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
                { file: 'lobby_obj_counter.png', x: 292,  y: 376, w: 1266, h: 396, footH: 150, s: 0.4 },
                { file: 'lobby_obj_02.png',      x: 337,  y: 570, w: 394,  h: 258, footH: 90,  s: 0.6 },
                { file: 'lobby_obj_01.png',      x: 701,  y: 685, w: 391,  h: 267, footH: 90,  s: 0.6 },
                { file: 'lobby_obj_04.png',      x: 955,  y: 524, w: 396,  h: 263, footH: 90,  s: 0.6 },
                { file: 'lobby_obj_03.png',      x: 1054, y: 217, w: 166,  h: 259, footH: 60,  s: 0.55 },
                { file: 'lobby_obj_05.png',      x: 1413, y: 612, w: 156,  h: 259, footH: 60,  s: 0.59 },
                { file: 'lobby_obj_07.png',      x: 101,  y: 829, w: 425,  h: 177, footH: 20,  s: 0.7 },
            ],
            points: {
                yingZone: { x: 315, y: 438, w: 465, h: 30 },
                npcZone:  { x: 184, y: 542, w: 1109, h: 248 },   // 客人出沒區（輪班NPC隨機刷在框內）
                player: { x: 697, y: 600 },
                arrive: { x: 780, y: 868 },   // 走門進來的落點（從街區進書咖：底部大門前）
                // 外框鋼索：可走範圍多邊形（牆角錨點可在擺設模式拖）
                boundary: [
                    { x: 195, y: 360 }, { x: 1453, y: 315 }, { x: 1517, y: 642 },
                    { x: 1529, y: 923 }, { x: 75, y: 925 }, { x: 105, y: 640 },
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
            // 書咖⇄大廳不再直通（2026-07-17 Rae 定案）：出入口只剩底部大門→城市街區；doorsV 擋舊存檔的門座標
            doors: [ { x: 700, y: 895, w: 160, h: 40, to: 'city', spawn: { x: 384, y: 400 } } ],  // 底部大門→街區（落在書咖建築門口）
            doorsV: 2,
        },
        hall: {
            base: 'lobby_hall_base_v2.png',   // v2=核心球已從底圖拆出(空核心版)
            mask: 'lobby_mask_hall_v1.png',   // Rae 手繪碰撞遮罩(白=可走)
            cfgKey: 'lobby_stage_layout_hall_v1',
            layout: [
                { file: 'lobby_hall_obj_core.png',    x: 652, y: 189, w: 788,  h: 935,  footH: 200, footW: 280,  s: 0.3,   float: true }, // LUNA-VII 分形核心(飄浮，佔地=底部尖錐)
                { file: 'lobby_hall_obj_counter.png', x: 990, y: 250, w: 1354, h: 449,  footH: 140, footW: 1301, s: 0.3 }, // 接待櫃檯
                { file: 'lobby_hall_obj_chairs.png',  x: 340, y: 533, w: 1240, h: 520,  footH: 150, s: 0.3 }, // 等候椅組
                { file: 'lobby_hall_obj_kiosk.png',   x: 938, y: 742, w: 587,  h: 1308, footH: 290, s: 0.104 }, // 全息資訊台
                { file: 'lobby_hall_obj_sofa.png',    x: 194, y: 199, w: 1361, h: 414,  footH: 300, s: 0.3 }, // 模組沙發
            ],
            points: {
                npcZone:  { x: 334, y: 538, w: 1000, h: 280 },
                player: { x: 863, y: 634 },
                arrive: { x: 772, y: 830 },   // 走門進來的落點（從書咖進大廳）
                alicePos: { x: 1194, y: 318 },   // 愛麗絲站位（可在擺設模式拖）
                boundary: [
                    { x: 255, y: 240 }, { x: 1290, y: 240 }, { x: 1395, y: 560 },
                    { x: 1430, y: 868 }, { x: 105, y: 868 }, { x: 140, y: 560 },
                ],
                actorScale: 0.7,
            },
            walls: [],   // 外牆走 boundary 鋼索；核心基座=物件腳印
            doors: [ { x: 664, y: 910, w: 213, h: 75, to: 'city', spawn: { x: 1205, y: 655 } } ],  // 底部大門→街區（落在純白大廳門口；不再直通書咖）
            doorsV: 2,
            alice: { x: 1194, y: 318 },   // 愛麗絲：核心旁、不漫步、永遠面向玩家
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
        city: {   // 🏙 視差城市第一街區＝分層可走（day01 空底板+遮罩擋踩+前景物件各自深度排序；玩家/NPC 走路走到門進店）
            base: 'city/city_layers/city_floor_frame_day01.webp',      // day01 空底板：只有地面+外圈樹框（建築/噴泉/中庭樹全拆成前景物件，才能走它們後面）
            mask: 'city/city_layers/city_floor_frame_day02_mask.png',  // 碰撞遮罩：白=可走、黑=建築/噴泉/花台/長椅擋住（day02_mask 對齊）
            forceDay: true,    // 🌤 暫時鎖白天；拿掉這行即恢復日夜（夜版素材要另傳）
            cfgKey: 'lobby_stage_layout_city_v5',   // v5=day01+前景物件深度排序；舊版存檔整組作廢
            outdoor: true,     // 戶外：小人跟鏡頭脫鉤=固定螢幕尺寸俯視小棋子
            // 前景物件＝從 upper01/02/03 拆出的獨立元素（書咖/交易所/噴泉/樹/燈柱/長椅）；bbox 即座標。
            //   noCollide=不進碰撞(碰撞全走遮罩)；靠 z=2+(y+h) 深度排序＝腳y比它低走前面、比它高走後面。
            layout: [
                { file: 'city/city_layers/fg/fg01.webp', x: 144, y: 41, w: 404, h: 283, noCollide: true },   // 書咖
                { file: 'city/city_layers/fg/fg02.webp', x: 971, y: 313, w: 436, h: 309, noCollide: true },   // 交易所
                { file: 'city/city_layers/fg/fg03.webp', x: 589, y: 155, w: 54, h: 132, noCollide: true },
                { file: 'city/city_layers/fg/fg04.webp', x: 894, y: 155, w: 56, h: 130, noCollide: true },
                { file: 'city/city_layers/fg/fg05.webp', x: 954, y: 167, w: 32, h: 61, noCollide: true },
                { file: 'city/city_layers/fg/fg06.webp', x: 465, y: 307, w: 132, h: 78, noCollide: true },
                { file: 'city/city_layers/fg/fg07.webp', x: 703, y: 318, w: 142, h: 186, noCollide: true },   // 中央噴泉
                { file: 'city/city_layers/fg/fg08.webp', x: 412, y: 487, w: 125, h: 75, noCollide: true },
                { file: 'city/city_layers/fg/fg09.webp', x: 1097, y: 514, w: 38, h: 108, noCollide: true },
                { file: 'city/city_layers/fg/fg10.webp', x: 1269, y: 514, w: 38, h: 108, noCollide: true },
                { file: 'city/city_layers/fg/fg11.webp', x: 988, y: 606, w: 84, h: 49, noCollide: true },
                { file: 'city/city_layers/fg/fg12.webp', x: 1302, y: 606, w: 84, h: 49, noCollide: true },
                { file: 'city/city_layers/fg/fg13.webp', x: 842, y: 790, w: 33, h: 66, noCollide: true },
                { file: 'city/city_layers/fg/fg14.webp', x: 477, y: 77, w: 81, h: 35, noCollide: true },
                { file: 'city/city_layers/fg/fg15.webp', x: 949, y: 319, w: 132, h: 86, noCollide: true },
            ],
            points: {
                npcZone: { x: 400, y: 540, w: 600, h: 210 },   // 中央廣場（客人出沒區；避開建築/噴泉，都在遮罩白區）
                player: { x: 768, y: 620 },
                arrive: { x: 768, y: 580 },   // 從書咖/大廳出來的落點（廣場中央）
                actorScale: 0.32,             // 🗺️ 地圖俯視小棋子（脫鉤鏡頭後≈螢幕高比例）
            },
            walls: [],   // 碰撞全走手繪遮罩
            doors: [
                { x: 335, y: 316, w: 100, h: 42, to: 'cafe', spawn: { x: 780, y: 868 } },   // 書咖門口→瀅瀅書咖（走到門口下方觸發）
                { x: 1150, y: 600, w: 90, h: 40, to: 'hall', spawn: { x: 772, y: 830 } },   // 交易所門口→愛麗絲大廳
            ],
        },
    };
    // 🌗 城市日夜：跟大廳 BG 同時段律（ambient.js：6-18=day）；場景有 nightBase 才生效
    function _isNightNow() {
        const h = new Date().getHours();
        return !(h >= 6 && h < 18);
    }
    // 場景實際是否夜間：帶 forceDay 的場景永遠白天（不跟時間走）
    function _sceneIsNight(SC) {
        return !!(SC && !SC.forceDay && _isNightNow());
    }
    function _sceneBase(SC) {
        return (SC.nightBase && _sceneIsNight(SC)) ? SC.nightBase : SC.base;
    }
    // 物件有效尺寸（s=個別縮放，預設1；佔地跟著縮）
    // footW=佔地寬(未縮放，預設=全寬)；佔地框水平置中（treats 上寬下窄的懸浮物）
    function effDims(o) {
        const s = o.s || 1;
        return {
            ew: Math.round(o.w * s), eh: Math.round(o.h * s),
            ef: Math.round((o.footH || 0) * s),
            efw: Math.round((o.footW != null ? o.footW : o.w) * s),
        };
    }
    // 佔地框＝物件底部那條「地面帶」：全寬(或 footW)、高 footH、底部對齊、水平置中。
    //   一般家具＝這塊矩形直接當碰撞；alphaFoot 場景(大地圖)＝這塊只當「切線高度」，實際擋路形狀交給圖片 alpha。
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
        let layout = (SC.layout || []).map(o => Object.assign({}, o));
        const points = JSON.parse(JSON.stringify(SC.points || {}));
        const doors = (SC.doors || []).map(d => Object.assign({}, d));   // 靜態地圖沒 doors→給空陣列，別讓 undefined.map 炸掉整個掛載
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
                // doorsV 版本閘：場景門的「去向/配置」改版後，舊存檔的門座標整組作廢（防蓋到新門上）
                if (Array.isArray(saved.doors) && (saved.doorsV || 1) === (SC.doorsV || 1)) saved.doors.forEach((sd, i) => {
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
    let _lpSuppressClick = false;   // 長按開選單後，抑制隨之而來的那次 click（免點擊移動誤觸）

    function isOn() { try { return localStorage.getItem('lobby_stage_on') !== '0'; } catch (e) { return true; } }

    // ── 碰撞（優先序：手繪遮罩 > 鋼索/牆矩形；家具腳印/alpha 形狀永遠有效）──
    let BLOCKS = [];          // 矩形腳印（一般家具）
    let ALPHA_BLOCKS = [];    // alpha 形狀擋路（大地圖建築：照圖形狀，只擋 footRect 底帶）
    function rebuildBlocks() {
        const maskOk = !!(S.mask && S.mask.ok);
        const alpha = !!SCENES[S.scene].alphaFoot;
        const feet = alpha ? [] : CFG.layout.filter(o => !o.noCollide).map(footRect);   // alphaFoot 不用腳印；noCollide 物件(城市前景)不擋路→碰撞全走遮罩
        BLOCKS = (maskOk ? [] : (SCENES[S.scene].walls || [])).concat(feet);   // 靜態地圖沒 walls→空陣列，別 undefined.concat 炸掉掛載
        ALPHA_BLOCKS = alpha ? CFG.layout.filter(o => o._alpha) : [];   // 只納入已載好 alpha 的物件
    }
    // alpha 形狀擋路：腳點落在物件圖片「不透明像素(alpha≥128)」上=牆＝整棟照剪影實心擋
    //   (門面樓的上半就是屋身，不是空地，所以不做切線；要走屋後另議)。
    function _alphaHit(o, x, y) {
        const a = o._alpha, s = o.s || 1;
        const lx = (x - o.x) / s, ly = (y - o.y) / s;   // 物件未縮放局部座標(0..w,0..h)
        if (lx < 0 || lx >= o.w || ly < 0 || ly >= o.h) return false;
        const ax = Math.min(a.w - 1, Math.floor(lx / o.w * a.w));
        const ay = Math.min(a.h - 1, Math.floor(ly / o.h * a.h));
        return a.data[ay * a.w + ax] >= 128;
    }
    // 從已載好的物件 <img> 抽 alpha 通道存降採樣點陣（o._alpha={w,h,data}）；載好後重建碰撞。
    //   只留 alpha 一個 byte、200px 上限省記憶體；編輯中順便刷新剪影。
    function _extractObjAlpha(o, imgEl) {
        try {
            const nw = imgEl.naturalWidth || o.w, nh = imgEl.naturalHeight || o.h;
            const k = Math.min(1, 200 / Math.max(nw, nh));
            const aw = Math.max(1, Math.round(nw * k)), ah = Math.max(1, Math.round(nh * k));
            const cv = document.createElement('canvas');
            cv.width = aw; cv.height = ah;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(imgEl, 0, 0, aw, ah);
            const px = ctx.getImageData(0, 0, aw, ah).data;
            const data = new Uint8Array(aw * ah);
            let opaque = 0;
            for (let i = 0; i < aw * ah; i++) { data[i] = px[i * 4 + 3]; if (data[i] >= 128) opaque++; }
            o._alpha = { w: aw, h: ah, data };
            rebuildBlocks();
            if (S.edit) { try { window.LobbyEditor?.syncFeet?.(); } catch (e) {} }   // 編輯中→刷新剪影
            console.log('[LobbyStage] 物件 alpha OK', o.file || o.url, aw + 'x' + ah, '不透明像素', opaque);
        } catch (e) { console.warn('[LobbyStage] 物件 alpha 讀取失敗(CORS?)', o.file || o.url, e); }
    }
    // 手繪碰撞遮罩：白=可走、黑=不可走（<128 判黑）；jsdelivr 有 CORS 頭、canvas 可讀
    async function loadMask() {
        S.mask = null;
        S.maskFailed = false;   // 重置：載入前先當「載入中」→blocked 空窗期全擋（防穿牆）
        const ovSrc = await resolveRef(CFG.maskOverride);   // 建構模式「換遮罩」優先
        const file = SCENES[S.scene].mask;
        const src = ovSrc || (file ? CDN + file : null);
        if (!src) { S.maskFailed = true; return; }   // 場景本來就沒遮罩→解除空窗期全擋
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
            } catch (e) { S.maskFailed = true; console.warn('[LobbyStage] 遮罩讀取失敗(退回鋼索/放行移動)', e); }
        };
        img.onerror = () => { S.maskFailed = true; console.warn('[LobbyStage] 遮罩下載失敗(放行移動)', src); };
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
        // 🚨 宣告了遮罩但還沒載好（jsdelivr 非同步抓圖的空窗期）→ 先全擋，防止「一進場立刻走就穿牆」；載入失敗(maskFailed)才放行免永久凍住
        if (SCENES[S.scene] && SCENES[S.scene].mask && !(S.mask && S.mask.ok)) return !S.maskFailed;
        if (S.mask && S.mask.ok) {
            // 手繪遮罩：腳點像素亮度 <128 = 不可走（取 R 通道即可，遮罩是黑白圖）
            const mi = ((Math.round(y) * MAP_W) + Math.round(x)) * 4;
            if (S.mask.data[mi] < 128) return true;
        } else {
            const P = CFG?.points?.boundary;
            if (P && P.length >= 3 && !insidePoly(P, x, y)) return true;   // 鋼索圈外=牆（遮罩沒載時的退路）
        }
        if (BLOCKS.some(B => l < B.x + B.w && r > B.x && t < B.y + B.h && b > B.y)) return true;
        for (let i = 0; i < ALPHA_BLOCKS.length; i++) if (_alphaHit(ALPHA_BLOCKS[i], x, y)) return true;
        return false;
    }

    // ── 角色（玩家/NPC 共用）────────────────────────────
    // src=字串→單張立姿圖；src={sheet:url}→3×4走路圖(真走路動畫,四方向)
    // 🗺️ 地圖場景(outdoor)的小人跟鏡頭 cover 縮放脫鉤：不管鏡頭把底圖放大幾倍，人都固定螢幕尺寸
    //    (俯視棋子；桌機/手機/橫豎屏一致)。室內房間維持原樣=跟著 cover 放大一起填滿畫面。
    function _actorScale() {
        let s = CFG.points.actorScale || 1;
        if (SCENES[S.scene] && SCENES[S.scene].outdoor && S.scale > 0 && isFinite(S.scale)) s = s / S.scale;
        return s;
    }
    function spawnActor(src, x, y, h) {
        const isSheet = (typeof src === 'object' && src && src.sheet);
        const el = document.createElement(isSheet ? 'div' : 'img');
        // lstage-loading=先藏著，圖真的載好才顯示（防轉場時預設單圖閃一下才換成走路圖）
        el.className = 'lstage-actor' + (isSheet ? ' lstage-sheet' : '') + ' lstage-loading';
        const a = { x, y, baseH: h, h: Math.round(h * _actorScale()), el, walking: false, flip: false };
        if (isSheet) {
            a.sheet = true; a.dir = 0; a.frame = 1; a.animT = 0;
            el.style.backgroundImage = 'url("' + src.sheet + '")';
            const probe = new Image();
            probe.onload = () => { a.frameW = probe.naturalWidth / 3; a.frameH = probe.naturalHeight / 4; placeActor(a); a.el.classList.remove('lstage-loading'); };
            probe.src = src.sheet;
        } else {
            el.src = src;
            el.style.height = a.h + 'px';
            // 有皮膚(3x4)待換的話先別顯示這張預設單圖，等 _swapActorSrc 換好才顯示
            el.addEventListener('load', () => { placeActor(a); if (!a._skinPending) a.el.classList.remove('lstage-loading'); }, { once: true });
        }
        S.world.appendChild(el);
        placeActor(a);
        return a;
    }
    // 人物整體縮放即時套用（擺設模式「人物−/＋」用）
    function applyActorScale() {
        const s = _actorScale();
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
    //   定位走 transform 不走 left/top——left/top 逐幀寫入會反覆弄髒版面樹，桌機聊天 DOM 肥時走路掉幀。
    //   走路圖角色沒有 CSS transform 動畫（.lstage-sheet 的 walking/flip 都關掉了），inline transform 不會打架；
    //   單張立姿角色(placeActor)的彈跳/翻面 keyframes 吃 transform，所以維持 left/top 別搬。
    function placeSheetActor(a) {
        const ratio = (a.frameW && a.frameH) ? a.frameW / a.frameH : 0.8;
        const w = a.h * ratio;
        const left = a.x - w / 2, top = a.y - a.h, z = 2 + Math.round(a.y);
        const tf = 'translate3d(' + left + 'px,' + top + 'px,0)';
        if (a._tf !== tf) { a.el.style.transform = tf; a._tf = tf; }
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
        el.className = 'lstage-actor' + (isSheet ? ' lstage-sheet' : '') + ' lstage-loading';   // 換好的圖載入才顯示
        a.sheet = isSheet; a.dir = 0; a.frame = 1; a.animT = 0;
        a.frameW = a.frameH = null;
        a._left = a._top = a._z = a._bg = a._tf = null; a._sizedH = a._sizedW = null; a._walking = a._flipC = null;
        if (isSheet) {
            el.style.backgroundImage = 'url("' + src.sheet + '")';
            const probe = new Image();
            probe.onload = () => { a.frameW = probe.naturalWidth / 3; a.frameH = probe.naturalHeight / 4; placeActor(a); a.el.classList.remove('lstage-loading'); };
            probe.src = src.sheet;
        } else {
            el.src = src;
            el.style.height = a.h + 'px';
            el.addEventListener('load', () => { placeActor(a); a.el.classList.remove('lstage-loading'); }, { once: true });
        }
        a.el.replaceWith(el);
        a.el = el;
        a._skinPending = false;
        placeActor(a);
    }
    async function _applySkin(a, key) {
        const skin = _skins()[key];
        if (!skin) return;
        const src = await resolveRef(skin.ref);
        if (!src || !a.el || !S.active) {   // 皮膚換不成→把先藏起來的預設圖還原顯示，別讓角色隱形
            if (a) a._skinPending = false;
            if (a && a.el) a.el.classList.remove('lstage-loading');
            return;
        }
        // ⚠️ 皮膚只管大廳小人外觀，不碰 a.portrait——對話立繪另有來源(固定NPC自帶/訪客avatar_cache頭像/裝扮室「生成立繪」的sprite_cache)，兩者是不同東西(Rae定案 2026-07-17)
        //   舊 skin 可能殘留 asPortrait 旗標(已退役)，一律忽略。
        _swapActorSrc(a, skin.kind === 'sheet' ? { sheet: src } : src);
    }

    // 👗 右鍵角色選單/裝扮室/對話紀錄窗/內建生成 → 拆到 lobby_dress.js（走 _b 橋；2026-07-16）

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
        if (_skins()['player']) S.player._skinPending = true;   // 玩家有自訂皮膚→預設圖先藏著(免閃)
        _applySkin(S.player, 'player');
        S.onKey = (e) => {
            const tag = (document.activeElement?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;
            const k = e.key.toLowerCase();
            // 🎮 對話快捷鍵：走近 NPC 按 E/F 開聊；對話中按 E/F/Esc 收起（省得每次點 ✖）。不做「移動自動關」避免誤觸。
            if (e.type === 'keydown' && (k === 'e' || k === 'f' || k === 'escape')) {
                if (S.talkTarget) { endTalk(); e.preventDefault(); e.stopPropagation(); return; }
                if (k !== 'escape' && S.player && !S.edit) {
                    let best = null, bestD = INTERACT_R;
                    for (const n of S.npcs) {
                        if (!n.hint) continue;
                        const d = Math.hypot(n.x - S.player.x, n.y - S.player.y);
                        if (d < bestD) { bestD = d; best = n; }
                    }
                    if (best) { startTalk(best); e.preventDefault(); e.stopPropagation(); return; }
                }
            }
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
            if (_lpSuppressClick) { _lpSuppressClick = false; return; }   // 長按剛開過選單→吃掉這次 click
            if (S.talkTarget) { endTalk(); return; }
            hideDialog();   // 點空地=收起跟瀅瀅的對話框
            const r = S.world.getBoundingClientRect();
            S.player.dest = { x: (e.clientX - r.left) / S.scale, y: (e.clientY - r.top) / S.scale };
        });
    }

    // ── NPC ──────────────────────────────────────────────
    const NPC_H = 180, INTERACT_R = 130;

    // 🧑‍🤝‍🧑 NPC 生成/名冊（愛麗絲/柴郡/瀅瀅駐點、SN名冊雷伊丹、日誌客人池＋訪客頭像掛載）→ 拆到 lobby_npcs.js（走 _b 橋；2026-07-16）
    function addNpc(cfg) {
        const a = spawnActor(cfg.src, cfg.x, cfg.y, cfg.h || NPC_H);
        const keepH = a.h;   // spawnActor 已套 actorScale，別讓 cfg.h(未縮放) 蓋回去
        const npc = Object.assign(a, cfg, { h: keepH, wanderT: 1500 + Math.random() * 3000, dest: null, defaultSrc: cfg.src });
        if (_skins()[cfg.key]) npc._skinPending = true;   // 有自訂皮膚→預設圖先藏著，等 _applySkin 換好才顯示(免閃)
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
            if (n._theaterFrozen) return;   // 🎭 小劇場：凍結當事 NPC 的漫步/跟隨/面向，維持面對面
            if (n.facePlayer && S.player) {   // 愛麗絲永遠面向玩家
                if (n.sheet) n.dir = S.player.x < n.x ? 1 : 2;
                else n.flip = S.player.x > n.x;   // 原圖朝左：玩家在右側才鏡像成朝右
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
                        } else if (vx) n.flip = vx > 0;   // 原圖朝左：往右走才鏡像
                    }
                } else { n.walking = false; if (n.sheet) { n.frame = 1; n.animT = 0; } }
                n.dest = null;
                placeActor(n); placeNpcExtras(n); _npcNearCheck(n);
                return;
            }
            if (S.talkTarget === n) {   // 💬 對話中：轉頭面向玩家（RPG 感）；走路圖設 dir、單張設 flip
                n.walking = false;
                if (S.player) {
                    const vx = S.player.x - n.x, vy = S.player.y - n.y;
                    if (n.sheet) { n.dir = Math.abs(vx) >= Math.abs(vy) ? (vx < 0 ? 1 : 2) : (vy < 0 ? 3 : 0); n.frame = 1; n.animT = 0; }
                    else if (vx) n.flip = vx > 0;   // 原圖朝左：玩家在右才鏡像
                }
                placeActor(n); placeNpcExtras(n); _npcNearCheck(n); return;
            }
            if (n.noWander) { n.walking = false; placeActor(n); placeNpcExtras(n); _npcNearCheck(n); return; }
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
                        } else if (vx) n.flip = vx > 0;   // 原圖朝左：往右走才鏡像
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
    // 覆寫整條歷史（歷史窗編輯/刪除/回退用）
    function setNpcHistory(key, arr) {
        try { localStorage.setItem('lstage_hist_' + key, JSON.stringify(Array.isArray(arr) ? arr : [])); } catch (e) {}
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
        // 走路圖角色的el是div沒有src → 立繪用 portrait 欄位或退回預設字串圖。最終保底=中性剪影(非瀅瀅)。
        const t = S.talkTarget;
        p.src = t ? (t.portrait || t.el.src || (typeof t.defaultSrc === 'string' ? t.defaultSrc : ASSET.mcM))
              : (S.scene === 'hall' ? ASSET.alice : (S.scene === 'room404' ? ASSET.cheshire : ASSET.ying));
        // 擺放種類：guest 從 avatar_cache 撈到的是「頭像(半身)」→ 浮框；其餘(名冊手繪立繪/剪影/走路圖)= 立繪(貼底)。
        //   portraitKind='avatar' 只在 lobby_npcs.js 掛訪客頭像成功設 portrait 時標；portrait 是 || 第一順位，標了顯示的就是它。
        p.classList.toggle('is-avatar', !!(t && t.portraitKind === 'avatar' && t.portrait));
        // ✖ 關閉鈕（掛在對話框右上角；點空地也能關，這顆是給直覺用的）
        const box = document.getElementById('iris-dialogue-box');
        if (box && !box.querySelector('.lstage-dlg-close')) {
            const btn = document.createElement('button');
            btn.className = 'lstage-dlg-close';
            btn.innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket"></i> 離開';
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
        if (S.theater && (npc === S.theater.a || npc === S.theater.b)) window.LobbyTheater?.end();   // 🎭 跟配對當事人開聊→收掉配對（清泡泡+解凍）免凍結卡死；跟旁人聊不打斷等待中的小劇場
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
        window.VoidTerminal?.primeStageDialog?.(npc);   // 清掉殘留(瀅瀅預設/上一位)、改顯示這位自己的最後一句
    }
    function endTalk() {
        if (!S.talkTarget) return;
        const t = S.talkTarget;
        S.talkTarget = null;
        // 對話結束→NPC 轉回正面（朝下）；facePlayer 的(愛麗絲)下一幀會自己再面向玩家，不影響
        if (t) {
            if (t.sheet) { t.dir = 0; t.frame = 1; t.animT = 0; } else { t.flip = false; }
            if (t.el) placeActor(t);
        }
        _applySceneHeader();
        hideDialog();
    }
    // 場景預設門面：書咖=瀅瀅、大廳=愛麗絲、404=柴郡（場景牌/名牌/輸入框提示跟著場景走）
    const SCENE_HEADER = {
        cafe:    { name: '瀅瀅',   badge: '視差書咖', ph: '提供故事素材或與瀅瀅對話...' },
        hall:    { name: '愛麗絲', badge: '純白大廳', ph: '與愛麗絲對話，或走向大門出去街區...' },
        room404: { name: '柴郡',   badge: '404號房',  ph: '對404號房的看守者說話，或走底部出口離開...' },
        city:    { name: '街區',   badge: '視差城市', ph: '在街區走走、點路人聊聊，或走進書咖／純白大廳...' },
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
    // 容器尺寸只在 fitCamera 讀（resize/ResizeObserver 觸發），RAF 內用快取——
    // 每幀讀 clientWidth 是強制同步重排點，桌機聊天 DOM 肥時整條重排被拖著跑=走路卡卡的主因。
    function fitCamera() {
        if (!S.root) return;
        const vw = S.root.clientWidth, vh = S.root.clientHeight;
        if (!vw || !vh) return;
        S._vw = vw; S._vh = vh;
        // 建構模式：contain*0.9(留黑邊好抓邊角)；靜態點擊地圖：contain(整張置中看完)；一般遊玩：cover 填滿螢幕跟人跑
        const SC = SCENES[S.scene];
        S.scale = S.edit ? Math.min(vw / MAP_W, vh / MAP_H) * 0.9
            : (SC && SC.staticMap) ? Math.min(vw / MAP_W, vh / MAP_H)
            : Math.max(vw / MAP_W, vh / MAP_H);
        S._camX = S._camY = null;   // 縮放變了→強制重寫 transform（applyCamera 有快取）
        applyCamera();
        // 🗺️ 地圖場景小人跟鏡頭脫鉤：cover 縮放一變(resize/旋轉/全屏)就把固定螢幕尺寸重算一次
        if (SCENES[S.scene] && SCENES[S.scene].outdoor) applyActorScale();
    }
    function applyCamera() {
        if (!S.root) return;
        const vw = S._vw, vh = S._vh;
        if (!vw || !vh) return;
        const focus = S.edit ? S.edit.cam : (S.player ? { x: S.player.x, y: S.player.y } : { x: MAP_W / 2, y: MAP_H / 2 });
        // 底部對話框會蓋住下緣 → 跟隨模式把焦點擺在畫面偏上(38%)，人不會躲進對話框後面
        const focusRatio = S.edit ? 0.5 : 0.38;
        let cx = focus.x * S.scale - vw / 2, cy = focus.y * S.scale - vh * focusRatio;
        const rangeX = MAP_W * S.scale - vw, rangeY = MAP_H * S.scale - vh;
        if (SCENES[S.scene] && SCENES[S.scene].staticMap) {
            cx = rangeX / 2; cy = rangeY / 2;   // 靜態地圖：整張置中（contain 時 range 為負→自動 letterbox 置中）
        } else if (S.edit) {
            // 建構模式：允許超出邊界平移（看到外圈黑邊、把被面板擋住的角落拖出來）
            const overX = vw * 0.6, overY = vh * 0.6;
            cx = Math.max(Math.min(0, rangeX) - overX, Math.min(Math.max(0, rangeX) + overX, cx));
            cy = Math.max(Math.min(0, rangeY) - overY, Math.min(Math.max(0, rangeY) + overY, cy));
        } else {
            cx = Math.max(0, Math.min(rangeX, cx));
            cy = Math.max(0, Math.min(rangeY, cy));
        }
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
        if (p && !S.talkTarget && !S.transitioning) {   // 過場期間凍結移動（防搖桿殘留方向在換場瞬間繼續推）
            let dx = 0, dy = 0;
            if (S.keys['arrowleft'] || S.keys['a']) dx -= 1;
            if (S.keys['arrowright'] || S.keys['d']) dx += 1;
            if (S.keys['arrowup'] || S.keys['w']) dy -= 1;
            if (S.keys['arrowdown'] || S.keys['s']) dy += 1;
            if (S.joy && (S.joy.x || S.joy.y)) { dx = S.joy.x; dy = S.joy.y; }   // 🕹️ 虛擬搖桿（手機）：方向覆蓋鍵盤/點擊
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
                } else if (dx !== 0) p.flip = dx > 0;   // 原圖朝左：往右走才鏡像
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
            // 門帶 spawn={x,y} 就落在指定點（每扇門各自的門口）；沒帶才用目標場景的「落」圓點
            S.spawnOverride = spawn || ((spawnMode === 'player') ? null : 'arrive');
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

    // 🕹️ 手機虛擬搖桿：左下角圓盤拖動→餵 S.joy 方向向量（給 update 當 dx/dy）。只在觸控裝置建立。
    function _setupJoystick(root) {
        try { if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return; } catch (e) { return; }
        const base = document.createElement('div');
        base.className = 'lstage-joy';
        const knob = document.createElement('div');
        knob.className = 'lstage-joy-knob';
        base.appendChild(knob);
        root.appendChild(base);
        const R = 46, DEAD = 8;   // R=拉桿半徑；DEAD=死區(px)
        let active = false, cx = 0, cy = 0;
        const setKnob = (x, y) => { knob.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
        const onDown = (e) => {
            active = true;
            try { base.setPointerCapture(e.pointerId); } catch (_) {}
            const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
            onMove(e);
        };
        const onMove = (e) => {
            if (!active || !base.isConnected) return;   // 換場銷毀舊搖桿後，殘留 capture 的 move 別再寫 S.joy（防換場後卡方向飄移）
            let dx = e.clientX - cx, dy = e.clientY - cy;
            const d = Math.hypot(dx, dy);
            if (d > R) { dx = dx / d * R; dy = dy / d * R; }
            setKnob(dx, dy);
            S.joy = (Math.hypot(dx, dy) < DEAD) ? null : { x: dx / R, y: dy / R };
            e.preventDefault();
        };
        const onUp = () => { active = false; S.joy = null; setKnob(0, 0); };
        base.addEventListener('pointerdown', onDown);
        base.addEventListener('pointermove', onMove);
        base.addEventListener('pointerup', onUp);
        base.addEventListener('pointercancel', onUp);
    }

    // ── ⚙️ 大廳設置小面板（舞台上，仿裝扮室）──
    function _closeLobbySettings() { S.setEl?.remove(); S.setEl = null; }
    function _openLobbySettings() {
        _closeWins();
        const useLore = localStorage.getItem('lobby_worldview_use_lorebook') === '1';
        const seeStory = localStorage.getItem('lobby_npc_see_current_story') === '1';
        const box = document.createElement('div');
        box.className = 'lstage-dress lstage-settings';
        const P = window.OS_PROMPTS || {};
        // 第一層清單定義：名稱 / 副標 / FA 圖標 / load / save
        const EDITS = [
            { id:'iris',  name:'瀅瀅（店長）',    sub:'視差書咖駐店小說家', icon:'fa-book',           load:P.loadIris,    save:P.saveIris },
            { id:'chess', name:'柴郡（404）',     sub:'404 號房管理員',     icon:'fa-cat',            load:P.loadCheshire, save:P.saveCheshire },
            { id:'alice', name:'愛麗絲（導覽官）', sub:'純白大廳首席導覽',   icon:'fa-user-astronaut', load:P.loadAlice,   save:P.saveAlice },
            { id:'world', name:'奧瑞亞世界觀',    sub:'主世界觀補充設定',   icon:'fa-globe',          load:P.loadWorld,   save:P.saveWorld },
        ];

        function renderList() {
            box.innerHTML =
                '<div class="lsd-title"><i class="fa-solid fa-gear"></i> 大廳設置</div>' +
                '<div class="lset-section-label">人設 / 世界觀</div>' +
                '<div class="lset-list">' +
                EDITS.map(e =>
                    '<button class="lset-item" data-edit="' + e.id + '">' +
                      '<i class="fa-solid ' + e.icon + ' lset-item-ic"></i>' +
                      '<span class="lset-item-tx"><span class="lset-item-name">' + e.name + '</span>' +
                      '<span class="lset-item-sub">' + e.sub + '</span></span>' +
                      '<i class="fa-solid fa-chevron-right lset-item-arrow"></i>' +
                    '</button>').join('') +
                '</div>' +
                '<div class="lset-section-label">選項</div>' +
                '<label class="lset-row"><span class="lset-tx">讀取角色卡世界書</span>' +
                  '<input type="checkbox" class="lset-chk" data-k="lore"' + (useLore ? ' checked' : '') + '></label>' +
                '<div class="lset-hint">預設用大總結摘要的世界觀。勾選＝改讀角色卡的完整世界書（含角色之間的橫向關係，大總結不會寫）。</div>' +
                '<label class="lset-row"><span class="lset-tx">大廳 NPC 看你當前劇情</span>' +
                  '<input type="checkbox" class="lset-chk" data-k="story"' + (seeStory ? ' checked' : '') + '></label>' +
                '<div class="lset-hint">預設關（各書隔離）。勾選＝NPC 會知道你在別的故事裡的近況，可能跨書吐槽你 XD。</div>' +
                '<label class="lset-row"><span class="lset-tx">NPC 小劇場</span>' +
                  '<input type="checkbox" class="lset-chk" data-k="theater"' + (localStorage.getItem('lobby_theater_on') !== '0' ? ' checked' : '') + '></label>' +
                '<div class="lset-hint">兩個 NPC 偶爾會湊在一起聊天，點頭頂泡泡或右上「小劇場」可以偷聽。</div>' +
                '<div class="lset-row"><span class="lset-tx">出現頻率</span>' +
                  '<span class="ltheater-freq' + (localStorage.getItem('lobby_theater_on') === '0' ? ' off' : '') + '">' +
                    ['low:低','mid:中','high:高'].map(o => { const v=o.split(':')[0], t=o.split(':')[1]; const cur=localStorage.getItem('lobby_theater_freq')||'mid'; return '<button class="ltheater-freq-btn'+(cur===v?' on':'')+'" data-freq="'+v+'">'+t+'</button>'; }).join('') +
                  '</span></div>' +
                '<button class="lep-btn lep-done" data-act="close"><i class="fa-solid fa-check"></i> 關閉</button>';
            box.querySelectorAll('.lset-chk').forEach(chk => chk.addEventListener('change', (e) => {
                const k = e.target.dataset.k;
                if (k === 'lore') {
                    try { localStorage.setItem('lobby_worldview_use_lorebook', e.target.checked ? '1' : '0'); } catch (_) {}
                    _closeLobbySettings();
                    unmount(); tryMount();
                } else if (k === 'story') {
                    try { localStorage.setItem('lobby_npc_see_current_story', e.target.checked ? '1' : '0'); } catch (_) {}
                } else if (k === 'theater') {
                    try { localStorage.setItem('lobby_theater_on', e.target.checked ? '1' : '0'); } catch (_) {}
                    const fr = box.querySelector('.ltheater-freq'); if (fr) fr.classList.toggle('off', !e.target.checked);
                }
            }));
            box.querySelectorAll('.ltheater-freq-btn').forEach(btn => btn.addEventListener('click', () => {
                try { localStorage.setItem('lobby_theater_freq', btn.dataset.freq); } catch (_) {}
                box.querySelectorAll('.ltheater-freq-btn').forEach(b => b.classList.toggle('on', b === btn));
            }));
            box.querySelectorAll('.lset-item').forEach(btn => btn.addEventListener('click', () => {
                const e = EDITS.find(x => x.id === btn.dataset.edit);
                if (e) renderEditor(e);
            }));
        }

        function renderEditor(e) {
            const cur = (e.load && e.load()) || '';
            box.innerHTML =
                '<div class="lsd-title lset-editor-title">' +
                  '<button class="lset-back" data-act="back"><i class="fa-solid fa-chevron-left"></i></button>' +
                  '<span><i class="fa-solid ' + e.icon + '"></i> ' + e.name + '</span>' +
                '</div>' +
                '<div class="lset-hint">' + e.sub + '。留空則不注入補充。</div>' +
                '<textarea class="lset-ta" placeholder="在這裡補充設定，會疊加在內建世界觀/人設之後..."></textarea>' +
                '<button class="lep-btn lep-done" data-act="save"><i class="fa-solid fa-floppy-disk"></i> 保存</button>';
            const ta = box.querySelector('.lset-ta');
            ta.value = cur;
            box.querySelector('[data-act="back"]').addEventListener('click', renderList);
            box.querySelector('[data-act="save"]').addEventListener('click', function () {
                if (e.save) e.save(ta.value);
                const btn = this;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> 已保存';
                btn.classList.add('lset-saved');
                setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 保存'; btn.classList.remove('lset-saved'); }, 1200);
            });
        }

        renderList();
        S.root.appendChild(box);
        S.setEl = box;
        box.addEventListener('click', (e) => { if (e.target.closest('[data-act="close"]')) _closeLobbySettings(); });
    }

    // 🍔 舞台全屏：漢堡隱藏 MAIN MENU（.lobby-right）→ 舞台吃滿；狀態存 localStorage
    function _applyMenuHidden() {
        let hidden = false;
        try { hidden = localStorage.getItem('lobby_stage_menu_hidden') === '1'; } catch (e) {}
        document.querySelector('.lobby-body')?.classList.toggle('stage-menu-hidden', hidden);
        document.querySelector('.lstage-menu-btn')?.classList.toggle('active', hidden);
    }

    // ── 掛載/卸載 ─────────────────────────────────────────
    function tryMount() {
        const left = document.querySelector('.lobby-left');
        if (!left || S.active || !isOn()) return;
        CFG = _loadCfg(); rebuildBlocks(); loadMask();
        const isStatic = !!SCENES[S.scene].staticMap;   // 🗺️ 靜態點擊地圖（大地圖）：不生小人/不走路/不碰撞
        const root = document.createElement('div');
        root.className = 'lstage-root';
        root.innerHTML = '<div class="lstage-world">' +
            '<img class="lstage-map" src="' + CDN + _sceneBase(SCENES[S.scene]) + '" width="' + MAP_W + '" height="' + MAP_H + '">' +
            '<div class="lstage-click"></div></div>' +
            '<button class="lstage-set-btn" title="大廳設置"><i class="fa-solid fa-gear"></i></button>' +
            '<button class="lstage-menu-btn" title="隱藏選單／舞台全屏"><i class="fa-solid fa-bars"></i></button>' +
            '<button class="lstage-edit-btn" title="擺設模式"><i class="fa-solid fa-pen-ruler"></i></button>' +
            '<button class="lstage-theater-btn" title="小劇場"><i class="fa-solid fa-clapperboard"></i><span class="ltb-tx">小劇場</span><span class="ltb-badge"></span></button>' +
            // 🏙 出門上街：只在書咖/大廳出現（404 要走還原流程、城裡本來就在街上）
            ((S.scene === 'cafe' || S.scene === 'hall') ? '<button class="lstage-city-btn" title="到視差城市街區"><i class="fa-solid fa-city"></i></button>' : '');
        left.appendChild(root);
        _applyMenuHidden();   // 套用上次「舞台全屏（隱藏 MAIN MENU）」狀態
        if (S._theaterTimer) clearInterval(S._theaterTimer);
        S._theaterTimer = setInterval(() => window.LobbyTheater?.tick(), 15000);   // 🎭 小劇場輪詢（實作在 lobby_theater.js）
        root.querySelector('.lstage-menu-btn').addEventListener('click', () => {
            const on = localStorage.getItem('lobby_stage_menu_hidden') === '1';
            try { localStorage.setItem('lobby_stage_menu_hidden', on ? '0' : '1'); } catch (e) {}
            _applyMenuHidden();
        });
        root.querySelector('.lstage-set-btn').addEventListener('click', () => _openLobbySettings());
        // 🎬 小劇場窗口：有未查看的配對→開「正在對話」，否則直接看「回顧」
        root.querySelector('.lstage-theater-btn').addEventListener('click', () => window.LobbyTheater?.openWin(S.theater && !S.theater.playing ? 'live' : 'review'));
        root.querySelector('.lstage-city-btn')?.addEventListener('click', () => goScene('city'));   // 🏙 出門上街（跟過門同一條白光過場）
        left.classList.add('lstage-on', 'lstage-dlg-hidden');   // 對話框預設收起，開聊才浮出
        // 💬 聊天符號（自由漫遊時的浮鈕）：點了浮出「對話框＋輸入框」一組
        const fab = document.createElement('button');
        fab.className = 'lstage-chat-fab';
        fab.title = '開啟對話';
        fab.innerHTML = '<i class="fa-solid fa-comment-dots"></i>';
        fab.addEventListener('click', (e) => { e.stopPropagation(); showDialog(); });
        left.appendChild(fab);
        if (!isStatic) _setupJoystick(root);   // 🕹️ 手機左下角虛擬搖桿（靜態地圖沒走路→不需要）
        S.root = root; S.world = root.querySelector('.lstage-world'); S.active = true;
        S.doorArm = false;   // 剛進場先解除門武裝，走出門區才啟動
        // 底圖：本機/網址覆蓋（建構模式「換底圖」）
        if (CFG.baseOverride) {
            const mapImg = root.querySelector('.lstage-map');
            resolveRef(CFG.baseOverride).then(src => { if (src && mapImg) mapImg.src = src; });
        }
        // 🌳 前景上層：外圈樹/前景素材蓋在角色之上（走到樹後被遮，不會踩在樹上）；z 高於所有小人；編輯模式隱藏
        if (SCENES[S.scene].upper) {
            const up = document.createElement('img');
            up.className = 'lstage-upper';
            up.width = MAP_W; up.height = MAP_H;
            resolveRef({ file: SCENES[S.scene].upper }).then(src => { if (src) up.src = src; });
            S.world.appendChild(up);
        }
        S.objEls = CFG.layout.map(o => _spawnObjEl(o));
        const editBtn = root.querySelector('.lstage-edit-btn');
        if (isStatic) editBtn.style.display = 'none';   // 靜態地圖沒有可拖佈局→藏擺設鈕
        else editBtn.addEventListener('click', () => window.LobbyEditor?.toggle());   // 🖊 擺設模式（實作在 lobby_editor.js）
        // 🗺️ 靜態點擊地圖：畫建築點擊區（點了白光過場進室內），跳過所有走路系統
        if (isStatic) {
            (SCENES[S.scene].hotspots || []).forEach(hs => {
                const el = document.createElement('div');
                el.className = 'lstage-hotspot';
                el.style.left = hs.x + 'px'; el.style.top = hs.y + 'px';
                el.style.width = hs.w + 'px'; el.style.height = hs.h + 'px';
                if (hs.label) el.innerHTML = '<span class="lstage-hotspot-chip"><i class="fa-solid fa-door-open"></i> ' + hs.label + '</span>';
                el.addEventListener('click', () => goScene(hs.to, hs.spawn, 'arrive'));
                S.world.appendChild(el);
            });
            _applySceneHeader();
            fitCamera();
            window.addEventListener('resize', fitCamera);
            try { S._ro = new ResizeObserver(() => fitCamera()); S._ro.observe(root); } catch (e) {}
            console.log('[LobbyStage] mounted (static map)');
            return;
        }
        // 座標命中角色（不動角色 pointer-events）：桌機右鍵、手機長按共用
        const _hitAt = (clientX, clientY) => {
            const r = S.world.getBoundingClientRect();
            const mx = (clientX - r.left) / S.scale, my = (clientY - r.top) / S.scale;
            return ((S.player ? [S.player] : []).concat(S.npcs)).find(a => {
                const w = Math.max(50, a.h * ((a.frameW && a.frameH) ? a.frameW / a.frameH : 0.6));
                return mx > a.x - w / 2 && mx < a.x + w / 2 && my > a.y - a.h && my < a.y;
            });
        };
        // 👗 桌機：右鍵角色→下拉單
        root.addEventListener('contextmenu', (e) => {
            if (S.edit) return;
            const hit = _hitAt(e.clientX, e.clientY);
            if (!hit) return;
            e.preventDefault(); e.stopPropagation();
            window.LobbyDress?.openMenu(hit, e.clientX, e.clientY);
        });
        // 📱 手機：長按角色→下拉單（contextmenu 手機不可靠，改自訂長按計時器；移動/放開即取消）
        let _lpTimer = null, _lpX = 0, _lpY = 0;
        root.addEventListener('pointerdown', (e) => {
            if (e.pointerType !== 'touch' || S.edit) return;
            if (e.target.closest('.lstage-joy, .lstage-menu-btn, .lstage-edit-btn, .lstage-chat-fab, .lstage-hint, #iris-dialogue-box')) return;
            _lpX = e.clientX; _lpY = e.clientY;
            clearTimeout(_lpTimer);
            _lpTimer = setTimeout(() => {
                _lpTimer = null;
                const hit = _hitAt(_lpX, _lpY);
                if (hit) { _lpSuppressClick = true; window.LobbyDress?.openMenu(hit, _lpX, _lpY); }
            }, 450);
        });
        const _lpCancel = (e) => {
            if (!_lpTimer) return;
            if (e && e.type === 'pointermove' && Math.hypot(e.clientX - _lpX, e.clientY - _lpY) <= 12) return;   // 小抖動不算移動
            clearTimeout(_lpTimer); _lpTimer = null;
        };
        root.addEventListener('pointermove', _lpCancel);
        root.addEventListener('pointerup', _lpCancel);
        root.addEventListener('pointercancel', _lpCancel);
        initPlayer();
        window.LobbyNpcs?.init();   // 🧑‍🤝‍🧑 NPC 生成（實作在 lobby_npcs.js；async 不等——NPC 陸續刷出即可）
        _applySceneHeader();
        fitCamera();
        window.addEventListener('resize', fitCamera);
        // 容器自身變寬窄（漢堡全屏、佈局模式切換）不一定觸發 window resize → ResizeObserver 補刀
        try { S._ro = new ResizeObserver(() => fitCamera()); S._ro.observe(root); } catch (e) {}
        S.last = performance.now();
        S.raf = requestAnimationFrame(tick);
        console.log('[LobbyStage] mounted');
    }
    function _spawnObjEl(o) {
        const img = document.createElement('img');
        img.className = 'lstage-actor lstage-obj';
        if (o.float) img.classList.add('lstage-float');   // 飄浮物件（如 LUNA-VII 核心）
        // 夜間成對素材：物件帶 nightFile 且場景現在是夜 → 換檔名（forceDay 場景永遠白天；座標/佔地不變）
        const ref = (o.nightFile && _sceneIsNight(SCENES[S.scene])) ? Object.assign({}, o, { file: o.nightFile }) : o;
        const wantAlpha = !!SCENES[S.scene].alphaFoot;   // 大地圖建築：抽 alpha 形狀做碰撞
        resolveRef(ref).then(src => {
            if (!src) return;
            // 🚨 alphaFoot：顯示圖本身就掛 crossOrigin（避免先無 CORS 載一次污染快取→canvas 讀不到 alpha）；直接從這張抽，不開第二探針
            if (wantAlpha && !String(src).startsWith('data:')) img.crossOrigin = 'anonymous';
            img.src = src;
            if (wantAlpha) {
                const grab = () => _extractObjAlpha(o, img);
                if (img.complete && img.naturalWidth) grab();
                else img.addEventListener('load', grab, { once: true });
            }
        });
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
        if (S._theaterTimer) { clearInterval(S._theaterTimer); S._theaterTimer = null; }
        window.LobbyTheater?.end();
        if (S.edit) window.LobbyEditor?.exit(false);
        _closeWins();
        S.joy = null;   // 清搖桿殘留方向
        document.querySelector('.lobby-body')?.classList.remove('stage-menu-hidden');   // 舞台關掉→純文字大廳要看得到選單
        endTalk();
        cancelAnimationFrame(S.raf);
        if (S.sleepT) { clearTimeout(S.sleepT); S.sleepT = null; }
        window.removeEventListener('resize', fitCamera);
        if (S._ro) { try { S._ro.disconnect(); } catch (e) {} S._ro = null; }
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

    // 🖊 擺設模式（編輯器：拖物件/站位/門區/鋼索、佔地調整、換底圖遮罩、匯出存檔）→ 拆到 lobby_editor.js（走 _b 橋；2026-07-16）

    // 建構模式選圖：貼網址或留空→從電腦選擇圖片（上傳存進本機資產庫 IndexedDB）
    // ── 🧊 像素處理管線：去背（邊緣連通 BFS）＋掃碎片；opts.noGrid=true 時「不壓縮」──
    //   壓縮（縮到 96px 高、nearest=大顆粒）只給手動「壓成像素小小人」用；
    //   裝扮室「生成單張立姿圖」走 noGrid＝畫風原封不動（Rae：以後要換不同Q版畫風，有些畫風不能壓）。
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

    // ── 🔌 拆檔橋＋窗口互斥登記制 ──
    //    子模組（lobby_theater.js…）經 window.LobbyStage._b 借核心狀態/工具，載入順序=lobby_stage 先。
    //    各小窗把自己的 close 函式 regWin() 進互斥圈；誰要開窗先 closeWins() 全關（含自己的舊窗）。
    const _winClosers = [_closeLobbySettings];   // 裝扮室三小窗在 lobby_dress.js 自己 regWin
    function _regWin(fn) { _winClosers.push(fn); return fn; }
    function _closeWins() { _winClosers.forEach(fn => { try { fn(); } catch (e) {} }); }

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
        setNpcHistory,
        rollGuestPool: () => window.LobbyNpcs?.rollGuestPool(),   // console 診斷用：看日誌 NPC 池撈到誰（無 F12 環境靠這個；懶解析到 lobby_npcs.js，async 透傳）
        pixelify: _pixelify,                // console 診斷用：手動壓小小人（回 dataURL）
        openDressRoom: (a) => window.LobbyDress?.openRoom(a),   // console 診斷用：直接開某個角色的裝扮室（傳 _S.npcs 裡的物件）
        _S: S,
        _b: {   // 🔌 拆檔橋：子模組專用（lobby_theater.js…），外部腳本別戳
            S,
            get CFG() { return CFG; },   // CFG 會整顆換（_loadCfg），必須走 getter
            MAP_W, MAP_H, SCENES, SCENE_HEADER,
            placeActor,
            regWin: _regWin, closeWins: _closeWins,
            // 給 lobby_dress.js（裝扮室/歷史窗）：皮膚存取/換裝/圖片工具/NPC歷史資料
            skins: _skins, saveSkin: _saveSkin,
            swapActorSrc: _swapActorSrc, applySkin: _applySkin,
            pixelify: _pixelify, askImage: _askImage,
            resolveRef, idbPut,
            getNpcHistory, setNpcHistory,
            // 給 lobby_editor.js（擺設模式）：物件擺放/佔地/碰撞重建/遮罩/人物縮放/相機重算
            placeObj, spawnObjEl: _spawnObjEl, footRect,
            rebuildBlocks, loadMask, applyActorScale, fitCamera,
            // 給 lobby_npcs.js（NPC 生成/名冊）：素材表/生NPC/碰撞判定/站位開闊度採樣
            ASSET, addNpc, blocked, whiteRatio: _whiteRatio,
        },
    };
})();
