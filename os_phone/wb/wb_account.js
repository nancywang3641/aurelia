// ----------------------------------------------------------------
// [微博] wb_account.js (V1.2 - Dual Sync Storage)
// 職責：微博帳號管理系統
// 升級：
// 1. [強制同步] 修改暱稱時，同時寫入 OS_CONTACTS 和 LocalStorage (雙保險)。
// 2. [讀取增強] 讀取帳號時，若通訊錄中的暱稱未設置，嘗試從本地緩存補全。
// ----------------------------------------------------------------
(function() {
    console.log('[Weibo] Account Manager V1.2 (Dual Sync) Loaded');
    const win = window.parent || window;

    win.WB_ACCOUNT = {
        
        getCurrentAccount: function() {
            const osUser = win.OS_USER || window.OS_USER;
            const osContacts = win.OS_CONTACTS || window.OS_CONTACTS;

            if (!osUser || !osUser.getInfo) {
                return this.getDefaultAccount();
            }
            const userInfo = osUser.getInfo();
            const userId = userInfo.id || 'wxid_User'; 
            const realName = userInfo.name || 'User';  

            // 讀取本地緩存 (作為後備數據源)
            const localData = this.getAllAccounts()[userId] || {};

            // 1. 嘗試從 OS_CONTACTS 讀取
            if (osContacts) {
                let contact = osContacts.getById(userId);

                if (!contact) {
                    // 首次使用，創建新檔案
                    contact = osContacts.upsert({
                        id: userId,
                        realName: realName, 
                        isNPC: false,
                        wb: {
                            nickname: localData.weiboNickname || realName, // 嘗試繼承本地數據
                            bio: localData.bio || '這個人很懶，什麼都沒寫',
                            followers: Math.floor(Math.random() * 5000) + 500,
                            following: Math.floor(Math.random() * 200) + 50,
                            posts: 0
                        }
                    });
                } else {
                    // 同步真名
                    if (contact.realName !== realName) {
                        osContacts.update(userId, { realName: realName });
                        contact.realName = realName;
                    }
                }

                // 🔥 [邏輯修復] 優先級：通訊錄暱稱 > 本地緩存暱稱 > 真名
                // 這樣即使 OS_CONTACTS 存儲失敗，我們還能讀到 LocalStorage 的值
                const finalNickname = contact.wb?.nickname || localData.weiboNickname || contact.realName;
                const finalBio = contact.wb?.bio || localData.bio || '這個人很懶，什麼都沒寫';

                return {
                    weiboId: contact.id,
                    realName: contact.realName,
                    weiboNickname: finalNickname, 
                    bio: finalBio,
                    avatar: userInfo.avatar || contact.wb?.avatar || '',
                    followers: contact.wb?.followers || 1024,
                    following: contact.wb?.following || 128,
                    posts: contact.wb?.posts || 0
                };
            }

            // 2. 降級模式
            if (localData.weiboId) {
                localData.realName = realName;
                localData.avatar = userInfo.avatar || '';
                return localData;
            } else {
                return this.createAccount(userId, userInfo);
            }
        },

        createAccount: function(userId, userInfo) {
            const realName = userInfo.name || 'User';
            const newAccount = {
                weiboId: userId,
                realName: realName,
                weiboNickname: realName,
                bio: '這個人很懶，什麼都沒寫',
                avatar: userInfo.avatar || '',
                followers: Math.floor(Math.random() * 5000) + 500,
                following: Math.floor(Math.random() * 200) + 50,
                posts: 0,
                createdAt: Date.now()
            };
            this.updateAccount(userId, newAccount);
            return newAccount;
        },

        updateCurrentBio: function(newBio) {
            const osUser = win.OS_USER || window.OS_USER;
            if (!osUser || !osUser.getInfo) return false;
            const userId = osUser.getInfo().id || 'wxid_User';
            const osContacts = win.OS_CONTACTS || window.OS_CONTACTS;

            // 雙寫：同時更新通訊錄和本地
            if (osContacts) osContacts.updateWbData(userId, { bio: newBio });
            return this.updateAccount(userId, { bio: newBio });
        },

        updateCurrentNickname: function(newNickname) {
            const osUser = win.OS_USER || window.OS_USER;
            if (!osUser || !osUser.getInfo) return false;
            const userId = osUser.getInfo().id || 'wxid_User';
            const osContacts = win.OS_CONTACTS || window.OS_CONTACTS;

            console.log(`[WB_ACCOUNT] 雙重寫入暱稱: ${newNickname} (ID: ${userId})`);

            // 🔥 [雙寫機制]
            // 1. 嘗試寫入通訊錄 (如果是新架構)
            if (osContacts) {
                osContacts.updateWbData(userId, { nickname: newNickname });
            }
            
            // 2. 強制寫入 LocalStorage (確保數據絕對不會丟)
            return this.updateAccount(userId, { weiboNickname: newNickname });
        },

        updateAccount: function(userId, updates) {
            const allAccounts = this.getAllAccounts();
            if (!allAccounts[userId]) allAccounts[userId] = {}; 
            Object.assign(allAccounts[userId], updates);
            // 補全 ID
            if (!allAccounts[userId].weiboId) allAccounts[userId].weiboId = userId;
            this.saveAllAccounts(allAccounts);
            return true;
        },

        getAllAccounts: function() {
            try {
                const data = localStorage.getItem('wb_accounts');
                return data ? JSON.parse(data) : {};
            } catch(e) { return {}; }
        },

        saveAllAccounts: function(accounts) {
            try {
                localStorage.setItem('wb_accounts', JSON.stringify(accounts));
                return true;
            } catch(e) { return false; }
        },

        getDefaultAccount: function() {
            return {
                weiboId: 'wxid_User',
                realName: 'User',
                weiboNickname: 'User',
                bio: '這個人很懶，什麼都沒寫',
                avatar: '',
                followers: 1024,
                following: 128,
                posts: 0
            };
        }
    };
    console.log('[Weibo] Account Manager Ready');
})();