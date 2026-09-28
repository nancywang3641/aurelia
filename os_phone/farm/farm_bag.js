// ============================================================
// farm_bag.js — 底部快捷列＋背包（後院、牧場共用）
// ------------------------------------------------------------
// 09-29 她：「底部導覽欄好像需要重新設計一下ui…或許可以學學星鹿谷? 不然全顯示上去會超出框，導致需要滾動條」
//          「或許還能有個倉庫? 背包?」
// 快捷列：一排固定大小的格子（照螢幕寬度決定幾格），第一格是手上拿的東西，後面是這一區用得到、而且有的東西；
//         沒有的不佔格，塞不下的收進背包——永遠不會出現捲軸。
// 背包：全部家當一格一格擺，分成工具／種子／收成／牧場；點格子下面寫名稱與數量，種子點了就選它來種。
// 圖示：種子與收成用 farm_item_draw（程式畫）、牧場產品用 ranch_draw，其他用 Font Awesome。
// ============================================================
(function () {
    'use strict';

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function fa(icon, cls) { return '<i class="fa-solid ' + icon + (cls ? ' ' + cls : '') + '"></i>'; }

    // ── 東西清單（兩頁共用）─────────────────────────
    // 每一格：{ key, name, icon(html), count, note, selected, click }
    function libs() { return { core: window.AureliaFarmCore, ranch: window.RanchCore, walk: window.FarmWalkCore, item: window.FarmItemDraw, animal: window.FarmAnimalDraw }; }

    function handSlot(state) {
        var L = libs(), w = state.walk, t = w.hand && L.walk.TOOLS[w.hand];
        if (!t) return { key: 'hand', name: '空手', icon: fa('fa-hand', 'fb-faint'), count: null, note: '工具要去放它的地方拿：水壺在後院工具棚，桶子剪刀在牧場棚屋。', hand: true };
        return {
            key: 'hand', name: '手上：' + t.name, icon: fa(t.icon), count: w.hand === 'can' ? w.can : null,
            note: w.hand === 'can' ? '還有 ' + w.can + '/' + L.walk.CAN_MAX + ' 份水，一塊田用一份，空了去池塘裝。' : '一次只拿得動一樣，拿別的它就放回原位。',
            hand: true
        };
    }
    function seedSlots(state, ctx) {
        var L = libs();
        return L.core.CROP_IDS.filter(function (id) { return state.inventory.seeds[id] > 0; }).map(function (id) {
            var c = L.core.CROPS[id];
            return {
                key: 'seed:' + id, name: c.name + '種子', icon: L.item.svg({ kind: 'seed', crop: id }), count: state.inventory.seeds[id],
                note: c.growDays + ' 次澆水成熟。' + (ctx && ctx.selectedCrop === id ? '現在種的是這個。' : '點了就改種這個。'),
                selected: !!(ctx && ctx.selectedCrop === id),
                click: ctx && ctx.pickSeed ? function () { ctx.pickSeed(id); } : null
            };
        });
    }
    function harvestSlots(state, only) {
        var L = libs();
        return L.core.CROP_IDS.filter(function (id) { return state.inventory.harvest[id] > 0 && (!only || only.indexOf(id) >= 0); }).map(function (id) {
            var c = L.core.CROPS[id];
            var fav = L.ranch && Object.keys(L.ranch.ANIMALS).filter(function (k) { return L.ranch.ANIMALS[k].fav === id; }).map(function (k) { return L.ranch.ANIMALS[k].name; });
            return {
                key: 'harvest:' + id, name: c.name, icon: L.item.svg({ kind: 'harvest', crop: id }), count: state.inventory.harvest[id],
                note: '賣 ' + c.sellPrice + 'G 一份。' + (fav && fav.length ? fav.join('、') + '最愛吃，一份切 4 份飼料。' : '')
            };
        });
    }
    function productSlots(state) {
        var L = libs(), out = [];
        if (!L.ranch || !state.ranch) return out;
        L.ranch.PRODUCT_IDS.forEach(function (p) {
            var info = L.ranch.PRODUCTS[p];
            ['good', 'normal'].forEach(function (q) {
                var n = state.ranch.products[p][q];
                if (!(n > 0)) return;
                out.push({
                    key: 'product:' + p + ':' + q, name: info.name + (q === 'good' ? '（上等）' : ''), icon: L.animal.productSvg(p, q), count: n, good: q === 'good',
                    note: '賣 ' + L.ranch.priceOf(p, q) + 'G 一' + info.unit + '。'
                });
            });
        });
        return out;
    }
    function stuffSlots(state) {
        var L = libs(), out = [], r = state.ranch;
        if ((state.inventory.fertilizer || 0) > 0) out.push({ key: 'fert', name: '肥料', icon: fa('fa-poop', 'fb-brown'), count: state.inventory.fertilizer, note: '施在有作物的田上，收成多一份。' });
        if (r && r.hay > 0) out.push({ key: 'hay', name: '乾草', icon: fa('fa-wheat-awn', 'fb-gold'), count: r.hay, note: '一捆餵一隻吃一天。' });
        if (r && r.medicine > 0) out.push({ key: 'medicine', name: '藥', icon: fa('fa-syringe', 'fb-green'), count: r.medicine, note: '替生病的動物打一針，馬上好。' });
        return out;
    }
    function toolSlots(state) {
        var L = libs(), w = state.walk, out = [];
        Object.keys(L.walk.TOOLS).forEach(function (k) {
            if (!L.walk.hasTool(state, k)) return;
            var t = L.walk.TOOLS[k], where = L.walk.SCENES[t.scene].spots[t.spot].name;
            out.push({
                key: 'tool:' + k, name: t.name, icon: fa(t.icon), count: k === 'can' ? w.can : null, selected: w.hand === k,
                note: w.hand === k ? '拿在手上。' : '放在' + where + '。'
            });
        });
        return out;
    }
    function favCrops() {
        var L = libs();
        return L.ranch ? Object.keys(L.ranch.ANIMALS).map(function (k) { return L.ranch.ANIMALS[k].fav; }) : [];
    }
    // 快捷列：後院放手上的、肥料、種子；牧場放手上的、乾草、藥、動物愛吃的、撿到的產品
    function hotbarFor(scene, state, ctx) {
        if (scene === 'ranch') return [handSlot(state)].concat(stuffSlots(state).filter(function (s) { return s.key !== 'fert'; }), harvestSlots(state, favCrops()), productSlots(state));
        return [handSlot(state)].concat(stuffSlots(state).filter(function (s) { return s.key === 'fert'; }), seedSlots(state, ctx));
    }
    function bagFor(state, ctx) {
        return [
            { title: '工具', items: toolSlots(state) },
            { title: '種子', items: seedSlots(state, ctx) },
            { title: '收成', items: harvestSlots(state) },
            { title: '牧場', items: productSlots(state).concat(stuffSlots(state)) }
        ];
    }

    // ── 畫面 ─────────────────────────────────────────
    // opts：{ app, scene, state(), ctx(), toast(text) }
    function create(opts) {
        var app = opts.app;
        var bar = document.createElement('nav');
        bar.className = 'fb-hotbar';
        bar.setAttribute('aria-label', '快捷列');
        app.appendChild(bar);
        var bag = document.createElement('div');
        bag.className = 'fb-bag-wrap';
        bag.hidden = true;
        bag.setAttribute('data-fw-modal', '');
        bag.innerHTML = '<section class="fb-bag" role="dialog" aria-label="背包"><header class="fb-bag-head"><strong>' + fa('fa-bag-shopping') + '背包</strong>' +
            '<button type="button" class="fb-bag-close" aria-label="關上背包">' + fa('fa-xmark') + '</button></header>' +
            '<div class="fb-bag-body"></div><footer class="fb-bag-foot"></footer></section>';
        app.appendChild(bag);
        var body = bag.querySelector('.fb-bag-body'), foot = bag.querySelector('.fb-bag-foot');
        var hotItems = [], bagItems = [], picked = null;

        function slotHtml(it, i, where) {
            var cls = 'fb-slot' + (it.selected ? ' is-selected' : '') + (it.hand ? ' is-hand' : '') + (it.good ? ' is-good' : '') + (picked === it.key && where === 'bag' ? ' is-picked' : '');
            return '<button type="button" class="' + cls + '" data-' + where + '="' + i + '" title="' + esc(it.name) + '" aria-label="' + esc(it.name + (it.count != null ? ' ' + it.count : '')) + '">' +
                '<span class="fb-ico">' + it.icon + '</span>' + (it.count != null ? '<b class="fb-count">' + it.count + '</b>' : '') + '</button>';
        }
        function slotCount() {
            // 一格 46px（含間距），右邊留背包鈕；最少 5 格、最多 10 格
            var w = Math.min(app.clientWidth - 24, 620);
            return Math.max(5, Math.min(10, Math.floor((w - 58) / 46)));
        }
        function renderHotbar() {
            var st = opts.state(), ctx = opts.ctx ? opts.ctx() : null;
            var all = hotbarFor(opts.scene, st, ctx);
            var n = slotCount();
            hotItems = all.slice(0, n);
            var more = all.length - hotItems.length;
            var html = hotItems.map(function (it, i) { return slotHtml(it, i, 'hot'); }).join('');
            for (var k = hotItems.length; k < n; k++) html += '<span class="fb-slot is-empty"></span>';
            html += '<button type="button" class="fb-bag-btn" aria-label="打開背包" title="背包">' + fa('fa-bag-shopping') + (more > 0 ? '<b class="fb-more">+' + more + '</b>' : '') + '</button>';
            bar.innerHTML = html;
        }
        function renderBag() {
            var st = opts.state(), ctx = opts.ctx ? opts.ctx() : null;
            var secs = bagFor(st, ctx);
            bagItems = [];
            var any = false;
            body.innerHTML = secs.map(function (s) {
                if (!s.items.length) return '';
                any = true;
                return '<div class="fb-sec"><h4>' + esc(s.title) + '</h4><div class="fb-grid">' + s.items.map(function (it) {
                    bagItems.push(it);
                    return slotHtml(it, bagItems.length - 1, 'bag');
                }).join('') + '</div></div>';
            }).join('') || '';
            if (!any) body.innerHTML = '<p class="fb-empty">背包是空的。去商店買種子，或到牧場撿東西。</p>';
            var cur = bagItems.find(function (it) { return it.key === picked; });
            foot.innerHTML = cur ? '<strong>' + esc(cur.name) + (cur.count != null ? ' × ' + cur.count : '') + '</strong><span>' + esc(cur.note || '') + '</span>'
                : '<span>點一格看是什麼。</span>';
        }
        function open() { bag.hidden = false; picked = null; renderBag(); }
        function close() { bag.hidden = true; }

        bar.addEventListener('click', function (e) {
            e.stopPropagation();
            if (e.target.closest('.fb-bag-btn')) { open(); return; }
            var b = e.target.closest('[data-hot]');
            if (!b) return;
            var it = hotItems[Number(b.getAttribute('data-hot'))];
            if (!it) return;
            if (it.click) it.click();
            else if (opts.toast) opts.toast(it.name + (it.count != null && !it.hand ? ' × ' + it.count : '') + '。' + (it.note || ''));
        });
        bag.addEventListener('click', function (e) {
            e.stopPropagation();
            if (e.target === bag || e.target.closest('.fb-bag-close')) { close(); return; }
            var b = e.target.closest('[data-bag]');
            if (!b) return;
            var it = bagItems[Number(b.getAttribute('data-bag'))];
            if (!it) return;
            picked = it.key;
            if (it.click) it.click();
            renderBag();
        });
        function onKey(e) {
            if (e.key === 'Escape' && !bag.hidden) { close(); e.preventDefault(); }
            else if ((e.key === 'b' || e.key === 'B' || e.key === 'i' || e.key === 'I') && !/input|textarea|select/i.test((document.activeElement || {}).tagName || '')) {
                // 看板、結算單開著時不開背包（會被壓在它們下面）
                if (bag.hidden && document.querySelector('[data-fw-modal]:not([hidden])')) return;
                if (bag.hidden) open(); else close();
            }
        }
        window.addEventListener('keydown', onKey);
        window.addEventListener('resize', renderHotbar);

        return {
            render: function () { renderHotbar(); if (!bag.hidden) renderBag(); },
            open: open, close: close,
            isOpen: function () { return !bag.hidden; },
            destroy: function () { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', renderHotbar); }
        };
    }

    window.FarmBag = { create: create, hotbarFor: hotbarFor, bagFor: bagFor };
})();
