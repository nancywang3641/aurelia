// ----------------------------------------------------------------
// [檔案] wx_user_profile.js
// 職責：微信個人資料管理（暱稱、簽名、頭像）
// 說明：獨立於人設系統，只管理微信內顯示的資料
// ----------------------------------------------------------------
(function() {
    console.log('[WX] 載入個人資料管理器...');
    const win = window.parent || window;
    const STORAGE_KEY = 'wx_user_profile';

    // 默認資料
    const DEFAULT_PROFILE = {
        nickname: 'User',
        signature: '這個人很懶，什麼都沒寫',
        avatar: ''
    };

    // 🚨 別改回直接指派：wx_profile.js（別人的檔案卡）也叫 WX_PROFILE，
    //    後載入的那份會把這裡的 get/update 整個蓋掉，「我」頁的暱稱就變回 User。
    win.WX_PROFILE = Object.assign(win.WX_PROFILE || {}, {
        // 獲取個人資料
        get: function() {
            // 先從人設系統獲取真名和頭像
            const persona = (win.OS_USER && win.OS_USER.getInfo) ? win.OS_USER.getInfo() : null;
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
                console.warn('[WX_PROFILE] 讀取失敗:', e);
            }

            // 返回默認值（使用真名）
            return {
                nickname: realName,
                signature: DEFAULT_PROFILE.signature,
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
                console.error('[WX_PROFILE] 更新失敗:', e);
                return null;
            }
        },

        // 清除資料（重置為默認）
        reset: function() {
            localStorage.removeItem(STORAGE_KEY);
        }
    });

    // 「我」在微信裡叫什麼——整支微信只有這一個出處。
    //   暱稱優先：真的微信裡別人看到的就是暱稱，不是人設真名；沒設暱稱才退回人設名。
    //   訊息上的名字、送給 AI 的發話人、群成員名單、紅包領取者，全部走這裡。
    win.WX_ME = {
        personaName: function () {
            try { const u = win.OS_USER || win.WX_USER; const i = (u && u.getInfo) ? u.getInfo() : null; return (i && i.name) || 'User'; }
            catch (e) { return 'User'; }
        },
        name: function () {
            try { const n = String(win.WX_PROFILE.get().nickname || '').trim(); if (n && n !== 'User') return n; } catch (e) {}
            return this.personaName();
        },
        // 模型寫回來的名字可能是暱稱、也可能是人設名（舊記錄就是人設名），兩個都要認
        isMine: function (n) {
            n = String(n || '').trim();
            if (!n) return false;
            return n === this.name() || n === this.personaName() || n === 'User' || n === '我';
        }
    };
})();
