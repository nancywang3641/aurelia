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
        base: CDN + 'lobby_base.png',
        ying: CDN + 'lobby_ying.png',
        mcF:  CDN + 'lobby_mc_f.png',
        mcM:  CDN + 'lobby_mc_m.png',
    };
    const MAP_W = 1536, MAP_H = 1024;   // 底圖尺寸
    const CFG_KEY = 'lobby_stage_layout_v1';

    // 預設佈局（擺設模式調好後把數據烤回這裡=朋友端預設）
    // footH=腳印高：物件圖底部那截視為佔地；上半部人可走到後面被遮
    const DEFAULT_LAYOUT = [
        { file: 'lobby_obj_counter.png', x: 132,  y: 286, w: 1266, h: 396, footH: 300 }, // 吧台
        { file: 'lobby_obj_02.png',      x: 180,  y: 500, w: 394,  h: 258, footH: 90 },  // 左桌組
        { file: 'lobby_obj_01.png',      x: 620,  y: 640, w: 391,  h: 267, footH: 90 },  // 中桌組
        { file: 'lobby_obj_04.png',      x: 1080, y: 560, w: 396,  h: 263, footH: 90 },  // 右桌組
        { file: 'lobby_obj_03.png',      x: 60,   y: 330, w: 166,  h: 259, footH: 60 },  // 盆栽(左)
        { file: 'lobby_obj_05.png',      x: 1380, y: 330, w: 156,  h: 259, footH: 60 },  // 盆栽(右)
        { file: 'lobby_obj_07.png',      x: 480,  y: 860, w: 425,  h: 177, footH: 80 },  // 小花箱
    ];
    const DEFAULT_POINTS = {
        ying:   { x: 700, y: 430 },     // 瀅瀅（吧台後）
        player: { x: 640, y: 760 },     // 委託人出生點
        spots:  [{ x: 460, y: 800 }, { x: 1250, y: 880 }, { x: 1100, y: 500 }, { x: 250, y: 880 }], // 輪班NPC站位
    };

    // 讀取佈局：本機調過的蓋過預設（layout 按 file 名對位，points 整包）
    function _loadCfg() {
        const layout = DEFAULT_LAYOUT.map(o => Object.assign({}, o));
        const points = JSON.parse(JSON.stringify(DEFAULT_POINTS));
        try {
            const saved = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
            if (saved) {
                (saved.layout || []).forEach(s => {
                    const t = layout.find(o => o.file === s.file);
                    if (t) { t.x = s.x; t.y = s.y; if (s.footH != null) t.footH = s.footH; }
                });
                if (saved.points) {
                    if (saved.points.ying) points.ying = saved.points.ying;
                    if (saved.points.player) points.player = saved.points.player;
                    if (Array.isArray(saved.points.spots) && saved.points.spots.length) points.spots = saved.points.spots;
                }
            }
        } catch (e) {}
        return { layout, points };
    }
    let CFG = _loadCfg();

    const S = {
        root: null, world: null, scale: 1,
        raf: 0, last: 0, active: false,
        player: null, npcs: [], talkTarget: null,
        keys: {}, onKey: null,
        objEls: [],                 // 物件 img（跟 CFG.layout 同序）
        edit: null,                 // 擺設模式狀態
    };

    function isOn() { try { return localStorage.getItem('lobby_stage_on') !== '0'; } catch (e) { return true; } }

    // ── 碰撞 ─────────────────────────────────────────────
    const WALL_BLOCKS = [
        { x: 0,    y: 0,   w: 1536, h: 310 },   // 後牆
        { x: 0,    y: 0,   w: 90,   h: 1024 },  // 左牆斜邊(粗略)
        { x: 1446, y: 0,   w: 90,   h: 1024 },  // 右牆斜邊(粗略)
        { x: 0,    y: 930, w: 1536, h: 94 },    // 下緣+露臺矮牆
    ];
    let BLOCKS = [];
    function rebuildBlocks() {
        BLOCKS = WALL_BLOCKS.concat(CFG.layout.map(o => (
            { x: o.x, y: o.y + o.h - o.footH, w: o.w, h: o.footH }
        )));
    }
    rebuildBlocks();
    const FOOT_W = 46, FOOT_H = 18;
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
    const PLAYER_H = 190, PLAYER_SPEED = 0.33;
    function initPlayer() {
        const src = (localStorage.getItem('lobby_stage_mc') === 'm') ? ASSET.mcM : ASSET.mcF;
        S.player = Object.assign(spawnActor(src, CFG.points.player.x, CFG.points.player.y, PLAYER_H), { dest: null });
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
            const r = S.world.getBoundingClientRect();
            S.player.dest = { x: (e.clientX - r.left) / S.scale, y: (e.clientY - r.top) / S.scale };
        });
    }

    // ── NPC ──────────────────────────────────────────────
    const NPC_H = 180, INTERACT_R = 130;
    async function initNpcs() {
        const yp = CFG.points.ying;
        addNpc({ key: 'ying', name: '瀅瀅', persona: null, x: yp.x, y: yp.y, h: 200,
                 src: ASSET.ying, homeRect: { x: yp.x - 350, y: yp.y - 15, w: 700, h: 30 } });
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
            const SPOTS = CFG.points.spots;
            picked.forEach((r, i) => addNpc({
                key: 'bk_' + (r.storyId || 'x') + '_' + r.name,
                name: r.name, storyId: r.storyId, storyTitle: r.storyTitle,
                persona: '《' + (r.storyTitle || '某本書') + '》裡的角色「' + r.name + '」',
                x: SPOTS[i % SPOTS.length].x, y: SPOTS[i % SPOTS.length].y,
                src: (i % 2 === 0) ? ASSET.mcM : ASSET.mcF,
                homeRect: { x: SPOTS[i % SPOTS.length].x - 140, y: SPOTS[i % SPOTS.length].y - 90, w: 280, h: 180 },
            }));
        } catch (e) { console.warn('[LobbyStage] 輪班讀取失敗', e); }
    }
    function addNpc(cfg) {
        const a = spawnActor(cfg.src, cfg.x, cfg.y, cfg.h || NPC_H);
        const npc = Object.assign(a, cfg, { h: cfg.h || NPC_H, wanderT: 1500 + Math.random() * 3000, dest: null });
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
            if (S.talkTarget === n) { n.walking = false; placeActor(n); placeNpcExtras(n); return; }
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
                    n.x += vx / d * step; n.y += vy / d * step;
                    n.walking = true; if (vx) n.flip = vx < 0;
                }
            }
            placeActor(n); placeNpcExtras(n);
            const near = S.player && Math.hypot(n.x - S.player.x, n.y - S.player.y) < INTERACT_R;
            n.hint.style.display = (near && !S.talkTarget) ? '' : 'none';
        });
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

    // ── 對話目標（對話本體仍走 void_terminal.sendIrisMessage）──
    function startTalk(npc) {
        if (S.edit) return;
        if (npc.key === 'ying') { window.dispatchEvent(new CustomEvent('lstage-poke-ying')); return; }
        S.talkTarget = npc;
        S.npcs.forEach(n => { n.hint.style.display = 'none'; });
        const nameEl = document.getElementById('lb-char-name');
        const subEl = document.getElementById('lb-char-sub');
        const tagSpan = document.querySelector('#iris-name-tag span');
        if (nameEl) nameEl.textContent = npc.name;
        if (subEl) subEl.textContent = '來自《' + (npc.storyTitle || '未知的書') + '》';
        if (tagSpan) tagSpan.textContent = npc.name;
        const input = document.getElementById('iris-input');
        if (input) input.placeholder = '和' + npc.name + '聊聊…（點空地結束）';
    }
    function endTalk() {
        if (!S.talkTarget) return;
        S.talkTarget = null;
        const nameEl = document.getElementById('lb-char-name');
        const subEl = document.getElementById('lb-char-sub');
        const tagSpan = document.querySelector('#iris-name-tag span');
        if (nameEl) nameEl.textContent = '瀅瀅';
        if (subEl) subEl.textContent = '視差書咖 · 館長';
        if (tagSpan) tagSpan.textContent = '瀅瀅';
        const input = document.getElementById('iris-input');
        if (input) input.placeholder = '提供故事素材或與瀅瀅對話...';
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
        }
        updateNpcs(dt);
        applyCamera();
    }

    // ── 掛載/卸載 ─────────────────────────────────────────
    function tryMount() {
        const left = document.querySelector('.lobby-left');
        if (!left || S.active || !isOn()) return;
        CFG = _loadCfg(); rebuildBlocks();
        const root = document.createElement('div');
        root.className = 'lstage-root';
        root.innerHTML = '<div class="lstage-world">' +
            '<img class="lstage-map" src="' + ASSET.base + '" width="' + MAP_W + '" height="' + MAP_H + '">' +
            '<div class="lstage-click"></div></div>' +
            '<button class="lstage-edit-btn" title="擺設模式"><i class="fa-solid fa-pen-ruler"></i></button>';
        left.appendChild(root);
        left.classList.add('lstage-on');
        S.root = root; S.world = root.querySelector('.lstage-world'); S.active = true;
        S.objEls = CFG.layout.map(o => {
            const img = document.createElement('img');
            img.className = 'lstage-actor lstage-obj';
            img.src = CDN + o.file;
            placeObj(img, o);
            S.world.appendChild(img);
            return img;
        });
        root.querySelector('.lstage-edit-btn').addEventListener('click', () => (S.edit ? exitEdit(true) : enterEdit()));
        initPlayer();
        initNpcs();
        fitCamera();
        window.addEventListener('resize', fitCamera);
        S.last = performance.now();
        S.raf = requestAnimationFrame(tick);
        console.log('[LobbyStage] mounted');
    }
    function placeObj(img, o) {
        img.style.left = o.x + 'px';
        img.style.top = o.y + 'px';
        img.style.width = o.w + 'px';
        img.style.zIndex = String(2 + Math.round(o.y + o.h));
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
        document.querySelector('.lobby-left')?.classList.remove('lstage-on');
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
        S.edit.markers.push(mk('瀅', 'm-ying', () => CFG.points.ying));
        S.edit.markers.push(mk('我', 'm-player', () => CFG.points.player));
        CFG.points.spots.forEach((sp, i) => S.edit.markers.push(mk(String(i + 1), 'm-spot', () => sp)));
        S.edit.markers[0].onpointerdown = (e) => _dragStart(e, { kind: 'pt', pt: CFG.points.ying, m: S.edit.markers[0] });
        S.edit.markers[1].onpointerdown = (e) => _dragStart(e, { kind: 'pt', pt: CFG.points.player, m: S.edit.markers[1] });
        CFG.points.spots.forEach((sp, i) => {
            const m = S.edit.markers[2 + i];
            m.onpointerdown = (e) => _dragStart(e, { kind: 'pt', pt: sp, m });
        });
        // 空地拖曳=平移視角
        S.root.querySelector('.lstage-click').onpointerdown = (e) => _dragStart(e, { kind: 'cam' });
        window.addEventListener('pointermove', _dragMove);
        window.addEventListener('pointerup', _dragEnd);
        // 控制面板
        const panel = document.createElement('div');
        panel.className = 'lstage-edit-panel';
        panel.innerHTML =
            '<div class="lep-hint">拖家具/圓點調位置，拖空地移動視角</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="footminus"><i class="fa-solid fa-minus"></i> 佔地</button>' +
              '<button class="lep-btn" data-act="footplus"><i class="fa-solid fa-plus"></i> 佔地</button>' +
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
            } else if (act === 'copy') {
                const out = panel.querySelector('.lep-out');
                out.select();
                try { navigator.clipboard?.writeText(out.value); } catch (err) {}
                try { document.execCommand('copy'); } catch (err) {}
            } else if (act === 'reset') {
                try { localStorage.removeItem(CFG_KEY); } catch (err) {}
                exitEdit(false); unmount(); tryMount();
            } else if (act === 'done') {
                exitEdit(true);
            }
        });
        _exportToPanel();
    }
    function _syncFoot(i) {
        const o = CFG.layout[i], foot = S.edit.feet[i];
        if (!foot) return;
        foot.style.left = o.x + 'px';
        foot.style.top = (o.y + o.h - o.footH) + 'px';
        foot.style.width = o.w + 'px';
        foot.style.height = o.footH + 'px';
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
        } else if (info.kind === 'pt') {
            S.edit.drag.ox = info.pt.x; S.edit.drag.oy = info.pt.y;
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
        } else if (d.kind === 'pt') {
            d.pt.x = Math.round(d.ox + dx); d.pt.y = Math.round(d.oy + dy);
            d.m.style.left = d.pt.x + 'px'; d.m.style.top = d.pt.y + 'px';
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
            layout: CFG.layout.map(o => ({ file: o.file, x: o.x, y: o.y, footH: o.footH })),
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
            try { localStorage.setItem(CFG_KEY, JSON.stringify(_exportData())); } catch (e) {}
        }
        window.removeEventListener('pointermove', _dragMove);
        window.removeEventListener('pointerup', _dragEnd);
        S.edit.feet.forEach(f => f.remove());
        S.edit.markers.forEach(m => m.remove());
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
        setTalkTarget: (t) => { S.talkTarget = t || null; },
        endTalk,
        getNpcHistory,
        pushNpcHistory,
        popNpcHistoryTail,
        _S: S,
    };
})();
