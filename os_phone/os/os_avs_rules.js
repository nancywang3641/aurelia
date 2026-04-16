// ----------------------------------------------------------------
// [檔案] os_avs_rules.js (V1.0 - AVS 條件注入引擎)
// 路徑：os_phone/os/os_avs_rules.js
// 職責：根據 AVS 變數狀態，動態決定注入哪些行為規範條目到 prompt。
//       完全獨立模組，不依賴其他 AVS 檔案以外的邏輯。
//
// 規則結構：
//   { id, name, enabled, path, op, value, content, priority }
//   path    : AVS 變數路徑，支援點記法（如 NPC.王小明.好感度）
//   op      : = | != | > | < | >= | <=
//   value   : 比較值（數字或字串）
//   content : 條件成立時注入的文字
//   priority: 注入順序（小的先，預設 50）
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const LSKEY = 'avs_condition_rules';

    // ================================================================
    // 一、資料存取
    // ================================================================

    function _loadRules() {
        try { return JSON.parse(localStorage.getItem(LSKEY) || '[]'); } catch(e) { return []; }
    }

    function _saveRules(rules) {
        localStorage.setItem(LSKEY, JSON.stringify(rules));
    }

    function _newId() {
        return 'avsr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    }

    // ================================================================
    // 二、條件求值
    // ================================================================

    /** 從巢狀物件按點記法取值 */
    function _getVal(state, path) {
        const keys = path.split('.');
        let cur = state;
        for (const k of keys) {
            if (cur == null || typeof cur !== 'object') return undefined;
            cur = cur[k];
        }
        return cur;
    }

    /** 判斷單條規則是否成立 */
    function _evalRule(rule, state) {
        const actual = _getVal(state, rule.path);
        if (actual === undefined) return false;

        const expected = rule.value;
        const aNum = parseFloat(actual),  eNum = parseFloat(expected);
        const bothNum = !isNaN(aNum) && !isNaN(eNum);

        switch (rule.op) {
            case '=':  case '==':
                return bothNum ? aNum === eNum : String(actual) === String(expected);
            case '!=':
                return bothNum ? aNum !== eNum : String(actual) !== String(expected);
            case '>':  return bothNum && aNum >  eNum;
            case '<':  return bothNum && aNum <  eNum;
            case '>=': return bothNum && aNum >= eNum;
            case '<=': return bothNum && aNum <= eNum;
            default:   return false;
        }
    }

    // ================================================================
    // 三、公開 API
    // ================================================================

    /**
     * 根據當前 AVS 狀態，回傳所有符合條件的規則內容合併字串。
     * 只評估：全局規則（無 worldId）＋ 當前世界的規則（worldId 匹配）
     * 供 os_api_engine.js buildContext 呼叫。
     */
    function getActiveContext(state) {
        if (!state || typeof state !== 'object') return '';
        const currentWorldId = localStorage.getItem('vn_current_world_id') || '';
        const rules = _loadRules().filter(r => {
            if (r.enabled === false) return false;
            // 無 worldId = 全局規則，永遠參與評估
            if (!r.worldId) return true;
            // 有 worldId = 只在對應世界生效
            return r.worldId === currentWorldId;
        });
        const matched = rules
            .filter(r => r.path && r.op && r.content && _evalRule(r, state))
            .sort((a, b) => (a.priority || 50) - (b.priority || 50));
        if (!matched.length) return '';
        const body = matched
            .map(r => `【${r.name || r.path}】\n${r.content}`)
            .join('\n\n');
        return `<behavior_rules>\n以下行為規範當前生效，請在回應中嚴格遵循，不要在 <content> 中提及規則本身：\n\n${body}\n</behavior_rules>`;
    }

    /**
     * 根據世界觀描述和變數列表，由 AI 自動生成條件規則。
     * 供 qb_core.js createCustomWorld 呼叫。
     */
    async function generateRulesForWorld({ worldId, worldTitle, worldDesc, variables, callApi }) {
        if (!callApi || !worldId || !variables?.length) return 0;
        try {
            const varList = variables.map(v => `${v.name} (預設:${v.defaultValue})`).join('、');
            const prompt = `這是一個世界觀：「${worldDesc}」
已追蹤的變數有：${varList}

請根據這些變數，設計 3～6 條「當變數達到某個值時，AI 應如何調整行為」的規則。

輸出格式（每行一條，嚴格遵守，不要多餘文字）：
名稱 | 變數名 | 運算子 | 比較值 | 行為說明

規則：
- 運算子只能用：>= <= > < = !=
- 行為說明用繁體中文，30字以內，純文字，描述 AI 在此條件下的行為傾向
- 絕對不能使用任何 Markdown 符號（**、*、#、反引號、> 等全部禁止）
- 名稱用純文字，不加任何標點修飾

範例：
親密好感 | 好感度 | >= | 80 | 角色對你非常親密，主動拉近距離，語氣溫柔
危急狀態 | hp | <= | 20 | 角色處於瀕死狀態，行動受限，語氣虛弱`;

            const raw = await callApi('general_assistant', prompt) || '';
            const newRules = [];
            raw.split('\n').forEach(line => {
                const parts = line.split('|').map(s => s.trim());
                if (parts.length < 5) return;
                const [name, path, op, rawVal, content] = parts;
                if (!path || !op || !content) return;
                const n = parseFloat(rawVal);
                newRules.push({
                    id:      _newId(),
                    worldId,
                    name:    _stripMd(name || path),   // 清除 Markdown
                    enabled: true,
                    path:    _stripMd(path).trim(),
                    op:      op.trim(),
                    value:   isNaN(n) ? _stripMd(rawVal) : n,
                    content: _stripMd(content),         // 清除 Markdown
                    priority: 50
                });
            });

            if (newRules.length > 0) {
                const existing = _loadRules();
                _saveRules([...existing, ...newRules]);
                console.log(`[AVS Rules] 自動生成 ${newRules.length} 條規則（世界：${worldTitle}）`);
            }
            return newRules.length;
        } catch(e) {
            console.warn('[AVS Rules] 自動生成規則失敗:', e);
            return 0;
        }
    }

    // ================================================================
    // 四、UI（渲染到 AVS App 的「條件規則」tab）
    // ================================================================

    const CSS = `
    .avsr-list { display:flex; flex-direction:column; gap:4px; }

    /* 世界分組標頭 */
    .avsr-group-header {
        display:flex; align-items:center; gap:8px;
        padding:8px 12px; margin-top:6px;
        background:rgba(0,0,0,0.3); border-radius:6px;
        cursor:pointer; user-select:none;
        border:1px solid rgba(212,175,55,0.15);
        transition:background 0.15s; }
    .avsr-group-header:hover { background:rgba(212,175,55,0.08); }
    .avsr-group-arrow { font-size:10px; color:#888; flex-shrink:0; width:12px; }
    .avsr-group-title { flex:1; font-size:12px; font-weight:600; color:#c8a030; letter-spacing:1px; }
    .avsr-group-count { font-size:10px; color:#555;
        background:rgba(255,255,255,0.06); padding:1px 7px; border-radius:10px; }
    .avsr-group-body { display:flex; flex-direction:column; gap:6px;
        padding:6px 0 6px 10px; border-left:2px solid rgba(212,175,55,0.12); margin-left:6px; }

    /* 規則卡片 */
    .avsr-card { background:rgba(212,175,55,0.06); border:1px solid rgba(212,175,55,0.2);
        border-radius:8px; padding:12px 14px; display:flex; align-items:flex-start; gap:10px; }
    .avsr-card.disabled { opacity:0.45; }
    .avsr-info { flex:1; min-width:0; }
    .avsr-name { font-size:13px; font-weight:600; color:#d4af37; margin-bottom:4px;
        display:flex; align-items:center; flex-wrap:wrap; gap:4px; }
    .avsr-cond { font-size:11px; color:#888; font-family:monospace; margin-bottom:4px; }
    .avsr-preview { font-size:11px; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .avsr-actions { display:flex; gap:4px; flex-shrink:0; }
    .avsr-btn-sm { background:none; border:1px solid rgba(212,175,55,0.25); color:#888;
        font-size:11px; padding:3px 8px; border-radius:4px; cursor:pointer; }
    .avsr-btn-sm:hover { color:#d4af37; border-color:#d4af37; }
    .avsr-btn-sm.danger:hover { color:#e74c3c; border-color:#e74c3c; }
    .avsr-toggle { cursor:pointer; font-size:18px; flex-shrink:0; user-select:none; }
    .avsr-empty { padding:40px 0; text-align:center; color:#555; font-size:12px; }
    .avsr-folder-tag { font-size:9px; color:#7fb3d3;
        background:rgba(127,179,211,0.12); border:1px solid rgba(127,179,211,0.25);
        padding:1px 6px; border-radius:3px; font-weight:400; }


    /* 編輯面板 (修正壓扁問題，改為全域浮動視窗) */
    .avsr-editor { 
        position: fixed; 
        top: calc(115px + env(safe-area-inset-top, 0px)); 
        bottom: calc(90px + env(safe-area-inset-bottom, 0px)); /* 👈 拉高距離避開底部導覽列 */
        left: 15px; 
        right: 15px; 
        background: rgba(26, 13, 10, 0.98); 
        border: 1px solid rgba(251, 223, 162, 0.4);
        border-radius: 8px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.8);
        z-index: 9999; 
        display: flex; 
        flex-direction: column; 
        overflow: hidden; 
    }
        z-index:100; display:flex; flex-direction:column; overflow:hidden; }
    .avsr-editor.hidden { display:none; }
    .avsr-editor-header { display:flex; align-items:center; padding:12px 14px;
        border-bottom:1px solid rgba(212,175,55,0.2); gap:8px; }
    .avsr-editor-title { flex:1; font-size:14px; font-weight:600; color:#d4af37; }
    .avsr-editor-body { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:12px; }
    .avsr-field label { display:block; font-size:11px; color:#888; margin-bottom:4px; letter-spacing:.3px; }
    .avsr-field input, .avsr-field select, .avsr-field textarea {
        width:100%; background:rgba(0,0,0,0.4); border:1px solid rgba(212,175,55,0.25);
        border-radius:6px; color:#e0d0a0; font-size:13px; padding:8px 10px;
        box-sizing:border-box; outline:none; font-family:inherit; }
    .avsr-field input:focus, .avsr-field select:focus, .avsr-field textarea:focus {
        border-color:#d4af37; }
    .avsr-field textarea { resize:vertical; min-height:100px; }
    .avsr-cond-row { display:flex; gap:8px; align-items:center; }
    .avsr-cond-row input { flex:1; }
    .avsr-cond-row select { width:72px; flex-shrink:0; }
    .avsr-editor-footer { padding:12px 14px; border-top:1px solid rgba(212,175,55,0.2);
        display:flex; gap:8px; }
    .avsr-btn-save { flex:1; background:#d4af37; border:none; color:#1a1200;
        font-size:13px; font-weight:700; padding:10px; border-radius:6px; cursor:pointer; }
    .avsr-btn-cancel { background:none; border:1px solid rgba(212,175,55,0.3); color:#888;
        font-size:13px; padding:10px 16px; border-radius:6px; cursor:pointer; }
    .avsr-add-btn { width:100%; padding:10px; border:1px dashed rgba(212,175,55,0.3);
        background:none; color:#888; font-size:12px; border-radius:6px; cursor:pointer;
        margin-bottom:12px; }
    .avsr-add-btn:hover { color:#d4af37; border-color:#d4af37; }

    /* ── 模式 tab ── */
    .avsm-status { display:flex; align-items:center; gap:8px; padding:10px 14px;
        background:rgba(0,0,0,0.3); border-radius:8px; margin-bottom:10px;
        border:1px solid rgba(212,175,55,0.2); }
    .avsm-status-label { font-size:11px; color:#888; letter-spacing:1px; }
    .avsm-status-value { font-size:14px; font-weight:700; color:#d4af37; }
    .avsm-status-raw { margin-left:auto; font-family:monospace; font-size:10px; color:#555; }
    .avsm-hint { font-size:11px; color:#666; margin-bottom:12px; line-height:1.7; }
    .avsm-hint code { color:#a08040; font-size:10px; background:rgba(0,0,0,0.3);
        padding:1px 5px; border-radius:3px; }
    .avsm-list { display:flex; flex-direction:column; gap:8px; }
    .avsm-card { background:rgba(212,175,55,0.06); border:1px solid rgba(212,175,55,0.2);
        border-radius:8px; padding:12px 14px; display:flex; align-items:flex-start; gap:10px; }
    .avsm-card.active-mode { border-color:rgba(212,175,55,0.65);
        background:rgba(212,175,55,0.12); box-shadow:0 0 10px rgba(212,175,55,0.1); }
    .avsm-card.disabled { opacity:0.45; }
    .avsm-icon { font-size:24px; flex-shrink:0; line-height:1; padding-top:2px; }
    .avsm-info { flex:1; min-width:0; }
    .avsm-name { font-size:13px; font-weight:600; color:#d4af37; margin-bottom:3px;
        display:flex; align-items:center; flex-wrap:wrap; gap:5px; }
    .avsm-cond { font-size:11px; color:#888; font-family:monospace; margin-bottom:3px; }
    .avsm-preview { font-size:11px; color:#555; white-space:nowrap;
        overflow:hidden; text-overflow:ellipsis; }
    .avsm-tag-on { font-size:9px; color:#4caf50; background:rgba(76,175,80,0.15);
        border:1px solid rgba(76,175,80,0.3); padding:1px 6px; border-radius:3px; }
    .avsm-tag-off { font-size:9px; color:#666; background:rgba(100,100,100,0.1);
        border:1px solid rgba(100,100,100,0.2); padding:1px 6px; border-radius:3px; }
    `;

    function renderTab(container) {
        // 注入樣式（只注一次）
        if (!document.getElementById('avsr-styles')) {
            const s = document.createElement('style');
            s.id = 'avsr-styles';
            s.textContent = CSS;
            document.head.appendChild(s);
        }

        const el = container.querySelector('#avs-view-rules');
        console.log('[AVSR] renderTab 呼叫, #avs-view-rules:', el ? '找到' : '❌ 找不到');
        if (!el) return;
        el.style.position = 'relative';
        el.style.overflow = 'hidden';

        _renderList(el);
    }

    function _renderList(el) {
        try { _renderListInner(el); }
        catch(e) {
            console.error('[AVSR] ❌ _renderList 崩潰:', e.message, e.stack);
            el.innerHTML = `<div style="padding:20px;color:#e74c3c;font-size:12px;">
                ⚠️ 條件規則渲染錯誤<br><code style="font-size:10px;">${e.message}</code>
            </div>`;
        }
    }

    function _renderListInner(el) {
        // 模式規則（folder === '__mode__'）由 🎭 模式 tab 管理，此處隱藏
        const rules = _loadRules().filter(r => r.folder !== '__mode__');
        console.log('[AVSR] _renderList 規則數:', rules.length, 'localStorage 原始長度:', (localStorage.getItem('avs_condition_rules') || '').length);

        // ── 建立世界 ID → 標題 對照表 ─────────────────────────
        const worldMap = {};
        try {
            Object.values(win.AURELIA_WORLDS || {}).forEach(w => { worldMap[w.id] = w.title; });
            (win.AURELIA_CUSTOM_WORLDS || []).forEach(w => { worldMap[w.id] = w.title; });
        } catch(e) {}

        // ── 按 worldId 分組 ────────────────────────────────────
        const groups = {};
        rules.forEach(r => {
            const key = r.worldId || '__global__';
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });
        // 排序：全局優先，其餘按世界名
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            if (a === '__global__') return -1;
            if (b === '__global__') return 1;
            return String(worldMap[a] || a).localeCompare(String(worldMap[b] || b));
        });

        // ── 折疊狀態 ───────────────────────────────────────────
        let collapsed = {};
        try { collapsed = JSON.parse(localStorage.getItem('avsr_collapsed') || '{}'); } catch(e) {}

        // ── 渲染單條規則卡片 ──────────────────────────────────
        const _cardHtml = (r) => {
            const condStr = `${r.path} ${r.op} ${r.value}`;
            const preview = (r.content || '').slice(0, 40) + ((r.content||'').length > 40 ? '…' : '');
            const folderTag = r.folder
                ? `<span class="avsr-folder-tag">📁 ${_esc(r.folder)}</span>` : '';
            return `<div class="avsr-card${r.enabled === false ? ' disabled' : ''}" data-id="${r.id}">
                <span class="avsr-toggle" data-toggle="${r.id}">${r.enabled === false ? '○' : '●'}</span>
                <div class="avsr-info">
                    <div class="avsr-name">${_esc(r.name || '未命名規則')}${folderTag}</div>
                    <div class="avsr-cond">${_esc(condStr)}</div>
                    <div class="avsr-preview">${_esc(preview)}</div>
                </div>
                <div class="avsr-actions">
                    <button class="avsr-btn-sm" data-edit="${r.id}">編輯</button>
                    <button class="avsr-btn-sm danger" data-del="${r.id}">✕</button>
                </div>
            </div>`;
        };

        // ── 渲染分組列表 ──────────────────────────────────────
        let listHtml = '';
        if (rules.length === 0) {
            listHtml = `<div class="avsr-empty">尚無條件規則<br>
                <span style="font-size:11px;color:#444;">新增後，當 AVS 變數達到條件時自動注入對應文字給 AI</span></div>`;
        } else {
            sortedKeys.forEach(key => {
                const groupRules = groups[key];
                const isGlobal   = key === '__global__';
                const title      = isGlobal ? '全局規則' : (worldMap[key] || `世界 ${key.slice(-6)}`);
                const icon       = isGlobal ? '🌐' : '📖';
                const isCollapsed = !!collapsed[key];
                listHtml += `
                <div class="avsr-group">
                    <div class="avsr-group-header" data-collapse="${_esc(key)}">
                        <span class="avsr-group-arrow">${isCollapsed ? '▶' : '▼'}</span>
                        <span class="avsr-group-title">${icon} ${_esc(title)}</span>
                        <span class="avsr-group-count">${groupRules.length}</span>
                        <button class="avsr-btn-sm danger avsr-del-group"
                            data-del-group="${_esc(key)}"
                            style="margin-left:auto;font-size:10px;padding:2px 8px;"
                            title="刪除此群組所有規則">🗑 全刪</button>
                    </div>
                    <div class="avsr-group-body" style="display:${isCollapsed ? 'none' : 'flex'}">
                        ${groupRules.map(_cardHtml).join('')}
                    </div>
                </div>`;
            });
        }

        el.innerHTML = `
            <button class="avsr-add-btn" id="avsr-add">＋ 新增條件規則</button>
            <div class="avsr-list">${listHtml}</div>
            <div class="avsr-editor hidden" id="avsr-editor"></div>
        `;

        // 摺疊切換（點標題列展開/收合，排除刪除按鈕的點擊）
        el.querySelectorAll('[data-collapse]').forEach(hdr => {
            hdr.onclick = (e) => {
                if (e.target.closest('.avsr-del-group')) return; // 點刪除按鈕不觸發折疊
                const key = hdr.dataset.collapse;
                collapsed[key] = !collapsed[key];
                try { localStorage.setItem('avsr_collapsed', JSON.stringify(collapsed)); } catch(e) {}
                _renderList(el);
            };
        });

        // 群組整批刪除
        el.querySelectorAll('.avsr-del-group').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const key   = btn.dataset.delGroup;
                const title = btn.closest('.avsr-group')?.querySelector('.avsr-group-title')?.textContent || key;
                if (!confirm(`刪除「${title}」的所有規則？此操作無法復原。`)) return;
                const remaining = _loadRules().filter(r => (r.worldId || '__global__') !== key);
                _saveRules(remaining);
                // 清除該群組的折疊狀態
                delete collapsed[key];
                try { localStorage.setItem('avsr_collapsed', JSON.stringify(collapsed)); } catch(e) {}
                _renderList(el);
            };
        });

        // 事件綁定
        el.querySelector('#avsr-add').onclick = () => _openEditor(el, null);

        el.querySelectorAll('[data-toggle]').forEach(btn => {
            btn.onclick = () => {
                const rules2 = _loadRules();
                const r = rules2.find(x => x.id === btn.dataset.toggle);
                if (r) { r.enabled = r.enabled === false ? true : false; _saveRules(rules2); _renderList(el); }
            };
        });

        el.querySelectorAll('[data-edit]').forEach(btn => {
            btn.onclick = () => {
                const rules2 = _loadRules();
                _openEditor(el, rules2.find(x => x.id === btn.dataset.edit) || null);
            };
        });

        el.querySelectorAll('[data-del]').forEach(btn => {
            btn.onclick = () => {
                if (!confirm('刪除這條規則？')) return;
                const rules2 = _loadRules().filter(x => x.id !== btn.dataset.del);
                _saveRules(rules2);
                _renderList(el);
            };
        });
    }

    async function _openEditor(el, rule) {
        const editor = el.querySelector('#avsr-editor');
        if (!editor) return;
        const isNew = !rule;
        rule = rule || { id: _newId(), name: '', enabled: true, path: '', op: '>=', value: '', content: '', priority: 50 };

        // 載入所有變數包，收集變數名稱（含所屬包名）
        let varOptions = [];
        try {
            const packs = await win.OS_DB?.getAllVarPacks?.() || [];
            packs.forEach(pack => {
                (pack.variables || []).forEach(v => {
                    if (v.name) varOptions.push({ path: v.name, pack: pack.name, defaultVal: v.defaultValue ?? '' });
                });
            });
        } catch(e) {}

        // 補充：當前故事狀態裡有但不在任何包裡的變數（點記法動態產生的）
        try {
            const state = win._AVS_ENGINE?.read?.() || {};
            const flatten = (obj, prefix = '') => {
                Object.entries(obj).forEach(([k, v]) => {
                    const full = prefix ? `${prefix}.${k}` : k;
                    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                        flatten(v, full);
                    } else {
                        if (!varOptions.find(o => o.path === full)) {
                            varOptions.push({ path: full, pack: '當前狀態', defaultVal: v });
                        }
                    }
                });
            };
            flatten(state);
        } catch(e) {}

        // 建立 datalist
        const datalistId = 'avsr-path-list';
        const datalistHtml = `<datalist id="${datalistId}">
            ${varOptions.map(o => `<option value="${_esc(o.path)}" label="${_esc(o.pack)}（預設：${_esc(String(o.defaultVal))}）">`).join('')}
        </datalist>`;

        // 依包名分組顯示的提示文字
        const packGroups = {};
        varOptions.forEach(o => {
            if (!packGroups[o.pack]) packGroups[o.pack] = [];
            packGroups[o.pack].push(o);
        });
        const hintHtml = varOptions.length > 0
            ? `<div style="margin-top:6px;font-size:10px;color:#555;line-height:1.8;">
                ${Object.entries(packGroups).map(([pack, vars]) =>
                    `<span style="color:#888;">${_esc(pack)}：</span>${vars.map(v => `<span style="color:#d4af37;margin-right:8px;cursor:pointer;" data-pick="${_esc(v.path)}">${_esc(v.path)}</span>`).join('')}<br>`
                ).join('')}
               </div>`
            : `<div style="margin-top:6px;font-size:10px;color:#444;">尚無變數包，可手動輸入路徑</div>`;

        editor.className = 'avsr-editor';
        editor.innerHTML = `
            ${datalistHtml}
            <div class="avsr-editor-header">
                <span class="avsr-editor-title">${isNew ? '新增條件規則' : '編輯規則'}</span>
            </div>
            <div class="avsr-editor-body">
                <div class="avsr-field">
                    <label>規則名稱（備忘用）</label>
                    <input class="avs-input" id="avsr-f-name" placeholder="例：王小明 親密行為" value="${_esc(rule.name || '')}">
                </div>
                <div class="avsr-field">
                    <label>觸發條件</label>
                    <div class="avsr-cond-row">
                        <input class="avs-input" id="avsr-f-path" list="${datalistId}"
                            placeholder="點選或手動輸入變數路徑"
                            value="${_esc(rule.path || '')}"
                            autocomplete="off">
                        <select class="avs-select" id="avsr-f-op" style="padding:10px;">
                            ${['>=','<=','>','<','=','!='].map(o => `<option${o===rule.op?' selected':''}>${o}</option>`).join('')}
                        </select>
                        <input class="avs-input" id="avsr-f-val" placeholder="值" value="${_esc(String(rule.value ?? ''))}">
                    </div>
                    ${hintHtml}
                </div>
                <div class="avsr-field">
                    <label>注入文字（條件成立時送給 AI）</label>
                    <textarea class="avs-textarea" id="avsr-f-content" placeholder="例：王小明此時對你非常親密，會主動拉近距離，說話語氣溫柔...">${_esc(rule.content || '')}</textarea>
                </div>
                <div class="avsr-field">
                    <label>分組名稱（選填，同名的規則會視覺上靠在一起）</label>
                    <input class="avs-input" id="avsr-f-folder" placeholder="例：好感度系列、危機狀態、戰鬥規則…" value="${_esc(rule.folder || '')}">
                </div>
                <div class="avsr-field">
                    <label>優先度（數字越小越優先，預設 50）</label>
                    <input class="avs-input" id="avsr-f-priority" type="number" value="${rule.priority ?? 50}">
                </div>
            </div>
            <div class="avsr-editor-footer" style="gap: 10px;">
                <button class="avs-btn avs-btn-outline" id="avsr-cancel" style="flex:1;">取消</button>
                <button class="avs-btn avs-btn-primary" id="avsr-save" style="flex:1;">儲存</button>
            </div>
        `;

        // 點擊變數名稱快速填入路徑
        editor.querySelectorAll('[data-pick]').forEach(span => {
            span.onclick = () => {
                editor.querySelector('#avsr-f-path').value = span.dataset.pick;
            };
        });

        editor.querySelector('#avsr-cancel').onclick = () => {
            editor.className = 'avsr-editor hidden';
        };

        editor.querySelector('#avsr-save').onclick = () => {
            const name     = editor.querySelector('#avsr-f-name').value.trim();
            const path     = editor.querySelector('#avsr-f-path').value.trim();
            const op       = editor.querySelector('#avsr-f-op').value;
            const rawVal   = editor.querySelector('#avsr-f-val').value.trim();
            const content  = editor.querySelector('#avsr-f-content').value.trim();
            const folder   = editor.querySelector('#avsr-f-folder').value.trim();
            const priority = parseInt(editor.querySelector('#avsr-f-priority').value) || 50;

            if (!path) { alert('請填入變數路徑'); return; }
            if (!content) { alert('請填入注入文字'); return; }

            const n = parseFloat(rawVal);
            const value = isNaN(n) ? rawVal : n;

            const rules2 = _loadRules();
            const idx = rules2.findIndex(x => x.id === rule.id);
            const updated = { ...rule, name, path, op, value, content, folder: folder || undefined, priority };
            if (idx >= 0) rules2[idx] = updated; else rules2.push(updated);
            _saveRules(rules2);
            editor.className = 'avsr-editor hidden';
            _renderList(el);
        };
    }

    function _esc(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // 剔除 Markdown 符號（AI 生成的規則常帶入）
    function _stripMd(s) {
        return String(s)
            .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold**
            .replace(/\*(.+?)\*/g,     '$1')    // *italic*
            .replace(/`([^`]+)`/g,     '$1')    // `code`
            .replace(/^#+\s*/gm,       '')       // # headers
            .replace(/^[*\-]\s+/gm,    '')       // bullet points
            .replace(/^\d+\.\s+/gm,    '')       // numbered list
            .replace(/[「」『』]/g,    '')        // 有些 AI 愛加書名號
            .trim();
    }

    // ================================================================
    // 五、🎭 模式 Tab
    // ================================================================

    function renderModesTab(container) {
        const el = container.querySelector('#avs-view-modes');
        if (!el) return;
        // 確保樣式已注入（條件規則 tab 可能尚未被訪問）
        if (!document.getElementById('avsr-styles')) {
            const s = document.createElement('style');
            s.id = 'avsr-styles';
            s.textContent = CSS;
            document.head.appendChild(s);
        }
        el.style.position = 'relative';
        el.style.overflow = 'hidden';
        _renderModesList(el);
    }

    function _renderModesList(el) {
        const allRules = _loadRules();
        const modes    = allRules.filter(r => r.folder === '__mode__');

        // 當前 AVS 狀態，找出正在生效的模式
        const state      = win._AVS_ENGINE?.read?.() || {};
        const activeMode = modes.find(m => {
            const actual = _getVal(state, m.path || 'mode');
            return actual !== undefined && String(actual) === String(m.value);
        });
        const modeVarVal = _getVal(state, 'mode');
        const statusRaw  = modeVarVal !== undefined ? String(modeVarVal) : '（未設定）';
        const statusName = activeMode
            ? `${activeMode.icon || '🎭'} ${activeMode.name}`
            : statusRaw;

        const cardsHtml = modes.length === 0
            ? `<div class="avsr-empty">尚無自訂模式<br>
                <span style="font-size:11px;color:#444;">新增後，AI 寫 &lt;vars&gt;mode = "值"&lt;/vars&gt; 即可自動切換</span>
               </div>`
            : modes.map(m => {
                const isOn     = m.enabled !== false;
                const isActive = activeMode?.id === m.id;
                const preview  = (m.content || '').slice(0, 55) + ((m.content||'').length > 55 ? '…' : '');
                return `<div class="avsm-card${isActive ? ' active-mode' : ''}${isOn ? '' : ' disabled'}" data-id="${m.id}">
                    <div class="avsm-icon">${_esc(m.icon || '🎭')}</div>
                    <div class="avsm-info">
                        <div class="avsm-name">
                            ${_esc(m.name || '未命名模式')}
                            ${isActive ? '<span class="avsm-tag-on">● 生效中</span>' : ''}
                            ${!isOn    ? '<span class="avsm-tag-off">已停用</span>'  : ''}
                        </div>
                        <div class="avsm-cond">${_esc(m.path || 'mode')} = "${_esc(String(m.value))}"</div>
                        <div class="avsm-preview">${_esc(preview)}</div>
                    </div>
                    <div class="avsr-actions">
                        <span class="avsr-toggle" data-mtoggle="${m.id}" style="cursor:pointer;font-size:18px;">${isOn ? '●' : '○'}</span>
                        <button class="avsr-btn-sm" data-medit="${m.id}">編輯</button>
                        <button class="avsr-btn-sm danger" data-mdel="${m.id}">✕</button>
                    </div>
                </div>`;
            }).join('');

        el.innerHTML = `
            <div class="avsm-status">
                <span class="avsm-status-label">當前模式</span>
                <span class="avsm-status-value">${_esc(statusName)}</span>
                <span class="avsm-status-raw">mode = "${_esc(statusRaw)}"</span>
            </div>
            <div class="avsm-hint">
                AI 回應時在 &lt;vars&gt; 中寫入對應觸發值即可切換，例：<code>&lt;vars&gt;mode = "combat"&lt;/vars&gt;</code>
            </div>
            <button class="avsr-add-btn" id="avsm-add">＋ 新增模式</button>
            <div class="avsm-list">${cardsHtml}</div>
            <div class="avsr-editor hidden" id="avsm-editor"></div>
        `;

        // 啟用 / 停用
        el.querySelectorAll('[data-mtoggle]').forEach(btn => {
            btn.onclick = () => {
                const rules = _loadRules();
                const idx   = rules.findIndex(r => r.id === btn.dataset.mtoggle);
                if (idx !== -1) {
                    rules[idx].enabled = rules[idx].enabled === false;
                    _saveRules(rules);
                    _renderModesList(el);
                }
            };
        });

        // 刪除
        el.querySelectorAll('[data-mdel]').forEach(btn => {
            btn.onclick = () => {
                if (!confirm('確認刪除此模式？')) return;
                _saveRules(_loadRules().filter(r => r.id !== btn.dataset.mdel));
                _renderModesList(el);
            };
        });

        // 編輯
        el.querySelectorAll('[data-medit]').forEach(btn => {
            btn.onclick = () => {
                const rule = _loadRules().find(r => r.id === btn.dataset.medit);
                if (rule) _openModeEditor(el, rule);
            };
        });

        // 新增
        el.querySelector('#avsm-add').onclick = () => _openModeEditor(el, null);
    }

    function _openModeEditor(el, existing) {
        const editorEl = el.querySelector('#avsm-editor');
        if (!editorEl) return;
        const isNew = !existing;

        editorEl.innerHTML = `
            <div class="avsr-editor-header">
                <button class="avs-btn avs-btn-outline" id="avsm-back" style="padding: 4px 12px; font-size: 16px;">←</button>
                <span class="avsr-editor-title" style="margin-left: 8px;">${isNew ? '新增模式' : '編輯模式'}</span>
            </div>
            <div class="avsr-editor-body">
                <div style="display:flex;gap:10px;">
                    <div class="avsr-field" style="width:68px;flex-shrink:0;">
                        <label>圖示</label>
                        <input class="avs-input" id="avsm-f-icon" value="${_esc(existing?.icon || '')}" placeholder="🎭"
                            style="text-align:center;font-size:20px;padding:6px 4px;">
                    </div>
                    <div class="avsr-field" style="flex:1;">
                        <label>模式名稱</label>
                        <input class="avs-input" id="avsm-f-name" value="${_esc(existing?.name || '')}" placeholder="戰鬥模式">
                    </div>
                </div>
                <div style="display:flex;gap:10px;">
                    <div class="avsr-field" style="flex:1;">
                        <label>變數路徑（預設 mode）</label>
                        <input class="avs-input" id="avsm-f-path" value="${_esc(existing?.path || 'mode')}" placeholder="mode">
                    </div>
                    <div class="avsr-field" style="flex:1;">
                        <label>觸發值</label>
                        <input class="avs-input" id="avsm-f-value" value="${_esc(existing?.value || '')}" placeholder="combat">
                    </div>
                </div>
                <div class="avsr-field">
                    <label>注入文字（條件成立時插入給 AI 的行為指令）</label>
                    <textarea class="avs-textarea" id="avsm-f-content" style="min-height:110px;"
                        placeholder="例：使用短句，動作節奏優先，回覆不超過3段，避免大段心理描寫。">${_esc(existing?.content || '')}</textarea>
                </div>
                <div class="avsm-hint" id="avsm-live-hint" style="margin-top:0;"></div>
            </div>
            <div class="avsr-editor-footer" style="gap: 10px;">
                <button class="avs-btn avs-btn-outline" id="avsm-cancel" style="flex:1;">取消</button>
                <button class="avs-btn avs-btn-primary" id="avsm-save" style="flex:1;">儲存</button>
            </div>
        `;
        editorEl.classList.remove('hidden');

        const pathInput  = editorEl.querySelector('#avsm-f-path');
        const valInput   = editorEl.querySelector('#avsm-f-value');
        const hintEl     = editorEl.querySelector('#avsm-live-hint');

        const updateHint = () => {
            const p = pathInput.value.trim() || 'mode';
            const v = valInput.value.trim()  || '...';
            hintEl.innerHTML = `AI 寫 <code>&lt;vars&gt;${_esc(p)} = "${_esc(v)}"&lt;/vars&gt;</code> 即可啟動此模式`;
        };
        updateHint();
        pathInput.oninput = updateHint;
        valInput.oninput  = updateHint;

        const close = () => { editorEl.classList.add('hidden'); editorEl.innerHTML = ''; };
        editorEl.querySelector('#avsm-back').onclick   = close;
        editorEl.querySelector('#avsm-cancel').onclick = close;

        editorEl.querySelector('#avsm-save').onclick = () => {
            const name    = editorEl.querySelector('#avsm-f-name').value.trim();
            const icon    = editorEl.querySelector('#avsm-f-icon').value.trim();
            const path    = pathInput.value.trim() || 'mode';
            const value   = valInput.value.trim();
            const content = editorEl.querySelector('#avsm-f-content').value.trim();

            if (!value || !content) {
                alert('觸發值和注入文字不能為空');
                return;
            }

            const rules = _loadRules();
            if (isNew) {
                rules.push({
                    id:       _newId(),
                    name:     name || `${value} 模式`,
                    icon,
                    enabled:  true,
                    path,
                    op:       '=',
                    value,
                    content,
                    priority: 10,       // 模式優先，早於一般規則
                    folder:   '__mode__',
                });
            } else {
                const idx = rules.findIndex(r => r.id === existing.id);
                if (idx !== -1) Object.assign(rules[idx], { name, icon, path, value, content });
            }
            _saveRules(rules);
            close();
            _renderModesList(el);
        };
    }

    // ================================================================
    // 六、掛載
    // ================================================================

    win.OS_AVS_RULES = { getActiveContext, generateRulesForWorld, renderTab, renderModesTab };
    console.log('[AVS Rules] ✅ 條件注入引擎就緒');
})();
