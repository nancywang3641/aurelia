// ----------------------------------------------------------------
// [微博] wb_theme.js (V3.1 - Loading UI Support)
// 功能：定義微博的樣式，新增 Loading 狀態樣式
// ----------------------------------------------------------------
(function() {
    window.WB_THEME = {
        css: `
            /* === 全局容器 === */
            .wb-shell { width: 100%; height: 100%; background: #f5f5f5; display: flex; flex-direction: column; font-family: sans-serif; overflow: hidden; position: relative; }
            .wb-header { background: #fff; height: 45px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #e6e6e6; flex-shrink: 0; position: relative; z-index: 10; }
            .wb-header-title { font-weight: bold; font-size: 17px; }
            .wb-header-btn { position: absolute; left: 15px; font-size: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 30px; height: 100%; }
            .wb-content { flex: 1; overflow-y: auto; padding: 0; -webkit-overflow-scrolling: touch; }
            
            /* === Loading 狀態條 (新增) === */
            .wb-loader-box { padding: 15px; display: flex; align-items: center; justify-content: center; gap: 10px; background: #fff; border-bottom: 1px solid #f0f0f0; color: #ff8200; font-size: 13px; font-weight: bold; animation: wbFadeIn 0.3s; }
            .wb-spinner { width: 18px; height: 18px; border: 2px solid #ffe4ba; border-top-color: #ff8200; border-radius: 50%; animation: wbSpin 0.8s linear infinite; }
            @keyframes wbSpin { to { transform: rotate(360deg); } }
            @keyframes wbFadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

            /* === 微博卡片 === */
            .wb-card { background: #fff; margin-bottom: 10px; padding: 15px; border-bottom: 1px solid #eee; }
            .wb-user-row { display: flex; align-items: center; margin-bottom: 10px; }
            .wb-avatar { width: 40px; height: 40px; border-radius: 50%; background-size: cover; margin-right: 10px; border: 1px solid #eee; flex-shrink: 0; background-color: #eee; }
            .wb-user-info { flex: 1; display: flex; flex-direction: column; }
            .wb-username { font-weight: bold; font-size: 15px; color: #333; display: flex; align-items: center; gap: 4px; }
            .wb-vip-icon { color: #ff8200; font-size: 12px; }
            .wb-time { font-size: 11px; color: #939393; }
            .wb-text { font-size: 15px; line-height: 1.6; color: #333; margin-bottom: 10px; white-space: pre-wrap; word-break: break-word; }
            
            /* 媒體樣式 */
            .wb-img-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-bottom: 10px; border-radius: 8px; overflow: hidden; max-width: 100%; }
            .wb-img-item { aspect-ratio: 1/1; background-size: cover; background-position: center; background-color: #f0f0f0; cursor: pointer; }
            .wb-video-card { width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 8px; position: relative; overflow: hidden; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
            .wb-video-overlay { position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.3); }
            .wb-play-icon { width: 50px; height: 50px; background: rgba(0,0,0,0.6); border-radius: 50%; border: 2px solid #fff; display: flex; align-items: center; justify-content: center; z-index: 2; }
            .wb-play-arrow { width: 0; height: 0; border-top: 8px solid transparent; border-bottom: 8px solid transparent; border-left: 14px solid #fff; margin-left: 4px; }
            .wb-video-tag { position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.6); color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; z-index: 2; }

            /* 投票卡片 */
            .wb-vote-card { background: #f8f8f8; border-radius: 8px; padding: 12px; margin-bottom: 10px; border: 1px solid #eee; }
            .wb-vote-title { display: flex; align-items: center; gap: 6px; font-weight: bold; font-size: 14px; margin-bottom: 10px; color: #333; }
            .wb-vote-icon { background: #ebf5ff; color: #2782d7; padding: 2px 6px; font-size: 10px; border-radius: 4px; }
            .wb-vote-option { margin-bottom: 8px; position: relative; cursor: pointer; }
            .wb-vote-bar-bg { height: 30px; background: #fff; border: 1px solid #e0e0e0; border-radius: 4px; position: relative; overflow: hidden; display: flex; align-items: center; padding: 0 10px; }
            .wb-vote-bar-fill { position: absolute; left: 0; top: 0; height: 100%; background: #ebf5ff; z-index: 0; width: 0%; transition: width 0.5s; }
            .wb-vote-txt { position: relative; z-index: 1; font-size: 13px; color: #333; flex: 1; }
            .wb-vote-count { position: relative; z-index: 1; font-size: 12px; color: #999; }

            /* 列表頁底部按鈕 */
            .wb-actions { display: flex; justify-content: space-between; border-top: 1px solid #f2f2f2; padding-top: 10px; margin-top: 5px; }
            .wb-act-btn { display: flex; align-items: center; gap: 5px; font-size: 13px; color: #666; cursor: pointer; padding: 5px; }
            .wb-act-btn:hover { color: #ff8200; }

            /* 詳情頁專用 */
            .wb-detail-page { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #fff; z-index: 100; display: flex; flex-direction: column; animation: slideInRight 0.25s cubic-bezier(0.165, 0.84, 0.44, 1); }
            @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
            .wb-detail-content { flex: 1; overflow-y: auto; padding-bottom: 60px; background: #fff; }
            .wb-detail-card { padding: 15px; background: #fff; } 
            .wb-comment-sec { border-top: 8px solid #f2f2f2; background: #fff; min-height: 200px; }
            .wb-comment-header { padding: 12px 15px; font-weight: bold; font-size: 14px; border-bottom: 1px solid #f0f0f0; color: #333; }
            .wb-comment-item { padding: 15px; border-bottom: 1px solid #f5f5f5; display: flex; gap: 10px; }
            .wb-cmt-avatar { width: 34px; height: 34px; border-radius: 50%; background-color: #ddd; flex-shrink: 0; background-size: cover; }
            .wb-cmt-body { flex: 1; }
            .wb-cmt-user { color: #666; font-weight: bold; font-size: 13px; margin-bottom: 4px; display:flex; justify-content:space-between;}
            .wb-cmt-content { font-size: 14px; line-height: 1.5; color: #333; word-break: break-word; }
            .wb-cmt-time { font-size: 11px; color: #999; margin-top: 6px; }
            .wb-cmt-del { color: #ccc; font-size: 11px; cursor: pointer; margin-left: 10px; }
            .wb-cmt-del:hover { color: #ff4444; }
            .wb-cmt-reply { color: #576b95; font-size: 11px; cursor: pointer; margin-left: 10px; }
            .wb-cmt-reply:hover { opacity: 0.7; }
            .wb-dark .wb-cmt-reply { color: #7aa3cc; }

            /* 底部固定輸入框 */
            .wb-input-bar { position: absolute; bottom: 0; left: 0; width: 100%; height: 50px; background: #fff; border-top: 1px solid #e6e6e6; display: flex; align-items: center; padding: 0 10px; box-sizing: border-box; box-shadow: 0 -2px 5px rgba(0,0,0,0.03); z-index: 101; }
            .wb-input-wrapper { flex: 1; background: #f0f2f5; border-radius: 18px; padding: 0 12px; display: flex; align-items: center; height: 36px; margin-right: 10px; }
            .wb-input { border: none; background: transparent; width: 100%; font-size: 14px; outline: none; }
            .wb-send-btn { color: #ff8200; font-weight: bold; font-size: 15px; padding: 5px 10px; cursor: pointer; white-space: nowrap; opacity: 0.5; pointer-events: none; transition: 0.2s; }
            .wb-send-btn.active { opacity: 1; pointer-events: auto; }

            /* 底部導航 & FAB */
            .wb-tab-bar { height: 50px; background: #fff; border-top: 1px solid #dcdcdc; display: flex; align-items: center; justify-content: space-around; flex-shrink: 0; }
            .wb-tab { display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer; color: #333; }
            .wb-tab.active { color: #ff8200; }
            .wb-fab { position: absolute; bottom: 70px; right: 20px; width: 50px; height: 50px; background: linear-gradient(135deg, #ffae00, #ff8200); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 28px; box-shadow: 0 4px 10px rgba(255, 130, 0, 0.4); cursor: pointer; z-index: 10; transition: transform 0.2s; }
            .wb-fab:active { transform: scale(0.9); }
            
            /* 空狀態 */
            .wb-empty { text-align: center; color: #999; padding: 40px; font-size: 13px; }

            /* Hashtag 標籤 */
            .wb-tags { display: flex; flex-wrap: wrap; gap: 5px; margin: 2px 0 8px 0; }
            .wb-tag { display: inline-block; color: #ff8200; background: rgba(255,130,0,0.08); font-size: 12px; padding: 2px 7px; border-radius: 4px; font-weight: 500; }
            .wb-dark .wb-tag { background: rgba(255,130,0,0.14); }

            /* 載入更多評論按鈕 */
            .wb-load-more { display: block; margin: 0; padding: 11px; text-align: center; font-size: 13px; color: #576b95; cursor: pointer; border-top: 1px solid #f0f0f0; border-bottom: 6px solid #f5f5f5; letter-spacing: 0.5px; }
            .wb-load-more:active { background: #f5f5f5; }
            .wb-load-more-loading { color: #ff8200 !important; cursor: default !important; }
            .wb-lm-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,130,0,0.25); border-top-color: #ff8200; border-radius: 50%; animation: wbSpin 0.8s linear infinite; vertical-align: middle; margin-right: 5px; }
            .wb-dark .wb-load-more { color: #7aa3cc; border-top-color: #2a2a2a; border-bottom-color: #0d0d0d; background: #1c1c1e; }
            .wb-dark .wb-load-more:active { background: #252525; }

            /* === Toast 通知 === */
            .wb-toast { position: fixed; bottom: 85px; left: 50%; transform: translateX(-50%); background: rgba(30,30,30,0.88); color: #fff; padding: 8px 20px; border-radius: 20px; font-size: 13px; z-index: 99999; pointer-events: none; white-space: nowrap; animation: wbToastIn 0.25s ease, wbToastOut 0.3s ease 1.7s forwards; }
            @keyframes wbToastIn { from { opacity:0; transform: translateX(-50%) translateY(8px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
            @keyframes wbToastOut { to { opacity:0; } }

            /* === 黑夜模式 === */
            .wb-dark { background: #111 !important; }
            .wb-dark .wb-header { background: #1c1c1e !important; border-bottom-color: #2a2a2a !important; }
            .wb-dark .wb-header-title { color: #f0f0f0; }
            .wb-dark .wb-header-btn { color: #f0f0f0; }
            .wb-dark .wb-content { background: #111; }
            .wb-dark .wb-card { background: #1c1c1e !important; border-bottom-color: #2a2a2a !important; }
            .wb-dark .wb-username { color: #f0f0f0 !important; }
            .wb-dark .wb-time { color: #555 !important; }
            .wb-dark .wb-text { color: #d4d4d4 !important; }
            .wb-dark .wb-actions { border-top-color: #2a2a2a !important; }
            .wb-dark .wb-act-btn { color: #777 !important; }
            .wb-dark .wb-act-btn:hover { color: #ff8200 !important; }
            .wb-dark .wb-tab-bar { background: #1c1c1e !important; border-top-color: #2a2a2a !important; }
            .wb-dark .wb-tab { color: #777 !important; }
            .wb-dark .wb-tab.active { color: #ff8200 !important; }
            .wb-dark .wb-loader-box { background: #1c1c1e !important; border-bottom-color: #2a2a2a !important; color: #ff8200; }
            .wb-dark .wb-spinner { border-color: #333 !important; border-top-color: #ff8200 !important; }
            .wb-dark .wb-detail-page { background: #111 !important; }
            .wb-dark .wb-detail-content { background: #111 !important; }
            .wb-dark .wb-detail-card { background: #1c1c1e !important; }
            .wb-dark .wb-comment-sec { background: #1c1c1e !important; border-top-color: #2a2a2a !important; }
            .wb-dark .wb-comment-header { color: #f0f0f0 !important; border-bottom-color: #2a2a2a !important; background: #1c1c1e !important; }
            .wb-dark .wb-comment-item { border-bottom-color: #2a2a2a !important; background: #1c1c1e !important; }
            .wb-dark .wb-cmt-user { color: #aaa !important; }
            .wb-dark .wb-cmt-content { color: #d4d4d4 !important; }
            .wb-dark .wb-cmt-time { color: #555 !important; }
            .wb-dark .wb-cmt-del { color: #444 !important; }
            .wb-dark .wb-cmt-del:hover { color: #ff4444 !important; }
            .wb-dark .wb-input-bar { background: #1c1c1e !important; border-top-color: #2a2a2a !important; }
            .wb-dark .wb-input-wrapper { background: #2a2a2a !important; }
            .wb-dark .wb-input { color: #f0f0f0 !important; }
            .wb-dark .wb-vote-card { background: #252525 !important; border-color: #333 !important; }
            .wb-dark .wb-vote-title { color: #f0f0f0 !important; }
            .wb-dark .wb-vote-bar-bg { background: #1c1c1e !important; border-color: #333 !important; }
            .wb-dark .wb-vote-bar-fill { background: #2d3a4a !important; }
            .wb-dark .wb-vote-txt { color: #d4d4d4 !important; }
            .wb-dark .wb-vote-count { color: #555 !important; }
            .wb-dark .wb-img-item { background-color: #252525 !important; }
            .wb-dark .wb-empty { color: #555 !important; }
            .wb-dark .wb-vip-icon { color: #ff8200; }
        `,
        inject: function(doc) {
            if (doc.getElementById('wb-theme-style')) {
                 doc.getElementById('wb-theme-style').innerHTML = this.css;
                 return;
            }
            const s = doc.createElement('style');
            s.id = 'wb-theme-style';
            s.innerHTML = this.css;
            doc.head.appendChild(s);
        }
    };
})();