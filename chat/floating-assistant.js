/**
 * 可拖动浮动助手功能 (修改版 v2.0 - 兼容手機與多層IFRAME)
 */

/**
 * 尋找並返回包含 TavernHelper 的頂層窗口
 */
function findTavernTopWindow() {
    let currentWindow = window;
    try {
        // 限制最多向上查找10層，防止無限循環
        for (let i = 0; i < 10; i++) {
            // 檢查頂層窗口是否包含關鍵的TavernHelper API
            if (currentWindow.TavernHelper && currentWindow.TavernHelper.triggerSlash) {
                return currentWindow;
            }
            // 如果已經到達最頂層，則跳出
            if (currentWindow.parent === currentWindow) {
                break;
            }
            currentWindow = currentWindow.parent;
        }
    } catch (e) {
        console.error("尋找頂層窗口時出錯:", e);
        return null;
    }
    // 如果找不到，也返回頂層的 window，讓後續的錯誤處理來應對
    return window.top; 
}


// 浮动按钮相关变量
let isDragging = false;
let isTracking = false;
let startX = 0;
let startY = 0;
let startLeft = 0;
let startTop = 0;

// 初始化浮动助手
function initFloatingAssistant() {
    const floatingButton = document.getElementById('floatingButton');
    const floatingAssistant = document.getElementById('floatingAssistant');
    
    if (!floatingButton || !floatingAssistant) {
        console.error('[浮动助手] 找不到浮动按钮元素');
        return;
    }
    
    // 监听鼠标事件
    floatingButton.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    
    // 监听触摸事件（移动端支持）
    floatingButton.addEventListener('touchstart', startDrag);
    document.addEventListener('touchmove', onDrag);
    document.addEventListener('touchend', stopDrag);
    
    // 不再需要獨立的 click 事件，點擊判斷已整合到 stopDrag 中
    
    console.log('[浮动助手] 初始化完成 (修改版)');
    updateFloatingAssistantIcon();
}

// 开始拖动
function startDrag(e) {
    isTracking = true;
    isDragging = false; // 重置拖动状态
    
    const event = e.type.includes('touch') ? e.touches[0] : e;
    startX = event.clientX;
    startY = event.clientY;
    
    const floatingAssistant = document.getElementById('floatingAssistant');
    const rect = floatingAssistant.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    
    e.preventDefault();
}

// 拖动中
function onDrag(e) {
    if (startX === 0 && startY === 0) return;
    
    const event = e.type.includes('touch') ? e.touches[0] : e;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    
    // 如果移动距离超过阈值，则认为是拖动
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        isDragging = true;
        
        const floatingAssistant = document.getElementById('floatingAssistant');
        let newLeft = startLeft + deltaX;
        let newTop = startTop + deltaY;
        
        // 边界检查
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const buttonWidth = 56;
        const buttonHeight = 56;
        
        newLeft = Math.max(10, Math.min(newLeft, windowWidth - buttonWidth - 10));
        newTop = Math.max(10, Math.min(newTop, windowHeight - buttonHeight - 10));
        
        floatingAssistant.style.right = 'auto';
        floatingAssistant.style.left = newLeft + 'px';
        floatingAssistant.style.top = newTop + 'px';
        floatingAssistant.style.transform = 'none';
    }
    
    e.preventDefault();
}


// 停止拖动 (修正版)
function stopDrag(e) {
    if (!isTracking) return; // 如果操作不是從按鈕開始的，直接結束

    // 如果 isDragging 標記從未被設置為 true，說明這是一次點擊/輕觸
    if (!isDragging) {
        openQuickActions(); // 直接觸發打開面板的動作
    } 
    // 如果是拖動，則執行邊緣吸附
    else {
        const floatingAssistant = document.getElementById('floatingAssistant');
        const rect = floatingAssistant.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        
        if (rect.left < windowWidth / 2) {
            // 吸附到左边
            floatingAssistant.style.left = '20px';
            floatingAssistant.style.right = 'auto';
        } else {
            // 吸附到右边
            floatingAssistant.style.left = 'auto';
            floatingAssistant.style.right = '20px';
        }
    }
    
    isTracking = false; // 重置操作標記
    
    // 重置所有拖動狀態
    setTimeout(() => {
        isDragging = false;
    }, 50);

    startX = 0;
    startY = 0;
    startLeft = 0;
    startTop = 0;
}

// 打开快捷指令模态窗口
function openQuickActions() {
    const modal = document.getElementById('quickActionsModal');
    if (modal) {
        modal.classList.remove('hidden');
        console.log('[浮动助手] 打开快捷指令面板');
        
        // 🔥 新增：打开面板时更新故事列表中的用户名称
        if (typeof updateStoryUserNames === 'function') {
            updateStoryUserNames();
        }
    }
}

// 关闭快捷指令模态窗口
function closeQuickActions() {
    const modal = document.getElementById('quickActionsModal');
    if (modal) {
        modal.classList.add('hidden');
        console.log('[浮动助手] 关闭快捷指令面板');
    }
}

// 触发AI助手
async function triggerAI() {
    console.log('[浮动助手] 触发AI助手');
    try {
        // 查找酒馆AI主环境 (使用新函數)
        const tavernMainWindow = findTavernTopWindow();
        if (!tavernMainWindow) {
            throw new Error('找不到酒馆AI主环境');
        }
        // 1. 取得選中故事內容與被點亮的tag
        let storyContent = '';
        try {
            const stories = JSON.parse(localStorage.getItem('tavern_story_list')) || [];
            const selectedId = localStorage.getItem('tavern_story_selected') || '';
            const story = stories.find(s => s.id === selectedId);
            if (story && story.content) {
                // 更穩定地取得UI上被點亮的chip（只取藍色chip）
                let tags = [];
                const storyListDiv = document.getElementById('storyList');
                if (storyListDiv) {
                    // 找到唯一一個有藍色邊框的選中卡片
                    const selectedRow = Array.from(storyListDiv.querySelectorAll('.story-row.story-select-card')).find(row => row.style.border === '2px solid rgb(41, 121, 255)' || row.style.border === '2px solid #2979ff');
                    if (selectedRow) {
                        const chips = selectedRow.querySelectorAll('.tag-chip.tag-chip-selected');
                        tags = Array.from(chips).map(chip => chip.textContent);
                        console.log('[浮动助手] 取得被點亮的tag:', tags);
                    } else {
                        console.log('[浮动助手] 沒有找到選中卡片');
                    }
                }
                // 組合訊息格式
                storyContent = `主角: ${story.user}\n內容: ${story.content}`;
                if (tags.length > 0) {
                    storyContent += `\n關鍵字: ${tags.join(', ')}`;
                }
            }
        } catch {}
        // 2. 先發送故事內容
        if (storyContent) {
            const stInput = tavernMainWindow.document.querySelector('#send_textarea');
            const sendButton = tavernMainWindow.document.querySelector('#send_but');
            if (stInput && sendButton) {
                stInput.value = storyContent;
                stInput.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(res => setTimeout(res, 120));
                sendButton.click();
                await new Promise(res => setTimeout(res, 600)); // 等待發送完成
            }
            // 發送後自動清空選擇
            localStorage.setItem('tavern_story_selected', '');
            if (typeof renderStoryList === 'function') renderStoryList();
        }
        // 3. 再發送AI指令
        const aiCommand = '/trigger "**聊天格式输出专家**"';
        if (tavernMainWindow.TavernHelper && tavernMainWindow.TavernHelper.triggerSlash) {
            await tavernMainWindow.TavernHelper.triggerSlash(aiCommand);
            console.log('[浮动助手] ✅ AI命令已通过TavernHelper发送');
        } else {
            const stInput = tavernMainWindow.document.querySelector('#send_textarea');
            const sendButton = tavernMainWindow.document.querySelector('#send_but');
            if (stInput && sendButton) {
                stInput.value = aiCommand;
                stInput.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => {
                    sendButton.click();
                    console.log('[浮动助手] ✅ AI命令已通过输入框发送');
                }, 100);
            } else {
                throw new Error('找不到发送界面元素');
            }
        }
        closeQuickActions();
        showToast('AI助手已启动！', 'success');
    } catch (error) {
        console.error('[浮动助手] AI启动失败:', error);
        showToast('AI启动失败: ' + error.message, 'error');
    }
}

// 触发沿生剧情
async function triggerStoryDevelopment() {
    console.log('[浮动助手] 触发沿生剧情');
    
    try {
        // 查找酒馆AI主环境
        const tavernMainWindow = findTavernTopWindow();
        if (!tavernMainWindow) {
            throw new Error('找不到酒馆AI主环境');
        }
        
        // 发送剧情发展请求消息
        const storyMessage = '<Request: 請分析現狀，並掃描衝突與動機，生成行動方案，執行並繼續沿生劇情>';
        
        // 查找输入框和发送按钮
        const stInput = tavernMainWindow.document.querySelector('#send_textarea');
        const sendButton = tavernMainWindow.document.querySelector('#send_but');
        
        if (!stInput || !sendButton) {
            throw new Error('找不到发送界面元素');
        }
        
        // 发送剧情消息
        stInput.value = storyMessage;
        stInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        setTimeout(() => {
            sendButton.click();
            console.log('[浮动助手] ✅ 剧情发展消息已发送');
            
            // 等待一秒后发送AI启动命令
            setTimeout(async () => {
                try {
                    // 使用Slash命令触发AI
                    const aiCommand = '/trigger "聊天格式輸出專家"';
                    
                    // 方法1：尝试使用TavernHelper的triggerSlash
                    if (tavernMainWindow.TavernHelper && tavernMainWindow.TavernHelper.triggerSlash) {
                        await tavernMainWindow.TavernHelper.triggerSlash(aiCommand);
                        console.log('[浮动助手] ✅ AI命令已通过TavernHelper发送');
                    }
                    // 方法2：直接发送到输入框
                    else {
                        stInput.value = aiCommand;
                        stInput.dispatchEvent(new Event('input', { bubbles: true }));
                        
                        setTimeout(() => {
                            sendButton.click();
                            console.log('[浮动助手] ✅ AI命令已通过输入框发送');
                        }, 100);
                    }
                } catch (aiError) {
                    console.error('[浮动助手] AI启动失败:', aiError);
                    showToast('AI启动失败: ' + aiError.message, 'error');
                }
            }, 1000);
            
        }, 100);
        
        // 关闭模态窗口
        closeQuickActions();
        
        // 显示成功提示
        showToast('沿生剧情已启动！', 'success');
        
    } catch (error) {
        console.error('[浮动助手] 沿生剧情启动失败:', error);
        showToast('沿生剧情启动失败: ' + error.message, 'error');
    }
}



// 显示提示消息
function showToast(message, type = 'info') {
    // 创建提示元素
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 20000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideDown 0.3s ease;
    `;
    toast.textContent = message;
    
    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            0% { transform: translateX(-50%) translateY(-20px); opacity: 0; }
            100% { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(toast);
    
    // 3秒后自动移除
    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s ease reverse';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 300);
    }, 3000);
}

// 将函数设为全局可用
window.openQuickActions = (function(orig){
    return function() {
        console.log('openQuickActions called');
        localStorage.setItem('tavern_story_selected', '');
        renderStoryList();
        if (orig) orig();
    };
})(window.openQuickActions);

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 延迟初始化，确保其他脚本已加载
    setTimeout(initFloatingAssistant, 500);
});

// 监听窗口大小变化，调整按钮位置
window.addEventListener('resize', function() {
    const floatingAssistant = document.getElementById('floatingAssistant');
    if (floatingAssistant) {
        // 重置到默认位置
        floatingAssistant.style.left = 'auto';
        floatingAssistant.style.right = '20px';
        floatingAssistant.style.top = '50%';
        floatingAssistant.style.transform = 'translateY(-50%)';
    }
});

// === 故事欄位資料管理 ===
const STORY_STORAGE_KEY = 'tavern_story_list';
const STORY_SELECTED_KEY = 'tavern_story_selected';

function loadStories() {
    try {
        return JSON.parse(localStorage.getItem(STORY_STORAGE_KEY)) || [];
    } catch {
        return [];
    }
}
function saveStories(list) {
    localStorage.setItem(STORY_STORAGE_KEY, JSON.stringify(list));
}

// 🔥 新增：更新故事列表中的用户名称
function updateStoryUserNames() {
    try {
        const stories = loadStories();
        const currentUserName = getCurrentUserName();
        let hasChanges = false;
        
        console.log('[故事列表] 开始更新用户名称，当前用户名称:', currentUserName);
        console.log('[故事列表] 现有故事:', stories);
        
        stories.forEach(story => {
            // 🔥 修复：强制更新所有故事的用户名称为当前设置的用户名称
            if (story.user !== currentUserName) {
                console.log(`[故事列表] 更新故事 "${story.id}" 的用户名称: "${story.user}" -> "${currentUserName}"`);
                story.user = currentUserName;
                hasChanges = true;
            }
        });
        
        if (hasChanges) {
            saveStories(stories);
            console.log('[故事列表] 已更新用户名称:', currentUserName);
            // 重新渲染故事列表
            renderStoryList();
        } else {
            console.log('[故事列表] 无需更新用户名称');
        }
    } catch (error) {
        console.error('[故事列表] 更新用户名称失败:', error);
    }
}

// 🔥 新增：获取当前用户名称的辅助函数
function getCurrentUserName() {
    try {
        // 1. 检查当前聊天室的上下文
        if (typeof currentChat !== 'undefined' && currentChat) {
            if (currentChat.type === 'group' && currentChat.admin) {
                console.log('[故事列表] 使用群组管理员名称:', currentChat.admin);
                return currentChat.admin;
            }
        }
        
        // 2. 检查活跃聊天状态
        if (typeof chatData !== 'undefined' && chatData && 
            typeof streamState !== 'undefined' && streamState) {
            const activeChatId = streamState.activeChatId;
            const activeChatType = streamState.activeChatType;
            
            if ((activeChatType === 'group' || activeChatType === 'group_chat') && activeChatId) {
                const groupChat = chatData.groupChats && chatData.groupChats[activeChatId];
                if (groupChat && groupChat.admin) {
                    console.log('[故事列表] 从活跃聊天获取管理员:', groupChat.admin);
                    return groupChat.admin;
                }
            }
        }
        
        // 3. 检查聊天列表
        if (typeof chatData !== 'undefined' && chatData && chatData.chatList) {
            const currentChatId = window.location.hash.replace('#', '') || 
                                localStorage.getItem('currentChatId');
            
            if (currentChatId) {
                const chatInfo = chatData.chatList.find(chat => chat.id === currentChatId);
                if (chatInfo && chatInfo.type === 'group' && chatInfo.admin) {
                    console.log('[故事列表] 从聊天列表获取管理员:', chatInfo.admin);
                    return chatInfo.admin;
                }
            }
        }
        
    } catch (error) {
        console.warn('[故事列表] 获取当前聊天用户名时出错:', error);
    }
    
    // 4. 🔥 修正：不依賴 localStorage 中的舊值
    // const savedName = localStorage.getItem('chat_protagonist_name');
    // if (savedName && savedName.trim() !== '') {
    //     console.log('[故事列表] 使用全局用户名:', savedName);
    //     return savedName;
    // }
    
    // 5. 最后回退到默认值
    return '{{user}}';
}

// 🔥 确保 addStoryModal 有正确的HTML结构
function ensureStoryModalStructure() {
    const modal = document.getElementById('addStoryModal');
    if (!modal) {
        console.error('[故事列表] 找不到 addStoryModal');
        return false;
    }
    
    // 检查是否已有主角下拉菜单
    let protagonistSelect = modal.querySelector('select[name="protagonist"], #storyProtagonistSelect');
    
    if (!protagonistSelect) {
        console.log('[故事列表] 下拉菜单不存在，正在创建...');
        
        // 找到内容区域
        const contentDiv = modal.querySelector('div[style*="margin-bottom:14px"]') || 
                          modal.querySelector('textarea').parentElement;
        
        if (contentDiv) {
            // 创建主角选择区域
            const protagonistDiv = document.createElement('div');
            protagonistDiv.style.marginBottom = '14px';
            
            const protagonistLabel = document.createElement('label');
            protagonistLabel.textContent = '主角：';
            protagonistLabel.style.display = 'block';
            protagonistLabel.style.marginBottom = '4px';
            
            protagonistSelect = document.createElement('select');
            protagonistSelect.id = 'storyProtagonistSelect';
            protagonistSelect.name = 'protagonist';
            protagonistSelect.style.width = '100%';
            protagonistSelect.style.padding = '5px 8px';
            protagonistSelect.style.marginTop = '2px';
            protagonistSelect.style.borderRadius = '4px';
            protagonistSelect.style.border = '1px solid #ccc';
            
            // 添加默认选项
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '请选择主角...';
            protagonistSelect.appendChild(defaultOption);
            
            protagonistDiv.appendChild(protagonistLabel);
            protagonistDiv.appendChild(protagonistSelect);
            
            // 插入到内容区域之前
            contentDiv.parentNode.insertBefore(protagonistDiv, contentDiv);
            
            console.log('[故事列表] 已创建主角下拉菜单');
        } else {
            console.error('[故事列表] 找不到合适的位置插入下拉菜单');
            return false;
        }
    }
    
    return true;
}

// 🔥 获取所有可用的用户名列表
function getAllAvailableUserNames() {
    const userNames = new Set();
    
    try {
        // 1. 添加当前用户名
        const currentUser = getCurrentUserName();
        if (currentUser && currentUser !== '{{user}}') {
            userNames.add(currentUser);
        }
        
        // 2. 从群组聊天获取管理员名称
        if (typeof chatData !== 'undefined' && chatData) {
            if (chatData.groupChats) {
                Object.values(chatData.groupChats).forEach(groupChat => {
                    if (groupChat.admin && groupChat.admin.trim() !== '') {
                        userNames.add(groupChat.admin);
                    }
                });
            }
            
            if (chatData.chatList) {
                chatData.chatList.forEach(chat => {
                    if (chat.type === 'group' && chat.admin && chat.admin.trim() !== '') {
                        userNames.add(chat.admin);
                    }
                });
            }
        }
        
        // 3. 添加全局设置的用户名
        const globalName = localStorage.getItem('chat_protagonist_name');
        if (globalName && globalName.trim() !== '') {
            userNames.add(globalName);
        }
        
        // 4. 添加默认值
        userNames.add('{{user}}');
        
    } catch (error) {
        console.warn('[故事列表] 获取所有用户名时出错:', error);
        userNames.add('{{user}}');
    }
    
    const result = Array.from(userNames);
    const currentUser = getCurrentUserName();
    
    // 将当前用户名排在第一位
    const sortedResult = result.sort((a, b) => {
        if (a === currentUser) return -1;
        if (b === currentUser) return 1;
        return a.localeCompare(b);
    });
    
    console.log('[故事列表] 所有可用用户名:', sortedResult);
    return sortedResult;
}

// 🔥 填充下拉菜单
function populateStoryUserDropdown() {
    // 确保modal结构正确
    if (!ensureStoryModalStructure()) {
        console.error('[故事列表] 无法确保modal结构');
        return;
    }
    
    const dropdown = document.getElementById('storyProtagonistSelect') || 
                    document.querySelector('#addStoryModal select');
    
    if (!dropdown) {
        console.error('[故事列表] 仍然找不到下拉菜单元素');
        return;
    }
    
    // 保存当前选中的值
    const currentValue = dropdown.value;
    
    // 清空现有选项
    dropdown.innerHTML = '';
    
    // 添加默认选项
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '请选择主角...';
    dropdown.appendChild(defaultOption);
    
    // 获取所有可用的用户名
    const userNames = getAllAvailableUserNames();
    
    // 添加用户名选项
    userNames.forEach(userName => {
        if (userName && userName.trim() !== '') {
            const option = document.createElement('option');
            option.value = userName;
            option.textContent = userName;
            dropdown.appendChild(option);
        }
    });
    
    // 恢复之前的选中值，或选择当前用户
    if (currentValue && userNames.includes(currentValue)) {
        dropdown.value = currentValue;
    } else {
        const currentUser = getCurrentUserName();
        if (userNames.includes(currentUser)) {
            dropdown.value = currentUser;
        }
    }
    
    console.log(`[故事列表] 已填充 ${userNames.length} 个用户选项到下拉菜单`);
}



function setSelectedStoryId(id) {
    console.log('setSelectedStoryId', id);
    localStorage.setItem(STORY_SELECTED_KEY, id);
}
function getSelectedStoryId() {
    return localStorage.getItem(STORY_SELECTED_KEY) || '';
}
function renderStoryList() {
    console.log('renderStoryList called');
    const storyListDiv = document.getElementById('storyList');
    if (!storyListDiv) return;
    const stories = loadStories();
    const selectedId = getSelectedStoryId();
    storyListDiv.innerHTML = '';
    if (stories.length === 0) {
        storyListDiv.innerHTML = '<div style="color:#aaa;font-size:13px;">暫無故事，請點右上＋添加</div>';
        return;
    }
    stories.forEach(story => {
        const row = document.createElement('div');
        row.className = 'story-row story-card story-select-card';
        let isSelected = (selectedId && story.id === selectedId);
        if (isSelected) {
            row.style.background = 'linear-gradient(90deg, #d0e6ff 0%, #b3d1ff 100%)';
            row.style.border = '2px solid #2979ff';
            row.style.boxShadow = '0 4px 16px #4a8a2a22';
            row.style.position = 'relative';
        } else {
            row.style.background = '#fff';
            row.style.border = '2px solid transparent';
            row.style.boxShadow = '0 1px 4px #0001';
            row.style.position = 'relative';
        }
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.marginBottom = '10px';
        row.style.padding = '10px 14px 10px 14px';
        row.style.borderRadius = '10px';
        row.style.gap = '8px';
        row.style.cursor = 'pointer';
        row.style.transition = 'box-shadow 0.2s,background 0.2s';
        row.style.userSelect = 'none';
        if (isSelected) {
            let bar = document.createElement('div');
            bar.style.width = '5px';
            bar.style.height = 'calc(100% - 16px)';
            bar.style.background = '#2979ff';
            bar.style.borderRadius = '4px';
            bar.style.position = 'absolute';
            bar.style.left = '0';
            bar.style.top = '8px';
            bar.style.bottom = '8px';
            bar.style.boxShadow = '0 0 6px #2979ff55';
            row.appendChild(bar);
        }
        row.onclick = () => {
            if (getSelectedStoryId() === story.id) {
                setSelectedStoryId('');
            } else {
                setSelectedStoryId(story.id);
            }
            renderStoryList();
        };
        const content = document.createElement('div');
        content.style = 'flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0;';
        let preview = story.content.split('\n')[0].replace(/<br\s*\/?>(\s*)?/g, '').trim();
        if (preview.length > 20) preview = preview.slice(0, 20) + '...';
        content.innerHTML = `<b style='font-weight:600;'>${story.user}</b>：<span style='color:#444;'>${preview}</span>`;
        // tag chips
        if (story.tags && Array.isArray(story.tags) && story.tags.length > 0) {
            const tagWrap = document.createElement('div');
            tagWrap.style.display = 'inline-block';
            tagWrap.style.marginLeft = '8px';
            story.tags.forEach(tag => {
                const chip = document.createElement('span');
                chip.className = 'tag-chip' + (story.tags && story.tags.includes(tag) ? ' tag-chip-selected' : '');
                chip.textContent = tag;
                chip.onclick = (e) => {
                    e.stopPropagation();
                    chip.classList.toggle('tag-chip-selected');
                };
                tagWrap.appendChild(chip);
            });
            content.appendChild(tagWrap);
        }
        // 編輯按鈕
        const editBtn = document.createElement('button');
        editBtn.textContent = '編輯';
        editBtn.className = 'story-edit-btn';
        editBtn.style.border = 'none';
        editBtn.style.borderRadius = '6px';
        editBtn.style.padding = '2px 12px';
        editBtn.style.fontSize = '13px';
        editBtn.style.marginLeft = '8px';
        editBtn.style.cursor = 'pointer';
        editBtn.style.background = '#f6f6f6';
        editBtn.style.color = '#1976d2';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            openEditStoryModal(story.id);
        };
        // 刪除按鈕
        const delBtn = document.createElement('button');
        delBtn.textContent = '刪除';
        delBtn.className = 'story-del-btn';
        delBtn.style.border = 'none';
        delBtn.style.borderRadius = '6px';
        delBtn.style.padding = '2px 12px';
        delBtn.style.fontSize = '13px';
        delBtn.style.marginLeft = '8px';
        delBtn.style.cursor = 'pointer';
        delBtn.style.transition = 'background 0.2s, color 0.2s, box-shadow 0.2s';
        delBtn.style.background = '#f6f6f6';
        delBtn.style.color = '#a00';
        delBtn.onmouseenter = () => { delBtn.style.background = '#ffeaea'; delBtn.style.color = '#d00'; };
        delBtn.onmouseleave = () => { delBtn.style.background = '#f6f6f6'; delBtn.style.color = '#a00'; };
        delBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm('確定要刪除此故事？')) {
                const newList = loadStories().filter(s => s.id !== story.id);
                saveStories(newList);
                if (getSelectedStoryId() === story.id) setSelectedStoryId('');
                renderStoryList();
            }
        };
        row.appendChild(content);
        row.appendChild(editBtn);
        row.appendChild(delBtn);
        storyListDiv.appendChild(row);
    });
}
window.renderStoryList = renderStoryList;
window.setSelectedStoryId = setSelectedStoryId;
window.getSelectedStoryId = getSelectedStoryId;
window.updateStoryUserNames = updateStoryUserNames; // 🔥 暴露到全局
window.getCurrentUserName = getCurrentUserName; // 🔥 暴露到全局

// 🔥 新增：测试函数，供手动调试使用
window.testStoryFunctions = function() {
    console.log('=== 故事列表功能测试 ===');
    console.log('1. 当前用户名称:', getCurrentUserName());
    console.log('2. 当前故事列表:', loadStories());
    console.log('3. localStorage中的用户名称:', localStorage.getItem('chat_protagonist_name'));
    console.log('4. 调用更新函数...');
    updateStoryUserNames();
    console.log('5. 更新后的故事列表:', loadStories());
};

// 🔥 修改：打开故事添加窗口
window.openAddStoryModal = function() {
    // 显示modal
    document.getElementById('addStoryModal').classList.remove('hidden');
    
    // 清空内容
    const contentInput = document.getElementById('storyContentInput');
    if (contentInput) {
        contentInput.value = '';
    }
    
    // 清空tag chips（如果存在）
    if (typeof renderTagChips === 'function') {
        renderTagChips([]);
    }
    
    // 🔥 填充用户名下拉菜单
    setTimeout(() => {
        populateStoryUserDropdown();
    }, 100); // 稍微延迟确保DOM已完全更新
};


window.closeAddStoryModal = function() {
    document.getElementById('addStoryModal').classList.add('hidden');
};

// 🔥 修改：添加故事函数
window.addStoryToList = function() {
    console.log('[故事列表] 开始添加新故事...');
    
    // 从下拉菜单获取选择的用户名
    const dropdown = document.getElementById('storyProtagonistSelect') || 
                    document.querySelector('#addStoryModal select');
    
    let user;
    if (dropdown && dropdown.value && dropdown.value.trim() !== '') {
        user = dropdown.value;
        console.log('[故事列表] 使用下拉菜单选择的用户名:', user);
    } else {
        user = getCurrentUserName(); // 回退到自动获取
        console.log('[故事列表] 下拉菜单无选择，使用自动获取的用户名:', user);
    }
    
    const content = document.getElementById('storyContentInput').value.trim();
    
    console.log('[故事列表] 用户名称:', user);
    console.log('[故事列表] 内容:', content);
    
    // 获取标签（如果存在）
    let tags = [];
    try {
        const chipContainer = document.getElementById('storyTagsChips');
        if (chipContainer) {
            tags = Array.from(chipContainer.children)
                .filter(chip => chip.classList.contains('tag-chip-selected'))
                .map(chip => chip.textContent);
        }
    } catch (error) {
        console.warn('[故事列表] 获取标签时出错:', error);
    }
    
    console.log('[故事列表] 标签:', tags);
    
    if (!content) {
        alert('請填寫內容');
        return;
    }
    
    const stories = loadStories();
    const id = 'story_' + Date.now();
    const newStory = { id, user, content, tags };
    
    console.log('[故事列表] 新故事对象:', newStory);
    
    stories.push(newStory);
    saveStories(stories);
    setSelectedStoryId(id);
    renderStoryList();
    closeAddStoryModal();
    
    console.log('[故事列表] 故事添加完成，当前故事列表:', loadStories());
};

// Tag 輸入與 chip 顯示
function renderTagChips(selectedTags) {
    const chipContainer = document.getElementById('storyTagsChips');
    chipContainer.innerHTML = '';
    const globalTags = loadGlobalTags();
    globalTags.forEach(tag => {
        // 預設全選：selectedTags 為空時全部選中
        const isSelected = selectedTags.length === 0 || selectedTags.includes(tag);
        const chip = document.createElement('span');
        chip.className = 'tag-chip' + (isSelected ? ' tag-chip-selected' : '');
        chip.textContent = tag;
        chip.onclick = () => {
            chip.classList.toggle('tag-chip-selected');
        };
        // 加入可刪除叉叉
        const del = document.createElement('span');
        del.className = 'tag-chip-delete';
        del.textContent = '✕';
        del.style.marginLeft = '6px';
        del.style.fontWeight = 'bold';
        del.style.cursor = 'pointer';
        del.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`確定要永久刪除關鍵字「${tag}」？（所有故事也會移除）`)) {
                // 刪除全局tag
                let tags = loadGlobalTags().filter(t => t !== tag);
                saveGlobalTags(tags);
                // 移除所有故事的該tag
                let stories = loadStories();
                stories.forEach(s => {
                    if (Array.isArray(s.tags)) {
                        s.tags = s.tags.filter(t => t !== tag);
                    }
                });
                saveStories(stories);
                renderTagChips(selectedTags.filter(t => t !== tag));
                if (typeof renderStoryList === 'function') renderStoryList();
            }
        };
        chip.appendChild(del);
        chipContainer.appendChild(chip);
    });
}
function getCurrentTags() {
    // 只取已勾選的chip
    const chipContainer = document.getElementById('storyTagsChips');
    return Array.from(chipContainer.children)
        .filter(chip => chip.classList.contains('tag-chip-selected'))
        .map(chip => chip.textContent);
}
function setCurrentTags(tags) {
    renderTagChips(tags);
}
document.addEventListener('DOMContentLoaded', function() {
    // tag輸入框監聽
    const tagInput = document.getElementById('storyTagsInput');
    if (tagInput) {
        tagInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                e.preventDefault();
                let val = tagInput.value.trim();
                if (val) {
                    addGlobalTag(val);
                    tagInput.value = '';
                    let selected = getCurrentTags();
                    selected.push(val);
                    renderTagChips(selected);
                }
            }
        });
    }
});

// 初始化故事列表渲染
window.addEventListener('DOMContentLoaded', renderStoryList);

// 附加美化CSS
(function(){
    const style = document.createElement('style');
    style.innerHTML = `
    #storyListSection .story-card { transition: box-shadow 0.2s, background 0.2s, border 0.2s; }
    #storyListSection .story-card:hover { box-shadow:0 2px 12px #0002; background:#f6f8ff; }
    #storyListSection .story-del-btn {
      margin-left:8px; background:#f6f6f6; color:#a00; border:none; border-radius:6px; padding:2px 10px; cursor:pointer; font-size:12px; transition:background 0.2s, color 0.2s;
    }
    #storyListSection .story-del-btn:hover { background:#ffeaea; color:#d00; }
    #storyListSection .story-select-card.selected {
      background: linear-gradient(90deg, #d0e6ff 0%, #b3d1ff 100%);
      box-shadow: 0 4px 16px #4a8a2a22;
      border: 2px solid #2979ff;
      position: relative;
    }
    #storyListSection .story-select-card.selected::before {
      content: '';
      position: absolute;
      left: 0; top: 8px; bottom: 8px;
      width: 5px;
      border-radius: 4px;
      background: #2979ff;
      box-shadow: 0 0 6px #2979ff55;
    }
    #storyListSection .story-select-card { border: 2px solid transparent; position: relative; }
    #storyListSection .story-select-card.selected .story-del-btn {
      background: #2979ff; color: #fff;
    }
    .tag-row { width: 100%; margin-bottom: 8px; }
    .tag-chip {
      display:inline-block; background:#e3f2fd; color:#1976d2; border-radius:16px; padding:2px 12px 2px 10px; font-size:13px; margin-right:4px; margin-bottom:2px; position:relative;
      border:1px solid #90caf9; transition:background 0.2s, color 0.2s;
      cursor:pointer;
    }
    .tag-chip:hover { background:#bbdefb; color:#0d47a1; }
    .tag-chip span { font-weight:bold; margin-left:4px; color:#d32f2f; cursor:pointer; }
    .tag-chip-selected { background:#1976d2 !important; color:#fff !important; border-color:#1976d2 !important; }
    .tag-chip-delete { color:#d32f2f; margin-left:6px; font-size:14px; font-weight:bold; cursor:pointer; }
    .tag-chip-delete:hover { color:#b71c1c; }
    `;
    document.head.appendChild(style);
})();

// === 新增故事彈窗HTML結構增強 ===
(function(){
    const modal = document.getElementById('addStoryModal');
    if (modal && !document.getElementById('storyTagsInput')) {
        const body = modal.querySelector('.function-modal-body') || modal.querySelector('.modal-body') || modal;
        // 找到內容textarea
        const contentTextarea = body.querySelector('textarea, [id=storyContentInput]');
        // 新增一層tag-row
        const tagRow = document.createElement('div');
        tagRow.className = 'tag-row';
        tagRow.style.display = 'flex';
        tagRow.style.flexDirection = 'column';
        tagRow.style.gap = '2px';
        tagRow.style.margin = '8px 0 0 0';
        const tagLabel = document.createElement('label');
        tagLabel.textContent = '關鍵字（多個以逗號/空格/Enter分隔）:';
        tagLabel.setAttribute('for', 'storyTagsInput');
        tagLabel.style.marginTop = '0';
        const tagInput = document.createElement('input');
        tagInput.type = 'text';
        tagInput.id = 'storyTagsInput';
        tagInput.placeholder = '輸入角色關鍵字...';
        tagInput.style.marginBottom = '2px';
        tagInput.autocomplete = 'off';
        tagInput.style.width = '100%';
        const chipDiv = document.createElement('div');
        chipDiv.id = 'storyTagsChips';
        chipDiv.style.marginBottom = '4px';
        chipDiv.style.display = 'flex';
        chipDiv.style.flexWrap = 'wrap';
        chipDiv.style.gap = '6px';
        chipDiv.style.minHeight = '28px';
        tagRow.appendChild(tagLabel);
        tagRow.appendChild(tagInput);
        tagRow.appendChild(chipDiv);
        // 插入到內容textarea之後
        if (contentTextarea && contentTextarea.parentNode) {
            contentTextarea.parentNode.insertBefore(tagRow, contentTextarea.nextSibling);
        } else {
            body.appendChild(tagRow);
        }
    }
    // chip樣式
    const style = document.createElement('style');
    style.innerHTML = `
    .tag-row { width: 100%; margin-bottom: 8px; }
    .tag-chip {
      display:inline-block; background:#e3f2fd; color:#1976d2; border-radius:16px; padding:2px 12px 2px 10px; font-size:13px; margin-right:4px; margin-bottom:2px; position:relative;
      border:1px solid #90caf9; transition:background 0.2s, color 0.2s;
      cursor:pointer;
    }
    .tag-chip:hover { background:#bbdefb; color:#0d47a1; }
    .tag-chip span { font-weight:bold; margin-left:4px; color:#d32f2f; cursor:pointer; }
    .tag-chip-selected { background:#1976d2 !important; color:#fff !important; border-color:#1976d2 !important; }
    `;
    document.head.appendChild(style);
})();

// 編輯故事彈窗
window.openEditStoryModal = function(storyId) {
    const stories = loadStories();
    const story = stories.find(s => s.id === storyId);
    if (!story) return;
    
    // 打開彈窗
    document.getElementById('addStoryModal').classList.remove('hidden');
    
    // 設置內容
    const contentInput = document.getElementById('storyContentInput');
    if (contentInput) {
        contentInput.value = story.content || '';
    }
    
    // 設置tag chips
    renderTagChips(story.tags || []);
    
    // 修改確定按鈕的行為為編輯模式
    const okBtn = document.querySelector('#addStoryModal button[onclick="addStoryToList()"]');
    if (okBtn) {
        // 保存原始事件處理器
        const originalOnClick = okBtn.onclick;
        
        // 設置新的編輯事件處理器
        okBtn.onclick = function() {
            const content = document.getElementById('storyContentInput').value.trim();
            const tags = getCurrentTags();
            
            if (!content) { 
                alert('請填寫內容'); 
                return; 
            }
            
            // 更新故事內容
            story.content = content;
            story.tags = tags;
            
            // 保存到localStorage
            saveStories(stories);
            
            // 重新渲染故事列表
            renderStoryList();
            
            // 關閉彈窗
            closeAddStoryModal();
            
            // 恢復原始事件處理器
            okBtn.onclick = originalOnClick;
        };
    }
};

// 發送故事到聊天室時自動組合格式
async function sendSelectedStoryToChat() {
    const stories = loadStories();
    const selectedId = getSelectedStoryId();
    const story = stories.find(s => s.id === selectedId);
    if (!story) return;

    // 只取當前被勾選的 chip
    let tags = [];
    const storyListDiv = document.getElementById('storyList');
    if (storyListDiv) {
        const chips = storyListDiv.querySelectorAll('.story-row.story-select-card.selected .tag-chip');
        tags = Array.from(chips)
            .filter(chip => chip.classList.contains('tag-chip-selected'))
            .map(chip => chip.textContent);
    }

    let msg = `主角: ${story.user}\n內容: ${story.content}`;
    if (tags.length > 0) {
        msg += `\n關鍵字: ${tags.join(', ')}`;
    }
    // 發送到主聊天室
    const tavernMainWindow = findTavernTopWindow();
    if (tavernMainWindow) {
        const stInput = tavernMainWindow.document.querySelector('#send_textarea');
        const sendButton = tavernMainWindow.document.querySelector('#send_but');
        if (stInput && sendButton) {
            stInput.value = msg;
            stInput.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(() => sendButton.click(), 120);
        }
    }
}
window.sendSelectedStoryToChat = sendSelectedStoryToChat;

// 手動更新浮動助手圖示（用於測試）
window.forceUpdateFloatingAssistantIcon = function() {
    updateFloatingAssistantIcon();
    console.log('[浮動助手] 手動更新圖示');
};

// === 全局tag管理 ===
const GLOBAL_TAGS_KEY = 'tavern_global_tags';
function loadGlobalTags() {
    try { return JSON.parse(localStorage.getItem(GLOBAL_TAGS_KEY)) || []; } catch { return []; }
}
function saveGlobalTags(tags) {
    localStorage.setItem(GLOBAL_TAGS_KEY, JSON.stringify(Array.from(new Set(tags))));
}
function addGlobalTag(tag) {
    let tags = loadGlobalTags();
    if (!tags.includes(tag)) { tags.push(tag); saveGlobalTags(tags); }
}

async function updateFloatingAssistantIcon() {
    const floatingButton = document.getElementById('floatingButton');
    if (!floatingButton) return;
    floatingButton.innerHTML = '';
    
    let url = '';
    
    // 🆕 優先從 IndexedDB 獲取設置的圖示
    if (typeof getFloatingAssistantSettingIcon === 'function') {
        try {
            const base64Icon = await getFloatingAssistantSettingIcon();
            if (base64Icon) {
                url = base64Icon;
                console.log('[浮動助手] 從 IndexedDB 載入設置圖示成功');
            }
        } catch (error) {
            console.error('[浮動助手] 從 IndexedDB 載入圖示失敗:', error);
        }
    }
    
    // 如果 IndexedDB 沒有圖示，才從 localStorage 獲取普通 URL
    if (!url) {
        url = localStorage.getItem('floating_assistant_icon_url') || '';
        if (url) {
            console.log('[浮動助手] 從 localStorage 載入 URL 圖示');
        }
    }
    
    if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '浮動助手圖示';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        img.style.display = 'block';
        img.style.margin = 'auto';
        
        // 🆕 添加特殊標記，防止被 icon-config.js 覆蓋
        img.setAttribute('data-floating-assistant-icon', 'true');
        img.setAttribute('data-no-replace', 'true');
        
        img.onerror = function() {
            console.error('[浮動助手] 圖示載入失敗，使用預設圖示');
            floatingButton.innerHTML = '<span class="floating-icon">⭐</span>';
        };
        floatingButton.appendChild(img);
        console.log('[浮動助手] 圖示已更新，URL:', url.substring(0, 50) + '...');
    } else {
        floatingButton.innerHTML = '<span class="floating-icon">⭐</span>';
        console.log('[浮動助手] 使用預設圖示');
    }
}


// 🔥 页面加载时确保结构正确
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        ensureStoryModalStructure();
        // 初始化浮動助手圖示（延遲執行，確保在 icon-config.js 之後）
        setTimeout(() => {
            updateFloatingAssistantIcon();
        }, 1000);
    }, 500);
});

// 🔥 调试函数：检查modal状态
window.debugStoryModal = function() {
    console.log('=== 故事Modal调试信息 ===');
    const modal = document.getElementById('addStoryModal');
    console.log('1. Modal元素:', modal);
    
    if (modal) {
        console.log('2. Modal HTML:', modal.innerHTML);
        const select = modal.querySelector('select');
        console.log('3. Select元素:', select);
        if (select) {
            console.log('4. Select选项数量:', select.options.length);
            console.log('5. Select当前值:', select.value);
        }
    }
    
    console.log('6. 当前用户名:', getCurrentUserName());
    console.log('7. 所有用户名:', getAllAvailableUserNames());
};