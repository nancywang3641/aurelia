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

    const LSKEY_CATS = 'os_worldbook_cats';
    const LSKEY_BOOKS = 'os_worldbook_books';
    const DEFAULT_CATS = ['預設', '角色設定', '世界觀', '規則設定', '故事背景', '物品', '其他'];
    const DEFAULT_BOOKS = ['預設書包'];

    // ── 樣式注入 ────────────────────────────────────────────────────
    function injectStyles() {
        const existing = document.getElementById('os-wb-styles');
        if (existing) existing.remove();
        const s = document.createElement('style');
        s.id = 'os-wb-styles';
        s.textContent = `
        .wb-app { display:flex; flex-direction:column; height:100%; background:#1a0d0a; color:#FFF8E7; font-size:13px; overflow:hidden; position:relative; }
        
        /* 頂部按鈕懸停效果 */
        .wb-header-btn-hover:hover { color:#FBDFA2 !important; background:rgba(251,223,162,.15) !important; }
        
        /* 書包與搜尋區 */
        .wb-tool-bar { padding:8px 12px; background:rgba(69,34,22,0.9); border-bottom:1px solid rgba(251,223,162,0.3); flex-shrink:0; display:flex; flex-direction:column; gap:8px; }
        .wb-book-row { display:flex; align-items:center; gap:8px; }
        .wb-book-select { flex:1; background:rgba(0,0,0,0.4); border:1px solid #FBDFA2; border-radius:6px; color:#FBDFA2; font-size:13px; font-weight:600; padding:6px 8px; outline:none; cursor:pointer; font-family:inherit; }
        .wb-book-btn { display:flex; align-items:center; justify-content:center; background:rgba(251,223,162,0.1); border:1px solid rgba(251,223,162,0.4); color:#FBDFA2; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:12px; font-weight:700; transition:.2s; white-space:nowrap; }
        .wb-book-btn:hover { background:rgba(251,223,162,0.25); }
        .wb-book-btn.danger { background:rgba(252,129,129,0.1); border-color:rgba(252,129,129,0.4); color:#fc8181; }
        .wb-book-btn.danger:hover { background:rgba(252,129,129,0.25); }
        
        .wb-search { width:100%; background:rgba(0,0,0,0.3); border:1px solid rgba(251,223,162,0.4); border-radius:20px; color:#FFF8E7; font-size:12px; padding:6px 14px; outline:none; box-sizing:border-box; }
        .wb-search:focus { border-color:#FBDFA2; }

        .wb-cat-bar { display:flex; gap:4px; padding:8px 10px; background:rgba(69,34,22,0.9); overflow-x:auto; flex-shrink:0; scrollbar-width:none; border-bottom:1px solid rgba(251,223,162,0.3); }
        .wb-cat-bar::-webkit-scrollbar { display:none; }
        .wb-cat-tab { flex-shrink:0; padding:4px 12px; border-radius:20px; border:1px solid rgba(251,223,162,0.3); background:none; color:#B78456; font-size:11px; cursor:pointer; transition:.2s; }
        .wb-cat-tab.active { background:#FBDFA2; border-color:#FBDFA2; color:#452216; font-weight:700; }
        
        .wb-list { flex:1; overflow-y:auto; padding:8px 10px 75px 10px; display:flex; flex-direction:column; gap:6px; }
        .wb-list::-webkit-scrollbar { width:3px; } .wb-list::-webkit-scrollbar-thumb { background:rgba(251,223,162,0.3); border-radius:2px; }
        
        .wb-entry { display:flex; align-items:center; background:rgba(120,55,25,0.6); border:1px solid rgba(251,223,162,0.2); border-radius:10px; padding:10px 12px; gap:10px; transition:border-color .2s; }
        .wb-entry:hover { border-color:#FBDFA2; }
        .wb-entry.disabled { opacity:.45; }
        .wb-entry-info { flex:1; min-width:0; }
        .wb-entry-title { font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#FFF8E7; display:flex; align-items:center; gap:6px; }
        .wb-entry-order { background:rgba(69,34,22,0.8); color:#FBDFA2; padding:1px 5px; border-radius:4px; font-size:10px; font-weight:700; border:1px solid rgba(251,223,162,0.2); }
        .wb-entry-meta { font-size:10px; color:#E0D8C8; margin-top:4px; }
        .wb-entry-cat { display:inline-block; padding:1px 7px; border-radius:10px; background:rgba(69,34,22,0.8); border:1px solid rgba(251,223,162,0.3); font-size:9px; color:#FBDFA2; margin-right:4px; }
        
        .wb-entry-edit, .wb-entry-del { background:none; border:none; cursor:pointer; font-size:14px; padding:5px; border-radius:6px; transition:.2s; flex-shrink:0; }
        .wb-entry-edit { color:#B78456; }
        .wb-entry-edit:hover { color:#FBDFA2; background:rgba(251,223,162,.15); }
        .wb-entry-del { color:#fc8181; margin-left:2px; }
        .wb-entry-del:hover { color:#ff9999; background:rgba(252,129,129,.15); }
        
        .wb-toggle { position:relative; width:34px; height:18px; flex-shrink:0; }
        .wb-toggle input { opacity:0; width:0; height:0; position:absolute; }
        .wb-toggle-slider { position:absolute; inset:0; background:rgba(251,223,162,0.3); border-radius:18px; cursor:pointer; transition:.25s; }
        .wb-toggle input:checked + .wb-toggle-slider { background:#FBDFA2; }
        .wb-toggle-slider:before { content:''; position:absolute; width:12px; height:12px; left:3px; top:3px; background:#452216; border-radius:50%; transition:.25s; }
        .wb-toggle input:checked + .wb-toggle-slider:before { transform:translateX(16px); }
        .wb-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#B78456; gap:8px; text-align:center; padding:20px; }
        .wb-empty-icon { font-size:40px; opacity:.4; margin-bottom:8px; }
        
        .wb-fab { position:absolute; bottom:70px; right:16px; width:44px; height:44px; border-radius:50%; background:#FBDFA2; border:none; color:#452216; font-size:22px; cursor:pointer; box-shadow:0 4px 16px rgba(251,223,162,.35); display:flex; align-items:center; justify-content:center; transition:.2s; z-index:10; }
        .wb-fab:hover { background:#fce8b2; transform:scale(1.05); }

        .wb-overlay { position:absolute; inset:0; background:rgba(20,10,5,.95); backdrop-filter:blur(3px); z-index:50; display:flex; flex-direction:column; padding-bottom: 55px; box-sizing: border-box; }
        .wb-overlay.hidden { display:none; }
        .wb-form { flex:1; background:rgba(69,34,22,0.95); display:flex; flex-direction:column; overflow:hidden; border-top-left-radius:8px; border-top-right-radius:8px; border-top:1px solid rgba(251,223,162,0.3); }
        .wb-form-header { display:flex; align-items:center; padding:12px 14px; border-bottom:1px solid rgba(251,223,162,0.3); gap:8px; }
        .wb-form-title-text { flex:1; font-size:14px; font-weight:600; color:#FBDFA2; }
        .wb-form-save { background:#FBDFA2; border:none; color:#452216; font-size:12px; font-weight:700; padding:5px 14px; border-radius:20px; cursor:pointer; }
        .wb-form-save:hover { background:#fce8b2; }
        .wb-form-cancel { background:none; border:1px solid rgba(251,223,162,0.3); color:#B78456; font-size:12px; padding:5px 12px; border-radius:20px; cursor:pointer; }
        .wb-form-cancel:hover { color:#FBDFA2; background:rgba(251,223,162,0.1); }
        .wb-form-body { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:12px; }
        .wb-field label { display:block; font-size:11px; color:#B78456; margin-bottom:5px; letter-spacing:.3px; font-weight:600; }
        .wb-field input, .wb-field select, .wb-field textarea { width:100%; background:rgba(0,0,0,0.3); border:1px solid rgba(251,223,162,0.4); border-radius:8px; color:#FFF8E7; font-size:13px; padding:8px 10px; box-sizing:border-box; outline:none; transition:border-color .2s; font-family:inherit; }
        .wb-field input:focus, .wb-field select:focus, .wb-field textarea:focus { border-color:#FBDFA2; }
        .wb-field textarea { resize:vertical; min-height:180px; line-height:1.6; }
        .wb-field select option { background:rgba(69,34,22,0.95); }
        .wb-field-row { display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(251,223,162,0.2); }
        .wb-field-row label { font-size:12px; color:#E0D8C8; margin:0; }

        .wb-tag-box { display:flex; flex-wrap:wrap; gap:6px; padding:6px 10px; background:rgba(0,0,0,0.3); border:1px solid rgba(251,223,162,0.4); border-radius:8px; align-items:center; transition:.2s; min-height:34px; box-sizing:border-box; cursor:text; }
        .wb-tag-box:focus-within { border-color:#FBDFA2; }
        .wb-tag-item { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; background:rgba(120,55,25,0.6); border:1px solid rgba(251,223,162,0.3); border-radius:12px; font-size:11px; color:#FBDFA2; font-weight:500; }
        .wb-tag-remove { background:none; border:none; color:#fc8181; font-size:12px; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center; }
        .wb-tag-remove:hover { color:#ff9999; }
        .wb-tag-input { flex:1; min-width:80px; background:transparent !important; border:none !important; color:#FFF8E7; font-size:12px; outline:none !important; font-family:inherit; padding:0 !important; }
        .wb-tag-sug-area { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }
        .wb-tag-sug { background:rgba(120,55,25,0.4); border:1px dashed rgba(251,223,162,0.4); color:#B78456; padding:3px 10px; border-radius:12px; font-size:10px; cursor:pointer; transition:.2s; }
        .wb-tag-sug:hover { border-color:#FBDFA2; color:#FBDFA2; background:rgba(251,223,162,.15); }

        .wb-settings { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:14px; }
        .wb-section { background:rgba(69,34,22,0.6); border:1px solid rgba(251,223,162,0.3); border-radius:10px; padding:12px 14px; }
        .wb-section-title { font-size:11px; color:#FBDFA2; letter-spacing:1px; text-transform:uppercase; margin-bottom:10px; font-weight:600; }
        .wb-input { width:100%; background:rgba(0,0,0,0.3); border:1px solid rgba(251,223,162,0.4); border-radius:8px; color:#FFF8E7; font-size:12px; padding:7px 10px; box-sizing:border-box; outline:none; margin-bottom:7px; font-family:inherit; }
        .wb-input:focus { border-color:#FBDFA2; }
        .wb-btn { width:100%; padding:9px; border-radius:8px; border:none; font-size:13px; cursor:pointer; font-weight:600; margin-top:4px; transition:.2s; }
        .wb-btn-primary { background:#FBDFA2; color:#452216; }
        .wb-btn-primary:hover { background:#fce8b2; }
        .wb-btn-secondary { background:rgba(120,55,25,0.6); color:#FBDFA2; border:1px solid rgba(251,223,162,0.3); }
        .wb-btn-secondary:hover { background:rgba(120,55,25,0.8); }
        .wb-btn-danger { background:rgba(252,129,129,.15); color:#fc8181; border:1px solid rgba(252,129,129,.3); }
        .wb-btn-danger:hover { background:rgba(252,129,129,.25); }
        .wb-hint { font-size:10px; color:#B78456; margin-top:4px; line-height:1.5; }

        /* ── 匯出選擇器 ── */
        .wb-export-modal { position:absolute; inset:0; background:rgba(10,5,2,0.88); backdrop-filter:blur(4px); z-index:80; display:flex; align-items:flex-end; justify-content:center; }
        .wb-export-modal.hidden { display:none; }
        .wb-export-sheet { width:100%; background:rgba(50,22,10,0.98); border-top:1px solid rgba(251,223,162,0.35); border-radius:16px 16px 0 0; padding:18px 16px 28px; display:flex; flex-direction:column; gap:12px; max-height:70%; overflow:hidden; }
        .wb-export-title { font-size:14px; font-weight:700; color:#FBDFA2; letter-spacing:1px; text-align:center; }
        .wb-export-list { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding-right:2px; }
        .wb-export-list::-webkit-scrollbar { width:3px; } .wb-export-list::-webkit-scrollbar-thumb { background:rgba(251,223,162,0.3); border-radius:2px; }
        .wb-export-row { display:flex; align-items:center; gap:10px; padding:10px 12px; background:rgba(120,55,25,0.4); border:1px solid rgba(251,223,162,0.15); border-radius:8px; cursor:pointer; transition:.2s; }
        .wb-export-row:hover, .wb-export-row.checked { border-color:rgba(251,223,162,0.5); background:rgba(120,55,25,0.7); }
        .wb-export-row input[type=checkbox] { accent-color:#FBDFA2; width:15px; height:15px; flex-shrink:0; cursor:pointer; }
        .wb-export-row-name { flex:1; font-size:13px; color:#FFF8E7; }
        .wb-export-row-count { font-size:11px; color:#B78456; }
        .wb-export-actions { display:flex; gap:8px; flex-shrink:0; }
        .wb-export-sel-all { font-size:11px; color:#B78456; cursor:pointer; padding:4px 10px; border:1px solid rgba(251,223,162,0.2); border-radius:12px; background:none; transition:.2s; }
        .wb-export-sel-all:hover { color:#FBDFA2; border-color:rgba(251,223,162,0.4); }
        .wb-export-confirm { flex:1; padding:10px; background:#FBDFA2; color:#452216; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; transition:.2s; }
        .wb-export-confirm:hover { background:#fce8b2; }
        .wb-export-cancel { padding:10px 16px; background:none; color:#B78456; border:1px solid rgba(251,223,162,0.25); border-radius:8px; font-size:13px; cursor:pointer; }
        .wb-export-cancel:hover { color:#FBDFA2; }
        `;
        document.head.appendChild(s);
    }

    // ── 資料存取 ────────────────────────────────────────────────────
    function getCats() {
        try { return JSON.parse(localStorage.getItem(LSKEY_CATS)) || [...DEFAULT_CATS]; }
        catch(e) { return [...DEFAULT_CATS]; }
    }
    function saveCats(cats) { localStorage.setItem(LSKEY_CATS, JSON.stringify(cats)); }

    function getBooks() {
        try { return JSON.parse(localStorage.getItem(LSKEY_BOOKS)) || [...DEFAULT_BOOKS]; }
        catch(e) { return [...DEFAULT_BOOKS]; }
    }
    function saveBooks(books) { localStorage.setItem(LSKEY_BOOKS, JSON.stringify(books)); }

    // ── 格式匯入 ────────────────────────────────────────────────────
    function importFromST(json, targetBookName) {
        const entries = [];
        const cats = getCats();
        const src = json.entries || json;
        const items = Array.isArray(src) ? src : Object.values(src);
        
        items.forEach((e, i) => {
            const cat = e.group && e.group.trim() ? e.group.trim() : '預設';
            if (cat && !cats.includes(cat)) cats.push(cat);
            
            let keyStr = '';
            if (e.keyword) {
                if (Array.isArray(e.keyword)) keyStr = e.keyword.join(',');
                else if (typeof e.keyword === 'string') keyStr = e.keyword;
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
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        });
        saveCats(cats);
        return entries;
    }

    // ── HTML 結構 (🔥 已完全退回 V1.6 的 Inline Flex 排版) ──────────
    function buildHTML() {
        return `
        <div class="wb-app" id="wb-root">
          <div class="wb-header" style="display:flex!important;align-items:center!important;justify-content:space-between!important;width:100%!important;padding:15px 20px!important;padding-top:calc(15px + env(safe-area-inset-top,0px))!important;background:rgba(69,34,22,0.85)!important;border-bottom:1px solid rgba(251,223,162,0.3)!important;flex-shrink:0!important;box-sizing:border-box!important;">
            <button onclick="goHome()" title="返回大廳" class="wb-header-btn-hover"
              style="font-size:24px!important;color:#B78456!important;width:32px!important;height:32px!important;background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:all 0.2s;flex-shrink:0;">‹</button>
            <span style="flex:1!important;text-align:center!important;font-size:18px!important;font-weight:800!important;letter-spacing:2px!important;color:#FBDFA2!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">世界書工坊</span>
            <button id="wb-settings-btn" title="系統管理" class="wb-header-btn-hover"
              style="width:32px!important;height:32px!important;background:none;border:none;color:#B78456;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:0.2s;flex-shrink:0;">⚙️</button>
          </div>

          <div class="wb-tool-bar">
            <div class="wb-book-row">
              <span style="font-size:18px; color:#FBDFA2;" title="當前書包">📚</span>
              <select id="wb-book-select" class="wb-book-select"></select>
              <button id="wb-new-book-btn" class="wb-book-btn" title="創建新世界書包">＋ 創建</button>
              <button id="wb-del-book-btn" class="wb-book-btn danger" title="刪除當前書包">🗑️</button>
            </div>
            <input class="wb-search" id="wb-search" placeholder="搜尋條目或關鍵字..." />
          </div>

          <div class="wb-cat-bar" id="wb-cat-bar"></div>

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
                <div style="display:flex; gap:10px;">
                  <div class="wb-field" style="flex:1;">
                    <label>分類 (Category)</label>
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
                  <div class="wb-hint" style="margin-top:6px; color:#B78456;">📚 點擊快速加入：</div>
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
                  <div class="wb-section-title">🏷 全域分類管理</div>
                  <div id="wb-cats-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px"></div>
                  <div style="display:flex;gap:6px">
                    <input class="wb-input" id="wb-new-cat-input" placeholder="新分類名稱" style="margin:0;flex:1" />
                    <button class="wb-btn wb-btn-primary" id="wb-add-cat-btn" style="width:auto;padding:7px 14px;margin:0">添加</button>
                  </div>
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
    let _activeCat = '全部';
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
    }

    function renderCatBar(root) {
        const bar = root.querySelector('#wb-cat-bar');
        
        // 取得當前書包內的所有條目
        const currentBookEntries = _entries.filter(e => e.book === _activeBook);
        
        // 提取該書包內有用到的分類
        const usedCats = [...new Set(currentBookEntries.map(e => e.category).filter(c => c && c.trim()))].sort();
        const storedCats = getCats();
        
        // 合併全域預設分類與目前用到的分類
        const displayCats = ['全部', ...new Set([...storedCats, ...usedCats])];

        bar.innerHTML = displayCats.map(c => {
            return `<button class="wb-cat-tab${c === _activeCat ? ' active' : ''}" data-cat="${escHtml(c)}">${escHtml(c)}</button>`;
        }).join('');
        
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
        
        // 1. 先過濾出屬於當前「書包」的條目
        let filtered = _entries.filter(e => e.book === _activeBook);
        
        // 2. 再根據分類過濾
        if (_activeCat !== '全部') {
            filtered = filtered.filter(e => e.category === _activeCat);
        }
        
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
            let keysHtml = '<span class="wb-entry-keys" style="color:#6b8e23">📌 常駐</span>';
            if (e.keys) {
                // 🔥 修復：強制轉成字串，防止舊資料格式報錯
                keysHtml = String(e.keys).split(',').map(k => `<span style="display:inline-block;background:rgba(251,223,162,.15);color:#FBDFA2;padding:1px 6px;border-radius:6px;margin-right:3px;border:1px solid rgba(251,223,162,0.2);">#${escHtml(k.trim())}</span>`).join('');
            }
            const orderLabel = (e.order && parseInt(e.order) !== 0) ? `<span class="wb-entry-order">Order: ${e.order}</span>` : '';

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
                        <span class="wb-entry-cat">${escHtml(e.category || '預設')}</span>
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
        
        if (suggestions.length === 0) {
            sugArea.innerHTML = '<span style="color:#B78456; font-size:10px;">(當前書包無其他可用標籤)</span>';
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

    function populateCatSelect(root) {
        const sel = root.querySelector('#wb-f-cat');
        const storedCats = getCats();
        const currentBookEntries = _entries.filter(e => e.book === _activeBook);
        const usedCats  = [...new Set(currentBookEntries.map(e => e.category).filter(c => c && c.trim()))];
        const allCats    = [...new Set([...storedCats, ...usedCats])];
        sel.innerHTML = allCats.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
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
        root.querySelector('#wb-f-cat').value = entry.category || '預設';

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

    // ── 設定與操作 ────────────────────────────────────────────────────
    function openSettings(root) {
        renderCatsList(root);
        root.querySelector('#wb-cfg-overlay').classList.remove('hidden');
    }

    function renderCatsList(root) {
        const cats = getCats();
        const el = root.querySelector('#wb-cats-list');
        el.innerHTML = cats.map(c =>
            `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;background:rgba(120,55,25,0.6);border:1px solid rgba(251,223,162,0.3);font-size:11px;color:#FBDFA2">
                ${escHtml(c)}
                ${DEFAULT_CATS.includes(c) ? '' : `<button data-cat="${escHtml(c)}" style="background:none;border:none;color:#fc8181;cursor:pointer;font-size:12px;padding:0 0 0 2px">×</button>`}
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

    async function reload(root) {
        _entries = await win.OS_DB.getAllWorldbookEntries();
        
        // 🔥 向下兼容 & 角色卡相容升級：將舊版角色卡分類「升格」為獨立書包
        let needsMigration = false;
        let books = getBooks();
        for (const e of _entries) {
            if (!e.book) {
                // 檢查是否為系統預設分類
                if (e.category && !DEFAULT_CATS.includes(e.category)) {
                    // 舊版把「角色名稱」存在 category 裡，現在將其升格為書包
                    e.book = e.category;
                    e.category = '角色自帶設定'; // 將原本條目的分類重置為預設
                    if (!books.includes(e.book)) books.push(e.book);
                } else {
                    e.book = '預設書包';
                }
                needsMigration = true;
                await win.OS_DB.saveWorldbookEntry(e); // 更新至資料庫
            }
        }
        if (needsMigration) {
            saveBooks(books); // 更新可用的書包清單
        }
        
        renderBookSelector(root);
        renderCatBar(root);
        renderList(root);
    }

    function bindEvents(root) {
        // 書包下拉選單
        root.querySelector('#wb-book-select').addEventListener('change', e => {
            _activeBook = e.target.value;
            _activeCat = '全部'; // 切換書包時重置分類
            renderCatBar(root);
            renderList(root);
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
                _activeCat = '全部';
                renderBookSelector(root);
                renderCatBar(root);
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
            
            _activeBook = books[0];
            _activeCat = '全部';
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
            if (!confirm('🚨 確定要銷毀所有世界書包與條目嗎？此操作不可撤銷！')) return;
            await win.OS_DB.clearWorldbookEntries();
            saveBooks([...DEFAULT_BOOKS]);
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
            injectStyles();
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

            triggered.sort((a, b) => (parseInt(a.order) || 0) - (parseInt(b.order) || 0));

            if (!triggered.length) return '';
            return triggered.map(e => `[${e.category || '設定'}] ${e.title}\n${e.content}`).join('\n\n---\n\n');
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

        /**
         * 根據指定的「書包名稱」和掃描文字，組裝出最終上下文
         * @param {string[]} packNames - 要載入的書包名稱陣列，例如 ['預設書包', '賽博龐克']
         * @param {string} scanText - 要進行關鍵字掃描的文字
         * @returns {Promise<string>} - 組裝好的世界書字串
         */
        getContextByPacks: async function(packNames = [], scanText = '') {
            if (!packNames || packNames.length === 0) return '';
            
            const entries = await win.OS_DB.getAllWorldbookEntries();
            
            // 只篩選出啟用的，且其所屬「書包(book)」包含在 packNames 內的條目
            const enabledAndSelected = entries.filter(e => 
                e.enabled !== false && packNames.includes(e.book || '預設書包')
            );
            
            let triggered = enabledAndSelected.filter(e => {
                // 🔥 修復：強制轉成字串，防止舊資料格式報錯
                const kStr = (e.keys ? String(e.keys) : '').trim();
                if (!kStr) return true; 
                
                const keywords = kStr.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
                if (!keywords.length) return true;
                
                const text = (scanText || '').toLowerCase();
                return keywords.some(k => text.includes(k)); 
            });

            triggered.sort((a, b) => (parseInt(b.order) || 0) - (parseInt(a.order) || 0));

            if (!triggered.length) return '';
            return triggered.map(e => `[${e.category || '設定'}] ${e.title}\n${e.content}`).join('\n\n---\n\n');
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
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                await win.OS_DB.saveWorldbookEntry(entry);
            }
            console.log(`[OS_WORLDBOOK] ✅ 已成功為角色卡「${cardName}」建立專屬書包並匯入 ${entriesData.length} 條設定。`);
        }
    };

    console.log('[PhoneOS] ✅ 獨立世界書系統 (OS_WORLDBOOK V2.2 - 排版熱修復版) 已載入');
})();