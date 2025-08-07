/**
 * 人設庫管理系統 - JCY版
 * 包含角色增刪改查、文件上傳、表情管理等功能
 */

// 全局變數
let characters = [];
let currentEditingCharacter = null;

// DOM元素
let elements = {};

// 初始化
document.addEventListener('DOMContentLoaded', async function() {
    initializeElements();
    setupEventListeners();
    
    // 檢查是否需要顯示使用提示
    const hideUsageTips = localStorage.getItem('jcy_hide_usage_tips');
    if (hideUsageTips === 'true') {
        const tipsElement = document.getElementById('usageTips');
        if (tipsElement) {
            tipsElement.style.display = 'none';
        }
    }
    
    // 通知父窗口準備就緒
    notifyParent('CHAR_LIB_READY', {});
    
    // 等待一段時間後再載入角色數據，確保JCY系統已準備好
    setTimeout(async () => {
        await loadCharacters();
    }, 1000);
    
    console.log('[人設庫] 初始化完成');
});

// 初始化DOM元素引用
function initializeElements() {
    elements = {
        // 主要界面
        characterList: document.getElementById('characterList'),
        emptyState: document.getElementById('emptyState'),
        backBtn: document.getElementById('backBtn'),
        addCharBtn: document.getElementById('addCharBtn'),
        
        // 角色編輯模態窗口
        characterModal: document.getElementById('characterModal'),
        modalTitle: document.getElementById('modalTitle'),
        characterForm: document.getElementById('characterForm'),
        closeModalBtn: document.getElementById('closeModalBtn'),
        cancelBtn: document.getElementById('cancelBtn'),
        saveBtn: document.getElementById('saveBtn'),
        
        // 表單字段
        charName: document.getElementById('charName'),
        charPersonality: document.getElementById('charPersonality'),
        charSuffix: document.getElementById('charSuffix'),
        
        // 頭像預覽和上傳
        avatarPreview: document.getElementById('avatarPreview'),
        avatarInput: document.getElementById('avatarInput')
    };
}

// 設置事件監聽器
function setupEventListeners() {
    // 主要按鈕
    elements.backBtn.addEventListener('click', closeLibrary);
    elements.addCharBtn.addEventListener('click', () => openCharacterModal());
    
    // 刷新按鈕
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', forceRefreshCharacterList);
    }
    
    // 角色模態窗口
    elements.closeModalBtn.addEventListener('click', closeCharacterModal);
    elements.cancelBtn.addEventListener('click', closeCharacterModal);
    elements.saveBtn.addEventListener('click', saveCharacter);
    
    // 文件上傳事件
    elements.avatarInput.addEventListener('change', (e) => handleFileUpload(e, 'avatar'));
    
    // 點擊模態窗口背景關閉
    elements.characterModal.addEventListener('click', (e) => {
        if (e.target === elements.characterModal) {
            closeCharacterModal();
        }
    });
    

    
    // 監聽來自父窗口的消息
    window.addEventListener('message', handleParentMessage);
}

// 與父窗口通信
function notifyParent(type, data) {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: type,
            data: data,
            source: 'CHAR_LIB',
            timestamp: Date.now()
        }, '*');
        console.log(`[人設庫] 已發送消息到父窗口: ${type}`);
    }
}

// 處理來自父窗口的消息
function handleParentMessage(event) {
    const { type, data, error } = event.data || {};
    
    // 移除條件檢查，允許處理所有來自父窗口的消息
    console.log('[人設庫] 收到父窗口消息:', type, event.data);
    
    switch (type) {
        case 'CHAR_SAVE_SUCCESS':
            handleSaveSuccess(data);
            break;
        case 'CHAR_SAVE_ERROR':
            handleSaveError(error);
            break;
        case 'CHAR_DELETE_SUCCESS':
            handleDeleteSuccess(data);
            break;
        case 'CHAR_DELETE_ERROR':
            handleDeleteError(error);
            break;
        default:
            console.log('[人設庫] 未處理的消息類型:', type);
    }
}

// 載入角色列表
async function loadCharacters() {
    try {
        console.log('[人設庫] 開始載入角色列表...');
        
        // 由於跨域限制，改為使用postMessage請求角色數據
        try {
            // 發送請求到父窗口獲取角色數據
            const messageData = {
                type: 'CHAR_LIB_REQUEST_CHARACTERS',
                timestamp: Date.now()
            };
            
            console.log('[人設庫] 發送角色數據請求:', messageData);
            window.parent.postMessage(messageData, '*');
            
            // 等待回應（設置超時）
            const response = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('請求角色數據超時'));
                }, 3000);
                
                const messageHandler = (event) => {
                    if (event.data && event.data.type === 'JCY_RESPONSE_CHAR_LIB_CHARACTERS') {
                        clearTimeout(timeout);
                        window.removeEventListener('message', messageHandler);
                        resolve(event.data.characters || []);
                    }
                };
                
                window.addEventListener('message', messageHandler);
            });
            
            characters = response;
            console.log('[人設庫] 從JCY系統獲取角色列表:', characters.length, '個角色');
            
            // 確保角色數據是有效的
            if (Array.isArray(characters)) {
                characters = characters.filter(char => char && char.id && char.name);
                console.log('[人設庫] 過濾後的有效角色數量:', characters.length);
            } else {
                console.warn('[人設庫] 角色數據格式不正確，重置為空數組');
                characters = [];
            }
        } catch (error) {
            console.warn('[人設庫] 無法從JCY系統獲取角色數據，使用空數據:', error);
            characters = [];
        }
        
        // 確保DOM元素已初始化
        if (!elements.characterList) {
            console.log('[人設庫] DOM元素未初始化，重新初始化');
            initializeElements();
        }
        
        renderCharacterList();
        console.log('[人設庫] 已載入', characters.length, '個角色');
        
        // 通知父窗口更新人設列表
        if (characters.length > 0) {
            notifyParent('CHAR_LIB_DATA_UPDATED', { count: characters.length });
        }
        
        // 通知VN劇情設置系統角色數據已更新
        notifyParent('CHARACTERS_UPDATED', { characters: characters });
    } catch (error) {
        console.error('[人設庫] 載入角色失敗:', error);
        characters = [];
        renderCharacterList();
    }
}

// 渲染角色列表
function renderCharacterList() {
    console.log('[人設庫] 開始渲染角色列表，角色數量:', characters.length);
    
    // 確保DOM元素存在
    if (!elements.characterList || !elements.emptyState) {
        console.error('[人設庫] DOM元素未找到，重新初始化');
        initializeElements();
    }
    
    if (characters.length === 0) {
        elements.characterList.style.display = 'none';
        elements.emptyState.style.display = 'block';
        console.log('[人設庫] 顯示空狀態');
        return;
    }
    
    elements.emptyState.style.display = 'none';
    elements.characterList.style.display = 'grid';
    
    // 清空現有內容
    elements.characterList.innerHTML = '';
    
    // 重新創建所有角色項目
    characters.forEach((character, index) => {
        const characterItem = createCharacterItem(character);
        elements.characterList.appendChild(characterItem);
        console.log(`[人設庫] 已添加角色項目 ${index + 1}: ${character.name}`);
    });
    
    console.log('[人設庫] 角色列表渲染完成');
}

// 創建角色項目
function createCharacterItem(character) {
    const item = document.createElement('div');
    item.className = 'character-item';
    item.onclick = () => openCharacterModal(character);
    
    const avatar = character.avatar ? 
        `<img src="${character.avatar}" alt="${character.name}">` : 
        `<div class="character-avatar-placeholder">👤</div>`;
    
    const description = character.personality ? 
        character.personality.substring(0, 100) + (character.personality.length > 100 ? '...' : '') : 
        '無描述';
    
    // 使用更安全的方式處理JSON字符串
    const characterJson = JSON.stringify(character).replace(/"/g, '&quot;');
    
    item.innerHTML = `
        <div class="character-actions">
            <button class="edit-btn" onclick="event.stopPropagation(); openCharacterModal(${characterJson})" title="編輯角色">✏️</button>
            <button class="delete-btn" onclick="event.stopPropagation(); deleteCharacter('${character.id}')" title="刪除角色">🗑️</button>
        </div>
        <div class="character-avatar">
            ${avatar}
        </div>
        <div class="character-name">${character.name}</div>
        <div class="character-description">${description}</div>
        <div class="character-hint">鼠標懸停顯示操作按鈕</div>
    `;
    
    console.log(`[人設庫] 創建角色項目: ${character.name} (ID: ${character.id})`);
    return item;
}

// 打開角色編輯模態窗口
function openCharacterModal(character = null) {
    currentEditingCharacter = character;
    
    // 設置標題
    elements.modalTitle.textContent = character ? '編輯角色' : '新增角色';
    
    // 填充表單
    if (character) {
        elements.charName.value = character.name || '';
        elements.charPersonality.value = character.personality || '';
        elements.charSuffix.value = character.suffix || '';
        
        // 設置頭像預覽
        if (character.avatar) {
            setImagePreview(elements.avatarPreview, character.avatar);
        } else {
            resetImagePreview(elements.avatarPreview, '👤', '角色頭像');
        }
        
        // 設置頭像預覽
        if (character.avatar) {
            setImagePreview(elements.avatarPreview, character.avatar);
        } else {
            resetImagePreview(elements.avatarPreview, '👤', '角色頭像');
        }
    } else {
        // 清空表單
        elements.characterForm.reset();
        resetImagePreview(elements.avatarPreview, '👤', '角色頭像');
    }
    
    // 顯示模態窗口
    elements.characterModal.style.display = 'flex';
}

// 關閉角色編輯模態窗口
function closeCharacterModal() {
    elements.characterModal.style.display = 'none';
    currentEditingCharacter = null;
}

// 保存角色
function saveCharacter() {
    const name = elements.charName.value.trim();
    const personality = elements.charPersonality.value.trim();
    
    if (!name) {
        alert('請輸入角色名稱');
        return;
    }
    
    if (!personality) {
        alert('請輸入角色人設');
        return;
    }
    
    const characterData = {
        id: currentEditingCharacter?.id || Date.now().toString(),
        name: name,
        personality: personality,
        suffix: elements.charSuffix.value.trim(),
        avatar: getImageFromPreview(elements.avatarPreview) || '',
        createdAt: currentEditingCharacter?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    // 通知父窗口保存
    notifyParent('CHAR_LIB_SAVE_CHARACTER', characterData);
}

// 處理保存成功
function handleSaveSuccess(characterData) {
    console.log('[人設庫] 角色保存成功:', characterData.name);
    
    // 更新本地角色列表
    const index = characters.findIndex(char => char.id === characterData.id);
    if (index !== -1) {
        characters[index] = characterData;
        console.log('[人設庫] 更新現有角色:', characterData.name);
    } else {
        characters.push(characterData);
        console.log('[人設庫] 添加新角色:', characterData.name);
    }
    
    // 確保DOM元素存在後再重新渲染
    setTimeout(() => {
        // 重新渲染列表
        renderCharacterList();
        
        // 關閉模態窗口
        closeCharacterModal();
        
        // 通知父窗口數據已更新
        notifyParent('CHAR_LIB_DATA_UPDATED', { count: characters.length });
        
        // 通知VN劇情設置系統角色數據已更新
        notifyParent('CHARACTERS_UPDATED', { characters: characters });
        
        // 顯示成功消息
        showToast('角色保存成功！', 'success');
        
        console.log('[人設庫] 角色列表已重新渲染，當前角色數量:', characters.length);
    }, 100);
}

// 處理保存錯誤
function handleSaveError(error) {
    console.error('[人設庫] 角色保存失敗:', error);
    showToast('角色保存失敗：' + error, 'error');
}

// 刪除角色
function deleteCharacter(characterId) {
    const character = characters.find(char => char.id === characterId);
    if (!character) {
        console.error('[人設庫] 找不到要刪除的角色:', characterId);
        return;
    }
    
    console.log('[人設庫] 準備刪除角色:', character.name);
    
    // 更友好的確認對話框
    const confirmMessage = `⚠️ 確定要刪除角色嗎？\n\n` +
                          `角色名稱：${character.name}\n` +
                          `創建時間：${character.createdAt ? new Date(character.createdAt).toLocaleDateString() : '未知'}\n\n` +
                          `此操作無法復原，請謹慎操作！`;
    
    if (confirm(confirmMessage)) {
        console.log('[人設庫] 用戶確認刪除，發送刪除請求');
        
        // 添加視覺反饋
        const characterItem = document.querySelector(`[onclick*="${characterId}"]`);
        if (characterItem && characterItem.closest('.character-item')) {
            const item = characterItem.closest('.character-item');
            item.style.opacity = '0.5';
            item.style.transform = 'scale(0.95)';
            item.style.transition = 'all 0.3s ease';
        }
        
        notifyParent('CHAR_LIB_DELETE_CHARACTER', characterId);
    } else {
        console.log('[人設庫] 用戶取消刪除操作');
    }
}

// 處理刪除成功
function handleDeleteSuccess(data) {
    console.log('[人設庫] 角色刪除成功:', data.id);
    
    // 從本地列表移除
    characters = characters.filter(char => char.id !== data.id);
    
    // 確保DOM元素存在後再重新渲染
    setTimeout(() => {
        // 重新渲染列表
        renderCharacterList();
        
        // 通知父窗口數據已更新
        notifyParent('CHAR_LIB_DATA_UPDATED', { count: characters.length });
        
        // 通知VN劇情設置系統角色數據已更新
        notifyParent('CHARACTERS_UPDATED', { characters: characters });
        
        // 顯示成功消息
        showToast('角色刪除成功！', 'success');
        
        console.log('[人設庫] 角色列表已重新渲染，當前角色數量:', characters.length);
    }, 100);
}

// 處理刪除錯誤
function handleDeleteError(error) {
    console.error('[人設庫] 角色刪除失敗:', error);
    showToast('角色刪除失敗：' + error, 'error');
}



// 文件上傳處理
function handleFileUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 檢查文件類型
    if (!file.type.startsWith('image/')) {
        alert('請選擇圖片文件');
        return;
    }
    
    // 檢查文件大小 (20MB限制，因為使用IndexedDB)
    if (file.size > 20 * 1024 * 1024) {
        alert('圖片文件大小不能超過20MB');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const imageUrl = e.target.result;
        
        if (type === 'avatar') {
            setImagePreview(elements.avatarPreview, imageUrl);
        }
    };
    reader.readAsDataURL(file);
}

// 設置圖片預覽
function setImagePreview(previewElement, imageUrl) {
    previewElement.innerHTML = `<img src="${imageUrl}" alt="預覽">`;
}

// 重置圖片預覽
function resetImagePreview(previewElement, icon, text) {
    previewElement.innerHTML = `
        <div class="avatar-placeholder">
            <span>${icon}</span>
            <div class="upload-text">${text}</div>
        </div>
    `;
}

// 從預覽元素獲取圖片
function getImageFromPreview(previewElement) {
    const img = previewElement.querySelector('img');
    return img ? img.src : null;
}



// 關閉人設庫
function closeLibrary() {
    notifyParent('CHAR_LIB_CLOSE', {});
}

// 強制刷新角色列表
function forceRefreshCharacterList() {
    console.log('[人設庫] 強制刷新角色列表');
    loadCharacters().then(() => {
        console.log('[人設庫] 強制刷新完成');
    }).catch(error => {
        console.error('[人設庫] 強制刷新失敗:', error);
    });
}

// 全局函數（供HTML調用）
window.openCharacterModal = openCharacterModal;
window.deleteCharacter = deleteCharacter;
window.closeUsageTips = closeUsageTips;
window.forceRefreshCharacterList = forceRefreshCharacterList;

// 關閉使用提示
function closeUsageTips() {
    const tipsElement = document.getElementById('usageTips');
    if (tipsElement) {
        tipsElement.style.opacity = '0';
        tipsElement.style.transform = 'translateY(-20px)';
        setTimeout(() => {
            tipsElement.style.display = 'none';
        }, 300);
        
        // 記住用戶選擇，下次不再顯示
        localStorage.setItem('jcy_hide_usage_tips', 'true');
    }
}

// 顯示提示消息
function showToast(message, type = 'info') {
    // 創建提示元素
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        max-width: 300px;
        word-wrap: break-word;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
    `;
    
    // 設置顏色
    switch (type) {
        case 'success':
            toast.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
            break;
        case 'error':
            toast.style.background = 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)';
            break;
        default:
            toast.style.background = 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)';
    }
    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // 動畫顯示
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 100);
    
    // 自動移除
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// 通用立繪系統將在VN劇情設置中處理

// 全局函數（供HTML調用）
window.openCharacterModal = openCharacterModal;
window.deleteCharacter = deleteCharacter;
window.closeUsageTips = closeUsageTips; 