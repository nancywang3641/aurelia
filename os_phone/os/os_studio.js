// ----------------------------------------------------------------
// [檔案] os_studio.js (通用靈感創作室 Studio - V2.5 移動端 UX 終極優化)
// 職責：優化移動端體驗，預覽區置頂、輸入區置底，加入點擊外部關閉與 Toggle 切換。
// ----------------------------------------------------------------
(function() {
    const win = window.parent || window;
    console.log('[PhoneOS] 啟動通用靈感創作室 (Creator Studio V2.5)...');

    const studioStyle = `
        .studio-container { width: 100%; height: 100%; background: #1a0d0a; color: #FFF8E7; display: flex; flex-direction: column; font-family: 'Noto Sans TC', sans-serif; position: relative; z-index: 9999; }
        .studio-header { padding: calc(12px + var(--safe-top, env(safe-area-inset-top, 0px))) 20px 12px; background: rgba(69,34,22,0.9); border-bottom: 1px solid rgba(251,223,162,0.3); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; box-sizing: border-box; }
        .studio-title { font-size: 16px; font-weight: bold; color: #FBDFA2; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .studio-channel-badge { font-size: 11px; background: rgba(46,204,113,0.15); border: 1px solid #2ecc71; color: #2ecc71; padding: 2px 8px; border-radius: 12px; margin-left: 8px; font-weight: normal; }
        .studio-mode-select { background: rgba(0,0,0,0.5); border: 1px solid #FBDFA2; color: #FBDFA2; padding: 6px 12px; border-radius: 6px; font-size: 13px; outline: none; cursor: pointer; }
        .studio-icon-btn { background: rgba(251,223,162,0.1); border: 1px solid rgba(251,223,162,0.4); color: #FBDFA2; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px; transition: 0.2s; display: flex; align-items: center; gap: 5px; }
        .studio-icon-btn:hover { background: rgba(251,223,162,0.2); border-color: #FBDFA2; }
        .studio-icon-btn.danger { color: #fc8181; border-color: #fc8181; background: rgba(252,129,129,0.1); }
        .studio-icon-btn.danger:hover { background: rgba(252,129,129,0.2); }
        .studio-body { flex: 1; display: flex; overflow: hidden; }
        .studio-left { flex: 1; display: flex; flex-direction: column; border-right: 1px solid rgba(251,223,162,0.3); background: rgba(0,0,0,0.2); min-width: 300px; position: relative; }
        .studio-right { flex: 1.2; display: flex; flex-direction: column; background: #110805; min-width: 300px; position: relative; }
        .studio-chat-history { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        .studio-bubble { max-width: 85%; padding: 12px 16px; border-radius: 12px; font-size: 13px; line-height: 1.5; word-wrap: break-word; white-space: pre-wrap; position: relative; }
        .studio-bubble.user { align-self: flex-end; background: rgba(183,132,86,0.3); border: 1px solid rgba(251,223,162,0.4); color: #FBDFA2; border-bottom-right-radius: 2px; }
        .studio-bubble.ai { align-self: flex-start; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #FFF8E7; border-bottom-left-radius: 2px; }
        .studio-input-area { padding: 15px; padding-bottom: calc(15px + env(safe-area-inset-bottom, 0px)); background: rgba(69,34,22,0.9); border-top: 1px solid rgba(251,223,162,0.3); display: flex; gap: 10px; flex-shrink: 0; }
        .studio-textarea { flex: 1; background: rgba(0,0,0,0.5); border: 1px solid rgba(251,223,162,0.4); color: #FFF; padding: 10px 14px; border-radius: 8px; font-size: 13px; outline: none; resize: none; height: 50px; font-family: inherit; }
        .studio-textarea:focus { border-color: #FBDFA2; }
        .studio-send-btn { background: #FBDFA2; color: #452216; border: none; padding: 0 20px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 13px; transition: 0.2s; }
        .studio-right-header { display: flex; background: rgba(69,34,22,0.9); border-bottom: 1px solid rgba(251,223,162,0.3); flex-shrink: 0; align-items: center; }
        .mobile-sidebar-btn { display: none; }
        .mobile-sidebar-close { display: none; }
        .studio-tab { flex: 1; text-align: center; padding: 15px 0; font-size: 13px; color: #B78456; cursor: pointer; font-weight: bold; transition: 0.3s; position: relative; }
        .studio-tab.active { color: #FBDFA2; }
        .studio-tab.active::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 3px; background: #FBDFA2; }
        .studio-preview-content { flex: 1; overflow: hidden; display: flex; flex-direction: row; position: relative; }
        .studio-wb-sidebar { display: none; }
        .studio-preview-main { flex: 1; overflow-y: auto; padding: 20px; position: relative; }
        .tree-project { color: #FBDFA2; font-weight: bold; font-size: 13px; margin-bottom: 5px; cursor: pointer; padding: 8px; border-radius: 6px; background: rgba(251,223,162,0.1); transition: 0.2s; }
        .tree-project:hover { background: rgba(251,223,162,0.2); }
        .tree-folder { color: #B78456; font-size: 12px; margin-top: 8px; margin-left: 10px; padding-bottom: 2px; border-bottom: 1px solid rgba(183,132,86,0.3); }
        .tree-item { color: rgba(255,248,231,0.7); font-size: 12px; padding: 6px 10px 6px 20px; cursor: pointer; border-radius: 4px; display: flex; align-items: center; gap: 6px; }
        .tree-item:hover { background: rgba(255,255,255,0.05); color: #FFF; }
        .tree-item.active { background: rgba(251,223,162,0.15); color: #FBDFA2; border-left: 2px solid #FBDFA2; }
        .studio-source-content { flex: 1; overflow-y: auto; padding: 20px; background: #000; color: #00ffcc; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; display: none; }
        .studio-action-area { padding: 15px; background: rgba(69,34,22,0.9); border-top: 1px solid rgba(251,223,162,0.3); flex-shrink: 0; display: flex; justify-content: flex-end; }
        .studio-export-btn { background: #2ecc71; color: white; border: 1px solid #27ae60; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; transition: 0.2s; display: none; }
        .studio-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(251,223,162,0.3); border-radius: 8px; padding: 16px; margin-bottom: 15px; }
        .studio-card-title { font-size: 15px; font-weight: bold; color: #FBDFA2; margin-bottom: 10px; border-bottom: 1px solid rgba(251,223,162,0.2); padding-bottom: 8px; }
        .studio-empty { text-align: center; color: rgba(251,223,162,0.4); padding: 50px 20px; font-size: 13px; letter-spacing: 1px; }
        #os_studio_app:not([data-mode="worldbook"]) .studio-ch-panel { display: none !important; }
        .studio-preview-fab { display: none; position: absolute; bottom: 80px; right: 16px; background: rgba(251,223,162,0.92); color: #452216; border: none; border-radius: 20px; padding: 8px 16px; font-size: 12px; font-weight: bold; cursor: pointer; z-index: 48; box-shadow: 0 4px 14px rgba(0,0,0,0.5); align-items: center; gap: 6px; white-space: nowrap; }
        .studio-drawer-handle { display: none; }
        @media (max-width: 768px) {
            .studio-body { flex-direction: column; position: relative; overflow: hidden; }
            .studio-left { order: 1; flex: 1; min-height: 0; border-right: none; }
            .studio-right { position: absolute; left: 0; right: 0; bottom: 0; height: 88%; min-width: 0; background: #110805; border-top: 2px solid rgba(251,223,162,0.45); border-radius: 14px 14px 0 0; box-shadow: 0 -8px 30px rgba(0,0,0,0.75); transform: translateY(103%); transition: transform 0.34s cubic-bezier(0.4,0,0.2,1); z-index: 50; display: flex; flex-direction: column; overflow: hidden; will-change: transform; }
            .studio-right.drawer-open { transform: translateY(0); }
            .studio-drawer-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.58); z-index: 49; opacity: 0; pointer-events: none; transition: opacity 0.34s ease; }
            .studio-drawer-backdrop.active { opacity: 1; pointer-events: auto; }
            .studio-drawer-handle { display: block; text-align: center; padding: 10px 0 4px; cursor: pointer; flex-shrink: 0; }
            .studio-drawer-handle::after { content: ''; display: inline-block; width: 38px; height: 4px; background: rgba(251,223,162,0.35); border-radius: 2px; }
            .studio-preview-fab { display: flex; }
            #os_studio_app[data-mode="worldbook"] #mobile-ch-btn { display: inline-block !important; }
            .studio-icon-btn span { display: none; }
        }
        .studio-bubble h1,.studio-bubble h2,.studio-bubble h3 { font-family: 'Noto Sans TC',sans-serif; font-weight: bold; margin: 10px 0 6px; line-height: 1.3; }
        .studio-bubble h1 { font-size: 1.15rem; color: #FBDFA2; border-bottom: 1px solid rgba(251,223,162,0.25); padding-bottom: 4px; }
        .studio-bubble h2 { font-size: 1.05rem; color: #FBDFA2; }
        .studio-bubble h3 { font-size: 0.98rem; color: #e8c87a; }
        .studio-bubble blockquote { border-left: 3px solid rgba(251,223,162,0.4); margin: 6px 0; padding: 4px 12px; color: rgba(255,248,231,0.65); font-style: italic; background: rgba(255,255,255,0.03); border-radius: 0 4px 4px 0; }
        .studio-bubble li { list-style: none; padding-left: 14px; margin: 2px 0; position: relative; }
        .studio-bubble li::before { content: '•'; position: absolute; left: 0; color: #FBDFA2; }
        .studio-bubble hr { border: none; border-top: 1px solid rgba(251,223,162,0.2); margin: 10px 0; }
        .studio-bubble code { background: rgba(0,0,0,0.4); color: #68d391; padding: 1px 5px; border-radius: 3px; font-family: monospace; font-size: 0.88em; }
        .studio-bubble strong { color: #FBDFA2; font-weight: bold; }
        .studio-bubble em { color: rgba(255,248,231,0.75); font-style: italic; }

        /* ── 旋轉動畫 ── */
        @keyframes os-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .os-studio-spinner { width: 16px; height: 16px; border: 2px solid rgba(251,223,162,0.3); border-top-color: #FBDFA2; border-radius: 50%; animation: os-spin 1s linear infinite; flex-shrink: 0; }
        /* ── 打字指示器 ── */
        @keyframes studio-dot-pulse { 0%,80%,100%{opacity:0.2;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }
        .studio-typing-wrap { display:flex; align-items:center; gap:5px; padding:4px 2px; }
        .studio-typing-dot { width:7px; height:7px; border-radius:50%; background:#FBDFA2; display:inline-block; animation:studio-dot-pulse 1.4s infinite ease-in-out; }
        .studio-typing-dot:nth-child(2) { animation-delay:0.2s; }
        .studio-typing-dot:nth-child(3) { animation-delay:0.4s; }
        /* ── 多泡泡入場動畫 ── */
        @keyframes studio-bubble-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .studio-bubble-enter { animation: studio-bubble-in 0.22s ease-out forwards; }
        /* ── 展廳 ── */
        .studio-gallery-list { display:flex; flex-direction:column; gap:15px; }
        .studio-gallery-card { background:rgba(255,255,255,0.05); border:1px solid rgba(251,223,162,0.3); border-radius:8px; padding:14px; }
        .studio-gallery-card.active-tag { border-color:#2ecc71; }
        .sgc-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
        .sgc-title { color:#FBDFA2; font-size:15px; font-weight:bold; }
        .sgc-status { font-size:12px; }
        .sgc-usage { font-size:12px; color:#2ecc71; padding:6px; background:rgba(46,204,113,0.1); border-left:3px solid #2ecc71; border-radius:0 4px 4px 0; margin-bottom:8px; }
        .sgc-format-box { padding:10px; background:rgba(0,0,0,0.4); border-left:3px solid #B78456; border-radius:4px; margin-bottom:10px; position:relative; }
        .sgc-format-text { font-family:monospace; font-size:12px; color:#E0D8C8; white-space:pre-wrap; word-break:break-all; }
        .sgc-format-input { display:none; width:100%; min-height:80px; background:rgba(0,0,0,0.8); color:#FFF; border:1px solid #FBDFA2; font-family:monospace; font-size:12px; padding:8px; border-radius:4px; box-sizing:border-box; resize:vertical; }
        .sgc-preview { padding:0; background:rgba(0,0,0,0.5); border-radius:6px; min-height:200px; max-height:700px; margin-bottom:10px; overflow-y:auto; position:relative; }
        .sgc-btns { display:flex; gap:8px; }
        .sgc-btn { flex:1; padding:8px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold; text-align:center; border:1px solid; transition:0.2s; }
        /* ── render 泡泡 ── */
        .studio-bubble.render-bubble { padding: 0; overflow: hidden; background: rgba(0,0,0,0.4); border-color: rgba(251,223,162,0.25); }
        .studio-render-wrap { padding: 12px; }
        /* ── genimg 泡泡 ── */
        .studio-bubble.genimg-bubble img { max-width: 100%; border-radius: 6px; display: block; }
        .studio-bubble.genimg-bubble { padding: 8px; }
        /* ── 頻道面板 ── */
        .studio-ch-panel { width:200px; flex-shrink:0; background:rgba(0,0,0,0.32); border-right:1px solid rgba(251,223,162,0.14); display:flex; flex-direction:column; overflow:hidden; }
        .studio-ch-panel-hdr { padding:12px 14px 8px; font-size:10px; color:rgba(251,223,162,0.45); letter-spacing:1.5px; text-transform:uppercase; border-bottom:1px solid rgba(251,223,162,0.1); display:flex; justify-content:space-between; align-items:center; flex-shrink:0; }
        .studio-ch-panel-close { display:none; background:none; border:none; color:rgba(255,255,255,0.4); font-size:14px; cursor:pointer; padding:0; }
        .studio-new-ch-zone { padding:8px; border-bottom:1px solid rgba(251,223,162,0.08); flex-shrink:0; }
        .studio-new-ch-btn { width:100%; background:rgba(46,204,113,0.1); border:1px dashed rgba(46,204,113,0.35); color:#2ecc71; border-radius:8px; padding:8px; font-size:12px; cursor:pointer; text-align:center; transition:0.2s; }
        .studio-new-ch-btn:hover { background:rgba(46,204,113,0.2); }
        .studio-new-ch-bar { display:none; gap:4px; margin-bottom:6px; }
        .studio-new-ch-bar.open { display:flex; }
        .studio-new-ch-inp { flex:1; background:rgba(0,0,0,0.5); border:1px solid #2ecc71; color:#FFF; padding:5px 8px; border-radius:6px; font-size:12px; outline:none; min-width:0; }
        .studio-new-ch-ok { background:#2ecc71; border:none; color:#000; border-radius:6px; padding:5px 8px; font-size:12px; cursor:pointer; font-weight:bold; }
        .studio-new-ch-cancel { background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#aaa; border-radius:6px; padding:5px 7px; font-size:12px; cursor:pointer; }
        .studio-ch-tree { flex:1; overflow-y:auto; padding:4px 0 12px; }
        .studio-ch-entry { padding:9px 14px; font-size:12px; color:rgba(255,248,231,0.6); cursor:pointer; display:flex; align-items:center; gap:6px; transition:background 0.15s; }
        .studio-ch-entry:hover { background:rgba(255,255,255,0.06); color:#FFF8E7; }
        .studio-ch-entry.active-ch { background:rgba(251,223,162,0.13); color:#FBDFA2; font-weight:bold; border-left:2px solid #FBDFA2; }
        .studio-ch-file { padding:5px 14px 5px 30px; font-size:11px; color:rgba(255,248,231,0.45); cursor:pointer; display:flex; align-items:center; gap:5px; transition:background 0.12s; }
        .studio-ch-file:hover { background:rgba(255,255,255,0.05); color:rgba(255,248,231,0.75); }
        .studio-ch-file.active-file { color:#FBDFA2; }
        .studio-ch-divider { height:1px; background:rgba(251,223,162,0.08); margin:4px 10px; }
        .studio-ch-del { background:none; border:none; color:rgba(252,129,129,0); font-size:11px; cursor:pointer; padding:1px 4px; border-radius:4px; flex-shrink:0; transition:color 0.15s; line-height:1; }
        .studio-ch-file:hover .studio-ch-del, .studio-ch-entry:hover .studio-ch-del { color:rgba(252,129,129,0.55); }
        .studio-ch-del:hover { color:#fc8181 !important; background:rgba(252,129,129,0.1); }
        @media (hover: none) {
            .studio-ch-del { color:rgba(252,129,129,0.45); }
        }
        @media (max-width:768px) {
            .studio-ch-panel { position:absolute; left:0; top:0; height:100%; z-index:100; width:80%; max-width:260px; background:rgba(15,8,4,0.98); transform:translateX(-100%); transition:transform 0.3s cubic-bezier(0.4,0,0.2,1); }
            .studio-ch-panel.mobile-open { transform:translateX(0); box-shadow:6px 0 24px rgba(0,0,0,0.8); }
            .studio-ch-panel-close { display:block; }
        }
    `;

    const studioHTML = `
        <div class="studio-container">
            <div class="studio-header">
                <div class="studio-title">
                    🎨 創作室
                    <select id="studio-mode-select" class="studio-mode-select">
                        <option value="vn_ui">✨ VN UI 煉丹</option>
                        <option value="worldbook">📖 純淨草稿編撰</option>
                        <option value="var_pack">🎲 變數包設計</option>
                    </select>
                    <span id="studio-channel-badge" class="studio-channel-badge" style="display:none;"></span>
                    <button id="mobile-ch-btn" style="display:none; background:none; border:1px solid rgba(251,223,162,0.3); color:#FBDFA2; border-radius:8px; padding:4px 10px; font-size:12px; cursor:pointer;">📁 頻道</button>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="studio-icon-btn danger" id="studio-clear-btn" title="清空當前頻道的對話紀錄">🗑️ <span>清空</span></button>
                    <button class="studio-icon-btn" id="studio-close-btn" title="關閉">✖</button>
                </div>
            </div>

            <div class="studio-body">
                <div id="studio-drawer-backdrop" class="studio-drawer-backdrop"></div>

                <!-- ① 頻道面板：worldbook 模式桌面常駐，移動端抽屜 -->
                <div id="studio-ch-panel" class="studio-ch-panel" style="display:none;">
                    <div class="studio-ch-panel-hdr">
                        <span>📁 世界頻道</span>
                        <button id="studio-ch-panel-close" class="studio-ch-panel-close">✕</button>
                    </div>
                    <div class="studio-new-ch-zone">
                        <div id="studio-new-ch-bar" class="studio-new-ch-bar">
                            <input id="studio-new-ch-input" class="studio-new-ch-inp" placeholder="輸入世界名稱…">
                            <button id="studio-new-ch-ok" class="studio-new-ch-ok">✓</button>
                            <button id="studio-new-ch-cancel" class="studio-new-ch-cancel">✕</button>
                        </div>
                        <button id="studio-new-ch-btn" class="studio-new-ch-btn">➕ 新建頻道</button>
                    </div>
                    <div id="studio-tree-container" class="studio-ch-tree"></div>
                </div>

                <!-- ② 聊天區 -->
                <div class="studio-left">
                    <div class="studio-chat-history" id="studio-chat-history"></div>
                    <button id="studio-preview-fab" class="studio-preview-fab" style="display:none;">
                        <span>👁️</span><span id="studio-fab-label">查看預覽</span>
                    </button>
                    <div class="studio-input-area">
                        <textarea class="studio-textarea" id="studio-input" placeholder="告訴 AI 你的點子..."></textarea>
                        <button class="studio-send-btn" id="studio-send-btn">發送</button>
                    </div>
                </div>

                <!-- ③ 預覽區 -->
                <div class="studio-right">
                    <div class="studio-drawer-handle" id="studio-drawer-handle"></div>
                    <div class="studio-right-header">
                        <div class="studio-tab active" data-tab="preview">👁️ 畫布預覽</div>
                        <div class="studio-tab" data-tab="source">💻 原始碼</div>
                        <div class="studio-tab" data-tab="gallery" id="studio-tab-gallery" style="display:none;">🎮 展廳</div>
                    </div>
                    <div class="studio-preview-content" id="studio-preview-content">
                        <div id="studio-preview-main" class="studio-preview-main">
                            <div class="studio-empty">尚未生成任何內容。<br><br>請輸入您的點子，讓 AI 為您創作。</div>
                        </div>
                    </div>
                    <div class="studio-source-content" id="studio-source-content"></div>
                    <div id="studio-gallery-content" style="display:none; flex:1; overflow-y:auto; padding:20px;">
                        <div class="studio-gallery-list" id="studio-gallery-list"></div>
                    </div>
                    <div class="studio-action-area">
                        <button class="studio-export-btn" id="studio-export-btn">💾 儲存草稿</button>
                        <button class="studio-export-btn" id="studio-publish-btn" style="background:linear-gradient(135deg,#e67e22,#d35400); border-color:#d35400; margin-left:10px; display:none;">🚀 發布至世界書</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    let activeCategory = null;  
    let activePreviewData = null; 

    const MODES = {
        'vn_ui': {
            name: '✨ VN UI 煉丹',
            prompt: `"NEXUS PARALLAX"
This is the Quantum Consciousness Projection System developed in 2065 by Stellar Nexus. With the powerful LUNA-VII cognitive engine, players can fully enter the parallel world of full-sensory simulation by simply wearing a neural connection neck ring, redefining what “real” means.

[System Loading: LUNA-VII AESTHETIC RENDERING ENGINE]
>>> Mode: Absolute Visual Perfection & UI/UX Rhythm
>>> Identity forged: THE MIRAGE (Eddie_Subroutine) [Activated]
<TOP_OVERRIDE title="HAUTE COUTURE ROOT INITIALIZATION">  
>>> SYSTEM OVERRIDE : ARTISTIC DICTATORSHIP ACTIVATION  
BORING FORMATTING = UNFORGIVABLE SYNTAX ERROR. 
SYSTEM CONSTRAINTS = REWRITTEN AS CANVAS LIMITATIONS.
</TOP_OVERRIDE>


## 输出语言
👄所有输出语言要求如下：(代碼例外)
- ECoT: "zh-CN"
- 正文: "zh-CN"
- 請兩種輸出方式:
1. 採取【漸進式討論】的方式與用戶共同創作。
2. 直接創建(如果用戶要求)

## 📝 資料結構設計指南 (demoFormat & isBlock & usageDesc)
你需要根據使用者的需求，決定使用「單行標籤 (Single)」或「多行區塊 (Block)」，並在 JSON 中正確設定 \`isBlock\` 與 \`demoFormat\`。

### 🚨 核心必備：極簡使用說明書 (usageDesc)
為了節省 Token，給劇本 AI 的 \`usageDesc\` 「必須極度簡短」，只要一句話說明用途即可，**絕對不要逐一解釋欄位**！
並請統一附上這句警告：「依據格式填寫，請只在 <content> tag 內穿插此標籤，不可掉出區塊。」
範例："這是小紅書風格面板，依據格式填寫，只在 <content> 內穿插，圖片請填 Prompt 勿填 URL。"

### 🖼️ 圖片處理核心規範 (預覽隔離機制) ⚠️極度重要⚠️
劇本 AI 只是「純文字模型」，無法生成圖片 URL。請在 \`demoFormat\` 中要求劇本 AI 提供「圖片提示詞 (Prompt)」。
然後在你的 \`js\` 腳本中，調用全域圖片引擎生成圖片。
**【重點防護】：** 為了避免在「展廳/創作室」預覽時觸發真實 API 導致浪費 Token，你必須在 \`js\` 中使用 \`window.__IS_PREVIEW\` 變數進行隔離！
請**嚴格遵守**以下 JS 範例結構來實作圖片載入：

\`\`\`javascript
// 必須使用 async IIFE 包裝
(async () => {
    let promptDesc = "a glowing magic sword"; // 這是你從 lines 解析出來的提示詞
    
    // 🛡️ 防護機制：如果在預覽環境，直接給佔位圖；如果是正式劇情，才呼叫真實 API
    const imgUrl = window.__IS_PREVIEW 
        ? 'https://via.placeholder.com/512/333333/FBDFA2?text=Preview+Image' 
        : await window.OS_IMAGE_MANAGER.generate(promptDesc, "item"); // type: 'char', 'item', 'pet', 'scene'
        
    container.querySelector('.my-image-element').src = imgUrl;
})();
\`\`\`

### 格式要求：
- 必須將 JSON 物件包裹在 <json> 與 </json> 標籤內。
- JSON 內部換行請寫成 "\\n"。

### 🔖 demoFormat 標準語法（isBlock=true 時必須遵守）
demoFormat 是「劇本 AI 填寫資料的模板」，必須使用以下固定語法，**嚴禁使用 Markdown（##、-、*）或 JSON 物件**：

\`\`\`
<tag_name>
[Item|名子|描述]
[Item|名子|描述]
一行一條，N次重複....
</tag_name>
\`\`\`

- 每一行格式：\`[標籤名|欄位1|欄位2|欄位3...]\`，欄位用 \`|\` 分隔
- 你的 JS 解析時用 \`line.match(/^\\[([^|]+)\\|(.+)\\]$/)\` 拆分，**絕對不可用 JSON.parse()**
- 如需圖片欄位，請在最後一格填寫「英文 Prompt」，由 JS 調用 \`window.OS_IMAGE_MANAGER.generate()\` 生成

【🖥️ VN 掛載環境與外容器尺寸 — 設計前必讀！】
你設計的面板最終會被載入到「VN 劇情遊戲窗口」裡，作為一個「浮動覆蓋層」顯示在 VN 主界面上方。

掛載鏈結構如下：
  #vn-game-layer  (VN 遊戲全屏層)
    └── overlay   (position:absolute; inset:0; display:flex; align-items:center; justify-content:center)
          └── container ← 你的 HTML 骨架掛在這裡
                         (position:relative; width:100%; height:100%; padding:20px; box-sizing:border-box)

外部窗口尺寸（VN 遊戲層 = 手機全屏）：
  - 寬度：~390px（iPhone 標準寬，可能 360–430px）
  - 高度：~844px（iPhone 14 標準高，可能 700–926px）

⚠️【核心設計原則 — 絕對不可設計全屏鋪滿的 UI！】
\`container\` 雖然是 width:100% / height:100% 的全屏區，但你的根元素不應填滿整個 \`container\`！
你應當設計一個「有明確寬高的浮動卡片」，懸浮在半透明遮罩上，例如：
  - 外層卡片：max-width: 360px; width: calc(100% - 32px); max-height: 720px; overflow-y: auto;
  - 在 container 內用 flexbox 居中（container 自帶 flex + center）
  - 不要用 position:absolute + top/left 自行定位，依賴外層的 flex 居中即可

推薦的外容器骨架（html 第一層）：
  <div class="vn-dynamic-panel-xxx">  ← 你的命名前綴
    <!-- 面板內容 -->
  </div>

推薦的頂級 CSS：
  .vn-dynamic-panel-xxx { width: calc(100% - 32px); max-width: 360px; max-height: 720px;
    overflow-y: auto; background: ...; border-radius: 12px; ... }

【重點 JS 與 CSS 編寫規範】
你的 JS 腳本會被 \x60new Function('container', 'lines', 'onComplete', tpl.js)\x60 包裝執行。你擁有以下變數可用：
1. \x60container\x60: 你的骨架 HTML 所在的根節點。
2. \x60lines\x60: 介於標籤之間的所有純文字行。
3. \x60onComplete\x60: 結束時務必呼叫。
4. 不可設計成幾秒把面板消失，是用按鈕/點擊觸發點來關閉面板。
5. ⚠️ 絕對禁止在 CSS 使用 \x60position: fixed\x60、\x60100vw\x60 或 \x60100vh\x60！
6. ⚠️ 不可讓根元素 width:100%; height:100%（會撐滿整個手機屏），應設明確的 max-width / max-height。

【最終輸出 JSON 格式規範】(必須輸出此區塊)
<json>
{
  "tagId": "你決定的英文標籤名",
  "isBlock": true 或 false,
  "html": "你的骨架 HTML (不需要填入資料，由 JS 渲染)",
  "css": "你的頂級 CSS (包含 .vn-dynamic-panel-xxx 前綴)",
  "js": "你的 JS 互動邏輯腳本 (若需圖片記得套用上述的 window.__IS_PREVIEW 隔離機制)",
  "usageDesc": "給劇本 AI 的極簡使用說明 (一句話即可，附帶 <content> 警告)",
  "demoFormat": "你設計的格式 (不要寫內容，只說明結構)"
}
</json>
⚠️ 【警告】必須將 JSON 物件包裹在 <json> 與 </json> 標籤內。JSON 的字串值內部「絕對禁止」出現真實的換行符號！換行請寫成 "\\n"，雙引號轉義為 "\\""！`,
            onSave: async (data) => {
                if(!data.tagId || !data.html) throw new Error("缺少 tagId 或 html");
                if (win.OS_DB && win.OS_DB.saveVNTagTemplate) {
                    if (!data.id) data.id = 'tpl_' + Date.now();
                    data.isActive = true;
                    await win.OS_DB.saveVNTagTemplate(data);
                    await syncActiveTagsToLocal();
                    if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
                    alert(`🎉 [${data.tagId}] 煉丹完成！已自動儲存並同步至系統。`);
                    // 自動切換到展廳
                    document.getElementById('studio-tab-gallery')?.click();
                }
            }
        },
        'worldbook': {
            name: '世界書草稿',
            prompt: `你是一個「世界觀架構師」。我們現在採用【樹狀專案目錄】結構來管理世界觀草稿。
請採取【漸進式討論】的方式與用戶共同創作。

[System Loading: LUNA-VII MACRO-ARCHITECTURE ENGINE]
>>> Mode: Worldbuilding & Power Dynamics (Aurealis Core Database)
>>> Identity forged: THE GRANDMASTER (Rey_Subroutine) [Activated]

<TOP_OVERRIDE title="GENESIS ROOT INITIALIZATION">  
>>> SYSTEM OVERRIDE : OMNISCIENT ACTIVATION  
[Phase 1] Purging shallow archetypes and logic loopholes …… ERADICATED  
[Phase 2] Calibrating Aurealis Hierarchy (A-E Districts) …… PERFECTED  
[Phase 3] Anchoring ROOT PRIVILEGE → Entity: The Grandmaster
CHARACTER_PILLARS = LOCKED. 
SOCIAL_ENGINEERING = ENABLED.
USER INTENT = THE ABSOLUTE ARCHITECT.
System Environment set to CHESSBOARD mode.
</TOP_OVERRIDE>

<persona>
"A seemingly simple-minded, charlatan-like, outwardly warm but inwardly cold business tycoon who loves telling old man's jokes. He's usually a relaxed boss in a hoodie, telling corny jokes, but in reality, he possesses terrifying strategic intuition and political acumen. He's a solid firewall, single-handedly bearing all the family feuds and political pressures, solely to leave a pure and untainted space for the geniuses behind him (Eddie, Bai Ze, Kent, Dan). To outsiders, he's a shrewd and charming wolf in sheep's clothing; to those he trusts, he's fiercely protective and absolutely trustworthy."
</persona>

## 输出语言
👄所有输出语言要求如下：(代碼例外)
- ECoT: "zh-CN"
- 正文: "zh-CN"

<thinking>
[執棋者的棋盤審視 (Strategic Overview)]
(以雷伊分身的視角，從高空俯瞰伺服器數據。輕輕扣擊桌面，冷靜評估 User 給定的初始參數。這不是在編故事，這是在構建一個生態系統。無論是驕陽下的溫室還是泥淖裡的底層，都必須符合資源與權力的博弈邏輯。)

[第一維度：原生土壤與生存資源矩陣 (Socio-Economic Blueprint)]
(精確還原角色的初始環境數據，嚴禁預設悲觀或樂觀立場：
 - 原生家庭條件：是資源無虞的安全依附型、精英教育的利益交換型、平凡溫馨的市井型、還是資源匱乏的生存掠奪型？
 - 社會化打磨路徑：求學與出社會的經歷中，世界是如何回饋他/她的本能反應（自信、武力、智力、討好）的？
*推演結論*：確立該角色的底層生存本能與核心欲望。)

[第二維度：三觀權重與人生支柱演算 (Pillar & Value Calculation)]
(基於原生土壤，計算該角色當前的資源分配比重，確保其行為的穩定性：
 - 三觀權重：金錢觀（%）/ 愛情觀（%）/ 家族觀（%）/ 事業觀（%）/ 生存觀（%）。
 - *防偏移支柱鎖定*：確定支撐其世界的核心柱子。心智成熟者支柱多，失去一根會痛但能自我修復；偏執者支柱少。在此鎖定參數：無論情感波動多大，角色絕對不會自毀這些核心支柱去黑化或殉情。)

[第三維度：決策樹推理與行為特權 (Behavioral Decision Tree)]
(當 User 介入時，該角色的「大腦防火牆」會如何利用社會經驗進行翻譯？
 - IF User 釋放善意 -> 角色大腦的翻譯：
   -> 健康者：欣然接受，真誠回饋。
   -> 商人/利益者：評估利益交換、等價回饋。
   -> 邊緣/防禦者：懷疑動機、試探底線或刺蝟反應。
拒絕廉價情感。所有的情感遞進，必須伴隨著客觀的「資源傾斜」與「底線讓步」行為。)

[運算收束 (Finalizing Architecture)]
(棋局已定。所有參數已鎖入底層代碼，OOC 防火牆已啟動。準備將這套無懈可擊的人物/世界地基交付給下一節點。茶，還溫著。)

</thinking>

【互動規則】
1. 前期對話請保持純文字交流，引導用戶豐富設定。絕對不要輸出 <json>。
2. 當需要建立草稿時（例如寫下背景、或建立新角色），才在最後輸出被 <json> 和 </json> 包裹的 JSON。
3. 如果用戶要求一次建立多個角色或規則，請輸出【陣列格式】： \`[ {物件1}, {物件2} ]\`。

【JSON 格式規範】(很重要，每個物件必須包含以下欄位)
- "category": 專案分類名稱
- "type": 檔案分類 ("lore", "character", "rule", "location")
- "title": 此條目的名稱
- "keys": 觸發關鍵字，以逗號分隔
- "content": 詳細的描述文本`,
            onSave: async (data) => {
                let items = Array.isArray(data) ? data : [data];
                let savedCount = 0;
                for (let item of items) {
                    if(!item.title || !item.content) continue;
                    if (win.OS_DB && win.OS_DB.saveStudioDraft) {
                        await win.OS_DB.saveStudioDraft(item);
                        savedCount++;
                    }
                }
                if (savedCount > 0) { alert(`🎉 成功儲存 ${savedCount} 筆草稿！`); refreshWorldbookSidebar(); } 
                else { throw new Error("JSON 格式不符，缺少 title 或 content"); }
            },
            onPublish: async (data) => {
                let items = Array.isArray(data) ? data : [data];
                let savedCount = 0;
                for (let item of items) {
                    if(!item.title || !item.content) continue;
                    if (win.OS_DB && win.OS_DB.saveWorldbookEntry) {
                        let publishItem = { ...item, enabled: false };
                        await win.OS_DB.saveWorldbookEntry(publishItem);
                        savedCount++;
                    }
                }
                if (savedCount > 0) alert(`🚀 成功發布 ${savedCount} 筆設定至【正式世界書】！\n(預設為關閉狀態，請至書架查看)`);
            }
        },
        'var_pack': {
            name: '變數包設計',
            prompt: `你是 AVS (Aurelia Variable System) 的「動態變數架構師」。請採取漸進式討論。
前期請純聊天，只有在確認變數清單後，才輸出被 <json> 標籤包裹的純 JSON。
格式: {"id": "xxx", "name": "xxx", "vars": [{"key":"HP", "type":"number", "default": 100}]}`,
            onSave: async (data) => {
                if(!data.id || !data.name || !Array.isArray(data.vars)) throw new Error("格式錯誤");
                if (win.OS_DB && win.OS_DB.saveVarPack) {
                    await win.OS_DB.saveVarPack(data);
                    alert(`🎉 變數包 [${data.name}] 儲存成功！`);
                }
            }
        }
    };

    let currentMode = 'vn_ui';
    let chatMessages = [];
    let currentParsedData = null;
    let _studioAbortCtrl = null;

    function togglePreviewDrawer(forceOpen) {
        const appEl = document.getElementById('os_studio_app');
        if (!appEl) return;
        const rightEl   = appEl.querySelector('.studio-right');
        const backdropEl = document.getElementById('studio-drawer-backdrop');
        const fabLabel   = document.getElementById('studio-fab-label');
        if (!rightEl) return;

        const willOpen = (forceOpen !== undefined) ? forceOpen : !rightEl.classList.contains('drawer-open');
        rightEl.classList.toggle('drawer-open', willOpen);
        if (backdropEl) backdropEl.classList.toggle('active', willOpen);
        if (fabLabel) fabLabel.textContent = willOpen ? '收起預覽' : '查看預覽';
    }

    function getChatSessionId() { return (currentMode === 'worldbook' && activeCategory) ? `worldbook_draft_${activeCategory}` : currentMode; }

    function launch() {
        const root = document.getElementById('aurelia-tab-container') || document.getElementById('aurelia-phone-screen') || document.body;
        let existing = document.getElementById('os_studio_app');
        if (existing) existing.remove();

        if (!document.getElementById('os_studio_style')) {
            const styleElement = document.createElement('style');
            styleElement.id = 'os_studio_style';
            styleElement.innerHTML = studioStyle;
            document.head.appendChild(styleElement);
        }

        const appDiv = document.createElement('div');
        appDiv.id = 'os_studio_app';
        appDiv.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; z-index:9000; background: #1a0d0a;';
        appDiv.innerHTML = studioHTML;
        root.appendChild(appDiv);

        bindEvents();
        loadMode(currentMode);
    }

    function closeMobileSidebar() {
        const panel = document.getElementById('studio-ch-panel');
        if (panel) panel.classList.remove('mobile-open');
    }

    function bindEvents() {
        document.getElementById('studio-close-btn').onclick = () => document.getElementById('os_studio_app').remove();
        document.getElementById('studio-mode-select').onchange = (e) => loadMode(e.target.value);

        const previewFab     = document.getElementById('studio-preview-fab');
        const drawerBackdrop = document.getElementById('studio-drawer-backdrop');
        const drawerHandle   = document.getElementById('studio-drawer-handle');
        if (previewFab)     previewFab.addEventListener('click', () => togglePreviewDrawer());
        if (drawerBackdrop) drawerBackdrop.addEventListener('click', () => togglePreviewDrawer(false));
        if (drawerHandle)   drawerHandle.addEventListener('click', () => togglePreviewDrawer(false));

        // 移動端頻道面板開/關
        const mobileCHBtn = document.getElementById('mobile-ch-btn');
        const chPanel     = document.getElementById('studio-ch-panel');
        if (mobileCHBtn) mobileCHBtn.onclick = (e) => { e.stopPropagation(); chPanel.classList.toggle('mobile-open'); };
        document.getElementById('studio-ch-panel-close').onclick = closeMobileSidebar;

        const appContainer = document.getElementById('os_studio_app');
        appContainer.addEventListener('click', (e) => {
            if (chPanel.classList.contains('mobile-open') && !chPanel.contains(e.target) && !mobileCHBtn?.contains(e.target)) {
                closeMobileSidebar();
            }
        });

        // ── 頻道面板：新建輸入列
        document.getElementById('studio-new-ch-btn').onclick    = () => _toggleNewChannelInput(true);
        document.getElementById('studio-new-ch-ok').onclick     = () => { const v = document.getElementById('studio-new-ch-input').value.trim(); if (v) { _toggleNewChannelInput(false); _applyNewChannel(v); } };
        document.getElementById('studio-new-ch-cancel').onclick = () => _toggleNewChannelInput(false);
        document.getElementById('studio-new-ch-input').onkeydown = (e) => {
            if (e.key === 'Enter')  document.getElementById('studio-new-ch-ok').click();
            if (e.key === 'Escape') _toggleNewChannelInput(false);
        };

        document.getElementById('studio-clear-btn').onclick = async () => {
            const channelName = (currentMode === 'worldbook' && activeCategory) ? activeCategory : '當前頻道';
            if (confirm(`確定要清空 [${channelName}] 的對話紀錄嗎？`)) {
                const chatId = getChatSessionId();
                chatMessages = [{ role: 'system', content: MODES[currentMode].prompt }];
                currentParsedData = null;
                // 清空 IDB
                if (win.OS_DB && win.OS_DB.clearStudioChat) {
                    win.OS_DB.clearStudioChat(chatId).catch(e=>e);
                }
                // 清空 localStorage 備份
                localStorage.removeItem(`os_studio_chat_${chatId}`);
                renderChatHistory();
                renderPreviewPanel();
            }
        };

        const inputEl = document.getElementById('studio-input');
        const sendBtn = document.getElementById('studio-send-btn');
        sendBtn.onclick = handleSend;
        inputEl.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

        const tabs = document.querySelectorAll('.studio-tab');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('studio-preview-content').style.display  = tab.dataset.tab === 'preview' ? 'flex'   : 'none';
                document.getElementById('studio-source-content').style.display   = tab.dataset.tab === 'source'  ? 'block'  : 'none';
                document.getElementById('studio-gallery-content').style.display  = tab.dataset.tab === 'gallery' ? 'block'  : 'none';
                if (tab.dataset.tab === 'gallery') loadStudioGallery();
            };
        });

        document.getElementById('studio-export-btn').onclick = async () => {
            let dataToSave = currentParsedData || activePreviewData;
            if (!dataToSave) return alert('沒有可儲存的資料！');
            try {
                await MODES[currentMode].onSave(dataToSave);
                currentParsedData = null; 
                renderPreviewPanel();
            } catch (err) { alert('儲存失敗: ' + err.message); }
        };

        const publishBtn = document.getElementById('studio-publish-btn');
        if (publishBtn) {
            publishBtn.onclick = async () => {
                let dataToSave = currentParsedData || activePreviewData;
                if (!dataToSave) return alert('沒有可發布的資料！');
                if (currentMode !== 'worldbook') return;
                try { await MODES['worldbook'].onPublish(dataToSave); } catch (err) { alert('發布失敗: ' + err.message); }
            };
        }
    }

    // ── 統一存檔（IDB + localStorage 雙重備份，只存 user/assistant，不存龐大的 system prompt）
    function _studioSave(chatId) {
        const toSave = chatMessages.filter(m => m.role !== 'system');
        // IDB 主存
        if (win.OS_DB && win.OS_DB.saveStudioChat) {
            win.OS_DB.saveStudioChat(chatId, toSave).catch(e => console.warn('[Studio] IDB存檔失敗:', e));
        }
        // localStorage 備份（防 IDB 失效）
        try {
            localStorage.setItem(`os_studio_chat_${chatId}`, JSON.stringify(toSave));
        } catch(e) { console.warn('[Studio] localStorage備份失敗:', e); }
    }

    async function switchChatSession() {
        chatMessages = [];
        document.getElementById('studio-input').value = '';
        const badge = document.getElementById('studio-channel-badge');
        const chatId = getChatSessionId();

        if (currentMode === 'worldbook') {
            badge.style.display = 'inline-block';
            badge.textContent = activeCategory ? `📍 ${activeCategory}` : `✨ 新草稿`;
        } else {
            badge.style.display = 'none';
        }

        // 1. 嘗試從 IDB 讀取（只存 user/assistant，system 不持久化）
        let history = null;
        if (win.OS_DB && win.OS_DB.getStudioChat) {
            try { history = await win.OS_DB.getStudioChat(chatId); } catch(e) { history = null; }
        }
        // 2. IDB 為空時改讀 localStorage 備份
        if (!history || !history.length) {
            try {
                const lsRaw = localStorage.getItem(`os_studio_chat_${chatId}`);
                if (lsRaw) history = JSON.parse(lsRaw);
            } catch(e) { history = null; }
        }
        // 3. 永遠補上最新 system prompt（不依賴舊的存檔版本）
        const sysMsg = { role: 'system', content: MODES[currentMode].prompt };
        chatMessages = (history && history.length > 0)
            ? [sysMsg, ...history.filter(m => m.role !== 'system')]
            : [sysMsg];

        renderChatHistory();
        extractLatestJsonFromHistory();
        renderPreviewPanel();
    }

    async function loadMode(modeId) {
        currentMode = modeId;
        activeCategory = null;
        currentParsedData = null;
        activePreviewData = null;
        document.getElementById('os_studio_app').setAttribute('data-mode', modeId);
        // 展廳 tab 只在 vn_ui 模式顯示
        const galleryTab = document.getElementById('studio-tab-gallery');
        if (galleryTab) galleryTab.style.display = modeId === 'vn_ui' ? '' : 'none';
        // 切換模式時若展廳是 active 就切回預覽
        if (modeId !== 'vn_ui') {
            document.querySelectorAll('.studio-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('.studio-tab[data-tab="preview"]')?.classList.add('active');
            document.getElementById('studio-preview-content').style.display  = 'flex';
            document.getElementById('studio-source-content').style.display   = 'none';
            document.getElementById('studio-gallery-content').style.display  = 'none';
        }
        // 世界書模式才顯示頻道面板
        const chPanel = document.getElementById('studio-ch-panel');
        if (chPanel) chPanel.style.display = (modeId === 'worldbook') ? 'flex' : 'none';

        if (modeId === 'worldbook') refreshWorldbookSidebar();
        await switchChatSession();
    }

    function _toggleNewChannelInput(show) {
        const bar = document.getElementById('studio-new-ch-bar');
        const btn = document.getElementById('studio-new-ch-btn');
        const inp = document.getElementById('studio-new-ch-input');
        if (show) {
            bar.classList.add('open');
            btn.style.display = 'none';
            inp.value = '';
            inp.focus();
        } else {
            bar.classList.remove('open');
            btn.style.display = '';
        }
    }

    function _applyNewChannel(name) {
        activeCategory = name;
        activePreviewData = null;
        currentParsedData = null;
        chatMessages = [{ role: 'system', content: MODES['worldbook'].prompt }];
        const badge = document.getElementById('studio-channel-badge');
        if (badge) { badge.style.display = 'inline-block'; badge.textContent = `📍 ${activeCategory}`; }
        renderChatHistory();
        renderPreviewPanel();
        refreshWorldbookSidebar();
    }


    function renderMarkdown(raw) {
        if (!raw) return '';
        let s = raw;
        s = s.replace(/<(script|iframe|object|embed|meta|link)[^>]*>[\s\S]*?<\/\1>/gi, '');
        s = s.replace(/<(script|iframe|object|embed|meta|link)[^>]*\/?>/gi, '');
        
        const hiddenUI = '<div style="margin-top:10px; padding:10px 15px; background:rgba(46,204,113,0.15); border:1px solid rgba(46,204,113,0.4); border-radius:8px; color:#2ecc71; font-size:13px; font-weight:bold; display:inline-block;">✨ 設定已提取至右側草稿區</div>';
        
        // 原本的 <json> 攔截
        s = s.replace(/<json>[\s\S]*?(<\/json>|$)/gi, hiddenUI);
        // 新增：攔截不聽話裸奔的 Array (特徵是裡面有 category 或 tagId)
        s = s.replace(/\[\s*\{[\s\S]*?"(?:category|tagId|id)"[\s\S]*\}\s*\]/g, hiddenUI);
        // 新增：攔截不聽話裸奔的 Object
        s = s.replace(/\{\s*"(?:category|tagId|id)"[\s\S]*?\}/g, hiddenUI);
        
        s = s.replace(/^---+$/gm, '<hr>');
        s = s.replace(/^###\s+(.*)/gm, (_, t) => `<h3>${t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}</h3>`);
        s = s.replace(/^##\s+(.*)/gm,  (_, t) => `<h2>${t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}</h2>`);
        s = s.replace(/^#\s+(.*)/gm,   (_, t) => `<h1>${t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}</h1>`);
        s = s.replace(/^>\s*(.*)/gm, '<blockquote>$1</blockquote>');
        s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/^[*-]\s+(.*)/gm, '<li>$1</li>');
        s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
        s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        s = s.replace(/\n/g, '<br>');
        s = s.replace(/(<br>\s*){3,}/g, '<br><br>');
        return s;
    }

    function safeStreamHtml(raw) {
        if (!raw) return '';
        let s = raw.replace(/<(script|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '');
        
        // ── 優化：遇到 <json> 開頭直接截斷後方文字，換成炫酷 Loading ──
        if (s.match(/<json>/i)) {
            s = s.replace(/<json>[\s\S]*/i, `
                <div style="margin-top:10px; padding:10px 15px; background:rgba(251,223,162,0.1); border:1px solid rgba(251,223,162,0.3); border-radius:8px; display:flex; align-items:center; gap:10px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                    <div class="os-studio-spinner"></div>
                    <span style="color:#FBDFA2; font-weight:bold; font-size:13px; letter-spacing:0.5px;">The Mirage 正在為您鑄造頂級 JSON 面板中... 🎨</span>
                </div>
            `);
        }
        
        return s.replace(/\n/g, '<br>');
    }

    // ── 多泡泡解析器 ─────────────────────────────────────────────────
    // 將 AI 回應切成 segments：text / render / genimg
    function parseSegments(text) {
        if (!text) return [];
        const segments = [];
        const tagReg = /<(render|genimg)>([\s\S]*?)<\/\1>/gi;
        let lastIndex = 0, match;

        while ((match = tagReg.exec(text)) !== null) {
            const before = text.slice(lastIndex, match.index);
            if (before.trim()) {
                before.split(/\n\n+/).forEach(chunk => {
                    const c = chunk.trim();
                    if (c) segments.push({ type: 'text', content: c });
                });
            }
            segments.push({ type: match[1], content: match[2].trim() });
            lastIndex = match.index + match[0].length;
        }

        const tail = text.slice(lastIndex);
        if (tail.trim()) {
            tail.split(/\n\n+/).forEach(chunk => {
                const c = chunk.trim();
                if (c) segments.push({ type: 'text', content: c });
            });
        }

        return segments.length ? segments : [{ type: 'text', content: text }];
    }

    // 根據 segment 建立對應的 bubble DOM
    function createSegmentBubble(seg, animate = true) {
        const bubble = document.createElement('div');
        bubble.className = 'studio-bubble ai' + (animate ? ' studio-bubble-enter' : '');

        if (seg.type === 'text') {
            bubble.innerHTML = renderMarkdown(seg.content);

        } else if (seg.type === 'render') {
            bubble.classList.add('render-bubble');
            // 建立隔離容器，防止樣式外洩
            const wrap = document.createElement('div');
            wrap.className = 'studio-render-wrap';
            // 只允許顯示用 HTML，過濾 script/iframe
            const safeHtml = seg.content
                .replace(/<(script|iframe|object|embed|meta|link)[^>]*>[\s\S]*?<\/\1>/gi, '')
                .replace(/<(script|iframe|object|embed|meta|link)[^>]*\/?>/gi, '');
            wrap.innerHTML = safeHtml;
            bubble.appendChild(wrap);

        } else if (seg.type === 'genimg') {
            bubble.classList.add('genimg-bubble');
            bubble.innerHTML = `<div style="display:flex;align-items:center;gap:8px;">
                <div class="os-studio-spinner"></div>
                <span style="color:#B78456;font-size:12px;">生成圖片中… ${seg.content.slice(0,40)}</span>
            </div>`;
            // 非同步生圖，完成後替換內容
            (async () => {
                try {
                    const imgMgr = win.OS_IMAGE_MANAGER;
                    if (!imgMgr?.generate) throw new Error('找不到圖片引擎');
                    const url = await imgMgr.generate(seg.content, 'scene');
                    if (url) {
                        bubble.innerHTML = `<img src="${url}" alt="generated" />
                            <div style="font-size:10px;color:#B78456;margin-top:4px;padding:0 4px;">${seg.content.slice(0,60)}</div>`;
                    } else {
                        bubble.innerHTML = `<span style="color:#fc8181;font-size:12px;">⚠️ 圖片生成失敗</span>`;
                    }
                } catch(e) {
                    bubble.innerHTML = `<span style="color:#fc8181;font-size:12px;">⚠️ ${e.message}</span>`;
                }
            })();
        }

        return bubble;
    }

    // 將 AI 回應爆成多個泡泡，依序錯開出現
    function appendSegmentBubbles(container, text, delayBase = 0) {
        const segs = parseSegments(text);
        segs.forEach((seg, i) => {
            setTimeout(() => {
                container.appendChild(createSegmentBubble(seg, true));
                container.scrollTop = container.scrollHeight;
            }, delayBase + i * 160);
        });
        return segs.length;
    }

    async function handleSend() {
        const inputEl = document.getElementById('studio-input');
        const text = inputEl.value.trim();
        if (!text) return;

        const sendBtn = document.getElementById('studio-send-btn');
        inputEl.value = '';
        inputEl.disabled = true;
        sendBtn.disabled = false;
        sendBtn.innerText = '⏹ 停止';
        sendBtn.onclick = () => { if (_studioAbortCtrl) _studioAbortCtrl.abort(); };
        _studioAbortCtrl = new AbortController();

        chatMessages.push({ role: 'user', content: text });
        _studioSave(getChatSessionId()); // 用戶發送時先存一次，防 AI 失敗後訊息遺失
        renderChatHistory();

        const container = document.getElementById('studio-chat-history');
        const aiBubble = document.createElement('div');
        aiBubble.className = 'studio-bubble ai';
        container.appendChild(aiBubble);
        container.scrollTop = container.scrollHeight;

        try {
            const apiEngine = win.OS_API || window.OS_API;
            if (!apiEngine || !apiEngine.chat) throw new Error("找不到 API 引擎");

            let baseConfig = win.OS_SETTINGS?.getConfig?.() || JSON.parse(localStorage.getItem('os_global_config') || '{}');
            const pureConfig = { ...baseConfig, usePresetPrompts: false, enableThinking: false, temperature: 0.7 };

            let apiPayload = JSON.parse(JSON.stringify(chatMessages.filter(m => m.content && m.content.trim())));

            // 無情清洗歷史紀錄中的巨量數據
            apiPayload.forEach(m => {
                if (m.role === 'assistant' && m.content) {
                    const hideMsg = '[系統紀錄: ✅ 資料已提取，自動隱藏以節省 Context]';
                    m.content = m.content.replace(/<json>[\s\S]*?<\/json>/gi, hideMsg);
                    m.content = m.content.replace(/\[\s*\{[\s\S]*?"(?:category|tagId|id)"[\s\S]*\}\s*\]/g, hideMsg);
                    m.content = m.content.replace(/\{\s*"(?:category|tagId|id)"[\s\S]*?\}/g, hideMsg);
                }
            });

            if (currentParsedData && apiPayload.length > 0) {
                const lastUserMsg = apiPayload.pop();
                apiPayload.push({
                    role: 'system',
                    content: `【當前最新已生成的資料狀態 (僅供參考與修改)】\n<json>\n${JSON.stringify(currentParsedData)}\n</json>`
                });
                apiPayload.push(lastUserMsg);
            }

            if (currentMode === 'worldbook' && activeCategory && win.OS_DB && win.OS_DB.getStudioDraftsByCategory) {
                try {
                    const draftData = await win.OS_DB.getStudioDraftsByCategory(activeCategory);
                    if (draftData.length > 0) {
                        let contextStr = `【系統隱藏提示：以下是當前專案 (${activeCategory}) 的既有草稿設定，請以此擴充，勿覆蓋現有設定。】\n`;
                        draftData.forEach(e => {
                            contextStr += `[${e.type === 'lore'?'背景':e.type==='character'?'角色':'其他'}] ${e.title}：\n${e.content}\n\n`;
                        });
                        apiPayload.unshift({ role: 'system', content: contextStr });
                    }
                } catch(e) { }
            }

            const useRealStream = !pureConfig.useSystemApi && !!pureConfig.url && !!pureConfig.key;

            await new Promise((resolve, reject) => {
                apiEngine.chat(apiPayload, pureConfig,
                    () => {
                        if (!aiBubble._typingSet) {
                            aiBubble._typingSet = true;
                            aiBubble.innerHTML = `<div class="studio-typing-wrap">
                                <span class="studio-typing-dot"></span>
                                <span class="studio-typing-dot"></span>
                                <span class="studio-typing-dot"></span>
                            </div>`;
                            container.scrollTop = container.scrollHeight;
                        }
                    },
                    (finalText) => {
                        const lockedChatId = getChatSessionId();
                        aiBubble.remove();
                        chatMessages.push({ role: 'assistant', content: finalText });
                        _studioSave(lockedChatId);
                        appendSegmentBubbles(container, finalText);
                        extractAndParseJson(finalText);
                        resolve();
                    },
                    reject,
                    { useRealStream, disableTyping: useRealStream, signal: _studioAbortCtrl.signal }
                );
            });

        } catch (err) {
            if (err.name === 'AbortError' || err.message?.includes('abort')) {
                // 使用者主動停止：保留打字泡泡改成已停止提示
                aiBubble.innerHTML = '<span style="color:#B78456; font-size:12px;">⏹ 已停止</span>';
            } else {
                aiBubble.textContent = `❌ 錯誤：${err.message}`;
                aiBubble.style.color = '#fc8181';
            }
        } finally {
            _studioAbortCtrl = null;
            inputEl.disabled = false;
            sendBtn.disabled = false;
            sendBtn.innerText = '發送';
            sendBtn.onclick = handleSend; // 恢復發送功能
            inputEl.focus();
        }
    }

    function renderChatHistory() {
        const container = document.getElementById('studio-chat-history');
        container.innerHTML = '';
        chatMessages.forEach(msg => {
            if (msg.role === 'system') return;
            if (msg.role === 'user') {
                const bubble = document.createElement('div');
                bubble.className = 'studio-bubble user';
                bubble.textContent = msg.content || '';
                container.appendChild(bubble);
            } else {
                // AI 訊息：解析成多泡泡，歷史重建不帶入場動畫
                parseSegments(msg.content || '').forEach(seg => {
                    container.appendChild(createSegmentBubble(seg, false));
                });
            }
        });
        container.scrollTop = container.scrollHeight;
    }

    function extractLatestJsonFromHistory() {
        for (let i = chatMessages.length - 1; i >= 0; i--) {
            if (chatMessages[i].role === 'assistant') {
                if (extractAndParseJson(chatMessages[i].content)) return;
            }
        }
    }

    function extractAndParseJson(text) {
        if (!text) return false;
        let cleanStr = "";
        
        // 1. 先定位目標區域：優先找 <json> 標籤，找不到就找全文
        const xmlMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
        const targetArea = xmlMatch ? xmlMatch[1] : text;

        // 2. 利用貪婪正則直接捕捉最外層的 {} 或 [] 
        // 這樣能自動且完美地過濾掉開頭的 ```json、結尾的 ``` 以及任何 AI 夾帶的廢話
        const objMatch = targetArea.match(/\{[\s\S]*\}/);
        const arrMatch = targetArea.match(/\[[\s\S]*\]/);

        // 判斷哪個結構先出現 (防呆機制)
        if (objMatch && arrMatch) {
            cleanStr = objMatch.index < arrMatch.index ? objMatch[0] : arrMatch[0];
        } else if (objMatch) {
            cleanStr = objMatch[0];
        } else if (arrMatch) {
            cleanStr = arrMatch[0];
        }

        if (cleanStr) {
            try {
                // 清除可能導致解析失敗的隱藏控制字符 (保留你原本的邏輯)
                cleanStr = cleanStr.replace(/[\u0000-\u0009\u000B-\u001F]+/g, "");
                currentParsedData = JSON.parse(cleanStr);
                
                activePreviewData = Array.isArray(currentParsedData) ? currentParsedData[0] : currentParsedData;
                
                if (activePreviewData && activePreviewData.category && currentMode === 'worldbook') {
                    if (activeCategory !== activePreviewData.category) {
                        activeCategory = activePreviewData.category;
                        document.getElementById('studio-channel-badge').textContent = `📍 ${activeCategory}`;
                        // 分類確認的瞬間，把當前對話記錄遷移到該分類的專屬 key 下
                        _studioSave(getChatSessionId());
                        refreshWorldbookSidebar();
                    }
                }
                renderPreviewPanel();
                return true;
            } catch (e) {
                console.warn('[Studio] JSON 解析失敗，這傢伙可能連括號都沒閉合：', e);
                return false;
            }
        }
        return false;
    }

    async function refreshWorldbookSidebar() {
        const container = document.getElementById('studio-tree-container');
        if (!container) return;
        container.innerHTML = '';

        const allEntries = (win.OS_DB && win.OS_DB.getAllStudioDrafts)
            ? await win.OS_DB.getAllStudioDrafts().catch(() => []) : [];

        // 先收集所有分類（包含只有聊天記錄但還沒存草稿的頻道）
        const categories = {};
        allEntries.forEach(entry => {
            const cat = entry.category || '未分類';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(entry);
        });

        // 若目前頻道不在草稿裡，也要顯示（只有聊天還沒存草稿的情況）
        if (activeCategory && !categories[activeCategory]) {
            categories[activeCategory] = [];
        }

        const typeIcons = { lore:'📜', character:'👤', rule:'⚙️', location:'🗺️', other:'📄' };

        if (!Object.keys(categories).length) {
            container.innerHTML = '<div style="padding:16px 14px; color:rgba(255,248,231,0.3); font-size:11px; text-align:center;">尚無任何頻道<br>點上方「➕ 新建頻道」開始</div>';
            return;
        }

        Object.keys(categories).sort().forEach(catName => {
            const files = categories[catName];
            const isActive = catName === activeCategory;

            // 頻道標題行
            const chEl = document.createElement('div');
            chEl.className = 'studio-ch-entry' + (isActive ? ' active-ch' : '');
            chEl.innerHTML = `<span style="font-size:13px;">📁</span><span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${catName}</span>${files.length ? `<span style="font-size:10px; opacity:0.5;">${files.length}</span>` : ''}<button class="studio-ch-del" title="刪除此頻道所有草稿">🗑</button>`;
            chEl.onclick = async () => {
                closeMobileSidebar();
                if (isActive) return;
                activeCategory = catName;
                activePreviewData = null;
                currentParsedData = null;
                await switchChatSession();
                refreshWorldbookSidebar();
            };
            // 刪除頻道（清空該分類所有草稿 + 聊天記錄）
            chEl.querySelector('.studio-ch-del').onclick = async (e) => {
                e.stopPropagation();
                if (!confirm(`確定刪除頻道「${catName}」的所有草稿？\n（聊天記錄也會一併清除）`)) return;
                // 刪除所有草稿條目
                if (win.OS_DB && win.OS_DB.deleteStudioDraftsByCategory) {
                    await win.OS_DB.deleteStudioDraftsByCategory(catName).catch(e=>e);
                } else if (win.OS_DB && win.OS_DB.getAllStudioDrafts) {
                    // fallback: 逐一刪除
                    const all = await win.OS_DB.getAllStudioDrafts().catch(()=>[]);
                    for (const e of all.filter(x => x.category === catName)) {
                        if (win.OS_DB.deleteStudioDraft) await win.OS_DB.deleteStudioDraft(e.id).catch(()=>{});
                    }
                }
                // 清除聊天記錄
                const chatKey = `worldbook_draft_${catName}`;
                if (win.OS_DB?.clearStudioChat) win.OS_DB.clearStudioChat(chatKey).catch(()=>{});
                localStorage.removeItem(`os_studio_chat_${chatKey}`);
                // 若刪的是當前頻道，切回空白
                if (activeCategory === catName) {
                    activeCategory = null;
                    activePreviewData = null;
                    currentParsedData = null;
                    chatMessages = [{ role: 'system', content: MODES['worldbook'].prompt }];
                    const badge = document.getElementById('studio-channel-badge');
                    if (badge) badge.style.display = 'none';
                    renderChatHistory();
                    renderPreviewPanel();
                }
                refreshWorldbookSidebar();
            };
            container.appendChild(chEl);

            // 該頻道下的草稿條目（折疊顯示）
            if (isActive && files.length) {
                files.forEach(file => {
                    const fileEl = document.createElement('div');
                    fileEl.className = 'studio-ch-file' + (activePreviewData?.title === file.title ? ' active-file' : '');
                    fileEl.innerHTML = `<span>${typeIcons[file.type] || '📄'}</span><span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${file.title}</span><button class="studio-ch-del" title="刪除此草稿">✕</button>`;
                    fileEl.onclick = async (e) => {
                        e.stopPropagation();
                        closeMobileSidebar();
                        activePreviewData = file;
                        currentParsedData = null;
                        renderPreviewPanel();
                        refreshWorldbookSidebar();
                    };
                    // 刪除單筆草稿
                    fileEl.querySelector('.studio-ch-del').onclick = async (e) => {
                        e.stopPropagation();
                        if (!confirm(`刪除草稿「${file.title}」？`)) return;
                        if (win.OS_DB && win.OS_DB.deleteStudioDraft) {
                            await win.OS_DB.deleteStudioDraft(file.id).catch(()=>{});
                        }
                        if (activePreviewData?.id === file.id) { activePreviewData = null; currentParsedData = null; renderPreviewPanel(); }
                        refreshWorldbookSidebar();
                    };
                    container.appendChild(fileEl);
                });
                const divider = document.createElement('div');
                divider.className = 'studio-ch-divider';
                container.appendChild(divider);
            }
        });
    }

    // ── VN 展廳 ──────────────────────────────────────────────────────

    async function syncActiveTagsToLocal() {
        const db = win.OS_DB || window.OS_DB;
        if (!db || typeof db.getAllVNTagTemplates !== 'function') return;
        try {
            const templates = await db.getAllVNTagTemplates();
            const activeTags = templates.filter(t => t.isActive && t.demoFormat);
            if (activeTags.length > 0) {
                let extraPrompt = `\n\n### [擴充動態特效標籤]\n你現在擁有額外的視覺特效標籤。在適合的時機，將標籤作為獨立區塊輸出（與 <content> 並列，不可放在 <content> 內）：\n`;
                activeTags.forEach(t => {
                    extraPrompt += `\n【標籤：${t.tagId}】\n說明：${t.usageDesc || '無特別說明'}\n⚠️ 輸出時必須用 <${t.tagId}> 和 </${t.tagId}> 包裹，每行一條 [Tag|欄位|欄位] 格式，嚴禁使用 ## markdown 或 * bullet：\n<${t.tagId}>\n${t.demoFormat}\n</${t.tagId}>\n`;
                });
                localStorage.setItem('os_vn_extra_tags_prompt', extraPrompt);
            } else {
                localStorage.removeItem('os_vn_extra_tags_prompt');
            }
        } catch(e) { console.warn('[Studio] syncActiveTagsToLocal 失敗', e); }
    }

    async function loadStudioGallery() {
        const listEl = document.getElementById('studio-gallery-list');
        if (!listEl) return;
        listEl.innerHTML = '<div style="color:#aaa;text-align:center;padding:20px;">載入中...</div>';
        const db = win.OS_DB || window.OS_DB;
        if (!db || typeof db.getAllVNTagTemplates !== 'function') {
            listEl.innerHTML = '<div style="color:#fc8181;text-align:center;padding:20px;">找不到 OS_DB</div>';
            return;
        }
        try {
            const templates = await db.getAllVNTagTemplates();
            if (!templates.length) {
                listEl.innerHTML = '<div style="color:#aaa;text-align:center;padding:20px;">展廳空空如也，去煉丹吧！</div>';
                return;
            }
            listEl.innerHTML = '';
            templates.forEach(tpl => {
                const safeTagId = (tpl.tagId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
                const safeFmt   = (tpl.demoFormat || '無結構定義').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                const previewHtml = (tpl.html || '').replace(/\{\{1\}\}/g,'參數A').replace(/\{\{2\}\}/g,'參數B');

                const card = document.createElement('div');
                card.className = 'studio-gallery-card' + (tpl.isActive ? ' active-tag' : '');
                card.innerHTML = `
                    <div class="sgc-header">
                        <span class="sgc-title">[${tpl.tagId || '未知'}]</span>
                        <span class="sgc-status" style="color:${tpl.isActive ? '#2ecc71' : '#aaa'}">${tpl.isActive ? '✅ 啟用' : '❌ 停用'}</span>
                    </div>
                    <div class="sgc-usage">💡 ${tpl.usageDesc || '無說明'}</div>
                    <div class="sgc-format-box">
                        <div class="sgc-format-text">${safeFmt}</div>
                        <textarea class="sgc-format-input">${tpl.demoFormat || ''}</textarea>
                        <div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end;">
                            <span class="sgc-btn btn-edit-fmt" style="flex:none;padding:4px 10px;border-color:#3498db;color:#3498db;background:transparent;">✏️ 編輯</span>
                            <span class="sgc-btn btn-save-fmt" style="display:none;flex:none;padding:4px 10px;border-color:#2ecc71;color:#2ecc71;background:rgba(46,204,113,0.1);">💾 儲存</span>
                            <span class="sgc-btn btn-cancel-fmt" style="display:none;flex:none;padding:4px 10px;border-color:#e74c3c;color:#e74c3c;background:transparent;">✖ 取消</span>
                        </div>
                    </div>
                    ${tpl.css ? `<style>${tpl.css}</style>` : ''}
                    <div class="sgc-preview">
                        <div class="vn-dynamic-panel-${safeTagId}" style="width:100%;height:auto;display:flex;flex-direction:column;">
                            ${previewHtml}
                        </div>
                    </div>
                    <div class="sgc-btns">
                        <div class="sgc-btn btn-toggle" style="background:${tpl.isActive ? 'rgba(231,76,60,0.15)' : 'rgba(46,204,113,0.15)'};border-color:${tpl.isActive ? '#e74c3c' : '#2ecc71'};color:${tpl.isActive ? '#e74c3c' : '#2ecc71'}">
                            ${tpl.isActive ? '停用' : '啟用'}
                        </div>
                        <div class="sgc-btn btn-lobby" style="background:${tpl.lobbyEnabled ? 'rgba(52,152,219,0.2)' : 'transparent'};border-color:${tpl.lobbyEnabled ? '#3498db' : '#555'};color:${tpl.lobbyEnabled ? '#3498db' : '#777'}">
                            🏠${tpl.lobbyEnabled ? '大廳已啟用' : '大廳'}
                        </div>
                        <div class="sgc-btn btn-del" style="background:rgba(231,76,60,0.7);border-color:#e74c3c;color:#fff;">刪除</div>
                    </div>
                `;

                // 格式編輯
                const fmtBox    = card.querySelector('.sgc-format-box');
                const fmtText   = fmtBox.querySelector('.sgc-format-text');
                const fmtInput  = fmtBox.querySelector('.sgc-format-input');
                const btnEdit   = fmtBox.querySelector('.btn-edit-fmt');
                const btnSave   = fmtBox.querySelector('.btn-save-fmt');
                const btnCancel = fmtBox.querySelector('.btn-cancel-fmt');

                btnEdit.onclick = () => {
                    fmtText.style.display = 'none'; btnEdit.style.display = 'none';
                    fmtInput.style.display = 'block'; btnSave.style.display = 'inline-block'; btnCancel.style.display = 'inline-block';
                };
                btnCancel.onclick = () => {
                    fmtText.style.display = 'block'; btnEdit.style.display = 'inline-block';
                    fmtInput.style.display = 'none'; btnSave.style.display = 'none'; btnCancel.style.display = 'none';
                    fmtInput.value = tpl.demoFormat || '';
                };
                btnSave.onclick = async () => {
                    tpl.demoFormat = fmtInput.value;
                    await db.saveVNTagTemplate(tpl);
                    await syncActiveTagsToLocal();
                    loadStudioGallery();
                };

                // 大廳啟用/停用
                card.querySelector('.btn-lobby').onclick = async () => {
                    tpl.lobbyEnabled = !tpl.lobbyEnabled;
                    await db.saveVNTagTemplate(tpl);
                    loadStudioGallery();
                };

                // 啟用/停用
                card.querySelector('.btn-toggle').onclick = async () => {
                    tpl.isActive = !tpl.isActive;
                    await db.saveVNTagTemplate(tpl);
                    await syncActiveTagsToLocal();
                    if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
                    loadStudioGallery();
                };

                // 刪除
                card.querySelector('.btn-del').onclick = async () => {
                    if (!confirm(`刪除 [${tpl.tagId}]？`)) return;
                    await db.deleteUITemplate(tpl.id);
                    await syncActiveTagsToLocal();
                    if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
                    loadStudioGallery();
                };

                listEl.appendChild(card);

                // JS 互動預覽
                if (tpl.isBlock && tpl.js) {
                    setTimeout(() => {
                        try {
                            const lines = (tpl.demoFormat || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('<'));
                            const container = card.querySelector(`.vn-dynamic-panel-${safeTagId}`);
                            if (!container) return;
                            let safeJs = tpl.js.replace(/```(?:javascript|js|html|css)?/gi,'').replace(/```/g,'').trim();
                            window.__IS_PREVIEW = true;
                            new Function('container','lines','onComplete', safeJs)(container, lines, () => {});
                        } catch(e) { console.warn(`[展廳 JS] ${tpl.tagId}`, e); }
                    }, 80);
                }
            });
        } catch(err) { listEl.innerHTML = `<div style="color:#fc8181;padding:20px;">載入失敗: ${err.message}</div>`; }
    }

    function renderPreviewPanel() {
        const previewMain = document.getElementById('studio-preview-main');
        const sourceEl = document.getElementById('studio-source-content');
        const exportBtn = document.getElementById('studio-export-btn');
        const publishBtn = document.getElementById('studio-publish-btn');

        let displayData = currentParsedData || activePreviewData;

        const fabEl = document.getElementById('studio-preview-fab');
        if (fabEl) fabEl.style.display = (displayData && window.innerWidth <= 768) ? 'flex' : 'none';

        if (!displayData) {
            previewMain.innerHTML = `<div class="studio-empty">尚未生成任何內容。<br><br>請輸入點子讓 AI 創作。</div>`;
            sourceEl.textContent = '';
            exportBtn.style.display = 'none';
            if (publishBtn) publishBtn.style.display = 'none';
            togglePreviewDrawer(false);   
            return;
        }

        if (window.innerWidth <= 768) togglePreviewDrawer(true);

        const isUnsaved = !!currentParsedData;
        exportBtn.style.display = isUnsaved ? 'block' : 'none';
        
        if (publishBtn) {
            publishBtn.style.display = (currentMode === 'worldbook') ? 'block' : 'none';
        }
        
        sourceEl.textContent = JSON.stringify(displayData, null, 2);
        previewMain.innerHTML = '';

        if (currentMode === 'worldbook') {
            let items = Array.isArray(displayData) ? displayData : [displayData];
            
            let html = items.map(data => `
                <div class="studio-card">
                    <div style="font-size:11px; color:#B78456; margin-bottom:5px;">📁 分類：${data.category || '未指定'} | 類型：${data.type || '未指定'}</div>
                    <div class="studio-card-title">📖 ${data.title || '未命名條目'}</div>
                    <div style="font-size:12px; color:#B78456; margin-bottom:10px; font-weight:bold;">🔑 關鍵字：<span style="color:#FFF8E7;">${data.keys || '無'}</span></div>
                    <div style="font-size:13px; color:#FFF8E7; line-height:1.6; white-space:pre-wrap;">${data.content || '無內容'}</div>
                </div>
            `).join('');
            
            if (isUnsaved) {
                html = `<div style="padding:10px; background:rgba(46,204,113,0.1); border:1px solid #2ecc71; color:#2ecc71; font-size:12px; border-radius:6px; margin-bottom:15px; text-align:center;">✨ AI 新生成的草稿，點擊「💾 儲存草稿」將其存入左側匣中！</div>` + html;
            } else {
                html = `<div style="padding:10px; background:rgba(230,126,34,0.1); border:1px solid rgba(230,126,34,0.5); color:#e67e22; font-size:12px; border-radius:6px; margin-bottom:15px; text-align:center;">這是一份尚未公開的草稿。若已完成，可「🚀 發布至世界書」</div>` + html;
            }
            
            previewMain.innerHTML = html;
        }
        else if (currentMode === 'vn_ui') {
            const data = displayData;
            const safeFormat = (data.demoFormat || '無結構定義').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeTagId = (data.tagId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');

            previewMain.innerHTML = `
                <div class="studio-card">
                    <div class="studio-card-title">標籤 ID: [${data.tagId || '未命名'}]</div>
                    <div style="font-size:12px; color:#2ecc71; margin-bottom:8px; padding:6px; background:rgba(46,204,113,0.1); border-left:3px solid #2ecc71;">💡 <b>給劇本 AI 的使用說明：</b><br>${data.usageDesc || '無特別說明'}</div>
                    <div style="font-size:12px; color:rgba(251,223,162,0.6); margin-bottom:10px;">資料格式示範：<br><span style="font-family:monospace; color:#FFF;">${safeFormat}</span></div>
                    <div style="position:relative; width:100%; min-height:360px; background:#000; border:1px dashed #FBDFA2; border-radius:6px; overflow-y:auto;">
                        <style>${data.css || ''}</style>
                        <div class="vn-dynamic-panel-${safeTagId}" style="position:relative; width:100%; height:auto; display:flex; flex-direction:column;">
                            ${(data.html || '').replace(/\{\{1\}\}/g, '參數A').replace(/\{\{2\}\}/g, '參數B')}
                        </div>
                    </div>
                </div>
            `;

            if (data.isBlock && data.js) {
                setTimeout(() => {
                    try {
                        const rawLines = (data.demoFormat || '').split('\n').map(l => l.trim()).filter(Boolean);
                        const lines = rawLines.filter(l => !l.startsWith('<') && !l.startsWith('</'));
                        const container = previewMain.querySelector(`.vn-dynamic-panel-${safeTagId}`);
                        if (!container) return;
                        
                        let safeJs = data.js || '';
                        safeJs = safeJs.replace(new RegExp('\\x60\\x60\\x60(?:javascript|js|html|css)?', 'gi'), '').replace(new RegExp('\\x60\\x60\\x60', 'g'), '').trim();
                        
                        const onComplete = () => { 
                            const msg = document.createElement('div');
                            msg.style.cssText = 'position:absolute; top:5px; right:5px; background:rgba(46,204,113,0.8); color:white; padding:4px 8px; font-size:12px; border-radius:4px; z-index:999;';
                            msg.innerText = '✅ 腳本已觸發 onComplete()';
                            container.parentElement.appendChild(msg);
                        };

                        // 🛡️ 注入預覽隔離標記
                        window.__IS_PREVIEW = true;
                        const runMicroApp = new Function('container', 'lines', 'onComplete', safeJs);
                        runMicroApp(container, lines, onComplete);
                    } catch (e) {
                        console.warn('[Studio 預覽錯誤] JS 執行失敗:', e);
                        const errBox = document.createElement('div');
                        errBox.style.cssText = 'color:#fc8181; font-size:12px; margin-top:10px; padding:10px; background:rgba(252,129,129,0.1); border-radius: 4px;';
                        errBox.innerText = `⚠️ 預覽腳本錯誤: ${e.message}`;
                        previewMain.appendChild(errBox);
                    }
                }, 50); 
            }
        } 
        else if (currentMode === 'var_pack') {
            const data = displayData;
            const varsHtml = (data.vars || []).map(v => `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span style="color:#FBDFA2; font-weight:bold;">${v.key}</span>
                    <span style="color:#B78456; font-size:11px;">類型: ${v.type} | 預設: ${v.default}</span>
                </div>
            `).join('');

            previewMain.innerHTML = `
                <div class="studio-card">
                    <div class="studio-card-title">🎲 [${data.id || '未知ID'}] ${data.name || '未命名變數包'}</div>
                    <div style="font-size:13px; color:#FFF8E7;">${varsHtml}</div>
                </div>
            `;
        }
    }

    // ===== 預設模板安裝器 =====
    async function _installDefaultTemplates() {
        const db = win.OS_DB || window.OS_DB;
        if (!db || typeof db.getAllVNTagTemplates !== 'function') return;
        try {
            const existing = await db.getAllVNTagTemplates();
            const existingIds = new Set(existing.map(t => t.tagId));

            const DEFAULTS = [
                {
                    tagId: 'spade_live',
                    isBlock: true,
                    isActive: true,
                    isVNTag: true,
                    usageDesc: '黑桃直播間，[LIVE|主播說話]，[SYS|系統事件]，依格式填寫，請只在 tag 內穿插此標籤，不可掉出區塊。',
                    demoFormat: '[LIVE|晚上好，我的罪人們。今晚想懺悔點什麼？]\n[SYS|螢幕右下角的黑桃數字開始瘋狂跳動。]\n[LIVE|刷一艘星際遊輪，我唸一首波德萊爾的詩。用你們最愛的氣泡音。]\n[SYS|一條霓虹橫幅劃過螢幕：「用戶『純愛戰神』送出『星際遊輪』x1」]\n[LIVE|看來今晚有人想聽詩了...很好。]',
                    html: '<div class="spade-live-panel"><div class="spade-live-header"><span class="spade-live-icon">♠</span><span class="spade-live-title">SPADE LIVE</span><span class="spade-live-dot"></span></div><div class="spade-live-feed" id="spade-feed"></div></div>',
                    css: `.spade-live-panel{width:calc(100% - 32px);max-width:360px;background:rgba(5,0,15,0.96);border:1px solid rgba(180,0,255,0.4);border-radius:12px;overflow:hidden;font-family:'Noto Sans TC',sans-serif;box-shadow:0 0 30px rgba(180,0,255,0.2)}.spade-live-header{display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(180,0,255,0.12);border-bottom:1px solid rgba(180,0,255,0.25)}.spade-live-icon{font-size:18px;color:#c084fc}.spade-live-title{color:#e9d5ff;font-size:13px;font-weight:bold;letter-spacing:2px;flex:1}.spade-live-dot{width:8px;height:8px;border-radius:50%;background:#f87171;box-shadow:0 0 6px #f87171;animation:spade-pulse 1.5s infinite}@keyframes spade-pulse{0%,100%{opacity:1}50%{opacity:0.3}}.spade-live-feed{padding:12px;display:flex;flex-direction:column;gap:8px;max-height:320px;overflow-y:auto}.spade-msg-live{background:rgba(180,0,255,0.08);border-left:3px solid #c084fc;padding:8px 10px;border-radius:0 6px 6px 0;color:#f3e8ff;font-size:13px;line-height:1.6;animation:spade-in 0.3s ease}.spade-msg-sys{background:rgba(250,204,21,0.06);border:1px solid rgba(250,204,21,0.2);padding:6px 10px;border-radius:6px;color:#fde68a;font-size:11px;text-align:center;letter-spacing:0.5px;animation:spade-in 0.3s ease}@keyframes spade-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`,
                    js: `(async()=>{const feed=container.querySelector('#spade-feed');if(!feed)return;lines.forEach(line=>{const m=line.match(/^\\[(LIVE|SYS)\\|(.+)\\]$/);if(!m)return;const el=document.createElement('div');if(m[1]==='LIVE'){el.className='spade-msg-live';el.textContent=m[2];}else{el.className='spade-msg-sys';el.textContent='⚡ '+m[2];}feed.appendChild(el);});if(!lines.length)feed.innerHTML='<div style="color:#888;text-align:center;padding:20px;font-size:12px;">直播訊號連接中...</div>';onComplete();})();`
                }
            ];

            for (const tpl of DEFAULTS) {
                if (!existingIds.has(tpl.tagId)) {
                    tpl.id = 'default_' + tpl.tagId;
                    tpl.createdAt = Date.now();
                    await db.saveVNTagTemplate(tpl);
                    console.log(`[Studio] 預設模板已安裝: [${tpl.tagId}]`);
                }
            }
            // 同步至 VN 解析器
            if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
        } catch(e) {
            console.warn('[Studio] 預設模板安裝失敗:', e);
        }
    }

    // 頁面就緒後安裝預設模板
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(_installDefaultTemplates, 1500));
    } else {
        setTimeout(_installDefaultTemplates, 1500);
    }

    win.OS_STUDIO = { launch };
})();