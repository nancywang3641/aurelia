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
    isApplying: false,
    debug: true
};

// 動態獲取背景圖片配置
function getMobileBackgroundConfig() {
    if (window.VNMaterialProcessor?.getBackgroundSettings) {
        const settings = window.VNMaterialProcessor.getBackgroundSettings();
        return {
            baseUrl: settings.baseUrl || 'http://127.0.0.1:8000/location_img/',
            fallbackUrl: settings.fallbackUrl || 'https://nancywang3641.github.io/sound-files/location_img/default.jpeg',
            imageFormat: settings.imageFormat || '.jpeg'
        };
    }
    return {
        baseUrl: 'http://127.0.0.1:8000/location_img/',
        fallbackUrl: 'https://nancywang3641.github.io/sound-files/location_img/default.jpeg',
        imageFormat: '.jpeg'
    };
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
 * 发送消息到JCY主系统 (修改为JCY通信方式)
 */
function sendMessageToProcessor(messageData) {
    try {
        // 方法1：通过postMessage与JCY主系统通信
        console.log(`[VN面板-JCY版] 发送消息到JCY主系统: ${messageData.type}`);
        
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(messageData, '*');
            console.log(`[VN面板-JCY版] 已通过postMessage发送到JCY主系统: ${messageData.type}`);
            return true;
        }
        
        console.error(`[VN面板-JCY版] 无法找到JCY主窗口`);
        return false;

    } catch (error) {
        console.error(`[VN面板-JCY版] 发送消息到JCY主系统出错:`, error);
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
    console.log('[VN面板-JCY版] 初始化 VN Core v20.1 (JCY版)...');
    
    initResourceFunctions();
    setupModalEventListeners();
    setupEventListeners();
    setupUserInputListeners();
    
    if (characterCenter) characterCenter.innerHTML = '';
    if (choicesContainer) choicesContainer.classList.add(CSS_HIDDEN);
    
    // JCY版本：確保所有必要的模塊都已初始化
    setTimeout(() => {
        // 檢查VNFeatures是否已初始化
        if (!window.VNFeatures?.handleSpecialDialogue) {
            console.warn('[VN面板-JCY版] VNFeatures未完全初始化，等待初始化完成...');
            setTimeout(() => {
                if (window.VNFeatures?.handleSpecialDialogue) {
                    console.log('[VN面板-JCY版] VNFeatures初始化完成');
                } else {
                    console.error('[VN面板-JCY版] VNFeatures初始化失敗');
                }
            }, 2000);
        } else {
            console.log('[VN面板-JCY版] VNFeatures已初始化');
        }
        
        // 檢查Chat處理器是否已初始化
        if (!window.handleChatDialogue) {
            console.warn('[VN面板-JCY版] handleChatDialogue未初始化，等待初始化完成...');
            setTimeout(() => {
                if (window.handleChatDialogue) {
                    console.log('[VN面板-JCY版] handleChatDialogue初始化完成');
                } else {
                    console.error('[VN面板-JCY版] handleChatDialogue初始化失敗');
                }
            }, 2000);
        } else {
            console.log('[VN面板-JCY版] handleChatDialogue已初始化');
        }
    }, 1000);
    
    // 通知处理器面板已准备就绪
    sendMessageToProcessor({ type: 'VN_PANEL_READY' });
    
    console.log('[VN面板-JCY版] JCY版VN面板初始化完成');
}

function initResourceFunctions() {
    try {
        // 檢查是否在iframe中且有父窗口
        if (window.parent && window.parent !== window) {
            // 嘗試通過postMessage獲取VNResources
            const messageData = {
                type: 'VN_GET_RESOURCES',
                timestamp: Date.now()
            };
            
            window.parent.postMessage(messageData, '*');
            
            // 設置一個超時，如果沒有回應就使用本地備用方案
            setTimeout(() => {
                if (!getCharacterImageUrlFn || !applyExpressionAnimationFn) {
                    console.warn("[VN面板-手机版] 無法從父窗口獲取VNResources，使用本地備用方案");
                    defineLocalResourceFunctions();
                }
            }, 1000);
        } else {
            console.warn("[VN面板-手机版] 不在iframe中，使用本地備用方案");
            defineLocalResourceFunctions();
        }
    } catch (error) {
        console.warn("[VN面板-手机版] 無法訪問父窗口VNResources，使用本地備用方案:", error);
        defineLocalResourceFunctions();
    }
}

function defineLocalResourceFunctions() {
    getCharacterImageUrlFn = (character, expression) => {
        const characterName = (character || 'default').trim();
        const expressionName = (expression || '').trim();
        // 動態獲取角色圖片URL
    function getCharacterImgBaseUrl() {
        if (window.VNMaterialProcessor?.getCharacterImgSettings) {
            const settings = window.VNMaterialProcessor.getCharacterImgSettings();
            return settings.baseUrl || 'https://nancywang3641.github.io/sound-files/char_img/';
        }
        return 'https://nancywang3641.github.io/sound-files/char_img/';
    }
    
    const baseUrl = getCharacterImgBaseUrl();

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
                console.log(`测试场景: ${testLocation}`); 
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
    
    if (event.data.type === 'VN_DATA') {
        console.log(`[VN面板-手机版] 收到VN_DATA (消息ID: ${event.data.messageId})`);
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
        
        // JCY版本：確保所有必要的模塊都已初始化
        if (!window.VNFeatures?.handleSpecialDialogue) {
            console.warn('[VN面板-JCY版] VNFeatures.handleSpecialDialogue未初始化，等待初始化完成...');
            setTimeout(() => {
                updateUI();
                updateCharacterStats();
                
                if (event.data.hasChatSection && typeof showChatNotification === 'function') { 
                    showChatNotification(); 
                }
            }, 1000);
        } else {
            updateUI();
            updateCharacterStats();
            
            if (event.data.hasChatSection && typeof showChatNotification === 'function') { 
                showChatNotification(); 
            }
        }
    }
    else if (event.data.type === 'VN_INIT') {
        console.log('[VN面板-手机版] 收到VN_INIT初始化消息:', event.data.data);
        const initData = event.data.data || {};
        
        // 處理JCY系統的初始化數據
        if (initData.chatId) {
            console.log('[VN面板-手机版] 初始化聊天ID:', initData.chatId);
            // 可以在這裡設置聊天相關的初始化數據
        }
        
        if (initData.chatName) {
            console.log('[VN面板-手机版] 初始化聊天名稱:', initData.chatName);
        }
        
        // 隱藏加載動畫
        if (window.VNFeatures?.hideLoadingAnimation) {
            window.VNFeatures.hideLoadingAnimation();
        }
        
        // 自動切換到主界面（如果還在啟動界面）
        const vnLandingContainer = document.getElementById('vnLandingContainer');
        const vnMainContainer = document.getElementById('vnMainContainer');
        if (vnLandingContainer?.classList.contains('active')) {
            vnLandingContainer.classList.remove('active');
            vnMainContainer?.classList.add('active');
            console.log('[VN面板-手机版] 自動切換到主界面');
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
        
        // 隐藏加载动画
        if (window.VNFeatures?.hideLoadingAnimation) {
            window.VNFeatures.hideLoadingAnimation();
        }
        
        // 显示历史选择界面
        displayVNHistoryChoices(event.data.data);
        
        // 自动切换到主界面（如果还在启动界面）
        const vnLandingContainer = document.getElementById('vnLandingContainer');
        const vnMainContainer = document.getElementById('vnMainContainer');
        if (vnLandingContainer?.classList.contains('active')) {
            vnLandingContainer.classList.remove('active');
            vnMainContainer?.classList.add('active');
            console.log('[VN面板-手机版] 自动切换到主界面显示历史');
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
            console.error('[VN面板-手机版] 发送历史请求失败');
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
    
    // 版本信息
    version: '20.1-mobile',
    isMobile: true
};