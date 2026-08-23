// ----------------------------------------------------------------
// [檔案] os_worldbook.js (V2.2 - 頂層排版熱修復 + 書包邏輯完整版)
// 路徑：os_phone/os/os_worldbook.js
// 職責：奧瑞亞獨立世界書系統
//   - 修復：還原 V1.6 最穩定的 Flex Header 排版，解決 CSS Grid 導致的擠壓破圖
//   - 核心：世界書包 (Book) 系統，與「分類 (Category)」徹底分離
//   - 升級：支援向下兼容，自動將舊版「角色卡分類」升格為「獨立書包」
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const LSKEY_BOOKS = 'os_worldbook_books';
    const DEFAULT_CATS = ['預設', '角色設定', '世界觀', '規則設定', '故事背景', '物品', '其他'];
    const DEFAULT_BOOKS = ['預設書包'];

    // ── 樣式注入 ────────────────────────────────────────────────────

    // ── 資料存取 ────────────────────────────────────────────────────

    function getBooks() {
        try { return JSON.parse(localStorage.getItem(LSKEY_BOOKS)) || [...DEFAULT_BOOKS]; }
        catch(e) { return [...DEFAULT_BOOKS]; }
    }
    function saveBooks(books) { localStorage.setItem(LSKEY_BOOKS, JSON.stringify(books)); }

    // ── 常駐書包（＝酒館的「全域世界書」）─────────────────────────────
    //   藏書自己掛的書包存在 vn_active_wb_packs（每本一份，開書時由書架寫入）。
    //   但「格式協議／BGM 清單／音效清單」這種東西是跨故事的同一份，
    //   逐本掛＝每開一本新書就要記得掛一次，漏掛不會報錯、只會安靜地少注入。
    //   標成常駐的書包每本書都會併進去，且不佔那本書自己的插槽。
    const LSKEY_GLOBAL = 'vn_global_wb_packs';
    function getGlobalPacks() {
        try { const a = JSON.parse(localStorage.getItem(LSKEY_GLOBAL) || '[]'); return Array.isArray(a) ? a : []; }
        catch(e) { return []; }
    }
    function saveGlobalPacks(list) {
        try { localStorage.setItem(LSKEY_GLOBAL, JSON.stringify([...new Set(list || [])])); } catch(e) {}
    }
    function getStoryPacks() {
        try { const a = JSON.parse(localStorage.getItem('vn_active_wb_packs') || '[]'); return Array.isArray(a) ? a : []; }
        catch(e) { return []; }
    }

    // ── 格式匯入 ────────────────────────────────────────────────────
    function importFromST(json, targetBookName) {
        const entries = [];
        const src = json.entries || json;
        const items = Array.isArray(src) ? src : Object.values(src);
        
        items.forEach((e, i) => {
            const cat = e.group && e.group.trim() ? e.group.trim() : '預設';
            // 🚨 觸發關鍵字：酒館「匯出世界書」的欄位叫 `key`，只有助手 API 那條路才叫 `keyword`。
            //    以前只讀 keyword → 匯入真的酒館檔案時每一條的關鍵字都被靜靜丟掉，
            //    而 PWA 的規則是「沒填關鍵字＝常駐」→ 整本書每輪全部注入（五種曲風的 BGM 清單一起送）。
            // 🔵 constant（藍燈）＝酒館的無條件常駐，語意剛好就是 PWA 的「關鍵字留空」→ 不帶 keys。
            let keyStr = '';
            if (!e.constant) {
                const k = (e.keyword !== undefined) ? e.keyword : e.key;
                if (Array.isArray(k)) keyStr = k.join(',');
                else if (typeof k === 'string') keyStr = k;
            }

            entries.push({
                id: 'wb_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2,6),
                book: targetBookName, // 🔥 強制綁定到指定的書包
                title: (e.comment || e.name || `條目 ${i + 1}`).trim(),
                content: (e.content || '').trim(),
                category: cat,
                keys: keyStr.trim(),
                enabled: !(e.disable || e.disabled || false),
                order: parseInt(e.order) || parseInt(e.displayIndex) || 0,
                depth: _stDepth(e),   // 酒館 @D 的深度；null＝跟著「世界書」那一格
                role: _stRole(e),     // @D 的身分：0系統 1使用者 2AI
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        });
        return entries;
    }

    // ── 以下三個換算完全照抄酒館 public/scripts/world-info.js，別憑印象改 ──
    //   world_info_position = { before:0, after:1, ANTop:2, ANBottom:3, atDepth:4, EMTop:5, EMBottom:6, outlet:7 }
    //   DEFAULT_DEPTH = 4（position:4 沒寫 depth 時用這個，不是 0）
    //   extension_prompt_roles = { SYSTEM:0, USER:1, ASSISTANT:2 }
    const ST_DEFAULT_DEPTH = 4;
    // 🚨 兩種來源、兩種形狀：
    //   ① 世界書 JSON（.json 匯入）→ position/depth/role 直接在條目頂層
    //   ② 角色卡自帶的 character_book → 頂層 position 是 'before_char'/'after_char' 這種字串，
    //      真正的酒館欄位全部塞在 entry.extensions 裡（position:1, depth:4, role:0…）
    //   兩邊都要吃得到，不然卡片自帶的書一律被當成「不用 @D」。
    function _stFields(e) {
        const x = (e && e.extensions) || {};
        const pick = (a, b) => (a !== undefined && a !== null) ? a : b;
        return {
            pos: pick(x.position, e && e.position),
            dep: pick(x.depth, e && e.depth),
            rol: pick(x.role, e && e.role),
        };
    }
    // 酒館的 position:4 就是 @D；depth 的定義完全照抄：0＝插在最新一則之後，N＝倒數第 N 則之前。
    //   其他 position（0-3 都是插在角色定義前後）在 PWA 沒有對應的位置 →
    //   回 null＝維持舊行為：跟著提示詞順序表上「世界書」那一格走。
    //   🚨 匯入時不換算的話，整本書的深度設定就全丟了：條目全部堆在劇情歷史之前，
    //      被幾千字的歷史蓋過去 —— 「酒館每次都給頭像、PWA 老是掉」就是這樣來的。
    function _stDepth(e) {
        if (!e) return null;
        const f = _stFields(e);
        const pos = (f.pos === undefined || f.pos === null) ? null : parseInt(f.pos, 10);
        if (pos !== 4) return null;                            // 'after_char' 之類會 parseInt→NaN，自然落在這
        const d = parseInt(f.dep, 10);
        return isNaN(d) ? ST_DEFAULT_DEPTH : Math.max(0, d);   // 酒館 DEFAULT_DEPTH=4
    }
    // @D 的身分：0＝系統、1＝使用者、2＝AI（酒館 extension_prompt_roles）。只有 @D 條目有意義。
    function _stRole(e) {
        if (!e) return 0;
        const r = parseInt(_stFields(e).rol, 10);
        return (r === 1 || r === 2) ? r : 0;
    }
    function _entryRole(e) {
        const r = parseInt(e && e.role, 10);
        return (r === 1 || r === 2) ? r : 0;
    }
    // 條目上的深度值 → 數字或 null（空字串/負數/非數字都當沒設定）
    function _entryDepth(e) {
        if (!e || e.depth === undefined || e.depth === null || e.depth === '') return null;
        const d = parseInt(e.depth, 10);
        return isNaN(d) ? null : Math.max(0, d);
    }

    // ── HTML 結構 (🔥 已完全退回 V1.6 的 Inline Flex 排版) ──────────
    function buildHTML() {
        return `
        <div class="wb-app" id="wb-root">
          <div class="wb-header">
            <button onclick="goHome()" title="返回大廳" class="wb-back-btn wb-header-btn-hover">‹</button>
            <span class="wb-title">世界書工坊</span>
            <button id="wb-settings-btn" title="系統管理" class="wb-settings-btn wb-header-btn-hover"><i class="fa-solid fa-gear"></i></button>
          </div>

          <div class="wb-tool-bar">
            <div class="wb-book-row">
              <span style="font-size:18px; color:#1A1C28;" title="當前書包">📚</span>
              <select id="wb-book-select" class="wb-book-select"></select>
              <button id="wb-global-btn" class="wb-book-btn"><i class="fa-regular fa-bookmark"></i> 每本都用</button>
              <button id="wb-new-book-btn" class="wb-book-btn" title="創建新世界書包">＋ 創建</button>
              <button id="wb-del-book-btn" class="wb-book-btn danger" title="刪除當前書包">🗑️</button>
            </div>
            <input class="wb-search" id="wb-search" placeholder="搜尋條目或關鍵字..." />
          </div>

          <div style="position:relative;flex:1;overflow:hidden;display:flex;flex-direction:column;">
            <div class="wb-list" id="wb-list"></div>
            <button class="wb-fab" id="wb-add-btn" title="新增條目">＋</button>
          </div>

          <div class="wb-overlay hidden" id="wb-edit-overlay">
            <div class="wb-form">
              <div class="wb-form-header">
                <span class="wb-form-title-text" id="wb-form-title">新增條目</span>
                <button class="wb-form-cancel" id="wb-form-cancel">取消</button>
                <button class="wb-form-save" id="wb-form-save">儲存</button>
              </div>
              <div class="wb-form-body">
                <div class="wb-field">
                  <label>條目標題</label>
                  <input type="text" id="wb-f-title" placeholder="例：奧瑞亞·星野 基本設定" />
                </div>
                <div class="wb-field wb-field-inline">
                  <div class="wb-field-cell">
                    <label>權重(Order)</label>
                    <input type="number" id="wb-f-order" value="0" style="text-align:center;" />
                  </div>
                  <div class="wb-field-cell">
                    <label>位置</label>
                    <select id="wb-f-pos">
                      <option value="">角色定義之前／之後（不用 @D）</option>
                      <option value="0">@D ⚙ 在系統深度</option>
                      <option value="1">@D 👤 在使用者深度</option>
                      <option value="2">@D 🤖 在 AI 深度</option>
                    </select>
                  </div>
                  <div class="wb-field-cell">
                    <label>深度</label>
                    <input type="number" id="wb-f-depth" min="0" placeholder="留空" style="text-align:center;" />
                    <div class="wb-field-hint">跟酒館一樣：0＝插在最新一則之後，1＝倒數第 1 則之前。位置選「不用 @D」時這格沒作用。</div>
                  </div>
                </div>
                
                <div class="wb-field">
                  <label>觸發關鍵字 (輸入後按 Enter 建立標籤，留空則常駐)</label>
                  <div class="wb-tag-box" id="wb-tag-box" onclick="document.getElementById('wb-f-keys-input').focus()">
                    <input type="text" class="wb-tag-input" id="wb-f-keys-input" placeholder="新增標籤..." autocomplete="off" />
                  </div>
                  <details class="wb-tag-fold">
                    <summary class="wb-tag-fold-sum">📚 點擊快速加入<span class="wb-tag-fold-n" id="wb-tag-sug-count"></span></summary>
                    <div class="wb-tag-sug-area" id="wb-tag-suggestions"></div>
                  </details>
                </div>
                <div class="wb-field-row">
                  <label>允許注入 (啟用)</label>
                  <label class="wb-toggle">
                    <input type="checkbox" id="wb-f-enabled" checked />
                    <span class="wb-toggle-slider"></span>
                  </label>
                </div>
                <div class="wb-field" style="flex:1">
                  <label>條目內容</label>
                  <textarea id="wb-f-content" placeholder="在這裡輸入設定..."></textarea>
                </div>
              </div>
            </div>
          </div>

          <div class="wb-overlay hidden" id="wb-cfg-overlay">
            <div class="wb-form">
              <div class="wb-form-header">
                <span class="wb-form-title-text">⚙️ 系統管理</span>
                <button class="wb-form-cancel" id="wb-cfg-close">關閉</button>
              </div>
              <div class="wb-settings">
                <div class="wb-section">
                  <div class="wb-section-title">📂 匯入 / 匯出</div>
                  <button class="wb-btn wb-btn-secondary" id="wb-import-st-btn">📥 匯入世界書 JSON</button>
                  <button class="wb-btn wb-btn-secondary" id="wb-export-btn">📤 匯出書包…</button>
                  <input type="file" id="wb-file-input" accept=".json" style="display:none" />
                </div>
                <div class="wb-section">
                  <div class="wb-section-title" style="color:#fc8181">⚠️ 危險操作</div>
                  <button class="wb-btn wb-btn-danger" id="wb-clear-all-btn">🗑 銷毀所有書包與條目</button>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    }

    let _entries = [];
    let _activeBook = '預設書包';
    let _editingId = null;
    let _searchQuery = '';
    let _currentTags = [];

    // ── UI 渲染 ────────────────────────────────────────────────────
    function renderBookSelector(root) {
        const sel = root.querySelector('#wb-book-select');
        const books = getBooks();
        
        if (!books.includes(_activeBook) && books.length > 0) {
            _activeBook = books[0];
        }

        sel.innerHTML = books.map(b => `<option value="${escHtml(b)}" ${b === _activeBook ? 'selected' : ''}>${escHtml(b)}</option>`).join('');
        renderGlobalBtn(root);
    }

    // 「每本都用」的亮暗狀態跟著當前書包走
    function renderGlobalBtn(root) {
        const btn = root.querySelector('#wb-global-btn');
        if (!btn) return;
        const on = getGlobalPacks().includes(_activeBook);
        btn.classList.toggle('on', on);
        btn.innerHTML = `<i class="fa-${on ? 'solid' : 'regular'} fa-bookmark"></i> 每本都用`;
        btn.title = on
            ? `「${_activeBook}」每本書都會讀到，點一下取消`
            : `讓「${_activeBook}」每本書都讀得到（不佔那本書自己的欄位）`;
    }

    function renderList(root) {
        const list = root.querySelector('#wb-list');
        
        // 1. 先過濾出屬於當前「書包」的條目
        let filtered = _entries.filter(e => e.book === _activeBook);
        
        // 3. 搜尋過濾
        if (_searchQuery) {
            const q = _searchQuery.toLowerCase();
            filtered = filtered.filter(e => 
                e.title.toLowerCase().includes(q) || 
                e.content.toLowerCase().includes(q) ||
                // 🔥 修復：強制轉成字串防呆
                (e.keys && String(e.keys).toLowerCase().includes(q))
            );
        }

        // 4. 排序
        filtered.sort((a, b) => {
            const aOrder = parseInt(a.order) || 0;
            const bOrder = parseInt(b.order) || 0;
            if (bOrder !== aOrder) return bOrder - aOrder;
            return b.updatedAt - a.updatedAt; 
        });

        if (filtered.length === 0) {
            list.innerHTML = `
                <div class="wb-empty">
                    <div class="wb-empty-icon">📭</div>
                    <div>${_searchQuery ? '找不到符合的條目' : `「${escHtml(_activeBook)}」書包目前是空的<br>點擊右下角 ＋ 開始建立`}</div>
                </div>`;
            return;
        }

        list.innerHTML = filtered.map(e => {
            // 關鍵字只先亮 KEY_PREVIEW 個，其餘收在「+N」後面。
            // 一條動輒五六十個關鍵字，全攤開會把單張卡撐成整頁，整份書就只剩滾軸可看。
            let keysHtml = '<div class="wb-entry-keys-wrap"><span class="wb-entry-keys wb-keys-const">📌 常駐</span></div>';
            // 🔥 修復：強制轉成字串，防止舊資料格式報錯
            const keyList = e.keys ? String(e.keys).split(',').map(k => k.trim()).filter(k => k) : [];
            if (keyList.length) {
                const KEY_PREVIEW = 6;
                // 搜尋命中的關鍵字可能剛好被收在後面，那樣「搜得到卻看不到」；命中就預設攤開
                const hitBySearch = _searchQuery && keyList.some(k => k.toLowerCase().includes(_searchQuery.toLowerCase()));
                const chips = keyList.map((k, i) =>
                    `<span class="wb-key-chip${i >= KEY_PREVIEW ? ' wb-key-extra' : ''}">#${escHtml(k)}</span>`
                ).join('');
                const hidden = keyList.length - KEY_PREVIEW;
                const moreBtn = hidden > 0
                    ? `<button class="wb-key-more" data-n="${hidden}">${hitBySearch ? '收合' : '+' + hidden}</button>`
                    : '';
                keysHtml = `<div class="wb-entry-keys-wrap${hitBySearch ? ' open' : ''}">${chips}${moreBtn}</div>`;
            }
            const orderLabel = (e.order && parseInt(e.order) !== 0) ? `<span class="wb-entry-order">Order: ${e.order}</span>` : '';
            const _roleIcon = ['⚙', '👤', '🤖'][_entryRole(e)] || '⚙';
            const depthLabel = (_entryDepth(e) !== null) ? `<span class="wb-entry-depth">@D${_roleIcon}${_entryDepth(e)}</span>` : '';

            return `
            <div class="wb-entry${e.enabled ? '' : ' disabled'}" data-id="${e.id}">
                <label class="wb-toggle">
                    <input type="checkbox" class="wb-toggle-chk" data-id="${e.id}" ${e.enabled ? 'checked' : ''} />
                    <span class="wb-toggle-slider"></span>
                </label>
                <div class="wb-entry-info">
                    <div class="wb-entry-title">
                        ${escHtml(e.title)}
                        ${orderLabel}${depthLabel}
                    </div>
                    <div class="wb-entry-meta">
                        <span>${e.content.length} 字</span>
                    </div>
                    ${keysHtml}
                </div>
                <div style="display:flex; gap:2px; flex-shrink:0;">
                    <button class="wb-entry-edit" data-id="${e.id}" title="編輯">✏️</button>
                    <button class="wb-entry-del" data-id="${e.id}" title="刪除">🗑️</button>
                </div>
            </div>`;
        }).join('');

        // 綁定事件
        list.querySelectorAll('.wb-toggle-chk').forEach(chk => {
            chk.addEventListener('change', async () => {
                const entry = _entries.find(e => e.id === chk.dataset.id);
                if (!entry) return;
                entry.enabled = chk.checked;
                await win.OS_DB.saveWorldbookEntry(entry);
                const card = list.querySelector(`.wb-entry[data-id="${entry.id}"]`);
                if (card) card.classList.toggle('disabled', !entry.enabled);
            });
        });

        list.querySelectorAll('.wb-key-more').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const wrap = btn.closest('.wb-entry-keys-wrap');
                if (!wrap) return;
                const open = wrap.classList.toggle('open');
                btn.textContent = open ? '收合' : `+${btn.dataset.n}`;
            });
        });

        list.querySelectorAll('.wb-entry-edit').forEach(btn => {
            btn.addEventListener('click', () => openEditForm(root, btn.dataset.id));
        });
        
        list.querySelectorAll('.wb-entry-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteEntry(root, btn.dataset.id);
            });
        });
    }

    // ── 表單與 Tag 編輯 ────────────────────────────────────────────────────
    function renderTagEditor(root) {
        const box = root.querySelector('#wb-tag-box');
        const input = root.querySelector('#wb-f-keys-input');
        const sugArea = root.querySelector('#wb-tag-suggestions');

        box.querySelectorAll('.wb-tag-item').forEach(el => el.remove());

        _currentTags.forEach((tag, idx) => {
            const el = document.createElement('span');
            el.className = 'wb-tag-item';
            el.innerHTML = `${escHtml(tag)} <button class="wb-tag-remove" data-idx="${idx}" title="移除">×</button>`;
            box.insertBefore(el, input);
        });

        box.querySelectorAll('.wb-tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); 
                _currentTags.splice(btn.dataset.idx, 1);
                renderTagEditor(root);
            });
        });

        const allTags = new Set();
        // 只推薦同一個書包裡的 Tag
        _entries.filter(e => e.book === _activeBook).forEach(e => {
            if (e.keys) {
                // 🔥 修復：強制轉成字串，防止舊資料格式報錯
                String(e.keys).split(',').forEach(k => {
                    const tk = k.trim();
                    if (tk) allTags.add(tk);
                });
            }
        });

        const suggestions = Array.from(allTags).filter(t => !_currentTags.includes(t));
        const cnt = root.querySelector('#wb-tag-sug-count');
        if (cnt) cnt.textContent = suggestions.length ? `（${suggestions.length}）` : '（0）';

        if (suggestions.length === 0) {
            sugArea.innerHTML = '<span style="color:rgba(26,28,40,0.72); font-size:10px;">(當前書包無其他可用標籤)</span>';
        } else {
            sugArea.innerHTML = suggestions.map(t =>
                `<button class="wb-tag-sug" data-tag="${escHtml(t)}">+ ${escHtml(t)}</button>`
            ).join('');

            sugArea.querySelectorAll('.wb-tag-sug').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    _currentTags.push(btn.dataset.tag);
                    renderTagEditor(root); 
                });
            });
        }
    }

    function openAddForm(root) {
        if (!_activeBook) {
            alert('請先選擇或創建一個世界書包！');
            return;
        }
        _editingId = null;
        root.querySelector('#wb-form-title').textContent = `新增條目至「${_activeBook}」`;
        root.querySelector('#wb-f-title').value = '';
        root.querySelector('#wb-f-order').value = '0';
        root.querySelector('#wb-f-depth').value = '';
        root.querySelector('#wb-f-pos').value = '';
        root.querySelector('#wb-f-content').value = '';
        root.querySelector('#wb-f-enabled').checked = true;
        
        _currentTags = [];
        root.querySelector('#wb-f-keys-input').value = '';
        renderTagEditor(root);

        root.querySelector('#wb-edit-overlay').classList.remove('hidden');
    }

    function openEditForm(root, id) {
        const entry = _entries.find(e => e.id === id);
        if (!entry) return;
        _editingId = id;
        root.querySelector('#wb-form-title').textContent = '編輯條目';
        root.querySelector('#wb-f-title').value = entry.title;
        root.querySelector('#wb-f-order').value = entry.order || '0';
        root.querySelector('#wb-f-depth').value = (_entryDepth(entry) === null) ? '' : String(_entryDepth(entry));
        root.querySelector('#wb-f-pos').value = (_entryDepth(entry) === null) ? '' : String(_entryRole(entry));
        root.querySelector('#wb-f-content').value = entry.content;
        root.querySelector('#wb-f-enabled').checked = entry.enabled;

        // 🔥 修復：強制轉成字串，防止舊資料格式報錯
        _currentTags = entry.keys ? String(entry.keys).split(',').map(k => k.trim()).filter(k => k) : [];
        root.querySelector('#wb-f-keys-input').value = '';
        renderTagEditor(root);

        root.querySelector('#wb-edit-overlay').classList.remove('hidden');
    }

    async function saveForm(root) {
        const title = root.querySelector('#wb-f-title').value.trim();
        if (!title) { alert('請填入條目標題'); return; }

        const pendingInput = root.querySelector('#wb-f-keys-input').value.trim().replace(/,/g, '');
        if (pendingInput && !_currentTags.includes(pendingInput)) {
            _currentTags.push(pendingInput);
        }

        const entry = {
            id: _editingId || ('wb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
            book: _activeBook, // 🔥 強制綁定到當前選中的書包
            title,
            keys: _currentTags.join(','), 
            content: root.querySelector('#wb-f-content').value.trim(),
            category: (_editingId ? (_entries.find(e => e.id === _editingId)?.category || '預設') : '預設'),   // 欄位留著相容匯出/舊資料，UI 已不分類
            enabled: root.querySelector('#wb-f-enabled').checked,
            order: parseInt(root.querySelector('#wb-f-order').value) || 0,
            // 位置選了 @D 才有深度；選「不用 @D」就一律 null（跟其他設定一起放最前面）
            depth: (() => {
                const pos = (root.querySelector('#wb-f-pos').value || '').trim();
                if (pos === '') return null;
                const v = (root.querySelector('#wb-f-depth').value || '').trim();
                if (v === '') return 4;           // 同酒館 DEFAULT_DEPTH
                const n = parseInt(v, 10);
                return isNaN(n) ? 4 : Math.max(0, n);
            })(),
            role: parseInt(root.querySelector('#wb-f-pos').value, 10) || 0,
            createdAt: _editingId ? (_entries.find(e => e.id === _editingId)?.createdAt ?? Date.now()) : Date.now(),
            updatedAt: Date.now()
        };
        await win.OS_DB.saveWorldbookEntry(entry);
        root.querySelector('#wb-edit-overlay').classList.add('hidden');
        await reload(root);
    }

    async function deleteEntry(root, id) {
        if (!confirm('確定要刪除這個條目嗎？')) return;
        await win.OS_DB.deleteWorldbookEntry(id);
        root.querySelector('#wb-edit-overlay').classList.add('hidden'); 
        await reload(root);
    }

    // ── 設定與操作 ────────────────────────────────────────────────────
    function openSettings(root) {
        root.querySelector('#wb-cfg-overlay').classList.remove('hidden');
    }

    function exportJSON(root) {
        const books = getBooks();
        // 統計每包的條目數
        const bookCounts = {};
        books.forEach(b => { bookCounts[b] = _entries.filter(e => e.book === b).length; });

        // 建立選擇器 modal
        const modal = document.createElement('div');
        modal.className = 'wb-export-modal';
        modal.innerHTML = `
            <div class="wb-export-sheet">
                <div class="wb-export-title">📤 選擇要匯出的書包</div>
                <div class="wb-export-list">
                    ${books.map(b => `
                    <label class="wb-export-row${b === _activeBook ? ' checked' : ''}">
                        <input type="checkbox" value="${escHtml(b)}"${b === _activeBook ? ' checked' : ''}>
                        <span class="wb-export-row-name">📚 ${escHtml(b)}</span>
                        <span class="wb-export-row-count">${bookCounts[b]} 條</span>
                    </label>`).join('')}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
                    <button class="wb-export-sel-all" id="wb-ex-selall">全選</button>
                    <button class="wb-export-sel-all" id="wb-ex-selnone">取消全選</button>
                </div>
                <div class="wb-export-actions">
                    <button class="wb-export-cancel" id="wb-ex-cancel">取消</button>
                    <button class="wb-export-confirm" id="wb-ex-confirm">匯出</button>
                </div>
            </div>`;

        (root || document.body).appendChild(modal);

        // checkbox 聯動列樣式
        modal.querySelectorAll('.wb-export-row').forEach(row => {
            const cb = row.querySelector('input[type=checkbox]');
            cb.addEventListener('change', () => row.classList.toggle('checked', cb.checked));
        });

        modal.querySelector('#wb-ex-selall').onclick = () =>
            modal.querySelectorAll('.wb-export-row input').forEach(cb => { cb.checked = true; cb.closest('.wb-export-row').classList.add('checked'); });
        modal.querySelector('#wb-ex-selnone').onclick = () =>
            modal.querySelectorAll('.wb-export-row input').forEach(cb => { cb.checked = false; cb.closest('.wb-export-row').classList.remove('checked'); });
        modal.querySelector('#wb-ex-cancel').onclick = () => modal.remove();

        modal.querySelector('#wb-ex-confirm').onclick = () => {
            const selected = [...modal.querySelectorAll('.wb-export-row input:checked')].map(cb => cb.value);
            if (!selected.length) { alert('請至少選擇一個書包'); return; }

            const entriesToExport = _entries.filter(e => selected.includes(e.book));
            if (!entriesToExport.length) { alert('選中的書包沒有任何條目'); return; }

            const isSingle = selected.length === 1;
            const data = JSON.stringify({
                version: 2,
                name: isSingle ? selected[0] : `合併匯出(${selected.length}包)`,
                exportedAt: new Date().toISOString(),
                books: selected,
                entries: entriesToExport
            }, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = isSingle
                ? `worldbook-${selected[0]}.json`
                : `worldbook-export-${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            modal.remove();
        };
    }

    async function importJSON(file, root) {
        const text = await file.text();
        let json;
        try {
            json = JSON.parse(text);
        } catch(e) {
            alert('無法解析 JSON 檔案'); return;
        }

        const isSTFormat = json.entries && !Array.isArray(json.entries) && Object.values(json.entries)[0]?.uid !== undefined;
        const ourFormat  = Array.isArray(json.entries);
        
        let entries;
        let defaultName = json.name || file.name.replace(/\.[^/.]+$/, "");
        
        // 詢問使用者要建立的書包名稱
        let newBookName = prompt('偵測到世界書，請為這個新的世界書包命名：', defaultName);
        if (!newBookName) return; // 取消
        newBookName = newBookName.trim();

        if (isSTFormat) {
            entries = importFromST(json, newBookName);
            if (!confirm(`偵測到酒館 AI 世界書格式，共 ${entries.length} 個條目。\n將建立書包「${newBookName}」並匯入。`)) return;
        } else if (ourFormat) {
            // 如果是我們自己匯出的，強制覆寫 book 屬性
            entries = json.entries.map(e => ({ ...e, book: newBookName }));
            if (!confirm(`偵測到奧瑞亞格式，共 ${entries.length} 個條目。\n將建立書包「${newBookName}」並匯入。`)) return;
        } else {
            alert('無法識別的 JSON 格式'); return;
        }

        // 🚨 同名書包＝覆蓋，不要疊上去。
        //   以前是直接往同一本裡塞：重新匯入同一本書 → 兩份條目都會被撈進 prompt，
        //   同一條規則送兩次、關鍵字也重複命中，而且畫面上看不出哪條是舊的。
        //   （會想重新匯入多半就是要把酒館那邊改過的設定帶進來 —— 那更不該留舊的。）
        const _old = (await win.OS_DB.getAllWorldbookEntries())
            .filter(e => (e.book || '預設書包') === newBookName);
        if (_old.length) {
            const _msg = '書包「' + newBookName + '」已經有 ' + _old.length + ' 條條目。' + '\n\n'
                + '確定＝清掉舊的再匯入（重新匯入同一本用這個）' + '\n'
                + '取消＝這次不匯入';
            if (!confirm(_msg)) return;
            for (const _e of _old) {
                try { await win.OS_DB.deleteWorldbookEntry(_e.id); }
                catch (err) { console.warn('[OS_WORLDBOOK] 舊條目刪除失敗', _e.id, err); }
            }
            console.log('[OS_WORLDBOOK] 覆蓋書包「' + newBookName + '」：先清掉 ' + _old.length + ' 條舊條目');
        }

        // 儲存書包名稱
        const books = getBooks();
        if (!books.includes(newBookName)) {
            books.push(newBookName);
            saveBooks(books);
        }

        // 儲存條目
        for (const e of entries) {
            if (!e.id) e.id = 'wb_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
            await win.OS_DB.saveWorldbookEntry(e);
        }
        
        _activeBook = newBookName;
        root.querySelector('#wb-cfg-overlay').classList.add('hidden');
        await reload(root);
        alert('✅ 匯入完成，共 ' + entries.length + ' 個條目已加入書包「' + newBookName + '」');
    }

    // 🚨 沒有 book 的條目＝生成時 getContextByPacks 撈不到（它濾的是 book，不是 category）。
    //   角色卡匯入以前只寫 category，而這段補寫只掛在「打開世界書面板」那條路上 ——
    //   匯完直接踏進故事的人，那本書等於完全沒生效（AI 拿不到角色外觀 → 只能寫 none）。
    //   抽成獨立一支，開機也跑一次。回傳補了幾條。
    async function migrateBooks(entries) {
        const list = entries || (await win.OS_DB.getAllWorldbookEntries());
        let n = 0;
        let books = getBooks();
        for (const e of list) {
            if (e.book) continue;
            if (e.category && !DEFAULT_CATS.includes(e.category)) {
                e.book = e.category;              // 舊版把「角色名」存在 category → 升格成書包
                e.category = '角色自帶設定';
                if (!books.includes(e.book)) books.push(e.book);
            } else {
                e.book = '預設書包';
            }
            n++;
            await win.OS_DB.saveWorldbookEntry(e);
        }
        if (n) { saveBooks(books); console.log('[OS_WORLDBOOK] 補上 book 欄位：' + n + ' 條'); }
        return n;
    }

    async function reload(root) {
        _entries = await win.OS_DB.getAllWorldbookEntries();
        if (await migrateBooks(_entries)) _entries = await win.OS_DB.getAllWorldbookEntries();
        renderBookSelector(root);
        renderList(root);
    }

    function bindEvents(root) {
        // 書包下拉選單
        root.querySelector('#wb-book-select').addEventListener('change', e => {
            _activeBook = e.target.value;
            renderGlobalBtn(root);
            renderList(root);
        });

        // 常駐書包開關（＝酒館的全域世界書）：掛一次、每本藏書都讀得到
        root.querySelector('#wb-global-btn').addEventListener('click', () => {
            const on = !getGlobalPacks().includes(_activeBook);
            const list = getGlobalPacks().filter(p => p !== _activeBook);
            if (on) list.push(_activeBook);
            saveGlobalPacks(list);
            renderGlobalBtn(root);
        });

        // 創建新書包
        root.querySelector('#wb-new-book-btn').addEventListener('click', () => {
            let name = prompt('請輸入新世界書包名稱：', '新世界書包');
            if (name) {
                name = name.trim();
                const books = getBooks();
                if (!books.includes(name)) {
                    books.push(name);
                    saveBooks(books);
                }
                _activeBook = name;
                renderBookSelector(root);
                renderList(root);
            }
        });

        // 刪除當前書包
        root.querySelector('#wb-del-book-btn').addEventListener('click', async () => {
            if (_activeBook === '預設書包') {
                alert('系統保留的預設書包無法刪除。');
                return;
            }
            if (!confirm(`確定要刪除書包「${_activeBook}」及其內部所有條目嗎？此操作無法復原！`)) return;
            
            // 找出並刪除該書包下所有條目
            const toDelete = _entries.filter(e => e.book === _activeBook);
            for (const e of toDelete) {
                await win.OS_DB.deleteWorldbookEntry(e.id);
            }
            
            // 從清單中移除
            const books = getBooks().filter(b => b !== _activeBook);
            if (books.length === 0) books.push('預設書包');
            saveBooks(books);
            saveGlobalPacks(getGlobalPacks().filter(p => p !== _activeBook));   // 常駐名單別留下不存在的書包
            
            _activeBook = books[0];
            await reload(root);
        });

        root.querySelector('#wb-search').addEventListener('input', e => {
            _searchQuery = e.target.value;
            renderList(root);
        });

        root.querySelector('#wb-add-btn').addEventListener('click', () => openAddForm(root));
        root.querySelector('#wb-settings-btn').addEventListener('click', () => openSettings(root));
        root.querySelector('#wb-form-cancel').addEventListener('click', () => root.querySelector('#wb-edit-overlay').classList.add('hidden'));
        root.querySelector('#wb-form-save').addEventListener('click', () => saveForm(root));
        root.querySelector('#wb-cfg-close').addEventListener('click', () => root.querySelector('#wb-cfg-overlay').classList.add('hidden'));

        root.querySelector('#wb-import-st-btn').addEventListener('click', () => root.querySelector('#wb-file-input').click());
        root.querySelector('#wb-file-input').addEventListener('change', async e => {
            if (e.target.files[0]) await importJSON(e.target.files[0], root);
            e.target.value = '';
        });

        root.querySelector('#wb-export-btn').addEventListener('click', () => exportJSON(root));

        root.querySelector('#wb-clear-all-btn').addEventListener('click', async () => {
            if (!confirm('🚨 確定要銷毀所有世界書包與條目嗎？此操作不可撤銷！')) return;
            await win.OS_DB.clearWorldbookEntries();
            saveBooks([...DEFAULT_BOOKS]);
            saveGlobalPacks([]);
            _activeBook = '預設書包';
            await reload(root);
            root.querySelector('#wb-cfg-overlay').classList.add('hidden');
        });

        const tagInput = root.querySelector('#wb-f-keys-input');
        tagInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                e.preventDefault(); 
                const val = tagInput.value.trim().replace(/,|，/g, '');
                if (val && !_currentTags.includes(val)) {
                    _currentTags.push(val);
                    tagInput.value = '';
                    renderTagEditor(root);
                } else {
                    tagInput.value = ''; 
                }
            } else if (e.key === 'Backspace' && tagInput.value === '' && _currentTags.length > 0) {
                _currentTags.pop();
                renderTagEditor(root);
            }
        });
        
        tagInput.addEventListener('blur', () => {
            const val = tagInput.value.trim().replace(/,|，/g, '');
            if (val && !_currentTags.includes(val)) {
                _currentTags.push(val);
                tagInput.value = '';
                renderTagEditor(root);
            }
        });
    }

    function escHtml(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── 公開 API ────────────────────────────────────────────────────
    win.OS_WORLDBOOK = {
        launch: function(container) {
            if (!container) return;
            container.innerHTML = buildHTML();
            const root = container.querySelector('#wb-root') || container;
            bindEvents(root);
            reload(root);
        },

        // 給一般對話使用的默認函數 (只抓當前正在查看的書包)
        getEnabledContext: async function(scanText = '') {
            const entries = await win.OS_DB.getAllWorldbookEntries();
            const enabled = entries.filter(e => e.enabled !== false && e.book === _activeBook);
            
            let triggered = enabled.filter(e => {
                // 🔥 修復：強制轉成字串，防止舊資料格式報錯
                const kStr = (e.keys ? String(e.keys) : '').trim();
                if (!kStr) return true; 
                
                const keywords = kStr.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
                if (!keywords.length) return true;
                
                const text = (scanText || '').toLowerCase();
                return keywords.some(k => text.includes(k)); 
            });

            triggered.sort((a, b) => (parseInt(a.order) || 0) - (parseInt(b.order) || 0));   // 同酒館：order 大的排後面

            if (!triggered.length) return '';
            return triggered.map(e => `[${e.category || '設定'}] ${e.title}\n${e.content}`).join('\n\n---\n\n');
        },

        /**
         * 組 context 用的分堆版本：回 { pre, depths }
         *   pre    ＝ 沒設深度的條目，合成一段（照舊放在「世界書」那一格）
         *   depths ＝ [{ depth: N, text }]，要插進對話歷史「倒數第 N 則之前」，0＝歷史最後面
         * 🚨 一定要分堆：整包一起壓到歷史後面的話，角色卡自帶的書也會被一起搬過去 ——
         *    她要的是「特定條目壓在最後」，不是全部（Rae 2026-08-23）。
         */
        getContextParts: async function(packNames = [], scanText = '') {
            const triggered = await this._triggeredEntries(packNames, scanText);
            const fmt = (e) => `[${e.category || '設定'}] ${e.title}\n${e.content}`;
            const SEP = '\n\n---\n\n';
            const pre = [], byKey = new Map();
            triggered.forEach(e => {
                const d = _entryDepth(e);
                if (d === null) { pre.push(fmt(e)); return; }
                const r = _entryRole(e);
                const k = d + ':' + r;
                if (!byKey.has(k)) byKey.set(k, { depth: d, role: r, arr: [] });
                byKey.get(k).arr.push(fmt(e));
            });
            return {
                // 這輪實際命中了哪些條目（給 console 用）——「規則說有清單、清單卻沒被觸發」
                //   這種靜默失敗光看字數看不出來，一定要把標題印出來才查得到
                hits: triggered.map(e => ({ title: e.title, depth: _entryDepth(e), order: e.order })),
                pre: pre.join(SEP),
                // 深度大的排前面（呼叫端由大到小插）；同深度內 AI(2) → 使用者(1) → 系統(0)，
                //   跟酒館 doChatInject 一樣把系統留在最靠近生成點的位置。
                depths: [...byKey.values()]
                    .map(o => ({ depth: o.depth, role: o.role, text: o.arr.join(SEP) }))
                    .sort((a, b) => (b.depth - a.depth) || (b.role - a.role))
            };
        },

        // 命中判定＋排序的共用本體（getContextByPacks / getContextParts 共用，判準只有一份）
        _triggeredEntries: async function(packNames = [], scanText = '') {
            if (!packNames || packNames.length === 0) return [];
            const entries = await win.OS_DB.getAllWorldbookEntries();
            const pool = entries.filter(e => e.enabled !== false && packNames.includes(e.book || '預設書包'));
            const text = (scanText || '').toLowerCase();
            const hit = pool.filter(e => {
                const kStr = (e.keys ? String(e.keys) : '').trim();
                if (!kStr) return true;
                const keywords = kStr.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
                if (!keywords.length) return true;
                return keywords.some(k => text.includes(k));
            });
            // 🚨 方向照抄酒館：它 sort 成遞減之後逐條 unshift，最終結果是「order 大的在後面」。
            //    後面＝越靠近生成點＝越壓得住。以前這裡是反的，order 9999 的總綱反而被排到最前面（最弱的位置）。
            return hit.sort((a, b) => (parseInt(a.order) || 0) - (parseInt(b.order) || 0));
        },

        // ====================================================================
        // 🔥 VN 故事面板專用 API (Worldbook Packs API)
        // ====================================================================

        /**
         * 獲取目前所有的世界書包清單
         * @returns {string[]} 書包名稱陣列
         */
        getAvailablePacks: function() {
            return getBooks();
        },

        /** 這輪真正要讀的書包＝常駐書包 ∪ 這本藏書自己掛的（去重）。組 context 一律走這支。 */
        getActivePacks: function() {
            return [...new Set(getGlobalPacks().concat(getStoryPacks()))];
        },
        getGlobalPacks,
        isGlobalPack: function(name) { return getGlobalPacks().includes(String(name)); },
        setGlobalPack: function(name, on) {
            const n = String(name || ''); if (!n) return;
            const list = getGlobalPacks().filter(p => p !== n);
            if (on) list.push(n);
            saveGlobalPacks(list);
        },

        /**
         * 根據指定的「書包名稱」和掃描文字，組裝出最終上下文
         * @param {string[]} packNames - 要載入的書包名稱陣列，例如 ['預設書包', '賽博龐克']
         * @param {string} scanText - 要進行關鍵字掃描的文字
         * @returns {Promise<string>} - 組裝好的世界書字串
         */
        // 不分深度、全部一起回（沒有深度概念的呼叫端照舊用這支；VN 那條走 getContextParts）
        getContextByPacks: async function(packNames = [], scanText = '') {
            const triggered = await this._triggeredEntries(packNames, scanText);
            if (!triggered.length) return '';
            return triggered.map(e => `[${e.category || '設定'}] ${e.title}\n${e.content}`).join('\n\n---\n\n');
        },

        // ====================================================================
        // 🔀 條目開關（獨立版）：對應酒館的 TavernHelper.setLorebookEntries
        // ====================================================================
        /**
         * 程式要「新增一條會被讀到的條目」時放哪本：VN 正在用的第一個書包，沒有就退預設書包。
         * 放錯書包＝生成時 getContextByPacks 撈不到＝寫了等於沒寫，所以集中在這裡一處決定。
         */
        // 給匯入端用：把書包名加進清單（不加＝下拉看不到、也不會被當成可選書包）
        // 換算工具對外開放：匯入端不必各自再寫一份（character_book 的欄位藏在 extensions 裡）
        stDepthOf: function(e) { return _stDepth(e); },
        stRoleOf:  function(e) { return _stRole(e); },
        registerBook: function(name) {
            const n = String(name || '').trim();
            if (!n) return;
            const books = getBooks();
            if (!books.includes(n)) { books.push(n); saveBooks(books); }
        },
        // 補上缺 book 的舊條目（開機自動跑一次；匯入端也可以主動叫）
        migrateBooks: function() { return migrateBooks(); },

        getTargetBook: function() {
            try {
                const raw = localStorage.getItem('vn_active_wb_packs');
                const packs = raw ? JSON.parse(raw) : null;
                if (Array.isArray(packs) && packs.length) return String(packs[0]);
            } catch (e) {}
            const books = getBooks();
            return books[0] || '預設書包';
        },

        /**
         * 依「標題含關鍵字」批次開關條目。
         * PWA 沒有角色卡主世界書的概念 → 掃全部書包，只認標題（＝酒館的 comment）。
         * ⚠️ 邊界跟酒館那兩支同步器一樣：只改 enabled，不寫內容、不碰 keys/order；
         *    managed 名單外的條目一律不碰（使用者自己的內容偏好條目不會被翻）。
         * @param {string[]} managed 受管標題關鍵字（標題含其一才會被動到）
         * @param {string[]|Set<string>} on 這批裡該「開」的關鍵字，其餘受管條目關掉
         * @returns {Promise<{opened:string[], closed:string[], seen:string[]}>}
         */
        setEnabledByTitle: async function(managed, on) {
            const out = { opened: [], closed: [], seen: [] };
            try {
                if (!win.OS_DB?.getAllWorldbookEntries || !Array.isArray(managed) || !managed.length) return out;
                const onSet = on instanceof Set ? on : new Set(on || []);
                const entries = (await win.OS_DB.getAllWorldbookEntries()) || [];
                for (const e of entries) {
                    const title = String(e?.title || '');
                    const hit = managed.find(n => title.includes(n));
                    if (!hit) continue;                       // 名單外＝完全不碰
                    out.seen.push(hit);
                    const should = onSet.has(hit);
                    if ((e.enabled !== false) === should) continue;
                    await win.OS_DB.saveWorldbookEntry({ ...e, enabled: should, updatedAt: Date.now() });
                    (should ? out.opened : out.closed).push(hit);
                }
            } catch (e) { console.warn('[OS_WORLDBOOK] setEnabledByTitle 失敗:', e); }
            return out;
        },

        // ====================================================================
        // 🔥 新增：角色卡自動匯入專用 API
        // ====================================================================
        
        /**
         * 提供給 os_card_import.js 呼叫，直接將內建世界書建立為獨立書包
         * @param {string} cardName - 角色名稱 (將作為書包名稱)
         * @param {Array} entriesData - 從角色卡中解析出的條目陣列
         */
        importFromCard: async function(cardName, entriesData) {
            if (!cardName || !entriesData || entriesData.length === 0) return;
            
            const books = getBooks();
            if (!books.includes(cardName)) {
                books.push(cardName);
                saveBooks(books);
            }
            
            for (let i = 0; i < entriesData.length; i++) {
                const e = entriesData[i];
                const entry = {
                    id: 'wb_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2,6),
                    book: cardName,
                    title: (e.comment || e.name || `條目 ${i + 1}`).trim(),
                    content: (e.content || '').trim(),
                    category: '角色自帶設定', // 統一放在一個專屬分類裡
                    keys: e.keyword ? (Array.isArray(e.keyword) ? e.keyword.join(',') : String(e.keyword)).trim() : '',
                    enabled: !(e.disable || e.disabled || false),
                    order: parseInt(e.order) || parseInt(e.displayIndex) || 0,
                    depth: _stDepth(e),   // 同上：角色卡自帶的書也保留深度
                    role: _stRole(e),
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                await win.OS_DB.saveWorldbookEntry(entry);
            }
            console.log(`[OS_WORLDBOOK] ✅ 已成功為角色卡「${cardName}」建立專屬書包並匯入 ${entriesData.length} 條設定。`);
        }
    };

    // 開機補一次：不要等使用者打開面板才補 book（沒補＝那本書生成時整本讀不到）
    setTimeout(() => { try { migrateBooks(); } catch (e) { console.warn('[OS_WORLDBOOK] 開機補 book 失敗', e); } }, 1500);

    console.log('[PhoneOS] ✅ 獨立世界書系統 (OS_WORLDBOOK V2.2 - 排版熱修復版) 已載入');
})();