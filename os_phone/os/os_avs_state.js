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
    let _advOpen = false;

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
                    <div class="avs-st-init-desc">按下面的按鈕，AI 會讀你的世界設定，自動決定要幫你記哪些東西<br>（像是角色好感度、體力、任務、目前場景…）。之後跑團就會自動更新。</div>
                    <button class="avs-btn avs-btn-primary avs-st-init-btn" id="avs-st-init">開始追蹤狀態 ▸</button>
                    <div class="avs-st-init-foot">第一次生成大約 5–30 秒</div>
                </div>
            </div>`;
            const ib = _host.querySelector('#avs-st-init');
            if (ib) ib.onclick = () => win.OS_STATE_SCHEMA?.generate?.();
            return;
        }

        _host.innerHTML = `<div class="avs-st">
            ${storyHtml}

            <div class="avs-card">
                <button class="avs-btn avs-btn-outline avs-st-wide" id="avs-st-copy-diag">🔬 複製狀態數據</button>
            </div>

            <div class="avs-card avs-st-toggle-row">
                <div class="avs-st-toggle-text">
                    <div class="avs-st-toggle-name">即時記錄狀態</div>
                    <div class="avs-st-toggle-desc">開啟後，每次劇情推進都會自動更新下面的狀態</div>
                </div>
                <div class="avs-st-toggle${runtimeOn ? ' on' : ''}" id="avs-st-toggle" role="switch"></div>
            </div>

            <div class="avs-st-current">
                <div class="avs-st-current-hd">📊 目前狀態</div>
                <div class="avs-st-current-body">${_humanize(cur)}</div>
            </div>

            <button class="avs-st-adv-btn${_advOpen ? ' open' : ''}" id="avs-st-adv-btn">⚙️ 進階：追蹤設定與資料管理</button>
            <div class="avs-st-adv${_advOpen ? ' open' : ''}" id="avs-st-adv">
                <div class="avs-st-adv-sec">
                    <div class="avs-st-adv-hd">追蹤欄位（${Object.keys(fields).length}）<span class="avs-st-adv-hint">AI 會盯著這些東西記錄</span></div>
                    <div class="avs-st-field-list">${_renderSchemaList(fields)}</div>
                </div>

                <div class="avs-st-adv-sec">
                    <div class="avs-st-adv-hd">抽取${patchesCount ? `（已記 ${patchesCount} 筆）` : ''}</div>
                    <div class="avs-st-btn-grid">
                        <button class="avs-btn avs-btn-outline" id="avs-st-extract">🛰️ 立即抽一次</button>
                        <button class="avs-btn avs-btn-outline" id="avs-st-regen">🧬 重新生成欄位</button>
                        <button class="avs-btn avs-btn-danger" id="avs-st-clearpatches">🧹 清空抽取紀錄</button>
                    </div>
                </div>

                <div class="avs-st-adv-sec">
                    <div class="avs-st-adv-hd">這個故事的狀態</div>
                    <div class="avs-st-btn-grid">
                        <button class="avs-btn avs-btn-outline${snapCount === 0 ? ' disabled' : ''}" id="avs-st-rollback">↩ 還原上一步${snapCount ? ` (${snapCount})` : ''}</button>
                        <button class="avs-btn avs-btn-danger" id="avs-st-clearstate">清空目前狀態</button>
                    </div>
                    <div class="avs-st-initpack">
                        <select class="avs-select" id="avs-st-initpack-sel">
                            <option value="">用變數包的預設值初始化…</option>
                            ${(_packs || []).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
                        </select>
                        <button class="avs-btn avs-btn-primary" id="avs-st-initpack-btn">套用</button>
                    </div>
                </div>

                <div class="avs-st-adv-sec">
                    <button class="avs-btn avs-btn-outline avs-st-wide" id="avs-st-cross">🌐 跨世界管理 — 所有已追蹤的世界</button>
                    <button class="avs-btn avs-btn-outline avs-st-wide avs-st-gc" id="avs-st-gc">🧹 清理已刪除世界的殘留資料</button>
                </div>
            </div>
        </div>`;

        _bind(stateKey, snapCount);
    }

    function _bind(stateKey, snapCount) {
        const h = _host;
        const q = sel => h.querySelector(sel);
        const eng = win._AVS_ENGINE;

        // 進階摺疊
        const advBtn = q('#avs-st-adv-btn'), adv = q('#avs-st-adv');
        if (advBtn && adv) advBtn.onclick = () => { _advOpen = !_advOpen; advBtn.classList.toggle('open', _advOpen); adv.classList.toggle('open', _advOpen); };

        // 即時記錄開關
        const toggle = q('#avs-st-toggle');
        if (toggle) toggle.onclick = function () {
            const on = this.classList.toggle('on');
            localStorage.setItem('aurelia_state_runtime_enabled', on ? '1' : '0');
            try { win.OS_STATE_RUNTIME?.setEnabled?.(on); } catch (e) {}
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

    function startEditField(name) { _editingFieldName = name; _advOpen = true; _build(); }
    function startAddField() { _editingFieldName = '__new__'; _advOpen = true; _build(); }
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
