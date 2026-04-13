// ----------------------------------------------------------------
// [檔案] os_persona.js (V5.8 - 終極穩定版：V5.0 核心通訊 + 拿鐵咖啡 UI)
// 路徑：os_phone/os/os_persona.js
// 職責：統一的人設切換與管理 (OS 層級)
// 說明：完美還原 V5.0 的 REQUEST_SWITCH_USER_PERSONA 通訊協議，確保 ST 模式切換絕對有效，並整合拿鐵主題。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入人設管理器 V5.8 (拿鐵咖啡色票版)...');
    const win = window.parent || window;
    const doc = win.document;

    const LS_KEY = 'os_personas';          
    const LS_CUR = 'os_persona_current';   

    // ── 當前人設快取 (還原 V5.0 結構) ──
    let CURRENT_PERSONA = { name: 'User', id: 'user_default', avatar: '', desc: '', personas: [] };
    let ST_PERSONAS_LIST = []; 

    function isStandalone() {
        try { return !(win.SillyTavern && win.SillyTavern.getContext); } 
        catch(e) { return true; }
    }

    function loadLocalPersonas() {
        try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch(e) { return []; }
    }
    function saveLocalPersonas(list) {
        localStorage.setItem(LS_KEY, JSON.stringify(list));
    }
    function loadCurrentId() {
        return localStorage.getItem(LS_CUR) || null;
    }
    function saveCurrentId(id) {
        localStorage.setItem(LS_CUR, id);
    }

    // ── 建立與酒館的通訊橋樑 (還原 V5.0) ──
    if (!win._os_persona_listening) {
        win.addEventListener('message', e => {
            if (!e.data) return;
            if (e.data.type === 'USER_PERSONA_LIST_RESPONSE') {
                ST_PERSONAS_LIST = e.data.data?.personas || [];
                if (_rootContainer) refreshList(); 
            }
        });
        win._os_persona_listening = true;
    }

    // ── 新版拿鐵咖啡 UI 樣式 ──
    function injectStyles() {
        const sid = 'os-persona-styles';
        if (doc.getElementById(sid)) return;
        const s = doc.createElement('style');
        s.id = sid;
        s.textContent = `
        .ps-app { display:flex; flex-direction:column; height:100%; width:100%; background:#452216; color:#FFF8E7; font-family:'Noto Sans TC',sans-serif; overflow:hidden; position:relative; }
        .ps-app::before { content:''; position:absolute; inset:0; pointer-events:none; z-index:0; background-image:linear-gradient(rgba(251,223,162,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(251,223,162,0.05) 1px, transparent 1px); background-size: 30px 30px; opacity: 0.8; }
        
        .ps-header { display:flex; align-items:center; justify-content:center; height:56px; background:rgba(69,34,22,0.85); border-bottom:1px solid rgba(251,223,162,0.2); flex-shrink:0; box-shadow:0 2px 10px rgba(0,0,0,0.3); position:relative; z-index:2; }
        .ps-title { font-size:15px; font-weight:800; color:#FBDFA2; letter-spacing:1px; text-transform:uppercase; }
        
        .ps-body { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px; position:relative; z-index:2; }
        .ps-body::-webkit-scrollbar { width:4px; }
        .ps-body::-webkit-scrollbar-thumb { background:rgba(251,223,162,0.4); border-radius:4px; }
        
        .ps-card { display:flex; align-items:center; background:rgba(120,55,25,0.9); border:1px solid rgba(251,223,162,0.2); border-left:3px solid #B78456; border-radius:8px; padding:14px; gap:14px; transition:all 0.2s ease; position:relative; box-shadow:0 4px 15px rgba(0,0,0,0.3); cursor:pointer; }
        .ps-card:hover { background:rgba(183,132,86,1); border-color:#FBDFA2; border-left-color:#FBDFA2; transform:translateX(4px); box-shadow:0 6px 20px rgba(251,223,162,0.15); }
        .ps-card.active { background:rgba(183,132,86,1); border-color:#FBDFA2; border-left-color:#FBDFA2; box-shadow:0 4px 15px rgba(251,223,162,0.25); }
        
        .ps-avatar { width:52px; height:52px; border-radius:50%; background:rgba(69,34,22,0.8); object-fit:cover; flex-shrink:0; border:2px solid rgba(251,223,162,0.5); box-shadow:0 2px 8px rgba(0,0,0,0.4); transition:0.2s; }
        .ps-card.active .ps-avatar { border-color:#FBDFA2; box-shadow:0 0 10px rgba(251,223,162,0.5); }
        
        .ps-info { flex:1; min-width:0; padding-right:10px; }
        .ps-name { font-size:15px; font-weight:800; color:#FFF8E7; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; }
        .ps-desc { font-size:11px; color:#B78456; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        
        .ps-actions { display:flex; flex-direction:column; gap:8px; flex-shrink:0; }
        .ps-btn-edit, .ps-btn-del { background:none; border:none; font-size:13px; cursor:pointer; padding:8px; border-radius:6px; transition:.2s; display:flex; align-items:center; justify-content:center; }
        .ps-btn-edit { color:#FBDFA2; background:rgba(251,223,162,0.1); border:1px solid rgba(251,223,162,0.3); }
        .ps-btn-edit:hover { background:rgba(251,223,162,0.2); border-color:#FBDFA2; box-shadow:0 0 8px rgba(251,223,162,0.3); }
        .ps-btn-del { color:#fc8181; background:rgba(252,129,129,0.1); border:1px solid rgba(252,129,129,0.3); }
        .ps-btn-del:hover { background:rgba(252,129,129,0.2); border-color:#fc8181; box-shadow:0 0 8px rgba(252,129,129,0.3); }

        .ps-add-btn { width:100%; padding:14px; background:linear-gradient(135deg, #FBDFA2, #B78456); border:none; border-radius:8px; color:#452216; font-size:13px; font-weight:900; cursor:pointer; transition:.2s; display:flex; align-items:center; justify-content:center; gap:8px; margin-top:8px; letter-spacing:1px; box-shadow:0 4px 15px rgba(251,223,162,0.2); }
        .ps-add-btn:hover { filter:brightness(1.1); transform:translateY(-2px); box-shadow:0 6px 20px rgba(251,223,162,0.4); }

        .ps-modal-overlay { position:absolute; inset:0; background:rgba(0,0,0,0.6); z-index:100; display:flex; align-items:center; justify-content:center; padding:20px; opacity:0; pointer-events:none; transition:opacity 0.2s; backdrop-filter:blur(4px); }
        .ps-modal-overlay.show { opacity:1; pointer-events:auto; }
        .ps-modal { width:100%; max-width:340px; background:rgba(120,55,25,0.95); border:1px solid #FBDFA2; border-radius:12px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 15px 50px rgba(0,0,0,0.6); transform:translateY(15px); transition:transform 0.2s; }
        .ps-modal-overlay.show .ps-modal { transform:translateY(0); }
        
        .ps-modal-header { padding:16px; background:rgba(69,34,22,0.9); border-bottom:1px solid rgba(251,223,162,0.3); font-size:15px; font-weight:800; color:#FBDFA2; text-align:center; letter-spacing:1px; }
        .ps-modal-body { padding:20px 16px; display:flex; flex-direction:column; gap:14px; }
        .ps-field label { display:block; font-size:11px; font-weight:800; color:#B78456; margin-bottom:6px; letter-spacing:0.5px; }
        .ps-field input, .ps-field textarea { width:100%; background:rgba(69,34,22,0.8); border:1px solid rgba(251,223,162,0.4); border-radius:6px; color:#FFF8E7; font-size:13px; padding:12px; box-sizing:border-box; outline:none; transition:border-color 0.2s, box-shadow 0.2s; font-family:inherit; }
        .ps-field input:focus, .ps-field textarea:focus { border-color:#FBDFA2; box-shadow:0 0 0 3px rgba(251,223,162,0.2); background:rgba(120,55,25,0.9); }
        .ps-field textarea { resize:vertical; min-height:90px; line-height:1.5; }
        
        .ps-modal-footer { display:flex; border-top:1px solid rgba(251,223,162,0.3); background:rgba(69,34,22,0.6); }
        .ps-modal-btn { flex:1; padding:14px; background:none; border:none; font-size:13px; font-weight:800; cursor:pointer; transition:0.2s; letter-spacing:1px; }
        .ps-modal-cancel { color:#B78456; border-right:1px solid rgba(251,223,162,0.2); }
        .ps-modal-cancel:hover { background:rgba(251,223,162,0.1); color:#FBDFA2; }
        .ps-modal-save { color:#FBDFA2; }
        .ps-modal-save:hover { background:rgba(251,223,162,0.15); text-shadow:0 0 8px rgba(251,223,162,0.5); }
        `;
        doc.head.appendChild(s);
    }

    // ── 完全還原 V5.0 的 ST 狀態同步邏輯 ──
    function syncFromST() {
        if (isStandalone()) return;
        try {
            const userBlock = doc.querySelector('#user_avatar_block .avatar-container.selected');
            if (userBlock) {
                const nameEl = userBlock.querySelector('.ch_name.flex1');
                if (nameEl?.textContent.trim()) CURRENT_PERSONA.name = nameEl.textContent.trim();
                const avatarEl = userBlock.querySelector('[data-avatar-id]');
                if (avatarEl) {
                    const id = avatarEl.getAttribute('data-avatar-id');
                    if (id) { CURRENT_PERSONA.id = id; CURRENT_PERSONA.avatar = `/thumbnail?type=persona&file=${id}`; }
                }
                const descEl = userBlock.querySelector('.ch_description');
                if (descEl) {
                    let d = descEl.textContent.trim().replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
                    if (d && !d.includes('無使用者角色描述')) CURRENT_PERSONA.desc = d;
                }
            }
            const pu = win.power_user || win.parent?.power_user;
            if (pu?.personas) {
                if (!CURRENT_PERSONA.name || CURRENT_PERSONA.name === 'User') {
                    if (pu.persona_selected && pu.personas[pu.persona_selected]) {
                        const p = pu.personas[pu.persona_selected];
                        CURRENT_PERSONA.name = p.name || pu.persona_selected;
                        CURRENT_PERSONA.desc = (p.description || '').replace(/<[^>]+>/g, '').trim();
                        if (p.avatar) CURRENT_PERSONA.avatar = p.avatar;
                    }
                }
            }
        } catch(e) {}
    }

    function initCurrent() {
        if (isStandalone()) {
            const list = loadLocalPersonas();
            const curId = loadCurrentId();
            let p = list.find(x => x.id === curId);
            if (!p && list.length > 0) { p = list[0]; saveCurrentId(p.id); }
            if (p) {
                CURRENT_PERSONA = { ...p };
            } else {
                const defaultP = { id: 'p_' + Date.now(), name: 'User', desc: '這是一個預設的體驗者身分。', avatar: '' };
                saveLocalPersonas([defaultP]);
                saveCurrentId(defaultP.id);
                CURRENT_PERSONA = { ...defaultP };
            }
        } else {
            syncFromST();
        }
    }

    let _rootContainer = null;
    
    function renderApp(container) {
        _rootContainer = container;
        container.innerHTML = `
            <div class="ps-app" id="ps-app-root">
                <div class="ps-header">
                    <div class="ps-title"><i class="fa-solid fa-address-card"></i> PERSONA / 關於我</div>
                </div>
                <div class="ps-body" id="ps-list-container">
                    <div style="text-align:center; padding:40px; color:#B78456;">載入中...</div>
                </div>
                
                <div class="ps-modal-overlay" id="ps-modal">
                    <div class="ps-modal">
                        <div class="ps-modal-header" id="ps-modal-title">編輯設定</div>
                        <div class="ps-modal-body">
                            <div class="ps-field">
                                <label>名稱 (Name)</label>
                                <input type="text" id="ps-f-name" placeholder="輸入名稱..." />
                            </div>
                            <div class="ps-field">
                                <label>頭像圖片網址 (URL)</label>
                                <input type="text" id="ps-f-avatar" placeholder="https://..." />
                            </div>
                            <div class="ps-field">
                                <label>背景與特徵 (Description)</label>
                                <textarea id="ps-f-desc" placeholder="詳細描述你的外觀、性格與背景..."></textarea>
                            </div>
                        </div>
                        <div class="ps-modal-footer">
                            <button class="ps-modal-btn ps-modal-cancel" id="ps-btn-cancel">取消</button>
                            <button class="ps-modal-btn ps-modal-save" id="ps-btn-save">儲存</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (!isStandalone()) {
            win.postMessage({ type: 'REQUEST_USER_PERSONA_LIST', source: 'PHONE_OS' }, '*');
            setTimeout(refreshList, 150); 
        } else {
            refreshList();
        }
    }

    // ── 渲染酒館專屬的同步列表 ──
    function renderSTModeList(listContainer) {
        syncFromST(); // 確保抓到最新狀態
        let curId = CURRENT_PERSONA.id || CURRENT_PERSONA.name; 

        // 嘗試從 DOM 輔助獲取精確 ID
        const select = doc.getElementById('user_persona');
        if (select && select.value) curId = select.value;

        let listToRender = [];
        if (ST_PERSONAS_LIST.length > 0) {
            listToRender = ST_PERSONAS_LIST.map(p => ({
                id: p.id || p.avatar || p.name, 
                name: p.name,
                desc: p.description || p.desc || '',
                avatar: p.avatar_url || p.avatar || '',
                active: (p.id === curId || p.avatar === curId || p.name === curId)
            }));
        } else if (select) {
            listToRender = Array.from(select.options).map(opt => ({
                id: opt.value,
                name: opt.text,
                desc: '',
                avatar: '',
                active: opt.value === curId
            }));
        }

        if (listToRender.length === 0) {
            listContainer.innerHTML = `<div style="text-align:center; padding:40px; color:#B78456;">無法讀取酒館人設列表。</div>`;
            return;
        }

        listContainer.innerHTML = `
            <div style="margin-bottom: 12px; font-size: 11px; color: #B78456; text-align: center; background: rgba(69,34,22,0.8); padding: 10px; border-radius: 8px; border: 1px solid rgba(251,223,162,0.2);">
                <i class="fa-solid fa-link" style="color:#FBDFA2;"></i> <b>已與 ST 酒館人設同步</b><br>
                <span style="font-size:10px; opacity:0.8;">(若需新增或編輯，請使用右側原生面板)</span>
            </div>
        ` + listToRender.map(p => `
            <div class="ps-card ${p.active ? 'active' : ''}" data-id="${p.id}" data-name="${p.name}">
                ${p.avatar ? `<img class="ps-avatar" src="${p.avatar}" onerror="this.src='https://files.catbox.moe/l5hl69.png'" />` : 
                `<div class="ps-avatar" style="display:flex;align-items:center;justify-content:center;font-size:24px;color:#FBDFA2;"><i class="fa-solid fa-user"></i></div>`}
                <div class="ps-info">
                    <div class="ps-name">
                        ${esc(p.name)} 
                        ${p.active ? '<i class="fa-solid fa-circle-check" style="color:#FBDFA2; margin-left:6px; font-size:14px; text-shadow:0 0 5px rgba(251,223,162,0.5);" title="當前使用中"></i>' : ''}
                    </div>
                    <div class="ps-desc">${esc(p.desc) || '<i style="opacity:0.6">ST 原生設定檔</i>'}</div>
                </div>
            </div>
        `).join('');

        // 🔥 點擊觸發還原版的 switchPersona
        listContainer.querySelectorAll('.ps-card').forEach(el => {
            el.addEventListener('click', () => {
                const targetId = el.dataset.id;
                const targetName = el.dataset.name;
                
                API.switchPersona(targetId, targetName);

                // 樂觀更新畫面 UI
                listContainer.querySelectorAll('.ps-card').forEach(card => card.classList.remove('active'));
                listContainer.querySelectorAll('.fa-circle-check').forEach(icon => icon.remove());
                
                el.classList.add('active');
                const nameEl = el.querySelector('.ps-name');
                if (nameEl && !nameEl.querySelector('.fa-circle-check')) {
                    nameEl.innerHTML += ' <i class="fa-solid fa-circle-check" style="color:#FBDFA2; margin-left:6px; font-size:14px; text-shadow:0 0 5px rgba(251,223,162,0.5);" title="當前使用中"></i>';
                }
            });
        });
    }

    function refreshList() {
        const listContainer = _rootContainer.querySelector('#ps-list-container');
        
        if (!isStandalone()) {
            renderSTModeList(listContainer);
            return;
        }

        // ── 獨立模式 ──
        const list = loadLocalPersonas();
        const curId = loadCurrentId();

        listContainer.innerHTML = list.map(p => `
            <div class="ps-card ${p.id === curId ? 'active' : ''}" data-id="${p.id}">
                <img class="ps-avatar" src="${p.avatar || 'https://files.catbox.moe/l5hl69.png'}" onerror="this.src='https://files.catbox.moe/l5hl69.png'" />
                <div class="ps-info">
                    <div class="ps-name">
                        ${esc(p.name)} 
                        ${p.id === curId ? '<i class="fa-solid fa-circle-check" style="color:#FBDFA2; margin-left:6px; font-size:14px; text-shadow:0 0 5px rgba(251,223,162,0.5);" title="當前使用中"></i>' : ''}
                    </div>
                    <div class="ps-desc">${esc(p.desc) || '<i style="opacity:0.6">點擊編輯新增設定...</i>'}</div>
                </div>
                <div class="ps-actions">
                    <button class="ps-btn-edit" data-id="${p.id}" title="編輯"><i class="fa-solid fa-pen"></i></button>
                    ${list.length > 1 ? `<button class="ps-btn-del" data-id="${p.id}" title="刪除"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </div>
        `).join('') + `
            <button class="ps-add-btn" id="ps-btn-add"><i class="fa-solid fa-plus"></i> 創建新人設</button>
        `;

        listContainer.querySelectorAll('.ps-card').forEach(el => {
            el.addEventListener('click', (e) => {
                if(e.target.closest('button')) return; 
                API.switchPersona(el.dataset.id, null); 
            });
        });

        listContainer.querySelectorAll('.ps-btn-edit').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditModal(el.dataset.id);
            });
        });

        listContainer.querySelectorAll('.ps-btn-del').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                deletePersona(el.dataset.id);
            });
        });

        listContainer.querySelector('#ps-btn-add').addEventListener('click', () => {
            openEditModal(null);
        });
    }

    function deletePersona(id) {
        if (!confirm('確定要刪除這個設定嗎？')) return;
        let list = loadLocalPersonas();
        list = list.filter(x => x.id !== id);
        saveLocalPersonas(list);
        if (loadCurrentId() === id && list.length > 0) {
            API.switchPersona(list[0].id, null);
        } else {
            refreshList();
        }
    }

    let _editingId = null;

    function openEditModal(id) {
        const modal = _rootContainer.querySelector('#ps-modal');
        const titleEl = _rootContainer.querySelector('#ps-modal-title');
        const fName = _rootContainer.querySelector('#ps-f-name');
        const fAvatar = _rootContainer.querySelector('#ps-f-avatar');
        const fDesc = _rootContainer.querySelector('#ps-f-desc');

        _editingId = id;

        if (id) {
            const list = loadLocalPersonas();
            const p = list.find(x => x.id === id);
            titleEl.textContent = '編輯設定';
            fName.value = p?.name || '';
            fAvatar.value = p?.avatar || '';
            fDesc.value = p?.desc || '';
        } else {
            titleEl.textContent = '新增設定';
            fName.value = '';
            fAvatar.value = '';
            fDesc.value = '';
        }

        const btnSave = _rootContainer.querySelector('#ps-btn-save');
        const btnCancel = _rootContainer.querySelector('#ps-btn-cancel');
        
        btnSave.onclick = saveModalData;
        btnCancel.onclick = closeEditModal;

        modal.classList.add('show');
    }

    function closeEditModal() {
        const modal = _rootContainer.querySelector('#ps-modal');
        modal.classList.remove('show');
        _editingId = null;
    }

    function saveModalData() {
        const fName = _rootContainer.querySelector('#ps-f-name').value.trim();
        const fAvatar = _rootContainer.querySelector('#ps-f-avatar').value.trim();
        const fDesc = _rootContainer.querySelector('#ps-f-desc').value.trim();

        if (!fName) { alert('請至少輸入名稱！'); return; }

        let list = loadLocalPersonas();

        if (_editingId) {
            const idx = list.findIndex(x => x.id === _editingId);
            if (idx > -1) {
                list[idx].name = fName;
                list[idx].avatar = fAvatar;
                list[idx].desc = fDesc;
                if (loadCurrentId() === _editingId) {
                    CURRENT_PERSONA = { ...list[idx] };
                }
            }
        } else {
            const newP = {
                id: 'p_' + Date.now(),
                name: fName,
                avatar: fAvatar,
                desc: fDesc
            };
            list.push(newP);
            if (list.length === 1) {
                saveCurrentId(newP.id);
                CURRENT_PERSONA = { ...newP };
            }
        }

        saveLocalPersonas(list);
        closeEditModal();
        refreshList();
        win.eventEmit && win.eventEmit('CHAT_CHANGED');
    }

    function esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    initCurrent();

    const API = {
        launch: function(container) {
            if (!container) return; 
            injectStyles();
            renderApp(container);
            // 啟動時也啟動輪詢同步，確保不會掉速 (還原 V5.0 穩定度)
            if (!isStandalone() && !win._os_persona_sync_interval) {
                win._os_persona_sync_interval = setInterval(() => syncFromST(), 1500);
            }
        },
        launchApp: function(container) { API.launch(container); }, 
        
        openPersonaList: function(container) { 
            if (container) {
                API.launch(container);
            } else {
                if (win.AureliaControlCenter && typeof win.AureliaControlCenter.switchPage === 'function') {
                    win.AureliaControlCenter.switchPage('nav-user');
                } else if (win.AureliaControlCenter && typeof win.AureliaControlCenter.showOsApp === 'function') {
                    win.AureliaControlCenter.showOsApp('使用者');
                }
            }
        }, 
        
        // 🔥 完全還原 V5.0 的切換邏輯
        switchPersona: function(personaId, personaName) {
            if (isStandalone()) {
                saveCurrentId(personaId);
                const list = loadLocalPersonas();
                const found = list.find(p => p.id === personaId);
                if (found) CURRENT_PERSONA = { ...found };
                refreshList();
                win.eventEmit && win.eventEmit('CHAT_CHANGED');
            } else {
                if (personaName) CURRENT_PERSONA.name = personaName;
                
                // 【核心復原】：發送通訊協議給 bridge 處理切換
                win.postMessage({ type: 'REQUEST_SWITCH_USER_PERSONA', source: 'PHONE_OS', personaId }, '*');
                
                // 短期內密集更新本地快取，確保資料同步
                let count = 0;
                const s = setInterval(() => { 
                    syncFromST(); 
                    if (++count > 10) clearInterval(s); 
                }, 300);
                
                win.eventEmit && win.eventEmit('CHAT_CHANGED');
            }
        },
        
        getCurrent: function() {
            initCurrent(); 
            return { name: CURRENT_PERSONA.name, id: CURRENT_PERSONA.id, desc: CURRENT_PERSONA.desc, description: CURRENT_PERSONA.desc, avatar: CURRENT_PERSONA.avatar };
        },
        getInfo: function() { return this.getCurrent(); },
        getName: function() { return this.getCurrent().name || 'User'; },
        getDesc: function() { return this.getCurrent().desc || ''; }
    };

    win.OS_PERSONA = API;
    win.OS_USER = API;
    win.WX_USER = API; 

})();