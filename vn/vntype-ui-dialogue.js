/**
 * VN Type UI Dialogue - 手机版对话系统和UI模块 v20.1
 * 
 * 包含: 对话更新、打字机效果、选择系统、用户输入处理、UI功能
 */

// =======================================================================
//                    全局歷史窗口狀態管理器
// =======================================================================

/**
 * 全局歷史窗口狀態管理器
 * 統一管理VN面板的歷史窗口狀態，防止重複觸發和窗口衝突
 */
const VNHistoryWindowManager = {
    // 狀態標記
    isRequesting: false,           // 是否正在請求歷史數據
    isWindowOpen: false,           // 是否有歷史窗口正在顯示
    lastRequestTime: 0,            // 最後請求時間
    currentActiveWindow: null,     // 當前活動的窗口ID
    
    // 窗口ID常量
    WINDOW_IDS: {
        LANDING: 'vnHistoryChoiceModal',      // 啟動頁面歷史窗口
        MAIN: 'vnHistoryChoiceModalMain'      // 主容器歷史窗口
    },
    
    // 請求冷卻時間（毫秒）
    REQUEST_COOLDOWN: 2000,
    
    /**
     * 檢查是否可以發起新的歷史請求
     */
    canRequestHistory() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        // 檢查是否在冷卻期內
        if (this.isRequesting && timeSinceLastRequest < this.REQUEST_COOLDOWN) {
            console.log(`[VN歷史窗口管理器] 請求冷卻中，剩餘 ${this.REQUEST_COOLDOWN - timeSinceLastRequest}ms`);
            return false;
        }
        
        // 檢查是否有窗口正在顯示
        if (this.isWindowOpen) {
            console.log('[VN歷史窗口管理器] 歷史窗口已顯示，請先關閉現有窗口');
            return false;
        }
        
        return true;
    },
    
    /**
     * 開始歷史請求
     */
    startHistoryRequest(windowId) {
        if (!this.canRequestHistory()) {
            return false;
        }
        
        this.isRequesting = true;
        this.lastRequestTime = Date.now();
        this.currentActiveWindow = windowId;
        
        console.log(`[VN歷史窗口管理器] 開始歷史請求，窗口ID: ${windowId}`);
        return true;
    },
    
    /**
     * 完成歷史請求
     */
    completeHistoryRequest() {
        this.isRequesting = false;
        console.log('[VN歷史窗口管理器] 歷史請求完成');
    },
    
    /**
     * 打開歷史窗口
     */
    openHistoryWindow(windowId) {
        if (this.isWindowOpen) {
            console.warn(`[VN歷史窗口管理器] 嘗試打開窗口 ${windowId}，但已有窗口 ${this.currentActiveWindow} 正在顯示`);
            return false;
        }
        
        this.isWindowOpen = true;
        this.currentActiveWindow = windowId;
        
        console.log(`[VN歷史窗口管理器] 打開歷史窗口: ${windowId}`);
        return true;
    },
    
    /**
     * 關閉歷史窗口
     */
    closeHistoryWindow(windowId) {
        if (!this.isWindowOpen || this.currentActiveWindow !== windowId) {
            console.warn(`[VN歷史窗口管理器] 嘗試關閉窗口 ${windowId}，但當前活動窗口是 ${this.currentActiveWindow}`);
            return false;
        }
        
        this.isWindowOpen = false;
        this.currentActiveWindow = null;
        
        console.log(`[VN歷史窗口管理器] 關閉歷史窗口: ${windowId}`);
        return true;
    },
    
    /**
     * 強制重置所有狀態
     */
    forceReset() {
        this.isRequesting = false;
        this.isWindowOpen = false;
        this.currentActiveWindow = null;
        this.lastRequestTime = 0;
        
        console.log('[VN歷史窗口管理器] 強制重置所有狀態');
    },
    
    /**
     * 獲取當前狀態信息
     */
    getStatus() {
        return {
            isRequesting: this.isRequesting,
            isWindowOpen: this.isWindowOpen,
            currentActiveWindow: this.currentActiveWindow,
            timeSinceLastRequest: Date.now() - this.lastRequestTime
        };
    },
    
    /**
     * 檢查窗口是否應該顯示
     */
    shouldShowWindow(windowId) {
        return this.isWindowOpen && this.currentActiveWindow === windowId;
    },
    
    /**
     * 檢查窗口是否應該隱藏
     */
    shouldHideWindow(windowId) {
        return !this.isWindowOpen || this.currentActiveWindow !== windowId;
    }
};

// 將管理器暴露到全局，方便其他模塊使用
window.VNHistoryWindowManager = VNHistoryWindowManager;

// =======================================================================
//                            核心UI更新函數
// =======================================================================

function updateUI() { 
    updateDialogue(); 
    updateMailbox(); 
}

function updateDialogue() {
    canProceedToNext = false; 
    
    if (!vnData.dialogues?.length || currentDialogueIndex >= vnData.dialogues.length) { 
        if(dialogText && dialogText.textContent.includes("這裡是角色的對話內容...")) {
            dialogText.textContent = ''; 
        }
        if(typewriterCursor) typewriterCursor.style.display = 'none'; 
        if(textIndicator) textIndicator.style.display = 'block'; 
        updateChoices(); 
        return; 
    }
    
    const dialogue = vnData.dialogues[currentDialogueIndex];
    if (!dialogue) { 
        if (textIndicator) textIndicator.style.display = 'block'; 
        nextDialogue(); 
        return; 
    }
    
    // 更新对话计数显示
    const currentDialogueNumEl = document.getElementById('current-dialogue'); 
    const totalDialoguesNumEl = document.getElementById('total-dialogues'); 
    if(currentDialogueNumEl) currentDialogueNumEl.textContent = currentDialogueIndex + 1; 
    if(totalDialoguesNumEl) totalDialoguesNumEl.textContent = vnData.dialogues.length;
    
    // 处理特殊对话类型
    if (['area', 'scene', 'bgm', 'echo', 'chat', 'call', 'livestream', 'transition', 'item'].includes(dialogue.type)) { 
        if (window.VNFeatures?.handleSpecialDialogue) { 
            if (window.VNFeatures.handleSpecialDialogue(dialogue)) { 
                return; 
            } 
        } 
    }
    
    if (!dialogBoxGlobalRef) { 
        console.error("[VN面板-手机版] dialogBoxGlobalRef 未找到"); 
        return; 
    }
    
    // 显示对话框
    dialogBoxGlobalRef.style.display = 'flex'; 
    dialogBoxGlobalRef.classList.remove(CSS_HIDING, 'new-dialog'); 
    if (nameTag) nameTag.classList.remove(CSS_HIDING);
    
    stopTypewriter(); 
    addToDialogueHistory(dialogue);
    currentText = (dialogue.content || "").trim();
    
    // 額外清理：移除對話內容中可能殘留的[離開]標籤
    currentText = currentText.replace(/\[離開\]/g, '').trim();
    
    let currentTextWithMarkdown = window.processMarkdown ? 
        window.processMarkdown(currentText) : currentText;
    dialogBoxGlobalRef.style.backgroundColor = 'var(--dialog-bg)'; 
    let charNameText = '旁白'; 
    if(nameTag) nameTag.style.display = 'none'; 
    
    // 根据对话类型设置样式
    switch (dialogue.type) {
        case 'narrative':
            dialogBoxGlobalRef.style.backgroundColor = 'var(--narrative-bg)';
            dialogBoxGlobalRef.setAttribute('data-dialogue-type', 'narrative');
            break;
        case 'protagonist':
        case 'character':
            dialogBoxGlobalRef.setAttribute('data-dialogue-type', dialogue.type);
            if(nameTag) {
                nameTag.style.display = 'inline-block';
                // 修正：只在真正切换对话时播放动画，添加特殊类来触发动画
                nameTag.classList.add('show-animation');
                // 动画播放后移除类，避免重复触发
                setTimeout(() => {
                    if(nameTag) nameTag.classList.remove('show-animation');
                }, 400);
            }
            charNameText = dialogue.name || '未知';
            if (getCharacterImageUrlFn) {
                updateCharacterImageSimplified({
                    name: dialogue.name,
                    expression: dialogue.expression || '',
                    imgSrc: getCharacterImageUrlFn(dialogue.name, dialogue.expression)
                });
            }
            break;
        default:
            if (dialogue.name) {
                dialogBoxGlobalRef.setAttribute('data-dialogue-type', 'character');
                if(nameTag) {
                    nameTag.style.display = 'inline-block';
                    // 修正：只在真正切换对话时播放动画
                    nameTag.classList.add('show-animation');
                    // 动画播放后移除类，避免重复触发
                    setTimeout(() => {
                        if(nameTag) nameTag.classList.remove('show-animation');
                    }, 400);
                }
                charNameText = dialogue.name;
                if (getCharacterImageUrlFn) {
                    updateCharacterImageSimplified({
                        name: dialogue.name,
                        expression: dialogue.expression || '',
                        imgSrc: getCharacterImageUrlFn(dialogue.name, dialogue.expression)
                    });
                }
            } else {
                dialogBoxGlobalRef.setAttribute('data-dialogue-type', 'narrative');
            }
            break;
    }
    
    // 播放音效
    if (dialogue.soundEffect) playSoundEffects(dialogue.soundEffect);
    if(nameTag && nameTag.style.display !== 'none') nameTag.textContent = charNameText;
    
    // 设置对话文本
    if (dialogText) { 
        if (currentText && currentText.trim() && !(/^\[.*\]$/.test(currentText.trim()))) { 
            dialogText.textContent = ''; 
            startTypewriter(); 
        } else { 
            stopTypewriter(); 
            dialogText.innerHTML = currentTextWithMarkdown || 
                (window.processMarkdown ? window.processMarkdown('[空對話內容]') : '[空對話內容]'); 
            if(typewriterCursor) typewriterCursor.style.display = 'none'; 
            if(textIndicator) textIndicator.style.display = 'block'; 
            canProceedToNext = true; 
        } 
    } else { 
        console.error("[VN面板-手机版] dialogText 元素为null"); 
    }
    
    if (choicesContainer) choicesContainer.classList.add(CSS_HIDDEN); 
}

function nextDialogue() {
    if (window.VNFeatures?.stopAllSounds) window.VNFeatures.stopAllSounds();
    
    const dialogueJustFinished = vnData.dialogues?.[currentDialogueIndex];
    
    if (dialogueJustFinished && dialogueJustFinished.action === 'exit') { 
        handleCharacterExit(dialogueJustFinished); 
    }
    
    if (!vnData.dialogues || vnData.dialogues.length === 0) { 
        updateChoices(); 
        return; 
    }
    
    if (currentDialogueIndex < vnData.dialogues.length - 1) {
        // 🔥 修復：檢查對話框是否可見且不在隱藏動畫中
        const isDialogVisible = dialogBoxGlobalRef && 
                               dialogBoxGlobalRef.style.display !== 'none' && 
                               !dialogBoxGlobalRef.classList.contains('hiding');
        
        // 🔥 新增：檢查對話框是否處於穩定狀態
        const isDialogStable = dialogBoxGlobalRef && 
                              dialogBoxGlobalRef.style.visibility !== 'hidden' &&
                              dialogBoxGlobalRef.style.display === 'flex';
        
        if (isDialogVisible && isDialogStable) {
            // 對話框可見且穩定，執行正常的隱藏動畫
            // console.log('[VN面板-手机版] 對話框狀態穩定，執行正常動畫');
            dialogBoxGlobalRef.classList.add('hiding'); 
            if (nameTag) nameTag.classList.add('hiding');
            
            dialogBoxGlobalRef.addEventListener('animationend', function handleNextAnimEnd() { 
                dialogBoxGlobalRef.removeEventListener('animationend', handleNextAnimEnd); 
                currentDialogueIndex++; 
                updateDialogue(); 
            }, { once: true });
        } else { 
            // 🔥 修復：對話框不可見或不穩定時，直接進入下一個對話，不執行動畫
            // console.log('[VN面板-手机版] 對話框狀態不穩定，直接進入下一個對話');
            // console.log('[VN面板-手机版] 對話框可見性:', isDialogVisible);
            // console.log('[VN面板-手机版] 對話框穩定性:', isDialogStable);
            
            // 🔥 新增：確保對話框狀態正確後再繼續
            if (dialogBoxGlobalRef) {
                dialogBoxGlobalRef.style.display = 'flex';
                dialogBoxGlobalRef.style.visibility = 'visible';
                dialogBoxGlobalRef.classList.remove('hiding');
                // console.log('[VN面板-手机版] 已修正對話框狀態');
            }
            
            currentDialogueIndex++; 
            updateDialogue(); 
        }
    } else {
        currentDialogueIndex = vnData.dialogues.length; 
        if (dialogText) dialogText.textContent = ''; 
        if (nameTag) nameTag.textContent = ''; 
        
        if (dialogBoxGlobalRef && (dialogueJustFinished?.type === 'narrative' || 
            dialogueJustFinished?.type === 'protagonist' || dialogueJustFinished?.type === 'character')) { 
            dialogBoxGlobalRef.style.display = 'none'; 
        }
        if (nameTag && (dialogueJustFinished?.type === 'narrative' || 
            dialogueJustFinished?.type === 'protagonist' || dialogueJustFinished?.type === 'character')) { 
            nameTag.style.display = 'none'; 
        }
        updateChoices();
    }
}

// =======================================================================
//                            打字機效果函數
// =======================================================================

function startTypewriter() { 
    if (!dialogText || !typewriterCursor || !textIndicator) return; 
    
    if(dialogBoxGlobalRef) dialogBoxGlobalRef.classList.remove(CSS_HIDING); 
    if(nameTag && dialogBoxGlobalRef?.style.display !== 'none') nameTag?.classList.remove(CSS_HIDING); 
    
    canProceedToNext = false; 
    let useMarkdown = typeof window.processMarkdown === 'function' && currentText; 
    let plainText = currentText.trim(); 
    let processedHtml = null; 
    
    if (useMarkdown) { 
        processedHtml = window.processMarkdown(currentText.trim()); 
        const tempDiv = document.createElement('div'); 
        tempDiv.innerHTML = processedHtml; 
        plainText = (tempDiv.textContent || currentText).trim(); 
    }
    
    dialogText.textContent = ''; 
    currentCharIndex = 0; 
    isTyping = true; 
    typewriterCursor.style.display = 'none'; 
    textIndicator.style.display = 'none'; 
    
    // 新增：添加打字状态类
    if (dialogContent) {
        dialogContent.classList.add('typing');
        dialogContent.classList.remove('typing-complete');
        
        // 检查文本长度决定是否需要滚动
        if (plainText.length > 100) { // 可根据需要调整阈值
            dialogContent.classList.add('has-scroll');
        } else {
            dialogContent.classList.remove('has-scroll');
        }
    }
    
    typewriterInterval = setInterval(() => { 
        if (currentCharIndex < plainText.length) { 
            if (useMarkdown && processedHtml) { 
                currentCharIndex++; 
                displayPartialHtml(processedHtml, plainText, currentCharIndex); 
            } else { 
                dialogText.textContent += plainText[currentCharIndex++]; 
            } 
            
            if (currentCharIndex >= (plainText.length * 2/3)) { 
                canProceedToNext = true; 
            } 
        } else { 
            stopTypewriter(); 
            if(textIndicator) textIndicator.style.display = 'block'; 
            canProceedToNext = true; 
            
            // 新增：打字完成后的处理
            if (dialogContent) {
                dialogContent.classList.remove('typing');
                dialogContent.classList.add('typing-complete');
            }
            
            if (useMarkdown && processedHtml) { 
                if (!window.tempMdContainer) { 
                    window.tempMdContainer = document.createElement('div'); 
                    Object.assign(window.tempMdContainer.style, {
                        position: 'absolute', 
                        visibility: 'hidden', 
                        width: dialogText.clientWidth + 'px', 
                        minHeight: '100px', 
                        padding: getComputedStyle(dialogText).padding, 
                        fontSize: getComputedStyle(dialogText).fontSize, 
                        lineHeight: getComputedStyle(dialogText).lineHeight
                    }); 
                    document.body.appendChild(window.tempMdContainer); 
                } 
                dialogText.style.opacity = '0.9'; 
                requestAnimationFrame(() => { 
                    dialogText.innerHTML = processedHtml; 
                    requestAnimationFrame(() => { 
                        dialogText.style.opacity = '1'; 
                    }); 
                }); 
            } else if (!useMarkdown) { 
                dialogText.textContent = plainText; 
            } 
        } 
    }, typeSpeed); 
}


function displayPartialHtml(fullHtml, plainTextVersion, visibleLength) { 
    if (!dialogText) return; 
    
    if (plainTextVersion && visibleLength >= plainTextVersion.length) { 
        if (!window.tempMdContainer) { 
            window.tempMdContainer = document.createElement('div'); 
            Object.assign(window.tempMdContainer.style, {
                position: 'absolute', 
                visibility: 'hidden', 
                width: dialogText.clientWidth + 'px', 
                minHeight: '100px', 
                padding: getComputedStyle(dialogText).padding, 
                fontSize: getComputedStyle(dialogText).fontSize, 
                lineHeight: getComputedStyle(dialogText).lineHeight
            }); 
            document.body.appendChild(window.tempMdContainer); 
        } 
        window.tempMdContainer.innerHTML = fullHtml; 
        dialogText.style.opacity = '0.95'; 
        setTimeout(() => { 
            dialogText.innerHTML = fullHtml; 
            dialogText.style.opacity = '1'; 
        }, 10); 
        return; 
    } 
    dialogText.textContent = plainTextVersion.substring(0, visibleLength); 
}

function stopTypewriter() { 
    if (typewriterInterval) clearInterval(typewriterInterval); 
    typewriterInterval = null; 
    isTyping = false; 
    if(typewriterCursor) typewriterCursor.style.display = 'none'; 
    if(textIndicator && dialogText && dialogText.textContent) textIndicator.style.display = 'block'; 
}

function showFullText() { 
    stopTypewriter(); 
    let finalContent = currentText; 
    canProceedToNext = true; 
    
    if (typeof window.processMarkdown === 'function' && currentText) { 
        finalContent = window.processMarkdown(currentText); 
    } 
    
    if (!dialogText) return; 
    
    // 新增：直接切换到完成状态
    if (dialogContent) {
        dialogContent.classList.remove('typing');
        dialogContent.classList.add('typing-complete');
    }
    
    if (typeof window.processMarkdown === 'function' && currentText) { 
        if (!window.tempMdContainer) { 
            window.tempMdContainer = document.createElement('div'); 
            Object.assign(window.tempMdContainer.style, {
                position: 'absolute', 
                visibility: 'hidden', 
                width: dialogText.clientWidth + 'px', 
                minHeight: '100px', 
                padding: getComputedStyle(dialogText).padding, 
                fontSize: getComputedStyle(dialogText).fontSize, 
                lineHeight: getComputedStyle(dialogText).lineHeight
            }); 
            document.body.appendChild(window.tempMdContainer); 
        } 
        dialogText.style.opacity = '0.9'; 
        requestAnimationFrame(() => { 
            dialogText.innerHTML = finalContent; 
            requestAnimationFrame(() => { 
                dialogText.style.opacity = '1'; 
            }); 
        }); 
    } else { 
        dialogText.textContent = finalContent; 
    } 
    
    if(dialogBoxGlobalRef) { 
        dialogBoxGlobalRef.classList.remove(CSS_HIDING, 'new-dialog'); 
        dialogBoxGlobalRef.style.animation = 'none'; 
        void dialogBoxGlobalRef.offsetWidth; 
        dialogBoxGlobalRef.style.animation = ''; 
    } 
    
    if(nameTag && dialogBoxGlobalRef?.style.display !== 'none') { 
        nameTag.classList.remove(CSS_HIDING); 
    } 
    
    if(textIndicator) textIndicator.style.display = 'block'; 
}


// =======================================================================
//                            選擇系統
// =======================================================================

function updateChoices() { 
    if (!choicesContainer) return; 
    
    choicesContainer.innerHTML = '';
    // 清除之前的居中样式
    choicesContainer.classList.remove('center-continue-button');
    let hasManualFifthOption = false; 
    
    if (vnData.choices?.length > 0) { 
        vnData.choices.forEach(choice => { 
            if (choice.number === '5️⃣') hasManualFifthOption = true; 
            createChoiceButton(choice); 
        }); 
        
        if (!hasManualFifthOption) { 
            createChoiceButton({ 
                number: '5️⃣', 
                text: '用戶輸入', 
                description: 'Enter your own choice' 
            }); 
        } 
        
        choicesContainer.classList.remove(CSS_HIDDEN); 
        const dialogBox = document.querySelector('.dialog-box'); 
        if (dialogBox && dialogBox.style.display !== 'none') { 
            dialogBox.classList.add(CSS_HIDING); 
            if (nameTag) nameTag.classList.add(CSS_HIDING); 
        } 
    } else {
        // 检查是否所有对话都已完成且没有选择
        const isDialogueComplete = currentDialogueIndex >= vnData.dialogues.length;
        const hasValidDialogues = vnData.dialogues && vnData.dialogues.length > 0;
        
        if (isDialogueComplete && hasValidDialogues) {
            // 显示"继续剧情"按钮
            // console.log('[VN面板-手机版] 对话完成且无选择，显示继续剧情按钮');
            createContinueStoryButton();
            choicesContainer.classList.remove(CSS_HIDDEN);
            
            // 🚀 通知父窗口：VN面板顯示繼續劇情按鈕，需要顯示iframe關閉鍵
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'VN_WINDOW_CHANGE',
                        inStoryMode: false, // 顯示繼續劇情按鈕時，視為非劇情模式，需要顯示關閉鍵
                        source: 'VN_PANEL',
                        timestamp: Date.now()
                    }, '*');
                    // console.log('[VN面板-手机版] 已通知父窗口顯示關閉鍵（updateChoices中的繼續劇情模式）');
                }
            } catch (error) {
                // console.error('[VN面板-手机版] 通知父窗口失敗:', error);
            }
        } else {
            choicesContainer.classList.add(CSS_HIDDEN); 
        }
    } 
}

function createChoiceButton(choice) { 
    if (!choicesContainer) return; 
    
    const button = document.createElement('div'); 
    button.className = 'choice-button'; 
    button.textContent = `${choice.number} ${choice.text}`; 
    if (choice.description) button.title = choice.description; 
    
    button.addEventListener('mouseenter', () => { 
        if (window.VNFeatures?.playHoverSound) window.VNFeatures.playHoverSound(); 
    }); 
    
    button.addEventListener('click', () => {
        if (window.VNFeatures?.playSound) window.VNFeatures.playSound('choiceSelectSound');
        
        if (choice.number === '5️⃣') {
            // 用户输入：不显示loading，直接打开输入对话框
            showUserInputDialog(choice);
        } else {
            // 其他选择：显示loading并发送
            // console.log('[VN面板-手机版] 选择已做出，显示loading动画');
            if (window.VNFeatures?.showLoadingAnimation) window.VNFeatures.showLoadingAnimation();
            sendChoiceToChatInterface(choice);
            choicesContainer.classList.add(CSS_HIDDEN);
        }
    });
    
    choicesContainer.appendChild(button); 
}

function sendChoiceToChatInterface(choice) {
    // console.log('[VN面板-手机版] 发送选择到聊天接口:', choice);
    
    // 发送标准事件让处理器处理
    window.top.postMessage({
        type: 'VN_CHOICE_API',
        choice: choice
    }, '*');
}

/**
 * 修復歷史劇情注入的完整解決方案
 */

// 1. 修復後的 createContinueStoryButton 函數
function createContinueStoryButton() {
    // 1. 隱藏主對話框
    const dialogBox = document.querySelector('.dialog-box');
    if (dialogBox) {
        dialogBox.style.visibility = 'hidden';
    }
    
    // 🚀 通知父窗口：VN面板顯示繼續劇情按鈕，需要顯示iframe關閉鍵並縮小iframe尺寸
    try {
        if (window.parent && window.parent !== window) {
            // 立即通知父窗口縮小iframe尺寸
            window.parent.postMessage({
                type: 'VN_IFRAME_RESIZE',
                state: 'continue',
                source: 'VN_PANEL',
                timestamp: Date.now()
            }, '*');
            
            window.parent.postMessage({
                type: 'VN_WINDOW_CHANGE',
                inStoryMode: false, // 顯示繼續劇情按鈕時，視為非劇情模式，需要顯示關閉鍵
                source: 'VN_PANEL',
                timestamp: Date.now()
            }, '*');
            // console.log('[VN面板-手机版] 已通知父窗口顯示關閉鍵並縮小iframe尺寸（繼續劇情模式）');
        }
    } catch (error) {
        // console.error('[VN面板-手机版] 通知父窗口失敗:', error);
    }

    // 2. 插入遮罩
    let backdrop = document.querySelector('.continue-story-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'continue-story-backdrop';
        document.body.appendChild(backdrop);
    } else {
        backdrop.classList.remove('hide');
    }

    // 3. 建立 actions bar 容器
    let actionsBar = document.querySelector('.continue-story-actions-bar');
    if (!actionsBar) {
        actionsBar = document.createElement('div');
        actionsBar.className = 'continue-story-actions-bar';
        document.body.appendChild(actionsBar);
    } else {
        actionsBar.innerHTML = '';
        actionsBar.style.display = '';
    }

    // 4. 建立繼續劇情按鈕
    let continueBtn = document.querySelector('.continue-story-button');
    if (!continueBtn) {
        continueBtn = document.createElement('div');
        continueBtn.className = 'choice-button continue-story-button';
        continueBtn.innerHTML = '繼續劇情';
        continueBtn.title = '分析角色狀態並繼續推進劇情，不可重複劇情';
        continueBtn.style.background = 'linear-gradient(135deg, #1b1b1b, #100f0e)';
        continueBtn.style.color = '#ffffff';
        continueBtn.style.fontWeight = 'bold';
        continueBtn.style.position = 'relative';
        continueBtn.style.border = '2px solid #ffd700';
        continueBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2), 0 0 10px rgba(255, 215, 0, 0.3)';
        
        // 🔥 新增：防重複點擊機制
        continueBtn.addEventListener('mouseenter', () => {
            if (window.VNFeatures?.playHoverSound) window.VNFeatures.playHoverSound();
        });
        
        continueBtn.addEventListener('click', (e) => {
            // 🔥 阻止事件冒泡
            e.stopPropagation();
            e.preventDefault();
            
            // 🔥 防重複點擊檢查
            if (triggerNovelistState.isSending) {
                console.log('[VN面板-手机版] 繼續劇情正在執行中，忽略重複點擊');
                return;
            }
            
            console.log('[VN面板-手机版] 繼續劇情按鈕被點擊');
            
            if (dialogBox) dialogBox.style.visibility = '';
            if (backdrop) {
                backdrop.classList.add('hide');
                setTimeout(() => { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }, 350);
            }
            if (actionsBar) actionsBar.remove();
            triggerNovelist();
        });
        
        // 🔥 新增：將按鈕添加到actions bar
        actionsBar.appendChild(continueBtn);
    } else {
        // 🔥 新增：如果按鈕已存在，確保它被添加到actions bar
        if (!actionsBar.contains(continueBtn)) {
            actionsBar.appendChild(continueBtn);
        }
    }

    // 5. 建立用戶輸入按鈕
    let commandBtn = document.createElement('button');
    commandBtn.className = 'command-button';
    commandBtn.innerHTML = '用戶輸入';
    commandBtn.style.fontSize = '16px';
    commandBtn.style.padding = '10px 24px';
    commandBtn.style.borderRadius = '8px';
    commandBtn.style.background = 'linear-gradient(135deg, #1b1b1b, #100f0e)';
    commandBtn.style.color = '#fff';
    commandBtn.style.fontWeight = 'bold';
    commandBtn.style.border = '2px solid #ffd700';
    commandBtn.style.cursor = 'pointer';
    commandBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2), 0 0 10px rgba(255, 215, 0, 0.3)';
    commandBtn.style.textAlign = 'center';
    commandBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.showCommandInputDialog) {
            window.showCommandInputDialog();
        } else if (window.VNFeatures?.showCommandInputDialog) {
            window.VNFeatures.showCommandInputDialog();
        }
    });

    // 6. 建立查看歷史劇情按鈕 - 關鍵修復點
    let historyBtn = document.createElement('button');
    historyBtn.className = 'history-button';
    historyBtn.innerHTML = '查看歷史劇情';
    historyBtn.style.fontSize = '16px';
    historyBtn.style.padding = '10px 24px';
    historyBtn.style.borderRadius = '8px';
    historyBtn.style.background = 'linear-gradient(135deg, #1b1b1b, #100f0e)';
    historyBtn.style.color = '#fff';
    historyBtn.style.fontWeight = 'bold';
    historyBtn.style.border = '2px solid #ffd700';
    historyBtn.style.cursor = 'pointer';
    historyBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2), 0 0 10px rgba(255, 215, 0, 0.3)';
    historyBtn.style.textAlign = 'center';
    historyBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        console.log('[VN面板-剧情页面] 点击查看历史剧情按钮');
        
        // 🆕 使用歷史窗口狀態管理器檢查是否可以發起請求
        if (!window.VNHistoryWindowManager?.canRequestHistory()) {
            console.log('[VN面板-剧情页面] 歷史請求被阻止，當前狀態:', window.VNHistoryWindowManager?.getStatus());
            return;
        }
        
        if (window.VNFeatures?.playSound) {
            window.VNFeatures.playSound('clickSound');
        }
        
        // 【關鍵修復】先隱藏 actions bar 界面，但暫時保留對話框的可見性
        if (backdrop) {
            backdrop.classList.add('hide');
            setTimeout(() => { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }, 350);
        }
        if (actionsBar) {
            actionsBar.style.display = 'none';
        }
        
        // 【關鍵修復】確保對話框處於可用狀態，為歷史劇情注入做準備
        if (dialogBox) {
            dialogBox.style.visibility = 'visible';  // 恢復對話框顯示
            dialogBox.style.display = 'flex';        // 確保對話框結構正確
            console.log('[VN面板-手机版] 已恢復對話框顯示，準備歷史劇情注入');
        }
        
        // 🔥 新增：確保對話框全局引用也正確設置
        if (dialogBoxGlobalRef) {
            dialogBoxGlobalRef.style.display = 'flex';
            dialogBoxGlobalRef.style.visibility = 'visible';
            dialogBoxGlobalRef.classList.remove('hiding');
            console.log('[VN面板-手机版] 已確保對話框全局引用狀態正確（歷史劇情載入前）');
        }
        
        // 🔥 新增：重置對話框相關狀態
        if (nameTag) {
            nameTag.style.display = 'none';
            nameTag.classList.remove('hiding');
        }
        
        if (window.VNFeatures?.showLoadingAnimation) {
            window.VNFeatures.showLoadingAnimation();
        }
        
        // 🆕 開始歷史請求
        const windowId = window.VNHistoryWindowManager.WINDOW_IDS.MAIN;
        if (!window.VNHistoryWindowManager.startHistoryRequest(windowId)) {
            console.warn('[VN面板-剧情页面] 無法開始歷史請求');
            return;
        }
        
        // 🆕 劇情頁面的歷史按鈕：使用VNCore請求歷史數據
        console.log('[VN面板-剧情页面] 点击查看历史剧情按钮 - 请求历史数据');
        
        // 使用VNCore的歷史請求方法，確保數據正確填充
        if (window.VNCore?.requestVNHistory) {
            console.log('[VN面板-剧情页面] 使用VNCore.requestVNHistory获取历史数据');
            window.VNCore.requestVNHistory();
        } else {
            console.warn('[VN面板-剧情页面] VNCore不可用，使用备用方法');
            try {
                window.parent.postMessage({ 
                    type: 'VN_FETCH_HISTORY_LIST',
                    source: 'VN_PANEL_MOBILE_HISTORY_BUTTON',
                    timestamp: Date.now()
                }, '*');
                console.log('[VN面板-剧情页面] 已通过postMessage发送历史请求');
            } catch (error) {
                console.error('[VN面板-剧情页面] 发送历史请求时出错:', error);
                if (window.VNFeatures?.hideLoadingAnimation) {
                    window.VNFeatures.hideLoadingAnimation();
                }
                // 🆕 重置請求狀態
                window.VNHistoryWindowManager?.completeHistoryRequest();
                alert('获取历史记录失败，请重试');
            }
        }
        
        // 设置超时处理
        setTimeout(() => {
            if (window.VNFeatures?.hideLoadingAnimation) {
                window.VNFeatures.hideLoadingAnimation();
            }
            // 🆕 重置請求狀態
            window.VNHistoryWindowManager?.completeHistoryRequest();
            console.warn('[VN面板-手机版] 历史请求可能超时');
        }, 8000);
    });

    // 🚀 7. 建立返回啟動頁面按鈕
    let backToLandingBtn = document.createElement('div');
    backToLandingBtn.className = 'choice-button back-to-landing-button';
    backToLandingBtn.innerHTML = '返回啟動頁面';
    backToLandingBtn.style.background = 'linear-gradient(135deg, #1b1b1b, #100f0e)';
    backToLandingBtn.style.color = '#ffffff';
    backToLandingBtn.style.fontWeight = 'bold';
    backToLandingBtn.style.position = 'relative';
    backToLandingBtn.style.padding = '12px 20px';
    backToLandingBtn.style.borderRadius = '12px';
    backToLandingBtn.style.fontSize = '15px';
    backToLandingBtn.style.fontWeight = '500';
    backToLandingBtn.style.cursor = 'pointer';
    backToLandingBtn.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    backToLandingBtn.style.textAlign = 'center';
    backToLandingBtn.style.border = '2px solid #ffd700';
    backToLandingBtn.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2), 0 0 10px rgba(255, 215, 0, 0.3)';
    backToLandingBtn.style.backdropFilter = 'blur(10px)';
    backToLandingBtn.style.overflow = 'hidden';
    backToLandingBtn.style.minWidth = '200px';
    backToLandingBtn.style.display = 'flex';
    backToLandingBtn.style.alignItems = 'center';
    backToLandingBtn.style.justifyContent = 'center';
    backToLandingBtn.title = '返回VN面板啟動頁面，清理當前劇情狀態';
    backToLandingBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        // console.log('[VN面板-手机版] 点击返回启动页面按钮');
        
        if (window.VNFeatures?.playSound) {
            window.VNFeatures.playSound('clickSound');
        }
        
        // 清理劇情狀態 - 停止所有音效和BGM
        // console.log('[VN面板-手机版] 清理劇情狀態：停止音效和BGM');
        if (window.VNFeatures?.stopAllSounds) {
            window.VNFeatures.stopAllSounds();
        }
        if (window.VNFeatures?.forceStopBGM) {
            window.VNFeatures.forceStopBGM();
        } else if (window.VNFeatures?.forceStopCurrentBGM) {
            window.VNFeatures.forceStopCurrentBGM();
        }
        
        // 清理劇情數據狀態
        // console.log('[VN面板-手机版] 清理VN數據狀態');
        
        // 重置對話索引
        if (window.VNCore) {
            window.VNCore.currentDialogueIdx = 0;
        }
        
        // 清理角色顯示
        const characterCenter = document.querySelector('.character-center');
        if (characterCenter) {
            characterCenter.innerHTML = '';
        }
        
        // 隱藏對話框
        if (dialogBox) {
            dialogBox.style.display = 'none';
        }
        
        // 隱藏名稱標籤
        const nameTag = document.querySelector('.name-tag');
        if (nameTag) {
            nameTag.style.display = 'none';
        }
        
        // 清理選擇按鈕
        const choicesContainer = document.querySelector('.choices-container');
        if (choicesContainer) {
            choicesContainer.innerHTML = '';
        }
        
        // 清理繼續劇情界面元素
        if (backdrop) {
            backdrop.classList.add('hide');
            setTimeout(() => { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }, 350);
        }
        if (actionsBar) {
            actionsBar.remove();
        }
        
        // 返回啟動頁面
        if (typeof showVNLandingContainer === 'function') {
            showVNLandingContainer();
        } else {
            console.warn('[VN面板-手机版] showVNLandingContainer函數不可用');
            // 備用方案：直接切換到啟動頁面
            const vnLandingContainer = document.getElementById('vnLandingContainer');
            const vnMainContainer = document.getElementById('vnMainContainer');
            if (vnMainContainer) vnMainContainer.classList.remove('active');
            if (vnLandingContainer) vnLandingContainer.classList.add('active');
        }
    });

    // 8. 加入到 actions bar（繼續劇情按鈕已在前面處理）
    actionsBar.appendChild(commandBtn);
    actionsBar.appendChild(historyBtn);
    actionsBar.appendChild(backToLandingBtn);
}

// 🔥 新增：防重複發送狀態管理
let triggerNovelistState = {
    isSending: false
};

/**
 * 触发小说家的通用函数（只发送一次继续剧情命令）
 */
async function triggerNovelist() {
    try {
        // 🔥 防重複發送檢查
        if (triggerNovelistState.isSending) {
            console.log('[VN面板-手机版] 繼續劇情正在執行中，忽略重複點擊');
            return;
        }
        
        // 設置發送狀態
        triggerNovelistState.isSending = true;
        console.log('[VN面板-手机版] 开始继续剧情流程');
        
        // 显示loading动画
        console.log('[VN面板-手机版] 继续剧情已点击，显示loading动画');
        if (window.VNFeatures?.showLoadingAnimation) {
            window.VNFeatures.showLoadingAnimation();
        }
        
        // 🔥 修改：只發送一次繼續劇情命令，不再分別發送提示和AI命令
        await startNovelistAI();
        
    } catch (error) {
        console.error('[VN面板-手机版] 继续剧情流程出错:', error);
        alert('继续剧情时出现错误，请重试。');
        
        // 发生错误时隐藏loading动画
        if (window.VNFeatures?.hideLoadingAnimation) {
            window.VNFeatures.hideLoadingAnimation();
        }
    } finally {
        // 🔥 重置發送狀態
        setTimeout(() => {
            triggerNovelistState.isSending = false;
            console.log('[VN面板-手机版] 繼續劇情流程完成，重置發送狀態');
        }, 1500);
    }
}

/**
 * 发送提示内容到聊天室
 */
async function sendPromptToChat() {
    try {
        const promptMessage = '繼續劇情';
        // console.log('[VN面板-手机版] 发送提示内容到聊天室:', promptMessage);
        
        // 方法1：使用官方API发送消息
        if (window.top?.TavernHelper?.createChatMessages) {
            // console.log('[VN面板-手机版] 使用官方API发送提示内容');
            await window.top.TavernHelper.createChatMessages(
                [{
                    role: 'user',
                    name: '{{user}}',
                    message: promptMessage
                }],
                { refresh: 'affected' }
            );
            // console.log('[VN面板-手机版] 提示内容已通过官方API发送');
            
        } else {
            // 方法2：备用方法
            console.warn('[VN面板-手机版] 官方API不可用，使用备用方法发送提示内容');
            const stInput = window.parent.document.querySelector('#send_textarea');
            const sendButton = window.parent.document.querySelector('#send_but');
            
            if (stInput && sendButton) {
                stInput.value = promptMessage;
                stInput.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => sendButton.click(), 100);
                // console.log('[VN面板-手机版] 提示内容已通过备用方法发送');
            } else {
                // console.error('[VN面板-手机版] 无法找到聊天输入框或发送按钮');
                throw new Error('无法发送提示内容到聊天室');
            }
        }
        
        // 等待消息发送完成
        await new Promise(resolve => setTimeout(resolve, 300));
        
    } catch (error) {
        // console.error('[VN面板-手机版] 发送提示内容失败:', error);
        throw error;
    }
}

/**
 * 启动小说家AI（发送继续剧情消息）
 */
async function startNovelistAI() {
    try {
        console.log('[VN面板-手机版] 发送继续剧情消息');
        
        // 方法1：使用官方API发送消息
        if (window.top?.TavernHelper?.createChatMessages) {
            console.log('[VN面板-手机版] 使用官方API发送继续剧情消息');
            await window.top.TavernHelper.createChatMessages(
                [{
                    role: 'user',
                    name: '{{user}}',
                    message: '繼續劇情'
                }],
                { refresh: 'affected' }
            );
            console.log('[VN面板-手机版] 继续剧情消息已通过官方API发送');
            
        } else {
            // 方法2：备用方法
            console.warn('[VN面板-手机版] 官方API不可用，使用备用方法发送继续剧情消息');
            const stInput = window.parent.document.querySelector('#send_textarea');
            const sendButton = window.parent.document.querySelector('#send_but');
            
            if (stInput && sendButton) {
                stInput.value = '繼續劇情';
                stInput.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => sendButton.click(), 100);
                console.log('[VN面板-手机版] 继续剧情消息已通过备用方法发送');
            } else {
                console.error('[VN面板-手机版] 无法找到聊天输入框或发送按钮');
                throw new Error('无法发送继续剧情消息');
            }
        }
        
    } catch (error) {
        console.error('[VN面板-手机版] 发送继续剧情消息失败:', error);
        throw error;
    }
}

// =======================================================================
//                            用戶輸入處理
// =======================================================================

function setupUserInputListeners() { 
    if(submitUserInput) submitUserInput.addEventListener('click', () => { if (window.VNFeatures?.playSound) window.VNFeatures.playSound('clickSound'); submitUserInputChoice(); });
    if(cancelUserInput) cancelUserInput.addEventListener('click', () => { if (window.VNFeatures?.playSound) window.VNFeatures.playSound('clickSound'); closeUserInputDialog(); });
    if(closeUserInput) closeUserInput.addEventListener('click', () => { if (window.VNFeatures?.playSound) window.VNFeatures.playSound('clickSound'); closeUserInputDialog(); });
    if(userInputModal) userInputModal.addEventListener('click', e => { if (e.target === userInputModal) { if (window.VNFeatures?.playSound) window.VNFeatures.playSound('clickSound'); closeUserInputDialog(); } });
    if(userInputTextarea) { 
        userInputTextarea.addEventListener('keydown', e => { 
            if (e.key === 'Enter' && e.ctrlKey) { 
                e.preventDefault(); 
                submitUserInputChoice(); 
            } 
            if (e.key === 'Escape') { 
                closeUserInputDialog(); 
            } 
        }); 
    }
}

function showUserInputDialog(choice) { 
    if (!userInputModal || !userInputContainer || !userInputTextarea) return; 
    
    if (window.VNFeatures?.hideLoadingAnimation) window.VNFeatures.hideLoadingAnimation(); 
    
    userInputContainer.dataset.choiceNumber = choice.number; 
    userInputContainer.dataset.choiceText = choice.text; 
    userInputTextarea.value = ''; 
    userInputModal.classList.add(CSS_MODAL_ACTIVE); 
    userInputContainer.classList.add('user-input-active'); 
    
    setTimeout(() => userInputTextarea.focus(), 100); 
}

function closeUserInputDialog() { 
    if (!userInputModal || !userInputContainer) return; 
    userInputModal.classList.remove(CSS_MODAL_ACTIVE); 
    userInputContainer.classList.remove('user-input-active'); 
}

function submitUserInputChoice() { 
    if (!userInputTextarea || !userInputContainer || !choicesContainer) return; 
    
    const userInput = userInputTextarea.value.trim(); 
    if (!userInput) { 
        alert('Please enter your choice.'); 
        return; 
    } 
    
    closeUserInputDialog(); 
    // console.log('[VN面板-手机版] 用户输入已提交，显示loading动画'); 
    
    if (window.VNFeatures?.showLoadingAnimation) window.VNFeatures.showLoadingAnimation(); 
    
    sendChoiceToChatInterface({ 
        number: userInputContainer.dataset.choiceNumber || '5️⃣', 
        text: userInputContainer.dataset.choiceText || 'User Input', 
        userInput: userInput 
    }); 
    
    choicesContainer.classList.add(CSS_HIDDEN); 
}

// =======================================================================
//                            其他UI功能
// =======================================================================

function toggleModalHelper(modalEl, containerEl, modalActiveClass, containerActiveClass, onOpen, onClose) { 
    if (!modalEl) return; 
    
    const isOpen = modalEl.classList.contains(modalActiveClass); 
    if (window.VNFeatures?.playSound) window.VNFeatures.playSound('clickSound'); 
    
    if (isOpen) { 
        modalEl.classList.remove(modalActiveClass); 
        if (containerEl) containerEl.classList.remove(containerActiveClass); 
        if (onClose) onClose(); 
    } else { 
        modalEl.classList.add(modalActiveClass); 
        if (containerEl) containerEl.classList.add(containerActiveClass); 
        if (onOpen) onOpen(); 
    } 
}

function setupModalEventListeners() { 
    if (mailboxButton) mailboxButton.addEventListener('click', () => toggleModalHelper(mailModal, mailboxContainer, CSS_MODAL_ACTIVE, 'mailbox-active'));
    if (closeMailbox) closeMailbox.addEventListener('click', () => toggleModalHelper(mailModal, mailboxContainer, CSS_MODAL_ACTIVE, 'mailbox-active'));
    if (mailModal) mailModal.addEventListener('click', e => { if (e.target === mailModal) toggleModalHelper(mailModal, mailboxContainer, CSS_MODAL_ACTIVE, 'mailbox-active'); });
    if (settingsButton) settingsButton.addEventListener('click', () => toggleModalHelper(settingsModal, settingsContainer, CSS_MODAL_ACTIVE, CSS_ACTIVE));
    if (closeSettings) closeSettings.addEventListener('click', () => toggleModalHelper(settingsModal, settingsContainer, CSS_MODAL_ACTIVE, CSS_ACTIVE));
    if (settingsModal) settingsModal.addEventListener('click', e => { if (e.target === settingsModal) toggleModalHelper(settingsModal, settingsContainer, CSS_MODAL_ACTIVE, CSS_ACTIVE); });
    if (historyButton) historyButton.addEventListener('click', () => toggleModalHelper(historyModal, historyContainer, CSS_MODAL_ACTIVE, CSS_ACTIVE, updateHistoryContent));
    if (closeHistory) closeHistory.addEventListener('click', () => toggleModalHelper(historyModal, historyContainer, CSS_MODAL_ACTIVE, CSS_ACTIVE));
    if (historyModal) historyModal.addEventListener('click', e => { if (e.target === historyModal) toggleModalHelper(historyModal, historyContainer, CSS_MODAL_ACTIVE, CSS_ACTIVE); });
    if (closeVnHistoryChoiceButton) closeVnHistoryChoiceButton.addEventListener('click', () => {
        toggleModalHelper(vnHistoryChoiceModal, null, CSS_MODAL_ACTIVE, null);
        // 確保返回啟動界面
        if (typeof showVNLandingContainer === 'function') {
            showVNLandingContainer();
        }
    });
    if (vnHistoryChoiceModal) vnHistoryChoiceModal.addEventListener('click', e => { 
        if (e.target === vnHistoryChoiceModal) {
            toggleModalHelper(vnHistoryChoiceModal, null, CSS_MODAL_ACTIVE, null);
            // 確保返回啟動界面
            if (typeof showVNLandingContainer === 'function') {
                showVNLandingContainer();
            }
        }
    });
    
    if (typeSpeedSlider && typeSpeedValue) { 
        typeSpeedSlider.value = typeSpeed; 
        typeSpeedValue.textContent = typeSpeed; 
        typeSpeedSlider.addEventListener('input', (e) => { 
            typeSpeed = parseInt(e.target.value); 
            typeSpeedValue.textContent = typeSpeed; 
        }); 
    }
    
    setupCharacterRelationshipCollapse();
}

function setupCharacterRelationshipCollapse() {
    document.addEventListener('click', (e) => {
        const charPanel = e.target.closest('.char-data-panel');
        if (!charPanel) return;

        if (e.target.closest('.relationship-item-simple')) return;

        charPanel.classList.toggle('collapsed');
        
        if (window.VNFeatures?.playSound) {
            window.VNFeatures.playSound('clickSound');
        }
        
        e.stopPropagation();
        
        const isCollapsed = charPanel.classList.contains('collapsed');
        // console.log(`[VN面板-手机版] 角色关系面板已 ${isCollapsed ? '折叠' : '展开'}`);
    });
}

function updateMailbox() { 
    if (!mailList) return; 
    
    mailList.innerHTML = ''; 
    const notes = vnData.sceneInfo?.memoryNotes; 
    
    if (notes?.length > 0) { 
        notes.forEach(note => { 
            const noteId = note.id || note.title || Date.now(); 
            mailList.innerHTML += `
                <div class="mail-item" data-note-id="${noteId}"> 
                    <div class="mail-sender">${note.source || '未知'}</div> 
                    <div class="mail-preview">${note.title || '無標題'}</div> 
                    <div class="mail-date">${note.date || ''}</div> 
                </div>`; 
        }); 
        
        mailList.querySelectorAll('.mail-item').forEach(item => 
            item.addEventListener('click', () => { 
                const noteIdentifier = item.dataset.noteId; 
                const clickedNote = notes.find(n => 
                    (String(n.id) === String(noteIdentifier)) || (n.title === noteIdentifier)); 
                if(clickedNote) showMailContent(clickedNote); 
            })); 
    } else { 
        mailList.innerHTML = '<div style="text-align:center; padding:10px; color:#888;">郵箱為空。</div>'; 
    } 
}

function showMailContent(note) { 
    if (!mailboxContainer || !mailList) return; 
    
    const mailContentView = mailboxContainer.querySelector('.mail-content-view'); 
    if(mailContentView) mailContentView.remove(); 
    
    const newContentView = document.createElement('div'); 
    newContentView.className = 'mail-content-view'; 
    newContentView.innerHTML = `
        <h3>${note.title || '無標題'}</h3> 
        <div class="mail-info"> 
            <strong>來自:</strong> ${note.source || '未知'} 
            ${note.date ? `| <span>${note.date}</span>` : ''} 
        </div> 
        <div class="mail-body">${(note.content || '').replace(/\n/g, '<br>')}</div> 
        <button class="back-button">返回</button>`; 
    
    newContentView.querySelector('.back-button').addEventListener('click', () => { 
        newContentView.remove(); 
        mailList.classList.remove(CSS_HIDDEN); 
    }); 
    
    mailList.classList.add(CSS_HIDDEN); 
    mailboxContainer.appendChild(newContentView); 
}

function showChatNotification() { 
    const notification = document.getElementById('chat-notification'); 
    const sound = document.getElementById('chat-notification-sound'); 
    
    if (notification && sound) { 
        notification.classList.add('show'); 
        sound.play().catch(e => { 
            console.warn("聊天通知音效播放失败:", e); 
        }); 
        setTimeout(() => notification.classList.remove('show'), 5000); 
    } 
}

function displayVNHistoryChoices(historyList) { 
    const vnHistoryChoiceModal = document.querySelector('#vnHistoryChoiceModal');
    const vnHistoryChoiceContent = vnHistoryChoiceModal?.querySelector('.vn-history-choice-content');
    
    if (!vnHistoryChoiceModal || !vnHistoryChoiceContent) { 
        console.warn("[VN面板-手机版] VN History Choice Modal/Content 未找到"); 
        return; 
    } 
    
    // 🆕 使用歷史窗口狀態管理器檢查是否可以打開窗口
    const windowId = window.VNHistoryWindowManager?.WINDOW_IDS.LANDING;
    if (!window.VNHistoryWindowManager?.openHistoryWindow(windowId)) {
        console.warn('[VN面板-手机版] 無法打開啟動頁面歷史窗口');
        return;
    }
    
    // 🆕 修復：確保模態窗口正確顯示
    vnHistoryChoiceModal.style.display = 'flex';
    
    // 動態添加手機版優化的CSS樣式（與Main版本相同的樣式）
    const mobileOptimizedStyles = `
        <style id="mobile-history-choice-styles-landing">
            #vnHistoryChoiceModal {
                background: linear-gradient(135deg, rgba(27, 27, 27, 0.9), rgba(16, 15, 14, 0.9)) !important;
                backdrop-filter: blur(20px) !important;
            }
            
            #vnHistoryChoiceModal .vn-history-choice-container {
                background: linear-gradient(135deg, #1b1b1b, #100f0e) !important;
                border: 2px solid #83681f !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8) !important;
                backdrop-filter: blur(15px) !important;
                color: #ffffff !important;
            }
            
            #vnHistoryChoiceModal .vn-history-choice-title {
                color: #ffffff !important;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important;
            }
            
            #vnHistoryChoiceModal .history-choice-button {
                background: linear-gradient(135deg, rgba(131, 104, 31, 0.1), rgba(131, 104, 31, 0.05)) !important;
                border: 2px solid rgba(131, 104, 31, 0.3) !important;
                color: #ffffff !important;
                font-weight: 500 !important;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3) !important;
                box-shadow: 0 2px 8px rgba(131, 104, 31, 0.2) !important;
            }
            
            #vnHistoryChoiceModal .history-choice-button:hover {
                background: linear-gradient(135deg, rgba(131, 104, 31, 0.2), rgba(131, 104, 31, 0.1)) !important;
                border-color: #83681f !important;
                color: #ffffff !important;
                transform: translateY(-2px) !important;
                box-shadow: 0 4px 12px rgba(131, 104, 31, 0.4) !important;
            }
            
            #vnHistoryChoiceModal .history-item-id {
                color: #83681f !important;
                font-weight: bold !important;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3) !important;
            }
            
            #vnHistoryChoiceModal .history-item-preview {
                color: #ffffff !important;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3) !important;
            }
            
            #vnHistoryChoiceModal .close-vn-history-choice {
                background: rgba(131, 104, 31, 0.2) !important;
                border: 2px solid #83681f !important;
                color: #ffffff !important;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3) !important;
            }
            
            #vnHistoryChoiceModal .close-vn-history-choice:hover {
                background: rgba(131, 104, 31, 0.4) !important;
                border-color: #83681f !important;
                color: #ffffff !important;
            }
            
            /* 自定义滚动条样式 - 黑金主题 */
            #vnHistoryChoiceModal .vn-history-choice-content {
                scrollbar-width: thin !important;
                scrollbar-color: #83681f rgba(131, 104, 31, 0.1) !important;
            }

            #vnHistoryChoiceModal .vn-history-choice-content::-webkit-scrollbar {
                width: 8px !important;
            }

            #vnHistoryChoiceModal .vn-history-choice-content::-webkit-scrollbar-track {
                background: rgba(131, 104, 31, 0.1) !important;
                border-radius: 4px !important;
            }

            #vnHistoryChoiceModal .vn-history-choice-content::-webkit-scrollbar-thumb {
                background: linear-gradient(135deg, #83681f, #a08c4f) !important;
                border-radius: 4px !important;
                border: 1px solid rgba(131, 104, 31, 0.3) !important;
            }

            #vnHistoryChoiceModal .vn-history-choice-content::-webkit-scrollbar-thumb:hover {
                background: linear-gradient(135deg, #a08c4f, #83681f) !important;
                box-shadow: 0 0 8px rgba(131, 104, 31, 0.4) !important;
            }

            #vnHistoryChoiceModal .vn-history-choice-content::-webkit-scrollbar-corner {
                background: rgba(131, 104, 31, 0.1) !important;
            }
            
            /* 手機版特殊優化 */
            @media (max-width: 768px) {
                #vnHistoryChoiceModal .vn-history-choice-container {
                    width: 90% !important;
                    max-width: none !important;
                    margin: 20px !important;
                    padding: 20px !important;
                }
                
                #vnHistoryChoiceModal .vn-history-choice-title {
                    font-size: 20px !important;
                }
                
                #vnHistoryChoiceModal .history-choice-button {
                    padding: 12px !important;
                    font-size: 13px !important;
                    margin-bottom: 8px !important;
                }
                
                #vnHistoryChoiceModal .history-item-id {
                    font-size: 14px !important;
                }
                
                #vnHistoryChoiceModal .history-item-preview {
                    font-size: 12px !important;
                    line-height: 1.3 !important;
                }
            }
        </style>
    `;
    
    // 移除舊的樣式（如果存在）
    const existingStyles = document.getElementById('mobile-history-choice-styles-landing');
    if (existingStyles) {
        existingStyles.remove();
    }
    
    // 添加新的樣式
    document.head.insertAdjacentHTML('beforeend', mobileOptimizedStyles);
    
    vnHistoryChoiceContent.innerHTML = ''; 
    
    if (!historyList?.length) { 
        vnHistoryChoiceContent.innerHTML = '<p style="text-align:center; padding:20px; color:#4a5568; font-weight:500;">No historical VN messages found.</p>'; 
    } else { 
        const ul = document.createElement('ul'); 
        ul.className = 'history-choice-list'; 
        
        historyList.forEach(item => { 
            ul.innerHTML += `
                <li> 
                    <button class="history-choice-button" title="Load ID: ${item.id}\nPreview: ${item.preview}" data-message-id="${item.id}"> 
                        <span class="history-item-id">ID: ${item.id}</span> 
                        <span class="history-item-preview">${item.preview}</span> 
                    </button> 
                </li>`; 
        }); 
        
        vnHistoryChoiceContent.appendChild(ul);
        
        // 替換📖圖標為自定義圖片
        setTimeout(() => {
            ul.querySelectorAll('.history-item-preview').forEach(preview => {
                if (preview.textContent.includes('📖')) {
                    preview.innerHTML = preview.innerHTML.replace('📖', '<img src="https://files.catbox.moe/qndoqu.png" alt="劇情" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">');
                }
            });
        }, 100); 
        
        ul.addEventListener('click', e => { 
            const button = e.target.closest('.history-choice-button'); 
            if (button) { 
                const messageId = button.dataset.messageId; 
                if (window.VNFeatures?.playSound) window.VNFeatures.playSound('choiceSelectSound'); 
                
                // 🔥 新增：在載入歷史劇情前，確保對話框狀態完全正確
                // console.log('[VN面板-手机版] 準備載入歷史劇情，確保對話框狀態');
                
                // 確保對話框完全可見且狀態正確
                if (dialogBoxGlobalRef) {
                    dialogBoxGlobalRef.style.display = 'flex';
                    dialogBoxGlobalRef.style.visibility = 'visible';
                    dialogBoxGlobalRef.classList.remove('hiding');
                    // console.log('[VN面板-手机版] 已確保對話框全局引用狀態正確（歷史劇情載入前）');
                }
                
                // 重置對話框相關狀態
                if (nameTag) {
                    nameTag.style.display = 'none';
                    nameTag.classList.remove('hiding');
                }
                
                // 確保對話框容器狀態正確
                const dialogBox = document.querySelector('.dialog-box');
                if (dialogBox) {
                    dialogBox.style.visibility = 'visible';
                    dialogBox.style.display = 'flex';
                    // console.log('[VN面板-手机版] 已確保對話框容器狀態正確（歷史劇情載入前）');
                }
                
                sendMessageToProcessor({ 
                    type: 'VN_PROCESS_HISTORY_ITEM', 
                    messageId: messageId 
                }); 
                
                // 🆕 修復：關閉啟動頁面的歷史窗口
                const windowId = window.VNHistoryWindowManager?.WINDOW_IDS.LANDING;
                if (window.VNHistoryWindowManager?.closeHistoryWindow(windowId)) {
                    if (vnHistoryChoiceModal) {
                        vnHistoryChoiceModal.classList.remove('modal-active');
                        vnHistoryChoiceModal.style.display = 'none';
                        console.log('[VN面板-启动页面] 已關閉啟動頁面歷史選擇窗口');
                    }
                }
                
                // 選擇歷史項目後，切換到主界面顯示劇情
                if (typeof showVNMainContainer === 'function') {
                    // 🔥 新增：通知父窗口停止音樂（歷史劇情載入時）
                    try {
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({
                                type: 'VN_STOP_MAIN_MUSIC',
                                source: 'VN_PANEL_HISTORY_LOAD',
                                timestamp: Date.now()
                            }, '*');
                            console.log('[VN面板-手机版] 歷史劇情載入時已通知父窗口停止音樂');
                        }
                    } catch (error) {
                        console.error('[VN面板-手机版] 歷史劇情載入時通知父窗口停止音樂失敗:', error);
                    }
                    
                    // 立即通知父窗口展開iframe尺寸
                    if (typeof notifyParentIframeResize === 'function') {
                        notifyParentIframeResize('story');
                    }
                    showVNMainContainer();
                }
            } 
        }); 
    } 
    
    if (!vnHistoryChoiceModal.classList.contains('modal-active')) { 
        vnHistoryChoiceModal.classList.add('modal-active');
        vnHistoryChoiceModal.style.display = 'flex';
    } 
}

// =======================================================================
//                            輔助函數
// =======================================================================

function addToDialogueHistory(dialogue) { 
    if (!vnData || !dialogue) return; 
    
    const currentVnMsgId = vnData.messageId || dialogueHistory[0]?.vnMsgId || 'unknown_vn_msg_id'; 
    
    if (dialogueHistory.length > 0 && dialogueHistory[0].vnMsgId !== currentVnMsgId) {
        dialogueHistory = []; 
    }
    
    if (dialogueHistory.some(item => 
        item.vnMsgId === currentVnMsgId && 
        item.index === currentDialogueIndex && 
        item.type === dialogue.type && 
        item.name === getDisplayNameForDialogue(dialogue))) return; 
    
    dialogueHistory.push({ 
        vnMsgId: currentVnMsgId, 
        index: currentDialogueIndex, 
        type: dialogue.type, 
        content: dialogue.content || (dialogue.type === 'area' ? `區域: ${dialogue.areaName}` : ''), 
        name: getDisplayNameForDialogue(dialogue), 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    }); 
}

function getDisplayNameForDialogue(dialogue) { 
    switch(dialogue.type) { 
        case 'narrative': return '旁白'; 
        case 'call': return dialogue.name || `通話: ${dialogue.caller || '未知'}`; 
        case 'chat': return `聊天: ${dialogue.chatName || '未知'}`; 
        case 'echo': return `回音: ${dialogue.echoId || '未知'}`; 
        case 'scene': return '場景轉換'; 
        case 'area': return '區域轉換'; 
        case 'transition': return '過渡'; 
        default: return dialogue.name || '未知角色'; 
    } 
}

function updateHistoryContent() { 
    if (!historyContentEl) return; 
    
    historyContentEl.innerHTML = dialogueHistory.length === 0 ? 
        '<div class="history-empty" style="text-align:center; padding:10px; color:#888;">暫無對話歷史。</div>' : 
        dialogueHistory.map(item => `
            <div class="history-item"> 
                <div class="history-item-header"> 
                    <div class="history-name">${item.name}</div> 
                    <div class="history-time">${item.timestamp}</div> 
                </div> 
                <div class="history-text">${(item.content || '').replace(/\n/g, '<br>')}</div> 
            </div>`).join(''); 
}

function playSoundEffects(soundEffect) {
    if (!soundEffect || !window.VNFeatures?.playSound) return;
    if (Array.isArray(soundEffect)) {
        soundEffect.forEach((sound, index) => {
            if (sound && sound.trim() && sound.toLowerCase() !== 'none') {
                setTimeout(() => window.VNFeatures.playSound(sound.trim()), index * 50);
            }
        });
    } else {
        if (soundEffect.trim() && soundEffect.toLowerCase() !== 'none') {
            window.VNFeatures.playSound(soundEffect);
        }
    }
}

// 2. 修復歷史劇情選擇處理函數
function displayVNHistoryChoicesInMain(historyList) { 
    const vnHistoryChoiceModalMain = document.querySelector('#vnHistoryChoiceModalMain');
    const vnHistoryChoiceContentMain = vnHistoryChoiceModalMain?.querySelector('.vn-history-choice-content');
    
    if (!vnHistoryChoiceModalMain || !vnHistoryChoiceContentMain) { 
        console.warn("[VN面板-手机版] VN History Choice Modal Main/Content 未找到"); 
        return; 
    } 
    
    // 🆕 使用歷史窗口狀態管理器檢查是否可以打開窗口
    const windowId = window.VNHistoryWindowManager?.WINDOW_IDS.MAIN;
    if (!window.VNHistoryWindowManager?.openHistoryWindow(windowId)) {
        console.warn('[VN面板-手机版] 無法打開主容器歷史窗口');
        return;
    } 
    
    // 動態添加手機版優化的CSS樣式
    const mobileOptimizedStyles = `
        <style id="mobile-history-choice-styles">
            #vnHistoryChoiceModalMain {
                background: linear-gradient(135deg, rgba(27, 27, 27, 0.9), rgba(16, 15, 14, 0.9)) !important;
                backdrop-filter: blur(20px) !important;
            }
            
            #vnHistoryChoiceModalMain .vn-history-choice-container {
                background: linear-gradient(135deg, #1b1b1b, #100f0e) !important;
                border: 2px solid #83681f !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8) !important;
                backdrop-filter: blur(15px) !important;
                color: #ffffff !important;
            }
            
            #vnHistoryChoiceModalMain .vn-history-choice-title {
                color: #ffffff !important;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important;
            }
            
            #vnHistoryChoiceModalMain .history-choice-button {
                background: linear-gradient(135deg, rgba(131, 104, 31, 0.1), rgba(131, 104, 31, 0.05)) !important;
                border: 2px solid rgba(131, 104, 31, 0.3) !important;
                color: #ffffff !important;
                font-weight: 500 !important;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3) !important;
                box-shadow: 0 2px 8px rgba(131, 104, 31, 0.2) !important;
            }
            
            #vnHistoryChoiceModalMain .history-choice-button:hover {
                background: linear-gradient(135deg, rgba(131, 104, 31, 0.2), rgba(131, 104, 31, 0.1)) !important;
                border-color: #83681f !important;
                color: #ffffff !important;
                transform: translateY(-2px) !important;
                box-shadow: 0 4px 12px rgba(131, 104, 31, 0.4) !important;
            }
            
            #vnHistoryChoiceModalMain .history-item-id {
                color: #83681f !important;
                font-weight: bold !important;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3) !important;
            }
            
            #vnHistoryChoiceModalMain .history-item-preview {
                color: #ffffff !important;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3) !important;
            }
            
            #vnHistoryChoiceModalMain .close-vn-history-choice {
                background: rgba(131, 104, 31, 0.2) !important;
                border: 2px solid #83681f !important;
                color: #ffffff !important;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3) !important;
            }
            
            #vnHistoryChoiceModalMain .close-vn-history-choice:hover {
                background: rgba(131, 104, 31, 0.4) !important;
                border-color: #83681f !important;
                color: #ffffff !important;
            }
            
            /* 自定义滚动条样式 - 黑金主题 */
            #vnHistoryChoiceModalMain .vn-history-choice-content {
                scrollbar-width: thin !important;
                scrollbar-color: #83681f rgba(131, 104, 31, 0.1) !important;
            }

            #vnHistoryChoiceModalMain .vn-history-choice-content::-webkit-scrollbar {
                width: 8px !important;
            }

            #vnHistoryChoiceModalMain .vn-history-choice-content::-webkit-scrollbar-track {
                background: rgba(131, 104, 31, 0.1) !important;
                border-radius: 4px !important;
            }

            #vnHistoryChoiceModalMain .vn-history-choice-content::-webkit-scrollbar-thumb {
                background: linear-gradient(135deg, #83681f, #a08c4f) !important;
                border-radius: 4px !important;
                border: 1px solid rgba(131, 104, 31, 0.3) !important;
            }

            #vnHistoryChoiceModalMain .vn-history-choice-content::-webkit-scrollbar-thumb:hover {
                background: linear-gradient(135deg, #a08c4f, #83681f) !important;
                box-shadow: 0 0 8px rgba(131, 104, 31, 0.4) !important;
            }

            #vnHistoryChoiceModalMain .vn-history-choice-content::-webkit-scrollbar-corner {
                background: rgba(131, 104, 31, 0.1) !important;
            }
            
            /* 手機版特殊優化 */
            @media (max-width: 768px) {
                #vnHistoryChoiceModalMain .vn-history-choice-container {
                    width: 90% !important;
                    max-width: none !important;
                    margin: 20px !important;
                    padding: 20px !important;
                }
                
                #vnHistoryChoiceModalMain .vn-history-choice-title {
                    font-size: 20px !important;
                }
                
                #vnHistoryChoiceModalMain .history-choice-button {
                    padding: 12px !important;
                    font-size: 13px !important;
                    margin-bottom: 8px !important;
                }
                
                #vnHistoryChoiceModalMain .history-item-id {
                    font-size: 14px !important;
                }
                
                #vnHistoryChoiceModalMain .history-item-preview {
                    font-size: 12px !important;
                    line-height: 1.3 !important;
                }
            }
        </style>
    `;
    
    // 移除舊的樣式（如果存在）
    const existingStyles = document.getElementById('mobile-history-choice-styles');
    if (existingStyles) {
        existingStyles.remove();
    }
    
    // 添加新的樣式
    document.head.insertAdjacentHTML('beforeend', mobileOptimizedStyles);
    
    vnHistoryChoiceContentMain.innerHTML = ''; 
    
    if (!historyList?.length) { 
        vnHistoryChoiceContentMain.innerHTML = '<p style="text-align:center; padding:20px; color:#4a5568; font-weight:500;">沒有找到歷史劇情記錄。</p>'; 
    } else { 
        const ul = document.createElement('ul'); 
        ul.className = 'history-choice-list'; 
        
        historyList.forEach(item => { 
            ul.innerHTML += `
                <li> 
                    <button class="history-choice-button" title="載入 ID: ${item.id}\n預覽: ${item.preview}" data-message-id="${item.id}"> 
                        <span class="history-item-id">ID: ${item.id}</span> 
                        <span class="history-item-preview">${item.preview}</span> 
                    </button> 
                </li>`; 
        }); 
        
        vnHistoryChoiceContentMain.appendChild(ul);
        
        // 替換📖圖標為自定義圖片
        setTimeout(() => {
            ul.querySelectorAll('.history-item-preview').forEach(preview => {
                if (preview.textContent.includes('📖')) {
                    preview.innerHTML = preview.innerHTML.replace('📖', '<img src="https://files.catbox.moe/qndoqu.png" alt="劇情" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">');
                }
            });
        }, 100); 
        
        // 【關鍵修復】點擊歷史項目時的處理
        ul.addEventListener('click', e => { 
            const button = e.target.closest('.history-choice-button'); 
            if (button) { 
                const messageId = button.dataset.messageId; 
                if (window.VNFeatures?.playSound) window.VNFeatures.playSound('choiceSelectSound'); 
                
                // 🔥 新增：在載入歷史劇情前，確保對話框狀態完全正確
                // console.log('[VN面板-手机版] 準備載入歷史劇情，確保對話框狀態');
                
                // 確保對話框完全可見且狀態正確
                if (dialogBoxGlobalRef) {
                    dialogBoxGlobalRef.style.display = 'flex';
                    dialogBoxGlobalRef.style.visibility = 'visible';
                    dialogBoxGlobalRef.classList.remove('hiding');
                    // console.log('[VN面板-手机版] 已確保對話框全局引用狀態正確（歷史劇情載入前）');
                }
                
                // 重置對話框相關狀態
                if (nameTag) {
                    nameTag.style.display = 'none';
                    nameTag.classList.remove('hiding');
                }
                
                // 確保對話框容器狀態正確
                const dialogBox = document.querySelector('.dialog-box');
                if (dialogBox) {
                    dialogBox.style.visibility = 'visible';
                    dialogBox.style.display = 'flex';
                    // console.log('[VN面板-手机版] 已確保對話框容器狀態正確（歷史劇情載入前）');
                }
                
                sendMessageToProcessor({ 
                    type: 'VN_PROCESS_HISTORY_ITEM', 
                    messageId: messageId 
                }); 
                
                // 🆕 修復：關閉主容器的歷史窗口
                const windowId = window.VNHistoryWindowManager?.WINDOW_IDS.MAIN;
                if (window.VNHistoryWindowManager?.closeHistoryWindow(windowId)) {
                    if (vnHistoryChoiceModalMain) {
                        vnHistoryChoiceModalMain.classList.remove('modal-active');
                        vnHistoryChoiceModalMain.style.display = 'none';
                        console.log('[VN面板-剧情页面] 已關閉主容器歷史選擇窗口');
                    }
                }
                
                // 選擇歷史項目後，切換到主界面顯示劇情
                if (typeof showVNMainContainer === 'function') {
                    // 🔥 新增：通知父窗口停止音樂（歷史劇情載入時）
                    try {
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({
                                type: 'VN_STOP_MAIN_MUSIC',
                                source: 'VN_PANEL_HISTORY_LOAD',
                                timestamp: Date.now()
                            }, '*');
                            console.log('[VN面板-手机版] 歷史劇情載入時已通知父窗口停止音樂');
                        }
                    } catch (error) {
                        console.error('[VN面板-手机版] 歷史劇情載入時通知父窗口停止音樂失敗:', error);
                    }
                    
                    // 立即通知父窗口展開iframe尺寸
                    if (typeof notifyParentIframeResize === 'function') {
                        notifyParentIframeResize('story');
                    }
                    showVNMainContainer();
                }
            } 
        }); 
    } 
    
    if (!vnHistoryChoiceModalMain.classList.contains('modal-active')) { 
        vnHistoryChoiceModalMain.classList.add('modal-active'); 
    } 
}

/**
 * 检查并恢复继续剧情按钮的函数
 */
// 3. 智能恢復按鈕檢查函數
function checkAndRestoreContinueButton() {
    // 检查当前是否在 VN 主界面且对话已完成
    const vnMainContainer = document.getElementById('vnMainContainer');
    const isInVNMain = vnMainContainer && vnMainContainer.classList.contains('active');
    const isDialogueComplete = window.VNCoreAPI?.currentDialogueIndex >= (window.VNCoreAPI?.vnData?.dialogues?.length || 0);
    const hasValidDialogues = window.VNCoreAPI?.vnData?.dialogues && window.VNCoreAPI.vnData.dialogues.length > 0;
    const hasChoices = window.VNCoreAPI?.vnData?.choices && window.VNCoreAPI.vnData.choices.length > 0;
    
     console.log('[VN面板-手机版] 检查继续剧情按钮状态:', {
        isInVNMain,
        isDialogueComplete,
        hasValidDialogues,
        hasChoices
    });
    
    // 如果在VN主界面，对话完成，有有效对话，且没有选择，则重新显示继续剧情按钮
    if (isInVNMain && isDialogueComplete && hasValidDialogues && !hasChoices) {
        // console.log('[VN面板-手机版] 延遲重新显示继续剧情按钮');
        // 延迟一点时间确保历史窗口完全关闭和歷史劇情注入完成
        setTimeout(() => {
            // 再次檢查狀態，避免在歷史劇情注入過程中錯誤顯示
            const currentDialogues = window.VNCoreAPI?.vnData?.dialogues;
            if (!currentDialogues || currentDialogues.length === 0) {
                // console.log('[VN面板-手机版] 歷史劇情可能正在載入，暫不顯示繼續按鈕');
                return;
            }
            
            if (typeof createContinueStoryButton === 'function') {
                createContinueStoryButton();
                
                // 🚀 通知父窗口：VN面板恢復繼續劇情按鈕，需要顯示iframe關閉鍵
                try {
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({
                            type: 'VN_WINDOW_CHANGE',
                            inStoryMode: false, // 恢復繼續劇情按鈕時，視為非劇情模式，需要顯示關閉鍵
                            source: 'VN_PANEL',
                            timestamp: Date.now()
                        }, '*');
                        // console.log('[VN面板-手机版] 已通知父窗口顯示關閉鍵（恢復繼續劇情按鈕）');
                    }
                } catch (error) {
                    // console.error('[VN面板-手机版] 通知父窗口失敗:', error);
                }
            }
        }, 1000); // 增加延遲時間，確保歷史劇情注入完成
    }
}


// 4. 歷史窗口事件監聽器設置
function setupHistoryModalEventListeners() {
    // VN主容器中的历史窗口
    const vnHistoryChoiceModalMain = document.querySelector('#vnHistoryChoiceModalMain');
    const closeVnHistoryChoiceMain = vnHistoryChoiceModalMain?.querySelector('.close-vn-history-choice');
    
    if (closeVnHistoryChoiceMain) {
        closeVnHistoryChoiceMain.addEventListener('click', function() {
            // console.log('[VN面板-手机版] 關閉歷史劇情選擇窗口');
            vnHistoryChoiceModalMain.classList.remove('modal-active');
            checkAndRestoreContinueButton();
        });
    }
    
    if (vnHistoryChoiceModalMain) {
        vnHistoryChoiceModalMain.addEventListener('click', function(e) {
            if (e.target === vnHistoryChoiceModalMain) {
                // console.log('[VN面板-手机版] 點擊背景關閉歷史劇情選擇窗口');
                vnHistoryChoiceModalMain.classList.remove('modal-active');
                checkAndRestoreContinueButton();
            }
        });
    }
}


/**
 * 修复后的历史窗口事件监听器设置
 */
function setupFixedHistoryEventListeners() {
    // 为VN主容器中的历史窗口添加事件监听器
    const vnHistoryChoiceModalMain = document.querySelector('#vnHistoryChoiceModalMain');
    const closeVnHistoryChoiceMain = vnHistoryChoiceModalMain?.querySelector('.close-vn-history-choice');
    
    if (closeVnHistoryChoiceMain) {
        closeVnHistoryChoiceMain.addEventListener('click', function() {
            // console.log('[VN面板-手机版] 關閉歷史劇情選擇窗口');
            vnHistoryChoiceModalMain.classList.remove('modal-active');
            
            // 检查是否需要重新显示继续剧情按钮
            checkAndRestoreContinueButton();
        });
    }
    
    if (vnHistoryChoiceModalMain) {
        vnHistoryChoiceModalMain.addEventListener('click', function(e) {
            if (e.target === vnHistoryChoiceModalMain) {
                // console.log('[VN面板-手机版] 點擊背景關閉歷史劇情選擇窗口');
                vnHistoryChoiceModalMain.classList.remove('modal-active');
                
                // 检查是否需要重新显示继续剧情按钮
                checkAndRestoreContinueButton();
            }
        });
    }
    
    // 为启动页面的历史窗口也添加清理功能
    const vnHistoryChoiceModal = document.querySelector('#vnHistoryChoiceModal');
    const closeVnHistoryChoice = vnHistoryChoiceModal?.querySelector('.close-vn-history-choice');
    
    if (closeVnHistoryChoice) {
        closeVnHistoryChoice.addEventListener('click', function() {
            vnHistoryChoiceModal.classList.remove('modal-active');
            
            // 清理可能存在的继续剧情界面元素
            const existingBackdrop = document.querySelector('.continue-story-backdrop');
            const existingActionsBar = document.querySelector('.continue-story-actions-bar');
            if (existingBackdrop) {
                existingBackdrop.remove();
            }
            if (existingActionsBar) {
                existingActionsBar.remove();
            }
            // console.log('[VN面板-手机版] 启动页面历史窗口关闭，已清理继续剧情界面元素');
            
            // 確保返回啟動界面
            if (typeof showVNLandingContainer === 'function') {
                showVNLandingContainer();
            }
        });
    }
    
    if (vnHistoryChoiceModal) {
        vnHistoryChoiceModal.addEventListener('click', function(e) {
            if (e.target === vnHistoryChoiceModal) {
                vnHistoryChoiceModal.classList.remove('modal-active');
                
                // 清理可能存在的继续剧情界面元素
                const existingBackdrop = document.querySelector('.continue-story-backdrop');
                const existingActionsBar = document.querySelector('.continue-story-actions-bar');
                if (existingBackdrop) {
                    existingBackdrop.remove();
                }
                if (existingActionsBar) {
                    existingActionsBar.remove();
                }
                // console.log('[VN面板-手机版] 启动页面历史窗口背景点击关闭，已清理继续剧情界面元素');
                
                // 確保返回啟動界面
                if (typeof showVNLandingContainer === 'function') {
                    showVNLandingContainer();
                }
            }
        });
    }
}

// 在页面加载完成后调用此函数
document.addEventListener('DOMContentLoaded', function() {
    setupFixedHistoryEventListeners();
});

// =======================================================================
//                            全域導出
// =======================================================================

// 添加到全局VNCoreAPI
if (window.VNCoreAPI) {
    Object.assign(window.VNCoreAPI, {
        // 核心功能
        updateCurrentUI: updateUI, 
        proceedToNextDialogue: nextDialogue, 
        nextDialogue, 
        makeChoice: sendChoiceToChatInterface, 
        playSoundEffects, 
        startTypewriter, 
        stopTypewriter, 
        showFullText, 
        addToDialogueHistory, 
        updateHistoryContent, 
        toggleModalHelper, 
        showUserInputDialog, 
        closeUserInputDialog,
        
        // 新增：继续剧情功能
        createContinueStoryButton,
        triggerNovelist,
        updateChoices,
        
        // 新增：歷史劇情功能
        displayVNHistoryChoicesInMain
    });
}

// 添加到全局VNCore
if (window.VNCore) {
    Object.assign(window.VNCore, {
        // 核心功能（手机版简化）
        updateCurrentUI: updateUI, 
        proceedToNextDialogue: nextDialogue, 
        nextDialogue, 
        makeChoice: sendChoiceToChatInterface, 
        playSoundEffects, 
        startTypewriter, 
        stopTypewriter, 
        showFullText, 
        addToDialogueHistory, 
        updateHistoryContent, 
        toggleModalHelper, 
        showUserInputDialog, 
        closeUserInputDialog,
        
        // 新增：继续剧情功能
        createContinueStoryButton,
        triggerNovelist,
        updateChoices,
        
        // 新增：歷史劇情功能
        displayVNHistoryChoicesInMain,
        
        // 状态更新
        updatePanelStatus: function(statusData) {
            if (!statusData) return;
            let changed = false;
            
            if (statusData.userData) { 
                if (!vnData.userData) vnData.userData = {}; 
                for (const key in statusData.userData) { 
                    if (vnData.userData[key] !== statusData.userData[key]) { 
                        vnData.userData[key] = statusData.userData[key]; 
                        changed = true; 
                    } 
                } 
            }
            
            if (!vnData.charData) vnData.charData = {};
            let relationshipsChanged = false;
            
            if (statusData.charData && statusData.charData.rawCharacters) { 
                if (JSON.stringify(vnData.charData.rawCharacters) !== JSON.stringify(statusData.charData.rawCharacters)) { 
                    vnData.charData.rawCharacters = statusData.charData.rawCharacters; 
                    relationshipsChanged = true; 
                } 
            }
            
            if (statusData.rawCharadata !== undefined) { 
                if (vnData.rawCharadata !== statusData.rawCharadata) { 
                    vnData.rawCharadata = statusData.rawCharadata; 
                    relationshipsChanged = true; 
                } 
            }
            
            if (relationshipsChanged) {
                if (!vnData.userData) vnData.userData = {}; 
                if (vnData.charData.rawCharacters && vnData.charData.rawCharacters.length > 0) { 
                    vnData.userData.favorabilityList = vnData.charData.rawCharacters.map(entry => ({ 
                        character: entry.to, 
                        value: entry.states 
                    })); 
                }
                changed = true;
            }
            
            if (statusData.hasOwnProperty('accumulatedMemoryNotes')) {
                if (!vnData.sceneInfo) vnData.sceneInfo = {};
                const newNotesString = JSON.stringify(statusData.accumulatedMemoryNotes || []);
                const oldNotesString = JSON.stringify(vnData.sceneInfo.memoryNotes || []);
                if (newNotesString !== oldNotesString) { 
                    vnData.sceneInfo.memoryNotes = statusData.accumulatedMemoryNotes || []; 
                    updateMailbox(); 
                    changed = true; 
                }
            }
            
            if (statusData.sceneInfo) {
                if (!vnData.sceneInfo) vnData.sceneInfo = {};
                let sceneDetailsChanged = false;
                
                if (statusData.sceneInfo.location !== undefined && vnData.sceneInfo.location !== statusData.sceneInfo.location) { 
                    vnData.sceneInfo.location = statusData.sceneInfo.location; 
                    sceneDetailsChanged = true; 
                    
                    // 檢查是否剛應用了AI背景圖片，如果是則不立即更新背景
                    if (backgroundImageState && 
                        backgroundImageState.lastAppliedTime && 
                        Date.now() - backgroundImageState.lastAppliedTime < 5000 && // 5秒內不覆蓋
                        backgroundImageState.appliedImageUrl && 
                        backgroundImageState.appliedImageUrl.includes('pollinations.ai')) {
                        // console.log('[VN面板-手机版] AI背景圖片剛應用不久，跳過自動背景更新:', backgroundImageState.appliedImageUrl);
                    } else {
                        updateBackground(); 
                    }
                }
                if (statusData.sceneInfo.bgm !== undefined && vnData.sceneInfo.bgm !== statusData.sceneInfo.bgm) { 
                    console.log(`[VN面板-手机版] 🎵 狀態更新檢測到BGM變化: ${vnData.sceneInfo.bgm} -> ${statusData.sceneInfo.bgm}`);
                    vnData.sceneInfo.bgm = statusData.sceneInfo.bgm; 
                    sceneDetailsChanged = true; 
                    // 🔥 改進：延遲調用BGM更新，避免頻繁切換
                    setTimeout(() => {
                        if (window.VNFeatures?.updateBGM) {
                            window.VNFeatures.updateBGM(); 
                        }
                    }, 150);
                }
                if (statusData.sceneInfo.date !== undefined && vnData.sceneInfo.date !== statusData.sceneInfo.date) { 
                    vnData.sceneInfo.date = statusData.sceneInfo.date; 
                    sceneDetailsChanged = true; 
                }
                if (statusData.sceneInfo.time !== undefined && vnData.sceneInfo.time !== statusData.sceneInfo.time) { 
                    vnData.sceneInfo.time = statusData.sceneInfo.time; 
                    sceneDetailsChanged = true; 
                }
                
                if (sceneDetailsChanged) changed = true;
            }
            
            if (changed) {
                // console.log('[VN面板-手机版] 状态数据已更改，触发UI更新');
                updateCharacterStats();
            } else {
                // console.log('[VN面板-手机版] 状态数据无变化');
            }
        }
    });
}
