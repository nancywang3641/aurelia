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
        mcF:   CDN + 'lobby_mc_f.png',
        mcM:   CDN + 'lobby_mc_m.png',
    };
    const MAP_W = 1536, MAP_H = 1024;   // 底圖尺寸（兩場景同規格）

    // ── 🗺️ 場景註冊表（雙子設定：瀅瀅書咖 ⇄ 愛麗絲純白大廳）──
    // layout: footH=腳印高(物件底部佔地)、s=個別縮放；points: 各場景擺設模式各存各的
    // doors: 走進觸發區→白光過場→切場景（spawn=抵達點）
    const SCENES = {
        cafe: {
            base: 'lobby_base_v2.png',
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

    // 讀取佈局：本機調過的蓋過預設（layout 按 file 名對位，points 整包；每場景各存各的）
    function _loadCfg() {
        const SC = SCENES[S.scene];
        const layout = SC.layout.map(o => Object.assign({}, o));
        const points = JSON.parse(JSON.stringify(SC.points));
        try {
            const saved = JSON.parse(localStorage.getItem(SC.cfgKey) || 'null');
            if (saved) {
                (saved.layout || []).forEach(s => {
                    const t = layout.find(o => o.file === s.file);
                    if (t) { t.x = s.x; t.y = s.y; if (s.footH != null) t.footH = s.footH; if (s.footW != null) t.footW = s.footW; if (s.s != null) t.s = s.s; }
                });
                if (saved.points) {
                    if (saved.points.yingZone) points.yingZone = saved.points.yingZone;
                    if (saved.points.npcZone) points.npcZone = saved.points.npcZone;
                    if (saved.points.player) points.player = saved.points.player;
                    if (saved.points.arrive) points.arrive = saved.points.arrive;
                    if (Array.isArray(saved.points.boundary) && saved.points.boundary.length >= 3) points.boundary = saved.points.boundary;
                    if (saved.points.actorScale != null) points.actorScale = saved.points.actorScale;
                }
            }
        } catch (e) {}
        return { layout, points };
    }

    const S = {
        root: null, world: null, scale: 1,
        raf: 0, last: 0, active: false,
        scene: 'cafe',              // 目前場景（每次開大廳從書咖開始）
        spawnOverride: null,        // 過門後的抵達點
        doorCd: 0,                  // 過門冷卻（防止落地瞬間又觸發）
        transitioning: false,
        player: null, npcs: [], talkTarget: null,
        keys: {}, onKey: null,
        objEls: [],                 // 物件 img（跟 CFG.layout 同序）
        edit: null,                 // 擺設模式狀態
    };
    let CFG = null;   // tryMount 時按場景載入

    function isOn() { try { return localStorage.getItem('lobby_stage_on') !== '0'; } catch (e) { return true; } }

    // ── 碰撞（牆=場景定義、物件腳印=佈局導出）──────────
    let BLOCKS = [];
    function rebuildBlocks() {
        BLOCKS = SCENES[S.scene].walls.concat(CFG.layout.map(footRect));
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
    function blocked(x, y) {
        const l = x - FOOT_W / 2, t = y - FOOT_H, r = x + FOOT_W / 2, b = y;
        if (l < 0 || r > MAP_W || t < 0 || b > MAP_H) return true;
        const P = CFG?.points?.boundary;
        if (P && P.length >= 3 && !insidePoly(P, x, y)) return true;   // 鋼索圈外=牆
        return BLOCKS.some(B => l < B.x + B.w && r > B.x && t < B.y + B.h && b > B.y);
    }

    // ── 角色（玩家/NPC 共用）────────────────────────────
    function spawnActor(src, x, y, h) {
        const img = document.createElement('img');
        img.className = 'lstage-actor';
        img.src = src;
        S.world.appendChild(img);
        const a = { x, y, baseH: h, h: Math.round(h * (CFG.points.actorScale || 1)), el: img, walking: false, flip: false };
        img.style.height = a.h + 'px';
        img.addEventListener('load', () => placeActor(a), { once: true });
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
        const ratio = (a.el.naturalWidth && a.el.naturalHeight) ? a.el.naturalWidth / a.el.naturalHeight : 0.6;
        const w = a.h * ratio;
        a.el.style.left = (a.x - w / 2) + 'px';
        a.el.style.top = (a.y - a.h) + 'px';
        a.el.style.zIndex = String(2 + Math.round(a.y));
        a.el.classList.toggle('walking', !!a.walking);
        a.el.classList.toggle('flip', !!a.flip);
    }

    // ── 玩家 ─────────────────────────────────────────────
    const PLAYER_H = 190, PLAYER_SPEED = 0.33;
    function initPlayer() {
        const src = (localStorage.getItem('lobby_stage_mc') === 'm') ? ASSET.mcM : ASSET.mcF;
        // 'arrive'=走門進場（落點可在擺設模式拖橘色門圓點調整）
        const sp = (S.spawnOverride === 'arrive' ? (CFG.points.arrive || CFG.points.player)
                  : S.spawnOverride) || CFG.points.player;
        S.spawnOverride = null;
        S.player = Object.assign(spawnActor(src, sp.x, sp.y, PLAYER_H), { dest: null });
        S.onKey = (e) => {
            const tag = (document.activeElement?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;
            const k = e.key.toLowerCase();
            if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
                S.keys[k] = (e.type === 'keydown');
                e.preventDefault();
            }
        };
        window.addEventListener('keydown', S.onKey);
        window.addEventListener('keyup', S.onKey);
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
            addNpc({ key: 'alice', name: '愛麗絲', personaFull: ALICE_PERSONA,
                     subTitle: '純白大廳 · 首席導覽官',
                     storyTitle: '', x: SC.alice.x, y: SC.alice.y, h: 200,
                     src: ASSET.alice, noWander: true, facePlayer: true,
                     homeRect: { x: SC.alice.x, y: SC.alice.y, w: 0, h: 0 } });
            return;
        }
        const z = CFG.points.yingZone;
        addNpc({ key: 'ying', name: '瀅瀅', persona: null, x: z.x + z.w / 2, y: z.y + z.h / 2, h: 200,
                 src: ASSET.ying, homeRect: z });
        try {
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
            const pool = [...byName.values()].filter(r => r.count >= 2);
            for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
            const picked = pool.slice(0, 2 + Math.floor(Math.random() * 3));
            // 客人出沒區內隨機刷位置（避開佔地，最多重擲10次）
            const Z = CFG.points.npcZone || { x: 200, y: 600, w: 1000, h: 250 };
            const rollSpot = () => {
                for (let t = 0; t < 10; t++) {
                    const x = Z.x + Math.random() * Z.w, y = Z.y + Math.random() * Z.h;
                    if (!blocked(x, y)) return { x, y };
                }
                return { x: Z.x + Z.w / 2, y: Z.y + Z.h / 2 };
            };
            picked.forEach((r, i) => {
                const sp = rollSpot();
                addNpc({
                    key: 'bk_' + (r.storyId || 'x') + '_' + r.name,
                    name: r.name, storyId: r.storyId, storyTitle: r.storyTitle,
                    persona: '《' + (r.storyTitle || '某本書') + '》裡的角色「' + r.name + '」',
                    x: sp.x, y: sp.y,
                    src: (i % 2 === 0) ? ASSET.mcM : ASSET.mcF,
                    homeRect: Z,          // 漫步範圍=整個出沒區
                    avoidBlocks: true,    // 書中客人漫步避開佔地（瀅瀅在吧台後牆區不適用）
                });
            });
        } catch (e) { console.warn('[LobbyStage] 輪班讀取失敗', e); }
    }
    function addNpc(cfg) {
        const a = spawnActor(cfg.src, cfg.x, cfg.y, cfg.h || NPC_H);
        const keepH = a.h;   // spawnActor 已套 actorScale，別讓 cfg.h(未縮放) 蓋回去
        const npc = Object.assign(a, cfg, { h: keepH, wanderT: 1500 + Math.random() * 3000, dest: null });
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
        npc.tag.style.left = npc.x + 'px';
        npc.tag.style.top = (npc.y + 8) + 'px';
        npc.hint.style.left = npc.x + 'px';
        npc.hint.style.top = (npc.y - npc.h - 6) + 'px';
    }
    function updateNpcs(dt) {
        S.npcs.forEach(n => {
            if (n.facePlayer && S.player) { n.flip = S.player.x < n.x; }   // 愛麗絲永遠面向玩家
            if (S.talkTarget === n || n.noWander) { n.walking = false; placeActor(n); placeNpcExtras(n); _npcNearCheck(n); return; }
            n.wanderT -= dt;
            if (n.wanderT <= 0 && !n.dest) {
                const R = n.homeRect;
                n.dest = { x: R.x + Math.random() * R.w, y: R.y + Math.random() * R.h };
                n.wanderT = 2500 + Math.random() * 5000;
            }
            if (n.dest) {
                const vx = n.dest.x - n.x, vy = n.dest.y - n.y, d = Math.hypot(vx, vy);
                if (d < 5) { n.dest = null; n.walking = false; }
                else {
                    const step = 0.12 * dt;
                    const nx = n.x + vx / d * step, ny = n.y + vy / d * step;
                    if (n.avoidBlocks && blocked(nx, ny)) { n.dest = null; n.walking = false; }
                    else {
                        n.x = nx; n.y = ny;
                        n.walking = true; if (vx) n.flip = vx < 0;
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

    // ── NPC 各自的輕量對話歷史（localStorage，上限 20 條）──
    function getNpcHistory(key) {
        try { return JSON.parse(localStorage.getItem('lstage_hist_' + key) || '[]'); } catch (e) { return []; }
    }
    function pushNpcHistory(key, msg) {
        try {
            const arr = getNpcHistory(key);
            arr.push(msg);
            while (arr.length > 20) arr.shift();
            localStorage.setItem('lstage_hist_' + key, JSON.stringify(arr));
        } catch (e) {}
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
        p.src = S.talkTarget ? S.talkTarget.el.src : (S.scene === 'hall' ? ASSET.alice : ASSET.ying);
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
    }

    // ── 對話目標（對話本體仍走 void_terminal.sendIrisMessage）──
    function startTalk(npc) {
        if (S.edit) return;
        S.talkTarget = npc;
        S.npcs.forEach(n => { n.hint.style.display = 'none'; });
        const nameEl = document.getElementById('lb-char-name');
        const subEl = document.getElementById('lb-char-sub');
        const tagSpan = document.querySelector('#iris-name-tag span');
        const input = document.getElementById('iris-input');
        if (npc.key === 'ying') {
            // 瀅瀅=對話目標，但管線走她原本的 iris 軌道（void_terminal 會排除 ying）
            if (nameEl) nameEl.textContent = '瀅瀅';
            if (subEl) subEl.textContent = '視差書咖 · 館長';
            if (tagSpan) tagSpan.textContent = '瀅瀅';
            if (input) input.placeholder = '和瀅瀅聊聊…（點空地結束）';
            showDialog();
            window.dispatchEvent(new CustomEvent('lstage-poke-ying'));   // 開聊招呼=戳戳池抽一句
            return;
        }
        if (nameEl) nameEl.textContent = npc.name;
        if (subEl) subEl.textContent = npc.subTitle || ('來自《' + (npc.storyTitle || '未知的書') + '》');
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
    // 場景預設門面：書咖=瀅瀅、大廳=愛麗絲（名牌/頭銜/輸入框提示跟著場景走）
    function _applySceneHeader() {
        const isHall = S.scene === 'hall';
        const nameEl = document.getElementById('lb-char-name');
        const subEl = document.getElementById('lb-char-sub');
        const tagSpan = document.querySelector('#iris-name-tag span');
        if (nameEl) nameEl.textContent = isHall ? '愛麗絲' : '瀅瀅';
        if (subEl) subEl.textContent = isHall ? '純白大廳 · 首席導覽官' : '視差書咖 · 館長';
        if (tagSpan) tagSpan.textContent = isHall ? '愛麗絲' : '瀅瀅';
        const input = document.getElementById('iris-input');
        if (input) input.placeholder = isHall ? '與愛麗絲對話，或走向大門返回書咖...' : '提供故事素材或與瀅瀅對話...';
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
        S.world.style.transform = 'translate(' + (-cx) + 'px,' + (-cy) + 'px) scale(' + S.scale + ')';
    }

    function tick(now) {
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
                if (dx !== 0) p.flip = dx < 0;
            } else p.walking = false;
            placeActor(p);
            // 🚪 過門判定（腳點進門區→白光過場切場景）
            if (!S.transitioning && performance.now() > S.doorCd) {
                const door = SCENES[S.scene].doors.find(D =>
                    p.x > D.x && p.x < D.x + D.w && p.y > D.y && p.y < D.y + D.h);
                if (door) goScene(door.to, door.spawn);
            }
        }
        updateNpcs(dt);
        applyCamera();
    }

    // ── 🚪 場景切換（白光過場）──────────────────────────
    function goScene(to, spawn) {
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
            S.spawnOverride = 'arrive';   // 落點=目標場景自己存的「門」圓點
            S.doorCd = performance.now() + 900;   // 落地冷卻，防止秒回
            tryMount();
            S.transitioning = false;
            fade.classList.remove('on');
            setTimeout(() => fade.remove(), 400);
        }, 320);
    }

    // ── 掛載/卸載 ─────────────────────────────────────────
    function tryMount() {
        const left = document.querySelector('.lobby-left');
        if (!left || S.active || !isOn()) return;
        CFG = _loadCfg(); rebuildBlocks();
        const root = document.createElement('div');
        root.className = 'lstage-root';
        root.innerHTML = '<div class="lstage-world">' +
            '<img class="lstage-map" src="' + CDN + SCENES[S.scene].base + '" width="' + MAP_W + '" height="' + MAP_H + '">' +
            '<div class="lstage-click"></div></div>' +
            '<button class="lstage-edit-btn" title="擺設模式"><i class="fa-solid fa-pen-ruler"></i></button>';
        left.appendChild(root);
        left.classList.add('lstage-on', 'lstage-dlg-hidden');   // 對話框預設收起，開聊才浮出
        S.root = root; S.world = root.querySelector('.lstage-world'); S.active = true;
        S.objEls = CFG.layout.map(o => {
            const img = document.createElement('img');
            img.className = 'lstage-actor lstage-obj';
            if (o.float) img.classList.add('lstage-float');   // 飄浮物件（如 LUNA-VII 核心）
            img.src = CDN + o.file;
            placeObj(img, o);
            S.world.appendChild(img);
            return img;
        });
        root.querySelector('.lstage-edit-btn').addEventListener('click', () => (S.edit ? exitEdit(true) : enterEdit()));
        initPlayer();
        initNpcs();
        _applySceneHeader();
        fitCamera();
        window.addEventListener('resize', fitCamera);
        S.last = performance.now();
        S.raf = requestAnimationFrame(tick);
        console.log('[LobbyStage] mounted');
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
        endTalk();
        cancelAnimationFrame(S.raf);
        window.removeEventListener('resize', fitCamera);
        if (S.onKey) {
            window.removeEventListener('keydown', S.onKey);
            window.removeEventListener('keyup', S.onKey);
            S.onKey = null;
        }
        S.root?.remove();
        const _left = document.querySelector('.lobby-left');
        if (_left) {
            _left.classList.remove('lstage-on', 'lstage-dlg-hidden');
            _left.querySelector('.lstage-talk-portrait')?.remove();
        }
        S.root = S.world = null;
        S.player = null; S.npcs = []; S.talkTarget = null; S.keys = {}; S.objEls = [];
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
        // 物件可拖 + 佔地覆蓋層
        S.objEls.forEach((img, i) => {
            img.classList.add('lstage-editable');
            const foot = document.createElement('div');
            foot.className = 'lstage-foot';
            S.world.appendChild(foot);
            S.edit.feet.push(foot);
            _syncFoot(i);
            img.onpointerdown = (e) => _dragStart(e, { kind: 'obj', i });
        });
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
        if (CFG.points.arrive) {   // 走門進場的落點
            const m = mk('門', 'm-arrive', () => CFG.points.arrive);
            S.edit.markers.push(m);
            m.onpointerdown = (e) => _dragStart(e, { kind: 'pt', pt: CFG.points.arrive, m });
        }
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
        // 外框鋼索：金色多邊形=可走範圍，白色錨點可拖（牆角）
        if (Array.isArray(CFG.points.boundary) && CFG.points.boundary.length >= 3) {
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
            '<div class="lep-hint">拖東西調位置，拖空地移動視角。金色鋼索=可走範圍外框(拖白色牆角錨點)｜藍圓=出生點｜橘圓門=走門落點｜綠框=客人出沒區｜紫框=瀅瀅活動範圍｜紅框=佔地</div>' +
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
        return {
            layout: CFG.layout.map(o => {
                const rec = { file: o.file, x: o.x, y: o.y, footH: o.footH, s: o.s || 1 };
                if (o.footW != null) rec.footW = o.footW;
                return rec;
            }),
            points: CFG.points,
        };
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
        _S: S,
    };
})();
