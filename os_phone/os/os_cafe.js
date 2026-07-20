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
    const K_BOOKS = 'books';   // 書單 [{title,by,note,ts}]（②NPC 首訪填入）
    const K_SHOP = 'shop';     // {popularity,revenue,cups}
    const K_LAB = 'lab';       // 已試過的組合 {comboKey:tier}

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

    // ── 對外資料 API(②之後 NPC 模擬/事件用)──
    async function getMenu() { return _get(K_MENU, []); }
    async function getBooks() { return _get(K_BOOKS, []); }
    async function getShop() { return _get(K_SHOP, { popularity: 0, revenue: 0, cups: 0 }); }
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
            '.oc-win{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3350;width:340px;max-width:92%;max-height:86%;display:flex;flex-direction:column;background:rgba(30,26,22,.96);border:1px solid rgba(243,234,216,.25);border-radius:14px;color:#f3ead8;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.55);}' +
            '.oc-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(243,234,216,.14);}' +
            '.oc-head .oc-close{margin-left:auto;background:none;border:none;color:#f3ead8;cursor:pointer;font-size:15px;padding:2px 6px;}' +
            '.oc-tabs{display:flex;gap:6px;padding:8px 12px 0;}' +
            '.oc-tab{flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(243,234,216,.18);color:#f3ead8;border-radius:8px;padding:6px 0;cursor:pointer;font-size:12px;}' +
            '.oc-tab.on{background:rgba(214,158,84,.3);border-color:#d69e54;}' +
            '.oc-body{overflow-y:auto;padding:10px 12px 12px;flex:1;}' +
            '.oc-item{display:flex;align-items:baseline;gap:8px;padding:8px 6px;border-bottom:1px dashed rgba(243,234,216,.12);}' +
            '.oc-item .oc-name{font-weight:700;}' +
            '.oc-item .oc-price{margin-left:auto;white-space:nowrap;color:#e8c98c;}' +
            '.oc-blurb{display:block;color:#cbbfa8;font-size:12px;margin-top:2px;}' +
            '.oc-badge{font-size:10px;padding:1px 6px;border-radius:6px;border:1px solid;white-space:nowrap;}' +
            '.oc-badge.s{color:#ffd98a;border-color:#ffd98a;}.oc-badge.a{color:#9fd6a2;border-color:#9fd6a2;}.oc-badge.b{color:#aab;border-color:#889;}.oc-badge.c{color:#e08a8a;border-color:#e08a8a;}' +
            '.oc-empty{color:#a99;padding:18px 4px;text-align:center;line-height:1.7;}' +
            '.oc-slot-label{margin:8px 0 4px;color:#cbbfa8;font-size:12px;}' +
            '.oc-chips{display:flex;flex-wrap:wrap;gap:6px;}' +
            '.oc-chip{background:rgba(255,255,255,.06);border:1px solid rgba(243,234,216,.2);color:#f3ead8;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:12px;}' +
            '.oc-chip.on{background:rgba(214,158,84,.35);border-color:#d69e54;}' +
            '.oc-brew{width:100%;margin-top:12px;background:#d69e54;border:none;color:#2a2118;font-weight:700;border-radius:10px;padding:9px 0;cursor:pointer;font-size:13px;}' +
            '.oc-brew:disabled{opacity:.4;cursor:default;}' +
            '.oc-result{margin-top:10px;border:1px solid rgba(243,234,216,.2);border-radius:10px;padding:10px;}' +
            '.oc-result .oc-note{color:#cbbfa8;font-size:12px;margin-top:4px;}' +
            '.oc-shelf{width:100%;margin-top:8px;background:rgba(159,214,162,.2);border:1px solid #9fd6a2;color:#cfe9d0;border-radius:10px;padding:8px 0;cursor:pointer;font-size:13px;}' +
            '.oc-shelf:disabled{opacity:.5;cursor:default;}' +
            '.oc-tried{color:#8a8074;font-size:11px;margin-top:6px;}' +
            '.oc-sym-grid{display:flex;flex-wrap:wrap;gap:6px;max-height:200px;overflow-y:auto;padding-right:2px;}' +
            '.oc-sym{width:38px;height:38px;font-size:18px;background:rgba(255,255,255,.05);border:1px solid rgba(243,234,216,.18);border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;}' +
            '.oc-sym.on{background:rgba(214,158,84,.35);border-color:#d69e54;}' +
            '.oc-free-input{width:100%;box-sizing:border-box;margin-top:10px;background:rgba(255,255,255,.06);border:1px solid rgba(243,234,216,.2);border-radius:8px;color:#f3ead8;padding:7px 10px;font-size:12px;}';
        doc.head.appendChild(st);
    }

    let _winEl = null;
    function closeWorkshop() { _winEl?.remove(); _winEl = null; }
    async function openWorkshop() {
        closeWorkshop();
        const doc = win.document;
        _ensureStyle(doc);
        const host = doc.querySelector('.lobby-left') || doc.body;
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
            '</div>' +
            '<div class="oc-body"></div>';
        host.appendChild(box);
        _winEl = box;
        box.querySelector('.oc-close').addEventListener('click', closeWorkshop);
        const body = box.querySelector('.oc-body');
        const tabs = box.querySelectorAll('.oc-tab');
        tabs.forEach(t => t.addEventListener('click', () => {
            tabs.forEach(x => x.classList.toggle('on', x === t));
            _renderTab(t.dataset.tab, body);
        }));
        _renderTab('menu', body);
    }

    async function _renderTab(tab, body) {
        if (tab === 'menu') {
            const menu = await getMenu();
            body.innerHTML = menu.length
                ? menu.map(m =>
                    '<div class="oc-item"><span class="oc-badge ' + (TIER_TEXT[m.tier]?.cls || 'a') + '">' + (TIER_TEXT[m.tier]?.label || '') + '</span>' +
                    '<span><span class="oc-name">' + (m.free ? '✨' : '') + m.name + '</span><span class="oc-blurb">' + (m.blurb || '') + '</span></span>' +
                    '<span class="oc-price">' + m.price + ' PT・售出' + (m.sold || 0) + '</span></div>').join('')
                : '<div class="oc-empty">菜單還是空的。<br>去「調配台」研發出好東西再上架吧。</div>';
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

    win.OS_CAFE = window.OS_CAFE = { openWorkshop, closeWorkshop, getMenu, getBooks, getShop, addBook };
    console.log('[Cafe] 書咖經營系統就緒');
})();
