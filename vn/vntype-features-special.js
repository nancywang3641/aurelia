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

// 本地存储管理
const COMMAND_TYPES_STORAGE_KEY = 'VN_PANEL_COMMAND_TYPES';

// 保存指令类型到本地存储
function saveCommandTypesToStorage() {
    try {
        const customTypes = commandSystemState.commandTypes.filter(type => 
            !['角色矯正', '劇情矯正'].includes(type)
        );
        localStorage.setItem(COMMAND_TYPES_STORAGE_KEY, JSON.stringify(customTypes));
        // console.log('[VN面板-手机版-Features] 指令类型已保存到本地存储:', customTypes);
    } catch (error) {
        // console.error('[VN面板-手机版-Features] 保存指令类型失败:', error);
    }
}

// 从本地存储加载指令类型
function loadCommandTypesFromStorage() {
    try {
        const saved = localStorage.getItem(COMMAND_TYPES_STORAGE_KEY);
        if (saved) {
            const customTypes = JSON.parse(saved);
            if (Array.isArray(customTypes)) {
                // 合并默认类型和自定义类型
                const defaultTypes = ['角色矯正', '劇情矯正'];
                commandSystemState.commandTypes = [...defaultTypes, ...customTypes];
                // console.log('[VN面板-手机版-Features] 指令类型已从本地存储恢复:', customTypes);
                return true;
            }
        }
    } catch (error) {
        // console.error('[VN面板-手机版-Features] 加载指令类型失败:', error);
    }
    return false;
}

// 清除本地存储的指令类型
function clearCommandTypesStorage() {
    try {
        localStorage.removeItem(COMMAND_TYPES_STORAGE_KEY);
        // console.log('[VN面板-手机版-Features] 指令类型本地存储已清除');
    } catch (error) {
        // console.error('[VN面板-手机版-Features] 清除指令类型存储失败:', error);
    }
}

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
const AREA_GIF_BASE_URL = 'https://nancywang3641.github.io/sound-files/Area_img/';
const AREA_TRANSITION_DURATION = 3000;

// 獲取Area GIF URL的函數
async function getAreaGifUrl(areaName) {
    // 使用素材資源管理器
    if (window.MaterialResourceManager) {
        const url = await window.MaterialResourceManager.getAreaGifUrl(areaName);
        if (url) return url;
    }
    
    // 回退到原始邏輯
    return `${AREA_GIF_BASE_URL}${areaName}.gif`;
}

// Transition过场元素
let transitionContainer = null;
const TRANSITION_FADE_DURATION = 1000;
const TRANSITION_DISPLAY_DURATION = 3000;

// DOM Elements for Features
let echoModalContainerEl, echoIframeEl;
// DOM Elements for Item
let itemModalContainerEl, itemImageEl, itemNameEl, itemDescriptionEl;
let commandButton, commandInputModal, commandTypeSelect, commandInputTextarea;
let addCommandTypeButton, addCommandTypeModal, newCommandTypeInput;

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
    
    // console.log('[VN面板-手机版-Features] Transition过场元素已创建');
}

/**
 * 显示Transition过场效果
 */
function showTransition(transitionText, onComplete) {
    if (!transitionContainer) {
        // console.error('[VN面板-手机版-Features] Transition容器未找到');
        if (onComplete) onComplete();
        return;
    }

    // // console.log(`[VN面板-手机版-Features] 显示Transition过场: ${transitionText}`);

    const textElement = transitionContainer.querySelector('#transition-text');
    if (!textElement) {
        // console.error('[VN面板-手机版-Features] Transition文字元素未找到');
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

    // // console.log(`[VN面板-手机版-Features] 开始处理Transition队列，共 ${transitionState.queue.length} 条`);

    const processNext = () => {
        if (transitionState.currentIndex >= transitionState.queue.length) {
            // 所有Transition完成
            transitionState.isProcessing = false;
            transitionState.isActive = false;
            transitionState.queue = [];
            transitionState.currentIndex = 0;
            // console.log('[VN面板-手机版-Features] 所有Transition过场完成');
            if (onAllComplete) onAllComplete();
            return;
        }

        const currentTransition = transitionState.queue[transitionState.currentIndex];
        // // console.log(`[VN面板-手机版-Features] 处理Transition ${transitionState.currentIndex + 1}/${transitionState.queue.length}: ${currentTransition.description}`);

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
    // console.log('[VN面板-手机版-Features] 处理单个Transition对话:', dialogue);

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
        // console.log('[VN面板-手机版-Features] Transition动画完全结束');
    });

    // 关键修改：提前2秒调用 nextDialogue()
    // 转场总时间约6秒 (1秒淡入 + 3秒显示 + 1秒文字淡出 + 1秒黑屏淡出)
    // 提前2秒 = 在4秒后调用
    const EARLY_SWITCH_DELAY = 6000; // 4秒后切换，比原来提前2秒
    
    setTimeout(() => {
        // console.log('[VN面板-手机版-Features] 提前2秒执行则数切换');
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
        overflow: 'hidden',
        // 添加平滑过渡效果
        opacity: '0',
        transition: 'opacity 0.8s ease-in-out',
        backdropFilter: 'blur(5px)'
    });

    const img = document.createElement('img');
    img.id = 'area-transition-gif';
    Object.assign(img.style, {
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        // 添加GIF图片的过渡效果
        opacity: '0',
        transform: 'scale(0.9)',
        transition: 'opacity 0.6s ease-in-out, transform 0.6s ease-in-out'
    });

    areaTransitionContainer.appendChild(img);
    document.body.appendChild(areaTransitionContainer);
    // console.log('[VN面板-手机版-Features] Area transition元素已创建（带淡入淡出效果）');
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

    // // console.log(`[VN面板-手机版-Features] 显示area transition: ${areaName}`);

    // 在区域转场开始时强制清除立绘
    forceCharacterExit();

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

    // 使用素材資源管理器獲取GIF路徑
    getAreaGifUrl(areaName).then(url => {
        gifImg.src = url;
        // 显示容器并开始淡入动画
        areaTransitionContainer.style.display = 'flex';
        // 强制重排以确保display生效
        areaTransitionContainer.offsetHeight;
        // 开始淡入动画
        requestAnimationFrame(() => {
            areaTransitionContainer.style.opacity = '1';
        });
    }).catch(error => {
        console.error(`[VN面板-手机版-Features] 獲取Area GIF URL失敗: ${areaName}`, error);
        // 回退到原始路徑
        gifImg.src = `${AREA_GIF_BASE_URL}${areaName}.gif`;
        // 显示容器并开始淡入动画
        areaTransitionContainer.style.display = 'flex';
        // 强制重排以确保display生效
        areaTransitionContainer.offsetHeight;
        // 开始淡入动画
        requestAnimationFrame(() => {
            areaTransitionContainer.style.opacity = '1';
        });
    });

    let transitionFinished = false;
    const onFinish = () => {
        if (transitionFinished) return;
        transitionFinished = true;
        hideAreaTransition(callbackAfterTransition);
    };

    gifImg.onload = () => {
        // // console.log(`[VN面板-手机版-Features] Area transition GIF已加载: ${gifImg.src}`);
        // GIF加载完成后，添加淡入和缩放动画
        requestAnimationFrame(() => {
            gifImg.style.opacity = '1';
            gifImg.style.transform = 'scale(1)';
        });
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
    // console.log('[VN面板-手机版-Features] 隐藏area transition（带淡出效果）');
    if (areaTransitionContainer) {
        const gifImg = areaTransitionContainer.querySelector('#area-transition-gif');
        
        // 开始淡出动画
        areaTransitionContainer.style.opacity = '0';
        if (gifImg) {
            gifImg.style.opacity = '0';
            gifImg.style.transform = 'scale(0.9)';
        }
        
        // 等待淡出动画完成后再隐藏元素
        setTimeout(() => {
            areaTransitionContainer.style.display = 'none';
            if (gifImg) {
                gifImg.src = '';
                // 重置GIF样式为初始状态
                gifImg.style.opacity = '0';
                gifImg.style.transform = 'scale(0.9)';
            }
            // 重置容器透明度为初始状态
            areaTransitionContainer.style.opacity = '0';
            
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
        }, 800); // 等待800ms淡出动画完成
    } else {
        if (callback) callback();
    }
}

/**
 * 在背景图片准备好后，继续执行VN剧情
 */
function proceedAfterBackgroundReady() {
    if (!isWaitingForSceneBackground) return;

    // console.log('[VN面板-手机版-Features] 🏞️ 背景已就绪，恢复剧情流程');
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
        
        // console.log('[VN面板-手机版-Features] 处理AREA_TYPE对话:', dialogue);
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

        // ===== 新增：预先检查下一个对话是否为Scene =====
        const vnData = window.VNCoreAPI.vnData;
        const currentIndex = window.VNCoreAPI.currentDialogueIndex;
        const nextDialogue = vnData.dialogues && vnData.dialogues[currentIndex + 1];
        
        let preloadedSceneInfo = null;
        if (nextDialogue && nextDialogue.type === 'scene') {
            // console.log('[VN面板-手机版-Features] 检测到下一个对话是Scene，预备背景信息:', nextDialogue);
            preloadedSceneInfo = {
                location: nextDialogue.location,
                date: nextDialogue.date,
                time: nextDialogue.time
            };
        }

        if (dialogue.areaName && dialogue.areaName.trim() !== '' && dialogue.areaName.toLowerCase() !== 'none') {
            showAreaTransitionWithScenePreload(dialogue.areaName, preloadedSceneInfo, () => {
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
        // console.log('[VN面板-手机版-Features] 处理TRANSITION_TYPE对话:', dialogue);
        handleTransitionDialogue(dialogue);
        return true;
    }

    // BGM_TYPE处理
    if (dialogue.type === 'bgm') {
        // console.log('[VN面板-手机版-Features] 处理BGM_TYPE对话:', dialogue);
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

        // 🔥 改進：更新VN数据中的BGM信息
        const vnData = window.VNCoreAPI.vnData;
        if (dialogue.bgmName) {
            console.log(`[VN面板-手机版-Features] 🎵 處理BGM對話: ${dialogue.bgmName}`);
            vnData.sceneInfo.bgm = dialogue.bgmName;
            
            // 🔥 改進：延遲調用BGM更新功能，確保狀態穩定
            setTimeout(() => {
                if (window.VNFeatures?.updateBGM) {
                    window.VNFeatures.updateBGM();
                }
            }, 100);
        }

        // 短暂延迟后继续下一个对话
        setTimeout(() => {
            window.VNCoreAPI.nextDialogue(); 
        }, 50); 
        
        return true;
    }

    // Scene类型处理（手机版简化 - 使用场景队列切换背景）
    if (dialogue.type === 'scene') {
        // console.log('[VN面板-手机版-Features] 处理SCENE_TYPE对话 (手机版):', dialogue);
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
                // // console.log(`[VN面板-手机版-Features] 场景切换: ${dialogue.location}`);
                
                // 使用场景队列切换背景
                if (window.switchToSceneByFacilityName) {
                    // console.log('[VN面板-手机版-Features] 使用场景队列切换背景');
                    window.switchToSceneByFacilityName(dialogue.location);
                } else {
                    // 回退到原来的逻辑
                    // console.log('[VN面板-手机版-Features] 场景队列不可用，使用URL背景');
                    if (window.VNCoreAPI?.updateBackground) {
                        // 檢查是否剛應用了AI背景圖片
                        if (backgroundImageState && 
                            backgroundImageState.lastAppliedTime && 
                            Date.now() - backgroundImageState.lastAppliedTime < 5000 && // 5秒內不覆蓋
                            backgroundImageState.appliedImageUrl && 
                            backgroundImageState.appliedImageUrl.includes('pollinations.ai')) {
                            // console.log('[VN面板-手机版-Features] AI背景圖片剛應用不久，跳過背景更新:', backgroundImageState.appliedImageUrl);
                        } else {
                            window.VNCoreAPI.updateBackground();
                        }
                    }
                }
            }
            
            if (dialogue.date) vnData.sceneInfo.date = dialogue.date;
            if (dialogue.time) vnData.sceneInfo.time = dialogue.time;
            
            if (dialogBoxGlobalRef) dialogBoxGlobalRef.style.display = 'none';
            if (nameTag) nameTag.style.display = 'none';

            // 手机版：立即继续，减少延迟
            window.VNCoreAPI.nextDialogue();
        };
        
        performSceneUpdateAndProceed(); 
        return true;
    }

    // 其他对话类型处理
    if (dialogue.type === 'echo') {
        // console.log('[VN面板-手机版-Features] 检测到Echo对话，调用handleEchoDialogue');
        handleEchoDialogue(dialogue);
        window.VNCoreAPI.addToDialogueHistory(dialogue);
        const choicesContainer = window.VNCoreAPI.choicesContainer;
        if (choicesContainer) choicesContainer.classList.add('hidden'); 
        return true;
    }

        // ===== 新增：物品触发处理 =====
        if (dialogue.type === 'item_trigger') {
            // console.log('[VN面板-手机版-Features] 处理Item触发:', dialogue.itemName);
            
            // 发送物品显示请求到核心处理器
            if (window.parent) {
                window.parent.postMessage({
                    type: 'VN_SHOW_ITEM',
                    data: {
                        itemName: dialogue.itemName,
                        timestamp: Date.now()
                    }
                }, '*');
            }
            
            // 添加到对话历史
            window.VNCoreAPI.addToDialogueHistory({
                ...dialogue,
                name: 'System',
                content: `获得物品: ${dialogue.itemName}`
            });
            
            // 隐藏选择框
            const choicesContainer = window.VNCoreAPI.choicesContainer;
            if (choicesContainer) choicesContainer.classList.add('hidden');
            
            // 继续下一个对话
            setTimeout(() => {
                window.VNCoreAPI.nextDialogue();
            }, 50);
            
            return true; // 表示已处理
        }
        

    if (dialogue.type === 'item') {
        // console.log('[VN面板-手机版-Features] 检测到Item对话，调用handleItemDialogue');
        handleItemDialogue(dialogue);
        window.VNCoreAPI.addToDialogueHistory(dialogue);
        const choicesContainer = window.VNCoreAPI.choicesContainer;
        if (choicesContainer) choicesContainer.classList.add('hidden'); 
        return true;
    }

    if (dialogue.type === 'chat' && typeof window.handleChatDialogue === 'function') {
        window.handleChatDialogue(dialogue); 
        window.VNCoreAPI.addToDialogueHistory(dialogue);
        const choicesContainer = window.VNCoreAPI.choicesContainer;
        if (choicesContainer) choicesContainer.classList.add('hidden');
        return true;
    }
    
    if (dialogue.type === 'call' && typeof window.handleCallDialogue === 'function') {
        if (dialogue.callMessages && Array.isArray(dialogue.callMessages)) {
            // // console.log(`[VN面板-手机版-Features] 检测到新Call块格式，通话方向: ${dialogue.callDirection}, 消息数量: ${dialogue.callMessages.length}`);
            
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
            // // console.log(`[VN面板-手机版-Features] 检测到旧格式但有callDirection的通话，收集同方向消息: ${currentCallDirection}`);
            
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
        
        // 关键修复：livestream是特殊格式，不应该算在对话索引里
        // 直接跳到下一个非livestream事件，就像chattype一样
        const vnData = window.VNCoreAPI.vnData;
        const currentDialogueIndex = window.VNCoreAPI.currentDialogueIndex;
        let nextIdx = currentDialogueIndex + 1;
        
        // 跳过所有连续的livestream事件
        while (nextIdx < vnData.dialogues.length && 
               vnData.dialogues[nextIdx]?.type === 'livestream') {
            nextIdx++;
        }
        
        // 直接更新到下一个非livestream事件，不保留livestream在索引中
        window.VNCoreAPI.currentDialogueIndex = nextIdx;
        // // console.log(`[VN面板-手机版-Features] Livestream事件处理完成，对话索引直接跳到: ${window.VNCoreAPI.currentDialogueIndex} (跳过livestream事件)`);
        
        return true;
    }

    return false; // 未处理
}

// ===== 新增函数：带Scene预加载的Area过场函数 =====
function showAreaTransitionWithScenePreload(areaName, sceneInfo, callbackAfterTransition) {
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

    // // console.log(`[VN面板-手机版-Features] 显示area transition: ${areaName}`, sceneInfo ? '(预加载Scene背景)' : '');

    // 在区域转场开始时强制清除立绘
    forceCharacterExit();

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

    // 使用素材資源管理器獲取GIF路徑
    getAreaGifUrl(areaName).then(url => {
        gifImg.src = url;
        // 显示容器并开始淡入动画
        areaTransitionContainer.style.display = 'flex';
        // 强制重排以确保display生效
        areaTransitionContainer.offsetHeight;
        // 开始淡入动画
        requestAnimationFrame(() => {
            areaTransitionContainer.style.opacity = '1';
        });
    }).catch(error => {
        console.error(`[VN面板-手机版-Features] 獲取Area GIF URL失敗: ${areaName}`, error);
        // 回退到原始路徑
        gifImg.src = `${AREA_GIF_BASE_URL}${areaName}.gif`;
        // 显示容器并开始淡入动画
        areaTransitionContainer.style.display = 'flex';
        // 强制重排以确保display生效
        areaTransitionContainer.offsetHeight;
        // 开始淡入动画
        requestAnimationFrame(() => {
            areaTransitionContainer.style.opacity = '1';
        });
    });

    let transitionFinished = false;
    const onFinish = () => {
        if (transitionFinished) return;
        transitionFinished = true;
        
        // ===== 关键修改：在淡出期间预加载Scene背景 =====
        hideAreaTransitionWithScenePreload(sceneInfo, callbackAfterTransition);
    };

    gifImg.onload = () => {
        // // console.log(`[VN面板-手机版-Features] Area transition GIF已加载: ${gifImg.src}`);
        // GIF加载完成后，添加淡入和缩放动画
        requestAnimationFrame(() => {
            gifImg.style.opacity = '1';
            gifImg.style.transform = 'scale(1)';
        });
        setTimeout(onFinish, AREA_TRANSITION_DURATION);
    };
    
    gifImg.onerror = () => {
        console.warn(`[VN面板-手机版-Features] Area transition GIF加载失败: ${gifImg.src}，跳过过渡效果`);
        onFinish(); 
    };
    
    setTimeout(() => {
        if (!transitionFinished) {
            console.warn('[VN面板-手机版-Features] Area transition GIF加载超时，继续进行');
            onFinish();
        }
    }, 2000);
}


// ===== 新增函数：带Scene预加载的Area隐藏函数 =====
function hideAreaTransitionWithScenePreload(sceneInfo, callback) {
    // console.log('[VN面板-手机版-Features] 隐藏area transition（预加载Scene背景）', sceneInfo);
    
    if (areaTransitionContainer) {
        const gifImg = areaTransitionContainer.querySelector('#area-transition-gif');
        
        // ===== 关键：在淡出开始时立即预加载Scene背景 =====
        if (sceneInfo && sceneInfo.location) {
            // console.log('[VN面板-手机版-Features] 🏞️ 在Area淡出时预加载Scene背景:', sceneInfo.location);
            preloadSceneBackground(sceneInfo);
        }
        
        // 开始淡出动画
        areaTransitionContainer.style.opacity = '0';
        if (gifImg) {
            gifImg.style.opacity = '0';
            gifImg.style.transform = 'scale(0.9)';
        }
        
        // 等待淡出动画完成后再隐藏元素
        setTimeout(() => {
            areaTransitionContainer.style.display = 'none';
            if (gifImg) {
                gifImg.src = '';
                // 重置GIF样式为初始状态
                gifImg.style.opacity = '0';
                gifImg.style.transform = 'scale(0.9)';
            }
            // 重置容器透明度为初始状态
            areaTransitionContainer.style.opacity = '0';
            
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
        }, 800);
    } else {
        if (callback) callback();
    }
}

// ===== 新增函数：预加载Scene背景函数 =====
async function preloadSceneBackground(sceneInfo) {
    try {
        const vnData = window.VNCoreAPI.vnData;
        if (!vnData.sceneInfo) vnData.sceneInfo = {};
        
        // 更新场景信息
        if (sceneInfo.location) {
            vnData.sceneInfo.location = sceneInfo.location;
            vnData.sceneInfo._preloadedLocation = sceneInfo.location; // 标记为预加载
            
            // // console.log(`[VN面板-手机版-Features] 🎯 预加载场景背景: ${sceneInfo.location}`);
            
            // 立即加载背景
            if (window.VNCoreAPI?.updateBackground) {
                // 檢查是否剛應用了AI背景圖片
                if (backgroundImageState && 
                    backgroundImageState.lastAppliedTime && 
                    Date.now() - backgroundImageState.lastAppliedTime < 5000 && // 5秒內不覆蓋
                    backgroundImageState.appliedImageUrl && 
                    backgroundImageState.appliedImageUrl.includes('pollinations.ai')) {
                    // console.log('[VN面板-手机版-Features] AI背景圖片剛應用不久，跳過預加載背景更新:', backgroundImageState.appliedImageUrl);
                } else {
                    await window.VNCoreAPI.updateBackground();
                    // console.log('[VN面板-手机版-Features] ✅ Scene背景预加载完成');
                }
            }
        }
        
        // 预设其他场景信息（但不立即应用）
        if (sceneInfo.date) vnData.sceneInfo._preloadedDate = sceneInfo.date;
        if (sceneInfo.time) vnData.sceneInfo._preloadedTime = sceneInfo.time;
        
    } catch (error) {
        // console.error('[VN面板-手机版-Features] 预加载Scene背景失败:', error);
    }
}

/**
 * 强制清除所有角色立绘（用于场景切换）
 */
function forceCharacterExit() {
    // console.log('[VN面板-手机版-Features] 🎭 Scene切换，强制清除所有立绘');
    
    const characterCenter = window.VNCoreAPI?.characterCenter;
    if (!characterCenter) {
        console.warn('[VN面板-手机版-Features] characterCenter未找到');
        return;
    }
    
    const img = characterCenter.querySelector('img');
    if (img) {
        // console.log('[VN面板-手机版-Features] 找到立绘，执行退场动画');
        img.classList.add('character-image-exit');
        img.addEventListener('animationend', () => { 
            if (img.parentNode) {
                img.parentNode.removeChild(img);
                // console.log('[VN面板-手机版-Features] 立绘已移除');
            }
        }, { once: true });
    } else {
        // console.log('[VN面板-手机版-Features] 没有找到需要清除的立绘');
    }
    
    // 重置当前角色状态
    if (window.VNCoreAPI) {
        window.VNCoreAPI.currentCharacter = null;
        // console.log('[VN面板-手机版-Features] 当前角色状态已重置');
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

    // console.log('[VN面板-手机版-Features] Echo事件监听设置完成');
}

function handleEchoDialogue(dialogue) {
    // console.log('[VN面板-手机版-Features] 处理Echo对话:', dialogue);

    if (!echoModalContainerEl) {
        // console.error('[VN面板-手机版-Features] Echo模态窗口容器未找到');
        window.VNCoreAPI.nextDialogue();
        return;
    }
    if (!echoIframeEl) {
        // console.error('[VN面板-手机版-Features] Echo iframe元素未找到');
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

    // 🔥 新增：顯示啟動頁面，隱藏echo內容
    const startupScreen = document.getElementById('echoStartupScreen');
    const echoIframe = document.getElementById('echo-iframe');
    const dialogFooter = document.getElementById('echoDialogFooter');
    
    if (startupScreen) startupScreen.style.display = 'flex';
    if (echoIframe) echoIframe.style.display = 'none';
    if (dialogFooter) dialogFooter.style.display = 'none';

    echoModalContainerEl.classList.add('active');
    // console.log('[VN面板-手机版-Features] Echo模态窗口已显示（啟動頁面模式）');

    // 🔥 新增：設置echo數據，等待用戶解鎖
    currentEchoState.echoData = {
        dialogue: dialogue, 
        echoId: dialogue.echoId,
        content: dialogue.content, 
        rawParams: dialogue.rawParams,
        isEchoSection: dialogue.isEchoSection,
        echoSectionLines: dialogue.echoSectionLines
    };

    if (dialogue.soundEffect) {
        window.VNFeatures.playSound(dialogue.soundEffect);
    } else {
        window.VNFeatures.playSound('messageSound'); 
    }
}

function closeEchoDialog() {
    if (currentEchoState.isClosing) {
        // console.log('[VN面板-手机版-Features] Echo对话框已在关闭中');
        return;
    }
    currentEchoState.isClosing = true;
    currentEchoState.completed = true; 
    // console.log('[VN面板-手机版-Features] 开始关闭Echo对话框序列（标记为已完成）');

    if (echoModalContainerEl) {
        echoModalContainerEl.classList.remove('active');
        // console.log('[VN面板-手机版-Features] Echo模态窗口已关闭');
        
        // 🔥 新增：重置啟動頁面狀態
        const startupScreen = document.getElementById('echoStartupScreen');
        const sliderThumb = document.getElementById('echoStartupSliderThumb');
        
        if (startupScreen) {
            startupScreen.style.display = 'flex';
            startupScreen.classList.remove('unlocked');
        }
        if (sliderThumb) {
            sliderThumb.style.left = '3px';
        }
        
        // 🔥 移除重置iframe src的邏輯，避免觸發loading頁面
        // if (echoIframeEl) {
        //     echoIframeEl.src = 'about:blank'; 
        // }
        window.VNFeatures.playSound('callEndSound'); 
    }

    const wasCompleted = currentEchoState.completed; 

    const resetAndProceed = () => {
        if (wasCompleted) { 
            // console.log('[VN面板-手机版-Features] Echo完成，继续VN剧情');
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
                    // console.error('[VN面板-手机版-Features] 执行nextDialogue时出错:', error);
                }

                currentEchoState = { 
                    isActive: false,
                    isClosing: false,
                    dialogue: null,
                    completed: false
                };
                // console.log('[VN面板-手机版-Features] Echo状态完全重置，锁定释放');
            }, 200); 
        } else {
            currentEchoState = { isActive: false, isClosing: false, dialogue: null, completed: false };
            // console.log('[VN面板-手机版-Features] Echo对话框关闭（未完成），状态重置，锁定释放');
        }
    };
    setTimeout(resetAndProceed, echoModalContainerEl ? 100 : 0);
}

// =======================================================================
//                            Item物品展示系统
// =======================================================================

function handleItemDialogue(dialogue) {
    // console.log('[VN面板-手机版-Features] 处理Item对话:', dialogue);

    if (!itemModalContainerEl) {
        // console.error('[VN面板-手机版-Features] Item模态窗口容器未找到');
        window.VNCoreAPI.nextDialogue();
        return;
    }
    
    const dialogBoxGlobalRef = window.VNCoreAPI.dialogBoxGlobalRef;
    const nameTag = window.VNCoreAPI.nameTag;

    if (dialogBoxGlobalRef) dialogBoxGlobalRef.style.display = 'none';
    if (nameTag) nameTag.style.display = 'none';

    // 设置物品信息
    if (itemImageEl) {
        // 调试：检查物品数据
         console.log('[VN面板-手机版-Features] 物品数据检查:', {
            itemName: dialogue.itemName,
            itemUserCustomImageUrl: dialogue.itemUserCustomImageUrl,
            itemAiImageUrl: dialogue.itemAiImageUrl,
            itemFallbackUrl: dialogue.itemFallbackUrl,
            itemImageUrl: dialogue.itemImageUrl
        });
        
        // 按優先級選擇圖片：用戶自定義 > AI生成 > 備用圖片
        let imageUrl = null;
        let imageSource = '';
        
        // 按優先級選擇圖片：用戶自定義 > AI生成 > 備用圖片
        if (dialogue.itemUserCustomImageUrl) {
            imageUrl = dialogue.itemUserCustomImageUrl;
            imageSource = '用戶自定義';
        } else if (dialogue.itemAiImageUrl) {
            imageUrl = dialogue.itemAiImageUrl;
            imageSource = 'AI生成';
        } else {
            // 如果沒有AI圖片，嘗試從緩存中獲取
            if (window.VNCoreAPI && window.VNCoreAPI.getItemCache) {
                try {
                    const cachedItem = window.VNCoreAPI.getItemCache(dialogue.itemName);
                    if (cachedItem && cachedItem.itemUrls && cachedItem.itemUrls.aiImageUrl) {
                        imageUrl = cachedItem.itemUrls.aiImageUrl;
                        imageSource = 'AI生成(緩存)';
                        console.log(`[VN面板-手机版-Features] 從緩存獲取AI圖片: ${dialogue.itemName} -> ${imageUrl}`);
                    } else {
                        // 如果緩存中沒有AI圖片，先顯示備用圖片，然後等待AI圖片生成完成
                        imageUrl = dialogue.itemFallbackUrl;
                        imageSource = '備用圖片(等待AI)';
                        // // console.log(`[VN面板-手机版-Features] 先顯示備用圖片，等待AI圖片生成: ${dialogue.itemName}`);
                        
                        // 設置一個定時器，每500ms檢查一次緩存，最多等待5秒
                        let checkCount = 0;
                        const maxChecks = 10; // 5秒
                        const checkInterval = setInterval(() => {
                            checkCount++;
                            try {
                                const updatedCachedItem = window.VNCoreAPI.getItemCache(dialogue.itemName);
                                if (updatedCachedItem && updatedCachedItem.itemUrls && updatedCachedItem.itemUrls.aiImageUrl) {
                                    // // console.log(`[VN面板-手机版-Features] AI圖片已生成，切換到AI圖片: ${dialogue.itemName} -> ${updatedCachedItem.itemUrls.aiImageUrl}`);
                                    itemImageEl.src = updatedCachedItem.itemUrls.aiImageUrl;
                                    clearInterval(checkInterval);
                                } else if (checkCount >= maxChecks) {
                                    // // console.log(`[VN面板-手机版-Features] 等待超時，繼續使用備用圖片: ${dialogue.itemName}`);
                                    clearInterval(checkInterval);
                                }
                            } catch (error) {
                                console.warn(`[VN面板-手机版-Features] 檢查緩存失敗: ${dialogue.itemName}`, error);
                                if (checkCount >= maxChecks) {
                                    clearInterval(checkInterval);
                                }
                            }
                        }, 500);
                    }
                } catch (error) {
                    console.warn(`[VN面板-手机版-Features] 獲取緩存失敗: ${dialogue.itemName}`, error);
                    imageUrl = dialogue.itemFallbackUrl;
                    imageSource = '備用圖片';
                }
            } else {
                imageUrl = dialogue.itemFallbackUrl;
                imageSource = '備用圖片';
            }
        }
        
        // // console.log(`[VN面板-手机版-Features] 選擇${imageSource}圖片: ${imageUrl}`);
        itemImageEl.src = imageUrl;
        
        itemImageEl.onerror = function() {
            // // console.log(`[VN面板-手机版-Features] ${imageSource}圖片加載失敗，嘗試下一個優先級`);
            
            // 按優先級嘗試下一個圖片源
            if (imageSource === '用戶自定義') {
                if (dialogue.itemAiImageUrl) {
                    itemImageEl.src = dialogue.itemAiImageUrl;
                    imageSource = 'AI生成';
                } else {
                    itemImageEl.src = dialogue.itemFallbackUrl;
                    imageSource = '備用圖片';
                }
            } else if (imageSource === 'AI生成') {
                itemImageEl.src = dialogue.itemFallbackUrl;
                imageSource = '備用圖片';
            } else {
                // console.log('[VN面板-手机版-Features] 所有圖片源都失敗了');
            }
        };
        
        // 記錄圖片來源
        // // console.log(`[VN面板-手机版-Features] 使用${imageSource}物品圖片:`, imageUrl);
    }
    
    if (itemNameEl) itemNameEl.textContent = dialogue.itemName;
    if (itemDescriptionEl) itemDescriptionEl.textContent = dialogue.itemDescription;

    itemModalContainerEl.classList.add('active');
    // console.log('[VN面板-手机版-Features] Item模态窗口已显示');

    // 播放音效
    if (window.VNFeatures?.playSound) {
        window.VNFeatures.playSound('itemGetSound');
    }
}

function closeItemDialog() {
    // console.log('[VN面板-手机版-Features] 关闭Item对话框');
    
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
        // console.log('[VN面板-手机版-Features] Item对话框已关闭，继续下一个对话');
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

    // console.log('[VN面板-手机版-Features] Item事件监听设置完成');
}

// =======================================================================
//                            指令系統 (使用官方API)
// =======================================================================

function setupCommandSystemListeners() {
    // console.log('[VN面板-手机版-Features] 开始设置指令系统监听器...');
    
    // 先加载保存的指令类型
    const loaded = loadCommandTypesFromStorage();
    if (loaded) {
        // console.log('[VN面板-手机版-Features] 已恢复保存的指令类型');
    }
    
    // 确保DOM元素引用已初始化
    if (!commandTypeSelect) {
        commandTypeSelect = document.getElementById('commandTypeSelect');
    }
    
    // 如果加载了保存的类型并且DOM元素存在，更新UI
    if (loaded && commandTypeSelect) {
        // console.log('[VN面板-手机版-Features] 更新指令类型下拉选择器');
        updateCommandTypeSelect();
    }
    
    if (!commandButton) {
        // console.error('[VN面板-手机版-Features] commandButton元素未找到');
        commandButton = document.getElementById('command-button');
        if (!commandButton) {
            // console.error('[VN面板-手机版-Features] commandButton重试后仍未找到');
            return;
        }
    }
    
    if (!commandInputModal) {
        // console.error('[VN面板-手机版-Features] commandInputModal元素未找到');
        return;
    }

    // console.log('[VN面板-手机版-Features] 设置指令按钮点击事件...');
    
    const newCommandButton = commandButton.cloneNode(true);
    if (commandButton.parentNode) {
        commandButton.parentNode.replaceChild(newCommandButton, commandButton);
        commandButton = newCommandButton;
    }

    commandButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // console.log('[VN面板-手机版-Features] 指令按钮被点击');
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
                // console.log('[VN面板-手机版-Features] 关闭指令对话框');
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
            // console.log('[VN面板-手机版-Features] 提交指令按钮被点击');
            window.VNFeatures.playSound('choiceSelectSound');
            submitCommand();
        });
    }

    if (commandTypeSelect) {
        commandTypeSelect.addEventListener('change', () => {
            commandSystemState.currentCommandType = commandTypeSelect.value;
        });
    }

    if (commandInputTextarea) {
        // 移除了预览更新的监听器
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

    // console.log('[VN面板-手机版-Features] 指令系统监听器设置完成');
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
    // console.log('[VN面板-手机版-Features] 尝试显示指令输入对话框...');
    
    if (!commandInputModal) {
        // console.error('[VN面板-手机版-Features] commandInputModal未找到');
        return;
    }
    
    if (!commandInputTextarea) {
        // console.error('[VN面板-手机版-Features] commandInputTextarea未找到');
        return;
    }
    
    // 确保指令类型选择器是最新的
    updateCommandTypeSelect();
    
    commandSystemState.isCommandModalOpen = true;
    window.VNFeatures.hideLoadingAnimation();
    
    commandInputTextarea.value = '';
    commandInputModal.classList.add('modal-active');
    
    setTimeout(() => {
        commandInputTextarea.focus();
        // console.log('[VN面板-手机版-Features] 指令输入对话框已显示并聚焦');
    }, 100);
}

function closeCommandInputDialog() {
    if (!commandInputModal) return;
    
    commandSystemState.isCommandModalOpen = false;
    commandInputModal.classList.remove('modal-active');
    // console.log('[VN面板-手机版-Features] 指令输入对话框已关闭');
}



function submitCommand() {
    // console.log('[VN面板-手机版-Features] submitCommand被调用');
    
    if (!commandTypeSelect || !commandInputTextarea) {
        // console.error('[VN面板-手机版-Features] 缺少必要的DOM元素');
        return;
    }
    
    if (commandSystemState.isSending) {
        // console.log('[VN面板-手机版-Features] 指令正在发送中，忽略重复请求');
        return;
    }
    
    const commandType = commandTypeSelect.value;
    const commandContent = commandInputTextarea.value.trim();
    
    // console.log('[VN面板-手机版-Features] 指令类型:', commandType, '指令内容:', commandContent);
    
    if (!commandContent) {
        alert('请输入指令内容');
        return;
    }

    const commandMessage = `<Request: ${commandType}: ${commandContent} >`;
    // console.log('[VN面板-手机版-Features] 准备发送指令:', commandMessage);

    commandSystemState.isSending = true;
    
    closeCommandInputDialog();
    // console.log('[VN面板-手机版-Features] 指令已提交，显示loading动画');
    window.VNFeatures.showLoadingAnimation();

    sendCommandToChat(commandMessage);
}

async function sendCommandToChat(commandMessage) {
    // console.log('[VN面板-手机版-Features] sendCommandToChat被调用:', commandMessage);
    // console.log('[VN面板-手机版-Features] 当前发送状态:', commandSystemState.isSending);
    
    if (!commandSystemState.isSending) {
        console.warn('[VN面板-手机版-Features] 发送状态异常，重新设置为发送中');
        commandSystemState.isSending = true;
    }
    
    try {
        // === 立即清理UI：隱藏按鈕和backdrop (和繼續劇情按鈕相同) ===
        // console.log('[VN面板-手机版-Features] 清理繼續劇情UI');
        
        // 1. 恢復對話框顯示
        const dialogBox = document.querySelector('.dialog-box');
        if (dialogBox) {
            dialogBox.style.visibility = '';
            // console.log('[VN面板-手机版-Features] 已恢復對話框顯示');
        }
        
        // 2. 隱藏backdrop遮罩
        const backdrop = document.querySelector('.continue-story-backdrop');
        if (backdrop) {
            backdrop.classList.add('hide');
            setTimeout(() => { 
                if (backdrop.parentNode) {
                    backdrop.parentNode.removeChild(backdrop);
                    // console.log('[VN面板-手机版-Features] 已移除backdrop遮罩');
                }
            }, 350);
        }
        
        // 3. 移除actions bar (包含按鈕的容器)
        const actionsBar = document.querySelector('.continue-story-actions-bar');
        if (actionsBar) {
            actionsBar.remove();
            // console.log('[VN面板-手机版-Features] 已移除actions bar');
        }
        
        // === 第1步：發送指令消息到聊天室 ===
        // console.log('[VN面板-手机版-Features] 第1步：發送指令消息到聊天室:', commandMessage);
        
        // 方法1：使用官方API - createChatMessages (和繼續劇情按鈕相同)
        if (window.top?.TavernHelper?.createChatMessages) {
            // console.log('[VN面板-手机版-Features] 使用官方API createChatMessages发送指令');
            
            await window.top.TavernHelper.createChatMessages(
                [{
                    role: 'user',
                    name: '{{user}}',
                    message: commandMessage
                }],
                { refresh: 'affected' }
            );
            
            // console.log('[VN面板-手机版-Features] 指令消息已通过官方API发送');
            
        } else {
            // 方法2：備用方法
            console.warn('[VN面板-手机版-Features] 官方API不可用，使用備用方法發送指令消息');
            const stInput = window.parent.document.querySelector('#send_textarea');
            const sendButton = window.parent.document.querySelector('#send_but');
            
            if (stInput && sendButton) {
                stInput.value = commandMessage;
                stInput.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => sendButton.click(), 100);
                // console.log('[VN面板-手机版-Features] 指令消息已通过備用方法发送');
            } else {
                // console.error('[VN面板-手机版-Features] 无法找到聊天输入框或发送按钮');
                throw new Error('无法發送指令消息到聊天室');
            }
        }
        
        // 等待消息發送完成
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // === 第2步：觸發AI執行 (和繼續劇情按鈕相同) ===
        // console.log('[VN面板-手机版-Features] 第2步：觸發小說家AI');
        
        // 方法1：使用官方API
        if (window.top?.TavernHelper?.triggerSlash) {
            // console.log('[VN面板-手机版-Features] 使用官方API执行trigger命令');
            await window.top.TavernHelper.triggerSlash('/send 繼續劇情');
            // console.log('[VN面板-手机版-Features] trigger命令已发送');
            
        } else {
            // 方法2：備用方法
            console.warn('[VN面板-手机版-Features] 官方API不可用，使用备用方法');
            const stInput = window.parent.document.querySelector('#send_textarea');
            const sendButton = window.parent.document.querySelector('#send_but');
            
            if (stInput && sendButton) {
                stInput.value = '/send 繼續劇情';
                stInput.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => sendButton.click(), 100);
                // console.log('[VN面板-手机版-Features] trigger命令已通过备用方法发送');
            } else {
                // console.error('[VN面板-手机版-Features] 无法找到聊天输入框或发送按钮');
                throw new Error('无法启动小说家AI');
            }
        }
        
        // console.log('[VN面板-手机版-Features] 完整指令流程執行完成');
        
    } catch (error) {
        // console.error('[VN面板-手机版-Features] 指令流程執行失敗:', error);
        
        // 發生錯誤時隱藏loading動畫
        if (window.VNFeatures?.hideLoadingAnimation) {
            window.VNFeatures.hideLoadingAnimation();
        }
        
        alert('發送指令時出現錯誤，請重試。');
        
    } finally {
        // 確保狀態重置
        setTimeout(() => {
            commandSystemState.isSending = false;
            // console.log('[VN面板-手机版-Features] 指令發送狀態已重置');
        }, 1500);
    }
}

/**
 * 清理繼續劇情UI：隱藏backdrop和按鈕，恢復對話框 (和繼續劇情按鈕相同的邏輯)
 */
function cleanupContinueStoryUI() {
    // console.log('[VN面板-手机版-Features] 清理繼續劇情UI');
    
    // 1. 恢復對話框顯示
    const dialogBox = document.querySelector('.dialog-box');
    if (dialogBox) {
        dialogBox.style.visibility = '';
        // console.log('[VN面板-手机版-Features] 已恢復對話框顯示');
    }
    
    // 2. 隱藏backdrop遮罩
    const backdrop = document.querySelector('.continue-story-backdrop');
    if (backdrop) {
        backdrop.classList.add('hide');
        setTimeout(() => { 
            if (backdrop.parentNode) {
                backdrop.parentNode.removeChild(backdrop);
                // console.log('[VN面板-手机版-Features] 已移除backdrop遮罩');
            }
        }, 350);
    }
    
    // 3. 移除actions bar (包含按鈕的容器)
    const actionsBar = document.querySelector('.continue-story-actions-bar');
    if (actionsBar) {
        actionsBar.remove();
        // console.log('[VN面板-手机版-Features] 已移除actions bar');
    }
}


/**
 * 第2步：觸發AI執行 (和繼續劇情按鈕相同的startNovelistAI)
 */
async function triggerAI() {
    try {
        // console.log('[VN面板-手机版-Features] 第2步：觸發小說家AI');
        
        // 方法1：使用官方API
        if (window.top?.TavernHelper?.triggerSlash) {
            // console.log('[VN面板-手机版-Features] 使用官方API执行trigger命令');
            await window.top.TavernHelper.triggerSlash('/send 繼續劇情');
            // console.log('[VN面板-手机版-Features] trigger命令已发送');
            
        } else {
            // 方法2：備用方法
            console.warn('[VN面板-手机版-Features] 官方API不可用，使用备用方法');
            const stInput = window.parent.document.querySelector('#send_textarea');
            const sendButton = window.parent.document.querySelector('#send_but');
            
            if (stInput && sendButton) {
                stInput.value = '/send 繼續劇情';
                stInput.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => sendButton.click(), 100);
                // console.log('[VN面板-手机版-Features] trigger命令已通过备用方法发送');
            } else {
                // console.error('[VN面板-手机版-Features] 无法找到聊天输入框或发送按钮');
                throw new Error('无法启动小说家AI');
            }
        }
        
    } catch (error) {
        // console.error('[VN面板-手机版-Features] 启动小说家AI失败:', error);
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
    // console.log('[VN面板-手机版-Features] 添加指令类型对话框已打开');
}

function closeAddCommandTypeDialog() {
    if (!addCommandTypeModal) return;
    
    addCommandTypeModal.classList.remove('modal-active');
    // console.log('[VN面板-手机版-Features] 添加指令类型对话框已关闭');
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
    commandSystemState.currentCommandType = newType;
    closeAddCommandTypeDialog();
    
    // 保存到本地存储
    saveCommandTypesToStorage();
    
    // console.log('[VN面板-手机版-Features] 新增指令类型:', newType);
    
    // 显示保存成功提示
    if (window.VNFeatures?.showNotification) {
        window.VNFeatures.showNotification(`指令类型"${newType}"已保存`, 'success');
    }
}

function updateCommandTypeSelect() {
    if (!commandTypeSelect) {
        console.warn('[VN面板-手机版-Features] commandTypeSelect元素未找到，无法更新下拉选择器');
        return;
    }
    
    // console.log('[VN面板-手机版-Features] 更新指令类型选择器，当前类型:', commandSystemState.commandTypes);
    
    commandTypeSelect.innerHTML = '';
    commandSystemState.commandTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        commandTypeSelect.appendChild(option);
        // console.log('[VN面板-手机版-Features] 添加选项:', type);
    });
    
    // 确保当前选中的类型状态正确
    if (commandTypeSelect.value) {
        commandSystemState.currentCommandType = commandTypeSelect.value;
    }
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
            // console.log("[VN面板-手机版-Features] Area transition被ESC键隐藏");
        });
    }
}

// =======================================================================
//                            模塊初始化
// =======================================================================

function initVNSpecialFeatures() {
    // console.log('[VN面板-手机版-Features] 初始化特殊功能模块...');
    
    initVNFeaturesElements();
    createTransitionElement();
    setupEchoEventListeners();
    setupItemEventListeners();
    setupCommandSystemListeners();
    setupCollapseListeners();
    createAreaTransitionElement();
    setupMessageListeners();
    setupEchoStartupListeners();
    
    // console.log('[VN面板-手机版-Features] 特殊功能已初始化');
}

// 🔥 新增：設置消息監聽器
function setupMessageListeners() {
    window.addEventListener('message', function(event) {
        if (!event.data || !event.data.type) return;
        
        switch (event.data.type) {
            case 'ECHO_USER_COMMENT':
                // console.log('[VN面板-手机版-Features] 收到Echo用戶評論');
                handleEchoUserComment(event.data.data);
                break;
        }
    });
    
    // console.log('[VN面板-手机版-Features] 消息監聽器已設置');
}

// 🔥 新增：設置Echo啟動頁面事件監聽器
function setupEchoStartupListeners() {
    const startupScreen = document.getElementById('echoStartupScreen');
    const sliderThumb = document.getElementById('echoStartupSliderThumb');
    const sliderTrack = startupScreen?.querySelector('.echo-startup-slider-track');
    
    if (!startupScreen || !sliderThumb || !sliderTrack) {
        console.warn('[VN面板-手机版-Features] Echo啟動頁面元素未找到');
        return;
    }
    
    let isDragging = false;
    let startX = 0;
    let currentX = 0;
    
    // 獲取軌道寬度
    const getTrackWidth = () => sliderTrack.offsetWidth;
    const thumbWidth = 39;
    const getMaxSlideDistance = () => getTrackWidth() - thumbWidth - 6;
    
    // 滑鼠事件
    sliderThumb.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
    
    // 觸摸事件
    sliderThumb.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', endDrag);
    
    // 點擊事件（點擊滑塊也可以開始拖動）
    sliderThumb.addEventListener('click', (e) => {
        if (!isDragging) {
            startDrag(e);
        }
    });
    
    function startDrag(e) {
        // console.log('[VN面板-手机版-Features] 開始拖動');
        isDragging = true;
        const rect = sliderThumb.getBoundingClientRect();
        startX = (e.type === 'mousedown' ? e.clientX : e.touches[0].clientX) - rect.left;
        sliderThumb.classList.add('dragging');
        e.preventDefault();
    }
    
    function drag(e) {
        if (!isDragging) return;
        
        const maxSlideDistance = getMaxSlideDistance();
        currentX = (e.type === 'mousemove' ? e.clientX : e.touches[0].clientX) - startX;
        currentX = Math.max(3, Math.min(currentX, maxSlideDistance));
        
        sliderThumb.style.left = currentX + 'px';
        
        // 添加動態效果：根據滑動距離改變透明度和進度條
        const progress = currentX / maxSlideDistance;
        sliderThumb.style.transform = `scale(${1 + progress * 0.1})`;
        
        // 更新進度條
        sliderTrack.style.setProperty('--progress', progress);
        sliderTrack.style.setProperty('--progress-width', (progress * 100) + '%');
        
        e.preventDefault();
    }
    
    function endDrag() {
        if (!isDragging) return;
        
        // console.log('[VN面板-手机版-Features] 結束拖動，當前位置:', currentX);
        isDragging = false;
        sliderThumb.classList.remove('dragging');
        
        const maxSlideDistance = getMaxSlideDistance();
        
        // 檢查是否滑動到解鎖位置
        if (currentX >= maxSlideDistance * 0.8) {
            // console.log('[VN面板-手机版-Features] 達到解鎖閾值，觸發解鎖');
            unlockEcho();
        } else {
            // 回到原位，添加動畫效果
            // console.log('[VN面板-手机版-Features] 未達到閾值，回到原位');
            sliderThumb.style.transition = 'all 0.3s ease';
            sliderThumb.style.left = '3px';
            sliderThumb.style.transform = 'scale(1)';
            
            // 重置進度條
            sliderTrack.style.setProperty('--progress', '0');
            sliderTrack.style.setProperty('--progress-width', '0%');
            
            setTimeout(() => {
                sliderThumb.style.transition = '';
            }, 300);
        }
    }
    
    // console.log('[VN面板-手机版-Features] Echo啟動頁面事件監聽器已設置');
}

// 🔥 新增：解鎖Echo功能
function unlockEcho() {
    // console.log('[VN面板-手机版-Features] 用戶解鎖Echo，觸發echo處理器');
    
    // 播放解鎖音效
    window.VNFeatures.playSound('messageSound');
    
    // 隱藏啟動頁面
    const startupScreen = document.getElementById('echoStartupScreen');
    const echoIframe = document.getElementById('echo-iframe');
    const dialogFooter = document.getElementById('echoDialogFooter');
    
    if (startupScreen) {
        startupScreen.classList.add('unlocked');
        setTimeout(() => {
            startupScreen.style.display = 'none';
        }, 500);
    }
    
    // 顯示echo內容
    if (echoIframe) echoIframe.style.display = 'block';
    if (dialogFooter) dialogFooter.style.display = 'flex';
    
    // 🔥 新增：觸發echo處理器（類似查看歷史劇情按鈕的邏輯）
    triggerEchoProcessor();
    
    // 加載echo iframe
    const echoSrc = '/預留/echo/echo_panel.html';
    echoIframeEl.src = echoSrc;
    
    echoIframeEl.onload = function() {
        // console.log('[VN面板-手机版-Features] Echo iframe已加載');
        
        // 發送echo數據到iframe
        if (echoIframeEl.contentWindow && currentEchoState.echoData) {
            echoIframeEl.contentWindow.postMessage({
                type: 'ECHO_DATA',
                data: currentEchoState.echoData
            }, '*');
            
            // 觸發echo處理器
            echoIframeEl.contentWindow.postMessage({
                type: 'ECHO_IFRAME_READY'
            }, '*');
            
            // 同時發送到酒館AI主環境
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'ECHO_DATA',
                    data: currentEchoState.echoData
                }, '*');
                // console.log('[VN面板-手机版-Features] 已向酒館AI主環境發送ECHO_DATA');
            }
        }
    };
    
    echoIframeEl.onerror = function() {
        // console.error('[VN面板-手机版-Features] Echo iframe加載失敗');
        closeEchoDialog();
    };
}

// 🔥 新增：觸發echo處理器的核心函數（參考查看歷史劇情按鈕邏輯）
function triggerEchoProcessor() {
    // console.log('[VN面板-手机版-Features] 觸發echo處理器');
    
    // 🔥 移除顯示加載動畫，因為echo處理器不需要長時間處理
    // if (window.VNFeatures?.showLoadingAnimation) {
    //     window.VNFeatures.showLoadingAnimation();
    // }
    
    // 發送請求到echo處理器
    const success = sendMessageToEchoProcessor({
        type: 'ECHO_PROCESSOR_TRIGGER',
        source: 'VN_PANEL_ECHO_UNLOCK_BUTTON',
        data: currentEchoState.echoData,
        timestamp: Date.now()
    });
    
    if (!success) {
        // console.error('[VN面板-手机版-Features] 發送echo處理器請求失敗');
        // 可以選擇顯示錯誤提示
    }
}

// 🔥 新增：發送消息到echo處理器的核心函數
function sendMessageToEchoProcessor(messageData) {
    try {
        // 方法1：直接調用頂級窗口的echo處理器
        if (window.top && window.top.EchoProcessor) {
            const event = {
                data: messageData,
                source: window
            };
            
            if (typeof window.top.EchoProcessor.handleMessageFromVNPanel === 'function') {
                // // console.log(`[VN面板-手机版-Features] 通過直接調用發送消息到echo處理器: ${messageData.type}`);
                window.top.EchoProcessor.handleMessageFromVNPanel(event);
                return true;
            }
        }

        // 方法2：使用postMessage作為備用
        console.warn(`[VN面板-手机版-Features] 使用postMessage備用方法發送到echo處理器`);
        
        if (window.top && window.top !== window) {
            window.top.postMessage(messageData, '*');
            return true;
        } else if (window.parent && window.parent !== window) {
            window.parent.postMessage(messageData, '*');
            return true;
        }
        
        return false;

    } catch (error) {
        console.error(`[VN面板-手机版-Features] 發送消息到echo處理器出錯:`, error);
        return false;
    }
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
    
    // 指令类型存储管理
    saveCommandTypesToStorage,
    loadCommandTypesFromStorage,
    clearCommandTypesStorage,
    
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

// 🔥 新增：處理Echo用戶評論
function handleEchoUserComment(commentData) {
    try {
        // // console.log('[VN面板-手机版-Features] 處理Echo用戶評論:', commentData);
        
        // 構建用戶評論消息
        const userCommentMessage = buildUserCommentMessage(commentData);
        
        // 發送到酒館AI
        sendUserCommentToTavern(userCommentMessage);
        
    } catch (error) {
        // console.error('[VN面板-手机版-Features] 處理Echo用戶評論時出錯:', error);
    }
}

// 🔥 新增：構建用戶評論消息
function buildUserCommentMessage(commentData) {
    const currentTime = new Date().toLocaleTimeString('zh-TW', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    // 構建符合Echo格式的評論消息
    const commentLine = `#${commentData.comment.id}|${commentData.comment.author}|${commentData.comment.username}|${commentData.comment.content}|${commentData.comment.stats}|${currentTime}`;
    
    // 構建完整的Echo區塊，包含用戶評論
    const echoBlock = `<echo_section>
[echo_post_${commentData.postId}|用戶評論|@user|用戶在帖子${commentData.postId}下發表了評論|#用戶互動|❤️ 0 💬 0 🔁 0|${currentTime}]
${commentLine}
</echo_section>`;
    
    return echoBlock;
}

// 🔥 新增：發送用戶評論到酒館AI
async function sendUserCommentToTavern(commentMessage) {
    try {
        // 找到酒館AI主環境
        const tavernWindow = findTavernMainWindow();
        if (!tavernWindow) {
            // console.error('[VN面板-手机版-Features] 找不到酒館AI主環境');
            return false;
        }
        
        // 獲取必要的元素
        const elements = getTavernElements(tavernWindow);
        if (!elements) {
            // console.error('[VN面板-手机版-Features] 無法獲取酒館AI元素');
            return false;
        }
        
        // 發送消息
        await performSend(elements, commentMessage);
        // // console.log('[VN面板-手机版-Features] ✅ 用戶評論已成功發送到酒館AI');
        return true;
        
    } catch (error) {
        // // console.error('[VN面板-手机版-Features] 發送用戶評論到酒館AI失敗:', error);
        return false;
    }
}

// 🔥 新增：獲取酒館AI主環境
function findTavernMainWindow() {
    try {
        // 嘗試多種方式找到酒館AI窗口
        if (window.parent && window.parent !== window) {
            return window.parent;
        }
        
        if (window.top && window.top !== window) {
            return window.top;
        }
        
        // 如果當前窗口就是主環境
        if (typeof getLastMessageId === 'function') {
            return window;
        }
        
        return null;
    } catch (error) {
        // console.error('[VN面板-手机版-Features] 查找酒館AI主環境失敗:', error);
        return null;
    }
}

// 🔥 新增：獲取酒館AI元素
function getTavernElements(tavernWindow) {
    try {
        const doc = tavernWindow.document;
        
        // 獲取發送按鈕和輸入框
        const sendButton = doc.querySelector('#send_but');
        const messageInput = doc.querySelector('#send_textarea');
        
        if (!sendButton || !messageInput) {
            // console.error('[VN面板-手机版-Features] 找不到酒館AI發送元素');
            return null;
        }
        
        return { sendButton, messageInput };
        
    } catch (error) {
        // console.error('[VN面板-手机版-Features] 獲取酒館AI元素失敗:', error);
        return null;
    }
}

// 🔥 新增：執行發送操作
async function performSend(elements, message) {
    try {
        const { sendButton, messageInput } = elements;
        
        // 設置消息內容
        messageInput.value = message;
        
        // 觸發input事件
        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // 點擊發送按鈕
        sendButton.click();
        
        // console.log('[VN面板-手机版-Features] 消息已發送');
        
    } catch (error) {
        // console.error('[VN面板-手机版-Features] 執行發送操作失敗:', error);
        throw error;
    }
}

// 自动初始化（延迟执行确保DOM已加载）
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initVNSpecialFeatures();
    }, 600); // 延迟更长时间确保其他模块先初始化
});