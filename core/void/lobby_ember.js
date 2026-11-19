// ----------------------------------------------------------------
// [檔案] core/void/lobby_ember.js
// 職責：🫧 大廳的小人接上隔壁衣櫥（小火苗衣櫥）「活的」那套：站著呼吸、眨眼，坐在書咖的椅子上呼吸，點了東西的會喝一口／吃一口，吃完有反應。
//   11-19 她：「隔壁小人專案給你做了一大堆動作和表情，你一個都沒裝上是不是有點莫名其妙了?」→ 衣櫥那邊寫了入口 ember-runtime.js，
//   直接載入衣櫥的檔（不拍照、不複製），衣櫥之後補的衣服、動作、表情這邊自動跟著有。接法說明在衣櫥資料夾的「給奧瑞亞-衣櫥搬家清單-1119.md」。
//   🚨 衣櫥資料夾要跟奧瑞亞同一個網域：她的酒館是 D:\SillyTavern\public\ember-wardrobe（junction 指到衣櫥資料夾）→ /ember-wardrobe/。
//     拿不到（網頁版 PWA、朋友的酒館）就什麼都不做，大廳照舊用拍好的走路圖。
//   做法：舞台上的人照舊是那張走路圖（走路、點他、景深都照舊）。停下來、坐下時，在同一個位置疊一層衣櫥畫的 <svg>、把底下那張變透明；
//     走起來就收掉這層（衣櫥的走路她還沒說可以，先用拍好的）。
//   對位：拍走路圖時是「身體中心在格子正中、腳底在格底、一單位＝1.2px」，坐姿是「身體中心在正中、屁股在 96.65% 那條線」——
//     這裡照同一套量衣櫥畫出來的身體，算出 viewBox，疊上去跟原本那張同一個位置、同一個大小。
//   衣櫥畫的格子裡有自己的桌子、椅子、地上的影子：大廳有自己的桌椅，這幾樣拿掉（同 tmp/doll_bake/bake.cjs 的做法）。
//   一個角色一個藏起來的 iframe（衣櫥的限制）；第一次做角色包約 20 秒，之後存在 IndexedDB（ember-runtime）0.2 秒。
// 依賴：window.LobbyStage（_b、_S）；呼叫端：lobby_cafe_regulars.js（常客）、lobby_npcs.js（雇來的員工）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    // 衣櫥資料夾掛在哪：原版酒館＝public\ember-wardrobe（/ember-wardrobe/）；TauriTavern 只認擴展資料夾，
    //   掛在 data\default-user\extensions\ember-wardrobe（/scripts/extensions/third-party/ember-wardrobe/）。11-19 她用 TauriTavern，店員一直是舊圖才發現
    const BASES = ['/ember-wardrobe/', '/scripts/extensions/third-party/ember-wardrobe/'];
    let BASE = BASES[0];
    const FPS = 10;
    const PX = 1.2;                     // 拍走路圖時衣櫥一單位畫成幾 px（tmp/doll_bake/bake.cjs 的 PX）
    const CELL_W = 423 / PX;            // 走路圖一格（cafe_dolls_v1 的 pack.json：cell 423×487）換回衣櫥單位
    const SIT_W = 444 / PX, SIT_HIP = 0.9665 * 448 / PX;   // 坐姿圖（sit 444×448、屁股在 hipAt 那條線）
    const STRIP = '[data-mochi="shadow"],[data-mochi="chair"],[data-mochi="table"],[data-mochi="table-near"],[data-mochi="table-shadow"]';
    const KEEP_CHARS = 10;              // 最多留幾個角色（一個一個 iframe）；多了把最久沒用的收掉

    let _rtP = null;
    // 拿得到衣櫥嗎：HEAD 一下入口檔（要真的是 JS，網頁版的站可能把沒有的路徑回成首頁），載入、啟動。拿不到回 null，之後不再試
    function runtime() {
        if (_rtP) return _rtP;
        _rtP = (async () => {
            try {
                // 一個一個試（用 GET：TauriTavern 那種自訂協定不一定吃 HEAD）；要真的是 JS，網頁版的站可能把沒有的路徑回成首頁
                let found = null;
                for (const b of BASES) {
                    try {
                        const r = await fetch(b + 'ember-runtime.js', { cache: 'no-store' });
                        if (r.ok && /EmberRuntime/.test(await r.text())) { found = b; break; }
                    } catch (e) {}
                }
                if (!found) return null;
                BASE = found;
                if (!window.EmberRuntime) {
                    await new Promise((ok, no) => { const s = document.createElement('script'); s.src = BASE + 'ember-runtime.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
                }
                if (!window.EmberRuntime) return null;
                return await window.EmberRuntime.start({ base: BASE });
            } catch (e) { console.warn('[LobbyEmber] 衣櫥接不上，大廳照舊用拍好的圖', e); return null; }
        })();
        return _rtP;
    }

    // ---------- 角色：照長相 id 做一次就留著；一次只做一個（衣櫥本體同時只能點一套） ----------
    const _chars = new Map();   // id → { p: Promise<{c, geo}>, used }
    let _queue = Promise.resolve();
    function charOf(id) {
        let h = _chars.get(id);
        if (h) { h.used = Date.now(); return h.p; }
        h = { used: Date.now(), p: null };
        h.p = _queue = _queue.then(async () => {
            const rt = await runtime();
            if (!rt) return null;
            const c = await rt.character(id);
            return { c, geo: _measure(c) };
        }).catch(e => { console.warn('[LobbyEmber] 角色沒做成', id, e); _chars.delete(id); return null; });
        _chars.set(id, h);
        _trim();
        return h.p;
    }
    function _trim() {
        if (_chars.size <= KEEP_CHARS) return;
        const inUse = new Set([..._binds].map(b => b.id));
        const old = [..._chars.entries()].filter(([id]) => !inUse.has(id)).sort((a, b) => a[1].used - b[1].used);
        while (_chars.size > KEEP_CHARS && old.length) {
            const [id, h] = old.shift();
            _chars.delete(id);
            h.p.then(v => { try { v && v.c.dispose(); } catch (e) {} });
        }
    }

    // ---------- 量：身體中心、腳底、屁股（拿掉桌椅影子之後） ----------
    function _probeSvg() {
        const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        sv.setAttribute('viewBox', '-400 -400 1200 1300');
        sv.setAttribute('width', '1200'); sv.setAttribute('height', '1300');
        sv.style.cssText = 'position:fixed;left:-13000px;top:0;visibility:hidden;pointer-events:none';
        document.body.appendChild(sv);
        return sv;
    }
    function _fill(g, inner) {
        g.innerHTML = inner;
        g.querySelectorAll(STRIP).forEach(e => e.remove());
    }
    function _measure(c) {
        const sv = _probeSvg();
        const one = (o) => {
            _fill(sv, c.inner(Object.assign({ t: 0, blink: 0 }, o)));
            const all = sv.getBBox();
            const sr = sv.getBoundingClientRect(), b = sv.querySelector('[data-mochi="body"]');
            const br = b ? b.getBoundingClientRect() : null;
            const body = br ? { cx: br.left - sr.left - 400 + br.width / 2, y1: br.bottom - sr.top - 400 } : { cx: all.x + all.width / 2, y1: all.y + all.height };
            return { bottom: all.y + all.height, body };
        };
        try {
            const f = one({ motion: 'idle', view: 'front' }), s = one({ motion: 'idle', view: 'side' }), k = one({ motion: 'idle', view: 'back' });
            const seat = one({ motion: 'sitTable', view: 'side' });
            return {
                ground: Math.max(f.bottom, s.bottom, k.bottom) + 2,   // 拍走路圖時格底＝腳底再多 2 單位
                cx: { front: f.body.cx, side: s.body.cx, back: k.body.cx },
                seat: { cx: seat.body.cx, hip: seat.body.y1 },
            };
        } finally { sv.remove(); }
    }

    // ---------- 吃什麼、吃完什麼反應（照書咖紀錄那一句；不叫模型） ----------
    function _eatOf(item) {
        const s = String(item || '');
        if (!s) return null;
        if (/咖啡|拿鐵|卡布|摩卡|美式|濃縮|茶|飲|奶昔|可可|果汁|汽水|蘇打|檸檬|牛奶|豆漿|酒|水$|冰沙|氣泡/.test(s)) return 'sip';
        if (/可頌|麵包|吐司|三明治|貝果|司康|甜甜圈|餅乾|瑪芬|鬆餅|捲|派皮|馬卡龍|熱狗|漢堡|酥/.test(s)) return 'snackBite';
        if (/布丁|聖代|湯|粥|優格|奶酪|慕斯杯|冰淇淋|芭菲/.test(s)) return 'biteSpoon';
        return 'biteFork';
    }
    function _reactOf(line, seed) {
        const s = String(line || '');
        if (/太甜|好甜|甜過頭|甜膩/.test(s)) return '太甜';
        if (/太酸|好酸/.test(s)) return '太酸';
        if (/太燙|好燙|燙/.test(s)) return '太燙';
        if (/太濃|好濃/.test(s)) return '太濃';
        if (/難吃|難喝|噁|受不了/.test(s)) return '受不了';
        if (/普通|還行|一般|還可以|馬馬虎虎/.test(s)) return '普通';
        if (/奇怪|怪怪|微妙/.test(s)) return '怪但喜歡';
        return (seed % 5 === 0) ? '普通' : '好吃';
    }
    function _hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }

    // ---------- 疊在舞台上的人 ----------
    //   n＝舞台上的他（lobby_stage 的 addNpc 回來那個）；id＝衣櫥長相（常客 look、店員 staff-female／staff-male）
    //   opts.entry()＝他現在點了什麼（{ item, line }），有就會吃；opts.box＝'cell'（走路圖那格，常客）或 'img'（單張圖的人，員工）
    const _binds = new Set();
    let _timer = null;
    function bind(n, id, opts) {
        if (!n || !id) return null;
        const b = { n, id, opts: opts || {}, ready: null, el: null, on: false, mode: '', t0: 0, act: null, nextEat: 0, clock: Math.random() * 7 };
        n._ember = b;
        _binds.add(b);
        charOf(id).then(v => { if (_binds.has(b)) b.ready = v; });
        if (!_timer) _timer = setInterval(_tick, Math.round(1000 / FPS));
        return b;
    }
    function unbind(b) {
        if (!b) return;
        _binds.delete(b);
        _show(b, false);
        if (b.el) { try { b.el.remove(); } catch (e) {} b.el = null; }
        if (b.n && b.n._ember === b) b.n._ember = null;
        if (!_binds.size && _timer) { clearInterval(_timer); _timer = null; }
    }
    // 疊上去／收掉：底下那張變透明（不藏起來，點他照舊點得到）
    function _show(b, on) {
        if (b.on === on) return;
        b.on = on;
        if (b.el) b.el.style.display = on ? '' : 'none';
        try { b.n.el.style.opacity = on ? '0' : ''; } catch (e) {}
    }
    function _layer(b, world) {
        if (b.el && b.el.parentNode === world) return b.el;
        if (b.el) { try { b.el.remove(); } catch (e) {} }
        const el = document.createElement('div');
        el.className = 'lember';
        el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;display:none;will-change:transform';
        el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style="display:block;width:100%;height:100%;overflow:visible"></svg>';
        world.appendChild(el);
        b.el = el; b.on = false;
        return el;
    }

    function _tick() {
        const LS = window.LobbyStage, S = LS && LS._S;
        if (document.hidden) return;
        const now = performance.now() / 1000;
        for (const b of [..._binds]) {
            const n = b.n;
            if (!S || !S.active || S.npcs.indexOf(n) < 0 || !n.el || !n.el.isConnected) { unbind(b); continue; }
            if (!b.ready) continue;
            const moving = !!(n.walking || n.dest || n._sitting || n._leaving);
            const seat = n._seat || null;
            if (moving) { _show(b, false); b.mode = ''; continue; }
            try { _draw(b, S, seat, now); } catch (e) { console.warn('[LobbyEmber] 畫不出來，這位改回拍好的圖', b.id, e); unbind(b); }
        }
    }

    function _draw(b, S, seat, now) {
        const n = b.n, c = b.ready.c, G = b.ready.geo;
        // 他在舞台上那一格的位置大小（同 lobby_stage 的 placeSheetActor／placeActor）
        let w, h = n.h;
        if (b.opts.box === 'img') w = h * 423 / 487;   // 單張圖的人：當成走路圖那一格的比例
        else if (n.frameW && n.frameH) w = h * n.frameW / n.frameH;
        else return;
        const left = n.x - w / 2, top = n.y - h;
        const el = _layer(b, S.world);
        // 現在演什麼
        const mode = seat ? 'seat' : 'stand';
        if (b.mode !== mode) { b.mode = mode; b.t0 = now; b.act = null; b.nextEat = now + 4 + Math.random() * 10; }
        let view = 'front', mirror = false, motion = seat ? 'sitTable' : 'idle', react = null, t = now - b.t0;
        if (seat) {
            view = 'side'; mirror = !!seat.right;   // 衣櫥的側面臉朝左；椅子朝右坐的要翻過來
            const e = b.opts.entry ? b.opts.entry() : null;
            if (b.act) {
                const len = c.length({ motion: b.act.motion, view, react: b.act.react });
                if (now - b.act.t0 >= len) { b.act = null; b.t0 = now; b.nextEat = now + 18 + Math.random() * 25; }
            } else if (e && e.item && now >= b.nextEat) {
                const m = _eatOf(e.item);
                if (m) b.act = { motion: m, react: _reactOf(e.line, _hash(n.key + ':' + Math.floor(now / 60))), t0: now };
                else b.nextEat = now + 30;
            }
            if (b.act) { motion = b.act.motion; react = b.act.react; t = now - b.act.t0; }
        } else {
            const d = n.dir || 0;
            view = d === 3 ? 'back' : (d === 1 || d === 2) ? 'side' : 'front';
            mirror = d === 2;
        }
        // viewBox：常客照拍走路圖那套對位；坐著照坐姿圖那套；員工（單張圖）照走路圖那格
        let vb;
        if (seat) {
            const vw = SIT_W, vh = vw * h / w;
            vb = [G.seat.cx - vw / 2, G.seat.hip - SIT_HIP, vw, vh];
        } else {
            const vw = CELL_W, vh = vw * h / w;
            vb = [G.cx[view] - vw / 2, G.ground - vh, vw, vh];
        }
        const sv = el.firstChild;
        sv.setAttribute('viewBox', vb.map(v => v.toFixed(2)).join(' '));
        _fill(sv, c.inner({ motion, view, t, react, clock: now + b.clock }));
        const tf = 'translate3d(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px,0)' + (mirror ? ' scaleX(-1)' : '');
        if (b._tf !== tf) { el.style.transform = tf; b._tf = tf; }
        const ws = w.toFixed(1) + 'px', hs = h.toFixed(1) + 'px';
        if (el.style.width !== ws) el.style.width = ws;
        if (el.style.height !== hs) el.style.height = hs;
        const z = n.el.style.zIndex || '';
        if (el.style.zIndex !== z) el.style.zIndex = z;
        _show(b, true);
    }

    window.LobbyEmber = {
        runtime,                    // → Promise<EmberRuntime 或 null（拿不到衣櫥）>
        bind, unbind,
        _binds: () => _binds,       // console 診斷用
        _eatOf, _reactOf,
    };
})();
