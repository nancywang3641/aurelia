/**
 * VN Type Core Base - 手机版核心基础模块 v20.1
 * 
 * 包含: 全局变量、通信函数、DOM初始化、基础事件监听
 */

// =======================================================================
//                            全域變數定義
// =======================================================================

let vnData = { narrator: {}, userData: {}, charData: {}, dialogues: [], choices: [], sceneInfo: {}, rawCharadata: '' };
let dialogueHistory = [];
let currentDialogueIndex = 0;
let typewriterInterval = null;
let isTyping = false;
let isTransitioning = false;
let currentText = '';
let currentCharIndex = 0;
let typeSpeed = 30;
let canProceedToNext = false;
let currentCharacter = null;

// 简化的背景图片状态管理
let backgroundImageState = {
    currentLocation: '',
    appliedLocation: '',
    appliedImageUrl: '',
    pendingAIImage: null, // 等待應用的AI生成背景圖片
    isApplying: false,
    lastAppliedTime: null, // 記錄最後應用背景的時間戳
    debug: true
};

// 手机版背景图片URL配置
const MOBILE_BACKGROUND_CONFIG = {
    baseUrl: 'http://127.0.0.1:8000/location_img/',
    fallbackUrl: 'https://nancywang3641.github.io/sound-files/location_img/default.jpeg',
    imageFormat: '.jpeg'
};

/**
 * 获取手机版背景配置
 */
function getMobileBackgroundConfig() {
    return MOBILE_BACKGROUND_CONFIG;
}

// CSS常量
const CSS_HIDING = 'hiding';
const CSS_MODAL_ACTIVE = 'modal-active';
const CSS_ACTIVE = 'active';
const CSS_HIDDEN = 'hidden';

// =======================================================================
//                            DOM元素引用
// =======================================================================

let gameContainer, characterCenter, nameTag, dialogContent, dialogText,
    typewriterCursor, textIndicator, choicesContainer, mailModal, mailboxContainer,
    mailList, closeMailbox, mailboxButton,
    settingsButton, settingsModal, settingsContainer, closeSettings, typeSpeedSlider, typeSpeedValue,
    historyButton, historyModal, historyContainer, historyContentEl, closeHistory,
    userInputModal, userInputContainer, userInputTextarea, submitUserInput, cancelUserInput, closeUserInput,
    vnHistoryChoiceModal, vnHistoryChoiceContent, closeVnHistoryChoiceButton,
    inlineChatContainerEl, chatModalContainerEl, dialogBoxGlobalRef;

let getCharacterImageUrlFn, applyExpressionAnimationFn;

// =======================================================================
//                            核心通信函數
// =======================================================================

/**
 * 发送消息到处理器 (使用官方推荐的方式)
 */
function sendMessageToProcessor(messageData) {
    try {
        // 方法1：直接调用顶级窗口的VN处理器
        if (window.top && window.top.VNProcessor) {
            const event = {
                data: messageData,
                source: window
            };
            
            if (typeof window.top.VNProcessor.handleMessageFromPanel === 'function') {
                // console.log(`[VN面板-手机版] 通过直接调用发送消息: ${messageData.type}`);
                window.top.VNProcessor.handleMessageFromPanel(event);
                return true;
            }
        }

        // 方法2：使用postMessage作为备用
        console.warn(`[VN面板-手机版] 使用postMessage备用方法`);
        let foundAndSent = false;
        
        if (window.top && window.top !== window) {
            window.top.postMessage(messageData, '*');
            foundAndSent = true;
        } else if (window.parent && window.parent !== window) {
            window.parent.postMessage(messageData, '*');
            foundAndSent = true;
        }

        if (foundAndSent) {
            // console.log(`[VN面板-手机版] 已通过postMessage发送: ${messageData.type}`);
        } else {
            console.error(`[VN面板-手机版] 无法找到有效的目标窗口`);
        }
        
        return foundAndSent;

    } catch (error) {
        console.error(`[VN面板-手机版] 发送消息出错:`, error);
        return false;
    }
}

// =======================================================================
//                            DOM初始化
// =======================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 获取DOM元素引用
    gameContainer = document.querySelector('.game-container');
    characterCenter = document.querySelector('.character-center');
    nameTag = document.querySelector('.name-tag');
    choicesContainer = document.querySelector('.choices-container');
    mailModal = document.querySelector('#mailModal');
    mailboxContainer = document.querySelector('.mailbox-container');
    mailList = document.querySelector('.mail-list');
    closeMailbox = document.querySelector('.close-mailbox');
    mailboxButton = document.querySelector('.mailbox-button');
    settingsButton = document.querySelector('.settings-button');
    settingsModal = document.querySelector('#settingsModal');
    settingsContainer = document.querySelector('.settings-container');
    closeSettings = document.querySelector('.close-settings');
    typeSpeedSlider = document.querySelector('#typeSpeedSlider');
    typeSpeedValue = document.querySelector('#typeSpeedValue');
    historyButton = document.querySelector('.history-button');
    historyModal = document.querySelector('#historyModal');
    historyContainer = document.querySelector('.history-container');
    historyContentEl = document.querySelector('.history-content');
    closeHistory = document.querySelector('.close-history');
    userInputModal = document.querySelector('#userInputModal');
    userInputContainer = document.querySelector('.user-input-container');
    userInputTextarea = document.querySelector('#userInputTextarea');
    submitUserInput = document.querySelector('#submitUserInput');
    cancelUserInput = document.querySelector('#cancelUserInput');
    closeUserInput = document.querySelector('.close-user-input');
    vnHistoryChoiceModal = document.querySelector('#vnHistoryChoiceModal');
    vnHistoryChoiceContent = vnHistoryChoiceModal?.querySelector('.vn-history-choice-content');
    closeVnHistoryChoiceButton = vnHistoryChoiceModal?.querySelector('.close-vn-history-choice');
    inlineChatContainerEl = document.getElementById('inline-chat-container');
    chatModalContainerEl = document.getElementById('chatModal');
    dialogBoxGlobalRef = document.querySelector('.dialog-box');

    if (dialogBoxGlobalRef) {
        dialogContent = dialogBoxGlobalRef.querySelector('.dialog-content');
        dialogText = dialogBoxGlobalRef.querySelector('.dialog-text');
        typewriterCursor = dialogBoxGlobalRef.querySelector('.typewriter-cursor');
        textIndicator = dialogBoxGlobalRef.querySelector('.text-indicator');
    }

    initVNPanel();
});

function initVNPanel() {
    console.log('[VN面板-手机版] 初始化 VN Core v20.1 (手机版简化)...');
    
    // 初始化場景隊列
    initSceneQueue();
    initItemQueue();
    
    initResourceFunctions();
    setupModalEventListeners();
    setupEventListeners();
    setupUserInputListeners();
    
    if (characterCenter) characterCenter.innerHTML = '';
    if (choicesContainer) choicesContainer.classList.add(CSS_HIDDEN);
    
    // 通知处理器面板已准备就绪
    sendMessageToProcessor({ type: 'VN_PANEL_READY' });
    
    console.log('[VN面板-手机版] 手机版VN面板初始化完成');
}

function initResourceFunctions() {
    if (window.parent?.VNResources) {
        ({ getCharacterImageUrl: getCharacterImageUrlFn, applyExpressionAnimation: applyExpressionAnimationFn } = window.parent.VNResources);
    } else {
        console.warn("[VN面板-手机版] VNResources not found, using local fallbacks");
        defineLocalResourceFunctions();
    }
}

function defineLocalResourceFunctions() {
    getCharacterImageUrlFn = async (character, expression) => {
        // 使用素材資源管理器
        if (window.MaterialResourceManager) {
            return await window.MaterialResourceManager.getCharacterImageUrl(character, expression);
        }
        
        // 回退到原始邏輯
        const characterName = (character || 'default').trim();
        const expressionName = (expression || '').trim();
        const baseUrl = 'https://nancywang3641.github.io/sound-files/char_img/';

        if (expressionName && expressionName !== characterName) {
            return `${baseUrl}${characterName}_${expressionName}.png`;
        } else if (expressionName) {
            return `${baseUrl}${expressionName}.png`;
        } else {
            return `${baseUrl}${characterName}.png`;
        }
    };

    const localExpressionAnimations = { 
        'surprise': 'shake-animation', 
        'panic': 'shake-animation', 
        'trembling': 'shake-animation', 
        'fear': 'shake-animation', 
        'stunned': 'shake-animation' 
    };
    
    applyExpressionAnimationFn = (imgElement, expression) => {
        if (!imgElement || !expression) return;
        Object.values(localExpressionAnimations).forEach(c => imgElement.classList.remove(c));
        
        const animClass = localExpressionAnimations[Object.keys(localExpressionAnimations).find(term => 
            expression.toLowerCase().includes(term))];
        
        if (animClass) {
            setTimeout(() => {
                imgElement.classList.add(animClass);
                imgElement.addEventListener('animationend', function handleAnimEnd() { 
                    imgElement.classList.remove(animClass); 
                    imgElement.removeEventListener('animationend', handleAnimEnd); 
                }, { once: true });
            }, 50);
        }
    };
}

// =======================================================================
//                            基础事件監聽器
// =======================================================================

function setupEventListeners() {
    // 使用window.addEventListener监听消息
    window.addEventListener('message', handleMessageEvent);
    
    if (dialogBoxGlobalRef) { 
        dialogBoxGlobalRef = setupDialogBoxClickListener(dialogBoxGlobalRef); 
    }
    
    // 键盘事件监听（手机版简化）
    document.addEventListener('keydown', (event) => {
        const activeModal = document.querySelector(`.modal.${CSS_MODAL_ACTIVE}, .simple-chat-modal.${CSS_ACTIVE}, .vn-modal.${CSS_ACTIVE}`);
        if (activeModal && event.key !== 'Escape') return;
        
        // Transition进行中时忽略按键
        if (window.VNFeatures?.transitionState?.isActive) {
            console.log('[VN面板-手机版] Transition进行中，忽略按键操作');
            return;
        }
        
        switch (event.key.toLowerCase()) {
            case 'c': 
                if (vnData.choices?.length > 0 && choicesContainer) { 
                    choicesContainer.classList.remove(CSS_HIDDEN); 
                    updateChoices(); 
                } 
                break;
                
            case 'd': 
                console.log('[VN面板-手机版 DEBUG]', { 
                    currentDialogueIndex, 
                    totalDialogues: vnData.dialogues?.length || 0, 
                    choices: vnData.choices, 
                    choicesHidden: choicesContainer?.classList.contains(CSS_HIDDEN), 
                    currentDialogue: vnData.dialogues?.[currentDialogueIndex] ? 
                        JSON.parse(JSON.stringify(vnData.dialogues[currentDialogueIndex])) : "N/A", 
                    characterOnScreen: currentCharacter?.name || 'empty', 
                    backgroundState: backgroundImageState 
                }); 
                break;
                
            case 'r': 
                // R键重置角色关系面板状态
                const charPanel = document.querySelector('.char-data-panel');
                if (charPanel) {
                    charPanel.classList.add('collapsed');
                    const collapseToggle = charPanel.querySelector('.collapse-toggle');
                    if (collapseToggle) collapseToggle.classList.add('collapsed');
                    console.log('[VN面板-手机版] 已重置角色关系面板为折叠状态');
                }
                break;
                
            case 'l': 
                console.log('[VN面板-手机版 DEBUG] 手动测试Loading动画'); 
                if (window.VNFeatures?.toggleLoadingAnimation) window.VNFeatures.toggleLoadingAnimation(); 
                break;
                
            case 'b': 
                if (window.VNFeatures?.showBgmStatus) window.VNFeatures.showBgmStatus(); 
                break;
                
            case 'g': 
                console.log('[VN面板-手机版 DEBUG] 测试背景图片功能'); 
                const testLocation = vnData.sceneInfo?.location || '測試場景'; 
                // console.log(`测试场景: ${testLocation}`); 
                console.log('当前背景状态:', backgroundImageState); 
                updateBackground(); 
                break;
                
            case '/': 
                if (window.VNFeatures?.showCommandInputDialog) { 
                    if (!$(event.target).is('input, textarea')) { 
                        event.preventDefault(); 
                        window.VNFeatures.showCommandInputDialog(); 
                    } 
                } 
                break;
                
            case 'escape': 
                if (window.VNFeatures?.handleEscapeKey) window.VNFeatures.handleEscapeKey(); 
                break;
                
            case ' ': 
                event.preventDefault(); 
                if (!dialogBoxGlobalRef || dialogBoxGlobalRef.closest('.modal, .vn-modal, .simple-chat-modal')) return; 
                if (isTyping) { 
                    showFullText(); 
                } else if (canProceedToNext && dialogBoxGlobalRef && !dialogBoxGlobalRef.classList.contains(CSS_HIDING)) { 
                    if (window.VNFeatures?.stopAllSounds) window.VNFeatures.stopAllSounds(); 
                    dialogBoxGlobalRef.classList.add(CSS_HIDING); 
                    if (nameTag) nameTag.classList.add(CSS_HIDING); 
                    dialogBoxGlobalRef.addEventListener('animationend', function handleSpaceAnimEnd() { 
                        dialogBoxGlobalRef.removeEventListener('animationend', handleSpaceAnimEnd); 
                        nextDialogue(); 
                    }, { once: true }); 
                } else if (!isTyping) { 
                    showFullText(); 
                } 
                break;
        }
    });
}

function setupDialogBoxClickListener(targetDialogBox) {
    if (!targetDialogBox) { 
        console.warn('[VN面板-手机版] 无法设置对话框监听器: 元素未找到'); 
        return null; 
    }
    
    const newDialogBox = targetDialogBox.cloneNode(true);
    if (targetDialogBox.parentNode) { 
        targetDialogBox.parentNode.replaceChild(newDialogBox, targetDialogBox); 
    } else { 
        console.warn('[VN面板-手机版] 目标对话框没有父节点'); 
        return targetDialogBox; 
    }
    
    dialogBoxGlobalRef = newDialogBox;
    
    newDialogBox.addEventListener('click', () => {
        // 检查状态锁和对话数据
        if (isTransitioning || !vnData.dialogues || vnData.dialogues.length === 0) {
            return;
        }

        if (window.VNFeatures?.playSound) window.VNFeatures.playSound('clickSound');

        if (isTyping) { 
            showFullText(); 
        } else if (canProceedToNext) { 
            if (window.VNFeatures?.stopAllSounds) window.VNFeatures.stopAllSounds(); 

            // 启动状态锁
            isTransitioning = true; 
            
            newDialogBox.classList.add(CSS_HIDING); 
            if (nameTag) nameTag.classList.add(CSS_HIDING); 

            newDialogBox.addEventListener('animationend', function handleAnimEnd() { 
                newDialogBox.removeEventListener('animationend', handleAnimEnd); 
                nextDialogue(); 
                // 解开状态锁
                setTimeout(() => {
                    isTransitioning = false;
                }, 50);
            }, { once: true }); 
        } else { 
            showFullText(); 
        }
    });
    
    // 重新获取子元素引用
    dialogContent = newDialogBox.querySelector('.dialog-content');
    if (dialogContent) {
        dialogText = dialogContent.querySelector('.dialog-text');
        typewriterCursor = dialogContent.querySelector('.typewriter-cursor');
        textIndicator = dialogContent.querySelector('.text-indicator');
        if (!dialogText) console.error("[VN面板-手机版] .dialog-text 未找到");
    } else { 
        console.error("[VN面板-手机版] .dialog-content 未找到"); 
        dialogText = null; 
        typewriterCursor = null; 
        textIndicator = null; 
    }
    
    return newDialogBox;
}

// =======================================================================
//                            消息處理函數
// =======================================================================

function handleMessageEvent(event) {
    if (!event.data || !event.data.type) return;
    
    if (event.data.type === 'VN_RAW_DATA') {
        // 处理来自简化版处理器的原始数据
        console.log('[VN面板-手机版] 收到VN_RAW_DATA:', event.data);
        
        try {
            const rawData = event.data.data;
            const dataType = event.data.dataType || 'NORMAL';
            
            // 使用vn-parser.js解析原始数据
            if (window.vnParser && typeof window.vnParser.parseMessage === 'function') {
                const parsedData = window.vnParser.parseMessage(rawData);
                console.log('[VN面板-手机版] 解析完成:', parsedData);
                
                // 检查是否有可用的VN数据
                if (parsedData.metadata.hasDialogues || 
                    parsedData.metadata.hasChoices || 
                    parsedData.metadata.hasSceneInfo || 
                    parsedData.metadata.hasCharData) {
                    
                    console.log('[VN面板-手机版] 检测到VN内容，开始处理显示');
                    
                    // 如果是历史数据，需要特殊处理
                    if (dataType === 'HISTORY') {
                        console.log('[VN面板-手机版] 这是历史剧情数据，启动历史剧情模式');
                        isHistoryMode = true;
                        currentHistoryId = rawData.messageId;
                    }
                    
                    // 将解析后的数据转换为VN_DATA格式
                    const vnDataMessage = {
                        type: 'VN_DATA',
                        messageId: rawData.messageId,
                        data: {
                            narrator: parsedData.narrator || {},
                            dialogues: parsedData.dialogues || [],
                            choices: parsedData.choices || [],
                            sceneInfo: parsedData.sceneInfo || {},
                            userData: parsedData.userData || {},
                            charData: parsedData.charData || {},
                            rawCharadata: parsedData.rawCharadata || []
                        }
                    };
                    
                    // 递归调用自己处理转换后的数据
                    handleMessageEvent({ data: vnDataMessage });
                    
                } else {
                    console.log('[VN面板-手机版] 未检测到有效的VN内容');
                }
            } else {
                console.error('[VN面板-手机版] vn-parser.js未正确加载');
            }
        } catch (error) {
            console.error('[VN面板-手机版] 处理VN_RAW_DATA时出错:', error);
        }
    }
    else if (event.data.type === 'VN_DATA') {
        // console.log(`[VN面板-手机版] 收到VN_DATA (消息ID: ${event.data.messageId})`);
        const receivedGameData = event.data.data || {};
        
        if (window.VNFeatures?.hideLoadingAnimation) window.VNFeatures.hideLoadingAnimation();
        
        // 处理数据合并
        let newUserData = vnData.userData; 
        let newCharData = vnData.charData; 
        let newRawCharadata = vnData.rawCharadata;
        
        if (receivedGameData.userData) { 
            newUserData = { ...(vnData.userData || {}), ...receivedGameData.userData }; 
        }
        
        if (receivedGameData.rawCharadata !== undefined) { 
            newRawCharadata = receivedGameData.rawCharadata; 
        }
        
        if (receivedGameData.charData && receivedGameData.charData.rawCharacters) { 
            if (!newCharData) newCharData = {}; 
            newCharData.rawCharacters = receivedGameData.charData.rawCharacters; 
            if (newUserData) { 
                newUserData.favorabilityList = newCharData.rawCharacters.map(entry => ({ 
                    character: entry.to, 
                    value: entry.states 
                })); 
            } 
        }
        
        // 更新vnData
        vnData = { 
            narrator: receivedGameData.narrator || {}, 
            dialogues: receivedGameData.dialogues || [], 
            choices: receivedGameData.choices || [], 
            sceneInfo: receivedGameData.sceneInfo || {}, 
            messageId: event.data.messageId, 
            userData: newUserData, 
            charData: newCharData, 
            rawCharadata: newRawCharadata
        };
        
        // 重置状态
        currentDialogueIndex = 0;
        currentCharacter = null;
        if (characterCenter) characterCenter.innerHTML = '';
        dialogueHistory = [];
        
        // 关闭模态窗口
        if (document.getElementById('simple-chat-modal')?.classList.contains(CSS_ACTIVE)) { 
            document.getElementById('simple-chat-modal').classList.remove(CSS_ACTIVE); 
        }
        if (inlineChatContainerEl?.classList.contains(CSS_ACTIVE)) { 
            inlineChatContainerEl.classList.remove(CSS_ACTIVE); 
            const inlineChatIframe = document.getElementById('inline-chat-iframe'); 
            if (inlineChatIframe) inlineChatIframe.src = 'about:blank'; 
        }
        
        // 重新设置对话框监听器
        if (dialogBoxGlobalRef && typeof setupDialogBoxClickListener === 'function') { 
            dialogBoxGlobalRef = setupDialogBoxClickListener(dialogBoxGlobalRef); 
        } else if (!dialogBoxGlobalRef) { 
            console.error("[VN面板-手机版] dialogBoxGlobalRef为null"); 
        }
        
        // 立即通知父窗口展開iframe尺寸
        if (typeof notifyParentIframeResize === 'function') {
            notifyParentIframeResize('story');
        }
        
        // 切換到主界面顯示劇情
        if (typeof showVNMainContainer === 'function') {
            showVNMainContainer();
        }
        
        updateUI();
        updateCharacterStats();
        
        if (event.data.hasChatSection && typeof showChatNotification === 'function') { 
            showChatNotification(); 
        }
    } 
    else if (event.data.type === 'VN_STATUS_UPDATE') {
        console.log('[VN面板-手机版] 收到VN_STATUS_UPDATE:', event.data.data);
        const statusData = event.data.data || {};
        
        if (statusData.userData) {
            vnData.userData = { ...(vnData.userData || {}), ...statusData.userData };
        }
        
        if (statusData.charData) {
            vnData.charData = { ...(vnData.charData || {}), ...statusData.charData };
            if (statusData.charData.rawCharacters) {
                if (!vnData.userData) vnData.userData = {};
                vnData.userData.favorabilityList = statusData.charData.rawCharacters.map(entry => ({ 
                    character: entry.to, 
                    value: entry.states 
                }));
            }
        }
        
        updateCharacterStats();
    }
    else if (event.data.type === 'VN_HISTORY_LIST') {
        console.log('[VN面板-手机版] 收到VN_HISTORY_LIST，条目数:', event.data.data?.length || 0);
        
        // 🆕 完成歷史請求
        window.VNHistoryWindowManager?.completeHistoryRequest();
        
        // 隐藏加载动画
        if (window.VNFeatures?.hideLoadingAnimation) {
            window.VNFeatures.hideLoadingAnimation();
        }
        
        // 🆕 使用歷史窗口狀態管理器決定顯示哪個窗口
        const currentWindowId = window.VNHistoryWindowManager?.currentActiveWindow;
        
        if (currentWindowId === window.VNHistoryWindowManager?.WINDOW_IDS.MAIN) {
            // 主容器的歷史窗口
            console.log('[VN面板-手机版] 顯示主容器的歷史窗口');
            if (typeof displayVNHistoryChoicesInMain === 'function') {
                displayVNHistoryChoicesInMain(event.data.data);
            } else {
                console.warn('[VN面板-手机版] displayVNHistoryChoicesInMain函數未找到');
                displayVNHistoryChoices(event.data.data);
            }
        } else if (currentWindowId === window.VNHistoryWindowManager?.WINDOW_IDS.LANDING) {
            // 啟動頁面的歷史窗口
            console.log('[VN面板-手机版] 顯示啟動頁面的歷史窗口');
            displayVNHistoryChoices(event.data.data);
        } else {
            // 備用邏輯：檢查當前是否在劇情中
            const vnMainContainer = document.querySelector('#vnMainContainer');
            const isInStory = vnMainContainer && vnMainContainer.classList.contains('active');
            
            if (isInStory) {
                console.log('[VN面板-手机版] 備用邏輯：在劇情中，使用VN主容器的歷史窗口');
                if (typeof displayVNHistoryChoicesInMain === 'function') {
                    displayVNHistoryChoicesInMain(event.data.data);
                } else {
                    console.warn('[VN面板-手机版] displayVNHistoryChoicesInMain函數未找到');
                    displayVNHistoryChoices(event.data.data);
                }
            } else {
                console.log('[VN面板-手机版] 備用邏輯：在啟動頁面，使用啟動頁面的歷史窗口');
                displayVNHistoryChoices(event.data.data);
            }
        }
    }
    else if (event.data.type === 'VN_PROCESSOR_TEST') {
        console.log('[VN面板-手机版] 收到处理器测试消息:', event.data.data.message);
        // 回应测试消息
        sendMessageToProcessor({
            type: 'VN_PANEL_TEST_RESPONSE',
            data: {
                message: '来自VN面板的回应(手机版)',
                originalTimestamp: event.data.data.timestamp,
                responseTimestamp: Date.now()
            }
        });
    } 
    else if (event.data.type === 'VN_STORY_INIT') {
        console.log('[VN面板-手机版] 处理故事初始化数据:', event.data);
        if (event.data.storyData) {
            console.log('[VN面板-手机版] 故事数据:', event.data.storyData);
        }
        if (event.data.mapContext) {
            console.log('[VN面板-手机版] 地图上下文:', event.data.mapContext);
        }
        
        // 🔥 新增：VN劇情初始化時通知父窗口停止音樂
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'VN_STOP_MAIN_MUSIC',
                    source: 'VN_PANEL_STORY_INIT',
                    timestamp: Date.now()
                }, '*');
                console.log('[VN面板-手机版] VN劇情初始化時已通知父窗口停止音樂');
            }
        } catch (error) {
            console.error('[VN面板-手机版] VN劇情初始化時通知父窗口停止音樂失敗:', error);
        }
    }
    else if (event.data.type === 'VN_FORCE_RESTORE_DIALOG') {
        console.log('[VN面板-手机版] 🔧 收到強制恢復對話框請求:', event.data.data);
        
        try {
            // 1. 確保對話框可見（僅在需要時）
            const dialogBox = document.querySelector('.dialog-box');
            if (dialogBox) {
                const isHidden = dialogBox.style.display === 'none' || 
                                dialogBox.style.visibility === 'hidden' ||
                                dialogBox.classList.contains('hiding');
                
                if (isHidden) {
                    dialogBox.style.display = 'flex';
                    dialogBox.style.visibility = 'visible';
                    dialogBox.style.opacity = '1';
                    dialogBox.classList.remove('hiding');
                    console.log('[VN面板-手机版] ✅ 已恢復對話框顯示');
                } else {
                    console.log('[VN面板-手机版] 對話框已經可見，無需恢復');
                }
            }
            
            // 2. 確保名稱標籤可見（僅在需要時）
            const nameTag = document.querySelector('.name-tag');
            if (nameTag) {
                const isNameTagHidden = nameTag.style.display === 'none' || 
                                      nameTag.style.visibility === 'hidden' ||
                                      nameTag.classList.contains('hiding');
                
                if (isNameTagHidden) {
                    nameTag.style.display = 'inline-block';
                    nameTag.style.visibility = 'visible';
                    nameTag.style.opacity = '1';
                    nameTag.classList.remove('hiding');
                    console.log('[VN面板-手机版] ✅ 已恢復名稱標籤顯示');
                } else {
                    console.log('[VN面板-手机版] 名稱標籤已經可見，無需恢復');
                }
            }
            
            // 3. 重新設置對話框監聽器（僅在需要時）
            if (dialogBoxGlobalRef && typeof setupDialogBoxClickListener === 'function') {
                dialogBoxGlobalRef = setupDialogBoxClickListener(dialogBoxGlobalRef);
                console.log('[VN面板-手机版] ✅ 已重新設置對話框監聽器');
            }
            
            // 4. 更新UI狀態（僅在需要時）
            if (typeof updateUI === 'function') {
                updateUI();
                console.log('[VN面板-手机版] ✅ 已更新UI狀態');
            }
            
            console.log('[VN面板-手机版] 🎉 對話框強制恢復完成');
            
        } catch (error) {
            console.error('[VN面板-手机版] 強制恢復對話框時出錯:', error);
        }
    }
    else if (event.data.type === 'VN_GENERATE_BACKGROUND') {
        console.log('[VN面板-手机版] 收到AI背景生成請求:', event.data.data);
        const { prompt, facilityName, sceneIndex, totalScenes } = event.data.data;
        
        // 使用背景生成器智能獲取背景圖片
        if (window.vnBackgroundGenerator) {
            window.vnBackgroundGenerator.generateBackgroundImage(prompt, facilityName)
                .then(result => {
                    if (result && result.url) {
                        // console.log(`[VN面板-手机版] 背景圖片獲取成功 (${result.source}): ${facilityName} (${sceneIndex}/${totalScenes})`);
                        
                        // 緩存背景圖片，不立即應用
                        cacheBackgroundImage(facilityName, result.url);
                        
                        // 如果是第一個場景，立即應用
                        if (sceneIndex === 1) {
                            console.log('[VN面板-手机版] 第一個場景，立即應用背景');
                            applyBackgroundImage(result.url).then(() => {
                                console.log('[VN面板-手机版] 第一個場景背景應用成功');
                            }).catch(error => {
                                // console.error('[VN面板-手机版] 第一個場景背景應用失敗:', error);
                            });
                        } else {
                            // console.log(`[VN面板-手机版] 場景 ${sceneIndex} 背景已緩存，等待劇情進行時應用`);
                        }
                    } else {
                        console.warn('[VN面板-手机版] 背景圖片獲取失敗');
                    }
                })
                .catch(error => {
                    // console.error('[VN面板-手机版] 背景獲取錯誤:', error);
                });
        } else {
            console.warn('[VN面板-手机版] 背景生成器不可用');
        }
    }
    else if (event.data.type === 'VN_BACKGROUND_IMAGE_READY') {
        console.log('[VN面板-手机版] 收到背景圖片就緒消息:', event.data.data);
        const { locationName, imageUrl } = event.data.data;
        
        // 設置AI生成的背景圖片為待處理狀態
        if (imageUrl) {
            backgroundImageState.pendingAIImage = imageUrl;
            console.log('[VN面板-手机版] 設置AI生成背景圖片為待處理:', imageUrl);
            
            // 如果當前正在更新背景，立即應用AI圖片
            if (backgroundImageState.isApplying) {
                console.log('[VN面板-手机版] 立即應用AI生成的背景圖片');
                backgroundImageState.pendingAIImage = null;
                applyBackgroundImage(imageUrl).catch(error => {
                    // console.error('[VN面板-手机版] 應用AI背景圖片失敗:', error);
                });
            }
        }
    }
    else if (event.data.type === 'VN_SCENE_QUEUE_READY') {
        console.log('[VN面板-手机版] 收到場景隊列就緒消息:', event.data.data);
        const { sceneQueue: scenes } = event.data.data;
        
        if (scenes && scenes.length > 0) {
            setSceneQueue(scenes);
            // console.log(`[VN面板-手机版] 場景隊列已設置，共 ${scenes.length} 個場景`);
        }
    }
    else if (event.data.type === 'VN_ITEM_QUEUE_READY') {
        console.log('[VN面板-手机版] 收到物品隊列就緒消息:', event.data.data);
        const { itemQueue: items } = event.data.data;
        
        if (items && items.length > 0) {
            setItemQueue(items);
            // console.log(`[VN面板-手机版] 物品隊列已設置，共 ${items.length} 個物品`);
        }
    }
    else if (event.data.type === 'VN_GENERATE_ITEM') {
        console.log('[VN面板-手机版] 收到物品生成請求:', event.data.data);
        const { itemType, itemName, itemDescription, itemPrompt, itemIndex, totalItems } = event.data.data;
        
        // 生成物品AI圖片
        generateItemImage(itemType, itemName, itemDescription, itemPrompt, itemIndex, totalItems);
    }
    else if (event.data.type === 'VN_GENERATE_ITEM_CACHE') {
        console.log('[VN面板-手机版] 收到物品圖片緩存消息:', event.data.data);
        const { itemName, itemUrls } = event.data.data;
        
        if (itemName && itemUrls) {
            cacheItemImage(itemName, { itemUrls });
            // console.log(`[VN面板-手机版] 物品圖片已緩存: ${itemName}`);
        }
    }
    // ===== 故事结束处理 =====
    else if (event.data.type === 'STORY_END_DETECTED') {
        console.log('[VN面板-手机版] 收到故事结束消息:', event.data.data);
        handleStoryEnd(event.data.data);
    }
    else if (event.data.type === 'STORY_START_DETECTED') {
        console.log('[VN面板-手机版] 收到故事开始消息:', event.data.data);
        handleStoryStart(event.data.data);
    }
}

// =======================================================================
//                            全域API導出
// =======================================================================

// VN CORE 全局对象 (手机版)
window.VNCore = {
    // 状态访问
    get vnDataState() { return JSON.parse(JSON.stringify(vnData)); }, 
    get currentDialogueIdx() { return currentDialogueIndex; }, 
    get vnData() { return vnData; }, 
    get isTyping() { return isTyping; }, 
    get canProceedToNext() { return canProceedToNext; }, 
    get dialogueHistory() { return [...dialogueHistory]; }, 
    get backgroundImageState() { return JSON.parse(JSON.stringify(backgroundImageState)); }, 
    get characterOnScreen() { return currentCharacter ? { ...currentCharacter } : null; }, 
    
    // 通信相关
    sendMessageToProcessor,
    
    // 場景隊列管理
    initSceneQueue,
    setSceneQueue,
    cacheBackgroundImage,
    checkAndApplyCurrentSceneBackground,
    advanceToNextScene,
    switchToSceneByFacilityName,
    
    // 物品隊列管理
    initItemQueue,
    setItemQueue,
    cacheItemImage,
    getItemCache,
    generateItemImage,
    
    // 場景隊列狀態
    get sceneQueue() { return { ...sceneQueue }; },
    get backgroundCache() { return new Map(backgroundCache); },
    get itemCache() { return new Map(itemCache); },
    
    // 測試場景隊列功能
    testSceneQueue: function() {
        console.log('[VN面板-手机版] 測試場景隊列功能');
        
        // 模擬場景隊列
        const testScenes = [
            { facilityName: '測試場景1', date: '2025-01-01', time: '10:00' },
            { facilityName: '測試場景2', date: '2025-01-01', time: '11:00' },
            { facilityName: '測試場景3', date: '2025-01-01', time: '12:00' }
        ];
        
        setSceneQueue(testScenes);
        
        // 模擬背景圖片緩存
        cacheBackgroundImage('測試場景1', 'https://example.com/bg1.jpg');
        cacheBackgroundImage('測試場景2', 'https://example.com/bg2.jpg');
        cacheBackgroundImage('測試場景3', 'https://example.com/bg3.jpg');
        
        console.log('[VN面板-手机版] 場景隊列測試完成');
        console.log('當前場景隊列:', sceneQueue);
        console.log('背景緩存:', Array.from(backgroundCache.entries()));
    },
    
    // 測試物品隊列功能
    testItemQueue: function() {
        console.log('[VN面板-手机版] 測試物品隊列功能');
        
        // 模擬物品緩存
        cacheItemImage('測試物品1', { 
            itemUrls: { 
                aiImageUrl: 'https://example.com/item1.jpg',
                fallbackUrl: 'https://example.com/fallback1.jpg'
            } 
        });
        cacheItemImage('測試物品2', { 
            itemUrls: { 
                aiImageUrl: 'https://example.com/item2.jpg',
                fallbackUrl: 'https://example.com/fallback2.jpg'
            } 
        });
        
        console.log('[VN面板-手机版] 物品隊列測試完成');
        console.log('物品緩存:', Array.from(itemCache.entries()));
    },
    
    // 調試場景隊列狀態
    debugSceneQueue: function() {
        console.log('=== 場景隊列調試信息 ===');
        console.log('場景隊列狀態:', sceneQueue);
        console.log('背景緩存:', Array.from(backgroundCache.entries()));
        console.log('當前場景索引:', sceneQueue.currentSceneIndex);
        console.log('場景隊列就緒:', sceneQueue.isReady);
        
        if (sceneQueue.scenes.length > 0) {
            console.log('場景列表:');
            sceneQueue.scenes.forEach((scene, index) => {
                // console.log(`  ${index + 1}. ${scene.facilityName} (已應用: ${scene.isApplied})`);
            });
        }
        
        console.log('========================');
    },
    
    // 【新增】手动请求历史的方法
    requestVNHistory: function() {
        console.log('[VN面板-手机版] 手动请求VN历史列表');
        
        // 显示加载动画
        if (window.VNFeatures?.showLoadingAnimation) {
            window.VNFeatures.showLoadingAnimation();
        }
        
        // 发送请求
        const success = sendMessageToProcessor({
            type: 'VN_FETCH_HISTORY_LIST',
            source: 'VN_PANEL_MANUAL_REQUEST',
            timestamp: Date.now()
        });
        
        if (!success) {
            // console.error('[VN面板-手机版] 发送历史请求失败');
            if (window.VNFeatures?.hideLoadingAnimation) {
                window.VNFeatures.hideLoadingAnimation();
            }
            alert('无法获取历史记录，请检查连接');
        }
        
        // 设置超时处理
        setTimeout(() => {
            if (window.VNFeatures?.hideLoadingAnimation) {
                window.VNFeatures.hideLoadingAnimation();
            }
        }, 8000);
    },
    
    // 【新增】处理历史列表的方法（供外部调用）
    handleHistoryList: function(historyData) {
        if (window.VNFeatures?.hideLoadingAnimation) {
            window.VNFeatures.hideLoadingAnimation();
        }
        displayVNHistoryChoices(historyData);
    },
    
    // 兼容性方法
    handleVNData: function(eventData) {
        handleMessageEvent({ data: eventData });
    },
    
    handleHistoryList: function(historyData) {
        displayVNHistoryChoices(historyData);
    },
    
    handleStoryInit: function(storyData) {
        console.log('[VN面板-手机版] 手动处理故事初始化:', storyData);
    },
    
    // 测试通信功能
    testCommunication: function() {
        console.log('[VN面板-手机版] 开始测试通信...');
        sendMessageToProcessor({
            type: 'VN_PANEL_STARTUP_TEST',
            data: {
                message: '来自VN面板的测试消息(手机版)',
                timestamp: Date.now()
            }
        });
    },
    
    // 版本信息
    version: '20.1-mobile',
    isMobile: true
};

// VN CORE API (兼容性接口)
window.VNCoreAPI = {
    get vnData() { return vnData; }, 
    set vnData(value) { vnData = value; }, 
    get currentDialogueIndex() { return currentDialogueIndex; }, 
    set currentDialogueIndex(value) { currentDialogueIndex = value; }, 
    get dialogueHistory() { return dialogueHistory; }, 
    set dialogueHistory(value) { dialogueHistory = value; }, 
    get currentCharacter() { return currentCharacter; }, 
    set currentCharacter(value) { currentCharacter = value; }, 
    get characterCenter() { return characterCenter; }, 
    get dialogBoxGlobalRef() { return dialogBoxGlobalRef; }, 
    get nameTag() { return nameTag; }, 
    get choicesContainer() { return choicesContainer; }, 
    get backgroundImageState() { return backgroundImageState; },
    
    // 場景隊列管理函數
    initSceneQueue,
    setSceneQueue,
    cacheBackgroundImage,
    checkAndApplyCurrentSceneBackground,
    advanceToNextScene,
    switchToSceneByFacilityName,
    
    // 物品隊列管理函數
    initItemQueue,
    setItemQueue,
    cacheItemImage,
    getItemCache,
    generateItemImage,
    
    // 背景管理功能
    checkAndSwitchSceneBackground: window.VNCore?.checkAndSwitchSceneBackground,
    generateAndApplySceneBackground: window.VNCore?.generateAndApplySceneBackground,
    
    // 版本信息
    version: '20.1-mobile',
    isMobile: true
};

// =======================================================================
//                            場景隊列管理
// =======================================================================

// 場景隊列狀態
let sceneQueue = {
    scenes: [],           // 場景列表
    currentSceneIndex: 0, // 當前場景索引
    isReady: false        // 是否已準備就緒
};

// 物品隊列狀態
let itemQueue = {
    items: [],            // 物品列表
    currentItemIndex: 0,  // 當前物品索引
    isReady: false        // 是否已準備就緒
};

// 背景圖片緩存
let backgroundCache = new Map(); // facilityName -> imageUrl

// 物品圖片緩存
let itemCache = new Map(); // itemName -> itemData

/**
 * 初始化場景隊列
 */
function initSceneQueue() {
    sceneQueue = {
        scenes: [],
        currentSceneIndex: 0,
        isReady: false
    };
    backgroundCache.clear();
    console.log('[VN面板-手机版] 場景隊列已初始化');
}

/**
 * 初始化物品隊列
 */
function initItemQueue() {
    itemQueue = {
        items: [],
        currentItemIndex: 0,
        isReady: false
    };
    itemCache.clear();
    console.log('[VN面板-手机版] 物品隊列已初始化');
}

/**
 * 設置場景隊列
 */
function setSceneQueue(scenes) {
    sceneQueue.scenes = scenes.map((scene, index) => ({
        ...scene,
        sceneIndex: index + 1,
        isApplied: false
    }));
    sceneQueue.currentSceneIndex = 0;
    sceneQueue.isReady = true;
    // console.log(`[VN面板-手机版] 場景隊列已設置，共 ${scenes.length} 個場景`);
}

/**
 * 設置物品隊列
 */
function setItemQueue(items) {
    itemQueue.items = items.map((item, index) => ({
        ...item,
        itemIndex: index + 1,
        isApplied: false
    }));
    itemQueue.currentItemIndex = 0;
    itemQueue.isReady = true;
    // console.log(`[VN面板-手机版] 物品隊列已設置，共 ${items.length} 個物品`);
}

/**
 * 緩存物品圖片
 */
function cacheItemImage(itemName, itemData) {
    itemCache.set(itemName, itemData);
    // console.log(`[VN面板-手机版] 物品圖片已緩存: ${itemName}`);
}

/**
 * 獲取物品緩存
 */
function getItemCache(itemName) {
    return itemCache.get(itemName);
}


/**
 * 基於字符串生成固定seed
 */
function generateSeedFromString(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * 生成物品AI圖片 - 参考背景生成器逻辑，立即返回URL
 */
function generateItemImage(itemType, itemName, itemDescription, itemPrompt, itemIndex, totalItems) {
    try {
        // console.log(`[VN面板-手机版] 開始生成物品圖片 ${itemIndex}/${totalItems}: ${itemName}`);
        
        // 使用自定义提示词或生成默认提示词
        let finalPrompt;
        if (itemPrompt && itemPrompt.trim()) {
            // 使用自定义英文提示词
            finalPrompt = itemPrompt.trim();
            // console.log(`[VN面板-手机版] 使用自定义提示词: ${finalPrompt}`);
        } else {
            // 生成默认提示词
            const basePrompt = "2D, item, anime style, no human, no character, centered object";
            const defaultItemPrompt = `${itemName}: ${itemDescription}`;
            finalPrompt = `${basePrompt} ${defaultItemPrompt}`;
            // console.log(`[VN面板-手机版] 使用默认提示词: ${finalPrompt}`);
        }
        
        // 优化提示词 - 参考背景生成器的清理逻辑
        const cleanPrompt = finalPrompt
            .replace(/[^\w\s,.-]/g, '') // 移除特殊字符，保留字母、数字、空格、逗号、点、连字符
            .replace(/\s+/g, ' ') // 多个空格替换为单个空格
            .trim();
        
        // console.log(`[VN面板-手机版] 原始提示詞: ${finalPrompt}`);
        // console.log(`[VN面板-手机版] 清理後提示詞: ${cleanPrompt}`);
        
        // 限制长度
        const optimizedPrompt = cleanPrompt.length > 500 ? cleanPrompt.substring(0, 500) : cleanPrompt;
        
        // 立即生成URL - 不需要等待API调用
        const encodedPrompt = encodeURIComponent(optimizedPrompt);
        
        // 🆕 使用基於物品名稱的固定seed，確保相同物品每次生成相同圖片
        const itemSeed = generateSeedFromString(itemName);
        const aiImageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${itemSeed}&model=flux`;
        
        // console.log(`[VN面板-手机版] 優化後提示詞: ${optimizedPrompt}`);
        // console.log(`[VN面板-手机版] 生成AI物品圖片: ${itemName} -> ${aiImageUrl}`);
        
        // 生成物品圖片URL結構
        const itemUrls = {
            userCustomImageUrl: null,
            aiImageUrl: aiImageUrl,
            fallbackUrl: `https://nancywang3641.github.io/sound-files/item_type/${itemType}.jpg`
        };
        
        // 立即緩存物品圖片 - 不等待图片加载
        cacheItemImage(itemName, { itemUrls });
        // console.log(`[VN面板-手机版] 物品圖片已緩存: ${itemName} (${itemIndex}/${totalItems})`);
        
        // 通知处理器图片已生成
        sendMessageToProcessor({
            type: 'ITEM_IMAGE_READY',
            data: {
                itemName: itemName,
                itemUrls: itemUrls,
                timestamp: Date.now()
            }
        });
        
    } catch (error) {
        console.error(`[VN面板-手机版] 生成物品圖片失敗: ${itemName}`, error);
    }
}

/**
 * 緩存背景圖片
 */
function cacheBackgroundImage(facilityName, imageUrl) {
    backgroundCache.set(facilityName, imageUrl);
    // console.log(`[VN面板-手机版] 背景圖片已緩存: ${facilityName} -> ${imageUrl}`);
    
    // 預加載背景圖片
    if (window.preloadBackgroundImage) {
        window.preloadBackgroundImage(facilityName, imageUrl);
    }
}

/**
 * 檢查並應用當前場景背景
 */
function checkAndApplyCurrentSceneBackground() {
    if (!sceneQueue.isReady || sceneQueue.currentSceneIndex >= sceneQueue.scenes.length) {
        return;
    }
    
    const currentScene = sceneQueue.scenes[sceneQueue.currentSceneIndex];
    if (currentScene && !currentScene.isApplied) {
        const cachedImageUrl = backgroundCache.get(currentScene.facilityName);
        if (cachedImageUrl) {
            // console.log(`[VN面板-手机版] 應用場景背景: ${currentScene.facilityName} (${currentScene.sceneIndex}/${sceneQueue.scenes.length})`);
            
            // 直接應用背景圖片
            applyBackgroundImageDirectly(cachedImageUrl);
            currentScene.isApplied = true;
            // console.log(`[VN面板-手机版] 場景背景應用成功: ${currentScene.facilityName}`);
        } else {
            // console.log(`[VN面板-手机版] 場景背景尚未生成: ${currentScene.facilityName}`);
        }
    }
}

/**
 * 直接應用背景圖片（簡化版本）
 */
function applyBackgroundImageDirectly(imageUrl) {
    if (!gameContainer) {
        // console.error('[VN面板-手机版] 找不到遊戲容器');
        return;
    }
    
    if (!imageUrl) {
        console.warn('[VN面板-手机版] 圖片URL為空');
        return;
    }
    
    try {
        // console.log(`[VN面板-手机版] 直接應用背景: ${imageUrl}`);
        
        // 立即應用背景
        gameContainer.style.backgroundImage = `url('${imageUrl}')`;
        
        // 更新背景狀態
        if (backgroundImageState) {
            backgroundImageState.appliedImageUrl = imageUrl;
            backgroundImageState.lastAppliedTime = Date.now();
            backgroundImageState.isApplying = false;
        }
        
        // console.log(`[VN面板-手机版] 背景應用完成: ${imageUrl}`);
        
    } catch (error) {
        // console.error('[VN面板-手机版] 應用背景出錯:', error);
    }
}

/**
 * 推進到下一個場景
 */
function advanceToNextScene() {
    if (sceneQueue.isReady && sceneQueue.currentSceneIndex < sceneQueue.scenes.length - 1) {
        sceneQueue.currentSceneIndex++;
        // console.log(`[VN面板-手机版] 推進到場景 ${sceneQueue.currentSceneIndex + 1}/${sceneQueue.scenes.length}`);
        checkAndApplyCurrentSceneBackground();
    }
}

/**
 * 根據設施名稱切換到指定場景
 */
function switchToSceneByFacilityName(facilityName) {
    if (!sceneQueue.isReady) {
        console.log('[VN面板-手机版] 場景隊列未準備就緒');
        return;
    }
    
    const targetSceneIndex = sceneQueue.scenes.findIndex(scene => 
        scene.facilityName === facilityName
    );
    
    if (targetSceneIndex !== -1) {
        sceneQueue.currentSceneIndex = targetSceneIndex;
        // console.log(`[VN面板-手机版] 切換到場景: ${facilityName} (索引: ${targetSceneIndex + 1})`);
        checkAndApplyCurrentSceneBackground();
    } else {
        // console.log(`[VN面板-手机版] 未找到場景: ${facilityName}`);
    }
}