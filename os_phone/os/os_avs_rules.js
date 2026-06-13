// ----------------------------------------------------------------
// [檔案] os_avs_rules.js (V1.3 - 插槽UI優化版：卸載邏輯與預設放置區)
// 路徑：os_phone/os/os_avs_rules.js
// 職責：1. 根據 AVS 變數狀態，動態注入行為規範。
//       2. 支援一般條件規則 (綁定 worldId)。
//       3. 支援模式裝備插槽系統 (裝備庫邏輯，完美防呆)。
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
        syncModesToPrompt(); // 🔥 每次儲存時，自動同步模式清單給 Prompt
    }

    /**
     * 自動掃描「當前環境」可用的模式，生成菜單注入 Prompt
     * 邏輯：(targetId === 'global') + (targetId === 當前載入的 packId)
     */
    async function syncModesToPrompt() {
        try {
            const rules = _loadRules();
            let activePackId = '';
            if (win.OS_DB && typeof win.OS_DB.getAllUITemplates === 'function') {
                const tpls = JSON.parse(localStorage.getItem('avs_active_ui_templates') || '[]');
                if (tpls.length > 0) activePackId = tpls[0].packId;
            }

            const availableModes = rules.filter(r => {
                if (r.folder !== '__mode__' || r.enabled === false || !r.value) return false;
                const target = r.targetId || 'pool'; // 🔥 修正：所有找不到目標的都視為在放置區
                if (target === 'pool') return false; // 放置區的不進入 Prompt
                return target === 'global' || target === activePackId;
            });
            
            if (availableModes.length > 0) {
                let menuPrompt = `\n\n### [系統寫作模式切換]\n當劇情氣氛改變時，你可以主動在 <vars> 中切換 mode。可用值如下：\n`;
                availableModes.forEach(m => {
                    const icon = m.icon || '🎭';
                    const groupName = m.targetId === 'global' ? '全域' : '劇本專屬';
                    menuPrompt += `- mode = "${m.value}" (${icon} ${m.name} [${groupName}])\n`;
                });
                menuPrompt += `注意：只需輸出變數，系統會自動根據模式調整你的行文風格。`;
                
                localStorage.setItem('avs_modes_menu_prompt', menuPrompt);
                console.log('[AVS Rules] 插槽模式菜單已更新，當前可用數量:', availableModes.length);
            } else {
                localStorage.removeItem('avs_modes_menu_prompt');
            }
        } catch(e) {
            console.warn('[AVS Rules] 同步模式菜單失敗:', e);
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
        let activePackId = '';
        const tpls = JSON.parse(localStorage.getItem('avs_active_ui_templates') || '[]');
        if (tpls.length > 0) activePackId = tpls[0].packId;

        const rules = _loadRules().filter(r => {
            if (r.enabled === false) return false;
            // 如果是模式，需檢查插槽權限
            if (r.folder === '__mode__') {
                const target = r.targetId || 'pool'; // 🔥 修正：預設放置區
                if (target === 'pool') return false; // 放置區不生效
                return target === 'global' || target === activePackId;
            }
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
            const prompt = `這是一個世界觀：「${worldDesc}」
已追蹤的變數有：${varList}

請根據這些變數，設計 3～6 條「當變數達到某個值時，AI 應如何調整行為」的規則。

輸出格式（每行一條，嚴格遵守，不要多餘文字）：
名稱 | 變數名 | 運算子 | 比較值 | 行為說明

規則：
- 運算子只能用：>= <= > < = !=
- 行為說明用繁體中文，30字以內，純文字，描述 AI 在此條件下的行為傾向
- 絕對不能使用任何 Markdown 符號
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
    // 五、🎭 模式 Tab (V1.3 修正：卸載UI與放置區預設)
    // ================================================================

    async function renderModesTab(container) {
        const el = container.querySelector('#avs-view-modes');
        if (!el) return;
        

        el.style.position = 'relative';
        el.style.overflow = 'hidden';
        el.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">載入插槽系統中...</div>';

        // 1. 獲取所有基礎資料
        const allRules = _loadRules();
        const modes    = allRules.filter(r => r.folder === '__mode__');
        const packs    = await win.OS_DB?.getAllVarPacks?.() || [];
        const state    = win._AVS_ENGINE?.read?.() || {};
        
        // 2. 渲染各分區 (Section Render)
        const renderSection = (title, targetId, list, isPack = false) => {
            const isEmpty = list.length === 0;
            const cardHtml = isEmpty 
                ? `<div class="avsr-empty" style="padding:15px;">此區域暫無模式</div>`
                : list.map(m => _createModeCard(m, state)).join('');
            
            return `
                <div class="avs-mode-section" data-target="${targetId}">
                    <div class="avsr-group-header">
                        <span class="avsr-group-title">${isPack ? '📂' : '🌐'} ${_esc(title)}</span>
                        ${targetId !== 'pool' ? `<button class="avsr-btn-sm danger" data-clear-slot="${targetId}">全部卸載</button>` : ''}
                    </div>
                    <div class="avs-mode-grid" style="display:flex; flex-direction:column; gap:8px; padding:10px;">
                        ${cardHtml}
                    </div>
                </div>
            `;
        };

        // 按 targetId 分類 (🔥 修正：找不到 targetId 的舊資料，全部預設進入 pool)
        const poolModes   = modes.filter(m => !m.targetId || m.targetId === 'pool');
        const globalModes = modes.filter(m => m.targetId === 'global');
        
        let sectionsHtml = `
            <div class="avsm-status">
                <span class="avsm-status-label">插槽管理</span>
                <span class="avsm-status-value">已就緒</span>
                <button class="avs-btn avs-btn-primary" id="avsm-add" style="margin-left:auto; font-size:11px; padding:4px 12px;">＋ 創建新模式</button>
            </div>
            
            <div class="avs-mode-layout" style="display:flex; flex-direction:column; gap:15px; padding-bottom:100px;">
                ${renderSection('模式放置區 (倉庫，不參與 AI 生成)', 'pool', poolModes)}
                <div style="height:1px; background:rgba(26,28,40,0.12); margin:10px 0;"></div>
                ${renderSection('全域 Mode (套用於所有劇情)', 'global', globalModes)}
        `;

        // 為每個變數包生成專屬資料區
        packs.forEach(p => {
            const packModes = modes.filter(m => m.targetId === p.id);
            sectionsHtml += renderSection(`檔案：${p.name}`, p.id, packModes, true);
        });

        sectionsHtml += `</div>`;
        el.innerHTML = sectionsHtml;

        // 創建/編輯模式 浮窗掛在手機面板(.avs-container) 上，position:absolute 才會被框在手機內、不爆出整個視窗。
        // 建一次重用（重渲染不重建，避免殘留多個）。
        const _root = el.closest('.avs-container') || el;
        if (_root && !_root.querySelector('#avsm-editor')) {
            const _ed = document.createElement('div');
            _ed.id = 'avsm-editor';
            _ed.className = 'avsr-editor hidden';
            _root.appendChild(_ed);
        }

        _bindModeEvents(el);
    }

    function _createModeCard(m, state) {
        const actual = _getVal(state, m.path || 'mode');
        const isActive = actual !== undefined && String(actual) === String(m.value);
        const isOn = m.enabled !== false;
        
        const target = m.targetId || 'pool'; // 確保有預設值
        
        // 🔥 修正：放置區顯示「下拉單」，其他區顯示「卸載按鈕」
        let actionHtml = '';
        if (target === 'pool') {
            actionHtml = `
                <select class="avs-select avsm-move-slot" data-id="${m.id}" style="font-size:11px; padding:3px; max-width:85px;">
                    <option value="" disabled selected>裝備至...</option>
                    <option value="global">🌐 全域區</option>
                    ${(localStorage.getItem('avs_last_packs_cache') || '').split(',').map(p => {
                        if(!p) return '';
                        const [id, name] = p.split('|');
                        return `<option value="${id}">📂 ${_esc(name)}</option>`;
                    }).join('')}
                </select>
            `;
        } else {
            actionHtml = `
                <button class="avsr-btn-sm" data-unequip="${m.id}" title="退回放置區">↓ 卸載</button>
            `;
        }

        return `
            <div class="avsm-card ${isActive ? 'active-mode' : ''} ${isOn ? '' : 'disabled'}" style="margin:0;">
                <div class="avsm-icon">${_esc(m.icon || '🎭')}</div>
                <div class="avsm-info">
                    <div class="avsm-name">${_esc(m.name)} ${isActive ? '<span class="avsm-tag-on">● 生效中</span>' : ''}</div>
                    <div class="avsm-cond">${_esc(m.path || 'mode')} = "${_esc(m.value)}"</div>
                </div>
                <div class="avsr-actions">
                    ${actionHtml}
                    <button class="avsr-btn-sm" data-medit="${m.id}">✎</button>
                    <button class="avsr-btn-sm danger" data-mdel="${m.id}">✕</button>
                </div>
            </div>
        `;
    }

    async function _bindModeEvents(el) {
        // 更新變數包快取，讓下拉選單可以讀到最新的包
        const packs = await win.OS_DB?.getAllVarPacks?.() || [];
        localStorage.setItem('avs_last_packs_cache', packs.map(p => `${p.id}|${p.name}`).join(','));

        // 分配/移動邏輯 (從放置區裝備出去)
        el.querySelectorAll('.avsm-move-slot').forEach(sel => {
            sel.onchange = () => {
                const targetId = sel.value;
                const modeId = sel.dataset.id;
                const rules = _loadRules();
                const idx = rules.findIndex(r => r.id === modeId);
                if (idx !== -1) {
                    rules[idx].targetId = targetId;
                    _saveRules(rules);
                    renderModesTab(el.parentElement); // 重新渲染
                }
            };
        });

        // 🔥 修正：單一卸載邏輯 (從全域/變數包退回放置區)
        el.querySelectorAll('[data-unequip]').forEach(btn => {
            btn.onclick = () => {
                const rules = _loadRules();
                const idx = rules.findIndex(r => r.id === btn.dataset.unequip);
                if (idx !== -1) {
                    rules[idx].targetId = 'pool'; // 退回放置區
                    _saveRules(rules);
                    renderModesTab(el.parentElement);
                }
            };
        });

        // 區域清空按鈕
        el.querySelectorAll('[data-clear-slot]').forEach(btn => {
            btn.onclick = () => {
                const tid = btn.dataset.clearSlot;
                if (!confirm('確定要卸載此區域的所有模式嗎？模式將退回至【放置區】。')) return;
                const rules = _loadRules();
                rules.forEach(r => { if(r.folder === '__mode__' && r.targetId === tid) r.targetId = 'pool'; });
                _saveRules(rules);
                renderModesTab(el.parentElement);
            };
        });

        // 編輯器邏輯
        el.querySelector('#avsm-add').onclick = () => _openModeEditor(el, null);
        el.querySelectorAll('[data-medit]').forEach(btn => {
            btn.onclick = () => _openModeEditor(el, _loadRules().find(r => r.id === btn.dataset.medit));
        });
        
        // 刪除邏輯
        el.querySelectorAll('[data-mdel]').forEach(btn => {
            btn.onclick = () => {
                if(confirm('確認永久刪除此模式？')) {
                    _saveRules(_loadRules().filter(r => r.id !== btn.dataset.mdel));
                    renderModesTab(el.parentElement);
                }
            };
        });
    }

    function _openModeEditor(el, existing) {
        const editorEl = (el.closest('.avs-container') || el).querySelector('#avsm-editor');
        if (!editorEl) return;
        const isNew = !existing;

        editorEl.innerHTML = `
            <div class="avsr-editor-header">
                <span class="avsr-editor-title">${isNew ? '創建新模式' : '編輯模式'}</span>
            </div>
            <div class="avsr-editor-body">
                <div style="display:flex;gap:10px;">
                    <div class="avsr-field" style="width:68px;"><label>圖示</label>
                        <input class="avs-input" id="avsm-f-icon" value="${_esc(existing?.icon || '🎭')}" style="text-align:center;">
                    </div>
                    <div class="avsr-field" style="flex:1;"><label>模式名稱</label>
                        <input class="avs-input" id="avsm-f-name" value="${_esc(existing?.name || '')}" placeholder="例：戰鬥模式">
                    </div>
                </div>
                <div style="display:flex;gap:10px;">
                    <div class="avsr-field" style="flex:1;"><label>觸發項目</label>
                        <input class="avs-input" id="avsm-f-path" value="${_esc(existing?.path || 'mode')}">
                    </div>
                    <div class="avsr-field" style="flex:1;"><label>觸發值</label>
                        <input class="avs-input" id="avsm-f-value" value="${_esc(existing?.value || '')}" placeholder="例：combat">
                    </div>
                </div>
                <div class="avsr-field"><label>注入行為指令 (條件成立時強制遵守)</label>
                    <textarea class="avs-textarea" id="avsm-f-content" style="height:110px;" placeholder="例：使用短句，動作節奏優先，回覆不超過3段，避免大段心理描寫。">${_esc(existing?.content || '')}</textarea>
                </div>
            </div>
            <div class="avsr-editor-footer">
                <button class="avs-btn avs-btn-outline" id="avsm-cancel" style="flex:1;">取消</button>
                <button class="avs-btn avs-btn-primary" id="avsm-save" style="flex:1;">${isNew ? '創建並放入放置區' : '更新'}</button>
            </div>
        `;
        editorEl.classList.remove('hidden');

        editorEl.querySelector('#avsm-cancel').onclick = () => editorEl.classList.add('hidden');
        editorEl.querySelector('#avsm-save').onclick = () => {
            const rules = _loadRules();
            const data = {
                name: editorEl.querySelector('#avsm-f-name').value.trim(),
                icon: editorEl.querySelector('#avsm-f-icon').value.trim(),
                path: editorEl.querySelector('#avsm-f-path').value.trim(),
                value: editorEl.querySelector('#avsm-f-value').value.trim(),
                content: editorEl.querySelector('#avsm-f-content').value.trim(),
                folder: '__mode__',
                priority: 10,
                enabled: true,
                targetId: existing?.targetId || 'pool' // 🔥 修正：確保無論如何都有預設值
            };
            
            if (!data.value || !data.content) { alert('觸發值和指令不能為空'); return; }
            
            if (isNew) {
                data.id = _newId();
                rules.push(data);
            } else {
                const idx = rules.findIndex(r => r.id === existing.id);
                if (idx !== -1) Object.assign(rules[idx], data);
            }
            _saveRules(rules);
            editorEl.classList.add('hidden');
            renderModesTab(el.parentElement);
        };
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
        getActiveContext, generateRulesForWorld, renderTab, renderModesTab,
        // CRUD（V1.4 加入，給外部 UI 用）
        loadRules: _loadRules,
        saveRules: _saveRules,
        addRule, updateRule, deleteRule, toggleRule,
        newId: _newId
    };
    console.log('[AVS Rules] ✅ 條件與插槽引擎就緒');
})();