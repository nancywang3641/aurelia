// ----------------------------------------------------------------
// [OS] os_contacts.js (V1.2 - Ultimate Scope Fix)
// 路徑：os_phone/os/os_contacts.js
// 職責：統一聯繫人管理系統 (WeChat + Weibo 共用)
// 維修紀錄：
// 1. [嚴重修復] 實施「雙重掛載」策略，同時滿足微博(父層讀取)和微信(本地讀取)的需求。
// 2. 完整保留 exportForWx 接口，防止微信癱瘓。
// 3. 確保數據合併邏輯 (Upsert) 不會丟失微信的舊數據。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入統一聯繫人系統 V1.2 (Ultimate Fix)...');
    
    // 獲取所有可能的視窗層級
    const win = window.parent || window;
    const STORAGE_KEY = 'os_unified_contacts';

    // 定義核心對象
    const ContactsSystem = {
        /**
         * 核心數據結構：
         * {
         * "char_123": {
         * id: "char_123",
         * realName: "張三",
         * isNPC: false,
         * wx: { nickname: "阿三", bio: "...", avatar: "..." },
         * wb: { nickname: "三哥", bio: "...", followers: 100 }
         * }
         * }
         */

        // 1. 獲取所有聯繫人
        getAll: function() {
            try {
                const data = localStorage.getItem(STORAGE_KEY);
                return data ? JSON.parse(data) : {};
            } catch(e) {
                console.error('[OS_CONTACTS] 讀取失敗:', e);
                return {};
            }
        },

        // 2. 保存所有聯繫人
        saveAll: function(contacts) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
                return true;
            } catch(e) {
                console.error('[OS_CONTACTS] 保存失敗:', e);
                return false;
            }
        },

        // 3. 通過 ID 獲取
        getById: function(contactId) {
            const all = this.getAll();
            return all[contactId] || null;
        },

        // 4. 通過真實姓名查找
        getByRealName: function(realName) {
            const all = this.getAll();
            for (let id in all) {
                if (all[id].realName === realName) {
                    return all[id];
                }
            }
            return null;
        },

        // 5. 創建或更新 (核心邏輯：深度合併，防止覆蓋)
        upsert: function(contactData) {
            const all = this.getAll();
            const id = contactData.id || this.generateId();

            if (all[id]) {
                // 更新現有聯繫人：保留原有 wx/wb 數據，只更新傳入的部分
                all[id] = {
                    ...all[id], // 保留舊的根屬性
                    ...contactData, // 覆蓋新的根屬性
                    // 深度合併 WX 數據
                    wx: { ...(all[id].wx || {}), ...(contactData.wx || {}) },
                    // 深度合併 WB 數據
                    wb: { ...(all[id].wb || {}), ...(contactData.wb || {}) }
                };
            } else {
                // 創建新聯繫人
                all[id] = {
                    id: id,
                    realName: contactData.realName || contactData.name || 'Unknown',
                    isNPC: contactData.isNPC || false,
                    wx: contactData.wx || {},
                    wb: contactData.wb || {}
                };
            }

            this.saveAll(all);
            return all[id];
        },

        // 6. 生成 ID
        generateId: function() {
            return 'char_' + (Math.floor(Math.random() * 90000) + 10000);
        },

        // 7. 智能獲取或創建 (懶加載用)
        getOrCreate: function(name, options = {}) {
            let contact = this.getByRealName(name);

            if (!contact) {
                // 不存在則創建默認值
                contact = this.upsert({
                    realName: name,
                    isNPC: options.isNPC || false,
                    wx: options.wx || { nickname: name, bio: '這個人很懶，什麼都沒寫' },
                    wb: options.wb || {
                        nickname: name,
                        bio: '這個人很懶，什麼都沒寫',
                        followers: Math.floor(Math.random() * 5000) + 500,
                        following: Math.floor(Math.random() * 200) + 50,
                        posts: 0
                    }
                });
                console.log(`[OS_CONTACTS] 自動創建聯繫人: ${name}`);
            }
            return contact;
        },

        // --- 微信/微博 專用更新接口 ---

        updateWxData: function(contactId, wxData) {
            const contact = this.getById(contactId);
            if (!contact) return false;
            // 只更新 wx 字段，不動 wb
            contact.wx = { ...(contact.wx || {}), ...wxData };
            this.upsert(contact);
            return true;
        },

        updateWbData: function(contactId, wbData) {
            const contact = this.getById(contactId);
            if (!contact) return false;
            // 只更新 wb 字段，不動 wx
            contact.wb = { ...(contact.wb || {}), ...wbData };
            this.upsert(contact);
            return true;
        },

        // 8. 刪除單一聯繫人
        deleteContact: function(contactId) {
            const all = this.getAll();
            if (all[contactId]) {
                delete all[contactId];
                this.saveAll(all);
                console.log(`[OS_CONTACTS] 已刪除聯繫人: ${contactId}`);
                return true;
            }
            return false;
        },

        // --- 兼容性：舊數據遷移 (防止微信好友消失) ---
        migrateFromWxContacts: function() {
            const oldKey = 'wx_custom_contacts_v1';
            const oldData = localStorage.getItem(oldKey);

            if (!oldData) return;

            try {
                const oldContacts = JSON.parse(oldData);
                let count = 0;

                oldContacts.forEach(c => {
                    const existing = this.getByRealName(c.name);
                    if (!existing) {
                        this.upsert({
                            id: c.id, 
                            realName: c.name,
                            isNPC: c.isNPC || false,
                            wx: {
                                nickname: c.name,
                                bio: c.desc || c.bio || '',
                                avatarId: c.avatarId,
                                avatar: c.avatar
                            },
                            // 同時初始化一個空的微博數據，防止報錯
                            wb: {
                                nickname: c.name,
                                bio: '這個人很懶，什麼都沒寫',
                                followers: 0,
                                posts: 0
                            }
                        });
                        count++;
                    }
                });

                if (count > 0) {
                    console.log(`[OS_CONTACTS] 成功遷移 ${count} 個微信舊好友`);
                    localStorage.setItem('wx_custom_contacts_v1_backup', oldData);
                }
            } catch(e) {
                console.error('[OS_CONTACTS] 遷移失敗:', e);
            }
        },

        // --- 關鍵接口：導出給微信使用 (wx_contacts.js 依賴此方法) ---
        exportForWx: function() {
            const all = this.getAll();
            const wxFormat = [];

            for (let id in all) {
                const c = all[id];
                // 這裡必須轉換回微信以前認識的格式
                wxFormat.push({
                    id: c.id,
                    name: c.wx?.nickname || c.realName,
                    desc: c.wx?.bio || '',
                    bio: c.wx?.bio || '',
                    avatarId: c.wx?.avatarId || null,
                    avatar: c.wx?.avatar || null,
                    isNPC: c.isNPC || false,
                    isGroup: false 
                });
            }
            return wxFormat;
        },

        // --- 初始化掛載 ---
        init: function() {
            // 1. 執行遷移
            const all = this.getAll();
            if (Object.keys(all).length === 0) {
                this.migrateFromWxContacts();
            }

            // 2. 🔥 雙重掛載 (修復的核心)
            // 掛載到父層 (System Scope)，讓微博核心(wb_core)能找到
            if (win) win.OS_CONTACTS = this;
            
            // 掛載到當前層 (Local Scope)，讓微信核心(wx_core)能找到
            window.OS_CONTACTS = this;
            
            console.log('[PhoneOS] 聯繫人系統已雙重掛載 (win + window)');
        }
    };

    // 立即啟動
    ContactsSystem.init();

})();