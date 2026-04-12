// ----------------------------------------------------------------
// [檔案 5] wx_chat_settings.js (V113.5 - Global Sync Fix)
// 路徑：os_phone/wx/wx_chat_settings.js
// 職責：聊天詳細設置
// 🚨 優化報告 (V113.5)：
// 1. [全域同步] 點擊保存時，不僅更新當前聊天室，還會強制同步更新「通訊錄 (Contacts)」。
//    - 效果：在私聊改了頭像/名字，群組裡的該成員也會自動變成新的樣子 (因為 ID 相同)。
// 2. [完整性] 保留 V113.4 的所有功能 (群成員列表、邀請按鈕、DB存儲)，無代碼缺失。
// ----------------------------------------------------------------
(function() {
    console.log('[WeChat] Chat Settings Module V113.5 (Global Sync) Loaded');
    const win = window.parent || window;
    const doc = win.document;

    // --- 樣式定義 (保持完整) ---
    const settingsStyle = `
        .ws-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: #ededed; z-index: 500; display: none;
            flex-direction: column; animation: wsSlideIn 0.25s ease-out;
            font-family: -apple-system, sans-serif;
        }
        .ws-overlay.show { display: flex; }
        @keyframes wsSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        
        .ws-header { height: 50px; background: #fff; display: flex; align-items: center; justify-content: center; padding: 0 15px; border-bottom: 1px solid #e5e5e5; flex-shrink: 0; position: relative; }
        .ws-title { font-weight: bold; font-size: 17px; color: #000; }
        .ws-close { position: absolute; left: 10px; font-size: 16px; color: #000; cursor: pointer; display: flex; align-items: center; height: 100%; font-weight: 500; }
        .ws-close:before { content: '‹'; font-size: 26px; margin-right: 2px; margin-top: -3px; font-weight: 300; }
        
        .ws-body { flex: 1; overflow-y: auto; padding-bottom: 40px; }
        .ws-group { margin-top: 10px; background: #fff; }
        
        .ws-cell { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; position: relative; border-bottom: 1px solid #f0f0f0; min-height: 30px; }
        .ws-cell:active { background-color: #f5f5f5; }
        .ws-group .ws-cell:last-child { border-bottom: none; }
        
        .ws-label { font-size: 16px; color: #000; }
        .ws-right { display: flex; align-items: center; color: #999; font-size: 16px; max-width: 60%; position: relative; }
        
        .ws-input { border: none; text-align: right; width: 100%; font-size: 16px; color: #666; outline: none; background: transparent; font-family: inherit; }
        .ws-arrow { margin-left: 8px; color: #ccc; font-size: 18px; margin-top: 2px; }
        
        /* 頭像樣式 */
        .ws-avatar-circle { width: 44px; height: 44px; border-radius: 50%; background-color: #eee; background-size: cover; background-position: center; border: 1px solid #ddd; position: relative; overflow: hidden; cursor: pointer; }
        .ws-avatar-icon { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.05); color: #666; font-size: 20px; pointer-events: none; }
        .ws-file-input-hidden { display: none !important; }
        .ws-bg-preview { width: 30px; height: 30px; border-radius: 4px; background-size: cover; border: 1px solid #ddd; margin-right: 5px; }

        /* 群成員 Grid */
        .ws-member-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; padding: 15px 10px; }
        .ws-member-item { display: flex; flex-direction: column; align-items: center; gap: 5px; }
        .ws-member-avatar { width: 48px; height: 48px; border-radius: 6px; background-color: #eee; background-size: cover; background-position: center; }
        .ws-member-name { font-size: 11px; color: #666; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 50px; }
        .ws-member-add { width: 48px; height: 48px; border-radius: 6px; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #999; cursor: pointer; }

        /* 按鈕樣式 */
        .ws-footer { padding: 30px 20px; }
        .ws-btn-del { width: 100%; background: #fff; color: #fa5151; border: none; padding: 14px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-top: 10px; }
        .ws-btn-del:active { background: #f9f9f9; }
        .ws-btn-save { width: 100%; background: #07c160; color: #fff; border: none; padding: 14px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .ws-section-header { font-size: 13px; color: #888; margin: 15px 16px 5px; }
        
        /* 群聊記憶彈窗 */
        .ws-memory-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 600; display: none; align-items: center; justify-content: center; }
        .ws-memory-overlay.show { display: flex; }
        .ws-memory-panel { background: #fff; width: 90%; max-width: 500px; max-height: 80vh; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
        .ws-memory-header { padding: 15px 20px; border-bottom: 1px solid #e5e5e5; display: flex; align-items: center; justify-content: space-between; }
        .ws-memory-title { font-size: 18px; font-weight: bold; }
        .ws-memory-close { font-size: 24px; color: #999; cursor: pointer; }
        .ws-memory-body { flex: 1; overflow-y: auto; padding: 15px; }
        .ws-memory-item { display: flex; align-items: center; padding: 12px; border-bottom: 1px solid #f0f0f0; }
        .ws-memory-item:last-child { border-bottom: none; }
        .ws-memory-checkbox { width: 20px; height: 20px; margin-right: 12px; cursor: pointer; }
        .ws-memory-info { flex: 1; }
        .ws-memory-name { font-size: 16px; color: #000; margin-bottom: 4px; }
        .ws-memory-desc { font-size: 12px; color: #999; }
        .ws-memory-footer { padding: 15px 20px; border-top: 1px solid #e5e5e5; display: flex; gap: 10px; }
        .ws-memory-btn { flex: 1; padding: 12px; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; }
        .ws-memory-btn-cancel { background: #f5f5f5; color: #333; }
        .ws-memory-btn-save { background: #07c160; color: #fff; }
        
        /* 人設設置彈窗 */
        .ws-persona-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 600; display: none; align-items: center; justify-content: center; }
        .ws-persona-overlay.show { display: flex; }
        .ws-persona-panel { background: #fff; width: 90%; max-width: 600px; max-height: 80vh; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
        .ws-persona-header { padding: 15px 20px; border-bottom: 1px solid #e5e5e5; display: flex; align-items: center; justify-content: space-between; }
        .ws-persona-title { font-size: 18px; font-weight: bold; }
        .ws-persona-close { font-size: 24px; color: #999; cursor: pointer; }
        .ws-persona-body { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 20px; }
        .ws-persona-section { border-bottom: 1px solid #f0f0f0; padding-bottom: 15px; }
        .ws-persona-section:last-child { border-bottom: none; }
        .ws-persona-section-title { font-size: 14px; color: #888; margin-bottom: 10px; font-weight: bold; }
        .ws-persona-entry { display: flex; align-items: flex-start; padding: 12px; border: 1px solid #e5e5e5; border-radius: 6px; margin-bottom: 8px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
        .ws-persona-entry:hover { background: #f5f5f5; }
        .ws-persona-entry:active { background: #e8e8e8; }
        .ws-persona-entry-checkbox { width: 24px; height: 24px; margin-right: 12px; margin-top: 2px; cursor: pointer; flex-shrink: 0; -webkit-appearance: none; appearance: none; border: 2px solid #ccc; border-radius: 50%; position: relative; }
        .ws-persona-entry-checkbox:checked { border-color: #07c160; background: #07c160; }
        .ws-persona-entry-checkbox:checked::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 8px; height: 8px; background: #fff; border-radius: 50%; }
        .ws-persona-entry-info { flex: 1; min-width: 0; overflow: hidden; }
        .ws-persona-entry-name { font-size: 15px; font-weight: bold; color: #000; margin-bottom: 6px; line-height: 1.4; }
        .ws-persona-entry-keys { font-size: 12px; color: #666; margin-bottom: 6px; line-height: 1.4; word-break: break-word; }
        .ws-persona-entry-content { font-size: 13px; color: #666; line-height: 1.5; max-height: 80px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; word-break: break-word; white-space: pre-wrap; }
        .ws-persona-input-wrapper { margin-top: 10px; }
        .ws-persona-textarea { width: 100%; min-height: 120px; padding: 10px; border: 1px solid #e5e5e5; border-radius: 6px; font-size: 14px; font-family: inherit; resize: vertical; }
        .ws-persona-footer { padding: 15px 20px; border-top: 1px solid #e5e5e5; display: flex; gap: 10px; }
        .ws-persona-btn { flex: 1; padding: 12px; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; }
        .ws-persona-btn-cancel { background: #f5f5f5; color: #333; }
        .ws-persona-btn-save { background: #07c160; color: #fff; }
    `;

    if (!doc.getElementById('ws-css')) {
        const s = doc.createElement('style'); s.id = 'ws-css'; s.innerHTML = settingsStyle; doc.head.appendChild(s);
    }

    // --- 圖片處理 (DB) ---
    let pendingUploads = {}; 

    function handleFileSelect(file, previewId, keyName) {
        if (!file) return;
        const tempUrl = URL.createObjectURL(file);
        const preview = doc.getElementById(previewId);
        if (preview) {
            preview.style.backgroundImage = `url('${tempUrl}')`;
            const icon = preview.querySelector('.ws-avatar-icon');
            if(icon) icon.style.display = 'none';
        }
        pendingUploads[keyName] = file;
    }

    async function loadPreview(elementId, src) {
        const el = doc.getElementById(elementId);
        if (!el || !src) return;
        
        let url = src;
        if ((src.startsWith('img_') || src.startsWith('avt_')) && win.OS_DB) {
            try { url = await win.OS_DB.getImage(src); } catch(e) {}
        }
        if (url) {
            el.style.backgroundImage = `url('${url}')`;
            const icon = el.querySelector('.ws-avatar-icon');
            if(icon) icon.style.display = 'none';
        }
    }

    // --- DOM 初始化 ---
    function initDOM() {
        if (doc.getElementById('wx-settings-panel')) return;
        const panel = doc.createElement('div');
        panel.id = 'wx-settings-panel';
        panel.className = 'ws-overlay';
        panel.innerHTML = `
            <div class="ws-header">
                <div class="ws-close" id="ws-close-btn">聊天詳情</div>
                <div class="ws-title" id="ws-title-text">聊天信息</div>
                <div style="width: 60px;"></div>
            </div>
            <div class="ws-body" id="ws-content"></div>
        `;
        const container = win.wxApp ? win.wxApp.APP_CONTAINER : doc.body;
        if (container) container.appendChild(panel);
        doc.getElementById('ws-close-btn').onclick = () => { panel.classList.remove('show'); };
        
            // 初始化群聊記憶彈窗
            if (!doc.getElementById('ws-memory-overlay')) {
                const memoryOverlay = doc.createElement('div');
                memoryOverlay.id = 'ws-memory-overlay';
                memoryOverlay.className = 'ws-memory-overlay';
                memoryOverlay.innerHTML = `
                    <div class="ws-memory-panel">
                        <div class="ws-memory-header">
                            <div class="ws-memory-title">選擇關聯群聊</div>
                            <div class="ws-memory-close" id="ws-memory-close">×</div>
                        </div>
                        <div class="ws-memory-body" id="ws-memory-body"></div>
                        <div class="ws-memory-footer">
                            <button class="ws-memory-btn ws-memory-btn-cancel" id="ws-memory-cancel">取消</button>
                            <button class="ws-memory-btn ws-memory-btn-save" id="ws-memory-save">保存</button>
                        </div>
                    </div>
                `;
                if (container) container.appendChild(memoryOverlay);
                doc.getElementById('ws-memory-close').onclick = () => { memoryOverlay.classList.remove('show'); };
                doc.getElementById('ws-memory-cancel').onclick = () => { memoryOverlay.classList.remove('show'); };
            }
            
            // 初始化人設設置彈窗
            if (!doc.getElementById('ws-persona-overlay')) {
                const personaOverlay = doc.createElement('div');
                personaOverlay.id = 'ws-persona-overlay';
                personaOverlay.className = 'ws-persona-overlay';
                personaOverlay.innerHTML = `
                    <div class="ws-persona-panel">
                        <div class="ws-persona-header">
                            <div class="ws-persona-title">人設設置</div>
                            <div class="ws-persona-close" id="ws-persona-close">×</div>
                        </div>
                        <div class="ws-persona-body" id="ws-persona-body"></div>
                        <div class="ws-persona-footer">
                            <button class="ws-persona-btn ws-persona-btn-cancel" id="ws-persona-cancel">取消</button>
                            <button class="ws-persona-btn ws-persona-btn-save" id="ws-persona-save">保存</button>
                        </div>
                    </div>
                `;
                if (container) container.appendChild(personaOverlay);
                doc.getElementById('ws-persona-close').onclick = () => { personaOverlay.classList.remove('show'); };
                doc.getElementById('ws-persona-cancel').onclick = () => { personaOverlay.classList.remove('show'); };
            }
    }

    // --- 主邏輯 ---
    win.WX_CHAT_SETTINGS = {
        open: function(chatId) {
            initDOM();
            pendingUploads = {}; 

            const panel = doc.getElementById('wx-settings-panel');
            const content = doc.getElementById('ws-content');
            const titleEl = doc.getElementById('ws-title-text');
            const app = win.wxApp;
            if (!app || !app.GLOBAL_CHATS[chatId]) return;

            const chat = app.GLOBAL_CHATS[chatId];
            const isGroup = !!chat.isGroup;
            const chatName = chat.name || chatId;
            const chatDesc = chat.desc || chat.bio || "";
            
            // 標題變化
            titleEl.innerText = isGroup ? `群聊資訊 (${chat.members ? chat.members.length : 1})` : "聊天詳情";

            // 讀取設定
            const storageKey = `wx_chat_settings_${chatId}`;
            let settings = {};
            try { settings = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch(e) {}
            
            let bgImage = settings.bgImage || '';
            let avatarUrl = chat.customAvatar || '';
            let myAvatarUrl = chat.userAvatar || '';
            let myAlias = chat.userAlias || '';
            
            // 讀取關聯的群聊（僅私聊）
            let linkedGroupChats = chat.linkedGroupChats || [];
            if (!Array.isArray(linkedGroupChats)) linkedGroupChats = [];
            
            // 讀取群聊記憶消息數量限制（默認50條）
            let groupMemoryMessageLimit = chat.groupMemoryMessageLimit || 50;
            if (typeof groupMemoryMessageLimit !== 'number' || groupMemoryMessageLimit < 1) {
                groupMemoryMessageLimit = 50;
            }
            
            // 讀取人設設置（僅私聊）
            let personaFromLorebook = chat.personaFromLorebook || null; // 選中的世界書條目UID
            // 若從「添加好友」流程來的，personaCustom 可能是空但 chat.persona 有值，fallback 同步過來
            let personaCustom = chat.personaCustom || (!chat.personaFromLorebook && chat.persona ? chat.persona : '');
            
            // 讀取群聊備註設置（僅群聊）
            let groupNoteFromLorebook = chat.groupNoteFromLorebook || null; // 選中的世界書條目UID
            let groupNoteCustom = chat.groupNoteCustom || ''; // 自定義備註文本
            let stickerLibId = chat.stickerLibId || '';

            // --- 構建 HTML 區塊 ---

            // 1. 群成員區塊 (僅群聊顯示)
            let membersHtml = '';
            if (isGroup) {
                let list = '';
                const members = chat.members || [chatId];
                // 讀取通訊錄以獲取頭像
                const contacts = win.WX_CONTACTS ? win.WX_CONTACTS.getAllCustomContacts() : [];
                
                members.forEach(mid => {
                    let mName = mid;
                    let mAvatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(mid)}&backgroundColor=e6e6e6`;
                    let dbAttr = '';

                    if (mid === 'User' || mid === '我') {
                        mName = myAlias || '我';
                        if (myAvatarUrl) mAvatar = myAvatarUrl; 
                    } else {
                        // 嘗試用 ID 找聯絡人
                        const c = contacts.find(x => x.id === mid);
                        if (c) {
                            mName = c.name; // 顯示通訊錄的名字
                            if (c.avatarId) {
                                mAvatar = ""; 
                                dbAttr = `data-db-src="${c.avatarId}"`; // 顯示通訊錄的頭像
                            }
                        }
                    }
                    list += `
                        <div class="ws-member-item">
                            <div class="ws-member-avatar db-mem-avt" ${dbAttr} style="background-image:url('${mAvatar}')"></div>
                            <div class="ws-member-name">${mName}</div>
                        </div>
                    `;
                });
                // 添加按鈕
                list += `
                    <div class="ws-member-item" id="btn-invite-member">
                        <div class="ws-member-add">+</div>
                    </div>
                `;
                membersHtml = `<div class="ws-group"><div class="ws-member-grid">${list}</div></div>`;
            }

            // 2. 頂部資訊區塊 (根據群聊/私聊變換)
            let infoHtml = '';
            if (isGroup) {
                // 群聊
                infoHtml = `
                    <div class="ws-cell">
                        <div class="ws-label">群頭像</div>
                        <div class="ws-right">
                            <div class="ws-avatar-circle" id="preview-avatar">
                                <div class="ws-avatar-icon">📷</div>
                            </div>
                            <input type="file" id="file-avatar" class="ws-file-input-hidden" accept="image/*">
                        </div>
                    </div>
                    <div class="ws-cell">
                        <div class="ws-label">群聊名稱</div>
                        <div class="ws-right">
                            <input class="ws-input" id="inp-name" value="${chatName}" placeholder="未命名">
                            <div class="ws-arrow">›</div>
                        </div>
                    </div>
                    <div class="ws-cell">
                        <div class="ws-label">群公告</div>
                        <div class="ws-right">
                            <input class="ws-input" id="inp-bio" value="${chatDesc}" placeholder="未設置">
                            <div class="ws-arrow">›</div>
                        </div>
                    </div>
                `;
            } else {
                // 私聊
                infoHtml = `
                    <div class="ws-cell">
                        <div class="ws-label">對方頭像</div>
                        <div class="ws-right">
                            <div class="ws-avatar-circle" id="preview-avatar">
                                <div class="ws-avatar-icon">📷</div>
                            </div>
                            <input type="file" id="file-avatar" class="ws-file-input-hidden" accept="image/*">
                        </div>
                    </div>
                    <div class="ws-cell">
                        <div class="ws-label">備註名</div>
                        <div class="ws-right">
                            <input class="ws-input" id="inp-name" value="${chatName}" placeholder="未設定">
                            <div class="ws-arrow">›</div>
                        </div>
                    </div>
                    <div class="ws-cell">
                        <div class="ws-label">備註/Bio</div>
                        <div class="ws-right">
                            <input class="ws-input" id="inp-bio" value="${chatDesc}" placeholder="未設定">
                            <div class="ws-arrow">›</div>
                        </div>
                    </div>
                    <div class="ws-cell" id="btn-persona-settings" style="cursor:pointer;">
                        <div class="ws-label">人設設置</div>
                        <div class="ws-right">
                            <div id="persona-status" style="font-size:14px; margin-right:5px; color: #999;">未設置</div>
                            <div class="ws-arrow">›</div>
                        </div>
                    </div>
                `;
            }
            
            // 群聊：添加備註設置按鈕
            if (isGroup) {
                infoHtml += `
                    <div class="ws-cell" id="btn-group-note-settings" style="cursor:pointer;">
                        <div class="ws-label">備註設置</div>
                        <div class="ws-right">
                            <div id="group-note-status" style="font-size:14px; margin-right:5px; color: #999;">未設置</div>
                            <div class="ws-arrow">›</div>
                        </div>
                    </div>
                `;
            }

            // 組合完整 HTML
            // 表情包庫選項
            let _stkLibOpts = '<option value="">無 (不注入)</option>';
            try {
                const _stkLibs = JSON.parse(localStorage.getItem('os_sticker_libs') || '[]');
                _stkLibs.forEach(l => {
                    _stkLibOpts += `<option value="${l.id}"${l.id === stickerLibId ? ' selected' : ''}>${l.name}</option>`;
                });
            } catch(e) {}
            content.innerHTML = `
                ${membersHtml}
                
                <div class="ws-group">
                    ${infoHtml}
                </div>

                <div class="ws-section-header">我在本聊天的形象</div>
                
                <div class="ws-group">
                    <div class="ws-cell">
                        <div class="ws-label">我的頭像</div>
                        <div class="ws-right">
                            <div class="ws-avatar-circle" id="preview-my-avatar">
                                <div class="ws-avatar-icon">📷</div>
                            </div>
                            <input type="file" id="file-my-avatar" class="ws-file-input-hidden" accept="image/*">
                        </div>
                    </div>
                    <div class="ws-cell">
                        <div class="ws-label">我的暱稱</div>
                        <div class="ws-right">
                            <input class="ws-input" id="inp-alias" value="${myAlias}" placeholder="預設 (User)">
                            <div class="ws-arrow">›</div>
                        </div>
                    </div>
                </div>

                <div class="ws-section-header">個性化設置</div>

                <div class="ws-group">
                    <div class="ws-cell" id="btn-bg-trigger" style="cursor:pointer;">
                        <div class="ws-label">聊天背景</div>
                        <div class="ws-right">
                            <div class="ws-bg-preview" id="preview-bg" style="display:${bgImage?'block':'none'}"></div>
                            <div id="preview-bg-txt" style="display:${bgImage?'none':'block'}; font-size:14px; margin-right:5px;">預設</div>
                            <div class="ws-arrow">›</div>
                            <input type="file" id="file-bg" class="ws-file-input-hidden" accept="image/*">
                        </div>
                    </div>
                    <div class="ws-cell" id="btn-bubble-settings" style="cursor:pointer;">
                        <div class="ws-label">氣泡樣式</div>
                        <div class="ws-right">
                            <div style="font-size:14px; margin-right:5px;">自定義</div>
                            <div class="ws-arrow">›</div>
                        </div>
                    </div>
                    <div class="ws-cell">
                        <div class="ws-label">表情包庫</div>
                        <div class="ws-right">
                            <select class="ws-input" id="sel-sticker-lib" style="text-align:right; max-width:150px; border:none; background:transparent; font-size:14px; color:#333;">${_stkLibOpts}</select>
                        </div>
                    </div>
                </div>
                
                ${!isGroup ? `
                <div class="ws-section-header">記憶關聯</div>
                <div class="ws-group">
                    <div class="ws-cell" id="btn-group-memory" style="cursor:pointer;">
                        <div class="ws-label">群聊記憶</div>
                        <div class="ws-right">
                            <div id="group-memory-count" style="font-size:14px; margin-right:5px; color: #999;">未選擇</div>
                            <div class="ws-arrow">›</div>
                        </div>
                    </div>
                    <div class="ws-cell">
                        <div class="ws-label">每群聊消息數</div>
                        <div class="ws-right">
                            <input class="ws-input" id="inp-memory-limit" type="number" min="1" max="500" value="${groupMemoryMessageLimit}" placeholder="50" style="text-align: right; width: 80px;">
                            <div style="font-size:14px; margin-left: 5px; color: #999;">條</div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <div class="ws-group">
                    <div class="ws-cell" id="btn-clear-chat" style="cursor:pointer;">
                        <div class="ws-label" style="color: #fa5151;">清空聊天記錄</div>
                        <div class="ws-right"><div class="ws-arrow">›</div></div>
                    </div>
                </div>

                <div class="ws-footer">
                    <button class="ws-btn-save" id="btn-save">保存更改</button>
                    <button class="ws-btn-del" id="btn-delete-chat">刪除此聊天</button>
                    <button class="ws-btn-del" id="btn-clear-redpacket-data" style="margin-top: 10px;">清除紅包/轉帳/禮物數據</button>
                </div>
            `;

            panel.classList.add('show');

            // --- 異步載入圖片 (DB) ---
            if (avatarUrl) loadPreview('preview-avatar', avatarUrl);
            if (myAvatarUrl) loadPreview('preview-my-avatar', myAvatarUrl);
            if (bgImage) loadPreview('preview-bg', bgImage);
            
            // 載入群成員頭像 (DB)
            if (isGroup) {
                const memAvatars = doc.querySelectorAll('.db-mem-avt');
                memAvatars.forEach(async el => {
                    const dbSrc = el.getAttribute('data-db-src');
                    if (dbSrc && win.OS_DB) {
                        try {
                            const url = await win.OS_DB.getImage(dbSrc);
                            if (url) el.style.backgroundImage = `url('${url}')`;
                        } catch(e) {}
                    }
                });
            }
            
            // 更新群聊備註狀態顯示（僅群聊）
            if (isGroup) {
                const groupNoteStatusEl = doc.getElementById('group-note-status');
                if (groupNoteStatusEl) {
                    if (groupNoteFromLorebook || groupNoteCustom.trim()) {
                        groupNoteStatusEl.textContent = groupNoteFromLorebook ? '來自世界書' : '自定義';
                        groupNoteStatusEl.style.color = '#07c160';
                    } else {
                        groupNoteStatusEl.textContent = '未設置';
                        groupNoteStatusEl.style.color = '#999';
                    }
                }
            }
            
            // 更新群聊記憶計數顯示（僅私聊）
            if (!isGroup) {
                const countEl = doc.getElementById('group-memory-count');
                if (countEl) {
                    if (linkedGroupChats.length > 0) {
                        countEl.textContent = `已選擇 ${linkedGroupChats.length} 個群聊`;
                        countEl.style.color = '#07c160';
                    } else {
                        countEl.textContent = '未選擇';
                        countEl.style.color = '#999';
                    }
                }
                
                // 更新人設狀態顯示
                const personaStatusEl = doc.getElementById('persona-status');
                if (personaStatusEl) {
                    if (personaFromLorebook || personaCustom.trim()) {
                        personaStatusEl.textContent = personaFromLorebook ? '來自世界書' : '自定義';
                        personaStatusEl.style.color = '#07c160';
                    } else {
                        personaStatusEl.textContent = '未設置';
                        personaStatusEl.style.color = '#999';
                    }
                }
            }

            // --- 事件綁定 ---
            const bindTrigger = (triggerId, inputId) => {
                const trigger = doc.getElementById(triggerId);
                const input = doc.getElementById(inputId);
                if (trigger && input) trigger.onclick = () => input.click();
            };

            bindTrigger('preview-avatar', 'file-avatar');
            bindTrigger('preview-my-avatar', 'file-my-avatar');
            bindTrigger('btn-bg-trigger', 'file-bg');

            const bindFileChange = (inputId, previewId, keyName) => {
                const input = doc.getElementById(inputId);
                if (!input) return;
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    handleFileSelect(file, previewId, keyName);
                    if (inputId === 'file-bg') {
                        doc.getElementById('preview-bg').style.display = 'block';
                        doc.getElementById('preview-bg-txt').style.display = 'none';
                    }
                };
            };

            bindFileChange('file-avatar', 'preview-avatar', 'avatar');
            bindFileChange('file-my-avatar', 'preview-my-avatar', 'myAvatar');
            bindFileChange('file-bg', 'preview-bg', 'bg');

            // 邀請按鈕 (復刻舊版邏輯)
            const inviteBtn = doc.getElementById('btn-invite-member');
            if (inviteBtn && win.WX_CONTACTS && win.WX_CONTACTS.openInviteWindow) {
                inviteBtn.onclick = () => {
                    win.WX_CONTACTS.openInviteWindow(chatId, chat.members || [], () => {
                        // 刷新頁面
                        this.open(chatId);
                    });
                };
            } else if (inviteBtn) {
                inviteBtn.onclick = () => alert("邀請功能需要更新 WX_CONTACTS 模塊");
            }

            doc.getElementById('btn-bubble-settings').onclick = () => {
                if (win.WX_BUBBLE_SETTINGS && win.WX_BUBBLE_SETTINGS.open) win.WX_BUBBLE_SETTINGS.open(chatId);
            };
            
            // 群聊記憶按鈕（僅私聊）
            if (!isGroup) {
                const memoryBtn = doc.getElementById('btn-group-memory');
                if (memoryBtn) {
                    memoryBtn.onclick = () => {
                        const memoryOverlay = doc.getElementById('ws-memory-overlay');
                        const memoryBody = doc.getElementById('ws-memory-body');
                        if (!memoryOverlay || !memoryBody) return;
                        
                        // 獲取所有群聊
                        const allChats = app.GLOBAL_CHATS || {};
                        const groupChats = Object.values(allChats).filter(c => c.isGroup === true);
                        
                        // 構建群聊列表HTML
                        let html = '';
                        if (groupChats.length === 0) {
                            html = '<div style="text-align: center; padding: 40px; color: #999;">暫無群聊</div>';
                        } else {
                            groupChats.forEach(groupChat => {
                                const isChecked = linkedGroupChats.includes(groupChat.id);
                                const desc = groupChat.desc || groupChat.bio || '';
                                html += `
                                    <div class="ws-memory-item">
                                        <input type="checkbox" class="ws-memory-checkbox" data-chat-id="${groupChat.id}" ${isChecked ? 'checked' : ''}>
                                        <div class="ws-memory-info">
                                            <div class="ws-memory-name">${groupChat.name || groupChat.id}</div>
                                            ${desc ? `<div class="ws-memory-desc">${desc}</div>` : ''}
                                        </div>
                                    </div>
                                `;
                            });
                        }
                        memoryBody.innerHTML = html;
                        memoryOverlay.classList.add('show');
                        
                        // 保存按鈕事件
                        const saveBtn = doc.getElementById('ws-memory-save');
                        if (saveBtn) {
                            saveBtn.onclick = () => {
                                const checkboxes = memoryBody.querySelectorAll('.ws-memory-checkbox');
                                const selectedIds = [];
                                checkboxes.forEach(cb => {
                                    if (cb.checked) {
                                        selectedIds.push(cb.getAttribute('data-chat-id'));
                                    }
                                });
                                
                                // 保存到聊天數據
                                chat.linkedGroupChats = selectedIds;
                                
                                // 保存消息數量限制
                                const limitInput = doc.getElementById('inp-memory-limit');
                                if (limitInput) {
                                    const limitValue = parseInt(limitInput.value);
                                    if (!isNaN(limitValue) && limitValue >= 1 && limitValue <= 500) {
                                        chat.groupMemoryMessageLimit = limitValue;
                                    } else {
                                        chat.groupMemoryMessageLimit = 50; // 無效值時使用默認值
                                    }
                                }
                                
                                if (app.saveChats) app.saveChats();
                                if (win.OS_DB && win.OS_DB.saveApiChat) win.OS_DB.saveApiChat(chatId, chat);
                                
                                // 更新顯示
                                const countEl = doc.getElementById('group-memory-count');
                                if (countEl) {
                                    if (selectedIds.length > 0) {
                                        countEl.textContent = `已選擇 ${selectedIds.length} 個群聊`;
                                        countEl.style.color = '#07c160';
                                    } else {
                                        countEl.textContent = '未選擇';
                                        countEl.style.color = '#999';
                                    }
                                }
                                
                                memoryOverlay.classList.remove('show');
                            };
                        }
                    };
                }
                
                // 人設設置按鈕（僅私聊）
                const personaBtn = doc.getElementById('btn-persona-settings');
                if (personaBtn) {
                    personaBtn.onclick = async () => {
                        const personaOverlay = doc.getElementById('ws-persona-overlay');
                        const personaBody = doc.getElementById('ws-persona-body');
                        if (!personaOverlay || !personaBody) return;
                        
                        // 獲取當前世界書
                        let currentLorebook = null;
                        if (win.TavernHelper && typeof win.TavernHelper.getCurrentCharPrimaryLorebook === 'function') {
                            currentLorebook = win.TavernHelper.getCurrentCharPrimaryLorebook();
                        }
                        
                        // 構建HTML
                        let html = '';
                        
                        // 第一欄：世界書條目
                        html += '<div class="ws-persona-section">';
                        html += '<div class="ws-persona-section-title">從世界書選擇</div>';
                        
                        // ── 獨立模式：從 OS_WORLDBOOK 讀取；ST 模式：從 TavernHelper 讀取 ──
                        let _wbEntries = [];
                        try {
                            const isStandalone = win.OS_WORLDBOOK && typeof win.OS_WORLDBOOK.getEnabledEntries === 'function' && !win.TavernHelper;
                            if (isStandalone) {
                                const raw = await win.OS_WORLDBOOK.getEnabledEntries();
                                _wbEntries = raw.map(e => ({ uid: e.id, comment: e.title, content: e.content, keys: [e.category || ''] }));
                            } else if (currentLorebook && win.TavernHelper?.getLorebookEntries) {
                                _wbEntries = await win.TavernHelper.getLorebookEntries(currentLorebook);
                            }
                            // 若 personaFromLorebook 未設定，嘗試用 chat.persona 比對 content 自動勾選
                            if (!personaFromLorebook && chat.persona) {
                                const matched = _wbEntries.find(e => (e.content || '').trim() === chat.persona.trim());
                                if (matched) personaFromLorebook = matched.uid;
                            }
                            if (!_wbEntries.length) {
                                html += '<div style="padding:20px;text-align:center;color:#999;">世界書中沒有條目</div>';
                            } else {
                                const escapeHtml = (t) => { const d = doc.createElement('div'); d.textContent = t; return d.innerHTML; };
                                _wbEntries.forEach(entry => {
                                    const isSelected = personaFromLorebook === entry.uid;
                                    let content = (entry.content || '').replace(/<[^>]+>/g, '').trim();
                                    if (content.length > 200) content = content.substring(0, 200) + '...';
                                    const comment = (entry.comment || `條目 #${entry.uid}`).trim();
                                    const keys = entry.keys?.length ? entry.keys.join(', ') : '(無關鍵字)';
                                    html += `<div class="ws-persona-entry" data-entry-uid="${entry.uid}" data-content="${escapeHtml(entry.content||'')}">
                                        <input type="radio" name="persona-lorebook" class="ws-persona-entry-checkbox" value="${entry.uid}" id="persona-radio-${entry.uid}" ${isSelected ? 'checked' : ''}>
                                        <div class="ws-persona-entry-info">
                                            <div class="ws-persona-entry-name">${escapeHtml(comment)}</div>
                                            <div class="ws-persona-entry-keys">${escapeHtml(keys)}</div>
                                            <div class="ws-persona-entry-content">${escapeHtml(content)}</div>
                                        </div></div>`;
                                });
                            }
                        } catch (e) {
                            html += '<div style="padding:20px;text-align:center;color:#fa5151;">獲取世界書條目失敗</div>';
                        }
                        html += '</div>';

                        // 第二欄：額外補充（世界書有的不用再填，只補這個聊天室特有的內容）
                        html += '<div class="ws-persona-section">';
                        html += '<div class="ws-persona-section-title">額外補充 <span style="font-weight:400;color:#aaa;font-size:11px;">（選填，疊加在世界書條目之上）</span></div>';
                        html += '<div class="ws-persona-input-wrapper">';
                        html += `<textarea class="ws-persona-textarea" id="inp-persona-custom" placeholder="例：這個聊天室裡他是臥底身份，對方不知道他的真實職業..." style="min-height:80px;">${personaCustom || ''}</textarea>`;
                        html += '</div>';
                        html += '</div>';

                        personaBody.innerHTML = html;
                        personaOverlay.classList.add('show');

                        // 點擊條目（再次點擊取消選擇）
                        personaBody.querySelectorAll('.ws-persona-entry').forEach(entryEl => {
                            entryEl.addEventListener('click', (e) => {
                                const radio = entryEl.querySelector('.ws-persona-entry-checkbox');
                                if (!radio) return;
                                if (e.target.type === 'radio') {
                                    if (radio.checked) { e.preventDefault(); radio.checked = false; }
                                    return;
                                }
                                radio.checked = !radio.checked;
                            });
                        });

                        // 保存按鈕：只存 uid（不複製 content），buildContext 發訊息時即時讀
                        const saveBtn = doc.getElementById('ws-persona-save');
                        if (saveBtn) {
                            saveBtn.onclick = () => {
                                const selectedRadio = personaBody.querySelector('input[name="persona-lorebook"]:checked');
                                const selectedUid = selectedRadio ? selectedRadio.value : null; // 保留字串 id，不轉 int
                                const customInput = doc.getElementById('inp-persona-custom');
                                const customText = customInput ? customInput.value.trim() : '';

                                // 只存 uid + 補充文字，content 不複製，發訊息時即時讀世界書
                                chat.personaFromLorebook = selectedUid;
                                chat.personaCustom = customText;
                                // chat.persona 清空，讓 _buildStandaloneContext 每次都從世界書讀
                                chat.persona = '';

                                if (app.saveChats) app.saveChats();
                                if (win.OS_DB && win.OS_DB.saveApiChat) win.OS_DB.saveApiChat(chatId, chat);

                                const personaStatusEl = doc.getElementById('persona-status');
                                if (personaStatusEl) {
                                    if (selectedUid || customText) {
                                        personaStatusEl.textContent = selectedUid ? (customText ? '世界書+補充' : '來自世界書') : '自定義補充';
                                        personaStatusEl.style.color = '#07c160';
                                    } else {
                                        personaStatusEl.textContent = '未設置';
                                        personaStatusEl.style.color = '#999';
                                    }
                                }
                                personaOverlay.classList.remove('show');
                            };
                        }
                    };
                }
            }
            
            // 群聊備註設置按鈕（僅群聊）
            if (isGroup) {
                const groupNoteBtn = doc.getElementById('btn-group-note-settings');
                if (groupNoteBtn) {
                    groupNoteBtn.onclick = async () => {
                        const personaOverlay = doc.getElementById('ws-persona-overlay');
                        const personaBody = doc.getElementById('ws-persona-body');
                        if (!personaOverlay || !personaBody) return;
                        
                        // 獲取當前世界書
                        let currentLorebook = null;
                        if (win.TavernHelper && typeof win.TavernHelper.getCurrentCharPrimaryLorebook === 'function') {
                            currentLorebook = win.TavernHelper.getCurrentCharPrimaryLorebook();
                        }
                        
                        // 構建HTML
                        let html = '';
                        
                        // 第一欄：世界書條目
                        html += '<div class="ws-persona-section">';
                        html += '<div class="ws-persona-section-title">從世界書選擇</div>';
                        
                        // ── 獨立模式：從 OS_WORLDBOOK 讀取；ST 模式：從 TavernHelper 讀取 ──
                        try {
                            let entries = [];
                            const isStandalone = win.OS_WORLDBOOK && typeof win.OS_WORLDBOOK.getEnabledEntries === 'function' && !win.TavernHelper;
                            if (isStandalone) {
                                entries = await win.OS_WORLDBOOK.getEnabledEntries();
                                entries = entries.map(e => ({ uid: e.id, comment: e.title, content: e.content, keys: [e.category || ''] }));
                            } else if (currentLorebook && win.TavernHelper?.getLorebookEntries) {
                                entries = await win.TavernHelper.getLorebookEntries(currentLorebook);
                            }
                            if (!entries || entries.length === 0) {
                                html += '<div style="padding:20px;text-align:center;color:#999;">世界書中沒有條目</div>';
                            } else {
                                const escapeHtml = (t) => { const d = doc.createElement('div'); d.textContent = t; return d.innerHTML; };
                                entries.forEach(entry => {
                                    const isSelected = groupNoteFromLorebook === entry.uid;
                                    let content = (entry.content || '').replace(/<[^>]+>/g, '').trim();
                                    if (content.length > 200) content = content.substring(0, 200) + '...';
                                    const comment = (entry.comment || `條目 #${entry.uid}`).trim();
                                    const keys = entry.keys?.length ? entry.keys.join(', ') : '(無關鍵字)';
                                    html += `<div class="ws-persona-entry" data-entry-uid="${entry.uid}" data-content="${escapeHtml(entry.content||'')}">
                                        <input type="radio" name="group-note-lorebook" class="ws-persona-entry-checkbox" value="${entry.uid}" id="group-note-radio-${entry.uid}" ${isSelected ? 'checked' : ''}>
                                        <div class="ws-persona-entry-info">
                                            <div class="ws-persona-entry-name">${escapeHtml(comment)}</div>
                                            <div class="ws-persona-entry-keys">${escapeHtml(keys)}</div>
                                            <div class="ws-persona-entry-content">${escapeHtml(content)}</div>
                                        </div></div>`;
                                });
                            }
                        } catch (e) {
                            html += '<div style="padding:20px;text-align:center;color:#fa5151;">獲取世界書條目失敗</div>';
                        }
                        html += '</div>';
                        
                        // 第二欄：自定義輸入
                        html += '<div class="ws-persona-section">';
                        html += '<div class="ws-persona-section-title">或直接輸入備註</div>';
                        html += '<div class="ws-persona-input-wrapper">';
                        html += `<textarea class="ws-persona-textarea" id="inp-group-note-custom" placeholder="在此輸入群組關係網等備註內容...">${groupNoteCustom || ''}</textarea>`;
                        html += '</div>';
                        html += '</div>';
                        
                        // 更新標題
                        const personaTitle = doc.querySelector('.ws-persona-title');
                        if (personaTitle) personaTitle.textContent = '備註設置';
                        
                        personaBody.innerHTML = html;
                        personaOverlay.classList.add('show');
                        
                        // 綁定點擊事件（移動端適配，支持取消選擇）
                        const entryElements = personaBody.querySelectorAll('.ws-persona-entry');
                        entryElements.forEach(entryEl => {
                            entryEl.addEventListener('click', (e) => {
                                const radio = entryEl.querySelector('.ws-persona-entry-checkbox');
                                if (!radio) return;
                                
                                // 如果點擊的是radio本身
                                if (e.target.type === 'radio') {
                                    // 如果已經選中，再次點擊則取消選擇
                                    if (radio.checked) {
                                        e.preventDefault();
                                        radio.checked = false;
                                        radio.dispatchEvent(new Event('change', { bubbles: true }));
                                    }
                                    return;
                                }
                                
                                // 點擊整個條目時
                                if (radio.checked) {
                                    // 如果已經選中，再次點擊則取消選擇
                                    radio.checked = false;
                                } else {
                                    // 如果未選中，則選中
                                    radio.checked = true;
                                }
                                // 觸發change事件
                                radio.dispatchEvent(new Event('change', { bubbles: true }));
                            });
                        });
                        
                        // 保存按鈕事件
                        const saveBtn = doc.getElementById('ws-persona-save');
                        if (saveBtn) {
                            saveBtn.onclick = () => {
                                // 獲取選中的世界書條目
                                const selectedRadio = personaBody.querySelector('input[name="group-note-lorebook"]:checked');
                                const selectedUid = selectedRadio ? parseInt(selectedRadio.value) : null;
                                
                                // 獲取自定義備註
                                const customInput = doc.getElementById('inp-group-note-custom');
                                const customText = customInput ? customInput.value.trim() : '';
                                
                                // 保存到聊天數據
                                chat.groupNoteFromLorebook = selectedUid;
                                chat.groupNoteCustom = customText;
                                
                                if (app.saveChats) app.saveChats();
                                if (win.OS_DB && win.OS_DB.saveApiChat) win.OS_DB.saveApiChat(chatId, chat);
                                
                                // 更新顯示
                                const groupNoteStatusEl = doc.getElementById('group-note-status');
                                if (groupNoteStatusEl) {
                                    if (selectedUid || customText) {
                                        groupNoteStatusEl.textContent = selectedUid ? '來自世界書' : '自定義';
                                        groupNoteStatusEl.style.color = '#07c160';
                                    } else {
                                        groupNoteStatusEl.textContent = '未設置';
                                        groupNoteStatusEl.style.color = '#999';
                                    }
                                }
                                
                                personaOverlay.classList.remove('show');
                            };
                        }
                    };
                }
            }
            
            // 清空與刪除
            doc.getElementById('btn-clear-chat').onclick = () => {
                if (confirm('確定要清空記錄嗎？')) {
                    chat.messages = []; chat.pushedCount = 0; chat.renderedCount = 0;
                    if (app.GLOBAL_ACTIVE_ID === chatId && app.render) app.render();
                    if (win.OS_DB && win.OS_DB.saveApiChat) win.OS_DB.saveApiChat(chatId, chat);
                    app.saveChats();
                    panel.classList.remove('show');
                }
            };
            doc.getElementById('btn-delete-chat').onclick = () => {
                if (confirm('確定要刪除聊天室嗎？')) {
                    if (win.wxApp && win.wxApp.deleteChat) win.wxApp.deleteChat(chatId);
                    if (win.OS_DB && win.OS_DB.deleteApiChat) win.OS_DB.deleteApiChat(chatId);
                    panel.classList.remove('show');
                }
            };
            
            // 清除紅包/轉帳/禮物數據
            doc.getElementById('btn-clear-redpacket-data').onclick = () => {
                if (confirm('確定要清除所有紅包/轉帳/禮物數據嗎？此操作不可恢復。')) {
                    let deletedCount = 0;
                    
                    // 遍歷所有 localStorage 鍵
                    const keysToDelete = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (!key) continue;
                        
                        // 刪除紅包數據：wx_redpacket_*
                        if (key.startsWith('wx_redpacket_')) {
                            keysToDelete.push(key);
                            deletedCount++;
                        }
                        // 刪除轉帳和禮物數據：ID_* (存儲 'accepted' 或 'returned')
                        else if (key.startsWith('ID_')) {
                            keysToDelete.push(key);
                            deletedCount++;
                        }
                    }
                    
                    // 執行刪除
                    keysToDelete.forEach(key => localStorage.removeItem(key));
                    
                    alert(`已清除 ${deletedCount} 條數據（${keysToDelete.filter(k => k.startsWith('wx_redpacket_')).length} 個紅包，${keysToDelete.filter(k => k.startsWith('ID_')).length} 個轉帳/禮物）`);
                }
            };

            // --- 保存邏輯 (DB + 全域同步) ---
            doc.getElementById('btn-save').onclick = async () => {
                const btn = doc.getElementById('btn-save');
                btn.innerText = "正在保存...";
                btn.disabled = true;

                try {
                    // 1. 上傳圖片到 DB
                    if (win.OS_DB) {
                        if (pendingUploads['bg']) {
                            const id = 'img_bg_' + Date.now();
                            await win.OS_DB.saveImage(id, pendingUploads['bg']);
                            bgImage = id;
                        }
                        if (pendingUploads['avatar']) {
                            const id = isGroup ? 'avt_grp_' + Date.now() : 'avt_' + Date.now();
                            await win.OS_DB.saveImage(id, pendingUploads['avatar']);
                            avatarUrl = id;
                        }
                        if (pendingUploads['myAvatar']) {
                            const id = 'img_me_' + Date.now();
                            await win.OS_DB.saveImage(id, pendingUploads['myAvatar']);
                            myAvatarUrl = id;
                        }
                    }

                    // 2. 更新 Chat 對象
                    const newName = doc.getElementById('inp-name').value.trim();
                    const newBio = doc.getElementById('inp-bio').value.trim();
                    const newAlias = doc.getElementById('inp-alias').value.trim();
                    let hasChanges = false;

                    if (newName && newName !== chatName) { chat.name = newName; hasChanges = true; }
                    if (newBio !== chatDesc) { chat.desc = newBio; chat.bio = newBio; hasChanges = true; }
                    if (newAlias !== myAlias) { chat.userAlias = newAlias; hasChanges = true; }
                    
                    if (myAvatarUrl !== (chat.userAvatar || "")) { chat.userAvatar = myAvatarUrl; hasChanges = true; }
                    if (avatarUrl !== (chat.customAvatar || "")) { chat.customAvatar = avatarUrl; hasChanges = true; }
                    
                    // 保存群聊記憶消息數量限制（僅私聊）
                    if (!isGroup) {
                        const limitInput = doc.getElementById('inp-memory-limit');
                        if (limitInput) {
                            const limitValue = parseInt(limitInput.value);
                            if (!isNaN(limitValue) && limitValue >= 1 && limitValue <= 500) {
                                if (chat.groupMemoryMessageLimit !== limitValue) {
                                    chat.groupMemoryMessageLimit = limitValue;
                                    hasChanges = true;
                                }
                            }
                        }
                    }

                    // 保存表情包庫選擇
                    const stkSel = doc.getElementById('sel-sticker-lib');
                    if (stkSel) {
                        const newStkLibId = stkSel.value;
                        if (newStkLibId !== (chat.stickerLibId || '')) {
                            chat.stickerLibId = newStkLibId;
                            hasChanges = true;
                        }
                    }

                    // 3. 更新 Settings 背景圖
                    if (settings.bgImage !== bgImage) {
                        settings.bgImage = bgImage;
                        localStorage.setItem(storageKey, JSON.stringify(settings));
                        if (win.WX_THEME && win.WX_THEME.applyChatSettings) win.WX_THEME.applyChatSettings(chatId);
                    }

                    // 4. 存檔
                    if (hasChanges || Object.keys(pendingUploads).length > 0) {
                        // 🔥 [關鍵同步] 
                        // 如果是群組，或者【私聊且對方在通訊錄中】，則同步更新通訊錄資料
                        // 這樣改了私聊的頭像，群組裡也會跟著變！
                        if (win.WX_CONTACTS && win.WX_CONTACTS.updateContactInfo) {
                            // 這裡我們直接把 name 和 avatarId 同步過去
                            // 因為 chatId 就是 contactId
                            win.WX_CONTACTS.updateContactInfo(chatId, { 
                                name: newName, 
                                desc: newBio, 
                                avatarId: avatarUrl // 注意：如果是空字符串，表示沒換，不需要特別處理，這裡簡單覆蓋
                            });
                        }

                        if (app.GLOBAL_ACTIVE_ID === chatId) app.render();
                        if (app.saveChats) app.saveChats(); 
                        if (win.OS_DB && win.OS_DB.saveApiChat) win.OS_DB.saveApiChat(chatId, chat);
                    }

                    alert("保存成功！");
                    panel.classList.remove('show');

                } catch (e) {
                    console.error(e);
                    alert("保存失敗：" + e.message);
                } finally {
                    btn.innerText = "保存更改";
                    btn.disabled = false;
                }
            };
        }
    };
})();