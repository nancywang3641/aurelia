// ----------------------------------------------------------------
// [檔案] os_landlord_room.js
// 路徑：os_phone/os/os_landlord_room.js
// 職責：房間＝舞台上的一個場景，不是面板裡的一張圖。
//   進房間 → 小人真的走進去(房間圖當底圖、房間地板當可走區)；
//   布置 → 站在房裡把包裹丟到想要的位置 → 按配送 → 整間房當場變樣。
//   生成邏輯全在 os_room_gen.js，這裡只管「走進去」與「站在裡面擺」。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const d = win.document;

    const MAX_ITEMS = 10;      // 一間房最多幾件（再多會擠成一團，生圖也顧不來）
    const DRAG_SLOP = 6;       // 位移小於這個算「點一下」不算拖曳
    // 🧍 小人多高不在這裡調：房間圖已經照「一個人＝固定像素高」縮放好了（os_room_gen 的 PERSON_PX），
    //   這裡照著用就好，小人才會在每一間房都是同一個大小。

    function _LL() { return win.OS_LANDLORD || window.OS_LANDLORD || null; }
    function _GEN() { return win.OS_ROOM_GEN || window.OS_ROOM_GEN || null; }
    function _SVG() { return win.OS_ROOM_SVG || window.OS_ROOM_SVG || null; }
    function _STAGE() { return win.LobbyStage || window.LobbyStage || null; }

    // 目前站在哪間房：進門時填，走出去就作廢
    let _ctx = null;   // { unitId, unitName, room, viewBox, floor, fit, items, deco }

    function _injectStyle() {
        if (d.getElementById('llr-style')) return;
        const s = d.createElement('style'); s.id = 'llr-style';
        s.textContent = [
            // 房間右下角的浮鈕組：跟舞台既有的聊天浮鈕同一種語言，位置錯開，由下往上疊
            '.llr-fabs{position:absolute;right:18px;bottom:96px;z-index:60;display:flex;flex-direction:column;gap:8px;align-items:flex-end}',
            '.llr-fab{display:flex;align-items:center;gap:7px;',
            '  padding:10px 14px;border-radius:22px;border:1px solid rgba(217,176,106,.55);background:rgba(14,16,21,.86);',
            '  color:#f0e2c6;font-size:13px;font-family:inherit;cursor:pointer}',
            '.llr-fab:hover{border-color:#d98fb0}',
            '.llr-fab:disabled{opacity:.5;cursor:default}',
            // 布置模式的工具列：螢幕座標，不跟著舞台縮放
            '.llr-bar{position:absolute;left:0;right:0;bottom:0;z-index:62;display:flex;gap:8px;justify-content:center;',
            '  padding:12px 14px;background:linear-gradient(180deg,rgba(14,16,21,0) 0%,rgba(14,16,21,.9) 45%)}',
            '.llr-btn{display:flex;align-items:center;gap:6px;padding:9px 14px;border-radius:10px;',
            '  border:1px solid #2c3140;background:#20242e;color:#e7eaf1;font-size:13px;font-family:inherit;cursor:pointer}',
            '.llr-btn:hover{border-color:#d98fb0}',
            '.llr-btn:disabled{opacity:.5;cursor:default}',
            '.llr-btn.is-go{border-color:rgba(217,176,106,.6);color:#f0e2c6}',
            '.llr-tip{position:absolute;left:0;right:0;top:0;z-index:62;padding:12px 16px;text-align:center;',
            '  color:#e7eaf1;font-size:13px;line-height:1.6;background:linear-gradient(180deg,rgba(14,16,21,.9) 0%,rgba(14,16,21,0) 100%);pointer-events:none}',
            // 包裹層：鋪滿舞台世界層，讓包裹的座標跟舞台同一套
            '.llr-layer{position:absolute;left:0;top:0;width:1536px;height:1024px}',
            // 包裹：掛在舞台世界層，吃同一個縮放，所以字級用世界座標放大
            '.llr-pkg{position:absolute;z-index:5000;transform:translate(-50%,-50%);display:flex;flex-direction:column;',
            '  align-items:center;gap:4px;padding:10px 14px;border-radius:14px;border:2px solid #d9b06a;',
            '  background:rgba(20,23,30,.88);color:#f0e2c6;font-size:26px;font-family:inherit;cursor:grab;',
            '  touch-action:none;white-space:nowrap}',
            '.llr-pkg.is-drag{cursor:grabbing;border-color:#d98fb0}',
            '.llr-pkg-unnamed{color:#9aa1b0}',
            // 包裹小窗與忙碌遮罩：蓋整個舞台
            '.llr-sheet{position:absolute;left:0;top:0;right:0;bottom:0;z-index:70;background:rgba(8,10,14,.72);',
            '  display:flex;align-items:center;justify-content:center;padding:18px}',
            '.llr-card{width:100%;max-width:320px;border:1px solid #2c3140;border-radius:12px;background:#171a21;padding:14px}',
            '.llr-card-title{font-size:13px;font-weight:700;color:#e7eaf1;margin-bottom:10px}',
            '.llr-field{display:block;font-size:11px;color:#9aa1b0;margin:8px 0 4px}',
            '.llr-input,.llr-area{width:100%;box-sizing:border-box;border:1px solid #2c3140;border-radius:8px;',
            '  background:#0e1015;color:#e7eaf1;font-family:inherit;font-size:12px;padding:8px}',
            '.llr-area{min-height:64px;resize:vertical}',
            '.llr-card-bar{display:flex;gap:8px;margin-top:12px}',
            '.llr-card-bar .llr-btn{flex:1;justify-content:center}',
            '.llr-danger{border-color:#5a3038;color:#e0a0a8}',
            // 樓層清單：一層一顆，會換行
            '.llr-floors{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}',
            '.llr-floors .llr-btn{flex:0 0 auto}',
            '.llr-btn.is-now{border-color:rgba(217,176,106,.6);color:#f0e2c6}',
            '.llr-msg{margin-top:10px;font-size:12px;line-height:1.7;color:#9aa1b0}',
            '.llr-msg.is-bad{color:#e0a0a8}',
            '.llr-busy{position:absolute;left:0;top:0;right:0;bottom:0;z-index:75;background:rgba(8,10,14,.8);',
            '  display:flex;align-items:center;justify-content:center;padding:18px;text-align:center;',
            '  color:#e7eaf1;font-size:14px;line-height:1.8}',
        ].join('\n');
        (d.head || d.documentElement).appendChild(s);
    }

    function _btn(iconClass, text, extraClass) {
        const b = d.createElement('button');
        b.type = 'button';
        b.className = 'llr-btn' + (extraClass ? ' ' + extraClass : '');
        b.innerHTML = '<i class="' + iconClass + '"></i> ' + text;
        return b;
    }
    function _esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    const HOME_ID = 'home';          // 你自己那間（城市裡自己那棟房子走進去的）
    const HOME_TYPE = 'standard';    // 自家預設房型；之後升級公寓再讓它可換

    function _specOfKey(key) {
        const RT = (_SVG() && _SVG().ROOM_TYPES) || {};
        const t = RT[key] || RT.standard || { w: 4.2, d: 4.0, wallH: 1.0, floor: 'oak' };
        return { w: t.w, d: t.d, wallH: t.wallH, floor: t.floor, window: true, label: t.label || '', typeKey: key };
    }
    function _specOf(unit) { return _specOfKey(unit && unit.roomTypeKey); }

    // ── 走進一間房（房客的房 / 你自己家共用這條）──
    // 有成品圖就用成品圖，還沒布置過就用空房母圖——兩種都走得進去。
    async function _enter(container, info) {
        _injectStyle();
        const stage = _STAGE();
        if (!stage || typeof stage.enterRoom !== 'function') { _sorry(container, '這個版本的大廳還進不了房間。'); return; }
        if (typeof stage.isOn === 'function' && !stage.isOn()) { _sorry(container, '舞台目前是關的，先在大廳設置把它打開就能走進房間。'); return; }

        const LL = _LL(), GEN = _GEN();
        if (!LL || !GEN) { _sorry(container, '房間功能還沒載入完，稍等一下再試。'); return; }

        let room;
        try {
            room = await LL.getRoom(info.id);
            if (!room || !room.image) {
                // 還沒布置過：空房母圖當底，地板一樣走得
                // 🚨 personH 一定要帶上：少了它 stageLayers 會退回「拉滿舞台」，空房就跟布置過的房不同尺度
                const base = await GEN.buildBase(info.spec);
                room = { image: base.baseData, floor: base.room.floor, viewBox: base.room.viewBox, personH: base.room.personH, order: [] };
            } else if (!room.floor || !room.viewBox || !room.personH) {
                // 舊存檔缺幾何 → 用同一份房規格重算一次（同 spec 出的幾何完全一樣，對得上那張圖）
                const base = await GEN.buildBase(info.spec);
                room = Object.assign({}, room, { floor: base.room.floor, viewBox: base.room.viewBox, personH: base.room.personH });
            }
        } catch (e) {
            console.warn('[LandlordRoom] 開房失敗', e);
            _sorry(container, (e && e.message) || '房間暫時打不開。');
            return;
        }

        let layers;
        try {
            layers = await GEN.stageLayers(room, 1536, 1024);
        } catch (e) {
            console.warn('[LandlordRoom] 房間圖層失敗', e);
            _sorry(container, '房間的圖讀不進來，再試一次。');
            return;
        }

        _ctx = {
            unitId: info.id,
            unitName: info.name,
            spec: info.spec,
            room: room,
            viewBox: layers.viewBox,
            fit: layers.fit,
            floor: room.floor,
            exit: info.exit,
            items: null,
            deco: null,
        };

        // 🕹 自己家裡也立一根控制柱：還沒加蓋公寓的人是走進自宅的，
        //    柱子只放走廊的話，他就永遠找不到加蓋的地方（雞生蛋）。
        let base = layers.base, extraDoors = null;
        if (info.lift) {
            const bea = await _placeBeacon(layers.base, layers.floorStage, layers.figurePx, info.liftFloor || 1);
            base = bea.base;
            if (bea.door) extraDoors = [bea.door];
        }

        stage.enterRoom({
            base: base,
            mask: layers.mask,
            floorStage: layers.floorStage,
            header: {
                name: info.name,
                badge: info.badge || (info.name + '的房間'),
                ph: info.lift ? '在房裡走走、按右下角布置，走到那根柱子可以加蓋樓層…' : '在房裡走走，或按右下角布置這間房…',
            },
            exit: info.exit,
            doors: extraDoors,
            actorPx: layers.figurePx,
        });

        // 面板讓開，讓舞台變成主角
        try { if (win.PhoneSystem && typeof win.PhoneSystem.goHome === 'function') win.PhoneSystem.goHome(); } catch (e) {}
    }

    // 從房產面板點某一戶「進房間」
    async function open(container, unitId) {
        const LL = _LL();
        if (!LL) { _sorry(container, '房產還沒載入完，稍等一下再試。'); return; }
        let unit;
        try {
            const state = await LL.getState();
            unit = state.units.find(function (u) { return u.id === unitId; });
            if (!unit) throw new Error('找不到這一戶。');
        } catch (e) {
            console.warn('[LandlordRoom] 讀這一戶失敗', e);
            _sorry(container, (e && e.message) || '房間暫時打不開。');
            return;
        }
        // 空房也進得去（空房就是拿來布置的），標題別假裝有房客
        // 走出這一戶＝回到那層走廊（公寓戶一定是從走廊進來的）
        return _enter(container, {
            id: unitId,
            name: unit.tenantName || '空房',
            badge: unit.tenantName ? (unit.tenantName + '的房間') : '還沒有房客',
            spec: _specOf(unit),
            exit: unit.floor ? { panel: 'apartment-back', floor: unit.floor } : { to: 'city', spawn: CITY_SPAWN },
        });
    }

    // 🏠 從城市走進自己那棟房子
    async function openHome() {
        const LL = _LL();
        let saved = null, floors = 0;
        try { if (LL) saved = await LL.getRoom(HOME_ID); } catch (e) {}
        try { if (LL) floors = ((await LL.getState()).floors) || 0; } catch (e) {}
        return _enter(null, {
            id: HOME_ID,
            name: '你的家',
            badge: '你的家',
            spec: _specOfKey((saved && saved.roomTypeKey) || HOME_TYPE),
            // 蓋了公寓＝自己那戶開在走廊上,走出來要回走廊;還沒蓋才是直接走回城市
            exit: floors > 0 ? { panel: 'apartment-back', floor: 1 } : { to: 'city', spawn: CITY_SPAWN },
            lift: true, liftFloor: Math.max(1, floors),   // 自己家裡看得到那根柱子
        });
    }
    // 走進城市裡自己那棟房子的門（lobby_stage 的 panel 型門發的事件）
    // 🏢 蓋了公寓就先進走廊(自己那戶變成走廊上的一扇門)；還沒蓋＝那棟就是自己家,直接進。
    win.addEventListener('lstage-open-myhome', function () {
        (async function () {
            let floors = 0;
            try { const LL = _LL(); if (LL) floors = ((await LL.getState()).floors) || 0; }
            catch (e) { console.warn('[LandlordRoom] 讀樓層失敗,當作還沒蓋公寓', e); }
            if (floors > 0) await openCorridor(1);
            else await openHome();
        })().catch(function (e) { console.warn('[LandlordRoom] 進自己那棟失敗', e); });
    });

    // ── 🏢 公寓走廊：一層一條,一戶一扇門(你自己那戶也在這條走廊上) ──
    // 走廊底圖之後會換成手繪的;現在先用 makeRoom 生一個長形空間頂著(定案:先頂著,別卡在缺素材)。
    const CORRIDOR = { w: 6.4, d: 1.8, wallH: 0.62, floor: 'tile', window: false };
    const CITY_SPAWN = { x: 364, y: 892 };   // 從樓裡出來站的位置＝自家門口外
    // 🕹 走廊裡那根控制錨點：加蓋樓層／換樓層都走它（先借城市的信標素材頂著）
    const CDN = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@main/';
    const BEACON = { file: 'city/obj/beacon_short_01_day.png', w: 130, h: 204 };

    function _loadImg(src) {
        return new Promise(function (resolve, reject) {
            const im = new win.Image();
            if (!String(src).startsWith('data:')) im.crossOrigin = 'anonymous';
            im.onload = function () { resolve(im); };
            im.onerror = function () { reject(new Error('圖讀不到：' + src)); };
            im.src = src;
        });
    }
    // 把控制錨點立在地板前緣靠邊（那一帶通常是空的，不會壓到家具，也不擋走廊盡頭的門）。
    // 🚨 圖畫不上去也要留下觸發區——不然沒公寓的人就永遠找不到加蓋的地方。
    async function _placeBeacon(baseUrl, floorStage, figurePx, floor) {
        const fFL = (floorStage || [])[0], fFR = (floorStage || [])[1];
        if (!fFL || !fFR) return { base: baseUrl, door: null };
        const bh = Math.max(60, (figurePx || 120) * 0.92), bw = bh * BEACON.w / BEACON.h;
        const bx = fFL[0] + (fFR[0] - fFL[0]) * 0.12, by = fFL[1] + (fFR[1] - fFL[1]) * 0.12;
        const door = { x: bx - bw / 2, y: by - 26, w: Math.max(70, bw), h: 46, panel: 'apartment-lift', floor: floor || 1 };
        let base = baseUrl;
        try {
            const imgs = await Promise.all([_loadImg(CDN + BEACON.file), _loadImg(baseUrl)]);
            const cv = d.createElement('canvas'); cv.width = 1536; cv.height = 1024;
            const cx = cv.getContext('2d');
            cx.drawImage(imgs[1], 0, 0);
            cx.drawImage(imgs[0], bx - bw / 2, by - bh, bw, bh);   // 底部中心對齊地板上那一點
            base = cv.toDataURL('image/png');
        } catch (e) { console.warn('[LandlordRoom] 控制錨點的圖畫不上去，觸發區還在', e); }
        return { base: base, door: door };
    }

    async function openCorridor(floor) {
        const LL = _LL(), GEN = _GEN(), stage = _STAGE();
        if (!LL || !GEN) { _sorry(null, '房間功能還沒載入完，稍等一下再試。'); return; }
        if (!stage || typeof stage.enterRoom !== 'function') { _sorry(null, '這個版本的大廳還進不了房間。'); return; }
        if (typeof stage.isOn === 'function' && !stage.isOn()) { _sorry(null, '舞台目前是關的，先在大廳設置把它打開就能上樓。'); return; }

        let units = [];
        try {
            const state = await LL.getState();
            units = (state.units || []).filter(function (u) { return (u.floor || 1) === floor; });
        } catch (e) { console.warn('[LandlordRoom] 讀樓層失敗', e); _sorry(null, '這一層暫時上不去。'); return; }

        let layers;
        try {
            const base = await GEN.buildBase(CORRIDOR);
            layers = await GEN.stageLayers({
                image: base.baseData, floor: base.room.floor,
                viewBox: base.room.viewBox, personH: base.room.personH,
            }, 1536, 1024);
        } catch (e) { console.warn('[LandlordRoom] 走廊底圖失敗', e); _sorry(null, '走廊的圖讀不進來，再試一次。'); return; }

        // 一戶一扇門,沿著地板最裡面那條邊等距排開（自己那戶排最前面）
        const cells = [{ id: HOME_ID, label: '你的家' }].concat(units.map(function (u) {
            return { id: u.id, label: u.tenantName || '空房' };
        }));
        const fs = layers.floorStage || [];
        const bl = fs[3], br = fs[2];
        let doors = [];
        if (bl && br) {
            const span = Math.abs(br[0] - bl[0]);
            const dw = Math.max(64, Math.min(150, span / cells.length * 0.56));
            doors = cells.map(function (c, i) {
                const t = (i + 0.5) / cells.length;
                return {
                    x: bl[0] + (br[0] - bl[0]) * t - dw / 2,
                    y: bl[1] + (br[1] - bl[1]) * t,
                    w: dw, h: 44, panel: 'apartment', unitId: c.id,
                };
            });
        }

        // 🕹 控制錨點：走過去＝加蓋樓層／換樓層
        const bea = await _placeBeacon(layers.base, fs, layers.figurePx, floor);
        const base = bea.base;
        if (bea.door) doors.push(bea.door);

        _ctx = null;   // 走廊不是「站在某一間房裡」，布置那套不能作用
        stage.enterRoom({
            base: base, mask: layers.mask, floorStage: layers.floorStage,
            header: { name: floor + '樓', badge: '公寓走廊', ph: '走到門口進各戶，走到那根柱子可以加蓋或換樓層…' },
            exit: { to: 'city', spawn: CITY_SPAWN },
            doors: doors,
            actorPx: layers.figurePx,
        });
        try { if (win.PhoneSystem && typeof win.PhoneSystem.goHome === 'function') win.PhoneSystem.goHome(); } catch (e) {}
    }

    // 🕹 走到走廊那根控制錨點：加蓋一層／換到其他樓層
    async function _openLift(floor) {
        const LL = _LL(), stage = _STAGE();
        const root = stage && stage._S && stage._S.root;
        if (!LL || !root) return;
        if (root.querySelector('.llr-sheet')) return;   // 已經開著就不疊第二層

        let state;
        try { state = await LL.getState(); }
        catch (e) { console.warn('[LandlordRoom] 讀樓層失敗', e); _sorry(null, '這棟樓的資料暫時讀不到。'); return; }
        const cfg = LL._cfg || {};
        const maxFloors = cfg.maxFloors || 4, perFloor = cfg.unitsPerFloor || 2, price = cfg.floorPrice || 600;
        const floors = state.floors || 0;

        const sheet = d.createElement('div'); sheet.className = 'llr-sheet';
        const card = d.createElement('div'); card.className = 'llr-card';
        const title = d.createElement('div'); title.className = 'llr-card-title'; title.textContent = '這棟樓';
        card.appendChild(title);

        const list = d.createElement('div'); list.className = 'llr-floors';
        for (let i = 1; i <= floors; i++) {
            const b = _btn('fa-solid fa-building', i + '樓', i === floor ? 'is-now' : '');
            if (i === floor) b.disabled = true;
            else b.onclick = function () { close(); openCorridor(i).catch(function (err) { console.warn('[LandlordRoom] 換樓層失敗', err); }); };
            list.appendChild(b);
        }
        card.appendChild(list);

        const msg = d.createElement('div'); msg.className = 'llr-msg';
        msg.textContent = floors >= maxFloors
            ? ('已經蓋到 ' + floors + ' 樓，不能再往上了。')
            : ('再加一層，就多 ' + perFloor + ' 間可以出租。');
        card.appendChild(msg);

        const bar = d.createElement('div'); bar.className = 'llr-card-bar';
        const closeBtn = _btn('fa-solid fa-xmark', '關上');
        bar.appendChild(closeBtn);
        const add = floors < maxFloors ? _btn('fa-solid fa-layer-group', '加蓋一層（' + price + '）', 'is-go') : null;
        if (add) bar.appendChild(add);
        card.appendChild(bar);
        sheet.appendChild(card); root.appendChild(sheet);

        function close() { try { sheet.remove(); } catch (e) {} }
        closeBtn.onclick = close;
        if (add) add.onclick = async function () {
            add.disabled = true;
            let r;
            try { r = await LL.addFloor(); }
            catch (e) { console.warn('[LandlordRoom] 加蓋失敗', e); r = { ok: false, reason: 'save' }; }
            if (r && r.ok) { close(); await openCorridor(r.floors); return; }   // 蓋好就直接上去看
            msg.className = 'llr-msg is-bad';
            msg.textContent = r && r.reason === 'poor' ? ('還差 ' + r.short + ' 才蓋得起這一層。')
                : r && r.reason === 'nohouse' ? '要先在城市裡有自己的房子。'
                : r && r.reason === 'max' ? '已經蓋到頂了。'
                : '這次沒蓋成，錢沒有扣掉，再試一次就好。';
            add.disabled = false;
        };
    }
    win.addEventListener('lstage-open-apartment-lift', function (e) {
        const door = (e && e.detail && e.detail.door) || null;
        _openLift((door && door.floor) || 1).catch(function (err) { console.warn('[LandlordRoom] 開控制錨點失敗', err); });
    });

    // 從某一戶走出來＝回到那層走廊（不是一路彈回城市）
    win.addEventListener('lstage-open-apartment-back', function (e) {
        const door = (e && e.detail && e.detail.door) || null;
        openCorridor((door && door.floor) || 1).catch(function (err) { console.warn('[LandlordRoom] 回走廊失敗', err); });
    });

    // 走廊上的門：自己那戶走自宅那條，其他走出租戶那條
    win.addEventListener('lstage-open-apartment', function (e) {
        const door = (e && e.detail && e.detail.door) || null;
        if (!door || !door.unitId) return;
        const id = door.unitId;
        (id === HOME_ID ? openHome() : open(null, id))
            .catch(function (err) { console.warn('[LandlordRoom] 進這一戶失敗', err); });
    });

    function _sorry(container, msg) {
        if (!container) { try { win.toastr && win.toastr.info(msg); } catch (e) {} return; }
        const wrap = d.createElement('div'); wrap.className = 'll-wrap';
        const note = d.createElement('div'); note.className = 'll-note'; note.textContent = msg;
        wrap.appendChild(note);
        const back = d.createElement('button'); back.className = 'll-btn';
        back.innerHTML = '<i class="fa-solid fa-arrow-left"></i> 回房產';
        back.onclick = function () { const LL = _LL(); if (LL) LL.launch(container); };
        wrap.appendChild(back);
        container.innerHTML = ''; container.appendChild(wrap);
    }

    // ── 房間掛好了 → 在場景右下角放「布置這間房」 ──
    win.addEventListener('lstage-mounted', function (e) {
        try {
            if (!_ctx || !e.detail || e.detail.scene !== 'room') return;
            const stage = _STAGE();
            const root = stage && stage._S && stage._S.root;
            if (!root) return;
            _injectStyle();
            _mountFabs(root);
        } catch (err) { console.warn('[LandlordRoom] 房間工具掛載失敗', err); }
    });

    // 房間裡的浮鈕組：一定有「布置」；布置過的房才多一顆「重新生成」
    function _mountFabs(root) {
        const old = root.querySelector('.llr-fabs');
        if (old) old.remove();
        const box = d.createElement('div'); box.className = 'llr-fabs';
        const deco = d.createElement('button');
        deco.type = 'button'; deco.className = 'llr-fab';
        deco.innerHTML = '<i class="fa-solid fa-box-open"></i> 布置這間房';
        deco.onclick = function () { _startDeco(root); };
        box.appendChild(deco);
        if (_ctx && _ctx.room && Array.isArray(_ctx.room.order) && _ctx.room.order.length) {
            const again = d.createElement('button');
            again.type = 'button'; again.className = 'llr-fab';
            again.innerHTML = '<i class="fa-solid fa-rotate"></i> 重新生成';
            again.onclick = function () { _regen(root, [deco, again]); };
            box.appendChild(again);
        }
        root.appendChild(box);
    }

    // 重新生成：東西與位置都不動，直接沿用上次翻好的那份清單再畫一張。
    //   不重翻訂單＝少燒一次副模型，也讓「只有種子/參數在變」成立。
    async function _regen(root, btns) {
        if (!_ctx || !_ctx.room || !Array.isArray(_ctx.room.order) || !_ctx.room.order.length) return;
        btns.forEach(function (b) { b.disabled = true; });
        try {
            await _runDeliver(_ctx.room.order, root, { layout: _ctx.room.layout });
        } catch (e) {
            btns.forEach(function (b) { b.disabled = false; });
            try { win.toastr && win.toastr.info((e && e.message) || '這次沒生成，再按一次就好。'); } catch (_) {}
        }
    }

    // ── 座標換算：包裹存房間座標(0~100)，畫在舞台上要換成舞台座標 ──
    function _toStage(x, y) {
        const f = _ctx.fit, vb = _ctx.viewBox;
        return [(x / 100 * vb[0]) * f.s + f.ox, (y / 100 * vb[1]) * f.s + f.oy];
    }
    function _toRoom(sx, sy) {
        const f = _ctx.fit, vb = _ctx.viewBox;
        return [((sx - f.ox) / f.s) / vb[0] * 100, ((sy - f.oy) / f.s) / vb[1] * 100];
    }
    function _onFloor(x, y) {
        const S = _SVG();
        if (!S || !_ctx.floor) return true;
        return S.pointInPolygon([x / 100 * _ctx.viewBox[0], y / 100 * _ctx.viewBox[1]], _ctx.floor);
    }
    // 新包裹落點：房間中央往外找一個在地板上、又沒被占住的位置
    function _freeSpot() {
        const cands = [[50, 52], [35, 46], [65, 46], [50, 68], [35, 68], [65, 68], [50, 36], [30, 57], [70, 57], [42, 60], [58, 60]];
        for (let i = 0; i < cands.length; i++) {
            const x = cands[i][0], y = cands[i][1];
            if (!_onFloor(x, y)) continue;
            if (_ctx.items.some(function (it) { return Math.abs(it.x - x) < 9 && Math.abs(it.y - y) < 9; })) continue;
            return { x: x, y: y };
        }
        return { x: 50, y: 55 };
    }

    // ── 布置模式：站在房裡擺包裹 ──
    function _startDeco(root) {
        if (!_ctx || _ctx.deco) return;
        const stage = _STAGE();
        const world = stage && stage._S && stage._S.world;
        if (!world) return;

        _ctx.items = ((_ctx.room && _ctx.room.order) || []).slice(0, MAX_ITEMS).map(function (it, i) {
            return { id: 'p' + i + '_' + Math.random().toString(36).slice(2, 6), name: String(it.name || ''), content: String(it.content || ''), x: Number(it.x) || 50, y: Number(it.y) || 50 };
        });

        const fabs = root.querySelector('.llr-fabs');
        if (fabs) fabs.remove();

        const layer = d.createElement('div');
        layer.className = 'llr-layer';
        world.appendChild(layer);

        const tip = d.createElement('div');
        tip.className = 'llr-tip';
        root.appendChild(tip);

        const bar = d.createElement('div'); bar.className = 'llr-bar';
        const cancel = _btn('fa-solid fa-xmark', '取消');
        const add = _btn('fa-solid fa-plus', '添加包裹');
        const ship = _btn('fa-solid fa-truck-fast', '配送', 'is-go');
        bar.appendChild(cancel); bar.appendChild(add);
        // 已經布置過才給「清空」：把房間退回空屋(不燒生圖)。沒布置過的房本來就是空的,不用這顆。
        const wipe = (_ctx.room && _ctx.room.order && _ctx.room.order.length) ? _btn('fa-solid fa-broom', '清空', 'llr-danger') : null;
        if (wipe) bar.appendChild(wipe);
        bar.appendChild(ship);
        root.appendChild(bar);

        _ctx.deco = { root: root, world: world, layer: layer, tip: tip, bar: bar, btns: [cancel, add, ship].concat(wipe ? [wipe] : []) };

        function say(msg) {
            tip.textContent = msg || (_ctx.items.length
                ? ('房裡有 ' + _ctx.items.length + ' 個包裹。點包裹可以改名稱或拿走。')
                : '按「添加包裹」把想放的東西丟進來，拖到你要的位置。');
        }
        function redraw() {
            layer.innerHTML = '';
            _ctx.items.forEach(function (it) { layer.appendChild(_makePkg(it, redraw, say)); });
            say();
        }

        cancel.onclick = function () { _endDeco(); };
        add.onclick = function () {
            if (_ctx.items.length >= MAX_ITEMS) { say('一間房最多放 ' + MAX_ITEMS + ' 個包裹，先拿走一個再放。'); return; }
            const spot = _freeSpot();
            const it = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: '', content: '', x: spot.x, y: spot.y };
            _ctx.items.push(it);
            redraw();
            _openEditor(it, redraw, say);
        };
        ship.onclick = function () { _deliver(say); };
        // 清空＝退回空屋。要按兩次（Tauri 會擋 confirm，所以用「再按一次」代替跳窗）
        if (wipe) {
            let armed = false, armT = null;
            wipe.onclick = async function () {
                if (!armed) {
                    armed = true;
                    wipe.innerHTML = '<i class="fa-solid fa-broom"></i> 再按一次清空';
                    say('清空會把這間房退回空屋，裡面的東西全部沒有。要的話再按一次。');
                    armT = win.setTimeout(function () {
                        armed = false;
                        wipe.innerHTML = '<i class="fa-solid fa-broom"></i> 清空';
                        say();
                    }, 4000);
                    return;
                }
                win.clearTimeout(armT);
                const id = _ctx.unitId, isHome = (id === HOME_ID);
                try {
                    await _LL().saveRoom(id, null);
                    _endDeco();
                    if (isHome) await openHome(); else await open(null, id);
                } catch (e) {
                    console.warn('[LandlordRoom] 清空失敗', e);
                    armed = false;
                    wipe.innerHTML = '<i class="fa-solid fa-broom"></i> 清空';
                    say('這次沒清成，再試一次。');
                }
            };
        }

        redraw();
    }

    function _endDeco() {
        if (!_ctx || !_ctx.deco) return;
        const dc = _ctx.deco;
        [dc.layer, dc.tip, dc.bar].forEach(function (el) { try { el.remove(); } catch (e) {} });
        _ctx.deco = null;
        try { _mountFabs(dc.root); } catch (e) {}   // 浮鈕組放回去
    }

    function _makePkg(it, redraw, say) {
        const el = d.createElement('button');
        el.type = 'button';
        el.className = 'llr-pkg';
        el.innerHTML = '<i class="fa-solid fa-box"></i><span class="llr-pkg-name' + (it.name ? '' : ' llr-pkg-unnamed') + '">'
            + (it.name ? _esc(it.name) : '未命名') + '</span>';
        const p = _toStage(it.x, it.y);
        el.style.left = p[0] + 'px';
        el.style.top = p[1] + 'px';

        let moved = 0, startX = 0, startY = 0, lastX = it.x, lastY = it.y;
        const stage = _STAGE();

        // 🚨 拖曳的 move/up 一律掛在 window：滑鼠一定會跑出這顆小方塊，
        //    掛在元素上(就算有 setPointerCapture)只要捕獲沒成立就整個拖不動。
        function onMove(ev) {
            moved = Math.max(moved, Math.hypot(ev.clientX - startX, ev.clientY - startY));
            // 🚨 世界層的孩子全是絕對定位 → 它自己的框是 0×0，r.width/r.height 不能用(拿來當分母就整個拖不動)。
            //    只有 r.left/r.top(＝縮放後的原點)跟 S.scale 是可信的——舞台自己的點擊移動也是這樣換算。
            const st = stage && stage._S;
            if (!st || !st.world || !st.scale) return;
            const r = st.world.getBoundingClientRect();
            const rm = _toRoom((ev.clientX - r.left) / st.scale, (ev.clientY - r.top) / st.scale);
            it.x = Math.max(1, Math.min(99, rm[0]));
            it.y = Math.max(1, Math.min(99, rm[1]));
            const q = _toStage(it.x, it.y);
            el.style.left = q[0] + 'px';
            el.style.top = q[1] + 'px';
            ev.preventDefault();
        }
        function onUp() {
            win.removeEventListener('pointermove', onMove, true);
            win.removeEventListener('pointerup', onUp, true);
            win.removeEventListener('pointercancel', onUp, true);
            el.classList.remove('is-drag');
            if (moved < DRAG_SLOP) { _snap(el, it, lastX, lastY); _openEditor(it, redraw, say); return; }
            // 掉到房間外面 → 退回原位，包裹只能放在房裡的地板上
            if (!_onFloor(it.x, it.y)) { _snap(el, it, lastX, lastY); say('那裡不在房間裡，包裹放回原本的位置了。'); }
            else say();
        }
        el.addEventListener('pointerdown', function (ev) {
            moved = 0;
            startX = ev.clientX; startY = ev.clientY;
            lastX = it.x; lastY = it.y;
            el.classList.add('is-drag');
            ev.preventDefault();
            ev.stopPropagation();   // 別讓舞台把這下當成「點地板走過去」
            win.addEventListener('pointermove', onMove, true);
            win.addEventListener('pointerup', onUp, true);
            win.addEventListener('pointercancel', onUp, true);
        });
        return el;
    }
    function _snap(el, it, x, y) {
        it.x = x; it.y = y;
        const p = _toStage(x, y);
        el.style.left = p[0] + 'px';
        el.style.top = p[1] + 'px';
    }

    // 包裹小窗：名稱＋內容，或直接拿走
    function _openEditor(it, redraw, say) {
        const root = _ctx.deco && _ctx.deco.root;
        if (!root) return;
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
        root.appendChild(sheet);
        try { name.focus(); } catch (e) {}

        const close = function () { try { sheet.remove(); } catch (e) {} };
        drop.onclick = function () {
            _ctx.items = _ctx.items.filter(function (x) { return x.id !== it.id; });
            close(); redraw();
        };
        ok.onclick = function () {
            it.name = String(name.value || '').trim();
            it.content = String(content.value || '').trim();
            close(); redraw();
        };
    }

    // ── 生圖那一段：訂單 → 整房一次生圖 → 存起來 → 就地換成新的房間 ──
    //   「配送」與「重新生成」共用這條；差別只在 opts.layout 給不給(給了就不重翻訂單)。
    async function _runDeliver(order, root, opts) {
        const busy = d.createElement('div'); busy.className = 'llr-busy';
        busy.textContent = '正在準備…';
        root.appendChild(busy);
        const unitId = _ctx.unitId, spec = _ctx.spec, isHome = (unitId === HOME_ID);
        try {
            const LL = _LL();
            const result = await _GEN().deliver(spec, order, function (msg) { busy.textContent = msg; }, opts);
            busy.textContent = '正在收好房間…';
            await LL.saveRoom(unitId, {
                image: result.image, layout: result.layout, order: order,
                roomTypeKey: spec.typeKey,   // 房型跟著房間走,下次進來要用同一間
                // 🚨 幾何三件套一定要一起存：地板＝可走區(沒有就整片不能動)、personH＝尺度(沒有就退回拉滿舞台)
                floor: result.floor, viewBox: result.viewBox, personH: result.personH,
                styleName: result.styleName, at: result.at,
            });
            _endDeco();
            try { busy.remove(); } catch (e) {}
            // 就地重進這間房＝看到剛剛生出來的樣子
            if (isHome) await openHome(); else await open(null, unitId);
        } catch (e) {
            console.warn('[LandlordRoom] 生成失敗', e);
            try { busy.remove(); } catch (_) {}
            throw e;
        }
    }

    // 配送：把布置模式現在擺的這批包裹送出去（要重翻訂單）
    async function _deliver(say) {
        const dc = _ctx.deco;
        if (!dc) return;
        const items = _ctx.items;
        if (!items.length) { say('房間還是空的，先添加一個包裹。'); return; }
        if (items.some(function (it) { return !String(it.name || '').trim(); })) { say('有包裹還沒寫名稱，點開它填一下再配送。'); return; }

        dc.btns.forEach(function (b) { b.disabled = true; });
        const order = items.map(function (it) { return { name: it.name, content: it.content, x: it.x, y: it.y }; });
        try {
            await _runDeliver(order, dc.root, null);
        } catch (e) {
            dc.btns.forEach(function (b) { b.disabled = false; });
            say((e && e.message) || '這次沒送成，再按一次配送就好。');
        }
    }

    // 重進「現在這一間」：調完數值要立刻看效果時用（測試面板按鈕接這個）
    async function reenter() {
        if (!_ctx) return false;
        const id = _ctx.unitId;
        if (id === HOME_ID) await openHome(); else await open(null, id);
        return true;
    }

    win.OS_LANDLORD_ROOM = { open, openHome, openCorridor, reenter };
    if (win !== window) { try { window.OS_LANDLORD_ROOM = win.OS_LANDLORD_ROOM; } catch (e) {} }
    console.log('[LandlordRoom] 房間（舞台版）已載入');
})();
