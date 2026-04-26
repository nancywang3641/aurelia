// ----------------------------------------------------------------
// [檔案] status_panel.js (V24 - 黑金整合+極簡分類模式+資料庫切換修復+批次刪除+小世界排版優化)
// 路徑：scripts/os_phone/status_panel.js
// 職責：
// 1. [小世界] 生成與管理場景設定、地圖。(生成器已獨立為視窗模式)
// 2. [數據庫] 管理常駐世界書，支援極簡雙模式分類(備注開頭/Key包含)，支援 藍球/綠球/鎖鏈 類型即時切換。
// 3. [記錄] 預覽與管理 LOG，包含刑偵、寶寶記錄，支援批次刪除。
// 4. [操作] 生成大總結、管理黑名單、管理小貼示。
// ----------------------------------------------------------------
(function() {
    console.log('📝 [Status Panel] V24 (Black Gold + Simple DB Category + World Modal) 載入...');

    // === 1. 樣式定義 ===
    const PANEL_STYLE = `
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap');

        :root {
            --bg-dark: #0a0a0a;
            --bg-panel: #111111;
            --gold-p: #d4af37;
            --gold-s: #7a6020;
            --text-main: #e6e6e6;
            --text-sub: #888;
            --alert-bg: rgba(212, 175, 55, 0.05);
            --btn-bg: rgba(255, 255, 255, 0.03);
        }

        /* --- 基礎佈局 --- */
        .bg-sys-root {
            font-family: 'Cinzel', 'Microsoft YaHei', sans-serif;
            background: var(--bg-dark); color: var(--text-main);
            width: 100%; height: 100%; position: relative; box-sizing: border-box;
            overflow: hidden; display: flex; flex-direction: column;
        }
        
        .rpg-header { z-index: 10; padding: 15px; background: rgba(5, 5, 5, 0.95); border-bottom: 1px solid var(--gold-s); display: flex; align-items: center; justify-content: space-between; box-shadow: 0 4px 20px rgba(0,0,0,0.8); flex-shrink: 0; }
        .rpg-title { font-family: 'Cinzel', serif; font-size: 18px; font-weight: 700; letter-spacing: 2px; color: var(--gold-p); }
        .rpg-chat-id { font-family: 'Cinzel'; font-size: 10px; color: #666; letter-spacing: 1px; }
        .rpg-back-btn { font-size: 22px; color: var(--gold-p); cursor: pointer; transition: 0.3s; width: 30px; }
        .rpg-back-btn:hover { color: #fff; transform: translateX(-3px); }

        /* --- 小貼示快捷開關列 --- */
        #bg-sticker-toggles {
            padding: 8px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex-shrink: 0;
            background: rgba(10, 10, 10, 0.8);
        }
        .bg-sticker-toggle-label { font-size: 11px; color: #555; letter-spacing: 1px; text-transform: uppercase; margin-right: 2px; transition: color 0.2s, border-color 0.2s; border: 1px solid #333; border-radius: 3px; padding: 3px 6px; display: inline-flex; align-items: center; cursor: pointer; }
        .bg-sticker-toggle-label:hover { color: var(--gold-p); border-color: var(--gold-s); }
        .bg-sticker-toggle-btn { padding: 4px 10px; background: transparent; border: 1px solid #333; border-radius: 3px; font-size: 11px; color: #555; cursor: pointer; transition: 0.2s; user-select: none; font-family: 'Cinzel', 'Microsoft YaHei'; }
        .bg-sticker-toggle-btn:hover { border-color: #666; color: #888; }
        .bg-sticker-toggle-btn.active { color: var(--gold-p); border-color: var(--gold-s); text-shadow: 0 0 6px rgba(212, 175, 55, 0.4); background: rgba(212, 175, 55, 0.05); }

        /* --- Tab 導航欄 --- */
        .bg-tabs-header {
            display: flex; background: #0a0a0a; border-bottom: 1px solid #333; flex-shrink: 0;
        }
        .bg-tab-btn {
            flex: 1; padding: 12px 5px; text-align: center;
            background: transparent; border: none; color: var(--text-sub);
            font-size: 12px; cursor: pointer; transition: all 0.3s;
            border-bottom: 2px solid transparent; white-space: nowrap;
            font-family: inherit; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;
        }
        .bg-tab-btn:hover { color: var(--gold-p); background: rgba(212,175,55,0.05); }
        .bg-tab-btn.active {
            color: var(--gold-p); border-bottom: 2px solid var(--gold-p); font-weight: bold;
            text-shadow: 0 0 8px rgba(212,175,55,0.4);
            background: linear-gradient(to top, rgba(212,175,55,0.1), transparent);
        }

        /* --- 內容區域 --- */
        .bg-sys-body { 
            padding: 15px; flex: 1; overflow-y: auto;
            background-color: var(--bg-dark); position: relative;
            display: flex; flex-direction: column;
        }
        .bg-tab-content { display: none; animation: fadeIn 0.4s ease; flex: 1; flex-direction: column; gap: 10px; }
        .bg-tab-content.active { display: flex; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        
        /* --- 設置與按鈕 --- */
        .bg-setting-row { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid #333; margin-bottom: 8px; border-radius: 4px; }
        .bg-switch { position: relative; display: inline-block; width: 36px; height: 20px; }
        .bg-switch input { opacity: 0; width: 0; height: 0; }
        .bg-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #333; transition: .4s; border-radius: 20px; }
        .bg-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: #888; transition: .4s; border-radius: 50%; }
        input:checked + .bg-slider { background-color: var(--gold-s); border: 1px solid var(--gold-p); }
        input:checked + .bg-slider:before { transform: translateX(16px); background-color: #fff; }
        
        .bg-btn-action { 
            width: 100%; padding: 12px; background: #222; border: 1px solid #444; color: #aaa; cursor: pointer; 
            font-size: 13px; margin-top: 5px; transition: 0.2s; text-transform: uppercase; letter-spacing: 1px; font-family: 'Cinzel', sans-serif; border-radius: 4px; font-weight: bold;
        }
        .bg-btn-action:hover { border-color: var(--gold-p); color: var(--gold-p); background: #1a1a1a; }
        .bg-btn-action.gold { border-color: var(--gold-s); color: var(--gold-p); background: rgba(212,175,55,0.1); }
        .bg-btn-action.gold:hover { background: rgba(212,175,55,0.2); box-shadow: 0 0 10px rgba(212,175,55,0.2); }

        /* --- 彈窗 (Modals) --- */
        .rpg-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); backdrop-filter: blur(5px); z-index: 999999; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.3s; padding: 20px; box-sizing: border-box; }
        .rpg-modal-overlay.active { opacity: 1; pointer-events: auto; }
        #world-template-modal, #world-template-editor { z-index: 1000001; }
        .rpg-modal-card { width: 100%; max-width: 400px; background: #0a0a0a; border: 1px solid var(--gold-p); box-shadow: 0 0 40px rgba(212, 175, 55, 0.2); border-radius: 8px; padding: 20px; text-align: center; display: flex; flex-direction: column; max-height: 100%; overflow-y: auto; }
        .rpg-range-input { width: 100%; padding: 10px; background: #111; border: 1px solid #333; color: #fff; margin: 5px 0 15px 0; box-sizing: border-box; border-radius: 4px; font-family: inherit; }
        .rpg-range-input:focus { outline: none; border-color: var(--gold-p); }
        .rpg-modal-title { font-size: 18px; color: var(--gold-p); font-weight: bold; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 10px; font-family: 'Cinzel'; }
        .rpg-btn-group { display: flex; gap: 10px; margin-top: 10px; flex-shrink: 0; }
        
        .spinning { animation: pulse 1.5s ease-in-out infinite; opacity: 0.8; pointer-events: none; position: relative; }
        @keyframes pulse { 0%, 100% { opacity: 0.8; box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.4); } 50% { opacity: 1; box-shadow: 0 0 10px 3px rgba(212, 175, 55, 0.6); } }
        
        .rpg-opt-group { text-align: left; margin-bottom: 15px; background: rgba(255,255,255,0.05); padding: 12px; border-radius: 6px; border: 1px solid #222; }
        .rpg-opt-label { display: flex; align-items: center; margin-bottom: 8px; font-size: 13px; color: #ccc; cursor: pointer; position: relative; }
        .rpg-opt-label input[type="radio"], .rpg-opt-label input[type="checkbox"] { margin-right: 8px; accent-color: var(--gold-p); width: 16px; height: 16px; cursor: pointer; }
        .rpg-opt-desc { font-size: 11px; color: #666; margin-left: 24px; display: block; font-style: italic; }

        /* --- 黑名單 & 小貼示 --- */
        .rpg-blacklist-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #151515; border: 1px solid #333; margin-bottom: 6px; border-left: 3px solid #ff4444; border-radius: 4px; }
        .rpg-blacklist-item.safe { border-left-color: #ffaa00; }
        .rpg-blacklist-item button { background: transparent; border: 1px solid #444; color: #ccc; border-radius: 4px; padding: 4px 8px; cursor: pointer; transition: 0.2s; }
        .rpg-blacklist-item button:hover { border-color: var(--gold-p); color: var(--gold-p); }
        
        .bg-sticker-item { display: flex; align-items: center; gap: 10px; padding: 10px; background: rgba(255, 255, 255, 0.03); border: 1px solid #333; border-radius: 4px; margin-bottom: 8px; transition: 0.2s; }
        .bg-sticker-item:hover { border-color: var(--gold-s); background: rgba(255, 255, 255, 0.05); }
        .bg-sticker-item.active { border-left: 3px solid var(--gold-p); background: rgba(212, 175, 55, 0.1); }
        .bg-sticker-item.inactive { opacity: 0.5; border-left: 3px solid #666; }
        .bg-sticker-btn-toggle { padding: 4px 10px; background: rgba(255, 255, 255, 0.05); border: 1px solid #444; border-radius: 4px; color: #888; font-size: 12px; cursor: pointer; transition: 0.2s; flex-shrink: 0; }
        .bg-sticker-btn-toggle.active { background: rgba(212, 175, 55, 0.2); border-color: var(--gold-p); color: var(--gold-p); }
        .bg-sticker-content { flex: 1; font-size: 13px; color: #ccc; word-break: break-word; text-align: left; }
        .bg-sticker-delete { width: 28px; height: 28px; background: rgba(255, 68, 68, 0.2); border: 1px solid #ff4444; color: #ff4444; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; transition: 0.2s; }
        .bg-sticker-delete:hover { background: rgba(255, 68, 68, 0.3); transform: scale(1.1); }

        /* --- 小世界 --- */
        .bg-world-container { display: flex; flex-direction: column; gap: 10px; padding: 5px 0; }
        .bg-world-card { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 6px; border: 1px solid #2a2a2a; border-left: 4px solid var(--gold-s); background: rgba(255,255,255,0.02); transition: 0.2s; }
        .bg-world-card:hover { border-left-color: var(--gold-p); background: rgba(212,175,55,0.08); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
        .bg-world-card-icon { font-size: 24px; flex-shrink: 0; }
        .bg-world-card-info { flex: 1; min-width: 0; }
        .bg-world-card-name { font-size: 15px; color: #ddd; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: 'Cinzel'; }
        .bg-world-card-meta { font-size: 11px; color: #777; margin-top: 4px; }
        .bg-world-card-del { background: transparent; border: 1px solid #3a2020; border-radius: 4px; color: #553333; font-size: 14px; padding: 4px 8px; cursor: pointer; transition: 0.2s; flex-shrink: 0; opacity: 0; pointer-events: none; }
        .bg-world-card:hover .bg-world-card-del { opacity: 1; pointer-events: auto; }
        .bg-world-card-del:hover { border-color: #cc4444; color: #ff5555; background: rgba(200,50,50,0.1); }
        .bg-world-card-chargen { background: transparent; border: 1px solid #1a2e3a; border-radius: 4px; color: #336677; font-size: 13px; padding: 4px 8px; cursor: pointer; transition: 0.2s; flex-shrink: 0; opacity: 0; pointer-events: none; }
        .bg-world-card:hover .bg-world-card-chargen { opacity: 1; pointer-events: auto; }
        .bg-world-card-chargen:hover { border-color: #4a9eff; color: #4a9eff; background: rgba(74,158,255,0.1); }
        
        .bg-wd-card { background: #0d0d0d; border: 1px solid var(--gold-s); border-radius: 8px; width: 95%; max-width: 500px; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.8); }
        .bg-wd-header { display: flex; align-items: center; justify-content: space-between; padding: 15px 20px; border-bottom: 1px solid #222; background: linear-gradient(90deg, rgba(30,20,0,0.8), rgba(10,10,10,0.8)); flex-shrink: 0; }
        .bg-wd-title { font-size: 16px; color: var(--gold-p); font-weight: bold; font-family: 'Cinzel'; }
        .bg-wd-close-btn { background: transparent; border: none; color: #888; font-size: 20px; cursor: pointer; transition: color 0.2s; }
        .bg-wd-close-btn:hover { color: #ff5555; }
        .bg-wd-map-area { flex-shrink: 0; background: #050505; display: flex; align-items: center; justify-content: center; padding: 10px; border-bottom: 1px solid #1a1a1a; max-height: 250px; overflow: hidden; }
        .bg-wd-map-img { max-width: 100%; max-height: 230px; border-radius: 4px; border: 1px solid #333; object-fit: contain; }
        .bg-wd-body { flex: 1; overflow-y: auto; padding: 20px; font-size: 13px; color: #ccc; line-height: 1.8; white-space: pre-wrap; word-break: break-word; }

        /* --- 數據庫與記錄 --- */
        .bg-clan-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid #333; border-left: 3px solid var(--gold-s); border-radius: 4px; transition: 0.2s; margin-bottom: 8px; }
        .bg-clan-item:hover { border-left-color: var(--gold-p); background: rgba(212,175,55,0.08); }
        .bg-clan-item.disabled { opacity: 0.45; border-left-color: #444; }
        .bg-clan-name { font-size: 13px; color: #ccc; flex: 1; word-break: break-word; font-family: 'Cinzel'; }
        .bg-clan-item.disabled .bg-clan-name { color: #666; }
        
        .bg-db-type-btn { background: transparent; border: 1px solid #444; border-radius: 3px; cursor: pointer; padding: 2px 6px; font-size: 13px; line-height: 1; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
        .bg-db-type-btn:hover { border-color: var(--gold-s); background: rgba(212,175,55,0.1); }
        
        .bg-db-subtab { padding: 6px 12px; font-size: 12px; cursor: pointer; border-radius: 4px; border: 1px solid #333; background: transparent; color: #888; transition: 0.2s; user-select: none; display: flex; align-items: center; gap: 6px; font-family: 'Cinzel'; }
        .bg-db-subtab:hover { border-color: var(--gold-s); color: #ccc; }
        .bg-db-subtab.active { border-color: var(--gold-p); color: var(--gold-p); background: rgba(212,175,55,0.12); font-weight: bold; box-shadow: 0 0 10px rgba(212,175,55,0.2); }
        .bg-db-subtab-del { font-size: 12px; color: #555; cursor: pointer; padding: 0 2px; transition: 0.2s; }
        .bg-db-subtab-del:hover { color: #ff4444; }
        
        .bg-logs-group { border: 1px solid #2a2a2a; border-radius: 6px; overflow: hidden; margin-bottom: 10px; }
        .bg-logs-group-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 15px; background: #151515; cursor: pointer; user-select: none; font-size: 13px; color: #aaa; border-bottom: 1px solid #2a2a2a; transition: 0.2s; }
        .bg-logs-group-header:hover { background: rgba(212,175,55,0.08); color: #fff; }
        .bg-logs-group-title { color: var(--gold-p); font-weight: bold; font-family: 'Cinzel'; }
        .bg-logs-group-body { display: flex; flex-direction: column; background: rgba(0,0,0,0.3); }
        .bg-logs-group-body.collapsed { display: none; }
        .bg-logs-entry { display: flex; align-items: center; gap: 8px; padding: 8px 15px; border-bottom: 1px solid #1e1e1e; transition: background 0.15s; }
        .bg-logs-entry:hover { background: rgba(212,175,55,0.05); }
        .bg-logs-entry-name { flex: 1; font-size: 12px; color: #bbb; word-break: break-all; cursor: pointer; }
        .bg-logs-entry-name:hover { color: var(--gold-p); text-decoration: underline; }
        .bg-logs-del-btn { background: transparent; border: 1px solid #3a2020; border-radius: 4px; cursor: pointer; color: #664444; font-size: 12px; padding: 4px 8px; transition: 0.2s; flex-shrink: 0; }
        .bg-logs-del-btn:hover { border-color: #cc4444; color: #ff5555; background: rgba(200,50,50,0.1); }
        .bg-logs-checkbox { accent-color: var(--gold-p); cursor: pointer; width: 14px; height: 14px; margin-right: 4px; }
        
        /* 編輯 Modal 專屬 */
        .bg-db-key-tag { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border: 1px solid #444; border-radius: 4px; background: rgba(255,255,255,0.05); color: #ccc; font-size: 12px; font-family: monospace; transition: 0.2s; }
        .bg-db-key-tag:hover { border-color: var(--gold-s); background: rgba(212,175,55,0.1); }
        .bg-db-key-tag-del { cursor: pointer; color: #888; font-size: 14px; transition: 0.2s; }
        .bg-db-key-tag-del:hover { color: #ff4444; }
    `;

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

            <div id="bg-sticker-toggles" style="display:none;"></div>

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
                    
                    <button class="bg-btn-action gold" id="btn-grand-summary" onclick="window.RPG_PANEL.showRangeModal()" style="padding:15px; font-size:14px;">
                        📝 生成 / 更新大總結 (Grand Summary)
                    </button>
                    <div style="font-size:11px; color:#666; margin-bottom:8px; text-align:right;">將最近的冒險經歷壓縮成永久記憶</div>

                    <button class="bg-btn-action" onclick="window.RPG_PANEL.openSummaryTemplateModal()" style="margin-bottom:10px;">
                        ✏️ 編輯大總結生成模板
                    </button>

                    <button class="bg-btn-action" onclick="window.RPG_PANEL.openMergeSummaryModal()" style="margin-bottom:15px;">
                        🔀 合併多個大總結
                    </button>

                    <div style="display:flex; gap:10px;">
                        <button class="bg-btn-action" onclick="window.RPG_PANEL.openBlacklistModal()" style="flex:1;">
                            🚫 黑名單管理
                        </button>
                        <button class="bg-btn-action" onclick="window.RPG_PANEL.openStickerModal()" style="flex:1;">
                            📌 小貼示管理
                        </button>
                    </div>

                    <div style="margin-top:20px; border-top:1px dashed #2a2a2a; padding-top:15px;">
                        <div style="font-size:11px; color:#555; letter-spacing:1px; text-transform:uppercase; margin-bottom:10px;">LOREBOOK SYNC / 世界書同步</div>
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0;">
                            <div>
                                <div style="font-size:12px; color:#bbb; font-family:monospace;">[RPG_DATA]</div>
                                <div style="font-size:10px; color:#555;">角色表 · 好感度 · 頭像庫</div>
                            </div>
                            <div class="sp-sync-toggle" id="sp-toggle-rpg-data" data-key="rpg_sync_rpgdata" style="width:40px; height:22px; border-radius:11px; background:#1a1a1a; border:1px solid #333; cursor:pointer; position:relative; transition:all 0.3s; flex-shrink:0;"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0;">
                            <div>
                                <div style="font-size:12px; color:#bbb; font-family:monospace;">[RPG_LOG]</div>
                                <div style="font-size:10px; color:#555;">事件日誌記錄</div>
                            </div>
                            <div class="sp-sync-toggle" id="sp-toggle-rpg-log" data-key="rpg_sync_rpglog" style="width:40px; height:22px; border-radius:11px; background:#1a1a1a; border:1px solid #333; cursor:pointer; position:relative; transition:all 0.3s; flex-shrink:0;"></div>
                        </div>
                    </div>

                    <div style="margin-top:20px; font-size:14px; color:var(--gold-p); margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:6px; font-family:'Cinzel'; font-weight:bold;">SYSTEM / 系統設置</div>
                    <div style="padding:15px; background: rgba(20,20,20,0.8); border: 1px solid #333; border-radius: 6px; text-align:center; color:#888; font-size:12px; line-height:1.6;">
                        STATUS PANEL INTEGRATED V24<br>
                        Powered by Black Gold UI<br>
                        <span style="color:#555;">(Simple DB Modes, DB Toggle, Batch Delete, World Modal)</span>
                    </div>
                </div>
            </div>

            <div id="rpg-range-modal" class="rpg-modal-overlay">
                <div class="rpg-modal-card">
                    <div class="rpg-modal-title">生成大總結設置</div>
                    <div class="rpg-opt-group">
                        <div style="font-size:12px; color:#aaa; margin-bottom:8px; font-weight:bold;">數據來源 (Source):</div>
                        <label class="rpg-opt-label">
                            <input type="radio" name="sum_source" value="summary" checked><span>📋 使用摘要 (summary)</span>
                        </label>
                        <span class="rpg-opt-desc">推薦: 讀取已同步的精簡摘要</span>
                        <label class="rpg-opt-label" style="margin-top:10px;">
                            <input type="radio" name="sum_source" value="content"><span>📄 使用全文 (content)</span>
                        </label>
                        <span class="rpg-opt-desc">直接讀取對話內容 (較耗時)</span>
                        <div style="border-top:1px solid #333; margin-top:12px; padding-top:12px;">
                            <label class="rpg-opt-label" style="margin-bottom:4px;">
                                <input type="checkbox" id="sum_merge" checked><span>合併之前的總結</span>
                            </label>
                            <span class="rpg-opt-desc">將舊的 [大總結] 一併發送給 AI 重整</span>
                        </div>
                    </div>
                    <div style="text-align:left; font-size:13px; color:#ccc; margin-bottom:10px;">
                        <label style="display:block; margin-bottom:5px;">起始 ID (Start):</label>
                        <input type="number" id="range-start-id" class="rpg-range-input" value="1" min="1">
                        <label style="display:block; margin-bottom:5px;">結束 ID (End):</label>
                        <input type="number" id="range-end-id" class="rpg-range-input" placeholder="留空代表最後一條">
                    </div>
                    <div class="rpg-btn-group">
                        <button class="bg-btn-action" onclick="document.getElementById('rpg-range-modal').classList.remove('active')">取消</button>
                        <button class="bg-btn-action gold" onclick="window.RPG_PANEL.confirmRangeAndGenerate()">開始生成</button>
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

            <div id="rpg-sticker-modal" class="rpg-modal-overlay">
                <div class="rpg-modal-card" style="max-width: 500px;">
                    <div class="rpg-modal-title">📌 小貼示管理</div>
                    <div style="margin-bottom:15px; background:rgba(255,255,255,0.03); padding:15px; border-radius:6px; border:1px solid #333;">
                        <input type="text" id="sticker-title-input" class="rpg-range-input" style="margin:0 0 10px 0;" placeholder="標題（顯示在按鈕上）...">
                        <input type="text" id="sticker-content-input" class="rpg-range-input" style="margin:0 0 10px 0;" placeholder="內容（發送時自動追加）...">
                        <button class="bg-btn-action gold" style="margin:0;" onclick="window.RPG_PANEL.addSticker()">+ 新增小貼示</button>
                    </div>
                    <div id="sticker-content" style="flex:1; overflow-y:auto; text-align:left; border:1px solid #222; border-radius:4px; padding:10px; background:#0f0f0f; min-height:200px;">載入中...</div>
                    <div style="font-size:11px; color:#666; margin-top:10px; padding-top:10px; border-top:1px solid #333; text-align:left;">
                        💡 提示：開啟的小貼示會在選擇劇情選項或發送對話時，自動作為系統提示追加到輸入框中。
                    </div>
                    <button class="bg-btn-action" style="margin-top:15px;" onclick="document.getElementById('rpg-sticker-modal').classList.remove('active')">關閉</button>
                </div>
            </div>

            <div id="rpg-merge-modal" class="rpg-modal-overlay">
                <div class="rpg-modal-card" style="max-width:520px;">
                    <div class="rpg-modal-title">🔀 合併大總結</div>
                    <div style="margin-bottom:12px;">
                        <label style="display:block; font-size:11px; color:var(--gold-p); margin-bottom:5px;">備註 / 調整要求（發給 AI）</label>
                        <textarea id="sp-merge-note" style="width:100%; height:60px; background:#0d0d0d; border:1px solid #333; color:#ccc; font-size:11px; padding:6px; border-radius:3px; resize:vertical; box-sizing:border-box; font-family:'Microsoft YaHei',sans-serif;" placeholder="例：請特別保留角色A與B的關係細節，合併後去掉重複的物品記錄..."></textarea>
                    </div>
                    <div style="font-size:11px; color:#888; margin-bottom:8px;">勾選要合併的條目：</div>
                    <div id="sp-merge-list" style="flex:1; overflow-y:auto; max-height:260px; border:1px solid #222; border-radius:4px; padding:10px; background:#0f0f0f; min-height:80px; display:flex; flex-direction:column; gap:8px;">載入中...</div>
                    <div class="rpg-btn-group" style="margin-top:15px;">
                        <button class="bg-btn-action" onclick="document.getElementById('rpg-merge-modal').classList.remove('active')">取消</button>
                        <button class="bg-btn-action gold" onclick="window.RPG_PANEL.executeMergeSummaries()">🔀 開始合併</button>
                    </div>
                </div>
            </div>

            <div id="rpg-summary-tpl-modal" class="rpg-modal-overlay">
                <div class="rpg-modal-card" style="max-width:640px;">
                    <div class="rpg-modal-title">✏️ 大總結 生成模板</div>
                    <div style="font-size:11px; color:#666; margin-bottom:8px;">編輯後點保存，下次生成大總結時使用此模板。<br>可用佔位符：<span style="color:var(--gold-p);">{{count}}</span>（第幾次）</div>
                    <textarea id="sp-summary-tpl-area" style="width:100%; height:400px; background:#0d0d0d; border:1px solid #333; color:#ccc; font-size:11px; padding:8px; border-radius:3px; resize:vertical; box-sizing:border-box; font-family:'Microsoft YaHei',monospace;"></textarea>
                    <div class="rpg-btn-group" style="margin-top:12px;">
                        <button class="bg-btn-action" onclick="window.RPG_PANEL.resetSummaryTemplate()">↺ 還原預設</button>
                        <button class="bg-btn-action" onclick="document.getElementById('rpg-summary-tpl-modal').classList.remove('active')">關閉</button>
                        <button class="bg-btn-action gold" onclick="window.RPG_PANEL.saveSummaryTemplate()">💾 保存</button>
                    </div>
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

    // --- A. 大總結 生成模板 ---
    const SUMMARY_DEFAULT_TPL = `要求：
- 注明这是第{{count}}次大总结
- 直接陈述事实，包含具体时间，省略冗余。保留敏感内容。
1. 請開始總結紀錄，你將按照以下格式進行總結。

- 按逻辑顺序组织信息，并包含具体的前后时间，可以分辨不同日期与时间发生的事情
- 保留关键事件和重要细节，省略冗余描述
- 直接陈述事实，避免评价
- 使用简洁清晰的语言，避免修饰
- 突出事件发展脉络和关键转折点
- 保留重要的约定、物品、事件以及情感发展
- 不回避任何敏感内容，保证记录完全还原前文
- 可以精简合并较为久远之前的事件
- 无需加粗标注

格式如下：
【大总结(第{{count}}次)】
【事件表】
時間 |关键事件 | 事件描述(詳細100字上下) | 关键行为：(标明角色互動100字內描述) | 事件地點 | 重要细节(角色名:關鍵對話) | 简要的事件后续 | 備註 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |

【角色表】
- 所有对剧情有影响的角色均需出现(包括没有实体的角色)
姓名 | 身份 | 性格行為攝影(100字) | 状态/位置 |  关键特征 | 與MC的关系/初遇事件100字內描述 |备注(目標) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |


【代辦清單】
| 代辦事項 | 代辦事項描述 | 參與角色 | 備註 |
| :--- | :--- | :--- | :--- |

【結算清單】
| 結算事件 | 事件描述 | 參與角色 | 備註 |
| :--- | :--- | :--- | :--- |

【物品表】
物品名 | 物品描述 | 物品狀態(在庫/使用中/損壞) | 獲取途徑 | 備註 |
| :--- | :--- | :--- | :--- | :--- | :--- |

【注意規範/記憶事項表】
事項(人事物) | 事項描述 | 備註 |
| :--- | :--- | :--- |

【性事紀】(以免出現AI角色後續忘記有過性事，導致角色OOC變成拔屌無情的渣男渣女)
| 性事事件 | 事件描述 | 參與角色 | 備註 |
| :--- | :--- | :--- | :--- |`;

    function getSummaryTemplate() {
        return localStorage.getItem('sp_summary_tpl') || SUMMARY_DEFAULT_TPL;
    }

    API.openSummaryTemplateModal = function() {
        document.getElementById('rpg-summary-tpl-modal').classList.add('active');
        document.getElementById('sp-summary-tpl-area').value = getSummaryTemplate();
    };

    API.saveSummaryTemplate = function() {
        localStorage.setItem('sp_summary_tpl', document.getElementById('sp-summary-tpl-area').value);
        document.getElementById('rpg-summary-tpl-modal').classList.remove('active');
    };

    API.resetSummaryTemplate = function() {
        if (!confirm('確定還原為預設模板？')) return;
        localStorage.removeItem('sp_summary_tpl');
        document.getElementById('sp-summary-tpl-area').value = SUMMARY_DEFAULT_TPL;
    };

    API.openMergeSummaryModal = async function() {
        document.getElementById('rpg-merge-modal').classList.add('active');
        const listEl = document.getElementById('sp-merge-list');
        listEl.innerHTML = '載入中...';
        try {
            const helper = window.parent.TavernHelper;
            if (!helper) throw new Error('無 TavernHelper');
            const bookName = helper.getCurrentCharPrimaryLorebook();
            if (!bookName) throw new Error('未綁定世界書');
            const entries = await helper.getLorebookEntries(bookName);
            const chatId = getChatIdentifier();
            const summaries = entries.filter(e => e.comment && e.comment.includes(`[大总结] - ${chatId}`));
            if (summaries.length === 0) { listEl.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">此對話暫無大總結</div>'; return; }
            summaries.sort((a, b) => (a.uid || 0) - (b.uid || 0));
            listEl.innerHTML = '';
            summaries.forEach(e => {
                const row = document.createElement('label');
                row.style.cssText = 'display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:6px; border:1px solid #2a2a2a; border-radius:4px; background:#111;';
                const cb = document.createElement('input');
                cb.type = 'checkbox'; cb.value = String(e.uid); cb.dataset.bookName = bookName;
                cb.style.cssText = 'margin-top:2px; flex-shrink:0; accent-color:var(--gold-p);';
                const text = document.createElement('span');
                text.style.cssText = 'font-size:11px; color:#ccc; line-height:1.4;';
                const preview = (e.content || '').slice(0, 80).replace(/\n/g, ' ');
                text.innerHTML = `<span style="color:var(--gold-p); font-size:10px;">${e.comment || ''}</span><br>${preview}${(e.content||'').length > 80 ? '...' : ''}`;
                row.appendChild(cb); row.appendChild(text);
                listEl.appendChild(row);
            });
        } catch(e) { listEl.innerHTML = `<div style="color:#ff4444; padding:10px;">❌ 載入失敗: ${e.message}</div>`; }
    };

    API.executeMergeSummaries = async function() {
        const listEl = document.getElementById('sp-merge-list');
        const checked = Array.from(listEl.querySelectorAll('input[type="checkbox"]:checked'));
        if (checked.length < 2) { alert('請至少勾選 2 個條目進行合併'); return; }
        const userNote = (document.getElementById('sp-merge-note').value || '').trim();
        document.getElementById('rpg-merge-modal').classList.remove('active');
        const btn = document.getElementById('btn-grand-summary');
        const origText = btn ? btn.innerText : '';
        if (btn) { btn.innerText = '合併中 (請勿關閉)...'; btn.classList.add('spinning'); }
        try {
            const helper = window.parent.TavernHelper;
            const bookName = checked[0].dataset.bookName;
            const allEntries = await helper.getLorebookEntries(bookName);
            const selected = checked.map(cb => allEntries.find(e => String(e.uid) === cb.value)).filter(Boolean);
            const combined = selected.map((e, i) => `=== 第 ${i+1} 份總結 (${e.comment}) ===\n${e.content}`).join('\n\n');
            const chatId = getChatIdentifier();
            const existingCount = allEntries.filter(e => e.comment && e.comment.includes(`[大总结] - ${chatId}`)).length;
            const newCount = existingCount + 1;

            const noteSection = userNote ? `\n【用户备注/调整要求】\n${userNote}\n` : '';
            const prompt = `停止剧情输出，执行**合并大总结**\n${noteSection}\n以下是 ${selected.length} 份需要合并的大总结，请将其整合为一份完整的新大总结，保留所有重要信息，去除重复内容，按时间顺序重新组织。\n\n${combined}\n\n要求：\n- 注明这是第${newCount}次大总结（合并版）\n- 合并所有事件表、角色表、代办清单、物品表等\n- 同一角色或事件的重复记录请合并去重\n- 保留所有重要细节，不遗漏敏感内容\n- 按以下格式输出：\n\n格式如下：\n【大总结(第${newCount}次·合并版)】\n【事件表】\n時間 |关键事件 | 事件描述(詳細100字上下) | 关键行为 | 事件地點 | 重要细节 | 简要的事件后续 | 備註 |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n\n【角色表】\n姓名 | 身份 | 性格行為 | 状态/位置 | 关键特征 | 與MC的关系 | 备注 |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n\n【代辦清單】\n| 代辦事項 | 描述 | 參與角色 | 備註 |\n| :--- | :--- | :--- | :--- |\n\n【結算清單】\n| 結算事件 | 描述 | 參與角色 | 備註 |\n| :--- | :--- | :--- | :--- |\n\n【物品表】\n物品名 | 描述 | 狀態 | 獲取途徑 | 備註 |\n| :--- | :--- | :--- | :--- | :--- |\n\n【注意規範/記憶事項表】\n事項 | 描述 | 備註 |\n| :--- | :--- | :--- |\n\n【性事紀】\n| 性事事件 | 描述 | 參與角色 | 備註 |\n| :--- | :--- | :--- | :--- |`;

            const osApi = window.parent.OS_API;
            const osSet = window.parent.OS_SETTINGS;
            if (!osApi) throw new Error('找不到 OS_API');

            let generated = '';
            await new Promise((res, rej) => {
                osApi.chat([{role:'system', content:'剧情总结合并助手'}, {role:'user', content:prompt}], osSet.getConfig(),
                    (chunk) => { generated = chunk; }, (final) => { generated = final; res(); }, (err) => rej(err), {disableTyping:true});
            });

            const now = new Date().toISOString().replace(/[:.]/g,'-').slice(0,-5);
            let finalContent = generated;
            if (!/【大总结/.test(finalContent)) finalContent = `【大总结(第${newCount}次·合并版)】\n\n${finalContent}`;
            const newEntry = { comment: `[大总结] - ${chatId} - 第${newCount}次(合并) - ${now}`, keys: [`[SUMMARY_${chatId}_MERGE_${now}]`], content: finalContent, enabled: true, position: 'at_depth_as_system', depth: 1, order: 998 };
            await helper.createLorebookEntries(bookName, [newEntry]);
            alert(`✅ 合併完成！已生成第 ${newCount} 次（合并版）大總結`);
        } catch(e) { alert('合併失敗: ' + e.message); }
        finally { if (btn) { btn.innerText = origText; btn.classList.remove('spinning'); } }
    };

    API.showRangeModal = async function() {
        document.getElementById('rpg-range-modal').classList.add('active');
        try {
            const helper = window.parent.TavernHelper;
            if (!helper) return;
            const msgs = await helper.getChatMessages('0-{{lastMessageId}}');
            if (msgs.length > 0) document.getElementById('range-end-id').placeholder = `最後一條 ID: ${msgs[msgs.length-1].message_id}`;
            
            const bookName = helper.getCurrentCharPrimaryLorebook();
            if (bookName) {
                const entries = await helper.getLorebookEntries(bookName);
                const chatId = getChatIdentifier();
                const prefix = `[大总结] - ${chatId}`;
                const summaries = entries.filter(e => e.comment && (e.comment.includes(prefix) || e.comment.includes(chatId) && e.comment.includes('大总结')));
                
                if (summaries.length > 0) {
                    const latest = summaries.sort((a,b) => (b.uid||0) - (a.uid||0))[0];
                    if (latest && latest.content) {
                        const match = latest.content.match(/Last:\s*(\d+)/i);
                        if (match && !isNaN(parseInt(match[1]))) {
                            document.getElementById('range-start-id').value = parseInt(match[1]) + 1;
                        }
                    }
                }
            }
        } catch(e) { console.error('[大总結] 初始化失敗:', e); }
    };

    API.confirmRangeAndGenerate = function() {
        const start = parseInt(document.getElementById('range-start-id').value) || 1;
        const endVal = document.getElementById('range-end-id').value;
        const end = endVal ? parseInt(endVal) : null;
        const sourceType = document.querySelector('input[name="sum_source"]:checked').value;
        const mergePrev = document.getElementById('sum_merge').checked;
        document.getElementById('rpg-range-modal').classList.remove('active');
        API._generateSummary(start, end, sourceType, mergePrev);
    };

    API._generateSummary = async function(startId, endId, sourceType, mergePrev) {
        const btn = document.getElementById('btn-grand-summary');
        btn.innerText = "生成中 (請勿關閉)..."; btn.classList.add('spinning');
        try {
            const helper = window.parent.TavernHelper;
            if(!helper) throw new Error("無 TavernHelper");
            const bookName = helper.getCurrentCharPrimaryLorebook();
            const chatId = getChatIdentifier();
            const entries = await helper.getLorebookEntries(bookName);
            
            let contentToSummarize = "";
            let sourceDesc = "";

            if (sourceType === 'summary') {
                const logComment = `[RPG_LOG] - ${chatId}`;
                const logEntry = entries.find(e => e.comment === logComment);
                if(!logEntry) throw new Error(`找不到摘要日誌，請確保已同步`);
                const lines = logEntry.content.replace(/^\[.*?\]\s*/, '').split('\n');
                contentToSummarize = lines.filter(line => {
                    const match = line.match(/ID:(\d+)/);
                    if(!match) return true;
                    const id = parseInt(match[1]);
                    return (!startId || id >= startId) && (!endId || id <= endId);
                }).join('\n');
                sourceDesc = "摘要日誌";
            } else {
                const msgs = await helper.getChatMessages('0-{{lastMessageId}}');
                const filtered = msgs.filter(m => {
                    const id = parseInt(m.message_id);
                    return (!startId || id >= startId) && (!endId || id <= endId);
                });
                if(filtered.length === 0) throw new Error("範圍內無對話");
                contentToSummarize = filtered.map(m => {
                    const match = (m.message||m.mes||"").match(/<content>([\s\S]*?)<\/content>/i);
                    return match ? `\n[ID:${m.message_id}] ${match[1].trim()}` : "";
                }).join("");
                if(!contentToSummarize.trim()) throw new Error("未找到 <content> 標籤");
                sourceDesc = "全文對話";
            }

            let prevSummary = "";
            let summaryCount = 1;
            const oldSummaries = entries.filter(e => e.comment && e.comment.includes(`[大总结] - ${chatId}`));
            if (oldSummaries.length > 0) {
                summaryCount = oldSummaries.length + 1;
                if (mergePrev) prevSummary = oldSummaries.map(e => `=== 舊總結 ===\n${e.content}`).join("\n\n");
            }

            let prevSection = prevSummary ? (mergePrev ? `**合并所有之前的总结数据**\n${prevSummary}\n` : `**只总结新增剧情**\n${prevSummary}\n`) : `**首次总结**\n`;
            let actualLastId = endId || await helper.getLastMessageId() || startId;

            const tplBody = getSummaryTemplate().replace(/\{\{count\}\}/g, summaryCount);
            const prompt = `停止剧情输出，执行**新增大总结**\n\n${prevSection}\n${tplBody}\n=== ${sourceDesc} ===\n${contentToSummarize}`;

            const osApi = window.parent.OS_API;
            const osSet = window.parent.OS_SETTINGS;
            if(!osApi) throw new Error("找不到 OS_API");

            let generated = "";
            await new Promise((res, rej) => {
                osApi.chat([{role:'system', content:'剧情总结助手'}, {role:'user', content:prompt}], osSet.getConfig(),
                    (chunk) => { generated = chunk; }, (final) => { generated = final; res(); }, (err) => rej(err), {disableTyping:true});
            });

            const now = new Date().toISOString().replace(/[:.]/g,'-').slice(0,-5);
            let finalContent = generated;
            if (/【大总结\(第\d+次\)】/.test(finalContent)) finalContent = finalContent.replace(/【大总结\(第\d+次\)】/, `【大总结(第${summaryCount}次)】\nFirst: ${startId || 1}\nLast: ${actualLastId}`);
            else finalContent = `【大总结(第${summaryCount}次)】\nFirst: ${startId || 1}\nLast: ${actualLastId}\n\n${finalContent}`;

            const newEntry = { comment: `[大总结] - ${chatId} - 第${summaryCount}次 - ${now}`, keys: [`[SUMMARY_${chatId}_${now}]`], content: finalContent, enabled: true, position: 'at_depth_as_system', depth: 1, order: 998 };
            await helper.createLorebookEntries(bookName, [newEntry]);
            
            // 嘗試注入 KEY
            try {
                const lastId = await helper.getLastMessageId();
                if (lastId >= 0) {
                    const lastMsg = (await helper.getChatMessages(-1))[0];
                    if (lastMsg && !(lastMsg.mes||'').includes(newEntry.keys[0])) {
                        const _cur = lastMsg.mes || lastMsg.message || '';
                        await helper.setChatMessages([{message_id: lastId, message: _cur + ' ' + newEntry.keys[0], mes: _cur + ' ' + newEntry.keys[0]}], {refresh:'affected'});
                    }
                }
            } catch(e) {}
            
            alert(`✅ 第 ${summaryCount} 次大總結已生成！`);
        } catch(e) { alert("生成失敗: " + e.message); } finally {
            btn.innerText = "📝 生成 / 更新大總結 (Grand Summary)"; btn.classList.remove('spinning');
        }
    };

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

    // --- C. 小貼示管理 ---
    API.openStickerModal = function() {
        document.getElementById('rpg-sticker-modal').classList.add('active');
        API.renderStickers();
    };

    API.renderStickers = function() {
        const stickers = JSON.parse(localStorage.getItem('rpg_stickers') || '[]');
        const div = document.getElementById('sticker-content');
        if(stickers.length === 0) return div.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">暫無小貼示</div>';
        
        div.innerHTML = stickers.map((s, i) => `
            <div class="bg-sticker-item ${s.enabled ? 'active' : 'inactive'}">
                <button class="bg-sticker-btn-toggle ${s.enabled ? 'active' : ''}" onclick="window.RPG_PANEL.toggleSticker(${i})">${s.enabled ? '✓' : ''}</button>
                <div class="bg-sticker-content">
                    <div style="font-weight:bold; color:var(--gold-p);">${escapeHtml(s.title || s.content)}</div>
                    <div style="font-size:11px; color:#888;">${escapeHtml(s.content)}</div>
                </div>
                <div class="bg-sticker-delete" onclick="window.RPG_PANEL.deleteSticker(${i})">×</div>
            </div>
        `).join('');
    };

    API.addSticker = function() {
        const t = document.getElementById('sticker-title-input').value.trim();
        const c = document.getElementById('sticker-content-input').value.trim();
        if(!t && !c) return;
        const stickers = JSON.parse(localStorage.getItem('rpg_stickers') || '[]');
        stickers.push({ title: t||c, content: c||t, enabled: true, id: Date.now() });
        localStorage.setItem('rpg_stickers', JSON.stringify(stickers));
        document.getElementById('sticker-title-input').value = '';
        document.getElementById('sticker-content-input').value = '';
        API.renderStickers();
        API.renderStickerToggles();
    };

    API.toggleSticker = function(i) {
        const stickers = JSON.parse(localStorage.getItem('rpg_stickers') || '[]');
        if(stickers[i]) { stickers[i].enabled = !stickers[i].enabled; localStorage.setItem('rpg_stickers', JSON.stringify(stickers)); }
        API.renderStickers(); API.renderStickerToggles();
    };

    API.deleteSticker = function(i) {
        const stickers = JSON.parse(localStorage.getItem('rpg_stickers') || '[]');
        stickers.splice(i, 1); localStorage.setItem('rpg_stickers', JSON.stringify(stickers));
        API.renderStickers(); API.renderStickerToggles();
    };

    API.renderStickerToggles = function() {
        const stickers = JSON.parse(localStorage.getItem('rpg_stickers') || '[]');
        const container = document.getElementById('bg-sticker-toggles');
        if(!container) return;
        if(stickers.length === 0) return container.style.display = 'none';
        
        let html = '<span class="bg-sticker-toggle-label" onclick="window.RPG_PANEL.openStickerModal()" title="小貼示管理">📌</span>';
        stickers.forEach((s, i) => html += `<button class="bg-sticker-toggle-btn ${s.enabled?'active':''}" onclick="window.RPG_PANEL.toggleSticker(${i})">${escapeHtml(s.title||s.content)}</button>`);
        container.innerHTML = html; container.style.display = 'flex';
    };

    // --- D. 小世界生成器 ---
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
            const s = doc.createElement('style'); s.id = 'rpg-panel-style-v24'; s.innerHTML = PANEL_STYLE; doc.head.appendChild(s);
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

        // 同步開關
        const TOGGLE_ON_STYLE = 'background:rgba(212,175,55,0.15); border-color:var(--gold-p);';
        const TOGGLE_OFF_STYLE = 'background:#1a1a1a; border-color:#333;';
        container.querySelectorAll('.sp-sync-toggle').forEach(el => {
            const isOn = localStorage.getItem(el.dataset.key) === '1';
            el.style.cssText = el.style.cssText + (isOn ? TOGGLE_ON_STYLE : TOGGLE_OFF_STYLE);
            if (isOn) el.dataset.on = '1';
            el.addEventListener('click', function() {
                const on = this.dataset.on === '1';
                this.dataset.on = on ? '' : '1';
                this.style.cssText = this.style.cssText.replace(/background:[^;]+;|border-color:[^;]+;/g, '');
                this.style.cssText += on ? TOGGLE_OFF_STYLE : TOGGLE_ON_STYLE;
                localStorage.setItem(this.dataset.key, on ? '0' : '1');
            });
        });

        API.renderStickerToggles();
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