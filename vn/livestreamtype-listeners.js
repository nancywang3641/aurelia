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
    allSpeechesShown: false,
    currentBackground: null // 添加當前背景追蹤
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
    
    // 更新背景（如果有提供且與當前背景不同）
    if (data.background) {
        const currentBackground = currentLivestreamState.currentBackground;
        if (currentBackground !== data.background) {
            console.log(`[VN面板/直播間] 更新主播背景: ${data.background} (之前: ${currentBackground || '無'})`);
            currentLivestreamState.currentBackground = data.background;
            setTimeout(async () => {
                // 使用setTimeout確保DOM已完全更新
                await updateLivestreamBackground(data.background);
            }, 100);
        } else {
            console.log(`[VN面板/直播間] 背景未變更，保持當前背景: ${data.background}`);
        }
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
    console.log('[VN面板/直播間/_appendAudienceChat] Messages data:', data.messages);
    
    // 🔥 修改：添加聊天自動釋放開關，防止舊邏輯干擾
    if (!currentLivestreamState.chatAutoFlush) {
        console.warn('[VN面板/直播間] chatAutoFlush=false，忽略即時追加；請用 releaseAudienceChatForSpeech 控制。');
        return;
    }
    
    if (data.messages && data.messages.length > 0) {
        const chatMessagesEl = document.getElementById(LIVESTREAM_CHAT_MESSAGES_ID);
        console.log('[VN面板/直播間/_appendAudienceChat] Chat container found:', chatMessagesEl);
        
        if (chatMessagesEl) {
            // 🔥 修改：單條聊天消息立即顯示，不需要延遲
            data.messages.forEach((message, index) => {
                console.log(`[VN面板/直播間/_appendAudienceChat] Adding message ${index + 1}:`, message);
                // 立即添加聊天消息，因為已經在穿插處理中有延遲了
                    addChatMessage(message.username, message.content);
            });
            
            // 滾動到底部
            setTimeout(() => {
                chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
            }, 100);
        } else {
            console.error(`[VN面板/直播間] Audience chat container #${LIVESTREAM_CHAT_MESSAGES_ID} not found.`);
        }
    } else {
        console.warn('[VN面板/直播間/_appendAudienceChat] No messages to append');
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
    
    const backgroundEl = document.querySelector('.livestream-dialog-content .livestream-background');
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
        backgroundEl.style.backgroundImage = `url('https://nancywang3641.github.io/sound-files/scene_img/default.jpg')`;
        backgroundEl.classList.add('with-image');
    };
    
    defaultImg.onerror = function() {
        console.warn('[VN面板/直播間] 默認背景圖片加載失敗，使用顏色漸變');
    };
    
    defaultImg.src = 'https://nancywang3641.github.io/sound-files/scene_img/default.jpg';
}

// 生成直播間背景緩存鍵名
function generateLivestreamCacheKey(backgroundName) {
    // 清理背景名稱，移除特殊字符和空格
    const cleanName = backgroundName
        .replace(/[^\w\u4e00-\u9fff]/g, '_') // 只保留字母、數字、中文字符，其他替換為下劃線
        .replace(/_+/g, '_') // 多個下劃線替換為單個
        .replace(/^_|_$/g, '') // 移除首尾下劃線
        .toLowerCase(); // 轉為小寫
    
    // 生成穩定的緩存鍵名
    const cacheKey = `livestream_bg_${cleanName}`;
    console.log(`[VN面板/直播間] 生成緩存鍵名: ${backgroundName} -> ${cacheKey}`);
    
    return cacheKey;
}

// 檢查直播間背景緩存
async function checkLivestreamBackgroundCache(cacheKey) {
    try {
        // 檢查localStorage中的AI緩存
        const aiCache = localStorage.getItem('vn_ai_background_cache');
        if (aiCache) {
            const cache = JSON.parse(aiCache);
            const cachedItem = cache[cacheKey];
            
            if (cachedItem && cachedItem.imageUrl) {
                console.log(`[VN面板/直播間] 找到AI緩存: ${cacheKey}`);
                
                // 檢查圖片是否仍然有效
                const isValid = await checkImageExists(cachedItem.imageUrl);
                if (isValid) {
                    return cachedItem.imageUrl;
                } else {
                    console.log(`[VN面板/直播間] 緩存圖片已失效: ${cacheKey}`);
                    // 移除失效的緩存
                    delete cache[cacheKey];
                    localStorage.setItem('vn_ai_background_cache', JSON.stringify(cache));
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('[VN面板/直播間] 檢查背景緩存時出錯:', error);
        return null;
    }
}

// 檢查圖片是否存在
function checkImageExists(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            console.log('[VN面板/直播間] 圖片檢查成功:', url);
            resolve(true);
        };
        img.onerror = () => {
            console.log('[VN面板/直播間] 圖片檢查失敗:', url);
            resolve(false);
        };
        img.src = url;
        // 設置超時時間
        setTimeout(() => {
            console.log('[VN面板/直播間] 圖片檢查超時:', url);
            resolve(false);
        }, 5000);
    });
}

// 構建直播間背景生成提示詞
function buildLivestreamBackgroundPrompt(backgroundName) {
    // 根據背景名稱構建適合的提示詞
    const promptMap = {
        '都市夜景背景': 'modern city night view, neon lights, skyscrapers, urban landscape, dark atmosphere, cinematic lighting, high quality, detailed',
        '工作室': 'modern studio interior, professional lighting setup, streaming equipment, clean background, tech aesthetic, high quality, detailed',
        '辦公室': 'modern office interior, clean workspace, professional environment, natural lighting, high quality, detailed',
        '臥室': 'cozy bedroom interior, warm lighting, comfortable atmosphere, home environment, high quality, detailed',
        '客廳': 'modern living room, comfortable seating, warm lighting, home atmosphere, high quality, detailed',
        '咖啡廳': 'cozy cafe interior, warm lighting, comfortable seating, coffee shop atmosphere, high quality, detailed',
        '圖書館': 'quiet library interior, bookshelves, study atmosphere, peaceful environment, high quality, detailed',
        '音樂室': 'music studio interior, instruments, acoustic treatment, professional music environment, high quality, detailed',
        '遊戲室': 'gaming setup, RGB lighting, gaming equipment, modern tech aesthetic, high quality, detailed',
        '戶外': 'outdoor landscape, natural lighting, scenic view, high quality, detailed'
    };
    
    // 如果沒有預設的提示詞，使用通用提示詞
    if (promptMap[backgroundName]) {
        return promptMap[backgroundName];
    } else {
        // 通用提示詞，基於背景名稱
        return `${backgroundName}, modern interior, professional lighting, clean background, high quality, detailed, cinematic`;
    }
}

// 應用直播間背景圖片
function applyLivestreamBackgroundImage(imageUrl) {
    // 修復：背景元素在 .livestream-dialog-content 內部，不是 .livestream-main 內部
    const dialogContent = document.querySelector('.livestream-dialog-content');
    if (!dialogContent) {
        console.error('[VN面板/直播間] 找不到直播間對話內容元素 .livestream-dialog-content');
        return;
    }
    
    const backgroundEl = dialogContent.querySelector('.livestream-background');
    if (!backgroundEl) {
        console.error('[VN面板/直播間] 找不到背景元素 .livestream-background');
        return;
    }
    
    console.log(`[VN面板/直播間] 應用背景圖片: ${imageUrl}`);
    
    // 添加載入動畫
    backgroundEl.classList.add('loading');
    backgroundEl.style.opacity = '0.7';
    
    // 預加載圖片
    const img = new Image();
    img.onload = function() {
        console.log('[VN面板/直播間] 背景圖片預加載成功');
        
        // 移除載入動畫
        backgroundEl.classList.remove('loading');
        
        // 設置背景圖片
        backgroundEl.style.backgroundImage = `url('${imageUrl}')`;
        backgroundEl.style.backgroundSize = 'cover';
        backgroundEl.style.backgroundPosition = 'center';
        backgroundEl.classList.add('with-image');
        
        // 淡入動畫
        setTimeout(() => {
            backgroundEl.style.opacity = '1';
        }, 200);
    };
    
    img.onerror = function() {
        console.error('[VN面板/直播間] 背景圖片預加載失敗');
        backgroundEl.classList.remove('loading');
        backgroundEl.style.opacity = '1';
        // 不要立即設置默認背景，讓用戶看到錯誤狀態
        console.warn('[VN面板/直播間] 背景圖片加載失敗，保持當前狀態');
    };
    
    img.src = imageUrl;
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

async function updateLivestreamBackground(backgroundName) {
    // 確保自定義樣式表已添加
    addCustomStyles();
    
    if (!backgroundName) {
        console.log('[VN面板/直播間] 未提供背景名稱，使用默認背景');
        setDefaultBackground();
        return;
    }
    
    // 檢查是否有背景生成器可用
    if (window.vnBackgroundGenerator) {
        console.log(`[VN面板/直播間] 使用背景生成器生成背景: ${backgroundName}`);
        
        // 先顯示載入狀態
        const dialogContent = document.querySelector('.livestream-dialog-content');
        const backgroundEl = dialogContent?.querySelector('.livestream-background');
        if (backgroundEl) {
            backgroundEl.classList.add('loading');
            backgroundEl.style.opacity = '0.7';
        }
        
        // 生成穩定的緩存鍵名
        const cacheKey = generateLivestreamCacheKey(backgroundName);
        
        // 先檢查是否有緩存的背景圖片
        const cachedImage = await checkLivestreamBackgroundCache(cacheKey);
        if (cachedImage) {
            console.log(`[VN面板/直播間] 找到緩存的背景圖片: ${cachedImage}`);
            applyLivestreamBackgroundImage(cachedImage);
            return;
        }
        
        // 構建背景生成提示詞
        const backgroundPrompt = buildLivestreamBackgroundPrompt(backgroundName);
        
        // 調用背景生成器
        window.vnBackgroundGenerator.generateBackgroundImage(backgroundPrompt, cacheKey)
            .then(result => {
                if (result && result.url) {
                    console.log(`[VN面板/直播間] 背景圖片生成成功 (${result.source}): ${backgroundName}`);
                    applyLivestreamBackgroundImage(result.url);
                } else {
                    console.warn('[VN面板/直播間] 背景圖片生成失敗，保持當前狀態');
                    if (backgroundEl) {
                        backgroundEl.classList.remove('loading');
                        backgroundEl.style.opacity = '1';
                    }
                    // 不要立即設置默認背景，讓用戶看到錯誤狀態
                }
            })
            .catch(error => {
                console.error('[VN面板/直播間] 背景生成器錯誤:', error);
                if (backgroundEl) {
                    backgroundEl.classList.remove('loading');
                    backgroundEl.style.opacity = '1';
                }
                // 不要立即設置默認背景，讓用戶看到錯誤狀態
                console.warn('[VN面板/直播間] 背景生成失敗，保持當前狀態');
            });
    } else {
        console.log('[VN面板/直播間] 背景生成器不可用，保持當前狀態');
        // 不要立即設置默認背景，讓用戶看到當前狀態
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
    
    // 根據立繪編譯邏輯設置圖片路徑
    let imgUrl = `https://nancywang3641.github.io/sound-files/char_img/${portraitName}.png`;
    
    // 先設置載入中的提示
    streamerImgEl.style.opacity = '0.5';
    streamerImgEl.style.transition = 'opacity 0.3s ease';
    
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
                const presetUrl = `https://nancywang3641.github.io/sound-files/char_img/${baseCharacterName}_presets.png`;
                console.log(`[VN面板/直播間] 嘗試加載預設圖像: ${presetUrl}`);
                
                const presetImg = new Image();
                presetImg.onload = function() {
                    streamerImgEl.src = presetUrl;
                    streamerImgEl.style.opacity = '1';
                };
                
                presetImg.onerror = function() {
                    console.warn(`[VN面板/直播間] 無法加載預設圖像: ${presetUrl}，嘗試不帶_presets的基本圖像`);
                    
                    // 嘗試只用角色基本名稱
                    const baseUrl = `https://nancywang3641.github.io/sound-files/char_img/${baseCharacterName}.png`;
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
                const baseUrl = `https://nancywang3641.github.io/sound-files/char_img/${portraitName}.png`;
                
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
    
    streamerImgEl.src = 'https://nancywang3641.github.io/sound-files/char_presets/default.png';
    streamerImgEl.style.opacity = '1';
    console.log('[VN面板/直播間] 已設置默認主播圖像');
}

function addChatMessage(username, content) {
    console.log(`[VN面板/直播間/addChatMessage] Adding message: ${username}: ${content}`);
    
    // 檢查消息容器是否存在
    const chatMessagesEl = document.getElementById(LIVESTREAM_CHAT_MESSAGES_ID);
    if (!chatMessagesEl) {
        console.error(`[VN面板/直播間] 找不到觀眾聊天容器 #${LIVESTREAM_CHAT_MESSAGES_ID}`);
        return;
    }
    
    // 創建消息元素
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message new-message-animation';
    
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
        const audio = new Audio('https://nancywang3641.github.io/sound-files/sound_effect/message-pop.mp3');
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
        
        // 🔥 關鍵：顯示主播發言後，釋放對應的聊天桶
        // 注意：第一句主播是 currentSpeechIndex === 0，對應的聊天桶是 1
        const bucketIndex = currentLivestreamState.currentSpeechIndex + 1;
        console.log(`[VN面板/直播間] 🔥 主播發言顯示完成，準備釋放聊天桶 ${bucketIndex}`);
        
        // 延遲釋放聊天，讓主播發言先顯示完
        setTimeout(() => {
            releaseAudienceChatForSpeech(bucketIndex);
        }, 1000); // 主播發言顯示1秒後釋放聊天
        
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
                const dialogContent = livestreamDialogEl.querySelector('.livestream-dialog-content');
                if (dialogContent && !dialogContent.querySelector('.livestream-background')) {
                    console.log('[VN面板/直播間] 創建缺失的背景元素');
                    const backgroundEl = document.createElement('div');
                    backgroundEl.className = 'livestream-background';
                    backgroundEl.style.position = 'absolute';
                    backgroundEl.style.top = '0';
                    backgroundEl.style.left = '0';
                    backgroundEl.style.width = '100%';
                    backgroundEl.style.height = '100%';
                    backgroundEl.style.zIndex = '1';
                    dialogContent.insertBefore(backgroundEl, dialogContent.firstChild);
                    // 不要立即設置默認背景，讓已經設置的背景保持
                    console.log('[VN面板/直播間] 背景元素創建完成，保持當前背景狀態');
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
        
        // 检查对话状态
        const dialogueState = {
            'VNCoreAPI.currentDialogueIndex': window.VNCoreAPI?.currentDialogueIndex,
            'VNCoreAPI.dialogues.length': window.VNCoreAPI?.vnData?.dialogues?.length,
            'VNCore.currentDialogueIdx': window.VNCore?.currentDialogueIdx,
            'VNCore.vnData.dialogues.length': window.VNCore?.vnData?.dialogues?.length
        };
        console.log('[VN面板/直播間] 对话状态:', dialogueState);
        
        // 修正：由於vntype-features-special.js不再處理索引跳轉，這裡需要調用nextDialogue來繼續
        console.log('[VN面板/直播間] 直播間關閉完成，需要調用nextDialogue繼續後續對話');
        
        // 检查是否有后续对话
        const hasMoreDialogues = window.VNCoreAPI?.vnData?.dialogues && 
                               window.VNCoreAPI.currentDialogueIndex < window.VNCoreAPI.vnData.dialogues.length;
        
        if (hasMoreDialogues) {
            console.log('[VN面板/直播間] 检测到后续对话，调用nextDialogue继续');
            // 调用nextDialogue继续处理后续对话
            if (window.VNCore?.nextDialogue) {
                console.log('[VN面板/直播間] 调用VNCore.nextDialogue');
                window.VNCore.nextDialogue();
            } else if (window.nextDialogue) {
                console.log('[VN面板/直播間] 调用window.nextDialogue');
                window.nextDialogue();
            } else if (window.parent?.VNCore?.nextDialogue) {
                console.log('[VN面板/直播間] 调用parent.VNCore.nextDialogue');
                window.parent.VNCore.nextDialogue();
            } else {
                console.error("[VN面板/直播間] nextDialogue function not found!");
                // 回退到updateDialogue
                if (window.VNCoreAPI?.updateDialogue) {
                    console.log('[VN面板/直播間] 回退到VNCoreAPI.updateDialogue');
                    window.VNCoreAPI.updateDialogue();
                }
            }
        } else {
            console.log('[VN面板/直播間] 没有检测到后续对话，尝试触发VN处理器继续处理');
            
            // 尝试触发VN处理器继续处理
            if (window.TavernHelper?.triggerSlash) {
                console.log('[VN面板/直播間] 触发VN处理器继续处理');
                try {
                    window.TavernHelper.triggerSlash('/send 繼續劇情');
                    console.log('[VN面板/直播間] 已触发VN处理器');
                } catch (error) {
                    console.error('[VN面板/直播間] 触发VN处理器失败:', error);
                }
            } else if (window.VNProcessorReceiveChoice) {
                console.log('[VN面板/直播間] 通过VN处理器继续处理');
                try {
                    // 发送一个空的继续信号
                    window.VNProcessorReceiveChoice({
                        text: '继续剧情',
                        number: '继续'
                    });
                } catch (error) {
                    console.error('[VN面板/直播間] VN处理器处理失败:', error);
                }
            } else {
                console.log('[VN面板/直播間] 无法找到VN处理器，尝试强制更新对话状态');
                // 尝试强制更新对话状态
                if (window.VNCoreAPI?.updateDialogue) {
                    console.log('[VN面板/直播間] 尝试强制更新对话状态');
                    window.VNCoreAPI.updateDialogue();
                }
            }
        }
        
        currentLivestreamState.isClosing = false;
    }, 200);
}

// Main parsing and dispatching logic for an event string
function _parseAndDispatchSingleEvent(eventString, eventSessionId) {
    console.log(`[VN面板/直播間/_parseAndDispatchSingleEvent] Parsing event for session ${eventSessionId}:`, eventString);
    console.log(`[VN面板/直播間/_parseAndDispatchSingleEvent] Event string length:`, eventString.length);
    console.log(`[VN面板/直播間/_parseAndDispatchSingleEvent] Event string contains newlines:`, eventString.includes('\n'));
    
    // 🔥 新的簡化穿插聊天格式: [audience_chat_1|用戶名|消息內容]
    const simpleChatMatch = eventString.match(/^\[audience_chat_\d+\|([^|]+)\|(.+)\]$/i);
    if (simpleChatMatch) {
        console.log('[VN面板/直播間] 🔥 使用簡化穿插格式處理觀眾聊天 [audience_chat_1|...]');
        const [, username, content] = simpleChatMatch;
        
        const messages = [{
            id: `chat_${Date.now()}`,
            username: username.trim(),
            content: content.trim()
        }];
        
        console.log(`[VN面板/直播間] 🔥 解析簡化穿插聊天訊息: ${username}: ${content.substring(0, 30)}...`);
        // 🔥 修改：將聊天消息加入桶，而不是立即顯示
        queueAudienceChat(messages, speechBucketIndex);
        return;
    }
    
    // 🔥 舊的穿插聊天格式: [live_chat|audience_chat_1|用戶名|消息內容] (兼容)
    const interleavedChatMatch = eventString.match(/^\[live_chat\|audience_chat_\d+\|([^|]+)\|(.+)\]$/i);
    if (interleavedChatMatch) {
        console.log('[VN面板/直播間] 🔥 使用舊穿插格式處理觀眾聊天 [live_chat|audience_chat_1|...]');
        const [, username, content] = interleavedChatMatch;
        
        const messages = [{
            id: `chat_${Date.now()}`,
            username: username.trim(),
            content: content.trim()
        }];
        
        console.log(`[VN面板/直播間] 🔥 解析舊穿插聊天訊息: ${username}: ${content.substring(0, 30)}...`);
        // 🔥 修改：將聊天消息加入桶，而不是立即顯示
        queueAudienceChat(messages, speechBucketIndex);
        return;
    }
    
    // 新的聊天室格式: [live_chat|audience_chat: ...]
    const newLiveChatMatch = eventString.match(/\[live_chat\|audience_chat:([\s\S]*?)\]/is);
    if (newLiveChatMatch) {
        console.log('[VN面板/直播間] 使用新格式處理觀眾聊天 [live_chat]');
        const chatContent = newLiveChatMatch[1].trim();
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
            _appendAudienceChat({ number: eventSessionId, messages });
        } else {
            console.warn('[VN面板/直播間] 沒有找到有效的觀眾消息格式');
        }
        return;
    }
    
    // 新的主播对话格式: [streamer|主播名|背景|表情|内容]
    const streamerMatch = eventString.match(/\[streamer\|(.*)\]/is);
    if (streamerMatch) {
        console.log('[VN面板/直播間] 使用新格式處理主播對話 [streamer]');
        const params = streamerMatch[1].split('|');
        if (params.length >= 4) {
            const streamerName = params[0].trim();
            const background = params[1].trim();
            const expression = params[2].trim();
            const content = params[3].trim();
            
            _displayStreamerSpeech({ 
                number: eventSessionId, 
                background: background, 
                portrait: expression, 
                content: content 
            });
            
            // 🔥 關鍵：主播發言後，之後的聊天屬於「這句之後的桶」
            speechBucketIndex++;
            console.log(`[VN面板/直播間] 🔥 主播發言完成，聊天桶索引增加到: ${speechBucketIndex}`);
        } else {
            console.error('[VN面板/直播間] 主播對話格式參數不足:', params);
        }
        return;
    }
    
    // 先檢查是否有audience_chat:格式 (舊格式兼容)
    const audienceChatColonMatch = eventString.match(/\[live_stream\|[^|]+\|audience_chat:([\s\S]*?)\]/is);
    if (audienceChatColonMatch) {
        // 使用新格式處理 (audience_chat: 後換行，每行不帶|)
        console.log('[VN面板/直播間] 使用舊格式處理觀眾聊天');
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
                console.log(`[VN面板/直播間] 已解析聊天訊息(舊格式): ${msgId}, ${username}: ${content.substring(0, 20)}...`);
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

    // 特殊處理audience_chat格式 (從audience_chat|ls_1|用戶|消息|ls_2|...) - 只处理live_stream格式
    if (eventString.includes('|audience_chat|') && !eventString.includes('|audience_chat:') && eventString.startsWith('[live_stream|')) {
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
    
    // 繼續處理其他格式 (新格式: [live_stream|直播間名稱|主播名|直播狀態|人氣值|禮物積分|禮物排行榜])
    const match = eventString.match(/\[live_stream\|(.*)\]/is);
    if (!match || !match[1]) {
        console.error('[VN面板/直播間] Invalid event string format:', eventString);
        return;
    }
    const params = match[1].split('|');
    // 新格式不再需要全局则数，直接使用参数

    let typeToProcess = '';
    let dataForSwitch = params; // 新格式直接使用所有参数

    // --- Heuristic Type Determination for New Format ---
    // 新格式: [live_stream|直播間名稱|主播名|直播狀態|人氣值|禮物積分|禮物排行榜]
    if (dataForSwitch.length >= 5 && !isNaN(parseInt(dataForSwitch[3])) && !isNaN(parseInt(dataForSwitch[4]))) {
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
            // 新格式参数顺序: [直播間名稱|主播名|直播狀態|人氣值|禮物積分|禮物排行榜]
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

    // 🔥 OPTION 1: 穿插格式處理 (新的即時處理邏輯)
    if (dialogue.livestreamEvents && Array.isArray(dialogue.livestreamEvents) && dialogue.livestreamSessionId && dialogue.isInterleavedFormat) {
        console.log(`[VN面板/直播間] 🔥 處理穿插格式直播間數據. Session ID: ${dialogue.livestreamSessionId}, Events: ${dialogue.livestreamEvents.length}`);
        
        const sessionId = dialogue.livestreamSessionId;
        
        // 檢查是否已經有該sessionId的直播窗口打開
        if (currentLivestreamState.isActive && currentLivestreamState.currentSessionId === sessionId) {
            console.log(`[VN面板/直播間] 🔥 直播窗口已打開，即時更新穿插內容`);
            
            // 🔥 按順序處理每個穿插事件，實現真正的穿插效果
            processInterleavedEventsSequentially(dialogue.livestreamEvents, sessionId);
            return;
            
        } else {
            // 🔥 新窗口處理穿插格式
            if (!showLivestreamDialog(sessionId)) return;

            // 🔥 按順序處理每個穿插事件，實現真正的穿插效果
            processInterleavedEventsSequentially(dialogue.livestreamEvents, sessionId);
            return;
        }
    }

    // OPTION 2: 舊的session-based邏輯 (如果處理器未更新)
    else if (dialogue.livestreamEvents && Array.isArray(dialogue.livestreamEvents) && dialogue.livestreamSessionId) {
        console.log(`[VN面板/直播間] Processing as OLD session-based logic. Session ID: ${dialogue.livestreamSessionId}, Events: ${dialogue.livestreamEvents.length}`);
        
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

// 🔥 新增：聊天桶管理系統
let speechBucketIndex = 0; // 0 = 開場前；看到第一個 [streamer|...] 後變 1，以此類推

// 🔥 初始化聊天自動釋放開關為 false
if (typeof currentLivestreamState.chatAutoFlush === 'undefined') {
    currentLivestreamState.chatAutoFlush = false;
}

function queueAudienceChat(messages, bucketIndex) {
    console.log(`[VN面板/直播間] 🔥 將聊天消息加入桶 ${bucketIndex}:`, messages);
    if (!currentLivestreamState._audienceChatBuckets) {
        currentLivestreamState._audienceChatBuckets = [];
    }
    if (!currentLivestreamState._audienceChatBuckets[bucketIndex]) {
        currentLivestreamState._audienceChatBuckets[bucketIndex] = [];
    }
    currentLivestreamState._audienceChatBuckets[bucketIndex].push(...messages);
}

function releaseAudienceChatForSpeech(bucketIndex) {
    console.log(`[VN面板/直播間] 🔥 釋放聊天桶 ${bucketIndex}`);
    
    // 🔥 防止重複釋放：檢查是否已經釋放過
    if (currentLivestreamState._releasedBuckets && currentLivestreamState._releasedBuckets.includes(bucketIndex)) {
        console.log(`[VN面板/直播間] 🔥 桶 ${bucketIndex} 已經釋放過，跳過重複釋放`);
            return;
        }

    const bucket = currentLivestreamState._audienceChatBuckets?.[bucketIndex] || [];
    if (bucket.length === 0) {
        console.log(`[VN面板/直播間] 🔥 桶 ${bucketIndex} 為空，跳過`);
        return;
    }
    
    // 🔥 標記這個桶已經釋放過
    if (!currentLivestreamState._releasedBuckets) {
        currentLivestreamState._releasedBuckets = [];
    }
    currentLivestreamState._releasedBuckets.push(bucketIndex);
    
    console.log(`[VN面板/直播間] 🔥 開始釋放桶 ${bucketIndex} 中的 ${bucket.length} 條聊天消息`);
    bucket.forEach((msg, i) => {
        setTimeout(() => {
            addChatMessage(msg.username, msg.content);
            console.log(`[VN面板/直播間] 🔥 釋放聊天消息 ${i + 1}/${bucket.length}: ${msg.username}: ${msg.content.substring(0, 20)}...`);
        }, i * 400); // 每條消息間隔400毫秒
    });
}

// 🔥 新增：按順序處理穿插事件的函數（修改版）
function processInterleavedEventsSequentially(events, sessionId) {
    console.log(`[VN面板/直播間] 🔥 開始按順序處理 ${events.length} 個穿插事件`);
    
    // 重置聊天桶系統
    speechBucketIndex = 0;
    currentLivestreamState._audienceChatBuckets = [];
    currentLivestreamState._releasedBuckets = []; // 🔥 重置已釋放桶標記
    
    // 🔥 設置聊天自動釋放開關為 false，防止舊邏輯干擾
    currentLivestreamState.chatAutoFlush = false;
    console.log('[VN面板/直播間] 🔥 設置 chatAutoFlush = false，啟用聊天桶系統');
    
    let currentIndex = 0;
    
    function processNextEvent() {
        if (currentIndex >= events.length) {
            console.log(`[VN面板/直播間] 🔥 所有穿插事件處理完成，繼續下一個對話`);
            // 所有事件處理完成後，繼續下一個對話
            setTimeout(() => {
                if (window.VNCore?.nextDialogue) window.VNCore.nextDialogue();
                else if (window.nextDialogue) window.nextDialogue();
                else if (window.parent?.VNCore?.nextDialogue) window.parent.VNCore.nextDialogue();
                else console.error("[VN面板/直播間] nextDialogue function not found!");
            }, 500);
            return;
        }
        
        const eventString = events[currentIndex];
        console.log(`[VN面板/直播間] 🔥 處理第 ${currentIndex + 1}/${events.length} 個事件: ${eventString.substring(0, 50)}...`);
        
        // 處理當前事件
        _parseAndDispatchSingleEvent(eventString, sessionId);
        
        currentIndex++;
        
        // 根據事件類型決定下一個事件的延遲時間
        let nextDelay = 1000; // 默認1秒
        
        // 如果是聊天消息，延遲較短
        if (eventString.includes('audience_chat_') || eventString.includes('live_chat|audience_chat_')) {
            nextDelay = 800; // 聊天消息間隔0.8秒
        }
        // 如果是主播發言，延遲較長
        else if (eventString.includes('[streamer|')) {
            nextDelay = 2000; // 主播發言後等待2秒
        }
        // 如果是直播間信息，延遲較短
        else if (eventString.includes('[live_stream|')) {
            nextDelay = 500; // 直播間信息後等待0.5秒
        }
        
        console.log(`[VN面板/直播間] 🔥 下一個事件將在 ${nextDelay}ms 後處理`);
        
        // 延遲處理下一個事件
        setTimeout(processNextEvent, nextDelay);
    }
    
    // 開始處理第一個事件
    processNextEvent();
}

// Export public API
window.LivestreamType = {
    handleLivestreamDialogue,
    get currentLivestreamState() { return JSON.parse(JSON.stringify(currentLivestreamState)); }
};

// 🔥 添加消息監聽器來處理穿插格式的數據
window.addEventListener('message', function(event) {
    try {
        if (event.data && event.data.type === 'VN_LIVESTREAM_DATA') {
            console.log('[VN面板/直播間] 🔥 收到穿插格式直播間數據:', event.data);
            
            const livestreamData = event.data.data;
            if (livestreamData && livestreamData.isInterleavedFormat) {
                console.log('[VN面板/直播間] 🔥 處理穿插格式數據');
                
                // 創建對話對象來處理穿插格式
                const dialogue = {
                    livestreamEvents: livestreamData.livestreamEvents,
                    livestreamSessionId: livestreamData.livestreamSessionId,
                    isInterleavedFormat: true
                };
                
                // 調用處理函數
                handleLivestreamDialogue(dialogue);
            }
        }
    } catch (error) {
        console.error('[VN面板/直播間] 🔥 處理穿插格式數據時出錯:', error);
    }
});

// 新增: 創建直播對話框HTML結構的函數
function createLivestreamDialogHTML() {
    return `
        <div class="livestream-dialog-content">
            <div class="livestream-main">
                <!-- 背景層 -->
                <div class="livestream-background" style="position:absolute; top:0; left:0; width:100%; height:100%; background-color:#1a1a2e; background-image:linear-gradient(to bottom, #1a1a2e, #16213e); z-index:1;"></div>
                
                <!-- 主播角色層 - 注意：調整了內部結構，先放立繪再放名稱 -->
                <div class="livestream-character">
                    <img id="streamer-image" src="https://nancywang3641.github.io/sound-files/char_img/default.png" alt="主播">
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
                <div class="livestream-chat-header">💬 觀眾聊天室</div>
                <div id="livestream-chat-messages" class="livestream-chat-messages"></div>
                <div class="livestream-gift-ranking">
                    <div class="gift-ranking-header">🎁 禮物排行榜</div>
                    <div id="gift-ranking-list" class="gift-ranking-list"></div>
                </div>
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
    
    // 檢查背景生成器是否可用
    if (window.vnBackgroundGenerator) {
        console.log('[VN面板/直播間] 背景生成器已可用');
        
        // 添加調試功能到控制台
        window.livestreamBackgroundDebug = {
            // 查看所有緩存的背景
            listCache: () => {
                try {
                    const aiCache = localStorage.getItem('vn_ai_background_cache');
                    if (aiCache) {
                        const cache = JSON.parse(aiCache);
                        const livestreamCache = {};
                        
                        Object.keys(cache).forEach(key => {
                            if (key.startsWith('livestream_bg_')) {
                                livestreamCache[key] = cache[key];
                            }
                        });
                        
                        console.log('[VN面板/直播間] 緩存的背景圖片:', livestreamCache);
                        return livestreamCache;
                    } else {
                        console.log('[VN面板/直播間] 沒有找到背景緩存');
                        return {};
                    }
                } catch (error) {
                    console.error('[VN面板/直播間] 讀取緩存失敗:', error);
                    return {};
                }
            },
            
            // 清除所有直播間背景緩存
            clearCache: () => {
                try {
                    const aiCache = localStorage.getItem('vn_ai_background_cache');
                    if (aiCache) {
                        const cache = JSON.parse(aiCache);
                        let clearedCount = 0;
                        
                        Object.keys(cache).forEach(key => {
                            if (key.startsWith('livestream_bg_')) {
                                delete cache[key];
                                clearedCount++;
                            }
                        });
                        
                        localStorage.setItem('vn_ai_background_cache', JSON.stringify(cache));
                        console.log(`[VN面板/直播間] 已清除 ${clearedCount} 個背景緩存`);
                    }
                } catch (error) {
                    console.error('[VN面板/直播間] 清除緩存失敗:', error);
                }
            },
            
            // 強制重新生成背景
            regenerateBackground: (backgroundName) => {
                if (backgroundName) {
                    const cacheKey = generateLivestreamCacheKey(backgroundName);
                    console.log(`[VN面板/直播間] 強制重新生成背景: ${backgroundName} (${cacheKey})`);
                    
                    // 清除該背景的緩存
                    try {
                        const aiCache = localStorage.getItem('vn_ai_background_cache');
                        if (aiCache) {
                            const cache = JSON.parse(aiCache);
                            delete cache[cacheKey];
                            localStorage.setItem('vn_ai_background_cache', JSON.stringify(cache));
                        }
                    } catch (error) {
                        console.error('[VN面板/直播間] 清除緩存失敗:', error);
                    }
                    
                    // 重新生成背景
                    updateLivestreamBackground(backgroundName);
                } else {
                    console.log('[VN面板/直播間] 請提供背景名稱，例如: livestreamBackgroundDebug.regenerateBackground("都市夜景背景")');
                }
            },
            
            // 查看當前背景狀態
            getCurrentBackground: () => {
                console.log('[VN面板/直播間] 當前背景狀態:', {
                    currentBackground: currentLivestreamState.currentBackground,
                    isActive: currentLivestreamState.isActive,
                    currentSessionId: currentLivestreamState.currentSessionId,
                    streamerSpeechQueueLength: currentLivestreamState.streamerSpeechQueue.length,
                    currentSpeechIndex: currentLivestreamState.currentSpeechIndex
                });
                
                // 檢查DOM中的背景元素
                const backgroundEl = document.querySelector('.livestream-dialog-content .livestream-background');
                if (backgroundEl) {
                    console.log('[VN面板/直播間] DOM背景元素狀態:', {
                        backgroundImage: backgroundEl.style.backgroundImage,
                        hasWithImageClass: backgroundEl.classList.contains('with-image'),
                        hasLoadingClass: backgroundEl.classList.contains('loading'),
                        opacity: backgroundEl.style.opacity
                    });
                } else {
                    console.log('[VN面板/直播間] 未找到背景元素');
                }
                
                return {
                    currentBackground: currentLivestreamState.currentBackground,
                    isActive: currentLivestreamState.isActive,
                    backgroundElement: backgroundEl
                };
            },
            
            // 檢查對話狀態
            checkDialogueState: () => {
                console.log('[VN面板/直播間] 檢查對話狀態...');
                
                const dialogueState = {
                    'VNCoreAPI.currentDialogueIndex': window.VNCoreAPI?.currentDialogueIndex,
                    'VNCoreAPI.dialogues.length': window.VNCoreAPI?.vnData?.dialogues?.length,
                    'VNCore.currentDialogueIdx': window.VNCore?.currentDialogueIdx,
                    'VNCore.vnData.dialogues.length': window.VNCore?.vnData?.dialogues?.length,
                    'hasMoreDialogues': window.VNCoreAPI?.vnData?.dialogues && 
                                      window.VNCoreAPI.currentDialogueIndex < window.VNCoreAPI.vnData.dialogues.length
                };
                
                console.log('[VN面板/直播間] 對話狀態:', dialogueState);
                
                // 檢查當前對話內容
                if (window.VNCoreAPI?.vnData?.dialogues && window.VNCoreAPI?.currentDialogueIndex !== undefined) {
                    const currentDialogue = window.VNCoreAPI.vnData.dialogues[window.VNCoreAPI.currentDialogueIndex];
                    const nextDialogue = window.VNCoreAPI.vnData.dialogues[window.VNCoreAPI.currentDialogueIndex + 1];
                    console.log('[VN面板/直播間] 當前對話:', currentDialogue);
                    console.log('[VN面板/直播間] 下一對話:', nextDialogue);
                }
                
                // 檢查所有對話類型分布
                if (window.VNCoreAPI?.vnData?.dialogues) {
                    const dialogues = window.VNCoreAPI.vnData.dialogues;
                    const typeCount = {};
                    dialogues.forEach((dialogue, index) => {
                        const type = dialogue.type || 'unknown';
                        if (!typeCount[type]) typeCount[type] = [];
                        typeCount[type].push(index);
                    });
                    console.log('[VN面板/直播間] 對話類型分布:', typeCount);
                }
                
                return dialogueState;
            },
            
            // 強制繼續對話
            forceContinueDialogue: () => {
                console.log('[VN面板/直播間] 強制繼續對話...');
                
                if (window.VNCore?.nextDialogue) {
                    console.log('[VN面板/直播間] 調用VNCore.nextDialogue');
                    window.VNCore.nextDialogue();
                    return { success: true, method: 'VNCore.nextDialogue' };
                } else if (window.nextDialogue) {
                    console.log('[VN面板/直播間] 調用window.nextDialogue');
                    window.nextDialogue();
                    return { success: true, method: 'window.nextDialogue' };
                } else if (window.parent?.VNCore?.nextDialogue) {
                    console.log('[VN面板/直播間] 調用parent.VNCore.nextDialogue');
                    window.parent.VNCore.nextDialogue();
                    return { success: true, method: 'parent.VNCore.nextDialogue' };
                } else {
                    console.error("[VN面板/直播間] nextDialogue function not found!");
                    return { success: false, error: 'nextDialogue function not found' };
                }
            },
            
            // 檢查VN處理器解析狀態
            checkVNProcessorState: () => {
                console.log('[VN面板/直播間] 檢查VN處理器狀態...');
                
                const processorState = {
                    'TavernHelper': !!window.TavernHelper,
                    'TavernHelper.triggerSlash': !!window.TavernHelper?.triggerSlash,
                    'VNProcessorReceiveChoice': !!window.VNProcessorReceiveChoice,
                    'VNProcessorProcessHistoryItem': !!window.VNProcessorProcessHistoryItem,
                    'CONFIG.DEBUG': window.CONFIG?.DEBUG
                };
                
                console.log('[VN面板/直播間] VN處理器狀態:', processorState);
                
                // 檢查是否有新的消息需要處理
                if (window.TavernHelper?.getChatMessages) {
                    try {
                        // 嘗試獲取最新的消息
                        window.TavernHelper.getChatMessages().then(messages => {
                            if (messages && messages.length > 0) {
                                const lastMessage = messages[messages.length - 1];
                                console.log('[VN面板/直播間] 最新消息:', {
                                    id: lastMessage.message_id,
                                    content: lastMessage.message.substring(0, 100) + '...'
                                });
                            }
                        }).catch(error => {
                            console.error('[VN面板/直播間] 獲取消息失敗:', error);
                        });
                    } catch (error) {
                        console.error('[VN面板/直播間] 檢查消息失敗:', error);
                    }
                }
                
                return processorState;
            },
            
            // 手動觸發VN處理器
            triggerVNProcessor: () => {
                console.log('[VN面板/直播間] 手動觸發VN處理器...');
                
                if (window.TavernHelper?.triggerSlash) {
                    console.log('[VN面板/直播間] 使用TavernHelper.triggerSlash');
                    try {
                        window.TavernHelper.triggerSlash('/send 繼續劇情');
                        return { success: true, method: 'TavernHelper.triggerSlash' };
                    } catch (error) {
                        console.error('[VN面板/直播間] 觸發失敗:', error);
                        return { success: false, error: error.message };
                    }
                } else if (window.VNProcessorReceiveChoice) {
                    console.log('[VN面板/直播間] 使用VNProcessorReceiveChoice');
                    try {
                        window.VNProcessorReceiveChoice({
                            text: '继续剧情',
                            number: '继续'
                        });
                        return { success: true, method: 'VNProcessorReceiveChoice' };
                    } catch (error) {
                        console.error('[VN面板/直播間] 觸發失敗:', error);
                        return { success: false, error: error.message };
                    }
                } else {
                    console.log('[VN面板/直播間] 無法找到可用的VN處理器');
                    return { success: false, error: 'No VN processor available' };
                }
            }
        };
        
        console.log('[VN面板/直播間] 調試功能已啟用，使用以下命令:');
        console.log('- livestreamBackgroundDebug.listCache() - 查看所有緩存的背景');
        console.log('- livestreamBackgroundDebug.clearCache() - 清除所有背景緩存');
        console.log('- livestreamBackgroundDebug.regenerateBackground("背景名稱") - 強制重新生成背景');
        console.log('- livestreamBackgroundDebug.getCurrentBackground() - 查看當前背景狀態');
        console.log('- livestreamBackgroundDebug.checkDialogueState() - 檢查對話狀態');
        console.log('- livestreamBackgroundDebug.forceContinueDialogue() - 強制繼續對話');
        console.log('- livestreamBackgroundDebug.checkVNProcessorState() - 檢查VN處理器狀態');
        console.log('- livestreamBackgroundDebug.triggerVNProcessor() - 手動觸發VN處理器');
        
    } else {
        console.log('[VN面板/直播間] 背景生成器不可用，將使用默認背景');
    }
    
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
    currentLivestreamState.currentBackground = null; // 重置當前背景

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