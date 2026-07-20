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
    const EV_LABEL = { devotion: '本命認證', dropout: '吃膩告別' };
    function _mkId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

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
            /* ☕ 書咖菜單板風格:奶油紙底+咖啡棕字+金棕點綴(配瀅瀅店裡的木質奶油色系,別再黑瀝青) */
            '.oc-win{position:absolute;right:max(3%, calc(50% - 370px));top:50%;transform:translateY(-50%);z-index:3350;width:344px;max-width:90%;min-height:min(460px,74%);max-height:78%;display:flex;flex-direction:column;background:rgba(249,242,230,.97);border:1px solid #d8c6a8;border-radius:16px;color:#4a3a2a;font-size:13px;box-shadow:0 10px 28px rgba(90,66,40,.35);}' +
            '.oc-head{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px dashed #d8c6a8;background:rgba(122,82,48,.07);border-radius:16px 16px 0 0;font-weight:700;color:#6b4e32;}' +
            '.oc-head .oc-close{margin-left:auto;background:none;border:none;color:#6b4e32;cursor:pointer;font-size:15px;padding:2px 6px;}' +
            '.oc-tabs{display:flex;gap:6px;padding:10px 14px 0;}' +
            '.oc-tab{flex:1;background:rgba(255,255,255,.55);border:1px solid #d3bf9f;color:#6b4e32;border-radius:9px;padding:6px 0;cursor:pointer;font-size:12px;}' +
            '.oc-tab.on{background:#7a5230;border-color:#7a5230;color:#f9f2e6;font-weight:700;}' +
            '.oc-body{overflow-y:auto;padding:10px 14px 14px;flex:1;display:flex;flex-direction:column;}' +
            '.oc-body .oc-empty{margin:auto;}' +   /* 空狀態置中,不縮窗 */
            '.oc-item{display:flex;align-items:baseline;gap:8px;padding:9px 4px;border-bottom:1px dashed rgba(122,82,48,.22);flex-wrap:wrap;}' +
            '.oc-item.oc-click{cursor:pointer;}' +
            '.oc-item.ev{background:rgba(214,158,84,.12);border-radius:9px;border-bottom:none;margin:5px 0;padding:9px 10px;}' +
            '.oc-hear{color:#c9b28a;font-size:12px;margin-left:4px;}.oc-hear.has{color:#a9744a;}' +
            '.oc-said{display:block;margin-top:6px;padding:7px 10px;background:rgba(169,116,74,.08);border-left:3px solid #c9a06a;border-radius:6px;color:#5a4030;font-size:12px;line-height:1.6;}' +
            '.oc-loading{color:#a3906f;}' +
            '.oc-item .oc-name{font-weight:700;color:#5a4030;}' +
            '.oc-item .oc-price{margin-left:auto;white-space:nowrap;color:#a9744a;font-weight:700;}' +
            '.oc-blurb{display:block;color:#8a7358;font-size:12px;margin-top:2px;}' +
            '.oc-badge{font-size:10px;padding:1px 6px;border-radius:6px;border:1px solid;white-space:nowrap;background:rgba(255,255,255,.5);}' +
            '.oc-badge.s{color:#b8860b;border-color:#caa24a;}.oc-badge.a{color:#4e8b57;border-color:#7cae85;}.oc-badge.b{color:#8a8a92;border-color:#b6b6bd;}.oc-badge.c{color:#c05b5b;border-color:#d99;}' +
            '.oc-empty{color:#9b8a72;padding:20px 4px;text-align:center;line-height:1.8;}' +
            '.oc-stats{color:#8a7358;font-size:12px;padding:2px 4px 8px;border-bottom:1px dashed rgba(122,82,48,.22);}' +
            '.oc-slot-label{margin:9px 0 5px;color:#8a7358;font-size:12px;}' +
            '.oc-chips{display:flex;flex-wrap:wrap;gap:6px;}' +
            '.oc-chip{background:rgba(255,255,255,.6);border:1px solid #d3bf9f;color:#5a4634;border-radius:9px;padding:5px 11px;cursor:pointer;font-size:12px;}' +
            '.oc-chip.on{background:rgba(169,116,74,.22);border-color:#a9744a;font-weight:700;}' +
            '.oc-brew{width:100%;margin-top:12px;background:#7a5230;border:none;color:#f9f2e6;font-weight:700;border-radius:11px;padding:10px 0;cursor:pointer;font-size:13px;}' +
            '.oc-brew:disabled{opacity:.45;cursor:default;}' +
            '.oc-result{margin-top:10px;border:1px solid #d8c6a8;border-radius:11px;padding:10px 12px;background:rgba(255,252,246,.7);}' +
            '.oc-result .oc-note{color:#8a7358;font-size:12px;margin-top:4px;}' +
            '.oc-shelf{width:100%;margin-top:8px;background:rgba(78,139,87,.12);border:1px solid #7cae85;color:#3c6b44;font-weight:700;border-radius:11px;padding:8px 0;cursor:pointer;font-size:13px;}' +
            '.oc-shelf:disabled{opacity:.5;cursor:default;}' +
            '.oc-tried{color:#a3906f;font-size:11px;margin-top:6px;}' +
            '.oc-sym-grid{display:flex;flex-wrap:wrap;gap:6px;max-height:210px;overflow-y:auto;padding-right:2px;}' +
            '.oc-sym{width:38px;height:38px;font-size:18px;background:rgba(255,255,255,.6);border:1px solid #d3bf9f;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;}' +
            '.oc-sym.on{background:rgba(214,158,84,.3);border-color:#a9744a;}' +
            '.oc-free-input{width:100%;box-sizing:border-box;margin-top:10px;background:rgba(255,255,255,.75);border:1px solid #d3bf9f;border-radius:9px;color:#4a3a2a;padding:7px 10px;font-size:12px;}' +
            '.oc-free-input::placeholder{color:#a3906f;}' +
            '@media (max-width:680px){' +
              '.oc-win{right:12px;left:12px;width:auto;max-height:74%;}' +   /* 📱 面板站前排放大(垂直置中沿用桌機規則) */
              '.void-dock-open #iris-avatar{opacity:.25;filter:brightness(.55) blur(1px);transition:opacity .25s;}' +   /* 立繪退後變暗 */
            '}';
        doc.head.appendChild(st);
    }

    let _winEl = null;
    function closeWorkshop() {
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
            '<div class="oc-head"><i class="fa-solid fa-mug-hot"></i> 書咖櫃檯' +
              '<button class="oc-close"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="oc-tabs">' +
              '<button class="oc-tab on" data-tab="menu">菜單</button>' +
              '<button class="oc-tab" data-tab="books">書單</button>' +
              '<button class="oc-tab" data-tab="lab">調配台</button>' +
              '<button class="oc-tab" data-tab="free">創想</button>' +
              '<button class="oc-tab" data-tab="log">訪客</button>' +
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
        // ☕ 開窗=補算離線天數(有新動靜就刷新當前頁;背景跑不擋開窗)
        _settle().then(changed => {
            if (!changed || !_winEl) return;
            const on = _winEl.querySelector('.oc-tab.on');
            _renderTab(on ? on.dataset.tab : 'menu', _winEl.querySelector('.oc-body'));
        }).catch(() => {});
    }

    async function _renderTab(tab, body) {
        if (tab === 'menu') {
            const menu = await getMenu();
            const shop = await getShop();
            const stats = (shop.cups || shop.popularity) ? '<div class="oc-stats"><i class="fa-solid fa-fire"></i> 人氣 ' + (shop.popularity || 0) + '・累計 ' + (shop.revenue || 0) + ' PT・' + (shop.cups || 0) + ' 杯</div>' : '';
            body.innerHTML = stats + (menu.length
                ? menu.map(m =>
                    '<div class="oc-item"><span class="oc-badge ' + (TIER_TEXT[m.tier]?.cls || 'a') + '">' + (TIER_TEXT[m.tier]?.label || '') + '</span>' +
                    '<span><span class="oc-name">' + (m.free ? '✨' : '') + m.name + '</span><span class="oc-blurb">' + (m.blurb || '') + '</span></span>' +
                    '<span class="oc-price">' + m.price + ' PT・售出' + (m.sold || 0) + '</span></div>').join('')
                : '<div class="oc-empty">菜單還是空的。<br>去「調配台」研發出好東西再上架吧。</div>');
        } else if (tab === 'log') {
            let logs = await _get(K_LOG, []);
            if (logs.some(l => !l.id)) { logs.forEach(l => { if (!l.id) l.id = _mkId(); }); await _set(K_LOG, logs); }   // 舊紀錄補id
            const md = (d) => { const t = new Date(d * DAY_MS); return (t.getMonth() + 1) + '/' + t.getDate(); };
            body.innerHTML = logs.length
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
                : '<div class="oc-empty">還沒有客人來過。<br>上架點好東西,常客們就會自己上門了。</div>';
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
            body.innerHTML = books.length
                ? books.map(b =>
                    '<div class="oc-item"><span><span class="oc-name">《' + b.title + '》</span>' +
                    '<span class="oc-blurb">' + (b.by ? b.by + ':' : '') + (b.note || '') + '</span></span></div>').join('')
                : '<div class="oc-empty">書架還空著。<br>之後來店裡的客人會留下他們的推薦書。</div>';
        } else if (tab === 'free') {
            _renderFree(body);
        } else {
            _renderLab(body);
        }
    }

    // ✨ 創想頁:符號庫丟鍋(上限 symbolMax)+備用詞→「請店長特調」
    async function _renderFree(body) {
        const picked = [];
        body.innerHTML =
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
        const slotName = { base: '基底', flavor: '風味', top: '點綴' };
        body.innerHTML =
            Object.keys(CAFE_CFG.pantry).map(slot =>
                '<div class="oc-slot-label">' + slotName[slot] + '</div>' +
                '<div class="oc-chips" data-slot="' + slot + '">' +
                CAFE_CFG.pantry[slot].map(x => '<button class="oc-chip" data-id="' + x.id + '">' + x.name + '</button>').join('') +
                '</div>').join('') +
            '<button class="oc-brew" disabled><i class="fa-solid fa-blender"></i> 調配</button>' +
            '<div class="oc-tried">已研發過 ' + Object.keys(lab).length + ' 種組合</div>' +
            '<div class="oc-result-slot"></div>';
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
            body.querySelector('.oc-tried').textContent = '已研發過 ' + Object.keys(lab).length + ' 種組合';
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
