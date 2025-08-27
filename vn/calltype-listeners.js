/**
 * Call Type Listeners - Handles call-type dialogues in a visual novel.
 * MODIFIED: 改為手機風格單人通話界面，只顯示對方角色背景
 * REVISED: To correctly process message queue from improved-vn-processor_new.js output
 * REVISED AGAIN: To ensure last message remains visible until "End Call" is clicked.
 * NEW: Added incoming call transition interface before showing the call dialog
 * UPDATED: 支持Call_Narrator格式 + 音效支持
 * SOUND: 每条Call消息都支持独立音效（单音效或多音效）
 */

// ===== Call Dialogue State =====
let currentCallState = {
    isActive: false,
    dialogues: [],
    otherSpeaker: null, 
    otherBackground: '',
    messageQueue: [],
    currentMessageIndex: 0,
    allMessagesShown: false,
    protagonistName: '',
    isClosing: false,
    isInIncomingCallPhase: false  // 新增：是否在来电接听阶段
  };

  // DOM Element Constants
  const CALL_DIALOG_ID = 'callDialog';
  const CALL_MESSAGES_SELECTOR = '.call-messages';
  const CALL_DESCRIPTIONS_SELECTOR = '.call-descriptions';
  const END_CALL_BUTTON_ID = 'end-call-dialog';
  const CLOSE_CALL_DIALOG_SELECTOR = '.close-call-dialog';
  const INCOMING_CALL_CONTAINER_ID = 'incoming-call-container';
  const ONGOING_CALL_CONTAINER_ID = 'ongoing-call-container';
  
  // 新增：来电接听界面的选择器
  const INCOMING_CALL_INTERFACE_ID = 'incoming-call-interface';
  const CALL_CONTENT_INTERFACE_ID = 'call-content-interface';
  const ANSWER_CALL_BUTTON_ID = 'answer-call-button';
  const DECLINE_CALL_BUTTON_ID = 'decline-call-button';

  // ===== Initialization & Helpers =====

  function detectProtagonistName() {
    const sources = [
      () => window.VNCore?.vnData?.narrator?.mainPerspective,
      () => window.parent?.VNCore?.vnData?.narrator?.mainPerspective,
      () => (window.VNCore?.vnData?.dialogues || window.parent?.VNCore?.vnData?.dialogues)?.find(d => d.type === 'protagonist' && d.name)?.name,
      () => (window.VNCore?.dialogueHistory || window.parent?.VNCore?.dialogueHistory)?.find(h => h.type === 'protagonist' && h.name)?.name
    ];

    for (const source of sources) {
      try {
        const name = source();
        if (name) {
          currentCallState.protagonistName = name;
          return true;
        }
      } catch (e) {
        // console.warn('[CallType] Error detecting protagonist name from a source:', e);
      }
    }
    return false;
  }

  function updateOtherSpeakerUI(name, expression, background, state) {
      if (name === state.protagonistName) {
          return; 
      }
      const nameEl = document.querySelector('#' + CALL_DIALOG_ID + ' .other-character-name');
      if (nameEl) nameEl.textContent = name;
      
      // 同时更新来电界面的呼叫者名称
      const incomingNameEl = document.querySelector('#' + CALL_DIALOG_ID + ' .incoming-caller-name');
      if (incomingNameEl) incomingNameEl.textContent = name;
      
      state.otherSpeaker = name; 
      if (background && background !== state.otherBackground) {
          state.otherBackground = background;
          updateCallBackground(background);
      } else if (!background && state.otherBackground) {
          // updateCallBackground(null); 
      }
      updateCallCharacter(name, expression);
      updateIncomingCallCharacter(name, expression); // 新增：更新来电界面头像
  }

  // ===== Main Call Handling =====
  function handleCallDialogue(dialogue, allCallMessages = null) {
      if (!currentCallState.protagonistName) {
          detectProtagonistName();
      }
      if (!currentCallState.isActive) {
          initializeCallDialog();
      }
      currentCallState.isActive = true;
      currentCallState.isInIncomingCallPhase = true; // 设置为来电阶段
      currentCallState.messageQueue = []; 

      if (dialogue.type === 'call' && dialogue.callMessages && Array.isArray(dialogue.callMessages)) {
          let otherSpeakerForUI = dialogue.name; 
          if (dialogue.callDirection && currentCallState.protagonistName) {
              const parts = dialogue.callDirection.split('→').map(namePart => namePart.trim());
              const potentialCaller = parts[0];
              const potentialRecipient = parts.length > 1 ? parts[1] : null;
              if (currentCallState.protagonistName === potentialRecipient) {
                  otherSpeakerForUI = potentialCaller;
              } else if (currentCallState.protagonistName === potentialCaller && potentialRecipient) {
                  otherSpeakerForUI = potentialRecipient;
              } else {
                  otherSpeakerForUI = potentialCaller; 
              }
          }
          updateOtherSpeakerUI(otherSpeakerForUI, undefined, undefined, currentCallState);

          dialogue.callMessages.forEach(msg => {
              // 处理Call_Narrator类型的消息
              if (msg.isCallNarrator || msg.speaker === 'Call_Narrator') {
                  currentCallState.messageQueue.push({
                      position: 'center',
                      content: msg.content || "",
                      speaker: 'Call_Narrator',
                      isProtagonist: false,
                      isCallNarrator: true,
                      actionDesc: "",
                      soundEffect: msg.soundEffect // 新增：音效支持
                  });
                  console.log(`[CallType] 添加Call旁白消息: ${msg.content?.substring(0, 30)}... 音效: ${msg.soundEffect || 'none'}`);
              } else {
                  // 处理普通角色对话
                  let messagePosition = 'left'; 
                  if (currentCallState.protagonistName && msg.speaker === currentCallState.protagonistName) {
                      messagePosition = 'right';
                  }
                  let actualContent = msg.content || "";
                  let actionDesc = "";
                  if (typeof actualContent === 'string' && actualContent.startsWith("(") && actualContent.endsWith(")")) {
                      actionDesc = actualContent.substring(1, actualContent.length - 1).trim();
                      actualContent = ""; 
                  }
                  currentCallState.messageQueue.push({
                      position: messagePosition, 
                      content: actualContent, 
                      speaker: msg.speaker,
                      isProtagonist: msg.speaker === currentCallState.protagonistName, 
                      isCallNarrator: false,
                      actionDesc: actionDesc,
                      soundEffect: msg.soundEffect // 新增：音效支持
                  });
                  console.log(`[CallType] 添加角色对话消息: ${msg.speaker} - ${actualContent?.substring(0, 30)}... 音效: ${msg.soundEffect || 'none'}`);
              }
          });
      } else {
          console.warn("[CallType] dialogue.callMessages not found. Processing as single message.", dialogue);
          let messagePosition = 'left';
          if (currentCallState.protagonistName && dialogue.name === currentCallState.protagonistName) {
              messagePosition = 'right';
          }
          let qContent = dialogue.content || "";
          let qActionDesc = "";
          if (typeof qContent === 'string' && qContent.startsWith("(") && qContent.endsWith(")")) {
              qActionDesc = qContent.substring(1, qContent.length - 1).trim();
              qContent = "";
          }
          currentCallState.messageQueue.push({
              position: messagePosition, 
              content: qContent, 
              speaker: dialogue.name,
              isProtagonist: dialogue.name === currentCallState.protagonistName, 
              isCallNarrator: false,
              actionDesc: qActionDesc,
              soundEffect: dialogue.soundEffect // 保持对旧格式的兼容
          });
          if (dialogue.name !== currentCallState.protagonistName) {
               updateOtherSpeakerUI(dialogue.name, dialogue.expression, dialogue.background, currentCallState);
          }
      }
      
      // 显示来电界面而不是直接显示通话内容
      showIncomingCallInterface();
      const soundToPlay = dialogue.soundEffect || 'callSound';
      const playSoundFn = window.VNCore?.playSound || window.parent?.VNCore?.playSound;
      if (playSoundFn) playSoundFn(soundToPlay);
  }

  function initializeCallDialog() {
      if (window.callTimeoutId) clearTimeout(window.callTimeoutId);
      window.callTimeoutId = null;
      if (window.callDurationTimer) {
          clearInterval(window.callDurationTimer);
          window.callDurationTimer = null;
      }
      currentCallState = {
          isActive: true, dialogues: [], otherSpeaker: null, otherBackground: '',
          messageQueue: [], currentMessageIndex: 0, allMessagesShown: false,
          protagonistName: currentCallState.protagonistName || '', 
          isClosing: false,
          isInIncomingCallPhase: false
      };
      if (!currentCallState.protagonistName) detectProtagonistName();
      const messagesContainer = document.querySelector('#' + CALL_DIALOG_ID + ' ' + CALL_MESSAGES_SELECTOR);
      const descriptionsContainer = document.querySelector('#' + CALL_DIALOG_ID + ' ' + CALL_DESCRIPTIONS_SELECTOR); 
      if (messagesContainer) messagesContainer.innerHTML = '';
      if (descriptionsContainer) {
          descriptionsContainer.innerHTML = '';
          descriptionsContainer.style.display = 'none';
      }
      
      setupIncomingCallEventListeners(); // 新增：设置来电界面事件监听
      setupCallEndEventListeners(); // 设置通话结束事件监听
  }

  // 新增：设置来电界面事件监听
  function setupIncomingCallEventListeners() {
      const answerBtn = document.getElementById(ANSWER_CALL_BUTTON_ID);
      const declineBtn = document.getElementById(DECLINE_CALL_BUTTON_ID);
      
      if (answerBtn) {
          const newAnswerBtn = answerBtn.cloneNode(true);
          answerBtn.parentNode.replaceChild(newAnswerBtn, answerBtn);
          newAnswerBtn.addEventListener('click', () => {
              answerCall();
          });
      }
      
      if (declineBtn) {
          const newDeclineBtn = declineBtn.cloneNode(true);
          declineBtn.parentNode.replaceChild(newDeclineBtn, declineBtn);
          newDeclineBtn.addEventListener('click', () => {
              declineCall();
          });
      }
  }

  // 设置通话结束事件监听
  function setupCallEndEventListeners() {
      const endCallBtn = document.getElementById(END_CALL_BUTTON_ID);
      if (endCallBtn) {
          const newEndCallBtn = endCallBtn.cloneNode(true); 
          endCallBtn.parentNode.replaceChild(newEndCallBtn, endCallBtn);
          newEndCallBtn.classList.remove('pulse-animation');
          newEndCallBtn.addEventListener('click', () => {
              if (!currentCallState.isClosing) {
                  closeCallDialog();
                  if(currentCallState.isActive && window.parent) {
                       window.parent.postMessage({ type: 'VN_CALL_ENDED', caller: currentCallState.otherSpeaker || 'Unknown' }, '*');
                  }
              }
          });
      }
      const closeButton = document.querySelector('#' + CALL_DIALOG_ID + ' ' + CLOSE_CALL_DIALOG_SELECTOR);
      if (closeButton) { 
          const newCloseButton = closeButton.cloneNode(true);
          closeButton.parentNode.replaceChild(newCloseButton, closeButton);
          newCloseButton.addEventListener('click', () => { if (!currentCallState.isClosing) closeCallDialog(); });
      }
  }

  // 新增：显示来电接听界面
  function showIncomingCallInterface() {
      const callDialogEl = document.getElementById(CALL_DIALOG_ID);
      const incomingInterface = document.getElementById(INCOMING_CALL_INTERFACE_ID);
      const callContentInterface = document.getElementById(CALL_CONTENT_INTERFACE_ID);
      
      if (callDialogEl && incomingInterface && callContentInterface) {
          // 显示模态窗口
          callDialogEl.classList.add('active');
          
          // 显示来电界面，隐藏通话内容界面
          incomingInterface.style.display = 'flex';
          callContentInterface.style.display = 'none';
          
          console.log('[CallType] 显示来电接听界面');
          
          const playSoundFn = window.VNCore?.playSound || window.parent?.VNCore?.playSound;
          if (playSoundFn) playSoundFn('callSound');
      } else {
          console.error("[CallType] 来电界面元素未找到，回退到直接显示通话界面");
          showCallContentInterface();
      }
  }

  // 新增：接听电话
  function answerCall() {
      console.log('[CallType] 用户选择接听电话');
      currentCallState.isInIncomingCallPhase = false;
      
      const playSoundFn = window.VNCore?.playSound || window.parent?.VNCore?.playSound;
      if (playSoundFn) playSoundFn('clickSound');
      
      // 切换到通话内容界面
      showCallContentInterface();
      
      // 开始通话计时和消息显示
      startCallTimer();
      if (currentCallState.messageQueue.length > 0 && currentCallState.currentMessageIndex === 0) {
          showNextCallMessage();
          addClickToAdvanceListener(); 
      }
  }

  // 新增：拒绝电话（暂时只是关闭，保留为以后扩展功能）
  function declineCall() {
      console.log('[CallType] 用户选择拒绝电话（暂时直接关闭）');
      
      const playSoundFn = window.VNCore?.playSound || window.parent?.VNCore?.playSound;
      if (playSoundFn) playSoundFn('callEndSound');
      
      // 暂时直接关闭通话窗口，以后可以添加拒绝逻辑
      closeCallDialog();
  }

  // 新增：显示通话内容界面
  function showCallContentInterface() {
      const incomingInterface = document.getElementById(INCOMING_CALL_INTERFACE_ID);
      const callContentInterface = document.getElementById(CALL_CONTENT_INTERFACE_ID);
      
      if (incomingInterface && callContentInterface) {
          // 隐藏来电界面，显示通话内容界面
          incomingInterface.style.display = 'none';
          callContentInterface.style.display = 'flex';
          
          console.log('[CallType] 切换到通话内容界面');
      }
  }

  function startCallTimer() {
      let seconds = 0;
      const timeIndicator = document.querySelector('#' + CALL_DIALOG_ID + ' .call-time-indicator');
      if (timeIndicator) {
          if (window.callDurationTimer) clearInterval(window.callDurationTimer);
          timeIndicator.textContent = '00:00'; 
          window.callDurationTimer = setInterval(() => {
              seconds++;
              const minutes = Math.floor(seconds / 60);
              const secs = seconds % 60;
              timeIndicator.textContent = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
          }, 1000);
      }
  }

  function updateCallBackground(backgroundName) {
      const bgContainer = document.querySelector('#' + CALL_DIALOG_ID + ' .call-single-background');
      if (bgContainer) {
          if (!backgroundName) {
              return;
          }
          const cleanBgName = String(backgroundName).replace(/，.*$/g, '').trim();
          const bgUrl = `https://github.com/nancywang3641/sound-files/scene_img/${cleanBgName}.jpg`;
          bgContainer.style.backgroundImage = `url('${bgUrl}')`;
      }
  }

  function updateCallCharacter(name, expression) {
      const imgEl = document.querySelector('#' + CALL_DIALOG_ID + ' .other-character-image');
      if (imgEl) {
          let imgSrc = `https://github.com/nancywang3641/sound-files/char_img/${expression || String(name) + '_default' || 'default'}.png`;
          if (window.parent?.VNResources?.getCharacterImageUrl) {
              imgSrc = window.parent.VNResources.getCharacterImageUrl(name, expression);
          } else if (window.VNCore?.getCharacterImageUrl) {
              imgSrc = window.VNCore.getCharacterImageUrl(name, expression);
          } else {
             const charNameForImg = String(name).includes('_') ? String(name).split('_')[0] : String(name);
             const exprForImg = expression || 'default'; 
             imgSrc = `https://github.com/nancywang3641/sound-files/char_img/${charNameForImg}_${exprForImg}.png`;
          }
          imgEl.src = imgSrc;
          imgEl.onerror = function() {
              const charNamePart = String(name).includes('_') ? String(name).split('_')[0] : String(name);
              this.src = `https://github.com/nancywang3641/sound-files/char_img/${charNamePart}_presets.png`;
              this.onerror = function() { this.src = 'https://github.com/nancywang3641/sound-files/char_img/default.png'; this.onerror = null; };
          };
          const applyAnimFn = window.parent?.VNResources?.applyExpressionAnimation || window.VNCore?.applyExpressionAnimation;
          if (applyAnimFn) applyAnimFn(imgEl, expression);
      }
  }

  // 新增：更新来电界面的角色头像
  function updateIncomingCallCharacter(name, expression) {
      const imgEl = document.querySelector('#' + CALL_DIALOG_ID + ' .incoming-caller-avatar');
      if (imgEl) {
          let imgSrc = `https://github.com/nancywang3641/sound-files/char_img/${expression || String(name) + '_default' || 'default'}.png`;
          if (window.parent?.VNResources?.getCharacterImageUrl) {
              imgSrc = window.parent.VNResources.getCharacterImageUrl(name, expression);
          } else if (window.VNCore?.getCharacterImageUrl) {
              imgSrc = window.VNCore.getCharacterImageUrl(name, expression);
          } else {
             const charNameForImg = String(name).includes('_') ? String(name).split('_')[0] : String(name);
             const exprForImg = expression || 'default'; 
             imgSrc = `https://github.com/nancywang3641/sound-files/char_img/${charNameForImg}_${exprForImg}.png`;
          }
          imgEl.src = imgSrc;
          imgEl.onerror = function() {
              const charNamePart = String(name).includes('_') ? String(name).split('_')[0] : String(name);
              this.src = `https://github.com/nancywang3641/sound-files/char_presets/${charNamePart}_presets.png`;
              this.onerror = function() { this.src = 'https://github.com/nancywang3641/sound-files/char_presets/default.png'; this.onerror = null; };
          };
      }
  }

  // ===== 核心音效播放函数 =====
  function playCallSoundEffect(soundEffect) {
      if (!soundEffect) return;
      
      console.log('[CallType] 准备播放音效:', soundEffect);
      
      // 尝试使用VNFeatures的音效系统
      if (window.VNFeatures?.playSound) {
          if (Array.isArray(soundEffect)) {
              // 多音效播放
              soundEffect.forEach((sound, index) => {
                  if (sound && sound.trim() && sound.toLowerCase() !== 'none') {
                      setTimeout(() => {
                          window.VNFeatures.playSound(sound.trim());
                          console.log(`[CallType] 播放通话多音效 [${index + 1}/${soundEffect.length}]: ${sound}`);
                      }, index * 100); // 每个音效间隔100ms播放
                  }
              });
              console.log(`[CallType] 开始播放 ${soundEffect.length} 个音效: [${soundEffect.join(', ')}]`);
          } else if (soundEffect.trim() && soundEffect.toLowerCase() !== 'none') {
              // 单音效播放
              window.VNFeatures.playSound(soundEffect);
              console.log(`[CallType] 播放通话音效: ${soundEffect}`);
          }
      } else {
          console.warn('[CallType] VNFeatures音效系统不可用，尝试父窗口音效系统');
          
          // 备用：尝试父窗口的音效系统
          const parentPlaySound = window.parent?.VNCore?.playSound || window.parent?.playSound;
          if (parentPlaySound) {
              if (Array.isArray(soundEffect)) {
                  soundEffect.forEach((sound, index) => {
                      if (sound && sound.trim() && sound.toLowerCase() !== 'none') {
                          setTimeout(() => {
                              parentPlaySound(sound.trim());
                              console.log(`[CallType] 通过父窗口播放多音效 [${index + 1}/${soundEffect.length}]: ${sound}`);
                          }, index * 100);
                      }
                  });
              } else if (soundEffect.trim() && soundEffect.toLowerCase() !== 'none') {
                  parentPlaySound(soundEffect);
                  console.log(`[CallType] 通过父窗口播放音效: ${soundEffect}`);
              }
          } else {
              console.error('[CallType] 无法找到可用的音效播放系统');
          }
      }
  }

  function addCallMessage(position, content, speaker, isProtagonist = false, actionDesc = '', isCallNarrator = false, soundEffect = null) {
    const messagesContainer = document.querySelector('#' + CALL_DIALOG_ID + ' ' + CALL_MESSAGES_SELECTOR);
    if (!messagesContainer) { console.error('[VN面板/通話] Message container not found.'); return; }
    messagesContainer.innerHTML = '';
    
    // 判断消息类型
    const isNarratorType = (String(speaker).toLowerCase() === 'narrator' || speaker === '旁白' || isCallNarrator);
    const isActionContent = (typeof content === 'string' && content.startsWith("(") && content.endsWith(")")) ||
                            (isProtagonist && typeof content === 'string' && content.startsWith("[") && content.endsWith("]"));
    const isEffectivelyNarrator = isNarratorType || isActionContent || isCallNarrator;

    if (content && String(content).trim() !== '') {
        const msgEl = document.createElement('div');
        msgEl.className = 'call-message'; 
        if(isProtagonist) msgEl.classList.add('protagonist-message');
        if(isEffectivelyNarrator) msgEl.classList.add('call-message-narrator');
        
        // 如果不是旁白，添加说话者标签
        if (!isEffectivelyNarrator && String(content).trim() !== '') {
            const speakerEl = document.createElement('div');
            speakerEl.className = 'call-message-speaker';
            speakerEl.textContent = speaker;
            msgEl.appendChild(speakerEl);
        }
        
        const contentEl = document.createElement('div');
        contentEl.className = 'call-message-content';
        try {
            if (window.processMarkdown && typeof content === 'string') {
                contentEl.innerHTML = window.processMarkdown(content);
            } else {
                contentEl.textContent = content;
            }
        } catch (e) {
            console.error('[VN面板/通話] Error processing message Markdown:', e);
            contentEl.textContent = content;
        }
        
        msgEl.appendChild(contentEl);
        messagesContainer.appendChild(msgEl);
        
        console.log(`[CallType] 显示消息: ${isCallNarrator ? '[旁白]' : speaker} - ${String(content).substring(0, 30)}...`);
    } else if (actionDesc && String(actionDesc).trim() !== '') {
        const msgEl = document.createElement('div');
        msgEl.className = 'call-message call-message-narrator'; 
        const contentEl = document.createElement('div');
        contentEl.className = 'call-message-content';
        contentEl.textContent = actionDesc; 
        msgEl.appendChild(contentEl);
        messagesContainer.appendChild(msgEl);
        
        console.log(`[CallType] 显示动作描述: ${actionDesc.substring(0, 30)}...`);
    }
    
    // 播放音效
    playCallSoundEffect(soundEffect);
  }

  function showCallDialog() {
      const callDialogEl = document.getElementById(CALL_DIALOG_ID);
      if (callDialogEl) {
          if (!callDialogEl.classList.contains('active')) {
              callDialogEl.classList.add('active');
          }
          const playSoundFn = window.VNCore?.playSound || window.parent?.VNCore?.playSound;
          if (playSoundFn) playSoundFn('callSound');
      } else {
          console.error("Call dialog element not found:", CALL_DIALOG_ID);
      }
  }

  function closeCallDialog() {
    // *** MODIFICATION: Added log to trace calls to this function ***
    console.log('[CallType TRACE] closeCallDialog() called. isClosing:', currentCallState.isClosing, 'allMessagesShown at this point:', currentCallState.allMessagesShown);

    if (currentCallState.isClosing) { return; }
    currentCallState.isClosing = true;

    if (window.callDurationTimer) {
        clearInterval(window.callDurationTimer);
        window.callDurationTimer = null;
    }
    
    const callDialogEl = document.getElementById(CALL_DIALOG_ID);
    if (callDialogEl) {
        callDialogEl.classList.remove('active');
        const playSoundFn = window.VNCore?.playSound || window.parent?.VNCore?.playSound;
        if (playSoundFn) playSoundFn('callEndSound');
        
        const messagesContainer = callDialogEl.querySelector(CALL_MESSAGES_SELECTOR);
        if (messagesContainer) {
            messagesContainer.querySelectorAll('.call-message').forEach(msg => msg.classList.add('hiding'));
            setTimeout(() => { messagesContainer.innerHTML = ''; }, 300);
        }
        
        const descriptionsContainer = callDialogEl.querySelector(CALL_DESCRIPTIONS_SELECTOR);
        if (descriptionsContainer) {
            descriptionsContainer.querySelectorAll('.call-action-description').forEach(desc => desc.classList.add('hiding'));
            setTimeout(() => { descriptionsContainer.innerHTML = ''; descriptionsContainer.style.display = 'none'; }, 300);
        }
    }
    
    const wasCompleted = currentCallState.allMessagesShown;
    
    const resetAndProceed = () => {
        console.log('[CallType] 开始重置通话状态和恢复主界面');
        
        // 🔥 修改：實現絲滑過渡，不立即顯示前一個對話框
        const smoothTransitionToNextDialogue = () => {
            const mainDialog = document.querySelector('.dialog-container .dialog-box'); 
            const mainNameTag = document.querySelector('.dialog-container .name-tag');
            
            // 保持主對話框隱藏狀態，避免顯示前一個對話框
            if(mainDialog) { 
                mainDialog.style.display = 'none'; 
                mainDialog.style.visibility = 'hidden'; 
                mainDialog.style.opacity = '0'; 
                mainDialog.classList.add('hiding');
                console.log('[CallType] 主对话框保持隱藏狀態，準備絲滑過渡');
            }
            if(mainNameTag) { 
                mainNameTag.style.display = 'none'; 
                mainNameTag.style.visibility = 'hidden'; 
                mainNameTag.style.opacity = '0'; 
                mainNameTag.classList.add('hiding');
            }
        };
        
        // 🔥 修改：保持主界面隱藏，避免顯示前一個對話框
        smoothTransitionToNextDialogue();
        
        if (wasCompleted) {
            // *** 关键修正：减少延迟并确保状态完全重置 ***
            let nextDialogueCalled = false;
            if (window.callTimeoutId) clearTimeout(window.callTimeoutId);
            
            // *** 立即重置通话状态 ***
            currentCallState = { 
                isActive: false, 
                dialogues: [], 
                messageQueue: [], 
                currentMessageIndex: 0, 
                allMessagesShown: false, 
                isClosing: false, 
                isInIncomingCallPhase: false,
                otherSpeaker: null,
                otherBackground: '',
                protagonistName: currentCallState.protagonistName || '' // 保留主角名称
            };
            console.log('[CallType] 通话状态已立即重置');
            
            window.callTimeoutId = setTimeout(() => {
                if (nextDialogueCalled) return;
                nextDialogueCalled = true;
                
                try {
                    // 🔥 修改：執行nextDialogue後再顯示主對話框，實現絲滑過渡
                    setTimeout(() => {
                        const nextDialogueFn = window.VNCore?.nextDialogue || window.nextDialogue || window.parent?.VNCore?.nextDialogue;
                        if (nextDialogueFn) {
                            console.log('[CallType] 執行nextDialogue繼續劇情');
                            nextDialogueFn();
                            
                            // 🔥 新增：在nextDialogue執行後，延遲顯示主對話框
                            setTimeout(() => {
                                const mainDialog = document.querySelector('.dialog-container .dialog-box'); 
                                const mainNameTag = document.querySelector('.dialog-container .name-tag');
                                
                                if(mainDialog) { 
                                    mainDialog.style.display = 'flex'; 
                                    mainDialog.style.visibility = 'visible'; 
                                    mainDialog.style.opacity = '1'; 
                                    mainDialog.classList.remove('hiding', 'hidden');
                                    console.log('[CallType] 主對話框已絲滑顯示');
                                }
                                if(mainNameTag) { 
                                    mainNameTag.style.display = 'inline-block'; 
                                    mainNameTag.style.visibility = 'visible'; 
                                    mainNameTag.style.opacity = '1'; 
                                    mainNameTag.classList.remove('hiding', 'hidden');
                                }
                            }, 100); // 延遲100ms確保nextDialogue已執行
                        } else {
                            console.error('[CallType] 無法找到nextDialogue函數');
                        }
                    }, 50);
                    
                } catch (error) { 
                    console.error('[VN面板/通話] Error executing nextDialogue:', error); 
                }
            }, 100); // *** 减少延迟从200ms改为100ms ***
        } else {
            // 未完成的情况也要重置状态
            currentCallState = { 
                isActive: false, 
                dialogues: [], 
                messageQueue: [], 
                currentMessageIndex: 0, 
                allMessagesShown: false, 
                isClosing: false, 
                isInIncomingCallPhase: false,
                otherSpeaker: null,
                otherBackground: '',
                protagonistName: currentCallState.protagonistName || ''
            };
            console.log('[CallType] 通话状态已重置（未完成状态）');
        }
    };
    
    setTimeout(resetAndProceed, callDialogEl ? 50 : 0); // *** 减少延迟 ***
}
  window.callTimeoutId = null;

  function handleCallChoice(action, caller) {
      const choiceMsg = `【Call Response】${caller}'s call - ${action}`;
      const choicePayload = { text: choiceMsg, callAction: action, caller };
      let messageType = 'VN_CALL_CHOICE'; 
      if (action.toLowerCase() === 'answer') messageType = 'VN_CALL_ANSWERED';
      if (action.toLowerCase() === 'decline' || action.toLowerCase() === 'reject') messageType = 'VN_CALL_REJECTED';
      if (window.VNCore?.sendChoiceToChatInterface) { // If a specific VNCore function exists
          window.VNCore.sendChoiceToChatInterface(choicePayload, messageType); // Assuming it can take type
      } else {
          window.parent.postMessage({ type: messageType, choice: choicePayload, caller: caller }, '*');
      }
      const choicesContainer = document.querySelector('.choices-container');
      if (choicesContainer) choicesContainer.classList.add('hidden');
  }

  function setupCallActionUI(containerId, caller, isIncoming) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = `
          <div class="${isIncoming ? 'incoming-call' : 'ongoing-call'} active">
              <div class="caller-info">
                  <div class="caller-avatar"></div> <div class="caller-name">${caller}</div>
                  <div class="call-status">${isIncoming ? 'Incoming Call...' : 'On Call'}</div>
                  ${!isIncoming ? '<div class="call-duration">00:00</div>' : ''}
              </div>
              <div class="call-actions">
                  ${isIncoming ? '<button class="answer-call">Answer</button><button class="decline-call">Decline</button>' : '<button class="end-call-notif">End Call</button>'}
              </div>
          </div>`;
      if (isIncoming) {
          container.querySelector('.answer-call')?.addEventListener('click', () => { handleCallChoice('answer', caller); container.innerHTML = ''; });
          container.querySelector('.decline-call')?.addEventListener('click', () => { handleCallChoice('decline', caller); container.innerHTML = ''; });
          const playSoundFn = window.VNCore?.playSound || window.parent?.VNCore?.playSound;
          if (playSoundFn) playSoundFn('callSound'); 
      } else {
          container.querySelector('.end-call-notif')?.addEventListener('click', () => {
              handleCallChoice('end', caller); 
              container.innerHTML = '';
              if(container.callTimer) clearInterval(container.callTimer);
              if(currentCallState.isActive) closeCallDialog();
          });
          let seconds = 0;
          const durationEl = container.querySelector('.call-duration');
          if(durationEl && !container.callTimer) { 
            durationEl.textContent = '00:00';
            container.callTimer = setInterval(() => {
              seconds++;
              durationEl.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
            }, 1000);
          }
      }
  }
  function showIncomingCall(caller) { setupCallActionUI(INCOMING_CALL_CONTAINER_ID, caller, true); }
  function showOngoingCall(caller) { setupCallActionUI(ONGOING_CALL_CONTAINER_ID, caller, false); }

  // *** MODIFIED showNextCallMessage ***
  function showNextCallMessage() {
    if (!currentCallState.isActive || currentCallState.isClosing) {
        // console.log("[CallType] Call not active or is closing, aborting showNextCallMessage.");
        return;
    }

    if (!currentCallState.messageQueue || currentCallState.messageQueue.length === 0) {
        // console.log("[CallType] Message queue is empty in showNextCallMessage.");
        currentCallState.allMessagesShown = true;
        const endCallBtn = document.getElementById(END_CALL_BUTTON_ID);
        if (endCallBtn) endCallBtn.classList.add('pulse-animation');
        return;
    }

    // If currentMessageIndex indicates all messages have been shown by previous calls to this function
    if (currentCallState.allMessagesShown) { // This means currentMessageIndex >= messageQueue.length
        // console.log("[CallType] All messages have been shown. Last message should be visible. Pulsing button.");
        const endCallBtn = document.getElementById(END_CALL_BUTTON_ID);
        if (endCallBtn) endCallBtn.classList.add('pulse-animation');
        return;
    }

    // Check if there is a message to display at the current index
    if (currentCallState.currentMessageIndex < currentCallState.messageQueue.length) {
        const message = currentCallState.messageQueue[currentCallState.currentMessageIndex];
        if (!message) {
            console.error(`[VN面板/通話] Message is undefined at index ${currentCallState.currentMessageIndex}. Advancing.`);
            currentCallState.currentMessageIndex++;
            // Attempt to show the next one or correctly flag completion
            // This recursive call should eventually hit one of the top return conditions
            showNextCallMessage(); 
            return;
        }

        // Display the current message - 包含完整音效支持
        addCallMessage(
            message.position, 
            message.content, 
            message.speaker, 
            message.isProtagonist, 
            message.actionDesc,
            message.isCallNarrator, // Call_Narrator支持
            message.soundEffect // 音效支持
        );
        currentCallState.currentMessageIndex++; // Move to the next message index

        // After displaying and incrementing, check if that was the last message
        if (currentCallState.currentMessageIndex >= currentCallState.messageQueue.length) {
            currentCallState.allMessagesShown = true;
            // console.log("[CallType] Last message displayed. Pulsing end call button.");
            // The last message is now on screen. Animate the button.
            // No need for a "completion message" that clears the actual last dialogue.
            const endCallBtn = document.getElementById(END_CALL_BUTTON_ID);
            if (endCallBtn) endCallBtn.classList.add('pulse-animation');
        }
    } else {
        // This state should ideally be caught by the `allMessagesShown` check at the beginning
        // if the index was already out of bounds when the function was called.
        // console.log("[CallType] currentMessageIndex is out of bounds, but allMessagesShown was false. Setting true and pulsing.");
        currentCallState.allMessagesShown = true;
        const endCallBtn = document.getElementById(END_CALL_BUTTON_ID);
        if (endCallBtn) endCallBtn.classList.add('pulse-animation');
    }
  }

  function addClickToAdvanceListener() {
      const messagesContainer = document.querySelector('#' + CALL_DIALOG_ID + ' ' + CALL_MESSAGES_SELECTOR);
      if (!messagesContainer) { console.error('[VN面板/通話] Message container not found for click listener.'); return; }
      const newContainer = messagesContainer.cloneNode(true);
      messagesContainer.parentNode.replaceChild(newContainer, messagesContainer);
      newContainer.addEventListener('click', (event) => {
          event.stopPropagation();
          if (currentCallState.allMessagesShown) {
              return;
          }
          showNextCallMessage();
      });
  }

  function setupCallListeners() {
      // detectProtagonistName(); // Initial detection
  }

  document.addEventListener('DOMContentLoaded', setupCallListeners);

  window.CallType = {
      handleCallDialogue, showIncomingCall, showOngoingCall, handleCallChoice, closeCallDialog
  };
  window.handleCallDialogue = handleCallDialogue; // Global exposure

  // UNTOUCHED parseCallDialogue function as per your request
  function parseCallDialogue(content) {
    const match = content.match(/\[Call\|(.*?)\]/i);
    if (!match || !match[1]) return null;
    const params = match[1].split('|');
    if (params.length < 6) { 
        console.warn('[VN面板/通話/parseCallDialogue] Call format error: Less than 6 parameters found for 6-param rule.', params);
        return null;
    }
    const result = {
        type: 'call', callId: params[0].trim(), position: params[1].trim(),
        background: params[2].trim(), expression: params[3].trim(),
        name: params[4].trim(), content: params[5].trim(), actionDesc: ""
    };
    if (typeof result.content === 'string' && result.content.startsWith("(") && result.content.endsWith(")")) {
        result.actionDesc = result.content.substring(1, result.content.length - 1).trim();
        result.content = "";
    }
    return result;
  }