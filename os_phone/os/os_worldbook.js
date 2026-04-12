// ----------------------------------------------------------------
// [檔案] os_worldbook.js (V1.5 - UI 高度修復與刪除外移版)
// 路徑：os_phone/os/os_worldbook.js
// 職責：奧瑞亞獨立世界書系統
//   - 功能：支援關鍵字觸發、視覺化 Tag 編輯、自訂 Order 排序
//   - 修復：適配 Bottom Nav 高度防遮擋、刪除按鈕移至列表外層
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const LSKEY_CATS = 'os_worldbook_cats';
    const DEFAULT_CATS = ['角色設定', '世界觀', '規則設定', '故事背景', '其他'];

    // ── 樣式注入 ────────────────────────────────────────────────────
    function injectStyles() {
        const existing = document.getElementById('os-wb-styles');
        if (existing) existing.remove();
        const s = document.createElement('style');
        s.id = 'os-wb-styles';
        s.textContent = `
        .wb-app { display:flex; flex-direction:column; height:100%; background:#0d0d14; color:#e8e0d5; font-size:13px; overflow:hidden; position:relative; }
        .wb-header { display:grid; grid-template-columns:44px 1fr 64px; align-items:center; height:44px; background:#13131e; border-bottom:1px solid #2a2a3a; flex-shrink:0; }
        .wb-header-title { font-size:15px; font-weight:600; letter-spacing:.5px; white-space:nowrap; text-align:center; overflow:hidden; text-overflow:ellipsis; color:#e8e0d5; }
        .wb-header-btn { display:flex; align-items:center; justify-content:center; height:44px; background:none; border:none; color:#a09080; cursor:pointer; font-size:18px; border-radius:6px; transition:color .2s,background .2s; padding:0 6px; }
        .wb-header-btn:hover { color:#d4af37; background:rgba(212,175,55,.12); }
        .wb-search-bar { padding:6px 12px 8px; background:#13131e; border-bottom:1px solid #2a2a3a; flex-shrink:0; }
        .wb-cat-bar { display:flex; gap:4px; padding:8px 10px; background:#13131e; overflow-x:auto; flex-shrink:0; scrollbar-width:none; border-bottom:1px solid #1e1e2e; }
        .wb-cat-bar::-webkit-scrollbar { display:none; }
        .wb-cat-tab { flex-shrink:0; padding:4px 12px; border-radius:20px; border:1px solid #2a2a3a; background:none; color:#888; font-size:11px; cursor:pointer; transition:.2s; }
        .wb-cat-tab.active { background:#d4af37; border-color:#d4af37; color:#13131e; font-weight:700; }
        
        /* 🔥 修復列表高度：底部留出 75px 空間，避免被導覽列遮擋 */
        .wb-list { flex:1; overflow-y:auto; padding:8px 10px 75px 10px; display:flex; flex-direction:column; gap:6px; }
        .wb-list::-webkit-scrollbar { width:3px; } .wb-list::-webkit-scrollbar-thumb { background:#2a2a3a; border-radius:2px; }
        
        .wb-entry { display:flex; align-items:center; background:#1a1a28; border:1px solid #2a2a3a; border-radius:10px; padding:10px 12px; gap:10px; transition:border-color .2s; }
        .wb-entry:hover { border-color:#3a3a5a; }
        .wb-entry.disabled { opacity:.45; }
        .wb-entry-info { flex:1; min-width:0; }
        .wb-entry-title { font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#e8e0d5; display:flex; align-items:center; gap:6px; }
        .wb-entry-order { background:#2a2a3a; color:#d4af37; padding:1px 5px; border-radius:4px; font-size:10px; font-weight:700; }
        .wb-entry-meta { font-size:10px; color:#555; margin-top:4px; }
        .wb-entry-cat { display:inline-block; padding:1px 7px; border-radius:10px; background:#1e1e35; border:1px solid #3a3a5a; font-size:9px; color:#8080c0; margin-right:4px; }
        
        /* 🔥 編輯與刪除按鈕樣式 */
        .wb-entry-edit, .wb-entry-del { background:none; border:none; cursor:pointer; font-size:14px; padding:5px; border-radius:6px; transition:.2s; flex-shrink:0; }
        .wb-entry-edit { color:#666; }
        .wb-entry-edit:hover { color:#d4af37; background:rgba(212,175,55,.1); }
        .wb-entry-del { color:#c85a5a; margin-left:2px; }
        .wb-entry-del:hover { color:#ff8080; background:rgba(200,50,50,.15); }
        
        .wb-toggle { position:relative; width:34px; height:18px; flex-shrink:0; }
        .wb-toggle input { opacity:0; width:0; height:0; position:absolute; }
        .wb-toggle-slider { position:absolute; inset:0; background:#2a2a3a; border-radius:18px; cursor:pointer; transition:.25s; }
        .wb-toggle input:checked + .wb-toggle-slider { background:#d4af37; }
        .wb-toggle-slider:before { content:''; position:absolute; width:12px; height:12px; left:3px; top:3px; background:#fff; border-radius:50%; transition:.25s; }
        .wb-toggle input:checked + .wb-toggle-slider:before { transform:translateX(16px); }
        .wb-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#3a3a5a; gap:8px; }
        .wb-empty-icon { font-size:40px; opacity:.4; }
        
        /* 🔥 修復懸浮按鈕：位置往上提，避開導覽列 */
        .wb-fab { position:absolute; bottom:70px; right:16px; width:44px; height:44px; border-radius:50%; background:#d4af37; border:none; color:#13131e; font-size:22px; cursor:pointer; box-shadow:0 4px 16px rgba(212,175,55,.35); display:flex; align-items:center; justify-content:center; transition:.2s; z-index:10; }
        .wb-fab:hover { background:#e6c84b; transform:scale(1.05); }

        /* 🔥 修復編輯遮罩：底部增加 55px Padding，確保按鈕不被遮擋 */
        .wb-overlay { position:absolute; inset:0; background:rgba(0,0,0,.85); z-index:50; display:flex; flex-direction:column; padding-bottom: 55px; box-sizing: border-box; }
        .wb-overlay.hidden { display:none; }
        .wb-form { flex:1; background:#13131e; display:flex; flex-direction:column; overflow:hidden; border-top-left-radius:8px; border-top-right-radius:8px; }
        .wb-form-header { display:flex; align-items:center; padding:12px 14px; border-bottom:1px solid #2a2a3a; gap:8px; }
        .wb-form-title-text { flex:1; font-size:14px; font-weight:600; }
        .wb-form-save { background:#d4af37; border:none; color:#13131e; font-size:12px; font-weight:700; padding:5px 14px; border-radius:20px; cursor:pointer; }
        .wb-form-save:hover { background:#e6c84b; }
        .wb-form-cancel { background:none; border:1px solid #3a3a5a; color:#888; font-size:12px; padding:5px 12px; border-radius:20px; cursor:pointer; }
        .wb-form-body { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:12px; }
        .wb-field label { display:block; font-size:11px; color:#888; margin-bottom:5px; letter-spacing:.3px; }
        .wb-field input, .wb-field select, .wb-field textarea { width:100%; background:#0d0d14; border:1px solid #2a2a3a; border-radius:8px; color:#e8e0d5; font-size:13px; padding:8px 10px; box-sizing:border-box; outline:none; transition:border-color .2s; font-family:inherit; }
        .wb-field input:focus, .wb-field select:focus, .wb-field textarea:focus { border-color:#d4af37; }
        .wb-field textarea { resize:vertical; min-height:180px; line-height:1.6; }
        .wb-field select option { background:#1a1a28; }
        .wb-field-row { display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid #1e1e2e; }
        .wb-field-row label { font-size:12px; color:#aaa; margin:0; }

        /* 標籤系統專用 UI */
        .wb-tag-box { display:flex; flex-wrap:wrap; gap:6px; padding:6px 10px; background:#0d0d14; border:1px solid #2a2a3a; border-radius:8px; align-items:center; transition:.2s; min-height:34px; box-sizing:border-box; cursor:text; }
        .wb-tag-box:focus-within { border-color:#d4af37; }
        .wb-tag-item { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; background:#1e1e35; border:1px solid #3a3a5a; border-radius:12px; font-size:11px; color:#e8e0d5; font-weight:500; }
        .wb-tag-remove { background:none; border:none; color:#e06060; font-size:12px; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center; }
        .wb-tag-remove:hover { color:#ff8080; }
        .wb-tag-input { flex:1; min-width:80px; background:transparent !important; border:none !important; color:#e8e0d5; font-size:12px; outline:none !important; font-family:inherit; padding:0 !important; }
        .wb-tag-sug-area { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }
        .wb-tag-sug { background:#1a1a28; border:1px dashed #3a3a5a; color:#888; padding:3px 10px; border-radius:12px; font-size:10px; cursor:pointer; transition:.2s; }
        .wb-tag-sug:hover { border-color:#d4af37; color:#d4af37; background:rgba(212,175,55,.05); }

        /* 設定頁 */
        .wb-settings { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:14px; }
        .wb-section { background:#1a1a28; border:1px solid #2a2a3a; border-radius:10px; padding:12px 14px; }
        .wb-section-title { font-size:11px; color:#d4af37; letter-spacing:1px; text-transform:uppercase; margin-bottom:10px; font-weight:600; }
        .wb-input { width:100%; background:#0d0d14; border:1px solid #2a2a3a; border-radius:8px; color:#e8e0d5; font-size:12px; padding:7px 10px; box-sizing:border-box; outline:none; margin-bottom:7px; font-family:inherit; }
        .wb-btn { width:100%; padding:9px; border-radius:8px; border:none; font-size:13px; cursor:pointer; font-weight:600; margin-top:4px; transition:.2s; }
        .wb-btn-primary { background:#d4af37; color:#13131e; }
        .wb-btn-primary:hover { background:#e6c84b; }
        .wb-btn-secondary { background:#2a2a3a; color:#ccc; }
        .wb-btn-danger { background:rgba(200,50,50,.2); color:#e06060; border:1px solid rgba(200,50,50,.3); }
        .wb-hint { font-size:10px; color:#555; margin-top:4px; line-height:1.5; }

        .wb-search { width:100%; background:#0d0d14; border:1px solid #2a2a3a; border-radius:20px; color:#e8e0d5; font-size:12px; padding:6px 14px; outline:none; box-sizing:border-box; display:block; }
        .wb-search:focus { border-color:#d4af37; }
        `;
        document.head.appendChild(s);
    }

    function getCats() {
        try { return JSON.parse(localStorage.getItem(LSKEY_CATS) || 'null') || [...DEFAULT_CATS]; }
        catch(e) { return [...DEFAULT_CATS]; }
    }
    function saveCats(cats) { localStorage.setItem(LSKEY_CATS, JSON.stringify(cats)); }

    function importFromST(json) {
        const entries = [];
        const cats = getCats();
        const src = json.entries || json;
        const items = Array.isArray(src) ? src : Object.values(src);
        items.forEach((e, i) => {
            const cat = e.group && e.group.trim() ? e.group.trim() : '其他';
            if (cat && !cats.includes(cat)) cats.push(cat);
            
            let keyStr = '';
            if (e.keyword) {
                if (Array.isArray(e.keyword)) keyStr = e.keyword.join(',');
                else if (typeof e.keyword === 'string') keyStr = e.keyword;
            }

            entries.push({
                id: 'wb_' + Date.now() + '_' + i,
                title: (e.comment || e.name || `條目 ${i + 1}`).trim(),
                content: (e.content || '').trim(),
                category: cat,
                keys: keyStr.trim(),
                enabled: !(e.disable || e.disabled || false),
                order: parseInt(e.order) || parseInt(e.displayIndex) || 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        });
        saveCats(cats);
        return entries;
    }

    function buildHTML() {
        return `
        <div class="wb-app" id="wb-root">
          <div style="display:flex!important;flex-direction:row!important;align-items:center!important;width:100%!important;height:44px!important;background:#13131e;border-bottom:1px solid #2a2a3a;flex-shrink:0;box-sizing:border-box;">
            <button onclick="goHome()" title="返回大廳"
              style="flex:0 0 64px!important;width:64px!important;height:44px!important;background:none;border:none;color:#d4af37;cursor:pointer;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;border-radius:6px;letter-spacing:.5px;">←返回</button>
            <span style="flex:1!important;text-align:center!important;font-size:15px;font-weight:600;color:#e8e0d5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.5px;">世界書</span>
            <button id="wb-settings-btn" title="條目管理"
              style="flex:0 0 44px!important;width:44px!important;height:44px!important;background:none;border:none;color:#a09080;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;border-radius:6px;">🗂️</button>
          </div>
          <div style="padding:6px 12px 8px;background:#13131e;border-bottom:1px solid #2a2a3a;flex-shrink:0;">
            <input class="wb-search" id="wb-search" placeholder="搜尋條目或關鍵字..." />
          </div>

          <div class="wb-cat-bar" id="wb-cat-bar"></div>

          <div style="position:relative;flex:1;overflow:hidden;display:flex;flex-direction:column;">
            <div class="wb-list" id="wb-list"></div>
            <button class="wb-fab" id="wb-add-btn">＋</button>
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
                <div style="display:flex; gap:10px;">
                  <div class="wb-field" style="flex:1;">
                    <label>分類</label>
                    <select id="wb-f-cat"></select>
                  </div>
                  <div class="wb-field" style="flex:0 0 80px;">
                    <label>權重(Order)</label>
                    <input type="number" id="wb-f-order" value="0" style="text-align:center;" />
                  </div>
                </div>
                
                <div class="wb-field">
                  <label>觸發關鍵字 (輸入後按 Enter 建立標籤，留空則常駐)</label>
                  <div class="wb-tag-box" id="wb-tag-box" onclick="document.getElementById('wb-f-keys-input').focus()">
                    <input type="text" class="wb-tag-input" id="wb-f-keys-input" placeholder="新增標籤..." autocomplete="off" />
                  </div>
                  <div class="wb-hint" style="margin-top:6px; color:#777;">📚 點擊快速加入：</div>
                  <div class="wb-tag-sug-area" id="wb-tag-suggestions"></div>
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
                <span class="wb-form-title-text">🗂️ 條目管理</span>
                <button class="wb-form-cancel" id="wb-cfg-close">關閉</button>
              </div>
              <div class="wb-settings">
                <div class="wb-section">
                  <div class="wb-section-title">📂 匯入 / 匯出</div>
                  <button class="wb-btn wb-btn-secondary" id="wb-import-st-btn">📥 匯入酒館 AI 世界書 JSON</button>
                  <button class="wb-btn wb-btn-secondary" id="wb-export-btn">📤 匯出為 JSON</button>
                  <input type="file" id="wb-file-input" accept=".json" style="display:none" />
                </div>
                <div class="wb-section">
                  <div class="wb-section-title">🏷 管理分類</div>
                  <div id="wb-cats-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px"></div>
                  <div style="display:flex;gap:6px">
                    <input class="wb-input" id="wb-new-cat-input" placeholder="新分類名稱" style="margin:0;flex:1" />
                    <button class="wb-btn wb-btn-primary" id="wb-add-cat-btn" style="width:auto;padding:7px 14px;margin:0">添加</button>
                  </div>
                </div>
                <div class="wb-section">
                  <div class="wb-section-title" style="color:#e06060">⚠️ 危險操作</div>
                  <button class="wb-btn wb-btn-danger" id="wb-clear-all-btn">🗑 清空全部條目</button>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    }

    let _entries = [];
    let _activeCat = '全部';
    let _editingId = null;
    let _searchQuery = '';
    let _currentTags = [];

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
        _entries.forEach(e => {
            if (e.keys) {
                e.keys.split(',').forEach(k => {
                    const tk = k.trim();
                    if (tk) allTags.add(tk);
                });
            }
        });

        const suggestions = Array.from(allTags).filter(t => !_currentTags.includes(t));
        
        if (suggestions.length === 0) {
            sugArea.innerHTML = '<span style="color:#555; font-size:10px;">(無其他可用標籤)</span>';
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

    function renderCatBar(root) {
        const bar = root.querySelector('#wb-cat-bar');
        const cats = ['全部', ...getCats()];
        bar.innerHTML = cats.map(c =>
            `<button class="wb-cat-tab${c === _activeCat ? ' active' : ''}" data-cat="${c}">${c}</button>`
        ).join('');
        bar.querySelectorAll('.wb-cat-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                _activeCat = btn.dataset.cat;
                renderCatBar(root);
                renderList(root);
            });
        });
    }

    function renderList(root) {
        const list = root.querySelector('#wb-list');
        let filtered = _entries;
        if (_activeCat !== '全部') filtered = filtered.filter(e => e.category === _activeCat);
        if (_searchQuery) {
            const q = _searchQuery.toLowerCase();
            filtered = filtered.filter(e => 
                e.title.toLowerCase().includes(q) || 
                e.content.toLowerCase().includes(q) ||
                (e.keys && e.keys.toLowerCase().includes(q))
            );
        }

        filtered.sort((a, b) => {
            const aOrder = parseInt(a.order) || 0;
            const bOrder = parseInt(b.order) || 0;
            if (bOrder !== aOrder) return bOrder - aOrder;
            return b.updatedAt - a.updatedAt; 
        });

        if (filtered.length === 0) {
            list.innerHTML = `<div class="wb-empty"><div class="wb-empty-icon">📭</div><div>${_searchQuery ? '找不到符合的條目' : '尚無條目，點擊 ＋ 新增'}</div></div>`;
            return;
        }

        list.innerHTML = filtered.map(e => {
            let keysHtml = '<span class="wb-entry-keys" style="color:#6a8a6a">📌 常駐</span>';
            if (e.keys) {
                keysHtml = e.keys.split(',').map(k => `<span style="display:inline-block;background:rgba(212,175,55,.1);color:#d4af37;padding:1px 6px;border-radius:6px;margin-right:3px;">#${escHtml(k.trim())}</span>`).join('');
            }
            const orderLabel = (e.order && parseInt(e.order) !== 0) ? `<span class="wb-entry-order">Order: ${e.order}</span>` : '';

            // 🔥 新增：在每張卡片的右側，將編輯和刪除按鈕排在一起
            return `
            <div class="wb-entry${e.enabled ? '' : ' disabled'}" data-id="${e.id}">
                <label class="wb-toggle">
                    <input type="checkbox" class="wb-toggle-chk" data-id="${e.id}" ${e.enabled ? 'checked' : ''} />
                    <span class="wb-toggle-slider"></span>
                </label>
                <div class="wb-entry-info">
                    <div class="wb-entry-title">
                        ${escHtml(e.title)}
                        ${orderLabel}
                    </div>
                    <div class="wb-entry-meta">
                        <span class="wb-entry-cat">${escHtml(e.category || '其他')}</span>
                        <span>${e.content.length} 字</span>
                    </div>
                    <div style="margin-top:4px;">${keysHtml}</div>
                </div>
                <div style="display:flex; gap:2px; flex-shrink:0;">
                    <button class="wb-entry-edit" data-id="${e.id}" title="編輯">✏️</button>
                    <button class="wb-entry-del" data-id="${e.id}" title="刪除">🗑️</button>
                </div>
            </div>`;
        }).join('');

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

        // 🔥 綁定外部的編輯與刪除事件
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

    function populateCatSelect(root) {
        const sel = root.querySelector('#wb-f-cat');
        const cats = getCats();
        sel.innerHTML = cats.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
    }

    function openAddForm(root) {
        _editingId = null;
        root.querySelector('#wb-form-title').textContent = '新增條目';
        root.querySelector('#wb-f-title').value = '';
        root.querySelector('#wb-f-order').value = '0';
        root.querySelector('#wb-f-content').value = '';
        root.querySelector('#wb-f-enabled').checked = true;
        populateCatSelect(root);
        if (_activeCat !== '全部') root.querySelector('#wb-f-cat').value = _activeCat;
        
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
        root.querySelector('#wb-f-content').value = entry.content;
        root.querySelector('#wb-f-enabled').checked = entry.enabled;
        populateCatSelect(root);
        root.querySelector('#wb-f-cat').value = entry.category || '其他';

        _currentTags = entry.keys ? entry.keys.split(',').map(k => k.trim()).filter(k => k) : [];
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
            title,
            keys: _currentTags.join(','), 
            content: root.querySelector('#wb-f-content').value.trim(),
            category: root.querySelector('#wb-f-cat').value,
            enabled: root.querySelector('#wb-f-enabled').checked,
            order: parseInt(root.querySelector('#wb-f-order').value) || 0,
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

    function openSettings(root) {
        renderCatsList(root);
        root.querySelector('#wb-cfg-overlay').classList.remove('hidden');
    }

    function renderCatsList(root) {
        const cats = getCats();
        const el = root.querySelector('#wb-cats-list');
        el.innerHTML = cats.map(c =>
            `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;background:#1e1e35;border:1px solid #3a3a5a;font-size:11px;color:#a0a0d0">
                ${escHtml(c)}
                ${DEFAULT_CATS.includes(c) ? '' : `<button data-cat="${escHtml(c)}" style="background:none;border:none;color:#e06060;cursor:pointer;font-size:12px;padding:0 0 0 2px">×</button>`}
            </span>`
        ).join('');
        el.querySelectorAll('[data-cat]').forEach(btn => {
            btn.addEventListener('click', () => {
                const newCats = getCats().filter(c => c !== btn.dataset.cat);
                saveCats(newCats);
                renderCatsList(root);
                renderCatBar(root);
            });
        });
    }

    function exportJSON() {
        const data = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: _entries }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'aurelia-worldbook-' + new Date().toISOString().slice(0,10) + '.json';
        a.click();
    }

    async function importJSON(file, root) {
        const text = await file.text();
        const json = JSON.parse(text);
        const isSTFormat = json.entries && !Array.isArray(json.entries) && Object.values(json.entries)[0]?.uid !== undefined;
        const ourFormat  = Array.isArray(json.entries);
        let entries;
        if (isSTFormat) {
            entries = importFromST(json);
            if (!confirm(`偵測到酒館 AI 世界書格式，共 ${entries.length} 個條目。\n點擊確定將全部匯入（不覆蓋現有條目）。`)) return;
        } else if (ourFormat) {
            entries = json.entries;
            if (!confirm(`偵測到奧瑞亞格式，共 ${entries.length} 個條目。\n點擊確定將全部匯入。`)) return;
        } else {
            alert('無法識別的 JSON 格式'); return;
        }
        for (const e of entries) {
            if (!e.id) e.id = 'wb_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
            await win.OS_DB.saveWorldbookEntry(e);
        }
        await reload(root);
        alert('✅ 匯入完成，共 ' + entries.length + ' 個條目');
    }

    async function reload(root) {
        _entries = await win.OS_DB.getAllWorldbookEntries();
        renderCatBar(root);
        renderList(root);
    }

    function bindEvents(root) {
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

        root.querySelector('#wb-export-btn').addEventListener('click', exportJSON);

        root.querySelector('#wb-add-cat-btn').addEventListener('click', () => {
            const val = root.querySelector('#wb-new-cat-input').value.trim();
            if (!val) return;
            const cats = getCats();
            if (!cats.includes(val)) { cats.push(val); saveCats(cats); }
            root.querySelector('#wb-new-cat-input').value = '';
            renderCatsList(root);
            renderCatBar(root);
        });

        root.querySelector('#wb-clear-all-btn').addEventListener('click', async () => {
            if (!confirm('確定要清空全部世界書條目嗎？此操作不可撤銷！')) return;
            await win.OS_DB.clearWorldbookEntries();
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

    win.OS_WORLDBOOK = {
        /** PhoneSystem.install() 呼叫的入口 */
        launch: function(container) {
            if (!container) return;
            injectStyles();
            container.innerHTML = buildHTML();
            const root = container.querySelector('#wb-root') || container;
            bindEvents(root);
            reload(root);
        },

        getEnabledContext: async function(scanText = '') {
            const entries = await win.OS_DB.getAllWorldbookEntries();
            const enabled = entries.filter(e => e.enabled !== false);
            
            let triggered = enabled.filter(e => {
                const kStr = (e.keys || '').trim();
                if (!kStr) return true; 
                
                const keywords = kStr.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
                if (!keywords.length) return true;
                
                const text = (scanText || '').toLowerCase();
                return keywords.some(k => text.includes(k)); 
            });

            triggered.sort((a, b) => (parseInt(a.order) || 0) - (parseInt(b.order) || 0));

            if (!triggered.length) return '';
            return triggered.map(e => `[${e.category || '設定'}] ${e.title}\n${e.content}`).join('\n\n---\n\n');
        },

        getEnabledEntries: async function(scanText = '') {
            const entries = await win.OS_DB.getAllWorldbookEntries();
            const enabled = entries.filter(e => e.enabled !== false);
            
            let triggered = enabled.filter(e => {
                const kStr = (e.keys || '').trim();
                if (!kStr) return true;
                
                const keywords = kStr.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
                if (!keywords.length) return true;
                
                const text = (scanText || '').toLowerCase();
                return keywords.some(k => text.includes(k));
            });

            triggered.sort((a, b) => (parseInt(a.order) || 0) - (parseInt(b.order) || 0));
            return triggered;
        },

        getAllEnabledEntriesRaw: async function() {
            const entries = await win.OS_DB.getAllWorldbookEntries();
            const enabled = entries.filter(e => e.enabled !== false);
            enabled.sort((a, b) => (parseInt(a.order) || 0) - (parseInt(b.order) || 0));
            return enabled;
        }
    };

    console.log('[PhoneOS] ✅ 獨立世界書系統 (OS_WORLDBOOK V1.5 - UI 修復與刪除外移) 已載入');
})();