// ----------------------------------------------------------------
// [檔案 2] wx_view.js
// 模塊：視圖模板 (View/Template)
// ----------------------------------------------------------------

(function() {
    window.WX_VIEW = {
        
        renderBubble: function(msg, chatName, withAnim) {
            const animClass = withAnim ? 'animate' : '';
            const opacityStyle = withAnim ? 'opacity:0;' : 'opacity:1;'; 
            
            if (msg.type === 'time') {
                return `<div class="wx-time-stamp" style="${opacityStyle}" class="${animClass}">${msg.content}</div>`;
            }
            
            let html = msg.content || "";
            html = this.processModules(html);

            const avatar = msg.isMe 
                ? `https://api.dicebear.com/7.x/notionists/svg?seed=MySelf&backgroundColor=c0ebd7`
                : `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(chatName)}&backgroundColor=e6e6e6`;
            const side = msg.isMe ? 'me' : 'you';

            return `
                <div class="wx-msg-row ${side} ${animClass}" style="${opacityStyle}">
                    <div class="wx-bubble-avatar" style="background-image: url('${avatar}')"></div>
                    <div class="wx-bubble-content">${html}</div>
                </div>
            `;
        },

        processModules: function(html) {
            
            // 轉帳卡片 (新增)
            html = html.replace(/\[\s*(转账|轉帳|Transfer)\s*[:：]?\s*(\d+).*?\]/gi, `
                <div style="background:#fa9d3b; padding:15px; border-radius:4px; color:white; min-width:180px; display:flex; align-items:center; gap:10px;">
                    <div style="border:2px solid white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center;">¥</div>
                    <div>
                        <div style="font-size:14px;">轉帳給朋友</div>
                        <div style="font-size:12px; opacity:0.8">微信轉帳</div>
                    </div>
                </div>
            `);

            html = html.replace(/\[\s*(图片|圖片|Img)\s*[:：]?\s*(.*?)\s*\]/gi, (m, t, src) => {
                if (src.match(/^(https?:\/\/|data:|blob:)/i)) {
                    return `<img src="${src}" class="wx-img-block" onclick="window.top.wxBigImg(this.src)">`;
                } else {
                    return `<div class="wx-img-placeholder"><span style="font-size:24px">🖼️</span><span>${src}</span></div>`;
                }
            });

            html = html.replace(/\[\s*(语音|語音|Voice)\s*[:：]?\s*(.*?)\s*\]/gi, (m, t, txt) => {
                const cleanTxt = txt.replace(/['"]/g, '');
                const sec = Math.min(60, Math.max(2, Math.ceil(cleanTxt.length/2)));
                return `
                    <div class="wx-voice-wrapper" onclick="window.top.wxToggleVoice(this, '${encodeURIComponent(cleanTxt)}')">
                        <div class="wx-voice-box" style="width:${60+sec*2}px">
                            <span style="margin:0 5px">((</span>
                            <span>${sec}"</span>
                        </div>
                        <div class="wx-trans-box"></div>
                    </div>`;
            });

            html = html.replace(/\[\s*(红包|RedPacket)\s*[:：]?\s*(.*?)\s*\]/gi, `
                <div class="wx-red-packet">
                    <div class="wx-rp-icon"></div>
                    <div>
                        <div style="font-weight:bold;">恭喜發財</div>
                        <div style="font-size:10px;">微信紅包</div>
                    </div>
                </div>
            `);
            
            // 位置
             html = html.replace(/\[\s*(位置|Location)\s*[:：]?\s*(.*?)\s*\]/gi, `
                <div class="wx-img-placeholder" style="align-items:flex-start; min-width:150px;">
                    <div style="font-weight:bold; color:#000;">$2</div>
                    <div style="font-size:10px;">位置信息</div>
                    <div style="width:100%; height:60px; background:#ddd; margin-top:5px; border-radius:2px;"></div>
                </div>
            `);

            html = html.replace(/\[\s*(表情包|Sticker)\s*[:：]?\s*(.*?)\s*\]/gi, `
                <div class="wx-img-placeholder" style="background:transparent; border:none; min-width:auto; padding:0;">
                    <span style="font-size:40px">🐱</span>
                </div>
            `);

            return html;
        },

        getListHTML: function(chats, activeName) {
            const chatKeys = Object.keys(chats).filter(k => k !== '未分類');
            if (chatKeys.length === 0 && chats['未分類'] && chats['未分類'].messages.length > 0) chatKeys.push('未分類');
            
            return chatKeys.map(name => {
                const c = chats[name];
                const hasNew = (c.messages.length > (c.renderedCount || 0));
                const showBadge = (c.unread || hasNew) && (name !== activeName);
                
                return `
                    <div class="wx-chat-item" onclick="window.top.wxTriggerChat('${name}')">
                        <div class="wx-avatar" style="background-image: url('https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(name)}&backgroundColor=e6e6e6')">
                            ${showBadge ? '<div class="wx-badge">1</div>' : ''}
                        </div>
                        <div class="wx-info">
                            <div style="display:flex; justify-content:space-between;">
                                <span class="wx-name">${name}</span>
                                <span class="wx-meta">${c.lastTime}</span>
                            </div>
                            <div class="wx-last-msg">${c.lastPreview}</div>
                        </div>
                    </div>
                `;
            }).join('');
        },

        renderShell: function(activeName, chats) {
            const listHTML = this.getListHTML(chats, activeName);
            const transform = activeName ? 'translateX(-30%)' : 'translateX(0)';
            const headerTitle = activeName || '微信';
            const backBtnClass = activeName ? 'wx-back-btn show' : 'wx-back-btn';
            const footerDisplay = activeName ? 'flex' : 'none';
            
            let roomContent = '';
            if (activeName && chats[activeName]) {
                const msgs = chats[activeName].messages;
                roomContent = msgs.map(msg => this.renderBubble(msg, activeName, false)).join('');
            }

            // 新增：底部添加 wx-modal-overlay
            return `
                <div class="wx-shell">
                    <div class="wx-header">
                        <div class="${backBtnClass}" onclick="window.top.wxTriggerChat(null)">微信</div>
                        <div class="wx-header-title">${headerTitle}</div>
                        <div style="width:30px;">···</div>
                    </div>
                    <div class="wx-page-container">
                        <div class="wx-page-list" style="transform: ${transform}">
                            <div style="padding:10px;">${listHTML}</div>
                        </div>
                        <div class="wx-page-room ${activeName ? 'active' : ''}">
                            <div style="padding:10px;" id="wxRoomContent">${roomContent}</div>
                        </div>
                    </div>
                    
                    <div class="wx-modal-overlay" id="wxActionModal">
                        <div class="wx-modal-box">
                            <div class="wx-modal-title" id="wxModalTitle">輸入內容</div>
                            <input type="text" class="wx-modal-input" id="wxModalInput" autocomplete="off">
                            <div class="wx-modal-footer">
                                <button class="wx-btn wx-btn-cancel" onclick="window.top.wxCloseModal()">取消</button>
                                <button class="wx-btn wx-btn-confirm" onclick="window.top.wxConfirmModal()">發送</button>
                            </div>
                        </div>
                    </div>

                    <div class="wx-footer-wrapper" style="display:${footerDisplay}">
                        <div class="wx-input-bar">
                            <span class="wx-icon-btn">🔊</span>
                            <input class="wx-input-real" placeholder="" oninput="window.top.wxCheckInput(this)" onkeydown="window.top.wxInput(event, this)">
                            <span class="wx-icon-btn">☺</span>
                            <span class="wx-icon-btn" onclick="window.top.wxTogglePanel()">⊕</span>
                            <div class="wx-send-btn" onclick="window.top.wxSend(this)">发送</div>
                        </div>
                        <div class="wx-action-panel">
                            <div class="wx-grid">
                                <div class="wx-grid-item" onclick="window.top.wxAction('photo')"><div class="wx-grid-icon">🖼️</div><div class="wx-grid-label">照片</div></div>
                                <div class="wx-grid-item" onclick="window.top.wxAction('camera')"><div class="wx-grid-icon">📷</div><div class="wx-grid-label">拍攝</div></div>
                                <div class="wx-grid-item" onclick="window.top.wxAction('video')"><div class="wx-grid-icon">📹</div><div class="wx-grid-label">視訊</div></div>
                                <div class="wx-grid-item" onclick="window.top.wxAction('voice')"><div class="wx-grid-icon">📞</div><div class="wx-grid-label">通話</div></div>
                                <div class="wx-grid-item" onclick="window.top.wxAction('location')"><div class="wx-grid-icon">📍</div><div class="wx-grid-label">位置</div></div>
                                <div class="wx-grid-item" onclick="window.top.wxAction('redpacket')"><div class="wx-grid-icon">🧧</div><div class="wx-grid-label">紅包</div></div>
                                <div class="wx-grid-item" onclick="window.top.wxAction('transfer')"><div class="wx-grid-icon">💸</div><div class="wx-grid-label">轉帳</div></div>
                                <div class="wx-grid-item" onclick="window.top.wxAction('gift')"><div class="wx-grid-icon">🎁</div><div class="wx-grid-label">禮物</div></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    };
})();