// ----------------------------------------------------------------
// [檔案] os_avs_engine.js (V1.0 - AVS 核心引擎，獨立模組)
// 路徑：os_phone/os/os_avs_engine.js
// 職責：AVS 變數系統底層引擎。負責狀態讀寫、快照、<vars> 解析。
//       與 os_api_engine.js、os_avs.js、vn_core.js 完全解耦。
//       升級：支援點記法巢狀路徑、push 陣列指令、中文變數名。
// ----------------------------------------------------------------
(function() {
    console.log('[AVS Engine] 載入 AVS 核心引擎 V1.0...');
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
        localStorage.setItem(_avsKey(), JSON.stringify(state));
        if (win.dispatchEvent) win.dispatchEvent(new CustomEvent('AVS_VARS_UPDATED', { detail: state }));
        console.log('[AVS] 狀態已更新 →', JSON.stringify(state));
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
        localStorage.setItem(skey, JSON.stringify(stack));
    }

    // ================================================================
    // 四、<vars> 解析器（升級版：點記法 + push + 中文支援）
    // ================================================================

    /**
     * 解析並套用 <vars> 內容。
     *
     * 支援格式：
     *   hp -= 10
     *   gold += 500
     *   User.动态日志 push "今天發生了大事"
     *   NPC.王曉明.好感度 += 5
     *   世界.当前时间 = "第4天 早晨"
     *
     * 兼容舊版 JSON 格式：{ "gold": 500 }
     */
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

        const lines = inner.split(/[\n;]+/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
            // 支援中文、點記法路徑；支援 push / += / -= / *= / /= / =
            const m = line.match(/^([^\s\+\-\*\/=]+)\s*(push|\+=|-=|\*=|\/=|=)\s*(.+)$/);
            if (!m) continue;
            const [, path, op, rawVal] = m;

            // 解析值型別
            let parsed;
            const trimmed = rawVal.trim();
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
        }
        _avsWrite(state);
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
            localStorage.setItem(skey, JSON.stringify(stack));
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

    console.log('[AVS Engine] ✅ _AVS_ENGINE 就緒（點記法 + push 已啟用）');
})();
