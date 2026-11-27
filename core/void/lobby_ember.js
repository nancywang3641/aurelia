// ----------------------------------------------------------------
// [檔案] core/void/lobby_ember.js
// 職責：🫧 大廳小人接上隔壁衣櫥（小火苗衣櫥）「活的」那套：站著呼吸、眨眼，坐在書咖的椅子上呼吸，點了東西的會喝一口／吃一口，吃完有反應。
//   11-19：隔壁小人專案（衣櫥）做好的動作和表情要接上 → 衣櫥那邊寫了入口 ember-runtime.js，
//   直接載入衣櫥的檔（不拍照、不複製），衣櫥之後補的衣服、動作、表情這邊自動跟著有。接法說明在衣櫥資料夾的「給奧瑞亞-衣櫥搬家清單-1119.md」。
//   🚨 衣櫥資料夾要跟奧瑞亞同一個網域：本機酒館是 public 底下的 ember-wardrobe（junction 指到衣櫥資料夾）→ /ember-wardrobe/。
//     拿不到（網頁版 PWA、朋友的酒館）就什麼都不做，大廳照舊用拍好的走路圖。
//   做法：舞台上的人照舊是那張走路圖（走路、點他、景深都照舊）。停下來、坐下時，在同一個位置疊一層衣櫥畫的 <svg>、把底下那張變透明；
//     走起來就收掉這層（衣櫥的走路還沒確認，先用拍好的）。
//   對位：拍走路圖時是「身體中心在格子正中、腳底在格底、一單位＝1.2px」，坐姿是「身體中心在正中、屁股在 96.65% 那條線」——
//     這裡照同一套量衣櫥畫出來的身體，算出 viewBox，疊上去跟原本那張同一個位置、同一個大小。
//   衣櫥畫的格子裡有自己的桌子、椅子、地上的影子：大廳有自己的桌椅，這幾樣拿掉（同 tmp/doll_bake/bake.cjs 的做法）。
//   一個角色一個藏起來的 iframe（衣櫥的限制）；第一次做角色包約 20 秒，之後存在 IndexedDB（ember-runtime）0.2 秒。
//   11-19 點餐送餐整套接：送餐的店員（n._emberWalk）走路也畫衣櫥的（walk、端盤走 trayWalk／tray），停下來照 n._emberPose（記點餐 writing、端盤 tray）；
//     常客 opts.served() 送到了才吃，杯盤在吃的空檔留在桌上（從吃那一口的頭尾那格拿下來），吃 BITES 口就吃完。流程在 lobby_cafe_regulars.js。
// 依賴：window.LobbyStage（_b、_S）；呼叫端：lobby_cafe_regulars.js（常客）、lobby_npcs.js（雇來的員工）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    // 衣櫥資料夾掛在哪：原版酒館＝public\ember-wardrobe（/ember-wardrobe/）；TauriTavern 只認擴展資料夾，
    //   掛在 data\default-user\extensions\ember-wardrobe（/scripts/extensions/third-party/ember-wardrobe/）。11-19 在 TauriTavern 上店員一直是舊圖才發現
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
            let c;
            if (_isMix(id)) {   // 路過的客人：拿現成常客的包拼（不叫衣櫥重做）
                const pack = await _mixPack(rt, id);
                if (!pack) return null;
                c = await rt.character({ id, skin: _parseMix(id).skin }, { pack });
            } else c = await rt.character(id);
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

    // ---------- 🚶 路過的客人：頭髮、衣服、膚色隨機拼（11-23 加：路過的新客人，每次造型不一樣） ----------
    //   衣櫥做一個新的「頭髮＋衣服」組合要 18 秒、其中畫面凍住 11 秒多（實測，最長一次 5.3 秒），玩到一半不能這樣做。
    //   但衣櫥替常客做好的「角色包」裡，衣服只是一小段「上衣／下身／鞋／配件」的名字（pack.outfit），頭髮、臉是另外幾塊：
    //   拿 A 常客的包、把 outfit 換成 B 常客那套衣服的名字（衣櫥 MOCHI_CLOTHES.sets），交給入口 rt.character(spec, { pack }) 就是一個新的人，
    //   0.2 秒、不卡。膚色是入口的 skin（照色票重新上色，不用重做包）。
    //   只拼「已經做好包」的常客頭（衣櫥自己的快取 IndexedDB ember-runtime，唯讀看一眼；沒有這個資料庫就不拼，免得先建出一個空的害衣櫥存不進去）。
    //   頭和衣服挑同一種（男配男、女配女），頭跟衣服不是同一位（那就是那位常客本人了）。三面都齊的頭髮只有常客那 18 頂：LoRA 那批沒有背面，轉身會光頭，不拿。
    //   長相 id 寫成 'mix:頭|衣服|膚色'（大廳、書咖都拿它當鑰匙）。
    const MIX_SKINS = ['cream', 'peach', 'apricot', 'wheat', 'caramel', 'maple', 'cocoa', 'espresso', 'porcelain', 'ivory', 'linen', 'sand', 'olive', 'taupe', 'chestnut', 'walnut', 'umber'];
    const _isMix = (id) => typeof id === 'string' && id.indexOf('mix:') === 0;
    function _parseMix(id) { const a = String(id).slice(4).split('|'); return { head: a[0], outfit: a[1], skin: a[2] || null }; }
    const _female = (id) => /-(woman|girl)$/.test(id);
    let _packsAt = 0, _packsP = null;
    // 現在衣櫥快取裡有哪幾位常客的包（一分鐘看一次）：常客 id → 包
    function _packs(rt) {
        if (_packsP && Date.now() - _packsAt < 60000) return _packsP;
        _packsAt = Date.now();
        _packsP = (async () => {
            const out = new Map();
            try {
                if (!indexedDB.databases) return out;
                const list = await indexedDB.databases();
                if (!list.some(d => d && d.name === 'ember-runtime')) return out;
                const db = await new Promise((ok, no) => { const r = indexedDB.open('ember-runtime'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
                try {
                    if (!db.objectStoreNames.contains('packs')) return out;
                    const rows = await new Promise((ok) => {
                        const got = [], tx = db.transaction('packs'), cur = tx.objectStore('packs').openCursor();
                        cur.onsuccess = () => { const c = cur.result; if (!c) return ok(got); got.push([c.key, c.value]); c.continue(); };
                        cur.onerror = () => ok(got);
                    });
                    const guests = rt.cast().filter(g => g.kind === 'guest');
                    for (const [k, v] of rows) {
                        if (!v || !v.pack || (rt.stamp && v.stamp !== rt.stamp)) continue;   // 衣櫥改過檔＝舊包作廢（同入口自己的規則）
                        let key; try { key = JSON.parse(k); } catch (e) { continue; }
                        const g = guests.find(g => key[0] === g.hair && key[1] === g.sideHair && key[2] === g.outfit && !key[3]);
                        if (g) out.set(g.id, v.pack);
                    }
                } finally { db.close(); }
            } catch (e) { console.warn('[LobbyEmber] 看衣櫥的角色包失敗（不拼路人）', e); }
            return out;
        })();
        return _packsP;
    }
    function _outfitOf(rt, id) {
        const s = rt.probe && rt.probe.W && rt.probe.W.MOCHI_CLOTHES && rt.probe.W.MOCHI_CLOTHES.sets[id];
        return s ? { top: s.top, bottom: s.bottom, shoes: s.shoes, acc: (s.acc || []).slice(), colors: { top: null, bottom: null, shoes: null } } : null;
    }
    async function _mixPack(rt, id) {
        const m = _parseMix(id), packs = await _packs(rt), head = packs.get(m.head), outfit = _outfitOf(rt, m.outfit);
        return head && outfit ? Object.assign({}, head, { outfit }) : null;
    }
    // 隨機一個路人的長相；衣櫥接不上、做好的常客包不到兩位 → null（今天不來路人）
    async function mixLook() {
        const rt = await runtime();
        if (!rt) return null;
        const packs = await _packs(rt);
        const heads = [...packs.keys()];
        if (heads.length < 2) return null;
        const pick = (a) => a[Math.floor(Math.random() * a.length)];
        const head = pick(heads);
        const outfits = rt.cast().filter(g => g.kind === 'guest' && g.id !== head && _female(g.id) === _female(head) && _outfitOf(rt, g.id)).map(g => g.id);
        if (!outfits.length) return null;
        return 'mix:' + head + '|' + pick(outfits) + '|' + pick(MIX_SKINS);
    }

    // 路人進門前先把衣櫥那個人做好（拼包 0.2 秒），進來第一格就是衣櫥畫的；做不成回 false＝不進來
    //   🚨 11-23：小人一律跟衣櫥，不准自己另做一套——路人走路、坐下、離開全程交給衣櫥畫（跟店員同一條：n._emberWalk），
    //   不另外烤走路圖。舞台底下墊的那張（點他、量大小用）借衣服那位常客拍好的圖，衣櫥那層蓋在上面、底下那張透明。
    const prepare = (look) => charOf(look).then(v => !!v, () => false);

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
        // 蓋著的時候每次都確認底下那張是透明的：站起來、換坐姿圖時舞台會換圖，把透明重設掉（11-23 路人離開時露出借來的頭髮）
        if (b.on === on) { if (on) { try { if (b.n.el.style.opacity !== '0') b.n.el.style.opacity = '0'; } catch (e) {} } return; }
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
        // 舞台被蓋住（劇情、app 開著）就不畫：大廳本身那支 tick 早就會睡，這層以前照樣一秒重畫 10 次整個 SVG，
        //   11-25 連進酒館量：在劇情裡時這層 5 秒吃 1.2 秒，還一直把畫面弄髒，害劇情的眨眼一量位置就整頁重算。
        //   蓋住時人停在原地，掀開下一格接著畫
        try { if (LS && LS._b && LS._b.stageHidden && LS._b.stageHidden()) return; } catch (e) {}
        const now = performance.now() / 1000;
        for (const b of [..._binds]) {
            const n = b.n;
            if (!S || !S.active || S.npcs.indexOf(n) < 0 || !n.el || !n.el.isConnected) { unbind(b); continue; }
            if (!b.ready) continue;
            // _route：送餐的店員還有下一段路（轉角那一下別變回站著）；被小劇場凍住的不算在走（不然原地踏步）
            const walking = !n._theaterFrozen && !!(n.walking || n.dest || (n._route && n._route.length));
            const moving = !!(walking || n._sitting || n._leaving);
            const seat = n._seat || null;
            // 送餐的店員（n._emberWalk，lobby_cafe_regulars.js 的送餐那段開）走路也用衣櫥畫；其他人走路照舊用拍好的走路圖
            // 路人（opts.walker）：坐下、離開時也照衣櫥畫（底下那張是借來的圖，頭髮不對，不能露出來）
            if (moving && !(n._emberWalk && (b.opts.walker || (!n._sitting && !n._leaving)))) { _show(b, false); b.mode = ''; continue; }
            try { _draw(b, S, seat, now, walking); } catch (e) { console.warn('[LobbyEmber] 畫不出來，這位改回拍好的圖', b.id, e); unbind(b); }
        }
    }
    // 走路的人每一幀跟著挪（衣櫥那層一秒只重畫 10 次，位置不跟會一頓一頓的）
    let _rafOn = false;
    function _follow() {
        _rafOn = false;
        let any = false;
        for (const b of _binds) {
            if (!b.walkOn || !b.el || !b.on) continue;
            any = true;
            _place(b);
        }
        if (any) { _rafOn = true; requestAnimationFrame(_follow); }
    }
    function _place(b) {
        const n = b.n, w = b.w, h = b.h;
        const tf = 'translate3d(' + (n.x - w / 2).toFixed(1) + 'px,' + (n.y - h).toFixed(1) + 'px,0)' + (b.mirror ? ' scaleX(-1)' : '');
        if (b._tf !== tf) { b.el.style.transform = tf; b._tf = tf; }
        const z = n.el.style.zIndex || '';
        if (b.el.style.zIndex !== z) b.el.style.zIndex = z;
    }

    // ---------- 桌上的餐點：吃的空檔也留在桌上（衣櫥只在吃那一口的動作裡畫杯盤，這裡從那個動作的頭／尾那格拿下來放進坐著那格） ----------
    const ITEM_SEL = '[data-mochi="saucer"],[data-mochi="cup-down"],[data-mochi="plate"],[data-mochi="snack-plate"],[data-mochi="snack-down"]';
    const BITES = 6;                    // 吃幾口就吃完（之後只剩空盤子／杯子、不再吃）
    function _itemsOf(ready, motion, state) {
        const k = motion + '|' + state;
        ready.items = ready.items || {};
        if (ready.items[k] != null) return ready.items[k];
        // 蛋糕、布丁吃完：衣櫥沒有空的蛋糕盤，用可頌那個空盤子（同一個位置、同一把尺）；不然吃完還剩一大塊，看起來像卡住（11-19）
        if (state === 'done' && (motion === 'biteFork' || motion === 'biteSpoon')) return (ready.items[k] = _itemsOf(ready, 'snackBite', 'done'));
        const c = ready.c, len = c.length({ motion, view: 'side' });
        const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        sv.innerHTML = c.inner({ motion, view: 'side', t: state === 'whole' ? 0 : len - 0.01, blink: 0 });
        const out = {};
        sv.querySelectorAll(ITEM_SEL).forEach(e => {
            if (e.parentElement && e.parentElement.closest && e.parentElement.closest(ITEM_SEL)) return;
            const tag = e.getAttribute('data-mochi');
            if (state === 'done' && tag === 'snack-down') return;   // 可頌吃完：只剩空盤子
            out[tag] = (out[tag] || '') + e.outerHTML;
        });
        return (ready.items[k] = out);
    }

    function _draw(b, S, seat, now, walking) {
        const n = b.n, c = b.ready.c, G = b.ready.geo;
        // 他在舞台上那一格的位置大小（同 lobby_stage 的 placeSheetActor／placeActor）
        let w, h = n.h;
        if (b.opts.box === 'img') w = h * 423 / 487;   // 單張圖的人：當成走路圖那一格的比例
        else if (n.frameW && n.frameH) w = h * n.frameW / n.frameH;
        else return;
        const left = n.x - w / 2, top = n.y - h;
        const el = _layer(b, S.world);
        // 現在演什麼
        let view = 'front', mirror = false, motion = seat ? 'sitTable' : 'idle', react = null;
        let items = null, eatKind = null;
        if (!seat && n._emberWalk) {
            // 送餐的店員：走路照這一格往哪挪換面；端著盤子走＝側面「送餐走路」、上下走＝端盤（衣櫥的送餐走路只有側面）；停下來照送餐那段給的姿勢
            const dx = n.x - (b.px == null ? n.x : b.px), dy = n.y - (b.py == null ? n.y : b.py);
            b.px = n.x; b.py = n.y;
            if (walking && Math.abs(dx) + Math.abs(dy) > 0.01) b.dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 1 : 2) : (dy < 0 ? 3 : 0);
            const P = !walking && n._emberPose;
            if (P) { motion = P.motion; view = P.view || 'front'; mirror = !!P.mirror; }
            else {
                const d = walking ? (b.dir || 0) : 0;
                view = d === 3 ? 'back' : (d === 1 || d === 2) ? 'side' : 'front';
                mirror = d === 2;
                motion = walking ? (n._tray ? (view === 'side' ? 'trayWalk' : 'tray') : 'walk') : (n._tray ? 'tray' : 'idle');
            }
        }
        const mode = seat ? 'seat' : (walking ? 'walk:' : 'stand:') + motion + view;
        if (b.mode !== mode) { b.mode = mode; b.t0 = now; b.act = null; b.nextEat = now + 4 + Math.random() * 10; }
        let t = now - b.t0;
        if (seat) {
            view = 'side'; mirror = !!seat.right;   // 衣櫥的側面臉朝左；椅子朝右坐的要翻過來
            const e = b.opts.entry ? b.opts.entry() : null;
            // 送來了才吃（opts.served 沒給＝一坐下就有）；剛送到的過幾秒吃第一口
            const served = !b.opts.served || b.opts.served();
            if (served && !b.wasServed) { b.wasServed = true; b.nextEat = now + 2 + Math.random() * 3; }
            eatKind = served && e && e.item ? _eatOf(e.item) : null;
            if (b.act) {
                const len = c.length({ motion: b.act.motion, view, react: b.act.react });
                if (now - b.act.t0 >= len) { b.act = null; b.t0 = now; b.bites = (b.bites || 0) + 1; b.nextEat = now + 7 + Math.random() * 8; }   // 兩口之間 7～15 秒（以前 18～43 秒，看起來像吃一口就不動了）
            } else if (eatKind && now >= b.nextEat && (b.bites || 0) < BITES) {
                b.act = { motion: eatKind, react: _reactOf(e.line, _hash(n.key + ':' + Math.floor(now / 60))), t0: now };
            }
            if (b.act) { motion = b.act.motion; react = b.act.react; t = now - b.act.t0; }
            if (eatKind) {
                const bites = b.bites || 0;
                items = b.act ? (bites ? _itemsOf(b.ready, eatKind, 'bitten') : null)   // 吃的那一口：衣櫥自己畫杯盤；咬過的別在下一口開頭又變回完整的
                    : _itemsOf(b.ready, eatKind, bites >= BITES ? 'done' : bites ? 'bitten' : 'whole');
            }
        } else if (!n._emberWalk) {
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
        if (items) {
            if (b.act) {   // 吃的那一口裡：盤子／可頌換成咬過的
                sv.querySelectorAll('[data-mochi="plate"],[data-mochi="snack-down"]').forEach(x => { const r = items[x.getAttribute('data-mochi')]; if (r) x.outerHTML = r; });
            } else {       // 坐著的空檔：杯盤放在桌上、手底下
                const html = Object.values(items).join('');
                const fist = sv.querySelector('[data-mochi^="fist"]');
                if (html) { if (fist) fist.insertAdjacentHTML('beforebegin', html); else sv.insertAdjacentHTML('beforeend', html); }
            }
        }
        b.w = w; b.h = h; b.mirror = mirror;
        _place(b);
        const ws = w.toFixed(1) + 'px', hs = h.toFixed(1) + 'px';
        if (el.style.width !== ws) el.style.width = ws;
        if (el.style.height !== hs) el.style.height = hs;
        _show(b, true);
        b.walkOn = !!walking;
        if (walking && !_rafOn) { _rafOn = true; requestAnimationFrame(_follow); }
    }

    window.LobbyEmber = {
        runtime,                    // → Promise<EmberRuntime 或 null（拿不到衣櫥）>
        bind, unbind,
        mixLook, prepare,           // 🚶 路過的客人：隨機長相、進門前先把衣櫥那個人做好（lobby_cafe_regulars.js 用）
        _binds: () => _binds,       // console 診斷用
        _eatOf, _reactOf,
    };
})();
