/**
 * 轉賬倒計時管理器
 * 處理轉賬卡片的倒計時功能，3分鐘後自動過期
 */

class TransferTimerManager {
    constructor() {
        this.timers = new Map(); // 存儲所有倒計時器
        this.init();
    }

    init() {
        console.log('[轉賬倒計時] 初始化倒計時管理器');
        
        // 初始化時檢查所有現有的轉賬卡片
        this.checkExistingTransfers();
        
        // 定期檢查新的轉賬卡片（每5秒檢查一次，減少頻率）
        setInterval(() => {
            this.checkExistingTransfers();
        }, 5000);
    }

    // 檢查現有的轉賬和禮物卡片並啟動倒計時
    checkExistingTransfers() {
        const transferElements = document.querySelectorAll('.transfer-status.pending[data-expire-time]');
        const giftElements = document.querySelectorAll('.gift-status.pending[data-expire-time]');
        
        // 只有在有卡片時才輸出日誌
        if (transferElements.length > 0 || giftElements.length > 0) {
            console.log('[倒計時管理器] 找到轉賬卡片數量:', transferElements.length);
            console.log('[倒計時管理器] 找到禮物卡片數量:', giftElements.length);
        }
        
        // 處理轉賬卡片
        transferElements.forEach(element => {
            const transferId = element.getAttribute('data-transfer-id');
            
            // 如果這個轉賬還沒有倒計時器，就創建一個
            if (!this.timers.has(`transfer_${transferId}`)) {
                console.log('[倒計時管理器] 啟動轉賬倒計時:', transferId);
                this.startTimer(element, `transfer_${transferId}`, 'transfer');
            }
        });
        
        // 處理禮物卡片
        giftElements.forEach(element => {
            const giftId = element.getAttribute('data-gift-id');
            
            // 如果這個禮物還沒有倒計時器，就創建一個
            if (!this.timers.has(`gift_${giftId}`)) {
                console.log('[倒計時管理器] 啟動禮物倒計時:', giftId);
                this.startTimer(element, `gift_${giftId}`, 'gift');
            }
        });
    }

    // 啟動倒計時器
    startTimer(element, timerId, type = 'transfer') {
        const expireTime = parseInt(element.getAttribute('data-expire-time'));
        const now = Date.now();
        
        if (expireTime <= now) {
            // 已經過期
            this.expireItem(element, timerId, type);
            return;
        }

        // 創建倒計時器
        const timer = setInterval(() => {
            const currentTime = Date.now();
            const remainingTime = expireTime - currentTime;
            
            if (remainingTime <= 0) {
                // 時間到，過期
                this.expireItem(element, timerId, type);
                clearInterval(timer);
                this.timers.delete(timerId);
            } else {
                // 更新顯示
                this.updateTimerDisplay(element, remainingTime);
            }
        }, 1000);

        // 立即更新一次顯示
        this.updateTimerDisplay(element, expireTime - now);
        
        // 存儲倒計時器
        this.timers.set(timerId, timer);
        
        console.log(`[倒計時管理器] 啟動${type}倒計時器: ${timerId}`);
    }

    // 更新倒計時顯示
    updateTimerDisplay(element, remainingTime) {
        const minutes = Math.floor(remainingTime / 60000);
        const seconds = Math.floor((remainingTime % 60000) / 1000);
        
        const minutesElement = element.querySelector('.timer-minutes');
        const secondsElement = element.querySelector('.timer-seconds');
        const timerElement = element.querySelector('.transfer-timer, .gift-timer');
        
        // 只在調試模式下輸出詳細日誌
        if (window.debugMode) {
            console.log('[倒計時管理器] 更新顯示:', {
                minutes: minutes,
                seconds: seconds,
                hasMinutesElement: !!minutesElement,
                hasSecondsElement: !!secondsElement,
                hasTimerElement: !!timerElement
            });
        }
        
        if (minutesElement && secondsElement) {
            minutesElement.textContent = minutes.toString().padStart(2, '0');
            secondsElement.textContent = seconds.toString().padStart(2, '0');
            
            // 根據剩餘時間調整樣式
            if (remainingTime <= 30000) { // 30秒內
                timerElement.classList.remove('warning');
                timerElement.classList.add('danger');
            } else if (remainingTime <= 60000) { // 1分鐘內
                timerElement.classList.remove('danger');
                timerElement.classList.add('warning');
            } else {
                timerElement.classList.remove('warning', 'danger');
            }
        } else {
            console.warn('[倒計時管理器] 找不到倒計時元素');
        }
    }

    // 過期項目
    expireItem(element, timerId, type = 'transfer') {
        // 移除舊的狀態類
        element.classList.remove('pending', 'accepted', 'rejected');
        element.classList.add('expired');
        
        // 更新圖標和文字
        const iconElement = element.querySelector('.transfer-status-icon, .gift-status-icon');
        const textElement = element.querySelector('.transfer-status-text, .gift-status-text');
        const timerElement = element.querySelector('.transfer-timer, .gift-timer');
        
        if (iconElement) iconElement.textContent = '⏰';
        if (textElement) textElement.textContent = '已過期';
        if (timerElement) timerElement.style.display = 'none';
        
        console.log(`[倒計時管理器] ${type}已過期: ${timerId}`);
    }

    // 停止特定項目的倒計時器
    stopTimer(timerId) {
        const timer = this.timers.get(timerId);
        if (timer) {
            clearInterval(timer);
            this.timers.delete(timerId);
            console.log(`[倒計時管理器] 停止倒計時器: ${timerId}`);
        }
    }

    // 清理所有倒計時器
    cleanup() {
        this.timers.forEach((timer, transferId) => {
            clearInterval(timer);
        });
        this.timers.clear();
        console.log('[轉賬倒計時] 清理所有倒計時器');
    }
}

// 創建全局實例
window.transferTimerManager = new TransferTimerManager();

// 頁面卸載時清理
window.addEventListener('beforeunload', () => {
    if (window.transferTimerManager) {
        window.transferTimerManager.cleanup();
    }
});
