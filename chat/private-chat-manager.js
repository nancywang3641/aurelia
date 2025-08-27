// =======================================================================
//                          私聊成員管理器
// =======================================================================
// 
// 功能：
// 1. 管理私聊的兩個參與者（用戶和角色）
// 2. 存儲私聊參與者的頭像和基本信息
// 3. 與私聊設置功能整合
//
// =======================================================================

/**
 * 私聊成員管理器 - 使用 IndexedDB 存儲私聊參與者信息
 */
class PrivateChatManager {
    constructor() {
        this.dbName = 'PrivateChatDB';
        this.dbVersion = 1;
        this.db = null;
    }

    /**
     * 初始化數據庫
     */
    async initDB() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('[私聊成員管理器] 數據庫打開失敗');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('[私聊成員管理器] 數據庫初始化成功');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                this.db = event.target.result;
                console.log('[私聊成員管理器] 數據庫升級中...');

                // 創建私聊參與者存儲
                if (!this.db.objectStoreNames.contains('participants')) {
                    const store = this.db.createObjectStore('participants', { 
                        keyPath: 'compositeId'
                    });

                    // 創建索引
                    store.createIndex('chatId', 'chatId', { unique: false });
                    store.createIndex('name', 'name', { unique: false });
                    store.createIndex('role', 'role', { unique: false }); // 'user' 或 'character'
                }
                
                console.log('[私聊成員管理器] 數據庫結構創建完成');
            };
        });
    }

    /**
     * 生成復合ID
     */
    generateCompositeId(name, chatId, role) {
        return `${name}_${chatId}_${role}`;
    }

    /**
     * 添加私聊參與者
     */
    async addParticipant(chatId, name, avatar = null, role = 'character', displayName = null) {
        try {
            await this.initDB();

            const participantData = {
                compositeId: this.generateCompositeId(name, chatId, role),
                name: name,
                chatId: chatId,
                role: role, // 'user' 或 'character'
                avatar: avatar,
                displayName: displayName || name,
                createdAt: new Date().toISOString()
            };

            const transaction = this.db.transaction(['participants'], 'readwrite');
            const store = transaction.objectStore('participants');
            
            await store.put(participantData);

            console.log(`[私聊成員管理器] 參與者 "${name}" (${role}) 添加成功，chatId: ${chatId}`);
            return true;

        } catch (error) {
            console.error('[私聊成員管理器] 添加參與者失敗:', error);
            throw error;
        }
    }

    /**
     * 獲取私聊參與者
     */
    async getParticipant(name, chatId, role) {
        try {
            await this.initDB();

            const transaction = this.db.transaction(['participants'], 'readonly');
            const store = transaction.objectStore('participants');
            const compositeId = this.generateCompositeId(name, chatId, role);
            
            const request = store.get(compositeId);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    resolve(request.result);
                };
                request.onerror = () => {
                    reject(request.error);
                };
            });

        } catch (error) {
            console.error('[私聊成員管理器] 獲取參與者失敗:', error);
            throw error;
        }
    }

    /**
     * 獲取私聊的所有參與者
     */
    async getChatParticipants(chatId) {
        try {
            await this.initDB();

            const transaction = this.db.transaction(['participants'], 'readonly');
            const store = transaction.objectStore('participants');
            const index = store.index('chatId');
            
            const request = index.getAll(chatId);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    resolve(request.result);
                };
                request.onerror = () => {
                    reject(request.error);
                };
            });

        } catch (error) {
            console.error('[私聊成員管理器] 獲取聊天參與者失敗:', error);
            throw error;
        }
    }

    /**
     * 更新參與者信息
     */
    async updateParticipant(chatId, name, avatar = null, role = 'character', displayName = null) {
        try {
            await this.initDB();

            const participantData = {
                compositeId: this.generateCompositeId(name, chatId, role),
                name: name,
                chatId: chatId,
                role: role,
                avatar: avatar,
                displayName: displayName || name,
                updatedAt: new Date().toISOString()
            };

            const transaction = this.db.transaction(['participants'], 'readwrite');
            const store = transaction.objectStore('participants');
            
            await store.put(participantData);

            console.log(`[私聊成員管理器] 參與者 "${name}" (${role}) 更新成功`);
            return true;

        } catch (error) {
            console.error('[私聊成員管理器] 更新參與者失敗:', error);
            throw error;
        }
    }

    /**
     * 刪除參與者
     */
    async deleteParticipant(name, chatId, role) {
        try {
            await this.initDB();

            const transaction = this.db.transaction(['participants'], 'readwrite');
            const store = transaction.objectStore('participants');
            const compositeId = this.generateCompositeId(name, chatId, role);
            
            await store.delete(compositeId);

            console.log(`[私聊成員管理器] 參與者 "${name}" (${role}) 刪除成功`);
            return true;

        } catch (error) {
            console.error('[私聊成員管理器] 刪除參與者失敗:', error);
            throw error;
        }
    }

    /**
     * 清理臨時私聊數據
     */
    async cleanupTempPrivateChats() {
        try {
            await this.initDB();

            const transaction = this.db.transaction(['participants'], 'readwrite');
            const store = transaction.objectStore('participants');
            const index = store.index('chatId');
            
            const request = index.getAllKeys();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const tempKeys = request.result.filter(key => 
                        key.toString().includes('temp_private_')
                    );
                    
                    let deletedCount = 0;
                    tempKeys.forEach(key => {
                        store.delete(key);
                        deletedCount++;
                    });
                    
                    console.log(`[私聊成員管理器] 已清理 ${deletedCount} 個臨時私聊參與者`);
                    resolve(deletedCount);
                };
                request.onerror = () => {
                    reject(request.error);
                };
            });

        } catch (error) {
            console.error('[私聊成員管理器] 清理臨時數據失敗:', error);
            throw error;
        }
    }

    /**
     * 🔥 新增：刪除聊天室的所有參與者
     */
    async deleteChatParticipants(chatId) {
        try {
            await this.initDB();

            // 先獲取該聊天室的所有參與者
            const participants = await this.getChatParticipants(chatId);
            
            if (participants.length === 0) {
                console.log(`[私聊成員管理器] 聊天室 ${chatId} 沒有參與者數據需要清理`);
                return 0;
            }

            const transaction = this.db.transaction(['participants'], 'readwrite');
            const store = transaction.objectStore('participants');
            
            let deletedCount = 0;
            for (const participant of participants) {
                await store.delete(participant.compositeId);
                deletedCount++;
                console.log(`[私聊成員管理器] 已刪除參與者: ${participant.name} (${participant.role})`);
            }
            
            console.log(`[私聊成員管理器] 聊天室 ${chatId} 的所有參與者已刪除，共 ${deletedCount} 個`);
            return deletedCount;

        } catch (error) {
            console.error('[私聊成員管理器] 刪除聊天室參與者失敗:', error);
            throw error;
        }
    }

    /**
     * 驗證圖片文件
     */
    validateImageFile(file) {
        if (!file.type.startsWith('image/')) {
            throw new Error('請選擇圖片文件');
        }
        if (file.size > 5 * 1024 * 1024) {
            throw new Error('圖片大小不能超過5MB');
        }
    }
}

// 創建全局實例
window.privateChatManager = new PrivateChatManager();

// 導出到全局作用域
window.PrivateChatManager = PrivateChatManager;
