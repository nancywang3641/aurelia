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
    // open()   直接開這個地點的面板；沒給就不出現在立繪模式
    // when()   要不要顯示（鎖住/沒解鎖/沒蓋房就整顆收起來）
    // ready()  這個面板現在開得起來嗎（模組載入了沒）
    //          🚨 一定要有：open 裡面全是 `?.`，模組沒載入時呼叫不會報錯也不會有反應，
    //             那顆鈕就變成「點了什麼都沒發生」的死鈕。寧可不顯示也不要給死鈕。
    const PLACES = [
        {
            id: 'cafe', name: '書咖', flatName: '書咖櫃檯', icon: 'fa-mug-hot',
            obj: 'book_cafe', scene: 'cafe',
            ready: () => !!win.OS_CAFE?.openWorkshop,
            open: () => win.OS_CAFE.openWorkshop(),
        },
        {
            id: 'hall', name: '大廳', flatName: '世界門', icon: 'fa-globe',
            obj: 'lobby_day', scene: 'hall',
            ready: () => !!win.OS_WORLDGATE?.openGate,
            open: () => win.OS_WORLDGATE.openGate(),
        },
        {
            id: 'exchange', name: '交易所', icon: 'fa-right-left',
            scene: 'exchange',
            ready: () => !!win.OS_PT?.openExchange,
            open: () => win.OS_PT.openExchange(),
        },
        {
            id: 'tarot', name: '占卜小屋', flatName: '占卜', icon: 'fa-moon',
            obj: 'tarot_hut', scene: 'tarot',
            ready: () => !!_stage()?.openTarotPanel,
            open: () => _stage().openTarotPanel(),
        },
        {
            id: 'myhome', name: '我的家', icon: 'fa-house-chimney',
            obj: 'player_house',
            when: () => !!_stage()?.plotOccupied?.('player'),
            open: () => _fire('lstage-open-myhome'),
        },
        {
            id: 'room404', name: '404', icon: 'fa-ghost',
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
            try { p && p.open && p.open(); } catch (err) { console.warn('[LobbyPlaces] 開啟失敗', b.dataset.id, err); }
        });
        host.appendChild(box);
        _close = close;
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

    win.LobbyPlaces = { list, get, open, openFlat, closeFlat, PLACES };
    console.log('✅ LobbyPlaces（地點清單）模組就緒');
})();
