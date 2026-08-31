// ----------------------------------------------------------------
// [檔案] core/void/lobby_places.js — 🧭 地點清單（單一真相）＋ 立繪模式的地點面板
// 職責：所有「可以去的地方」只定義在這一份 PLACES。
//   舞台模式：lobby_stage 的快轉地圖（_openCityMap）讀這份畫 chip 與建築熱點。
//   立繪模式：沒有場景可以走，同一份改畫成一排按鈕，直接開該地點的面板。
//   → 新增一間店只寫一筆，兩邊自動都有。
//
// 🚨 為什麼獨立成檔而不是塞進 lobby_stage：
//   立繪模式時 lobby_stage 是「卸載」狀態（S.root/CFG 都是 null），
//   清單必須活在它的掛載狀態之外，否則不走路的人就拿不到地點。
//
// 🚨 為什麼要有這份：入口以前散在三處（快轉 chip、地圖熱點、各面板自己的鈕），
//   加一個地方就得記得改三處——占卜小屋上線時就漏過快轉鈕的白名單。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window;

    const _stage = () => win.LobbyStage || null;
    const _st404 = () => {
        try { return (win.VoidTerminal?.get404State?.()) || { unlocked: false }; }
        catch (e) { return { unlocked: false }; }
    };
    const _fire = (ev) => { try { win.dispatchEvent(new CustomEvent(ev)); } catch (e) {} };

    // ── 地點清單 ────────────────────────────────────────────────
    // id       場景 id 或邏輯 id
    // name     舞台（地圖）上的名字
    // flatName 立繪模式按鈕上的名字；沒給就用 name
    //          （差別在於：舞台上你是「去一個地方」，立繪模式你是「辦一件事」）
    // icon     Font Awesome（🚨圖標一律 FA、禁 emoji）
    // obj      廣場上對應建築的檔名片段 → 地圖熱點靠它認人
    // scene    舞台模式要跳的場景；沒給就不出現在地圖 chip
    // open()   直接開這個地點的面板（自己開浮窗）；沒給就不出現在立繪模式
    // openIn(c) 把面板畫進指定容器 → 地點視圖的「應用」窗格用這個。
    //          沒有的地方會退回 open() 開浮窗（之後逐個補，見 docs 的推廣順序）
    // when()   要不要顯示（鎖住/沒解鎖/沒蓋房就整顆收起來）
    // npc      這個地方的管理員 key（決定立繪是誰、對話跟誰講）；路人不在此列
    // bg       立繪模式的地點背景圖（平視版，放在 CDN）
    // ready()  這個面板現在開得起來嗎（模組載入了沒）
    //          🚨 一定要有：open 裡面全是 `?.`，模組沒載入時呼叫不會報錯也不會有反應，
    //             那顆鈕就變成「點了什麼都沒發生」的死鈕。寧可不顯示也不要給死鈕。
    const PLACES = [
        {
            id: 'cafe', name: '書咖', flatName: '書咖櫃檯', icon: 'fa-mug-hot', npc: 'ying', bg: 'lobby_pv_bg_cafe_v1.jpg',
            obj: 'book_cafe', scene: 'cafe',
            ready: () => !!win.OS_CAFE?.openWorkshop,
            open: () => win.OS_CAFE.openWorkshop(),
            openIn: (c) => _mountFloating(c, () => win.OS_CAFE.openWorkshop(), '.oc-win', () => win.OS_CAFE.closeWorkshop && win.OS_CAFE.closeWorkshop()),
        },
        {
            id: 'hall', name: '大廳', flatName: '世界門', icon: 'fa-globe', npc: 'alice', bg: 'lobby_pv_bg_hall_v1.jpg',
            obj: 'lobby_day', scene: 'hall',
            ready: () => !!win.OS_WORLDGATE?.openGate,
            open: () => win.OS_WORLDGATE.openGate(),
            openIn: (c) => _mountFloating(c, () => win.OS_WORLDGATE.openGate(), '.wg-win', () => win.OS_WORLDGATE.closeGate && win.OS_WORLDGATE.closeGate()),
        },
        {
            id: 'exchange', name: '交易所', icon: 'fa-right-left', npc: 'rabbit', bg: 'lobby_pv_bg_exchange_v1.jpg',
            scene: 'exchange',
            ready: () => !!win.OS_PT?.openExchange,
            open: () => win.OS_PT.openExchange(),
            openIn: (c) => _mountFloating(c, () => win.OS_PT.openExchange(), '#os-pt-shop-dock', () => win.OS_PT.closeExchange && win.OS_PT.closeExchange()),
        },
        {
            id: 'tarot', name: '占卜小屋', flatName: '占卜', icon: 'fa-moon', npc: 'zhiwei', bg: 'lobby_pv_bg_tarot_v1.jpg',
            obj: 'tarot_hut', scene: 'tarot',
            ready: () => !!(_stage()?.openTarotPanel || win.OS_TAROT?.launch),
            open: () => _stage().openTarotPanel(),
            openIn: (c) => _mountTarot(c),
        },
        {
            id: 'workshop', name: '奇想工坊', flatName: '造物工坊', icon: 'fa-hat-wizard', npc: 'hatter', bg: 'lobby_pv_bg_workshop_v1.jpg',
            obj: 'hatter_shop', scene: 'workshop',
            ready: () => !!(win.LobbyWorkshop?.ready?.()),
            open: () => _stage()?.openWorkshopPanel?.(),
            openIn: (c) => win.LobbyWorkshop.mount(c),   // 面板本來就吃容器，直接畫進窗格
        },
        {
            // 舞台上＝走進去擺家具的場景（要先有房子）；對話模式＝一張家的背景＋你請進來的看板娘（不必有房子）
            id: 'myhome', name: '我的家', icon: 'fa-house-chimney', bg: 'lobby_pv_bg_myhome_v1.jpg',
            obj: 'player_house',
            when: () => !!_stage()?.plotOccupied?.('player'),
            flatWhen: () => true,
            guest: () => _guestNpc(),
            open: () => _fire('lstage-open-myhome'),
            openIn: (c) => _mountHomeGuest(c),
        },
        {
            id: 'room404', name: '404', flatName: '黑市', icon: 'fa-ghost', npc: 'cheshire', bg: 'lobby_pv_bg_room404_v1.jpg',
            scene: 'room404',
            when: () => !!_st404().unlocked,
            ready: () => !!win.VoidTerminal?.enter404Room && !!win.VoidPanels?.openStore,
            open: () => win.VoidTerminal.enter404Room(),
            openIn: (c) => _mountFloating(c, () => win.VoidPanels.openStore(), '#store-panel-overlay', () => win.VoidPanels.closeStore && win.VoidPanels.closeStore()),
        },
        {
            // 廣場只有走路才有意義：立繪模式沒有「站在廣場上」這件事 → 不給 open
            id: 'city', name: '廣場', icon: 'fa-tree-city',
            scene: 'city',
            when: () => !_stage()?._b?.cityLocked?.(),
        },
    ];

    function list() {
        return PLACES.filter(p => {
            try {
                if (p.when && !p.when()) return false;
                if (p.ready && !p.ready()) return false;   // 模組沒載入→不給死鈕
                return true;
            } catch (e) { return false; }
        });
    }
    function get(id) { return PLACES.find(p => p.id === id) || null; }

    // ── 🏛 地點視圖（立繪模式的主畫面）──────────────────────────
    //   對話模式沒有場景可以走，所以「主頁」本身就是一個地點：
    //   背景是那個地方、左邊站它的管理員、右邊一排常駐的地點卡、底下是既有的對話框。
    //   🚨 地點卡是常駐的，不是按了「前往」才展開——Rae 2026-08-31：「我就是嫌前往還得展開」。
    //      所以 dock 那顆前往整顆拿掉了（舞台模式它跟右上的快轉地圖重複，對話模式它變成這排卡）。
    //   🚨 窗格「要嘛對話、要嘛應用」，不同時存在——同一個人一邊在面板裡講話、
    //      底下對話框也在講話＝很割裂。對話那半是把既有的 .void-dialogue-wrap 用 CSS
    //      搬進版位，不動 DOM、不另做一套聊天。
    const CDN = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@main/';
    const HOME_ID = 'hall';      // 主頁預設站的地方（愛麗絲＋視差大廳）
    let _view = null;            // 關掉整個視圖
    let _paint = null;           // 換到別的地點（不重建外殼）

    // 🔮 把塔羅畫進窗格：OS_TAROT.launch 本來就吃容器，只差它的 ❮ 返回鈕。
    //    那顆鈕寫死呼叫 PhoneSystem.goHome（它原本住手機殼裡）→ 暫借成「回主頁」，關掉時還原。
    //    面板內那顆本身也用 CSS 藏起來了（一頁只留一顆返回鈕），這裡的接線是保險。
    function _mountTarot(c) {
        const PS = win.PhoneSystem;
        const saved = PS ? PS.goHome : undefined;
        const back = () => { if (_paint) _paint(HOME_ID); };
        if (PS) PS.goHome = back; else win.PhoneSystem = { goHome: back, __pvShim: true };
        c._pvRestore = () => {
            if (PS) { if (saved === undefined) delete PS.goHome; else PS.goHome = saved; }
            else if (win.PhoneSystem && win.PhoneSystem.__pvShim) delete win.PhoneSystem;
        };
        win.OS_TAROT.launch(c);
    }

    // ── 🏠 我的家 · 看板娘 ──────────────────────────────────────
    //   我的家在舞台上是「走進去擺家具」的場景，那整套建立在小人有地板可以走；
    //   對話模式沒有地板，所以這裡是另一件事：一張家的背景，加一個你請進來站著的人。
    //   🚨 舞台那條一個字都不動——open() 照舊發 lstage-open-myhome，走進去擺家具是它的事。
    const GUEST_KEY = 'lobby_home_guest';

    function _guestGet() {
        try { const v = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null'); return (v && v.key) ? v : null; }
        catch (e) { return null; }
    }
    // 🚨 只存「是誰」，不存圖。頭像是 base64 大圖，寫進 localStorage 會啃掉全站共用的 5MB
    //    （這個專案為了同一件事壞過四次）。圖留在 IDB，這裡只放引用。
    function _guestSet(v) {
        try {
            if (v) localStorage.setItem(GUEST_KEY, JSON.stringify({ src: v.src, key: v.key, name: v.name }));
            else localStorage.removeItem(GUEST_KEY);
            return true;
        } catch (e) { console.warn('[LobbyPlaces] 看板娘存不下來', e); return false; }
    }

    // 目前請進來的那位 → 組成跟 staff 同形狀的對話對象（setTalkTarget 吃這個形狀）
    async function _guestNpc() {
        const g = _guestGet();
        if (!g) return null;
        if (g.src === 'staff') return win.LobbyNpcs?.staff?.(g.key) || null;
        let url = '';
        try { const v = await win.VN_Cache?.getRaw?.('avatar_cache', g.key); url = (v && v.url) || ''; } catch (e) {}
        return { key: 'home_guest_' + g.key, name: g.name || '客人', subTitle: '我的家 · 看板娘', portrait: url };
    }

    // 可以請誰：大廳的管理員 ＋ 這個故事裡出現過、而且有頭像的角色（自建的 OC 出場過就在裡面）
    async function _guestCandidates() {
        const out = (win.LobbyNpcs?.staffKeys?.() || []).map(k => {
            const s = win.LobbyNpcs.staff(k) || {};
            return { src: 'staff', key: k, name: s.name || k, sub: s.subTitle || '', portrait: s.portrait || '' };
        });
        try {
            const C = win.VN_Cache;
            if (C && C.getAllMeta) {
                const world = C.getCurrentWorld ? C.getCurrentWorld() : '';
                const all = (await C.getAllMeta('avatar_cache')) || [];
                all.filter(e => e.hasUrl && !e.isSprite && C.worldOf(e) === world)
                   .forEach(e => out.push({ src: 'cache', key: e.key, name: C.bareKeyOf(e), sub: '', portrait: '' }));
            }
        } catch (e) { console.warn('[LobbyPlaces] 讀角色名冊失敗', e); }
        return out;
    }

    // 看板娘面板：上面是現在站著的人，下面是可以請的人
    // 🚨 頭像逐張從 IDB 撈、面板關掉就停：一次把整庫 base64 塞進 DOM 是相簿當初 OOM 的原因。
    function _mountHomeGuest(c) {
        let alive = true;
        c._pvRestore = () => { alive = false; };

        const render = async () => {
            const cur = _guestGet();
            const cands = await _guestCandidates();
            if (!alive) return;
            c.innerHTML =
                '<div class="lb-guest">' +
                  '<div class="lb-guest-now">' +
                    (cur
                      ? '<span class="lb-guest-now-t">現在站在家裡的是 <b>' + cur.name + '</b></span>' +
                        '<button class="lb-guest-out" type="button">請他離開</button>'
                      : '<span class="lb-guest-now-t">家裡現在沒有人。挑一個請進來。</span>') +
                  '</div>' +
                  '<div class="lb-guest-grid">' +
                    cands.map(x =>
                      '<button class="lb-guest-c' + (cur && cur.src === x.src && cur.key === x.key ? ' is-cur' : '') + '"' +
                        ' type="button" data-src="' + x.src + '" data-key="' + String(x.key).replace(/"/g, '&quot;') + '"' +
                        ' data-name="' + String(x.name).replace(/"/g, '&quot;') + '">' +
                        '<span class="lb-guest-pic"' + (x.portrait ? ' style="background-image:url(' + x.portrait + ')"' : '') + '></span>' +
                        '<span class="lb-guest-n">' + x.name + '</span>' +
                      '</button>').join('') +
                  '</div>' +
                '</div>';

            // 故事角色的頭像在 IDB 裡，逐張撈上來（撈一張畫一張，關掉就停）
            (async () => {
                for (const x of cands) {
                    if (!alive) return;
                    if (x.src !== 'cache') continue;
                    let url = '';
                    try { const v = await win.VN_Cache.getRaw('avatar_cache', x.key); url = (v && v.url) || ''; } catch (e) {}
                    if (!alive || !url) continue;
                    const el = c.querySelector('.lb-guest-c[data-key="' + String(x.key).replace(/"/g, '\\"') + '"] .lb-guest-pic');
                    if (el) el.style.backgroundImage = 'url(' + url + ')';
                }
            })();
        };

        c.addEventListener('click', (e) => {
            const out = e.target.closest('.lb-guest-out');
            if (out) { _guestSet(null); if (_paint) _paint('myhome', 'app'); return; }
            const b = e.target.closest('.lb-guest-c');
            if (!b) return;
            const pick = { src: b.dataset.src, key: b.dataset.key, name: b.dataset.name };
            const same = (() => { const g = _guestGet(); return g && g.src === pick.src && g.key === pick.key; })();
            _guestSet(same ? null : pick);        // 再點一次同一個人＝請他離開（不用特地去按那顆）
            if (_paint) _paint('myhome', 'app');
        });

        render();
    }

    // 這個地點現在進得去嗎（沒解鎖／模組沒載入都算進不去）
    function _usable(p) {
        try {
            // flatWhen＝「對話模式進不進得去」。我的家在舞台要先有房子才走得進去，
            // 但對話模式只是一張背景＋看板娘，不該被房子擋住 → 兩邊的條件分開判。
            const gate = p.flatWhen || p.when;
            if (gate && !gate()) return false;
            if (p.ready && !p.ready()) return false;
            return typeof p.open === 'function';
        } catch (e) { return false; }
    }

    // 🚨 沒解鎖的地方照樣列出來、但鎖著：整顆消失＝玩家不知道以後有東西可以期待，
    //    而且清單長度會隨進度跳來跳去，肌肉記憶每次都要重學。
    //    廣場不列——它只有走路才有意義，立繪模式沒有「站在廣場上」這件事。
    // 這個地點現在站著誰。一般地點是固定的管理員；我的家是動態的——看你請了誰進來。
    function _npcMeta(p) {
        if (p.guest) { const g = _guestGet(); return g ? { name: g.name } : null; }
        return (win.LobbyNpcs && p.npc) ? win.LobbyNpcs.staff(p.npc) : null;
    }
    const _hasNpc = (p) => !!_npcMeta(p);
    function _cards() {
        return PLACES.filter(p => p.id !== 'city').map(p => ({
            p, on: _usable(p), npc: _npcMeta(p),
            // 我的家沒人的時候要明講，不然那行空白看起來像沒載出來
            emptyWho: p.guest ? '還沒有人' : '',
        }));
    }

    // 一張地點卡。withApp＝右半那顆「直接進去」的鈕：只有「當前區域」那張給，
    // 附近地點是兩欄格，每格再塞一顆箭頭會把四個字的地名擠掉尾字。
    // 去別的地方＝點那張卡（走過去），到了之後再用當前區域那顆箭頭進去。
    function _cardHtml(c, curId, withApp) {
        const p = c.p;
        const cls = 'lb-rail-card' + (p.id === curId ? ' is-cur' : '') + (c.on ? '' : ' is-off');
        return '<div class="' + cls + '" data-id="' + p.id + '">' +
            '<button class="lb-rail-main" type="button" data-go="talk"' + (c.on ? '' : ' disabled') + '>' +
                '<span class="lb-rail-ic"><i class="fa-solid ' + (c.on ? p.icon : 'fa-lock') + '"></i></span>' +
                '<span class="lb-rail-tx">' +
                    '<span class="lb-rail-t">' + p.name + '</span>' +
                    '<span class="lb-rail-who">' + (c.on ? ((c.npc && c.npc.name) || c.emptyWho || '　') : '尚未開放') + '</span>' +
                '</span>' +
            '</button>' +
            ((c.on && withApp) ? '<button class="lb-rail-app" type="button" data-go="app" title="' + (p.flatName || p.name) + '">' +
                '<i class="fa-solid fa-arrow-right-to-bracket"></i></button>' : '') +
        '</div>';
    }

    // 右欄分兩張卡：現在站在哪、旁邊有什麼。
    // 舊版是七張同尺寸的斜票疊成一直排 —— 那個排法高度跟項目數綁在一起，
    // 而畫面下緣還有對話框，項目一多最後一張就被壓在底下看不見。
    function _railHtml(curId) {
        const cards = _cards();
        const cur = cards.filter(c => c.p.id === curId)[0];
        const rest = cards.filter(c => c.p.id !== curId);
        return (cur ? '<div class="lb-rail-sec lb-rail-now">' +
                '<div class="lb-rail-hd">當前區域</div>' +
                _cardHtml(cur, curId, true) +
            '</div>' : '') +
            '<div class="lb-rail-sec lb-rail-near">' +
                '<div class="lb-rail-hd">附近地點</div>' +
                '<div class="lb-rail-grid">' + rest.map(c => _cardHtml(c, curId, false)).join('') + '</div>' +
            '</div>';
    }

    function closeView() { if (_view) { try { _view(); } catch (e) {} _view = null; } }

    // 對話模式的主頁：進來就站在預設地點，不必按任何東西
    function openHome() { return openView(HOME_ID); }

    function openView(id) {
        // 已經開著就地換一個地方，不要拆掉重建（重建會讓背景閃一下、對話框也跟著重掛）
        if (_view && _paint) { _paint(id); return null; }

        const host = document.querySelector('.lobby-left');
        if (!host) { const p0 = get(id); try { p0 && p0.open && p0.open(); } catch (e) {} return null; }   // 沒有大廳外殼就退回單開面板

        const box = document.createElement('div');
        box.className = 'lb-pv';
        box.innerHTML =
            '<div class="lb-pv-bg"></div>' +
            '<div class="lb-pv-hd">' +
              '<span class="lb-pv-title"></span>' +
              '<span class="lb-pv-sub"></span>' +
            '</div>' +
            '<img class="lb-pv-portrait" alt="">' +
            '<div class="lb-rail"></div>' +
            '<div class="lb-pv-pane"><button class="lb-pv-x" type="button" aria-label="收起"><i class="fa-solid fa-xmark"></i></button><div class="lb-pv-body"></div></div>';

        const bg      = box.querySelector('.lb-pv-bg');
        const titleEl = box.querySelector('.lb-pv-title');
        const subEl   = box.querySelector('.lb-pv-sub');
        const pimg    = box.querySelector('.lb-pv-portrait');
        const rail    = box.querySelector('.lb-rail');
        const body    = box.querySelector('.lb-pv-body');

        const restorePanel = () => {
            try { if (body._pvRestore) { body._pvRestore(); body._pvRestore = null; } } catch (e) {}
        };
        const talkOff = () => { try { win.LobbyStage?.endTalk?.(); } catch (e) {} };

        // 🧍 立繪大小依「圖片原生比例」自動決定，不必為了不同人準備不同資產：
        //    細長(比例≥1.7)＝全身站高貼底，下緣讓對話框蓋掉＝自然的半身效果；
        //    方(比例<1.7)＝本來就是半身(丹/雷伊 640x896)，放小一點、切口一樣藏進對話框。
        //    🚨 所以全身圖不用砍半——對話框本身就是裁刀。
        const sizePortrait = () => {
            const r = pimg.naturalWidth ? (pimg.naturalHeight / pimg.naturalWidth) : 0;
            if (r) pimg.classList.toggle('is-half', r < 1.7);
        };
        pimg.addEventListener('load', sizePortrait);

        let curId = null;
        let curNpc = null;      // 這個地點現在站著誰（我的家那位是非同步撈回來的）
        let paintTok = 0;       // 連點換地點時，晚回來的那張不准蓋掉新的

        // mode: 'talk' 對話 / 'app' 應用（兩者互斥，見檔頭）
        const go = (mode) => {
            restorePanel();
            body.innerHTML = '';
            box.classList.remove('is-talk', 'is-app');
            const p = get(curId);
            if (!p) return;
            if (mode === 'talk' && _hasNpc(p)) {
                box.classList.add('is-talk');
                // 對話對象＝這裡站著的人（管理員，或我的家請進來的那位）；
                // 沒有舞台也設得起來，void_terminal 讀的是 talkTarget
                try { if (curNpc) win.LobbyStage?.setTalkTarget?.(curNpc); } catch (e) {}
                try { win.LobbyStage?.showDialog?.(); } catch (e) {}
                return;
            }
            talkOff();
            box.classList.add('is-app');
            try {
                if (p.openIn) { p.openIn(body); return; }
                // 還沒改成吃容器的地方：照舊自己開浮窗，容器說明一下免得看起來像壞了
                body.innerHTML = '<div class="lb-pv-note">這個面板還是獨立視窗，已經幫你開了</div>';
                p.open && p.open();
            } catch (e) {
                body.innerHTML = '<div class="lb-pv-fail">這個面板現在打不開</div>';
                console.warn('[LobbyPlaces] 面板開啟失敗', curId, e);
            }
        };

        // 換到某個地點：背景／立繪／標題／卡片高亮一起換，外殼不動
        const paint = (nextId, mode) => {
            const p = get(nextId);
            // 🚨 這裡以前是靜靜 return：畫不出來時外殼留著、裡面全空＝整片黑，
            //    而且沒有任何線索說是誰擋的。要壞就要說得出是哪一關沒過。
            if (!p || !_usable(p)) {
                const gate = p && (p.flatWhen || p.when);
                const why = !p ? '沒有這個地點'
                    : (gate && !gate()) ? '還沒解鎖'
                    : (p.ready && !p.ready()) ? '面板模組還沒就緒'
                    : (typeof p.open !== 'function') ? '沒有可開的面板' : '未知';
                win.__LP_LASTFAIL__ = { id: nextId, why: why, at: Math.round(performance.now()) };
                console.warn('[LobbyPlaces] 畫不出「' + nextId + '」：' + why);
                return;
            }
            restorePanel(); talkOff();
            curId = nextId;
            const tok = ++paintTok;
            // 🚨 沒有平視背景的地方不要清成純黑：這裡以前是「開了就關」的浮層所以無所謂，
            //    現在它是常駐主畫面，切過去整片黑會讀成「壞掉了」。留著上一張，素材補上就自動換。
            if (p.bg) bg.style.backgroundImage = 'url(' + CDN + p.bg + ')';
            titleEl.textContent = p.name;
            // 🚨 顯示/隱藏走 class 不走 inline style（專案鐵律）；背景圖是動態 URL，只能直接設 backgroundImage
            const applyNpc = (npc) => {
                curNpc = npc || null;
                subEl.textContent = (npc && npc.subTitle) || '';
                if (npc && npc.portrait) {
                    box.classList.remove('no-portrait');
                    if (pimg.getAttribute('src') !== npc.portrait) pimg.src = npc.portrait; else sizePortrait();
                } else { box.classList.add('no-portrait'); pimg.removeAttribute('src'); }
            };
            applyNpc((win.LobbyNpcs && p.npc) ? win.LobbyNpcs.staff(p.npc) : null);
            // 我的家的看板娘：名字在 localStorage（同步，上面已經拿來決定要不要直接進對話），圖在 IDB（非同步）
            if (p.guest) {
                p.guest().then(g => {
                    if (tok !== paintTok) return;   // 已經換去別的地方了，晚到的這張不算數
                    applyNpc(g);
                    if (g && box.classList.contains('is-talk')) { try { win.LobbyStage?.setTalkTarget?.(g); } catch (e) {} }
                }).catch(() => {});
            }
            rail.innerHTML = _railHtml(curId);
            go(mode || (_hasNpc(p) ? 'talk' : 'app'));
        };
        _paint = paint;

        rail.addEventListener('click', (e) => {
            const b = e.target.closest('.lb-rail-main, .lb-rail-app');
            if (!b || b.disabled) return;
            const card = b.closest('.lb-rail-card');
            if (!card) return;
            paint(card.dataset.id, b.dataset.go);
        });

        // ✕ 只收起右邊的窗格（回到單純看立繪講話），不是關掉整個主頁——主頁沒有「關掉」這件事
        box.querySelector('.lb-pv-x').addEventListener('click', () => go('talk'));

        const close = () => {
            restorePanel(); talkOff();
            if (_paint === paint) _paint = null;
            box.remove();
            if (_view === close) _view = null;
        };

        host.appendChild(box);
        _view = close;
        paint(_usable(get(id)) ? id : HOME_ID);
        return box;
    }

    // ── 統一入口：同一顆鈕，兩種畫法 ────────────────────────────
    //   舞台掛著 → 開快轉地圖（空間感，看得到廣場長怎樣）
    //   舞台關著 → 開按鈕清單（沒有場景可以畫，就直接列能辦的事）
    function open() {
        const st = _stage();
        if (st && st.isActive && st.isActive() && st.openCityMap) { st.openCityMap(); return; }
        openHome();
    }

    win.LobbyPlaces = { list, get, open, openHome, openView, closeView, HOME_ID, PLACES };
    console.log('✅ LobbyPlaces（地點清單）模組就緒');
})();
