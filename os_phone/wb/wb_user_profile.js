// ----------------------------------------------------------------
// [檔案] wb_user_profile.js
// 職責：微博個人資料管理（暱稱、簽名、頭像）
// 說明：獨立於人設系統，只管理微博內顯示的資料
// ----------------------------------------------------------------
(function() {
    console.log('[WB] 載入個人資料管理器...');
    const win = window.parent || window;
    const STORAGE_KEY = 'wb_user_profile';

    // 默認資料
    const DEFAULT_PROFILE = {
        nickname: 'User',
        bio: '這個人很懶，什麼都沒寫',
        avatar: ''
    };

    win.WB_PROFILE = {
        // 獲取個人資料
        get: function() {
            // 先從人設系統獲取真名和頭像
            const persona = (win.OS_PERSONA && win.OS_PERSONA.getInfo) ? win.OS_PERSONA.getInfo() : null;
            const realName = persona ? persona.name : DEFAULT_PROFILE.nickname;
            const realAvatar = persona ? persona.avatar : DEFAULT_PROFILE.avatar;

            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    const profile = JSON.parse(stored);
                    // 如果沒有設置暱稱，使用真名
                    if (!profile.nickname || profile.nickname === 'User') {
                        profile.nickname = realName;
                    }
                    // 頭像始終使用人設系統的頭像（與酒館同步）
                    profile.avatar = realAvatar;
                    return profile;
                }
            } catch(e) {
                console.warn('[WB_PROFILE] 讀取失敗:', e);
            }

            // 返回默認值（使用真名）
            return {
                nickname: realName,
                bio: DEFAULT_PROFILE.bio,
                avatar: realAvatar
            };
        },

        // 更新個人資料
        update: function(data) {
            try {
                const current = this.get();
                const updated = { ...current, ...data };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                return updated;
            } catch(e) {
                console.error('[WB_PROFILE] 更新失敗:', e);
                return null;
            }
        },

        // 清除資料（重置為默認）
        reset: function() {
            localStorage.removeItem(STORAGE_KEY);
        }
    };
})();
