// ----------------------------------------------------------------
// [檔案] status_panel.js (V24 - 黑金整合+極簡分類模式+資料庫切換修復+批次刪除+小世界排版優化)
// 路徑：scripts/os_phone/status_panel.js
// 職責：
// 1. [小世界] 生成與管理場景設定、地圖。(生成器已獨立為視窗模式)
// 2. [數據庫] 管理常駐世界書，支援極簡雙模式分類(備注開頭/Key包含)，支援 藍球/綠球/鎖鏈 類型即時切換。
// 3. [記錄] 預覽與管理 LOG，包含刑偵、寶寶記錄，支援批次刪除。
// 4. [操作] 生成大總結、管理黑名單。
// ----------------------------------------------------------------
(function() {
    console.log('📝 [Status Panel] V24 (Black Gold + Simple DB Category + World Modal) 載入...');

    // === 1. 樣式定義 ===

    // === 2. HTML 模板 ===
    const HTML_TEMPLATE = `
        <div class="bg-sys-root">
            <div class="rpg-header">
                <div style="display:flex; align-items:center; gap: 15px;">
                    <div class="rpg-back-btn" onclick="(window.parent.PhoneSystem || window.PhoneSystem).goHome()" title="返回主畫面">‹</div>
                    <div class="rpg-title">STATUS PANEL</div>
                </div>
                <div class="rpg-chat-id" id="status-chat-id">載入中...</div>
            </div>


            <div class="bg-tabs-header">
                <button class="bg-tab-btn active" data-tab="WORLD">🌍 小世界</button>
                <button class="bg-tab-btn" data-tab="CLAN">📊 數據庫</button>
                <button class="bg-tab-btn" data-tab="LOGS">📋 記錄</button>
                <button class="bg-tab-btn" data-tab="SET" style="flex:0.6; border-left:1px solid #222;">⚙️ 操作</button>
            </div>
            
            <div class="bg-sys-body">
                <div class="bg-tab-content active" data-content="WORLD">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:10px;">
                        <span style="font-size:14px; color:var(--gold-p); font-family:'Cinzel'; font-weight:bold;">🌍 SAVED WORLDS / 已保存的小世界</span>
                        <div style="display:flex; gap:8px;">
                            <button onclick="document.getElementById('rpg-world-gen-modal').classList.add('active'); document.getElementById('world-gen-status').textContent='';" title="生成小世界" style="background:rgba(212,175,55,0.1); border:1px solid var(--gold-s); color:var(--gold-p); font-size:12px; cursor:pointer; padding:6px 12px; border-radius:4px; transition:0.2s;">＋ 生成小世界</button>
                            <button onclick="window.RPG_PANEL.renderWorldList()" title="重新載入" style="background:transparent; border:1px solid #444; color:#aaa; font-size:14px; cursor:pointer; padding:4px 10px; border-radius:4px; transition:0.2s;">↻</button>
                        </div>
                    </div>
                    <div id="bg-world-list" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
                        <div style="text-align:center; padding:30px; color:#555; font-size:13px;">載入中...</div>
                    </div>
                </div>
                
                <div class="bg-tab-content" data-content="CLAN">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:10px;">
                        <span style="font-size:14px; color:var(--gold-p); font-family:'Cinzel'; font-weight:bold;">DATABASE / 常駐世界設定</span>
                        <div style="display:flex; gap:8px;">
                            <button id="bg-db-add-tab" title="新增分類" style="background:rgba(212,175,55,0.1); border:1px solid var(--gold-s); color:var(--gold-p); font-size:12px; cursor:pointer; padding:6px 12px; border-radius:4px; transition:0.2s;">＋ 新增分類</button>
                            <button id="bg-clan-refresh" title="重新載入" style="background:transparent; border:1px solid #444; color:#aaa; font-size:14px; cursor:pointer; padding:4px 10px; border-radius:4px; transition:0.2s;">↻</button>
                        </div>
                    </div>
                    <div id="bg-db-subtabs" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:15px; padding-bottom:10px; border-bottom:1px solid #222;"></div>
                    <div id="bg-clan-list" style="display:flex; flex-direction:column; gap:8px; flex:1; overflow-y:auto;">
                        <div style="text-align:center; padding:30px; color:#555; font-size:13px;">← 選擇或新增分類</div>
                    </div>
                </div>

                <div class="bg-tab-content" data-content="LOGS">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">
                        <span style="font-size:14px; color:var(--gold-p); font-family:'Cinzel'; font-weight:bold;">SYSTEM LOGS / 系統記錄</span>
                        <div style="display:flex; gap:8px;">
                            <button id="bg-logs-select-all" data-selected="false" style="background:transparent; border:1px solid #444; color:#aaa; font-size:12px; cursor:pointer; padding:4px 8px; border-radius:4px; transition:0.2s;">全選</button>
                            <button id="bg-logs-delete-selected" style="background:rgba(200,50,50,0.1); border:1px solid #cc4444; color:#ff5555; font-size:12px; cursor:pointer; padding:4px 8px; border-radius:4px; transition:0.2s;">刪除選取</button>
                            <button id="bg-logs-refresh" title="重新載入" style="background:transparent; border:1px solid #444; color:#aaa; font-size:14px; cursor:pointer; padding:4px 10px; border-radius:4px; transition:0.2s;">↻</button>
                        </div>
                    </div>
                    <div id="bg-logs-list" style="display:flex; flex-direction:column; gap:10px; flex:1; overflow-y:auto;">
                        <div style="text-align:center; padding:30px; color:#555; font-size:13px;">載入中...</div>
                    </div>
                </div>

                <div class="bg-tab-content" data-content="SET">
                    <div style="font-size:14px; color:var(--gold-p); margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:6px; font-family:'Cinzel'; font-weight:bold;">STORY ACTIONS / 劇情操作</div>
                    
                    <div style="padding:12px 14px; background:rgba(212,175,55,0.06); border:1px solid rgba(212,175,55,0.2); border-radius:6px; font-size:12px; color:#b89b4a; line-height:1.6; margin-bottom:15px;">
                        📝 大總結（生成 / 模板 / 合併）已移至<br><b style="color:var(--gold-p);">瀅瀅的故事日誌 → 🛠️ 故事管理</b>
                    </div>

                    <button class="bg-btn-action" onclick="window.RPG_PANEL.openBlacklistModal()">
                        🚫 黑名單管理
                    </button>

                    <div style="margin-top:20px; font-size:14px; color:var(--gold-p); margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:6px; font-family:'Cinzel'; font-weight:bold;">SYSTEM / 系統設置</div>
                    <div style="padding:15px; background: rgba(20,20,20,0.8); border: 1px solid #333; border-radius: 6px; text-align:center; color:#888; font-size:12px; line-height:1.6;">
                        STATUS PANEL INTEGRATED V24<br>
                        Powered by Black Gold UI<br>
                        <span style="color:#555;">(Simple DB Modes, DB Toggle, Batch Delete, World Modal)</span>
                    </div>
                </div>
            </div>

            <div id="rpg-blacklist-modal" class="rpg-modal-overlay">
                <div class="rpg-modal-card">
                    <div class="rpg-modal-title">🚫 黑名單管理</div>
                    <div style="display:flex; gap:8px; margin-bottom:15px;">
                        <input type="text" id="blacklist-input" class="rpg-range-input" style="margin:0;" placeholder="輸入要封鎖的角色名...">
                        <button class="bg-btn-action gold" style="width:50px; margin:0; font-size:20px;" onclick="window.RPG_PANEL.addBlacklistCharacter()" title="加入黑名單">+</button>
                    </div>
                    <div id="blacklist-content" style="flex:1; overflow-y:auto; text-align:left; border:1px solid #222; border-radius:4px; padding:10px; background:#0f0f0f; min-height:200px;">載入中...</div>
                    <button class="bg-btn-action" style="margin-top:15px;" onclick="document.getElementById('rpg-blacklist-modal').classList.remove('active')">關閉</button>
                </div>
            </div>

            <div id="world-template-modal" class="rpg-modal-overlay">
                <div class="rpg-modal-card" style="max-width: 600px;">
                    <div class="rpg-modal-title">📋 模板管理 (Templates)</div>
                    <div id="template-list" style="flex:1; overflow-y:auto; margin-bottom:15px; display:flex; flex-direction:column; gap:10px; text-align:left; background:#0f0f0f; border:1px solid #222; padding:10px; border-radius:4px;"></div>
                    <div style="display:flex; gap:10px;">
                        <button class="bg-btn-action gold" style="flex:1; margin:0;" onclick="window.WORLD_TEMPLATES.openEditor()">➕ 新增模板</button>
                        <button class="bg-btn-action" style="flex:1; margin:0;" onclick="document.getElementById('world-template-modal').classList.remove('active')">關閉</button>
                    </div>
                </div>
            </div>

            <div id="world-template-editor" class="rpg-modal-overlay">
                <div class="rpg-modal-card" style="max-width: 700px;">
                    <div class="rpg-modal-title" id="template-editor-title">✏️ 新增模板</div>
                    <div style="flex:1; overflow-y:auto; text-align:left;">
                        <label style="display:block; font-size:12px; color:#aaa; margin-bottom:5px;">模板名稱 *</label>
                        <input type="text" id="template-name-input" class="rpg-range-input" placeholder="例如：太空科幻、校園日常...">
                        <label style="display:block; font-size:12px; color:#aaa; margin-bottom:5px;">模板內容 *</label>
                        <textarea id="template-content-input" class="rpg-range-input" style="min-height:300px; resize:vertical; font-family:monospace; font-size:12px; line-height:1.5;" placeholder="在這裡輸入模板格式..."></textarea>
                    </div>
                    <div style="display:flex; gap:10px; margin-top:15px;">
                        <button class="bg-btn-action gold" style="flex:1; margin:0;" onclick="window.WORLD_TEMPLATES.saveTemplate()">💾 保存</button>
                        <button class="bg-btn-action" style="flex:1; margin:0;" onclick="document.getElementById('world-template-editor').classList.remove('active')">取消</button>
                    </div>
                </div>
            </div>

            <div id="bg-db-edit-modal" class="rpg-modal-overlay" style="padding:15px;">
                <div class="rpg-modal-card" style="width:100%; max-width:800px; height:100%; max-height:none; padding:0; border-radius:8px; overflow:hidden; display:flex; flex-direction:column;">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border-bottom:1px solid #333; background:#111; flex-shrink:0;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="color:var(--gold-p); font-size:16px; font-weight:bold; font-family:'Cinzel';">✏️ 編輯世界書條目</span>
                            <span id="bg-db-edit-bookname" style="font-size:11px; color:#666; background:#222; padding:3px 8px; border-radius:4px;"></span>
                        </div>
                        <div style="display:flex; gap:10px;">
                            <button id="bg-db-edit-save" class="bg-btn-action gold" style="margin:0; padding:8px 20px; width:auto;">💾 儲存</button>
                            <button id="bg-db-edit-close" class="bg-btn-action" style="margin:0; padding:8px 15px; width:auto;">✕ 關閉</button>
                        </div>
                    </div>
                    <div style="padding:15px 20px 0; flex-shrink:0; text-align:left;">
                        <label style="font-size:12px; color:#aaa; display:block; margin-bottom:5px; font-weight:bold;">備注名稱 (Comment)</label>
                        <input id="bg-db-edit-comment" class="rpg-range-input" style="margin-bottom:15px;" placeholder="輸入條目名稱...">
                        
                        <label style="font-size:12px; color:#aaa; display:block; margin-bottom:5px; font-weight:bold;">觸發關鍵字 (Keys)</label>
                        <div id="bg-db-edit-keys-wrap" style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; background:#111; border:1px solid #333; padding:8px; border-radius:4px; min-height:40px; margin-bottom:15px;">
                            <input id="bg-db-edit-key-input" style="background:transparent; border:none; color:#ccc; font-size:13px; outline:none; flex:1; min-width:150px; padding:4px;" placeholder="輸入後按 Enter 新增...">
                        </div>
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column; padding:0 20px 15px; text-align:left;">
                        <label style="font-size:12px; color:#aaa; display:block; margin-bottom:5px; font-weight:bold;">內容 (Content)</label>
                        <textarea id="bg-db-edit-content" class="rpg-range-input" style="flex:1; margin:0; resize:none; font-family:'Microsoft YaHei', monospace; line-height:1.6;" placeholder="輸入設定內容..."></textarea>
                    </div>
                    <div style="padding:10px 20px; border-top:1px solid #222; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; background:#0a0a0a;">
                        <span id="bg-db-edit-status" style="font-size:12px; color:#888;"></span>
                        <span id="bg-db-edit-charcount" style="font-size:12px; color:#666; font-family:monospace;"></span>
                    </div>
                </div>
            </div>

            <div id="bg-db-addcat-modal" class="rpg-modal-overlay">
                <div class="rpg-modal-card" style="max-width:400px; text-align:left;">
                    <div class="rpg-modal-title" style="text-align:center;">➕ 新增數據庫分類</div>
                    
                    <label style="font-size:12px; color:#aaa; display:block; margin-bottom:6px;">選擇分類模式：</label>
                    <div class="rpg-opt-group" style="margin-bottom:15px; padding:10px;">
                        <label class="rpg-opt-label">
                            <input type="radio" name="db_cat_match_type" value="comment_starts" checked><span>📝 依「備注名稱 (Comment)」開頭配對</span>
                        </label>
                        <label class="rpg-opt-label" style="margin-top:8px;">
                            <input type="radio" name="db_cat_match_type" value="key_includes"><span>🔑 依「觸發關鍵字 (Key)」包含配對</span>
                        </label>
                    </div>

                    <label style="font-size:12px; color:#aaa; display:block; margin-bottom:6px;">輸入分類字串 (作為標籤名與搜尋條件)：</label>
                    <input id="bg-db-cat-input" class="rpg-range-input" style="margin-bottom:20px;" placeholder="例如：【家族 或 黑魔法">
                    
                    <div class="rpg-btn-group">
                        <button class="bg-btn-action" id="bg-db-addcat-cancel">取消</button>
                        <button class="bg-btn-action gold" id="bg-db-addcat-confirm">✔ 確認新增</button>
                    </div>
                </div>
            </div>

            <div id="bg-world-detail-modal" class="rpg-modal-overlay">
                <div class="bg-wd-card">
                    <div class="bg-wd-header">
                        <span id="bg-wd-title" class="bg-wd-title">🌍 小世界</span>
                        <button id="bg-wd-close" class="bg-wd-close-btn" title="關閉">✕</button>
                    </div>
                    <div id="bg-wd-map" class="bg-wd-map-area">
                        <img src="" alt="小地圖" class="bg-wd-map-img" />
                    </div>
                    <div id="bg-wd-body" class="bg-wd-body"></div>
                </div>
            </div>

            <div id="rpg-char-gen-modal" class="rpg-modal-overlay">
                <div class="rpg-modal-card" style="max-width: 520px; text-align: left;">
                    <div class="rpg-modal-title" style="text-align:center;">👥 角色卡生成器</div>
                    <div style="font-size:12px; color:#666; margin-bottom:12px; text-align:center;">基於選定的小世界，AI 生成 10 個群像角色卡</div>
                    <div style="margin-bottom:12px; background:rgba(212,175,55,0.05); border:1px solid #2a2a2a; border-radius:4px; padding:8px 12px;">
                        <span style="font-size:11px; color:#666;">世界：</span>
                        <span id="char-gen-world-name" style="font-size:13px; color:var(--gold-p); font-family:'Cinzel'; font-weight:bold;"></span>
                        <input type="hidden" id="char-gen-world-uid">
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="display:block; font-size:12px; color:#aaa; margin-bottom:6px;">備註 / 偏好（可選）</label>
                        <textarea id="char-gen-note" class="rpg-range-input" style="margin:0; padding:8px; min-height:60px; resize:vertical;" placeholder="例：需要反派、三位女性角色、有師徒關係..."></textarea>
                    </div>
                    <button class="bg-btn-action gold" style="width:100%; font-size:14px; padding:12px;" onclick="window.RPG_PANEL.generateCharCards()">👥 生成 10 個角色卡</button>
                    <div id="char-gen-status" style="font-size:12px; color:#888; margin-top:10px; min-height:20px; text-align:center;"></div>
                    <div style="display:flex; gap:8px; margin-top:10px;">
                        <button class="bg-btn-action" style="flex:1; font-size:12px;" onclick="window.RPG_PANEL.openCharCardTemplateModal()">✏️ 編輯角色卡模板</button>
                        <button class="bg-btn-action" style="flex:1;" onclick="document.getElementById('rpg-char-gen-modal').classList.remove('active')">關閉</button>
                    </div>
                </div>
            </div>

            <div id="rpg-char-tpl-modal" class="rpg-modal-overlay" style="z-index: 1000002;">
                <div class="rpg-modal-card" style="max-width: 640px;">
                    <div class="rpg-modal-title">✏️ 角色卡生成模板</div>
                    <div style="font-size:11px; color:#666; margin-bottom:8px;">編輯後點保存，下次生成角色卡時使用此模板。</div>
                    <textarea id="sp-char-tpl-area" style="width:100%; height:380px; background:#0d0d0d; border:1px solid #333; color:#ccc; font-size:11px; padding:8px; border-radius:3px; resize:vertical; box-sizing:border-box; font-family:'Microsoft YaHei',monospace;"></textarea>
                    <div class="rpg-btn-group" style="margin-top:12px;">
                        <button class="bg-btn-action" onclick="window.RPG_PANEL.resetCharCardTemplate()">↺ 還原預設</button>
                        <button class="bg-btn-action" onclick="document.getElementById('rpg-char-tpl-modal').classList.remove('active')">關閉</button>
                        <button class="bg-btn-action gold" onclick="window.RPG_PANEL.saveCharCardTemplate()">💾 保存</button>
                    </div>
                </div>
            </div>

            <div id="rpg-world-gen-modal" class="rpg-modal-overlay">
                <div class="rpg-modal-card" style="max-width: 500px; text-align: left;">
                    <div class="rpg-modal-title" style="text-align:center;">🌍 WORLD GENERATOR / 小世界生成器</div>
                    <div style="margin-bottom:12px;">
                        <label style="display:block; font-size:12px; color:#aaa; margin-bottom:6px;">選擇模板 (Template)</label>
                        <div style="display:flex; gap:8px;">
                            <select id="world-template-select" class="rpg-range-input" style="flex:1; margin:0; padding:8px; cursor:pointer;">
                                <option value="default">預設通用模板</option>
                            </select>
                            <button class="bg-btn-action" style="margin:0; width:auto; padding:8px 15px;" onclick="window.WORLD_TEMPLATES.openManager()" title="管理模板">⚙️</button>
                        </div>
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="display:block; font-size:12px; color:#aaa; margin-bottom:6px;">場景名稱</label>
                        <input type="text" id="world-scene-input" class="rpg-range-input" style="margin:0; padding:8px;" placeholder="例如：校園、太空站、戀綜...">
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="display:block; font-size:12px; color:#aaa; margin-bottom:6px;">備註（可選）</label>
                        <textarea id="world-user-note" class="rpg-range-input" style="margin:0; padding:8px; min-height:60px; resize:vertical;" placeholder="描述你的偏好、風格..."></textarea>
                    </div>
                    <button class="bg-btn-action gold" style="width:100%; font-size:14px; padding:12px;" onclick="window.RPG_PANEL.generateWorldFromTab()">🚀 生成小世界</button>
                    <div id="world-gen-status" style="font-size:12px; color:#888; margin-top:10px; min-height:20px; text-align:center;"></div>
                    
                    <button class="bg-btn-action" style="margin-top:15px;" onclick="document.getElementById('rpg-world-gen-modal').classList.remove('active')">關閉</button>
                </div>
            </div>

        </div>
    `;

    // === 3. 工具函數 ===
    function getChatIdentifier() {
        if (window.parent.SillyTavern && window.parent.SillyTavern.getContext) {
            const ctx = window.parent.SillyTavern.getContext();
            if (ctx && ctx.chatId) {
                return ctx.chatId.split(/[\\/]/).pop().replace(/\.jsonl?$/i, '').trim().replace(/\s+/g, '_');
            }
        }
        return "Unsaved_Chat_" + new Date().toISOString().slice(0,10);
    }

    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // === 4. 小世界模板系統 (WORLD_TEMPLATES) ===
    window.WORLD_TEMPLATES = (function() {
        const DB_NAME = 'WorldTemplatesDB';
        const DB_VERSION = 1;
        const STORE_NAME = 'templates';
        let db = null;
        let editingTemplateId = null;

        const DEFAULT_TEMPLATE = {
            id: 'default', name: '預設通用模板', isDefault: true,
            content: `<small_world>\n【場景名稱】\n基於大世界觀：[XX城邦/XX國家/XX地區]\n\n場景設定：\n- 地點：\n- 規模：\n- 特色：\n- 區域主負責人:\n\n規則系統：\n-\n-\n\n常見活動：\n-\n-\n\n活動設施/區域：(設施名:設施描述)\n-\n-\n\n小圈圈類型：\n-\n-\n\n與大世界的連結：(名稱:描述)\n-\n-\n\n[NPCs補充]:\n-\n-\n\n［角色卡模板］（可以添加多个角色卡）\n<character name="[角色名称]">\n  基本信息: "[性别]，[年龄]，[标签/职业/身份]"\n  性格: "[一句话概括核心性格]"\n  行為攝影: "[100字介绍行為模式]"\n  外貌: "[一句话概括最显著的外貌特征]"\n  对话示例: "*[动作或语气描述]* [一句符合角色性格的典型对话]"\n</character>\n</small_world>\n\n<scene-map>\n[地標底板|描述此場景底板的英文關鍵詞，以逗號分隔]\n[地標物件|英文物件關鍵詞|中文描述|x:50,y:50]\n[玩家位置|你的位置描述|x:50,y:90]\n</scene-map>`
        };

        function initDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(db = request.result);
                request.onupgradeneeded = (event) => {
                    const database = event.target.result;
                    if (!database.objectStoreNames.contains(STORE_NAME)) {
                        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                        store.createIndex('name', 'name', { unique: false });
                    }
                };
            });
        }

        async function getAllTemplates() {
            if (!db) await initDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => {
                    let templates = request.result || [];
                    if (!templates.find(t => t.id === 'default')) templates.unshift(DEFAULT_TEMPLATE);
                    resolve(templates);
                };
                request.onerror = () => reject(request.error);
            });
        }

        async function getTemplate(id) {
            if (id === 'default') return DEFAULT_TEMPLATE;
            if (!db) await initDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result || DEFAULT_TEMPLATE);
                request.onerror = () => reject(request.error);
            });
        }

        async function saveTemplateData(template) {
            if (!db) await initDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(template);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async function deleteTemplateData(id) {
            if (id === 'default') return;
            if (!db) await initDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        function getSelectedTemplateId() { return localStorage.getItem('world_selected_template') || 'default'; }
        function setSelectedTemplateId(id) { localStorage.setItem('world_selected_template', id); }

        async function refreshTemplateSelect() {
            const select = document.getElementById('world-template-select');
            if (!select) return;
            const templates = await getAllTemplates();
            const selectedId = getSelectedTemplateId();
            select.innerHTML = templates.map(t => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${t.name}${t.isDefault ? ' (內建)' : ''}</option>`).join('');
        }

        async function openManager() {
            const modal = document.getElementById('world-template-modal');
            const list = document.getElementById('template-list');
            const templates = await getAllTemplates();
            list.innerHTML = templates.map(t => `
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px; border-radius:4px; border-left:4px solid ${t.isDefault ? 'var(--gold-p)' : '#4a9eff'};">
                    <div><div style="font-size:14px; color:#ddd; font-weight:bold; font-family:'Cinzel';">${t.name}</div><div style="font-size:11px; color:#666; margin-top:2px;">${t.isDefault ? '內建模板' : '自定義模板'}</div></div>
                    <div style="display:flex; gap:8px;">
                        <button class="bg-btn-action" style="margin:0; width:auto; padding:6px 12px; font-size:11px;" onclick="window.WORLD_TEMPLATES.openEditor('${t.id}')">✏️ 編輯</button>
                        ${!t.isDefault ? `<button class="bg-btn-action" style="margin:0; width:auto; padding:6px 12px; font-size:11px; color:#ff6b6b;" onclick="window.WORLD_TEMPLATES.confirmDelete('${t.id}', '${t.name}')">🗑️</button>` : ''}
                    </div>
                </div>
            `).join('');
            modal.classList.add('active');
        }

        function openEditor(templateId = null) {
            editingTemplateId = templateId;
            const modal = document.getElementById('world-template-editor');
            const title = document.getElementById('template-editor-title');
            const nameInput = document.getElementById('template-name-input');
            const contentInput = document.getElementById('template-content-input');
            if (templateId) {
                title.textContent = '✏️ 編輯模板';
                getTemplate(templateId).then(t => { nameInput.value = t.name; contentInput.value = t.content; nameInput.disabled = t.isDefault; });
            } else {
                title.textContent = '➕ 新增模板';
                nameInput.value = ''; nameInput.disabled = false; contentInput.value = DEFAULT_TEMPLATE.content;
            }
            modal.classList.add('active');
        }

        function confirmDelete(id, name) {
            if (confirm(`確定要刪除模板「${name}」嗎？\n此操作無法撤銷。`)) {
                deleteTemplateData(id).then(() => {
                    openManager(); refreshTemplateSelect();
                    if (getSelectedTemplateId() === id) { setSelectedTemplateId('default'); refreshTemplateSelect(); }
                });
            }
        }

        async function saveTemplateFromEditor() {
            const name = document.getElementById('template-name-input').value.trim();
            const content = document.getElementById('template-content-input').value.trim();
            if (!name || !content) return alert('❌ 請填寫完整名稱與內容');
            let template;
            if (editingTemplateId) {
                template = await getTemplate(editingTemplateId);
                if (!template.isDefault) template.name = name;
                template.content = content;
            } else {
                template = { id: 'template_' + Date.now(), name: name, isDefault: false, content: content };
            }
            await saveTemplateData(template);
            document.getElementById('world-template-editor').classList.remove('active');
            openManager(); refreshTemplateSelect();
        }

        async function init() {
            await initDB(); await refreshTemplateSelect();
            const select = document.getElementById('world-template-select');
            if (select) select.addEventListener('change', function() { setSelectedTemplateId(this.value); });
        }

        return { init, getTemplate, getSelectedTemplateId, openManager, openEditor, confirmDelete, saveTemplate: saveTemplateFromEditor };
    })();

    // === 5. 面板 API 核心 (RPG_PANEL) ===
    const API = {};

    // --- B. 黑名單管理 ---
    API.openBlacklistModal = function() {
        document.getElementById('rpg-blacklist-modal').classList.add('active');
        API.renderBlacklist();
    };

    API.renderBlacklist = async function() {
        const div = document.getElementById('blacklist-content');
        div.innerHTML = "讀取中...";
        try {
            const helper = window.parent.TavernHelper;
            const bookName = helper.getCurrentCharPrimaryLorebook();
            if(!bookName) throw new Error("未綁定世界書");
            
            const entries = await helper.getLorebookEntries(bookName);
            const chatId = getChatIdentifier();
            const blEntries = entries.filter(e => e.comment && e.comment.includes('[當前永不出現名單-黑名單角色]'));
            
            if(blEntries.length === 0) return div.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">暫無名單</div>';

            let html = '';
            blEntries.forEach(e => {
                let names = e.keys ? e.keys.filter(k => k && !k.includes('[')) : [];
                if(names.length === 0 && e.content) names = e.content.split('\n').map(l=>l.trim()).filter(l=>l && !l.startsWith('[') && !l.includes('規則'));
                html += `<div class="rpg-blacklist-item"><span>🚫 ${names.join(', ') || '未知'}</span><button onclick="window.RPG_PANEL.removeCharacterFromBlacklist('${e.uid}')" title="刪除">🗑️</button></div>`;
            });
            div.innerHTML = html;
        } catch(e) { div.innerHTML = `<div style="color:#ff4444; padding:10px;">❌ 讀取失敗: ${e.message}</div>`; }
    };

    API.addBlacklistCharacter = async function() {
        const name = document.getElementById('blacklist-input').value.trim();
        if(!name) return;
        try {
            const helper = window.parent.TavernHelper;
            const bookName = helper.getCurrentCharPrimaryLorebook();
            const chatId = getChatIdentifier();
            const targetComment = `[當前永不出現名單-黑名單角色] - ${chatId}`;
            const blKey = `[BLACKLIST_${chatId}]`;
            
            const entries = await helper.getLorebookEntries(bookName);
            const existEntry = entries.find(e => e.comment === targetComment);
            
            if (existEntry) {
                const names = new Set(existEntry.content.split('\n').map(l=>l.trim()).filter(l=>l && !l.startsWith('[') && !l.includes('規則')));
                if(names.has(name)) return alert("已在黑名單中");
                names.add(name);
                await helper.updateLorebookEntriesWith(bookName, list => list.map(e => e.comment === targetComment ? {...e, content: `[當前永不出現名單-黑名單角色]\n黑名單規則：劇情封禁\n\n${Array.from(names).join('\n')}`, keys: [...Array.from(names), blKey]} : e));
            } else {
                await helper.createLorebookEntries(bookName, [{ comment: targetComment, keys: [name, blKey], content: `[當前永不出現名單-黑名單角色]\n黑名單規則：劇情封禁\n\n${name}`, position: 'at_depth_as_system', depth: 0, order: 9999 }]);
            }
            
            try {
                const lastId = await helper.getLastMessageId();
                if (lastId >= 0) {
                    const lastMsg = (await helper.getChatMessages(-1))[0];
                    if (lastMsg && !(lastMsg.mes||'').includes(blKey)) { const _cur = lastMsg.mes || lastMsg.message || ''; await helper.setChatMessages([{message_id: lastId, message: _cur + ' ' + blKey, mes: _cur + ' ' + blKey}], {refresh:'affected'}); }
                }
            } catch(e){}
            
            document.getElementById('blacklist-input').value = '';
            API.renderBlacklist();
        } catch(e) { alert('失敗:'+e.message); }
    };

    API.removeCharacterFromBlacklist = async function(uid) {
        if(!confirm("確定要永遠開放（移出黑名單）嗎？")) return;
        try {
            const helper = window.parent.TavernHelper;
            const bookName = helper.getCurrentCharPrimaryLorebook();
            await helper.deleteLorebookEntries(bookName, [parseInt(uid)]);
            API.renderBlacklist();
        } catch(e) { alert('失敗:'+e.message); }
    };

    // --- C. 小世界生成器 ---
    API.generateWorldFromTab = async function() {
        const scene = document.getElementById('world-scene-input').value.trim();
        const note = document.getElementById('world-user-note').value.trim();
        const status = document.getElementById('world-gen-status');
        if(!scene) return alert("請輸入場景名稱");
        
        let templateContent = '<small_world>\n[請填寫小世界設定]\n</small_world>';
        try { templateContent = (await window.WORLD_TEMPLATES.getTemplate(window.WORLD_TEMPLATES.getSelectedTemplateId())).content; } catch(e){}

        try {
            const helper = window.parent.TavernHelper;
            const bookName = helper.getCurrentCharPrimaryLorebook();
            if(!bookName) throw new Error("未綁定世界書");
            
            status.textContent = "讀取世界觀設定...";
            let worldview = "";
            const entries = await helper.getLorebookEntries(bookName);
            worldview = entries.filter(e => e.enabled && (e.constant || e.type === 'constant' || (e.keys||[]).includes('ALWAYS_ON'))).map(e => e.content).join('\n\n');
            if(!worldview) throw new Error("找不到常駐 (constant) 世界觀設定");

            status.textContent = "🤖 生成小世界設定中..."; status.style.color = 'var(--gold-p)';
            const prompt = `你是【世界觀生成系統】。當用戶要求進入 ${scene} 時，AI生成詳細設定。\n保持一致性。${note ? '\n偏好：'+note : ''}\n\n【世界觀基礎】\n${worldview}\n\n請為「${scene}」生成設定，格式：\n${templateContent}`;
            
            const osApi = window.parent.OS_API;
            if(!osApi) throw new Error("OS_API 不可用");

            let generated = await new Promise((res, rej) => {
                let text = "";
                osApi.chat([{role:'system', content:'世界觀生成助手'}, {role:'user', content:prompt}], window.parent.OS_SETTINGS.getConfig(),
                    (c) => { text = c; status.textContent = `🤖 生成中... (${text.length} 字)`; }, (f) => res(f), (e) => rej(e), {disableTyping:true});
            });

            const smMatch = generated.match(/<small_world>([\s\S]*?)<\/small_world>/i);
            let contentToSave = smMatch ? smMatch[1].trim() : generated;
            
            const mapMatch = generated.match(/<scene-map>([\s\S]*?)<\/scene-map>/i);
            if(mapMatch) {
                status.textContent = "🗺️ 生成小地圖中...";
                try {
                    const bpMatch = mapMatch[1].match(/\[地標底板\|([^\]]+)\]/);
                    const prompt = `${bpMatch ? bpMatch[1] : scene}, RPG, top-down view, flat style, game minimap, high quality`;
                    const imgMan = window.parent.OS_IMAGE_MANAGER;
                    const url = imgMan ? await imgMan.generate(prompt, 'scene') : `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?width=512&height=512&model=zimage&nologo=true`;
                    contentToSave += `\n\n[MAP_IMAGE_URL]:${url}`;
                } catch(e) { console.warn("地圖生成失敗", e); }
            }

            status.textContent = "💾 保存至世界書...";
            const chatId = getChatIdentifier();
            const now = new Date().toISOString().replace(/[:.]/g,'-').slice(0,-5);
            const worldKey = `[WORLD_${chatId}_${now}]`;
            await helper.createLorebookEntries(bookName, [{ comment: `[小世界] - ${scene} - ${now}`, keys: [worldKey], content: contentToSave, enabled: true, position: 'at_depth_as_system', depth: 1, order: 997 }]);
            
            status.textContent = `✅ 小世界「${scene}」生成完畢！`; status.style.color = '#52c41a';
            API.renderWorldList();
        } catch(e) { status.textContent = "❌ 失敗: " + e.message; status.style.color = '#ff4444'; }
    };

    API.renderWorldList = async function() {
        const div = document.getElementById('bg-world-list');
        if(!div) return;
        try {
            const helper = window.parent.TavernHelper;
            const entries = await helper.getLorebookEntries(helper.getCurrentCharPrimaryLorebook());
            const chatId = getChatIdentifier();
            const worlds = entries.filter(e => e.keys && (e.keys.includes(`[WORLD_${chatId}`) || e.comment.includes(`[小世界]`))).sort((a,b) => (b.uid||0) - (a.uid||0));
            
            if(worlds.length === 0) return div.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">暫無小世界</div>';
            
            div.innerHTML = `<div class="bg-world-container">${worlds.map((w, i) => {
                const nameMatch = (w.comment||'').match(/\[小世界\]\s*-\s*(.+?)\s*-/);
                const name = nameMatch ? nameMatch[1] : `小世界 ${i+1}`;
                const hasMap = /\[MAP_IMAGE_URL\]:/.test(w.content);
                return `
                    <div class="bg-world-card" onclick="window.RPG_PANEL.openWorldDetail(${w.uid})" style="cursor:pointer;">
                        <div class="bg-world-card-icon">${hasMap ? '🗺️' : '🌍'}</div>
                        <div class="bg-world-card-info">
                            <div class="bg-world-card-name">${escapeHtml(name)}</div>
                            <div class="bg-world-card-meta">${escapeHtml((w.comment||'').replace(/\[小世界\]\s*-\s*/,''))}</div>
                        </div>
                        <button class="bg-world-card-chargen" onclick="event.stopPropagation(); window.RPG_PANEL.openCharGenModal(${w.uid}, '${name.replace(/'/g,"\\'")}')">👥</button>
                        <button class="bg-world-card-del" onclick="event.stopPropagation(); window.RPG_PANEL.deleteWorld(${w.uid}, '${name}')">🗑</button>
                    </div>`;
            }).join('')}</div>`;
        } catch(e) {}
    };

    API.openWorldDetail = async function(uid) {
        try {
            const helper = window.parent.TavernHelper;
            const entries = await helper.getLorebookEntries(helper.getCurrentCharPrimaryLorebook());
            const entry = entries.find(e => e.uid === uid);
            if(!entry) return;

            const mapMatch = entry.content.match(/\[MAP_IMAGE_URL\]:(.+)$/m);
            const mapUrl = mapMatch ? mapMatch[1].trim() : '';
            const body = mapUrl ? entry.content.replace(/\n*\[MAP_IMAGE_URL\]:.+$/m, '').trim() : entry.content;
            const nameMatch = (entry.comment||'').match(/\[小世界\]\s*-\s*(.+?)\s*-/);

            document.getElementById('bg-wd-title').textContent = `🌍 ${nameMatch ? nameMatch[1] : '小世界'}`;
            const mapArea = document.getElementById('bg-wd-map');
            if(mapUrl) { mapArea.style.display = 'flex'; mapArea.querySelector('img').src = mapUrl; } else mapArea.style.display = 'none';
            document.getElementById('bg-wd-body').textContent = body;
            
            const modal = document.getElementById('bg-world-detail-modal');
            modal.classList.add('active');
            document.getElementById('bg-wd-close').onclick = () => modal.classList.remove('active');
        } catch(e) {}
    };

    API.deleteWorld = async function(uid, name) {
        if(!confirm(`確定刪除小世界「${name}」？`)) return;
        const helper = window.parent.TavernHelper;
        await helper.deleteLorebookEntries(helper.getCurrentCharPrimaryLorebook(), [uid]);
        API.renderWorldList();
    };

    // --- E. 角色卡生成器 ---
    const CHAR_CARD_DEFAULT_TPL = `使用以下模板为一份群像角色卡。

使用说明：
1. 本模板专为群像剧或需要一次性创建多名角色的场景设计，力求简洁。
2. 请为每个角色填写一个 <character> 模块。您可以根据需要复制增减模块数量。
3. 性格、外貌、服饰等条目请尽量用一句话概括，突出核心特征。
---
<character name="[角色名称]">
  基本信息: "[性别]，[年龄]，[标签/职业/身份]"
  性格: "[一句话概括核心性格]"
  行為攝影: "[100字介紹行為模式]"
  外貌: "[一句话概括最显著的外貌特征]"
  服饰: "[一句话概括日常或代表性着装风格]"
  对话示例: "*[动作或语气描述]* [一句符合角色性格的典型对话]"
  關係網:
  角色A: 身分，總是互相分享小事的好友
  角色B: 搞笑的父親，關係描述...

</character>`;

    function getCharCardTemplate() {
        return localStorage.getItem('sp_char_card_tpl') || CHAR_CARD_DEFAULT_TPL;
    }

    API.openCharCardTemplateModal = function() {
        document.getElementById('rpg-char-tpl-modal').classList.add('active');
        document.getElementById('sp-char-tpl-area').value = getCharCardTemplate();
    };

    API.saveCharCardTemplate = function() {
        localStorage.setItem('sp_char_card_tpl', document.getElementById('sp-char-tpl-area').value);
        document.getElementById('rpg-char-tpl-modal').classList.remove('active');
    };

    API.resetCharCardTemplate = function() {
        if (!confirm('確定還原為預設模板？')) return;
        localStorage.removeItem('sp_char_card_tpl');
        document.getElementById('sp-char-tpl-area').value = CHAR_CARD_DEFAULT_TPL;
    };

    API.openCharGenModal = function(uid, name) {
        document.getElementById('char-gen-world-uid').value = uid;
        document.getElementById('char-gen-world-name').textContent = name;
        document.getElementById('char-gen-note').value = '';
        document.getElementById('char-gen-status').textContent = '';
        document.getElementById('char-gen-status').style.color = '#888';
        document.getElementById('rpg-char-gen-modal').classList.add('active');
    };

    API.generateCharCards = async function() {
        const uid = parseInt(document.getElementById('char-gen-world-uid').value);
        const worldName = document.getElementById('char-gen-world-name').textContent;
        const note = document.getElementById('char-gen-note').value.trim();
        const status = document.getElementById('char-gen-status');

        try {
            const helper = window.parent.TavernHelper;
            const bookName = helper.getCurrentCharPrimaryLorebook();
            if (!bookName) throw new Error("未綁定世界書");

            const entries = await helper.getLorebookEntries(bookName);
            const worldEntry = entries.find(e => e.uid === uid);
            if (!worldEntry) throw new Error("找不到對應的小世界條目");

            status.textContent = "🤖 生成角色卡中..."; status.style.color = 'var(--gold-p)';

            const prompt = `你是【角色設計系統】，根據以下小世界設定，為這個世界生成 10 個豐富多樣的群像角色卡。
要求：
- 角色需覆蓋不同性別、年齡層、職業與性格
- 關係網要讓角色之間互相有連結（不能全部都是陌生人）
- 每個角色都要有鮮明的個性與存在感${note ? '\n- 偏好：' + note : ''}

【小世界設定】
${worldEntry.content}

請嚴格按照以下格式，完整輸出 10 個 <character> 模塊，不要省略任何欄位：

${getCharCardTemplate()}`;

            const osApi = window.parent.OS_API;
            if (!osApi) throw new Error("OS_API 不可用");

            let generated = await new Promise((res, rej) => {
                let text = "";
                osApi.chat(
                    [{role:'system', content:'你是專業的角色設計師，擅長為 RPG 世界創作有深度的群像角色。'},
                     {role:'user', content: prompt}],
                    window.parent.OS_SETTINGS.getConfig(),
                    (c) => { text = c; status.textContent = `🤖 生成中... (${text.length} 字)`; },
                    (f) => res(f), (e) => rej(e), {disableTyping: true}
                );
            });

            status.textContent = "💾 保存至世界書...";
            const chatId = getChatIdentifier();
            const now = new Date().toISOString().replace(/[:.]/g,'-').slice(0,-5);
            const charKey = `[CHARS_${chatId}_${now}]`;
            await helper.createLorebookEntries(bookName, [{
                comment: `[角色卡] - ${worldName} - ${now}`,
                keys: [charKey],
                content: generated,
                enabled: true,
                position: 'at_depth_as_system',
                depth: 1,
                order: 996
            }]);

            status.textContent = `✅ 完成！已生成並保存 (${generated.length} 字)`; status.style.color = '#52c41a';
        } catch(e) { status.textContent = "❌ 失敗: " + e.message; status.style.color = '#ff4444'; }
    };


    // === 6. 初始化 DB 與 LOGS 系統 ===
    function initDbAndLogs() {
        // --- 數據庫 (CLAN) ---
        let dbCats = JSON.parse(localStorage.getItem('bg_database_categories') || '[{"id":"cat_clan","label":"【家族-","keyword":"【家族-","matchType":"comment_starts"}]');
        
        // 確保舊版本配置有預設值 (向下兼容)
        dbCats = dbCats.map(c => ({
            ...c,
            matchType: c.matchType || 'comment_starts'
        }));

        let activeCatId = dbCats.length > 0 ? dbCats[0].id : null;
        let matchedEntries = [];

        const renderSubtabs = () => {
            const el = document.getElementById('bg-db-subtabs');
            if(!el) return;
            el.innerHTML = dbCats.map(c => `<div class="bg-db-subtab ${c.id === activeCatId ? 'active' : ''}" data-id="${c.id}"><span>${escapeHtml(c.label)}</span><span class="bg-db-subtab-del" title="刪除">✕</span></div>`).join('');
            el.querySelectorAll('.bg-db-subtab').forEach(t => t.onclick = (e) => {
                if(e.target.classList.contains('bg-db-subtab-del')) {
                    if(!confirm("刪除分類設定？(不影響條目)")) return;
                    dbCats = dbCats.filter(x => x.id !== t.dataset.id); localStorage.setItem('bg_database_categories', JSON.stringify(dbCats));
                    activeCatId = dbCats.length > 0 ? dbCats[0].id : null; renderSubtabs(); renderDbEntries(); return;
                }
                activeCatId = t.dataset.id; renderSubtabs(); renderDbEntries();
            });
        };

        const renderDbEntries = async () => {
            const list = document.getElementById('bg-clan-list');
            const cat = dbCats.find(c => c.id === activeCatId);
            if(!cat) return list.innerHTML = '<div style="text-align:center;padding:30px;color:#555;">選擇或新增分類</div>';
            
            try {
                const helper = window.parent.TavernHelper;
                const book = helper.getCurrentCharPrimaryLorebook();
                const entries = await helper.getLorebookEntries(book);
                
                // 🔥 精準比對邏輯 (根據用戶選擇的 MatchType)
                matchedEntries = entries.filter(e => {
                    if (cat.matchType === 'key_includes') {
                        return e.keys && Array.isArray(e.keys) && e.keys.some(k => k.includes(cat.keyword));
                    } else {
                        // 預設為 'comment_starts'
                        return e.comment && e.comment.startsWith(cat.keyword);
                    }
                });
                
                if(matchedEntries.length === 0) return list.innerHTML = `<div style="text-align:center;padding:30px;color:#555;">無匹配「${cat.keyword}」的條目</div>`;

                const TYPE_MAP = {
                    constant:   { icon: '🔵', label: 'constant',   title: '恆定（藍燈）' },
                    selective:  { icon: '🟢', label: 'selective',  title: '正常（綠燈）' },
                    vectorized: { icon: '🔗', label: 'vectorized', title: '向量化' },
                };
                const TYPE_CYCLE = ['constant', 'selective', 'vectorized'];

                list.innerHTML = matchedEntries.map(e => {
                    const curType = e.type || 'selective';
                    const typeInfo = TYPE_MAP[curType] || TYPE_MAP.selective;
                    return `
                    <div class="bg-clan-item ${e.enabled ? '' : 'disabled'}" data-uid="${e.uid}" data-type="${curType}">
                        <div class="bg-clan-name" onclick="window._DB_EDIT(${e.uid})" style="cursor:pointer;" title="編輯">${escapeHtml(e.comment || `uid:${e.uid}`)}</div>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <button class="bg-db-type-btn" data-uid="${e.uid}" title="${typeInfo.title}">${typeInfo.icon}</button>
                            <label class="bg-switch"><input type="checkbox" class="db-toggle" data-uid="${e.uid}" ${e.enabled ? 'checked' : ''}><span class="bg-slider"></span></label>
                        </div>
                    </div>`;
                }).join('');
                
                // 綁定啟用/停用開關
                list.querySelectorAll('.db-toggle').forEach(chk => chk.onchange = async () => {
                    await helper.setLorebookEntries(book, [{ uid: parseInt(chk.dataset.uid), enabled: chk.checked }]);
                    renderDbEntries();
                });

                // 綁定 Type 循環切換按鈕
                list.querySelectorAll('.bg-db-type-btn').forEach(btn => {
                    btn.onclick = async function() {
                        const uid = parseInt(this.dataset.uid);
                        const item = list.querySelector(`.bg-clan-item[data-uid="${uid}"]`);
                        const curType = item ? (item.dataset.type || 'selective') : 'selective';
                        const nextType = TYPE_CYCLE[(TYPE_CYCLE.indexOf(curType) + 1) % TYPE_CYCLE.length];
                        const nextInfo = TYPE_MAP[nextType];

                        // 樂觀更新 UI
                        this.textContent = nextInfo.icon;
                        this.title = nextInfo.title;
                        if (item) item.dataset.type = nextType;

                        try {
                            // 實際寫入世界書
                            await helper.setLorebookEntries(book, [{ uid, type: nextType }]);
                        } catch(e) {
                            console.error('[數據庫] type 更新失敗:', e);
                            this.textContent = TYPE_MAP[curType].icon;
                            this.title = TYPE_MAP[curType].title;
                            if (item) item.dataset.type = curType;
                        }
                    };
                });
            } catch(e) {}
        };

        // 綁定按鈕
        document.getElementById('bg-clan-refresh').onclick = renderDbEntries;
        
        // 打開新增分類 Modal
        document.getElementById('bg-db-add-tab').onclick = () => {
            document.getElementById('bg-db-cat-input').value = '';
            document.getElementById('bg-db-addcat-modal').classList.add('active');
        };
        
        document.getElementById('bg-db-addcat-cancel').onclick = () => {
            document.getElementById('bg-db-addcat-modal').classList.remove('active');
        };
        
        // 🔥 確認新增分類 (極簡版：單一輸入框)
        document.getElementById('bg-db-addcat-confirm').onclick = () => {
            const inputValue = document.getElementById('bg-db-cat-input').value.trim();
            const matchType = document.querySelector('input[name="db_cat_match_type"]:checked').value;
            
            if (inputValue) { 
                dbCats.push({
                    id: 'cat_' + Date.now(), 
                    label: inputValue,  // 直接用輸入的字串當標籤名
                    keyword: inputValue, // 同時也是比對用的關鍵字
                    matchType: matchType
                }); 
                localStorage.setItem('bg_database_categories', JSON.stringify(dbCats)); 
                activeCatId = dbCats[dbCats.length-1].id; 
                renderSubtabs(); 
                renderDbEntries(); 
                document.getElementById('bg-db-addcat-modal').classList.remove('active');
            } else {
                alert("❌ 請輸入分類字串！");
            }
        };

        // 編輯器邏輯
        let editUid = null, editBook = null, editHelper = null, editKeys = [];
        window._DB_EDIT = async (uid) => {
            editHelper = window.parent.TavernHelper; editBook = editHelper.getCurrentCharPrimaryLorebook();
            const entry = (await editHelper.getLorebookEntries(editBook)).find(e => e.uid === uid);
            if(!entry) return;
            editUid = uid; editKeys = [...(entry.keys||[])];
            document.getElementById('bg-db-edit-bookname').textContent = `📖 ${editBook}`;
            document.getElementById('bg-db-edit-comment').value = entry.comment || '';
            document.getElementById('bg-db-edit-content').value = entry.content || '';
            const keyWrap = document.getElementById('bg-db-edit-keys-wrap');
            const renderKeys = () => {
                keyWrap.querySelectorAll('.bg-db-key-tag').forEach(el=>el.remove());
                editKeys.forEach((k, i) => { const sp = document.createElement('span'); sp.className='bg-db-key-tag'; sp.innerHTML=`${k}<span class="bg-db-key-tag-del">✕</span>`; sp.querySelector('.bg-db-key-tag-del').onclick=()=>{editKeys.splice(i,1); renderKeys();}; keyWrap.insertBefore(sp, document.getElementById('bg-db-edit-key-input')); });
            };
            renderKeys();
            document.getElementById('bg-db-edit-key-input').onkeydown = (e) => { if(e.key==='Enter'){ const v=e.target.value.trim(); if(v && !editKeys.includes(v)) editKeys.push(v); e.target.value=''; renderKeys(); } };
            document.getElementById('bg-db-edit-modal').classList.add('active');
        };

        document.getElementById('bg-db-edit-close').onclick = () => document.getElementById('bg-db-edit-modal').classList.remove('active');
        document.getElementById('bg-db-edit-save').onclick = async () => {
            const comment = document.getElementById('bg-db-edit-comment').value;
            const content = document.getElementById('bg-db-edit-content').value;
            const v = document.getElementById('bg-db-edit-key-input').value.trim();
            if(v && !editKeys.includes(v)) editKeys.push(v); document.getElementById('bg-db-edit-key-input').value='';
            const all = await editHelper.getLorebookEntries(editBook);
            await editHelper.replaceLorebookEntries(editBook, all.map(e => e.uid === editUid ? {...e, comment, content, keys: [...editKeys]} : e));
            document.getElementById('bg-db-edit-modal').classList.remove('active'); renderDbEntries();
        };

        renderSubtabs(); renderDbEntries();

        // --- 記錄 (LOGS) & 批次刪除邏輯 ---
        const renderLogs = async () => {
            const list = document.getElementById('bg-logs-list');
            try {
                const helper = window.parent.TavernHelper;
                const entries = await helper.getLorebookEntries(helper.getCurrentCharPrimaryLorebook());
                // 定義群組，加入自訂 match 函數來支援多前綴篩選
                const grps = [
                    { id:'child', label:'👶 寶寶 (CHILD) 養成記錄', match: (e) => e.comment && e.comment.startsWith('【角色-') },
                    { id:'inv', label:'🕵️ 刑偵 (INV) 辦案記錄', match: (e) => e.comment && (e.comment.startsWith('調查進度：') || e.comment.startsWith('刑偵卷宗：') || e.comment.startsWith('刑偵探員檔案：')) },
                    { id:'profile', label:'[Character_Profiles] 角色檔案', p:'[Character_Profiles]' },
                    { id:'log', label:'[RPG_LOG] 摘要日誌', p:'[RPG_LOG]' },
                    { id:'sum', label:'[大总结] 長線記憶', p:'[大总结]' },
                    { id:'wd', label:'[小世界] 場景設定', p:'[小世界]' },
                    { id:'sys', label:'系統常規配置', p:'系統' }
                ];
                
                let html = '';
                grps.forEach(g => {
                    const matched = entries.filter(e => g.match ? g.match(e) : (e.comment && e.comment.includes(g.p)));
                    if(matched.length === 0) return;
                    html += `
                        <div class="bg-logs-group">
                            <div class="bg-logs-group-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
                                <div><span class="bg-logs-group-title">${g.label}</span> <span style="font-size:11px; color:#555;">(${matched.length})</span></div>
                                <span style="font-size:10px;">▼</span>
                            </div>
                            <div class="bg-logs-group-body collapsed">
                                ${matched.map(e => `
                                    <div class="bg-logs-entry">
                                        <input type="checkbox" class="bg-logs-checkbox" data-uid="${e.uid}" title="選取以刪除">
                                        <div class="bg-logs-entry-name" onclick="window._DB_EDIT(${e.uid})" title="點擊預覽或編輯">${escapeHtml(e.comment)}</div>
                                        <button class="bg-logs-del-btn" onclick="if(confirm('確定刪除此條目?')){ window.parent.TavernHelper.deleteLorebookEntries(window.parent.TavernHelper.getCurrentCharPrimaryLorebook(), [${e.uid}]); setTimeout(()=>document.getElementById('bg-logs-refresh').click(), 300); }">🗑</button>
                                    </div>`).join('')}
                            </div>
                        </div>`;
                });
                list.innerHTML = html || '<div style="text-align:center;padding:30px;color:#555;">暫無系統記錄</div>';
            } catch(e) {}
        };

        // 綁定批次刪除與全選邏輯
        document.getElementById('bg-logs-select-all').onclick = function() {
            const isSelected = this.dataset.selected === 'true';
            this.dataset.selected = !isSelected;
            this.textContent = !isSelected ? '取消全選' : '全選';
            document.querySelectorAll('.bg-logs-checkbox').forEach(cb => cb.checked = !isSelected);
        };

        document.getElementById('bg-logs-delete-selected').onclick = async function() {
            const checkedBoxes = Array.from(document.querySelectorAll('.bg-logs-checkbox:checked'));
            if (checkedBoxes.length === 0) return alert('請先勾選要刪除的世界書記錄');
            if (!confirm(`確定要刪除選取的 ${checkedBoxes.length} 條記錄嗎？\n此操作會從酒館 AI 世界書中永久刪除且無法復原。`)) return;
            
            const btn = this;
            const originalText = btn.textContent;
            btn.textContent = '刪除中...';
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.5';
            
            try {
                const helper = window.parent.TavernHelper;
                const uids = checkedBoxes.map(cb => parseInt(cb.dataset.uid));
                await helper.deleteLorebookEntries(helper.getCurrentCharPrimaryLorebook(), uids);
                
                // 重置全選按鈕狀態
                const selectAllBtn = document.getElementById('bg-logs-select-all');
                selectAllBtn.textContent = '全選';
                selectAllBtn.dataset.selected = 'false';
                
                renderLogs();
            } catch(e) {
                alert('批次刪除失敗: ' + e.message);
            } finally {
                btn.textContent = originalText;
                btn.style.pointerEvents = 'auto';
                btn.style.opacity = '1';
            }
        };

        document.getElementById('bg-logs-refresh').onclick = renderLogs;
        renderLogs();
    }


    // === 7. 主渲染入口 ===
    function render(container) {
        // 注入樣式
        const doc = window.parent.document;
        if (!doc.getElementById('rpg-panel-style-v24')) {
        }

        // 寫入 HTML
        container.innerHTML = HTML_TEMPLATE;
        document.getElementById('status-chat-id').textContent = getChatIdentifier();

        // 綁定 Tab 切換
        const btns = container.querySelectorAll('.bg-tab-btn');
        const contents = container.querySelectorAll('.bg-tab-content');
        btns.forEach(btn => btn.addEventListener('click', function() {
            btns.forEach(b => b.classList.remove('active')); this.classList.add('active');
            contents.forEach(c => c.classList.toggle('active', c.getAttribute('data-content') === this.getAttribute('data-tab')));
        }));

        // 點擊外部關閉 Modal
        container.querySelectorAll('.rpg-modal-overlay').forEach(m => m.addEventListener('click', function(e) {
            if (e.target === this) this.classList.remove('active');
        }));

        // 初始化各模組
        window.WORLD_TEMPLATES.init();

        API.renderWorldList();
        initDbAndLogs();
    }

    // 暴露 API
    window.RPG_PANEL = {
        launch: render,
        launchApp: render,
        ...API
    };

})();