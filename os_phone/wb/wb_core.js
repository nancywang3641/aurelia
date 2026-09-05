// ----------------------------------------------------------------
// [微博] wb_core.js (V6.5 - Animation Fix)
// 職責：微博核心邏輯
// 升級：修復詳情頁互動時動畫重播問題，改為只更新評論列表區域。
// ----------------------------------------------------------------
(async function() {
    console.log('[Weibo] App Core V6.5 (Animation Fix) Loaded');
    const win = window.parent || window;
    const doc = win.document;

    // --- 依賴檢查 ---
    if (window.WB_THEME) { window.WB_THEME.inject(doc); }
    if (!win.WB_VIEW) { console.error('錯誤：未檢測到 wb_view.js'); return; }
    if (!win.OS_DB) { console.error('錯誤：未檢測到 os_db.js'); return; }

    let GLOBAL_POSTS = [];
    let CURRENT_TAB = 'home';
    let APP_CONTAINER = null;
    let LAST_USER_HASH = "";
    let CURRENT_OPEN_POST_ID = null;
    let DARK_MODE = localStorage.getItem('wb_dark_mode') === 'true';

    win.wbApp = {
        
        isLoading: false, 

        // --- 1. 啟動與數據加載 ---
        init: async function() {
            try {
                const savedPosts = await win.OS_DB.getAllWbPosts();
                if (savedPosts && savedPosts.length > 0) {
                    GLOBAL_POSTS = savedPosts;
                    console.log(`[Weibo] 成功讀取 ${GLOBAL_POSTS.length} 條存檔`);
                }
            } catch (e) {
                console.error("[Weibo] 讀取存檔失敗:", e);
            }
        },

        switchTab: function(tab) {
            CURRENT_TAB = tab;
            this.render();
        },

        openDetail: function(postId) {
            const post = GLOBAL_POSTS.find(p => p.id === postId);
            if (!post) return;
            CURRENT_OPEN_POST_ID = postId;
            const container = doc.getElementById('wb-detail-container');
            if (container) {
                container.innerHTML = win.WB_VIEW.renderDetailPage(post);
            }
        },

        closeDetail: function() {
            CURRENT_OPEN_POST_ID = null;
            const container = doc.getElementById('wb-detail-container');
            if (container) { container.innerHTML = ''; }
            this.render(); 
        },

        render: function() {
            if (APP_CONTAINER && win.WB_VIEW && typeof win.WB_VIEW.renderApp === 'function') {
                // 如果正在查看詳情頁，只更新評論列表，避免重新觸發動畫
                if (CURRENT_OPEN_POST_ID) {
                    const post = GLOBAL_POSTS.find(p => p.id === CURRENT_OPEN_POST_ID);
                    if (post) {
                        const commentListEl = doc.getElementById('wb-comment-list');
                        if (commentListEl && win.WB_VIEW.renderCommentList) {
                            // 只更新評論列表 HTML
                            commentListEl.innerHTML = win.WB_VIEW.renderCommentList(post);
                            // 更新評論數量顯示
                            const commentHeader = doc.querySelector('.wb-comment-header');
                            if (commentHeader) {
                                commentHeader.textContent = `評論 ${post.comments ? post.comments.length : 0}`;
                            }
                            // 重置載入更多按鈕狀態
                            if (!this.isLoading) {
                                const loadMoreBtn = doc.getElementById('wb-load-more-btn');
                                if (loadMoreBtn) {
                                    loadMoreBtn.classList.remove('wb-load-more-loading');
                                    loadMoreBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> 載入更多評論';
                                    loadMoreBtn.style.pointerEvents = '';
                                }
                            }
                            return; // 只更新評論部分，不重新渲染整個頁面
                        }
                    }
                }

                // 正常渲染主頁面
                APP_CONTAINER.innerHTML = win.WB_VIEW.renderApp(GLOBAL_POSTS, CURRENT_TAB, this.isLoading, DARK_MODE);
            }
        },

        // --- 發文 ---
        _compose: null,   // { text, imgDesc, photo }；null = 沒開

        _renderCompose: function() {
            const host = (APP_CONTAINER && APP_CONTAINER.querySelector('.wb-shell')) || APP_CONTAINER;
            if (!host) return;
            const old = host.querySelector('.wb-compose-mask');
            if (old) old.remove();
            if (!this._compose) return;
            const holder = doc.createElement('div');
            holder.innerHTML = win.WB_VIEW.renderCompose(this._compose);
            host.appendChild(holder.firstElementChild);
            const ta = host.querySelector('#wb-compose-text');
            if (ta) ta.focus();
        },
        _readCompose: function() {
            if (!this._compose) return;
            const ta = doc.getElementById('wb-compose-text');
            if (ta) this._compose.text = ta.value;
        },
        openCompose: function() {
            this._compose = { text: '', imgDesc: '', photo: '' };
            this._renderCompose();
        },
        closeCompose: function() {
            this._compose = null;
            this._renderCompose();
        },
        composePickImage: async function() {
            this._readCompose();
            const pick = await this._sheet([
                { key: 'desc', icon: 'fa-regular fa-image', label: '寫一句描述', hint: '之後可展開生成' },
                { key: 'photo', icon: 'fa-solid fa-camera', label: '選一張照片', hint: '相簿或相機' },
            ]);
            if (pick === 'desc') return this.composeDescribe();
            if (pick === 'photo') return this.composePickPhoto();
        },
        composeDescribe: async function() {
            this._readCompose();
            if (!this._compose) return;
            const v = await this._prompt('描述這張圖', this._compose.imgDesc || '', '例如：桌上一盤咖哩飯，窗邊有陽光');
            if (v == null || !this._compose) return;
            this._compose.imgDesc = String(v).trim();
            if (this._compose.imgDesc) this._compose.photo = '';
            this._renderCompose();
        },
        composePickPhoto: async function() {
            this._readCompose();
            const PI = win.OS_PHONE_IMAGE || window.OS_PHONE_IMAGE;
            if (!PI || !PI.pickPhoto) return;
            let url = '';
            try { url = await PI.pickPhoto(); } catch (e) { console.warn('[Weibo] 選照片失敗:', e); this._showToast('照片讀不進來'); }
            if (!url || !this._compose) return;
            this._compose.photo = url;
            this._compose.imgDesc = '';
            this._renderCompose();
        },
        composeClearImage: function() {
            this._readCompose();
            if (!this._compose) return;
            this._compose.photo = '';
            this._compose.imgDesc = '';
            this._renderCompose();
        },
        submitCompose: async function() {
            this._readCompose();
            const c = this._compose;
            if (!c) return;
            const text = String(c.text || '').trim();
            const imgDesc = String(c.imgDesc || '').trim();
            if (!text && !c.photo && !imgDesc) { this._showToast('先寫點什麼'); return; }
            let name = 'User', avatar = '';
            try { const acc = win.WB_ACCOUNT.getCurrentAccount(); name = acc.weiboNickname || acc.realName || 'User'; avatar = acc.avatar || ''; } catch (e) {}
            const post = {
                id: 'post_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                user: name,
                content: text,
                avatar: avatar || win.WB_VIEW.getAvatar(name),
                time: '剛剛',
                likes: 0,
                comments: [],
                media: c.photo ? { type: 'image', desc: c.photo } : (imgDesc ? { type: 'image', desc: imgDesc } : null),
                isMe: true,
                timestamp: Date.now()
            };
            GLOBAL_POSTS.unshift(post);
            await win.OS_DB.saveWbPost(post);
            this._compose = null;
            this.render();
            this._showToast('發佈了');
        },

        // --- 互動邏輯 ---
        sendComment: async function(postId) {
            const inputEl = doc.getElementById('wb-comment-input');
            if (!inputEl) return;
            const content = inputEl.value.trim();
            if (!content) return;

            const post = GLOBAL_POSTS.find(p => p.id === postId);
            if (post) {
                if (!post.comments) post.comments = [];

                // 獲取顯示名稱：優先從 WB_ACCOUNT 讀取最新值
                let myName = '我';
                console.log('[sendComment] WB_ACCOUNT 存在?', !!win.WB_ACCOUNT);
                if (win.WB_ACCOUNT) {
                    const acc = win.WB_ACCOUNT.getCurrentAccount();
                    console.log('[sendComment] 當前帳號資料:', acc);
                    console.log('[sendComment] weiboNickname:', acc.weiboNickname);
                    console.log('[sendComment] realName:', acc.realName);
                    myName = acc.weiboNickname || acc.realName || 'User';
                    console.log('[sendComment] 最終使用的名字:', myName);
                } else {
                    console.error('[sendComment] WB_ACCOUNT 未載入！');
                }

                post.comments.push({ author: myName, content: content, time: Date.now() });
                await win.OS_DB.saveWbPost(post);
                inputEl.value = '';
                this.render(); 
            }
        },

        deleteComment: async function(postId, commentIndex) {
            if (!(await this._ask('刪除這條評論？', '刪除'))) return;
            const post = GLOBAL_POSTS.find(p => p.id === postId);
            if (post && post.comments) {
                post.comments.splice(commentIndex, 1);
                await win.OS_DB.saveWbPost(post);
                this.render();
            }
        },

        deletePost: async function(postId) {
            if (!(await this._ask('刪除這條微博？', '刪除'))) return;
            GLOBAL_POSTS = GLOBAL_POSTS.filter(p => p.id !== postId);
            await win.OS_DB.deleteWbPost(postId);
            if (CURRENT_OPEN_POST_ID === postId) {
                this.closeDetail();
            } else {
                this.render();
            }
        },

        clearAllData: async function() {
            const n = GLOBAL_POSTS.length;
            if (!(await this._ask(`清空全部 ${n} 條微博？刪了就回不來。`, '清空'))) return;
            await win.OS_DB.clearWbPosts();
            GLOBAL_POSTS = [];
            this.render();
            this._showToast('已清空');
        },

        // --- 編輯功能區 ---

        editBio: async function() {
            const wbAccount = win.WB_ACCOUNT || window.WB_ACCOUNT;
            if (!wbAccount) return;
            const account = wbAccount.getCurrentAccount();
            const newBio = await this._prompt('個性簽名', account.bio || '', '寫一句');
            if (newBio !== null) {
                wbAccount.updateCurrentBio(newBio.trim());
                this.render(); 
            }
        },

        // 🔥 新增：編輯暱稱 (這是解決你問題的關鍵！)
        editNickname: async function() {
            const wbAccount = win.WB_ACCOUNT || window.WB_ACCOUNT;
            if (!wbAccount) return;
            const account = wbAccount.getCurrentAccount();
            const newName = await this._prompt('微博暱稱', account.weiboNickname || '', '想叫什麼');

            if (newName !== null && newName.trim() !== '') {
                wbAccount.updateCurrentNickname(newName.trim());
                this._showToast(`暱稱改成 ${newName.trim()}`);
                this.render();
            }
        },

        toggleDarkMode: function() {
            DARK_MODE = !DARK_MODE;
            localStorage.setItem('wb_dark_mode', DARK_MODE);
            this.render();
        },

        showContacts: function() {
            const osContacts = win.OS_CONTACTS;
            if (!osContacts) { alert("錯誤：無法讀取 OS_CONTACTS 模塊"); return; }

            // 移除已存在的 modal
            const existing = doc.getElementById('wb-contacts-modal');
            if (existing) existing.remove();

            const allContacts = osContacts.getAll();
            const currentUserId = (win.OS_USER && win.OS_USER.getInfo) ? win.OS_USER.getInfo().id : 'wxid_User';
            const contactList = [];
            for (let id in allContacts) {
                const contact = allContacts[id];
                if (contact.id !== currentUserId && !contact.isNPC) {
                    contactList.push(contact);
                }
            }
            if (contactList.length === 0) {
                alert('暂无关注的好友\n\n提示：在微信中使用 AI 搜索添加好友后，这里会自动同步显示！');
                return;
            }

            const appRef = "(window.parent.wbApp || window.wbApp)";
            const isDark = DARK_MODE;
            const modalBg    = isDark ? '#1c1c1e' : '#fff';
            const borderC    = isDark ? '#2a2a2a' : '#f0f0f0';
            const textC      = isDark ? '#f0f0f0' : '#333';
            const subTextC   = isDark ? '#888'    : '#666';
            const subSubC    = isDark ? '#555'    : '#999';
            const toolbarBg  = isDark ? '#252525' : '#f8f8f8';
            const toolbarBdr = isDark ? '#333'    : '#eee';

            const listHtml = contactList.map(contact => {
                const displayName = contact.wb?.nickname || contact.realName;
                const bio = contact.wb?.bio || contact.wx?.bio || '这个人很懒，什么都没写';
                const followers = contact.wb?.followers || Math.floor(Math.random() * 5000) + 500;
                const nameExtra = contact.realName !== displayName
                    ? `<span style="color:${subSubC}; font-size:11px;">(${contact.realName})</span>` : '';
                return `
                    <div style="padding:12px; border-bottom:1px solid ${borderC}; display:flex; align-items:center; gap:10px;">
                        <input type="checkbox" class="wb-contact-chk" data-id="${contact.id}"
                            style="width:18px; height:18px; cursor:pointer; flex-shrink:0; accent-color:#ff8200;"
                            onclick="event.stopPropagation()">
                        <div style="width:44px; height:44px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold; font-size:16px; flex-shrink:0;">${displayName.charAt(0)}</div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:bold; font-size:14px; color:${textC}; display:flex; align-items:center; gap:4px;">${displayName} ${nameExtra}</div>
                            <div style="font-size:11px; color:${subTextC}; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${bio.length > 30 ? bio.substring(0, 30) + '...' : bio}</div>
                            <div style="font-size:10px; color:${subSubC}; margin-top:1px;">粉絲 ${followers}</div>
                        </div>
                    </div>`;
            }).join('');

            const tempDiv = doc.createElement('div');
            tempDiv.id = 'wb-contacts-modal';
            tempDiv.innerHTML = `
                <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.55); z-index:10001; display:flex; align-items:center; justify-content:center;" onclick="this.parentElement.remove()">
                    <div style="background:${modalBg}; width:90%; max-width:400px; max-height:80vh; border-radius:12px; overflow:hidden; display:flex; flex-direction:column;" onclick="event.stopPropagation()">
                        <div style="padding:12px 15px; background:linear-gradient(to bottom,#ffae00,#ff8200); color:#fff; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
                            <span style="font-weight:bold; font-size:16px;">關注列表 (${contactList.length})</span>
                            <span style="cursor:pointer; font-size:22px; line-height:1;" onclick="document.getElementById('wb-contacts-modal').remove()"><i class="fa-solid fa-xmark"></i></span>
                        </div>
                        <div style="padding:10px 15px; background:${toolbarBg}; border-bottom:1px solid ${toolbarBdr}; display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; color:${subTextC};">
                                <input type="checkbox" id="wb-contact-select-all" style="width:16px; height:16px; accent-color:#ff8200;" onchange="${appRef}.toggleSelectAllContacts(this.checked)">
                                全選
                            </label>
                            <button onclick="${appRef}.deleteSelectedContacts()" style="background:#ff4444; color:#fff; border:none; padding:6px 14px; border-radius:6px; font-size:13px; cursor:pointer; font-weight:bold;">刪除選中</button>
                        </div>
                        <div style="overflow-y:auto; flex:1;">${listHtml}</div>
                    </div>
                </div>`;
            doc.body.appendChild(tempDiv);
        },

        toggleSelectAllContacts: function(checked) {
            const checkboxes = doc.querySelectorAll('.wb-contact-chk');
            checkboxes.forEach(chk => { chk.checked = checked; });
        },

        deleteSelectedContacts: async function() {
            const checkboxes = doc.querySelectorAll('.wb-contact-chk:checked');
            if (checkboxes.length === 0) { alert('請先勾選要刪除的聯繫人'); return; }
            if (!(await this._ask(`刪除選中的 ${checkboxes.length} 個聯繫人？刪了就回不來。`, '刪除'))) return;

            const osContacts = win.OS_CONTACTS;
            if (!osContacts) return;

            const ids = Array.from(checkboxes).map(chk => chk.getAttribute('data-id'));
            ids.forEach(id => osContacts.deleteContact(id));

            const modal = doc.getElementById('wb-contacts-modal');
            if (modal) modal.remove();

            alert(`已刪除 ${ids.length} 個聯繫人`);
            this.showContacts(); // 重新開啟以刷新列表
        },

        // --- 轉發到微信 ---
        shareToWx: function(postId) {
            const post = GLOBAL_POSTS.find(p => p.id === postId);
            if (!post) return;

            const wxApp = win.wxApp;
            if (!wxApp || typeof wxApp.shareFromWeibo !== 'function') {
                alert('微信面板尚未載入，請先開啟微信');
                return;
            }

            const osContacts = win.OS_CONTACTS;
            if (!osContacts) { alert('無法讀取聯繫人'); return; }

            const existing = doc.getElementById('wb-share-modal');
            if (existing) existing.remove();

            const allContacts = osContacts.getAll();
            const contactList = [];
            for (let id in allContacts) {
                const c = allContacts[id];
                if (!c.isNPC) contactList.push(c);
            }

            if (contactList.length === 0) {
                alert('尚無微信聯繫人可分享');
                return;
            }

            const isDark = DARK_MODE;
            const bg     = isDark ? '#1c1c1e' : '#fff';
            const border = isDark ? '#2a2a2a' : '#f0f0f0';
            const textC  = isDark ? '#f0f0f0' : '#333';
            const subC   = isDark ? '#888'    : '#999';

            // 預覽文字
            const preview = (post.content || '').replace(/\n/g, ' ').substring(0, 40);
            const previewHtml = `<div style="background:${isDark?'#252525':'#f8f8f8'}; border-radius:8px; padding:10px 12px; margin:12px 15px 0; font-size:13px; color:${subC}; border-left:3px solid #ff8200;">
                <span style="color:#ff8200; font-weight:bold;">@${post.user}</span>
                <span style="margin-left:6px;">${preview}${post.content && post.content.length > 40 ? '…' : ''}</span>
            </div>`;

            const listHtml = contactList.map(c => {
                const name = c.wx?.nickname || c.realName;
                const initial = name.charAt(0);
                return `<div style="display:flex; align-items:center; padding:12px 15px; border-bottom:1px solid ${border}; gap:10px;">
                    <div style="width:40px; height:40px; border-radius:6px; background:linear-gradient(135deg,#07c160,#05a050); flex-shrink:0; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold; font-size:16px;">${initial}</div>
                    <div style="flex:1; font-size:14px; color:${textC}; font-weight:500;">${name}</div>
                    <div onclick="(window.parent.wbApp||window.wbApp)._doShare('${c.id}','${postId}',this)" style="background:#07c160; color:#fff; font-size:13px; padding:5px 14px; border-radius:14px; cursor:pointer; font-weight:500; white-space:nowrap;">傳送</div>
                </div>`;
            }).join('');

            const wrap = doc.createElement('div');
            wrap.id = 'wb-share-modal';
            wrap.innerHTML = `
                <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.55); z-index:10002; display:flex; align-items:flex-end; justify-content:center;" onclick="this.parentElement.remove()">
                    <div style="background:${bg}; width:100%; max-width:480px; border-radius:16px 16px 0 0; overflow:hidden; max-height:75vh; display:flex; flex-direction:column; animation:wbFadeIn 0.25s;" onclick="event.stopPropagation()">
                        <div style="padding:14px 15px 0; flex-shrink:0;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-size:16px; font-weight:bold; color:${textC};">轉發到微信</span>
                                <span style="font-size:22px; color:${subC}; cursor:pointer; line-height:1;" onclick="document.getElementById('wb-share-modal').remove()"><i class="fa-solid fa-xmark"></i></span>
                            </div>
                            ${previewHtml}
                            <div style="margin:12px 0 0; padding-bottom:8px; font-size:12px; color:${subC}; padding-left:2px;">選擇聯繫人</div>
                        </div>
                        <div style="overflow-y:auto; flex:1;">${listHtml}</div>
                    </div>
                </div>`;
            doc.body.appendChild(wrap);
        },

        _doShare: async function(contactId, postId, btnEl) {
            const post = GLOBAL_POSTS.find(p => p.id === postId);
            if (!post) return;
            const wxApp = win.wxApp;
            if (!wxApp || typeof wxApp.shareFromWeibo !== 'function') return;

            // 視覺反饋：禁用按鈕
            if (btnEl) { btnEl.innerHTML = '<i class="fa-solid fa-check"></i>'; btnEl.style.background = '#aaa'; btnEl.style.pointerEvents = 'none'; }

            const ok = await wxApp.shareFromWeibo(contactId, post);
            if (ok) {
                const modal = doc.getElementById('wb-share-modal');
                if (modal) modal.remove();
                // 獲取聯繫人名稱
                const contact = win.OS_CONTACTS ? win.OS_CONTACTS.getById(contactId) : null;
                const name = contact ? (contact.wx?.nickname || contact.realName) : contactId;
                this._showToast(`已轉發給 ${name}`);
            } else {
                alert('轉發失敗');
            }
        },

        // 微博自己畫的確認視窗：瀏覽器原生 confirm 在她的環境擋不住手滑，改成兩顆鈕的底部卡片。
        // 回 Promise<boolean>；點背景或取消都算否。掛在 .wb-shell 裡，詳情頁疊在上面時也蓋得住。
        _ask: function(text, okLabel) {
            return new Promise((resolve) => {
                const host = (APP_CONTAINER && APP_CONTAINER.querySelector('.wb-shell')) || APP_CONTAINER || doc.body;
                const old = host.querySelector('.wb-ask-mask');
                if (old) old.remove();
                const mask = doc.createElement('div');
                mask.className = 'wb-ask-mask';
                mask.innerHTML = `<div class="wb-ask-card"><div class="wb-ask-text"></div><div class="wb-ask-btns"><div class="wb-ask-btn wb-ask-cancel">取消</div><div class="wb-ask-btn wb-ask-ok"></div></div></div>`;
                mask.querySelector('.wb-ask-text').textContent = text;
                mask.querySelector('.wb-ask-ok').textContent = okLabel || '確定';
                const done = (v) => { mask.remove(); resolve(v); };
                mask.querySelector('.wb-ask-ok').onclick = (e) => { e.stopPropagation(); done(true); };
                mask.querySelector('.wb-ask-cancel').onclick = (e) => { e.stopPropagation(); done(false); };
                mask.onclick = (e) => { if (e.target === mask) done(false); };
                host.appendChild(mask);
            });
        },

        // 圖片生完寫回貼文：ref = 貼文 id｜第幾張；下次開微博直接顯示、不再重生
        setImageUrl: async function(ref, url) {
            const [postId, idxStr] = String(ref || '').split('|');
            const post = GLOBAL_POSTS.find(p => p.id === postId);
            if (!post || !post.media || !url) return false;
            const idx = parseInt(idxStr, 10) || 0;
            if (post.media.type === 'images' && Array.isArray(post.media.list)) post.media.list[idx] = url;
            else if (post.media.type === 'image') post.media.desc = url;
            else return false;
            try { await win.OS_DB.saveWbPost(post); } catch (e) { console.warn('[Weibo] 圖片網址寫回失敗:', e); }
            return true;
        },

        // 上拉單選：items = [{key, icon, label, hint}]；回 key，點背景或取消回 null
        _sheet: function(items) {
            return new Promise((resolve) => {
                const host = (APP_CONTAINER && APP_CONTAINER.querySelector('.wb-shell')) || APP_CONTAINER || doc.body;
                const old = host.querySelector('.wb-sheet-mask');
                if (old) old.remove();
                const mask = doc.createElement('div');
                mask.className = 'wb-sheet-mask';
                const rows = (items || []).map(it => `<div class="wb-sheet-item" data-key="${String(it.key)}"><i class="${it.icon || 'fa-solid fa-circle'}"></i><div class="wb-sheet-text"><div class="wb-sheet-label"></div><div class="wb-sheet-hint"></div></div></div>`).join('');
                mask.innerHTML = `<div class="wb-sheet">${rows}<div class="wb-sheet-cancel">取消</div></div>`;
                (items || []).forEach((it, i) => { const el = mask.querySelectorAll('.wb-sheet-item')[i]; el.querySelector('.wb-sheet-label').textContent = it.label || ''; el.querySelector('.wb-sheet-hint').textContent = it.hint || ''; });
                const done = (v) => { mask.remove(); resolve(v); };
                mask.querySelectorAll('.wb-sheet-item').forEach(el => { el.onclick = (e) => { e.stopPropagation(); done(el.dataset.key); }; });
                mask.querySelector('.wb-sheet-cancel').onclick = (e) => { e.stopPropagation(); done(null); };
                mask.onclick = (e) => { if (e.target === mask) done(null); };
                host.appendChild(mask);
            });
        },

        // 單行輸入小視窗：回字串；取消回 null
        _prompt: function(title, value, placeholder) {
            return new Promise((resolve) => {
                const host = (APP_CONTAINER && APP_CONTAINER.querySelector('.wb-shell')) || APP_CONTAINER || doc.body;
                const old = host.querySelector('.wb-prompt-mask');
                if (old) old.remove();
                const mask = doc.createElement('div');
                mask.className = 'wb-prompt-mask';
                mask.innerHTML = `<div class="wb-prompt-card"><div class="wb-prompt-title"></div><input type="text" class="wb-prompt-input"><div class="wb-ask-btns"><div class="wb-ask-btn wb-ask-cancel">取消</div><div class="wb-ask-btn wb-prompt-ok">確定</div></div></div>`;
                mask.querySelector('.wb-prompt-title').textContent = title || '';
                const inp = mask.querySelector('.wb-prompt-input');
                inp.value = value == null ? '' : String(value);
                inp.placeholder = placeholder || '';
                const done = (v) => { mask.remove(); resolve(v); };
                mask.querySelector('.wb-prompt-ok').onclick = (e) => { e.stopPropagation(); done(inp.value); };
                mask.querySelector('.wb-ask-cancel').onclick = (e) => { e.stopPropagation(); done(null); };
                inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); done(inp.value); } };
                mask.onclick = (e) => { if (e.target === mask) done(null); };
                host.appendChild(mask);
                setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) {} }, 30);
            });
        },

        _showToast: function(msg) {
            const old = doc.getElementById('wb-toast-el');
            if (old) old.remove();
            const t = doc.createElement('div');
            t.id = 'wb-toast-el';
            t.className = 'wb-toast';
            t.textContent = msg;
            doc.body.appendChild(t);
            setTimeout(() => { if (t.parentNode) t.remove(); }, 2100);
        },

        // --- 載入更多評論 (帶 Loading 狀態) ---
        startLoadMore: function(btn, postId) {
            if (this.isLoading) return;
            if (btn) {
                btn.classList.add('wb-load-more-loading');
                btn.innerHTML = '<span class="wb-lm-spinner"></span> 評論加載中…';
                btn.style.pointerEvents = 'none';
            }
            this.triggerSinglePostAI(postId);
        },

        // --- AI 輔助函數 ---
        _filterComments: function(comments) {
            let myName = 'User';
            let myRealName = 'User';
            if (win.WB_ACCOUNT) {
                const acc = win.WB_ACCOUNT.getCurrentAccount();
                myName = acc.weiboNickname;
                myRealName = acc.realName;
            }
            const filteredComments = [];
            const recentComments = comments.slice(-5);
            recentComments.forEach((c, index) => {
                // 舊格式的字串評論本身就是「名字: 內容」，直接送；只有物件才拆 author/content
                if (typeof c !== 'object') { filteredComments.push(String(c)); return; }
                let author = c.author || 'Unknown';
                let content = c.content;
                const isMe = (author === myName || author === myRealName || author === '我' || author === 'User');
                const isLastItem = (index === recentComments.length - 1);
                if (isMe && !isLastItem) { return; }
                filteredComments.push(`${author}: ${content}`);
            });
            return filteredComments.join(' | ');
        },

        // 真照片（data URL）最多夾最近這幾張給 AI 看；更早的退成文字，免得每輪拖一疊圖
        _PHOTO_LIMIT: 3,
        _collectPhotos: function(posts) {
            const PI = win.OS_PHONE_IMAGE || window.OS_PHONE_IMAGE;
            const out = [];
            for (const p of posts) {
                const d = p && p.media && p.media.type === 'image' ? String(p.media.desc || '') : '';
                if (p && p.isMe && d.startsWith('data:') && PI && PI.isUrl(d)) out.push({ postId: p.id, url: d });
                if (out.length >= this._PHOTO_LIMIT) break;
            }
            return out;
        },
        _describeMedia: function(p, photos) {
            const m = p && p.media;
            if (!m) return '';
            if (m.type === 'image') {
                const d = String(m.desc || '');
                const idx = photos.findIndex(x => x.postId === p.id);
                if (idx >= 0) return ` [Image: see attached photo #${idx + 1}]`;
                if (d.startsWith('data:') || d.startsWith('http')) return ' [Image: a photo]';
                return ` [Image: ${d}]`;
            }
            if (m.type === 'images') return ` [Images: ${(m.list || []).map(x => (String(x).startsWith('http') || String(x).startsWith('data:')) ? 'a photo' : x).join(' | ')}]`;
            if (m.type === 'video') return ` [Video: ${m.title || ''} ${m.desc || ''}]`;
            if (m.type === 'vote') return ` [Vote: ${m.title || ''}]`;
            return '';
        },
        serializeFeedForAI: function() {
            const recent = GLOBAL_POSTS.slice(0, 6);
            const photos = this._collectPhotos(recent);
            return recent.map(p => {
                let comms = (p.comments && p.comments.length > 0) ? this._filterComments(p.comments) : "None";
                const who = p.isMe ? `${p.user} (the player's own account)` : p.user;
                return `[ID: ${p.id}] [Author: ${who}] [Content: ${p.content}]${this._describeMedia(p, photos)} [Recent Comments: ${comms}]`;
            }).join('\n\n');
        },
        // 把真照片夾進訊息末尾（multimodal 陣列；OS_API 三條路都吃）
        _attachPhotos: function(messages, photos) {
            if (!photos || !photos.length) return messages;
            const parts = [{ type: 'text', text: `Attached photos from the player's own posts, numbered in order (#1..#${photos.length}). Look at them; NPC replies should react to what is actually in the photo.` }];
            photos.forEach(ph => parts.push({ type: 'image_url', image_url: { url: ph.url } }));
            messages.push({ role: 'user', content: parts });
            return messages;
        },

        serializeSinglePostForAI: function(postId) {
            const p = GLOBAL_POSTS.find(post => post.id === postId);
            if (!p) return "Target post not found.";
            let comms = (p.comments && p.comments.length > 0) ? this._filterComments(p.comments) : "None";
            const photos = this._collectPhotos([p]);
            const who = p.isMe ? `${p.user} (the player's own account)` : p.user;
            return `[TARGET POST - FOCUS ONLY ON THIS]\n[ID: ${p.id}] [Author: ${who}] [Content: ${p.content}]${this._describeMedia(p, photos)} [Recent Comments: ${comms}]`;
        },

        triggerPost: async function() {
            if (!win.OS_API) { alert("API 引擎未載入"); return; }
            this.isLoading = true;
            this.render();
            try {
                const isInitial = GLOBAL_POSTS.length <= 1; 
                let messages = [];
                if (isInitial) {
                    messages = await win.OS_API.buildContext("System Request: Generate World Social Media Feed.", 'wb_world_gen');
                } else {
                    const feedContext = this.serializeFeedForAI();
                    let prompt = win.OS_PROMPTS.get('wb_world_continue');
                    messages = await win.OS_API.buildContext("System Request: Continue World Feed.", 'wb_world_continue');
                    messages.forEach(m => {
                        if (m.role === 'system' && typeof m.content === 'string' && m.content.includes('{{context}}')) {
                            m.content = m.content.replace('{{context}}', feedContext);
                        }
                    });
                    this._attachPhotos(messages, this._collectPhotos(GLOBAL_POSTS.slice(0, 6)));
                }
                // 設定：直接用主模型完整設定（含 useSystemApi/useGenerateRaw/stProfileId/url/key）跟創作室同源。
                // 🚨別再用 wx_phone_api_config 覆蓋——舊 wx 設定會把「跟隨酒館/generateRaw」旗標蓋成直連→報「無 URL/Key」。
                let config = {};
                try { const _S = win.OS_SETTINGS; if (_S && _S.getConfig) { const _b = _S.getConfig(); if (_b) config = Object.assign({}, _b); } } catch (e) {}
                if (!config.maxTokens) config.maxTokens = 1000;
                await win.OS_API.chat(messages, config, null, async (finalText) => {
                     await this.processWorldResponse(finalText);
                }, (err) => {
                    console.error(err);
                    alert("生成失敗: " + err.message);
                    this.isLoading = false; 
                    this.render();
                });
            } catch (e) { console.error(e); this.isLoading = false; this.render(); }
        },

        triggerSinglePostAI: async function(postId) {
            if (!win.OS_API) { alert("API 引擎未載入"); return; }
            this.isLoading = true;
            this.render();
            try {
                const singleContext = this.serializeSinglePostForAI(postId);
                let messages = await win.OS_API.buildContext("System Request: Generate comments for specific post.", 'wb_world_continue');
                messages.forEach(m => {
                    if (m.role === 'system' && typeof m.content === 'string' && m.content.includes('{{context}}')) {
                        m.content = m.content.replace('{{context}}', singleContext);
                        m.content += `\n\n[SYSTEM IMPORTANT INSTRUCTION]\nUser is focusing on Post ID: ${postId}.\n1. DO NOT generate new [wb_post].\n2. ONLY generate [wb_reply] for [Target: ${postId}].\n3. Generate 2-3 interesting replies from different NPCs.`;
                    }
                });
                // 設定：直接用主模型完整設定（含 useSystemApi/useGenerateRaw/stProfileId/url/key）跟創作室同源。
                // 🚨別再用 wx_phone_api_config 覆蓋——舊 wx 設定會把「跟隨酒館/generateRaw」旗標蓋成直連→報「無 URL/Key」。
                let config = {};
                try { const _S = win.OS_SETTINGS; if (_S && _S.getConfig) { const _b = _S.getConfig(); if (_b) config = Object.assign({}, _b); } } catch (e) {}
                if (!config.maxTokens) config.maxTokens = 1000;
                await win.OS_API.chat(messages, config, null, async (finalText) => {
                     await this.processWorldResponse(finalText);
                }, (err) => {
                    console.error(err);
                    alert("生成失敗: " + err.message);
                    this.isLoading = false; 
                    this.render();
                });
            } catch (e) { console.error(e); this.isLoading = false; this.render(); }
        },

        processWorldResponse: async function(text) {
            // 🔥 Debug: 顯示 AI 原始輸出
            console.log('🤖 [Weibo] AI 原始輸出 (前 500 字):', text.substring(0, 500));
            console.log('🤖 [Weibo] AI 原始輸出 (完整):', text);

            const result = this.parsePosts(text);

            // 🔥 Debug: 顯示解析結果
            console.log('📊 [Weibo] 解析結果 - 新帖子數:', result.newPosts.length);
            console.log('📊 [Weibo] 解析結果 - 回覆數:', result.replies.length);
            if (result.replies.length > 0) {
                console.log('📊 [Weibo] 回覆詳情:', result.replies);
            }

            if (result.newPosts.length > 0) {
                for (let p of result.newPosts.reverse()) {
                    const newPost = {
                        id: 'post_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                        user: p.author,
                        content: p.content,
                        avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(p.author)}`,
                        time: "剛剛",
                        likes: Math.floor(Math.random() * 2000) + 50,
                        comments: p.comments, 
                        media: p.media,
                        isMe: false,
                        timestamp: Date.now()
                    };
                    GLOBAL_POSTS.unshift(newPost);
                    await win.OS_DB.saveWbPost(newPost);
                }
            }
            if (result.replies.length > 0) {
                let updatedCount = 0;
                for (let r of result.replies) {
                    const targetPost = GLOBAL_POSTS.find(p => p.id === r.targetId);
                    if (targetPost) {
                        if (!targetPost.comments) targetPost.comments = [];
                        const isDuplicate = targetPost.comments.some(c => (c.content === r.content) && (c.author === r.author));
                        if (!isDuplicate) {
                            const newComment = { author: r.author, content: r.content, time: Date.now() };
                            console.log('💬 [Weibo] 新增評論到帖子', r.targetId, ':', newComment);
                            targetPost.comments.push(newComment);
                            await win.OS_DB.saveWbPost(targetPost);
                            updatedCount++;
                        }
                    }
                }
                console.log(`[Weibo] 已更新 ${updatedCount} 條舊帖子的評論`);
            }
            this.isLoading = false;
            this.render();
        },

        parsePosts: function(text) {
            const newPosts = [];
            const replies = [];
            const postRegex = /\[wb_post\]([\s\S]*?)\[\/wb_post\]/gi;
            let match;
            while ((match = postRegex.exec(text)) !== null) {
                const block = match[1];
                const res = { author: '匿名', content: '', media: null, comments: [] };

                // 🔥 改进：使用更智能的正则，匹配到下一个标签或结尾
                // 匹配模式：[Author: ...] 后面可能跟着换行或其他内容，直到遇到下一个 [ 开头的标签
                const authM = block.match(/\[Author:\s*([^\]]+)\]/i);
                if (authM) res.author = authM[1].trim();

                // 🔥 关键修复：[Post: ...] 可能包含嵌套的方括号（如 [系統公告]）
                // 使用负向前瞻：匹配到下一个 [标签名: 或 [/wb_post] 为止
                const postM = block.match(/\[Post:\s*([\s\S]*?)(?=\[(?:Img|Video|Vote|Comments|\/wb_post)|\s*$)/i);
                if (postM) {
                    res.content = postM[1].trim().replace(/\]$/, ''); // 移除可能的尾部 ]
                }

                const imgM = block.match(/\[Img:\s*([^\]]+)\]/i);
                if (imgM) {
                    // 支持多图：用 | 分隔
                    const images = imgM[1].split('|').map(s => s.trim()).filter(s => s);
                    if (images.length === 1) {
                        res.media = { type: 'image', desc: images[0] };
                    } else {
                        res.media = { type: 'images', list: images };
                    }
                }

                const vidM = block.match(/\[Video:\s*([^\]]+)\]/i);
                if (vidM) {
                    // 支持标题|描述格式
                    const parts = vidM[1].split('|').map(s => s.trim());
                    res.media = {
                        type: 'video',
                        title: parts[0] || '視頻',
                        desc: parts[1] || ''
                    };
                }

                const voteM = block.match(/\[Vote:\s*([^\]]+)\]/i);
                if (voteM) {
                    const parts = voteM[1].split('|');
                    if (parts.length >= 2) {
                        res.media = {
                            type: 'vote',
                            title: parts[0].trim(),
                            options: parts[1].split(',').map(o => o.trim())
                        };
                    }
                }

                // 🔥 Comments 也可能包含方括号，使用同样的技巧
                const commM = block.match(/\[Comments:\s*([\s\S]*?)(?=\[\/wb_post\]|\s*$)/i);
                if (commM) {
                    const comms = commM[1].replace(/\]$/, '').split('|');
                    comms.forEach(c => {
                        const trimmed = c.trim();
                        if (trimmed) res.comments.push(trimmed);
                    });
                }

                if (res.author !== '匿名' || res.content) {
                    newPosts.push(res);
                } else {
                    console.warn('[Weibo Parse] 空白 post 已忽略');
                }
            }
            const replyRegex = /\[wb_reply\]([\s\S]*?)\[\/wb_reply\]/gi;
            let rMatch;
            while ((rMatch = replyRegex.exec(text)) !== null) {
                const block = rMatch[1];
                const res = { targetId: '', author: '路人', content: '' };

                const targetM = block.match(/\[Target:\s*([^\]]+)\]/i);
                if (targetM) res.targetId = targetM[1].trim();

                const authM = block.match(/\[Author:\s*([^\]]+)\]/i);
                if (authM) res.author = authM[1].trim();

                // 🔥 Content 也可能包含嵌套方括号，匹配到 [/wb_reply] 为止
                const contM = block.match(/\[Content:\s*([\s\S]*?)(?=\[\/wb_reply\]|\s*$)/i);
                if (contM) res.content = contM[1].trim().replace(/\]$/, '');

                if (res.targetId && res.content) {
                    replies.push(res);
                } else {
                    console.warn('[Weibo Parse] 無效 reply (缺 Target 或 Content)');
                }
            }
            return { newPosts, replies };
        },

        checkUserUpdate: function() {
            if (win.OS_USER && typeof win.OS_USER.getHash === 'function') {
                const currentHash = win.OS_USER.getHash();
                if (currentHash !== LAST_USER_HASH) {
                    LAST_USER_HASH = currentHash;
                    if (CURRENT_TAB === 'me') this.render();
                }
            }
        },

        install: async function() {
            if (win.PhoneSystem) {
                await win.wbApp.init();
                win.PhoneSystem.install('微博', '<i class="fa-solid fa-eye"></i>', '#ff8200', (c) => {
                    APP_CONTAINER = c;
                    win.wbApp.render();
                    // 這個 callback 每次開微博 app 都會跑：interval 必須單例，否則輪詢一支一支疊上去越玩越卡
                    if (win.wbApp._userTimer) clearInterval(win.wbApp._userTimer);
                    win.wbApp._userTimer = setInterval(() => win.wbApp.checkUserUpdate(), 1000);
                });
            } else { setTimeout(win.wbApp.install, 500); }
        }
    };
    if (win.OS_PHONE_IMAGE && win.OS_PHONE_IMAGE.onDone) win.OS_PHONE_IMAGE.onDone('wb', (ref, url) => win.wbApp.setImageUrl(ref, url));
    win.wbApp.install();
})();