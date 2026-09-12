// ----------------------------------------------------------------
// [檔案 2] wx_view.js (V108.6 - Contact List DB Fix)
// 功能：視圖渲染。
// 🚨 維修報告 (V108.6)：
// 1. [修復] 通訊錄 (Contacts Tab) 無法顯示自定義頭像的問題。
//    - 同步了 Chat List 的邏輯，讓通訊錄也能識別 'img_' 或 'avt_' 開頭的 DB ID。
// 2. [完整性] 確保聊天列表、通訊錄、對話氣泡都能正確從 IndexedDB 讀取圖片。
// ----------------------------------------------------------------
(function() {
    const win = window.parent || window;   // 模組層級的 win：processModules 等沒自己宣告的地方用（之前圖片訊息那行裸用 win → 房裡一有圖就打不開）

    // 訊息裡「自帶造型」的區塊標籤。切區塊（blockRegex）與泡泡讓位（bubbleStyle）共用這一份。
    // 🚨兩邊各寫各的就會漂移：實測讓位那份漏了繁體「圖片」跟「視頻」，於是繁體寫的圖片卡
    //   外面套了一層泡泡框——白泡泡時幾乎看不出來，換上深色泡泡主題就很明顯（Rae 實機抓到）。
    //   語音刻意不算在 CARD 裡：微信原生的語音訊息本來就是裝在泡泡裡的，它該吃泡泡樣式。
    // ⚠️只放「字串」不放編譯好的 regex：blockRegex 帶 g 旗標，共用同一個實例會被 lastIndex 咬。
    // 🚨🚨繁簡兩種寫法都要列：模型愛寫哪種是它的事，她的世界觀是繁體所以繁體更常出現。
    //   漏一個字的下場是那則訊息整條變成裸文字（她實測 [視頻: …] 與 [轉賬: …] 就這樣掉在畫面上）。
    //   「轉賬」跟「轉帳」是同一個詞的兩種繁體寫法，兩個都要。
    const MSG_TAG = {
        STICKER: '表情包|Sticker',
        IMAGE: '图片|圖片|照片|Img',
        VOICE: '语音|語音|Voice',
        TRANSFER: '转账|轉帳|轉賬|转賬|Transfer',
        GIFT: '礼品|礼物|禮品|禮物|Gift',
        REDPACKET: '红包|紅包|RedPacket',
        LOCATION: '位置|Location|定位',
        VIDEO: '视频|視頻|影片|Video',
        FILE: '文件|File',
        LINK: '链接|連結|连结|鏈接|网址|網址|網頁|网页|Link|URL|Url',
        PAYCODE: '收款码|收款碼|收款|付款码|付款碼',   // ⚠️「收款」要排在帶「码/碼」的後面
        // 📞 通話記錄。以前微信那顆「通話」送的是 [Voice: 發起通話 - 備註]，於是被畫成一顆語音訊息
        //    （喇叭、音波條、秒數）——看起來像「一則語音」，不是「一通通話」。她說感覺做一半就是這個。
        //    真的能講話的通話在電話 app，微信這顆本來就只是留個記錄，那就讓它長得像記錄。
        CALL: '通话|通話|Call',
        WBSHARE: 'WbShare'
    };
    // 自帶造型、泡泡要讓位的那些（語音刻意不在內：微信原生語音本來就裝在泡泡裡）
    MSG_TAG.CARD = [MSG_TAG.TRANSFER, MSG_TAG.GIFT, MSG_TAG.REDPACKET, MSG_TAG.LOCATION,
        MSG_TAG.VIDEO, MSG_TAG.FILE, MSG_TAG.LINK, MSG_TAG.PAYCODE, MSG_TAG.WBSHARE].join('|');
    MSG_TAG.ALL = [MSG_TAG.STICKER, MSG_TAG.IMAGE, MSG_TAG.CARD, MSG_TAG.VOICE, MSG_TAG.CALL].join('|');

    // 🚨系統訊息的最後一道：畫面上不准出現原始協議格式。
    //   每條 intent 在 wx_core 那邊都已經改講人話了，這裡負責接住三種漏網的：
    //   ①舊資料裡存著協議原文的 ②沒被任何 intent 認出來的 ③模型直接照協議寫的。
    //   她的原話：「不能把格式搞出來，拍給你就是他出現了格式樣式，這就不對」。
    function sysText(raw) {
        let t = String(raw == null ? '' : raw).trim();
        const hadPrefix = /^\[\s*(?:系統|系统|System|Notice)\s*[:：]/i.test(t);
        t = t.replace(/^\[\s*(?:系統|系统|System|Notice)\s*[:：]\s*/i, '').trim();
        if (hadPrefix) t = t.replace(/\]+\s*$/, '').trim();   // 只有剝過前綴才收尾巴，免得誤砍正常內容的 ]
        // Accept/Return ＋ 東西 ＋（可有可無的 |ID）→ 翻成人話。數字當轉帳、文字當禮物。
        const m = t.match(/^(Accept|Return|接收|接收了|收下|收下了|退回|退回了|拒絕|拒绝)\s+(.+?)\s*(?:[|｜]\s*([A-Za-z0-9_]+))?\s*$/i);
        if (m) {
            const isAccept = /^(?:accept|接收了?|收下了?)$/i.test(m[1]);
            const what = m[2].trim();
            if (/^\d+(?:\.\d+)?$/.test(what)) return isAccept ? `對方已接收轉帳 ${what}元` : `對方已退回轉帳 ${what}元`;
            return isAccept ? `對方已收下「${what}」` : `對方已退回「${what}」`;
        }
        // 翻不出來也要把尾巴掛的協議 ID 拿掉，那串英數字對她沒有任何意義
        t = t.replace(/\s*[|｜]\s*(?:ID_)?(?:Gft|Gift|rp|RedPacket|Txn|Tnx|Transfer)[_-]?[A-Za-z0-9_]*\s*$/i, '');
        t = t.replace(/\s*[\(（]\s*(?:ID_)?(?:Gft|Gift|rp|RedPacket|Txn|Tnx|Transfer)[_-]?[A-Za-z0-9_]*\s*[\)）]\s*$/i, '');
        return t.trim();
    }

    // 「[標籤: 內容]」的比對式。捕獲組固定兩個（$1 標籤本身、$2 內容），
    // 各條 replace 的 callback 簽名維持原樣。每次呼叫都給新實例——帶 g 旗標不能共用。
    const tagRe = (tags) => new RegExp('\\[\\s*(' + tags + ')\\s*[:：]?\\s*(.*?)\\s*\\]', 'gi');

    // VN 頭像串接查詢：lorebook → mem cache → VN IndexedDB（最多到第4步，不生成）
    async function _resolveVNAvatar(name) {
        const win = window.parent || window;
        const vn = win.VN_Core;
        if (!vn) return null;

        // 名字變體（處理全名/簡稱）
        const variants = [name, name.split(/[·\s·]/)[0]].filter((v, i, a) => v && a.indexOf(v) === i);

        // 1. Lorebook 頭像
        if (vn._lorebookAvatarCache) {
            for (const v of variants) {
                if (vn._lorebookAvatarCache[v]) return vn._lorebookAvatarCache[v];
            }
        }

        // 2. VN 記憶體快取（已生成的頭像）
        if (vn._avatarMemCache) {
            for (const v of variants) {
                if (vn._avatarMemCache[v]) return vn._avatarMemCache[v];
            }
        }

        // 3. VN IndexedDB 持久快取
        const VN_Cache = win.VN_Cache;
        if (VN_Cache) {
            for (const v of variants) {
                try {
                    const cached = await VN_Cache.get('avatar_cache', v);
                    if (cached?.url && !cached.url.startsWith('blob:')) return cached.url;
                } catch(e) {}
            }
        }

        return null; // 找不到，維持 DiceBear
    }

    window.WX_VIEW = {

        // 媒體標籤清單對外開放：wx_core 判斷「[xxx] 是發話人還是媒體標籤」時要用同一份，
        // 各寫各的就會像這次一樣漂在繁體字上。
        MSG_TAG: MSG_TAG,

        // 「發現」tab：跑團同步狀態。劇情裡的 <chat> 聊天室已直接進聊天列表與通訊錄，這頁只放同步與整理。
        getDiscoverHTML: function() {
            const app = '(window.parent.wxApp || window.wxApp)';
            return ''
              + '<div class="wx-discover" id="wx-discover-page">'
              +   '<div class="wx-vnlog-toolbar">'
              +     '<div class="wx-vnlog-toolbar-t"><i class="fa-solid fa-book-open"></i>跑團同步</div>'
              +     '<div class="wx-vnlog-tools">'
              +       '<button class="wx-vnlog-tool" onclick="' + app + '.storyTidyAi && ' + app + '.storyTidyAi()"><i class="fa-solid fa-wand-magic-sparkles"></i>AI 整理</button>'
              +       '<button class="wx-vnlog-tool" onclick="' + app + '.storyTidyReset && ' + app + '.storyTidyReset()"><i class="fa-solid fa-arrow-rotate-left"></i>還原</button>'
              +       '<button class="wx-vnlog-tool" title="重新同步" onclick="' + app + '.storyResync && ' + app + '.storyResync()"><i class="fa-solid fa-rotate-right"></i></button>'
              +     '</div>'
              +   '</div>'
              +   '<div class="wx-vnlog" id="wx-story-status"></div>'
              + '</div>';
        },

        // 假收款碼：程式畫「QR 樣式」SVG（三角定位框 + 依 seed 隨機黑塊），跑團用、不可掃也不用生圖
        _fakeQrSvg: function(seed) {
            let h = 0; const s = String(seed || 'qr'); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
            const N = 25; let cells = '';
            const fp = (r, c, br, bc) => { const rr = r - br, cc = c - bc; return rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4); };
            for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
                let on;
                if (r < 7 && c < 7) on = fp(r, c, 0, 0);
                else if (r < 7 && c >= N - 7) on = fp(r, c, 0, N - 7);
                else if (r >= N - 7 && c < 7) on = fp(r, c, N - 7, 0);
                else { h = (h * 1103515245 + 12345) & 0x7fffffff; on = (h % 100) > 52; }
                if (on) cells += '<rect x="' + c + '" y="' + r + '" width="1" height="1"/>';
            }
            return '<svg viewBox="0 0 ' + N + ' ' + N + '" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect width="' + N + '" height="' + N + '" fill="#fff"/><g fill="#1a1a1a">' + cells + '</g></svg>';
        },

        // --- 1. 氣泡渲染 (保持 V108.5 邏輯) ---
        // 🚨 把頭像貼上去。以前這段寫死在整頁重建的尾巴、而且掃整份文件，
        //    所以「追加一顆新泡泡」那條路完全沒有人貼——AI 每回一次，新泡泡的頭像就是
        //    預設那張，要整頁重建（例如退出去再進聊天室）才會變回來。她實測就是撞到這個。
        //    抽成一支、兩邊都呼叫；貼過的打一個記號，重掃不會重做也不會漏。
        hydrateAvatars: function (root) {
            const win = window.parent || window;
            if (!win.OS_DB || !root || !root.querySelectorAll) return;
            // 她從相簿傳的照片（圖庫編號）也在這裡貼上：頭像跟照片走同一個時機，追加、重建都不會漏
            try { const PI = win.OS_PHONE_IMAGE || window.OS_PHONE_IMAGE; if (PI && PI.hydrate) PI.hydrate(root); } catch (e) {}
            root.querySelectorAll('.db-load-target:not([data-avt-done])').forEach(async function (el) {
                const id = el.getAttribute('data-db-bg');
                if (!id) return;
                el.setAttribute('data-avt-done', '1');
                try {
                    const url = await win.OS_DB.getImage(id);
                    if (url) el.style.backgroundImage = "url('" + url + "')";
                    else el.removeAttribute('data-avt-done');   // 這次沒拿到，下次還能再試
                } catch (e) { el.removeAttribute('data-avt-done'); }
            });
            root.querySelectorAll('.vn-load-target:not([data-avt-done])').forEach(async function (el) {
                const name = el.getAttribute('data-vn-name');
                if (!name) return;
                el.setAttribute('data-avt-done', '1');
                try {
                    const url = await _resolveVNAvatar(name);
                    if (url) el.style.backgroundImage = "url('" + url + "')";
                    else el.removeAttribute('data-avt-done');
                } catch (e) { el.removeAttribute('data-avt-done'); }
            });
        },

        renderBubble: function(msg, chatObj, withAnim, msgIndex) {
            // 貼圖寫法跟 VN 手機對齊：[貼紙:]/[贴纸:]/[表情:]/[Emote:] 都算表情包；[xxx.gif] 這種只有檔名的也算（跑團正文常這樣寫）
            if (msg && typeof msg.content === 'string' && /\[/.test(msg.content)) {
                const norm = msg.content
                    .replace(/\[\s*(貼紙|贴纸|表情|Emote)\s*[:：]\s*/gi, function () { return '[表情包: '; })
                    .replace(/\[([^\]\[:：]+\.(?:gif|jpg|jpeg|png))\]/gi, function (_, f) { return '[表情包: ' + f + ']'; });
                if (norm !== msg.content) msg = Object.assign({}, msg, { content: norm });
            }
            const blockRegex = new RegExp('(\\[\\s*(?:' + MSG_TAG.ALL + ').*?\\])', 'gi');
            if (msg.content && typeof msg.content === 'string' && blockRegex.test(msg.content)) {
                const pureContent = msg.content.replace(blockRegex, '').trim();
                if (pureContent.length > 0 || msg.content.match(blockRegex).length > 1) {
                    const parts = msg.content.split(blockRegex).filter(p => p && p.trim().length > 0);
                    if (parts.length > 1) {
                        return parts.map((part, pi) => {
                            let subMsg = { ...msg, content: part.trim() };
                            // 一則訊息被媒體標籤切成好幾個泡泡時，引用塊只掛在第一個，不然會重複出現
                            if (pi > 0) { subMsg.quoteName = ''; subMsg.quoteText = ''; }
                            return this.renderBubble(subMsg, chatObj, withAnim, msgIndex);
                        }).join('');
                    }
                }
            }

            const safeChat = chatObj || { name: 'Loading...', id: 'temp', isGroup: false };
            const chatName = safeChat.name || "Unknown";
            const chatId = safeChat.id || chatName; 
            const animClass = withAnim ? 'animate' : '';
            const opacityStyle = withAnim ? 'opacity:0;' : 'opacity:1;'; 
            const dataAttr = (typeof msgIndex === 'number') ? `data-msg-idx="${msgIndex}"` : '';
            

            if (msg.type === 'system') {
                let displayContent = msg.content || '';
                // 處理紅包領取系統消息：[系統: XXX領取了紅包 金額元|ID]，隱藏ID部分
                // 匹配格式：[系統: ...領取了紅包 ...元|ID] 或 "XXX"領取了紅包XX元|rp_ID
                if (displayContent.match(/領取.*?紅包.*?[|｜]/i)) {
                    // 先去掉 [系統: 和 ]（如果存在）
                    displayContent = displayContent.replace(/^\[\s*(系統|系统|System)\s*[:：]\s*/i, '').replace(/\s*\]$/, '');
                    // 移除 |ID 部分（匹配 |rp_xxx 或 |ID 格式，直到行尾或]）
                    displayContent = displayContent.replace(/\s*[|｜][a-zA-Z0-9_]+(\s*\]?)?\s*$/, '');
                }
                // 處理轉帳系統消息：Accept/Return 金額|ID 格式
                else if (displayContent.match(/^(Accept|Return|接收|退回)\s+(\d+(?:\.\d+)?)\s*[|｜]/i)) {
                    const transferMatch = displayContent.match(/^(Accept|Return|接收|退回)\s+(\d+(?:\.\d+)?)\s*[|｜](.+)$/i);
                    if (transferMatch) {
                        const action = transferMatch[1].trim().toLowerCase();
                        const amount = transferMatch[2].trim();
                        const isAccept = action === 'accept' || action === '接收';
                        displayContent = isAccept ? `對方已接收轉帳 ${amount}元` : `對方已拒絕轉帳 ${amount}元`;
                    }
                }
                return `<div class="wx-system-notice ${animClass}" style="${opacityStyle}" ${dataAttr}>${sysText(displayContent)}</div>`;
            }
            if (msg.type === 'time') return `<div class="wx-time-stamp ${animClass}" style="${opacityStyle}" ${dataAttr}>${msg.content}</div>`;
            
            let html = msg.content || "";
            // 處理統一格式的系統消息：[系統: Accept/Return 物品名|ID] 或 [系統: Accept/Return 金額|ID]
            // 🚨舊寫法 /^\[\s*系統|系统|System\s*[:：]\s*(Accept|…)/ 少了括號，三個分支各自獨立：
            //   第一支只要開頭是 [系統 就中，第二支「內容裡任何地方出現系统」就中——正文提到系統兩個字
            //   的普通訊息會被當成系統通知。現在括起來，並且凡是長成 [系統: …] 的都收進來剝掉外框。
            if (!msg.isMe && /^\[\s*(?:系統|系统|System|Notice)\s*[:：]/i.test(html)) {
                let display = html.replace(/^\[\s*(系統|系统|System)\s*[:：]\s*/i, '').replace(/\]$/, '');
                const actionMatch = display.match(/^(Accept|Return|接收|退回)\s+(.+?)\s*[|｜](.+)$/i);
                if (actionMatch) {
                    const action = actionMatch[1].trim().toLowerCase();
                    const item = actionMatch[2].trim();
                    let id = actionMatch[3].trim();
                    // 移除末尾可能存在的 ] 字符
                    id = id.replace(/\]+\s*$/, '').trim();
                    const isAccept = action === 'accept' || action === '接收';
                    // 判斷是轉帳還是禮物（轉帳通常是數字，禮物是文字）
                    if (item.match(/^\d+(?:\.\d+)?$/)) {
                        // 轉帳
                        display = isAccept ? `對方已接收轉帳 ${item}元` : `對方已拒絕轉帳 ${item}元`;
                    } else {
                        // 禮物
                        display = isAccept ? `對方已接收 ${item}` : `對方已拒絕 ${item}`;
                    }
                }
                return `<div class="wx-system-notice ${animClass}" style="${opacityStyle}" ${dataAttr}>${sysText(display)}</div>`;
            }

            html = this.processModules(html, String(chatId), msg.isMe, msgIndex);
            
            let avatarSeed = chatName; 
            let avatarUrl = "";
            let avatarStyle = "";
            let dbDataAttr = ""; 

            if (msg.isMe) {
                avatarUrl = safeChat.userAvatar; 
                if (!avatarUrl) avatarSeed = 'MySelf';
            }
            else {
                if (safeChat.isGroup && msg.sender) avatarSeed = msg.sender;
                avatarUrl = safeChat.customAvatar;
            }
            if (!avatarSeed) avatarSeed = "User";

            let defaultUrl = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(avatarSeed)}&backgroundColor=${msg.isMe?'c0ebd7':'e6e6e6'}`;
            avatarStyle = `background-image: url('${defaultUrl}')`;

            if (avatarUrl) {
                // 支援 img_ (Settings) 和 avt_ (Contacts) 兩種前綴
                if (avatarUrl.startsWith('img_') || avatarUrl.startsWith('avt_')) {
                    avatarStyle = `background-image: url('${defaultUrl}');`;
                    dbDataAttr = `data-db-bg="${avatarUrl}" class="wx-bubble-avatar db-load-target"`;
                } else {
                    avatarStyle = `background-image: url('${avatarUrl}')`;
                    dbDataAttr = `class="wx-bubble-avatar"`;
                }
            } else {
                // 沒有自定義頭像 → 嘗試從 VN 串接獲取
                const vnName = msg.isMe ? '' : (safeChat.isGroup && msg.sender ? msg.sender : safeChat.realName || '');
                if (vnName) {
                    dbDataAttr = `data-vn-name="${vnName}" class="wx-bubble-avatar vn-load-target"`;
                } else {
                    dbDataAttr = `class="wx-bubble-avatar"`;
                }
            }
            
            // 「正在輸入」也是對方的一則訊息，就照對方訊息的樣子畫：頭像＋泡泡＋尖角。
            // 🚨以前是三個灰點直接漂在聊天背景圖上，沒有底、沒有頭像、名字還裸著一行——
            //    她說「灰字、有點裸露、有背景的情況下看不太到」。做成真泡泡就有底了，
            //    而且掛上 .pbub-* 之後會自動吃她設的泡泡主題，跟其他訊息同一套皮。
            //    擺在這裡是因為頭像要等上面那段算完才拿得到。
            if (msg.isLoading) {
                const _tAvatar = /class="/.test(dbDataAttr) ? dbDataAttr.replace('class="', 'class="pbub-avatar ') : `${dbDataAttr} class="pbub-avatar"`;
                const _tWho = (safeChat.isGroup && msg.sender) ? `<div class="wx-group-name">${msg.sender}</div>` : '';
                return `<div class="wx-msg-row you pbub-row pbub-other ${animClass}" style="${opacityStyle}" data-loading="true"><div style="${avatarStyle}" ${_tAvatar}></div><div class="pbub-wrap wx-bubble-wrap">${_tWho}<div class="wx-bubble-content pbub-bubble wx-typing-indicator"><div class="wx-typing-dots-wrap"><span></span><span></span><span></span></div></div></div></div>`;
            }

            const side = msg.isMe ? 'me' : 'you';
            // 🚨清單一律取自 MSG_TAG（見檔案開頭）：這三條以前是各自手打的，漏了繁體字
            //   就會讓自帶造型的卡片外面多一層泡泡框
            const isSpecial = new RegExp('^\\[\\s*(?:' + MSG_TAG.CARD + ')', 'i').test(msg.content);
            const isImageTag = new RegExp('^\\[\\s*(?:' + MSG_TAG.IMAGE + ').*?\\]$', 'i').test(msg.content);
            const isSticker = new RegExp('^\\[\\s*(?:' + MSG_TAG.STICKER + ').*?\\]$', 'i').test(msg.content);
            const bubbleStyle = (isSpecial || isImageTag || isSticker) ? 'padding:0; border:none; background:transparent; box-shadow:none;' : '';
            
            let nameHTML = "";
            if (safeChat.isGroup && !msg.isMe && msg.sender) {
                nameHTML = `<div class="wx-group-name">${msg.sender}</div>`;
            }
            
            // 引用回覆的灰塊：照微信擺在泡泡內、正文下面。解析與 HTML 跟 VN 手機共用 OS_API.chatQuote
            const quoteHTML = (msg.quoteName && msg.quoteText && win.OS_API && win.OS_API.chatQuote)
                ? win.OS_API.chatQuote.html(msg.quoteName, msg.quoteText, 'wx-quote') : '';

            // 泡泡主題的共用 class：這一組（.pbub-row / .pbub-me / .pbub-other / .pbub-avatar / .pbub-bubble）
            // 微信跟 VN 手機都會掛，主題 CSS 只認它們——兩邊原本的 class 一個叫 .me 一個叫 .you 而且意思相反，
            // 沒有這層 AI 不可能寫出一份兩邊都對的 CSS。詳見 wx_bubble_ai.js。
            const sideCls = msg.isMe ? 'pbub-me' : 'pbub-other';
            let avatarAttr = /class="/.test(dbDataAttr) ? dbDataAttr.replace('class="', 'class="pbub-avatar ') : `${dbDataAttr} class="pbub-avatar"`;
            // 👤 點頭像＝看那個人的個人檔案（LINE 那種）。群聊點誰就開誰，自己那顆不開。
            //    stopPropagation：聊天區有「點一下收面板」的處理，不擋住會連帶被吃掉。
            if (!msg.isMe) {
                const _who = String((safeChat.isGroup && msg.sender) ? msg.sender : (safeChat.name || safeChat.id || '')).replace(/'/g, "\\'");
                if (_who) avatarAttr += ` onclick="event.stopPropagation(); const P=(window.parent.WX_PROFILE||window.WX_PROFILE); if(P)P.open('${_who}')"`;
            }
            // 貼圖／圖片／轉帳這些卡片，泡泡本來就被 bubbleStyle 設成透明無邊（卡片自己就是造型），
            // 掛上去只會讓主題把卡片外面又糊一層底 → 只有純文字泡泡才吃主題
            const plainBubble = !(isSpecial || isImageTag || isSticker);
            return `<div class="wx-msg-row ${side} pbub-row ${sideCls} ${animClass}" style="${opacityStyle}" ${dataAttr}><div style="${avatarStyle}" ${avatarAttr}></div><div class="pbub-wrap wx-bubble-wrap">${nameHTML}<div class="wx-bubble-content${plainBubble ? ' pbub-bubble' : ' wx-bubble-bare'}" style="${bubbleStyle}">${html}${quoteHTML}</div></div></div>`;
        },

        generateHash: function(str) { let hash = 0; const safeStr = String(str); for (let i = 0; i < safeStr.length; i++) { const char = safeStr.charCodeAt(i); hash = (hash << 5) - hash + char; hash |= 0; } return "wx_" + Math.abs(hash); },

        // --- 2. 模塊解析 ---
        processModules: function(html, chatId, isMe, msgIndex) {
            // 🚨模型沒給單號時，以前是現場擲一個隨機數（紅包甚至只有三位數）。
            //   每次重畫都會擲出不一樣的，狀態當場跟丟；三位數還會撞到別人的紅包、
            //   直接繼承對方的金額與領取紀錄。改成用「第幾則訊息＋這則裡的第幾張卡」當身分，
            //   重畫幾次都一樣，也不會跟別則撞。
            let _autoN = 0;
            const autoRef = (kind) => 'auto_' + kind + '_' + (msgIndex == null ? 'x' : msgIndex) + '_' + (_autoN++);
            const app = "(window.parent.wxApp || window.wxApp)"; const safeId = String(chatId);
            html = html.replace(tagRe(MSG_TAG.TRANSFER), (match, tag, content) => {
                // 解析新格式：[转账: 价格|指定人物|備註|Tnx_ID]
                // 兼容舊格式：[转账: 价格|備註|Tnx_ID] 或 [转账: 价格|Txn_ID]
                let amount = '0', targetName = '', memo = '', txnId = '';
                const parts = content.split(/[|｜]/).map(s => s.trim()).filter(s => s);
                
                if (parts.length >= 4) {
                    // 新格式：[价格|指定人物|備註|Tnx_ID]
                    amount = parts[0];
                    targetName = parts[1] || '';
                    memo = parts[2] || '';
                    txnId = parts[3];
                } else if (parts.length === 3) {
                    // 兼容舊格式：[价格|備註|Tnx_ID]
                    // 如果第三部分看起來像ID（Txn開頭或純字母數字），則認為是舊格式
                    amount = parts[0];
                    if (parts[2].match(/^(Txn|Tnx)[0-9]+$/i) || parts[2].match(/^[a-zA-Z0-9_]+$/)) {
                        // 舊格式：[价格|備註|Tnx_ID]
                        memo = parts[1] || '';
                        txnId = parts[2];
                    } else {
                        // 可能是其他格式，嘗試解析為新格式（缺少備註）
                        targetName = parts[1] || '';
                        txnId = parts[2];
                    }
                } else if (parts.length === 2) {
                    // 兼容：[价格|備註] 或 [价格|Txn_ID]
                    amount = parts[0];
                    if (parts[1].match(/^(Txn|Tnx)[0-9]+$/i) || parts[1].match(/^[a-zA-Z0-9_]+$/)) {
                        txnId = parts[1];
                    } else {
                        memo = parts[1];
                    }
                } else if (parts.length === 1) {
                    amount = parts[0];
                }
                
                // 如果沒有指定人物，使用聊天對象名稱
                if (!targetName && safeId) {
                    const win = window.parent || window;
                    if (win.wxApp && win.wxApp.GLOBAL_CHATS && win.wxApp.GLOBAL_CHATS[safeId]) {
                        targetName = win.wxApp.GLOBAL_CHATS[safeId].name || safeId;
                    }
                }
                
                // 如果沒有ID，生成一個
                if (!txnId) txnId = autoRef('txn');
                const uniqueId = txnId.startsWith('ID_') ? txnId : ('ID_' + txnId);
                // 狀態走「這個聊天室的帳本」（wx_cards.js），不再拿模型寫的單號當全域鍵。
                // 第一次畫到這張卡時把舊世界那份接過來，所以既有對話不會突然變回未讀。
                const _CARDS = win.WX_CARDS || window.WX_CARDS;
                //   msgIndex 一起帶：同一個單號長在不同則訊息上就是不同張卡（模型很愛重用單號）
                const _card = _CARDS ? _CARDS.adopt(safeId, 'transfer', txnId,
                    { amount: amount, targetName: targetName, memo: memo }, uniqueId, msgIndex) : null;
                const status = _card ? _card.status : localStorage.getItem(uniqueId);
                let bgColor = "#fa9d3b";
                let textColor = "white";
                let borderColor = "white";
                let icon = "¥";
                let title = targetName ? `轉帳給${targetName}` : "轉帳給朋友";
                let sub = memo || "微信轉帳";
                let clickAction = `onclick="${app}.openTransfer('${amount}', '${uniqueId}', this)"`;
                
                if (isMe) {
                    if (status === 'accepted') {
                        bgColor = "#f6e3c8";
                        textColor = "#b8702b";
                        borderColor = "#d99a5e";
                        icon = '<i class="fa-solid fa-check"></i>';
                        title = "已收款";
                        sub = `對方已收款`;
                        clickAction = "";
                    } else if (status === 'returned' || status === 'expired') {
                        bgColor = "#e6e6e6";
                        textColor = "#666";
                        borderColor = "#999";
                        icon = '<i class="fa-solid fa-reply"></i>';
                        title = status === 'expired' ? "已過期" : "已退還";
                        sub = status === 'expired' ? "轉帳已過期" : "對方已退回";
                        clickAction = "";
                    }
                } else {
                    if (status === 'accepted') {
                        bgColor = "#f6e3c8";
                        textColor = "#b8702b";
                        borderColor = "#d99a5e";
                        icon = '<i class="fa-solid fa-check"></i>';
                        title = "已收款";
                        sub = `已存入餘額`;
                        clickAction = "";
                    } else if (status === 'returned') {
                        bgColor = "#e6e6e6";
                        textColor = "#666";
                        borderColor = "#999";
                        icon = '<i class="fa-solid fa-reply"></i>';
                        title = "已退還";
                        sub = "轉帳已退回";
                        clickAction = "";
                    }
                }
                return `<div style="background:${bgColor}; padding:15px; border-radius:4px; color:${textColor}; min-width:210px; display:flex; flex-direction:column; gap:5px; cursor:pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.1);" ${clickAction}><div style="display:flex; align-items:center; gap:10px;"><div style="border:2px solid ${borderColor}; border-radius:50%; width:35px; height:35px; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:16px; flex-shrink:0;">${icon}</div><div style="overflow:hidden;"><div style="font-size:15px; font-weight:500; white-space:nowrap;">${title}</div><div style="font-size:12px; opacity:0.8; white-space:nowrap;">${sub}${(!isMe && !status) ? ' ¥' + amount : ''}</div></div></div></div>`; });
            html = html.replace(tagRe(MSG_TAG.GIFT), (m, t, content) => {
                // 解析新格式：[Gift: emoji+物品名|備註|Gft_ID] 或舊格式 [Gift: 物品名-价格]
                let giftName = '', memo = '', giftId = '', price = "心意無價";
                const parts = content.split(/[|｜]/).map(s => s.trim()).filter(s => s);
                
                if (parts.length >= 3) {
                    // 新格式：[emoji+物品名|備註|Gft_ID]
                    giftName = parts[0].trim();
                    memo = parts[1] || '';
                    giftId = parts[2];
                } else if (parts.length === 2) {
                    // 兼容：可能是 [物品名|備註] 或 [物品名|Gft_ID]
                    giftName = parts[0].trim();
                    if (parts[1].match(/^[a-zA-Z0-9_]+$/)) {
                        giftId = parts[1];
                    } else {
                        memo = parts[1];
                    }
                } else if (parts.length === 1) {
                    giftName = parts[0].trim();
                }
                
                // 兼容舊格式（用-分隔）
                if (!giftId && giftName.includes('-')) {
                    const oldParts = giftName.split('-');
                    giftName = oldParts[0].trim();
                    price = oldParts.length > 1 ? oldParts[1].trim() : price;
                }
                
                // 提取emoji和物品名
                let icon = '<i class="fa-solid fa-gift"></i>';   // 沒帶 emoji 的禮物用 FA 圖示；帶了就用它自己的
                let name = giftName;
                const emojiMatch = giftName.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27FF])/);
                if (emojiMatch) {
                    icon = emojiMatch[0];
                    name = giftName.replace(icon, '').trim();
                }
                
                // 如果沒有ID，生成一個
                if (!giftId) giftId = autoRef('gft');
                const uniqueId = 'ID_' + giftId;
                // 同轉帳：狀態走這個聊天室的帳本，第一次畫到時接手舊世界那份
                const _CARDS = win.WX_CARDS || window.WX_CARDS;
                const _card = _CARDS ? _CARDS.adopt(safeId, 'gift', giftId,
                    { itemName: giftName, price: price }, uniqueId, msgIndex) : null;
                const status = _card ? _card.status : localStorage.getItem(uniqueId);
                
                let opacity = "1";
                let extraClass = "";
                let statusLabel = "微信禮物";
                let clickAction = `onclick="${app}.openGift('${encodeURIComponent(giftName)}', '${encodeURIComponent(price)}', '${uniqueId}', this)"`;
                
                if (isMe) {
                    if (status === 'accepted') {
                        opacity = "0.8";
                        extraClass = "grayscale";
                        statusLabel = "對方已收下";
                    } else if (status === 'returned') {
                        opacity = "0.5";
                        extraClass = "grayscale";
                        statusLabel = "對方已退回";
                    } else {
                        opacity = "0.9";
                        statusLabel = "已送出";
                    }
                    clickAction = `onclick="${app}.openGift('${encodeURIComponent(giftName)}', '${encodeURIComponent(price)}', 'VIEW_ONLY', this)"`;
                } else {
                    if (status === 'accepted') {
                        opacity = "0.8";
                        extraClass = "grayscale";
                        statusLabel = "已接收";
                    } else if (status === 'returned') {
                        opacity = "0.5";
                        extraClass = "grayscale";
                        statusLabel = "已退回";
                    }
                }
                return `<div class="wx-gift-card-blue ${extraClass}" style="opacity:${opacity}" ${clickAction}><div class="wx-gift-top"><div class="wx-gift-icon-gold">${icon}</div><div class="wx-gift-title-text">${memo || '送你一份心意'}</div></div><div class="wx-gift-footer">${statusLabel}</div></div>`;
            });
            // 圖片走三個手機 app 共用的管道；ref 帶 chatId，訊息位置由 .wx-msg-row 的 data-msg-idx 補上
            html = html.replace(tagRe(MSG_TAG.IMAGE), (m, t, content) => { const PI = win.OS_PHONE_IMAGE || window.OS_PHONE_IMAGE; return PI ? PI.render(content.trim(), { app: 'wx', ref: safeId }) : content; });
            // 📞 通話記錄：一個電話圖示加一句話，裝在泡泡裡（微信原生就是這樣）。
            //    她填的備註原樣顯示，沒填就寫「通話已結束」。
            html = html.replace(tagRe(MSG_TAG.CALL), (m, t, txt) => {
                const note = String(txt || '').replace(/['"]/g, '').trim();
                return '<span class="wx-call-rec"><i class="fa-solid fa-phone"></i>'
                    + (note || '通話已結束') + '</span>';
            });
            html = html.replace(tagRe(MSG_TAG.VOICE), (m, t, txt) => { const cleanTxt = txt.replace(/['"]/g, ''); const sec = Math.min(60, Math.max(2, Math.ceil(cleanTxt.length/2))); return `<div class="wx-voice-wrapper" onclick="${app}.toggleVoice(this, '${encodeURIComponent(cleanTxt)}')"><div class="wx-voice-box" style="width:${60+sec*2}px"><span style="margin:0 5px">((</span><span>${sec}"</span></div><div class="wx-trans-box"></div></div>`; });
            html = html.replace(tagRe(MSG_TAG.REDPACKET), (match, tag, content) => {
                // 解析內容：支持 [金額|備註|紅包ID] 或舊格式
                let amount = '0', memo = '恭喜發財，大吉大利', packetId = '';
                const parts = content.split(/[|｜]/).map(s => s.trim()).filter(s => s);
                
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
                
                if (!packetId) packetId = autoRef('rp');

                // 🚨 同一個單號長在不同則訊息上＝不同的紅包（模型很愛重用單號，重用時第二包會
                //    讀到第一包的領取紀錄，一發出來就「已領完」）。跟轉帳一樣綁上 msgIndex，
                //    之後畫面與點擊都用帳本自己的編號當身分。
                const win = window.parent || window;
                let rpRef = packetId;
                try { if (win.wxApp && win.wxApp._rpRef) rpRef = win.wxApp._rpRef(packetId, msgIndex, { alias: packetId }) || packetId; } catch (e) {}

                // 保存紅包數據（如果還沒有保存過）
                if (win.wxApp && typeof win.wxApp._getRedPacketData === 'function') {
                    const existing = win.wxApp._getRedPacketData(rpRef);
                    if (!existing) {
                        // 獲取發送者名稱
                        let senderName = "User";
                        if (isMe) {
                            try { senderName = win.WX_ME.name(); } catch (e) {}
                        } else {
                            // 從聊天對象獲取名稱
                            if (win.wxApp && win.wxApp.GLOBAL_CHATS) {
                                const chat = win.wxApp.GLOBAL_CHATS[safeId];
                                if (chat) senderName = chat.name || safeId;
                            }
                        }
                        
                        const totalAmount = parseFloat(amount) || 0;
                        // 默認紅包數量：根據金額計算，最小1個，最大100個，每個至少0.01元
                        const maxCount = Math.floor(totalAmount / 0.01);
                        const totalCount = Math.min(100, Math.max(1, maxCount));
                        win.wxApp._saveRedPacketData(rpRef, {
                            sender: senderName,
                            totalAmount: totalAmount,
                            totalCount: totalCount,
                            memo: memo,
                            list: []
                        });
                    }
                }
                
                // 🚨 領完了就別再擺出「領取紅包」的樣子。這張卡以前是完全靜態的——不管被領走多少、
                //    甚至整包領完，都還是寫「領取紅包」，所以她說「AI 收了之後紅包按鈕還在」。
                //    轉帳跟禮物都有狀態，只有紅包沒有。
                let rpSub = '領取紅包', rpDim = '';
                try {
                    const _rd = (win.wxApp && win.wxApp._getRedPacketData) ? win.wxApp._getRedPacketData(rpRef) : null;
                    if (_rd && _rd.totalAmount != null) {
                        const _list = _rd.list || [];
                        const _got = _list.reduce(function (n, x) { return n + (Number(x && x.amount) || 0); }, 0);
                        const _left = Number(_rd.totalAmount) - _got;
                        const _slots = Number(_rd.totalCount || 1) - _list.length;
                        if (_left <= 0.001 || _slots <= 0) { rpSub = '已領完'; rpDim = 'opacity:0.55;'; }
                        else if (_list.some(function (x) { try { return x && win.WX_ME.isMine(x.name); } catch (e) { return false; } })) { rpSub = '已領取'; }
                    }
                } catch (e) {}
                return `<div style="width: 220px; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.1); cursor: pointer; font-family: sans-serif; ${rpDim}" onclick="${app}.openRedPacketById('${rpRef}')"><div style="background: #fa9d3b; padding: 15px; display: flex; align-items: center;"><div style="width: 32px; height: 42px; background: #e64340; border-radius: 4px; position: relative; margin-right: 12px; flex-shrink: 0; display:flex; justify-content:center; align-items:center; border:1px solid #f8b97a;"><div style="width:18px; height:18px; background:#f6d147; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#e64340; font-weight:bold; font-size:11px;">¥</div></div><div style="color: white; flex: 1; overflow:hidden;"><div style="font-size: 15px; font-weight: 500; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${memo}</div><div style="font-size: 12px; opacity: 0.8;">${rpSub}</div></div></div><div style="background: #fff; padding: 8px 15px; font-size: 11px; color: #999; display:flex; justify-content:space-between; align-items:center;"><span>微信紅包</span></div></div>`;
            });
            html = html.replace(tagRe(MSG_TAG.LOCATION), (match, tag, content) => { let parts = content.split(/[-－]/); let name = parts[0].trim(); let address = parts.length > 1 ? parts[1].trim() : name; return `<div style="width:230px; border-radius:6px; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,0.1); background:#fff; cursor:default; font-family: sans-serif;"><div style="height:120px; background: url('https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/World_map_blank_without_borders.svg/640px-World_map_blank_without_borders.svg.png') center/cover no-repeat; position:relative; background-color:#e6e6e6;"><div style="width:100%; height:100%; background:rgba(0,0,0,0.05);"></div><div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -80%); font-size:32px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3)); color:#e64340;"><i class="fa-solid fa-location-dot"></i></div></div><div style="background:#55d967; padding:10px 12px; color:white; display:flex; flex-direction:column; justify-content:center;"><div style="font-size:15px; font-weight:bold; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div><div style="font-size:11px; opacity:0.9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${address}</div></div></div>`; });
            html = html.replace(tagRe(MSG_TAG.VIDEO), (m, t, content) => { var videoTitle = "Video Clip"; var isUrl = content.match(/^http/i); if (!isUrl) videoTitle = content; var vidClick = isUrl ? `onclick="window.open('${content}')"` : ''; return `<div ${vidClick} style="margin: 0; width: 230px; aspect-ratio: 16/9; background: #000; border-radius: 8px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; cursor: ${isUrl ? 'pointer' : 'default'}; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><div style="position: absolute; width: 100%; height: 100%; background: linear-gradient(45deg, #111, #222); opacity: 0.8;"></div><div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.2); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.5); display: flex; align-items: center; justify-content: center; z-index: 2;"><div style="width: 0; height: 0; border-top: 8px solid transparent; border-bottom: 8px solid transparent; border-left: 14px solid #fff; margin-left: 4px;"></div></div><div style="position: absolute; bottom: 10px; left: 12px; color: #fff; font-size: 13px; font-weight: 500; z-index: 2; text-shadow: 0 1px 2px rgba(0,0,0,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;"><i class="fa-solid fa-video"></i> ${videoTitle}</div><div style="position: absolute; bottom: 10px; right: 12px; background: rgba(0,0,0,0.6); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px; z-index: 2;">00:15</div></div>`; });
            html = html.replace(tagRe(MSG_TAG.FILE), (m, t, filename) => { filename = filename.trim(); let ext = filename.split('.').pop().toLowerCase(); let iconColor = '#999'; let iconText = '?'; if (ext.match(/ppt|pptx/)) { iconColor = '#f4511e'; iconText = 'P'; } else if (ext.match(/doc|docx/)) { iconColor = '#4b89dc'; iconText = 'W'; } else if (ext.match(/xls|xlsx/)) { iconColor = '#2e7d32'; iconText = 'X'; } else if (ext.match(/pdf/)) { iconColor = '#e53935'; iconText = '<span style="font-size:10px">PDF</span>'; } else if (ext.match(/txt/)) { iconColor = '#999'; iconText = 'T'; } let size = (Math.random() * 5 + 1).toFixed(1) + " MB"; return `<div class="wx-file-card"><div class="wx-file-info"><div class="wx-file-name">${filename}</div><div class="wx-file-size">${size}</div></div><div class="wx-file-icon" style="background:${iconColor}">${iconText}</div></div>`; });
            html = html.replace(tagRe(MSG_TAG.STICKER), (match, tag, content) => {
                content = content.trim();
                const _w = window.parent || window;
                let src = null;
                if (content.match(/^(https?:\/\/|data:|blob:)/i)) {
                    src = content.replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c));
                } else {
                    // 查貼圖庫（wx 與 VN 同一份）；查不到退 VN 的 stickerBase 拼網址（VN 手機就是這樣找到的，wx 以前少了這步→同一張圖 VN 有、微信變文字）
                    try { if (_w.WX_STICKER) src = _w.WX_STICKER.lookup(content); } catch (e) {}
                    try { if (!src && _w.VN_Sticker && _w.VN_Sticker.lookup) src = _w.VN_Sticker.lookup(content); } catch (e) {}
                    if (!src) {
                        const base = String((_w.VN_Config && _w.VN_Config.data && _w.VN_Config.data.stickerBase) || '').replace(/\/?$/, '/');
                        if (base && base !== '/') src = base + encodeURIComponent(content);
                    }
                }
                const label = content.replace(/^.*\//, '').replace(/\.(gif|jpg|jpeg|png)$/i, '') || content;
                const safeLabel = label.replace(/</g,'&lt;').replace(/"/g,'&quot;');
                if (src) {
                    return `<img src="${src}" class="wx-img-block" data-stk-label="${safeLabel}" style="max-width:120px; border-radius:4px;" alt="${safeLabel}" onerror="(function(el){el.style.display='none';var d=el.ownerDocument.createElement('div');d.className='wx-stk-fallback-box';d.textContent=el.dataset.stkLabel;el.parentNode.insertBefore(d,el.nextSibling);})(this)">`;
                }
                return `<div class="wx-stk-fallback-box">${safeLabel}</div>`;
            });
            html = html.replace(tagRe(MSG_TAG.WBSHARE), (match, _tag, content) => {
                const parts = content.split('|');
                const author = (parts[0] || '').trim();
                const text   = (parts[1] || '').trim();
                const short  = text.length > 60 ? text.substring(0, 60) + '…' : text;
                return `<div class="wx-wb-share-card"><div class="wx-wb-share-top"><span class="wx-wb-share-logo">微博</span><span style="font-size:11px; opacity:0.8; margin-left:4px;">分享</span></div><div class="wx-wb-share-body"><div class="wx-wb-share-author">@${author}</div><div class="wx-wb-share-text">${short || '（查看原貼）'}</div></div></div>`;
            });
            // 鏈接/網頁分享卡（跑團用、不帶網址；重用 vn_styles.css 的 .wx-link-msg）
            html = html.replace(tagRe(MSG_TAG.LINK), (m, _tag, title) => {
                const safe = (String(title || '').trim() || '網頁連結').replace(/&/g,'&amp;').replace(/</g,'&lt;');
                return `<div class="wx-link-msg"><div class="wx-link-body"><div class="wx-link-title">${safe}</div><div class="wx-link-foot"><i class="fa-solid fa-link"></i> 網頁連結</div></div><div class="wx-link-thumb"><i class="fa-solid fa-globe"></i></div></div>`;
            });
            // 收款碼（假容器：程式畫 QR 樣式 SVG，跑團用、不用生圖；重用 vn_styles.css 的 .wx-receive-msg）
            html = html.replace(tagRe(MSG_TAG.PAYCODE), (m, _tag, body) => {
                const parts = String(body || '').split('|'); const amt = (parts[0] || '').trim(); const memo = (parts[1] || '').trim();
                const isNum = /^\d+(\.\d+)?$/.test(amt);
                const amtDisp = (isNum ? '¥' + amt : (amt || '金額任意')).replace(/&/g,'&amp;').replace(/</g,'&lt;');
                const memoDisp = (memo || '掃碼支付給對方').replace(/&/g,'&amp;').replace(/</g,'&lt;');
                return `<div class="wx-receive-msg"><div class="wx-receive-head"><i class="fa-solid fa-wallet"></i> 微信收款</div><div class="wx-receive-qr">${this._fakeQrSvg(body || 'qr')}</div><div class="wx-receive-amt">${amtDisp}</div><div class="wx-receive-foot">${memoDisp}</div></div>`;
            });
            html = html.replace(/\n/g, '<br>');
            return html;
        },

        // --- 3. 聊天列表渲染 (保持 V108.5 邏輯) ---
        getListHTML: function(chats, activeId) {
            const chatIds = Object.keys(chats).filter(k => k !== 'unknown_chat' && chats[k] && !chats[k].wxRemoved && Array.isArray(chats[k].messages) && chats[k].messages.length > 0);   // 沒聊過的只在通訊錄；刪掉的好友（wxRemoved）都不列
            if (chatIds.length === 0 && chats['unknown_chat'] && chats['unknown_chat'].messages.length > 0) chatIds.push('unknown_chat');
            return chatIds.map(id => {
                const c = chats[id];
                const displayName = c.name; 
                const showBadge = c.unread && (id !== activeId);
                const badgeHTML = showBadge ? '<div class="wx-badge">1</div>' : '';
                
                let avatarSeed = c.isGroup ? id : displayName;
                let defaultUrl = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(avatarSeed)}&backgroundColor=e6e6e6`;
                let avatarStyle = `background-image: url('${defaultUrl}')`;
                let dataAttr = '';
                
                if (c.customAvatar) {
                    if (c.customAvatar.startsWith('img_') || c.customAvatar.startsWith('avt_')) {
                        avatarStyle = `background-image: url('${defaultUrl}');`;
                        dataAttr = `data-db-bg="${c.customAvatar}" class="wx-avatar db-load-target"`;
                    } else {
                        avatarStyle = `background-image: url('${c.customAvatar}')`;
                        dataAttr = `class="wx-avatar"`;
                    }
                } else if (!c.isGroup && c.realName) {
                    dataAttr = `data-vn-name="${c.realName}" class="wx-avatar vn-load-target"`;
                } else {
                    dataAttr = `class="wx-avatar"`;
                }
                
                return `<div class="wx-chat-item" id="chat-item-${id}" onclick="(window.parent.wxApp || window.wxApp).openChat('${id}')"><div style="${avatarStyle}" ${dataAttr}>${badgeHTML}</div><div class="wx-info"><div style="display:flex; justify-content:space-between;"><span class="wx-name">${displayName}</span><span class="wx-meta">${c.lastTime || ''}</span></div><div class="wx-last-msg">${c.lastPreview || ''}</div></div></div>`;
            }).join('');
        },

        // --- 4. 聯絡人頁面 (🔥 修復：支援 DB 圖片) ---
        getContactListHTML: function(chats) {
            // 上面這幾顆都是真的會做事的：新的朋友＝還沒開口的人、僅聊天的朋友＝只在群裡遇到還沒加的人、
            // 群組＝所有群聊、標籤＝自己分的類。原本還有一顆「官方帳號」，奧瑞亞沒有那種東西，拿掉了。
            const _newN = this._newFriendIds(chats).length;
            const _onlyN = this._chatOnlyNames(chats).length;
            const _grpN = Object.keys(chats).filter(function (k) { return chats[k] && chats[k].isGroup && !chats[k].wxRemoved; }).length;
            let _tagN = 0;
            try { _tagN = Object.keys((win.WX_CONTACTS || window.WX_CONTACTS).getTags()).length; } catch (e) {}
            const _cnt = function (n) { return n ? '<div class="wx-contact-count">' + n + '</div>' : ''; };
            let html = `
                <div class="wx-contact-item" onclick="(window.parent.wxApp || window.wxApp).openContactSub('c_new')"><div class="wx-contact-icon icon-new-friend">${_newN ? '<div class="wx-badge" style="top:-6px; right:-6px;">' + _newN + '</div>' : ''}<svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M15 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/></svg></div><div class="wx-contact-name">新的朋友</div></div>
                <div class="wx-contact-item" onclick="(window.parent.wxApp || window.wxApp).openContactSub('c_only')"><div class="wx-contact-icon" style="background:#fa9d3b;"><svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h2v2H6zm4-4h8v2h-8zm0 4h5v2h-5z"/></svg></div><div class="wx-contact-name">僅聊天的朋友</div>${_cnt(_onlyN)}</div>
                <div class="wx-contact-item" onclick="(window.parent.wxApp || window.wxApp).openContactSub('c_group')"><div class="wx-contact-icon icon-group-chat"><svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5c0-2.3-4.7-3.5-7-3.5zm8 0c-.3 0-.6 0-1 .1.5.5.9 1.1.9 1.9 0 2.3-4.7 3.5-7 3.5h7.1c2.3 0 6.9-1.2 6.9-3.5V13c0-2.3-4.6-3.5-6.9-3.5z"/></svg></div><div class="wx-contact-name">群組</div>${_cnt(_grpN)}</div>
                <div class="wx-contact-item" onclick="(window.parent.wxApp || window.wxApp).openContactSub('c_tags')"><div class="wx-contact-icon icon-tags"><svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M21.4 11.6l-9-9C12 2.2 11.5 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .5.2 1 .6 1.4l9 9c.4.4 1 .4 1.4 0l8.4-8.4c.4-.4.4-1 0-1.4zM5.5 7C4.7 7 4 6.3 4 5.5S4.7 4 5.5 4 7 4.7 7 5.5 6.3 7 5.5 7z"/></svg></div><div class="wx-contact-name">標籤</div>${_cnt(_tagN)}</div>
            `;
            let contacts = Object.keys(chats).filter(k => k !== 'unknown_chat' && !(chats[k] && chats[k].wxRemoved)).map(id => ({ id: id, name: chats[id].name, customAvatar: chats[id].customAvatar, realName: chats[id].isGroup ? '' : (chats[id].realName || '') }));
            contacts.sort((a, b) => a.name.localeCompare(b.name));
            if (contacts.length > 0) {
                html += `<div class="wx-contact-section">A</div>`;
                contacts.forEach(c => {
                    // 🔥 修復邏輯：處理 img_ 和 avt_ 開頭的 DB ID
                    let defaultUrl = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(c.name)}&backgroundColor=e6e6e6`;
                    let avatarStyle = `width:38px; height:38px; margin-right:12px; background-image: url('${defaultUrl}')`;
                    let dataAttr = '';

                    if (c.customAvatar) {
                        if (c.customAvatar.startsWith('img_') || c.customAvatar.startsWith('avt_')) {
                            // 這是 DB ID，使用異步標記
                            avatarStyle = `width:38px; height:38px; margin-right:12px; background-image: url('${defaultUrl}');`;
                            dataAttr = `data-db-bg="${c.customAvatar}" class="wx-avatar db-load-target"`;
                        } else if (c.customAvatar.startsWith('blob:') || c.customAvatar.startsWith('data:') || c.customAvatar.startsWith('http')) {
                            // 這是標準網址
                            avatarStyle = `width:38px; height:38px; margin-right:12px; background-image: url('${c.customAvatar}')`;
                            dataAttr = `class="wx-avatar"`;
                        }
                    } else if (c.realName) {
                        dataAttr = `data-vn-name="${c.realName}" class="wx-avatar vn-load-target"`;   // 跑團來的人：照名字對 VN 頭像庫
                    } else {
                        dataAttr = `class="wx-avatar"`;
                    }

                    const contextAction = `oncontextmenu="(window.parent.WX_CONTACTS || window.WX_CONTACTS).showContextMenu(event, '${c.id}', '${c.name}'); return false;"`;
                    // 注意：這裡將 dataAttr 注入到 div class="wx-avatar..." 結構中
                    // 👤 頭像開個人檔案、整列照舊直接進聊天——最常做的事不要多一步
                    const avatarTap = ` onclick="event.stopPropagation(); const P=(window.parent.WX_PROFILE||window.WX_PROFILE); if(P)P.open('${c.id}')"`;
                    html += `<div class="wx-contact-item" id="contact-item-${c.id}" ${contextAction} onclick="(window.parent.wxApp || window.wxApp).openChat('${c.id}')"><div style="${avatarStyle}" ${dataAttr}${avatarTap}></div><div class="wx-contact-name">${c.name}</div></div>`;
                });
            } else { html += `<div style="text-align:center; padding:30px; color:#ccc;">暫無聯絡人</div>`; }
            return html;
        },

        // ── 通訊錄的四張子頁 ──────────────────────────────────────
        // 頭像那幾行三個地方在用，抽出來一份：圖庫編號、網址、跑團名字對頭像庫，三種都認
        _avatarBits: function (name, customAvatar, realName, size) {
            const px = size || 38;
            const def = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(name || '')}&backgroundColor=e6e6e6`;
            let style = `width:${px}px; height:${px}px; margin-right:12px; background-image: url('${def}')`;
            let attr = 'class="wx-avatar"';
            const a = String(customAvatar || '');
            if (a.startsWith('img_') || a.startsWith('avt_')) attr = `data-db-bg="${a}" class="wx-avatar db-load-target"`;
            else if (a.startsWith('blob:') || a.startsWith('data:') || a.startsWith('http')) style = `width:${px}px; height:${px}px; margin-right:12px; background-image: url('${a}')`;
            else if (realName) attr = `data-vn-name="${realName}" class="wx-avatar vn-load-target"`;
            return { style: style, attr: attr };
        },
        _alive: function (chats) {
            return Object.keys(chats).filter(function (k) { return k !== 'unknown_chat' && chats[k] && !chats[k].wxRemoved; });
        },
        // 新的朋友＝通訊錄裡有、但你們一句話都還沒講過的人
        _newFriendIds: function (chats) {
            const self = this;
            return this._alive(chats).filter(function (k) {
                const c = chats[k];
                return !c.isGroup && !((c.messages || []).length);
            });
        },
        // 僅聊天的朋友＝只在群裡遇到、通訊錄裡沒有這個人（同群不等於加好友）
        _chatOnlyNames: function (chats) {
            const self = this;
            let known = [];
            try { known = (win.WX_CONTACTS || window.WX_CONTACTS).getAllCustomContacts() || []; } catch (e) {}
            const knownIds = {}, knownNames = {};
            known.forEach(function (c) { if (!c) return; knownIds[c.id] = 1; if (c.name) knownNames[c.name] = 1; });
            const out = [], seen = {};
            this._alive(chats).forEach(function (k) {
                const c = chats[k];
                if (!c.isGroup) return;
                (c.members || []).forEach(function (m) {
                    const key = String(m || '').trim();
                    if (!key || key === 'User' || key === 'user' || key === '我') return;
                    if (knownIds[key] || knownNames[key] || chats[key] || seen[key]) return;
                    try { if ((win.WX_ME || window.WX_ME).isMine(key)) return; } catch (e) {}
                    seen[key] = 1;
                    out.push(key);
                });
            });
            return out;
        },
        _emptyBox: function (icon, line, small) {
            return `<div class="wx-sub-empty"><i class="fa-solid ${icon}"></i><div>${line}</div>${small ? `<small>${small}</small>` : ''}</div>`;
        },
        _personRow: function (id, name, chats, right) {
            const c = chats[id] || {};
            const av = this._avatarBits(name, c.customAvatar, c.isGroup ? '' : (c.realName || ''));
            return `<div class="wx-contact-item" onclick="${'(window.parent.wxApp || window.wxApp)'}.openChat('${id}')">` +
                `<div style="${av.style}" ${av.attr}></div><div class="wx-contact-name">${name}</div>${right || ''}</div>`;
        },

        getNewFriendsHTML: function (chats) {
            const ids = this._newFriendIds(chats);
            if (!ids.length) return this._emptyBox('fa-user-check', '沒有還沒開口的人。', '劇情裡有人加你好友、或你自己加了誰，還沒講過話之前都會先待在這裡。');
            const self = this;
            return ids.map(function (id) { return self._personRow(id, chats[id].name || id, chats, '<div class="wx-contact-side">還沒聊過</div>'); }).join('');
        },
        getChatOnlyHTML: function (chats) {
            const names = this._chatOnlyNames(chats);
            if (!names.length) return this._emptyBox('fa-comments', '沒有這種人。', '在群裡遇到、但你沒加成好友的人會出現在這裡。');
            const self = this;
            return names.map(function (n) {
                const av = self._avatarBits(n, '', n);
                const esc = String(n).replace(/'/g, "\\'");
                return `<div class="wx-contact-item"><div style="${av.style}" ${av.attr}></div><div class="wx-contact-name">${n}</div>` +
                    `<div class="wx-contact-side"><button class="wx-sub-btn" onclick="event.stopPropagation(); (window.parent.wxApp || window.wxApp).addFriendFromGroup('${esc}')">加為朋友</button></div></div>`;
            }).join('');
        },
        getGroupsHTML: function (chats) {
            const self = this;
            const ids = this._alive(chats).filter(function (k) { return chats[k].isGroup; });
            if (!ids.length) return this._emptyBox('fa-user-group', '還沒有群。', '劇情裡出現的群、或你自己發起的群聊都會列在這裡。');
            return ids.map(function (id) {
                const n = (chats[id].members || []).length;
                return self._personRow(id, chats[id].name || id, chats, n ? `<div class="wx-contact-side">${n} 人</div>` : '');
            }).join('');
        },
        getTagsHTML: function (chats) {
            let tags = {};
            try { tags = (win.WX_CONTACTS || window.WX_CONTACTS).getTags(); } catch (e) {}
            const names = Object.keys(tags);
            const app = '(window.parent.wxApp || window.wxApp)';
            let html = `<div class="wx-sub-bar"><button class="wx-sub-btn solid" onclick="${app}.tagCreate()"><i class="fa-solid fa-plus"></i> 新增標籤</button></div>`;
            if (!names.length) {
                html += this._emptyBox('fa-tags', '還沒有標籤。', '把人分成幾類——同事、家人、夜蝶那邊的人——分好之後點標籤就只看那一群。');
                return html;
            }
            names.forEach(function (t) {
                const ids = (tags[t] || []).filter(function (i) { return chats[i] && !chats[i].wxRemoved; });
                const esc = String(t).replace(/'/g, "\\'");
                html += `<div class="wx-contact-item" onclick="${app}.openContactSub('c_tag', '${esc}')">` +
                    `<div class="wx-contact-icon icon-tags" style="margin-right:12px;"><svg viewBox="0 0 24 24" width="18" height="18" fill="white"><path d="M21.4 11.6l-9-9C12 2.2 11.5 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .5.2 1 .6 1.4l9 9c.4.4 1 .4 1.4 0l8.4-8.4c.4-.4.4-1 0-1.4zM5.5 7C4.7 7 4 6.3 4 5.5S4.7 4 5.5 4 7 4.7 7 5.5 6.3 7 5.5 7z"/></svg></div>` +
                    `<div class="wx-contact-name">${t}</div><div class="wx-contact-side">${ids.length} 人</div></div>`;
            });
            return html;
        },
        // 標籤裡面：平常列這一類的人，按「編輯」變成整本通訊錄打勾
        getTagDetailHTML: function (chats, tag, editing) {
            const self = this;
            const app = '(window.parent.wxApp || window.wxApp)';
            let tags = {};
            try { tags = (win.WX_CONTACTS || window.WX_CONTACTS).getTags(); } catch (e) {}
            const picked = (tags[tag] || []);
            const esc = String(tag).replace(/'/g, "\\'");
            if (editing) {
                const ids = this._alive(chats).filter(function (k) { return !chats[k].isGroup; });
                let html = `<div class="wx-sub-bar"><span class="wx-sub-note">點一下加進「${tag}」，再點一下拿掉</span></div>`;
                if (!ids.length) return html + this._emptyBox('fa-user-slash', '通訊錄還沒有人。', '');
                html += ids.map(function (id) {
                    const on = picked.indexOf(id) >= 0;
                    const c = chats[id];
                    const av = self._avatarBits(c.name || id, c.customAvatar, c.realName || '');
                    return `<div class="wx-contact-item" onclick="${app}.tagToggle('${esc}', '${id}')">` +
                        `<div style="${av.style}" ${av.attr}></div><div class="wx-contact-name">${c.name || id}</div>` +
                        `<div class="wx-contact-side"><i class="fa-solid ${on ? 'fa-circle-check wx-tag-on' : 'fa-circle'} wx-tag-mark"></i></div></div>`;
                }).join('');
                return html;
            }
            const alive = picked.filter(function (i) { return chats[i] && !chats[i].wxRemoved; });
            let html = `<div class="wx-sub-bar"><button class="wx-sub-btn" onclick="${app}.tagEdit()">選人進來</button><span class="sp"></span>` +
                `<button class="wx-sub-btn warn" onclick="${app}.tagDelete('${esc}')">刪掉這個標籤</button></div>`;
            if (!alive.length) return html + this._emptyBox('fa-tag', `「${tag}」還沒有人。`, '按上面那顆「選人進來」。');
            html += alive.map(function (id) { return self._personRow(id, chats[id].name || id, chats); }).join('');
            return html;
        },

        // --- 5. "我" 的頁面 ---
        getMePageHTML: function(isDark = false, sub = '') {
            const win = window.parent || window;
            const profile = (win.WX_PROFILE && win.WX_PROFILE.get) ? win.WX_PROFILE.get() : { nickname: 'User', signature: '這個人很懶，什麼都沒寫', avatar: '' };

            // 修正 User 頭像讀取
            let avatarStyle = `background-image: url('https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(profile.nickname)}&backgroundColor=c0ebd7')`;
            let dataAttr = '';

            if (profile.avatar) {
                if (profile.avatar.startsWith('img_') || profile.avatar.startsWith('avt_')) {
                    dataAttr = `data-db-bg="${profile.avatar}" class="wx-me-avatar db-load-target"`;
                } else {
                    avatarStyle = `background-image: url('${profile.avatar}')`;
                    dataAttr = `class="wx-me-avatar"`;
                }
            } else {
                 dataAttr = `class="wx-me-avatar"`;
            }

            const wxId = 'wxid_' + profile.nickname.replace(/\s+/g, '_');

            // 錢包餘額（同步讀快取，getMePageHTML 本身不是 async）。模塊還沒載好就留白，
            // 不要印 ¥0.00 誤導成「錢不見了」。
            let walletAmount = '';
            try { const W = win.WX_WALLET; if (W && W.getBalance) walletAmount = W.money(W.getBalance()); } catch (e) {}

            // 換頭像權限：開關 ＋ 來源。來源留白＝跟著「圖片設置 → 頭像」那個桶走，不要她再設一次。
            const _AV = win.WX_AVATAR_AI;
            const avOn = !!(_AV && _AV.isEnabled && _AV.isEnabled());
            const avSrc = (_AV && _AV.getProvider) ? _AV.getProvider() : '';
            const avBadge = avOn
                ? '<span style="background:#07c160; color:#fff; font-size:11px; padding:2px 8px; border-radius:10px;">已開啟</span>'
                : '<span style="background:#ddd; color:#999; font-size:11px; padding:2px 8px; border-radius:10px;">已關閉</span>';
            const seeOn = !!(_AV && _AV.seeEnabled && _AV.seeEnabled());
            const seeBadge = seeOn
                ? '<span style="background:#07c160; color:#fff; font-size:11px; padding:2px 8px; border-radius:10px;">已開啟</span>'
                : '<span style="background:#ddd; color:#999; font-size:11px; padding:2px 8px; border-radius:10px;">已關閉</span>';
            const AV_SRC_LABEL = { '': '跟著圖片設置', pollinations: 'Pollinations', novelai: 'NovelAI', tavern_sd: '酒館原生', custom_api: '自訂接口', comfyui_direct: 'ComfyUI 直連' };
            const avOptions = Object.keys(AV_SRC_LABEL).map(function (v) {
                return '<option value="' + v + '"' + (avSrc === v ? ' selected' : '') + '>' + AV_SRC_LABEL[v] + '</option>';
            }).join('');

            const pageBg      = isDark ? '#111'    : '#f2f2f2';
            const headerBg    = isDark ? '#1c1c1e' : '#fff';
            const cellGroupBg = isDark ? '#1c1c1e' : '#fff';
            const borderColor = isDark ? '#2a2a2a' : '#f2f2f2';
            const nameColor   = isDark ? '#f0f0f0' : '#000';
            const idColor     = isDark ? '#888'    : '#666';
            const sigColor    = isDark ? '#666'    : '#999';
            const cellText    = isDark ? '#f0f0f0' : '#000';
            const arrowColor  = isDark ? '#555'    : '#ccc';
            const darkBadge   = isDark
                ? '<span style="background:#07c160; color:#fff; font-size:11px; padding:2px 8px; border-radius:10px;">已開啟</span>'
                : '<span style="background:#ddd; color:#999; font-size:11px; padding:2px 8px; border-radius:10px;">已關閉</span>';

            const style = `
                .wx-me-header { background: ${headerBg}; padding: 30px 25px 30px 20px; padding-top: calc(30px + env(safe-area-inset-top, 0px)); display: flex; align-items: center; margin-bottom: 10px; }
                .wx-me-avatar { width: 64px; height: 64px; border-radius: 6px; background-size: cover; margin-right: 15px; border: 1px solid ${borderColor}; }
                .wx-me-info { flex: 1; display: flex; flex-direction: column; gap: 5px; }
                .wx-me-name { font-size: 20px; font-weight: 600; color: ${nameColor}; }
                .wx-me-id { font-size: 14px; color: ${idColor}; display: flex; align-items: center; justify-content: space-between; }
                .wx-me-signature { font-size: 13px; color: ${sigColor}; margin-top: 3px; }
                .wx-me-qr { width: 18px; height: 18px; opacity: 0.6; }
                .wx-me-arrow { font-size: 20px; color: ${arrowColor}; margin-left: 10px; }
                .wx-cell-group { background: ${cellGroupBg}; margin-bottom: 10px; }
                .wx-cell { display: flex; align-items: center; padding: 15px 20px; border-bottom: 1px solid ${borderColor}; cursor: pointer; }
                .wx-cell:active { background: ${isDark ? '#2a2a2a' : '#f5f5f5'}; }
                .wx-cell-icon { width: 24px; height: 24px; margin-right: 15px; display: flex; align-items: center; justify-content: center; }
                .wx-cell-icon svg { width: 22px; height: 22px; }
                .wx-cell-text { flex: 1; font-size: 16px; color: ${cellText}; }
                .wx-cell-arrow { font-size: 18px; color: ${arrowColor}; }
                /* 🚨 右邊帶一段長文字的格子：標籤要保持一行，讓右邊那段自己縮。
                   不設的話 .wx-cell-text 的 flex:1 會被長文字擠成一字一行。 */
                .wx-cell-text.is-fixed { flex: 0 0 auto; white-space: nowrap; }
                /* 設置頁的分組小標題（頭像／通用／數據管理） */
                .wx-set-label { padding: 14px 20px 6px; font-size: 12px; color: ${idColor}; }
                .wx-cell-sub { flex: 1; min-width: 0; margin-right: 6px; text-align: right;
                    font-size: 13px; color: ${idColor}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            `;
            const iconPay = `<svg viewBox="0 0 24 24" fill="#07c160"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V19h-2.67v-1.07H9.27v-1.6h1.47v-1.73H9.41c-1.39 0-2.28-.96-2.28-2.31 0-1.44.97-2.33 2.6-2.33V9h2.67v1.07h1.47v1.6h-1.47v1.73h1.33c1.39 0 2.28.96 2.28 2.31 0 1.44-.97 2.38-2.6 2.38zM12 12.27c-.63 0-.93-.28-.93-.76 0-.49.33-.76.93-.76v1.52zm-1.33 2.53v1.52c.63 0 .93.28.93.76 0 .49-.33.76-.93.76z"/></svg>`;
            const iconFav = `<svg viewBox="0 0 24 24" fill="#fa9d3b"><path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/><path d="M7 7h10v2H7zm0 4h10v2H7zm0 4h7v2H7z"/></svg>`;
            const iconMoment = `<svg viewBox="0 0 24 24" fill="none"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" fill="#576b95"/></svg>`;
            const iconCard = `<svg viewBox="0 0 24 24" fill="#2782d7"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>`;
            const iconFace = `<svg viewBox="0 0 24 24" fill="#fa9d3b"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>`;
            const iconSet = `<svg viewBox="0 0 24 24" fill="#576b95"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`;

            const mainHTML = `
                <div class="wx-me-header">
                    <div style="${avatarStyle}" ${dataAttr}></div>
                    <div class="wx-me-info">
                        <div class="wx-me-name">${profile.nickname}</div>
                        <div class="wx-me-id"><span>微信號：${wxId}</span></div>
                        <div class="wx-me-signature">${profile.signature}</div>
                    </div>
                </div>
                <!-- 💰 錢包：餘額直接印在格子右邊。她點開錢包的時機是「發紅包之前看夠不夠」，
                     那就不該還要再點進去一層才看得到。原本這格是不會動的「服務」裝飾。 -->
                <div class="wx-cell-group">
                    <div class="wx-cell" onclick="(window.parent.WX_WALLET || window.WX_WALLET) && (window.parent.WX_WALLET || window.WX_WALLET).open()">
                        <div class="wx-cell-icon">${iconPay}</div>
                        <div class="wx-cell-text">錢包</div>
                        <div id="wx-wallet-cell-amount" style="font-size:15px; color:${idColor}; margin-right:6px;">${walletAmount}</div>
                        <div class="wx-cell-arrow">›</div>
                    </div>
                </div>
                <div class="wx-cell-group">
                    <div class="wx-cell"><div class="wx-cell-icon">${iconFav}</div><div class="wx-cell-text">收藏</div><div class="wx-cell-arrow">›</div></div>
                    <div class="wx-cell"><div class="wx-cell-icon">${iconMoment}</div><div class="wx-cell-text">朋友圈</div><div class="wx-cell-arrow">›</div></div>
                    <div class="wx-cell"><div class="wx-cell-icon">${iconCard}</div><div class="wx-cell-text">卡包</div><div class="wx-cell-arrow">›</div></div>
                    <div class="wx-cell"><div class="wx-cell-icon">${iconFace}</div><div class="wx-cell-text">表情</div><div class="wx-cell-arrow">›</div></div>
                </div>
                <div class="wx-cell-group">
                    <div class="wx-cell" onclick="(window.parent.wxApp || window.wxApp).editNickname()"><div class="wx-cell-icon"><span style="font-size:20px;"><i class="fa-solid fa-pen"></i></span></div><div class="wx-cell-text">編輯暱稱</div><div class="wx-cell-arrow">›</div></div>
                    <div class="wx-cell" onclick="(window.parent.wxApp || window.wxApp).editSignature()"><div class="wx-cell-icon"><span style="font-size:20px;"><i class="fa-solid fa-pen-to-square"></i></span></div><div class="wx-cell-text">編輯個性簽名</div><div class="wx-cell-arrow">›</div></div>
                </div>
                <div class="wx-cell-group">
                    <div class="wx-cell" onclick="(window.parent.wxApp || window.wxApp).openMeSettings()"><div class="wx-cell-icon">${iconSet}</div><div class="wx-cell-text">設置</div><div class="wx-cell-arrow">›</div></div>
                </div>
            `;
            const settingsHTML = `
                <!-- ⚙️ 設置頁（「我」底下的第二頁）：以前這些開關直接攤在「我」上面，現實微信都收在「設置」裡 -->
                <div class="wx-set-label">頭像</div>
                <div class="wx-cell-group">
                    <div class="wx-cell" onclick="(window.parent.wxApp || window.wxApp).toggleAvatarAi()">
                        <div class="wx-cell-icon"><span style="font-size:20px;"><i class="fa-solid fa-user-pen"></i></span></div>
                        <div class="wx-cell-text">允許角色換頭像</div>
                        ${avBadge}
                    </div>
                    <div class="wx-cell" style="${avOn ? '' : 'display:none;'}">
                        <div class="wx-cell-icon"><span style="font-size:20px;"><i class="fa-solid fa-wand-magic-sparkles"></i></span></div>
                        <div class="wx-cell-text">頭像來源</div>
                        <select id="wx-av-src" style="border:none; background:transparent; font-size:15px; color:${idColor}; text-align:right; max-width:150px;"
                                onchange="(window.parent.wxApp || window.wxApp).setAvatarAiSource(this.value)">${avOptions}</select>
                    </div>
                    <div class="wx-cell" onclick="(window.parent.wxApp || window.wxApp).toggleSeeMe()">
                        <div class="wx-cell-icon"><span style="font-size:20px;"><i class="fa-solid fa-eye"></i></span></div>
                        <div class="wx-cell-text">讓角色看我的頭像</div>
                        ${seeBadge}
                    </div>
                </div>

                <div class="wx-set-label">通用</div>
                <div class="wx-cell-group">
                    <div class="wx-cell" onclick="(window.parent.wxApp || window.wxApp).toggleDarkMode()"><div class="wx-cell-icon"><span style="font-size:20px;"><i class="fa-solid fa-moon"></i></span></div><div class="wx-cell-text">黑夜模式</div>${darkBadge}</div>
                </div>
                <div class="wx-set-label">數據管理</div>
                <div class="wx-cell-group">
                    <div class="wx-cell" onclick="(async function(){
                        const w = window.parent || window;
                        if (!await AUI.confirm('確定清空全部通訊錄？\\n（聊天記錄保留，但聯繫人及隱形成員全部刪除）')) return;
                        localStorage.removeItem((w.WX_CONTACTS && w.WX_CONTACTS._key && w.WX_CONTACTS._key()) || 'wx_custom_contacts_v1');
                        if (w.OS_CONTACTS && w.OS_CONTACTS.getAllContacts) {
                            const all = w.OS_CONTACTS.getAllContacts();
                            all.forEach(c => { if (w.OS_CONTACTS.deleteContact) w.OS_CONTACTS.deleteContact(c.id); });
                        }
                        if (w.wxApp && w.wxApp.GLOBAL_CHATS) {
                            Object.keys(w.wxApp.GLOBAL_CHATS).forEach(id => { delete w.wxApp.GLOBAL_CHATS[id]; });
                            if (w.wxApp.render) w.wxApp.render();
                        }
                        AUI.alert('通訊錄已清空');
                    })()">
                        <div class="wx-cell-icon"><svg viewBox="0 0 24 24" fill="#e74c3c"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></div>
                        <div class="wx-cell-text" style="color:#e74c3c;">清空通訊錄</div>
                        <div class="wx-cell-arrow">›</div>
                    </div>
                    <div class="wx-cell" onclick="(async function(){
                        const w = window.parent || window;
                        if (!await AUI.confirm('確定清空所有微信數據？\\n（通訊錄 + 全部聊天記錄將永久刪除）')) return;
                        localStorage.removeItem((w.WX_CONTACTS && w.WX_CONTACTS._key && w.WX_CONTACTS._key()) || 'wx_custom_contacts_v1');
                        if (w.OS_CONTACTS && w.OS_CONTACTS.getAllContacts) {
                            const all = w.OS_CONTACTS.getAllContacts();
                            all.forEach(c => { if (w.OS_CONTACTS.deleteContact) w.OS_CONTACTS.deleteContact(c.id); });
                        }
                        const ids = w.wxApp && w.wxApp.GLOBAL_CHATS ? Object.keys(w.wxApp.GLOBAL_CHATS) : [];
                        if (w.wxApp && w.wxApp.GLOBAL_CHATS) {
                            ids.forEach(id => { delete w.wxApp.GLOBAL_CHATS[id]; });
                            if (w.wxApp.render) w.wxApp.render();
                        }
                        if (w.WX_DB && w.WX_DB.deleteApiChat) {
                            ids.forEach(id => w.WX_DB.deleteApiChat(id));
                        }
                        AUI.alert('微信數據已全部清空');
                    })()">
                        <div class="wx-cell-icon"><svg viewBox="0 0 24 24" fill="#c0392b"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg></div>
                        <div class="wx-cell-text" style="color:#c0392b;">清空全部微信數據</div>
                        <div class="wx-cell-arrow">›</div>
                    </div>
                </div>
            `;
            return `
                <style>${style}</style>
                <div style="background:${pageBg}; min-height:100%;">
                ${sub === 'settings' ? settingsHTML : mainHTML}
                </div>
            `;
        },

        // --- 6. Shell 渲染 (核心 + 異步背景加載) ---
        renderShell: function(activeId, chats, activeTab = 'chat', isDark = false) {
            const win = window.parent || window;
            const doc = win.document;
            const transform = activeId ? 'translateX(-30%)' : 'translateX(0)';
            let totalUnread = 0;
            for (let id in chats) { if (chats[id].unread && id !== activeId) { totalUnread++; } }
            
            let headerTitle = totalUnread > 0 ? `微信(${totalUnread})` : '微信';
            let headerTitleAction = 'class="wx-header-title"';
            if (activeTab === 'contacts') headerTitle = '通訊錄';
            if (activeTab === 'discover') headerTitle = '發現';
            if (activeTab === 'me') headerTitle = '我';
            if (activeTab === 'me_set') headerTitle = '設置';   // 「我」底下的第二頁
            // 通訊錄底下的幾張子頁（跟 me_set 同一套：一個 tab 名字＝一頁）
            const SUB_TITLE = { c_new: '新的朋友', c_only: '僅聊天的朋友', c_group: '群組', c_tags: '標籤' };
            if (SUB_TITLE[activeTab]) headerTitle = SUB_TITLE[activeTab];
            if (activeTab === 'c_tag') headerTitle = (win.wxApp && win.wxApp.currentTag) || '標籤';
            
            // 列表內容
            let listContent = '';
            if (activeTab === 'contacts') listContent = this.getContactListHTML(chats);
            else if (activeTab === 'c_new') listContent = this.getNewFriendsHTML(chats);
            else if (activeTab === 'c_only') listContent = this.getChatOnlyHTML(chats);
            else if (activeTab === 'c_group') listContent = this.getGroupsHTML(chats);
            else if (activeTab === 'c_tags') listContent = this.getTagsHTML(chats);
            else if (activeTab === 'c_tag') listContent = this.getTagDetailHTML(chats, (win.wxApp && win.wxApp.currentTag) || '', !!(win.wxApp && win.wxApp.tagEditing));
            else if (activeTab === 'me') listContent = this.getMePageHTML(isDark);
            else if (activeTab === 'me_set') listContent = this.getMePageHTML(isDark, 'settings');
            else if (activeTab === 'discover') listContent = this.getDiscoverHTML();
            else listContent = this.getListHTML(chats, activeId);
            
            let roomContent = '';
            let headerRightBtn = '';
            let roomBgImageStyle = '';
            let hasBg = false;
            let bgDbId = null;

            if (activeId && chats[activeId]) {
                const c = chats[activeId];
                headerTitle = c.name + (c.isGroup ? ` (${c.members.length})` : '');
                // 👤 點標題上的名字也看得到個人檔案（LINE 是點頭像或名字都行）
                if (!c.isGroup) headerTitleAction = `onclick="const P=(window.parent.WX_PROFILE||window.WX_PROFILE); if(P)P.open('${String(activeId).replace(/'/g, "\\'")}')" class="wx-header-title wx-header-title-tap"`;
                const msgs = c.messages;
                // 📞 通話裡講的話不畫成聊天泡泡。它們跟微信共用同一份記錄（刻意的，AI 才記得
                //    電話裡說過什麼），但那是另一個管道的東西，鋪在聊天室裡會很怪。
                //    留下的是「通話開始／結束」那兩筆系統訊息，就像現實微信只留一條通話記錄。
                //    回傳空字串而不是先過濾，是為了讓索引跟訊息陣列對齊（引用與編輯靠它定位）。
                roomContent = msgs.map((msg, index) => (msg && msg._viaCall) ? '' : this.renderBubble(msg, c, false, index)).join('');

                // 嘗試讀取背景圖設定
                const storageKey = `wx_chat_settings_${activeId}`;
                try {
                    const savedSettings = JSON.parse(localStorage.getItem(storageKey));
                    if (savedSettings && savedSettings.bgImage) {
                        hasBg = true;
                        if (savedSettings.bgImage.startsWith('img_')) {
                            bgDbId = savedSettings.bgImage;
                        } else {
                            roomBgImageStyle = `background-image: url('${savedSettings.bgImage}')`;
                        }
                    }
                } catch(e) {}

                headerRightBtn = `
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div id="wx-msg-delete-btn" style="display:block; font-size:16px; cursor:pointer; color:#ff453a; padding:4px 8px;"
                             onclick="event.stopPropagation(); const mm = (window.parent.WX_MESSAGE_MANAGER || window.WX_MESSAGE_MANAGER); if(mm) mm.enterMultiSelectMode();"><i class="fa-solid fa-trash"></i></div>
                        <div id="wx-msg-menu-btn" style="display:block; font-size:22px; cursor:pointer; font-weight:bold; margin-top:-8px; color:${isDark ? '#f0f0f0' : '#000'};"
                             onclick="event.stopPropagation(); const ws = (window.parent.WX_CHAT_SETTINGS || window.WX_CHAT_SETTINGS); if(ws) ws.open('${activeId}');"><i class="fa-solid fa-ellipsis"></i></div>
                        <div id="wx-msg-cancel-btn" style="display:none; font-size:14px; cursor:pointer; color:#999; padding:4px 8px;"
                             onclick="event.stopPropagation(); const mm = (window.parent.WX_MESSAGE_MANAGER || window.WX_MESSAGE_MANAGER); if(mm) mm.exitMultiSelectMode();">取消</div>
                        <div id="wx-msg-confirm-btn" style="display:none; font-size:14px; cursor:pointer; color:#999; padding:4px 8px; font-weight:bold;"
                             onclick="event.stopPropagation(); const mm = (window.parent.WX_MESSAGE_MANAGER || window.WX_MESSAGE_MANAGER); if(mm) mm.deleteSelectedMessages();">刪除</div>
                    </div>
                `;
            } else if (activeTab === 'me_set') {
                headerRightBtn = '<div style="width:30px;"></div>';   // 設置頁右上不放「＋」，留同寬空位讓標題置中
            } else {
                headerRightBtn = `<div style="width:30px; text-align:right; font-size:20px; cursor:pointer; color:${isDark ? '#f0f0f0' : '#000'};" onclick="event.stopPropagation(); const wc = (window.parent.WX_CONTACTS || window.WX_CONTACTS); if(wc) wc.showMenu(this)"><i class="fa-solid fa-circle-plus"></i></div>`;
            }
            
            const isInChat = !!activeId;
            // 子頁的返回＝回它上一層，不是回手機主頁
            const SUB_BACK = { me_set: ['我', 'me'], c_new: ['通訊錄', 'contacts'], c_only: ['通訊錄', 'contacts'],
                               c_group: ['通訊錄', 'contacts'], c_tags: ['通訊錄', 'contacts'], c_tag: ['標籤', 'c_tags'] };
            const _sub = (!isInChat && SUB_BACK[activeTab]) ? SUB_BACK[activeTab] : null;
            const backBtnText = isInChat ? '微信' : (_sub ? _sub[0] : '主頁');
            const backAction = _sub
                ? "(window.parent.wxApp || window.wxApp).switchTab('" + _sub[1] + "')"
                : "(window.parent.wxApp || window.wxApp).onBack()"; 
            const backBtnClass = 'wx-back-btn show'; 
            const inputDisplay = activeId ? 'flex' : 'none';
            const tabDisplay = activeId ? 'none' : 'flex';
            const app = "(window.parent.wxApp || window.wxApp)"; 
            const chatBadgeHTML = totalUnread > 0 ? `<div class="wx-tab-badge">${totalUnread}</div>` : '';

            // 觸發按鈕
            const triggerBtn = `<span class="wx-icon-btn" id="wx-trigger-btn" onclick="${app}.triggerReply()" style="font-size:24px; color:#07c160; margin-right:5px;" title="點擊召喚 AI 回覆"><i class="fa-solid fa-wand-magic-sparkles"></i></span>`;

            const iconChat = `<svg viewBox="0 0 24 24"><path d="M18 13.5c0-2.2-2.3-4-5-4-2.8 0-5 1.8-5 4s2.2 4 5 4c.6 0 1.1-.1 1.6-.2l.1-.1 1.7.5-.4-1.6.1-.1c1.2-1 1.9-1.9 1.9-2.5zm-5 4.5c-3.1 0-5.5-2.1-5.5-4.5S9.9 9 13 9s5.5 2.1 5.5 4.5-2.4 4.5-5.5 4.5zM7.5 7.5h.1c3.1 0 5.8 1.8 6.4 4.3.4-.2.8-.2 1.2-.2 3.6 0 6.5 2.5 6.5 5.5 0 .8-.2 1.6-.6 2.3l.5 2.1-2.2-.6c-1.1.7-2.5 1.2-3.8 1.2-3.6 0-6.5-2.5-6.5-5.5 0-.4 0-.8.1-1.2C5.9 14.8 4 12.9 4 10.5c0-2.8 2.8-5 6.2-5h-2.7z"/></svg>`;
            const iconContact = `<svg viewBox="0 0 24 24"><path d="M4 19h16v-1c0-2.2-1.8-4-4-4h-8c-2.2 0-4 1.8-4 4v1z" opacity=".3"/><path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/></svg>`;
            const iconDiscover = `<svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm-2-4l-2-6 6 2 2 6-6-2z"/></svg>`;
            const iconMe = `<svg viewBox="0 0 24 24"><path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/></svg>`;

            // 構建主介面
            const darkShellStyle = isDark ? 'background:#111;' : '';
            const darkHeaderStyle = isDark ? 'background:#1c1c1e; border-bottom:1px solid #2a2a2a;' : '';
            const darkTabStyle = isDark ? 'background:#1c1c1e; border-top:1px solid #2a2a2a;' : '';
            const darkListBg = isDark ? '#111' : ((activeTab === 'me' || activeTab === 'me_set') ? '#f2f2f2' : '#fff');

            const html = `
                <div class="wx-shell${isDark ? ' wx-dark' : ''}" style="${darkShellStyle}">
                    <div class="wx-header" style="${darkHeaderStyle}">
                        <div class="${backBtnClass}" onclick="${backAction}" style="color:${isDark ? '#f0f0f0' : '#000'}">${backBtnText}</div>
                        <div ${headerTitleAction} style="color:${isDark ? '#f0f0f0' : '#000'}">${headerTitle}</div>
                        ${headerRightBtn}
                    </div>
                    <div class="wx-page-container">
                        <div class="wx-page-list" style="transform: ${transform}">
                            <div style="padding:0; background:${darkListBg}; height:100%;">${listContent}</div>
                        </div>
                        
                        <div class="wx-page-room ${activeId ? 'active' : ''} ${hasBg ? 'has-bg' : ''}" id="wx-current-room-bg">
                            <div class="wx-room-bg" id="wx-room-bg-layer" ${roomBgImageStyle ? `style="${roomBgImageStyle}"` : ''}></div>
                            <div class="wx-room-bg-overlay"></div>
                            <div class="wx-room-scroll">
                                <div style="padding:10px;" id="wxRoomContent">${roomContent}</div>
                            </div>
                        </div>

                    </div>
                    
                    <div class="wx-modal-overlay" id="wxActionModal"><div class="wx-modal-box"><div class="wx-modal-title" id="wxModalTitle">輸入內容</div><button class="wx-modal-pick hidden" id="wxModalPick" onclick="${app}.pickPhotoAndSend()"><i class="fa-solid fa-images"></i>從相簿選</button><input type="text" class="wx-modal-input" id="wxModalInput" autocomplete="off"><input type="text" class="wx-modal-input hidden" id="wxModalInput2" autocomplete="off" style="margin-top:5px;"><select class="wx-modal-input hidden" id="wxModalSelect" style="margin-top:5px;"></select><div class="wx-modal-footer"><button class="wx-btn wx-btn-cancel" onclick="${app}.closeModal()">取消</button><button class="wx-btn wx-btn-confirm" onclick="${app}.confirmModal()">發送</button></div></div></div>
                    <div class="wx-gift-overlay" id="wxGiftOverlay" onclick="this.classList.remove('show')"><div class="wx-receipt-box" onclick="event.stopPropagation()"><div class="wx-receipt-header"></div><div class="wx-receipt-content"><div class="wx-receipt-icon" id="wxGiftIcon"><i class="fa-solid fa-gift"></i></div><div class="wx-receipt-name" id="wxGiftName">禮物名稱</div><div class="wx-receipt-divider"></div><div class="wx-receipt-price-label">價值</div><div class="wx-receipt-price" id="wxGiftPrice">¥0</div><div class="wx-receipt-btn-group" id="wxGiftBtnGroup" style="display:none;"><div class="wx-receipt-btn-accept" id="wxGiftAccept">收下禮物</div><div class="wx-receipt-btn-refuse" id="wxGiftRefuse">殘忍拒絕</div></div><div class="wx-receipt-close" id="wxGiftClose" onclick="document.getElementById('wxGiftOverlay').classList.remove('show')">關閉</div></div></div></div>
                    <div class="wx-transfer-overlay" id="wxTransferOverlay" onclick="${app}.closeTransfer()"><div class="wx-transfer-box" onclick="event.stopPropagation()"><div class="wx-transfer-header"><div class="wx-transfer-icon"><i class="fa-solid fa-check"></i></div><div style="font-size:14px;" id="wxTransferState">待收款金額</div><div class="wx-transfer-amount" id="wxTransferAmount">¥0.00</div></div><div class="wx-transfer-actions"><button class="wx-btn-receive" id="wxBtnReceive" onclick="">確認收款</button><button class="wx-btn-return" id="wxBtnReturn" onclick="">退回轉帳</button><div style="font-size:12px; color:#6b6b6b; margin-top:5px;">收款後將存入餘額</div></div></div></div>
                    <div class="wx-rp-overlay" id="wxRedPacketOverlay" onclick="this.classList.remove('show')"><div class="wx-rp-box" onclick="event.stopPropagation()"><div class="wx-rp-header"><div class="wx-rp-avatar" id="wxRpAvatar"></div><div class="wx-rp-sender" id="wxRpSender">的紅包</div><div class="wx-rp-memo" id="wxRpMemo">恭喜發財，大吉大利</div></div><div class="wx-rp-divider"></div><div class="wx-rp-info" id="wxRpInfoBar">暫無人領取</div><div class="wx-rp-list" id="wxRpList"></div><div class="wx-rp-close" onclick="document.getElementById('wxRedPacketOverlay').classList.remove('show')">關閉</div></div></div>

                    <div class="wx-footer-wrapper" style="display:${inputDisplay}">
                        <div class="wx-replying hidden" id="wxReplying"><div class="wx-replying-body"><span class="chat-quote-name" id="wxReplyingName"></span><span class="chat-quote-text" id="wxReplyingText"></span></div><span class="wx-replying-x" onclick="${app}.cancelQuote()"><i class="fa-solid fa-xmark"></i></span></div>
                        <div class="wx-input-bar">
                            ${triggerBtn}
                            <input class="wx-input-real" placeholder="" oninput="${app}.onInputCheck(this)" onkeydown="${app}.onInputKey(event, this)">
                            <span class="wx-icon-btn" onclick="${app}.toggleStickerPanel()"><i class="fa-solid fa-face-smile"></i></span>
                            <span class="wx-icon-btn" onclick="${app}.togglePanel()"><i class="fa-solid fa-circle-plus"></i></span>
                            <div class="wx-send-btn" onclick="${app}.sendMsg(this)">发送</div>
                        </div>
                        <div class="wx-sticker-panel">
                            <div class="wx-stk-panel-header">
                                <div class="wx-stk-tabs-wrap" id="wxStickerTabs"></div>
                                <span class="wx-stk-manage-toggle" title="管理庫" onclick="(function(t){var a=t.closest('.wx-sticker-panel').querySelector('.wx-stk-manage-area');a.classList.toggle('open');var w=window.parent||window;if(w.WX_STICKER)w.WX_STICKER.renderManage();})(this)"><i class="fa-solid fa-gear"></i></span>
                            </div>
                            <div class="wx-sticker-grid" id="wxStickerGrid"></div>
                            <div class="wx-stk-manage-area">
                                <div class="wx-stk-manage-inner">
                                    <div id="wxStickerManage"></div>
                                    <div class="wx-stk-import-row">
                                        <input class="wx-stk-url-input" id="wxStickerBaseUrl" placeholder="資料夾 URL（選填）如：https://cdn.com/stickers/">
                                        <label class="wx-stk-file-btn"><i class="fa-solid fa-upload"></i> 上傳 TXT<input type="file" accept=".txt" style="display:none" onchange="var w=window.parent||window;if(w.WX_STICKER)w.WX_STICKER.importFromFile(this)"></label>
                                    </div>
                                    <details style="margin-top:4px;">
                                        <summary style="font-size:11px; color:#aaa; cursor:pointer; user-select:none;"><i class="fa-solid fa-file-lines"></i> TXT 格式說明</summary>
                                        <div style="font-size:11px; color:#999; line-height:1.7; margin-top:4px; padding:6px 8px; background:#f9f9f9; border-radius:4px; border:1px solid #eee;">
                                            第一行：<code>library:庫名稱</code><br>
                                            之後每行：<code>顯示名稱:檔名.gif</code>（有資料夾 URL 時只填檔名）<br>
                                            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;或：<code>顯示名稱:https://完整URL</code>
                                        </div>
                                    </details>
                                </div>
                            </div>
                        </div>

                        <div class="wx-action-panel">
                            <div class="wx-scroll-view" onscroll="${app}.onScrollDot(this)">
                                <div class="wx-grid-page">
                                    <div class="wx-grid-item" onclick="${app}.action('photo')"><div class="wx-grid-icon"><i class="fa-solid fa-image"></i></div><div class="wx-grid-label">照片</div></div>
                                    <div class="wx-grid-item" onclick="${app}.action('video_file')"><div class="wx-grid-icon"><i class="fa-solid fa-video"></i></div><div class="wx-grid-label">視頻</div></div>
                                    <div class="wx-grid-item" onclick="${app}.action('voice_msg')"><div class="wx-grid-icon"><i class="fa-solid fa-microphone"></i></div><div class="wx-grid-label">語音</div></div>
                                    <div class="wx-grid-item" onclick="${app}.startCall()"><div class="wx-grid-icon"><i class="fa-solid fa-phone"></i></div><div class="wx-grid-label">通話</div></div>
                                    <div class="wx-grid-item" onclick="${app}.action('location')"><div class="wx-grid-icon"><i class="fa-solid fa-location-dot"></i></div><div class="wx-grid-label">定位</div></div>
                                    <div class="wx-grid-item" onclick="${app}.action('redpacket')"><div class="wx-grid-icon"><i class="fa-solid fa-money-bill-wave"></i></div><div class="wx-grid-label">紅包</div></div>
                                    <div class="wx-grid-item" onclick="${app}.action('transfer')"><div class="wx-grid-icon"><i class="fa-solid fa-money-bill-transfer"></i></div><div class="wx-grid-label">轉帳</div></div>
                                    <div class="wx-grid-item" onclick="${app}.action('file_card')"><div class="wx-grid-icon"><i class="fa-solid fa-folder-open"></i></div><div class="wx-grid-label">文件</div></div>
                                </div>
                                <div class="wx-grid-page">
                                    <div class="wx-grid-item" onclick="${app}.action('gift')"><div class="wx-grid-icon"><i class="fa-solid fa-gift"></i></div><div class="wx-grid-label">禮物</div></div>
                                </div>
                            </div>
                            <div class="wx-dots" id="wxPanelDots"><div class="wx-dot active"></div><div class="wx-dot"></div></div>
                        </div>
                    </div>

                    <div class="wx-bottom-nav" style="display:${tabDisplay}; ${darkTabStyle}">
                        <div class="wx-tab ${activeTab === 'chat' ? 'active' : ''}" onclick="${app}.switchTab('chat')">
                            <div class="wx-tab-icon-box">
                                ${chatBadgeHTML}
                                <div class="wx-tab-icon">${iconChat}</div>
                            </div>
                            <div class="wx-tab-txt">聊天</div>
                        </div>
                        <div class="wx-tab ${(activeTab === 'contacts' || activeTab.indexOf('c_') === 0) ? 'active' : ''}" onclick="${app}.switchTab('contacts')">
                            <div class="wx-tab-icon-box">
                                <div class="wx-tab-icon">${iconContact}</div>
                            </div>
                            <div class="wx-tab-txt">通訊錄</div>
                        </div>
                        <div class="wx-tab ${activeTab === 'discover' ? 'active' : ''}" onclick="${app}.switchTab('discover')">
                            <div class="wx-tab-icon-box">
                                <div class="wx-tab-dot"></div>
                                <div class="wx-tab-icon">${iconDiscover}</div>
                            </div>
                            <div class="wx-tab-txt">發現</div>
                        </div>
                        <div class="wx-tab ${(activeTab === 'me' || activeTab === 'me_set') ? 'active' : ''}" onclick="${app}.switchTab('me')">
                            <div class="wx-tab-icon-box">
                                <div class="wx-tab-icon">${iconMe}</div>
                            </div>
                            <div class="wx-tab-txt">我</div>
                        </div>
                    </div>

                </div>
            `;
            
            // --- 7. 啟動異步圖片加載 ---
            setTimeout(() => {
                const win = window.parent || window;
                if (!win.OS_DB) return;

                // A. 加載背景圖
                if (bgDbId) {
                    win.OS_DB.getImage(bgDbId).then(url => {
                        const bgLayer = doc.getElementById('wx-room-bg-layer');
                        if (bgLayer && url) {
                            bgLayer.style.backgroundImage = `url('${url}')`;
                            const room = doc.getElementById('wx-current-room-bg');
                            if (room) room.classList.add('has-bg');
                        }
                    });
                }
                
                // B + C. 頭像（圖庫的與 VN 串接的）→ 走共用那一支
                this.hydrateAvatars(doc);
            }, 50);

            return html;
        }
    };
})();