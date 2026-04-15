// ----------------------------------------------------------------
// [檔案] vn_styles.js
// 路徑：os_phone/vn_story/vn_styles.js
// 職責：VN 播放器 - UI 樣式定義 & HTML 模板
// ⚠️ 此檔案必須在 vn_core.js 之前載入
// ----------------------------------------------------------------
(function () {
    // === CSS 樣式 ===
    const appStyle = `
        /* =========================================
           UI 樣式: SN 混合架構 (Black-Gold UI + Classic VN + Modern Phone + Cyber System)
           ========================================= */
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Noto+Serif+TC:wght@400;700&display=swap');

        :root {
            /* 基礎色彩 */
            --bg-dark: #0a0a0c;
            --text-light: #f5f6fa;
            
            /* 科技系統青/橘 (System & Phone) */
            --cyan: #00d2d3;
            --orange: #e67e22;
            
            /* 古典黑金 (Home, VN, Items, Settings, Chapters) */
            --gold: #d4af37;
            --gold-light: #f3e5ab;
            --gold-dark: #997a00;
            --em-color: #d4af37;
            --glass-border: rgba(212, 175, 55, 0.3);
            
            /* 字體設定 */
            --font-classic: 'Playfair Display', 'Noto Serif TC', serif;
            --font-sans: 'Microsoft JhengHei', -apple-system, sans-serif;
        }

        

        .vn-root { margin: 0; padding: 0; background-color: #000; font-family: var(--font-sans); display: flex; justify-content: center; align-items: center; height: 100%; overflow: hidden; color: var(--text-light); }
        .vn-container { width: 100%; height: 100%; background-color: var(--bg-dark); position: relative; box-shadow: inset 0 0 80px rgba(0,0,0,0.8); display: flex; flex-direction: column; overflow: hidden; user-select: none; -webkit-user-select: none; }
        .page { width: 100%; height: 100%; position: absolute; top: 0; left: 0; box-sizing: border-box; overflow-y: auto; }
        .hidden { display: none !important; }

        /* --- 選單與設置 (黑金高貴風) --- */
        /* --- 主頁背景與裝飾 --- */
#page-home {
    background-color: #050505;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    position: relative;
    overflow: hidden;
    transition: background-image 1.5s ease-in-out;
}
.home-bg-fx {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none;
    background: radial-gradient(circle at center, rgba(26,26,36,0.55) 0%, rgba(5,5,5,0.72) 100%);
}
.glow-orb {
    position: absolute; border-radius: 50%; filter: blur(100px); opacity: 0.15; 
    animation: floatOrb 10s infinite alternate ease-in-out;
}
.glow-orb.gold { width: 400px; height: 400px; background: var(--gold); top: -100px; left: -100px; }
.glow-orb.cyan { width: 300px; height: 300px; background: var(--cyan); bottom: -50px; right: -50px; animation-delay: -5s; }
@keyframes floatOrb { 0% { transform: translate(0, 0); } 100% { transform: translate(50px, 50px); } }

/* 主頁邊框 */
.home-frame {
    position: absolute; top: 20px; left: 20px; right: 20px; bottom: 20px;
    border: 1px solid rgba(212,175,55,0.1); pointer-events: none; z-index: 1;
}
.home-frame .corner { position: absolute; width: 15px; height: 15px; border-color: rgba(212,175,55,0.5); border-style: solid; border-width: 0; }
.home-frame .tl { top: -1px; left: -1px; border-top-width: 2px; border-left-width: 2px; }
.home-frame .tr { top: -1px; right: -1px; border-top-width: 2px; border-right-width: 2px; }
.home-frame .bl { bottom: -1px; left: -1px; border-bottom-width: 2px; border-left-width: 2px; }
.home-frame .br { bottom: -1px; right: -1px; border-bottom-width: 2px; border-right-width: 2px; }


/* --- 選單與設置 (黑金高貴風) --- */
.menu-wrapper { padding: 40px; text-align: center; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; position: relative; z-index: 2; background: transparent; }

.title-group { margin-bottom: 50px; animation: fadeInDown 1s ease-out; }
@keyframes fadeInDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }

h1 { font-family: var(--font-classic); font-size: 4.5rem; color: var(--gold); padding-bottom: 0; margin: 0; text-shadow: 0 0 30px rgba(212,175,55,0.3); letter-spacing: 8px; font-weight: normal; border: none; text-transform: uppercase; }

.subtitle { display: flex; align-items: center; justify-content: center; gap: 15px; margin-top: 15px; }
.subtitle .line { height: 1px; width: 40px; background: rgba(212,175,55,0.4); }
.subtitle .text { color: var(--cyan); letter-spacing: 6px; font-size: 0.85rem; text-transform: uppercase; font-family: var(--font-sans); opacity: 0.8; }

/* 按鈕美化 */
.btn { 
    background: rgba(255,255,255,0.03); backdrop-filter: blur(5px); 
    border: 1px solid rgba(255,255,255,0.1); color: var(--gold); 
    padding: 16px 40px; margin: 10px; font-size: 1.1rem; cursor: pointer; 
    transition: all 0.4s ease; border-radius: 2px; letter-spacing: 4px; 
    font-family: var(--font-classic); text-transform: uppercase;
    width: 300px; max-width: 90%; position: relative; overflow: hidden;
    animation: fadeIn 1s ease-out backwards;
}
.btn:nth-child(2) { animation-delay: 0.2s; }
.btn:nth-child(3) { animation-delay: 0.3s; }
.btn:nth-child(4) { animation-delay: 0.4s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* 按鈕側邊光條動畫 */
.btn::before, .btn::after {
    content: ''; position: absolute; top: 0; bottom: 0; width: 2px; background: var(--gold);
    transform: scaleY(0); transition: transform 0.3s ease;
}
.btn::before { left: 0; transform-origin: top; }
.btn::after { right: 0; transform-origin: bottom; }

.btn:hover { 
    background: rgba(212,175,55,0.1); color: #fff; 
    border-color: rgba(212,175,55,0.4); box-shadow: 0 0 20px rgba(212,175,55,0.2); 
}
.btn:hover::before, .btn:hover::after { transform: scaleY(1); }
.btn:active { transform: scale(0.98); }

/* 針對主按鈕 (Primary) 與動態加入的按鈕 */
.btn.primary, #btn-open-story-extractor { color: var(--cyan); border-color: rgba(0,210,211,0.2); }
.btn.primary::before, .btn.primary::after, #btn-open-story-extractor::before, #btn-open-story-extractor::after { background: var(--cyan); }
.btn.primary:hover, #btn-open-story-extractor:hover { background: rgba(0,210,211,0.1); color: #fff; border-color: rgba(0,210,211,0.4); box-shadow: 0 0 20px rgba(0,210,211,0.2); }

/* 底部版本號 */
.version-text { position: absolute; bottom: 30px; font-size: 0.7rem; color: rgba(255,255,255,0.2); letter-spacing: 4px; font-family: monospace; }
        
        .setting-row { margin-bottom: 20px; text-align: left; width: min(600px, 90%); background: rgba(255,255,255,0.01); padding: 15px; border-radius: 2px; border: 1px solid rgba(212,175,55,0.1); }
        .setting-row label { display:block; margin-bottom:8px; color:var(--gold); font-family: var(--font-classic); letter-spacing: 2px; }
        .setting-row input, .setting-row select { width: 100%; padding: 10px; background: rgba(0,0,0,0.6); border: 1px solid #333; color: var(--text-light); border-radius: 2px; box-sizing:border-box; transition: 0.3s; }
        .setting-row input:focus, .setting-row select:focus, .setting-row textarea:focus { border-color: var(--gold); outline: none; box-shadow: inset 0 0 5px rgba(212,175,55,0.2); }

        /* === 設置頁 Tab === */
        .cfg-tab-wrap { width: min(600px, 100%); box-sizing: border-box; display: flex; flex-direction: column; align-items: stretch; }
        .cfg-tab-bar { display: flex; width: 100%; border-bottom: 1px solid rgba(212,175,55,0.25); margin-bottom: 16px; gap: 0; box-sizing: border-box; }
        .cfg-tab-btn { flex: 1; padding: 9px 4px; background: transparent; border: none; border-bottom: 2px solid transparent; color: #666; font-size: 0.78rem; font-family: var(--font-classic); letter-spacing: 1px; cursor: pointer; transition: 0.2s; text-transform: uppercase; margin-bottom: -1px; }
        .cfg-tab-btn:hover { color: var(--gold-light); }
        .cfg-tab-btn.active { color: var(--gold); border-bottom-color: var(--gold); }
        .cfg-tab-panel { display: none; width: 100%; box-sizing: border-box; }
        .cfg-tab-panel.active { display: block; }
        .cfg-tab-panel .setting-row { width: 100%; box-sizing: border-box; }

        /* === 章節選擇視窗 (黑金古典風) === */
        /* === VN 生成面板 === */
        #vn-gen-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.88); backdrop-filter: blur(12px); z-index: 110; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
        #vn-gen-overlay.active { opacity: 1; pointer-events: auto; }
        #vn-gen-window { width: calc(100% - 30px); max-width: 420px; background: linear-gradient(135deg, #0d0d0d 0%, #050505 100%); border: 1px solid rgba(212,175,55,0.3); border-radius: 2px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.04) inset; display: flex; flex-direction: column; transform: scale(0.97) translateY(12px); opacity: 0; transition: transform 0.35s cubic-bezier(0.2,0.8,0.2,1), opacity 0.35s; margin-top: env(safe-area-inset-top, 0px); }
        body.layout-pad-ios #vn-gen-window { margin-top: 35px; }
        #vn-gen-overlay.active #vn-gen-window { transform: scale(1) translateY(0); opacity: 1; }
        #vn-gen-titlebar { background: rgba(10,10,10,0.9); border-bottom: 1px solid rgba(212,175,55,0.25); padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        #vn-gen-titlebar .gen-title { color: var(--gold); font-family: var(--font-classic); font-size: 1.1rem; letter-spacing: 3px; }
        #vn-gen-titlebar .gen-close { width: 30px; height: 30px; background: transparent; border: 1px solid transparent; color: rgba(212,175,55,0.5); font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.3s; border-radius: 2px; }
        #vn-gen-titlebar .gen-close:hover { color: var(--gold); border-color: var(--gold); }
        /* === VN 生成面板 雙欄 === */
        #vn-gen-window { max-width: 640px; }
        #vn-gen-columns { display: flex; min-height: 0; flex: 1; }
        #vn-gen-body { flex: 1; padding: 16px; display: flex; flex-direction: column; gap: 12px; border-right: 1px solid rgba(212,175,55,0.12); min-width: 0; }
        #vn-gen-card-col { width: 220px; flex-shrink: 0; display: flex; flex-direction: column; padding: 12px 10px 10px; gap: 6px; }
        .vn-gen-col-hd { color: rgba(212,175,55,0.55); font-size: 0.72rem; letter-spacing: 2px; font-family: var(--font-classic); padding-bottom: 6px; border-bottom: 1px solid rgba(212,175,55,0.12); flex-shrink: 0; }
        /* 角色卡欄 */
        #vn-gen-card-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; min-height: 0; }
        .vn-gen-card-item { display: flex; align-items: center; gap: 4px; padding: 7px 9px; background: rgba(255,255,255,0.03); border: 1px solid rgba(212,175,55,0.12); border-radius: 3px; cursor: pointer; transition: background 0.2s, border-color 0.2s; }
        .vn-gen-card-item:hover { background: rgba(212,175,55,0.07); border-color: rgba(212,175,55,0.35); }
        .vn-gen-card-item.selected { background: rgba(212,175,55,0.1); border-color: var(--gold); }
        .vn-gen-card-info { flex: 1; min-width: 0; }
        .vn-gen-card-source { color: rgba(212,175,55,0.6); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.5px; }
        .vn-gen-card-desc { color: rgba(255,255,255,0.45); font-size: 0.72rem; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #vn-gen-card-empty { color: rgba(255,255,255,0.2); font-size: 0.75rem; text-align: center; padding: 20px 4px; line-height: 1.6; }
        #vn-gen-card-dive { flex-shrink: 0; padding: 9px 6px; background: transparent; border: 1px solid rgba(212,175,55,0.3); color: var(--gold); font-size: 0.78rem; letter-spacing: 2px; font-family: var(--font-classic); cursor: pointer; border-radius: 2px; transition: all 0.2s; display: none; margin-top: 4px; }
        #vn-gen-card-dive:hover { background: rgba(212,175,55,0.1); border-color: var(--gold); }
        #vn-gen-card-dive.visible { display: block; }
        #vn-gen-body { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
        #vn-gen-body label { color: var(--gold-light); font-size: 0.8rem; letter-spacing: 1.5px; font-family: var(--font-classic); }
        #vn-gen-request { width: 100%; min-height: 90px; max-height: 180px; padding: 10px 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(212,175,55,0.2); border-radius: 2px; color: var(--text-light); font-size: 0.9rem; font-family: inherit; resize: vertical; box-sizing: border-box; line-height: 1.6; outline: none; transition: border-color 0.3s; }
        #vn-gen-request:focus { border-color: rgba(212,175,55,0.5); }
        #vn-gen-request::placeholder { color: rgba(255,255,255,0.2); }
        #vn-gen-title { width: 100%; padding: 8px 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(212,175,55,0.2); border-radius: 2px; color: var(--text-light); font-size: 0.88rem; font-family: inherit; box-sizing: border-box; outline: none; transition: border-color 0.3s; }
        #vn-gen-title:focus { border-color: rgba(212,175,55,0.5); }
        #vn-gen-title::placeholder { color: rgba(255,255,255,0.2); }
        #vn-gen-submit { padding: 12px; background: transparent; border: 1px solid rgba(212,175,55,0.4); color: var(--gold); font-size: 0.9rem; letter-spacing: 2px; font-family: var(--font-classic); cursor: pointer; border-radius: 2px; transition: all 0.3s; position: relative; overflow: hidden; }
        #vn-gen-submit:hover:not(:disabled) { background: rgba(212,175,55,0.1); border-color: var(--gold); }
        #vn-gen-submit:disabled { opacity: 0.4; cursor: not-allowed; }
        #vn-gen-status { padding: 10px 18px 16px; font-size: 0.82rem; color: rgba(255,255,255,0.45); text-align: center; letter-spacing: 1px; min-height: 36px; }
        #vn-gen-status.err { color: #ff6b6b; }
        #vn-gen-status.ok { color: #69db7c; }
        .gen-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(212,175,55,0.3); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 6px; vertical-align: middle; }
        @keyframes spin { to { transform: rotate(360deg); } }
        #vn-gen-presets-wrap { border-top: 1px solid rgba(212,175,55,0.12); padding-top: 10px; }
        .vn-gen-presets-hd { display: flex; justify-content: space-between; align-items: center; color: rgba(212,175,55,0.5); font-size: 0.75rem; letter-spacing: 1.5px; margin-bottom: 8px; }
        #vn-gen-presets-count { color: rgba(255,255,255,0.25); font-size: 0.72rem; }
        #vn-gen-presets { display: flex; flex-direction: column; gap: 6px; max-height: 160px; overflow-y: auto; }
        #vn-gen-presets:empty::after { content: '尚無儲存的開場白'; color: rgba(255,255,255,0.2); font-size: 0.78rem; display: block; text-align: center; padding: 10px 0; }
        .vn-gen-preset-item { display: flex; align-items: center; gap: 0; background: rgba(212,175,55,0.04); border: 1px solid rgba(212,175,55,0.15); border-radius: 2px; overflow: hidden; transition: border-color 0.2s; }
        .vn-gen-preset-item:hover { border-color: rgba(212,175,55,0.35); }
        .vn-gen-preset-load { flex: 1; padding: 8px 10px; color: var(--text-light); font-size: 0.82rem; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .vn-gen-preset-load:hover { color: var(--gold); }
        .vn-gen-preset-del { padding: 8px 10px; color: rgba(255,255,255,0.2); font-size: 0.8rem; cursor: pointer; border-left: 1px solid rgba(212,175,55,0.12); flex-shrink: 0; transition: color 0.2s; }
        .vn-gen-preset-del:hover { color: #ff6b6b; }

        /* === 選擇按鈕 (獨立模式) === */
        #vn-choice-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.55); backdrop-filter: blur(2px); z-index: 80; display: none; flex-direction: column; justify-content: center; align-items: center; gap: 10px; padding: 24px 16px; box-sizing: border-box; }
        #vn-choice-overlay.active { display: flex; }
        .vn-choice-btn { width: 92%; max-width: 400px; padding: 13px 20px; background: rgba(10,8,4,0.85); border: 1px solid rgba(212,175,55,0.35); color: #d4af37; font-family: var(--font-classic); font-size: 0.88rem; letter-spacing: 1.5px; cursor: pointer; border-radius: 2px; transition: all 0.22s; text-align: center; }
        .vn-choice-btn:hover { background: rgba(212,175,55,0.15); border-color: #d4af37; transform: translateY(-2px); box-shadow: 0 4px 16px rgba(212,175,55,0.15); }
        .vn-choice-btn:active { transform: translateY(0); }
        .vn-choice-btn.custom { border-style: dashed; color: rgba(212,175,55,0.55); font-size: 0.82rem; letter-spacing: 1px; }
        .vn-choice-btn.custom:hover { color: #d4af37; border-style: solid; }
        #vn-choice-input-row { width: 92%; max-width: 400px; display: none; gap: 8px; }
        #vn-choice-input-row.active { display: flex; }
        #vn-choice-custom-input { flex: 1; padding: 10px 12px; background: rgba(10,8,4,0.9); border: 1px solid rgba(212,175,55,0.4); border-radius: 2px; color: #e8dfc8; font-size: 0.88rem; font-family: inherit; outline: none; }
        #vn-choice-custom-input:focus { border-color: #d4af37; }
        #vn-choice-custom-submit { padding: 10px 16px; background: rgba(212,175,55,0.12); border: 1px solid rgba(212,175,55,0.5); color: #d4af37; font-size: 0.82rem; letter-spacing: 1px; cursor: pointer; border-radius: 2px; white-space: nowrap; transition: all 0.2s; }
        #vn-choice-custom-submit:hover { background: rgba(212,175,55,0.25); }

        #chapter-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); backdrop-filter: blur(10px); z-index: 100; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.4s ease; }
        #chapter-overlay.active { opacity: 1; pointer-events: auto; }
        #chapter-window { width: calc(100% - 30px); max-width: 410px; max-height: calc(100% - 40px); background: linear-gradient(135deg, #111 0%, #050505 100%); border: 1px solid var(--glass-border); border-radius: 2px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.05) inset; display: flex; flex-direction: column; transform: scale(0.98) translateY(10px); opacity: 0; transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s; margin-top: env(safe-area-inset-top, 0px); }
        body.layout-pad-ios #chapter-window { margin-top: 35px; }
        #chapter-overlay.active #chapter-window { transform: scale(1) translateY(0); opacity: 1; }
        #chapter-titlebar { background: rgba(10,10,10,0.8); border-bottom: 1px solid var(--gold-dark); padding: 15px 20px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        #chapter-titlebar .ch-title { color: var(--gold); font-family: var(--font-classic); font-size: 1.2rem; letter-spacing: 4px; }
        #chapter-titlebar .ch-close { width: 32px; height: 32px; background: transparent; border: 1px solid transparent; color: var(--gold-dark); font-size: 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.3s; }
        #chapter-titlebar .ch-close:hover { color: var(--gold); border-color: var(--gold); }
        #chapter-subheader { padding: 10px 20px; background: rgba(0,0,0,0.6); border-bottom: 1px dotted rgba(212,175,55,0.2); color: var(--gold-light); font-size: 0.8rem; letter-spacing: 1px; font-family: var(--font-classic); }
        #chapter-list-wrap { background: transparent; margin: 10px; overflow-y: auto; flex: 1; min-height: 150px; padding-right: 5px; }
        #chapter-list-wrap::-webkit-scrollbar { width: 4px; }
        #chapter-list-wrap::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        #chapter-list-wrap::-webkit-scrollbar-thumb { background: var(--gold-dark); }
        .ch-item { background: rgba(255,255,255,0.02); margin: 8px 0; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: all 0.3s; border: 1px solid rgba(255,255,255,0.03); border-left: 2px solid transparent; }
        .ch-item:hover { background: rgba(212,175,55,0.05); border-color: rgba(212,175,55,0.2); border-left: 2px solid var(--gold); transform: translateX(3px); }
        .ch-item.tavern-parse { background: rgba(212,175,55,0.03); border: 1px solid rgba(212,175,55,0.15); }
        .ch-item.tavern-parse:hover { background: rgba(212,175,55,0.1); border-color: var(--gold); }
        .ch-name { color: #d0c8b8; font-size: 0.95rem; display: flex; align-items: center; gap: 10px; font-family: var(--font-classic); }
        .ch-item.tavern-parse .ch-name { color: var(--gold-light); }
        .ch-name::before { content: '✧'; color: var(--gold-dark); font-size: 0.8rem; }
        .ch-num { color: #666; font-size: 0.8rem; font-family: monospace; background: rgba(0,0,0,0.5); padding: 3px 8px; border: 1px solid #222; }
        .ch-item:hover .ch-num { color: var(--gold); border-color: var(--gold-dark); }
        .ch-msgid { color: #444; font-size: 0.72rem; font-family: monospace; margin-left: 8px; }
        .ch-item:hover .ch-msgid { color: #888; }

        /* --- 章節面板：故事資料夾標題列 --- */
        .ch-story-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px 6px; margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.06); cursor: pointer; transition: background 0.2s; user-select: none; border-radius: 4px; }
        .ch-story-header:first-child { margin-top: 0; border-top: none; }
        .ch-story-header:hover { background: rgba(212,175,55,0.04); }
        .ch-story-header.active .ch-story-title { color: var(--gold); }
        .ch-story-header.active .ch-story-arrow { color: var(--gold-dark); }
        .ch-story-arrow { font-size: 0.65rem; color: #555; width: 12px; flex-shrink: 0; }
        .ch-story-title { flex: 1; font-size: 0.8rem; color: #888; letter-spacing: 0.5px; font-family: var(--font-classic); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ch-story-meta { font-size: 0.65rem; color: #444; white-space: nowrap; flex-shrink: 0; }
        .ch-story-del { background: none; border: none; color: #555; font-size: 0.85rem; cursor: pointer; padding: 2px 6px; flex-shrink: 0; opacity: 0; transition: opacity 0.2s, color 0.2s; line-height: 1; }
        .ch-story-header:hover .ch-story-del { opacity: 1; }
        .ch-story-del:hover { color: #e06060; }
        .ch-story-body { padding-left: 8px; }

        /* --- 角色快取管理面板 (正方形黑金頭像) --- */
        #avatar-mgr-wrap { width: 100%; }
        #avatar-mgr-list { margin-top: 10px; max-height: 340px; overflow-y: auto; padding-right: 5px; }
        .avatar-mgr-item { width: 100%; box-sizing: border-box; display: flex; gap: 12px; align-items: flex-start; padding: 12px; background: rgba(0,0,0,0.4); margin-bottom: 8px; border: 1px solid rgba(212,175,55,0.1); transition: 0.3s; border-radius: 2px; }
        .avatar-preview { width: 60px; height: 60px; object-fit: cover; border: 1px solid var(--gold-dark); background: #050505; padding: 2px; border-radius: 0; }
        .avatar-mgr-name { color: var(--gold); font-family: var(--font-classic); font-size: 1rem; margin-bottom: 6px; letter-spacing: 1px; }
        .avatar-mgr-prompt { width: 100%; background: rgba(0,0,0,0.8); border: 1px solid #333; color: #aaa; font-size: 0.8rem; padding: 8px; border-radius: 2px; resize: vertical; min-height: 52px; font-family: monospace; transition: 0.3s; }
        .avatar-mgr-prompt:focus { outline: none; border-color: var(--gold-dark); }
        .avatar-regen-btn, .avatar-del-btn { background: transparent; border: 1px solid #444; color: #888; padding: 6px 12px; font-size: 0.8rem; cursor: pointer; border-radius: 2px; transition: all 0.3s; font-family: var(--font-classic); }
        .avatar-regen-btn:hover { border-color: var(--gold); color: var(--gold); }
        .avatar-del-btn:hover { border-color: #a33; color: #a33; }

        /* --- 返回主頁與設定按鈕 (乾淨無括號, 黑金風格) --- */
        #btn-home, #btn-settings, #btn-reader { position: absolute; z-index: 15; background: rgba(10,10,12,0.6); backdrop-filter: blur(5px); border: 1px solid rgba(212,175,55,0.3); color: var(--gold-dark); padding: 8px 16px; cursor: pointer; font-size: 0.85rem; transition: all 0.3s; font-family: var(--font-classic); letter-spacing: 1px; border-radius: 2px; text-transform: uppercase; }
        #btn-home { top: calc(20px + env(safe-area-inset-top, 0px)); right: 20px; }
        #btn-settings { top: calc(20px + env(safe-area-inset-top, 0px)); right: 100px; }
        #btn-reader { top: calc(20px + env(safe-area-inset-top, 0px)); right: 178px; padding: 8px 12px; }
        body.layout-pad-ios #btn-home,
        body.layout-pad-ios #btn-settings,
        body.layout-pad-ios #btn-reader { top: 55px; }
        #btn-home:hover, #btn-settings:hover, #btn-reader:hover { border-color: var(--gold); color: var(--gold); background: rgba(0,0,0,0.8); box-shadow: 0 0 10px rgba(212,175,55,0.2); }

        /* 📖 閱讀器泡泡 — 思考摺疊塊（ST 風格） */
        .vn-reader-think-wrap { max-width: 88%; margin-bottom: 6px; }
        .vn-reader-think-hd { display: flex; align-items: center; gap: 6px; padding: 5px 12px; background: rgba(80,80,160,0.08); border: 1px solid rgba(100,100,200,0.18); border-radius: 6px; cursor: pointer; font-size: 0.74rem; color: #5a5a90; transition: background 0.2s; user-select: none; }
        .vn-reader-think-hd:hover { background: rgba(80,80,160,0.15); }
        .rth-arrow { font-size: 0.55rem; transition: transform 0.22s; display: inline-block; }
        .vn-reader-think-wrap.open .rth-arrow { transform: rotate(90deg); }
        .vn-reader-think-wrap.open .vn-reader-think-hd { border-radius: 6px 6px 0 0; }
        .vn-reader-think-body { display: none; padding: 10px 14px; background: rgba(10,10,30,0.7); border: 1px solid rgba(100,100,200,0.12); border-top: none; border-radius: 0 0 6px 6px; font-size: 0.72rem; color: #5a5a8a; line-height: 1.75; white-space: pre-wrap; word-break: break-word; max-height: 280px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #1e1e3a transparent; }
        .vn-reader-think-wrap.open .vn-reader-think-body { display: block; }

        /* 📖 劇情閱讀器 */
        #vn-reader-overlay { position: absolute; inset: 0; background: rgba(6,6,10,0.98); z-index: 70; display: none; flex-direction: column; }
        #vn-reader-overlay.active { display: flex; }
        #vn-reader-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid rgba(212,175,55,0.2); flex-shrink: 0; }
        #vn-reader-title { color: var(--gold); font-family: var(--font-classic); font-size: 1rem; letter-spacing: 2px; }
        #vn-reader-close { color: #666; font-size: 1.6rem; cursor: pointer; transition: color 0.2s; }
        #vn-reader-close:hover { color: var(--gold); }
        #vn-reader-body { flex: 1; overflow-y: auto; padding: 16px 14px; display: flex; flex-direction: column; gap: 16px; scrollbar-width: thin; scrollbar-color: #222 transparent; }
        #vn-reader-body::-webkit-scrollbar { width: 4px; }
        #vn-reader-body::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }

        /* 對話泡泡 */
        .vn-reader-msg { display: flex; flex-direction: column; gap: 4px; }
        .vn-reader-msg.user { align-items: flex-end; }
        .vn-reader-msg.ai   { align-items: flex-start; }
        .vn-reader-label { font-size: 0.7rem; color: #444; letter-spacing: 1px; padding: 0 6px; }
        .vn-reader-bubble { max-width: 88%; padding: 10px 14px; border-radius: 12px; font-size: 0.85rem; line-height: 1.8; word-break: break-word; }
        .vn-reader-bubble p { margin: 0 0 0.6em; }
        .vn-reader-bubble p:last-child { margin-bottom: 0; }
        .vn-reader-msg.user .vn-reader-bubble { background: rgba(60,100,180,0.25); border: 1px solid rgba(80,120,220,0.3); color: #a0b8f0; border-radius: 12px 12px 2px 12px; }
        .vn-reader-msg.ai   .vn-reader-bubble { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); color: #c8c0b0; border-radius: 12px 12px 12px 2px; }
        .vn-reader-actions { display: flex; gap: 6px; margin-top: 4px; padding: 0 4px; }
        .vn-reader-act-btn { font-size: 0.7rem; color: #333; border: 1px solid #222; background: transparent; padding: 2px 8px; border-radius: 3px; cursor: pointer; transition: all 0.2s; }
        .vn-reader-act-btn:hover { color: #888; border-color: #444; }
        .vn-reader-act-btn.active { color: var(--gold); border-color: rgba(212,175,55,0.4); }
        .vn-reader-extra { display: none; margin-top: 6px; padding: 10px 14px; max-width: 88%; background: rgba(0,0,0,0.4); border-left: 2px solid #222; border-radius: 0 6px 6px 0; font-size: 0.75rem; color: #555; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
        .vn-reader-extra.active { display: block; }
        .vn-reader-extra.think { border-left-color: rgba(100,100,200,0.4); color: #5a5a8a; }
        .vn-reader-extra.raw   { border-left-color: rgba(212,175,55,0.2); color: #5a5030; }
        .vn-reader-divider { text-align: center; font-size: 0.65rem; color: #222; letter-spacing: 2px; padding: 4px 0; }
        .vn-reader-loading { text-align: center; color: #333; font-size: 0.82rem; padding: 40px; }

        /* 💭 思考鏈小窗 */
        #vn-think-popup { position: absolute; bottom: 90px; right: 10px; width: min(340px, 90vw); max-height: 260px; background: rgba(8,8,20,0.96); border: 1px solid rgba(100,100,200,0.25); border-radius: 8px; display: flex; flex-direction: column; z-index: 30; opacity: 0; pointer-events: none; transform: translateY(6px); transition: opacity 0.2s, transform 0.2s; }
        #vn-think-popup.active { opacity: 1; pointer-events: auto; transform: translateY(0); }
        #vn-think-popup-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(100,100,200,0.12); flex-shrink: 0; }
        #vn-think-popup-title { font-size: 0.72rem; color: #5a5a90; letter-spacing: 1px; }
        #vn-think-popup-close { font-size: 14px; color: #444; cursor: pointer; line-height: 1; }
        #vn-think-popup-close:hover { color: #888; }
        #vn-think-popup-body { overflow-y: auto; padding: 10px 12px; font-size: 0.72rem; color: #5a5a8a; line-height: 1.75; white-space: pre-wrap; word-break: break-word; scrollbar-width: thin; scrollbar-color: #1e1e3a transparent; }
        .think-empty-msg { color: #333; text-align: center; padding: 20px 0; }

        /* 📖 閱讀器 — 故事分頁 Tab */
        #vn-reader-tabs { flex-shrink: 0; display: flex; gap: 2px; padding: 8px 14px 0; overflow-x: auto; border-bottom: 1px solid rgba(255,255,255,0.05); scrollbar-width: none; }
        #vn-reader-tabs::-webkit-scrollbar { display: none; }
        .vn-reader-tab { font-size: 0.72rem; color: #555; padding: 5px 14px; border-radius: 4px 4px 0 0; cursor: pointer; white-space: nowrap; transition: all 0.2s; border: 1px solid transparent; border-bottom: none; user-select: none; }
        .vn-reader-tab:hover { color: #888; background: rgba(255,255,255,0.03); }
        .vn-reader-tab.active { color: var(--gold); background: rgba(212,175,55,0.06); border-color: rgba(212,175,55,0.15); }

        /* --- 對話框彈入動態 --- */
        @keyframes dialogueIn { from { transform: translateY(15px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        #text-panel.anim { animation: dialogueIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both; }

        /* =========================================
           場景與立繪 (正方形黑金畫框)
           ========================================= */
        /* 遊戲頁面：子元素全為 absolute，不需要捲動，強制關閉滾動條 */
        #page-game { overflow: hidden; }

        #game-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: #050505; background-size: cover; background-position: center; transition: background-image 0.8s ease; z-index: 1; }
        #game-char-container { position: absolute; bottom: 0; left: 0; width: 100%; height: 85%; display: flex; justify-content: center; align-items: flex-end; z-index: 2; pointer-events: none; }
        #game-char { height: 95%; object-fit: contain; transition: opacity 0.4s ease; display: none; filter: drop-shadow(0 0 20px rgba(0,0,0,0.8)); }

        /* 🎬 場景CG overlay（人物+場景合圖，z-index 5 = sprites之上、text-panel之下）*/
        #scene-cg-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 5; display: none; background: #000; align-items: center; justify-content: center; }
        #scene-cg-overlay.active { display: flex; animation: sceneCgIn 0.5s ease both; }
        #scene-cg-overlay img { width: 100%; height: 100%; object-fit: contain; }
        @keyframes sceneCgIn { from { opacity: 0; transform: scale(1.03); } to { opacity: 1; transform: scale(1); } }
        
        #char-portrait {
            position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%);
            width: 320px; height: 320px; object-fit: cover; object-position: center top;
            border-radius: 0; border: 2px solid var(--gold); padding: 8px;
            background: rgba(5,5,5,0.8);
            box-shadow: 0 20px 50px rgba(0,0,0,0.9),
                        0 0 0 1px rgba(212,175,55,0.15),
                        0 0 20px rgba(212,175,55,0.25),
                        inset 0 0 0 1px rgba(212,175,55,0.1);
            display: none; opacity: 0; z-index: 9;
            transition: opacity 0.18s ease;
        }
        /* 最終 Fallback 剪影立繪 — 不套頭像框，當成普通立繪顯示 */
        #char-portrait.no-frame {
            border: none !important; padding: 0 !important;
            background: transparent !important; box-shadow: none !important;
            width: 55% !important; max-width: 380px !important;
            height: auto !important; max-height: 72% !important;
            top: 42% !important;
            object-fit: contain; object-position: center bottom;
        }

        /* =========================================
           🎭 動畫特效 (Surprised / JumpScare)
           ========================================= */
        /* 一般立繪 (game-char) */
        @keyframes anim-sprite-shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
            20%, 40%, 60%, 80% { transform: translateX(8px); }
        }
        .sprite-shake { animation: anim-sprite-shake 0.4s ease-in-out; }

        @keyframes anim-sprite-jumpscare {
            0%   { transform: scale(1) translateY(0); filter: brightness(1); }
            10%  { transform: scale(1.15) translateY(-20px); filter: brightness(1.2) contrast(1.1); }
            20%  { transform: scale(1.15) translate(-10px, -15px); }
            30%  { transform: scale(1.15) translate(10px, -20px); }
            40%  { transform: scale(1.15) translate(-10px, -25px); }
            100% { transform: scale(1) translateY(0); filter: brightness(1); }
        }
        .sprite-jumpscare { animation: anim-sprite-jumpscare 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }

        /* 方形頭像 (char-portrait) - 注意原本有 translate(-50%, -50%) 的中心定位 */
        @keyframes anim-portrait-shake {
            0%, 100% { transform: translate(-50%, -50%); }
            10%, 30%, 50%, 70%, 90% { transform: translate(calc(-50% - 8px), -50%); }
            20%, 40%, 60%, 80% { transform: translate(calc(-50% + 8px), -50%); }
        }
        .portrait-shake { animation: anim-portrait-shake 0.4s ease-in-out; }

        @keyframes anim-portrait-jumpscare {
            0%   { transform: translate(-50%, -50%) scale(1); filter: brightness(1); }
            10%  { transform: translate(-50%, -50%) scale(1.15); filter: brightness(1.2) contrast(1.1); box-shadow: 0 0 60px rgba(255,255,255,0.4); }
            20%  { transform: translate(calc(-50% - 10px), calc(-50% + 10px)) scale(1.15); }
            30%  { transform: translate(calc(-50% + 10px), calc(-50% - 10px)) scale(1.15); }
            40%  { transform: translate(calc(-50% - 10px), calc(-50% - 10px)) scale(1.15); }
            100% { transform: translate(-50%, -50%) scale(1); filter: brightness(1); box-shadow: 0 20px 50px rgba(0,0,0,0.9); }
        }
        .portrait-jumpscare { animation: anim-portrait-jumpscare 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }
        
        #top-badge {
            position: absolute; top: calc(18px + env(safe-area-inset-top, 0px)); left: 18px; z-index: 10;
            border: none; box-shadow: none; border-radius: 0;
            /* 水平漸隱黑遮罩條 — 左右邊緣透明消散，無硬邊框 */
            background: linear-gradient(to right,
                transparent 0%,
                rgba(0,0,0,0.55) 12%,
                rgba(0,0,0,0.55) 88%,
                transparent 100%);
            color: #f0e8d0; display: none;
            padding: 7px 32px;
            font-weight: 700; font-size: 0.95rem; letter-spacing: 2.5px; line-height: 1.5;
            text-shadow:
                0 0 4px  rgba(0,0,0,1),
                0 0 10px rgba(0,0,0,0.9),
                 1px  1px 0 rgba(0,0,0,0.9),
                -1px -1px 0 rgba(0,0,0,0.9),
                 1px -1px 0 rgba(0,0,0,0.9),
                -1px  1px 0 rgba(0,0,0,0.9);
        }
        body.layout-pad-ios #top-badge { top: 55px; }
        #top-badge::before {
            content: '';
            display: inline-block; vertical-align: middle;
            width: 16px; height: 1px;
            background: linear-gradient(to right, transparent, #c8a96e);
            margin-right: 10px; margin-bottom: 2px;
        }
        #top-badge::after {
            content: '';
            display: inline-block; vertical-align: middle;
            width: 16px; height: 1px;
            background: linear-gradient(to left, transparent, #c8a96e);
            margin-left: 10px; margin-bottom: 2px;
        }

        /* =========================================
           直播 Header (Stream)
           ========================================= */
        #stream-header {
            position: absolute; top: 0; left: 0; right: 0; height: 44px;
            background: linear-gradient(90deg, rgba(0,0,0,0.78) 0%, rgba(10,5,5,0.72) 100%);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            border-bottom: 1px solid rgba(220,40,40,0.25);
            display: flex; align-items: center; gap: 0;
            padding: 0 210px 0 14px; box-sizing: border-box;
            z-index: 12; pointer-events: none;
        }
        #stream-header.hidden { display: none !important; }
        /* 🔴 LIVE 指示燈 */
        #stream-live-badge {
            display: flex; align-items: center; gap: 5px;
            background: #c0392b; border-radius: 3px;
            padding: 2px 8px; margin-right: 10px; flex-shrink: 0;
        }
        .stream-live-dot {
            width: 7px; height: 7px; border-radius: 50%; background: #fff;
            animation: streamLivePulse 1.4s ease-in-out infinite;
        }
        @keyframes streamLivePulse { 0%,100%{ opacity:1; } 50%{ opacity:0.3; } }
        #stream-live-text { font-size: 0.68rem; font-weight: bold; color: #fff; letter-spacing: 1.5px; }
        /* 標題 */
        #stream-title-text {
            font-size: 0.88rem; color: #fff; font-weight: bold;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            max-width: 200px; margin-right: 12px; flex-shrink: 1;
        }
        /* 分隔線 */
        .stream-divider { width: 1px; height: 18px; background: rgba(255,255,255,0.18); margin: 0 10px; flex-shrink: 0; }
        /* 主播名 */
        #stream-host-text { font-size: 0.8rem; color: #ff7979; font-weight: bold; white-space: nowrap; flex-shrink: 0; }
        /* 統計數據區塊 */
        #stream-stats { display: flex; align-items: center; gap: 12px; margin-left: auto; flex-shrink: 0; }
        .stream-stat { display: flex; align-items: center; gap: 4px; font-size: 0.78rem; color: rgba(255,255,255,0.8); white-space: nowrap; }
        .stream-stat-icon { font-size: 0.72rem; }
        .stream-stat-val { color: #fff; font-weight: bold; }
        .stream-rank-val { color: #ffd700; font-weight: bold; }

        /* =========================================
           粉絲榜 (StreamRank)
           ========================================= */
        #stream-rank-panel {
            position: absolute; top: 50px; left: 10px;
            width: 190px; z-index: 12; pointer-events: none;
            background: linear-gradient(160deg, rgba(0,0,0,0.75) 0%, rgba(8,5,0,0.72) 100%);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(212,175,55,0.22); border-radius: 4px;
            overflow: hidden;
        }
        #stream-rank-panel.hidden { display: none !important; }
        #stream-rank-header {
            display: flex; align-items: center; gap: 6px; justify-content: center;
            padding: 5px 10px;
            background: rgba(212,175,55,0.1);
            border-bottom: 1px solid rgba(212,175,55,0.2);
            font-size: 0.7rem; font-weight: bold; letter-spacing: 2px;
            color: var(--gold); text-transform: uppercase;
        }
        .stream-rank-row {
            display: flex; align-items: center; gap: 7px;
            padding: 5px 10px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .stream-rank-row:last-child { border-bottom: none; }
        .stream-rank-medal { font-size: 1rem; flex-shrink: 0; line-height: 1; }
        .stream-rank-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
        .stream-rank-name { font-size: 0.78rem; color: #fff; font-weight: bold; white-space: normal; word-break: break-all; }
        .stream-rank-title { font-size: 0.68rem; color: rgba(212,175,55,0.75); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .stream-rank-score { font-size: 0.7rem; color: rgba(255,255,255,0.5); white-space: nowrap; flex-shrink: 0; }
        .stream-rank-score span { color: #ff9f7f; font-weight: bold; }
        #stream-scene-row {
            display: flex; align-items: center; gap: 5px;
            padding: 5px 10px;
            border-top: 1px solid rgba(212,175,55,0.15);
            background: rgba(212,175,55,0.06);
        }
        #stream-scene-row.hidden { display: none !important; }
        #stream-scene-icon { font-size: 0.72rem; }
        #stream-scene-label { font-size: 0.72rem; color: rgba(212,175,55,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* =========================================
           彈幕 (Danmu) - 從右到左飛行
           ========================================= */
        #danmu-container { position: absolute; top: 50px; bottom: 290px; left: 0; right: 0; overflow: hidden; pointer-events: none; z-index: 11; }
        .danmu-item { position: absolute; right: 0; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; padding: 5px 16px 5px 12px; background: rgba(0,0,0,0.58); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; backdrop-filter: blur(6px); font-size: 1rem; font-family: var(--font-sans); pointer-events: none; animation: danmu-fly-rl 18s linear forwards; }
        .danmu-name { color: var(--cyan); font-weight: bold; font-size: 0.9rem; letter-spacing: 0.5px; }
        .danmu-sep { color: rgba(255,255,255,0.35); font-size: 0.9rem; }
        .danmu-text { color: #fff; font-size: 1rem; text-shadow: 0 1px 4px rgba(0,0,0,0.95); }
        @keyframes danmu-fly-rl { from { transform: translateX(120%); } to { transform: translateX(calc(-100vw - 120%)); } }


        /* =========================================
           對話框 (VN / Narration) - 🎩 古典黑金高貴風
           ========================================= */
        #text-panel-wrapper { position: absolute; bottom: 35px; left: 50%; transform: translateX(-50%); width: 85%; z-index: 10; cursor: pointer; }

        /* === 劇情結束 - 資料中心按鈕覆蓋層 === */
        #vn-end-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: none; align-items: center; justify-content: center; z-index: 15; pointer-events: none; }
        #vn-end-overlay.active { display: flex; pointer-events: none; }
        #vn-end-btn-data {
            pointer-events: auto;
            padding: 14px 44px; background: rgba(5,5,8,0.92);
            border: 1px solid var(--gold); color: var(--gold);
            font-family: var(--font-classic); font-size: 1rem; letter-spacing: 4px;
            cursor: pointer; transition: all 0.3s ease;
            box-shadow: 0 0 20px rgba(212,175,55,0.25), 0 8px 32px rgba(0,0,0,0.8);
            text-shadow: 0 0 8px rgba(212,175,55,0.5);
        }
        #vn-end-btn-data:hover { background: rgba(20,15,5,0.95); box-shadow: 0 0 35px rgba(212,175,55,0.5), 0 8px 32px rgba(0,0,0,0.9); }

        #text-panel {
            backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px);
            padding: 40px 50px; position: relative; min-height: 140px;
            border-radius: 4px;
        }

        /* === 旁白模式（預設）：封閉實心框，敘述者聲音 === */
        #text-panel.nar-mode {
            background: linear-gradient(180deg, rgba(12,12,16,0.88) 0%, rgba(4,4,6,0.95) 100%);
            border: 1px solid rgba(255,255,255,0.08); border-top: 1px dashed rgba(255,255,255,0.15);
            box-shadow: 0 20px 50px rgba(0,0,0,0.9);
        }
        #text-panel.nar-mode #dialogue-text {
            font-style: normal; color: var(--text-color, #b8b4ac); letter-spacing: 1.5px;
        }

        /* === 角色對話模式：實心框，無羽化 === */
        #text-panel.char-mode {
            background: rgba(4, 4, 6, 0.92);
            border: none; border-top: 1px solid rgba(212,175,55,0.18);
            box-shadow: 0 20px 50px rgba(0,0,0,0.9);
            border-radius: 0;
        }
        #text-panel.char-mode #dialogue-text { color: var(--text-color, #e8e2d8); font-style: normal; }

        /* === 內心獨白模式：斜體，顏色跟隨 --em-color 設置 === */
        #text-panel.inner-mode #dialogue-text { color: var(--em-color); font-style: italic; letter-spacing: 1px; }

        /* 角落裝飾 ✧ */
        #text-panel::after { content: '✧'; position: absolute; bottom: 15px; right: 20px; color: var(--gold-dark); font-size: 1.2rem; animation: pulseOp 2s infinite; font-family: var(--font-classic); }
        @keyframes pulseOp { 0%,100%{opacity:0.3;} 50%{opacity:1;} }
        
        #speaker-name {
            position: absolute; top: -20px; left: 30px;
            background: #050505; border: 1px solid var(--gold); color: var(--name-color, var(--gold));
            font-family: var(--font-classic); font-size: 1.2rem; padding: 6px 25px; 
            display: inline-block; letter-spacing: 2px; z-index: 12; 
            box-shadow: 0 5px 15px rgba(0,0,0,0.8); border-radius: 2px;
        }

        /* --- 面板右上角控制按鈕 (無括號, 俐落風) --- */
        #vn-panel-controls { position: absolute; top: -16px; right: 15px; display: flex; gap: 8px; z-index: 12; }
        .vn-panel-btn { background: #0a0a0c; border: 1px solid rgba(255,255,255,0.2); color: #aaa; padding: 0 15px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.3s; font-size: 0.8rem; font-family: var(--font-sans); border-radius: 4px; letter-spacing: 1px; }
        .vn-panel-btn:hover { color: var(--gold); border-color: var(--gold); }
        .vn-panel-btn.active { background: rgba(212,175,55,0.1); color: var(--gold); border-color: var(--gold); }

        /* --- 上下文監控浮窗 --- */
        #vn-ctx-popup {
            display: none; position: absolute; bottom: calc(100% + 8px); right: 0;
            background: linear-gradient(135deg, #050505 0%, #0a0a0c 100%);
            border: 1px solid rgba(212,175,55,0.35); border-radius: 4px;
            padding: 10px 14px; min-width: 280px; max-width: 360px; max-height: 70vh;
            overflow-y: auto; z-index: 999;
            box-shadow: 0 4px 24px rgba(0,0,0,0.95), 0 0 12px rgba(212,175,55,0.08);
            pointer-events: auto; scrollbar-width: thin; scrollbar-color: #222 transparent;
        }
        #vn-ctx-popup.show { display: block; }
        .ctx-title { color: var(--gold); font-size: 0.7rem; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid rgba(212,175,55,0.2); padding-bottom: 5px; font-family: var(--font-sans); }
        .ctx-row { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; gap: 16px; }
        .ctx-label { color: #777; font-size: 0.7rem; letter-spacing: 1px; font-family: var(--font-sans); }
        .ctx-val { color: #ddd; font-size: 0.8rem; font-variant-numeric: tabular-nums; font-family: var(--font-sans); }
        .ctx-time { color: #555; font-size: 0.65rem; text-align: right; margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 5px; font-family: var(--font-sans); }
        @keyframes ctxPulse { 0%,100% { border-color: rgba(212,175,55,0.35); } 50% { border-color: rgba(212,175,55,0.85); box-shadow: 0 4px 24px rgba(0,0,0,0.95), 0 0 16px rgba(212,175,55,0.25); } }
        #vn-ctx-popup.ctx-pulse { animation: ctxPulse 0.6s ease; }
        .ctx-bar-wrap { margin: 8px 0 4px; }
        .ctx-bar-track { height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; }
        .ctx-bar-fill { height: 100%; width: 0%; border-radius: 2px; transition: width 0.4s ease, background 0.4s ease; background: #69db7c; }
        .ctx-bar-fill.warn  { background: #f6ad55; }
        .ctx-bar-fill.danger { background: #ff6b6b; }
        .ctx-usage-text { font-size: 0.65rem; color: #777; text-align: right; margin-top: 2px; font-family: var(--font-sans); }
        .ctx-usage-text.warn   { color: #f6ad55; }
        .ctx-usage-text.danger { color: #ff6b6b; font-weight: bold; }
        .ctx-limit-row { display: flex; align-items: center; gap: 6px; margin-top: 6px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.05); }
        .ctx-limit-label { color: #555; font-size: 0.65rem; white-space: nowrap; }
        .ctx-limit-input { flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 3px; color: #aaa; font-size: 0.7rem; padding: 2px 5px; text-align: right; width: 60px; outline: none; }
        .ctx-limit-input:focus { border-color: rgba(212,175,55,0.4); color: #ddd; }

        /* 對話內文也是優雅字體 */
        #dialogue-text { font-family: var(--font-classic); font-size: 1.3rem; line-height: 1.9; letter-spacing: 1px; color: var(--text-color, #dcd8d0); font-weight: 300; }
        #dialogue-text em, #call-sub-text em { font-style: italic; color: var(--em-color); }
        #dialogue-text strong, #call-sub-text strong { font-weight: bold; color: #fff; }
        .hint-text { display: none; }

        /* =========================================
           系統提示框 / 轉場 / Log
           ========================================= */
        #sys-overlay, #trans-overlay, #item-overlay, #vn-log-overlay, #quest-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 20; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: 0.35s ease; backdrop-filter: blur(5px); }
        #sys-overlay { background: rgba(0,0,0,0.7); }
        #sys-overlay.active, #trans-overlay.active, #item-overlay.active, #vn-log-overlay.active { opacity: 1; pointer-events: auto; }
        
        /* ⚙ 系統提示框 (黑金外框結構，但採用科技青色 Cyan) */
        #sys-box {
            background: linear-gradient(135deg, #020a10 0%, #050505 100%);
            border: 1px solid rgba(0, 210, 211, 0.3);
            box-shadow: 0 20px 60px rgba(0,0,0,0.9);
            padding: 40px 50px; text-align: center; position: relative;
            color: var(--text-light); font-size: 1.2rem; letter-spacing: 2px;
            min-width: 320px; max-width: calc(100% - 60px); max-height: calc(100% - 40px); overflow-y: auto; box-sizing: border-box;
            border-radius: 4px; font-family: var(--font-sans);
        }
        /* 系統提示框的細線內框 */
        #sys-box::before { 
            content: ''; position: absolute; top: 6px; left: 6px; right: 6px; bottom: 6px; 
            border: 1px solid rgba(0, 210, 211, 0.15); pointer-events: none; border-radius: 2px;
        }
        #sys-title { 
            font-size: 0.95rem; color: var(--cyan); letter-spacing: 5px; margin-bottom: 20px; 
            display: none; font-weight: bold; text-transform: uppercase; 
            border-bottom: 1px solid rgba(0, 210, 211, 0.3); padding-bottom: 10px; 
        }
        
        /* 📋 委託面板 (Quest) - 黑金羊皮紙風 */
        #quest-overlay { background: rgba(0,0,0,0.82); z-index: 25; backdrop-filter: blur(8px); }
        #quest-overlay.active { opacity: 1; pointer-events: auto; }
        #quest-card {
            background: linear-gradient(160deg, #0d0900 0%, #1a1200 50%, #0a0800 100%);
            border: 1px solid rgba(212,175,55,0.45);
            box-shadow: 0 0 60px rgba(212,175,55,0.12), 0 20px 60px rgba(0,0,0,0.95);
            padding: 38px 44px 32px; position: relative; border-radius: 4px;
            min-width: 300px; max-width: calc(100% - 60px); max-height: calc(100% - 40px); overflow-y: auto; box-sizing: border-box;
            font-family: var(--font-sans);
        }
        #quest-card::before {
            content: ''; position: absolute; top: 6px; left: 6px; right: 6px; bottom: 6px;
            border: 1px solid rgba(212,175,55,0.12); pointer-events: none; border-radius: 2px;
        }
        #quest-header {
            text-align: center; font-size: 0.72rem; color: var(--gold-dark);
            letter-spacing: 6px; text-transform: uppercase; margin-bottom: 6px;
            font-family: var(--font-classic);
        }
        #quest-title {
            text-align: center; font-size: 1.25rem; color: var(--gold);
            font-family: var(--font-classic); font-weight: bold; letter-spacing: 2px;
            margin-bottom: 18px; padding-bottom: 14px;
            border-bottom: 1px solid rgba(212,175,55,0.25);
        }
        #quest-requester {
            font-size: 0.78rem; color: rgba(212,175,55,0.6); letter-spacing: 2px;
            text-transform: uppercase; margin-bottom: 14px;
        }
        #quest-requester span { color: var(--gold-light); font-size: 0.9rem; letter-spacing: 1px; }
        #quest-desc {
            font-size: 0.95rem; color: var(--text-light); line-height: 1.8;
            margin-bottom: 20px; padding: 12px 14px;
            background: rgba(212,175,55,0.04); border-left: 2px solid rgba(212,175,55,0.3);
        }
        #quest-reward-row {
            display: flex; align-items: center; gap: 10px;
            padding-top: 14px; border-top: 1px solid rgba(212,175,55,0.2);
        }
        #quest-reward-label { font-size: 0.75rem; color: var(--gold-dark); letter-spacing: 3px; text-transform: uppercase; white-space: nowrap; }
        #quest-reward { font-size: 0.95rem; color: var(--gold-light); }
        #quest-confirm {
            display: block; margin: 22px auto 0;
            background: transparent; border: 1px solid rgba(212,175,55,0.4);
            color: var(--gold); padding: 9px 40px; font-size: 0.85rem;
            letter-spacing: 3px; text-transform: uppercase; cursor: pointer;
            font-family: var(--font-classic); border-radius: 2px; transition: all 0.25s;
        }
        #quest-confirm:hover { background: rgba(212,175,55,0.1); border-color: var(--gold); box-shadow: 0 0 12px rgba(212,175,55,0.2); }

        #trans-overlay { background: radial-gradient(circle, #1a1a24, #000); z-index: 50; transition: opacity 0.8s ease; }
        #trans-text { font-size: 1.6rem; letter-spacing: 6px; color: #fff; text-shadow: 0 0 15px rgba(255,255,255,0.5); padding: 0 48px; box-sizing: border-box; text-align: center; }

        /* 🎩 物品彈窗 (黑金高貴版, 無括號按鈕) */
        #item-overlay { background: rgba(0,0,0,0.9); z-index: 40; backdrop-filter: blur(10px); }
        #item-card { 
            background: linear-gradient(135deg, #141414 0%, #050505 100%); 
            border: 1px solid rgba(212,175,55,0.3); 
            box-shadow: 0 20px 60px rgba(0,0,0,0.9); 
            width: 350px; padding: 45px 35px 35px; text-align: center; position: relative; 
            border-radius: 4px;
        }
        /* 古典細線內框 */
        #item-card::before {
            content: ''; position: absolute; top: 8px; left: 8px; right: 8px; bottom: 8px;
            border: 1px solid rgba(212, 175, 55, 0.15); pointer-events: none;
        }
        
        .item-close { position: absolute; top: 15px; right: 20px; color: #666; cursor: pointer; font-size: 1.5rem; transition: 0.2s; font-family: var(--font-sans); z-index: 2;}
        .item-close:hover { color: var(--gold); }
        
        /* 金屬質感的圖示外框 */
        #item-icon-box {
            background: #0a0a0a; border: 1px solid rgba(212,175,55,0.4);
            width: 130px; height: 130px; margin: 0 auto 30px;
            display: flex; justify-content: center; align-items: center;
            position: relative; box-shadow: 0 10px 30px rgba(0,0,0,0.8), inset 0 0 20px rgba(212,175,55,0.05);
            transform: rotate(45deg); /* 菱形外框 */
            overflow: hidden; /* 裁切圖片在菱形內，防止溢出 */
        }
        #item-img {
            width: 142%; height: 142%; /* √2 × 100% ≈ 141.4%，剛好填滿菱形 */
            object-fit: cover;
            transform: rotate(-45deg); /* 圖片轉正 */
            flex-shrink: 0;
        }
        
        #item-title { color: var(--gold); font-size: 1.4rem; margin-bottom: 15px; font-family: var(--font-classic); letter-spacing: 2px; }
        #item-desc { color: #b0ada5; font-size: 0.95rem; line-height: 1.6; margin-bottom: 35px; padding: 15px; text-align: center; border-top: 1px solid rgba(212,175,55,0.1); border-bottom: 1px solid rgba(212,175,55,0.1); font-family: var(--font-sans); }
        
        #item-btn { 
            background: transparent; color: var(--gold); border: 1px solid var(--gold); 
            padding: 12px 0; font-size: 1rem; font-family: var(--font-sans); 
            cursor: pointer; transition: all 0.3s; letter-spacing: 2px; 
            width: 100%; box-sizing: border-box; border-radius: 4px;
        }
        #item-btn:hover { background: var(--gold); color: #000; box-shadow: 0 5px 15px rgba(212,175,55,0.3); }

        /* 🏆 成就解鎖 Toast (從頂部滑入，不蓋全螢幕) */
        #achievement-overlay {
            position: absolute; top: 0; left: 0; width: 100%; z-index: 45;
            display: flex; justify-content: center;
            opacity: 0; pointer-events: none;
            transform: translateY(-110%);
            transition: opacity 0.35s ease, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        #achievement-overlay.active { opacity: 1; pointer-events: auto; transform: translateY(0); }
        #achievement-card {
            width: 100%; padding: 14px 20px 14px 18px;
            background: linear-gradient(135deg, #020e07 0%, #010a04 100%);
            border-bottom: 1px solid rgba(0, 255, 100, 0.35);
            box-shadow: 0 4px 30px rgba(0, 255, 100, 0.15), 0 8px 40px rgba(0,0,0,0.7);
            display: flex; align-items: center; gap: 14px; cursor: pointer; position: relative; overflow: hidden;
        }
        /* Glitch 掃光線 */
        #achievement-card::after {
            content: ''; position: absolute; top: 0; left: -100%; width: 60%; height: 100%;
            background: linear-gradient(90deg, transparent, rgba(0,255,100,0.06), transparent);
            animation: ach-scan 2.5s ease-in-out infinite;
        }
        @keyframes ach-scan { 0% { left: -60%; } 100% { left: 140%; } }
        #achievement-icon {
            font-size: 1.8rem; flex-shrink: 0; width: 42px; height: 42px;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,255,100,0.08); border: 1px solid rgba(0,255,100,0.3);
            border-radius: 4px;
        }
        #achievement-body { flex: 1; min-width: 0; }
        #achievement-label {
            font-size: 0.7rem; color: rgba(0,255,100,0.7); letter-spacing: 3px;
            text-transform: uppercase; margin-bottom: 3px; font-family: var(--font-sans);
        }
        #achievement-name {
            font-size: 1.05rem; color: #e0ffe8; font-weight: bold; letter-spacing: 1px;
            font-family: var(--font-classic); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            /* Glitch 文字閃爍 */
            animation: ach-glitch 4s step-end infinite;
        }
        @keyframes ach-glitch {
            0%, 90%, 100% { text-shadow: none; }
            92% { text-shadow: -2px 0 rgba(255,0,80,0.6), 2px 0 rgba(0,255,200,0.6); }
            94% { text-shadow: 2px 0 rgba(255,0,80,0.4); }
            96% { text-shadow: none; }
        }
        #achievement-desc {
            font-size: 0.82rem; color: rgba(180,220,195,0.65); margin-top: 3px;
            font-family: var(--font-sans); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        #achievement-dismiss { color: rgba(0,255,100,0.35); font-size: 1.2rem; flex-shrink: 0; transition: 0.2s; }
        #achievement-card:hover #achievement-dismiss { color: rgba(0,255,100,0.8); }

        /* 🎵 BGM Toast (成就系統同款滑入，綠=找到 紅=找不到) */
        #vn-bgm-toast {
            position: absolute; top: 0; left: 0; width: 100%; z-index: 44;
            display: flex; justify-content: center;
            opacity: 0; pointer-events: none;
            transform: translateY(-110%);
            transition: opacity 0.3s ease, transform 0.38s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        #vn-bgm-toast.active { opacity: 1; transform: translateY(0); }
        #vn-bgm-card {
            width: 100%; padding: 10px 18px 10px 16px;
            display: flex; align-items: center; gap: 12px;
            background: linear-gradient(135deg, #080808 0%, #0a0a0a 100%);
            border-bottom: 1px solid rgba(212,175,55,0.3);
            box-shadow: 0 4px 20px rgba(0,0,0,0.6);
        }
        #vn-bgm-toast.found  #vn-bgm-card { border-bottom-color: rgba(80,220,120,0.5); background: linear-gradient(135deg, #020e04 0%, #010a02 100%); }
        #vn-bgm-toast.notfound #vn-bgm-card { border-bottom-color: rgba(255,80,80,0.5); background: linear-gradient(135deg, #100202 0%, #0a0101 100%); }
        #vn-bgm-icon { font-size: 1.1rem; flex-shrink: 0; }
        #vn-bgm-body { flex: 1; overflow: hidden; }
        #vn-bgm-label { font-size: 0.65rem; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 2px; font-family: var(--font-sans); }
        #vn-bgm-toast.found    #vn-bgm-label { color: rgba(80,220,120,0.7); }
        #vn-bgm-toast.notfound #vn-bgm-label { color: rgba(255,100,100,0.7); }
        #vn-bgm-name { font-size: 0.92rem; color: #e8dfc8; font-family: var(--font-classic); letter-spacing: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #vn-bgm-toast.notfound #vn-bgm-name { color: rgba(255,180,180,0.85); text-decoration: line-through; }

        /* --- Log 面板 --- */
        #vn-log-overlay { background: rgba(10,10,12,0.95); z-index: 60; display: flex; flex-direction: column; padding: 40px 0; box-sizing: border-box; }
        #vn-log-header { display: flex; justify-content: space-between; align-items: center; padding: 0 50px 20px; border-bottom: 1px solid rgba(212,175,55,0.25); margin-bottom: 20px; width:100%; box-sizing:border-box;}
        #vn-log-title { color: var(--gold); font-size: 1.2rem; font-family: var(--font-sans); font-weight: bold; letter-spacing: 2px; }
        .vn-log-close { color: #888; font-size: 1.8rem; cursor: pointer; transition: 0.2s; }
        .vn-log-close:hover { color: var(--gold); transform: scale(1.1); }
        #vn-log-content { flex: 1; overflow-y: auto; padding: 0 50px; display: flex; flex-direction: column; gap: 18px; width:100%; box-sizing:border-box;}
        #vn-log-content::-webkit-scrollbar { width: 6px; }
        #vn-log-content::-webkit-scrollbar-track { background: transparent; }
        #vn-log-content::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
        .vn-log-item { background: rgba(255,255,255,0.02); border-radius: 8px; padding: 18px 20px; border-left: 3px solid rgba(212,175,55,0.2); transition: 0.2s; }
        .vn-log-item:hover { border-left-color: var(--gold); background: rgba(212,175,55,0.04); }
        .vn-log-name { color: var(--gold); font-size: 0.95rem; font-weight: bold; margin-bottom: 8px; }
        .vn-log-text { color: #ddd; font-size: 1.05rem; line-height: 1.6; font-family: var(--font-sans); }

        /* =========================================
           ⚙ 遊戲內設定面板 (黑金古典風)
           ========================================= */
        /* === 第三方插件 HTML block 展示層 === */
        #html-block-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.82); backdrop-filter: blur(8px);
            z-index: 55; overflow-y: auto;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: 20px; box-sizing: border-box;
            cursor: pointer;
        }
        #html-block-overlay::after {
            content: '點擊繼續 ▶'; position: absolute; bottom: 18px; right: 24px;
            color: rgba(212,175,55,0.7); font-size: 0.85rem; letter-spacing: 1px;
            animation: pulseOp 2s infinite;
        }

        #game-settings-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); backdrop-filter: blur(10px); z-index: 60; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.4s ease; }
        #game-settings-overlay.active { opacity: 1; pointer-events: auto; }
        #game-settings-window { width: calc(100% - 30px); max-width: 410px; max-height: calc(100% - 40px); background: linear-gradient(135deg, #111 0%, #050505 100%); border: 1px solid var(--glass-border); border-radius: 2px; box-shadow: 0 20px 60px rgba(0,0,0,0.9); display: flex; flex-direction: column; transform: scale(0.98) translateY(10px); opacity: 0; transition: transform 0.4s, opacity 0.4s; overflow: hidden; margin-top: env(safe-area-inset-top, 0px); }
        body.layout-pad-ios #game-settings-window { margin-top: 35px; }
        #game-settings-overlay.active #game-settings-window { transform: scale(1) translateY(0); opacity: 1; }
        #gs-titlebar { background: rgba(10,10,10,0.8); border-bottom: 1px solid var(--gold-dark); padding: 15px 20px; display: flex; align-items: center; justify-content: space-between; }
        #gs-titlebar .gs-title { color: var(--gold); font-family: var(--font-classic); font-size: 1.2rem; letter-spacing: 4px; }
        #gs-titlebar .gs-close { width: 32px; height: 32px; background: transparent; border: 1px solid transparent; color: var(--gold-dark); font-size: 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.3s; }
        #gs-titlebar .gs-close:hover { color: var(--gold); border-color: var(--gold); }
        #gs-body { padding: 30px 25px; overflow-y: auto; flex: 1; }
        #gs-body::-webkit-scrollbar { width: 4px; }
        #gs-body::-webkit-scrollbar-track { background: transparent; }
        #gs-body::-webkit-scrollbar-thumb { background: var(--gold-dark); }
        .gs-section-title { color: var(--gold); font-size: 0.9rem; font-family: var(--font-classic); letter-spacing: 3px; margin-bottom: 25px; border-bottom: 1px solid rgba(212,175,55,0.2); padding-bottom: 8px; }
        .gs-row { display: flex; align-items: center; gap: 15px; margin-bottom: 22px; }
        .gs-label { color: #aaa; font-size: 0.9rem; white-space: nowrap; flex-shrink: 0; min-width: 80px; }
        .gs-val { color: var(--gold-light); font-size: 0.85rem; font-family: monospace; min-width: 45px; text-align: right; flex-shrink: 0; }
        .gs-slider { -webkit-appearance: none; appearance: none; flex: 1; height: 2px; background: rgba(255,255,255,0.2); outline: none; cursor: pointer; }
        .gs-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--gold); cursor: pointer; transition: 0.2s; border: 2px solid #000; }
        .gs-slider::-webkit-slider-thumb:hover { transform: scale(1.3); }
        .gs-color-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 10px; }
        .gs-color-label { color: #aaa; font-size: 0.9rem; }
        .gs-color-input { width: 40px; height: 24px; border: 1px solid #555; cursor: pointer; background: none; padding: 1px; }
        .gs-color-input::-webkit-color-swatch-wrapper { padding: 0; }
        .gs-color-input::-webkit-color-swatch { border: none; }
        .gs-divider { border: none; margin: 25px 0; }
        .gs-reset-btn { width: 100%; background: transparent; border: 1px solid var(--gold-dark); color: var(--gold-dark); padding: 12px; font-size: 0.9rem; cursor: pointer; transition: all 0.3s; letter-spacing: 2px; font-family: var(--font-classic); text-transform: uppercase; }
        .gs-reset-btn:hover { border-color: var(--gold); color: var(--gold); }

        /* =========================================
           📱 手機 UI (回歸現代寫實風, 不套用古典)
           ========================================= */
        #phone-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); backdrop-filter: blur(5px); z-index: 30; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.35s; overflow: hidden; }
        #phone-overlay.active { opacity: 1; pointer-events: auto; }
        #phone-device { width: 380px; height: 580px; max-height: calc(100% - 20px); background: #000; border-radius: 45px; border: 10px solid #1a1a1c; box-shadow: 0 30px 60px rgba(0,0,0,0.8), inset 0 0 10px rgba(0,0,0,0.5); position: relative; overflow: hidden; display: flex; flex-direction: column; transform: translateY(110%); transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); font-family: var(--font-sans); }
        #phone-overlay.active #phone-device { transform: translateY(0); }
        #phone-device::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 120px; height: 30px; background: #1a1a1c; border-bottom-left-radius: 18px; border-bottom-right-radius: 18px; z-index: 20; }

        /* --- Chat 模式 (明亮現代) --- */
        #phone-chat { display: flex; flex-direction: column; height: 100%; background: #f0f0f0; position: relative; }
        #chat-bg-img { position: absolute; top:0; left:0; width:100%; height:100%; object-fit: cover; opacity: 0.4; z-index: 0; }
        #chat-header { background: rgba(247,247,247,0.9); backdrop-filter: blur(10px); color: #000; padding: 45px 20px 15px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.05); z-index: 10; }
        #chat-body { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 0; z-index: 10; position: relative; }
        #chat-footer { display: flex; align-items: center; gap: 8px; padding: 8px 12px 12px; background: rgba(245,245,245,0.97); backdrop-filter: blur(10px); border-top: 1px solid rgba(0,0,0,0.08); z-index: 10; flex-shrink: 0; }
        #chat-plus-btn { width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid #ccc; background: #fff; font-size: 1.3rem; line-height: 1; color: #555; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; padding: 0; }
        #chat-input-wrap { flex: 1; }
        #chat-input { width: 100%; box-sizing: border-box; padding: 8px 12px; border-radius: 6px; border: none; background: #fff; font-size: 0.88rem; color: #333; outline: none; box-shadow: 0 1px 2px rgba(0,0,0,0.1); cursor: default; font-family: inherit; }
        #chat-mic-btn { width: 34px; height: 34px; border: none; background: transparent; font-size: 1.2rem; color: #555; cursor: pointer; flex-shrink: 0; padding: 0; }

        /* --- 表情包面板 --- */
        #sticker-panel { position: absolute; bottom: 0; left: 0; right: 0; background: #f7f7f7; border-top: 1px solid #ddd; z-index: 20; transform: translateY(100%); transition: transform 0.28s cubic-bezier(0.2,0.8,0.2,1); display: flex; flex-direction: column; max-height: 55%; }
        #sticker-panel.open { transform: translateY(0); }
        #sticker-tabs-row { display: flex; align-items: center; background: #efefef; border-bottom: 1px solid #ddd; padding: 0 8px; min-height: 38px; flex-shrink: 0; overflow-x: auto; }
        #sticker-tabs { display: flex; gap: 4px; flex: 1; }
        .sticker-tab { padding: 6px 12px; border: none; background: transparent; font-size: 0.78rem; color: #666; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }
        .sticker-tab.active { color: #07c160; border-bottom-color: #07c160; font-weight: bold; }
        .sticker-tab-add { padding: 6px 10px; border: none; background: transparent; font-size: 1.1rem; color: #07c160; cursor: pointer; flex-shrink: 0; }
        #sticker-grid { flex: 1; overflow-y: auto; padding: 10px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .sticker-item { aspect-ratio: 1; background: #fff; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 1px solid #eee; transition: transform 0.15s; }
        .sticker-item:active { transform: scale(0.92); }
        .sticker-item img { width: 100%; height: 100%; object-fit: contain; }
        .sticker-del-lib { grid-column: 1 / -1; text-align: center; padding: 8px; font-size: 0.75rem; color: #e74c3c; cursor: pointer; opacity: 0.6; }
        .sticker-del-lib:hover { opacity: 1; }
        /* 設置頁：表情包管理 */
        #sticker-mgr-list { margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px; }
        .stk-lib-row { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(212,175,55,0.15); border-radius: 4px; margin-bottom: 6px; }
        .stk-lib-top { display: flex; align-items: center; gap: 8px; }
        .stk-lib-name { flex: 1; font-size: 0.85rem; color: #d0c8b8; }
        .stk-lib-count { font-size: 0.75rem; color: #888; }
        .stk-lib-del { background: transparent; border: none; color: #e74c3c; cursor: pointer; font-size: 0.85rem; opacity: 0.7; padding: 0 4px; }
        .stk-lib-del:hover { opacity: 1; }
        .stk-lib-url-input { width: 100%; padding: 5px 8px; background: rgba(0,0,0,0.5); border: 1px solid #333; color: #f5f6fa; border-radius: 2px; font-size: 0.78rem; outline: none; box-sizing: border-box; transition: 0.3s; }
        .stk-lib-url-input:focus { border-color: var(--gold); }
        .stk-add-section { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
        .stk-add-label { font-size: 0.78rem; color: #888; }
        #stk-set-url { width: 100%; padding: 7px 10px; background: rgba(0,0,0,0.6); border: 1px solid #333; color: #f5f6fa; border-radius: 2px; font-size: 0.85rem; outline: none; box-sizing: border-box; transition: 0.3s; }
        #stk-set-url:focus { border-color: var(--gold); }
        .stk-set-file-label { display: block; text-align: center; padding: 10px; border: 1.5px dashed rgba(212,175,55,0.3); border-radius: 4px; color: var(--gold); font-size: 0.82rem; cursor: pointer; transition: 0.2s; }
        .stk-set-file-label:hover { border-color: var(--gold); background: rgba(212,175,55,0.05); }

        .chat-outer { display: flex; flex-direction: column; margin-bottom: 12px; }
        .chat-outer .chat-row { margin-bottom: 0; }
        .chat-outer .chat-sender-name { margin-left: 50px; }
        .chat-row { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
        .chat-row.you { flex-direction: row-reverse; }
        .chat-avatar { width: 40px; height: 40px; border-radius: 8px; color: #fff; font-size: 0.95rem; font-weight: bold; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: #fa9d3b; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .chat-content { display: flex; flex-direction: column; max-width: calc(100% - 60px); }
        .chat-row.you .chat-content { align-items: flex-end; }
        .chat-row.other .chat-content { align-items: flex-start; }
        .chat-sender-name { font-size: 0.75rem; color: #888; margin-bottom: 3px; padding: 0 4px; }
        .chat-bubble { padding: 10px 14px; font-size: 0.9rem; line-height: 1.5; color: #111; word-break: break-word; box-shadow: 0 1px 3px rgba(0,0,0,0.08); position: relative; }
        .chat-row.you .chat-bubble { background: #95ec69; border-radius: 12px 4px 12px 12px; }
        .chat-row.you .chat-bubble::after { content: ''; position: absolute; top: 10px; right: -7px; border: 7px solid transparent; border-left-color: #95ec69; border-right: 0; }
        .chat-row.other .chat-bubble { background: #fff; border-radius: 4px 12px 12px 12px; }
        .chat-row.other .chat-bubble::before { content: ''; position: absolute; top: 10px; left: -7px; border: 7px solid transparent; border-right-color: #fff; border-left: 0; }
        .chat-sys { align-self: center; color: #888; font-size: 0.75rem; margin: 8px auto 10px; text-align: center; background: rgba(0,0,0,0.06); border-radius: 20px; padding: 4px 14px; max-width: 80%; line-height: 1.5; }
        
        /* [新增] 當有自訂背景圖時，強化人名與系統字的對比度 */
        #phone-chat.has-bg .chat-sender-name {
            color: #ffffff;
            text-shadow: 0px 1px 3px rgba(0,0,0,0.9), 0px 0px 2px rgba(0,0,0,0.7);
        }
        #phone-chat.has-bg .chat-sys {
            color: #ffffff;
            background: rgba(0,0,0,0.45);
            backdrop-filter: blur(4px);
            text-shadow: 0px 1px 2px rgba(0,0,0,0.8);
            box-shadow: 0 1px 4px rgba(0,0,0,0.15);
        }

        /* 手機卡片 (維持原本設計) */
        .wx-img-msg { background: #e8e8e8; border-radius: 8px; display: flex; align-items: flex-start; gap: 10px; padding: 10px 14px; width: 200px; min-height: 52px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
        .wx-img-icon { font-size: 1.5rem; flex-shrink: 0; margin-top: 1px; }
        .wx-img-desc { font-size: 0.82rem; color: #333; word-break: break-word; line-height: 1.5; }
        .wx-voice-wrap { display: flex; flex-direction: column; gap: 5px; }
        .wx-voice-msg { border-radius: 18px; padding: 8px 14px; display: flex; align-items: center; gap: 8px; min-width: 70px; max-width: 170px; cursor: pointer; user-select: none; }
        .chat-row.you .wx-voice-msg { background: #95ec69; flex-direction: row-reverse; border-radius: 18px 4px 18px 18px; }
        .chat-row.other .wx-voice-msg { background: #fff; border-radius: 4px 18px 18px 18px; }
        .wx-voice-wave { font-size: 1rem; letter-spacing: 1px; color: #555; }
        .wx-voice-dur { font-size: 0.8rem; color: #888; }
        .wx-voice-trans { display: none; font-size: 0.81rem; color: #444; line-height: 1.55; background: rgba(255,255,255,0.88); border-radius: 10px; padding: 7px 11px; max-width: 200px; word-break: break-word; border: 1px solid rgba(0,0,0,0.07); }
        .wx-voice-trans.open { display: block; animation: voiceTransIn 0.15s ease; }
        @keyframes voiceTransIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
        .sticker-wrap { display: inline-block; line-height: 0; }
        .wx-sticker-msg { background: #fff; border: 1px solid #ededed; border-radius: 6px; padding: 10px; display: flex; align-items: center; justify-content: center; min-width: 80px; max-width: 140px; min-height: 80px; text-align: center; font-size: 0.88rem; color: #333; word-break: break-word; line-height: 1.4; }
        .wx-transfer-msg, .wx-redpacket-msg { background: #fa9d3b; border-radius: 10px; overflow: hidden; min-width: 175px; max-width: 210px; }
        .wx-t-main, .wx-rp-main { display: flex; align-items: center; gap: 11px; padding: 12px 14px 10px; }
        .wx-t-icon { width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.28); display: flex; align-items: center; justify-content: center; font-size: 1rem; color: #fff; flex-shrink: 0; font-weight: bold; }
        .wx-rp-icon { width: 32px; height: 40px; background: #e64340; border-radius: 4px; border: 1px solid rgba(255,255,255,0.3); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 1rem; color:#f6d147; }
        .wx-t-body, .wx-rp-body { flex: 1; }
        .wx-t-title { color: #fff; font-weight: bold; font-size: 0.85rem; }
        .wx-t-amount, .wx-rp-label { color: rgba(255,255,255,0.85); font-size: 0.78rem; margin-top: 2px; }
        .wx-rp-amount { color: #fff; font-weight: bold; font-size: 0.85rem; }
        .wx-t-footer, .wx-rp-footer { border-top: 1px solid rgba(255,255,255,0.22); padding: 6px 14px; font-size: 0.7rem; color: rgba(255,255,255,0.7); }
        .wx-gift-msg { background: #1e306e; border-radius: 10px; overflow: hidden; min-width: 175px; max-width: 210px; }
        .wx-g-main { display: flex; align-items: center; gap: 11px; padding: 12px 14px 10px; }
        .wx-g-icon { font-size: 1.5rem; flex-shrink: 0; }
        .wx-g-body { flex: 1; }
        .wx-g-title { color: #fff; font-weight: bold; font-size: 0.85rem; }
        .wx-g-sub { color: rgba(255,255,255,0.6); font-size: 0.78rem; margin-top: 2px; }
        .wx-g-footer { border-top: 1px solid rgba(255,255,255,0.1); padding: 6px 14px; font-size: 0.7rem; color: rgba(255,255,255,0.45); }
        .wx-video-msg { width: 210px; background: #111; border-radius: 8px; aspect-ratio: 16/9; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; }
        .wx-video-play { width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.5); display: flex; align-items: center; justify-content: center; z-index: 2; }
        .wx-video-play::after { content: ''; width: 0; height: 0; margin-left: 3px; border-top: 8px solid transparent; border-bottom: 8px solid transparent; border-left: 14px solid #fff; }
        .wx-video-title { position: absolute; bottom: 8px; left: 10px; right: 10px; color: #fff; font-size: 12px; z-index: 2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 3px rgba(0,0,0,0.6); }
        .wx-location-msg { width: 210px; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.12); background: #fff; }
        .wx-location-map { height: 100px; background: #d0e8c8; position: relative; display: flex; align-items: center; justify-content: center; font-size: 2.4rem; }
        .wx-location-info { background: #3dbf55; padding: 8px 12px; }
        .wx-location-name { font-size: 13px; font-weight: bold; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wx-location-addr { font-size: 11px; color: rgba(255,255,255,0.85); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wx-file-card { background: #fff; border-radius: 6px; padding: 12px; display: flex; align-items: center; gap: 10px; min-width: 190px; max-width: 220px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
        .wx-file-info { flex: 1; min-width: 0; }
        .wx-file-name { font-size: 13px; color: #333; word-break: break-word; line-height: 1.4; }
        .wx-file-size { font-size: 11px; color: #999; margin-top: 4px; }
        .wx-file-icon { width: 38px; height: 46px; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 11px; font-weight: bold; flex-shrink: 0; }

        /* --- Call 模式 (暗黑現代) --- */
        /* 按鈕改為 flex 排版（不再 absolute），高度自適應，不靠 padding-bottom 撐空間 */
        #phone-call { display: flex; flex-direction: column; height: 100%; background: linear-gradient(180deg, #161b2e 0%, #080a12 100%); color: white; align-items: center; padding-top: 55px; padding-bottom: 0; box-sizing: border-box; position: relative; overflow: hidden; transition: padding-top 0.3s ease; }
        #call-avatar { width: 130px; height: 130px; border-radius: 50%; object-fit: cover; border: 4px solid rgba(255,255,255,0.1); box-shadow: 0 0 30px rgba(255,255,255,0.1); margin-bottom: 14px; transition: width 0.3s ease, height 0.3s ease, margin-bottom 0.3s ease; }
        #call-name { font-size: 2.2rem; font-weight: bold; letter-spacing: 1px; transition: font-size 0.3s ease; }
        #call-status { font-size: 1rem; color: #aaa; margin-top: 8px; margin-bottom: 16px; letter-spacing: 2px; transition: margin 0.3s ease; }
        /* 接聽後縮小頭像與名字，騰出對話框空間 */
        #phone-call.call-active { padding-top: 28px; justify-content: space-between; padding-bottom: 18px; }
        #phone-call.call-active #call-avatar { width: 96px; height: 96px; margin-bottom: 4px; }
        #phone-call.call-active #call-name { font-size: 1.3rem; line-height: 1.2; }
        #phone-call.call-active #call-status { margin-top: 2px; margin-bottom: 0; font-size: 0.85rem; }
        #phone-call.call-active .call-btn-group { margin-top: 0; padding-bottom: 0; }
        #call-status.connected { color: #34c759; }
        #call-status.connected::before { content: '● '; animation: callblink 1.5s ease infinite; }
        @keyframes callblink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        /* margin-top: auto 自動把按鈕推到底部，不需固定 bottom 值 */
        .call-btn-group { width: 100%; display: flex; justify-content: space-evenly; align-items: center; margin-top: auto; flex-shrink: 0; padding-bottom: 18px; }
        .call-btn-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .c-btn { width: 75px; height: 75px; border-radius: 50%; border: none; font-size: 1.5rem; cursor: pointer; color: white; display: flex; justify-content: center; align-items: center; transition: all 0.2s ease; box-shadow: 0 5px 15px rgba(0,0,0,0.3); }
        .c-btn:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.4); }
        .c-btn:active { transform: scale(0.92); }
        .c-btn-label { font-size: 0.8rem; color: rgba(255,255,255,0.7); }
        .btn-red { background: linear-gradient(135deg, #ff3b30 0%, #c0392b 100%); }
        .btn-green { background: linear-gradient(135deg, #34c759 0%, #27ae60 100%); }
        .btn-gray { background: rgba(255,255,255,0.15); backdrop-filter: blur(5px); }
        #call-subtitle-box { position: relative; width: 85%; margin-top: 16px; background: rgba(20,22,35,0.85); backdrop-filter: blur(10px); border-radius: 16px; padding: 14px 18px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; box-shadow: 0 10px 30px rgba(0,0,0,0.5); flex-shrink: 1; min-height: 0; max-height: 35%; overflow-y: auto; box-sizing: border-box; }
        #phone-call.call-active #call-subtitle-box { margin-top: 0; max-height: 52%; }
        #call-subtitle-box.narration { border: 1.5px dashed rgba(255,255,255,0.2); background: rgba(15,16,25,0.7); }
        #call-sub-name { font-size: 0.85rem; color: #aaa; margin-bottom: 8px; font-weight: bold; }
        #call-sub-text { font-size: 1.05rem; line-height: 1.6; color: #eee; }
        #call-subtitle-box.narration #call-sub-text { color: #bbb; font-style: italic; }

        /* =========================================
           📱 聊天背景面板
           ========================================= */
        #chat-more-btn { background: none; border: none; cursor: pointer; font-size: 1.5rem; color: #555; padding: 0 5px; line-height: 1; transition: 0.2s; }
        #chat-more-btn:hover { color: #000; }
        #chat-bg-panel { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); backdrop-filter: blur(3px); z-index: 50; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.25s ease; }
        #chat-bg-panel.active { opacity: 1; pointer-events: auto; }
        #chat-bg-window { background: #fff; border-radius: 16px; padding: 20px; width: 280px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); transform: scale(0.95) translateY(10px); opacity: 0; transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s; }
        #chat-bg-panel.active #chat-bg-window { transform: scale(1) translateY(0); opacity: 1; }
        #chat-bg-titlebar { display: flex; align-items: center; margin-bottom: 18px; }
        #chat-bg-title { text-align: center; font-weight: bold; color: #111; font-size: 1.05rem; flex: 1; }
        #chat-bg-close { width: 30px; height: 30px; border: none; background: #f0f0f0; color: #555; border-radius: 50%; font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: 0.2s; }
        #chat-bg-close:hover { background: #ff3b30; color: #fff; }
        #chat-bg-grid { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; min-height: 80px; }
        .chat-bg-thumb { width: 75px; height: 75px; border-radius: 10px; object-fit: cover; cursor: pointer; border: 3px solid transparent; transition: 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .chat-bg-thumb:hover, .chat-bg-thumb.selected { border-color: #34c759; transform: scale(1.05); }
        .chat-bg-add { width: 75px; height: 75px; border-radius: 10px; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 2rem; color: #aaa; background: #fafafa; flex-shrink: 0; transition: 0.2s; }
        .chat-bg-add:hover { border-color: #34c759; color: #34c759; background: #f0fdf4; }
        #chat-bg-url-row { display: flex; gap: 8px; margin-bottom: 10px; }
        #chat-bg-url-input { flex: 1; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 0.85rem; color: #333; outline: none; min-width: 0; transition: 0.2s; }
        #chat-bg-url-input:focus { border-color: #34c759; box-shadow: 0 0 0 2px rgba(52,199,89,0.2); }
        #chat-bg-url-btn { background: #34c759; border: none; color: #fff; padding: 10px 16px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 0.85rem; white-space: nowrap; flex-shrink: 0; transition: 0.2s; }
        #chat-bg-url-btn:hover { background: #2fb350; }
        #chat-bg-clear-btn { width: 100%; background: #f5f5f5; border: none; color: #888; padding: 10px; cursor: pointer; font-size: 0.9rem; border-radius: 8px; transition: 0.2s; font-weight: bold; }
        #chat-bg-clear-btn:hover { color: #ff3b30; background: #fee2e2; }

        /* =========================================
           📐 RWD 響應式 — 平板 (max-width: 768px)
           ========================================= */
        @media (max-width: 768px) {
            /* 主頁 */
            h1 { font-size: 2.2rem; }
            .btn { font-size: 1rem; padding: 11px 28px; margin: 8px; }

            /* 章節選擇 */
            #chapter-window { width: 92vw; }

            /* 遊戲設定 */
            #game-settings-window { width: 88vw; }

            /* 對話框 */
            #text-panel-wrapper { width: 90%; bottom: 25px; }
            #text-panel { padding: 30px 35px; min-height: 120px; }
            #dialogue-text { font-size: 1.15rem; line-height: 1.8; }

            /* Log 面板 */
            #vn-log-header { padding: 0 30px 15px; }
            #vn-log-content { padding: 0 30px; }

            /* 系統提示框 */
            #sys-box { padding: 30px 35px; font-size: 1.1rem; }

            /* 物品彈窗 */
            #item-card { width: 85vw; }

            /* 手機裝置框：高度不超過 VN 容器（用 % 而非 vh，避免超出 phone-overlay） */
            #phone-device { width: min(380px, 90vw); height: min(700px, calc(100% - 30px)); }
        }

        /* =========================================
           📱 RWD 響應式 — 手機 (max-width: 480px)
           ========================================= */
        @media (max-width: 480px) {
            /* 主頁字體與按鈕 */
            h1 { font-size: 1.7rem; letter-spacing: 2px; }
            .btn { font-size: 0.9rem; padding: 10px 22px; margin: 6px; letter-spacing: 1px; }
            .menu-wrapper { padding: 30px 20px; }

            /* 章節選擇 */
            #chapter-window { width: 95vw; }
            #chapter-titlebar .ch-title { font-size: 1rem; letter-spacing: 2px; }
            .ch-item { padding: 11px 14px; }
            .ch-name { font-size: 0.88rem; }

            /* 遊戲頂部按鈕 */
            #btn-home { top: calc(10px + env(safe-area-inset-top, 0px)); right: 8px; padding: 6px 12px; font-size: 0.78rem; }
            #btn-settings { top: calc(10px + env(safe-area-inset-top, 0px)); right: 80px; padding: 6px 12px; font-size: 0.78rem; }
            body.layout-pad-ios #btn-home,
            body.layout-pad-ios #btn-settings,
            body.layout-pad-ios #btn-reader { top: 52px; }
            

            /* 背景標籤 */
            #top-badge { font-size: 0.82rem; letter-spacing: 1.5px; }

            /* 對話框全面縮小 */
            #text-panel-wrapper { width: 95%; bottom: 15px; }
            #text-panel { padding: 22px 20px 20px; min-height: 100px; }
            #speaker-name { font-size: 0.95rem; padding: 5px 18px; top: -18px; left: 15px; letter-spacing: 1px; }

            /* 右上角控制按鈕 */
            #vn-panel-controls { gap: 4px; right: 8px; top: -16px; }
            .vn-panel-btn { padding: 0 9px; height: 28px; font-size: 0.72rem; letter-spacing: 0; }

            /* 對話文字 */
            #dialogue-text { font-size: 1rem; line-height: 1.75; letter-spacing: 0.5px; }

            /* 系統提示框 */
            #sys-box { padding: 25px 22px; font-size: 1rem; letter-spacing: 1px; min-width: unset; width: auto; max-width: calc(100% - 40px); box-sizing: border-box; }
            #sys-title { font-size: 0.8rem; letter-spacing: 3px; }

            /* 轉場文字 */
            #trans-text { font-size: 1.2rem; letter-spacing: 4px; padding: 0 32px; }

            /* 物品彈窗 */
            #item-card { width: 90vw; padding: 35px 22px 25px; }
            #item-icon-box { width: 90px; height: 90px; }
            #item-title { font-size: 1.2rem; }
            #item-desc { font-size: 0.88rem; margin-bottom: 22px; padding: 10px; }
            #item-btn { padding: 10px 0; font-size: 0.9rem; }

            /* Log 面板 */
            #vn-log-header { padding: 0 18px 15px; }
            #vn-log-title { font-size: 1rem; }
            #vn-log-content { padding: 0 15px; gap: 12px; }
            .vn-log-item { padding: 12px 14px; }
            .vn-log-text { font-size: 0.95rem; }

            /* 遊戲設定面板 */
            #game-settings-window { width: 93vw; }
            #gs-titlebar .gs-title { font-size: 1rem; letter-spacing: 2px; }
            #gs-body { padding: 20px 18px; }
            .gs-section-title { letter-spacing: 1px; font-size: 0.85rem; }
            .gs-label { font-size: 0.82rem; min-width: 65px; }

            /* 手機裝置框：置中顯示，中等尺寸 */
            #phone-overlay { align-items: center; padding: 0; }
            #phone-device {
                width: min(310px, 82vw);
                height: min(560px, 74vh);
                border-radius: 30px;
                border-width: 7px;
                transform: translateY(110%);
            }
            #phone-overlay.active #phone-device { transform: translateY(0); }

            /* Call 模式 */
            #phone-call { padding-top: 42px; }
            #call-avatar { width: 100px; height: 100px; margin-bottom: 10px; }
            #call-name { font-size: 1.7rem; }
            #call-status { font-size: 0.9rem; margin-top: 6px; margin-bottom: 12px; }
            #call-subtitle-box { margin-top: 12px; width: 88%; padding: 10px 14px; max-height: 32%; }
            #phone-call.call-active { padding-top: 22px; justify-content: space-between; padding-bottom: 14px; }
            #phone-call.call-active #call-avatar { width: 62px; height: 62px; margin-bottom: 5px; }
            #phone-call.call-active #call-name { font-size: 1.2rem; }
            #phone-call.call-active #call-status { margin-top: 2px; margin-bottom: 0; }
            #phone-call.call-active #call-subtitle-box { margin-top: 0; max-height: 50%; }
            #phone-call.call-active .call-btn-group { margin-top: 0; padding-bottom: 0; }
            #call-sub-text { font-size: 0.95rem; }
            .call-btn-group { padding-bottom: 12px; }
            .c-btn { width: 62px; height: 62px; font-size: 1.3rem; }
            .c-btn-label { font-size: 0.72rem; }

            /* 設定頁面 */
            .setting-row, .cfg-tab-bar, .cfg-tab-panel { width: 90%; max-width: 600px; }

            /* 頭像管理 */
            .avatar-preview { width: 48px; height: 48px; }
            .avatar-mgr-name { font-size: 0.88rem; }
        }

        /* =========================================
           📱 超小螢幕 (max-width: 360px)
           ========================================= */
        @media (max-width: 360px) {
            h1 { font-size: 1.4rem; }
            #dialogue-text { font-size: 0.92rem; }
            #char-portrait { width: 140px; height: 140px; }
            .c-btn { width: 54px; height: 54px; font-size: 1.1rem; }
            #call-avatar { width: 90px; height: 90px; }
            #call-name { font-size: 1.4rem; }
            #phone-call.call-active #call-avatar { width: 56px; height: 56px; }
            #phone-call.call-active #call-name { font-size: 1.1rem; }
        }

        /* ⏳ 資料中心選項 Loading 遮罩 */
        #vn-choice-loading-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(5,5,8,0.92); backdrop-filter: blur(10px);
            z-index: 9999; display: flex; flex-direction: column; justify-content: center; align-items: center;
            opacity: 0; pointer-events: none; transition: opacity 0.3s ease;
        }
        #vn-choice-loading-overlay.active { opacity: 1; pointer-events: auto; }
        .vn-cl-spinner {
            width: 40px; height: 40px; border: 3px solid rgba(212,175,55,0.2);
            border-top-color: var(--gold); border-radius: 50%;
            animation: spin 0.8s linear infinite; margin-bottom: 16px;
        }
        .vn-cl-text {
            color: var(--gold); font-family: var(--font-classic); font-size: 1rem;
            letter-spacing: 4px; text-shadow: 0 0 10px rgba(212,175,55,0.4);
        }
    `;

    // === 注入樣式 ===
    const doc = window.parent.document || document;
    if (!doc.getElementById('vn-player-app-css')) {
        const s = doc.createElement('style');
        s.id = 'vn-player-app-css';
        s.innerHTML = appStyle;
        doc.head.appendChild(s);
    }

    // === HTML 模板 ===
    const vnHTML = `
    <div class="vn-root">
        <div class="vn-container">
            <div id="page-home" class="page">
    <div class="home-bg-fx">
        <div class="glow-orb gold"></div>
        <div class="glow-orb cyan"></div>
    </div>
    
    <div class="home-frame">
        <div class="corner tl"></div><div class="corner tr"></div>
        <div class="corner bl"></div><div class="corner br"></div>
    </div>

    <div class="menu-wrapper">
        <div class="title-group">
            <h1>Stellar Nexus</h1>
            <div class="subtitle">
                <span class="line"></span>
                <span class="text">Interactive Visual Novel</span>
                <span class="line"></span>
            </div>
        </div>
        
        <button class="btn primary" id="btn-vn-st-chapter" onclick="window.VN_PLAYER.openChapterPanel()">選擇章節</button>
        <button class="btn" onclick="window.VN_PLAYER.switchPage('page-settings')">系統設置</button>
        
        <div class="version-text">VER 8.5 // SFX MODULE</div>
    </div>
</div>

            <div id="page-settings" class="page hidden">
                <div class="menu-wrapper" style="justify-content: flex-start; padding-top: calc(50px + env(safe-area-inset-top, 0px)); height: auto; min-height: 100%;">

                    <div class="cfg-tab-wrap">
                    <div class="cfg-tab-bar">
                        <button class="cfg-tab-btn active" onclick="window.VN_PLAYER.switchCfgTab('cfg-tab-basic', this)">⚙️ 基本</button>
                        <button class="cfg-tab-btn" onclick="window.VN_PLAYER.switchCfgTab('cfg-tab-prompt', this)">🎨 Prompt</button>
                        <button class="cfg-tab-btn" onclick="window.VN_PLAYER.switchCfgTab('cfg-tab-avatar', this)">🎭 頭像</button>
                    </div>

                    <div id="cfg-tab-basic" class="cfg-tab-panel active">
                        <div class="setting-row">
                            <label>🏠 主頁背景圖</label>
                            <input type="text" id="cfg-home-bg-base" placeholder="https://example.com/bg/" style="margin-bottom:8px;">
                            <div style="display:flex; gap:8px; align-items:center;">
                                <input type="number" id="cfg-home-bg-count" placeholder="圖片數量" min="1" style="width:50%; flex:1;">
                                <select id="cfg-home-bg-ext" style="width:50%; flex:1; padding:10px; background:rgba(0,0,0,0.6); border:1px solid #333; color:var(--text-light); border-radius:2px; box-sizing:border-box; transition:0.3s;">
                                    <option value="jpg">JPG</option>
                                    <option value="jpeg">JPEG</option>
                                    <option value="png">PNG</option>
                                    <option value="webp">WEBP</option>
                                </select>
                            </div>
                            <p style="color:#666; font-size:0.78rem; margin:6px 0 0; line-height:1.5;">填入目錄 URL + 數量，檔案命名為 1.jpg、2.jpg… 系統每次隨機抽取。</p>
                        </div>
                        <div class="setting-row"><label>🎵 遊戲 BGM 目錄</label><input type="text" id="cfg-bgm" placeholder="./bgm/"></div>
                        <div class="setting-row"><label>🔊 音效目錄</label><input type="text" id="cfg-sfx" placeholder="./sfx/"></div>
                        <div class="setting-row"><label>🖼️ 立繪目錄</label><input type="text" id="cfg-sprite" placeholder="./sprites/"></div>
                        <div class="setting-row"><label>🧍 角色預設圖目錄（Fallback 1）</label><input type="text" id="cfg-char-default-base" placeholder="./presets/  →  自動拼接 角色名_presets.png"></div>
                        <div class="setting-row">
                            <label>🌑 最終預設立繪（Fallback 2 · 終極保底）<span style="font-weight:normal; color:#888; font-size:0.8em;"> 所有取圖渠道失敗時顯示，不套頭像框</span></label>
                            <input type="text" id="cfg-final-fallback-sprite" placeholder="https://files.catbox.moe/9je7j2.png" style="width:100%; padding:8px 10px; background:rgba(0,0,0,0.6); border:1px solid #333; color:#f5f6fa; border-radius:2px; box-sizing:border-box; font-size:0.9rem;">
                            <p style="color:#666; font-size:0.78rem; margin:4px 0 0; line-height:1.5;">填入任意圖片 URL。建議用透明背景 PNG 剪影，不設定則使用預設剪影。</p>
                        </div>
                        <div class="setting-row">
                            <label>😄 表情包資料夾</label>
                            <input class="cfg-input" id="cfg-sticker" placeholder="https://cdn.com/stickers/ 或 ./stickers/">
                        </div>
                        <div class="setting-row">
                            <label>📚 Context 保留最近幾章全文 <span style="font-weight:normal; color:#888; font-size:0.8em;">（其餘舊章節自動縮成摘要，節省 Token）</span></label>
                            <input type="number" id="cfg-ctx-chapters" min="1" max="20" placeholder="5" style="width:120px;">
                            <p style="color:#666; font-size:0.78rem; margin:4px 0 0; line-height:1.5;">建議 3–6 章。超出的舊章節只送 &lt;summary&gt; 的 plot: 欄位，不送完整正文。設 0 或留空 = 全送（不限制）。</p>
                        </div>
                    </div>

                    <div id="cfg-tab-prompt" class="cfg-tab-panel">
                        <div class="setting-row">
                            <label>🧑‍🎨 VN頭像追加詞 <span style="font-weight:normal; color:#888; font-size:0.8em;">（選填，插入在 OS通用底詞 與 角色描述詞 之間）</span></label>
                            <textarea id="cfg-avatar-prompt" rows="3" placeholder="例：detailed face, soft lighting, bust shot..." style="width:100%; padding:10px; background:rgba(0,0,0,0.6); border:1px solid #333; color:#f5f6fa; border-radius:2px; box-sizing:border-box; resize:vertical; font-family:inherit; font-size:0.9rem; line-height:1.5; transition:0.3s;"></textarea>
                            <p style="color:#666; font-size:0.78rem; margin:4px 0 0; line-height:1.5;">最終 prompt ＝ <span style="color:#a0c4ff;">OS通用底詞</span> ＋ <span style="color:#ffd6a5;">此追加詞</span> ＋ <span style="color:#b9fbc0;">角色描述詞</span> ＋ 表情</p>
                        </div>
                        <div class="setting-row">
                            <label>🚫 頭像 Negative Prompt</label>
                            <textarea id="cfg-avatar-neg-prompt" rows="2" style="width:100%; padding:10px; background:rgba(0,0,0,0.6); border:1px solid #553333; color:#f5c6c6; border-radius:2px; box-sizing:border-box; resize:vertical; font-family:inherit; font-size:0.9rem; line-height:1.5; transition:0.3s;"></textarea>
                        </div>
                        <div class="setting-row">
                            <label>🌄 背景生圖預設提示詞</label>
                            <textarea id="cfg-bg-prompt" rows="3" placeholder="例：cinematic, detailed background, ambient lighting..." style="width:100%; padding:10px; background:rgba(0,0,0,0.6); border:1px solid #333; color:#f5f6fa; border-radius:2px; box-sizing:border-box; resize:vertical; font-family:inherit; font-size:0.9rem; line-height:1.5; transition:0.3s;"></textarea>
                        </div>
                        <div class="setting-row">
                            <label>🚫 背景 Negative Prompt</label>
                            <textarea id="cfg-bg-neg-prompt" rows="2" style="width:100%; padding:10px; background:rgba(0,0,0,0.6); border:1px solid #553333; color:#f5c6c6; border-radius:2px; box-sizing:border-box; resize:vertical; font-family:inherit; font-size:0.9rem; line-height:1.5; transition:0.3s;"></textarea>
                        </div>
                        <div class="setting-row">
                            <label>📦 物品底詞</label>
                            <textarea id="cfg-item-prompt" rows="2" style="width:100%; padding:10px; background:rgba(0,0,0,0.6); border:1px solid #333; color:#f5f6fa; border-radius:2px; box-sizing:border-box; resize:vertical; font-family:inherit; font-size:0.9rem; line-height:1.5; transition:0.3s;"></textarea>
                        </div>
                        <div class="setting-row">
                            <label>🚫 物品 Negative Prompt</label>
                            <textarea id="cfg-item-neg-prompt" rows="2" style="width:100%; padding:10px; background:rgba(0,0,0,0.6); border:1px solid #553333; color:#f5c6c6; border-radius:2px; box-sizing:border-box; resize:vertical; font-family:inherit; font-size:0.9rem; line-height:1.5; transition:0.3s;"></textarea>
                        </div>
                    </div>

                    <div id="cfg-tab-avatar" class="cfg-tab-panel">
                        <div class="setting-row" id="avatar-mgr-wrap">
                            <label>🎭 角色立繪快取 (防重複生圖)</label>
                            <div id="avatar-mgr-list"></div>
                        </div>
                        <p style="color:#888; font-size:0.85rem; line-height: 1.5; margin-bottom: 20px;">* 生圖已全數自動接管至 OS_IMAGE_MANAGER。</p>
                    </div>

                    </div><button class="btn" onclick="window.VN_PLAYER.saveConfig()" style="margin-top:10px;">保存並返回</button>
                </div>
            </div>

            <div id="page-game" class="page hidden">
                <button id="btn-home" onclick="window.VN_PLAYER.stopGame()" title="Home">退出</button>
                <button id="btn-settings" onclick="window.VN_PLAYER.openGameSettings()" title="Config">設定</button>
                <button id="btn-reader" onclick="window.VN_PLAYER.showReaderPanel()" title="劇情閱讀器">📖</button>
                <div id="stream-header" class="hidden">
                    <div id="stream-live-badge"><div class="stream-live-dot"></div><span id="stream-live-text">LIVE</span></div>
                    <span id="stream-title-text"></span>
                    <div class="stream-divider"></div>
                    <span id="stream-host-text"></span>
                    <div id="stream-stats">
                        <span class="stream-stat"><span class="stream-stat-icon">👁</span><span class="stream-stat-val" id="stream-viewers"></span></span>
                        <span class="stream-stat"><span class="stream-stat-icon">❤</span><span class="stream-stat-val" id="stream-followers"></span></span>
                        <span class="stream-stat"><span class="stream-stat-icon">🏆</span><span class="stream-rank-val" id="stream-rank"></span></span>
                    </div>
                </div>
                <div id="stream-rank-panel" class="hidden">
                    <div id="stream-rank-header">🎖 粉絲榜</div>
                    <div class="stream-rank-row">
                        <span class="stream-rank-medal">🥇</span>
                        <div class="stream-rank-info">
                            <span class="stream-rank-name" id="sr-name-1"></span>
                            <span class="stream-rank-title" id="sr-title-1"></span>
                        </div>
                        <span class="stream-rank-score">▲<span id="sr-score-1"></span></span>
                    </div>
                    <div class="stream-rank-row">
                        <span class="stream-rank-medal">🥈</span>
                        <div class="stream-rank-info">
                            <span class="stream-rank-name" id="sr-name-2"></span>
                            <span class="stream-rank-title" id="sr-title-2"></span>
                        </div>
                        <span class="stream-rank-score">▲<span id="sr-score-2"></span></span>
                    </div>
                    <div class="stream-rank-row">
                        <span class="stream-rank-medal">🥉</span>
                        <div class="stream-rank-info">
                            <span class="stream-rank-name" id="sr-name-3"></span>
                            <span class="stream-rank-title" id="sr-title-3"></span>
                        </div>
                        <span class="stream-rank-score">▲<span id="sr-score-3"></span></span>
                    </div>
                    <div id="stream-scene-row" class="hidden">
                        <span id="stream-scene-icon">📍</span>
                        <span id="stream-scene-label"></span>
                    </div>
                </div>
                <div id="game-bg"></div>
                <div id="game-char-container"><img id="game-char" src="" alt="character" onerror="window.VN_Core.handleImgError(this)"></div>
                <div id="scene-cg-overlay" onclick="window.VN_Core.next()"><img id="scene-cg-img" src="" alt="scene cg"></div>

                <div id="top-badge"></div>
                <div id="danmu-container"></div>
                <img id="char-portrait" src="" alt="">

                <div id="text-panel-wrapper" onclick="window.VN_Core.handlePanelClick()">
                    <div id="text-panel">
                        <div id="speaker-name">System</div>

                        <div id="vn-panel-controls">
                            <div id="vn-ctx-popup" onclick="event.stopPropagation()">
                                <div class="ctx-title">📊 上下文</div>
                                <div class="ctx-bar-wrap">
                                    <div class="ctx-bar-track"><div class="ctx-bar-fill" id="ctx-bar-fill"></div></div>
                                    <div class="ctx-usage-text" id="ctx-usage-text">—</div>
                                </div>
                                <div class="ctx-row"><span class="ctx-label">↑ 發送 Tokens</span><span class="ctx-val" id="ctx-tokens">—</span></div>
                                <div class="ctx-row"><span class="ctx-label">↑ 發送 Chars</span><span class="ctx-val" id="ctx-chars">—</span></div>
                                <div class="ctx-row"><span class="ctx-label">↓ 回應 Tokens</span><span class="ctx-val" id="ctx-recv-tokens">—</span></div>
                                <div class="ctx-row"><span class="ctx-label">↓ 回應 Chars</span><span class="ctx-val" id="ctx-recv-chars">—</span></div>
                                <div class="ctx-row"><span class="ctx-label">訊息數</span><span class="ctx-val" id="ctx-msgs">—</span></div>
                                <div class="ctx-limit-row">
                                    <span class="ctx-limit-label">⚠️ 警戒 Tokens</span>
                                    <input class="ctx-limit-input" id="ctx-limit-input" type="number" min="1000" max="2000000" value="50000" onchange="window.VN_Core._saveCtxLimit(this.value)" />
                                </div>
                                <div class="ctx-time" id="ctx-time">尚未偵測到數據</div>



                            </div>
                            <button class="vn-panel-btn" id="vn-btn-log" onclick="window.VN_Core.showLog(); event.stopPropagation();">Log</button>
                            <button class="vn-panel-btn" id="vn-btn-think" onclick="window.VN_PLAYER.showThinkPopup(); event.stopPropagation();" title="本章思考鏈">💭</button>
                            <button class="vn-panel-btn" id="vn-btn-skip" onclick="window.VN_Core.toggleSkip(); event.stopPropagation();">Skip</button>
                            <button class="vn-panel-btn" id="vn-btn-ctx" onclick="window.VN_Core.toggleCtx(); event.stopPropagation();">Ctx</button>
                            <button class="vn-panel-btn" id="vn-btn-regen" style="display:none;color:#f6ad55;" onclick="window.VN_Core.regenCurrentTTS(); event.stopPropagation();" title="清除快取並重新生成當前語音">↺ TTS</button>
                        </div>

                        <div id="dialogue-text">讀取中...</div>
                        <div class="hint-text">▼</div>
                    </div>
                </div>

                <div id="vn-end-overlay">
                    <button id="vn-end-btn-data">資料中心</button>
                </div>

                <div id="vn-log-overlay">
                    <div id="vn-log-header">
                        <div id="vn-log-title">對話紀錄</div>
                        <div class="vn-log-close" onclick="window.VN_Core.hideLog()">✕</div>
                    </div>
                    <div id="vn-log-content"></div>
                </div>
                
                <div id="vn-choice-loading-overlay">
                    <div class="vn-cl-spinner"></div>
                    <div class="vn-cl-text">AI 命運編織中...</div>
                </div>

                <div id="vn-think-popup">
                    <div id="vn-think-popup-header">
                        <span id="vn-think-popup-title">💭 本章思考鏈</span>
                        <span id="vn-think-popup-close" onclick="window.VN_PLAYER.hideThinkPopup()">✕</span>
                    </div>
                    <div id="vn-think-popup-body"></div>
                </div>

                <div id="vn-reader-overlay">
                    <div id="vn-reader-header">
                        <div id="vn-reader-title">📖 劇情閱讀器</div>
                        <div id="vn-reader-close" onclick="window.VN_PLAYER.hideReaderPanel()">✕</div>
                    </div>
                    <div id="vn-reader-tabs" style="display:none"></div>
                    <div id="vn-reader-body"></div>
                </div>

                <div id="sys-overlay" onclick="window.VN_Core.next()">
                    <div id="sys-box">
                        <div id="sys-title"></div>
                        <div id="sys-text"></div>
                    </div>
                </div>

                <div id="quest-overlay" onclick="window.VN_Core.next()">
                    <div id="quest-card">
                        <div id="quest-header">✦ Quest ✦</div>
                        <div id="quest-title"></div>
                        <div id="quest-requester">委託人 · <span id="quest-requester-name"></span></div>
                        <div id="quest-desc"></div>
                        <div id="quest-reward-row">
                            <span id="quest-reward-label">🏆 Reward</span>
                            <span id="quest-reward"></span>
                        </div>
                        <button id="quest-confirm" onclick="window.VN_Core.next(); event.stopPropagation();">接受委託</button>
                    </div>
                </div>

                <div id="trans-overlay" onclick="window.VN_Core.next()">
                    <div id="trans-text"></div>
                </div>

                <div id="item-overlay">
                    <div id="item-card">
                        <div class="item-close" onclick="window.VN_Core.next()">✕</div>
                        <div id="item-icon-box"><img id="item-img" src=""></div>
                        <div id="item-title"></div>
                        <div id="item-desc"></div>
                        <button id="item-btn" onclick="window.VN_Core.next()">確認</button>
                    </div>
                </div>

                <div id="achievement-overlay" onclick="window.VN_Core.dismissAchievement()">
                    <div id="achievement-card">
                        <div id="achievement-icon">🏆</div>
                        <div id="achievement-body">
                            <div id="achievement-label">ACHIEVEMENT UNLOCKED</div>
                            <div id="achievement-name"></div>
                            <div id="achievement-desc"></div>
                        </div>
                        <div id="achievement-dismiss">✕</div>
                    </div>
                </div>

                <div id="vn-bgm-toast">
                    <div id="vn-bgm-card">
                        <div id="vn-bgm-icon">🎵</div>
                        <div id="vn-bgm-body">
                            <div id="vn-bgm-label">NOW PLAYING</div>
                            <div id="vn-bgm-name"></div>
                        </div>
                    </div>
                </div>

                <div id="phone-overlay">
                    <div id="phone-device">
                        <div id="phone-chat" class="hidden" onclick="window.VN_Core.next()">
                            <img id="chat-bg-img" src="" style="display:none;">
                            <div id="chat-header">
                                <span style="font-size: 1.2rem; cursor:pointer;" onclick="window.VN_Core.closeChat(); event.stopPropagation()">&lt;</span>
                                <span id="chat-title" style="font-weight:bold; font-size: 1.1rem;">Name</span>
                                <button id="chat-more-btn" onclick="window.VN_PLAYER.openChatBgPanel(); event.stopPropagation()">···</button>
                            </div>
                            <div id="chat-body"></div>

                            <div id="sticker-panel" onclick="event.stopPropagation()">
                                <div id="sticker-tabs-row">
                                    <div id="sticker-tabs"></div>
                                </div>
                                <div id="sticker-grid"></div>
                            </div>

                            <div id="chat-footer" onclick="event.stopPropagation()">
                                <button id="chat-plus-btn" onclick="window.VN_Sticker.togglePanel(); event.stopPropagation()">+</button>
                                <div id="chat-input-wrap">
                                    <input type="text" id="chat-input" placeholder="發送消息..." readonly>
                                </div>
                                <button id="chat-mic-btn">🎤</button>
                            </div>

                            <div id="chat-bg-panel" onclick="event.stopPropagation()">
                                <div id="chat-bg-window">
                                    <div id="chat-bg-titlebar">
                                        <div id="chat-bg-title">聊天背景</div>
                                        <button id="chat-bg-close" onclick="window.VN_PLAYER.closeChatBgPanel()">✕</button>
                                    </div>
                                    <div id="chat-bg-grid">
                                        <input type="file" id="chat-bg-file" accept="image/*" style="display:none;" onchange="window.VN_PLAYER.handleChatBgFile(this)">
                                        <div class="chat-bg-add" onclick="document.getElementById('chat-bg-file').click()">+</div>
                                    </div>
                                    <div id="chat-bg-url-row">
                                        <input type="text" id="chat-bg-url-input" placeholder="輸入圖片 URL...">
                                        <button id="chat-bg-url-btn" onclick="window.VN_PLAYER.applyChatBgUrl()">確定</button>
                                    </div>
                                    <button id="chat-bg-clear-btn" onclick="window.VN_PLAYER.clearChatBg()">清除背景</button>
                                </div>
                            </div>
                        </div>
                        <div id="phone-call" class="hidden">
                            <div id="call-status">來電</div>
                            <img id="call-avatar" src="" onerror="window.VN_Core.handleImgError(this)">
                            <div id="call-name">Name</div>

                            <div id="call-subtitle-box" class="hidden" onclick="window.VN_Core.next()">
                                <div id="call-sub-name"></div>
                                <div id="call-sub-text"></div>
                            </div>

                            <div class="call-btn-group" id="call-incoming-btns">
                                <div class="call-btn-wrap">
                                    <button class="c-btn btn-red" onclick="window.VN_Core.rejectCall()">✕</button>
                                </div>
                                <div class="call-btn-wrap">
                                    <button class="c-btn btn-green" onclick="window.VN_Core.answerCall()">📞</button>
                                </div>
                            </div>
                            <div class="call-btn-group hidden" id="call-active-btns">
                                <div class="call-btn-wrap">
                                    <button class="c-btn btn-gray" onclick="window.VN_Core.next()">🔇</button>
                                </div>
                                <div class="call-btn-wrap">
                                    <button class="c-btn btn-gray" onclick="window.VN_Core.next()">📢</button>
                                </div>
                                <div class="call-btn-wrap">
                                    <button class="c-btn btn-red" onclick="window.VN_Core.hangUpCall()">✕</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <audio id="bgm-player" loop></audio>

                <div id="html-block-overlay" style="display:none;"></div>

                <div id="game-settings-overlay">
                    <div id="game-settings-window">
                        <div id="gs-titlebar">
                            <span class="gs-title">設定</span>
                            <button class="gs-close" onclick="window.VN_PLAYER.closeGameSettings()">✕</button>
                        </div>
                        <div id="gs-body">
                            <div class="gs-section-title">⚙ 基礎設置</div>
                            <div class="gs-row"><span class="gs-label">字體大小</span><input type="range" class="gs-slider" id="gs-font-size" min="12" max="24" value="19" oninput="window.VN_Settings.applyFontSize(this.value)"><span class="gs-val" id="gs-font-size-val">19px</span></div>
                            <div class="gs-row"><span class="gs-label">打字速度</span><input type="range" class="gs-slider" id="gs-tw-speed" min="10" max="100" value="30" oninput="window.VN_Settings.applyTwSpeed(this.value)"><span class="gs-val" id="gs-tw-speed-val">30ms</span></div>
                            <div class="gs-row"><span class="gs-label">彈幕速度</span><input type="range" class="gs-slider" id="gs-danmu-speed" min="6" max="30" value="18" oninput="window.VN_Settings.applyDanmuSpeed(this.value)"><span class="gs-val" id="gs-danmu-speed-val">18s</span></div>
                            <div class="gs-row"><span class="gs-label">BGM 音量</span><input type="range" class="gs-slider" id="gs-bgm-vol" min="0" max="100" value="10" oninput="window.VN_Settings.applyBgmVol(this.value)"><span class="gs-val" id="gs-bgm-vol-val">10%</span></div>
                            <div class="gs-row"><span class="gs-label">音效音量</span><input type="range" class="gs-slider" id="gs-sfx-vol" min="0" max="100" value="50" oninput="window.VN_Settings.applySfxVol(this.value)"><span class="gs-val" id="gs-sfx-vol-val">50%</span></div>
                            <div class="gs-row"><span class="gs-label">語音音量</span><input type="range" class="gs-slider" id="gs-tts-vol" min="0" max="100" value="80" oninput="window.VN_Settings.applyTtsVol(this.value)"><span class="gs-val" id="gs-tts-vol-val">80%</span></div>
                            <div class="gs-row" style="margin-top:4px;">
                                <button class="gs-reset-btn" style="width:100%; text-align:center;" onclick="window.VN_PLAYER.closeGameSettings(); (window.AureliaLoader?.openPhoneApp?.('設置') || window.AureliaControlCenter?.showOsApp?.('設置'));">⚙ 開啟語音 / 圖片主設置</button>
                            </div>
                            <hr class="gs-divider">
                            <div class="gs-section-title">🎨 字體顏色設置</div>
                            <div class="gs-color-row"><span class="gs-color-label">文章字體顏色</span><input type="color" class="gs-color-input" id="gs-text-color" value="#dcd8d0" oninput="window.VN_Settings.applyTextColor(this.value)"></div>
                            <div class="gs-color-row"><span class="gs-color-label">內心獨白顏色</span><input type="color" class="gs-color-input" id="gs-inner-color" value="#d4af37" oninput="window.VN_Settings.applyInnerColor(this.value)"></div>
                            <div class="gs-color-row"><span class="gs-color-label">名稱標籤字體顏色</span><input type="color" class="gs-color-input" id="gs-name-color" value="#d4af37" oninput="window.VN_Settings.applyNameColor(this.value)"></div>
                            <hr class="gs-divider">
                            <button class="gs-reset-btn" onclick="window.VN_Settings.resetColors()">重置為默認顏色</button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="chapter-overlay">
                <div id="chapter-window">
                    <div id="chapter-titlebar">
                        <span class="ch-title">章節選擇</span>
                        <button class="ch-close" onclick="window.VN_PLAYER.closeChapterPanel()">✕</button>
                    </div>
                    <div id="chapter-subheader">🌐 來源: 酒館 AI 實時數據庫</div>
                    <div id="chapter-list-wrap">
                        <div id="chapter-list"></div>
                    </div>
                </div>
            </div>

            <div id="vn-gen-overlay">
                <div id="vn-gen-window">
                    <div id="vn-gen-titlebar">
                        <span class="gen-title">✨ AI 生成劇情</span>
                        <button class="gen-close" onclick="window.VN_PLAYER.closeGeneratePanel()">✕</button>
                    </div>
                    <div id="vn-gen-columns">
                        <div id="vn-gen-body">
                            <div class="vn-gen-col-hd">✍️ 自由生成</div>
                            <label>開場白標題 <span style="color:rgba(255,255,255,0.3); font-size:0.75rem; letter-spacing:0;">(選填，填了才會儲存/覆蓋)</span></label>
                            <input id="vn-gen-title" type="text" placeholder="例：雨天咖啡廳初見" autocomplete="off" />
                            <label>劇情指引 <span style="color:rgba(255,255,255,0.3); font-size:0.75rem; letter-spacing:0;">(選填，留空則 AI 自由發揮)</span></label>
                            <textarea id="vn-gen-request" placeholder="例：繼續上次在咖啡廳的相遇，加入一段雨天的邂逅...&#10;&#10;或留空讓 AI 自由創作"></textarea>
                            <button id="vn-gen-submit" onclick="window.VN_PLAYER.generateStory()">🚀 開始生成</button>
                            <div id="vn-gen-presets-wrap">
                                <div class="vn-gen-presets-hd">
                                    <span>📂 已儲存的開場白</span>
                                    <span id="vn-gen-presets-count"></span>
                                </div>
                                <div id="vn-gen-presets"></div>
                            </div>
                        </div>
                        <div id="vn-gen-card-col">
                            <div class="vn-gen-col-hd">📚 書架角色卡</div>
                            <div id="vn-gen-card-list"></div>
                            <button id="vn-gen-card-dive" onclick="window.VN_PLAYER.diveSelectedCard()">🎭 與TA相遇</button>
                        </div>
                    </div>
                    <div id="vn-gen-status"></div>
                </div>
            </div>
        </div>
    </div>
    `;

    // === 導出供 vn_core.js 使用 ===
    window.VN_STYLES = { vnHTML };

    console.log('[PhoneOS] vn_styles.js 已載入 (完美層次黑金版 + SFX 音效 + 主頁背景音樂支援)');
})();