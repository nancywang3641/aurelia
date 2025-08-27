// =======================================================================
//                          背景圖片管理器
// =======================================================================

class BackgroundManager {
    constructor() {
        this.dbName = 'BackgroundStorage';
        this.dbVersion = 5;
        this.storeName = 'backgrounds';
        this.db = null;
        this.init();
    }

    async init() {
        try {
            this.db = await this.openDatabase();
            // console.log('[背景管理器] IndexedDB 初始化成功');
        } catch (error) {
            console.error('[背景管理器] IndexedDB 初始化失敗:', error);
        }
    }

    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                reject(new Error('無法打開 IndexedDB'));
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 創建背景存儲對象
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('name', 'name', { unique: false });
                    store.createIndex('type', 'type', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    // console.log('[背景管理器] 創建背景存儲對象');
                }
                
                // 創建設置存儲對象
                if (!db.objectStoreNames.contains('background_settings')) {
                    const settingsStore = db.createObjectStore('background_settings', { keyPath: 'id', autoIncrement: true });
                    settingsStore.createIndex('type', 'type', { unique: false });
                    // console.log('[背景管理器] 創建設置存儲對象');
                }
                
                // 創建頭像存儲對象
                if (!db.objectStoreNames.contains('avatars')) {
                    const avatarStore = db.createObjectStore('avatars', { keyPath: 'id', autoIncrement: true });
                    avatarStore.createIndex('name', 'name', { unique: false });
                    avatarStore.createIndex('type', 'type', { unique: false });
                    avatarStore.createIndex('createdAt', 'createdAt', { unique: false });
                    // console.log('[背景管理器] 創建頭像存儲對象');
                }
                
                // 創建頭像設置存儲對象
                if (!db.objectStoreNames.contains('avatar_settings')) {
                    const avatarSettingsStore = db.createObjectStore('avatar_settings', { keyPath: 'id', autoIncrement: true });
                    avatarSettingsStore.createIndex('type', 'type', { unique: false });
                    // console.log('[背景管理器] 創建頭像設置存儲對象');
                }
                
                // 創建隊友頭像存儲對象
                if (!db.objectStoreNames.contains('teammate_avatars')) {
                    const teammateAvatarsStore = db.createObjectStore('teammate_avatars', { keyPath: 'name' });
                    teammateAvatarsStore.createIndex('tag', 'tag', { unique: false });
                    teammateAvatarsStore.createIndex('createdAt', 'createdAt', { unique: false });
                    // console.log('[背景管理器] 創建隊友頭像存儲對象');
                }
                
                // 創建聊天室背景存儲對象
                if (!db.objectStoreNames.contains('chat_backgrounds')) {
                    const chatBackgroundsStore = db.createObjectStore('chat_backgrounds', { keyPath: 'chatId' });
                    chatBackgroundsStore.createIndex('appliedAt', 'appliedAt', { unique: false });
                    chatBackgroundsStore.createIndex('createdAt', 'createdAt', { unique: false });
                    console.log('[背景管理器] 創建聊天室背景存儲對象');
                }
            };
        });
    }

    async saveBackground(file, name = null) {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        // 先將文件轉換為 base64
        const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('讀取文件失敗'));
            reader.readAsDataURL(file);
        });

        // 然後在事務中保存數據
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const backgroundData = {
                name: name || file.name,
                type: 'upload',
                data: base64Data,
                size: file.size,
                mimeType: file.type,
                createdAt: new Date().toISOString()
            };

            const request = store.add(backgroundData);
            request.onsuccess = () => {
                // console.log('[背景管理器] 背景圖片保存成功:', backgroundData.name);
                resolve(request.result);
            };
            request.onerror = () => {
                console.error('[背景管理器] 保存背景圖片失敗:', request.error);
                reject(new Error('保存背景圖片失敗'));
            };
            
            transaction.onerror = () => {
                console.error('[背景管理器] 事務失敗:', transaction.error);
                reject(new Error('IndexedDB事務失敗'));
            };
        });
    }

    async saveUrlBackground(url, name = null) {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const backgroundData = {
                name: name || 'URL背景',
                type: 'url',
                data: url,
                createdAt: new Date().toISOString()
            };

            const request = store.add(backgroundData);
            request.onsuccess = () => {
                // console.log('[背景管理器] URL背景保存成功:', backgroundData.name);
                resolve(request.result);
            };
            request.onerror = () => {
                reject(new Error('保存URL背景失敗'));
            };
        });
    }

    async getBackground(id) {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(new Error('獲取背景失敗'));
            };
        });
    }

    async getAllBackgrounds() {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(new Error('獲取所有背景失敗'));
            };
        });
    }

    async deleteBackground(id) {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);

            request.onsuccess = () => {
                // console.log('[背景管理器] 背景刪除成功:', id);
                resolve();
            };
            request.onerror = () => {
                reject(new Error('刪除背景失敗'));
            };
        });
    }

    async clearAllBackgrounds() {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => {
                // console.log('[背景管理器] 所有背景清除成功');
                resolve();
            };
            request.onerror = () => {
                reject(new Error('清除所有背景失敗'));
            };
        });
    }

    // 獲取數據庫大小
    async getDatabaseSize() {
        if (!this.db) {
            return 0;
        }

        const backgrounds = await this.getAllBackgrounds();
        let totalSize = 0;

        backgrounds.forEach(bg => {
            if (bg.size) {
                totalSize += bg.size;
            } else if (bg.data && bg.type === 'upload') {
                // 估算 base64 大小
                totalSize += Math.ceil(bg.data.length * 0.75);
            }
        });

        return totalSize;
    }

    // 格式化文件大小
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 保存背景設置
    async saveBackgroundSettings(type, data) {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['background_settings'], 'readwrite');
            const store = transaction.objectStore('background_settings');

            // 先清除舊的設置
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => {
                // 保存新的設置
                const settingsData = {
                    type: 'current_background',
                    data: {
                        type: type,
                        background: data,
                        appliedAt: new Date().toISOString()
                    },
                    createdAt: new Date().toISOString()
                };

                const request = store.add(settingsData);
                request.onsuccess = () => {
                    // console.log('[背景管理器] 背景設置保存成功');
                    resolve(request.result);
                };
                request.onerror = () => {
                    reject(new Error('保存背景設置失敗'));
                };
            };
            clearRequest.onerror = () => {
                reject(new Error('清除舊設置失敗'));
            };
        });
    }

    // 獲取背景設置
    async getBackgroundSettings() {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['background_settings'], 'readonly');
            const store = transaction.objectStore('background_settings');
            const request = store.getAll();

            request.onsuccess = () => {
                const settings = request.result;
                const currentSettings = settings.find(s => s.type === 'current_background');
                resolve(currentSettings ? currentSettings.data : null);
            };
            request.onerror = () => {
                reject(new Error('獲取背景設置失敗'));
            };
        });
    }

    // 清除背景設置
    async clearBackgroundSettings() {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['background_settings'], 'readwrite');
            const store = transaction.objectStore('background_settings');
            const request = store.clear();

            request.onsuccess = () => {
                // console.log('[背景管理器] 背景設置清除成功');
                resolve();
            };
            request.onerror = () => {
                reject(new Error('清除背景設置失敗'));
            };
        });
    }

    // =======================================================================
    //                          聊天室背景管理功能
    // =======================================================================

    // 保存聊天室背景
    async saveChatBackground(chatId, backgroundData) {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['chat_backgrounds'], 'readwrite');
            const store = transaction.objectStore('chat_backgrounds');

            // 先刪除舊的背景設置
            const deleteRequest = store.delete(chatId);
            deleteRequest.onsuccess = () => {
                // 保存新的背景設置
                const chatBackgroundData = {
                    chatId: chatId,
                    background: backgroundData,
                    appliedAt: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                };

                const request = store.add(chatBackgroundData);
                request.onsuccess = () => {
                    console.log('[背景管理器] 聊天室背景保存成功，聊天ID:', chatId);
                    resolve(request.result);
                };
                request.onerror = () => {
                    reject(new Error('保存聊天室背景失敗'));
                };
            };
            deleteRequest.onerror = () => {
                reject(new Error('清除舊聊天室背景失敗'));
            };
        });
    }

    // 獲取聊天室背景
    async getChatBackground(chatId) {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['chat_backgrounds'], 'readonly');
            const store = transaction.objectStore('chat_backgrounds');
            const request = store.get(chatId);

            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.background : null);
            };
            request.onerror = () => {
                reject(new Error('獲取聊天室背景失敗'));
            };
        });
    }

    // 清除聊天室背景
    async clearChatBackground(chatId) {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['chat_backgrounds'], 'readwrite');
            const store = transaction.objectStore('chat_backgrounds');
            const request = store.delete(chatId);

            request.onsuccess = () => {
                console.log('[背景管理器] 聊天室背景清除成功，聊天ID:', chatId);
                resolve();
            };
            request.onerror = () => {
                reject(new Error('清除聊天室背景失敗'));
            };
        });
    }

    // 獲取所有聊天室背景
    async getAllChatBackgrounds() {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['chat_backgrounds'], 'readonly');
            const store = transaction.objectStore('chat_backgrounds');
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(new Error('獲取所有聊天室背景失敗'));
            };
        });
    }

    // =======================================================================
    //                          頭像管理功能
    // =======================================================================

    // 保存頭像
    async saveAvatar(file, name = null) {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        // 先將文件轉換為 base64
        const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('讀取文件失敗'));
            reader.readAsDataURL(file);
        });

        // 然後在事務中保存數據
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['avatars'], 'readwrite');
            const store = transaction.objectStore('avatars');

            const avatarData = {
                name: name || file.name,
                type: 'upload',
                data: base64Data,
                size: file.size,
                mimeType: file.type,
                createdAt: new Date().toISOString()
            };

            const request = store.add(avatarData);
            request.onsuccess = () => {
                // console.log('[背景管理器] 頭像保存成功:', avatarData.name);
                resolve(request.result);
            };
            request.onerror = () => {
                console.error('[背景管理器] 保存頭像失敗:', request.error);
                reject(new Error('保存頭像失敗'));
            };
            
            transaction.onerror = () => {
                console.error('[背景管理器] 事務失敗:', transaction.error);
                reject(new Error('IndexedDB事務失敗'));
            };
        });
    }

    // 保存URL頭像
    async saveUrlAvatar(url, name = null) {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['avatars'], 'readwrite');
            const store = transaction.objectStore('avatars');

            const avatarData = {
                name: name || 'URL頭像',
                type: 'url',
                data: url,
                createdAt: new Date().toISOString()
            };

            const request = store.add(avatarData);
            request.onsuccess = () => {
                // console.log('[背景管理器] URL頭像保存成功:', avatarData.name);
                resolve(request.result);
            };
            request.onerror = () => {
                reject(new Error('保存URL頭像失敗'));
            };
        });
    }

    // 保存頭像設置
    async saveAvatarSettings(type, data) {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['avatar_settings'], 'readwrite');
            const store = transaction.objectStore('avatar_settings');

            // 先清除舊的設置
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => {
                // 保存新的設置
                const settingsData = {
                    type: 'current_avatar',
                    data: {
                        type: type,
                        avatar: data,
                        appliedAt: new Date().toISOString()
                    },
                    createdAt: new Date().toISOString()
                };

                const request = store.add(settingsData);
                request.onsuccess = () => {
                    // console.log('[背景管理器] 頭像設置保存成功');
                    resolve(request.result);
                };
                request.onerror = () => {
                    reject(new Error('保存頭像設置失敗'));
                };
            };
            clearRequest.onerror = () => {
                reject(new Error('清除舊設置失敗'));
            };
        });
    }

    // 獲取頭像設置
    async getAvatarSettings() {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['avatar_settings'], 'readonly');
            const store = transaction.objectStore('avatar_settings');
            const request = store.getAll();

            request.onsuccess = () => {
                const settings = request.result;
                const currentSettings = settings.find(s => s.type === 'current_avatar');
                resolve(currentSettings ? currentSettings.data : null);
            };
            request.onerror = () => {
                reject(new Error('獲取頭像設置失敗'));
            };
        });
    }

    // 清除頭像設置
    async clearAvatarSettings() {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['avatar_settings'], 'readwrite');
            const store = transaction.objectStore('avatar_settings');
            const request = store.clear();

            request.onsuccess = () => {
                // console.log('[背景管理器] 頭像設置清除成功');
                resolve();
            };
            request.onerror = () => {
                reject(new Error('清除頭像設置失敗'));
            };
        });
    }

    // =======================================================================
    //                          隊友頭像管理功能
    // =======================================================================

    // 保存隊友頭像
    async saveTeammateAvatar(name, tag, avatarSrc) {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['teammate_avatars'], 'readwrite');
            const store = transaction.objectStore('teammate_avatars');

            const avatarData = {
                name: name,
                tag: tag,
                avatar: avatarSrc,
                createdAt: new Date().toISOString()
            };

            const request = store.put(avatarData, name); // 使用name作為key
            request.onsuccess = () => {
                // console.log('[背景管理器] 隊友頭像保存成功:', name);
                resolve(request.result);
            };
            request.onerror = () => {
                console.error('[背景管理器] 保存隊友頭像失敗:', request.error);
                reject(new Error('保存隊友頭像失敗'));
            };
        });
    }

    // 獲取隊友頭像
    async getTeammateAvatar(name) {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['teammate_avatars'], 'readonly');
            const store = transaction.objectStore('teammate_avatars');
            const request = store.get(name);

            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(new Error('獲取隊友頭像失敗'));
            };
        });
    }

    // 獲取所有隊友頭像
    async getAllTeammateAvatars() {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['teammate_avatars'], 'readonly');
            const store = transaction.objectStore('teammate_avatars');
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(new Error('獲取所有隊友頭像失敗'));
            };
        });
    }

    // 刪除隊友頭像
    async deleteTeammateAvatar(name) {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['teammate_avatars'], 'readwrite');
            const store = transaction.objectStore('teammate_avatars');
            const request = store.delete(name);

            request.onsuccess = () => {
                // console.log('[背景管理器] 隊友頭像刪除成功:', name);
                resolve();
            };
            request.onerror = () => {
                reject(new Error('刪除隊友頭像失敗'));
            };
        });
    }

    // 清除所有隊友頭像
    async clearAllTeammateAvatars() {
        if (!this.db) {
            throw new Error('IndexedDB 未初始化');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['teammate_avatars'], 'readwrite');
            const store = transaction.objectStore('teammate_avatars');
            const request = store.clear();

            request.onsuccess = () => {
                // console.log('[背景管理器] 所有隊友頭像清除成功');
                resolve();
            };
            request.onerror = () => {
                reject(new Error('清除所有隊友頭像失敗'));
            };
        });
    }
}

// 創建全局背景管理器實例
window.backgroundManager = new BackgroundManager();

// =======================================================================
//                          背景設置功能
// =======================================================================

// 切換背景設置標籤
function switchBackgroundTab(tab) {
    // 更新標籤狀態
    document.querySelectorAll('.background-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // 切換內容
    document.getElementById('uploadBackgroundTab').style.display = tab === 'upload' ? 'block' : 'none';
    document.getElementById('urlBackgroundTab').style.display = tab === 'url' ? 'block' : 'none';
}

// 處理文件上傳
async function handleBackgroundFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 驗證文件類型
    if (!file.type.startsWith('image/')) {
        alert('請選擇有效的圖片文件');
        return;
    }

    // 驗證文件大小 (限制為 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('圖片文件大小不能超過 5MB');
        return;
    }

    try {
        // 顯示預覽
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('backgroundPreview');
            const previewImage = document.getElementById('previewImage');
            previewImage.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);

        // 保存到 IndexedDB
        const id = await window.backgroundManager.saveBackground(file);
        // console.log('[背景設置] 文件上傳成功，ID:', id);

    } catch (error) {
        console.error('[背景設置] 文件上傳失敗:', error);
        alert('文件上傳失敗: ' + error.message);
    }
}

// 測試URL背景
async function testBackgroundUrl() {
    const urlInput = document.getElementById('backgroundUrlInput');
    const url = urlInput.value.trim();

    if (!url) {
        alert('請輸入有效的圖片URL');
        return;
    }

    try {
        // 測試圖片是否可訪問
        const response = await fetch(url, { method: 'HEAD' });
        if (!response.ok) {
            throw new Error('無法訪問該圖片URL');
        }

        // 顯示預覽
        const urlPreview = document.getElementById('urlPreview');
        const urlPreviewImage = document.getElementById('urlPreviewImage');
        urlPreviewImage.src = url;
        urlPreview.style.display = 'block';

        // console.log('[背景設置] URL測試成功');

    } catch (error) {
        console.error('[背景設置] URL測試失敗:', error);
        alert('URL測試失敗: ' + error.message);
    }
}

// 應用上傳的背景圖片
async function applyBackgroundImage() {
    const previewImage = document.getElementById('previewImage');
    const imageSrc = previewImage.src;

    if (!imageSrc) {
        alert('沒有可應用的背景圖片');
        return;
    }

    try {
        // 設置背景
        applyBackgroundToContainer(imageSrc);
        
        // 保存設置到 IndexedDB 而不是 localStorage
        await saveBackgroundSettings('upload', imageSrc);
        
        // 更新當前背景顯示
        updateCurrentBackgroundDisplay('上傳的背景圖片');
        
        // console.log('[背景設置] 背景圖片應用成功');
        alert('背景圖片應用成功！');

    } catch (error) {
        console.error('[背景設置] 應用背景失敗:', error);
        alert('應用背景失敗: ' + error.message);
    }
}

// 應用URL背景
async function applyUrlBackground() {
    const urlInput = document.getElementById('backgroundUrlInput');
    const url = urlInput.value.trim();

    if (!url) {
        alert('請輸入有效的圖片URL');
        return;
    }

    try {
        // 保存到 IndexedDB
        const id = await window.backgroundManager.saveUrlBackground(url);
        
        // 設置背景
        applyBackgroundToContainer(url);
        
        // 保存設置到 IndexedDB 而不是 localStorage
        await saveBackgroundSettings('url', url);
        
        // 更新當前背景顯示
        updateCurrentBackgroundDisplay('URL背景');
        
        // console.log('[背景設置] URL背景應用成功，ID:', id);
        alert('URL背景應用成功！');

    } catch (error) {
        console.error('[背景設置] 應用URL背景失敗:', error);
        alert('應用URL背景失敗: ' + error.message);
    }
}

// 移除背景圖片
async function removeBackgroundImage() {
    try {
        // 移除背景
        removeBackgroundFromContainer();
        
        // 清除設置到 IndexedDB
        await clearBackgroundSettings();
        
        // 隱藏預覽
        document.getElementById('backgroundPreview').style.display = 'none';
        document.getElementById('urlPreview').style.display = 'none';
        
        // 更新當前背景顯示
        updateCurrentBackgroundDisplay('未設置');
        
        // console.log('[背景設置] 背景圖片移除成功');
        alert('背景圖片已移除！');

    } catch (error) {
        console.error('[背景設置] 移除背景失敗:', error);
        alert('移除背景失敗: ' + error.message);
    }
}

// 應用背景到容器
function applyBackgroundToContainer(imageSrc) {
    const container = document.querySelector('.swipe-container');
    if (container) {
        // 設置CSS變量，讓::before偽元素使用
        container.style.setProperty('--background-image', `url('${imageSrc}')`);
        container.classList.add('has-background');
        
        // 調試信息
        // console.log('[背景設置] 應用背景到容器:');
        // console.log('- 圖片URL:', imageSrc);
        // console.log('- CSS變量:', container.style.getPropertyValue('--background-image'));
        // console.log('- has-background類:', container.classList.contains('has-background'));
        
        // 檢查::before偽元素的樣式
        setTimeout(() => {
            const computedStyle = window.getComputedStyle(container, '::before');
            // console.log('- ::before背景圖片:', computedStyle.backgroundImage);
            // console.log('- ::before顯示:', computedStyle.display);
            // console.log('- ::beforez-index:', computedStyle.zIndex);
        }, 100);
    }
}

// 從容器移除背景
function removeBackgroundFromContainer() {
    const container = document.querySelector('.swipe-container');
    if (container) {
        // 移除CSS變量
        container.style.removeProperty('--background-image');
        container.classList.remove('has-background');
    }
}

// 更新當前背景顯示
function updateCurrentBackgroundDisplay(name) {
    const currentBackground = document.getElementById('currentBackground');
    const currentBgName = document.getElementById('currentBgName');
    
    if (name === '未設置') {
        currentBackground.style.display = 'none';
    } else {
        currentBgName.textContent = name;
        currentBackground.style.display = 'block';
    }
}

// 保存背景設置到 IndexedDB
async function saveBackgroundSettings(type, data) {
    try {
        await window.backgroundManager.saveBackgroundSettings(type, data);
    } catch (error) {
        console.error('[背景設置] 保存設置失敗:', error);
        throw error;
    }
}

// 清除背景設置
async function clearBackgroundSettings() {
    try {
        await window.backgroundManager.clearBackgroundSettings();
    } catch (error) {
        console.error('[背景設置] 清除設置失敗:', error);
        throw error;
    }
}

// 載入保存的背景設置
async function loadBackgroundSettings() {
    try {
        const settings = await window.backgroundManager.getBackgroundSettings();
        
        if (settings && settings.background) {
            applyBackgroundToContainer(settings.background);
            
            const displayName = settings.type === 'url' ? 'URL背景' : '上傳的背景圖片';
            updateCurrentBackgroundDisplay(displayName);
            
            // console.log('[背景設置] 載入保存的背景設置:', displayName);
        } else {
            // 確保沒有背景時移除has-background類
            const container = document.querySelector('.swipe-container');
            if (container) {
                container.classList.remove('has-background');
            }
        }
    } catch (error) {
        console.error('[背景設置] 載入設置失敗:', error);
        // 確保沒有背景時移除has-background類
        const container = document.querySelector('.swipe-container');
        if (container) {
            container.classList.remove('has-background');
        }
    }
}

// 頁面載入時初始化
document.addEventListener('DOMContentLoaded', function() {
    // 載入保存的背景設置和頭像設置
    setTimeout(async () => {
        try {
            await loadBackgroundSettings();
            // console.log('[背景設置] 初始化完成');
        } catch (error) {
            console.error('[背景設置] 初始化失敗:', error);
        }
        
        try {
            await loadAvatarSettings();
            // console.log('[頭像設置] 初始化完成');
        } catch (error) {
            console.error('[頭像設置] 初始化失敗:', error);
        }
        
        try {
            await loadTeammateAvatars();
            // console.log('[隊友頭像] 初始化完成');
        } catch (error) {
            console.error('[隊友頭像] 初始化失敗:', error);
        }
    }, 1000); // 延遲載入，確保 IndexedDB 初始化完成
});

// 測試 IndexedDB 功能
window.testBackgroundManager = async function() {
    try {
        // console.log('[測試] 開始測試背景管理器...');
        
        // 測試保存設置
        await window.backgroundManager.saveBackgroundSettings('test', 'test_url');
        // console.log('[測試] 保存設置成功');
        
        // 測試獲取設置
        const settings = await window.backgroundManager.getBackgroundSettings();
        // console.log('[測試] 獲取設置成功:', settings);
        
        // 測試清除設置
        await window.backgroundManager.clearBackgroundSettings();
        // console.log('[測試] 清除設置成功');
        
        // console.log('[測試] 所有測試通過！');
    } catch (error) {
        console.error('[測試] 測試失敗:', error);
    }
};

// 測試文件上傳功能
window.testFileUpload = async function() {
    try {
        // console.log('[測試] 開始測試文件上傳...');
        
        // 創建一個測試文件
        const testData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        const response = await fetch(testData);
        const blob = await response.blob();
        const file = new File([blob], 'test.png', { type: 'image/png' });
        
        // 測試保存背景
        const id = await window.backgroundManager.saveBackground(file, 'test_image');
        // console.log('[測試] 文件上傳成功，ID:', id);
        
        // 測試獲取背景
        const background = await window.backgroundManager.getBackground(id);
        // console.log('[測試] 獲取背景成功:', background.name);
        
        // console.log('[測試] 文件上傳測試通過！');
    } catch (error) {
        console.error('[測試] 文件上傳測試失敗:', error);
    }
};

// 測試背景顯示功能
window.testBackgroundDisplay = function() {
    try {
        // console.log('[測試] 開始測試背景顯示...');
        
        // 測試應用背景
        const testImageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        applyBackgroundToContainer(testImageUrl);
        
        // 檢查CSS變量是否設置
        const container = document.querySelector('.swipe-container');
        const backgroundImage = container.style.getPropertyValue('--background-image');
        // console.log('[測試] CSS變量設置:', backgroundImage);
        
        // 檢查has-background類是否添加
        const hasBackgroundClass = container.classList.contains('has-background');
        // console.log('[測試] has-background類:', hasBackgroundClass);
        
        // 檢查::before偽元素的樣式
        const computedStyle = window.getComputedStyle(container, '::before');
        // console.log('[測試] ::before背景圖片:', computedStyle.backgroundImage);
        
        // console.log('[測試] 背景顯示測試完成！');
    } catch (error) {
        console.error('[測試] 背景顯示測試失敗:', error);
    }
};

// 強制刷新背景顯示
window.forceRefreshBackground = function() {
    try {
        // console.log('[強制刷新] 開始強制刷新背景...');
        
        const container = document.querySelector('.swipe-container');
        if (!container) {
            console.error('[強制刷新] 找不到容器');
            return;
        }
        
        // 移除並重新添加has-background類
        container.classList.remove('has-background');
        setTimeout(() => {
            container.classList.add('has-background');
            // console.log('[強制刷新] 重新添加has-background類');
        }, 50);
        
        // 檢查當前設置
        const backgroundImage = container.style.getPropertyValue('--background-image');
        // console.log('[強制刷新] 當前CSS變量:', backgroundImage);
        
        // 如果沒有背景圖片，嘗試從IndexedDB重新載入
        if (!backgroundImage || backgroundImage === 'none') {
            // console.log('[強制刷新] 嘗試從IndexedDB重新載入背景...');
            loadBackgroundSettings();
        }
        
    } catch (error) {
        console.error('[強制刷新] 失敗:', error);
    }
};

// =======================================================================
//                          頭像設置功能
// =======================================================================

// 切換頭像設置標籤
function switchAvatarTab(tab) {
    // 更新標籤狀態
    document.querySelectorAll('.avatar-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // 切換內容
    document.getElementById('uploadAvatarTab').style.display = tab === 'upload' ? 'block' : 'none';
    document.getElementById('urlAvatarTab').style.display = tab === 'url' ? 'block' : 'none';
}

// 處理頭像文件上傳
async function handleAvatarFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 驗證文件類型
    if (!file.type.startsWith('image/')) {
        alert('請選擇有效的圖片文件');
        return;
    }

    // 驗證文件大小 (限制為 2MB)
    if (file.size > 2 * 1024 * 1024) {
        alert('頭像文件大小不能超過 2MB');
        return;
    }

    try {
        // 顯示預覽
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('avatarPreview');
            const previewAvatar = document.getElementById('previewAvatar');
            previewAvatar.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);

        // 保存到 IndexedDB
        const id = await window.backgroundManager.saveAvatar(file);
        // console.log('[頭像設置] 文件上傳成功，ID:', id);

    } catch (error) {
        console.error('[頭像設置] 文件上傳失敗:', error);
        alert('文件上傳失敗: ' + error.message);
    }
}

// 測試頭像URL
async function testAvatarUrl() {
    const urlInput = document.getElementById('avatarUrlInput');
    const url = urlInput.value.trim();

    if (!url) {
        alert('請輸入有效的圖片URL');
        return;
    }

    try {
        // 測試圖片是否可訪問
        const response = await fetch(url, { method: 'HEAD' });
        if (!response.ok) {
            throw new Error('無法訪問該圖片URL');
        }

        // 顯示預覽
        const urlPreview = document.getElementById('urlAvatarPreview');
        const urlPreviewAvatar = document.getElementById('urlPreviewAvatar');
        urlPreviewAvatar.src = url;
        urlPreview.style.display = 'block';

        // console.log('[頭像設置] URL測試成功');

    } catch (error) {
        console.error('[頭像設置] URL測試失敗:', error);
        alert('URL測試失敗: ' + error.message);
    }
}

// 應用上傳的頭像
async function applyAvatarImage() {
    const previewAvatar = document.getElementById('previewAvatar');
    const imageSrc = previewAvatar.src;

    if (!imageSrc) {
        alert('沒有可應用的頭像');
        return;
    }

    try {
        // 設置頭像
        applyAvatarToContainer(imageSrc);
        
        // 保存設置到 IndexedDB
        await saveAvatarSettings('upload', imageSrc);
        
        // 更新當前頭像顯示
        updateCurrentAvatarDisplay('上傳的頭像');
        
        // console.log('[頭像設置] 頭像應用成功');
        alert('頭像應用成功！');

    } catch (error) {
        console.error('[頭像設置] 應用頭像失敗:', error);
        alert('應用頭像失敗: ' + error.message);
    }
}

// 應用URL頭像
async function applyUrlAvatar() {
    const urlInput = document.getElementById('avatarUrlInput');
    const url = urlInput.value.trim();

    if (!url) {
        alert('請輸入有效的圖片URL');
        return;
    }

    try {
        // 保存到 IndexedDB
        const id = await window.backgroundManager.saveUrlAvatar(url);
        
        // 設置頭像
        applyAvatarToContainer(url);
        
        // 保存設置到 IndexedDB
        await saveAvatarSettings('url', url);
        
        // 更新當前頭像顯示
        updateCurrentAvatarDisplay('URL頭像');
        
        // console.log('[頭像設置] URL頭像應用成功，ID:', id);
        alert('URL頭像應用成功！');

    } catch (error) {
        console.error('[頭像設置] 應用URL頭像失敗:', error);
        alert('應用URL頭像失敗: ' + error.message);
    }
}

// 移除頭像
async function removeAvatarImage() {
    try {
        // 移除頭像
        removeAvatarFromContainer();
        
        // 清除設置到 IndexedDB
        await clearAvatarSettings();
        
        // 隱藏預覽
        document.getElementById('avatarPreview').style.display = 'none';
        document.getElementById('urlAvatarPreview').style.display = 'none';
        
        // 更新當前頭像顯示
        updateCurrentAvatarDisplay('未設置');
        
        // console.log('[頭像設置] 頭像移除成功');
        alert('頭像已移除！');

    } catch (error) {
        console.error('[頭像設置] 移除頭像失敗:', error);
        alert('移除頭像失敗: ' + error.message);
    }
}

// 應用主角頭像到容器
function applyAvatarToContainer(imageSrc) {
    // 查找主角頭像元素
    const avatarSelectors = [
        '.custom-avatar img',
        '.custom-avatar',
        '.user-avatar',
        '.profile-avatar',
        '.main-avatar'
    ];
    
    let foundAvatar = false;
    
    avatarSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            if (element.tagName === 'IMG') {
                element.src = imageSrc;
                element.style.display = 'block';
                foundAvatar = true;
                // console.log('[主角頭像設置] 已更新頭像元素:', selector, element);
            }
        });
    });
    
    // 調試信息
    // console.log('[主角頭像設置] 應用頭像到容器:', imageSrc);
    // console.log('[主角頭像設置] 找到並更新了', foundAvatar ? '頭像元素' : '沒有找到頭像元素');
    
    // 如果沒有找到頭像元素，創建一個默認的頭像顯示區域
    if (!foundAvatar) {
        // console.log('[主角頭像設置] 沒有找到現有頭像元素，可能需要手動指定頭像位置');
    }
}

// 從容器移除頭像
function removeAvatarFromContainer() {
    // 查找所有可能的頭像元素
    const avatarSelectors = [
        '#teammateModalAvatar',
        '.user-avatar',
        '.profile-avatar',
        '.avatar',
        '[id*="avatar"]',
        '[class*="avatar"]'
    ];
    
    let foundAvatar = false;
    
    avatarSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            if (element.tagName === 'IMG') {
                // 恢復到默認頭像或隱藏
                element.src = 'https://i.pravatar.cc/150?img=1'; // 恢復默認頭像
                foundAvatar = true;
                // console.log('[頭像設置] 已移除頭像元素:', selector, element);
            }
        });
    });
    
    // 恢復隊友數據中的默認頭像URL
    if (window.teammateData) {
        const defaultAvatars = {
            'A': 'https://i.pravatar.cc/150?img=3',
            'B': 'https://i.pravatar.cc/150?img=12',
            'C': 'https://i.pravatar.cc/150?img=8',
            'D': 'https://i.pravatar.cc/150?img=15'
        };
        
        Object.keys(window.teammateData).forEach(key => {
            window.teammateData[key].avatar = defaultAvatars[key] || 'https://i.pravatar.cc/150?img=1';
        });
        // console.log('[頭像設置] 已恢復隊友數據中的默認頭像URL');
    }
    
    // console.log('[頭像設置] 移除頭像完成，找到並處理了', foundAvatar ? '頭像元素' : '沒有找到頭像元素');
}

// 更新當前頭像顯示
function updateCurrentAvatarDisplay(name) {
    const currentAvatar = document.getElementById('currentAvatar');
    const currentAvatarName = document.getElementById('currentAvatarName');
    
    if (name === '未設置') {
        currentAvatar.style.display = 'none';
    } else {
        currentAvatarName.textContent = name;
        currentAvatar.style.display = 'block';
    }
}

// 保存頭像設置到 IndexedDB
async function saveAvatarSettings(type, data) {
    try {
        await window.backgroundManager.saveAvatarSettings(type, data);
    } catch (error) {
        console.error('[頭像設置] 保存設置失敗:', error);
        throw error;
    }
}

// 清除頭像設置
async function clearAvatarSettings() {
    try {
        await window.backgroundManager.clearAvatarSettings();
    } catch (error) {
        console.error('[頭像設置] 清除設置失敗:', error);
        throw error;
    }
}

// 載入保存的頭像設置
async function loadAvatarSettings() {
    try {
        const settings = await window.backgroundManager.getAvatarSettings();
        
        if (settings && settings.avatar) {
            applyAvatarToContainer(settings.avatar);
            
            const displayName = settings.type === 'url' ? 'URL頭像' : '上傳的頭像';
            updateCurrentAvatarDisplay(displayName);
            
            // console.log('[頭像設置] 載入保存的頭像設置:', displayName);
        } else {
            // 確保沒有頭像時隱藏頭像元素
            const avatarElement = document.querySelector('.user-avatar') || document.querySelector('.profile-avatar');
            if (avatarElement) {
                avatarElement.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('[頭像設置] 載入設置失敗:', error);
        // 確保沒有頭像時隱藏頭像元素
        const avatarElement = document.querySelector('.user-avatar') || document.querySelector('.profile-avatar');
        if (avatarElement) {
            avatarElement.style.display = 'none';
        }
    }
}

// 測試頭像功能
window.testAvatarFunction = function() {
    try {
        // console.log('[測試] 開始測試頭像功能...');
        
        // 測試應用頭像
        const testImageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        applyAvatarToContainer(testImageUrl);
        
        // 檢查隊友數據是否更新
        if (window.teammateData) {
            // console.log('[測試] 隊友數據頭像已更新:', window.teammateData);
        }
        
        // 檢查頭像元素是否更新
        const avatarElements = document.querySelectorAll('img[id*="avatar"], img[class*="avatar"]');
        // console.log('[測試] 找到頭像元素數量:', avatarElements.length);
        
        avatarElements.forEach((element, index) => {
            // console.log(`[測試] 頭像元素 ${index + 1}:`, element.id || element.className, element.src);
        });
        
        // console.log('[測試] 頭像功能測試完成！');
    } catch (error) {
        console.error('[測試] 頭像功能測試失敗:', error);
    }
};

// =======================================================================
//                          隊友頭像系統
// =======================================================================

// 隊友頭像數據存儲
window.teammateAvatars = new Map();

// 打開添加角色模態窗口
function openAddTeammateModal() {
    // 清空表單
    document.getElementById('teammateName').value = '';
    document.getElementById('teammateTag').value = '';
    document.getElementById('teammateAvatarPreview').style.display = 'none';
    document.getElementById('previewTeammateAvatar').src = '';
    
    // 顯示模態窗口
    openModal('addTeammateModal');
}

// 處理隊友頭像文件上傳
async function handleTeammateAvatarFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 驗證文件類型
    if (!file.type.startsWith('image/')) {
        alert('請選擇有效的圖片文件');
        return;
    }

    // 驗證文件大小 (限制為 2MB)
    if (file.size > 2 * 1024 * 1024) {
        alert('頭像文件大小不能超過 2MB');
        return;
    }

    try {
        // 顯示預覽
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('teammateAvatarPreview');
            const previewAvatar = document.getElementById('previewTeammateAvatar');
            previewAvatar.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);

        // console.log('[隊友頭像] 文件預覽成功');

    } catch (error) {
        console.error('[隊友頭像] 文件預覽失敗:', error);
        alert('文件預覽失敗: ' + error.message);
    }
}

// 保存隊友頭像
async function saveTeammateAvatar() {
    const name = document.getElementById('teammateName').value.trim();
    const tag = document.getElementById('teammateTag').value.trim();
    const avatarSrc = document.getElementById('previewTeammateAvatar').src;

    if (!name) {
        alert('請輸入角色名稱');
        return;
    }

    if (!avatarSrc || avatarSrc === '') {
        alert('請選擇角色頭像');
        return;
    }

    try {
        // 保存到隊友頭像數據
        window.teammateAvatars.set(name, {
            name: name,
            tag: tag,
            avatar: avatarSrc,
            createdAt: new Date().toISOString()
        });

        // 保存到 IndexedDB
        await window.backgroundManager.saveTeammateAvatar(name, tag, avatarSrc);

        // 更新顯示
        updateTeammateAvatarList();

        // 關閉模態窗口
        closeModal('addTeammateModal');

        // console.log('[隊友頭像] 角色保存成功:', name);
        alert('角色保存成功！');

    } catch (error) {
        console.error('[隊友頭像] 保存失敗:', error);
        alert('保存失敗: ' + error.message);
    }
}

// 更新隊友頭像列表顯示
function updateTeammateAvatarList() {
    const listContainer = document.getElementById('teammateAvatarList');
    
    if (window.teammateAvatars.size === 0) {
        listContainer.innerHTML = `
            <div class="no-teammates">
                <div>暫無自定義角色頭像</div>
                <div style="font-size: 11px; margin-top: 5px; color: rgba(255, 255, 255, 0.5);">
                    未設置的角色將自動使用預設頭像
                </div>
            </div>
        `;
        return;
    }

    let html = '';
    window.teammateAvatars.forEach((data, name) => {
        html += `
            <div class="teammate-avatar-item">
                <img src="${data.avatar}" alt="${name}頭像" style="border: 2px solid #4CAF50;" title="${name} (自定義頭像)">
                <div class="teammate-avatar-info">
                    <div class="teammate-avatar-name">${name}</div>
                    <div class="teammate-avatar-tag">${data.tag || '無標籤'}</div>
                </div>
                <div class="teammate-avatar-actions">
                    <button class="teammate-action-btn" onclick="editTeammateAvatar('${name}')">編輯</button>
                    <button class="teammate-action-btn delete" onclick="deleteTeammateAvatar('${name}')">刪除</button>
                </div>
            </div>
        `;
    });

    // 添加預設頭像說明
    html += `
        <div class="teammate-avatar-item" style="opacity: 0.7; background: rgba(255, 152, 0, 0.1);">
            <img src="https://i.pravatar.cc/150?img=1" alt="預設頭像" style="border: 2px solid #FF9800;" title="預設頭像">
            <div class="teammate-avatar-info">
                <div class="teammate-avatar-name">預設頭像</div>
                <div class="teammate-avatar-tag">未設置的角色自動使用</div>
            </div>
            <div class="teammate-avatar-actions">
                <span style="color: rgba(255, 255, 255, 0.6); font-size: 10px;">自動分配</span>
            </div>
        </div>
    `;

    listContainer.innerHTML = html;
}

// 編輯隊友頭像
function editTeammateAvatar(name) {
    const data = window.teammateAvatars.get(name);
    if (!data) return;

    // 填充表單
    document.getElementById('teammateName').value = data.name;
    document.getElementById('teammateTag').value = data.tag || '';
    document.getElementById('previewTeammateAvatar').src = data.avatar;
    document.getElementById('teammateAvatarPreview').style.display = 'block';

    // 顯示模態窗口
    openModal('addTeammateModal');
}

// 刪除隊友頭像
async function deleteTeammateAvatar(name) {
    if (!confirm(`確定要刪除角色 "${name}" 嗎？`)) {
        return;
    }

    try {
        // 從數據中移除
        window.teammateAvatars.delete(name);

        // 從 IndexedDB 刪除
        await window.backgroundManager.deleteTeammateAvatar(name);

        // 更新顯示
        updateTeammateAvatarList();

        // console.log('[隊友頭像] 角色刪除成功:', name);
        alert('角色刪除成功！');

    } catch (error) {
        console.error('[隊友頭像] 刪除失敗:', error);
        alert('刪除失敗: ' + error.message);
    }
}

// 根據角色名稱獲取頭像
function getTeammateAvatar(characterName) {
    const avatarData = window.teammateAvatars.get(characterName);
    if (avatarData && avatarData.avatar) {
        return avatarData.avatar;
    }
    
    // Fallback到預設頭像
    const defaultAvatars = [
        'https://i.pravatar.cc/150?img=1',
        'https://i.pravatar.cc/150?img=2', 
        'https://i.pravatar.cc/150?img=3',
        'https://i.pravatar.cc/150?img=4',
        'https://i.pravatar.cc/150?img=5',
        'https://i.pravatar.cc/150?img=6',
        'https://i.pravatar.cc/150?img=7',
        'https://i.pravatar.cc/150?img=8',
        'https://i.pravatar.cc/150?img=9',
        'https://i.pravatar.cc/150?img=10'
    ];
    
    // 根據角色名稱生成固定的預設頭像索引
    let hash = 0;
    for (let i = 0; i < characterName.length; i++) {
        hash = ((hash << 5) - hash) + characterName.charCodeAt(i);
        hash = hash & hash; // 轉換為32位整數
    }
    const index = Math.abs(hash) % defaultAvatars.length;
    
    // console.log('[隊友頭像] 使用預設頭像:', characterName, defaultAvatars[index]);
    return defaultAvatars[index];
}

// 載入隊友頭像數據
async function loadTeammateAvatars() {
    try {
        const avatars = await window.backgroundManager.getAllTeammateAvatars();
        window.teammateAvatars.clear();
        
        avatars.forEach(avatar => {
            window.teammateAvatars.set(avatar.name, avatar);
        });

        updateTeammateAvatarList();
        // console.log('[隊友頭像] 載入完成，共', avatars.length, '個角色');

    } catch (error) {
        console.error('[隊友頭像] 載入失敗:', error);
    }
}

// 處理AI輸出的角色狀態格式並匹配頭像
// 格式: [Status_1|角色名|身份|居住地|名聲:待定|评级:待定|特質TAG|对user的好感度|与user的CP值|当前状态|当前心声|当前着装]
function processAICharacterStatus(statusString) {
    try {
        // 解析狀態字符串
        const parts = statusString.split('|');
        if (parts.length < 2) {
            // console.log('[隊友頭像] 狀態格式不正確:', statusString);
            return null;
        }

        const characterName = parts[1].trim(); // 角色名是第二部分
        // console.log('[隊友頭像] 解析到角色名:', characterName);

        // 查找對應的頭像（包含fallback）
        const avatar = getTeammateAvatar(characterName);
        const avatarData = window.teammateAvatars.get(characterName);
        
        return {
            name: characterName,
            avatar: avatar,
            tag: avatarData?.tag || '未設置',
            isCustom: !!avatarData // 標記是否為自定義頭像
        };

    } catch (error) {
        console.error('[隊友頭像] 處理角色狀態失敗:', error);
        return null;
    }
}

// 應用角色頭像到指定元素
function applyCharacterAvatar(characterName, targetSelector) {
    const avatar = getTeammateAvatar(characterName);
    const avatarData = window.teammateAvatars.get(characterName);
    const isCustom = !!avatarData;

    const elements = document.querySelectorAll(targetSelector);
    if (elements.length === 0) {
        // console.log('[隊友頭像] 未找到目標元素:', targetSelector);
        return false;
    }

    elements.forEach(element => {
        if (element.tagName === 'IMG') {
            element.src = avatar;
            element.alt = `${characterName}頭像`;
            
            // 添加視覺提示，區分自定義頭像和預設頭像
            if (isCustom) {
                element.style.border = '2px solid #4CAF50'; // 綠色邊框表示自定義頭像
                element.title = `${characterName} (自定義頭像)`;
            } else {
                element.style.border = '2px solid #FF9800'; // 橙色邊框表示預設頭像
                element.title = `${characterName} (預設頭像)`;
            }
            
            // console.log('[隊友頭像] 已應用頭像到元素:', targetSelector, characterName, isCustom ? '自定義' : '預設');
        }
    });

    return true;
}

// 全局函數，供其他模塊調用
window.processAICharacterStatus = processAICharacterStatus;
window.applyCharacterAvatar = applyCharacterAvatar;
window.getTeammateAvatar = getTeammateAvatar;

// 測試fallback功能
window.testAvatarFallback = function() {
    // console.log('[測試] 開始測試頭像fallback功能...');
    
    // 測試自定義頭像
    const customAvatar = getTeammateAvatar('小美');
    // console.log('[測試] 小美頭像:', customAvatar);
    
    // 測試預設頭像fallback
    const defaultAvatar1 = getTeammateAvatar('未設置的角色A');
    const defaultAvatar2 = getTeammateAvatar('未設置的角色B');
    const defaultAvatar3 = getTeammateAvatar('未設置的角色C');
    
    // console.log('[測試] 角色A預設頭像:', defaultAvatar1);
    // console.log('[測試] 角色B預設頭像:', defaultAvatar2);
    // console.log('[測試] 角色C預設頭像:', defaultAvatar3);
    
    // 測試AI狀態處理
    const testStatus = '[Status_1|新角色|練習生|宿舍|名聲:待定|评级:待定|特質TAG|对user的好感度|与user的CP值|当前状态|当前心声|当前着装]';
    const result = processAICharacterStatus(testStatus);
    // console.log('[測試] AI狀態處理結果:', result);
    
    // console.log('[測試] fallback功能測試完成！');
};
