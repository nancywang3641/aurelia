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

    if (!doc.getElementById('ws-css')) {
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
                <div class="ws-close" id="ws-close-btn" role="button" aria-label="返回"></div>
                <div class="ws-title" id="ws-title-text"></div>
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

            // 早前記錄（聊天室長期記憶）彈窗
            if (!doc.getElementById('ws-sum-overlay')) {
                const sumOverlay = doc.createElement('div');
                sumOverlay.id = 'ws-sum-overlay';
                sumOverlay.className = 'ws-memory-overlay';   // 只借它的版面樣式，內容與 id 各自獨立
                sumOverlay.innerHTML = `
                    <div class="ws-memory-panel">
                        <div class="ws-memory-header">
                            <div class="ws-memory-title">早前記錄</div>
                            <div class="ws-memory-close" id="ws-sum-close">×</div>
                        </div>
                        <div class="ws-memory-body" id="ws-sum-body"></div>
                        <div class="ws-memory-footer">
                            <button class="ws-memory-btn ws-memory-btn-cancel" id="ws-sum-merge" disabled>合併</button>
                            <button class="ws-memory-btn ws-memory-btn-cancel" id="ws-sum-run">現在整理</button>
                            <button class="ws-memory-btn ws-memory-btn-save" id="ws-sum-save">保存</button>
                        </div>
                    </div>
                `;
                if (container) container.appendChild(sumOverlay);
                doc.getElementById('ws-sum-close').onclick = () => { sumOverlay.classList.remove('show'); };
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

    // 💓 心跳「多久來一次」本來是一排檔位的滑桿（10 分鐘～一天）。她要自己打數字，
    //    所以檔位表整個拿掉了——想設 47 分鐘就打 47，不必遷就格子。
    const HB_MIN = 1, HB_MAX = 1440;   // 一分鐘 ～ 一天

    // 📚 世界書清單：關掉「吃這本的世界書」之後，人設要能去別本挑條目（視差那些從別的故事借來的人）。
    //    酒館助手的 API 名字不只一種，全試一遍；問不到就只剩當前這本，UI 會照實講。
    async function _bookNames() {
        const H = win.TavernHelper;
        const out = [];
        const add = (n) => { if (n && typeof n === 'string' && out.indexOf(n) < 0) out.push(n); };
        try {
            if (H && typeof H.getCharWorldbookNames === 'function') {
                const b = H.getCharWorldbookNames('current') || {};
                add(b.primary);
                (b.additional || []).forEach(add);
            } else if (H && typeof H.getCurrentCharPrimaryLorebook === 'function') {
                add(H.getCurrentCharPrimaryLorebook());
            }
        } catch (e) {}
        for (const fn of ['getWorldbookNames', 'getLorebooks', 'getWorldbooks']) {
            try { if (H && typeof H[fn] === 'function') ((await H[fn]()) || []).forEach(add); } catch (e) {}
        }
        return out;
    }
    // 一本世界書裡的條目（獨立版走 OS_WORLDBOOK，沒有「哪一本」的概念）
    async function _bookEntries(bookName) {
        try {
            const H = win.TavernHelper;
            if (!H && win.OS_WORLDBOOK && typeof win.OS_WORLDBOOK.getEnabledEntries === 'function') {
                const raw = await win.OS_WORLDBOOK.getEnabledEntries();
                return (raw || []).map(e => ({ uid: e.id, comment: e.title, content: e.content, keys: [e.category || ''] }));
            }
            if (!bookName || !H) return [];
            if (typeof H.getLorebookEntries === 'function') return (await H.getLorebookEntries(bookName)) || [];
            if (typeof H.getWorldbook === 'function') return (await H.getWorldbook(bookName)) || [];
        } catch (e) {}
        return [];
    }
    function _hbMinsText(mins) {
        const m = parseInt(mins, 10) || 180;
        if (m < 60) return m + ' 分鐘';
        if (m % 60 === 0) return (m / 60) + ' 小時';
        return Math.floor(m / 60) + ' 小時 ' + (m % 60) + ' 分';
    }

    // --- 主邏輯 ---
    // ❔ 每個開關旁邊問號點開的說明（AUI.helpBtn），面板上不掛說明文字
    try {
        const _A = win.AUI || window.AUI;
        if (_A && _A.registerHelp) _A.registerHelp({
            ws_links: { title: '打開我傳的連結', body: '開了之後，你傳網址給他，他會先讀過那個網頁再回你。\n要登入才看得到的網站讀不到。' },
            ws_time:  { title: '他知道現在幾點、隔了多久', body: '開了，他會看到現在幾點、你隔多久才回，可能會說「怎麼這麼久才理我」。\n關著，他完全不提時間。跑團時故事裡的時間跟現實不一樣，建議關著。' },
            ws_lore:  { title: '吃這本的世界書', body: '他回你的時候，看不看得到這本故事的世界設定和其他角色的資料。\n關掉後，「人設設置」可以去別本世界書挑條目。' },
            ws_story: { title: '吃這本的劇情', body: '他回你的時候，知不知道這本故事裡發生過什麼。\n世界書和劇情都關掉，他只記得你們聊過的話，從別的故事借來的角色適合這樣設。你的人設照樣會給他。' },
            ws_back:  { title: '帶回劇情', body: '開著：你們在這裡聊的，回到故事時會排在你下一句話前面交給劇情，只交一次。\n關著：劇情不會知道你們聊了什麼。' },
            ws_lobby: { title: '常駐角色', body: '開了，每個故事的手機裡都找得到他，在哪本故事裡聊都不會被算成那本的人。\n你們聊的預設不帶回劇情，要帶就打開「帶回劇情」。' },
            wx_look:  { title: '外觀', body: '主題：整支聊天 app 的長相，泡泡不在內。\n配色：底下那層顏色。\n黑夜模式：換明暗。\n套了主題之後，長相以主題為準。' },
            ws_hb:    { title: '他會主動找我', body: '開了，他會照「多久來一次」和「來的機率」自己傳訊息給你：時間到、而且你們有一陣子沒講話，才擲一次機率決定要不要開口。\n手機關著時，要先在設置打開「回覆交給伺服器跑」才會找你。' }
        });
    } catch (e) {}

    win.WX_CHAT_SETTINGS = {
        // 📱 給 VN 劇情手機用：那邊的聊天室對到同名聯絡人時，要吃他在微信這邊設好的聊天背景
        //    （同一個人兩邊長一樣，跟泡泡主題同一套規矩）。
        //    存的可能是網址，也可能是圖庫編號（img_…，圖在 OS_DB，避免 dataURL 撐爆 localStorage）。
        bgUrlFor: async function (chatId) {
            if (!chatId) return '';
            let raw = '';
            try { raw = (JSON.parse(localStorage.getItem('wx_chat_settings_' + chatId) || '{}') || {}).bgImage || ''; }
            catch (e) { return ''; }
            if (!raw) return '';
            if (String(raw).indexOf('img_') === 0) {
                try { return (win.OS_DB && win.OS_DB.getImage) ? ((await win.OS_DB.getImage(raw)) || '') : ''; }
                catch (e) { return ''; }
            }
            return raw;
        },

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
            
            // 標題＝這間聊天室的名字（群聊後面帶人數）。
            // 🚨 以前左上返回鈕寫「聊天詳情」、標題又寫「聊天詳情」，兩個一樣的字並排，看不出在誰的詳情裡。
            const _memberN = isGroup ? (chat.members ? chat.members.length : 1) : 0;
            const _setTitle = (name) => { titleEl.textContent = (name || chatId) + (isGroup ? ` (${_memberN})` : ''); };
            _setTitle(chatName);

            // 讀取設定
            const storageKey = `wx_chat_settings_${chatId}`;
            let settings = {};
            try { settings = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch(e) {}
            
            let bgImage = settings.bgImage || '';
            let avatarUrl = chat.customAvatar || '';
            let myAvatarUrl = chat.userAvatar || '';
            // 「我」在這間顯示的名字＝整支手機的微信暱稱（微信「我」頁那個），一個地方設定、每間都跟著走。
            // 以前這裡是一間一個 chat.userAlias，但它只有這張設定頁自己讀得到：不畫在氣泡上、也沒送給 AI。
            let myAlias = '';
            try { myAlias = win.WX_ME.name(); } catch (e) {}
            
            // 記憶關聯：私聊勾群聊、群聊勾私聊，送給模型時帶那幾間最近的訊息（os_api_engine 的 _wxLinkedMemory）
            const _lm = isGroup
                ? { field: 'linkedPrivateChats', limitField: 'privateMemoryMessageLimit', label: '私聊記憶', limitLabel: '每私聊消息數', unit: '個私聊', title: '選擇關聯私聊', empty: '暫無私聊' }
                : { field: 'linkedGroupChats', limitField: 'groupMemoryMessageLimit', label: '群聊記憶', limitLabel: '每群聊消息數', unit: '個群聊', title: '選擇關聯群聊', empty: '暫無群聊' };
            let linkedChats = Array.isArray(chat[_lm.field]) ? chat[_lm.field] : [];
            
            // 每間帶幾條（默認50條）
            let memoryMessageLimit = chat[_lm.limitField] || 50;
            if (typeof memoryMessageLimit !== 'number' || memoryMessageLimit < 1) {
                memoryMessageLimit = 50;
            }

            // 讀取「保留最近幾條」（聊天室長期記憶）。空白＝跟隨全域預設。
            let summaryKeepRecent = (chat.summaryKeepRecent != null && chat.summaryKeepRecent !== '') ? chat.summaryKeepRecent : '';
            // 👁 它在這間記住的我的樣子。頭像是一間一個，所以這格也是一間一個。
            const _AVS = win.WX_AVATAR_AI;
            const seeOn = !!(_AVS && _AVS.seeEnabled && _AVS.seeEnabled());
            const _seeM = (_AVS && _AVS.seeMemory) ? _AVS.seeMemory(chatId) : null;
            const seeText = (_seeM && _seeM.desc) ? String(_seeM.desc) : '還沒看過';
            let defKeep = (win.WX_SUMMARY && win.WX_SUMMARY.DEF_KEEP) ? win.WX_SUMMARY.DEF_KEEP : 40;
            try { const _g = parseInt(localStorage.getItem((win.WX_SUMMARY && win.WX_SUMMARY.KEEP_KEY) || 'wx_sum_keep_recent')); if (!isNaN(_g) && _g > 0) defKeep = _g; } catch (e) {}
            
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
                                <div class="ws-avatar-icon"><i class="fa-solid fa-camera"></i></div>
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
                                <div class="ws-avatar-icon"><i class="fa-solid fa-camera"></i></div>
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
                            <div id="persona-status" style="font-size:14px; margin-right:5px; color: var(--wx-ink-dim);">未設置</div>
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
                            <div id="group-note-status" style="font-size:14px; margin-right:5px; color: var(--wx-ink-dim);">未設置</div>
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
                                <div class="ws-avatar-icon"><i class="fa-solid fa-camera"></i></div>
                            </div>
                            <input type="file" id="file-my-avatar" class="ws-file-input-hidden" accept="image/*">
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
                            <select class="ws-input" id="sel-sticker-lib" style="text-align:right; max-width:150px; border:none; background:transparent; font-size:14px; color:var(--wx-ink-2);">${_stkLibOpts}</select>
                        </div>
                    </div>
                </div>
                
                <div class="ws-section-header">記憶關聯</div>
                <div class="ws-group">
                    <div class="ws-cell" id="btn-linked-memory" style="cursor:pointer;">
                        <div class="ws-label">${_lm.label}</div>
                        <div class="ws-right">
                            <div id="linked-memory-count" style="font-size:14px; margin-right:5px; color: var(--wx-ink-dim);">未選擇</div>
                            <div class="ws-arrow">›</div>
                        </div>
                    </div>
                    <div class="ws-cell">
                        <div class="ws-label">${_lm.limitLabel}</div>
                        <div class="ws-right">
                            <input class="ws-input" id="inp-memory-limit" type="number" min="1" max="500" value="${memoryMessageLimit}" placeholder="50" style="text-align: right; width: 80px;">
                            <div style="font-size:14px; margin-left: 5px; color: var(--wx-ink-dim);">條</div>
                        </div>
                    </div>
                </div>
                
                ${seeOn ? `
                <div class="ws-group">
                    <div class="ws-cell" id="btn-forget-avatar" style="cursor:pointer;">
                        <div class="ws-label">它記得我的樣子</div>
                        <div class="ws-right">
                            <div id="see-mem-text" style="font-size:14px; margin-right:5px; color:var(--wx-ink-dim); max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${seeText}</div>
                            <div class="ws-arrow">›</div>
                        </div>
                    </div>
                </div>` : ``}

                <div class="ws-group">
                    <div class="ws-cell" id="btn-chat-media" style="cursor:pointer;">
                        <div class="ws-label">聊天媒體</div>
                        <div class="ws-right">
                            <div id="chat-media-count" style="font-size:14px; margin-right:5px; color:var(--wx-ink-dim);"></div>
                            <div class="ws-arrow">›</div>
                        </div>
                    </div>
                </div>

                <div class="ws-group">
                    <label class="ws-cell ws-cell-switch">
                        <div class="ws-label">打開我傳的連結${(win.AUI && win.AUI.helpBtn) ? win.AUI.helpBtn('ws_links') : ''}</div>
                        <input type="checkbox" class="ws-switch" id="chk-read-links" ${chat.readLinks ? 'checked' : ''}>
                    </label>
                </div>

                <div class="ws-group">
                    <label class="ws-cell ws-cell-switch">
                        <div class="ws-label">他知道現在幾點、隔了多久${(win.AUI && win.AUI.helpBtn) ? win.AUI.helpBtn('ws_time') : ''}</div>
                        <input type="checkbox" class="ws-switch" id="chk-time-aware" ${chat.timeAware ? 'checked' : ''}>
                    </label>
                </div>

                <div class="ws-section-header">隔離</div>
                <div class="ws-group">
                    <label class="ws-cell ws-cell-switch">
                        <div class="ws-label">吃這本的世界書${(win.AUI && win.AUI.helpBtn) ? win.AUI.helpBtn('ws_lore') : ''}</div>
                        <input type="checkbox" class="ws-switch" id="chk-iso-lore" ${chat.noLore ? '' : 'checked'}>
                    </label>
                    <label class="ws-cell ws-cell-switch">
                        <div class="ws-label">吃這本的劇情${(win.AUI && win.AUI.helpBtn) ? win.AUI.helpBtn('ws_story') : ''}</div>
                        <input type="checkbox" class="ws-switch" id="chk-iso-story" ${chat.noHistory ? '' : 'checked'}>
                    </label>
                    <label class="ws-cell ws-cell-switch">
                        <div class="ws-label">帶回劇情${(win.AUI && win.AUI.helpBtn) ? win.AUI.helpBtn('ws_back') : ''}</div>
                        <input type="checkbox" class="ws-switch" id="chk-iso-back" ${(chat.noBack === true || (chat.noBack !== false && (chat.noHistory || chat.tavernChatId === (win.OS_DB && win.OS_DB.LOBBY_ID)))) ? '' : 'checked'}>
                    </label>
                </div>
                <div class="ws-group">
                    <label class="ws-cell ws-cell-switch">
                        <div class="ws-label">常駐角色${(win.AUI && win.AUI.helpBtn) ? win.AUI.helpBtn('ws_lobby') : ''}</div>
                        <input type="checkbox" class="ws-switch" id="chk-iso-lobby" ${chat.tavernChatId === (win.OS_DB && win.OS_DB.LOBBY_ID) ? 'checked' : ''} ${(win.OS_DB && win.OS_DB.currentChatId && win.OS_DB.currentChatId() != null) ? '' : 'disabled'}>
                    </label>
                </div>

                ${!isGroup ? `
                <div class="ws-group">
                    <label class="ws-cell ws-cell-switch">
                        <div class="ws-label">他會主動找我${(win.AUI && win.AUI.helpBtn) ? win.AUI.helpBtn('ws_hb') : ''}</div>
                        <input type="checkbox" class="ws-switch" id="chk-hb-on" ${chat.hbOn ? 'checked' : ''}>
                    </label>
                    <div class="ws-cell">
                        <div class="ws-label">多久來一次<span class="ws-label-sub" id="hb-mins-val"></span></div>
                        <div class="ws-right">
                            <input type="number" class="ws-input ws-num" id="hb-mins" inputmode="numeric" min="${HB_MIN}" max="${HB_MAX}" step="1" value="${parseInt(chat.hbMins, 10) || 180}">
                            <span class="ws-unit">分鐘</span>
                        </div>
                    </div>
                    <div class="ws-cell">
                        <div class="ws-label">來的機率</div>
                        <div class="ws-right">
                            <input type="number" class="ws-input ws-num" id="hb-chance" inputmode="numeric" min="0" max="100" step="1" value="${(chat.hbChance == null ? 60 : chat.hbChance)}">
                            <span class="ws-unit">%</span>
                        </div>
                    </div>
                </div>
                ` : ''}

                <div class="ws-section-header">聊天記憶</div>
                <div class="ws-group">
                    <div class="ws-cell" id="btn-chat-summary" style="cursor:pointer;">
                        <div class="ws-label">早前記錄</div>
                        <div class="ws-right">
                            <div id="chat-summary-state" style="font-size:14px; margin-right:5px; color:var(--wx-ink-dim);">—</div>
                            <div class="ws-arrow">›</div>
                        </div>
                    </div>
                    <div class="ws-cell">
                        <div class="ws-label">保留最近</div>
                        <div class="ws-right">
                            <input class="ws-input" id="inp-summary-keep" type="number" min="5" max="500" value="${summaryKeepRecent}" placeholder="${defKeep}" style="text-align: right; width: 80px;">
                            <div style="font-size:14px; margin-left: 5px; color: var(--wx-ink-dim);">條</div>
                        </div>
                    </div>
                </div>

                ${!isGroup ? `
                <div class="ws-group">
                    ${(chat.wxBlocked && !chat.wxBlockedByMe) ? `
                    <div class="ws-cell" id="btn-friend-verify" style="cursor:pointer;">
                        <div class="ws-label">發送朋友驗證</div>
                        <div class="ws-right"><div class="ws-arrow">›</div></div>
                    </div>` : ''}
                    <label class="ws-cell ws-cell-switch">
                        <div class="ws-label">加入黑名單</div>
                        <input type="checkbox" class="ws-switch" id="chk-blacklist" ${chat.wxBlockedByMe ? 'checked' : ''}>
                    </label>
                </div>
                ` : ''}

                <div class="ws-group">
                    <div class="ws-cell" id="btn-clear-chat" style="cursor:pointer;">
                        <div class="ws-label" style="color: var(--wx-danger);">清空聊天記錄</div>
                        <div class="ws-right"><div class="ws-arrow">›</div></div>
                    </div>
                </div>

                <div class="ws-footer">
                    <button class="ws-btn-save" id="btn-save">保存更改</button>
                    <button class="ws-btn-del" id="btn-delete-chat">刪除此聊天</button>
                </div>
            `;

            panel.classList.add('show');
            // 改備註名／群名時標題跟著變（還沒按保存也先看得到新名字；沒存就關掉，下次打開照舊）
            { const _ni = doc.getElementById('inp-name'); if (_ni) _ni.addEventListener('input', () => _setTitle(_ni.value.trim() || chatName)); }

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
            
            // 更新記憶關聯計數顯示
            {
                const countEl = doc.getElementById('linked-memory-count');
                if (countEl) {
                    if (linkedChats.length > 0) {
                        countEl.textContent = `已選擇 ${linkedChats.length} ${_lm.unit}`;
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
                inviteBtn.onclick = () => AUI.alert("邀請功能需要更新 WX_CONTACTS 模塊");
            }

            doc.getElementById('btn-bubble-settings').onclick = () => {
                if (win.WX_BUBBLE_SETTINGS && win.WX_BUBBLE_SETTINGS.open) win.WX_BUBBLE_SETTINGS.open(chatId);
            };

            // 忘掉它記住的我的樣子 → 下次進來會重看一次
            (function () {
                const btn = doc.getElementById('btn-forget-avatar');
                if (!btn) return;
                btn.onclick = function () {
                    const A = win.WX_AVATAR_AI;
                    if (A && A.clearSeeMemory) A.clearSeeMemory(chatId);
                    const t = doc.getElementById('see-mem-text');
                    if (t) t.textContent = '還沒看過';
                    try { AUI.toastr && AUI.toastr.info('忘掉了，下次會重看一次', '微信'); } catch (e) {}
                };
            })();

            // 聊天媒體：把這間聊天室的圖片／檔案／連結／位置攤出來
            (function () {
                const M = win.WX_CHAT_MEDIA;
                const btn = doc.getElementById('btn-chat-media');
                const cnt = doc.getElementById('chat-media-count');
                if (cnt && M && M.counts) {
                    const n = M.counts(chat);
                    const total = Object.keys(n).reduce(function (a, k) { return a + n[k]; }, 0);
                    cnt.textContent = total ? String(total) + ' 件' : '還沒有';
                }
                if (btn) btn.onclick = function () {
                    if (!M) { if (AUI.toastr) AUI.toastr.info('模塊還沒載入完，等一下再試'); return; }
                    M.open(chatId);
                };
            })();

            // 早前記錄（聊天室長期記憶）：看狀態、手動整理、改字、清除
            (function () {
                const S = win.WX_SUMMARY;
                const stateEl = doc.getElementById('chat-summary-state');
                const refreshState = () => {
                    if (!stateEl) return;
                    if (!S) { stateEl.textContent = '尚未載入'; return; }
                    const p = S.plan(chat);
                    const nodeCount = S.nodesOf ? S.nodesOf(chat).length : 0;
                    if (nodeCount) {
                        stateEl.textContent = '已整理 ' + p.covered + '／' + p.total + ' 則 · ' + nodeCount + ' 節';
                        stateEl.style.color = '#07c160';
                    } else if (p.total > p.keep) {
                        stateEl.textContent = '還沒整理';
                        stateEl.style.color = '#fa9d3b';
                    } else {
                        stateEl.textContent = '還不用整理';
                        stateEl.style.color = '#999';
                    }
                };
                refreshState();

                const sumBtn = doc.getElementById('btn-chat-summary');
                if (!sumBtn) return;
                // 一節一節列出來：每節可以改字、刪掉，勾兩節以上可以合併（wx_summary.js V2）
                sumBtn.onclick = () => {
                    const ov = doc.getElementById('ws-sum-overlay');
                    const body = doc.getElementById('ws-sum-body');
                    if (!ov || !body) return;
                    if (!S || !S.nodesOf) { if (AUI.toastr) AUI.toastr.info('記憶模塊還沒載入完，等一下再試'); return; }
                    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    const say = (kind, t) => { try { if (AUI.toastr && AUI.toastr[kind]) AUI.toastr[kind](t, '早前記錄'); } catch (e) {} };
                    const mergeBtn = doc.getElementById('ws-sum-merge');
                    const badgeOf = (n) => {
                        if (chat.noHistory === true) return ['is-off', '不算進故事'];
                        if (n.storyOnly) return ['is-off', '正文裡已經有'];
                        if (n.merged) return ['is-done', '已寫進故事'];
                        return ['is-wait', '還沒寫進故事'];
                    };
                    const syncMerge = () => {
                        const n = body.querySelectorAll('.ws-sum-pick:checked').length;
                        if (mergeBtn) { mergeBtn.disabled = n < 2; mergeBtn.textContent = n >= 2 ? `合併 (${n})` : '合併'; }
                    };
                    // 改過的字先存回去（合併、整理、刪節之前都要，不然畫面重畫就丟了）
                    const saveEdits = async () => {
                        const tas = body.querySelectorAll('.ws-sum-node-text');
                        for (const ta of tas) { await S.updateNode(chatId, ta.dataset.id, ta.value); }
                    };
                    const render = () => {
                        const p = S.plan(chat);
                        const nodes = S.nodesOf(chat);
                        body.innerHTML = `<div class="ws-sum-intro">一共 ${p.total} 則訊息。送給 AI 時帶最近 ${p.keep} 則原文，更早的靠下面這幾節。每累積 ${S.minFold()} 則會自動整理一節；太長時最舊、已經寫進故事的幾節會自動併起來。</div>`
                            + (nodes.length ? nodes.map((n, i) => {
                                const b = badgeOf(n);
                                return `<div class="ws-sum-node" data-id="${esc(n.id)}">
                                    <div class="ws-sum-node-head">
                                        <input type="checkbox" class="ws-sum-pick" data-id="${esc(n.id)}">
                                        <span class="ws-sum-node-when">第 ${i + 1} 節${n.storyDate ? ' · ' + esc(n.storyDate) : ''}</span>
                                        <span class="ws-sum-badge ${b[0]}">${b[1]}</span>
                                        <button type="button" class="ws-sum-del" data-id="${esc(n.id)}" title="刪掉這一節"><i class="fa-regular fa-trash-can"></i></button>
                                    </div>
                                    <textarea class="ws-sum-node-text" data-id="${esc(n.id)}">${esc(n.text)}</textarea>
                                </div>`;
                            }).join('') : `<div class="ws-sum-empty">還沒有整理過。按下面的「現在整理」，讓它把早前的訊息寫成一節。</div>`);
                        body.querySelectorAll('.ws-sum-pick').forEach(c => { c.onchange = syncMerge; });
                        body.querySelectorAll('.ws-sum-del').forEach(btn => {
                            btn.onclick = async () => {
                                if (!await AUI.confirm('刪掉這一節？刪了就找不回來，這段對話也不會再重新整理。')) return;
                                await saveEdits();
                                await S.deleteNode(chatId, btn.dataset.id);
                                render(); refreshState();
                            };
                        });
                        syncMerge();
                    };
                    render();
                    ov.classList.add('show');

                    doc.getElementById('ws-sum-run').onclick = async () => {
                        const b = doc.getElementById('ws-sum-run');
                        const t0 = b.textContent;
                        b.disabled = true; b.textContent = '整理中…';
                        try {
                            await saveEdits();
                            const r = await S.summarizeChat(chatId, { force: true });
                            render(); refreshState();
                            if (r && r.ok) say('success', '寫了 ' + r.made + ' 節');
                            else say('info', (r && r.reason) || '這次沒有整理');
                        } catch (e) {
                            say('error', (e && e.message) || '整理失敗');
                        } finally { b.disabled = false; b.textContent = t0; }
                    };

                    if (mergeBtn) mergeBtn.onclick = async () => {
                        const ids = Array.from(body.querySelectorAll('.ws-sum-pick:checked')).map(c => c.dataset.id);
                        if (ids.length < 2) return;
                        const t0 = mergeBtn.textContent;
                        mergeBtn.disabled = true; mergeBtn.textContent = '合併中…';
                        try {
                            await saveEdits();
                            const r = await S.mergeNodes(chatId, ids);
                            if (r && r.ok) { render(); refreshState(); say('success', ids.length + ' 節併成一節了'); }
                            else { say('info', (r && r.reason) || '這次沒有合併'); mergeBtn.textContent = t0; syncMerge(); }
                        } catch (e) {
                            say('error', (e && e.message) || '合併失敗'); mergeBtn.textContent = t0; syncMerge();
                        }
                    };

                    doc.getElementById('ws-sum-save').onclick = async () => {
                        await saveEdits();
                        refreshState();
                        ov.classList.remove('show');
                    };
                };
            })();
            
            // 記憶關聯按鈕：私聊列群聊、群聊列私聊
            {
                const memoryBtn = doc.getElementById('btn-linked-memory');
                if (memoryBtn) {
                    memoryBtn.onclick = () => {
                        const memoryOverlay = doc.getElementById('ws-memory-overlay');
                        const memoryBody = doc.getElementById('ws-memory-body');
                        if (!memoryOverlay || !memoryBody) return;
                        
                        // 獲取所有群聊
                        const allChats = app.GLOBAL_CHATS || {};
                        // 變數名沿用舊的：私聊這間列群聊，群聊這間列私聊（群裡的人排前面）
                        const groupChats = Object.values(allChats).filter(c => c && c.id !== chatId && !!c.isGroup === !isGroup);
                        if (isGroup) {
                            const _mem = Array.isArray(chat.members) ? chat.members : [];
                            groupChats.sort((a, b) => (_mem.includes(b.id) ? 1 : 0) - (_mem.includes(a.id) ? 1 : 0));
                        }
                        const _mTitle = memoryOverlay.querySelector('.ws-memory-title');
                        if (_mTitle) _mTitle.textContent = _lm.title;
                        
                        // 構建群聊列表HTML
                        let html = '';
                        if (groupChats.length === 0) {
                            html = '<div style="text-align: center; padding: 40px; color: var(--wx-ink-dim);">' + _lm.empty + '</div>';
                        } else {
                            groupChats.forEach(groupChat => {
                                const isChecked = linkedChats.includes(groupChat.id);
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
                                chat[_lm.field] = selectedIds;
                                linkedChats = selectedIds;   // 再打開彈窗時勾的是剛存的
                                
                                // 保存消息數量限制
                                const limitInput = doc.getElementById('inp-memory-limit');
                                if (limitInput) {
                                    const limitValue = parseInt(limitInput.value);
                                    if (!isNaN(limitValue) && limitValue >= 1 && limitValue <= 500) {
                                        chat[_lm.limitField] = limitValue;
                                    } else {
                                        chat[_lm.limitField] = 50; // 無效值時使用默認值
                                    }
                                }
                                
                                if (app.saveChats) app.saveChats();
                                if (win.OS_DB && win.OS_DB.saveApiChat) win.OS_DB.saveApiChat(chatId, chat);
                                
                                // 更新顯示
                                const countEl = doc.getElementById('linked-memory-count');
                                if (countEl) {
                                    if (selectedIds.length > 0) {
                                        countEl.textContent = `已選擇 ${selectedIds.length} ${_lm.unit}`;
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
                
            }
            if (!isGroup) {
                // 人設設置按鈕（僅私聊）
                const personaBtn = doc.getElementById('btn-persona-settings');
                if (personaBtn) {
                    personaBtn.onclick = async () => {
                        const personaOverlay = doc.getElementById('ws-persona-overlay');
                        const personaBody = doc.getElementById('ws-persona-body');
                        if (!personaOverlay || !personaBody) return;
                        
                        // 🚨 每次打開都重讀這間現在存著的。以前用的是設定頁剛打開時抄下來的那份：
                        //    存完不回頭更新，同一頁再打開這格就是「存之前的舊字」（她：保存再打開字變少了），
                        //    這時再按一次保存，剛寫的就被舊的蓋掉。
                        personaFromLorebook = chat.personaFromLorebook || null;
                        personaCustom = chat.personaCustom || (!chat.personaFromLorebook && chat.persona ? chat.persona : '');

                        // 📚 從哪一本世界書挑：預設是這張卡的主世界書；她可以翻到別本
                        //    （視差那些從別的故事借過來的人，人設條目本來就不在這本裡）。
                        let curBook = chat.personaLoreBook || '';
                        const books = await _bookNames();
                        if (!curBook || books.indexOf(curBook) < 0) curBook = books[0] || '';

                        const escapeHtml = (t) => { const d = doc.createElement('div'); d.textContent = t; return d.innerHTML; };

                        let html = '';
                        html += '<div class="ws-persona-section">';
                        html += '<div class="ws-persona-section-title">從世界書選擇</div>';
                        if (books.length > 1) {
                            html += '<select class="ws-persona-book" id="ws-persona-book">'
                                 + books.map(b => `<option value="${escapeHtml(b)}"${b === curBook ? ' selected' : ''}>${escapeHtml(b)}</option>`).join('')
                                 + '</select>';
                        } else if (curBook) {
                            html += `<div class="ws-persona-booknote">${escapeHtml(curBook)}</div>`;
                        } else {
                            html += '<div class="ws-persona-booknote">這台讀不到世界書</div>';
                        }
                        html += '<div id="ws-persona-entries"></div>';
                        html += '</div>';

                        // 第二欄：額外補充（世界書有的不用再填，只補這個聊天室特有的內容）
                        html += '<div class="ws-persona-section">';
                        html += '<div class="ws-persona-section-title">額外補充 <span style="font-weight:400;color:var(--wx-ink-dim);font-size:11px;">（選填，疊加在世界書條目之上）</span></div>';
                        html += '<div class="ws-persona-input-wrapper">';
                        html += `<textarea class="ws-persona-textarea" id="inp-persona-custom" placeholder="例：這個聊天室裡他是臥底身份，對方不知道他的真實職業...">${escapeHtml(personaCustom || '')}</textarea>`;
                        html += '</div>';
                        html += '</div>';

                        personaBody.innerHTML = html;
                        personaOverlay.classList.add('show');

                        // 條目清單：換一本就重畫（uid 只在自己那本裡有意義，換本等於重選）
                        const paintEntries = async (bookName) => {
                            const box = doc.getElementById('ws-persona-entries');
                            if (!box) return;
                            box.innerHTML = '<div style="padding:16px;text-align:center;color:var(--wx-ink-dim);">讀取中…</div>';
                            let entries = [];
                            try { entries = await _bookEntries(bookName); }
                            catch (e) { box.innerHTML = '<div style="padding:20px;text-align:center;color:var(--wx-danger);">這本讀不到</div>'; return; }
                            // 沒設過就拿舊的 chat.persona 回頭比對，把當初那一條勾回來
                            if (!personaFromLorebook && chat.persona) {
                                const matched = entries.find(e => (e.content || '').trim() === chat.persona.trim());
                                if (matched) personaFromLorebook = matched.uid;
                            }
                            if (!entries.length) {
                                box.innerHTML = '<div style="padding:20px;text-align:center;color:var(--wx-ink-dim);">這本沒有條目</div>';
                                return;
                            }
                            box.innerHTML = entries.map(entry => {
                                const isSelected = personaFromLorebook === entry.uid;
                                let content = (entry.content || '').replace(/<[^>]+>/g, '').trim();
                                if (content.length > 200) content = content.substring(0, 200) + '...';
                                const comment = (entry.comment || entry.name || `條目 #${entry.uid}`).trim();
                                const keys = (entry.keys && entry.keys.length) ? entry.keys.join(', ') : '(無關鍵字)';
                                return `<div class="ws-persona-entry" data-entry-uid="${entry.uid}">
                                        <input type="radio" name="persona-lorebook" class="ws-persona-entry-checkbox" value="${entry.uid}" id="persona-radio-${entry.uid}" ${isSelected ? 'checked' : ''}>
                                        <div class="ws-persona-entry-info">
                                            <div class="ws-persona-entry-name">${escapeHtml(comment)}</div>
                                            <div class="ws-persona-entry-keys">${escapeHtml(keys)}</div>
                                            <div class="ws-persona-entry-content">${escapeHtml(content)}</div>
                                        </div></div>`;
                            }).join('');
                            // 再點一次取消選擇
                            box.querySelectorAll('.ws-persona-entry').forEach(entryEl => {
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
                        };
                        await paintEntries(curBook);
                        const bookSel = doc.getElementById('ws-persona-book');
                        if (bookSel) bookSel.onchange = async () => {
                            curBook = bookSel.value;
                            personaFromLorebook = null;   // 換了一本，原本勾的那條不在這裡了
                            await paintEntries(curBook);
                        };

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
                                chat.personaLoreBook = selectedUid ? (curBook || '') : '';   // uid 只在它自己那本裡有意義
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
                        
                        // 🚨 同人設那格：每次打開重讀這間存著的，別用設定頁剛打開時抄的舊字
                        groupNoteFromLorebook = chat.groupNoteFromLorebook || null;
                        groupNoteCustom = chat.groupNoteCustom || '';

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
                                html += '<div style="padding:20px;text-align:center;color:var(--wx-ink-dim);">世界書中沒有條目</div>';
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
                            html += '<div style="padding:20px;text-align:center;color:var(--wx-danger);">獲取世界書條目失敗</div>';
                        }
                        html += '</div>';
                        
                        // 第二欄：自定義輸入
                        html += '<div class="ws-persona-section">';
                        html += '<div class="ws-persona-section-title">或直接輸入備註</div>';
                        html += '<div class="ws-persona-input-wrapper">';
                        html += `<textarea class="ws-persona-textarea" id="inp-group-note-custom" placeholder="在此輸入群組關係網等備註內容...">${String(groupNoteCustom || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>`;
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
            doc.getElementById('btn-clear-chat').onclick = async () => {
                if (await AUI.confirm('確定要清空記錄嗎？')) {
                    // 紅包／轉帳／禮物的已領狀態跟著記錄一起清，不然同一個單號再出現會直接顯示已領
                    try { const MM = win.WX_MESSAGE_MANAGER; if (MM && MM.purgeProtocolState) MM.purgeProtocolState(chatId, chat.messages); } catch (e) {}
                    try { if (win.WX_CARDS) win.WX_CARDS.clear(chatId); } catch (e) {}
                    chat.messages = []; chat.pushedCount = 0; chat.renderedCount = 0;
                    if (app.GLOBAL_ACTIVE_ID === chatId && app.render) app.render();
                    if (win.OS_DB && win.OS_DB.saveApiChat) win.OS_DB.saveApiChat(chatId, chat);
                    app.saveChats();
                    panel.classList.remove('show');
                }
            };
            // 🔒 黑名單／朋友驗證（wx_core 的 blockContact／unblockContact／sendFriendRequest）
            {
                const _bl = doc.getElementById('chk-blacklist');
                if (_bl) _bl.onchange = async () => {
                    const done = _bl.checked ? await app.blockContact(chatId) : await app.unblockContact(chatId);
                    if (!done) _bl.checked = !!chat.wxBlockedByMe;   // 取消了就撥回去
                };
                const _fv = doc.getElementById('btn-friend-verify');
                if (_fv) _fv.onclick = () => { panel.classList.remove('show'); app.sendFriendRequest(chatId); };
            }
            // 🧳 隔離：這間要不要吃「這本」的世界書與劇情。切了就存，發訊息時 os_api_engine 會看。
            {
                const _l = doc.getElementById('chk-iso-lore'), _s = doc.getElementById('chk-iso-story'), _b = doc.getElementById('chk-iso-back');
                const _saveIso = () => {
                    if (app.saveChats) app.saveChats();
                    if (win.OS_DB && win.OS_DB.saveApiChat) win.OS_DB.saveApiChat(chatId, chat);
                };
                // 存的是「不吃」：沒動過的舊聊天室一律照舊吃，不會因為新欄位而改行為
                if (_l) _l.onchange = () => { if (_l.checked) delete chat.noLore; else chat.noLore = true; _saveIso(); };
                if (_s) _s.onchange = () => {
                    if (_s.checked) delete chat.noHistory; else chat.noHistory = true;
                    // 關掉劇情的人跟這本故事無關 → 帶回劇情一起關（看得到，要的話可以再打開）
                    if (!_s.checked && _b && _b.checked) { _b.checked = false; chat.noBack = true; }
                    _saveIso();
                };
                // 🏠 常駐角色：聊天室蓋大廳章、通訊錄搬到大廳那份；關掉＝歸回當下這本故事
                const _lb = doc.getElementById('chk-iso-lobby');
                if (_lb) _lb.onchange = () => {
                    const L = win.OS_DB && win.OS_DB.LOBBY_ID;
                    const cur = win.OS_DB && win.OS_DB.currentChatId ? win.OS_DB.currentChatId() : null;
                    if (!L) return;
                    if (_lb.checked) chat.tavernChatId = L;
                    else if (cur != null) chat.tavernChatId = cur;
                    else { _lb.checked = true; return; }
                    try { if (win.WX_CONTACTS && win.WX_CONTACTS.setLobby) win.WX_CONTACTS.setLobby(chatId, _lb.checked); } catch (e) {}
                    // 帶回劇情那格照新身分重畫（大廳的人沒動過＝不帶）
                    if (_b && chat.noBack == null) _b.checked = !(_lb.checked || chat.noHistory);
                    _saveIso();
                };
                // 帶回劇情：存「關」為 true、在關了劇情的聊天室裡硬要打開存 false
                if (_b) _b.onchange = () => {
                    if (_b.checked) { if (chat.noHistory === true || (win.OS_DB && chat.tavernChatId === win.OS_DB.LOBBY_ID)) chat.noBack = false; else delete chat.noBack; }
                    else chat.noBack = true;
                    _saveIso();
                };
            }

            // 💓 他會主動找我：一間一組（開關＋多久一次＋機率），動一下就存。引擎在 os_heartbeat.js
            {
                const _on = doc.getElementById('chk-hb-on');
                const _mins = doc.getElementById('hb-mins'), _minsV = doc.getElementById('hb-mins-val');
                const _ch = doc.getElementById('hb-chance');
                const _saveHb = () => {
                    if (app.saveChats) app.saveChats();
                    if (win.OS_DB && win.OS_DB.saveApiChat) win.OS_DB.saveApiChat(chatId, chat);
                };
                // 打字中不夾、不存：夾了游標會亂跳，存了每按一個鍵寫一次。離開格子或按 Enter 才收。
                const _clamp = (v, lo, hi, def) => {
                    const n = parseInt(v, 10);
                    if (!isFinite(n)) return def;
                    return Math.min(hi, Math.max(lo, n));
                };
                const _paint = () => {
                    if (!_minsV) return;
                    const m = parseInt(_mins && _mins.value, 10);
                    // 超過一小時才換算給她看——「90 分鐘」自己看得懂，「480 分鐘」看不出是八小時
                    _minsV.textContent = (isFinite(m) && m >= 60) ? _hbMinsText(m) : '';
                };
                if (_on) _on.onchange = () => { if (_on.checked) chat.hbOn = true; else delete chat.hbOn; _saveHb(); };
                if (_mins) {
                    _mins.oninput = _paint;
                    _mins.onchange = () => {
                        const v = _clamp(_mins.value, HB_MIN, HB_MAX, 180);
                        _mins.value = v; chat.hbMins = v; _paint(); _saveHb();
                    };
                }
                if (_ch) {
                    _ch.onchange = () => {
                        const v = _clamp(_ch.value, 0, 100, 60);
                        _ch.value = v; chat.hbChance = v; _saveHb();
                    };
                }
                // 手機鍵盤的「完成」不一定送 change，按 Enter 也要收得起來
                [_mins, _ch].forEach(function (el) {
                    if (el) el.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } };
                });
                _paint();
            }
            // ⏰ 時間感知：一間一個開關，切了就存。組上下文時 os_api_engine 會看（時間分隔、間隔旁註、現在幾點）
            {
                const _ta = doc.getElementById('chk-time-aware');
                if (_ta) _ta.onchange = () => {
                    if (_ta.checked) chat.timeAware = true; else delete chat.timeAware;
                    if (app.saveChats) app.saveChats();
                    if (win.OS_DB && win.OS_DB.saveApiChat) win.OS_DB.saveApiChat(chatId, chat);
                };
            }
            // 🔗 打開我傳的連結：一間一個開關，切了就存（不用再按保存）。實際讀網頁在 wx_core 的 _prepareLinks
            {
                const _rl = doc.getElementById('chk-read-links');
                if (_rl) _rl.onchange = () => {
                    if (_rl.checked) chat.readLinks = true; else delete chat.readLinks;
                    if (app.saveChats) app.saveChats();
                    if (win.OS_DB && win.OS_DB.saveApiChat) win.OS_DB.saveApiChat(chatId, chat);
                };
            }
            doc.getElementById('btn-delete-chat').onclick = async () => {
                if (await AUI.confirm('確定要刪除聊天室嗎？')) {
                    if (win.wxApp && win.wxApp.deleteChat) win.wxApp.deleteChat(chatId);
                    if (win.OS_DB && win.OS_DB.deleteApiChat) win.OS_DB.deleteApiChat(chatId);
                    try { if (win.WX_NOTEBOOK && win.WX_NOTEBOOK.removeChat) win.WX_NOTEBOOK.removeChat(chatId); } catch (e) {}   // 📒 記事本跟著聊天室一起刪
                    panel.classList.remove('show');
                }
            };
            
            // 「清除紅包/轉帳/禮物數據」那顆單獨的鈕拿掉了：它一按是全部聊天室一起清。
            //   現在刪訊息、清空聊天記錄、刪除此聊天都會把那幾則帶的紅包/轉帳/禮物狀態一起清（purgeProtocolState）。

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
                    let hasChanges = false;

                    // 🚨 群名跟私聊備註是兩件事，通知與否照現實微信走：
                    //   私聊那個是「你給對方的備註」，只有你看得到，改了不會通知任何人；
                    //   群名是全群都看得到的東西，微信會在群裡留一條灰字。
                    //   「我的暱稱」（群名片）改了也不通知——現實微信同樣不通知，所以這裡不動它。
                    if (newName && newName !== chatName) {
                        if (isGroup) {
                            let _me = 'User';
                            try { _me = win.WX_ME.name() || 'User'; } catch (e) {}
                            if (!Array.isArray(chat.messages)) chat.messages = [];
                            chat.messages.push({ type: 'system', content: _me + ' 把群名改成「' + newName + '」', isMe: false });
                        }
                        chat.name = newName; hasChanges = true;
                    }
                    if (newBio !== chatDesc) { chat.desc = newBio; chat.bio = newBio; hasChanges = true; }
                    if (myAvatarUrl !== (chat.userAvatar || "")) { chat.userAvatar = myAvatarUrl; hasChanges = true; }
                    if (avatarUrl !== (chat.customAvatar || "")) { chat.customAvatar = avatarUrl; hasChanges = true; }
                    
                    // 保存記憶關聯每間帶幾條（私聊、群聊各存各的欄位）
                    {
                        const limitInput = doc.getElementById('inp-memory-limit');
                        if (limitInput) {
                            const limitValue = parseInt(limitInput.value);
                            if (!isNaN(limitValue) && limitValue >= 1 && limitValue <= 500) {
                                if (chat[_lm.limitField] !== limitValue) {
                                    chat[_lm.limitField] = limitValue;
                                    hasChanges = true;
                                }
                            }
                        }
                    }

                    // 保存「保留最近幾條」（聊天室長期記憶；留白＝跟隨全域預設）
                    const keepInput = doc.getElementById('inp-summary-keep');
                    if (keepInput) {
                        const raw = String(keepInput.value || '').trim();
                        let next;
                        if (raw === '') { next = null; }
                        else {
                            const v = parseInt(raw);
                            next = (!isNaN(v) && v >= 5 && v <= 500) ? v : null;
                        }
                        const prev = (chat.summaryKeepRecent != null) ? chat.summaryKeepRecent : null;
                        if (next !== prev) {
                            if (next === null) delete chat.summaryKeepRecent; else chat.summaryKeepRecent = next;
                            hasChanges = true;
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

                    AUI.alert("保存成功！");
                    panel.classList.remove('show');

                } catch (e) {
                    console.error(e);
                    AUI.alert("保存失敗：" + e.message);
                } finally {
                    btn.innerText = "保存更改";
                    btn.disabled = false;
                }
            };
        }
    };
})();