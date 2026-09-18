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

    // preIdx：從長按小窗的「刪除」進來時，那一則先勾好
    function enterMultiSelectMode(preIdx) {
        if (!isApiMode()) {
            AUI.alert('刪除功能僅支持 API 模式\n\n酒館模式請在酒館編輯器中刪除消息');
            return false;
        }
        isMultiSelectMode = true;
        selectedMessages.clear();
        const _p = parseInt(preIdx, 10);
        if (!isNaN(_p)) selectedMessages.add(_p);
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

    // 🚨紅包／禮物／轉帳的「已領取／已接收」狀態存在 localStorage 的頂層，鍵名就是那串 ID
    //   （ID_Gft_999、wx_redpacket_rp_1、wx_transfer_Txn_88）。訊息刪掉了、狀態卻留著，
    //   下次模型又寫同一個 ID——測試腳本會，模型自己也常用固定編號——卡片一出現就是「已接收」。
    //   她實測：清空重試之後，禮物與轉帳直接顯示已接收、已收款。
    //   所以刪訊息的時候，把那幾則帶的 ID 一起清掉。
    function purgeProtocolState(chatId, messages) {
        let n = 0;
        const seen = new Set();
        (messages || []).forEach(m => {
            const text = String((m && (m.content || m.raw)) || '');
            const ids = text.match(/(?:Gft|Gift|rp|RedPacket|Txn|Tnx|Transfer)[_-][A-Za-z0-9_]+/gi) || [];
            ids.forEach(id => {
                if (seen.has(id)) return;
                seen.add(id);
                ['ID_' + id, 'wx_redpacket_' + id, 'wx_transfer_' + id].forEach(k => {
                    try { if (localStorage.getItem(k) !== null) { localStorage.removeItem(k); n++; } } catch (e) {}
                });
            });
        });
        // 帳本那邊也要跟著走（wx_cards.js：一個聊天室一本帳）
        try {
            const C = (window.parent || window).WX_CARDS || window.WX_CARDS;
            if (C && chatId && seen.size) n += C.removeByAliases(chatId, [...seen]);
        } catch (e) {}
        if (n) console.log('[MessageManager] 順手清掉 ' + n + ' 筆紅包/禮物/轉帳狀態');
        return n;
    }

    async function deleteSelectedMessages() {
        if (selectedMessages.size === 0) {
            AUI.alert('請先選擇要刪除的消息');
            return;
        }
        const count = selectedMessages.size;
        if (!await AUI.confirm(`確定要刪除 ${count} 條消息嗎？\n此操作無法撤銷！`)) return;

        try {
            const targetWin = window.parent || window;
            const wxApp = targetWin.wxApp || window.wxApp;
            const activeId = wxApp.GLOBAL_ACTIVE_ID;
            const currentChat = wxApp.GLOBAL_CHATS?.[activeId];
            
            // 倒序刪除。刪掉的那幾則帶的紅包/禮物/轉帳 ID，狀態要跟著走
            const sortedIndices = Array.from(selectedMessages).sort((a, b) => b - a);
            const doomed = sortedIndices.map(i => currentChat.messages[i]).filter(Boolean);
            sortedIndices.forEach(index => {
                currentChat.messages.splice(index, 1);
            });
            purgeProtocolState(activeId, doomed);

            // 更新預覽
            if (currentChat.messages.length > 0) {
                const lastMsg = currentChat.messages[currentChat.messages.length - 1];
                const _pv = String((lastMsg.type === 'msg' && lastMsg.content) || '');
                // 圖片訊息顯示 [圖片]，別把圖庫編號或網址露在聊天列表上
                currentChat.lastPreview = /^\[\s*(?:图片|圖片|照片|Img)\s*[:：]/i.test(_pv) ? '[圖片]'
                    : /^\[\s*(?:TakeoutAsk|外送代付|外賣代付|外卖代付|代付)\s*[:：]/i.test(_pv) ? '[外送代付]'
                    : /^\[\s*(?:Takeout|外送|外賣|外卖)\s*[:：]/i.test(_pv) ? '[外送]'
                    : (_pv.substring(0, 30) + (_pv.length > 30 ? '...' : ''));
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
            AUI.alert(`刪除失敗：${error.message}`);
        }
    }

    async function clearCurrentChat() {
        const targetWin = window.parent || window;
        const wxApp = targetWin.wxApp || window.wxApp;
        if (!isApiMode()) { AUI.alert('僅 API 模式支持清空'); return; }
        
        const activeId = wxApp.GLOBAL_ACTIVE_ID;
        if (!activeId) return;
        
        if (!await AUI.confirm('高能預警\n\n確定要「清空」當前所有聊天記錄嗎？\n此操作絕對無法恢復！')) return;

        const currentChat = wxApp.GLOBAL_CHATS?.[activeId];
        if (currentChat) {
            // 清空＝真的乾淨：舊鍵掃一遍，這一室的帳本整本丟掉
            purgeProtocolState(activeId, currentChat.messages);
            try {
                const C = (targetWin.WX_CARDS || window.WX_CARDS);
                if (C) C.clear(activeId);
            } catch (e) {}
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
        // 輸入列跟聊天室不在同一層，所以「底下換成刪除那一條」掛在整個殼上
        const shell = wxApp.APP_CONTAINER.querySelector('.wx-shell');
        if (shell) shell.classList.toggle('wx-multi-on', isMultiSelectMode);
        updateHeaderButtons();
        updateAllCheckboxes();
    }

    // 多選時底下那一條（取消｜全選｜刪除(n)）。以前這三顆塞在標題列右邊，標題列擠；
    // 現在跟 LINE 一樣放在輸入列的位置，輸入列在多選時藏起來（wx_theme.js .wx-multi-on）。
    function updateHeaderButtons() {
        const targetWin = window.parent || window;
        const wxApp = targetWin.wxApp || window.wxApp;
        const bar = wxApp && wxApp.APP_CONTAINER ? wxApp.APP_CONTAINER.querySelector('#wxMultiBar') : null;
        if (!bar) return;
        const activeId = wxApp.GLOBAL_ACTIVE_ID;
        const currentChat = wxApp.GLOBAL_CHATS?.[activeId];
        const totalMsg = currentChat ? currentChat.messages.length : 0;

        const cancelBtn = bar.querySelector('[data-mm="cancel"]');
        const allBtn = bar.querySelector('[data-mm="all"]');
        const delBtn = bar.querySelector('[data-mm="delete"]');
        if (cancelBtn) cancelBtn.onclick = (e) => { e.stopPropagation(); exitMultiSelectMode(); };
        if (allBtn) allBtn.onclick = (e) => { e.stopPropagation(); toggleSelectAll(); };
        if (delBtn) delBtn.onclick = (e) => { e.stopPropagation(); deleteSelectedMessages(); };

        if (allBtn) allBtn.textContent = (selectedMessages.size > 0 && selectedMessages.size === totalMsg) ? '全不選' : '全選';
        if (delBtn) {
            delBtn.textContent = selectedMessages.size > 0 ? `刪除 (${selectedMessages.size})` : '刪除';
            delBtn.disabled = selectedMessages.size === 0;
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
        toggleSelect: toggleMessageSelection,
        deleteSelectedMessages,
        clearCurrentChat,
        purgeProtocolState,
        _updateUI: updateUI
    };

    win.WX_MESSAGE_MANAGER = MessageManager;
    if (window !== win) window.WX_MESSAGE_MANAGER = MessageManager;

    console.log('[WX] ✅ 消息管理模組 (Index Patch) 已就緒');
})();