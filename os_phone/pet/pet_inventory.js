// ----------------------------------------------------------------
// [檔案] pet_inventory.js (V1.0 - Item Database & Storage)
// 路徑：os_phone/pet/pet_inventory.js
// 職責：物品數據庫(硬代碼)、玩家背包管理、物品效果定義
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入寵物倉庫系統...');
    const win = window.parent || window;

    // === 1. 物品數據庫 (硬代碼商品) ===
    const ITEM_DB = [
        // --- 🍖 食品類 (Food) ---
        { 
            id: 'food_basic', type: 'Food', name: '合成營養膏', price: 50, 
            desc: '基礎飽腹食品，味道像牙膏。', 
            icon: '🌭', effect: { hunger: 30, mood: 0 },
            color: '#a8a8a8'
        },
        { 
            id: 'food_can', type: 'Food', name: '量子貓罐頭', price: 150, 
            desc: '薛丁格的口味，打開前不知道是魚還是雞。', 
            icon: '🥫', effect: { hunger: 60, mood: 5 },
            color: '#ff9f43'
        },
        { 
            id: 'food_premium', type: 'Food', name: 'A5 和牛排', price: 500, 
            desc: '極致奢華的享受，比主人吃得還好。', 
            icon: '🥩', effect: { hunger: 100, mood: 20 },
            color: '#ff6b6b'
        },

        // --- 🎾 玩具類 (Toy) ---
        { 
            id: 'toy_ball', type: 'Toy', name: '全息網球', price: 80, 
            desc: '永遠不會被咬壞的虛擬球。', 
            icon: '🎾', effect: { mood: 20, intimacy: 1 },
            color: '#badc58'
        },
        { 
            id: 'toy_laser', type: 'Toy', name: '自動雷射筆', price: 200, 
            desc: '讓寵物瘋狂追逐的光點。', 
            icon: '🔦', effect: { mood: 40, intimacy: 3, hunger: -5 }, // 玩太瘋會餓
            color: '#e056fd'
        },
        { 
            id: 'toy_console', type: 'Toy', name: '寵物遊戲機', price: 600, 
            desc: '能讓寵物學會玩俄羅斯方塊。', 
            icon: '🎮', effect: { mood: 70, intimacy: 5, hunger: -10 },
            color: '#686de0'
        },

        // --- 🛁 清潔類 (Clean) ---
        { 
            id: 'clean_soap', type: 'Clean', name: '除菌肥皂', price: 30, 
            desc: '普通的肥皂，能洗乾淨就好。', 
            icon: '🧼', effect: { cleanliness: 30 },
            color: '#7ed6df'
        },
        { 
            id: 'clean_shampoo', type: 'Clean', name: '蓬鬆沐浴露', price: 120, 
            desc: '洗完毛髮會發光，帶有花香。', 
            icon: '🧴', effect: { cleanliness: 60, mood: 5 },
            color: '#ffcccc'
        },
        { 
            id: 'clean_robot', type: 'Clean', name: '奈米清潔儀', price: 450, 
            desc: '高科技聲波除垢，完全不用動手。', 
            icon: '🚿', effect: { cleanliness: 100, mood: 10 },
            color: '#54a0ff'
        }
    ];

    // === 2. 背包管理邏輯 ===
    const STORAGE_KEY = 'os_pet_user_inventory';

    function loadUserInventory() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch (e) { return []; }
    }

    function saveUserInventory(inv) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(inv));
    }

    // === 3. 公開接口 ===
    win.PET_INVENTORY = {
        // 獲取所有商品 (給商店用)
        getAllItems: () => ITEM_DB,

        // 獲取特定分類商品
        getItemsByType: (type) => ITEM_DB.filter(i => i.type === type),

        // 獲取用戶背包 (給家用)
        getUserInventory: () => loadUserInventory(),

        // 購買/添加物品
        addItem: (itemId, count = 1) => {
            const itemDef = ITEM_DB.find(i => i.id === itemId);
            if (!itemDef) return false;

            let inv = loadUserInventory();
            let exist = inv.find(i => i.id === itemId);

            if (exist) {
                exist.count += count;
            } else {
                // 只存必要數據，節省空間
                inv.push({ 
                    id: itemDef.id, 
                    name: itemDef.name, 
                    type: itemDef.type,
                    icon: itemDef.icon,
                    effect: itemDef.effect, // 把效果也存進去，方便讀取
                    count: count 
                });
            }
            saveUserInventory(inv);
            return true;
        },

        // 使用/刪除物品
        consumeItem: (itemId, count = 1) => {
            let inv = loadUserInventory();
            let idx = inv.findIndex(i => i.id === itemId);
            if (idx === -1) return false;

            if (inv[idx].count > count) {
                inv[idx].count -= count;
            } else {
                inv.splice(idx, 1);
            }
            saveUserInventory(inv);
            return true;
        },

        // 查詢物品詳情
        getItemDef: (itemId) => ITEM_DB.find(i => i.id === itemId)
    };

})();