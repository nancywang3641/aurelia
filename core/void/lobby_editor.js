// ----------------------------------------------------------------
// [檔案] lobby_editor.js — 大廳 🖊 擺設模式（編輯器）（2026-07-16 自 lobby_stage.js 拆出）
// 職責：拖物件/站位圓點/活動區塊/過門區/鋼索錨點、調佔地高寬與人物縮放、
//       新增/刪除家具、換底圖/換遮罩、遮罩紅罩視覺化、複製數據＋存檔（localStorage per 場景）。
// 依賴：window.LobbyStage._b 橋（S 狀態/CFG getter/場景表/placeObj/footRect/碰撞重建/askImage）；載入順序必須在 lobby_stage.js 之後。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const LS = window.LobbyStage;
    if (!LS || !LS._b) { console.warn('[LobbyEditor] LobbyStage 橋不存在，擺設模式停用'); return; }
    const _b = LS._b;
    const S = _b.S;

    // ── 🖊 擺設模式 ──────────────────────────────────────
    // 拖物件=挪位置；點選物件後「佔地-/+」調 footH（紅色半透明=佔地，人走不進去）；
    // 拖彩色圓點=角色站位（瀅=瀅瀅、我=出生點、1~4=輪班NPC位）；拖空地=平移視角。
    function enterEdit() {
        LS.endTalk();
        S.edit = {
            cam: S.player ? { x: S.player.x, y: S.player.y } : { x: _b.MAP_W / 2, y: _b.MAP_H / 2 },
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
        S.edit.markers.push(mk('我', 'm-player', () => _b.CFG.points.player));
        S.edit.markers[0].onpointerdown = (e) => _dragStart(e, { kind: 'pt', pt: _b.CFG.points.player, m: S.edit.markers[0] });
        if (_b.CFG.points.arrive) {   // 過門後的落地點
            const m = mk('落', 'm-arrive', () => _b.CFG.points.arrive);
            S.edit.markers.push(m);
            m.onpointerdown = (e) => _dragStart(e, { kind: 'pt', pt: _b.CFG.points.arrive, m });
        }
        // 常駐角色站位（拖了「完成」後生效）
        [['alicePos', '愛', 'm-alice'], ['cheshirePos', '柴', 'm-cheshire']].forEach(([pk, label, cls]) => {
            if (!_b.CFG.points[pk]) return;
            const m = mk(label, cls, () => _b.CFG.points[pk]);
            S.edit.markers.push(m);
            m.onpointerdown = (e) => _dragStart(e, { kind: 'pt', pt: _b.CFG.points[pk], m });
        });
        // 可拖拉區塊（拖框身=移動、拖右下角=調大小）：紫=瀅瀅活動區、綠=客人出沒區
        S.edit.zones = {};
        const mkZone = (pk, label, cls) => {
            if (!_b.CFG.points[pk]) return;
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
            cv.width = _b.MAP_W; cv.height = _b.MAP_H;
            cv.className = 'lstage-maskview';
            const ctx = cv.getContext('2d');
            const out = ctx.createImageData(_b.MAP_W, _b.MAP_H);
            const src = S.mask.data;
            for (let i = 0; i < src.length; i += 4) {
                if (src[i] < 128) { out.data[i] = 220; out.data[i + 1] = 60; out.data[i + 2] = 60; out.data[i + 3] = 78; }
            }
            ctx.putImageData(out, 0, 0);
            S.world.appendChild(cv);
            S.edit.maskView = cv;
        }
        // 過門區：踩進去就轉場（可拖、右下角調大小；「落」圓點別放進來）
        S.edit.doorRects = _b.CFG.doors.map((D, i) => {
            const el = document.createElement('div');
            el.className = 'lstage-doorrect';
            el.innerHTML = '<span>過門區→' + ({ cafe: '書咖', hall: '大廳', city: '街區', room404: '404' }[D.to] || D.to) + '</span>' +
                '<span class="lstage-zone-grip lstage-door-grip"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></span>';
            S.world.appendChild(el);
            _syncDoor(i, el);
            el.onpointerdown = (e) => _dragStart(e, { kind: 'door', i });
            el.querySelector('.lstage-door-grip').onpointerdown = (e) => _dragStart(e, { kind: 'doorresize', i });
            return el;
        });
        // 外框鋼索：金色多邊形=可走範圍，白色錨點可拖（牆角）——有手繪遮罩的場景不顯示（遮罩優先）
        if (!_b.SCENES[S.scene].mask && Array.isArray(_b.CFG.points.boundary) && _b.CFG.points.boundary.length >= 3) {
            const NS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('class', 'lstage-wire');
            svg.setAttribute('width', String(_b.MAP_W));
            svg.setAttribute('height', String(_b.MAP_H));
            svg.setAttribute('viewBox', '0 0 ' + _b.MAP_W + ' ' + _b.MAP_H);
            const poly = document.createElementNS(NS, 'polygon');
            svg.appendChild(poly);
            S.world.appendChild(svg);
            S.edit.wire = { svg, poly, handles: [] };
            _b.CFG.points.boundary.forEach((pt) => {
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
                const o = _b.CFG.layout[S.edit.sel];
                o.footH = Math.max(20, Math.min(o.h, o.footH + (act === 'footplus' ? 10 : -10)));
                _syncFoot(S.edit.sel); _exportToPanel();
            } else if (act === 'footwminus' || act === 'footwplus') {
                if (S.edit.sel < 0) return;
                const o = _b.CFG.layout[S.edit.sel];
                const cur = (o.footW != null ? o.footW : o.w);
                o.footW = Math.max(20, Math.min(o.w, Math.round(cur * (act === 'footwplus' ? 1.1 : 0.9))));
                _syncFoot(S.edit.sel); _exportToPanel();
            } else if (act === 'objminus' || act === 'objplus') {
                if (S.edit.sel < 0) return;
                const o = _b.CFG.layout[S.edit.sel];
                // 等比±10%：大圖小圖手感一致；下限0.05（大廳素材原圖超大、預設s本來就<0.3）
                o.s = Math.max(0.05, Math.min(2, Math.round((o.s || 1) * (act === 'objplus' ? 1.1 : 0.9) * 1000) / 1000));
                _b.placeObj(S.objEls[S.edit.sel], o); _syncFoot(S.edit.sel); _exportToPanel();
            } else if (act === 'actminus' || act === 'actplus') {
                _b.CFG.points.actorScale = Math.max(0.5, Math.min(1.6, Math.round((((_b.CFG.points.actorScale || 1)) + (act === 'actplus' ? 0.05 : -0.05)) * 100) / 100));
                _b.applyActorScale(); _exportToPanel();
            } else if (act === 'addobj') {
                _b.askImage((ref, dataUrl) => _addFurniture(ref, dataUrl));
            } else if (act === 'delobj') {
                const i = S.edit.sel;
                if (i < 0) return;
                _b.CFG.layout.splice(i, 1);
                S.objEls[i].remove(); S.objEls.splice(i, 1);
                S.edit.feet[i].remove(); S.edit.feet.splice(i, 1);
                S.edit.sel = -1;
                S.edit.feet.forEach((_, k) => _syncFoot(k));
                _exportToPanel();
            } else if (act === 'setbase' || act === 'setmask') {
                _b.askImage((ref) => {
                    if (act === 'setbase') {
                        _b.CFG.baseOverride = ref;
                        _b.resolveRef(ref).then(src => { const m = S.root?.querySelector('.lstage-map'); if (src && m) m.src = src; });
                    } else {
                        _b.CFG.maskOverride = ref;
                        _b.loadMask();   // 立即重載碰撞（紅罩下次進擺設模式更新）
                    }
                    _exportToPanel();
                });
            } else if (act === 'copy') {
                const out = panel.querySelector('.lep-out');
                out.select();
                try { navigator.clipboard?.writeText(out.value); } catch (err) {}
                try { document.execCommand('copy'); } catch (err) {}
            } else if (act === 'reset') {
                try { localStorage.removeItem(_b.SCENES[S.scene].cfgKey); } catch (err) {}
                exitEdit(false); LS.unmount(); LS.tryMount();
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
            _b.CFG.layout.push(o);
            const img = _b.spawnObjEl(o);
            S.objEls.push(img);
            _makeEditable(img);
            S.edit.sel = _b.CFG.layout.length - 1;
            S.edit.feet.forEach((_, k) => _syncFoot(k));
            _exportToPanel();
        };
        probe.onerror = () => console.warn('[LobbyEditor] 圖片載入失敗');
        (dataUrl ? Promise.resolve(dataUrl) : _b.resolveRef(ref)).then(src => { if (src) probe.src = src; });
    }
    function _syncDoor(i, el) {
        const D = _b.CFG.doors[i], e = el || S.edit?.doorRects?.[i];
        if (!D || !e) return;
        e.style.left = D.x + 'px';
        e.style.top = D.y + 'px';
        e.style.width = D.w + 'px';
        e.style.height = D.h + 'px';
    }
    function _syncWire() {
        const w = S.edit?.wire;
        if (!w) return;
        const b = _b.CFG.points.boundary;
        w.poly.setAttribute('points', b.map(p => p.x + ',' + p.y).join(' '));
        w.handles.forEach((h, i) => { h.style.left = b[i].x + 'px'; h.style.top = b[i].y + 'px'; });
    }
    function _syncZone(pk) {
        const z = _b.CFG.points[pk], el = S.edit?.zones?.[pk];
        if (!z || !el) return;
        el.style.left = z.x + 'px';
        el.style.top = z.y + 'px';
        el.style.width = z.w + 'px';
        el.style.height = z.h + 'px';
    }
    function _syncFoot(i) {
        const o = _b.CFG.layout[i], foot = S.edit.feet[i];
        if (!foot) return;
        const r = _b.footRect(o);
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
            const o = _b.CFG.layout[info.i];
            S.edit.drag.ox = o.x; S.edit.drag.oy = o.y;
            S.edit.feet.forEach((_, k) => _syncFoot(k));
        } else if (info.kind === 'pt' || info.kind === 'vert') {
            S.edit.drag.ox = info.pt.x; S.edit.drag.oy = info.pt.y;
        } else if (info.kind === 'zone') {
            const z = _b.CFG.points[info.pk];
            S.edit.drag.ox = z.x; S.edit.drag.oy = z.y;
        } else if (info.kind === 'zoneresize') {
            const z = _b.CFG.points[info.pk];
            S.edit.drag.ox = z.w; S.edit.drag.oy = z.h;
        } else if (info.kind === 'door') {
            const D = _b.CFG.doors[info.i];
            S.edit.drag.ox = D.x; S.edit.drag.oy = D.y;
        } else if (info.kind === 'doorresize') {
            const D = _b.CFG.doors[info.i];
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
            const o = _b.CFG.layout[d.i];
            o.x = Math.round(d.ox + dx); o.y = Math.round(d.oy + dy);
            _b.placeObj(S.objEls[d.i], o); _syncFoot(d.i);
        } else if (d.kind === 'pt' || d.kind === 'vert') {
            d.pt.x = Math.round(d.ox + dx); d.pt.y = Math.round(d.oy + dy);
            d.m.style.left = d.pt.x + 'px'; d.m.style.top = d.pt.y + 'px';
            if (d.kind === 'vert') _syncWire();
        } else if (d.kind === 'zone') {
            const z = _b.CFG.points[d.pk];
            z.x = Math.round(d.ox + dx); z.y = Math.round(d.oy + dy);
            _syncZone(d.pk);
        } else if (d.kind === 'zoneresize') {
            const z = _b.CFG.points[d.pk];
            z.w = Math.max(60, Math.round(d.ox + dx));
            z.h = Math.max(30, Math.round(d.oy + dy));
            _syncZone(d.pk);
        } else if (d.kind === 'door') {
            const D = _b.CFG.doors[d.i];
            D.x = Math.round(d.ox + dx); D.y = Math.round(d.oy + dy);
            _syncDoor(d.i);
        } else if (d.kind === 'doorresize') {
            const D = _b.CFG.doors[d.i];
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
            layoutFull: _b.CFG.layout.map(o => {
                const rec = { x: o.x, y: o.y, w: o.w, h: o.h, footH: o.footH, s: o.s || 1 };
                if (o.file) rec.file = o.file;
                if (o.url) rec.url = o.url;
                if (o.idb) rec.idb = o.idb;
                if (o.footW != null) rec.footW = o.footW;
                if (o.float) rec.float = true;
                if (o.nightFile) rec.nightFile = o.nightFile;   // 夜間成對素材（城市物件）：不存會讓調過的物件夜裡變日版
                return rec;
            }),
            points: _b.CFG.points,
            doors: _b.CFG.doors.map(D => ({ x: D.x, y: D.y, w: D.w, h: D.h })),
            doorsV: _b.SCENES[_b.S.scene].doorsV || 1,   // 門版本：場景門改版後舊存檔門座標作廢
        };
        if (_b.CFG.baseOverride) data.baseOverride = _b.CFG.baseOverride;
        if (_b.CFG.maskOverride) data.maskOverride = _b.CFG.maskOverride;
        return data;
    }
    function _exportToPanel() {
        const out = S.edit?.panel?.querySelector('.lep-out');
        if (out) out.value = JSON.stringify(_exportData());
    }
    function exitEdit(save) {
        if (!S.edit) return;
        if (save) {
            try { localStorage.setItem(_b.SCENES[S.scene].cfgKey, JSON.stringify(_exportData())); } catch (e) {}
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
        if (save) { _b.rebuildBlocks(); LS.unmount(); LS.tryMount(); }   // 重掛=重生NPC站位+碰撞
    }

    window.LobbyEditor = {
        enter: enterEdit,               // 進入擺設模式
        exit: exitEdit,                 // exit(true)=存檔重掛、exit(false)=直接收（unmount 收殘留用）
        toggle: () => (S.edit ? exitEdit(true) : enterEdit()),   // 🖊 鈕（lobby_stage tryMount 呼叫）
        isOn: () => !!S.edit,
    };
})();
