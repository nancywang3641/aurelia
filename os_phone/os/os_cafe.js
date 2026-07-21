// ----------------------------------------------------------------
// [檔案] os_cafe.js
// 路徑：os_phone/os/os_cafe.js
// 職責：📖☕ 書咖經營系統 ①——調配台(研發小遊戲)+上架命名+菜單/書單資料層。
//   循環：研發(零成本試錯,品質=寫死隱藏矩陣)→上架(燒1次副模型:命名+文案)→菜單。
//   ②之後接：NPC每日消費模擬/訪客紀錄/事件表/好感度(見 docs/book_cafe_design.md)。
//   存 OS_DB app_data(appId=book_cafe,不動 schema);副模型直連仿 os_pt._valuate(不發 GENERATION_*)。
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[Cafe] 載入書咖經營系統...');
    const win = window.parent || window;
    const CAFE_ASSET_BASE = win.AURELIA_EXT_BASE || window.AURELIA_EXT_BASE || './scripts/extensions/third-party/my-tavern-extension';
    const CAFE_ITEM_SHEET = CAFE_ASSET_BASE + '/core/assets/cafe/cafe-items-v1.webp';

    // ── 🎛 遊戲平衡數據(集中可調;材料/靈感矩陣要改就改這裡)──
    const CAFE_CFG = {
        prices: { S: 48, A: 30 },   // 上架定價(PT);B 平庸不可上架、C 翻車
        pantry: {
            base:   [{ id: 'coffee', name: '手沖咖啡', tag: '苦韻' }, { id: 'tea', name: '伯爵紅茶', tag: '茶香' }, { id: 'soda', name: '氣泡水', tag: '清爽' }],
            flavor: [{ id: 'floral', name: '花香糖漿', tag: '花香' }, { id: 'berry', name: '莓果醬', tag: '果酸' }, { id: 'caramel', name: '焦糖', tag: '甜' }, { id: 'spice', name: '辛香料', tag: '辛暖' }],
            top:    [{ id: 'foam', name: '奶泡拉花', tag: '綿密' }, { id: 'cookie', name: '手工餅乾', tag: '酥脆' }, { id: 'mint', name: '薄荷冰珠', tag: '沁涼' }],
        },
        // 靈感配方(S)與翻車地雷(C)：'基底+風味+點綴' 的 id 組合;其餘照雜湊落 A/B
        sCombos: ['coffee+caramel+foam', 'tea+floral+cookie', 'soda+berry+mint', 'coffee+spice+cookie', 'tea+berry+foam', 'soda+floral+mint'],
        cCombos: ['soda+caramel+foam', 'coffee+berry+mint', 'tea+spice+mint', 'soda+spice+cookie'],
        hashARatio: 0.45,   // 非策劃組合落 A 的比例
        freeformCap: 3,     // 「自由創想」同時在架上限(防氪金灌爆菜單)
        // 創想符號庫(遊戲材料,可增減):丟進鍋裡讓店長解讀成飲品意象——視差是虛擬系統,不用正常化,蛇+櫻桃也給店長圓XD
        symbols: [
            '⭐', '🌙', '☀️', '🌧️', '❄️', '⚡', '🌈', '🌫️', '☄️', '🌪️', '🌊', '🫧', '🔥', '💫', '✨', '🧊', '💥', '🌋',
            '🌸', '🌿', '🍀', '🌵', '🌹', '🥀', '🍄', '🌾', '🎋', '🌻', '🪷', '🌱',
            '🍋', '🍇', '🍯', '🍫', '🥛', '🍒', '🍑', '🍎', '🥭', '🍍', '🥥', '🫐', '🍓', '🌶️', '🧂', '🍵', '☕', '🍶', '🥃', '🍬', '🍭', '🍪', '🎂', '🥚', '🍜', '🧋',
            '🐍', '🐈', '🐇', '🦋', '🦉', '🐟', '🐙', '🦑', '🦂', '🕷️', '🐉', '🦢', '🐺', '🦊', '🐝', '🪲', '🦇', '🐌', '🦎', '🐸',
            '🖤', '💜', '🤍', '💎', '🔮', '🪞', '🕯️', '🗝️', '⚙️', '🧿', '📜', '🎻', '🎐', '⌛', '🧬', '🪐', '👁️', '🌑', '💀', '👻', '⛓️', '🪶', '🎭', '🕸️', '🎲', '🧸', '📀', '🫀',
            '♾️', '☯️', '⚗️', '🧪', '📡', '🧲', '🔋', '🛰️', '🕳️', '🎇', '🧩', '🪄',
        ],
        symbolMax: 4,       // 一鍋最多丟幾顆
    };
    const TIER_TEXT = {
        S: { label: '靈感之作', cls: 's', note: '這杯有靈魂——值得掛上菜單最顯眼的位置。' },
        A: { label: '優良', cls: 'a', note: '穩穩的好喝,可以上架。' },
        B: { label: '平庸', cls: 'b', note: '能喝,但沒有記憶點,不值得佔菜單版面。' },
        C: { label: '翻車', cls: 'c', note: '……倒掉吧,就當無事發生。' },
    };

    const APP_ID = 'book_cafe';
    const K_MENU = 'menu';     // 上架品項 [{id,name,blurb,tier,price,tags,ings,ts,sold}]
    const K_BOOKS = 'books';   // 書單 [{title,by,note,ts}]（NPC 首訪留書）
    const K_SHOP = 'shop';     // {popularity,revenue,cups,lastDay}
    const K_LAB = 'lab';       // 已試過的組合 {comboKey:tier}
    const K_NPC = 'npc';       // 每位顧客 {name,prefs,incl,visits,spend,items:{menuId:{count,streak,lastDay,boredHits,coolUntil,devoted}}}
    const K_LOG = 'visits';    // 訪客紀錄 [{id,day,key,name,item,line,price,said?,ev?}]
    const K_EVQ = 'evq';       // A級事件佇列 [{type,key,item,itemId}](單次結算最多消化2件,超過留隊)
    const K_SHIFT = 'shift';   // 值班小遊戲紀錄 {best,games,bestStreak}
    const EV_LABEL = { devotion: '本命認證', dropout: '吃膩告別' };
    const ING_ICONS = {
        coffee: '☕', tea: '🍵', soda: '🫧',
        floral: '🌼', berry: '🫐', caramel: '🍮', spice: '🧂',
        foam: '🥛', cookie: '🍪', mint: '🌿',
        receipt: '🧾', bell: '🔔',
    };
    const SPRITE_POS = {
        coffee: [0, 0], tea: [1, 0], soda: [2, 0], floral: [3, 0],
        berry: [0, 1], caramel: [1, 1], spice: [2, 1], foam: [3, 1],
        cookie: [0, 2], mint: [1, 2], receipt: [2, 2], bell: [3, 2],
    };
    const SLOT_LABEL = { base: '基底', flavor: '風味', top: '點綴' };
    function _mkId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function _ingIcon(id) { return ING_ICONS[id] || '✦'; }
    function _sprite(id, extraClass) {
        return '<span class="oc-sprite oc-sprite-' + (SPRITE_POS[id] ? id : 'coffee') + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true">' + _ingIcon(id) + '</span>';
    }
    // 雪碧圖座標→靜態 class(禁inline style;格位改動只需對 SPRITE_POS 同步這段)
    function _spritePosCss() {
        const xs = ['0%', '33.333%', '66.667%', '100%'], ys = ['0%', '50%', '100%'];
        return Object.keys(SPRITE_POS).map(id => {
            const p = SPRITE_POS[id];
            return '.oc-sprite-' + id + '{background-position:' + xs[p[0]] + ' ' + ys[p[1]] + ';}';
        }).join('');
    }

    // 訪客紀錄的旁白模板(零API;③「點開看完整留言」才燒API讓角色親口說)
    const TPL = {
        first: '第一次上門,好奇地打量著店裡的每個角落。',
        fresh: '點了{item},端詳了好一會兒才喝下第一口。',
        addict: '熟門熟路地又點了{item},看起來心情很好。',
        habit: '照常點了{item},在老位置坐了下來。',
        bored: '點{item}時猶豫了一下,喝得有些心不在焉。',
        comeback: '隔了好些天,又點回了{item}。',
        normal: '點了{item},安靜地待了一會兒。',
        browse: '進來晃了一圈,今天什麼都沒點。',
    };
    const DAY_MS = 86400000;
    function _dayNum(ts) { return Math.floor((ts - new Date(ts).getTimezoneOffset() * 60000) / DAY_MS); }   // 本地午夜換日(UTC算的話台灣要早上8點才換,反直覺)

    function _db() { return win.OS_DB || window.OS_DB; }
    async function _get(k, dflt) {
        try { const db = _db(); if (!db?.getAppData) return dflt; const v = await db.getAppData(APP_ID, k); return (v === undefined || v === null) ? dflt : v; }
        catch (e) { return dflt; }
    }
    async function _set(k, v) {
        try { const db = _db(); if (!db?.saveAppData) return; await db.saveAppData(APP_ID, k, v); } catch (e) { console.warn('[Cafe] 存檔失敗', k, e); }
    }

    // ── 品質判定(寫死矩陣+雜湊,零 API=真解謎)──
    function _comboKey(b, f, t) { return b + '+' + f + '+' + t; }
    function _hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h; }
    function _tierOf(key) {
        if (CAFE_CFG.sCombos.includes(key)) return 'S';
        if (CAFE_CFG.cCombos.includes(key)) return 'C';
        return (_hash(key) % 100) < CAFE_CFG.hashARatio * 100 ? 'A' : 'B';
    }
    function _ing(slot, id) { return CAFE_CFG.pantry[slot].find(x => x.id === id) || null; }
    function _tagsOf(b, f, t) { return [_ing('base', b), _ing('flavor', f), _ing('top', t)].filter(Boolean).map(x => x.tag); }
    function _tagPool() { return Object.values(CAFE_CFG.pantry).flat().map(x => x.tag); }   // 調性標籤詞彙表(創想只准從這挑,②配對才對得上)

    // ── 上架命名(副模型直連,仿 os_pt._valuate;失敗退機械名)──
    function _extractJSON(raw) {
        try {
            const m = String(raw || '').match(/\{[\s\S]*\}/);
            return m ? JSON.parse(m[0]) : null;
        } catch (e) { return null; }
    }
    async function _nameDrink(ings, tier, tags) {
        const fallback = { name: ings.map(x => x.name.slice(0, 2)).join(''), blurb: tags.join('、') + '交織的一杯。' };
        const api = win.OS_API || window.OS_API;
        if (!api || !api.chat) return fallback;
        try {
            let config = {};
            const OS = win.OS_SETTINGS || window.OS_SETTINGS;
            if (OS) {
                const sec = OS.getSecondaryConfig ? OS.getSecondaryConfig() : null;
                config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : OS.getConfig();
            }
            config = config || {};
            config.route = 'cafe_naming';
            const prompt =
                '你是飲品命名師。根據材料與調性,為這款新飲品取名並寫菜單文案。只回傳純 JSON:\n' +
                '{"name":"{品名,不超過8個字,禁止直接拼接材料名,要有記憶點}","blurb":"{一句菜單文案,不超過30字}"}\n' +
                '材料:' + ings.map(x => x.name).join('、') + '\n' +
                '調性:' + tags.join('、') + '\n' +
                '品質:' + (tier === 'S' ? '靈感之作(命名可以更大膽)' : '優良') + '\n' +
                '語言:繁體中文。';
            const raw = await new Promise((resolve, reject) => {
                api.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { label: '書咖上架命名', keepCodeFences: true });
            });
            const json = _extractJSON(raw);
            if (json && json.name) return { name: String(json.name).slice(0, 12), blurb: String(json.blurb || '').slice(0, 40) };
            return fallback;
        } catch (e) { console.warn('[Cafe] 命名失敗,退機械名', e); return fallback; }
    }

    // ── ✨ 自由創想(丟符號+備用詞→副模型當嚴格評審;整杯都是AI生的,失敗不退機械底、直接重試)──
    async function _freeform(symbols, words) {
        const api = win.OS_API || window.OS_API;
        if (!api || !api.chat) return null;
        try {
            let config = {};
            const OS = win.OS_SETTINGS || window.OS_SETTINGS;
            if (OS) {
                const sec = OS.getSecondaryConfig ? OS.getSecondaryConfig() : null;
                config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : OS.getConfig();
            }
            config = config || {};
            config.route = 'cafe_freeform';
            const prompt =
                '你是書咖店長兼飲品評審。玩家把一把符號丟進了調配鍋,請把符號解讀成飲品意象,發明一款飲品並嚴格評定品質。只回傳純 JSON:\n' +
                '{"tier":"{S|A|B|C 其中之一}","name":"{品名,不超過8個字,有記憶點}","blurb":"{一句菜單文案,不超過30字}","tags":["{從標籤池挑1~3個}"],"why":"{一句評語,說明這杯成不成立}"}\n' +
                '評分標準:S=靈感之作(意象協調且驚豔,極少給)/A=優良(成立且好喝)/B=平庸(能喝但無記憶點)/C=不成立(意象打架或難以下嚥)。嚴格把關,平庸就給B,別討好玩家。\n' +
                '標籤池(只准從中挑):' + _tagPool().join('、') + '\n' +
                '鍋裡的符號:' + symbols.join(' ') + '\n' +
                (words ? '玩家補充的關鍵詞:' + words + '\n' : '') +
                '語言:繁體中文。';
            const raw = await new Promise((resolve, reject) => {
                api.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { label: '書咖自由創想', keepCodeFences: true });
            });
            const json = _extractJSON(raw);
            if (!json || !/^[SABC]$/.test(String(json.tier))) return null;
            const pool = _tagPool();
            return {
                tier: json.tier,
                name: String(json.name || '').slice(0, 12),
                blurb: String(json.blurb || '').slice(0, 40),
                tags: (Array.isArray(json.tags) ? json.tags : []).filter(t => pool.includes(t)).slice(0, 3),
                why: String(json.why || '').slice(0, 60),
            };
        } catch (e) { console.warn('[Cafe] 自由創想失敗', e); return null; }
    }

    // ── 🚶 每日消費模擬(②):開櫃檯窗時補算離線天數(旅行青蛙式,上限7天;全本地擲骰,只有首訪定調燒一次API)──
    function _samplePrefs() {
        const pool = _tagPool().slice();
        const out = [];
        while (out.length < 2 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        return out;
    }
    // 首訪定調:一次API把人設翻成口味tags+探店傾向+一本推薦書;失敗退本地隨機
    async function _tuneNpc(r) {
        const fallback = { tags: _samplePrefs(), incl: 0.5, book: null };
        const api = win.OS_API || window.OS_API;
        if (!api || !api.chat || !r.persona) return fallback;
        try {
            let config = {};
            const OS = win.OS_SETTINGS || window.OS_SETTINGS;
            if (OS) {
                const sec = OS.getSecondaryConfig ? OS.getSecondaryConfig() : null;
                config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : OS.getConfig();
            }
            config = config || {};
            config.route = 'cafe_tune';
            const prompt =
                '你是角色分析器。根據下列人設,推斷這位角色在一間書咖的消費傾向。只回傳純 JSON:\n' +
                '{"tags":["{從標籤池挑1~3個他會喜歡的口味}"],"incl":{0到1之間的小數,越高越常光顧,依性格推斷},"book":{"title":"{一本他會推薦的書名,依人設風格虛構}","note":"{一句推薦語,不超過20字,用他的口吻}"}}\n' +
                '標籤池(只准從中挑):' + _tagPool().join('、') + '\n' +
                '人設:' + String(r.persona).slice(0, 800) + '\n' +
                '語言:繁體中文。';
            const raw = await new Promise((resolve, reject) => {
                api.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { label: '書咖首訪定調', keepCodeFences: true });
            });
            const json = _extractJSON(raw);
            if (!json) return fallback;
            const pool = _tagPool();
            const tags = (Array.isArray(json.tags) ? json.tags : []).filter(t => pool.includes(t)).slice(0, 3);
            const incl = Math.min(1, Math.max(0.1, Number(json.incl) || 0.5));
            const book = (json.book && json.book.title) ? { title: String(json.book.title).slice(0, 24), note: String(json.book.note || '').slice(0, 30) } : null;
            return { tags: tags.length ? tags : fallback.tags, incl, book };
        } catch (e) { console.warn('[Cafe] 首訪定調失敗,退本地隨機', e); return fallback; }
    }
    // 挑品項:偏好tag加權+狀態機權重(嚐鮮1.5/上癮2/習慣1/吃膩0.3)+一點隨機
    function _pickItem(menu, st, day) {
        const avail = menu.filter(m => !((st.items[m.id] || {}).coolUntil > day));
        if (!avail.length) return null;
        let best = null, bestW = 0;
        for (const m of avail) {
            const it = st.items[m.id];
            let state = 'normal', w = 1;
            if (!it || !it.count) { state = 'fresh'; w = 1.5; }
            else if (it.count >= 10) { state = 'bored'; w = 0.3; }
            else if (it.streak >= 3) { state = 'addict'; w = 2; }
            else if (it.count >= 6) { state = 'habit'; w = 1; }
            w += (m.tags || []).filter(t => (st.prefs || []).includes(t)).length * 0.8;
            w *= 0.7 + Math.random() * 0.6;   // 一點隨機,別天天同一杯
            if (w > bestW) { bestW = w; best = { m, state }; }
        }
        return best;
    }
    // 🎧 點開紀錄→角色親口留言(一則只燒一次,存回該筆)
    async function _hearNpc(l) {
        const roster = await Promise.resolve(win.LobbyNpcs?.cafeRoster?.() || []);
        const r = roster.find(x => x.key === l.key);
        if (!r || !r.persona) return null;
        const api = win.OS_API || window.OS_API;
        if (!api || !api.chat) return null;
        try {
            let config = {};
            const OS = win.OS_SETTINGS || window.OS_SETTINGS;
            if (OS) {
                const sec = OS.getSecondaryConfig ? OS.getSecondaryConfig() : null;
                config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : OS.getConfig();
            }
            config = config || {};
            config.route = 'cafe_voice';
            const prompt =
                '你要扮演這位角色,在書咖的留言板上對店主(玩家)留一句話。只回傳純 JSON:\n' +
                '{"line":"{他口吻的留言,1到2句,不超過40字}"}\n' +
                '人設:' + String(r.persona).slice(0, 800) + '\n' +
                '今天他在店裡:' + l.line + (l.item ? '(品項:' + l.item + ')' : '') + '\n' +
                '語言:繁體中文。';
            const raw = await new Promise((resolve, reject) => {
                api.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { label: '書咖訪客留言', keepCodeFences: true });
            });
            const json = _extractJSON(raw);
            return (json && json.line) ? String(json.line).slice(0, 60) : null;
        } catch (e) { console.warn('[Cafe] 訪客留言失敗', e); return null; }
    }
    // 🎬 A級事件(敘事節點,燒1次API+改NPC口味設定)
    async function _eventScene(r, ev) {
        const api = win.OS_API || window.OS_API;
        if (!api || !api.chat || !r.persona) return null;
        try {
            let config = {};
            const OS = win.OS_SETTINGS || window.OS_SETTINGS;
            if (OS) {
                const sec = OS.getSecondaryConfig ? OS.getSecondaryConfig() : null;
                config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : OS.getConfig();
            }
            config = config || {};
            config.route = 'cafe_event';
            const situ = ev.type === 'devotion'
                ? '他把「' + ev.item + '」前後買了十次,這杯已經是他的本命飲品。回傳 JSON:{"line":"{他口吻的本命宣言,1到2句,不超過40字}","addTags":["{從標籤池挑最多2個他因此更偏愛的口味}"]}'
                : '他把「' + ev.item + '」喝膩了,決定暫時不再點它。回傳 JSON:{"line":"{他口吻的告別吐槽,1到2句,不超過40字}","newTags":["{從標籤池挑1到3個,代表他口味的新轉向}"]}';
            const prompt =
                '你要扮演這位角色,回應書咖裡發生在他身上的事,並更新他的口味。只回傳純 JSON。\n' +
                '標籤池(只准從中挑):' + _tagPool().join('、') + '\n' +
                '人設:' + String(r.persona).slice(0, 800) + '\n' +
                '事件:' + situ + '\n語言:繁體中文。';
            const raw = await new Promise((resolve, reject) => {
                api.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { label: '書咖事件:' + (EV_LABEL[ev.type] || ev.type), keepCodeFences: true });
            });
            const json = _extractJSON(raw);
            if (!json || !json.line) return null;
            const pool = _tagPool();
            return {
                line: String(json.line).slice(0, 60),
                addTags: (Array.isArray(json.addTags) ? json.addTags : []).filter(t => pool.includes(t)).slice(0, 2),
                newTags: (Array.isArray(json.newTags) ? json.newTags : []).filter(t => pool.includes(t)).slice(0, 3),
            };
        } catch (e) { console.warn('[Cafe] 事件生成失敗,留隊下次', e); return null; }
    }
    let _settling = null;   // 重入閂:開窗連點別疊跑
    async function _settle() {
        if (_settling) return _settling;
        _settling = _settleInner().finally(() => { _settling = null; });
        return _settling;
    }
    async function _settleInner() {
        try { if ((win.localStorage || localStorage).getItem('cafe_offline_visits') === '0') return false; } catch (e) {}
        const roster = await Promise.resolve(win.LobbyNpcs?.cafeRoster?.() || []);
        if (!roster.length) return false;
        const shop = await getShop();
        const today = _dayNum(Date.now());
        if (!shop.lastDay) { shop.lastDay = today; await _set(K_SHOP, shop); return false; }   // 開張日:從明天開始營業
        if (shop.lastDay >= today) return false;
        const from = Math.max(shop.lastDay + 1, today - 7);
        const npcs = await _get(K_NPC, {});
        const menu = await getMenu();
        const logs = await _get(K_LOG, []);
        const evq = await _get(K_EVQ, []);
        let earned = 0, cupsAdded = 0, anyVisit = false, tunedRun = 0;   // 首訪定調每次結算≤3次(名冊變大後防API爆發,沒輪到的自然留到下次)
        for (let day = from; day <= today; day++) {
            let visitToday = false;
            for (const r of roster) {
                const st = npcs[r.key] || (npcs[r.key] = { name: r.name, prefs: null, incl: 0.5, visits: 0, spend: 0, items: {} });
                if (!st.prefs) {   // 還沒定調=還沒第一次上門
                    if (tunedRun < 3 && Math.random() < 0.55) {
                        tunedRun++;
                        const tuned = await _tuneNpc(r);
                        st.prefs = tuned.tags; st.incl = tuned.incl;
                        if (tuned.book) { try { await addBook({ title: tuned.book.title, by: r.name, note: tuned.book.note }); } catch (e) {} }
                        st.visits++; visitToday = anyVisit = true;
                        logs.unshift({ id: _mkId(), day, key: r.key, name: r.name, line: TPL.first, price: 0 });
                    }
                    continue;
                }
                const p = Math.min(0.9, Math.max(0.12, st.incl * (0.45 + Math.min(0.45, (shop.popularity || 0) / 150))));
                if (Math.random() >= p) continue;
                visitToday = anyVisit = true; st.visits++;
                const pick = _pickItem(menu, st, day);
                if (!pick) { if (Math.random() < 0.4) logs.unshift({ id: _mkId(), day, key: r.key, name: r.name, line: TPL.browse, price: 0 }); continue; }
                const m = pick.m;
                const it = st.items[m.id] || (st.items[m.id] = { count: 0, streak: 0, lastDay: 0, boredHits: 0, coolUntil: 0 });
                const gap = it.lastDay ? day - it.lastDay : 0;
                it.streak = (day - it.lastDay === 1) ? it.streak + 1 : 1;
                it.count++; it.lastDay = day;
                m.sold = (m.sold || 0) + 1;
                earned += m.price; cupsAdded++; st.spend += m.price;
                let lineKey = pick.state;
                if (gap > 7 && it.count > 1) lineKey = 'comeback';
                if (pick.state === 'bored') {
                    it.boredHits = (it.boredHits || 0) + 1;
                    if (it.boredHits >= 2) { it.coolUntil = day + 7; it.boredHits = 0; evq.push({ type: 'dropout', key: r.key, item: m.name, itemId: m.id }); }   // 🎬 吃膩棄坑
                }
                if (it.count === 10 && !it.devoted) { it.devoted = true; evq.push({ type: 'devotion', key: r.key, item: m.name, itemId: m.id }); }   // 🎬 本命認證
                logs.unshift({ id: _mkId(), day, key: r.key, name: r.name, item: m.name, line: (TPL[lineKey] || TPL.normal).replace('{item}', m.name), price: m.price });
            }
            if (visitToday) shop.popularity = Math.min(999, (shop.popularity || 0) + 1);
        }
        // 🎬 A級事件消化:單次結算最多2件(敘事節點才燒API),API掛了整隊留到下次
        let evDone = 0;
        while (evq.length && evDone < 2) {
            const ev = evq[0];
            const r = roster.find(x => x.key === ev.key);
            const st = npcs[ev.key];
            if (!r || !st) { evq.shift(); continue; }
            const out = await _eventScene(r, ev);
            if (!out) break;
            if (ev.type === 'devotion' && out.addTags.length) st.prefs = Array.from(new Set([].concat(st.prefs || [], out.addTags))).slice(0, 4);
            if (ev.type === 'dropout' && out.newTags.length) st.prefs = out.newTags;   // 口味轉向:整組改寫
            logs.unshift({ id: _mkId(), day: today, key: ev.key, name: st.name, item: ev.item, line: out.line, said: out.line, price: 0, ev: ev.type });
            evq.shift(); evDone++; anyVisit = true;
        }
        shop.lastDay = today;
        shop.revenue = (shop.revenue || 0) + earned;
        shop.cups = (shop.cups || 0) + cupsAdded;
        await _set(K_EVQ, evq);
        await _set(K_NPC, npcs); await _set(K_MENU, menu); await _set(K_LOG, logs.slice(0, 80)); await _set(K_SHOP, shop);
        if (earned > 0) { try { await (win.OS_PT || window.OS_PT)?.addPT?.(earned, { reason: '書咖營業收入' }); } catch (e) {} }
        return anyVisit;
    }

    // ── 對外資料 API(事件/好感度後續掛這)──
    async function getMenu() { return _get(K_MENU, []); }
    async function getBooks() { return _get(K_BOOKS, []); }
    async function getShop() { return _get(K_SHOP, { popularity: 0, revenue: 0, cups: 0, lastDay: 0 }); }
    async function addBook(entry) {
        const books = await getBooks();
        books.unshift(Object.assign({ ts: Date.now() }, entry));
        await _set(K_BOOKS, books.slice(0, 60));
    }

    // ── UI:調配台/菜單窗(注入 <style> 全 class;兩層換頁:菜單/書單瀏覽 ⇄ 調配操作)──
    function _ensureStyle(doc) {
        if (doc.getElementById('os-cafe-style')) return;
        const st = doc.createElement('style');
        st.id = 'os-cafe-style';
        st.textContent =
            /* ☕ 奶油紙張＋點單票：保持書咖木質暖色，但把玩法層級拉出來 */
            '.oc-win{position:absolute;right:max(2.2%,calc(50% - 410px));top:50%;transform:translateY(-50%);z-index:3350;width:420px;max-width:52%;min-height:min(520px,76%);max-height:82%;display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(rgba(250,244,234,.975),rgba(247,237,222,.975)),repeating-linear-gradient(0deg,transparent 0 7px,rgba(112,76,42,.018) 8px);border:1px solid #cbb58f;border-radius:18px;color:#4a3828;font-size:13px;box-shadow:0 16px 42px rgba(69,46,27,.34),inset 0 0 0 3px rgba(255,255,255,.35);backdrop-filter:blur(8px);}' +
            '.oc-head{display:flex;align-items:center;gap:10px;padding:11px 13px;border-bottom:1px solid rgba(139,101,61,.18);background:rgba(255,252,245,.55);color:#65492f;}' +
            '.oc-brand{display:flex;align-items:center;gap:9px;min-width:0;}.oc-brand-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:#7a5230;color:#fff8ed;font-size:18px;box-shadow:0 3px 9px rgba(88,55,28,.18);}' +
            '.oc-sprite{display:inline-block;width:32px;height:32px;flex:none;background-image:url("' + CAFE_ITEM_SHEET + '");background-repeat:no-repeat;background-size:400% 300%;border-radius:7px;font-size:0;vertical-align:middle;}.oc-assets-missing .oc-sprite{display:inline-grid;place-items:center;background-image:none!important;color:inherit;font-size:18px;}' + _spritePosCss() +
            '.oc-brand-copy{display:flex;flex-direction:column;line-height:1.05;white-space:nowrap;}.oc-brand-copy b{font-size:15px;letter-spacing:.06em;}.oc-brand-copy small{margin-top:4px;color:#a18869;font-size:8px;letter-spacing:.18em;font-weight:700;}' +
            '.oc-head-stats{display:flex;gap:5px;margin-left:auto;}.oc-stat-pill{display:flex;align-items:center;gap:4px;padding:5px 7px;border:1px solid #dfceb2;border-radius:8px;background:rgba(255,255,255,.58);color:#816143;font-size:11px;white-space:nowrap;}.oc-stat-pill b{color:#5e4028;font-size:12px;}' +
            '.oc-head .oc-close{background:none;border:none;color:#765638;cursor:pointer;font-size:15px;padding:5px 6px;border-radius:8px;}.oc-head .oc-close:hover{background:rgba(122,82,48,.1);}' +
            '.oc-tabs{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:9px 12px 0;}' +
            '.oc-tab{min-width:0;background:rgba(255,255,255,.45);border:1px solid #dcc9aa;color:#735437;border-radius:8px;padding:6px 2px;cursor:pointer;font-size:10px;white-space:nowrap;}.oc-tab i{display:block;margin-bottom:3px;font-size:12px;}' +
            '.oc-tab.on{background:#8a5c34;border-color:#8a5c34;color:#fff8ed;font-weight:700;box-shadow:0 3px 8px rgba(105,67,35,.18);}' +
            '.oc-body{overflow-y:auto;padding:11px 13px 14px;flex:1;display:flex;flex-direction:column;scrollbar-color:#c9ae88 transparent;scrollbar-width:thin;}' +
            '.oc-body .oc-empty{margin:auto;}' +
            '.oc-section-head{display:flex;align-items:center;justify-content:space-between;margin:0 1px 8px;color:#6a4b30;}.oc-section-title{font-weight:800;font-size:13px;letter-spacing:.04em;}.oc-section-note{color:#a18465;font-size:10px;}' +
            '.oc-item{display:flex;align-items:baseline;gap:8px;margin-bottom:7px;padding:9px 10px;border:1px solid rgba(194,164,124,.5);border-radius:10px;background:rgba(255,253,248,.58);flex-wrap:wrap;}' +
            '.oc-item.oc-click{cursor:pointer;transition:transform .15s,background .15s;}.oc-item.oc-click:hover{transform:translateY(-1px);background:rgba(255,255,255,.82);}' +
            '.oc-item.ev{background:rgba(214,158,84,.12);border-color:#d8bb89;}' +
            '.oc-hear{color:#c9b28a;font-size:12px;margin-left:4px;}.oc-hear.has{color:#a9744a;}' +
            '.oc-said{display:block;margin-top:6px;padding:7px 10px;background:rgba(169,116,74,.08);border-left:3px solid #c9a06a;border-radius:6px;color:#5a4030;font-size:12px;line-height:1.6;}' +
            '.oc-loading{color:#a3906f;}.oc-item .oc-name{font-weight:700;color:#5a4030;}.oc-item .oc-price{margin-left:auto;white-space:nowrap;color:#a9744a;font-weight:700;}' +
            '.oc-blurb{display:block;color:#8a7358;font-size:11px;margin-top:3px;line-height:1.45;}' +
            '.oc-menu-card{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:9px;margin-bottom:8px;padding:9px 10px;border:1px solid rgba(194,164,124,.56);border-radius:12px;background:rgba(255,253,248,.7);box-shadow:0 2px 7px rgba(91,61,34,.06);}' +
            '.oc-drink-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:11px;background:rgba(186,134,79,.13);}.oc-drink-icon .oc-sprite{width:40px;height:40px;border-radius:9px;}.oc-menu-main{min-width:0;}.oc-menu-title{display:flex;align-items:center;gap:5px;font-weight:800;color:#573b26;}.oc-menu-side{text-align:right;white-space:nowrap;}.oc-menu-price{display:block;margin-top:5px;color:#9d6638;font-weight:800;font-size:12px;}.oc-menu-sold{display:block;margin-top:2px;color:#a58b70;font-size:9px;}' +
            '.oc-mini-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px;}.oc-mini-tag{padding:1px 5px;border-radius:9px;background:#efe3d2;color:#896b4d;font-size:9px;}' +
            '.oc-badge{font-size:9px;padding:2px 6px;border-radius:7px;border:1px solid;white-space:nowrap;background:rgba(255,255,255,.55);}' +
            '.oc-badge.s{color:#a87500;border-color:#caa24a;}.oc-badge.a{color:#4e8155;border-color:#7cae85;}.oc-badge.b{color:#7e7e86;border-color:#b6b6bd;}.oc-badge.c{color:#b65050;border-color:#d99;}' +
            '.oc-empty{color:#9b8267;padding:24px 6px;text-align:center;line-height:1.8;}.oc-empty i{display:block;margin-bottom:8px;color:#c5a47d;font-size:28px;}' +
            '.oc-slot-label{display:flex;align-items:center;gap:6px;margin:10px 1px 6px;color:#7e5b39;font-size:11px;font-weight:800;}.oc-slot-label:after{content:"";height:1px;flex:1;background:rgba(146,102,61,.15);}' +
            '.oc-chips{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;}.oc-chips.three{grid-template-columns:repeat(3,minmax(0,1fr));}' +
            '.oc-chip{min-width:0;background:rgba(255,255,255,.58);border:1px solid #d8c3a1;color:#5a4634;border-radius:10px;padding:6px 3px;cursor:pointer;font-size:10px;line-height:1.25;}.oc-chip .oc-ing-icon{display:block;width:34px;height:34px;margin:0 auto 3px;}' +
            '.oc-chip.on{background:#f2dfc6;border-color:#b77b42;color:#674224;font-weight:700;box-shadow:inset 0 0 0 1px rgba(183,123,66,.15);}' +
            '.oc-brew,.oc-action{width:100%;margin-top:12px;background:#7a4f2d;border:1px solid #6d4425;color:#fff8ed;font-weight:800;border-radius:11px;padding:10px 0;cursor:pointer;font-size:12px;box-shadow:0 4px 9px rgba(92,55,27,.16);}.oc-brew:disabled,.oc-action:disabled{opacity:.42;cursor:default;box-shadow:none;}' +
            '.oc-result{margin-top:10px;border:1px solid #d8c6a8;border-radius:11px;padding:10px 12px;background:rgba(255,252,246,.72);}.oc-result .oc-note{color:#8a7358;font-size:11px;margin-top:4px;line-height:1.5;}' +
            '.oc-shelf{width:100%;margin-top:8px;background:rgba(78,139,87,.12);border:1px solid #7cae85;color:#3c6b44;font-weight:700;border-radius:10px;padding:8px 0;cursor:pointer;font-size:12px;}.oc-shelf:disabled{opacity:.5;cursor:default;}' +
            '.oc-tried{display:flex;justify-content:space-between;color:#a18a70;font-size:10px;margin-top:7px;}.oc-progress-line{height:4px;margin-top:5px;border-radius:5px;background:#eadcc8;overflow:hidden;}.oc-progress-line i{display:block;height:100%;background:#bd854c;border-radius:5px;}' +
            '.oc-sym-grid{display:flex;flex-wrap:wrap;gap:6px;max-height:195px;overflow-y:auto;padding-right:2px;}.oc-sym{width:37px;height:37px;font-size:17px;background:rgba(255,255,255,.6);border:1px solid #d3bf9f;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;}.oc-sym.on{background:rgba(214,158,84,.3);border-color:#a9744a;}' +
            '.oc-free-input{width:100%;box-sizing:border-box;margin-top:10px;background:rgba(255,255,255,.75);border:1px solid #d3bf9f;border-radius:9px;color:#4a3a2a;padding:8px 10px;font-size:11px;}.oc-free-input::placeholder{color:#a3906f;}' +
            '.oc-shift-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:9px;}.oc-shift-stat{padding:7px 5px;border:1px solid #dfceb2;border-radius:9px;background:rgba(255,255,255,.5);text-align:center;color:#8d7257;font-size:9px;}.oc-shift-stat b{display:block;margin-bottom:2px;color:#66482f;font-size:14px;}' +
            '.oc-receipt{position:relative;margin:2px 0 10px;padding:11px 12px;border:1px dashed #c4a67c;border-radius:9px;background:rgba(255,254,248,.82);box-shadow:0 3px 9px rgba(88,57,30,.07);}.oc-receipt-head{display:flex;justify-content:space-between;align-items:center;color:#68492f;font-weight:800;}.oc-timer{color:#9c6335;font-size:13px;}.oc-timer.danger{color:#c45243;animation:oc-pulse .8s infinite;}' +
            '.oc-order-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px;}.oc-order-part{padding:7px 3px;border:1px solid #e2d2b9;border-radius:9px;background:rgba(248,240,227,.7);text-align:center;color:#76583b;font-size:9px;}.oc-order-part .oc-order-icon{display:grid;place-items:center;height:48px;margin-bottom:4px;font-size:24px;}.oc-order-part .oc-order-icon .oc-sprite{width:48px;height:48px;}.oc-order-part.hidden .oc-order-icon{filter:grayscale(1);opacity:.45;}' +
            '.oc-intro-pad{padding:14px 4px 8px;}.oc-shift-hint{text-align:center;color:#92785d;font-size:10px;line-height:1.5;margin:1px 0 8px;}.oc-ing-row{display:grid;grid-template-columns:44px repeat(4,minmax(0,1fr));gap:5px;align-items:stretch;margin-bottom:6px;}.oc-ing-row.three{grid-template-columns:44px repeat(3,minmax(0,1fr));}.oc-ing-row-label{display:grid;place-items:center;color:#84613f;font-size:10px;font-weight:800;}.oc-ing-btn{min-width:0;padding:5px 2px;border:1px solid #dbc7a7;border-radius:9px;background:rgba(255,255,255,.58);color:#72563c;cursor:pointer;font-size:9px;line-height:1.15;}.oc-ing-btn>.oc-sprite{display:block;width:32px;height:32px;margin:0 auto 2px;}.oc-ing-btn.on{border-color:#b6783f;background:#f1ddc3;color:#5e3e23;font-weight:800;}.oc-ing-btn:disabled{opacity:.45;cursor:default;}' +
            '.oc-peek{display:block;margin:5px auto 0;border:none;background:none;color:#9a7959;text-decoration:underline;text-underline-offset:2px;cursor:pointer;font-size:9px;}.oc-shift-foot{display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:6px 8px;border-top:1px dotted #cbb28f;color:#8e7255;font-size:10px;}.oc-shift-result{text-align:center;padding:12px 8px;}.oc-intro-sprite,.oc-result-mark .oc-sprite{width:58px;height:58px;border-radius:10px;}.oc-intro-sprite{display:block;margin:0 auto 7px;}.oc-result-mark{min-height:58px;}.oc-shift-result h3{margin:4px 0;color:#66462d;}.oc-compare{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px;text-align:left;}.oc-compare>div{padding:7px;border-radius:8px;background:rgba(239,226,207,.55);font-size:9px;color:#8a6c4f;}.oc-compare b{display:block;margin-bottom:4px;color:#65482f;}.oc-final-score{font-size:28px;font-weight:900;color:#86572f;margin:4px 0;}' +
            '@keyframes oc-pulse{50%{transform:scale(1.08)}}' +
            '@media (max-width:760px){.oc-win{right:10px;left:10px;width:auto;max-width:none;max-height:76%;min-height:min(500px,72%);}.oc-brand-copy small{display:none}.oc-stat-pill{padding:4px 5px}.oc-tab{font-size:9px}.void-dock-open #iris-avatar{opacity:.22;filter:brightness(.55) blur(1px);transition:opacity .25s;}}';
        doc.head.appendChild(st);
        try {
            const probe = new win.Image();
            probe.onload = () => doc.documentElement.classList.remove('oc-assets-missing');
            probe.onerror = () => doc.documentElement.classList.add('oc-assets-missing');
            probe.src = CAFE_ITEM_SHEET;
        } catch (e) { doc.documentElement.classList.add('oc-assets-missing'); }
    }

    let _winEl = null;
    let _viewCleanup = null;
    async function _refreshHeaderStats() {
        if (!_winEl) return;
        const shop = await getShop();
        const pop = _winEl.querySelector('[data-cafe-stat="pop"]');
        const cups = _winEl.querySelector('[data-cafe-stat="cups"]');
        if (pop) pop.textContent = String(shop.popularity || 0);
        if (cups) cups.textContent = String(shop.cups || 0);
    }
    function closeWorkshop() {
        if (_viewCleanup) { _viewCleanup(); _viewCleanup = null; }
        _winEl?.remove(); _winEl = null;
        try { win.document.querySelector('.lobby-left')?.classList.remove('void-dock-open'); } catch (e) {}
    }
    async function openWorkshop() {
        closeWorkshop();
        const doc = win.document;
        _ensureStyle(doc);
        const host = doc.querySelector('.lobby-left') || doc.body;
        host.classList.add('void-dock-open');   // 📱 手機:立繪退後變暗、面板站前排
        const box = doc.createElement('div');
        box.className = 'oc-win';
        box.innerHTML =
            '<div class="oc-head">' +
              '<div class="oc-brand"><span class="oc-brand-icon"><i class="fa-solid fa-mug-hot"></i></span>' +
                '<span class="oc-brand-copy"><b>書咖櫃檯</b><small>PARALLAX CAFE</small></span></div>' +
              '<div class="oc-head-stats">' +
                '<span class="oc-stat-pill"><i class="fa-solid fa-heart"></i> 人氣 <b data-cafe-stat="pop">0</b></span>' +
                '<span class="oc-stat-pill"><i class="fa-solid fa-mug-saucer"></i> 售出 <b data-cafe-stat="cups">0</b></span>' +
              '</div>' +
              '<button class="oc-close" title="關閉"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="oc-tabs">' +
              '<button class="oc-tab on" data-tab="menu"><i class="fa-solid fa-receipt"></i>菜單</button>' +
              '<button class="oc-tab" data-tab="lab"><i class="fa-solid fa-blender"></i>調配</button>' +
              '<button class="oc-tab" data-tab="shift"><i class="fa-solid fa-bell-concierge"></i>值班</button>' +
              '<button class="oc-tab" data-tab="free"><i class="fa-solid fa-wand-magic-sparkles"></i>創想</button>' +
              '<button class="oc-tab" data-tab="books"><i class="fa-solid fa-book-open"></i>書單</button>' +
              '<button class="oc-tab" data-tab="log"><i class="fa-solid fa-users"></i>訪客</button>' +
            '</div>' +
            '<div class="oc-body"></div>';
        host.appendChild(box);
        _winEl = box;
        box.querySelector('.oc-close').addEventListener('click', () => {
            // ✕=連對話一起結束(同白兔成例);endTalk 會回呼 closeWorkshop,單獨關窗也安全
            try { win.LobbyStage?.endTalk?.(); } catch (e) {}
            closeWorkshop();
        });
        const body = box.querySelector('.oc-body');
        const tabs = box.querySelectorAll('.oc-tab');
        tabs.forEach(t => t.addEventListener('click', () => {
            tabs.forEach(x => x.classList.toggle('on', x === t));
            _renderTab(t.dataset.tab, body);
        }));
        _renderTab('menu', body);
        _refreshHeaderStats();
        // ☕ 開窗=補算離線天數(有新動靜就刷新當前頁;背景跑不擋開窗)
        _settle().then(changed => {
            if (!changed || !_winEl) return;
            const on = _winEl.querySelector('.oc-tab.on');
            _refreshHeaderStats();
            if (on?.dataset.tab !== 'shift') _renderTab(on ? on.dataset.tab : 'menu', _winEl.querySelector('.oc-body'));
        }).catch(() => {});
    }

    async function _renderTab(tab, body) {
        if (_viewCleanup) { _viewCleanup(); _viewCleanup = null; }
        if (tab === 'menu') {
            const [menu, shop] = await Promise.all([getMenu(), getShop()]);
            body.innerHTML = '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-mug-hot"></i> 今日菜單</span><span class="oc-section-note">' + menu.length + ' 款・累計 ' + (shop.revenue || 0) + ' PT</span></div>' + (menu.length
                ? menu.map(m => {
                    const iconId = (m.ings || []).find(id => SPRITE_POS[id]) || (m.free ? 'receipt' : 'coffee');
                    return '<div class="oc-menu-card"><span class="oc-drink-icon">' + _sprite(iconId) + '</span>' +
                    '<span class="oc-menu-main"><span class="oc-menu-title">' + m.name + '</span><span class="oc-blurb">' + (m.blurb || '') + '</span>' +
                    '<span class="oc-mini-tags">' + (m.tags || []).map(t => '<i class="oc-mini-tag">' + t + '</i>').join('') + '</span></span>' +
                    '<span class="oc-menu-side"><span class="oc-badge ' + (TIER_TEXT[m.tier]?.cls || 'a') + '">' + (TIER_TEXT[m.tier]?.label || '') + '</span>' +
                    '<span class="oc-menu-price">' + m.price + ' PT</span><span class="oc-menu-sold">售出 ' + (m.sold || 0) + '</span></span></div>';
                }).join('')
                : '<div class="oc-empty"><i class="fa-solid fa-mug-hot"></i>菜單還是空的。<br>去「調配」研發出好東西再上架吧。</div>');
        } else if (tab === 'log') {
            let logs = await _get(K_LOG, []);
            if (logs.some(l => !l.id)) { logs.forEach(l => { if (!l.id) l.id = _mkId(); }); await _set(K_LOG, logs); }   // 舊紀錄補id
            const md = (d) => { const t = new Date(d * DAY_MS); return (t.getMonth() + 1) + '/' + t.getDate(); };
            body.innerHTML = '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-users"></i> 訪客手札</span><span class="oc-section-note">最近 ' + logs.length + ' 筆</span></div>' + (logs.length
                ? logs.map(l => {
                    if (l.ev) {   // 🎬 事件卡:角色親口說的,直接攤開
                        return '<div class="oc-item ev"><span><span class="oc-name">⭐ ' + md(l.day) + '・' + l.name + '・' + (EV_LABEL[l.ev] || '') + (l.item ? '「' + l.item + '」' : '') + '</span>' +
                            '<span class="oc-said">「' + l.line + '」</span></span></div>';
                    }
                    return '<div class="oc-item oc-click" data-id="' + l.id + '"><span><span class="oc-name">' + md(l.day) + '・' + l.name + '</span>' +
                        '<span class="oc-blurb">' + l.line + '</span>' +
                        (l.said ? '<span class="oc-said">「' + l.said + '」</span>' : '') + '</span>' +
                        '<span class="oc-price">' + (l.price ? '+' + l.price + ' PT ' : '') +
                        (l.key ? '<i class="fa-solid fa-comment-dots oc-hear' + (l.said ? ' has' : '') + '"></i>' : '') + '</span></div>';
                }).join('')
                : '<div class="oc-empty"><i class="fa-solid fa-door-open"></i>還沒有客人來過。<br>上架點好東西，常客們就會自己上門了。</div>');
            // 🎧 點一筆=請那位客人親口說(一筆只燒一次,說過的存起來、再點只是收合/展開)
            body.querySelectorAll('.oc-click').forEach(el => el.addEventListener('click', async () => {
                const id = el.dataset.id;
                const cur = await _get(K_LOG, []);
                const l = cur.find(x => x.id === id);
                if (!l || !l.key) return;
                const old = el.querySelector('.oc-said');
                if (l.said) { if (old) old.remove(); else el.querySelector('.oc-blurb')?.insertAdjacentHTML('afterend', '<span class="oc-said">「' + l.said + '」</span>'); return; }
                if (el.querySelector('.oc-loading')) return;
                el.querySelector('.oc-blurb')?.insertAdjacentHTML('afterend', '<span class="oc-said oc-loading">他想了想…</span>');
                const said = await _hearNpc(l);
                const loading = el.querySelector('.oc-loading');
                if (!said) { if (loading) loading.textContent = '他沒搭理你,再點一次試試。'; return; }
                l.said = said;
                await _set(K_LOG, cur);
                if (loading) { loading.classList.remove('oc-loading'); loading.textContent = '「' + said + '」'; }
                el.querySelector('.oc-hear')?.classList.add('has');
            }));
        } else if (tab === 'books') {
            const books = await getBooks();
            body.innerHTML = '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-book-open"></i> 客人書單</span><span class="oc-section-note">' + books.length + ' 本收藏</span></div>' + (books.length
                ? books.map(b =>
                    '<div class="oc-item"><span><span class="oc-name">《' + b.title + '》</span>' +
                    '<span class="oc-blurb">' + (b.by ? b.by + ':' : '') + (b.note || '') + '</span></span></div>').join('')
                : '<div class="oc-empty"><i class="fa-solid fa-book"></i>書架還空著。<br>之後來店裡的客人會留下他們的推薦書。</div>');
        } else if (tab === 'free') {
            _renderFree(body);
        } else if (tab === 'shift') {
            await _renderShift(body);
        } else {
            _renderLab(body);
        }
    }

    // 🔔 值班頁：三杯制點單記憶遊戲。全程零 API，也不碰 PT 經濟。
    async function _renderShift(body) {
        const record = await _get(K_SHIFT, { best: 0, games: 0, bestStreak: 0 });
        if (!body.isConnected) return;
        const state = {
            round: 0,
            score: 0,
            streak: 0,
            maxStreak: 0,
            time: 18,
            phase: 'idle',
            target: null,
            sel: { base: null, flavor: null, top: null },
            peekUsed: false,
            used: new Set(),
        };
        let phaseTimer = null;
        let clock = null;
        let peekTimer = null;
        let disposed = false;

        const clearTimers = () => {
            if (phaseTimer) clearTimeout(phaseTimer);
            if (clock) clearInterval(clock);
            if (peekTimer) clearTimeout(peekTimer);
            phaseTimer = clock = peekTimer = null;
        };
        _viewCleanup = () => { disposed = true; clearTimers(); };

        const partHtml = (slot, id, hidden) => {
            const ing = _ing(slot, id);
            return '<div class="oc-order-part' + (hidden ? ' hidden' : '') + '">' +
                '<span class="oc-order-icon">' + (hidden ? '❔' : _sprite(id)) + '</span>' +
                (hidden ? SLOT_LABEL[slot] + '已摺起' : ing.name) + '</div>';
        };
        const orderHtml = (hidden) => ['base', 'flavor', 'top'].map(slot => partHtml(slot, state.target[slot], hidden)).join('');
        const comboNames = (combo) => ['base', 'flavor', 'top'].map(slot => combo[slot] ? _ing(slot, combo[slot])?.name : '未選').join('＋');
        const newTarget = () => {
            let target;
            let key;
            do {
                target = {};
                Object.keys(CAFE_CFG.pantry).forEach(slot => {
                    const list = CAFE_CFG.pantry[slot];
                    target[slot] = list[Math.floor(Math.random() * list.length)].id;
                });
                key = _comboKey(target.base, target.flavor, target.top);
            } while (state.used.has(key) && state.used.size < 3);
            state.used.add(key);
            return target;
        };
        const summaryHtml = () =>
            '<div class="oc-shift-summary">' +
              '<div class="oc-shift-stat"><b>' + (record.best || 0) + '</b>最高分</div>' +
              '<div class="oc-shift-stat"><b>' + (record.bestStreak || 0) + '</b>最高連勝</div>' +
              '<div class="oc-shift-stat"><b>' + (record.games || 0) + '</b>值班次數</div>' +
            '</div>';

        const renderIntro = () => {
            body.innerHTML =
                '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-bell-concierge"></i> 今日值班</span><span class="oc-section-note">離線小遊戲・不呼叫 API</span></div>' +
                summaryHtml() +
                '<div class="oc-receipt"><div class="oc-receipt-head"><span>點單記憶測驗</span><span>3 杯制</span></div>' +
                  '<div class="oc-empty oc-intro-pad">' + _sprite('receipt', 'oc-intro-sprite') + '客人的點單只會攤開幾秒。<br>記住基底、風味與點綴，再照單完成飲品。</div>' +
                '</div>' +
                '<button class="oc-action"><i class="fa-solid fa-door-open"></i> 開始接單</button>' +
                '<div class="oc-shift-foot"><span>答對越快，分數越高</span><span>偷看點單會扣 15 分</span></div>';
            body.querySelector('.oc-action').addEventListener('click', startRound);
        };

        const pickerHtml = (disabled) => Object.keys(CAFE_CFG.pantry).map(slot => {
            const list = CAFE_CFG.pantry[slot];
            return '<div class="oc-ing-row' + (list.length === 3 ? ' three' : '') + '">' +
                '<span class="oc-ing-row-label">' + SLOT_LABEL[slot] + '</span>' +
                list.map(x => '<button class="oc-ing-btn" data-slot="' + slot + '" data-id="' + x.id + '"' + (disabled ? ' disabled' : '') + '>' +
                    _sprite(x.id) + x.name + '</button>').join('') + '</div>';
        }).join('');

        const bindPickers = () => {
            const action = body.querySelector('.oc-action');
            body.querySelectorAll('.oc-ing-btn').forEach(btn => btn.addEventListener('click', () => {
                if (state.phase !== 'pick') return;
                const slot = btn.dataset.slot;
                state.sel[slot] = btn.dataset.id;
                body.querySelectorAll('.oc-ing-btn[data-slot="' + slot + '"]').forEach(x => x.classList.toggle('on', x === btn));
                action.disabled = !(state.sel.base && state.sel.flavor && state.sel.top);
            }));
            action?.addEventListener('click', () => {
                const ok = ['base', 'flavor', 'top'].every(slot => state.sel[slot] === state.target[slot]);
                finishRound(ok, ok ? '完美照單完成' : '配方對不上點單');
            });
            const peek = body.querySelector('.oc-peek');
            peek?.addEventListener('click', () => {
                if (state.phase !== 'pick' || state.peekUsed) return;
                state.peekUsed = true;
                peek.disabled = true;
                peek.textContent = '點單偷看中…（本杯 -15 分）';
                const grid = body.querySelector('.oc-order-grid');
                if (grid) grid.innerHTML = orderHtml(false);
                peekTimer = setTimeout(() => {
                    if (disposed || state.phase !== 'pick') return;
                    const current = body.querySelector('.oc-order-grid');
                    if (current) current.innerHTML = orderHtml(true);
                    if (peek) peek.textContent = '點單已經摺回去了';
                }, 1200);
            });
        };

        const renderRound = (preview) => {
            body.innerHTML =
                '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-bell-concierge"></i> 今日值班</span><span class="oc-section-note">分數 ' + state.score + '・連勝 ' + state.streak + '</span></div>' +
                '<div class="oc-receipt"><div class="oc-receipt-head"><span>今日點單・第 ' + state.round + ' 杯</span>' +
                  '<span class="oc-timer">' + (preview ? '記住！' : state.time + 's') + '</span></div>' +
                  '<div class="oc-order-grid">' + orderHtml(!preview) + '</div>' +
                '</div>' +
                '<div class="oc-shift-hint">' + (preview ? '客人正在確認點單，先把三樣材料記下來。' : '點單收起來了，請依照記憶選擇正確材料。') + '</div>' +
                pickerHtml(preview) +
                (preview ? '' : '<button class="oc-peek">偷看點單一次（本杯 -15 分）</button>') +
                '<button class="oc-action" disabled><i class="fa-solid fa-mug-hot"></i> 完成飲品</button>' +
                '<div class="oc-shift-foot"><span>第 ' + state.round + ' / 3 杯</span><span>連勝 ' + state.streak + '</span></div>';
            if (!preview) bindPickers();
        };

        const beginPick = () => {
            if (disposed || state.phase !== 'preview') return;
            state.phase = 'pick';
            state.time = 18;
            renderRound(false);
            clock = setInterval(() => {
                state.time -= 1;
                const timer = body.querySelector('.oc-timer');
                if (timer) {
                    timer.textContent = state.time + 's';
                    timer.classList.toggle('danger', state.time <= 5);
                }
                if (state.time <= 0) finishRound(false, '時間到，客人等不下去了');
            }, 1000);
        };

        async function finishRound(ok, reason) {
            if (disposed || state.phase !== 'pick') return;
            state.phase = 'result';
            clearTimers();
            const gained = ok ? Math.max(0, 100 + state.time * 5 - (state.peekUsed ? 15 : 0)) : 0;
            state.score += gained;
            if (ok) state.streak += 1; else state.streak = 0;
            state.maxStreak = Math.max(state.maxStreak, state.streak);
            const last = state.round >= 3;
            if (last) {
                record.best = Math.max(Number(record.best) || 0, state.score);
                record.bestStreak = Math.max(Number(record.bestStreak) || 0, state.maxStreak);
                record.games = (Number(record.games) || 0) + 1;
                await _set(K_SHIFT, record);
            }
            if (disposed) return;
            body.innerHTML =
                '<div class="oc-section-head"><span class="oc-section-title">第 ' + state.round + ' 杯結果</span><span class="oc-section-note">目前 ' + state.score + ' 分</span></div>' +
                '<div class="oc-receipt oc-shift-result"><div class="oc-result-mark">' + _sprite(ok ? 'coffee' : 'receipt') + '</div>' +
                  '<h3>' + reason + '</h3><div class="oc-shift-hint">' + (ok ? '+' + gained + ' 分，咖啡香穩穩落地。' : '這杯先由瀅瀅接手，下一杯再追回來。') + '</div>' +
                  '<div class="oc-compare"><div><b>客人點單</b>' + comboNames(state.target) + '</div><div><b>你的飲品</b>' + comboNames(state.sel) + '</div></div>' +
                '</div>' +
                '<button class="oc-action">' + (last ? '<i class="fa-solid fa-flag-checkered"></i> 查看結算' : '<i class="fa-solid fa-bell"></i> 下一位客人') + '</button>' +
                '<div class="oc-shift-foot"><span>第 ' + state.round + ' / 3 杯</span><span>連勝 ' + state.streak + '</span></div>';
            body.querySelector('.oc-action').addEventListener('click', last ? renderFinal : startRound);
        }

        function startRound() {
            if (disposed) return;
            clearTimers();
            state.round += 1;
            state.phase = 'preview';
            state.target = newTarget();
            state.sel = { base: null, flavor: null, top: null };
            state.peekUsed = false;
            renderRound(true);
            phaseTimer = setTimeout(beginPick, 3200);
        }

        function renderFinal() {
            body.innerHTML =
                '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-stamp"></i> 值班結算</span><span class="oc-section-note">三杯完成</span></div>' +
                '<div class="oc-receipt oc-shift-result"><div class="oc-result-mark">' + _sprite('bell') + '</div><h3>今日值班完成</h3>' +
                  '<div class="oc-final-score">' + state.score + '</div><div class="oc-shift-hint">本輪最高連勝 ' + state.maxStreak + '・歷史最高分 ' + record.best + '</div></div>' +
                summaryHtml() +
                '<button class="oc-action"><i class="fa-solid fa-rotate-right"></i> 再值一班</button>';
            body.querySelector('.oc-action').addEventListener('click', () => {
                state.round = 0; state.score = 0; state.streak = 0; state.maxStreak = 0; state.used.clear();
                startRound();
            });
        }

        renderIntro();
    }

    // ✨ 創想頁:符號庫丟鍋(上限 symbolMax)+備用詞→「請店長特調」
    async function _renderFree(body) {
        const picked = [];
        body.innerHTML =
            '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-wand-magic-sparkles"></i> 自由創想</span><span class="oc-section-note">此功能會呼叫 AI</span></div>' +
            '<div class="oc-slot-label">把符號丟進鍋裡(最多 ' + CAFE_CFG.symbolMax + ' 顆),店長會把它們釀成一杯:</div>' +
            '<div class="oc-sym-grid">' + CAFE_CFG.symbols.map(s => '<button class="oc-sym" data-s="' + s + '">' + s + '</button>').join('') + '</div>' +
            '<input class="oc-free-input" maxlength="24" placeholder="想補充的關鍵詞(可留空)">' +
            '<button class="oc-brew" disabled><i class="fa-solid fa-wand-magic-sparkles"></i> 請店長特調(會呼叫 AI)</button>' +
            '<div class="oc-result-slot"></div>';
        const brew = body.querySelector('.oc-brew');
        body.querySelector('.oc-sym-grid').addEventListener('click', (e) => {
            const b = e.target.closest('.oc-sym');
            if (!b) return;
            const s = b.dataset.s, at = picked.indexOf(s);
            if (at >= 0) { picked.splice(at, 1); b.classList.remove('on'); }
            else if (picked.length < CAFE_CFG.symbolMax) { picked.push(s); b.classList.add('on'); }
            brew.disabled = !picked.length;
        });
        brew.addEventListener('click', async () => {
            brew.disabled = true;
            brew.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 店長端詳著鍋裡的東西…';
            const words = body.querySelector('.oc-free-input').value.trim();
            const r = await _freeform(picked.slice(), words);
            brew.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 請店長特調(會呼叫 AI)';
            brew.disabled = !picked.length;
            const slot = body.querySelector('.oc-result-slot');
            if (!r) { slot.innerHTML = '<div class="oc-result"><div class="oc-note">店長走神了,什麼都沒釀出來——再按一次試試。</div></div>'; return; }
            const T = TIER_TEXT[r.tier];
            const ok = r.tier === 'S' || r.tier === 'A';
            slot.innerHTML =
                '<div class="oc-result"><span class="oc-badge ' + T.cls + '">' + T.label + '</span> ' +
                (ok ? '✨' + r.name : picked.join(' ')) +
                '<div class="oc-note">' + (r.why || T.note) + '</div>' +
                (ok ? '<div class="oc-blurb">' + r.blurb + '</div><button class="oc-shelf"><i class="fa-solid fa-arrow-up-from-bracket"></i> 上架</button>' : '') +
                '</div>';
            const shelfBtn = slot.querySelector('.oc-shelf');
            if (shelfBtn) shelfBtn.addEventListener('click', async () => {
                const menu = await getMenu();
                if (menu.filter(m => m.free).length >= CAFE_CFG.freeformCap) {
                    shelfBtn.outerHTML = '<div class="oc-note">創想品在架已滿 ' + CAFE_CFG.freeformCap + ' 款——菜單頁下架一款再來。</div>';
                    return;
                }
                menu.unshift({ id: 'free_' + Date.now(), key: 'free_' + Date.now(), name: r.name, blurb: r.blurb, tier: r.tier, price: CAFE_CFG.prices[r.tier], tags: r.tags, ings: picked.slice(), free: true, ts: Date.now(), sold: 0 });
                await _set(K_MENU, menu);
                shelfBtn.outerHTML = '<div class="oc-note">✨「' + r.name + '」上架了!到「菜單」頁看看。</div>';
            });
        });
    }

    async function _renderLab(body) {
        const lab = await _get(K_LAB, {});
        const sel = { base: null, flavor: null, top: null };
        const tried = Object.keys(lab).length;
        const total = Object.values(CAFE_CFG.pantry).reduce((n, list) => n * list.length, 1);
        body.innerHTML =
            '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-flask"></i> 飲品調配</span><span class="oc-section-note">配方圖鑑 ' + tried + ' / ' + total + '</span></div>' +
            Object.keys(CAFE_CFG.pantry).map(slot =>
                '<div class="oc-slot-label">' + SLOT_LABEL[slot] + '</div>' +
                '<div class="oc-chips' + (CAFE_CFG.pantry[slot].length === 3 ? ' three' : '') + '" data-slot="' + slot + '">' +
                CAFE_CFG.pantry[slot].map(x => '<button class="oc-chip" data-id="' + x.id + '">' + _sprite(x.id, 'oc-ing-icon') + x.name + '</button>').join('') +
                '</div>').join('') +
            '<button class="oc-brew" disabled><i class="fa-solid fa-blender"></i> 開始調配</button>' +
            '<div class="oc-tried"><span>已研發 ' + tried + ' 種</span><span>' + Math.round(tried / total * 100) + '%</span></div>' +
            '<div class="oc-progress-line"><i></i></div>' +
            '<div class="oc-result-slot"></div>';
        body.querySelector('.oc-progress-line i').style.width = Math.min(100, tried / total * 100) + '%';
        const brew = body.querySelector('.oc-brew');
        body.querySelectorAll('.oc-chips').forEach(row => row.addEventListener('click', (e) => {
            const chip = e.target.closest('.oc-chip');
            if (!chip) return;
            sel[row.dataset.slot] = chip.dataset.id;
            row.querySelectorAll('.oc-chip').forEach(c => c.classList.toggle('on', c === chip));
            brew.disabled = !(sel.base && sel.flavor && sel.top);
        }));
        brew.addEventListener('click', async () => {
            const key = _comboKey(sel.base, sel.flavor, sel.top);
            const tier = _tierOf(key);
            const ings = [_ing('base', sel.base), _ing('flavor', sel.flavor), _ing('top', sel.top)];
            const tags = _tagsOf(sel.base, sel.flavor, sel.top);
            lab[key] = tier;
            await _set(K_LAB, lab);
            const nowTried = Object.keys(lab).length;
            body.querySelector('.oc-tried').innerHTML = '<span>已研發 ' + nowTried + ' 種</span><span>' + Math.round(nowTried / total * 100) + '%</span>';
            const progress = body.querySelector('.oc-progress-line i');
            if (progress) progress.style.width = Math.min(100, nowTried / total * 100) + '%';
            const T = TIER_TEXT[tier];
            const menu = await getMenu();
            const already = menu.some(m => m.key === key);
            const slot = body.querySelector('.oc-result-slot');
            slot.innerHTML =
                '<div class="oc-result"><span class="oc-badge ' + T.cls + '">' + T.label + '</span> ' +
                ings.map(x => x.name).join(' + ') +
                '<div class="oc-note">' + (already ? '這款已經在菜單上了。' : T.note) + '</div>' +
                ((tier === 'S' || tier === 'A') && !already ? '<button class="oc-shelf"><i class="fa-solid fa-arrow-up-from-bracket"></i> 上架(取名交給店長)</button>' : '') +
                '</div>';
            const shelfBtn = slot.querySelector('.oc-shelf');
            if (shelfBtn) shelfBtn.addEventListener('click', async () => {
                shelfBtn.disabled = true;
                shelfBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 店長命名中…';
                const named = await _nameDrink(ings, tier, tags);
                const fresh = await getMenu();
                if (!fresh.some(m => m.key === key)) {
                    fresh.unshift({ id: 'drink_' + Date.now(), key, name: named.name, blurb: named.blurb, tier, price: CAFE_CFG.prices[tier], tags, ings: ings.map(x => x.id), ts: Date.now(), sold: 0 });
                    await _set(K_MENU, fresh);
                }
                shelfBtn.outerHTML = '<div class="oc-note">☕「' + named.name + '」上架了!到「菜單」頁看看。</div>';
            });
        });
    }

    win.OS_CAFE = window.OS_CAFE = { openWorkshop, closeWorkshop, getMenu, getBooks, getShop, addBook, _settle };   // _settle=console 診斷用
    console.log('[Cafe] 書咖經營系統就緒');
})();
