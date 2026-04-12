// =======================================================================
//                       🔥 通用音效管理器
// =======================================================================
// 適用於所有iframe面板的音效系統

/**
 * 通用音效URL配置
 * 統一管理所有面板的音效資源
 */
const SOUND_URLS = {
    // UI交互音效
    pageFlipSound: 'https://nancywang3641.github.io/aurelia/UI_SFX/scene.wav', 
    clickSound: 'https://nancywang3641.github.io/aurelia/UI_SFX/click.wav',
    hoverSound: 'https://nancywang3641.github.io/aurelia/UI_SFX/hover.wav', 
    choiceSelectSound: 'https://nancywang3641.github.io/aurelia/UI_SFX/select.mp3',
    
    // 消息和通知音效
    messageSound: 'https://nancywang3641.github.io/aurelia/UI_SFX/popup.mp3', 
    popupSound: 'https://nancywang3641.github.io/aurelia/UI_SFX/popup.mp3',
    notificationSound: 'https://nancywang3641.github.io/aurelia/UI_SFX/popup.mp3',
    
    // 通話音效
    callSound: 'https://nancywang3641.github.io/aurelia/UI_SFX/call.mp3',
    callEndSound: 'https://nancywang3641.github.io/aurelia/UI_SFX/callEnd.mp3', 
    
    // 聊天音效
    chatSound: 'https://nancywang3641.github.io/aurelia/UI_SFX/popup.mp3',
    
    // 系統音效
    successSound: 'https://nancywang3641.github.io/aurelia/UI_SFX/popup.mp3',
    errorSound: 'https://nancywang3641.github.io/aurelia/UI_SFX/popup.mp3'
};

/**
 * 通用音效管理器
 * 支援多種音效類型，可套用到所有面板
 */
class UniversalSoundEffectManager {
    constructor() {
        this.soundEnabled = true;
        this.volume = 0.5;
        this.sounds = {};
        this.soundUrls = SOUND_URLS;
        this.init();
    }

    /**
     * 初始化音效系統
     */
    init() {
        try {
            // 🔥 使用統一的音效URL配置載入所有音效
            this.sounds = {};
            
            // 載入所有音效類型
            Object.entries(this.soundUrls).forEach(([key, url]) => {
                this.sounds[key] = new Audio(url);
                this.sounds[key].preload = 'auto';
                this.sounds[key].volume = this.volume;
            });

            // 設置音效屬性
            Object.values(this.sounds).forEach(sound => {
                sound.preload = 'auto';
                sound.volume = this.volume;
            });
            
            console.log('[通用音效系統] 音效已載入，支援類型:', Object.keys(this.sounds));
            console.log('[通用音效系統] 音效URL配置:', this.soundUrls);
        } catch (error) {
            console.warn('[通用音效系統] 音效載入失敗:', error);
        }
    }

    /**
     * 播放指定類型的音效
     * @param {string} soundType - 音效類型 (clickSound, hoverSound, choiceSelectSound, messageSound, callSound, etc.)
     */
    playSound(soundType = 'clickSound') {
        if (!this.soundEnabled) return;

        const sound = this.sounds[soundType];
        if (!sound) {
            console.warn('[通用音效系統] 未找到音效類型:', soundType);
            console.warn('[通用音效系統] 可用音效類型:', Object.keys(this.sounds));
            return;
        }

        try {
            // 重置音效到開始位置
            sound.currentTime = 0;
            // 播放音效
            sound.play().catch(error => {
                console.warn('[通用音效系統] 播放音效失敗:', error);
            });
        } catch (error) {
            console.warn('[通用音效系統] 播放音效時發生錯誤:', error);
        }
    }

    // ===== 🔥 快捷播放方法 =====
    
    /**
     * 播放點擊音效（快捷方法）
     */
    playClickSound() {
        this.playSound('clickSound');
    }

    /**
     * 播放懸停音效（快捷方法）
     */
    playHoverSound() {
        this.playSound('hoverSound');
    }

    /**
     * 播放選擇音效（快捷方法）
     */
    playChoiceSelectSound() {
        this.playSound('choiceSelectSound');
    }

    /**
     * 播放泡泡消息音效（快捷方法）
     */
    playPopupSound() {
        this.playSound('popupSound');
    }

    /**
     * 播放通知音效（快捷方法）
     */
    playNotificationSound() {
        this.playSound('notificationSound');
    }

    /**
     * 播放消息音效（快捷方法）
     */
    playMessageSound() {
        this.playSound('messageSound');
    }

    /**
     * 播放通話音效（快捷方法）
     */
    playCallSound() {
        this.playSound('callSound');
    }

    /**
     * 播放通話結束音效（快捷方法）
     */
    playCallEndSound() {
        this.playSound('callEndSound');
    }

    /**
     * 播放聊天音效（快捷方法）
     */
    playChatSound() {
        this.playSound('chatSound');
    }

    /**
     * 播放成功音效（快捷方法）
     */
    playSuccessSound() {
        this.playSound('successSound');
    }

    /**
     * 播放錯誤音效（快捷方法）
     */
    playErrorSound() {
        this.playSound('errorSound');
    }

    /**
     * 設置音效開關
     * @param {boolean} enabled - 是否啟用音效
     */
    setSoundEnabled(enabled) {
        this.soundEnabled = enabled;
        console.log('[通用音效系統] 音效開關:', enabled ? '開啟' : '關閉');
    }

    /**
     * 設置音量
     * @param {number} volume - 音量 (0-1)
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        Object.values(this.sounds).forEach(sound => {
            sound.volume = this.volume;
        });
        console.log('[通用音效系統] 音量設置為:', this.volume);
    }

    /**
     * 切換音效開關
     * @returns {boolean} 當前音效狀態
     */
    toggleSound() {
        this.setSoundEnabled(!this.soundEnabled);
        return this.soundEnabled;
    }

    /**
     * 獲取音效狀態
     * @returns {object} 音效狀態信息
     */
    getStatus() {
        return {
            enabled: this.soundEnabled,
            volume: this.volume,
            availableSounds: Object.keys(this.sounds)
        };
    }
}

// 創建全域音效管理器
window.universalSoundManager = new UniversalSoundEffectManager();

// ===== 🔥 全域快捷函數 =====

/**
 * 快捷函數：播放點擊音效
 */
window.playClickSound = () => window.universalSoundManager.playClickSound();

/**
 * 快捷函數：播放懸停音效
 */
window.playHoverSound = () => window.universalSoundManager.playHoverSound();

/**
 * 快捷函數：播放選擇音效
 */
window.playChoiceSelectSound = () => window.universalSoundManager.playChoiceSelectSound();

/**
 * 快捷函數：播放泡泡消息音效
 */
window.playPopupSound = () => window.universalSoundManager.playPopupSound();

/**
 * 快捷函數：播放通知音效
 */
window.playNotificationSound = () => window.universalSoundManager.playNotificationSound();

/**
 * 快捷函數：播放消息音效
 */
window.playMessageSound = () => window.universalSoundManager.playMessageSound();

/**
 * 快捷函數：播放通話音效
 */
window.playCallSound = () => window.universalSoundManager.playCallSound();

/**
 * 快捷函數：播放通話結束音效
 */
window.playCallEndSound = () => window.universalSoundManager.playCallEndSound();

/**
 * 快捷函數：播放聊天音效
 */
window.playChatSound = () => window.universalSoundManager.playChatSound();

/**
 * 快捷函數：播放成功音效
 */
window.playSuccessSound = () => window.universalSoundManager.playSuccessSound();

/**
 * 快捷函數：播放錯誤音效
 */
window.playErrorSound = () => window.universalSoundManager.playErrorSound();

/**
 * 快捷函數：切換音效開關
 */
window.toggleSound = () => window.universalSoundManager.toggleSound();

/**
 * 快捷函數：設置音量
 */
window.setSoundVolume = (volume) => window.universalSoundManager.setVolume(volume);

/**
 * 快捷函數：設置音效開關
 */
window.setSoundEnabled = (enabled) => window.universalSoundManager.setSoundEnabled(enabled);

/**
 * 快捷函數：獲取音效狀態
 */
window.getSoundStatus = () => window.universalSoundManager.getStatus();

// 自動為消息創建添加音效
document.addEventListener('DOMContentLoaded', function() {
    console.log('[通用音效系統] 🎵 已載入，可用函數:');
    console.log('🔥 UI交互音效:');
    console.log('- playClickSound() - 播放點擊音效');
    console.log('- playHoverSound() - 播放懸停音效');
    console.log('- playChoiceSelectSound() - 播放選擇音效');
    console.log('🔥 消息音效:');
    console.log('- playPopupSound() - 播放泡泡消息音效');
    console.log('- playNotificationSound() - 播放通知音效');
    console.log('- playMessageSound() - 播放消息音效');
    console.log('- playChatSound() - 播放聊天音效');
    console.log('🔥 通話音效:');
    console.log('- playCallSound() - 播放通話音效');
    console.log('- playCallEndSound() - 播放通話結束音效');
    console.log('🔥 系統音效:');
    console.log('- playSuccessSound() - 播放成功音效');
    console.log('- playErrorSound() - 播放錯誤音效');
    console.log('🔥 控制函數:');
    console.log('- toggleSound() - 切換音效開關');
    console.log('- setSoundVolume(volume) - 設置音量 (0-1)');
    console.log('- setSoundEnabled(enabled) - 設置音效開關');
    console.log('- getSoundStatus() - 獲取音效狀態');
    console.log('🔥 通用播放:');
    console.log('- universalSoundManager.playSound(soundType) - 播放指定音效');
});

// 導出管理器供其他模組使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UniversalSoundEffectManager;
}
