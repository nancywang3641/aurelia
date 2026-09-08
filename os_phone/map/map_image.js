// ----------------------------------------------------------------
// [檔案] map_image.js (V1.0 - 2026-09-09)
// 職責：奧瑞亞預設世界的「斜俯視圖片地圖」。全城一張、七區各一張，每張五個時段；
//       圖是預先生成的 WebP（素材倉 aurelia-ui-assets/aseets/map3d，鎖 commit 走 jsdelivr），
//       這裡只做：挑時段、載圖、拖曳、雙指與滾輪縮放、把直立的圖釘貼在座標上。
//       沒有 WebGL、沒有常駐動畫：只有互動那一刻排一次 requestAnimationFrame。
//       圖釘座標是圖寬高的比例（0～1，左上為原點），用 sceneId 對回 map_data，不用中文名。
//       只給奧瑞亞預設世界用；動態世界沒有圖，map_core 照走原本的字母格與設施格。
// ----------------------------------------------------------------
(function () {
    const win = window.parent || window;

    const BASE = 'https://cdn.jsdelivr.net/gh/nancywang3641/aurelia-ui-assets@dee0b2a/aseets/map3d/';
    const TIME_LABELS = { morning: '早晨', day: '白天', dusk: '黃昏', night: '夜晚', predawn: '凌晨' };

    // 座標來源：tmp/aurelia_site/img/map3d_coords.json（阿洛 2026-09-09 交付）烤進來的快照。
    // CITY 的 pins 是七區入口，其餘是各區設施；w/h 是原圖尺寸，def 是沒有故事時鐘時的預設時段。
    const MAPS = {
        CITY: { w: 1774, h: 887, def: 'day', pins: [
            { id: 'A', x: 0.448, y: 0.351 },
            { id: 'B', x: 0.206, y: 0.477 },
            { id: 'C', x: 0.188, y: 0.284 },
            { id: 'D', x: 0.827, y: 0.205 },
            { id: 'E', x: 0.287, y: 0.723 },
            { id: 'F', x: 0.577, y: 0.759 },
            { id: 'G', x: 0.847, y: 0.465 },
        ] },
        A: { w: 1672, h: 941, def: 'day', pins: [
            { id: 'A_Stellar_Nexus', x: 0.286, y: 0.353 },
            { id: 'A_Lumen_Loop', x: 0.605, y: 0.728 },
            { id: 'A_Orion_Global', x: 0.71, y: 0.438 },
            { id: 'A_Solaris_Apex', x: 0.512, y: 0.297 },
            { id: 'A_Commerce_District', x: 0.287, y: 0.76 },
        ] },
        B: { w: 1672, h: 941, def: 'night', pins: [
            { id: 'B_LUXA_DOME', x: 0.252, y: 0.223 },
            { id: 'B_NOVA_Mall', x: 0.674, y: 0.188 },
            { id: 'B_Decibel_Ruins', x: 0.232, y: 0.513 },
            { id: 'B_Graffiti_Buildings', x: 0.459, y: 0.456 },
            { id: 'B_B_Street_24', x: 0.679, y: 0.486 },
            { id: 'B_Night_Market', x: 0.505, y: 0.721 },
            { id: 'B_Nocturne_Arena', x: 0.3, y: 0.784 },
            { id: 'B_Nocturne_Police', x: 0.722, y: 0.719 },
            { id: 'B_Residential_Zone', x: 0.869, y: 0.451 },
        ] },
        C: { w: 1672, h: 941, def: 'day', pins: [
            { id: 'C_Civic_Hall', x: 0.22, y: 0.191 },
            { id: 'C_Horizon_Medical', x: 0.793, y: 0.173 },
            { id: 'C_Central_Library', x: 0.22, y: 0.434 },
            { id: 'C_Light_Square', x: 0.497, y: 0.413 },
            { id: 'C_Daily_Market', x: 0.149, y: 0.776 },
            { id: 'C_Council_Hall', x: 0.509, y: 0.165 },
            { id: 'C_Education_District', x: 0.78, y: 0.521 },
            { id: 'C_Residential_Zone', x: 0.483, y: 0.788 },
        ] },
        D: { w: 1672, h: 941, def: 'dusk', pins: [
            { id: 'D_Vigil_Spire', x: 0.242, y: 0.3 },
            { id: 'D_Black_Obsidian', x: 0.49, y: 0.354 },
            { id: 'D_Sky_Dome_Port', x: 0.818, y: 0.175 },
            { id: 'D_Platinum_Promenade', x: 0.34, y: 0.638 },
            { id: 'D_Diamond_Marina', x: 0.749, y: 0.795 },
            { id: 'D_Noble_Social_Club', x: 0.474, y: 0.575 },
            { id: 'D_Ivory_High_School', x: 0.741, y: 0.398 },
            { id: 'D_Manor_District', x: 0.311, y: 0.166 },
        ] },
        E: { w: 1672, h: 941, def: 'night', pins: [
            { id: 'E_Wreckspire', x: 0.264, y: 0.196 },
            { id: 'E_Crimson_Cellar', x: 0.191, y: 0.761 },
            { id: 'E_Shadow_Furnace', x: 0.435, y: 0.746 },
            { id: 'E_Glitch_Dome', x: 0.5, y: 0.202 },
            { id: 'E_Null_Sanctuary', x: 0.72, y: 0.267 },
            { id: 'E_Pulse_Street', x: 0.414, y: 0.498 },
            { id: 'E_Silent_Haven', x: 0.18, y: 0.455 },
            { id: 'E_Tin_City', x: 0.711, y: 0.536 },
            { id: 'E_Mod_Workshop', x: 0.637, y: 0.646 },
            { id: 'E_Tin_Garage', x: 0.8, y: 0.712 },
        ] },
        F: { w: 1672, h: 941, def: 'morning', pins: [
            { id: 'F_Container_Dock', x: 0.516, y: 0.422 },
            { id: 'F_Aether_Towers', x: 0.25, y: 0.174 },
            { id: 'F_Harbor_Loft', x: 0.206, y: 0.446 },
            { id: 'F_Dock_Canteen', x: 0.194, y: 0.755 },
        ] },
        G: { w: 1672, h: 941, def: 'night', pins: [
            { id: 'G_Silver_Tier', x: 0.439, y: 0.4 },
            { id: 'G_Gold_Tier', x: 0.448, y: 0.275 },
            { id: 'G_Diamond_VIP', x: 0.448, y: 0.172 },
            { id: 'G_Sky_Palace_Hotel', x: 0.775, y: 0.304 },
            { id: 'G_Entertainment_Hub', x: 0.165, y: 0.334 },
            { id: 'G_Underground_Ring', x: 0.528, y: 0.588 },
        ] },
    };

    // === 時段 ===
    // 故事時鐘有時間就照它，沒有就照真實時間（跟首頁底圖 getHomeBackground 同一種判斷）。
    function slotFromHour(h) {
        if (h >= 2 && h <= 4) return 'predawn';
        if (h >= 5 && h <= 9) return 'morning';
        if (h >= 10 && h <= 16) return 'day';
        if (h >= 17 && h <= 18) return 'dusk';
        return 'night';
    }
    async function pickTime() {
        try {
            const api = win.OS_MC_STATUS;
            if (api && typeof api.load === 'function') {
                const st = await api.load();
                const m = String((st && st.time) || '').match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
                if (m) return slotFromHour(parseInt(m[1], 10) % 24);
            }
        } catch (e) { /* 沒有狀態模組就退回真實時間 */ }
        return slotFromHour(new Date().getHours());
    }
    function imageUrl(mapId, time) { return BASE + 'MAP3D-' + mapId + '-' + time + '.webp'; }
    function has(mapId) { return Object.prototype.hasOwnProperty.call(MAPS, mapId); }
    function pinsOf(mapId) { return has(mapId) ? MAPS[mapId].pins : []; }

    // === 舞台 ===
    // mount(stageEl, { mapId, pins:[{ id, x, y, html, onClick }], onFail })
    // 回傳 handle：{ destroy }。同一時間只有一個舞台活著，再 mount 會先把前一個拆掉。
    let active = null;
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

    function mount(stage, opts) {
        destroyActive();
        const map = MAPS[opts.mapId];
        if (!stage || !map) return null;

        stage.classList.add('am-imap');
        stage.innerHTML = '<div class="am-imap-plane"><img alt="" draggable="false"></div><div class="am-imap-pins"></div><div class="am-imap-loading">LOADING</div><div class="am-imap-time"></div>';
        const plane = stage.querySelector('.am-imap-plane');
        const img = plane.querySelector('img');
        const pinLayer = stage.querySelector('.am-imap-pins');
        const loading = stage.querySelector('.am-imap-loading');
        const timeEl = stage.querySelector('.am-imap-time');

        const W = map.w, H = map.h;
        plane.style.width = W + 'px';
        plane.style.height = H + 'px';

        const pins = (opts.pins || []).map(p => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'am-imap-pin';
            el.dataset.id = p.id;
            el.innerHTML = p.html || '';
            el.addEventListener('click', (e) => { e.stopPropagation(); if (typeof p.onClick === 'function') p.onClick(p.id); });
            pinLayer.appendChild(el);
            return { x: p.x, y: p.y, el };
        });

        const st = { minScale: 1, maxScale: 1, scale: 1, px: 0, py: 0, frame: 0, alive: true };
        const pointers = new Map();
        let gesture = null;
        let moved = false;

        function size() { const r = stage.getBoundingClientRect(); return { w: Math.max(1, r.width), h: Math.max(1, r.height) }; }
        function constrain() {
            const { w, h } = size();
            const bw = W * st.scale, bh = H * st.scale;
            st.px = bw <= w ? (w - bw) / 2 : clamp(st.px, w - bw, 0);
            st.py = bh <= h ? (h - bh) / 2 : clamp(st.py, h - bh, 0);
        }
        function paint() {
            if (st.frame || !st.alive) return;
            st.frame = requestAnimationFrame(() => {
                st.frame = 0;
                plane.style.transform = 'translate(' + st.px + 'px,' + st.py + 'px) scale(' + st.scale + ')';
                for (const p of pins) {
                    p.el.style.left = (st.px + p.x * W * st.scale) + 'px';
                    p.el.style.top = (st.py + p.y * H * st.scale) + 'px';
                }
            });
        }
        // 起手鋪滿舞台（跟地圖 app 一樣），最小可以捏到整張放進來，最大放到五倍。
        function fit() {
            const { w, h } = size();
            const contain = Math.min(w / W, h / H), cover = Math.max(w / W, h / H);
            st.minScale = contain;
            st.maxScale = Math.max(contain * 5, cover * 2);
            st.scale = Math.min(cover, contain * 4);
            st.px = (w - W * st.scale) / 2;
            st.py = (h - H * st.scale) / 2;
            constrain();
            paint();
        }
        function zoomAt(factor, x, y) {
            const next = clamp(st.scale * factor, st.minScale, st.maxScale);
            st.px = x - (x - st.px) * next / st.scale;
            st.py = y - (y - st.py) * next / st.scale;
            st.scale = next;
            constrain();
            paint();
        }
        function local(e) { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
        function resetGesture() {
            const a = [...pointers.values()];
            gesture = a.length >= 2
                ? { dist: Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y), mid: { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 } }
                : null;
        }

        const onDown = (e) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            if (e.target.closest('.am-imap-pin')) return;
            pointers.set(e.pointerId, local(e));
            moved = false;
            try { stage.setPointerCapture(e.pointerId); } catch (err) {}
            stage.classList.add('dragging');
            resetGesture();
        };
        const onMove = (e) => {
            if (!pointers.has(e.pointerId)) return;
            const p = local(e), old = pointers.get(e.pointerId);
            pointers.set(e.pointerId, p);
            if (pointers.size >= 2 && gesture) {
                const a = [...pointers.values()];
                const dist = Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y);
                const mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
                if (gesture.dist > 0) zoomAt(dist / gesture.dist, mid.x, mid.y);
                st.px += mid.x - gesture.mid.x;
                st.py += mid.y - gesture.mid.y;
                gesture = { dist, mid };
                constrain(); paint();
                moved = true;
                return;
            }
            const dx = p.x - old.x, dy = p.y - old.y;
            if (Math.abs(dx) + Math.abs(dy) > 0) moved = true;
            st.px += dx; st.py += dy;
            constrain(); paint();
        };
        const onUp = (e) => {
            pointers.delete(e.pointerId);
            resetGesture();
            if (!pointers.size) stage.classList.remove('dragging');
        };
        const onWheel = (e) => {
            e.preventDefault();
            const p = local(e);
            zoomAt(Math.exp(-clamp(e.deltaY, -180, 180) * 0.0015), p.x, p.y);
        };
        const onDbl = (e) => {
            if (e.target.closest('.am-imap-pin')) return;
            const p = local(e);
            zoomAt(st.scale < st.minScale * 2 ? 2 : st.minScale / st.scale, p.x, p.y);
        };
        stage.addEventListener('pointerdown', onDown);
        stage.addEventListener('pointermove', onMove);
        stage.addEventListener('pointerup', onUp);
        stage.addEventListener('pointercancel', onUp);
        stage.addEventListener('wheel', onWheel, { passive: false });
        stage.addEventListener('dblclick', onDbl);

        let ro = null;
        if (win.ResizeObserver) { ro = new win.ResizeObserver(() => { if (!st.alive) return; constrain(); paint(); }); ro.observe(stage); }

        // 載圖：先挑時段再載；載到才把 LOADING 拿掉，載不到交給 onFail（map_core 會退回原本的格子）。
        let token = 0;
        (async () => {
            const time = await pickTime();
            if (!st.alive) return;
            const my = ++token;
            timeEl.textContent = TIME_LABELS[time] || '';
            img.onload = () => { if (!st.alive || my !== token) return; loading.remove(); fit(); };
            img.onerror = () => { if (!st.alive || my !== token) return; console.warn('[MapImage] 圖片載入失敗', opts.mapId, time); destroy(); if (typeof opts.onFail === 'function') opts.onFail(); };
            img.src = imageUrl(opts.mapId, time);
        })();

        function destroy() {
            if (!st.alive) return;
            st.alive = false;
            if (st.frame) cancelAnimationFrame(st.frame);
            stage.removeEventListener('pointerdown', onDown);
            stage.removeEventListener('pointermove', onMove);
            stage.removeEventListener('pointerup', onUp);
            stage.removeEventListener('pointercancel', onUp);
            stage.removeEventListener('wheel', onWheel);
            stage.removeEventListener('dblclick', onDbl);
            if (ro) { try { ro.disconnect(); } catch (err) {} }
            img.onload = img.onerror = null;
            img.removeAttribute('src');
            stage.classList.remove('am-imap', 'dragging');
            if (active && active.stage === stage) active = null;
        }

        active = { stage, destroy };
        return active;
    }
    function destroyActive() { if (active) { try { active.destroy(); } catch (e) {} active = null; } }

    win.AUREALIS_MAP_IMAGE = { has, pinsOf, mount, destroyActive, pickTime, imageUrl, TIME_LABELS, BASE };
    if (win !== window) window.AUREALIS_MAP_IMAGE = win.AUREALIS_MAP_IMAGE;
    console.log('[PhoneOS] 載入奧瑞亞圖片地圖 (map_image V1.0)');
})();
