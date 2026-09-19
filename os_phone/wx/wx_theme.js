// ----------------------------------------------------------------
// [檔案 3] wx_theme.js (V104.0 - Background Preview)
// 修正：新增聊天背景的預覽樣式 (長方形)。
// ----------------------------------------------------------------
(function() {
    window.WX_THEME = {
        version: 'v104.0-bg-preview',
        css: `
            @import url('https: //fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap');
            @keyframes popIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
            
            .wx-shell { width: 100%; height: 100%; background: var(--wx-page); display: flex; flex-direction: column; overflow: hidden; font-family: 'Noto Sans SC', sans-serif; }
            /* ... (保留原本的樣式) ... */
            .wx-source-details { border: 1px dashed var(--wx-arrow); background: #f9f9f9; border-radius: 4px; margin: 5px 0; padding: 2px 8px; font-size: 12px; color: var(--wx-ink-3); width: fit-content; max-width: 100%; }
            .wx-source-details summary { cursor: pointer; outline: none; font-weight: bold; user-select: none; color: var(--wx-ink-soft); }
            .wx-code-content { display: block; white-space: pre-wrap; font-family: monospace; font-size: 11px; color: #2c662d; margin-top: 5px; padding: 5px; background: var(--wx-surface); border: 1px solid var(--wx-line); overflow-x: auto; }

            .wx-header { color: var(--wx-ink); background: var(--wx-header); height: calc(45px + env(safe-area-inset-top, 0px)); flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; padding-top: env(safe-area-inset-top, 0px); border-bottom: 1px solid var(--wx-line-strong); z-index: 20; }
            .wx-header-title { font-weight: 600; font-size: 16px; }
            /* 標頭裡的字和圖示都跟著 .wx-header 的字色：主題只寫標頭的 color，標題、返回、右上的記事本與選單鈕就一起換 */
            :where(.wx-header-title, .wx-header .wx-back-btn, .wx-header .wxnb-head-btn, .wx-header .wx-head-menu-btn) { color: inherit; }
            .wx-head-menu-btn { display: block; font-size: 22px; cursor: pointer; font-weight: bold; margin-top: -8px; }
            /* 多選刪除時標題列右邊那組：取消／全選／刪除 */
            /* 🗑 多選刪除：底下換成一條「取消｜全選｜刪除(n)」，輸入列藏起來（LINE 那樣，標題列不再塞按鈕） */
            .wx-multi-bar { display: none; position: absolute; left: 0; right: 0; bottom: 0; z-index: 6; gap: 10px; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); background: var(--wx-bar); border-top: 1px solid var(--wx-line-strong); box-sizing: border-box; }
            .wx-shell.wx-multi-on .wx-multi-bar { display: flex; }
            .wx-shell.wx-multi-on .wx-footer-wrapper { display: none !important; }
            .wx-shell.wx-multi-on #wx-msg-note-btn, .wx-shell.wx-multi-on #wx-msg-menu-btn { visibility: hidden; }
            .wx-multi-bar-btn { flex: 1; height: 42px; border-radius: 10px; border: 1px solid #d8d8d8; background: var(--wx-surface); color: var(--wx-ink-2); font-size: 15px; font-family: inherit; cursor: pointer; }
            .wx-multi-bar-btn.danger { flex: 1.4; border: none; background: var(--wx-danger); color: var(--wx-on-accent); font-weight: 600; }
            .wx-multi-bar-btn.danger:disabled { opacity: 0.45; cursor: default; }
            .wx-dark .wx-multi-bar { background: var(--wx-surface); border-top-color: var(--wx-line); }
            .wx-dark .wx-multi-bar-btn { background: var(--wx-surface-2); border-color: var(--wx-line-strong); color: var(--wx-ink); }
            .wx-dark .wx-multi-bar-btn.danger { background: #fa5151; color: var(--wx-on-accent); }

            /* 💬 長按一則訊息跳出來的小窗：複製｜引用｜刪除 */
            .wx-msgmenu { position: absolute; z-index: 1000003; display: flex; background: rgba(20,20,22,0.94); border-radius: 12px; padding: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); animation: popIn 0.12s; }
            .wx-msgmenu-btn { position: relative; min-width: 64px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 12px 8px; border: none; background: none; color: var(--wx-on-accent); font-size: 12px; font-family: inherit; cursor: pointer; border-radius: 8px; }
            .wx-msgmenu-btn + .wx-msgmenu-btn::before { content: ''; position: absolute; left: 0; top: 12px; bottom: 12px; width: 1px; background: rgba(255,255,255,0.14); }
            .wx-msgmenu-btn i { font-size: 18px; }
            .wx-msgmenu-btn:active { background: rgba(255,255,255,0.12); }
            .wx-msgmenu-tail { position: absolute; bottom: -6px; width: 12px; height: 12px; margin-left: -6px; background: rgba(20,20,22,0.94); transform: rotate(45deg); border-radius: 2px; }
            .wx-msgmenu.below .wx-msgmenu-tail { bottom: auto; top: -6px; }
            .wx-copy-ta { position: fixed; left: -9999px; top: 0; opacity: 0; }
            .wx-copy-box-ta { resize: none; line-height: 1.6; }
            /* 長按要跳自己的小窗，不要跳 iOS 的放大鏡／系統選單 */
            #wxRoomContent { -webkit-touch-callout: none; }
            .wx-back-btn { cursor: pointer; display: flex; align-items: center; font-size: 15px; font-weight: 500; opacity: 0; pointer-events: none; transition: opacity 0.2s;}
            .wx-back-btn.show { opacity: 1; pointer-events: auto; }
            .wx-back-btn: before { content: '‹'; margin-right: 2px; font-size: 28px; line-height: 20px; position: relative; top: -2px;}
            
            .wx-plus-menu-pop { position: fixed; background: #4c4c4c; border-radius: 6px; padding: 5px 0; box-shadow: 0 5px 15px rgba(0,0,0,0.5); z-index: 1000001; animation: popIn 0.2s; min-width: 160px; }
            .wx-menu-item { padding: 12px 20px; color: var(--wx-on-accent); font-size: 15px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1); }
            .wx-menu-item:last-child { border-bottom: none; }
            .wx-menu-item:active { background: rgba(0,0,0,0.2); }
            .wx-menu-item .icon { font-size: 18px; width: 24px; text-align: center; }
            
            .wx-context-menu { position: fixed; background: var(--wx-surface); border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: 1000002; animation: popIn 0.1s; min-width: 120px; overflow: hidden; }
            .wx-context-item { padding: 12px 15px; font-size: 14px; color: var(--wx-ink-2); cursor: pointer; border-bottom: 1px solid var(--wx-line); }
            .wx-context-item:active { background: var(--wx-surface-2); }
            .wx-context-item.danger { color: var(--wx-danger); }

            /* Settings Panel */
            .wx-settings-panel { background: var(--wx-bar); display: flex; flex-direction: column; gap: 10px; padding-bottom: 20px; }
            /* 設置頁「外觀」那一排主題晶片：小圓的顏色各自定義在 css/aurelia_theme.css，
               加新主題時那邊多一條 .wx-theme-dot-<代號> 就會跟著出現。 */
            .wx-theme-row { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 15px 14px; background: var(--wx-surface); border-top: 1px solid var(--wx-line); }
            .wx-theme-chip { display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border: 1px solid var(--wx-line-strong); border-radius: 999px; background: var(--wx-surface-2); color: var(--wx-ink-2); font: inherit; font-size: 13px; cursor: pointer; }
            .wx-theme-chip.on { border-color: var(--wx-accent-ink); color: var(--wx-accent-ink); box-shadow: inset 0 0 0 1px var(--wx-accent-ink); font-weight: 600; }
            .wx-theme-dot { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; border: 1px solid var(--wx-line-strong); }
            .wx-theme-cell { border-bottom: none; }
            .wx-set-desc { padding: 6px 15px 14px; font-size: 12px; line-height: 1.5; color: var(--wx-ink-3); }
            .wx-set-group { background: var(--wx-surface); border-top: 1px solid var(--wx-line); border-bottom: 1px solid var(--wx-line); padding: 0 15px; margin-top: 10px; }
            .wx-set-item { display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-bottom: 1px solid var(--wx-line); }
            .wx-set-item:last-child { border-bottom: none; }
            .wx-set-label { font-size: 15px; color: var(--wx-ink); }
            .wx-set-val { font-size: 14px; color: var(--wx-ink-soft); display: flex; align-items: center; gap: 5px; cursor: pointer; }
            .wx-set-val: after { content: '›'; font-size: 20px; color: var(--wx-arrow); margin-left: 5px; margin-top: -2px;}
            .wx-avatar-preview-circle { width: 50px; height: 50px; border-radius: 50%; background-size: cover; background-color: var(--wx-fill); border: 1px solid var(--wx-line-strong); }
            /* [新增] 背景預覽框 (長方形) */
            .wx-bg-preview { width: 60px; height: 60px; border-radius: 6px; background-size: cover; background-position: center; background-color: var(--wx-fill); border: 1px solid var(--wx-line-strong); cursor: pointer; display: flex; align-items: center; justify-content: center; }

            .wx-member-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; padding: 15px 0; }
            .wx-member-item { display: flex; flex-direction: column; align-items: center; gap: 5px; }
            .wx-member-avatar { width: 45px; height: 45px; border-radius: 4px; background-color: var(--wx-fill); background-size: cover; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
            .wx-member-name { font-size: 11px; color: var(--wx-ink-3); width: 45px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .wx-member-add { border: 1px solid var(--wx-line-strong); display: flex; align-items: center; justify-content: center; color: var(--wx-arrow); font-size: 20px; background: var(--wx-surface); cursor: pointer; }

            .wx-modal-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 1000005; display: none; align-items: center; justify-content: center; backdrop-filter: blur(2px); animation: fadeIn 0.2s; }
            .wx-modal-overlay.show { display: flex; }
            .wx-modal-box { background: var(--wx-surface); width: 85%; border-radius: 12px; padding: 20px 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.25); animation: popIn 0.25s; display: flex; flex-direction: column; gap: 10px; max-height: 85%; overflow-y: auto; }
            .wx-modal-title { font-size: 16px; font-weight: 600; text-align: center; margin-bottom: 5px; color: var(--wx-ink-2); }
            .wx-modal-input { width: 100%; padding: 10px; border: 1px solid var(--wx-line-strong); background: #f9f9f9; border-radius: 6px; box-sizing: border-box; font-size: 14px; outline: none; transition: border 0.2s; color: var(--wx-ink); }
            .wx-modal-input:focus { border-color: var(--wx-accent); background: var(--wx-surface); }
            .wx-modal-input.hidden { display: none; }
            /* 照片：從相簿選（手機會跳相簿／相機），底下的輸入框留給貼網址 */
            .wx-modal-pick { width: 100%; padding: 11px; margin-bottom: 8px; border: none; border-radius: 6px; background: var(--wx-accent); color: var(--wx-on-accent); font-size: 15px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
            .wx-modal-pick:disabled { opacity: 0.6; cursor: wait; }
            .wx-modal-pick.hidden { display: none; }
            /* 🎙 聽寫檔下載面板（本機模型第一次用）：從底部升起；狀態寫在 data-state（download／downloading／preparing） */
            .wx-vsheet-mask { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.45); z-index: 1000005; display: flex; align-items: flex-end; animation: fadeIn 0.2s; }
            .wx-vsheet-mask[hidden] { display: none !important; }
            .wx-vsheet { width: 100%; background: var(--wx-bar); border-radius: 16px 16px 0 0; padding: 10px 20px calc(18px + env(safe-area-inset-bottom)); box-sizing: border-box; display: flex; flex-direction: column; align-items: center; animation: wxVsheetUp 0.25s ease-out; }
            @keyframes wxVsheetUp { from { transform: translateY(100%); } to { transform: none; } }
            .wx-vsheet-grab { width: 36px; height: 4px; border-radius: 2px; background: #d0d0d0; margin-bottom: 14px; }
            .wx-vsheet-dl { width: 100%; display: none; flex-direction: column; align-items: center; gap: 10px; }
            .wx-vsheet-mask[data-state="download"] .wx-vsheet-dl, .wx-vsheet-mask[data-state="downloading"] .wx-vsheet-dl, .wx-vsheet-mask[data-state="preparing"] .wx-vsheet-dl { display: flex; }
            .wx-vsheet-mask[data-state="preparing"] .wx-vsheet-title, .wx-vsheet-mask[data-state="preparing"] .wx-vsheet-bar, .wx-vsheet-mask[data-state="preparing"] .wx-vsheet-dlbtn { display: none; }
            .wx-vsheet-title { font-size: 16px; font-weight: 600; color: #222; }
            .wx-vsheet-note { font-size: 13px; color: var(--wx-ink-soft); text-align: center; font-variant-numeric: tabular-nums; }
            .wx-vsheet-bar { width: 100%; height: 6px; -webkit-appearance: none; appearance: none; border: none; border-radius: 3px; overflow: hidden; background: #e5e5e5; }
            .wx-vsheet-bar::-webkit-progress-bar { background: #e5e5e5; }
            .wx-vsheet-bar::-webkit-progress-value { background: var(--wx-accent); }
            .wx-vsheet-bar::-moz-progress-bar { background: var(--wx-accent); }
            .wx-vsheet-mask[data-state="download"] .wx-vsheet-bar { visibility: hidden; }
            .wx-vsheet-dlbtn { width: 100%; padding: 12px; border: none; border-radius: 8px; background: var(--wx-accent); color: var(--wx-on-accent); font-size: 15px; font-weight: 500; cursor: pointer; }
            .wx-vsheet-mask[data-state="downloading"] .wx-vsheet-dlbtn { display: none; }
            .wx-vsheet-cancel { background: none; border: none; color: var(--wx-link); font-size: 14px; padding: 6px 14px; cursor: pointer; }
            .wx-modal-footer { display: flex; gap: 10px; margin-top: 10px; }
            .wx-btn { flex: 1; padding: 10px 0; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; text-align: center; }
            .wx-btn-cancel { background: var(--wx-page); color: var(--wx-ink-2); }
            .wx-btn-confirm { background: var(--wx-accent); color: var(--wx-on-accent); }
            .wx-btn-reset { background: var(--wx-page); color: var(--wx-danger); }

            .wx-page-container { flex: 1; position: relative; overflow: hidden; width: 100%; display: flex; flex-direction: column; height: calc(100% - 45px); }
            .wx-page-list { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow-y: auto; background: var(--wx-surface); transition: transform 0.3s; z-index: 1; }
            .wx-page-room { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; background: var(--wx-page); transform: translateX(100%); transition: transform 0.3s; display: flex; flex-direction: column; z-index: 2; }
            .wx-page-room.active { transform: translateX(0); }
            /* 聊天室開著時把後面的列表藏起來。以前靠聊天室自己的底色擋住，主題常把頁面底色弄透明好讓外殼的漸層透出來，
               聊天室一透明，後面的聊天列表就露出來（她：每個主題套用後聊天室背景都出現聊天列表）。 */
            .wx-page-container:has(> .wx-page-room.active) > .wx-page-list { visibility: hidden !important; }
            .wx-room-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-size: cover; background-position: center; background-repeat: no-repeat; z-index: 0; pointer-events: none; }
            .wx-room-bg-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0); z-index: 1; pointer-events: none; transition: background 0.3s; }
            .wx-page-room.has-bg .wx-room-bg-overlay { background: rgba(0,0,0,0.22); }
            .wx-room-scroll { flex: 1; overflow-y: auto; position: relative; z-index: 2; padding-bottom: 70px; }
            .wx-page-room.has-bg .wx-group-name { color: var(--wx-on-accent); text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.7); }
            .wx-page-room.has-bg .wx-system-notice { background: rgba(0,0,0,0.38); color: var(--wx-on-accent); backdrop-filter: blur(4px); }
            .wx-chat-item { display: flex; padding: 12px 16px; border-bottom: 1px solid #f2f2f2; cursor: pointer; background: var(--wx-surface); min-height: 70px; box-sizing: border-box; }
            .wx-chat-item:active { background: var(--wx-surface-2); }
            .wx-avatar { width: 48px; height: 48px; border-radius: 6px; margin-right: 12px; background-size: cover; background-position: center; flex-shrink: 0; background-color: var(--wx-fill); position: relative; }
            .wx-badge { position: absolute; top: -6px; right: -6px; background: var(--wx-danger); color: #fff; font-size: 10px; height: 16px; min-width: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 0 4px; border: 1px solid var(--wx-surface); font-weight: bold; z-index: 5; }
            .wx-info { flex: 1; overflow: hidden; display: flex; flex-direction: column; justify-content: center; }
            .wx-name { font-size: 16px; color: var(--wx-ink); font-weight: 500; margin-bottom: 4px;}
            .wx-last-msg { font-size: 13px; color: var(--wx-ink-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .wx-meta { font-size: 11px; color: #b2b2b2; text-align: right; min-width: 35px; }
            .wx-msg-row { display: flex; margin: 15px 12px; align-items: flex-start; }
            /* 🚨 追加渲染時泡泡是 opacity:0 靠這條動畫淡進來。以前只寫給 .wx-msg-row，
               系統通知與時間戳畫出來是 .wx-system-notice / .wx-time-stamp，套不到這條動畫，
               於是就永遠停在透明——她的症狀是「AI 收了紅包但系統訊息看不到，重開微信才冒出來」
               （重開走整頁重建，那條路 opacity 是 1）。三個都要涵蓋。 */
            .wx-msg-row.animate,
            .wx-system-notice.animate,
            .wx-time-stamp.animate { animation: popIn 0.3s ease-out forwards; }
            .wx-msg-row.me { flex-direction: row-reverse; }
            .wx-bubble-avatar { width: 40px; height: 40px; border-radius: 6px; flex-shrink: 0; background-size: cover; background-color: #ccc; }
            /* 🚨 泡泡的寬度上限在這一層，不在泡泡本身。以前它是一個沒有 class 的行內樣式，
               主題碰不到（行內還蓋過所有樣式表），於是 AI 主題在預覽裡好好的、套進微信就被
               這層無形的 70% 夾住 → 她說「預覽正常，套用後偏移，而且泡泡張不開」。
               .pbub-bubble 的 max-width 是相對這一層算的，兩邊都寫百分比會疊兩次。 */
            .wx-bubble-wrap { max-width: 70%; min-width: 0; }
            .wx-send-fail { align-self: center; flex-shrink: 0; margin-right: 8px; color: var(--wx-danger); font-size: 18px; line-height: 1; }
            /* 📞 通話記錄：電話圖示加一句話，跟一般訊息一樣裝在泡泡裡 */
            .wx-call-rec { display: inline-flex; align-items: center; gap: 7px; }
            .wx-call-rec i { font-size: 15px; opacity: 0.75; }
            .wx-bubble-content { max-width: 100%; padding: 10px 14px; border-radius: 6px; position: relative; font-size: 15px; line-height: 1.5; word-wrap: break-word; color: var(--wx-bubble-ink); display: flex; flex-direction: column; gap: 5px; text-align: left; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
            /* 🚨 圖片／影片／定位卡片是寫死寬度（230～240px），外層被上面 70% 夾窄時卡片會往右溢出；
               自己這側頭像在右邊 → 卡片整張壓在頭像上。卡片一律不准比泡泡寬，縮窄照比例。 */
            .wx-bubble-content > * { max-width: 100%; box-sizing: border-box; }
            /* 卡片自己就是造型（泡泡透明無邊），不要泡泡的小尖角 */
            .wx-msg-row .wx-bubble-content.wx-bubble-bare::before { display: none; }
            .wx-group-name { font-size: 10px; color: var(--wx-ink-dim); margin-bottom: 2px; margin-left: 10px; }
            /* 引用回覆：照微信擺在泡泡內、正文下面的一條灰塊。結構由 OS_API.chatQuote 產，兩個 app 共用 */
            .wx-quote { display: flex; gap: 4px; align-items: baseline; margin-top: 2px; padding: 5px 8px; border-radius: 4px; background: rgba(0,0,0,0.06); font-size: 11px; line-height: 1.4; color: #8a8a8a; cursor: pointer; }
            .wx-quote .chat-quote-name { flex-shrink: 0; color: var(--wx-link); max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .wx-quote .chat-quote-name::after { content: '：'; }
            .wx-quote .chat-quote-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .wx-dark .wx-quote { background: rgba(255,255,255,0.10); color: var(--wx-ink-dim); }
            .wx-dark .wx-quote .chat-quote-name { color: var(--wx-link); }
            /* 正在回覆：輸入列上方那條，帶一顆取消 */
            .wx-replying { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: rgba(0,0,0,0.05); border-top: 1px solid rgba(0,0,0,0.06); font-size: 11px; color: #8a8a8a; }
            .wx-replying .wx-replying-body { flex: 1; min-width: 0; display: flex; gap: 4px; }
            .wx-replying .chat-quote-name { flex-shrink: 0; color: var(--wx-link); }
            .wx-replying .chat-quote-name::after { content: '：'; }
            .wx-replying .chat-quote-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .wx-replying .wx-replying-x { flex-shrink: 0; padding: 2px 6px; cursor: pointer; color: var(--wx-ink-dim); }
            .wx-dark .wx-replying { background: rgba(255,255,255,0.08); border-top-color: rgba(255,255,255,0.10); color: var(--wx-ink-dim); }
            .wx-dark .wx-replying .chat-quote-name { color: var(--wx-link); }
            .wx-msg-row.you .wx-bubble-content { background: var(--wx-bubble-you-bg); color: var(--wx-bubble-you-ink); margin-left: 10px; border: 1px solid var(--wx-bubble-you-line); }   /* 泡泡自己的格子，主題碰不到 */
            .wx-msg-row.you .wx-bubble-content::before { content: ''; position: absolute; left: -6px; top: 14px; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-right: 6px solid var(--wx-bubble-you-bg); }
            .wx-msg-row.me .wx-bubble-content { background: #95ec69; margin-right: 10px; border: 1px solid #86d45a; }
            .wx-msg-row.me .wx-bubble-content::before { content: ''; position: absolute; right: -6px; top: 14px; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 6px solid #95ec69; }
            .wx-system-notice { text-align: center; font-size: 12px; color: #b2b2b2; margin: 15px 20px; padding: 4px 10px; clear: both; width: auto; align-self: center; border-radius: 4px; }
            /* 撤回：那則淡掉 → 換成「撤回了一則訊息」淡進來（她從三個小樣挑的 1）。換掉與拿掉 class 都是 wx_core 計時器做，不靠轉場跑完 */
            .wx-recall-out { transition: opacity .35s ease; opacity: 0 !important; }
            .wx-recall-in { animation: wxRecallIn .35s ease-out; }
            @keyframes wxRecallIn { from { opacity: 0; } to { opacity: 1; } }
            /* 💭 這一輪的思考：對方那一輪第一顆泡泡上面一條，點開看（wx_view renderBubble） */
            /* 💭 思考摺疊用卡片那組顏色（底 --wx-surface、字 --wx-ink-3／--wx-ink-2、框 --wx-line）：
               以前寫死淺灰底灰字，主題把聊天室換色時常常看不到。底和字同一組格子，換了也一起換，不會對不上。 */
            .wx-think-fold { clear: both; align-self: flex-start; max-width: 72%; margin: 6px 12px 0 58px; padding: 5px 10px; border-radius: 8px; background: var(--wx-surface); border: 1px solid var(--wx-line); color: var(--wx-ink-3); font-size: 12px; cursor: pointer; user-select: none; }
            .wx-think-head { display: flex; align-items: center; gap: 6px; }
            .wx-think-arrow { font-size: 9px; transition: transform .2s; }
            .wx-think-fold.open .wx-think-arrow { transform: rotate(90deg); }
            .wx-think-body { display: none; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--wx-line); color: var(--wx-ink-2); line-height: 1.55; max-height: 320px; overflow-y: auto; cursor: text; user-select: text; overscroll-behavior: contain; }
            .wx-think-body p { margin: 0 0 6px; }
            .wx-think-body p:last-child, .wx-think-body ul:last-child, .wx-think-body ol:last-child { margin-bottom: 0; }
            .wx-think-body .wx-think-h { font-weight: 700; color: var(--wx-ink); margin: 8px 0 4px; }
            .wx-think-body .wx-think-h:first-child { margin-top: 0; }
            .wx-think-body ul, .wx-think-body ol { margin: 0 0 6px; padding-left: 18px; }
            .wx-think-body code { font-family: ui-monospace, monospace; font-size: 11px; padding: 0 3px; border-radius: 3px; background: var(--wx-surface-2); }
            .wx-think-body hr { border: 0; border-top: 1px solid var(--wx-line); margin: 6px 0; }
            .wx-think-fold.open .wx-think-body { display: block; }
            /* 它現在是一顆真泡泡（.wx-bubble-content），只要調泡泡內的排版就好 */
            .wx-typing-indicator { display: flex; align-items: center; gap: 7px; padding: 12px 14px; }
            .wx-typing-dots-wrap { display: flex; gap: 4px; align-items: center; }
            .wx-typing-dots-wrap span { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.5; display: inline-block; animation: wx-dot-bounce 1.1s infinite ease-in-out; }
            .wx-typing-dots-wrap span:nth-child(2) { animation-delay: 0.18s; }
            .wx-typing-dots-wrap span:nth-child(3) { animation-delay: 0.36s; }
            @keyframes wx-dot-bounce { 0%,80%,100%{transform: translateY(0); opacity: 0.35} 40%{transform: translateY(-4px); opacity: 0.85} }
            /* .wx-typing-label 已停用：群聊要顯示誰在打字改用 .wx-group-name，跟一般訊息同一條 */
            .wx-footer-wrapper { position: absolute; bottom: 0; width: 100%; display: flex; flex-direction: column; background: var(--wx-bar); border-top: 1px solid var(--wx-line-strong); z-index: 5; transition: bottom 0.2s; padding-bottom: var(--aps-safe-bottom, 0px); }
            .wx-input-bar { display: flex; align-items: center; padding: 8px 10px; min-height: 50px; box-sizing: border-box; }
            .wx-input-real { flex: 1; min-width: 0; height: 36px; background: var(--wx-surface) !important; border-radius: 6px; border: 1px solid var(--wx-line-strong); margin: 0 10px; padding: 0 10px; font-size: 14px; outline: none; color: var(--wx-ink) !important; opacity: 1 !important; -webkit-text-fill-color: #000 !important; }
            /* 🎙 輸入框右邊的麥克風：按住說話、放開送出語音訊息。按著時麥克風綠底（往上滑到取消時紅底），
               輸入列上方浮一張卡：音量、邊講邊出的字、秒數、提示。麥克風要擋掉捲動與長按選單，不然手機上按不住 */
            .wx-input-box { flex: 1; min-width: 0; position: relative; display: flex; align-items: center; margin: 0 10px; }
            .wx-input-box .wx-input-real { margin: 0; width: 100%; box-sizing: border-box; padding-right: 38px; }
            .wx-hold-btn { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #9a9a9a; font-size: 16px; cursor: pointer; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
            .wx-input-box[data-hold="starting"] .wx-hold-btn, .wx-input-box[data-hold="recording"] .wx-hold-btn, .wx-input-box[data-hold="sending"] .wx-hold-btn { background: var(--wx-accent); color: var(--wx-on-accent); }
            .wx-input-box[data-hold="cancel"] .wx-hold-btn { background: var(--wx-danger); color: var(--wx-on-accent); }
            .wx-dark .wx-hold-btn { color: #8e8e93; }
            .wx-hold { position: absolute; left: 0; right: 0; bottom: 90px; display: flex; justify-content: center; z-index: 6; pointer-events: none; }
            .wx-hold[hidden] { display: none !important; }
            .wx-hold-card { min-width: 190px; max-width: 78%; box-sizing: border-box; padding: 14px 18px 12px; border-radius: 14px; background: rgba(30,30,30,0.84); color: var(--wx-on-accent); display: flex; flex-direction: column; align-items: center; gap: 8px; }
            .wx-hold[data-state="cancel"] .wx-hold-card { background: rgba(250,81,81,0.92); }
            .wx-hold-level { display: flex; align-items: center; gap: 4px; height: 28px; }
            .wx-hold-level i { display: block; width: 4px; height: 4px; border-radius: 2px; background: #95ec69; transition: height 0.12s; }
            .wx-hold[data-state="cancel"] .wx-hold-level i { background: var(--wx-surface); }
            .wx-hold-level i:nth-child(even) { opacity: 0.6; }
            .wx-hold-level[data-lv="1"] i { height: 8px; }
            .wx-hold-level[data-lv="2"] i { height: 14px; }
            .wx-hold-level[data-lv="3"] i { height: 20px; }
            .wx-hold-level[data-lv="4"] i { height: 26px; }
            .wx-hold-level[data-lv] i:nth-child(3n+1) { transform: scaleY(0.6); }
            .wx-hold-text { font-size: 14px; line-height: 1.5; text-align: center; word-break: break-all; }
            .wx-hold-text:empty { display: none; }
            .wx-hold-foot { display: flex; gap: 10px; font-size: 12px; color: rgba(255,255,255,0.78); font-variant-numeric: tabular-nums; }
            .wx-icon-btn { font-size: 26px; color: var(--wx-ink); cursor: pointer; line-height: 1; margin: 0 2px;}
            .wx-send-btn { background: var(--wx-accent); color: var(--wx-on-accent); padding: 6px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; margin-left: 5px; display: none; }
            .wx-send-btn.show { display: block; }
            .wx-action-panel { height: 0; overflow: hidden; transition: height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94); background: var(--wx-surface-2); border-top: 1px solid var(--wx-line); position: relative; display: flex; flex-direction: column; }
            .wx-action-panel.open { height: 230px; }
            /* === 表情包面板 === */
            .wx-sticker-panel { height: 0; overflow: hidden; transition: height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94); background: var(--wx-surface-2); border-top: 1px solid var(--wx-line); display: flex; flex-direction: column; }
            .wx-sticker-panel.open { height: 260px; }
            /* 管理區打開時面板加高，格子縮、管理區自己捲，上傳列與 TXT 說明才不會被手機底切掉 */
            .wx-sticker-panel.open:has(.wx-stk-manage-area.open) { height: 360px; }
            .wx-stk-panel-header { display: flex; align-items: center; padding: 6px 10px; background: var(--wx-surface); border-bottom: 1px solid var(--wx-line); flex-shrink: 0; }
            .wx-stk-tabs-wrap { display: flex; flex: 1; gap: 6px; overflow-x: auto; scrollbar-width: none; }
            .wx-stk-tab { border: none; background: none; font-size: 12px; color: var(--wx-ink-3); padding: 3px 10px; border-radius: 20px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
            .wx-stk-tab.active { background: var(--wx-accent); color: var(--wx-on-accent); }
            .wx-stk-manage-toggle { font-size: 18px; color: #bbb; cursor: pointer; padding: 4px; margin-left: 6px; line-height: 1; }
            .wx-sticker-grid { flex: 1; display: grid; grid-template-columns: repeat(5, 1fr); grid-auto-rows: 62px; gap: 4px; padding: 8px; overflow-y: auto; min-height: 78px; }
            .wx-stk-item { height: 62px; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: var(--wx-surface); cursor: pointer; border: 1px solid var(--wx-line); }
            .wx-stk-item img { width: 100%; height: 100%; object-fit: contain; }
            .wx-stk-item:active { opacity: 0.6; }
            .wx-stk-fallback { font-size: 10px; color: var(--wx-ink-soft); text-align: center; padding: 2px; word-break: break-all; }
            .wx-stk-fallback-box { background: var(--wx-surface); border: 1px solid var(--wx-line); border-radius: 6px; padding: 8px 12px; font-size: 13px; color: var(--wx-ink-2); display: inline-block; max-width: 150px; }
            .wx-stk-empty { grid-column: 1/-1; text-align: center; color: #bbb; font-size: 12px; padding: 20px; }
            .wx-stk-manage-area { max-height: 0; overflow: hidden; transition: max-height 0.2s ease; background: var(--wx-surface); border-top: 1px solid var(--wx-line); }
            .wx-stk-manage-area.open { max-height: 210px; overflow-y: auto; flex-shrink: 0; }
            .wx-stk-manage-inner { padding: 8px 10px; }
            .wx-stk-lib-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; border-bottom: 1px solid #f5f5f5; }
            .wx-stk-lib-name { flex: 1; font-size: 13px; color: var(--wx-ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .wx-stk-lib-count { font-size: 11px; color: var(--wx-ink-dim); flex-shrink: 0; }
            .wx-stk-lib-del { border: none; background: none; color: #e74c3c; cursor: pointer; font-size: 14px; padding: 0 4px; }
            /* 哪一包給角色用：一次只有一包，再按一次就是收回 */
            .wx-stk-ai { border: 1px solid #d5d5d5; background: var(--wx-surface); color: var(--wx-ink-3); border-radius: 12px; font-size: 11px; padding: 2px 9px; cursor: pointer; white-space: nowrap; }
            .wx-stk-ai.on { background: var(--wx-accent); border-color: var(--wx-accent); color: var(--wx-on-accent); }
            .wx-stk-import-row { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
            .wx-stk-url-input { flex: 1; font-size: 12px; padding: 4px 8px; border: 1px solid var(--wx-line-strong); border-radius: 4px; background: #fafafa; min-width: 0; }
            .wx-stk-file-btn { background: var(--wx-accent); color: var(--wx-on-accent); font-size: 12px; padding: 5px 10px; border-radius: 4px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
            .wx-bottom-nav { height: 55px; background: var(--wx-bar); border-top: 1px solid var(--wx-line-strong); display: flex; align-items: center; justify-content: space-around; flex-shrink: 0; z-index: 10; padding-bottom: 5px; }
            .wx-tab { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; flex: 1; cursor: pointer; position: relative; }
            .wx-tab-icon-box { position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
            /* 🎨 分頁的圖示和字都跟著 .wx-tab 的 color 走（圖示 fill: currentColor）。
               預設顏色包在 :where() 裡、權重是零：以前寫成 .wx-tab:not(.active) .wx-tab-icon 那麼重，
               主題寫 .wx-tab-icon 蓋不過，只有它自己的 hover 那條夠重才看得到變色（她：只有 hover 改變）。 */
            .wx-tab-icon { width: 24px; height: 24px; fill: currentColor; transition: color 0.2s, fill 0.2s; }
            .wx-tab-txt { font-size: 10px; margin-top: 1px; font-weight: 500; transition: color 0.2s; }
            :where(.wx-tab-txt) { color: inherit; }
            :where(.wx-tab) { color: #b2b2b2; }
            :where(.wx-tab.active) { color: var(--wx-accent); }
            .wx-tab-badge { position: absolute; top: -6px; right: -10px; background: var(--wx-danger); color: #fff; font-size: 10px; height: 16px; min-width: 16px; border-radius: 9px; display: flex; align-items: center; justify-content: center; padding: 0 3px; border: 1px solid var(--wx-bar); font-weight: bold; z-index: 5; transform: scale(0.9); }
            .wx-tab-dot { position: absolute; top: -2px; right: -4px; width: 10px; height: 10px; background: var(--wx-danger); border-radius: 50%; border: 1px solid var(--wx-bar); z-index: 5; }
            /* 🚨 以前是 height:100%＝整個面板那麼高，底下的翻頁點被擠到面板外面、被裁掉——所以一直看不到點 */
            .wx-scroll-view { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; flex: 1; min-height: 0; -webkit-overflow-scrolling: touch; scroll-behavior: smooth; }
            .wx-grid-page { min-width: 100%; scroll-snap-align: start; display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(2, 1fr); gap: 15px 10px; padding: 22px 20px 12px; box-sizing: border-box; height: 100%; }
            .wx-grid-item { display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; }
            .wx-grid-icon { width: 55px; height: 55px; background: var(--wx-surface); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 24px; border: 1px solid var(--wx-line-strong); color: var(--wx-ink-2); }
            .wx-grid-label { font-size: 11px; color: var(--wx-ink-3); }
            /* ＋面板底下的翻頁點：以前沒有樣式＝看不到也按不到，電腦上翻不到第二頁 */
            .wx-dots { display: flex; justify-content: center; gap: 2px; padding: 0 0 6px; flex-shrink: 0; }
            .wx-dot { width: 7px; height: 7px; padding: 6px; border-radius: 50%; background: var(--wx-line-strong); background-clip: content-box; cursor: pointer; }
            .wx-dot.active { background-color: var(--wx-ink-3); }
            .wx-img-block { max-width: 100%; border-radius: 4px; cursor: pointer; display: block; }
            .wx-time-stamp { text-align: center; font-size: 12px; color: #cecece; margin: 10px 0; width: 100%; clear: both; }
            /* 🎙 語音泡泡：喇叭＋音波＋秒數，長度四檔；字幕點開才出現。顏色跟著泡泡走（currentColor），換皮不用另外寫 */
            .wx-vmsg { display: flex; flex-direction: column; gap: 6px; cursor: pointer; max-width: 100%; }
            .wx-vmsg-box { display: flex; align-items: center; gap: 8px; min-height: 22px; }
            .wx-vmsg--me .wx-vmsg-box { flex-direction: row-reverse; }
            .wx-vmsg-len1 { min-width: 72px; }
            .wx-vmsg-len2 { min-width: 100px; }
            .wx-vmsg-len3 { min-width: 130px; }
            .wx-vmsg-len4 { min-width: 160px; }
            .wx-vmsg-icon { font-size: 14px; opacity: 0.85; }
            .wx-vmsg--me .wx-vmsg-icon { transform: scaleX(-1); }
            .wx-vmsg-bars { display: flex; align-items: center; gap: 3px; height: 16px; flex: 1; }
            .wx-vmsg--me .wx-vmsg-bars { justify-content: flex-end; }
            .wx-vmsg-bars i { display: block; width: 2.5px; height: 6px; border-radius: 2px; background: currentColor; opacity: 0.45; }
            .wx-vmsg-bars i:nth-child(2) { height: 11px; }
            .wx-vmsg-bars i:nth-child(3) { height: 8px; }
            .wx-vmsg-bars i:nth-child(4) { height: 14px; }
            .wx-vmsg-bars i:nth-child(5) { height: 7px; }
            .wx-vmsg.is-playing .wx-vmsg-bars i { animation: wxVmsgBar 0.9s ease-in-out infinite; }
            .wx-vmsg.is-playing .wx-vmsg-bars i:nth-child(2) { animation-delay: 0.15s; }
            .wx-vmsg.is-playing .wx-vmsg-bars i:nth-child(3) { animation-delay: 0.3s; }
            .wx-vmsg.is-playing .wx-vmsg-bars i:nth-child(4) { animation-delay: 0.45s; }
            .wx-vmsg.is-playing .wx-vmsg-bars i:nth-child(5) { animation-delay: 0.6s; }
            @keyframes wxVmsgBar { 0%, 100% { transform: scaleY(0.5); } 50% { transform: scaleY(1.3); } }
            .wx-vmsg.is-playing .wx-vmsg-icon { opacity: 1; }
            .wx-vmsg-dur { font-size: 13px; font-variant-numeric: tabular-nums; opacity: 0.8; }
            .wx-vmsg-trans { display: none; font-size: 13px; line-height: 1.5; padding-top: 6px; border-top: 1px solid rgba(0,0,0,0.1); word-break: break-word; }
            .wx-vmsg-trans.open { display: block; }
            .wx-vmsg-tone { font-size: 11px; opacity: 0.6; margin-top: 3px; }
            .wx-file-card { background: var(--wx-surface); padding: 12px 15px; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; width: 210px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); cursor: pointer; }
            .wx-file-info { flex: 1; overflow: hidden; margin-right: 10px; display: flex; flex-direction: column; justify-content: center; }
            .wx-file-name { font-size: 14px; color: var(--wx-ink-2); line-height: 1.4; max-height: 40px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-all; }
            .wx-file-size { font-size: 11px; color: var(--wx-ink-dim); margin-top: 4px; }
            .wx-file-icon { width: 45px; height: 45px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--wx-on-accent); font-weight: bold; font-size: 18px; flex-shrink: 0; }
            .wx-gift-card-blue { width: 220px; background: linear-gradient(135deg, #0e2a5e 0%, #173673 100%); border-radius: 8px; display: flex; flex-direction: column; justify-content: space-between; padding: 15px 15px 10px 15px; color: #e3c795; box-shadow: 0 2px 5px rgba(0,0,0,0.15); position: relative; overflow: hidden; cursor: pointer; }
            .wx-gift-card-blue::before { content: ''; position: absolute; top: -10px; right: -10px; width: 40px; height: 40px; background: rgba(255,255,255,0.05); border-radius: 50%; box-shadow: -20px 40px 0 rgba(255,255,255,0.05), 40px 20px 0 rgba(255,255,255,0.05); }
            .wx-gift-top { display: flex; align-items: center; gap: 10px; z-index: 1; }
            .wx-gift-icon-gold { font-size: 26px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.2)); }
            .wx-gift-title-text { font-size: 14px; font-weight: 500; letter-spacing: 0.5px; }
            .wx-gift-footer { font-size: 10px; opacity: 0.6; margin-top: 15px; }
            .wx-contact-item { display: flex; align-items: center; padding: 10px 16px; background: var(--wx-surface); border-bottom: 1px solid #f2f2f2; cursor: pointer; height: 56px; box-sizing: border-box; }
            .wx-contact-item:active { background: var(--wx-surface-2); }
            .wx-contact-icon { width: 38px; height: 38px; border-radius: 4px; margin-right: 12px; display: flex; align-items: center; justify-content: center; color: var(--wx-on-accent); font-size: 20px; flex-shrink: 0; background-size: cover; position: relative; }
            .wx-contact-name { font-size: 16px; color: var(--wx-ink); font-weight: 500; }
            .wx-contact-section { background: var(--wx-header); color: var(--wx-ink-soft); font-size: 11px; padding: 4px 16px; font-weight: bold; }
            .wx-dark .wx-contact-item { background: var(--wx-surface); border-bottom-color: var(--wx-line); }
            .wx-dark .wx-contact-item:active { background: var(--wx-surface-2); }
            .wx-dark .wx-contact-name { color: var(--wx-ink); }
            .wx-dark .wx-contact-section { background: var(--wx-page); color: var(--wx-ink-dim); }
            /* 通訊錄子頁（新的朋友／僅聊天的朋友／群組／標籤）：沿用 .wx-contact-item 那一列，右邊多一格 */
            .wx-contact-side { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--wx-ink-dim); }
            .wx-req-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
            .wx-req-note { font-size: 13px; color: var(--wx-ink-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .wx-req-item .wx-contact-side { margin-left: 8px; flex-shrink: 0; }
            .wx-contact-count { margin-left: auto; font-size: 13px; color: var(--wx-ink-dim); }
            .wx-sub-bar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--wx-header); border-bottom: 1px solid #e3e3e3; }
            .wx-sub-bar .sp { flex: 1; }
            .wx-sub-note { font-size: 12px; color: var(--wx-ink-soft); }
            .wx-sub-btn { font-family: inherit; font-size: 13px; padding: 6px 14px; border-radius: 16px; border: 1px solid #d0d0d0; background: var(--wx-surface); color: var(--wx-ink-2); cursor: pointer; }
            .wx-sub-btn:active { background: var(--wx-fill-2); }
            .wx-sub-btn.solid { background: var(--wx-accent); border-color: var(--wx-accent); color: var(--wx-on-accent); }
            .wx-sub-btn.warn { color: #e64340; border-color: #f0c3c2; }
            .wx-sub-empty { padding: 48px 32px; text-align: center; color: var(--wx-ink-dim); font-size: 14px; line-height: 1.7; }
            .wx-sub-empty i { font-size: 30px; color: #d5d5d5; display: block; margin-bottom: 12px; }
            .wx-sub-empty small { display: block; margin-top: 8px; font-size: 12px; color: #b0b0b0; }
            .wx-tag-mark { font-size: 20px; color: #d0d0d0; }
            .wx-tag-mark.wx-tag-on { color: var(--wx-accent); }
            .wx-dark .wx-sub-bar { background: var(--wx-page); border-bottom-color: var(--wx-line); }
            .wx-dark .wx-sub-btn { background: var(--wx-surface-2); border-color: var(--wx-line-strong); color: var(--wx-ink); }
            .wx-dark .wx-sub-btn:active { background: #333; }
            .wx-dark .wx-sub-btn.solid { background: #07c160; border-color: #07c160; color: var(--wx-on-accent); }
            .wx-dark .wx-sub-btn.warn { color: #ff6b68; border-color: #5a2f2e; }
            .wx-dark .wx-sub-empty i { color: #3a3a3a; }
            .wx-dark .wx-tag-mark { color: #3a3a3a; }
            .icon-new-friend { background: #fa9d3b; }
            .icon-group-chat { background: var(--wx-accent); }
            .icon-tags { background: #2782d7; }
            .icon-official { background: #2782d7; }
            .wx-avatar-upload { width: 80px; height: 80px; background: var(--wx-fill); border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 1px dashed #999; margin: 10px auto; font-size: 30px; color: var(--wx-ink-dim); position: relative; overflow: hidden; }
            .wx-transfer-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); z-index: 110; display: none; align-items: center; justify-content: center; backdrop-filter: blur(3px); animation: fadeIn 0.2s; }
            .wx-transfer-overlay.show { display: flex; }
            .wx-transfer-box { background: var(--wx-surface); width: 260px; border-radius: 12px; overflow: hidden; box-shadow: 0 5px 25px rgba(0,0,0,0.2); animation: popIn 0.3s; display: flex; flex-direction: column; text-align: center; }
            /* 🚨同紅包：亮橘配白字只有 2.11:1。加深到 5.02:1，橘色的身分還在 */
            .wx-transfer-header { background: #b45309; padding: 30px 20px; color: white; display: flex; flex-direction: column; align-items: center; gap: 10px; }
            .wx-transfer-icon { width: 50px; height: 50px; border: 2px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; }
            .wx-transfer-amount { font-size: 32px; font-weight: bold; font-family: 'Arial', sans-serif; }
            .wx-transfer-actions { padding: 20px; display: flex; flex-direction: column; gap: 10px; }
            .wx-btn-receive { background: var(--wx-accent); color: white; border: none; padding: 12px; border-radius: 6px; font-size: 15px; cursor: pointer; font-weight: bold; }
            .wx-btn-return { background: white; color: var(--wx-danger); border: 1px solid var(--wx-danger); padding: 12px; border-radius: 6px; font-size: 15px; cursor: pointer; font-weight: bold; }
            .wx-gift-overlay { z-index: 110; backdrop-filter: blur(3px); position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: none; align-items: center; justify-content: center; animation: fadeIn 0.2s; }
            .wx-gift-overlay.show { display: flex; }
            .wx-receipt-box { background: var(--wx-surface); width: 230px; box-shadow: 0 5px 20px rgba(0,0,0,0.3); animation: popIn 0.3s; display: flex; flex-direction: column; text-align: center; position: relative; margin: 20px 0; }
            .wx-receipt-header { display: none; }
            .wx-receipt-content { padding: 30px 20px 25px 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
            .wx-receipt-icon { font-size: 45px; margin-bottom: 5px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.1)); }
            .wx-receipt-name { font-size: 17px; font-weight: bold; color: var(--wx-ink-2); }
            .wx-receipt-divider { width: 100%; border-bottom: 2px dashed #e0e0e0; margin: 8px 0; }
            .wx-receipt-price-label { font-size: 12px; color: var(--wx-ink-dim); margin-bottom: -5px; letter-spacing: 1px;}
            .wx-receipt-price { font-size: 22px; font-weight: bold; color: #d95f55; font-family: 'Arial', sans-serif; }
            .wx-receipt-close { margin-top: 12px; font-size: 13px; color: var(--wx-link); cursor: pointer; padding: 8px; font-weight: 500;}
            .wx-receipt-btn-group { display: flex; flex-direction: column; gap: 8px; width: 100%; margin-top: 10px; }
            .wx-receipt-btn-accept { background: var(--wx-accent); color: var(--wx-on-accent); padding: 10px; border-radius: 4px; font-size: 14px; cursor: pointer; font-weight: 500; }
            .wx-receipt-btn-refuse { background: var(--wx-page); color: var(--wx-danger); padding: 10px; border-radius: 4px; font-size: 14px; cursor: pointer; font-weight: 500; }
            .wx-receipt-box::before { content: ""; position: absolute; top: -10px; left: 0; width: 100%; height: 10px; background: linear-gradient(135deg, transparent 33%, var(--wx-surface) 34%, var(--wx-surface) 66%, transparent 67%), linear-gradient(45deg, transparent 33%, var(--wx-surface) 34%, var(--wx-surface) 66%, transparent 67%); background-size: 20px 20px; background-position: top center; background-repeat: repeat-x; }
            .wx-receipt-box::after { content: ""; position: absolute; bottom: -10px; left: 0; width: 100%; height: 10px; background: linear-gradient(135deg, transparent 33%, var(--wx-surface) 34%, var(--wx-surface) 66%, transparent 67%), linear-gradient(45deg, transparent 33%, var(--wx-surface) 34%, var(--wx-surface) 66%, transparent 67%); background-size: 20px 20px; background-position: bottom center; background-repeat: repeat-x; transform: rotate(180deg); }

            /* ========== 紅包彈窗 ========== */
            .wx-rp-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 110; display: none; align-items: center; justify-content: center; backdrop-filter: blur(3px); animation: fadeIn 0.2s; }
            .wx-rp-overlay.show { display: flex; }
            .wx-rp-box { background: var(--wx-surface); width: 280px; border-radius: 12px; overflow: hidden; box-shadow: 0 5px 25px rgba(0,0,0,0.3); animation: popIn 0.3s; display: flex; flex-direction: column; max-height: 80vh; }
            /* 🚨可讀性：原本是亮黃漸層配白字，實測對比只有 1.49:1（4.5 才及格）——她說「非常難看清」。
               改成紅包本來的深紅，白字拿到 5.4~7.7:1；金色留給頭像框與金額，紅配金還是紅包的樣子。 */
            .wx-rp-header { background: linear-gradient(135deg, #c0392b 0%, #96301c 100%); padding: 25px 20px; color: white; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; position: relative; }
            .wx-rp-avatar { width: 50px; height: 50px; border-radius: 50%; background-size: cover; background-position: center; border: 3px solid rgba(246,209,71,0.6); margin-bottom: 5px; }
            .wx-rp-sender { font-size: 16px; font-weight: bold; }
            /* 層次靠字級與顏色做，不靠 opacity——透明度一壓，對比就掉到不及格 */
            .wx-rp-memo { font-size: 13px; color: #ffeede; line-height: 1.4; }
            .wx-rp-divider { width: 90%; border-bottom: 1px solid #e6e6e6; margin: 15px auto; }
            /* 總金額／已領／剩餘：三欄，數字在上、名目在下，中間一道細分隔。
               不是「A: 1 | B: 2 | C: 3」那種一行串到底的印法——那是 log 不是 UI。 */
            .wx-rp-info { display: flex; justify-content: center; padding: 0 12px 14px; font-size: 13px; color: #6b6b6b; }
            .wx-rp-stat { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; position: relative; min-width: 0; }
            .wx-rp-stat + .wx-rp-stat::before { content: ''; position: absolute; left: 0; top: 2px; bottom: 2px; width: 1px; background: #ececec; }
            .wx-rp-stat b { font-size: 15px; font-weight: 600; color: #2b2b2b; font-variant-numeric: tabular-nums; letter-spacing: -0.2px; }
            .wx-rp-stat span { font-size: 11px; color: #6b6b6b; }
            .wx-rp-list { flex: 1; overflow-y: auto; padding: 10px 15px; max-height: 300px; }
            .wx-rp-item { display: flex; align-items: center; padding: 12px 10px; border-bottom: 1px solid #f5f5f5; }
            .wx-rp-item:last-child { border-bottom: none; }
            .wx-rp-item-avatar { width: 40px; height: 40px; border-radius: 50%; background-size: cover; background-position: center; margin-right: 12px; flex-shrink: 0; }
            .wx-rp-item-info { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
            .wx-rp-item-name { font-size: 14px; font-weight: 500; color: var(--wx-ink-2); }
            .wx-rp-item-time { font-size: 11px; color: #6b6b6b; }
            .wx-rp-item-amount { font-size: 15px; font-weight: bold; color: #c2410c; flex-shrink: 0; }   /* 橘金在白底只有 2.11:1，這是最該看清的數字 */
            .wx-rp-close { text-align: center; padding: 15px; font-size: 14px; color: var(--wx-link); cursor: pointer; border-top: 1px solid var(--wx-line); font-weight: 500; }

            /* ========== 轉帳／紅包／位置／影片卡片（以前整張寫在元素身上，主題抓不到；搬成零件，長相照舊） ========== */
            .wx-tf-card { background: #fa9d3b; color: #fff; padding: 15px; border-radius: 4px; min-width: 210px; display: flex; flex-direction: column; gap: 5px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
            .wx-tf-card.is-ok { background: #f6e3c8; color: #b8702b; }
            .wx-tf-card.is-back { background: #e6e6e6; color: #666; }
            .wx-tf-row { display: flex; align-items: center; gap: 10px; }
            .wx-tf-icon { border: 2px solid currentColor; border-radius: 50%; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; flex-shrink: 0; }
            .wx-tf-card.is-ok .wx-tf-icon { border-color: #d99a5e; }
            .wx-tf-card.is-back .wx-tf-icon { border-color: #999; }
            .wx-tf-text { overflow: hidden; }
            .wx-tf-title { font-size: 15px; font-weight: 500; white-space: nowrap; }
            .wx-tf-sub { font-size: 12px; opacity: 0.8; white-space: nowrap; }

            .wx-rpc-card { width: 220px; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.1); cursor: pointer; font-family: sans-serif; }
            .wx-rpc-card.is-empty { opacity: 0.55; }
            .wx-rpc-top { background: #fa9d3b; padding: 15px; display: flex; align-items: center; }
            .wx-rpc-env { width: 32px; height: 42px; background: #e64340; border-radius: 4px; position: relative; margin-right: 12px; flex-shrink: 0; display: flex; justify-content: center; align-items: center; border: 1px solid #f8b97a; }
            .wx-rpc-coin { width: 18px; height: 18px; background: #f6d147; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #e64340; font-weight: bold; font-size: 11px; }
            .wx-rpc-text { color: #fff; flex: 1; overflow: hidden; }
            .wx-rpc-memo { font-size: 15px; font-weight: 500; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .wx-rpc-sub { font-size: 12px; opacity: 0.8; }
            .wx-rpc-foot { background: #fff; padding: 8px 15px; font-size: 11px; color: #999; display: flex; justify-content: space-between; align-items: center; }

            .wx-loc-card { width: 230px; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.1); background: #fff; cursor: default; font-family: sans-serif; }
            .wx-loc-map { height: 120px; background: url('https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/World_map_blank_without_borders.svg/640px-World_map_blank_without_borders.svg.png') center/cover no-repeat; background-color: #e6e6e6; position: relative; }
            .wx-loc-shade { width: 100%; height: 100%; background: rgba(0,0,0,0.05); }
            .wx-loc-pin { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -80%); font-size: 32px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3)); color: #e64340; }
            .wx-loc-info { background: #55d967; padding: 10px 12px; color: #fff; display: flex; flex-direction: column; justify-content: center; }
            .wx-loc-name { font-size: 15px; font-weight: bold; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .wx-loc-addr { font-size: 11px; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

            .wx-vcard { margin: 0; width: 230px; aspect-ratio: 16/9; background: #000; border-radius: 8px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; cursor: default; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
            .wx-vcard.is-link { cursor: pointer; }
            .wx-vcard-bg { position: absolute; width: 100%; height: 100%; background: linear-gradient(45deg, #111, #222); opacity: 0.8; }
            .wx-vcard-play { width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.2); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.5); display: flex; align-items: center; justify-content: center; z-index: 2; }
            .wx-vcard-play::after { content: ''; width: 0; height: 0; border-top: 8px solid transparent; border-bottom: 8px solid transparent; border-left: 14px solid #fff; margin-left: 4px; }
            .wx-vcard-title { position: absolute; bottom: 10px; left: 12px; color: #fff; font-size: 13px; font-weight: 500; z-index: 2; text-shadow: 0 1px 2px rgba(0,0,0,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%; }
            .wx-vcard-dur { position: absolute; bottom: 10px; right: 12px; background: rgba(0,0,0,0.6); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px; z-index: 2; }

            /* ========== 微博分享卡片 ========== */
            .wx-wb-share-card { width: 210px; background: var(--wx-surface); border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 1px solid var(--wx-line); }
            .wx-wb-share-top { background: #ff8200; padding: 6px 10px; display: flex; align-items: center; }
            .wx-wb-share-logo { color: var(--wx-on-accent); font-size: 11px; font-weight: bold; background: rgba(0,0,0,0.15); padding: 1px 6px; border-radius: 3px; letter-spacing: 1px; }
            .wx-wb-share-body { padding: 8px 10px 10px; }
            .wx-wb-share-author { font-size: 12px; color: var(--wx-link); font-weight: 500; margin-bottom: 4px; }
            .wx-wb-share-text { font-size: 13px; color: var(--wx-ink-2); line-height: 1.4; word-break: break-word; }

            /* ========== 創作室 app 分享卡片 ========== */
            .wx-app-share-card { width: 210px; background: var(--wx-surface); border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 1px solid var(--wx-line); }
            .wx-app-share-top { display: flex; align-items: center; gap: 6px; padding: 6px 10px; font-size: 11px; font-weight: 600; color: var(--wx-ink-3); border-bottom: 1px solid var(--wx-line); }
            .wx-app-share-top > i { color: var(--wx-accent); font-size: 11px; }
            .wx-app-share-body { padding: 8px 10px 10px; }
            .wx-app-share-title { font-size: 14px; font-weight: 600; color: var(--wx-ink-2); line-height: 1.35; margin-bottom: 4px; word-break: break-word; }
            .wx-app-share-text { font-size: 12.5px; color: var(--wx-ink-3); line-height: 1.45; word-break: break-word; }

            /* ========== 消息刪除多選模式 ========== */
            .wx-msg-checkbox {
                width: 20px;
                height: 20px;
                border: 2px solid #d9d9d9;
                border-radius: 50%;
                background: var(--wx-surface);
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
                border-color: var(--wx-accent);
                transform: scale(1.1);
            }
            .wx-msg-checkbox.checked {
                background: var(--wx-accent);
                border-color: var(--wx-accent);
            }
            .wx-msg-checkbox.checked::after {
                content: '✓';
                color: var(--wx-on-accent);
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

            /* ===== 夜間模式完整化（.wx-dark 在 shell 上；補齊所有「寫死淺底/深字、又沒 inline 夜間」的元素。
               有 inline 夜間的(header/list底/me頁)inline 會贏、不受影響）===== */
            .wx-dark .wx-shell { background: #000; }
            .wx-dark .wx-page-list { background: var(--wx-page); }
            .wx-dark .wx-page-room { background: #0d0d0d; }
            .wx-dark .wx-chat-item { background: var(--wx-surface); border-bottom-color: var(--wx-line); }
            .wx-dark .wx-name { color: var(--wx-ink); }
            .wx-dark .wx-system-notice { color: var(--wx-ink-dim); }
            /* 夜晚那組格子在 aurelia_theme.css 的 wxskin-dark 裡（對方泡泡翻成深底亮字），這裡不用另外寫 */
            .wx-dark .wx-footer-wrapper { background: var(--wx-surface); border-top-color: var(--wx-line); }
            .wx-dark .wx-input-real { background: var(--wx-surface-2) !important; border-color: var(--wx-line-strong); color: var(--wx-ink) !important; -webkit-text-fill-color: #f0f0f0 !important; }
            .wx-dark .wx-icon-btn { color: var(--wx-ink); }
            .wx-dark .wx-action-panel, .wx-dark .wx-sticker-panel { background: var(--wx-surface); border-top-color: var(--wx-line); }
            .wx-dark .wx-stk-panel-header, .wx-dark .wx-stk-item, .wx-dark .wx-stk-fallback-box, .wx-dark .wx-stk-manage-area { background: var(--wx-surface); border-color: var(--wx-line); }
            .wx-dark .wx-stk-lib-name, .wx-dark .wx-stk-fallback-box { color: var(--wx-ink-3); }
            .wx-dark .wx-stk-url-input { background: var(--wx-surface-2); border-color: var(--wx-line-strong); color: var(--wx-ink); }
            .wx-dark .wx-bottom-nav { background: var(--wx-surface); border-top-color: var(--wx-line); }
            :where(.wx-dark .wx-tab:not(.active) .wx-tab-txt) { color: var(--wx-ink-dim); }
            /* 深色那條刪了：基底已經吃格子，深淺自己會跟著換 */
            .wx-dark .wx-file-card, .wx-dark .wx-wb-share-card, .wx-dark .wx-app-share-card { background: var(--wx-surface); border-color: var(--wx-line); }
            .wx-dark .wx-file-name, .wx-dark .wx-wb-share-text { color: var(--wx-ink-3); }
            .wx-dark .wx-settings-panel { background: #000; }
            .wx-dark .wx-set-group { background: var(--wx-surface); border-top-color: var(--wx-line); border-bottom-color: var(--wx-line); }
            .wx-dark .wx-set-label { color: var(--wx-ink); }
            .wx-dark .wx-modal-box, .wx-dark .wx-context-menu { background: var(--wx-surface); }
            .wx-dark .wx-modal-title { color: var(--wx-ink); }
            .wx-dark .wx-modal-input { background: var(--wx-surface-2); border-color: var(--wx-line-strong); color: var(--wx-ink); }
            .wx-dark .wx-vsheet { background: var(--wx-surface); }
            .wx-dark .wx-vsheet-title { color: var(--wx-ink); }
            .wx-dark .wx-vsheet-grab, .wx-dark .wx-vsheet-bar { background: var(--wx-line-strong); }
            .wx-dark .wx-context-item { color: var(--wx-ink); border-bottom-color: var(--wx-line); }
            .wx-dark .wx-btn-cancel { background: var(--wx-surface-2); color: var(--wx-ink-3); }
            .wx-dark .wx-btn-reset { background: var(--wx-surface-2); color: #ff6b6b; }
            .wx-dark .wx-source-details { background: var(--wx-surface); border-color: var(--wx-line-strong); color: #aaa; }
            .wx-dark .wx-code-content { background: #0d0d0d; border-color: var(--wx-line); color: #9acd9a; }

            /* ── .wx-cell* 在 vn_styles.css 是寫死白底 → 黑夜模式漏成白卡。這裡補齊暗色一套（.wx-dark 特異度蓋過全域白底）。 ── */
            .wx-dark .wx-cell-group { background: var(--wx-surface); }
            .wx-dark .wx-cell { background: var(--wx-surface); border-bottom-color: var(--wx-line); }
            .wx-dark .wx-cell:active { background: var(--wx-surface-2); }
            .wx-dark .wx-cell-text { color: var(--wx-ink); }
            .wx-dark .wx-cell-arrow { color: #555; }
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