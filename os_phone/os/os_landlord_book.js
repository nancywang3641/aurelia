// ----------------------------------------------------------------
// [檔案] os_landlord_book.js
// 路徑：os_phone/os/os_landlord_book.js
// 職責：🏢「房產手帳」獨立窗口——房產經營的唯一入口（大廳右側 dock 開啟）。
//   合併了舊的手機「我的房產」面板與家具商城：
//   書籤①我的房產＝收租帳、一戶一卡（看房訪客/退租留言/進房間/套藍圖/出租設定/重新生成）
//   書籤②藍圖冊＝已擁有的藍圖＋藍圖商城＋訂製
//   視覺＝白藍視差風（同藏書入場精靈：白理石八角面板＋深藍＋金線）。
//   資料與引擎都在別處（OS_LANDLORD / OS_BLUEPRINTS / OS_ROOM_GEN），這裡只管畫與串。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const d = win.document;

    function _LL() { return win.OS_LANDLORD || window.OS_LANDLORD || null; }
    function _BP() { return win.OS_BLUEPRINTS || window.OS_BLUEPRINTS || null; }
    function _GEN() { return win.OS_ROOM_GEN || window.OS_ROOM_GEN || null; }
    function _SVGM() { return win.OS_ROOM_SVG || window.OS_ROOM_SVG || null; }
    function _pt() { return win.OS_PT || window.OS_PT; }

    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function _toast(msg) { try { win.toastr && win.toastr.info(msg); } catch (e) {} }

    function _injectStyle() {
        if (d.getElementById('llb-style')) return;
        const s = d.createElement('style'); s.id = 'llb-style';
        s.textContent = [
            // ── 窗殼：深底幕 + 白理石八角面板（同入場精靈語彙） ──
            '#llb-root{position:fixed;inset:0;z-index:99990;display:flex;justify-content:center;align-items:flex-start;',
            '  overflow-y:auto;background:rgba(10,13,20,.72);backdrop-filter:blur(3px);',
            "  font-family:'Noto Serif TC','Source Han Serif TC','Songti TC','PMingLiU',serif;color:#1f3a68;",
            '  padding:28px 12px 48px;box-sizing:border-box;scrollbar-width:thin}',
            // 高度不隨內容縮：min 高鎖住(小螢幕=貼滿視窗,大螢幕=固定書頁高),兩個書籤切換窗形不跳
            '.llb-book{position:relative;width:880px;max-width:100%;margin:auto;',
            '  min-height:calc(100vh - 76px);min-height:min(calc(100dvh - 76px),820px);',
            '  background:linear-gradient(178deg,#ffffff 0%,#fbfcfe 55%,#f4f6fb 100%);',
            '  clip-path:polygon(22px 0,calc(100% - 22px) 0,100% 22px,100% calc(100% - 22px),',
            '  calc(100% - 22px) 100%,22px 100%,0 calc(100% - 22px),0 22px);',
            '  box-shadow:0 14px 40px rgba(31,58,104,.4);padding:26px 40px 34px;box-sizing:border-box;',
            '  display:flex;flex-direction:column;align-items:center;gap:15px}',
            '.llb-book::before{content:"";position:absolute;top:8px;left:50%;width:8px;height:8px;',
            '  background:#b9924f;transform:translateX(-50%) rotate(45deg);opacity:.85}',
            '.llb-close{position:absolute;top:12px;right:14px;border:none;background:none;cursor:pointer;',
            '  color:#1e3a76;font-size:19px;padding:6px;line-height:1;z-index:5}',
            '.llb-close:hover{transform:scale(1.12)}',
            // 標題列：翼線 ─◆ 標題 ◆─
            '.llb-title-row{width:100%;display:flex;align-items:center;gap:16px;margin-top:4px}',
            '.llb-wing{flex:1;height:2px;position:relative;background:linear-gradient(90deg,transparent,rgba(42,74,128,.45))}',
            '.llb-wing::after{content:"";position:absolute;right:-2px;top:50%;width:7px;height:7px;',
            '  background:#2a4a80;transform:translateY(-50%) rotate(45deg)}',
            '.llb-wing.r{background:linear-gradient(270deg,transparent,rgba(42,74,128,.45))}',
            '.llb-wing.r::after{right:auto;left:-2px}',
            // 🚨 標題/粗體一律明寫顏色與字體：窗口掛在酒館 body 下，主題的全域 h1/b 樣式(常是金黃字)會蓋進來
            '.llb-h1{margin:0;font-size:27px;font-weight:700;letter-spacing:.35em;text-indent:.35em;',
            '  white-space:nowrap;color:#1f3a68!important;font-family:inherit;line-height:1.4;text-shadow:none!important}',
            // 頁首：書籤 + PT
            '.llb-head{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}',
            '.llb-tabs{display:flex;gap:10px}',
            '.llb-tab{padding:7px 26px;background:#fdfdfc;border:1.5px solid rgba(42,74,128,.35);border-radius:22px;',
            '  font-size:14.5px;letter-spacing:.25em;text-indent:.25em;cursor:pointer;white-space:nowrap;',
            '  font-family:inherit;color:#1f3a68}',
            '.llb-tab.on{background:linear-gradient(180deg,#2c4a7e,#1e3554);color:#f4efe3;border-color:#1e3554}',
            '.llb-pt{display:flex;align-items:center;gap:7px;padding:6px 16px;background:#fdfdfc;',
            '  border:1px solid rgba(42,74,128,.35);border-radius:20px;font-size:14px;font-weight:700}',
            '.llb-pt i{color:#b9924f}',
            '.llb-page{width:100%;display:flex;flex-direction:column;gap:13px}',
            // 段落標：─◆ 名 ◆─
            '.llb-sec{display:flex;align-items:center;gap:12px;margin-top:2px}',
            '.llb-sec .d{flex:1;height:1.2px;position:relative;background:linear-gradient(90deg,transparent,rgba(42,74,128,.4))}',
            '.llb-sec .d::after{content:"";position:absolute;right:0;top:50%;width:5px;height:5px;',
            '  background:#2a4a80;transform:translateY(-50%) rotate(45deg)}',
            '.llb-sec .d.r{background:linear-gradient(270deg,transparent,rgba(42,74,128,.4))}',
            '.llb-sec .d.r::after{right:auto;left:0}',
            '.llb-sec b{font-size:15px;letter-spacing:.3em;text-indent:.3em;white-space:nowrap;color:#1f3a68!important;text-shadow:none!important}',
            // 收租條
            '.llb-strip{width:100%;box-sizing:border-box;padding:10px 20px;background:#fdfdfc;',
            '  border:1px solid rgba(42,74,128,.28);border-radius:26px;font-size:13px;letter-spacing:.08em;line-height:1.8}',
            '.llb-strip small{color:#46639b;margin-left:.6em}',
            // 戶卡
            '.llb-units{display:grid;grid-template-columns:1fr 1fr;gap:16px;width:100%}',
            '.llb-unit{position:relative;background:#fdfdfc;border:1.5px solid rgba(42,74,128,.55);border-radius:6px;',
            '  padding:15px 15px 13px;display:flex;flex-direction:column;gap:10px;cursor:pointer}',
            '.llb-unit::before,.llb-unit::after{content:"";position:absolute;width:12px;height:12px;pointer-events:none}',
            '.llb-unit::before{top:3px;left:3px;border-top:3px solid #2a4a80;border-left:3px solid #2a4a80}',
            '.llb-unit::after{bottom:3px;right:3px;border-bottom:3px solid #2a4a80;border-right:3px solid #2a4a80}',
            '.llb-unit.sel{border-color:#2a4a80;box-shadow:0 0 0 1.5px #2a4a80,0 0 16px rgba(42,74,128,.3)}',
            '.llb-unit-top{display:flex;gap:14px}',
            '.llb-thumb{flex:0 0 92px;height:76px;border-radius:4px;overflow:hidden;',
            '  background:linear-gradient(180deg,#223c6b,#1a2d51);display:flex;align-items:center;justify-content:center}',
            '.llb-thumb img{width:100%;height:100%;object-fit:cover;display:block}',
            // 摳過黑底的房形圖:整間房完整浮在深藍底上(cover 會把梯形房的邊裁掉)
            '.llb-thumb img.cut{object-fit:contain;padding:3px;box-sizing:border-box}',
            '.llb-thumb svg{width:86%;display:block}',
            '.llb-unit-info{flex:1;display:flex;flex-direction:column;gap:5px;min-width:0}',
            '.llb-unit-name{font-size:16.5px;font-weight:700;letter-spacing:.1em}',
            '.llb-unit-line{font-size:12.5px;color:#46639b;letter-spacing:.05em;line-height:1.7}',
            '.llb-chip{align-self:flex-start;padding:2.5px 12px;border-radius:14px;font-size:11.5px;',
            '  letter-spacing:.1em;border:1px solid}',
            '.llb-chip.ok{color:#2c6e49;border-color:rgba(44,110,73,.5);background:rgba(44,110,73,.07)}',
            '.llb-chip.warn{color:#8a6a1f;border-color:rgba(138,106,31,.45);background:rgba(138,106,31,.07)}',
            '.llb-chip.bad{color:#9c3a3a;border-color:rgba(156,58,58,.45);background:rgba(156,58,58,.06)}',
            '.llb-chip.idle{color:#46639b;border-color:rgba(42,74,128,.35);background:rgba(42,74,128,.05)}',
            // 就地展開的操作列（六角鈕）
            '.llb-acts{display:none;flex-wrap:wrap;gap:8px;border-top:1px dashed rgba(42,74,128,.3);padding-top:10px}',
            '.llb-unit.sel .llb-acts{display:flex}',
            '.llb-act{flex:1 1 40%;height:34px;display:flex;align-items:center;justify-content:center;gap:6px;',
            '  background:#2a4a80;border:none;clip-path:polygon(6% 0,94% 0,100% 50%,94% 100%,6% 100%,0 50%);',
            '  position:relative;font-size:12.5px;letter-spacing:.15em;text-indent:.15em;color:#1f3a68;',
            '  cursor:pointer;font-family:inherit}',
            '.llb-act::before{content:"";position:absolute;inset:1.4px;background:#fdfdfc;',
            '  clip-path:polygon(6% 0,94% 0,100% 50%,94% 100%,6% 100%,0 50%)}',
            '.llb-act span,.llb-act i{position:relative;z-index:1}',
            '.llb-act.main{color:#f4efe3}',
            '.llb-act.main::before{background:linear-gradient(180deg,#2c4a7e,#1e3554 60%,#16263e)}',
            '.llb-act:disabled{opacity:.5;cursor:default}',
            // 看房/退租列（卡片裡）
            '.llb-visit{border-top:1px dashed rgba(42,74,128,.3);padding-top:9px;display:flex;flex-direction:column;gap:6px}',
            '.llb-visit-head{display:flex;align-items:baseline;gap:8px;font-size:13px}',
            '.llb-visit-head b{font-weight:700;color:#1f3a68!important;text-shadow:none!important}',
            '.llb-want{color:#2c6e49;font-size:11.5px}',
            '.llb-pass{color:#46639b;font-size:11.5px}',
            '.llb-gone{color:#9c3a3a;font-size:11.5px}',
            '.llb-visit-line{font-size:12px;line-height:1.8;color:#33507f}',
            '.llb-visit-line.bad{color:#9c3a3a}',
            '.llb-visit-bar{display:flex;gap:6px;flex-wrap:wrap}',
            '.llb-mini{display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:15px;',
            '  border:1px solid rgba(42,74,128,.4);background:#fdfdfc;color:#1f3a68;font-size:11.5px;',
            '  letter-spacing:.06em;cursor:pointer;font-family:inherit}',
            '.llb-mini.go{background:#2a4a80;color:#f2f5fb;border-color:#2a4a80}',
            '.llb-mini.quiet{color:#46639b}',
            '.llb-mini:disabled{opacity:.5;cursor:default}',
            '.llb-note{width:100%;box-sizing:border-box;padding:10px 18px;border:1.2px dashed rgba(42,74,128,.35);',
            '  border-radius:6px;font-size:12.5px;color:#46639b;letter-spacing:.06em;line-height:1.8;',
            '  display:flex;align-items:center;gap:10px}',
            '.llb-note i{color:#b9924f}',
            '.llb-msg{font-size:12.5px;color:#46639b;letter-spacing:.05em;line-height:1.8}',
            '.llb-msg.bad{color:#9c3a3a}',
            // ── 藍圖卡 ──
            '.llb-bps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;width:100%}',
            '.llb-bp{position:relative;border-radius:6px;overflow:hidden;color:#eef3fb;padding:13px 14px 11px;',
            '  display:flex;flex-direction:column;gap:7px;border:1px solid rgba(255,255,255,.22);',
            '  background:repeating-linear-gradient(0deg,transparent 0 17px,rgba(255,255,255,.09) 17px 18px),',
            '  repeating-linear-gradient(90deg,transparent 0 17px,rgba(255,255,255,.09) 17px 18px),',
            '  linear-gradient(165deg,#2b4d86,#1c3358 70%,#16294a)}',
            '.llb-bp-name{font-size:15.5px;font-weight:700;letter-spacing:.18em;display:flex;align-items:center;gap:8px}',
            '.llb-bp-name i{font-size:13px;color:#cfe0f8}',
            '.llb-bp-desc{font-size:11.5px;color:#c3d4ee;letter-spacing:.04em;line-height:1.7;min-height:2.6em}',
            '.llb-sw{display:flex;gap:6px}',
            '.llb-sw span{width:22px;height:14px;border-radius:3px;border:1px solid rgba(255,255,255,.5)}',
            '.llb-bp-foot{display:flex;align-items:center;justify-content:space-between;margin-top:2px;gap:6px}',
            '.llb-bp-tags{font-size:10.5px;color:#9fb6da;letter-spacing:.1em}',
            '.llb-apply{padding:4px 16px;border:none;background:linear-gradient(180deg,#d8bc85,#b9924f 45%,#8f6f38);',
            '  color:#fff8e8;border-radius:3px;font-size:12px;letter-spacing:.22em;text-indent:.22em;',
            '  cursor:pointer;font-family:inherit}',
            '.llb-apply:disabled{opacity:.5;cursor:default}',
            '.llb-bp.shop{background:#fdfdfc;border:1.5px solid rgba(42,74,128,.5);color:#1f3a68}',
            '.llb-bp.shop .llb-bp-desc{color:#46639b}',
            '.llb-bp.shop .llb-bp-name i{color:#2a4a80}',
            '.llb-bp.shop .llb-bp-tags{color:#46639b}',
            '.llb-price{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700}',
            '.llb-price i{color:#b9924f}',
            '.llb-buy{padding:4px 16px;border:none;background:#2a4a80;color:#f2f5fb;border-radius:3px;',
            '  font-size:12px;letter-spacing:.22em;text-indent:.22em;cursor:pointer;font-family:inherit}',
            '.llb-buy:disabled{opacity:.5;cursor:default}',
            '.llb-bp.custom{background:#fdfdfc;border:1.5px dashed rgba(42,74,128,.55);color:#1f3a68;gap:8px}',
            '.llb-bp.custom .llb-bp-desc{color:#46639b;min-height:0}',
            '.llb-bp.custom input{width:100%;box-sizing:border-box;border:1px solid rgba(42,74,128,.35);',
            '  border-radius:4px;background:#fff;color:#1f3a68;font-family:inherit;font-size:12px;padding:7px 9px}',
            '.llb-bp.custom input:focus{outline:none;border-color:#2a4a80}',
            // ── 小窗（單元選擇/出租設定）與忙碌幕 ──
            '.llb-sheet{position:fixed;inset:0;z-index:99995;background:rgba(10,13,20,.55);',
            '  display:flex;align-items:center;justify-content:center;padding:18px}',
            '.llb-card{width:100%;max-width:360px;background:#fdfdfc;border:1.5px solid rgba(42,74,128,.55);',
            '  border-radius:6px;padding:16px 18px;position:relative;box-shadow:0 10px 30px rgba(31,58,104,.35)}',
            '.llb-card::before{content:"";position:absolute;top:3px;left:3px;width:12px;height:12px;',
            '  border-top:3px solid #2a4a80;border-left:3px solid #2a4a80;pointer-events:none}',
            '.llb-card::after{content:"";position:absolute;bottom:3px;right:3px;width:12px;height:12px;',
            '  border-bottom:3px solid #2a4a80;border-right:3px solid #2a4a80;pointer-events:none}',
            '.llb-card-title{font-size:14.5px;font-weight:700;letter-spacing:.2em;text-indent:.2em;',
            '  text-align:center;margin-bottom:10px}',
            '.llb-card-list{display:flex;flex-direction:column;gap:8px;max-height:46vh;overflow-y:auto;scrollbar-width:thin}',
            '.llb-card-bar{display:flex;gap:8px;margin-top:12px;justify-content:center;flex-wrap:wrap}',
            '.llb-rent{margin:4px 0 8px;font-size:20px;font-weight:700;text-align:center;color:#1f3a68}',
            '.llb-busy{position:fixed;inset:0;z-index:99999;background:rgba(10,13,20,.78);display:flex;',
            '  flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;text-align:center;',
            '  color:#f2f5fb;font-size:14.5px;letter-spacing:.1em;line-height:1.9;font-family:inherit}',
            '.llb-busy i{font-size:22px;color:#d8bc85}',
            // 直式：單欄
            '@media (max-width:640px){',
            '  .llb-book{padding:20px 16px 26px}',
            '  .llb-h1{font-size:22px;letter-spacing:.25em;text-indent:.25em}',
            '  .llb-head{flex-direction:column;align-items:stretch}',
            '  .llb-tabs{justify-content:center}',
            '  .llb-pt{align-self:center}',
            '  .llb-units,.llb-bps{grid-template-columns:1fr}',
            '}',
        ].join('\n');
        (d.head || d.documentElement).appendChild(s);
    }

    // ── 小工具 ──
    function _mini(icon, text, extra) {
        const b = d.createElement('button'); b.type = 'button';
        b.className = 'llb-mini' + (extra ? ' ' + extra : '');
        b.innerHTML = '<i class="' + icon + '"></i> ' + _esc(text);
        return b;
    }
    function _act(icon, text, main) {
        const b = d.createElement('button'); b.type = 'button';
        b.className = 'llb-act' + (main ? ' main' : '');
        b.innerHTML = '<i class="' + icon + '"></i><span>' + _esc(text) + '</span>';
        return b;
    }
    // 縮圖摳圖快取:同一張房圖只算一次(key=戶id+生成時間,重新生成後 at 變了自然重算)
    const _thumbCuts = {};
    async function _thumbCut(id, room) {
        const GEN = _GEN();
        if (!GEN || typeof GEN.cutout !== 'function' || !room || !room.image) return null;
        const key = id + '::' + (room.at || 0);
        if (key in _thumbCuts) return _thumbCuts[key];
        let cut = null;
        try { cut = await GEN.cutout(room.image); } catch (e) {}
        _thumbCuts[key] = cut;
        return cut;
    }

    // 空房縮圖：藍圖線稿(inline SVG,不吃任何素材)
    function _thumbPlaceholder(empty) {
        return '<svg viewBox="0 0 120 84" xmlns="http://www.w3.org/2000/svg">'
            + '<g fill="none" stroke="#cfe0f8" stroke-width="1.6"' + (empty ? ' opacity="0.55"' : '') + '>'
            + '<path d="M28 14 L92 14 L106 66 L14 66 Z"/>'
            + (empty ? '' : '<path d="M36 24 L84 24 L94 58 L26 58 Z" opacity="0.55"/>')
            + '<path d="M50 66 L50 78 L70 78 L70 66" opacity="0.8"/></g>'
            + (empty ? '<text x="60" y="46" fill="#cfe0f8" font-size="11" text-anchor="middle" opacity="0.75" letter-spacing="2">空 房</text>' : '')
            + '</svg>';
    }
    function _unitLabel(u) {
        const RT = (_SVGM() && _SVGM().ROOM_TYPES) || {};
        const type = (RT[u.roomTypeKey] && RT[u.roomTypeKey].label) || '房間';
        const slot = String.fromCharCode(65 + (u.slot || 0));
        return (u.floor ? (u.floor + '樓 ' + slot + ' · ') : '') + type;
    }
    function _specOfUnit(u) {
        const RT = (_SVGM() && _SVGM().ROOM_TYPES) || {};
        const t = RT[u.roomTypeKey] || RT.standard || { w: 4.2, d: 4.0, wallH: 1.0, floor: 'oak' };
        return { w: t.w, d: t.d, wallH: t.wallH, floor: t.floor, window: true, label: t.label || '', typeKey: u.roomTypeKey };
    }

    // 忙碌幕：整窗蓋住(生圖中不准亂點)。回 {say, done}
    function _busy(text) {
        const el = d.createElement('div'); el.className = 'llb-busy';
        el.innerHTML = '<i class="fa-solid fa-compass-drafting fa-fade"></i><div class="llb-busy-txt"></div>';
        const txt = el.querySelector('.llb-busy-txt');
        txt.textContent = text || '正在準備…';
        d.body.appendChild(el);
        return {
            say: function (msg) { txt.textContent = msg || ''; },
            done: function () { try { el.remove(); } catch (e) {} },
        };
    }

    // 通用小窗：回 {sheet, card, close}
    function _sheet(titleText) {
        const sheet = d.createElement('div'); sheet.className = 'llb-sheet';
        const card = d.createElement('div'); card.className = 'llb-card';
        const title = d.createElement('div'); title.className = 'llb-card-title'; title.textContent = titleText;
        card.appendChild(title);
        sheet.appendChild(card);
        sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });
        function close() { try { sheet.remove(); } catch (e) {} }
        d.body.appendChild(sheet);
        return { sheet: sheet, card: card, close: close };
    }

    // ══════════════════════════════════════════════════════════
    let _root = null, _tab = 'estate', _selUnit = null;

    function open() {
        if (d.getElementById('llb-root')) return;   // 已經開著
        _injectStyle();
        _root = d.createElement('div'); _root.id = 'llb-root';
        _root.innerHTML = ''
            + '<div class="llb-book">'
            + '  <button class="llb-close" type="button" title="關上"><i class="fa-solid fa-xmark"></i></button>'
            + '  <div class="llb-title-row"><span class="llb-wing"></span><div class="llb-h1">房產手帳</div><span class="llb-wing r"></span></div>'
            + '  <div class="llb-head">'
            + '    <div class="llb-tabs">'
            + '      <button class="llb-tab" type="button" data-tab="estate">我的房產</button>'
            + '      <button class="llb-tab" type="button" data-tab="book">藍圖冊</button>'
            + '    </div>'
            + '    <div class="llb-pt"><i class="fa-solid fa-coins"></i><span id="llb-pt-num">…</span></div>'
            + '  </div>'
            + '  <div class="llb-page" id="llb-page"></div>'
            + '</div>';
        d.body.appendChild(_root);
        _root.querySelector('.llb-close').onclick = close;
        _root.querySelectorAll('.llb-tab').forEach(function (t) {
            t.onclick = function () { _switch(t.dataset.tab); };
        });
        _switch(_tab);
    }
    function close() {
        if (_root) { try { _root.remove(); } catch (e) {} _root = null; }
    }
    function _switch(tab) {
        _tab = tab;
        if (!_root) return;
        _root.querySelectorAll('.llb-tab').forEach(function (t) { t.classList.toggle('on', t.dataset.tab === tab); });
        const page = _root.querySelector('#llb-page');
        page.innerHTML = '<div class="llb-msg">正在翻開手帳…</div>';
        (tab === 'estate' ? _renderEstate(page) : _renderBook(page)).catch(function (e) {
            console.warn('[LandlordBook] 畫面失敗', e);
            if (page.isConnected) page.innerHTML = '<div class="llb-msg bad">這一頁暫時翻不開，關上再試一次。</div>';
        });
    }
    async function _refreshPT() {
        const el = _root && _root.querySelector('#llb-pt-num');
        if (!el) return;
        let v = 0;
        try { const pt = _pt(); if (pt && pt.getPT) v = await pt.getPT(); } catch (e) {}
        el.textContent = v;
    }

    // ══ 書籤①：我的房產 ══════════════════════════════════════
    async function _renderEstate(page) {
        const LL = _LL();
        if (!LL) { page.innerHTML = '<div class="llb-msg bad">房產還沒載入完，稍等一下再開。</div>'; return; }
        const res = await LL._openAndSettle();
        _refreshPT();
        // ♻️ 家具商城收攤折讓（只會真的跑一次）
        let refundLine = '';
        try {
            const BP = _BP();
            const mg = BP ? await BP.migrateFurniture() : null;
            if (mg && mg.done && mg.refunded > 0) {
                refundLine = '家具商城收攤了：倉庫裡的 ' + mg.count + ' 件折成 ' + mg.refunded + ' 已經入帳。以後布置改用藍圖或手寫包裹。';
                _refreshPT();
            }
        } catch (e) { console.warn('[LandlordBook] 家具折讓失敗，下次再試', e); }
        if (!page.isConnected) return;
        page.innerHTML = '';

        // 收租條
        const strip = d.createElement('div'); strip.className = 'llb-strip';
        const line = res.payFailed
            ? '房租入帳暫時失敗，晚點再翻開手帳就會自動重新結算。'
            : (res.saveFailed
                ? '房租已經收好了，紀錄慢了一拍，下次翻開會重新整理。'
                : (res.days > 0 && res.earned > 0
                    ? ('你不在的這 ' + res.days + ' 天，收到房租 ' + res.earned + '。')
                    : (res.days > 0 ? ('過了 ' + res.days + ' 天，目前沒有房客繳租。') : '今天的房租已經收過了。')));
        strip.innerHTML = _esc(line) + (refundLine ? '<br><small>' + _esc(refundLine) + '</small>' : '');
        page.appendChild(strip);

        const state = res.state || {};
        const unitsWrap = d.createElement('div'); unitsWrap.className = 'llb-units';
        page.appendChild(unitsWrap);

        if (!(state.units || []).length) {
            const note = d.createElement('div'); note.className = 'llb-note';
            note.innerHTML = '<i class="fa-solid fa-building"></i>你的樓還沒隔出租房。走進城市裡自己那棟，用裡面那根柱子加蓋，就會多出兩間可以出租。';
            page.appendChild(note);
            return;
        }

        for (const u of state.units) {
            unitsWrap.appendChild(await _unitCard(u, res, page));
        }

        const floors = state.floors || 0;
        const cfg = LL._cfg || {};
        const foot = d.createElement('div'); foot.className = 'llb-note';
        foot.innerHTML = '<i class="fa-solid fa-building"></i>'
            + _esc(floors >= (cfg.maxFloors || 4)
                ? ('整棟 ' + floors + ' 樓，已經蓋到頂了。')
                : ('整棟 ' + floors + ' 樓。想再加一層，到樓裡那根柱子。'));
        page.appendChild(foot);
    }

    async function _unitCard(u, res, page) {
        const LL = _LL();
        const card = d.createElement('div'); card.className = 'llb-unit';
        if (_selUnit === u.id) card.classList.add('sel');

        let room = null;
        try { room = await LL.getRoom(u.id); } catch (e) {}

        const top = d.createElement('div'); top.className = 'llb-unit-top';
        const thumb = d.createElement('div'); thumb.className = 'llb-thumb';
        if (room && room.image) {
            const img = d.createElement('img'); img.alt = '';
            // 房形摳圖:剪掉生圖四周的黑底,只把房間本體浮在藍圖紙底上;摳不出來才退回原圖
            const cut = await _thumbCut(u.id, room);
            if (cut) { img.src = cut; img.className = 'cut'; }
            else img.src = room.image;
            thumb.appendChild(img);
        } else {
            thumb.innerHTML = _thumbPlaceholder(true);
        }
        top.appendChild(thumb);

        const info = d.createElement('div'); info.className = 'llb-unit-info';
        const name = d.createElement('div'); name.className = 'llb-unit-name'; name.textContent = _unitLabel(u);
        const sub = d.createElement('div'); sub.className = 'llb-unit-line';
        const paid = res.perUnit && res.perUnit.find(function (p) { return p.unitId === u.id; });
        if (u.tenantKey) {
            sub.innerHTML = '房客：' + _esc(u.tenantName || '房客') + ' · 每日租金 ' + (u.rent || 0)
                + ((u.earnedTotal || 0) ? '<br>累計收租 ' + u.earnedTotal + (paid ? ' · 這次 +' + paid.amount : '') : '');
        } else {
            sub.textContent = u.listed ? ('招租中 · 每日開價 ' + (u.rent || 0)) : '空著，還沒掛招租';
        }
        const chip = d.createElement('span'); chip.className = 'llb-chip';
        if (u.tenantKey) {
            const mood = LL.stayMood(u);
            const n = u.unhappy || 0;
            chip.classList.add(n >= 4 ? 'bad' : (n >= 2 ? 'warn' : 'ok'));
            chip.textContent = mood || '住著';
        } else {
            chip.classList.add('idle');
            chip.textContent = u.listed ? '招租中' : '待招租';
        }
        info.appendChild(name); info.appendChild(sub); info.appendChild(chip);
        top.appendChild(info);
        card.appendChild(top);

        // 🏃 剛搬走的：先講一聲
        (res.state.moveOuts || [])
            .filter(function (o) { return o.unitId === u.id && !o.done; })
            .forEach(function (o) { card.appendChild(_moveOutRow(o, page)); });
        // 🔔 看房訪客：想租的排前面
        if (!u.tenantKey) {
            const opens = (res.state.viewings || [])
                .filter(function (v) { return v.unitId === u.id && !v.done; })
                .sort(function (a, b) { return (b.want - a.want) || (b.day - a.day); });
            opens.forEach(function (v) { card.appendChild(_viewingRow(v, page)); });
            if (!opens.length && u.listed) {
                const idle = d.createElement('div'); idle.className = 'llb-visit';
                idle.innerHTML = '<div class="llb-visit-line">掛著招租，還沒有人上門。</div>';
                card.appendChild(idle);
            }
        }

        // 就地展開的操作列
        const acts = d.createElement('div'); acts.className = 'llb-acts';
        const goIn = _act('fa-solid fa-person-walking', '進房間', true);
        goIn.onclick = function (e) {
            e.stopPropagation();
            close();
            const LR = win.OS_LANDLORD_ROOM || window.OS_LANDLORD_ROOM;
            if (LR && LR.open) LR.open(null, u.id).catch(function (err) { console.warn('[LandlordBook] 進房失敗', err); });
        };
        const applyBp = _act('fa-solid fa-compass-drafting', '套藍圖');
        applyBp.onclick = function (e) { e.stopPropagation(); _pickBlueprintFor(u); };
        const pricing = _act('fa-solid fa-tag', '出租設定');
        pricing.onclick = function (e) { e.stopPropagation(); _openPricing(u); };
        acts.appendChild(goIn); acts.appendChild(applyBp); acts.appendChild(pricing);
        if (room && Array.isArray(room.order) && room.order.length) {
            const regen = _act('fa-solid fa-rotate', '重新生成');
            regen.onclick = function (e) { e.stopPropagation(); _regen(u); };
            acts.appendChild(regen);
        }
        card.appendChild(acts);

        card.addEventListener('click', function () {
            _selUnit = (_selUnit === u.id) ? null : u.id;
            const wrap = card.parentElement;
            if (wrap) wrap.querySelectorAll('.llb-unit').forEach(function (c) { c.classList.remove('sel'); });
            if (_selUnit === u.id) card.classList.add('sel');
        });
        return card;
    }

    // 🏃 一筆退租：誰搬走了、想不想聽他說為什麼（引擎沿用 OS_LANDLORD）
    function _moveOutRow(o, page) {
        const LL = _LL();
        const row = d.createElement('div'); row.className = 'llb-visit';
        row.innerHTML = '<div class="llb-visit-head"><b>' + _esc(o.name) + '</b><span class="llb-gone">搬走了</span></div>';
        const line = d.createElement('div'); line.className = 'llb-visit-line';
        if (o.line) { line.textContent = o.line; row.appendChild(line); }
        const bar = d.createElement('div'); bar.className = 'llb-visit-bar';
        if (!o.line) {
            const hear = _mini('fa-solid fa-comment', '他為什麼走');
            hear.onclick = async function (e) {
                e.stopPropagation();
                hear.disabled = true;
                try {
                    line.textContent = await LL.hearMoveOut(o.id);
                    row.insertBefore(line, bar); hear.remove();
                } catch (err) {
                    hear.disabled = false;
                    line.className = 'llb-visit-line bad';
                    line.textContent = (err && err.message) || '他沒多說什麼。';
                    row.insertBefore(line, bar);
                }
            };
            bar.appendChild(hear);
        }
        const ok = _mini('fa-solid fa-check', '知道了', 'quiet');
        ok.onclick = async function (e) {
            e.stopPropagation();
            ok.disabled = true;
            const r = await LL.dismissMoveOut(o.id).catch(function () { return { ok: false }; });
            if (r && r.ok) { _switch('estate'); return; }
            ok.disabled = false;
        };
        bar.appendChild(ok);
        row.appendChild(bar);
        return row;
    }

    // 🔔 一筆看房：想聽他說什麼、要不要租給他
    function _viewingRow(v, page) {
        const LL = _LL();
        const row = d.createElement('div'); row.className = 'llb-visit';
        row.innerHTML = '<div class="llb-visit-head"><b>' + _esc(v.name) + '</b>'
            + '<span class="' + (v.want ? 'llb-want' : 'llb-pass') + '">' + (v.want ? '想租' : '沒興趣') + '</span></div>';
        const line = d.createElement('div'); line.className = 'llb-visit-line';
        if (v.line) { line.textContent = v.line; row.appendChild(line); }
        const bar = d.createElement('div'); bar.className = 'llb-visit-bar';
        if (!v.line) {
            const hear = _mini('fa-solid fa-comment', '他怎麼說');
            hear.onclick = async function (e) {
                e.stopPropagation();
                hear.disabled = true;
                try {
                    line.textContent = await LL.hearViewing(v.id);
                    row.insertBefore(line, bar); hear.remove();
                } catch (err) {
                    hear.disabled = false;
                    line.className = 'llb-visit-line bad';
                    line.textContent = (err && err.message) || '他這次沒說什麼。';
                    row.insertBefore(line, bar);
                }
            };
            bar.appendChild(hear);
        }
        if (v.want) {
            const yes = _mini('fa-solid fa-key', '租給他', 'go');
            yes.onclick = async function (e) {
                e.stopPropagation();
                yes.disabled = true;
                const r = await LL.moveInFromViewing(v.id).catch(function () { return { ok: false }; });
                if (r && r.ok) { _toast((r.name || '房客') + ' 住進來了。'); _switch('estate'); return; }
                yes.disabled = false;
                line.className = 'llb-visit-line bad';
                line.textContent = r && r.reason === 'occupied' ? '這間已經租出去了。' : '這次沒成，再按一次就好。';
                row.insertBefore(line, bar);
            };
            bar.appendChild(yes);
        }
        const no = _mini('fa-solid fa-xmark', '送走', 'quiet');
        no.onclick = async function (e) {
            e.stopPropagation();
            no.disabled = true;
            const r = await LL.dismissViewing(v.id).catch(function () { return { ok: false }; });
            if (r && r.ok) { _switch('estate'); return; }
            no.disabled = false;
        };
        bar.appendChild(no);
        row.appendChild(bar);
        return row;
    }

    // 💰 出租設定：標租金、掛/撤招租（引擎沿用 getPricing/setListing）
    function _openPricing(u) {
        const LL = _LL();
        const sh = _sheet('出租設定 · ' + _unitLabel(u));
        const rentLine = d.createElement('div'); rentLine.className = 'llb-rent';
        const row = d.createElement('div'); row.className = 'llb-card-bar';
        const msg = d.createElement('div'); msg.className = 'llb-msg'; msg.textContent = '正在看這間房…';
        const bar = d.createElement('div'); bar.className = 'llb-card-bar';
        const closeBtn = _mini('fa-solid fa-xmark', '關上', 'quiet');
        closeBtn.onclick = sh.close;
        bar.appendChild(closeBtn);
        sh.card.appendChild(rentLine); sh.card.appendChild(row); sh.card.appendChild(msg); sh.card.appendChild(bar);

        LL.getPricing(u.id).then(function (p) {
            if (!sh.sheet.isConnected) return;
            if (p.unit.tenantKey) {
                rentLine.textContent = '每日租金 ' + (p.unit.rent || 0);
                msg.textContent = (p.unit.tenantName || '房客') + ' 正住在這裡，租約期間不能改價。';
                return;
            }
            let rent = p.rent;
            function paint() {
                rentLine.textContent = '每日租金 ' + rent;
                const bonus = Math.round(Math.min(14, p.orderCount * 1.6));
                msg.className = 'llb-msg';
                msg.textContent = '建議收 ' + p.suggest
                    + (p.orderCount ? '（房裡的 ' + p.orderCount + ' 件擺設幫它加了 ' + bonus + '）' : '（空房，布置一下能開更高）')
                    + '。可以標 ' + p.min + ' 到 ' + p.max + '。'
                    + (rent > p.suggest ? '　開得比建議高，會比較難租出去。' : (rent < p.suggest ? '　開得比建議低，很快會有人要。' : ''));
            }
            function step(vv) { rent = Math.max(p.min, Math.min(p.max, rent + vv)); paint(); }
            const m5 = _mini('fa-solid fa-minus', '5'); m5.onclick = function () { step(-5); };
            const m1 = _mini('fa-solid fa-minus', '1'); m1.onclick = function () { step(-1); };
            const p1 = _mini('fa-solid fa-plus', '1'); p1.onclick = function () { step(1); };
            const p5 = _mini('fa-solid fa-plus', '5'); p5.onclick = function () { step(5); };
            const fair = _mini('fa-solid fa-scale-balanced', '照建議'); fair.onclick = function () { rent = p.suggest; paint(); };
            [m5, m1, p1, p5, fair].forEach(function (b) { row.appendChild(b); });

            const go = _mini('fa-solid fa-sign-hanging', p.listed ? '改成這個價' : '掛上招租', 'go');
            go.onclick = async function () {
                go.disabled = true;
                const r = await LL.setListing(u.id, rent, true).catch(function () { return { ok: false }; });
                if (r && r.ok) { sh.close(); _toast('已經掛上招租，每日 ' + r.rent + '。'); _switch('estate'); return; }
                msg.className = 'llb-msg bad';
                msg.textContent = r && r.reason === 'occupied' ? '這間已經有房客了。' : '這次沒存起來，再按一次就好。';
                go.disabled = false;
            };
            bar.insertBefore(go, closeBtn);
            if (p.listed) {
                const off = _mini('fa-solid fa-ban', '撤下招租');
                off.onclick = async function () {
                    off.disabled = true;
                    const r = await LL.setListing(u.id, rent, false).catch(function () { return { ok: false }; });
                    if (r && r.ok) { sh.close(); _toast('招租撤下來了。'); _switch('estate'); return; }
                    msg.className = 'llb-msg bad'; msg.textContent = '這次沒存起來，再按一次就好。';
                    off.disabled = false;
                };
                bar.appendChild(off);
            }
            paint();
        }).catch(function (e) {
            console.warn('[LandlordBook] 讀定價失敗', e);
            if (sh.sheet.isConnected) { msg.className = 'llb-msg bad'; msg.textContent = '這間房的資料暫時讀不到，關上再試一次。'; }
        });
    }

    // 📐 給這一戶挑一張藍圖
    async function _pickBlueprintFor(u) {
        const BP = _BP();
        if (!BP) return;
        const sh = _sheet('給 ' + _unitLabel(u) + ' 套藍圖');
        const list = d.createElement('div'); list.className = 'llb-card-list';
        const msg = d.createElement('div'); msg.className = 'llb-msg';
        msg.textContent = '套上去會把這間房整間重畫，原本的布置會被蓋掉。';
        const bar = d.createElement('div'); bar.className = 'llb-card-bar';
        const closeBtn = _mini('fa-solid fa-xmark', '關上', 'quiet'); closeBtn.onclick = sh.close;
        bar.appendChild(closeBtn);
        sh.card.appendChild(list); sh.card.appendChild(msg); sh.card.appendChild(bar);

        let all;
        try { all = await BP.getAll(); } catch (e) { msg.className = 'llb-msg bad'; msg.textContent = '藍圖冊暫時翻不開。'; return; }
        if (!sh.sheet.isConnected) return;
        if (!all.owned.length) {
            msg.textContent = '藍圖冊還是空的。到「藍圖冊」書籤買一張，或訂製一張。';
            return;
        }
        all.owned.forEach(function (bp) {
            const b = _mini((bp.icon ? 'fa-solid ' + bp.icon : 'fa-solid fa-map'), bp.name);
            b.onclick = function () { sh.close(); _applyBlueprint(u, bp); };
            list.appendChild(b);
        });
    }
    async function _applyBlueprint(u, bp) {
        const BP = _BP();
        const bz = _busy('照著「' + bp.name + '」重畫 ' + _unitLabel(u) + '…');
        try {
            await BP.apply(u.id, bp.id, bz.say);
            bz.done();
            _toast(_unitLabel(u) + ' 照「' + bp.name + '」重新裝好了，走進去看看。');
            _switch('estate');
        } catch (e) {
            bz.done();
            console.warn('[LandlordBook] 套藍圖失敗', e);
            _toast((e && e.message) || '這次沒畫成，再試一次就好。');
        }
    }

    // 🔁 重新生成：沿用房裡那份訂單再畫一張（不重翻訂單=不多燒副模型）
    async function _regen(u) {
        const LL = _LL(), GEN = _GEN();
        if (!LL || !GEN) return;
        let room;
        try { room = await LL.getRoom(u.id); } catch (e) {}
        if (!room || !Array.isArray(room.order) || !room.order.length) { _toast('這間房還沒布置過，先套一張藍圖或進房間布置。'); return; }
        const bz = _busy('重新畫 ' + _unitLabel(u) + '…');
        try {
            const spec = _specOfUnit(u);
            const result = await GEN.deliver(spec, room.order, bz.say, { layout: room.layout });
            await LL.saveRoom(u.id, Object.assign({}, room, {
                image: result.image, layout: result.layout,
                roomTypeKey: spec.typeKey,
                floor: result.floor, inner4: result.inner4, viewBox: result.viewBox, personH: result.personH,
                styleName: result.styleName, at: result.at,
            }));
            bz.done();
            _toast(_unitLabel(u) + ' 重新畫好了。');
            _switch('estate');
        } catch (e) {
            bz.done();
            console.warn('[LandlordBook] 重新生成失敗', e);
            _toast((e && e.message) || '這次沒畫成，再按一次就好。');
        }
    }

    // ══ 書籤②：藍圖冊 ═══════════════════════════════════════
    async function _renderBook(page) {
        const BP = _BP();
        if (!BP) { page.innerHTML = '<div class="llb-msg bad">藍圖冊還沒載入完，稍等一下再開。</div>'; return; }
        const all = await BP.getAll();
        _refreshPT();
        if (!page.isConnected) return;
        page.innerHTML = '';

        // 已擁有
        page.appendChild(_secTitle('已擁有'));
        if (!all.owned.length) {
            const m = d.createElement('div'); m.className = 'llb-msg';
            m.textContent = '還沒有藍圖。下面貨架挑一張，或請設計師訂製一張。買斷入冊，之後想套哪一戶都行。';
            page.appendChild(m);
        } else {
            const grid = d.createElement('div'); grid.className = 'llb-bps';
            all.owned.forEach(function (bp) { grid.appendChild(_bpCard(bp, true)); });
            page.appendChild(grid);
        }

        // 商城
        page.appendChild(_secTitle('藍圖商城'));
        const grid2 = d.createElement('div'); grid2.className = 'llb-bps';
        all.shop.forEach(function (bp) { grid2.appendChild(_bpCard(bp, false)); });
        grid2.appendChild(_customCard(all.customPrice));
        page.appendChild(grid2);
    }
    function _secTitle(text) {
        const sec = d.createElement('div'); sec.className = 'llb-sec';
        sec.innerHTML = '<span class="d"></span><b>' + _esc(text) + '</b><span class="d r"></span>';
        return sec;
    }
    function _bpCard(bp, owned) {
        const card = d.createElement('div'); card.className = 'llb-bp' + (owned ? '' : ' shop');
        const sw = (bp.swatches || []).map(function (c) { return '<span style="background:' + _esc(c) + '"></span>'; }).join('');
        card.innerHTML = ''
            + '<div class="llb-bp-name"><i class="fa-solid ' + _esc(bp.icon || 'fa-map') + '"></i>' + _esc(bp.name) + '</div>'
            + '<div class="llb-bp-desc">' + _esc(bp.desc || '') + '</div>'
            + '<div class="llb-sw">' + sw + '</div>'
            + '<div class="llb-bp-foot"></div>';
        const foot = card.querySelector('.llb-bp-foot');
        const tags = d.createElement('span'); tags.className = 'llb-bp-tags';
        tags.textContent = (bp.tags || []).join(' · ');
        foot.appendChild(tags);
        if (owned) {
            const apply = d.createElement('button'); apply.type = 'button'; apply.className = 'llb-apply';
            apply.textContent = '套用';
            apply.onclick = function () { _pickUnitFor(bp); };
            foot.appendChild(apply);
        } else {
            const price = d.createElement('span'); price.className = 'llb-price';
            price.innerHTML = '<i class="fa-solid fa-coins"></i>' + (bp.price || 0);
            const buyBtn = d.createElement('button'); buyBtn.type = 'button'; buyBtn.className = 'llb-buy';
            buyBtn.textContent = '購入';
            buyBtn.onclick = async function () {
                buyBtn.disabled = true;
                const BP = _BP();
                const r = await BP.buy(bp.id).catch(function () { return { ok: false, reason: 'save' }; });
                if (r && r.ok) { _toast('「' + bp.name + '」入冊了。'); _switch('book'); return; }
                buyBtn.disabled = false;
                _toast(r && r.reason === 'poor' ? ('還差 ' + r.short + ' 才買得起這張。')
                    : r && r.reason === 'have' ? '這張已經在冊子裡了。'
                    : '這次沒買成，錢沒有扣掉，再按一次就好。');
            };
            foot.appendChild(price); foot.appendChild(buyBtn);
        }
        return card;
    }
    // ✏️ 訂製卡：描述 → 燒一次副模型 → 永久入冊
    function _customCard(price) {
        const card = d.createElement('div'); card.className = 'llb-bp custom';
        card.innerHTML = ''
            + '<div class="llb-bp-name"><i class="fa-solid fa-compass-drafting"></i>訂製藍圖</div>'
            + '<div class="llb-bp-desc">描述你想要的房間，設計師畫成一張只屬於你的藍圖。</div>';
        const inp = d.createElement('input'); inp.type = 'text'; inp.maxLength = 60;
        inp.placeholder = '例如：全是貓跳台和貓窩的房間';
        card.appendChild(inp);
        const foot = d.createElement('div'); foot.className = 'llb-bp-foot';
        const pr = d.createElement('span'); pr.className = 'llb-price';
        pr.innerHTML = '<i class="fa-solid fa-coins"></i>' + price;
        const go = d.createElement('button'); go.type = 'button'; go.className = 'llb-buy';
        go.textContent = '請他畫';
        foot.appendChild(pr); foot.appendChild(go);
        card.appendChild(foot);
        const note = d.createElement('div'); note.className = 'llb-msg';
        card.appendChild(note);
        go.onclick = async function () {
            const q = String(inp.value || '').trim();
            if (!q) { inp.focus(); return; }
            go.disabled = true; inp.disabled = true;
            note.className = 'llb-msg'; note.textContent = '設計師正在畫…';
            try {
                const bp = await _BP().makeCustom(q);
                _toast('「' + bp.name + '」畫好入冊了。');
                _switch('book');
            } catch (e) {
                note.className = 'llb-msg bad';
                note.textContent = (e && e.message) || '設計師今天畫不出來，換個說法試試。';
                go.disabled = false; inp.disabled = false;
            }
        };
        return card;
    }
    // 反向：從藍圖挑要套哪一戶
    async function _pickUnitFor(bp) {
        const LL = _LL();
        if (!LL) return;
        const sh = _sheet('「' + bp.name + '」要套在哪一戶');
        const list = d.createElement('div'); list.className = 'llb-card-list';
        const msg = d.createElement('div'); msg.className = 'llb-msg';
        msg.textContent = '套上去會把那間房整間重畫，原本的布置會被蓋掉。';
        const bar = d.createElement('div'); bar.className = 'llb-card-bar';
        const closeBtn = _mini('fa-solid fa-xmark', '關上', 'quiet'); closeBtn.onclick = sh.close;
        bar.appendChild(closeBtn);
        sh.card.appendChild(list); sh.card.appendChild(msg); sh.card.appendChild(bar);

        let state;
        try { state = await LL.getState(); } catch (e) { msg.className = 'llb-msg bad'; msg.textContent = '房產資料暫時讀不到。'; return; }
        if (!sh.sheet.isConnected) return;
        if (!(state.units || []).length) { msg.textContent = '還沒有出租房。先到樓裡那根柱子加蓋一層。'; return; }
        state.units.forEach(function (u) {
            const b = _mini('fa-solid fa-door-open', _unitLabel(u) + (u.tenantName ? ' · ' + u.tenantName : ''));
            b.onclick = function () { sh.close(); _applyBlueprint(u, bp); };
            list.appendChild(b);
        });
    }

    win.OS_LANDLORD_BOOK = { open: open, close: close };
    if (win !== window) { try { window.OS_LANDLORD_BOOK = win.OS_LANDLORD_BOOK; } catch (e) {} }
    console.log('[LandlordBook] 房產手帳已載入');
})();
