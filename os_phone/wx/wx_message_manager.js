// ----------------------------------------------------------------
// [檔案] wx_message_manager.js (V1.3 - Index Patch)
// 功能：
// 1. [核心修復] 改用 data-msg-idx 屬性來追蹤訊息，解決 DOM 元素與數據數組不對應的問題。
// ----------------------------------------------------------------
(function() {
    console.log('[WX] 載入消息管理模組 V1.3 (Index Patch)...');

    const win = window.parent || window;
    const doc = win.document || document;

    // ============ 狀態管理 ============
    let isMultiSelectMode = false;      
    let selectedMessages = new Set();   

    // ============ 工具函數 ============
    function isApiMode() {
        try {
            const config = localStorage.getItem('wx_phone_api_config');
            if (!config) return false;
            const parsed = JSON.parse(config);
            return parsed.directMode === true;
        } catch (e) { return false; }
    }

    function enterMultiSelectMode() {
        if (!isApiMode()) {
            alert('❌ 刪除功能僅支持 API 模式\n\n酒館模式請在酒館編輯器中刪除消息');
            return false;
        }
        isMultiSelectMode = true;
        selectedMessages.clear();
        updateUI();
        console.log('[MessageManager] 進入多選模式');
        return true;
    }

    function exitMultiSelectMode() {
        isMultiSelectMode = false;
        selectedMessages.clear();
        updateUI();
        console.log('[MessageManager] 退出多選模式');
    }

    function toggleSelectAll() {
        const targetWin = window.parent || window;
        const wxApp = targetWin.wxApp || window.wxApp;
        if (!wxApp) return;

        const activeId = wxApp.GLOBAL_ACTIVE_ID;
        const currentChat = wxApp.GLOBAL_CHATS?.[activeId];
        if (!currentChat || !currentChat.messages) return;

        const totalCount = currentChat.messages.length;

        if (selectedMessages.size === totalCount) {
            selectedMessages.clear();
        } else {
            for (let i = 0; i < totalCount; i++) {
                selectedMessages.add(i);
            }
        }
        updateAllCheckboxes();
        updateHeaderButtons();
    }

    function toggleMessageSelection(messageIndex) {
        if (!isMultiSelectMode) return;
        
        // 轉為整數
        const idx = parseInt(messageIndex);
        if (isNaN(idx)) return;

        if (selectedMessages.has(idx)) {
            selectedMessages.delete(idx);
        } else {
            selectedMessages.add(idx);
        }
        updateAllCheckboxes(); // 更新所有 DOM，因為一個 Index 可能對應多個泡泡
        updateHeaderButtons();
    }

    async function deleteSelectedMessages() {
        if (selectedMessages.size === 0) {
            alert('❌ 請先選擇要刪除的消息');
            return;
        }
        const count = selectedMessages.size;
        if (!confirm(`確定要刪除 ${count} 條消息嗎？\n此操作無法撤銷！`)) return;

        try {
            const targetWin = window.parent || window;
            const wxApp = targetWin.wxApp || window.wxApp;
            const activeId = wxApp.GLOBAL_ACTIVE_ID;
            const currentChat = wxApp.GLOBAL_CHATS?.[activeId];
            
            // 倒序刪除
            const sortedIndices = Array.from(selectedMessages).sort((a, b) => b - a);
            sortedIndices.forEach(index => {
                currentChat.messages.splice(index, 1);
            });

            // 更新預覽
            if (currentChat.messages.length > 0) {
                const lastMsg = currentChat.messages[currentChat.messages.length - 1];
                currentChat.lastPreview = (lastMsg.type === 'msg' && lastMsg.content) 
                    ? (lastMsg.content.substring(0, 30) + (lastMsg.content.length>30?'...':'')) 
                    : '';
            } else {
                currentChat.lastPreview = '';
            }

            // 更新 DB
            const WX_DB = targetWin.WX_DB || window.WX_DB;
            if (WX_DB && typeof WX_DB.saveApiChat === 'function') {
                await WX_DB.saveApiChat(activeId, currentChat);
            }

            currentChat.renderedCount = 0;
            currentChat.pushedCount = 0;
            exitMultiSelectMode();
            if (wxApp && typeof wxApp.render === 'function') wxApp.render();

        } catch (error) {
            console.error('[MessageManager] 刪除失敗:', error);
            alert(`❌ 刪除失敗：${error.message}`);
        }
    }

    async function clearCurrentChat() {
        const targetWin = window.parent || window;
        const wxApp = targetWin.wxApp || window.wxApp;
        if (!isApiMode()) { alert('僅 API 模式支持清空'); return; }
        
        const activeId = wxApp.GLOBAL_ACTIVE_ID;
        if (!activeId) return;
        
        if (!confirm('⚠️ 高能預警\n\n確定要「清空」當前所有聊天記錄嗎？\n此操作絕對無法恢復！')) return;

        const currentChat = wxApp.GLOBAL_CHATS?.[activeId];
        if (currentChat) {
            currentChat.messages = [];
            currentChat.lastPreview = '';
            currentChat.renderedCount = 0;
            currentChat.pushedCount = 0;
            
            const WX_DB = targetWin.WX_DB || window.WX_DB;
            if (WX_DB && typeof WX_DB.saveApiChat === 'function') {
                await WX_DB.saveApiChat(activeId, currentChat);
            }
            wxApp.render();
        }
    }

    function updateUI() {
        const targetWin = window.parent || window;
        const wxApp = targetWin.wxApp || window.wxApp;
        if (!wxApp || !wxApp.APP_CONTAINER) return;

        const roomPage = wxApp.APP_CONTAINER.querySelector('.wx-page-room');
        if (roomPage) {
            if (isMultiSelectMode) roomPage.classList.add('multi-select-mode');
            else roomPage.classList.remove('multi-select-mode');
        }
        updateHeaderButtons();
        updateAllCheckboxes();
    }

    function updateHeaderButtons() {
        const deleteBtn = doc.getElementById('wx-msg-delete-btn');
        const menuBtn = doc.getElementById('wx-msg-menu-btn');
        
        let controlGroup = doc.getElementById('wx-multi-controls');
        const headerRight = doc.querySelector('.wx-header > div:last-child');
        
        if (!controlGroup && headerRight) {
            controlGroup = doc.createElement('div');
            controlGroup.id = 'wx-multi-controls';
            controlGroup.style.display = 'none';
            controlGroup.style.alignItems = 'center';
            controlGroup.style.gap = '8px';
            controlGroup.innerHTML = `
                <div id="wx-btn-cancel-multi" style="font-size:14px; color:#333; cursor:pointer; padding:4px;">取消</div>
                <div id="wx-btn-select-all" style="font-size:14px; color:#333; cursor:pointer; padding:4px;">全選</div>
                <div id="wx-btn-confirm-delete" style="font-size:14px; color:#fa5151; font-weight:bold; cursor:pointer; padding:4px;">刪除</div>
            `;
            headerRight.appendChild(controlGroup);
            
            doc.getElementById('wx-btn-cancel-multi').onclick = (e) => { e.stopPropagation(); exitMultiSelectMode(); };
            doc.getElementById('wx-btn-select-all').onclick = (e) => { e.stopPropagation(); toggleSelectAll(); };
            doc.getElementById('wx-btn-confirm-delete').onclick = (e) => { e.stopPropagation(); deleteSelectedMessages(); };
        }

        const targetWin = window.parent || window;
        const wxApp = targetWin.wxApp || window.wxApp;
        const activeId = wxApp.GLOBAL_ACTIVE_ID;
        const currentChat = wxApp.GLOBAL_CHATS?.[activeId];
        const totalMsg = currentChat ? currentChat.messages.length : 0;
        
        const selectAllBtn = doc.getElementById('wx-btn-select-all');
        const confirmBtn = doc.getElementById('wx-btn-confirm-delete');

        if (isMultiSelectMode) {
            if(deleteBtn) deleteBtn.style.display = 'none';
            if(menuBtn) menuBtn.style.display = 'none';
            if(controlGroup) controlGroup.style.display = 'flex';
            
            if (selectAllBtn) {
                selectAllBtn.innerText = (selectedMessages.size > 0 && selectedMessages.size === totalMsg) ? '全不選' : '全選';
            }
            if (confirmBtn) {
                confirmBtn.innerText = selectedMessages.size > 0 ? `刪除(${selectedMessages.size})` : '刪除';
                confirmBtn.style.opacity = selectedMessages.size > 0 ? '1' : '0.5';
            }

        } else {
            if(deleteBtn) deleteBtn.style.display = 'block';
            if(menuBtn) menuBtn.style.display = 'block';
            if(controlGroup) controlGroup.style.display = 'none';
        }
    }

    // 🔥 [核心修復] 讀取 data-msg-idx
    function updateAllCheckboxes() {
        const targetWin = window.parent || window;
        const wxApp = targetWin.wxApp || window.wxApp;
        if (!wxApp || !wxApp.APP_CONTAINER) return;

        const roomContent = wxApp.APP_CONTAINER.querySelector('#wxRoomContent');
        if (!roomContent) return;

        const allNodes = Array.from(roomContent.children);
        
        allNodes.forEach((node) => {
            // 只處理包含 data-msg-idx 的元素
            if (node.hasAttribute('data-msg-idx')) {
                const msgIdx = parseInt(node.getAttribute('data-msg-idx'));
                updateMessageCheckboxElement(node, msgIdx);
            }
        });
    }

    function updateMessageCheckboxElement(el, messageIndex) {
        let checkbox = el.querySelector('.wx-msg-checkbox');

        if (isMultiSelectMode) {
            if (!checkbox) {
                checkbox = doc.createElement('div');
                checkbox.className = 'wx-msg-checkbox';
                
                if (el.classList.contains('wx-system-notice') || el.classList.contains('wx-time-stamp')) {
                    checkbox.style.position = 'absolute';
                    checkbox.style.left = '10px';
                    checkbox.style.top = '50%';
                    checkbox.style.transform = 'translateY(-50%)';
                    el.style.position = 'relative'; 
                }
                
                checkbox.onclick = (e) => {
                    e.stopPropagation();
                    toggleMessageSelection(messageIndex);
                };
                el.insertBefore(checkbox, el.firstChild);
            }

            if (selectedMessages.has(messageIndex)) {
                checkbox.classList.add('checked');
            } else {
                checkbox.classList.remove('checked');
            }
        } else {
            if (checkbox) checkbox.remove();
        }
    }

    const MessageManager = {
        get isMultiSelectMode() { return isMultiSelectMode; },
        enterMultiSelectMode,
        exitMultiSelectMode,
        deleteSelectedMessages,
        clearCurrentChat, 
        _updateUI: updateUI
    };

    win.WX_MESSAGE_MANAGER = MessageManager;
    if (window !== win) window.WX_MESSAGE_MANAGER = MessageManager;

    console.log('[WX] ✅ 消息管理模組 (Index Patch) 已就緒');
})();