// ----------------------------------------------------------------
// [檔案] os_landlord_room.js
// 路徑：os_phone/os/os_landlord_room.js
// 職責：包租婆「房間」頁與包裹配送玩法——玩家把包裹丟進空房、擺好位置、按配送，
//       整間房一次生出來。生成邏輯全在 os_room_gen.js，這裡只管畫面與操作。
//   🚨 房間圖生好就存起來，之後開房直接讀，不重生。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const d = win.document;

    const MAX_ITEMS = 10;          // 一間房最多擺幾件（太多會擠成一團，生圖也顧不來）
    const DRAG_SLOP = 6;           // 拖曳判定門檻：位移小於這個就算「點一下」

    function _LL() { return win.OS_LANDLORD || window.OS_LANDLORD || null; }
    function _GEN() { return win.OS_ROOM_GEN || window.OS_ROOM_GEN || null; }
    function _SVG() { return win.OS_ROOM_SVG || window.OS_ROOM_SVG || null; }

    // 布置中的暫存：離開布置頁就丟掉，只有按下配送才寫進房間
    let _draft = null;   // { unitId, items:[{id,name,content,x,y}], base:{...} }

    function _injectStyle() {
        if (d.getElementById('llr-style')) return;
        const s = d.createElement('style'); s.id = 'llr-style';
        s.textContent = [
            // 小窗與忙碌遮罩都貼在這層上,所以外框一定要是定位基準
            '.llr-host{position:relative}',
            '.llr-stage{position:relative;border:1px solid #2c3140;border-radius:10px;overflow:hidden;background:#12151c;margin:10px 0}',
            '.llr-stage-img{display:block;width:100%;height:auto}',
            '.llr-layer{position:absolute;left:0;top:0;right:0;bottom:0}',
            '.llr-pkg{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;',
            '  padding:6px 8px;border-radius:9px;border:1px solid #d9b06a;background:rgba(20,23,30,.86);color:#f0e2c6;',
            '  font-size:11px;font-family:inherit;cursor:grab;touch-action:none;max-width:44%}',
            '.llr-pkg.is-drag{cursor:grabbing;border-color:#d98fb0;z-index:3}',
            '.llr-pkg-name{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.llr-pkg-unnamed{color:#9aa1b0}',
            '.llr-bar{display:flex;gap:8px;margin-top:10px}',
            '.llr-bar .ll-btn{flex:1}',
            '.llr-photo{display:block;width:100%;height:auto;border:1px solid #2c3140;border-radius:10px;margin:10px 0}',
            '.llr-sheet{position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(8,10,14,.72);display:flex;align-items:center;justify-content:center;padding:18px;z-index:9}',
            '.llr-card{width:100%;max-width:320px;border:1px solid #2c3140;border-radius:12px;background:#171a21;padding:14px}',
            '.llr-card-title{font-size:13px;font-weight:700;color:#e7eaf1;margin-bottom:10px}',
            '.llr-field{display:block;font-size:11px;color:#9aa1b0;margin:8px 0 4px}',
            '.llr-input,.llr-area{width:100%;box-sizing:border-box;border:1px solid #2c3140;border-radius:8px;background:#0e1015;color:#e7eaf1;font-family:inherit;font-size:12px;padding:8px}',
            '.llr-area{min-height:64px;resize:vertical}',
            '.llr-card-bar{display:flex;gap:8px;margin-top:12px}',
            '.llr-card-bar .ll-btn{flex:1}',
            '.llr-danger{border-color:#5a3038;color:#e0a0a8}',
            '.llr-busy{position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(8,10,14,.78);display:flex;align-items:center;justify-content:center;padding:18px;text-align:center;color:#e7eaf1;font-size:13px;line-height:1.7;z-index:10}',
        ].join('\n');
        (d.head || d.documentElement).appendChild(s);
    }

    function _wrap() { const w = d.createElement('div'); w.className = 'll-wrap llr-host'; return w; }
    function _btn(iconClass, text, extraClass) {
        const b = d.createElement('button');
        b.className = 'll-btn' + (extraClass ? ' ' + extraClass : '');
        b.innerHTML = '<i class="' + iconClass + '"></i> ' + text;
        return b;
    }
    function _note(text, cls) {
        const n = d.createElement('div'); n.className = 'll-note' + (cls ? ' ' + cls : '');
        n.textContent = text; return n;
    }

    function _specOf(unit) {
        const RT = (_SVG() && _SVG().ROOM_TYPES) || {};
        const t = RT[unit && unit.roomTypeKey] || RT.standard || { w: 4.2, d: 4.0, wallH: 1.0, floor: 'oak' };
        return { w: t.w, d: t.d, wallH: t.wallH, floor: t.floor, window: true, label: t.label || '' };
    }

    async function _loadUnit(unitId) {
        const LL = _LL();
        if (!LL) throw new Error('房產還沒載入。');
        const state = await LL.getState();
        const unit = state.units.find(function (u) { return u.id === unitId; });
        if (!unit) throw new Error('找不到這一戶。');
        return unit;
    }

    // ── 房間頁：有圖看圖，沒圖看空房 ──
    async function open(root, unitId) {
        _injectStyle();
        _draft = null;
        root.innerHTML = '<div class="ll-wrap"><div class="ll-note">正在開門…</div></div>';

        let unit, room, base;
        try {
            unit = await _loadUnit(unitId);
            room = await _LL().getRoom(unitId);
            if (!room || !room.image) base = await _GEN().buildBase(_specOf(unit));
        } catch (e) {
            console.warn('[LandlordRoom] 開房失敗', e);
            _fail(root, unitId, (e && e.message) || '房間暫時打不開。');
            return;
        }

        const spec = _specOf(unit);
        const wrap = _wrap();
        const head = d.createElement('div'); head.className = 'll-head';
        head.innerHTML = '<span class="ll-title"><i class="fa-solid fa-door-open"></i> '
            + (unit.tenantName || '房客') + '的房間</span><span class="ll-purse">' + (spec.label || '') + '</span>';
        wrap.appendChild(head);

        if (room && room.image) {
            const img = d.createElement('img'); img.className = 'llr-photo'; img.src = room.image; img.alt = '房間';
            wrap.appendChild(img);
            wrap.appendChild(_note('房間布置好了。想換個樣子，就重新丟一次包裹。'));
        } else {
            const stage = d.createElement('div'); stage.className = 'llr-stage';
            const img = d.createElement('img'); img.className = 'llr-stage-img'; img.src = base.baseData; img.alt = '空房';
            stage.appendChild(img);
            wrap.appendChild(stage);
            wrap.appendChild(_note('這間房還空著。丟幾個包裹進來，房客就有東西用了。'));
        }

        const bar = d.createElement('div'); bar.className = 'llr-bar';
        const back = _btn('fa-solid fa-arrow-left', '回房產');
        back.onclick = function () { const LL = _LL(); if (LL) LL.launch(root); };
        const go = _btn('fa-solid fa-box-open', (room && room.image) ? '重新布置' : '布置房間');
        go.onclick = function () { _arrange(root, unitId, (room && room.order) || []); };
        bar.appendChild(back); bar.appendChild(go);
        wrap.appendChild(bar);

        root.innerHTML = ''; root.appendChild(wrap);
    }

    function _fail(root, unitId, msg) {
        const wrap = _wrap();
        wrap.appendChild(_note(msg, 'll-error'));
        const bar = d.createElement('div'); bar.className = 'llr-bar';
        const back = _btn('fa-solid fa-arrow-left', '回房產');
        back.onclick = function () { const LL = _LL(); if (LL) LL.launch(root); };
        const retry = _btn('fa-solid fa-rotate-right', '再試一次');
        retry.onclick = function () { open(root, unitId); };
        bar.appendChild(back); bar.appendChild(retry);
        wrap.appendChild(bar);
        root.innerHTML = ''; root.appendChild(wrap);
    }

    // ── 布置頁：丟包裹、擺位置、按配送 ──
    async function _arrange(root, unitId, prevOrder) {
        _injectStyle();
        root.innerHTML = '<div class="ll-wrap"><div class="ll-note">正在準備空房…</div></div>';

        let unit, base;
        try {
            unit = await _loadUnit(unitId);
            base = await _GEN().buildBase(_specOf(unit));
        } catch (e) {
            console.warn('[LandlordRoom] 準備空房失敗', e);
            _fail(root, unitId, (e && e.message) || '空房暫時準備不出來。');
            return;
        }

        _draft = {
            unitId: unitId,
            base: base,
            items: (Array.isArray(prevOrder) ? prevOrder : []).slice(0, MAX_ITEMS).map(function (it, i) {
                return { id: 'p' + i + '_' + Math.random().toString(36).slice(2, 6), name: String(it.name || ''), content: String(it.content || ''), x: Number(it.x) || 50, y: Number(it.y) || 50 };
            }),
        };

        const wrap = _wrap();
        const head = d.createElement('div'); head.className = 'll-head';
        head.innerHTML = '<span class="ll-title"><i class="fa-solid fa-box-open"></i> 布置 '
            + (unit.tenantName || '房客') + '的房間</span>';
        wrap.appendChild(head);
        wrap.appendChild(_note('把想放的東西丟進房裡，拖到你要的位置，都擺好就按配送。'));

        const stage = d.createElement('div'); stage.className = 'llr-stage';
        const img = d.createElement('img'); img.className = 'llr-stage-img'; img.src = base.baseData; img.alt = '空房';
        const layer = d.createElement('div'); layer.className = 'llr-layer';
        stage.appendChild(img); stage.appendChild(layer);
        wrap.appendChild(stage);

        const status = _note('');
        wrap.appendChild(status);

        const bar = d.createElement('div'); bar.className = 'llr-bar';
        const back = _btn('fa-solid fa-arrow-left', '回房間');
        const add = _btn('fa-solid fa-plus', '添加包裹');
        const ship = _btn('fa-solid fa-truck-fast', '配送');
        bar.appendChild(back); bar.appendChild(add); bar.appendChild(ship);
        wrap.appendChild(bar);

        root.innerHTML = ''; root.appendChild(wrap);

        function refreshStatus() {
            const n = _draft.items.length;
            status.textContent = n ? ('房裡有 ' + n + ' 個包裹。點包裹可以改名稱或拿走。') : '房間還是空的，先添加一個包裹。';
        }

        function redraw() {
            layer.innerHTML = '';
            _draft.items.forEach(function (it) { layer.appendChild(_makePkg(it, stage, layer, wrap, redraw, refreshStatus)); });
            refreshStatus();
        }

        back.onclick = function () { open(root, unitId); };
        add.onclick = function () {
            if (_draft.items.length >= MAX_ITEMS) {
                status.textContent = '一間房最多放 ' + MAX_ITEMS + ' 個包裹，先拿走一個再放。';
                return;
            }
            const spot = _freeSpot();
            const it = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: '', content: '', x: spot.x, y: spot.y };
            _draft.items.push(it);
            redraw();
            _openEditor(wrap, it, redraw, refreshStatus);
        };
        ship.onclick = function () { _deliver(root, unitId, wrap, [back, add, ship], status); };

        redraw();
    }

    // 新包裹落點：從房間中央往外找一個地板上、又沒被其他包裹占住的位置
    function _freeSpot() {
        const S = _SVG(), base = _draft.base;
        const vb = base.room.viewBox, floor = base.room.floor;
        const cands = [[50, 50], [35, 45], [65, 45], [50, 68], [35, 68], [65, 68], [50, 34], [30, 55], [70, 55], [42, 58], [58, 58]];
        for (let i = 0; i < cands.length; i++) {
            const x = cands[i][0], y = cands[i][1];
            if (S && !S.pointInPolygon([x / 100 * vb[0], y / 100 * vb[1]], floor)) continue;
            const busy = _draft.items.some(function (it) { return Math.abs(it.x - x) < 9 && Math.abs(it.y - y) < 9; });
            if (!busy) return { x: x, y: y };
        }
        return { x: 50, y: 55 };
    }

    function _onFloor(x, y) {
        const S = _SVG(), base = _draft && _draft.base;
        if (!S || !base || !base.room || !base.room.floor) return true;
        return S.pointInPolygon([x / 100 * base.room.viewBox[0], y / 100 * base.room.viewBox[1]], base.room.floor);
    }

    function _makePkg(it, stage, layer, wrap, redraw, refreshStatus) {
        const el = d.createElement('button');
        el.className = 'llr-pkg';
        el.type = 'button';
        el.innerHTML = '<i class="fa-solid fa-box"></i><span class="llr-pkg-name' + (it.name ? '' : ' llr-pkg-unnamed') + '">'
            + (it.name ? _esc(it.name) : '未命名') + '</span>';
        el.style.left = it.x + '%';
        el.style.top = it.y + '%';

        let dragging = false, moved = 0, startX = 0, startY = 0, lastX = it.x, lastY = it.y;

        el.addEventListener('pointerdown', function (ev) {
            dragging = true; moved = 0;
            startX = ev.clientX; startY = ev.clientY;
            lastX = it.x; lastY = it.y;
            el.classList.add('is-drag');
            try { el.setPointerCapture(ev.pointerId); } catch (e) {}
        });
        el.addEventListener('pointermove', function (ev) {
            if (!dragging) return;
            moved = Math.max(moved, Math.hypot(ev.clientX - startX, ev.clientY - startY));
            const r = stage.getBoundingClientRect();
            if (!r.width || !r.height) return;
            const x = Math.max(2, Math.min(98, (ev.clientX - r.left) / r.width * 100));
            const y = Math.max(2, Math.min(98, (ev.clientY - r.top) / r.height * 100));
            it.x = x; it.y = y;
            el.style.left = x + '%';
            el.style.top = y + '%';
        });
        function endDrag(ev) {
            if (!dragging) return;
            dragging = false;
            el.classList.remove('is-drag');
            try { el.releasePointerCapture(ev.pointerId); } catch (e) {}
            if (moved < DRAG_SLOP) {
                it.x = lastX; it.y = lastY;
                el.style.left = lastX + '%'; el.style.top = lastY + '%';
                _openEditor(wrap, it, redraw, refreshStatus);
                return;
            }
            // 掉出房間地板 → 退回原位，包裹只能放在房間裡
            if (!_onFloor(it.x, it.y)) {
                it.x = lastX; it.y = lastY;
                el.style.left = lastX + '%'; el.style.top = lastY + '%';
            }
        }
        el.addEventListener('pointerup', endDrag);
        el.addEventListener('pointercancel', endDrag);
        return el;
    }

    function _esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // 包裹編輯窗：名稱＋內容，或直接拿走
    function _openEditor(wrap, it, redraw, refreshStatus) {
        const sheet = d.createElement('div'); sheet.className = 'llr-sheet';
        const card = d.createElement('div'); card.className = 'llr-card';
        const title = d.createElement('div'); title.className = 'llr-card-title'; title.textContent = '這個包裹裡是什麼？';
        const l1 = d.createElement('label'); l1.className = 'llr-field'; l1.textContent = '名稱';
        const name = d.createElement('input'); name.className = 'llr-input'; name.type = 'text'; name.value = it.name || ''; name.maxLength = 20;
        const l2 = d.createElement('label'); l2.className = 'llr-field'; l2.textContent = '想要什麼樣子（可以留白）';
        const content = d.createElement('textarea'); content.className = 'llr-area'; content.value = it.content || ''; content.maxLength = 120;

        const bar = d.createElement('div'); bar.className = 'llr-card-bar';
        const drop = _btn('fa-solid fa-trash', '拿走', 'llr-danger');
        const ok = _btn('fa-solid fa-check', '好了');
        bar.appendChild(drop); bar.appendChild(ok);

        card.appendChild(title); card.appendChild(l1); card.appendChild(name);
        card.appendChild(l2); card.appendChild(content); card.appendChild(bar);
        sheet.appendChild(card);
        wrap.appendChild(sheet);
        try { name.focus(); } catch (e) {}

        function close() { try { wrap.removeChild(sheet); } catch (e) {} }
        drop.onclick = function () {
            _draft.items = _draft.items.filter(function (x) { return x.id !== it.id; });
            close(); redraw();
        };
        ok.onclick = function () {
            it.name = String(name.value || '').trim();
            it.content = String(content.value || '').trim();
            close(); redraw();
        };
    }

    // ── 配送：訂單 → 整房一次生圖 → 存起來 ──
    async function _deliver(root, unitId, wrap, btns, status) {
        const items = _draft.items;
        if (!items.length) { status.textContent = '房間還是空的，先添加一個包裹。'; return; }
        if (items.some(function (it) { return !String(it.name || '').trim(); })) {
            status.textContent = '有包裹還沒寫名稱，點開它填一下再配送。';
            return;
        }
        btns.forEach(function (b) { b.disabled = true; });

        const busy = d.createElement('div'); busy.className = 'llr-busy';
        busy.textContent = '正在核對這批包裹…';
        wrap.appendChild(busy);

        const order = items.map(function (it) { return { name: it.name, content: it.content, x: it.x, y: it.y }; });
        try {
            const result = await _GEN().deliver(_specOf(await _loadUnit(unitId)), order, function (msg) { busy.textContent = msg; });
            busy.textContent = '正在收好房間…';
            await _LL().saveRoom(unitId, {
                image: result.image, layout: result.layout, order: order,
                styleName: result.styleName, at: result.at,
            });
            _draft = null;
            await open(root, unitId);
        } catch (e) {
            console.warn('[LandlordRoom] 配送失敗', e);
            try { wrap.removeChild(busy); } catch (_) {}
            btns.forEach(function (b) { b.disabled = false; });
            status.textContent = (e && e.message) || '這次沒送成，再按一次配送就好。';
        }
    }

    win.OS_LANDLORD_ROOM = { open };
    if (win !== window) { try { window.OS_LANDLORD_ROOM = win.OS_LANDLORD_ROOM; } catch (e) {} }
    console.log('[LandlordRoom] 房間包裹配送已載入');
})();
