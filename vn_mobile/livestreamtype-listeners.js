/**
 * Livestream Type Listeners - Handles livestream-type dialogues in a visual novel.
 * (Supports new session-based event grouping AND fallbacks to old single-event processing)
 */

// ===== Livestream State =====
let currentLivestreamState = {
    isActive: false,
    currentSessionId: null,
    stream: {
        number: '', name: '直播間', streamer: '', status: '直播中',
        viewers: 0, gifts: 0, background: '', giftRanking: []
    },
    isClosing: false,
    // 新增: 主播發言隊列
    streamerSpeechQueue: [],
    currentSpeechIndex: 0,
    allSpeechesShown: false
};

// DOM Element Constants
const LIVESTREAM_DIALOG_ID = 'livestreamDialog';
const LIVESTREAM_CHAT_MESSAGES_ID = 'livestream-chat-messages';
const END_LIVESTREAM_BUTTON_ID = 'end-livestream-dialog';
const CLOSE_LIVESTREAM_DIALOG_SELECTOR = '.close-livestream-dialog';
const LIVESTREAM_DIALOG_TEXT_ID = 'livestream-dialog-text';


// ===== Internal Update Functions (called by logic within handleLivestreamDialogue) =====
// These functions assume the dialog is already open and managed by showLivestreamDialog.

function _updateStreamInfoDisplay(data) {
    console.log('[VN面板/直播間/_updateStreamInfoDisplay] 更新直播信息:', data);

    // 更新currentLivestreamState中的stream數據
    currentLivestreamState.stream.number = data.number || currentLivestreamState.stream.number;
    currentLivestreamState.stream.name = data.name || currentLivestreamState.stream.name;
    currentLivestreamState.stream.streamer = data.streamer || currentLivestreamState.stream.streamer;
    currentLivestreamState.stream.status = data.status || currentLivestreamState.stream.status;
    
    // 處理數字型數據
    if (data.viewers !== undefined) {
        currentLivestreamState.stream.viewers = parseInt(data.viewers) || 0;
    }
    
    if (data.gifts !== undefined) {
        currentLivestreamState.stream.gifts = parseInt(data.gifts) || 0;
    }
    
    // 處理禮物排行榜
    if (data.giftRanking && Array.isArray(data.giftRanking) && data.giftRanking.length > 0) {
        currentLivestreamState.stream.giftRanking = data.giftRanking;
        console.log('[VN面板/直播間] 設置禮物排行榜:', data.giftRanking);
    }
    
    // 更新UI
    updateLivestreamInfo();
    
    // 檢查關鍵元素是否正確顯示
    setTimeout(() => {
        const streamerNameEl = document.querySelector('#streamer-name');
        const roomNameEl = document.querySelector('#ls-stream-name');
        
        if (streamerNameEl) {
            console.log(`[VN面板/直播間] 檢查主播名顯示: ${streamerNameEl.textContent}`);
        } else {
            console.error('[VN面板/直播間] 未找到主播名元素 #streamer-name');
        }
        
        if (roomNameEl) {
            console.log(`[VN面板/直播間] 檢查直播間名顯示: ${roomNameEl.textContent}`);
        } else {
            console.error('[VN面板/直播間] 未找到直播間名元素 #ls-stream-name');
        }
    }, 100);
}

function _displayStreamerSpeech(data) {
    console.log('[VN面板/直播間/_displayStreamerSpeech] 顯示主播發言:', data);
    
    // 先確保直播對話框已經初始化並顯示
    const livestreamDialogEl = document.getElementById(LIVESTREAM_DIALOG_ID);
    if (!livestreamDialogEl || !livestreamDialogEl.classList.contains('active')) {
        console.log('[VN面板/直播間] 直播對話框尚未初始化，將信息添加到隊列');
        // 先添加到隊列，等對話框初始化後再顯示
        if (data.content !== undefined && data.content !== null) {
            currentLivestreamState.streamerSpeechQueue.push({
                content: data.content,
                background: data.background,
                portrait: data.portrait
            });
            console.log(`[VN面板/直播間] 添加主播發言到隊列，當前隊列長度: ${currentLivestreamState.streamerSpeechQueue.length}`);
        }
        return;
    }
    
    // 現在開始更新背景和立繪
    
    // 更新背景（如果有提供）
    if (data.background) {
        console.log(`[VN面板/直播間] 更新主播背景: ${data.background}`);
        setTimeout(() => {
            // 使用setTimeout確保DOM已完全更新
        updateLivestreamBackground(data.background);
        }, 100);
    }
    
    // 更新主播形象（如果有提供）
    if (data.portrait) {
        console.log(`[VN面板/直播間] 更新主播立繪: ${data.portrait}`);
        setTimeout(() => {
            // 使用setTimeout確保DOM已完全更新
        updateStreamerImage(data.portrait);
        }, 200);
    }

    // 將發言添加到隊列而不是直接顯示
    if (data.content !== undefined && data.content !== null) {
        currentLivestreamState.streamerSpeechQueue.push({
            content: data.content,
            background: data.background,
            portrait: data.portrait
        });
        
        console.log(`[VN面板/直播間] 添加主播發言到隊列，當前隊列長度: ${currentLivestreamState.streamerSpeechQueue.length}`);
        
        // 如果這是第一條消息，直接顯示
        if (currentLivestreamState.streamerSpeechQueue.length === 1) {
            showNextStreamerSpeech();
        }
    } else {
        console.warn('[VN面板/直播間] 沒有提供主播發言內容');
    }
}

function _appendAudienceChat(data) {
    console.log('[VN面板/直播間/_appendAudienceChat] Appending audience chat. Messages count:', data.messages ? data.messages.length : 0);
    if (data.messages && data.messages.length > 0) {
        const chatMessagesEl = document.getElementById(LIVESTREAM_CHAT_MESSAGES_ID);
        if (chatMessagesEl) {
            // 設置一個小延遲，讓消息逐個添加，有更好的視覺效果
            data.messages.forEach((message, index) => {
                setTimeout(() => {
                addChatMessage(message.username, message.content);
                }, index * 800); // 每隔800毫秒添加一條消息
            });
            
            // 最後滾動到底部
            setTimeout(() => {
            chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
            }, data.messages.length * 800);
        } else {
            console.error(`[VN面板/直播間] Audience chat container #${LIVESTREAM_CHAT_MESSAGES_ID} not found.`);
        }
    }
}

// ===== UI Management Functions =====

// 添加自定義CSS樣式表，確保覆蓋VN_style.css中的樣式
function addCustomStyles() {
    if (document.getElementById('livestream-custom-styles')) return;
    
    const styleEl = document.createElement('style');
    styleEl.id = 'livestream-custom-styles';
    styleEl.textContent = `
        .livestream-background {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background-size: cover !important;
            background-position: center !important;
            filter: none !important;
            opacity: 1 !important;
            z-index: 1 !important;
        }
        
        .livestream-background.with-image {
            box-shadow: inset 0 0 150px rgba(0, 0, 0, 0.6) !important;
            filter: brightness(0.85) !important;
        }
    `;
    document.head.appendChild(styleEl);
    console.log('[VN面板/直播間] 添加自定義樣式表以覆蓋VN_style.css');
}

// 設置默認背景
function setDefaultBackground() {
    // 確保自定義樣式表已添加
    addCustomStyles();
    
    const backgroundEl = document.querySelector('.livestream-main .livestream-background');
    if (!backgroundEl) return;
    
    console.log('[VN面板/直播間] 設置默認背景');
    
    // 移除with-image類
    backgroundEl.classList.remove('with-image');
    
    // 設置默認顏色漸變作為備用
    backgroundEl.style.backgroundColor = '#1a1a2e';
    backgroundEl.style.backgroundImage = 'linear-gradient(to bottom, #1a1a2e, #16213e)';
    
    // 嘗試加載默認背景圖片
    const defaultImg = new Image();
    defaultImg.onload = function() {
        console.log('[VN面板/直播間] 默認背景圖片加載成功');
        backgroundEl.style.backgroundImage = `url('http://127.0.0.1:8000/scene_img/default.jpg')`;
        backgroundEl.classList.add('with-image');
    };
    
    defaultImg.onerror = function() {
        console.warn('[VN面板/直播間] 默認背景圖片加載失敗，使用顏色漸變');
    };
    
    defaultImg.src = 'http://127.0.0.1:8000/scene_img/default.jpg';
}

// 嘗試加載背景圖片，如果失敗則嘗試下一個
function tryLoadBackgroundImage(backgroundEl, imageList, index) {
    if (index >= imageList.length) {
        console.error('[VN面板/直播間] 所有背景圖片加載失敗');
        setDefaultBackground();
        return;
    }
    
    const currentImage = imageList[index];
    console.log(`[VN面板/直播間] 嘗試加載背景圖片 (${index+1}/${imageList.length}): ${currentImage.url}`);
    
    const testImg = new Image();
    testImg.onload = function() {
        console.log(`[VN面板/直播間] 背景圖片加載成功: ${currentImage.url}`);
        backgroundEl.style.backgroundImage = `url('${currentImage.url}')`;
        backgroundEl.style.transition = 'background-image 0.5s ease-in-out';
        backgroundEl.classList.add('with-image');
    };
    
    testImg.onerror = function() {
        console.warn(`[VN面板/直播間] 背景圖片加載失敗: ${currentImage.url}，嘗試下一個...`);
        tryLoadBackgroundImage(backgroundEl, imageList, index + 1);
    };
    
    testImg.src = currentImage.url;
}

function updateLivestreamBackground(backgroundName) {
    // 確保自定義樣式表已添加
    addCustomStyles();
    
    if (!backgroundName) {
        console.log('[VN面板/直播間] 未提供背景名稱，使用默認背景');
        setDefaultBackground();
        return;
    }
    
    // 首先獲取主播區域元素，確保我們只在這裡設置背景
    const mainArea = document.querySelector('.livestream-main');
    if (!mainArea) {
        console.error('[VN面板/直播間] 找不到主播區域元素 .livestream-main');
        // 檢查整個直播對話框是否存在
        const dialogEl = document.getElementById(LIVESTREAM_DIALOG_ID);
        if (!dialogEl || !dialogEl.classList.contains('active')) {
            console.log('[VN面板/直播間] 直播對話框尚未顯示，暫時無法設置背景');
        }
        return;
    }
    
    const backgroundEl = mainArea.querySelector('.livestream-background');
    if (!backgroundEl) {
        console.error('[VN面板/直播間] 找不到背景元素 .livestream-background');
        
        // 嘗試創建背景元素
        try {
            const newBackgroundEl = document.createElement('div');
            newBackgroundEl.className = 'livestream-background';
            newBackgroundEl.style.position = 'absolute';
            newBackgroundEl.style.top = '0';
            newBackgroundEl.style.left = '0';
            newBackgroundEl.style.width = '100%';
            newBackgroundEl.style.height = '100%';
            newBackgroundEl.style.zIndex = '1';
            mainArea.insertBefore(newBackgroundEl, mainArea.firstChild);
            console.log('[VN面板/直播間] 已創建新的背景元素');
            
            // 遞迴調用本函數以設置背景
            setTimeout(() => updateLivestreamBackground(backgroundName), 50);
        } catch (e) {
            console.error('[VN面板/直播間] 創建背景元素失敗:', e);
        }
        return;
    }
    
    // 去掉可能的註釋（如"，白天"）
    const cleanBgName = backgroundName.replace(/，.*$/g, '').trim();
    
    console.log(`[VN面板/直播間] 正在設置直播背景: ${cleanBgName}`);
    
    // 先顯示一個占位背景
    backgroundEl.style.backgroundColor = '#000';
    
    // 檢查是否使用上傳模式
    const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
    const isUploadMode = savedSettings.sourceMode === 'upload';
    
    if (isUploadMode && window.materialImageManager) {
        // 上傳模式：從IndexedDB獲取背景圖片
        window.materialImageManager.getImagesByCategory('background').then(images => {
            const matchedImage = images.find(img => {
                const imgName = img.name.replace(/\.[^/.]+$/, '');
                return imgName === cleanBgName || imgName.includes(cleanBgName);
            });
            
            if (matchedImage) {
                console.log('[VN面板/直播間] 從IndexedDB找到背景圖片:', matchedImage.name);
                backgroundEl.style.backgroundImage = `url('${matchedImage.url}')`;
                backgroundEl.style.transition = 'background-image 0.5s ease-in-out';
                backgroundEl.classList.add('with-image');
            } else {
                console.warn('[VN面板/直播間] IndexedDB中未找到背景圖片，使用預設URL:', cleanBgName);
                // 使用預設URL模式
                const imagesToTry = [
                    { url: `http://127.0.0.1:8000/scene_img/${cleanBgName}.jpg`, type: 'jpg' },
                    { url: `http://127.0.0.1:8000/scene_img/${cleanBgName}.png`, type: 'png' },
                    { url: `http://127.0.0.1:8000/scene_img/${cleanBgName}`, type: 'no-ext' },
                    { url: `http://127.0.0.1:8000/scene_img/default.jpg`, type: 'default' }
                ];
                tryLoadBackgroundImage(backgroundEl, imagesToTry, 0);
            }
        }).catch(error => {
            console.error('[VN面板/直播間] 從IndexedDB獲取背景圖片失敗:', error);
            // 使用預設URL模式
            const imagesToTry = [
                { url: `http://127.0.0.1:8000/scene_img/${cleanBgName}.jpg`, type: 'jpg' },
                { url: `http://127.0.0.1:8000/scene_img/${cleanBgName}.png`, type: 'png' },
                { url: `http://127.0.0.1:8000/scene_img/${cleanBgName}`, type: 'no-ext' },
                { url: `http://127.0.0.1:8000/scene_img/default.jpg`, type: 'default' }
            ];
            tryLoadBackgroundImage(backgroundEl, imagesToTry, 0);
        });
    } else {
        // URL模式：使用預設URL
        const imagesToTry = [
            { url: `http://127.0.0.1:8000/scene_img/${cleanBgName}.jpg`, type: 'jpg' },
            { url: `http://127.0.0.1:8000/scene_img/${cleanBgName}.png`, type: 'png' },
            { url: `http://127.0.0.1:8000/scene_img/${cleanBgName}`, type: 'no-ext' },
            { url: `http://127.0.0.1:8000/scene_img/default.jpg`, type: 'default' }
        ];
        
        // 嘗試加載第一個圖片
        tryLoadBackgroundImage(backgroundEl, imagesToTry, 0);
    }
}

function updateLivestreamInfo() {
    const streamData = currentLivestreamState.stream;
    console.log('[VN面板/直播間] 更新直播信息:', streamData);
    
    // 更新直播間名稱
    const roomNameEl = document.querySelector('#ls-stream-name');
    if (roomNameEl) {
        roomNameEl.textContent = streamData.name || '直播間';
        console.log(`[VN面板/直播間] 設置直播間名稱: ${streamData.name || '直播間'}`);
    } else {
        console.error('[VN面板/直播間] 找不到直播間名稱元素 #ls-stream-name');
    }
    
    // 更新主播名稱
    const streamerNameEl = document.querySelector('#streamer-name');
    if (streamerNameEl) {
        streamerNameEl.textContent = streamData.streamer || '主播';
        console.log(`[VN面板/直播間] 設置主播名稱: ${streamData.streamer || '主播'}`);
    } else {
        console.error('[VN面板/直播間] 找不到主播名稱元素 #streamer-name');
    }
    
    // 更新直播狀態
    const statusEl = document.querySelector('#ls-stream-status');
    if (statusEl) statusEl.textContent = streamData.status || '直播中';
    
    // 更新觀看人數
    const viewersEl = document.querySelector('#ls-viewers-count');
    if (viewersEl) viewersEl.textContent = (typeof streamData.viewers === 'number' ? 
        streamData.viewers.toLocaleString() : streamData.viewers) || '0';
    
    // 更新禮物數量
    const giftsEl = document.querySelector('#ls-gifts-count');
    if (giftsEl) giftsEl.textContent = (typeof streamData.gifts === 'number' ? 
        streamData.gifts.toLocaleString() : streamData.gifts) || '0';
    
    // 更新禮物排行榜
    updateGiftRanking();
}

function updateStreamerImage(portraitName) {
    if (!portraitName) {
        console.log('[VN面板/直播間] 未提供立繪名稱，使用默認立繪');
        setDefaultStreamerImage();
        return;
    }
    
    const streamerImgEl = document.querySelector('#streamer-image');
    if (!streamerImgEl) {
        console.error('[VN面板/直播間] 找不到主播圖像元素 #streamer-image');
        
        // 檢查對話框是否已初始化
        const dialogEl = document.getElementById(LIVESTREAM_DIALOG_ID);
        if (!dialogEl || !dialogEl.classList.contains('active')) {
            console.log('[VN面板/直播間] 直播對話框尚未顯示，暫時無法設置立繪');
        }
        return;
    }
    
    console.log(`[VN面板/直播間] 設置主播立繪: ${portraitName}`);
    
    // 從名稱中提取基本角色名（移除表情部分）
    let baseCharacterName = portraitName;
    if (portraitName.includes('_')) {
        baseCharacterName = portraitName.split('_')[0];
    }
    
    // 檢查是否使用上傳模式
    const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
    const isUploadMode = savedSettings.sourceMode === 'upload';
    
    // 先設置載入中的提示
    streamerImgEl.style.opacity = '0.5';
    streamerImgEl.style.transition = 'opacity 0.3s ease';
    
    if (isUploadMode && window.materialImageManager) {
        // 上傳模式：從IndexedDB獲取角色圖片
        const cleanName = String(portraitName).replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
        
        window.materialImageManager.getImagesByCategory('portrait').then(images => {
            const matchedImage = images.find(img => {
                const imgName = img.name.replace(/\.[^/.]+$/, '');
                return imgName === cleanName || imgName.includes(cleanName);
            });
            
            if (matchedImage) {
                console.log('[VN面板/直播間] 從IndexedDB找到角色圖片:', matchedImage.name);
                streamerImgEl.src = matchedImage.url;
                streamerImgEl.style.opacity = '1';
                
                // 為圖片添加一些視覺效果
                streamerImgEl.style.filter = 'drop-shadow(0 5px 15px rgba(0,0,0,0.4))';
                
                // 設置合適的尺寸
                const imgRatio = matchedImage.naturalWidth / matchedImage.naturalHeight;
                if (imgRatio > 1) {
                    // 如果圖片較寬，限制寬度
                    streamerImgEl.style.maxWidth = '75%';
                    streamerImgEl.style.maxHeight = '85%';
                } else {
                    // 如果圖片較高，確保顯示完整
                    streamerImgEl.style.maxWidth = '70%';
                    streamerImgEl.style.maxHeight = '90%';
                }
                
                // 根據立繪尺寸調整顯示位置
                streamerImgEl.style.objectPosition = 'bottom center';
            } else {
                console.warn('[VN面板/直播間] IndexedDB中未找到角色圖片，使用預設URL:', cleanName);
                // 使用預設URL模式
                loadImageWithFallback(streamerImgEl, portraitName, baseCharacterName);
            }
        }).catch(error => {
            console.error('[VN面板/直播間] 從IndexedDB獲取角色圖片失敗:', error);
            // 使用預設URL模式
            loadImageWithFallback(streamerImgEl, portraitName, baseCharacterName);
        });
    } else {
        // URL模式：使用預設URL
        loadImageWithFallback(streamerImgEl, portraitName, baseCharacterName);
    }
}

// 輔助函數：使用預設URL模式加載圖片
function loadImageWithFallback(streamerImgEl, portraitName, baseCharacterName) {
    // 根據立繪編譯邏輯設置圖片路徑
    let imgUrl = `http://127.0.0.1:8000/characters_img/${portraitName}.png`;
    
    // 嘗試加載圖片
    const newImg = new Image();
    newImg.onload = function() {
        console.log(`[VN面板/直播間] 主播立繪加載成功: ${imgUrl}`);
        streamerImgEl.src = imgUrl;
        streamerImgEl.style.opacity = '1';
        
        // 為圖片添加一些視覺效果
        streamerImgEl.style.filter = 'drop-shadow(0 5px 15px rgba(0,0,0,0.4))';
        
        // 設置合適的尺寸
        const imgRatio = this.naturalWidth / this.naturalHeight;
        if (imgRatio > 1) {
            // 如果圖片較寬，限制寬度
            streamerImgEl.style.maxWidth = '75%';
            streamerImgEl.style.maxHeight = '85%';
        } else {
            // 如果圖片較高，確保顯示完整
            streamerImgEl.style.maxWidth = '70%';
            streamerImgEl.style.maxHeight = '90%';
        }
        
        // 根據立繪尺寸調整顯示位置
        streamerImgEl.style.objectPosition = 'bottom center';
    };
    
    // 添加錯誤處理，實現fallback機制
    newImg.onerror = function() {
        console.warn(`[VN面板/直播間] 無法加載主播立繪: ${imgUrl}`);
        
        // 嘗試不同的檔案格式
        const jpgUrl = imgUrl.replace('.png', '.jpg');
        console.log(`[VN面板/直播間] 嘗試加載JPG格式: ${jpgUrl}`);
        
        const jpgImg = new Image();
        jpgImg.onload = function() {
            console.log(`[VN面板/直播間] JPG格式立繪加載成功: ${jpgUrl}`);
            streamerImgEl.src = jpgUrl;
            streamerImgEl.style.opacity = '1';
        };
        
        jpgImg.onerror = function() {
            console.warn(`[VN面板/直播間] 無法加載JPG格式立繪: ${jpgUrl}`);
            
            // Fallback 1: 提取"_"前的名稱
            if (portraitName.includes('_')) {
                const presetUrl = `http://127.0.0.1:8000/characters_img/${baseCharacterName}_presets.png`;
                console.log(`[VN面板/直播間] 嘗試加載預設圖像: ${presetUrl}`);
                
                const presetImg = new Image();
                presetImg.onload = function() {
                    streamerImgEl.src = presetUrl;
                    streamerImgEl.style.opacity = '1';
                };
                
                presetImg.onerror = function() {
                    console.warn(`[VN面板/直播間] 無法加載預設圖像: ${presetUrl}，嘗試不帶_presets的基本圖像`);
                    
                    // 嘗試只用角色基本名稱
                    const baseUrl = `http://127.0.0.1:8000/characters_img/${baseCharacterName}.png`;
                    console.log(`[VN面板/直播間] 嘗試加載基本角色圖像: ${baseUrl}`);
                    
                    const baseImg = new Image();
                    baseImg.onload = function() {
                        streamerImgEl.src = baseUrl;
                        streamerImgEl.style.opacity = '1';
                    };
                    
                    baseImg.onerror = function() {
                        console.warn(`[VN面板/直播間] 無法加載基本角色圖像: ${baseUrl}，使用默認圖像`);
                        setDefaultStreamerImage(streamerImgEl);
                    };
                    
                    baseImg.src = baseUrl;
                };
                
                presetImg.src = presetUrl;
            } else {
                // 直接使用基本名稱
                const baseUrl = `http://127.0.0.1:8000/characters_img/${portraitName}.png`;
                
                const baseImg = new Image();
                baseImg.onload = function() {
                    streamerImgEl.src = baseUrl;
                    streamerImgEl.style.opacity = '1';
                };
                
                baseImg.onerror = function() {
                    console.warn(`[VN面板/直播間] 無法加載基本圖像: ${baseUrl}，使用默認圖像`);
                    setDefaultStreamerImage(streamerImgEl);
                };
                
                baseImg.src = baseUrl;
            }
        };
        
        jpgImg.src = jpgUrl;
    };
    
    newImg.src = imgUrl;
}

// 設置默認主播圖像
function setDefaultStreamerImage(imgElement) {
    const streamerImgEl = imgElement || document.querySelector('#streamer-image');
    if (!streamerImgEl) return;
    
    streamerImgEl.src = 'http://127.0.0.1:8000/characters_img/default.png';
    streamerImgEl.style.opacity = '1';
    console.log('[VN面板/直播間] 已設置默認主播圖像');
}

function addChatMessage(username, content) {
    // 檢查消息容器是否存在
    const chatMessagesEl = document.getElementById(LIVESTREAM_CHAT_MESSAGES_ID);
    if (!chatMessagesEl) {
        console.error(`[VN面板/直播間] 找不到觀眾聊天容器 #${LIVESTREAM_CHAT_MESSAGES_ID}`);
        return;
    }
    
    // 創建消息元素
    const messageEl = document.createElement('div');
    messageEl.className = 'livestream-chat-message new-message-animation';
    
    // 處理佔位符或模板標記
    let displayUsername = username;
    let displayContent = content;
    
    // 檢查是否為佔位符格式 {{...}}
    if (username && username.startsWith('{{') && username.endsWith('}}')) {
        displayUsername = username.substring(2, username.length - 2);
    }
    
    if (content && content.startsWith('{{') && content.endsWith('}}')) {
        displayContent = content.substring(2, content.length - 2);
    }
    
    // 構建HTML內容
    messageEl.innerHTML = `
        <span class="chat-username">${displayUsername}</span>
        <span class="chat-content">${displayContent}</span>
    `;
    
    // 添加到聊天容器
    chatMessagesEl.appendChild(messageEl);
    
    // 播放訊息音效
    playMessageSound();
    
    // 移除動畫類別（用於重複動畫效果）
    setTimeout(() => {
        messageEl.classList.remove('new-message-animation');
    }, 1000);
    
    // 滾動到最新消息
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    
    console.log(`[VN面板/直播間] 添加聊天消息: ${displayUsername}: ${displayContent.substring(0, 20)}${displayContent.length > 20 ? '...' : ''}`);
}

function playMessageSound() {
    try {
        const audio = new Audio('http://127.0.0.1:8000/sound_effect/message-pop.mp3');
        audio.volume = 0.5; // 設置音量為50%
        audio.play().catch(error => {
            console.warn('[VN面板/直播間] 播放訊息音效失敗:', error.message);
        });
    } catch (error) {
        console.error('[VN面板/直播間] 建立音效播放器失敗:', error);
    }
}

function updateGiftRanking() {
    const giftRankingEl = document.getElementById('gift-ranking-list');
    if (!giftRankingEl) return;
    
    // 清空當前排行榜
    giftRankingEl.innerHTML = '';
    
    // 檢查是否有排行榜數據
    if (!currentLivestreamState.stream.giftRanking || currentLivestreamState.stream.giftRanking.length === 0) {
        const emptyRankingEl = document.createElement('div');
        emptyRankingEl.className = 'no-gifts';
        emptyRankingEl.style.cssText = `
            text-align: center;
            padding: 15px 10px;
            color: rgba(255, 255, 255, 0.7);
            font-style: italic;
            background-color: rgba(0, 0, 0, 0.2);
            border-radius: 8px;
            margin-top: 5px;
        `;
        emptyRankingEl.innerHTML = '尚無禮物排名 <span style="font-size:16px;">🎁</span>';
        giftRankingEl.appendChild(emptyRankingEl);
        return;
    }
    
    // 按排名排序
    const sortedRanking = [...currentLivestreamState.stream.giftRanking]
        .sort((a, b) => a.rank - b.rank);
    
    // 取前3名
    const top3Ranking = sortedRanking.slice(0, 3);
    
    // 創建排行榜項
    top3Ranking.forEach((item, index) => {
        const rankItem = document.createElement('div');
        rankItem.className = 'gift-rank-item';
        
        // 添加動畫延遲效果
        rankItem.style.animation = `fadeIn 0.4s ease-out ${index * 0.15}s forwards`;
        rankItem.style.opacity = '0';
        
        // 使用emoji表示排名，加上不同顏色
        let rankEmoji = '';
        let rankStyle = '';
        if (item.rank === 1) {
            rankEmoji = '🥇';
            rankStyle = 'color: #FFD700; text-shadow: 0 0 5px rgba(255, 215, 0, 0.7);';
        }
        else if (item.rank === 2) {
            rankEmoji = '🥈';
            rankStyle = 'color: #C0C0C0; text-shadow: 0 0 5px rgba(192, 192, 192, 0.7);';
        }
        else if (item.rank === 3) {
            rankEmoji = '🥉'; 
            rankStyle = 'color: #CD7F32; text-shadow: 0 0 5px rgba(205, 127, 50, 0.7);';
        }
        else rankEmoji = `${item.rank}`;
        
        rankItem.innerHTML = `
            <span class="rank-number" style="${rankStyle}">${rankEmoji}</span>
            <span class="rank-username">${item.username}</span>
            <span class="rank-value">${item.value.toLocaleString()}</span>
        `;
        
        giftRankingEl.appendChild(rankItem);
    });
    
    console.log('[VN面板/直播間] 更新禮物排行榜 (Top 3):', top3Ranking);
}

function stopPropagationOnDialog(e) {
    if (e.target === document.getElementById(LIVESTREAM_DIALOG_ID)) e.stopPropagation();
}

// 新增: 顯示下一條主播發言
function showNextStreamerSpeech() {
    if (currentLivestreamState.streamerSpeechQueue.length === 0) {
        console.log('[VN面板/直播間] 發言隊列為空');
        return;
    }

    const currentSpeech = currentLivestreamState.streamerSpeechQueue[currentLivestreamState.currentSpeechIndex];
    console.log(`[VN面板/直播間] 顯示第 ${currentLivestreamState.currentSpeechIndex + 1}/${currentLivestreamState.streamerSpeechQueue.length} 條主播發言`);

    const dialogTextEl = document.getElementById(LIVESTREAM_DIALOG_TEXT_ID);
    if (dialogTextEl) {
        // 調整對話框視覺效果
        const dialogBox = dialogTextEl.closest('.livestream-dialog-box');
        if (dialogBox) {
            dialogBox.style.transition = 'background-color 0.3s ease';
            dialogBox.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
            setTimeout(() => {
                dialogBox.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            }, 300);
        }
        
        // 處理並顯示內容
        const content = currentSpeech.content || '';
        if (window.processMarkdown) {
            try {
                dialogTextEl.innerHTML = window.processMarkdown(content);
            } catch (e) {
                console.error('[VN面板/直播間] Markdown處理失敗:', e);
                dialogTextEl.textContent = content;
            }
    } else {
            dialogTextEl.textContent = content;
        }
        
        // 添加新消息動畫效果
        dialogTextEl.classList.remove('new-message');
        void dialogTextEl.offsetWidth; // 強制重排
        dialogTextEl.classList.add('new-message');
        
        // 已經顯示完所有消息
        if (currentLivestreamState.currentSpeechIndex >= currentLivestreamState.streamerSpeechQueue.length - 1) {
            currentLivestreamState.allSpeechesShown = true;
        }
    } else {
        console.error(`[VN面板/直播間] 未找到對話文本元素 '${LIVESTREAM_DIALOG_TEXT_ID}'`);
    }
}

// 修改: 設置點擊對話文本框可以顯示下一條發言
function setupLivestreamDialogClickListener() {
    // 對話框點擊監聽器
    const dialogBox = document.querySelector('.livestream-dialog-box');
    if (!dialogBox) return;

    // 移除舊的監聽器並添加新的
    const newElement = dialogBox.cloneNode(true);
    dialogBox.parentNode.replaceChild(newElement, dialogBox);
    
    newElement.addEventListener('click', function() {
        if (currentLivestreamState.currentSpeechIndex < currentLivestreamState.streamerSpeechQueue.length - 1) {
            currentLivestreamState.currentSpeechIndex++;
            showNextStreamerSpeech();
        }
    });
    
    console.log('[VN面板/直播間] 設置了直播對話框點擊監聽器');
}

// 調整聊天室樣式，讓消息更清晰
function adjustChatStyles() {
    // 添加聊天樣式到頁面，如果還沒添加
    if (!document.querySelector('#livestream-chat-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'livestream-chat-styles';
        styleEl.textContent = `
            .livestream-chat-message {
                margin-bottom: 8px;
                padding: 5px 8px;
                background-color: rgba(0, 0, 0, 0.4);
                border-radius: 8px;
                word-break: break-word;
                animation: fadeIn 0.3s ease-out forwards;
                transform-origin: right;
                opacity: 0;
            }
            .new-message-animation {
                animation: newMessagePopIn 0.4s ease-out forwards;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes newMessagePopIn {
                0% { opacity: 0; transform: translateX(20px) scale(0.8); }
                60% { opacity: 1; transform: translateX(-5px) scale(1.05); }
                100% { opacity: 1; transform: translateX(0) scale(1); }
            }
            .chat-username {
                display: block;
                font-weight: bold;
                color: #ffcc00;
                margin-bottom: 2px;
                font-size: 14px;
            }
            .chat-content {
                display: block;
                color: #ffffff;
                font-size: 14px;
                line-height: 1.4;
            }
            #gift-ranking-list .gift-rank-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 6px 12px;
                margin-bottom: 6px;
                background-color: rgba(50, 50, 80, 0.4);
                border-radius: 8px;
                transition: all 0.2s ease;
            }
            #gift-ranking-list .gift-rank-item:hover {
                background-color: rgba(70, 70, 110, 0.6);
                transform: translateY(-2px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            }
            .rank-number {
                font-size: 18px;
                margin-right: 10px;
            }
            .rank-username {
                flex-grow: 1;
                font-weight: bold;
                font-size: 15px;
                color: #ffffff;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .rank-value {
                color: #ffcc00;
                font-weight: bold;
                font-size: 16px;
                padding-left: 10px;
            }
            .gift-ranking-header {
                position: relative;
                padding-bottom: 10px !important;
            }
            .gift-ranking-header:after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 25%;
                width: 50%;
                height: 2px;
                background: linear-gradient(90deg, rgba(255,204,0,0), rgba(255,204,0,0.8), rgba(255,204,0,0));
            }
        `;
        document.head.appendChild(styleEl);
        console.log('[VN面板/直播間] 已添加聊天室樣式');
    }
}

// 增加初始化函數，調整直播對話框樣式
function adjustLivestreamDialogStyles() {
    // 調整直播對話框整體容器
    const dialogContainer = document.querySelector('.livestream-dialog-content');
    if (dialogContainer) {
        dialogContainer.style.minHeight = '500px';
        dialogContainer.style.display = 'flex';
        dialogContainer.style.flexDirection = 'row'; // 主播區域和聊天區域水平排列
    }

    // 調整主播區域 - 設為相對定位，用於內部絕對定位的基準點
    const mainArea = document.querySelector('.livestream-main');
    if (mainArea) {
        mainArea.style.flex = '1';
        mainArea.style.minHeight = '450px';
        mainArea.style.position = 'relative'; // 關鍵：使其成為定位基準
        mainArea.style.width = '70%';
        mainArea.style.overflow = 'hidden';
    }
    
    // 調整背景 - 全滿主播區域，處於最底層
    const backgroundEl = document.querySelector('.livestream-background');
    if (backgroundEl) {
        backgroundEl.style.position = 'absolute';
        backgroundEl.style.top = '0';
        backgroundEl.style.left = '0';
        backgroundEl.style.width = '100%';
        backgroundEl.style.height = '100%';
        backgroundEl.style.backgroundSize = 'cover';
        backgroundEl.style.backgroundPosition = 'center';
        backgroundEl.style.zIndex = '1'; // 最底層
    }
    
    // 調整主播角色區域 - 絕對定位在背景之上，靠底部放置
    const characterArea = document.querySelector('.livestream-character');
    if (characterArea) {
        characterArea.style.position = 'absolute';
        characterArea.style.bottom = '0'; // 角色完全靠底
        characterArea.style.left = '0';
        characterArea.style.width = '100%';
        characterArea.style.display = 'flex';
        characterArea.style.flexDirection = 'column';
        characterArea.style.alignItems = 'center';
        characterArea.style.justifyContent = 'flex-end';
        characterArea.style.zIndex = '2'; // 中間層
        characterArea.style.pointerEvents = 'none'; // 允許點擊穿透到背景
    }
    
    // 調整主播圖像 - 確保在底部
    const streamerImage = document.getElementById('streamer-image');
    if (streamerImage) {
        streamerImage.style.maxHeight = '70vh';
        streamerImage.style.maxWidth = '70%';
        streamerImage.style.objectFit = 'contain';
        streamerImage.style.objectPosition = 'bottom center';
        streamerImage.style.filter = 'drop-shadow(0 5px 15px rgba(0,0,0,0.5))';
        streamerImage.style.pointerEvents = 'auto'; // 恢復可點擊
        streamerImage.style.marginBottom = '0'; // 確保圖片靠底
        streamerImage.style.zIndex = '1'; // 設置為較低層級
        streamerImage.style.order = '1'; // 使用flexbox順序，確保先顯示圖片
    }
    
    // 調整主播名稱 - 確保在圖像上方顯示
    const streamerName = document.getElementById('streamer-name');
    if (streamerName) {
        streamerName.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        streamerName.style.color = '#fff';
        streamerName.style.padding = '5px 15px';
        streamerName.style.borderRadius = '15px';
        streamerName.style.fontWeight = 'bold';
        streamerName.style.pointerEvents = 'auto'; // 恢復可點擊
        streamerName.style.marginBottom = '10px'; // 底部間距
        streamerName.style.zIndex = '10'; // 確保在立繪上方
        streamerName.style.position = 'absolute'; // 絕對定位使其不受立繪影響
        streamerName.style.bottom = '0'; // 貼近底部
        streamerName.style.transform = 'translateY(-100%)'; // 往上移動自身高度，確保不擋立繪
        streamerName.style.order = '2'; // 使用flexbox順序，確保名稱在圖片後顯示
    }
    
    // 調整主播對話框 - 絕對定位在底部，位於角色層之上
    const dialogBox = document.querySelector('.livestream-dialog-box');
    if (dialogBox) {
        dialogBox.style.position = 'absolute';
        dialogBox.style.bottom = '10px';
        dialogBox.style.left = '5%';
        dialogBox.style.width = '90%';
        dialogBox.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        dialogBox.style.borderRadius = '10px';
        dialogBox.style.padding = '15px';
        dialogBox.style.boxSizing = 'border-box';
        dialogBox.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        dialogBox.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
        dialogBox.style.zIndex = '3'; // 最上層，確保在角色層之上
        dialogBox.style.minHeight = '60px';
        dialogBox.style.cursor = 'pointer'; // 使其看起來可點擊
    }
    
    // 調整對話文本元素
    const dialogTextEl = document.getElementById(LIVESTREAM_DIALOG_TEXT_ID);
    if (dialogTextEl) {
        dialogTextEl.style.color = '#fff';
        dialogTextEl.style.fontSize = '16px';
        dialogTextEl.style.lineHeight = '1.5';
        dialogTextEl.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.8)';
    }
    
    // 調整直播信息頭部 - 固定在頂部
    const headerEl = document.querySelector('.livestream-header');
    if (headerEl) {
        headerEl.style.position = 'absolute';
        headerEl.style.top = '0';
        headerEl.style.left = '0';
        headerEl.style.width = '100%';
        headerEl.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        headerEl.style.padding = '10px';
        headerEl.style.zIndex = '4'; // 置於最上層
        headerEl.style.boxSizing = 'border-box';
    }
    
    // 調整聊天區域
    const chatArea = document.querySelector('.livestream-chat');
    if (chatArea) {
        chatArea.style.width = '30%';
        chatArea.style.height = '100%';
        chatArea.style.display = 'flex';
        chatArea.style.flexDirection = 'column';
        chatArea.style.borderLeft = '1px solid rgba(255, 255, 255, 0.1)';
        chatArea.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        chatArea.style.position = 'relative';
    }
    
    // 調整排行榜區域 - 在頂部
    const rankingArea = document.querySelector('.livestream-gift-ranking');
    if (rankingArea) {
        rankingArea.style.padding = '10px';
        rankingArea.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
        rankingArea.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
        // 增加高度以顯示所有三個排名
        rankingArea.style.maxHeight = '180px';
        rankingArea.style.height = 'auto';
        rankingArea.style.overflowY = 'visible';
    }
    
    // 調整禮物排行榜標題
    const rankingHeader = document.querySelector('.gift-ranking-header');
    if (rankingHeader) {
        rankingHeader.style.fontSize = '14px';
        rankingHeader.style.padding = '5px';
        rankingHeader.style.textAlign = 'center';
        rankingHeader.style.fontWeight = 'bold';
        rankingHeader.style.color = '#ffcc00';
        rankingHeader.style.marginBottom = '8px';
    }
    
    // 調整排行項目樣式
    const rankingList = document.getElementById('gift-ranking-list');
    if (rankingList) {
        rankingList.style.display = 'flex';
        rankingList.style.flexDirection = 'column';
        rankingList.style.gap = '8px';
        
        // 獲取所有排行項目
        const rankItems = rankingList.querySelectorAll('.gift-rank-item');
        // 確保所有項目都顯示
        if (rankItems) {
            rankItems.forEach(item => {
                item.style.padding = '8px 10px';
                item.style.borderRadius = '6px';
                item.style.backgroundColor = 'rgba(50, 50, 80, 0.5)';
            });
        }
    }
    
    // 調整聊天消息容器
    const chatMessages = document.getElementById(LIVESTREAM_CHAT_MESSAGES_ID);
    if (chatMessages) {
        chatMessages.style.flex = '1';
        chatMessages.style.overflowY = 'auto';
        chatMessages.style.padding = '10px';
        chatMessages.style.boxSizing = 'border-box';
        chatMessages.style.marginTop = '5px';
    }
    
    // 調整聊天區域標題
    const chatHeader = document.querySelector('.livestream-chat-header');
    if (chatHeader) {
        chatHeader.style.padding = '8px 5px';
        chatHeader.style.textAlign = 'center';
        chatHeader.style.fontWeight = 'bold';
        chatHeader.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        chatHeader.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
        chatHeader.style.color = '#ffffff';
    }

    // 調整結束按鈕位置
    const endButton = document.getElementById('end-livestream-dialog');
    if (endButton) {
        endButton.style.position = 'absolute';
        endButton.style.bottom = '10px';
        endButton.style.right = '10px';
        endButton.style.zIndex = '5';
    }

    // 調整關閉按鈕位置
    const closeButton = document.querySelector('.close-livestream-dialog');
    if (closeButton) {
        closeButton.style.position = 'absolute';
        closeButton.style.top = '10px';
        closeButton.style.right = '10px';
        closeButton.style.zIndex = '5';
    }

    // 應用聊天樣式
    adjustChatStyles();
    
    // 為對話文本添加動畫
    if (!document.querySelector('#livestream-animations')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'livestream-animations';
        styleEl.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes pulse {
                0% { opacity: 0.6; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.05); }
                100% { opacity: 0.6; transform: scale(1); }
            }
            .new-message {
                animation: fadeIn 0.3s ease-out forwards;
            }
        `;
        document.head.appendChild(styleEl);
    }
    
    console.log('[VN面板/直播間] 已優化直播對話框佈局，應用視覺小說風格的層級結構');
}

function showLivestreamDialog(sessionId) {
    const livestreamDialogEl = document.getElementById(LIVESTREAM_DIALOG_ID);
    if (!livestreamDialogEl) {
        console.error('[VN面板/直播間] Livestream dialog element NOT FOUND!');
        return false; // Indicate failure
    }

    const isDifferentSession = currentLivestreamState.currentSessionId !== sessionId;
    const isDialogHidden = !livestreamDialogEl.classList.contains('active');

    if (isDialogHidden || isDifferentSession) {
        console.log(`[VN面板/直播間] Opening/Re-initializing for session ${sessionId}. Hidden: ${isDialogHidden}, Different Session: ${isDifferentSession}`);
        
        // 初始化對話框
        initializeLivestreamDialog(sessionId); // Pass session ID to init
        
        // 顯示對話框
        if (isDialogHidden) {
        livestreamDialogEl.classList.add('active');
            livestreamDialogEl.removeEventListener('click', stopPropagationOnDialog); // Clean up just in case
            livestreamDialogEl.addEventListener('click', stopPropagationOnDialog);
            
            // 延遲處理隊列中的消息，確保DOM完全加載和樣式已應用
            setTimeout(() => {
                console.log('[VN面板/直播間] 對話框已完全初始化，處理延遲的更新');
                
                // 處理任何在對話框顯示前收到的消息
                if (currentLivestreamState.streamerSpeechQueue.length > 0) {
                    console.log(`[VN面板/直播間] 發現${currentLivestreamState.streamerSpeechQueue.length}條延遲的主播發言，開始顯示`);
                    showNextStreamerSpeech();
                }
                
                // 檢查背景元素是否存在，如果不存在則創建
                const mainArea = livestreamDialogEl.querySelector('.livestream-main');
                if (mainArea && !mainArea.querySelector('.livestream-background')) {
                    console.log('[VN面板/直播間] 創建缺失的背景元素');
                    const backgroundEl = document.createElement('div');
                    backgroundEl.className = 'livestream-background';
                    backgroundEl.style.position = 'absolute';
                    backgroundEl.style.top = '0';
                    backgroundEl.style.left = '0';
                    backgroundEl.style.width = '100%';
                    backgroundEl.style.height = '100%';
                    backgroundEl.style.zIndex = '1';
                    mainArea.insertBefore(backgroundEl, mainArea.firstChild);
                    setDefaultBackground();
                }
                
                // 重新應用樣式，確保一切正常顯示
                adjustLivestreamDialogStyles();
            }, 300);
        }
    } else {
        console.log(`[VN面板/直播間] Dialog already active for session ${sessionId}.`);
        // 確保點擊監聽器已設置
        setupLivestreamDialogClickListener();
        // 調整直播對話框樣式
        adjustLivestreamDialogStyles();
    }
    currentLivestreamState.isActive = true;
    updateLivestreamInfo(); // Ensure latest info for current session is displayed
    return true; // Indicate success
}

function closeLivestreamDialog() {
    if (currentLivestreamState.isClosing) return;
    currentLivestreamState.isClosing = true;
    console.log('[VN面板/直播間] Initiating livestream dialog close sequence for session:', currentLivestreamState.currentSessionId);

    const livestreamDialogEl = document.getElementById(LIVESTREAM_DIALOG_ID);
    if (livestreamDialogEl) livestreamDialogEl.classList.remove('active');

    const oldSessionId = currentLivestreamState.currentSessionId;
    currentLivestreamState.isActive = false;
    currentLivestreamState.currentSessionId = null;

    setTimeout(() => {
        console.log(`[VN面板/直播間] Livestream session ${oldSessionId} ended. Requesting next dialogue.`);
        if (window.VNCore?.nextDialogue) window.VNCore.nextDialogue();
        else if (window.nextDialogue) window.nextDialogue();
        else if (window.parent?.VNCore?.nextDialogue) window.parent.VNCore.nextDialogue();
        else console.error("[VN面板/直播間] nextDialogue function not found!");
        // forceShowMainDialog logic can be added here if needed
        currentLivestreamState.isClosing = false;
    }, 200);
}

// Main parsing and dispatching logic for an event string
function _parseAndDispatchSingleEvent(eventString, eventSessionId) {
    console.log(`[VN面板/直播間/_parseAndDispatchSingleEvent] Parsing event for session ${eventSessionId}:`, eventString);
    
    // 先檢查是否有audience_chat:格式
    const audienceChatColonMatch = eventString.match(/\[live_stream\|[^|]+\|audience_chat:([\s\S]*?)\]/is);
    if (audienceChatColonMatch) {
        // 使用新格式處理 (audience_chat: 後換行，每行不帶|)
        console.log('[VN面板/直播間] 使用新格式處理觀眾聊天');
        const sessionId = eventString.match(/\[live_stream\|([^|]+)/i)[1];
        const chatContent = audienceChatColonMatch[1].trim();
        const lines = chatContent.split('\n');
        const messages = [];
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.startsWith('#ls_')) continue;
            
            const parts = trimmedLine.split('|');
            if (parts.length >= 3) {
                const msgId = parts[0].trim();
                const username = parts[1].trim();
                const content = parts[2].trim();
                
                messages.push({
                    id: msgId,
                    username: username,
                    content: content
                });
                console.log(`[VN面板/直播間] 已解析聊天訊息(新格式): ${msgId}, ${username}: ${content.substring(0, 20)}...`);
            }
        }
        
        if (messages.length > 0) {
            console.log(`[VN面板/直播間] 處理${messages.length}條觀眾消息`);
            _appendAudienceChat({ number: sessionId, messages });
        } else {
            console.warn('[VN面板/直播間] 沒有找到有效的觀眾消息格式');
        }
        return;
    }

    // 特殊處理audience_chat格式 (從audience_chat|ls_1|用戶|消息|ls_2|...)
    if (eventString.includes('|audience_chat|') && !eventString.includes('|audience_chat:')) {
        const audienceChatMatch = eventString.match(/\[live_stream\|([^|]+)\|audience_chat\|(.*)\]/is);
        if (audienceChatMatch && audienceChatMatch[2]) {
            console.log('[VN面板/直播間] 使用舊格式處理audience_chat');
            const sessionId = audienceChatMatch[1];
            const chatContent = audienceChatMatch[2];
            const parts = chatContent.split('|');
            const messages = [];
            
            // 每3個元素為一組(ID、用戶名、內容)
            for (let i = 0; i < parts.length; i += 3) {
                if (i + 2 < parts.length) {
                    const msgId = parts[i].trim();
                    const username = parts[i + 1].trim();
                    const content = parts[i + 2].trim();
                    
                    if (msgId.startsWith('#ls_')) {
                        messages.push({
                            id: msgId,
                            username: username,
                            content: content
                        });
                    }
                }
            }
            
            if (messages.length > 0) {
                console.log(`[VN面板/直播間] 處理${messages.length}條觀眾消息`);
                _appendAudienceChat({ number: sessionId, messages });
        return;
            }
        }
    }
    
    // 繼續處理其他格式
    const match = eventString.match(/\[live_stream\|(.*)\]/is);
    if (!match || !match[1]) {
        console.error('[VN面板/直播間] Invalid event string format:', eventString);
        return;
    }
    const params = match[1].split('|');
    if (params.length < 1 || params[0].replace(/[^\d]/g, '') !== eventSessionId.replace(/[^\d]/g, '')) {
        console.error('[VN面板/直播間] Event string session ID mismatch or missing:', eventString, `Expected session: ${eventSessionId}`);
        return;
    }

    let typeToProcess = '';
    let dataForSwitch = params.slice(1);

    // --- Heuristic Type Determination ---
    if (dataForSwitch.length > 0 && dataForSwitch[0].toLowerCase() === 'audience_chat') {
        typeToProcess = 'audience_chat'; dataForSwitch = dataForSwitch.slice(1);
    } else if (dataForSwitch.length >= 5 && !isNaN(parseInt(dataForSwitch[3])) && !isNaN(parseInt(dataForSwitch[4]))) {
        typeToProcess = '直播間名稱';
    } else if (dataForSwitch.length >= 3) {
        typeToProcess = '主播名';
    } else {
        console.error('[VN面板/直播間] Could not determine type for event string:', eventString); return;
    }
    console.log(`[VN面板/直播間] Event details: type=${typeToProcess}, data=`, dataForSwitch);

    // Dispatch to internal update functions
    switch (typeToProcess) {
        case '主播名':
            if (dataForSwitch.length < 4) { console.error('[VN面板/直播間] Event "主播名": Not enough params.'); break; }
            _displayStreamerSpeech({ number: eventSessionId, background: dataForSwitch[1], portrait: dataForSwitch[2], content: dataForSwitch[3] });
                break;
        case '直播間名稱':
            if (dataForSwitch.length < 5) { console.error('[VN面板/直播間] Event "直播間名稱": Not enough params.'); break; }
            const giftRanking = []; // Simplified parsing, ensure correct indices
            if (dataForSwitch.length > 5 && dataForSwitch[5]) {
                const rankingsStr = dataForSwitch[5]; const rankings = rankingsStr.split(',');
                rankings.forEach(rankStr => { const rankMatch = rankStr.trim().match(/#(\d+)(.*?)_(\d+)/); if (rankMatch) giftRanking.push({ rank: parseInt(rankMatch[1]), username: rankMatch[2].trim(), value: parseInt(rankMatch[3]) }); });
            }
            _updateStreamInfoDisplay({ number: eventSessionId, name: dataForSwitch[0], streamer: dataForSwitch[1], status: dataForSwitch[2], viewers: dataForSwitch[3], gifts: dataForSwitch[4], giftRanking });
            break;
        case 'audience_chat':
            // 舊的聊天訊息處理邏輯，支援多行格式
            const messages = [];
            
            // 逐一處理聊天訊息，每3個元素為一組(ID、用戶名、內容)
            for (let i = 0; i < dataForSwitch.length; i += 3) {
                if (i + 2 < dataForSwitch.length) {
                    const msgId = dataForSwitch[i];
                    const username = dataForSwitch[i + 1];
                    const content = dataForSwitch[i + 2];
                    
                    // 檢查是否有效的聊天訊息ID (#ls_X 格式)
                    if (msgId && msgId.startsWith('#ls_')) {
                        messages.push({ 
                            id: msgId, 
                            username: username, 
                            content: content 
                        });
                        console.log(`[VN面板/直播間] 已解析聊天訊息(舊格式): ${msgId}, ${username}: ${content.substring(0, 20)}...`);
                    }
                }
            }
            
            if (messages.length > 0) {
                console.log(`[VN面板/直播間] 處理${messages.length}條觀眾消息`);
                _appendAudienceChat({ number: eventSessionId, messages });
            } else {
                console.warn('[VN面板/直播間] 沒有找到有效的觀眾消息格式');
            }
                break;
        default: console.error(`[VN面板/直播間] Unknown event type in dispatch: '${typeToProcess}'`);
    }
}


/**
 * Main entry point from vntype-listeners.js
 * @param {Object} dialogue - The VN dialogue object
 */
function handleLivestreamDialogue(dialogue) {
    console.log('[VN面板/直播間] handleLivestreamDialogue received:', JSON.parse(JSON.stringify(dialogue)));

    // OPTION 1: New session-based logic (if processor is updated)
    if (dialogue.livestreamEvents && Array.isArray(dialogue.livestreamEvents) && dialogue.livestreamSessionId) {
        console.log(`[VN面板/直播間] Processing as NEW session-based logic. Session ID: ${dialogue.livestreamSessionId}, Events: ${dialogue.livestreamEvents.length}`);
        
        const sessionId = dialogue.livestreamSessionId;
        
        // 檢查是否已經有該sessionId的直播窗口打開
        if (currentLivestreamState.isActive && currentLivestreamState.currentSessionId === sessionId) {
            console.log(`[VN面板/直播間] 直播窗口已經打開，ID: ${sessionId}，將在同一窗口更新內容`);
            
            // 只處理新的事件，而不重新初始化窗口
            dialogue.livestreamEvents.forEach(rawEventString => {
                _parseAndDispatchSingleEvent(rawEventString, sessionId);
            });
            
            // 如果沒有特殊標記指示這是連續事件的最後一個，就不關閉窗口
            if (dialogue.isLastLivestreamEvent) {
                console.log(`[VN面板/直播間] 這是最後一個直播事件，完成後將關閉窗口`);
            } else {
                console.log(`[VN面板/直播間] 可能還有後續直播事件，保持窗口打開狀態`);
                // 調用nextDialogue繼續處理後續事件，但不關閉窗口
                setTimeout(() => {
                    if (window.VNCore?.nextDialogue) window.VNCore.nextDialogue();
                    else if (window.nextDialogue) window.nextDialogue();
                    else if (window.parent?.VNCore?.nextDialogue) window.parent.VNCore.nextDialogue();
                    else console.error("[VN面板/直播間] nextDialogue function not found!");
                }, 200);
                return; // 不關閉窗口，直接返回
            }
        } else {
            // 新窗口處理
            if (!showLivestreamDialog(sessionId)) return; // Failed to show/init dialog

            dialogue.livestreamEvents.forEach(rawEventString => {
                _parseAndDispatchSingleEvent(rawEventString, sessionId);
            });
            
            // 如果有標記指示這是連續事件的最後一個，則準備關閉窗口
            if (dialogue.isLastLivestreamEvent) {
                console.log(`[VN面板/直播間] 這是最後一個直播事件，完成後將關閉窗口`);
                } else {
                console.log(`[VN面板/直播間] 可能還有後續直播事件，保持窗口打開狀態`);
                // 調用nextDialogue繼續處理後續事件，但不關閉窗口
                setTimeout(() => {
                    if (window.VNCore?.nextDialogue) window.VNCore.nextDialogue();
                    else if (window.nextDialogue) window.nextDialogue();
                    else if (window.parent?.VNCore?.nextDialogue) window.parent.VNCore.nextDialogue();
                    else console.error("[VN面板/直播間] nextDialogue function not found!");
                }, 200);
                return; // 不關閉窗口，直接返回
            }
        }
        // Dialog remains open. User interaction (End Call button) will trigger closeLivestreamDialog -> nextDialogue.

    // OPTION 2: Fallback to old single-event logic (if processor is NOT updated)
    } else if (dialogue.content && typeof dialogue.content === 'string' && dialogue.content.startsWith('[live_stream|')) {
        console.warn('[VN面板/直播間] Fallback: Processing as OLD single-event logic. Processor likely not updated for event grouping.');
        
        const rawEventString = dialogue.content;
        const match = rawEventString.match(/\[live_stream\|(.*)\]/is);
        if (!match || !match[1]) {
            console.error('[VN面板/直播間] Fallback: Invalid single event string format:', rawEventString);
            if (window.VNCore?.nextDialogue) window.VNCore.nextDialogue(); return;
        }
        const params = match[1].split('|');
        if (params.length < 1) {
            console.error('[VN面板/直播間] Fallback: Event string missing session ID part.');
            if (window.VNCore?.nextDialogue) window.VNCore.nextDialogue(); return;
        }
        const singleEventSessionId = params[0]; // Use the #N from the line as its "session"

        // 檢查是否已經有窗口打開
        if (currentLivestreamState.isActive && currentLivestreamState.currentSessionId === singleEventSessionId) {
            console.log(`[VN面板/直播間] 直播窗口已經打開，ID: ${singleEventSessionId}，將在同一窗口更新內容`);
            _parseAndDispatchSingleEvent(rawEventString, singleEventSessionId);
            
            // 檢查是否應該關閉窗口或繼續處理
            if (dialogue.isLastLivestreamEvent) {
                console.log(`[VN面板/直播間] 這是最後一個直播事件，完成後將關閉窗口`);
            } else {
                console.log(`[VN面板/直播間] 可能還有後續直播事件，保持窗口打開狀態`);
                setTimeout(() => {
                    if (window.VNCore?.nextDialogue) window.VNCore.nextDialogue();
                    else if (window.nextDialogue) window.nextDialogue();
                    else if (window.parent?.VNCore?.nextDialogue) window.parent.VNCore.nextDialogue();
                    else console.error("[VN面板/直播間] nextDialogue function not found!");
                }, 200);
                return; // 不關閉窗口，直接返回
            }
        } else {
            if (!showLivestreamDialog(singleEventSessionId)) return; // Failed to show/init dialog
            _parseAndDispatchSingleEvent(rawEventString, singleEventSessionId);
            
            // 檢查是否是最後一個事件
            if (dialogue.isLastLivestreamEvent) {
                console.log(`[VN面板/直播間] 這是最後一個直播事件，完成後將關閉窗口`);
            } else {
                console.log(`[VN面板/直播間] 可能還有後續直播事件，保持窗口打開狀態`);
                setTimeout(() => {
                    if (window.VNCore?.nextDialogue) window.VNCore.nextDialogue();
                    else if (window.nextDialogue) window.nextDialogue();
                    else if (window.parent?.VNCore?.nextDialogue) window.parent.VNCore.nextDialogue();
                    else console.error("[VN面板/直播間] nextDialogue function not found!");
                }, 200);
                return; // 不關閉窗口，直接返回
            }
        }
        // Dialog remains open. User interaction (End Call button) will trigger closeLivestreamDialog -> nextDialogue.
        // This will result in "one window per line" if processor is not updated.
    
    } else {
        console.error('[VN面板/直播間] Dialogue object is not in new (livestreamEvents) or old (content string) format.', dialogue);
        if (window.VNCore?.nextDialogue) window.VNCore.nextDialogue(); // Try to proceed
    }
}

// Export public API
window.LivestreamType = {
    handleLivestreamDialogue,
    get currentLivestreamState() { return JSON.parse(JSON.stringify(currentLivestreamState)); }
};

// 新增: 創建直播對話框HTML結構的函數
function createLivestreamDialogHTML() {
    return `
        <div class="livestream-dialog-content">
            <div class="livestream-main">
                <!-- 背景層 -->
                <div class="livestream-background" style="position:absolute; top:0; left:0; width:100%; height:100%; background-color:#1a1a2e; background-image:linear-gradient(to bottom, #1a1a2e, #16213e); z-index:1;"></div>
                
                <!-- 主播角色層 - 注意：調整了內部結構，先放立繪再放名稱 -->
                <div class="livestream-character">
                    <img id="streamer-image" src="http://127.0.0.1:8000/characters_img/default.png" alt="主播">
                    <div id="streamer-name">主播</div>
                </div>
                
                <!-- 對話框層 -->
                <div class="livestream-dialog-box">
                    <div id="livestream-dialog-text" class="livestream-dialog-text"></div>
                </div>
                
                <!-- 直播信息層 -->
                <div class="livestream-header">
                    <div class="livestream-info">
                        <div id="ls-stream-name" class="stream-name">直播間</div>
                        <div class="stream-info-row">
                            <span id="ls-stream-status" class="stream-status">直播中</span>
                            <div class="stream-stats">
                                <span class="viewers-icon">👁️</span>
                                <span id="ls-viewers-count" class="viewers-count">0</span>
                                <span class="gifts-icon">🎁</span>
                                <span id="ls-gifts-count" class="gifts-count">0</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 聊天和禮物排行榜區域 -->
            <div class="livestream-chat">
                <div class="livestream-gift-ranking">
                    <div class="gift-ranking-header">🎁 禮物排行榜</div>
                    <div id="gift-ranking-list" class="gift-ranking-list"></div>
                </div>
                <div class="livestream-chat-header">💬 觀眾聊天室</div>
                <div id="livestream-chat-messages" class="livestream-chat-messages"></div>
            </div>
            
            <button id="end-livestream-dialog" class="end-livestream-dialog">結束觀看</button>
            <span class="close-livestream-dialog">&times;</span>
        </div>
    `;
}

function initializeLivestreamDialog(sessionId) {
    console.log(`[VN面板/直播間] Initializing livestream dialog UI for session: ${sessionId}.`);
    
    // 確保自定義樣式表已添加
    addCustomStyles();
    
    currentLivestreamState.currentSessionId = sessionId;
    // Reset stream data for the new session
    currentLivestreamState.stream = {
        number: sessionId.replace(/[^\d]/g, ''), name: '直播間', streamer: '', status: '直播中',
        viewers: 0, gifts: 0, background: '', giftRanking: []
    };
    // 重置發言隊列
    currentLivestreamState.streamerSpeechQueue = [];
    currentLivestreamState.currentSpeechIndex = 0;
    currentLivestreamState.allSpeechesShown = false;

    // 檢查是否需要創建或更新HTML結構
    const dialogEl = document.getElementById(LIVESTREAM_DIALOG_ID);
    if (dialogEl) {
        // 檢查HTML結構是否正確
        if (!dialogEl.querySelector('.livestream-dialog-content')) {
            dialogEl.innerHTML = createLivestreamDialogHTML();
        }
    }

    const chatMessagesEl = document.getElementById(LIVESTREAM_CHAT_MESSAGES_ID);
    if (chatMessagesEl) chatMessagesEl.innerHTML = '';
    const giftRankingEl = document.getElementById('gift-ranking-list');
    if (giftRankingEl) giftRankingEl.innerHTML = '';
    const dialogTextEl = document.getElementById(LIVESTREAM_DIALOG_TEXT_ID);
    if (dialogTextEl) dialogTextEl.textContent = '';

    // Setup End Livestream and Close buttons
    [
        { id: END_LIVESTREAM_BUTTON_ID, action: () => { if (!currentLivestreamState.isClosing) { /* Post message if needed */ closeLivestreamDialog(); } } },
        { selector: CLOSE_LIVESTREAM_DIALOG_SELECTOR, action: () => { if (!currentLivestreamState.isClosing) closeLivestreamDialog(); } }
    ].forEach(btnInfo => {
        const button = btnInfo.id ? document.getElementById(btnInfo.id) : document.querySelector(btnInfo.selector);
        if (button) {
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            newButton.addEventListener('click', btnInfo.action);
        }
    });
    updateLivestreamInfo(); // Display initial (reset) stream info
    
    // 設置默認背景（確保有背景可見）
    setDefaultBackground();
    
    // 設置對話框點擊監聽器
    setupLivestreamDialogClickListener();
    
    // 調整直播對話框樣式
    adjustLivestreamDialogStyles();
}