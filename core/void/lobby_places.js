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
            id: 'myhome', name: '我的家', icon: 'fa-house-chimney',
            obj: 'player_house',
            when: () => !!_stage()?.plotOccupied?.('player'),
            open: () => _fire('lstage-open-myhome'),
        },
        {
            id: 'room404', name: '404', icon: 'fa-ghost', npc: 'cheshire', bg: 'lobby_pv_bg_room404_v1.jpg',
            scene: 'room404',
            when: () => !!_st404().unlocked,
            ready: () => !!win.VoidTerminal?.enter404Room,
            open: () => win.VoidTerminal.enter404Room(),
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

    // ── 立繪模式的地點面板 ──────────────────────────────────────
    // 只列「開得起來」的地點（有 open）。走路才有意義的（廣場）不列。
    let _close = null;
    function closeFlat() { if (_close) { try { _close(); } catch (e) {} _close = null; } }

    function openFlat() {
        closeFlat();
        const host = document.querySelector('.lobby-left') || document.body;
        const items = list().filter(p => typeof p.open === 'function');

        const box = document.createElement('div');
        box.className = 'lb-places';
        box.innerHTML =
            '<div class="lb-places-hd"><i class="fa-solid fa-compass"></i> 前往' +
              '<button class="lb-places-x" type="button" aria-label="關閉"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="lb-places-grid">' +
              (items.length
                ? items.map(p =>
                    '<button class="lb-place" type="button" data-id="' + p.id + '">' +
                      '<span class="lb-place-ic"><i class="fa-solid ' + p.icon + '"></i></span>' +
                      '<span class="lb-place-t">' + (p.flatName || p.name) + '</span>' +
                    '</button>').join('')
                : '<div class="lb-places-empty">還沒有能去的地方</div>') +
            '</div>';

        const close = () => { box.remove(); if (_close === close) _close = null; };
        box.querySelector('.lb-places-x').addEventListener('click', close);
        box.addEventListener('click', (e) => {
            const b = e.target.closest('.lb-place');
            if (!b) return;
            const p = get(b.dataset.id);
            close();
            // 有管理員的地方→開地點視圖(背景+立繪+窗格)；沒有的(例如我的家)照舊直接開
            if (p && p.npc) { openView(p.id); return; }
            try { p && p.open && p.open(); } catch (err) { console.warn('[LobbyPlaces] 開啟失敗', b.dataset.id, err); }
        });
        host.appendChild(box);
        _close = close;
        return box;
    }

    // ── 🏛 地點視圖（立繪模式）──────────────────────────────────
    //   背景換成那個地點、左邊站管理員的立繪、右邊一個窗格。
    //   🚨 窗格「要嘛對話、要嘛應用」，不同時存在——同一個人一邊在面板裡講話、
    //      底下對話框也在講話＝很割裂（紫薇那次已經治過一輪，這裡是通用版）。
    //   對話那半是把既有的 .void-dialogue-wrap 用 CSS 搬進窗格，不動 DOM、不另做一套聊天。
    const CDN = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@main/';
    let _view = null;
    let _toPick = null;   // openView 設定：面板內部的返回鈕要回「岔路」，跟標題列那顆一致

    // 🔮 把塔羅畫進窗格：OS_TAROT.launch 本來就吃容器，只差它的 ❮ 返回鈕。
    //    那顆鈕寫死呼叫 PhoneSystem.goHome（它原本住手機殼裡）→ 暫借成「回岔路」，關掉時還原。
    //    🚨 要跟標題列那顆 ‹ 去同一個地方,不然兩顆長得像卻行為不同=一定按錯(Rae 2026-08-24 回報)。
    //    面板內那顆本身也用 CSS 藏起來了(一頁只留一顆返回鈕),這裡的接線是保險。
    function _mountTarot(c) {
        const PS = win.PhoneSystem;
        const saved = PS ? PS.goHome : undefined;
        const back = () => { if (_toPick) _toPick(); else { closeView(); openFlat(); } };
        if (PS) PS.goHome = back; else win.PhoneSystem = { goHome: back, __pvShim: true };
        c._pvRestore = () => {
            if (PS) { if (saved === undefined) delete PS.goHome; else PS.goHome = saved; }
            else if (win.PhoneSystem && win.PhoneSystem.__pvShim) delete win.PhoneSystem;
        };
        win.OS_TAROT.launch(c);
    }

    // 🪟 把「自己開浮窗」的面板搬進容器（照 phone_shell 搬黑市的成例）：
    //    開它 → 等它的視窗生出來 → appendChild 進容器 → 離開時關掉/搬回原位。
    //    這樣三個既有面板（世界門/交易所/書咖櫃檯）一行程式都不用改。
    //    🚨 它們是 async 生成的，呼叫完當下抓不到元素 → 用 rAF 輪詢等它出現。
    function _mountFloating(c, open, sel, close) {
        const place = () => {
            const el = document.querySelector(sel);
            if (!el) return false;
            const orig = el.parentElement;
            c.appendChild(el);
            c._pvRestore = () => {
                try { close && close(); } catch (e) {}
                // close 通常會把它移除；萬一沒有就搬回原位，別留在已經消失的容器裡
                if (el.isConnected && orig) { try { orig.appendChild(el); } catch (e) {} }
            };
            return true;
        };
        let tries = 0;
        const tick = () => {
            if (place()) return;
            if (++tries > 40) { c.innerHTML = '<div class="lb-pv-fail">面板沒開起來</div>'; return; }
            // 🚨 用 setTimeout 不用 requestAnimationFrame：等的是「DOM 生出來沒」不是畫面，
            //    而 rAF 在頁面沒在合成時（分頁切到背景、視窗被遮住）根本不會 fire，
            //    面板就永遠搬不進來、離開時也不會被清掉（實測抓到）。
            setTimeout(tick, 30);
        };
        try { open(); } catch (e) { console.warn('[LobbyPlaces] 面板開啟失敗', sel, e); }
        tick();
    }

    function closeView() {
        if (!_view) return;
        try { _view(); } catch (e) {}
        _view = null;
    }

    function openView(id) {
        const p = get(id);
        if (!p) return;
        closeFlat(); closeView();
        const host = document.querySelector('.lobby-left');
        if (!host) { try { p.open && p.open(); } catch (e) {} return; }   // 沒有大廳外殼就退回單開面板

        const npc = (win.LobbyNpcs && p.npc) ? win.LobbyNpcs.staff(p.npc) : null;
        const appLabel = p.flatName || p.name;
        const box = document.createElement('div');
        box.className = 'lb-pv is-pick';
        box.innerHTML =
            (p.bg ? '<div class="lb-pv-bg" style="background-image:url(' + CDN + p.bg + ')"></div>' : '<div class="lb-pv-bg"></div>') +
            '<div class="lb-pv-hd">' +
              '<button class="lb-pv-back" type="button"><i class="fa-solid fa-chevron-left"></i></button>' +
              '<span class="lb-pv-title">' + p.name + '</span>' +
              (npc ? '<span class="lb-pv-sub">' + (npc.subTitle || '') + '</span>' : '') +
              '<button class="lb-pv-x" type="button" aria-label="離開"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            (npc && npc.portrait ? '<img class="lb-pv-portrait" src="' + npc.portrait + '" alt="">' : '') +
            // 岔路：先問要幹嘛，選了才進去那件事（照手機那套 lstage-pick 的體感）
            '<div class="lb-pv-pick">' +
              (npc ? '<div class="lb-pv-pick-who">' + npc.name + '</div>' : '') +
              '<button class="lb-pv-pick-btn" data-go="talk" type="button">' +
                '<i class="fa-solid fa-comment-dots"></i><span>對話</span></button>' +
              '<button class="lb-pv-pick-btn" data-go="app" type="button">' +
                '<i class="fa-solid ' + p.icon + '"></i><span>' + appLabel + '</span></button>' +
            '</div>' +
            '<div class="lb-pv-pane"><div class="lb-pv-body"></div></div>';

        // 🧍 立繪大小依「圖片原生比例」自動決定，不必為了不同人準備不同資產：
        //    細長(比例≥1.7)＝全身站高貼底，下緣讓對話框蓋掉＝自然的半身效果；
        //    方(比例<1.7)＝本來就是半身(丹/雷伊 640x896)，放小一點、切口一樣藏進對話框。
        //    🚨 所以全身圖不用砍半——對話框本身就是裁刀（Rae 2026-08-24 討論）。
        const pimg = box.querySelector('.lb-pv-portrait');
        if (pimg) {
            const kind = () => {
                const r = pimg.naturalWidth ? (pimg.naturalHeight / pimg.naturalWidth) : 0;
                if (r) pimg.classList.toggle('is-half', r < 1.7);
            };
            if (pimg.complete && pimg.naturalWidth) kind();
            else pimg.addEventListener('load', kind, { once: true });
        }

        const body = box.querySelector('.lb-pv-body');
        const restorePanel = () => {
            try { if (body._pvRestore) { body._pvRestore(); body._pvRestore = null; } } catch (e) {}
        };

        // 🚨 對話走既有的對話框（VN 版位、貼底），不塞進右邊容器——
        //    Rae 2026-08-24：「我的對話是對話框，不是泡泡聊天」。右容器只給應用用。
        const talkOff = () => { try { win.LobbyStage?.endTalk?.(); } catch (e) {} };

        // mode: 'pick' 岔路 / 'talk' 對話 / 'app' 應用
        const toPick = () => go('pick');
        _toPick = toPick;

        const go = (mode) => {
            restorePanel();
            body.innerHTML = '';
            box.classList.remove('is-pick', 'is-talk', 'is-app');
            if (mode === 'pick') { talkOff(); box.classList.add('is-pick'); return; }
            if (mode === 'talk') {
                box.classList.add('is-talk');
                // 對話對象＝這個地方的管理員；沒有舞台也設得起來，void_terminal 讀的是 talkTarget
                try { if (npc) win.LobbyStage?.setTalkTarget?.(npc); } catch (e) {}
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
                console.warn('[LobbyPlaces] 面板開啟失敗', id, e);
            }
        };

        const close = () => {
            restorePanel();
            talkOff();
            if (_toPick === toPick) _toPick = null;
            box.remove();
            if (_view === close) _view = null;
        };
        box.querySelector('.lb-pv-x').addEventListener('click', close);
        // ‹返回：在對話/應用裡→退回岔路；已經在岔路→退回地點清單（巢狀只有最外層是 ✕）
        box.querySelector('.lb-pv-back').addEventListener('click', () => {
            if (box.classList.contains('is-pick')) { close(); openFlat(); return; }
            go('pick');
        });
        box.addEventListener('click', (e) => {
            const b = e.target.closest('.lb-pv-pick-btn');
            if (b) go(b.dataset.go);
        });

        host.appendChild(box);
        _view = close;
        return box;
    }

    // ── 統一入口：同一顆鈕，兩種畫法 ────────────────────────────
    //   舞台掛著 → 開快轉地圖（空間感，看得到廣場長怎樣）
    //   舞台關著 → 開按鈕清單（沒有場景可以畫，就直接列能辦的事）
    function open() {
        const st = _stage();
        if (st && st.isActive && st.isActive() && st.openCityMap) { st.openCityMap(); return; }
        openFlat();
    }

    win.LobbyPlaces = { list, get, open, openFlat, closeFlat, openView, closeView, PLACES };
    console.log('✅ LobbyPlaces（地點清單）模組就緒');
})();
