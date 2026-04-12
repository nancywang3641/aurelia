// ----------------------------------------------------------------
// [檔案] pet_status.js
// 路徑：os_phone/pet/pet_status.js
// 職責：寵物狀態管理模組
// 功能：
// 1. 狀態條顯示與更新（飢餓度、心情、清潔度、親密度）
// 2. 狀態日誌記錄與渲染
// 3. 狀態相關UI生成
// ----------------------------------------------------------------
(function() {
    console.log('[PetStatus] 載入狀態管理模組...');
    const win = window.parent || window;

    // 定義狀態相關樣式
    const statusStyle = `
        .ph-stats-float { position: absolute; top: 60px; right: 15px; width: 140px; display: flex; flex-direction: column; gap: 8px; pointer-events: none; z-index: 10; align-items: flex-end; }
        .ph-stat-mini { display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 12px; backdrop-filter: blur(2px); width: 100%; justify-content: flex-end; }
        .ph-stat-icon { font-size: 12px; width: 14px; text-align: center; }
        .ph-stat-track { width: 80px; height: 5px; background: rgba(255,255,255,0.2); border-radius: 3px; overflow: hidden; }
        .ph-stat-fill { height: 100%; width: 50%; transition: width 0.5s ease-out; }
        .fill-hunger { background: #2ecc71; }
        .fill-mood { background: #f1c40f; }
        .fill-clean { background: #3498db; }
        .fill-love { background: #ff6b6b; }
        .ph-state-log-item { background: rgba(255,255,255,0.05); padding: 12px; margin-bottom: 10px; border-radius: 8px; border-left: 3px solid var(--ph-gold); position: relative; }
        .ph-state-log-time { font-size: 9px; color: #888; margin-top: 4px; }
    `;

    // 注入樣式
    const doc = window.parent.document || document;
    if (!doc.getElementById('pet-status-css')) {
        const s = doc.createElement('style');
        s.id = 'pet-status-css';
        s.innerHTML = statusStyle;
        doc.head.appendChild(s);
    }

    // 狀態管理類
    class PetStatusManager {
        constructor() {
            this.getCurrentPet = null; // 將由外部設置
            this.saveCurrentPet = null; // 將由外部設置
            // 離線狀態消耗配置（每分鐘消耗的百分比）
            this.offlineConsumptionRate = {
                hunger: 0.1,      // 每分鐘消耗 0.1% 飢餓度
                mood: 0.05,       // 每分鐘消耗 0.05% 心情
                cleanliness: 0.03, // 每分鐘消耗 0.03% 清潔度
                intimacy: 0.01    // 每分鐘消耗 0.01% 親密度（較慢）
            };
            // 最小離線時間（分鐘），低於此時間不消耗狀態
            this.minOfflineMinutes = 5;
        }

        /**
         * 初始化狀態管理器
         * @param {Function} getCurrentPet - 獲取當前寵物的函數
         * @param {Function} saveCurrentPet - 保存當前寵物的函數
         */
        init(getCurrentPet, saveCurrentPet) {
            this.getCurrentPet = getCurrentPet;
            this.saveCurrentPet = saveCurrentPet;
        }

        /**
         * 更新所有狀態條
         */
        updateBars() {
            const pet = this.getCurrentPet();
            if (!pet) return;
            
            this.setBar('bar-hunger', pet.hunger);
            this.setBar('bar-mood', pet.mood);
            this.setBar('bar-clean', pet.cleanliness || 50);
            this.setBar('bar-love', pet.intimacy);
        }

        /**
         * 設置單個狀態條
         * @param {string} id - 狀態條元素ID
         * @param {number} val - 狀態值 (0-100)
         */
        setBar(id, val) {
            const el = document.getElementById(id);
            if (el) {
                el.style.width = (val || 0) + '%';
            }
        }

        /**
         * 添加狀態日誌
         * @param {string} action - 操作描述
         */
        addToStateLog(action) {
            const pet = this.getCurrentPet();
            if (!pet) return;
            
            if (!pet.stateLog) pet.stateLog = [];
            const logEntry = { action, timestamp: Date.now() };
            pet.stateLog.push(logEntry);
            
            // 限制日誌數量
            if (pet.stateLog.length > 100) {
                pet.stateLog.shift();
            }
            
            this.saveCurrentPet();
            
            // 如果狀態日誌面板是打開的，實時更新
            const stateContent = document.getElementById('ph-hist-state-content');
            if (stateContent && document.getElementById('ph-ov-hist')?.classList.contains('active')) {
                this.renderStateLogItem(stateContent, logEntry);
                stateContent.scrollTop = stateContent.scrollHeight;
            }
        }

        /**
         * 渲染狀態日誌項
         * @param {HTMLElement} container - 容器元素
         * @param {Object} item - 日誌項 {action, timestamp}
         */
        renderStateLogItem(container, item) {
            const div = document.createElement('div');
            div.className = 'ph-state-log-item';
            const timeAgo = this.formatTimeAgo(item.timestamp);
            div.innerHTML = `
                <div>${item.action}</div>
                <div class="ph-state-log-time">${timeAgo}</div>
            `;
            container.appendChild(div);
        }

        /**
         * 格式化時間差
         * @param {number} timestamp - 時間戳
         * @returns {string} 格式化後的時間字符串
         */
        formatTimeAgo(timestamp) {
            const now = Date.now();
            const diff = now - timestamp;
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            
            if (minutes < 1) return '剛剛';
            if (minutes < 60) return `${minutes}分鐘前`;
            if (hours < 24) return `${hours}小時前`;
            return `${days}天前`;
        }

        /**
         * 生成狀態浮動面板HTML
         * @returns {string} HTML字符串
         */
        generateStatsFloatHTML() {
            return `
                <div class="ph-stats-float">
                    <div class="ph-stat-mini">
                        <div class="ph-stat-track">
                            <div id="bar-hunger" class="ph-stat-fill fill-hunger"></div>
                        </div>
                        <span class="ph-stat-icon">🍖</span>
                    </div>
                    <div class="ph-stat-mini">
                        <div class="ph-stat-track">
                            <div id="bar-mood" class="ph-stat-fill fill-mood"></div>
                        </div>
                        <span class="ph-stat-icon">😊</span>
                    </div>
                    <div class="ph-stat-mini">
                        <div class="ph-stat-track">
                            <div id="bar-clean" class="ph-stat-fill fill-clean"></div>
                        </div>
                        <span class="ph-stat-icon">🚿</span>
                    </div>
                    <div class="ph-stat-mini">
                        <div class="ph-stat-track">
                            <div id="bar-love" class="ph-stat-fill fill-love"></div>
                        </div>
                        <span class="ph-stat-icon">❤️</span>
                    </div>
                </div>
            `;
        }

        /**
         * 更新狀態值（帶上限檢查）
         * @param {string} statName - 狀態名稱 ('hunger', 'mood', 'cleanliness', 'intimacy')
         * @param {number} value - 要增加的值（可以是負數）
         * @param {number} min - 最小值（默認0）
         * @param {number} max - 最大值（默認100）
         * @returns {number} 更新後的值
         */
        updateStat(statName, value, min = 0, max = 100) {
            const pet = this.getCurrentPet();
            if (!pet) return 0;
            
            const currentValue = pet[statName] || 0;
            const newValue = Math.max(min, Math.min(max, currentValue + value));
            pet[statName] = newValue;
            
            this.saveCurrentPet();
            this.updateBars();
            
            return newValue;
        }

        /**
         * 設置狀態值（直接設置）
         * @param {string} statName - 狀態名稱
         * @param {number} value - 要設置的值
         * @param {number} min - 最小值（默認0）
         * @param {number} max - 最大值（默認100）
         * @returns {number} 設置後的值
         */
        setStat(statName, value, min = 0, max = 100) {
            const pet = this.getCurrentPet();
            if (!pet) return 0;
            
            const newValue = Math.max(min, Math.min(max, value));
            pet[statName] = newValue;
            
            this.saveCurrentPet();
            this.updateBars();
            
            return newValue;
        }

        /**
         * 獲取狀態值
         * @param {string} statName - 狀態名稱
         * @returns {number} 狀態值
         */
        getStat(statName) {
            const pet = this.getCurrentPet();
            if (!pet) return 0;
            return pet[statName] || 0;
        }

        /**
         * 渲染所有狀態日誌
         * @param {HTMLElement} container - 容器元素
         */
        renderAllStateLogs(container) {
            const pet = this.getCurrentPet();
            if (!pet || !container) return;
            
            container.innerHTML = '';
            
            if (!pet.stateLog || pet.stateLog.length === 0) {
                container.innerHTML = `<div style="text-align:center;color:#666;margin-top:20px;">暫無狀態記錄</div>`;
                return;
            }
            
            pet.stateLog.forEach(item => {
                this.renderStateLogItem(container, item);
            });
            
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 50);
        }

        /**
         * 記錄當前訪問時間
         */
        recordVisitTime() {
            const pet = this.getCurrentPet();
            if (!pet) return;
            
            pet.lastVisitTime = Date.now();
            this.saveCurrentPet();
        }

        /**
         * 計算並應用離線狀態消耗
         * @returns {Object} 消耗信息 {offlineMinutes, consumed}
         */
        processOfflineConsumption() {
            const pet = this.getCurrentPet();
            if (!pet) return { offlineMinutes: 0, consumed: false };
            
            const now = Date.now();
            const lastVisit = pet.lastVisitTime || now;
            const offlineMs = now - lastVisit;
            const offlineMinutes = Math.floor(offlineMs / (1000 * 60));
            
            // 如果離線時間小於最小閾值，不消耗狀態
            if (offlineMinutes < this.minOfflineMinutes) {
                this.recordVisitTime();
                return { offlineMinutes, consumed: false };
            }
            
            // 獲取當前狀態值
            const currentHunger = pet.hunger ?? 100;
            const currentMood = pet.mood ?? 100;
            const currentCleanliness = pet.cleanliness ?? 100;
            const currentIntimacy = pet.intimacy ?? 100;
            
            // 計算各狀態的消耗量（每分鐘消耗指定百分比）
            const consumed = {
                hunger: Math.min(currentHunger, offlineMinutes * this.offlineConsumptionRate.hunger),
                mood: Math.min(currentMood, offlineMinutes * this.offlineConsumptionRate.mood),
                cleanliness: Math.min(currentCleanliness, offlineMinutes * this.offlineConsumptionRate.cleanliness),
                intimacy: Math.min(currentIntimacy, offlineMinutes * this.offlineConsumptionRate.intimacy)
            };
            
            // 應用消耗（減少狀態值，確保不低於0）
            pet.hunger = Math.max(0, currentHunger - consumed.hunger);
            pet.mood = Math.max(0, currentMood - consumed.mood);
            pet.cleanliness = Math.max(0, currentCleanliness - consumed.cleanliness);
            pet.intimacy = Math.max(0, currentIntimacy - consumed.intimacy);
            
            // 記錄到狀態日誌
            if (offlineMinutes >= 60) {
                const hours = Math.floor(offlineMinutes / 60);
                const minutes = offlineMinutes % 60;
                const timeStr = hours > 0 ? `${hours}小時${minutes}分鐘` : `${minutes}分鐘`;
                this.addToStateLog(`離線 ${timeStr}，狀態自然消耗`);
            } else {
                this.addToStateLog(`離線 ${offlineMinutes}分鐘，狀態自然消耗`);
            }
            
            // 更新最後訪問時間
            this.recordVisitTime();
            
            // 更新狀態條
            this.updateBars();
            
            return { offlineMinutes, consumed, pet };
        }

        /**
         * 格式化離線時間
         * @param {number} minutes - 離線分鐘數
         * @returns {string} 格式化後的時間字符串
         */
        formatOfflineTime(minutes) {
            if (minutes < 60) {
                return `${minutes}分鐘`;
            }
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            if (hours < 24) {
                return mins > 0 ? `${hours}小時${mins}分鐘` : `${hours}小時`;
            }
            const days = Math.floor(hours / 24);
            const remainingHours = hours % 24;
            if (remainingHours > 0) {
                return `${days}天${remainingHours}小時`;
            }
            return `${days}天`;
        }

        /**
         * 設置離線消耗速率
         * @param {Object} rates - 消耗速率配置 {hunger, mood, cleanliness, intimacy}
         */
        setOfflineConsumptionRate(rates) {
            if (rates.hunger !== undefined) this.offlineConsumptionRate.hunger = rates.hunger;
            if (rates.mood !== undefined) this.offlineConsumptionRate.mood = rates.mood;
            if (rates.cleanliness !== undefined) this.offlineConsumptionRate.cleanliness = rates.cleanliness;
            if (rates.intimacy !== undefined) this.offlineConsumptionRate.intimacy = rates.intimacy;
        }

        /**
         * 設置最小離線時間（分鐘）
         * @param {number} minutes - 最小離線時間
         */
        setMinOfflineMinutes(minutes) {
            this.minOfflineMinutes = minutes;
        }

        /**
         * 記錄聊天時間
         */
        recordChatTime() {
            const pet = this.getCurrentPet();
            if (!pet) return;
            
            pet.lastChatTime = Date.now();
            this.saveCurrentPet();
        }

        /**
         * 檢查聊天時間間隔，如果超過指定時間，返回時間間隔提示
         * @param {number} thresholdHours - 閾值（小時），默認2小時
         * @returns {string|null} 如果超過閾值，返回提示字符串，否則返回null
         */
        checkChatTimeInterval(thresholdHours = 2) {
            const pet = this.getCurrentPet();
            if (!pet) return null;
            
            const now = Date.now();
            const lastChatTime = pet.lastChatTime || now;
            const intervalMs = now - lastChatTime;
            const intervalHours = intervalMs / (1000 * 60 * 60);
            
            // 如果沒有上次聊天時間或間隔小於閾值，返回null
            if (!pet.lastChatTime || intervalHours < thresholdHours) {
                return null;
            }
            
            // 格式化時間間隔
            let timeStr = '';
            if (intervalHours < 24) {
                // 小於24小時，顯示小時
                const hours = Math.floor(intervalHours);
                const minutes = Math.floor((intervalHours - hours) * 60);
                if (minutes > 0) {
                    timeStr = `${hours}小時${minutes}分鐘`;
                } else {
                    timeStr = `${hours}小時`;
                }
            } else {
                // 大於等於24小時，顯示天數
                const days = Math.floor(intervalHours / 24);
                const remainingHours = Math.floor(intervalHours % 24);
                if (remainingHours > 0) {
                    timeStr = `${days}天${remainingHours}小時`;
                } else {
                    timeStr = `${days}天`;
                }
            }
            
            return `[時間間隔提示] 上次聊天時間與這次已經時隔${timeStr}，請以當前時間間隔邏輯對話，不要假設對話是連貫的。`;
        }

        /**
         * 獲取聊天時間間隔（小時）
         * @returns {number} 時間間隔（小時）
         */
        getChatTimeInterval() {
            const pet = this.getCurrentPet();
            if (!pet || !pet.lastChatTime) return 0;
            
            const now = Date.now();
            const intervalMs = now - pet.lastChatTime;
            return intervalMs / (1000 * 60 * 60);
        }
    }

    // 創建單例
    const statusManager = new PetStatusManager();

    // 導出到全局
    win.PET_STATUS = {
        manager: statusManager,
        // 便捷方法
        init: (getCurrentPet, saveCurrentPet) => statusManager.init(getCurrentPet, saveCurrentPet),
        updateBars: () => statusManager.updateBars(),
        setBar: (id, val) => statusManager.setBar(id, val),
        addToStateLog: (action) => statusManager.addToStateLog(action),
        renderStateLogItem: (container, item) => statusManager.renderStateLogItem(container, item),
        formatTimeAgo: (timestamp) => statusManager.formatTimeAgo(timestamp),
        generateStatsFloatHTML: () => statusManager.generateStatsFloatHTML(),
        updateStat: (statName, value, min, max) => statusManager.updateStat(statName, value, min, max),
        setStat: (statName, value, min, max) => statusManager.setStat(statName, value, min, max),
        getStat: (statName) => statusManager.getStat(statName),
        renderAllStateLogs: (container) => statusManager.renderAllStateLogs(container),
        // 離線狀態消耗相關方法
        recordVisitTime: () => statusManager.recordVisitTime(),
        processOfflineConsumption: () => statusManager.processOfflineConsumption(),
        formatOfflineTime: (minutes) => statusManager.formatOfflineTime(minutes),
        setOfflineConsumptionRate: (rates) => statusManager.setOfflineConsumptionRate(rates),
        setMinOfflineMinutes: (minutes) => statusManager.setMinOfflineMinutes(minutes),
        // 聊天時間管理相關方法
        recordChatTime: () => statusManager.recordChatTime(),
        checkChatTimeInterval: (thresholdHours) => statusManager.checkChatTimeInterval(thresholdHours),
        getChatTimeInterval: () => statusManager.getChatTimeInterval()
    };

    console.log('[PetStatus] 狀態管理模組載入完成');
})();

