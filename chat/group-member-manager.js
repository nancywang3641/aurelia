// =======================================================================
//                          群組成員管理器（修復版）
// =======================================================================
// 
// 修復內容：
// 1. 使用復合主鍵 (name + groupId) 避免不同群組間成員覆蓋
// 2. 改進成員添加和查詢邏輯
// 3. 支持同一角色在多個群組中存在
//
// =======================================================================

/**
 * 群組成員管理器 - 使用 IndexedDB 存儲群組成員信息
 * 修復版：支持同一角色在多個群組中存在
 */
class GroupMemberManager {
    constructor() {
        this.dbName = 'GroupMembersDB';
        this.dbVersion = 3; // 🔥 版本升級，修復數據結構
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
                console.error('[群組成員管理器] 數據庫打開失敗');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('[群組成員管理器] 數據庫初始化成功');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                this.db = event.target.result;
                console.log('[群組成員管理器] 數據庫升級中...');

                // 🔥 修復：刪除舊的 object store（如果存在）
                if (this.db.objectStoreNames.contains('members')) {
                    this.db.deleteObjectStore('members');
                }

                // 🔥 修復：創建新的 object store，使用復合主鍵
                const store = this.db.createObjectStore('members', { 
                    keyPath: 'compositeId' // 使用 name_groupId 作為復合主鍵
                });

                // 創建索引
                store.createIndex('groupId', 'groupId', { unique: false });
                store.createIndex('name', 'name', { unique: false });
                
                console.log('[群組成員管理器] 數據庫結構升級完成');
            };
        });
    }

    /**
     * 🔥 修復：生成復合ID
     */
    generateCompositeId(name, groupId) {
        return `${name}_${groupId}`;
    }

    /**
     * 添加成員到群組
     */
    async addMember(groupId, name, avatar = null, displayName = null) {
        try {
            await this.initDB();

            const memberData = {
                compositeId: this.generateCompositeId(name, groupId), // 🔥 修復：使用復合ID
                name: name,
                groupId: groupId,
                avatar: avatar,
                displayName: displayName || name,
                createdAt: new Date().toISOString()
            };

            const transaction = this.db.transaction(['members'], 'readwrite');
            const store = transaction.objectStore('members');
            
            // 🔥 修復：使用 put 而不是 add，允許更新
            await store.put(memberData);

            console.log(`[群組成員管理器] 成員 "${name}" 添加成功，groupId: ${groupId}`);
            return true;

        } catch (error) {
            console.error('[群組成員管理器] 添加成員失敗:', error);
            throw error;
        }
    }

    /**
     * 🔥 修復：獲取指定群組的所有成員
     */
    async getGroupMembers(groupId) {
        try {
            await this.initDB();

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['members'], 'readonly');
                const store = transaction.objectStore('members');
                const index = store.index('groupId');
                const request = index.getAll(groupId);

                request.onsuccess = () => {
                    const members = request.result || [];
                    console.log(`[群組成員管理器] 獲取群組 "${groupId}" 成員: ${members.length}`);
                    console.log(`[群組成員管理器] 成員詳情:`, members);
                    resolve(members);
                };

                request.onerror = () => {
                    console.error('[群組成員管理器] 獲取群組成員失敗');
                    reject(request.error);
                };
            });

        } catch (error) {
            console.error('[群組成員管理器] 獲取群組成員失敗:', error);
            return [];
        }
    }

    /**
     * 🔥 修復：獲取指定成員信息
     */
    async getMember(name, groupId) {
        try {
            await this.initDB();

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['members'], 'readonly');
                const store = transaction.objectStore('members');
                const compositeId = this.generateCompositeId(name, groupId);
                const request = store.get(compositeId);

                request.onsuccess = () => {
                    const member = request.result;
                    if (member) {
                        console.log(`[群組成員管理器] 找到成員: ${name}, groupId: ${groupId}`);
                    } else {
                        console.log(`[群組成員管理器] 未找到成員: ${name}, groupId: ${groupId}`);
                    }
                    resolve(member);
                };

                request.onerror = () => {
                    console.error('[群組成員管理器] 獲取成員失敗');
                    reject(request.error);
                };
            });

        } catch (error) {
            console.error('[群組成員管理器] 獲取成員失敗:', error);
            return null;
        }
    }

    /**
     * 🔥 修復：刪除指定成員
     */
    async removeMember(name, groupId) {
        try {
            await this.initDB();

            const transaction = this.db.transaction(['members'], 'readwrite');
            const store = transaction.objectStore('members');
            const compositeId = this.generateCompositeId(name, groupId);
            
            await store.delete(compositeId);
            console.log(`[群組成員管理器] 成員 "${name}" 已從群組 "${groupId}" 中刪除`);
            return true;

        } catch (error) {
            console.error('[群組成員管理器] 刪除成員失敗:', error);
            return false;
        }
    }

    /**
     * 🔥 修復：刪除整個群組的所有成員
     */
    async removeGroupMembers(groupId) {
        try {
            await this.initDB();

            const members = await this.getGroupMembers(groupId);
            
            const transaction = this.db.transaction(['members'], 'readwrite');
            const store = transaction.objectStore('members');
            
            for (const member of members) {
                await store.delete(member.compositeId);
            }
            
            console.log(`[群組成員管理器] 群組 "${groupId}" 的所有成員已刪除，共 ${members.length} 個`);
            return members.length;

        } catch (error) {
            console.error('[群組成員管理器] 刪除群組成員失敗:', error);
            return 0;
        }
    }

    /**
     * 🆕 新增：清理臨時群組成員（清理所有以 temp_group_ 開頭的群組）
     */
    async cleanupTempGroupMembers() {
        try {
            await this.initDB();

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['members'], 'readwrite');
                const store = transaction.objectStore('members');
                const request = store.openCursor();
                
                let deletedCount = 0;

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const member = cursor.value;
                        
                        // 檢查是否為臨時群組成員
                        if (member.groupId && member.groupId.startsWith('temp_group_')) {
                            cursor.delete();
                            deletedCount++;
                            console.log(`[群組成員管理器] 清理臨時成員: ${member.name} (${member.groupId})`);
                        }
                        
                        cursor.continue();
                    } else {
                        console.log(`[群組成員管理器] 臨時群組成員清理完成，共清理 ${deletedCount} 個`);
                        resolve(deletedCount);
                    }
                };

                request.onerror = () => {
                    console.error('[群組成員管理器] 清理臨時群組成員失敗');
                    reject(request.error);
                };
            });

        } catch (error) {
            console.error('[群組成員管理器] 清理臨時群組成員失敗:', error);
            return 0;
        }
    }

    /**
     * 🆕 新增：獲取所有成員（調試用）
     */
    async getAllMembers() {
        try {
            await this.initDB();

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['members'], 'readonly');
                const store = transaction.objectStore('members');
                const request = store.getAll();

                request.onsuccess = () => {
                    const members = request.result || [];
                    console.log(`[群組成員管理器] 數據庫中共有 ${members.length} 個成員記錄`);
                    resolve(members);
                };

                request.onerror = () => {
                    console.error('[群組成員管理器] 獲取所有成員失敗');
                    reject(request.error);
                };
            });

        } catch (error) {
            console.error('[群組成員管理器] 獲取所有成員失敗:', error);
            return [];
        }
    }

    /**
     * 更新成員信息
     */
    async updateMember(name, groupId, updates) {
        try {
            const member = await this.getMember(name, groupId);
            if (!member) {
                console.warn(`[群組成員管理器] 成員 "${name}" 不存在於群組 "${groupId}"`);
                return false;
            }

            // 合併更新數據
            const updatedMember = { ...member, ...updates };
            
            // 重新添加（相當於更新）
            await this.addMember(groupId, name, updatedMember.avatar, updatedMember.displayName);
            
            console.log(`[群組成員管理器] 成員 "${name}" 信息已更新`);
            return true;

        } catch (error) {
            console.error('[群組成員管理器] 更新成員失敗:', error);
            return false;
        }
    }

    /**
     * 驗證圖片文件
     */
    validateImageFile(file) {
        const maxSize = 5 * 1024 * 1024; // 5MB
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

        if (!allowedTypes.includes(file.type)) {
            throw new Error('不支持的圖片格式，請選擇 JPEG、PNG、GIF 或 WebP 格式的圖片');
        }

        if (file.size > maxSize) {
            throw new Error('圖片文件過大，請選擇小於 5MB 的圖片');
        }

        return true;
    }

    /**
     * 將文件轉換為 Base64
     */
    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = function(e) {
                resolve(e.target.result);
            };
            
            reader.onerror = function(error) {
                reject(error);
            };
            
            reader.readAsDataURL(file);
        });
    }
}

// 創建全局實例
const groupMemberManager = new GroupMemberManager();

// 暴露到全局作用域
window.groupMemberManager = groupMemberManager;