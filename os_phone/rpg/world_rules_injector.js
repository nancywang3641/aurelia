// ----------------------------------------------------------------
// [檔案] world_rules_injector.js
// 職責：依「這個聊天室現在在哪個世界」自動翻「-VN小說家-」的模組條目開關。
//       奇幻世界不該有手機通訊與表情包，現代日常不該冒出戰鬥面板，BGM 清單也該跟著題材換。
//
// 判斷來源：世界種子既有的 genre / style / danger 三個欄位（世界門本來就會產），
//           不另外要求模型多吐欄位——多加一條規格就多一個它會照字面辦事的地方。
// 綁定範圍：世界資料存在 OS_DB app_data(worldgate)，那是 chat-scope；
//           換聊天室＝換世界，回到舊聊天室就還原成那個世界的設定。
// ⚠️ 邊界：只改下面列名的條目、只動 enabled，不寫內容、不碰 UID/keyword，
//          名單外的條目（幼童規則、NSFW 這類內容偏好）一律不碰。
//          照 avatar_rules_injector.js 的形狀寫，同一套 TavernHelper 世界書 API。
// ----------------------------------------------------------------
(function () {
    'use strict';

    const win = window.parent || window;
    const BOOK = '-VN小說家-';
    const APP_ID = 'worldgate';

    // 題材判斷：比對世界種子的 genre + style + danger
    const RE = {
        modern:  /現代|都市|校園|職場|辦公|賽博|科幻|近未來|未來|末世|廢土|現實|都會/,
        wuxia:   /武俠|仙俠|修真|江湖|門派|東方玄幻|劍仙/,
        horror:  /恐怖|怪談|民俗|靈異|詭異|驚悚|邪祟|克蘇魯/,
        mystery: /偵探|推理|懸疑|命案|事件簿|搜查/,
        // 明確的和平題材才關戰鬥；其餘（劍與魔法、拓荒、深淵、權謀…）預設留著
        peace:   /日常|經營|戀愛|美食|旅遊|治癒|田園|種田|校園戀|音樂|藝術/,
    };

    // 可自動管理的條目（用 comment 關鍵字比對，名單外一律不碰）
    const BATTLE = '戰鬥觸發';
    const PHONE  = ['通話與手機聊天', '直播彈幕', '表情包清單'];
    const BGM    = { modern: 'BGM｜現代一般', mystery: 'BGM｜偵探', fantasy: 'BGM｜奇幻',
                     wuxia: 'BGM｜武俠仙俠', horror: 'BGM｜恐怖' };

    // 世界 → 該開哪些條目。回 { on:Set, managed:[…] }
    function planFor(world) {
        const txt = world
            ? [world.genre, world.style, world.danger, world.concept].filter(Boolean).join(' ')
            : '現代 都市';            // 沒有世界＝還在大廳（純白大廳/書咖/城市，現代那組）
        const isModern  = RE.modern.test(txt);
        const isWuxia   = RE.wuxia.test(txt);
        const isHorror  = RE.horror.test(txt);
        const isMystery = RE.mystery.test(txt);
        const isPeace   = RE.peace.test(txt);

        const on = new Set();
        // 手機那組：只有現代系世界才有手機可用
        if (isModern) PHONE.forEach(n => on.add(n));
        // 戰鬥：和平題材關掉；大廳也關（大廳不打架）
        if (world && !isPeace) on.add(BATTLE);
        // BGM 五選一（規範那條是常駐的、不在管理名單內）
        on.add(BGM[isHorror ? 'horror' : isMystery ? 'mystery' : isWuxia ? 'wuxia'
                 : isModern ? 'modern' : 'fantasy']);

        return { on: on, managed: [BATTLE].concat(PHONE).concat(Object.values(BGM)) };
    }

    // 跨卡守衛：綁定裡出現任一本奧瑞亞書才動手（照 core/void/worldgate.js 的 ours 判斷）。
    //   少了這道，玩別人的角色卡時 current 同樣是空的，會被當成「人在奧瑞亞大廳」，
    //   於是強行開手機那三條、關戰鬥、把 BGM 換成現代一般——玩武俠卡就整個被翻掉。
    function _isAurelia() {
        try {
            const TH = win.TavernHelper || window.TavernHelper;
            if (!TH || typeof TH.getCharLorebooks !== 'function') return false;
            const c = TH.getCharLorebooks() || {};
            return [c.primary].concat(Array.isArray(c.additional) ? c.additional : [])
                   .some(b => b && /奧瑞亞/.test(String(b)));
        } catch (e) { return false; }
    }

    async function _currentWorld() {
        try {
            const db = win.OS_DB || window.OS_DB;
            if (!db || !db.getAppData) return null;
            // 🚨優先問世界門:那邊才知道「全新聊天室還沒有 chatId」的空窗期要怎麼處理
            //    (酒館要等第一則訊息落地才給 id,而 DIVE 常常就發生在那之前)。
            //    自己讀的話,那段空窗會回「不在任何世界」→ 第一則劇情的模組條目整組翻錯。
            const WG = win.OS_WORLDGATE || window.OS_WORLDGATE;
            if (WG && typeof WG.getCurrentWorld === 'function') {
                try { const w = await WG.getCurrentWorld(); if (w) return w; } catch (e) {}
            }
            // 退路:世界門還沒載入時自己讀（同樣要帶 chatId，不然換聊天室後讀到的是上一個世界）
            const cid = (db.currentChatId && db.currentChatId()) || '';
            if (!cid) return null;
            const id = await db.getAppData(APP_ID, 'current', cid);  // DIVE 時寫入，撤離時清掉
            if (!id) return null;
            const worlds = (await db.getAppData(APP_ID, 'worlds')) || [];
            return worlds.find(w => w && w.id === id) || null;
        } catch (e) { return null; }
    }

    let _syncing = false;

    async function sync(reason) {
        if (_syncing) return;
        _syncing = true;
        try {
            const TH = win.TavernHelper || window.TavernHelper;
            if (!TH || !TH.getLorebookEntries || !TH.setLorebookEntries) return;
            if (!_isAurelia()) { console.log('🌍 [World Rules] 非奧瑞亞角色卡 → 一條都不碰（' + reason + '）'); return; }

            let entries;
            try { entries = await TH.getLorebookEntries(BOOK); }
            catch (e) { console.warn('🌍 [World Rules] ⛔ 讀不到世界書「' + BOOK + '」→ 跳過'); return; }
            if (!Array.isArray(entries) || !entries.length) return;

            const world = await _currentWorld();
            const plan = planFor(world);

            const updates = [], opened = [], closed = [];
            for (const e of entries) {
                const cm = String((e && e.comment) || '');
                const hit = plan.managed.find(n => cm.includes(n));
                if (!hit) continue;                                   // 名單外＝完全不碰
                const should = plan.on.has(hit);
                if (e.enabled === should) continue;
                updates.push({ uid: e.uid, enabled: should });
                (should ? opened : closed).push(hit);
            }
            if (!updates.length) return;

            await TH.setLorebookEntries(BOOK, updates);
            const where = world ? ('「' + world.name + '」(' + (world.genre || '未標題材') + ')') : '奧瑞亞主世界';
            console.log('🌍 [World Rules] ' + where + ' → 開:' + (opened.join('、') || '無')
                      + ' / 關:' + (closed.join('、') || '無') + '（' + reason + '）');
            // 讓她知道剛剛被動了什麼：這支會覆蓋手動調整，靜悄悄改最難查
            try {
                const t = win.toastr || window.toastr;
                if (t && t.info) t.info((opened.length ? '開啟 ' + opened.join('、') : '')
                                      + (opened.length && closed.length ? '；' : '')
                                      + (closed.length ? '關閉 ' + closed.join('、') : ''),
                                      '世界模組：' + where, { timeOut: 4000 });
            } catch (e) {}
        } catch (e) {
            console.warn('🌍 [World Rules] sync 失敗:', (e && e.message) || e);
        } finally { _syncing = false; }
    }

    function init() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(init, 1000); return; }
        // 換聊天室＝換世界（世界資料是 chat-scope）→ 重新對帳一次
        if (win.tavern_events.CHAT_CHANGED) win.eventOn(win.tavern_events.CHAT_CHANGED, () => setTimeout(() => sync('換聊天室'), 900));
        setTimeout(() => sync('開機'), 5000);   // 晚點跑，等 TavernHelper / OS_DB 就緒
    }
    init();

    window.WORLD_RULES = { sync: sync, planFor: planFor };
    console.log('🌍 [World Rules] 世界模組開關同步器已載入');
})();
