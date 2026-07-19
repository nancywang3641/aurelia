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
            sel: -1, feet: [], markers: [], drag: null, zoom: 1, group: [],
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
        [['alicePos', '愛', 'm-alice'], ['cheshirePos', '柴', 'm-cheshire'], ['rabbitPos', '兔', 'm-rabbit']].forEach(([pk, label, cls]) => {
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
        // 🟦 格子碰撞視覺化：擋格塗半透明紅（RPG Maker 式格子場景；讓 Rae 看得到擋在哪）
        const _g = _b.SCENES[S.scene].grid;
        if (_g) {
            if (!_g._bits) {
                const bin = atob(_g.bits); const arr = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                _g._bits = arr;
            }
            const cv = document.createElement('canvas');
            cv.width = _b.MAP_W; cv.height = _b.MAP_H;
            cv.className = 'lstage-maskview';
            const ctx = cv.getContext('2d');
            ctx.fillStyle = 'rgba(220,60,60,.32)';
            for (let r = 0; r < _g.rows; r++) for (let c = 0; c < _g.cols; c++) {
                const bi = r * _g.cols + c;
                if ((_g._bits[bi >> 3] >> (7 - (bi & 7))) & 1) ctx.fillRect(c * _g.cell, r * _g.cell, _g.cell, _g.cell);
            }
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
        // （外框鋼索黃色虛線已移除：改用手繪遮罩+物件佔地框做碰撞；boundary 資料仍留作 runtime 退路）
        // 空地拖曳=平移視角
        // 拖空地平移：掛在整個 S.root（含縮小後四周留白、建築間、小人身上都能拖）；只在沒點到可互動元素時啟動
        S.edit._panDown = (e) => {
            if (e.target.closest('.lstage-editable, .lstage-marker, .lstage-zone, .lstage-door, .lstage-edit-panel')) return;   // 物件/站點/區塊/門/面板→各自處理
            if (e.ctrlKey) { _dragStart(e, { kind: 'marquee' }); return; }   // 🖱 Ctrl+拖空地=框選多個家具成群組（電腦端）
            _dragStart(e, { kind: 'cam' });
        };
        S.root.addEventListener('pointerdown', S.edit._panDown);
        window.addEventListener('pointermove', _dragMove);
        window.addEventListener('pointerup', _dragEnd);
        // ⌨ Ctrl+Z=一步步復原移動（capture：遊戲方向鍵 handler 也是 capture，但只攔 z 不衝突）
        S.edit._onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.stopPropagation(); _undo(); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _deselect(); }   // Esc=取消圈選/選取
        };
        window.addEventListener('keydown', S.edit._onKey, true);
        // 控制面板
        const panel = document.createElement('div');
        panel.className = 'lstage-edit-panel';
        const _alphaFoot = !!_b.SCENES[S.scene].alphaFoot;
        const _kbHint = '。選成群組後(圈選/多選/加入群組)，家具±/佔地/層級/翻轉/不擋路/複製/刪除都套用整組。電腦快捷：Shift+拖=鎖直線(只走水平或垂直)｜Ctrl或Shift+點家具=加入/移出群組(圈完想剔除某件也是這樣點)｜Ctrl+拖空地=框選成群組｜點一下空地或按Esc=取消選取｜Ctrl+Z=一步步復原移動';
        const _hint = (_alphaFoot
            ? '拖東西調位置，拖空地移動視角。橘虛線框=過門區(踩進去就轉場，可拖/右下角調大小)｜橘圓「落」=過門後的落地點(別放進過門區)｜藍圓=出生點｜綠框=客人出沒區｜紅剪影=屋子實際擋路範圍(照屋子形狀整棟實心，走不進去；靠拖屋子本體調位置即可)'
            : '拖東西調位置，拖空地移動視角。紅色罩=牆｜橘虛線框=過門區(踩進去就轉場，可拖/右下角調大小)｜橘圓「落」=過門後的落地點(別放進過門區)｜藍圓=出生點｜綠框=客人出沒區｜紫框=瀅瀅活動範圍｜紅框=家具佔地') + _kbHint;
        const _footHigh =   // 佔地高：alphaFoot=底部形狀那帶多高；一般=底部方框多高
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="footminus"><i class="fa-solid fa-minus"></i> 佔地高</button>' +
              '<button class="lep-btn" data-act="footplus"><i class="fa-solid fa-plus"></i> 佔地高</button>' +
            '</div>';
        const _footRows = _alphaFoot ? _footHigh :   // alphaFoot：只調佔地高(寬度照 alpha 真實輪廓)
            _footHigh +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="footwminus"><i class="fa-solid fa-minus"></i> 佔地寬</button>' +
              '<button class="lep-btn" data-act="footwplus"><i class="fa-solid fa-plus"></i> 佔地寬</button>' +
            '</div>';
        panel.innerHTML =
            '<div class="lep-collapse-bar"><i class="fa-solid fa-up-down-left-right"></i><span class="lep-title">擺設模式（拖我移動）</span>' +
              '<button class="lep-btn lep-collapse-btn" data-act="collapse" title="收合/展開面板（讓開被擋住的地圖）"><i class="fa-solid fa-chevron-up"></i></button></div>' +
            '<div class="lep-hint">' + _hint + '</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="objminus"><i class="fa-solid fa-minus"></i> 家具</button>' +
              '<button class="lep-btn" data-act="objplus"><i class="fa-solid fa-plus"></i> 家具</button>' +
            '</div>' +
            _footRows +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="layerauto" title="預設。照「腳的位置」自動排前後：人走到它下方就蓋過它、走到它上方就被它遮。櫃台/椅/燈/建築都用這個"><i class="fa-solid fa-person-walking"></i> 自動</button>' +
              '<button class="lep-btn" data-act="layerback" title="墊在所有家具和人物後面（只蓋過置底）。貼後牆的螢幕/掛畫用"><i class="fa-solid fa-image"></i> 背景</button>' +
              '<button class="lep-btn" data-act="layerfloor" title="壓到最底，所有東西都蓋過它、人踩在它上面。地毯/地貼/空地框用"><i class="fa-solid fa-shoe-prints"></i> 置底</button>' +
            '</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="zfront" title="跟PS圖層一樣往上一層：蓋過原本壓著它的下一個東西。在「置底/背景」的會先一階階升回「自動」。例：屋前看板被屋子遮→選看板按這個"><i class="fa-solid fa-arrow-up"></i> 上移一層</button>' +
              '<button class="lep-btn" data-act="zback" title="往下退一層；在「自動」退到底後再按會降成「背景」→「置底」"><i class="fa-solid fa-arrow-down"></i> 下移一層</button>' +
            '</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="nocollide" title="切換這件家具擋不擋路：地毯/裝飾設成不擋路，人就能走過去（紅佔地框會消失）"><i class="fa-solid fa-person-walking"></i> 不擋路 開/關</button>' +
              '<button class="lep-btn" data-act="plotswap" title="選中NPC房子或空地框後：切這塊地「蓋房↔空地」。空地=只顯示地塊框、房子藏起來不擋路；半透明=現在藏著的那個"><i class="fa-solid fa-house"></i> 蓋房/空地</button>' +
            '</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="actminus"><i class="fa-solid fa-minus"></i> 人物</button>' +
              '<button class="lep-btn" data-act="actplus"><i class="fa-solid fa-plus"></i> 人物</button>' +
            '</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="dupobj" title="複製選中的家具（同一張素材，不用重做）"><i class="fa-solid fa-clone"></i> 複製</button>' +
              '<button class="lep-btn" data-act="flipx" title="左右翻轉選中的家具（一張當左右兩用）"><i class="fa-solid fa-left-right"></i> 水平翻轉</button>' +
            '</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="groupadd" title="把目前選中的家具加進群組（可加多個一起操作）"><i class="fa-solid fa-object-group"></i> 加入群組</button>' +
              '<button class="lep-btn" data-act="groupclear" title="清空群組選取"><i class="fa-solid fa-xmark"></i> 清空</button>' +
            '</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="groupmirror" title="把整個群組鏡射到房間另一側（自動翻轉+對稱位置）"><i class="fa-solid fa-clone"></i> 鏡像複製到對側</button>' +
            '</div>' +
            '<div class="lep-row">' +
              '<button class="lep-btn" data-act="groupdup" title="整組原地複製一份（偏移，不鏡射）"><i class="fa-solid fa-copy"></i> 整組複製</button>' +
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
        // 面板可拖移：抓標題列拖到任何地方（讓開被擋住的地圖）
        const _bar = panel.querySelector('.lep-collapse-bar');
        if (_bar) _bar.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.lep-collapse-btn')) return;   // 點收合鈕不算拖
            e.preventDefault(); e.stopPropagation();
            const pr = panel.getBoundingClientRect();
            const par = panel.offsetParent ? panel.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
            const ox = e.clientX - pr.left, oy = e.clientY - pr.top;
            const move = (ev) => {
                panel.style.left = (ev.clientX - ox - par.left) + 'px';
                panel.style.top = (ev.clientY - oy - par.top) + 'px';
                panel.style.right = 'auto';
            };
            const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
        });
        panel.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (!act) return;
            if (act === 'collapse') {
                S.edit.panel.classList.toggle('lep-collapsed');
                const ic = S.edit.panel.querySelector('.lep-collapse-btn i');
                if (ic) ic.className = S.edit.panel.classList.contains('lep-collapsed') ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up';
                return;
            }
            // 🎯 套用對象：有群組(圈選/Ctrl多選/加入群組)＝整組一起；沒群組＝單選那件
            const _targets = () => (S.edit.group.length ? S.edit.group.slice() : (S.edit.sel >= 0 ? [S.edit.sel] : []));
            if (act === 'footminus' || act === 'footplus') {
                const ts = _targets(); if (!ts.length) return;
                ts.forEach(i => {
                    const o = _b.CFG.layout[i];
                    o.footH = Math.max(20, Math.min(o.h, o.footH + (act === 'footplus' ? 10 : -10)));
                    _syncFoot(i);
                });
                _exportToPanel();
            } else if (act === 'footwminus' || act === 'footwplus') {
                const ts = _targets(); if (!ts.length) return;
                ts.forEach(i => {
                    const o = _b.CFG.layout[i];
                    const cur = (o.footW != null ? o.footW : o.w);
                    o.footW = Math.max(20, Math.min(o.w, Math.round(cur * (act === 'footwplus' ? 1.1 : 0.9))));
                    _syncFoot(i);
                });
                _exportToPanel();
            } else if (act === 'objminus' || act === 'objplus') {
                const ts = _targets(); if (!ts.length) return;
                ts.forEach(i => {
                    const o = _b.CFG.layout[i];
                    // 等比±10%：大圖小圖手感一致；下限0.05（大廳素材原圖超大、預設s本來就<0.3）
                    o.s = Math.max(0.05, Math.min(2, Math.round((o.s || 1) * (act === 'objplus' ? 1.1 : 0.9) * 1000) / 1000));
                    _b.placeObj(S.objEls[i], o); _syncFoot(i);
                });
                _exportToPanel();
            } else if (act === 'layerfloor' || act === 'layerauto' || act === 'layerback') {
                const ts = _targets(); if (!ts.length) return;
                const layer = act === 'layerauto' ? undefined : (act === 'layerfloor' ? 'floor' : 'back');
                ts.forEach(i => {
                    const o = _b.CFG.layout[i];
                    o.layer = layer;
                    _b.placeObj(S.objEls[i], o);
                });
                _exportToPanel();
            } else if (act === 'actminus' || act === 'actplus') {
                _b.CFG.points.actorScale = Math.max(0.2, Math.min(1.6, Math.round((((_b.CFG.points.actorScale || 1)) + (act === 'actplus' ? 0.05 : -0.05)) * 100) / 100));   // 下限 0.2：地圖俯視小人要能調得比室內小很多
                _b.applyActorScale(); _exportToPanel();
            } else if (act === 'dupobj') {
                const ts = _targets(); if (!ts.length) return;
                const newIdx = [];
                ts.forEach(idx => {
                    const src = _b.CFG.layout[idx];
                    const o = Object.assign({}, src, { x: src.x + 40, y: src.y + 40 });   // 複製全屬性(素材/縮放/佔地/層級/翻轉)，偏移40避免疊死
                    _b.CFG.layout.push(o);
                    newIdx.push(_b.CFG.layout.length - 1);
                    const img = _b.spawnObjEl(o);
                    S.objEls.push(img);
                    _makeEditable(img);
                });
                if (S.edit.group.length) { S.edit.group = newIdx; _groupHighlight(); }   // 群組複製→複製出的新一組變群組，直接拖到位
                else S.edit.sel = newIdx[0];
                S.edit.feet.forEach((_, k) => _syncFoot(k));
                _exportToPanel();
            } else if (act === 'flipx') {
                const ts = _targets(); if (!ts.length) return;
                ts.forEach(i => {
                    const o = _b.CFG.layout[i];
                    o.flipX = !o.flipX;   // 各自原地翻轉
                    _b.placeObj(S.objEls[i], o); _syncFoot(i);
                });
                _exportToPanel();
            } else if (act === 'nocollide') {
                const ts = _targets(); if (!ts.length) return;
                const on = !_b.CFG.layout[ts[0]].noCollide;   // 群組統一切成同一狀態(照第一件的相反)，免得混著各切各的
                ts.forEach(i => {
                    _b.CFG.layout[i].noCollide = on;   // rebuildBlocks 會排除 noCollide 物件
                    _syncFoot(i);
                });
                _exportToPanel();
            } else if (act === 'zfront' || act === 'zback') {
                // 照PS圖層直覺：在「跟它疊住(畫面有重疊)的物件」裡上/下移一層——直接跳到剛好蓋過/讓給下一個，按一下就看得到
                const ts = _targets(); if (!ts.length) return;
                const dims = (b) => { const bs = b.s || 1; return { x: b.x, y: b.y, w: b.w * bs, h: b.h * bs }; };
                const zOf = (b) => 2 + Math.round(b.y + Math.round(b.h * (b.s || 1)) + (b.zb || 0));   // 同 placeObj 的一般層公式
                ts.forEach(i => {
                    const o = _b.CFG.layout[i];
                    // 整條樓梯：置底 → 背景 → 自動(層內再比前後)。上移/下移對每一階都有反應。
                    if (o.layer) {   // 在最下兩階
                        if (act === 'zfront') { o.layer = (o.layer === 'floor') ? 'back' : undefined; delete o.zb; _b.placeObj(S.objEls[i], o); }
                        else if (o.layer === 'back') { o.layer = 'floor'; _b.placeObj(S.objEls[i], o); }   // 置底已是最底,再按不動
                        return;
                    }
                    const me = dims(o), myZ = zOf(o);
                    let best = null;
                    _b.CFG.layout.forEach((b, j) => {
                        if (j === i || b.layer || b._plotOff) return;
                        const r = dims(b);
                        if (!(me.x < r.x + r.w && me.x + me.w > r.x && me.y < r.y + r.h && me.y + me.h > r.y)) return;   // 畫面沒疊到→無關
                        const bz = zOf(b);
                        if (act === 'zfront' ? (bz >= myZ && (best == null || bz < best)) : (bz <= myZ && (best == null || bz > best))) best = bz;
                    });
                    if (best == null) {   // 同疊物件裡已最上/最下
                        if (act === 'zback') { o.layer = 'back'; delete o.zb; _b.placeObj(S.objEls[i], o); }   // 自動層退到底→再按降成「背景」
                        return;
                    }
                    o.zb = (act === 'zfront' ? best + 1 : best - 1) - (2 + Math.round(o.y + Math.round(o.h * (o.s || 1))));
                    if (!o.zb) delete o.zb;   // 歸零就拿掉欄位（回預設排序、數據乾淨）
                    _b.placeObj(S.objEls[i], o);
                });
                _exportToPanel();
            } else if (act === 'plotswap') {
                const ts = _targets(); if (!ts.length) return;
                const done = new Set();   // 同塊地的房+框都被選到→只切一次
                ts.forEach(i => {
                    const o = _b.CFG.layout[i];
                    const id = o.plot || o.plotFrame;
                    if (!id || done.has(id)) return;
                    done.add(id);
                    _b.setPlot(id, !_b.plotOccupied(id));
                });
                _exportToPanel();
            } else if (act === 'groupadd') {
                if (S.edit.sel < 0) return;
                if (!S.edit.group.includes(S.edit.sel)) S.edit.group.push(S.edit.sel);
                _groupHighlight();
            } else if (act === 'groupclear') {
                S.edit.group = []; _groupHighlight();
            } else if (act === 'groupmirror' || act === 'groupdup') {
                const mirror = act === 'groupmirror';
                const targets = S.edit.group.length ? S.edit.group.slice() : (S.edit.sel >= 0 ? [S.edit.sel] : []);
                if (!targets.length) return;
                const newIdx = [];
                targets.forEach(idx => {
                    const src = _b.CFG.layout[idx];
                    const ew = Math.round(src.w * (src.s || 1));
                    const o = Object.assign({}, src);
                    if (mirror) { o.x = _b.MAP_W - src.x - ew; o.flipX = !src.flipX; }   // 鏡射到房間對側(繞中線x=MAP_W/2)+左右翻轉
                    else { o.x = src.x + 40; o.y = src.y + 40; }
                    _b.CFG.layout.push(o);
                    newIdx.push(_b.CFG.layout.length - 1);
                    const img = _b.spawnObjEl(o);
                    S.objEls.push(img);
                    _makeEditable(img);
                });
                S.edit.group = newIdx; _groupHighlight();   // 複製出的整組=當前群組→可一起拖到位
                S.edit.feet.forEach((_, k) => _syncFoot(k));
                _exportToPanel();
            } else if (act === 'addobj') {
                _b.askImage((ref, dataUrl) => _addFurniture(ref, dataUrl));
            } else if (act === 'delobj') {
                const ts = _targets(); if (!ts.length) return;
                ts.sort((a, b) => b - a).forEach(i => {   // 由大到小刪，前面的索引才不會位移到錯物件
                    _b.CFG.layout.splice(i, 1);
                    S.objEls[i].remove(); S.objEls.splice(i, 1);
                    S.edit.feet[i].remove(); S.edit.feet.splice(i, 1);
                });
                S.edit.sel = -1;
                S.edit.group = []; _groupHighlight();   // 索引位移→群組作廢，免鏡射到錯物件
                S.edit.undo = [];   // 索引位移→復原疊一併作廢（免 Ctrl+Z 搬到錯物件）
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
        _b.fitCamera();   // 進建構模式→切 contain 縮放（整張看得見+可超界平移）
    }
    function _makeEditable(img) {
        img.classList.add('lstage-editable');
        // 佔地視覺化：一般家具=紅矩形(footRect)；alphaFoot 場景(大地圖)=canvas 直接畫出屋子真實擋路剪影(照 alpha、只到切線)
        const alphaFoot = !!_b.SCENES[S.scene].alphaFoot;
        const foot = document.createElement(alphaFoot ? 'canvas' : 'div');
        foot.className = 'lstage-foot' + (alphaFoot ? ' lstage-foot-shape' : '');
        S.world.appendChild(foot);
        S.edit.feet.push(foot);
        img.onpointerdown = (e) => {
            const i = S.objEls.indexOf(img);
            if (e.ctrlKey) {   // 🖱 Ctrl+點=加入/移出群組（電腦端多選；手機沿用面板「加入群組」鈕）
                e.preventDefault(); e.stopPropagation();
                S.edit.sel = i;
                _toggleGroup(i);
                return;
            }
            _dragStart(e, { kind: 'obj', i });   // Shift+點一下(沒拖動)也算多選→在 _dragEnd 判定
        };
    }
    // alphaFoot 剪影：把整棟「圖片不透明」的像素塗紅，畫在物件正上方＝玩家實際會被擋的形狀（整棟實心）
    function _syncFootShape(o, cv) {
        const s = o.s || 1, ew = Math.round(o.w * s), eh = Math.round(o.h * s);
        cv.style.left = o.x + 'px'; cv.style.top = o.y + 'px';
        cv.style.width = ew + 'px'; cv.style.height = eh + 'px';
        const a = o._alpha;
        if (!a) { cv.width = cv.height = 1; return; }   // alpha 還沒載到→暫時空白（載好會回呼刷新）
        if (cv.width !== a.w || cv.height !== a.h) { cv.width = a.w; cv.height = a.h; }
        const ctx = cv.getContext('2d');
        const img = ctx.createImageData(a.w, a.h);
        const fh = (o.footH != null ? o.footH : o.h);       // 佔地高(未縮放px)
        const cutRow = a.h * (o.h - fh) / o.h;               // 只畫底部這帶(對應 _alphaHit 的切割)
        for (let i = 0; i < a.w * a.h; i++) {
            if (a.data[i] < 128) continue;
            const row = Math.floor(i / a.w);
            if (row < cutRow) continue;                      // 上半超過佔地高→不畫(那裡可走)
            const px = o.flipX ? (row * a.w + (a.w - 1 - i % a.w)) : i;   // 翻轉物件→剪影跟著鏡像(對齊_alphaHit)
            const p = px * 4;
            img.data[p] = 230; img.data[p + 1] = 60; img.data[p + 2] = 60; img.data[p + 3] = 140;
        }
        ctx.putImageData(img, 0, 0);
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
    function _groupHighlight() {
        S.objEls.forEach((img, i) => img.classList.toggle('lstage-grouped', S.edit.group.includes(i)));
    }
    function _syncDoor(i, el) {
        const D = _b.CFG.doors[i], e = el || S.edit?.doorRects?.[i];
        if (!D || !e) return;
        e.style.left = D.x + 'px';
        e.style.top = D.y + 'px';
        e.style.width = D.w + 'px';
        e.style.height = D.h + 'px';
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
        foot.style.display = o.noCollide ? 'none' : '';   // 不擋路→不畫紅佔地框
        if (foot.classList.contains('lstage-foot-shape')) {
            _syncFootShape(o, foot);   // alphaFoot：畫真實剪影
        } else {
            const r = _b.footRect(o);
            foot.style.left = r.x + 'px';
            foot.style.top = r.y + 'px';
            foot.style.width = r.w + 'px';
            foot.style.height = r.h + 'px';
        }
        foot.classList.toggle('sel', S.edit.sel === i);
    }
    function _toggleGroup(i) {
        const at = S.edit.group.indexOf(i);
        if (at >= 0) S.edit.group.splice(at, 1); else S.edit.group.push(i);
        _groupHighlight();
        S.edit.feet.forEach((_, k) => _syncFoot(k));
    }
    function _dragStart(e, info) {
        e.preventDefault(); e.stopPropagation();
        S.edit.drag = Object.assign({ sx: e.clientX, sy: e.clientY, shift: e.shiftKey }, info);
        if (info.kind === 'obj') {
            S.edit.sel = info.i;
            const o = _b.CFG.layout[info.i];
            S.edit.drag.ox = o.x; S.edit.drag.oy = o.y;
            // 群組拖動：拖到的物件在群組內→記下整組原始座標，一起移動
            if (S.edit.group.includes(info.i)) {
                S.edit.drag.groupOrig = S.edit.group.map(gi => ({ i: gi, x: _b.CFG.layout[gi].x, y: _b.CFG.layout[gi].y }));
            }
            S.edit.feet.forEach((_, k) => _syncFoot(k));
        } else if (info.kind === 'pt') {
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
        } else if (info.kind === 'marquee') {
            const r = S.world.getBoundingClientRect();
            S.edit.drag.mx = (e.clientX - r.left) / S.scale;   // 框選起點（地圖座標）
            S.edit.drag.my = (e.clientY - r.top) / S.scale;
            const box = document.createElement('div');
            box.className = 'lstage-marquee';
            S.world.appendChild(box);
            S.edit.drag.box = box;
        }
    }
    function _dragMove(e) {
        const d = S.edit?.drag;
        if (!d) return;
        let dx = (e.clientX - d.sx) / S.scale, dy = (e.clientY - d.sy) / S.scale;
        // ⇧ Shift+拖=鎖直線：只走位移大的那個軸（搬位置類才鎖；調大小/平移/框選不鎖）
        if (e.shiftKey && (d.kind === 'obj' || d.kind === 'pt' || d.kind === 'zone' || d.kind === 'door')) {
            if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0;
        }
        if (d.kind === 'obj') {
            if (d.groupOrig) {   // 整組同移
                d.groupOrig.forEach(g => {
                    const oo = _b.CFG.layout[g.i];
                    oo.x = Math.round(g.x + dx); oo.y = Math.round(g.y + dy);
                    _b.placeObj(S.objEls[g.i], oo); _syncFoot(g.i);
                });
            } else {
                const o = _b.CFG.layout[d.i];
                o.x = Math.round(d.ox + dx); o.y = Math.round(d.oy + dy);
                _b.placeObj(S.objEls[d.i], o); _syncFoot(d.i);
            }
        } else if (d.kind === 'pt') {
            d.pt.x = Math.round(d.ox + dx); d.pt.y = Math.round(d.oy + dy);
            d.m.style.left = d.pt.x + 'px'; d.m.style.top = d.pt.y + 'px';
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
        } else if (d.kind === 'marquee') {
            d.rx = Math.min(d.mx, d.mx + dx); d.ry = Math.min(d.my, d.my + dy);
            d.rw = Math.abs(dx); d.rh = Math.abs(dy);
            d.box.style.left = d.rx + 'px'; d.box.style.top = d.ry + 'px';
            d.box.style.width = d.rw + 'px'; d.box.style.height = d.rh + 'px';
        }
    }
    // 拖完把「這一步的原始座標」推進復原疊（每步只存幾個數字，上限50步＝幾KB，不吃記憶體）
    function _pushUndo(op) {
        const u = S.edit.undo || (S.edit.undo = []);
        u.push(op);
        if (u.length > 50) u.shift();
    }
    function _undo() {
        const u = S.edit?.undo;
        if (!u || !u.length) return;
        const op = u.pop();
        if (op.t === 'obj') {
            op.items.forEach(it => {
                const o = _b.CFG.layout[it.i];
                if (!o) return;
                o.x = it.x; o.y = it.y;
                _b.placeObj(S.objEls[it.i], o); _syncFoot(it.i);
            });
        } else if (op.t === 'pt') {
            op.pt.x = op.x; op.pt.y = op.y;
            if (op.m) { op.m.style.left = op.x + 'px'; op.m.style.top = op.y + 'px'; }
        } else if (op.t === 'zone') {
            const z = _b.CFG.points[op.pk]; z.x = op.x; z.y = op.y; _syncZone(op.pk);
        } else if (op.t === 'zoneresize') {
            const z = _b.CFG.points[op.pk]; z.w = op.w; z.h = op.h; _syncZone(op.pk);
        } else if (op.t === 'door') {
            const D = _b.CFG.doors[op.i]; if (D) { D.x = op.x; D.y = op.y; _syncDoor(op.i); }
        } else if (op.t === 'doorresize') {
            const D = _b.CFG.doors[op.i]; if (D) { D.w = op.w; D.h = op.h; _syncDoor(op.i); }
        }
        _exportToPanel();
    }
    function _dragEnd() {
        const d = S.edit?.drag;
        if (!d) return;
        if (d.kind === 'marquee') {   // 放開=收框：框到的家具設成群組；框太小(等於點一下)=清空群組
            d.box.remove();
            if ((d.rw || 0) < 6 && (d.rh || 0) < 6) { S.edit.group = []; }
            else {
                const hit = [];
                _b.CFG.layout.forEach((o, i) => {
                    const s = o.s || 1, w = o.w * s, h = o.h * s;
                    if (o.x < d.rx + d.rw && o.x + w > d.rx && o.y < d.ry + d.rh && o.y + h > d.ry) hit.push(i);
                });
                S.edit.group = hit;
            }
            _groupHighlight();
        } else if (d.kind === 'obj') {
            const items = d.groupOrig ? d.groupOrig.map(g => ({ i: g.i, x: g.x, y: g.y })) : [{ i: d.i, x: d.ox, y: d.oy }];
            if (items.some(it => { const o = _b.CFG.layout[it.i]; return o && (o.x !== it.x || o.y !== it.y); })) _pushUndo({ t: 'obj', items });
            else if (d.shift) _toggleGroup(d.i);   // ⇧ Shift+點一下家具(沒拖動)=加入/移出群組（拖了就是鎖直線移動）
        } else if (d.kind === 'pt') {
            if (d.pt.x !== d.ox || d.pt.y !== d.oy) _pushUndo({ t: 'pt', pt: d.pt, m: d.m, x: d.ox, y: d.oy });
        } else if (d.kind === 'zone') {
            const z = _b.CFG.points[d.pk];
            if (z.x !== d.ox || z.y !== d.oy) _pushUndo({ t: 'zone', pk: d.pk, x: d.ox, y: d.oy });
        } else if (d.kind === 'zoneresize') {
            const z = _b.CFG.points[d.pk];
            if (z.w !== d.ox || z.h !== d.oy) _pushUndo({ t: 'zoneresize', pk: d.pk, w: d.ox, h: d.oy });
        } else if (d.kind === 'door') {
            const D = _b.CFG.doors[d.i];
            if (D.x !== d.ox || D.y !== d.oy) _pushUndo({ t: 'door', i: d.i, x: d.ox, y: d.oy });
        } else if (d.kind === 'doorresize') {
            const D = _b.CFG.doors[d.i];
            if (D.w !== d.ox || D.h !== d.oy) _pushUndo({ t: 'doorresize', i: d.i, w: d.ox, h: d.oy });
        } else if (d.kind === 'cam') {
            // 點一下空地(幾乎沒拖動)=取消圈選/選取——跟PS點空白處取消選取同直覺
            if (Math.abs(S.edit.cam.x - d.ox) < 3 && Math.abs(S.edit.cam.y - d.oy) < 3) _deselect();
        }
        S.edit.drag = null;
        _exportToPanel();
    }
    function _deselect() {
        S.edit.group = []; _groupHighlight();
        S.edit.sel = -1;
        S.edit.feet.forEach((_, k) => _syncFoot(k));
    }
    function _exportData() {
        const data = {
            layoutFull: _b.CFG.layout.map(o => {
                const rec = { x: o.x, y: o.y, w: o.w, h: o.h, footH: o.footH, s: o.s || 1 };
                if (o.footW != null) rec.footW = o.footW;
                if (o.layer) rec.layer = o.layer;
                if (o.flipX) rec.flipX = true;
                if (o.noCollide) rec.noCollide = true;
                if (o.file) rec.file = o.file;
                if (o.url) rec.url = o.url;
                if (o.idb) rec.idb = o.idb;
                if (o.float) rec.float = true;
                if (o.nightFile) rec.nightFile = o.nightFile;   // 夜間成對素材（城市物件）：不存會讓調過的物件夜裡變日版
                if (o.plot) rec.plot = o.plot;                  // 🏘 地塊欄位：不存的話「完成」一按房/框就脫鉤
                if (o.plotFrame) rec.plotFrame = o.plotFrame;
                if (o.zb) rec.zb = o.zb;                        // 疊層微調
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
        if (S.edit._panDown) S.root?.removeEventListener('pointerdown', S.edit._panDown);   // 移除拖空地平移監聽
        if (S.edit._onKey) window.removeEventListener('keydown', S.edit._onKey, true);      // 移除 Ctrl+Z 監聽
        S.edit.drag?.box?.remove();   // 框選拖到一半離開→收掉殘框
        S.edit.feet.forEach(f => f.remove());
        S.edit.markers.forEach(m => m.remove());
        Object.values(S.edit.zones || {}).forEach(el => el.remove());
        S.edit.maskView?.remove();
        (S.edit.doorRects || []).forEach(el => el.remove());
        S.edit.panel?.remove();
        S.objEls.forEach(img => { img.classList.remove('lstage-editable'); img.onpointerdown = null; });
        const click = S.root?.querySelector('.lstage-click');
        if (click) click.onpointerdown = null;
        S.root?.classList.remove('lstage-editing');
        S.edit = null;
        _b.fitCamera();   // 離開建構模式→還原 cover 縮放
        if (save) { _b.rebuildBlocks(); LS.unmount(); LS.tryMount(); }   // 重掛=重生NPC站位+碰撞
    }

    window.LobbyEditor = {
        enter: enterEdit,               // 進入擺設模式
        exit: exitEdit,                 // exit(true)=存檔重掛、exit(false)=直接收（unmount 收殘留用）
        toggle: () => (S.edit ? exitEdit(true) : enterEdit()),   // 🖊 鈕（lobby_stage tryMount 呼叫）
        isOn: () => !!S.edit,
        syncFeet: () => { if (S.edit) S.edit.feet.forEach((_, k) => _syncFoot(k)); },   // alpha 晚載到→回呼刷新剪影
    };
})();
