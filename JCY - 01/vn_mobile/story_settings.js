/**
 * 劇情設置管理系統 - VN面板JCY版
 * 包含劇情創建、編輯、刪除、人設庫整合等功能
 */

// 全局變數
let stories = [];
let characters = [];
let worldBooks = [];
let currentEditingStory = null;

// DOM元素
let storyElements = {};

// 初始化
document.addEventListener('DOMContentLoaded', async function() {
    console.log('[劇情設置] 開始初始化...');
    
    initializeStoryElements();
    setupStoryEventListeners();
    loadStories();
    await loadCharacters();
    await loadWorldBooks();
    
    // 測試按鈕是否正確綁定
    setTimeout(() => {
        if (storyElements.addStoryBtn) {
            console.log('[劇情設置] 添加劇情按鈕已找到:', storyElements.addStoryBtn);
            console.log('[劇情設置] 按鈕事件監聽器數量:', storyElements.addStoryBtn.onclick ? '有onclick' : '無onclick');
        } else {
            console.error('[劇情設置] 添加劇情按鈕未找到!');
        }
        
        if (storyElements.storyEditModal) {
            console.log('[劇情設置] 劇情編輯模態窗口已找到:', storyElements.storyEditModal);
        } else {
            console.error('[劇情設置] 劇情編輯模態窗口未找到!');
        }
    }, 1000);
    
    console.log('[劇情設置] 初始化完成');
});

// 初始化DOM元素引用
function initializeStoryElements() {
    storyElements = {
        // 劇情設置模態窗口
        storySettingsModal: document.getElementById('storySettingsModal'),
        storyList: document.getElementById('storyList'),
        emptyStoryList: document.getElementById('emptyStoryList'),
        addStoryBtn: document.getElementById('addStoryBtn'),
        
        // 劇情編輯模態窗口
        storyEditModal: document.getElementById('storyEditModal'),
        storyEditTitle: document.getElementById('storyEditTitle'),
        storyEditForm: document.getElementById('storyEditForm'),
        closeStoryEdit: document.querySelector('.close-story-edit'),
        cancelStoryEdit: document.getElementById('cancelStoryEdit'),
        saveStoryEdit: document.getElementById('saveStoryEdit'),
        
        // 表單字段
        worldBooksContainer: document.getElementById('worldBooksContainer'),
        mainCharacter: document.getElementById('mainCharacter'),
        supportingCharactersContainer: document.getElementById('supportingCharactersContainer'),
        characterPresetsUrl: document.getElementById('portrait-base-url'),
        characterPresetsFormat: document.getElementById('portrait-format'),
        storyTitle: document.getElementById('storyTitle'),
        storyContent: document.getElementById('storyContent'),
        storyOpening: document.getElementById('storyOpening')
    };
    
    // 檢查並記錄缺失的元素
    const missingElements = [];
    Object.entries(storyElements).forEach(([key, element]) => {
        if (!element) {
            missingElements.push(key);
        }
    });
    
    if (missingElements.length > 0) {
        console.warn('[劇情設置] 以下元素未找到:', missingElements);
    } else {
        console.log('[劇情設置] 所有元素初始化成功');
    }
}

// 設置事件監聽器
function setupStoryEventListeners() {
    // 添加劇情按鈕
    if (storyElements.addStoryBtn) {
        storyElements.addStoryBtn.addEventListener('click', () => {
            console.log('[劇情設置] 點擊添加劇情按鈕');
            openStoryEditModal();
        });
    }
    
    // 劇情編輯模態窗口
    if (storyElements.closeStoryEdit) {
        storyElements.closeStoryEdit.addEventListener('click', closeStoryEditModal);
    }
    
    if (storyElements.cancelStoryEdit) {
        storyElements.cancelStoryEdit.addEventListener('click', closeStoryEditModal);
    }
    
    if (storyElements.saveStoryEdit) {
        storyElements.saveStoryEdit.addEventListener('click', saveStory);
    }
    
    // 點擊模態窗口背景關閉
    if (storyElements.storyEditModal) {
        storyElements.storyEditModal.addEventListener('click', function(e) {
            if (e.target === storyElements.storyEditModal) {
                closeStoryEditModal();
            }
        });
    }
}

// 通知父窗口
function notifyParent(type, data) {
    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: type,
                data: data,
                source: 'VN_STORY_SETTINGS',
                timestamp: Date.now()
            }, '*');
            console.log(`[劇情設置] 已發送消息到父窗口: ${type}`);
        }
    } catch (error) {
        console.error('[劇情設置] 發送消息到父窗口失敗:', error);
    }
}

// 處理來自父窗口的消息
async function handleParentMessage(event) {
    try {
        const { type, data, source } = event.data || {};
        
        console.log('[劇情設置] 收到父窗口消息:', type, source);
        
        // 處理來自人設庫的消息
        if (source === 'CHAR_LIB') {
            switch (type) {
                case 'CHAR_LIB_READY':
                    await loadCharacters();
                    break;
                case 'CHARACTERS_UPDATED':
                    await loadCharacters();
                    break;
                case 'CHAR_LIB_DATA_UPDATED':
                    await loadCharacters();
                    break;
            }
        }
        
        // 處理來自JCY系統的角色數據回應
        if (type === 'JCY_RESPONSE_CHARACTERS') {
            console.log('[劇情設置] 收到JCY系統角色數據:', data?.characters?.length || 0, '個角色');
            
            if (data && data.characters) {
                characters = data.characters;
                populateCharacterOptions();
                console.log('[劇情設置] 已更新角色選項');
            }
        }
        
        // 處理來自JCY系統的世界書數據回應
        if (type === 'JCY_RESPONSE_WORLDBOOKS') {
            console.log('[劇情設置] 收到JCY系統世界書數據:', data?.worldBooks?.length || 0, '個世界書');
            
            if (data && data.worldBooks) {
                worldBooks = data.worldBooks;
                populateWorldBookOptions();
                console.log('[劇情設置] 已更新世界書選項');
            }
        }
        
        // 處理來自JCY系統的世界書更新通知
        if (type === 'JCY_WORLDBOOKS_UPDATED') {
            console.log('[劇情設置] 收到JCY系統世界書更新通知:', data?.worldBooks?.length || 0, '個世界書');
            
            if (data && data.worldBooks) {
                worldBooks = data.worldBooks;
                populateWorldBookOptions();
                showToast('世界書數據已更新', 'success');
                console.log('[劇情設置] 已更新世界書選項');
                
                // 如果劇情編輯模態窗口是打開的，強制刷新世界書選項
                if (storyElements.storyEditModal && storyElements.storyEditModal.classList.contains('modal-active')) {
                    console.log('[劇情設置] 劇情編輯窗口已打開，強制刷新世界書選項');
                    setTimeout(() => {
                        populateWorldBookOptions();
                        console.log('[劇情設置] 強制刷新世界書選項完成');
                    }, 100);
                }
            }
        }
        
    } catch (error) {
        console.error('[劇情設置] 處理父窗口消息失敗:', error);
    }
}

// 監聽父窗口消息
window.addEventListener('message', handleParentMessage);

// 載入劇情列表
function loadStories() {
    try {
        const savedStories = localStorage.getItem('jcy_vn_stories');
        if (savedStories) {
            try {
                stories = JSON.parse(savedStories) || [];
                console.log('[劇情設置] 載入劇情列表:', stories.length, '個劇情');
            } catch (parseError) {
                console.error('[劇情設置] 解析localStorage劇情數據失敗:', parseError);
                stories = [];
            }
        } else {
            stories = [];
            console.log('[劇情設置] 沒有找到保存的劇情，初始化空列表');
        }
        renderStoryList();
    } catch (error) {
        console.error('[劇情設置] 載入劇情列表失敗:', error);
        stories = [];
        renderStoryList();
    }
}

// 載入角色列表
async function loadCharacters() {
    try {
        console.log('[劇情設置] 開始載入角色列表...');
        
        // 由於跨域限制，改為使用postMessage請求角色數據
        try {
            // 發送請求到父窗口獲取角色數據
            const messageData = {
                type: 'VN_REQUEST_CHARACTERS',
                timestamp: Date.now()
            };
            
            console.log('[劇情設置] 發送角色數據請求:', messageData);
            window.parent.postMessage(messageData, '*');
            
            // 等待回應（設置超時）
            const response = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('請求角色數據超時'));
                }, 3000);
                
                const messageHandler = (event) => {
                    if (event.data && event.data.type === 'JCY_RESPONSE_CHARACTERS') {
                        clearTimeout(timeout);
                        window.removeEventListener('message', messageHandler);
                        resolve(event.data.characters || []);
                    }
                };
                
                window.addEventListener('message', messageHandler);
            });
            
            characters = response || [];
            console.log('[劇情設置] 從JCY系統獲取角色列表:', characters.length, '個角色');
            
            // 確保角色數據是有效的
            if (Array.isArray(characters)) {
                characters = characters.filter(char => char && char.id && char.name);
                console.log('[劇情設置] 過濾後的有效角色數量:', characters.length);
            } else {
                console.warn('[劇情設置] 角色數據格式不正確，重置為空數組');
                characters = [];
            }
        } catch (error) {
            console.warn('[劇情設置] 無法從JCY系統獲取角色數據，使用localStorage備用方案:', error);
            // 備用方案：從localStorage獲取
            const savedCharacters = localStorage.getItem('jcy_characters');
            if (savedCharacters) {
                try {
                    characters = JSON.parse(savedCharacters) || [];
                    console.log('[劇情設置] 從localStorage載入角色列表:', characters.length, '個角色');
                } catch (parseError) {
                    console.error('[劇情設置] 解析localStorage角色數據失敗:', parseError);
                    characters = [];
                }
            } else {
                characters = [];
                console.log('[劇情設置] 沒有找到角色數據');
            }
        }
        
        // 填充角色選項
        populateCharacterOptions();
        console.log('[劇情設置] 角色列表載入完成');
        
    } catch (error) {
        console.error('[劇情設置] 載入角色列表失敗:', error);
        characters = [];
        populateCharacterOptions();
    }
}

// 載入世界書列表
async function loadWorldBooks() {
    try {
        console.log('[劇情設置] 開始載入世界書列表...');
        console.log('[劇情設置] 當前worldBooks狀態:', worldBooks);
        
        // 由於跨域限制，改為使用postMessage請求世界書數據
        try {
            // 發送請求到父窗口獲取世界書數據
            const messageData = {
                type: 'VN_REQUEST_WORLDBOOKS',
                timestamp: Date.now()
            };
            
            console.log('[劇情設置] 發送世界書數據請求:', messageData);
            window.parent.postMessage(messageData, '*');
            
            // 等待回應（設置超時）
            const response = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('請求世界書數據超時'));
                }, 5000); // 增加超時時間到5秒
                
                const messageHandler = (event) => {
                    if (event.data && event.data.type === 'JCY_RESPONSE_WORLDBOOKS') {
                        clearTimeout(timeout);
                        window.removeEventListener('message', messageHandler);
                        resolve(event.data.worldBooks || []);
                    }
                };
                
                window.addEventListener('message', messageHandler);
            });
            
            worldBooks = response || [];
            console.log('[劇情設置] 從JCY系統獲取世界書列表:', worldBooks.length, '個世界書');
            
            // 確保世界書數據是有效的
            if (Array.isArray(worldBooks)) {
                worldBooks = worldBooks.filter(book => book && book.id && book.name);
                console.log('[劇情設置] 過濾後的有效世界書數量:', worldBooks.length);
            } else {
                console.warn('[劇情設置] 世界書數據格式不正確，重置為空數組');
                worldBooks = [];
            }
        } catch (error) {
            console.warn('[劇情設置] 無法從JCY系統獲取世界書數據，使用localStorage備用方案:', error);
            // 備用方案：從localStorage獲取
            const savedWorldBooks = localStorage.getItem('jcy_worldbooks');
            if (savedWorldBooks) {
                try {
                    worldBooks = JSON.parse(savedWorldBooks) || [];
                    console.log('[劇情設置] 從localStorage載入世界書列表:', worldBooks.length, '個世界書');
                } catch (parseError) {
                    console.error('[劇情設置] 解析localStorage世界書數據失敗:', parseError);
                    worldBooks = [];
                }
            } else {
                worldBooks = [];
                console.log('[劇情設置] 沒有找到世界書數據');
            }
        }
        
        // 填充世界書選項
        populateWorldBookOptions();
        console.log('[劇情設置] 世界書列表載入完成，最終worldBooks狀態:', worldBooks);
        
        // 如果世界書數量為0，嘗試重新請求一次
        if (worldBooks.length === 0) {
            console.log('[劇情設置] 世界書數量為0，嘗試重新請求...');
            setTimeout(async () => {
                try {
                    await loadWorldBooks();
                } catch (retryError) {
                    console.warn('[劇情設置] 重新請求世界書失敗:', retryError);
                }
            }, 1000);
        }
        
    } catch (error) {
        console.error('[劇情設置] 載入世界書列表失敗:', error);
        worldBooks = [];
        populateWorldBookOptions();
    }
}

// 填充角色選項
function populateCharacterOptions() {
    console.log('[劇情設置] 開始填充角色選項...');
    
    const mainCharacterSelect = storyElements.mainCharacter;
    const supportingCharactersContainer = storyElements.supportingCharactersContainer;
    
    if (!mainCharacterSelect || !supportingCharactersContainer) {
        console.error('[劇情設置] DOM元素未找到，無法填充角色選項');
        return;
    }
    
    // 清空現有選項
    mainCharacterSelect.innerHTML = '<option value="">請選擇主角...</option>';
    supportingCharactersContainer.innerHTML = '';
    
    console.log('[劇情設置] 準備添加角色選項，角色數量:', characters.length);
    
    // 添加角色選項
    characters.forEach((character, index) => {
        console.log(`[劇情設置] 添加角色選項 ${index + 1}: ${character.name} (ID: ${character.id})`);
        
        // 主角選項
        const mainOption = document.createElement('option');
        mainOption.value = character.id;
        mainOption.textContent = character.name;
        mainCharacterSelect.appendChild(mainOption);
        
        // 配角選項（自定義容器）
        const supportingOption = document.createElement('div');
        supportingOption.className = 'character-option';
        supportingOption.dataset.characterId = character.id;
        supportingOption.innerHTML = `
            <span class="character-option-name">${character.name}</span>
            <span class="character-option-personality">${character.personality ? character.personality.substring(0, 30) + '...' : '無描述'}</span>
        `;
        
        // 添加點擊事件
        supportingOption.addEventListener('click', function() {
            toggleCharacterSelection(character.id);
        });
        
        supportingCharactersContainer.appendChild(supportingOption);
    });
    
    console.log('[劇情設置] 已填充角色選項:', characters.length, '個角色');
}

// 填充世界書選項
function populateWorldBookOptions() {
    console.log('[劇情設置] 開始填充世界書選項...');
    
    const worldBooksContainer = storyElements.worldBooksContainer;
    
    if (!worldBooksContainer) {
        console.error('[劇情設置] 世界書容器未找到，無法填充世界書選項');
        return;
    }
    
    // 清空現有選項
    worldBooksContainer.innerHTML = '';
    
    console.log('[劇情設置] 準備添加世界書選項，世界書數量:', worldBooks.length);
    
    // 按優先級和分類排序：系統最重要 > 系統重要 > 系統普通 > 備註最重要 > 備註重要 > 備註普通
    const sortOrder = {
        '系統最重要': 0,
        '系統重要': 1,
        '系統普通': 2,
        '備註最重要': 3,
        '備註重要': 4,
        '備註普通': 5
    };
    
    const sortedWorldBooks = [...worldBooks].sort((a, b) => {
        const aKey = `${a.category}${a.priority}`;
        const bKey = `${b.category}${b.priority}`;
        const aOrder = sortOrder[aKey] || 999;
        const bOrder = sortOrder[bKey] || 999;
        return aOrder - bOrder; // 順序小的在前
    });
    
    console.log('[劇情設置] 世界書排序後:', sortedWorldBooks.map(wb => ({
        name: wb.name,
        priority: wb.priority,
        category: wb.category
    })));
    
    // 添加世界書選項（按優先級排序）
    sortedWorldBooks.forEach((worldBook, index) => {
        console.log(`[劇情設置] 添加世界書選項 ${index + 1}: ${worldBook.name} (ID: ${worldBook.id})`);
        
        // 獲取世界書的詳細信息
        const priority = worldBook.priority || '普通';
        const trigger = worldBook.trigger || 'Always On';
        const category = worldBook.category || '備註';
        const keywords = worldBook.keywords || '';
        
        const worldBookOption = document.createElement('div');
        worldBookOption.className = 'worldbook-option';
        worldBookOption.dataset.worldbookId = worldBook.id;
        worldBookOption.innerHTML = `
            <div class="worldbook-option-header">
                <span class="worldbook-option-name">${worldBook.name}</span>
                <div class="worldbook-option-badges">
                    <span class="worldbook-badge priority-${priority.replace(/\s+/g, '-').toLowerCase()}">${priority}</span>
                    <span class="worldbook-badge trigger-${trigger.replace(/\s+/g, '-').toLowerCase()}">${trigger}</span>
                    <span class="worldbook-badge category-${category.replace(/\s+/g, '-').toLowerCase()}">${category}</span>
                </div>
            </div>
            <div class="worldbook-option-content">
                <span class="worldbook-option-description">${worldBook.content ? worldBook.content.substring(0, 50) + '...' : '無內容'}</span>
                ${keywords ? `<span class="worldbook-option-keywords">關鍵字: ${keywords}</span>` : ''}
            </div>
        `;
        
        // 添加點擊事件
        worldBookOption.addEventListener('click', function() {
            toggleWorldBookSelection(worldBook.id);
        });
        
        worldBooksContainer.appendChild(worldBookOption);
    });
    
    console.log('[劇情設置] 已填充世界書選項:', worldBooks.length, '個世界書');
}

// 切換世界書選擇狀態
function toggleWorldBookSelection(worldBookId) {
    const worldBookOption = document.querySelector(`[data-worldbook-id="${worldBookId}"]`);
    if (!worldBookOption) return;
    
    const isSelected = worldBookOption.classList.contains('selected');
    
    if (isSelected) {
        // 取消選擇
        worldBookOption.classList.remove('selected');
    } else {
        // 選擇世界書
        worldBookOption.classList.add('selected');
    }
    
    console.log('[劇情設置] 世界書選擇狀態切換:', worldBookId, isSelected ? '取消選擇' : '選擇');
}

// 切換角色選擇狀態
function toggleCharacterSelection(characterId) {
    const characterOption = document.querySelector(`[data-character-id="${characterId}"]`);
    if (!characterOption) return;
    
    const isSelected = characterOption.classList.contains('selected');
    
    if (isSelected) {
        // 取消選擇
        characterOption.classList.remove('selected');
    } else {
        // 選擇角色
        characterOption.classList.add('selected');
    }
    
    console.log('[劇情設置] 角色選擇狀態切換:', characterId, isSelected ? '取消選擇' : '選擇');
}

// 渲染劇情列表
function renderStoryList() {
    const storyList = storyElements.storyList;
    const emptyStoryList = storyElements.emptyStoryList;
    
    if (!storyList || !emptyStoryList) return;
    
    // 確保stories是數組
    if (!Array.isArray(stories)) {
        console.warn('[劇情設置] stories不是數組，重置為空數組');
        stories = [];
    }
    
    if (stories.length === 0) {
        storyList.style.display = 'none';
        emptyStoryList.style.display = 'block';
        return;
    }
    
    storyList.style.display = 'block';
    emptyStoryList.style.display = 'none';
    
    storyList.innerHTML = '';
    
    stories.forEach((story, index) => {
        const storyItem = createStoryItem(story, index);
        storyList.appendChild(storyItem);
    });
    
    // 恢復選中狀態
    restoreSelectedStory();
    
    // 更新開始劇情按鈕狀態
    updateStartStoryButton();
}

// 創建劇情項目
function createStoryItem(story, index) {
    const storyItem = document.createElement('div');
    storyItem.className = 'story-item';
    storyItem.dataset.storyId = story.id;
    
    // 獲取角色名稱
    const mainChar = characters.find(c => c.id === story.mainCharacter);
    const supportingChars = characters.filter(c => story.supportingCharacters && story.supportingCharacters.includes(c.id));
    
    // 獲取世界書名稱
    const selectedWorldBooks = worldBooks.filter(wb => story.worldBooks && story.worldBooks.includes(wb.id));
    
    // 確保characters是數組
    if (!Array.isArray(characters)) {
        console.warn('[劇情設置] characters不是數組，重置為空數組');
        characters = [];
    }
    
    // 確保supportingChars是數組
    if (!Array.isArray(supportingChars)) {
        console.warn('[劇情設置] supportingChars不是數組，重置為空數組');
        supportingChars = [];
    }
    
    // 確保worldBooks是數組
    if (!Array.isArray(worldBooks)) {
        console.warn('[劇情設置] worldBooks不是數組，重置為空數組');
        worldBooks = [];
    }
    
    storyItem.innerHTML = `
        <div class="story-item-header">
            <h4 class="story-title">${story.title || '無標題'}</h4>
            <div class="story-actions">
                <button class="story-action-btn edit" onclick="editStory('${story.id}')" title="編輯">
                    ✏️ 編輯
                </button>
                <button class="story-action-btn delete" onclick="deleteStory('${story.id}')" title="刪除">
                    🗑️ 刪除
                </button>
            </div>
        </div>
        <p class="story-description">${story.description || '無描述'}</p>
        <div class="story-characters">
            <span class="story-character-tag">主角: ${mainChar ? mainChar.name : '未知'}</span>
            ${supportingChars.map(char => `<span class="story-character-tag">配角: ${char.name || '未知角色'}</span>`).join('')}
            ${selectedWorldBooks.map(wb => `<span class="story-character-tag" style="background: rgba(255, 193, 7, 0.2); color: #ffc107;">世界書: ${wb.name || '未知世界書'}</span>`).join('')}
        </div>
        <div class="story-selection-indicator">
            <span class="selection-text">點擊選擇此劇情</span>
        </div>
    `;
    
    // 點擊劇情項目選擇劇情
    storyItem.addEventListener('click', function(e) {
        if (!e.target.classList.contains('story-action-btn')) {
            // 選擇劇情
            selectStory(story);
        }
    });
    
    return storyItem;
}

// 打開劇情編輯模態窗口
function openStoryEditModal(story = null) {
    currentEditingStory = story;
    
    if (story) {
        if (storyElements.storyEditTitle) storyElements.storyEditTitle.textContent = '📝 編輯劇情';
        fillStoryForm(story);
    } else {
        if (storyElements.storyEditTitle) storyElements.storyEditTitle.textContent = '📝 新增劇情';
        clearStoryForm();
    }
    
    if (storyElements.storyEditModal) {
        storyElements.storyEditModal.classList.add('modal-active');
        console.log('[劇情設置] 打開劇情編輯窗口:', story ? '編輯模式' : '新增模式');
        
        // 在打開模態窗口時重新載入世界書數據，確保數據是最新的
        setTimeout(async () => {
            console.log('[劇情設置] 重新載入世界書數據...');
            await loadWorldBooks();
            console.log('[劇情設置] 世界書數據重新載入完成');
        }, 100);
    } else {
        console.error('[劇情設置] 無法找到劇情編輯模態窗口元素');
    }
}

// 關閉劇情編輯模態窗口
function closeStoryEditModal() {
    if (storyElements.storyEditModal) {
        storyElements.storyEditModal.classList.remove('modal-active');
        console.log('[劇情設置] 關閉劇情編輯窗口');
    } else {
        console.error('[劇情設置] 無法找到劇情編輯模態窗口元素');
    }
    currentEditingStory = null;
}

// 填充劇情表單
function fillStoryForm(story) {
    if (storyElements.storyTitle) storyElements.storyTitle.value = story.title || '';
    if (storyElements.mainCharacter) storyElements.mainCharacter.value = story.mainCharacter || '';
    if (storyElements.characterPresetsUrl) {
        const defaultPresetsUrl = window.VNMaterialProcessor?.getPortraitSettings?.()?.baseUrl || 'https://nancywang3641.github.io/sound-files/char_presets/';
        storyElements.characterPresetsUrl.value = story.characterPresetsUrl || defaultPresetsUrl;
    }
    if (storyElements.characterPresetsFormat) storyElements.characterPresetsFormat.value = story.characterPresetsFormat || '_presets.png';
    if (storyElements.storyContent) storyElements.storyContent.value = story.content || '';
    if (storyElements.storyOpening) storyElements.storyOpening.value = story.opening || '';
    
    // 設置配角選項
    const characterOptions = document.querySelectorAll('.character-option');
    characterOptions.forEach(option => {
        const characterId = option.dataset.characterId;
        if (story.supportingCharacters && story.supportingCharacters.includes(characterId)) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
    
    // 設置世界書選項
    const worldBookOptions = document.querySelectorAll('.worldbook-option');
    worldBookOptions.forEach(option => {
        const worldBookId = option.dataset.worldbookId;
        if (story.worldBooks && story.worldBooks.includes(worldBookId)) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
}

// 清空劇情表單
function clearStoryForm() {
    if (storyElements.storyTitle) storyElements.storyTitle.value = '';
    if (storyElements.mainCharacter) storyElements.mainCharacter.value = '';
    if (storyElements.characterPresetsUrl) {
        const defaultPresetsUrl = window.VNMaterialProcessor?.getPortraitSettings?.()?.baseUrl || 'https://nancywang3641.github.io/sound-files/char_presets/';
        storyElements.characterPresetsUrl.value = defaultPresetsUrl;
    }
    if (storyElements.characterPresetsFormat) storyElements.characterPresetsFormat.value = '_presets.png';
    if (storyElements.storyContent) storyElements.storyContent.value = '';
    if (storyElements.storyOpening) storyElements.storyOpening.value = '';
    
    // 清空配角選項
    const characterOptions = document.querySelectorAll('.character-option');
    characterOptions.forEach(option => {
        option.classList.remove('selected');
    });
    
    // 清空世界書選項
    const worldBookOptions = document.querySelectorAll('.worldbook-option');
    worldBookOptions.forEach(option => {
        option.classList.remove('selected');
    });
}

// 保存劇情
function saveStory() {
    try {
        const storyTitle = storyElements.storyTitle ? storyElements.storyTitle.value.trim() : '';
        const content = storyElements.storyContent ? storyElements.storyContent.value.trim() : '';
        const formData = {
            title: storyTitle || (content ? content.substring(0, 50) + '...' : '無標題劇情'),
            description: content ? content.substring(0, 100) + '...' : '無描述',
            mainCharacter: storyElements.mainCharacter ? storyElements.mainCharacter.value : '',
            characterPresetsUrl: storyElements.characterPresetsUrl ? storyElements.characterPresetsUrl.value.trim() : (window.VNMaterialProcessor?.getPortraitSettings?.()?.baseUrl || 'https://nancywang3641.github.io/sound-files/char_presets/'),
            characterPresetsFormat: storyElements.characterPresetsFormat ? storyElements.characterPresetsFormat.value.trim() : '_presets.png',
            content: content,
            opening: storyElements.storyOpening ? storyElements.storyOpening.value.trim() : '',
            supportingCharacters: Array.from(document.querySelectorAll('.character-option.selected')).map(option => option.dataset.characterId),
            worldBooks: (() => {
                // 獲取選擇的世界書ID
                const selectedWorldBookIds = Array.from(document.querySelectorAll('.worldbook-option.selected')).map(option => option.dataset.worldbookId);
                
                // 根據ID獲取完整的世界書對象
                const selectedWorldBooks = worldBooks.filter(wb => selectedWorldBookIds.includes(wb.id));
                
                // 按優先級和分類排序：系統最重要 > 系統重要 > 系統普通 > 備註最重要 > 備註重要 > 備註普通
                const sortOrder = {
                    '系統最重要': 0,
                    '系統重要': 1,
                    '系統普通': 2,
                    '備註最重要': 3,
                    '備註重要': 4,
                    '備註普通': 5
                };
                
                const sortedWorldBooks = selectedWorldBooks.sort((a, b) => {
                    const aKey = `${a.category}${a.priority}`;
                    const bKey = `${b.category}${b.priority}`;
                    const aOrder = sortOrder[aKey] || 999;
                    const bOrder = sortOrder[bKey] || 999;
                    return aOrder - bOrder; // 順序小的在前
                });
                
                // 返回排序後的世界書ID列表
                return sortedWorldBooks.map(wb => wb.id);
            })()
        };
        
        // 驗證必填字段
        if (!formData.title) {
            alert('請輸入劇情標題');
            return;
        }
        
        if (!formData.content) {
            alert('請輸入劇情內容');
            return;
        }
        
        if (!formData.mainCharacter) {
            alert('請選擇主角');
            return;
        }
        
        if (currentEditingStory) {
            // 編輯現有劇情
            const index = stories.findIndex(s => s.id === currentEditingStory.id);
            if (index !== -1) {
                stories[index] = {
                    ...currentEditingStory,
                    ...formData,
                    updatedAt: Date.now()
                };
                console.log('[劇情設置] 更新劇情:', stories[index].title);
            }
        } else {
            // 創建新劇情
            const newStory = {
                id: generateStoryId(),
                ...formData,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            stories.push(newStory);
            console.log('[劇情設置] 創建新劇情:', newStory.title);
        }
        
        // 保存到本地存儲
        localStorage.setItem('jcy_vn_stories', JSON.stringify(stories));
        
        // 如果編輯的是當前選中的劇情，更新localStorage中的選中劇情
        if (currentEditingStory) {
            const selectedStory = getSelectedStory();
            if (selectedStory && selectedStory.id === currentEditingStory.id) {
                const updatedStory = stories.find(s => s.id === currentEditingStory.id);
                if (updatedStory) {
                    localStorage.setItem('jcy_selected_story', JSON.stringify(updatedStory));
                    console.log('[劇情設置] 已更新選中劇情的localStorage數據');
                }
            }
        }
        
        // 重新渲染列表
        renderStoryList();
        
        // 關閉編輯窗口
        closeStoryEditModal();
        
        // 顯示成功消息
        showToast(currentEditingStory ? '劇情更新成功' : '劇情創建成功', 'success');
        
    } catch (error) {
        console.error('[劇情設置] 保存劇情失敗:', error);
        alert('保存劇情時出現錯誤，請重試');
    }
}

// 編輯劇情
function editStory(storyId) {
    const story = stories.find(s => s.id === storyId);
    if (story) {
        openStoryEditModal(story);
    } else {
        console.error('[劇情設置] 找不到要編輯的劇情:', storyId);
    }
}

// 刪除劇情
function deleteStory(storyId) {
    if (confirm('確定要刪除這個劇情嗎？此操作無法撤銷。')) {
        try {
            const index = stories.findIndex(s => s.id === storyId);
            if (index !== -1) {
                const deletedStory = stories.splice(index, 1)[0];
                localStorage.setItem('jcy_vn_stories', JSON.stringify(stories));
                renderStoryList();
                console.log('[劇情設置] 刪除劇情:', deletedStory.title);
                showToast('劇情刪除成功', 'success');
            }
        } catch (error) {
            console.error('[劇情設置] 刪除劇情失敗:', error);
            alert('刪除劇情時出現錯誤，請重試');
        }
    }
}

// 開始劇情
function startStory(story) {
    try {
        console.log('[劇情設置] 開始劇情:', story.title);
        console.log('[劇情設置] startStory函數中的worldBooks狀態:', worldBooks);
        console.log('[劇情設置] story.worldBooks:', story.worldBooks);
        
        // 關閉劇情設置窗口
        if (storyElements.storySettingsModal) {
            storyElements.storySettingsModal.classList.remove('modal-active');
        }
        
        // 配置VN立繪處理器
        if (window.VNPortraitProcessor) {
            const defaultPresetsUrl = window.VNMaterialProcessor?.getPortraitSettings?.()?.baseUrl || 'https://nancywang3641.github.io/sound-files/char_presets/';
            window.VNPortraitProcessor.setConfig(
                story.characterPresetsUrl || defaultPresetsUrl,
                story.characterPresetsFormat || '_presets.png'
            );
            console.log('[劇情設置] VN立繪處理器已配置');
        }
        
        // 構建劇情數據
        console.log('[劇情設置] 構建劇情數據，調試信息:', {
            storyWorldBooks: story.worldBooks,
            availableWorldBooks: worldBooks.map(wb => ({ id: wb.id, name: wb.name })),
            filteredWorldBooks: worldBooks.filter(wb => story.worldBooks && story.worldBooks.includes(wb.id))
        });
        
        const storyData = {
            type: 'STORY_START',
            story: story,
            characters: {
                main: characters.find(c => c.id === story.mainCharacter) || null,
                supporting: characters.filter(c => story.supportingCharacters && story.supportingCharacters.includes(c.id)) || []
            },
            worldBooks: worldBooks.filter(wb => story.worldBooks && story.worldBooks.includes(wb.id)) || [],
            portraitConfig: {
                baseUrl: story.characterPresetsUrl || (window.VNMaterialProcessor?.getPortraitSettings?.()?.baseUrl || 'https://nancywang3641.github.io/sound-files/char_presets/'),
                format: story.characterPresetsFormat || '_presets.png'
            }
        };
        
        // 發送到VN核心系統
        console.log('[劇情設置] 準備發送VN_STORY_START消息:', storyData);
        notifyParent('VN_STORY_START', storyData);
        
        // 顯示成功消息
        showToast(`開始劇情: ${story.title}`, 'success');
        
    } catch (error) {
        console.error('[劇情設置] 開始劇情失敗:', error);
        alert('開始劇情時出現錯誤，請重試');
    }
}

// 選擇劇情
function selectStory(story) {
    try {
        console.log('[劇情設置] 選擇劇情:', story.title);
        
        // 移除所有劇情項目的選中狀態
        const allStoryItems = document.querySelectorAll('.story-item');
        allStoryItems.forEach(item => {
            item.classList.remove('selected');
        });
        
        // 為選中的劇情項目添加選中狀態
        const selectedStoryItem = document.querySelector(`[data-story-id="${story.id}"]`);
        if (selectedStoryItem) {
            selectedStoryItem.classList.add('selected');
        }
        
        // 保存選中的劇情到localStorage
        localStorage.setItem('jcy_selected_story', JSON.stringify(story));
        
        // 顯示選中提示
        showToast(`已選擇劇情: ${story.title}`, 'success');
        
        // 更新開始劇情按鈕狀態
        updateStartStoryButton();
        
    } catch (error) {
        console.error('[劇情設置] 選擇劇情失敗:', error);
        showToast('選擇劇情失敗，請重試', 'error');
    }
}

// 更新開始劇情按鈕狀態
function updateStartStoryButton() {
    const selectedStory = getSelectedStory();
    const startStoryBtn = document.getElementById('startStoryBtn');
    
    if (startStoryBtn) {
        if (selectedStory) {
            startStoryBtn.textContent = `🎬 開始劇情: ${selectedStory.title}`;
            startStoryBtn.disabled = false;
            startStoryBtn.classList.add('has-selection');
        } else {
            startStoryBtn.textContent = '🎬 開始劇情 (請先選擇劇情)';
            startStoryBtn.disabled = true;
            startStoryBtn.classList.remove('has-selection');
        }
    }
}

// 獲取選中的劇情
function getSelectedStory() {
    try {
        const selectedStoryData = localStorage.getItem('jcy_selected_story');
        if (selectedStoryData) {
            return JSON.parse(selectedStoryData);
        }
    } catch (error) {
        console.error('[劇情設置] 獲取選中劇情失敗:', error);
    }
    return null;
}

// 恢復選中的劇情狀態
function restoreSelectedStory() {
    const selectedStory = getSelectedStory();
    if (selectedStory) {
        // 檢查選中的劇情是否還存在
        const storyExists = stories.find(s => s.id === selectedStory.id);
        if (storyExists) {
            // 恢復選中狀態
            const selectedStoryItem = document.querySelector(`[data-story-id="${selectedStory.id}"]`);
            if (selectedStoryItem) {
                selectedStoryItem.classList.add('selected');
                console.log('[劇情設置] 恢復選中劇情:', selectedStory.title);
            }
        } else {
            // 選中的劇情不存在了，清除選擇
            localStorage.removeItem('jcy_selected_story');
            console.log('[劇情設置] 選中的劇情已不存在，清除選擇');
        }
    }
}

// 生成劇情ID
function generateStoryId() {
    return 'story_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 顯示提示消息
function showToast(message, type = 'info') {
    // 創建提示元素
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        font-size: 14px;
        z-index: 10000;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    // 顯示動畫
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 100);
    
    // 自動隱藏
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

// 導出函數供外部調用
window.StorySettings = {
    loadStories,
    loadCharacters,
    openStoryEditModal,
    editStory,
    deleteStory,
    startStory,
    selectStory,
    getSelectedStory,
    updateStartStoryButton,
    showToast,
    getStories: () => stories,
    getCharacters: () => characters
}; 