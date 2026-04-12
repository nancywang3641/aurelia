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
        currentChatroom: '', 
        chatroomCache: {}, 
        isCallActive: false,

        resetState: function() {
            this.chatParticipants = [];
            this.isGroupChat = false;
            this.currentChatroom = '';
            this.chatroomCache = {};
            this.isCallActive = false;
        },

        // ==========================================
        //  📱 Chat 模式邏輯
        // ==========================================
        initChat: function(core, line) {
            core.mode = 'chat';
            const newRoom = line.match(/chatroom="([^"]+)"/)?.[1] || 'Chat';
            document.getElementById('chat-title').innerText = newRoom;
            
            if (newRoom !== this.currentChatroom) {
                if (this.currentChatroom) {
                    this.chatroomCache[this.currentChatroom] = document.getElementById('chat-body').innerHTML;
                }
                const chatBody = document.getElementById('chat-body');
                chatBody.innerHTML = this.chatroomCache[newRoom] || '';
                this.currentChatroom = newRoom;
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
            if (line.match(/^\[(系統|System)[：:\]]/i) || line.match(/^\[(旁白|Narrator)[：:\]]/i)) {
                const t = line.replace(/^\[[^\]]+\]\s*/,'').trim();
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

        // 自動分割混合文字+表情包的訊息
        // 例: "哈哈哈[笑死我了.gif]" → ["哈哈哈", "[表情包:URL]"]
        _splitStickerContent: function(content) {
            // 已是特殊格式，不處理
            if (/^\[(表情包|Sticker|貼紙|贴纸|圖片|图片|Image|Photo|Img|語音|语音|Voice|轉賬|转账|Transfer|Gift|禮物|礼物|紅包|红包|RedPacket|視頻|视频|Video|位置|Location|定位|文件|File)[：:]/i.test(content)) return [content];
            if (content.startsWith('[撤回]')) return [content];

            const re = /\[([^\]]+\.(?:gif|jpg|jpeg|png))\]/gi;
            if (!re.test(content)) return [content];
            re.lastIndex = 0;

            const parts = [];
            let last = 0, m;
            while ((m = re.exec(content)) !== null) {
                const before = content.slice(last, m.index).trim();
                if (before) parts.push(before);
                const base = (window.VN_Config?.data?.stickerBase || '').replace(/\/?$/, '/');
                const url = base ? base + m[1] : m[1];
                parts.push(`[表情包:${url}]`);
                last = m.index + m[0].length;
            }
            const rest = content.slice(last).trim();
            if (rest) parts.push(rest);
            return parts.length > 0 ? parts : [content];
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

            const imgM  = content.match(/^\[(圖片|图片|Image|Photo|Img)[：:]\s*([\s\S]*?)\]$/i);
            const vocM  = content.match(/^\[(語音|语音|Voice)[：:]\s*(.*?)\]$/i);
            const stkM  = content.match(/^\[(表情包|Sticker|貼紙|贴纸)[：:]\s*([\s\S]*?)\]$/i);
            const trM   = content.match(/^\[(轉賬|转账|Transfer)[：:]\s*(.*?)\]$/i);
            const giftM = content.match(/^\[(Gift|禮物|礼物|礼品|禮品)[：:]\s*(.*?)\]$/i);
            const rpM   = content.match(/^\[(紅包|红包|RedPacket)[：:]\s*(.*?)\]$/i);
            const vidM  = content.match(/^\[(視頻|视频|Video)[：:]\s*(.*?)\]$/i);
            const locM  = content.match(/^\[(位置|Location|定位)[：:]\s*(.*?)\]$/i);
            const fileM = content.match(/^\[(文件|File)[：:]\s*(.*?)\]$/i);

            let inner = '';
            if (imgM) {
                const desc = imgM[2] || '圖片';
                if (desc.match(/^(https?:\/\/|data:|blob:)/i)) { inner = `<img src="${desc}" style="max-width:185px; border-radius:6px; display:block; cursor:pointer;" onclick="window.open(this.src)">`; }
                else { inner = `<div class="wx-img-msg"><span class="wx-img-icon">🖼️</span><span class="wx-img-desc">${desc}</span></div>`; }
            } else if (vocM) {
                const txt = vocM[2] || ''; const sec = Math.min(60, Math.max(2, Math.ceil(txt.length / 2)));
                const transHTML = txt ? `<div class="wx-voice-trans">${txt}</div>` : '';
                inner = `<div class="wx-voice-wrap">
                    <div class="wx-voice-msg" onclick="event.stopPropagation(); var t=this.nextElementSibling; if(t) t.classList.toggle('open');">
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
                    const base = (window.VN_Config?.data?.stickerBase || '').replace(/\/?$/, '/');
                    src = base ? base + encodeURIComponent(desc) : desc;
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
            } else {
                inner = `<div class="chat-bubble">${content}</div>`;
            }
            const rowHTML = `<div class="chat-row ${isMe ? 'you' : 'other'}"><div class="chat-avatar" style="${avatarStyle}">${avatarHTML}</div><div class="chat-content">${inner}</div></div>`;
            return nameHTML ? `<div class="chat-outer">${nameHTML}${rowHTML}</div>` : rowHTML;
        },

        // ==========================================
        //  📞 Call 模式邏輯
        // ==========================================
        initCall: function(core, line) {
            core.mode = 'call'; 
            this.isCallActive = false;
            const caller = line.match(/character="([^"]+)"/)?.[1] || 'Unknown';
            document.getElementById('call-name').innerText = caller;
            
            const st = document.getElementById('call-status');
            st.innerText = '來電'; 
            st.className = '';
            
            document.getElementById('call-incoming-btns').classList.remove('hidden');
            document.getElementById('call-active-btns').classList.add('hidden');
            
            const subBox = document.getElementById('call-subtitle-box');
            subBox.classList.add('hidden');
            document.getElementById('call-sub-text').innerHTML = '';
            document.getElementById('call-sub-name').innerHTML = '';
            
            core.updateCallAvatar(caller);
            core.toggleUI('phone-call');
        },

        exitCall: function(core) {
            document.getElementById('phone-call').classList.remove('call-active');
            core.mode = 'vn';
            core.toggleUI('vn');
            core.next();
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
                    core.playSFX(ex.sfx);
                    // 🔥 Minimax TTS（同 vn_core）
                    (function(charName, text, expression) {
                        const _mm = (window.parent || window).OS_MINIMAX;
                        if (_mm) _mm.playForChar(charName, text, { expression });
                    })(parts[0], ex.text, parts[1]);
                    // 🔮 預取下一句
                    (function prefetchNext(script, curIdx) {
                        const _mm = (window.parent || window).OS_MINIMAX;
                        if (!_mm?.prefetchForChar) return;
                        for (let i = curIdx + 1; i < script.length; i++) {
                            const nl = script[i];
                            if (nl.startsWith('[Char|')) {
                                const np = nl.slice(6, -1).split('|');
                                const nex = core._extractTextAndSFX(np.slice(2));
                                if (nex.text) _mm.prefetchForChar(np[0], nex.text, { expression: np[1] });
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
                }
            }
            core.checkAutoNext();
        },

        answerCall: function(core) {
            this.isCallActive = true;
            const st = document.getElementById('call-status');
            st.innerText = '通話中 00:00';
            st.classList.add('connected');
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