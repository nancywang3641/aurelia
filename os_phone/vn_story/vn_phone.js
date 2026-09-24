// ----------------------------------------------------------------
// [檔案] vn_phone.js (獨立擴充模組)
// 路徑：os_phone/vn_story/vn_phone.js
// 職責：處理 VN 播放器中的特殊面板 (手機 Chat / Call 模式)
// ⚠️ 請確保在載入 vn_core.js 之後載入此檔案
// ----------------------------------------------------------------
(function () {
    console.log('[PhoneOS] 載入 VN 手機模式模組 (Chat/Call 擴展 + SFX + 世界書頭像支援)...');
    const win = window.parent || window;

    const VN_Phone = {
        chatParticipants: [], 
        isGroupChat: false, 
        currentChatroom: '',   // 當前聊天室「接續 key」= id 優先、退回房名（非顯示名；標題另顯示房名）
        chatroomCache: {},     // key(id優先/房名) → chat-body innerHTML，斷開後同 key 接回（續接）
        isCallActive: false,
        currentCallKey: '',    // 當前通話「接續 key」= id優先/名轉id/名；★不在 resetState 清(跨輪續接)，演劇情(renderVN)/進chat 才清
        _callBuffer: null,     // 本段通話累積的 [Char] 台詞，離開通話時 flush 進統一記憶(OS_DB)
        _callMsgId: null,      // 本段通話來源訊息 id，去重防回放/重整重複寫
        _callName: '',         // 通話對方顯示名(寫記憶 rec.name 用)
        _callTimer: null,      // 通話計時 setInterval handle
        _callSec: 0,           // 通話已計秒數

        resetState: function() {
            this.chatParticipants = [];
            this.chatOwner = '';
            this.isGroupChat = false;
            this.currentChatroom = '';
            this.chatroomCache = {};
            this.isCallActive = false;
            this._stopCallTimer(); this._callSec = 0;
        },

        // ==========================================
        //  📱 Chat 模式邏輯
        // ==========================================
        initChat: function(core, line) {
            core.mode = 'chat';
            this.currentCallKey = '';   // 進聊天室＝劇情離開通話 → 之後同人來電要正常響鈴(不誤判續接)
            const newName = line.match(/chatroom="([^"]+)"/)?.[1] || 'Chat';
            const newId   = line.match(/\bid\s*=\s*"([^"]+)"/)?.[1] || '';   // VN PHONE <chat ... id="穩定id"> 的接續 id
            const newKey  = newId || newName;   // 接續 key：ID 優先（AI 改群名也接得回同一間），沒 id 才退回房名
            // 📱 誰的手機（右邊泡泡）：owner="名" 屬性明寫才換視角；沒寫＝主角。不再看 [With] 的排序（AI 守不住順序）
            this.chatOwner = (line.match(/\bowner\s*=\s*"([^"]*)"/)?.[1] || '').trim();
            // AI 在主角狀態裡自己寫的主角名（常是簡體、不帶星號，跟人設名對不上）也算「我」
            try { const M = win.OS_MC_STATUS; if (M && M.load) M.load().then(st => { this._mcAlias = (st && st.name) ? String(st.name).trim() : ''; }).catch(() => {}); } catch (e) {}
            // 🚨 畫面上不准出現協議字串：AI 常把 chatroom 寫成 msg_chen、grp_01 這種代號（她：「很無語」）。
            //    代號就先掛著，等下一行 [With: …] 進來再換成人名（見下面 _titleFromWith）。
            this._roomSlug = /^[A-Za-z0-9_\-.]+$/.test(newName) ? newName : '';
            document.getElementById('chat-title').innerText = newName;       // 標題永遠顯示房名（給玩家看）
            // 黑夜模式跟聊天 app 那顆同一個開關（顏色本身掛在整頁上，這裡只補外殼那個 class 給既有的深色規則用）
            try { document.getElementById('phone-chat').classList.toggle('wx-dark', localStorage.getItem('wx_dark_mode') === 'true'); } catch (e) {}

            if (newKey !== this.currentChatroom) {
                if (this.currentChatroom) {
                    this.chatroomCache[this.currentChatroom] = document.getElementById('chat-body').innerHTML;
                }
                const chatBody = document.getElementById('chat-body');
                chatBody.innerHTML = this.chatroomCache[newKey] || '';
                this.currentChatroom = newKey;
            }
            // 泡泡主題：這間聊天室對到哪個聯絡人，就吃他在微信那邊設好的泡泡——同一個人，兩邊長一樣。
            // 對不到人（群聊、路人）看這間自己在「···」裡從主題庫挑過沒有，都沒有才回預設，不會留著上一間的皮。
            try { const B = win.WX_BUBBLE_SETTINGS; if (B && B.applyStyleForRoom) B.applyStyleForRoom(newName, newKey); } catch (e) {}
            // 背景同理：對得到聯絡人就用他在微信那邊的聊天背景，對不到才用這裡自己挑的那張
            try { const P = window.VN_Panels || win.VN_Panels; if (P && P.applyChatBgForRoom) P.applyChatBgForRoom(newName, newKey); } catch (e) {}
            core.toggleUI('phone-chat');
            core.next();
        },

        exitChat: function(core) {
            if (this.currentChatroom) {
                this.chatroomCache[this.currentChatroom] = document.getElementById('chat-body').innerHTML;
            }
            core.mode = 'vn';
            core.toggleUI('vn');
            core.next();
        },

        // 用戶手動按返回鍵 → 跳過剩餘 chat 內容，銜接後續對話
        closeChat: function(core) {
            if (this.currentChatroom) {
                this.chatroomCache[this.currentChatroom] = document.getElementById('chat-body').innerHTML;
            }
            let foundEnd = false;
            for (let i = core.index + 1; i < core.script.length; i++) {
                if (core.script[i].startsWith('</chat>')) {
                    core.index = i - 1;
                    foundEnd = true;
                    break;
                }
            }
            if (!foundEnd) core.index = core.script.length - 1;
            core.mode = 'vn';
            core.toggleUI('vn');
            core.next();
        },

        handleChatLine: async function(line, core) {
            core.toggleUI('phone-chat');
            const chatBody = document.getElementById('chat-body');

            // 確保世界書頭像映射已經載入
            if (!core._lorebookLoaded) {
                await core._loadLorebookAvatars();
                core._lorebookLoaded = true;
            }

            if (line.startsWith('[With:')) {
                this.chatParticipants = line.slice(6, -1).split(',').map(s => s.trim()).filter(Boolean);
                this.isGroupChat = this.chatParticipants.length > 2;
                if (this._roomSlug) this._titleFromWith();
                core.next(); return;
            }
            if (line.startsWith('[Time]') || line.match(/^\[Time[：:]/i)) {
                const t = line.replace(/^\[Time[：:\]]\s*/i,'').replace(/\]$/,'').trim();
                this._time(chatBody, t);
                this.scrollChat(); core.checkAutoNext(); return;
            }
            // TTIME 格式：[22:45] 純時間標記
            if (line.match(/^\[\d{1,2}:\d{2}\]$/)) {
                const t = line.slice(1, -1);
                this._time(chatBody, t);
                this.scrollChat(); core.checkAutoNext(); return;
            }
            // 💸 收下轉帳／退回／代付這幾句，寫法是「[誰] [系統: 動作 金額|單號]」。
            //    那是給程式看的句子，不是講給人聽的話 —— 照原樣印出來，她畫面上就會出現
            //    一行「Accept 2000.00|ZJZQ20230625」（她：「VN_PHONE這格式好像不會在VN_PHONE面板上顯示」）。
            //    這裡把它翻成人看得懂的那一句，順便把上面那張轉帳卡翻成已收款／已退回。
            //    🚨 劇情裡的手機只管畫面：錢包那邊由跑團同步自己算（見 wx_core 的「劇情裡的錢」），
            //       這裡碰錢包的話同一筆會被算兩次。
            const _payV = line.match(/^(?:\[[^\]]+\]\s*)?\[(?:系統|系统|System)[：:]\s*(Accept|Return|TakeoutPay|TakeoutDecline)\b[\s|]*([^\]]*)\]/i);
            if (_payV) {
                const verb = _payV[1].toLowerCase();
                const args = String(_payV[2] || '').split('|').map(function (x) { return x.trim(); });
                const isMoney = (verb === 'accept' || verb === 'return');
                const amt = isMoney ? (args[0] || '') : '';
                const id  = args[args.length - 1] || '';
                if (isMoney) {
                    const esc = function (v) { return String(v).replace(/"/g, ''); };
                    let card = id ? chatBody.querySelector('.wx-tf-card[data-tf-id="' + esc(id) + '"]') : null;
                    if (!card && amt) {
                        const same = chatBody.querySelectorAll('.wx-tf-card[data-tf-amt="' + esc(amt) + '"]');
                        card = same.length ? same[same.length - 1] : null;
                    }
                    // 卡片跟微信同一張，翻成已收款／已退還也用微信那邊的字（WX_VIEW.markTransfer）
                    const WV = win.WX_VIEW || window.WX_VIEW;
                    if (card && WV && WV.markTransfer) {
                        const row = card.closest('.wx-msg-row');
                        WV.markTransfer(card, verb, !!(row && row.classList.contains('me')));
                    }
                }
                const say = verb === 'accept' ? ('已收款' + (amt ? ' ¥' + amt : ''))
                          : verb === 'return' ? ('已退回' + (amt ? ' ¥' + amt : ''))
                          : verb === 'takeoutpay' ? '已幫忙付款'
                          : '沒有幫忙付款';
                this._sys(chatBody, say);
                this.scrollChat(); core.checkAutoNext(); return;
            }

            // 👥 群聊標籤 [Kick:] [Leave:] [Join:] [Mute:] [Unmute:]：認法與顯示的字跟聊天 app 共用（wx_core WX_GROUP_EV）。
            //    只在群聊顯示；寫在私聊裡是寫錯地方，跳過。[Rename:] 由聊天 app 那邊改名，這裡不印出原始格式。
            const GE = win.WX_GROUP_EV || window.WX_GROUP_EV;
            const _gev = GE && GE.parse ? GE.parse(line) : null;
            if (_gev) {
                if (this.isGroupChat) { this._sys(chatBody, _gev.text); this.scrollChat(); core.checkAutoNext(); }
                else core.next();
                return;
            }
            if (/^\[\s*Rename\s*[:：]/i.test(line)) { core.next(); return; }

            // 系統/旁白訊息：容忍 AI 常見變體 ——
            //   1) 整行開頭即標籤：[系统] 描述 / [系統：描述]
            //   2) 被多包一層說話人名：[丹尼尔] [系统] 描述（AI 把「媒體前奏帶人名」規則誤用到系統訊息上）
            //   3) 繁簡混用（系統/系统）、全半形冒號、描述在括號內外都吃
            const _sysWrap = line.match(/^(?:\[[^\]]+\]\s*)?\[(?:系統|系统|System|旁白|Narrator)([：:\]])([\s\S]*)$/i);
            if (_sysWrap) {
                const t = (_sysWrap[1] === ']' ? _sysWrap[2] : _sysWrap[2].replace(/\]\s*$/, '')).trim();
                // 刪好友、拉黑、朋友驗證、被拒收是私聊的事，群裡出現就跳過（聊天 app 那邊同樣不收）
                if (this.isGroupChat && GE && GE.privateOnly && GE.privateOnly(t)) { core.next(); return; }
                this._sys(chatBody, t);
                this.scrollChat(); core.checkAutoNext(); return;
            }

            const match = line.match(/^\[([^\]]+)\]\s*([\s\S]*)/);
            if (match) {
                const sender = match[1].trim();
                const content = match[2].trim();
                // 只有 [XXXX] 沒有後續內容 → 視為系統提示
                if (content === '') {
                    this._sys(chatBody, sender);
                    this.scrollChat(); core.checkAutoNext(); return;
                }
                if (/^(系統|系统|System|旁白|Narrator)$/i.test(sender)) {
                    this._sys(chatBody, content);
                } else {
                    // 右邊泡泡＝①You/主角/我/使用者人設名 ②<chat owner="名"> 點名的人。[With] 只當名單，順序不算數
                    const mc = (win.OS_PERSONA && win.OS_PERSONA.getName && win.OS_PERSONA.getName()) || (win.OS_API && win.OS_API.getGlobalUserName && win.OS_API.getGlobalUserName()) || '';
                    const bare = s => String(s || '').replace(/^[*＊_]+|[*＊_]+$/g, '').trim();
                    const isMe = /^(You|主角|我|User|Self|Me)$/i.test(sender)
                        || (!!mc && mc !== 'User' && (sender === mc || bare(sender) === bare(mc)))
                        || (!!this._mcAlias && (sender === this._mcAlias || bare(sender) === bare(this._mcAlias)))
                        || (!!this.chatOwner && sender === this.chatOwner);
                    // 引用回覆：標記在內容最前面，解析跟微信共用同一份（OS_API.chatQuote）。
                    // 引用完後面沒東西就當它沒引用。灰塊只掛在被貼圖切開後的第一個泡泡上。
                    const _qp = (win.OS_API && win.OS_API.chatQuote) ? win.OS_API.chatQuote.parse(content) : null;
                    const _hasQ = !!(_qp && _qp.name && _qp.text && _qp.rest);
                    const body = _hasQ ? _qp.rest : content;
                    const parts = this._splitStickerContent(body);
                    parts.forEach((part, pi) => {
                        const q = (_hasQ && pi === 0) ? { name: _qp.name, text: _qp.text } : null;
                        chatBody.insertAdjacentHTML('beforeend', this._buildChatBubbleHTML(sender, part, isMe, core, q));
                    });
                    // 頭像跟聊天 app 同一支貼：她在聊天 app 設的照片、劇情生過存起來的都在這裡補上
                    try { const WV = win.WX_VIEW || window.WX_VIEW; if (WV && WV.hydrateAvatars) WV.hydrateAvatars(chatBody); } catch (e) {}
                    core.addLog(sender, body);
                }
                this.scrollChat();
            }
            core.checkAutoNext();
        },

        scrollChat: function() {
            const cb = document.getElementById('chat-body');
            if(cb) cb.scrollTop = cb.scrollHeight;
        },

        // ───────── 廣義 tag 辨識器（防 AI 自創變體）─────────
        // 任何 tag 名含這些 substring 就當該類型，未來不用再加新 regex
        _IMAGE_ALIAS: ['圖片','图片','圖像','图像','圖檔','图档','圖示','图示','插圖','插图','照片','畫面','画面','截圖','截图','圖','图','Image','Img','Photo','Pic','Picture','Screen','Snapshot','Screenshot','Screencap','Snap','Capture','Capt'],
        _VOICE_ALIAS: ['語音','语音','錄音','录音','Voice','Audio','Recording'],
        _STICKER_ALIAS: ['表情包','貼紙','贴纸','表情','Sticker','Emote'],
        _LINK_ALIAS: ['鏈接','链接','連結','连结','鏈結','网址','網址','網頁','网页','Link','URL','Url'],
        _FILE_ALIAS: ['文件','檔案','档案','附件','File','Document','Attachment'],
        _isAliasTag: function(content, aliases) {
            const m = content.match(/^\[([^\]\[:：]+)[：:]/);
            if (!m) return false;
            const tag = m[1].trim();
            return aliases.some(a => tag.toLowerCase().includes(a.toLowerCase()));
        },
        _normalizeImageTag: function(content) {
            // 任何「[X含圖/Image/Photo/Screen/...: 描述]」統一改成 [圖片: 描述]
            if (this._isAliasTag(content, this._IMAGE_ALIAS)) {
                const m = content.match(/^\[[^\]\[:：]+[：:]\s*([\s\S]*?)\]$/);
                if (m) return `[圖片: ${m[1]}]`;
            }
            return content;
        },
        // 語音、檔案 AI 常自創寫法（[錄音: …]、[附件: …]）→ 換成微信認得的 [語音:]、[文件:]，不然整條變成裸文字
        _normalizeAliasTags: function(content) {
            const m = content.match(/^\[[^\]\[:：]+[：:]\s*([\s\S]*?)\]$/);
            if (!m) return content;
            if (this._isAliasTag(content, this._VOICE_ALIAS)) return `[語音: ${m[1]}]`;
            if (this._isAliasTag(content, this._FILE_ALIAS)) return `[文件: ${m[1]}]`;
            return content;
        },

        // 把混在文字裡的「圖片/語音/表情包」tag 拆成單獨一條（描述式 [X: 描述] 或檔案式 [x.gif] 都拆）
        // 例: "加油！[表情包: 小猫打滚]" → ["加油！","[表情包: 小猫打滚]"]；"我到了[图片: 街道照]" → ["我到了","[图片: 街道照]"]
        // 通用：抓任何 [別名: 描述]，用 _isAliasTag 判類型，只拆三類媒體；[文件:]/[22:35] 等非媒體不動。
        _SPECIAL_CARD_RE: /^\[(轉賬|转账|Transfer|Gift|禮物|礼物|紅包|红包|RedPacket|視頻|视频|Video|位置|Location|定位|收款码|收款碼|收款|付款码|付款碼|TakeoutAsk|Takeout|外送代付|外賣代付|外卖代付|代付|外送|外賣|外卖)[：:]/i,
        _splitStickerContent: function(content) {
            // 轉賬/紅包/視頻/位置/收款碼這些判定卡也拆：AI 常把「[收款碼: 任意] 沒留。要不贊助點？」寫成一條，
            // 卡跟話黏在一起 buildBubble 的 ^\[…\]$ 就對不上，整條變成原始文字。卡自己一條、話自己一條。
            if (content.startsWith('[撤回]')) return [content];

            const re = /\[[^\]\[：:]+[：:][^\]]*\]|\[[^\]]+\.(?:gif|jpg|jpeg|png)\]/gi;
            if (!re.test(content)) return [content];
            re.lastIndex = 0;

            const parts = [];
            let last = 0, m;
            while ((m = re.exec(content)) !== null) {
                const tag = m[0];
                const isFile = /\.(?:gif|jpg|jpeg|png)\]$/i.test(tag) && !/[：:]/.test(tag);
                const isStk  = this._isAliasTag(tag, this._STICKER_ALIAS);
                const isSpecial = this._SPECIAL_CARD_RE.test(tag);   // 轉賬/紅包/視頻/位置/收款碼 判定卡
                const isMedia = isFile || isStk ||
                    this._isAliasTag(tag, this._IMAGE_ALIAS) ||
                    this._isAliasTag(tag, this._VOICE_ALIAS) ||
                    this._isAliasTag(tag, this._LINK_ALIAS) ||
                    this._isAliasTag(tag, this._FILE_ALIAS);   // [文件:xxx] 也拆成獨立卡(buildBubble fileM 渲染文件卡)
                if (!isMedia && !isSpecial) continue;   // 非媒體 tag（[22:35] 時間戳等）→ 不拆、留在文字裡

                const before = content.slice(last, m.index).trim();
                if (before) parts.push(before);
                if (isFile) {
                    const fname = tag.slice(1, -1);
                    const base = (window.VN_Config?.data?.stickerBase || '').replace(/\/?$/, '/');
                    parts.push(`[表情包:${base ? base + fname : fname}]`);
                } else if (isStk) {
                    const aliasM = tag.match(/^\[[^\]\[：:]+[：:]\s*([\s\S]*?)\]$/);
                    parts.push(`[表情包: ${aliasM ? aliasM[1].trim() : tag}]`);   // 表情包正規化成 stkM 認得的形式
                } else {
                    parts.push(tag);   // 圖片/語音 描述式 → 原樣（buildBubble 會 normalize + 渲染）
                }
                last = m.index + m[0].length;
            }
            const rest = content.slice(last).trim();
            if (rest) parts.push(rest);
            return parts.length > 0 ? parts : [content];
        },


        // chatroom 是代號的時候，標題拿 [With] 裡的人名頂上：私聊＝對方那一個，群＝前兩個＋…
        _titleFromWith: function () {
            const el = document.getElementById('chat-title');
            if (!el) return;
            const mc = (win.OS_PERSONA && win.OS_PERSONA.getName && win.OS_PERSONA.getName())
                || (win.OS_API && win.OS_API.getGlobalUserName && win.OS_API.getGlobalUserName()) || '';
            const bare = function (x) { return String(x || '').replace(/^[*＊_]+|[*＊_]+$/g, '').trim(); };
            const self = this;
            const others = (this.chatParticipants || []).filter(function (n) {
                if (/^(You|主角|我|User|Self|Me)$/i.test(n)) return false;
                if (mc && mc !== 'User' && (n === mc || bare(n) === bare(mc))) return false;
                if (self._mcAlias && (n === self._mcAlias || bare(n) === bare(self._mcAlias))) return false;
                return true;
            });
            if (!others.length) return;
            el.innerText = others.length === 1 ? others[0]
                : (others.slice(0, 2).join('、') + (others.length > 2 ? ' 等 ' + others.length + ' 人' : ''));
        },

        // 🙋 聊天 app 裡對得到這個人嗎：拿他在聊天 app 的那一間（頭像、她那邊的頭像都記在那一間上）
        _wxChatByName: function (name) {
            const n = String(name || '').replace(/^[*＊_]+|[*＊_]+$/g, '').trim();
            if (!n) return null;
            try {
                const G = (win.wxApp && win.wxApp.GLOBAL_CHATS) || {};
                const B = win.WX_BUBBLE_SETTINGS;
                const id = (B && B._contactIdByName) ? B._contactIdByName(n) : '';
                if (id && G[id]) return G[id];
                const k = Object.keys(G).find(function (x) { const c = G[x]; return c && !c.isGroup && (c.name === n || c.realName === n); });
                return k ? G[k] : null;
            } catch (e) { return null; }
        },

        // 系統提示／時間：跟聊天 app 同一種樣子（一行淡灰字，有背景圖時自己帶一塊底）
        _sys: function (chatBody, text) {
            chatBody.insertAdjacentHTML('beforeend', `<div class="wx-system-notice">${text}</div>`);
        },
        _time: function (chatBody, text) {
            chatBody.insertAdjacentHTML('beforeend', `<div class="wx-time-stamp">${text}</div>`);
        },

        // 📱 整則訊息交給聊天 app 那支畫（WX_VIEW.renderBubble）：頭像、泡泡、卡片、語音、群聊人名、引用全部同一份，
        //    同一個人在劇情裡跟打開聊天 app 看到的長一樣。以前這裡自己畫一套，轉帳、紅包、語音、頭像都不一樣，很出戲。
        //    帶 _static＝只借長相：不碰帳本、不存紅包、點了不開窗，錢照舊由跑團同步那層算。
        //    頭像的順序也照聊天 app：她在聊天 app 幫他設的照片 → 世界書 → 劇情這次生的 → 劇情以前生過存起來的 → 預設頭像。
        _buildChatBubbleHTML: function(sender, content, isMe, core, quote) {
            // 任何圖片／語音／檔案的變體先 normalize 成聊天 app 認得的那個字（[圖片:]、[語音:]、[文件:]）
            content = this._normalizeAliasTags(this._normalizeImageTag(content));
            const WV = win.WX_VIEW || window.WX_VIEW;
            if (!WV || !WV.renderBubble) {
                const esc = String(content).replace(/</g, '&lt;');
                return `<div class="wx-msg-row ${isMe ? 'me' : 'you'} pbub-row ${isMe ? 'pbub-me' : 'pbub-other'}"><div class="wx-bubble-avatar pbub-avatar"></div><div class="pbub-wrap wx-bubble-wrap"><div class="wx-bubble-content pbub-bubble">${esc}</div></div></div>`;
            }
            const roomName = (document.getElementById('chat-title') || {}).innerText || '';
            const room = this._wxChatByName(roomName);
            const person = isMe ? null : this._wxChatByName(sender);
            // 用別人的手機當視角（owner="名"）時，右邊那顆是那個角色：頭像拿他的，不是她的
            const owner = this.chatOwner ? this._wxChatByName(this.chatOwner) : null;
            const chatObj = {
                id: '', name: sender, realName: sender, isGroup: !!this.isGroupChat,
                customAvatar: (person && person.customAvatar) || '',
                userAvatar: this.chatOwner ? ((owner && owner.customAvatar) || '') : ((room && room.userAvatar) || ''),
                userVnName: this.chatOwner || ''
            };
            const msg = {
                content: content, isMe: !!isMe, sender: sender,
                recalled: content.startsWith('[撤回]'),
                quoteName: quote ? quote.name : '', quoteText: quote ? quote.text : '',
                _static: { peer: roomName, voiceClick: 'event.stopPropagation(); window.VN_Phone._voiceTap(this)' }
            };
            return WV.renderBubble(msg, chatObj, false);
        },

        // 點語音訊息：字的展開跟微信同一支（WX_VIEW.voiceReveal），另外照劇情的語音設定念出來
        //   （跟通話/正文同款：當前開哪個引擎就念哪個；沒指派音色就無聲）。收起來那一下不念。
        _voiceTap: function(el) {
            if (!el) return;
            const sender = el.dataset.vsender || '';
            const text = el.dataset.vtext || '';
            if (!text) return;
            const WV = win.WX_VIEW || window.WX_VIEW;
            const opened = WV && WV.voiceReveal ? WV.voiceReveal(el, text) : true;
            if (!opened) { el.classList.remove('is-playing'); return; }
            // 音波跟著「秒數」動，跟語音引擎有沒有真的在放無關（引擎那邊沒有結束回呼可接）
            try {
                if (this._voiceTimer) { clearTimeout(this._voiceTimer); if (this._voiceEl) this._voiceEl.classList.remove('is-playing'); }
                el.classList.add('is-playing'); this._voiceEl = el;
                const sec = Math.min(60, Math.max(2, parseInt(el.dataset.vsec || '3', 10)));
                this._voiceTimer = setTimeout(() => { el.classList.remove('is-playing'); this._voiceTimer = null; this._voiceEl = null; }, sec * 1000);
            } catch (e) {}
            const core = win.VN_Core || (win.parent && win.parent.VN_Core);
            try { if (core && core._vnSoVITSPlay) core._vnSoVITSPlay(sender, text, '', ''); } catch (e) {}
            try { const mm = win.OS_MINIMAX || (win.parent && win.parent.OS_MINIMAX); if (mm && mm.playForChar) mm.playForChar(sender, text, { expression: '' }); } catch (e) {}
        },

        // ==========================================
        //  📞 Call 模式邏輯
        // ==========================================
        initCall: function(core, line) {
            core.mode = 'call';
            const caller = line.match(/character="([^"]+)"/)?.[1] || 'Unknown';
            const idAttr = line.match(/\bid\s*=\s*"([^"]+)"/)?.[1] || '';
            const newKey = idAttr || this._resolveContactId(caller) || caller;   // 接續 key：id 優先 → 名轉聯絡人id → 名
            document.getElementById('call-name').innerText = caller;
            core.updateCallAvatar(caller);
            this._callBuffer = []; this._callMsgId = (core && core._currentMessageId) || null; this._callName = caller;   // 本段通話台詞緩衝(離開時寫統一記憶)

            // 🔗 接續：同一通電話被 AI 拆成兩段輸出（id/名 同、中間沒劇情/聊天打斷）→ 不重新「來電」，直接續接通話畫面。
            //    治「一鏡到底沒做到→每段都跳接聽介面、要反覆接通」。currentCallKey 由 renderVN 演劇情 / initChat 進聊天時清掉，
            //    所以「劇情過後的另一通同人電話」仍會正常響鈴。
            if (newKey && newKey === this.currentCallKey) {
                this.currentCallKey = newKey;
                this.answerCall(core);   // 直接進通話中、往下播，不等使用者按接聽
                return;
            }
            this.currentCallKey = newKey;

            // 新來電：顯示來電 + 接聽/掛斷，等使用者接
            this.isCallActive = false;
            this._callSec = 0;   // 新來電從 00:00 起算(續接不重置→沿用上段秒數)
            const st = document.getElementById('call-status');
            st.innerText = '來電';
            st.className = '';
            document.getElementById('call-incoming-btns').classList.remove('hidden');
            document.getElementById('call-active-btns').classList.add('hidden');
            const subBox = document.getElementById('call-subtitle-box');
            subBox.classList.add('hidden');
            document.getElementById('call-sub-text').innerHTML = '';
            document.getElementById('call-sub-name').innerHTML = '';
            core.toggleUI('phone-call');
        },
        // 把通話對方角色名解析成聯絡人 id（讀-only，跟電話app/微信同一個 id 空間；查不到回空→退回用名當 key）
        _resolveContactId: function(name) {
            try {
                const C = (window.parent || window).WX_CONTACTS;
                const list = (C && C.getAllCustomContacts) ? C.getAllCustomContacts() : [];
                const hit = (list || []).find(function (c) { return c && c.name === name; });
                return (hit && hit.id) || '';
            } catch (e) { return ''; }
        },

        exitCall: function(core) {
            this._stopCallTimer();     // 離開通話→停計時(續接時 _callSec 仍保留，下段沿用)
            this._flushCallMemory();   // 離開通話(含掛斷/拒接都會走到這)→把台詞寫進統一記憶
            document.getElementById('phone-call').classList.remove('call-active');
            core.mode = 'vn';
            core.toggleUI('vn');
            core.next();
        },

        // ── 通話計時 ──────────────────────────────────────────────
        _fmtCallTime: function() {
            const s = this._callSec || 0;
            return '通話中 ' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
        },
        _startCallTimer: function() {
            const self = this;
            if (this._callTimer) { clearInterval(this._callTimer); }
            const st = document.getElementById('call-status');
            if (st) st.innerText = this._fmtCallTime();   // 立刻顯示當前秒數(續接沿用)
            this._callTimer = setInterval(function () {
                self._callSec = (self._callSec || 0) + 1;
                const e = document.getElementById('call-status');
                if (e) e.innerText = self._fmtCallTime();
            }, 1000);
        },
        _stopCallTimer: function() {
            if (this._callTimer) { clearInterval(this._callTimer); this._callTimer = null; }
        },

        // 把本段通話的 [Char] 台詞寫進「統一記憶」OS_DB.getApiChat(callId)，電話app/微信看得到（與 dialer 同一份）。
        //   去重：同一來源訊息(msgId)的通話已寫過就跳過（防回放/重整重複堆）。
        _flushCallMemory: function() {
            try {
                const lines = this._callBuffer;
                this._callBuffer = null;
                if (!Array.isArray(lines) || !lines.length) return;
                const callId = this.currentCallKey;
                if (!callId) return;
                const callName = this._callName || callId;
                const msgId = this._callMsgId;
                const OS_DB = (window.parent || window).OS_DB;
                if (!OS_DB || !OS_DB.getApiChat || !OS_DB.saveApiChat) return;
                (async () => {
                    try {
                        const rec = (await OS_DB.getApiChat(callId)) || { id: callId, name: callName, members: [callName], isGroup: false, messages: [] };
                        if (!Array.isArray(rec.messages)) rec.messages = [];
                        if (msgId != null && rec.messages.some(function (m) { return m && m._vnCallMsgId === msgId; })) return;   // 這通已寫過 → 跳過(去重)
                        lines.forEach(function (l) {
                            rec.messages.push({ type: 'msg', isMe: !!l.isMe, content: l.text, sender: l.sender, senderName: l.sender, _vnCallMsgId: msgId, _viaCall: true });
                        });
                        if (!rec.name) rec.name = callName;
                        await OS_DB.saveApiChat(callId, rec);
                        console.log('[VN Call] 通話台詞寫進統一記憶 ' + callId + '（+' + lines.length + ' 句）');
                    } catch (e) { console.warn('[VN Call] 寫統一記憶失敗', (e && e.message) || e); }
                })();
            } catch (e) {}
        },
        // 判斷通話台詞的發話人是不是主角(寫記憶時 isMe)
        _isMeName: function(name) {
            try {
                const W = (window.parent || window);
                const mc = (W.OS_PERSONA && W.OS_PERSONA.getName && W.OS_PERSONA.getName()) || (W.OS_API && W.OS_API.getGlobalUserName && W.OS_API.getGlobalUserName()) || '';
                if (mc && name === mc) return true;
            } catch (e) {}
            return name === '主角' || name === '我' || name === 'You' || name === '{{user}}';
        },

        handleCallLine: function(line, core) {
            core.toggleUI('phone-call');
            if (line.startsWith('[Char|') || line.startsWith('[Nar|')) {
                const isChar = line.startsWith('[Char|');
                const box = document.getElementById('call-subtitle-box');
                const nameEl = document.getElementById('call-sub-name');
                // ⚠️ call 行不走 vn_core dispatch 的 [Char] 分支，得自己過 _normCharParts：
                //    自由模式 [Char|名|台詞] 沒表情格，不補的話 parts.slice(2) 是空的 → 台詞整句蒸發。
                let parts = line.slice(isChar ? 6 : 5, -1).split('|');
                if (isChar) parts = core._normCharParts(parts);

                if (isChar) {
                    const ex = core._extractTextAndSFX(parts.slice(2));
                    box.classList.remove('narration');
                    nameEl.style.display = 'block';
                    nameEl.innerText = parts[0];
                    document.getElementById('call-sub-text').innerHTML = core.parseMarkdown(ex.text);
                    core.addLog(parts[0], ex.text);
                    if (this._callBuffer) this._callBuffer.push({ sender: parts[0], text: ex.text, isMe: this._isMeName(parts[0]) });   // 收進統一記憶緩衝
                    core.playSFX(ex.sfx);
                    // 🔊 跟正文一樣：當前開哪個引擎就念哪個（SoVITS／MiniMax 各自看自己的開關）
                    (function(core2, charName, rawExp, text) {
                        let typeHint = '';
                        if (rawExp && rawExp.includes('_')) { const _p = rawExp.split('_'); typeHint = _p[0].trim(); rawExp = _p.slice(1).join('_').trim(); }
                        if (core2._vnSoVITSPlay) core2._vnSoVITSPlay(charName, text, core2._mapExprToEmotion(rawExp), typeHint);   // SoVITS 端在 _cleanTextForSoVITS 內已壓「」
                        const _mm = (window.parent || window).OS_MINIMAX;
                        if (_mm) _mm.playForChar(charName, (core2._speechOnly ? core2._speechOnly(text) : text), { expression: rawExp });   // 語音壓到「」內：混寫旁白不進 TTS
                    })(core, parts[0], parts[1] || '', ex.text);
                    // 🔮 預取下一句
                    (function prefetchNext(script, curIdx) {
                        const _mm = (window.parent || window).OS_MINIMAX;
                        if (!_mm?.prefetchForChar) return;
                        for (let i = curIdx + 1; i < script.length; i++) {
                            const nl = script[i];
                            if (nl.startsWith('[Char|')) {
                                const np = core._normCharParts(nl.slice(6, -1).split('|'));   // 跟播放端同一條，自由模式快取 key 才對得上
                                const nex = core._extractTextAndSFX(np.slice(2));
                                if (nex.text) _mm.prefetchForChar(np[0], (core._speechOnly ? core._speechOnly(nex.text) : nex.text), { expression: np[1] });   // 預取跟播放同文字，快取才對得上
                                break;
                            }
                            if (nl.startsWith('</call>') || nl.startsWith('[Choice|')) break;
                        }
                    })(core.script, core.index);
                } else {
                    const ex = core._extractTextAndSFX(parts);
                    box.classList.add('narration');
                    nameEl.style.display = 'none';
                    document.getElementById('call-sub-text').innerHTML = core.parseMarkdown(ex.text);
                    core.addLog("旁白", ex.text);
                    core.playSFX(ex.sfx);
                    if (core._vnNarrVoicePlay) core._vnNarrVoicePlay(ex.text);   // 旁白語音（當前旁白引擎，自帶開關）
                }
            }
            core.checkAutoNext();
        },

        answerCall: function(core) {
            this.isCallActive = true;
            const st = document.getElementById('call-status');
            st.classList.add('connected');
            this._startCallTimer();   // 接聽→計時開始跳秒
            document.getElementById('phone-call').classList.add('call-active');

            document.getElementById('call-incoming-btns').classList.add('hidden');
            document.getElementById('call-active-btns').classList.remove('hidden');
            document.getElementById('call-subtitle-box').classList.remove('hidden');
            core.next();
        },

        rejectCall: function(core) {
            document.getElementById('phone-call').classList.remove('call-active');
            let foundEnd = false;
            for (let i = core.index + 1; i < core.script.length; i++) {
                if (core.script[i].startsWith('</call>')) {
                    core.index = i - 1;
                    foundEnd = true;
                    break;
                }
            }
            if (!foundEnd) core.index = core.script.length - 1;
            core.next();
        },

        // 通話中按掛斷 → 跳過剩餘 call 內容，銜接後續對話
        hangUpCall: function(core) {
            this.isCallActive = false;
            document.getElementById('phone-call').classList.remove('call-active');
            let foundEnd = false;
            for (let i = core.index + 1; i < core.script.length; i++) {
                if (core.script[i].startsWith('</call>')) {
                    core.index = i - 1;
                    foundEnd = true;
                    break;
                }
            }
            if (!foundEnd) core.index = core.script.length - 1;
            core.mode = 'vn';
            core.toggleUI('vn');
            core.next();
        },

        // ==========================================
        //  📝 提供給 Skip 功能掃描紀錄使用
        // ==========================================
        scanLog: function(line, mode, core) {
            if (mode === 'chat') {
                const m = line.match(/^\[([^\]]+)\]\s*([\s\S]*)/);
                if (m) {
                    const sender = m[1].trim(), content = m[2].trim();
                    if (!/^(系統|系统|System|旁白|Narrator|Time)$/i.test(sender)) {
                        core.addLog(sender, content);
                    }
                }
            } else if (mode === 'call') {
                if (line.startsWith('[Char|')) {
                    const p = core._normCharParts(line.slice(6, -1).split('|'));   // 自由模式沒表情格，補齊欄位
                    const ex = core._extractTextAndSFX(p.slice(2));
                    core.addLog(p[0], ex.text);
                } else if (line.startsWith('[Nar|')) {
                    const p = line.slice(5, -1).split('|');
                    const ex = core._extractTextAndSFX(p);
                    core.addLog("旁白", ex.text);
                }
            }
        }
    };

    // 綁定到全域變數，供 vn_core 呼叫
    window.VN_Phone = VN_Phone;
})();