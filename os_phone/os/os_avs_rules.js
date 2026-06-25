// ----------------------------------------------------------------
// [檔案] os_avs_rules.js（條件規則引擎）
// 路徑：os_phone/os/os_avs_rules.js
// 職責：1. 根據 AVS 變數狀態，動態注入行為規範。
//       2. 支援一般條件規則 (綁定 worldId / packId)。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const LSKEY = 'avs_condition_rules';   // 保留作 PWA fallback

    // ================================================================
    // 一、資料存取與同步（V1.4：規則 storage 走 adapter）
    //   PWA：adapter 讀 'avs_condition_rules'（原行為）
    //   酒館：adapter 讀 'aurelia_rules_tavern'（跨 chat 共用）
    // ================================================================

    function _loadRules() {
        if (win.OS_AVS_ADAPTER?.loadRules) return win.OS_AVS_ADAPTER.loadRules();
        try { return JSON.parse(localStorage.getItem(LSKEY) || '[]'); } catch(e) { return []; }
    }

    function _saveRules(rules) {
        if (win.OS_AVS_ADAPTER?.saveRules) {
            win.OS_AVS_ADAPTER.saveRules(rules);
        } else {
            localStorage.setItem(LSKEY, JSON.stringify(rules));
        }
    }


    function _newId() {
        return 'avsr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    }

    // ================================================================
    // 二、條件求值 (供 API 引擎呼叫)
    // ================================================================

    function _getVal(state, path) {
        const keys = path.split('.');
        let cur = state;
        for (const k of keys) {
            if (cur == null || typeof cur !== 'object') return undefined;
            cur = cur[k];
        }
        return cur;
    }

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

    function getActiveContext(state, activePackIds = null) {
        if (!state || typeof state !== 'object') return '';

        // V1.4：worldId 走 adapter（酒館：當前 chatId / PWA：vn_current_world_id）
        const currentWorldId = win.OS_AVS_ADAPTER?.getWorldId?.() || localStorage.getItem('vn_current_world_id') || '';

        const rules = _loadRules().filter(r => {
            if (r.enabled === false) return false;
            // V3：規則綁 packId（酒館用）→ caller 傳入當前 chat 對應的 pack IDs，filter 通過才生效
            if (r.packId && Array.isArray(activePackIds)) {
                return activePackIds.includes(r.packId);
            }
            // 沒 packId → 退回原 worldId filter（PWA / 舊資料）
            if (!r.worldId) return true;
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

    async function generateRulesForWorld({ worldId, worldTitle, worldDesc, variables, callApi }) {
        if (!callApi || !worldId || !variables?.length) return 0;
        try {
            const varList = variables.map(v => `${v.name} (預設:${v.defaultValue})`).join('、');
            const prompt = `世界觀：「${worldDesc}」
追蹤的變數：${varList}

任務：為這些變數設計「當變數到達某個程度時，角色行為如何隨之變化」的規則。先規劃再寫，別給又短又亂套的條目。

【設計原則】
1. 先想清楚每個變數代表哪個關係/狀態維度，再沿著它的高低設計「一條連貫的行為梯度」：同一變數在不同門檻各給一條、彼此是同一條由淺入深的漸進線，不是互相矛盾的隨機規則。
2. 行為要貼著這個世界觀與該變數最自然的走向；沒有明確設定就照這個維度最直覺、最合理的方向，別硬套與設定不符的套路（變數升高不必然代表反向情緒，除非世界觀本身就設定這種扭曲）。
3. 行為說明要「能直接演出來」：寫具體的神態、語氣、肢體動作、對待主角的方式與分寸，讓主模型照著就能演；禁止只丟空泛形容詞標籤，要寫到可演。

【輸出格式】每行一條，嚴格 5 欄、以 | 分隔；除了規則行不要任何多餘文字（不要標題、不要說明、不要回述範例）：
名稱 | 變數名 | 運算子 | 比較值 | 行為說明
- 變數名照上面追蹤的變數原樣填；運算子只能用 >= <= > < = !=
- 名稱與行為說明都用繁體中文純文字，禁止任何 Markdown 或裝飾符號
- 行為說明約 40～80 字、具體可演，但務必單行、不可換行、其中不可出現 | 符號
- 同一變數建議 2～4 個門檻構成漸進，總共約 4～8 條`;

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
                    name:    _stripMd(name || path),
                    enabled: true,
                    path:    _stripMd(path).trim(),
                    op:      op.trim(),
                    value:   isNaN(n) ? _stripMd(rawVal) : n,
                    content: _stripMd(content),
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
    // 四、UI（條件規則 tab，原樣保留）
    // ================================================================


    function renderTab(container) {

        const el = container.querySelector('#avs-view-rules');
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
        const rules = _loadRules().filter(r => r.folder !== '__mode__');
        const worldMap = {};
        try {
            Object.values(win.AURELIA_WORLDS || {}).forEach(w => { worldMap[w.id] = w.title; });
            (win.AURELIA_CUSTOM_WORLDS || []).forEach(w => { worldMap[w.id] = w.title; });
        } catch(e) {}

        const groups = {};
        rules.forEach(r => {
            const key = r.worldId || '__global__';
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });
        
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            if (a === '__global__') return -1;
            if (b === '__global__') return 1;
            return String(worldMap[a] || a).localeCompare(String(worldMap[b] || b));
        });

        let collapsed = {};
        try { collapsed = JSON.parse(localStorage.getItem('avsr_collapsed') || '{}'); } catch(e) {}

        const _cardHtml = (r) => {
            const condStr = `${r.path} ${r.op} ${r.value}`;
            const preview = (r.content || '').slice(0, 40) + ((r.content||'').length > 40 ? '…' : '');
            const folderTag = r.folder ? `<span class="avsr-folder-tag">📁 ${_esc(r.folder)}</span>` : '';
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

        let listHtml = '';
        if (rules.length === 0) {
            listHtml = `<div class="avsr-empty">尚無條件規則<br>
                <span style="font-size:11px;color:#444;">新增後，當項目達到條件時自動注入對應文字給 AI</span></div>`;
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

        el.querySelectorAll('[data-collapse]').forEach(hdr => {
            hdr.onclick = (e) => {
                if (e.target.closest('.avsr-del-group')) return;
                const key = hdr.dataset.collapse;
                collapsed[key] = !collapsed[key];
                try { localStorage.setItem('avsr_collapsed', JSON.stringify(collapsed)); } catch(e) {}
                _renderList(el);
            };
        });

        el.querySelectorAll('.avsr-del-group').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const key   = btn.dataset.delGroup;
                const title = btn.closest('.avsr-group')?.querySelector('.avsr-group-title')?.textContent || key;
                if (!confirm(`刪除「${title}」的所有規則？此操作無法復原。`)) return;
                const remaining = _loadRules().filter(r => (r.worldId || '__global__') !== key);
                _saveRules(remaining);
                delete collapsed[key];
                try { localStorage.setItem('avsr_collapsed', JSON.stringify(collapsed)); } catch(e) {}
                _renderList(el);
            };
        });

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

        let varOptions = [];
        try {
            const packs = await win.OS_DB?.getAllVarPacks?.() || [];
            packs.forEach(pack => {
                (pack.variables || []).forEach(v => {
                    if (v.name) varOptions.push({ path: v.name, pack: pack.name, defaultVal: v.defaultValue ?? '' });
                });
            });
        } catch(e) {}

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

        const datalistId = 'avsr-path-list';
        const datalistHtml = `<datalist id="${datalistId}">
            ${varOptions.map(o => `<option value="${_esc(o.path)}" label="${_esc(o.pack)}（預設：${_esc(String(o.defaultVal))}）">`).join('')}
        </datalist>`;

        const packGroups = {};
        varOptions.forEach(o => {
            if (!packGroups[o.pack]) packGroups[o.pack] = [];
            packGroups[o.pack].push(o);
        });
        const hintHtml = varOptions.length > 0
            ? `<div style="margin-top:6px;font-size:10px;color:rgba(26,28,40,0.45);line-height:1.8;">
                ${Object.entries(packGroups).map(([pack, vars]) =>
                    `<span style="color:rgba(26,28,40,0.55);">${_esc(pack)}：</span>${vars.map(v => `<span style="color:#1A1C28;margin-right:8px;cursor:pointer;" data-pick="${_esc(v.path)}">${_esc(v.path)}</span>`).join('')}<br>`
                ).join('')}
               </div>`
            : `<div style="margin-top:6px;font-size:10px;color:#444;">尚無檔案，可手動輸入路徑</div>`;

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
                            placeholder="點選或手動輸入項目路徑"
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

            if (!path) { alert('請填入項目路徑'); return; }
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

    function _stripMd(s) {
        return String(s)
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g,     '$1')
            .replace(/`([^`]+)`/g,     '$1')
            .replace(/^#+\s*/gm,       '')
            .replace(/^[*\-]\s+/gm,    '')
            .replace(/^\d+\.\s+/gm,    '')
            .replace(/[「」『』]/g,    '')
            .trim();
    }


    // ================================================================
    // 六、掛載
    // ================================================================

    // 對外 CRUD（給其他 UI 用，例如酒館 STATE tab 的 Rules 子 tab）
    function addRule(rule) {
        const rules = _loadRules();
        const r = {
            id: rule.id || _newId(),
            name: rule.name || rule.path || '未命名規則',
            enabled: rule.enabled !== false,
            path: rule.path || '',
            op: rule.op || '>=',
            value: rule.value,
            content: rule.content || '',
            worldId: rule.worldId || '',
            packId: rule.packId || '',   // V3：規則綁變數包（酒館用，PWA 規則 packId 留空）
            priority: rule.priority ?? 50,
            folder: rule.folder || ''
        };
        rules.push(r);
        _saveRules(rules);
        return r;
    }
    function updateRule(id, patch) {
        const rules = _loadRules();
        const idx = rules.findIndex(r => r.id === id);
        if (idx < 0) return false;
        rules[idx] = { ...rules[idx], ...patch };
        _saveRules(rules);
        return true;
    }
    function deleteRule(id) {
        const rules = _loadRules().filter(r => r.id !== id);
        _saveRules(rules);
        return true;
    }
    function toggleRule(id) {
        const rules = _loadRules();
        const r = rules.find(x => x.id === id);
        if (!r) return false;
        r.enabled = r.enabled === false ? true : false;
        _saveRules(rules);
        return r.enabled;
    }

    win.OS_AVS_RULES = {
        getActiveContext, generateRulesForWorld, renderTab,
        // CRUD（V1.4 加入，給外部 UI 用）
        loadRules: _loadRules,
        saveRules: _saveRules,
        addRule, updateRule, deleteRule, toggleRule,
        newId: _newId
    };
    console.log('[AVS Rules] ✅ 條件規則引擎就緒');
})();