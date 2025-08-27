// =======================================================================
//                          群組成員管理器功能
// =======================================================================
// 
// 功能：
// 1. 打開成員管理器窗口
// 2. 添加新成員（名稱、顯示名稱、頭像）
// 3. 管理成員列表
// 4. 與群組創建功能整合
//
// =======================================================================

// 全局變量
let currentGroupMembers = [];
let currentGroupId = null;

// 🆕 確保全局可用
window.currentGroupMembers = currentGroupMembers;

// =======================================================================
//                          窗口管理
// =======================================================================

/**
 * 打開成員管理器窗口
 */
function openMemberManager() {
    // 🆕 檢查是否為群組設置模式
    if (window.isGroupSettingsMode) {
        currentGroupId = currentChat.id;
        // 在群組設置模式下，使用群組設置的成員列表
        if (!window.groupSettingsCurrentMembers) {
            window.groupSettingsCurrentMembers = [];
        }
        currentGroupMembers = window.groupSettingsCurrentMembers;
        window.currentGroupMembers = currentGroupMembers;
    } else {
        // 🆕 在群組創建模式下，生成新的臨時ID，確保每次都是全新的
        currentGroupId = `temp_group_${Date.now()}`;
        
        // 🆕 使用全局的成員列表，如果為空則初始化
        if (!window.currentGroupMembers) {
            window.currentGroupMembers = [];
        }
        currentGroupMembers = window.currentGroupMembers;
    }
    
    // 🆕 只有在非編輯模式下才清空表單
    if (!window.editingMemberName) {
        // 清空輸入框
        document.getElementById('memberNameInput').value = '';
        document.getElementById('memberDisplayNameInput').value = '';
        document.getElementById('memberAvatarInput').value = '';
        
        // 重置頭像預覽
        const avatarPreview = document.getElementById('avatarPreview');
        const avatarPreviewText = document.getElementById('avatarPreviewText');
        avatarPreview.style.display = 'none';
        avatarPreviewText.style.display = 'inline';
        avatarPreview.src = '';
    }
    
    // 🆕 根據模式更新不同的顯示
    if (window.isGroupSettingsMode) {
        updateGroupSettingsMemberAvatarDisplay();
    } else {
        updateMemberAvatarDisplay();
    }
    
    // 顯示窗口
    document.getElementById('memberManagerModal').classList.remove('hidden');
    
    // 設置頭像上傳監聽器
    setupAvatarUpload();
    
    console.log('[成員管理器] 窗口已打開');
}

/**
 * 關閉成員管理器窗口
 */
function closeMemberManager() {
    document.getElementById('memberManagerModal').classList.add('hidden');
    
    // 🆕 清除編輯模式標記
    window.editingMemberName = null;
    
    // 🆕 清除群組設置模式標記
    window.isGroupSettingsMode = false;
    
    console.log('[成員管理器] 窗口已關閉');
}

// =======================================================================
//                          成員管理
// =======================================================================

/**
 * 設置頭像上傳監聽器
 */
function setupAvatarUpload() {
    const avatarInput = document.getElementById('memberAvatarInput');
    const avatarPreview = document.getElementById('avatarPreview');
    const avatarPreviewText = document.getElementById('avatarPreviewText');
    
    avatarInput.onchange = function(event) {
        const file = event.target.files[0];
        if (file) {
            try {
                // 驗證文件
                groupMemberManager.validateImageFile(file);
                
                // 創建預覽
                const reader = new FileReader();
                reader.onload = function(e) {
                    avatarPreview.src = e.target.result;
                    avatarPreview.style.display = 'inline';
                    avatarPreviewText.style.display = 'none';
                };
                reader.readAsDataURL(file);
                
            } catch (error) {
                alert(error.message);
                avatarInput.value = '';
            }
        }
    };
}

/**
 * 🆕 添加成員並關閉窗口
 */
async function addMemberAndClose() {
    const nameInput = document.getElementById('memberNameInput');
    const displayNameInput = document.getElementById('memberDisplayNameInput');
    const avatarInput = document.getElementById('memberAvatarInput');
    
    const name = nameInput.value.trim();
    const displayName = displayNameInput.value.trim();
    const avatarFile = avatarInput.files[0];
    
    // 驗證輸入
    if (!name) {
        alert('請輸入成員名稱');
        return;
    }
    
    // 🆕 檢查是否已存在（排除正在編輯的成員）
    const existingMember = currentGroupMembers.find(member => member.name === name);
    if (existingMember && (!window.editingMemberName || existingMember.name !== window.editingMemberName)) {
        alert('成員名稱已存在，請使用不同的名稱');
        return;
    }
    
    try {
        // 處理頭像
        let avatarData = null;
        if (avatarFile) {
            avatarData = await groupMemberManager.fileToBase64(avatarFile);
        }
        
        // 創建成員對象
        const member = {
            name: name,
            displayName: displayName || name,
            avatar: avatarData,
            groupId: currentGroupId,
            createdAt: new Date().toISOString()
        };
        
        // 🆕 處理編輯模式或添加模式
        if (window.editingMemberName) {
            // 編輯模式：替換原成員
            const editIndex = window.currentGroupMembers.findIndex(m => m.name === window.editingMemberName);
            if (editIndex !== -1) {
                window.currentGroupMembers[editIndex] = member;
            }
            // 清除編輯模式標記
            window.editingMemberName = null;
        } else {
            // 添加模式：添加新成員
            window.currentGroupMembers.push(member);
        }
        currentGroupMembers = window.currentGroupMembers;
        
        // 清空輸入框
        nameInput.value = '';
        displayNameInput.value = '';
        avatarInput.value = '';
        
        // 重置頭像預覽
        const avatarPreview = document.getElementById('avatarPreview');
        const avatarPreviewText = document.getElementById('avatarPreviewText');
        avatarPreview.style.display = 'none';
        avatarPreviewText.style.display = 'inline';
        avatarPreview.src = '';
        
        // 🆕 根據模式更新不同的顯示
        if (window.isGroupSettingsMode) {
            updateGroupSettingsMemberAvatarDisplay();
        } else {
            updateMemberAvatarDisplay();
        }
        
        // 關閉窗口
        closeMemberManager();
        
        console.log(`[成員管理器] 成員 "${name}" 已添加並關閉窗口`);
        
    } catch (error) {
        console.error('[成員管理器] 添加成員失敗:', error);
        alert('添加成員失敗: ' + error.message);
    }
}

/**
 * 從列表中移除成員
 */
function removeMemberFromList(name) {
    // 🆕 使用全局成員列表
    window.currentGroupMembers = window.currentGroupMembers.filter(member => member.name !== name);
    currentGroupMembers = window.currentGroupMembers;
    
    // 🆕 根據模式更新不同的顯示
    if (window.isGroupSettingsMode) {
        updateGroupSettingsMemberAvatarDisplay();
    } else {
        updateMemberAvatarDisplay();
    }
    
    console.log(`[成員管理器] 成員 "${name}" 已從列表中移除`);
}

/**
 * 編輯成員信息
 */
function editMember(name) {
    const member = currentGroupMembers.find(m => m.name === name);
    if (!member) return;
    
    // 🆕 設置編輯模式標記
    window.editingMemberName = name;
    
    // 填充表單
    document.getElementById('memberNameInput').value = member.name;
    document.getElementById('memberDisplayNameInput').value = member.displayName || '';
    
    // 顯示頭像預覽
    if (member.avatar) {
        const avatarPreview = document.getElementById('avatarPreview');
        const avatarPreviewText = document.getElementById('avatarPreviewText');
        avatarPreview.src = member.avatar;
        avatarPreview.style.display = 'inline';
        avatarPreviewText.style.display = 'none';
    }
    
    // 打開編輯窗口
    openMemberManager();
    
    console.log(`[成員管理器] 開始編輯成員 "${name}"`);
}

/**
 * 確認成員列表
 */
async function confirmMembers() {
    if (currentGroupMembers.length === 0) {
        alert('請至少添加一個成員');
        return;
    }
    
    try {
        // 保存所有成員到IndexedDB
        for (const member of currentGroupMembers) {
            await groupMemberManager.addMember(
                member.groupId,
                member.name,
                member.avatar,
                member.displayName
            );
        }
        
        // 更新群組創建表單
        updateMemberAvatarDisplay();
        
        // 關閉窗口
        closeMemberManager();
        
        console.log(`[成員管理器] 已確認 ${currentGroupMembers.length} 個成員`);
        
    } catch (error) {
        console.error('[成員管理器] 確認成員失敗:', error);
        alert('保存成員失敗: ' + error.message);
    }
}

// =======================================================================
//                          顯示更新
// =======================================================================

/**
 * 🆕 更新成員管理器列表顯示（已棄用，改用updateMemberAvatarDisplay）
 */
function updateMemberManagerList() {
    // 這個函數已經不再使用，保留以避免錯誤
    console.log('[成員管理器] updateMemberManagerList 已棄用，使用 updateMemberAvatarDisplay');
}

/**
 * 🆕 更新成員數量顯示（已棄用）
 */
function updateMemberCount() {
    // 這個函數已經不再使用，保留以避免錯誤
    console.log('[成員管理器] updateMemberCount 已棄用');
}

/**
 * 🆕 更新成員頭像顯示
 */
function updateMemberAvatarDisplay() {
    const memberAvatarList = document.getElementById('memberAvatarList');
    
    // 清空現有顯示
    memberAvatarList.innerHTML = '';
    
    // 🆕 使用全局的成員列表
    const members = window.currentGroupMembers || [];
    console.log(`[成員管理器] 更新成員頭像顯示，成員數量: ${members.length}`);
    
    // 顯示所有成員頭像
    members.forEach((member, index) => {
        const avatarItem = document.createElement('div');
        avatarItem.className = 'member-avatar-item';
        
        avatarItem.innerHTML = `
            <img src="${member.avatar || 'https://files.catbox.moe/ew2nex.png'}" 
                 alt="${member.name}" title="${member.name}">
            <div class="member-avatar-name">${member.name}</div>
            <div class="member-avatar-remove" onclick="removeMemberFromList('${member.name}')">&times;</div>
        `;
        
        // 點擊頭像可以編輯成員
        avatarItem.addEventListener('click', function(e) {
            if (e.target.classList.contains('member-avatar-remove')) {
                return; // 不觸發編輯，讓刪除按鈕工作
            }
            editMember(member.name);
        });
        
        memberAvatarList.appendChild(avatarItem);
        console.log(`[成員管理器] 添加成員頭像 ${index + 1}: ${member.name}`);
    });
}

/**
 * 更新群組創建表單
 */
function updateGroupCreationForm() {
    // 這個函數會在確認成員後被調用
    // 可以在這裡添加其他表單更新邏輯
    console.log('[成員管理器] 群組創建表單已更新');
}

// =======================================================================
//                          群組創建整合
// =======================================================================

/**
 * 修改後的群組創建函數
 * 整合成員管理器功能
 */
async function createNewGroupWithMembers() {
    const groupName = document.getElementById('groupNameInput').value.trim();
    const adminName = document.getElementById('adminNameInput').value.trim();
    
    const customDate = document.getElementById('groupDateInput').value;
    const customTime = document.getElementById('groupTimeInput').value;
    
    if (!groupName || !adminName) {
        alert('請填寫群組名稱和管理員名稱！');
        return;
    }
    
    if (currentGroupMembers.length === 0) {
        alert('請至少添加一個群組成員');
        return;
    }
    
    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 🏗️ 開始創建群組 (使用成員管理器)...');

    const finalDate = (customDate && customTime) ? customDate : new Date().toISOString().slice(0, 10);
    const finalTime = (customDate && customTime) ? customTime : (() => {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    })();
    
    isUserSendingMessage = true;
    
    // 為用戶創建的預設聊天室生成唯一ID
    const timestamp = Date.now();
    const groupId = `user_group_${timestamp}`;

    // 使用成員管理器中的成員名稱
    const memberNames = currentGroupMembers.map(m => m.name);
    const participantsInfo = `${adminName}|${memberNames.join(',')}`;
    const chatMetaMessage = `[Chat|${groupId}|${groupName}|${participantsInfo}]`;
    
    // 🔥 使用簡化格式
    const systemTimeCommand = `\n[SYSTEM|${finalDate} ${finalTime}]`;
    const systemCreateMessage = `\n[SYSTEM|群組「${groupName}」已創建！]`;
    const fullMessage = `<${groupId}>\n${chatMetaMessage}${systemTimeCommand}${systemCreateMessage}\n</${groupId}>`;
    
    if (CONFIG.DEBUG_MODE) console.log('[聊天面板] 準備發送的消息:', fullMessage);
    
    try {
        // 🆕 檢查是否選擇保存為預設聊天室
        const saveAsPreset = document.getElementById('saveAsPresetCheckbox')?.checked;

        if (saveAsPreset) {
            // 如果選擇保存為預設，直接創建預設聊天室
            const presetChatConfig = {
                id: groupId,
                type: 'group',
                name: groupName,
                admin: adminName,
                members: memberNames,
                description: `用戶創建的群組: ${groupName}`
            };
            
            const success = await PresetChatManager.addPresetChat(presetChatConfig);
            
            if (success) {
                Logger.success(`✅ 群組 "${groupName}" 已保存為預設聊天室`);
                
                // 🔥 重要：立即更新 UI
                updateChatListView();
                
                // 🆕 自動觸發重新載入，確保預設聊天室顯示
                setTimeout(() => {
                    triggerManualUpdate();
                    setTimeout(() => {
                        if (window.parent) {
                            window.parent.postMessage({
                                type: 'REQUEST_EVENT_BUTTON_REREGISTRATION',
                                timestamp: Date.now()
                            }, '*');
                        }
                    }, 300);
                }, 1000);
                
                closeAddGroupModal();
                showSuccessToast(`群組 "${groupName}" 已創建並保存為預設！`);
            } else {
                alert('創建預設群組失敗，可能已存在同名聊天室');
                return;
            }
        } else {
            // 如果不保存為預設，則發送到酒館AI
            const tavernMainWindow = findTavernMainWindow();
            if (!tavernMainWindow) {
                throw new Error('找不到酒館AI主環境');
            }
            
            const stInput = tavernMainWindow.document.querySelector('#send_textarea');
            const sendButton = tavernMainWindow.document.querySelector('#send_but');
            
            if (!stInput || !sendButton) {
                throw new Error('找不到發送介面元素');
            }
            
            stInput.value = fullMessage;
            stInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            setTimeout(() => {
                sendButton.click();
                if (CONFIG.DEBUG_MODE) console.log('[聊天面板] ✅ 群組創建消息已發送');
                closeAddGroupModal();
                showSuccessToast(`群組 "${groupName}" 已創建！`);
                setTimeout(() => {
                    triggerManualUpdate();
                    setTimeout(() => {
                        if (window.parent) {
                            window.parent.postMessage({
                                type: 'REQUEST_EVENT_BUTTON_REREGISTRATION',
                                timestamp: Date.now()
                            }, '*');
                        }
                    }, 300);
                }, 1000);
            }, 100);
        }
        
        clearTimeout(userSendingDebounceTimer);
        userSendingDebounceTimer = setTimeout(() => {
            isUserSendingMessage = false;
        }, 5000);
        
    } catch (error) {
        console.error('[聊天面板] ❌ 群組創建失敗:', error);
        alert(`群組創建失敗: ${error.message}`);
        isUserSendingMessage = false;
    }
}

// =======================================================================
//                          全局函數導出
// =======================================================================

// 導出到全局作用域
window.openMemberManager = openMemberManager;
window.closeMemberManager = closeMemberManager;
window.addMemberAndClose = addMemberAndClose;
window.removeMemberFromList = removeMemberFromList;
window.editMember = editMember;
window.createNewGroupWithMembers = createNewGroupWithMembers;

// 替換原有的群組創建函數
window.createNewGroup = createNewGroupWithMembers;
