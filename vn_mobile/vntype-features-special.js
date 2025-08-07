/**
 * VN Type Features Special - 手机版特殊功能模块 v21.1
 * 
 * 包含: 指令系统、Echo系统、过场效果、特殊对话处理器、实用函数
 */

// =======================================================================
//                            特殊功能全域變數
// =======================================================================

// Echo状态管理
let currentEchoState = {
    isActive: false,
    isClosing: false,
    dialogue: null,
    completed: false
};

let shouldShowLoadingAfterCurrentBatch = false;
let isProcessingSpecialDialogue = false;
let lastProcessedDialogueId = null;
let isAreaTransitionActive = false;

// 指令系统状态管理
let commandSystemState = {
    isCommandModalOpen: false,
    commandTypes: ['角色矯正', '劇情矯正'],
    currentCommandType: '角色矯正',
    isSending: false
};

// 等待场景背景的标志
let isWaitingForSceneBackground = false; 

// Transition过场状态管理
let transitionState = {
    isActive: false,
    queue: [],
    currentIndex: 0,
    isProcessing: false
};

// Area Transition
let areaTransitionContainer = null;
// 動態獲取Area GIF URL
function getAreaGifBaseUrl() {
    if (window.VNMaterialProcessor?.getAreaGifSettings) {
        const settings = window.VNMaterialProcessor.getAreaGifSettings();
        return settings.baseUrl || 'https://nancywang3641.github.io/sound-files/Area_img/';
    }
    return 'https://nancywang3641.github.io/sound-files/Area_img/';
}
const AREA_TRANSITION_DURATION = 3000;

// Transition过场元素
let transitionContainer = null;
const TRANSITION_FADE_DURATION = 1000;
const TRANSITION_DISPLAY_DURATION = 3000;

// DOM Elements for Features
let echoModalContainerEl, echoIframeEl;
// DOM Elements for Item
let itemModalContainerEl, itemImageEl, itemNameEl, itemDescriptionEl;
let commandButton, commandInputModal, commandTypeSelect, commandInputTextarea;
let commandPreview, addCommandTypeButton, addCommandTypeModal, newCommandTypeInput;

// =======================================================================
//                            DOM元素初始化
// =======================================================================

function initVNFeaturesElements() {
    echoModalContainerEl = document.getElementById('echoModal');
    echoIframeEl = document.getElementById('echo-iframe');
    
    itemModalContainerEl = document.getElementById('itemModal');
    itemImageEl = document.getElementById('item-image');
    itemNameEl = document.getElementById('item-name');
    itemDescriptionEl = document.getElementById('item-description');
    
    commandButton = document.getElementById('command-button');
    commandInputModal = document.getElementById('commandInputModal');
    commandTypeSelect = document.getElementById('commandTypeSelect');
    commandInputTextarea = document.getElementById('commandInputTextarea');
    commandPreview = document.getElementById('commandPreview');
    addCommandTypeButton = document.getElementById('addCommandType');
    addCommandTypeModal = document.getElementById('addCommandTypeModal');
    newCommandTypeInput = document.getElementById('newCommandTypeInput');
    
    console.log('[VN面板-手机版-Features] DOM元素初始化完成', {
        commandButton: !!commandButton,
        commandInputModal: !!commandInputModal,
        commandTypeSelect: !!commandTypeSelect,
        commandInputTextarea: !!commandInputTextarea,
        itemModal: !!itemModalContainerEl
    });
}

// =======================================================================
//                            Transition過場系統
// =======================================================================

/**
 * 创建Transition过场元素（限制在VN面板内）
 */
function createTransitionElement() {
    if (transitionContainer) return;

    const vnContainer = document.querySelector('.outer-container') || 
                       document.querySelector('.game-container') || 
                       document.body;

    transitionContainer = document.createElement('div');
    transitionContainer.id = 'transition-overlay';
    
    const textContent = document.createElement('div');
    textContent.id = 'transition-text';

    transitionContainer.appendChild(textContent);
    vnContainer.appendChild(transitionContainer);
    
    console.log('[VN面板-手机版-Features] Transition过场元素已创建');
}

/**
 * 显示Transition过场效果
 */
function showTransition(transitionText, onComplete) {
    if (!transitionContainer) {
        console.error('[VN面板-手机版-Features] Transition容器未找到');
        if (onComplete) onComplete();
        return;
    }

    console.log(`[VN面板-手机版-Features] 显示Transition过场: ${transitionText}`);

    const textElement = transitionContainer.querySelector('#transition-text');
    if (!textElement) {
        console.error('[VN面板-手机版-Features] Transition文字元素未找到');
        if (onComplete) onComplete();
        return;
    }

    // 隐藏其他UI元素
    const vnContainer = document.querySelector('.outer-container') || 
                       document.querySelector('.game-container');
    if (vnContainer) {
        vnContainer.classList.add('transition-active');
    }

    const elementsToHide = [
        document.querySelector('.dialog-container'),
        document.querySelector('.characters-container'),
        document.querySelector('.choices-container'),
        document.querySelector('.top-nav')
    ];
    elementsToHide.forEach(el => {
        if (el) {
            el.style.visibility = 'hidden';
            el.style.pointerEvents = 'none';
        }
    });

    // 设置文字内容
    textElement.textContent = transitionText;
    textElement.style.opacity = '0';
    textElement.style.transform = 'translateY(20px)';

    // 显示容器
    transitionContainer.style.display = 'flex';
    transitionContainer.style.opacity = '0';

    // 执行动画序列
    requestAnimationFrame(() => {
        // 1. 淡入黑屏
        transitionContainer.style.opacity = '1';
        
        // 2. 延迟后淡入文字
        setTimeout(() => {
            textElement.style.opacity = '1';
            textElement.style.transform = 'translateY(0)';
            
            // 3. 显示完整时间后开始淡出
            setTimeout(() => {
                textElement.style.opacity = '0';
                textElement.style.transform = 'translateY(-20px)';
                
                // 4. 文字淡出后，淡出黑屏
                setTimeout(() => {
                    transitionContainer.style.opacity = '0';
                    
                    // 5. 完全隐藏并恢复UI
                    setTimeout(() => {
                        transitionContainer.style.display = 'none';
                        
                        // 恢复其他UI元素
                        const vnContainer = document.querySelector('.outer-container') || 
                                           document.querySelector('.game-container');
                        if (vnContainer) {
                            vnContainer.classList.remove('transition-active');
                        }

                        elementsToHide.forEach(el => {
                            if (el) {
                                el.style.visibility = 'visible';
                                el.style.pointerEvents = 'auto';
                            }
                        });
                        
                        if (onComplete) onComplete();
                    }, TRANSITION_FADE_DURATION);
                }, TRANSITION_FADE_DURATION);
            }, TRANSITION_DISPLAY_DURATION);
        }, TRANSITION_FADE_DURATION);
    });
}

/**
 * 处理Transition队列（支持连续多条）
 */
function processTransitionQueue(transitionDialogues, onAllComplete) {
    if (!transitionDialogues || transitionDialogues.length === 0) {
        if (onAllComplete) onAllComplete();
        return;
    }

    transitionState.queue = [...transitionDialogues];
    transitionState.currentIndex = 0;
    transitionState.isProcessing = true;
    transitionState.isActive = true;

    console.log(`[VN面板-手机版-Features] 开始处理Transition队列，共 ${transitionState.queue.length} 条`);

    const processNext = () => {
        if (transitionState.currentIndex >= transitionState.queue.length) {
            // 所有Transition完成
            transitionState.isProcessing = false;
            transitionState.isActive = false;
            transitionState.queue = [];
            transitionState.currentIndex = 0;
            console.log('[VN面板-手机版-Features] 所有Transition过场完成');
            if (onAllComplete) onAllComplete();
            return;
        }

        const currentTransition = transitionState.queue[transitionState.currentIndex];
        console.log(`[VN面板-手机版-Features] 处理Transition ${transitionState.currentIndex + 1}/${transitionState.queue.length}: ${currentTransition.description}`);

        showTransition(currentTransition.description, () => {
            transitionState.currentIndex++;
            
            // 短暂停顿后处理下一个
            setTimeout(() => {
                processNext();
            }, 500);
        });
    };

    processNext();
}

/**
 * 处理单个Transition对话 - 修正版 (提前2秒切换则数)
 */
function handleTransitionDialogue(dialogue) {
    console.log('[VN面板-手机版-Features] 处理单个Transition对话:', dialogue);

    window.VNCoreAPI.addToDialogueHistory({
        ...dialogue,
        name: 'Transition',
        content: `过场: ${dialogue.description || dialogue.content}`
    });

    const dialogBoxGlobalRef = window.VNCoreAPI.dialogBoxGlobalRef;
    const nameTag = window.VNCoreAPI.nameTag;
    const choicesContainer = window.VNCoreAPI.choicesContainer;

    // 隐藏对话UI
    if (dialogBoxGlobalRef) dialogBoxGlobalRef.style.display = 'none';
    if (nameTag) nameTag.style.display = 'none';
    if (choicesContainer) choicesContainer.classList.add('hidden');

    // 显示Transition效果
    showTransition(dialogue.description || dialogue.content, () => {
        // 重要：在transition完成后重置标志
        isProcessingSpecialDialogue = false;
        
        // 这里不再调用 nextDialogue()，因为我们已经提前调用了
        console.log('[VN面板-手机版-Features] Transition动画完全结束');
    });

    // 关键修改：提前2秒调用 nextDialogue()
    // 转场总时间约6秒 (1秒淡入 + 3秒显示 + 1秒文字淡出 + 1秒黑屏淡出)
    // 提前2秒 = 在4秒后调用
    const EARLY_SWITCH_DELAY = 6000; // 4秒后切换，比原来提前2秒
    
    setTimeout(() => {
        console.log('[VN面板-手机版-Features] 提前2秒执行则数切换');
        isProcessingSpecialDialogue = false;
        
        setTimeout(() => {
            window.VNCoreAPI.nextDialogue();
        }, 100);
    }, EARLY_SWITCH_DELAY);
}


// =======================================================================
//                            Area Transition System
// =======================================================================

function createAreaTransitionElement() {
    if (areaTransitionContainer) return; 

    areaTransitionContainer = document.createElement('div');
    areaTransitionContainer.id = 'area-transition-overlay';
    Object.assign(areaTransitionContainer.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.8)', 
        zIndex: '99999', 
        display: 'none', 
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden'
    });

    const img = document.createElement('img');
    img.id = 'area-transition-gif';
    Object.assign(img.style, {
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain' 
    });

    areaTransitionContainer.appendChild(img);
    document.body.appendChild(areaTransitionContainer);
    console.log('[VN面板-手机版-Features] Area transition元素已创建');
}

function showAreaTransition(areaName, callbackAfterTransition) {
    if (!areaTransitionContainer) {
        console.error("Area transition容器未找到");
        if (callbackAfterTransition) callbackAfterTransition();
        return;
    }
    
    const gifImg = areaTransitionContainer.querySelector('#area-transition-gif');
    if (!gifImg) {
        console.error("Area transition GIF图片元素未找到");
        if (callbackAfterTransition) callbackAfterTransition();
        return;
    }

    console.log(`[VN面板-手机版-Features] 显示area transition: ${areaName}`);

    const elementsToHideTemporarily = [
        document.querySelector('.dialog-container'),
        document.querySelector('.characters-container'),
        document.querySelector('.choices-container'),
        document.querySelector('.top-nav') 
    ];
    elementsToHideTemporarily.forEach(el => { 
        if (el) el.style.visibility = 'hidden'; 
    });
    
    const gameContainer = document.querySelector('.game-container');
    if (gameContainer) gameContainer.style.backgroundImage = 'none'; 

    // 使用正确的GIF路径
    gifImg.src = `${getAreaGifBaseUrl()}${areaName}.gif`; 
    areaTransitionContainer.style.display = 'flex';

    let transitionFinished = false;
    const onFinish = () => {
        if (transitionFinished) return;
        transitionFinished = true;
        hideAreaTransition(callbackAfterTransition);
    };

    gifImg.onload = () => {
        console.log(`[VN面板-手机版-Features] Area transition GIF已加载: ${gifImg.src}`);
        setTimeout(onFinish, AREA_TRANSITION_DURATION);
    };
    
    gifImg.onerror = () => {
        console.warn(`[VN面板-手机版-Features] Area transition GIF加载失败: ${gifImg.src}，跳过过渡效果`);
        onFinish(); 
    };
    
    // 减少超时时间，避免重复触发
    setTimeout(() => {
        if (!transitionFinished) {
            console.warn('[VN面板-手机版-Features] Area transition GIF加载超时，继续进行');
            onFinish();
        }
    }, 2000);
}

function hideAreaTransition(callback) {
    console.log('[VN面板-手机版-Features] 隐藏area transition');
    if (areaTransitionContainer) {
        areaTransitionContainer.style.display = 'none';
        const gifImg = areaTransitionContainer.querySelector('#area-transition-gif');
        if (gifImg) gifImg.src = ''; 
    }

    const elementsToShowAgain = [
        document.querySelector('.dialog-container'),
        document.querySelector('.characters-container'),
        document.querySelector('.choices-container'),
        document.querySelector('.top-nav')
    ];
    elementsToShowAgain.forEach(el => { 
        if (el) el.style.visibility = 'visible'; 
    });

    if (callback) callback();
}

/**
 * 在背景图片准备好后，继续执行VN剧情
 */
function proceedAfterBackgroundReady() {
    if (!isWaitingForSceneBackground) return;

    console.log('[VN面板-手机版-Features] 🏞️ 背景已就绪，恢复剧情流程');
    isWaitingForSceneBackground = false;
    window.VNFeatures.hideLoadingAnimation();

    // 确保对话框恢复显示
    const dialogBox = window.VNCoreAPI?.dialogBoxGlobalRef;
    if (dialogBox) {
        dialogBox.style.display = 'flex';
    }

    // 延迟一点时间再继续，给浏览器渲染背景的机会
    setTimeout(() => {
        window.VNCoreAPI.nextDialogue();
    }, 100);
}

// =======================================================================
//                            特殊對話處理器（手機版簡化）
// =======================================================================

function handleSpecialDialogue(dialogue) {
    if (dialogue.type === 'area') {
        // 只对Area添加防重复处理
        if (isAreaTransitionActive) {
            console.warn('[VN面板-手机版-Features] Area transition正在进行中，跳过重复请求');
            return true;
        }
        
        isAreaTransitionActive = true;
        
        console.log('[VN面板-手机版-Features] 处理AREA_TYPE对话:', dialogue);
        window.VNCoreAPI.addToDialogueHistory({
            ...dialogue,
            name: 'Area Transition',
            content: `转换到区域: ${dialogue.areaName || 'N/A'}`
        });

        const dialogBoxGlobalRef = window.VNCoreAPI.dialogBoxGlobalRef;
        const nameTag = window.VNCoreAPI.nameTag;
        const choicesContainer = window.VNCoreAPI.choicesContainer;

        if (dialogBoxGlobalRef) dialogBoxGlobalRef.style.display = 'none';
        if (nameTag) nameTag.style.display = 'none';
        if (choicesContainer) choicesContainer.classList.add('hidden');

        if (dialogue.areaName && dialogue.areaName.trim() !== '' && dialogue.areaName.toLowerCase() !== 'none') {
            showAreaTransition(dialogue.areaName, () => {
                isAreaTransitionActive = false;
                window.VNCoreAPI.nextDialogue(); 
            });
        } else {
            console.warn('[VN面板-手机版-Features] AREA_TYPE没有有效的areaName，跳过GIF');
            isAreaTransitionActive = false;
            window.VNCoreAPI.nextDialogue();
        }
        return true;
    }

    // Transition类型处理
    if (dialogue.type === 'transition') {
        console.log('[VN面板-手机版-Features] 处理TRANSITION_TYPE对话:', dialogue);
        handleTransitionDialogue(dialogue);
        return true;
    }

    // BGM_TYPE处理
    if (dialogue.type === 'bgm') {
        console.log('[VN面板-手机版-Features] 处理BGM_TYPE对话:', dialogue);
        window.VNCoreAPI.addToDialogueHistory({
            ...dialogue,
            name: 'BGM Change',
            content: `BGM: ${dialogue.bgmName || 'N/A'}`
        });

        const dialogBoxGlobalRef = window.VNCoreAPI.dialogBoxGlobalRef;
        const nameTag = window.VNCoreAPI.nameTag;
        const choicesContainer = window.VNCoreAPI.choicesContainer;

        if (dialogBoxGlobalRef) dialogBoxGlobalRef.style.display = 'none';
        if (nameTag) nameTag.style.display = 'none';
        if (choicesContainer) choicesContainer.classList.add('hidden');

        // 更新VN数据中的BGM信息
        const vnData = window.VNCoreAPI.vnData;
        if (dialogue.bgmName) {
            vnData.sceneInfo.bgm = dialogue.bgmName;
            
            // 调用BGM更新功能
            window.VNFeatures.updateBGM();
        }

        // 短暂延迟后继续下一个对话
        setTimeout(() => {
            window.VNCoreAPI.nextDialogue(); 
        }, 50); 
        
        return true;
    }

    // Scene类型处理（手机版简化 - 直接从设施名称获取背景）
    if (dialogue.type === 'scene') {
        console.log('[VN面板-手机版-Features] 处理SCENE_TYPE对话 (手机版):', dialogue);
        window.VNCoreAPI.addToDialogueHistory({
            ...dialogue,
            name: 'Scene Change',
            content: `场景: ${dialogue.location || 'N/A'}, 日期: ${dialogue.date || 'N/A'}, 时间: ${dialogue.time || 'N/A'}`
        });

        const dialogBoxGlobalRef = window.VNCoreAPI.dialogBoxGlobalRef;
        const nameTag = window.VNCoreAPI.nameTag;
        const choicesContainer = window.VNCoreAPI.choicesContainer;

        if (dialogBoxGlobalRef) dialogBoxGlobalRef.style.display = 'none';
        if (nameTag) nameTag.style.display = 'none';
        if (choicesContainer) choicesContainer.classList.add('hidden');

        // 强制清除立绘
        forceCharacterExit();

        const performSceneUpdateAndProceed = () => {
            const vnData = window.VNCoreAPI.vnData;
            
            // 更新场景信息
            if (dialogue.location) {
                vnData.sceneInfo.location = dialogue.location;
                
                // 手机版：直接使用设施名称生成背景URL并应用
                console.log(`[VN面板-手机版-Features] 手机版场景切换: ${dialogue.location}`);
                if (window.VNCoreAPI?.updateBackground) {
                    window.VNCoreAPI.updateBackground(); 
                }
            }
            
            if (dialogue.date) vnData.sceneInfo.date = dialogue.date;
            if (dialogue.time) vnData.sceneInfo.time = dialogue.time;
            
            if (dialogBoxGlobalRef) dialogBoxGlobalRef.style.display = 'none';
            if (nameTag) nameTag.style.display = 'none';

            // 手机版：简单延迟后继续
            setTimeout(() => {
                window.VNCoreAPI.nextDialogue(); 
            }, 100); 
        };
        
        performSceneUpdateAndProceed(); 
        return true;
    }

    // 其他对话类型处理
    if (dialogue.type === 'echo') {
        console.log('[VN面板-手机版-Features] 检测到Echo对话，调用handleEchoDialogue');
        handleEchoDialogue(dialogue);
        window.VNCoreAPI.addToDialogueHistory(dialogue);
        const choicesContainer = window.VNCoreAPI.choicesContainer;
        if (choicesContainer) choicesContainer.classList.add('hidden'); 
        return true;
    }

    if (dialogue.type === 'item') {
    console.log('[VN面板-手机版-Features] 检测到Item对话，调用handleItemDialogue');
    handleItemDialogue(dialogue);
    window.VNCoreAPI.addToDialogueHistory(dialogue);
    const choicesContainer = window.VNCoreAPI.choicesContainer;
    if (choicesContainer) choicesContainer.classList.add('hidden'); 
    return true;
    }

    if (dialogue.type === 'chat' && typeof window.handleChatDialogue === 'function') {
        console.log('[VN面板-Debug] 檢測到chat對話，準備調用handleChatDialogue:', dialogue);
        window.handleChatDialogue(dialogue); 
        window.VNCoreAPI.addToDialogueHistory(dialogue);
        const choicesContainer = window.VNCoreAPI.choicesContainer;
        if (choicesContainer) choicesContainer.classList.add('hidden');
        return true;
    }
    
    if (dialogue.type === 'call' && typeof window.handleCallDialogue === 'function') {
        if (dialogue.callMessages && Array.isArray(dialogue.callMessages)) {
            console.log(`[VN面板-手机版-Features] 检测到新Call块格式，通话方向: ${dialogue.callDirection}, 消息数量: ${dialogue.callMessages.length}`);
            
            const callMessages = dialogue.callMessages.map((msg, index) => ({
                originalOrder: dialogue.originalOrder + index * 0.1,
                _originalNumbering: `${dialogue._originalNumbering}-${msg.messageOrder}`,
                type: 'call',
                callDirection: dialogue.callDirection,
                position: msg.position,
                background: msg.facility,
                name: msg.speaker,
                content: msg.content,
                facility: msg.facility,
                messageOrder: msg.messageOrder,
                isPartOfBlock: true
            }));
            
            window.handleCallDialogue(dialogue, callMessages); 
            callMessages.forEach(msg => window.VNCoreAPI.addToDialogueHistory(msg));
            const choicesContainer = window.VNCoreAPI.choicesContainer;
            if (choicesContainer) choicesContainer.classList.add('hidden');
            return true;
        }
        
        const vnData = window.VNCoreAPI.vnData;
        const currentDialogueIndex = window.VNCoreAPI.currentDialogueIndex;
        const callMessages = [dialogue];
        let nextIdx = currentDialogueIndex + 1;
        
        if (dialogue.callDirection) {
            const currentCallDirection = dialogue.callDirection;
            console.log(`[VN面板-手机版-Features] 检测到旧格式但有callDirection的通话，收集同方向消息: ${currentCallDirection}`);
            
            while (nextIdx < vnData.dialogues.length && 
                   vnData.dialogues[nextIdx]?.type === 'call' && 
                   vnData.dialogues[nextIdx]?.callDirection === currentCallDirection &&
                   !vnData.dialogues[nextIdx]?.callMessages) {
                const nextCallMsg = vnData.dialogues[nextIdx];
                callMessages.push(nextCallMsg);
                nextIdx++;
            }
        } else {
            while (nextIdx < vnData.dialogues.length && 
                   vnData.dialogues[nextIdx]?.type === 'call' && 
                   !vnData.dialogues[nextIdx]?.callDirection && 
                   !vnData.dialogues[nextIdx]?.callMessages) {
                const nextCallMsg = vnData.dialogues[nextIdx];
                callMessages.push(nextCallMsg);
                nextIdx++;
            }
        }
        
        window.handleCallDialogue(dialogue, callMessages); 
        callMessages.forEach(msg => window.VNCoreAPI.addToDialogueHistory(msg));
        const choicesContainer = window.VNCoreAPI.choicesContainer;
        if (choicesContainer) choicesContainer.classList.add('hidden');
        window.VNCoreAPI.currentDialogueIndex = nextIdx - 1; 
        return true;
    }
    
    if (dialogue.type === 'livestream' && typeof window.handleLivestreamDialogue === 'function') {
        window.handleLivestreamDialogue(dialogue); 
        window.VNCoreAPI.addToDialogueHistory(dialogue);
        const choicesContainer = window.VNCoreAPI.choicesContainer;
        if (choicesContainer) choicesContainer.classList.add('hidden');
        return true;
    }

    return false; // 未处理
}

/**
 * 强制清除所有角色立绘（用于场景切换）
 */
function forceCharacterExit() {
    console.log('[VN面板-手机版-Features] 🎭 Scene切换，强制清除所有立绘');
    
    const characterCenter = window.VNCoreAPI?.characterCenter;
    if (!characterCenter) {
        console.warn('[VN面板-手机版-Features] characterCenter未找到');
        return;
    }
    
    const img = characterCenter.querySelector('img');
    if (img) {
        console.log('[VN面板-手机版-Features] 找到立绘，执行退场动画');
        img.classList.add('character-image-exit');
        img.addEventListener('animationend', () => { 
            if (img.parentNode) {
                img.parentNode.removeChild(img);
                console.log('[VN面板-手机版-Features] 立绘已移除');
            }
        }, { once: true });
    } else {
        console.log('[VN面板-手机版-Features] 没有找到需要清除的立绘');
    }
    
    // 重置当前角色状态
    if (window.VNCoreAPI) {
        window.VNCoreAPI.currentCharacter = null;
        console.log('[VN面板-手机版-Features] 当前角色状态已重置');
    }
}

// =======================================================================
//                            Echo對話系統
// =======================================================================

function setupEchoEventListeners() {
    if (!echoModalContainerEl) {
        console.warn('[VN面板-手机版-Features] Echo模态窗口元素未找到，跳过Echo事件监听设置');
        return;
    }

    const closeEchoButtons = document.querySelectorAll('#close-echo-dialog, #close-echo-button');
    closeEchoButtons.forEach(button => {
        if (button) {
            button.addEventListener('click', () => {
                closeEchoDialog();
            });
        }
    });

    echoModalContainerEl.addEventListener('click', (e) => {
        if (e.target === echoModalContainerEl) {
            closeEchoDialog();
        }
    });

    console.log('[VN面板-手机版-Features] Echo事件监听设置完成');
}

function handleEchoDialogue(dialogue) {
    console.log('[VN面板-手机版-Features] 处理Echo对话:', dialogue);

    if (!echoModalContainerEl) {
        console.error('[VN面板-手机版-Features] Echo模态窗口容器未找到');
        window.VNCoreAPI.nextDialogue();
        return;
    }
    if (!echoIframeEl) {
        console.error('[VN面板-手机版-Features] Echo iframe元素未找到');
        window.VNCoreAPI.nextDialogue();
        return;
    }
    
    const dialogBoxGlobalRef = window.VNCoreAPI.dialogBoxGlobalRef;
    const nameTag = window.VNCoreAPI.nameTag;

    if (dialogBoxGlobalRef) dialogBoxGlobalRef.style.display = 'none';
    if (nameTag) nameTag.style.display = 'none';

    currentEchoState = {
        isActive: true,
        isClosing: false,
        dialogue: dialogue,
        completed: false 
    };

    const echoSrc = '/echo/echo_panel.html'; 
    console.log('[VN面板-手机版-Features] 设置Echo iframe源:', echoSrc);

    echoIframeEl.src = echoSrc;
    echoIframeEl.onload = function() {
        console.log('[VN面板-手机版-Features] Echo iframe已加载');
        try {
            if (echoIframeEl.contentWindow) {
                echoIframeEl.contentWindow.postMessage({
                    type: 'ECHO_DATA',
                    data: {
                        dialogue: dialogue, 
                        echoId: dialogue.echoId,
                        content: dialogue.content, 
                        rawParams: dialogue.rawParams
                    }
                }, '*');
                console.log('[VN面板-手机版-Features] 已向Echo iframe发送数据');
            } else {
                 console.error('[VN面板-手机版-Features] Echo iframe contentWindow为null');
            }
        } catch (error) {
            console.error('[VN面板-手机版-Features] 向Echo iframe发送数据时出错:', error);
        }
    };
    echoIframeEl.onerror = function() {
        console.error('[VN面板-手机版-Features] Echo iframe加载失败:', echoSrc);
        closeEchoDialog();
    };

    echoModalContainerEl.classList.add('active');
    console.log('[VN面板-手机版-Features] Echo模态窗口已显示');

    if (dialogue.soundEffect) {
        window.VNFeatures.playSound(dialogue.soundEffect);
    } else {
        window.VNFeatures.playSound('messageSound'); 
    }
}

function closeEchoDialog() {
    if (currentEchoState.isClosing) {
        console.log('[VN面板-手机版-Features] Echo对话框已在关闭中');
        return;
    }
    currentEchoState.isClosing = true;
    currentEchoState.completed = true; 
    console.log('[VN面板-手机版-Features] 开始关闭Echo对话框序列（标记为已完成）');

    if (echoModalContainerEl) {
        echoModalContainerEl.classList.remove('active');
        console.log('[VN面板-手机版-Features] Echo模态窗口已关闭');
        if (echoIframeEl) {
            echoIframeEl.src = 'about:blank'; 
        }
        window.VNFeatures.playSound('callEndSound'); 
    }

    const wasCompleted = currentEchoState.completed; 

    const resetAndProceed = () => {
        if (wasCompleted) { 
            console.log('[VN面板-手机版-Features] Echo完成，继续VN剧情');
            let nextDialogueCalled = false;

            setTimeout(() => { 
                if (nextDialogueCalled) return;
                nextDialogueCalled = true;

                try {
                    const mainDialog = document.querySelector('.dialog-box');
                    const mainNameTag = document.querySelector('.name-tag');
                    if(mainDialog) { 
                        mainDialog.style.display = 'flex'; 
                        mainDialog.style.visibility = 'visible'; 
                        mainDialog.style.opacity = '1'; 
                        mainDialog.classList.remove('hiding', 'hidden');
                    }
                    if(mainNameTag) { 
                        mainNameTag.style.display = 'inline-block'; 
                        mainNameTag.style.visibility = 'visible'; 
                        mainNameTag.style.opacity = '1'; 
                        mainNameTag.classList.remove('hiding', 'hidden');
                    }

                    window.VNCoreAPI.nextDialogue();
                } catch (error) {
                    console.error('[VN面板-手机版-Features] 执行nextDialogue时出错:', error);
                }

                currentEchoState = { 
                    isActive: false,
                    isClosing: false,
                    dialogue: null,
                    completed: false
                };
                console.log('[VN面板-手机版-Features] Echo状态完全重置，锁定释放');
            }, 200); 
        } else {
            currentEchoState = { isActive: false, isClosing: false, dialogue: null, completed: false };
            console.log('[VN面板-手机版-Features] Echo对话框关闭（未完成），状态重置，锁定释放');
        }
    };
    setTimeout(resetAndProceed, echoModalContainerEl ? 100 : 0);
}

// =======================================================================
//                            Item物品展示系统
// =======================================================================

async function handleItemDialogue(dialogue) {
    console.log('[VN面板-手机版-Features] 处理Item对话:', dialogue);

    if (!itemModalContainerEl) {
        console.error('[VN面板-手机版-Features] Item模态窗口容器未找到');
        window.VNCoreAPI.nextDialogue();
        return;
    }
    
    const dialogBoxGlobalRef = window.VNCoreAPI.dialogBoxGlobalRef;
    const nameTag = window.VNCoreAPI.nameTag;

    if (dialogBoxGlobalRef) dialogBoxGlobalRef.style.display = 'none';
    if (nameTag) nameTag.style.display = 'none';

    // 動態生成物品圖片URL
    let itemImageUrl = null;
    let itemFallbackUrl = null;

    // 檢查是否使用上傳模式
    const savedSettings = JSON.parse(localStorage.getItem('vn_material_settings') || '{}');
    const isUploadMode = savedSettings.sourceMode === 'upload';

    if (isUploadMode && window.materialImageManager) {
        // 上傳模式：從IndexedDB獲取圖片
        console.log('[VN面板-Features] 使用上傳模式獲取物品圖片');
        
        try {
            const images = await window.materialImageManager.getImagesByCategory('item');
            
            // 查找匹配的物品圖片
            const matchedImage = images.find(img => {
                const imgName = img.name.replace(/\.[^/.]+$/, ''); // 移除文件擴展名
                return imgName === dialogue.itemName || imgName.includes(dialogue.itemName);
            });
            
            if (matchedImage) {
                console.log('[VN面板-Features] 從IndexedDB找到物品圖片:', matchedImage.name);
                itemImageUrl = matchedImage.url;
            } else {
                console.log('[VN面板-Features] IndexedDB中未找到物品圖片，使用URL模式');
            }
        } catch (error) {
            console.error('[VN面板-Features] 從IndexedDB獲取物品圖片失敗:', error);
        }
    }

    // URL模式：動態生成URL
    if (window.VNMaterialProcessor?.generateItemImgUrl) {
        itemImageUrl = window.VNMaterialProcessor.generateItemImgUrl(dialogue.itemName);
        console.log('[VN面板-Features] 生成物品圖片URL:', itemImageUrl);
    }

    if (window.VNMaterialProcessor?.generateItemTypeUrl) {
        itemFallbackUrl = window.VNMaterialProcessor.generateItemTypeUrl(dialogue.itemType);
        console.log('[VN面板-Features] 生成物品類型URL:', itemFallbackUrl);
    }

    // 設置物品圖片
    if (itemImageEl) {
        if (itemImageUrl) {
            itemImageEl.src = itemImageUrl;
            itemImageEl.onerror = function() {
                console.log('[VN面板-Features] 主物品圖片加載失敗，使用類型圖片');
                if (itemFallbackUrl) {
                    itemImageEl.src = itemFallbackUrl;
                    itemImageEl.onerror = function() {
                        console.log('[VN面板-Features] 類型圖片也加載失敗');
                        // 可以設置一個默認的物品圖片
                        itemImageEl.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2NjYyIvPgogIDx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+TyBJdGVtPC90ZXh0Pgo8L3N2Zz4K';
                    };
                } else {
                    // 沒有fallback URL時的默認圖片
                    itemImageEl.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2NjYyIvPgogIDx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+Cjwvc3ZnPgo=';
                }
            };
        } else {
            // 沒有主要URL時直接使用fallback
            if (itemFallbackUrl) {
                itemImageEl.src = itemFallbackUrl;
            } else {
                // 完全沒有URL時使用默認圖片
                itemImageEl.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2NjYyIvPgogIDx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+Cjwvc3ZnPgo=';
            }
        }
    }
    
    // 設置物品信息
    if (itemNameEl) itemNameEl.textContent = dialogue.itemName || '未知物品';
    if (itemDescriptionEl) itemDescriptionEl.textContent = dialogue.itemDescription || '沒有描述';

    itemModalContainerEl.classList.add('active');
    console.log('[VN面板-Features] Item模态窗口已显示');

    // 播放音效
    if (window.VNFeatures?.playSound) {
        window.VNFeatures.playSound('itemGetSound');
    }
}

function closeItemDialog() {
    console.log('[VN面板-手机版-Features] 关闭Item对话框');
    
    if (itemModalContainerEl) {
        itemModalContainerEl.classList.remove('active');
        if (window.VNFeatures?.playSound) {
            window.VNFeatures.playSound('clickSound');
        }
    }

    setTimeout(() => {
        const mainDialog = document.querySelector('.dialog-box');
        const mainNameTag = document.querySelector('.name-tag');
        if(mainDialog) { 
            mainDialog.style.display = 'flex'; 
            mainDialog.style.visibility = 'visible'; 
            mainDialog.style.opacity = '1'; 
            mainDialog.classList.remove('hiding', 'hidden');
        }
        if(mainNameTag) { 
            mainNameTag.style.display = 'inline-block'; 
            mainNameTag.style.visibility = 'visible'; 
            mainNameTag.style.opacity = '1'; 
            mainNameTag.classList.remove('hiding', 'hidden');
        }

        window.VNCoreAPI.nextDialogue();
        console.log('[VN面板-手机版-Features] Item对话框已关闭，继续下一个对话');
    }, 200);
}

function setupItemEventListeners() {
    if (!itemModalContainerEl) {
        console.warn('[VN面板-手机版-Features] Item模态窗口元素未找到，跳过Item事件监听设置');
        return;
    }

    const closeItemButtons = document.querySelectorAll('#close-item-dialog, #close-item-button');
    closeItemButtons.forEach(button => {
        if (button) {
            button.addEventListener('click', () => {
                closeItemDialog();
            });
        }
    });

    itemModalContainerEl.addEventListener('click', (e) => {
        if (e.target === itemModalContainerEl) {
            closeItemDialog();
        }
    });

    console.log('[VN面板-手机版-Features] Item事件监听设置完成');
}

// =======================================================================
//                            指令系統 (使用官方API)
// =======================================================================

function setupCommandSystemListeners() {
    console.log('[VN面板-手机版-Features] 开始设置指令系统监听器...');
    
    if (!commandButton) {
        console.error('[VN面板-手机版-Features] commandButton元素未找到');
        commandButton = document.getElementById('command-button');
        if (!commandButton) {
            console.error('[VN面板-手机版-Features] commandButton重试后仍未找到');
            return;
        }
    }
    
    if (!commandInputModal) {
        console.error('[VN面板-手机版-Features] commandInputModal元素未找到');
        return;
    }

    console.log('[VN面板-手机版-Features] 设置指令按钮点击事件...');
    
    const newCommandButton = commandButton.cloneNode(true);
    if (commandButton.parentNode) {
        commandButton.parentNode.replaceChild(newCommandButton, commandButton);
        commandButton = newCommandButton;
    }

    commandButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[VN面板-手机版-Features] 指令按钮被点击');
        window.VNFeatures.playSound('clickSound');
        showCommandInputDialog();
    });

    const closeButtons = document.querySelectorAll('#cancelCommandInput, .close-command-input');
    closeButtons.forEach(button => {
        if (button) {
            const newButton = button.cloneNode(true);
            if (button.parentNode) {
                button.parentNode.replaceChild(newButton, button);
            }
            newButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[VN面板-手机版-Features] 关闭指令对话框');
                window.VNFeatures.playSound('clickSound');
                closeCommandInputDialog();
            });
        }
    });

    const submitButton = document.getElementById('submitCommandInput');
    if (submitButton) {
        const newSubmitButton = submitButton.cloneNode(true);
        if (submitButton.parentNode) {
            submitButton.parentNode.replaceChild(newSubmitButton, submitButton);
        }
        newSubmitButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[VN面板-手机版-Features] 提交指令按钮被点击');
            window.VNFeatures.playSound('choiceSelectSound');
            submitCommand();
        });
    }

    if (commandTypeSelect) {
        commandTypeSelect.addEventListener('change', updateCommandPreview);
    }

    if (commandInputTextarea) {
        commandInputTextarea.addEventListener('input', updateCommandPreview);
        commandInputTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                submitCommand();
            }
            if (e.key === 'Escape') {
                closeCommandInputDialog();
            }
        });
    }

    if (addCommandTypeButton) {
        const newAddButton = addCommandTypeButton.cloneNode(true);
        if (addCommandTypeButton.parentNode) {
            addCommandTypeButton.parentNode.replaceChild(newAddButton, addCommandTypeButton);
            addCommandTypeButton = newAddButton;
        }
        addCommandTypeButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.VNFeatures.playSound('clickSound');
            showAddCommandTypeDialog();
        });
    }

    setupAddCommandTypeListeners();

    if (commandInputModal) {
        commandInputModal.addEventListener('click', (e) => {
            if (e.target === commandInputModal) {
                closeCommandInputDialog();
            }
        });
    }

    if (addCommandTypeModal) {
        addCommandTypeModal.addEventListener('click', (e) => {
            if (e.target === addCommandTypeModal) {
                closeAddCommandTypeDialog();
            }
        });
    }

    console.log('[VN面板-手机版-Features] 指令系统监听器设置完成');
}

function setupAddCommandTypeListeners() {
    const addCommandTypeButtons = document.querySelectorAll('#cancelAddCommandType, .close-add-command-type');
    addCommandTypeButtons.forEach(button => {
        if (button) {
            const newButton = button.cloneNode(true);
            if (button.parentNode) {
                button.parentNode.replaceChild(newButton, button);
            }
            newButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.VNFeatures.playSound('clickSound');
                closeAddCommandTypeDialog();
            });
        }
    });

    const confirmAddCommandTypeButton = document.getElementById('confirmAddCommandType');
    if (confirmAddCommandTypeButton) {
        const newConfirmButton = confirmAddCommandTypeButton.cloneNode(true);
        if (confirmAddCommandTypeButton.parentNode) {
            confirmAddCommandTypeButton.parentNode.replaceChild(newConfirmButton, confirmAddCommandTypeButton);
        }
        newConfirmButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.VNFeatures.playSound('choiceSelectSound');
            addNewCommandType();
        });
    }

    if (newCommandTypeInput) {
        newCommandTypeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addNewCommandType();
            }
            if (e.key === 'Escape') {
                closeAddCommandTypeDialog();
            }
        });
    }
}

function showCommandInputDialog() {
    console.log('[VN面板-手机版-Features] 尝试显示指令输入对话框...');
    
    if (!commandInputModal) {
        console.error('[VN面板-手机版-Features] commandInputModal未找到');
        return;
    }
    
    if (!commandInputTextarea) {
        console.error('[VN面板-手机版-Features] commandInputTextarea未找到');
        return;
    }
    
    commandSystemState.isCommandModalOpen = true;
    window.VNFeatures.hideLoadingAnimation();
    
    commandInputTextarea.value = '';
    updateCommandPreview();
    commandInputModal.classList.add('modal-active');
    
    setTimeout(() => {
        commandInputTextarea.focus();
        console.log('[VN面板-手机版-Features] 指令输入对话框已显示并聚焦');
    }, 100);
}

function closeCommandInputDialog() {
    if (!commandInputModal) return;
    
    commandSystemState.isCommandModalOpen = false;
    commandInputModal.classList.remove('modal-active');
    console.log('[VN面板-手机版-Features] 指令输入对话框已关闭');
}

function updateCommandPreview() {
    if (!commandTypeSelect || !commandInputTextarea || !commandPreview) return;
    
    const selectedType = commandTypeSelect.value;
    const inputText = commandInputTextarea.value.trim();
    const commandPreviewPrefix = commandPreview.querySelector('.command-prefix');
    const commandPreviewText = commandPreview.querySelector('.command-preview-text');
    
    if (commandPreviewPrefix) commandPreviewPrefix.textContent = `<Request: ${selectedType}: `;
    if (commandPreviewText) commandPreviewText.textContent = (inputText || '在此输入指令内容...') + ' >';
    
    commandSystemState.currentCommandType = selectedType;
}

function submitCommand() {
    console.log('[VN面板-手机版-Features] submitCommand被调用');
    
    if (!commandTypeSelect || !commandInputTextarea) {
        console.error('[VN面板-手机版-Features] 缺少必要的DOM元素');
        return;
    }
    
    if (commandSystemState.isSending) {
        console.log('[VN面板-手机版-Features] 指令正在发送中，忽略重复请求');
        return;
    }
    
    const commandType = commandTypeSelect.value;
    const commandContent = commandInputTextarea.value.trim();
    
    console.log('[VN面板-手机版-Features] 指令类型:', commandType, '指令内容:', commandContent);
    
    if (!commandContent) {
        alert('请输入指令内容');
        return;
    }

    const commandMessage = `<Request: ${commandType}: ${commandContent} >`;
    console.log('[VN面板-手机版-Features] 准备发送指令:', commandMessage);

    commandSystemState.isSending = true;
    
    closeCommandInputDialog();
    console.log('[VN面板-手机版-Features] 指令已提交，显示loading动画');
    window.VNFeatures.showLoadingAnimation();

    sendCommandToChat(commandMessage);
}

async function sendCommandToChat(commandMessage) {
    console.log('[VN面板-手机版-Features] sendCommandToChat被调用:', commandMessage);
    console.log('[VN面板-手机版-Features] 当前发送状态:', commandSystemState.isSending);
    
    if (!commandSystemState.isSending) {
        console.warn('[VN面板-手机版-Features] 发送状态异常，重新设置为发送中');
        commandSystemState.isSending = true;
    }
    
    try {
        // === 立即清理UI：隱藏按鈕和backdrop (和繼續劇情按鈕相同) ===
        console.log('[VN面板-手机版-Features] 清理繼續劇情UI');
        
        // 1. 恢復對話框顯示
        const dialogBox = document.querySelector('.dialog-box');
        if (dialogBox) {
            dialogBox.style.visibility = '';
            console.log('[VN面板-手机版-Features] 已恢復對話框顯示');
        }
        
        // 2. 隱藏backdrop遮罩
        const backdrop = document.querySelector('.continue-story-backdrop');
        if (backdrop) {
            backdrop.classList.add('hide');
            setTimeout(() => { 
                if (backdrop.parentNode) {
                    backdrop.parentNode.removeChild(backdrop);
                    console.log('[VN面板-手机版-Features] 已移除backdrop遮罩');
                }
            }, 350);
        }
        
        // 3. 移除actions bar (包含按鈕的容器)
        const actionsBar = document.querySelector('.continue-story-actions-bar');
        if (actionsBar) {
            actionsBar.remove();
            console.log('[VN面板-手机版-Features] 已移除actions bar');
        }
        
        // === 第1步：發送指令消息到聊天室 ===
        console.log('[VN面板-手机版-Features] 第1步：發送指令消息到聊天室:', commandMessage);
        
        // 方法1：使用JCY適配器發送指令消息
        if (window.JCYAdapter && window.JCYAdapter.isJCYSystem()) {
            console.log('[VN面板-JCY版-Features] 使用JCY適配器發送指令消息');
            
            const success = window.JCYAdapter.sendMessageToJCY(commandMessage);
            if (success) {
                console.log('[VN面板-JCY版-Features] 指令消息已通过JCY適配器发送');
            } else {
                throw new Error('JCY適配器發送指令消息失敗');
            }
            
        } else {
            // 備用方法：直接使用JCY聊天元素
            console.warn('[VN面板-JCY版-Features] JCY適配器不可用，使用備用方法發送指令消息');
            
            const chatInput = window.parent.document.querySelector('#chat-input');
            const sendButton = window.parent.document.querySelector('#send-btn');
            
            if (chatInput && sendButton) {
                chatInput.value = commandMessage;
                chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => sendButton.click(), 100);
                console.log('[VN面板-JCY版-Features] 指令消息已通过JCY聊天元素发送');
            } else {
                console.error('[VN面板-JCY版-Features] 无法找到JCY聊天输入框或发送按钮');
                throw new Error('无法發送指令消息到JCY聊天室');
            }
        }
        
        // 等待消息發送完成
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // === 第2步：發送AI請求 (JCY版) ===
        console.log('[VN面板-JCY版-Features] 第2步：發送AI請求');
        
        // 方法1：使用JCY適配器發送AI請求
        if (window.JCYAdapter && window.JCYAdapter.isJCYSystem()) {
            console.log('[VN面板-JCY版-Features] 使用JCY適配器發送AI請求');
            
            // 通過postMessage發送AI請求到JCY主系統
            const success = window.JCYAdapter.sendMessageToJCYViaPostMessage({
                type: 'VN_AI_REQUEST',
                data: {
                    message: '請繼續推進VN劇情，生成下一段對話或情節',
                    source: 'VN_PANEL_COMMAND_SYSTEM'
                }
            });
            
            if (success) {
                console.log('[VN面板-JCY版-Features] AI請求已通过JCY適配器发送');
            } else {
                throw new Error('JCY適配器發送AI請求失敗');
            }
            
        } else {
            // 备用方法：直接通过postMessage发送
            console.warn('[VN面板-JCY版-Features] JCY適配器不可用，使用备用方法');
            
            // 直接發送到父窗口
            window.parent.postMessage({
                type: 'VN_AI_REQUEST',
                data: {
                    message: '請繼續推進VN劇情，生成下一段對話或情節',
                    source: 'VN_PANEL_COMMAND_SYSTEM'
                }
            }, '*');
            
            console.log('[VN面板-JCY版-Features] AI請求已通过postMessage发送');
        }
        
        console.log('[VN面板-手机版-Features] 完整指令流程執行完成');
        
    } catch (error) {
        console.error('[VN面板-手机版-Features] 指令流程執行失敗:', error);
        
        // 發生錯誤時隱藏loading動畫
        if (window.VNFeatures?.hideLoadingAnimation) {
            window.VNFeatures.hideLoadingAnimation();
        }
        
        alert('發送指令時出現錯誤，請重試。');
        
    } finally {
        // 確保狀態重置
        setTimeout(() => {
            commandSystemState.isSending = false;
            console.log('[VN面板-手机版-Features] 指令發送狀態已重置');
        }, 1500);
    }
}

/**
 * 清理繼續劇情UI：隱藏backdrop和按鈕，恢復對話框 (和繼續劇情按鈕相同的邏輯)
 */
function cleanupContinueStoryUI() {
    console.log('[VN面板-手机版-Features] 清理繼續劇情UI');
    
    // 1. 恢復對話框顯示
    const dialogBox = document.querySelector('.dialog-box');
    if (dialogBox) {
        dialogBox.style.visibility = '';
        console.log('[VN面板-手机版-Features] 已恢復對話框顯示');
    }
    
    // 2. 隱藏backdrop遮罩
    const backdrop = document.querySelector('.continue-story-backdrop');
    if (backdrop) {
        backdrop.classList.add('hide');
        setTimeout(() => { 
            if (backdrop.parentNode) {
                backdrop.parentNode.removeChild(backdrop);
                console.log('[VN面板-手机版-Features] 已移除backdrop遮罩');
            }
        }, 350);
    }
    
    // 3. 移除actions bar (包含按鈕的容器)
    const actionsBar = document.querySelector('.continue-story-actions-bar');
    if (actionsBar) {
        actionsBar.remove();
        console.log('[VN面板-手机版-Features] 已移除actions bar');
    }
}


/**
 * 第2步：觸發AI執行 (和繼續劇情按鈕相同的startNovelistAI)
 */
async function triggerAI() {
    try {
        console.log('[VN面板-JCY版-Features] 發送AI請求');
        
        // 方法1：使用JCY適配器發送AI請求
        if (window.JCYAdapter && window.JCYAdapter.isJCYSystem()) {
            console.log('[VN面板-JCY版-Features] 使用JCY適配器發送AI請求');
            
            // 通過postMessage發送AI請求到JCY主系統
            const success = window.JCYAdapter.sendMessageToJCYViaPostMessage({
                type: 'VN_AI_REQUEST',
                data: {
                    message: '請繼續推進VN劇情，生成下一段對話或情節',
                    source: 'VN_PANEL_TRIGGER_AI'
                }
            });
            
            if (success) {
                console.log('[VN面板-JCY版-Features] AI請求已通过JCY適配器发送');
            } else {
                throw new Error('JCY適配器發送AI請求失敗');
            }
            
        } else {
            // 备用方法：直接通过postMessage发送
            console.warn('[VN面板-JCY版-Features] JCY適配器不可用，使用备用方法');
            
            // 直接發送到父窗口
            window.parent.postMessage({
                type: 'VN_AI_REQUEST',
                data: {
                    message: '請繼續推進VN劇情，生成下一段對話或情節',
                    source: 'VN_PANEL_TRIGGER_AI'
                }
            }, '*');
            
            console.log('[VN面板-JCY版-Features] AI請求已通过postMessage发送');
        }
        
    } catch (error) {
        console.error('[VN面板-JCY版-Features] 發送AI請求失敗:', error);
        throw error;
    }
}

function showAddCommandTypeDialog() {
    if (!addCommandTypeModal || !newCommandTypeInput) return;
    
    if (newCommandTypeInput) newCommandTypeInput.value = '';
    addCommandTypeModal.classList.add('modal-active');
    setTimeout(() => {
        if (newCommandTypeInput) newCommandTypeInput.focus();
    }, 100);
    console.log('[VN面板-手机版-Features] 添加指令类型对话框已打开');
}

function closeAddCommandTypeDialog() {
    if (!addCommandTypeModal) return;
    
    addCommandTypeModal.classList.remove('modal-active');
    console.log('[VN面板-手机版-Features] 添加指令类型对话框已关闭');
}

function addNewCommandType() {
    if (!newCommandTypeInput || !commandTypeSelect) return;
    
    const newType = newCommandTypeInput.value.trim();
    if (!newType) {
        alert('请输入指令类型名称');
        return;
    }
    if (commandSystemState.commandTypes.includes(newType)) {
        alert('此指令类型已存在');
        return;
    }
    
    commandSystemState.commandTypes.push(newType);
    updateCommandTypeSelect();
    commandTypeSelect.value = newType;
    updateCommandPreview();
    closeAddCommandTypeDialog();
    console.log('[VN面板-手机版-Features] 新增指令类型:', newType);
}

function updateCommandTypeSelect() {
    if (!commandTypeSelect) return;
    
    commandTypeSelect.innerHTML = '';
    commandSystemState.commandTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        commandTypeSelect.appendChild(option);
    });
    updateCommandPreview();
}

// =======================================================================
//                            實用函數
// =======================================================================

function setupCollapseListeners() {
    const charDataToggle = document.getElementById('char-data-toggle');
    const charDataContent = document.getElementById('char-data-content');
    const charDataPanel = document.querySelector('.char-data-panel');

    if (charDataToggle && charDataContent && charDataPanel) {
        let isCollapsed = false; 
        const toggleAction = () => {
            isCollapsed = !isCollapsed;
            charDataContent.classList.toggle('collapsed', isCollapsed);
            charDataToggle.classList.toggle('collapsed', isCollapsed);
            charDataPanel.classList.toggle('collapsed', isCollapsed); 
            charDataToggle.textContent = isCollapsed ? '▼' : '▲'; 
            window.VNFeatures.playSound('clickSound');
        };
        charDataToggle.addEventListener('click', (e) => { e.stopPropagation(); toggleAction(); });
        const header = charDataPanel.querySelector('.char-data-header');
        if (header) header.addEventListener('click', toggleAction);
    }
}

function handleEscapeKey() {
    if (commandSystemState.isCommandModalOpen) {
        closeCommandInputDialog();
    }
    if (echoModalContainerEl?.classList.contains('active')) {
        closeEchoDialog();
    }
    if (itemModalContainerEl?.classList.contains('active')) {
        closeItemDialog();
    }
    if (areaTransitionContainer?.style.display === 'flex') {
        hideAreaTransition(() => {
            console.log("[VN面板-手机版-Features] Area transition被ESC键隐藏");
        });
    }
}

// =======================================================================
//                            模塊初始化
// =======================================================================

function initVNSpecialFeatures() {
    console.log('[VN面板-手机版-Features] 初始化特殊功能模块...');
    
    initVNFeaturesElements();
    createTransitionElement();
    setupEchoEventListeners();
    setupItemEventListeners();
    setupCommandSystemListeners();
    setupCollapseListeners();
    createAreaTransitionElement();
    
    console.log('[VN面板-手机版-Features] 特殊功能已初始化');
}

// =======================================================================
//                            全域導出
// =======================================================================

// 添加到全局VNFeatures
if (!window.VNFeatures) window.VNFeatures = {};

Object.assign(window.VNFeatures, {
    // 状态访问
    get echoState() { return JSON.parse(JSON.stringify(currentEchoState)); }, 
    get commandSystemState() { return JSON.parse(JSON.stringify(commandSystemState)); },
    get transitionState() { return JSON.parse(JSON.stringify(transitionState)); },
    
    // Echo功能
    handleEchoDialogue, 
    closeEchoDialog,
    
    // Item功能
    handleItemDialogue,
    closeItemDialog,

    // 指令系统（使用官方API）
    showCommandInputDialog,
    closeCommandInputDialog,
    sendCommand: sendCommandToChat,
    
    // 特殊对话处理器（手机版简化）
    handleSpecialDialogue,
    
    // Area Transition
    showAreaTransition,
    hideAreaTransition,
    
    // Transition过场系统
    showTransition,
    processTransitionQueue,
    handleTransitionDialogue,
    
    // 立绘管理功能
    forceCharacterExit,
    
    // 场景背景等待机制
    get isWaitingForSceneBackground() { return isWaitingForSceneBackground; },
    proceedAfterBackgroundReady,
    
    // 实用工具
    handleEscapeKey,
    
    // 初始化函数
    initVNSpecialFeatures,
    
    // 版本信息
    version: '21.1-mobile',
    isMobile: true,
    hasBackgroundGeneration: false // 手机版标识：无背景生成功能
});

// 向后兼容的全局导出
window.handleEchoDialogue = handleEchoDialogue;
window.closeEchoDialog = closeEchoDialog;
window.handleItemDialogue = handleItemDialogue;
window.closeItemDialog = closeItemDialog;
window.forceCharacterExit = forceCharacterExit;

// 自动初始化（延迟执行确保DOM已加载）
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initVNSpecialFeatures();
    }, 600); // 延迟更长时间确保其他模块先初始化
});