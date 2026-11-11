// ----------------------------------------------------------------
// [檔案] os_cafe_kitchen.js
// 路徑：os_phone/os/os_cafe_kitchen.js
// 職責：🍳 書咖研發台（11-12，調配＋創想合成一頁）。
//   一輪：選底 → 點料放上去 → 試做一份（料錢就是代價，不扣體力、不用等）→ 三位試吃員照規則說「哪一層出問題」→ 改一層再試或上架。
//   底：飲料杯／漢堡／蛋糕（由下往上疊）、便當（格子）、披薩（鋪面，要先買烤箱）。
//   試吃照規則算、同一份永遠同一個結果、不花 AI 錢；另有一顆「請熟客試吃」叫一次模型（task 'cafe'），只寫評語和取名、不改分數。
//   上架的菜進同一份菜單（app_data book_cafe/menu），帶 dish（畫縮圖）和 unit（做一批照料單扣錢）。
//   錢、菜單、研發台資料的寫入一律走 OS_CAFE._b.locked（跟結算同一條排隊）。要排在 os_cafe.js 後面。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const K_KIT = 'kitchen';   // {equip:{oven:ts}, tried:{buildKey:tier}, tries, shelved}

    // ── 🥪 底 ──
    //   stack＝由下往上疊（側面看）；cells＝放進格子或區域（正上方看）
    const BASES = {
        cup:    { name: '飲料', icon: 'fa-mug-hot',       kind: 'stack', max: 4, frame: [],                    frameCost: 0, drink: true, noun: '' },
        burger: { name: '漢堡', icon: 'fa-burger',        kind: 'stack', max: 5, frame: ['bun_b', 'bun_t'],     frameCost: 4, frameName: '麵包', noun: '堡' },
        cake:   { name: '蛋糕', icon: 'fa-cake-candles',  kind: 'stack', max: 5, frame: ['sponge'],            frameCost: 5, frameName: '蛋糕胚', noun: '蛋糕' },
        bento:  { name: '便當', icon: 'fa-bowl-rice',     kind: 'cells', frameCost: 2, frameName: '便當盒', noun: '便當',
                  cells: [{ k: 'main', name: '主食格', roles: ['grain'] }, { k: 's1', name: '小格一' }, { k: 's2', name: '小格二' }, { k: 's3', name: '小格三' }] },
        pizza:  { name: '披薩', icon: 'fa-pizza-slice',   kind: 'cells', frameCost: 6, frameName: '餅皮', noun: '披薩', equip: 'oven',
                  cells: [{ k: 'whole', name: '全面', roles: ['psauce'] }, { k: 'left', name: '左半邊' }, { k: 'right', name: '右半邊' }, { k: 'dots', name: '點綴' }] },
    };
    const BASE_ORDER = ['cup', 'burger', 'cake', 'bento', 'pizza'];
    // 底的固定部分（不在料庫裡，錢算在 frameCost）
    const FRAME = {
        bun_b:  { name: '下層麵包', col: '#d9a35a', tone: 'l', shape: 'bunb' },
        bun_t:  { name: '上層麵包', col: '#dca85f', tone: 'l', shape: 'bunt' },
        sponge: { name: '蛋糕胚',   col: '#f0d29a', tone: 'l', shape: 'sponge' },
    };

    // ── 🧺 料（cost＝一份幾塊；str＝味道多重 1～3；tone＝深 d／淺 l，切面一深一淺才看得出分層）──
    //   role：main 主角、side 配料、sauce 醬、cream 奶油、top 頂上的、liquid 飲料、grain 主食、psauce 披薩底醬、ptop 披薩料
    const ING = [
        // 飲料（舊調配台的料都在）
        { id: 'coffee', name: '手沖咖啡', s: '咖啡', tag: '苦韻', cost: 3, role: 'liquid', str: 2, col: '#4b2e1f', tone: 'd', use: ['cup'] },
        { id: 'tea', name: '伯爵紅茶', s: '紅茶', tag: '茶香', cost: 3, role: 'liquid', str: 1, col: '#a85a2a', tone: 'd', use: ['cup'] },
        { id: 'soda', name: '氣泡水', s: '氣泡', tag: '清爽', cost: 2, role: 'liquid', str: 1, col: '#cfe8ef', tone: 'l', use: ['cup'] },
        { id: 'milk', name: '牛奶', s: '牛奶', tag: '綿密', cost: 2, role: 'liquid', str: 1, col: '#f6f1e6', tone: 'l', use: ['cup'] },
        { id: 'floral', name: '花香糖漿', s: '花香', tag: '花香', cost: 2, role: 'sauce', str: 3, col: '#e6a3c0', tone: 'l', use: ['cup'] },
        { id: 'berry', name: '莓果醬', s: '莓果', tag: '果酸', cost: 3, role: 'sauce', str: 3, col: '#8e2a4a', tone: 'd', use: ['cup', 'cake'] },
        { id: 'caramel', name: '焦糖', s: '焦糖', tag: '甜', cost: 2, role: 'sauce', str: 3, col: '#b0702a', tone: 'd', use: ['cup', 'cake'] },
        { id: 'spice', name: '辛香料', s: '辛香', tag: '辛暖', cost: 2, role: 'sauce', str: 2, col: '#a0522d', tone: 'd', use: ['cup'] },
        { id: 'foam', name: '奶泡拉花', s: '奶泡', tag: '綿密', cost: 2, role: 'top', str: 1, col: '#fff8ee', tone: 'l', use: ['cup'], shape: 'foam' },
        { id: 'cookie', name: '手工餅乾', s: '餅乾', tag: '酥脆', cost: 3, role: 'top', str: 1, col: '#c58f52', tone: 'd', use: ['cup'], shape: 'bits' },
        { id: 'mint', name: '薄荷冰珠', s: '薄荷', tag: '沁涼', cost: 2, role: 'top', str: 1, col: '#bfe9e0', tone: 'l', use: ['cup'], shape: 'bits' },
        // 漢堡
        { id: 'beef', name: '牛肉餅', s: '牛肉', tag: '鹹香', cost: 6, role: 'main', str: 2, col: '#6b3a22', tone: 'd', use: ['burger'], shape: 'patty' },
        { id: 'chicken', name: '炸雞排', s: '炸雞', tag: '酥脆', cost: 6, role: 'main', str: 2, col: '#c98a3c', tone: 'd', use: ['burger'], shape: 'patty' },
        { id: 'egg', name: '煎蛋', s: '蛋', tag: '綿密', cost: 3, role: 'main', str: 1, col: '#f4e6c4', tone: 'l', use: ['burger'], shape: 'egg' },
        { id: 'cheese', name: '起司片', s: '起司', tag: '綿密', cost: 3, role: 'side', str: 1, col: '#f2c14e', tone: 'l', use: ['burger'], shape: 'slice' },
        { id: 'bacon', name: '培根', s: '培根', tag: '鹹香', cost: 4, role: 'side', str: 2, col: '#b5503c', tone: 'd', use: ['burger'], shape: 'slice' },
        { id: 'lettuce', name: '生菜', s: '生菜', tag: '清爽', cost: 2, role: 'side', str: 1, col: '#7fb04a', tone: 'l', use: ['burger'], shape: 'leaf' },
        { id: 'tomato', name: '番茄片', s: '番茄', tag: '果酸', cost: 2, role: 'side', str: 1, col: '#d9483b', tone: 'd', use: ['burger'], shape: 'fruit' },
        { id: 'onion', name: '洋蔥圈', s: '洋蔥', tag: '酥脆', cost: 2, role: 'side', str: 1, col: '#e2b765', tone: 'l', use: ['burger'], shape: 'bits' },
        { id: 'pickle', name: '酸黃瓜', s: '酸瓜', tag: '果酸', cost: 2, role: 'side', str: 1, col: '#8a9a3a', tone: 'd', use: ['burger'], shape: 'fruit' },
        { id: 'teri', name: '照燒醬', s: '照燒', tag: '甜', cost: 2, role: 'sauce', str: 3, col: '#5a2e1a', tone: 'd', use: ['burger'] },
        { id: 'hot', name: '辣醬', s: '辣味', tag: '辛暖', cost: 2, role: 'sauce', str: 3, col: '#c1272d', tone: 'd', use: ['burger'] },
        { id: 'mustard', name: '蜂蜜芥末', s: '芥末', tag: '甜', cost: 2, role: 'sauce', str: 2, col: '#e0b02e', tone: 'l', use: ['burger'] },
        // 蛋糕
        { id: 'cream', name: '鮮奶油', s: '奶油', tag: '綿密', cost: 3, role: 'cream', str: 1, col: '#fbf6ec', tone: 'l', use: ['cake'], shape: 'cream' },
        { id: 'custard', name: '卡士達', s: '卡士達', tag: '甜', cost: 3, role: 'cream', str: 1, col: '#f3d77a', tone: 'l', use: ['cake'], shape: 'cream' },
        { id: 'matcha', name: '抹茶奶油', s: '抹茶', tag: '茶香', cost: 4, role: 'cream', str: 2, col: '#9cbf6b', tone: 'l', use: ['cake'], shape: 'cream' },
        { id: 'straw', name: '草莓', s: '草莓', tag: '果酸', cost: 4, role: 'side', str: 1, col: '#e0475b', tone: 'd', use: ['cake'], shape: 'fruit' },
        { id: 'choco', name: '巧克力醬', s: '巧克力', tag: '苦韻', cost: 3, role: 'sauce', str: 3, col: '#4a2a1a', tone: 'd', use: ['cake'] },
        { id: 'nuts', name: '堅果碎', s: '堅果', tag: '酥脆', cost: 3, role: 'top', str: 1, col: '#b98a5a', tone: 'd', use: ['cake'], shape: 'bits' },
        { id: 'sprinkle', name: '巧克力顆粒', s: '顆粒', tag: '甜', cost: 2, role: 'top', str: 1, col: '#5b3a2a', tone: 'd', use: ['cake'], shape: 'bits' },
        { id: 'rose', name: '玫瑰花瓣', s: '玫瑰', tag: '花香', cost: 4, role: 'top', str: 1, col: '#e48aa5', tone: 'l', use: ['cake'], shape: 'bits' },
        { id: 'lemon', name: '檸檬皮', s: '檸檬', tag: '清爽', cost: 2, role: 'top', str: 1, col: '#f3e36b', tone: 'l', use: ['cake'], shape: 'bits' },
        { id: 'mintleaf', name: '薄荷葉', s: '薄荷', tag: '沁涼', cost: 2, role: 'top', str: 1, col: '#6cc08b', tone: 'l', use: ['cake'], shape: 'leaf' },
        // 便當
        { id: 'rice', name: '白飯', s: '白飯', tag: '綿密', cost: 2, role: 'grain', str: 1, col: '#fbfaf4', tone: 'l', use: ['bento'] },
        { id: 'friedrice', name: '炒飯', s: '炒飯', tag: '鹹香', cost: 3, role: 'grain', str: 2, col: '#e3c06a', tone: 'l', use: ['bento'] },
        { id: 'grainrice', name: '雜糧飯', s: '雜糧', tag: '清爽', cost: 3, role: 'grain', str: 1, col: '#b89a76', tone: 'd', use: ['bento'] },
        { id: 'karaage', name: '炸雞塊', s: '炸雞', tag: '酥脆', cost: 4, role: 'main', str: 2, col: '#c98a3c', tone: 'd', use: ['bento'] },
        { id: 'terichk', name: '照燒雞腿', s: '雞腿', tag: '鹹香', cost: 5, role: 'main', str: 2, col: '#7a3b1e', tone: 'd', use: ['bento'] },
        { id: 'salmon', name: '煎鮭魚', s: '鮭魚', tag: '鹹香', cost: 5, role: 'main', str: 2, col: '#f08c5a', tone: 'l', use: ['bento'] },
        { id: 'tamago', name: '玉子燒', s: '玉子', tag: '甜', cost: 3, role: 'side', str: 1, col: '#f5d76e', tone: 'l', use: ['bento'] },
        { id: 'greens', name: '燙青菜', s: '青菜', tag: '清爽', cost: 2, role: 'side', str: 1, col: '#4f9a3a', tone: 'd', use: ['bento'] },
        { id: 'cucumber', name: '涼拌小黃瓜', s: '黃瓜', tag: '沁涼', cost: 2, role: 'side', str: 1, col: '#8fcf7a', tone: 'l', use: ['bento'] },
        { id: 'kimchi', name: '泡菜', s: '泡菜', tag: '辛暖', cost: 2, role: 'side', str: 2, col: '#d4503a', tone: 'd', use: ['bento'] },
        { id: 'braisedegg', name: '滷蛋', s: '滷蛋', tag: '鹹香', cost: 2, role: 'side', str: 1, col: '#8a5a2a', tone: 'd', use: ['bento'] },
        { id: 'fruitcut', name: '水果切塊', s: '水果', tag: '果酸', cost: 3, role: 'side', str: 1, col: '#f2a65a', tone: 'l', use: ['bento'] },
        // 披薩
        { id: 'redsauce', name: '番茄紅醬', s: '紅醬', tag: '果酸', cost: 3, role: 'psauce', str: 2, col: '#c8372d', tone: 'd', use: ['pizza'] },
        { id: 'whitesauce', name: '白醬', s: '白醬', tag: '綿密', cost: 3, role: 'psauce', str: 1, col: '#f4ecd8', tone: 'l', use: ['pizza'] },
        { id: 'pesto', name: '青醬', s: '青醬', tag: '清爽', cost: 3, role: 'psauce', str: 2, col: '#5f8f3a', tone: 'd', use: ['pizza'] },
        { id: 'mozz', name: '起司絲', s: '起司', tag: '綿密', cost: 3, role: 'ptop', str: 1, col: '#f6e3a0', tone: 'l', use: ['pizza'] },
        { id: 'salami', name: '臘腸', s: '臘腸', tag: '鹹香', cost: 4, role: 'ptop', str: 2, col: '#a8322d', tone: 'd', use: ['pizza'] },
        { id: 'pineapple', name: '鳳梨', s: '鳳梨', tag: '果酸', cost: 3, role: 'ptop', str: 1, col: '#f5d04a', tone: 'l', use: ['pizza'] },
        { id: 'mushroom', name: '蘑菇', s: '蘑菇', tag: '鹹香', cost: 3, role: 'ptop', str: 1, col: '#b8a088', tone: 'l', use: ['pizza'] },
        { id: 'pepper', name: '青椒', s: '青椒', tag: '清爽', cost: 2, role: 'ptop', str: 1, col: '#4f9a3a', tone: 'd', use: ['pizza'] },
        { id: 'chili', name: '辣椒', s: '辣味', tag: '辛暖', cost: 2, role: 'ptop', str: 3, col: '#d42a20', tone: 'd', use: ['pizza'] },
        { id: 'basil', name: '羅勒葉', s: '羅勒', tag: '花香', cost: 2, role: 'ptop', str: 1, col: '#3f7f3a', tone: 'd', use: ['pizza'] },
        { id: 'honey', name: '蜂蜜', s: '蜂蜜', tag: '甜', cost: 2, role: 'ptop', str: 3, col: '#e8b23a', tone: 'l', use: ['pizza'] },
        { id: 'seafood', name: '海鮮', s: '海鮮', tag: '鹹香', cost: 6, role: 'ptop', str: 2, col: '#f0a080', tone: 'l', use: ['pizza'] },
    ];
    const ING_BY = {};
    ING.forEach(x => { ING_BY[x.id] = x; });

    // ── 🛒 器材（一次買斷、不折舊、不收維修）──
    const EQUIP = {
        oven: { name: '烤箱', icon: 'fa-fire-burner', price: 1500, unlock: 'pizza', note: '買了就能做披薩' },
    };

    // ── 👅 試吃規則（同一份永遠同一個結果）──
    const CONFLICT = [['沁涼', '辛暖'], ['茶香', '辛暖'], ['花香', '鹹香'], ['沁涼', '鹹香']];
    const HARMONY = [['苦韻', '甜'], ['茶香', '花香'], ['清爽', '果酸'], ['苦韻', '辛暖'], ['綿密', '酥脆'], ['鹹香', '清爽'], ['鹹香', '甜'],
        ['甜', '果酸'], ['綿密', '甜'], ['茶香', '綿密'], ['鹹香', '酥脆'], ['果酸', '鹹香'], ['綿密', '果酸'], ['苦韻', '綿密']];
    const TASTE_WORD = { 鹹香: '鹹', 辛暖: '辣', 甜: '甜', 果酸: '酸', 苦韻: '苦', 茶香: '茶味重', 花香: '花香重', 綿密: '膩', 清爽: '淡', 酥脆: '乾', 沁涼: '涼' };
    const JUDGES = [{ k: 'taste', name: '味道' }, { k: 'bite', name: '口感' }, { k: 'look', name: '賣相' }];
    const FOOD_PRICES = { S: 68, A: 45 };

    function _C() { return win.OS_CAFE || window.OS_CAFE || null; }
    function _B() { const c = _C(); return c && c._b; }
    const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function _hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h; }
    function _rng(seed) { let x = _hash(seed) || 1; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }

    // ── 一份菜（build）：{ base, parts:[由下往上] } 或 { base, cells:{格:料} } ──
    function _empty(base) { return BASES[base].kind === 'stack' ? { base, parts: [] } : { base, cells: {} }; }
    function _items(b) {   // 放了的料，帶「在哪」
        const B = BASES[b.base];
        if (B.kind === 'stack') return b.parts.map((id, i) => ({ ing: ING_BY[id], where: '第 ' + (i + 1) + ' 層', i })).filter(x => x.ing);
        return B.cells.filter(c => b.cells[c.k]).map(c => ({ ing: ING_BY[b.cells[c.k]], where: c.name, k: c.k })).filter(x => x.ing);
    }
    function _keyOf(b) {
        const B = BASES[b.base];
        return b.base + ':' + (B.kind === 'stack' ? b.parts.join('>') : B.cells.map(c => c.k + '=' + (b.cells[c.k] || '')).join(','));
    }
    function _costOf(b) { return BASES[b.base].frameCost + _items(b).reduce((n, x) => n + x.ing.cost, 0); }
    function _tagsOf(b) {
        const cnt = {};
        _items(b).forEach(x => { cnt[x.ing.tag] = (cnt[x.ing.tag] || 0) + 1; });
        return Object.keys(cnt).sort((a, z) => cnt[z] - cnt[a]).slice(0, 3);
    }
    // 還不能試做的原因（料不齊就不讓按，不白花她的錢）
    function _missing(b) {
        const its = _items(b), roles = its.map(x => x.ing.role);
        if (b.base === 'cup') {
            if (!b.parts.length || ING_BY[b.parts[0]]?.role !== 'liquid') return '杯底要先倒一樣飲料（咖啡、紅茶、氣泡水或牛奶）';
            if (b.parts.length < 2) return '再加一樣，才調得出味道';
        }
        if (b.base === 'burger' && !roles.includes('main')) return '還沒有主角：牛肉餅、炸雞排或煎蛋選一樣';
        if (b.base === 'cake' && !roles.includes('cream')) return '蛋糕胚上至少要抹一層奶油或卡士達';
        if (b.base === 'bento') {
            if (!b.cells.main) return '主食格還空著';
            if (its.length < 3) return '小格至少放兩樣';
        }
        if (b.base === 'pizza') {
            if (!b.cells.whole) return '先在「全面」抹一層醬';
            if (its.length < 2) return '醬上面至少放一樣料';
        }
        return '';
    }

    // 三位試吃員照規則講：每位講自己管的那件，一定點名是哪一層、哪一格
    function judge(b) {
        const B = BASES[b.base], its = _items(b);
        const notes = { taste: [], bite: [], look: [] };
        let score = B.drink ? 60 : 55;
        const has = (t) => its.filter(x => x.ing.tag === t);
        // 味道打架
        let clash = 0;
        CONFLICT.forEach(([p, q]) => {
            const a = has(p)[0], z = has(q)[0];
            if (a && z) { clash++; notes.taste.push({ w: 9, t: a.ing.name + '（' + a.where + '）跟' + z.ing.name + '（' + z.where + '）的味道打架，吃起來很怪' }); }
        });
        score -= clash * 20;
        // 搭得好
        const good = HARMONY.filter(([p, q]) => has(p).length && has(q).length);
        score += Math.min(3, good.length) * 8;
        // 只吃得到一種味道
        if (its.length >= 3) {
            const cnt = {};
            its.forEach(x => { cnt[x.ing.tag] = (cnt[x.ing.tag] || 0) + 1; });
            const top = Object.keys(cnt).sort((a, z) => cnt[z] - cnt[a])[0];
            if (cnt[top] / its.length >= 0.6) {
                score -= 12;
                notes.taste.push({ w: 6, t: '整份吃起來都是' + top + '，' + has(top).map(x => x.ing.name).join('、') + '疊在一起，少了別的味道' });
            }
        }
        // 口感（飲料不算；披薩的餅皮本來就脆）
        if (!B.drink && b.base !== 'pizza') {
            const crisp = has('酥脆')[0], soft = has('綿密')[0];
            if (!crisp) { score -= 8; notes.bite.push({ w: 4, t: '整份都是軟的，少一樣咬起來脆的' }); }
            else if (soft) { score += 8; notes.bite.push({ w: 1, good: true, t: crisp.ing.name + '的脆跟' + soft.ing.name + '的軟一起咬，口感有層次' }); }
        }
        if (B.kind === 'stack') {
            const seq = b.parts.map(id => ING_BY[id]).filter(Boolean);
            // 重口味的醬直接貼著清淡的那層＝蓋過去（飲料裡糖漿本來就貼著，不算）
            if (!B.drink) {
                let hit = 0;
                for (let i = 0; i + 1 < seq.length; i++) {
                    const lo = seq[i], hi = seq[i + 1];
                    let strong = null, weak = null, dir = '', at = 0;
                    if (hi.str === 3 && lo.str === 1) { strong = hi; weak = lo; dir = '下面'; at = i + 2; }
                    else if (lo.str === 3 && hi.str === 1) { strong = lo; weak = hi; dir = '上面'; at = i + 1; }
                    if (strong) { hit++; if (hit === 1) score -= 10; notes.bite.push({ w: 7, t: strong.name + '（第 ' + at + ' 層）蓋過了' + dir + '的' + weak.name + '，吃不到' + weak.name }); }
                }
                if (seq.length > 4) { score -= 6; notes.bite.push({ w: 5, t: '疊了 ' + seq.length + ' 層，太高了一口咬不下' }); }
                if (seq.length === 1) { score -= 6; notes.bite.push({ w: 5, t: '只夾了' + seq[0].name + '一層，吃起來單薄' }); }
            } else {
                const sunk = seq.findIndex((x, i) => x.role === 'top' && i < seq.length - 1 && seq.slice(i + 1).some(y => y.role === 'liquid'));
                if (sunk >= 0) { score -= 8; notes.bite.push({ w: 6, t: seq[sunk].name + '放在第 ' + (sunk + 1) + ' 層，上面又倒了飲料，整個沉下去泡爛了' }); }
            }
            // 切面：相鄰兩層一樣深淺就看不出分層
            const full = B.frame.length ? [FRAME[B.frame[0]]].concat(seq, B.frame[1] ? [FRAME[B.frame[1]]] : []) : seq;
            for (let i = 0; i + 1 < full.length; i++) {
                if (full[i].tone === full[i + 1].tone) {
                    score -= 4;
                    notes.look.push({ w: 3, t: full[i].name + '跟' + full[i + 1].name + '顏色太像，' + (B.drink ? '從杯子外面' : '切開') + '看不出分層' });
                    break;
                }
            }
        } else {
            // 格子／區：同一種重口味擺兩格＝這半邊（這格）太重
            for (let i = 0; i < its.length; i++) for (let j = i + 1; j < its.length; j++) {
                const a = its[i], z = its[j];
                if (a.ing.tag === z.ing.tag && a.ing.str >= 2 && z.ing.str >= 2) {
                    score -= 8;
                    notes.bite.push({ w: 6, t: a.where + '的' + a.ing.name + '跟' + z.where + '的' + z.ing.name + '都很' + (TASTE_WORD[a.ing.tag] || '重') + '，' + z.where + '吃起來太' + (TASTE_WORD[a.ing.tag] || '重') });
                    i = its.length; break;
                }
            }
            const tones = new Set(its.map(x => x.ing.tone));
            if (its.length >= 3 && tones.size === 1) { score -= 4; notes.look.push({ w: 3, t: its.map(x => x.where).join('、') + '顏色都差不多，看起來很平' }); }
        }
        if (good.length && !notes.taste.length) {
            const [p, q] = good[0], a = has(p)[0], z = has(q)[0];
            notes.taste.push({ w: 1, good: true, t: a.ing.name + '配' + z.ing.name + '剛好，味道接得起來' });
        }
        const tier = score >= 80 ? 'S' : score >= 63 ? 'A' : score >= 45 ? 'B' : 'C';
        const PRAISE = { taste: '味道平順，沒有打架的地方', bite: B.drink ? '喝起來順，料沒有沉在底下' : '口感沒什麼問題', look: B.kind === 'stack' ? '一層深一層淺，切開很好看' : '顏色分得開，打開來很好看' };
        const lines = JUDGES.map(j => {
            const n = notes[j.k].sort((a, z) => z.w - a.w)[0];
            return { judge: j.name, good: !n || !!n.good, t: n ? n.t : PRAISE[j.k] };
        });
        return { tier, score, lines };
    }

    // 規則取的名字（她可以改；請熟客試吃會換成熟客取的）
    function _autoName(b) {
        const B = BASES[b.base], its = _items(b).map(x => x.ing);
        const pick = (roles) => its.find(x => roles.includes(x.role));
        let parts = [];
        if (b.base === 'cup') parts = [pick(['sauce', 'top']), pick(['liquid'])];
        else if (b.base === 'burger') parts = [pick(['main']), pick(['side', 'sauce'])];
        else if (b.base === 'cake') parts = [pick(['side', 'top', 'sauce']), pick(['cream'])];
        else if (b.base === 'bento') parts = [pick(['main']) || pick(['side'])];
        else parts = [ING_BY[b.cells.left] || ING_BY[b.cells.dots], ING_BY[b.cells.right]];
        const seen = new Set();
        const words = parts.filter(Boolean).filter(x => !seen.has(x.s) && seen.add(x.s)).map(x => x.s);
        return (words.join('') + B.noun).slice(0, 12) || B.name;
    }
    function _blurbOf(b) {
        const its = _items(b).map(x => x.ing.name);
        if (b.base === 'cup') return '由下往上：' + its.join('、');
        if (BASES[b.base].kind === 'stack') return '從下到上夾了' + its.join('、');
        return its.join('、') + '一起裝';
    }

    // ── 🎨 畫（研發台大圖、菜單縮圖共用；opt.thumb＝不畫字和選取框）──
    function _shapeOf(x) {
        if (x.shape) return x.shape;
        if (x.role === 'sauce') return 'sauce';
        if (x.role === 'liquid') return 'liquid';
        return 'slice';
    }
    const LAYER_H = { patty: 22, slice: 16, leaf: 16, sauce: 16, cream: 20, fruit: 20, bits: 16, egg: 18, bunb: 22, bunt: 40, sponge: 34, liquid: 30, foam: 22 };
    function _layerSvg(x, y, h, w0, w1, i, opt) {
        const sh = _shapeOf(x), c = x.col, X0 = w0, W = w1 - w0;
        const tap = opt.thumb || i == null ? '' : ' data-i="' + i + '"';
        const sel = !opt.thumb && i != null && opt.sel === i;   // 麵包、蛋糕胚這些底沒有編號，不會被選到
        let g = '';
        if (sh === 'bunt') g = '<path d="M' + X0 + ' ' + (y + h) + ' Q' + X0 + ' ' + y + ' ' + (X0 + W / 2) + ' ' + y + ' Q' + (X0 + W) + ' ' + y + ' ' + (X0 + W) + ' ' + (y + h) + ' Z" fill="' + c + '"/>' +
            [0.3, 0.45, 0.6, 0.72].map((p, k) => '<ellipse cx="' + (X0 + W * p) + '" cy="' + (y + 12 + (k % 2) * 6) + '" rx="2.6" ry="1.5" fill="#fff6e0"/>').join('');
        else if (sh === 'bunb' || sh === 'patty') g = '<rect x="' + X0 + '" y="' + y + '" width="' + W + '" height="' + h + '" rx="9" fill="' + c + '"/><rect x="' + (X0 + 4) + '" y="' + (y + h - 6) + '" width="' + (W - 8) + '" height="4" rx="2" fill="#000" opacity=".14"/>';
        else if (sh === 'sponge') g = '<rect x="' + X0 + '" y="' + y + '" width="' + W + '" height="' + h + '" rx="5" fill="' + c + '"/><line x1="' + (X0 + 6) + '" y1="' + (y + h / 2) + '" x2="' + (X0 + W - 6) + '" y2="' + (y + h / 2) + '" stroke="#d8b06c" stroke-width="2" stroke-dasharray="6 5"/>';
        else if (sh === 'leaf') {
            let d = 'M' + (X0 - 6) + ' ' + (y + h);
            const n = 8, step = (W + 12) / n;
            for (let k = 0; k < n; k++) d += ' Q' + (X0 - 6 + step * k + step / 2) + ' ' + (y + (k % 2 ? h * 0.15 : -2)) + ' ' + (X0 - 6 + step * (k + 1)) + ' ' + (y + h * 0.35);
            d += ' L' + (X0 + W + 6) + ' ' + (y + h) + ' Z';
            g = '<path d="' + d + '" fill="' + c + '"/>';
        } else if (sh === 'sauce') {
            g = '<rect x="' + (X0 + 2) + '" y="' + y + '" width="' + (W - 4) + '" height="' + (h - 6) + '" rx="5" fill="' + c + '"/>' +
                [0.2, 0.42, 0.66, 0.84].map(p => '<circle cx="' + (X0 + W * p) + '" cy="' + (y + h - 5) + '" r="3.2" fill="' + c + '"/>').join('');
        } else if (sh === 'cream') {
            g = '<rect x="' + X0 + '" y="' + (y + 6) + '" width="' + W + '" height="' + (h - 6) + '" rx="4" fill="' + c + '" stroke="#e8dcc6" stroke-width="1"/>';
            for (let k = 0; k < 9; k++) g += '<circle cx="' + (X0 + 8 + k * (W - 16) / 8) + '" cy="' + (y + 7) + '" r="7" fill="' + c + '"/>';
        } else if (sh === 'fruit') {
            for (let k = 0; k < 6; k++) g += '<circle cx="' + (X0 + 12 + k * (W - 24) / 5) + '" cy="' + (y + h / 2) + '" r="' + (h / 2) + '" fill="' + c + '"/><circle cx="' + (X0 + 12 + k * (W - 24) / 5) + '" cy="' + (y + h / 2) + '" r="' + (h / 5) + '" fill="#fff" opacity=".35"/>';
        } else if (sh === 'bits') {
            const r = _rng(x.id + ':' + i);
            for (let k = 0; k < 13; k++) g += '<circle cx="' + (X0 + 6 + r() * (W - 12)) + '" cy="' + (y + 4 + r() * (h - 8)) + '" r="' + (3 + r() * 2.5) + '" fill="' + c + '"/>';
        } else if (sh === 'egg') {
            g = '<ellipse cx="' + (X0 + W / 2) + '" cy="' + (y + h / 2) + '" rx="' + (W / 2 + 4) + '" ry="' + (h / 2) + '" fill="' + c + '"/><circle cx="' + (X0 + W / 2) + '" cy="' + (y + h / 2) + '" r="' + (h / 2 - 2) + '" fill="#f2a900"/>';
        } else if (sh === 'foam') {
            g = '<rect x="' + X0 + '" y="' + (y + 5) + '" width="' + W + '" height="' + (h - 5) + '" fill="' + c + '"/>';
            for (let k = 0; k < 6; k++) g += '<circle cx="' + (X0 + 6 + k * (W - 12) / 5) + '" cy="' + (y + 6) + '" r="7" fill="' + c + '"/>';
        } else g = '<rect x="' + (sh === 'slice' ? X0 - 5 : X0) + '" y="' + y + '" width="' + (sh === 'slice' ? W + 10 : W) + '" height="' + h + '" rx="3" fill="' + c + '"/>';
        const outline = sel ? '<rect x="' + (X0 - 9) + '" y="' + (y - 2) + '" width="' + (W + 18) + '" height="' + (h + 4) + '" rx="6" fill="none" stroke="#b77b42" stroke-width="2.5" stroke-dasharray="5 3"/>' : '';
        return '<g class="ock-ly"' + tap + '>' + g + outline + '</g>';
    }
    function _drawStack(b, opt) {
        const B = BASES[b.base];
        const seq = b.parts.map(id => ING_BY[id]).filter(Boolean);
        const W = 200;
        if (B.drink) {
            // 杯子：每層一樣高，由下往上倒；頂上的料浮在最上面
            const hh = seq.map(x => _shapeOf(x) === 'bits' ? 18 : _shapeOf(x) === 'foam' ? 24 : 30);
            const inner = Math.max(120, hh.reduce((n, v) => n + v, 0) + 8);
            const H = inner + 30;
            let y = H - 14, svg = '';
            seq.forEach((x, i) => { y -= hh[i]; svg += _layerSvg(x, y, hh[i], 54, 146, i, opt); });
            const glass = '<path d="M46 14 L52 ' + (H - 10) + ' Q52 ' + (H - 4) + ' 60 ' + (H - 4) + ' L140 ' + (H - 4) + ' Q148 ' + (H - 4) + ' 148 ' + (H - 10) + ' L154 14" fill="none" stroke="#9c7b5a" stroke-width="3" stroke-linejoin="round"/>';
            const empty = !seq.length && !opt.thumb ? '<text x="100" y="' + (H / 2) + '" text-anchor="middle" class="ock-hint">點下面的料倒進杯子</text>' : '';
            return '<svg class="ock-svg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">' + svg + glass + empty + '</svg>';
        }
        const all = [];
        if (B.frame[0]) all.push({ x: FRAME[B.frame[0]], i: null });
        seq.forEach((x, i) => all.push({ x, i }));
        if (B.frame[1]) all.push({ x: Object.assign({ id: B.frame[1] }, FRAME[B.frame[1]]), i: null });
        const hs = all.map(a => LAYER_H[_shapeOf(a.x)] || 16);
        const H = Math.max(150, hs.reduce((n, v) => n + v, 0) + 20);
        let y = H - 8, svg = '<ellipse cx="100" cy="' + (H - 6) + '" rx="92" ry="5" fill="#000" opacity=".08"/>';
        all.forEach((a, k) => { y -= hs[k]; svg += _layerSvg(Object.assign({ id: a.x.id || 'f' + k }, a.x), y, hs[k], 22, 178, a.i, opt); });
        const empty = !seq.length && !opt.thumb ? '<text x="100" y="22" text-anchor="middle" class="ock-hint">點下面的料，一層一層往上疊</text>' : '';
        return '<svg class="ock-svg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">' + svg + empty + '</svg>';
    }
    function _blobs(id, k, cx0, cy0, w, h, n, rmin, rmax, col) {
        const r = _rng(id + '@' + k);
        let s = '';
        for (let i = 0; i < n; i++) {
            const rr = rmin + r() * (rmax - rmin), sc = 0.9 + r() * 0.2;   // 每份大小、角度差一點（±10%）
            const ex = cx0 + rr + r() * Math.max(1, w - rr * 2), ey = cy0 + rr + r() * Math.max(1, h - rr * 2);
            s += '<ellipse cx="' + ex + '" cy="' + ey + '" rx="' + (rr * sc) + '" ry="' + (rr * (2 - sc) * 0.8) + '" transform="rotate(' + Math.round(r() * 40 - 20) + ' ' + ex + ' ' + ey + ')" fill="' + col + '" stroke="#000" stroke-opacity=".12" stroke-width=".8"/>';
        }
        return s;
    }
    function _drawCells(b, opt) {
        const sel = !opt.thumb ? opt.sel : null;
        if (b.base === 'bento') {
            const box = { main: [18, 18, 86, 124], s1: [112, 18, 70, 38], s2: [112, 61, 70, 38], s3: [112, 104, 70, 38] };
            let svg = '<rect x="8" y="8" width="184" height="144" rx="14" fill="#3b2a22"/>';
            Object.keys(box).forEach(k => {
                const [x, y, w, h] = box[k], ing = ING_BY[b.cells[k]];
                svg += '<g' + (opt.thumb ? '' : ' data-k="' + k + '"') + ' class="ock-cell"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="7" fill="#f7efe2"' + (ing ? '' : ' stroke="#c9b08a" stroke-dasharray="4 3"') + '/>';
                if (ing) svg += k === 'main' ? '<rect x="' + (x + 4) + '" y="' + (y + 4) + '" width="' + (w - 8) + '" height="' + (h - 8) + '" rx="6" fill="' + ing.col + '"/>' + _blobs(ing.id, k, x + 4, y + 4, w - 8, h - 8, 26, 2, 3.4, ing.tone === 'l' ? '#e6dcc4' : '#5a4634')
                    : _blobs(ing.id, k, x + 3, y + 3, w - 6, h - 6, 6, 7, 10, ing.col);
                else if (!opt.thumb) svg += '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 4) + '" text-anchor="middle" class="ock-hint">+</text>';
                if (sel === k) svg += '<rect x="' + (x - 2) + '" y="' + (y - 2) + '" width="' + (w + 4) + '" height="' + (h + 4) + '" rx="8" fill="none" stroke="#e0a050" stroke-width="3"/>';
                svg += '</g>';
            });
            return '<svg class="ock-svg" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg" role="img">' + svg + '</svg>';
        }
        // 披薩：全面一層醬，左右半邊各一樣料，點綴撒滿
        const cx = 100, cy = 100;
        let svg = '<circle cx="' + cx + '" cy="' + cy + '" r="88" fill="#d9a35a"/><circle cx="' + cx + '" cy="' + cy + '" r="78" fill="#f1d7a0"/>';
        const whole = ING_BY[b.cells.whole];
        svg += '<g' + (opt.thumb ? '' : ' data-k="whole"') + ' class="ock-cell"><circle cx="' + cx + '" cy="' + cy + '" r="72" fill="' + (whole ? whole.col : '#f1d7a0') + '"' + (whole ? '' : ' stroke="#c9b08a" stroke-dasharray="5 4"') + '/></g>';
        const half = (k, side) => {
            const ing = ING_BY[b.cells[k]];
            const clip = 'M' + cx + ' ' + (cy - 70) + ' A70 70 0 0 ' + (side < 0 ? 0 : 1) + ' ' + cx + ' ' + (cy + 70) + ' Z';
            let s = '<g' + (opt.thumb ? '' : ' data-k="' + k + '"') + ' class="ock-cell"><path d="' + clip + '" fill="#000" opacity="0"/>';
            if (ing) {
                const r = _rng(ing.id + k);
                for (let i = 0; i < 7; i++) {
                    const ang = (side < 0 ? Math.PI : 0) + (r() - 0.5) * Math.PI * 0.9, dist = 16 + r() * 46;
                    const px = cx + Math.cos(ang) * dist, py = cy + Math.sin(ang) * dist;
                    const x2 = side < 0 ? Math.min(px, cx - 9) : Math.max(px, cx + 9);
                    const rr = 8 * (0.9 + r() * 0.2);
                    s += '<ellipse cx="' + x2 + '" cy="' + py + '" rx="' + rr + '" ry="' + (rr * 0.85) + '" fill="' + ing.col + '" stroke="#000" stroke-opacity=".15" stroke-width=".8"/>';
                }
            }
            if (sel === k) s += '<path d="' + clip + '" fill="none" stroke="#e0a050" stroke-width="3"/>';
            return s + '</g>';
        };
        svg += half('left', -1) + half('right', 1);
        const dots = ING_BY[b.cells.dots];
        svg += '<g' + (opt.thumb ? '' : ' data-k="dots"') + ' class="ock-cell">';
        if (dots) { const r = _rng(dots.id + 'dots'); for (let i = 0; i < 22; i++) { const a = r() * Math.PI * 2, d = r() * 66; svg += '<circle cx="' + (cx + Math.cos(a) * d) + '" cy="' + (cy + Math.sin(a) * d) + '" r="' + (2.6 + r() * 1.6) + '" fill="' + dots.col + '"/>'; } }
        svg += '</g>';
        if (sel === 'whole') svg += '<circle cx="' + cx + '" cy="' + cy + '" r="75" fill="none" stroke="#e0a050" stroke-width="3"/>';
        if (sel === 'dots') svg += '<circle cx="' + cx + '" cy="' + cy + '" r="66" fill="none" stroke="#e0a050" stroke-width="2.5" stroke-dasharray="3 5"/>';
        return '<svg class="ock-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img">' + svg + '</svg>';
    }
    function draw(b, opt) {
        opt = opt || {};
        if (!b || !BASES[b.base]) return '';
        return BASES[b.base].kind === 'stack' ? _drawStack(b, opt) : _drawCells(b, opt);
    }
    // 菜單卡片的小圖
    function thumb(dish) { return '<span class="ock-thumb">' + draw(dish, { thumb: true }) + '</span>'; }

    // ── 💾 研發台資料 ──
    async function _kit() {
        const B = _B();
        const k = B ? await B.get(K_KIT, null) : null;
        return Object.assign({ equip: {}, tried: {}, tries: 0, shelved: 0 }, k || {});
    }
    // 試做一份：扣料錢（同一份試過了就直接看結果，不再扣）
    function _tryOne(b) {
        const B = _B();
        const key = _keyOf(b), cost = _costOf(b);
        return B.locked(async () => {
            const kit = Object.assign({ equip: {}, tried: {}, tries: 0, shelved: 0 }, await B.getStrict(K_KIT, null) || {});
            const v = judge(b);
            if (kit.tried[key]) return { ok: true, v, again: true };
            const fd = await B.fundLoad();
            if (fd.coins < cost) return { ok: false, why: '錢不夠（這份料要 ' + cost + '，帳戶剩 ' + fd.coins + '）' };
            fd.coins -= cost;
            kit.tried[key] = v.tier;
            kit.tries = (kit.tries || 0) + 1;
            await B.set('fund', fd);
            await B.set(K_KIT, kit);
            return { ok: true, v, cost };
        });
    }
    function _shelve(b, v, name, blurb) {
        const B = _B(), key = _keyOf(b);
        return B.locked(async () => {
            const menu = await B.getStrict('menu', []);
            if (menu.some(m => m.key === key)) return { ok: false, why: '這份已經在菜單上了' };
            const P = BASES[b.base].drink ? (B.prices || { S: 48, A: 30 }) : FOOD_PRICES;
            const dish = BASES[b.base].kind === 'stack' ? { base: b.base, parts: b.parts.slice() } : { base: b.base, cells: Object.assign({}, b.cells) };
            menu.unshift({ id: 'dish_' + Date.now(), key, name: String(name || _autoName(b)).slice(0, 12), blurb: String(blurb || _blurbOf(b)).slice(0, 60),
                tier: v.tier, price: P[v.tier], tags: _tagsOf(b), dish, unit: _costOf(b), ts: Date.now(), sold: 0 });
            const kit = Object.assign({ equip: {}, tried: {}, tries: 0, shelved: 0 }, await B.getStrict(K_KIT, null) || {});
            kit.shelved = (kit.shelved || 0) + 1;
            await B.set('menu', menu);
            await B.set(K_KIT, kit);
            return { ok: true };
        });
    }
    function _buyEquip(id) {
        const B = _B(), E = EQUIP[id];
        return B.locked(async () => {
            const kit = Object.assign({ equip: {}, tried: {}, tries: 0, shelved: 0 }, await B.getStrict(K_KIT, null) || {});
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
    async function _askRegular(b, v) {
        const api = win.OS_API || window.OS_API;
        if (!api || !api.chat) return null;
        const who = _pickRegular(_tagsOf(b));
        if (!who) return null;
        const B = BASES[b.base];
        const layout = _items(b).map(x => x.where + '：' + x.ing.name).join('；');
        let config = {};
        const OS = win.OS_SETTINGS || window.OS_SETTINGS;
        if (OS) {
            const sec = OS.getSecondaryConfig ? OS.getSecondaryConfig() : null;
            config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : OS.getConfig();
        }
        config = Object.assign({}, config || {});
        const prompt =
            '這裡是一間咖啡書店。店長試做了一份新的' + B.name + '，請一位老客人先嚐。\n' +
            '老客人：' + who.name + '（' + who.label + '），平常偏愛' + who.likes.join('、') + '的口味。\n' +
            (B.kind === 'stack' ? '這份從下到上是：' : '這份怎麼擺：') + layout + '。\n' +
            '店裡的試吃員剛剛說：' + v.lines.map(l => l.judge + '——' + l.t).join('；') + '。\n' +
            '請用這位客人的口吻講一句吃完的感想，要講到是哪一層或哪一格，30 字以內；再替這份取一個菜單上的名字，8 個字以內，不要直接把料名接起來。\n' +
            '只回 JSON：{"review":"感想","name":"名字"}，繁體中文。';
        try {
            const raw = await new Promise((resolve, reject) => {
                api.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { task: 'cafe', label: '書咖熟客試吃', keepCodeFences: true });
            });
            const m = String(raw || '').match(/\{[\s\S]*\}/);
            const j = m ? JSON.parse(m[0]) : null;
            if (!j || !j.review) return null;
            return { who: who.name, label: who.label, review: String(j.review).slice(0, 60), name: String(j.name || '').slice(0, 12) };
        } catch (e) { console.warn('[CafeKitchen] 熟客試吃失敗', e); return null; }
    }

    // ── 🖼 畫面 ──
    let _cur = null;          // 正在擺的那份（換分頁回來還在）
    let _sel = null;          // 疊的：選中第幾層；格子：選中哪一格
    function _registerHelp() {
        const A = win.AUI || window.AUI;
        if (!A || !A.registerHelp || _registerHelp.done) return;
        _registerHelp.done = true;
        A.registerHelp({ cafe_kitchen: { title: '研發台', body:
            '選一種底，點料放上去，按「試做一份」。料錢從書咖帳戶扣，不扣體力、不用等。\n' +
            '三位試吃員照規則講：味道、口感、賣相各一句，會說是哪一層、哪一格出問題。同一份永遠同一個結果，試過的再按不會再扣錢。\n' +
            '漢堡、蛋糕、飲料由下往上疊：點某一層可以上移、下移、拿掉。便當、披薩先點一格，再點料放進去。\n' +
            '「靈感之作」「優良」可以上架，名字可以自己改；上架後到菜單頁備料，做一批照這份的料錢算。\n' +
            '「請熟客試吃」會叫一次模型（設置裡「書咖」那一列），請一位口味最對的常客講感想、取名字，不會改等級，不按也能上架。\n' +
            '披薩要先買烤箱。' }
        });
    }
    async function render(body) {
        const C = _C(), B = _B();
        if (!C || !B) { body.innerHTML = '<div class="oc-empty">研發台還沒準備好，等一下再來看。</div>'; return; }
        _ensureStyle(win.document);
        _registerHelp();
        const A = win.AUI || window.AUI;
        let old = null;
        try { old = B.finishRd ? await B.finishRd() : null; } catch (e) {}
        const kit = await _kit();
        let fund = null;
        try { fund = await C.getFund(); } catch (e) {}
        if (!_cur || !BASES[_cur.base]) _cur = _empty('burger');
        const locked = (base) => BASES[base].equip && !kit.equip[BASES[base].equip];
        if (locked(_cur.base)) _cur = _empty('burger');
        body.innerHTML =
            '<div class="ock-root">' +
            '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-kitchen-set"></i> 研發台' + (A && A.helpBtn ? A.helpBtn('cafe_kitchen') : '') + '</span>' +
              '<span class="oc-section-note">' + Object.keys(kit.equip).filter(id => EQUIP[id]).map(id => '<i class="fa-solid ' + EQUIP[id].icon + '" title="' + EQUIP[id].name + '"></i> ' + EQUIP[id].name).join('　') + '</span></div>' +
            (old ? '<div class="oc-slot-label">改版前調配的那杯好了</div><div class="ock-old"></div>' : '') +
            '<div class="ock-bases">' + BASE_ORDER.map(k => '<button class="ock-base' + (k === _cur.base ? ' on' : '') + (locked(k) ? ' locked' : '') + '" data-base="' + k + '"><i class="fa-solid ' + (locked(k) ? 'fa-lock' : BASES[k].icon) + '"></i>' + BASES[k].name + '</button>').join('') + '</div>' +
            '<div class="ock-stage"><div class="ock-pic"></div><div class="ock-side"></div></div>' +
            '<div class="oc-slot-label ock-pantry-label">料</div>' +
            '<div class="ock-pantry"></div>' +
            '<div class="ock-cost"></div>' +
            '<button class="oc-brew ock-try" disabled><i class="fa-solid fa-utensils"></i> 試做一份</button>' +
            '<div class="ock-result"></div>' +
            '<div class="oc-slot-label">器材</div>' +
            '<div class="ock-equip">' + Object.keys(EQUIP).map(id => {
                const E = EQUIP[id], have = !!kit.equip[id];
                return '<div class="ock-eq' + (have ? ' have' : '') + '"><i class="fa-solid ' + E.icon + '"></i><span><b>' + E.name + '</b><small>' + (have ? '廚房裡有了，' + E.note.replace('買了就', '') : E.note + '・' + E.price + ' 塊') + '</small></span>' +
                    (have ? '' : '<button class="ock-buy" data-eq="' + id + '">買</button>') + '</div>';
            }).join('') + '</div>' +
            '</div>';
        if (old) B.labResult(body.querySelector('.ock-old'), old.key, old.tier, old.b, old.f, old.t);
        const root = body.querySelector('.ock-root');
        const $ = (s) => root.querySelector(s);
        const B0 = () => BASES[_cur.base];
        const firstEmpty = () => (B0().cells || []).find(c => !_cur.cells[c.k]);
        if (B0().kind === 'cells' && !_sel) _sel = (firstEmpty() || B0().cells[0]).k;
        const clearResult = () => { $('.ock-result').innerHTML = ''; };
        const paint = () => {
            const B1 = B0();
            $('.ock-pic').innerHTML = draw(_cur, { sel: _sel });
            // 右邊：疊的列出每一層（上面的在上面）；格子列出每一格
            if (B1.kind === 'stack') {
                const rows = _cur.parts.map((id, i) => ({ id, i })).reverse();
                $('.ock-side').innerHTML = '<div class="ock-side-title">' + (B1.drink ? '杯子裡（上面的在上面）' : '從上到下') + '</div>' +
                    (B1.frame[1] ? '<div class="ock-row fixed">' + FRAME[B1.frame[1]].name + '</div>' : '') +
                    (rows.length ? rows.map(r => '<div class="ock-row' + (_sel === r.i ? ' on' : '') + '" data-i="' + r.i + '"><span>' + (r.i + 1) + '. ' + _esc(ING_BY[r.id].name) + '</span>' +
                        (_sel === r.i ? '<span class="ock-ops"><button data-op="up"' + (r.i === _cur.parts.length - 1 ? ' disabled' : '') + '>上移</button><button data-op="down"' + (r.i === 0 ? ' disabled' : '') + '>下移</button><button data-op="del">拿掉</button></span>' : '') + '</div>').join('')
                        : '<div class="ock-row empty">還沒放料</div>') +
                    (B1.frame[0] ? '<div class="ock-row fixed">' + FRAME[B1.frame[0]].name + '</div>' : '') +
                    '<div class="ock-side-note">' + _cur.parts.length + ' / ' + B1.max + ' 層</div>';
            } else {
                $('.ock-side').innerHTML = '<div class="ock-side-title">先點一格，再點料</div>' + B1.cells.map(c => {
                    const ing = ING_BY[_cur.cells[c.k]];
                    return '<div class="ock-row' + (_sel === c.k ? ' on' : '') + '" data-k="' + c.k + '"><span>' + c.name + '：' + (ing ? _esc(ing.name) : '空著') + '</span>' +
                        (_sel === c.k && ing ? '<span class="ock-ops"><button data-op="del">拿掉</button></span>' : '') + '</div>';
                }).join('');
            }
            // 料：這一格（這種底）放得進去的
            const cell = B1.kind === 'cells' ? B1.cells.find(c => c.k === _sel) : null;
            let list = ING.filter(x => x.use.includes(_cur.base));
            if (cell) list = list.filter(x => cell.roles ? cell.roles.includes(x.role) : !['grain', 'psauce'].includes(x.role));
            $('.ock-pantry-label').textContent = cell ? '放進「' + cell.name + '」的料' : '料（點一下放到最上面）';
            $('.ock-pantry').innerHTML = list.map(x => '<button class="ock-ing" data-id="' + x.id + '"><span class="ock-sw" data-tone="' + x.tone + '"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="' + x.col + '" stroke="#0002"/></svg></span>' +
                '<b>' + x.name + '</b><small>' + x.tag + '・' + x.cost + ' 塊</small></button>').join('');
            // 花多少、能不能按
            const its = _items(_cur), cost = _costOf(_cur), key = _keyOf(_cur);
            const miss = its.length ? _missing(_cur) : '先放料';
            const tried = kit.tried[key];
            $('.ock-cost').innerHTML = its.length ? '用料 ' + its.length + ' 份' + (B1.frameCost ? '＋' + B1.frameName : '') + '・<b>' + cost + '</b> 塊' + (fund ? '　帳戶剩 ' + fund.coins : '') : '';
            const btn = $('.ock-try');
            btn.disabled = !!miss || (!tried && fund && fund.coins < cost);
            btn.innerHTML = tried ? '<i class="fa-solid fa-eye"></i> 看結果（試過了，不再扣錢）' : '<i class="fa-solid fa-utensils"></i> 試做一份' + (its.length ? '（' + cost + ' 塊）' : '');
            $('.ock-cost').insertAdjacentHTML('beforeend', miss && its.length ? '<div class="oc-why">' + miss + '</div>' : (!tried && fund && fund.coins < cost ? '<div class="oc-why">錢不夠（帳戶剩 ' + fund.coins + '）</div>' : ''));
        };
        const showResult = async (r) => {
            const T = B.tierText || {};
            const v = r.v, ok = v.tier === 'S' || v.tier === 'A';
            const menu = await C.getMenu();
            const onMenu = menu.some(m => m.key === _keyOf(_cur));
            const tt = T[v.tier] || { label: v.tier, cls: 'a' };
            $('.ock-result').innerHTML =
                '<div class="oc-result"><div class="ock-res-head"><span class="oc-badge ' + tt.cls + '">' + tt.label + '</span>' +
                '<span class="ock-res-cost">' + (r.again ? '試過了，這次沒扣錢' : '花了 ' + r.cost + ' 塊') + '</span></div>' +
                v.lines.map(l => '<div class="ock-line' + (l.good ? ' good' : '') + '"><b>' + l.judge + '</b><span>' + _esc(l.t) + '</span></div>').join('') +
                '<div class="ock-ai"></div>' +
                (onMenu ? '<div class="oc-note">這份已經在菜單上了。</div>'
                    : ok ? '<div class="ock-name"><input class="ock-name-in" maxlength="12" value="' + _esc(_autoName(_cur)) + '"><button class="oc-shelf ock-shelf"><i class="fa-solid fa-arrow-up-from-bracket"></i> 上架</button></div>'
                        : '<div class="oc-note">' + (r.again ? '' : '這份試做的當員工餐了。') + '改一層再試：直接動上面的料。</div>') +
                '<button class="ock-askai"><i class="fa-solid fa-comment-dots"></i> 請熟客試吃（叫一次 AI）</button>' +
                '</div>';
            let ai = null, typed = false;
            $('.ock-name-in')?.addEventListener('input', () => { typed = true; });
            $('.ock-askai').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 熟客在吃…';
                ai = await _askRegular(_cur, v);
                btn.remove();
                const slot = $('.ock-ai');
                if (!slot) return;
                if (!ai) { slot.innerHTML = '<div class="oc-why">這次沒問到（連線失敗或沒設好模型），等一下再試。</div>'; return; }
                slot.innerHTML = '<div class="ock-line ai"><b>' + _esc(ai.who) + '</b><span>「' + _esc(ai.review) + '」</span></div>';
                const inp = $('.ock-name-in');
                if (inp && ai.name && !typed) inp.value = ai.name;
            });
            $('.ock-shelf')?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                const name = ($('.ock-name-in')?.value || '').trim();
                const res = await _shelve(_cur, v, name, ai ? ai.review : '');
                const box = btn.closest('.ock-name');
                if (!res.ok) { box.insertAdjacentHTML('afterend', '<div class="oc-why">' + res.why + '</div>'); return; }
                box.outerHTML = '<div class="oc-note"><i class="fa-solid fa-utensils"></i>「' + _esc(name || _autoName(_cur)) + '」上架了！到「菜單」頁備料。</div>';
            });
        };
        paint();
        // 換底
        $('.ock-bases').addEventListener('click', async (e) => {
            const btn = e.target.closest('.ock-base');
            if (!btn) return;
            const base = btn.dataset.base;
            if (locked(base)) {
                const E = EQUIP[BASES[base].equip];
                if (A && A.toast) A.toast('要先買' + E.name + '才能做' + BASES[base].name + '（下面「器材」）', { type: 'info' });
                return;
            }
            if (base === _cur.base) return;
            _cur = _empty(base);
            _sel = BASES[base].kind === 'cells' ? BASES[base].cells[0].k : null;
            root.querySelectorAll('.ock-base').forEach(x => x.classList.toggle('on', x === btn));
            clearResult();
            paint();
        });
        // 點圖或右邊清單：選層、選格
        const pickAt = (e) => {
            const op = e.target.closest('[data-op]');
            if (op) {
                const B1 = B0();
                if (B1.kind === 'stack' && _sel != null) {
                    const i = _sel, p = _cur.parts;
                    if (op.dataset.op === 'del') { p.splice(i, 1); _sel = null; }
                    else if (op.dataset.op === 'up' && i < p.length - 1) { [p[i], p[i + 1]] = [p[i + 1], p[i]]; _sel = i + 1; }
                    else if (op.dataset.op === 'down' && i > 0) { [p[i], p[i - 1]] = [p[i - 1], p[i]]; _sel = i - 1; }
                } else if (B1.kind === 'cells' && _sel) delete _cur.cells[_sel];
                clearResult();
                paint();
                return;
            }
            const ly = e.target.closest('[data-i]'), ck = e.target.closest('[data-k]');
            if (ly) { const i = Number(ly.dataset.i); _sel = _sel === i ? null : i; paint(); }
            else if (ck) { _sel = ck.dataset.k; paint(); }
        };
        $('.ock-pic').addEventListener('click', pickAt);
        $('.ock-side').addEventListener('click', pickAt);
        // 點料
        $('.ock-pantry').addEventListener('click', (e) => {
            const btn = e.target.closest('.ock-ing');
            if (!btn) return;
            const B1 = B0(), id = btn.dataset.id;
            if (B1.kind === 'stack') {
                if (_cur.parts.length >= B1.max) { if (A && A.toast) A.toast('最多 ' + B1.max + ' 層，先拿掉一層', { type: 'info' }); return; }
                _cur.parts.push(id);
                _sel = null;
            } else {
                if (!_sel) return;
                _cur.cells[_sel] = id;
                const nx = firstEmpty();
                if (nx) _sel = nx.k;
            }
            clearResult();
            paint();
        });
        // 試做
        $('.ock-try').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            if (_missing(_cur)) return;
            btn.disabled = true;
            const r = await _tryOne(_cur);
            if (!r.ok) { $('.ock-result').innerHTML = '<div class="oc-why">' + r.why + '</div>'; btn.disabled = false; return; }
            if (!r.again) { kit.tried[_keyOf(_cur)] = r.v.tier; try { fund = await C.getFund(); } catch (er) {} B.refreshStats && B.refreshStats(); }
            paint();
            await showResult(r);
            $('.ock-result').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        // 買器材
        $('.ock-equip').addEventListener('click', async (e) => {
            const btn = e.target.closest('.ock-buy');
            if (!btn) return;
            const E = EQUIP[btn.dataset.eq];
            const yes = A && A.confirm ? await A.confirm('買一台' + E.name + '要 ' + E.price + ' 塊，從書咖帳戶扣，一次買斷、不收維修費。' + E.note + '。', { title: '買' + E.name }) : true;
            if (!yes) return;
            btn.disabled = true;
            const r = await _buyEquip(btn.dataset.eq);
            if (!r.ok) { btn.disabled = false; if (A && A.toast) A.toast(r.why, { type: 'warn' }); return; }
            B.refreshStats && B.refreshStats();
            if (A && A.toast) A.toast(E.name + '搬進廚房了，' + E.note.replace('買了就', '現在'), { type: 'success' });
            render(body);
        });
    }

    function _ensureStyle(doc) {
        if (!doc || doc.getElementById('os-cafe-kitchen-style')) return;
        const st = doc.createElement('style');
        st.id = 'os-cafe-kitchen-style';
        st.textContent =
            '.ock-root .aui-help{margin-left:4px;}' +
            '.ock-bases{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-bottom:8px;}' +
            '.ock-base{min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 2px;border-radius:10px;border:1px solid #d8c3a1;background:rgba(255,255,255,.58);color:#5a4634;font-size:11px;cursor:pointer;}' +
            '.ock-base i{font-size:16px;color:#9a6a3e;}.ock-base.on{background:#f2dfc6;border-color:#b77b42;color:#674224;font-weight:700;}.ock-base.locked{opacity:.55;}' +
            '.ock-stage{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:8px;align-items:start;background:rgba(255,252,246,.72);border:1px solid #e2d2b6;border-radius:12px;padding:8px;}' +
            '.ock-pic .ock-svg{display:block;width:100%;max-height:230px;}.ock-svg .ock-hint{font-size:10px;fill:#a18465;}' +
            '.ock-svg [data-i],.ock-svg [data-k]{cursor:pointer;}' +
            '.ock-side{min-width:0;font-size:11px;color:#5a4634;}.ock-side-title{color:#a18465;font-size:10px;margin-bottom:4px;}.ock-side-note{color:#a18465;font-size:10px;margin-top:4px;text-align:right;}' +
            '.ock-row{display:flex;flex-direction:column;gap:4px;padding:5px 7px;margin-bottom:3px;border-radius:8px;border:1px solid #eadcc4;background:#fffaf2;cursor:pointer;line-height:1.35;}' +
            '.ock-row.on{border-color:#b77b42;background:#f7e8d3;}.ock-row.fixed{cursor:default;color:#a18465;background:transparent;border-style:dashed;}.ock-row.empty{cursor:default;color:#a18465;}' +
            '.ock-ops{display:flex;gap:4px;}.ock-ops button{flex:1;min-width:0;padding:4px 0;border-radius:6px;border:1px solid #c9a77c;background:#fff;color:#674224;font-size:10px;cursor:pointer;}.ock-ops button:disabled{opacity:.4;cursor:default;}' +
            '.ock-pantry{display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px;}' +
            '.ock-ing{min-width:0;min-height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:5px 3px;border-radius:10px;border:1px solid #d8c3a1;background:rgba(255,255,255,.58);color:#5a4634;cursor:pointer;}' +
            '.ock-ing:active{background:#f2dfc6;}.ock-ing b{font-size:11px;font-weight:700;line-height:1.2;text-align:center;}.ock-ing small{font-size:9px;color:#a18465;}' +
            '.ock-sw{display:block;width:20px;height:20px;}.ock-sw svg{width:20px;height:20px;display:block;}' +
            '.ock-cost{margin-top:10px;font-size:11px;color:#7e5b39;text-align:center;line-height:1.6;}.ock-cost b{color:#5a3a20;}' +
            '.ock-res-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}.ock-res-cost{font-size:10px;color:#a18465;}' +
            '.ock-line{display:grid;grid-template-columns:34px minmax(0,1fr);gap:6px;font-size:12px;line-height:1.5;color:#7a3f2a;padding:3px 0;border-top:1px dashed #eadcc4;}' +
            '.ock-line b{font-size:10px;color:#a18465;padding-top:2px;}.ock-line.good{color:#3c6b44;}.ock-line.ai{color:#5a4634;grid-template-columns:auto minmax(0,1fr);}' +
            '.ock-name{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;margin-top:8px;align-items:center;}' +
            '.ock-name-in{min-width:0;padding:8px 9px;border-radius:9px;border:1px solid #d8c3a1;background:#fff;color:#573b26;font-size:12px;}.ock-name .oc-shelf{width:auto;margin:0;padding:8px 12px;}' +
            '.ock-askai{width:100%;margin-top:8px;padding:7px 0;border-radius:10px;border:1px dashed #c9a77c;background:transparent;color:#7e5b39;font-size:11px;cursor:pointer;}.ock-askai:disabled{opacity:.6;cursor:default;}' +
            '.ock-equip{display:grid;gap:6px;}.ock-eq{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 10px;border-radius:11px;border:1px solid #d8c3a1;background:rgba(255,255,255,.5);}' +
            '.ock-eq > i{font-size:18px;color:#9a6a3e;text-align:center;}.ock-eq b{display:block;font-size:12px;color:#573b26;}.ock-eq small{font-size:10px;color:#a18465;}.ock-eq.have{background:rgba(78,139,87,.08);border-color:#9cc3a2;}' +
            '.ock-buy{padding:6px 14px;border-radius:9px;border:1px solid #6d4425;background:#7a4f2d;color:#fff8ed;font-weight:700;font-size:12px;cursor:pointer;}.ock-buy:disabled{opacity:.5;}' +
            '.ock-old{margin-bottom:8px;}' +
            '.ock-thumb{display:block;width:40px;height:40px;}.ock-thumb svg{width:40px;height:40px;display:block;}';
        doc.head.appendChild(st);
    }

    const tags = () => [...new Set(ING.map(x => x.tag))];
    win.OS_CAFE_KITCHEN = window.OS_CAFE_KITCHEN = { render, thumb, draw, judge, tags, BASES, ING, EQUIP, _keyOf, _costOf, _autoName };
})();
