// ----------------------------------------------------------------
// [檔案 4] wx_core.js (V117.8 - Name Snapshot Fix)
// 功能：核心邏輯 (無省略完整版)
// 包含：氣泡流 (Bubble Stream)、渲染隊列、API 回覆處理、刪除保護
// 🔥 修復：
// 1. sendMsg 新增 senderName 快照，解決切換人設後同步錯亂問題。
// 2. parseAndProcess 新增 senderName 快照，解決NPC改名後歷史錯亂問題。
// ----------------------------------------------------------------
(async function () {
    console.log('[WeChat] App Core V117.8 (Name Snapshot Fix) Loaded');
    const win = window.parent || window;
    const doc = win.document;

    // 1. 依賴檢查
    if (window.WX_THEME) { window.WX_THEME.inject(doc); }
    if (!window.WX_VIEW) { console.error('錯誤：未檢測到 wx_view.js'); return; }

    // 2. 狀態管理
    let GLOBAL_CHATS = {};
    let GLOBAL_ACTIVE_ID = null;
    let GLOBAL_TAB = 'chat';
    let RENDER_QUEUE = [];
    let APP_CONTAINER = null;
    let PENDING_ACTION_TYPE = null;
    let RENDER_QUEUE_PROCESSING = false; 
    let LAST_RENDER_TIME = 0; 
    let IS_STREAMING_REPLY = false; // 🔥 防止重複觸發
    let DARK_MODE = localStorage.getItem('wx_dark_mode') === 'true';

    // --- HTML 轉純文字核心 ---
    function cleanHtmlToText(htmlContent) {
        let temp = htmlContent;
        temp = temp.replace(/<br\s*\/?>/gi, '\n');
        temp = temp.replace(/<\/p>/gi, '\n');
        temp = temp.replace(/<p.*?>/gi, '');
        temp = temp.replace(/<div>/gi, '\n');
        temp = temp.replace(/<\/div>/gi, '');
        temp = temp.replace(/<[^>]+>/g, '');
        const textarea = doc.createElement('textarea');
        textarea.innerHTML = temp;
        let decoded = textarea.value;
        decoded = decoded.replace(/^[""]\s*/gm, '');
        return decoded;
    }

    // --- 紅包數據管理 ---
    // 🚨改走「這個聊天室的帳本」（wx_cards.js）。以前是拿模型寫的單號當 localStorage 的全域鍵，
    //   結果不同聊天室共用同一份、清空聊天也清不掉、程式自己補的三位數 ID 還會撞到別人的紅包
    //   直接繼承對方的金額與領取紀錄。帳本按聊天室分開，清空時一起走。
    //   第一次讀到舊世界那筆時會接手過來，既有對話不會突然變空。
    function _cards() { return win.WX_CARDS || window.WX_CARDS; }

    // 💬 有沒有人在等她回：大廳「應用」那顆的小圓點。她沒開手機就不知道有人講話了，
    //    心跳（角色主動找她）在酒館尤其明顯——訊息進去了，畫面上卻一點聲音都沒有。
    //    只算出 true/false 交給大廳自己標，不要伸手進別人的 DOM。
    function _refreshLobbyUnread() {
        try {
            const V = win.VoidTerminal || window.VoidTerminal;
            if (!V || !V.markPhoneUnread) return;
            let any = false;
            for (const k in GLOBAL_CHATS) {
                const c = GLOBAL_CHATS[k];
                if (c && c.unread) { any = true; break; }
            }
            V.markPhoneUnread(any);
        } catch (e) {}
    }
    // 轉帳時效。🚨 以前寫死十分鐘，但那時「轉帳單上根本沒有時間」所以從來沒真的過期過；
    //    時間補回來之後十分鐘會變成真的——她晚一點才看到那則就收不了。真的微信是一天，照那個。
    const TXN_TTL = 24 * 60 * 60 * 1000;
    function _cardChat(chatId) { return chatId || GLOBAL_ACTIVE_ID; }

    // 狀態寫進這個聊天室的帳本。帳本裡還沒有這張卡（卡片還沒被畫過）就先寫舊鍵，
    // 等畫到的那一刻 adopt 會接手進來——順序不管誰先誰後都對得上。
    function _setCardStatus(chatId, kind, alias, status, legacyKey) {
        if (!status) return null;   // 🚨 沒帶狀態就不要動它：以前傳進 undefined 會把卡片原樣存回去，看起來像沒反應
        const C = _cards(); const cid = _cardChat(chatId);
        if (C && cid) {
            const card = C.find(cid, kind, alias);
            if (card) { C.update(cid, card.key, { status: status }); return card; }
        }
        if (legacyKey) { try { localStorage.setItem(legacyKey, status); } catch (e) {} }
        return null;
    }

    // 讀狀態：先問帳本，帳本裡沒有這張卡（還沒被畫過、或舊世界留下的）才退回舊鍵。
    // 🚨 這支是為了「只有一個判斷來源」。狀態搬進帳本之後，禮物彈窗還在讀 localStorage 的舊鍵，
    //    可是那個鍵從此不再被寫（_setCardStatus 只有在帳本查不到時才寫），於是她收下之後
    //    底下系統訊息說收到了、卡片點開卻還是兩顆可以按的按鈕。轉帳彈窗更是從頭到尾沒判斷過。
    function _getCardStatus(chatId, kind, alias, legacyKey) {
        const C = _cards(); const cid = _cardChat(chatId);
        if (C && cid) {
            // 🚨 這裡一定要用 findByAlias，不能用 find。find 是給模型寫的單號用的模糊查找——
            //    單號對不上會退回號碼、再退回「最近一張」，拿來問「這一張處理過沒」會抓到別人的卡：
            //    舊世界那種帳本裡根本沒有的卡，就會借用最近一張的狀態，判斷整個歪掉。
            const card = C.findByAlias(cid, kind, alias);
            // 帳本裡有這張卡就以帳本為準：還是 pending 就是真的還沒處理，不要再去問舊鍵
            if (card) return (card.status && card.status !== 'pending') ? card.status : null;
        }
        if (legacyKey) { try { return localStorage.getItem(legacyKey) || null; } catch (e) {} }
        return null;
    }

    // 轉帳單本身（金額、對象、時效）也按聊天室分開存，理由同紅包
    function _txnLoad(chatId, txnId) {
        const C = _cards(); const cid = _cardChat(chatId);
        if (C && cid) {
            const card = C.findByAlias(cid, 'transfer', txnId);
            // 🚨 帳本那張卡的 data 裡「沒有」status 與 timestamp（狀態在卡身上、時間是卡建立的時候）。
            //    以前直接回 data → 收款那段的 status/elapsed 全是 undefined：判斷一路落空，
            //    最後拿 undefined 去更新狀態＝等於沒改。她收了款，卡片還是未收取、按鈕還能按、
            //    模型那邊的待處理清單也還掛著。補回來，讓「卡片＝唯一的事實來源」。
            if (card && card.data && card.data.amount != null) {
                return Object.assign({}, card.data, {
                    status: card.status || 'pending',
                    timestamp: card.data.timestamp || card.at || Date.now()
                });
            }
        }
        try { const raw = localStorage.getItem('wx_transfer_' + txnId); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }
    function _txnSave(chatId, txnId, data) {
        const C = _cards(); const cid = _cardChat(chatId);
        if (C && cid) {
            const card = C.adopt(cid, 'transfer', txnId, data, null);
            C.update(cid, card.key, { data: data, status: data && data.status ? data.status : undefined });
            return;
        }
        try { localStorage.setItem('wx_transfer_' + txnId, JSON.stringify(data)); } catch (e) {}
    }

    // 🧾 送給模型的「現在還沒處理完的」清單。序號是程式發的（wx_cards.js），保證不重複，
    //    而且同時通常只有一兩張，模型很難指錯——它因此不用自己編單號，也不用把單號印在畫面上
    //    跟自己對帳。沒有待處理的就回空字串，一個字都不加。
    function _pendingBrief(chatId) {
        const C = _cards();
        const pend = (C && chatId) ? C.pending(chatId) : [];
        if (!pend.length) return '';
        const NAME = { redpacket: '紅包', gift: '禮物', transfer: '轉帳' };
        const money = (v) => '¥' + (Number(v) || 0).toFixed(2);
        const lines = pend.map(c => {
            const d = c.data || {};
            let desc;
            if (c.kind === 'redpacket') {
                const total = Number(d.totalAmount) || 0;
                const got = (d.list || []).reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
                desc = (d.sender ? d.sender + '發的，' : '') + '共 ' + money(total)
                    + '，已被領走 ' + money(got) + '，還剩 ' + money(Math.max(0, total - got));
            } else if (c.kind === 'transfer') {
                desc = money(d.amount) + (d.targetName ? '，給 ' + d.targetName : '') + '，還沒被收下';
            } else {
                desc = (d.itemName || '一份禮物') + '，還沒被收下';
            }
            return c.seq + ' 號　' + (NAME[c.kind] || c.kind) + '：' + desc;
        });
        // 🚨🚨措辭要分清楚「舊的」跟「這一輪新發的」，不能只說「不必自己編單號」：
        //    這份清單是送出前算的，只含之前留下、還沒處理完的。模型這一輪**新發**的紅包
        //    還沒有號碼可用，而群聊很常見「A 發一個紅包、同一輪讓 B 去領」——
        //    那時只能靠它自己帶的單號指涉（Rae 想到的就是這個場景）。
        //    程式兩條路都認：先比對單號，對不上才退回號碼與最近一張。
        return ['【現在還沒處理完的】'].concat(lines).concat([
            '',
            '上面這些是之前留下、還沒處理完的。要讓誰領它們、或收下退回它們時，最後一段直接寫號碼就好（例如「小明領取了紅包 4.44元|1」）。',
            '這一輪你新發的紅包／禮物／轉帳，照原本的規矩自己帶一個單號——它還沒有號碼；同一輪就要讓人領它的話，用你剛剛帶的那個單號指。',
            '沒列在上面、也不是這一輪新發的，就是已經處理完了，別再動它。'
        ]).join('\n');
    }

    // 🔗 打開她傳的連結（聊天設置「打開我傳的連結」，一間一個開關，存在 chat.readLinks）。
    //    模型自己打不開網址，只看到一串字，還常照網址裡的字編一段假裝看過——所以送出前程式先替它讀。
    //    讀網頁走 Jina Reader：網址前面接 r.jina.ai/，回整頁純文字，而且允許網頁直接呼叫，
    //    PWA（沒有伺服器）跟酒館版都能用同一條。讀過的結果存在那則訊息的 linkReads 上，
    //    同一個網址不會每輪重抓。
    //    🚨 網頁全文**只送一次**（跟相簿照片、頭像同一套）：那一輪要它單獨一行寫回這頁在講什麼，
    //    存成 summary，之後每輪只帶那一兩行。以前是每輪把最近 3 篇全文（各 2500 字）重新推一次
    //    system 進去，聊到後面每一輪都在重付這筆字數，模型也會覺得同一段一直重複出現。
    const LINK_READER = 'https://r.jina.ai/';
    const LINK_RE = /https?:\/\/[^\s<>"'\]\[（）【】「」『』，。！？、]+/gi;
    const LINK_TEXT_MAX = 2500;   // 第一次給模型看的全文字數
    const LINK_SUM_MAX = 400;     // 之後每輪只帶這麼多字的重點
    const LINK_KEEP = 3;          // 帶最近幾個網址
    const LINK_TIMEOUT = 15000;
    const LINK_TRIES = 2;         // 它沒寫回重點的話，最多再給一次全文
    let _linkBatch = [];          // 這一輪給了全文的那幾個（照順序＝它回的編號）

    function _linksIn(text) { return Array.from(new Set(String(text || '').match(LINK_RE) || [])); }

    async function _readOneLink(url) {
        const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = setTimeout(function () { try { if (ctl) ctl.abort(); } catch (e) {} }, LINK_TIMEOUT);
        try {
            const res = await fetch(LINK_READER + url, ctl ? { signal: ctl.signal } : {});
            if (!res.ok) return { url: url, ok: false };
            const raw = await res.text();
            // 回來的樣子：Title: …／URL Source: …／Markdown Content: 底下才是正文
            const title = ((raw.match(/^Title:\s*(.+)$/m) || [])[1] || '').trim();
            let body = raw.split(/^Markdown Content:\s*$/m)[1];
            if (body == null) body = raw;
            body = body.replace(/!\[[^\]]*\]\([^)]*\)/g, '')          // 圖片
                       .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')        // 連結只留字
                       .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
            if (!body) return { url: url, ok: false };
            if (body.length > LINK_TEXT_MAX) body = body.slice(0, LINK_TEXT_MAX) + '…';
            return { url: url, ok: true, title: title, text: body };
        } catch (e) {
            return { url: url, ok: false };
        } finally { clearTimeout(timer); }
    }

    // 送出前：她這間傳過、還沒讀過的網址（只挑最近的幾個）讀起來，掛回訊息上
    async function _prepareLinks(chat) {
        if (!chat || !chat.readLinks) return;
        const jobs = [];
        (chat.messages || []).forEach(function (m) {
            if (!m || !m.isMe || (m.type && m.type !== 'msg') || !m.content) return;
            const done = (m.linkReads || []).map(function (r) { return r.url; });
            _linksIn(m.content).forEach(function (u) { if (done.indexOf(u) < 0) jobs.push({ m: m, url: u }); });
        });
        const todo = jobs.slice(-LINK_KEEP);
        if (!todo.length) return;
        const results = await Promise.all(todo.map(function (j) { return _readOneLink(j.url); }));
        todo.forEach(function (j, i) { (j.m.linkReads = j.m.linkReads || []).push(Object.assign({ at: Date.now() }, results[i])); });
        console.log('[WX] 讀了 ' + todo.length + ' 個連結，成功 ' + results.filter(function (r) { return r.ok; }).length + ' 個');
    }

    // 給模型看的那段：已經有重點的只帶重點，這一輪才第一次看到的才給全文並要它寫回重點。
    // 打不開的照樣講明，免得它假裝看過。
    function _linkBrief(chat, userName) {
        _linkBatch = [];
        if (!chat || !chat.readLinks) return '';
        const reads = [];
        (chat.messages || []).forEach(function (m) {
            if (m && m.isMe && Array.isArray(m.linkReads)) m.linkReads.forEach(function (r) { reads.push(r); });
        });
        const recent = reads.slice(-LINK_KEEP);
        if (!recent.length) return '';
        const who = userName || '對方';
        const parts = [];
        const fresh = [];
        recent.forEach(function (r) {
            if (!r.ok) { parts.push('〔' + r.url + '〕\n這個網頁打不開（可能要登入或被擋），你看不到內容，別假裝看過。'); return; }
            // 要過兩次它都沒寫回來，就自己截前面一段當重點——全文不能一直重送
            if (!r.summary && (r.tries || 0) >= LINK_TRIES) r.summary = String(r.text || '').slice(0, LINK_SUM_MAX);
            if (r.summary) { parts.push('〔' + r.url + '〕' + (r.title ? '\n標題：' + r.title : '') + '\n重點：' + r.summary); return; }
            fresh.push(r);
        });
        fresh.forEach(function (r, i) {
            r.tries = (r.tries || 0) + 1;
            _linkBatch.push(r);
            parts.push('〔網頁 ' + (i + 1) + '｜' + r.url + '〕' + (r.title ? '\n標題：' + r.title : '') + '\n' + r.text);
        });
        let tail = '';
        if (_linkBatch.length) {
            const n = _linkBatch.length;
            tail = '\n\n（標了「網頁 編號」的那' + (n > 1 ? ' ' + n + ' 段' : '一段') + '全文只給你看這一次。看完在回覆的最後，'
                 + (n > 1 ? '每個各' : '') + '單獨一行寫：[系統: 網頁 ' + (n > 1 ? '編號' : '1') + ' 這頁在講什麼]，'
                 + '之後每輪只會再給你這句。那一行不會變成聊天訊息。）';
        }
        return ['【' + who + '在這個聊天室傳過的連結｜程式已經替你打開，下面是網頁上的內容】'].concat(parts).join('\n\n') + tail;
    }
    // 它寫回來的那句重點 → 存到那個連結上，之後只送這句
    function _rememberLink(num, desc) {
        const d = String(desc || '').trim().slice(0, LINK_SUM_MAX);
        if (!d || !_linkBatch.length) return false;
        const r = (num >= 1 && num <= _linkBatch.length) ? _linkBatch[num - 1] : _linkBatch.find(function (x) { return !x.summary; });
        if (!r) return false;
        r.summary = d;
        return true;
    }

    // 📷 她從相簿傳的照片：跟「讓角色看我的頭像」同一套——圖只送一次。
    //    傳了還沒看過的那幾張（最多 3 張）在下一次回覆時夾進去，要它每張寫一句描述回來；
    //    描述存在那則訊息的 photoDesc，之後的聊天歷史只送那句文字，圖再也不送（圖留在歷史裡會越積越重）。
    //    它沒寫回描述的話下一輪再試一次，試 2 次還是沒寫就不再送了。
    const PHOTO_ID_RE = /\bimg_wx_[A-Za-z0-9_]+/;
    const PHOTO_ONCE_MAX = 3;
    const PHOTO_TRIES = 2;
    let _photoBatch = { chatId: '', msgs: [] };   // 這一輪夾了哪幾張（照順序＝它回的編號）

    function _photoIdOf(m) {
        if (!m || !m.isMe || (m.type && m.type !== 'msg')) return '';
        const x = String(m.content || '').match(PHOTO_ID_RE);
        return x ? x[0] : '';
    }
    async function _photoDataUrl(id) {
        const blobUrl = await win.OS_DB.getImage(id);
        if (!blobUrl) return '';
        try {
            const blob = await (await fetch(blobUrl)).blob();
            return await new Promise(function (res, rej) { const rd = new FileReader(); rd.onload = function () { res(String(rd.result || '')); }; rd.onerror = rej; rd.readAsDataURL(blob); });
        } finally { try { URL.revokeObjectURL(blobUrl); } catch (e) {} }
    }
    async function _photoOnceMessage(chat) {
        _photoBatch = { chatId: (chat && chat.id) || '', msgs: [] };
        if (!chat || !win.OS_DB || !win.OS_DB.getImage) return null;
        const pend = (chat.messages || []).filter(function (m) { return _photoIdOf(m) && !m.photoDesc && (m.photoTries || 0) < PHOTO_TRIES; }).slice(-PHOTO_ONCE_MAX);
        const used = [], parts = [];
        for (const m of pend) {
            let url = '';
            try { url = await _photoDataUrl(_photoIdOf(m)); } catch (e) {}
            if (!url) continue;
            m.photoTries = (m.photoTries || 0) + 1;
            used.push(m);
            parts.push({ type: 'image_url', image_url: { url: url } });
        }
        if (!used.length) return null;
        _photoBatch.msgs = used;
        const n = used.length;
        const text = '（' + (n > 1 ? '這是我剛傳給你的 ' + n + ' 張照片，照順序是第 1 到第 ' + n + ' 張' : '這是我剛傳給你的照片') + '。'
            + '看完在回覆的最後，' + (n > 1 ? '每張各' : '') + '單獨一行寫：[系統: 照片 ' + (n > 1 ? '編號' : '1') + ' 一句話描述]，'
            + '把你看到的寫下來，之後就不用再看圖了。那一行不會變成聊天訊息。照片本身就照平常聊天那樣反應。）';
        return { role: 'user', content: [{ type: 'text', text: text }].concat(parts) };
    }
    function _rememberPhoto(chatId, num, desc) {
        const d = String(desc || '').trim();
        // 不比對 chatId：它回覆時常自己寫一行 [Chat: 名字|代號]，代號不一定跟這間一樣；
        //   同一時間只會有一則回覆在跑（IS_STREAMING_REPLY 鎖著），這一批就是這間的
        if (!d || !_photoBatch.msgs.length) return false;
        const m = (num >= 1 && num <= _photoBatch.msgs.length) ? _photoBatch.msgs[num - 1] : _photoBatch.msgs.find(function (x) { return !x.photoDesc; });
        if (!m) return false;
        m.photoDesc = d;
        return true;
    }
    // 🧾 送進模型的歷史：**已經處理完**的紅包／轉帳／禮物，把單號拿掉；還沒處理完的留著。
    //    🚨 它會重用單號，正是因為歷史裡看得到舊的就照抄（她 2026-09-12 實測：第二包一發出來就已領完）。
    //    但單號是指標：還沒被領完的紅包、還沒收的轉帳與禮物，它得指得到才能讓人去領／去收，
    //    所以只剝「已經沒事可做」的那些（她說的：已經收掉的隱藏，還沒收掉的繼續給）。
    const CARD_ID_RE = /(\[\s*(?:紅包|红包|RedPacket|轉帳|转账|轉賬|Transfer|Gift|禮物|礼物|系統|系统|System|Notice)\s*[:：][^\]]*?)\s*[|｜]\s*((?:ID_)?(?:rp|txn|tnx|gft|gift|transfer|redpacket)[_-][A-Za-z0-9_]+)/gi;
    // 這個單號還有事情可做嗎？（有＝留著給模型指）
    function _refStillOpen(ref, chatId) {
        const C = _cards(); const cid = _cardChat(chatId);
        if (!C || !cid) return true;              // 沒有帳本就別亂剝
        const alias = String(ref || '').replace(/^ID_/i, '');
        let open = false;
        ['redpacket', 'transfer', 'gift'].forEach(function (kind) {
            if (open) return;
            const card = C.findByAlias(cid, kind, alias);
            if (!card) return;
            if (kind === 'redpacket') {
                const d = card.data || {};
                if (d.totalAmount == null) { open = true; return; }   // 資料還沒建好，先留著
                const list = d.list || [];
                const got = list.reduce(function (n, x) { return n + (Number(x && x.amount) || 0); }, 0);
                const left = Number(d.totalAmount) - got;
                const slots = Number(d.totalCount || 1) - list.length;
                if (left > 0.001 && slots > 0) open = true;
            } else if (!card.status || card.status === 'pending') {
                open = true;
            }
        });
        return open;
    }
    function stripCardIds(text, chatId) {
        const s = String(text == null ? '' : text);
        if (s.indexOf('[') < 0) return s;
        return s.replace(CARD_ID_RE, function (m, head, ref) {
            return _refStillOpen(ref, chatId) ? m : head;
        });
    }

    // 文字歷史用（聊天歷史、回傳酒館）：圖庫編號換成它看過的那句；還沒看過就只說是一張照片
    function photoContextText(msg, text) {
        const s = String(text == null ? '' : text);
        if (!PHOTO_ID_RE.test(s)) return s;
        return s.replace(new RegExp(PHOTO_ID_RE.source, 'g'), (msg && msg.photoDesc) ? ('照片｜' + msg.photoDesc) : '照片');
    }

    // 🚨 紅包以前只認「模型寫的單號」。轉帳跟禮物都有綁「長在哪一則訊息」（slot），只有紅包沒有，
    //    所以模型第二次重用同一個單號時，第二包會直接讀到第一包的領取紀錄 → 一發出來就寫「已領完」。
    //    她 2026-09-12 實測就是這個（換成不同單號就正常）。現在紅包也綁 slot：
    //    同一個單號長在不同則訊息上＝兩張不同的卡。畫面與點擊一律用帳本自己的 key 當身分。
    function rpRef(packetId, slot, seed, chatId) {
        const C = _cards(); const cid = _cardChat(chatId);
        if (!C || !cid) return packetId;
        const card = C.adopt(cid, 'redpacket', packetId, seed || {}, null, slot);
        return card ? card.key : packetId;
    }
    // 帳本 key（rpRef 給的）或模型單號都收
    function _rpCard(ref, chatId) {
        const C = _cards(); const cid = _cardChat(chatId);
        if (!C || !cid) return null;
        const byKey = C.byKey ? C.byKey(cid, ref) : null;
        if (byKey) return byKey;
        return C.findByAlias(cid, 'redpacket', ref);
    }

    function saveRedPacketData(packetId, data, chatId) {
        const C = _cards(); const cid = _cardChat(chatId);
        if (C && cid) {
            const card = _rpCard(packetId, chatId) || C.adopt(cid, 'redpacket', packetId, data, null);
            C.update(cid, card.key, { data: data });
            return;
        }
        try { localStorage.setItem(`wx_redpacket_${packetId}`, JSON.stringify(data)); } catch(e) { console.error('[RedPacket] 保存失敗:', e); }
    }

    function getRedPacketData(packetId, chatId) {
        const C = _cards(); const cid = _cardChat(chatId);
        if (C && cid) {
            const card = _rpCard(packetId, chatId);
            if (card && card.data && card.data.totalAmount != null) return card.data;
            // 帳本裡還沒有 → 看看舊世界留了什麼，有就接手進來
            try {
                const raw = localStorage.getItem(`wx_redpacket_${packetId}`);
                if (raw) {
                    const old = JSON.parse(raw);
                    const c = C.adopt(cid, 'redpacket', packetId, old, null);
                    C.update(cid, c.key, { data: old });
                    return old;
                }
            } catch(e) {}
            return null;
        }
        try {
            const data = localStorage.getItem(`wx_redpacket_${packetId}`);
            return data ? JSON.parse(data) : null;
        } catch(e) { console.error('[RedPacket] 讀取失敗:', e, { packetId }); return null; }
    }
    
    // 確保紅包數據已保存（從消息內容中提取並保存）
    function ensureRedPacketData(content, senderName) {
        // 檢測 [RedPacket: 金額|備註|ID] 格式
        const redPacketMatch = content.match(/\[\s*(?:紅包|RedPacket)\s*[:：]\s*(.+?)\s*\]/i);
        if (!redPacketMatch) {
            return null;
        }
        
        const redPacketContent = redPacketMatch[1].trim();
        const parts = redPacketContent.split(/[|｜]/).map(s => s.trim()).filter(s => s);
        
        let amount = '0', memo = '恭喜發財，大吉大利', packetId = '';
        
        if (parts.length >= 3) {
            // 新格式：[金額|備註|紅包ID]
            amount = parts[0];
            memo = parts[1] || memo;
            packetId = parts[2];
        } else if (parts.length === 2) {
            // 兼容格式：[金額|備註] 或 [金額|紅包ID]
            amount = parts[0];
            if (parts[1].match(/^[a-zA-Z0-9_]+$/)) {
                packetId = parts[1];
            } else {
                memo = parts[1];
            }
        } else if (parts.length === 1 && parts[0]) {
            amount = parts[0];
        }
        
        // 🚨沒單號時別擲三位數：只有一千種，撞到既有的會直接繼承對方的金額與領取紀錄
        if (!packetId) {
            packetId = 'rp_auto_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        }
        
        // 保存紅包數據（如果還沒有保存過）
        const existing = getRedPacketData(packetId);
        if (!existing) {
            const totalAmount = parseFloat(amount) || 0;
            // 默認紅包數量：根據金額計算，最小1個，最大100個，每個至少0.01元
            const maxCount = Math.floor(totalAmount / 0.01);
            const totalCount = Math.min(100, Math.max(1, maxCount));
            const packetData = {
                sender: senderName || "User",
                totalAmount: totalAmount,
                totalCount: totalCount,
                memo: memo,
                list: []
            };
            saveRedPacketData(packetId, packetData);
        }
        
        return packetId;
    }
    
    function processRedPacketGrab(packetId, grabberName, specifiedAmount = null) {
        // 🚨這裡要寬鬆查找：模型可能寫原本的單號，也可能照我們給它的清單寫「1」「#1」「1號」。
        //   畫卡片那邊必須嚴格（不然會把 A 的紅包畫成 B 的），但「領哪一個」用寬鬆的才對——
        //   指涉不清時就是剛剛那一張。找到之後記住是哪張卡，等下把領取紀錄寫回它身上。
        const _C = _cards(); const _cid = _cardChat(null);
        const _card = (_C && _cid) ? _C.find(_cid, 'redpacket', packetId) : null;
        const data = (_card && _card.data && _card.data.totalAmount != null) ? _card.data : getRedPacketData(packetId);
        if (!data) {
            console.warn('[RedPacket Grab] 紅包數據不存在:', packetId);
            return null;
        }
        
        // 清理領取者名稱（移除可能的引號等）
        const cleanGrabberName = grabberName.replace(/^["']+|["']+$/g, '').trim();
        
        // 檢查是否已經領取過
        const alreadyGrabbed = data.list.find(item => item.name === cleanGrabberName);
        if (alreadyGrabbed) return alreadyGrabbed.amount; // 返回已領取的金額
        
        // 計算剩餘金額和數量
        const totalGrabbed = data.list.reduce((sum, item) => sum + item.amount, 0);
        const remainingAmount = data.totalAmount - totalGrabbed;
        const remainingCount = data.totalCount - data.list.length;
        
        if (remainingAmount <= 0 || remainingCount <= 0) return null;
        
        // 決定領取金額：如果AI指定了金額則使用指定金額，否則隨機生成
        let grabAmount;
        if (specifiedAmount !== null && specifiedAmount > 0) {
            // AI指定了金額，使用指定金額（但不超過剩餘金額）
            grabAmount = Math.min(specifiedAmount, remainingAmount);
            grabAmount = Math.round(grabAmount * 100) / 100;
        } else {
            // 隨機分配金額（最後一個領取剩餘全部，其他隨機）
            if (remainingCount === 1) {
                grabAmount = Math.round(remainingAmount * 100) / 100; // 最後一個領取剩餘全部
            } else {
                // 隨機分配，最小0.01，最大不超過剩餘金額的90%（留給其他人）
                const maxAmount = Math.min(remainingAmount * 0.9, remainingAmount - (remainingCount - 1) * 0.01);
                const minAmount = 0.01;
                grabAmount = Math.round((Math.random() * (maxAmount - minAmount) + minAmount) * 100) / 100;
            }
        }
        
        // 添加到領取列表
        data.list.push({
            name: cleanGrabberName,
            amount: grabAmount,
            time: new Date().toLocaleString('zh-TW')
        });
        // 寫回「那張卡」而不是 packetId——模型用序號指的時候，packetId 根本不是這張卡的單號
        if (_C && _cid && _card) _C.update(_cid, _card.key, { data: data });

        // 🔥 連動經濟系統（只有當前用戶領取時才增加餘額）
        // 領取者寫暱稱或寫人設名都算是我
        if (win.WX_WALLET && grabAmount > 0 && _isMyName(cleanGrabberName)) {
            const senderName = data.sender || '未知';
            win.WX_WALLET.transaction(grabAmount, `微信紅包 - 來自${senderName}`);
        }

        // 保存數據
        saveRedPacketData(packetId, data);
        return grabAmount; // 返回領取的金額
    }

    // --- 成員ID轉換為名稱 (🔥 修復With顯示問題) ---
    function convertMemberIdsToNames(memberIds) {
        if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
            return [];
        }
        
        const allContacts = (win.WX_CONTACTS && typeof win.WX_CONTACTS.getAllCustomContacts === 'function') 
            ? win.WX_CONTACTS.getAllCustomContacts() 
            : [];
        
        const currentUserName = _meName();

        return memberIds.map(memberId => {
            // 特殊處理 "User" ID
            if (memberId === "User" || memberId === "user") {
                return currentUserName;
            }
            
            // 查找對應的聯繫人（根據ID查找）
            const contact = allContacts.find(c => c.id === memberId);
            if (contact && contact.name) {
                return contact.name;
            }
            
            // 如果找不到對應的聯繫人，返回memberId本身（可能是名稱，或無法轉換的ID）
            // 這樣可以兼容舊數據或已經存儲為名稱的情況
            return memberId;
        });
    }

    // --- 系統意圖處理器 ---
    // 返回處理後的系統消息對象，如果不需要處理則返回null
    // 事後才知道結果的系統訊息（例如換頭像要等生圖）：補一行進那間聊天室
    function _pushSystemLine(chatId, text) {
        try {
            const chat = GLOBAL_CHATS[chatId];
            if (!chat || !text) return;
            chat.messages.push({ type: 'system', content: text, isMe: false });
            chat.pushedCount = chat.messages.length;
            chat.renderedCount = chat.messages.length;
            if (win.WX_DB && win.WX_DB.saveApiChat) win.WX_DB.saveApiChat(chatId, chat);
            if (APP_CONTAINER) {
                if (GLOBAL_ACTIVE_ID === chatId) _rebuildRoomContent(chat);
                else win.wxApp.render();
            }
        } catch (e) { console.warn('[WX] 補系統訊息失敗:', e); }
    }

    function processSystemIntent(content, ctx) {
        if (!content || !ctx.chatId) return null;

        // 處理 [System: 換頭像 描述]。跟更改簽名同一家族：AI 動的是自己的門面。
        // 🚨 這是權限，預設關著。關著的時候連教學都不會進 prompt，所以正常不會收到這行；
        //    真收到了（舊對話殘留、或她剛關掉）就當普通系統訊息，不生圖也不報錯。
        const avatarMatch = content.match(/^\s*(?:更換|更换|換|换|改|換個|换个)\s*(?:頭像|头像|大頭貼|大头贴|avatar)\s*[:：]?\s*(.+)$/i);
        if (avatarMatch) {
            const _av = win.WX_AVATAR_AI || window.WX_AVATAR_AI;
            const _desc = String(avatarMatch[1] || '').replace(/\]+\s*$/, '').trim();
            if (!_desc) return { type: 'system', content: '', isMe: false };
            // 🚨 權限關著時以前是「安靜吞掉」：她叫角色換頭像、畫面上什麼都沒有，
            //    她只會覺得壞了卻不知道要去哪裡開。講一句，並且說清楚開關在哪。
            if (!_av || !_av.isEnabled()) {
                return { type: 'system', content: `${ctx.chatName} 想換頭像，但還沒開放（微信 →「我」→ 設置 → 允許角色換頭像）`, isMe: false };
            }
            // 🚨 生圖是慢動作。以前這裡先印「換了頭像」再去生，生失敗也照樣印——那是假訊息。
            //    改成等結果回來再說話：成功才說換了，失敗就說沒換成、順便講原因。
            const _cid = ctx.chatId, _cname = ctx.chatName;
            _av.apply(_cid, _desc).then(function (r) {
                _pushSystemLine(_cid, (r && r.ok)
                    ? `${_cname} 換了頭像`
                    : `${_cname} 想換頭像，但沒換成：${(r && r.reason) || '不知道為什麼'}`);
            }).catch(function (e) {
                _pushSystemLine(_cid, `${_cname} 想換頭像，但沒換成：${(e && e.message) || e}`);
            });
            return { type: 'system', content: '', isMe: false };
        }

        // 👁 它看完我的頭像之後寫回來的那一句 → 存起來當長期記憶，之後就不用再送圖。
        //    這一行不給她看：她要確認的話在「我」那頁看得到它記住了什麼。
        //    ⚠️ 排在換頭像那條之前也沒關係——那條規定動詞在前（換／改頭像），這條是光禿禿的「頭像」開頭。
        const seenMatch = content.match(/^\s*(?:頭像|头像|大頭貼|大头贴)\s*[:：]?\s*(.+)$/);
        if (seenMatch) {
            try {
                const _avS = win.WX_AVATAR_AI || window.WX_AVATAR_AI;
                if (_avS && _avS.rememberSeen) _avS.rememberSeen(ctx.chatId, String(seenMatch[1] || '').replace(/\]+\s*$/, '').trim());
            } catch (e) {}
            return { type: 'system', content: '', isMe: false };
        }

        // 📷 它看完她傳的照片寫回來的描述：[系統: 照片 1 描述] → 存到那則照片訊息上，之後只送文字（見 _photoOnceMessage）
        const photoSeenMatch = content.match(/^\s*(?:照片|相片)\s*(\d+)?\s*[:：]?\s*(.+)$/);
        if (photoSeenMatch) {
            try { _rememberPhoto(ctx.chatId, parseInt(photoSeenMatch[1], 10), String(photoSeenMatch[2] || '').replace(/\]+\s*$/, '').trim()); } catch (e) {}
            return { type: 'system', content: '', isMe: false };
        }

        // 🔗 它看完程式替它打開的網頁寫回來的重點：[系統: 網頁 1 …] → 存到那個連結上，之後只送這句（見 _linkBrief）
        const linkSeenMatch = content.match(/^\s*(?:網頁|网页)\s*(\d+)?\s*[:：]?\s*(.+)$/);
        if (linkSeenMatch) {
            try { _rememberLink(parseInt(linkSeenMatch[1], 10), String(linkSeenMatch[2] || '').replace(/\]+\s*$/, '').trim()); } catch (e) {}
            return { type: 'system', content: '', isMe: false };
        }

        // 處理 [System: 改名 XXX]。以前完全沒有這條，AI 想改名只能寫成一句話、變成一顆泡泡。
        // 做的事跟她在資料頁手動改名一模一樣：改顯示名、重畫、存檔。不碰通訊錄，跟手動那條一致。
        const renameMatch = content.match(/^\s*(?:改名|更名|改暱稱|改昵称|換名字|换名字|改個名字|改个名字|rename)\s*(?:為|为|成|to)?\s*[:：]?\s*(.+)$/i);
        if (renameMatch) {
            let _newName = String(renameMatch[1] || '').replace(/\]+\s*$/, '').replace(/^["'「『]+|["'」』]+$/g, '').trim();
            if (_newName && _newName.length <= 24 && GLOBAL_CHATS[ctx.chatId]) {
                const _old = GLOBAL_CHATS[ctx.chatId].name || ctx.chatName;
                GLOBAL_CHATS[ctx.chatId].name = _newName;
                try { if (win.OS_DB && win.OS_DB.saveApiChat) win.OS_DB.saveApiChat(ctx.chatId, GLOBAL_CHATS[ctx.chatId]); } catch (e) {}
                try { if (win.wxApp && win.wxApp.saveChats) win.wxApp.saveChats(); } catch (e) {}
                setTimeout(function () { try { win.wxApp && win.wxApp.render && win.wxApp.render(); } catch (e) {} }, 100);
                return { type: 'system', content: _old + ' 改名為「' + _newName + '」', isMe: false };
            }
            return { type: 'system', content: '', isMe: false };   // 名字空的或太長：什麼都不做，也不要印假訊息
        }

        // 處理 [System: 更改簽名 to XXX]
        // 🚨 動詞清單以前沒有單獨的「改」，而且一定要有冒號或「為」才收。
        //    所以 AI 寫「改簽名 最近很煩」會整條漏掉，變成一顆印著協議原文的泡泡——
        //    她實測就是撞到這個（頭像改成功、簽名沒改到）。現在「改／換」也算動詞，
        //    中間的「個性」可有可無，後面接空白也行，不強迫寫冒號。
        const bioMatch = content.match(/(?:改|更改|修改|更新|換|换|變更|变更|changed?|updated?|set)\s*(?:個性|个性)?\s*(?:簽名|签名|Bio|Signature|狀態|status)\s*(?:為|为|成|to)?\s*[:：]?\s*(.+)/i);
        if (bioMatch) {
            let newBio = bioMatch[1].replace(/["']/g, "").trim();
            if (newBio.endsWith(']')) newBio = newBio.slice(0, -1);
            if (newBio && GLOBAL_CHATS[ctx.chatId]) {
                GLOBAL_CHATS[ctx.chatId].desc = newBio;
                GLOBAL_CHATS[ctx.chatId].bio = newBio;
                try {
                    const key = `wx_chat_settings_${ctx.chatId}`;
                    const settings = localStorage.getItem(key) ? JSON.parse(localStorage.getItem(key)) : {};
                    if (GLOBAL_CHATS[ctx.chatId].isGroup) settings.groupNotice = newBio;
                    else settings.targetBio = newBio;
                    localStorage.setItem(key, JSON.stringify(settings));
                } catch(e) {}
                return { type: 'system', content: `${ctx.chatName} 更新了簽名：${newBio}`, isMe: false }; 
            }
        }
        // 處理 [System: XXX領取了紅包|紅包ID] 或 [System: XXX領取了紅包 4.44元|紅包ID]
        // AI必須輸出金額，不執行JS隨機抽取（只有用戶點擊紅包時才執行JS隨機抽取）
        const redPacketGrabMatch1 = content.match(/(.*?)(?:領取|领取|領了|grabbed|received).*?(?:紅包|红包|RedPacket)([^|｜]*)[|｜](.+)/i);
        if (redPacketGrabMatch1) {
            const grabberName = redPacketGrabMatch1[1].trim();
            const amountText = redPacketGrabMatch1[2].trim(); // 可能包含金額，如 " 4.44元" 或空字符串
            let packetId = redPacketGrabMatch1[3].trim();
            // 移除末尾可能存在的 ] 字符（如果系統消息格式是 [系統: ...|ID]）
            packetId = packetId.replace(/\]+\s*$/, '').trim();
            
            // 嘗試從amountText中提取AI指定的金額（AI必須輸出金額）
            let specifiedAmount = null;
            const amountMatch = amountText.match(/([\d.]+)\s*元?/);
            if (amountMatch) {
                specifiedAmount = parseFloat(amountMatch[1]);
            }
            
            if (packetId) {
                // AI必須輸出金額，否則不處理（返回null，讓它作為普通系統消息處理）
                if (specifiedAmount === null || specifiedAmount <= 0) {
                    console.warn('[SystemIntent] AI未指定金額，不處理紅包領取（要求AI輸出金額）');
                    return null; // 返回null，讓它作為普通系統消息處理
                }
                
                // AI指定了金額，使用AI的金額更新紅包數據
                const grabAmount = processRedPacketGrab(packetId, grabberName, specifiedAmount);
                if (grabAmount !== null) {
                    // 🚨講人話，別把協議原文攤在畫面上：AI 寫的是「丹領取了紅包 4.44元|rp_001」，
                    //   原樣顯示就把紅包 ID 也印出來了（她實測看到這種技術字串，說「格式跑出來就是不對」）
                    // 🚨 名字要剝掉引號再上畫面。協議模板寫的就是 [系統: "Char"領取了紅包…]，模型照抄，
                    //    於是畫面上出現「"測試系統"領取了紅包」——引號是協議的東西，不是人話。
                    const _who = String(grabberName || '').replace(/^["'「『]+|["'」』]+$/g, '').trim();
                    return { type: 'system', content: `${_who || '對方'}領取了紅包 ¥${specifiedAmount}`, isMe: false };
                } else {
                    console.warn('[SystemIntent] processRedPacketGrab 返回 null，領取失敗');
                }
            } else {
                console.warn('[SystemIntent] packetId 為空，無法處理');
            }
        }
        // 兼容格式：[系統] XXX領取了紅包 (rp_12345) - 同樣要求AI輸出金額
        const redPacketGrabMatch2 = content.match(/(.*?)(?:領取|领取|領了|grabbed|received).*?(?:紅包|红包|RedPacket)(.*?)[\(（]([a-zA-Z0-9_]+)[\)）]/i);
        if (redPacketGrabMatch2) {
            const grabberName = redPacketGrabMatch2[1].trim();
            const amountText = redPacketGrabMatch2[2].trim();
            let packetId = redPacketGrabMatch2[3].trim();
            // 移除末尾可能存在的 ] 字符
            packetId = packetId.replace(/\]$/, '');
            
            // 嘗試從amountText中提取AI指定的金額（AI必須輸出金額）
            let specifiedAmount = null;
            const amountMatch = amountText.match(/([\d.]+)\s*元?/);
            if (amountMatch) {
                specifiedAmount = parseFloat(amountMatch[1]);
            }
            
            if (packetId) {
                // AI必須輸出金額，否則不處理
                if (specifiedAmount === null || specifiedAmount <= 0) {
                    console.warn('[SystemIntent] 兼容格式：AI未指定金額，不處理紅包領取');
                    return null;
                }
                
                const grabAmount = processRedPacketGrab(packetId, grabberName, specifiedAmount);
                if (grabAmount !== null) {
                    // 🚨 名字要剝掉引號再上畫面。協議模板寫的就是 [系統: "Char"領取了紅包…]，模型照抄，
                    //    於是畫面上出現「"測試系統"領取了紅包」——引號是協議的東西，不是人話。
                    const _who = String(grabberName || '').replace(/^["'「『]+|["'」』]+$/g, '').trim();
                    return { type: 'system', content: `${_who || '對方'}領取了紅包 ¥${specifiedAmount}`, isMe: false };
                }
            }
        }
        
        // 處理 [System: Accept 物品名|Gft_ID] 或 [System: Return 物品名|Gft_ID]
        const giftActionMatch1 = content.match(/^\s*(Accept|Return|接收|接收了|收下|收下了|退回|退回了|拒绝|拒絕)\s+(.+?)\s*[|｜](.+)$/i);
        // 🚨 禮物是 [Accept 物品名|單號]，轉帳是 [Accept 金額|單號]——兩條長得一模一樣，
        //    差別只在中間那段是不是純數字。禮物這條排在轉帳前面，於是以前每一筆轉帳的收下／退回
        //    都被這裡先吃掉：轉帳狀態沒被改、錢沒動、卡片還能再按一次，畫面上還寫「對方已收下「200」」
        //    （把金額當成禮物名）。連協議文件裡的範例 Accept 520|Txn_88 也一樣中。
        //    畫面那端本來就用「純數字＝轉帳」在分，這裡照同一條規則，單號自己表明身分時以單號為準。
        const _giftIsActuallyTransfer = (function () {
            if (!giftActionMatch1) return false;
            const _item = String(giftActionMatch1[2] || '').trim();
            const _id = String(giftActionMatch1[3] || '').trim();
            if (/^(?:ID_)?T(?:xn|nx)/i.test(_id)) return true;      // 單號自己說是轉帳
            if (/^(?:ID_)?Gft/i.test(_id)) return false;            // 單號自己說是禮物
            return /^\d+(?:\.\d+)?$/.test(_item);                  // 都沒說 → 純數字就是金額
        })();
        if (giftActionMatch1 && !_giftIsActuallyTransfer) {
            const action = giftActionMatch1[1].trim().toLowerCase();
            const itemName = giftActionMatch1[2].trim();
            const giftId = giftActionMatch1[3].trim();
            const isAccept = action === 'accept' || action === '接收' || action === '接收了' || action === '收下' || action === '收下了';
            const uniqueId = giftId.startsWith('ID_') ? giftId : ('ID_' + giftId);
            _setCardStatus(ctx.chatId, 'gift', giftId, isAccept ? 'accepted' : 'returned', uniqueId);
            // 口徑跟轉帳那條一致：講「對方做了什麼」，禮物名帶引號，ID 不露出來
            const _giftWhat = itemName ? `「${itemName}」` : '禮物';
            return { type: 'system', content: isAccept ? `對方已收下${_giftWhat}` : `對方已退回${_giftWhat}`, isMe: false };
        }
        // 兼容格式：[系統] XXX接收了禮物 (Gft_423) 或 [系統] XXX拒絕了禮物 (Gft_423)
        const giftActionMatch2 = content.match(/(.*?)(?:接收|接收了|收下|收下了|Accept|退回|退回了|拒绝|拒絕|Return).*?(?:禮物|礼物|Gift).*?[\(（]([a-zA-Z0-9_]+)[\)）]/i);
        if (giftActionMatch2) {
            const actionText = giftActionMatch2[1].trim().toLowerCase();
            const giftId = giftActionMatch2[2].trim();
            const isAccept = actionText.includes('接收') || actionText.includes('收下') || actionText.includes('accept');
            const uniqueId = giftId.startsWith('ID_') ? giftId : ('ID_' + giftId);
            _setCardStatus(ctx.chatId, 'gift', giftId, isAccept ? 'accepted' : 'returned', uniqueId);
            // actionText 是動詞前面那段，通常就是人名；沒抓到就用「對方」
            const _giftWho = giftActionMatch2[1].trim().replace(/[\[\]|｜]/g, '').trim();
            return { type: 'system', content: `${_giftWho || '對方'}${isAccept ? '收下了禮物' : '退回了禮物'}`, isMe: false };
        }
        
        // 處理 [System: Accept 金額|Txn_ID] 或 [System: Return 金額|Txn_ID]
        // 先清理 content，移除可能的 ] 字符
        let cleanContent = content.trim().replace(/\]+\s*$/, '');
        const transferActionMatch1 = cleanContent.match(/^\s*(Accept|Return|接收|接收了|收下|收下了|退回|退回了|拒绝|拒絕)\s+(\d+(?:\.\d+)?)\s*[|｜](.+)$/i);
        if (transferActionMatch1) {
            const action = transferActionMatch1[1].trim().toLowerCase();
            const amount = transferActionMatch1[2].trim();
            let txnId = transferActionMatch1[3].trim();
            // 移除末尾可能存在的 ] 字符
            txnId = txnId.replace(/\]+\s*$/, '').trim();
            const isAccept = action === 'accept' || action === '接收' || action === '接收了' || action === '收下' || action === '收下了';
            // 🚨 模型現在多半寫「號碼」（待處理清單就是教它這樣寫），不是原本的單號。
            //    要領哪一張用寬鬆查找（跟紅包同一個道理，指涉不清就是剛剛那張），但找到之後
            //    必須記住那張卡的真名——後面讀單據、存單據、寫狀態都得用真名，否則會在旁邊
            //    另外長出一張叫「20」的新卡，原本那張永遠停在待處理、卡片也一直能按。
            let _txnRef = txnId;
            try {
                const _C3 = _cards(); const _cid3 = _cardChat(ctx.chatId);
                const _tc = (_C3 && _cid3) ? _C3.find(_cid3, 'transfer', txnId) : null;
                if (_tc && _tc.alias) _txnRef = String(_tc.alias);
            } catch (e) {}
            const uniqueId = _txnRef.startsWith('ID_') ? _txnRef : ('ID_' + _txnRef);
            // 轉帳單與狀態都走這個聊天室的帳本（見檔案上方 _txnLoad/_setCardStatus 的說明）
            const transferData = _txnLoad(ctx.chatId, _txnRef);
            if (transferData) {
                const now = Date.now();
                const elapsed = now - transferData.timestamp;
                const tenMinutes = TXN_TTL;
                
                if (isAccept) {
                    // 接收：檢查是否還在時效內且狀態為pending
                    if (transferData.status === 'pending' && elapsed <= tenMinutes) {
                        // 扣款並轉帳給對方
                        if (win.WX_WALLET) {
                            const amountNum = parseFloat(amount);
                            const success = win.WX_WALLET.transaction(-amountNum, `微信轉帳給 ${transferData.targetName}`);
                            if (success) {
                                // 更新轉帳狀態
                                transferData.status = 'accepted';
                                _txnSave(ctx.chatId, _txnRef, transferData);
                                _setCardStatus(ctx.chatId, 'transfer', _txnRef, 'accepted', uniqueId);
                            } else {
                                // 餘額不足，視為拒絕
                                transferData.status = 'returned';
                                _txnSave(ctx.chatId, _txnRef, transferData);
                                _setCardStatus(ctx.chatId, 'transfer', _txnRef, 'returned', uniqueId);
                                const displayContent = `轉帳失敗：餘額不足`;
                                return { type: 'system', content: displayContent, isMe: false };
                            }
                        } else {
                            // 沒有經濟系統，直接標記為接收
                            transferData.status = 'accepted';
                            _txnSave(ctx.chatId, _txnRef, transferData);
                            _setCardStatus(ctx.chatId, 'transfer', _txnRef, 'accepted', uniqueId);
                        }
                    } else if (transferData.status === 'expired' || elapsed > tenMinutes) {
                        // 已過期，視為拒絕
                        transferData.status = 'expired';
                        _txnSave(ctx.chatId, _txnRef, transferData);
                        _setCardStatus(ctx.chatId, 'transfer', _txnRef, 'expired', uniqueId);
                        const displayContent = `轉帳已過期`;
                        return { type: 'system', content: displayContent, isMe: false };
                    } else if (transferData.status !== 'pending') {
                        // 已經處理過（accepted/returned），不重複處理
                        _setCardStatus(ctx.chatId, 'transfer', _txnRef, transferData.status, uniqueId);
                    }
                } else {
                    // 拒絕：不扣款，只更新狀態
                    transferData.status = 'returned';
                    _txnSave(ctx.chatId, _txnRef, transferData);
                    _setCardStatus(ctx.chatId, 'transfer', _txnRef, 'returned', uniqueId);
                }
            } else {
                // 沒有找到轉帳記錄，可能是舊格式或手動輸入，直接標記狀態
                _setCardStatus(ctx.chatId, 'transfer', _txnRef, isAccept ? 'accepted' : 'returned', uniqueId);
            }
            
            // 更新系統消息內容，使用統一的顯示格式
            const displayContent = isAccept ? `對方已接收轉帳 ${amount}元` : `對方已拒絕轉帳 ${amount}元`;
            
            // 🔥 強制觸發重新渲染，以便更新轉帳卡片狀態
            setTimeout(() => {
                if (win.wxApp && typeof win.wxApp.render === 'function') {
                    win.wxApp.render();
                }
            }, 200);
            
            return { type: 'system', content: displayContent, isMe: false };
        }
        // 兼容格式：[系統] XXX接收了轉帳 (Tnx_123) 或 [系統] XXX退回轉帳 (Tnx_123)
        const transferActionMatch2 = content.match(/(.*?)(?:接收|接收了|收下|收下了|Accept|退回|退回了|拒绝|拒絕|Return).*?(?:轉帳|转账|Transfer).*?[\(（]([a-zA-Z0-9_]+)[\)）]/i);
        if (transferActionMatch2) {
            const actionText = transferActionMatch2[1].trim().toLowerCase();
            const txnId = transferActionMatch2[2].trim();
            const isAccept = actionText.includes('接收') || actionText.includes('收下') || actionText.includes('accept');
            const uniqueId = txnId.startsWith('ID_') ? txnId : ('ID_' + txnId);
            _setCardStatus(ctx.chatId, 'transfer', txnId, isAccept ? 'accepted' : 'returned', uniqueId);
            const _txnWho = transferActionMatch2[1].trim().replace(/[\[\]|｜]/g, '').trim();
            return { type: 'system', content: `${_txnWho || '對方'}${isAccept ? '已接收轉帳' : '已退回轉帳'}`, isMe: false };
        }
        
        // 處理舊格式 [System: 領取紅包]（兼容）
        if (content.match(/(?:領取|领取|Received|Accepted).*(?:紅包|红包|RedPacket|轉帳|转账|Transfer)/i)) {
            return { type: 'system', content: content, isMe: false };
        }
        return null;
    }

    // 🚨行首的 [xxx] 是發話人還是媒體標籤？清單跟 wx_view 共用同一份（繁簡都齊）。
    //   以前這裡兩處各自手打、繁體全缺，AI 寫 [視頻] 這種裸標籤會被當成某個人在說話。
    //   保底那份只是防 wx_view 還沒載入，正常情況一律走共用的。
    function _isMediaTag(tag) {
        const V = win.WX_VIEW || window.WX_VIEW;
        const tags = (V && V.MSG_TAG && V.MSG_TAG.ALL) ? V.MSG_TAG.ALL
            : '语音|語音|Voice|图片|圖片|照片|Img|红包|紅包|RedPacket|表情包|Sticker|转账|轉帳|轉賬|Transfer|位置|Location|定位|视频|視頻|影片|Video|文件|File|礼品|礼物|禮品|禮物|Gift';
        return new RegExp('^(?:' + tags + ')$', 'i').test(String(tag == null ? '' : tag).trim());
    }

    // --- 解析邏輯 (將長文本切成陣列) ---
    function parseAndProcess(fullText) {
        let cleanText = fullText.trim();
        // 對齊 VN PHONE：只提取 <chat chatroom="...">…</chat> 容器「內部」的內容（容器外的思考/旁白一律丟掉）
        const _chatM = cleanText.match(/<chat\b[^>]*>([\s\S]*?)<\/chat>/i);
        if (_chatM) cleanText = _chatM[1].trim();
        // 殘留 <chat> 標籤 + 相容舊 [wx_os] 包裹一併清掉
        cleanText = cleanText.replace(/<\/?chat\b[^>]*>/gi, '').replace(/\[\s*wx_os\s*\]/gi, '').replace(/\[\s*\/wx_os\s*\]/gi, '').trim();
        cleanText = cleanText.replace(/\[\s*(?:紅包|RedPacket)\s*[:：]\s*(\d+(?:\.\d+)?)\s*[\(（]\s*(?:備註|备注|Note)?\s*[:：]?\s*(.*?)\s*[\)）]/gi, '[RedPacket: $1 | $2]');

        // 🔥 關鍵：這裡會依照換行符號切割成多個泡泡
        const lines = cleanText.split('\n');
        const extractedMessages = [];
        
        let ctx = { chatName: "Unknown", chatId: "temp", members: [], lastTime: "" };
        if (GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) {
            const c = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
            ctx.chatName = c.name; ctx.chatId = c.id; ctx.members = c.members || [];
        }
        
        // 🔥 第一遍掃描：預先處理上下文信息（Chat, With, Time）並保存所有紅包數據
        let tempCtx = { chatName: ctx.chatName, chatId: ctx.chatId, members: ctx.members };
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;
            
            // 處理 [Chat: ID] 標頭
            const chatMatch = line.match(/^\[\s*Chat\s*[:：]\s*([^|\]\n]+)(?:\|\s*([^\]\n]+))?\s*\]/i);
            if (chatMatch) {
                let name = chatMatch[1].trim();
                let id = chatMatch[2] ? chatMatch[2].trim() : name;
                tempCtx.chatName = name;
                tempCtx.chatId = id;
                return;
            }
            
            // 處理 [With: ...]
            const withMatch = line.match(/^\[\s*With\s*[:：]\s*(.*?)\s*\]/i);
            if (withMatch) {
                tempCtx.members = withMatch[1].split(/[,，、]/).map(s => s.trim()).filter(s => s);
                return;
            }
            
            // 處理普通消息中的紅包：預先保存紅包數據
            const nameMatch = line.match(/^\[(.*?)(?:[:：])?\]\s*(.*)/);
            if (nameMatch) {
                const tag = nameMatch[1];
                const content = nameMatch[2].trim();
                if (content && content.match(/\[\s*(?:紅包|RedPacket)\s*[:：]/i)) {
                    // 獲取發送者名稱
                    let senderName = tempCtx.chatName || "User";
                    if (!_isMediaTag(tag)) {
                        senderName = tag;
                    }
                    ensureRedPacketData(content, senderName);
                }
            }
        });

        lines.forEach(line => {
            line = line.trim(); 
            if (!line) return;

            // 📅 在微信裡約好的事 → 寫進日曆。用的是正文那邊同一個標籤，不另外發明一套，
            //    兩邊寫進同一本主角狀態，AI 之後在正文才對得上「上禮拜在微信說好的」。
            //    以前這行會被下面的發話人判斷當成一個叫「Event|6/25|…」的人，內容是空的就靜默丟掉。
            const evMatch = line.match(/^\[\s*Event\s*[|｜]\s*([^|｜\]]+)\s*[|｜]\s*([^\]]+)\]/i);
            if (evMatch) {
                try {
                    const M = win.OS_MC_STATUS;
                    if (M && M.addEvent) M.addEvent(evMatch[1].trim(), evMatch[2].trim(), '', 'wx');
                } catch (e) { console.warn('[WX] 約定寫進日曆失敗（不影響訊息）:', e); }
                return;   // 這是給日曆的，不是一顆泡泡
            }

            // 處理 [Chat: ID] 標頭
            const chatMatch = line.match(/^\[\s*Chat\s*[:：]\s*([^|\]\n]+)(?:\|\s*([^\]\n]+))?\s*\]/i);
            if (chatMatch) {
                let name = chatMatch[1].trim(); 
                let id = chatMatch[2] ? chatMatch[2].trim() : name;
                ctx.chatName = name; ctx.chatId = id;
                if (!GLOBAL_CHATS[id]) { GLOBAL_CHATS[id] = { name: name, id: id, messages: [], lastTime: '', members: [], isGroup: false, unread: true, pushedCount: 0, renderedCount: 0 }; } 
                else { GLOBAL_CHATS[id].name = name; }
                return;
            }

            // 處理 [With: ...]
            const withMatch = line.match(/^\[\s*With\s*[:：]\s*(.*?)\s*\]/i);
            if (withMatch) {
                ctx.members = withMatch[1].split(/[,，、]/).map(s => s.trim()).filter(s => s);
                if (GLOBAL_CHATS[ctx.chatId]) { GLOBAL_CHATS[ctx.chatId].members = ctx.members; GLOBAL_CHATS[ctx.chatId].isGroup = GLOBAL_CHATS[ctx.chatId].isGroup || ctx.members.length > 2; }
                return;
            }

            // 處理 [Time]
            if (line.match(/^\[\s*Time\s*\]/i)) {
                let timeStr = line.replace(/^\[\s*Time\s*\]/i, '').trim();
                if (timeStr && GLOBAL_CHATS[ctx.chatId]) {
                    GLOBAL_CHATS[ctx.chatId].lastTime = timeStr;
                    // 添加到extractedMessages以保持順序
                    extractedMessages.push({ type: 'time', content: timeStr, isMe: false });
                }
                ctx.lastTime = timeStr; return;
            }

            // 處理 [System]
            const sysMatch = line.match(/^\[\s*(Notice|System|系統|系统)\s*([:：\]])\s*(.*)/i);
            if (sysMatch) {
                let content = sysMatch[3] || "";
                if (!content && !line.includes(':') && !line.includes('：')) { content = line.replace(/^\[\s*(Notice|System|系統|系统)\s*\]\s*/i, ''); }
                // 移除末尾的 ] 字符（如果存在）
                content = content.replace(/\]+\s*$/, '').trim();
                if (content) {
                    const sysMsgObj = processSystemIntent(content, ctx);
                    if (sysMsgObj && sysMsgObj.content === '') { return; }   // 解析過但刻意不顯示（例如權限關著的換頭像）
                    if (sysMsgObj) {
                        // 返回處理後的系統消息對象，加入到extractedMessages以保持順序
                        extractedMessages.push(sysMsgObj);
                    } else if (GLOBAL_CHATS[ctx.chatId]) {
                        // 如果沒有特殊處理，添加普通系統消息
                        extractedMessages.push({ type: 'system', content: content, isMe: false });
                    }
                }
                return; 
            }

            // 處理普通對話
            const nameMatch = line.match(/^\[(.*?)(?:[:：])?\]\s*(.*)/); 
            let sender = ctx.chatName; let content = line; let isMe = false;

            if (nameMatch) {
                const tag = nameMatch[1];
                if (!_isMediaTag(tag)) {
                    sender = tag; content = nameMatch[2].trim();
                    // 🚨🚨這裡「一律不是她」，不做任何判斷。
                    //   微信是她自己的手機，視角是固定的：這條路走的是 AI 的回覆，
                    //   AI 扮的一定是對方，右邊那一側只留給她自己按送出的訊息。
                    //   VN 手機才需要分左右——那邊劇情會演到別人的手機（owner 點名制）。
                    //   舊寫法看發話人的名字猜，最寬鬆那條是「私聊裡名字不等於聊天室名＝她」，
                    //   於是 AI 寫 [系統]、[User] 或任何自創的名字都會跑到她那一側，
                    //   變成「AI 冒充她說話」（她實測看到系統通知出現在自己的綠泡泡裡）。
                    //   sender 照樣留著：群聊要顯示是誰說的。
                    isMe = false;
                    // 格式說明寫的是 [Char]（代表對方），AI 常照字面抄 → 私聊裡換回聊天室那位，別存成一個叫 Char 的人
                    if (/^\s*(?:\{\{\s*char\s*\}\}|char)\s*$/i.test(tag) && GLOBAL_CHATS[ctx.chatId] && !GLOBAL_CHATS[ctx.chatId].isGroup) sender = ctx.chatName;
                } else { content = line; }
            }

            if (!content) return;

            // 🔥 處理帶發送者標籤的系統消息：[丹] [系統: 丹領取了紅包|rp_leon_001]
            const embeddedSysMatch = content.match(/^\[\s*(Notice|System|系統|系统)\s*[:：]\s*(.*)/i);
            if (embeddedSysMatch) {
                let sysContent = embeddedSysMatch[2].trim();
                // 移除末尾的 ] 字符（如果存在）
                sysContent = sysContent.replace(/\]+\s*$/, '').trim();
                const sysMsgObj = processSystemIntent(sysContent, ctx);
                if (sysMsgObj && sysMsgObj.content === '') return;   // 同上
                if (sysMsgObj) {
                    extractedMessages.push(sysMsgObj);
                    return;
                }
            }
            
            // 注意：紅包數據已在第一遍掃描時保存，這裡不需要再次保存
            
            const memberNames = convertMemberIdsToNames(ctx.members);
            const memberStr = memberNames.length > 0 ? memberNames.join(', ') : ctx.chatName;
            const singleRaw = `[Chat: ${ctx.chatName}|${ctx.chatId}]\n[With: ${memberStr}]\n[${sender}] ${content}`;

            if (GLOBAL_CHATS[ctx.chatId]) {
                // 引用回覆：標記在內容最前面，解析規則跟跑團同步、VN 手機共用同一份（OS_API.chatQuote）。
                // 🚨這條路（AI 在 app 裡直接回覆）以前漏了解析，所以 AI 寫的 [引用|誰:那句話]
                //   只會原樣留在泡泡開頭當文字，不會變成正文下面那條灰塊（她實測看到的就是這個）。
                //   引用完後面沒東西就當它沒引用——只有一個引用塊沒正文不是一則訊息。
                //   raw 保持原樣（含引用標記），重建時才還原得回來。
                const _qp = (win.OS_API && win.OS_API.chatQuote) ? win.OS_API.chatQuote.parse(content) : null;
                const _hasQ = !!(_qp && _qp.name && _qp.text && _qp.rest);
                // 🔥 [Fix] NPC 訊息也打上 senderName 快照，防止 NPC 改名後歷史錯亂
                const msgObj = {
                    type: 'msg',
                    isMe: isMe,
                    content: _hasQ ? _qp.rest : content,
                    sender: sender,
                    senderName: sender, // <--- 新增
                    quoteName: _hasQ ? _qp.name : '',
                    quoteText: _hasQ ? _qp.text : '',
                    raw: singleRaw
                };
                extractedMessages.push(msgObj);
            }
        });
        return extractedMessages;
    }

    // --- 渲染隊列處理器 ---
    function processRenderQueue() {
        if (RENDER_QUEUE_PROCESSING || RENDER_QUEUE.length === 0 || !APP_CONTAINER || document.hidden) return;   // 分頁背景化先不渲染，回前景照常消化隊列
        RENDER_QUEUE_PROCESSING = true;
        const batchSize = 5; let processed = 0;
        while (RENDER_QUEUE.length > 0 && processed < batchSize) {
            const nextItem = RENDER_QUEUE.shift();
            const roomContainer = APP_CONTAINER.querySelector('#wxRoomContent');
            if (nextItem.chatId === GLOBAL_ACTIVE_ID && roomContainer) {
                const currentChat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
                if (currentChat) {
                    if (window.WX_VIEW && typeof window.WX_VIEW.renderBubble === 'function') {
                        try {
                            const html = window.WX_VIEW.renderBubble(nextItem.msg, currentChat, true, nextItem.index);
                            roomContainer.insertAdjacentHTML('beforeend', html);
                            currentChat.renderedCount = Math.max(currentChat.renderedCount, nextItem.index + 1);
                        } catch (e) { console.error('[Queue] 渲染失敗:', e); }
                    }
                }
            }
            processed++;
        }
        const now = Date.now();
        if (now - LAST_RENDER_TIME > 100) {
            const roomPage = APP_CONTAINER.querySelector('.wx-room-scroll');
            if (roomPage) { requestAnimationFrame(() => { roomPage.scrollTop = roomPage.scrollHeight; }); }
            LAST_RENDER_TIME = now;
        }
        RENDER_QUEUE_PROCESSING = false;
    }
    setInterval(processRenderQueue, 30);

    // ── 聊天室 id 對應表（AI 整理產出：舊亂 id → 統一 id）。不動歷史、解析/注入時套用、按 tavern chatId 隔離 ──
    //    跨 IIFE 共用：os_app_memory_inject 的 injectWxChatrooms 也讀同一把 key 套用。
    function _wxRemapChatId() {
        try { var ST = win.SillyTavern; if (ST && ST.getCurrentChatId) { var id = ST.getCurrentChatId(); if (id != null && id !== '') return String(id); } } catch (e) {}
        return '_global';
    }
    function _loadRoomRemap() {
        try { var all = JSON.parse(localStorage.getItem('wx_room_id_remap') || '{}'); return all[_wxRemapChatId()] || {}; } catch (e) { return {}; }
    }
    function _saveRoomRemap(map) {
        try { var all = JSON.parse(localStorage.getItem('wx_room_id_remap') || '{}'); all[_wxRemapChatId()] = map || {}; localStorage.setItem('wx_room_id_remap', JSON.stringify(all)); } catch (e) {}
    }

    // 解析酒館正文裡的 <chat chatroom="名">…</chat> 區塊 → {房名:{name,members,msgs}}（給「發現」tab 的跑團手機記錄唯讀檢視）
    function _parseVnChatBlocks(fullText) {
        const rooms = {};
        if (!fullText) return rooms;
        const _remap = _loadRoomRemap();   // AI 整理產出的「舊id→統一id」對應表（沒整理過就空）
        // 容器開頭可帶任意順序屬性：chatroom="名" 與（可選）id="穩定id"
        const blockRe = /<chat\s+([^>]*?)>([\s\S]*?)<\/chat>/gi;
        let bm;
        while ((bm = blockRe.exec(fullText))) {
            const attrs = bm[1] || '';
            const roomName = ((attrs.match(/chatroom\s*=\s*["']?([^"'>]*)["']?/i)?.[1] || '').trim()) || '對話';
            const attrId = (attrs.match(/(?:^|\s)id\s*=\s*["']?([^"'>]*)["']?/i)?.[1] || '').trim();
            const body = bm[2] || '';
            // 🔑 穩定 ID 分群 key 優先序：<chat> 的 id 屬性 > 內文 [Chat: 名|ID] > 退回房名（AI 改群名但 ID 不變→合回同一間）
            let roomId = attrId, nameFromHdr = '';
            const rawLines = body.split('\n');
            for (let li = 0; li < rawLines.length; li++) {
                const ch = rawLines[li].trim().match(/^\[\s*Chat\s*[:：]\s*([^\]]*)\]/i);
                if (ch) { const ps = ch[1].split('|'); nameFromHdr = (ps[0] || '').trim(); if (!roomId && ps[1]) roomId = ps[1].trim(); break; }
            }
            let key = roomId || roomName;
            key = _remap[key] || key;   // AI 整理過：舊亂 id（或名）→ 統一 id，同一間合回一張卡
            const dispName = nameFromHdr || roomName;
            // 📱 誰的手機：owner="名" 屬性明寫才換視角，沒寫＝主角（使用者人設名）。[With] 只當名單，順序不算數
            const attrOwner = (attrs.match(/(?:^|\s)owner\s*=\s*["']?([^"'>]*)["']?/i)?.[1] || '').trim();
            if (!rooms[key]) rooms[key] = { id: key, name: dispName, members: [], msgs: [], owner: '' };
            else if (dispName) rooms[key].name = dispName;   // 名字以最新一次為準
            if (attrOwner) rooms[key].owner = attrOwner;
            const me = rooms[key].owner || '';
            const myName = _storyMyName();
            rawLines.forEach(function (line) {
                line = line.trim();
                if (!line) return;
                const withM = line.match(/^\[\s*With\s*[:：]\s*(.*?)\s*\]/i);
                if (withM) { const ppl = withM[1].split(/[,，、]/).map(function (s) { return s.trim(); }).filter(Boolean); if (ppl.length) rooms[key].members = ppl; return; }
                const nameM = line.match(/^\[([^\]]+?)\]\s*([\s\S]*)$/);   // [名] 內容
                if (!nameM) return;
                let rawName = nameM[1].trim();
                // 🗑 [系統: 你已刪除好友「X」] 這種冒號寫法：只有刪好友／加回好友這類才收成系統行，其他照舊略過
                const _sysColon = rawName.match(/^(?:系統|系统|System|Notice)\s*[:：]\s*([\s\S]+)$/i);
                if (_sysColon && _friendEventOf(_sysColon[1])) { rooms[key].msgs.push({ type: 'system', content: _sysColon[1].trim(), sender: '系統', isMe: false }); return; }
                if (/[:：]/.test(rawName)) return;                         // [图片:…]/[Chat:…]/[Time…] 等不是發話人 → 略過
                if (/^(Time|時間|时间|Chat|With)$/i.test(rawName)) return;   // [Time] 22:10 這種沒冒號的標頭行也不是發話人
                if (rawName.indexOf('|') >= 0) rawName = rawName.split('|').pop().trim() || rawName;   // [Char|红石]→红石
                const content = (nameM[2] || '').trim();
                if (!content) return;
                if (/^(系統|系统|System|Notice|附加信息|附加訊息|验证信息|驗證信息|验证消息|驗證消息)$/i.test(rawName)) { rooms[key].msgs.push({ type: 'system', content: content, sender: rawName, isMe: false }); return; }
                const isMe = (me && rawName === me) || (myName && myName !== 'User' && rawName === myName) || _isMeName(rawName);
                // 引用回覆：標記在內容最前面，解析規則跟 VN 手機共用同一份（OS_API.chatQuote）。
                // 引用完後面沒東西就當它沒引用——只有一個引用塊沒正文不是一則訊息。
                const _qp = (win.OS_API && win.OS_API.chatQuote) ? win.OS_API.chatQuote.parse(content) : null;
                const _hasQ = !!(_qp && _qp.name && _qp.text && _qp.rest);
                rooms[key].msgs.push({
                    type: 'msg', sender: rawName, isMe: isMe,
                    content: _hasQ ? _qp.rest : content,
                    quoteName: _hasQ ? _qp.name : '', quoteText: _hasQ ? _qp.text : ''
                });
            });
        }
        return rooms;
    }


    // ══════════════════════════════════════════════════════════════════════
    // 📖 跑團同步：酒館正文裡的 <chat chatroom id> 區塊 → 聊天列表 + 通訊錄（取代舊「發現」唯讀檢視）
    //   ・劇情訊息帶 _story=樓號，每次整份從正文重建 → swipe / 編輯 / 刪樓 / 回朔自然跟上。
    //   ・你在同一間房用微信自己打的話沒有 _story，保留；位置靠 _afterFloor（送出當時正文到第幾樓）釘住。
    //   ・私聊房：對方名字對到通訊錄同一位聯絡人，chat id 就是聯絡人 id → 跟手動加 / AI 搜尋加的是同一個人。
    //   ・群：id 用故事 id + 房間 key 組（不同卡同名房不撞），成員各自註冊成聯絡人。
    //   ・注入主模型的手機記憶會跳過 _story 訊息（正文本來就有，不重講）。
    // ══════════════════════════════════════════════════════════════════════
    let _storyLastFloor = -1;      // 最後一次同步時正文最後一樓
    let _storySyncTimer = null;
    let _storySyncing = false;
    let _storySyncAgain = false;
    let _storyStat = { rooms: 0, contacts: 0, floor: -1, at: 0 };

    function _storyHash(s) { let h = 5381; s = String(s || ''); for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
    function _storyCid() { try { const c = win.OS_DB && win.OS_DB.currentChatId ? win.OS_DB.currentChatId() : null; return c == null ? '' : String(c); } catch (e) { return ''; } }
    function _storyMyName() { return _personaName(); }
    // 送給 AI、也寫在訊息上的「我」叫什麼：微信暱稱優先。
    //   真的微信裡別人看到的就是暱稱，不是人設真名；沒設暱稱才退回人設名。
    //   暱稱在微信「我」頁 -> 編輯暱稱，一支手機一個，不分聊天室。
    function _personaName() { try { return win.WX_ME.personaName(); } catch (e) { return 'User'; } }
    function _meName() { try { return win.WX_ME.name(); } catch (e) { return 'User'; } }
    function _isMyName(n) { try { return win.WX_ME.isMine(n); } catch (e) { return false; } }

    // 「我」的所有叫法：人設名、微信暱稱、AI 在主角狀態裡自己寫的主角名（它常寫簡體或不帶星號，跟人設名對不上）、去掉頭尾星號的版本
    let _storyMeAliases = null;
    async function _storyRefreshMeAliases() {
        const set = new Set();
        const add = function (n) { n = String(n || '').trim(); if (!n || n === 'User') return; set.add(n); const bare = n.replace(/^[*＊_]+|[*＊_]+$/g, '').trim(); if (bare) set.add(bare); };
        add(_storyMyName());
        try { const P = win.OS_PERSONA || win.OS_USER; if (P && P.getName) add(P.getName()); } catch (e) {}
        try { const W = win.WX_PROFILE; if (W && W.get) add(W.get().nickname); } catch (e) {}
        try { const M = win.OS_MC_STATUS; if (M && M.load) { const st = await M.load(); if (st && st.name) add(st.name); } } catch (e) {}
        _storyMeAliases = set;
    }
    function _isMeName(n) {
        n = String(n || '').trim();
        if (/^(User|我|主角|You|Self|Me)$/i.test(n)) return true;
        if (_storyMeAliases && _storyMeAliases.has(n)) return true;
        const bare = n.replace(/^[*＊_]+|[*＊_]+$/g, '').trim();
        return !!(bare && _storyMeAliases && _storyMeAliases.has(bare));
    }
    // 好友申請：[系統] "X" 请求添加你为朋友 ＋ 下一行 [附加信息]: … → 回 [{name, bio}]
    const _FRIEND_REQ_RE = /["“「『']?\s*([^"”」』'\s：:]{1,24})\s*["”」』']?\s*(?:请求添加你为朋友|請求添加你為朋友|请求加你为好友|請求加你為好友|请求添加你为好友|請求添加你為好友|发来好友申请|發來好友申請|申请添加你为好友|申請添加你為好友|想加你为好友|想加你為好友)/;
    function _storyFriendRequests(room) {
        const out = [];
        const msgs = room.msgs || [];
        for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];
            if (!m || m.type !== 'system') continue;
            const hit = String(m.content || '').match(_FRIEND_REQ_RE);
            if (!hit) continue;
            let bio = '';
            const nx = msgs[i + 1];
            if (nx && nx.type === 'system' && /^(附加信息|附加訊息|验证信息|驗證信息|验证消息|驗證消息)/.test(String(nx.sender || ''))) bio = String(nx.content || '').replace(/^[:：\s]+/, '').trim().slice(0, 60);
            out.push({ name: hit[1].trim(), bio: bio, floor: m.floor });
        }
        return out;
    }

    // ── 🗑 刪好友 ─────────────────────────────────────────────────────
    // 🚨 同步每次都把正文從頭重讀，看到以前跟那個人聊過就會把人跟聊天室建回來 —— 所以「刪了」要有記號。
    // 「現在是不是刪掉的」每次同步都重算：把跟這個人有關的事件依樓號排好，最後一件說了算。
    //   劇情事件（每次從正文重新讀，回朔／刪樓／重骰自然跟上）：
    //     刪除：聊天框裡的系統行「你已刪除好友「X」」「你已將X加入黑名單」…
    //     加回：系統行「你已添加了X」、好友申請、這間私聊（或群）又有新的訊息
    //   她手動做的（存起來）：在微信刪聊天室／通訊錄刪人 → 刪除；刪了又自己加回來 → 加回。
    //     記的樓號＝當時正文最後一樓，排在那一樓所有劇情事件之後；之後正文有更新的事件就換它說了算。
    // 一個劇情一份：wx_removed::<酒館 chatId>，manual：{ 'p:名字' 或 'g:房key': { kind: 'remove'|'back', floor, at } }
    //   私聊用名字當鍵（刪了聯絡人再建，id 會換，名字不會）、群用房間 key。
    function _rmKey() { return 'wx_removed::' + (_storyCid() || 'default'); }
    function _rmLoad() {
        try { const o = JSON.parse(localStorage.getItem(_rmKey()) || '{}') || {}; return { manual: o.manual || {} }; }
        catch (e) { return { manual: {} }; }
    }
    function _rmSave(o) { try { localStorage.setItem(_rmKey(), JSON.stringify(o)); } catch (e) {} }
    let _rmRemovedNow = {};   // 上一次同步算出來「現在是刪掉的」那些鍵
    function _rmKeyOf(chat) {
        if (!chat) return '';
        if (chat.isGroup) return chat.storyKey ? 'g:' + chat.storyKey : '';
        const n = String(chat.realName || chat.name || '').trim();
        return n ? 'p:' + n : '';
    }
    async function _storyCurrentFloor() {
        try { if (win.TavernHelper && win.TavernHelper.getLastMessageId) { const n = await win.TavernHelper.getLastMessageId(); if (typeof n === 'number' && n >= 0) return n; } } catch (e) {}
        if (_storyLastFloor >= 0) return _storyLastFloor;
        try { const all = (win.VN_READER && win.VN_READER.fetchFullChat) ? await win.VN_READER.fetchFullChat() : null; if (Array.isArray(all)) return all.length - 1; } catch (e) {}
        return -1;
    }
    // 她在微信刪掉聊天室／聯絡人時呼叫
    async function _markRemoved(chat) {
        const k = _rmKeyOf(chat);
        if (!k) return;
        const f = await _storyCurrentFloor();
        const o = _rmLoad();
        o.manual[k] = { kind: 'remove', floor: f, at: Date.now() };
        _rmSave(o);
        _rmRemovedNow[k] = 1;
    }
    // 她在微信新加了這個人：只有「現在是刪掉的」才需要記一筆加回（每個新聯絡人都會叫到這裡）
    function _clearRemoved(name) {
        const k = 'p:' + String(name || '').trim();
        const o = _rmLoad();
        const manRm = o.manual[k] && o.manual[k].kind === 'remove';
        if (!_rmRemovedNow[k] && !manRm) return;
        o.manual[k] = { kind: 'back', floor: _storyLastFloor, at: Date.now() };
        _rmSave(o);
        delete _rmRemovedNow[k];
    }
    // 聊天框裡的系統行 → 刪好友／加回好友。只看系統行：聊天裡有人說「我就拉黑你」是玩笑，不算。
    const _Q = '[「『“"\'‘]?';
    const _QE = '[」』”"\'’]?';
    const _NM = '([^「」『』“”"\'‘’\\s，,。．.！!？?、：:]{1,24}?)';
    const _FRIEND_RM_RES = [
        new RegExp('(?:刪除|删除)了?\\s*(?:該|该|此|這位|这位|這個|这个)?\\s*(?:好友|聯絡人|联系人|朋友)\\s*' + _Q + '\\s*' + _NM + '?\\s*' + _QE + '\\s*$'),
        new RegExp('(?:將|将|把)\\s*' + _Q + '\\s*' + _NM + '\\s*' + _QE + '\\s*(?:從|从)?\\s*(?:好友|通訊錄|通讯录|聯絡人|联系人)?\\s*(?:中|裡|里)?\\s*(?:刪除|删除|刪掉|删掉|刪了|删了|移除)'),
        new RegExp('(?:將|将|把)\\s*' + _Q + '\\s*' + _NM + '\\s*' + _QE + '\\s*(?:加入|拉進|拉进|列入|移入)\\s*(?:黑名單|黑名单)'),
        new RegExp('(?:拉黑|封鎖|封锁|屏蔽)了?\\s*' + _Q + '\\s*' + _NM + '?\\s*' + _QE + '\\s*$')
    ];
    const _FRIEND_BACK_RE = /(?:已添加了?|已經添加|已经添加|已經是好友|已经是好友|已成為好友|已成为好友|通過了你的朋友驗證|通过了你的朋友验证|你已通過|你已通过|現在可以開始聊天|现在可以开始聊天|移出了?黑名單|移出了?黑名单|解除(?:了)?封鎖|解除(?:了)?封锁)/;
    // 反過來：對方把主角刪了／拉黑了。真的微信不會通知，是送訊息的時候才看得到那句話，所以就認那幾句
    const _FRIEND_BLOCKED_RES = [
        new RegExp(_Q + _NM + _QE + '\\s*(?:開啟了|开启了|已開啟|已开启)\\s*(?:朋友|好友)驗證|(?:開啟了|开启了)(?:朋友|好友)(?:驗證|验证)'),
        /(?:消息|訊息|信息)已(?:發出|发出)[，,]?\s*(?:但|但是)?\s*被(?:對方|对方)?拒收/,
        /(?:你已被|已被)(?:對方|对方)?\s*(?:刪除|删除|拉黑|封鎖|封锁|移出(?:好友|通訊錄|通讯录))/,
        new RegExp('(?:對方|对方)\\s*(?:已)?\\s*(?:將|将|把)?\\s*你\\s*(?:刪除|删除|拉黑|加入(?:黑名單|黑名单))')
    ];
    function _friendEventOf(text) {
        const s = String(text || '').trim();
        if (!s) return null;
        for (let i = 0; i < _FRIEND_BLOCKED_RES.length; i++) {
            const m = s.match(_FRIEND_BLOCKED_RES[i]);
            if (m) return { kind: 'blocked', name: (m[1] || '').trim() };
        }
        if (_FRIEND_BACK_RE.test(s)) {
            // 後面沒有固定字可以擋的那條用貪婪版（不然只抓到一個字）；名字字元本來就排除標點，會停在逗號前
            const m = s.match(new RegExp(_Q + _NM + _QE + '\\s*(?:通過|通过|已經是|已经是|已成為|已成为)')) || s.match(new RegExp('(?:添加了?|加回)\\s*' + _Q + _NM.replace('}?)', '})') + _QE));
            return { kind: 'back', name: m ? m[1].trim() : '' };
        }
        for (let i = 0; i < _FRIEND_RM_RES.length; i++) {
            const m = s.match(_FRIEND_RM_RES[i]);
            if (m) {
                let n = (m[1] || '').trim();
                if (/^(?:該|该|此|這個|这个|對方|对方|他|她|它|你|我|好友|聯絡人|联系人)$/.test(n)) n = '';
                return { kind: 'remove', name: n };
            }
        }
        return null;
    }

    // 逐樓解析：沿用 _parseVnChatBlocks 的區塊規則，但每則訊息帶樓號；[With] 成員與房名跨樓累積
    async function _parseStoryRoomsByFloor() {
        const rooms = {};
        let msgs = null;
        try { msgs = (win.VN_READER && win.VN_READER.fetchFullChat) ? await win.VN_READER.fetchFullChat() : null; } catch (e) {}
        if (!Array.isArray(msgs)) return { rooms: rooms, lastFloor: -1, ok: false };
        for (let f = 0; f < msgs.length; f++) {
            const m = msgs[f];
            const text = (typeof m === 'string') ? m : ((m && (m.mes || m.message)) || '');
            if (!text || text.indexOf('<chat') < 0) continue;
            const part = _parseVnChatBlocks(text);
            Object.keys(part).forEach(function (key) {
                const r = part[key];
                if (!rooms[key]) rooms[key] = { id: key, name: r.name, members: [], msgs: [], owner: '' };
                if (r.name) rooms[key].name = r.name;
                if (r.owner) rooms[key].owner = r.owner;
                if (r.members && r.members.length) rooms[key].members = r.members.slice();
                (r.msgs || []).forEach(function (x) { rooms[key].msgs.push({ type: x.type, sender: x.sender, content: x.content, isMe: x.isMe, floor: f, quoteName: x.quoteName || '', quoteText: x.quoteText || '' }); });
            });
        }
        // 「我」跨樓補判：某樓沒寫 owner 時用整間房累積的 owner 再判一次（換視角的房，後面幾樓 AI 常省略屬性）
        const myName = _storyMyName();
        Object.keys(rooms).forEach(function (key) {
            const r = rooms[key];
            const me = r.owner || '';
            r.msgs.forEach(function (x) { if (!x.isMe && ((me && x.sender === me) || x.sender === myName || _isMeName(x.sender))) x.isMe = true; });
        });
        return { rooms: rooms, lastFloor: msgs.length - 1, ok: true };
    }

    // 房間的「對方們」：[With] 名單扣掉「我」（使用者人設名、owner、You/主角 這類）；順序不算數。沒寫 [With] 就拿發話人湊
    function _storyOthers(room) {
        const myName = _storyMyName();
        const seen = {};
        const list = [];
        const push = function (n) { n = String(n || '').trim(); if (!n || n === myName || n === (room.owner || '') || _isMeName(n) || seen[n]) return; seen[n] = 1; list.push(n); };
        (room.members || []).forEach(push);
        // 名單之外發過話的人也算（AI 常只列幾個人，群裡實際說話的更多）
        room.msgs.forEach(function (x) { if (x.type === 'msg' && !x.isMe) push(x.sender); });
        return list;
    }

    // 劇情訊息 + 微信自己打的訊息 → 依樓號交錯回同一串
    function _storyMergeMessages(existing, storyMsgs, roomName, isGroup) {
        const myName = _storyMyName();
        const natives = (existing && Array.isArray(existing.messages) ? existing.messages : []).filter(function (m) { return m && m._story == null; });
        const stamped = natives.map(function (m) { return { m: m, f: (m._afterFloor == null ? Infinity : m._afterFloor) }; });
        let ni = 0;
        const out = [];
        storyMsgs.forEach(function (x) {
            while (ni < stamped.length && stamped[ni].f < x.floor) { out.push(stamped[ni].m); ni++; }
            const sender = x.isMe ? myName : (isGroup ? x.sender : (x.sender || roomName));
            out.push({ type: x.type === 'system' ? 'system' : 'msg', isMe: !!x.isMe, content: x.content, sender: sender, senderName: sender, _story: x.floor, quoteName: x.quoteName || '', quoteText: x.quoteText || '' });
        });
        while (ni < stamped.length) { out.push(stamped[ni].m); ni++; }
        return out;
    }

    // 主流程：整份正文 → 房間 → 聊天室記錄 + 聯絡人；只存有變動的
    async function _storySyncNow() {
        if (_storySyncing) { _storySyncAgain = true; return; }
        _storySyncing = true;
        try {
            const cid = _storyCid();
            if (!cid || !win.WX_DB || !win.WX_CONTACTS) return;
            await _storyRefreshMeAliases();
            const parsed = await _parseStoryRoomsByFloor();
            if (!parsed.ok) return;
            const rooms = parsed.rooms;
            const keys = Object.keys(rooms);
            const liveIds = {};
            let contactCount = 0;
            const contactSeen = {};
            // 同群不等於加好友：只在群裡出現過的名字記在這，真的該進通訊錄的（好友申請、一對一聊過的）記在那邊。
            // 收尾時拿這兩份對照，把以前「隱形註冊」留下來的路人清掉。
            const groupOnlyNames = {}, realContactNames = {};
            let rebuildActive = false;

            // 🗑 刪好友：每個人（群）現在是不是刪掉的 —— 事件依（樓號, 樓內順序）排，最後一件說了算（見 _rmLoad 上面的說明）
            const rmLast = {};
            const rmPush = function (k, f, o, kind) {
                if (!k || f == null) return;
                const cur = rmLast[k];
                if (!cur || f > cur.f || (f === cur.f && o >= cur.o)) rmLast[k] = { f: f, o: o, kind: kind };
            };
            const rmMan = _rmLoad().manual;
            const backNames = [];   // 「已添加了X」的 X 可能連著後面的字，等所有刪除都收齊了再對名字
            keys.forEach(function (key) {
                const room = rooms[key];
                if (room.owner && room.owner !== _storyMyName() && !_isMeName(room.owner)) return;
                const others = _storyOthers(room);
                const selfKey = others.length >= 2 ? 'g:' + key : (others.length === 1 ? 'p:' + others[0] : '');
                room.msgs.forEach(function (x, i) {
                    if (x.type === 'system') {
                        const ev = _friendEventOf(x.content);
                        if (!ev) return;
                        const name = ev.name || (others.length === 1 ? others[0] : '');   // 沒寫名字＝這間私聊的對方
                        if (!name) return;
                        if (ev.kind === 'remove') rmPush('p:' + name, x.floor, i, 'remove');          // 主角刪了對方
                        else if (ev.kind === 'blocked') rmPush('b:' + name, x.floor, i, 'blocked');   // 對方刪了主角
                        else backNames.push({ name: name, f: x.floor, o: i });
                        return;
                    }
                    if (x.type !== 'msg') return;
                    rmPush(selfKey, x.floor, i, 'back');   // 這間又有人講話＝主角沒把人刪掉
                    // 對方又講得出話＝主角沒被刪（主角自己說的不算，被刪的人照樣打得出字）
                    if (!x.isMe && others.length === 1) rmPush('b:' + others[0], x.floor, i, 'back');
                });
                // 好友申請（誰申請都算兩邊重新是朋友）
                _storyFriendRequests(room).forEach(function (fr) { rmPush('p:' + fr.name, fr.floor, 1e9, 'back'); rmPush('b:' + fr.name, fr.floor, 1e9, 'back'); });
            });
            backNames.forEach(function (b) {
                const hit = Object.keys(rmLast).find(function (k) { return (k.indexOf('p:') === 0 || k.indexOf('b:') === 0) && rmLast[k].kind !== 'back' && b.name.indexOf(k.slice(2)) === 0; });
                const nm = hit ? hit.slice(2) : b.name;
                rmPush('p:' + nm, b.f, b.o, 'back');
                rmPush('b:' + nm, b.f, b.o, 'back');
            });
            // 她手動做的排在那一樓所有劇情事件之後
            Object.keys(rmMan).forEach(function (k) { rmPush(k, rmMan[k].floor, Infinity, rmMan[k].kind); });
            _rmRemovedNow = {};
            Object.keys(rmLast).forEach(function (k) { if (rmLast[k].kind === 'remove' || rmLast[k].kind === 'blocked') _rmRemovedNow[k] = 1; });
            const rmStillOn = function (k) { return !!_rmRemovedNow[k]; };   // 'p:名' ＝主角刪了他；'b:名' ＝他刪了主角
            // 刪掉的房：本來就有記錄的藏起來（資料留著，加回來時原樣回來）；本來沒有的就不建
            const hideRoom = async function (chatId, key) {
                let ex = GLOBAL_CHATS[chatId];
                if (!ex) { try { ex = await win.WX_DB.getApiChat(chatId); } catch (e) { ex = null; } }
                if (!ex) return;
                liveIds[chatId] = key;
                GLOBAL_CHATS[chatId] = ex;
                if (!ex.wxRemoved) {
                    ex.wxRemoved = true;
                    try { await win.WX_DB.saveApiChat(chatId, ex); } catch (e) {}
                    if (GLOBAL_ACTIVE_ID === chatId) GLOBAL_ACTIVE_ID = null;
                    rebuildActive = true;
                }
            };

            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const room = rooms[key];
                if (!room.msgs.length) continue;
                // 換視角的房（owner 是別人）是別人的手機，主角的微信裡不該有；正文那邊 VN 照樣播，這裡不收
                if (room.owner && room.owner !== _storyMyName() && !_isMeName(room.owner)) continue;
                // 好友申請（AI 常寫成「新的朋友」系統房）：申請人進通訊錄、簡介用附加信息；這種房本身不建聊天室
                _storyFriendRequests(room).forEach(function (fr) {
                    if (rmStillOn('p:' + fr.name)) return;   // 申請比刪除舊（或之後又被刪）→ 不加回來
                    const fid = win.WX_CONTACTS.getOrCreateContactID(fr.name, 'user', true);
                    if (!fid || fid === 'User') return;
                    if (fr.bio) win.WX_CONTACTS.addContactToStorage({ id: fid, name: fr.name, desc: fr.bio });
                    _storyEnsureContactChat(fid, fr.name, fr.bio);
                    realContactNames[fr.name] = 1;   // 好友申請＝她真的加了這個人，該留
                    if (!contactSeen[fr.name]) { contactSeen[fr.name] = 1; contactCount++; }
                });
                const others = _storyOthers(room);
                if (!others.length) continue;   // 只有我跟系統的房（新的朋友、系統通知）不建聊天室
                const isGroup = others.length >= 2;
                let chatId, members, realName;
                if (isGroup) {
                    chatId = 'grp_story_' + _storyHash(cid) + '_' + String(key).replace(/[^\w一-鿿-]/g, '_').slice(0, 40);
                    if (rmStillOn('g:' + key)) { await hideRoom(chatId, key); continue; }   // 她退掉／刪掉的群
                    // 🚨 同群不等於加好友。這裡只拿「現成的」聯絡人 id：本來就在通訊錄裡的人照樣對得上，
                    //    不在的路人就用名字當 id —— 群成員名照樣顯示得出來（wx_contacts 那邊查不到 id 就用 id 當名字）。
                    //    以前這行是 saveToStorage=true，光取個 id 就把人隱形註冊進通訊錄，後面再補一間空的一對一
                    //    聊天室；於是劇情裡出現過的每個路人都成了她的微信聯絡人。而那種空房身上沒有 storyKey，
                    //    下面回收舊房的迴圈永遠掃不到，只會越積越多。
                    members = others.map(function (n) { return win.WX_CONTACTS.getOrCreateContactID(n, 'user', false); });
                    others.forEach(function (n) { groupOnlyNames[n] = 1; });
                    win.WX_CONTACTS.addContactToStorage({ id: chatId, name: room.name || key, isGroup: true, members: members });
                } else {
                    realName = others[0] || room.name || key;
                    // 🗑 刪掉的好友：不重新註冊進通訊錄（查 id 用不存檔的那種），原本的記錄藏起來
                    if (rmStillOn('p:' + realName)) { await hideRoom(win.WX_CONTACTS.getOrCreateContactID(realName, 'user', false), key); continue; }
                    chatId = win.WX_CONTACTS.getOrCreateContactID(realName, 'user', true);
                    if (chatId === 'User') continue;
                    members = [realName];
                    realContactNames[realName] = 1;   // 一對一聊過＝真的是聯絡人
                    if (!contactSeen[realName]) { contactSeen[realName] = 1; contactCount++; }
                    _storyUpsertUnified(chatId, realName, '');
                }
                liveIds[chatId] = key;

                let existing = GLOBAL_CHATS[chatId];
                if (!existing) { try { existing = await win.WX_DB.getApiChat(chatId); } catch (e) { existing = null; } }
                if (existing && existing.wxRemoved) { delete existing.wxRemoved; existing._storySig = ''; }   // 加回來了：重建、重新出現在列表
                // 對方把主角刪了：聊天室照舊在（真的微信也是這樣，送出去才知道），但送不出去、對方不會回
                const wantBlocked = !isGroup && rmStillOn('b:' + realName);
                if (existing && !!existing.wxBlocked !== wantBlocked) existing._storySig = '';
                const sig = key + '|' + room.msgs.length + '|' + parsed.lastFloor + '|' + _storyHash(room.msgs.map(function (x) { return x.sender + ':' + x.content; }).join('\n'));
                if (existing && existing._storySig === sig) { GLOBAL_CHATS[chatId] = existing; continue; }

                const prevStoryCount = existing ? (existing.messages || []).filter(function (m) { return m && m._story != null; }).length : 0;
                const messages = _storyMergeMessages(existing, room.msgs, isGroup ? (room.name || key) : realName, isGroup);
                const rec = Object.assign({}, existing || {}, {
                    id: chatId,
                    name: isGroup ? (room.name || key) : ((existing && existing.name) || realName),
                    isGroup: isGroup,
                    members: members,
                    messages: messages,
                    storyKey: key,
                    _storySig: sig,
                    lastTime: (existing && existing.lastTime) || '',
                    unread: chatId !== GLOBAL_ACTIVE_ID && room.msgs.length > prevStoryCount,
                    pushedCount: messages.length,
                    renderedCount: messages.length
                });
                if (isGroup) delete rec.realName; else rec.realName = realName;
                if (wantBlocked) rec.wxBlocked = true; else delete rec.wxBlocked;
                GLOBAL_CHATS[chatId] = rec;
                try { await win.WX_DB.saveApiChat(chatId, rec); } catch (e) { console.warn('[wx 跑團同步] 存檔失敗:', chatId, e); }
                if (chatId === GLOBAL_ACTIVE_ID) rebuildActive = true;
            }

            // 正文裡已經不存在的房（回朔 / 刪樓）：拆掉劇情訊息；空了的群整筆移除、私聊保留成一般聯絡人
            let all = {};
            try { all = (win.WX_DB.getApiChatsForCurrentCard ? await win.WX_DB.getApiChatsForCurrentCard() : {}) || {}; } catch (e) {}
            const seenIds = Object.assign({}, all, GLOBAL_CHATS);
            for (const id in seenIds) {
                const c = GLOBAL_CHATS[id] || all[id];
                if (!c || !c.storyKey || liveIds[id]) continue;
                const natives = (c.messages || []).filter(function (m) { return m && m._story == null; });
                // 空掉的群整筆移除；「聯絡人是我自己」的空私聊也移除（之前簡體名沒認出來時建錯的）
                if (!natives.length && (c.isGroup || _isMeName(c.realName || c.name))) {
                    delete GLOBAL_CHATS[id];
                    try { await win.WX_DB.deleteApiChat(id); } catch (e) {}
                    // 通訊錄裡這個群的登記也拿掉，不留同名殘影
                    try { const list = win.WX_CONTACTS.getAllCustomContacts(); const kept = list.filter(function (x) { return x && x.id !== id; }); if (kept.length !== list.length) localStorage.setItem(win.WX_CONTACTS._key(), JSON.stringify(kept)); } catch (e) {}
                    if (GLOBAL_ACTIVE_ID === id) GLOBAL_ACTIVE_ID = null;
                    continue;
                }
                const rec = Object.assign({}, c, { messages: natives, pushedCount: natives.length, renderedCount: natives.length });
                delete rec.storyKey; delete rec._storySig;
                GLOBAL_CHATS[id] = rec;
                try { await win.WX_DB.saveApiChat(id, rec); } catch (e) {}
                if (id === GLOBAL_ACTIVE_ID) rebuildActive = true;
            }

            // 通訊錄裡名字是「我」的自訂聯絡人（簡體名沒認出來時註冊錯的）一併拿掉
            try {
                const list = win.WX_CONTACTS.getAllCustomContacts();
                const kept = list.filter(function (c) { return !(c && !c.isGroup && _isMeName(c.name)); });
                if (kept.length !== list.length) localStorage.setItem(win.WX_CONTACTS._key(), JSON.stringify(kept));
            } catch (e) {}
            // 舊帳：以前「同群就隱形註冊」留下來的路人（出租車司機、老張那種），要三個條件同時成立才動手 ——
            //   ① 這一輪只以群成員身分出現，沒在好友申請裡、也沒有一對一的房
            //   ② 通訊錄那筆是隱形註冊的：簡介還是預設那句、沒頭像、沒人設
            //   ③ 它的一對一聊天室一則訊息都沒有
            // 她自己加的、AI 搜出來的、好友申請進來的，會在②或③擋下來，不會被掃到。
            try {
                const DEFAULT_DESC = '這個人很懶，什麼都沒寫';
                const list = win.WX_CONTACTS.getAllCustomContacts();
                const drop = {};
                list.forEach(function (c) {
                    if (!c || c.isGroup || c.id === 'User') return;
                    if (!groupOnlyNames[c.name] || realContactNames[c.name]) return;
                    if ((c.desc || '') !== DEFAULT_DESC) return;
                    if (c.avatarId || c.avatar || c.persona) return;
                    if (c.aiKeyword && c.aiKeyword !== 'user') return;
                    const chat = GLOBAL_CHATS[c.id] || all[c.id];
                    if (chat && (chat.messages || []).length) return;
                    drop[c.id] = c.name;
                });
                const dropIds = Object.keys(drop);
                if (dropIds.length) {
                    localStorage.setItem(win.WX_CONTACTS._key(), JSON.stringify(list.filter(function (c) { return !drop[c.id]; })));
                    for (let di = 0; di < dropIds.length; di++) {
                        const did = dropIds[di];
                        delete GLOBAL_CHATS[did];
                        try { await win.WX_DB.deleteApiChat(did); } catch (e) {}
                        try { if (win.OS_CONTACTS && win.OS_CONTACTS.deleteContact) win.OS_CONTACTS.deleteContact(did); } catch (e) {}
                        if (GLOBAL_ACTIVE_ID === did) GLOBAL_ACTIVE_ID = null;
                    }
                    console.log('[wx 跑團同步] 清掉只因同群被隱形註冊的聯絡人 ' + dropIds.length + ' 位：' + dropIds.map(function (i) { return drop[i]; }).join('、'));
                }
            } catch (e) { console.warn('[wx 跑團同步] 清理群成員殘留失敗:', (e && e.message) || e); }

            // 同一個窗裡同名多筆：通訊錄清單跟聊天室的章以前用兩把不同的尺（見 wx_contacts 的 _storyId），
            // 同一個人在不同時機查不到自己就再拿一個新的 char_ 亂數 id，畫面上同一個名字於是出現好幾次。
            // 尺已經統一，這裡把留下來的空殼收掉：同名的只留有訊息的，一則訊息都沒有的多餘分身刪掉；
            // 全部都有訊息就一筆都不動（不替她合併對話）。
            try {
                const byName = {};
                const pool = Object.assign({}, all, GLOBAL_CHATS);
                for (const pid in pool) {
                    const pc = pool[pid];
                    if (!pc || pc.isGroup || pid === 'User') continue;
                    const nm = String(pc.realName || pc.name || '').trim();
                    if (!nm) continue;
                    (byName[nm] = byName[nm] || []).push({ id: pid, msgs: (pc.messages || []).length });
                }
                const dupDrop = [];
                for (const nm in byName) {
                    const arr = byName[nm];
                    if (arr.length < 2) continue;
                    const withMsg = arr.filter(function (x) { return x.msgs > 0; });
                    const empties = arr.filter(function (x) { return x.msgs === 0; });
                    if (!empties.length) continue;                     // 全都有訊息 → 一筆都不動
                    const keep = withMsg.length ? null : empties[0];    // 全空 → 留第一筆當本尊
                    empties.forEach(function (x) { if (!keep || x.id !== keep.id) dupDrop.push(x.id); });
                }
                if (dupDrop.length) {
                    const dropSet = {}; dupDrop.forEach(function (i) { dropSet[i] = 1; });
                    const list2 = win.WX_CONTACTS.getAllCustomContacts();
                    localStorage.setItem(win.WX_CONTACTS._key(), JSON.stringify(list2.filter(function (c) { return !dropSet[c.id]; })));
                    for (let qi = 0; qi < dupDrop.length; qi++) {
                        const qid = dupDrop[qi];
                        delete GLOBAL_CHATS[qid];
                        try { await win.WX_DB.deleteApiChat(qid); } catch (e) {}
                        try { if (win.OS_CONTACTS && win.OS_CONTACTS.deleteContact) win.OS_CONTACTS.deleteContact(qid); } catch (e) {}
                        if (GLOBAL_ACTIVE_ID === qid) GLOBAL_ACTIVE_ID = null;
                    }
                    console.log('[wx 跑團同步] 收掉同名重複的空殼聯絡人 ' + dupDrop.length + ' 筆');
                }
            } catch (e) { console.warn('[wx 跑團同步] 收斂同名重複失敗:', (e && e.message) || e); }

            _storyLastFloor = parsed.lastFloor;
            _storyStat = { rooms: keys.filter(function (k) { return rooms[k].msgs.length; }).length, contacts: contactCount, floor: parsed.lastFloor, at: Date.now() };

            if (APP_CONTAINER) {
                if (GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) {
                    if (rebuildActive) { _rebuildRoomContent(GLOBAL_CHATS[GLOBAL_ACTIVE_ID]); _scrollToBottom(); }
                } else if (GLOBAL_TAB === 'chat') { updateAppUI(); }
                else { win.wxApp.render(); }
            }
        } catch (e) { console.warn('[wx 跑團同步] 失敗:', (e && e.message) || e); }
        finally {
            _storySyncing = false;
            _refreshLobbyUnread();   // 酒館開起來時聊天室是這裡載進來的：上次沒看完的也要亮點
            if (_storySyncAgain) { _storySyncAgain = false; setTimeout(_storySyncNow, 300); }
        }
    }
    function _storySyncDebounced(ms) { clearTimeout(_storySyncTimer); _storySyncTimer = setTimeout(_storySyncNow, ms == null ? 1200 : ms); }

    // 群成員 / 大總結角色：要在通訊錄看得到就得有一筆 api_chat（通訊錄是照聊天記錄列的）
    function _storyEnsureContactChat(id, name, desc) {
        if (!id || id === 'User') return;
        _storyUpsertUnified(id, name, desc);
        if (GLOBAL_CHATS[id]) { if (desc && !GLOBAL_CHATS[id].desc) GLOBAL_CHATS[id].desc = desc; return; }
        const rec = { id: id, name: name, realName: name, members: [name], isGroup: false, messages: [], lastTime: '', unread: false, pushedCount: 0, renderedCount: 0, desc: desc || '' };
        GLOBAL_CHATS[id] = rec;
        try { win.WX_DB && win.WX_DB.saveApiChat(id, rec); } catch (e) {}
    }
    function _storyUpsertUnified(id, name, desc) {
        try {
            if (!win.OS_CONTACTS || !win.OS_CONTACTS.upsert) return;
            const cur = win.OS_CONTACTS.getById ? win.OS_CONTACTS.getById(id) : null;
            const wx = Object.assign({}, (cur && cur.wx) || {}, { nickname: name });
            if (desc && !wx.bio) wx.bio = desc;
            win.OS_CONTACTS.upsert({ id: id, realName: (cur && cur.realName) || name, isNPC: true, wx: wx });
        } catch (e) {}
    }

    // 你在跑團房自己打的話：生成開始那一刻把它釘在「目前正文最後一樓」之後（下一樓進來時才不會排錯）
    async function _storyStampNatives() {
        if (_storyLastFloor < 0) return;
        for (const id in GLOBAL_CHATS) {
            const c = GLOBAL_CHATS[id];
            if (!c || !c.storyKey || !Array.isArray(c.messages)) continue;
            let changed = false;
            c.messages.forEach(function (m) { if (m && m._story == null && m._afterFloor == null) { m._afterFloor = _storyLastFloor; changed = true; } });
            if (changed) { try { await win.WX_DB.saveApiChat(id, c); } catch (e) {} }
        }
    }


    function handleNewMessages(chats, messageId) {
        const configStr = localStorage.getItem('wx_phone_api_config');
        if (configStr && JSON.parse(configStr).directMode) return;
        const ids = Object.keys(chats);
        // 🔧 兼容：酒館沒有 [wx_os] 資料時，別清空 wx 自己 api_chats 的聊天（之前 GLOBAL_CHATS={} 會把面板清光）
        if (!ids.length) return;

        const blockedStr = localStorage.getItem('wx_hidden_chat_ids');
        const blockedList = blockedStr ? JSON.parse(blockedStr) : [];

        // 🔧 兼容：只「合併/更新」橋接帶來的聊天，不整盤覆蓋 → 保留 wx 自己的資料
        for (let id of ids) {
            if (blockedList.includes(id)) continue;
            GLOBAL_CHATS[id] = { ...chats[id], unread: true, pushedCount: 0, renderedCount: 0 };
        }
        if (APP_CONTAINER) { updateAppUI(); }
    }

    function scanAndRender_DEPRECATED() {
        const configStr = localStorage.getItem('wx_phone_api_config');
        if (configStr && JSON.parse(configStr).directMode) return;
    }

    function updateAppUI() {
        if (!APP_CONTAINER) return;
        const shell = APP_CONTAINER.querySelector('.wx-shell'); if (!shell) return;
        if (GLOBAL_TAB === 'chat' && !shell.querySelector('.wx-page-list').contains(doc.activeElement)) {
             const listContainer = shell.querySelector('.wx-page-list > div');
             if (listContainer) listContainer.innerHTML = window.WX_VIEW.getListHTML(GLOBAL_CHATS, GLOBAL_ACTIVE_ID);
        }
        for (let chatId in GLOBAL_CHATS) {
            const chat = GLOBAL_CHATS[chatId]; const targetCount = chat.messages.length;
            if (targetCount > chat.pushedCount) {
                for (let i = chat.pushedCount; i < targetCount; i++) { RENDER_QUEUE.push({ msg: chat.messages[i], chatId: chatId, index: i }); }
                chat.pushedCount = targetCount;
                if (chat.messages.length > 0 && !chat.messages[targetCount-1].isMe) { if (win.PhoneSystem) win.PhoneSystem.show(); }
            }
        }
    }

    // ── DOM helpers：避免 this.render() 全量重建導致背景閃爍 ──
    function _getScrollEl()  { return APP_CONTAINER ? APP_CONTAINER.querySelector('.wx-room-scroll') : null; }
    function _getRoomContent(){ const rc = APP_CONTAINER ? APP_CONTAINER.querySelector('#wxRoomContent') : null; if (rc) _bindQuoteGestures(rc); return rc; }

    // 點聊天內容區＝收起「＋」功能面板與表情包面板（跟微信一樣）。
    //   綁在整個 app 容器上做委派：聊天室每次重畫都是新的 DOM，逐次綁會漏。
    function _closePanels() {
        if (!APP_CONTAINER) return;
        let closed = false;
        APP_CONTAINER.querySelectorAll('.wx-action-panel.open, .wx-sticker-panel.open').forEach(function (p) { p.classList.remove('open'); closed = true; });
        const scroll = _getScrollEl();
        if (closed && scroll) scroll.style.paddingBottom = '70px';
    }
    function _bindPanelDismiss(container) {
        if (!container || container.dataset.wxPanelDismiss === '1') return;
        container.dataset.wxPanelDismiss = '1';
        container.addEventListener('pointerdown', function (e) {
            if (container !== APP_CONTAINER) return;
            const t = e.target;
            if (t && t.closest && t.closest('.wx-page-room')) _closePanels();
        });
    }

    // 長按任一則訊息＝引用它。桌面右鍵同一條路。
    // 事件綁在整個訊息區上做委派，泡泡是每次重畫的，逐顆綁會漏掉重畫後的那些。
    let _replyTo = null;   // { name, text }：正在回覆誰的哪句話；送出或取消就清掉
    function _bindQuoteGestures(rc) {
        if (!rc || rc.dataset.quoteBound === '1') return;
        rc.dataset.quoteBound = '1';
        let timer = null, startY = 0;
        const rowOf = function (e) {
            const t = (e.target && e.target.closest) ? e.target.closest('.wx-msg-row') : null;
            return (t && t.dataset && t.dataset.msgIdx != null) ? t : null;
        };
        const fire = function (row) {
            const i = parseInt(row.dataset.msgIdx, 10);
            if (!isNaN(i) && win.wxApp && win.wxApp.quoteMsg) win.wxApp.quoteMsg(i);
        };
        const cancel = function () { if (timer) { clearTimeout(timer); timer = null; } };
        rc.addEventListener('pointerdown', function (e) {
            const row = rowOf(e); if (!row) return;
            startY = e.clientY; cancel();
            timer = setTimeout(function () { timer = null; fire(row); }, 480);
        });
        rc.addEventListener('pointerup', cancel);
        rc.addEventListener('pointercancel', cancel);
        rc.addEventListener('pointerleave', cancel);
        rc.addEventListener('pointermove', function (e) { if (Math.abs(e.clientY - startY) > 8) cancel(); });   // 在捲動就不是長按
        rc.addEventListener('contextmenu', function (e) {
            const row = rowOf(e); if (!row) return;
            e.preventDefault(); fire(row);
        });
    }
    function _renderReplyingBar() {
        if (!APP_CONTAINER) return;
        const bar = APP_CONTAINER.querySelector('#wxReplying');
        if (!bar) return;
        if (!_replyTo) { bar.classList.add('hidden'); return; }
        const n = APP_CONTAINER.querySelector('#wxReplyingName');
        const t = APP_CONTAINER.querySelector('#wxReplyingText');
        if (n) n.textContent = _replyTo.name;
        if (t) t.textContent = _replyTo.text;
        bar.classList.remove('hidden');
    }
    function _scrollToBottom(){ const r = _getScrollEl(); if (r) r.scrollTop = r.scrollHeight; }
    function _appendBubble(msg, chatObj) {
        const rc = _getRoomContent();
        if (rc && window.WX_VIEW) {
            const idx = chatObj.messages.length - 1;
            rc.insertAdjacentHTML('beforeend', window.WX_VIEW.renderBubble(msg, chatObj, true, idx));
            // 🚨 追加進來的泡泡也要把頭像貼上。以前只有整頁重建會貼，所以 AI 每回一次，
            //    新泡泡的頭像就停在預設那張，退出去再進來才會變回來。
            try { window.WX_VIEW.hydrateAvatars && window.WX_VIEW.hydrateAvatars(rc); } catch (e) {}
            _scrollToBottom();
        }
    }
    function _removeLoadingBubble() {
        const rc = _getRoomContent();
        if (!rc) return;
        // 移除所有 loading 指示器（包括潛在重複）
        rc.querySelectorAll('[data-loading="true"]').forEach(el => el.remove());
    }
    // 從 data 重建 roomContent（不碰背景層，不閃爍）
    function _rebuildRoomContent(chatObj) {
        const rc = _getRoomContent();
        if (!rc || !window.WX_VIEW) return;
        rc.innerHTML = chatObj.messages.map((m, i) => window.WX_VIEW.renderBubble(m, chatObj, false, i)).join('');
        try { window.WX_VIEW.hydrateAvatars && window.WX_VIEW.hydrateAvatars(rc); } catch (e) {}   // 頭像與相簿照片（圖庫編號）
        _scrollToBottom();
    }

    // 📡 托管跑完的結果回來了 → 變成訊息。她人在那間就照常一條條冒出來，不在就安靜收進去、標未讀。
    //    🚨 parseAndProcess 的上下文（房名／房 id／成員）是看 GLOBAL_ACTIVE_ID 的，
    //       收的可能是別間的結果 → 解析那一下先把它借過去，解析完立刻還回去。
    async function _applyRelayReply(chat, finalText) {
        if (!chat) return;
        const li = chat.messages.findIndex(m => !m.isMe && m.isLoading);
        if (li !== -1) chat.messages.splice(li, 1);
        delete chat._relayJob;
        // 🚨 資料裡刪掉「正在輸入」還不夠，畫面上那顆也要拔掉。以前只刪資料，
        //    於是第一則訊息冒出來時舊的點點點還掛在上面，第二則又長一顆新的，
        //    看起來像兩個人同時在打字；要等 simulateTypingStream 中間那次清理才一起消失。
        if (APP_CONTAINER && GLOBAL_ACTIVE_ID === chat.id) { try { _removeLoadingBubble(); } catch (e) {} }

        const prev = GLOBAL_ACTIVE_ID;
        let newMsgs = [];
        try { GLOBAL_ACTIVE_ID = chat.id; newMsgs = parseAndProcess(finalText) || []; }
        finally { GLOBAL_ACTIVE_ID = prev; }

        if (!newMsgs.length && finalText) {
            const memberNames = convertMemberIdsToNames(chat.members || []);
            const memberStr = memberNames.length > 0 ? memberNames.join(', ') : chat.name;
            newMsgs.push({
                type: 'msg', isMe: false, content: finalText, sender: chat.name, senderName: chat.name,
                raw: `\n[Chat: ${chat.name}|${chat.id}]\n[With: ${memberStr}]\n[${chat.name}] ${finalText}`
            });
        }

        if (prev === chat.id && APP_CONTAINER) {
            await win.wxApp.simulateTypingStream(newMsgs, chat);
        } else {
            newMsgs.forEach(function (m) { chat.messages.push(m); });
            chat.unread = true;
            chat.pushedCount = chat.messages.length;
            chat.renderedCount = chat.messages.length;
            if (APP_CONTAINER) win.wxApp.render();
            _refreshLobbyUnread();
        }
        if (win.WX_DB && win.WX_DB.saveApiChat) { try { await win.WX_DB.saveApiChat(chat.id, chat); } catch (e) {} }

        // 🔔 她沒在看的時候有人開口 → 本機通知。
        //    有伺服器的人是伺服器推（os_relay 的 notify），這一條是給沒有伺服器的人用的；
        //    前提是 app 還活著（設置 → 一般 → 後台的守候）。
        try {
            if (win.document.visibilityState === 'hidden' && win.OS_KEEPALIVE) {
                const _first = (newMsgs || []).find(function (m) { return m && !m.isMe && typeof m.content === 'string' && m.content.trim(); });
                const _body = _first ? _first.content : '傳了訊息給妳';
                win.OS_KEEPALIVE.notify(chat.name || '微信', _body, 'wx-' + chat.id);
            }
        } catch (e) {}
    }

    // 登記給托管：跑完的結果由這裡收（os_relay.js 回到前台時會叫）
    if (win.OS_RELAY && win.OS_RELAY.onResult) {
        win.OS_RELAY.onResult('wx', async function (job) {
            const chat = GLOBAL_CHATS[job.chat_id] || (win.WX_DB ? await win.WX_DB.getApiChat(job.chat_id) : null);
            if (!chat) { console.warn('[WX] 托管結果找不到聊天室:', job.chat_id); return; }
            GLOBAL_CHATS[job.chat_id] = chat;
            if (job.status !== 'done') {
                const li = chat.messages.findIndex(m => !m.isMe && m.isLoading);
                if (li !== -1) chat.messages.splice(li, 1);
                delete chat._relayJob;
                chat.messages.push({ type: 'msg', isMe: false, content: 'AI 回應失敗：' + String(job.error || '').slice(0, 120), sender: chat.name, senderName: chat.name });
                if (win.WX_DB && win.WX_DB.saveApiChat) { try { await win.WX_DB.saveApiChat(chat.id, chat); } catch (e) {} }
                if (APP_CONTAINER) { if (GLOBAL_ACTIVE_ID === chat.id) _rebuildRoomContent(chat); else win.wxApp.render(); }
                return;
            }
            const text = (win.OS_API && win.OS_API.normalizeRaw) ? win.OS_API.normalizeRaw(job.result) : String(job.result || '');
            if (!text) { console.warn('[WX] 托管結果是空的'); return; }
            await _applyRelayReply(chat, text);
        });
    }

    // 共用圖片管道生完 → 寫回訊息；訊息位置從卡片所在那列的 data-msg-idx 拿
    if (win.OS_PHONE_IMAGE && win.OS_PHONE_IMAGE.onDone) {
        win.OS_PHONE_IMAGE.onDone('wx', (chatId, url, imgEl, desc) => {
            const row = imgEl && imgEl.closest ? imgEl.closest('.wx-msg-row') : null;
            const idx = row && row.dataset.msgIdx != null ? parseInt(row.dataset.msgIdx, 10) : -1;
            return win.wxApp.setImageUrl(chatId, idx, desc, url);
        });
    }

    win.wxApp = {
        photoContextText: photoContextText,
        stripCardIds: stripCardIds,   // 送進模型的歷史不給看舊單號（不然它會照抄）   // 聊天歷史（os_api_engine）與回傳酒館（os_app_memory_inject）把照片編號換成文字
        applyIncoming: _applyRelayReply,      // 💓 心跳：角色主動開口那一則也走同一條（她人在那間就冒出來，不在就標未讀）
        // 🗑 刪好友記號：通訊錄刪人時記下（markRemoved），她重新加人時撤掉（clearRemoved）
        markRemoved: function (idOrChat, name) {
            const c = (idOrChat && typeof idOrChat === 'object') ? idOrChat : (GLOBAL_CHATS[idOrChat] || (name ? { name: name, realName: name } : null));
            return _markRemoved(c);
        },
        clearRemoved: _clearRemoved,
        get GLOBAL_ACTIVE_ID() { return GLOBAL_ACTIVE_ID; },
        set GLOBAL_ACTIVE_ID(v) { GLOBAL_ACTIVE_ID = v; },   // 📞 電話 app 撥通時暫借 active id（buildContext 靠它抓該聯絡人 DB 歷史）；無 setter 會在 strict mode 拋 TypeError → 通話卡死不調 API
        get APP_CONTAINER() { return APP_CONTAINER; },
        get GLOBAL_CHATS() { return GLOBAL_CHATS; },
        
        revealRecall: function(el, encodedContent) { const content = decodeURIComponent(encodedContent); if (el.dataset.revealed === 'true') { el.innerHTML = el.dataset.original; el.dataset.revealed = 'false'; el.style.color = ''; el.style.fontStyle = ''; } else { el.dataset.original = el.innerHTML; el.innerHTML = `[已撤回]: ${content}`; el.dataset.revealed = 'true'; el.style.color = '#fa5151'; el.style.fontStyle = 'italic'; } },
        
        openRedPacketById: function(packetId) {
            const data = getRedPacketData(packetId);
            if (!data) {
                AUI.alert('紅包數據不存在');
                return;
            }
            
            const currentUserName = _meName();

            // 檢查用戶是否已經領取過（舊記錄裡存的可能是人設名）
            const userAlreadyGrabbed = data.list && data.list.find(item => _isMyName(item.name));
            
            // 如果用戶還沒領取，且紅包還有剩餘，自動為用戶領取
            const totalAmount = data.totalAmount || 0;
            if (!userAlreadyGrabbed && totalAmount > 0) {
                const list = data.list || [];
                const totalGrabbed = list.reduce((sum, item) => sum + item.amount, 0);
                const remainingAmount = totalAmount - totalGrabbed;
                const totalCount = data.totalCount || 1;
                const remainingCount = totalCount - list.length;
                
                if (remainingAmount > 0 && remainingCount > 0) {
                    // 為用戶自動領取
                    const grabAmount = processRedPacketGrab(packetId, currentUserName);
                    if (grabAmount !== null) {
                        // 重新讀取數據（因為processRedPacketGrab已經更新了）
                        const updatedData = getRedPacketData(packetId);
                        
                        // 發送系統消息，通知用戶已領取（包含金額信息）
                        if (GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) {
                            const currentChat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
                            const chatName = currentChat.name;
                            const chatId = currentChat.id;
                            const safeMembers = currentChat.members || [];
                            const memberNames = convertMemberIdsToNames(safeMembers);
                            const memberStr = memberNames.length > 0 ? memberNames.join(', ') : (chatName || "User");
                            
                            // 用戶領取後，發送系統消息給API（包含金額，讓AI知道剩餘金額）
                            // 格式：[系統: XXX領取了紅包97.42元|紅包ID]
                            const protocolContent = `[系統: ${currentUserName}領取了紅包${grabAmount.toFixed(2)}元|${packetId}]`;
                            const fullProtocolMessage = `\n[Chat: ${chatName}|${chatId}]\n[With: ${memberStr}]\n[System: ${protocolContent}]`;
                            
                            // 存入消息歷史的格式（包含金額，供下一輪AI查看）
                            const historyContent = `[系統: ${currentUserName}領取了紅包${grabAmount.toFixed(2)}元|${packetId}]`;
                            currentChat.messages.push({ type: 'system', content: historyContent, isMe: false });
                            this.render();
                            
                            const configStr = localStorage.getItem('wx_phone_api_config');
                            if (configStr) {
                                const conf = JSON.parse(configStr);
                                if (conf.directMode && win.WX_DB && typeof win.WX_DB.saveApiChat === 'function') {
                                    win.WX_DB.saveApiChat(GLOBAL_ACTIVE_ID, currentChat);
                                }
                            } else if (window.TavernHelper) {
                                window.TavernHelper.createChatMessages([{ role:'user', message: fullProtocolMessage }]);
                            }
                        }
                        
                        // 使用更新後的數據打開紅包
                        this.openRedPacket(updatedData);
                        return;
                    }
                }
            }
            
            // 如果已經領取過或無法領取，直接打開詳情
            this.openRedPacket(data);
        },
        
        openRedPacket: function(data) {
            try {
                const overlay = doc.getElementById('wxRedPacketOverlay');
                if (!overlay) return;
                
                // 兼容舊格式（encodedData）和新格式（直接傳對象）
                if (typeof data === 'string') {
                    data = JSON.parse(decodeURIComponent(data));
                }
                
                const senderName = data.sender || "未知";
                const memo = data.memo || "恭喜發財，大吉大利";
                const list = data.list || [];
                const totalAmount = data.totalAmount || 0;
                
                doc.getElementById('wxRpSender').innerText = senderName + " 的紅包";
                doc.getElementById('wxRpMemo').innerText = memo;
                doc.getElementById('wxRpAvatar').style.backgroundImage = `url('https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(senderName)}&backgroundColor=e6e6e6')`;
                
                const count = list.length;
                const totalGrabbed = list.reduce((acc, cur) => acc + cur.amount, 0);
                const remainingAmount = totalAmount - totalGrabbed;
                
                // 總金額／已領／剩餘：三欄，數字在上、名目在下。
                // 🚨不要串成「總金額: ¥100 | 已領取: ¥92.31 (2個) | 剩餘: ¥7.69」——
                //   用冒號跟直線把欄位串成一行是程式印 log 的排法，擺在 UI 上就是格式感（她的原話：
                //   「這是 AI 格式展示方式，在 UI 是忌諱的東西」）。數字該有自己的位置，不是被標點分隔。
                const _stat = (v, label) => `<div class="wx-rp-stat"><b>¥${v.toFixed(2)}</b><span>${label}</span></div>`;
                doc.getElementById('wxRpInfoBar').innerHTML =
                    _stat(totalAmount, '總金額')
                    + _stat(totalGrabbed, count > 0 ? `已領 ${count} 個` : '已領')
                    + _stat(Math.max(0, remainingAmount), '剩餘');
                
                const sortedList = [...list].sort((a, b) => b.amount - a.amount);
                const listContainer = doc.getElementById('wxRpList');
                if (sortedList.length === 0) {
                    listContainer.innerHTML = '<div style="text-align:center; padding:30px; color:#999; font-size:13px;">等待領取中...</div>';
                } else {
                    listContainer.innerHTML = sortedList.map(item => `<div class="wx-rp-item"><div class="wx-rp-item-avatar" style="background-image: url('https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(item.name)}&backgroundColor=e6e6e6')"></div><div class="wx-rp-item-info"><div class="wx-rp-item-name">${item.name}</div><div class="wx-rp-item-time">${item.time || '剛剛'}</div></div><div class="wx-rp-item-amount">${item.amount.toFixed(2)} 元</div></div>`).join('');
                }
                overlay.classList.add('show');
            } catch (e) {
                console.error("打開紅包失敗:", e);
                AUI.alert("紅包數據錯誤");
            }
        },
        
        _rpRef: rpRef,
        _saveRedPacketData: saveRedPacketData,
        _getRedPacketData: getRedPacketData,
        
        onBack: function() { if (GLOBAL_ACTIVE_ID) { this.openChat(null); } else { if (win.PhoneSystem) win.PhoneSystem.goHome(); } },
        
        openChat: function(chatId) {
            GLOBAL_ACTIVE_ID = chatId;
            if (chatId) {
                GLOBAL_TAB = 'chat';
                if (!GLOBAL_CHATS[chatId]) {
                    const customs = win.WX_CONTACTS ? win.WX_CONTACTS.getAllCustomContacts() : [];
                    const target = customs.find(c => c.id === chatId);
                    if (target) { GLOBAL_CHATS[chatId] = { name: target.name, id: target.id, realName: target.realName || target.name, members: [target.name], isGroup: target.isGroup, messages: [], lastTime: '', unread: false, pushedCount: 0, renderedCount: 0, customAvatar: target.avatarId || null }; }
                    else { GLOBAL_CHATS[chatId] = { name: chatId, id: chatId, members: [], isGroup: false, messages: [], lastTime: '', unread: false, pushedCount: 0, renderedCount: 0 }; }
                }
                GLOBAL_CHATS[chatId].unread = false;
                setTimeout(_refreshLobbyUnread, 0);
                // 🚨 開聊天室的時候要把這個人的泡泡樣式貼回畫面。以前只有「按下保存的那一刻」會注入
                //    （saveConfig 自己呼叫 applyStyle），openChat 從來沒叫過——所以她調好的樣式
                //    一重開酒館就沒人再貼，看起來像被還原成預設，其實設定一直好好躺在 localStorage 裡。
                try { const B = win.WX_BUBBLE_SETTINGS; if (B && B.applyStyle) B.applyStyle(chatId); } catch (e) {}
            }
            this.render();
        },
        
        switchTab: function(tabName) { GLOBAL_TAB = tabName; this.render(); },

        // ── 通訊錄上面那幾顆：新的朋友／僅聊天的朋友／群組／標籤 ──────────
        //    跟「我 → 設置」同一套：一個 tab 名字就是一頁，返回鍵回上一層（見 wx_view 的 SUB_BACK）。
        currentTag: '',
        tagEditing: false,
        openContactSub: function (tab, tag) {
            this.currentTag = tag || '';
            this.tagEditing = false;
            GLOBAL_TAB = tab;
            this.render();
        },
        tagCreate: async function () {
            const name = await AUI.prompt('新標籤叫什麼', '');
            if (name == null) return;
            const t = String(name).trim();
            if (!t) return;
            const C = win.WX_CONTACTS;
            if (!C.addTag(t)) { AUI.toast('已經有這個標籤了'); return; }
            this.currentTag = t;
            this.tagEditing = true;          // 新開的標籤直接進選人，不用再多按一下
            GLOBAL_TAB = 'c_tag';
            this.render();
        },
        tagEdit: function () { this.tagEditing = !this.tagEditing; this.render(); },
        tagToggle: function (tag, id) {
            try { win.WX_CONTACTS.toggleTag(tag, id); } catch (e) {}
            this.render();
        },
        tagDelete: async function (tag) {
            const ok = await AUI.confirm('把標籤「' + tag + '」刪掉？裡面的人不會有事，只是不再分在這一類。');
            if (!ok) return;
            try { win.WX_CONTACTS.removeTag(tag); } catch (e) {}
            GLOBAL_TAB = 'c_tags';
            this.render();
        },
        // 只在群裡遇到的人 → 加進通訊錄
        addFriendFromGroup: function (name) {
            let id = '';
            try { id = win.WX_CONTACTS.addFriendByName(name); } catch (e) {}
            if (!id) { AUI.toast('加不進去'); return; }
            AUI.toast('把「' + name + '」加進通訊錄了');
            this.render();
        },
        // 「我」→「設置」：當成「我」底下的第二頁（GLOBAL_TAB='me_set'），開關按了照舊 render，不會跳回「我」
        openMeSettings: function() { GLOBAL_TAB = 'me_set'; this.render(); },

        // 🖼 換頭像是給角色的權限，預設關著：開了才會生圖（花錢花時間），也才會把用法教給 AI。
        toggleAvatarAi: function () {
            const A = win.WX_AVATAR_AI;
            if (!A) { try { AUI.toastr && AUI.toastr.info('模塊還沒載入完，等一下再試'); } catch (e) {} return; }
            const next = !A.isEnabled();
            A.setEnabled(next);
            this.render();
            try { AUI.toastr && (next ? AUI.toastr.success('角色可以自己換頭像了', '微信') : AUI.toastr.info('已關閉', '微信')); } catch (e) {}
        },
        // 👁 讓角色看我的頭像：開了之後，換頭像的下一輪會夾一張圖給它，看完它自己寫一句記著。
        toggleSeeMe: function () {
            const A = win.WX_AVATAR_AI;
            if (!A) { try { AUI.toastr && AUI.toastr.info('模塊還沒載入完，等一下再試'); } catch (e) {} return; }
            const next = !A.seeEnabled();
            A.setSeeEnabled(next);
            this.render();
            try { AUI.toastr && (next ? AUI.toastr.success('下次換頭像時它會看一眼', '微信') : AUI.toastr.info('已關閉', '微信')); } catch (e) {}
        },
        // 忘掉「這一間」記住的樣子，下次進來會重看一次。頭像是一間一個，記憶當然也是。
        forgetMyAvatar: function (chatId) {
            const A = win.WX_AVATAR_AI;
            if (A && A.clearSeeMemory) A.clearSeeMemory(chatId || GLOBAL_ACTIVE_ID);
            this.render();
            try { AUI.toastr && AUI.toastr.info('忘掉了，下次會重看一次', '微信'); } catch (e) {}
        },
        // 📞 微信的通話鍵：直接接通，不是留記錄。用的是電話 app 那套通話畫面——
        //    頭像、名字、計時、掛斷、逐字稿都在，而且對話讀寫同一份聊天記錄，跟微信共用記憶。
        //    差別只有兩件：微信不顯示號碼，掛斷回這個聊天室而不是電話 app 的通話紀錄。
        startCall: function () {
            const id = GLOBAL_ACTIVE_ID;
            const chat = id ? GLOBAL_CHATS[id] : null;
            const D = win.OS_DIALER || window.OS_DIALER;
            if (!chat || !D || !D.callContact) { try { AUI.toastr && AUI.toastr.info('通話還沒就緒'); } catch (e) {} return; }
            if (chat.isGroup) { try { AUI.toastr && AUI.toastr.info('群聊還不能通話'); } catch (e) {} return; }
            this.togglePanel();
            const host = doc.createElement('div');
            host.id = 'wx-call-host';
            host.style.cssText = 'position:absolute; inset:0; z-index:560; background:#111;';
            (APP_CONTAINER || doc.body).appendChild(host);
            const back = async function () {
                const h = doc.getElementById('wx-call-host');
                if (h && h.parentNode) h.parentNode.removeChild(h);
                // 🚨 通話是電話 app 直接寫進 OS_DB 的，記憶體裡這份還是撥出去之前的。
                //    不重讀就會「講完回來聊天室什麼都沒有」——內容其實在，只是畫面拿的是舊的。
                try {
                    if (win.OS_DB && win.OS_DB.getApiChat) {
                        const fresh = await win.OS_DB.getApiChat(id);
                        if (fresh && Array.isArray(fresh.messages)) GLOBAL_CHATS[id] = fresh;
                    }
                } catch (e) { console.warn('[WX] 通話後重讀失敗:', e); }
                try { win.wxApp && win.wxApp.render && win.wxApp.render(); } catch (e) {}
            };
            D.callContact(host, { id: id, name: chat.name || id }, { hideNumber: true, onExit: back });
        },
        setAvatarAiSource: function (v) {
            const A = win.WX_AVATAR_AI;
            if (A && A.setProvider) A.setProvider(v);
        },

        // ── 發現 tab：跑團同步（正文 <chat> 區塊 → 聊天列表 + 通訊錄）──
        storySync: function() { _storySyncDebounced(0); },

        // 🧹 AI 整理：叫副模型判斷「哪些房間其實是同一間」(先前上下文壓縮→同房被編多個亂 id)，
        //    產出「舊id→統一id」對應表存起來；不動歷史正文，同步時自動套用。
        storyTidyAi: async function() {
            const tr = AUI.toastr;
            if (!win.OS_API || typeof win.OS_API.chatSecondary !== 'function') { try { tr && tr.warning('副模型未就緒，無法整理', '發現'); } catch (e) {} return; }
            const parsed = await _parseStoryRoomsByFloor();
            const rooms = parsed.rooms || {};
            const keys = Object.keys(rooms);
            if (keys.length < 2) { try { tr && tr.info('房間太少，不需整理', '發現'); } catch (e) {} return; }
            // 給副模型的精簡清單：id / 名 / 成員 / 訊息數 / 最後兩句樣本（夠它判斷同不同間）
            const payload = keys.map(function (k) {
                const r = rooms[k];
                const last = (r.msgs || []).slice(-2).map(function (m) { return (m.sender ? '[' + m.sender + '] ' : '') + String(m.content || '').slice(0, 40); }).join(' / ');
                return { id: r.id, name: r.name, members: (r.members || []).join('、'), count: (r.msgs || []).length, sample: last };
            });
            const sys = '你是資料整理工具。下面 JSON 是從一段跑團劇情解析出的「手機聊天室」清單；因為先前模型在不同段落為同一間聊天室編了不同的 id（上下文壓縮導致遺忘），同一間房可能裂成多筆。請判斷哪些筆其實是同一間聊天室、歸為一組。\n判斷依據（綜合多項、別只看單一條）：房名相同或明顯同義、成員相同或高度重疊、對話內容是同一串的延續。只要不確定是不是同一間就「不要合併」、各自獨立。\n每組的「統一 id」固定取該組裡 count 最大的那筆的 id。\n只輸出 JSON、不要任何解說或標記，格式：\n{"groups":[{"canonicalId":"統一id","name":"顯示名","ids":["這組所有原id"]}]}\n只列「需要合併」（ids 長度>1）的組；單獨一間不需合併的不要列。';
            const messages = [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(payload) }];
            try { tr && tr.info('副模型整理中…', '發現'); } catch (e) {}
            const self = this;
            try {
                win.OS_API.chatSecondary(messages, null, async function (resp) {
                    try {
                        let s = String(resp || '').trim();
                        const mm = s.match(/\{[\s\S]*\}/); if (mm) s = mm[0];
                        const obj = JSON.parse(s);
                        const groups = (obj && obj.groups) || [];
                        const remap = _loadRoomRemap();   // 併入既有對應表（可多次整理累加）
                        let merged = 0;
                        groups.forEach(function (g) {
                            const cid = String((g && g.canonicalId) || '').trim(); if (!cid) return;
                            ((g && g.ids) || []).forEach(function (oid) { oid = String(oid || '').trim(); if (oid && oid !== cid) { remap[oid] = cid; merged++; } });
                        });
                        if (!merged) { try { tr && tr.info('沒有偵測到需要合併的重複房間', '發現'); } catch (e) {} return; }
                        _saveRoomRemap(remap);
                        await _storySyncNow();
                        self._fillStorySyncStatus();
                        try { tr && tr.success('整理完成：把 ' + merged + ' 個重複 id 收斂進 ' + groups.length + ' 間', '發現'); } catch (e) {}
                    } catch (e) { try { tr && tr.error('整理失敗：AI 回傳格式不對', '發現'); } catch (e2) {} console.warn('[發現整理] 解析失敗:', e, resp); }
                }, function (err) { try { tr && tr.error('整理失敗：' + ((err && err.message) || err), '發現'); } catch (e) {} }, { task: 'extract', label: '聊天室 id 整理' });
            } catch (e) { try { tr && tr.error('整理失敗：' + ((e && e.message) || e), '發現'); } catch (e2) {} }
        },

        // 清掉本聊天的 AI 整理對應表（還原成原始分群）再重新同步
        storyTidyReset: async function() {
            try { _saveRoomRemap({}); } catch (e) {}
            await _storySyncNow();
            this._fillStorySyncStatus();
            try { AUI.toastr && AUI.toastr.info('已清除整理結果、還原原始分群', '發現'); } catch (e) {}
        },
        storyResync: async function() {
            await _storySyncNow();
            this._fillStorySyncStatus();
        },
        _fillStorySyncStatus: function() {
            const mount = APP_CONTAINER && APP_CONTAINER.querySelector('#wx-story-status');
            if (!mount) return;
            const st = _storyStat || {};
            if (!st.at) { mount.innerHTML = '<div class="wx-vnlog-empty">還沒同步過。<br>劇情裡出現 &lt;chat chatroom=&quot;…&quot;&gt; 的對話會自動進聊天列表與通訊錄。</div>'; return; }
            const when = new Date(st.at); const hh = ('0' + when.getHours()).slice(-2), mi = ('0' + when.getMinutes()).slice(-2);
            mount.innerHTML = '<div class="wx-vnlog-empty">已同步 ' + st.rooms + ' 間聊天室、' + st.contacts + ' 位聯絡人<br>讀到第 ' + (st.floor + 1) + ' 樓・' + hh + ':' + mi + '</div>';
        },

        // 「我」頁：暱稱與簽名。這是整支手機的暱稱（st.user() 的 nickname），論壇、微博以外的面板都跟它走；留空＝退回人設真名
        editNickname: async function() {
            const P = win.WX_PROFILE; if (!P || !P.get) return;
            const cur = P.get();
            const v = await AUI.prompt('暱稱（留空＝用人設真名）', cur.nickname || '');
            if (v == null) return;
            P.update({ nickname: v.trim() });
            this.render();
        },
        editSignature: async function() {
            const P = win.WX_PROFILE; if (!P || !P.get) return;
            const cur = P.get();
            const v = await AUI.prompt('個性簽名', cur.signature || '');
            if (v == null) return;
            P.update({ signature: v.trim() });
            this.render();
        },
        toggleDarkMode: function() {
            DARK_MODE = !DARK_MODE;
            localStorage.setItem('wx_dark_mode', DARK_MODE);
            this.render();
        },
        
        deleteChat: function(chatId) { if (GLOBAL_CHATS[chatId]) {
            // 紅包／轉帳／禮物的已領狀態跟著聊天一起走（刪訊息、清空也是同一套，見 wx_message_manager.purgeProtocolState）
            try { const MM = win.WX_MESSAGE_MANAGER; if (MM && MM.purgeProtocolState) MM.purgeProtocolState(chatId, GLOBAL_CHATS[chatId].messages); } catch (e) {}
            try { if (win.WX_CARDS) win.WX_CARDS.clear(chatId); } catch (e) {}
            // 🗑 跑團同步別把這個人／這個群又建回來（見 _markRemoved）
            try { _markRemoved(GLOBAL_CHATS[chatId]); } catch (e) {}
            delete GLOBAL_CHATS[chatId]; if (GLOBAL_ACTIVE_ID === chatId) { GLOBAL_ACTIVE_ID = null; } this.render(); } },
        
        reloadApiChats: async function() { /* ... */ },
        
        render: function() {
            if (!APP_CONTAINER) return;
            // 儲存滾動位置，避免重建後閃回頂部
            const prevScroll = APP_CONTAINER.querySelector('.wx-room-scroll');
            const atBottom = !prevScroll || (prevScroll.scrollHeight - prevScroll.scrollTop - prevScroll.clientHeight < 80);
            const savedTop = prevScroll ? prevScroll.scrollTop : 0;

            const html = window.WX_VIEW.renderShell(GLOBAL_ACTIVE_ID, GLOBAL_CHATS, GLOBAL_TAB, DARK_MODE);
            APP_CONTAINER.innerHTML = html;

            // 「發現」tab：跑團同步狀態
            if (GLOBAL_TAB === 'discover') { try { this._fillStorySyncStatus(); } catch (e) {} }

            const room = APP_CONTAINER.querySelector('.wx-room-scroll');
            if (room && GLOBAL_ACTIVE_ID) {
                // 同步設定滾動位置，避免瀏覽器繪製空白頂部
                room.scrollTop = atBottom ? room.scrollHeight : savedTop;
                const chat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
                if (chat) { chat.renderedCount = chat.messages.length; }
            }
            if (win.WX_MESSAGE_MANAGER && typeof win.WX_MESSAGE_MANAGER._updateUI === 'function') { setTimeout(() => win.WX_MESSAGE_MANAGER._updateUI(), 100); }
        },
        
        bigImg: function(src) { const V = win.OS_PHOTO_VIEWER || window.OS_PHOTO_VIEWER; if (V) V.open([{ src: src }], 0); else win.open(src, '_blank'); },

        // 圖片生完寫回訊息：[图片:描述] → [图片:網址]，下次開這段對話直接顯示、不再重生
        setImageUrl: async function(chatId, msgIdx, desc, url) {
            const chat = GLOBAL_CHATS[chatId];
            if (!chat || !Array.isArray(chat.messages) || !url) return false;
            // 🚨 標籤清單吃 WX_VIEW.MSG_TAG 那一份（以前手打的少了「照片」→ 那種圖生完寫不回去）
            const _IMG = (win.WX_VIEW && win.WX_VIEW.MSG_TAG && win.WX_VIEW.MSG_TAG.IMAGE) || '图片|圖片|照片|Img';
            const tagRe = new RegExp('\\[\\s*(' + _IMG + ')\\s*[:：]?\\s*([\\s\\S]*?)\\s*\\]', 'i');
            const hits = (m) => m && typeof m.content === 'string' && tagRe.test(m.content) && (!desc || m.content.indexOf(desc) >= 0);
            let idx = Number.isInteger(msgIdx) ? msgIdx : -1;
            if (!(idx >= 0 && hits(chat.messages[idx]))) idx = chat.messages.findIndex(hits);
            if (idx < 0) return false;
            chat.messages[idx].content = chat.messages[idx].content.replace(tagRe, `[图片:${url}]`);
            if (win.WX_DB && typeof win.WX_DB.saveApiChat === 'function') { try { await win.WX_DB.saveApiChat(chatId, chat); } catch (e) { console.warn('[wx] 圖片網址寫回失敗:', e); } }
            return true;
        },
        
        toggleVoice: function(el, txt) { const box = el.querySelector('.wx-trans-box'); if(box.style.display==='block') { box.style.display='none'; } else { box.style.display='block'; box.innerText = ''; const t = decodeURIComponent(txt); let i=0; const timer = setInterval(()=>{ box.innerText += t.charAt(i); i++; if(i>=t.length) clearInterval(timer); }, 30); } },
        
        onInputCheck: function(el) { const btn = el.parentElement.querySelector('.wx-send-btn'); const plus = el.parentElement.querySelector('.wx-icon-btn:nth-child(4)'); if (el.value.trim()) { btn.classList.add('show'); plus.style.display = 'none'; } else { btn.classList.remove('show'); plus.style.display = 'block'; } },
        onInputKey: function(e, el) { if(e.key==='Enter') this.sendMsg(el); },

        // 長按（或右鍵）某一則 → 引用它。只記「誰＋前幾個字」，送出時組成標記接在訊息最前面。
        quoteMsg: function (idx) {
            const chat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
            const m = (chat && Array.isArray(chat.messages)) ? chat.messages[idx] : null;
            if (!m || m.type === 'system' || m.isLoading) return;
            const who = String(m.senderName || m.sender || '').trim()
                     || (m.isMe ? _meName() : (chat.realName || chat.name || ''));
            const raw = String(m.content || '').replace(/\s+/g, ' ').trim();   // 媒體訊息就引用它的標籤本身，看得出引用的是什麼
            if (!who || !raw) return;
            _replyTo = { name: who, text: raw.slice(0, 30) };
            _renderReplyingBar();
            const inputEl = APP_CONTAINER ? APP_CONTAINER.querySelector('.wx-input-real') : null;
            if (inputEl) inputEl.focus();
        },
        cancelQuote: function () { _replyTo = null; _renderReplyingBar(); },
        
        togglePanel: function() {
            const panel = APP_CONTAINER.querySelector('.wx-action-panel');
            const scroll = APP_CONTAINER.querySelector('.wx-room-scroll');
            // 關閉表情包面板
            const stkPanel = APP_CONTAINER.querySelector('.wx-sticker-panel');
            if (stkPanel) stkPanel.classList.remove('open');
            if (panel) {
                panel.classList.toggle('open');
                if (panel.classList.contains('open') && scroll) { scroll.style.paddingBottom = '290px'; }
                else if (scroll) { scroll.style.paddingBottom = '70px'; }
            }
        },
        toggleStickerPanel: function() {
            const panel = APP_CONTAINER.querySelector('.wx-sticker-panel');
            const scroll = APP_CONTAINER.querySelector('.wx-room-scroll');
            // 關閉功能面板
            const actionPanel = APP_CONTAINER.querySelector('.wx-action-panel');
            if (actionPanel) actionPanel.classList.remove('open');
            if (!panel) return;
            panel.classList.toggle('open');
            if (panel.classList.contains('open') && scroll) {
                scroll.style.paddingBottom = '280px';
                if (win.WX_STICKER) { win.WX_STICKER.renderTabs(); win.WX_STICKER.renderGrid(win.WX_STICKER._currentLib); }
            } else if (scroll) {
                scroll.style.paddingBottom = '70px';
            }
        },
        onScrollDot: function(el) { const dots = APP_CONTAINER.querySelectorAll('.wx-dot'); const pageIndex = Math.round(el.scrollLeft / el.clientWidth); dots.forEach((d, i) => { if(i === pageIndex) d.classList.add('active'); else d.classList.remove('active'); }); },
        
        action: function(type) { PENDING_ACTION_TYPE = type; const modal = doc.querySelector('#wxActionModal'); const title = doc.querySelector('#wxModalTitle'); const input1 = doc.querySelector('#wxModalInput'); const input2 = doc.querySelector('#wxModalInput2'); const selectEl = doc.querySelector('#wxModalSelect'); if (!modal) return; if (title) title.style.display = 'block'; if (input1) input1.style.display = 'block'; const footer = modal.querySelector('.wx-modal-footer'); if (footer) footer.style.display = 'flex'; input1.value = ''; if(input2) { input2.value = ''; input2.classList.add('hidden'); } if(selectEl) { selectEl.innerHTML = ''; selectEl.classList.add('hidden'); } const pickBtn = doc.querySelector('#wxModalPick'); if (pickBtn) { pickBtn.classList.toggle('hidden', type !== 'photo'); pickBtn.disabled = false; } const micBtn = doc.querySelector('#wxModalMic'); if (micBtn) { const VI = win.OS_VOICE_INPUT; micBtn.classList.toggle('hidden', !(type === 'voice_msg' && VI && VI.isSupported())); } let hint = "請輸入..."; switch(type) { case 'photo': hint = "或貼上圖片網址"; break; case 'video_file': hint = "請輸入視頻描述或檔名"; break; case 'file_card': hint = "請輸入檔名"; break; case 'voice_msg': hint = "請輸入語音消息內容"; break; case 'call': hint = "通話記錄寫什麼（例如：聊了半小時）"; break; case 'location': title.innerText = "發送位置"; input1.placeholder = "地點名稱"; input2.placeholder = "詳細地址"; input2.classList.remove('hidden'); break; case 'redpacket': title.innerText = "發送紅包"; input1.placeholder = "金額"; input2.placeholder = "備註（選填，如：恭喜發財）"; input2.classList.remove('hidden'); break; case 'transfer': hint = "請輸入轉帳金額"; title.innerText = "轉帳"; input1.placeholder = "金額"; input2.placeholder = "備註（選填）"; input2.classList.remove('hidden'); if(selectEl && GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) { const chat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID]; const allContacts = (win.WX_CONTACTS && typeof win.WX_CONTACTS.getAllCustomContacts === 'function') ? win.WX_CONTACTS.getAllCustomContacts() : []; let currentUserName = "User"; if (win.WX_USER && typeof win.WX_USER.getInfo === 'function') { const userInfo = win.WX_USER.getInfo(); currentUserName = userInfo.name || "User"; } if (chat.isGroup && chat.members && chat.members.length > 0) { selectEl.innerHTML = '<option value="">選擇接收者</option>'; chat.members.forEach(memberId => { if (memberId === "User" || memberId === "user") return; const contact = allContacts.find(c => c.id === memberId); const memberName = contact ? contact.name : memberId; selectEl.innerHTML += `<option value="${memberName}">${memberName}</option>`; }); selectEl.classList.remove('hidden'); } else { selectEl.innerHTML = `<option value="${chat.name || chat.id}">${chat.name || chat.id}</option>`; selectEl.classList.remove('hidden'); } } break; case 'gift': title.innerText = "贈送禮物"; input1.placeholder = "格式: 🍗雞腿x1"; input2.placeholder = "價格: 50元"; input2.classList.remove('hidden'); break; } if (type !== 'location' && type !== 'gift' && type !== 'transfer') { title.innerText = hint; input1.placeholder = hint; } if (type === 'photo') title.innerText = '傳照片'; modal.classList.add('show'); if (type !== 'photo') input1.focus(); this.togglePanel(); },

        // 📷 從相簿選一張照片傳出去：壓成 JPEG 存進圖庫，訊息裡只放圖庫編號。
        //    對方要「看」這張照片的話，在 triggerReply 那邊照頭像的做法只送一次（_photoOnceMessage）。
        pickPhotoAndSend: async function () {
            const PI = win.OS_PHONE_IMAGE;
            const btn = doc.querySelector('#wxModalPick');
            if (!PI || !PI.pickPhoto || !win.OS_DB || !win.OS_DB.saveImage) { AUI.toast('這裡還不能傳照片'); return; }
            let dataUrl = '';
            try { dataUrl = await PI.pickPhoto(); } catch (e) { console.warn('[WX] 選照片失敗:', e); AUI.toast('照片讀不進來'); return; }
            if (!dataUrl) return;   // 取消
            if (btn) btn.disabled = true;
            try {
                const blob = await (await fetch(dataUrl)).blob();
                const id = 'img_wx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                await win.OS_DB.saveImage(id, blob);
                this.closeModal();
                await this.sendMsg(null, `[图片:${id}]`);
            } catch (e) {
                console.warn('[WX] 照片存檔失敗:', e);
                AUI.toast('照片存不進去');
            } finally { if (btn) btn.disabled = false; }
        },
        // 🎙 語音訊息「按一下說話」：錄音 → OS_VOICE_INPUT 轉成字 → 填進輸入框，她看過再按發送。
        //    第一次要下載聽寫檔（約 250MB），先問過才下載；下載過的就直接載入、接著開始錄。
        _voiceSetBtn: function (state, text) {
            const btn = doc.querySelector('#wxModalMic');
            if (!btn) return;
            const icon = state === 'recording' ? 'fa-stop' : (state === 'busy' ? 'fa-spinner fa-spin' : 'fa-microphone');
            const label = text || (state === 'recording' ? '說完了' : '按一下說話');
            btn.innerHTML = `<i class="fa-solid ${icon}"></i>${label}`;
            btn.classList.toggle('is-recording', state === 'recording');
            btn.disabled = state === 'busy';
        },
        _voiceReset: function () {
            const VI = win.OS_VOICE_INPUT;
            if (VI && VI.isRecording()) VI.cancel();
            this._voiceSetBtn('idle');
        },
        voiceToggle: async function () {
            const VI = win.OS_VOICE_INPUT;
            if (!VI || !VI.isSupported()) { AUI.toast('這裡不能錄音'); return; }
            // 模組丟出來的錯誤是中文就照講，瀏覽器的英文錯誤不上畫面
            const why = (e) => { const m = String((e && e.message) || ''); return /[一-鿿]/.test(m) ? m : '再試一次'; };
            const input = doc.querySelector('#wxModalInput');

            if (VI.isRecording()) {
                this._voiceSetBtn('busy', '正在轉成字');
                try {
                    const rec = await VI.stop();
                    const out = await VI.transcribe(rec.blob);
                    if (!out.text) AUI.toast('沒聽到聲音');
                    else if (input) input.value = input.value.trim() + out.text;
                } catch (e) {
                    console.warn('[WX] 語音轉字失敗:', e);
                    AUI.toast('沒轉成字，' + why(e));
                }
                this._voiceSetBtn('idle');
                return;
            }

            if (!VI.isReady()) {
                const downloaded = await VI.isDownloaded();
                if (!downloaded) {
                    const ok = await AUI.confirm('第一次用要先下載聽寫用的檔案，大約 250MB，下載一次就好。建議連 Wi-Fi。要現在下載嗎？');
                    if (!ok) return;
                }
                this._voiceSetBtn('busy', downloaded ? '準備中' : '下載中 0%');
                try {
                    await VI.prepare((p) => {
                        if (p.stage === 'download' && !downloaded) this._voiceSetBtn('busy', '下載中 ' + p.percent + '%');
                        else if (p.stage === 'loading') this._voiceSetBtn('busy', '準備中');
                    });
                } catch (e) {
                    console.warn('[WX] 聽寫準備失敗:', e);
                    AUI.toast('聽寫沒準備好，' + why(e));
                    this._voiceSetBtn('idle');
                    return;
                }
                if (!downloaded) { AUI.toast('下載好了，按一下就能說話'); this._voiceSetBtn('idle'); return; }
            }

            if (PENDING_ACTION_TYPE !== 'voice_msg') { this._voiceSetBtn('idle'); return; }   // 準備的時候她把框關了
            try {
                await VI.start();
                this._voiceSetBtn('recording');
            } catch (e) {
                console.warn('[WX] 開麥克風失敗:', e);
                AUI.toast(e && e.name === 'NotAllowedError' ? '沒有麥克風權限，要到瀏覽器設定裡允許' : ('麥克風開不起來，' + why(e)));
                this._voiceSetBtn('idle');
            }
        },
        closeModal: function() { const modal = doc.querySelector('#wxActionModal'); if(modal) modal.classList.remove('show'); PENDING_ACTION_TYPE = null; this._voiceReset(); },
        confirmModal: function() { 
            const input1 = doc.querySelector('#wxModalInput'); 
            const input2 = doc.querySelector('#wxModalInput2'); 
            const selectEl = doc.querySelector('#wxModalSelect'); 
            const val1 = input1.value.trim(); 
            const val2 = input2.value.trim(); 
            const selectVal = selectEl ? selectEl.value.trim() : ''; 
            if (!val1) { this.closeModal(); return; } 
            let content = ""; 
            switch(PENDING_ACTION_TYPE) { 
                case 'photo': content = `[Img: ${val1}]`; break; 
                case 'video_file': content = `[Video: ${val1}]`; break; 
                case 'file_card': content = `[File: ${val1}]`; break; 
                case 'voice_msg': content = `[Voice: ${val1}]`; break; 
                case 'call': content = `[通話: ${val1}]`; break; 
                case 'location': content = val2 ? `[定位: ${val1}-${val2}]` : `[定位: ${val1}]`; break; 
                case 'redpacket': 
                    const redPacketAmount = parseFloat(val1);
                    if (isNaN(redPacketAmount) || redPacketAmount <= 0) {
                        AUI.alert('請輸入有效的紅包金額！');
                        this.closeModal();
                        return;
                    }
                    // 🔥 檢查餘額並扣款
                    if (win.WX_WALLET) {
                        const currentBalance = win.WX_WALLET.getBalance();
                        if (currentBalance < redPacketAmount) {
                            AUI.alert('餘額不足，無法發送紅包！');
                            this.closeModal();
                            return;
                        }
                        // 立即扣款（紅包發送時就扣款）
                        win.WX_WALLET.transaction(-redPacketAmount, `微信紅包`);
                    }
                    // 生成紅包ID（3位數字）
                    const randomNum = Math.floor(Math.random() * 1000);
                    const packetId = 'rp_' + String(randomNum).padStart(3, '0');
                    // 默認紅包數量：根據金額計算，最小1個，最大100個，每個至少0.01元
                    const maxCount = Math.floor(redPacketAmount / 0.01);
                    const totalCount = Math.min(100, Math.max(1, maxCount));
                    // 新格式：[RedPacket: 金額|備註|紅包ID|數量]
                    const memo = val2 || '恭喜發財，大吉大利';
                    content = `[RedPacket: ${val1}|${memo}|${packetId}|${totalCount}]`;
                    break; 
                case 'transfer': 
                    const amountNum = parseFloat(val1);
                    if (isNaN(amountNum) || amountNum <= 0) {
                        AUI.alert('請輸入有效的轉帳金額！');
                        this.closeModal();
                        return;
                    }
                    // 🔥 檢查餘額（但不扣款，等接收時才扣）
                    if (win.WX_WALLET) {
                        const currentBalance = win.WX_WALLET.getBalance();
                        if (currentBalance < amountNum) {
                            AUI.alert('餘額不足，無法轉帳！');
                            this.closeModal();
                            return;
                        }
                    }
                    const txnId = "Txn" + Math.floor(Math.random() * 90 + 10);
                    const targetName = selectVal || (GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID] ? (GLOBAL_CHATS[GLOBAL_ACTIVE_ID].name || GLOBAL_ACTIVE_ID) : '');
                    // 🔥 保存轉帳信息（有時效，見 TXN_TTL）
                    const transferData = {
                        amount: amountNum,
                        timestamp: Date.now(),
                        targetName: targetName,
                        status: 'pending',
                        memo: val2 || ''
                    };
                    const _txnChat = GLOBAL_ACTIVE_ID;   // 定時器晚十分鐘才跑，那時她可能已經切到別間，先記起來
                    _txnSave(_txnChat, txnId, transferData);
                    
                    // 🔥 到期就自動標過期
                    setTimeout(() => {
                        const data = _txnLoad(_txnChat, txnId);
                        if (data) {
                            if (data.status === 'pending') {
                                data.status = 'expired';
                                _txnSave(_txnChat, txnId, data);
                                // 更新轉帳卡片狀態
                                const uniqueId = 'ID_' + txnId;
                                _setCardStatus(_txnChat, 'transfer', txnId, 'expired', uniqueId);
                                // 觸發重新渲染
                                if (win.wxApp && typeof win.wxApp.render === 'function') {
                                    win.wxApp.render();
                                }
                            }
                        }
                    }, TXN_TTL);
                    
                    content = val2 ? `[Transfer: ${val1}|${targetName}|${val2}|${txnId}]` : `[Transfer: ${val1}|${targetName}||${txnId}]`;
                    break; 
                case 'gift': content = val2 ? `[Gift: ${val1}-${val2}]` : `[Gift: ${val1}-無價]`; content += '\n(提示：你收到了一份禮物，請根據物品價值做出對應的反應，可接收或拒絕)'; break; 
            } 
            if(content) this.sendMsg(null, content); 
            this.closeModal(); 
        },
        
        openGift: function(info, price, hashId, el) { const overlay = doc.querySelector('#wxGiftOverlay'); const nameEl = doc.querySelector('#wxGiftName'); const priceEl = doc.querySelector('#wxGiftPrice'); const iconEl = doc.querySelector('#wxGiftIcon'); const btnGroup = doc.querySelector('#wxGiftBtnGroup'); const closeBtn = doc.querySelector('#wxGiftClose'); const acceptBtn = doc.querySelector('#wxGiftAccept'); const refuseBtn = doc.querySelector('#wxGiftRefuse'); if (overlay && nameEl) { let fullInfo = decodeURIComponent(info); let icon = "🎁"; let name = fullInfo; const emojiMatch = fullInfo.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27FF])/); if (emojiMatch) { icon = emojiMatch[0]; name = fullInfo.replace(icon, '').trim(); } nameEl.innerText = name; priceEl.innerText = decodeURIComponent(price); if (icon !== '🎁') iconEl.innerText = icon; else iconEl.innerHTML = '<i class="fa-solid fa-gift"></i>'; const status = _getCardStatus(null, 'gift', String(hashId || '').replace(/^ID_/i, ''), hashId); if (hashId === 'VIEW_ONLY' || status) { if(btnGroup) btnGroup.style.display = 'none'; if(closeBtn) closeBtn.style.display = 'block'; } else { if(btnGroup) btnGroup.style.display = 'flex'; if(closeBtn) closeBtn.style.display = 'block'; if(acceptBtn) acceptBtn.onclick = () => this.resolveGift('accepted', name, hashId); if(refuseBtn) refuseBtn.onclick = () => this.resolveGift('returned', name, hashId); } overlay.classList.add('show'); } },
        resolveGift: function(action, name, hashId) {
            const _gid = String(hashId || '').replace(/^ID_/i, '');
            _setCardStatus(null, 'gift', _gid, action, hashId);
            doc.querySelector('#wxGiftOverlay').classList.remove('show');
            
            // 提取Gift ID（去掉ID_前缀）
            const giftId = hashId.startsWith('ID_') ? hashId.substring(3) : hashId;
            const actionText = (action === 'accepted') ? 'Accept' : 'Return';
            const content = `[系統: ${actionText} ${name}|${giftId}]`;
            
            if (GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) {
                const currentChat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
                currentChat.messages.push({ type: 'system', content: content, isMe: false });
                this.render();
                const chatName = currentChat.name;
                const chatId = currentChat.id;
                const safeMembers = currentChat.members || [];
                const memberNames = convertMemberIdsToNames(safeMembers);
                const memberStr = memberNames.length > 0 ? memberNames.join(', ') : (chatName || "User");
                const fullProtocolMessage = `\n[Chat: ${chatName}|${chatId}]\n[With: ${memberStr}]\n[System: ${content}]`;
                const configStr = localStorage.getItem('wx_phone_api_config');
                if (configStr) {
                    const conf = JSON.parse(configStr);
                    if (conf.directMode && win.WX_DB && typeof win.WX_DB.saveApiChat === 'function') {
                        win.WX_DB.saveApiChat(GLOBAL_ACTIVE_ID, currentChat);
                    }
                } else if (window.TavernHelper) {
                    window.TavernHelper.createChatMessages([{ role:'user', message: fullProtocolMessage }]);
                }
            }
        },
        
        // 🚨 已經收過／退過／過期的轉帳，點開只能看，不能再按。以前這裡完全沒判斷狀態，
        //    所以她收了款、底下系統訊息也寫了，卡片點開那兩顆還是照按（按下去會再送一次協議給模型）。
        openTransfer: function(amount, hashId, el) {
            const overlay = doc.querySelector('#wxTransferOverlay');
            const amountEl = doc.querySelector('#wxTransferAmount');
            const btnReceive = doc.querySelector('#wxBtnReceive');
            const btnReturn = doc.querySelector('#wxBtnReturn');
            const actions = doc.querySelector('#wxTransferOverlay .wx-transfer-actions');
            const stateEl = doc.querySelector('#wxTransferState');
            if (!overlay || !amountEl) return;
            amountEl.innerText = '¥' + amount;

            const _tid = String(hashId || '').replace(/^ID_/i, '');
            let status = _getCardStatus(null, 'transfer', _tid, hashId);
            // 轉帳單自己也記著狀態（超過時效沒收就過期），兩邊有一邊說處理過就是處理過
            if (!status) { try { const d = _txnLoad(null, _tid); if (d && d.status && d.status !== 'pending') status = d.status; } catch (e) {} }

            const DONE = { accepted: '已收款', returned: '已退回', expired: '已過期' };
            if (status && DONE[status]) {
                if (actions) actions.style.display = 'none';
                if (stateEl) stateEl.innerText = DONE[status];
            } else {
                if (actions) actions.style.display = '';
                if (stateEl) stateEl.innerText = '待收款金額';
                if (btnReceive) btnReceive.onclick = () => this.resolveTransfer('accepted', amount, hashId);
                if (btnReturn) btnReturn.onclick = () => this.resolveTransfer('returned', amount, hashId);
            }
            overlay.classList.add('show');
        },
        closeTransfer: function() { doc.querySelector('#wxTransferOverlay').classList.remove('show'); },
        resolveTransfer: function(action, amount, hashId) {
            // 提取Transaction ID（去掉ID_前缀）
            const txnId = hashId.startsWith('ID_') ? hashId.substring(3) : hashId;
            const transferData = _txnLoad(null, txnId);
            
            if (transferData) {
                const now = Date.now();
                const elapsed = now - transferData.timestamp;
                const tenMinutes = TXN_TTL;
                
                if (action === 'accepted') {
                    // 接收：檢查是否還在時效內且狀態為pending
                    if (transferData.status === 'pending' && elapsed <= tenMinutes) {
                        // 接收方收款（這裡是接收方，所以是加錢）
                        // 發送方扣款會在 processSystemIntent 中處理（當AI輸出Accept時）
                        if (win.WX_WALLET) {
                            const amountNum = parseFloat(amount);
                            if (!isNaN(amountNum)) {
                                const chatName = GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]
                                    ? GLOBAL_CHATS[GLOBAL_ACTIVE_ID].name
                                    : '未知聊天';
                                win.WX_WALLET.transaction(amountNum, `微信收款 - ${chatName}`);
                            }
                        }
                        
                        // 更新轉帳狀態
                        transferData.status = 'accepted';
                        _txnSave(null, txnId, transferData);
                        _setCardStatus(null, 'transfer', txnId, 'accepted', hashId);
                    } else if (transferData.status === 'expired' || elapsed > tenMinutes) {
                        // 已過期
                        AUI.alert('這筆轉帳已經過期了');
                        transferData.status = 'expired';
                        _txnSave(null, txnId, transferData);
                        _setCardStatus(null, 'transfer', txnId, 'expired', hashId);
                        this.closeTransfer();
                        return;
                    } else {
                        // 已經處理過
                        _setCardStatus(null, 'transfer', txnId, transferData.status, hashId);
                    }
                } else {
                    // 拒絕：不扣款，只更新狀態
                    transferData.status = 'returned';
                    _txnSave(null, txnId, transferData);
                    _setCardStatus(null, 'transfer', txnId, 'returned', hashId);
                }
            } else {
                // 沒有找到轉帳記錄，可能是舊格式，直接標記狀態
                _setCardStatus(null, 'transfer', txnId, action, hashId);
                // 舊格式：直接給接收方加錢（如果接收）
                if (win.WX_WALLET && action === 'accepted') {
                    const amountNum = parseFloat(amount);
                    if (!isNaN(amountNum)) {
                        const chatName = GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]
                            ? GLOBAL_CHATS[GLOBAL_ACTIVE_ID].name
                            : '未知聊天';
                        win.WX_WALLET.transaction(amountNum, `微信收款 - ${chatName}`);
                    }
                }
            }
            
            this.closeTransfer();

            const actionText = (action === 'accepted') ? 'Accept' : 'Return';
            const content = `[系統: ${actionText} ${amount}|${txnId}]`;

            if (GLOBAL_ACTIVE_ID && GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) {
                const currentChat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
                currentChat.messages.push({ type: 'system', content: content, isMe: false });
                this.render();
                const chatName = currentChat.name;
                const chatId = currentChat.id;
                const safeMembers = currentChat.members || [];
                const memberNames = convertMemberIdsToNames(safeMembers);
                const memberStr = memberNames.length > 0 ? memberNames.join(', ') : (chatName || "User");
                const fullProtocolMessage = `\n[Chat: ${chatName}|${chatId}]\n[With: ${memberStr}]\n[System: ${content}]`;
                const configStr = localStorage.getItem('wx_phone_api_config');
                if (configStr) {
                    const conf = JSON.parse(configStr);
                    if (conf.directMode && win.WX_DB && typeof win.WX_DB.saveApiChat === 'function') {
                        win.WX_DB.saveApiChat(GLOBAL_ACTIVE_ID, currentChat);
                    }
                } else if (window.TavernHelper) {
                    window.TavernHelper.createChatMessages([{ role:'user', message: fullProtocolMessage }]);
                }
            }
        },
        
        // --- 發送消息 (🔥 關鍵修復點) ---
        sendMsg: async function(el, contentOverride = null) {
            let text = contentOverride; let inputEl = null;
            if (!text) { inputEl = APP_CONTAINER.querySelector('.wx-input-real'); if(inputEl) text = inputEl.value.trim(); }
            if(!text || !GLOBAL_ACTIVE_ID) return;
            
            if (!GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) { GLOBAL_CHATS[GLOBAL_ACTIVE_ID] = { name: GLOBAL_ACTIVE_ID, id: GLOBAL_ACTIVE_ID, members:[], messages: [], lastTime: '', unread: false, pushedCount:0, renderedCount:0 }; }
            const currentChat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
            
            // 「我」在微信裡叫什麼（暱稱優先）——AI 看到的發話人就是這個名字
            const myName = _meName();

            const chatName = currentChat.name; const chatId = currentChat.id;
            const safeMembers = (currentChat.members && Array.isArray(currentChat.members)) ? currentChat.members : [];
            const memberNames = convertMemberIdsToNames(safeMembers);
            const memberStr = memberNames.length > 0 ? memberNames.join(', ') : (chatName || "User");
            // 引用回覆：畫面上存成欄位，送進正文的那份帶標記（AI 才知道她在回誰的哪句）
            const _q = _replyTo;
            const _qMark = (_q && win.OS_API && win.OS_API.chatQuote) ? win.OS_API.chatQuote.build(_q.name, _q.text) : '';
            const fullProtocolMessage = `\n[Chat: ${chatName}|${chatId}]\n[With: ${memberStr}]\n[${myName}] ${_qMark}${text}`;

            const sentMsg = {
                type: 'msg',
                isMe: true,
                content: text,
                sender: myName,
                senderName: myName,
                timestamp: Date.now(),
                raw: fullProtocolMessage,
                quoteName: _q ? _q.name : '',
                quoteText: _q ? _q.text : ''
            };
            // 🚫 對方把主角刪了：字打得出去、傳不到。照真的微信在後面補一句「被對方拒收」，
            //    這幾則標起來（sentWhileBlocked），組上下文時不給對方看——他本來就沒收到。
            if (currentChat.wxBlocked) sentMsg.sentWhileBlocked = true;
            currentChat.messages.push(sentMsg);
            _appendBubble(sentMsg, currentChat);
            if (currentChat.wxBlocked) {
                const _rej = { type: 'system', isMe: false, content: '消息已發出，但被對方拒收了。', timestamp: Date.now(), _blockedNotice: true };
                currentChat.messages.push(_rej);
                _appendBubble(_rej, currentChat);
            }
            _replyTo = null; _renderReplyingBar();
            if(inputEl) { inputEl.value=''; this.onInputCheck(inputEl); }

            const configStr = localStorage.getItem('wx_phone_api_config');
            if (configStr) {
                const conf = JSON.parse(configStr);
                if (conf.directMode && win.WX_DB && typeof win.WX_DB.saveApiChat === 'function') { await win.WX_DB.saveApiChat(GLOBAL_ACTIVE_ID, currentChat); }
            } else if (window.TavernHelper) {
                await window.TavernHelper.createChatMessages([{ role:'user', message: fullProtocolMessage }]);
            }
        },

        // --- 發送表情包 ---
        sendSticker: async function(name, url) {
            if (!GLOBAL_ACTIVE_ID) return;
            // 關閉面板
            const panel = APP_CONTAINER.querySelector('.wx-sticker-panel');
            const scroll = _getScrollEl();
            if (panel) panel.classList.remove('open');
            if (scroll) scroll.style.paddingBottom = '70px';
            // AI 看到名字，畫面顯示圖（processModules 從庫查 URL）
            await this.sendMsg(null, `[表情包:${name}]`);
        },

        // --- 觸發 AI 回覆 (含氣泡流) ---
        triggerReply: async function() {
            if(!GLOBAL_ACTIVE_ID || !GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) return;
            if(IS_STREAMING_REPLY) return; // 鎖定
            // 🚫 對方把主角刪了 → 他收不到、也不會回。等劇情裡重新加回好友才恢復
            if (GLOBAL_CHATS[GLOBAL_ACTIVE_ID].wxBlocked) {
                const _n = GLOBAL_CHATS[GLOBAL_ACTIVE_ID].name || '對方';
                AUI.toast(_n + '把你刪了，訊息傳不過去');
                return;
            }
            IS_STREAMING_REPLY = true;

            const currentChat = GLOBAL_CHATS[GLOBAL_ACTIVE_ID];
            
            // 1. 顯示「對方正在輸入...」的臨時佔位符
            const loadingMsg = {type:'msg', isMe:false, content:'...', sender: currentChat.name, isLoading: true};
            currentChat.messages.push(loadingMsg);
            _appendBubble(loadingMsg, currentChat);

            const configStr = localStorage.getItem('wx_phone_api_config');
            let isApiMode = false; let apiConfig = {};
            if (configStr) { apiConfig = JSON.parse(configStr); isApiMode = apiConfig.directMode; }

            // 定義完成回調
            const onFinishReply = async (finalText) => {
                // 移除 Loading 佔位符（data）
                const loadingMsgIndex = currentChat.messages.findIndex(m => !m.isMe && m.isLoading);
                if (loadingMsgIndex !== -1) { currentChat.messages.splice(loadingMsgIndex, 1); }
                // 重建訊息區（可靠清除 loading，不碰背景層不閃爍）
                _rebuildRoomContent(currentChat);

                // 解析成多個訊息包 (Array)
                const newMsgs = parseAndProcess(finalText);
                
                // 如果解析失敗（空訊息），做保底處理
                if (newMsgs.length === 0 && finalText) {
                    const chatName = currentChat.name; const chatId = currentChat.id;
                    const memberNames = convertMemberIdsToNames(currentChat.members || []);
                    const memberStr = memberNames.length > 0 ? memberNames.join(', ') : chatName;
                    const rawPayload = `\n[Chat: ${chatName}|${chatId}]\n[With: ${memberStr}]\n[${chatName}] ${finalText}`;
                    newMsgs.push({ 
                        type:'msg', 
                        isMe:false, 
                        content: finalText, 
                        sender: chatName, 
                        senderName: chatName, // 🔥 這裡也補上快照
                        raw: rawPayload 
                    });
                }

                // 🔥 啟動氣泡流 (逐條顯示)
                await this.simulateTypingStream(newMsgs, currentChat);

                IS_STREAMING_REPLY = false; // 解鎖
                if (win.WX_DB && typeof win.WX_DB.saveApiChat === 'function') { await win.WX_DB.saveApiChat(GLOBAL_ACTIVE_ID, currentChat); }
            };

            console.log('[WX] triggerReply: isApiMode=' + isApiMode + ', WX_API=' + (!!win.WX_API));
            if (isApiMode && win.WX_API) {
                // 設定：以主模型完整設定當底（含 useSystemApi/stProfileId/url/key，跟創作室 callAI 同源），wx 自己的覆蓋其上
                // 分流：手機聊天要用哪個模型由設置決定（沒設就是主模型，跟以前一樣）
                try { const _S = win.OS_SETTINGS; if (_S) { const _b = _S.getConfigFor ? _S.getConfigFor('phone_chat') : (_S.getConfig && _S.getConfig()); if (_b) apiConfig = Object.assign({}, _b, apiConfig); } } catch (e) {}
                // 保險：仍缺 url/key 且非 useSystemApi → 從 os_global_config 補
                if (!apiConfig.useSystemApi && (!apiConfig.url || !apiConfig.key)) {
                    try {
                        const mainCfg = JSON.parse(localStorage.getItem('os_global_config') || '{}');
                        if (mainCfg.url) apiConfig.url = mainCfg.url;
                        if (mainCfg.key) apiConfig.key = mainCfg.key;
                        if (!apiConfig.model && mainCfg.model) apiConfig.model = mainCfg.model;
                        if (!apiConfig.maxTokens && mainCfg.maxTokens) apiConfig.maxTokens = mainCfg.maxTokens;
                    } catch(e) {}
                }
                // 🔗 這間開了「打開我傳的連結」→ 先把她傳的網址讀好（讀不到也不擋送出）
                try {
                    await Promise.race([_prepareLinks(currentChat), new Promise(r => setTimeout(r, LINK_TIMEOUT + 1000))]);
                } catch (e) { console.warn('[WX] 讀連結失敗（不影響送出）:', e); }
                // buildContext 加逾時 + 失敗用精簡上下文續跑（不讓它卡住/丟錯就整個不回又鎖死）
                let messages;
                try {
                    console.log('[WX] buildContext 開始…');
                    messages = await Promise.race([
                        win.WX_API.buildContext(null),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('buildContext 逾時(12s)')), 12000))
                    ]);
                    if (!Array.isArray(messages) || !messages.length) throw new Error('buildContext 回空');
                    console.log('[WX] buildContext 完成, messages=' + messages.length);
                } catch (be) {
                    console.warn('[WX] buildContext 失敗/逾時 → 用精簡上下文續跑:', (be && be.message) || be);
                    messages = [{ role: 'system', content: 'You are ' + (currentChat.name || 'AI') + '，正在用微信跟對方聊天，延續下面對話、用聊天口語回覆。' }];
                    (currentChat.messages || []).filter(m => m && (!m.type || m.type === 'msg') && !m.isLoading && m.content)
                        .slice(-15).forEach(m => messages.push({ role: m.isMe ? 'user' : 'assistant', content: String(m.raw || m.content) }));
                }
                // 🧾 把「還沒處理完的紅包／禮物／轉帳」列給模型看（見 _pendingBrief）。
                //    組裝失敗絕不能擋住送出——這只是幫模型指得更準，不是必要條件。
                try {
                    const _brief = _pendingBrief(GLOBAL_ACTIVE_ID);
                    if (_brief) {
                        messages.push({ role: 'system', content: _brief });
                        console.log('[WX] 附上待處理清單');
                    }
                } catch (e) { console.warn('[WX] 待處理清單組裝失敗（不影響送出）', e); }
                try {
                    const _me = _meName();
                    const _links = _linkBrief(currentChat, _me);
                    if (_links) { messages.push({ role: 'system', content: _links }); console.log('[WX] 附上連結內容'); }
                } catch (e) { console.warn('[WX] 連結內容組裝失敗（不影響送出）', e); }
                // 😺 這支手機裡有哪些表情包（只有被指定給角色用的那一包，見 WX_STICKER.aiPromptBlock）
                try {
                    const _stk = WX_STICKER.aiPromptBlock();
                    if (_stk) { messages.push({ role: 'system', content: _stk }); console.log('[WX] 附上表情包清單'); }
                } catch (e) { console.warn('[WX] 表情包清單組裝失敗（不影響送出）', e); }
                // 📷 她從相簿傳、它還沒看過的照片 → 這一輪夾進去（看完它會寫描述回來，之後只送文字）
                try {
                    const _ph = await _photoOnceMessage(currentChat);
                    if (_ph) { messages.push(_ph); console.log('[WX] 這輪夾了 ' + _photoBatch.msgs.length + ' 張照片給它看'); }
                } catch (e) { console.warn('[WX] 照片夾帶失敗（不影響送出）:', e); }
                // 👁 換了頭像但它還沒看過 → 這一輪夾一張進去。看完它會寫一句描述回來，
                //    之後每輪只送那句文字，圖再也不送——不然圖留在歷史裡會越積越重。
                try {
                    const _avSee = win.WX_AVATAR_AI;
                    if (_avSee && _avSee.seeOnceMessage) {
                        const _seeMsg = await _avSee.seeOnceMessage(GLOBAL_ACTIVE_ID);
                        if (_seeMsg) { messages.push(_seeMsg); console.log('[WX] 這輪夾了頭像給它看'); }
                    }
                } catch (e) { console.warn('[WX] 頭像夾帶失敗（不影響送出）:', e); }

                console.log('[WX] 呼叫 OS_API.chat…');
                try {
                    await win.WX_API.chat(messages, apiConfig,
                        (chunk) => { /* 不做實時顯示，避免頻閃 */ },
                        onFinishReply,
                        (error) => {
                            const idx = currentChat.messages.findIndex(m => m.isLoading);
                            if (idx !== -1) currentChat.messages.splice(idx, 1);
                            const errMsg = { type:'msg', isMe:false, content:`AI 回應失敗：${error?.message || '未知錯誤'}`, sender: currentChat.name, senderName: currentChat.name };
                            currentChat.messages.push(errMsg);
                            IS_STREAMING_REPLY = false;
                            _rebuildRoomContent(currentChat);
                            console.error('[WX] API 錯誤:', error);
                        },
                        {
                            task: 'phone_chat',   // 控制台的記錄頁靠它顯示是哪件事（沒帶就是一整排「沒標」）
                            disableTyping: apiConfig.disableTyping !== false,
                            // 📡 開了「回覆交給伺服器跑」就把這一輪丟給伺服器：手機可以切出去、鎖屏，
                            //    好了推一則通知，回來時 OS_RELAY 把結果收回來走 _applyRelayReply。
                            relayJob: {
                                app: 'wx', chatId: GLOBAL_ACTIVE_ID, title: currentChat.name || '',
                                notify: { title: currentChat.name || '微信', body: '回你訊息了', url: './', tag: 'wx-' + GLOBAL_ACTIVE_ID }
                            },
                            onQueued: (jid) => {
                                currentChat._relayJob = jid;
                                IS_STREAMING_REPLY = false;   // 交出去了就解鎖，不然她切回來還是卡著
                                try { if (win.WX_DB && win.WX_DB.saveApiChat) win.WX_DB.saveApiChat(GLOBAL_ACTIVE_ID, currentChat); } catch (e) {}
                                try { AUI.toast('交給伺服器跑了，好了會通知你'); } catch (e) {}
                            }
                        }
                    );
                } catch (ce) {
                    console.error('[WX] OS_API.chat 例外:', ce);
                    const idx = currentChat.messages.findIndex(m => m.isLoading);
                    if (idx !== -1) currentChat.messages.splice(idx, 1);
                    currentChat.messages.push({ type:'msg', isMe:false, content:'引擎例外：' + ((ce && ce.message) || ce), sender: currentChat.name, senderName: currentChat.name });
                    IS_STREAMING_REPLY = false;
                    _rebuildRoomContent(currentChat);
                }
            } else if (window.TavernHelper) {
                console.warn('[WX] 走酒館轉發路徑（isApiMode=' + isApiMode + ' / WX_API=' + (!!win.WX_API) + '）→ 沒走 OS API');
                const loadingMsgIndex = currentChat.messages.findIndex(m => !m.isMe && m.isLoading);
                if (loadingMsgIndex !== -1) { currentChat.messages.splice(loadingMsgIndex, 1); }
                this.render(); 
                IS_STREAMING_REPLY = false;
                setTimeout(() => {
                   const sendBtn = doc.querySelector('#send_but');
                   if (sendBtn) { sendBtn.click(); } else { window.TavernHelper.generate({}); }
                }, 100);
            }
        },

        // --- 模擬打字氣泡流 ---
        simulateTypingStream: async function(msgArray, chatObj) {
            for (let i = 0; i < msgArray.length; i++) {
                const msg = msgArray[i];

                // 1. 非第一條且非系統消息 → 先顯示「對方正在輸入...」
                if (i > 0 && msg.type !== 'system') {
                    const tempLoading = {type:'msg', isMe:false, content:'...', sender: msg.sender || chatObj.name, isLoading: true};
                    chatObj.messages.push(tempLoading);
                    _appendBubble(tempLoading, chatObj);

                    const waitTime = Math.min(2500, Math.max(800, (msg.content || "").length * 50));
                    await new Promise(r => setTimeout(r, waitTime));

                    // 移除 loading 泡泡（data + DOM）
                    chatObj.messages.pop();
                    _removeLoadingBubble();
                }

                // 2. 推入真實訊息並直接 append
                chatObj.messages.push(msg);
                _appendBubble(msg, chatObj);

                // 3. 轉帳卡片需要延遲全量刷新（更新轉帳狀態）
                if (msg.type === 'system' && msg.content && msg.content.includes('轉帳')) {
                    setTimeout(() => { this.render(); }, 300);
                }
            }
        },

        // --- 微博轉發接口 ---
        shareFromWeibo: async function(chatId, post) {
            if (!chatId || !post) return false;

            // 確保 chat 存在
            if (!GLOBAL_CHATS[chatId]) {
                const contact = win.OS_CONTACTS ? win.OS_CONTACTS.getById(chatId) : null;
                const chatName = contact ? (contact.wx?.nickname || contact.realName) : chatId;
                GLOBAL_CHATS[chatId] = {
                    id: chatId,
                    name: chatName,
                    members: [chatId],
                    messages: [],
                    lastTime: '',
                    unread: false,
                    pushedCount: 0,
                    renderedCount: 0
                };
            }

            const myName = _meName();

            // 格式：[WbShare: 作者|內容]
            const contentPreview = (post.content || '').replace(/\n/g, ' ').substring(0, 80);
            const shareContent = `[WbShare: ${post.user}|${contentPreview}]`;

            GLOBAL_CHATS[chatId].messages.push({
                type: 'msg',
                isMe: true,
                content: shareContent,
                sender: myName,
                senderName: myName,
                timestamp: Date.now()
            });
            GLOBAL_CHATS[chatId].lastTime = '剛剛';
            GLOBAL_CHATS[chatId].lastPreview = `[微博] @${post.user}`;

            if (win.WX_DB && typeof win.WX_DB.saveApiChat === 'function') {
                await win.WX_DB.saveApiChat(chatId, GLOBAL_CHATS[chatId]);
            }
            return true;
        },

        installToPhone: function() {
            if (win.PhoneSystem) {
                win.PhoneSystem.install('微信', '💬', '#07c160', async (container) => {
                    APP_CONTAINER = container;
                    _bindPanelDismiss(container);
                    console.log('[Core] 微信面板已打開');
                    try {
                        // 🔒 chatId 隔離：只載入「當前劇情卡」自己的聯絡人（按 tavernChatId 章濾，與注入器同款）→
                        //    治「古代卡開 wx 卻列出現代卡聯絡清單」。沒這方法的舊版退回全載。
                        if (win.WX_DB && (win.WX_DB.getApiChatsForCurrentCard || win.WX_DB.getAllApiChats)) {
                            const savedChats = win.WX_DB.getApiChatsForCurrentCard
                                ? await win.WX_DB.getApiChatsForCurrentCard()
                                : await win.WX_DB.getAllApiChats();
                            // GLOBAL_CHATS 整頁只宣告一次、切卡不重設 → 先清掉「明確屬於別張卡」的殘留，再併入當前卡的
                            //（沒蓋章的＝本卡新建/橋接遺留，保留）
                            const cid = win.WX_DB.getCurrentCardId ? win.WX_DB.getCurrentCardId() : null;
                            if (cid != null) {
                                for (const k in GLOBAL_CHATS) {
                                    const tag = GLOBAL_CHATS[k] ? GLOBAL_CHATS[k].tavernChatId : null;
                                    if (tag != null && tag !== cid) delete GLOBAL_CHATS[k];
                                }
                                if (GLOBAL_ACTIVE_ID && !GLOBAL_CHATS[GLOBAL_ACTIVE_ID]) GLOBAL_ACTIVE_ID = null; // 修正懸空 active id
                            }
                            if (savedChats && Object.keys(savedChats).length > 0) {
                                // 📞 純通話記錄(每句都帶 _viaCall＝VN 劇情來電寫的統一記憶)是電話 app 的資料，
                                //    不進微信聊天列表；之後真的用微信聊過(出現非通話訊息)才會浮上來。
                                //    電話 app / 微信真聊天的寫回不帶 _viaCall → 照常顯示，共用記憶不受影響。
                                for (const k in savedChats) {
                                    const _ms = (savedChats[k] && Array.isArray(savedChats[k].messages)) ? savedChats[k].messages : [];
                                    const _callOnly = _ms.length > 0 && _ms.every(function (m) { return m && m._viaCall; });
                                    if (!_callOnly) GLOBAL_CHATS[k] = savedChats[k];
                                }
                            }
                        }
                    } catch (e) { console.error(e); }
                    // 🔧 橋接已退役（e57f923）：wx 一律 directMode、資料只走自己的 api_chats。
                    //    這裡不再戳 WX_TAVERN_API_BRIDGE.poll() 去掃酒館正文 —— 它認的是早已淘汰的
                    //    [wx_os] 格式（現在酒館手機聊天是 <chat chatroom>），掃不到只會印出騙人的
                    //    「已清空面板」log（其實什麼都沒清）。橋接程式碼保留休眠、可逆。
                    // 📖 跑團同步：開面板先把正文裡的聊天室收進來再畫（PWA 沒有酒館事件，就靠這一下）
                    try { await _storySyncNow(); } catch (e) {}
                    win.wxApp.render();
                });
            } else { setTimeout(win.wxApp.installToPhone, 500); }
        }
    };
    // === WX_STICKER：表情包庫管理（與 VN 共用 os_sticker_libs）===
    const WX_STICKER = {
        // lib: { id, name, baseUrl, stickers:[{name, file}] }
        _libs: [], _currentLib: null,

        init() {
            try { this._libs = JSON.parse(localStorage.getItem('os_sticker_libs') || '[]'); } catch(e) { this._libs = []; }
            this._currentLib = this._libs[0]?.id || null;
        },
        _save() { localStorage.setItem('os_sticker_libs', JSON.stringify(this._libs)); },

        // 🚨 表情包不能整批倒給 AI：載十幾包就是幾百個名字，每一輪都在燒字數。
        //    所以「AI 可以用的」一次只有一包（在表情包設定裡挑），只送那一包的名字，上限 AI_MAX 個。
        //    她想換口味就換那個選擇，不用刪庫再匯入。
        AI_MAX: 40,
        aiLibId() { try { return localStorage.getItem('os_sticker_ai_lib') || ''; } catch (e) { return ''; } },
        setAiLib(id) {
            try { localStorage.setItem('os_sticker_ai_lib', id || ''); } catch (e) {}
            this.renderManage();
            try { AUI.toast(id ? ('AI 之後只會用「' + ((this._libs.find(l => l.id === id) || {}).name || '') + '」裡的表情') : 'AI 不會再發表情包'); } catch (e) {}
        },
        // 劇情正文裡的手機用哪一包：一個故事一個選擇（在劇情手機「···」→ 表情包 挑）。
        //   跟上面 aiLibId（微信 app 裡直接聊天用的）分開存——奇幻、古風那種故事沒有手機，
        //   她不會去挑＝這個故事什麼都不送；現代故事挑了才送。
        storyLibKey() {
            let cid = '';
            try { cid = (win.OS_DB && win.OS_DB.currentChatId) ? String(win.OS_DB.currentChatId() || '') : ''; } catch (e) {}
            return cid ? ('vn_sticker_ai_lib__' + cid) : '';
        },
        storyLibId() { const k = this.storyLibKey(); if (!k) return ''; try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
        setStoryLib(id) {
            const k = this.storyLibKey(); if (!k) return;
            try { if (id) localStorage.setItem(k, id); else localStorage.removeItem(k); } catch (e) {}
        },
        // 給模型看的那段：只有名字，沒有網址（它寫 [表情包: 名字]，畫面自己去查圖）。
        //   沒給 libId 就用微信那個選擇；正文那邊傳 storyLibId()。
        aiPromptBlock(libId) {
            const id = (libId === undefined) ? this.aiLibId() : libId;
            if (!id) return '';
            if (!this._libs.length) { try { this._libs = JSON.parse(localStorage.getItem('os_sticker_libs') || '[]'); } catch (e) {} }
            const lib = this._libs.find(l => l.id === id);
            if (!lib || !lib.stickers || !lib.stickers.length) return '';
            const names = lib.stickers.slice(0, this.AI_MAX).map(s => s.name).filter(Boolean);
            if (!names.length) return '';
            return '【手機裡有的表情包】想發表情的時候寫 [表情包: 名字]，名字只能從下面這些裡挑，沒有合適的就別發：\n' + names.join('、');
        },
        _resolveUrl(lib, file) {
            if (!file) return '';
            if (/^https?:\/\//i.test(file)) return file;
            return (lib.baseUrl || '').replace(/\/?$/, '/') + file;
        },
        _parseText(text) {
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            let libName = '表情包'; const stickers = [];
            lines.forEach((line, i) => {
                if (i === 0 && line.startsWith('library:')) { libName = line.slice(8).trim(); return; }
                const sep = line.indexOf(':');
                if (sep > 0) { const name = line.slice(0, sep).trim(); const file = line.slice(sep+1).trim(); if (name && file) stickers.push({name, file}); }
            });
            return { name: libName, stickers };
        },
        lookup(name) {
            const key = name.replace(/\.(gif|jpg|jpeg|png)$/i, '').toLowerCase();
            for (const lib of this._libs) {
                for (const s of lib.stickers)
                    if (s.name.toLowerCase() === key || s.file.replace(/\.(gif|jpg|jpeg|png)$/i,'').toLowerCase() === key)
                        return this._resolveUrl(lib, s.file);
                if (lib.baseUrl && name.match(/\.(gif|jpg|jpeg|png)$/i))
                    return this._resolveUrl(lib, name);
            }
            return null;
        },
        importFromFile(inputEl) {
            const file = inputEl.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = this._parseText(e.target.result);
                const baseInput = document.getElementById('wxStickerBaseUrl');
                const baseUrl = (baseInput?.value || '').trim();
                const existing = this._libs.find(l => l.name === data.name);
                if (existing) {
                    existing.stickers = data.stickers;
                    if (baseUrl) existing.baseUrl = baseUrl.replace(/\/?$/, '/');
                    this._currentLib = existing.id;
                } else {
                    const id = 'stk_' + Date.now();
                    this._libs.push({ id, name: data.name, baseUrl: baseUrl ? baseUrl.replace(/\/?$/, '/') : '', stickers: data.stickers });
                    this._currentLib = id;
                }
                this._save(); this.renderTabs(); this.renderGrid(this._currentLib); this.renderManage();
                if (baseInput) baseInput.value = '';
            };
            reader.readAsText(file, 'utf-8'); inputEl.value = '';
        },
        deleteLib(id) {
            this._libs = this._libs.filter(l => l.id !== id);
            if (this._currentLib === id) this._currentLib = this._libs[0]?.id || null;
            this._save(); this.renderTabs(); this.renderGrid(this._currentLib); this.renderManage();
        },
        switchLib(id) { this._currentLib = id; this.renderTabs(); this.renderGrid(id); },
        renderTabs() {
            const el = document.getElementById('wxStickerTabs'); if (!el) return;
            el.innerHTML = this._libs.map(lib =>
                `<button class="wx-stk-tab${lib.id === this._currentLib ? ' active' : ''}" onclick="(window.parent||window).WX_STICKER.switchLib('${lib.id}')">${lib.name}</button>`
            ).join('');
        },
        renderGrid(id) {
            const lib = id ? this._libs.find(l => l.id === id) : null;
            const grid = document.getElementById('wxStickerGrid'); if (!grid) return;
            if (!lib || !lib.stickers.length) { grid.innerHTML = `<div class="wx-stk-empty">尚無表情包，點 <i class="fa-solid fa-gear"></i> 匯入 TXT</div>`; return; }
            grid.innerHTML = lib.stickers.map(s => {
                const url = this._resolveUrl(lib, s.file).replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c));
                const safe = url.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                const nameSafe = s.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                return `<div class="wx-stk-item" title="${s.name}" onclick="(window.parent||window).WX_STICKER.pickSticker('${nameSafe}','${safe}')"><img src="${url}" alt="${s.name}" loading="lazy" onerror="this.outerHTML='<span class=\\'wx-stk-fallback\\'>${s.name}</span>'"></div>`;
            }).join('');
        },
        renderManage() {
            const el = document.getElementById('wxStickerManage'); if (!el) return;
            const _ai = this.aiLibId();
            el.innerHTML = this._libs.length
                ? this._libs.map(lib => `<div class="wx-stk-lib-row"><span class="wx-stk-lib-name">${lib.name}</span><span class="wx-stk-lib-count">${lib.stickers.length}張</span>` +
                    `<button class="wx-stk-ai${lib.id === _ai ? ' on' : ''}" onclick="(window.parent||window).WX_STICKER.setAiLib('${lib.id === _ai ? '' : lib.id}')">${lib.id === _ai ? '角色在用這包' : '給角色用'}</button>` +
                    `<button class="wx-stk-lib-del" onclick="(window.parent||window).WX_STICKER.deleteLib('${lib.id}')">✕</button></div>`).join('')
                : '<div class="wx-stk-empty">尚無庫</div>';
        },
        pickSticker(name, url) {
            if (win.wxApp && typeof win.wxApp.sendSticker === 'function') win.wxApp.sendSticker(name, url);
        }
    };
    WX_STICKER.init();
    // 💰 錢包：先把餘額載進快取。發紅包那條路是同步問 getBalance()（「發之前看夠不夠」等不了 await），
    //    沒先載就永遠讀到 0、每次都說餘額不足。
    try { if (win.WX_WALLET && win.WX_WALLET.init) win.WX_WALLET.init(); } catch (e) {}
    win.WX_STICKER = WX_STICKER;

    // 🔧 退役酒館橋接：記憶已改走 prompt 注入(os_app_memory_inject，唯讀、不寫進酒館正文)，
    //    不再用「把 [wx_os] 塞進酒館聊天」那套。→ wx 一律 directMode（自己 api_chats + OS_API），
    //    啟動時強制設好，永不啟動橋接掃描、不再轉發酒館。(橋接程式碼保留休眠、可逆)
    try {
        const _wxk = 'wx_phone_api_config';
        const _wxc = JSON.parse(localStorage.getItem(_wxk) || '{}');
        if (_wxc.directMode !== true) { _wxc.directMode = true; localStorage.setItem(_wxk, JSON.stringify(_wxc)); }
    } catch (e) {}

    win.wxApp.installToPhone();

    // 📖 跑團同步的事件掛鉤（酒館才有；PWA 靠開面板那一下）
    (function _hookStorySync() {
        let tries = 0;
        const tick = function () {
            if (typeof win.eventOn === 'function' && win.tavern_events) {
                const ev = win.tavern_events;
                const resync = function () { _storySyncDebounced(1200); };
                ['MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_UPDATED'].forEach(function (k) { if (ev[k]) win.eventOn(ev[k], resync); });
                if (ev.CHAT_CHANGED) win.eventOn(ev.CHAT_CHANGED, function () { _storyLastFloor = -1; _storyStat = { rooms: 0, contacts: 0, floor: -1, at: 0 }; _storySyncDebounced(800); });
                if (ev.GENERATION_STARTED) win.eventOn(ev.GENERATION_STARTED, function (type, opts, dryRun) { if (dryRun) return; _storyStampNatives(); });
                _storySyncDebounced(2000);
                return;
            }
            if (++tries < 40) setTimeout(tick, 500);
        };
        tick();
    })();

    setTimeout(() => {
        const configStr = localStorage.getItem('wx_phone_api_config');
        let isApiMode = false;
        if (configStr) { isApiMode = JSON.parse(configStr).directMode; }
        if (isApiMode) { console.log('✅ [Core] 檢測到 API 模式：已強制阻斷 DOM 掃描'); return; }
        if (win.WX_TAVERN_API_BRIDGE) { win.WX_TAVERN_API_BRIDGE.onMessage(handleNewMessages); win.WX_TAVERN_API_BRIDGE.setPollingInterval(500); win.WX_TAVERN_API_BRIDGE.start(); } 
        else { setInterval(scanAndRender_DEPRECATED, 1500); }
    }, 1000);
})();