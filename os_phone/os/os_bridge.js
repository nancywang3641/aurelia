// ----------------------------------------------------------------
// [檔案] os_bridge.js (V1.2 - 無ID動態綁定支援版)
// 路徑：os_phone/os/os_bridge.js
// 職責：VN 跑團 ↔ 面板連接橋 (SessionEnd 路由器)
//
// 工作原理：
//   1. 監聽 tavern_events.MESSAGE_RECEIVED (TavernAI 每次 AI 回應後觸發)
//   2. 從回應中偵測 [SessionEnd|...] 標籤 (支援省略 ID 的新格式)
//   3. 直接強制綁定當前的 _activeSession 進行路由，忽略 AI 容易出錯的 ID
//
// 面板啟動跑團前必須先呼叫 OS_BRIDGE.startSession(entityId, label)
// ----------------------------------------------------------------
(function () {
    console.log('[OS_BRIDGE] 面板橋接器 V1.2 載入中...');
    const win = window.parent || window;

    // ================================================================
    // 1. 活躍 Session 登記表
    // ================================================================
    let _activeSession = null;
    // Shape: { id: 'child_1234567890', label: '小明出遊', panelType: 'child', startTime: 1234 }

    // ================================================================
    // 2. 面板路由表  (id 前綴 → 對應的面板 window 物件)
    // ================================================================
    const PANEL_MAP = {
        'child': () => win.CHILD_CORE,
        'pet':   () => win.PET_HOME,
        'quest': () => win.QB_CORE,
        'case':  () => win.INV_CORE,
    };

    // ================================================================
    // 3. SessionEnd 解析器
    // ================================================================
    // 支援以下格式：
    // 新版格式：[SessionEnd|勘查結果摘要]
    // 舊版格式：[SessionEnd|child_001|摘要文字]
    // 完整格式：[SessionEnd|quest_003|結果摘要|complete]
    function parseSessionEnd(text) {
        const match = text.match(/\[SessionEnd\|([^\]]+)\]/);
        if (!match) return null;
        
        const parts = match[1].split('|').map(s => s.trim());
        let summary = '';
        let status = null;

        if (parts.length === 1) {
            // [SessionEnd|摘要文字]
            summary = parts[0];
        } else if (parts.length === 2) {
            // 可能是 [SessionEnd|ID|摘要文字]
            // 簡單判斷第一段是不是常見的 ID 前綴
            const knownPrefixes = ['child', 'pet', 'quest', 'case'];
            const looksLikeId = knownPrefixes.some(p => parts[0].startsWith(p)) || parts[0] === 'case';
            
            if (looksLikeId) {
                summary = parts[1];
            } else {
                // 如果不像 ID，可能 AI 擅自在摘要裡加了 '|' 符號
                summary = parts.join('|');
            }
        } else if (parts.length >= 3) {
            // [SessionEnd|ID|結果摘要|complete]
            summary = parts[1];
            status = parts[2];
        }

        return {
            summary: summary,
            status: status
        };
    }

    // ================================================================
    // 4. MESSAGE_RECEIVED 處理器
    // ================================================================
    async function onMessageReceived(message_id) {
        // 沒有活躍 session → 不需要處理
        if (!_activeSession) return;

        const helper = win.TavernHelper;
        if (!helper || typeof helper.getChatMessages !== 'function') return;

        try {
            const msgs = await helper.getChatMessages(message_id);
            if (!msgs || msgs.length === 0) return;

            const text = msgs[0].message || msgs[0].mes || msgs[0].content || '';

            // 快速過濾：不含 [SessionEnd| 就不處理
            if (!text.includes('[SessionEnd|')) return;

            const sessionData = parseSessionEnd(text);
            if (!sessionData) return;

            // 🔥 核心修正：完全不再信任 AI 輸出的 ID，直接強制綁定我們系統記憶的 _activeSession
            const sessionEnd = {
                id: _activeSession.id,
                panelType: _activeSession.panelType,
                summary: sessionData.summary,
                status: sessionData.status
            };

            console.log(
                `[OS_BRIDGE] ✅ 偵測到 SessionEnd 並已自動綁定 → id="${sessionEnd.id}", ` +
                `type="${sessionEnd.panelType}", status="${sessionEnd.status}", ` +
                `summary="${sessionEnd.summary.slice(0, 30)}..."`
            );

            // 路由到對應面板
            const getPanelFn = PANEL_MAP[sessionEnd.panelType];
            if (!getPanelFn) {
                console.warn(`[OS_BRIDGE] ❌ 未知面板類型: "${sessionEnd.panelType}"`);
                _activeSession = null;
                return;
            }

            const panelCore = getPanelFn();
            if (!panelCore || typeof panelCore.resolveSession !== 'function') {
                console.warn(`[OS_BRIDGE] ❌ "${sessionEnd.panelType}" 面板不存在或缺少 resolveSession()`);
                _activeSession = null;
                return;
            }

            // 清除 session 登記，避免重複觸發
            const session = { ..._activeSession };
            _activeSession = null;

            // 延遲 800ms：讓 vn_core.js 先完成最後一幕的渲染
            setTimeout(() => {
                console.log(`[OS_BRIDGE] 🔁 呼叫 ${sessionEnd.panelType}.resolveSession("${session.id}")`);
                try {
                    // 將完整的回應文本(text)作為第四個參數傳入，讓後端可以解析可能存在的其他標籤
                    panelCore.resolveSession(session.id, sessionEnd.summary, sessionEnd.status, text);
                } catch (e) {
                    console.error(`[OS_BRIDGE] resolveSession 執行錯誤`, e);
                }
            }, 800);

        } catch (e) {
            console.error('[OS_BRIDGE] onMessageReceived 錯誤', e);
        }
    }

    // ================================================================
    // 5. 掛載 MESSAGE_RECEIVED 事件監聽
    //    使用輪詢等待 eventOn / tavern_events 就緒（部分面板在 TavernHelper 初始化前載入）
    // ================================================================
    function mountListener() {
        if (typeof window.eventOn === 'function' && typeof window.tavern_events !== 'undefined') {
            window.eventOn(window.tavern_events.MESSAGE_RECEIVED, onMessageReceived);
            console.log('[OS_BRIDGE] ✅ MESSAGE_RECEIVED 監聽已就緒');
        } else {
            setTimeout(mountListener, 500);
        }
    }
    mountListener();

    // ================================================================
    // 6. 公開 API
    // ================================================================
    win.OS_BRIDGE = {
        /**
         * 面板在啟動 TavernAI 跑團前必須呼叫此函數，登記活躍 session。
         *
         * @param {string} entityId - 格式: '{panelType}_{timestamp}'
         * 例: 'child_1234567890' / 'quest_9876543210' / 'case_17123456'
         * @param {string} [label]  - 人類可讀標籤，僅用於 log。例: '小明出遊'
         *
         * @example
         * win.OS_BRIDGE.startSession(child.id, child.name + '出遊');
         * await win.TavernHelper.createChatMessages([...], { refresh: 'affected' });
         */
        startSession(entityId, label) {
            _activeSession = {
                id:        entityId,
                label:     label || entityId,
                panelType: entityId.split('_')[0],
                startTime: Date.now()
            };
            console.log(`[OS_BRIDGE] 📌 Session 登記: "${entityId}" (${label || '-'})`);
        },

        /**
         * 強制清除活躍 session。
         * 用戶中途返回首頁 / 異常退出時呼叫，避免殘留 session 污染下次跑團。
         */
        clearSession() {
            if (_activeSession) {
                console.log(`[OS_BRIDGE] 🗑 強制清除 Session: "${_activeSession.id}"`);
            }
            _activeSession = null;
        },

        /**
         * 查詢當前活躍的 session（唯讀快照）。
         * @returns {{ id, label, panelType, startTime } | null}
         */
        getActiveSession() {
            return _activeSession ? { ..._activeSession } : null;
        }
    };

    console.log('[OS_BRIDGE] 就緒');
})();