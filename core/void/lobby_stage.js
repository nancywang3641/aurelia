// ----------------------------------------------------------------
// [檔案] core/void/lobby_stage.js (V1 - 書咖俯視像素舞台)
// 職責：把 lobby-left 換成星露谷式俯視舞台（分層地圖/小人/NPC/互動）。
//       對話仍走 void_terminal 的 sendIrisMessage（本模組只提供 talkTarget 與各 NPC 歷史）。
// 分層：底圖(z0) → 物件與角色同一套「底邊y=z-index」深度排序（人走到桌後被遮）。
// 開關：localStorage lobby_stage_on（'0' 關 → 完整還原原立繪大廳）
// ----------------------------------------------------------------
(function () {
    'use strict';

    const CDN = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@main/';
    const ASSET = {
        base: CDN + 'lobby_base.png',
        ying: CDN + 'lobby_ying.png',
        mcF:  CDN + 'lobby_mc_f.png',
        mcM:  CDN + 'lobby_mc_m.png',
    };
    const MAP_W = 1536, MAP_H = 1024;   // 底圖尺寸

    // 分層物件擺設（x/y=左上角 map 座標，w/h=原始尺寸；深度=底邊 y）
    // footH=腳印高：物件「站地面」的那截，用來自動導出碰撞區；上半部人可走到後面被遮
    const LAYOUT = [
        { file: 'lobby_obj_counter.png', x: 132,  y: 286, w: 1266, h: 396, footH: 300 }, // 吧台(授權對位)
        { file: 'lobby_obj_02.png',      x: 180,  y: 500, w: 394,  h: 258, footH: 90 },  // 左桌組
        { file: 'lobby_obj_01.png',      x: 620,  y: 640, w: 391,  h: 267, footH: 90 },  // 中桌組
        { file: 'lobby_obj_04.png',      x: 1080, y: 560, w: 396,  h: 263, footH: 90 },  // 右桌組
        { file: 'lobby_obj_03.png',      x: 60,   y: 330, w: 166,  h: 259, footH: 60 },  // 盆栽(左)
        { file: 'lobby_obj_05.png',      x: 1380, y: 330, w: 156,  h: 259, footH: 60 },  // 盆栽(右)
        { file: 'lobby_obj_07.png',      x: 480,  y: 860, w: 425,  h: 177, footH: 80 },  // 小花箱
    ];

    const S = {
        root: null, world: null, scale: 1,
        raf: 0, last: 0, active: false,
        player: null, npcs: [], talkTarget: null,
        keys: {}, onKey: null,
    };

    // ── 碰撞 ─────────────────────────────────────────────
    // 底圖牆面（手標；後牆腳線約 y=310、下緣露臺矮牆約 y=930 起）
    const WALL_BLOCKS = [
        { x: 0,    y: 0,   w: 1536, h: 310 },   // 後牆
        { x: 0,    y: 0,   w: 90,   h: 1024 },  // 左牆斜邊(粗略)
        { x: 1446, y: 0,   w: 90,   h: 1024 },  // 右牆斜邊(粗略)
        { x: 0,    y: 930, w: 1536, h: 94 },    // 下緣+露臺矮牆
    ];
    // 物件腳印：物件圖底部 footH 那截視為佔地，上半部人可以走到後面被遮
    const BLOCKS = WALL_BLOCKS.concat(LAYOUT.map(o => (
        { x: o.x, y: o.y + o.h - o.footH, w: o.w, h: o.footH }
    )));
    const FOOT_W = 46, FOOT_H = 18;   // 小人腳底碰撞盒（以 x,y 為底邊中心）
    function blocked(x, y) {
        const l = x - FOOT_W / 2, t = y - FOOT_H, r = x + FOOT_W / 2, b = y;
        if (l < 0 || r > MAP_W || t < 0 || b > MAP_H) return true;
        return BLOCKS.some(B => l < B.x + B.w && r > B.x && t < B.y + B.h && b > B.y);
    }

    // ── 角色（玩家/NPC 共用）────────────────────────────
    function spawnActor(src, x, y, h) {
        const img = document.createElement('img');
        img.className = 'lstage-actor';
        img.src = src;
        img.style.height = h + 'px';
        S.world.appendChild(img);
        const a = { x, y, h, el: img, walking: false, flip: false };
        img.addEventListener('load', () => placeActor(a), { once: true });
        placeActor(a);
        return a;
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
    const PLAYER_H = 190, PLAYER_SPEED = 0.33;   // px(map)/ms
    function initPlayer() {
        const src = (localStorage.getItem('lobby_stage_mc') === 'm') ? ASSET.mcM : ASSET.mcF;
        S.player = Object.assign(spawnActor(src, 640, 760, PLAYER_H), { dest: null });
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
            if (S.talkTarget) return;   // 對話中鎖移動（Task 5 加 endTalk）
            const r = S.world.getBoundingClientRect();
            S.player.dest = { x: (e.clientX - r.left) / S.scale, y: (e.clientY - r.top) / S.scale };
        });
    }

    function isOn() { try { return localStorage.getItem('lobby_stage_on') !== '0'; } catch (e) { return true; } }

    function tryMount() {
        const left = document.querySelector('.lobby-left');
        if (!left || S.active || !isOn()) return;
        const root = document.createElement('div');
        root.className = 'lstage-root';
        root.innerHTML = '<div class="lstage-world">' +
            '<img class="lstage-map" src="' + ASSET.base + '" width="' + MAP_W + '" height="' + MAP_H + '">' +
            '<div class="lstage-click"></div></div>';
        left.appendChild(root);
        left.classList.add('lstage-on');
        S.root = root; S.world = root.querySelector('.lstage-world'); S.active = true;
        // 分層物件：跟角色同一套「底邊y=z-index」深度排序
        LAYOUT.forEach(o => {
            const img = document.createElement('img');
            img.className = 'lstage-actor';
            img.src = CDN + o.file;
            img.style.left = o.x + 'px';
            img.style.top = o.y + 'px';
            img.style.width = o.w + 'px';
            img.style.zIndex = String(2 + Math.round(o.y + o.h));
            S.world.appendChild(img);
        });
        initPlayer();
        fitCamera();
        window.addEventListener('resize', fitCamera);
        S.last = performance.now();
        S.raf = requestAnimationFrame(tick);
        console.log('[LobbyStage] mounted');
    }

    function unmount() {
        if (!S.active) return;
        cancelAnimationFrame(S.raf);
        window.removeEventListener('resize', fitCamera);
        if (S.onKey) {
            window.removeEventListener('keydown', S.onKey);
            window.removeEventListener('keyup', S.onKey);
            S.onKey = null;
        }
        S.root?.remove();
        document.querySelector('.lobby-left')?.classList.remove('lstage-on');
        S.root = S.world = null;
        S.player = null; S.npcs = []; S.talkTarget = null; S.keys = {};
        S.active = false;
        console.log('[LobbyStage] unmounted');
    }

    // 鏡頭：等比縮放讓地圖蓋滿視口（cover），超出部分由鏡頭平移跟隨焦點
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
        const focus = S.player ? { x: S.player.x, y: S.player.y } : { x: MAP_W / 2, y: MAP_H / 2 };
        let cx = focus.x * S.scale - vw / 2, cy = focus.y * S.scale - vh / 2;
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
                // 撞牆滑動：先試全移，不行再試單軸
                if (!blocked(nx, ny)) { p.x = nx; p.y = ny; }
                else if (dx && !blocked(nx, p.y)) { p.x = nx; p.dest = null; }
                else if (dy && !blocked(p.x, ny)) { p.y = ny; p.dest = null; }
                else p.dest = null;
                p.walking = true;
                if (dx !== 0) p.flip = dx < 0;
            } else p.walking = false;
            placeActor(p);
        }
        applyCamera();
    }

    window.LobbyStage = {
        tryMount, unmount,
        isActive: () => S.active,
        isOn,
        getTalkTarget: () => S.talkTarget,
        setTalkTarget: (t) => { S.talkTarget = t || null; },
        getNpcHistory: () => [],
        pushNpcHistory: () => {},
        _S: S,
    };
})();
