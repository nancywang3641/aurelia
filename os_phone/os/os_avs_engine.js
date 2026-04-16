// ----------------------------------------------------------------
// [檔案] os_avs_engine.js (V1.3 - AVS 核心引擎，支援行內註解版)
// 路徑：os_phone/os/os_avs_engine.js
// 職責：AVS 變數系統底層引擎。負責狀態讀寫、快照、<vars> 解析。
//       升級：防呆正則表達式、強制儲存錯誤攔截、新增「新故事自動初始化」監聽。
//       V1.3 新增：支援行內註解 (//) 過濾，完美支援 vars_analyze 提示詞。
// ----------------------------------------------------------------
(function() {
    console.log('[AVS Engine] 載入 AVS 核心引擎 V1.3...');
    const win = window.parent || window;

    // ================================================================
    // 一、狀態 Key 管理（按 storyId 分艙）
    // ================================================================

    function _avsKey() {
        const sid = localStorage.getItem('vn_current_story_id') || '';
        return sid ? `avs_state_${sid}` : 'avs_current_state';
    }

    // ================================================================
    // 二、讀寫與廣播
    // ================================================================

    function _avsRead() {
        try { return JSON.parse(localStorage.getItem(_avsKey()) || '{}'); } catch(e) { return {}; }
    }

    function _avsWrite(state) {
        try {
            // 🔥 預防 localStorage 容量滿導致的崩潰
            localStorage.setItem(_avsKey(), JSON.stringify(state));
        } catch(e) {
            console.error('[AVS] 寫入 Storage 失敗 (可能系統空間不足):', e);
        }
        if (win.dispatchEvent) win.dispatchEvent(new CustomEvent('AVS_VARS_UPDATED', { detail: state }));
        console.log('🎲 [AVS] 變數已更新 →', JSON.stringify(state));
    }

    // ================================================================
    // 三、快照棧（最多 10 步，供 reroll 回溯）
    // ================================================================

    function _avsSnapshot(state) {
        const skey = `avs_snap_${_avsKey()}`;
        let stack = [];
        try { stack = JSON.parse(localStorage.getItem(skey) || '[]'); } catch(e) {}
        stack.push({ ts: Date.now(), state: JSON.parse(JSON.stringify(state)) });
        if (stack.length > 10) stack = stack.slice(-10);
        
        try {
            localStorage.setItem(skey, JSON.stringify(stack));
        } catch(e) {
            console.warn('[AVS] 快照儲存失敗，略過備份 (Quota Exceeded)');
        }
    }

    // ================================================================
    // 四、<vars> 解析器（終極防呆升級版 + 註解過濾）
    // ================================================================

    function _avsApplyVars(inner) {
        let state = _avsRead();
        _avsSnapshot(state);

        // 舊版 JSON 格式 fallback
        if (inner.trim().startsWith('{')) {
            try {
                const obj = JSON.parse(inner.trim());
                Object.assign(state, obj);
                _avsWrite(state);
                return;
            } catch(e) {}
        }

        // 🔥 V1.3 核心升級：在切行之後，強制把每一行裡的 "//" 後面的文字全部砍掉
        const lines = inner.split(/[\n;]+/)
            .map(l => l.split('//')[0].trim()) 
            .filter(Boolean);
            
        let updatedCount = 0;

        for (const line of lines) {
            try {
                // 終極容錯正則：支援變數名中含有空白（例如 "User HP"），防止 AI 亂排版
                const m = line.match(/^([^+=*\/;:-]+?)\s*(push|\+=|-=|\*=|\/=|=)\s*(.+)$/i);
                if (!m) {
                    console.warn('[AVS Engine] 無法解析此行變數，略過:', line);
                    continue;
                }
                const path = m[1].trim();
                const op = m[2].trim();
                const rawVal = m[3].trim();

                // 解析值型別
                let parsed;
                const trimmed = rawVal;
                if (trimmed === 'true')       parsed = true;
                else if (trimmed === 'false') parsed = false;
                else if (/^".*"$/.test(trimmed) || /^'.*'$/.test(trimmed)) parsed = trimmed.slice(1, -1);
                else { const n = parseFloat(trimmed); parsed = isNaN(n) ? trimmed : n; }

                // 點記法：走巢狀路徑，不存在則自動建立
                const keys = path.split('.');
                let cur = state;
                for (let i = 0; i < keys.length - 1; i++) {
                    const k = keys[i];
                    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
                    cur = cur[k];
                }
                const lastKey = keys[keys.length - 1];
                const existing = cur[lastKey];
                const curNum = typeof existing === 'number' ? existing : (parseFloat(existing) || 0);
                const parsedNum = typeof parsed === 'number' ? parsed : 0;

                switch (op) {
                    case '=':
                        cur[lastKey] = parsed;
                        break;
                    case 'push':
                        if (!Array.isArray(cur[lastKey])) {
                            cur[lastKey] = cur[lastKey] !== undefined ? [cur[lastKey]] : [];
                        }
                        cur[lastKey].push(parsed);
                        if (cur[lastKey].length > 30) cur[lastKey].shift(); // 最多保留 30 筆
                        break;
                    case '+=':
                        if (Array.isArray(cur[lastKey])) {
                            cur[lastKey].push(parsed);
                            if (cur[lastKey].length > 30) cur[lastKey].shift();
                        } else {
                            cur[lastKey] = typeof parsed === 'string'
                                ? (existing || '') + parsed
                                : curNum + parsedNum;
                        }
                        break;
                    case '-=': cur[lastKey] = curNum - parsedNum; break;
                    case '*=': cur[lastKey] = curNum * parsedNum; break;
                    case '/=': cur[lastKey] = parsedNum !== 0 ? curNum / parsedNum : curNum; break;
                }
                updatedCount++;
            } catch(lineError) {
                console.error(`[AVS Engine] 單行解析崩潰 (${line}):`, lineError);
            }
        }
        
        if (updatedCount > 0) {
            _avsWrite(state);
        } else {
            console.warn('[AVS Engine] 未發現有效的變數更新');
        }
    }

    // ================================================================
    // 五、公開 API（掛載到 window._AVS_ENGINE）
    // ================================================================

    win._AVS_ENGINE = {
        /** 取當前故事的 localStorage key */
        getKey: _avsKey,

        /** 讀取當前故事狀態物件 */
        read: _avsRead,

        /** 寫入狀態並廣播 AVS_VARS_UPDATED */
        write: _avsWrite,

        /** 存快照（AI 回覆前呼叫） */
        snapshot: _avsSnapshot,

        /** 解析並套用 <vars> 文字 */
        apply: _avsApplyVars,

        /** 還原上一個快照（reroll 時呼叫） */
        restore: function() {
            const skey = `avs_snap_${_avsKey()}`;
            let stack = [];
            try { stack = JSON.parse(localStorage.getItem(skey) || '[]'); } catch(e) {}
            if (!stack.length) return null;
            const prev = stack.pop();
            try { localStorage.setItem(skey, JSON.stringify(stack)); } catch(e){}
            _avsWrite(prev.state);
            return prev.state;
        },

        /** 以變數包預設值初始化當前故事狀態 */
        initFromPack: function(pack) {
            if (!pack || !Array.isArray(pack.variables)) return;
            const state = {};
            pack.variables.forEach(v => {
                const n = parseFloat(v.defaultValue);
                state[v.name] = isNaN(n) ? (v.defaultValue || '') : n;
            });
            _avsWrite(state);
            localStorage.removeItem(`avs_snap_${_avsKey()}`);
            console.log(`[AVS] 以變數包 "${pack.name}" 初始化故事狀態`);
        }
    };

    // ================================================================
    // 六、自動化生命週期監聽 (修復：新劇情未初始化變數的 Bug)
    // ================================================================
    if (win.addEventListener) {
        win.addEventListener('VN_STORY_STARTED', async (e) => {
            console.log('[AVS Engine] 偵測到新故事啟動，準備執行自動初始化...');
            try {
                const payload = e.detail || {};
                let targetPackId = payload.packId;
                
                // 如果 payload 沒有直接提供 packId，我們就去查當前啟用的「展廳模板」綁定了哪個包
                if (!targetPackId && win.OS_DB && typeof win.OS_DB.getAllUITemplates === 'function') {
                    const tpls = await win.OS_DB.getAllUITemplates();
                    const activeTpl = tpls.find(t => t.isActive);
                    if (activeTpl) targetPackId = activeTpl.packId;
                }

                // 找到對應的包後，調用 initFromPack 塞入初始值
                if (targetPackId && win.OS_DB && typeof win.OS_DB.getAllVarPacks === 'function') {
                    const packs = await win.OS_DB.getAllVarPacks();
                    const pack = packs.find(p => p.id === targetPackId);
                    if (pack) {
                        win._AVS_ENGINE.initFromPack(pack);
                        console.log(`[AVS Engine] ✅ 已在新劇情自動載入變數預設值: ${pack.name}`);
                    } else {
                        console.warn(`[AVS Engine] 找不到 ID 為 ${targetPackId} 的變數包`);
                    }
                } else {
                    console.log('[AVS Engine] ⚠️ 無明確綁定的變數包，跳過自動初始化。');
                }
            } catch (err) {
                console.error('[AVS Engine] 自動初始化發生錯誤:', err);
            }
        });
    }

    console.log('[AVS Engine] ✅ _AVS_ENGINE 就緒（支援行內註解與自動初始化）');
})();