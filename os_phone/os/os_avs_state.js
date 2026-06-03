// ----------------------------------------------------------------
// [檔案] os_avs_state.js
// 路徑：os_phone/os/os_avs_state.js
// 職責：AVS「目前狀態」的完整管理 UI —— 從舊 status_panel 的 STATE tab 整段搬來，
//       讓「變數 / 狀態」相關全部集中在 OS 的 🎲 變數工坊，不再散在 RPG 面板。
//       內容：即時抽取開關、schema 追蹤欄位 CRUD、當前狀態值列表、
//             重生 schema / 立即抽 / 清 patches、跨世界 state 管理 modal。
// 依賴：window.OS_STATE_SCHEMA（generate / addField / updateField / deleteField）
//       window.OS_STATE_RUNTIME（forceExtract / clearPatches / getActiveSchema /
//                                 listAllStateData / removeStateData / normalizeChatId / setEnabled）
//       window.OS_DB.getStateData、window._AVS_ENGINE.read
// 對外：window.OS_AVS_STATE = { renderInto, refresh, openStateManagerModal, 欄位 CRUD API }
// 樣式：沿用 rpg_status_panel.css 既有的 .st-* class；本檔新增的容器 class 在 css/os_avs.css
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    console.log('[AVS State] 載入 os_avs_state.js（STATE 管理已併入 AVS）');

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    let _editingFieldName = null; // null / 欄位名 / '__new__'
    let _host = null;             // 渲染容器，refresh 時重繪

    const MAIN_HTML = `
        <div class="avs-state-wrap">
            <div id="avs-state-loading" class="st-loading avs-state-hidden"><div class="st-loading-icon">◌</div>SCANNING STATE</div>

            <div id="avs-state-init" class="avs-state-hidden">
                <div class="st-init-card">
                    <div class="st-init-icon">🛰</div>
                    <div class="st-init-title">這個世界尚未生成 schema</div>
                    <div class="st-init-desc">主模型會讀世界書 + 角色卡 + 開頭劇情<br>自動決定本世界要追蹤的狀態欄位<br><span class="avs-state-init-hint">好感度 · 倒計時 · 任務 · 場景 · …</span></div>
                    <button class="st-init-btn" id="avs-state-init-btn">INITIALIZE  ▸</button>
                    <div class="st-init-footnote">主模型一次性生成（5-30 秒）<br>之後每輪自動更新由副模型負責</div>
                </div>
            </div>

            <div id="avs-state-main" class="avs-state-hidden">
                <div class="st-card">
                    <div class="st-toggle-row">
                        <div class="st-toggle-row-label">
                            <div class="st-toggle-row-name">啟用即時抽取</div>
                            <div class="st-toggle-row-desc">每輪主模型回覆後，副模型按 schema 抽變化</div>
                        </div>
                        <div class="avs-state-toggle" id="avs-state-runtime-toggle"></div>
                    </div>
                </div>

                <div class="st-card">
                    <div class="st-subtab-bar">
                        <button class="st-subtab-btn active" data-subtab="schema">Schema · 追蹤欄位<span class="st-subtab-count" id="avs-state-schema-count">0</span></button>
                        <button class="st-subtab-btn" data-subtab="current">Current · 當前狀態<span class="st-subtab-count" id="avs-state-patches-count">0</span></button>
                    </div>
                    <div class="st-subtab-content active" data-subcontent="schema"><div id="avs-state-schema-list" class="st-field-list"></div></div>
                    <div class="st-subtab-content" data-subcontent="current"><div id="avs-state-current-list" class="st-current-list"></div></div>
                </div>

                <div class="avs-state-note">行為規則編輯在「🎭 模式」分頁 / 變數包卡片的「⚡ 規則」</div>

                <div class="st-btn-row">
                    <button class="st-btn" id="avs-state-regen">🧬 重生</button>
                    <button class="st-btn" id="avs-state-extract">🛰️ 立即抽</button>
                    <button class="st-btn st-btn-danger" id="avs-state-clearpatches">🧹 清 patches</button>
                </div>

                <button class="st-btn-ghost" id="avs-state-cross">🌐 跨世界管理 — 所有已生成 schema 的世界</button>
            </div>
        </div>`;

    const TYPE_OPTIONS = ['string', 'number', 'enum', 'list'];
    function renderFieldEdit(name, type, desc, isNew) {
        const dataName = isNew ? '__new__' : name;
        const safeOriginal = escapeHtml(dataName).replace(/'/g, '&#39;');
        return `<div class="st-field-edit" data-edit-name="${escapeHtml(dataName)}">
            <div class="st-field-edit-row"><span class="st-field-edit-label">名稱</span>
                <input class="st-field-edit-input" data-edit-key="name" ${isNew ? 'data-edit-focus placeholder="例：體力 / 心情 / 任務" value=""' : `value="${escapeHtml(name)}" disabled`} /></div>
            <div class="st-field-edit-row"><span class="st-field-edit-label">類型</span>
                <select class="st-field-edit-input" data-edit-key="type">${TYPE_OPTIONS.map(t => `<option value="${t}" ${t === type ? 'selected' : ''}>${t.toUpperCase()}</option>`).join('')}</select></div>
            <div class="st-field-edit-row"><span class="st-field-edit-label">描述</span>
                <textarea class="st-field-edit-textarea" data-edit-key="desc" ${isNew ? '' : 'data-edit-focus'} placeholder="這欄位記什麼，何時會變">${escapeHtml(desc || '')}</textarea></div>
            <div class="st-field-edit-actions">
                <button class="st-field-edit-btn cancel" onclick="window.OS_AVS_STATE.cancelEditField()">取消</button>
                <button class="st-field-edit-btn" onclick="window.OS_AVS_STATE.saveFieldEdit('${safeOriginal}')">${isNew ? '新增' : '儲存'}</button>
            </div></div>`;
    }

    function renderInto(host) {
        if (!host) return;
        _host = host;
        host.innerHTML = MAIN_HTML;

        const initBtn = host.querySelector('#avs-state-init-btn');
        if (initBtn) initBtn.onclick = () => win.OS_STATE_SCHEMA?.generate?.();

        // 子 tab（Schema / Current）切換
        const subBtns = host.querySelectorAll('.st-subtab-btn');
        const subContents = host.querySelectorAll('.st-subtab-content');
        subBtns.forEach(btn => btn.onclick = function () {
            subBtns.forEach(b => b.classList.remove('active')); this.classList.add('active');
            subContents.forEach(c => c.classList.toggle('active', c.getAttribute('data-subcontent') === this.getAttribute('data-subtab')));
        });

        // 即時抽取開關
        const toggle = host.querySelector('#avs-state-runtime-toggle');
        if (toggle) {
            toggle.classList.toggle('on', localStorage.getItem('aurelia_state_runtime_enabled') === '1');
            toggle.onclick = function () {
                const on = this.classList.toggle('on');
                localStorage.setItem('aurelia_state_runtime_enabled', on ? '1' : '0');
                try { win.OS_STATE_RUNTIME?.setEnabled?.(on); } catch (e) {}
            };
        }

        const bind = (sel, fn) => { const b = host.querySelector(sel); if (b) b.onclick = fn; };
        bind('#avs-state-regen', () => { if (confirm('重新生成 schema？舊 patches 保留。')) win.OS_STATE_SCHEMA?.generate?.(); });
        bind('#avs-state-extract', () => win.OS_STATE_RUNTIME?.forceExtract?.());
        bind('#avs-state-clearpatches', () => { if (confirm('清空所有 state patches？schema 保留。')) win.OS_STATE_RUNTIME?.clearPatches?.(); });
        bind('#avs-state-cross', () => openStateManagerModal());

        refresh();
    }

    async function refresh() {
        try {
            if (!_host) return;
            const loading = _host.querySelector('#avs-state-loading');
            const initV = _host.querySelector('#avs-state-init');
            const mainV = _host.querySelector('#avs-state-main');
            if (!loading || !initV || !mainV) return;
            loading.classList.remove('avs-state-hidden');
            initV.classList.add('avs-state-hidden');
            mainV.classList.add('avs-state-hidden');

            const ctx = win.SillyTavern?.getContext?.();
            const chatId = ctx?.chatId || '';
            if (!chatId || !win.OS_DB?.getStateData) {
                loading.classList.add('avs-state-hidden');
                initV.classList.remove('avs-state-hidden');
                return;
            }

            const data = await win.OS_DB.getStateData(chatId);
            const fields = await win.OS_STATE_RUNTIME?.getActiveSchema?.();
            loading.classList.add('avs-state-hidden');

            const hasSchema = fields && Object.keys(fields).length > 0;
            if (!hasSchema) { initV.classList.remove('avs-state-hidden'); return; }
            mainV.classList.remove('avs-state-hidden');

            const cur = win._AVS_ENGINE?.read?.() || data?.current || {};
            const patches = data?.patches || {};
            const scEl = _host.querySelector('#avs-state-schema-count');
            const pcEl = _host.querySelector('#avs-state-patches-count');
            const schemaList = _host.querySelector('#avs-state-schema-list');
            const currentList = _host.querySelector('#avs-state-current-list');
            if (scEl) scEl.textContent = Object.keys(fields).length;
            if (pcEl) pcEl.textContent = Object.keys(patches).length;

            if (schemaList) {
                let html = Object.entries(fields).map(([name, def]) => {
                    const type = (def && def.type) || '?';
                    const desc = (def && def.desc) || '';
                    if (_editingFieldName === name) return renderFieldEdit(name, type, desc, false);
                    return `<div class="st-field-item">
                        <div class="st-field-actions">
                            <button class="st-field-action-btn" onclick="window.OS_AVS_STATE.startEditField('${escapeHtml(name).replace(/'/g, '&#39;')}')" title="編輯">✏</button>
                            <button class="st-field-action-btn danger" onclick="window.OS_AVS_STATE.deleteFieldConfirm('${escapeHtml(name).replace(/'/g, '&#39;')}')" title="刪除">×</button>
                        </div>
                        <div class="st-field-row"><span class="st-field-name">${escapeHtml(name)}</span><span class="st-field-type">${escapeHtml(type)}</span></div>
                        ${desc ? `<div class="st-field-desc">${escapeHtml(desc)}</div>` : ''}</div>`;
                }).join('');
                if (_editingFieldName === '__new__') html += renderFieldEdit('', 'string', '', true);
                else html += `<div class="st-field-add" onclick="window.OS_AVS_STATE.startAddField()">＋ 添加自訂欄位</div>`;
                schemaList.innerHTML = html;
                setTimeout(() => { const f = schemaList.querySelector('[data-edit-focus]'); if (f) f.focus(); }, 50);
            }

            if (currentList) {
                const keys = Object.keys(cur);
                if (!keys.length) {
                    currentList.innerHTML = `<div class="st-empty"><div class="st-empty-icon">◇</div><div class="st-empty-text">尚未抽取狀態變化</div><div class="st-empty-hint">開啟即時抽取後等下一輪劇情<br>或按下方「立即抽」</div></div>`;
                } else {
                    currentList.innerHTML = keys.map(k => {
                        const v = cur[k];
                        const vStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
                        return `<div class="st-current-row"><span class="st-current-key">${escapeHtml(k)}</span><span class="st-current-value">${escapeHtml(vStr)}</span></div>`;
                    }).join('');
                }
            }
        } catch (e) { console.warn('[AVS State] refresh 失敗:', e); }
    }

    // === schema 欄位 CRUD ===
    function startEditField(name) { _editingFieldName = name; refresh(); }
    function startAddField() { _editingFieldName = '__new__'; refresh(); }
    function cancelEditField() { _editingFieldName = null; refresh(); }
    async function saveFieldEdit(originalName) {
        const scope = _host || document;
        const card = scope.querySelector(`.st-field-edit[data-edit-name="${String(originalName).replace(/"/g, '&quot;')}"]`) || scope.querySelector('.st-field-edit');
        if (!card) return;
        const isNew = originalName === '__new__';
        const name = (card.querySelector('[data-edit-key="name"]')?.value || '').trim();
        const type = (card.querySelector('[data-edit-key="type"]')?.value || 'string').trim();
        const desc = (card.querySelector('[data-edit-key="desc"]')?.value || '').trim();
        if (isNew && !name) { alert('請輸入欄位名'); return; }
        if (isNew) { const ok = await win.OS_STATE_SCHEMA?.addField?.(name, { type, desc }); if (!ok) return; }
        else { await win.OS_STATE_SCHEMA?.updateField?.(originalName, { type, desc }); }
        _editingFieldName = null; refresh();
    }
    async function deleteFieldConfirm(name) {
        if (!confirm(`刪除欄位「${name}」？\n會從 schema、current、所有 patches 一起清掉，不可復原。`)) return;
        await win.OS_STATE_SCHEMA?.deleteField?.(name);
        if (_editingFieldName === name) _editingFieldName = null;
        refresh();
    }

    // === 跨世界管理 modal（動態建在 parent document，避免 id 撞）===
    function _ensureModal() {
        const doc = win.document || document;
        let modal = doc.getElementById('avs-state-manager-modal');
        if (modal) return modal;
        modal = doc.createElement('div');
        modal.id = 'avs-state-manager-modal';
        modal.className = 'avs-sm-modal';
        modal.innerHTML = `<div class="avs-sm-card">
            <div class="avs-sm-title">🌐 跨世界 STATE 管理</div>
            <div class="avs-sm-desc">所有曾經 INITIALIZE 過的世界資料。<br>⭐ = 當前 chatId · 🗑 刪除單筆 · 酒館刪 chat 時會自動清</div>
            <div id="avs-state-manager-list" class="avs-sm-list"></div>
            <div class="avs-sm-actions"><button class="avs-sm-close-btn" id="avs-sm-close">關閉</button></div>
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
        listEl.innerHTML = '<div class="avs-sm-tip">載入中...</div>';
        if (!win.OS_STATE_RUNTIME?.listAllStateData) { listEl.innerHTML = '<div class="avs-sm-tip err">OS_STATE_RUNTIME 未載入</div>'; return; }
        try {
            const all = await win.OS_STATE_RUNTIME.listAllStateData();
            if (!all.length) { listEl.innerHTML = '<div class="avs-sm-tip">尚未有任何世界生成過 schema</div>'; return; }
            const ctx = win.SillyTavern?.getContext?.();
            const currentId = win.OS_STATE_RUNTIME.normalizeChatId?.(ctx?.chatId) || '';
            listEl.innerHTML = all.map(e => {
                const isCur = e.chatId === currentId;
                const date = e.timestamp ? new Date(e.timestamp).toLocaleString() : '—';
                return `<div class="avs-sm-row${isCur ? ' cur' : ''}">
                    <div class="avs-sm-row-main">
                        <div class="avs-sm-row-id">${isCur ? '⭐ ' : ''}${escapeHtml(e.chatId)}</div>
                        <div class="avs-sm-row-meta">欄位 ${e.schemaCount} · patches ${e.patchesCount} · 當前 ${e.currentCount} 項<br>最後更新：${date}</div>
                    </div>
                    <button class="avs-sm-del" data-state-del="${escapeHtml(e.chatId)}" title="刪除此世界資料">🗑</button>
                </div>`;
            }).join('');
            listEl.querySelectorAll('[data-state-del]').forEach(btn => btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-state-del');
                if (!confirm(`確定刪除 [${id}] 的 state 資料？\nschema + patches + current 全部清掉，不可復原。`)) return;
                await win.OS_STATE_RUNTIME.removeStateData(id);
                renderStateManager(); refresh();
            }));
        } catch (e) {
            listEl.innerHTML = `<div class="avs-sm-tip err">載入失敗：${escapeHtml(String(e?.message || e))}</div>`;
        }
    }
    function openStateManagerModal() { _ensureModal().classList.add('active'); renderStateManager(); }

    // 副模型抽取 / schema 變動事件 → 自動刷新（面板開著時）
    (function hooks() {
        if (!win.eventOn) { setTimeout(hooks, 1000); return; }
        ['AURELIA_STATE_SCHEMA_GENERATED', 'AURELIA_STATE_PATCHED', 'AURELIA_STATE_RUNTIME_TOGGLED', 'AURELIA_STATE_DATA_REMOVED'].forEach(ev => {
            try { win.eventOn(ev, () => refresh()); } catch (e) {}
        });
    })();

    win.OS_AVS_STATE = { renderInto, refresh, openStateManagerModal, startEditField, startAddField, cancelEditField, saveFieldEdit, deleteFieldConfirm };
    window.OS_AVS_STATE = win.OS_AVS_STATE;
})();
