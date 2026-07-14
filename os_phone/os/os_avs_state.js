// ----------------------------------------------------------------
// [檔案] os_avs_state.js
// 路徑：os_phone/os/os_avs_state.js
// 職責：AVS「📊 目前狀態」分頁的「唯一」渲染者 —— 從舊 status_panel 的 STATE tab 搬來並整合。
//       設計目標：給「非工程的玩家」看的直觀 UI。
//         • 主畫面只放「人話版」目前狀態（角色數值、任務、物品…），不露任何 JSON / 大括號 / 技術字。
//         • 所有開發者操作（追蹤設定、抽取、重生、清理、還原、跨世界…）收進可摺疊的「⚙️ 進階」。
//         • 全程 AVS 亮色系，跟變數工坊一致，不再是浮在亮底的暗色開發者面板。
// 依賴：window._AVS_ENGINE（getKey/read/restore/initFromPack）
//       window.OS_STATE_SCHEMA（generate/addField/updateField/deleteField）
//       window.OS_STATE_RUNTIME（forceExtract/clearPatches/getActiveSchema/listAllStateData/removeStateData/normalizeChatId/setEnabled）
//       window.OS_AVS_ADAPTER（getStoryId/getStoryTitle）、window.OS_DB（getStateData/getAllVnChapters）
// 對外：window.OS_AVS_STATE = { renderInto(host,opts), refresh, openStateManagerModal, 欄位 CRUD API }
// 樣式：css/os_avs.css 的 .avs-st-* / .avs-sm-* （亮色）
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    console.log('[AVS State] 載入 os_avs_state.js（目前狀態分頁，人性化整合版）');

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    let _host = null;
    let _packs = [];
    let _editingFieldName = null; // null / 欄位名 / '__new__'
    let _page = 'home';     // 兩層換頁：'home'(瀏覽) → 'current'(目前狀態) / 'adv'(進階) 操作頁
    let _advTab = 'fields';  // 進階第二層子分頁：'fields'(追蹤欄位) / 'extract'(抽取)
    let _editingValues = false;   // 「✏️ 改數值」模式：把目前狀態的每個值變成可填的小格子（非 JSON），手動修正 AI 填錯

    // ── 人話版狀態渲染 ───────────────────────────────────────────
    function _isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
    function _scalar(v) { return (v === null || v === undefined || v === '') ? '—' : String(v); }
    function _icon(k) {
        if (/系[統统]|時間|时间|場景|场景|地[點点]|世界|環境|环境/.test(k)) return '🗺️';
        if (/角色|人物|npc|character/i.test(k)) return '🎭';
        if (/玩家|主角|自己|player|我/i.test(k)) return '🙂';
        if (/背包|道具|物品|裝備|装备|inventory|item/i.test(k)) return '🎒';
        if (/任務|任务|目標|目标|quest|mission/i.test(k)) return '🎯';
        if (/關係|关系|好感|relation/i.test(k)) return '💞';
        return '•';
    }
    function _renderRows(obj) {
        return Object.entries(obj).map(([k, v]) =>
            `<div class="avs-st-row"><span class="avs-st-row-k">${esc(k)}</span><span class="avs-st-row-v">${esc(_scalar(v))}</span></div>`
        ).join('');
    }
    function _renderValue(v) {
        if (Array.isArray(v)) {
            if (!v.length) return '<div class="avs-st-dim">（空）</div>';
            return `<div class="avs-st-chips">${v.map(x => `<span class="avs-st-chip">${esc(_isObj(x) ? Object.values(x).join(' · ') : _scalar(x))}</span>`).join('')}</div>`;
        }
        if (_isObj(v)) {
            const entries = Object.entries(v);
            if (!entries.length) return '<div class="avs-st-dim">（空）</div>';
            const allScalar = entries.every(([, vv]) => !_isObj(vv) && !Array.isArray(vv));
            if (allScalar) return _renderRows(v);
            return entries.map(([k, vv]) =>
                `<div class="avs-st-entity"><div class="avs-st-entity-hd">${esc(k)}</div>${_renderValue(vv)}</div>`
            ).join('');
        }
        return `<div class="avs-st-row"><span class="avs-st-row-v solo">${esc(_scalar(v))}</span></div>`;
    }
    function _humanize(cur) {
        const keys = Object.keys(cur || {});
        if (!keys.length) {
            return `<div class="avs-st-empty">還沒有任何狀態紀錄。<br>開啟上方「即時記錄」之後，跑團時系統會自動把角色數值、任務進度、身上的物品記在這裡。</div>`;
        }
        return keys.map(k =>
            `<div class="avs-st-section"><div class="avs-st-section-hd">${_icon(k)} ${esc(k)}</div><div class="avs-st-section-body">${_renderValue(cur[k])}</div></div>`
        ).join('');
    }

    // ── 「✏️ 改數值」可編輯渲染：葉值→小格子；實體（如 NPC，多實體容器下的物件）→名稱可改 + 可標記刪除 ──
    function _editFields(obj, prefix, out, entityLevel) {
        Object.keys(obj || {}).forEach(k => {
            const path = prefix ? prefix + '.' + k : k;
            const v = obj[k];
            if (Array.isArray(v)) {
                const allScalar = v.every(x => !_isObj(x) && !Array.isArray(x));
                out.push(allScalar
                    ? `<div class="avs-st-edit-row"><span class="avs-st-edit-k">${esc(k)}</span><input class="avs-st-edit-input" data-path="${esc(path)}" data-arr="1" value="${esc(v.join('、'))}"></div>`
                    : `<div class="avs-st-edit-row"><span class="avs-st-edit-k">${esc(k)}</span><span class="avs-st-dim">（清單較複雜，暫不可手改）</span></div>`);
            } else if (_isObj(v)) {
                if (entityLevel) {
                    // k = 一個實體（例如某個 NPC 名）→ 名稱可改、整個可刪
                    out.push(`<div class="avs-st-edit-entity"><div class="avs-st-edit-entityhd">`
                        + `<input class="avs-st-edit-name" data-rename-path="${esc(path)}" value="${esc(k)}" title="改名（例如 冒險者 → 加侖）">`
                        + `<button class="avs-st-edit-del" data-del-path="${esc(path)}" type="button" title="標記刪除這個">×</button>`
                        + `</div>`);
                    _editFields(v, path, out, false);
                    out.push(`</div>`);
                } else {
                    // 「多實體容器」判定（容器內每個子物件 = 可改名/刪除的實體，如 NPC）。
                    //   舊版用 every(全部都是物件) 太脆：NPC 容器只要被副模型多塞「一個」純量(數量/旗標/備註)，
                    //   every 立刻 false → 整組 NPC 的改名/刪除 × 全消失（這就是「乎有乎沒」的真因）。
                    //   放寬成：全是物件(原行為，覆蓋單一/多個乾淨 NPC) 或「≥2 個物件子節點」(容忍夾雜純量) → 仍算多實體。
                    //   單一物件夾純量(1 obj + 純量)維持不算實體，避免「主角.外觀」這種單一子物件被誤判成可刪實體。
                    const _vals = Object.values(v);
                    const _objN = _vals.filter(x => _isObj(x)).length;
                    const childMulti = _vals.length > 0 && (_objN === _vals.length || _objN >= 2);
                    out.push(`<div class="avs-st-edit-group"><div class="avs-st-edit-grouphd">${esc(k)}</div>`);
                    _editFields(v, path, out, childMulti);
                    out.push(`</div>`);
                }
            } else {
                out.push(`<div class="avs-st-edit-row"><span class="avs-st-edit-k">${esc(k)}</span><input class="avs-st-edit-input" data-path="${esc(path)}" value="${esc(_scalar(v) === '—' ? '' : String(v))}"></div>`);
            }
        });
        return out;
    }
    function _humanizeEditable(cur) {
        if (!Object.keys(cur || {}).length) return `<div class="avs-st-empty">還沒有狀態可編輯。</div>`;
        return _editFields(cur, '', [], false).join('');
    }
    function _getByPath(obj, path) {
        if (!path) return obj;
        return String(path).split('.').reduce((o, k) => (o && typeof o === 'object') ? o[k] : undefined, obj);
    }
    function _setByPath(obj, path, val) {
        const parts = String(path).split('.');
        let o = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
            o = o[parts[i]];
        }
        o[parts[parts.length - 1]] = val;
    }
    async function _saveStateValues() {
        const eng = win._AVS_ENGINE;
        let cur = {};
        try { cur = JSON.parse(JSON.stringify((eng && eng.read && eng.read()) || {})); } catch (e) {}
        const h = _host;
        // 1) 葉值編輯（用舊路徑）
        (h ? h.querySelectorAll('.avs-st-edit-input[data-path]') : []).forEach(inp => {
            const path = inp.getAttribute('data-path');
            let val = inp.value;
            if (inp.getAttribute('data-arr')) {
                val = String(val).split(/[、,，\n]/).map(s => s.trim()).filter(Boolean);
            } else {
                const t = String(val).trim();
                if (t !== '' && /^-?\d+(\.\d+)?$/.test(t)) val = Number(t);
            }
            _setByPath(cur, path, val);
        });
        // 2) 刪除被標記的實體（路人大媽、重複項…）
        (h ? h.querySelectorAll('.avs-st-edit-entity.deleting [data-del-path]') : []).forEach(b => {
            const dp = b.getAttribute('data-del-path');
            const parts = String(dp).split('.');
            const parent = _getByPath(cur, parts.slice(0, -1).join('.'));
            if (parent && typeof parent === 'object') delete parent[parts[parts.length - 1]];
        });
        // 3) 實體改名（新名≠舊名）；改進已存在的同名實體＝合併（舊資料併進去），治「冒險者後來叫加侖」的重複
        (h ? h.querySelectorAll('.avs-st-edit-name[data-rename-path]') : []).forEach(inp => {
            const ent = inp.closest('.avs-st-edit-entity');
            if (ent && ent.classList.contains('deleting')) return;   // 已刪的不改名
            const oldPath = inp.getAttribute('data-rename-path');
            const parts = String(oldPath).split('.');
            const oldKey = parts[parts.length - 1];
            const newName = String(inp.value || '').trim();
            if (!newName || newName === oldKey) return;
            const parent = _getByPath(cur, parts.slice(0, -1).join('.'));
            if (parent && typeof parent === 'object' && parent[oldKey] !== undefined) {
                parent[newName] = (parent[newName] && typeof parent[newName] === 'object')
                    ? Object.assign({}, parent[newName], parent[oldKey])
                    : parent[oldKey];
                delete parent[oldKey];
            }
        });
        try { if (eng && eng.write) eng.write(cur); } catch (e) { console.warn('[AVS State] 手動存值失敗', e); }
        _editingValues = false;
        _build();
    }

    // ── schema 欄位編輯表單（進階區內）────────────────────────────
    const TYPE_OPTIONS = ['string', 'number', 'enum', 'list'];
    function renderFieldEdit(name, type, desc, isNew) {
        const dataName = isNew ? '__new__' : name;
        const safe = esc(dataName).replace(/'/g, '&#39;');
        return `<div class="avs-st-field-edit" data-edit-name="${esc(dataName)}">
            <div class="avs-st-fe-row"><span class="avs-st-fe-label">名稱</span>
                <input class="avs-input" data-edit-key="name" ${isNew ? 'data-edit-focus placeholder="例：體力 / 心情 / 任務" value=""' : `value="${esc(name)}" disabled`} /></div>
            <div class="avs-st-fe-row"><span class="avs-st-fe-label">類型</span>
                <select class="avs-select" data-edit-key="type">${TYPE_OPTIONS.map(t => `<option value="${t}" ${t === type ? 'selected' : ''}>${t.toUpperCase()}</option>`).join('')}</select></div>
            <div class="avs-st-fe-row"><span class="avs-st-fe-label">說明</span>
                <textarea class="avs-textarea" data-edit-key="desc" ${isNew ? '' : 'data-edit-focus'} placeholder="這欄位記什麼、何時會變">${esc(desc || '')}</textarea></div>
            <div class="avs-st-fe-actions">
                <button class="avs-btn avs-btn-outline avs-st-fe-btn" onclick="window.OS_AVS_STATE.cancelEditField()">取消</button>
                <button class="avs-btn avs-btn-primary avs-st-fe-btn" onclick="window.OS_AVS_STATE.saveFieldEdit('${safe}')">${isNew ? '新增' : '儲存'}</button>
            </div></div>`;
    }
    function _renderSchemaList(fields) {
        let html = Object.entries(fields).map(([name, def]) => {
            const type = (def && def.type) || '?';
            const desc = (def && def.desc) || '';
            if (_editingFieldName === name) return renderFieldEdit(name, type, desc, false);
            return `<div class="avs-st-field">
                <div class="avs-st-field-main">
                    <div class="avs-st-field-row"><span class="avs-st-field-name">${esc(name)}</span><span class="avs-st-field-type">${esc(type)}</span></div>
                    ${desc ? `<div class="avs-st-field-desc">${esc(desc)}</div>` : ''}
                </div>
                <div class="avs-st-field-acts">
                    <button class="avs-st-field-act" onclick="window.OS_AVS_STATE.startEditField('${esc(name).replace(/'/g, '&#39;')}')" title="編輯">✏</button>
                    <button class="avs-st-field-act danger" onclick="window.OS_AVS_STATE.deleteFieldConfirm('${esc(name).replace(/'/g, '&#39;')}')" title="刪除">×</button>
                </div></div>`;
        }).join('');
        if (_editingFieldName === '__new__') html += renderFieldEdit('', 'string', '', true);
        else html += `<div class="avs-st-field-add" onclick="window.OS_AVS_STATE.startAddField()">＋ 新增追蹤欄位</div>`;
        return html;
    }

    // ── 主建構 ───────────────────────────────────────────────────
    async function _build() {
        if (!_host) return;
        _host.innerHTML = `<div class="avs-st"><div class="avs-st-loading">載入狀態中…</div></div>`;

        const eng = win._AVS_ENGINE;
        const ctx = win.SillyTavern?.getContext?.();
        const chatId = ctx?.chatId || '';
        const storyId = win.OS_AVS_ADAPTER?.getStoryId?.() || localStorage.getItem('vn_current_story_id') || '';
        const stateKey = eng ? eng.getKey() : (storyId ? `avs_state_${storyId}` : 'avs_current_state');
        const storyTitle = win.OS_AVS_ADAPTER?.getStoryTitle?.() || localStorage.getItem('vn_current_story_title') || storyId || '';

        let snapCount = 0;
        try { snapCount = JSON.parse(localStorage.getItem(`avs_snap_${stateKey}`) || '[]').length; } catch (e) {}

        let fields = null, data = null, cur = {};
        try { fields = await win.OS_STATE_RUNTIME?.getActiveSchema?.(); } catch (e) {}
        try { if (chatId && win.OS_DB?.getStateData) data = await win.OS_DB.getStateData(chatId); } catch (e) {}
        try { cur = (eng?.read?.()) || data?.current || {}; } catch (e) { cur = data?.current || {}; }
        const hasSchema = fields && Object.keys(fields).length > 0;
        const patchesCount = data?.patches ? Object.keys(data.patches).length : 0;
        const runtimeOn = localStorage.getItem('aurelia_state_runtime_enabled') === '1';

        // 🔗 整合頁去重複：沒建檔時只顯示上方「開始追蹤」引導、藏掉下方「我的檔案」區（兩個建檔入口擇一）；建檔後才顯示檔案管理
        try { const _pv = document.querySelector('#avs-view-packs'); if (_pv) _pv.classList.toggle('active', !!hasSchema); } catch (e) {}

        const storyHtml = `<div class="avs-card avs-st-story">
            <div class="avs-st-story-label">目前故事</div>
            <div class="avs-st-story-name">${storyTitle ? esc(storyTitle) : '<span class="avs-st-dim">（尚未開啟故事）</span>'}</div>
        </div>`;

        if (!hasSchema) {
            _host.innerHTML = `<div class="avs-st">
                ${storyHtml}
                <div class="avs-card avs-st-init">
                    <div class="avs-st-init-icon">🛰️</div>
                    <div class="avs-st-init-title">這個世界還沒開始追蹤狀態</div>
                    <div class="avs-st-init-desc">AI 會讀你的世界設定，預設追蹤下面這些；不要的點 × 刪掉、想加的打在輸入框，全留著＝交給 AI 自動判斷。</div>
                    <div class="avs-st-init-tags">
                        <div class="avs-st-chips" id="avs-st-tags">
                            <span class="avs-st-chip removable" data-k="角色外貌：髮色/眼色/體型" data-warn="1">🎭 角色外貌<i class="fa-solid fa-xmark chip-x"></i></span>
                            <span class="avs-st-chip removable" data-k="每個角色對主角的好感度">💗 好感度<i class="fa-solid fa-xmark chip-x"></i></span>
                            <span class="avs-st-chip removable" data-k="劇情目標：長期目標＋短期待辦">🎯 劇情目標<i class="fa-solid fa-xmark chip-x"></i></span>
                            <span class="avs-st-chip removable" data-k="每個角色的當前目標與時限">📋 角色待辦<i class="fa-solid fa-xmark chip-x"></i></span>
                            <span class="avs-st-chip removable" data-k="當前場景／地點">📍 當前場景<i class="fa-solid fa-xmark chip-x"></i></span>
                            <span class="avs-st-chip removable" data-k="角色攜帶／持有的物品">🎒 物品攜帶<i class="fa-solid fa-xmark chip-x"></i></span>
                            <span class="avs-st-chip removable" data-k="題材專屬數值（HP／理智／倒計時等）">⚙️ 題材數值<i class="fa-solid fa-xmark chip-x"></i></span>
                        </div>
                    </div>
                    <textarea class="avs-textarea avs-st-init-prompt" id="avs-st-init-prompt" placeholder="（選填）還想追蹤什麼，或對上面的追蹤項有特別要求，打在這"></textarea>
                    <button class="avs-btn avs-btn-primary avs-st-init-btn" id="avs-st-init">開始追蹤狀態 ▸</button>
                    <div class="avs-st-init-foot">第一次生成大約 5–30 秒；想簡單跑、跳過 AI 就用下面這個</div>
                    <button class="avs-btn avs-btn-outline avs-st-init-btn" id="avs-st-preset">🪶 簡易預設（形象/身分/好感度）</button>
                </div>
            </div>`;
            // 預設 TAG 可刪（🎭 外貌 data-warn=1 → 刪前警告生圖會不一致）
            const _tagWrap = _host.querySelector('#avs-st-tags');
            const _totalTags = _tagWrap ? _tagWrap.querySelectorAll('.avs-st-chip').length : 0;
            if (_tagWrap) _tagWrap.querySelectorAll('.chip-x').forEach(x => {
                x.onclick = () => {
                    const chip = x.closest('.avs-st-chip');
                    if (!chip) return;
                    if (chip.dataset.warn === '1' && !confirm('刪掉「角色外貌」後，AI 不會記角色的髮色/眼色/體型——之後生圖角色長相每次可能都不一樣。確定要刪？')) return;
                    chip.remove();
                };
            });
            const ib = _host.querySelector('#avs-st-init');
            if (ib) ib.onclick = async () => {
                if (!win.OS_AVS?.generateAndSaveSchema) { alert('AVS 模組未就緒，請稍候再試'); return; }
                // 組指令：有刪 TAG 才告訴 AI「只追蹤保留的」；全留＝不送排除指令(純自動)。再加輸入框自訂。
                const _kept = [...(_tagWrap?.querySelectorAll('.avs-st-chip') || [])].map(c => c.dataset.k).filter(Boolean);
                const _custom = (_host.querySelector('#avs-st-init-prompt')?.value || '').trim();
                let _up = '';
                if (_totalTags && _kept.length < _totalTags) _up += '【使用者只要追蹤這些維度，沒列到的別硬生】' + _kept.join('、');
                if (_custom) _up += (_up ? '\n' : '') + '【額外要求】' + _custom;
                const orig = ib.textContent;
                ib.textContent = '🧬 AI 分析中…';
                ib.style.pointerEvents = 'none';
                try {
                    const r = await win.OS_AVS.generateAndSaveSchema(_up);   // 生成 schema + 存進變數包（帶 TAG 取捨＋選填要求）
                    if (r) _build();   // 重繪：此時變數包已有剛生成的 schema → 顯示追蹤狀態
                } catch (e) {
                    console.error('[AVS State] AI 生成失敗:', e);
                    alert('生成失敗：' + (e?.message || e));
                } finally {
                    ib.textContent = orig;
                    ib.style.pointerEvents = '';
                }
            };
            // 🪶 簡易預設：跳過 AI 的快速建檔入口。觸發「我的檔案」那顆真按鈕(在 DOM 內、初始狀態只是被藏)，
            //    它套用後會 call OS_AVS_STATE.refresh() 把這張 init 卡刷新成追蹤視圖。
            const pb = _host.querySelector('#avs-st-preset');
            if (pb) pb.onclick = () => {
                const real = document.querySelector('#avs-btn-preset-pack');
                if (real) real.click();
                else alert('簡易預設未就緒，請切到上方「我的檔案」分頁套用');
            };
            return;
        }

        // 「複製狀態數據」小按鈕：搬進「目前狀態」操作頁
        const copyBtnHtml = `<button class="avs-btn avs-btn-outline avs-st-sm" id="avs-st-copy-diag">🔬 複製狀態數據</button>`;

        // ── 第二層：📊 目前狀態 操作頁 ──────────────────────────────
        if (_page === 'current') {
            _host.innerHTML = `<div class="avs-st avs-st-l2">
                <div class="avs-st-l2hd">
                    <button class="avs-st-back" id="avs-st-back">‹ 返回</button>
                    <div class="avs-st-l2title">📊 目前狀態</div>
                </div>
                <div class="avs-st-cur-editbar">
                    ${copyBtnHtml}
                    <div class="avs-st-editbar-r">
                        ${_editingValues
                            ? `<button class="avs-btn avs-btn-primary avs-st-fe-btn" id="avs-st-val-save">💾 儲存</button><button class="avs-btn avs-btn-outline avs-st-fe-btn" id="avs-st-val-cancel">取消</button>`
                            : `<button class="avs-btn avs-btn-outline avs-st-fe-btn" id="avs-st-val-edit">✏️ 改數值</button><span class="avs-st-editbar-hint">AI 偶爾填錯？點這手動改</span>`}
                    </div>
                </div>
                <div class="avs-st-current-body">${_editingValues ? _humanizeEditable(cur) : _humanize(cur)}</div>
            </div>`;
            _bind(stateKey, snapCount);
            return;
        }

        // ── 第二層：⚙️ 進階 操作頁（子分頁：追蹤欄位 / 抽取）─────────
        if (_page === 'adv') {
            const fieldsTab = `
                <div class="avs-st-adv-sec">
                    <div class="avs-st-adv-hd">追蹤欄位（${Object.keys(fields).length}）<span class="avs-st-adv-hint">AI 會盯著這些東西記錄</span></div>
                    <div class="avs-st-field-list">${_renderSchemaList(fields)}</div>
                    <button class="avs-btn avs-btn-outline avs-st-wide" id="avs-st-regen">🧬 重新生成欄位</button>
                </div>
                <div class="avs-st-adv-sec">
                    <div class="avs-st-adv-hd">這個故事的狀態</div>
                    <div class="avs-st-btn-grid">
                        <button class="avs-btn avs-btn-outline${snapCount === 0 ? ' disabled' : ''}" id="avs-st-rollback">↩ 還原上一步${snapCount ? ` (${snapCount})` : ''}</button>
                        <button class="avs-btn avs-btn-danger" id="avs-st-clearstate">清空目前狀態</button>
                    </div>
                    <div class="avs-st-initpack">
                        <select class="avs-select" id="avs-st-initpack-sel">
                            <option value="">用檔案的預設值初始化…</option>
                            ${(_packs || []).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
                        </select>
                        <button class="avs-btn avs-btn-primary" id="avs-st-initpack-btn">套用</button>
                    </div>
                </div>
                <div class="avs-st-adv-sec">
                    <button class="avs-btn avs-btn-outline avs-st-wide" id="avs-st-cross">🌐 跨世界管理 — 所有已追蹤的世界</button>
                    <button class="avs-btn avs-btn-outline avs-st-wide avs-st-gc" id="avs-st-gc">🧹 清理已刪除世界的殘留資料</button>
                </div>`;
            const extractTab = `
                <div class="avs-st-adv-sec">
                    <div class="avs-st-adv-hd">抽取${patchesCount ? `（已記 ${patchesCount} 筆）` : ''}<span class="avs-st-adv-hint">從最近劇情把狀態變化記進來</span></div>
                    <div class="avs-st-btn-grid">
                        <button class="avs-btn avs-btn-outline" id="avs-st-extract">🛰️ 立即抽一次</button>
                        <button class="avs-btn avs-btn-outline" id="avs-st-deep" title="用主模型把整份狀態清一輪：合併重複角色、移除純路人、按大總結修正過期欄位。整理前自動快照，可還原上一步。">♻️ 深度整理</button>
                        <button class="avs-btn avs-btn-danger" id="avs-st-clearpatches">🧹 清空抽取紀錄</button>
                    </div>
                </div>`;
            _host.innerHTML = `<div class="avs-st avs-st-l2">
                <div class="avs-st-l2hd">
                    <button class="avs-st-back" id="avs-st-back">‹ 返回</button>
                    <div class="avs-st-l2title">⚙️ 進階</div>
                </div>
                <div class="avs-st-subtabs">
                    <button class="avs-st-subtab${_advTab === 'fields' ? ' active' : ''}" data-tab="fields">追蹤欄位（${Object.keys(fields).length}）</button>
                    <button class="avs-st-subtab${_advTab === 'extract' ? ' active' : ''}" data-tab="extract">抽取</button>
                </div>
                <div class="avs-st-adv is-page">${_advTab === 'fields' ? fieldsTab : extractTab}</div>
            </div>`;
            _bind(stateKey, snapCount);
            return;
        }

        // ── 第一層：home（瀏覽）：故事 + 開關 + 兩個換頁入口 ──────────
        _host.innerHTML = `<div class="avs-st">
            ${storyHtml}

            <div class="avs-card avs-st-toggle-row">
                <div class="avs-st-toggle-text">
                    <div class="avs-st-toggle-name">🎬 導演模式</div>
                    <div class="avs-st-toggle-desc">開啟後，每輪劇情結束由「主模型接口」整理一份導演稿（誰知道什麼、誰在隱瞞、可用的衝突點），下一輪自動給寫正文的 AI 參考</div>
                </div>
                <div class="avs-st-toggle${(win.OS_STATE_RUNTIME?.director?.isOn?.()) ? ' on' : ''}" id="avs-st-director-toggle" role="switch"></div>
            </div>
            <div class="avs-card avs-st-director-tools${(win.OS_STATE_RUNTIME?.director?.isOn?.()) ? ' is-visible' : ''}" id="avs-st-director-tools">
                <div class="avs-st-btn-grid">
                    <button class="avs-btn avs-btn-outline" id="avs-st-director-view">📜 查看／編輯導演稿</button>
                    <button class="avs-btn avs-btn-outline" id="avs-st-director-now" title="不等下一輪，現在就照最近劇情產一份導演稿">🎬 立刻產一份</button>
                </div>
                <div class="avs-st-director-editor" id="avs-st-director-editor">
                    <textarea class="avs-textarea avs-st-director-text" id="avs-st-director-text"></textarea>
                    <div class="avs-st-btn-grid avs-st-director-actions">
                        <button class="avs-btn avs-btn-primary" id="avs-st-director-save">💾 儲存（下一輪生效）</button>
                        <button class="avs-btn avs-btn-outline" id="avs-st-director-close">收起</button>
                    </div>
                </div>
            </div>

            <div class="avs-card avs-st-toggle-row">
                <div class="avs-st-toggle-text">
                    <div class="avs-st-toggle-name">即時記錄狀態</div>
                    <div class="avs-st-toggle-desc">開啟後，每次劇情推進都會自動更新下面的狀態</div>
                </div>
                <div class="avs-st-toggle${runtimeOn ? ' on' : ''}" id="avs-st-toggle" role="switch"></div>
            </div>

            <button class="avs-st-nav" id="avs-st-nav-cur">
                <span class="avs-st-nav-txt">📊 目前狀態<span class="avs-st-nav-sub">角色數值、任務、身上的物品</span></span>
                <span class="avs-st-nav-chev">›</span>
            </button>
            <button class="avs-st-nav" id="avs-st-nav-adv">
                <span class="avs-st-nav-txt">⚙️ 進階：追蹤設定與資料管理<span class="avs-st-nav-sub">追蹤欄位、抽取、還原、跨世界</span></span>
                <span class="avs-st-nav-chev">›</span>
            </button>
        </div>`;

        _bind(stateKey, snapCount);
    }

    function _bind(stateKey, snapCount) {
        const h = _host;
        const q = sel => h.querySelector(sel);
        const eng = win._AVS_ENGINE;

        // 兩層換頁：入口 → 操作頁 → 返回；進階子分頁切換
        const _goTop = () => { try { h.closest('.avs-content')?.scrollTo?.(0, 0); } catch (e) {} };
        { const b = q('#avs-st-nav-cur'); if (b) b.onclick = () => { _page = 'current'; _build(); _goTop(); }; }
        { const b = q('#avs-st-nav-adv'); if (b) b.onclick = () => { _page = 'adv'; _build(); _goTop(); }; }
        { const b = q('#avs-st-back'); if (b) b.onclick = () => { _page = 'home'; _editingValues = false; _build(); _goTop(); }; }
        h.querySelectorAll('.avs-st-subtab').forEach(t => { t.onclick = () => { _advTab = t.dataset.tab || 'fields'; _build(); }; });
        // ✏️ 改數值 / 💾 儲存 / 取消（手動修正 AI 填錯的狀態值）
        { const eb = q('#avs-st-val-edit'); if (eb) eb.onclick = () => { _editingValues = true; _page = 'current'; _build(); }; }
        { const sb = q('#avs-st-val-save'); if (sb) sb.onclick = () => { _saveStateValues(); }; }
        { const cb = q('#avs-st-val-cancel'); if (cb) cb.onclick = () => { _editingValues = false; _build(); }; }
        // 實體 × 鈕：切換「標記刪除」(再點一次取消)，儲存時才真的刪
        h.querySelectorAll('.avs-st-edit-del').forEach(b => b.onclick = () => { const e = b.closest('.avs-st-edit-entity'); if (e) e.classList.toggle('deleting'); });

        // 即時記錄開關
        const toggle = q('#avs-st-toggle');
        if (toggle) toggle.onclick = function () {
            const on = this.classList.toggle('on');
            localStorage.setItem('aurelia_state_runtime_enabled', on ? '1' : '0');
            try { win.OS_STATE_RUNTIME?.setEnabled?.(on); } catch (e) {}
        };

        // 🎬 導演模式：開關 + 導演稿查看/手改/立產
        const dirToggle = q('#avs-st-director-toggle');
        if (dirToggle) dirToggle.onclick = function () {
            const on = this.classList.toggle('on');
            try { win.OS_STATE_RUNTIME?.director?.setOn?.(on); } catch (e) {}
            const tools = q('#avs-st-director-tools');
            if (tools) tools.classList.toggle('is-visible', on);
        };
        const _dirLoadText = async () => {
            const ta = q('#avs-st-director-text');
            if (!ta) return;
            const t = await win.OS_STATE_RUNTIME?.director?.getText?.();
            ta.value = t || '（還沒有導演稿——推進一輪劇情，或按「立刻產一份」）';
        };
        const dirViewBtn = q('#avs-st-director-view');
        if (dirViewBtn) dirViewBtn.onclick = async () => {
            const ed = q('#avs-st-director-editor');
            if (!ed) return;
            if (!ed.classList.contains('open')) { await _dirLoadText(); ed.classList.add('open'); }
            else ed.classList.remove('open');
        };
        const dirSaveBtn = q('#avs-st-director-save');
        if (dirSaveBtn) dirSaveBtn.onclick = async () => {
            const ta = q('#avs-st-director-text');
            if (!ta) return;
            let ok = false;
            try { ok = await win.OS_STATE_RUNTIME?.director?.saveText?.(ta.value); } catch (e) {}
            dirSaveBtn.textContent = ok ? '✅ 已儲存' : '❌ 存失敗';
            setTimeout(() => { dirSaveBtn.textContent = '💾 儲存（下一輪生效）'; }, 1800);
        };
        const dirCloseBtn = q('#avs-st-director-close');
        if (dirCloseBtn) dirCloseBtn.onclick = () => { const ed = q('#avs-st-director-editor'); if (ed) ed.classList.remove('open'); };
        const dirNowBtn = q('#avs-st-director-now');
        if (dirNowBtn) dirNowBtn.onclick = async () => {
            dirNowBtn.textContent = '🎬 產稿中…'; dirNowBtn.classList.add('disabled');
            try { await win.OS_STATE_RUNTIME?.director?.extractNow?.(); } catch (e) {}
            dirNowBtn.textContent = '🎬 立刻產一份'; dirNowBtn.classList.remove('disabled');
            const ed = q('#avs-st-director-editor');
            if (ed && ed.classList.contains('open')) await _dirLoadText();
        };

        const bind = (sel, fn) => { const b = q(sel); if (b) b.onclick = fn; };
        // 🔬 複製全部狀態診斷數據（引擎當前 + 本輪抽取 + 持久化 patches/base）→ 貼給工程師
        bind('#avs-st-copy-diag', async () => {
            const b = q('#avs-st-copy-diag');
            try {
                const dump = {
                    engineState: win._AVS_ENGINE?.read?.() || null,
                    lastExtract: win.OS_STATE_RUNTIME?.getLastExtract?.() || null,
                    persisted: (win.OS_STATE_RUNTIME?.getStateDataDump) ? await win.OS_STATE_RUNTIME.getStateDataDump() : null
                };
                await navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
                if (b) { b.textContent = '✅ 已複製'; setTimeout(() => { b.textContent = '🔬 複製狀態數據'; }, 2200); }
            } catch (e) {
                if (b) b.textContent = '❌ 複製失敗：' + (e?.message || e);
            }
        });
        bind('#avs-st-extract', () => win.OS_STATE_RUNTIME?.forceExtract?.());
        bind('#avs-st-deep', async () => {
            if (!confirm('用主模型深度整理目前狀態？\n・合併重複角色（繁簡／別名）\n・移除無關係、無物品、任務無牽扯的純路人\n・按大總結修正過期欄位（如任務其實已完成）\n\n整理前會自動快照，事後可按「還原上一步」撤銷。')) return;
            const b = q('#avs-st-deep'); if (b) { b.textContent = '♻️ 整理中…'; b.classList.add('disabled'); }
            try {
                const r = await win.OS_STATE_RUNTIME?.deepConsolidate?.();
                if (r && r.ok) alert(`✅ 整理完成：合併 ${r.merged}、移除 ${r.removed}、修正 ${r.fixed}`);
                else alert('❌ 整理失敗：' + ((r && r.msg) || '未知錯誤') + '\n（狀態未被更動）');
            } catch (e) { alert('❌ 整理失敗：' + (e?.message || e) + '\n（狀態未被更動）'); }
            _build();
        });
        bind('#avs-st-regen', () => { if (confirm('重新生成追蹤欄位？已記錄的內容會保留。')) win.OS_STATE_SCHEMA?.generate?.(); });
        bind('#avs-st-clearpatches', () => { if (confirm('清空抽取紀錄？追蹤欄位保留。')) win.OS_STATE_RUNTIME?.clearPatches?.(); });
        bind('#avs-st-cross', () => openStateManagerModal());

        // 還原上一步
        bind('#avs-st-rollback', () => {
            if (!eng || snapCount === 0) return;
            if (eng.restore()) _build();
        });
        // 清空目前狀態
        bind('#avs-st-clearstate', () => {
            if (!confirm('確定清空這個故事目前的所有狀態數值？')) return;
            try { eng?.write?.({}); } catch (e) {}   // 酒館模式權威庫在 OS_DB(經 adapter 寫回)——只清 localStorage 清不掉、重開又冒回來
            try { localStorage.removeItem(stateKey); localStorage.removeItem(`avs_snap_${stateKey}`); } catch (e) {}
            _build();
        });
        // 從變數包初始化
        bind('#avs-st-initpack-btn', () => {
            const sel = q('#avs-st-initpack-sel'); if (!sel) return;
            const pack = (_packs || []).find(p => p.id === sel.value);
            if (!pack || !eng) return;
            if (!confirm(`用「${pack.name}」的預設值初始化目前狀態？原本的數值會被覆蓋。`)) return;
            eng.initFromPack(pack); _build();
        });
        // 清理孤兒
        bind('#avs-st-gc', async () => {
            if (!confirm('比對現有劇本，自動刪掉「已被刪除的故事」殘留的狀態資料。\n確定執行？')) return;
            const btn = q('#avs-st-gc'); if (btn) { btn.textContent = '掃描中…'; btn.classList.add('disabled'); }
            try {
                const chapters = (await win.OS_DB?.getAllVnChapters?.()) || [];
                const alive = new Set(chapters.map(c => c.storyId).filter(Boolean));
                const cur = localStorage.getItem('vn_current_story_id'); if (cur) alive.add(cur);
                const del = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && (k.startsWith('avs_state_') || k.startsWith('avs_snap_avs_state_'))) {
                        const id = k.replace('avs_snap_avs_state_', '').replace('avs_state_', '');
                        if (id && id !== 'avs_current_state' && !alive.has(id)) del.push(k);
                    }
                }
                del.forEach(k => localStorage.removeItem(k));
                setTimeout(() => { alert(`✅ 清理完成，回收了 ${del.length} 筆殘留資料。`); _build(); }, 200);
            } catch (e) {
                alert('清理失敗：' + (e?.message || e));
                _build();
            }
        });
    }

    // ── 對外 ─────────────────────────────────────────────────────
    async function renderInto(host, opts) {
        if (!host) return;
        _host = host;
        _packs = (opts && opts.packs) || [];
        await _build();
    }
    function refresh() { _build(); }

    function startEditField(name) { _editingFieldName = name; _page = 'adv'; _advTab = 'fields'; _build(); }
    function startAddField() { _editingFieldName = '__new__'; _page = 'adv'; _advTab = 'fields'; _build(); }
    function cancelEditField() { _editingFieldName = null; _build(); }
    async function saveFieldEdit(originalName) {
        const scope = _host || document;
        const card = scope.querySelector(`.avs-st-field-edit[data-edit-name="${String(originalName).replace(/"/g, '&quot;')}"]`) || scope.querySelector('.avs-st-field-edit');
        if (!card) return;
        const isNew = originalName === '__new__';
        const name = (card.querySelector('[data-edit-key="name"]')?.value || '').trim();
        const type = (card.querySelector('[data-edit-key="type"]')?.value || 'string').trim();
        const desc = (card.querySelector('[data-edit-key="desc"]')?.value || '').trim();
        if (isNew && !name) { alert('請輸入欄位名'); return; }
        if (isNew) { const ok = await win.OS_STATE_SCHEMA?.addField?.(name, { type, desc }); if (!ok) return; }
        else { await win.OS_STATE_SCHEMA?.updateField?.(originalName, { type, desc }); }
        _editingFieldName = null; _build();
    }
    async function deleteFieldConfirm(name) {
        if (!confirm(`刪除欄位「${name}」？\n會從追蹤設定、目前狀態、所有紀錄一起清掉，不可復原。`)) return;
        await win.OS_STATE_SCHEMA?.deleteField?.(name);
        if (_editingFieldName === name) _editingFieldName = null;
        _build();
    }

    // 跨世界管理 modal（亮色，動態建在 parent document）
    function _ensureModal() {
        const doc = win.document || document;
        let modal = doc.getElementById('avs-state-manager-modal');
        if (modal) return modal;
        modal = doc.createElement('div');
        modal.id = 'avs-state-manager-modal';
        modal.className = 'avs-sm-modal';
        modal.innerHTML = `<div class="avs-sm-card">
            <div class="avs-sm-title">🌐 跨世界管理</div>
            <div class="avs-sm-desc">所有曾經開始追蹤過的世界。⭐ = 你現在這個 · 🗑 刪掉單筆</div>
            <div id="avs-state-manager-list" class="avs-sm-list"></div>
            <div class="avs-sm-actions"><button class="avs-btn avs-btn-outline avs-sm-close-btn" id="avs-sm-close">關閉</button></div>
        </div>`;
        (doc.body || doc.documentElement).appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
        modal.querySelector('#avs-sm-close').onclick = () => modal.classList.remove('active');
        return modal;
    }
    async function renderStateManager() {
        const modal = _ensureModal();
        const listEl = modal.querySelector('#avs-state-manager-list');
        if (!listEl) return;
        listEl.innerHTML = '<div class="avs-sm-tip">載入中…</div>';
        if (!win.OS_STATE_RUNTIME?.listAllStateData) { listEl.innerHTML = '<div class="avs-sm-tip err">狀態模組未載入</div>'; return; }
        try {
            const all = await win.OS_STATE_RUNTIME.listAllStateData();
            if (!all.length) { listEl.innerHTML = '<div class="avs-sm-tip">還沒有任何世界開始追蹤</div>'; return; }
            const ctx = win.SillyTavern?.getContext?.();
            const currentId = win.OS_STATE_RUNTIME.normalizeChatId?.(ctx?.chatId) || '';
            listEl.innerHTML = all.map(e => {
                const isCur = e.chatId === currentId;
                const date = e.timestamp ? new Date(e.timestamp).toLocaleString() : '—';
                return `<div class="avs-sm-row${isCur ? ' cur' : ''}">
                    <div class="avs-sm-row-main">
                        <div class="avs-sm-row-id">${isCur ? '⭐ ' : ''}${esc(e.chatId)}</div>
                        <div class="avs-sm-row-meta">欄位 ${e.schemaCount} · 紀錄 ${e.patchesCount} · 目前 ${e.currentCount} 項　·　${date}</div>
                    </div>
                    <button class="avs-sm-del" data-state-del="${esc(e.chatId)}" title="刪除這個世界的狀態資料">🗑</button>
                </div>`;
            }).join('');
            listEl.querySelectorAll('[data-state-del]').forEach(btn => btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-state-del');
                if (!confirm(`刪除 [${id}] 的狀態資料？\n追蹤欄位 + 紀錄 + 目前狀態全部清掉，不可復原。`)) return;
                await win.OS_STATE_RUNTIME.removeStateData(id);
                renderStateManager(); _build();
            }));
        } catch (e) {
            listEl.innerHTML = `<div class="avs-sm-tip err">載入失敗：${esc(String(e?.message || e))}</div>`;
        }
    }
    function openStateManagerModal() { _ensureModal().classList.add('active'); renderStateManager(); }

    // 抽取 / schema 變動事件 → 自動刷新（面板開著時）
    (function hooks() {
        if (!win.eventOn) { setTimeout(hooks, 1000); return; }
        ['AURELIA_STATE_SCHEMA_GENERATED', 'AURELIA_STATE_PATCHED', 'AURELIA_STATE_RUNTIME_TOGGLED', 'AURELIA_STATE_DATA_REMOVED'].forEach(ev => {
            try { win.eventOn(ev, () => { if (_host) _build(); }); } catch (e) {}
        });
    })();

    win.OS_AVS_STATE = { renderInto, refresh, openStateManagerModal, startEditField, startAddField, cancelEditField, saveFieldEdit, deleteFieldConfirm };
    window.OS_AVS_STATE = win.OS_AVS_STATE;
})();
