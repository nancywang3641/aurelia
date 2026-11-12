// ----------------------------------------------------------------
// [檔案] os_cafe_kitchen.js
// 路徑：os_phone/os/os_cafe_kitchen.js
// 職責：🍳 書咖後廚（11-12 夜重做，取代原本那頁研發台）。
//   書咖「研發」頁按「進後廚」→ 開一個全螢幕的後廚窗口：鐵桌＋背景，六個檯子（漢堡、咖啡、手搖杯、便當、披薩、蛋糕）。
//   整盤用程式照 45 度俯視現畫（canvas），不貼圖；什麼料都能放到任何一檯（料盤上面那排可以切到別檯的料）。
//   按「完成」＝試做一份：扣料錢（同一盤試過不再扣）→ 三位試吃員照規則講味道、口感、賣相（不花 AI 錢、同一盤永遠同一個結果）
//   → 靈感之作／優良可以上架。披薩要先買烤箱，「送進烤箱」烤到綠色那段拿出來。
//   做好的那一盤存成一張去背圖＝菜單封面（app_data book_cafe 的 dimg_<菜單id>；不塞進 menu，菜單一天被讀很多次）；之後端盤子也用這張（dishImg）。
//   「請熟客試吃」叫一次模型（task 'cafe'），只寫感想和取名、不改等級。
//   錢、菜單、後廚資料的寫入一律走 OS_CAFE._b.locked（跟結算同一條排隊）。要排在 os_cafe.js 後面。
//   畫盤子的引擎（_engine）原本是 tmp/kitchen_lab/v2.html 的小樣，她跟隔壁視窗一起一筆一筆調過
//   （奶油連續一條、裡面下深上亮、疊層鎖在按下去那層；醬只有整灘外圈；料立著跟盤子同一個角度；起司融成一灘、焦斑＝顏色分層＋雜訊），搬進來沒改畫法。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const K_KIT = 'kitchen';   // {equip:{oven:ts}, tried:{key:tier}, tries, shelved}
    const TRIED_MAX = 300;
    // 🖼 後廚背景、烤箱（阿洛畫的；素材庫 sound-files 鎖 commit，走 GitHub raw——jsDelivr 會因整包太大回 403）
    const ASSET = 'https://raw.githubusercontent.com/nancywang3641/sound-files/4ea6bc3084e64588134473d6ecfa129a633a9a83/cafe_backkitchen/';
    const ART = { bg: ASSET + 'kitchen_bg.webp', open: ASSET + 'oven_open.webp', closed: ASSET + 'oven_closed.webp' };
    const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

    // ── 🍽 檯子 ── frame＝這一檯本身的錢（麵包、餅皮、杯子…）
    const STATIONS = [
        { k: 'burger', name: '漢堡', noun: '堡', icon: 'fa-burger', frame: 4 },
        { k: 'coffee', name: '咖啡', noun: '咖啡', icon: 'fa-mug-hot', frame: 1, drink: true },
        { k: 'cup', name: '手搖杯', noun: '', icon: 'fa-glass-water', frame: 1, drink: true },
        { k: 'bento', name: '便當', noun: '便當', icon: 'fa-bowl-rice', frame: 2 },
        { k: 'pizza', name: '披薩', noun: '披薩', icon: 'fa-pizza-slice', frame: 6, equip: 'oven' },
        { k: 'cake', name: '蛋糕', noun: '蛋糕', icon: 'fa-cake-candles', frame: 5 },
    ];
    const ST_BY = {}; STATIONS.forEach(s => { ST_BY[s.k] = s; });
    const EQUIP = { oven: { name: '烤箱', icon: 'fa-fire-burner', price: 1500, note: '買了就能做披薩' } };

    // ── 👅 料：[味道, 一份幾塊, 取名用的短名] ──
    const TASTE = {
        redsauce: ['果酸', 3, '番茄'], whitesauce: ['綿密', 3, '白醬'], pesto: ['清爽', 3, '青醬'], mozz: ['綿密', 3, '起司'], salami: ['鹹香', 4, '臘腸'],
        mushroom: ['鹹香', 3, '蘑菇'], pepper: ['清爽', 2, '青椒'], basil: ['清爽', 2, '羅勒'], honey: ['甜', 2, '蜂蜜'],
        cream: ['綿密', 3, '奶油'], custard: ['甜', 3, '卡士達'], matcha: ['茶香', 4, '抹茶'], choco: ['苦韻', 3, '巧克力'], straw: ['果酸', 4, '草莓'],
        blueberry: ['果酸', 3, '藍莓'], mintleaf: ['沁涼', 2, '薄荷'], sprinkle: ['甜', 2, '彩糖'], nuts: ['酥脆', 3, '堅果'],
        rice: ['綿密', 2, '白飯'], friedrice: ['鹹香', 3, '炒飯'], grainrice: ['清爽', 3, '雜糧'], karaage: ['酥脆', 4, '炸雞'], terichk: ['鹹香', 5, '照燒雞'],
        salmon: ['鹹香', 5, '鮭魚'], tamago: ['甜', 3, '玉子'], greens: ['清爽', 2, '青菜'], cucumber: ['清爽', 2, '黃瓜'], kimchi: ['辛暖', 2, '泡菜'],
        braisedegg: ['鹹香', 2, '滷蛋'], fruitcut: ['果酸', 3, '水果'],
        pearl: ['綿密', 2, '珍珠'], cpearl: ['甜', 2, '彩珠'], pudding: ['甜', 3, '布丁'], grass: ['苦韻', 2, '仙草'], coco: ['清爽', 2, '椰果'], ice: ['沁涼', 1, '冰'],
        tea: ['茶香', 3, '紅茶'], green: ['茶香', 3, '綠茶'], milk: ['綿密', 2, '奶'], berry: ['果酸', 3, '莓果'], soda: ['清爽', 2, '氣泡'],
        foam: ['綿密', 2, '奶蓋'], ccream: ['綿密', 3, '奶油'], scoop: ['甜', 4, '冰淇淋'],
        espresso: ['苦韻', 3, '咖啡'], water: [null, 0, ''], steam: ['綿密', 2, '奶泡'], kmilk: ['綿密', 2, '拿鐵'], pick: [null, 0, ''], cocoa: ['苦韻', 1, '可可'], cinnamon: ['辛暖', 1, '肉桂'],
        beef: ['鹹香', 6, '牛肉'], chicken: ['酥脆', 6, '炸雞'], cheese: ['綿密', 3, '起司'], egg: ['綿密', 3, '蛋'], bacon: ['鹹香', 4, '培根'], lettuce: ['清爽', 2, '生菜'],
        tomato: ['果酸', 2, '番茄'], onion: ['酥脆', 2, '洋蔥'], pickle: ['果酸', 2, '酸瓜'], teri: ['甜', 2, '照燒'], hot: ['辛暖', 2, '辣味'], mustard: ['甜', 2, '芥末'], bunT: [null, 0, ''],
    };
    const MAIN = new Set(['beef', 'chicken', 'egg', 'karaage', 'terichk', 'salmon', 'braisedegg', 'salami', 'tamago', 'bacon']);   // 能當主角的
    const DESSERT = new Set(['cream', 'custard', 'matcha', 'choco', 'sprinkle', 'ccream', 'scoop', 'pudding', 'cpearl', 'straw', 'blueberry']);   // 甜點才有的
    // 🔥 進烤箱會怎樣：每樣料算一類（11-13 她：「漢堡的起司進烤箱也會有融化效果嗎，還有可可粉形狀會不會消失？」）
    //   起司融成一灘、奶油冰淇淋塌成一灘、冰塊化成水、粉糊開變深、葉子縮小變深、水果變深滲汁、肉和飯和麵包烤上色；焦黃一律用起司那套雜訊遮罩
    const BAKE = {};
    [['cheese', 'mozz cheese'], ['cream', 'cream custard matcha ccream foam scoop'], ['ice', 'ice'], ['dust', 'cocoa cinnamon'],
        ['leaf', 'lettuce greens mintleaf basil'], ['fruit', 'straw blueberry tomato fruitcut pickle cucumber kimchi'],
        ['meat', 'beef bacon chicken karaage terichk salmon salami braisedegg'], ['rice', 'rice friedrice grainrice'], ['bun', 'bunB bunT']]
        .forEach(([m, ids]) => ids.split(' ').forEach(id => { BAKE[id] = m; }));
    const bakeOf = (id) => BAKE[id] || 'other';
    const CONFLICT = [['沁涼', '辛暖'], ['茶香', '辛暖'], ['花香', '鹹香'], ['沁涼', '鹹香']];
    const HARMONY = [['苦韻', '甜'], ['茶香', '花香'], ['清爽', '果酸'], ['苦韻', '辛暖'], ['綿密', '酥脆'], ['鹹香', '清爽'], ['鹹香', '甜'],
        ['甜', '果酸'], ['綿密', '甜'], ['茶香', '綿密'], ['鹹香', '酥脆'], ['果酸', '鹹香'], ['綿密', '果酸'], ['苦韻', '綿密']];
    const TASTE_WORD = { 鹹香: '鹹香', 辛暖: '微辣', 甜: '甜甜的', 果酸: '酸酸甜甜', 苦韻: '微苦', 茶香: '茶香', 花香: '花香', 綿密: '綿密', 清爽: '清爽', 酥脆: '酥脆', 沁涼: '涼涼的' };
    const FOOD_PRICES = { S: 68, A: 45 };

    function _C() { return win.OS_CAFE || window.OS_CAFE || null; }
    function _B() { const c = _C(); return c && c._b; }
    function _A() { return win.AUI || window.AUI || null; }
    const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function _hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h; }

    // ================================================================
    // 🎨 引擎：一個後廚窗口一份（root＝窗口；api＝外面接錢和試吃的那幾支）。
    //   以下到 _engine 結束都是小樣 v2 原樣搬進來的畫法，只改了：找元素改成在 root 裡找、關窗就停（rAF、計時器）、完成交給外面。
    // ================================================================
    function _engine(root, opts, api) {
        const doc = root.ownerDocument;
        const _ivs = new Set();   // 窗口關掉（root 不在畫面上）就自己停的計時器
        const setInterval = (f, ms) => { const id = win.setInterval(() => { if (!root.isConnected) { win.clearInterval(id); _ivs.delete(id); return; } f(); }, ms); _ivs.add(id); return id; };
        const clearInterval = (id) => { win.clearInterval(id); _ivs.delete(id); };
        // 後廚小樣 v2：整盤都是程式照「45 度俯視」現畫的（不貼圖鑑），所以做好的那一盤能直接存成一張去背圖＝封面＋端盤子的物件。
        const W = 400, H = 300, K = 0.62;          // K＝圓從 45 度看被壓成的比例（平躺的東西用它，立起來的東西不壓）
        const mix = (a, b, t) => { const p = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16); return 'rgb(' + [0, 1, 2].map(i => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t)).join(',') + ')'; };
        const SOFT = true;   // 奶油自己裡面的漸層（下緣深、往上變亮）
        const LV = 8;                               // 奶油每疊一層往上抬幾 px
        const $ = (id) => root.querySelector('[data-ok="' + id + '"]');
        const ST = {
          pizza: { tray: [
              { id: 'redsauce', name: '紅醬', kind: 'sauce', col: '#c8372d', rim: '#9e241d', hi: '#e2594c', w: 30 },
              { id: 'whitesauce', name: '白醬', kind: 'sauce', col: '#f3ead6', rim: '#d9cbab', hi: '#fffaf0', w: 30 },
              { id: 'pesto', name: '青醬', kind: 'sauce', col: '#5f8f3a', rim: '#43702a', hi: '#84b257', w: 30 },
              { id: 'mozz', name: '起司絲', kind: 'scatter' }, { id: 'salami', name: '臘腸', kind: 'piece', r: 15 }, { id: 'mushroom', name: '蘑菇', kind: 'piece', r: 13 },
              { id: 'pepper', name: '青椒', kind: 'piece', r: 13 }, { id: 'basil', name: '羅勒', kind: 'piece', r: 12 },
              { id: 'honey', name: '蜂蜜', kind: 'sauce', col: '#e8b23a', rim: '#c48a1c', hi: '#f8d877', w: 8 } ],
            hint: '醬：手指在餅皮上抹，停著不動會積成一灘。起司：邊拖邊撒。其他料：點一下放一塊。' },
          cake: { tray: [
              { id: 'cream', name: '鮮奶油', kind: 'pipe', col: '#fffdf8', shade: '#d9c6a4', hi: '#ffffff', w: 17 },
              { id: 'custard', name: '卡士達', kind: 'pipe', col: '#f7dc7e', shade: '#ddb84e', hi: '#fdeeb0', w: 17 },
              { id: 'matcha', name: '抹茶奶油', kind: 'pipe', col: '#a9c977', shade: '#84a655', hi: '#c6dea0', w: 17 },
              { id: 'choco', name: '巧克力醬', kind: 'sauce', col: '#5a3220', rim: '#3d2014', hi: '#8a573c', w: 9 },
              { id: 'straw', name: '草莓', kind: 'piece', r: 15 }, { id: 'blueberry', name: '藍莓', kind: 'piece', r: 9 },
              { id: 'mintleaf', name: '薄荷', kind: 'piece', r: 12 }, { id: 'sprinkle', name: '彩色顆粒', kind: 'scatter' }, { id: 'nuts', name: '堅果', kind: 'scatter' } ],
            hint: '奶油：按著拖，擠出連續一條；停著不動會鼓成一坨；要疊高就放開，在奶油上再按一次。草莓、藍莓放在奶油上會坐在上面。' },
          bento: { tray: [
              { id: 'rice', name: '白飯', kind: 'sauce', grain: true, col: '#f1ebdb', rim: '#cfc5ac', hi: '#ffffff', w: 34, bits: ['#ffffff', '#ffffff', '#fbf7ec'] },
              { id: 'friedrice', name: '炒飯', kind: 'sauce', grain: true, col: '#e6c574', rim: '#b8923f', hi: '#f3dc9a', w: 34, bits: ['#f3dc9a', '#d9a94e', '#e8873a', '#6fae4c', '#f8e88a'] },
              { id: 'grainrice', name: '雜糧飯', kind: 'sauce', grain: true, col: '#cdb391', rim: '#9a7d58', hi: '#e6d3b6', w: 34, bits: ['#e6d3b6', '#b08f66', '#6b4a5e', '#8a6a44'] },
              { id: 'karaage', name: '炸雞塊', kind: 'piece', r: 15 }, { id: 'terichk', name: '照燒雞腿', kind: 'piece', r: 27 }, { id: 'salmon', name: '煎鮭魚', kind: 'piece', r: 20 },
              { id: 'tamago', name: '玉子燒', kind: 'piece', r: 14 }, { id: 'greens', name: '燙青菜', kind: 'piece', r: 15 }, { id: 'cucumber', name: '小黃瓜', kind: 'piece', r: 11 },
              { id: 'kimchi', name: '泡菜', kind: 'piece', r: 13 }, { id: 'braisedegg', name: '滷蛋', kind: 'piece', r: 13 }, { id: 'fruitcut', name: '水果', kind: 'piece', r: 8 } ],
            hint: '飯：手指在格子裡推開，停著會堆多一點。配菜：點一下放一塊，放好的拖得動。' },
          cup: { tray: [
              { id: 'pearl', name: '珍珠', kind: 'ctop' }, { id: 'cpearl', name: '彩色珍珠', kind: 'ctop' }, { id: 'pudding', name: '布丁', kind: 'ctop' }, { id: 'grass', name: '仙草', kind: 'ctop' }, { id: 'coco', name: '椰果', kind: 'ctop' },
              { id: 'ice', name: '冰塊', kind: 'cice' },
              { id: 'tea', name: '紅茶', kind: 'cliq' }, { id: 'green', name: '綠茶', kind: 'cliq' }, { id: 'milk', name: '牛奶', kind: 'cliq' }, { id: 'berry', name: '草莓醬', kind: 'cliq' }, { id: 'soda', name: '汽水', kind: 'cliq' },
              { id: 'foam', name: '奶蓋', kind: 'ccap' }, { id: 'ccream', cap: 'cream', name: '鮮奶油', kind: 'ccap' }, { id: 'scoop', name: '冰淇淋', kind: 'ccap' } ],
            hint: '料：點杯子就掉進去、沉到杯底。茶和奶：按住一直倒，顏色會混在一起。「搖一搖」：按住杯子左右拖。' },
          coffee: { tray: [
              { id: 'espresso', name: '萃取', kind: 'kf' }, { id: 'water', name: '熱水', kind: 'kf' }, { id: 'steam', name: '打奶泡', kind: 'kf' }, { id: 'kmilk', k: 'milk', name: '倒奶泡', kind: 'kf' },
              { id: 'pick', name: '拉花針', kind: 'kf' }, { id: 'cocoa', name: '可可粉', kind: 'kf' }, { id: 'cinnamon', name: '肉桂粉', kind: 'kf' } ],
            hint: '萃取、打奶泡：按住，看下面那條，停在綠色那段剛好。倒奶泡：手指在杯面上邊倒邊畫。拉花針：在白色上劃一下拉出尖角。' },
          burger: { tray: [
              { id: 'beef', name: '牛肉', kind: 'bg' }, { id: 'chicken', name: '炸雞排', kind: 'bg' }, { id: 'cheese', name: '起司', kind: 'bg' }, { id: 'egg', name: '太陽蛋', kind: 'bg' }, { id: 'bacon', name: '培根', kind: 'bg' },
              { id: 'lettuce', name: '生菜', kind: 'bg' }, { id: 'tomato', name: '番茄', kind: 'bg' }, { id: 'onion', name: '洋蔥', kind: 'bg' }, { id: 'pickle', name: '酸黃瓜', kind: 'bg' },
              { id: 'teri', name: '照燒醬', kind: 'bg' }, { id: 'hot', name: '辣醬', kind: 'bg' }, { id: 'mustard', name: '芥末', kind: 'bg' }, { id: 'bunT', name: '蓋上麵包', kind: 'bg' } ],
            hint: '點一樣料再點漢堡：料掉下來疊上去，點偏一點就疊歪一點。醬：在最上面那層用手指擠。想要起司融化就按「烤一下」。最後蓋上麵包。' },
        };
        let st = opts.st || 'burger', pick = null, S = null, dirty = true, area = null;
        const cv = $('cv'), cx = cv.getContext('2d');
        let DPR = 2;
        function fitRes() {   // 盤子在畫面上多寬 × 螢幕倍率，取 0.5 一階，最多 3 倍
          const r = cv.getBoundingClientRect(), k = Math.max(1, Math.min(3, Math.ceil((r.width || W * 2) / W * (win.devicePixelRatio || 1) * 2) / 2));
          if (k === DPR && cv.width === W * k) return;
          DPR = k; cv.width = W * DPR; cv.height = H * DPR; cx.setTransform(DPR, 0, 0, DPR, 0, 0); dirty = true;
        }
        fitRes();
        if (win.ResizeObserver) new win.ResizeObserver(fitRes).observe(cv);
        const ALLT = {}; Object.keys(ST).forEach(k => ST[k].tray.forEach(t => { t.from = k; ALLT[t.id] = t; }));
        const tool = (id) => ALLT[id];       // 不管現在在哪個檯子，六個檯子的料都找得到
        const SRC = { burger: '漢堡料', coffee: '咖啡', cup: '飲料', bento: '便當料', pizza: '披薩料', cake: '蛋糕料' };
        let traySrc = st;
        const rnd = (seed) => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
        const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

        // ── 盤面形狀（能放料的範圍）──
        const CK = { T: [46, 138], B: [334, 62], F: [316, 192], C: [356, 128], h: 56 };   // 三角蛋糕：尖端 T 朝左、後角 B、前角 F、外側弧的控制點 C、蛋糕高
        function mkArea() {
          const p = new Path2D();
          if (st === 'pizza') p.ellipse(200, 160, 146, 146 * K, 0, 0, 6.2832);
          else if (st === 'bento') p.rect(54, 96, 292, 100);
          else { p.moveTo(CK.T[0] + 10, CK.T[1]); p.lineTo(CK.B[0] - 4, CK.B[1] + 5); p.quadraticCurveTo(CK.C[0] - 8, CK.C[1], CK.F[0] - 5, CK.F[1] - 6); p.closePath(); }
          return p;
        }
        const inArea = (q) => { cx.lineWidth = 22; return cx.isPointInPath(area, q[0] * DPR, q[1] * DPR) || cx.isPointInStroke(area, q[0] * DPR, q[1] * DPR); };
        function fit(q) {   // 手指在盤面外：拉回最近的邊上（不擋、不斷筆）
          if (inArea(q)) return q; const m = st === 'pizza' ? [200, 160] : st === 'bento' ? [200, 146] : [(CK.T[0] + CK.B[0] + CK.F[0]) / 3, (CK.T[1] + CK.B[1] + CK.F[1]) / 3]; let lo = 0, hi = 1;
          for (let i = 0; i < 12; i++) { const k = (lo + hi) / 2; inArea([m[0] + (q[0] - m[0]) * k, m[1] + (q[1] - m[1]) * k]) ? lo = k : hi = k; }
          return [m[0] + (q[0] - m[0]) * lo, m[1] + (q[1] - m[1]) * lo];
        }
        function ground(q) {   // 點在疊高的奶油上：算回它底下那個位置，料才放得上去
          for (let k = 6; k >= 1; k--) { const y = q[1] + k * LV * .9; if (creamTop(q[0], y) + 1 >= k) return [q[0], y]; } return q;
        }

        // ── 畫盤子和底 ──
        function drawBase(c, baked) {
          if (st === 'pizza') {
            c.fillStyle = 'rgba(0,0,0,.16)'; c.beginPath(); c.ellipse(200, 180, 192, 192 * K * .98, 0, 0, 6.2832); c.fill();
            c.fillStyle = '#a8763f'; c.beginPath(); c.ellipse(200, 174, 190, 190 * K, 0, 0, 6.2832); c.fill();     // 木板側邊
            c.fillStyle = '#d6a56a'; c.beginPath(); c.ellipse(200, 168, 190, 190 * K, 0, 0, 6.2832); c.fill();     // 木板面
            c.save(); c.beginPath(); c.ellipse(200, 168, 188, 188 * K, 0, 0, 6.2832); c.clip(); c.strokeStyle = '#c99a60'; c.lineWidth = 1.2; for (let i = -4; i <= 4; i++) { c.beginPath(); c.moveTo(200 + i * 44, 40); c.quadraticCurveTo(206 + i * 47, 168, 200 + i * 44, 300); c.stroke(); } c.restore();
            const crust = baked === 'burnt' ? '#6b4423' : baked === 'good' ? '#c98232' : baked === 'raw' ? '#e8c68e' : '#e2b673';
            const crustS = baked === 'burnt' ? '#3f2512' : baked === 'good' ? '#9c5f1f' : '#c4925a';
            const dough = baked === 'burnt' ? '#a8834f' : baked === 'good' ? '#f0d08e' : '#f6e2b5';
            c.fillStyle = crustS; c.beginPath(); c.ellipse(200, 168, 162, 162 * K, 0, 0, 6.2832); c.fill();        // 餅皮厚度
            c.fillStyle = crust; c.beginPath(); c.ellipse(200, 160, 162, 162 * K, 0, 0, 6.2832); c.fill();
            if (baked === 'good' || baked === 'burnt') { c.save(); c.beginPath(); c.ellipse(200, 160, 162, 162 * K, 0, 0, 6.2832); c.clip(); for (let i = 0; i < 16; i++) { const a = rnd(i + 20) * 6.28; feather(c, 200 + Math.cos(a) * 156, 160 + Math.sin(a) * 156 * K, 12 + rnd(i + 40) * 16, baked === 'burnt' ? '35,18,6' : '140,78,22', baked === 'burnt' ? .7 : .4); } c.restore(); }
            c.fillStyle = dough; c.beginPath(); c.ellipse(200, 161, 148, 148 * K, 0, 0, 6.2832); c.fill();
            c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.ellipse(200, 160, 155, 155 * K, 0, 3.5, 4.6); c.stroke();
          } else if (st === 'bento') {
            const rr = (x, y, w, h, r, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.fill(); };
            rr(30, 86, 340, 168, 22, 'rgba(0,0,0,.16)');
            rr(34, 78, 332, 166, 20, '#a5673a');       // 盒子前面那道牆
            rr(34, 68, 332, 152, 20, '#d9a26a');       // 盒緣
            rr(46, 80, 308, 128, 12, '#b57a4a');       // 裡面後牆（看得到一點深度）
            rr(46, 92, 308, 116, 10, '#f5e6c8');       // 盒底
            rr(190, 80, 10, 128, 3, '#c98f58'); rr(190, 80, 10, 122, 3, '#d9a26a');      // 隔板：左邊放飯，右邊上下兩格
            rr(200, 143, 154, 9, 3, '#c98f58'); rr(200, 141, 154, 7, 3, '#d9a26a');
            c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(56, 74); c.lineTo(200, 74); c.stroke();
          } else {
            const { T, B, F, C, h } = CK;
            c.fillStyle = 'rgba(0,0,0,.14)'; c.beginPath(); c.ellipse(200, 236, 186, 58, 0, 0, 6.2832); c.fill();
            c.fillStyle = '#ded6c6'; c.beginPath(); c.ellipse(200, 231, 186, 58, 0, 0, 6.2832); c.fill();          // 盤子邊
            c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(200, 227, 186, 58, 0, 0, 6.2832); c.fill();
            c.strokeStyle = '#ece5d6'; c.lineWidth = 2; c.beginPath(); c.ellipse(200, 228, 150, 44, 0, 0, 6.2832); c.stroke();
            c.fillStyle = 'rgba(0,0,0,.12)'; c.beginPath(); c.moveTo(T[0] - 6, T[1] + h + 4); c.lineTo(F[0], F[1] + h + 8); c.quadraticCurveTo(C[0] + 14, C[1] + h + 6, B[0] + 8, B[1] + h); c.closePath(); c.fill();
            // 外側那圈（抹面）
            c.fillStyle = '#eadbbd'; c.beginPath(); c.moveTo(F[0], F[1]); c.quadraticCurveTo(C[0], C[1], B[0], B[1]); c.lineTo(B[0], B[1] + h); c.quadraticCurveTo(C[0], C[1] + h, F[0], F[1] + h); c.closePath(); c.fill();
            // 前面的切面：一層一層
            const band = (f0, f1, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(T[0], T[1] + h * f0); c.lineTo(F[0], F[1] + h * f0); c.lineTo(F[0], F[1] + h * f1); c.lineTo(T[0], T[1] + h * f1); c.closePath(); c.fill(); };
            band(0, 1, '#f0cf8c'); band(0, .1, '#fbeccd'); band(.42, .56, '#fffaf0'); band(.9, 1, '#d9a85e');
            for (let i = 0; i < 7; i++) { const k = .12 + i * .125, x = T[0] + (F[0] - T[0]) * k, y = T[1] + (F[1] - T[1]) * k + h * .49; c.fillStyle = '#e25563'; c.beginPath(); c.ellipse(x, y, 9, 3.6, .2, 0, 6.2832); c.fill(); c.fillStyle = '#f39aa2'; c.beginPath(); c.ellipse(x, y, 5, 1.6, .2, 0, 6.2832); c.fill(); }
            for (let i = 0; i < 46; i++) { const k = .06 + rnd(i) * .9, f = rnd(i + 50) > .5 ? .14 + rnd(i + 9) * .25 : .6 + rnd(i + 9) * .27, x = T[0] + (F[0] - T[0]) * k, y = T[1] + (F[1] - T[1]) * k + h * f; c.fillStyle = 'rgba(190,140,70,.35)'; c.beginPath(); c.ellipse(x, y, 1.6 + rnd(i + 3) * 1.4, 1, 0, 0, 6.2832); c.fill(); }
            // 上面（抹了奶油的面）
            c.fillStyle = '#fbeccd'; c.beginPath(); c.moveTo(T[0], T[1]); c.lineTo(B[0], B[1]); c.quadraticCurveTo(C[0], C[1], F[0], F[1]); c.closePath(); c.fill();
            c.strokeStyle = '#fff8e8'; c.lineWidth = 3; c.lineJoin = 'round'; c.stroke();
          }
        }

        // ── 醬：整灘一起畫（先邊、再面），所以不管抹幾筆都連成一灘；平躺在面上所以照 K 壓扁 ──
        function sauceW(p, i, now) { return p.w * (.55 + .45 * ease((now - p.b) / 320)) * (.88 + .22 * Math.sin(i * .37 + p.x * .05)) * (p.g || 1); }
        function drawSauce(c, now, baked, lv, flat) {   // flat＝烤過：底下的奶油塌了，醬全部貼回盤面
          const groups = {}; S.sauce.forEach(s => (groups[s.t.id] = groups[s.t.id] || []).push(s));
          const LVof = (p) => flat ? 0 : (p.lv || 0);
          const o = -lv * LV * .9 / K; c.save(); c.scale(1, K); c.lineCap = 'round'; c.lineJoin = 'round';
          const bk = baked === 'burnt' ? .3 : baked === 'good' ? .1 : 0;   // 烤過的醬收乾、顏色深一點
          for (const id in groups) {
            const t = groups[id][0].t, rim = bk ? toastCol(t.rim, bk) : t.rim, col = bk ? toastCol(t.col, bk) : t.col;
            const pass = (col, add, dx, dy, mul) => { c.strokeStyle = col; c.fillStyle = col;
              groups[id].forEach(s => { for (let i = 0; i < s.pts.length; i++) { const p = s.pts[i]; if (LVof(p) !== lv) continue; let q = s.pts[i - 1] || p; if (LVof(q) !== lv) q = p; const w = sauceW(p, i, now) * mul + add; c.lineWidth = w; c.beginPath(); c.moveTo(q.x + dx * w, q.y / K + dy * w + o); c.lineTo(p.x + dx * w, p.y / K + dy * w + o + .01); c.stroke(); } }); };
            pass(rim, 4, 0, t.grain ? .16 : .06, 1); pass(col, 0, 0, 0, 1);
            // 醬不畫高光：同一種醬抹幾筆都是一整片平的，只有整灘最外面一圈深色的邊
            if (t.grain) groups[id].forEach(s => s.pts.forEach((p, i) => { if (LVof(p) !== lv) return; const w = sauceW(p, i, now);     // 飯：一粒一粒
              for (let j = 0; j < 4; j++) { const sd = p.x * 13.7 + p.y * 7.3 + j * 3.1, a = rnd(sd) * 6.28, d = Math.sqrt(rnd(sd + 1)) * w * .44; c.fillStyle = t.bits[Math.floor(rnd(sd + 2) * t.bits.length)]; c.beginPath(); c.ellipse(p.x + Math.cos(a) * d, p.y / K + Math.sin(a) * d + o, 3.6, 2.2, rnd(sd + 3) * 3.14, 0, 6.2832); c.fill(); } }));
          }
          c.restore();
        }

        // ── 奶油：一條有厚度的管子。每層先畫影子→側面（深）→上面（亮）→反光；疊上去的那段整條往上抬 ──
        function runs() {   // 把每一筆切成「同一層高」的連續小段
          const out = [];
          S.cream.forEach(s => { let cur = null; s.pts.forEach((p, i) => { if (!cur || cur.lv !== p.lv) { cur = { t: s.t, lv: p.lv, pts: i ? [s.pts[i - 1]] : [], y: 0 }; out.push(cur); } cur.pts.push(p); }); });
          out.forEach(r => { r.y = r.pts.reduce((a, p) => a + p.y, 0) / r.pts.length; });
          return out;
        }
        function tube(c, r, col, dx, dy, mul, add) {
          c.strokeStyle = col; c.fillStyle = col; const o = -r.lv * LV;
          for (let i = 0; i < r.pts.length; i++) { const p = r.pts[i], q = r.pts[i - 1] || p; c.lineWidth = Math.max(1, p.w * mul + add); c.beginPath(); c.moveTo(q.x + dx, q.y + o + dy); c.lineTo(p.x + dx, p.y + o + dy + .01); c.stroke(); }
        }
        function drawCreamLevel(c, rs) {
          c.lineCap = 'round'; c.lineJoin = 'round';
          c.globalAlpha = .13; rs.forEach(r => { if (r.lv > 0) return; c.strokeStyle = '#000'; c.lineWidth = r.t.w + 3; c.beginPath(); r.pts.forEach((p, i) => i ? c.lineTo(p.x, p.y - r.lv * LV + 6) : c.moveTo(p.x, p.y - r.lv * LV + 6.01)); if (r.pts.length === 1) c.lineTo(r.pts[0].x + .01, r.pts[0].y - r.lv * LV + 6); c.stroke(); }); c.globalAlpha = 1;
          rs.forEach(r => { if (!r.lv) tube(c, r, r.t.shade, 0, 4.5, 1, 0); });   // 疊上去的那幾層不畫影子，只留一道很細的邊分得出層次
          rs.forEach(r => {
            const m = Math.max(.5, 1 - .14 * r.lv);
            if (SOFT) {   // 奶油自己裡面的漸層：下緣深、往上慢慢變亮。照擠的順序一小段一小段畫，後擠的壓在先擠的上面，繞圈時每一圈都看得出來
              const cols = []; for (let k = 0; k <= 6; k++) cols.push(mix(r.t.shade, r.t.col, .4 + .6 * k / 6)); const o3 = -r.lv * LV;
              for (let i = 0; i < r.pts.length; i++) { const p = r.pts[i], q = r.pts[i - 1] || p; for (let k = 0; k <= 6; k++) { const dy = o3 - m * .075 * k / 2 * r.t.w; c.strokeStyle = cols[k]; c.lineWidth = Math.max(1, p.w * m * (1 - .075 * k)); c.beginPath(); if (k) { const j0 = Math.max(0, i - 5 - k * 2); c.moveTo(r.pts[j0].x, r.pts[j0].y + dy); for (let j = j0 + 1; j <= i; j++) c.lineTo(r.pts[j].x, r.pts[j].y + dy); if (j0 === i) c.lineTo(p.x, p.y + dy + .01); } else { c.moveTo(q.x, q.y + dy); c.lineTo(p.x, p.y + dy + .01); } c.stroke(); } }   // 亮的那幾層往回多畫一小段，接縫才不會露出一節一節
            }
            else tube(c, r, r.t.col, 0, 0, m, 0);
            const o = -r.lv * LV;
            if (!r.lv) tube(c, r, r.t.hi, -1.5, -0, .2, 0);
            r.pts.forEach(p => { if (p.w > r.t.w * 1.25) { const y = p.y + o, w = p.w;    // 停著擠出來的一坨：上面捲一個小尖
              c.fillStyle = r.t.shade; c.beginPath(); c.ellipse(p.x, y - w * .16, w * .36, w * .3, 0, 0, 6.2832); c.fill();
              c.fillStyle = r.t.col; c.beginPath(); c.ellipse(p.x, y - w * .24, w * .34, w * .28, 0, 0, 6.2832); c.fill();
              c.beginPath(); c.moveTo(p.x - w * .16, y - w * .4); c.quadraticCurveTo(p.x - w * .02, y - w * .86, p.x + w * .1, y - w * .78); c.quadraticCurveTo(p.x + w * .04, y - w * .6, p.x + w * .18, y - w * .4); c.closePath(); c.fill();
              } });
          });
        }
        function creamTop(x, y, skip) {   // 這個位置底下已經有幾層奶油（沒有＝-1）
          let top = -1;
          S.cream.forEach(s => { const n = s === skip ? s.pts.length - 9 : s.pts.length; for (let i = 0; i < n; i++) { const p = s.pts[i]; if (p.lv > top && Math.abs(p.x - x) < p.w * .5 && Math.abs(p.y - y) < p.w * .42) top = p.lv; } });
          return top;
        }

        // ── 料：每樣都照 45 度俯視畫。圓的、立著的（草莓、藍莓）不壓扁，只有影子貼在面上；片狀的（臘腸、蘑菇）才是躺平的 ──
        const SPR = ['#ff6f91', '#ffc75f', '#5ec4f7', '#8fd46a', '#b58cf5', '#ffffff'];
        function drawPiece(c, id, x, y, r, seed, baked) {
          const E = (ex, ey, rx, ry, col, rot) => { c.fillStyle = col; c.beginPath(); c.ellipse(ex, ey, rx, ry, rot || 0, 0, 6.2832); c.fill(); };
          const sh = (rx, ry, dy) => E(x + 1, y + (dy || 0), rx, ry, 'rgba(0,0,0,.2)');
          if (id === 'blueberry') {
            sh(r * 1.05, r * .5, r * .55);
            const g = c.createRadialGradient(x - r * .35, y - r * .5, r * .1, x, y - r * .1, r * 1.1); g.addColorStop(0, '#7f8fd8'); g.addColorStop(.45, '#46529f'); g.addColorStop(1, '#2a3168');
            c.fillStyle = g; c.beginPath(); c.arc(x, y - r * .15, r, 0, 6.2832); c.fill();
            c.fillStyle = '#232a5c'; c.beginPath(); for (let i = 0; i < 5; i++) { const a = i * 1.2566 - 1.57, b = a + .6283; c.lineTo(x + r * .1 + Math.cos(a) * r * .42, y - r * .78 + Math.sin(a) * r * .22); c.lineTo(x + r * .1 + Math.cos(b) * r * .18, y - r * .78 + Math.sin(b) * r * .1); } c.closePath(); c.fill();
            E(x - r * .42, y - r * .42, r * .2, r * .12, 'rgba(255,255,255,.75)', -.6);
          } else if (id === 'straw') {
            sh(r * .95, r * .45, r * .5);
            const body = new Path2D(); body.moveTo(x, y + r * .62); body.bezierCurveTo(x - r * 1.05, y - r * .1, x - r * 1.0, y - r * 1.35, x, y - r * 1.25); body.bezierCurveTo(x + r * 1.0, y - r * 1.35, x + r * 1.05, y - r * .1, x, y + r * .62);
            const g = c.createLinearGradient(x - r, y, x + r, y); g.addColorStop(0, '#f2545b'); g.addColorStop(.6, '#e23645'); g.addColorStop(1, '#b82535');
            c.fillStyle = g; c.fill(body);
            c.save(); c.clip(body); for (let i = 0; i < 12; i++) { const sx = x - r * .7 + (i % 4) * r * .47 + (Math.floor(i / 4) % 2) * r * .2, sy = y - r * .85 + Math.floor(i / 4) * r * .46; E(sx, sy, r * .07, r * .11, '#ffe9a8'); } E(x - r * .45, y - r * .7, r * .22, r * .4, 'rgba(255,255,255,.28)', .3); c.restore();
            c.fillStyle = '#5c9a3a'; for (let i = 0; i < 5; i++) { const a = -2.6 + i * .52; c.beginPath(); c.moveTo(x, y - r * 1.2); c.quadraticCurveTo(x + Math.cos(a) * r * .5, y - r * 1.3 + Math.sin(a) * r * .1, x + Math.cos(a) * r * .85, y - r * 1.12 + Math.sin(a) * r * .5 - r * .1); c.quadraticCurveTo(x + Math.cos(a) * r * .3, y - r * 1.02, x, y - r * 1.2); c.fill(); }
            c.strokeStyle = '#4a7f2c'; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y - r * 1.22); c.lineTo(x + r * .1, y - r * 1.55); c.stroke();
          } else if (id === 'mintleaf') {
            sh(r * 1.3, r * .5, r * .2); const rot = (rnd(seed) - .5) * .4;
            [[-2.35, 1], [-.75, .82]].forEach(([a, sc]) => { c.save(); c.translate(x, y); c.rotate(a + rot); c.scale(sc, sc); c.translate(r * .9, 0);   // 兩片葉子從同一點往左上、右上翹起來
            c.fillStyle = '#4f9a48'; c.beginPath(); c.moveTo(-r, 0); c.quadraticCurveTo(0, -r * 1.05, r, -r * .1); c.quadraticCurveTo(0, r * .5, -r, 0); c.fill();
            c.fillStyle = '#78c06a'; c.beginPath(); c.moveTo(-r, 0); c.quadraticCurveTo(0, -r * 1.05, r, -r * .1); c.quadraticCurveTo(0, -r * .25, -r, 0); c.fill();
            c.strokeStyle = '#3d7d38'; c.lineWidth = 1; c.beginPath(); c.moveTo(-r * .9, 0); c.quadraticCurveTo(0, -r * .2, r * .9, -r * .1); c.stroke(); c.restore(); });
          } else if (id === 'salami') {
            const col = baked ? '#a8402f' : '#c9544a'; E(x, y + 2.5, r, r * K, '#8f3229'); E(x, y, r, r * K, col); E(x, y, r * .86, r * K * .86, baked ? '#b84a37' : '#d8675c');
            for (let i = 0; i < 7; i++) { const a = rnd(seed + i) * 6.28, d = rnd(seed + i + 9) * r * .65; E(x + Math.cos(a) * d, y + Math.sin(a) * d * K, 2.2, 1.4, '#f6c9c0'); }
            if (baked) { c.strokeStyle = 'rgba(90,30,15,.5)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x, y, r * .95, r * K * .95, 0, .3, 2.6); c.stroke(); }
          } else if (id === 'mushroom') {
            c.save(); c.translate(x, y); c.rotate(-.4 + rnd(seed) * .8); c.scale(1, K + .1);
            const m = (o, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(-r, o - r * .1); c.quadraticCurveTo(-r, o - r, 0, o - r); c.quadraticCurveTo(r, o - r, r, o - r * .1); c.lineTo(r * .32, o - r * .05); c.lineTo(r * .36, o + r * .8); c.lineTo(-r * .36, o + r * .8); c.lineTo(-r * .32, o - r * .05); c.closePath(); c.fill(); };
            m(3, '#b89a78'); m(0, baked ? '#dcc19a' : '#f1e3cc'); c.strokeStyle = '#b89a78'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-r * .7, -r * .22); c.quadraticCurveTo(0, -r * .5, r * .7, -r * .22); c.stroke(); c.restore();
          } else if (id === 'pepper') {
            c.lineWidth = r * .36; c.strokeStyle = '#3f7a2a'; c.beginPath(); c.ellipse(x, y + 2, r * .8, r * .8 * K, 0, 0, 6.2832); c.stroke();
            c.strokeStyle = baked ? '#5c9440' : '#6fb04c'; c.beginPath(); c.ellipse(x, y, r * .8, r * .8 * K, 0, 0, 6.2832); c.stroke();
            c.lineWidth = 1.2; c.strokeStyle = '#a5d884'; c.beginPath(); c.ellipse(x, y - 1, r * .86, r * .86 * K, 0, 3.4, 5.2); c.stroke();
          } else if (id === 'basil') {
            c.save(); c.translate(x, y); c.rotate(rnd(seed) * 6.28); c.scale(1, K + .12);
            c.fillStyle = '#2f6b2c'; c.beginPath(); c.moveTo(-r, 2); c.quadraticCurveTo(0, -r * .7 + 2, r, 2); c.quadraticCurveTo(0, r * .7 + 2, -r, 2); c.fill();
            c.fillStyle = baked ? '#3f7a34' : '#4c9a42'; c.beginPath(); c.moveTo(-r, 0); c.quadraticCurveTo(0, -r * .7, r, 0); c.quadraticCurveTo(0, r * .7, -r, 0); c.fill();
            c.strokeStyle = '#2f6b2c'; c.lineWidth = 1; c.beginPath(); c.moveTo(-r * .85, 0); c.lineTo(r * .85, 0); c.stroke(); c.restore();
          } else if (id === 'mozz') {
            if (baked) { E(x, y + 1, 11, 7, baked === 'burnt' ? '#b9853c' : '#e9c56a'); E(x, y, 10, 6.2, baked === 'burnt' ? '#d9a650' : '#fbe8ae'); if (rnd(seed) > .5) E(x + 2, y - 1, 3, 1.8, baked === 'burnt' ? '#5a3312' : '#d08a3a'); return; }
            const a = rnd(seed) * 3.14, L = 6.5, dx = Math.cos(a) * L, dy = Math.sin(a) * L * K, bx = (rnd(seed + 2) - .5) * 14;
            c.lineCap = 'round'; const s = (o, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x - dx, y - dy + o); c.quadraticCurveTo(x + bx, y - bx * .3 + o, x + dx, y + dy + o); c.stroke(); };
            s(1.4, '#d9b65a', 2.8); s(0, '#fbeab0', 2.6);
          } else if (id === 'sprinkle') {
            const a = rnd(seed) * 3.14, col = SPR[Math.floor(rnd(seed + 5) * SPR.length)]; c.lineCap = 'round';
            c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - Math.cos(a) * 3.5, y - Math.sin(a) * 2 + 1.5); c.lineTo(x + Math.cos(a) * 3.5, y + Math.sin(a) * 2 + 1.5); c.stroke();
            c.strokeStyle = col; c.beginPath(); c.moveTo(x - Math.cos(a) * 3.5, y - Math.sin(a) * 2); c.lineTo(x + Math.cos(a) * 3.5, y + Math.sin(a) * 2); c.stroke();
          } else if (id === 'nuts') {
            const a = rnd(seed) * 3.14; E(x, y + 1.6, 4.4, 3, '#8a5a2c', a); E(x, y, 4.2, 2.8, '#c9925a', a); E(x - .8, y - .8, 1.8, 1, '#e3b888', a);
          } else if (id === 'karaage') {
            sh(r * 1.15, r * .5, r * .45); const bl = [   // 四種形狀，每放一塊隨機挑一種：圓圓一團／長條／小顆／一頭大一頭小
              [[-.45, -.1, .62], [.4, -.2, .66], [0, .15, .7], [-.1, -.5, .6], [.45, .2, .5]],
              [[-.75, .05, .5], [-.3, -.12, .6], [.2, -.05, .62], [.68, .1, .5], [0, .2, .45]],
              [[-.25, -.1, .6], [.28, 0, .58], [0, -.38, .5]],
              [[-.35, -.15, .78], [.35, .1, .5], [.7, .25, .36], [-.1, .25, .5]],
            ][Math.floor(rnd(seed) * 4)];
            bl.forEach(([ox, oy, k]) => E(x + ox * r, y + oy * r * .7 - r * .3 + 3.5, r * k, r * k * .85, '#9c5f24'));
            bl.forEach(([ox, oy, k], i) => E(x + ox * r, y + oy * r * .7 - r * .3, r * k, r * k * .85, i % 2 ? '#d4923c' : '#dc9d46'));
            bl.forEach(([ox, oy, k]) => { E(x + ox * r - r * k * .25, y + oy * r * .7 - r * .3 - r * k * .3, r * k * .32, r * k * .2, '#f0c078', -.5); E(x + ox * r + r * k * .3, y + oy * r * .7 - r * .3 + r * k * .2, 1.6, 1.2, '#a8682a'); });
          } else if (id === 'terichk') {
            // 一整塊照燒雞腿排切成五片：上面是刷了醬的皮（深、有亮光），朝你的那面是切開的肉（淺色）
            sh(r * 1.12, r * .26, r * .3);
            const R = (x0, y0, w, h, q, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x0 + q, y0); c.arcTo(x0 + w, y0, x0 + w, y0 + h, q); c.arcTo(x0 + w, y0 + h, x0, y0 + h, q); c.arcTo(x0, y0 + h, x0, y0, q); c.arcTo(x0, y0, x0 + w, y0, q); c.closePath(); c.fill(); };
            const ws = [.3, .42, .5, .44, .32], hs = [.6, .86, 1, .9, .66], tot = ws.reduce((p, v) => p + v + .015, 0); let acc = -tot / 2;
            for (let i = 0; i < 5; i++) {
              const w = r * ws[i] * (.94 + rnd(seed + i) * .12), hTop = r * .95 * hs[i] * (.95 + rnd(seed + i + 4) * .1), cut = r * (.3 + hs[i] * .1), mid = acc + ws[i] / 2, t = mid / (tot / 2);   // t：-1（最左）～1（最右）
              acc += ws[i] + .015;
              c.save(); c.translate(x + mid * r, y + r * .1 + t * t * r * .14); c.rotate(t * .13 + (rnd(seed + i + 8) - .5) * .08);      // 兩邊往下彎、往外倒一點＝整塊是彎的
              R(-w / 2, -4, w, cut + 4, w * .3, '#c79d6c');                          // 切面底下深一點的邊
              R(-w / 2, -4, w, cut + 1, w * .3, '#f0d6ae');                          // 切面：肉
              c.fillStyle = '#e2bf92'; c.fillRect(-w * .3, cut * .4, w * .6, 1.6);
              R(-w / 2, -hTop, w, hTop, w * .46, '#6b3114');                         // 皮的邊
              R(-w / 2 + .8, -hTop, w - 1.6, hTop - 2.5, w * .46, '#96501f');        // 皮
              R(-w * .26, -hTop * .86, w * .3, hTop * .6, w * .15, '#b8692c');       // 醬的亮帶
              E(-w * .12, -hTop * .7, w * .1, hTop * .1, '#f6cf96');                 // 反光
              c.restore();
            }
            for (let i = 0; i < 6; i++) E(x - r * .7 + rnd(seed + i) * r * 1.4, y - r * .6 + rnd(seed + i + 9) * r * .45, 1.5, 1, '#fff1cf', rnd(seed + i + 3) * 3);   // 白芝麻
          } else if (id === 'salmon') {
            sh(r * 1.15, r * .45, r * .45); c.save(); c.translate(x, y - r * .25); c.rotate(-.12);
            const slab = (o, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(-r, -r * .3 + o); c.quadraticCurveTo(-r * .9, -r * .62 + o, -r * .3, -r * .6 + o); c.lineTo(r * .7, -r * .5 + o); c.quadraticCurveTo(r * 1.05, -r * .3 + o, r, r * .2 + o); c.quadraticCurveTo(r * .6, r * .55 + o, -r * .2, r * .5 + o); c.quadraticCurveTo(-r * .95, r * .4 + o, -r, -r * .3 + o); c.fill(); };
            slab(4, '#c4683e'); slab(0, '#f39a6e'); c.strokeStyle = '#ffd6bf'; c.lineWidth = 2; c.lineCap = 'round';
            for (let i = 0; i < 4; i++) { const px = -r * .6 + i * r * .42; c.beginPath(); c.moveTo(px, -r * .42); c.quadraticCurveTo(px + r * .22, 0, px, r * .36); c.stroke(); }
            c.strokeStyle = '#d4783f'; c.lineWidth = 3; c.beginPath(); c.moveTo(-r * .8, -r * .5); c.quadraticCurveTo(0, -r * .62, r * .75, -r * .44); c.stroke(); c.restore();
          } else if (id === 'tamago') {
            sh(r * 1.1, r * .4, r * .55);
            const box = (o, col, k) => { c.fillStyle = col; const w = r * 1.9 * k, h = r * 1.2 * k, x0 = x - w / 2, y0 = y - r * .75 - (h - r * 1.2) / 2 + o, q = r * .32 * k; c.beginPath(); c.moveTo(x0 + q, y0); c.arcTo(x0 + w, y0, x0 + w, y0 + h, q); c.arcTo(x0 + w, y0 + h, x0, y0 + h, q); c.arcTo(x0, y0 + h, x0, y0, q); c.arcTo(x0, y0, x0 + w, y0, q); c.closePath(); c.fill(); };
            box(4, '#d4a436', 1); box(0, '#f8dd72', 1); box(0, '#e9c452', .74); box(0, '#f8dd72', .6); box(0, '#e9c452', .36); box(0, '#f8dd72', .22);
            E(x - r * .55, y - r * .55, r * .22, r * .1, 'rgba(255,255,255,.55)', -.3);
          } else if (id === 'greens') {
            sh(r * 1.2, r * .4, r * .35); c.lineCap = 'round';
            for (let i = 0; i < 5; i++) { const oy = (i - 2) * r * .2, x0 = x - r, x1 = x + r * .5, y0 = y - r * .1 + oy, y1 = y - r * .35 + oy * .8;
              c.strokeStyle = '#3c8233'; c.lineWidth = 4.5; c.beginPath(); c.moveTo(x0, y0 + 2); c.quadraticCurveTo(x, y0 - 2, x1, y1 + 2); c.stroke();
              c.strokeStyle = i % 2 ? '#7cc463' : '#9ad67c'; c.lineWidth = 3; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x, y0 - 4, x1, y1); c.stroke();
              E(x1 + r * .25, y1 + 2, r * .42, r * .2, '#2f7030', -.2); E(x1 + r * .25, y1, r * .42, r * .2, i % 2 ? '#4c9a42' : '#57a84a', -.2); }
          } else if (id === 'cucumber') {
            E(x, y + 2.5, r, r * K, '#3f7d34'); E(x, y, r, r * K, '#5aa446'); E(x, y, r * .8, r * .8 * K, '#d3edb6');
            for (let i = 0; i < 6; i++) { const a = i * 1.047 + rnd(seed); E(x + Math.cos(a) * r * .42, y + Math.sin(a) * r * .42 * K, 1.8, 1, '#a6d089', a); }
          } else if (id === 'kimchi') {
            sh(r * 1.15, r * .45, r * .4);
            [[-.4, 0, .5], [.35, -.15, -.4], [0, -.35, .1]].forEach(([ox, oy, ro]) => { const px = x + ox * r, py = y + oy * r - r * .2;
              E(px, py + 3, r * .75, r * .45, '#8f2618', ro); E(px, py, r * .75, r * .45, '#d24a32', ro); E(px - r * .1, py - r * .05, r * .5, r * .16, '#f4d6ae', ro); E(px + r * .3, py + r * .12, 1.5, 1, '#7a1a10'); E(px - r * .35, py + r * .15, 1.5, 1, '#7a1a10'); });
          } else if (id === 'braisedegg') {
            sh(r * 1.05, r * .45, r * .45); E(x, y - r * .2 + 3.5, r, r * .78, '#5e3818'); E(x, y - r * .2, r, r * .78, '#96643a'); E(x, y - r * .22, r * .8, r * .6, '#f3e6cb');
            E(x + r * .04, y - r * .2, r * .44, r * .36, '#e89a2e'); E(x - r * .08, y - r * .3, r * .16, r * .1, '#f8c66a', -.4);
          } else if (id === 'fruitcut') {
            const pal = [['#f6a04a', '#d07a26', '#ffc98a'], ['#9fd67a', '#6ea84c', '#c9efaa'], ['#f2647a', '#c4405a', '#ffa3b0'], ['#f8e06a', '#d4b236', '#fff2a8']][Math.floor(rnd(seed) * 4)];
            sh(r * 1.2, r * .5, r * .75); c.fillStyle = pal[1]; c.fillRect(x - r, y - r * .35, r * 2, r * 1.15); c.fillStyle = pal[0]; c.fillRect(x - r, y - r * 1.25, r * 2, r * .95); c.fillStyle = pal[2]; c.fillRect(x - r * .75, y - r * 1.1, r * .9, r * .22);
          }
        }

        // ── 烤過的起司：整片融成一灘（跟醬一樣連在一起），焦的地方是邊緣暈開、深淺不一的斑，不是圓點 ──
        function feather(c, x, y, r, rgb, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(.55, 'rgba(' + rgb + ',' + a * .55 + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); }
        // 焦斑：一張雜訊圖切成幾層顏色（淺金→褐→深褐），每個披薩長得不一樣；只在起司範圍內露出來
        function noiseTex(baked) {
          S.tex = S.tex || {}; if (S.tex[baked]) return S.tex[baked];
          const w = 480, h = 300, o = doc.createElement('canvas'); o.width = w; o.height = h; const c = o.getContext('2d'), im = c.createImageData(w, h), d = im.data, sd = S.seed || 1;
          const hsh = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7 + sd * 74.7) * 43758.5453; return v - Math.floor(v); };
          const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (hsh(xi, yi) * (1 - u) + hsh(xi + 1, yi) * u) * (1 - v) + (hsh(xi, yi + 1) * (1 - u) + hsh(xi + 1, yi + 1) * u) * v; };
          const bands = baked === 'burnt' ? [[.4, 214, 150, 62, 215], [.5, 158, 92, 34, 230], [.62, 78, 42, 16, 240]] : [[.55, 228, 170, 82, 190], [.66, 196, 124, 48, 215]];
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const n = vn(x / 46, y / 46) * .55 + vn(x / 19, y / 19) * .3 + vn(x / 8, y / 8) * .15; let k = -1; for (let i = 0; i < bands.length; i++) if (n > bands[i][0]) k = i;
            if (k >= 0) { const q = (y * w + x) * 4, bd = bands[k]; d[q] = bd[1]; d[q + 1] = bd[2]; d[q + 2] = bd[3]; d[q + 3] = bd[4]; }
          }
          c.putImageData(im, 0, 0); return S.tex[baked] = o;
        }
        function drawMelt(c, baked) {   // 起司絲、漢堡的起司片：融成一灘（起司片是橘黃的那灘）
          const ms = S.pcs.filter(p => bakeOf(p.id) === 'cheese'); if (!ms.length) return;
          const R = (p) => p.id === 'mozz' ? 9 + rnd(p.seed) * 6 : 24 + rnd(p.seed) * 6, blob = (arr, add, dy) => { c.beginPath(); arr.forEach(p => { const r = R(p) + add; c.moveTo(p.x + r, p.y / K + dy); c.arc(p.x, p.y / K + dy, r, 0, 6.2832); }); };
          const mz = ms.filter(p => p.id === 'mozz'), ch = ms.filter(p => p.id !== 'mozz');
          c.save(); c.scale(1, K);
          if (ch.length) { c.fillStyle = baked === 'burnt' ? '#a8681c' : '#d99a2a'; blob(ch, 1.5, 3); c.fill(); c.fillStyle = baked === 'raw' ? '#f9d769' : baked === 'burnt' ? '#e3a83c' : '#f4c04a'; blob(ch, 0, 0); c.fill(); }
          if (mz.length) { c.fillStyle = baked === 'burnt' ? '#a8762c' : '#d9b05a'; blob(mz, 1.5, 3); c.fill(); c.fillStyle = baked === 'raw' ? '#fdf3cf' : baked === 'burnt' ? '#e6bd62' : '#fbe6a2'; blob(mz, 0, 0); c.fill(); }
          blob(ms, 0, 0); c.clip();
          ms.forEach(p => { if (rnd(p.seed + 3) > .4) feather(c, p.x - 3, p.y / K - 4, R(p) * .7, '255,250,225', .5); });       // 亮的地方（油亮）
          if (baked !== 'raw') c.drawImage(noiseTex(baked), 40, 60 / K, 320, 200 / K);   // 焦斑：一張雜訊圖切成幾層顏色，只在起司範圍內露出來
          c.restore();
        }
        // 奶油、冰淇淋、奶蓋進烤箱：塌下去化成一灘（同一種顏色連成一片，只有整灘外圈），烤到的地方跟起司一樣用雜訊遮罩上焦糖色
        const MELT_CREAM = { scoop: ['#f6b0c0', '#e58aa0'], ccream: ['#fffdf8', '#d9c6a4'], foam: ['#fff4e0', '#e2d2b0'] };
        function drawCreamMelt(c, baked) {
          const bl = [];   // [x, y, r, 面, 邊]
          S.cream.forEach(s => s.pts.forEach((p, i) => { if (i % 2 && i !== s.pts.length - 1) return; bl.push([p.x, p.y, p.w * .8, s.t.col, s.t.shade]); }));
          S.pcs.forEach(p => { const m = MELT_CREAM[p.id]; if (m) bl.push([p.x, p.y, 20 + rnd(p.seed) * 8, m[0], m[1]]); });
          if (!bl.length) return;
          const groups = {}; bl.forEach(b => { const k = b[3] + '|' + b[4]; (groups[k] = groups[k] || []).push(b); });
          const path = (arr, add, dy) => { c.beginPath(); arr.forEach(b => { const r = b[2] + add; c.moveTo(b[0] + r, b[1] / K + dy); c.arc(b[0], b[1] / K + dy, r, 0, 6.2832); }); };
          c.save(); c.scale(1, K);
          for (const k in groups) { const [col, rim] = k.split('|'); c.fillStyle = rim; path(groups[k], 1.5, 2.5); c.fill(); c.fillStyle = col; path(groups[k], 0, 0); c.fill(); }
          if (baked !== 'raw') { path(bl, 0, 0); c.clip(); c.globalAlpha = baked === 'burnt' ? .95 : .6; c.drawImage(noiseTex(baked), 40, 60 / K, 320, 200 / K); }
          c.restore();
        }
        // 先畫到一張暫存畫布、只在畫到的地方蓋一層顏色，再貼回來（烤過的肉、葉子、水果、麵包變深就靠這個）
        let tintC = null;
        function tinted(c, rgb, a, draw) {
          if (!a) return draw(c);
          const cw = c.canvas.width, ch = c.canvas.height;
          if (!tintC) tintC = doc.createElement('canvas');
          if (tintC.width !== cw || tintC.height !== ch) { tintC.width = cw; tintC.height = ch; }
          const t = tintC.getContext('2d'); t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(0, 0, cw, ch); t.globalAlpha = 1;
          t.setTransform(c.getTransform()); draw(t);
          t.setTransform(1, 0, 0, 1, 0, 0); t.globalAlpha = 1; t.globalCompositeOperation = 'source-atop'; t.fillStyle = 'rgba(' + rgb.join(',') + ',' + a + ')'; t.fillRect(0, 0, cw, ch); t.globalCompositeOperation = 'source-over';
          c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(tintC, 0, 0); c.restore();
        }
        const TINT = { leaf: [[38, 52, 12], .4, .62], fruit: [[95, 18, 12], .24, .48], meat: [[70, 30, 8], .22, .55], rice: [[175, 115, 35], .3, .55], bun: [[150, 78, 18], .32, .62], other: [[130, 70, 20], .14, .42] };
        const tintA = (m, baked) => TINT[m] ? TINT[m][baked === 'burnt' ? 2 : 1] * (baked === 'raw' ? .35 : 1) : 0;
        function toastCol(col, k) { const r = toRgb(col), d = [70, 30, 10]; return 'rgb(' + r.map((v, i) => Math.round(v + (d[i] - v) * k)).join(',') + ')'; }
        // 烤好的披薩（或任何進過烤箱的面）：奶油塌掉、醬貼回盤面、起司融、料照種類變化
        const NATIVE_BAKE = new Set(['salami', 'mushroom', 'pepper', 'basil']);   // 披薩本來的料，自己會畫烤過的樣子
        function renderBaked(c, now) {
          const bk = S.baked;
          drawSauce(c, now, bk, 0, true);
          drawCreamMelt(c, bk);
          drawMelt(c, bk);
          const pcs = S.pcs.filter(p => { const m = bakeOf(p.id); return m !== 'cheese' && !MELT_CREAM[p.id]; }).sort((a, z) => a.y - z.y);
          const E = (ex, ey, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 6.2832); c.fill(); };
          pcs.forEach(p => {   // 冰塊化成一灘水、水果旁邊滲一點汁：畫在料底下
            const m = bakeOf(p.id);
            if (m === 'ice') { E(p.x, p.y, 15 + rnd(p.seed) * 6, (15 + rnd(p.seed) * 6) * K, 'rgba(190,226,242,.55)'); E(p.x - 4, p.y - 2, 5, 2, 'rgba(255,255,255,.7)'); }
            else if (m === 'fruit') { const t = tool(p.id), col = p.id === 'blueberry' ? '70,40,110' : p.id === 'cucumber' || p.id === 'pickle' ? '120,150,60' : '170,40,50'; feather(c, p.x + 2, p.y + 2, (t && t.r || 10) * 1.3, col, bk === 'raw' ? .15 : .3); }
          });
          const one = (cc, p, sc) => { cc.save(); cc.translate(p.x, p.y); if (sc) cc.scale(sc, sc); drawAny(cc, tool(p.id), 0, 0, 1, p.seed, bk); cc.restore(); };
          pcs.filter(p => NATIVE_BAKE.has(p.id)).forEach(p => one(c, p));
          ['meat', 'rice', 'other', 'fruit', 'leaf'].forEach(m => {
            const g = pcs.filter(p => !NATIVE_BAKE.has(p.id) && bakeOf(p.id) === m);
            if (g.length) tinted(c, TINT[m][0], tintA(m, bk), cc => g.forEach(p => one(cc, p, m === 'leaf' ? .8 : 0)));   // 葉子烤過縮小一圈
          });
          pcs.filter(p => bakeOf(p.id) === 'dust').forEach(p => {   // 可可粉、肉桂粉：還看得出撒過，但點點糊開、顏色變深
            const rgb = p.id === 'cocoa' ? '52,26,12' : '118,58,18';
            for (let i = 0; i < 7; i++) feather(c, p.x + (rnd(p.seed + i) - .5) * 14, p.y + (rnd(p.seed + i + 5) - .5) * 8, 4.2, rgb, bk === 'raw' ? .6 : .85);
          });
        }
        // ── 整盤畫一次（畫面和「存成樣本」用同一支）──
        function render(c, now) {
          c.clearRect(0, 0, W, H);
          if (st === 'cup') return renderCup(c, now);
          if (st === 'coffee') return renderCoffee(c, now);
          if (st === 'burger') return renderBurger(c, now);
          drawBase(c, S.baked);
          if (S.baked) return renderBaked(c, now);
          drawSauce(c, now, S.baked, 0);
          if (S.baked) drawMelt(c, S.baked);
          const rs = runs(), maxLv = Math.max(0, ...rs.map(r => r.lv), ...S.pcs.map(p => p.lv), ...S.sauce.map(s => Math.max(...s.pts.map(p => p.lv || 0))));
          for (let lv = 0; lv <= maxLv + 1; lv++) {
            if (lv) drawSauce(c, now, S.baked, lv);     // 抹在奶油上面的醬：跟著奶油的高度畫在它上面
            const here = rs.filter(r => r.lv === lv).sort((a, z) => a.y - z.y); if (here.length) drawCreamLevel(c, here);
            S.pcs.filter(p => p.lv === lv && !(S.baked && p.id === 'mozz')).sort((a, z) => a.y - z.y).forEach(p => {
              const k = ease((now - p.b) / 300), t = tool(p.id) || {}, sq = k < 1 ? 1 + .25 * Math.sin(k * 3.14) : 1;
              c.save(); c.globalAlpha = Math.min(1, k * 2); c.translate(p.x, p.y - p.lv * LV * .9 - (1 - k) * 34); c.scale(sq, 2 - sq); drawAny(c, tool(p.id), 0, 0, 1, p.seed, S.baked); c.restore();
            });
          }
        }
        let alive = 0;
        function frame(now) {
          if (!root.isConnected) return;   // 窗口關了就停
          if (st === 'cup') cupTick(now); else if (st === 'coffee') kTick(now);
          if (dirty || now < alive || st === 'cup' || st === 'coffee') { dirty = false; cx.setTransform(DPR, 0, 0, DPR, 0, 0); cx._px = DPR; render(cx, now); }
          requestAnimationFrame(frame);
        }
        const touch = (ms) => { dirty = true; alive = Math.max(alive, performance.now() + (ms || 0)); };

        // ── 手指 ──
        function pt(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; }
        function addPiece(t, q, jitter) {
          const [x, y] = fit([q[0] + (jitter ? (Math.random() - .5) * jitter : 0), q[1] + (jitter ? (Math.random() - .5) * jitter * K : 0)]);
          const p = { id: t.id, x, y, lv: creamTop(x, y) + 1, seed: Math.random() * 1000, b: performance.now() };
          S.pcs.push(p); S.hist.push({ k: 'pcs', o: p }); touch(350); return p;
        }
        function bind() {
          let mode = null, cur = null, last = null, hold = null, t = null;
          cv.onpointerdown = (e) => {
            if (st === 'cup') return cupDown(e);
            if (st === 'coffee') return kDown(e);
            if (st === 'burger') return bgDown(e);
            if (S.baked || S.busy) return;
            const raw = tool(pick); t = surfTool(raw); const q = fit(ground(pt(e)));
            if (!t) { $('hint').textContent = raw ? NOUSE : '先在下面點一樣料'; return; }
            e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) {}
            last = q; const now = performance.now();
            if (t.kind === 'sauce') {
              mode = 'sauce'; cur = { t, pts: [{ x: q[0], y: q[1], w: t.w, b: now, g: 1, lv: creamTop(q[0], q[1]) + 1 }] }; S.sauce.push(cur); S.hist.push({ k: 'sauce', o: cur });
              hold = setInterval(() => { const p = cur.pts[cur.pts.length - 1]; if (p.g < 2.1) { p.g += .05; touch(); } }, 40);       // 停著＝積成一灘
            } else if (t.kind === 'pipe') {
              mode = 'pipe'; cur = { t, pts: [{ x: q[0], y: q[1], w: t.w, lv: Math.min(6, creamTop(q[0], q[1]) + 1) }] }; S.cream.push(cur); S.hist.push({ k: 'cream', o: cur });
              hold = setInterval(() => { const p = cur.pts[cur.pts.length - 1]; if (p.w < t.w * 1.9) { p.w += .7; touch(); } }, 40);     // 停著＝鼓成一坨
            } else if (t.kind === 'scatter') { mode = 'scatter'; for (let k = 0; k < 6; k++) addPiece(t, q, 26); }
            else {
              const hit = S.pcs.slice().reverse().find(p => p.id === t.id && Math.hypot(p.x - q[0], p.y - p.lv * LV * .9 - q[1]) < (t.r || 8));
              if (hit) { mode = 'drag'; cur = hit; } else { addPiece(t, q); mode = null; }
            }
            touch(400);
          };
          cv.onpointermove = (e) => {
            if (st === 'cup') return cupMove(e);
            if (st === 'coffee') return kMove(e);
            if (st === 'burger') return bgMove(e);
            if (!mode) return; const q = fit(mode === 'pipe' ? pt(e) : ground(pt(e))), d = Math.hypot(q[0] - last[0], q[1] - last[1]);
            if (mode === 'drag') { { cur.x = q[0]; cur.y = q[1]; cur.lv = creamTop(q[0], q[1]) + 1; touch(); } return; }
            if (mode === 'scatter') { if (d > 13) { last = q; for (let k = 0; k < 3; k++) addPiece(t, q, 22); } return; }
            if (d < 3) return;
            const n = Math.ceil(d / 3), now = performance.now();
            for (let i = 1; i <= n; i++) {     // 補中間的點，手指劃再快也是連續一條
              const x = last[0] + (q[0] - last[0]) * i / n, y = last[1] + (q[1] - last[1]) * i / n;
              if (mode === 'sauce') cur.pts.push({ x, y, w: t.w, b: now, g: 1, lv: creamTop(x, y) + 1 });
              else cur.pts.push({ x, y, w: t.w, lv: cur.pts[0].lv });   // 一筆從頭到尾都在同一層（按下去那一刻決定）；要疊高就放開、在奶油上再按一次
            }
            last = q; touch(400);
          };
          const end = (e) => { if (st === 'cup') return cupUp(e); if (st === 'coffee') { kPtr = null; return; } if (st === 'burger') { bgPtr = null; return; } clearInterval(hold); mode = null; };
          cv.onpointerup = end; cv.onpointercancel = end;
        }

        // ── 盤面、料盤、按鈕 ──
        function buildTray() {
          $('src').innerHTML = [st].concat(Object.keys(SRC).filter(k => k !== st)).map(k => '<button data-src="' + k + '" class="' + (k === traySrc ? 'on' : '') + '">' + (k === st ? '這一檯' : SRC[k]) + '</button>').join('');
          $('tray').innerHTML = ST[traySrc].tray.map(t => '<button class="ock-ing' + (t.id === pick ? ' on' : '') + '" data-id="' + t.id + '"><canvas width="80" height="80"></canvas>' + t.name + '</button>').join('');
          $('tray').scrollLeft = 0;
          root.querySelectorAll('.ock-ing').forEach(b => {     // 料盤上的小圖也是同一支畫出來的，跟盤子上的長一樣
            const t = tool(b.dataset.id), c = b.firstChild.getContext('2d'); c.scale(2, 2);
            if (/^c(top|ice|liq|cap)$/.test(t.kind)) return drawCupIcon(c, t);
            if (t.kind === 'kf') return kIcon(c, t);
            if (t.kind === 'bg') return bgIcon(c, t);
            if (t.kind === 'pipe') { const keep = S; S = { cream: [{ t, pts: [] }] }; for (let i = 0; i <= 8; i++) S.cream[0].pts.push({ x: 9 + i * 2.8, y: 24 - Math.sin(i / 8 * 3.14) * 5, w: i === 8 ? 17 : 11, lv: 0 }); const tt = Object.assign({}, t, { w: 11 }); S.cream[0].t = tt; drawCreamLevel(c, runs()); S = keep; }
            else if (t.kind === 'sauce') { c.lineCap = 'round'; [[t.rim, 15, 0], [t.col, 12, 0]].forEach(([col, w, o]) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(11 + o * .3, 24 + o); c.quadraticCurveTo(20, 12 + o, 29, 20 + o); c.stroke(); }); }
            else if (t.kind === 'scatter') { for (let i = 0; i < 9; i++) drawPiece(c, t.id, 8 + rnd(i) * 24, 12 + rnd(i + 7) * 18, 6, i * 3.3); }
            else drawPiece(c, t.id, 20, t.id === 'straw' || t.id === 'terichk' ? 28 : t.id === 'mintleaf' ? 30 : 22, Math.min(13, (t.r || 10)), 4);
          });
        }
        function build() {
          S = { sauce: [], cream: [], pcs: [], hist: [], baked: null, busy: false, seed: Math.random() * 100 };
          area = mkArea(); pick = null;
          $('hint').textContent = ST[st].hint;
          traySrc = st; buildTray();
          if (st === 'coffee') kInit();
          if (st === 'burger') bgInit();
          if (st === 'cup') cupInit();
          actBar();
          $('oven').classList.remove('on'); $('meter').classList.remove('on'); $('res').classList.remove('on'); $('dish').classList.remove('in-oven');
          touch(); api.built();
        }
        function actBar() {   // 下面那排鈕（烤完回來也叫它重排）
          const pizza = st === 'pizza';
          $('act').innerHTML = '<button class="ock-ghost" data-ok="undo"><i class="fa-solid fa-rotate-left"></i> 上一步</button><button class="ock-ghost" data-ok="clr">重來</button><button data-ok="go">' + (pizza ? '<i class="fa-solid fa-fire-burner"></i> 送進烤箱' : '<i class="fa-solid fa-bell-concierge"></i> 完成') + '</button>';
          $('undo').onclick = () => { const h = S.hist.pop(); if (!h) return; const a = S[h.k], i = a.indexOf(h.o); if (i >= 0) a.splice(i, 1); touch(); };
          $('clr').onclick = build;
          if (st === 'coffee') $('undo').onclick = kUndo;
          if (st === 'burger') { $('undo').onclick = () => { bgUndo(); touch(400); }; $('go').insertAdjacentHTML('beforebegin', '<button class="ock-ghost" data-ok="toast"><i class="fa-solid fa-fire-burner"></i> 烤一下</button>'); $('toast').onclick = toastBurger; }
          if (st === 'cup') { $('undo').innerHTML = '<i class="fa-solid fa-rotate-left"></i>'; $('undo').onclick = cupUndo; $('go').insertAdjacentHTML('beforebegin', '<button class="ock-ghost" data-ok="shk"><i class="fa-solid fa-arrows-left-right"></i> 搖一搖</button>'); $('shk').onclick = cupShakeToggle; }
          $('go').onclick = () => { if (!api.can()) return; if (pizza) bake(); else api.done(); };   // 空盤、錢不夠先講；做好交給外面扣錢、試吃
        }
        root.addEventListener('click', (e) => {
          const b = e.target.closest('.ock-ing'); if (b) { pick = b.dataset.id; root.querySelectorAll('.ock-ing').forEach(x => x.classList.toggle('on', x === b)); }
          const sc = e.target.closest('[data-src]'); if (sc) { traySrc = sc.dataset.src; buildTray(); }
          const s = e.target.closest('[data-st]'); if (s) { if (S && S.busy) return; if (api.locked(s.dataset.st)) { api.unlock(s.dataset.st); return; } st = s.dataset.st; root.querySelectorAll('[data-st]').forEach(x => x.classList.toggle('on', x === s)); build(); }
        });
        // 做好的這一盤 → 一張去背圖（封面和端盤子用同一張）
        let snapping = false;   // 存照片的那一下：旁邊的鋼杯這種「工具」不入鏡
        function snapshot() { const o = doc.createElement('canvas'); o.width = W * 2; o.height = H * 2; const c = o.getContext('2d'); c.scale(2, 2); c._px = 2; snapping = true; render(c, performance.now() + 9999); snapping = false; return o; }
        function finish() { api.done(); }
        function bake() {
          if (!S.sauce.length) { $('hint').textContent = '先抹一層醬再進烤箱'; return; }
          S.busy = true;
          $('ovenImg').src = opts.oven.open; $('oven').classList.add('on'); $('dish').classList.add('in-oven');
          setTimeout(() => { $('ovenImg').src = opts.oven.closed; $('glow').classList.add('on'); }, 650);
          $('act').innerHTML = '<button data-ok="out"><i class="fa-solid fa-hand"></i> 拿出來</button>';
          $('hint').textContent = '烤到綠色那段拿出來剛剛好。太早還沒熟，太晚會焦。';
          $('meter').classList.add('on');
          let v = 0, over = false; const bar = $('meterBar');
          const tick = setInterval(() => { v += 1.2; bar.style.width = Math.min(100, v) + '%'; if (v >= 100) done(); }, 80);
          function done() {
            if (over) return; over = true; clearInterval(tick);
            $('glow').classList.remove('on'); $('ovenImg').src = opts.oven.open;
            S.bakeV = Math.round(Math.min(v, 100)); S.baked = v < 55 ? 'raw' : v <= 75 ? 'good' : 'burnt'; touch();
            $('dish').classList.remove('in-oven'); $('meter').classList.remove('on');
            setTimeout(() => { $('oven').classList.remove('on'); finish(S.baked === 'raw' ? '還沒熟……' : S.baked === 'good' ? '烤得剛剛好！' : '烤焦了 xD', '烤到 ' + Math.round(Math.min(v, 100)) + '%（剛好是 55～75%）'); }, 800);
          }
          $('out').onclick = done;
        }
        // 漢堡「烤一下」：現在疊好的每一層一起進烤箱（之後再疊上去的是新鮮的）。烤的熱度累加：烤兩次就焦了
        const heatOf = (h) => !h ? null : h < 55 ? 'raw' : h <= 75 ? 'good' : 'burnt';
        function toastBurger() {
          if (S.busy || !BG) return;
          if (api.locked('pizza')) { api.unlock('pizza'); return; }   // 跟披薩同一台烤箱，沒買先問
          if (BG.layers.length < 2) { $('hint').textContent = '先疊點料再烤'; return; }
          S.busy = true;
          $('ovenImg').src = opts.oven.open; $('oven').classList.add('on'); $('dish').classList.add('in-oven');
          setTimeout(() => { $('ovenImg').src = opts.oven.closed; $('glow').classList.add('on'); }, 650);
          $('act').innerHTML = '<button data-ok="out"><i class="fa-solid fa-hand"></i> 拿出來</button>';
          $('hint').textContent = '烤到綠色那段拿出來：麵包金黃、起司剛好融化。太早只是溫溫的，太晚會焦。';
          $('meter').classList.add('on');
          let v = 0, over = false; const bar = $('meterBar');
          const tick = setInterval(() => { v += 1.6; bar.style.width = Math.min(100, v) + '%'; if (v >= 100) done(); }, 80);
          function done() {
            if (over) return; over = true; clearInterval(tick);
            const add = Math.round(Math.min(v, 100));
            BG.ops.push({ toast: BG.layers.map(l => l.heat || 0) });
            BG.layers.forEach(l => { l.heat = (l.heat || 0) + add; });
            const hs = heatOf(Math.max(...BG.layers.map(l => l.heat || 0)));
            $('glow').classList.remove('on'); $('ovenImg').src = opts.oven.open; $('dish').classList.remove('in-oven'); $('meter').classList.remove('on'); touch(900);
            setTimeout(() => {
              if (!root.isConnected) return;
              $('oven').classList.remove('on'); S.busy = false; actBar(); api.built();
              $('hint').textContent = hs === 'good' ? '烤好了：麵包金黃、起司融化。可以接著疊，或按完成。' : hs === 'burnt' ? '烤焦了 xD（這次烤到 ' + add + '%，剛好是 55～75%；再烤會更焦）' : '只烤到溫溫的（' + add + '%，剛好是 55～75%），可以再烤一下';
            }, 800);
          }
          $('out').onclick = done;
        }
        // ══ 手搖杯：透明杯。料沉在杯底、茶和奶倒進去顏色真的混在一起、汽水會冒泡、濃的看不到底下的料、搖一搖混勻起泡 ══
        const LIQ = { tea: { rgb: [172, 92, 40], a: .6, milky: [204, 160, 112] }, green: { rgb: [168, 186, 82], a: .5, milky: [216, 210, 162] }, milk: { rgb: [250, 244, 232], a: .97 }, berry: { rgb: [226, 74, 104], a: .88 }, soda: { rgb: [190, 230, 244], a: .3, fizz: 1 } };
        const CUP = { x: 200, b: { cy: 258, rx: 41, ry: 16 }, t: { cy: 80, rx: 62, ry: 25 } };   // 手搖店那種瘦高的杯子
        const CPAL = ['#ff7fa0', '#ffc24f', '#6fc8f2', '#9adf74', '#b996f5'];
        let C = null, cupHist = [], cupPtr = null, cupT = 0, cupClouds = [], cupCloudT = 0;
        function cupInit() { cupClouds = []; C = { adds: [], ice: 0, liq: [], level: 0, mixed: 1, froth: 0, foam: false, cream: false, scoop: false, sealed: false, shake: false, off: 0 }; cupHist = []; cupPtr = null; }
        const cupAt = (t) => ({ cy: CUP.b.cy + (CUP.t.cy - CUP.b.cy) * t, rx: CUP.b.rx + (CUP.t.rx - CUP.b.rx) * t, ry: CUP.b.ry + (CUP.t.ry - CUP.b.ry) * t });
        const cupTotal = () => C.liq.reduce((a, l) => a + l.amt, 0);
        function cupSave() { cupHist.push(JSON.stringify(C)); if (cupHist.length > 40) cupHist.shift(); }
        function cupUndo() { const h = cupHist.pop(); if (h) { const sh = C.shake; C = JSON.parse(h); C.off = 0; C.shake = sh; } }
        function cupShakeToggle() { C.shake = !C.shake; $('shk').classList.toggle('on', C.shake); $('hint').textContent = C.shake ? '按住杯子左右拖，搖到顏色混勻。再按一次「搖一搖」回去加料。' : ST.cup.hint; }
        function cupPiece(c, id, x, y, k, seed) {
          const E = (ex, ey, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 6.2832); c.fill(); };
          if (id === 'pearl') { E(x, y + 1, 6 * k, 6 * k, '#241510'); E(x, y, 6 * k, 6 * k, '#3d261a'); E(x - 1.8 * k, y - 2 * k, 2 * k, 1.3 * k, '#8a644c'); }
          else if (id === 'cpearl') { const col = CPAL[Math.floor(rnd(seed) * CPAL.length)]; c.globalAlpha *= .9; E(x, y, 5.2 * k, 5.2 * k, col); c.globalAlpha /= .9; E(x - 1.5 * k, y - 1.8 * k, 1.8 * k, 1.1 * k, '#ffffff'); }
          else if (id === 'pudding') {      // 布丁：整顆小布丁／挖下來的一坨／切開的一角，大小也不一樣
            const v = Math.floor(rnd(seed + 7) * 3), z = k * (.75 + rnd(seed + 4) * .6);
            if (v === 0) { c.fillStyle = '#e2ae36'; c.beginPath(); c.moveTo(x - 9 * z, y - 2 * z); c.lineTo(x + 9 * z, y - 2 * z); c.lineTo(x + 7.5 * z, y + 7 * z); c.quadraticCurveTo(x, y + 9.5 * z, x - 7.5 * z, y + 7 * z); c.closePath(); c.fill(); E(x, y - 2 * z, 9 * z, 3.8 * z, '#fbe08a'); E(x, y - 2.6 * z, 4.2 * z, 1.5 * z, '#a8642a'); }
            else if (v === 1) { E(x, y + 2 * z, 10 * z, 7 * z, '#e2ae36'); E(x - 1 * z, y, 9.5 * z, 6.2 * z, '#f7d667'); E(x - 3 * z, y - 2.2 * z, 5 * z, 2.4 * z, '#fde9a2'); E(x + 4 * z, y + 1.5 * z, 3 * z, 1.4 * z, '#b8742e'); }
            else { c.fillStyle = '#e2ae36'; c.beginPath(); c.moveTo(x - 9 * z, y + 6 * z); c.lineTo(x + 8 * z, y + 7 * z); c.lineTo(x + 5 * z, y - 5 * z); c.closePath(); c.fill(); c.fillStyle = '#f9dc7c'; c.beginPath(); c.moveTo(x - 9 * z, y + 4 * z); c.lineTo(x + 7 * z, y + 4.5 * z); c.lineTo(x + 5 * z, y - 6 * z); c.closePath(); c.fill(); c.fillStyle = '#a8642a'; c.beginPath(); c.moveTo(x + 1 * z, y - 3.5 * z); c.lineTo(x + 6.4 * z, y - 2 * z); c.lineTo(x + 5 * z, y - 6 * z); c.closePath(); c.fill(); }
          }
          else if (id === 'grass' || id === 'coco') {      // 仙草、椰果：方塊／長條／扁片，大小不一，稍微歪一點
            const g = id === 'grass', z = k * (g ? .7 + rnd(seed + 4) * .9 : .8 + rnd(seed + 4) * .5), w = (g ? 6 : 5) * z * (.75 + rnd(seed + 5) * .9), h = (g ? 6 : 5) * z * (.6 + rnd(seed + 6) * .8), sk = (rnd(seed + 8) - .5) * w * .5;
            c.fillStyle = g ? '#221c19' : 'rgba(236,240,238,.92)'; c.beginPath(); c.moveTo(x - w, y - h * .3); c.lineTo(x + w, y - h * .3); c.lineTo(x + w * .92, y + h * 1.2); c.lineTo(x - w * .92, y + h * 1.2); c.closePath(); c.fill();
            c.fillStyle = g ? '#4a3f39' : '#ffffff'; c.beginPath(); c.moveTo(x - w, y - h * .3); c.lineTo(x - w + sk, y - h * 1.15); c.lineTo(x + w + sk, y - h * 1.15); c.lineTo(x + w, y - h * .3); c.closePath(); c.fill();
            c.fillStyle = g ? '#7a6b62' : 'rgba(190,205,205,.9)'; c.fillRect(x - w * .6 + sk * .6, y - h * .95, w * .7, Math.max(1, h * .16));
          }
        }
        function cupIce(c, x, y, k) { c.fillStyle = 'rgba(214,236,246,.72)'; c.fillRect(x - 9 * k, y - 4 * k, 18 * k, 12 * k); c.fillStyle = 'rgba(244,252,255,.9)'; c.fillRect(x - 9 * k, y - 10 * k, 18 * k, 7 * k); c.fillStyle = '#ffffff'; c.fillRect(x - 6.5 * k, y - 8.5 * k, 6 * k, 1.8 * k); c.strokeStyle = 'rgba(150,190,210,.6)'; c.lineWidth = 1; c.strokeRect(x - 9 * k, y - 10 * k, 18 * k, 18 * k); }
        function cupCream(c, x, y, k) {
          const E = (ey, rx, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, ey, rx, rx * .5, 0, 0, 6.2832); c.fill(); };
          [[0, 32], [-13, 24], [-25, 15]].forEach(([o, r]) => { E(y + o * k + 5 * k, r * k, '#d9c6a4'); E(y + o * k + 2.5 * k, r * k, '#eee0c6'); E(y + o * k, r * k, '#fffdf8'); });
          c.fillStyle = '#fffdf8'; c.beginPath(); c.moveTo(x - 8 * k, y - 28 * k); c.quadraticCurveTo(x - 1 * k, y - 50 * k, x + 6 * k, y - 46 * k); c.quadraticCurveTo(x + 2 * k, y - 38 * k, x + 9 * k, y - 28 * k); c.closePath(); c.fill();
        }
        function cupScoop(c, x, y, k) {
          const E = (ex, ey, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 6.2832); c.fill(); };
          for (let i = 0; i < 7; i++) { const a = 3.5 + i * .4; E(x + Math.cos(a + 3.14) * 25 * k, y + 14 * k + Math.abs(Math.sin(i * 1.3)) * 3 * k, 7 * k, 5 * k, '#e58aa0'); }
          E(x, y, 28 * k, 27 * k, '#e58aa0'); E(x - 2 * k, y - 3 * k, 26 * k, 24 * k, '#f6b0c0'); E(x - 6 * k, y - 8 * k, 18 * k, 15 * k, '#fac6d1'); E(x - 11 * k, y - 13 * k, 6 * k, 3.5 * k, '#ffffff');
          [[8, 2], [-4, 9], [14, -8], [-14, 0]].forEach(([dx, dy]) => E(x + dx * k, y + dy * k, 1.8 * k, 1.4 * k, '#d9647e'));
        }
        function drawCupIcon(c, t) {
          if (t.kind === 'ctop') { for (let i = 0; i < 5; i++) cupPiece(c, t.id, 10 + (i % 3) * 10 + (i > 2 ? 5 : 0), 15 + Math.floor(i / 3) * 11, .85, i * 2.7); }
          else if (t.kind === 'cice') cupIce(c, 20, 22, 1.1);
          else if (t.kind === 'cliq') { const q = LIQ[t.id], col = 'rgb(' + q.rgb.join(',') + ')'; c.fillStyle = 'rgb(' + q.rgb.map(v => Math.round(v * .72)).join(',') + ')'; c.beginPath(); c.moveTo(20, 4); c.bezierCurveTo(34, 20, 33, 37, 20, 37); c.bezierCurveTo(7, 37, 6, 20, 20, 4); c.fill(); c.fillStyle = col; c.beginPath(); c.moveTo(20, 7); c.bezierCurveTo(31, 21, 30, 34, 20, 34); c.bezierCurveTo(10, 34, 9, 21, 20, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(15.5, 24, 2, 4, .3, 0, 6.2832); c.fill(); }
          else if (t.id === 'foam') { c.fillStyle = '#e2d2b0'; c.beginPath(); c.ellipse(20, 25, 15, 8, 0, 0, 6.2832); c.fill(); c.fillStyle = '#fffaf0'; c.beginPath(); c.ellipse(20, 20, 15, 8, 0, 0, 6.2832); c.fill(); }
          else if (t.id === 'ccream') cupCream(c, 20, 30, .48); else cupScoop(c, 20, 21, .5);
        }
        const cupSoftMap = new Map();
        function cupSoft(p, tt) {      // 一塊料的羽化版：中間實、邊緣淡出去；每塊只畫一次
          const key = p.id + ':' + p.seed; let cv = cupSoftMap.get(key); if (cv) return cv;
          cv = doc.createElement('canvas'); cv.width = cv.height = 120; const x = cv.getContext('2d'); x.scale(3, 3);
          if (tt && tt.kind === 'ctop') cupPiece(x, p.id, 20, 20, 1, p.seed); else drawAny(x, tt, 20, 24, .5, p.seed);
          const d = x.getImageData(0, 0, 120, 120).data; let R = 0, sx = 0, sy = 0, n = 0;
          for (let j = 0; j < 120; j += 2) for (let i = 0; i < 120; i += 2) if (d[(j * 120 + i) * 4 + 3] > 40) { sx += i; sy += j; n++; }
          const cx = n ? sx / n : 60, cy = n ? sy / n : 60;
          for (let j = 0; j < 120; j += 2) for (let i = 0; i < 120; i += 2) if (d[(j * 120 + i) * 4 + 3] > 40) R = Math.max(R, Math.hypot(i - cx, j - cy));
          R = Math.max(9, R) / 3; const g = x.createRadialGradient(cx / 3, cy / 3, R * .35, cx / 3, cy / 3, R * 1.05); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.6, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          x.globalCompositeOperation = 'destination-in'; x.fillStyle = g; x.fillRect(0, 0, 40, 40);
          if (cupSoftMap.size > 400) cupSoftMap.clear(); cupSoftMap.set(key, cv); return cv;
        }
        function cupTick(now) {
          const dt = Math.min(.05, (now - (cupT || now)) / 1000); cupT = now; if (!C) return;
          if (cupPtr && cupPtr.pour && C.level < .9) {      // 按住＝一直倒；新倒進來的還沒混開，所以整杯「混勻的程度」會被沖淡
            const tot = cupTotal(), d = dt * .3, last = C.liq[C.liq.length - 1];
            if (last && last.id === cupPtr.pour) last.amt += d; else C.liq.push({ id: cupPtr.pour, amt: d });
            C.mixed = C.liq.length > 1 ? Math.max(.2, C.mixed * tot / (tot + d)) : 1; C.level = Math.min(.9, tot + d);
            const q = LIQ[cupPtr.pour];
            if (q.a > .8 && tot > .04 && now - cupCloudT > 40) { cupCloudT = now; const px = Math.max(CUP.x - 40, Math.min(CUP.x + 40, cupPtr.x - C.off)); cupClouds.push({ x: px, t0: now, life: 2200 + Math.random() * 1800, dep: .35 + Math.random() * .65, sz: .6 + Math.random() * .8, sd: Math.random(), rgb: q.rgb.join(',') }); }
          }
          if (!(cupPtr && cupPtr.drag)) C.off *= .82;
        }
        function renderCup(c, now) {
          if (!C) return;
          const X = CUP.x, B = CUP.b, T = CUP.t, tot = cupTotal(), L = C.level, sf = cupAt(L), E = (ex, ey, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 6.2832); c.fill(); };
          E(X + 4, B.cy + 12, B.rx * 1.3, B.ry * 1.05, 'rgba(0,0,0,.15)');
          c.save(); c.translate(X + C.off, B.cy + B.ry); c.rotate(C.off * .0035); c.translate(-X, -(B.cy + B.ry));
          const body = new Path2D(); body.moveTo(X - T.rx, T.cy); body.lineTo(X - B.rx, B.cy); body.ellipse(X, B.cy, B.rx, B.ry, 0, Math.PI, 0, true); body.lineTo(X + T.rx, T.cy); body.ellipse(X, T.cy, T.rx, T.ry, 0, 0, Math.PI, true); body.closePath();
          c.fillStyle = 'rgba(255,255,255,.22)'; c.fill(body); E(X, T.cy, T.rx, T.ry, 'rgba(255,255,255,.14)');
          c.save(); c.clip(body);
          // 料：一排一排堆在杯底，剛放的從上面掉下來
          const span = B.cy - T.cy, pos = []; let rows = 0;
          C.adds.forEach((p, i) => { const row = Math.floor(i / 6), col = i % 6, g = cupAt(Math.min(.9, row * 9 / span)); rows = row + 1;
            const x = X + (((col + (row % 2 ? .5 : 0) + .5) / 6.5) - .5) * 2 * g.rx * .84 + (rnd(p.seed) - .5) * 5, y = g.cy + (rnd(p.seed + 1) - .35) * g.ry * .7, e = Math.min(1, (now - p.b) / 420);
            const tt = tool(p.id), yy = T.cy - 14 + (y - T.cy + 14) * e * e; pos.push([p, tt, x, yy]); if (tt && tt.kind === 'ctop') cupPiece(c, p.id, x, yy, 1, p.seed); else drawAny(c, tt, x, yy + 4, .5, p.seed); });
          // 飲料：每一種倒進來的先各佔一段，段跟段之間是暈開的；搖越多次整杯越接近同一個顏色。濃的（牛奶、果醬）不透明，蓋住底下的料
          let avg = [0, 0, 0], avgA = 0, fizz = 0;
          if (tot > 0) {
            const fm = C.liq.reduce((a, l) => a + (l.id === 'milk' ? l.amt : 0), 0) / tot;      // 茶遇到奶不是「茶色＋白」平均，而是變成米色：紅茶偏深米、綠茶偏淡米
            C.liq.forEach(l => { const q = LIQ[l.id], w = l.amt / tot, kk = q.milky ? Math.min(1, fm * 3) : 0; avg = avg.map((v, i) => v + (q.rgb[i] + ((q.milky || q.rgb)[i] - q.rgb[i]) * kk) * w); avgA += q.a * w; fizz += (q.fizz || 0) * w; });
            avgA += (.97 - avgA) * Math.min(1, fm * 2.5);     // 加了奶就不透明，一點點奶就夠
            const m = C.mixed, colOf = (q) => 'rgba(' + q.rgb.map((v, i) => Math.round(v + (avg[i] - v) * m)).join(',') + ',' + (q.a + (avgA - q.a) * m).toFixed(3) + ')';
            const g = c.createLinearGradient(0, B.cy + B.ry, 0, sf.cy); let cum = 0;
            g.addColorStop(0, colOf(LIQ[C.liq[0].id])); C.liq.forEach(l => { g.addColorStop(Math.min(1, (cum + l.amt / 2) / tot), colOf(LIQ[l.id])); cum += l.amt; }); g.addColorStop(1, colOf(LIQ[C.liq[C.liq.length - 1].id]));
            const lp = new Path2D(); lp.moveTo(X - sf.rx, sf.cy); lp.lineTo(X - B.rx, B.cy); lp.ellipse(X, B.cy, B.rx, B.ry, 0, Math.PI, 0, true); lp.lineTo(X + sf.rx, sf.cy); lp.ellipse(X, sf.cy, sf.rx, sf.ry, 0, 0, Math.PI, false); lp.closePath();
            c.fillStyle = g; c.fill(lp);
            // 濃的東西（牛奶、果醬）倒進水裡：一團一團往下沉、越沉越大越淡，像墨水在水裡散開；整杯越濃，散得越慢
            c.save(); c.clip(lp);
            const thick = Math.max(0, (avgA - .3) / .67);
            cupClouds = cupClouds.filter(q => now - q.t0 < q.life);
            cupClouds.forEach(q => { const a = (now - q.t0) / q.life, dep = (B.cy + B.ry - sf.cy) * q.dep, x = q.x + Math.sin(q.sd * 9 + a * 3) * 16 * a + (q.sd - .5) * 40 * a, y = sf.cy + 4 + dep * (1 - Math.pow(1 - a, 2)), r = 10 + a * 38 * q.sz;
              feather(c, x, y, r, q.rgb, (1 - a) * .85); feather(c, x + Math.cos(q.sd * 20) * r * .6, y - r * .5, r * .65, q.rgb, (1 - a) * .6); });
            c.restore();
            if (thick > .05) { c.save(); c.clip(lp); c.globalAlpha = Math.min(1, thick * 1.5) * .9; pos.forEach(q => { const sp = cupSoft(q[0], q[1]); c.drawImage(sp, q[2] - 20, q[3] - 20, 40, 40); }); c.restore(); }   // 濃的飲料：料貼著杯壁透出來，邊緣暈進飲料裡
            for (let i = 0, n = Math.round(fizz * 30); i < n; i++) {       // 汽水的泡泡：從底下往上冒
              const ph = (now / ((1700 + rnd(i) * 1600) * (1 + thick * 2.2)) + rnd(i + 5)) % 1, gg = cupAt(ph * L), r = 1.4 + rnd(i + 9) * 2;
              c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1; c.beginPath(); c.arc(X + (rnd(i + 2) * 2 - 1) * gg.rx * .8 + Math.sin(now / 300 + i) * 1.5, gg.cy + gg.ry * .5, r, 0, 6.2832); c.stroke();
            }
            const top = C.liq[C.liq.length - 1], tq = LIQ[top.id], k = .22 + .45 * C.froth;
            E(X, sf.cy, sf.rx, sf.ry, 'rgba(' + tq.rgb.map((v, i) => { const b = v + (avg[i] - v) * m; return Math.round(b + (255 - b) * k); }).join(',') + ',' + Math.min(1, avgA + .25).toFixed(2) + ')');
            for (let i = 0, n = Math.round(C.froth * 26); i < n; i++) { const a = rnd(i + 30) * 6.28, d = .55 + rnd(i + 31) * .42; c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(X + Math.cos(a) * sf.rx * d, sf.cy + Math.sin(a) * sf.ry * d, 1.6 + rnd(i + 32) * 2.2, 0, 6.2832); c.fill(); }   // 搖出來的泡
          }
          // 冰塊：浮在水面；杯子裡還沒有水就先落在料上
          const fl = tot > .02 ? sf : cupAt(Math.min(.9, rows * 9 / span));
          if (tot > .02) {
            const ic = avg.map((v, i) => Math.round(v * .8 * avgA + [222, 238, 246][i] * (1 - avgA)));     // 濃的飲料裡冰塊是比較深的影子，清的飲料裡是透亮的方塊
            for (let i = C.ice - 1; i >= 0; i--) {
              const row = Math.floor(i / 3), col = i % 3, x = X + (col - 1) * sf.rx * .56 + (rnd(i + 60) - .5) * 10, y = row ? sf.cy + sf.ry + 2 + (row - 1) * 19 + rnd(i + 61) * 8 : sf.cy + 3 + Math.sin(now / 700 + i) * 1, rot = (rnd(i + 62) - .5) * 1.1;
              if (y > B.cy - 14) continue;
              c.save(); c.translate(x, y); c.rotate(rot);
              c.fillStyle = 'rgba(' + ic.join(',') + ',' + (row ? .62 : .5) + ')'; c.fillRect(-10, -10, 20, 20);
              c.strokeStyle = 'rgba(255,255,255,' + (row ? .5 : .9) + ')'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-10, 10); c.lineTo(-10, -10); c.lineTo(10, -10); c.stroke();
              if (!row) { c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(-10, -10, 20, 9); c.fillStyle = '#ffffff'; c.fillRect(-7, -8, 7, 2); }      // 冒出水面的那一截比較白
              c.restore();
            }
          } else for (let i = 0; i < C.ice; i++) cupIce(c, X + ((i % 3) - 1) * fl.rx * .52 + (rnd(i + 60) - .5) * 8, fl.cy + (Math.floor(i / 3) - .6) * fl.ry * .55 - Math.floor(i / 3) * 5, 1);
          let cap = sf;
          if (C.foam) {       // 奶蓋：厚厚一層浮在最上面，下緣有幾處往下垂
            const s1 = cupAt(Math.min(.98, L + .1)); cap = s1; c.fillStyle = '#f1e2c2';
            for (let i = 0; i < 6; i++) { const a = .35 + i * .49; c.beginPath(); c.arc(X + Math.cos(a) * sf.rx * .92, sf.cy + Math.sin(a) * sf.ry, 5 + rnd(i + 80) * 5, 0, 6.2832); c.fill(); }
            c.beginPath(); c.moveTo(X - s1.rx, s1.cy); c.lineTo(X - sf.rx, sf.cy); c.ellipse(X, sf.cy, sf.rx, sf.ry, 0, Math.PI, 0, true); c.lineTo(X + s1.rx, s1.cy); c.ellipse(X, s1.cy, s1.rx, s1.ry, 0, 0, Math.PI, false); c.closePath(); c.fill();
            E(X, s1.cy, s1.rx, s1.ry, '#fffaf0');
          }
          c.restore();
          if (C.sealed) { c.lineCap = 'round'; c.strokeStyle = '#d9506e'; c.lineWidth = 12; c.beginPath(); c.moveTo(X + 6, cap.cy + 4); c.lineTo(X + 50, T.cy - 62); c.stroke(); c.strokeStyle = '#f58aa2'; c.lineWidth = 6; c.beginPath(); c.moveTo(X + 4, cap.cy + 4); c.lineTo(X + 48, T.cy - 62); c.stroke(); }   // 搖過＝插上粗吸管
          if (C.cream) cupCream(c, X - (C.scoop ? 24 : 0), cap.cy - 2, 1);
          if (C.scoop) cupScoop(c, X + (C.cream ? 28 : 0), cap.cy - 18, 1);
          // 杯子正面：邊線、杯口、反光
          c.lineCap = 'round'; c.strokeStyle = 'rgba(125,150,170,.55)'; c.lineWidth = 3.5; c.stroke(body); c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 2; c.stroke(body);
          c.strokeStyle = 'rgba(125,150,170,.5)'; c.lineWidth = 3.5; c.beginPath(); c.ellipse(X, T.cy, T.rx, T.ry, 0, 0, Math.PI); c.stroke(); c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.ellipse(X, T.cy, T.rx, T.ry, 0, 0, Math.PI); c.stroke();
          c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 8; c.beginPath(); c.moveTo(X - T.rx * .72, T.cy + 34); c.lineTo(X - B.rx * .74, B.cy - 4); c.stroke();
          c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 4; c.beginPath(); c.moveTo(X + T.rx * .78, T.cy + 40); c.lineTo(X + B.rx * .82, B.cy - 30); c.stroke();
          if (cupPtr && cupPtr.pour) {      // 正在倒：一道水柱
            const q = LIQ[cupPtr.pour], px = Math.max(X - T.rx * .55, Math.min(X + T.rx * .55, cupPtr.x - C.off)); c.fillStyle = 'rgba(' + q.rgb.join(',') + ',' + Math.max(.75, q.a) + ')'; const sw = q.a > .8 ? 13 : 8; c.fillRect(px - sw / 2, -4, sw, sf.cy + 4); E(px, sf.cy, sw * 1.5, sw * .6, q.a > .8 ? 'rgba(' + q.rgb.join(',') + ',.9)' : 'rgba(255,255,255,.55)');
          }
          c.restore();
        }
        function cupDown(e) {
          if (S.busy) return; const q = pt(e), t = tool(pick); e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) {}
          if (C.shake) { cupSave(); cupPtr = { drag: true, x0: q[0], last: q[0] }; return; }
          if (!t) { $('hint').textContent = '先在下面點一樣料'; return; }
          const f = flowOf(t), big = !(t.kind === 'ctop' || t.kind === 'scatter' || isDust(t));
          if (!f && !solidOf(t) && t.kind !== 'ccap') { $('hint').textContent = NOUSE; return; }
          cupSave();
          const drop = (n) => { for (let i = 0; i < n && C.adds.length < 66; i++) C.adds.push({ id: t.id, seed: Math.random() * 1000, b: performance.now() + i * 60 }); };
          if (t.kind === 'ccap') C[t.cap || t.id] = !C[t.cap || t.id];
          else if (t.kind === 'cice') C.ice = Math.min(9, C.ice + 1);
          else if (f) { if (!LIQ[t.id]) LIQ[t.id] = { rgb: toRgb(f[0]), a: t.id === 'water' ? .18 : .93 }; cupPtr = { pour: t.id === 'kmilk' ? 'milk' : t.id, x: q[0] }; }      // 別檯的醬、奶油、咖啡也當成一種飲料倒進來
          else { drop(big || t.id === 'pudding' ? 1 : 4); cupPtr = { rep: setInterval(() => drop(big || t.id === 'pudding' ? 1 : 2), big ? 320 : 150) }; }
        }
        function cupMove(e) {
          if (!cupPtr) return; const q = pt(e);
          if (cupPtr.drag) { const d = Math.abs(q[0] - cupPtr.last); cupPtr.last = q[0]; C.off = Math.max(-46, Math.min(46, q[0] - cupPtr.x0)); C.mixed = Math.min(1, C.mixed + d / 520); C.froth = Math.min(1, C.froth + d / 900); cupClouds.forEach(q => { q.life *= .9; }); if (d > 0) C.sealed = true; }
          else if (cupPtr.pour) cupPtr.x = q[0];
        }
        function cupUp() { if (cupPtr && cupPtr.rep) clearInterval(cupPtr.rep); cupPtr = null; }
        // ══ 咖啡：馬克杯從 45 度看，杯面是一個大橢圓＝拉花的畫布。奶泡的位置用「杯面上的相對座標」記，所以畫出來自動是躺平的 ══
        const MUG = { x: 190, cy: 108, rx: 104, ry: 64 };
        let KF = null, kHist = [], kPtr = null, kT = 0;
        const kLerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), kRgb = (a) => 'rgb(' + a.map(Math.round).join(',') + ')';
        function kInit() { KF = { shot: 0, water: 0, milk: 0, foam: 0, art: [], dust: [], floats: [] }; kHist = []; kPtr = null; }
        function kSave() { kHist.push(JSON.stringify(KF)); if (kHist.length > 40) kHist.shift(); }
        function kUndo() { const h = kHist.pop(); if (h) KF = JSON.parse(h); }
        const kFill = () => Math.min(1, Math.min(KF.shot, 1.3) * .3 + KF.water + KF.milk);
        function kSurf() { const d = 1 - kFill(), rx = MUG.rx - 9 - d * 14; return { cy: MUG.cy + 3 + d * 34, rx, ry: rx * .62 }; }
        function kBase() {      // 咖啡的顏色：萃太短偏淡、剛好是深褐、太久變黑；加水變淺；倒了奶整杯慢慢變拿鐵色
          const p = KF.shot / 1.3; let col = p <= 0 ? null : p < .55 ? kLerp([198, 152, 98], [122, 74, 36], p / .55) : p <= .75 ? [110, 64, 30] : kLerp([110, 64, 30], [50, 29, 16], Math.min(1, (p - .75) / .25));
          if (!col) return KF.water > 0 ? kLerp([214, 226, 230], [240, 236, 224], Math.min(1, KF.milk * 3)) : [250, 244, 232];
          col = kLerp(col, [168, 118, 70], Math.min(.6, KF.water * .9));
          return kLerp(col, [208, 164, 118], Math.min(.72, KF.milk * 1.5));
        }
        function kSummary() {
          const p = KF.shot / 1.3, f = KF.foam / 1.3;
          return '咖啡：' + (p <= 0 ? '沒萃' : p < .55 ? '偏淡' : p <= .75 ? '剛剛好' : '偏苦') + '　奶泡：' + (f <= 0 ? '沒打' : f < .55 ? '還很粗' : f <= .75 ? '綿密' : '打過頭');
        }
        function kPush(u, v, k, skip) {      // 奶泡落下的地方會把旁邊先畫好的白往外推（所以來回搖會一層一層）
          KF.art.forEach(s => { const n = s === skip ? (s.dots ? 0 : s.pts.length - 8) : s.pts.length; for (let i = 0; i < n; i++) { const q = s.pts[i], du = q.u - u, dv = q.v - v, d = Math.hypot(du, dv); if (d < .5 && d > .001) { const f = (.5 - d) * k / d; q.u += du * f; q.v += dv * f; const r = Math.hypot(q.u, q.v); if (r > .97) { q.u *= .97 / r; q.v *= .97 / r; } } } });
        }
        function kPushOne(o, u, v, k) { o.pts.forEach(q => { const du = q.u - u, dv = q.v - v, d = Math.hypot(du, dv); if (d < .3 && d > .001) { const f = (.3 - d) * k / d; q.u += du * f; q.v += dv * f; } }); }
        function kUnit(e) { const q = pt(e), s = kSurf(); let u = (q[0] - MUG.x) / s.rx, v = (q[1] - s.cy) / s.ry; const r = Math.hypot(u, v); if (r > .94) { u *= .94 / r; v *= .94 / r; } return [u, v, q[0], q[1]]; }
        function kDust(id, u, v) { for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * .17, x = u + Math.cos(a) * r, y = v + Math.sin(a) * r; if (x * x + y * y < .94) KF.dust.push({ u: x, v: y, id }); } if (KF.dust.length > 900) KF.dust.splice(0, KF.dust.length - 900); }
        function kTick(now) {
          const dt = Math.min(.05, (now - (kT || now)) / 1000); kT = now; if (!KF) return;
          const show = (pick === 'espresso' || pick === 'steam') && !$('res').classList.contains('on'); $('meter').classList.toggle('on', show);
          if (show) $('meterBar').style.width = Math.min(100, (pick === 'espresso' ? KF.shot : KF.foam) / 1.3 * 100) + '%';
          if (!kPtr) return;
          if (kPtr.tool === 'espresso') KF.shot = Math.min(1.3, KF.shot + dt * .3);
          else if (kPtr.tool === 'steam') KF.foam = Math.min(1.3, KF.foam + dt * .34);
          else if (kPtr.tool === 'water') { if (kFill() < 1) KF.water += dt * .26; }
          else if (kPtr.tool === 'milk') { if (kPtr.vol && kFill() < 1) KF.milk += dt * .13; kPtr.still = kPtr.moved ? 0 : (kPtr.still || 0) + dt;
            if (kPtr.still > .25) {      // 停著倒＝白的一圈一圈往外長成一大坨（是很多小點組成的，所以拉花針劃過去會變形）
              if (!kPtr.blob) { kPtr.blob = { q: kPtr.stroke.q, w0: kPtr.stroke.w0, col: kPtr.stroke.col, dots: true, pts: [] }; KF.art.push(kPtr.blob); }
              const bl = kPtr.blob; for (let j = 0; j < 3 && bl.pts.length < 520; j++) { const n = bl.pts.length, a = n * 2.39996, r = .0165 * Math.sqrt(n); bl.pts.push({ u: kPtr.last[0] + Math.cos(a) * r, v: kPtr.last[1] + Math.sin(a) * r, w: bl.w0 * 1.25 }); }
              kPush(kPtr.last[0], kPtr.last[1], dt * .9, bl);
            }
            kPtr.moved = false; }
        }
        function kDown(e) {
          if (S.busy) return; const t = tool(pick); e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) {}
          if (!t) { $('hint').textContent = '先在下面點一樣'; return; }
          if ((t.id === 'cocoa' || t.id === 'cinnamon' || !(t.kind === 'kf')) && kFill() <= 0) { $('hint').textContent = '杯子還是空的，先萃取或加熱水'; return; }
          const key = t.k || t.id, f = flowOf(t), own = key === 'espresso' || key === 'steam' || key === 'water' || key === 'pick';
          if (!own && key !== 'milk' && !f && !solidOf(t)) return;
          kSave(); const [u, v, px, py] = kUnit(e);
          if (own) kPtr = { tool: key, last: [u, v] };
          else if (key === 'milk' || f) { const w0 = .085 * (.8 + .4 * Math.min(1, KF.foam)), stroke = { q: key === 'milk' ? KF.foam : .9, w0, pts: [{ u, v, w: w0 }] }; if (key !== 'milk') { stroke.col = toRgb(f[0]); stroke.id = t.id; } KF.art.push(stroke); kPtr = { tool: 'milk', stroke, last: [u, v], px, py, vol: key === 'milk' }; }      // 別檯的醬、奶油也能拿來在杯面上畫，顏色是它自己的
          else if (isDust(t)) { kDust(t.id, u, v); kPtr = { tool: t.id, last: [u, v] }; }
          else { KF.floats.push({ id: t.id, u, v, seed: Math.random() * 100 }); kPtr = null; }      // 一塊一塊的料：浮在杯面上
        }
        function kMove(e) {
          if (!kPtr) return; const [u, v, px, py] = kUnit(e), du = u - kPtr.last[0], dv = v - kPtr.last[1], d = Math.hypot(du, dv);
          if (kPtr.tool === 'milk') { kPtr.px = px; kPtr.py = py; if (d < .025) return; kPtr.moved = true; kPtr.blob = null; const n = Math.ceil(d / .025), s2 = kPtr.stroke; for (let i = 1; i <= n; i++) s2.pts.push({ u: kPtr.last[0] + du * i / n, v: kPtr.last[1] + dv * i / n, w: s2.w0 }); KF.art.forEach(o => { if (o !== s2) kPushOne(o, u, v, .01); }); kPtr.last = [u, v]; }
          else if (kPtr.tool === 'pick') {      // 拉花針：劃過去的地方，附近的白跟著被拖走
            const drag = (q) => { const dd = Math.hypot(q.u - kPtr.last[0], q.v - kPtr.last[1]); if (dd < .26) { const f = 1 - dd / .26; q.u += du * f; q.v += dv * f; } };
            KF.art.forEach(s2 => s2.pts.forEach(drag)); KF.dust.forEach(drag); (KF.floats || []).forEach(drag); kPtr.last = [u, v];
          }
          else if ((kPtr.tool === 'cocoa' || kPtr.tool === 'cinnamon') && d > .06) { kDust(kPtr.tool, u, v); kPtr.last = [u, v]; }
        }
        function kPitcher(c, x, y, now) {      // 打奶泡的鋼杯：泡泡從又大又少，打到又細又密；打過頭又變粗、滿出來
          const f = KF.foam / 1.3, on = kPtr && kPtr.tool === 'steam', jx = on ? Math.sin(now / 28) * 1.2 : 0;
          c.save(); c.translate(x + jx, y);
          c.strokeStyle = '#aab3ba'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.arc(30, 4, 14, -1.2, 1.2); c.stroke();
          c.fillStyle = '#aab3ba'; c.beginPath(); c.moveTo(-24, -28); c.lineTo(-36, -34); c.lineTo(-22, -20); c.closePath(); c.fill();
          c.fillStyle = '#c9d0d6'; c.beginPath(); c.moveTo(-24, -28); c.lineTo(24, -28); c.lineTo(28, 30); c.quadraticCurveTo(0, 38, -28, 30); c.closePath(); c.fill();
          c.fillStyle = '#e6ebee'; c.fillRect(-18, -22, 6, 46);
          c.fillStyle = '#9fa9b1'; c.beginPath(); c.ellipse(0, -28, 24, 8, 0, 0, 6.2832); c.fill();
          c.fillStyle = '#fffaf0'; c.beginPath(); c.ellipse(0, -27 - (f > .75 ? (f - .75) * 20 : 0), 21, 6.5 + (f > .75 ? (f - .75) * 16 : 0), 0, 0, 6.2832); c.fill();
          const r = f <= 0 ? 0 : f < .75 ? Math.max(.9, 4.6 - f * 5) : 1 + (f - .75) * 14, n = f <= 0 ? 0 : Math.round(4 + Math.min(f, .75) * 26);
          c.strokeStyle = '#d9cbb0'; c.lineWidth = .8; for (let i = 0; i < n; i++) { c.beginPath(); c.arc((rnd(i + 3) * 2 - 1) * 17, -27 + (rnd(i + 9) * 2 - 1) * 4, r * (.7 + rnd(i) * .6), 0, 6.2832); c.stroke(); }
          if (on) { c.strokeStyle = '#8d979f'; c.lineWidth = 4; c.beginPath(); c.moveTo(14, -70); c.lineTo(4, -24); c.stroke(); }
          c.restore();
        }
        function renderCoffee(c, now) {
          if (!KF) return;
          const X = MUG.x, s2 = kSurf(), fill = kFill(), base = kBase(), E = (ex, ey, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 6.2832); c.fill(); };
          const R = MUG.rx, top = MUG.cy, bot = top + 112;
          E(X + 6, 252, 172, 40, 'rgba(0,0,0,.13)'); E(X + 4, 247, 170, 40, '#d9d0bf'); E(X + 4, 243, 170, 40, '#ffffff'); c.strokeStyle = '#ece5d6'; c.lineWidth = 2; c.beginPath(); c.ellipse(X + 4, 244, 134, 29, 0, 0, 6.2832); c.stroke();     // 碟子
          E(X, bot + 6, 80, 17, 'rgba(0,0,0,.12)');
          c.lineCap = 'round'; c.strokeStyle = '#cfc2aa'; c.lineWidth = 21; c.beginPath(); c.ellipse(X + R + 2, top + 60, 27, 33, 0, -1.3, 1.35); c.stroke(); c.strokeStyle = '#f6efe2'; c.lineWidth = 14; c.beginPath(); c.ellipse(X + R + 2, top + 58, 27, 33, 0, -1.3, 1.35); c.stroke();     // 把手
          const g = c.createLinearGradient(X - R, 0, X + R, 0); g.addColorStop(0, '#fbf6ec'); g.addColorStop(.55, '#f3eadb'); g.addColorStop(1, '#d6c8b0');
          const bodyP = () => { c.beginPath(); c.moveTo(X - R, top); c.bezierCurveTo(X - R, top + 62, X - R + 10, bot - 14, X - 70, bot); c.ellipse(X, bot, 70, 15, 0, Math.PI, 0, true); c.bezierCurveTo(X + R - 10, bot - 14, X + R, top + 62, X + R, top); c.closePath(); };
          c.fillStyle = '#cdbfa6'; c.save(); c.translate(0, 4); bodyP(); c.fill(); c.restore();      // 杯底那一圈
          c.fillStyle = g; bodyP(); c.fill();
          c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 6; c.beginPath(); c.moveTo(X - R + 16, top + 44); c.quadraticCurveTo(X - R + 18, bot - 40, X - 62, bot - 8); c.stroke();     // 杯身反光
          E(X, MUG.cy, MUG.rx, MUG.ry, '#fffaf0'); const irx = MUG.rx - 8, iry = irx * .62; E(X, MUG.cy + 1, irx, iry, '#e0d4bf'); E(X, MUG.cy + 14, irx - 6, iry - 8, '#e9dfcd');     // 杯口、杯子裡面
          if (fill > 0) {
            c.save(); c.beginPath(); c.ellipse(X, MUG.cy + 1, irx, iry, 0, 0, 6.2832); c.clip();
            E(X, s2.cy, s2.rx, s2.ry, kRgb(base));
            if (KF.shot > 0) { c.strokeStyle = kRgb(kLerp(base, [232, 184, 112], .5)); c.lineWidth = 5; c.beginPath(); c.ellipse(X, s2.cy, s2.rx - 3, s2.ry - 2, 0, 0, 6.2832); c.stroke(); }     // 邊上一圈金色的油脂
            c.beginPath(); c.ellipse(X, s2.cy, s2.rx, s2.ry, 0, 0, 6.2832); c.clip(); c.translate(X, s2.cy); c.scale(s2.rx, s2.ry); c.lineCap = 'round'; c.lineJoin = 'round';
            const pass = (colOf, add) => KF.art.forEach(a => { c.strokeStyle = colOf(a); for (let i = 0; i < a.pts.length; i++) { const p = a.pts[i], q = a.dots ? p : (a.pts[i - 1] || p); c.lineWidth = p.w + add; c.beginPath(); c.moveTo(q.u, q.v); c.lineTo(p.u, p.v + .0001); c.stroke(); } });
            pass(a => kRgb(kLerp(base, a.col || [255, 246, 230], .5)), .022);                                            // 白的外面一圈半融的邊
            pass(a => a.col ? kRgb(a.col) : kRgb(kLerp(base, [255, 248, 234], .5 + .5 * Math.min(1, a.q / .7))), 0);                   // 奶泡沒打好＝白得不夠白、看起來水水的
            KF.art.forEach(a => { if (a.q / 1.3 > .75) { c.strokeStyle = kRgb(kLerp(base, [255, 246, 230], .3)); c.lineWidth = .008; for (let i = 3; i < a.pts.length; i += 5) { c.beginPath(); c.arc(a.pts[i].u + (rnd(i) - .5) * .05, a.pts[i].v + (rnd(i + 1) - .5) * .05, .022, 0, 6.2832); c.stroke(); } } });     // 打過頭＝一顆一顆粗泡
            KF.dust.forEach(d => { c.fillStyle = d.id === 'cocoa' ? '#5a3220' : '#b8692c'; c.beginPath(); c.arc(d.u, d.v, .013, 0, 6.2832); c.fill(); });
            c.restore();
          }
          if (fill > 0) (KF.floats || []).slice().sort((p, q) => p.v - q.v).forEach(p => drawAny(c, tool(p.id), X + p.u * s2.rx, s2.cy + p.v * s2.ry + 3, .62, p.seed));
          c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(X, MUG.cy, MUG.rx - 2, MUG.ry - 2, 0, 3.5, 5.1); c.stroke();
          if (fill > .25 && !kPtr) { c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 6; for (let i = 0; i < 3; i++) { const x0 = X - 46 + i * 44; c.beginPath(); for (let k = 0; k <= 8; k++) { const y = s2.cy - 34 - k * 8, x = x0 + Math.sin(now / 700 + k * .8 + i * 2) * 7; k ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); } }     // 熱氣
          if (kPtr && kPtr.tool === 'espresso') { c.fillStyle = '#4a4038'; c.fillRect(X - 38, 0, 76, 14); c.fillRect(X - 24, 14, 12, 10); c.fillRect(X + 12, 14, 12, 10); c.fillStyle = kRgb(kLerp([96, 54, 24], [206, 160, 100], Math.max(0, KF.shot / 1.3 - .7) * 2)); c.fillRect(X - 20, 24, 4, s2.cy - 24); c.fillRect(X + 16, 24, 4, s2.cy - 24); }
          if (kPtr && kPtr.tool === 'water') { c.fillStyle = 'rgba(214,232,240,.9)'; c.fillRect(X - 34, 0, 8, s2.cy); }
          if (kPtr && kPtr.tool === 'milk') { c.fillStyle = '#fffaf0'; c.fillRect(kPtr.px - 4, 0, 8, kPtr.py); }
          if (!snapping && (KF.foam > 0 || pick === 'steam')) kPitcher(c, 356, 58, now);
        }
        function kIcon(c, t) {
          const drop = (col, dark) => { c.fillStyle = dark; c.beginPath(); c.moveTo(20, 4); c.bezierCurveTo(34, 20, 33, 37, 20, 37); c.bezierCurveTo(7, 37, 6, 20, 20, 4); c.fill(); c.fillStyle = col; c.beginPath(); c.moveTo(20, 7); c.bezierCurveTo(31, 21, 30, 34, 20, 34); c.bezierCurveTo(10, 34, 9, 21, 20, 7); c.fill(); };
          if (t.id === 'espresso') drop('#6e4020', '#43260f'); else if (t.id === 'water') drop('#cfe6f0', '#9cc2d2'); else if (t.id === 'kmilk') drop('#fffaf0', '#d9cbb0');
          else if (t.id === 'steam') { c.save(); c.translate(4, 8); c.scale(.42, .42); const keep = KF; KF = { foam: .9 }; kPitcher(c, 40, 40, 0); KF = keep; c.restore(); }
          else if (t.id === 'pick') { c.strokeStyle = '#8d979f'; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(10, 32); c.lineTo(28, 10); c.stroke(); c.fillStyle = '#7a4f2d'; c.beginPath(); c.arc(29, 9, 4, 0, 6.2832); c.fill(); }
          else { c.fillStyle = t.id === 'cocoa' ? '#5a3220' : '#b8692c'; for (let i = 0; i < 22; i++) { c.beginPath(); c.arc(8 + rnd(i) * 24, 10 + rnd(i + 7) * 22, 1.5, 0, 6.2832); c.fill(); } }
        }
        // ══ 漢堡：每一層是一片有厚度的圓餅（從 45 度看＝上面一個橢圓＋前面一圈側邊），由下往上疊；疊太高整個自動縮小 ══
        let BG = null, bgPtr = null;
        const BRY = .46;
        const BL = { bunB: { r: 86, h: 20 }, bunT: { r: 88, h: 46 }, beef: { r: 88, h: 16 }, chicken: { r: 88, h: 15 }, egg: { r: 78, h: 7 }, cheese: { r: 84, h: 5 }, bacon: { r: 86, h: 6 }, lettuce: { r: 96, h: 9 }, tomato: { r: 80, h: 8 }, onion: { r: 76, h: 6 }, pickle: { r: 70, h: 5 } };
        const BSAUCE = { teri: ['#5a3220', '#3d2014'], hot: ['#d63a2a', '#a3241a'], mustard: ['#ecc23a', '#c4981c'] };
        const BGEN = { r: 78, h: 13 }, BRICE = { r: 84, h: 18 };      // 不是漢堡料的東西（草莓、珍珠、炸雞塊…）：鋪成一層
        function bgInit() { BG = { layers: [{ id: 'bunB', dx: 0, seed: 1, b: 0, sauce: [] }], ops: [] }; bgPtr = null; }
        function bgUndo() { const o = BG.ops.pop(); if (!o) return; if (o === 'L') BG.layers.pop(); else if (o.toast) BG.layers.forEach((l, i) => { l.heat = o.toast[i] || 0; }); else if (BG.layers[o.i]) BG.layers[o.i].sauce.pop(); }
        function bgLayout(now) { let y = 234; const out = BG.layers.map(L => { const d = BL[L.id] || (tool(L.id) && tool(L.id).grain ? BRICE : BGEN), e = Math.min(1, (now - L.b) / 300), drop = -(1 - e * e) * 70, o = { L, d, x: 200 + L.dx, yb: y + drop, yt: y - d.h + drop, e }; y -= d.h; return o; }); return { out, H: 234 - y }; }
        function bgPt(e) { const q = pt(e), sc = Math.min(1, 190 / Math.max(1, bgLayout(1e12).H)); return [(q[0] - 200) / sc + 200, (q[1] - 236) / sc + 236]; }
        function bgDraw(c, o) {
          const x = o.x, yb = o.yb, yt = o.yt, r = o.d.r, seed = o.L.seed, id = o.L.id;
          const E = (ex, ey, rx, ry, col, rot) => { c.fillStyle = col; c.beginPath(); c.ellipse(ex, ey, rx, ry, rot || 0, 0, 6.2832); c.fill(); };
          if (!BL[id] && tool(id) && tool(id).grain) return riceLayer(c, o, tool(id));
          if (!BL[id]) { const t = tool(id), big = !(t.kind === 'ctop' || t.kind === 'scatter' || isDust(t)), n = big ? 7 : 30, ps = [];
            for (let i = 0; i < n; i++) { const a = big ? i * 1.047 + seed : rnd(seed + i) * 6.28, d = big ? (i < 6 ? .6 : 0) : Math.sqrt(rnd(seed + i + 3)) * .82; ps.push([x + Math.cos(a) * r * d, yb - 3 + Math.sin(a) * r * BRY * d, seed + i * 1.7]); }
            ps.sort((p, q) => p[1] - q[1]).forEach(p => drawAny(c, t, p[0], p[1], big ? 1.05 : .85, p[2])); return; }
          const disc = (rr, side, topc) => { E(x, yb, rr, rr * BRY, side); c.fillStyle = side; c.fillRect(x - rr, yt, rr * 2, yb - yt); E(x, yt, rr, rr * BRY, topc); };
          if (id === 'bunB') { disc(r, '#c98842', '#f3d9a4'); E(x, yt, r * .9, r * BRY * .9, '#f7e3b8'); }
          else if (id === 'bunT') {
            E(x, yb - 2, r, r * BRY, '#b87732');
            c.fillStyle = '#cf8a3e'; c.beginPath(); c.moveTo(x - r, yb - 6); c.bezierCurveTo(x - r, yt - 26, x + r, yt - 26, x + r, yb - 6); c.ellipse(x, yb - 6, r, r * BRY, 0, 0, Math.PI, false); c.closePath(); c.fill();
            c.fillStyle = '#de9e52'; c.beginPath(); c.moveTo(x - r * .86, yb - 14); c.bezierCurveTo(x - r * .86, yt - 20, x + r * .7, yt - 22, x + r * .76, yb - 20); c.bezierCurveTo(x + r * .4, yt + 2, x - r * .5, yt + 4, x - r * .86, yb - 14); c.fill();
            E(x - r * .4, yt + 2, r * .2, r * .07, 'rgba(255,255,255,.45)', -.25);
            for (let i = 0; i < 11; i++) E(x + (rnd(seed + i) * 2 - 1) * r * .6, yt - 4 + rnd(seed + i + 20) * 26, 3.4, 1.9, '#fff1cf', rnd(seed + i + 40) * 3);
          }
          else if (id === 'beef') { disc(r, '#57301c', '#7d4528'); c.strokeStyle = '#532a16'; c.lineWidth = 3; c.lineCap = 'round'; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(x - r * .6, yt + i * r * BRY * .45 + 3); c.lineTo(x + r * .6, yt + i * r * BRY * .45 - 3); c.stroke(); } for (let i = 0; i < 9; i++) E(x + (rnd(seed + i) * 2 - 1) * r * .7, yt + (rnd(seed + i + 9) * 2 - 1) * r * BRY * .6, 2.4, 1.5, '#9a5a38'); }
          else if (id === 'chicken') { for (let i = 0; i < 16; i++) { const a = i * .3927; E(x + Math.cos(a) * r * .9, yb + Math.sin(a) * r * BRY * .9, 13, 9, '#b0702a'); } disc(r * .92, '#b0702a', '#e0a24a'); for (let i = 0; i < 16; i++) { const a = i * .3927 + .2; E(x + Math.cos(a) * r * .9, yt + Math.sin(a) * r * BRY * .9, 13, 8, i % 2 ? '#dc9d46' : '#e6ac55'); } for (let i = 0; i < 10; i++) E(x + (rnd(seed + i) * 2 - 1) * r * .7, yt + (rnd(seed + i + 9) * 2 - 1) * r * BRY * .6, 4, 2.2, '#f0c078', rnd(seed + i) * 3); }
          else if (id === 'egg') { for (let i = 0; i < 7; i++) { const a = i * .9 + seed; E(x + Math.cos(a) * r * .72, yb + Math.sin(a) * r * BRY * .72, 24, 13, '#e2dccd'); } E(x, yb, r * .8, r * BRY * .8, '#e2dccd'); for (let i = 0; i < 7; i++) { const a = i * .9 + seed; E(x + Math.cos(a) * r * .72, yt + Math.sin(a) * r * BRY * .72, 24, 13, '#ffffff'); } E(x, yt, r * .8, r * BRY * .8, '#ffffff'); E(x + 6, yt - 1, 24, 14, '#e2942a'); E(x + 6, yt - 5, 22, 12, '#f8b83a'); E(x, yt - 9, 7, 3, '#fde08a', -.3); }
          else if (id === 'cheese') { const w = r * 1.02, hy = r * BRY * 1.02; c.fillStyle = '#dca428'; c.beginPath(); c.moveTo(x - w, yt + 13); c.lineTo(x, yt - hy + 3); c.lineTo(x + w, yt + 13); c.lineTo(x, yt + hy + 14); c.closePath(); c.fill(); c.fillStyle = '#f7cf52'; c.beginPath(); c.moveTo(x - w, yt + 8); c.quadraticCurveTo(x - w * .5, yt - hy * .5, x, yt - hy); c.quadraticCurveTo(x + w * .5, yt - hy * .5, x + w, yt + 8); c.quadraticCurveTo(x + w * .5, yt + hy * .6, x, yt + hy + 9); c.quadraticCurveTo(x - w * .5, yt + hy * .6, x - w, yt + 8); c.fill(); }
          else if (id === 'bacon') { c.lineCap = 'round'; for (let i = -1; i <= 1; i++) { const y0 = yt + i * r * BRY * .52, wave = (o2, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); for (let k = 0; k <= 12; k++) { const px = x - r * (1 - Math.abs(i) * .12) + k * r * (2 - Math.abs(i) * .24) / 12, py = y0 + Math.sin(k * 1.3 + i + seed) * 3 + o2; k ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); }; wave(3, '#84271c', 14); wave(0, '#c4463a', 14); wave(-1, '#f0bba4', 3.5); } }
          else if (id === 'lettuce') { for (let i = 0; i < 18; i++) { const a = i * .349; E(x + Math.cos(a) * r * .9, yb + Math.sin(a) * r * BRY * .9 + 2, 17, 10, '#4a933a'); } for (let i = 0; i < 18; i++) { const a = i * .349 + .17; E(x + Math.cos(a) * r * .9, yt + Math.sin(a) * r * BRY * .9, 17, 10, i % 2 ? '#74bf5c' : '#82cb68'); } E(x, yt, r * .84, r * BRY * .84, '#8fd272'); c.strokeStyle = '#6cb556'; c.lineWidth = 1.5; for (let i = 0; i < 6; i++) { const a = i * 1.05 + seed; c.beginPath(); c.moveTo(x, yt); c.lineTo(x + Math.cos(a) * r * .7, yt + Math.sin(a) * r * BRY * .7); c.stroke(); } }
          else if (id === 'tomato') { [[-.4, -2], [.4, -5], [0, 9]].forEach(([ox, oy], i) => { const cx2 = x + ox * r, cy2 = yt + oy; E(cx2, cy2 + 4, 36, 18, '#a3281f'); E(cx2, cy2, 36, 18, '#e04a3a'); E(cx2, cy2, 28, 13, '#ee6c5a'); for (let k = 0; k < 6; k++) { const a = k * 1.047 + i; E(cx2 + Math.cos(a) * 15, cy2 + Math.sin(a) * 7, 3, 1.8, '#f8dca0', a); } }); }
          else if (id === 'onion') { [[-.35, -3], [.35, -1], [0, 8]].forEach(([ox, oy]) => { const cx2 = x + ox * r, cy2 = yt + oy; c.lineWidth = 7; c.strokeStyle = '#9a68a8'; c.beginPath(); c.ellipse(cx2, cy2 + 2, 34, 17, 0, 0, 6.2832); c.stroke(); c.strokeStyle = '#d9b6e0'; c.beginPath(); c.ellipse(cx2, cy2, 34, 17, 0, 0, 6.2832); c.stroke(); c.lineWidth = 2.5; c.strokeStyle = '#f6ecf7'; c.beginPath(); c.ellipse(cx2, cy2 - 1, 34, 17, 0, 0, 6.2832); c.stroke(); }); }
          else if (id === 'pickle') { [[-.55, 0], [-.05, -9], [.5, -1], [.1, 10]].forEach(([ox, oy]) => { const cx2 = x + ox * r, cy2 = yt + oy; E(cx2, cy2 + 3, 19, 10, '#4a7626'); E(cx2, cy2, 19, 10, '#7fae45'); E(cx2, cy2, 14, 7, '#a9cf74'); for (let k = 0; k < 5; k++) E(cx2 + Math.cos(k * 1.26) * 7, cy2 + Math.sin(k * 1.26) * 3.5, 1.6, 1, '#d6ebb0'); }); }
        }
        function riceLayer(c, o, t) {   // 漢堡裡的一層飯：像米漢堡的飯餅，前面那圈和上面都是一粒一粒的
          const x = o.x, yb = o.yb, yt = o.yt, r = o.d.r, seed = o.L.seed, pk = (sd) => t.bits[Math.floor(rnd(sd) * t.bits.length)];
          const E = (ex, ey, rx, ry, col, rot) => { c.fillStyle = col; c.beginPath(); c.ellipse(ex, ey, rx, ry, rot || 0, 0, 6.2832); c.fill(); };
          E(x, yb, r, r * BRY, t.rim); c.fillStyle = t.rim; c.fillRect(x - r, yt, r * 2, yb - yt);
          for (let i = 0; i < 46; i++) { const sd = seed + i * 2.3, a = rnd(sd) * Math.PI, py = yt + (yb - yt) * rnd(sd + 1) + Math.sin(a) * r * BRY; E(x - Math.cos(a) * r * .96, py, 3.6, 2.2, pk(sd + 2), rnd(sd + 3) * 3.14); }
          E(x, yt, r, r * BRY, t.col);
          for (let i = 0; i < 110; i++) { const sd = seed + i * 1.9 + 50, a = rnd(sd) * 6.28, d = Math.sqrt(rnd(sd + 1)) * .95; E(x + Math.cos(a) * r * d, yt + Math.sin(a) * r * BRY * d, 3.8, 2.3, pk(sd + 2), rnd(sd + 3) * 3.14); }
        }
        function riceClump(c, t, x, y, k, seed) {   // 一小坨飯（丟進杯子、浮在杯面）
          const R = 22 * k, E = (ex, ey, rx, ry, col, rot) => { c.fillStyle = col; c.beginPath(); c.ellipse(ex, ey, rx, ry, rot || 0, 0, 6.2832); c.fill(); };
          E(x + 1, y + R * .45, R * 1.1, R * .42, 'rgba(0,0,0,.18)'); E(x, y, R, R * .72, t.rim); E(x, y - R * .12, R * .94, R * .64, t.col);
          for (let i = 0; i < 16; i++) { const sd = seed + i * 3.7, a = rnd(sd) * 6.28, d = Math.sqrt(rnd(sd + 1)) * R * .8; E(x + Math.cos(a) * d, y - R * .15 + Math.sin(a) * d * .62, 2.4 * k + .8, 1.5 * k + .5, t.bits[Math.floor(rnd(sd + 2) * t.bits.length)], rnd(sd + 3) * 3.14); }
        }
        function bgSauce(c, o) {      // 擠在這一層上面的醬：照這一層的面壓扁，同一種醬連成一片、只有外面一圈深色
          if (!o.L.sauce.length) return;
          c.save(); c.translate(o.x, o.yt + (o.L.id === 'bunT' ? -8 : 0)); c.scale(o.d.r, o.d.r * BRY); c.lineCap = 'round'; c.lineJoin = 'round';
          const pass = (k, w, dv) => o.L.sauce.forEach(a => { c.strokeStyle = a.cols[k]; c.lineWidth = w; c.beginPath(); a.pts.forEach((p, i) => i ? c.lineTo(p.u, p.v + dv) : c.moveTo(p.u, p.v + dv)); if (a.pts.length === 1) c.lineTo(a.pts[0].u + .001, a.pts[0].v + dv); c.stroke(); });
          pass(1, .15, .05); pass(0, .11, 0); c.restore();
        }
        function renderBurger(c, now) {
          if (!BG) return; const E = (ex, ey, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 6.2832); c.fill(); };
          E(200, 250, 176, 42, 'rgba(0,0,0,.13)'); E(200, 245, 176, 42, '#ded6c6'); E(200, 241, 176, 42, '#ffffff'); c.strokeStyle = '#ece5d6'; c.lineWidth = 2; c.beginPath(); c.ellipse(200, 242, 140, 31, 0, 0, 6.2832); c.stroke();
          const lay = bgLayout(now), sc = Math.min(1, 190 / Math.max(1, bgLayout(1e12).H));
          c.save(); c.translate(200, 236); c.scale(sc, sc); c.translate(-200, -236);
          E(202, 240, 94, 26, 'rgba(0,0,0,.16)');
          lay.out.forEach(o => {
            c.globalAlpha = Math.min(1, o.e * 3);
            const hs = heatOf(o.L.heat), m = bakeOf(o.L.id);
            if (!hs) { bgDraw(c, o); bgSauce(c, o); }
            else if (o.L.id === 'cheese' && hs !== 'raw') { bgCheeseMelt(c, o, hs); bgSauce(c, o); }   // 起司片烤過：融化、往下垂、上面焦黃
            else {
              const tm = m === 'leaf' || m === 'fruit' || m === 'meat' || m === 'rice' || m === 'bun' ? m : 'other';
              const oo = m === 'leaf' ? Object.assign({}, o, { d: { r: o.d.r * .9, h: o.d.h }, yt: o.yt + 2 }) : o;   // 生菜烤過軟掉、縮一圈
              tinted(c, TINT[tm][0], tintA(tm, hs), cc => { bgDraw(cc, oo); bgSauce(cc, oo); });
            }
            c.globalAlpha = 1;
          });
          c.restore();
        }
        function bgCheeseMelt(c, o, hs) {   // 融化的起司片：攤成圓的一片蓋過下面那層的邊，前面幾處往下垂；焦黃跟披薩起司同一套雜訊遮罩
          const x = o.x, yt = o.yt, r = o.d.r * 1.04, ry = r * BRY, seed = o.L.seed;
          const side = hs === 'burnt' ? '#b9781e' : '#dca428', top = hs === 'burnt' ? '#e8b240' : '#f7cf52';
          const drip = (px, py, w, L, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(px - w / 2, py); c.lineTo(px - w / 2, py + L); c.arc(px, py + L, w / 2, Math.PI, 0, true); c.lineTo(px + w / 2, py); c.closePath(); c.fill(); };
          for (let i = 0; i < 8; i++) {   // 前半圈垂下來幾滴，長短不一
            const a = .2 + i * .38 + (rnd(seed + i) - .5) * .18; if (Math.sin(a) < .15) continue;
            const px = x + Math.cos(a) * r * .97, py = yt + Math.sin(a) * ry * .9, w = 7 + rnd(seed + i + 4) * 6, L = 6 + rnd(seed + i + 9) * 18;
            drip(px, py, w + 2, L + 1, side); drip(px, py - 1, w, L, top);
          }
          c.fillStyle = side; c.beginPath(); c.ellipse(x, yt + 2.5, r, ry, 0, 0, 6.2832); c.fill();
          c.fillStyle = top; c.beginPath(); c.ellipse(x, yt, r, ry, 0, 0, 6.2832); c.fill();
          c.save(); c.beginPath(); c.ellipse(x, yt, r, ry, 0, 0, 6.2832); c.clip();
          feather(c, x - r * .3, yt - ry * .3, r * .35, '255,246,210', .55);   // 油亮
          c.globalAlpha *= hs === 'burnt' ? 1 : .75; c.drawImage(noiseTex(hs), x - r, yt - ry, r * 2, ry * 2);
          c.restore();
        }
        function bgDown(e) {
          if (S.busy) return; const t = tool(pick); e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) {}
          if (!t) { $('hint').textContent = '先在下面點一樣料'; return; }
          const q = bgPt(e);
          const f = flowOf(t);
          if (f) { const out = bgLayout(1e12).out, top = out[out.length - 1], i = out.length - 1, a = { id: t.id, cols: f, pts: [] }; top.L.sauce.push(a); BG.ops.push({ i }); bgPtr = { a, top }; bgMove(e); }
          else if (!BL[t.id] && !solidOf(t)) { $('hint').textContent = NOUSE; return; }
          else if (BG.layers.length < 18) { BG.layers.push({ id: t.id, dx: Math.max(-18, Math.min(18, (q[0] - 200) * .3)), seed: Math.random() * 100, b: performance.now(), sauce: [] }); BG.ops.push('L'); }
          touch(400);
        }
        function bgMove(e) {
          if (!bgPtr) return; const q = bgPt(e), top = bgPtr.top; let u = (q[0] - top.x) / top.d.r, v = (q[1] - top.yt) / (top.d.r * BRY); const r = Math.hypot(u, v); if (r > 1) { u /= r; v /= r; }
          const pts = bgPtr.a.pts, l = pts[pts.length - 1]; if (!l || Math.hypot(u - l.u, v - l.v) > .03) { pts.push({ u, v }); touch(); }
        }
        function bgIcon(c, t) {
          if (BSAUCE[t.id]) { c.lineCap = 'round'; [[BSAUCE[t.id][1], 9, 2], [BSAUCE[t.id][0], 7, 0]].forEach(([col, w, o]) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(8, 14 + o); c.lineTo(30, 14 + o); c.lineTo(10, 22 + o); c.lineTo(32, 22 + o); c.lineTo(12, 30 + o); c.stroke(); }); return; }
          c.save(); c.translate(20, 22); c.scale(.2, .2); const d = BL[t.id]; bgDraw(c, { L: { id: t.id, seed: 3 }, d, x: 0, yb: d.h / 2 + (t.id === 'bunT' ? 20 : 0), yt: -d.h / 2 + (t.id === 'bunT' ? 20 : 0) }); c.restore();
        }
        // ══ 什麼料都能放到任何一個檯子 ══
        const hexRgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
        const KFCOL = { espresso: ['#6e4020', '#43260f'], water: ['#cfe6f0', '#a9cbd8'], kmilk: ['#fffaf0', '#dccfb4'], cocoa: ['#5a3220', '#3d2014'], cinnamon: ['#b8692c', '#8f4d1c'] };
        const isDust = (t) => t.id === 'cocoa' || t.id === 'cinnamon';
        function flowOf(t) {      // 「會流的」（醬、奶油、飲料）回一組顏色 [面, 邊]；不是就回 null
          if (!t) return null;
          if (t.kind === 'sauce') return t.grain ? null : [t.col, t.rim]; if (t.kind === 'pipe') return [t.col, t.shade];
          if (t.kind === 'cliq') { const q = LIQ[t.id].rgb; return [kRgb(q), kRgb(q.map(v => v * .75))]; }
          if (t.kind === 'bg' && BSAUCE[t.id]) return BSAUCE[t.id];
          if (t.kind === 'kf' && KFCOL[t.id] && !isDust(t)) return KFCOL[t.id];
          if (t.kind === 'ccap' && t.id !== 'scoop') return ['#fffdf8', '#d9c6a4'];
          return null;
        }
        const toRgb = (col) => col[0] === '#' ? hexRgb(col) : col.match(/\d+/g).map(Number);
        const solidOf = (t) => !!t && (t.kind === 'piece' || t.kind === 'scatter' || t.kind === 'ctop' || t.kind === 'cice' || t.id === 'scoop' || (t.kind === 'bg' && !!BL[t.id]) || isDust(t) || !!t.grain);
        function drawAny(c, t, x, y, k, seed, baked) {   // 把任何一樣「一塊一塊的料」畫在 (x,y)，k＝大小倍率
          if (!t) return;
          if (t.grain) riceClump(c, t, x, y, k, seed);
          else if (t.kind === 'piece' || t.kind === 'scatter') drawPiece(c, t.id, x, y, (t.r || 6) * k, seed, baked);
          else if (t.kind === 'ctop') cupPiece(c, t.id, x, y, 1.5 * k, seed);
          else if (t.kind === 'cice') cupIce(c, x, y - 4 * k, k);
          else if (t.id === 'scoop') cupScoop(c, x, y - 14 * k, .62 * k);
          else if (t.kind === 'bg' && BL[t.id]) { const d = BL[t.id]; c.save(); c.translate(x, y); c.scale(.34 * k, .34 * k); bgDraw(c, { L: { id: t.id, seed }, d, x: 0, yb: d.h / 2, yt: -d.h / 2 }); c.restore(); }
          else if (isDust(t)) { c.fillStyle = KFCOL[t.id][0]; for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(x + (rnd(seed + i) - .5) * 14 * k, y + (rnd(seed + i + 5) - .5) * 8 * k, 1.5 * k, 0, 6.2832); c.fill(); } }
        }
        function surfTool(t) {    // 蛋糕／披薩／便當這種「在面上擺」的檯子，把別檯的料翻成它聽得懂的四種：抹的、擠的、撒的、擺的
          if (!t) return null; if (t.kind === 'sauce' || t.kind === 'pipe' || t.kind === 'piece' || t.kind === 'scatter') return t;
          if (t._surf !== undefined) return t._surf; let o = null; const f = flowOf(t);
          if (t.kind === 'ccap' && f) o = { id: t.id, kind: 'pipe', col: f[0], shade: f[1], hi: '#ffffff', w: 17 };
          else if (f) o = { id: t.id, kind: 'sauce', col: f[0], rim: f[1], hi: f[0], w: t.kind === 'bg' ? 9 : 16 };
          else if (t.kind === 'ctop' || isDust(t)) o = { id: t.id, kind: 'scatter' };
          else if (solidOf(t)) o = { id: t.id, kind: 'piece', r: t.kind === 'bg' ? 26 : 13 };
          return t._surf = o;
        }
        const NOUSE = '這一樣只有咖啡檯用得到';
        const bgImg = new Image(); bgImg.onload = () => { const sg = $('stage'); if (sg) sg.classList.add('has-bg'); }; bgImg.src = opts.bg;
        build(); bind(); requestAnimationFrame(frame);
        // ── 給外面（扣錢、試吃）看的這一盤：用了哪些料（amt）、各算幾份（por）、評分用的數字（m）；key＝同一盤永遠同一把 ──
        function summary(full) {
          const amt = {}, por = {}, names = {}, m = {}, key = [st];
          const add = (id, a, p) => { if (!id) return; amt[id] = (amt[id] || 0) + a; por[id] = (por[id] || 0) + p; const t = tool(id); names[id] = t ? t.name : id; };
          const r1 = (v) => Math.round(v * 10) / 10, r0 = Math.round;
          const len = (pts) => { let n = 0; for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return n; };
          const tally = (arr) => { const o = {}; arr.forEach(id => { o[id] = (o[id] || 0) + 1; }); return o; };
          if (!S) return { st, amt, por, names, m, key: st };
          if (st === 'cup') {
            if (!C) return { st, amt, por, names, m, key: st };
            const cnt = tally(C.adds.map(p => p.id));
            for (const id in cnt) { const t = tool(id), big = t && !(t.kind === 'ctop' || t.kind === 'scatter' || isDust(t)); add(id, cnt[id], Math.ceil(cnt[id] / (big ? 2 : 8))); }
            const lq = {}; C.liq.forEach(l => { lq[l.id] = (lq[l.id] || 0) + l.amt; });
            for (const id in lq) add(id, lq[id], Math.max(1, Math.ceil(lq[id] / .25)));
            if (C.ice) add('ice', C.ice, Math.ceil(C.ice / 3));
            if (C.foam) add('foam', 1, 1); if (C.cream) add('ccream', 1, 1); if (C.scoop) add('scoop', 1, 1);
            Object.assign(m, { level: C.level, kinds: Object.keys(lq).length, mixed: Object.keys(lq).length > 1 ? C.mixed : 1, sealed: !!C.sealed, adds: C.adds.length, ice: C.ice, caps: (+C.foam) + (+C.cream) + (+C.scoop) });
            key.push(C.liq.map(l => l.id + r1(l.amt * 10)).join(','), C.adds.map(p => p.id).join(','), C.ice, r1(C.mixed), +C.sealed, +C.foam, +C.cream, +C.scoop);
          } else if (st === 'coffee') {
            if (!KF) return { st, amt, por, names, m, key: st };
            if (KF.shot > 0) add('espresso', 1, 1);
            if (KF.water > 0) add('water', 1, 1);
            if (KF.foam > 0) add('steam', 1, 1);
            let milkPts = 0; const flows = {};
            KF.art.forEach(a => { if (a.id) flows[a.id] = (flows[a.id] || 0) + a.pts.length; else milkPts += a.pts.length; });
            if (KF.milk > 0 || milkPts) add('kmilk', 1, 1);
            for (const id in flows) add(id, flows[id], Math.max(1, Math.ceil(flows[id] / 60)));
            const dust = tally(KF.dust.map(d => d.id)); for (const id in dust) add(id, dust[id], Math.ceil(dust[id] / 48));
            const fl = tally((KF.floats || []).map(p => p.id)); for (const id in fl) add(id, fl[id], Math.ceil(fl[id] / 4));
            Object.assign(m, { shot: KF.shot / 1.3, foam: KF.foam / 1.3, fill: kFill(), milkArt: milkPts, art: milkPts + Object.values(flows).reduce((a, b) => a + b, 0), floats: (KF.floats || []).length, dust: KF.dust.length });
            key.push(r1(KF.shot * 10), r1(KF.water * 10), r1(KF.milk * 10), r1(KF.foam * 10),
              KF.art.map(a => (a.id || 'm') + a.pts.length + ':' + a.pts.filter((q, i) => i % 6 === 0).map(q => r0(q.u * 40) + '.' + r0(q.v * 40)).join(' ')).join(';'),
              KF.dust.length, (KF.floats || []).map(p => p.id + r0(p.u * 20) + '.' + r0(p.v * 20)).join(','));
          } else if (st === 'burger') {
            if (!BG) return { st, amt, por, names, m, key: st };
            const L = BG.layers;
            L.forEach((l, i) => { if (i) add(l.id, 1, 1); l.sauce.forEach(a => { if (a.id) add(a.id, a.pts.length, Math.max(1, Math.ceil(a.pts.length / 30))); }); });
            const dx = L.slice(1).filter(l => l.id !== 'bunT').map(l => l.dx), mean = dx.reduce((a, b) => a + b, 0) / Math.max(1, dx.length);
            Object.assign(m, { layers: L.length - 1, top: L[L.length - 1].id, tilt: Math.sqrt(dx.reduce((a, v) => a + (v - mean) * (v - mean), 0) / Math.max(1, dx.length)),
              sauces: L.reduce((n, l) => n + l.sauce.length, 0), mains: L.filter(l => MAIN.has(l.id)).length,
              toast: heatOf(Math.max(0, ...L.map(l => l.heat || 0))), burntId: (L.find(l => heatOf(l.heat) === 'burnt') || {}).id || '', cheeseMelt: L.some(l => l.id === 'cheese' && heatOf(l.heat) === 'good'),
              leafHot: L.some(l => (l.id === 'lettuce' || l.id === 'tomato') && l.heat > 0) });
            key.push(L.map(l => l.id + r0(l.dx) + (l.heat ? 'h' + l.heat : '') + (l.sauce.length ? '+' + l.sauce.map(a => (a.id || '') + a.pts.length).join('/') : '')).join(','));
          } else {
            const cnt = tally(S.pcs.map(p => p.id));
            for (const id in cnt) { const t = surfTool(tool(id)); add(id, cnt[id], Math.ceil(cnt[id] / (t && t.kind === 'scatter' ? 18 : 6))); }
            const sl = {}; S.sauce.concat(S.cream).forEach(s => { sl[s.t.id] = (sl[s.t.id] || 0) + len(s.pts) + 8; });
            for (const id in sl) add(id, sl[id], Math.max(1, Math.ceil(sl[id] / 220)));
            Object.assign(m, { baked: S.baked, bakeV: S.bakeV || 0, sauces: S.sauce.length, cream: S.cream.reduce((n, s) => n + len(s.pts), 0),
              creamLv: S.cream.reduce((n, s) => Math.max(n, s.pts[0] ? s.pts[0].lv : 0), 0), pcs: S.pcs.length, onCream: S.pcs.filter(p => p.lv > 0).length });
            if (full) Object.assign(m, cover());
            key.push(S.baked || '', S.bakeV || 0, S.pcs.map(p => p.id + r0(p.x / 4) + '.' + r0(p.y / 4)).sort().join(','),
              S.sauce.concat(S.cream).map(s => s.t.id + ':' + s.pts.filter((q, i) => i % 4 === 0).map(q => r0(q.x / 4) + '.' + r0(q.y / 4)).join(' ')).join(';'));
          }
          return { st, amt, por, names, m, key: key.join('|') };
        }
        function cover() {   // 盤面上有東西的地方佔幾成、偏哪一邊；披薩看醬抹了幾成；便當看三格各放了什麼
          const pts = [], sauceP = [], riceP = [];
          S.pcs.forEach(p => pts.push([p.x, p.y, 14]));
          S.sauce.forEach(s => s.pts.forEach(p => { const q = [p.x, p.y, Math.max(8, p.w * .55)]; pts.push(q); if (s.t.grain) riceP.push(q); else if (s.t.id !== 'honey') sauceP.push(q); }));
          S.cream.forEach(s => s.pts.forEach(p => pts.push([p.x, p.y, Math.max(8, p.w * .5)])));
          const bucket = (arr) => { const g = new Map(); arr.forEach(q => { const k = Math.floor(q[0] / 30) + ',' + Math.floor(q[1] / 30); (g.get(k) || g.set(k, []).get(k)).push(q); }); return g; };
          const near = (g, x, y) => { const bx = Math.floor(x / 30), by = Math.floor(y / 30); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = g.get((bx + i) + ',' + (by + j)); if (a && a.some(q => Math.abs(q[0] - x) < q[2] && Math.abs(q[1] - y) < q[2])) return true; } return false; };
          const gA = bucket(pts), gS = bucket(sauceP), gR = bucket(riceP);
          const mid = st === 'cake' ? (CK.T[0] + CK.B[0] + CK.F[0]) / 3 : 200;
          let tot = 0, hit = 0, left = 0, right = 0, sc = 0; const cell = { L: [0, 0], RT: [0, 0], RB: [0, 0] }, rice = [0, 0];
          for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) {
            if (!inArea([x, y])) continue; tot++;
            const h = near(gA, x, y); if (h) { hit++; if (x < mid) left++; else right++; }
            if (st === 'pizza' && near(gS, x, y)) sc++;
            if (st === 'bento') { const k = x < 195 ? 'L' : y < 146 ? 'RT' : 'RB'; cell[k][0]++; if (h) cell[k][1]++; if (k === 'L') { rice[0]++; if (near(gR, x, y)) rice[1]++; } }
          }
          const n = {}; if (st === 'bento') { S.pcs.forEach(p => { const k = p.x < 195 ? 'L' : p.y < 146 ? 'RT' : 'RB'; n[k] = (n[k] || 0) + 1; }); }
          return { cover: tot ? hit / tot : 0, lr: left + right ? left / (left + right) : .5, sauceCov: tot ? sc / tot : 0,
            cells: st === 'bento' ? { L: cell.L[0] ? cell.L[1] / cell.L[0] : 0, RT: cell.RT[0] ? cell.RT[1] / cell.RT[0] : 0, RB: cell.RB[0] ? cell.RB[1] / cell.RB[0] : 0 } : null,
            cellN: n, rice: rice[0] ? rice[1] / rice[0] : 0 };
        }
        return {
          summary, snapCanvas: snapshot,
          get st() { return st; },
          get busy() { return !!(S && S.busy); },
          get baked() { return !!(S && S.baked); },
          reset: build,
          hint: (t) => {   // 講一句（為什麼還不能完成之類），過幾秒換回這一檯的說明
            const h = $('hint'); if (!h) return; h.textContent = t; const s0 = st;
            win.setTimeout(() => { if (root.isConnected && h.textContent === t && st === s0 && !(S && S.busy)) h.textContent = ST[st].hint; }, 3800);
          },
          stop: () => { _ivs.forEach(id => win.clearInterval(id)); _ivs.clear(); },
        };
    }

    // ================================================================
    // 👅 試吃：三位試吃員照規則講（同一盤永遠同一個結果、不花 AI 錢）
    // ================================================================
    function _ids(sum) { return Object.keys(sum.por).filter(id => sum.por[id] > 0 && TASTE[id] && TASTE[id][0]); }
    const SAY = { espresso: '咖啡', steam: '奶泡', kmilk: '奶泡', water: '熱水', ccream: '鮮奶油', foam: '奶蓋' };   // 料盤上寫的是動作（萃取、倒奶泡），講給人聽換成吃到的東西
    function _nm(sum, id) { return SAY[id] || (sum.names && sum.names[id]) || (TASTE[id] && TASTE[id][2]) || id; }
    function _tagsOf(sum) {
        const cnt = {};
        _ids(sum).forEach(id => { const t = TASTE[id][0]; cnt[t] = (cnt[t] || 0) + (sum.por[id] || 1); });
        return Object.keys(cnt).sort((a, z) => cnt[z] - cnt[a]).slice(0, 3);
    }
    function _costOf(sum) {
        const S0 = ST_BY[sum.st];
        return (S0 ? S0.frame : 0) + Object.keys(sum.por).reduce((n, id) => n + (TASTE[id] ? TASTE[id][1] : 2) * (sum.por[id] || 0), 0);
    }
    // 還不能按「完成」的原因（空盤不讓按，不白花她的錢）
    function _missing(sum) {
        const m = sum.m || {};
        if (sum.st === 'cup') return m.level > .05 ? '' : '杯子裡還沒有飲料：點紅茶或牛奶，按住杯子倒進去';
        if (sum.st === 'coffee') return m.fill > 0 ? '' : '杯子還是空的：點「萃取」或「熱水」，按住杯子';
        if (sum.st === 'burger') return m.layers > 0 ? '' : '麵包上還是空的：點一樣料，再點漢堡';
        if (sum.st === 'pizza' && !m.sauces) return '先在餅皮上抹一層醬';
        if (!Object.keys(sum.por).length) return '盤子上還是空的：點一樣料放上去';
        return '';
    }
    function judge(sum) {
        const S0 = ST_BY[sum.st] || {}, m = sum.m || {}, ids = _ids(sum), nm = (id) => _nm(sum, id);
        const notes = { taste: [], bite: [], look: [] };
        const N = (k, w, t, good) => notes[k].push({ w, t, good: !!good });
        let score = 62;
        // ── 味道 ──
        const byTag = {};
        ids.slice().sort((a, z) => (sum.por[z] || 0) - (sum.por[a] || 0)).forEach(id => { const t = TASTE[id][0]; (byTag[t] = byTag[t] || []).push(id); });
        CONFLICT.forEach(([p, q]) => { if (byTag[p] && byTag[q]) { score -= 16; N('taste', 9, nm(byTag[p][0]) + '跟' + nm(byTag[q][0]) + '的味道打架，吃起來很怪'); } });
        let harm = 0;
        HARMONY.forEach(([p, q]) => { if (byTag[p] && byTag[q] && harm < 3) { harm++; score += 6; if (harm === 1) N('taste', 3, nm(byTag[p][0]) + '配' + nm(byTag[q][0]) + '，很搭', true); } });
        const savory = ids.filter(id => (TASTE[id][0] === '鹹香' || TASTE[id][0] === '辛暖') && id !== 'cinnamon');
        const sweet = ids.filter(id => DESSERT.has(id));
        if (S0.drink && savory.length) { score -= 20; N('taste', 10, '喝到' + nm(savory[0]) + '，嚇了一跳'); }
        if (sum.st === 'cake' && savory.length) { score -= 14; N('taste', 8, '甜點裡吃到' + nm(savory[0]) + '，有點衝'); }
        if ((sum.st === 'bento' || sum.st === 'burger') && sweet.length) { score -= 12; N('taste', 8, (sum.st === 'bento' ? '便當' : '漢堡') + '裡出現' + nm(sweet[0]) + '，配起來很怪'); }
        if (sum.st === 'pizza' && sweet.filter(id => id !== 'straw' && id !== 'blueberry').length) { score -= 10; N('taste', 7, '披薩上有' + nm(sweet.filter(id => id !== 'straw' && id !== 'blueberry')[0]) + '，烤完黏成一片'); }
        const tagN = Object.keys(byTag).length;
        if (tagN >= 6) { score -= 8; N('taste', 6, '味道太多種，吃不出主角是什麼'); }
        if (!notes.taste.length) N('taste', 1, tagN ? '整體是' + (TASTE_WORD[Object.keys(byTag)[0]] || '') + '的味道，很順口' : '味道很淡，吃不太出來', !!tagN);
        // ── 口感 ──
        if (sum.st === 'pizza') {
            if (m.baked === 'raw') { score -= 28; N('bite', 10, '中間還是軟的，沒烤熟（烤到 ' + m.bakeV + '%，剛好是 55～75%）'); }
            else if (m.baked === 'burnt') { score -= 28; N('bite', 10, '邊緣焦到發苦（烤到 ' + m.bakeV + '%，剛好是 55～75%）'); }
            else if (m.baked === 'good') { score += 10; N('bite', 4, '餅皮烤得剛好，外脆裡軟', true); }
            if (!(sum.por.mozz > 0 || sum.por.cheese > 0)) { score -= 6; N('bite', 5, '沒放起司，咬起來乾乾的'); }
            if (m.sauceCov < .3) { score -= 8; N('bite', 6, '醬只抹了一小塊，大部分咬到的是乾餅皮'); }
            if (m.baked) {   // 不該進烤箱的料進去了
                const melt = ids.filter(id => bakeOf(id) === 'cream')[0], leaf = ids.filter(id => bakeOf(id) === 'leaf' && id !== 'basil')[0];
                if (melt) { score -= 8; N('bite', 7, nm(melt) + '進烤箱化成一灘，黏在餅皮上'); }
                if (sum.por.ice > 0) { score -= 8; N('bite', 7, '冰塊烤化了，餅皮濕濕的'); }
                if (leaf) { score -= 4; N('bite', 4, nm(leaf) + '烤到軟爛'); }
            }
        } else if (sum.st === 'cake') {
            if (!m.cream) { score -= 12; N('bite', 7, '上面沒擠奶油，吃起來只有蛋糕體'); }
            else if (m.cream > 2400) { score -= 8; N('bite', 6, '奶油擠太多，吃兩口就膩'); }
            else { score += 4; N('bite', 3, '奶油和蛋糕的份量剛好', true); }
        } else if (sum.st === 'bento') {
            if (m.rice < .3) { score -= 12; N('bite', 8, '左邊那格的飯太少，配菜配不完'); }
            const cs = m.cells || {}, empty = ['RT', 'RB'].filter(k => (cs[k] || 0) < .08);
            if (empty.length) { score -= 6 * empty.length; N('bite', 5, (empty.length > 1 ? '右邊兩格都' : '右邊有一格') + '空著，打開有點寒酸'); }
            if (!ids.some(id => MAIN.has(id))) { score -= 8; N('bite', 6, '沒有主菜，只有飯和小菜'); }
            if (!notes.bite.length) { score += 6; N('bite', 3, '飯和配菜的份量剛好', true); }
        } else if (sum.st === 'burger') {
            if (!m.mains) { score -= 14; N('bite', 8, '沒有肉也沒有蛋，咬下去空空的'); }
            if (m.top !== 'bunT') { score -= 10; N('bite', 7, '沒蓋上麵包，拿起來會散掉'); }
            if (m.layers > 11) { score -= 10; N('bite', 7, '疊太高了，嘴巴張不開'); }
            if (m.toast === 'burnt') { score -= 14; N('bite', 9, '烤太久，' + (m.burntId === 'bunB' || m.burntId === 'bunT' ? '麵包' : nm(m.burntId)) + '烤焦了，吃起來苦苦的'); }
            else if (m.toast === 'good') { score += 6; N('bite', 3, m.cheeseMelt ? '起司烤到融化，咬下去會牽絲' : '麵包烤得香香脆脆', true); }
            else if (m.toast === 'raw') N('bite', 2, '只烤到溫溫的，麵包還是軟的');
            if (m.leafHot) { score -= 4; N('bite', 4, '生菜也跟著進烤箱，軟掉了'); }
            if (!notes.bite.length) { score += 6; N('bite', 3, '一口咬下去每一層都吃得到', true); }
        } else if (sum.st === 'cup') {
            if (m.level < .35) { score -= 14; N('bite', 8, '只倒了一點點，像喝剩的'); }
            if (m.adds > 30) { score -= 8; N('bite', 6, '料比飲料還多，吸管一直卡住'); }
            if (m.kinds > 1 && m.mixed < .5) { score -= 6; N('bite', 5, '沒搖勻，上面跟下面味道不一樣'); }
            if (!m.ice) { score -= 3; N('bite', 2, '沒加冰，有點溫溫的'); }
            if (!notes.bite.length) { score += 6; N('bite', 3, '冰冰涼涼，料跟飲料的比例剛好', true); }
        } else if (sum.st === 'coffee') {
            if (m.shot <= 0) { score -= 18; N('bite', 9, '杯子裡沒有咖啡'); }
            else if (m.shot < .55) { score -= 10; N('bite', 7, '咖啡萃太短，喝起來水水的'); }
            else if (m.shot > .75) { score -= 10; N('bite', 7, '咖啡萃過頭，好苦'); }
            else { score += 6; N('bite', 3, '咖啡萃得剛好', true); }
            if (m.milkArt) { if (m.foam <= 0) { score -= 6; N('bite', 6, '奶沒打過就倒，沒有奶泡'); } else if (m.foam < .55) { score -= 5; N('bite', 5, '奶泡太粗，喝起來一顆一顆'); } else if (m.foam > .75) { score -= 5; N('bite', 5, '奶泡打過頭，硬硬的'); } }
        }
        // ── 賣相 ──
        if (sum.st === 'pizza' || sum.st === 'cake' || sum.st === 'bento') {
            if (sum.st !== 'bento' && m.cover < .3) { score -= 10; N('look', 7, '上面空了一大片，看起來還沒做完'); }
            else if (sum.st !== 'bento' && (m.lr < .22 || m.lr > .78)) { score -= 8; N('look', 6, '料全擠在' + (m.lr < .5 ? (sum.st === 'cake' ? '尖端那邊' : '左邊') : (sum.st === 'cake' ? '後面那邊' : '右邊')) + '，另一邊光禿禿的'); }
            else if (sum.st === 'cake' && m.cream && !m.onCream && m.pcs) { N('look', 2, '料都擺在旁邊，奶油上面沒有點綴', false); score -= 2; }
            else if (Object.keys(sum.por).length >= 4 && (sum.st === 'bento' || m.cover > .5)) { score += 8; N('look', 3, '顏色很豐富，擺得很好看', true); }
        } else if (sum.st === 'burger') {
            if (m.tilt > 13) { score -= 8; N('look', 6, '疊歪了，看起來快倒了'); }
            else if (m.layers >= 3) { score += 4; N('look', 2, '疊得很整齊', true); }
        } else if (sum.st === 'cup') {
            if (m.caps) { score += 4; N('look', 2, '上面那層很吸睛', true); }
            else if (m.sealed) { score += 2; N('look', 2, '搖得很均勻，看起來很專業', true); }
        } else if (sum.st === 'coffee') {
            if (m.art > 40) { score += 8; N('look', 3, '杯面有拉花，看了就想拍照', true); }
            else if (m.shot > 0 && !m.art && !m.dust && !m.floats) { score -= 4; N('look', 4, '表面光禿禿的'); }
        }
        if (!notes.look.length) N('look', 1, (S0.drink ? '看起來' : '擺盤') + '普通，沒什麼特別', false);
        score = Math.max(0, Math.min(100, Math.round(score)));
        const tier = score >= 85 ? 'S' : score >= 68 ? 'A' : score >= 50 ? 'B' : 'C';
        const pickLine = (arr) => arr.filter(x => !x.good).sort((a, z) => z.w - a.w)[0] || arr.filter(x => x.good).sort((a, z) => z.w - a.w)[0] || arr[0];
        const lines = [['taste', '味道'], ['bite', '口感'], ['look', '賣相']].map(([k, name]) => { const x = pickLine(notes[k]); return { judge: name, t: x.t, good: x.good }; });
        return { tier, score, lines };
    }
    function _autoName(sum) {
        const S0 = ST_BY[sum.st] || {};
        const ids = Object.keys(sum.por).filter(id => TASTE[id] && TASTE[id][2] && id !== 'ice' && id !== 'steam').sort((a, z) => (sum.por[z] || 0) - (sum.por[a] || 0));
        let noun = S0.noun || '';
        if (sum.st === 'coffee') noun = ids.includes('kmilk') ? '拿鐵' : '咖啡';
        const parts = ids.filter(id => !(sum.st === 'coffee' && (id === 'kmilk' || id === 'espresso'))).slice(0, 2).map(id => TASTE[id][2]);
        return (parts.join('') + noun).slice(0, 12) || ((S0.name || '') + '試作');
    }
    function _blurbOf(sum) {
        const ns = _usedNames(sum);
        return ns.length ? ('用了' + ns.slice(0, 4).join('、') + (ns.length > 4 ? '等 ' + ns.length + ' 樣' : '')).slice(0, 60) : '';
    }
    function _usedNames(sum) {   // 用了哪些料（多的排前面；打奶泡、倒奶泡都叫「奶泡」，只講一次）
        return Array.from(new Set(Object.keys(sum.por).filter(id => TASTE[id] && TASTE[id][2]).sort((a, z) => (sum.por[z] || 0) - (sum.por[a] || 0)).map(id => _nm(sum, id))));
    }

    // ================================================================
    // 💾 後廚資料、扣錢、上架、器材
    // ================================================================
    const _kitOf = (k) => Object.assign({ equip: {}, tried: {}, tries: 0, shelved: 0 }, k || {});
    async function _kit() { const B = _B(); return _kitOf(B ? await B.get(K_KIT, null) : null); }
    function _tryOne(sum) {   // 試做一份：扣料錢（同一盤試過了就直接看結果，不再扣）
        const B = _B(), key = _hash(sum.key).toString(36), cost = _costOf(sum);
        return B.locked(async () => {
            const kit = _kitOf(await B.getStrict(K_KIT, null));
            const v = judge(sum);
            if (kit.tried[key]) return { ok: true, v, key, again: true, cost: 0 };
            const fd = await B.fundLoad();
            if (fd.coins < cost) return { ok: false, why: '錢不夠（這一盤料要 ' + cost + '，帳戶剩 ' + fd.coins + '）' };
            fd.coins -= cost;
            kit.tried[key] = v.tier;
            const ks = Object.keys(kit.tried);
            if (ks.length > TRIED_MAX) ks.slice(0, ks.length - TRIED_MAX).forEach(k => { delete kit.tried[k]; });
            kit.tries = (kit.tries || 0) + 1;
            await B.set('fund', fd);
            await B.set(K_KIT, kit);
            return { ok: true, v, key, cost };
        });
    }
    function _shelve(sum, v, key, name, blurb, photo) {
        const B = _B();
        return B.locked(async () => {
            const menu = await B.getStrict('menu', []);
            if (menu.some(m => m.key === key)) return { ok: false, why: '這一盤已經在菜單上了' };
            const drink = !!(ST_BY[sum.st] || {}).drink;
            const P = drink ? (B.prices || { S: 48, A: 30 }) : FOOD_PRICES;
            const id = 'dish_' + Date.now(), img = 'dimg_' + id;
            if (photo) await B.set(img, photo);
            menu.unshift({ id, key, name: String(name || _autoName(sum)).slice(0, 12), blurb: String(blurb || _blurbOf(sum)).slice(0, 60),
                tier: v.tier, price: P[v.tier], tags: _tagsOf(sum), dish: { st: sum.st, img: photo ? img : '' }, unit: _costOf(sum), ts: Date.now(), sold: 0 });
            const kit = _kitOf(await B.getStrict(K_KIT, null));
            kit.shelved = (kit.shelved || 0) + 1;
            await B.set('menu', menu);
            await B.set(K_KIT, kit);
            if (photo) _imgCache.set(img, photo);
            return { ok: true };
        });
    }
    function _buyEquip(id) {
        const B = _B(), E = EQUIP[id];
        return B.locked(async () => {
            const kit = _kitOf(await B.getStrict(K_KIT, null));
            if (kit.equip[id]) return { ok: false, why: '已經有' + E.name + '了' };
            const fd = await B.fundLoad();
            if (fd.coins < E.price) return { ok: false, why: '錢不夠（' + E.name + '要 ' + E.price + '，帳戶剩 ' + fd.coins + '）' };
            fd.coins -= E.price;
            kit.equip[id] = Date.now();
            await B.set('fund', fd);
            await B.set(K_KIT, kit);
            return { ok: true };
        });
    }
    async function _askBuy(id) {
        const A = _A(), E = EQUIP[id];
        const yes = A && A.confirm ? await A.confirm('買一台' + E.name + '要 ' + E.price + ' 塊，從書咖帳戶扣，一次買斷、不收維修費。' + E.note + '。', { title: '買' + E.name }) : false;
        if (!yes) return false;
        const r = await _buyEquip(id);
        if (!r.ok) { if (A && A.toast) A.toast(r.why, { type: 'warn' }); return false; }
        const B = _B(); B && B.refreshStats && B.refreshStats();
        if (A && A.toast) A.toast(E.name + '搬進後廚了，' + E.note.replace('買了就', '現在'), { type: 'success' });
        return true;
    }
    // 做好的那一盤 → 一張去背圖：切掉四周透明的地方，最長邊 360
    function _photo(cv) {
        try {
            const w = cv.width, h = cv.height, d = cv.getContext('2d').getImageData(0, 0, w, h).data;
            let x0 = w, y0 = h, x1 = -1, y1 = -1;
            for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            if (x1 < 0) return '';
            x0 = Math.max(0, x0 - 6); y0 = Math.max(0, y0 - 6); x1 = Math.min(w, x1 + 6); y1 = Math.min(h, y1 + 6);
            const cw = x1 - x0, ch = y1 - y0, k = Math.min(1, 360 / Math.max(cw, ch));
            const o = cv.ownerDocument.createElement('canvas'); o.width = Math.max(1, Math.round(cw * k)); o.height = Math.max(1, Math.round(ch * k));
            o.getContext('2d').drawImage(cv, x0, y0, cw, ch, 0, 0, o.width, o.height);
            const webp = o.toDataURL('image/webp', .86);
            return /^data:image\/webp/.test(webp) ? webp : o.toDataURL('image/png');   // iPhone 舊版不會存 webp，退回 png
        } catch (e) { console.warn('[CafeKitchen] 存照片失敗', e); return ''; }
    }

    // ── 🗣 請熟客試吃（一按一通，task 'cafe'）──
    function _pickRegular(tags) {
        const R = win.OS_CAFE_REGULARS || window.OS_CAFE_REGULARS;
        if (!R || !R.PEOPLE) return null;
        let best = null, bestN = -1;
        R.PEOPLE.forEach(p => {
            const T = R.TYPES[p.type] || {};
            const n = (T.tags || []).filter(t => tags.includes(t)).length;
            if (n > bestN) { bestN = n; best = { name: p.name, label: T.label || '', likes: T.tags || [] }; }
        });
        return best;
    }
    async function _askRegular(sum, v) {
        const api = win.OS_API || window.OS_API;
        if (!api || !api.chat) return null;
        const who = _pickRegular(_tagsOf(sum));
        if (!who) return null;
        const S0 = ST_BY[sum.st] || {};
        const used = _usedNames(sum);
        let config = {};
        const OS = win.OS_SETTINGS || window.OS_SETTINGS;
        if (OS) {
            const sec = OS.getSecondaryConfig ? OS.getSecondaryConfig() : null;
            config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : OS.getConfig();
        }
        config = Object.assign({}, config || {});
        const prompt =
            '這裡是一間咖啡書店。店長在後廚試做了一份新的' + S0.name + '，請一位老客人先嚐。\n' +
            '老客人：' + who.name + '（' + who.label + '），平常偏愛' + who.likes.join('、') + '的口味。\n' +
            '這份用了：' + used.join('、') + '。\n' +
            '店裡的試吃員剛剛說：' + v.lines.map(l => l.judge + '——' + l.t).join('；') + '。\n' +
            '請用這位客人的口吻講一句吃完的感想，要講到吃到了什麼，30 字以內；再替這份取一個菜單上的名字，8 個字以內，不要直接把料名接起來。\n' +
            '只回 JSON：{"review":"感想","name":"名字"}，繁體中文。';
        try {
            const raw = await new Promise((resolve, reject) => {
                api.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { task: 'cafe', label: '書咖熟客試吃', keepCodeFences: true });
            });
            const mm = String(raw || '').match(/\{[\s\S]*\}/);
            const j = mm ? JSON.parse(mm[0]) : null;
            if (!j || !j.review) return null;
            return { who: who.name, label: who.label, review: String(j.review).slice(0, 60), name: String(j.name || '').slice(0, 12) };
        } catch (e) { console.warn('[CafeKitchen] 熟客試吃失敗', e); return null; }
    }

    // ================================================================
    // 🚪 後廚窗口
    // ================================================================
    let _win = null, _lastSt = 'burger';
    function close() {
        if (!_win) return;
        const w = _win; _win = null;
        try { w.eng && w.eng.stop(); } catch (e) {}
        clearInterval(w.timer);
        w.root.querySelectorAll('img').forEach(im => { im.src = BLANK; });   // 拆下的圖換成空白圖，記憶體才放得掉
        w.root.remove();
    }
    async function open(stKey) {
        const C = _C(), B = _B(), A = _A();
        if (!C || !B) { if (A && A.toast) A.toast('書咖還沒準備好，等一下再來', { type: 'info' }); return; }
        close();
        const doc = win.document;
        _ensureStyle(doc);
        let kit = await _kit();
        let fund = null;
        try { fund = await C.getFund(); } catch (e) {}
        const locked = (k) => !!(ST_BY[k] && ST_BY[k].equip && !kit.equip[ST_BY[k].equip]);
        let st0 = stKey && ST_BY[stKey] ? stKey : _lastSt;
        if (locked(st0)) st0 = 'burger';
        const tabHtml = (s) => '<button data-st="' + s.k + '" class="' + (s.k === st0 ? 'on' : '') + (locked(s.k) ? ' ock-locked' : '') + '">' + (locked(s.k) ? '<i class="fa-solid fa-lock"></i> ' : '') + s.name + '</button>';
        const root = doc.createElement('div');
        root.className = 'ock-win';
        root.innerHTML =
            '<div class="ock-shell">' +
              '<div class="ock-top">' +
                '<button class="ock-back"><i class="fa-solid fa-chevron-left"></i> 書咖</button>' +
                '<span class="ock-title">後廚' + (A && A.helpBtn ? A.helpBtn('cafe_kitchen') : '') + '</span>' +
                '<span class="ock-st">' + STATIONS.map(tabHtml).join('') + '</span>' +
              '</div>' +
              '<div class="ock-main">' +
                '<div class="ock-stage" data-ok="stage">' +
                  '<div class="ock-oven" data-ok="oven"><img data-ok="ovenImg" alt="" src="' + ART.open + '"><span class="ock-glow" data-ok="glow"></span></div>' +
                  '<div class="ock-dish" data-ok="dish"><canvas data-ok="cv"></canvas></div>' +
                  '<div class="ock-hint" data-ok="hint"></div>' +
                  '<div class="ock-meter" data-ok="meter"><b></b><i data-ok="meterBar"></i></div>' +
                '</div>' +
                '<div class="ock-side">' +   // 料：窄的時候在盤子下面，寬的時候（電腦）搬到右邊一欄
                  '<div class="ock-src" data-ok="src"></div>' +
                  '<div class="ock-tray" data-ok="tray"></div>' +
                  '<div class="ock-cost" data-ok="cost"></div>' +
                  '<div class="ock-act" data-ok="act"></div>' +
                '</div>' +
              '</div>' +
              '<div class="ock-res" data-ok="res"></div>' +
            '</div>';
        // 跟 SN 白板一樣掛在大廳畫面（.lobby-left）上、蓋住整個場景，右邊讓出大廳那排鈕；沒有大廳才蓋整個視窗
        const host = doc.querySelector('.lobby-left');
        if (!host) root.classList.add('ock-fixed');
        (host || doc.body).appendChild(root);
        const $ = (k) => root.querySelector('[data-ok="' + k + '"]');
        const W0 = { root, eng: null, timer: null };
        _win = W0;
        root.querySelector('.ock-back').addEventListener('click', close);
        let lastKey = '', lastCost = -1;
        const paintCost = () => {
            if (!W0.eng || !root.isConnected) return;
            const sum = W0.eng.summary(false), key = _hash(sum.key).toString(36), cost = _costOf(sum);
            const go = $('go');
            if (key === lastKey && cost === lastCost && go && go.dataset.painted) return;
            lastKey = key; lastCost = cost;
            const tried = !!kit.tried[key], miss = _missing(sum), poor = !tried && fund && fund.coins < cost;
            $('cost').innerHTML = miss ? '' : tried ? '<i class="fa-solid fa-eye"></i> 這一盤試過了，再按不會扣錢'
                : '這一盤料錢 <b>' + cost + '</b> 塊' + (fund ? '・帳戶剩 ' + fund.coins : '') + (poor ? '<span class="ock-poor">錢不夠</span>' : '');
            if (go) { go.dataset.painted = '1'; go.classList.toggle('ock-dim', !!miss || !!poor); }
        };
        const api = {
            locked,
            unlock: async (k) => {
                const S0 = ST_BY[k];
                if (!(await _askBuy(S0.equip))) return;
                kit = await _kit();
                try { fund = await C.getFund(); } catch (e) {}
                const b = root.querySelector('[data-st="' + k + '"]');
                if (b) { b.classList.remove('ock-locked'); b.textContent = S0.name; }
                lastKey = '';
            },
            can: () => {   // 「完成」「送進烤箱」按下去之前：空盤、錢不夠就先講
                if (!W0.eng) return false;
                const sum = W0.eng.summary(false), miss = _missing(sum);
                if (miss) { W0.eng.hint(miss); return false; }
                const key = _hash(sum.key).toString(36), cost = _costOf(sum);
                if (!kit.tried[key] && fund && fund.coins < cost) { W0.eng.hint('錢不夠：這一盤料要 ' + cost + ' 塊，帳戶剩 ' + fund.coins); return false; }
                return true;
            },
            built: () => { lastKey = ''; _lastSt = W0.eng ? W0.eng.st : _lastSt; },
            done: () => { if (root.isConnected) onDone(); },
        };
        const onDone = async () => {
            const eng = W0.eng, sum = eng.summary(true), go = $('go');
            const miss = _missing(sum);
            if (miss) { eng.hint(miss); return; }
            if (go) go.disabled = true;
            const r = await _tryOne(sum);
            if (!root.isConnected) return;
            if (!r.ok) { eng.hint(r.why); if (go) go.disabled = false; return; }
            if (!r.again) { kit.tried[r.key] = r.v.tier; try { fund = await C.getFund(); } catch (e) {} B.refreshStats && B.refreshStats(); }
            lastKey = '';
            const photo = _photo(eng.snapCanvas());
            await showResult(sum, r, photo);
            if (go) go.disabled = false;
        };
        const showResult = async (sum, r, photo) => {
            const T = B.tierText || {}, v = r.v, ok = v.tier === 'S' || v.tier === 'A';
            const menu = await C.getMenu();
            const onMenu = menu.some(m => m.key === r.key);
            const tt = T[v.tier] || { label: v.tier, cls: 'a' };
            const baked = W0.eng.baked;
            const res = $('res');
            res.innerHTML =
                '<div class="ock-card">' +
                  '<div class="ock-card-head"><span class="oc-badge ' + tt.cls + '">' + _esc(tt.label) + '</span>' +
                    '<span class="ock-card-cost">' + (r.again ? '試過了，這次沒扣錢' : '花了 ' + r.cost + ' 塊') + '</span></div>' +
                  (photo ? '<img class="ock-photo" alt="" src="' + photo + '">' : '') +
                  v.lines.map(l => '<div class="ock-line' + (l.good ? ' good' : '') + '"><b>' + l.judge + '</b><span>' + _esc(l.t) + '</span></div>').join('') +
                  '<div class="ock-ai"></div>' +
                  (onMenu ? '<div class="ock-note">這一盤已經在菜單上了。</div>'
                      : ok ? '<div class="ock-name"><input class="ock-name-in" maxlength="12" value="' + _esc(_autoName(sum)) + '"><button class="ock-shelf"><i class="fa-solid fa-arrow-up-from-bracket"></i> 上架</button></div>'
                          : '<div class="ock-note">' + (r.again ? '' : '這一盤當員工餐了。') + (baked ? '再做一個試試。' : '按「繼續改」回去動一下再試。') + '</div>') +
                  '<button class="ock-askai"><i class="fa-solid fa-comment-dots"></i> 請熟客試吃（叫一次 AI）</button>' +
                  '<div class="ock-card-act">' + (baked ? '' : '<button class="ock-ghost" data-r="keep">繼續改</button>') + '<button data-r="again">再做一個</button></div>' +
                '</div>';
            res.classList.add('on');
            res.scrollTop = 0;
            let ai = null, typed = false;
            res.querySelector('.ock-name-in')?.addEventListener('input', () => { typed = true; });
            res.querySelector('.ock-askai').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 熟客在吃…';
                ai = await _askRegular(sum, v);
                if (!root.isConnected) return;
                btn.remove();
                const slot = res.querySelector('.ock-ai');
                if (!slot) return;
                if (!ai) { slot.innerHTML = '<div class="ock-why">這次沒問到（連線失敗或沒設好模型），等一下再試。</div>'; return; }
                slot.innerHTML = '<div class="ock-line ai"><b>' + _esc(ai.who) + '</b><span>「' + _esc(ai.review) + '」</span></div>';
                const inp = res.querySelector('.ock-name-in');
                if (inp && ai.name && !typed) inp.value = ai.name;
            });
            res.querySelector('.ock-shelf')?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                const name = (res.querySelector('.ock-name-in')?.value || '').trim();
                const sr = await _shelve(sum, v, r.key, name, ai ? ai.review : '', photo);
                const box = btn.closest('.ock-name');
                if (!sr.ok) { btn.disabled = false; box.insertAdjacentHTML('afterend', '<div class="ock-why">' + _esc(sr.why) + '</div>'); return; }
                box.outerHTML = '<div class="ock-note"><i class="fa-solid fa-utensils"></i>「' + _esc(name || _autoName(sum)) + '」上架了！回書咖「菜單」頁備料。</div>';
            });
            res.querySelector('.ock-card-act').addEventListener('click', (e) => {
                const b = e.target.closest('[data-r]');
                if (!b) return;
                res.classList.remove('on');
                res.querySelectorAll('img').forEach(im => { im.src = BLANK; });
                res.innerHTML = '';
                if (b.dataset.r === 'again') W0.eng.reset();
            });
        };
        W0.eng = _engine(root, { st: st0, bg: ART.bg, oven: ART }, api);
        _lastSt = st0;
        W0.timer = win.setInterval(() => { if (!root.isConnected) { win.clearInterval(W0.timer); return; } paintCost(); }, 450);
        paintCost();
    }

    // ================================================================
    // 🖼 書咖「研發」頁：後廚門口
    // ================================================================
    function _registerHelp() {
        const A = _A();
        if (!A || !A.registerHelp || _registerHelp.done) return;
        _registerHelp.done = true;
        A.registerHelp({ cafe_kitchen: { title: '後廚', body:
            '上面選一個檯子：漢堡、咖啡、手搖杯、便當、披薩、蛋糕。下面點一樣料，再到盤子上點、拖、按住。\n' +
            '料盤上面那排可以切到別檯的料，什麼料都能放到任何一檯，放放看。\n' +
            '按「完成」＝試做一份：料錢從書咖帳戶扣，不扣體力、不用等。同一盤試過了再按不會再扣。\n' +
            '三位試吃員照規則講：味道、口感、賣相各一句。同一盤永遠同一個結果。\n' +
            '「靈感之作」「優良」可以上架，做好的那一盤就是菜單上的照片，名字可以自己改；上架後到菜單頁備料，做一批照這一盤的料錢算。\n' +
            '「請熟客試吃」會叫一次模型（設置裡「書咖」那一列），請一位口味最對的常客講感想、取名字，不會改等級，不按也能上架。\n' +
            '披薩要先買烤箱：點披薩那一檯會問要不要買。漢堡也能「烤一下」（同一台烤箱）：疊好的那幾層一起烤，麵包變金黃、起司片融化往下垂，烤兩次就焦了；之後再疊上去的是新鮮的。\n' +
            '進烤箱的料各有變化：起司融成一灘、奶油和冰淇淋化掉、冰塊變水、可可粉糊開、葉子軟掉、肉和飯上色。' }
        });
    }
    async function render(body) {
        const C = _C(), B = _B(), A = _A();
        if (!C || !B) { body.innerHTML = '<div class="oc-empty">後廚還沒準備好，等一下再來看。</div>'; return; }
        _ensureStyle(win.document);
        _registerHelp();
        let old = null;
        try { old = B.finishRd ? await B.finishRd() : null; } catch (e) {}
        const kit = await _kit();
        body.innerHTML =
            '<div class="ock-door">' +
              '<div class="ock-door-pic"><img alt="" src="' + ART.bg + '"></div>' +
              '<div class="ock-door-copy"><b>後廚' + (A && A.helpBtn ? A.helpBtn('cafe_kitchen') : '') + '</b><small>六個檯子，什麼料都能放放看。做好的那一盤就是菜單上的照片。</small></div>' +
              '<button class="oc-brew ock-enter"><i class="fa-solid fa-door-open"></i> 進後廚</button>' +
              '<div class="ock-door-stat">試做過 ' + (kit.tries || 0) + ' 盤・上架 ' + (kit.shelved || 0) + ' 道</div>' +
            '</div>' +
            (old ? '<div class="oc-slot-label">改版前調配的那杯好了</div><div class="ock-old"></div>' : '') +
            '<div class="oc-slot-label">器材</div>' +
            '<div class="ock-equip">' + Object.keys(EQUIP).map(id => {
                const E = EQUIP[id], have = !!kit.equip[id];
                return '<div class="ock-eq' + (have ? ' have' : '') + '"><i class="fa-solid ' + E.icon + '"></i><span><b>' + E.name + '</b><small>' + (have ? '後廚裡有了，' + E.note.replace('買了就', '') : E.note + '・' + E.price + ' 塊') + '</small></span>' +
                    (have ? '' : '<button class="ock-buy" data-eq="' + id + '">買</button>') + '</div>';
            }).join('') + '</div>';
        if (old) B.labResult(body.querySelector('.ock-old'), old.key, old.tier, old.b, old.f, old.t);
        body.querySelector('.ock-enter').addEventListener('click', () => open());
        body.querySelector('.ock-door-pic').addEventListener('click', () => open());
        body.querySelector('.ock-equip').addEventListener('click', async (e) => {
            const btn = e.target.closest('.ock-buy');
            if (!btn) return;
            btn.disabled = true;
            const okk = await _askBuy(btn.dataset.eq);
            if (!okk) { btn.disabled = false; return; }
            render(body);
        });
    }

    // ── 菜單上的小圖：後廚做的那一盤照片（存在 dimg_<菜單id>，第一次要用才讀）；改版前的研發台做的沒有照片，給一個圖示 ──
    const _imgCache = new Map(), _imgWant = new Set();
    let _imgTimer = null;
    function _loadImgs() {
        _imgTimer = null;
        const B = _B(), keys = Array.from(_imgWant);
        _imgWant.clear();
        if (!B) return;
        keys.forEach(async (k) => {
            let v = '';
            try { v = await B.get(k, ''); } catch (e) {}
            _imgCache.set(k, v || '');
            if (!v) return;
            win.document.querySelectorAll('img[data-ock-img="' + k + '"]').forEach(im => { im.src = v; });
        });
    }
    function thumb(dish) {
        _ensureStyle(win.document);
        if (dish && dish.img) {
            const k = String(dish.img), v = _imgCache.get(k);
            if (v === undefined && !_imgWant.has(k)) { _imgWant.add(k); if (!_imgTimer) _imgTimer = setTimeout(_loadImgs, 0); }
            return '<img class="ock-thumb" data-ock-img="' + _esc(k) + '" alt="" src="' + (v || BLANK) + '">';
        }
        const icon = { cup: 'fa-mug-hot', coffee: 'fa-mug-hot', burger: 'fa-burger', cake: 'fa-cake-candles', bento: 'fa-bowl-rice', pizza: 'fa-pizza-slice' }[dish && (dish.st || dish.base)] || 'fa-utensils';
        return '<span class="ock-thumb ock-thumb-icon"><i class="fa-solid ' + icon + '"></i></span>';
    }
    async function dishImg(menuId) {   // 端盤子、別的地方要用這道菜的照片
        const k = 'dimg_' + menuId;
        if (_imgCache.has(k)) return _imgCache.get(k) || null;
        const B = _B();
        let v = '';
        try { v = B ? await B.get(k, '') : ''; } catch (e) {}
        _imgCache.set(k, v || '');
        return v || null;
    }
    function tags() { return Array.from(new Set(Object.keys(TASTE).map(id => TASTE[id][0]).filter(Boolean))); }

    // ================================================================
    // 🎨 樣式（後廚窗口照小樣 v2；研發頁門口卡、菜單小圖）
    // ================================================================
    function _ensureStyle(doc) {
        if (!doc || doc.getElementById('os-cafe-kitchen-style')) return;
        const st = doc.createElement('style');
        st.id = 'os-cafe-kitchen-style';
        st.textContent =
            /* 窗口：跟 SN 白板一樣掛在大廳畫面上（右邊讓出 78px 給大廳那排鈕），浮在 NPC 泡泡上面、💬 浮鈕下面；手機整個蓋滿 */
            '.ock-win{--ink:#4b3424;--soft:#8a6a4a;--cream:#fbf4ea;--line:#d8c3a1;--btn:#7a4f2d;position:absolute;inset:12px 78px 12px 12px;z-index:3450;display:flex;overflow:hidden;border-radius:18px;background:var(--cream);box-shadow:0 18px 40px rgba(40,25,15,.38);container:ock / inline-size;font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;color:var(--ink);}' +
            '.ock-win.ock-fixed{position:fixed;inset:0;border-radius:0;}' +
            '@media (max-width:760px){.ock-win{inset:0;border-radius:0;z-index:3600;}}' +
            '.ock-win *{box-sizing:border-box;}.ock-win button{font-family:inherit;cursor:pointer;}' +
            '.ock-shell{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;overflow-x:hidden;overflow-y:auto;background:var(--cream);padding-bottom:env(safe-area-inset-bottom);}' +
            '.ock-main{flex:1 0 auto;display:flex;flex-direction:column;min-height:0;}' +
            '.ock-side{flex:none;display:flex;flex-direction:column;min-width:0;background:#fffaf2;border-top:1px solid var(--line);}' +
            '.ock-top{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fffaf2;border-bottom:1px solid var(--line);flex:none;}' +
            '.ock-fixed .ock-top{padding-top:max(10px,env(safe-area-inset-top));}' +   // 只有沒大廳、蓋整個視窗時才會碰到 iPhone 的瀏海
            '.ock-back{border:1px solid var(--line);background:#fff;border-radius:10px;padding:6px 10px;color:var(--ink);font-size:13px;flex:none;}' +
            '.ock-title{display:flex;align-items:center;gap:4px;font-weight:800;font-size:15px;flex:none;}' +
            '.ock-st{display:flex;gap:6px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none;}.ock-st::-webkit-scrollbar{display:none;}' +
            '.ock-st button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 10px;white-space:nowrap;font-size:12px;color:var(--ink);}' +
            '.ock-st button.on{background:#f2dfc6;border-color:#b77b42;font-weight:700;}.ock-st button.ock-locked{color:#a99278;}' +
            '.ock-stage{position:relative;flex:1 1 auto;min-height:300px;container-type:size;overflow:hidden;background:linear-gradient(#f4efe6 0 46%,#e9e2d6 46% 52%,#cfd5da 52%,#b8c0c7 64%,#a9b1b8 100%);background-size:cover;background-position:center 70%;}' +
            '.ock-stage.has-bg{background-image:url("' + ART.bg + '");}' +
            '.ock-dish{position:absolute;left:50%;bottom:3%;width:min(94%,420px);width:min(94cqw,118cqh,760px);transform:translateX(-50%);touch-action:none;user-select:none;-webkit-user-select:none;transition:transform .6s ease-in,opacity .6s ease-in;}' +
            '.ock-dish.in-oven{transform:translateX(-50%) translate(30%,-24%) scale(.3);opacity:0;}' +
            '.ock-dish canvas{width:100%;display:block;}' +
            '.ock-oven{position:absolute;right:3%;bottom:30%;width:34%;width:min(34cqw,46cqh);opacity:0;transform:translateX(30px);transition:.35s;pointer-events:none;}.ock-oven.on{opacity:1;transform:none;}.ock-oven img{width:100%;display:block;}' +
            '.ock-glow{position:absolute;left:36%;top:44%;width:28%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,rgba(255,170,60,.95),rgba(255,120,40,.5) 55%,transparent 72%);opacity:0;transition:opacity .4s;}' +
            '.ock-glow.on{opacity:1;animation:ockFlick 1.2s ease-in-out infinite;}@keyframes ockFlick{50%{opacity:.75;}}' +
            '.ock-hint{position:absolute;left:10px;top:10px;right:10px;font-size:12px;color:#fff;background:rgba(60,40,25,.55);padding:6px 10px;border-radius:10px;pointer-events:none;}' +
            '.ock-src{display:flex;gap:6px;padding:8px 12px 0;overflow-x:auto;scrollbar-width:none;flex:none;}.ock-src::-webkit-scrollbar{display:none;}' +
            '.ock-src button{flex:none;border:1px solid var(--line);background:#fff;border-radius:999px;padding:4px 10px;font-size:11px;color:var(--soft);white-space:nowrap;}' +
            '.ock-src button.on{background:#7a4f2d;border-color:#6d4425;color:#fff8ed;font-weight:700;}' +
            '.ock-tray{display:flex;gap:8px;padding:10px 12px;overflow-x:auto;scrollbar-width:thin;flex:none;}' +
            '.ock-ing{flex:none;width:66px;border:1px solid var(--line);background:#fff;border-radius:14px;padding:5px 4px;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;color:var(--ink);}' +
            '.ock-ing.on{background:#f2dfc6;border-color:#b77b42;font-weight:700;box-shadow:0 0 0 2px rgba(183,123,66,.2);}.ock-ing canvas{width:40px;height:40px;display:block;}' +
            '.ock-cost{min-height:18px;padding:0 14px;font-size:11.5px;color:var(--soft);flex:none;}.ock-cost b{color:var(--ink);}' +
            '.ock-poor{margin-left:6px;color:#b65050;font-weight:700;}' +
            '.ock-act{display:flex;gap:8px;padding:8px 12px 16px;flex:none;}' +
            /* 寬的時候（電腦）：盤子吃滿左邊，料盤搬到右邊一欄、一格一格排、自己捲 */
            '@container ock (min-width:720px){' +
              '.ock-shell{overflow:hidden;}.ock-main{flex:1 1 0;flex-direction:row;}.ock-stage{min-height:0;}' +
              '.ock-side{width:312px;border-top:0;border-left:1px solid var(--line);min-height:0;}' +
              '.ock-src{flex-wrap:wrap;overflow:visible;padding:12px 12px 2px;}' +
              '.ock-tray{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));align-content:start;overflow-x:hidden;overflow-y:auto;}' +
              '.ock-ing{width:auto;}.ock-cost{padding:8px 14px 0;}.ock-hint{right:auto;max-width:min(560px,calc(100% - 20px));}' +
            '}' +
            '.ock-act button{flex:1;border-radius:12px;padding:11px 0;font-weight:800;font-size:13px;border:1px solid #6d4425;background:var(--btn);color:#fff8ed;}' +
            '.ock-act button.ock-ghost{background:#fff;color:var(--ink);border-color:var(--line);flex:.6;}.ock-act button.on{background:#f2dfc6;border-color:#b77b42;}' +
            '.ock-act button.ock-dim{opacity:.55;}.ock-act button:disabled{opacity:.5;cursor:default;}' +
            '.ock-meter{position:absolute;left:8%;right:8%;bottom:10px;height:16px;border-radius:999px;background:rgba(255,255,255,.7);border:1px solid #b9a07c;overflow:hidden;display:none;}.ock-meter.on{display:block;}' +
            '.ock-meter b{position:absolute;top:0;bottom:0;left:55%;width:20%;background:rgba(120,190,110,.45);}' +
            '.ock-meter i{position:absolute;top:0;bottom:0;left:0;width:0;background:linear-gradient(90deg,#f6d27a,#e08a3c,#7a3a1a);}' +
            '.ock-res{position:absolute;inset:0;z-index:5;background:rgba(43,35,32,.55);display:none;justify-content:center;align-items:flex-start;padding:16px;overflow-y:auto;}.ock-res.on{display:flex;}' +
            '.ock-card{background:#fffaf2;border:1px solid #b77b42;border-radius:16px;padding:14px;width:100%;max-width:340px;margin:auto 0;box-shadow:0 8px 22px rgba(0,0,0,.25);animation:ockPop .35s cubic-bezier(.3,1.6,.5,1);}' +
            '@keyframes ockPop{from{transform:scale(.7);opacity:0;}}' +
            '.ock-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;}.ock-card-head .oc-badge{font-size:12px;padding:3px 9px;}' +
            '.ock-card-cost{font-size:11px;color:var(--soft);}' +
            '.ock-photo{display:block;width:100%;max-height:220px;object-fit:contain;margin:0 auto 10px;background:radial-gradient(ellipse at 50% 60%,#fff 0,#f4ead9 75%);border:1px solid var(--line);border-radius:12px;padding:6px;}' +
            '.ock-line{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.5;padding:6px 0;border-top:1px dashed #e4d3b6;}' +
            '.ock-line b{flex:none;font-size:11px;padding:1px 7px;border-radius:7px;background:#f3e3cc;color:#7a5230;margin-top:1px;}' +
            '.ock-line.good b{background:#dcefd9;color:#3f7448;}.ock-line.ai b{background:#efe2f4;color:#6d4a7c;}' +
            '.ock-name{display:flex;gap:6px;margin-top:10px;}.ock-name-in{flex:1;min-width:0;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:13px;color:var(--ink);background:#fff;}' +
            '.ock-shelf{flex:none;border-radius:10px;padding:0 12px;font-weight:800;font-size:12.5px;border:1px solid #6d4425;background:var(--btn);color:#fff8ed;}' +
            '.ock-note{margin-top:10px;font-size:12px;color:var(--soft);}.ock-note i{margin-right:4px;}.ock-why{margin-top:8px;font-size:12px;color:#b65050;}' +
            '.ock-askai{display:block;width:100%;margin-top:10px;border-radius:10px;padding:8px 0;font-size:12px;border:1px dashed #b99a74;background:transparent;color:#7a5230;}' +
            '.ock-card-act{display:flex;gap:8px;margin-top:10px;}.ock-card-act button{flex:1;border-radius:12px;padding:10px 0;font-weight:800;font-size:13px;border:1px solid #6d4425;background:var(--btn);color:#fff8ed;}' +
            '.ock-card-act button.ock-ghost{background:#fff;color:var(--ink);border-color:var(--line);}' +
            /* 研發頁：後廚門口 */
            '.ock-door{position:relative;border:1px solid #d9c3a0;border-radius:16px;overflow:hidden;background:#fffaf2;margin-bottom:12px;}' +
            '.ock-door-pic{height:150px;overflow:hidden;cursor:pointer;}.ock-door-pic img{display:block;width:100%;height:100%;object-fit:cover;object-position:center 62%;}' +
            '.ock-door-copy{display:flex;flex-direction:column;gap:3px;padding:10px 12px 0;}.ock-door-copy b{display:flex;align-items:center;gap:4px;font-size:15px;color:#5e4028;}.ock-door-copy small{font-size:12px;color:#8a6a4a;line-height:1.5;}' +
            '.ock-door .ock-enter{display:block;width:calc(100% - 24px);margin:10px 12px 6px;}' +
            '.ock-door-stat{padding:0 12px 10px;font-size:11px;color:#a08566;}' +
            '.ock-equip{display:flex;flex-direction:column;gap:6px;}.ock-eq{display:flex;align-items:center;gap:10px;border:1px solid #e3d2b6;border-radius:12px;padding:8px 10px;background:rgba(255,255,255,.6);}' +
            '.ock-eq > i{font-size:16px;color:#9a6a3a;width:20px;text-align:center;}.ock-eq span{flex:1;display:flex;flex-direction:column;}.ock-eq small{font-size:11px;color:#8a6a4a;}' +
            '.ock-eq.have > i{color:#4e8155;}.ock-buy{border:1px solid #6d4425;background:#7a4f2d;color:#fff8ed;border-radius:9px;padding:5px 12px;font-size:12px;}' +
            /* 菜單上的小圖 */
            '.ock-thumb{display:block;width:40px;height:40px;object-fit:contain;}.ock-thumb-icon{display:grid;place-items:center;font-size:19px;color:#9a6a3a;}';
        doc.head.appendChild(st);
    }

    win.OS_CAFE_KITCHEN = window.OS_CAFE_KITCHEN = { render, open, close, thumb, dishImg, tags, judge };
})();
