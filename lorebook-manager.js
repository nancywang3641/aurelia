// =======================================================================
//                          世界書管理器 - 獨立模組
// =======================================================================

/**
 * 世界書管理器
 */
const LorebookManager = {
    /**
     * 获取TavernHelper实例
     */
    getTavernHelper() {
        // 多层级查找TavernHelper
        const locations = [
            () => window.parent?.TavernHelper,
            () => window.top?.TavernHelper,
            () => window.TavernHelper
        ];

        for (const getHelper of locations) {
            try {
                const helper = getHelper();
                if (helper) return helper;
            } catch (error) {
                // 继续尝试下一个位置
            }
        }
        
        return null;
    },

    /**
     * 通过TavernHelper调用API
     */
    async callTavernAPI(apiName, ...args) {
        try {
            const helper = this.getTavernHelper();
            if (!helper || !helper[apiName]) {
                throw new Error(`TavernHelper.${apiName} 不可用`);
            }
            
            console.log(`[世界書管理器] 调用 ${apiName}`, args);
            return await helper[apiName](...args);
        } catch (error) {
            console.error(`[世界書管理器] API调用失败 ${apiName}:`, error);
            throw error;
        }
    },

    /**
     * 獲取所有世界書列表
     */
    async getAllLorebooks() {
        try {
            // 检查是否在chat环境中
            if (window.TavernAPI) {
                const lorebooks = await TavernAPI.call('getLorebooks');
                return lorebooks;
            } else {
                // 在main面板中，通过postMessage获取真实数据
                console.log('[世界書管理器] 通过postMessage获取世界书数据');
                const lorebooks = await this.callTavernAPI('getLorebooks');
                return lorebooks || [];
            }
        } catch (error) {
            console.error('[世界書管理器] 獲取世界書列表失敗:', error);
            return [];
        }
    },

    /**
     * 創建新世界書
     */
    async createLorebook(name) {
        try {
            if (window.TavernAPI) {
                const success = await TavernAPI.call('createLorebook', name);
                if (success) {
                    showSuccessToast(`世界書 "${name}" 創建成功！`);
                    return true;
                } else {
                    showErrorToast(`世界書 "${name}" 創建失敗，可能已存在同名世界書`);
                    return false;
                }
            } else {
                // 在main面板中，通过postMessage创建
                const success = await this.callTavernAPI('createLorebook', name);
                if (success) {
                    showSuccessToast(`世界書 "${name}" 創建成功！`);
                    return true;
                } else {
                    showErrorToast(`世界書 "${name}" 創建失敗，可能已存在同名世界書`);
                    return false;
                }
            }
        } catch (error) {
            console.error('[世界書管理器] 創建世界書失敗:', error);
            showErrorToast(`創建世界書失敗: ${error.message}`);
            return false;
        }
    },

    /**
     * 刪除世界書
     */
    async deleteLorebook(name) {
        try {
            if (window.TavernAPI) {
                const success = await TavernAPI.call('deleteLorebook', name);
                if (success) {
                    showSuccessToast(`世界書 "${name}" 刪除成功！`);
                    return true;
                } else {
                    showErrorToast(`世界書 "${name}" 刪除失敗`);
                    return false;
                }
            } else {
                // 在main面板中，通过postMessage删除
                const success = await this.callTavernAPI('deleteLorebook', name);
                if (success) {
                    showSuccessToast(`世界書 "${name}" 刪除成功！`);
                    return true;
                } else {
                    showErrorToast(`世界書 "${name}" 刪除失敗`);
                    return false;
                }
            }
        } catch (error) {
            console.error('[世界書管理器] 刪除世界書失敗:', error);
            showErrorToast(`刪除世界書失敗: ${error.message}`);
            return false;
        }
    },

    /**
     * 獲取當前角色卡綁定的世界書
     */
    async getCurrentCharLorebooks() {
        try {
            if (window.TavernAPI) {
                const lorebooks = await TavernAPI.call('getCharLorebooks');
                return lorebooks;
            } else {
                // 在main面板中，通过postMessage获取
                const lorebooks = await this.callTavernAPI('getCharLorebooks');
                return lorebooks || { primary: null, additional: [] };
            }
        } catch (error) {
            console.error('[世界書管理器] 獲取角色世界書失敗:', error);
            return { primary: null, additional: [] };
        }
    },

    /**
     * 設置當前角色卡綁定的世界書
     */
    async setCurrentCharLorebooks(lorebooks) {
        try {
            if (window.TavernAPI) {
                await TavernAPI.call('setCurrentCharLorebooks', lorebooks);
                showSuccessToast('角色世界書設置成功！');
            } else {
                // 在main面板中，通过postMessage设置
                await this.callTavernAPI('setCurrentCharLorebooks', lorebooks);
                showSuccessToast('角色世界書設置成功！');
            }
            return true;
        } catch (error) {
            console.error('[世界書管理器] 設置角色世界書失敗:', error);
            showErrorToast(`設置角色世界書失敗: ${error.message}`);
            return false;
        }
    },

    /**
     * 獲取當前聊天綁定的世界書
     */
    async getCurrentChatLorebook() {
        try {
            if (window.TavernAPI) {
                const lorebook = await TavernAPI.call('getChatLorebook');
                return lorebook;
            } else {
                // 在main面板中，通过postMessage获取
                const lorebook = await this.callTavernAPI('getChatLorebook');
                return lorebook || null;
            }
        } catch (error) {
            console.error('[世界書管理器] 獲取聊天世界書失敗:', error);
            return null;
        }
    },

    /**
     * 設置當前聊天綁定的世界書
     */
    async setCurrentChatLorebook(lorebookName) {
        try {
            if (window.TavernAPI) {
                await TavernAPI.call('setChatLorebook', lorebookName);
                showSuccessToast(`聊天世界書已綁定到 "${lorebookName}"`);
            } else {
                // 在main面板中，通过postMessage设置
                await this.callTavernAPI('setChatLorebook', lorebookName);
                showSuccessToast(`聊天世界書已綁定到 "${lorebookName}"`);
            }
            return true;
        } catch (error) {
            console.error('[世界書管理器] 設置聊天世界書失敗:', error);
            showErrorToast(`設置聊天世界書失敗: ${error.message}`);
            return false;
        }
    },

    /**
     * 獲取世界書條目
     */
    async getLorebookEntries(lorebookName) {
        try {
            if (window.TavernAPI) {
                const entries = await TavernAPI.call('getLorebookEntries', lorebookName);
                return entries;
            } else {
                // 在main面板中，通过postMessage获取
                const entries = await this.callTavernAPI('getLorebookEntries', lorebookName);
                return entries || [];
            }
        } catch (error) {
            console.error('[世界書管理器] 獲取世界書條目失敗:', error);
            return [];
        }
    },

    /**
     * 創建世界書條目
     */
    async createLorebookEntry(lorebookName, entryData) {
        try {
            if (window.TavernAPI) {
                const result = await TavernAPI.call('createLorebookEntries', lorebookName, [entryData]);
                showSuccessToast(`條目創建成功！新條目ID: ${result.new_uids[0]}`);
                return result.new_uids[0];
            } else {
                // 在main面板中，通过postMessage创建
                const result = await this.callTavernAPI('createLorebookEntries', lorebookName, [entryData]);
                if (result && result.new_uids && result.new_uids[0]) {
                    showSuccessToast(`條目創建成功！新條目ID: ${result.new_uids[0]}`);
                    return result.new_uids[0];
                } else {
                    showErrorToast('條目創建失敗');
                    return null;
                }
            }
        } catch (error) {
            console.error('[世界書管理器] 創建條目失敗:', error);
            showErrorToast(`創建條目失敗: ${error.message}`);
            return null;
        }
    }
};

/**
 * 打開世界書管理模態窗口（新版：標籤頁）
 */
function openLorebookManagerModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column;">
            <div class="modal-header">
                <h3>世界書管理器</h3>
                <span class="close-btn" onclick="closeLorebookManagerModal()">&times;</span>
            </div>
            <div class="modal-tab-bar">
                <button class="modal-tab-btn active" data-tab="lorebook-list-tab" onclick="switchLorebookTab('lorebook-list-tab', this)">世界書列表</button>
                <button class="modal-tab-btn" data-tab="char-lorebook-tab" onclick="switchLorebookTab('char-lorebook-tab', this)">當前角色</button>
                <button class="modal-tab-btn" data-tab="chat-lorebook-tab" onclick="switchLorebookTab('chat-lorebook-tab', this)">當前聊天</button>
            </div>
            <div class="modal-body">
                <div id="lorebook-list-tab" class="modal-tab-content" style="display:block;">
                    <h4>世界書列表</h4>
                    <div id="lorebookList" class="lorebook-list"></div>
                    <div class="lorebook-actions">
                        <input type="text" id="newLorebookName" placeholder="新世界書名稱" style="width: 200px;">
                        <button onclick="createNewLorebook()" class="btn-primary">創建世界書</button>
                    </div>
                </div>
                <div id="char-lorebook-tab" class="modal-tab-content" style="display:none;">
                    <h4>當前角色世界書</h4>
                    <div id="charLorebookInfo"></div>
                    <div class="lorebook-actions">
                        <select id="charPrimaryLorebook">
                            <option value="">選擇主要世界書</option>
                        </select>
                        <button onclick="updateCharLorebooks()" class="btn-primary">更新角色世界書</button>
                    </div>
                </div>
                <div id="chat-lorebook-tab" class="modal-tab-content" style="display:none;">
                    <h4>當前聊天世界書</h4>
                    <div id="chatLorebookInfo"></div>
                    <div class="lorebook-actions">
                        <select id="chatLorebook">
                            <option value="">選擇聊天世界書</option>
                        </select>
                        <button onclick="updateChatLorebook()" class="btn-primary">更新聊天世界書</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // 添加点击遮罩关闭功能
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeLorebookManagerModal();
        }
    });
    
    // 添加ESC键关闭功能
    const handleEscKey = function(e) {
        if (e.key === 'Escape') {
            closeLorebookManagerModal();
            document.removeEventListener('keydown', handleEscKey);
        }
    };
    document.addEventListener('keydown', handleEscKey);
    
    document.body.appendChild(modal);
    
    // 延迟添加active类，确保动画效果
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
    
    loadLorebookManagerData();
}

/**
 * 切換世界書管理器標籤頁
 */
window.switchLorebookTab = function(tabId, btn) {
    // 隱藏所有內容
    document.querySelectorAll('.modal-tab-content').forEach(el => el.style.display = 'none');
    // 顯示當前內容
    document.getElementById(tabId).style.display = 'flex';
    // 標籤高亮
    document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

/**
 * 關閉世界書管理模態窗口
 */
function closeLorebookManagerModal() {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        // 添加关闭动画
        modal.classList.remove('active');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300); // 等待动画完成
    });
}

/**
 * 載入世界書管理數據
 */
async function loadLorebookManagerData() {
    try {
        // 載入世界書列表
        const lorebooks = await LorebookManager.getAllLorebooks();
        const lorebookList = document.getElementById('lorebookList');
        lorebookList.innerHTML = lorebooks.map(lorebook => `
            <div class="lorebook-item">
                <span>${lorebook}</span>
                <div style="display:flex;gap:6px;">
                    <button onclick="openLorebookEntriesModal('${lorebook}')" class="btn-primary" style="font-size:12px;">查看條目</button>
                    <button onclick="deleteLorebook('${lorebook}')" class="btn-danger">刪除</button>
                </div>
            </div>
        `).join('');

        // 更新選擇框選項
        const charSelect = document.getElementById('charPrimaryLorebook');
        const chatSelect = document.getElementById('chatLorebook');
        const options = lorebooks.map(lorebook => `<option value="${lorebook}">${lorebook}</option>`).join('');
        charSelect.innerHTML = '<option value="">選擇主要世界書</option>' + options;
        chatSelect.innerHTML = '<option value="">選擇聊天世界書</option>' + options;

        // 載入角色世界書信息
        const charLorebooks = await LorebookManager.getCurrentCharLorebooks();
        document.getElementById('charLorebookInfo').innerHTML = `
            <p>主要世界書: ${charLorebooks.primary || '無'}</p>
            <p>附加世界書: ${charLorebooks.additional.join(', ') || '無'}</p>
        `;
        if (charLorebooks.primary) {
            charSelect.value = charLorebooks.primary;
        }

        // 載入聊天世界書信息
        const chatLorebook = await LorebookManager.getCurrentChatLorebook();
        document.getElementById('chatLorebookInfo').innerHTML = `
            <p>綁定世界書: ${chatLorebook || '無'}</p>
        `;
        if (chatLorebook) {
            chatSelect.value = chatLorebook;
        }

    } catch (error) {
        console.error('[世界書管理器] 載入數據失敗:', error);
        showErrorToast('載入世界書數據失敗');
    }
}

/**
 * 創建新世界書
 */
async function createNewLorebook() {
    const nameInput = document.getElementById('newLorebookName');
    const name = nameInput.value.trim();
    
    if (!name) {
        showErrorToast('請輸入世界書名稱');
        return;
    }
    
    const success = await LorebookManager.createLorebook(name);
    if (success) {
        nameInput.value = '';
        await loadLorebookManagerData();
    }
}

/**
 * 刪除世界書
 */
async function deleteLorebook(name) {
    if (!confirm(`確定要刪除世界書 "${name}" 嗎？`)) {
        return;
    }
    
    const success = await LorebookManager.deleteLorebook(name);
    if (success) {
        await loadLorebookManagerData();
    }
}

/**
 * 更新角色世界書
 */
async function updateCharLorebooks() {
    const primarySelect = document.getElementById('charPrimaryLorebook');
    const primary = primarySelect.value || null;
    
    const success = await LorebookManager.setCurrentCharLorebooks({
        primary: primary,
        additional: [] // 暫時不處理附加世界書
    });
    
    if (success) {
        await loadLorebookManagerData();
    }
}

/**
 * 更新聊天世界書
 */
async function updateChatLorebook() {
    const chatSelect = document.getElementById('chatLorebook');
    const lorebookName = chatSelect.value || null;
    
    const success = await LorebookManager.setCurrentChatLorebook(lorebookName);
    
    if (success) {
        await loadLorebookManagerData();
    }
}

/**
 * 打開條目列表視窗
 */
async function openLorebookEntriesModal(lorebookName) {
    const entries = await LorebookManager.getLorebookEntries(lorebookName);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal-lorebook-entries';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; max-height: 80vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>世界書條目 - ${lorebookName}</h3>
                <span class="close-btn" onclick="closeLorebookEntriesModal()">&times;</span>
            </div>
            <div class="modal-body">
                <button onclick="openAddLorebookEntryModal('${lorebookName}')" class="btn-primary" style="width:100%;margin-bottom:12px;">＋ 新增條目</button>
                <div id="lorebookEntriesList">
                    ${entries.length === 0 ? '<div style=\'color:#888;text-align:center;\'>暫無條目</div>' :
                        entries.map(entry => `
                        <div class=\'lorebook-entry-item\' style=\'border-bottom:1px solid #eee;padding:8px 0;display:flex;align-items:center;justify-content:space-between;\'>
                            <div style=\'flex:1;overflow:hidden;\'>
                                <div class=\'entry-title\' style=\'font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#333;\'>
                                    <b>${entry.comment || '(無標題)'}</b>
                                </div>
                                <div class=\'entry-keys\' style=\'font-size:12px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\'>
                                    ${entry.keys ? entry.keys.join(', ') : ''}
                                </div>
                            </div>
                            <button onclick=\'openEditLorebookEntryModal("${lorebookName}",${entry.uid})\' style=\'margin-left:10px;padding:2px 8px;font-size:12px;\'>編輯</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    // 添加点击遮罩关闭功能
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeLorebookEntriesModal();
        }
    });
    
    // 添加ESC键关闭功能
    const handleEscKey = function(e) {
        if (e.key === 'Escape') {
            closeLorebookEntriesModal();
            document.removeEventListener('keydown', handleEscKey);
        }
    };
    document.addEventListener('keydown', handleEscKey);
    
    document.body.appendChild(modal);
    
    // 延迟添加active类，确保动画效果
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}
window.openLorebookEntriesModal = openLorebookEntriesModal;

// 新增條目視窗
window.openAddLorebookEntryModal = function(lorebookName) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal-lorebook-edit';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>新增條目</h3>
                <span class="close-btn" onclick="closeEditLorebookEntryModal()">&times;</span>
            </div>
            <div class="modal-body">
                <label style="color:#333;font-weight:500;">標題/備註：</label>
                <input type="text" id="editEntryComment" value="" style="width:100%;margin-bottom:8px;color:#333;">
                <label style="color:#333;font-weight:500;">關鍵詞（逗號分隔）：</label>
                <input type="text" id="editEntryKeys" value="" style="width:100%;margin-bottom:8px;color:#333;">
                <label style="color:#333;font-weight:500;">內容：</label>
                <textarea id="editEntryContent" rows="4" style="width:100%;margin-bottom:8px;color:#333;"></textarea>
                <label style="color:#333;font-weight:500;">啟用：</label>
                <input type="checkbox" id="editEntryEnabled" checked>
                <button onclick="saveAddLorebookEntry('${lorebookName}')" class="btn-primary" style="width:100%;margin-top:16px;">保存</button>
            </div>
        </div>
    `;
    
    // 添加点击遮罩关闭功能
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeEditLorebookEntryModal();
        }
    });
    
    // 添加ESC键关闭功能
    const handleEscKey = function(e) {
        if (e.key === 'Escape') {
            closeEditLorebookEntryModal();
            document.removeEventListener('keydown', handleEscKey);
        }
    };
    document.addEventListener('keydown', handleEscKey);
    
    document.body.appendChild(modal);
    
    // 延迟添加active类，确保动画效果
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}

window.saveAddLorebookEntry = async function(lorebookName) {
    const comment = document.getElementById('editEntryComment').value.trim();
    const keys = document.getElementById('editEntryKeys').value.split(',').map(k=>k.trim()).filter(Boolean);
    const content = document.getElementById('editEntryContent').value;
    const enabled = document.getElementById('editEntryEnabled').checked;
    try {
        await LorebookManager.createLorebookEntry(lorebookName, { comment, keys, content, enabled });
        closeEditLorebookEntryModal();
        // 重新載入條目列表
        const entries = await LorebookManager.getLorebookEntries(lorebookName);
        const entriesList = document.getElementById('lorebookEntriesList');
        entriesList.innerHTML = entries.length === 0 ? '<div style=\'color:#888;text-align:center;\'>暫無條目</div>' :
            entries.map(entry => `
            <div class=\'lorebook-entry-item\' style=\'border-bottom:1px solid #eee;padding:8px 0;display:flex;align-items:center;justify-content:space-between;\'>
                <div style=\'flex:1;overflow:hidden;\'>
                    <div class=\'entry-title\' style=\'font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#333;\'>
                        <b>${entry.comment || '(無標題)'}</b>
                    </div>
                    <div class=\'entry-keys\' style=\'font-size:12px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\'>
                        ${entry.keys ? entry.keys.join(', ') : ''}
                    </div>
                </div>
                <button onclick=\'openEditLorebookEntryModal("${lorebookName}",${entry.uid})\' style=\'margin-left:10px;padding:2px 8px;font-size:12px;\'>編輯</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('保存條目失敗:', error);
        showErrorToast('保存條目失敗');
    }
}

// 編輯條目視窗
window.openEditLorebookEntryModal = async function(lorebookName, entryUid) {
    const entries = await LorebookManager.getLorebookEntries(lorebookName);
    const entry = entries.find(e => e.uid === entryUid);
    if (!entry) {
        showErrorToast('找不到條目');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal-lorebook-edit';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>編輯條目</h3>
                <span class="close-btn" onclick="closeEditLorebookEntryModal()">&times;</span>
            </div>
            <div class="modal-body">
                <label style="color:#333;font-weight:500;">標題/備註：</label>
                <input type="text" id="editEntryComment" value="${entry.comment || ''}" style="width:100%;margin-bottom:8px;color:#333;">
                <label style="color:#333;font-weight:500;">關鍵詞（逗號分隔）：</label>
                <input type="text" id="editEntryKeys" value="${entry.keys ? entry.keys.join(', ') : ''}" style="width:100%;margin-bottom:8px;color:#333;">
                <label style="color:#333;font-weight:500;">內容：</label>
                <textarea id="editEntryContent" rows="4" style="width:100%;margin-bottom:8px;color:#333;">${entry.content || ''}</textarea>
                <label style="color:#333;font-weight:500;">啟用：</label>
                <input type="checkbox" id="editEntryEnabled" ${entry.enabled ? 'checked' : ''}>
                <button onclick="saveEditLorebookEntry('${lorebookName}', ${entryUid})" class="btn-primary" style="width:100%;margin-top:16px;">保存</button>
            </div>
        </div>
    `;
    
    // 添加点击遮罩关闭功能
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeEditLorebookEntryModal();
        }
    });
    
    // 添加ESC键关闭功能
    const handleEscKey = function(e) {
        if (e.key === 'Escape') {
            closeEditLorebookEntryModal();
            document.removeEventListener('keydown', handleEscKey);
        }
    };
    document.addEventListener('keydown', handleEscKey);
    
    document.body.appendChild(modal);
    
    // 延迟添加active类，确保动画效果
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}

window.saveEditLorebookEntry = async function(lorebookName, entryUid) {
    const comment = document.getElementById('editEntryComment').value.trim();
    const keys = document.getElementById('editEntryKeys').value.split(',').map(k=>k.trim()).filter(Boolean);
    const content = document.getElementById('editEntryContent').value;
    const enabled = document.getElementById('editEntryEnabled').checked;
    try {
        await LorebookManager.createLorebookEntry(lorebookName, { comment, keys, content, enabled });
        closeEditLorebookEntryModal();
        // 重新載入條目列表
        const entries = await LorebookManager.getLorebookEntries(lorebookName);
        const entriesList = document.getElementById('lorebookEntriesList');
        entriesList.innerHTML = entries.length === 0 ? '<div style=\'color:#888;text-align:center;\'>暫無條目</div>' :
            entries.map(entry => `
            <div class=\'lorebook-entry-item\' style=\'border-bottom:1px solid #eee;padding:8px 0;display:flex;align-items:center;justify-content:space-between;\'>
                <div style=\'flex:1;overflow:hidden;\'>
                    <div class=\'entry-title\' style=\'font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#333;\'>
                        <b>${entry.comment || '(無標題)'}</b>
                    </div>
                    <div class=\'entry-keys\' style=\'font-size:12px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\'>
                        ${entry.keys ? entry.keys.join(', ') : ''}
                    </div>
                </div>
                <button onclick=\'openEditLorebookEntryModal("${lorebookName}",${entry.uid})\' style=\'margin-left:10px;padding:2px 8px;font-size:12px;\'>編輯</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('保存條目失敗:', error);
        showErrorToast('保存條目失敗');
    }
}

function closeLorebookEntriesModal() {
    const modals = document.querySelectorAll('.modal-lorebook-entries');
    modals.forEach(modal => {
        // 添加关闭动画
        modal.classList.remove('active');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300); // 等待动画完成
    });
}

function closeEditLorebookEntryModal() {
    const modals = document.querySelectorAll('.modal-lorebook-edit');
    modals.forEach(modal => {
        // 添加关闭动画
        modal.classList.remove('active');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300); // 等待动画完成
    });
}

// 添加CSS樣式
const lorebookStyles = `
<style>
/* 模态窗口基础样式 */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s ease, visibility 0.3s ease;
}

.modal-overlay.active {
    opacity: 1;
    visibility: visible;
}

.modal-content {
    background: #f5f5f5;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
    animation: modalSlideIn 0.3s ease;
    display: flex;
    flex-direction: column;
}

@keyframes modalSlideIn {
    from {
        transform: translateY(-50px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    border-bottom: 1px solid #eee;
    background: #f8f9fa;
}

.modal-header h3 {
    margin: 0;
    color: #333;
    font-size: 18px;
}

.close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background-color 0.2s ease;
}

.close-btn:hover {
    background-color: #e9ecef;
    color: #333;
}

.modal-body {
    overflow-y: auto;
    max-height: calc(90vh - 120px);
    background: #fafafa;
    display: flex;
    flex-direction: column;
    flex: 1;
}

/* 世界书管理器特定样式 */
.modal-tab-content h4 {
    margin: 0 0 15px 0;
    color: #2c3e50;
    font-size: 18px;
    font-weight: 600;
    border-bottom: 2px solid #007bff;
    padding-bottom: 8px;
}

.lorebook-list {
    height: 100%;
    width: 100%;
    min-height: 200px;
    overflow-y: auto;
    margin-bottom: 15px;
    background: white;
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.08);
    flex: 1;
}

.lorebook-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 15px;
    border-bottom: 1px solid #eee;
    transition: background-color 0.2s ease;
    color: #333;
    font-weight: 500;
}

.lorebook-item span {
    color: #333;
    font-weight: 500;
    font-size: 14px;
}

.lorebook-item:hover {
    background-color: #f8f9fa;
}

.lorebook-item:last-child {
    border-bottom: none;
}

.lorebook-actions {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
}

.lorebook-actions input,
.lorebook-actions select {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
}

.btn-primary {
    background: #007bff;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s ease;
}

.btn-danger {
    background: #dc3545;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background-color 0.2s ease;
}

.btn-primary:hover {
    background: #0056b3;
}

.btn-danger:hover {
    background: #c82333;
}

.modal-tab-bar {
    display: flex;
    border-bottom: 1px solid #ddd;
    background: #f8f9fa;
    border-radius: 8px 8px 0 0;
}

.modal-tab-btn {
    background: none;
    border: none;
    padding: 12px 20px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    font-size: 14px;
    color: #666;
    transition: all 0.2s ease;
    flex: 1;
    text-align: center;
}

.modal-tab-btn:hover {
    background-color: #e9ecef;
    color: #333;
}

.modal-tab-btn.active {
    border-bottom-color: #007bff;
    color: #007bff;
    background-color: white;
}

.modal-tab-content {
    display: none;
    padding: 20px;
    flex: 1;
    overflow: hidden;
    flex-direction: column;
    background: white;
    border-radius: 8px;
    margin: 10px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.modal-tab-content:first-child {
    display: flex;
}

/* 条目相关样式 */
.lorebook-entry-item {
    border-bottom: 1px solid #eee;
    padding: 12px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #333;
}

.lorebook-entry-item:last-child {
    border-bottom: none;
}

.lorebook-entry-item div {
    color: #333;
}

.lorebook-entry-item b {
    color: #333;
    font-weight: 600;
}

.lorebook-entry-item .entry-title {
    color: #333;
    font-weight: 500;
}

.lorebook-entry-item .entry-keys {
    color: #666;
}

/* 响应式设计 */
@media (max-width: 768px) {
    .modal-content {
        margin: 10px;
        max-width: calc(100vw - 20px);
        max-height: calc(100vh - 20px);
    }
    
    .modal-body {
        padding: 15px;
    }
    
    .lorebook-actions {
        flex-direction: column;
        align-items: stretch;
    }
    
    .lorebook-actions input,
    .lorebook-actions select {
        width: 100%;
    }
}
</style>
`;

// 注入樣式
document.head.insertAdjacentHTML('beforeend', lorebookStyles);

// 導出到全局
window.LorebookManager = LorebookManager;
window.openLorebookManagerModalFromLibrary = openLorebookManagerModal;
window.closeLorebookManagerModal = closeLorebookManagerModal;
window.loadLorebookManagerData = loadLorebookManagerData;
window.createNewLorebook = createNewLorebook;
window.deleteLorebook = deleteLorebook;
window.updateCharLorebooks = updateCharLorebooks;
window.updateChatLorebook = updateChatLorebook;
window.openLorebookEntriesModal = openLorebookEntriesModal;
window.closeLorebookEntriesModal = closeLorebookEntriesModal;
window.openAddLorebookEntryModal = openAddLorebookEntryModal;
window.closeEditLorebookEntryModal = closeEditLorebookEntryModal;
window.saveAddLorebookEntry = saveAddLorebookEntry;
window.saveEditLorebookEntry = saveEditLorebookEntry;
window.openEditLorebookEntryModal = openEditLorebookEntryModal;
