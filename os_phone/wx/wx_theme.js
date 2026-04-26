// ----------------------------------------------------------------
// [檔案 3] wx_theme.js (V104.0 - Background Preview)
// 修正：新增聊天背景的預覽樣式 (長方形)。
// ----------------------------------------------------------------
(function() {
    window.WX_THEME = {
        version: 'v104.0-bg-preview',
        css: `
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap');
            @keyframes popIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
            
            .wx-shell { width: 100%; height: 100%; background: #f2f2f2; display: flex; flex-direction: column; overflow: hidden; font-family: 'Noto Sans SC', sans-serif; }
            /* ... (保留原本的樣式) ... */
            .wx-source-details { border: 1px dashed #ccc; background: #f9f9f9; border-radius: 4px; margin: 5px 0; padding: 2px 8px; font-size: 12px; color: #666; width: fit-content; max-width: 100%; }
            .wx-source-details summary { cursor: pointer; outline: none; font-weight: bold; user-select: none; color: #888; }
            .wx-code-content { display: block; white-space: pre-wrap; font-family: monospace; font-size: 11px; color: #2c662d; margin-top: 5px; padding: 5px; background: #fff; border: 1px solid #eee; overflow-x: auto; }

            .wx-header { background: #ededed; height: calc(45px + env(safe-area-inset-top, 0px)); flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; padding-top: env(safe-area-inset-top, 0px); border-bottom: 1px solid #dcdcdc; z-index: 20; }
            .wx-header-title { font-weight: 600; font-size: 16px; color: #000; }
            .wx-back-btn { cursor: pointer; display: flex; align-items: center; font-size: 15px; color: #000; font-weight: 500; opacity: 0; pointer-events: none; transition: opacity 0.2s;}
            .wx-back-btn.show { opacity: 1; pointer-events: auto; }
            .wx-back-btn:before { content: '‹'; margin-right: 2px; font-size: 28px; line-height: 20px; position: relative; top: -2px;}
            
            .wx-plus-menu-pop { position: fixed; background: #4c4c4c; border-radius: 6px; padding: 5px 0; box-shadow: 0 5px 15px rgba(0,0,0,0.5); z-index: 1000001; animation: popIn 0.2s; min-width: 160px; }
            .wx-menu-item { padding: 12px 20px; color: #fff; font-size: 15px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1); }
            .wx-menu-item:last-child { border-bottom: none; }
            .wx-menu-item:active { background: rgba(0,0,0,0.2); }
            .wx-menu-item .icon { font-size: 18px; width: 24px; text-align:center; }
            
            .wx-context-menu { position: fixed; background: #fff; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: 1000002; animation: popIn 0.1s; min-width: 120px; overflow: hidden; }
            .wx-context-item { padding: 12px 15px; font-size: 14px; color: #333; cursor: pointer; border-bottom: 1px solid #f0f0f0; }
            .wx-context-item:active { background: #f5f5f5; }
            .wx-context-item.danger { color: #fa5151; }

            /* Settings Panel */
            .wx-settings-panel { background: #f7f7f7; display: flex; flex-direction: column; gap: 10px; padding-bottom: 20px; }
            .wx-set-group { background: #fff; border-top: 1px solid #ededed; border-bottom: 1px solid #ededed; padding: 0 15px; margin-top: 10px; }
            .wx-set-item { display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-bottom: 1px solid #f0f0f0; }
            .wx-set-item:last-child { border-bottom: none; }
            .wx-set-label { font-size: 15px; color: #000; }
            .wx-set-val { font-size: 14px; color: #888; display: flex; align-items: center; gap: 5px; cursor: pointer; }
            .wx-set-val:after { content: '›'; font-size: 20px; color: #ccc; margin-left: 5px; margin-top: -2px;}
            .wx-avatar-preview-circle { width: 50px; height: 50px; border-radius: 50%; background-size: cover; background-color: #eee; border: 1px solid #ddd; }
            /* [新增] 背景預覽框 (長方形) */
            .wx-bg-preview { width: 60px; height: 60px; border-radius: 6px; background-size: cover; background-position: center; background-color: #eee; border: 1px solid #ddd; cursor: pointer; display: flex; align-items: center; justify-content: center; }

            .wx-member-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; padding: 15px 0; }
            .wx-member-item { display: flex; flex-direction: column; align-items: center; gap: 5px; }
            .wx-member-avatar { width: 45px; height: 45px; border-radius: 4px; background-color: #eee; background-size: cover; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
            .wx-member-name { font-size: 11px; color: #666; width: 45px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .wx-member-add { border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 20px; background: #fff; cursor: pointer; }

            .wx-modal-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 1000005; display: none; align-items: center; justify-content: center; backdrop-filter: blur(2px); animation: fadeIn 0.2s; }
            .wx-modal-overlay.show { display: flex; }
            .wx-modal-box { background: #fff; width: 85%; border-radius: 12px; padding: 20px 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.25); animation: popIn 0.25s; display: flex; flex-direction: column; gap: 10px; max-height: 85%; overflow-y: auto; }
            .wx-modal-title { font-size: 16px; font-weight: 600; text-align: center; margin-bottom: 5px; color: #333; }
            .wx-modal-input { width: 100%; padding: 10px; border: 1px solid #ddd; background: #f9f9f9; border-radius: 6px; box-sizing: border-box; font-size: 14px; outline: none; transition: border 0.2s; color:#000; }
            .wx-modal-input:focus { border-color: #07c160; background: #fff; }
            .wx-modal-input.hidden { display: none; }
            .wx-modal-footer { display: flex; gap: 10px; margin-top: 10px; }
            .wx-btn { flex: 1; padding: 10px 0; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; text-align: center; }
            .wx-btn-cancel { background: #f2f2f2; color: #333; }
            .wx-btn-confirm { background: #07c160; color: #fff; }

            .wx-page-container { flex: 1; position: relative; overflow: hidden; width: 100%; display: flex; flex-direction: column; height: calc(100% - 45px); }
            .wx-page-list { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow-y: auto; background: #fff; transition: transform 0.3s; z-index: 1; }
            .wx-page-room { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; background: #f2f2f2; transform: translateX(100%); transition: transform 0.3s; display: flex; flex-direction: column; z-index: 2; }
            .wx-page-room.active { transform: translateX(0); }
            .wx-room-bg { position: absolute; top:0; left:0; width:100%; height:100%; background-size:cover; background-position:center; background-repeat:no-repeat; z-index:0; pointer-events:none; }
            .wx-room-bg-overlay { position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0); z-index:1; pointer-events:none; transition: background 0.3s; }
            .wx-page-room.has-bg .wx-room-bg-overlay { background: rgba(0,0,0,0.22); }
            .wx-room-scroll { flex:1; overflow-y:auto; position:relative; z-index:2; padding-bottom:70px; }
            .wx-page-room.has-bg .wx-group-name { color:#fff; text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.7); }
            .wx-page-room.has-bg .wx-system-notice { background: rgba(0,0,0,0.38); color:#fff; backdrop-filter: blur(4px); }
            .wx-chat-item { display: flex; padding: 12px 16px; border-bottom: 1px solid #f2f2f2; cursor: pointer; background: #fff; min-height: 70px; box-sizing: border-box; }
            .wx-chat-item:active { background: #f5f5f5; }
            .wx-avatar { width: 48px; height: 48px; border-radius: 6px; margin-right: 12px; background-size: cover; background-position: center; flex-shrink: 0; background-color: #eee; position: relative; }
            .wx-badge { position: absolute; top: -6px; right: -6px; background: #fa5151; color: white; font-size: 10px; height: 16px; min-width: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 0 4px; border: 1px solid #fff; font-weight: bold; z-index: 5; }
            .wx-info { flex: 1; overflow: hidden; display: flex; flex-direction: column; justify-content: center; }
            .wx-name { font-size: 16px; color: #000; font-weight: 500; margin-bottom: 4px;}
            .wx-last-msg { font-size: 13px; color: #999; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .wx-meta { font-size: 11px; color: #b2b2b2; text-align: right; min-width: 35px; }
            .wx-msg-row { display: flex; margin: 15px 12px; align-items: flex-start; }
            .wx-msg-row.animate { animation: popIn 0.3s ease-out forwards; }
            .wx-msg-row.me { flex-direction: row-reverse; }
            .wx-bubble-avatar { width: 40px; height: 40px; border-radius: 6px; flex-shrink: 0; background-size: cover; background-color: #ccc; }
            .wx-bubble-content { max-width: 100%; padding: 10px 14px; border-radius: 6px; position: relative; font-size: 15px; line-height: 1.5; word-wrap: break-word; color: #000; display: flex; flex-direction: column; gap: 5px; text-align: left; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
            .wx-group-name { font-size: 10px; color: #999; margin-bottom: 2px; margin-left: 10px; }
            .wx-msg-row.you .wx-bubble-content { background: #fff; margin-left: 10px; border: 1px solid #ededed; }
            .wx-msg-row.you .wx-bubble-content::before { content: ''; position: absolute; left: -6px; top: 14px; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-right: 6px solid #fff; }
            .wx-msg-row.me .wx-bubble-content { background: #95ec69; margin-right: 10px; border: 1px solid #86d45a; }
            .wx-msg-row.me .wx-bubble-content::before { content: ''; position: absolute; right: -6px; top: 14px; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 6px solid #95ec69; }
            .wx-system-notice { text-align: center; font-size: 12px; color: #b2b2b2; margin: 15px 20px; padding: 4px 10px; clear: both; width: auto; align-self: center; border-radius: 4px; }
            .wx-typing-indicator { display:flex; align-items:center; gap:7px; padding:5px 14px 5px 18px; }
            .wx-typing-dots-wrap { display:flex; gap:4px; align-items:center; }
            .wx-typing-dots-wrap span { width:6px; height:6px; border-radius:50%; background:#bbb; display:inline-block; animation:wx-dot-bounce 1.1s infinite ease-in-out; }
            .wx-typing-dots-wrap span:nth-child(2) { animation-delay:0.18s; }
            .wx-typing-dots-wrap span:nth-child(3) { animation-delay:0.36s; }
            @keyframes wx-dot-bounce { 0%,80%,100%{transform:translateY(0); opacity:0.35} 40%{transform:translateY(-4px); opacity:1} }
            .wx-typing-label { font-size:12px; color:#aaa; }
            .wx-footer-wrapper { position: absolute; bottom: 0; width: 100%; display: flex; flex-direction: column; background: #f7f7f7; border-top: 1px solid #dcdcdc; z-index: 5; transition: bottom 0.2s; }
            .wx-input-bar { display: flex; align-items: center; padding: 8px 10px; min-height: 50px; box-sizing: border-box; }
            .wx-input-real { flex: 1; height: 36px; background: #fff !important; border-radius: 6px; border: 1px solid #ddd; margin: 0 10px; padding: 0 10px; font-size: 14px; outline: none; color: #000 !important; opacity: 1 !important; -webkit-text-fill-color: #000 !important; }
            .wx-icon-btn { font-size: 26px; color: #000; cursor: pointer; line-height: 1; margin: 0 2px;}
            .wx-send-btn { background: #07c160; color: #fff; padding: 6px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; margin-left: 5px; display: none; }
            .wx-send-btn.show { display: block; }
            .wx-action-panel { height: 0; overflow: hidden; transition: height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94); background: #f5f5f5; border-top: 1px solid #ededed; position: relative; }
            .wx-action-panel.open { height: 230px; }
            /* === 表情包面板 === */
            .wx-sticker-panel { height: 0; overflow: hidden; transition: height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94); background: #f5f5f5; border-top: 1px solid #ededed; display: flex; flex-direction: column; }
            .wx-sticker-panel.open { height: 260px; }
            .wx-stk-panel-header { display: flex; align-items: center; padding: 6px 10px; background: #fff; border-bottom: 1px solid #ededed; flex-shrink: 0; }
            .wx-stk-tabs-wrap { display: flex; flex: 1; gap: 6px; overflow-x: auto; scrollbar-width: none; }
            .wx-stk-tab { border: none; background: none; font-size: 12px; color: #666; padding: 3px 10px; border-radius: 20px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
            .wx-stk-tab.active { background: #07c160; color: #fff; }
            .wx-stk-manage-toggle { font-size: 18px; color: #bbb; cursor: pointer; padding: 4px; margin-left: 6px; line-height: 1; }
            .wx-sticker-grid { flex: 1; display: grid; grid-template-columns: repeat(5, 1fr); grid-auto-rows: 62px; gap: 4px; padding: 8px; overflow-y: auto; min-height: 0; }
            .wx-stk-item { height: 62px; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #fff; cursor: pointer; border: 1px solid #ededed; }
            .wx-stk-item img { width: 100%; height: 100%; object-fit: contain; }
            .wx-stk-item:active { opacity: 0.6; }
            .wx-stk-fallback { font-size: 10px; color: #888; text-align: center; padding: 2px; word-break: break-all; }
            .wx-stk-fallback-box { background: #fff; border: 1px solid #ededed; border-radius: 6px; padding: 8px 12px; font-size: 13px; color: #333; display: inline-block; max-width: 150px; }
            .wx-stk-empty { grid-column: 1/-1; text-align: center; color: #bbb; font-size: 12px; padding: 20px; }
            .wx-stk-manage-area { max-height: 0; overflow: hidden; transition: max-height 0.2s ease; background: #fff; border-top: 1px solid #ededed; }
            .wx-stk-manage-area.open { max-height: 120px; }
            .wx-stk-manage-inner { padding: 8px 10px; }
            .wx-stk-lib-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; border-bottom: 1px solid #f5f5f5; }
            .wx-stk-lib-name { flex: 1; font-size: 13px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .wx-stk-lib-count { font-size: 11px; color: #999; flex-shrink: 0; }
            .wx-stk-lib-del { border: none; background: none; color: #e74c3c; cursor: pointer; font-size: 14px; padding: 0 4px; }
            .wx-stk-import-row { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
            .wx-stk-url-input { flex: 1; font-size: 12px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: #fafafa; min-width: 0; }
            .wx-stk-file-btn { background: #07c160; color: #fff; font-size: 12px; padding: 5px 10px; border-radius: 4px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
            .wx-bottom-nav { height: 55px; background: #f7f7f7; border-top: 1px solid #dcdcdc; display: flex; align-items: center; justify-content: space-around; flex-shrink: 0; z-index: 10; padding-bottom: 5px; }
            .wx-tab { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; flex: 1; cursor: pointer; position: relative; }
            .wx-tab-icon-box { position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
            .wx-tab-icon { width: 24px; height: 24px; fill: #111; transition: fill 0.2s; }
            .wx-tab-txt { font-size: 10px; margin-top: 1px; color: #111; font-weight: 500; transition: color 0.2s; }
            .wx-tab.active .wx-tab-icon { fill: #07c160; }
            .wx-tab.active .wx-tab-txt { color: #07c160; }
            .wx-tab:not(.active) .wx-tab-icon { fill: #b2b2b2; }
            .wx-tab:not(.active) .wx-tab-txt { color: #b2b2b2; }
            .wx-tab-badge { position: absolute; top: -2px; right: -4px; background: #fa5151; color: white; font-size: 10px; height: 16px; min-width: 16px; border-radius: 9px; display: flex; align-items: center; justify-content: center; padding: 0 3px; border: 1px solid #fff; font-weight: bold; z-index: 5; transform: scale(0.9); }
            .wx-tab-dot { position: absolute; top: 0px; right: -2px; width: 10px; height: 10px; background: #fa5151; border-radius: 50%; border: 1px solid #fff; z-index: 5; }
            .wx-scroll-view { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; height: 100%; -webkit-overflow-scrolling: touch; scroll-behavior: smooth; }
            .wx-grid-page { min-width: 100%; scroll-snap-align: start; display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(2, 1fr); gap: 15px 10px; padding: 25px 20px; box-sizing: border-box; height: 210px; }
            .wx-grid-item { display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; }
            .wx-grid-icon { width: 55px; height: 55px; background: #fff; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 24px; border: 1px solid #e0e0e0; color: #444; }
            .wx-grid-label { font-size: 11px; color: #666; }
            .wx-img-block { max-width: 100%; border-radius: 4px; cursor: pointer; display:block; }
            .wx-img-placeholder { background: #f0f0f0; color: #666; padding: 15px; text-align: center; border: 1px solid #ddd; border-radius: 4px; min-width: 80px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; }
            .wx-time-stamp { text-align: center; font-size: 12px; color: #cecece; margin: 10px 0; width: 100%; clear:both; }
            .wx-voice-wrapper { display: flex; flex-direction: column; gap: 5px; cursor: pointer; }
            .wx-trans-box { font-size: 13px; padding: 8px; border-top: 1px solid rgba(0,0,0,0.1); display: none; background:rgba(0,0,0,0.05); }
            .wx-file-card { background: #fff; padding: 12px 15px; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; width: 210px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); cursor: pointer; }
            .wx-file-info { flex: 1; overflow: hidden; margin-right: 10px; display: flex; flex-direction: column; justify-content: center; }
            .wx-file-name { font-size: 14px; color: #333; line-height: 1.4; max-height: 40px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-all; }
            .wx-file-size { font-size: 11px; color: #999; margin-top: 4px; }
            .wx-file-icon { width: 45px; height: 45px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: bold; font-size: 18px; flex-shrink: 0; }
            .wx-gift-card-blue { width: 220px; background: linear-gradient(135deg, #0e2a5e 0%, #173673 100%); border-radius: 8px; display: flex; flex-direction: column; justify-content: space-between; padding: 15px 15px 10px 15px; color: #e3c795; box-shadow: 0 2px 5px rgba(0,0,0,0.15); position: relative; overflow: hidden; cursor: pointer; }
            .wx-gift-card-blue::before { content: ''; position: absolute; top: -10px; right: -10px; width: 40px; height: 40px; background: rgba(255,255,255,0.05); border-radius: 50%; box-shadow: -20px 40px 0 rgba(255,255,255,0.05), 40px 20px 0 rgba(255,255,255,0.05); }
            .wx-gift-top { display: flex; align-items: center; gap: 10px; z-index: 1; }
            .wx-gift-icon-gold { font-size: 26px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.2)); }
            .wx-gift-title-text { font-size: 14px; font-weight: 500; letter-spacing: 0.5px; }
            .wx-gift-footer { font-size: 10px; opacity: 0.6; margin-top: 15px; }
            .wx-contact-item { display: flex; align-items: center; padding: 10px 16px; background: #fff; border-bottom: 1px solid #f2f2f2; cursor: pointer; height: 56px; box-sizing: border-box; }
            .wx-contact-item:active { background: #f5f5f5; }
            .wx-contact-icon { width: 38px; height: 38px; border-radius: 4px; margin-right: 12px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 20px; flex-shrink: 0; background-size: cover; position: relative; }
            .wx-contact-name { font-size: 16px; color: #000; font-weight: 500; }
            .wx-contact-section { background: #ededed; color: #888; font-size: 11px; padding: 4px 16px; font-weight: bold; }
            .icon-new-friend { background: #fa9d3b; }
            .icon-group-chat { background: #07c160; }
            .icon-tags { background: #2782d7; }
            .icon-official { background: #2782d7; }
            .wx-avatar-upload { width: 80px; height: 80px; background: #eee; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 1px dashed #999; margin: 10px auto; font-size: 30px; color: #999; position: relative; overflow: hidden; }
            .wx-transfer-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); z-index: 110; display: none; align-items: center; justify-content: center; backdrop-filter: blur(3px); animation: fadeIn 0.2s; }
            .wx-transfer-overlay.show { display: flex; }
            .wx-transfer-box { background: #fff; width: 260px; border-radius: 12px; overflow: hidden; box-shadow: 0 5px 25px rgba(0,0,0,0.2); animation: popIn 0.3s; display: flex; flex-direction: column; text-align: center; }
            .wx-transfer-header { background: #fa9d3b; padding: 30px 20px; color: white; display: flex; flex-direction: column; align-items: center; gap: 10px; }
            .wx-transfer-icon { width: 50px; height: 50px; border: 2px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; }
            .wx-transfer-amount { font-size: 32px; font-weight: bold; font-family: 'Arial', sans-serif; }
            .wx-transfer-actions { padding: 20px; display: flex; flex-direction: column; gap: 10px; }
            .wx-btn-receive { background: #07c160; color: white; border: none; padding: 12px; border-radius: 6px; font-size: 15px; cursor: pointer; font-weight: bold; }
            .wx-btn-return { background: white; color: #fa5151; border: 1px solid #fa5151; padding: 12px; border-radius: 6px; font-size: 15px; cursor: pointer; font-weight: bold; }
            .wx-gift-overlay { z-index: 110; backdrop-filter: blur(3px); position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: none; align-items: center; justify-content: center; animation: fadeIn 0.2s; }
            .wx-gift-overlay.show { display: flex; }
            .wx-receipt-box { background: #fff; width: 230px; box-shadow: 0 5px 20px rgba(0,0,0,0.3); animation: popIn 0.3s; display: flex; flex-direction: column; text-align: center; position: relative; margin: 20px 0; }
            .wx-receipt-header { display: none; }
            .wx-receipt-content { padding: 30px 20px 25px 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
            .wx-receipt-icon { font-size: 45px; margin-bottom: 5px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.1)); }
            .wx-receipt-name { font-size: 17px; font-weight: bold; color: #333; }
            .wx-receipt-divider { width: 100%; border-bottom: 2px dashed #e0e0e0; margin: 8px 0; }
            .wx-receipt-price-label { font-size: 12px; color: #999; margin-bottom: -5px; letter-spacing: 1px;}
            .wx-receipt-price { font-size: 22px; font-weight: bold; color: #d95f55; font-family: 'Arial', sans-serif; }
            .wx-receipt-close { margin-top: 12px; font-size: 13px; color: #576b95; cursor: pointer; padding: 8px; font-weight: 500;}
            .wx-receipt-btn-group { display: flex; flex-direction: column; gap: 8px; width: 100%; margin-top: 10px; }
            .wx-receipt-btn-accept { background: #07c160; color: #fff; padding: 10px; border-radius: 4px; font-size: 14px; cursor: pointer; font-weight: 500; }
            .wx-receipt-btn-refuse { background: #f2f2f2; color: #fa5151; padding: 10px; border-radius: 4px; font-size: 14px; cursor: pointer; font-weight: 500; }
            .wx-receipt-box::before { content: ""; position: absolute; top: -10px; left: 0; width: 100%; height: 10px; background: linear-gradient(135deg, transparent 33%, #fff 34%, #fff 66%, transparent 67%), linear-gradient(45deg, transparent 33%, #fff 34%, #fff 66%, transparent 67%); background-size: 20px 20px; background-position: top center; background-repeat: repeat-x; }
            .wx-receipt-box::after { content: ""; position: absolute; bottom: -10px; left: 0; width: 100%; height: 10px; background: linear-gradient(135deg, transparent 33%, #fff 34%, #fff 66%, transparent 67%), linear-gradient(45deg, transparent 33%, #fff 34%, #fff 66%, transparent 67%); background-size: 20px 20px; background-position: bottom center; background-repeat: repeat-x; transform: rotate(180deg); }

            /* ========== 紅包彈窗 ========== */
            .wx-rp-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 110; display: none; align-items: center; justify-content: center; backdrop-filter: blur(3px); animation: fadeIn 0.2s; }
            .wx-rp-overlay.show { display: flex; }
            .wx-rp-box { background: #fff; width: 280px; border-radius: 12px; overflow: hidden; box-shadow: 0 5px 25px rgba(0,0,0,0.3); animation: popIn 0.3s; display: flex; flex-direction: column; max-height: 80vh; }
            .wx-rp-header { background: linear-gradient(135deg, #f6d147 0%, #fa9d3b 100%); padding: 25px 20px; color: white; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; position: relative; }
            .wx-rp-avatar { width: 50px; height: 50px; border-radius: 50%; background-size: cover; background-position: center; border: 3px solid rgba(255,255,255,0.3); margin-bottom: 5px; }
            .wx-rp-sender { font-size: 16px; font-weight: bold; }
            .wx-rp-memo { font-size: 13px; opacity: 0.9; line-height: 1.4; }
            .wx-rp-divider { width: 90%; border-bottom: 1px solid #e6e6e6; margin: 15px auto; }
            .wx-rp-info { font-size: 13px; color: #999; text-align: center; padding: 0 20px 10px; }
            .wx-rp-list { flex: 1; overflow-y: auto; padding: 10px 15px; max-height: 300px; }
            .wx-rp-item { display: flex; align-items: center; padding: 12px 10px; border-bottom: 1px solid #f5f5f5; }
            .wx-rp-item:last-child { border-bottom: none; }
            .wx-rp-item-avatar { width: 40px; height: 40px; border-radius: 50%; background-size: cover; background-position: center; margin-right: 12px; flex-shrink: 0; }
            .wx-rp-item-info { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
            .wx-rp-item-name { font-size: 14px; font-weight: 500; color: #333; }
            .wx-rp-item-time { font-size: 11px; color: #999; }
            .wx-rp-item-amount { font-size: 15px; font-weight: bold; color: #fa9d3b; flex-shrink: 0; }
            .wx-rp-close { text-align: center; padding: 15px; font-size: 14px; color: #576b95; cursor: pointer; border-top: 1px solid #f0f0f0; font-weight: 500; }

            /* ========== 微博分享卡片 ========== */
            .wx-wb-share-card { width: 210px; background: #fff; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 1px solid #ededed; }
            .wx-wb-share-top { background: #ff8200; padding: 6px 10px; display: flex; align-items: center; }
            .wx-wb-share-logo { color: #fff; font-size: 11px; font-weight: bold; background: rgba(0,0,0,0.15); padding: 1px 6px; border-radius: 3px; letter-spacing: 1px; }
            .wx-wb-share-body { padding: 8px 10px 10px; }
            .wx-wb-share-author { font-size: 12px; color: #576b95; font-weight: 500; margin-bottom: 4px; }
            .wx-wb-share-text { font-size: 13px; color: #333; line-height: 1.4; word-break: break-word; }

            /* ========== 消息刪除多選模式 ========== */
            .wx-msg-checkbox {
                width: 20px;
                height: 20px;
                border: 2px solid #d9d9d9;
                border-radius: 50%;
                background: #fff;
                flex-shrink: 0;
                margin-right: 10px;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
            }
            .wx-msg-checkbox:hover {
                border-color: #07c160;
                transform: scale(1.1);
            }
            .wx-msg-checkbox.checked {
                background: #07c160;
                border-color: #07c160;
            }
            .wx-msg-checkbox.checked::after {
                content: '✓';
                color: #fff;
                font-size: 14px;
                font-weight: bold;
            }

            /* 多選模式下的消息行樣式調整 */
            .wx-page-room.multi-select-mode .wx-msg-row {
                padding-left: 5px;
                cursor: pointer;
                transition: background 0.2s;
            }
            .wx-page-room.multi-select-mode .wx-msg-row:active {
                background: rgba(0, 0, 0, 0.05);
            }
        `,
        inject: function(fallbackDoc) {
            const targetDoc = (window.parent && window.parent.document) ? window.parent.document : (fallbackDoc || document);
            const oldFA = targetDoc.getElementById('wx-font-awesome'); if (oldFA) oldFA.remove();
            const STYLE_ID = 'wx-style-modular';
            const oldStyle = targetDoc.getElementById(STYLE_ID); if (oldStyle) oldStyle.remove();
            const style = targetDoc.createElement('style');
            style.id = STYLE_ID;
            style.innerHTML = this.css;
            targetDoc.head.appendChild(style);
            console.log('[WeChat Theme] V104.0 Background Preview Injected');
        }
    };
})();