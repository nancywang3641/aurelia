// ----------------------------------------------------------------
// [檔案] os_furniture.js
// 路徑：os_phone/os/os_furniture.js
// 職責：家具商城＝手機上的網購 app。逛目錄 → 花 PT 買 → 東西進倉庫。
//   買到的不是圖，是「一件包裹」：進房間布置時從倉庫拿出來擺位置，
//   按配送才由 os_room_gen 整房一次生圖（跟手動加的包裹完全同一種形狀）。
//   目錄固定寫死＝零 API、價格可平衡；想要目錄裡沒有的，用「訂製」燒一次副模型，
//   生出來的永久進目錄，之後重買不再燒。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const d = win.document;

    const APP_ID = 'furniture';
    const K_STOCK = 'stock';      // 買了、還沒擺進房間的
    const K_CUSTOM = 'custom';    // 訂製出來的品項（永久留在目錄裡）
    const STOCK_MAX = 30;         // 倉庫上限，免得囤到爆

    // 口味標籤：之後看房訪客要靠這個判斷「這間房合不合他胃口」
    const TAGS = ['溫馨', '簡約', '復古', '文青', '科技', '自然', '奢華', '實用', '慵懶', '工業'];

    // 🚨 照明只能用不碰天花板的燈具（立燈/桌燈/壁燈）——房間是俯視構圖，天花板物件會毀掉整張圖
    const CATALOG = [
        { key: 'seat', label: '坐臥', items: [
            { id: 'sofa1', name: '單人沙發', price: 90, note: '灰藍色布面，扶手厚實', tags: ['溫馨', '慵懶'] },
            { id: 'sofa2', name: '雙人沙發', price: 160, note: '米色布面，坐墊寬鬆', tags: ['溫馨', '簡約'] },
            { id: 'armchair', name: '皮革扶手椅', price: 140, note: '深棕皮革，木質椅腳', tags: ['復古', '奢華'] },
            { id: 'beanbag', name: '懶骨頭', price: 55, note: '芥黃色，軟塌塌一坨', tags: ['慵懶', '溫馨'] },
            { id: 'bed1', name: '單人床', price: 150, note: '木床架，素色床單', tags: ['簡約', '實用'] },
            { id: 'bed2', name: '雙人床', price: 240, note: '軟包床頭，厚棉被', tags: ['奢華', '溫馨'] },
            { id: 'floorcushion', name: '和室座墊', price: 35, note: '亞麻方墊，兩個一組', tags: ['自然', '簡約'] },
            { id: 'stool', name: '木凳', price: 30, note: '原木小圓凳', tags: ['自然', '實用'] },
        ] },
        { key: 'table', label: '桌櫃', items: [
            { id: 'desk', name: '書桌', price: 120, note: '淺木桌面，附抽屜', tags: ['文青', '實用'] },
            { id: 'dining', name: '餐桌', price: 170, note: '長方原木桌，配兩張椅', tags: ['自然', '實用'] },
            { id: 'coffee', name: '茶几', price: 70, note: '玻璃桌面，金屬細腳', tags: ['簡約', '科技'] },
            { id: 'sidetable', name: '邊桌', price: 45, note: '圓形小几，深胡桃色', tags: ['復古', '簡約'] },
            { id: 'drawer', name: '五斗櫃', price: 130, note: '白色櫃體，黃銅把手', tags: ['簡約', '奢華'] },
            { id: 'shelf', name: '書架', price: 110, note: '開放式木層架，塞滿書', tags: ['文青', '實用'] },
            { id: 'wardrobe', name: '衣櫃', price: 190, note: '雙門木櫃，霧面把手', tags: ['實用', '簡約'] },
            { id: 'shoerack', name: '鞋櫃', price: 60, note: '矮櫃，上面放一盆小草', tags: ['實用', '自然'] },
        ] },
        { key: 'light', label: '照明', items: [
            { id: 'floorlamp', name: '落地燈', price: 80, note: '細長金屬桿，暖黃燈罩', tags: ['溫馨', '簡約'] },
            { id: 'desklamp', name: '桌燈', price: 45, note: '可調角度，霧黑燈臂', tags: ['實用', '工業'] },
            { id: 'walllamp', name: '壁燈', price: 65, note: '黃銅壁掛燈，貼牆', tags: ['復古', '奢華'] },
            { id: 'readlamp', name: '閱讀燈', price: 50, note: '夾在書架邊的小燈', tags: ['文青', '實用'] },
            { id: 'paperlamp', name: '紙燈', price: 55, note: '和紙立燈，光很柔', tags: ['自然', '慵懶'] },
            { id: 'neonsign', name: '霓虹燈牌', price: 95, note: '牆上一行粉紫色燈管字', tags: ['科技', '工業'] },
        ] },
        { key: 'decor', label: '布置', items: [
            { id: 'rug', name: '地毯', price: 85, note: '幾何圖案，灰白調', tags: ['簡約', '溫馨'] },
            { id: 'rugpersian', name: '波斯地毯', price: 180, note: '暗紅繁複花紋', tags: ['復古', '奢華'] },
            { id: 'painting', name: '掛畫', price: 75, note: '抽象色塊，木框', tags: ['文青', '簡約'] },
            { id: 'mirror', name: '全身鏡', price: 95, note: '細金屬框，斜靠牆', tags: ['簡約', '奢華'] },
            { id: 'plant', name: '大盆栽', price: 70, note: '琴葉榕，陶盆', tags: ['自然', '溫馨'] },
            { id: 'driedflower', name: '乾燥花', price: 30, note: '玻璃瓶插一束', tags: ['文青', '自然'] },
            { id: 'tapestry', name: '掛毯', price: 65, note: '手織圖騰，垂在牆上', tags: ['自然', '復古'] },
            { id: 'photowall', name: '相框牆', price: 55, note: '一排小相框，高低錯落', tags: ['溫馨', '文青'] },
        ] },
        { key: 'appliance', label: '家電', items: [
            { id: 'fridge', name: '小冰箱', price: 150, note: '奶油色復古款', tags: ['復古', '實用'] },
            { id: 'tv', name: '電視', price: 200, note: '薄框螢幕，放在矮櫃上', tags: ['科技', '實用'] },
            { id: 'speaker', name: '音響', price: 130, note: '木紋箱體，一對', tags: ['復古', '科技'] },
            { id: 'fan', name: '立扇', price: 55, note: '金屬網罩，霧灰色', tags: ['工業', '實用'] },
            { id: 'washer', name: '洗衣機', price: 175, note: '滾筒式，白色', tags: ['實用', '簡約'] },
            { id: 'monitor', name: '電腦桌組', price: 220, note: '雙螢幕，線材理得整齊', tags: ['科技', '工業'] },
        ] },
        { key: 'living', label: '生活', items: [
            { id: 'books', name: '書堆', price: 35, note: '疊在地上的一落書', tags: ['文青', '慵懶'] },
            { id: 'guitar', name: '吉他', price: 90, note: '木吉他靠牆立著', tags: ['文青', '復古'] },
            { id: 'cattower', name: '貓抓柱', price: 80, note: '麻繩柱，上面有平台', tags: ['溫馨', '自然'] },
            { id: 'yogamat', name: '瑜珈墊', price: 40, note: '捲起來靠牆放', tags: ['實用', '自然'] },
            { id: 'teaset', name: '茶具組', price: 60, note: '陶壺配四個小杯', tags: ['自然', '復古'] },
            { id: 'console', name: '遊戲機', price: 165, note: '主機加手把，接在電視下', tags: ['科技', '慵懶'] },
            { id: 'easel', name: '畫架', price: 85, note: '木製三腳架，夾著畫布', tags: ['文青', '自然'] },
            { id: 'toolbench', name: '工作檯', price: 145, note: '鐵桌面，散著零件工具', tags: ['工業', '實用'] },
        ] },
    ];

    function _db() { return win.OS_DB || window.OS_DB; }
    function _pt() { return win.OS_PT || window.OS_PT; }
    function _now() { try { return Date.now(); } catch (e) { return 0; } }

    // ── 資料層：倉庫與訂製品項都放 app_data（不動 schema） ──
    async function _read(key, fallback) {
        try {
            const db = _db();
            if (!db || !db.getAppData) return fallback;
            const v = await db.getAppData(APP_ID, key);
            return (v === undefined || v === null) ? fallback : v;
        } catch (e) { console.warn('[Furniture] 讀取失敗', key, e); return fallback; }
    }
    async function _write(key, v) {
        const db = _db();
        if (!db || !db.saveAppData) throw new Error('OS_DB.saveAppData 不存在');
        await db.saveAppData(APP_ID, key, v);
    }

    async function getStock() { return (await _read(K_STOCK, [])) || []; }
    async function getCustom() { return (await _read(K_CUSTOM, [])) || []; }

    // 目錄＝寫死的 ＋ 訂製過的（訂製的併進「訂製」這一類）
    async function getCatalog() {
        const custom = await getCustom();
        const base = CATALOG.map(function (c) { return { key: c.key, label: c.label, items: c.items.slice() }; });
        if (custom.length) base.push({ key: 'custom', label: '訂製', items: custom.slice().reverse() });
        return base;
    }
    async function findItem(itemId) {
        const cats = await getCatalog();
        for (const c of cats) {
            const hit = c.items.find(function (x) { return x.id === itemId; });
            if (hit) return hit;
        }
        return null;
    }

    // 買一件：扣 PT → 進倉庫。扣了錢卻沒存起來就把錢退回去，寧可讓玩家再按一次。
    async function buy(itemId) {
        const item = await findItem(itemId);
        if (!item) return { ok: false, reason: 'gone' };
        const stock = await getStock();
        if (stock.length >= STOCK_MAX) return { ok: false, reason: 'full' };
        const pt = _pt();
        if (!pt || typeof pt.spendPT !== 'function') return { ok: false, reason: 'nopt' };

        const r = await pt.spendPT(item.price, '買家具：' + item.name);
        if (!r || !r.ok) return { ok: false, reason: 'poor', short: (r && r.short) || item.price };

        stock.push({
            sid: 'k' + _now().toString(36) + Math.random().toString(36).slice(2, 6),
            itemId: item.id, name: item.name, note: item.note || '', tags: (item.tags || []).slice(), price: item.price,
        });
        try { await _write(K_STOCK, stock); }
        catch (e) {
            console.warn('[Furniture] 買了但沒存起來，退款', e);
            try { await pt.addPT(item.price, { reason: '買家具失敗退款' }); } catch (e2) {}
            return { ok: false, reason: 'save' };
        }
        return { ok: true, item: item, left: STOCK_MAX - stock.length };
    }

    // 從倉庫取走一件（擺進房間時用）；房間那邊拿到的形狀就是包裹要的 {name, content}
    async function takeOut(sid) {
        const stock = await getStock();
        const i = stock.findIndex(function (x) { return x.sid === sid; });
        if (i < 0) return null;
        const got = stock[i];
        stock.splice(i, 1);
        try { await _write(K_STOCK, stock); } catch (e) { console.warn('[Furniture] 取貨後存檔失敗', e); return null; }
        return { name: got.name, content: got.note || '', tags: got.tags || [] };
    }
    // 擺不下要放回倉庫（例如房間已經滿了）
    async function putBack(pkg) {
        if (!pkg || !pkg.name) return;
        const stock = await getStock();
        if (stock.length >= STOCK_MAX) return;
        stock.push({
            sid: 'k' + _now().toString(36) + Math.random().toString(36).slice(2, 6),
            itemId: 'returned', name: pkg.name, note: pkg.content || '', tags: pkg.tags || [], price: 0,
        });
        try { await _write(K_STOCK, stock); } catch (e) { console.warn('[Furniture] 放回倉庫失敗', e); }
    }

    // ── 訂製：目錄裡沒有的東西，燒一次副模型生成品項，之後永久留在目錄 ──
    function _customMessages(request) {
        const sys = [
            '你是家具商城的選品員。玩家描述他想要一件什麼樣的家具，你把它整理成一筆商品資料。',
            '只回傳純 JSON，不要解釋、不要 markdown：',
            '{"name":"{中文商品名，不超過 8 字}","note":"{這件東西長什麼樣，材質顏色形狀，不超過 25 字，不要提位置}","price":{整數價格},"tags":["{從標籤池挑 1 到 3 個}"]}',
            '價格區間：小擺飾 30 到 60，一般家具 80 到 180，大件或成套 190 到 300。照東西的份量給。',
            '標籤池（只准從中挑）：' + TAGS.join('、'),
            '這是俯視構圖的房間，只收「放在地上、靠牆或掛在牆上」的東西。',
            '天花板吊掛物、吊燈、吊扇一律不可以；照明只能是立燈、桌燈、壁燈這類不碰天花板的。',
            '如果玩家要的是人、動物或非家具的東西，就改成最接近的家具或擺飾。',
        ].join('\n');
        return [
            { role: 'system', content: sys },
            { role: 'user', content: '玩家想要：' + request + '\n\n請輸出商品 JSON。' },
        ];
    }
    function _parseCustom(raw) {
        const t = String(raw || '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').replace(/```(?:[a-z]+)?/gi, '').replace(/```/g, '');
        const m = t.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('選品員沒有回話，再按一次試試。');
        const o = JSON.parse(m[0]);
        const name = String(o.name || '').trim().slice(0, 10);
        if (!name) throw new Error('這件東西沒有名字，再按一次試試。');
        const price = Math.max(20, Math.min(400, Math.round(Number(o.price) || 80)));
        const note = String(o.note || '').trim().slice(0, 40);
        const tags = (Array.isArray(o.tags) ? o.tags : []).filter(function (x) { return TAGS.indexOf(x) >= 0; }).slice(0, 3);
        return { id: 'c' + _now().toString(36) + Math.random().toString(36).slice(2, 5), name: name, note: note, price: price, tags: tags.length ? tags : ['實用'] };
    }
    function makeCustom(request) {
        return new Promise(function (resolve, reject) {
            const api = win.OS_API || window.OS_API;
            const OS = win.OS_SETTINGS || window.OS_SETTINGS;
            if (!api || !api.chat) { reject(new Error('找不到副模型接口。')); return; }
            let config = {};
            if (OS) {
                const sec = OS.getSecondaryConfig ? OS.getSecondaryConfig() : null;
                config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : OS.getConfig();
            }
            config = config || {};
            config.route = 'furniture_custom';
            api.chat(_customMessages(request), config, null, function (text) {
                (async function () {
                    try {
                        const item = _parseCustom(text);
                        const custom = await getCustom();
                        custom.push(item);
                        await _write(K_CUSTOM, custom.slice(-60));   // 留最近 60 筆，不無限長
                        resolve(item);
                    } catch (e) { reject(e); }
                })();
            }, function (err) {
                // 接口的錯誤訊息是給我看的，不要原樣丟給玩家（「連線失敗」這種）
                console.warn('[Furniture] 訂製失敗', err);
                reject(new Error('店員一時聯絡不上，等一下再按一次。'));
            }, { label: '家具訂製' });
        });
    }

    win.OS_FURNITURE = {
        launch: launch,
        getStock: getStock, takeOut: takeOut, putBack: putBack,
        getCatalog: getCatalog, buy: buy, makeCustom: makeCustom,
        _cfg: { STOCK_MAX: STOCK_MAX, TAGS: TAGS },
    };
    if (win !== window) { try { window.OS_FURNITURE = win.OS_FURNITURE; } catch (e) {} }

    // ── UI ────────────────────────────────────────────────
    function _injectStyle() {
        if (d.getElementById('fur-style')) return;
        const s = d.createElement('style'); s.id = 'fur-style';
        s.textContent = [
            // 🚨 面板自帶深色底：app 框架底色是淺的，淺字會整片消失
            '.fur-wrap{display:flex;flex-direction:column;gap:10px;height:100%;box-sizing:border-box;',
            '  padding:12px;background:#0e1015;color:#e7eaf1;font-size:13px;overflow:auto}',
            '.fur-head{display:flex;align-items:center;justify-content:space-between;gap:8px}',
            '.fur-title{font-weight:700;color:#f0e2c6}',
            '.fur-purse{color:#e7c98a;font-size:12px}',
            '.fur-tabs{display:flex;gap:8px}',
            '.fur-tab{flex:1;padding:8px 10px;border-radius:9px;border:1px solid #2c3140;background:#171a21;',
            '  color:#9aa1b0;font-size:12px;font-family:inherit;cursor:pointer}',
            '.fur-tab.on{border-color:rgba(217,176,106,.6);color:#f0e2c6;background:#20242e}',
            '.fur-cats{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}',
            '.fur-cat{flex:0 0 auto;padding:6px 12px;border-radius:14px;border:1px solid #2c3140;background:#171a21;',
            '  color:#9aa1b0;font-size:12px;font-family:inherit;cursor:pointer;white-space:nowrap}',
            '.fur-cat.on{border-color:rgba(217,176,106,.6);color:#f0e2c6}',
            '.fur-list{display:flex;flex-direction:column;gap:8px}',
            '.fur-item{display:flex;align-items:center;gap:10px;border:1px solid #2c3140;border-radius:10px;',
            '  background:#171a21;padding:10px 11px}',
            '.fur-item-body{flex:1;min-width:0}',
            '.fur-item-name{color:#e7eaf1;font-weight:600}',
            '.fur-item-note{color:#9aa1b0;font-size:11px;line-height:1.6;margin-top:2px}',
            '.fur-item-tags{color:#7a8090;font-size:10px;margin-top:3px}',
            '.fur-buy{flex:0 0 auto;display:flex;align-items:center;gap:5px;padding:8px 12px;border-radius:9px;',
            '  border:1px solid rgba(217,176,106,.45);background:#20242e;color:#f0e2c6;font-size:12px;',
            '  font-family:inherit;cursor:pointer}',
            '.fur-buy:disabled{opacity:.45;cursor:default}',
            '.fur-note{color:#9aa1b0;font-size:11px;line-height:1.7}',
            '.fur-note.is-bad{color:#e0a0a8}',
            '.fur-note.is-ok{color:#a8d8b0}',
            '.fur-empty{color:#7a8090;font-size:12px;padding:14px 0;text-align:center}',
            '.fur-custom{display:flex;flex-direction:column;gap:6px;border:1px solid #2c3140;border-radius:10px;',
            '  background:#141821;padding:10px 11px}',
            '.fur-custom label{color:#9aa1b0;font-size:11px}',
            '.fur-custom input{width:100%;box-sizing:border-box;border:1px solid #2c3140;border-radius:8px;',
            '  background:#0e1015;color:#e7eaf1;font-family:inherit;font-size:12px;padding:8px}',
            '.fur-custom button{align-self:flex-start;display:flex;align-items:center;gap:6px;padding:8px 12px;',
            '  border-radius:9px;border:1px solid #2c3140;background:#20242e;color:#e7eaf1;font-size:12px;',
            '  font-family:inherit;cursor:pointer}',
            '.fur-custom button:disabled{opacity:.45;cursor:default}',
        ].join('\n');
        (d.head || d.documentElement).appendChild(s);
    }

    function _btn(cls, icon, text) {
        const b = d.createElement('button'); b.type = 'button'; b.className = cls;
        b.innerHTML = '<i class="' + icon + '"></i> ' + text;
        return b;
    }

    let _tab = 'shop', _cat = 'seat';

    async function launch(container) {
        _injectStyle();
        const root = container || d.body;
        // 先把殼掛上去再讀資料：DB 冷啟動要幾百毫秒，這中間不能是一片空白
        root.innerHTML = '';
        const wrap = d.createElement('div'); wrap.className = 'fur-wrap';
        const head = d.createElement('div'); head.className = 'fur-head';
        const title = d.createElement('span'); title.className = 'fur-title';
        title.innerHTML = '<i class="fa-solid fa-couch"></i> 家具商城';
        const purse = d.createElement('span'); purse.className = 'fur-purse';
        head.appendChild(title); head.appendChild(purse);
        wrap.appendChild(head);

        const tabs = d.createElement('div'); tabs.className = 'fur-tabs';
        const tShop = d.createElement('button'); tShop.type = 'button'; tShop.className = 'fur-tab';
        tShop.innerHTML = '<i class="fa-solid fa-store"></i> 逛商城';
        const tStock = d.createElement('button'); tStock.type = 'button'; tStock.className = 'fur-tab';
        tStock.innerHTML = '<i class="fa-solid fa-box-open"></i> 我的倉庫';
        tabs.appendChild(tShop); tabs.appendChild(tStock);
        wrap.appendChild(tabs);

        const body = d.createElement('div'); body.className = 'fur-list';
        const note = d.createElement('div'); note.className = 'fur-note';
        note.textContent = '正在開店…';
        wrap.appendChild(body); wrap.appendChild(note);
        root.appendChild(wrap);

        async function refreshPurse() {
            let v = 0;
            try { const pt = _pt(); if (pt && pt.getPT) v = await pt.getPT(); } catch (e) {}
            purse.innerHTML = '<i class="fa-solid fa-coins"></i> ' + v;
        }
        function say(msg, kind) {
            note.className = 'fur-note' + (kind ? ' is-' + kind : '');
            note.textContent = msg;
        }

        async function renderShop() {
            body.innerHTML = '';
            const cats = await getCatalog();
            if (!cats.some(function (c) { return c.key === _cat; })) _cat = cats[0].key;

            const row = d.createElement('div'); row.className = 'fur-cats';
            cats.forEach(function (c) {
                const b = d.createElement('button'); b.type = 'button';
                b.className = 'fur-cat' + (c.key === _cat ? ' on' : '');
                b.textContent = c.label;
                b.onclick = function () { _cat = c.key; renderShop(); };
                row.appendChild(b);
            });
            body.appendChild(row);

            const cat = cats.find(function (c) { return c.key === _cat; });
            (cat ? cat.items : []).forEach(function (it) {
                const card = d.createElement('div'); card.className = 'fur-item';
                const bd = d.createElement('div'); bd.className = 'fur-item-body';
                const nm = d.createElement('div'); nm.className = 'fur-item-name'; nm.textContent = it.name;
                const nt = d.createElement('div'); nt.className = 'fur-item-note'; nt.textContent = it.note || '';
                const tg = d.createElement('div'); tg.className = 'fur-item-tags'; tg.textContent = (it.tags || []).join('　');
                bd.appendChild(nm); bd.appendChild(nt); if ((it.tags || []).length) bd.appendChild(tg);
                const buyBtn = _btn('fur-buy', 'fa-solid fa-cart-plus', String(it.price));
                buyBtn.onclick = async function () {
                    buyBtn.disabled = true;
                    let r;
                    try { r = await buy(it.id); } catch (e) { console.warn('[Furniture] 買失敗', e); r = { ok: false, reason: 'save' }; }
                    if (r && r.ok) {
                        say(it.name + ' 買好了，送到倉庫。進房間布置時可以拿出來擺。', 'ok');
                        await refreshPurse();
                    } else {
                        say(r && r.reason === 'poor' ? ('還差 ' + r.short + ' 才買得起。')
                            : r && r.reason === 'full' ? '倉庫滿了，先把東西擺進房間再回來買。'
                            : r && r.reason === 'gone' ? '這件已經不在架上了。'
                            : '這次沒買成，錢沒有扣掉，再按一次就好。', 'bad');
                    }
                    buyBtn.disabled = false;
                };
                card.appendChild(bd); card.appendChild(buyBtn);
                body.appendChild(card);
            });

            // 訂製：目錄裡沒有的東西，燒一次副模型生一件出來，之後永久留在架上
            const box = d.createElement('div'); box.className = 'fur-custom';
            const lb = d.createElement('label'); lb.textContent = '想要架上沒有的東西？描述給店員聽';
            const inp = d.createElement('input'); inp.type = 'text'; inp.maxLength = 40;
            inp.placeholder = '例如：一張放得下三台螢幕的長桌';
            const go = _btn('', 'fa-solid fa-wand-magic-sparkles', '請店員找找');
            go.onclick = async function () {
                const q = String(inp.value || '').trim();
                if (!q) { inp.focus(); return; }
                go.disabled = true; say('店員正在翻型錄…');
                try {
                    const item = await makeCustom(q);
                    inp.value = '';
                    _cat = 'custom';
                    await renderShop();
                    say('找到了：' + item.name + '（' + item.price + '）。已經放進「訂製」那一櫃，之後再買不用重找。', 'ok');
                } catch (e) {
                    say((e && e.message) || '店員今天找不到這件，換個說法試試。', 'bad');
                }
                go.disabled = false;
            };
            box.appendChild(lb); box.appendChild(inp); box.appendChild(go);
            body.appendChild(box);
        }

        async function renderStock() {
            body.innerHTML = '';
            const stock = await getStock();
            if (!stock.length) {
                const e = d.createElement('div'); e.className = 'fur-empty';
                e.textContent = '倉庫是空的。買了東西會先送到這裡，進房間布置時再拿出來擺。';
                body.appendChild(e);
                return;
            }
            stock.slice().reverse().forEach(function (s) {
                const card = d.createElement('div'); card.className = 'fur-item';
                const bd = d.createElement('div'); bd.className = 'fur-item-body';
                const nm = d.createElement('div'); nm.className = 'fur-item-name'; nm.textContent = s.name;
                const nt = d.createElement('div'); nt.className = 'fur-item-note'; nt.textContent = s.note || '';
                bd.appendChild(nm); bd.appendChild(nt);
                card.appendChild(bd);
                body.appendChild(card);
            });
        }

        function switchTab(t) {
            _tab = t;
            tShop.classList.toggle('on', t === 'shop');
            tStock.classList.toggle('on', t === 'stock');
            say(t === 'shop' ? '買到的東西會送到倉庫，進房間布置時拿出來擺。' : '這些都可以擺進房間。');
            (t === 'shop' ? renderShop() : renderStock()).catch(function (e) {
                console.warn('[Furniture] 畫面失敗', e); say('這頁暫時打不開，換個分頁再回來。', 'bad');
            });
        }
        tShop.onclick = function () { switchTab('shop'); };
        tStock.onclick = function () { switchTab('stock'); };

        await refreshPurse();
        switchTab(_tab);
    }
    console.log('[Furniture] 家具商城已載入');
})();
