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
            document.getElementById('chat-title').innerText = newName;       // 標題永遠顯示房名（給玩家看）

            if (newKey !== this.currentChatroom) {
                if (this.currentChatroom) {
                    this.chatroomCache[this.currentChatroom] = document.getElementById('chat-body').innerHTML;
                }
                const chatBody = document.getElementById('chat-body');
                chatBody.innerHTML = this.chatroomCache[newKey] || '';
                this.currentChatroom = newKey;
            }
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
                core.next(); return;
            }
            if (line.startsWith('[Time]') || line.match(/^\[Time[：:]/i)) {
                const t = line.replace(/^\[Time[：:\]]\s*/i,'').replace(/\]$/,'').trim();
                chatBody.innerHTML += `<div class="chat-sys">${t}</div>`;
                this.scrollChat(); core.checkAutoNext(); return;
            }
            // TTIME 格式：[22:45] 純時間標記
            if (line.match(/^\[\d{1,2}:\d{2}\]$/)) {
                const t = line.slice(1, -1);
                chatBody.innerHTML += `<div class="chat-sys">${t}</div>`;
                this.scrollChat(); core.checkAutoNext(); return;
            }
            // 系統/旁白訊息：容忍 AI 常見變體 ——
            //   1) 整行開頭即標籤：[系统] 描述 / [系統：描述]
            //   2) 被多包一層說話人名：[丹尼尔] [系统] 描述（AI 把「媒體前奏帶人名」規則誤用到系統訊息上）
            //   3) 繁簡混用（系統/系统）、全半形冒號、描述在括號內外都吃
            const _sysWrap = line.match(/^(?:\[[^\]]+\]\s*)?\[(?:系統|系统|System|旁白|Narrator)([：:\]])([\s\S]*)$/i);
            if (_sysWrap) {
                const t = (_sysWrap[1] === ']' ? _sysWrap[2] : _sysWrap[2].replace(/\]\s*$/, '')).trim();
                chatBody.innerHTML += `<div class="chat-sys">${t}</div>`;
                this.scrollChat(); core.checkAutoNext(); return;
            }

            const match = line.match(/^\[([^\]]+)\]\s*([\s\S]*)/);
            if (match) {
                const sender = match[1].trim();
                const content = match[2].trim();
                // 只有 [XXXX] 沒有後續內容 → 視為系統提示
                if (content === '') {
                    chatBody.innerHTML += `<div class="chat-sys">${sender}</div>`;
                    this.scrollChat(); core.checkAutoNext(); return;
                }
                if (/^(系統|系统|System|旁白|Narrator)$/i.test(sender)) {
                    chatBody.innerHTML += `<div class="chat-sys">${content}</div>`;
                } else {
                    const me = this.chatParticipants[0] || 'You';
                    const isMe = (sender === me || sender === 'You' || sender === '主角' || sender === '我');
                    const parts = this._splitStickerContent(content);
                    for (const part of parts) {
                        chatBody.innerHTML += this._buildChatBubbleHTML(sender, part, isMe, core);
                    }
                    core.addLog(sender, content);
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

        // 把混在文字裡的「圖片/語音/表情包」tag 拆成單獨一條（描述式 [X: 描述] 或檔案式 [x.gif] 都拆）
        // 例: "加油！[表情包: 小猫打滚]" → ["加油！","[表情包: 小猫打滚]"]；"我到了[图片: 街道照]" → ["我到了","[图片: 街道照]"]
        // 通用：抓任何 [別名: 描述]，用 _isAliasTag 判類型，只拆三類媒體；[文件:]/[22:35] 等非媒體不動。
        _splitStickerContent: function(content) {
            // 其他特殊類型(轉賬/紅包/視頻/位置/文件…)維持整條、不拆
            if (/^\[(轉賬|转账|Transfer|Gift|禮物|礼物|紅包|红包|RedPacket|視頻|视频|Video|位置|Location|定位|收款码|收款碼|收款|付款码|付款碼)[：:]/i.test(content)) return [content];   // 文件移出名單→改走下面拆分(獨立文件卡、跟內容分開)
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
                const isMedia = isFile || isStk ||
                    this._isAliasTag(tag, this._IMAGE_ALIAS) ||
                    this._isAliasTag(tag, this._VOICE_ALIAS) ||
                    this._isAliasTag(tag, this._LINK_ALIAS) ||
                    this._isAliasTag(tag, this._FILE_ALIAS);   // [文件:xxx] 也拆成獨立卡(buildBubble fileM 渲染文件卡)
                if (!isMedia) continue;   // 非媒體 tag（[22:35] 時間戳等）→ 不拆、留在文字裡

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

        // 假收款碼：程式畫一個「QR 樣式」SVG（三角定位框 + 依 seed 的隨機黑塊），跑團用、不可掃也不用生圖
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

        _avatarColor: function(name) {
            const palette = ['#fa9d3b','#3b97fa','#2ecc71','#9b59b6','#e74c3c','#1abc9c','#e67e22','#34495e'];
            let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
            return palette[Math.abs(h) % palette.length];
        },

        _buildChatBubbleHTML: function(sender, content, isMe, core) {
            if (content.startsWith('[撤回]')) { return `<div class="chat-sys">${sender} 撤回了一條消息</div>`; }
            const nameHTML = (!isMe && this.isGroupChat) ? `<div class="chat-sender-name">${sender}</div>` : '';

            // -- 世界書頭像判定 --
            let lbUrl = core._lorebookAvatarCache?.[sender] || core._avatarMemCache?.[sender];
            if (!lbUrl && core._nameVariants) {
                const variant = core._nameVariants(sender).find(v => core._lorebookAvatarCache?.[v] || core._avatarMemCache?.[v]);
                if (variant) lbUrl = core._lorebookAvatarCache?.[variant] || core._avatarMemCache?.[variant];
            }

            let avatarHTML = sender.charAt(0);
            let color = this._avatarColor(sender);
            let avatarStyle = `background:${color};`;

            if (lbUrl) {
                const letter = sender.charAt(0);
                avatarStyle = `background:${color}; overflow:hidden; padding:0;`;
                avatarHTML = `<img src="${lbUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" onerror="var p=this.parentNode;this.remove();p.style.padding='';p.textContent='${letter}';">`;
            }

            // 任何圖片變體先 normalize 成 [圖片: xxx]
            content = this._normalizeImageTag(content);
            const imgM  = content.match(/^\[(圖片|图片|Image|Photo|Img)[：:]\s*([\s\S]*?)\]$/i);
            const vocM  = content.match(/^\[(語音|语音|Voice)[：:]\s*(.*?)\]$/i);
            const stkM  = content.match(/^\[(表情包|Sticker|貼紙|贴纸)[：:]\s*([\s\S]*?)\]$/i);
            const trM   = content.match(/^\[(轉賬|转账|Transfer)[：:]\s*(.*?)\]$/i);
            const giftM = content.match(/^\[(Gift|禮物|礼物|礼品|禮品)[：:]\s*(.*?)\]$/i);
            const rpM   = content.match(/^\[(紅包|红包|RedPacket)[：:]\s*(.*?)\]$/i);
            const vidM  = content.match(/^\[(視頻|视频|Video)[：:]\s*(.*?)\]$/i);
            const locM  = content.match(/^\[(位置|Location|定位)[：:]\s*(.*?)\]$/i);
            const fileM = content.match(/^\[(文件|檔案|档案|附件|File|Document|Attachment)[：:]\s*(.*?)\]$/i);
            const linkM = content.match(/^\[(鏈接|链接|連結|连结|鏈結|网址|網址|網頁|网页|Link|URL|Url)[：:]\s*([\s\S]*?)\]$/i);
            const recvM = content.match(/^\[(收款码|收款碼|收款|付款码|付款碼)[：:]\s*([\s\S]*?)\]$/i);

            let inner = '';
            if (imgM) {
                const desc = imgM[2] || '圖片';
                if (desc.match(/^(https?:\/\/|data:|blob:)/i)) { inner = `<img src="${desc}" style="max-width:185px; border-radius:6px; display:block; cursor:pointer;" onclick="window.open(this.src)">`; }
                else {
                    // 完整 desc 保留給 AI 生圖（含 (角色:外貌) 括號）；顯示用版本剝掉半形括號內容
                    const escDescFull = String(desc).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
                    const displayDesc = String(desc).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
                    inner = `<div class="wx-img-msg" data-prompt="${escDescFull}">
                        <span class="wx-img-icon"></span>
                        <span class="wx-img-desc">${displayDesc}</span>
                        <button class="wx-img-gen" onclick="window.VN_Phone._genImg(this); event.stopPropagation();">展開圖片</button>
                    </div>`;
                }
            } else if (vocM) {
                const txt = vocM[2] || ''; const sec = Math.min(60, Math.max(2, Math.ceil(txt.length / 2)));
                const escVS = String(sender).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;');
                const escVT = String(txt).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;');
                const transHTML = txt ? `<div class="wx-voice-trans">${txt}</div>` : '';
                inner = `<div class="wx-voice-wrap">
                    <div class="wx-voice-msg" data-vsender="${escVS}" data-vtext="${escVT}" onclick="event.stopPropagation(); window.VN_Phone._playVoice(this); var t=this.nextElementSibling; if(t) t.classList.toggle('open');">
                        <span class="wx-voice-wave">🔊 ≡≡≡</span><span class="wx-voice-dur">${sec}"</span>
                    </div>
                    ${transHTML}
                </div>`;
            } else if (stkM) {
                const desc = stkM[2] || '貼圖';
                // fallback 只顯示檔名，不顯示完整 URL
                const labelOnly = desc.replace(/^.*\//, '') || desc;
                const safeLabel = labelOnly.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;');
                const onerror = `var w=this.parentNode;this.remove();w.className='wx-sticker-msg';w.textContent=w.dataset.label;`;
                let src;
                if (desc.match(/^(https?:\/\/|data:|blob:)/i)) {
                    // 完整 URL：encode 路徑中的非 ASCII（解決中文檔名）
                    src = desc.replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c));
                } else {
                    // 先查貼圖庫（名稱→URL，含中文名如「小猫打滚」）；查不到才退 stickerBase 拼、再不行 onerror 顯示標籤
                    let libUrl = null;
                    try { libUrl = window.VN_Sticker?.lookup?.(desc) || null; } catch (e) {}
                    if (libUrl) { src = libUrl; }
                    else {
                        const base = (window.VN_Config?.data?.stickerBase || '').replace(/\/?$/, '/');
                        src = base ? base + encodeURIComponent(desc) : desc;
                    }
                }
                inner = `<div class="sticker-wrap" data-label="${safeLabel}"><img src="${src}" style="max-width:120px; border-radius:4px; display:block;" onerror="${onerror}"></div>`;
            } else if (trM) {
                const tParts = trM[2].split('|'); const tAmt = tParts[0] || '0'; const tId = tParts[tParts.length - 1] || '';
                inner = `<div class="wx-transfer-msg"><div class="wx-t-main"><div class="wx-t-icon">¥</div><div class="wx-t-body"><div class="wx-t-title">轉賬給朋友</div><div class="wx-t-amount">¥${tAmt}</div></div></div><div class="wx-t-footer">微信轉帳${tId && tId !== tAmt ? ' · ' + tId : ''}</div></div>`;
            } else if (giftM) {
                const gParts = giftM[2].split('|'); const gName = gParts[0] || ''; const gMemo = gParts[1] || '送你一份心意'; const gId = gParts[2] || '';
                const emojiRe = /^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27FF\u2300-\u23FF\u{1F300}-\u{1F9FF}])/u;
                const eMatch = gName.includes('+') ? gName.split('+', 2) : (emojiRe.test(gName) ? [gName.match(emojiRe)[0], gName.replace(emojiRe, '').trim()] : ['🎁', gName]);
                const gEmoji = eMatch[0] || '🎁'; const gTitle = eMatch[1] || gName;
                inner = `<div class="wx-gift-msg"><div class="wx-g-main"><span class="wx-g-icon">${gEmoji}</span><div class="wx-g-body"><div class="wx-g-title">${gMemo}</div><div class="wx-g-sub">${gTitle || '微信禮物'}</div></div></div><div class="wx-g-footer">微信禮物${gId ? ' · ' + gId : ''}</div></div>`;
            } else if (rpM) {
                const rParts = rpM[2].split('|'); const rAmt = rParts[0] || ''; const rNote = rParts[1] || '恭喜發財，大吉大利';
                inner = `<div class="wx-redpacket-msg"><div class="wx-rp-main"><div class="wx-rp-icon"><div style="width:18px;height:18px;background:#f6d147;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#e64340;font-weight:bold;font-size:11px;">¥</div></div><div class="wx-rp-body"><div class="wx-rp-amount">${rNote}</div><div class="wx-rp-label">領取紅包${rAmt ? ' ¥' + rAmt : ''}</div></div></div><div class="wx-rp-footer">微信紅包</div></div>`;
            } else if (vidM) {
                const vDesc = vidM[2] || 'Video';
                inner = `<div class="wx-video-msg"><div class="wx-video-play"></div><div class="wx-video-title">📹 ${vDesc}</div></div>`;
            } else if (locM) {
                const lParts = locM[2].split(/[-－]/); const lName = lParts[0].trim(); const lAddr = lParts[1] ? lParts[1].trim() : lName;
                inner = `<div class="wx-location-msg"><div class="wx-location-map">📍</div><div class="wx-location-info"><div class="wx-location-name">${lName}</div><div class="wx-location-addr">${lAddr}</div></div></div>`;
            } else if (fileM) {
                const fName = fileM[2].trim() || 'file.txt'; const fExt = fName.split('.').pop().toLowerCase();
                const fColors = { ppt:'#f4511e', pptx:'#f4511e', doc:'#4b89dc', docx:'#4b89dc', xls:'#2e7d32', xlsx:'#2e7d32', pdf:'#e53935', zip:'#fa9d3b', rar:'#fa9d3b', '7z':'#fa9d3b' };
                const fLabels = { ppt:'P', pptx:'P', doc:'W', docx:'W', xls:'X', xlsx:'X', pdf:'PDF', zip:'Z', rar:'Z', '7z':'Z' };
                const fColor = fColors[fExt] || '#999'; const fLabel = fLabels[fExt] || fExt.slice(0,3).toUpperCase() || '?'; const fSize = (Math.random() * 4 + 0.5).toFixed(1) + ' MB';
                inner = `<div class="wx-file-card"><div class="wx-file-info"><div class="wx-file-name">${fName}</div><div class="wx-file-size">${fSize}</div></div><div class="wx-file-icon" style="background:${fColor}">${fLabel}</div></div>`;
            } else if (linkM) {
                const lParts = (linkM[2] || '').split('|');
                const lTitle = (lParts[0] || '網頁連結').trim();
                const lUrl = lParts[1] ? lParts[1].trim() : '';
                const safeTitle = lTitle.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
                const isUrl = /^(https?:\/\/|www\.)/i.test(lUrl);
                const click = isUrl ? ` onclick="window.open('${encodeURI(lUrl).replace(/'/g,'%27')}')"` : '';
                inner = `<div class="wx-link-msg${isUrl ? ' clickable' : ''}"${click}><div class="wx-link-body"><div class="wx-link-title">${safeTitle}</div><div class="wx-link-foot"><i class="fa-solid fa-link"></i> 網頁連結</div></div><div class="wx-link-thumb"><i class="fa-solid fa-globe"></i></div></div>`;
            } else if (recvM) {
                const rParts = (recvM[2] || '').split('|');
                const amt = (rParts[0] || '').trim(); const memo = (rParts[1] || '').trim();
                const isNum = /^\d+(\.\d+)?$/.test(amt);
                const amtDisp = (isNum ? '¥' + amt : (amt || '金額任意')).replace(/&/g,'&amp;').replace(/</g,'&lt;');
                const memoDisp = (memo || '掃碼支付給對方').replace(/&/g,'&amp;').replace(/</g,'&lt;');
                inner = `<div class="wx-receive-msg"><div class="wx-receive-head"><i class="fa-solid fa-wallet"></i> 微信收款</div><div class="wx-receive-qr">${this._fakeQrSvg(recvM[2] || 'qr')}</div><div class="wx-receive-amt">${amtDisp}</div><div class="wx-receive-foot">${memoDisp}</div></div>`;
            } else {
                inner = `<div class="chat-bubble">${content}</div>`;
            }
            const rowHTML = `<div class="chat-row ${isMe ? 'you' : 'other'}"><div class="chat-avatar" style="${avatarStyle}">${avatarHTML}</div><div class="chat-content">${inner}</div></div>`;
            return nameHTML ? `<div class="chat-outer">${nameHTML}${rowHTML}</div>` : rowHTML;
        },

        // 點語音訊息 → 念出來（跟通話/正文同款：當前開哪個引擎就念哪個；沒指派音色就無聲）
        _playVoice: function(el) {
            if (!el) return;
            const sender = el.dataset.vsender || '';
            const text = el.dataset.vtext || '';
            if (!text) return;
            const core = win.VN_Core || (win.parent && win.parent.VN_Core);
            try { if (core && core._vnSoVITSPlay) core._vnSoVITSPlay(sender, text, '', ''); } catch (e) {}
            try { const mm = win.OS_MINIMAX || (win.parent && win.parent.OS_MINIMAX); if (mm && mm.playForChar) mm.playForChar(sender, text, { expression: '' }); } catch (e) {}
        },

        // ==========================================
        //  ✨ 點按「生成圖片」鈕：呼叫 VN_Image.getScene 補真實圖
        // ==========================================
        _genImg: async function(btnEl) {
            const card = btnEl.closest('.wx-img-msg');
            if (!card || card.dataset.gening === '1') return;
            const prompt = card.dataset.prompt || card.querySelector('.wx-img-desc')?.textContent || '';
            if (!prompt.trim()) return;

            card.dataset.gening = '1';
            const origText = btnEl.textContent;
            btnEl.textContent = '載入中…';
            btnEl.disabled = true;
            card.classList.add('wx-img-loading');

            try {
                const _mgr = win.OS_IMAGE_MANAGER || (win.parent && win.parent.OS_IMAGE_MANAGER);
                if (!_mgr?.generate) throw new Error('OS_IMAGE_MANAGER 未載入');
                // 聊天裡的「圖片」走角色那條接口（type='char'）— scene 是 VN 場景插圖獨立系統不共用
                // type='char' 時：Pollinations 自動套 pollinations.charBasePrompt/charNegPrompt；NAI 自動套 novelai.charBasePrompt/charNegPrompt
                const url = await _mgr.generate(prompt, 'char', { width: 1024, height: 1024 });
                if (!url) throw new Error('未取得圖片');
                const safeUrl = String(url).replace(/"/g, '%22');
                // 先預載完才替換，避免容器立即消失留空白
                await new Promise((resolve, reject) => {
                    const pre = new Image();
                    pre.onload = resolve;
                    pre.onerror = reject;
                    pre.src = safeUrl;
                });
                card.outerHTML = `<img src="${safeUrl}" style="max-width:240px; border-radius:8px; display:block; cursor:pointer;" onclick="window.open(this.src)">`;
            } catch(e) {
                console.warn('[wx-img-gen] 失敗:', e);
                btnEl.textContent = '失敗，重試';
                btnEl.disabled = false;
                card.classList.remove('wx-img-loading');
                card.dataset.gening = '0';
                setTimeout(() => { if (btnEl.isConnected) btnEl.textContent = origText; }, 2000);
            }
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
                        console.log('📞 [VN Call] 通話台詞寫進統一記憶 ' + callId + '（+' + lines.length + ' 句）');
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
                const parts = line.slice(isChar ? 6 : 5, -1).split('|');
                
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
                                const np = nl.slice(6, -1).split('|');
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
                    const p = line.slice(6, -1).split('|');
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