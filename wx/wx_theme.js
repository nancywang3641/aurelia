// ----------------------------------------------------------------
// [檔案 1] wx_theme.js
// 模塊：外觀樣式 (View/Style)
// Update: 新增 Font Awesome CSS 庫注入。
// ----------------------------------------------------------------

(function() {
    window.WX_THEME = {
        version: 'v71.9-fa',

        css: `
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap');
            
            @keyframes popIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

            .wx-source-details {
                border: 1px dashed #ccc;
                background: #f9f9f9;
                border-radius: 4px;
                margin: 5px 0;
                padding: 2px 8px;
                font-size: 12px;
                color: #666;
                width: fit-content;
                max-width: 100%;
                animation: popIn 0.3s ease-out;
            }
            .wx-source-details summary { cursor: pointer; outline: none; font-weight: bold; user-select: none; color: #888; }
            .wx-source-details summary:hover { color: #333; }
            .wx-code-content { display: block; white-space: pre-wrap; font-family: monospace; font-size: 11px; color: #2c662d; margin-top: 5px; padding: 5px; background: #fff; border: 1px solid #eee; overflow-x: auto; }

            .wx-shell { 
                font-family: 'Noto Sans SC', sans-serif; 
                width: 100%; max-width: 450px; height: 650px; 
                margin: 15px 0; 
                background: #f2f2f2; 
                border-radius: 12px; 
                overflow: hidden; 
                border: 1px solid #dcdcdc; 
                position: relative; 
                display: flex; flex-direction: column; 
                text-align: left; 
                box-shadow: 0 5px 20px rgba(0,0,0,0.15); 
                z-index: 10; 
                clear: both; 
                display: block; 
            }
            
            .wx-header { background: #ededed; height: 45px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; border-bottom: 1px solid #dcdcdc; z-index: 10; display: flex; }
            .wx-header-title { font-weight: 600; font-size: 16px; color: #000; }
            .wx-back-btn { cursor: pointer; display: flex; align-items: center; font-size: 15px; color: #000; font-weight: 500; opacity: 0; pointer-events: none; transition: opacity 0.2s;}
            .wx-back-btn.show { opacity: 1; pointer-events: auto; }
            .wx-back-btn:before { content: '‹'; margin-right: 2px; font-size: 28px; line-height: 20px; position: relative; top: -2px;}
            
            .wx-page-container { flex: 1; position: relative; overflow: hidden; width: 100%; display: flex; flex-direction: column; height: calc(100% - 45px); }
            .wx-page-list { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow-y: auto; background: #fff; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); z-index: 1; }
            
            .wx-page-room { 
                position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
                overflow-y: auto; background: #f2f2f2; 
                transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding-bottom 0.3s ease; 
                display: flex; flex-direction: column; 
                padding-bottom: 70px; 
                z-index: 2; 
            }
            .wx-page-room.active { transform: translateX(0); }
            
            .wx-chat-item { display: flex; padding: 12px 16px; border-bottom: 1px solid #f2f2f2; cursor: pointer; background: #fff; min-height: 70px; box-sizing: border-box; }
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
            .wx-bubble-content { max-width: 70%; padding: 10px 14px; border-radius: 6px; position: relative; font-size: 15px; line-height: 1.5; word-wrap: break-word; color: #000; display: flex; flex-direction: column; gap: 5px; text-align: left; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
            .wx-msg-row.you .wx-bubble-content { background: #fff; margin-left: 10px; border: 1px solid #ededed; }
            .wx-msg-row.you .wx-bubble-content::before { content: ''; position: absolute; left: -6px; top: 14px; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-right: 6px solid #fff; }
            .wx-msg-row.me .wx-bubble-content { background: #95ec69; margin-right: 10px; border: 1px solid #86d45a; }
            .wx-msg-row.me .wx-bubble-content::before { content: ''; position: absolute; right: -6px; top: 14px; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 6px solid #95ec69; }

            .wx-footer-wrapper { position: absolute; bottom: 0; width: 100%; display: flex; flex-direction: column; background: #f7f7f7; border-top: 1px solid #dcdcdc; z-index: 5; transition: bottom 0.2s; }
            .wx-input-bar { display: flex; align-items: center; padding: 8px 10px; min-height: 50px; box-sizing: border-box; }
            .wx-input-real { flex: 1; height: 36px; background: #fff !important; border-radius: 6px; border: 1px solid #ddd; margin: 0 10px; padding: 0 10px; font-size: 14px; outline: none; color: #000 !important; opacity: 1 !important; -webkit-text-fill-color: #000 !important; }
            .wx-icon-btn { font-size: 26px; color: #000; cursor: pointer; line-height: 1; margin: 0 2px;}
            .wx-send-btn { background: #07c160; color: #fff; padding: 6px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; margin-left: 5px; display: none; }
            .wx-send-btn.show { display: block; }
            
            .wx-action-panel { height: 0; overflow: hidden; transition: height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94); background: #f5f5f5; border-top: 1px solid #ededed; }
            .wx-action-panel.open { height: 220px; }
            
            .wx-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px 10px; padding: 25px 20px; }
            .wx-grid-item { display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; }
            /* 更新：調整圖標容器樣式，適配 FontAwesome */
            .wx-grid-icon { width: 55px; height: 55px; background: #fff; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 24px; border: 1px solid #e0e0e0; color: #444; }
            .wx-grid-label { font-size: 11px; color: #666; }
            .wx-grid-item:active .wx-grid-icon { background: #e0e0e0; }
            
            .wx-img-block { max-width: 100%; border-radius: 4px; cursor: pointer; display:block; }
            .wx-img-placeholder { background: #f0f0f0; color: #666; padding: 15px; text-align: center; border: 1px solid #ddd; border-radius: 4px; min-width: 80px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; }
            .wx-img-placeholder span { font-size: 12px; opacity: 0.8; }
            .wx-time-stamp { text-align: center; font-size: 12px; color: #cecece; margin: 10px 0; width: 100%; clear:both; }
            .wx-voice-wrapper { display: flex; flex-direction: column; gap: 5px; cursor: pointer; }
            .wx-trans-box { font-size: 13px; padding: 8px; border-top: 1px solid rgba(0,0,0,0.1); display: none; background:rgba(0,0,0,0.05); }
        `,

        inject: function(doc) {
            // 1. 注入 Font Awesome CDN
            const FA_ID = 'wx-font-awesome';
            if (!doc.getElementById(FA_ID)) {
                const link = doc.createElement('link');
                link.id = FA_ID;
                link.rel = 'stylesheet';
                link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
                doc.head.appendChild(link);
                console.log('[WeChat Theme] Font Awesome Injected');
            }

            // 2. 注入自定義 CSS
            const STYLE_ID = 'wx-style-modular';
            if (!doc.getElementById(STYLE_ID)) {
                const style = doc.createElement('style');
                style.id = STYLE_ID;
                style.innerHTML = this.css;
                doc.head.appendChild(style);
                console.log('[WeChat Theme] CSS Injected');
            }
        }
    };
})();