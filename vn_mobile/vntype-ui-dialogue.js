/**
 * VN Type UI Dialogue - 手机版对话系统和UI模块 v20.1
 * 
 * 包含: 对话更新、打字机效果、选择系统、用户输入处理、UI功能
 */

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
    currentText = dialogue.content || "";
    let currentTextWithMarkdown = window.processMarkdown ? 
        window.processMarkdown(currentText) : currentText;
    dialogBoxGlobalRef.style.backgroundColor = 'var(--dialog-bg)'; 
    let charNameText = '旁白'; 
    if(nameTag) nameTag.style.display = 'none'; 
    
    // 根据对话类型设置样式
    switch (dialogue.type) {
        case 'narrative':
            dialogBoxGlobalRef.style.backgroundColor = 'var(--narrative-bg)';
            break;
        case 'protagonist':
        case 'character':
            if(nameTag) {
                nameTag.style.display = 'inline-block';
                // 修正：只在真正切换对话时播放动画，添加特殊类来触发动画
                nameTag.classList.add('show-animation');
                // 动画播放后移除类，避免重复触发
                setTimeout(() => {
                    if(nameTag) nameTag.classList.remove('show-animation');
                }, 400);
            }
            charNameText = dialogue.name || 'Unknown';
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
                (window.processMarkdown ? window.processMarkdown('[Empty dialogue content]') : '[Empty dialogue content]'); 
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
        if (dialogBoxGlobalRef && dialogBoxGlobalRef.style.display !== 'none' && !dialogBoxGlobalRef.classList.contains('hiding')) {
            dialogBoxGlobalRef.classList.add('hiding'); 
            if (nameTag) nameTag.classList.add('hiding');
            
            dialogBoxGlobalRef.addEventListener('animationend', function handleNextAnimEnd() { 
                dialogBoxGlobalRef.removeEventListener('animationend', handleNextAnimEnd); 
                currentDialogueIndex++; 
                updateDialogue(); 
            }, { once: true });
        } else { 
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
    let plainText = currentText; 
    let processedHtml = null; 
    
    if (useMarkdown) { 
        processedHtml = window.processMarkdown(currentText); 
        const tempDiv = document.createElement('div'); 
        tempDiv.innerHTML = processedHtml; 
        plainText = tempDiv.textContent || currentText; 
    } 
    
    dialogText.textContent = ''; 
    currentCharIndex = 0; 
    isTyping = true; 
    typewriterCursor.style.display = 'none'; 
    textIndicator.style.display = 'none'; 
    
    // 預先創建臨時容器，避免在打字過程中重複創建
    if (useMarkdown && processedHtml && !window.tempMdContainer) {
        window.tempMdContainer = document.createElement('div'); 
        // 使用固定寬度而不是動態獲取，避免觸發重排
        const dialogBox = dialogText.closest('.dialog-box');
        const dialogBoxWidth = dialogBox ? dialogBox.clientWidth - 40 : 300; // 預設寬度，減去padding
        
        Object.assign(window.tempMdContainer.style, {
            position: 'absolute', 
            visibility: 'hidden', 
            width: dialogBoxWidth + 'px', 
            minHeight: '100px', 
            padding: '10px 20px', // 使用固定padding
            fontSize: '15px', // 使用固定字體大小
            lineHeight: '1.6', // 使用固定行高
            top: '-9999px', // 確保在視窗外
            left: '-9999px'
        }); 
        document.body.appendChild(window.tempMdContainer); 
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
            
            if (useMarkdown && processedHtml) { 
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
    
    if (typeof window.processMarkdown === 'function' && currentText) { 
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
            console.log('[VN面板-手机版] 对话完成且无选择，显示继续剧情按钮');
            createContinueStoryButton();
            choicesContainer.classList.remove(CSS_HIDDEN);
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
            console.log('[VN面板-手机版] 选择已做出，显示loading动画');
            if (window.VNFeatures?.showLoadingAnimation) window.VNFeatures.showLoadingAnimation();
            sendChoiceToChatInterface(choice);
            choicesContainer.classList.add(CSS_HIDDEN);
        }
    });
    
    choicesContainer.appendChild(button); 
}

function sendChoiceToChatInterface(choice) {
    console.log('[VN面板-JCY版] 发送选择到JCY主系统:', choice);
    
    // 发送选择事件到JCY主系统
    window.parent.postMessage({
        type: 'VN_CHOICE',
        choice: choice
    }, '*');
}

/**
 * 创建"继续剧情"按钮
 */
function createContinueStoryButton() {
    // 1. 隱藏主對話框
    const dialogBox = document.querySelector('.dialog-box');
    if (dialogBox) {
        dialogBox.style.visibility = 'hidden';
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
    let continueBtn = document.createElement('div');
    continueBtn.className = 'choice-button continue-story-button';
    continueBtn.innerHTML = '📚 繼續劇情';
    continueBtn.title = '分析角色狀態並繼續推進劇情，不可重複劇情';
    continueBtn.style.background = 'linear-gradient(135deg, #4a90e2, #357abd)';
    continueBtn.style.color = '#ffffff';
    continueBtn.style.fontWeight = 'bold';
    continueBtn.style.position = 'relative';
    continueBtn.style.left = '';
    continueBtn.style.top = '';
    continueBtn.style.transform = '';
    continueBtn.style.zIndex = '';
    continueBtn.addEventListener('mouseenter', () => {
        if (window.VNFeatures?.playHoverSound) window.VNFeatures.playHoverSound();
    });
    continueBtn.addEventListener('click', () => {
        if (dialogBox) dialogBox.style.visibility = '';
        if (backdrop) {
            backdrop.classList.add('hide');
            setTimeout(() => { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }, 350);
        }
        if (actionsBar) actionsBar.remove();
        triggerNovelist();
    });

    // 5. 建立指令按鈕
    let commandBtn = document.createElement('button');
    commandBtn.className = 'command-button';
    commandBtn.innerHTML = '指令';
    commandBtn.style.fontSize = '16px';
    commandBtn.style.padding = '10px 24px';
    commandBtn.style.borderRadius = '8px';
    commandBtn.style.background = 'linear-gradient(135deg, #382049, #59367a)';
    commandBtn.style.color = '#fff';
    commandBtn.style.fontWeight = 'bold';
    commandBtn.style.border = 'none';
    commandBtn.style.cursor = 'pointer';
    commandBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    commandBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.showCommandInputDialog) {
            window.showCommandInputDialog();
        } else if (window.VNFeatures?.showCommandInputDialog) {
            window.VNFeatures.showCommandInputDialog();
        }
    });

    // 6. 加入到 actions bar
    actionsBar.appendChild(continueBtn);
    actionsBar.appendChild(commandBtn);
}

/**
 * 触发小说家的通用函数（先发送提示内容，再启动AI）
 */
async function triggerNovelist() {
    try {
        console.log('[VN面板-手机版] 开始继续剧情流程');
        
        // 先发送提示内容到聊天室
        await sendPromptToChat();
        
        // 等待一小段时间确保消息发送完成
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 然后启动AI
        await startNovelistAI();
        
    } catch (error) {
        console.error('[VN面板-手机版] 继续剧情流程出错:', error);
        alert('继续剧情时出现错误，请重试。');
        
        // 发生错误时隐藏loading动画
        if (window.VNFeatures?.hideLoadingAnimation) {
            window.VNFeatures.hideLoadingAnimation();
        }
    }
}

/**
 * 发送提示内容到聊天室
 */
async function sendPromptToChat() {
    try {
        const promptMessage = '分析角色當前狀態，繼續推進劇情，不可重複劇情';
        console.log('[VN面板-JCY版] 发送提示内容到JCY主系统:', promptMessage);
        
        // 通过postMessage发送AI请求到JCY主系统
        window.parent.postMessage({
            type: 'VN_AI_REQUEST',
            data: {
                message: promptMessage,
                source: 'VN_PANEL_PROMPT'
            }
        }, '*');
        
        console.log('[VN面板-JCY版] 提示内容已发送到JCY主系统');
        
        // 等待消息发送完成
        await new Promise(resolve => setTimeout(resolve, 300));
        
    } catch (error) {
        console.error('[VN面板-手机版] 发送提示内容失败:', error);
        throw error;
    }
}

/**
 * 启动小说家AI
 */
async function startNovelistAI() {
    try {
        console.log('[VN面板-JCY版] 启动小说家AI');
        
        // 通过postMessage发送AI启动请求到JCY主系统
        window.parent.postMessage({
            type: 'VN_AI_REQUEST',
            data: {
                message: '請繼續推進VN劇情，生成下一段對話或情節',
                source: 'VN_PANEL_NOVELIST_START'
            }
        }, '*');
        
        console.log('[VN面板-JCY版] 小说家AI启动请求已发送到JCY主系统');
        
    } catch (error) {
        console.error('[VN面板-JCY版] 启动小说家AI失败:', error);
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
    console.log('[VN面板-手机版] 用户输入已提交，显示loading动画'); 
    
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
    if (closeVnHistoryChoiceButton) closeVnHistoryChoiceButton.addEventListener('click', () => toggleModalHelper(vnHistoryChoiceModal, null, CSS_MODAL_ACTIVE, null));
    if (vnHistoryChoiceModal) vnHistoryChoiceModal.addEventListener('click', e => { if (e.target === vnHistoryChoiceModal) toggleModalHelper(vnHistoryChoiceModal, null, CSS_MODAL_ACTIVE, null); });
    
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
        console.log(`[VN面板-手机版] 角色关系面板已 ${isCollapsed ? '折叠' : '展开'}`);
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
                    <div class="mail-sender">${note.source || 'Unknown'}</div> 
                    <div class="mail-preview">${note.title || 'No Title'}</div> 
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
        mailList.innerHTML = '<div style="text-align:center; padding:10px; color:#888;">Mailbox is empty.</div>'; 
    } 
}

function showMailContent(note) { 
    if (!mailboxContainer || !mailList) return; 
    
    const mailContentView = mailboxContainer.querySelector('.mail-content-view'); 
    if(mailContentView) mailContentView.remove(); 
    
    const newContentView = document.createElement('div'); 
    newContentView.className = 'mail-content-view'; 
    newContentView.innerHTML = `
        <h3>${note.title || 'No Title'}</h3> 
        <div class="mail-info"> 
            <strong>From:</strong> ${note.source || 'Unknown'} 
            ${note.date ? `| <span>${note.date}</span>` : ''} 
        </div> 
        <div class="mail-body">${(note.content || '').replace(/\n/g, '<br>')}</div> 
        <button class="back-button">Back</button>`; 
    
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
    if (!vnHistoryChoiceModal || !vnHistoryChoiceContent) { 
        console.warn("[VN面板-手机版] VN History Choice Modal/Content 未找到"); 
        return; 
    } 
    
    vnHistoryChoiceContent.innerHTML = ''; 
    
    if (!historyList?.length) { 
        vnHistoryChoiceContent.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">No historical VN messages found.</p>'; 
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
        
        ul.addEventListener('click', e => { 
            const button = e.target.closest('.history-choice-button'); 
            if (button) { 
                const messageId = button.dataset.messageId; 
                if (window.VNFeatures?.playSound) window.VNFeatures.playSound('choiceSelectSound'); 
                sendMessageToProcessor({ 
                    type: 'VN_PROCESS_HISTORY_ITEM', 
                    messageId: messageId 
                }); 
                toggleModalHelper(vnHistoryChoiceModal, null, CSS_MODAL_ACTIVE, null); 
            } 
        }); 
    } 
    
    if (!vnHistoryChoiceModal.classList.contains(CSS_MODAL_ACTIVE)) { 
        toggleModalHelper(vnHistoryChoiceModal, null, CSS_MODAL_ACTIVE, null); 
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
        content: dialogue.content || (dialogue.type === 'area' ? `Area: ${dialogue.areaName}` : ''), 
        name: getDisplayNameForDialogue(dialogue), 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    }); 
}

function getDisplayNameForDialogue(dialogue) { 
    switch(dialogue.type) { 
        case 'narrative': return 'Narrator'; 
        case 'call': return dialogue.name || `Call: ${dialogue.caller || 'Unknown'}`; 
        case 'chat': return `Chat: ${dialogue.chatName || 'Unknown'}`; 
        case 'echo': return `Echo: ${dialogue.echoId || 'Unknown'}`; 
        case 'scene': return 'Scene Change'; 
        case 'area': return 'Area Transition'; 
        case 'transition': return 'Transition'; 
        default: return dialogue.name || 'Unknown Character'; 
    } 
}

function updateHistoryContent() { 
    if (!historyContentEl) return; 
    
    historyContentEl.innerHTML = dialogueHistory.length === 0 ? 
        '<div class="history-empty" style="text-align:center; padding:10px; color:#888;">No dialogue history.</div>' : 
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
        updateChoices
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
                    updateBackground(); 
                }
                if (statusData.sceneInfo.bgm !== undefined && vnData.sceneInfo.bgm !== statusData.sceneInfo.bgm) { 
                    vnData.sceneInfo.bgm = statusData.sceneInfo.bgm; 
                    sceneDetailsChanged = true; 
                    if (window.VNFeatures?.updateBGM) window.VNFeatures.updateBGM(); 
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
                console.log('[VN面板-手机版] 状态数据已更改，触发UI更新');
                updateCharacterStats();
            } else {
                console.log('[VN面板-手机版] 状态数据无变化');
            }
        }
    });
}