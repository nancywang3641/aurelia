// ----------------------------------------------------------------
// [檔案] os_cafe.js
// 路徑：os_phone/os/os_cafe.js
// 職責：📖☕ 書咖經營系統——菜單/書單+備料+客人上門結算（研發＝後廚，在 os_cafe_kitchen.js：11-12 夜起是全螢幕後廚窗口；這裡留舊調配那杯的揭曉 _labResult／_finishRdNow）。
//   10-12 改經營版：書咖自己的帳戶(跟 PT 錢包分開)+每天體力；研發花錢花體力、等幾小時才揭曉；
//   上架的飲品要「備料」才有料，客人到店那一刻有料才點得到（點了才當場做）；10-13 起備的料等下一次 9 點開店才上架、放兩天才倒。
//   雇來的早班／晚班員工（os_cafe_hire.js）在結算裡跟客人照時間交錯跑：上班先看帳備料、賣完補貨、領薪水。
//   客人＝書裡的角色(名冊)＋12 位照腳本跑的常客(os_cafe_regulars.js)。
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
        // 💰 書咖自己的帳（跟 PT 錢包分開）：備料、研發都從這裡扣，客人付的錢進這裡
        //   每份材料錢＝售價三分之一；10-13 起備料＝料等下一次 9 點開店才上架、能放兩天（那天＋隔天），第三天早上倒掉
        fund: { start: 300, staminaMax: 12, batchStamina: 2, batchMax: 8, shelfDays: 2 },
        socialBring: 0.35,  // 愛揪人的常客上門時，帶另一位常客一起來的機率
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
    // 'shift'＝舊的點單小遊戲紀錄（10-08 拿掉小遊戲；資料留在原地不動）
    const K_PEND = 'pending';  // 今天還沒到時間的客人 [{day,t,key,name,seq,friend?,withName?}](到點才照庫存決定點什麼)
    //   改版前排的隊帶著 {itemId,item,line,price}(點什麼早就算過了)：照舊進紀錄
    const K_FUND = 'fund';     // 書咖帳戶 {coins,stamina,staminaDay,openDay,openMin,lastWaste:{day,qty,cost}}
    const K_STOCK = 'stock';   // 做好的批 {menuId:[{id,qty,day,t,unit}]}(day/t＝哪天幾點做好；隔天倒掉)
    const K_RD = 'rd';         // 研發中的那杯 {b,f,t,key,startAt,doneAt,cost} | null
    const K_TALLY = 'tally';   // 每天每杯賣幾份、幾位想點沒點到 {day:{menuId:[sold,miss]}}（只留最近 8 天；店員看帳備料用）
    const K_STAFF2 = 'staff2'; // 雇來的員工（os_cafe_hire.js）{slots:{am,pm},duty,crewQ,diary,applicants,ad}；舊的 'staff' 是小機值班
    const OPEN_MIN = 9 * 60, CLOSE_MIN = 22 * 60;   // 客人上門的時段(分鐘):照時段陸續出現,店員一天上好幾班才各有客人
    const EV_LABEL = { devotion: '本命認證', dropout: '吃膩告別' };
    // 模型取的品名、文案、客人的話、角色名、書單都是外來的字：放進畫面前一律轉成純文字
    const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    function _minOf(ts) { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); }
    function _hm(t) { return t == null ? '' : String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }

    function _db() { return win.OS_DB || window.OS_DB; }
    async function _get(k, dflt) {
        try { const db = _db(); if (!db?.getAppData) return dflt; const v = await db.getAppData(APP_ID, k); return (v === undefined || v === null) ? dflt : v; }
        catch (e) { return dflt; }
    }
    // 讀不到就丟錯（不回預設值）：要拿來「合併後整份寫回」的讀取用這支——讀失敗當成空的再寫回，等於把整份清掉
    async function _getStrict(k, dflt) {
        const db = _db(); if (!db?.getAppData) throw new Error('資料庫還沒載入');
        const v = await db.getAppData(APP_ID, k);
        return (v === undefined || v === null) ? dflt : v;
    }
    async function _set(k, v) {
        try { const db = _db(); if (!db?.saveAppData) return; await db.saveAppData(APP_ID, k, v); } catch (e) { console.warn('[Cafe] 存檔失敗', k, e); }
    }
    // 🔒 動到錢、庫存、研發的寫入一律排隊：結算在背景跑時她按「做一批」，兩邊都讀到舊的再寫回會互相蓋掉
    let _chain = Promise.resolve();
    function _locked(fn) {
        const p = _chain.then(fn, fn);
        _chain = p.catch(() => {});
        return p;
    }

    // ── 💰 書咖帳戶、庫存、研發(資料層)──
    function _REG() { return win.OS_CAFE_REGULARS || window.OS_CAFE_REGULARS || null; }
    function _unitCost(m) {   // 每份材料錢：研發台做的照料單算好存在 unit；舊的飲品照售價三分之一
        if (m && Number.isFinite(m.unit)) return m.unit;
        return Math.round((Number(m && m.price) || 0) / 3);
    }
    // 跨日＝體力回滿（讀的時候就算好，不用等結算寫回）
    function _freshFund(f, today) {
        const F = CAFE_CFG.fund;
        const out = Object.assign({ coins: F.start, stamina: F.staminaMax, staminaDay: today }, f || {});
        if (out.staminaDay !== today) { out.stamina = F.staminaMax; out.staminaDay = today; }
        return out;
    }
    // 鎖裡面用：讀最新的帳戶，沒有就建（記下開張那一刻：之前的客人不算，舊存檔第一次打開才不會整串「賣完了」）
    //   讀失敗會丟錯，不拿預設值頂——頂了再寫回＝把玩家的錢重設成 300
    async function _fundLoad() {
        const now = Date.now(), today = _dayNum(now);
        let f = await _getStrict(K_FUND, null);
        if (!f) {
            const F = CAFE_CFG.fund;
            f = { coins: F.start, stamina: F.staminaMax, staminaDay: today, openDay: today, openMin: _minOf(now) };
            await _set(K_FUND, f);
        }
        return _freshFund(f, today);
    }
    function getFund() { return _locked(_fundLoad); }
    // 書咖帳戶的錢提出去（交易所換 PT，os_pt.js 的 cafeToPT）：在書咖的鎖裡跑，結算或備料不會插進來。
    //   pay(帳戶, 要留在店裡的底, 把帳戶新值包成一筆寫入) 自己決定提多少，並把帳戶新值跟 PT 寫在同一筆交易（OS_DB.saveAppDataMany）
    function withdrawFund(pay) {
        return _locked(async () => {
            const f = await _fundLoad();
            return pay(f, CAFE_CFG.fund.start, (nf) => ({ appId: APP_ID, key: K_FUND, value: nf }));
        });
    }
    async function _fundOrNull() { try { return await getFund(); } catch (e) { return null; } }   // 畫面用：讀不到就顯示「—」
    // 一批料在某天某時刻能不能用：那批上架那天起放 shelfDays 天；上架那天要到上架時間（她備的＝9 點、店員當天補的＝補好那刻）
    function _usable(b, day, t) {
        return b.day <= day && day - b.day < CAFE_CFG.fund.shelfDays && (b.day < day || b.t <= t);
    }
    // 這杯在某天某時刻「料備好了、還沒用掉」的份數
    function _avail(stock, used, id, day, t) {
        return (stock[id] || []).filter(b => _usable(b, day, t)).reduce((n, b) => n + Math.max(0, b.qty - (used[b.id] || 0)), 0);
    }
    // 客人點一杯＝當場用掉一份料：先用舊的
    function _take(stock, used, id, day, t) {
        const b = (stock[id] || []).filter(x => _usable(x, day, t) && x.qty - (used[x.id] || 0) > 0).sort((x, y) => (x.day - y.day) || (x.t - y.t))[0];
        if (!b) return false;
        used[b.id] = (used[b.id] || 0) + 1;
        return true;
    }
    // 菜單頁：現在能賣幾份／備好了、等開店才上架的幾份
    function _stockNow(stock, id, day, t) { return _avail(stock, {}, id, day, t); }
    function _stockNext(stock, id, day, t) { return (stock[id] || []).filter(b => b.day > day || (b.day === day && b.t > t)).reduce((n, b) => n + Math.max(0, b.qty), 0); }
    // 她自己備的料什麼時候上架：下一次 9 點開店（還沒到 9 點＝今天，過了＝明天）
    function _nextOpen(ts) {
        const today = _dayNum(ts);
        return { day: _minOf(ts) < OPEN_MIN ? today : today + 1, t: OPEN_MIN };
    }
    // 🌾 書咖倉庫（11-13 後院送料）：{ items:{ 作物id 或 egg/milk/honey: { n, g＝其中上等幾個 } }, got:[收過的送貨單 id], dev:這台的代號 }
    //   後院出貨箱旁邊「送去書咖」：田那邊先從倉庫拿走、在田的帳本寫一張送貨單（type 'cafe'），田存好了這裡才照送貨單收（collectFromFarm）。
    //   只收這台送的（dev）、同一張只收一次（got）；田開了雲端存檔就等存上伺服器才收（伺服器那份蓋回來時送貨單跟著不見，就不會兩邊都有）。
    const K_PANTRY = 'pantry';
    const FARM_NAME = { stardew: '星露豆', sunroot: '曦根', moonleaf: '月葉菜', emberpepper: '燼火椒', cloudberry: '雲莓', frostbell: '霜鈴瓜', nightstar: '夜星茄', honeycorn: '蜜光玉米', dawnberry: '晨露莓', silverwheat: '銀穗麥', egg: '雞蛋', milk: '牛奶', honey: '蜂蜜' };
    async function _panLoad() {
        const p = Object.assign({ items: {}, got: [], dev: '' }, await _getStrict(K_PANTRY, null) || {});
        if (!p.items || typeof p.items !== 'object') p.items = {};
        if (!Array.isArray(p.got)) p.got = [];
        return p;
    }
    async function _setStrict(k, v) { const db = _db(); if (!db?.saveAppData) throw new Error('資料庫還沒載入'); await db.saveAppData(APP_ID, k, v); }   // 寫不進去要知道（_set 會吞掉錯）
    function cafeDev() {
        return _locked(async () => { const p = await _panLoad(); if (!p.dev) { p.dev = 'cd_' + _mkId(); await _setStrict(K_PANTRY, p); } return p.dev; });
    }
    async function getPantry() { const p = await _get(K_PANTRY, null); return (p && p.items) || {}; }
    function _lsRead(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
    async function collectFromFarm(opts) {
        const FC = win.FarmCloud || window.FarmCloud;
        const cloudOn = () => { const c = _lsRead('aurelia_farm_cloud') || {}; return !!(c.on && String(c.url || '').trim() && String(c.token || '').trim()); };
        if (opts && opts.flush && FC && FC.enabled && FC.enabled()) {   // 剛送：先把田送上伺服器（另一份送到一半就等一下再看）
            for (let i = 0; i < 6; i++) { try { await FC.flush(); } catch (e) {} if (!(FC.meta() || {}).dirty) break; await new Promise(r => setTimeout(r, 700)); }
        }
        if (cloudOn() && (_lsRead('aurelia_farm_cloud_meta') || {}).dirty) return { ok: false, pending: true };
        const farm = _lsRead('aurelia_farm_v1');
        const notes = ((farm && farm.ledger) || []).filter(e => e && e.type === 'cafe' && e.id && e.quantity > 0 && FARM_NAME[e.cropId]);
        if (!notes.length) return { ok: true, added: [] };
        return _locked(async () => {
            const pan = await _panLoad();
            const mine = notes.filter(e => e.dev && e.dev === pan.dev && !pan.got.includes(e.id));
            if (!mine.length) return { ok: true, added: [] };
            mine.forEach(e => { const it = pan.items[e.cropId] || (pan.items[e.cropId] = { n: 0, g: 0 }); it.n += e.quantity; if (e.q === 'good') it.g = (it.g || 0) + e.quantity; pan.got.push(e.id); });
            pan.got = pan.got.slice(-400);
            await _setStrict(K_PANTRY, pan);
            return { ok: true, added: mine.map(e => ({ id: e.cropId, n: e.quantity })) };
        }).catch(e => { console.warn('[Cafe] 收後院送來的料失敗', e); return { ok: false }; });
    }
    // 🏡 宿舍的鄰居來書咖（11-23：住戶在後院賺的金幣拿來玩家的書咖花＋進貨單）。規則在伺服器 garden.js 的書咖那段，這裡只做玩家這邊：
    //   ① 收點餐：住戶醒來用金幣點（伺服器當下扣他的錢），玩家打開書咖時這裡照單用掉一份料、錢進書咖帳戶、記進訪客手札；沒料就請伺服器退錢。
    //   ② 更新菜單快照：住戶看的是玩家最後一次打開書咖時的菜單和份數。
    //   ③ 進貨單：住戶把收成開價賣給書咖，研發頁「跟鄰居收貨」收下／還價／不要；住戶答應了玩家的還價，打開書咖時照那個價付。
    //   沒開雲端存檔（後院的伺服器）就整段不做。點餐收過的記在 K_NB（伺服器沒回成功的下次再報，不會重複收錢）
    const K_NB = 'neighbors';   // { seen:{ 單號: 'done'|'refund:原因' } }
    const RES_NAME = { dan: '丹', aluo: '阿洛' };
    function _cloudCfg() {
        const c = _lsRead('aurelia_farm_cloud') || {};
        let u = String(c.url || '').trim().replace(/\/+$/, '');
        if (!(c.on && u && String(c.token || '').trim())) return null;
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        return { base: u, token: String(c.token).trim() };
    }
    async function _relay(method, path, body) {
        const c = _cloudCfg();
        if (!c) throw new Error('沒有開雲端存檔');
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const tm = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) {} }, 12000);
        try {
            const r = await fetch(c.base + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + c.token }, body ? { 'Content-Type': 'application/json' } : {}),
                body: body ? JSON.stringify(body) : undefined, signal: ctl ? ctl.signal : undefined });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || ('伺服器回 ' + r.status));
            return j;
        } finally { clearTimeout(tm); }
    }
    let _nbOffers = [], _nbBusy = null;
    // 收購單（11-23，小斐整理的花園企劃「每週貼一次收購單」）：玩家貼想收什麼、幾份、一份多少；丹和阿洛醒來自己決定送不送（cafe fill），
    //   送來的開成談好價的進貨單（agreed），下面 ③ 照價自動付、進倉庫。規則在伺服器 garden.js 的 cafeBuy／cafe fill。
    let _nbBuy = null, _nbCat = [], _nbEdit = null;
    function _usableLeft(stock, id, day, t) { return (stock[id] || []).filter(b => _usable(b, day, t) && b.qty > 0).reduce((s, b) => s + b.qty, 0); }
    function _takeStock(stock, id, n, day, t) {   // 先用舊的批；回 true＝夠
        const bs = (stock[id] || []).filter(b => _usable(b, day, t) && b.qty > 0).sort((x, y) => (x.day - y.day) || (x.t - y.t));
        if (bs.reduce((s, b) => s + b.qty, 0) < n) return false;
        let need = n;
        bs.forEach(b => { const k = Math.min(b.qty, need); b.qty -= k; need -= k; });
        stock[id] = (stock[id] || []).filter(b => b.qty > 0);
        if (!stock[id].length) delete stock[id];
        return true;
    }
    function neighborSync() {
        if (_nbBusy) return _nbBusy;
        _nbBusy = (async () => {
            if (!_cloudCfg()) return { off: true };
            const feed = await _relay('GET', '/v1/cafe-feed');
            let changed = false;
            _nbBuy = feed.buy || null;
            if (Array.isArray(feed.catalog)) _nbCat = feed.catalog;
            // ① 點餐
            const orders = Array.isArray(feed.orders) ? feed.orders : [];
            const dec = await _locked(async () => {
                const nb = Object.assign({ seen: {} }, await _getStrict(K_NB, null) || {});
                const fresh = orders.filter(o => o && o.id && !nb.seen[o.id]);
                if (fresh.length) {
                    const menu = await _getStrict(K_MENU, []), stock = await _getStrict(K_STOCK, {}), fd = await _fundLoad();
                    const shop = await _getStrict(K_SHOP, { popularity: 0, revenue: 0, cups: 0, lastDay: 0 });
                    const logs = await _getStrict(K_LOG, []);
                    const now = Date.now(), day = _dayNum(now), t = _minOf(now);
                    fresh.forEach(o => {
                        const m = menu.find(x => x.id === (o.item && o.item.id));
                        const n = Math.max(1, Number(o.n) || 1), total = Math.max(0, Number(o.total) || 0);
                        if (!m) { nb.seen[o.id] = 'refund:這道已經下架了'; return; }
                        if (!_takeStock(stock, m.id, n, day, t)) { nb.seen[o.id] = 'refund:' + m.name + '沒料了'; return; }
                        fd.coins += total;
                        shop.revenue = (shop.revenue || 0) + total;
                        shop.cups = (shop.cups || 0) + n;
                        m.sold = (m.sold || 0) + n;
                        const to = o.to && o.to !== '自己' ? '，給' + o.to : '';
                        logs.unshift({ id: _mkId(), day, t, key: '', name: (RES_NAME[o.who] || o.who) + '（宿舍）', item: m.name + (n > 1 ? ' ×' + n : ''),
                            line: '點了' + m.name + (n > 1 ? ' ×' + n : '') + to + '。' + (o.note ? '「' + o.note + '」' : ''), price: total });
                        nb.seen[o.id] = 'done';
                    });
                    await _set(K_STOCK, stock); await _set(K_FUND, fd); await _set(K_SHOP, shop); await _set(K_MENU, menu); await _set(K_LOG, logs.slice(0, 80));
                    changed = true;
                }
                // 只留伺服器還列著的單號（伺服器確認過的就不再需要記）
                const live = new Set(orders.map(o => o.id));
                Object.keys(nb.seen).forEach(id => { if (!live.has(id)) delete nb.seen[id]; });
                await _setStrict(K_NB, nb);
                return nb.seen;
            });
            const done = Object.keys(dec).filter(id => dec[id] === 'done');
            const refund = Object.keys(dec).filter(id => dec[id].indexOf('refund:') === 0).map(id => ({ id, why: dec[id].slice(7) }));
            if (done.length || refund.length) { try { await _relay('POST', '/v1/cafe-claim', { done, refund }); } catch (e) { console.warn('[Cafe] 住戶點餐回報伺服器沒成，下次打開再報', e); } }
            // ③ 住戶答應了玩家的還價：照還的價付
            const offers = Array.isArray(feed.offers) ? feed.offers : [];
            for (const o of offers.filter(x => x.status === 'agreed')) { const r = await offerAct(o, 'accept').catch(() => null); if (r && r.ok) changed = true; }
            _nbOffers = offers.filter(x => x.status === 'open' || x.status === 'countered');
            // ② 菜單快照（份數＝現在能賣的料）
            try {
                const menu = await _get(K_MENU, []), stock = await _get(K_STOCK, {});
                const now = Date.now(), day = _dayNum(now), t = _minOf(now);
                await _relay('POST', '/v1/cafe-menu', { items: menu.map(m => ({ id: m.id, name: m.name, price: m.price, left: _usableLeft(stock, m.id, day, t) })) });
            } catch (e) { console.warn('[Cafe] 菜單快照沒更新成', e); }
            return { ok: true, changed, offers: _nbOffers.length };
        })().catch(e => { console.warn('[Cafe] 宿舍鄰居那段沒跑成', e); return { ok: false, why: String(e && e.message || e) }; }).finally(() => { _nbBusy = null; });
        return _nbBusy;
    }
    function _offerFood(o) {   // 進貨單的東西 → 倉庫的 id、是不是上等
        const k = String(o.key || '').split(':');
        return { id: k[1], good: k[0] === 'product' && k[2] === 'good' };
    }
    // 她處理一張進貨單：accept 收下（扣書咖帳戶、進倉庫）、counter 還價、reject 不要
    function offerAct(o, act, price) {
        if (act !== 'accept') return _relay('POST', '/v1/cafe-offer', { id: o.id, act, price }).then(r => { _nbOffers = _nbOffers.filter(x => x.id !== o.id || (r.ok && act === 'counter' && Object.assign(x, r.offer))); return r; });
        return _locked(async () => {
            const unit = o.status === 'agreed' ? o.counter : o.price, cost = unit * o.n;
            const fd = await _fundLoad();
            if (fd.coins < cost) return { ok: false, why: '書咖帳戶不夠（要 ' + cost + ' 元，剩 ' + fd.coins + ' 元）' };
            const r = await _relay('POST', '/v1/cafe-offer', { id: o.id, act: 'accept' });
            if (!r || !r.ok) return { ok: false, why: (r && r.why) || '伺服器沒收成' };
            const paid = (r.offer && r.offer.paid) || cost, f = _offerFood(o);
            fd.coins -= paid;
            const pan = await _panLoad();
            const it = pan.items[f.id] || (pan.items[f.id] = { n: 0, g: 0 });
            it.n += o.n; if (f.good) it.g = (it.g || 0) + o.n;
            await _setStrict(K_PANTRY, pan);
            await _set(K_FUND, fd);
            _nbOffers = _nbOffers.filter(x => x.id !== o.id);
            return { ok: true, paid };
        });
    }
    // 收購單那一塊：看現在貼的、改、撤下；編輯時一列一樣（東西、幾份、一份多少；價錢預設＝商人收的價）
    function _buyHtml() {
        const E = _nbEdit;
        if (E) {
            const opts = (sel) => _nbCat.map(c => '<option value="' + _esc(c.key) + '"' + (c.key === sel ? ' selected' : '') + '>' + _esc(c.name) + '（商人收 ' + c.price + '）</option>').join('');
            const rows = E.rows.map((r, i) => '<div class="oc-buy-row" data-i="' + i + '"><select data-f="key" aria-label="收什麼">' + opts(r.key) + '</select>' +
                '<label><input type="number" inputmode="numeric" min="1" max="99" data-f="qty" value="' + r.qty + '" aria-label="幾份"><span>份</span></label>' +
                '<label><input type="number" inputmode="numeric" min="1" max="999" data-f="price" value="' + r.price + '" aria-label="一份多少元"><span>元</span></label>' +
                '<button class="oc-mini-btn ghost" data-buy="del" data-i="' + i + '" aria-label="拿掉這一樣">×</button></div>').join('');
            return '<div class="oc-buy"><div class="oc-buy-head"><b>貼收購單</b><small>想收什麼、幾份、一份出多少元（預設是商人收的價）。丹和阿洛醒來看得到，要不要送他們自己決定；送來的你下次打開書咖時照這個價自動付、進倉庫。不設期限，貼新的會換掉舊的。</small></div>' +
                rows + '<div class="oc-nb-btns oc-buy-btns">' + (E.rows.length < 12 ? '<button class="oc-mini-btn ghost" data-buy="add">＋再加一樣</button>' : '') +
                '<button class="oc-mini-btn" data-buy="post"' + (E.rows.length ? '' : ' disabled') + '>貼出去</button><button class="oc-mini-btn ghost" data-buy="cancel">取消</button></div></div>';
        }
        const B = _nbBuy;
        if (!B || !B.items || !B.items.length) return '<div class="oc-buy"><div class="oc-nb-item"><span><b>收購單</b><small>還沒貼。貼了之後，丹和阿洛醒來看得到你想收什麼，自己決定送你還是賣給商人。</small></span><span class="oc-nb-btns"><button class="oc-mini-btn" data-buy="new"' + (_nbCat.length ? '' : ' disabled') + '>貼收購單</button></span></div></div>';
        const days = Math.floor((Date.now() - (B.at || Date.now())) / 86400000);
        const lines = B.items.map(x => {
            const got = Object.keys(x.got || {}).filter(w => x.got[w] > 0).map(w => (RES_NAME[w] || w) + '送了 ' + x.got[w]).join('、');
            return '<li>' + _esc(x.name) + '：收 ' + x.qty + ' ' + _esc(x.unit) + '，一' + _esc(x.unit) + ' ' + x.price + ' 元・' + (x.left > 0 ? '還要 ' + x.left : '收滿了') + (got ? '（' + _esc(got) + '）' : '') + '</li>';
        }).join('');
        return '<div class="oc-buy"><div class="oc-buy-head"><b>我的收購單</b><small>' + (days < 1 ? '今天' : days + ' 天前') + '貼的，不設期限。送來的你打開書咖時照價自動付、進倉庫。</small></div><ul class="oc-buy-list">' + lines + '</ul>' +
            '<div class="oc-nb-btns oc-buy-btns"><button class="oc-mini-btn" data-buy="edit">改收購單</button><button class="oc-mini-btn ghost" data-buy="off">撤下</button></div></div>';
    }
    function _buyRow(key) { const c = _nbCat.find(x => x.key === key) || _nbCat[0]; return c ? { key: c.key, qty: 3, price: c.price, touched: false } : null; }
    function _bindBuy(el) {
        const A = win.AUI || window.AUI;
        const box = el.querySelector('.oc-buy');
        if (!box) return;
        box.querySelectorAll('.oc-buy-row').forEach(row => {
            const r = _nbEdit && _nbEdit.rows[Number(row.dataset.i)];
            if (!r) return;
            row.querySelector('[data-f="key"]').addEventListener('change', e => {
                r.key = e.target.value;
                if (!r.touched) { const c = _nbCat.find(x => x.key === r.key); if (c) { r.price = c.price; row.querySelector('[data-f="price"]').value = c.price; } }
            });
            row.querySelector('[data-f="qty"]').addEventListener('input', e => { r.qty = Math.round(Number(e.target.value)) || 0; });
            row.querySelector('[data-f="price"]').addEventListener('input', e => { r.price = Math.round(Number(e.target.value)) || 0; r.touched = true; });
        });
        box.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', async () => {
            const act = b.dataset.buy;
            if (act === 'new') { const r = _buyRow(); _nbEdit = { rows: r ? [r] : [] }; return renderNeighborOffers(el); }
            if (act === 'edit') { _nbEdit = { rows: (_nbBuy.items || []).map(x => ({ key: x.key, qty: Math.max(1, x.left || x.qty), price: x.price, touched: true })) }; return renderNeighborOffers(el); }
            if (act === 'cancel') { _nbEdit = null; return renderNeighborOffers(el); }
            if (act === 'add') { const used = new Set(_nbEdit.rows.map(x => x.key)); const c = _nbCat.find(x => !used.has(x.key)); const r = _buyRow(c && c.key); if (r) _nbEdit.rows.push(r); return renderNeighborOffers(el); }
            if (act === 'del') { _nbEdit.rows.splice(Number(b.dataset.i), 1); return renderNeighborOffers(el); }
            if (act === 'post' || act === 'off') {
                let items = [];
                if (act === 'post') {
                    const seen = new Set();
                    for (const r of _nbEdit.rows) {
                        if (!(r.qty >= 1 && r.qty <= 99)) { if (A && A.toast) A.toast('份數寫 1～99'); return; }
                        if (!(r.price >= 1 && r.price <= 999)) { if (A && A.toast) A.toast('一份的價錢寫 1～999 元'); return; }
                        if (seen.has(r.key)) { const c = _nbCat.find(x => x.key === r.key); if (A && A.toast) A.toast((c ? c.name : '同一樣') + '寫了兩次，合成一列'); return; }
                        seen.add(r.key);
                        items.push({ key: r.key, qty: r.qty, price: r.price });
                    }
                } else if (A && A.confirm && !(await A.confirm('撤下收購單？已經送來的照樣會付；還沒送的就不收了。'))) return;
                box.querySelectorAll('button,select,input').forEach(x => { x.disabled = true; });
                try {
                    const r = await _relay('POST', '/v1/cafe-buy', { items });
                    _nbBuy = r && r.buy || null;
                    _nbEdit = null;
                    if (A && A.toast) A.toast(act === 'post' ? '收購單貼出去了，丹和阿洛醒來看得到' : '收購單撤下了');
                } catch (e) { if (A && A.toast) A.toast('沒貼成：' + String(e && e.message || e)); }
                renderNeighborOffers(el);
            }
        }));
    }
    // 研發頁「跟鄰居收貨」那一塊（os_cafe_kitchen.js 的後廚門口叫）：最上面是收購單，下面是住戶自己開價的進貨單
    function renderNeighborOffers(el) {
        if (!el) return;
        if (!_cloudCfg()) { el.innerHTML = '<div class="oc-nb-empty">宿舍的鄰居（丹、阿洛）會把後院收成開價賣給書咖，你也可以貼收購單跟他們收。要先在後院接好雲端存檔才看得到。</div>'; return; }
        const list = _nbOffers.slice();
        if (!list.length) { el.innerHTML = _buyHtml() + '<div class="oc-nb-empty">目前沒有人開價想賣東西給你。丹和阿洛醒來顧田時，可能會開進貨單過來。</div>'; _bindBuy(el); return; }
        el.innerHTML = _buyHtml() + list.map(o => {
            const who = RES_NAME[o.who] || o.who, u = o.unit || '份';
            const head = '<b>' + _esc(who) + '</b> 想賣你 ' + _esc(o.name) + ' × ' + o.n + '，一' + _esc(u) + ' ' + o.price + ' 元（共 ' + o.price * o.n + ' 元）';
            const sub = o.status === 'countered' ? '<small>你還價一' + _esc(u) + ' ' + o.counter + ' 元，等' + _esc(who) + '回</small>' : '';
            const btns = o.status === 'countered'
                ? '<button class="oc-mini-btn" data-nb="accept" data-id="' + _esc(o.id) + '">照他開的價收下</button><button class="oc-mini-btn ghost" data-nb="reject" data-id="' + _esc(o.id) + '">不要</button>'
                : '<button class="oc-mini-btn" data-nb="accept" data-id="' + _esc(o.id) + '">收下（' + o.price * o.n + ' 元）</button><button class="oc-mini-btn ghost" data-nb="counter" data-id="' + _esc(o.id) + '">還價</button><button class="oc-mini-btn ghost" data-nb="reject" data-id="' + _esc(o.id) + '">不要</button>';
            return '<div class="oc-nb-item"><span>' + head + sub + '</span><span class="oc-nb-btns">' + btns + '</span></div>';
        }).join('');
        _bindBuy(el);
        el.querySelectorAll('[data-nb]').forEach(b => b.addEventListener('click', async () => {
            const o = _nbOffers.find(x => x.id === b.dataset.id);
            if (!o) return;
            const act = b.dataset.nb;
            let price;
            if (act === 'counter') {
                const A = win.AUI || window.AUI;
                const v = A && A.prompt ? await A.prompt('一' + (o.unit || '份') + '你想出多少元？（' + (RES_NAME[o.who] || o.who) + '開 ' + o.price + ' 元）', String(Math.max(1, Math.round(o.price * 0.8)))) : null;
                price = Math.round(Number(v));
                if (!v || !Number.isInteger(price) || price < 1) return;
            }
            el.querySelectorAll('[data-nb]').forEach(x => { x.disabled = true; });
            const r = await offerAct(o, act, price).catch(e => ({ ok: false, why: String(e && e.message || e) }));
            const A = win.AUI || window.AUI;
            if (A && A.toast) A.toast(r && r.ok ? ({ accept: '收下了，' + o.name + ' 進倉庫', counter: '還價送出了，等' + (RES_NAME[o.who] || o.who) + '回', reject: '退回去了，東西還給' + (RES_NAME[o.who] || o.who) }[act]) : ('沒成：' + ((r && r.why) || '')));
            if (r && r.ok && act === 'accept') _refreshHeaderStats();
            renderNeighborOffers(el);
            const K = win.OS_CAFE_KITCHEN || window.OS_CAFE_KITCHEN;
            if (r && r.ok && act === 'accept' && K && K.render && _winEl) { const body = _winEl.querySelector('.oc-body'); if (body && _winEl.querySelector('.oc-tab.on[data-tab="kitchen"]')) K.render(body); }
        }));
    }
    function _panTake(pan, use) { for (const g in use) { const it = pan.items[g]; if (!it) continue; const t = Math.min(it.n, use[g]); it.g = Math.max(0, (it.g || 0) - t); it.n -= t; if (it.n <= 0) delete pan.items[g]; } }
    // 備 n 份要從倉庫拿什麼：後院才有的作物不夠就備不了；牛奶雞蛋蜂蜜倉庫有就先用（省下買的錢）
    function _batchPlan(m, n, items) {
        const g = (m && m.garden) || {}, use = {};
        let save = 0;
        for (const id in g) {
            const need = (g[id].u || 0) * n, have = items[id] ? items[id].n : 0;
            if (!g[id].c) { if (have < need) return { ok: false, why: '後院的' + (FARM_NAME[id] || id) + '不夠（備 ' + n + ' 份要 ' + need + '，倉庫只有 ' + have + '）' }; if (need) use[id] = need; }
            else { const t = Math.min(have, need); if (t) { use[id] = t; save += t * g[id].c; } }
        }
        return { ok: true, use, save, cost: Math.max(0, _unitCost(m) * n - save) };
    }
    const _cropDish = (m) => !!(m && m.garden && Object.keys(m.garden).some(id => !m.garden[id].c));   // 要用後院作物的菜（店員不會自己備：他們拿不到後院的料）
    // 備料：花材料錢＋體力，料等下一次開店才上架（10-13 定：備料在一個時間點備，備的是明天的料——快打烊才備的不會當天上架、隔天就倒）
    function makeBatch(menuId, qty) {
        return _locked(async () => {
            const F = CAFE_CFG.fund;
            const now = Date.now(), at = _nextOpen(now);
            const n = Math.max(1, Math.min(F.batchMax, Math.floor(Number(qty) || 0)));
            const menu = await _getStrict(K_MENU, []);
            const m = menu.find(x => x.id === menuId);
            if (!m) return { ok: false, why: '這杯已經不在菜單上了' };
            const fd = await _fundLoad();
            if (fd.stamina < F.batchStamina) return { ok: false, why: '體力不夠（剩 ' + fd.stamina + '，備料一次要 ' + F.batchStamina + '）' };
            const pan = m.garden ? await _panLoad() : null;
            const plan = _batchPlan(m, n, pan ? pan.items : {});
            if (!plan.ok) return { ok: false, why: plan.why };
            const cost = plan.cost, unit = Math.round(cost / n);
            if (fd.coins < cost) return { ok: false, why: '錢不夠（備 ' + n + ' 份要 ' + cost + ' 元，帳戶剩 ' + fd.coins + ' 元）' };
            const stock = await _getStrict(K_STOCK, {});
            (stock[m.id] || (stock[m.id] = [])).push({ id: _mkId(), qty: n, day: at.day, t: at.t, unit });
            fd.coins -= cost; fd.stamina -= F.batchStamina;
            if (pan && Object.keys(plan.use).length) { _panTake(pan, plan.use); await _setStrict(K_PANTRY, pan); }
            await _set(K_STOCK, stock);
            await _set(K_FUND, fd);
            return { ok: true, fund: fd, qty: n, cost, day: at.day, t: at.t, home: plan.use };
        });
    }
    // 🎁 玩家自己點一份（11-19 加：花錢點餐送給書裡的角色）：
    //   扣玩家的 PT、用掉一份現在有的料（先用舊的）、錢進書咖帳戶、算賣出一杯。送給誰、店員端過去在大廳那邊（lobby_cafe_regulars.js 的 deliver）
    function playerOrder(menuId) {
        return _locked(async () => {
            const menu = await _getStrict(K_MENU, []);
            const m = menu.find(x => x.id === menuId);
            if (!m) return { ok: false, why: '這道已經不在菜單上了' };
            const now = Date.now(), day = _dayNum(now), t = _minOf(now);
            const stock = await _getStrict(K_STOCK, {});
            const b = (stock[m.id] || []).filter(x => _usable(x, day, t) && x.qty > 0).sort((x, y) => (x.day - y.day) || (x.t - y.t))[0];
            if (!b) return { ok: false, why: '「' + m.name + '」現在沒料了，先備料' };
            const PT = win.OS_PT || window.OS_PT;
            if (!PT || !PT.spendPT) return { ok: false, why: '讀不到你的 PT，等一下再試' };
            const pay = await PT.spendPT(m.price, '書咖點餐：' + m.name);
            if (!pay || !pay.ok) return { ok: false, why: 'PT 不夠（要 ' + m.price + '，你有 ' + Math.floor((pay && pay.balance) || 0) + '）' };
            b.qty -= 1;
            if (b.qty <= 0) { stock[m.id] = stock[m.id].filter(x => x !== b); if (!stock[m.id].length) delete stock[m.id]; }
            const fd = await _fundLoad();
            fd.coins += m.price;
            const shop = await _getStrict(K_SHOP, { popularity: 0, revenue: 0, cups: 0, lastDay: 0 });
            shop.revenue = (shop.revenue || 0) + m.price;
            shop.cups = (shop.cups || 0) + 1;
            m.sold = (m.sold || 0) + 1;
            await _set(K_STOCK, stock); await _set(K_FUND, fd); await _set(K_SHOP, shop); await _set(K_MENU, menu);
            return { ok: true, item: m.name, price: m.price, balance: pay.balance };
        });
    }
    // 時間到了才揭曉：寫進配方圖鑑、清掉研發中；還沒到回 null
    function revealRd() {
        return _locked(async () => {
            const rd = await _getStrict(K_RD, null);
            if (!rd || rd.doneAt > Date.now()) return null;
            const lab = await _getStrict(K_LAB, {});
            const tier = lab[rd.key] || _tierOf(rd.key);
            lab[rd.key] = tier;
            await _set(K_LAB, lab);
            await _set(K_RD, null);
            return { key: rd.key, tier, b: rd.b, f: rd.f, t: rd.t };
        });
    }

    // 改版前調配到一半的那杯：研發台不用等，打開就直接揭曉
    function _finishRdNow() {
        return _locked(async () => {
            const rd = await _getStrict(K_RD, null);
            if (!rd) return false;
            rd.doneAt = 0;
            await _set(K_RD, rd);
            return true;
        }).then(had => had ? revealRd() : null);
    }

    // ── 品質判定(寫死矩陣+雜湊,零 API=真解謎)──
    function _hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h; }
    function _tierOf(key) {
        if (CAFE_CFG.sCombos.includes(key)) return 'S';
        if (CAFE_CFG.cCombos.includes(key)) return 'C';
        return (_hash(key) % 100) < CAFE_CFG.hashARatio * 100 ? 'A' : 'B';
    }
    function _ing(slot, id) { return CAFE_CFG.pantry[slot].find(x => x.id === id) || null; }
    function _tagsOf(b, f, t) { return [_ing('base', b), _ing('flavor', f), _ing('top', t)].filter(Boolean).map(x => x.tag); }
    function _tagPool() {   // 研發台的料多了「鹹香」這類口味，一起進來（常客、書裡角色的口味才挑得到）
        const K = win.OS_CAFE_KITCHEN || window.OS_CAFE_KITCHEN;
        return [...new Set(Object.values(CAFE_CFG.pantry).flat().map(x => x.tag).concat(K && K.tags ? K.tags() : []))];
    }   // 調性標籤詞彙表(創想只准從這挑,②配對才對得上)

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
                api.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { task: 'cafe', label:'書咖上架命名', keepCodeFences: true });
            });
            const json = _extractJSON(raw);
            if (json && json.name) return { name: String(json.name).slice(0, 12), blurb: String(json.blurb || '').slice(0, 40) };
            return fallback;
        } catch (e) { console.warn('[Cafe] 命名失敗,退機械名', e); return fallback; }
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
                api.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { task: 'cafe', label:'書咖首訪定調', keepCodeFences: true });
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
    // 挑品項:偏好tag加權+狀態機權重(嚐鮮1.5/上癮2/習慣1/吃膩0.3)+店員推薦+1+一點隨機
    //   opt.traits＝常客的習性(見 os_cafe_regulars.js)；opt.only＝只在這幾杯裡挑(賣完了改點有庫存的)
    function _boredAt(traits) { return (traits || []).includes('picky') ? 7 : 10; }   // 挑剔的比較快喝膩
    function _pickItem(menu, st, day, recId, opt) {
        opt = opt || {};
        const tr = opt.traits || [];
        const prefs = st.prefs || [];
        let avail = menu.filter(m => !((st.items[m.id] || {}).coolUntil > day));
        if (opt.only) avail = avail.filter(m => opt.only.has(m.id));
        if (tr.includes('picky')) avail = avail.filter(m => (m.tags || []).some(t => prefs.includes(t)));   // 挑剔：不對口味的不點
        if (!avail.length) return null;
        const boredAt = _boredAt(tr);
        const stateOf = (m) => {
            const it = st.items[m.id];
            if (!it || !it.count) return 'fresh';
            if (it.count >= boredAt) return 'bored';
            if (it.streak >= 3) return 'addict';
            if (it.count >= 6) return 'habit';
            return 'normal';
        };
        if (tr.includes('loyal') && !opt.only) {   // 固定派：有了本命(點過 3 次以上、最多的那杯)就只想喝那杯
            let fav = null, most = 2;
            for (const m of avail) { const c = (st.items[m.id] || {}).count || 0; if (c > most) { most = c; fav = m; } }
            if (fav) return { m: fav, state: stateOf(fav), fav: true };
        }
        const pool = _tagPool();
        const craving = tr.includes('moody') ? pool[_hash(String(opt.key) + ':' + day) % pool.length] : null;   // 看心情：今天特別想喝這個口味
        const W = { fresh: tr.includes('novelty') ? 3 : 1.5, bored: 0.3, addict: 2, habit: 1, normal: 1 };
        let best = null, bestW = 0;
        for (const m of avail) {
            const state = stateOf(m);
            let w = W[state];
            w += (m.tags || []).filter(t => prefs.includes(t)).length * 0.8;
            if (craving && (m.tags || []).includes(craving)) w += 1.2;
            if (tr.includes('thrifty')) w *= (m.price <= CAFE_CFG.prices.A ? 1.5 : 0.6);   // 省錢：偏便宜的
            if (recId && m.id === recId) w += 1;   // 店員推薦的那杯
            w *= 0.7 + Math.random() * 0.6;   // 一點隨機,別天天同一杯
            if (w > bestW) { bestW = w; best = { m, state }; }
        }
        return best;
    }
    // 常客建檔：口味兩個——一個照類型、另一個類型的另一個或標籤池隨機(建檔時定下來)
    function _newRegular(g, ty) {
        const pool = _tagPool();
        const a = ty.tags[Math.floor(Math.random() * ty.tags.length)];
        let b = Math.random() < 0.5 ? ty.tags.find(x => x !== a) : pool[Math.floor(Math.random() * pool.length)];
        if (!b || b === a) b = ty.tags.find(x => x !== a);
        return { name: g.name, type: g.type, traits: (g.traits || []).slice(), prefs: [a, b].filter(Boolean), incl: ty.freq, visits: 0, spend: 0, items: {} };
    }
    // 愛揪人：帶一位今天還沒要來的常客(同類型那位優先)
    function _pickMate(REG, g, coming) {
        const free = REG.PEOPLE.filter(x => x.key !== g.key && !coming.has(x.key) && REG.TYPES[x.type]);
        if (!free.length) return null;
        const same = free.filter(x => x.type === g.type);
        return (same.length && Math.random() < 0.6) ? same[0] : free[Math.floor(Math.random() * free.length)];
    }
    function _fill(s, o) { return String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] == null ? '' : o[k])); }
    function _oneOf(list) { return Array.isArray(list) ? list[Math.floor(Math.random() * list.length)] : list; }
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
                api.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { task: 'cafe', label:'書咖訪客留言', keepCodeFences: true });
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
                api.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { task: 'cafe', label:'書咖事件:' + (EV_LABEL[ev.type] || ev.type), keepCodeFences: true });
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
    // opt.quiet＝大廳舞台每隔一陣子補算一次（看誰在店裡）：這條路一律不叫模型——
    //   書裡角色第一次上門的定調留在排隊裡、事件卡留到她打開櫃台那次（一天一次）才處理
    async function _settle(opt) {
        if (_settling) return _settling;
        _settling = _settleInner(opt).finally(() => { _settling = null; });
        return _settling;
    }
    async function _settleInner(opt) {
        const quiet = !!(opt && opt.quiet);
        let off = false;   // 關掉「書咖離線訪客」＝不再擲新的客人；已經排隊的照樣到時間進店
        try { off = (win.localStorage || localStorage).getItem('cafe_offline_visits') === '0'; } catch (e) {}
        const roster = off ? [] : await Promise.resolve(win.LobbyNpcs?.cafeRoster?.() || []);
        const REG = off ? null : _REG();
        const shop = await getShop();
        const nowTs = Date.now();
        const today = _dayNum(nowTs), nowMin = _minOf(nowTs);
        let fund0;
        try { fund0 = await getFund(); } catch (e) { console.warn('[Cafe] 讀不到書咖帳戶，這次先不結算', e); return false; }
        if (!shop.lastDay) { shop.lastDay = today - 1; await _set(K_SHOP, shop); }   // 開張日：今天就營業(開張那一刻之前的客人不算)
        const rosterEv = off ? await Promise.resolve(win.LobbyNpcs?.cafeRoster?.() || []) : roster;
        const pend0 = await _get(K_PEND, []);
        const isDue = p => (p.day < today || p.t <= nowMin) && !(quiet && p.tune);   // 等定調的那筆不叫模型就放不進來
        const dayChanged = shop.lastDay < today;   // 換日：前一天剩的要倒掉，客人沒開也一樣
        const rollDays = dayChanged && (roster.length > 0 || !!REG);
        // 事件卡一天處理一次：她當天第一次「不是大廳悄悄補算」的那次（舊存檔沒記過＝看上次換日是哪天）
        const evDay0 = shop.evDay != null ? shop.evDay : (shop.lastDay || 0);
        const evOk = !quiet && evDay0 < today;
        // 🧑‍🍳 雇來的員工：照時間上班、備料、補貨（照規則算，不叫模型；大廳悄悄補算也跑）
        const HIRE = win.OS_CAFE_HIRE || window.OS_CAFE_HIRE;
        let staff2 = null;
        try { staff2 = HIRE && HIRE._pure ? await _getStrict(K_STAFF2, null) : null; } catch (e) { staff2 = null; }
        const crewFrom = Math.max(today - 7, fund0.openDay || 0);
        // 🧠 11-24：沒雇人也要跑（沒人在班＝客人少、人氣掉）；小機值班開著＝有人顧店
        const crewDue = !!(HIRE && HIRE._pure && HIRE._pure.hasDue(staff2, crewFrom, today, nowMin));
        let minder = false;
        try { const xs = await _get('staff', null); minder = !!(xs && xs.on && xs.pick); } catch (e) {}
        if (!dayChanged && !pend0.some(isDue) && !evOk && !crewDue) return false;
        const from = Math.max(shop.lastDay + 1, today - 7, fund0.openDay || 0);
        const npcs = await _get(K_NPC, {});
        const menu = await getMenu();
        const evq = await _get(K_EVQ, []);
        const stock = await _get(K_STOCK, {});   // 照這份算誰點得到；寫回時照批次 id 疊在最新那份上
        const used = {};   // 批次 id → 這次賣掉幾份
        const tallyAdd = {};   // 這次結算的銷售統計（寫回時加到最新那份上）
        const tallyLive = JSON.parse(JSON.stringify(await _get(K_TALLY, {})));   // 店員看的帳：存著的＋這次算到的（補算好幾天時，前一天的客人算完才輪到隔天早班看帳）
        const tal = (day, id, k) => {
            for (const T of [tallyAdd, tallyLive]) { const d = T[day] || (T[day] = {}); (d[id] || (d[id] = [0, 0]))[k]++; }
        };
        const crew = (HIRE && HIRE._pure) ? HIRE._pure.crewSession({ staff2: staff2 || {}, tally: tallyLive, menu: menu.filter(m => !_cropDish(m)), stock, used, coins: fund0.coins, today, nowMin, from: crewFrom,
            unitCost: _unitCost, avail: _avail, mkId: _mkId, rand: Math.random, minder, qAvg: shop.qAvg, hyg: shop.hyg, shelfDays: CAFE_CFG.fund.shelfDays }) : null;
        const HY = (HIRE && HIRE._pure && HIRE._pure.HYG) || {};   // 🧹 店況的數字（蟲鼠、吃壞肚子的機率）
        const qBoost = ((shop.qAvg != null ? shop.qAvg : 50) - 50) * 0.004;   // 🧠 最近幾班服務分＝客人多常回來（小斐：回頭率 +(Q−50)×0.4 個百分點）
        const recId = shop.recommend?.id || null;   // 店員推薦的那杯
        const pop0 = shop.popularity || 0;
        const sold0 = new Map(menu.map(m => [m.id, m.sold || 0]));   // 這次賣了幾杯＝結束時減開始時
        const fresh = [];   // 這次新進紀錄的(到店的客人、事件卡)
        const pend = pend0.filter(p => !isDue(p));   // 還沒到時間的照舊排隊
        const queue = pend0.filter(isDue);   // 這次要放進店裡的
        let earned = 0, cupsAdded = 0, anyVisit = false, tunedRun = 0, seq = 0;   // 首訪定調每次結算≤3次(名冊變大後防API爆發,沒輪到的自然留到下次)
        const tuneWait = new Set(pend0.filter(p => p.tune).map(p => p.key));   // 已經排好第一次上門、還沒定調的
        // 換日只決定「誰、幾點來」；今天比現在晚的先排隊，到點那一刻才看庫存決定點什麼
        const book = (e) => { e.seq = seq++; if (e.day === today && e.t > nowMin) pend.push(e); else queue.push(e); };
        if (rollDays) for (let day = from; day <= today; day++) {
            const openCut = day === fund0.openDay ? (fund0.openMin || 0) : -1;   // 開張那天，開張前的客人不算
            const coming = new Set();
            for (const r of roster) {
                const st = npcs[r.key] || (npcs[r.key] = { name: r.name, prefs: null, incl: 0.5, visits: 0, spend: 0, items: {} });
                const t = OPEN_MIN + Math.floor(Math.random() * (CLOSE_MIN - OPEN_MIN));
                if (t < openCut) continue;
                if (!st.prefs) {   // 還沒定調=還沒第一次上門：只排時間，到店那一刻才叫模型定調（大廳補算時不叫，留著排隊）
                    if (!tuneWait.has(r.key) && Math.random() < 0.55) {
                        tuneWait.add(r.key);
                        st.visits++; coming.add(r.key);
                        book({ day, t, key: r.key, name: r.name, first: true, tune: true });
                    }
                    continue;
                }
                const p = Math.min(0.9, Math.max(0.12, st.incl * (0.45 + Math.min(0.45, (shop.popularity || 0) / 150)) + qBoost - (st.badUntil > day ? 0.15 : 0)));
                if (Math.random() >= p) continue;
                st.visits++; coming.add(r.key);
                book({ day, t, key: r.key, name: r.name });
            }
            // 🧑‍🤝‍🧑 12 位常客：照類型的時段來；愛揪人的有時帶另一位常客
            if (REG) for (const g of REG.PEOPLE) {
                const ty = REG.TYPES[g.type];
                if (!ty) continue;
                const st = npcs[g.key] || (npcs[g.key] = _newRegular(g, ty));
                st.name = g.name; st.type = g.type; st.traits = (g.traits || []).slice();   // 名冊改了照名冊
                if (coming.has(g.key)) continue;   // 已經被揪來了
                const t = ty.from + Math.floor(Math.random() * Math.max(1, ty.to - ty.from));
                if (t < openCut) continue;
                const p = Math.min(0.9, Math.max(0.12, (st.incl || ty.freq) * (0.45 + Math.min(0.45, (shop.popularity || 0) / 150)) + qBoost - (st.badUntil > day ? 0.15 : 0)));
                if (Math.random() >= p) continue;
                st.visits++; coming.add(g.key);
                const e = { day, t, key: g.key, name: g.name };
                book(e);
                if (st.traits.includes('social') && Math.random() < CAFE_CFG.socialBring) {
                    const mate = _pickMate(REG, g, coming);
                    if (mate) {
                        const ms = npcs[mate.key] || (npcs[mate.key] = _newRegular(mate, REG.TYPES[mate.type]));
                        ms.visits++; coming.add(mate.key);
                        e.friend = mate.name;
                        book({ day, t, key: mate.key, name: mate.name, withName: g.name });
                    }
                }
            }
            // 🧠 11-24 拿掉「有客人來人氣就 +1」：以前放著也一直漲；改成每班看店員的服務分漲跌（crewR.popAdd）
            if (coming.size && !crew) shop.popularity = Math.min(999, (shop.popularity || 0) + 1);
        }
        // 🚪 客人照到店時間先後進來：想喝的那杯有做好(那天做的、做好時間不晚於他到店)就點；賣完了照習性改點或走
        queue.sort((a, b) => (a.day - b.day) || (a.t - b.t) || ((a.seq || 0) - (b.seq || 0)));
        const reg = (key) => String(key || '').indexOf('g_') === 0;
        const L = (REG && REG.LINES) || {};
        for (const a of queue) {
            if (crew) crew.until(a.day, a.t);   // 這位客人到店之前，店員該上的班、該補的料先做完
            const e = Object.assign({}, a); delete e.seq;
            if (e.tune) {   // 書裡的角色第一次上門：這時才叫模型定調（每次結算最多 3 位，沒輪到的留著排隊）
                if (quiet) { pend.push(a); continue; }   // 大廳悄悄補算：不叫模型，等她開櫃台
                const r = roster.find(x => x.key === e.key) || rosterEv.find(x => x.key === e.key);
                const st = npcs[e.key];
                if (!r || !st) continue;
                if (st.prefs) continue;   // 已經定過了（別條路先定了）
                if (tunedRun >= 3) { pend.push(a); continue; }
                tunedRun++;
                const tuned = await _tuneNpc(r);
                st.prefs = tuned.tags; st.incl = tuned.incl;
                if (tuned.book) { try { await addBook({ title: tuned.book.title, by: r.name, note: tuned.book.note }); } catch (err) {} }
                fresh.push({ id: _mkId(), day: e.day, t: e.t, key: e.key, name: e.name, line: TPL.first, price: 0 });
                anyVisit = true;
                continue;
            }
            if (e.line) {   // 第一次上門(句子早就定好)、改版前排的隊(點什麼早就算過了)：照舊進紀錄
                const m = e.itemId ? menu.find(x => x.id === e.itemId) : null;
                delete e.itemId; delete e.first;
                if (m) m.sold = (m.sold || 0) + 1;
                if (e.price) { earned += e.price; cupsAdded++; if (m) tal(e.day, m.id, 0); if (crew) crew.earn(e.price); }
                fresh.push(Object.assign({ id: _mkId() }, e));
                anyVisit = true;
                continue;
            }
            const st = npcs[e.key];
            if (!st) continue;
            const isReg = reg(e.key);
            const traits = isReg ? (st.traits || []) : [];
            let pre = e.friend ? _fill(L.bring || '', { friend: e.friend }) : (e.withName ? _fill(L.brought || '', { friend: e.withName }) : '');
            const log = (x) => {
                fresh.push(Object.assign({ id: _mkId(), day: e.day, t: e.t, key: e.key, name: e.name }, isReg ? { g: st.type } : {}, x));
                anyVisit = true;
            };
            // 🧠 有沒有人顧店：沒人在班一半客人直接走、留下的少付一成；有人在班照服務分付
            const sv = crew ? crew.serve(e.day, e.t) : null;
            if (sv && sv.closed) { if (sv.first) log({ line: '門口貼著「停業整頓」，今天來的客人都只好走了。', price: 0, nobody: true }); continue; }
            if (sv && sv.nobody && Math.random() < sv.leave) { log({ line: pre + '店裡沒人顧，等了一下就走了。', price: 0, nobody: true }); continue; }
            // 🧹 小斐 C：客人有心情（上次的記憶、店員服務分、店裡髒不髒）、有耐心（每人固定 10～25 分鐘）
            let mood = 50 + Math.round(Math.random() * 20 - 10);
            if (st.badUntil > e.day) mood -= 10; else if (st.lastMood >= 70) mood += 5;
            if (sv && sv.q != null) mood += (sv.q - 50) / 3;
            if (sv && sv.dirt > 40) mood -= (sv.dirt - 40) / 3; else if (sv && sv.dirt < 15) mood += 3;   // 很乾淨也看得出來
            if (sv && sv.pest && Math.random() < (HY.pestSeen || 0)) {
                const what = sv.pest === 'rat' ? '一隻老鼠竄過去' : '一隻蟑螂爬過桌腳';
                if (Math.random() < (HY.pestLeave || 0)) {
                    st.badUntil = e.day + 7;
                    if (Math.random() < 0.5) crew.complain(e.day, 'pest');
                    log({ line: pre + '一進門就看到' + what + '，嚇得轉身走了。', price: 0, miss: true });
                    continue;
                }
                mood -= 15; pre += '看到' + what + '，臉色不太好；';
            }
            const pat = 10 + (_hash(String(e.key)) % 16);
            if (sv && sv.wait != null) {
                if (sv.wait > pat) {
                    st.badUntil = e.day + 7;
                    if (Math.random() < 0.3) crew.complain(e.day, 'wait');
                    log({ line: pre + '等了 ' + sv.wait + ' 分鐘都沒人招呼，走了。', price: 0, miss: true });
                    continue;
                }
                if (sv.wait > pat - 5) {
                    if (Math.random() < (sv.soothe || 0)) { mood -= 3; pre += '等了一陣子，' + (sv.who || '店員') + '過來道歉；'; }
                    else { mood -= 8; pre += '等太久抱怨了幾句；'; crew.rude(e.day, e.t); }
                }
            }
            mood += 2 * (1 + Math.floor(Math.random() * 3));   // 坐著看書 1～3 回合（每回合心情 +2）
            if (sv && !sv.nobody && Math.random() < 0.25) { mood += 4; crew.chatted(e.day, e.t); }   // 跟店員聊兩句（店員心情也 +2）
            const opt = { traits, key: e.key };
            const want = _pickItem(menu, st, e.day, recId, opt);
            if (!want) {
                if (crew) crew.mess(1);
                if (traits.includes('picky') && menu.length) log({ line: pre + (L.pickyNone || TPL.browse), price: 0 });
                else if (pre || Math.random() < 0.4) log({ line: pre + TPL.browse, price: 0 });
                continue;
            }
            let pick = want, missed = null;
            if (!_take(stock, used, want.m.id, e.day, e.t)) {
                missed = want.m.name;
                const lock = traits.includes('loyal') && want.fav;   // 固定派只要本命
                const pSwitch = lock ? 0 : Math.min(1, (traits.includes('novelty') ? 0.85 : 0.5) + (crew ? crew.sweet(e.day, e.t) : 0));   // 在班上的店員嘴甜＝比較會推銷別杯
                let alt = null;
                if (Math.random() < pSwitch) {
                    const only = new Set(menu.filter(m => m.id !== want.m.id && _avail(stock, used, m.id, e.day, e.t) > 0).map(m => m.id));
                    if (only.size) alt = _pickItem(menu, st, e.day, recId, Object.assign({ only }, opt));
                }
                tal(e.day, want.m.id, 1);   // 想點的沒料了＝這杯少備了（改點別的也算）
                if (crew) crew.missed(want.m.id, e.day, e.t);
                if (!alt) {
                    const tpl = lock ? (L.loyalLeave || L.soldLeave) : L.soldLeave;
                    log({ line: pre + _fill(tpl || '想點{want},賣完了,看了看就走了。', { want: missed }), price: 0, want: missed, miss: true });
                    continue;
                }
                _take(stock, used, alt.m.id, e.day, e.t);
                pick = alt;
            }
            const m = pick.m, day = e.day;
            const it = st.items[m.id] || (st.items[m.id] = { count: 0, streak: 0, lastDay: 0, boredHits: 0, coolUntil: 0 });
            const gap = it.lastDay ? day - it.lastDay : 0;
            it.streak = (day - it.lastDay === 1) ? it.streak + 1 : 1;
            it.count++; it.lastDay = day;
            const paid = sv ? Math.max(1, Math.round(m.price * sv.mul)) : m.price;
            st.spend = (st.spend || 0) + paid;
            let lineKey = pick.state;
            if (gap > 7 && it.count > 1) lineKey = 'comeback';
            const evs = [];
            if (pick.state === 'bored') {
                it.boredHits = (it.boredHits || 0) + 1;
                if (it.boredHits >= 2) { it.coolUntil = day + 7; it.boredHits = 0; evs.push('dropout'); }   // 🎬 吃膩棄坑
            }
            if (it.count === 10 && !it.devoted) { it.devoted = true; evs.push('devotion'); }   // 🎬 本命認證
            m.sold = (m.sold || 0) + 1;
            earned += paid; cupsAdded++;
            tal(day, m.id, 0);
            if (crew) crew.earn(paid);   // 店員看的帳要算進這筆（不然晚班會以為付不起薪水）
            if (crew) crew.sold(m.id, day, e.t);
            let line = missed ? _fill(L.soldSwitch || '想點{want},賣完了,改點了{item}。', { want: missed, item: m.name }) : (TPL[lineKey] || TPL.normal).replace('{item}', m.name);
            const tail = (t) => { line = line.replace(/[。.]$/, '') + '，' + t + '。'; };
            if (crew) crew.mess();
            let sick = false;
            if (sv && sv.stale && sv.stale.has(m.id) && Math.random() < (HY.poison || 0) * (sv.poisonMul || 1)) {
                sick = true; mood = 0; st.badUntil = day + 14;
                crew.complain(day, 'poison', 2); crew.popHit(-3);
                line += '後來聽說回家肚子痛了一整晚（冰箱裡過期的料沒倒掉，被拿去用了）。';
            } else if (mood >= 70) {
                if (crew && Math.random() < 0.3) { crew.review(day, e.t); tail('走的時候說很喜歡這裡'); }
            } else if (mood < 30) { st.badUntil = day + 7; tail('看起來不太滿意'); }
            if (!sick && sv && sv.dirt >= 70 && crew && Math.random() < 0.15) { crew.complain(day, 'dirty'); line += '嫌店裡髒，打了客訴電話。'; }
            st.lastMood = Math.round(mood);
            log(Object.assign({ item: m.name, line: pre + line, price: paid }, missed ? { want: missed } : {}, sick ? { miss: true } : {}));
            // 🧠 多點一份：店員剛推薦成功，或客人心情好（同一樣還有料就同一樣，不然換一樣有料的）
            const more = (why) => {
                const x2 = _avail(stock, used, m.id, day, e.t) > 0 ? m : menu.find(z => z.id !== m.id && _avail(stock, used, z.id, day, e.t) > 0);
                if (!x2 || !_take(stock, used, x2.id, day, e.t)) return;
                const p2 = Math.max(1, Math.round(x2.price * (sv ? sv.mul : 1)));
                x2.sold = (x2.sold || 0) + 1; earned += p2; cupsAdded++; st.spend += p2;
                tal(day, x2.id, 0); if (crew) { crew.earn(p2); crew.sold(x2.id, day, e.t); }
                log({ item: x2.name, line: why + '又多點了一份' + x2.name + '。', price: p2, addOn: true });
            };
            if (!sick && sv && sv.addOn) more((sv.who || '店員') + '推薦了一下，');
            else if (!sick && mood >= 70 && Math.random() < 0.35) more('心情不錯，');
            for (const type of evs) {
                if (!isReg) { evq.push({ type, key: e.key, item: m.name, itemId: m.id }); continue; }   // 書裡的角色：換日時請他親口說
                // 常客：照模板記一筆，口味照規則轉向(不叫模型)
                const pool = _tagPool();
                if (type === 'devotion') {
                    const add = (m.tags || []).find(t => !(st.prefs || []).includes(t));
                    if (add) st.prefs = [].concat(st.prefs || [], add).slice(0, 4);
                } else {
                    const keep = (st.prefs || []).slice();
                    const turn = pool.filter(t => !keep.includes(t));
                    if (keep.length && turn.length) keep[Math.floor(Math.random() * keep.length)] = turn[Math.floor(Math.random() * turn.length)];
                    st.prefs = keep;
                }
                const said = _fill(_oneOf(L[type]) || '', { item: m.name });
                log({ item: m.name, line: said, said, price: 0, ev: type });
            }
        }
        if (crew) crew.until(today, nowMin);   // 最後一位客人之後到現在，店員該做的也做完
        const crewR = crew ? crew.result() : null;
        if (crewR) for (const x of (crewR.shopLog || [])) { fresh.push({ id: _mkId(), day: x.day, t: x.t, key: '', name: x.name, line: x.line, price: 0, insp: x.insp, miss: x.insp !== 'good' }); anyVisit = true; }
        // 🎬 A級事件消化:單次結算最多2件(敘事節點才燒API),API掛了整隊留到下次
        //   只在換日那次處理（一天一次，同改版前）：排隊客人到時間放出來、店員上班先結算，都不另外叫模型
        //   換日那次可能是大廳悄悄補算的（不叫模型）→ 改記「今天處理過沒」，她當天第一次打開櫃台時處理
        let evDone = 0;
        while (evOk && evq.length && evDone < 2) {
            const ev = evq[0];
            const r = rosterEv.find(x => x.key === ev.key);
            const st = npcs[ev.key];
            if (!r || !st) { evq.shift(); continue; }
            const out = await _eventScene(r, ev);
            if (!out) break;
            if (ev.type === 'devotion' && out.addTags.length) st.prefs = Array.from(new Set([].concat(st.prefs || [], out.addTags))).slice(0, 4);
            if (ev.type === 'dropout' && out.newTags.length) st.prefs = out.newTags;   // 口味轉向:整組改寫
            fresh.push({ id: _mkId(), day: today, t: nowMin, key: ev.key, name: st.name, item: ev.item, line: out.line, said: out.line, price: 0, ev: ev.type });
            evq.shift(); evDone++; anyVisit = true;
        }
        fresh.sort((a, b) => (b.day - a.day) || ((b.t || 0) - (a.t || 0)) || ((b.ev ? 1 : 0) - (a.ev ? 1 : 0)));   // 紀錄由新到舊(同一刻的事件卡排在點單上面)
        // 🚨 寫回要疊在「最新的那份」上：結算在背景跑、中間等好幾通 API，這段時間她可能上架新飲品、
        //    做了一批、聽完留言、改了店況——以前拿開頭讀的整份寫回，這些一結算完就消失
        return _locked(async () => {
            let menuNow, logsNow, npcsNow, shopNow, stockNow, fundNow, tallyNow, staff2Now = null;
            try {
                menuNow = await _getStrict(K_MENU, []);
                logsNow = await _getStrict(K_LOG, []);
                npcsNow = await _getStrict(K_NPC, {});
                shopNow = await _getStrict(K_SHOP, { popularity: 0, revenue: 0, cups: 0, lastDay: 0 });
                stockNow = await _getStrict(K_STOCK, {});
                fundNow = await _fundLoad();
                tallyNow = await _getStrict(K_TALLY, {});
                if (crewR) staff2Now = await _getStrict(K_STAFF2, null);
            } catch (e) { console.warn('[Cafe] 結算寫回前讀不到最新資料，這次先不寫（下次重算）', e); return false; }
            // 庫存：照批次 id 扣掉這次賣的；放超過 shelfDays 天的料倒掉
            let wasteQty = 0, wasteCost = 0;
            for (const id of Object.keys(stockNow)) {
                const keep = [];
                for (const b of (stockNow[id] || [])) {
                    const left = (b.qty || 0) - (used[b.id] || 0);
                    if (left <= 0) continue;
                    if (b.day <= today - CAFE_CFG.fund.shelfDays) { wasteQty += left; wasteCost += left * (b.unit || 0); continue; }
                    keep.push(Object.assign({}, b, { qty: left }));
                }
                if (keep.length) stockNow[id] = keep; else delete stockNow[id];
            }
            // 店員這次備的料：扣掉這次賣的放進最新那份（補算好幾天時，放超過兩天的一樣倒）
            if (crewR) for (const x of crewR.batches) {
                const left = x.batch.qty - (used[x.batch.id] || 0);
                if (left <= 0) continue;
                if (x.batch.day <= today - CAFE_CFG.fund.shelfDays) { wasteQty += left; wasteCost += left * (x.batch.unit || 0); continue; }
                (stockNow[x.menuId] || (stockNow[x.menuId] = [])).push(Object.assign({}, x.batch, { qty: left }));
            }
            fundNow.coins += earned - (crewR ? crewR.spent : 0);
            if (fundNow.coins < 0) { console.warn('[Cafe] 帳戶算到負的（結算途中她也花了錢），歸零', fundNow.coins); fundNow.coins = 0; }
            // 員工：只疊這次上班的紀錄；辭職、欠薪只在那格還是同一個人時才動（結算途中她可能開除、錄取了別人）
            if (crewR && !staff2Now) staff2Now = { slots: { am: null, pm: null }, applicants: [], diary: [], duty: {}, crewQ: [] };   // 🧠 沒雇過人也要記下哪幾班算過了
            if (crewR && staff2Now) {
                const s2 = staff2Now;
                if (crewR.brainFrom && !s2.brainFrom) s2.brainFrom = crewR.brainFrom;
                for (const slot of Object.keys(crewR.brains || {})) { const x = crewR.brains[slot], m = s2.slots[slot]; if (m && m.sid === x.sid && (m.brainRev || 0) === (x.rev || 0)) m.brain = x.brain; }   // 結算途中她按了老闆按鈕＝那份比較新，不蓋
                s2.slots = s2.slots || { am: null, pm: null };
                s2.duty = Object.assign({}, s2.duty || {}, crewR.dutyAdd);
                for (const k of Object.keys(s2.duty)) if (Number(k.split(':')[0]) < today - 7) delete s2.duty[k];
                s2.crewQ = crewR.crewQ;
                for (const slot of Object.keys(crewR.unpaid)) { const u = crewR.unpaid[slot], m = s2.slots[slot]; if (m && m.sid === u.sid) m.unpaid = u.n; }
                for (const slot of Object.keys(crewR.came || {})) { const m = s2.slots[slot]; if (m && m.sid === crewR.came[slot]) m.came = true; }
                for (const q of crewR.quit) { const m = s2.slots[q.slot]; if (m && m.sid === q.sid) s2.slots[q.slot] = null; }
                if (crewR.diary.length) { s2.diary = crewR.diary.slice().reverse().concat(s2.diary || []).slice(0, 60); s2.unread = true; }
            }
            if (dayChanged) fundNow.lastWaste = { day: today, qty: wasteQty, cost: wasteCost };
            else if (wasteQty) fundNow.lastWaste = { day: today, qty: ((fundNow.lastWaste && fundNow.lastWaste.day === today) ? fundNow.lastWaste.qty : 0) + wasteQty, cost: ((fundNow.lastWaste && fundNow.lastWaste.day === today) ? fundNow.lastWaste.cost : 0) + wasteCost };
            const soldAdd = new Map(menu.map(m => [m.id, (m.sold || 0) - (sold0.get(m.id) || 0)]));
            menuNow.forEach(x => { const d = soldAdd.get(x.id) || 0; if (d > 0) x.sold = (x.sold || 0) + d; });
            const logsOut = fresh.concat(logsNow);
            Object.assign(npcsNow, npcs);
            if (dayChanged) shopNow.lastDay = today;
            if (evOk) shopNow.evDay = today;
            shopNow.popularity = Math.max(0, Math.min(999, (shopNow.popularity || 0) + ((shop.popularity || 0) - pop0) + (crewR ? crewR.popAdd || 0 : 0)));
            if (crewR) { shopNow.qAvg = Math.round(crewR.qAvg * 10) / 10; if (crewR.shiftLog.length) shopNow.shifts = crewR.shiftLog.concat(shopNow.shifts || []).slice(0, 14); }
            if (crewR && crewR.hyg) {   // 🧹 店況：結算途中她叫了清潔公司（rev 變了）＝店裡、冰箱、蟲鼠照她那份
                const h = Object.assign({}, crewR.hyg), cur = shopNow.hyg || {};
                if ((cur.rev || 0) !== (crewR.hygRev0 || 0)) { h.dirt = Math.min(h.dirt, cur.dirt != null ? cur.dirt : h.dirt); h.pest = cur.pest ? h.pest : null; h.stale = (cur.stale || []).length ? h.stale : []; h.cleanStreak = cur.cleanStreak || 0; h.rev = cur.rev; }
                h.dirt = Math.round(h.dirt * 10) / 10;
                shopNow.hyg = h;
            }
            shopNow.revenue = (shopNow.revenue || 0) + earned;
            shopNow.cups = (shopNow.cups || 0) + cupsAdded;
            await _set(K_EVQ, evq);
            await _set(K_PEND, pend);
            await _set(K_NPC, npcsNow); await _set(K_MENU, menuNow); await _set(K_LOG, logsOut.slice(0, 80)); await _set(K_SHOP, shopNow);
            for (const d of Object.keys(tallyAdd)) {
                const into = tallyNow[d] || (tallyNow[d] = {});
                for (const id of Object.keys(tallyAdd[d])) { const v = into[id] || (into[id] = [0, 0]); v[0] += tallyAdd[d][id][0]; v[1] += tallyAdd[d][id][1]; }
            }
            for (const d of Object.keys(tallyNow)) if (Number(d) < today - 7) delete tallyNow[d];
            await _set(K_STOCK, stockNow); await _set(K_FUND, fundNow); await _set(K_TALLY, tallyNow);
            if (crewR && staff2Now) await _set(K_STAFF2, staff2Now);
            return anyVisit || dayChanged || !!(crewR && (crewR.diary.length || crewR.batches.length));
        });
    }

    // ── 對外資料 API(事件/好感度後續掛這)──
    // 🧹 叫清潔公司（她按的）：店裡、冰箱、蟲鼠一次處理；錢從書咖帳戶出
    function cleanShop() {
        return _locked(async () => {
            const HIRE = win.OS_CAFE_HIRE || window.OS_CAFE_HIRE;
            if (!HIRE || !HIRE._pure || !HIRE._pure.hygNorm) return { ok: false, why: '還沒載好，等一下再試' };
            const P = HIRE._pure;
            const shop = await _getStrict(K_SHOP, { popularity: 0, revenue: 0, cups: 0, lastDay: 0 });
            const h = P.hygNorm(shop.hyg);
            const cost = P.HYG.cleanCost + (h.pest ? P.HYG.pestCost : 0);
            const fd = await _fundLoad();
            if (fd.coins < cost) return { ok: false, why: '帳戶不夠（要 ' + cost + '）' };
            fd.coins -= cost;
            Object.assign(h, { dirt: 0, pest: null, stale: [], cleanStreak: 0, rev: (h.rev || 0) + 1, lastClean: _dayNum(Date.now()) });
            shop.hyg = h;
            await _setStrict(K_FUND, fd); await _setStrict(K_SHOP, shop);
            try { (win.LobbyCafePests || window.LobbyCafePests)?.refresh(); } catch (e) {}   // 大廳書咖的老鼠、髒汙馬上收掉
            return { ok: true, cost };
        });
    }
    async function getMenu() { return _get(K_MENU, []); }
    // 🗑 下架（11-13 加）：從菜單拿掉，客人就點不到；備好的料當員工餐（不退錢、不算早上倒掉的）；後廚做的那張照片一起清掉
    function _unlist(id) {
        return _locked(async () => {
            const menu = await _getStrict(K_MENU, []);
            const m = menu.find(x => x.id === id);
            if (!m) return { ok: false };
            const stock = await _getStrict(K_STOCK, {});
            delete stock[id];
            await _set(K_MENU, menu.filter(x => x.id !== id));
            await _set(K_STOCK, stock);
            if (m.dish && m.dish.img) await _set(m.dish.img, '');
            return { ok: true };
        }).catch(e => { console.warn('[Cafe] 下架失敗', e); return { ok: false }; });
    }
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
            /* 📏 電腦上窗高固定（10-13：各分頁高度不一，不要再自適應高度）：以前最矮 520、最高八成二、中間照內容長短，
               切分頁窗口就一下高一下矮。現在每頁一樣高，內容多的在 .oc-body 裡捲。手機那份本來就是上下釘住（lobby.css），這裡讓回 auto */
            '.oc-win{position:absolute;right:max(2.2%,calc(50% - 410px));top:50%;transform:translateY(-50%);z-index:3350;width:420px;max-width:52%;height:min(720px,82%);display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(rgba(250,244,234,.975),rgba(247,237,222,.975)),repeating-linear-gradient(0deg,transparent 0 7px,rgba(112,76,42,.018) 8px);border:1px solid #cbb58f;border-radius:18px;color:#4a3828;font-size:13px;box-shadow:0 16px 42px rgba(69,46,27,.34),inset 0 0 0 3px rgba(255,255,255,.35);backdrop-filter:blur(8px);}' +
            '.oc-head{display:flex;align-items:center;gap:10px;padding:11px 13px;border-bottom:1px solid rgba(139,101,61,.18);background:rgba(255,252,245,.55);color:#65492f;}' +
            '.oc-brand{display:flex;align-items:center;gap:9px;min-width:0;}.oc-brand-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:#7a5230;color:#fff8ed;font-size:18px;box-shadow:0 3px 9px rgba(88,55,28,.18);}' +
            '.oc-sprite{display:inline-block;width:32px;height:32px;flex:none;background-image:url("' + CAFE_ITEM_SHEET + '");background-repeat:no-repeat;background-size:400% 300%;border-radius:7px;font-size:0;vertical-align:middle;}.oc-assets-missing .oc-sprite{display:inline-grid;place-items:center;background-image:none!important;color:inherit;font-size:18px;}' + _spritePosCss() +
            '.oc-brand-copy{display:flex;flex-direction:column;line-height:1.05;white-space:nowrap;}.oc-brand-copy b{font-size:15px;letter-spacing:.06em;}.oc-brand-copy small{margin-top:4px;color:#a18869;font-size:8px;letter-spacing:.18em;font-weight:700;}' +
            '.oc-head-stats{display:flex;gap:5px;margin-left:auto;}.oc-stat-pill{display:flex;align-items:center;gap:4px;padding:5px 7px;border:1px solid #dfceb2;border-radius:8px;background:rgba(255,255,255,.58);color:#816143;font-size:11px;white-space:nowrap;}.oc-stat-pill b{color:#5e4028;font-size:12px;}' +
            '.oc-head .oc-close{background:none;border:none;color:#765638;cursor:pointer;font-size:15px;padding:5px 6px;border-radius:8px;}.oc-head .oc-close:hover{background:rgba(122,82,48,.1);}' +
            '.oc-tabs{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:9px 12px 0;}' +
            '.oc-tab{min-width:0;background:rgba(255,255,255,.45);border:1px solid #dcc9aa;color:#735437;border-radius:8px;padding:6px 2px;cursor:pointer;font-size:10px;white-space:nowrap;}.oc-tab i{display:block;margin-bottom:3px;font-size:12px;}' +
            '.oc-tab.on{background:#8a5c34;border-color:#8a5c34;color:#fff8ed;font-weight:700;box-shadow:0 3px 8px rgba(105,67,35,.18);}' +
            '.oc-tab{position:relative;}.oc-tab.has-dot:after{content:"";position:absolute;top:4px;right:6px;width:7px;height:7px;border-radius:50%;background:#c4573f;box-shadow:0 0 0 2px rgba(255,250,240,.9);}' +
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
            // 🏡 跟鄰居收貨（11-23 進貨單）
            '.oc-nb-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;margin:0 0 6px;border:1px solid #e5d3b8;border-radius:10px;background:rgba(255,255,255,.55);font-size:12px;color:#5a4634;line-height:1.5;}.oc-nb-item small{display:block;color:#a0784c;font-size:11px;}' +
            '.oc-nb-btns{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0;}.oc-mini-btn{min-height:36px;padding:4px 10px;border-radius:8px;border:1px solid #8a5c34;background:#8a5c34;color:#fff8ed;font-size:12px;font-weight:700;cursor:pointer;}.oc-mini-btn.ghost{background:transparent;color:#7a4f2d;border-color:#d8c3a1;}.oc-mini-btn:disabled{opacity:.5;cursor:default;}' +
            '.oc-buy{margin:0 0 10px;padding:0 0 8px;border-bottom:1px dashed #e5d3b8;}.oc-buy-head{font-size:12px;color:#5a4634;line-height:1.5;margin:0 0 6px;}.oc-buy-head small{display:block;color:#a0784c;font-size:11px;}' +
            '.oc-buy-list{margin:0 0 6px;padding-left:18px;font-size:12px;color:#5a4634;line-height:1.7;}.oc-buy-btns{justify-content:flex-start;}' +
            '.oc-buy-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,76px) minmax(0,86px) 36px;gap:6px;align-items:center;margin:0 0 6px;}' +
            '.oc-buy-row select,.oc-buy-row input{width:100%;min-width:0;max-width:100%;min-height:36px;box-sizing:border-box;padding:4px 6px;border:1px solid #d8c3a1;border-radius:8px;background:#fffaf2;color:#5a4634;font-size:13px;}' +
            '.oc-buy-row label{display:flex;align-items:center;gap:3px;min-width:0;font-size:12px;color:#7a5a35;}.oc-buy-row .oc-mini-btn{padding:4px 0;}' +
            '.oc-nb-empty{font-size:12px;color:#8a6a4a;padding:6px 2px;line-height:1.6;}@media (max-width:760px){.oc-nb-item{flex-direction:column;align-items:stretch;}.oc-nb-btns{justify-content:flex-start;}}' +
            '.oc-chips{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;}.oc-chips.three{grid-template-columns:repeat(3,minmax(0,1fr));}' +
            '.oc-chip{min-width:0;background:rgba(255,255,255,.58);border:1px solid #d8c3a1;color:#5a4634;border-radius:10px;padding:6px 3px;cursor:pointer;font-size:10px;line-height:1.25;}.oc-chip .oc-ing-icon{display:block;width:34px;height:34px;margin:0 auto 3px;}' +
            '.oc-chip.on{background:#f2dfc6;border-color:#b77b42;color:#674224;font-weight:700;box-shadow:inset 0 0 0 1px rgba(183,123,66,.15);}' +
            '.oc-brew,.oc-action{width:100%;margin-top:12px;background:#7a4f2d;border:1px solid #6d4425;color:#fff8ed;font-weight:800;border-radius:11px;padding:10px 0;cursor:pointer;font-size:12px;box-shadow:0 4px 9px rgba(92,55,27,.16);}.oc-brew:disabled,.oc-action:disabled{opacity:.42;cursor:default;box-shadow:none;}' +
            '.oc-result{margin-top:10px;border:1px solid #d8c6a8;border-radius:11px;padding:10px 12px;background:rgba(255,252,246,.72);}.oc-result .oc-note{color:#8a7358;font-size:11px;margin-top:4px;line-height:1.5;}' +
            '.oc-shelf{width:100%;margin-top:8px;background:rgba(78,139,87,.12);border:1px solid #7cae85;color:#3c6b44;font-weight:700;border-radius:10px;padding:8px 0;cursor:pointer;font-size:12px;}.oc-shelf:disabled{opacity:.5;cursor:default;}' +
            '.oc-tried{display:flex;justify-content:space-between;color:#a18a70;font-size:10px;margin-top:7px;}.oc-progress-line{height:4px;margin-top:5px;border-radius:5px;background:#eadcc8;overflow:hidden;}.oc-progress-line i{display:block;height:100%;background:#bd854c;border-radius:5px;}' +
            '.oc-sym-grid{display:flex;flex-wrap:wrap;gap:6px;max-height:195px;overflow-y:auto;padding-right:2px;}.oc-sym{width:37px;height:37px;font-size:17px;background:rgba(255,255,255,.6);border:1px solid #d3bf9f;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;}.oc-sym.on{background:rgba(214,158,84,.3);border-color:#a9744a;}' +
            '.oc-free-input{width:100%;box-sizing:border-box;margin-top:10px;background:rgba(255,255,255,.75);border:1px solid #d3bf9f;border-radius:9px;color:#4a3a2a;padding:8px 10px;font-size:11px;}.oc-free-input::placeholder{color:#a3906f;}' +
            /* 💰 經營：今天的數字、庫存與備料、研發倒數、賣完沒點到 */
            '.oc-today{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0 1px 9px;padding:7px 10px;border-radius:9px;background:rgba(186,134,79,.1);color:#7a5a3c;font-size:11px;}.oc-today b{color:#5e4028;font-size:12px;}' +
            '.oc-menu-ops{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding-top:7px;border-top:1px dashed rgba(160,120,80,.25);}' +
            '.oc-stock{color:#7a5a3c;font-size:11px;}.oc-stock b{color:#4f3520;font-size:13px;}.oc-stock.zero b{color:#b65050;}.oc-stock-next{color:#a18465;}.oc-stock-next b{color:#7a5a3c;}' +
            '.oc-make{margin-left:auto;background:rgba(122,79,45,.08);border:1px solid #c9a476;color:#6d4425;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:11px;font-weight:700;}.oc-make.on{background:#7a4f2d;border-color:#6d4425;color:#fff8ed;}' +
            '.oc-mini-tag.oc-home-tag{color:#3f7448;background:#e6f3e0;}.oc-home-line{display:block;margin-top:6px;font-size:11px;color:#3f7448;line-height:1.5;}' +
            '.oc-unlist{margin-left:6px;background:none;border:1px solid #dcc7a6;color:#9a7a5a;border-radius:8px;padding:5px 9px;cursor:pointer;font-size:11px;}.oc-unlist:hover{background:rgba(182,80,80,.08);color:#b65050;border-color:#d99;}.oc-unlist:disabled{opacity:.5;cursor:default;}' +
            '.oc-batch{grid-column:1/-1;display:flex;flex-direction:column;gap:7px;}' +
            '.oc-batch-nums{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px;}' +
            '.oc-num{min-width:0;background:rgba(255,255,255,.72);border:1px solid #d8c3a1;border-radius:7px;padding:6px 0;cursor:pointer;color:#5a4634;font-size:12px;font-weight:700;}.oc-num.on{background:#f2dfc6;border-color:#b77b42;color:#674224;}.oc-num:disabled{opacity:.35;cursor:default;}' +
            '.oc-batch-row{display:flex;align-items:center;gap:8px;}.oc-batch-cost{flex:1;color:#7a5a3c;font-size:11px;line-height:1.4;}' +
            '.oc-batch-go{background:#7a4f2d;border:1px solid #6d4425;color:#fff8ed;border-radius:8px;padding:6px 16px;cursor:pointer;font-size:12px;font-weight:800;}.oc-batch-go:disabled{opacity:.42;cursor:default;}' +
            '.oc-order{background:rgba(122,79,45,.08);border:1px solid #c9a476;color:#6d4425;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:11px;font-weight:700;}.oc-order.on{background:#7a4f2d;border-color:#6d4425;color:#fff8ed;}.oc-order:disabled{opacity:.4;cursor:default;}' +
            '.oc-who-list{display:flex;flex-wrap:wrap;gap:5px;}' +
            '.oc-who{background:rgba(255,255,255,.72);border:1px solid #d8c3a1;border-radius:14px;padding:5px 11px;cursor:pointer;color:#5a4634;font-size:12px;font-weight:700;}.oc-who.on{background:#f2dfc6;border-color:#b77b42;color:#674224;}' +
            '.oc-order-note{box-sizing:border-box;width:100%;min-width:0;background:rgba(255,255,255,.72);border:1px solid #d8c3a1;border-radius:8px;padding:6px 9px;color:#5a4634;font-size:12px;}' +
            '.oc-why{color:#b65050;font-size:11px;line-height:1.5;margin-top:6px;}' +
            '.oc-rd{margin:2px 0 6px;padding:10px 12px;border:1px dashed #c9a476;border-radius:11px;background:rgba(255,248,236,.85);}' +
            '.oc-rd-title{display:flex;align-items:center;gap:6px;font-weight:800;color:#6d4425;}.oc-rd-left{display:block;margin-top:4px;color:#9d6638;font-weight:700;font-size:12px;}' +
            '.oc-locked{opacity:.45;pointer-events:none;}' +
            '.oc-cost-note{margin-top:6px;color:#a18465;font-size:10px;line-height:1.5;text-align:center;}' +
            '.oc-item.miss{background:rgba(240,232,222,.45);border-style:dashed;}.oc-item.miss .oc-blurb{color:#a58b70;}' +
            '.oc-g-type{margin-left:5px;padding:1px 6px;border-radius:8px;background:#efe3d2;color:#896b4d;font-size:9px;font-style:normal;font-weight:400;vertical-align:1px;}' +
            '@media (max-width:760px){.oc-win{right:10px;left:10px;width:auto;max-width:none;height:auto;max-height:76%;min-height:min(500px,72%);}.oc-brand-copy{display:none}.oc-stat-pill{padding:4px 5px}.oc-tab{font-size:12px;min-height:44px;padding:5px 2px}.oc-tab i{font-size:13px;margin-bottom:2px}.oc-mini-tag{font-size:11px;padding:2px 7px}.void-dock-open #iris-avatar{opacity:.22;filter:brightness(.55) blur(1px);transition:opacity .25s;}}';
        doc.head.appendChild(st);
        try {
            const probe = new win.Image();
            probe.onload = () => doc.documentElement.classList.remove('oc-assets-missing');
            probe.onerror = () => doc.documentElement.classList.add('oc-assets-missing');
            probe.src = CAFE_ITEM_SHEET;
        } catch (e) { doc.documentElement.classList.add('oc-assets-missing'); }
    }

    let _winEl = null;
    async function _refreshHeaderStats() {
        if (!_winEl) return;
        const [shop, fund] = await Promise.all([getShop(), _fundOrNull()]);
        if (!_winEl) return;
        const put = (k, v) => { const el = _winEl.querySelector('[data-cafe-stat="' + k + '"]'); if (el) el.textContent = v; };
        put('pop', String(shop.popularity || 0));
        put('coins', fund ? String(fund.coins) : '—');
        put('sta', fund ? fund.stamina + '/' + CAFE_CFG.fund.staminaMax : '—');
    }
    // 研發分頁的小紅點：改版前調配的那杯時間到了、她還沒打開看
    function _paintLabDot() {
        if (!_winEl) return;
        _get(K_RD, null).then(rd => { _winEl?.querySelector('.oc-tab[data-tab="kitchen"]')?.classList.toggle('has-dot', !!(rd && rd.doneAt <= Date.now())); }).catch(() => {});
    }
    // 窗開著每分鐘補算一次：客人照時間進來、庫存跟著少、研發倒數會走
    let _tickTimer = null;
    async function _tickOnce() {
        let changed = false;
        try { changed = await _settle(); } catch (e) {}
        if (!_winEl) return;
        _refreshHeaderStats();
        _paintLabDot();
        const on = _winEl.querySelector('.oc-tab.on');
        const tab = on ? on.dataset.tab : 'menu';
        const body = _winEl.querySelector('.oc-body');
        _paintCrewDot();
        if (tab === 'kitchen') return;   // 研發台正在擺料，不重畫
        if (tab === 'crew') { if (!_busy()) _renderTab('crew', body); return; }   // 員工頁：啟事倒數、上班中／下班了每分鐘會變；面試、打電話中不重畫
        if (changed && (tab === 'menu' || tab === 'log') && !_winEl.querySelector('.oc-batch')) _renderTab(tab, body);   // 正在挑份數就別重畫
    }
    async function _saveSaid(id, said) {
        const cur = await _getStrict(K_LOG, []);
        const x = cur.find(v => v && v.id === id);
        if (!x) return false;
        x.said = said;
        await _set(K_LOG, cur);
        return true;
    }
    // 店員頁上的小紅點:店員上完一班、她還沒看
    function _paintStaffDot() {
        if (!_winEl) return;
        _get('staff', null).then(st => { _winEl?.querySelector('.oc-tab[data-tab="staff"]')?.classList.toggle('has-dot', !!(st && st.unread)); }).catch(() => {});
    }
    // 員工頁上的小紅點：有新日記、或應徵者到了
    function _paintCrewDot() {
        if (!_winEl) return;
        const H = win.OS_CAFE_HIRE || window.OS_CAFE_HIRE;
        if (!H || !H.hasNews) return;
        H.hasNews().then(on => { _winEl?.querySelector('.oc-tab[data-tab="crew"]')?.classList.toggle('has-dot', !!on); }).catch(() => {});
    }
    // 正在操作、別重畫：挑份數、面試、打電話
    function _busy() { return !!(_winEl && _winEl.querySelector('.oc-batch, .och-iv, .och-call')); }
    // 直接開到某一頁(舞台上點店員＝開櫃台窗到店員頁)
    async function _openTab(tab) {
        if (!_winEl) await openWorkshop();
        const t = _winEl?.querySelector('.oc-tab[data-tab="' + tab + '"]');
        if (t) t.click();
    }
    function closeWorkshop() {
        if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
        try { (win.OS_CAFE_HIRE || window.OS_CAFE_HIRE)?.leave?.(); } catch (e) {}   // 下次打開回員工頁列表，不卡在面試裡
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
                '<span class="oc-stat-pill"><i class="fa-solid fa-coins"></i> 帳戶 <b data-cafe-stat="coins">—</b> 元</span>' +
                '<span class="oc-stat-pill"><i class="fa-solid fa-bolt"></i> 體力 <b data-cafe-stat="sta">—</b></span>' +
                '<span class="oc-stat-pill"><i class="fa-solid fa-heart"></i> 人氣 <b data-cafe-stat="pop">0</b></span>' +
              '</div>' +
              '<button class="oc-close" title="關閉"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="oc-tabs">' +
              '<button class="oc-tab on" data-tab="menu"><i class="fa-solid fa-receipt"></i>菜單</button>' +
              '<button class="oc-tab" data-tab="kitchen"><i class="fa-solid fa-kitchen-set"></i>研發</button>' +   // 研發＝後廚門口（os_cafe_kitchen.js，按「進後廚」開全螢幕窗口）
              '<button class="oc-tab" data-tab="books"><i class="fa-solid fa-book-open"></i>書單</button>' +
              '<button class="oc-tab" data-tab="log"><i class="fa-solid fa-users"></i>訪客</button>' +
              '<button class="oc-tab" data-tab="staff"><i class="fa-solid fa-bell-concierge"></i>值班</button>' +   // 店員：挑人、排時間、值班紀錄（10-08 取代點單小遊戲）
              '<button class="oc-tab" data-tab="crew"><i class="fa-solid fa-id-card"></i>員工</button>' +   // 雇來的早班／晚班、徵人、面試（10-13，os_cafe_hire.js）
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
            try { (win.OS_CAFE_HIRE || window.OS_CAFE_HIRE)?.leave?.(); } catch (e) {}   // 換頁＝離開面試（回來看到員工頁列表）
            box.querySelector('.och-call')?.remove();
            _renderTab(t.dataset.tab, body);
        }));
        _renderTab('menu', body);
        _refreshHeaderStats();
        _paintStaffDot();
        _paintLabDot();
        _paintCrewDot();
        // ☕ 開窗=補算離線天數(有新動靜就刷新當前頁;背景跑不擋開窗)
        _settle().then(changed => neighborSync().then(nb => {
            const nbEl = _winEl && _winEl.querySelector('.ock-nb');   // 研發頁開著：進貨單那塊補畫（研發頁不整頁重畫）
            if (nbEl) renderNeighborOffers(nbEl);
            return changed || !!(nb && nb.changed);
        }).catch(() => changed)).then(changed => {   // 算完客人再收宿舍住戶的點餐、更新菜單快照（11-23）
            if (!changed || !_winEl) return;
            const on = _winEl.querySelector('.oc-tab.on');
            _refreshHeaderStats();
            const tab = on ? on.dataset.tab : 'menu';
            _paintCrewDot();
            if (tab !== 'kitchen' && !_busy()) _renderTab(tab, _winEl.querySelector('.oc-body'));   // 調配、創想、挑份數、面試正在操作，別重畫
        }).catch(() => {});
        _tickTimer = setInterval(_tickOnce, 60000);
    }

    async function _renderTab(tab, body) {
        if (tab === 'menu') {
            const [menu, shop, fund, stock, logs] = await Promise.all([getMenu(), getShop(), _fundOrNull(), _get(K_STOCK, {}), _get(K_LOG, [])]);
            const nowTs = Date.now(), today = _dayNum(nowTs), nowMin = _minOf(nowTs);
            const tl = logs.filter(l => l && l.day === today && !l.ev);
            const waste = fund && fund.lastWaste && fund.lastWaste.day === today ? fund.lastWaste : null;
            body.innerHTML = '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-mug-hot"></i> 今日菜單</span><span class="oc-section-note">' + menu.length + ' 款・累計 ' + (shop.revenue || 0) + ' PT</span></div>' +
                '<div class="oc-today"><span>今天賣出 <b>' + tl.filter(l => l.price).length + '</b> 杯</span>' +
                '<span>想點的沒料了 <b>' + tl.filter(l => l.want).length + '</b> 位</span>' +
                '<span>今早倒掉的料 <b>' + (waste ? waste.qty : 0) + '</b> 份' + (waste && waste.cost ? '（白花 ' + waste.cost + '）' : '') + '</span></div>' + (menu.length
                ? menu.map(m => {
                    const iconId = (m.ings || []).find(id => SPRITE_POS[id]) || (m.free ? 'receipt' : 'coffee');
                    const left = _stockNow(stock, m.id, today, nowMin), next = _stockNext(stock, m.id, today, nowMin);
                    const K = m.dish && (win.OS_CAFE_KITCHEN || window.OS_CAFE_KITCHEN);
                    return '<div class="oc-menu-card" data-id="' + _esc(m.id) + '"><span class="oc-drink-icon">' + (K && K.thumb ? K.thumb(m.dish) : _sprite(iconId)) + '</span>' +
                    '<span class="oc-menu-main"><span class="oc-menu-title">' + _esc(m.name) + '</span><span class="oc-blurb">' + _esc(m.blurb || '') + '</span>' +
                    '<span class="oc-mini-tags">' + (m.garden ? '<i class="oc-mini-tag oc-home-tag"><i class="fa-solid fa-seedling"></i> 自家後院</i>' : '') + (m.tags || []).map(t => '<i class="oc-mini-tag">' + _esc(t) + '</i>').join('') + '</span></span>' +
                    '<span class="oc-menu-side"><span class="oc-badge ' + (TIER_TEXT[m.tier]?.cls || 'a') + '">' + (TIER_TEXT[m.tier]?.label || '') + '</span>' +
                    '<span class="oc-menu-price">' + m.price + ' PT</span><span class="oc-menu-sold">售出 ' + (m.sold || 0) + '</span></span>' +
                    '<span class="oc-menu-ops"><span class="oc-stock' + (left ? '' : ' zero') + '">現在有料 <b>' + left + '</b> 份</span>' +
                    (next ? '<span class="oc-stock oc-stock-next">等開店 <b>' + next + '</b> 份</span>' : '') +
                    '<button class="oc-make" data-id="' + _esc(m.id) + '"><i class="fa-solid fa-basket-shopping"></i> 備料</button>' +
                    '<button class="oc-order" data-id="' + _esc(m.id) + '"' + (left ? '' : ' disabled') + '><i class="fa-solid fa-gift"></i> 點一份</button>' +
                    '<button class="oc-unlist" data-id="' + _esc(m.id) + '"><i class="fa-solid fa-box-archive"></i> 下架</button></span></div>';
                }).join('')
                : '<div class="oc-empty"><i class="fa-solid fa-mug-hot"></i>菜單還是空的。<br>先到「研發」進後廚做一道，再上架吧。</div>');
            // 🗑 下架：先問，有備好的料要講會當員工餐
            body.querySelectorAll('.oc-unlist').forEach(btn => btn.addEventListener('click', async () => {
                const m = menu.find(x => x.id === btn.dataset.id);
                if (!m) return;
                const A = win.AUI || window.AUI;
                const have = _stockNow(stock, m.id, today, nowMin) + _stockNext(stock, m.id, today, nowMin);
                const yes = A && A.confirm ? await A.confirm('「' + m.name + '」下架後，客人就點不到了。' + (have ? '已經備好的 ' + have + ' 份當員工餐，不退錢。' : '') + '之後想再賣，回後廚做一次再上架。', { title: '下架「' + m.name + '」', okText: '下架' }) : false;
                if (!yes) return;
                btn.disabled = true;
                const r = await _unlist(m.id);
                if (!r.ok) { btn.disabled = false; if (A && A.toast) A.toast('下架沒成功，等一下再試', { type: 'warn' }); return; }
                if (A && A.toast) A.toast('「' + m.name + '」下架了', { type: 'success' });
                _renderTab('menu', body);
            }));
            // 🧺 備料：點了展開 1～8 份，選好看花多少，按「備」才扣；🎁 點一份：展開挑送給誰（同一個位置，一次只開一個）
            const toggle = (btn, kind, open) => {
                const card = btn.closest('.oc-menu-card');
                const was = card.querySelector('.oc-batch[data-kind="' + kind + '"]');
                body.querySelectorAll('.oc-batch').forEach(x => x.remove());
                body.querySelectorAll('.oc-make.on, .oc-order.on').forEach(x => x.classList.remove('on'));
                if (was) return;   // 再按一次＝收起來
                const m = menu.find(x => x.id === btn.dataset.id);
                if (!m) return;
                btn.classList.add('on');
                open(card, m);
            };
            body.querySelectorAll('.oc-make').forEach(btn => btn.addEventListener('click', () => toggle(btn, 'make', _openBatch)));
            body.querySelectorAll('.oc-order').forEach(btn => btn.addEventListener('click', () => toggle(btn, 'order', _openOrder)));
        } else if (tab === 'log') {
            let logs = await _get(K_LOG, []);
            if (logs.some(l => !l.id)) { logs.forEach(l => { if (!l.id) l.id = _mkId(); }); await _set(K_LOG, logs); }   // 舊紀錄補id
            // 畫的時候照日子、時間由新到舊排（存的順序是寫進來的先後，事件卡、補記的舊日子會插在中間，VER-1122 #8）；同一天同時間的照原本順序
            logs = logs.map((l, i) => [l, i]).sort((a, b) => ((b[0].day || 0) - (a[0].day || 0)) || ((b[0].t != null ? b[0].t : -1) - (a[0].t != null ? a[0].t : -1)) || (a[1] - b[1])).map(x => x[0]);
            const md = (d) => { const t = new Date(d * DAY_MS); return (t.getMonth() + 1) + '/' + t.getDate(); };
            const REG = _REG();
            const typeTag = (l) => { const ty = l.g && REG && REG.TYPES[l.g]; return ty ? '<i class="oc-g-type">' + ty.label + '</i>' : ''; };
            body.innerHTML = '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-users"></i> 訪客手札</span><span class="oc-section-note">最近 ' + logs.length + ' 筆</span></div>' + (logs.length
                ? logs.map(l => {
                    if (l.ev) {   // 🎬 事件卡:角色親口說的,直接攤開
                        return '<div class="oc-item ev"><span><span class="oc-name"><i class="fa-solid fa-star"></i> ' + md(l.day) + '・' + _esc(l.name) + typeTag(l) + '・' + (EV_LABEL[l.ev] || '') + (l.item ? '「' + _esc(l.item) + '」' : '') + '</span>' +
                            '<span class="oc-said">「' + _esc(l.line) + '」</span></span></div>';
                    }
                    // 常客照腳本跑、沒有人設，不給「聽他說」(不叫模型)
                    const hear = !!l.key && !l.g;
                    return '<div class="oc-item' + (hear ? ' oc-click' : '') + (l.miss ? ' miss' : '') + '" data-id="' + _esc(l.id) + '"><span><span class="oc-name">' + md(l.day) + (l.t != null ? ' ' + _hm(l.t) : '') + '・' + _esc(l.name) + typeTag(l) + '</span>' +
                        '<span class="oc-blurb">' + _esc(l.line) + '</span>' +
                        (l.said ? '<span class="oc-said">「' + _esc(l.said) + '」</span>' : '') + '</span>' +
                        '<span class="oc-price">' + (l.price ? '+' + l.price + ' PT ' : '') +
                        (hear ? '<i class="fa-solid fa-comment-dots oc-hear' + (l.said ? ' has' : '') + '"></i>' : '') + '</span></div>';
                }).join('')
                : '<div class="oc-empty"><i class="fa-solid fa-door-open"></i>還沒有客人來過。<br>上架點好東西，常客們就會自己上門了。</div>');
            // 🎧 點一筆=請那位客人親口說(一筆只燒一次,說過的存起來、再點只是收合/展開)
            body.querySelectorAll('.oc-click').forEach(el => el.addEventListener('click', async () => {
                const id = el.dataset.id;
                const cur = await _get(K_LOG, []);
                const l = cur.find(x => x.id === id);
                if (!l || !l.key) return;
                const old = el.querySelector('.oc-said');
                if (l.said) { if (old) old.remove(); else el.querySelector('.oc-blurb')?.insertAdjacentHTML('afterend', '<span class="oc-said">「' + _esc(l.said) + '」</span>'); return; }
                if (el.querySelector('.oc-loading')) return;
                el.querySelector('.oc-blurb')?.insertAdjacentHTML('afterend', '<span class="oc-said oc-loading">他想了想…</span>');
                const said = await _hearNpc(l);
                const loading = el.querySelector('.oc-loading');
                if (!said) { if (loading) loading.textContent = '他沒搭理你,再點一次試試。'; return; }
                l.said = said;
                await _saveSaid(id, said);   // 等模型這幾秒,店員可能剛標完處理過、結算可能剛放出客人:疊在最新的那份上只改這一筆
                if (loading) { loading.classList.remove('oc-loading'); loading.textContent = '「' + said + '」'; }
                el.querySelector('.oc-hear')?.classList.add('has');
            }));
        } else if (tab === 'books') {
            const books = await getBooks();
            body.innerHTML = '<div class="oc-section-head"><span class="oc-section-title"><i class="fa-solid fa-book-open"></i> 客人書單</span><span class="oc-section-note">' + books.length + ' 本收藏</span></div>' + (books.length
                ? books.map(b =>
                    '<div class="oc-item"><span><span class="oc-name">《' + _esc(b.title) + '》</span>' +
                    '<span class="oc-blurb">' + (b.by ? _esc(b.by) + ':' : '') + _esc(b.note || '') + '</span></span></div>').join('')
                : '<div class="oc-empty"><i class="fa-solid fa-book"></i>書架還空著。<br>之後來店裡的客人，會留下他們推薦的書。</div>');
        } else if (tab === 'crew') {
            const H = win.OS_CAFE_HIRE || window.OS_CAFE_HIRE;
            if (H && H.renderTab) { await H.renderTab(body); _paintCrewDot(); _refreshHeaderStats(); }
            else body.innerHTML = '<div class="oc-empty"><i class="fa-solid fa-id-card"></i>員工頁還沒準備好，等一下再來看。</div>';
        } else if (tab === 'staff') {
            const S = win.OS_CAFE_STAFF || window.OS_CAFE_STAFF;
            if (S && S.renderTab) { await S.renderTab(body); _paintStaffDot(); }
            else body.innerHTML = '<div class="oc-empty"><i class="fa-solid fa-id-badge"></i>店員還沒準備好，等一下再來看。</div>';
        } else {
            // 🍳 研發＝後廚門口（os_cafe_kitchen.js；按「進後廚」開全螢幕後廚窗口）
            const K = win.OS_CAFE_KITCHEN || window.OS_CAFE_KITCHEN;
            if (K && K.render) { await K.render(body); _paintLabDot(); }
            else body.innerHTML = '<div class="oc-empty"><i class="fa-solid fa-kitchen-set"></i>研發台還沒準備好，等一下再來看。</div>';
        }
    }

    async function _openBatch(card, m) {
        const F = CAFE_CFG.fund;
        const fund = await _fundOrNull();
        const coins = fund ? fund.coins : 0, sta = fund ? fund.stamina : 0;
        const items = m.garden ? await getPantry().catch(() => ({})) : {};   // 書咖倉庫（後院送來的）
        const plan1 = _batchPlan(m, 1, items), unit = plan1.ok ? plan1.cost : _unitCost(m);
        let why = '';
        if (!fund) why = '讀不到書咖帳戶，等一下再試';
        else if (sta < F.batchStamina) why = '體力不夠（剩 ' + sta + '，備料一次要 ' + F.batchStamina + '），明天會回滿';
        else if (!plan1.ok) why = plan1.why + '：貼收購單跟宿舍的鄰居收（研發頁「跟鄰居收貨」）';
        else if (coins < unit) why = '錢不夠（一份料要 ' + unit + ' 元，帳戶剩 ' + coins + ' 元）';
        const at = _nextOpen(Date.now());
        const when = at.day === _dayNum(Date.now()) ? '今天 9 點開店上架' : '明天 9 點開店上架';
        const homeText = (use) => Object.keys(use || {}).map(id => (FARM_NAME[id] || id) + ' ' + use[id]).join('、');
        const nums = [];
        for (let n = 1; n <= F.batchMax; n++) { const pl = _batchPlan(m, n, items); nums.push('<button class="oc-num" data-n="' + n + '"' + (why || !pl.ok || pl.cost > coins ? ' disabled' : '') + '>' + n + '</button>'); }
        const gLine = m.garden ? '<span class="oc-home-line"><i class="fa-solid fa-seedling"></i> 每份用後院的 ' + Object.keys(m.garden).map(id => (FARM_NAME[id] || id) + ' ' + m.garden[id].u + (m.garden[id].c ? '（沒有就用買的）' : '')).join('、') +
            '；倉庫 ' + (Object.keys(m.garden).map(id => (FARM_NAME[id] || id) + ' ' + (items[id] ? items[id].n : 0)).join('、')) + '</span>' : '';
        card.insertAdjacentHTML('beforeend',
            '<span class="oc-batch" data-kind="make">' +
              '<span class="oc-batch-nums">' + nums.join('') + '</span>' +
              '<span class="oc-batch-row"><span class="oc-batch-cost">' + (why ? '' : '要備幾份？一份料 ' + unit + '，備一次花 ' + F.batchStamina + ' 體力；' + when) + '</span>' +
              '<button class="oc-batch-go" disabled>備</button></span>' +
              gLine + (why ? '<span class="oc-why">' + why + '</span>' : '') +
            '</span>');
        const box = card.querySelector('.oc-batch');
        const go = box.querySelector('.oc-batch-go');
        const cost = box.querySelector('.oc-batch-cost');
        let pick = 0;
        box.querySelector('.oc-batch-nums').addEventListener('click', (e) => {
            const b = e.target.closest('.oc-num');
            if (!b || b.disabled) return;
            pick = Number(b.dataset.n);
            box.querySelectorAll('.oc-num').forEach(x => x.classList.toggle('on', x === b));
            const pl = _batchPlan(m, pick, items), ht = homeText(pl.use);
            cost.textContent = '備 ' + pick + ' 份：材料 ' + pl.cost + (ht ? '（用自家的 ' + ht + (pl.save ? '，省 ' + pl.save : '') + '）' : '') + '，體力 ' + F.batchStamina + '；' + when;
            go.disabled = false;
        });
        go.addEventListener('click', async () => {
            if (!pick) return;
            go.disabled = true;
            const r = await makeBatch(m.id, pick);
            if (!r.ok) {
                box.querySelector('.oc-why')?.remove();
                box.insertAdjacentHTML('beforeend', '<span class="oc-why">' + r.why + '</span>');
                return;
            }
            _refreshHeaderStats();
            if (_winEl) _renderTab('menu', _winEl.querySelector('.oc-body'));
        });
    }
    // 🎁 點一份送人：挑大廳書咖裡現在有誰、可以附一句話，按「點餐」扣 PT、店員端過去（lobby_cafe_regulars.js）
    async function _openOrder(card, m) {
        const LCR = window.LobbyCafeRegulars || (win.LobbyCafeRegulars);
        const who = LCR && LCR.targets ? LCR.targets() : [];
        const PT = win.OS_PT || window.OS_PT;
        let bal = null;
        try { bal = PT && PT.getPT ? Math.floor(await PT.getPT()) : null; } catch (e) {}
        let why = '';
        if (!who.length) why = '要人在大廳的書咖裡，才看得到能送給誰';
        else if (bal != null && bal < m.price) why = 'PT 不夠（要 ' + m.price + '，你有 ' + bal + '）';
        card.insertAdjacentHTML('beforeend',
            '<span class="oc-batch" data-kind="order">' +
              (who.length ? '<span class="oc-who-list">' + who.map(w => '<button class="oc-who" data-key="' + _esc(w.key) + '">' + _esc(w.name) + '</button>').join('') + '</span>' +
                '<input class="oc-order-note" type="text" maxlength="40" placeholder="想說的話（可以不寫）">' : '') +
              '<span class="oc-batch-row"><span class="oc-batch-cost">' + (why ? '' : '送給誰？一份 ' + m.price + ' PT' + (bal != null ? '，你有 ' + bal + ' PT' : '')) + '</span>' +
              '<button class="oc-batch-go" disabled>點餐</button></span>' +
              (why ? '<span class="oc-why">' + why + '</span>' : '') +
            '</span>');
        const box = card.querySelector('.oc-batch[data-kind="order"]');
        const go = box.querySelector('.oc-batch-go');
        let pick = null;
        box.querySelector('.oc-who-list')?.addEventListener('click', (e) => {
            const b = e.target.closest('.oc-who');
            if (!b || why) return;
            pick = who.find(w => w.key === b.dataset.key) || null;
            box.querySelectorAll('.oc-who').forEach(x => x.classList.toggle('on', x === b));
            go.disabled = !pick;
        });
        go.addEventListener('click', async () => {
            if (!pick) return;
            go.disabled = true;
            const note = (box.querySelector('.oc-order-note')?.value || '').trim();
            const r = await playerOrder(m.id);
            if (!r.ok) {
                box.querySelector('.oc-why')?.remove();
                box.insertAdjacentHTML('beforeend', '<span class="oc-why">' + _esc(r.why) + '</span>');
                go.disabled = false;
                return;
            }
            const sent = LCR && LCR.deliver ? LCR.deliver({ key: pick.key, item: r.item, note }) : false;
            const A = win.AUI || window.AUI;
            if (A && A.toast) A.toast(sent ? '點好了：「' + r.item + '」，店員會端去給' + pick.name : '點好了「' + r.item + '」，可是' + pick.name + '剛好不在，先放在櫃檯', { type: 'success' });
            _refreshHeaderStats();
            if (_winEl) _renderTab('menu', _winEl.querySelector('.oc-body'));
        });
    }

    // 結果卡(研發揭曉、試過的組合都用這張)：好的可以上架，上架起名照舊叫一次副模型
    async function _labResult(slot, key, tier, b, f, t) {
        const ings = [_ing('base', b), _ing('flavor', f), _ing('top', t)];
        const tags = _tagsOf(b, f, t);
        const T = TIER_TEXT[tier];
        const menu = await getMenu();
        const already = menu.some(m => m.key === key);
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
            shelfBtn.outerHTML = '<div class="oc-note"><i class="fa-solid fa-mug-hot"></i>「' + _esc(named.name) + '」上架了!到「菜單」頁看看。</div>';
        });
    }
    // 🧑‍🍳 給店員那支(os_cafe_staff.js)用的橋:同一份帳本、同一條結算
    function _refresh() {
        if (!_winEl) return;
        _refreshHeaderStats();
        _paintStaffDot();
        _paintLabDot();
        _paintCrewDot();
        const on = _winEl.querySelector('.oc-tab.on');
        const tab = on ? on.dataset.tab : 'menu';
        if (tab !== 'kitchen' && !_busy()) _renderTab(tab, _winEl.querySelector('.oc-body'));   // 調配、創想、挑份數、面試正在操作,別重畫
    }
    const _b = { get: _get, getStrict: _getStrict, set: _set, settle: _settle, settleQuiet: () => _settle({ quiet: true }), dayNum: _dayNum, hm: _hm, minOf: _minOf,
        stockNow: _stockNow, stockNext: _stockNext, avail: _avail, usable: _usable, nextOpen: _nextOpen, unitCost: _unitCost, mkId: _mkId, OPEN_MIN, CLOSE_MIN,
        tally: () => _get(K_TALLY, {}),
        locked: _locked, fundLoad: _fundLoad,   // 員工那支寫 staff2、扣帳戶（貼徵人啟事）跟結算同一條排隊；fundLoad 只能在 locked 裡面叫
        refreshStats: () => _refreshHeaderStats(),
        menu: getMenu, shop: getShop, roster: () => Promise.resolve(win.LobbyNpcs?.cafeRoster?.() || []), refresh: _refresh,
        isOpen: () => !!_winEl, openTab: _openTab, saveSaid: _saveSaid,
        labResult: _labResult, finishRd: _finishRdNow, prices: CAFE_CFG.prices, tierText: TIER_TEXT, esc: _esc };   // 研發台（os_cafe_kitchen.js）用
    win.OS_CAFE = window.OS_CAFE = { cleanShop, openWorkshop, closeWorkshop, getMenu, getBooks, getShop, addBook, getFund, withdrawFund, fundKeep: () => CAFE_CFG.fund.start, makeBatch, playerOrder, revealRd, cafeDev, collectFromFarm, getPantry, neighborSync, renderNeighborOffers, _settle, _b };   // _settle=console 診斷用
    console.log('[Cafe] 書咖經營系統就緒');
})();
