// ----------------------------------------------------------------
// [檔案] os_blueprints.js
// 路徑：os_phone/os/os_blueprints.js
// 職責：設計藍圖＝整房風格的商品單位（取代逐件家具商城）。
//   一張藍圖＝一份完整的整房布置訂單（家具清單＋九宮格位置），
//   套用時走既有一條龍：訂單→翻譯提示詞→整房一次 inpaint（os_room_gen.deliver）。
//   固定目錄零 API；「訂製藍圖」燒一次副模型畫一張新藍圖，永久入冊。
//   藍圖買斷入冊、可重複套在任何一戶；單一物件靠布置頁「添加包裹」手動輸入。
//   純邏輯無 UI（UI 在 os_landlord_book.js）。依賴 OS_DB/OS_PT/OS_API/OS_ROOM_SVG/OS_ROOM_GEN/OS_LANDLORD。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const APP_ID = 'landlord';       // 跟房產同倉：藍圖是房產生意的一部分
    const K_BP = 'blueprints';       // { owned:[id], custom:[藍圖], furRefunded:true }

    // 口味標籤池：看房訪客拿它判斷「這間房合不合他胃口」（沿用家具商城那套語意，judgeFit 不用改）
    const TAGS = ['溫馨', '簡約', '復古', '文青', '科技', '自然', '奢華', '實用', '慵懶', '工業'];

    // 九宮格 → 房間座標(0~100)。點位都落在地板安全區內（同 _freeSpot 的活動範圍）。
    const POS = {
        '上左': [30, 40], '上中': [50, 38], '上右': [70, 40],
        '中左': [30, 53], '中央': [50, 54], '中右': [70, 53],
        '下左': [35, 66], '下中': [50, 68], '下右': [65, 66],
    };
    // 同一格擺兩件會疊在一點上：照件序給一點固定的錯位（不用亂數，同一張藍圖每次套都一樣）
    function _spot(pos, i) {
        const p = POS[pos] || POS['中央'];
        const jx = ((i * 7) % 5) - 2, jy = ((i * 5) % 5) - 2;
        return { x: Math.max(22, Math.min(78, p[0] + jx)), y: Math.max(34, Math.min(70, p[1] + jy)) };
    }

    // ── 📘 固定目錄：一張藍圖＝風格名＋色票＋整房清單 ──
    // 🚨 俯視構圖鐵則：清單裡不准有天花板吊掛物；照明只能立燈/桌燈/壁燈。
    const CATALOG = [
        {
            id: 'gaming', name: '電競間', icon: 'fa-gamepad', price: 260,
            desc: '黑桌雙螢幕,燈條沿牆,一張電競椅的地盤。',
            swatches: ['#141824', '#5b6cff', '#c9d4f0'], tags: ['科技', '慵懶'],
            items: [
                { name: '電競桌', note: '黑色寬桌面,雙螢幕亮著,桌腳藏燈條', pos: '上右' },
                { name: '電競椅', note: '黑紅賽車式座椅', pos: '中右' },
                { name: '主機層架', note: '金屬層架,放著主機與一排手把', pos: '上左' },
                { name: '小冰箱', note: '黑色迷你冰箱,上面疊著飲料罐', pos: '中左' },
                { name: '電玩海報牆', note: '牆上錯落幾張電玩海報', pos: '上中' },
                { name: '懶骨頭', note: '深灰色懶骨頭', pos: '下左' },
                { name: '幾何地毯', note: '深色短毛地毯,藍紫幾何紋', pos: '下中' },
            ],
        },
        {
            id: 'bay', name: '海灣房', icon: 'fa-umbrella-beach', price: 240,
            desc: '白木地板藤編椅,窗邊掛紗簾,一點浪的顏色。',
            swatches: ['#f4ead8', '#7fb6c9', '#ffffff'], tags: ['自然', '簡約'],
            items: [
                { name: '藤編扶手椅', note: '淺色藤編,擺一顆白抱枕', pos: '中右' },
                { name: '白木茶几', note: '圓形小几,刷白木紋', pos: '中央' },
                { name: '白紗簾', note: '窗邊垂著透光白紗', pos: '上左' },
                { name: '海景掛畫', note: '一幅淡藍海面的畫', pos: '上中' },
                { name: '貝殼矮架', note: '白木矮架,放貝殼與玻璃瓶', pos: '中左' },
                { name: '龜背芋盆栽', note: '大盆綠植,白陶盆', pos: '上右' },
                { name: '條紋圓毯', note: '藍白條紋圓地毯', pos: '下中' },
                { name: '白色躺椅', note: '帆布摺疊躺椅', pos: '下左' },
            ],
        },
        {
            id: 'boho', name: '波希米亞', icon: 'fa-feather', price: 240,
            desc: '編織掛毯與地毯疊著鋪,綠植擺滿每個角落。',
            swatches: ['#a9714b', '#d9c3a5', '#5d7a52'], tags: ['自然', '溫馨'],
            items: [
                { name: '編織掛毯', note: '大幅手織圖騰掛毯垂在牆上', pos: '上中' },
                { name: '波斯地毯', note: '暗紅繁複花紋,邊角磨舊', pos: '下中' },
                { name: '低矮布沙發', note: '米白粗織布面,塞滿抱枕', pos: '中右' },
                { name: '木箱茶几', note: '舊木箱翻過來當茶几', pos: '中央' },
                { name: '綠植群', note: '大小三盆綠植擠在一起', pos: '中左' },
                { name: '立式紙燈', note: '米色紙罩立燈,光很柔', pos: '上左' },
                { name: '乾燥蒲葦', note: '陶瓶插滿蓬鬆蒲葦', pos: '上右' },
                { name: '流蘇抱枕堆', note: '地上散著幾顆流蘇抱枕', pos: '下右' },
            ],
        },
        {
            id: 'study', name: '書齋', icon: 'fa-book', price: 240,
            desc: '整面書牆,一盞立燈,窗前留一張深色書桌。',
            swatches: ['#4a3626', '#8a6a45', '#e8dcc8'], tags: ['文青', '實用'],
            items: [
                { name: '整面書牆', note: '滿牆深木書架,塞滿各色書背', pos: '上中' },
                { name: '深色書桌', note: '胡桃木桌面,桌上攤著紙筆', pos: '上右' },
                { name: '皮革扶手椅', note: '深棕皮革,木質椅腳', pos: '中右' },
                { name: '黃銅立燈', note: '細桿黃銅立燈,暖黃燈罩', pos: '中左' },
                { name: '木架地球儀', note: '桌邊立著一座地球儀', pos: '上左' },
                { name: '小波斯毯', note: '暗紋小地毯鋪在椅前', pos: '下中' },
                { name: '書堆', note: '地上疊著幾落讀到一半的書', pos: '下左' },
            ],
        },
        {
            id: 'wabi', name: '侘寂間', icon: 'fa-spa', price: 220,
            desc: '留白牆面低矮家具,一枝乾燥花就是全部裝飾。',
            swatches: ['#e5ded2', '#b8ab98', '#6e6558'], tags: ['簡約', '自然'],
            items: [
                { name: '榻榻米床墊', note: '低矮床墊,亞麻素色床單', pos: '中右' },
                { name: '粗陶花器', note: '啞光陶瓶,只插一枝乾枝', pos: '上左' },
                { name: '矮茶桌', note: '原木小方桌,擺一只茶碗', pos: '中央' },
                { name: '麻布掛軸', note: '素色麻布掛在牆上', pos: '上中' },
                { name: '亞麻座墊', note: '兩枚方座墊並排', pos: '下中' },
                { name: '紙燈', note: '和紙立燈,光很低', pos: '下右' },
            ],
        },
        {
            id: 'princess', name: '公主房', icon: 'fa-crown', price: 280,
            desc: '白紗幔四柱床,梳妝台配圓鏡,滿地絨毛。',
            swatches: ['#f6dce4', '#ffffff', '#d8b264'], tags: ['溫馨', '奢華'],
            items: [
                { name: '四柱床', note: '白色四柱床,垂著粉白紗幔', pos: '中右' },
                { name: '梳妝台', note: '白金雕花梳妝台,配圓鏡', pos: '上左' },
                { name: '雕花衣櫃', note: '白色雙門衣櫃,金色把手', pos: '中左' },
                { name: '蕾絲窗簾', note: '窗邊垂著蕾絲簾', pos: '上中' },
                { name: '絨毛圓毯', note: '粉白色長毛圓地毯', pos: '下中' },
                { name: '玩偶堆', note: '床邊擠著一堆絨毛玩偶', pos: '下右' },
                { name: '金框落地鏡', note: '金色細框全身鏡斜靠牆', pos: '上右' },
            ],
        },
        {
            id: 'industrial', name: '工業風', icon: 'fa-screwdriver-wrench', price: 240,
            desc: '裸露磚牆鐵管層架,做舊皮沙發配鐵箱茶几。',
            swatches: ['#3a3a3c', '#8a4b32', '#c9b79a'], tags: ['工業', '實用'],
            items: [
                { name: '紅磚牆面', note: '一整面裸露紅磚牆', pos: '上中' },
                { name: '鐵管層架', note: '黑鐵管骨架配舊木層板', pos: '上左' },
                { name: '工作檯', note: '鐵桌面木腳,散著零件工具', pos: '上右' },
                { name: '做舊皮沙發', note: '深棕皮革,磨得發亮', pos: '中右' },
                { name: '鐵箱茶几', note: '軍綠鐵箱當茶几', pos: '中央' },
                { name: '三腳探照燈', note: '金屬三腳架立燈', pos: '中左' },
                { name: '工具掛板', note: '牆上洞洞板掛滿工具', pos: '下左' },
            ],
        },
        {
            id: 'washitsu', name: '和室', icon: 'fa-torii-gate', price: 220,
            desc: '榻榻米鋪滿,黑漆矮桌配座墊,牆上一幅水墨。',
            swatches: ['#cdbf9b', '#3b3b33', '#f2ede0'], tags: ['自然', '簡約'],
            items: [
                { name: '榻榻米地墊', note: '整片草蓆色榻榻米', pos: '下中' },
                { name: '黑漆矮桌', note: '方形黑漆矮桌', pos: '中央' },
                { name: '座墊四枚', note: '靛藍座墊圍著矮桌', pos: '下左' },
                { name: '障子屏風', note: '木格白紙屏風立在角落', pos: '中左' },
                { name: '水墨掛軸', note: '牆上一幅山水掛軸', pos: '上中' },
                { name: '插花矮几', note: '小几上一盆枯山水插花', pos: '上右' },
                { name: '紙燈', note: '方形和紙立燈', pos: '下右' },
            ],
        },
    ];
    const CUSTOM_PRICE = 500;   // 訂製一張藍圖（燒一次副模型,永久入冊）

    function _db() { return win.OS_DB || window.OS_DB; }
    function _pt() { return win.OS_PT || window.OS_PT; }
    function _now() { try { return Date.now(); } catch (e) { return 0; } }

    async function _read() {
        try {
            const db = _db();
            if (!db || !db.getAppData) return { owned: [], custom: [] };
            const v = await db.getAppData(APP_ID, K_BP);
            return (v && typeof v === 'object') ? v : { owned: [], custom: [] };
        } catch (e) { console.warn('[Blueprints] 讀藍圖冊失敗', e); return { owned: [], custom: [] }; }
    }
    async function _write(v) {
        const db = _db();
        if (!db || !db.saveAppData) throw new Error('OS_DB.saveAppData 不存在');
        await db.saveAppData(APP_ID, K_BP, v);
    }

    // 全部資料一次給 UI：{ owned:[藍圖…], shop:[還沒買的目錄藍圖…], canCustom }
    async function getAll() {
        const s = await _read();
        const ownedIds = Array.isArray(s.owned) ? s.owned : [];
        const custom = Array.isArray(s.custom) ? s.custom : [];
        const owned = CATALOG.filter(function (b) { return ownedIds.indexOf(b.id) >= 0; }).concat(custom);
        const shop = CATALOG.filter(function (b) { return ownedIds.indexOf(b.id) < 0; });
        return { owned: owned, shop: shop, customPrice: CUSTOM_PRICE };
    }
    async function find(bpId) {
        const s = await _read();
        return CATALOG.find(function (b) { return b.id === bpId; })
            || (s.custom || []).find(function (b) { return b.id === bpId; })
            || null;
    }

    // 買一張目錄藍圖：扣 PT → 入冊。扣了錢卻沒存起來就退款，寧可讓玩家再按一次。
    async function buy(bpId) {
        const bp = CATALOG.find(function (b) { return b.id === bpId; });
        if (!bp) return { ok: false, reason: 'gone' };
        const s = await _read();
        s.owned = Array.isArray(s.owned) ? s.owned : [];
        if (s.owned.indexOf(bpId) >= 0) return { ok: false, reason: 'have' };
        const pt = _pt();
        if (!pt || typeof pt.spendPT !== 'function') return { ok: false, reason: 'nopt' };
        const r = await pt.spendPT(bp.price, '買藍圖：' + bp.name);
        if (!r || !r.ok) return { ok: false, reason: 'poor', short: (r && r.short) || bp.price };
        s.owned.push(bpId);
        try { await _write(s); }
        catch (e) {
            console.warn('[Blueprints] 買了但沒存起來，退款', e);
            try { await pt.addPT(bp.price, { reason: '買藍圖失敗退款' }); } catch (e2) {}
            return { ok: false, reason: 'save' };
        }
        return { ok: true, bp: bp };
    }

    // ── ✏️ 訂製藍圖：描述想要的房間 → 副模型畫成一張藍圖 → 永久入冊 ──
    function _customMessages(request) {
        const posWords = Object.keys(POS).join('、');
        const sys = [
            '你是室內設計師。玩家描述他想要的房間風格，你把它畫成一張「整房藍圖」。',
            '只回傳純 JSON，不要解釋、不要 markdown：',
            '{"name":"{風格名，不超過 6 字}","desc":"{一句話描述這種房間，不超過 22 字}",'
            + '"tags":["{從標籤池挑 1 到 3 個}"],"colors":["{三個代表色的 hex，如 #aabbcc}"],'
            + '"items":[{"name":"{物件名，2 到 8 字}","note":"{長什麼樣，材質顏色形狀，不超過 20 字}","pos":"{位置詞}"}]}',
            'items 要 6 到 9 件，合起來要像一間完整的房間（大件家具＋牆面裝飾＋地面點綴都要有）。',
            '位置詞只准從這裡挑：' + posWords + '。大件靠邊，地毯類放下方。',
            '標籤池（只准從中挑）：' + TAGS.join('、'),
            '這是俯視構圖的房間，只收「放在地上、靠牆或掛在牆上」的東西。',
            '天花板吊掛物、吊燈、吊扇一律不可以；照明只能是立燈、桌燈、壁燈這類不碰天花板的。',
        ].join('\n');
        return [
            { role: 'system', content: sys },
            { role: 'user', content: '玩家想要的房間：' + request + '\n\n請輸出藍圖 JSON。' },
        ];
    }
    function _parseCustom(raw) {
        const t = String(raw || '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').replace(/```(?:[a-z]+)?/gi, '').replace(/```/g, '');
        const m = t.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('設計師沒有回稿，再按一次試試。');
        const o = JSON.parse(m[0]);
        const name = String(o.name || '').trim().slice(0, 8);
        if (!name) throw new Error('這張藍圖沒有名字，再按一次試試。');
        const items = (Array.isArray(o.items) ? o.items : []).map(function (it) {
            return {
                name: String((it && it.name) || '').trim().slice(0, 10),
                note: String((it && it.note) || '').trim().slice(0, 30),
                pos: POS[(it && it.pos)] ? it.pos : '中央',
            };
        }).filter(function (it) { return it.name; }).slice(0, 9);
        if (items.length < 4) throw new Error('這張藍圖畫得太空了，換個說法再試一次。');
        const colors = (Array.isArray(o.colors) ? o.colors : [])
            .filter(function (c) { return /^#[0-9a-fA-F]{6}$/.test(String(c || '').trim()); })
            .slice(0, 3);
        const tags = (Array.isArray(o.tags) ? o.tags : []).filter(function (x) { return TAGS.indexOf(x) >= 0; }).slice(0, 3);
        return {
            id: 'cb' + _now().toString(36) + Math.random().toString(36).slice(2, 5),
            name: name,
            desc: String(o.desc || '').trim().slice(0, 30),
            icon: 'fa-compass-drafting',
            price: CUSTOM_PRICE,
            swatches: colors.length === 3 ? colors : ['#2a4a80', '#d8b264', '#fdfdfc'],
            tags: tags.length ? tags : ['實用'],
            items: items,
            custom: true,
        };
    }
    // 訂製：先扣 PT 再燒；燒失敗全額退款（跟「買了沒存成」同一套誠實原則）
    async function makeCustom(request) {
        const pt = _pt();
        if (!pt || typeof pt.spendPT !== 'function') throw new Error('錢包還沒就緒，晚點再試。');
        const paid = await pt.spendPT(CUSTOM_PRICE, '訂製藍圖');
        if (!paid || !paid.ok) {
            const short = (paid && paid.short) || CUSTOM_PRICE;
            throw new Error('還差 ' + short + ' 才請得動設計師。');
        }
        const refund = async function () {
            try { await pt.addPT(CUSTOM_PRICE, { reason: '訂製藍圖失敗退款' }); } catch (e) { console.warn('[Blueprints] 退款失敗', e); }
        };
        let bp;
        try {
            bp = await new Promise(function (resolve, reject) {
                const api = win.OS_API || window.OS_API;
                const OS = win.OS_SETTINGS || window.OS_SETTINGS;
                if (!api || !api.chat) { reject(new Error('找不到副模型接口。')); return; }
                let config = {};
                if (OS) {
                    const sec = OS.getSecondaryConfig ? OS.getSecondaryConfig() : null;
                    config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : OS.getConfig();
                }
                config = config || {};
                config.route = 'blueprint_custom';
                api.chat(_customMessages(request), config, null, function (text) {
                    try { resolve(_parseCustom(text)); } catch (e) { reject(e); }
                }, function (err) {
                    console.warn('[Blueprints] 訂製失敗', err);
                    reject(new Error('設計師一時聯絡不上，錢已經退回，等一下再試。'));
                }, { label: '訂製藍圖' });
            });
        } catch (e) { await refund(); throw e; }
        try {
            const s = await _read();
            s.custom = Array.isArray(s.custom) ? s.custom : [];
            s.custom.push(bp);
            s.custom = s.custom.slice(-40);   // 不無限長
            await _write(s);
        } catch (e) {
            console.warn('[Blueprints] 藍圖沒存進冊，退款', e);
            await refund();
            throw new Error('藍圖沒放進冊子裡，錢已經退回，再試一次。');
        }
        return bp;
    }

    // ── 📐 套用：藍圖 → 整房訂單 → 一條龍生圖 → 存回那一戶 ──
    // 跟布置頁「配送」存的形狀完全一致：套完照樣能進布置頁微調單件再重出。
    function _specOfKey(key) {
        const SVGM = win.OS_ROOM_SVG || window.OS_ROOM_SVG;
        const RT = (SVGM && SVGM.ROOM_TYPES) || {};
        const t = RT[key] || RT.standard || { w: 4.2, d: 4.0, wallH: 1.0, floor: 'oak' };
        return { w: t.w, d: t.d, wallH: t.wallH, floor: t.floor, window: true, label: t.label || '', typeKey: key };
    }
    function buildOrder(bp) {
        return (bp.items || []).map(function (it, i) {
            const p = _spot(it.pos, i);
            return { name: it.name, content: it.note || '', x: p.x, y: p.y, tags: (bp.tags || []).slice() };
        });
    }
    async function apply(unitId, bpId, onMsg) {
        const LL = win.OS_LANDLORD || window.OS_LANDLORD;
        const GEN = win.OS_ROOM_GEN || window.OS_ROOM_GEN;
        if (!LL || !GEN) throw new Error('房產引擎還沒載入完，稍等一下再試。');
        const bp = await find(bpId);
        if (!bp) throw new Error('找不到這張藍圖。');
        const state = await LL.getState();
        const unit = (state.units || []).find(function (u) { return u.id === unitId; });
        if (!unit) throw new Error('找不到這一戶。');
        const spec = _specOfKey(unit.roomTypeKey);
        const order = buildOrder(bp);
        const result = await GEN.deliver(spec, order, onMsg || function () {}, null);
        await LL.saveRoom(unitId, {
            image: result.image, layout: result.layout, order: order,
            roomTypeKey: spec.typeKey,
            floor: result.floor, inner4: result.inner4, viewBox: result.viewBox, personH: result.personH,
            styleName: result.styleName, at: result.at,
            blueprint: bp.id,   // 記著這間房套的是哪張藍圖（UI 顯示用）
        });
        return { ok: true, bp: bp };
    }

    // ── ♻️ 舊家具商城遷移：倉庫裡還沒擺的家具，原價折 PT 退款，只跑一次 ──
    // 直接讀 furniture 的 app_data，不依賴 os_furniture 還載著。
    // 🚨 順序講究：先清倉、把應退金額記進 furPending，再入帳——
    //    入帳卡住時金額還記著，下次接著退；不會「倉庫還在→再算一次→退兩次」。
    async function migrateFurniture() {
        const s = await _read();
        if (s.furRefunded) return { done: false };
        const db = _db();
        let amount = Number(s.furPending) || 0, count = 0;
        if (!(s.furPending > 0)) {
            let stock;
            try { stock = (db && db.getAppData) ? ((await db.getAppData('furniture', 'stock')) || []) : []; }
            catch (e) { console.warn('[Blueprints] 讀舊倉庫失敗，這次先不動', e); return { done: false }; }
            amount = (stock || []).reduce(function (a, it) { return a + (Number(it && it.price) || 0); }, 0);
            count = (stock || []).length;
            if (count > 0) {
                try { await db.saveAppData('furniture', 'stock', []); }
                catch (e) { console.warn('[Blueprints] 清倉失敗，這次先不動', e); return { done: false }; }
            }
            if (amount > 0) {
                s.furPending = amount;
                try { await _write(s); } catch (e) { console.warn('[Blueprints] 待退金額沒記上，仍盡力退', e); }
            }
        }
        if (amount > 0) {
            const pt = _pt();
            if (!pt || typeof pt.addPT !== 'function') return { done: false };
            try { await pt.addPT(amount, { reason: '家具商城收攤折讓' }); }
            catch (e) { console.warn('[Blueprints] 折讓入帳失敗，金額記著下次再退', e); return { done: false }; }
        }
        s.furPending = 0;
        s.furRefunded = true;
        try { await _write(s); } catch (e) { console.warn('[Blueprints] 遷移旗標沒存成，下次會再對一次帳', e); }
        return { done: true, refunded: amount, count: count };
    }

    win.OS_BLUEPRINTS = {
        getAll, find, buy, makeCustom, apply, buildOrder, migrateFurniture,
        _cfg: { TAGS: TAGS, CUSTOM_PRICE: CUSTOM_PRICE },
    };
    if (win !== window) { try { window.OS_BLUEPRINTS = win.OS_BLUEPRINTS; } catch (e) {} }
    console.log('[Blueprints] 藍圖冊已載入');
})();
