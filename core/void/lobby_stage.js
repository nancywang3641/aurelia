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
    function update(dt) { applyCamera(); }

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
