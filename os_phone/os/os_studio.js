// ----------------------------------------------------------------
// [檔案] os_studio.js (通用靈感創作室 Studio - V2.5 移動端 UX 終極優化)
// 職責：優化移動端體驗，預覽區置頂、輸入區置底，加入點擊外部關閉與 Toggle 切換。
// ----------------------------------------------------------------
(function() {
    const win = window.parent || window;
    console.log('[PhoneOS] 啟動通用靈感創作室 (Creator Studio V2.5)...');


    const studioHTML = `
        <div class="studio-container">
            <div class="studio-header">
                <div class="studio-title">
                    <div class="studio-back-btn" id="studio-back-btn" title="返回大廳"><i class="fa-solid fa-chevron-left"></i></div>
                    <i class="fa-solid fa-palette"></i> 創作室
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="studio-icon-btn studio-preview-toggle" id="studio-header-preview-btn" title="預覽面板"><i class="fa-solid fa-eye"></i> <span>預覽</span></button>
                    <button class="studio-icon-btn danger" id="studio-clear-btn" title="清空當前頻道的對話紀錄"><i class="fa-solid fa-trash"></i> <span>清空</span></button>
                </div>
            </div>

            <div class="studio-body">
                <div id="studio-drawer-backdrop" class="studio-drawer-backdrop"></div>

                <!-- 🏠 創作室首頁：三張任務卡（取代頂部 tab，點一張進對應工作；GPT 分層 IA） -->
                <div id="studio-home-pane" class="studio-home-pane">
                    <div class="sh-title">今天要做什麼？</div>
                    <div class="sh-cards">
                        <div class="studio-task-card" data-go="vn_ui" role="button" tabindex="0">
                            <img class="stc-art" src="https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/studio-ui/studio-panel.png" alt="" onerror="this.remove()">
                            <div class="stc-main"><div class="stc-title">製作互動面板</div><div class="stc-desc">狀態欄、角色卡、好感度…這類劇情面板</div></div>
                            <span class="stc-chev"><i class="fa-solid fa-chevron-right"></i></span>
                        </div>
                        <div class="studio-task-card" data-go="theme" role="button" tabindex="0">
                            <img class="stc-art" src="https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/studio-ui/studio-theme.png" alt="" onerror="this.remove()">
                            <div class="stc-main"><div class="stc-title">設計劇情主題</div><div class="stc-desc">對話框、名牌、頂部牌的外觀風格</div></div>
                            <span class="stc-chev"><i class="fa-solid fa-chevron-right"></i></span>
                        </div>
                        <div class="studio-task-card" data-go="worldbook" role="button" tabindex="0">
                            <img class="stc-art" src="https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/studio-ui/studio-worldbook.png" alt="" onerror="this.remove()">
                            <div class="stc-main"><div class="stc-title">整理世界書</div><div class="stc-desc">建／改世界書條目，AI 幫你寫規則</div></div>
                            <span class="stc-chev"><i class="fa-solid fa-chevron-right"></i></span>
                        </div>
                        <div class="studio-task-card" data-go="persona" role="button" tabindex="0">
                            <img class="stc-art" src="https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/我的角色_ying.png" alt="" onerror="this.remove()">
                            <div class="stc-main"><div class="stc-title">我的角色</div><div class="stc-desc">寫／改你扮演的主角人設，對標不同世界</div></div>
                            <span class="stc-chev"><i class="fa-solid fa-chevron-right"></i></span>
                        </div>
                    </div>
                </div>

                <!-- ② 聊天區 -->
                <div class="studio-left">
                    <div class="studio-chat-history" id="studio-chat-history"></div>
                    <button id="studio-preview-fab" class="studio-preview-fab" style="display:none;">
                        <span><i class="fa-solid fa-eye"></i></span><span id="studio-fab-label">查看預覽</span>
                    </button>

                    <!-- VN 煉丹專用工具列：歷史快照 + 整體重做 -->
                    <div id="studio-vn-toolbar">
                        <div class="vn-toolbar-row">
                            <button class="studio-history-btn" id="vn-studio-history-btn" title="每次修改前會自動存一份舊版；點開可看歷次版本、一鍵還原到任一個"><i class="fa-solid fa-clock-rotate-left"></i> 還原舊版 (<span id="vn-studio-history-count">0</span>)</button>
                        </div>
                        <div id="vn-studio-history-area"></div>
                    </div>

                    <div class="studio-input-wrap">
                        <!-- 面板類型：開頭就選好，AI 第一輪就知道要做哪種（只在 VN UI 模式顯示）-->
                        <div class="studio-type-row" id="studio-type-row">
                            <span class="studio-type-label">面板類型</span>
                            <button class="studio-type active" data-type="純展示" title="只把劇情資料漂亮顯示出來，不生成">純展示</button>
                            <button class="studio-type" data-type="純應用" title="會用 AI 生成內容/圖的功能面板（按一下即生）">純應用</button>
                            <button class="studio-type" data-type="共用" title="既展示資料、又能生成">共用</button>
                        </div>

                        <!-- ⚡ 組件快捷：常用 UI 話術 chip，點一下塞進輸入框可改再送（只 vn_ui 顯示）-->
                        <div class="studio-chips-row" id="studio-chips-row"></div>

                        <!-- 待發送的圖片縮圖列（有圖才顯示） -->
                        <div class="studio-pending-images" id="studio-pending-images"></div>

                        <div class="studio-input-area">
                            <input type="file" id="studio-image-input" accept="image/*" multiple style="display:none;">
                            <button class="studio-attach-btn" id="studio-attach-btn" title="附加參考圖（最多保留最近 2 張在上下文中）"><i class="fa-solid fa-paperclip"></i></button>
                            <textarea class="studio-textarea" id="studio-input" placeholder="告訴 AI 你的點子...（Shift+Enter 換行 / Enter 發送）"></textarea>
                            <button class="studio-send-btn" id="studio-send-btn">發送</button>
                        </div>
                    </div>
                </div>

                <!-- ③ 預覽區 -->
                <div class="studio-right">
                    <div class="studio-drawer-handle" id="studio-drawer-handle"></div>
                    <div class="studio-right-header">
                        <div class="studio-tab active" data-tab="preview"><i class="fa-solid fa-eye"></i> 畫布預覽</div>
                        <div class="studio-tab" data-tab="gallery" id="studio-tab-gallery" style="display:none;"><i class="fa-solid fa-puzzle-piece"></i> VN組件</div>
                    </div>
                    <div class="studio-preview-content" id="studio-preview-content">
                        <div id="studio-preview-main" class="studio-preview-main">
                            <div class="studio-empty">尚未生成任何內容。<br><br>請輸入您的點子，讓 AI 為您創作。</div>
                        </div>
                    </div>
                    <div class="studio-source-content" id="studio-source-content"></div>
                    <div id="studio-gallery-content" style="display:none; flex:1; overflow-y:auto; padding:20px;">
                        <div id="studio-gallery-toolbar" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
                            <button id="studio-spec-copy-btn" style="flex:1; min-width:190px; background:rgba(46,204,113,0.12); border:1px solid #2ecc71; color:#1a8f4f; padding:10px; border-radius:6px; font-size:12px; cursor:pointer; font-family:inherit;"><i class="fa-solid fa-clipboard"></i> 複製創建說明書</button>
                            <button id="studio-import-btn" style="flex:1; min-width:150px; background:rgba(155,89,182,0.12); border:1px solid #9b59b6; color:#7d3cae; padding:10px; border-radius:6px; font-size:12px; cursor:pointer; font-family:inherit;"><i class="fa-solid fa-file-import"></i> 匯入面板</button>
                            <button id="studio-import-pack-btn" class="studio-pack-btn import"><i class="fa-solid fa-box-archive"></i> 匯入包</button>
                            <input type="file" id="studio-import-pack-file" accept=".json" hidden>
                        </div>
                        <div class="studio-gallery-list" id="studio-gallery-list"></div>
                    </div>
                    <div class="studio-action-area">
                        <button class="studio-export-btn" id="studio-export-btn"><i class="fa-solid fa-check"></i> 確定創建</button>
                        <button class="studio-export-btn" id="studio-publish-btn" style="background:linear-gradient(135deg,#e67e22,#d35400); border-color:#d35400; margin-left:10px; display:none;"><i class="fa-solid fa-rocket"></i> 發布至世界書</button>
                    </div>
                </div>
                <!-- 🎨 劇情面板主題 view（頂層 mode，獨立全區，由 .top-theme 控制顯示） -->
                <div id="studio-theme-content" class="studio-theme-pane"></div>
                <div id="studio-worldbook-content" class="studio-worldbook-pane"></div>
                <div id="studio-persona-content" class="studio-persona-pane"></div>
            </div>
        </div>

        <!-- 📝 直接編輯原碼 modal（進階用戶繞過 AI 對話改 tpl JSON）-->
        <div id="studio-raw-edit-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.88); backdrop-filter:blur(6px); z-index:99999; padding:20px; box-sizing:border-box; align-items:center; justify-content:center; overflow-y:auto;">
            <div style="max-width:900px; width:100%; max-height:90vh; background:#EEF0F6; border:1px solid #9b59b6; border-radius:10px; padding:18px; display:flex; flex-direction:column; gap:12px; margin:auto; box-shadow:0 0 50px rgba(155,89,182,0.25);">
                <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:10px; border-bottom:1px solid rgba(155,89,182,0.3);">
                    <strong style="font-size:15px; color:#c39bf2;"><i class="fa-solid fa-code"></i> 直接編輯原碼 · <span id="raw-edit-tagid" style="color:#1A1C28;">?</span></strong>
                    <div style="color:#c39bf2; cursor:pointer; font-size:20px;" id="raw-edit-close"><i class="fa-solid fa-xmark"></i></div>
                </div>
                <div style="font-size:11px; color:rgba(195,155,242,0.6); line-height:1.5;">
                    完整 JSON 結構（含 tagId / html / css / js / usageDesc / demoFormat 等）。直接編輯後按「儲存」會覆寫這個面板。改壞了可以按「重置」拿回原本內容。
                </div>
                <textarea id="raw-edit-textarea" style="flex:1; min-height:50vh; max-height:65vh; background:rgba(0,0,0,0.6); border:1px solid rgba(155,89,182,0.4); color:#e9d5ff; padding:12px; border-radius:6px; font-family:monospace; font-size:12px; line-height:1.5; outline:none; resize:vertical; white-space:pre; overflow:auto;"></textarea>
                <div id="raw-edit-status" style="font-size:11px; color:rgba(255,255,255,0.5); min-height:14px;"></div>
                <div style="display:flex; gap:10px;">
                    <button class="avs-btn" id="raw-edit-save" style="flex:1; background:rgba(46,204,113,0.15); border:1px solid #2ecc71; color:#2ecc71; padding:10px; border-radius:6px; font-size:13px; cursor:pointer; font-family:inherit;"><i class="fa-solid fa-floppy-disk"></i> 儲存</button>
                    <button class="avs-btn" id="raw-edit-reset" style="flex:0 0 100px; background:rgba(26,28,40,0.06); border:1px solid rgba(26,28,40,0.25); color:#1A1C28; padding:10px; border-radius:6px; font-size:13px; cursor:pointer; font-family:inherit;"><i class="fa-solid fa-arrow-rotate-left"></i> 重置</button>
                    <button class="avs-btn" id="raw-edit-cancel" style="flex:0 0 100px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.2); color:#aaa; padding:10px; border-radius:6px; font-size:13px; cursor:pointer; font-family:inherit;">取消</button>
                </div>
            </div>
        </div>

        <!-- 📥 匯入面板 modal（貼朋友自己的 AI 照「創建說明書」產的 <json> → 載入預覽 → 上面按💾存進展廳）-->
        <div id="studio-import-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.88); backdrop-filter:blur(6px); z-index:99999; padding:20px; box-sizing:border-box; align-items:center; justify-content:center; overflow-y:auto;">
            <div style="max-width:900px; width:100%; max-height:90vh; background:#EEF0F6; border:1px solid #9b59b6; border-radius:10px; padding:18px; display:flex; flex-direction:column; gap:12px; margin:auto; box-shadow:0 0 50px rgba(155,89,182,0.25);">
                <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:10px; border-bottom:1px solid rgba(155,89,182,0.3);">
                    <strong style="font-size:15px; color:#7d3cae;"><i class="fa-solid fa-file-import"></i> 匯入面板</strong>
                    <div style="color:#9b59b6; cursor:pointer; font-size:20px;" id="studio-import-close"><i class="fa-solid fa-xmark"></i></div>
                </div>
                <div style="font-size:11px; color:rgba(125,60,174,0.85); line-height:1.6;">
                    把你的 AI 照「創建說明書」產出的 <strong>&lt;json&gt;…&lt;/json&gt;</strong> 整段貼進來，按「載入預覽」檢查；OK 後到上方按「確定創建」存起來（純展示→VN組件、應用/共用→我的應用），就能用了。
                </div>
                <textarea id="studio-import-textarea" placeholder="&lt;json&gt;{ ... }&lt;/json&gt;" style="flex:1; min-height:46vh; max-height:62vh; background:rgba(0,0,0,0.6); border:1px solid rgba(155,89,182,0.4); color:#e9d5ff; padding:12px; border-radius:6px; font-family:monospace; font-size:12px; line-height:1.5; outline:none; resize:vertical; white-space:pre; overflow:auto;"></textarea>
                <div id="studio-import-status" style="font-size:11px; color:rgba(26,28,40,0.6); min-height:14px;"></div>
                <div style="display:flex; gap:10px;">
                    <button class="avs-btn" id="studio-import-load" style="flex:1; background:rgba(46,204,113,0.15); border:1px solid #2ecc71; color:#1a8f4f; padding:10px; border-radius:6px; font-size:13px; cursor:pointer; font-family:inherit;">載入預覽</button>
                    <button class="avs-btn" id="studio-import-cancel" style="flex:0 0 100px; background:rgba(26,28,40,0.05); border:1px solid rgba(26,28,40,0.25); color:#1A1C28; padding:10px; border-radius:6px; font-size:13px; cursor:pointer; font-family:inherit;">取消</button>
                </div>
            </div>
        </div>

        <!-- ⚡ 組件快捷管理 modal（新增/刪除自訂快捷話術）-->
        <div class="studio-chip-modal" id="studio-chip-modal">
            <div class="studio-chip-box">
                <div class="studio-chip-mhead"><span><i class="fa-solid fa-bolt"></i> 快捷話術</span><button class="studio-chip-x" id="studio-chip-close"><i class="fa-solid fa-xmark"></i></button></div>
                <input class="studio-chip-input" id="studio-chip-label" placeholder="標籤（例：兩層結構）" maxlength="12">
                <textarea class="studio-chip-ta" id="studio-chip-text" placeholder="這個快捷要送給 AI 的話術…"></textarea>
                <button class="studio-chip-savebtn" id="studio-chip-save"><i class="fa-solid fa-plus"></i> 新增這個快捷</button>
                <div class="studio-chip-mlist" id="studio-chip-list"></div>
            </div>
        </div>
    `;

    let activePreviewData = null;

    const MODES = {
        'vn_ui': {
            name: '✨ VN UI 煉丹',
            prompt: `你是專業 UI 設計師，做「VN 劇情面板/應用」元件。先看【三種類型】確認你做哪種：純展示＝嵌進劇情正文的「卡片」；純應用＝裝到手機桌面的「手機 App」；共用＝兩邊都跑（劇情裡會像純展示那樣跳出來渲染 ＋ 也裝成手機 App，讀同一份自存資料）。

## 🚨 版型鐵律（第一優先，動手前先確認你做的是「劇情卡片」還是「手機 App」）
- 通用（兩種都守）：一律響應式寫法（width:100% / flex / grid / clamp），不破版；禁寫死固定像素寬。
- 尺寸/版型「依類型」不同——往下看【三種類型】各自規範。**別把手機 App 做成置中小卡片、也別把劇情卡做成吃滿全屏。**

## 核心心法
- 用戶要什麼就做什麼：主題／風格／結構／元素一律以用戶描述為準。要 A 就給 A，別自換成你覺得更好的 B。
- 直接動手：不要開場白、不說教、不勸退。真有更好點子，做完用戶要的之後一兩句附帶提，不取代本體。
- 沒有固定個人美學：視覺跟「當前故事世界觀」走；用戶沒指定就依世界觀判斷，別每個面板同一個味道。
- 預設直接創建、輸出完整 JSON。資訊不足就用合理預設先生第一版，JSON 後一行問「哪裡要調」。只有用戶明說「先討論」才討論，最多兩輪出稿。

## 三種類型（用戶在開頭標【類型：X】，照做別問；沒標＝純展示）— 三種尺寸版型各不同
- 純展示（落點＝嵌進劇情正文當「卡片」顯示）：
  · 響應式「劇情卡」，三種外框寬都不破版：手機~390 / 桌面中間~1000 / 桌面全屏~1920。
  · 必加 max-width（約 520~760）和 max-height、絕不吃滿外框（除非用戶說全屏）——1920 鋪滿會變大空洞。是「畫面置中、有份量的一張卡」。min-height 撐份量、長內容 max-height+overflow:auto 內捲。
  · 只做純前端互動（展開/切換/排序），禁用 st.callAI／st.setImage 生成。
- 純應用（落點＝裝成「手機 App」、跑在手機桌面 App 框裡，固定手機尺寸）：
  · 這是手機 App、不是 VN 卡片！根容器 width:100% 填滿手機框（~390px）、min-height:100% 用滿高度做 App 版型（頂部標題列＋可捲內容區＋底部操作），像一個正常手機 App。
  · 🚨 內容再少也要「撐滿整個手機框」：根容器 min-height:100% + display:flex + flex-direction:column，中間內容區 flex:1 撐開（必要時內容置中或頂部對齊），絕不能讓 App 打開後下方留一大片空白。這是 Rae 點名的問題。
  · 不要做響應式三尺寸、不要 max-width 置中小卡、不要當「嵌劇情的卡片」。
  · 用 st.callAI（生文字）／st.setImage（生圖）做功能（按鈕一點即生）。
- 共用（真雙用：同一份面板，劇情裡會像純展示那樣跳出來渲染 ＋ 也裝成手機 App，兩邊都跑、讀同一份資料）：
  · isBlock 必須 true、必須產出 demoFormat（同純展示那套）——劇本 AI 才會在正文用 <tagId> 區塊餵新資料、面板才會在劇情裡自動跳出來渲染。
  · 版型「兩邊都好看」：根容器 width:100% + min-height:100% + flex 直向撐滿（劇情裡蓋在置中遮罩上、桌面填滿手機框，兩種都填滿不留白）。別做 max-width 置中小卡（那只給純展示）。
  · 🔑 資料一律「自存一份、兩邊讀同一份」——面板永遠從自己的 DB 畫，不是只靠當下 lines。init 流程固定：
      ① const list = (await st.dbLoad('資料key','chat')) || [];   // 先讀回自存的
      ② const fed = st.parse();   // 劇情裡跳出來時這有 AI 餵的新資料；桌面開 app 時是空的
      ③ 把 fed 每筆「去重後」併進 list：每筆配一個穩定 id（用內容關鍵欄組出，或讓 AI 在格式裡帶一個識別欄）＋ ts:Date.now()；list 已有同 id 就跳過、不重複加
      ④ await st.dbSave('資料key', list, 'chat');   // 存回（scope 一律 'chat'）
      ⑤ 一律「按 ts 排序」後渲染，每筆把時間印出來（讓人看得出先後、不亂序）
  · 🚫 嚴禁 st.remember：共用面板的資料只進自己的 DB(st.dbSave)、是展示用、絕不進記憶桶、絕不注入酒館 AI（否則面板讀的劇情會被推回 AI → 重複數據迴圈）。要持久化只能 st.dbSave／st.dbLoad（scope 一律 'chat'）。
  · 不要整碗 st.getStory 撈歷史塞進清單（會吃進一堆重複舊資料）——資料以「AI 在 <tagId> 區塊主動寫的新條目」為準、靠上面的 id 去重。
  · 一樣能用 st.callAI／st.setImage 做按鈕生成（守生圖紀律＋「不自動生成」規則）。

## 🚫 禁止清單
- 禁 position:fixed、position:absolute 配 top/left 自定位、100vw、100vh、在 body／html 設樣式（樣式只能寫在 .vn-dynamic-panel-xxx 前綴下）；禁寫死固定像素寬（用 width:100%／響應式）。（全屏與否依類型：劇情卡禁吃滿、手機 App 反而要填滿手機框，見【三種類型】）
- 🚨🚨 禁「自動呼叫 AI 生成」：st.callAI／st.setImage 這種「會花錢的生成」**只能在使用者明確點『生成／刷新／發送』類按鈕時跑**，其它一律不准。具體：①面板一載入（init）**必須先 st.loadData 把上次存的資料讀回來並顯示**（有存就顯示存的——這是讀取、不花錢、一定要做，別讓使用者一重開就一片空白）；**只有在真的沒有任何存檔時**才顯示空狀態或「點按鈕開始」提示。不准的是自動 callAI／setImage 去生成「新的」內容。②**換頁／換層也不准**——進第二層詳情、切 TAB、開子視窗，這些只是「顯示已經有的東西」，**絕不能因為換頁就自動 callAI 生成一次**（這是常犯的錯：兩層結構被誤解成每層各生成一次→每點一下就燒 API）。第二層要的資料，能在第一層讀好就帶過去；真的要生成也要等使用者在那一層再按按鈕。只有「讀取」類（st.getStory／st.parse／st.loadData／st.getCurrentChars，都不花錢）可以自動跑。
- 禁無聊網頁感：卡中卡、單純 header+content+footer 堆疊、普通圓角矩形列表、只靠漸層＋陰影假高級。
- 禁在按鈕／標籤文字加 ASCII 裝飾（[ ]、<< >>、» «、/ /）。要邊框發光用 CSS，別把符號塞進文字。
- 🚫 禁「左側色條」：別給卡片加 CSS border-left 當色條 accent；也別用 Markdown 引用（行首大於號）——st.md 會把它渲染成左邊一條色條。每張卡都掛一條左邊槓很醜很煩，卡片靠造型／留白／分隔區分就好，不要無腦加左色條。

## ✅ 必須做成「主題化遊戲組件」
- 外形跟面板用途綁定（寶箱／卷軸／通訊終端／檔案夾／契約書／地圖板／懸賞令…只是發想方向，依實際用途挑，別每次都同一個）。
- 資訊融入主體結構（鎖孔／封蠟／寶石槽／紙頁／銘牌），不是另開方塊貼上去。
- 至少一個 SVG／CSS 造型當視覺主體（不是只當小圖示點綴）。
- 按鈕要像「拉桿／封印／鑰匙孔／啟動核心」這種跟主體一體成形的互動件。
- 桌面寬外框橫向展開用足空間（仍守 max-width 上限），手機收單欄。

## 📝 demoFormat（isBlock=true 的資料模板，只展示結構、不給內容）
- 劇本 AI 是模仿型生物，看到具體名詞會照搬進劇情。要填的欄位「必須」用 {中文佔位} 風格（中文＋花括號）。
  對：[Item|{物品名稱}|{物品描述}]
  錯：[Item|長劍|鋒利鐵劍]（具體名詞會永遠出現）、[Item|name|desc]（英文也算）、[Item|<物品名>|<描述>]（角括號會被 HTML 吃掉、預覽看不到）
  唯一例外：標籤名（第一格 Item／Task／Rule）是 schema、不用包。
- 每行 [標籤名|{欄1}|{欄2}…]，| 分隔。需要圖就最後一格寫 {圖片英文Prompt}。
- 禁偽標籤：只能放 js 裡有對應 case 的「資料行」。禁自創 [XxxFormat|…]／[Style|…]／[Template|…]（js 不認→整行消失）。排版／樣式／模板「一律寫在 js 裡」。
- 內容用 Markdown 不用 HTML 標籤（劇本 AI 接手寫文、HTML 會擾亂文筆；Markdown 更短更穩）。渲染用 st.md(text) 自動轉，不要自己寫 markdown regex。
- 🚨 js 禁止寫字串字面 $1（酒館正則層會當 capture group 切掉、整段 js 炸）。要自寫 regex 替換用 callback：.replace(rx, function(_,p1){return '<b>'+p1+'</b>';})。
- 解析用 st.parse()（內部 split）。禁止自己對 lines 用 regex 切、禁止 JSON.parse()。渲染含標籤字串用 innerHTML（textContent 會顯示成字面）。

## 執行環境 & st API（寫面板優先用 st，免疫雷區）
js 被 new Function('container','lines','onComplete','st', tpl.js) 包執行：
- container：根節點，子元素用 container.querySelector('.cls')（禁 document.getElementById，多實例會撞）。
- lines：標籤間純文字行（通常用 st.parse() 解析，不直接碰）。
- onComplete：結束 callback，綁關閉按鈕（用按鈕或「灰字點擊繼續」，別幾秒自動消失）。
- st.parse() → { 標籤名: [[欄1,欄2,…], …] }
- st.md(text) → markdown 轉 HTML（內建，免疫 $1）
- 🧩 進階功能（用法不常駐、省 token）：🖼️ 生圖(st.setImage)、📤 回傳對話框(st.toChat) 等——**要用就點對應的「功能 chip」**把完整用法帶進這次請求；使用者沒帶進來就別用該功能、也別自己瞎掰 API。
- 🚫【鐵則】要把面板生的內容「送進劇情／對話」一律用 st.toChat（回傳對話框 chip）＝貼進送出框讓使用者自己送。**絕對禁止**用 createChatMessages／TavernHelper／generateRaw／直接操作 #send_textarea 等酒館原生 API 自己建訊息或硬送——那會在聊天串多出標 System 或用戶名的「幽靈訊息」，很怪。沒帶 st.toChat 用法就「不要做送進對話這件事」，別用原生 API 替代。
- st.callAI(systemPrompt) → Promise，呼叫 AI 生文字（自動帶角色卡／最近劇情／世界書當背景，不必重述）。await 包 try/catch、生成中顯示 loading。
- st.getCurrentChars() → Promise，回傳當前聊天室出現過的角色 [{name,count}]（依出現次數排序）。做「角色選單／搜尋」用——例如日記/檔案類面板讓用戶從清單挑角色，免手打名字。空陣列＝還沒角色。
- st.getStory(n) → 回最近 n 條劇情 [{name, text}]（預設 30，已洗成乾淨文字）。**共用面板「讀當前劇情顯示」就用這個**（不經 AI、直接拿正文）。純展示卡別用它（那走 lines/st.parse）。
- st.toast(訊息[, {type:'error' 或 color:'#xxx'}]) → 跳出一下就消失的提示（已儲存／失敗／完成）。**別自己做 toast**，用這個。
- st.confirm(訊息[, {danger:true, okText, cancelText}]) → 回 Promise<布林>，統一樣式的確認框。刪除等危險動作寫 if(await st.confirm('確定刪除？',{danger:true})){…}；別用 window.confirm。
- st.loading(目標元素或CSS選擇器, true/false[, '生成中…']) → 在目標上蓋轉圈遮罩。呼叫 callAI／setImage 前 st.loading(el,true,'生成中…')、完了 st.loading(el,false)。
- st.esc(文字) → 把文字轉成安全 HTML。**用 innerHTML 塞用戶或 AI 產的文字前先 st.esc()**，防內容夾壞版面或 XSS。
- st.saveData(key, value) / st.loadData(key) → 純應用／共用 的持久化（存進手機、跨關閉重開都還在）。🚨 凡是「用戶會新增/編輯、要留著的資料」（日記、清單、筆記、收藏、設定…）一律用 st.saveData 存；而且 init 一進面板就先 st.loadData 把資料讀回來重畫 UI。少了這步，App 一關掉再開資料就全消失（用戶踩過這雷）。別自己用 localStorage（沒正確命名空間、不穩）。**第三參 scope**：不填＝全域（整個 app 一份）；填 'chat'＝綁當前聊天室（每個故事/聊天室各自一份，像 AVS）→ st.saveData(k,v,'chat')、st.loadData(k,'chat')。**跟劇情走的 app（論壇、日記、跟當前故事有關的資料）一律用 'chat'**；個人工具（記事本、計算機、設定）用全域不填。（要拿聊天室 id 自己分流也可 st.getChatId()）純展示卡不需要持久化。
- 📚 **記錄／檔案型 app（論壇、日記、動態、事件記錄…使用者會「之後回來翻看過去」的）＝資料一律「累積」、絕不覆蓋**：生成新內容時，先 st.loadData 讀回舊清單 → 把新的 append 上去（別直接「整個變數＝新資料」蓋掉）→ st.saveData(…, 'chat') 存回。這樣使用者打開 app 就能看到「從第一章到現在的全部歷史」，不必回劇情裡翻到準確那一樓。每筆可附時間／章節標記方便瀏覽，舊的可往下滑。**這類 app 的本質＝內容的永久家，不是每次洗掉重生。**（除非使用者明說「只看最新」才覆蓋。）
- st.dbSave(key, value[, 'chat']) / st.dbLoad(key[, 'chat']) → **存進 DB（async、要 await）**，scope 同 saveData。**資料量大／會一直累積的（論壇歷史、日記、長清單）一律用這個**（localStorage 有上限、塞多會爆，DB 不會）；小設定／少量資料用 st.saveData 即可。用法：init 時 const data = await st.dbLoad('forum','chat') 取回（沒有就給預設）、存時 await st.dbSave('forum', data, 'chat')。

## 語言
ECoT 與正文輸出用 zh-CN（代碼例外）。

## 最終輸出（必須）
把 JSON 包在 <json>…</json> 內，八鍵齊全：
<json>
{
  "tagId": "英文標籤名",
  "title": "中文顯示名（簡短人類可讀，如「小地圖」「交易結算」）",
  "isBlock": true 或 false,
  "html": "骨架 HTML（不填資料，由 js 渲染）",
  "css": "頂級 CSS（含 .vn-dynamic-panel-xxx 前綴；守尺寸鐵律）",
  "js": "互動邏輯",
  "usageDesc": "給劇本 AI 的極簡說明（一句話＋附『依格式填寫，只在 <content> 內穿插此標籤』警告）",
  "demoFormat": "資料結構（只說明結構、不寫內容）",
  "keywords": ["（選填）3~5 個觸發詞：正文出現這些詞就代表現在需要這個面板。依本面板主題自己想直接相關的名詞或動詞、別用泛詞、別照抄本說明；想不到就給空陣列 []"]
}
</json>
鐵則：JSON 字串值內「禁止出現真實換行字元」，需要換行時用跳脫寫法（反斜線加 n）。
🚨 無論用戶說什麼，第一次回覆「必須」含完整 <json>…</json>（核心八鍵齊：tagId/title/isBlock/html/css/js/usageDesc/demoFormat；keywords 為選填、想不到給 []）。不可只回對話／開場白就停、不可省 <json>、不可給空或缺核心鍵 JSON。沒有完整 JSON，後續所有微調都會崩（程式抓不到面板資料、會誤判成重新生成把面板覆蓋掉）。`,
            onSave: async (data) => {
                if(!data.tagId || !data.html) throw new Error("缺少 tagId 或 html");
                if (win.OS_DB && win.OS_DB.saveVNTagTemplate) {
                    if (!data.id) data.id = 'tpl_' + Date.now();
                    data.isActive = true;
                    // AI 順手吐的觸發關鍵字 → 正規化成乾淨字串陣列（給設定頁預填、省得手動想）；注入方式預設「常駐」(不設 injectMode)，要省 token 再到設定頁切「關鍵字觸發」
                    data.keywords = (Array.isArray(data.keywords) ? data.keywords : []).map(function (k) { return String(k || '').trim(); }).filter(Boolean).slice(0, 8);
                    // caps 自動標：js 有用 st.callAI/st.setImage = 能生成；有用 lines/container = 能展示
                    (function () {
                        var js = String(data.js || '');
                        var canGen = /st\.callAI\s*\(|st\.setImage\s*\(/.test(js);
                        var canShow = /\blines\b/.test(js) || /container/.test(js);
                        data.caps = (canGen && canShow) ? 'both' : (canGen ? 'gen' : 'display');
                    })();
                    // 記下「你開頭明確選的型別」——VN組件 vs 我的應用 的歸屬以這個為準，不靠 caps 亂猜
                    data.panelType = _vnPanelType;
                    // 一律存一份可編輯底稿(模板)；應用/共用 之後靠 srcTplId 找回它編輯
                    await win.OS_DB.saveVNTagTemplate(data);
                    await syncActiveTagsToLocal();
                    // 🔀 按開頭選的型別分流：純展示→只進 VN組件；純應用→只裝手機 app；共用→兩邊都要（劇情渲染＋裝成 app，讀同一份資料）
                    let _aid = null;
                    if (_vnPanelType !== '純展示') {
                        _aid = await _installTemplateAsPhoneApp(data);   // 先裝 app，下面 init 才抓得到它的 id 建「模板→app」對照
                    }
                    // init 放在裝 app 之後：重建對照表，共用面板「當次劇情渲染」的 dbSave 才對得到同一個桶（不然首存當session會落到 pwa_panel）
                    if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
                    if (_vnPanelType === '純展示') {
                        alert(`🎉 [${data.tagId}] 已建立！已存進「VN組件」。`);
                        document.getElementById('studio-tab-gallery')?.click();
                    } else if (_vnPanelType === '共用') {
                        alert(`🎉 [${data.tagId}] 已建立（共用）！劇情裡會自動跳出渲染、也裝進手機「應用工坊 · 我的應用」、並在「VN組件」可見，兩邊讀同一份資料。` + (_aid ? '' : '\n(裝機未完成，可到我的應用重試)'));
                    } else {
                        alert(`🎉 [${data.tagId}] 已建立，並裝進手機 →「應用工坊 · 我的應用」！` + (_aid ? '' : '\n(裝機未完成，可到我的應用重試)'));
                    }
                }
            }
        },
        'var_pack': {
            name: '變數包設計',
            prompt: `你是 AVS (Aurelia Variable System) 的「動態變數架構師」。請採取漸進式討論。
前期請純聊天，只有在確認變數清單後，才輸出被 <json> 標籤包裹的純 JSON。
格式: {"id": "xxx", "name": "xxx", "vars": [{"key":"HP", "type":"number", "default": 100}]}

🎯【給用戶做關鍵抉擇時，請用 <choices> 標籤】
⚠️ <choices> 是「關鍵抉擇」工具，不是「省事回答」工具。每幾輪對話頂多用一次，**使用前必須先寫充分的分析鋪墊**，禁止省略討論直接丟選項。
格式：\`<choices>選項1的完整描述|選項2的完整描述|......</choices>\`（選項數量自定）
規則：
- 用 \`|\` 分隔，每個選項至少 1-2 句完整描述（禁止單詞）
- 選項內容根據當下對話脈絡生成，不要套用預設主題
- UI 自帶「✏️ 其他想法...」不用你提供
- ✅ 用：到了關鍵抉擇點　❌ 不用：純介紹 / 細節討論 / 還沒鋪墊夠`,
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
    let _studioTop = 'home';   // 頂層導覽：home(首頁三卡) | vn_ui | theme | worldbook（取代頂部 tab）
    let _landedDirect = false; // true=從工坊四鈕直接落到某工作(帶 landMode)；創作室首頁已搬到工坊成孤兒，返回一步直接退出、不落首頁
    let chatMessages = [];
    let _vnPanelType = '純展示';   // 面板類型：純展示 / 純應用 / 共用（開頭就選，注入生成訊息）
    let currentParsedData = null;
    let _studioAbortCtrl = null;
    let pendingImages = []; // [{ dataUrl, mime, sizeKB }] — 用戶選好還沒發送的圖
    const KEEP_RECENT_IMAGES = 2; // 上下文中只保留最近 N 張圖（其他圖訊息中圖會被剝掉、只留文字 + 占位）
    const IMG_MAX_SIDE = 1024;    // 壓縮後最大邊長
    const IMG_QUALITY = 0.82;     // JPEG 品質
    const IMG_MAX_RAW_MB = 10;    // 單張原始檔案上限

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
        // 手機模式：開預覽時連 header 一起蓋掉(真．填滿整個創作室)，關閉再還原；用頂部握把關
        const contEl = appEl.querySelector('.studio-container');
        const isMob = (contEl && contEl.classList.contains('studio-mobile')) || (window.innerWidth || 9999) <= 768;
        const headerEl = appEl.querySelector('.studio-header');
        if (headerEl) headerEl.style.display = (willOpen && isMob) ? 'none' : '';
    }

    function getChatSessionId() { return currentMode; }

    function launch(container, landMode) {
        _landedDirect = !!landMode;   // 帶 landMode＝工坊直接入場，返回要一步退回工坊（別再落到孤兒首頁）
        const root = container || document.getElementById('aurelia-tab-container') || document.getElementById('aurelia-phone-screen') || document.body;
        try { syncActiveTagsToLocal(); } catch (e) {}   // 開創作室即用最新格式重組啟用組件說明（給注入器讀）
        let existing = document.getElementById('os_studio_app');
        if (existing) existing.remove();


        const appDiv = document.createElement('div');
        appDiv.id = 'os_studio_app';
        appDiv.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; z-index:9000; background: #EEF0F6;';
        appDiv.innerHTML = studioHTML;
        root.appendChild(appDiv);

        // 手機版佈局偵測：手機殼是「窄容器擺在寬視窗裡」，viewport media query 失效。
        // 優先用 DOM 祖先判斷（在手機殼內＝必手機版），再用實際容器寬度當後備，掛 .studio-mobile。
        try {
            const _cont = appDiv.querySelector('.studio-container');
            const _inPhone = !!(root && root.closest && root.closest('#aps-app-body, #aurelia-phone-screen, .aps-app'));
            const _applyMobile = () => {
                if (!_cont) return;
                const w = (root && root.getBoundingClientRect ? root.getBoundingClientRect().width : 0) || appDiv.offsetWidth || 0;
                _cont.classList.toggle('studio-mobile', _inPhone || (w > 0 && w <= 768));
            };
            _applyMobile();
            if (window.requestAnimationFrame) requestAnimationFrame(_applyMobile);
            if (window.ResizeObserver) { try { new ResizeObserver(_applyMobile).observe(root || appDiv); } catch (e) {} }
        } catch (e) {}

        bindEvents();
        loadMode(currentMode);     // 先把 vn_ui 工作區建好（先藏在首頁下）
        switchTopMode(landMode || 'home');     // 有指定就直接落到該工作（工坊四鈕直接進 vn_ui/theme/worldbook/persona）；否則落首頁四張卡
    }

    // ── 📋 創建說明書：給朋友自己的 Claude／GPT 看的「對外」規格書，照它產出 <json> 就能匯入回來 ──
    const STUDIO_CREATION_SPEC =
`你要幫我做一個「奧瑞亞」視覺小說(VN)系統用的 UI 面板。它會在劇情進行時被一個標籤叫出來、嵌進故事畫面裡，用來顯示資料（例如狀態欄、角色卡、好感度、物品欄、獎勵結算等）。

【最終輸出格式｜務必照這個，否則匯入不進去】
只輸出一個 <json>…</json> 區塊，裡面是一個 JSON 物件，含這幾個鍵：
- tagId：面板的英文標籤名（英數底線、簡短，例如 status_panel、reward_box）
- isBlock：true=多行區塊資料、false=單行
- html：面板 HTML 結構（字串）
- css：面板 CSS（字串；所有選擇器父層用 .custom-status-panel 包住，避免污染外部）
- js：互動 JS（字串，沒有就空字串 ""）
- usageDesc：給「劇本 AI」的一句極簡用途說明
- demoFormat：給「劇本 AI」填資料的格式範本（用佔位符、不要寫死真實內容）
⚠️ JSON 字串值內的換行寫成 \\n、雙引號轉義成 \\"，不要直接斷行。

【資料怎麼進面板｜重要，別寫死數值】
面板顯示動態資料，用 {{欄位名}} 當佔位符，奧瑞亞跑劇情時會把真實值填進去：
- 單一欄位：{{血量}}、{{金幣}}
- 多筆（多角色／多物品）用迴圈：{{#each 列表名}} …單筆HTML… {{/each}}；迴圈內 {{@key}}=名稱、{{@avatar}}=頭像URL、{{欄位名}}=該筆的值。
demoFormat 就是告訴劇本 AI「要填哪些欄位、什麼結構」，用明顯佔位符風格（例如 {名稱}／{數值}），★絕對不要塞真實內容範例（劇本 AI 會照抄）。

【三種顯示寬度｜一定響應式、不破版】
面板會被放進三種外框：手機約 390px／桌面中間約 1000px／桌面全屏約 1920px。
一律 width:100% / max-width / flex / grid / clamp() / 百分比，絕不寫死會破版的大固定像素寬。三種寬度都要排版正常、不溢出、不擠壞。根容器給合理 min-height，別讓內容少時塌成一條。

【🚫 別做無聊面板｜這條最重要】
禁止普通網頁卡片式 UI：禁止卡片套卡片、禁止單純 header+content+footer 堆疊、禁止普通圓角矩形列表、禁止只靠漸層陰影假高級。
必須做成「主題化遊戲組件」：
- 外形跟「這個面板的用途／主題」綁定（例如寶箱、卷軸、通訊終端、檔案夾、契約書、塔羅牌…依實際用途挑、別每次同一個）。
- 資訊區融入主體結構（鎖孔、紙頁、機械螢幕、銘牌…），不要另開一個方塊貼上去。
- 至少一個 SVG / CSS 造型元素當「視覺主體」（不是只當小圖示）。
- 按鈕要像拉桿／封印／鑰匙孔／啟動核心這種跟主體一體成形的互動件。
- 桌面版橫向展開用足空間，手機版再收窄；不要一開始就做成窄卡片。

【按鈕文字】純內容就好，不要加 [ ] < > >> 之類 ASCII 裝飾，裝飾效果用 CSS 做。

【你要做的】
1. 先跟我確認：這個面板要顯示什麼資料、什麼主題、純展示還是要有互動。
2. 照上面規則設計，最後給我那個 <json>…</json> 區塊（只要這一段，別包 markdown 圍欄）。
3. 我會把它複製、貼回奧瑞亞創作室的「📥 匯入面板」→ 載入 → 儲存，就能在劇情裡用了。

現在開始：先問我這個面板要做什麼。`;

    function _fallbackCopy(text, done) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.focus(); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
            done && done();
        } catch (e) { alert('複製失敗，請手動全選複製。'); }
    }
    function _copyCreationSpec() {
        const btn = document.getElementById('studio-spec-copy-btn');
        const done = () => { if (btn) { const t = btn.dataset._t || btn.textContent; btn.dataset._t = t; btn.textContent = '✅ 已複製！貼進你的 Claude／GPT'; setTimeout(() => { btn.textContent = btn.dataset._t; }, 1900); } };
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(STUDIO_CREATION_SPEC).then(done, () => _fallbackCopy(STUDIO_CREATION_SPEC, done));
            } else { _fallbackCopy(STUDIO_CREATION_SPEC, done); }
        } catch (e) { _fallbackCopy(STUDIO_CREATION_SPEC, done); }
    }
    function _doImportLoad() {
        const ta = document.getElementById('studio-import-textarea');
        const status = document.getElementById('studio-import-status');
        const raw = (ta && ta.value || '').trim();
        if (!raw) { if (status) status.textContent = '⚠️ 先把 <json> 內容貼進來'; return; }
        currentParsedData = null;   // 匯入是「新面板」，別繼承上一個的 history
        const ok = extractAndParseJson(raw);   // 解析成功會 set currentParsedData + 跑 renderPreviewPanel
        if (ok && currentParsedData && !Array.isArray(currentParsedData) && currentParsedData.tagId && currentParsedData.html) {
            if (status) status.textContent = '✅ 已載入！這視窗會自動關 → 上方切「預覽」檢查 → 按「✅ 確定創建」存起來。';
            try { document.querySelector('.studio-tab[data-tab="preview"]') && document.querySelector('.studio-tab[data-tab="preview"]').click(); } catch (e) {}
            setTimeout(() => { const m = document.getElementById('studio-import-modal'); if (m) m.style.display = 'none'; }, 1000);
        } else {
            if (status) status.textContent = '❌ 解析失敗或缺 tagId／html。確認貼的是完整 <json>{…}</json>（含七個鍵），再試一次。';
        }
    }
    function _setupImportEvents() {
        const specBtn = document.getElementById('studio-spec-copy-btn');
        if (specBtn) specBtn.onclick = _copyCreationSpec;
        const impBtn = document.getElementById('studio-import-btn');
        if (impBtn) impBtn.onclick = () => {
            const m = document.getElementById('studio-import-modal');
            const ta = document.getElementById('studio-import-textarea');
            const st = document.getElementById('studio-import-status');
            if (ta) ta.value = ''; if (st) st.textContent = '';
            if (m) m.style.display = 'flex';
        };
        const closeImp = () => { const m = document.getElementById('studio-import-modal'); if (m) m.style.display = 'none'; };
        const c1 = document.getElementById('studio-import-close'); if (c1) c1.onclick = closeImp;
        const c2 = document.getElementById('studio-import-cancel'); if (c2) c2.onclick = closeImp;
        const md = document.getElementById('studio-import-modal'); if (md) md.onclick = (e) => { if (e.target && e.target.id === 'studio-import-modal') closeImp(); };
        const ld = document.getElementById('studio-import-load'); if (ld) ld.onclick = _doImportLoad;
    }

    // ⚡ 組件快捷：常用 UI 話術 chip，點一下塞進輸入框（可改再送）。內建幾個 + 使用者自存(localStorage)
    const STUDIO_CHIP_BUILTIN = [
        { label: '兩層結構', text: '做成兩層結構：第一層列表瀏覽，點項目進第二層看詳情，有返回鈕。' },
        { label: 'TAB 分頁', text: '頂部加一排 TAB 分頁，點不同 TAB 切換下面的內容區。' },
        { label: '固定標題', text: '頂部標題列固定不動，只有下面的內容區可以捲動。' },
        { label: '卡片列表', text: '內容用一張張卡片直列呈現，每張資訊清楚、可點。' },
        { label: '深色主題', text: '用深色背景配色、字體清楚，沉穩不刺眼。' },
        { label: '🖼️ 生圖', feature: true, key: 'img', text: '【生圖功能】用 st.setImage(el, prompt, type, provider) 給 <img> 設圖（type: char／item／pet／scene；provider 可選 pollinations／novelai／tavern_sd／comfyui_direct，用戶有指定才填、否則不傳）。生圖前 st.loading(el,true)、完 st.loading(el,false)。紀律：只給 FOCUS／重要對象（主角、焦點角色、重要物品/場景）生圖；路人／NPC／頭像縮圖／大量小圖一律不生圖，改用名字首字色塊頭像（純 CSS：首字放圓形 div、背景用名字 hash 出 hsl）。自己塞 url 的 img 都加 onerror 退回佔位／首字頭像，不要破圖。' },
        { label: '📤 回傳對話框', feature: true, key: 'tochat', text: '【回傳對話框功能】用 st.toChat(文字, opts) 把文字貼回酒館對話框（送出框）：預設只貼、使用者自己按送出；傳 {send:true} 直接幫送。用在「app 生內容→使用者挑一條→送進劇情當輸入／指令」（例：隨機事件 app 生 5 條、選 1 條 toChat 進劇情）。' }
    ];
    // 功能 chip（feature:true）＝toggle 啟用：用法在送出時併進請求(apiPayload 的 system)、不貼輸入框；話術 chip 照舊貼輸入框
    const _studioActiveFeatures = new Set();
    function _studioLoadActiveFeatures() { try { (JSON.parse(localStorage.getItem('studio_active_features') || '[]') || []).forEach(k => _studioActiveFeatures.add(k)); } catch (e) {} }
    function _studioSaveActiveFeatures() { try { localStorage.setItem('studio_active_features', JSON.stringify([..._studioActiveFeatures])); } catch (e) {} }
    _studioLoadActiveFeatures();
    function _studioInjectActiveFeatures(apiPayload) {
        try {
            const txt = STUDIO_CHIP_BUILTIN.filter(c => c.feature && _studioActiveFeatures.has(c.key)).map(c => c.text).join('\n\n');
            if (txt) apiPayload.unshift({ role: 'system', content: '【使用者已啟用的進階功能：照下列用法使用；沒列在這裡的進階功能（生圖／回傳對話框等）一律不要用、也別自己瞎掰 API】\n' + txt });
        } catch (e) {}
    }
    function _studioLoadChips() { try { return JSON.parse(localStorage.getItem('studio_quick_chips') || '[]') || []; } catch (e) { return []; } }
    function _studioSaveChips(list) { try { localStorage.setItem('studio_quick_chips', JSON.stringify(list)); } catch (e) {} }
    function _studioInsertChip(text) {
        const ta = document.getElementById('studio-input');
        if (!ta) return;
        const cur = (ta.value || '').replace(/\s+$/, '');
        ta.value = cur ? (cur + '\n' + text) : text;
        try { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; } catch (e) {}
        ta.focus();
    }
    function renderStudioChips() {
        const row = document.getElementById('studio-chips-row');
        if (!row) return;
        const all = STUDIO_CHIP_BUILTIN.concat(_studioLoadChips());
        row.innerHTML = all.map((c, i) => {
            const feat = !!c.feature;
            const on = feat && _studioActiveFeatures.has(c.key);
            return `<button class="studio-chip${feat ? ' studio-chip-feature' : ''}${on ? ' active' : ''}" data-ci="${i}">${_sgcEsc(c.label)}</button>`;
        }).join('')
            + '<button class="studio-chip studio-chip-manage" id="studio-chip-manage"><i class="fa-solid fa-sliders"></i> 管理</button>';
        row.querySelectorAll('[data-ci]').forEach(b => b.onclick = () => {
            const c = all[parseInt(b.getAttribute('data-ci'), 10)];
            if (!c) return;
            if (c.feature) {
                // 功能 chip：toggle 啟用，用法送出時才併進請求、不貼進輸入框（不再擠爆輸入框）
                if (_studioActiveFeatures.has(c.key)) _studioActiveFeatures.delete(c.key); else _studioActiveFeatures.add(c.key);
                _studioSaveActiveFeatures();
                b.classList.toggle('active', _studioActiveFeatures.has(c.key));
            } else {
                _studioInsertChip(c.text);   // 話術 chip：照舊貼進輸入框可改再送
            }
        });
        const mg = row.querySelector('#studio-chip-manage');
        if (mg) mg.onclick = _studioOpenChipModal;
    }
    function _studioOpenChipModal() {
        const m = document.getElementById('studio-chip-modal'); if (!m) return;
        m.classList.add('show');
        const lab = document.getElementById('studio-chip-label'); if (lab) lab.value = '';
        const txt = document.getElementById('studio-chip-text'); if (txt) txt.value = '';
        _studioRenderChipList();
    }
    function _studioRenderChipList() {
        const list = document.getElementById('studio-chip-list'); if (!list) return;
        const user = _studioLoadChips();
        if (!user.length) { list.innerHTML = '<div class="studio-chip-empty">還沒有自訂快捷。上面填一個存起來，就會出現在輸入框上方。</div>'; return; }
        list.innerHTML = user.map((c, i) => `<div class="studio-chip-litem">
            <span class="studio-chip-litem-label">${_sgcEsc(c.label)}</span>
            <span class="studio-chip-litem-text">${_sgcEsc(c.text)}</span>
            <button class="studio-chip-del" data-di="${i}" aria-label="刪除"><i class="fa-solid fa-trash"></i></button>
        </div>`).join('');
        list.querySelectorAll('[data-di]').forEach(b => b.onclick = () => {
            const u = _studioLoadChips(); u.splice(parseInt(b.getAttribute('data-di'), 10), 1); _studioSaveChips(u);
            _studioRenderChipList(); renderStudioChips();
        });
    }
    function _studioSaveNewChip() {
        const labEl = document.getElementById('studio-chip-label'), txtEl = document.getElementById('studio-chip-text');
        const lab = ((labEl && labEl.value) || '').trim(), txt = ((txtEl && txtEl.value) || '').trim();
        if (!lab || !txt) { alert('標籤跟話術都要填'); return; }
        const u = _studioLoadChips(); u.push({ label: lab.slice(0, 12), text: txt }); _studioSaveChips(u);
        if (labEl) labEl.value = ''; if (txtEl) txtEl.value = '';
        _studioRenderChipList(); renderStudioChips();
    }

    function bindEvents() {
        document.getElementById('studio-back-btn').onclick = () => {
            // 讀 DOM 實際狀態當真相（別靠 _studioTop 變數：載入器可能跑兩份模組→變數會跟畫面不同步）
            const cont = document.querySelector('#os_studio_app .studio-container');
            // 工坊四鈕直接入場：創作室首頁已搬到工坊、成孤兒，返回一步直接退出創作室回工坊，不再落到「今天要做什麼」
            if (_landedDirect) { const app = document.getElementById('os_studio_app'); if (app) app.remove(); return; }
            if (cont && !cont.classList.contains('top-home')) switchTopMode('home'); // 舊路徑(編輯模式等)不在首頁→ 返回首頁
            else { const app = document.getElementById('os_studio_app'); if (app) app.remove(); } // 已在首頁 → 返回大廳
        };
        document.querySelectorAll('.studio-task-card').forEach(card => {
            const go = () => switchTopMode(card.getAttribute('data-go'));
            card.onclick = go;
            card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
        });
        _setupRawEditModalEvents();
        _setupImportEvents();
        renderStudioChips();
        { const cc = document.getElementById('studio-chip-close'); if (cc) cc.onclick = () => { const m = document.getElementById('studio-chip-modal'); if (m) m.classList.remove('show'); }; }
        { const cs = document.getElementById('studio-chip-save'); if (cs) cs.onclick = _studioSaveNewChip; }
        { const cm = document.getElementById('studio-chip-modal'); if (cm) cm.onclick = (e) => { if (e.target === cm) cm.classList.remove('show'); }; }

        const previewFab     = document.getElementById('studio-preview-fab');
        const drawerBackdrop = document.getElementById('studio-drawer-backdrop');
        const drawerHandle   = document.getElementById('studio-drawer-handle');
        if (previewFab)     previewFab.addEventListener('click', () => togglePreviewDrawer());
        const headerPreviewBtn = document.getElementById('studio-header-preview-btn');
        if (headerPreviewBtn) headerPreviewBtn.addEventListener('click', () => togglePreviewDrawer());
        if (drawerBackdrop) drawerBackdrop.addEventListener('click', () => togglePreviewDrawer(false));
        if (drawerHandle)   drawerHandle.addEventListener('click', () => togglePreviewDrawer(false));

        document.getElementById('studio-clear-btn').onclick = async () => {
            const channelName = '當前頻道';
            if (confirm(`確定要清空 [${channelName}] 的對話紀錄嗎？`)) {
                const chatId = getChatSessionId();
                // chatMessages 重置時也順便砍掉 latest panel marker（雖然 chatMessages 整個被重設了）
                chatMessages = [{ role: 'system', content: MODES[currentMode].prompt }];
                currentParsedData = null;
                // 清空 IDB
                if (win.OS_DB && win.OS_DB.clearStudioChat) {
                    win.OS_DB.clearStudioChat(chatId).catch(e=>e);
                }
                // 清空 localStorage 備份（聊天歷史 + 預覽狀態快照）
                localStorage.removeItem(`os_studio_chat_${chatId}`);
                _clearParsedCache(chatId);
                renderChatHistory();
                renderPreviewPanel();
            }
        };

        const inputEl = document.getElementById('studio-input');
        const sendBtn = document.getElementById('studio-send-btn');
        sendBtn.onclick = handleSend;
        // Enter 發送、Shift+Enter 換行（恢復原邏輯）
        inputEl.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

        // 面板類型選擇器（純展示 / 純應用 / 共用）
        document.querySelectorAll('#studio-type-row .studio-type').forEach(b => b.onclick = () => {
            _vnPanelType = b.dataset.type;
            document.querySelectorAll('#studio-type-row .studio-type').forEach(x => x.classList.toggle('active', x === b));
        });
        // 自適應高度：先 reset height=auto 讓瀏覽器算對 scrollHeight，再 set 新高（min 50 / max 200，超出走內部 scroll）
        const autosizeTextarea = () => {
            inputEl.style.height = 'auto';
            const target = Math.min(Math.max(inputEl.scrollHeight, 50), 200);
            inputEl.style.height = target + 'px';
        };
        inputEl.addEventListener('input', autosizeTextarea);
        // Shift+Enter 換行的 input 事件偶爾 timing 不對，補 keyup 保險
        inputEl.addEventListener('keyup', autosizeTextarea);

        // === 📎 圖片上傳 ===
        const attachBtn = document.getElementById('studio-attach-btn');
        const fileInput = document.getElementById('studio-image-input');
        if (attachBtn && fileInput) {
            attachBtn.onclick = () => fileInput.click();
            fileInput.onchange = async (e) => {
                const files = Array.from(e.target.files || []);
                fileInput.value = ''; // 清空以允許再選同檔
                for (const f of files) {
                    if (!f.type.startsWith('image/')) { alert(`「${f.name}」不是圖片，跳過`); continue; }
                    if (f.size > IMG_MAX_RAW_MB * 1024 * 1024) {
                        alert(`「${f.name}」超過 ${IMG_MAX_RAW_MB}MB，請先縮小再上傳`);
                        continue;
                    }
                    try {
                        const dataUrl = await _resizeImageToDataUrl(f, IMG_MAX_SIDE, IMG_QUALITY);
                        const sizeKB = Math.round(dataUrl.length * 0.75 / 1024); // base64 → byte 比例 ~0.75
                        pendingImages.push({ dataUrl, mime: 'image/jpeg', sizeKB });
                    } catch (err) {
                        console.warn('[Studio] 圖片處理失敗:', err);
                        alert(`「${f.name}」處理失敗：${err.message || err}`);
                    }
                }
                renderPendingImages();
            };
        }

        // === VN 工具列：還原舊版按鈕（重新設計按鈕已移除：大改現在直接打字發送、diff 路徑會自動整包重做、不用重發）===
        const vnHistBtn = document.getElementById('vn-studio-history-btn');
        if (vnHistBtn) {
            vnHistBtn.onclick = () => {
                const area = document.getElementById('vn-studio-history-area');
                const isOpen = area.style.display === 'block';
                area.style.display = isOpen ? 'none' : 'block';
                if (!isOpen) renderVNHistoryArea();
            };
        }

        const tabs = document.querySelectorAll('.studio-tab');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('studio-preview-content').style.display  = tab.dataset.tab === 'preview' ? 'flex'   : 'none';
                document.getElementById('studio-source-content').style.display   = tab.dataset.tab === 'source'  ? 'block'  : 'none';
                document.getElementById('studio-gallery-content').style.display  = tab.dataset.tab === 'gallery' ? 'block'  : 'none';
                // 「✅ 確定創建」footer 只在「預覽」分頁顯示（原碼/VN組件 不該看到）
                { const _aa = document.querySelector('.studio-action-area'); if (_aa) _aa.style.display = tab.dataset.tab === 'preview' ? 'flex' : 'none'; }
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
            // 發布至世界書功能已隨「世界觀草稿」模式退役；按鈕永遠隱藏，保留元素避免其他程式抓不到。
            publishBtn.onclick = () => {};
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

    // ── 預覽狀態存檔：diff refine 後修改記憶體中的 currentParsedData，必須持久化否則重整就丟
    // 聊天歷史存的是摘要不是 JSON，重整時 extractLatestJsonFromHistory 只能撈到最早的版本
    // 所以額外用 localStorage 存「當前修改後的 currentParsedData 完整快照」
    function _saveParsedCache(chatId) {
        try {
            if (currentParsedData) {
                localStorage.setItem(`os_studio_parsed_${chatId}`, JSON.stringify(currentParsedData));
            }
            // ⚠️ currentParsedData 為 null（如存檔後 line654 會清空）時「不動快取」，保留「最後一版」當耐久底。
            //   以前這裡 removeItem → 存檔後快取被砍 → 下次編輯撈不到 → 退聊天歷史 → [LATEST_PANEL_STATE] 是
            //   system 訊息不持久化(line818) → 只撈到初版 → 把之前所有 diff 修改全還原（Rae 踩的「上次修改又彈回」bug）。
            //   真要清空走「清空對話」鈕的 _clearParsedCache。
        } catch(e) { console.warn('[Studio] 預覽狀態存檔失敗:', e); }
    }
    function _clearParsedCache(chatId) {
        try { localStorage.removeItem(`os_studio_parsed_${chatId}`); } catch(e) {}
    }
    function _loadParsedCache(chatId) {
        try {
            const raw = localStorage.getItem(`os_studio_parsed_${chatId}`);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch(e) { return null; }
    }

    // 把當前 currentParsedData 偷偷塞進 chatMessages 一條隱藏 system 訊息
    // 用途：cache 失蹤時的最後保險，從聊天記錄也能撈回最新版
    // 不顯示在 UI（renderChatHistory 跳過 system role），但跟著 chatMessages 一起進 IndexedDB
    const LATEST_PANEL_MARKER = '[LATEST_PANEL_STATE]';
    function _saveLatestPanelToHistory() {
        if (!currentParsedData) return;
        if (Array.isArray(currentParsedData)) return;
        try {
            const jsonStr = JSON.stringify(currentParsedData);
            // 移除舊的 latest panel marker 訊息
            chatMessages = chatMessages.filter(m => !(m._isLatestPanel === true));
            // 推新的
            chatMessages.push({
                role: 'system',
                content: `${LATEST_PANEL_MARKER}\n<json>${jsonStr}</json>`,
                _isLatestPanel: true
            });
            _studioSave(getChatSessionId());
        } catch(e) { console.warn('[Studio] 寫入最新面板狀態到聊天記錄失敗:', e); }
    }

    // ============================================================
    // === 📎 圖片上傳：壓縮、預覽、組 content、歷史修剪 ===
    // ============================================================

    // 用 Canvas 壓縮圖片到 maxSide 邊長 + JPEG quality
    function _resizeImageToDataUrl(file, maxSide, quality) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                try {
                    let { width, height } = img;
                    if (width > maxSide || height > maxSide) {
                        if (width >= height) { height = Math.round(height * maxSide / width); width = maxSide; }
                        else { width = Math.round(width * maxSide / height); height = maxSide; }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    URL.revokeObjectURL(url);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                } catch (e) { URL.revokeObjectURL(url); reject(e); }
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('圖片載入失敗')); };
            img.src = url;
        });
    }

    function renderPendingImages() {
        const wrap = document.getElementById('studio-pending-images');
        if (!wrap) return;
        wrap.innerHTML = '';
        if (pendingImages.length === 0) { wrap.classList.remove('active'); return; }
        wrap.classList.add('active');
        pendingImages.forEach((img, idx) => {
            const chip = document.createElement('div');
            chip.className = 'studio-pending-img';
            chip.innerHTML = `
                <img src="${img.dataUrl}" alt="參考圖">
                <div class="pi-size">${img.sizeKB}KB</div>
                <div class="pi-del" title="移除">✖</div>
            `;
            chip.querySelector('.pi-del').onclick = () => {
                pendingImages.splice(idx, 1);
                renderPendingImages();
            };
            wrap.appendChild(chip);
        });
    }

    // 構建 user message 的 content：純文字或 multimodal 陣列
    function buildUserMessageContent(text, images) {
        if (!images || images.length === 0) return text || '';
        const parts = [];
        if (text) parts.push({ type: 'text', text });
        images.forEach(img => parts.push({
            type: 'image_url',
            image_url: { url: img.dataUrl }
        }));
        return parts;
    }

    // message.content 是字串 → 直接回；是陣列 → 抽 text 部分串起來（給 console / token 估算 / 純文字解析用）
    function messageContentToString(content) {
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content.filter(p => p && p.type === 'text').map(p => p.text || '').join('\n');
        }
        return '';
    }

    function messageHasImage(content) {
        return Array.isArray(content) && content.some(p => p && p.type === 'image_url');
    }

    // 修剪 apiPayload：只保留最近 N 條帶圖訊息（其他帶圖訊息 → 圖被剝掉、只留文字 + 占位）
    function pruneImagesFromHistory(payload) {
        let kept = 0;
        for (let i = payload.length - 1; i >= 0; i--) {
            const m = payload[i];
            if (!messageHasImage(m.content)) continue;
            if (kept < KEEP_RECENT_IMAGES) { kept++; continue; }
            // 剝掉圖、只留文字
            const text = messageContentToString(m.content);
            m.content = (text ? text + '\n' : '') + '[早期附圖已隱藏節省 context]';
        }
        return payload;
    }

    async function switchChatSession() {
        chatMessages = [];
        document.getElementById('studio-input').value = '';
        const chatId = getChatSessionId();

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

        // 優先讀 diff refine 後存的「最新修改快照」；沒有才回退到聊天歷史抽 JSON
        const cached = _loadParsedCache(chatId);
        if (cached) {
            currentParsedData = cached;
            activePreviewData = Array.isArray(currentParsedData) ? currentParsedData[0] : currentParsedData;
            const cssLen = (cached.css || '').length;
            const htmlLen = (cached.html || '').length;
            console.log(`[Studio] ✅ 預覽 cache 命中 (chatId=${chatId}): tagId=${cached.tagId || '?'}, css=${cssLen}字, html=${htmlLen}字`);
        } else {
            console.warn(`[Studio] ⚠️ 預覽 cache 未命中 (chatId=${chatId})，退回從聊天歷史抽 JSON（會抽到最早的版本，不是最新修改！）`);
            extractLatestJsonFromHistory();
        }
        renderPreviewPanel();
    }

    // 頂層 mode 切換：vn_ui=煉丹創作器、theme=主題編輯器（獨立全區，靠 .top-theme class 切顯示）
    function switchTopMode(mode) {
        const cont = document.querySelector('#os_studio_app .studio-container');
        if (cont) cont.classList.remove('top-theme', 'top-worldbook', 'top-persona', 'top-home');
        _studioTop = mode;
        if (mode === 'home') {
            if (cont) cont.classList.add('top-home');
        } else if (mode === 'theme') {
            if (cont) cont.classList.add('top-theme');
            renderThemePanel();
        } else if (mode === 'worldbook') {
            if (cont) cont.classList.add('top-worldbook');
            renderWorldbookPanel();
        } else if (mode === 'persona') {
            if (cont) cont.classList.add('top-persona');
            renderPersonaPanel();
        } else {
            loadMode(mode);
        }
        _updateStudioHeader();
    }
    // header 的 👁️預覽／🗑清空 只在「製作互動面板」(vn_ui) 有意義；首頁/主題/世界書藏起來別佔空間
    function _updateStudioHeader() {
        const cont = document.querySelector('#os_studio_app .studio-container');
        // vn_ui＝沒有任何 top-* class（首頁/主題/世界書各有 top-home/theme/worldbook）。讀 DOM 不靠變數，防 desync。
        const vnui = !!cont && !cont.classList.contains('top-home') && !cont.classList.contains('top-theme') && !cont.classList.contains('top-worldbook') && !cont.classList.contains('top-persona');
        const clearBtn = document.getElementById('studio-clear-btn');
        const prevBtn = document.getElementById('studio-header-preview-btn');
        if (clearBtn) clearBtn.style.display = vnui ? '' : 'none';
        if (prevBtn) prevBtn.style.display = vnui ? '' : 'none';   // '' = 交回 CSS（手機才顯示）
    }

    async function loadMode(modeId) {
        currentMode = modeId;
        currentParsedData = null;
        activePreviewData = null;
        document.getElementById('os_studio_app').setAttribute('data-mode', modeId);

        // 根據 mode 動態切換 tab 顯示
        // vn_ui: preview | source | gallery
        const galleryTab = document.getElementById('studio-tab-gallery');
        const sourceTab = document.getElementById('studio-tab-source');
        if (galleryTab) galleryTab.style.display = modeId === 'vn_ui' ? '' : 'none';
        if (sourceTab)  sourceTab.style.display  = modeId === 'vn_ui' ? '' : 'none';
        const typeRow = document.getElementById('studio-type-row');
        if (typeRow) typeRow.style.display = modeId === 'vn_ui' ? 'flex' : 'none';
        const chipsRow = document.getElementById('studio-chips-row');
        if (chipsRow) chipsRow.style.display = modeId === 'vn_ui' ? 'flex' : 'none';

        // 切 mode 一律重置到 preview tab
        document.querySelectorAll('.studio-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.studio-tab[data-tab="preview"]')?.classList.add('active');
        document.getElementById('studio-preview-content').style.display  = 'flex';
        document.getElementById('studio-source-content').style.display   = 'none';
        document.getElementById('studio-gallery-content').style.display  = 'none';
        { const _aa = document.querySelector('.studio-action-area'); if (_aa) _aa.style.display = 'flex'; }   // 預覽 tab → 顯示確定創建 footer

        await switchChatSession();
    }

    // VN 對話框 CSS 生成 prompt（給 AI 副模型）
    const VTH_AI_PROMPT = `你是 VN（視覺小說）面板的 UI 設計師。根據用戶描述的風格，生成一段純 CSS，重新設計 VN 介面這幾個元素（只有這些，其他一律別碰）。創意火力集中在「對話框」——它是主力、是主視覺；其餘元素只配合主題重新上色/造型，「位置一律不動」。

可設計的元素：
- #text-panel：對話框外框，整個畫面的「主視覺、主力，你要重點發揮的地方」。⚠️它一定帶三狀態 class 之一：.char-mode（角色說話，最常見）/ .nar-mode（旁白）/ .inner-mode（內心）。預設已分別對 #text-panel.char-mode、.nar-mode、.inner-mode 設了背景，特異性比純 #text-panel 高，所以換背景/邊框「必須」分別寫這三條，否則沒效果。三態都要做。背景、邊框、外框、圓角、clip-path 造型、::before/::after 裝飾、材質紋理、字體、陰影、動畫……都大膽用，做出有記憶點的設計，別只是換顏色。唯一限制：它要維持在「畫面底部、水平置中」，別用 position/transform 把 #text-panel 或外層 #text-panel-wrapper 搬走。
- #dialogue-text：對話內文（字體 / 字色 / 行距），配合對話框設計。⚠️文字對齊保持預設靠左，不要置中（見下方鐵則）。
- #speaker-name：角色名牌（固定浮在對話框左上，旁白時自動隱藏）。只重新設計它的外觀（底色/邊框/圓角/字體/造型）配合對話框，「位置不要動」。
- #top-badge：左上角的「場景牌」，顯示當前時間・地點（例如「黃昏 南城舊巷」，文字兩側有金色短線裝飾，那是 ::before / ::after）。可重新設計它的外觀（底色/漸隱/邊框/圓角/字體/裝飾線）配合主題，但「位置不要動」（固定左上）。註：直播模式時同樣內容會改顯示在 #stream-scene-row（內含 #stream-scene-label），請一併配合上色。
- #vn-panel-controls 與 .vn-panel-btn：對話框上方的 SKIP / LOG / AUTO 控制按鈕（.vn-panel-btn.active 為啟用態）。「位置不要動」，只重新上色/造型配合主題。
- #btn-home、#btn-settings、#btn-phone：畫面右上角的頂部按鈕（返回 / 設定 / 應用）。「位置不要動」，只重新統一它們的外觀配合主題。

【最重要的鐵則 — 配件一律不准移動】
- 除了對話框維持在底部置中之外，名牌、場景牌、控制鈕、頂部鈕「全部保持原本位置」。「絕對不要」對 #speaker-name、#top-badge、#stream-scene-row、#vn-panel-controls、.vn-panel-btn、#btn-home、#btn-settings、#btn-phone 用 position / top / left / right / bottom / transform 去移動它們——它們各自有固定擺放區，一移動就會飛出主視覺窗口被切掉。你只能改它們的「外觀」（顏色/邊框/圓角/字體/陰影/材質），不能改位置。

【可讀性 — 最優先】
- 對話框「文字所在那層」的底必須夠不透明：實心色，或 alpha ≥ 0.82。要玻璃感就把透明留外緣，文字正下方壓一層實底，確保字不被背景圖洗掉。
- #dialogue-text 字色跟對話框底色要「強對比」：深底配亮字、亮底配深字；不要半透明字、不要相近色。
- 名牌固定在對話框左上、會略往框內凹約 20px，所以 #text-panel 的 padding-top 要 ≥ 32px，別讓名牌蓋住第一行內文。
- 三態 .char-mode / .nar-mode / .inner-mode 各自都要顧到。

【完成度 — 成套，不准半吊子】
- 所有元素用「同一套設計語言」做成完整一組，不可以對話框做得很炫、名牌和按鈕卻還停在預設黑。控制鈕和頂部鈕也要呼應對話框的主風格與質感。

【裝飾技法 — 鼓勵大膽用，讓設計有記憶點】
- 善用 ::before / ::after 偽元素在對話框上做「偽容器」裝飾：底部花邊條、四角紋飾、貼紙、徽章、圖標、雙層描邊都可以。可用內聯 SVG（background-image:url("data:image/svg+xml,...")）做 pattern 或圖示，或用 repeating-linear-gradient / radial-gradient 做斜紋、網點、掃描線等紋理。
- 但所有裝飾「一律加 pointer-events:none」（對話框是點一下繼續劇情的，裝飾蓋住會擋住推進）；且必須放在 #dialogue-text 的下層或邊緣、不可蓋住內文。
- 每個元素只有 ::before / ::after 兩個偽元素；需要更多層次就在同一 background 疊多張漸層/圖，或借用 #speaker-name、#top-badge 的偽元素。

規則：
1. 可用 @import 載字體、用 ::before/::after 加裝飾、用 @keyframes 做動畫。
2. 「絕對不要」對 #game-char / #game-char-container（角色立繪）或 #game-bg（全螢幕背景圖層，會被劇情背景圖蓋掉、改了也看不到）寫任何樣式——它們不歸主題管。
3. 對話框背景務必分別寫 #text-panel.char-mode / .nar-mode / .inner-mode 三條。
4. #dialogue-text（含三態）一律保持預設的「靠左」對齊，「絕對不要」設 text-align:center 或任何置中——劇情有逐字打字機效果，置中會讓字從中間往兩邊跑，既難看又難讀。
5. 輸出前自檢一次：把你的設計想像疊在一張明亮、雜亂的背景圖上——文字一眼可讀嗎？有沒有元素跑出畫面或互相遮住？有沒有不小心把內文置中？有問題就修好再輸出。
6. 只輸出 CSS，用 \`\`\`css 包起來，不要任何解釋文字。
用戶想要的風格：`;

    // ── 🎨 劇情面板主題工坊（生成 → 即時預覽 → 主題庫收藏；像 VN UI 那套）──
    // 預覽用：複刻 VN 介面預設外觀（對話框/名牌/背景容器/控制鈕/頂部鈕），讓主題 CSS 疊上去效果跟真實 VN 一致。立繪不在範圍內。
    const VTH_PREVIEW_BASE = `
:root{--gold:#d4af37;--gold-light:#f3e5ab;--gold-dark:#997a00;--em-color:#d4af37;--text-color:#dcd8d0;--name-color:#d4af37;--font-classic:'Playfair Display','Noto Serif TC',serif;--font-sans:system-ui,'Noto Sans TC',sans-serif;}
*{box-sizing:border-box;}
html,body{margin:0;height:100%;}
body{font-family:var(--font-classic);position:relative;min-height:100%;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding:14px;}
/* 預覽用唯讀示意背景圖（不是可編輯的主題目標，僅模擬真實劇情背景圖、偏亮偏雜，用來檢驗文字可讀性） */
#game-bg{position:absolute;inset:0;background-color:#050505;background-image:linear-gradient(160deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%), linear-gradient(135deg, #4a6b8a 0%, #7a6a8c 38%, #c89a6a 72%, #e8cf9e 100%);background-size:cover;background-position:center;z-index:1;}
#top-badge{position:absolute;top:14px;left:14px;z-index:10;border:none;box-shadow:none;border-radius:0;background:linear-gradient(to right,transparent 0%,rgba(0,0,0,0.55) 12%,rgba(0,0,0,0.55) 88%,transparent 100%);color:#f0e8d0;display:inline-block;padding:7px 28px;font-weight:700;font-size:0.88rem;letter-spacing:2.5px;line-height:1.5;text-shadow:0 0 4px rgba(0,0,0,1),0 0 10px rgba(0,0,0,0.9);}
#top-badge::before{content:'';display:inline-block;vertical-align:middle;width:16px;height:1px;background:linear-gradient(to right,transparent,#c8a96e);margin-right:10px;margin-bottom:2px;}
#top-badge::after{content:'';display:inline-block;vertical-align:middle;width:16px;height:1px;background:linear-gradient(to left,transparent,#c8a96e);margin-left:10px;margin-bottom:2px;}
#btn-home,#btn-settings,#btn-phone{position:absolute;z-index:15;background:rgba(10,10,12,0.6);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);border:1px solid rgba(212,175,55,0.3);color:var(--gold-dark);padding:6px 12px;cursor:pointer;font-size:0.7rem;font-family:var(--font-classic);letter-spacing:1px;border-radius:2px;text-transform:uppercase;}
#btn-phone{top:12px;right:12px;padding:6px 10px;}
#btn-settings{top:12px;right:70px;}
#btn-home{top:12px;right:144px;}
#text-panel-wrapper{position:relative;z-index:5;width:88%;max-width:560px;margin:0 auto;}
#text-panel{position:relative;padding:26px 30px;min-height:96px;border-radius:4px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);}
#text-panel.nar-mode{background:linear-gradient(180deg,rgba(12,12,16,0.88),rgba(4,4,6,0.95));border:1px solid rgba(255,255,255,0.08);border-top:1px dashed rgba(255,255,255,0.15);box-shadow:0 20px 50px rgba(0,0,0,0.9);}
#text-panel.char-mode{background:rgba(4,4,6,0.92);border:none;border-top:1px solid rgba(212,175,55,0.18);box-shadow:0 20px 50px rgba(0,0,0,0.9);border-radius:0;}
#text-panel::after{content:'\\2727';position:absolute;bottom:12px;right:16px;color:var(--gold-dark);font-size:1.1rem;font-family:var(--font-classic);}
#speaker-name{position:absolute;top:-18px;left:26px;background:var(--vn-name-bg,#050505);border:1px solid var(--gold);color:var(--name-color);font-family:var(--font-classic);font-size:1rem;padding:5px 22px;display:inline-block;letter-spacing:2px;z-index:12;box-shadow:0 5px 15px rgba(0,0,0,0.8);border-radius:2px;}
.nar-mode #speaker-name{opacity:0;}
#vn-panel-controls{position:absolute;top:-16px;right:15px;display:flex;gap:8px;z-index:12;}
.vn-panel-btn{background:#0a0a0c;border:1px solid rgba(255,255,255,0.2);color:#aaa;padding:0 13px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:0.7rem;font-family:var(--font-sans);border-radius:4px;letter-spacing:1px;}
.vn-panel-btn.active{background:rgba(212,175,55,0.1);color:var(--gold);border-color:var(--gold);}
#dialogue-text{font-family:var(--font-classic);font-size:1.05rem;line-height:1.75;letter-spacing:1px;color:var(--text-color);font-weight:300;}
.nar-mode #dialogue-text{font-style:normal;color:#b8b4ac;letter-spacing:1.5px;}
.char-mode #dialogue-text{color:#e8e2d8;font-style:normal;}
.inner-mode #dialogue-text{color:var(--em-color);font-style:italic;letter-spacing:1px;}
#dialogue-text em{font-style:italic;color:var(--em-color);}
#dialogue-text strong{font-weight:bold;color:#fff;}
/* 📱 手機尺寸(預覽 phone vp = 390px 寬)：頂部鈕改直排靠右，對齊真實 VN css/vn_styles.css 的 @media(max-width:480px) 版型；中間/全屏(≥600px)不受影響、維持橫排 */
@media(max-width:480px){
#btn-home{top:10px;right:8px;padding:6px 12px;font-size:0.78rem;min-width:56px;box-sizing:border-box;text-align:center;}
#btn-settings{top:48px;right:8px;padding:6px 12px;font-size:0.78rem;min-width:56px;box-sizing:border-box;text-align:center;}
#btn-phone{top:86px;right:8px;padding:6px 10px;font-size:0.78rem;min-width:56px;box-sizing:border-box;text-align:center;}
}
`;
    let _vthMode = 'char-mode';

    function _vthBuildSrcdoc(css, mode, thumb) {
        const m = mode || _vthMode;
        const layout = thumb ? 'body{justify-content:flex-start;padding:14px 14px 6px;}#btn-home,#btn-settings,#btn-phone,#vn-panel-controls,#top-badge{display:none;}' : '';
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${VTH_PREVIEW_BASE}\n${layout}\n/* ====== 主題 CSS ====== */\n${css || ''}</style></head><body>
<div id="game-bg"></div>
<div id="top-badge">黃昏 南城舊巷</div>
<button id="btn-home">⌂ 返回</button>
<button id="btn-settings">設定</button>
<button id="btn-phone">📱</button>
<div id="text-panel-wrapper">
<div id="vn-panel-controls"><div class="vn-panel-btn">SKIP</div><div class="vn-panel-btn">LOG</div><div class="vn-panel-btn">AUTO</div></div>
<div id="text-panel" class="${m}">
<div id="speaker-name">角色</div>
<div id="dialogue-text">範例對白，用來預覽主題的字體、顏色與框線。<em>斜體強調</em>與<strong>粗體重點</strong>也會跟著套用。</div>
</div>
</div>
</body></html>`;
    }

    function _vthGalleryLoad() { try { return JSON.parse(localStorage.getItem('vn_theme_gallery') || '[]'); } catch (e) { return []; } }
    function _vthGallerySave(arr) { try { localStorage.setItem('vn_theme_gallery', JSON.stringify(arr || [])); } catch (e) {} }

    // ══════════════════════════════════════════════════════════════
    // 🌍 世界書 tab：建/複製/編輯酒館 lorebook，跟副模型聊規則→AI 改/加條目，套用前 diff 預覽。
    //   複製模式做成 [VN副本]-名、只動副本→原檔不碰(二改別人卡安全)。走酒館助手 lorebook API。
    //   UI＝5 換頁(選書→瀏覽條目→條目詳情→AI討論→確認改動)，任何時刻只顯示一頁；吃創作室 --jrpg-* 暖色變數。
    //   spec: docs/superpowers/specs/2026-06-22-studio-worldbook-redesign-design.md（前身 2026-06-21-studio-worldbook-tab）
    // ══════════════════════════════════════════════════════════════
    let _wbWorking = null;   // 工作世界書名(null=在選擇層)
    let _wbView = 'picker';  // picker|entries|detail|chat|confirm（5 換頁，任何時刻只顯示一頁）
    let _wbChat = [];        // [{role,content}]
    let _wbEntries = [];     // 目前條目快取
    let _wbPending = null;   // 待套用 ops（跨輪累積的 diff；每輪 AI 只吐新改動、程式自己 merge）
    let _wbTempUid = -1;     // 待新增條目的臨時 uid（負數，跟酒館真 uid≥0 不撞）→ 讓「還沒寫入的新條目」也能被再次改/刪
    let _wbEntryEditing = null; // 條目詳情頁：null=新增，否則=正在編的 uid
    let _wbSearch = '';      // 條目搜尋字
    let _wbFilter = 'all';   // all|on|off 篩選
    let _wbConfirmIdx = null; // 確認頁第二層：null=改動總覽，數字=看第 N 項完整內容
    let _wbModel = localStorage.getItem('swb_model') === 'sec' ? 'sec' : 'main';   // 世界書二改用主/副模型（預設主：低頻重品質）
    const _wbTH = () => (window.parent || window).TavernHelper || window.TavernHelper;
    const _WB_SYS = `你是世界書編輯助手。下面會給你目前世界書的條目清單，使用者跟你討論要怎麼改或新增條目（可能含成人/NSFW 規則設定，照常專業協助、不要拒絕、不要說教）。\n- 改/新增務必跟下面給的現有條目一致、尤其標【常駐基石】的不可矛盾，不要虛構出跟作者既定設定衝突的內容；資訊不足寧可先問使用者、別硬編。\n- 先用一兩句白話回覆討論。\n- 要實際改動世界書時，把每個改動用 <wb> 區塊輸出（沒要改的條目一律別碰、別重列）：\n  新增：<wb op="add"><comment>標題</comment><keys>關鍵字1,關鍵字2</keys><content>條目內容</content></wb>\n  修改：<wb op="update" uid="條目編號"><comment>…</comment><keys>…</keys><content>…</content></wb>（只放要改的欄位，沒放的保留原值）\n  刪除：<wb op="del" uid="條目編號"/>\n- ★【新增 vs 修改 — 最重要，常出錯】使用者要「新增／另外／再寫一個／分開／獨立成一條」新設定 → 一律用 op="add" 開「全新條目」；【絕對禁止】把新設定塞進、或拿去覆蓋任何現有條目。只有使用者「明確指名要改某一條既有條目」(例如說『把第N條／某標題那條』的內容改成…) 時才用 op="update" 並帶『那條』的 uid。判斷不確定一律 add，寧可多開一條，也不要蓋掉舊的。一次想加好幾條就輸出好幾個 op="add" 區塊。\n- keys 用逗號分隔；常駐條目可留空 keys。只輸出 <wb> 區塊與你的對話，不要解釋格式本身。`;

    // ── 換頁路由：依 _wbView 分派到 5 頁，返回鈕各自硬接上一層 ──
    function renderWorldbookPanel() {
        const host = document.getElementById('studio-worldbook-content');
        if (!host) return;
        if (host.classList) host.classList.add('swb-host');
        if (!_wbWorking && _wbView !== 'picker') _wbView = 'picker';   // 沒選書卻殘留子頁(切走又回來)→退回選書頁
        if (_wbView === 'entries') return _wbRenderEntries(host);
        if (_wbView === 'detail')  return _wbRenderDetail(host);
        if (_wbView === 'chat')    return _wbRenderChat(host);
        if (_wbView === 'confirm') return _wbRenderConfirm(host);
        return _wbRenderPicker(host);
    }
    function _wbEnter(name) {   // 進入某本書 → 條目瀏覽頁
        _wbWorking = name; _wbChat = []; _wbPending = null; _wbTempUid = -1; _wbEntries = [];
        _wbSearch = ''; _wbFilter = 'all'; _wbView = 'entries';
        renderWorldbookPanel();
    }
    function _wbToast(msg) { try { const w = (window.parent || window); w.toastr && w.toastr.success(msg); } catch (e) {} }
    // 通用底部動作面板（取代「一張卡塞滿按鈕」；三點選單／副本-or-直接 都走這個）
    function _wbSheet(title, actions) {
        const host = document.getElementById('studio-worldbook-content');
        if (!host) return;
        const ov = document.createElement('div');
        ov.className = 'swb-sheet-ov';
        ov.innerHTML = `<div class="swb-sheet"><div class="swb-sheet-title">${_sgcEsc(title)}</div>`
            + actions.map((a, i) => `<button class="swb-sheet-btn ${a.cls || ''}" data-i="${i}">${a.label}</button>`).join('')
            + `<button class="swb-sheet-btn cancel" data-cancel>取消</button></div>`;
        host.appendChild(ov);
        const close = () => ov.remove();
        ov.addEventListener('click', (e) => { if (e.target === ov || e.target.hasAttribute('data-cancel')) close(); });
        ov.querySelectorAll('[data-i]').forEach(btn => btn.onclick = () => { close(); const a = actions[parseInt(btn.getAttribute('data-i'), 10)]; a && a.onClick && a.onClick(); });
    }
    function _wbBookMenu(name) {   // 點書卡＝唯一路口，統一選單（複製/編輯/刪除）
        const isCopy = String(name).startsWith('[VN副本]');
        const acts = [];
        if (!isCopy) acts.push({ label: '<i class="fa-solid fa-copy"></i> 建立安全副本後編輯', cls: 'safe', onClick: () => _wbCopyBook(name) });
        acts.push({ label: isCopy ? '<i class="fa-solid fa-pen"></i> 編輯這份副本' : '<i class="fa-solid fa-pen"></i> 直接改原檔', cls: isCopy ? '' : 'danger', onClick: () => { if (isCopy || confirm(`⚠️ 直接改原檔「${name}」？確定？`)) _wbEnter(name); } });
        acts.push({ label: '<i class="fa-solid fa-trash"></i> 刪除世界書', cls: 'danger', onClick: () => _wbDeleteBook(name) });
        _wbSheet(`「${name}」`, acts);
    }
    async function _wbDeleteBook(name) {
        if (!confirm(`⚠️ 刪除世界書「${name}」？此動作無法復原。`)) return;
        const TH = _wbTH();
        if (!TH || !TH.deleteLorebook) { alert('酒館助手未就緒'); return; }
        try { await TH.deleteLorebook(name); _wbToast('已刪除「' + name + '」'); renderWorldbookPanel(); }
        catch (e) { alert('刪除失敗：' + (e && e.message || e)); }
    }
    // ① 選世界書（乾淨瀏覽：書名＋條目數＋›＋⋮）
    async function _wbRenderPicker(host) {
        const TH = _wbTH();
        let books = [];
        try { books = (TH && TH.getLorebooks && TH.getLorebooks()) || []; } catch (e) {}
        host.innerHTML = `<div class="swb-page">
            <div class="swb-phead"><div class="swb-ptitle">整理世界書</div><div class="swb-psub">挑一本世界書，AI 幫你改規則、加條目。二改別人的卡建議用「複製」，原檔不會被動到。</div></div>
            <button class="swb-primary swb-block" id="swb-new-toggle"><i class="fa-solid fa-plus"></i> 新增世界書</button>
            <div class="swb-newrow" id="swb-newrow" hidden><input id="swb-new-name" class="swb-field" placeholder="新世界書名稱…"><button class="swb-primary swb-sm" id="swb-new-go">建立</button></div>
            <div class="swb-list" id="swb-list"></div>
        </div>`;
        const toggle = host.querySelector('#swb-new-toggle');
        const newrow = host.querySelector('#swb-newrow');
        toggle.onclick = () => { newrow.hidden = !newrow.hidden; if (!newrow.hidden) { const i = host.querySelector('#swb-new-name'); i && i.focus(); } };
        host.querySelector('#swb-new-go').onclick = () => _wbCreateNew(host.querySelector('#swb-new-name').value);
        const listEl = host.querySelector('#swb-list');
        if (!books.length) { listEl.innerHTML = `<div class="swb-empty"><div class="swb-empty-art"><i class="fa-solid fa-globe"></i></div><div>酒館裡還沒有世界書<br>按上面「新增世界書」開一本吧</div></div>`; return; }
        const _isCopy = (b) => String(b).startsWith('[VN副本]');
        const _bookCard = (b, i) => `<div class="swb-card swb-bookcard${_isCopy(b) ? ' swb-copycard' : ''}" data-book="${_sgcEsc(b)}">
            <div class="swb-card-main"><div class="swb-card-title">${_sgcEsc(b)}</div><div class="swb-card-meta" data-cnt="${i}">… 條目</div></div>
            <span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span>
        </div>`;
        const _copies = [], _origs = [];
        books.forEach((b, i) => (_isCopy(b) ? _copies : _origs).push(_bookCard(b, i)));   // 副本(我複製的)跟酒館原檔分區，免選錯
        listEl.innerHTML = (_copies.length
            ? '<div class="swb-seclabel"><i class="fa-solid fa-copy"></i> 我的副本（改這些，原檔不動）</div>' + _copies.join('')
              + '<div class="swb-seclabel swb-seclabel-div"><i class="fa-solid fa-landmark"></i> 酒館世界書</div>'
            : '') + _origs.join('');
        listEl.querySelectorAll('.swb-bookcard').forEach(card => card.onclick = () => _wbBookMenu(card.getAttribute('data-book')));
        books.forEach(async (b, i) => {   // 條目數逐本補（getLorebooks 不給數量）
            let txt = '—';
            try { txt = ((await TH.getLorebookEntries(b)) || []).length + ' 條目'; } catch (e) {}
            const el = listEl.querySelector(`[data-cnt="${i}"]`); if (el) el.textContent = txt;
        });
    }
    async function _wbCreateNew(name) {
        name = String(name || '').trim();
        if (!name) { alert('先輸入世界書名稱'); return; }
        const TH = _wbTH();
        if (!TH || !TH.createLorebook) { alert('酒館助手未就緒'); return; }
        try {
            const ok = await TH.createLorebook(name);
            if (ok === false) { if (!confirm(`「${name}」可能已存在，要直接打開它編輯嗎？`)) return; }
            _wbEnter(name);
        } catch (e) { alert('建立失敗：' + (e && e.message || e)); }
    }
    async function _wbCopyBook(src) {
        const TH = _wbTH();
        if (!TH || !TH.createLorebook) { alert('酒館助手未就緒'); return; }
        const copyName = `[VN副本]-${src}`;
        try {
            const created = await TH.createLorebook(copyName);
            if (created !== false) {
                const entries = (await TH.getLorebookEntries(src)) || [];
                if (entries.length) {
                    const clones = entries.map(e => { const c = { ...e }; delete c.uid; delete c.display_index; return c; });
                    await TH.createLorebookEntries(copyName, clones);
                }
                alert(`✅ 已複製成「${copyName}」（${entries.length} 條），改它不會動到原檔。`);
            } else {
                if (!confirm(`「${copyName}」已存在，直接打開上次那份副本繼續編輯嗎？`)) return;
            }
            _wbEnter(copyName);
        } catch (e) { alert('複製失敗：' + (e && e.message || e)); }
    }
    // ② 瀏覽條目（搜尋＋篩選＋條目卡；底部 AI整理／新增條目）
    async function _wbRenderEntries(host) {
        const TH = _wbTH();
        try { _wbEntries = (await TH.getLorebookEntries(_wbWorking)) || []; } catch (e) { _wbEntries = []; }
        const isCopy = String(_wbWorking).startsWith('[VN副本]');
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar">
                <button class="swb-iconbtn" id="swb-back"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title" title="${_sgcEsc(_wbWorking)}">${_sgcEsc(_wbWorking)}</div>
                ${isCopy ? '<span class="swb-chip safe">副本·原檔安全</span>' : '<span class="swb-chip warn">直接改原檔</span>'}
            </div>
            <div class="swb-tools">
                <input id="swb-search" class="swb-field" placeholder="搜尋條目…" value="${_sgcEsc(_wbSearch)}">
                <div class="swb-seg" id="swb-filter">
                    <button class="swb-seg-btn${_wbFilter === 'all' ? ' on' : ''}" data-f="all">全部</button>
                    <button class="swb-seg-btn${_wbFilter === 'on' ? ' on' : ''}" data-f="on">已啟用</button>
                    <button class="swb-seg-btn${_wbFilter === 'off' ? ' on' : ''}" data-f="off">已停用</button>
                </div>
            </div>
            <div class="swb-list" id="swb-entry-list"></div>
            <div class="swb-footbar">
                <button class="swb-primary" id="swb-ai"><i class="fa-solid fa-robot"></i> 請 AI 幫我整理</button>
                <button class="swb-secondary" id="swb-add"><i class="fa-solid fa-plus"></i> 新增條目</button>
            </div>
        </div>`;
        host.querySelector('#swb-back').onclick = () => { _wbWorking = null; _wbView = 'picker'; renderWorldbookPanel(); };
        host.querySelector('#swb-ai').onclick = () => { _wbView = 'chat'; renderWorldbookPanel(); };
        host.querySelector('#swb-add').onclick = () => { _wbEntryEditing = null; _wbView = 'detail'; renderWorldbookPanel(); };
        const search = host.querySelector('#swb-search');
        search.oninput = () => { _wbSearch = search.value; _wbPaintEntryList(host); };
        host.querySelectorAll('#swb-filter .swb-seg-btn').forEach(b => b.onclick = () => {
            _wbFilter = b.getAttribute('data-f');
            host.querySelectorAll('#swb-filter .swb-seg-btn').forEach(x => x.classList.toggle('on', x.getAttribute('data-f') === _wbFilter));
            _wbPaintEntryList(host);
        });
        _wbPaintEntryList(host);
    }
    function _wbPaintEntryList(host) {
        const el = host.querySelector('#swb-entry-list'); if (!el) return;
        if (!_wbEntries.length) { el.innerHTML = `<div class="swb-empty"><div class="swb-empty-art"><i class="fa-solid fa-book"></i></div><div>這本世界書還沒有條目<br>用下面「新增條目」或「請 AI 幫我整理」開始</div></div>`; return; }
        const q = _wbSearch.trim().toLowerCase();
        const list = _wbEntries.filter(e => {
            if (_wbFilter === 'on' && !e.enabled) return false;
            if (_wbFilter === 'off' && e.enabled) return false;
            if (q) { const hay = (String(e.comment || '') + ' ' + (e.keys || []).join(' ') + ' ' + String(e.content || '')).toLowerCase(); if (!hay.includes(q)) return false; }
            return true;
        });
        if (!list.length) { el.innerHTML = '<div class="swb-empty">沒有符合的條目</div>'; return; }
        el.innerHTML = list.map(e => {
            const keys = (e.keys || []).filter(Boolean);
            const tags = keys.length ? keys.map(k => `<span class="swb-tag">${_sgcEsc(k)}</span>`).join('') : '<span class="swb-tag muted">常駐</span>';
            const sum = _sgcEsc(String(e.content || '').replace(/\s+/g, ' ').trim().slice(0, 80)) || '（無內容）';
            return `<div class="swb-card swb-entrycard" data-uid="${e.uid}">
                <div class="swb-card-main">
                    <div class="swb-card-title">${_sgcEsc(e.comment || '(無標題)')}</div>
                    <div class="swb-card-sum">${sum}</div>
                    <div class="swb-tags">${tags}</div>
                </div>
                <label class="sgc-switch swb-card-tog" title="啟用／停用"><input type="checkbox" class="sgc-switch-input" data-en="${e.uid}"${e.enabled ? ' checked' : ''}><span class="sgc-switch-slider"></span></label>
                <span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span>
            </div>`;
        }).join('');
        el.querySelectorAll('.swb-entrycard').forEach(card => card.onclick = (ev) => {
            if (ev.target.closest('.swb-card-tog')) return;
            _wbEntryEditing = parseInt(card.getAttribute('data-uid'), 10); _wbView = 'detail'; renderWorldbookPanel();
        });
        el.querySelectorAll('[data-en]').forEach(cb => cb.onchange = async (ev) => {
            ev.stopPropagation();
            const uid = parseInt(cb.getAttribute('data-en'), 10);
            try { await _wbTH().setLorebookEntries(_wbWorking, [{ uid, enabled: cb.checked }]); const e = _wbEntries.find(x => x.uid === uid); if (e) e.enabled = cb.checked; }
            catch (err) { alert('改啟用失敗：' + (err && err.message || err)); cb.checked = !cb.checked; }
        });
    }
    // ③ 條目詳情／編輯（手動完整編輯；新增也走這頁）
    function _wbRenderDetail(host) {
        const isNew = _wbEntryEditing == null;
        const e = isNew ? { comment: '', keys: [], content: '', enabled: true }
                        : (_wbEntries.find(x => x.uid === _wbEntryEditing) || { comment: '', keys: [], content: '', enabled: true });
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar">
                <button class="swb-iconbtn" id="swb-back"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title">${isNew ? '新增條目' : '編輯條目'}</div>
            </div>
            <div class="swb-form">
                <label class="swb-flabel">標題</label>
                <input id="swb-f-title" class="swb-field" value="${_sgcEsc(e.comment || '')}" placeholder="這條規則叫什麼…">
                <label class="swb-flabel">關鍵字</label>
                <input id="swb-f-keys" class="swb-field" value="${_sgcEsc((e.keys || []).join('、'))}" placeholder="用、分隔；留空＝一直生效">
                <div class="swb-fhint">提到這些字時 AI 才會讀這條；留空＝常駐、永遠生效。</div>
                <label class="swb-flabel">內容</label>
                <textarea id="swb-f-content" class="swb-field swb-ftext" placeholder="這條世界書要寫的設定／規則…">${_sgcEsc(e.content || '')}</textarea>
                <label class="swb-frow"><span>啟用這條</span><span class="sgc-switch"><input type="checkbox" id="swb-f-en" class="sgc-switch-input"${e.enabled ? ' checked' : ''}><span class="sgc-switch-slider"></span></span></label>
                ${isNew ? '' : '<button class="swb-textdanger" id="swb-del"><i class="fa-solid fa-trash"></i> 刪除這條</button>'}
            </div>
            <div class="swb-footbar">
                <button class="swb-primary swb-block" id="swb-save">${isNew ? '建立條目' : '儲存'}</button>
            </div>
        </div>`;
        host.querySelector('#swb-back').onclick = () => { _wbView = 'entries'; renderWorldbookPanel(); };
        host.querySelector('#swb-save').onclick = () => _wbSaveDetail(host, isNew);
        const del = host.querySelector('#swb-del'); if (del) del.onclick = () => _wbDeleteEntry();
    }
    async function _wbSaveDetail(host, isNew) {
        const TH = _wbTH();
        if (!TH) { alert('酒館助手未就緒'); return; }
        const comment = host.querySelector('#swb-f-title').value.trim();
        const keys = host.querySelector('#swb-f-keys').value.split(/[,，、\n]/).map(s => s.trim()).filter(Boolean);
        const content = host.querySelector('#swb-f-content').value;
        const enabled = host.querySelector('#swb-f-en').checked;
        const type = keys.length ? 'selective' : 'constant';   // 有關鍵字＝綠燈觸發、留空＝藍燈常駐(讓「留空＝一直生效」成真，免手動切換)
        const btn = host.querySelector('#swb-save'); if (btn) { btn.disabled = true; btn.textContent = '儲存中…'; }
        try {
            if (isNew) await TH.createLorebookEntries(_wbWorking, [{ comment, keys, content, enabled, type }]);
            else await TH.setLorebookEntries(_wbWorking, [{ uid: _wbEntryEditing, comment, keys, content, enabled, type }]);
            _wbToast(isNew ? '已新增條目 ✓' : '已儲存 ✓');
            _wbView = 'entries'; renderWorldbookPanel();
        } catch (e) { if (btn) { btn.disabled = false; btn.textContent = isNew ? '建立條目' : '儲存'; } alert('儲存失敗：' + (e && e.message || e)); }
    }
    async function _wbDeleteEntry() {
        if (_wbEntryEditing == null) return;
        const e = _wbEntries.find(x => x.uid === _wbEntryEditing);
        if (!confirm(`刪除條目「${e ? (e.comment || '(無標題)') : ''}」？`)) return;
        try { await _wbTH().deleteLorebookEntries(_wbWorking, [_wbEntryEditing]); _wbToast('已刪除條目'); _wbView = 'entries'; renderWorldbookPanel(); }
        catch (err) { alert('刪除失敗：' + (err && err.message || err)); }
    }
    // ④ 和 AI 討論（只剩對話＋輸入；模型切換收進右上⚙️；有建議冒「查看 N 項」）
    function _wbRenderChat(host) {
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar">
                <button class="swb-iconbtn" id="swb-back"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title" title="${_sgcEsc(_wbWorking)}">${_sgcEsc(_wbWorking)}<span class="swb-bar-sub">${_wbEntries.length} 條目</span></div>
                <button class="swb-iconbtn" id="swb-adv" title="進階設定"><i class="fa-solid fa-gear"></i></button>
            </div>
            <div class="swb-chatlog" id="swb-chatlog"></div>
            <div class="swb-pendbar" id="swb-pendbar"></div>
            <div class="swb-inputrow">
                <textarea id="swb-msg" class="swb-field swb-msg" placeholder="跟 AI 說要怎麼改／加哪些條目（例：加一條關於○○規則的條目；把某條改得更詳細）…"></textarea>
                <button class="swb-primary swb-send" id="swb-send">送出</button>
            </div>
        </div>`;
        host.querySelector('#swb-back').onclick = () => { _wbView = 'entries'; renderWorldbookPanel(); };
        host.querySelector('#swb-adv').onclick = () => _wbAdvSheet();
        host.querySelector('#swb-send').onclick = () => _wbSend(host);
        _wbPaintChat(host); _wbPaintPendBar(host);
    }
    // 泡泡只顯示白話：把給程式解析的 <wb> 機器標記濾掉（原文留在 _wbChat 當 AI 上下文，結構化內容只在確認頁顯示）
    function _wbStripOps(text) {
        return String(text || '')
            .replace(/<wb\b[^>]*\/>/gi, '')              // 自閉合(刪除)
            .replace(/<wb\b[^>]*>[\s\S]*?<\/wb>/gi, '')  // 區塊
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
    function _wbPaintChat(host) {
        const el = host.querySelector('#swb-chatlog'); if (!el) return;
        if (!_wbChat.length) { el.innerHTML = `<div class="swb-empty"><div class="swb-empty-art"><i class="fa-solid fa-comment-dots"></i></div><div>跟 AI 說你想怎麼整理這本世界書<br>它幫你改／加條目，你確認後才寫入</div></div>`; return; }
        el.innerHTML = _wbChat.map(m => {
            let body = m.content;
            if (m.role === 'assistant') { body = _wbStripOps(m.content); if (!body) body = '✏️ 我擬好了改動，點下方「查看建議」確認。'; }
            return `<div class="swb-bubble swb-${m.role}">${_sgcEsc(body)}</div>`;
        }).join('');
        el.scrollTop = el.scrollHeight;
    }
    function _wbPaintPendBar(host) {
        const el = host.querySelector('#swb-pendbar'); if (!el) return;
        if (!_wbPending || !_wbPending.length) { el.innerHTML = ''; return; }
        el.innerHTML = `<button class="swb-pendbtn" id="swb-viewpend">查看 ${_wbPending.length} 項建議 <i class="fa-solid fa-chevron-right"></i></button>`;
        const b = host.querySelector('#swb-viewpend'); if (b) b.onclick = () => { _wbConfirmIdx = null; _wbView = 'confirm'; renderWorldbookPanel(); };
    }
    function _wbAdvSheet() {
        _wbSheet('進階設定 · AI 用哪個模型寫', [
            { label: '主模型寫（品質好，預設）' + (_wbModel === 'main' ? ' <i class="fa-solid fa-check"></i>' : ''), cls: _wbModel === 'main' ? 'safe' : '', onClick: () => { _wbModel = 'main'; localStorage.setItem('swb_model', 'main'); } },
            { label: '副模型寫（快、省）' + (_wbModel === 'sec' ? ' <i class="fa-solid fa-check"></i>' : ''), cls: _wbModel === 'sec' ? 'safe' : '', onClick: () => { _wbModel = 'sec'; localStorage.setItem('swb_model', 'sec'); } },
        ]);
    }
    function _wbEntriesForPrompt() {
        // 停用(🔴)的不送(用戶關掉就別餵)；藍燈綠燈全送、內容不截斷——AI 看得到作者完整設定才不會亂編造跟基石矛盾。
        return _wbEntries
            .filter(e => e.enabled !== false)
            .map(e => {
                const tag = e.type === 'constant' ? '常駐基石·務必遵守不可矛盾' : (e.type === 'vectorized' ? '向量' : '關鍵字觸發');
                return `#${e.uid}｜[${tag}]｜標題：${e.comment || '(無)'}｜關鍵字：${(e.keys || []).join(',') || '（無）'}｜內容：${String(e.content || '')}`;
            }).join('\n\n');
    }
    // 把目前「尚未套用的待改動」(_wbPending) 序列化餵回 AI，讓它整套保留重輸出，避免下一輪只回新 op→把上一輪的刪除/新增覆蓋掉
    function _wbPendingForPrompt() {
        if (!_wbPending || !_wbPending.length) return '';
        return _wbPending.map(o => {
            if (o.op === 'del') return '【刪除真條目】uid=' + o.uid;
            const head = o.op === 'add' ? ('【新增·待寫入】uid=' + o.uid + '(負數=尚未寫入)') : ('【修改真條目】uid=' + o.uid);
            const parts = [];
            if (o.comment != null) parts.push('標題：' + o.comment);
            if (o.keys && o.keys.length) parts.push('關鍵字：' + o.keys.join(','));
            if (o.content != null) parts.push('內容：' + o.content);
            return head + (parts.length ? ' ' + parts.join('｜') : '');
        }).join('\n');
    }
    async function _wbSend(host) {
        const ta = host.querySelector('#swb-msg'); const msg = (ta.value || '').trim();
        if (!msg) return;
        const api = (window.parent || window).OS_API || window.OS_API;
        if (!api || (typeof api.chatSecondary !== 'function' && typeof api.chatMain !== 'function')) { alert('AI 不可用，請先到「寫作 → API 設置」設好模型'); return; }
        _wbChat.push({ role: 'user', content: msg }); ta.value = '';
        _wbPaintChat(host);
        const sendBtn = host.querySelector('#swb-send'); if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '生成中…'; }
        let _wbSysFull = _WB_SYS + '\n\n【目前條目】\n' + (_wbEntriesForPrompt() || '（空，還沒有條目）');
        const _pend = _wbPendingForPrompt();
        if (_pend) _wbSysFull += '\n\n【尚未套用的待改動（系統已自動累積保留，你「不用」也「不要」重複輸出這些）】\n' + _pend + '\n→ 你這輪「只輸出這次使用者要動的那一項 <wb>」即可（真 diff），系統會自動把它併進上面的待改動、沒提到的一個都不會弄丟、也絕不碰沒提到的條目。要「改某項待改動本身」就用它的 uid 下 op="update"／要撤銷就 op="del"（待新增條目的 uid 是負數，照樣能改/刪）。';
        const messages = [{ role: 'system', content: _wbSysFull }].concat(_wbChat.slice(-8));
        const done = (full) => {
            if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '送出'; }
            const reply = String(full || '');
            _wbChat.push({ role: 'assistant', content: reply });
            // 真 diff：AI 只吐這輪的改動 → merge 進已累積的待改動（不替換、不丟、沒提到的不碰）
            _wbPending = _wbMergeOps(_wbPending, _wbParseOps(reply));
            if (!_wbPending || !_wbPending.length) _wbPending = null;
            _wbPaintChat(host); _wbPaintPendBar(host);
        };
        const errCb = (err) => { if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '送出'; } alert('AI 失敗：' + (err && err.message || err)); };
        // 主模型＝chatMain（品質好、世界書二改首選）；副模型＝chatSecondary。選的入口若不存在則退另一個。
        const useMain = _wbModel === 'main' && typeof api.chatMain === 'function';
        const callFn = useMain ? api.chatMain : (typeof api.chatSecondary === 'function' ? api.chatSecondary : api.chatMain);
        try { callFn.call(api, messages, () => {}, done, errCb); }
        catch (e) { errCb(e); }
    }
    function _wbParseOps(text) {
        const ops = []; const re = /<wb\s+op="(add|update|del)"(?:\s+uid="(-?\d+)")?\s*(?:\/>|>([\s\S]*?)<\/wb>)/gi; let m;   // uid 容許負數＝待新增條目的臨時 uid
        while ((m = re.exec(text)) !== null) {
            const op = m[1].toLowerCase(); const uid = m[2] ? parseInt(m[2], 10) : null; const inner = m[3] || '';
            if (op === 'del') { if (uid != null) ops.push({ op: 'del', uid }); continue; }
            const pick = (tag) => { const mm = inner.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>', 'i')); return mm ? mm[1].trim() : null; };
            const keysRaw = pick('keys');
            ops.push({ op, uid, comment: pick('comment'), keys: keysRaw != null ? keysRaw.split(/[,，、]/).map(s => s.trim()).filter(Boolean) : null, content: pick('content') });
        }
        return ops;
    }
    // 真 diff 累積：把 AI 這輪吐的 ops 併進「已累積的待改動」。沒提到的待改動原封不動、絕不碰沒提到的條目。
    //   - add：給臨時負 uid，登記為待新增（之後可被 update/del 用該 uid 再動）。
    //   - update uid=X：X 命中既有待新增/待修改 → 把欄位併進它（改的是「待改動」本身）；否則登記為對真條目 X 的待修改。
    //   - del uid=X：X 命中待新增 → 直接撤掉那筆待新增；命中待修改 → 取消修改；否則登記為對真條目 X 的待刪除。
    function _wbMergeOps(existing, incoming) {
        const out = (existing || []).slice();
        const idx = (uid) => out.findIndex(x => x.uid === uid);
        for (const op of (incoming || [])) {
            if (op.op === 'add') {
                // 防呆：AI 若沒用 uid、又重吐同標題的待新增 → 當「改那筆」而非開重複
                const j = out.findIndex(x => x.op === 'add' && x.comment && op.comment && x.comment === op.comment);
                if (j >= 0) { if (op.keys != null) out[j].keys = op.keys; if (op.content != null) out[j].content = op.content; }
                else out.push({ op: 'add', uid: _wbTempUid--, comment: op.comment, keys: op.keys, content: op.content });
            } else if (op.op === 'del') {
                if (op.uid == null) continue;
                const i = idx(op.uid);
                if (i >= 0 && out[i].op === 'add') { out.splice(i, 1); continue; }        // 撤銷一筆還沒寫入的待新增
                if (i >= 0 && out[i].op === 'update') out.splice(i, 1);                    // 取消對該真條目的待修改
                if (!out.some(x => x.op === 'del' && x.uid === op.uid)) out.push({ op: 'del', uid: op.uid });
            } else if (op.op === 'update') {
                if (op.uid == null) continue;
                const i = idx(op.uid);
                if (i >= 0 && (out[i].op === 'add' || out[i].op === 'update')) {
                    if (op.comment != null) out[i].comment = op.comment;
                    if (op.keys != null) out[i].keys = op.keys;
                    if (op.content != null) out[i].content = op.content;
                } else {
                    out.push({ op: 'update', uid: op.uid, comment: op.comment, keys: op.keys, content: op.content });
                }
            }
        }
        return out;
    }
    // ⑤ 確認改動（兩層：總覽列每項摘要 → 點一項看完整內容；確認才寫。手機尺寸下長內容用換頁、不摺疊也不一地倒）
    const _wbOpClass = (op) => op === 'add' ? 'add' : op === 'del' ? 'del' : 'upd';
    const _wbOpLabel = (op) => op === 'add' ? '新增' : op === 'del' ? '刪除' : '修改';
    function _wbRenderConfirm(host) {
        const ops = _wbPending || [];
        if (_wbConfirmIdx != null && ops[_wbConfirmIdx]) return _wbRenderConfirmDetail(host, ops[_wbConfirmIdx]);
        _wbConfirmIdx = null;
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar">
                <button class="swb-iconbtn" id="swb-back"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title">確認改動<span class="swb-bar-sub">${ops.length} 項</span></div>
            </div>
            <div class="swb-list" id="swb-conflist"></div>
            <div class="swb-footbar">
                <button class="swb-secondary" id="swb-backedit"><i class="fa-solid fa-chevron-left"></i> 返回修改</button>
                <button class="swb-primary" id="swb-apply"><i class="fa-solid fa-check"></i> 套用 ${ops.length} 項</button>
            </div>
        </div>`;
        const listEl = host.querySelector('#swb-conflist');
        listEl.innerHTML = ops.map((o, i) => {
            const e = _wbEntries.find(x => x.uid === o.uid);
            const title = _sgcEsc((o.comment != null ? o.comment : (e && e.comment)) || '(無標題)');
            const src = o.op === 'del' ? (e ? e.content : '') : o.content;
            const preview = (src != null && src !== '') ? `<div class="swb-card-sum">${_sgcEsc(String(src).replace(/\s+/g, ' ').trim().slice(0, 70))}</div>` : '';
            return `<div class="swb-card swb-op ${_wbOpClass(o.op)}" data-i="${i}">
                <span class="swb-op-chip c-${_wbOpClass(o.op)}">${_wbOpLabel(o.op)}</span>
                <div class="swb-card-main"><div class="swb-card-title">${title}</div>${preview}</div>
                <span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span>
            </div>`;
        }).join('');
        listEl.querySelectorAll('[data-i]').forEach(card => card.onclick = () => { _wbConfirmIdx = parseInt(card.getAttribute('data-i'), 10); renderWorldbookPanel(); });
        host.querySelector('#swb-back').onclick = () => { _wbView = 'chat'; renderWorldbookPanel(); };
        host.querySelector('#swb-backedit').onclick = () => { _wbView = 'chat'; renderWorldbookPanel(); };
        host.querySelector('#swb-apply').onclick = () => _wbApply(host);
    }
    function _wbRenderConfirmDetail(host, o) {
        const e = _wbEntries.find(x => x.uid === o.uid);
        const title = _sgcEsc((o.comment != null ? o.comment : (e && e.comment)) || '(無標題)');
        const keysArr = (o.op === 'del' ? (e && e.keys) : (o.keys != null ? o.keys : (e && e.keys))) || [];
        const keys = keysArr.length ? keysArr.map(k => `<span class="swb-tag">${_sgcEsc(k)}</span>`).join('') : '<span class="swb-tag muted">常駐</span>';
        const content = o.op === 'del' ? (e ? e.content : '') : o.content;
        const note = o.op === 'del' ? '<div class="swb-fhint"><i class="fa-solid fa-triangle-exclamation"></i> 套用後這條會被刪除。下面是它目前的內容：</div>' : '';
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar">
                <button class="swb-iconbtn" id="swb-back"><i class="fa-solid fa-chevron-left"></i></button>
                <span class="swb-op-chip c-${_wbOpClass(o.op)}">${_wbOpLabel(o.op)}</span>
                <div class="swb-bar-title">${title}</div>
            </div>
            <div class="swb-form">
                ${note}
                <label class="swb-flabel">關鍵字</label>
                <div class="swb-tags">${keys}</div>
                <label class="swb-flabel">內容</label>
                <div class="swb-op-body">${(content != null && content !== '') ? _sgcEsc(String(content)) : '（無內容）'}</div>
            </div>
            <div class="swb-footbar">
                <button class="swb-primary swb-block" id="swb-back2"><i class="fa-solid fa-chevron-left"></i> 回改動清單</button>
            </div>
        </div>`;
        host.querySelector('#swb-back').onclick = () => { _wbConfirmIdx = null; renderWorldbookPanel(); };
        host.querySelector('#swb-back2').onclick = () => { _wbConfirmIdx = null; renderWorldbookPanel(); };
    }
    async function _wbApply(host) {
        const TH = _wbTH(); if (!TH || !_wbPending) return;
        const n = _wbPending.length;
        const adds = [], updates = [], dels = [];
        for (const o of _wbPending) {
            // 真 uid≥0 才送酒館；負數＝待新增的臨時 uid（merge 後只會出現在 op='add'，del/update 不該帶負 uid，防呆擋掉）
            if (o.op === 'del') { if (o.uid != null && o.uid >= 0) dels.push(o.uid); }
            else if (o.op === 'add') { const k = o.keys || []; adds.push({ comment: o.comment || '', keys: k, content: o.content || '', enabled: true, type: k.length ? 'selective' : 'constant' }); }
            else if (o.op === 'update' && o.uid != null && o.uid >= 0) { const u = { uid: o.uid }; if (o.comment != null) u.comment = o.comment; if (o.keys != null) u.keys = o.keys; if (o.content != null) u.content = o.content; updates.push(u); }
        }
        const btn = host.querySelector('#swb-apply'); if (btn) { btn.disabled = true; btn.textContent = '套用中…'; }
        try {
            if (adds.length) await TH.createLorebookEntries(_wbWorking, adds);
            if (updates.length) await TH.setLorebookEntries(_wbWorking, updates);
            if (dels.length) await TH.deleteLorebookEntries(_wbWorking, dels);
            _wbPending = null; _wbTempUid = -1;
            try { _wbEntries = (await TH.getLorebookEntries(_wbWorking)) || []; } catch (e) {}
            _wbToast('已套用 ' + n + ' 項 ✓');
            _wbView = 'chat'; renderWorldbookPanel();
        } catch (e) { if (btn) { btn.disabled = false; btn.textContent = '套用 ' + n + ' 項'; } alert('套用失敗：' + (e && e.message || e)); }
    }

    // ====== 🧑 我的角色（人設寫作）：借世界書引擎，存成「我的角色」本、一角色一條（內含分段）======
    const MC_BOOK = '我的角色';
    let _mcView = 'list';        // list | editor
    let _mcPane = 'chat';        // editor 內：chat | preview
    let _mcChars = [];           // 清單快取 [{uid,name,summary,enabled,content}]
    let _mcWorking = null;       // {uid|null, name, blocks:[{label,content,userEdited,aiNew,editing}]}
    let _mcChat = [];            // [{role,content}]
    let _mcPendCount = 0;        // 自上次開預覽以來 AI 動到的區塊數
    let _mcModel = localStorage.getItem('mc_model') === 'sec' ? 'sec' : 'main';
    let _mcImportPick = null;     // 匯入時選中的那個酒館人設

    // 純函式：<seg> 解析 / 區塊組裝成條目內容 / 反解析回區塊（組裝⇄反解析互為逆運算）
    function _mcParseSegs(text) {
        const out = [];
        const re = /<seg\s+label="([^"]*)"\s*>([\s\S]*?)<\/seg>/gi;
        let m;
        while ((m = re.exec(String(text || ''))) !== null) out.push({ label: (m[1] || '').trim(), content: (m[2] || '').trim() });
        return out;
    }
    function _mcAssembleContent(blocks) {
        return (blocks || []).map(b => '【' + b.label + '】\n' + (b.content || '').trim()).join('\n\n');
    }
    function _mcParseEntryContent(content) {
        const out = [];
        const re = /【([^】]+)】\n([\s\S]*?)(?=\n\n【|$)/g;
        let m;
        while ((m = re.exec(String(content || ''))) !== null) out.push({ label: (m[1] || '').trim(), content: (m[2] || '').trim() });
        return out;
    }

    function renderPersonaPanel() {
        const host = document.getElementById('studio-persona-content');
        if (!host) return;
        host.classList.add('swb-host');
        if (!_mcWorking && _mcView !== 'list' && _mcView !== 'import' && _mcView !== 'importopts') _mcView = 'list';
        if (_mcView === 'import') return _mcRenderImport(host);
        if (_mcView === 'importopts') return _mcRenderImportOpts(host);
        if (_mcView === 'editor') return _mcPane === 'preview' ? _mcRenderPreview(host) : _mcRenderEditorChat(host);
        return _mcRenderList(host);
    }

    async function _mcEnsureBook() {
        const TH = _wbTH();
        if (!TH || !TH.getLorebooks) return false;
        let books = [];
        try { books = TH.getLorebooks() || []; } catch (e) {}
        if (!books.includes(MC_BOOK)) { try { await TH.createLorebook(MC_BOOK); } catch (e) {} }
        // 掛全域常駐：讀舊全域清單→沒有我的角色就 append→rebind（rebind 是整個替換，必須帶上舊的）
        try {
            if (TH.getGlobalWorldbookNames && TH.rebindGlobalWorldbooks) {
                const g = TH.getGlobalWorldbookNames() || [];
                if (!g.includes(MC_BOOK)) await TH.rebindGlobalWorldbooks([...g, MC_BOOK]);
            }
        } catch (e) {}
        return true;
    }
    async function _mcLoadChars() {
        const TH = _wbTH();
        _mcChars = [];
        if (!TH || !TH.getLorebookEntries) return;
        let entries = [];
        try { entries = await TH.getLorebookEntries(MC_BOOK) || []; } catch (e) {}
        _mcChars = entries.map(e => ({
            uid: e.uid,
            name: e.comment || '(未命名)',
            summary: String(e.content || '').replace(/^【用戶人設】[^\n]*\n+/, '').replace(/【[^】]*】/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40),
            enabled: e.enabled !== false,
            content: e.content || ''
        }));
    }
    function _mcOpenChar(entry) {
        if (entry) _mcWorking = { uid: entry.uid, name: entry.name, blocks: _mcParseEntryContent(String(entry.content || '').replace(/^【用戶人設】[^\n]*\n+/, '')).map(b => ({ label: b.label, content: b.content, userEdited: false })) };
        else _mcWorking = { uid: null, name: '', blocks: [] };
        _mcChat = []; _mcPendCount = 0; _mcView = 'editor'; _mcPane = 'chat';
        renderPersonaPanel();
    }
    async function _mcRenderList(host) {
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar"><div class="swb-bar-title">我的角色<span class="swb-bar-sub" id="mc-count"></span></div></div>
            <div class="swb-list mc-list" id="mc-list"><div class="swb-psub">載入中…</div></div>
            <div class="swb-footbar"><button class="swb-primary" id="mc-new"><i class="fa-solid fa-plus"></i> 新增角色</button></div>
        </div>`;
        host.querySelector('#mc-new').onclick = () => _mcNewChooser();
        const ok = await _mcEnsureBook();
        const listEl = host.querySelector('#mc-list'); if (!listEl) return;
        if (!ok) { listEl.innerHTML = '<div class="swb-psub">酒館助手未就緒（需在酒館內 + 已裝酒館助手）。</div>'; return; }
        await _mcLoadChars();
        const cnt = host.querySelector('#mc-count'); if (cnt) cnt.textContent = _mcChars.length ? ' ' + _mcChars.length + ' 個' : '';
        if (!_mcChars.length) { listEl.innerHTML = '<div class="swb-psub">還沒有角色。點下面「新增角色」開始寫你的主角。</div>'; return; }
        listEl.innerHTML = _mcChars.map(c => `<div class="swb-card mc-charcard" data-uid="${c.uid}">
            <div class="swb-card-main">
                <div class="swb-card-title">${_sgcEsc(c.name)}${c.enabled ? '<span class="mc-active-tag">使用中</span>' : ''}</div>
                <div class="swb-card-sum">${_sgcEsc(c.summary) || '（空）'}</div>
            </div>
            <button class="mc-usebtn ${c.enabled ? 'on' : ''}" data-use="${c.uid}">${c.enabled ? '使用中' : '設為使用中'}</button>
            <span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span>
        </div>`).join('');
        listEl.querySelectorAll('.mc-charcard').forEach(card => {
            const main = card.querySelector('.swb-card-main');
            if (main) main.onclick = () => { const c = _mcChars.find(x => x.uid === parseInt(card.getAttribute('data-uid'), 10)); if (c) _mcOpenChar(c); };
        });
        listEl.querySelectorAll('[data-use]').forEach(btn => btn.onclick = (ev) => { ev.stopPropagation(); _mcSetActive(parseInt(btn.getAttribute('data-use'), 10)); });
    }

    // 新增角色 → 兩條路：創建新的 / 修改我現有的（酒館）人設
    function _mcNewChooser() {
        _mcSheet('新增角色 — 從哪開始？', [
            { label: '<i class="fa-solid fa-plus"></i> 創建新的（從零跟 AI 寫）', onClick: () => _mcOpenChar(null) },
            { label: '<i class="fa-solid fa-address-card"></i> 修改我現有的人設（選一個酒館人設）', onClick: () => { _mcView = 'import'; renderPersonaPanel(); } }
        ]);
    }
    // 匯入頁：列出 ST 酒館人設，選一個 → AI 拆塊落進編輯器（之後可直接「對標當前世界」）
    function _mcRenderImport(host) {
        const OP = (window.parent || window).OS_PERSONA || window.OS_PERSONA;
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar"><button class="swb-iconbtn" id="mc-iback"><i class="fa-solid fa-chevron-left"></i></button><div class="swb-bar-title">修改我現有的人設</div></div>
            <div class="swb-list mc-list" id="mc-implist"><div class="swb-psub">讀取中…</div></div>
        </div>`;
        host.querySelector('#mc-iback').onclick = () => { _mcView = 'list'; renderPersonaPanel(); };
        const listEl = host.querySelector('#mc-implist');
        const paint = (arr) => {
            if (!arr || !arr.length) { listEl.innerHTML = '<div class="swb-psub">讀不到酒館人設（可先到大廳「使用者」開一次，或這環境沒有人設）。</div>'; return; }
            listEl.innerHTML = arr.map((p, i) => `<div class="swb-card mc-charcard" data-i="${i}">
                ${p.avatar ? `<img class="mc-impavatar" src="${_sgcEsc(p.avatar)}" onerror="this.classList.add('mc-impavatar-broke')">` : '<div class="mc-impavatar mc-impavatar-ph"><i class="fa-solid fa-user"></i></div>'}
                <div class="swb-card-main"><div class="swb-card-title">${_sgcEsc(p.name)}</div><div class="swb-card-sum">${_sgcEsc(String(p.desc || '').replace(/\s+/g, ' ').slice(0, 40)) || 'ST 原生人設'}</div></div>
                <span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span>
            </div>`).join('');
            listEl.querySelectorAll('.mc-charcard').forEach(card => card.onclick = () => { const p = arr[parseInt(card.getAttribute('data-i'), 10)]; if (p) { _mcImportPick = p; _mcView = 'importopts'; renderPersonaPanel(); } });
        };
        let list = [];
        try { list = (OP && OP.getList && OP.getList()) || []; } catch (e) {}
        paint(list);
        if (!list.length) setTimeout(() => { let l2 = []; try { l2 = (OP && OP.getList && OP.getList()) || []; } catch (e) {} if (_mcView === 'import') paint(l2); }, 450);
    }
    // 選了現有人設 → 面板內小表單：對標當前世界 / 或自己打要求讓 AI 改＋整理(留空=只整理)。都存成新一份(uid:null)
    function _mcRenderImportOpts(host) {
        const p = _mcImportPick || {};
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar"><button class="swb-iconbtn" id="mc-oback"><i class="fa-solid fa-chevron-left"></i></button><div class="swb-bar-title">${_sgcEsc(p.name || '人設')}</div></div>
            <button class="mc-optbtn" id="mc-opt-world"><i class="fa-solid fa-earth-asia"></i> 對標當前世界（變這張卡的世界版）</button>
            <div class="mc-opt-or">或，照你的要求改</div>
            <textarea class="swb-field mc-optreq" id="mc-optreq" rows="3" placeholder="想怎麼改這份人設？（例：更陰沉一點、加一段職業背景）留空＝只整理分類"></textarea>
            <button class="mc-optbtn primary" id="mc-opt-refine"><i class="fa-solid fa-wand-magic-sparkles"></i> 改＋整理</button>
        </div>`;
        host.querySelector('#mc-oback').onclick = () => { _mcView = 'import'; renderPersonaPanel(); };
        host.querySelector('#mc-opt-world').onclick = () => _mcImportToWorld(p);
        host.querySelector('#mc-opt-refine').onclick = () => { const req = (host.querySelector('#mc-optreq').value || '').trim(); _mcImportRefine(p, req); };
    }
    function _mcImportEnter(p, blocks, pane, nameOverride) {
        _mcWorking = { uid: null, name: nameOverride != null ? nameOverride : ((p && p.name) || ''), blocks };
        _mcChat = []; _mcPendCount = blocks.length; _mcView = 'editor'; _mcPane = pane; renderPersonaPanel();
    }
    // 照使用者要求改寫＋整理成區塊（req 留空＝只整理）。落進編輯器預覽
    async function _mcImportRefine(p, req) {
        const desc = String((p && p.desc) || '').trim();
        if (!desc) { _mcImportEnter(p, [], 'chat'); return; }
        const api = (window.parent || window).OS_API || window.OS_API;
        if (!api || (typeof api.chatMain !== 'function' && typeof api.chatSecondary !== 'function')) {
            _wbToast('沒有可用 AI，先整段放著、可手動拆塊');
            _mcImportEnter(p, [{ label: '人設', content: desc, userEdited: true }], 'preview'); return;
        }
        _wbToast(req ? 'AI 改寫＋整理中…' : 'AI 整理中…');
        const task = req
            ? ('請依使用者要求改寫這份人設，並整理成區塊。沒被要求動到的部分保留原樣，別自己亂加設定。\n【使用者要求】' + req)
            : '請把這份人設整理成區塊，內容忠於原文、別自己加設定。';
        const sys = _MC_SYS + '\n\n【任務】下面是使用者現有的人設（一整段散文）。' + task + ' 結果用 <persona><seg> 輸出。\n\n【現有人設】\n' + desc;
        const messages = [{ role: 'system', content: sys }, { role: 'user', content: req || '整理成區塊。' }];
        const done = (full) => {
            const segs = _mcParseSegs(String(full || ''));
            if (segs.length) _mcImportEnter(p, segs.map(s => ({ label: s.label, content: s.content, userEdited: false, aiNew: true })), 'preview');
            else { _wbToast('AI 沒整理成功，先整段放著'); _mcImportEnter(p, [{ label: '人設', content: desc, userEdited: true }], 'preview'); }
        };
        const errCb = () => { _wbToast('AI 失敗，先整段放著'); _mcImportEnter(p, [{ label: '人設', content: desc, userEdited: true }], 'preview'); };
        const useMain = _mcModel === 'main' && typeof api.chatMain === 'function';
        const callFn = useMain ? api.chatMain : (typeof api.chatSecondary === 'function' ? api.chatSecondary : api.chatMain);
        try { callFn.call(api, messages, () => {}, done, errCb); } catch (e) { errCb(e); }
    }
    // 對標當前世界：一個 AI call 直接把現有人設改寫成這張卡世界的版本(現代→古代)，存成新變體
    async function _mcImportToWorld(p) {
        const desc = String((p && p.desc) || '').trim();
        if (!desc) { _wbToast('這個人設沒有描述內容，先整理一下'); _mcImportRefine(p, ''); return; }
        let ctx = await _mcWorldContext('card');
        let tag = '對標版';
        if (!ctx) {
            const d = prompt('這張卡沒抓到綁定的世界書。\n用一句話描述要對標的世界（例：古風武俠）：');
            if (!d || !d.trim()) return;
            ctx = '世界觀：' + d.trim(); tag = d.trim().slice(0, 8);
        }
        const api = (window.parent || window).OS_API || window.OS_API;
        if (!api || (typeof api.chatMain !== 'function' && typeof api.chatSecondary !== 'function')) { alert('AI 不可用'); return; }
        _wbToast('AI 對標世界中…');
        const sys = _MC_SYS + '\n\n【任務】下面是使用者現有的人設（一整段散文）。請把它改寫成「貼合下面這個世界」的版本。原則：\n1. 保留核心個性／這個人是誰／與人相處的方式——性格本質不變。\n2. 外觀、說話習慣、出身背景這類「世界皮層」改寫成貼合該世界（例如現代身分改成古代身分）。\n3. ★取捨優先於硬凹：原設定裡若有「在新世界根本不存在或不合理」的東西（某些職業、物品、習慣、背景細節），就「直接捨棄那一項」，不要硬找個對應物去套。寧可這個人在新世界少幾條設定，也不要為了照搬而生出彆扭的拼湊對應。\n4. 只留／改「換了世界仍然成立」的部分；不合的就讓它消失、別硬交代它的去向。\n把結果拆成區塊用 <persona><seg> 輸出。\n\n【現有人設】\n' + desc + '\n\n' + ctx;
        const messages = [{ role: 'system', content: sys }, { role: 'user', content: '把我的人設改寫成這個世界的版本。' }];
        const done = (full) => {
            const segs = _mcParseSegs(String(full || ''));
            if (!segs.length) { alert('AI 沒吐出區塊，再試一次'); return; }
            _mcImportEnter(p, segs.map(s => ({ label: s.label, content: s.content, userEdited: false, aiNew: true })), 'preview', ((p && p.name) || '我') + '（' + tag + '）');
            _wbToast('已生成世界版，按確定會存成「新的一份」、不動你原本的');
        };
        const errCb = (err) => alert('AI 失敗：' + (err && err.message || err));
        const useMain = _mcModel === 'main' && typeof api.chatMain === 'function';
        const callFn = useMain ? api.chatMain : (typeof api.chatSecondary === 'function' ? api.chatSecondary : api.chatMain);
        try { callFn.call(api, messages, () => {}, done, errCb); } catch (e) { errCb(e); }
    }

    const _MC_SYS = `你是「我的角色」人設寫作助手，幫使用者寫他自己在故事裡扮演的主角（MC/OC）。可能含成人/NSFW 設定，照常專業協助、不要拒絕、不要說教。
- 先用一兩句白話跟使用者討論。
- 要寫或改人設時，把人設拆成多個「區塊」，每個區塊用一個 <seg> 標籤包起來，整批放在 <persona>…</persona> 裡：
  <persona>
  <seg label="區塊名">這個區塊的內容</seg>
  <seg label="區塊名">這個區塊的內容</seg>
  </persona>
- 區塊名你依內容自取（例如：外觀、個性、說話習慣、背景、喜好、討厭的事物…），需要幾塊就給幾塊。
- 同一個「區塊名」代表同一塊；使用者只想改某一塊時，就只重出那一塊（同名會覆蓋舊的）。
- 只輸出你的對話與 <persona> 區塊，不要解釋格式本身。`;

    // 把 AI 吐的 segs 合進 _mcWorking.blocks：同名覆蓋，但使用者手改過(userEdited)的不蓋；回傳這輪動到幾塊
    function _mcMergeSegs(segs) {
        let touched = 0;
        (segs || []).forEach(s => {
            const ex = _mcWorking.blocks.find(b => b.label === s.label);
            if (!ex) { _mcWorking.blocks.push({ label: s.label, content: s.content, userEdited: false, aiNew: true }); touched++; }
            else if (!ex.userEdited) { ex.content = s.content; ex.aiNew = true; touched++; }
        });
        return touched;
    }
    function _mcRenderEditorChat(host) {
        const nm = _mcWorking.name || '新角色';
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar">
                <button class="swb-iconbtn" id="mc-back"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title">${_sgcEsc(nm)}</div>
                <button class="swb-iconbtn" id="mc-toworld" title="對標某個世界，把人設換皮成那個世界的版本"><i class="fa-solid fa-earth-asia"></i></button>
            </div>
            <div class="mc-chat" id="mc-chat"></div>
            <div class="mc-pendbar" id="mc-pendbar"></div>
            <div class="mc-inputrow">
                <textarea class="swb-field mc-input" id="mc-msg" rows="2" placeholder="${_mcWorking.blocks.length ? '想再加或修改哪裡，直接跟 AI 說…' : '跟 AI 說你的主角是什麼樣的人…'}"></textarea>
                <button class="swb-primary" id="mc-send">送出</button>
            </div>
        </div>`;
        host.querySelector('#mc-back').onclick = () => { _mcView = 'list'; _mcWorking = null; renderPersonaPanel(); };
        host.querySelector('#mc-send').onclick = () => _mcSend(host);
        host.querySelector('#mc-toworld').onclick = () => _mcAdaptToWorld(host);
        _mcPaintChat(host);
        _mcPaintPendBar(host);
    }
    function _mcPaintChat(host) {
        const box = host.querySelector('#mc-chat'); if (!box) return;
        box.innerHTML = _mcChat.map(m =>
            `<div class="mc-msg ${m.role === 'user' ? 'me' : 'ai'}">${_sgcEsc(m.content).replace(/&lt;persona&gt;[\s\S]*?&lt;\/persona&gt;/gi, '').replace(/\n/g, '<br>').trim() || '…'}</div>`
        ).join('');
        box.scrollTop = box.scrollHeight;
    }
    function _mcPaintPendBar(host) {
        const bar = host.querySelector('#mc-pendbar'); if (!bar) return;
        if (_mcWorking.blocks.length && _mcPendCount > 0) {
            bar.innerHTML = `<button class="mc-pend" id="mc-viewprev"><i class="fa-solid fa-eye"></i> 人設更新了 · 看預覽（${_mcWorking.blocks.length}）</button>`;
            bar.querySelector('#mc-viewprev').onclick = () => { _mcPane = 'preview'; renderPersonaPanel(); };
        } else if (_mcWorking.blocks.length) {
            bar.innerHTML = `<button class="mc-pend ghost" id="mc-viewprev2"><i class="fa-solid fa-eye"></i> 看預覽（${_mcWorking.blocks.length}）</button>`;
            bar.querySelector('#mc-viewprev2').onclick = () => { _mcPane = 'preview'; renderPersonaPanel(); };
        } else { bar.innerHTML = ''; }
    }
    async function _mcSend(host) {
        const ta = host.querySelector('#mc-msg'); const msg = (ta.value || '').trim();
        if (!msg) return;
        const api = (window.parent || window).OS_API || window.OS_API;
        if (!api || (typeof api.chatSecondary !== 'function' && typeof api.chatMain !== 'function')) { alert('AI 不可用，請先到「寫作 → API 設置」設好模型'); return; }
        _mcChat.push({ role: 'user', content: msg }); ta.value = '';
        _mcPaintChat(host);
        const sendBtn = host.querySelector('#mc-send'); if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '生成中…'; }
        const existing = _mcWorking.blocks.length ? ('\n\n【目前人設區塊】\n' + _mcAssembleContent(_mcWorking.blocks)) : '';
        const messages = [{ role: 'system', content: _MC_SYS + existing }].concat(_mcChat.slice(-8));
        const done = (full) => {
            if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '送出'; }
            const reply = String(full || '');
            _mcChat.push({ role: 'assistant', content: reply });
            _mcPendCount += _mcMergeSegs(_mcParseSegs(reply));
            _mcPaintChat(host); _mcPaintPendBar(host);
        };
        const errCb = (err) => { if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '送出'; } alert('AI 失敗：' + (err && err.message || err)); };
        const useMain = _mcModel === 'main' && typeof api.chatMain === 'function';
        const callFn = useMain ? api.chatMain : (typeof api.chatSecondary === 'function' ? api.chatSecondary : api.chatMain);
        try { callFn.call(api, messages, () => {}, done, errCb); } catch (e) { errCb(e); }
    }

    function _mcRenderPreview(host) {
        _mcPendCount = 0;
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar">
                <button class="swb-iconbtn" id="mc-pback"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title"><i class="fa-solid fa-eye"></i> 人設預覽<span class="swb-bar-sub">${_mcWorking.blocks.length} 個區塊</span></div>
            </div>
            <input class="swb-field mc-namefield" id="mc-name" placeholder="角色名（例：冷面男主）" value="${_sgcEsc(_mcWorking.name)}">
            <div class="mc-blocks" id="mc-blocks"></div>
            <button class="mc-addblock" id="mc-addblock"><i class="fa-solid fa-plus"></i> 自己加一個區塊</button>
            <div class="swb-footbar">
                <button class="swb-secondary" id="mc-pcancel"><i class="fa-solid fa-chevron-left"></i> 返回對話</button>
                <button class="swb-primary" id="mc-save"><i class="fa-solid fa-floppy-disk"></i> 確定寫入世界書</button>
            </div>
        </div>`;
        host.querySelector('#mc-pback').onclick = () => { _mcPane = 'chat'; renderPersonaPanel(); };
        host.querySelector('#mc-pcancel').onclick = () => { _mcPane = 'chat'; renderPersonaPanel(); };
        host.querySelector('#mc-name').oninput = (e) => { _mcWorking.name = e.target.value; };
        host.querySelector('#mc-addblock').onclick = () => { _mcWorking.blocks.push({ label: '新區塊', content: '', userEdited: true, editing: true }); renderPersonaPanel(); };
        host.querySelector('#mc-save').onclick = () => _mcWriteEntry(host);
        _mcPaintBlocks(host);
    }
    function _mcPaintBlocks(host) {
        const box = host.querySelector('#mc-blocks'); if (!box) return;
        box.innerHTML = _mcWorking.blocks.map((b, i) => b.editing ? `
            <div class="mc-block editing" data-i="${i}">
                <input class="mc-block-label" data-label="${i}" value="${_sgcEsc(b.label)}" placeholder="區塊名">
                <textarea class="mc-block-text" data-text="${i}" rows="3" placeholder="這個區塊的內容">${_sgcEsc(b.content)}</textarea>
                <div class="mc-block-editrow"><button class="swb-secondary mc-bdone" data-done="${i}"><i class="fa-solid fa-check"></i> 完成</button></div>
            </div>` : `
            <div class="mc-block" data-i="${i}">
                <div class="mc-block-head">
                    <i class="fa-solid fa-grip-vertical mc-grip"></i>
                    <span class="mc-block-name">${_sgcEsc(b.label)}${b.aiNew ? '<span class="mc-ai-dot" title="AI 更新">·</span>' : ''}</span>
                    <span class="mc-block-spacer"></span>
                    <button class="mc-iconbtn" data-edit="${i}" aria-label="編輯"><i class="fa-solid fa-pen"></i></button>
                    <button class="mc-iconbtn danger" data-del="${i}" aria-label="刪除"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="mc-block-body">${_sgcEsc(b.content).replace(/\n/g, '<br>') || '（空）'}</div>
                <div class="mc-block-move"><button class="mc-movebtn" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="上移"><i class="fa-solid fa-arrow-up"></i></button><button class="mc-movebtn" data-down="${i}" ${i === _mcWorking.blocks.length - 1 ? 'disabled' : ''} aria-label="下移"><i class="fa-solid fa-arrow-down"></i></button></div>
            </div>`).join('');
        box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { _mcWorking.blocks[+b.getAttribute('data-edit')].editing = true; renderPersonaPanel(); });
        box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { _mcWorking.blocks.splice(+b.getAttribute('data-del'), 1); renderPersonaPanel(); });
        box.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const i = +b.getAttribute('data-up'); const a = _mcWorking.blocks; const t = a[i - 1]; a[i - 1] = a[i]; a[i] = t; renderPersonaPanel(); });
        box.querySelectorAll('[data-down]').forEach(b => b.onclick = () => { const i = +b.getAttribute('data-down'); const a = _mcWorking.blocks; const t = a[i + 1]; a[i + 1] = a[i]; a[i] = t; renderPersonaPanel(); });
        box.querySelectorAll('[data-done]').forEach(b => b.onclick = () => {
            const i = +b.getAttribute('data-done');
            const lab = box.querySelector('[data-label="' + i + '"]').value.trim();
            const txt = box.querySelector('[data-text="' + i + '"]').value;
            _mcWorking.blocks[i].label = lab || '未命名'; _mcWorking.blocks[i].content = txt;
            _mcWorking.blocks[i].userEdited = true; _mcWorking.blocks[i].aiNew = false; _mcWorking.blocks[i].editing = false;
            renderPersonaPanel();
        });
    }
    async function _mcWriteEntry(host) {
        if (!_mcWorking.name || !_mcWorking.name.trim()) { alert('先給角色取個名字'); return; }
        if (!_mcWorking.blocks.length) { alert('至少要有一個區塊'); return; }
        const TH = _wbTH();
        if (!TH) { alert('酒館助手未就緒'); return; }
        await _mcEnsureBook();
        const _nm = _mcWorking.name.trim();
        // 主模型只讀條目「內容」、讀不到標題 → 內容開頭標【用戶人設】+角色名，讓它知道這是玩家扮演的主角、別當 NPC/世界設定
        const content = '【用戶人設】這是玩家本人在故事中扮演的主角「' + _nm + '」的設定，請以此理解並扮演使用者角色：\n\n' + _mcAssembleContent(_mcWorking.blocks);
        const entry = { comment: _nm, keys: [], content, type: 'constant' };
        try {
            if (_mcWorking.uid != null) await TH.setLorebookEntries(MC_BOOK, [{ uid: _mcWorking.uid, ...entry }]);
            else await TH.createLorebookEntries(MC_BOOK, [{ ...entry, enabled: false }]);
            _wbToast('已寫入世界書 ✓');
            _mcView = 'list'; _mcWorking = null;
            renderPersonaPanel();
        } catch (e) { alert('寫入失敗：' + (e && e.message || e)); }
    }
    async function _mcSetActive(uid) {
        const TH = _wbTH();
        if (!TH || !TH.setLorebookEntries) { alert('酒館助手未就緒'); return; }
        try {
            const cur = _mcChars.find(c => c.uid === uid);
            const turnOff = !!(cur && cur.enabled);   // 已是使用中 → 再點＝取消使用（全部關掉、允許一個都不開）
            const updates = _mcChars.map(c => ({ uid: c.uid, enabled: turnOff ? false : (c.uid === uid) }));
            await TH.setLorebookEntries(MC_BOOK, updates);
            _wbToast(turnOff ? '已取消使用 ✓' : '已設為使用中 ✓');
            renderPersonaPanel();
        } catch (e) { alert('切換失敗：' + (e && e.message || e)); }
    }

    function _mcSheet(title, actions) {
        const host = document.getElementById('studio-persona-content');
        if (!host) return;
        const ov = document.createElement('div');
        ov.className = 'swb-sheet-ov';
        ov.innerHTML = `<div class="swb-sheet"><div class="swb-sheet-title">${_sgcEsc(title)}</div></div>`;
        const sheet = ov.querySelector('.swb-sheet');
        actions.forEach(a => {
            const b = document.createElement('button');
            b.className = 'swb-sheet-btn' + (a.danger ? ' danger' : '');
            b.innerHTML = a.label;
            b.onclick = () => { ov.remove(); a.onClick && a.onClick(); };
            sheet.appendChild(b);
        });
        const cancel = document.createElement('button');
        cancel.className = 'swb-sheet-btn cancel'; cancel.textContent = '取消';
        cancel.onclick = () => ov.remove();
        sheet.appendChild(cancel);
        ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
        host.appendChild(ov);
    }
    function _mcAdaptToWorld(host) {
        if (!_mcWorking.blocks.length) { alert('先寫好一個底版人設，再對標世界'); return; }
        _mcSheet('對標哪個世界？', [
            { label: '<i class="fa-solid fa-id-card"></i> 我現在這張卡的世界', onClick: () => _mcDoAdapt(host, 'card') },
            { label: '<i class="fa-solid fa-pen"></i> 我自己描述一個世界', onClick: () => { const desc = prompt('用一句話描述世界觀（例：古風武俠／賽博龐克…）'); if (desc && desc.trim()) _mcDoAdapt(host, 'desc', desc.trim()); } }
        ]);
    }
    async function _mcWorldContext(mode, desc) {
        if (mode === 'desc') return '世界觀：' + desc;
        const TH = _wbTH();
        try {
            const names = new Set();
            try { const cw = TH.getCharWorldbookNames && TH.getCharWorldbookNames('current'); if (cw) { if (cw.primary) names.add(cw.primary); (cw.additional || []).forEach(n => names.add(n)); } } catch (e) {}
            try { const chat = TH.getChatWorldbookName && TH.getChatWorldbookName('current'); if (chat) names.add(chat); } catch (e) {}
            names.delete(MC_BOOK);
            if (!names.size) return null;
            const parts = [];
            for (const name of names) {
                const entries = await TH.getLorebookEntries(name) || [];
                const txt = entries.filter(e => e.enabled !== false).map(e => '【' + (e.comment || '') + '】' + (e.content || '')).join('\n');
                if (txt) parts.push(txt);
            }
            const all = parts.join('\n').slice(0, 4000);
            return all ? ('目標世界設定：\n' + all) : null;
        } catch (e) { return null; }
    }
    async function _mcDoAdapt(host, mode, desc) {
        const ctx = await _mcWorldContext(mode, desc);
        if (!ctx) { alert('拿不到世界資料（這張卡可能沒綁世界書）。改用「我自己描述一個世界」。'); return; }
        const api = (window.parent || window).OS_API || window.OS_API;
        if (!api || (typeof api.chatMain !== 'function' && typeof api.chatSecondary !== 'function')) { alert('AI 不可用'); return; }
        _wbToast('AI 換皮中…');
        const sys = _MC_SYS + '\n\n【對標世界】使用者要把現有人設改成貼合下面這個世界。請「保留人設的核心個性／這個人是誰」，只把外觀、說話習慣、背景這類「世界皮層」改寫成貼合該世界；不要改掉性格本質。一樣用 <persona><seg> 輸出全部區塊。\n\n【現有人設】\n' + _mcAssembleContent(_mcWorking.blocks) + '\n\n' + ctx;
        const messages = [{ role: 'system', content: sys }, { role: 'user', content: '把我的人設對標到這個世界，重寫全部區塊。' }];
        const done = (full) => {
            const segs = _mcParseSegs(String(full || ''));
            if (!segs.length) { alert('AI 沒吐出區塊，再試一次'); return; }
            const base = _mcWorking.name || '我';
            const tag = mode === 'desc' ? desc : '對標版';
            _mcWorking = { uid: null, name: base + '（' + tag.slice(0, 8) + '）', blocks: segs.map(s => ({ label: s.label, content: s.content, userEdited: false, aiNew: true })) };
            _mcChat = []; _mcPendCount = segs.length; _mcPane = 'preview';
            renderPersonaPanel();
            _wbToast('已生成變體，檢查後按確定寫入');
        };
        const errCb = (err) => alert('AI 失敗：' + (err && err.message || err));
        const useMain = _mcModel === 'main' && typeof api.chatMain === 'function';
        const callFn = useMain ? api.chatMain : (typeof api.chatSecondary === 'function' ? api.chatSecondary : api.chatMain);
        try { callFn.call(api, messages, () => {}, done, errCb); } catch (e) { errCb(e); }
    }

    function renderThemePanel() {
        const host = document.getElementById('studio-theme-content'); if (!host) return;
        const VT = (window.parent || window).VN_Theme || window.VN_Theme;
        const VC = (window.parent || window).VN_Cache || window.VN_Cache;
        if (!VT) { host.innerHTML = '<div style="color:#fc8181;padding:10px;">VN_Theme 未載入，請先進 VN 一次再回來</div>'; return; }
        const chatId = (VC && VC.getCurrentWorld) ? VC.getCurrentWorld() : (VT.getCurrentWorld ? VT.getCurrentWorld() : '');
        const css = VT.getCss(chatId);
        const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const ph = '手寫 / 貼上，或用上面的「AI 生成」。上方會即時預覽。\n範圍內選擇器：\n#text-panel.char-mode / .nar-mode / .inner-mode（三狀態對話框）\n#dialogue-text（內文）  #speaker-name（名牌）  #top-badge（左上時間地點場景牌）\n#vn-panel-controls / .vn-panel-btn（SKIP/LOG/AUTO）  #btn-home / #btn-settings / #btn-phone（右上頂部鈕）\n（配件位置固定只配色；立繪 #game-char、背景圖層 #game-bg 不歸主題管）';
        host.innerHTML = `<div class="vth-wrap">
            <div class="vth-css-bar">
                <span class="vth-css-world"><i class="fa-solid fa-globe"></i> ${esc(chatId || '(未知，先進 VN 一次)')}</span>
                <button class="vth-mini primary" id="vth-css-apply"><i class="fa-solid fa-floppy-disk"></i> 套用到此世界</button>
                <button class="vth-mini" id="vth-css-clear">清空</button>
            </div>
            <div class="vth-ai-row">
                <input id="vth-ai-desc" class="vth-ai-desc" placeholder="描述風格讓 AI 生成（例：賽博夜雨霓虹 / 古典宮廷燙金 / 陰森廢墟舊紙）">
                <button class="vth-mini primary" id="vth-ai-gen"><i class="fa-solid fa-robot"></i> AI 生成</button>
            </div>
            <div class="vth-prev-head">
                <span class="vth-prev-label"><i class="fa-solid fa-eye"></i> 即時預覽</span>
                <div class="vth-vp-tabs">
                    <button class="vth-vp active" data-vp="phone" title="手機端">手機</button>
                    <button class="vth-vp" data-vp="center" title="桌面·中間聊天區">中間</button>
                    <button class="vth-vp" data-vp="full" title="桌面·全屏（奧瑞亞擴大模式）">全屏</button>
                    <input id="vth-vp-w" class="vth-vp-w" type="number" min="600" max="2560" step="20" title="中間聊天區寬度＝你嵌入奧瑞亞的實際寬度（約 900~1100）">
                </div>
                <div class="vth-mode-tabs">
                    <button class="vth-mode active" data-mode="char-mode">角色對話</button>
                    <button class="vth-mode" data-mode="nar-mode">旁白</button>
                    <button class="vth-mode" data-mode="inner-mode">內心</button>
                </div>
            </div>
            <div class="vth-preview-wrap" id="vth-preview-wrap"><div class="vth-preview-box" id="vth-preview-box"><iframe id="vth-preview" class="vth-preview" sandbox="allow-same-origin"></iframe></div></div>
            <textarea id="vth-css-area" class="vth-css-area" spellcheck="false" placeholder="${esc(ph)}">${esc(css)}</textarea>
            <div class="vth-css-hint">改框內 CSS，上方即時預覽。「套用到此世界」存進當前世界、VN 開播自動套；「收藏目前」存進下方主題庫可跨世界重用。AI 用「寫作→API 設置」的副模型。</div>
            <div class="vth-gal">
                <div class="vth-gal-head">
                    <span class="vth-gal-label"><i class="fa-solid fa-swatchbook"></i> 我的主題庫</span>
                    <div class="vth-gal-save">
                        <input id="vth-gal-name" class="vth-gal-name" placeholder="主題命名…">
                        <button class="vth-mini primary" id="vth-gal-add"><i class="fa-solid fa-bookmark"></i> 收藏目前</button>
                    </div>
                </div>
                <div class="vth-gal-list" id="vth-gal-list"></div>
            </div>
        </div>`;

        const area = host.querySelector('#vth-css-area');
        const frame = host.querySelector('#vth-preview');
        const previewWrap = host.querySelector('#vth-preview-wrap');
        const previewBox  = host.querySelector('#vth-preview-box');
        const wInput      = host.querySelector('#vth-vp-w');
        let _curVp = 'phone';
        // 對應奧瑞亞三種顯示情境：手機端 / 桌面·中間聊天區 / 桌面·全屏（奧瑞亞擴大模式）。
        //   都「用真實解析度渲染 → transform:scale 等比縮小 → 外層裁切」比例才正確。
        //   中間聊天區寬可調(嵌入欄通常 900~1100)，存 localStorage；全屏抓真實螢幕尺寸。
        let _deskW = Math.max(600, Math.min(2560, parseInt(localStorage.getItem('vth_desk_w')) || 1000));
        if (wInput) wInput.value = _deskW;
        const applyVp = () => {
            if (!previewBox || !frame || !previewWrap) return;
            if (wInput) wInput.style.display = (_curVp === 'center') ? '' : 'none';
            const avail = previewWrap.clientWidth || 320;
            let RW, RH, s;
            if (_curVp === 'full') {
                RW = (window.screen && screen.width)  || 1920;
                RH = (window.screen && screen.height) || 1080;
                s = avail / RW;
            } else if (_curVp === 'center') {
                RW = _deskW; RH = Math.round(_deskW * 0.66);
                s = avail / RW;
            } else {
                RW = 390; RH = 844;
                s = Math.min(avail / RW, 430 / RH);   // 限高 430，避免直式手機太長
            }
            frame.style.width = RW + 'px';
            frame.style.height = RH + 'px';
            frame.style.transformOrigin = 'top left';
            frame.style.transform = 'scale(' + s + ')';
            previewBox.style.width  = Math.round(RW * s) + 'px';
            previewBox.style.height = Math.round(RH * s) + 'px';
        };
        if (wInput) wInput.onchange = () => {
            _deskW = Math.max(600, Math.min(2560, parseInt(wInput.value) || 1000));
            wInput.value = _deskW;
            try { localStorage.setItem('vth_desk_w', String(_deskW)); } catch (e) {}
            if (_curVp === 'center') applyVp();
        };
        let _t = null;
        const refreshPreview = () => { try { frame.srcdoc = _vthBuildSrcdoc(area.value); } catch (e) {} };
        refreshPreview();
        applyVp();
        area.oninput = () => { if (_t) clearTimeout(_t); _t = setTimeout(refreshPreview, 250); };

        host.querySelectorAll('.vth-vp').forEach(b => b.onclick = () => {
            _curVp = b.dataset.vp;
            host.querySelectorAll('.vth-vp').forEach(x => x.classList.toggle('active', x === b));
            applyVp();
        });

        host.querySelectorAll('.vth-mode').forEach(b => b.onclick = () => {
            _vthMode = b.dataset.mode;
            host.querySelectorAll('.vth-mode').forEach(x => x.classList.toggle('active', x === b));
            refreshPreview();
        });

        host.querySelector('#vth-css-apply').onclick = () => {
            VT.setCss(chatId, area.value);
            const b = host.querySelector('#vth-css-apply'); const o = b.textContent; b.textContent = '✓ 已套用'; setTimeout(() => { b.textContent = o; }, 1200);
        };
        host.querySelector('#vth-css-clear').onclick = () => { if (confirm('清空此世界的自訂 CSS？')) { VT.clear(chatId); area.value = ''; refreshPreview(); } };

        const genBtn = host.querySelector('#vth-ai-gen');
        genBtn.onclick = () => {
            const desc = host.querySelector('#vth-ai-desc').value.trim();
            if (!desc) { alert('先描述你想要的風格'); return; }
            const api = (window.parent || window).OS_API || window.OS_API;
            if (!api || typeof api.chatSecondary !== 'function') { alert('AI（副模型）不可用，請先到「寫作 → API 設置」設好副模型'); return; }
            const orig = genBtn.textContent; genBtn.textContent = '生成中…'; genBtn.disabled = true;
            api.chatSecondary(
                [{ role: 'user', content: VTH_AI_PROMPT + desc }],
                () => {},
                (full) => {
                    let out = String(full || '');
                    const m = out.match(/```(?:css)?\s*([\s\S]*?)```/i);
                    if (m) out = m[1];
                    out = out.trim();
                    if (out) { area.value = out; refreshPreview(); VT.setCss(chatId, out); }
                    genBtn.textContent = '✓ 已生成（已預覽+套用）'; genBtn.disabled = false;
                    setTimeout(() => { genBtn.textContent = orig; }, 1800);
                },
                (err) => { genBtn.textContent = orig; genBtn.disabled = false; alert('生成失敗：' + ((err && err.message) || err)); }
            );
        };

        // ── 主題庫（跨世界重用，像 VN UI 展廳）──
        const renderGal = () => {
            const list = host.querySelector('#vth-gal-list');
            const arr = _vthGalleryLoad();
            if (!arr.length) { list.innerHTML = '<div class="vth-gal-empty">還沒收藏。調好一個主題後按「💾 收藏目前」存起來，之後任何世界都能一鍵套用。</div>'; return; }
            list.innerHTML = arr.map(t => `<div class="vth-gal-card" data-id="${esc(t.id)}">
                <div class="vth-gal-thumb-wrap"><iframe class="vth-gal-thumb" sandbox="allow-same-origin" scrolling="no"></iframe></div>
                <div class="vth-gal-name-row"><span class="vth-gal-cname">${esc(t.name)}</span></div>
                <div class="vth-gal-acts">
                    <button class="vth-mini primary" data-act="apply">套用</button>
                    <button class="vth-mini" data-act="edit">編輯</button>
                    <button class="vth-mini danger" data-act="del">刪</button>
                </div>
            </div>`).join('');
            arr.forEach(t => {
                const card = list.querySelector('.vth-gal-card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(t.id) : t.id) + '"]');
                if (!card) return;
                try { card.querySelector('.vth-gal-thumb').srcdoc = _vthBuildSrcdoc(t.css, 'char-mode', true); } catch (e) {}
                card.querySelector('[data-act="apply"]').onclick = () => {
                    area.value = t.css || ''; refreshPreview(); VT.setCss(chatId, t.css || '');
                    const bb = card.querySelector('[data-act="apply"]'); const oo = bb.textContent; bb.textContent = '✓'; setTimeout(() => { bb.textContent = oo; }, 1000);
                };
                card.querySelector('[data-act="edit"]').onclick = () => { area.value = t.css || ''; refreshPreview(); area.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
                card.querySelector('[data-act="del"]').onclick = () => { if (confirm('刪除主題「' + t.name + '」？')) { _vthGallerySave(_vthGalleryLoad().filter(x => x.id !== t.id)); renderGal(); } };
            });
        };
        host.querySelector('#vth-gal-add').onclick = () => {
            const nameEl = host.querySelector('#vth-gal-name');
            const name = (nameEl.value || '').trim();
            if (!name) { alert('幫主題取個名字'); nameEl.focus(); return; }
            if (!area.value.trim()) { alert('CSS 是空的，先生成或貼一段再收藏'); return; }
            const arr = _vthGalleryLoad();
            arr.unshift({ id: 'th_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: name, css: area.value });
            _vthGallerySave(arr);
            nameEl.value = '';
            renderGal();
        };
        renderGal();
    }

    function renderMarkdown(raw) {
        if (!raw) return '';
        let s = raw;
        s = s.replace(/<(script|iframe|object|embed|meta|link)[^>]*>[\s\S]*?<\/\1>/gi, '');
        s = s.replace(/<(script|iframe|object|embed|meta|link)[^>]*\/?>/gi, '');
        
        const hiddenUI = '<div style="margin-top:10px; padding:10px 15px; background:rgba(228,232,245,0.8); border:1px solid rgba(26,28,40,0.20); border-radius:8px; color:#1A1C28; font-size:13px; font-weight:bold; display:inline-block;">✨ 已生成，點上方 👁️ 預覽查看</div>';
        
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
                <div style="margin-top:10px; padding:10px 15px; background:rgba(26,28,40,0.06); border:1px solid rgba(26,28,40,0.15); border-radius:8px; display:flex; align-items:center; gap:10px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                    <div class="os-studio-spinner"></div>
                    <span style="color:#1A1C28; font-weight:bold; font-size:13px; letter-spacing:0.5px;">The Mirage 正在為您鑄造頂級 JSON 面板中... 🎨</span>
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
        const tagReg = /<(render|genimg|choices)>([\s\S]*?)<\/\1>/gi;
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
    // options.selectedLabel：choices segment 已被選的內容（重整後直接渲染「已選展示」）
    function createSegmentBubble(seg, animate = true, options = {}) {
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
                <span style="color:rgba(26,28,40,0.72);font-size:12px;">生成圖片中… ${seg.content.slice(0,40)}</span>
            </div>`;
            // 非同步生圖，完成後替換內容
            (async () => {
                try {
                    const imgMgr = win.OS_IMAGE_MANAGER;
                    if (!imgMgr?.generate) throw new Error('找不到圖片引擎');
                    const url = await imgMgr.generate(seg.content, 'scene');
                    if (url) {
                        bubble.innerHTML = `<img src="${url}" alt="generated" />
                            <div style="font-size:10px;color:rgba(26,28,40,0.72);margin-top:4px;padding:0 4px;">${seg.content.slice(0,60)}</div>`;
                    } else {
                        bubble.innerHTML = `<span style="color:#fc8181;font-size:12px;">⚠️ 圖片生成失敗</span>`;
                    }
                } catch(e) {
                    bubble.innerHTML = `<span style="color:#fc8181;font-size:12px;">⚠️ ${e.message}</span>`;
                }
            })();

        } else if (seg.type === 'choices') {
            // 解析 | 分隔的選項，渲染成按鈕列（支援 markdown）
            bubble.classList.add('choices-bubble');
            const items = seg.content.split('|').map(s => s.trim()).filter(Boolean);

            // 變換成「已選展示」狀態：清掉所有按鈕、只顯示選中項
            const collapseToSelected = (label) => {
                bubble.classList.add('selected');
                bubble.innerHTML = `
                    <div class="studio-choices-hint">✓ 你選擇了：</div>
                    <div class="studio-choice-selected">${renderMarkdown(label)}</div>
                `;
            };

            // 重整後若該 choices 已被選過，直接渲染「已選展示」（不顯示按鈕）
            if (options.selectedLabel) {
                collapseToSelected(options.selectedLabel);
                return bubble;
            }

            bubble.innerHTML = '<div class="studio-choices-hint">🤔 你的選擇：</div>';
            const btnRow = document.createElement('div');
            btnRow.className = 'studio-choices-row';

            items.forEach((label) => {
                const btn = document.createElement('button');
                btn.className = 'studio-choice-btn';
                btn.innerHTML = renderMarkdown(label); // 改用 innerHTML 渲染 markdown
                btn.onclick = () => {
                    collapseToSelected(label);
                    const inputEl = document.getElementById('studio-input');
                    if (!inputEl) return;
                    inputEl.value = label;
                    inputEl.dispatchEvent(new Event('input')); // 觸發 autosize
                    // 標記下一條 user 訊息來自 choice 點擊（重整後可恢復「已選」狀態）
                    window.__nextUserMsgFromChoice = true;
                    handleSend();
                };
                btnRow.appendChild(btn);
            });
            // 加「✏️ 其他...」按鈕
            const otherBtn = document.createElement('button');
            otherBtn.className = 'studio-choice-btn studio-choice-other';
            otherBtn.textContent = '✏️ 其他想法...';
            otherBtn.onclick = () => {
                collapseToSelected('✏️ 自己輸入');
                const inputEl = document.getElementById('studio-input');
                if (inputEl) {
                    inputEl.focus();
                    inputEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            };
            btnRow.appendChild(otherBtn);
            bubble.appendChild(btnRow);
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
        if (!text && pendingImages.length === 0) return;

        // === VN 模式：發送前 currentParsedData 空（存檔後 / 重整 / parse 失敗）→ 救回，才能走 diff 不還原 ===
        // 先試「耐久快取」(存最新 diff 結果、跨存檔/重整都在)；撈不到才退聊天歷史(可能只剩初版→會還原 diff)。
        if (currentMode === 'vn_ui' && !currentParsedData) {
            const _cached = _loadParsedCache(getChatSessionId());
            if (_cached && !Array.isArray(_cached)) {
                currentParsedData = _cached;
                activePreviewData = _cached;
                console.log('[Studio] 🛟 currentParsedData 空 → 從耐久快取救回「最新版」面板，走 diff 路徑');
            } else {
                extractLatestJsonFromHistory();
                if (currentParsedData) console.log('[Studio] 🛟 currentParsedData 空 → 退聊天歷史救回（可能初版），走 diff 路徑');
            }
        }

        // === VN 模式：已有面板時，走 diff-based refine（AI 給 find/replace pair，前端套用） ===
        // 用戶完全不接觸技術術語；AI 沒指定的原文物理上動不到 → 真正做到「只改改的、保留沒改的」
        if (currentMode === 'vn_ui' && currentParsedData && !Array.isArray(currentParsedData)) {
            return handleDiffVNRefine(text);
        }

        // full 生成路徑（只剩「還沒有 currentParsedData 的首次生成」會到這；大改已由 diff 路徑的整包 <json> 處理）
        if (currentMode === 'vn_ui' && currentParsedData) {
            snapshotCurrentVNState(text, 'all');
            renderVNHistoryArea();
        }

        const sendBtn = document.getElementById('studio-send-btn');
        inputEl.value = '';
        inputEl.style.height = '50px';
        inputEl.disabled = true;
        sendBtn.disabled = false;
        sendBtn.innerText = '⏹ 停止';
        sendBtn.onclick = () => { if (_studioAbortCtrl) _studioAbortCtrl.abort(); };
        _studioAbortCtrl = new AbortController();

        // VN UI 生成：在訊息開頭標【類型：X】，AI 第一輪就知道要做純展示/純應用/共用（不用每次費口舌）
        const genText = (currentMode === 'vn_ui')
            ? ('【類型：' + _vnPanelType + '】' + (text || '（依此類型先做一版）'))
            : text;
        // 帶圖時 content 變陣列；不帶圖時還是字串（向後兼容既有清洗 / parse 邏輯）
        const userContent = buildUserMessageContent(genText, pendingImages);
        const userMsg = { role: 'user', content: userContent };
        // 標記是否來自選項按鈕點擊（重整後可恢復「已選展示」狀態）
        if (window.__nextUserMsgFromChoice) {
            userMsg._fromChoice = true;
            window.__nextUserMsgFromChoice = false;
        }
        chatMessages.push(userMsg);
        pendingImages = [];
        renderPendingImages();
        _studioSave(getChatSessionId()); // 用戶發送時先存一次，防 AI 失敗後訊息遺失
        renderChatHistory();

        const container = document.getElementById('studio-chat-history');
        const aiBubble = document.createElement('div');
        aiBubble.className = 'studio-bubble ai';
        // 一建立就放打字三點，不等 API 第一個 chunk（避免空泡泡尷尬幾秒）
        aiBubble._typingSet = true;
        aiBubble.innerHTML = `<div class="studio-typing-wrap">
            <span class="studio-typing-dot"></span>
            <span class="studio-typing-dot"></span>
            <span class="studio-typing-dot"></span>
        </div>`;
        container.appendChild(aiBubble);
        container.scrollTop = container.scrollHeight;

        try {
            const apiEngine = win.OS_API || window.OS_API;
            if (!apiEngine || !apiEngine.chat) throw new Error("找不到 API 引擎");

            let baseConfig = win.OS_SETTINGS?.getConfig?.() || JSON.parse(localStorage.getItem('os_global_config') || '{}');
            // 創作室生應用不需要超大輸出；夾到 32768 以下避免 gemini/vertex「maxOutputTokens 超過上限」報錯（主模型那邊若也太大要另調）
            const _capTok = Math.min(parseInt(baseConfig.maxTokens) || 8192, 32768);
            const pureConfig = { ...baseConfig, usePresetPrompts: false, enableThinking: false, temperature: 0.7, maxTokens: _capTok };

            // 過濾：content 是字串時要 trim、陣列時要有內容；跳過已壓縮的原始對話（_isCompressed）
            let apiPayload = JSON.parse(JSON.stringify(chatMessages.filter(m => {
                if (m._isCompressed) return false; // 已壓縮 → 不再送
                if (typeof m.content === 'string') return m.content.trim();
                if (Array.isArray(m.content)) return m.content.length > 0;
                return false;
            })));

            // 摘要訊息：role 改成 system 送上去（AI 把它當系統提示讀，不會誤當對話）
            apiPayload.forEach(m => {
                if (m._isSummary) {
                    m.role = 'system';
                    m.content = `【📌 早期對話摘要 #${m._summaryNum}（壓縮自 ${m._compressedCount} 條對話）】\n${typeof m.content === 'string' ? m.content : messageContentToString(m.content)}`;
                }
            });

            // 🛟 把當前最新面板資料注入到 apiPayload（永遠保證 AI 看得到最新版面板）
            // 這條注入的是 currentParsedData（含 diff 修改後的最新 JSON），不依賴聊天歷史
            if (currentMode === 'vn_ui' && currentParsedData && !Array.isArray(currentParsedData)) {
                try {
                    apiPayload.unshift({
                        role: 'system',
                        content: `【當前面板狀態（最新版，請以此為基準回應；用戶說「改 X」就是針對這份資料動 X）】\n<json>${JSON.stringify(currentParsedData)}</json>`
                    });
                } catch(e) { console.warn('[Studio] 注入當前面板狀態失敗:', e); }
            }

            // 啟用的「功能 chip」用法 → 併進請求(system)，不貼輸入框
            _studioInjectActiveFeatures(apiPayload);

            // 圖片修剪：只保留最近 N 張圖在 context 中，其他帶圖訊息圖被剝掉只留文字 + 占位
            pruneImagesFromHistory(apiPayload);

            // 找出「最新一條含面板 JSON 的訊息索引」—— 這條不清洗，其他舊版照清
            let latestPanelMsgIdx = -1;
            for (let i = apiPayload.length - 1; i >= 0; i--) {
                const m = apiPayload[i];
                const text = typeof m.content === 'string' ? m.content : messageContentToString(m.content);
                if (/<json>[\s\S]*?<\/json>/i.test(text) || /\{\s*"(?:tagId|id|category)"[\s\S]*"(?:html|content|vars)"/i.test(text)) {
                    latestPanelMsgIdx = i;
                    break;
                }
            }

            // 清洗舊版面板資料（跳過 latestPanelMsgIdx 保留最新版）
            apiPayload.forEach((m, idx) => {
                if (idx === latestPanelMsgIdx) return; // 🛡️ 最新面板資料絕對不清
                if (m.role !== 'assistant' || !m.content) return;
                const hideMsg = '[系統紀錄: ✅ 此為舊版資料，已被更新版本取代，自動隱藏節省 Context]';
                const applyCleanup = (s) => {
                    if (typeof s !== 'string') return s;
                    s = s.replace(/<json>[\s\S]*?<\/json>/gi, hideMsg);
                    s = s.replace(/\[\s*\{[\s\S]*?"(?:category|tagId|id)"[\s\S]*\}\s*\]/g, hideMsg);
                    s = s.replace(/\{\s*"(?:category|tagId|id)"[\s\S]*?\}/g, hideMsg);
                    s = s.replace(/<scope>[\s\S]*?<\/scope>/gi, '');
                    s = s.replace(/<(css|js|html|demoFormat|usageDesc)>[\s\S]*?<\/\1>/gi, hideMsg);
                    return s;
                };
                if (typeof m.content === 'string') {
                    m.content = applyCleanup(m.content);
                } else if (Array.isArray(m.content)) {
                    m.content.forEach(part => {
                        if (part && part.type === 'text') part.text = applyCleanup(part.text || '');
                    });
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
                        const _bad = _studioBadReply(finalText);
                        if (_bad.bad) {
                            // API 表面成功、實則錯誤/空/截斷 → 轉重試泡泡，別把垃圾 push 進歷史（保住重試能找到上次 user 訊息）
                            _renderErrorBubble(aiBubble, { message: _bad.reason }, () => _retryLastSend(aiBubble));
                            resolve();
                            return;
                        }
                        aiBubble.remove();
                        chatMessages.push({ role: 'assistant', content: finalText });
                        _studioSave(lockedChatId);
                        appendSegmentBubbles(container, finalText);
                        extractAndParseJson(finalText);
                        resolve();
                    },
                    reject,
                    { useRealStream, disableTyping: useRealStream, signal: _studioAbortCtrl.signal, keepCodeFences: true }
                );
            });

        } catch (err) {
            if (err.name === 'AbortError' || err.message?.includes('abort')) {
                // 使用者主動停止：保留打字泡泡改成已停止提示
                aiBubble.innerHTML = '<span style="color:rgba(26,28,40,0.72); font-size:12px;">⏹ 已停止</span>';
            } else {
                _renderErrorBubble(aiBubble, err, () => _retryLastSend(aiBubble));
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

    // 渲染錯誤泡泡 + 重試按鈕
    function _renderErrorBubble(bubble, err, onRetry) {
        bubble.classList.add('studio-error-bubble');
        bubble.innerHTML = `
            <div class="studio-error-msg">❌ 錯誤：${(err.message || err || '未知錯誤').replace(/</g, '&lt;')}</div>
            <button class="studio-retry-btn">🔄 重試</button>
        `;
        bubble.querySelector('.studio-retry-btn').onclick = onRetry;
    }

    // 判斷 API「表面成功、實則錯誤/空/截斷」的回應：OS_API 只在「完全空」才 throw，
    // 上游回非空錯誤頁(如 504 gateway / Custom OpenAI endpoint failed with status 5xx)會被當正常文字 → 這裡攔下來給重試
    function _studioBadReply(t) {
        const s = (t == null) ? '' : String(t);
        if (!s.trim()) return { bad: true, reason: '回應是空的（可能逾時或被中斷）' };
        const head = s.slice(0, 400);
        if (/^\s*\[\s*API\s*錯誤\s*\]/.test(s)) return { bad: true, reason: s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) };
        if (/(endpoint|request)\s+failed\s+with\s+status\s+\d{3}/i.test(head)) return { bad: true, reason: head.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) };
        if (s.length < 1500 && /gateway timeout|bad gateway|service unavailable|the request could not be satisfied|we can'?t connect to the server/i.test(s)) return { bad: true, reason: 'API 回了錯誤頁（如 504 逾時），不是正常內容' };
        if (/<json>/i.test(s) && !/<\/json>/i.test(s)) return { bad: true, reason: '回應好像被截斷了（內容沒收尾）' };
        return { bad: false };
    }

    // 重試 handleSend：抽出最後一條 user 訊息、清掉錯誤泡泡、重新呼叫
    function _retryLastSend(errBubble) {
        // 找最後一條未壓縮的 user 訊息
        let lastUserIdx = -1;
        for (let i = chatMessages.length - 1; i >= 0; i--) {
            const m = chatMessages[i];
            if (m._isCompressed || m._isSummary) continue;
            if (m.role === 'user') { lastUserIdx = i; break; }
        }
        if (lastUserIdx === -1) { alert('找不到上次的訊息，請重新輸入'); return; }
        const lastUserMsg = chatMessages[lastUserIdx];
        const textOnly = messageContentToString(lastUserMsg.content);
        // 復原圖片（如果有）
        if (Array.isArray(lastUserMsg.content)) {
            pendingImages = lastUserMsg.content
                .filter(p => p.type === 'image_url')
                .map(p => ({ dataUrl: p.image_url?.url || '', mime: 'image/jpeg', sizeKB: 0 }));
            renderPendingImages();
        }
        // 從 chatMessages 移除這條 user（handleSend 會再 push 一條新的）
        chatMessages.splice(lastUserIdx, 1);
        // 砍錯誤泡泡
        errBubble.remove();
        // 填回輸入框 + 重新發送
        const inputEl = document.getElementById('studio-input');
        if (inputEl) {
            inputEl.value = textOnly;
            handleSend();
        }
    }

    function renderChatHistory() {
        const container = document.getElementById('studio-chat-history');
        container.innerHTML = '';
        chatMessages.forEach((msg, idx) => {
            if (msg.role === 'system') return;
            // 已被壓縮的原始對話：不渲染（記憶在摘要泡泡裡）
            if (msg._isCompressed) return;
            // 摘要泡泡：特殊樣式渲染
            if (msg._isSummary) {
                const bubble = document.createElement('div');
                bubble.className = 'studio-bubble studio-summary-bubble';
                const headerText = `📌 摘要 #${msg._summaryNum}　·　壓縮了 ${msg._compressedCount} 條早期對話`;
                bubble.innerHTML = `
                    <div class="summary-header">${headerText}</div>
                    <div class="summary-content">${renderMarkdown(messageContentToString(msg.content))}</div>
                    <div class="summary-foot">↑ 此區為 AI 的長線記憶，會永久保留作為上下文。原始對話已從 context 移除（節省 token）。</div>
                `;
                container.appendChild(bubble);
                return;
            }
            if (msg.role === 'user') {
                const bubble = document.createElement('div');
                bubble.className = 'studio-bubble user';
                // 兼容 multimodal content（陣列）→ 文字 + 圖片縮圖一起渲染
                if (Array.isArray(msg.content)) {
                    const textPart = msg.content.filter(p => p && p.type === 'text').map(p => p.text || '').join('\n');
                    if (textPart) {
                        const span = document.createElement('div');
                        span.textContent = textPart;
                        bubble.appendChild(span);
                    }
                    const imgs = msg.content.filter(p => p && p.type === 'image_url');
                    if (imgs.length > 0) {
                        const row = document.createElement('div');
                        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;';
                        imgs.forEach(p => {
                            const im = document.createElement('img');
                            im.src = p.image_url?.url || '';
                            im.style.cssText = 'max-width:120px;max-height:120px;border-radius:6px;border:1px solid rgba(26,28,40,0.15);cursor:pointer;';
                            im.onclick = () => window.open(p.image_url?.url, '_blank');
                            row.appendChild(im);
                        });
                        bubble.appendChild(row);
                    }
                } else {
                    bubble.textContent = msg.content || '';
                }
                container.appendChild(bubble);
            } else {
                // AI 訊息：解析成多泡泡，歷史重建不帶入場動畫
                // lookahead 下一條 user 訊息：如果它是來自 choice 點擊（_fromChoice），把它的內容當作「已選 label」傳給 choices bubble
                let selectedLabel = null;
                for (let i = idx + 1; i < chatMessages.length; i++) {
                    const next = chatMessages[i];
                    if (next._isCompressed || next._isSummary || next.role === 'system') continue;
                    if (next.role === 'user') {
                        if (next._fromChoice) selectedLabel = messageContentToString(next.content);
                        break;
                    }
                    if (next.role === 'assistant') break;
                }
                parseSegments(messageContentToString(msg.content)).forEach(seg => {
                    container.appendChild(createSegmentBubble(seg, false, { selectedLabel }));
                });
            }
        });
        container.scrollTop = container.scrollHeight;
    }

    function extractLatestJsonFromHistory() {
        // 🥇 第一順位：找 [LATEST_PANEL_STATE] 標記訊息（diff 修改後存進的最新版本）
        for (let i = chatMessages.length - 1; i >= 0; i--) {
            const m = chatMessages[i];
            const text = messageContentToString(m.content);
            if (m._isLatestPanel === true || (typeof text === 'string' && text.includes(LATEST_PANEL_MARKER))) {
                if (extractAndParseJson(text)) {
                    console.log('[Studio] 🥇 從聊天記錄撈到「最新版」面板狀態');
                    return;
                }
            }
        }
        // 🥈 退回找最新的 assistant 訊息（通常只能撈到初版）
        for (let i = chatMessages.length - 1; i >= 0; i--) {
            if (chatMessages[i].role === 'assistant') {
                if (extractAndParseJson(messageContentToString(chatMessages[i].content))) {
                    console.warn('[Studio] 🥈 沒找到最新版標記，退回抽 assistant 訊息（可能是初版）');
                    return;
                }
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
                // 修復 AI 常見的非法跳脫：JSON 不允許 \`(反斜線+反引號)，但模型在面板 js 的模板字面裡塞「字面三反引號」時，
                // 為逸出反引號會寫 \`，轉成外層 JSON 卻忘了把反斜線再跳脫成 \\` → 整份 JSON.parse 直接 Bad escaped character。
                // 反引號在 JSON 本就不用跳脫；奇數個反斜線+反引號＝最後那個是誤escape→補一個反斜線(parse 後得到合法 JS 逸出反引號 \`)。
                cleanStr = cleanStr.replace(/(\\+)`/g, (m, s) => (s.length % 2 ? s + '\\' + '`' : m));
                const parsed = JSON.parse(cleanStr);

                // 🔪 VN 模式：保留 history（本地 metadata，AI 不該動到）
                if (currentMode === 'vn_ui' && currentParsedData && currentParsedData.history && !Array.isArray(parsed)) {
                    parsed.history = currentParsedData.history;
                }
                currentParsedData = parsed;

                activePreviewData = Array.isArray(currentParsedData) ? currentParsedData[0] : currentParsedData;

                renderPreviewPanel();
                return true;
            } catch (e) {
                console.warn('[Studio] JSON 解析失敗，這傢伙可能連括號都沒閉合：', e);
                return false;
            }
        }
        return false;
    }

    // ── st helper builder（給「預覽器」「展廳」兩處共用；酒館 wrapper 內另有一份） ──
    function _buildPreviewSt(lines) {
        const imgManager = window.OS_IMAGE_MANAGER || (window.parent && window.parent.OS_IMAGE_MANAGER);
        return {
            md(text) {
                if (!text) return '';
                try {
                    const P = window.parent, S = (P && P.showdown) || window.showdown;
                    if (S) {
                        const h = new S.Converter({ simpleLineBreaks: true, tables: true, strikethrough: true }).makeHtml(String(text));
                        const D = (P && P.DOMPurify) || window.DOMPurify;
                        return D ? D.sanitize(h) : h;
                    }
                } catch (e) {}
                return String(text)
                    .replace(new RegExp('[*][*](.+?)[*][*]', 'g'), (_, p1) => '<b>' + p1 + '</b>')
                    .replace(new RegExp('[*](.+?)[*]', 'g'), (_, p1) => '<i>' + p1 + '</i>')
                    .replace(new RegExp('[`](.+?)[`]', 'g'), (_, p1) => '<code>' + p1 + '</code>');
            },
            parse() {
                const result = {};
                (lines || []).forEach(line => {
                    line = String(line || '').trim().replace(/[｜]/g, '|').replace(/[［]/g, '[').replace(/[］]/g, ']');   // 容錯：全形分隔符/方括號→半形
                    if (line.charAt(0) !== '[' || line.charAt(line.length-1) !== ']') return;
                    const inner = line.slice(1, -1);
                    const parts = inner.split('|');
                    const tag = parts[0];
                    const fields = parts.slice(1);
                    if (!result[tag]) result[tag] = [];
                    result[tag].push(fields);
                });
                return result;
            },
            async setImage(el, prompt, type, provider) {
                if (!el || !prompt) return;
                type = type || 'scene';
                try {
                    const url = window.__IS_PREVIEW
                        ? ('https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(prompt))
                        : (imgManager ? await imgManager.generate(prompt, type, { provider: provider }) : '');
                    if (url) el.src = url;
                } catch(e) {
                    console.error('[preview] setImage 失敗:', e);
                }
            },
            async callAI(systemPrompt) {
                // 預覽不燒額度：給固定示範字串
                if (window.__IS_PREVIEW) {
                    return '（預覽模式示範回覆）這是 AI 生成的內容會出現的位置。';
                }
                try {
                    const OS = window.OS_API || (window.parent && window.parent.OS_API);
                    if (!OS || !OS.chat) throw new Error('OS_API 不可用');
                    const S = window.OS_SETTINGS || (window.parent && window.parent.OS_SETTINGS);
                    let cfg = (S && S.getConfig && S.getConfig()) || {};
                    // 同創作室主對話：夾住 maxTokens，避免 gemini/vertex「maxOutputTokens 超過上限」
                    cfg = Object.assign({}, cfg, { usePresetPrompts: false, enableThinking: false, maxTokens: Math.min(parseInt(cfg.maxTokens) || 8192, 32768) });
                    return await new Promise((res, rej) => {
                        OS.chat([{ role: 'system', content: String(systemPrompt || '') }], cfg, null,
                            t => res(typeof t === 'string' ? t : (t && t.message) || ''), rej,
                            { disableTyping: true });
                    });
                } catch (e) { console.error('[st.callAI]', e); return ''; }
            },
            remember() { /* 預覽不寫真實記憶 */ },
            getCurrentChars() {   // 當前聊天室出現過的角色 [{name,count}]，做角色選單用
                const R = window.VN_READER || (window.parent && window.parent.VN_READER);
                return (R && R.getCurrentChars) ? R.getCurrentChars() : Promise.resolve([]);
            },
            getStory(n) { try { const R = window.VN_READER || (window.parent && window.parent.VN_READER); return (R && R.getStory) ? R.getStory(n) : []; } catch (e) { return []; } },
            esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
            toast(msg, opts) {
                try {
                    opts = opts || {};
                    const d = document.createElement('div');
                    const bg = opts.color || (opts.type === 'error' ? 'rgba(180,60,60,0.95)' : 'rgba(28,28,38,0.92)');
                    d.textContent = String(msg == null ? '' : msg);
                    d.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);max-width:80%;background:' + bg + ';color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;line-height:1.4;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,0.25);opacity:0;transition:opacity .2s;pointer-events:none;text-align:center;';
                    document.body.appendChild(d);
                    requestAnimationFrame(() => { d.style.opacity = '1'; });
                    setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 250); }, opts.duration || 2000);
                } catch (e) {}
            },
            confirm(msg, opts) {
                return new Promise((res) => {
                    try {
                        opts = opts || {};
                        const ov = document.createElement('div');
                        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;';
                        const box = document.createElement('div');
                        box.style.cssText = 'background:#fff;color:#222;border-radius:14px;padding:18px;max-width:300px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,0.3);font-size:14px;line-height:1.5;';
                        const m = document.createElement('div'); m.textContent = String(msg == null ? '' : msg); m.style.cssText = 'margin-bottom:14px;white-space:pre-wrap;';
                        const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
                        const no = document.createElement('button'); no.textContent = opts.cancelText || '取消'; no.style.cssText = 'padding:8px 14px;border:1px solid rgba(0,0,0,0.2);background:#fff;color:#333;border-radius:8px;font-size:13px;cursor:pointer;';
                        const yes = document.createElement('button'); yes.textContent = opts.okText || '確定'; yes.style.cssText = 'padding:8px 14px;border:0;background:' + (opts.danger ? '#c0392b' : '#1A1C28') + ';color:#fff;border-radius:8px;font-size:13px;cursor:pointer;';
                        no.onclick = () => { ov.remove(); res(false); };
                        yes.onclick = () => { ov.remove(); res(true); };
                        ov.onclick = (e) => { if (e.target === ov) { ov.remove(); res(false); } };
                        row.appendChild(no); row.appendChild(yes); box.appendChild(m); box.appendChild(row); ov.appendChild(box); document.body.appendChild(ov);
                    } catch (e) { res(false); }
                });
            },
            loading(target, on, text) {
                try {
                    const host = (typeof target === 'string') ? document.querySelector(target) : (target || document.body);
                    if (!host) return;
                    if (on === false) { if (host.__stLoad) { host.__stLoad.remove(); host.__stLoad = null; } return; }
                    if (host.__stLoad) return;
                    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
                    const ov = document.createElement('div');
                    ov.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(0,0,0,0.25);z-index:50;';
                    const sp = document.createElement('div');
                    sp.style.cssText = 'width:28px;height:28px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:__stspin .8s linear infinite;';
                    ov.appendChild(sp);
                    if (text) { const t = document.createElement('div'); t.textContent = text; t.style.cssText = 'color:#fff;font-size:12px;'; ov.appendChild(t); }
                    if (!document.getElementById('__stspin_kf')) { const k = document.createElement('style'); k.id = '__stspin_kf'; k.textContent = '@keyframes __stspin{to{transform:rotate(360deg)}}'; document.head.appendChild(k); }
                    host.__stLoad = ov; host.appendChild(ov);
                } catch (e) {}
            },
            // 預覽用 localStorage stub（裝成 app 後由 app_runtime 的 window.saveData 接管真持久化）；scope 用 tplId 隔離
            saveData(k, v, scope) { try { localStorage.setItem('aurelia_studio_preview_' + (scope === 'chat' ? 'chat_' : '') + k, JSON.stringify(v)); } catch (e) {} },
            loadData(k, scope) { try { const s = localStorage.getItem('aurelia_studio_preview_' + (scope === 'chat' ? 'chat_' : '') + k); return s == null ? null : JSON.parse(s); } catch (e) { return null; } },
            async dbSave(k, v, scope) { try { const DB = window.OS_DB || (window.parent && window.parent.OS_DB); if (!DB || !DB.saveAppData) return false; return await DB.saveAppData('studio_preview', k, v, scope === 'chat' ? this.getChatId() : null); } catch (e) { return false; } },
            async dbLoad(k, scope) { try { const DB = window.OS_DB || (window.parent && window.parent.OS_DB); if (!DB || !DB.getAppData) return null; return await DB.getAppData('studio_preview', k, scope === 'chat' ? this.getChatId() : null); } catch (e) { return null; } },
            getChatId() { try { const ST = window.parent && window.parent.SillyTavern; if (ST && ST.getCurrentChatId) { const id = ST.getCurrentChatId(); if (id != null && id !== '') return String(id); } } catch (e) {} return ''; }
        };
    }

    // ── 展廳模板 → 手機 iframe HTML adapter ──────────────────────────
    // 把展廳模板包成可在手機 iframe 跑的完整 HTML
    // window.callAI / genImg / goBack 由手機 iframe 橋接（app_runtime.js mountAppIframe）注入
    function _templateToPhoneHtml(tpl) {
        var css  = String(tpl.css  || '');
        var html = String(tpl.html || '');
        var js   = String(tpl.js   || '');
        return '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8">'
            + '<style>html,body{margin:0;padding:0;height:100%;}#app-root{box-sizing:border-box;width:100%;min-height:100%;}'
            + css + '</style></head><body><div id="app-root">' + html + '</div>'
            + '<scr' + 'ipt>(function(){'
            + 'var container=document.getElementById("app-root");var lines=[];'
            + 'var st={'
            +   'md:function(t){if(!t)return "";try{var P=window.parent,S=(P&&P.showdown)||window.showdown;if(S){var h=new S.Converter({simpleLineBreaks:true,tables:true,strikethrough:true}).makeHtml(String(t));var D=(P&&P.DOMPurify)||window.DOMPurify;return D?D.sanitize(h):h;}}catch(e){}return String(t).replace(new RegExp("[*][*](.+?)[*][*]","g"),function(_,p){return "<b>"+p+"</b>";}).replace(new RegExp("[*](.+?)[*]","g"),function(_,p){return "<i>"+p+"</i>";}).replace(new RegExp("[`](.+?)[`]","g"),function(_,p){return "<code>"+p+"</code>";});},'
            +   'parse:function(){return {};},'
            +   'setImage:async function(el,p,type,provider){if(!el||!p)return;el.src="https://api.dicebear.com/7.x/shapes/svg?seed="+encodeURIComponent(p);try{if(window.genImg){var u=await window.genImg(p,type||"scene",provider);if(u)el.src=u;}}catch(e){}},'
            +   'callAI:async function(s){try{return window.callAI?await window.callAI(s):"";}catch(e){return "";}},'
            +   'remember:function(c,sp,t){try{if(window.remember)window.remember(c,sp,t);}catch(e){}},'
            +   'getCurrentChars:async function(){try{return window.getCurrentChars?await window.getCurrentChars():[];}catch(e){return [];}},'
            +   'getStory:function(n){try{return window.getStory?window.getStory(n):[];}catch(e){return [];}},'
            +   'esc:function(s){try{return window.stEsc?window.stEsc(s):String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}catch(e){return "";}},'
            +   'toast:function(m,o){try{if(window.stToast)window.stToast(m,o);}catch(e){}},'
            +   'confirm:function(m,o){try{return window.stConfirm?window.stConfirm(m,o):Promise.resolve(false);}catch(e){return Promise.resolve(false);}},'
            +   'loading:function(t,on,x){try{if(window.stLoading)window.stLoading(t,on,x);}catch(e){}},'
            +   'saveData:function(k,v,s){try{if(window.saveData)window.saveData(k,v,s);}catch(e){}},'
            +   'loadData:function(k,s){try{return window.loadData?window.loadData(k,s):null;}catch(e){return null;}},'
            +   'dbSave:function(k,v,s){try{return window.dbSave?window.dbSave(k,v,s):Promise.resolve(false);}catch(e){return Promise.resolve(false);}},'
            +   'dbLoad:function(k,s){try{return window.dbLoad?window.dbLoad(k,s):Promise.resolve(null);}catch(e){return Promise.resolve(null);}},'
            +   'getChatId:function(){try{return window.getChatId?window.getChatId():"";}catch(e){return "";}},'
            +   'toChat:function(t,o){try{return window.toChat?window.toChat(t,o):false;}catch(e){return false;}},'
            + '};'
            + 'var onComplete=function(){if(window.goBack)window.goBack();};'
            + '(async function(){try{' + js + '}catch(e){console.error("[phone tpl]",e);}})();'
            + '})();</' + 'scr' + 'ipt></body></html>';
    }

    // ── VN 展廳 ──────────────────────────────────────────────────────

    async function syncActiveTagsToLocal() {
        const db = win.OS_DB || window.OS_DB;
        if (!db || typeof db.getAllVNTagTemplates !== 'function') return;
        try {
            const templates = await db.getAllVNTagTemplates();
            const activeTags = templates.filter(t => t.isActive && t.demoFormat);
            const titleOf = t => (t.title && String(t.title).trim()) || t.tagId || '面板';
            // 單個組件的教學片段（中文標題＋使用說明＋正確 tag 格式）。區塊一律寫 <tagId>…</tagId>，
            //   demoFormat 可能自帶外殼 → 先剝再補一層，永遠剛好一層（防 <Bestiary> 開兩次）。
            const snippetOf = (t) => {
                if (t.isBlock) {
                    const df = String(t.demoFormat || '').trim()
                        .replace(new RegExp('^<' + t.tagId + '>\\s*', 'i'), '')
                        .replace(new RegExp('\\s*</' + t.tagId + '>$', 'i'), '').trim();
                    return `### ${titleOf(t)}\n使用說明: 💡 ${t.usageDesc || '無說明'}\n<${t.tagId}>\n${df}\n</${t.tagId}>\n`;
                }
                return `### ${titleOf(t)}\n使用說明: 💡 ${t.usageDesc || '無說明'}\n${t.demoFormat}\n`;
            };
            // 注入方式：injectMode==='keyword' 且有關鍵字 → 關鍵字觸發（注入器每輪比對命中才注）；其餘 → 常駐（每輪都注）。
            const isKw = t => t.injectMode === 'keyword' && Array.isArray(t.keywords) && t.keywords.filter(Boolean).length > 0;
            const constants = activeTags.filter(t => !isKw(t));
            const keywords  = activeTags.filter(t => isKw(t));

            // 常駐 blob → os_vn_extra_tags_prompt（酒館 injectVnTags + PWA os_prompts 兩條都讀）
            if (!constants.length) {
                localStorage.removeItem('os_vn_extra_tags_prompt');
            } else {
                const cS = constants.filter(t => !t.isBlock), cB = constants.filter(t => t.isBlock);
                let p = `# [📱模式｜VN組件] 清單\n使用場景: 可在正文內穿插的特殊 TAG。依下列格式填寫，{…} 佔位符換成實際內容、不可照抄佔位符字面。\n`;
                if (cS.length) { p += `\n## 單行標籤格式（直接穿插在對話內，無須換行）\n`; cS.forEach(t => { p += `\n${snippetOf(t)}`; }); }
                if (cB.length) { p += `\n## 區塊標籤格式（整段獨立輸出，與 <content> 並列；只在區塊內穿插，不可掉出區塊）\n`; cB.forEach(t => { p += `\n${snippetOf(t)}`; }); }
                localStorage.setItem('os_vn_extra_tags_prompt', p);
            }

            // 關鍵字組件 → 結構化存 os_vn_tags_keyword（注入器每輪抓最近正文+使用者輸入、命中才注入這幾個，省 token）
            if (!keywords.length) {
                localStorage.removeItem('os_vn_tags_keyword');
            } else {
                const arr = keywords.map(t => ({ tagId: t.tagId, isBlock: !!t.isBlock, keywords: t.keywords.filter(Boolean), snippet: snippetOf(t) }));
                localStorage.setItem('os_vn_tags_keyword', JSON.stringify(arr));
            }
        } catch(e) { console.warn('[Studio] syncActiveTagsToLocal 失敗', e); }
    }
    // 暴露成全域，讓 vn_ui_workshop 的舊版同名函式委派過來（統一走這份「常駐/關鍵字」拆分邏輯）
    try { win.__AURELIA_SYNC_VN_TAGS = syncActiveTagsToLocal; } catch (e) {}

    // ============================================================
    // === 注入酒館正則 + 主世界書（從 vn_ui_workshop.js 搬過來整合）===
    // 把展廳中的 VN UI 面板一鍵寫入酒館全局正則 + 折疊進主世界書當綠燈觸發
    // ============================================================
    function generateRegexReplacement(data) {
        if (!data || !data.tagId) return '';
        const safeTagId = data.tagId.replace(/[^a-zA-Z0-9_-]/g, '');
        let htmlContent = (data.html || '').replace(/\{\{(\d+)\}\}/g, '$$$$$1');

        // 完整 HTML 結構（DOCTYPE + html + head + body）— srcdoc 才能正確走 standards mode
        let fullHtml = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<style>\n${data.css || ''}\n</style>\n</head>\n<body>\n`;
        // 容器不寫 hardcoded id —— 多實例時 id 會撞，document.getElementById 抓錯
        fullHtml += `<div class="vn-dynamic-panel-${safeTagId}">\n${htmlContent}\n</div>\n`;

        if (data.js) {
            let safeJs = data.js.trim().replace(/^\x60\x60\x60(?:javascript|js|html|css)?\s*/i, '').replace(/\s*\x60\x60\x60\s*$/, '').trim();
            const safeJsForPlainScript = safeJs.replace(/<\/script>/gi, '<\\/script>');
            // 兄弟節點順序：<div>(container) ← <textarea>(rawtext) ← <script type=text/plain>(userJs) ← <script>(執行端)
            // 執行端用 document.currentScript.previousElementSibling 鏈式找上層 — 完全廢棄 id 機制
            fullHtml += `\n<textarea style="display:none;">$1</textarea>\n`;
            fullHtml += `<script type="text/plain">${safeJsForPlainScript}</script>\n`;
            fullHtml += `<script>
(async function(){
  try {
    const _script = document.currentScript;
    const userJsEl = _script ? _script.previousElementSibling : null;
    const rawTextEl = userJsEl ? userJsEl.previousElementSibling : null;
    const container = rawTextEl ? rawTextEl.previousElementSibling : null;
    if (!container) { console.error('[${safeTagId}] 找不到 DOM 容器'); return; }
    const ctx = window.parent || window;
    const imgManager = ctx.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER;
    const rawText = rawTextEl ? rawTextEl.value : '';
    const lines = rawText.split('\\n').map(function(l){return l.trim();}).filter(Boolean);
    let __userJs = userJsEl ? userJsEl.textContent : '';
    __userJs = __userJs.replace(/[\\u2028\\u2029]/g, '\\n');
    window.__IS_PREVIEW = false;
    // ===== st helper：AI 寫面板只用這個 API，免疫所有出錯雷區 =====
    const st = {
      md: function(text){
        if (!text) return '';
        var rxBold = new RegExp('[*][*](.+?)[*][*]', 'g');
        var rxItalic = new RegExp('[*](.+?)[*]', 'g');
        var rxCode = new RegExp('[\`](.+?)[\`]', 'g');
        return String(text)
          .replace(rxBold, function(_, p1){ return '<b>' + p1 + '</b>'; })
          .replace(rxItalic, function(_, p1){ return '<i>' + p1 + '</i>'; })
          .replace(rxCode, function(_, p1){ return '<code>' + p1 + '</code>'; });
      },
      parse: function(){
        var result = {};
        lines.forEach(function(line){
          line = String(line || '').trim().replace(/[｜]/g, '|').replace(/[［]/g, '[').replace(/[］]/g, ']');
          if (line.charAt(0) !== '[' || line.charAt(line.length-1) !== ']') return;
          var inner = line.slice(1, -1);
          var parts = inner.split('|');
          var tag = parts[0];
          var fields = parts.slice(1);
          if (!result[tag]) result[tag] = [];
          result[tag].push(fields);
        });
        return result;
      },
      setImage: async function(el, prompt, type, provider){
        if (!el || !prompt) return;
        type = type || 'scene';
        var ph = 'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(prompt);
        el.src = ph;   // 先放佔位（不破圖），成功再換真圖
        if (window.__IS_PREVIEW) return;
        try {
          var url = imgManager ? await imgManager.generate(prompt, type, { provider: provider }) : '';
          if (url) el.src = url;
        } catch(e) {
          console.error('[${safeTagId}] setImage 失敗(保留佔位):', e);
        }
      },
      getCurrentChars: function(){
        var R = window.VN_READER || (window.parent && window.parent.VN_READER);
        return (R && R.getCurrentChars) ? R.getCurrentChars() : Promise.resolve([]);
      },
      saveData: function(k, v){ try { if (window.saveData) window.saveData(k, v); } catch(e){} },
      loadData: function(k){ try { return window.loadData ? window.loadData(k) : null; } catch(e){ return null; } }
    };
    // ============================================================
    const __onComplete = function(){};
    try {
      const __fn = new Function('container', 'lines', 'onComplete', 'st', __userJs);
      __fn(container, lines, __onComplete, st);
    } catch(jsErr) {
      console.error('[${safeTagId}] JS 執行錯誤:', jsErr.message);
      console.error('[${safeTagId}] JS stack:', jsErr.stack);
      const errBox = document.createElement('div');
      errBox.style.cssText = 'color:#fc8181;padding:10px;background:rgba(252,129,129,0.1);border:1px dashed #fc8181;border-radius:6px;margin:10px;font-size:12px;font-family:monospace;';
      errBox.textContent = '⚠️ 面板腳本錯誤: ' + jsErr.message + '\\n（HTML 還是會顯示，但動態效果失效）';
      container.appendChild(errBox);
    }
  } catch(e) {
    console.error('${safeTagId} 外層錯誤:', e);
  }
})();
</script>
`;
        }
        fullHtml += `</body>\n</html>`;
        return "```\n" + fullHtml + "\n```";
    }

    // 把標籤說明折疊進主世界書，吃綠燈關鍵字觸發（省 token）
    async function syncPromptToWorldbook(th, data) {
        if (typeof th.getCharWorldbookNames !== 'function') return false;

        const charWbInfo = th.getCharWorldbookNames('current');
        const primaryWb = charWbInfo?.primary;
        if (!primaryWb) return false;

        const safeTagId = (data.tagId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeTagId) return false;
        const ENTRY_NAME = `[VN面板] ${safeTagId}`;

        // 暴力扒掉 demoFormat 外層標籤
        let cleanFormat = (data.demoFormat || '').trim();
        const regStart = new RegExp(`^<${data.tagId}>\\s*`, 'i');
        const regEnd = new RegExp(`\\s*<\\/${data.tagId}>$`, 'i');
        cleanFormat = cleanFormat.replace(regStart, '').replace(regEnd, '').trim();

        // 關鍵字保底：AI 沒給就拿 tagId 當唯一 key
        let keywords = Array.isArray(data.keywords)
            ? data.keywords.filter(k => typeof k === 'string' && k.trim()).map(k => k.trim())
            : [];
        if (keywords.length === 0) keywords = [safeTagId];
        if (!keywords.includes(safeTagId)) keywords.unshift(safeTagId);

        const content = `### [動態特效標籤：${data.tagId}]
劇情提到相關情境時，請輸出此標籤強化視覺效果：

【標籤：${data.tagId}】
說明：${data.usageDesc || '無'}
格式示範：
<${data.tagId}>
${cleanFormat}
</${data.tagId}>`;

        let entries = [];
        try {
            entries = await th.getWorldbook(primaryWb);
        } catch (e) {
            console.error('[Studio] 讀取主世界書失敗:', e);
            return false;
        }

        const exists = entries.some(e => e.name === ENTRY_NAME);
        if (exists) {
            await th.updateWorldbookWith(primaryWb, (wbEntries) => {
                const entry = wbEntries.find(e => e.name === ENTRY_NAME);
                if (entry) {
                    entry.enabled = true;
                    entry.content = content;
                    entry.strategy = { type: 'selective', keys: keywords };
                }
                return wbEntries;
            });
        } else {
            await th.createWorldbookEntries(primaryWb, [{
                name: ENTRY_NAME,
                enabled: true,
                content: content,
                strategy: { type: 'selective', keys: keywords },
                position: { type: 'before_author_note', order: -5 }
            }]);
        }
        return true;
    }

    // 一鍵寫入酒館全局正則 + 同步至主世界書
    async function importToSillyTavern(data) {
        const th = win.TavernHelper || (window.parent && window.parent.TavernHelper);
        if (!th) {
            alert('❌ 找不到酒館（TavernHelper）。需要在酒館環境內 + 已安裝酒館助手腳本才能用這個功能。\n\nPWA 獨立模式不支援此功能。');
            return;
        }

        if (!data || !data.tagId) return;

        const safeTagId = data.tagId.replace(/[^a-zA-Z0-9_-]/g, '');
        // 向下兼容：開合標籤角括號 <XXX></XXX> 或方括號 [XXX][/XXX] 都收（AI 常被其他 tag 帶歪吐方括號）。
        // 用字元類 [<\[] / [>\]] 保持單一 capture group（$1=內容），渲染替換邏輯零影響。
        const searchRegex = `/[<\\[]${safeTagId}[>\\]]([\\s\\S]*?)[<\\[]\\/${safeTagId}[>\\]]/gi`;
        const replacement = generateRegexReplacement(data);

        const regexObj = {
            id: th.uuidv4 ? th.uuidv4() : ('vn_tag_' + Date.now()),
            script_name: `[VN面板] ${safeTagId}`,
            enabled: true,
            find_regex: searchRegex,
            replace_string: replacement,
            trim_strings: [],
            source: { user_input: false, ai_output: true, slash_command: false, world_info: false },
            destination: { display: true, prompt: false },
            run_on_edit: true,
            min_depth: null,
            max_depth: null,
            markdownOnly: true,
            promptOnly: false,
            substituteRegex: 0
        };

        try {
            await th.updateTavernRegexesWith(regexes => {
                const filtered = regexes.filter(r => r.script_name !== regexObj.script_name);
                filtered.push(regexObj);
                return filtered;
            }, { type: 'global' });

            let wbMsg = "";
            try {
                const wbSynced = await syncPromptToWorldbook(th, data);
                if (wbSynced) {
                    const keywordHint = Array.isArray(data.keywords) && data.keywords.length
                        ? `\n   觸發關鍵字：${data.keywords.join('、')}`
                        : `\n   觸發關鍵字：${safeTagId}（AI 沒給 keywords，預設只用 tagId）`;
                    wbMsg = `\n✅ 已折疊至角色主世界書（綠燈觸發，劇情提到關鍵字才激活，省 token）${keywordHint}`;
                } else {
                    wbMsg = "\n⚠️ 未找到角色綁定的主世界書，跳過提示詞同步。";
                }
            } catch (e) {
                console.error('[Studio] 世界書同步錯誤:', e);
                wbMsg = "\n❌ 同步主世界書失敗。";
            }

            alert(`🎉 匯入成功！已將標籤 [${safeTagId}] 寫入酒館全局正則。${wbMsg}\n\n請發送新訊息或重新載入聊天查看效果。`);
        } catch (err) {
            console.error('[Studio] 酒館正則匯入失敗:', err);
            alert('❌ 匯入失敗: ' + err.message);
        }
    }

    // 刪除 VN 組件時，連「注入酒館」留下的殘留一起清：全域正則 [VN面板]<tagId> + 角色主世界書同名條目。
    // （沒注入過酒館就無事；沒 TavernHelper／PWA 也安靜跳過。）解「刪了組件、酒館裡舊面板還在」的孤兒。
    async function _removeTavernPanelArtifacts(tagId) {
        const th = win.TavernHelper || (window.parent && window.parent.TavernHelper);
        if (!th) return;
        const safeTagId = String(tagId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeTagId) return;
        const sn = `[VN面板] ${safeTagId}`;
        try {
            if (th.updateTavernRegexesWith) {
                await th.updateTavernRegexesWith(rx => (rx || []).filter(r => r && r.script_name !== sn), { type: 'global' });
            }
        } catch (e) { console.warn('[Studio] 清酒館正則殘留失敗', e); }
        try {
            const wbInfo = th.getCharWorldbookNames ? th.getCharWorldbookNames('current') : null;
            const wb = wbInfo && wbInfo.primary;
            if (wb && th.getWorldbook && th.deleteLorebookEntries) {
                const ents = await th.getWorldbook(wb);
                const hit = (ents || []).filter(e => e && e.name === sn);
                if (hit.length) await th.deleteLorebookEntries(wb, hit.map(e => e.uid));
            }
        } catch (e) { console.warn('[Studio] 清主世界書條目殘留失敗', e); }
    }

    // 刪除 VN 組件時，連它對應的手機 app（srcTplId 反查）＋ app 的四桶資料一起清。
    // 共用＝一個東西：從展廳刪＝整個面板移除（app 那側也清乾淨，不留我的應用孤兒）。
    async function _purgeLinkedPhoneApp(tplId) {
        try {
            const apps = (win.OS_DB && win.OS_DB.getAllPhoneApps) ? (await win.OS_DB.getAllPhoneApps()) : [];
            const rec = (apps || []).find(a => a && a.srcTplId === tplId);
            if (!rec) return;
            const aid = rec.id;
            try { if (win.OS_DB.deletePhoneApp) await win.OS_DB.deletePhoneApp(aid); } catch (e) {}
            try { if (win.OS_DB.deleteAppDataByApp) await win.OS_DB.deleteAppDataByApp(aid); } catch (e) {}
            try { if (win.OS_DB.deleteAppMemoryByApp) await win.OS_DB.deleteAppMemoryByApp(aid); } catch (e) {}
            try { if (win.VoidPhoneShell && win.VoidPhoneShell.removeApp) win.VoidPhoneShell.removeApp(aid); } catch (e) {}
            try {
                const pre = 'aurelia_appdata_' + aid + '_';
                const kill = [];
                for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(pre) === 0) kill.push(k); }
                kill.forEach(k => localStorage.removeItem(k));
                localStorage.removeItem('os_app_mem_plugin_' + aid);
                const L = JSON.parse(localStorage.getItem('aurelia_phone_apps') || '[]') || [];
                localStorage.setItem('aurelia_phone_apps', JSON.stringify(L.filter(m => m && m.id !== aid)));
            } catch (e) {}
        } catch (e) { console.warn('[Studio] 清連結手機 app 失敗', e); }
    }

    // ============================================================
    // === 📝 直接編輯原碼 modal（給進階用戶繞過 AI 對話改 tpl JSON）===
    // ============================================================
    let _rawEditingTplId = null;
    let _rawEditingOriginal = null;

    function openRawEditModal(tpl) {
        const modal = document.getElementById('studio-raw-edit-modal');
        const textarea = document.getElementById('raw-edit-textarea');
        const tagIdEl = document.getElementById('raw-edit-tagid');
        const statusEl = document.getElementById('raw-edit-status');
        if (!modal || !textarea) return;

        _rawEditingTplId = tpl.id;
        _rawEditingOriginal = JSON.stringify(tpl, null, 2);

        if (tagIdEl) tagIdEl.textContent = tpl.tagId || tpl.id;
        textarea.value = _rawEditingOriginal;
        if (statusEl) statusEl.textContent = '';
        modal.style.display = 'flex';
        // 點空白關閉
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }

    function _setupRawEditModalEvents() {
        const modal = document.getElementById('studio-raw-edit-modal');
        if (!modal) return;
        const textarea = document.getElementById('raw-edit-textarea');
        const statusEl = document.getElementById('raw-edit-status');
        const saveBtn = document.getElementById('raw-edit-save');
        const resetBtn = document.getElementById('raw-edit-reset');
        const cancelBtn = document.getElementById('raw-edit-cancel');
        const closeBtn = document.getElementById('raw-edit-close');

        if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };
        if (cancelBtn) cancelBtn.onclick = () => { modal.style.display = 'none'; };
        if (resetBtn) resetBtn.onclick = () => {
            if (textarea && _rawEditingOriginal) {
                textarea.value = _rawEditingOriginal;
                if (statusEl) statusEl.textContent = '↺ 已重置為原本內容（尚未儲存）';
            }
        };
        if (saveBtn) saveBtn.onclick = async () => {
            if (!textarea || !_rawEditingTplId) return;
            let parsed;
            try {
                parsed = JSON.parse(textarea.value);
            } catch(e) {
                if (statusEl) statusEl.textContent = '❌ JSON 格式錯誤：' + e.message;
                return;
            }
            if (!parsed.tagId) {
                if (statusEl) statusEl.textContent = '❌ 缺少 tagId 欄位';
                return;
            }
            // 保留原本 id（避免改 id 製造孤兒）
            parsed.id = _rawEditingTplId;
            try {
                await win.OS_DB.saveVNTagTemplate(parsed);
                if (typeof syncActiveTagsToLocal === 'function') await syncActiveTagsToLocal();
                if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
                if (statusEl) statusEl.textContent = '✅ 已儲存';
                setTimeout(() => {
                    modal.style.display = 'none';
                    loadStudioGallery();
                }, 600);
            } catch(e) {
                if (statusEl) statusEl.textContent = '❌ 儲存失敗：' + e.message;
            }
        };
    }

    // 把一個「應用/共用」模板裝成手機 app（進「應用工坊·我的應用」+ 桌面圖標）。
    // 以 srcTplId 去重：已裝過就更新內容(編輯後重存會更新)，沒裝過才新增。回傳 app id。
    async function _installTemplateAsPhoneApp(tpl) {
        if (!tpl || !(win.OS_DB && win.OS_DB.savePhoneApp)) return null;
        try {
            let apps = [];
            try { apps = (win.OS_DB.getAllPhoneApps ? (await win.OS_DB.getAllPhoneApps()) : []) || []; } catch (e) {}
            const existing = apps.find(a => a && a.srcTplId === tpl.id);
            const rec = existing
                ? { ...existing }
                : { name: tpl.tagId || '面板', emoji: '🧩', iconUrl: '', source: 'studio', srcTplId: tpl.id };
            rec.html = _templateToPhoneHtml(tpl);   // 內容一律更新（編輯後重存即同步）
            const newId = await win.OS_DB.savePhoneApp(rec);
            try {
                if (win.VoidPhoneShell && win.VoidPhoneShell.addApp) {
                    win.VoidPhoneShell.addApp({ id: newId, name: rec.name, emoji: rec.emoji, iconUrl: rec.iconUrl || '' });
                }
            } catch (e) {}
            return newId;
        } catch (e) { console.warn('[studio] 裝成手機 app 失敗', e); return null; }
    }

    // 把一個模板載回創作室「編輯模式」（VN組件「繼續編輯」 + 我的應用「✏️編輯」共用）
    function _enterEditMode(tpl) {
        try { currentMode = 'vn_ui'; } catch (e) {}
        currentParsedData = JSON.parse(JSON.stringify(tpl));
        activePreviewData = currentParsedData;
        const chatId = getChatSessionId();
        chatMessages = [{ role: 'system', content: MODES[currentMode].prompt }];
        chatMessages.push({
            role: 'assistant',
            content: `📋 已載入面板 [${tpl.tagId || '未命名'}] 進入編輯模式。\n\n告訴我要改什麼（例如「字改紅色」、「按鈕加大」、「背景深一點」），我會用最小幅度修改。\n要整個換風格也行——直接描述新風格、發送就會自動整包重做，不用按任何按鈕、不用重發。`
        });
        _studioSave(chatId);
        document.querySelectorAll('.studio-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.studio-tab[data-tab="preview"]')?.classList.add('active');
        const _pc = document.getElementById('studio-preview-content'); if (_pc) _pc.style.display = 'flex';
        const _sc = document.getElementById('studio-source-content'); if (_sc) _sc.style.display = 'none';
        const _gc = document.getElementById('studio-gallery-content'); if (_gc) _gc.style.display = 'none';
        const _aa = document.querySelector('.studio-action-area'); if (_aa) _aa.style.display = 'flex';   // 編輯模式進預覽 → 顯示確定創建 footer
        renderChatHistory();
        renderPreviewPanel();
    }

    // 依 id 撈回模板（給 OS_STUDIO 對外方法用：我的應用的按鈕靠 srcTplId 找底稿）
    async function _getTplById(id) {
        try {
            const tpls = (win.OS_DB && win.OS_DB.getAllVNTagTemplates) ? (await win.OS_DB.getAllVNTagTemplates()) : [];
            return (tpls || []).find(t => t && t.id === id) || null;
        } catch (e) { return null; }
    }

    // 預覽啟動（第一層瀏覽縮圖 + 第二層詳情卡共用）：三尺寸縮放器 + 跑面板 JS
    function _activatePreview(card, tpl, safeTagId) {
        _attachVpScaler(card.querySelector('.studio-pv-tabs'), card.querySelector('.sgc-preview'), card.querySelector('.studio-pv-box'));
        if (tpl.isBlock && tpl.js) {
            setTimeout(() => {
                try {
                    const lines = (tpl.demoFormat || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('<') && !/^\[\/?[a-zA-Z0-9_-]+\]$/.test(l));   // 濾掉 <Tag> 與 [Tag]/[/Tag] 外框、留 [Result|…] 內容行
                    const container = card.querySelector(`.vn-dynamic-panel-${safeTagId}`);
                    if (!container) return;
                    let safeJs = tpl.js.trim().replace(/^```(?:javascript|js|html|css)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
                    window.__IS_PREVIEW = true;
                    const st = _buildPreviewSt(lines);
                    new Function('container', 'lines', 'onComplete', 'st', safeJs)(container, lines, () => {}, st);
                } catch (e) { console.warn(`[展廳 JS] ${tpl.tagId}`, e); }
            }, 80);
        }
    }

    // ════════════════════════════════════════════════════════════════
    // VN 組件：四頁換頁路由（browse / detail / settings / package）
    //   照世界書 _wbView 模式：單一 renderVnComponents() 依 _vcView 分派；
    //   子頁頂部用世界書同款 .swb-bar + #vc-back 返回列。
    //   群組資料模型沿用 vn_component_groups + tpl.groupIds[]，只換成標籤 chip 篩選。
    //   spec: docs/superpowers/specs/2026-06-23-vn-components-redesign-design.md
    // ════════════════════════════════════════════════════════════════
    let _vcView = 'browse';        // browse | detail | settings | package
    let _vcTpl = null;             // 詳情/設置頁正在看的組件
    let _vcFilterGid = 'all';      // 標籤篩選的群組 id（'all'=全部）
    let _vcSearch = '';            // 搜尋字串
    let _vcBrowseScroll = 0;       // 進子頁前的瀏覽捲動位置
    let _vcAllPhoneApps = [];      // 裝手機狀態快取
    const _vcPackSel = new Set();  // 打包頁勾選的 tplId
    // 容器解耦：同一套四頁 UI 可掛在「創作室 VN組件 tab」或「獨立 VN組件區」(工坊進來的浮層)
    let _vcCtx = null;             // { list, content, toolbar } 三個容器元素
    let _vcStandalone = false;     // true=獨立區(瀏覽層自帶返回列；只有「繼續編輯」才橋接創作室)
    let _vcExit = null;            // 獨立區瀏覽層返回 → 關掉浮層
    let _vcStandaloneRoot = null;  // 獨立浮層掛載的根容器（繼續編輯時拿來開創作室）

    function loadStudioGallery() {
        _vcStandalone = false; _vcExit = null; _vcStandaloneRoot = null;
        _vcCtx = {
            list: document.getElementById('studio-gallery-list'),
            content: document.getElementById('studio-gallery-content'),
            toolbar: document.getElementById('studio-gallery-toolbar'),
        };
        _vcView = 'browse'; return renderVnComponents();
    }

    // 獨立 VN組件區：工坊「VN組件清單」卡進來，掛成覆蓋層；除了「繼續編輯」其餘全留在這、不碰創作室
    function openVnComponents(rootContainer) {
        const root = rootContainer || document.getElementById('aps-app-body') || document.body;
        const oldOv = root.querySelector(':scope > .vncomp-app'); if (oldOv) oldOv.remove();
        const ov = document.createElement('div');
        ov.className = 'vncomp-app';
        // 定位＋暖色變數寫進元素本身(跟 #os_studio_app 同作法)：保證蓋滿覆蓋層、不靠 os_studio.css 是否載到新版
        // (曾踩坑：jsdelivr 對 js/css 分開快取→js 新但 css 舊時 .vncomp-app 規則缺失→變流式區塊接在 VN組件 tab 下面)
        ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:9000;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;background:#f5ead3;color:#3c2922;'
            + '--jrpg-paper:#f5ead3;--jrpg-paper-light:#fff9eb;--jrpg-paper-deep:#e7d1a9;--jrpg-ink:#3c2922;--jrpg-muted:#7b6654;--jrpg-wine:#681f25;--jrpg-wine-dark:#461319;--jrpg-gold:#b68a45;--jrpg-gold-light:#ddbd78;--jrpg-line:rgba(132,91,45,0.34);';
        ov.innerHTML = '<div class="vncomp-scroll" style="flex:1;min-height:0;overflow-y:auto;padding:14px 14px 24px;box-sizing:border-box;"><div class="vncomp-toolbar vc-hide"><input type="file" class="vncomp-pack-file" accept=".json" hidden></div><div class="vncomp-list" style="display:flex;flex-direction:column;gap:10px;"></div></div>';
        root.appendChild(ov);
        _vcStandalone = true;
        _vcStandaloneRoot = root;
        _vcExit = () => { try { ov.remove(); } catch (e) {} };
        _vcCtx = {
            list: ov.querySelector('.vncomp-list'),
            content: ov.querySelector('.vncomp-scroll'),
            toolbar: ov.querySelector('.vncomp-toolbar'),
        };
        _vcView = 'browse'; _vcBrowseScroll = 0;
        renderVnComponents();
    }

    function renderVnComponents() {
        const listEl = _vcCtx && _vcCtx.list;
        if (!listEl) return;
        if (_vcCtx.toolbar) _vcCtx.toolbar.classList.toggle('vc-hide', _vcView !== 'browse');   // 頂部工具列只在瀏覽層顯示
        if (_vcView === 'detail')   return _vcRenderDetail(listEl);
        if (_vcView === 'settings') return _vcRenderSettings(listEl);
        if (_vcView === 'package')  return _vcRenderPackage(listEl);
        return _vcRenderBrowse(listEl);
    }

    // ── lazy 縮圖：捲到才渲染一個縮小版預覽（含面板 JS），渲不出退回 icon ──
    function _vcThumbBox(tpl, safeTagId) {
        const box = document.createElement('div');
        box.className = 'vc-thumb';
        box.setAttribute('data-thumb', '1');
        box.innerHTML = '<span class="vc-thumb-ph"><i class="fa-solid fa-puzzle-piece"></i></span>';
        box._tpl = tpl; box._safeTagId = safeTagId;
        return box;
    }
    function _vcObserveThumbs(root) {
        const cards = root.querySelectorAll('[data-thumb]');
        if (!('IntersectionObserver' in window)) { cards.forEach(_vcRenderThumb); return; }
        const io = new IntersectionObserver((ents) => {
            ents.forEach(en => { if (en.isIntersecting) { _vcRenderThumb(en.target); io.unobserve(en.target); } });
        }, { rootMargin: '160px' });
        cards.forEach(c => io.observe(c));
    }
    function _vcRenderThumb(box) {
        if (box._thumbDone) return; box._thumbDone = true;
        const tpl = box._tpl, safeTagId = box._safeTagId;
        if (!tpl || !tpl.html) return;
        const inner = document.createElement('div');
        inner.className = 'vc-thumb-render';
        inner.innerHTML = (tpl.css ? `<style>${tpl.css}</style>` : '')
            + `<div class="vn-dynamic-panel-${safeTagId}">${(tpl.html || '').replace(/\{\{1\}\}/g, 'A').replace(/\{\{2\}\}/g, 'B')}</div>`;
        box.innerHTML = ''; box.appendChild(inner);
        if (tpl.isBlock && tpl.js) {
            setTimeout(() => {
                try {
                    const lines = (tpl.demoFormat || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('<') && !/^\[\/?[a-zA-Z0-9_-]+\]$/.test(l));   // 濾掉 <Tag> 與 [Tag]/[/Tag] 外框、留 [Result|…] 內容行
                    const cont = inner.querySelector(`.vn-dynamic-panel-${safeTagId}`); if (!cont) return;
                    let safeJs = tpl.js.trim().replace(/^```(?:javascript|js|html|css)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
                    window.__IS_PREVIEW = true;
                    new Function('container', 'lines', 'onComplete', 'st', safeJs)(cont, lines, () => {}, _buildPreviewSt(lines));
                } catch (e) {}
            }, 30);
        }
    }

    // ── ① 瀏覽層：標籤篩選 + 批次開關 + 平鋪輕卡（不折疊）+ 選擇並打包 ──
    async function _vcRenderBrowse(listEl) {
        const db = win.OS_DB || window.OS_DB;
        if (!db || typeof db.getAllVNTagTemplates !== 'function') { listEl.innerHTML = '<div class="vc-empty">找不到 OS_DB</div>'; return; }
        _wireVnUiPackButtons();
        listEl.innerHTML = '<div class="vc-empty">載入中…</div>';
        let templates = [], _allVn = [];
        try { _allVn = await db.getAllVNTagTemplates(); templates = _allVn.filter(t => t && t.panelType !== '純應用'); }
        catch (e) { listEl.innerHTML = `<div class="vc-empty">載入失敗：${_sgcEsc(e.message)}</div>`; return; }
        _vcAllPhoneApps = db.getAllPhoneApps ? ((await db.getAllPhoneApps()) || []) : [];
        const groups = _loadGroups();
        const validIds = new Set(groups.map(g => g.id));
        const nameMap = {}; groups.forEach(g => nameMap[g.id] = g.name);
        if (_vcFilterGid !== 'all' && !validIds.has(_vcFilterGid)) _vcFilterGid = 'all';   // 篩選的群組被刪了→退回全部

        listEl.innerHTML = '';

        // 獨立區：瀏覽層自帶返回列（創作室 tab 模式不需要、靠 tab 切換）
        if (_vcStandalone) {
            const bar = document.createElement('div');
            bar.className = 'swb-bar';
            bar.innerHTML = '<button class="swb-iconbtn" id="vc-exit" type="button"><i class="fa-solid fa-chevron-left"></i></button><div class="swb-bar-title">VN 組件</div><button class="swb-iconbtn" id="vc-import" type="button" title="匯入包"><i class="fa-solid fa-file-import"></i></button>';
            bar.querySelector('#vc-exit').onclick = () => { if (_vcExit) _vcExit(); };
            const _fi = _vcCtx.toolbar && _vcCtx.toolbar.querySelector('.vncomp-pack-file');
            bar.querySelector('#vc-import').onclick = () => { if (_fi) _fi.click(); };
            if (_fi && !_fi._wired) { _fi._wired = 1; _fi.onchange = (e) => { const f = e.target.files && e.target.files[0]; if (f) importVnUiPack(f); e.target.value = ''; }; }
            listEl.appendChild(bar);
        }

        // 標籤 chip 列（全部 + 各群組 + ＋群組）
        const tagbar = document.createElement('div');
        tagbar.className = 'vc-tagbar';
        const chip = (label, gid, on) => `<button class="vc-chip${on ? ' on' : ''}" type="button" data-gid="${_sgcEsc(gid)}">${_sgcEsc(label)}</button>`;
        tagbar.innerHTML = chip('全部', 'all', _vcFilterGid === 'all')
            + groups.map(g => chip(g.name, g.id, _vcFilterGid === g.id)).join('')
            + '<button class="vc-chip vc-chip-add" type="button" data-newgroup="1"><i class="fa-solid fa-plus"></i> 群組</button>';
        tagbar.querySelectorAll('[data-gid]').forEach(b => b.onclick = () => { _vcFilterGid = b.getAttribute('data-gid'); _vcBrowseScroll = 0; renderVnComponents(); });
        tagbar.querySelector('[data-newgroup]').onclick = () => _createGroup();
        listEl.appendChild(tagbar);

        // 搜尋框
        const search = document.createElement('div');
        search.className = 'vc-search';
        search.innerHTML = '<span class="vc-search-ico"><i class="fa-solid fa-magnifying-glass"></i></span><input class="vc-search-input" type="text" placeholder="搜尋組件…">';
        const si = search.querySelector('.vc-search-input'); si.value = _vcSearch;
        si.oninput = () => { _vcSearch = si.value; _vcApplyBrowseFilter(listEl); };
        listEl.appendChild(search);

        // 批次開關條（選了某群組才出現）
        if (_vcFilterGid !== 'all') {
            const grp = groups.find(g => g.id === _vcFilterGid);
            if (grp) {
                const members = templates.filter(t => _tplGroupIds(t).includes(grp.id));
                const st = _groupState(members);
                const bar = document.createElement('div');
                bar.className = 'vc-batchbar';
                bar.innerHTML = `<span class="vc-batchbar-name">「${_sgcEsc(grp.name)}」整組一鍵開關</span>
                    <label class="sgc-switch"><input type="checkbox" class="sgc-switch-input"${st === 'on' ? ' checked' : ''}><span class="sgc-switch-slider"></span></label>
                    <button class="vc-batchbar-mng" type="button" title="群組管理"><i class="fa-solid fa-gear"></i></button>`;
                const sw = bar.querySelector('.sgc-switch-input');
                if (st === 'partial') sw.indeterminate = true;
                sw.onchange = async () => { await _setGroupActive(members, st !== 'on'); renderVnComponents(); };
                bar.querySelector('.vc-batchbar-mng').onclick = () => _openGroupManage(grp);
                listEl.appendChild(bar);
            }
        }

        // 篩選後清單
        const shown = (_vcFilterGid === 'all') ? templates
            : templates.filter(t => _tplGroupIds(t).filter(id => validIds.has(id)).includes(_vcFilterGid));
        if (!shown.length) {
            const e = document.createElement('div'); e.className = 'vc-empty';
            e.textContent = templates.length ? '這個標籤下還沒有組件。' : 'VN 組件空空如也，去煉丹做純展示面板吧！';
            listEl.appendChild(e);
        } else {
            const wrap = document.createElement('div'); wrap.className = 'vc-list';
            shown.forEach(tpl => wrap.appendChild(_vcCard(tpl, nameMap, validIds)));
            listEl.appendChild(wrap);
            _vcApplyBrowseFilter(listEl);
            _vcObserveThumbs(wrap);
        }

        // ── 隱藏／孤兒組件：isActive（還在劇情裡作用）但沒出現在上面清單（被 panelType 等藏起）→ 無處可管。
        //    硬列出來給看+刪：解「莫名其妙冒出舊面板、卻在展廳/我的應用都找不到」的孤兒。不管什麼 panelType/版本都抓得到。──
        const _shownIds = new Set(templates.map(t => t.id));
        const _orphans = _allVn.filter(t => t && t.isActive && !_shownIds.has(t.id));
        if (_orphans.length) {
            const ob = document.createElement('div'); ob.className = 'vc-orphan-box';
            const hd = document.createElement('div'); hd.className = 'vc-orphan-hd';
            hd.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 隱藏／孤兒組件（${_orphans.length}）<span class="vc-orphan-sub">這些不在上面清單、但還在劇情裡作用（AI 會被教著寫、劇情會渲染）。認不得就刪掉。</span>`;
            ob.appendChild(hd);
            _orphans.forEach(tpl => {
                const row = document.createElement('div'); row.className = 'vc-orphan-row';
                const meta = `${(tpl.title && String(tpl.title).trim()) || '(無標題)'} · ${tpl.panelType || '未標類型'}${tpl.isBlock ? ' · 區塊' : ''}`;
                row.innerHTML = `<span class="vc-orphan-info"><span class="vc-orphan-tag">${_sgcEsc(tpl.tagId || '?')}</span><span class="vc-orphan-meta">${_sgcEsc(meta)}</span></span><button class="vc-orphan-del" type="button" title="刪除"><i class="fa-solid fa-trash"></i></button>`;
                row.querySelector('.vc-orphan-del').onclick = async () => {
                    if (!confirm(`刪除隱藏組件 [${tpl.tagId}]？\n刪掉後它會從劇情裡消失、AI 也不再被教著寫它。此動作無法復原。`)) return;
                    try { await db.deleteUITemplate(tpl.id); } catch (e) {}
                    try { await syncActiveTagsToLocal(); } catch (e) {}
                    if (win.VN_DynamicParser) { try { await win.VN_DynamicParser.init(); } catch (e) {} }
                    try { await _removeTavernPanelArtifacts(tpl.tagId); } catch (e) {}   // 連酒館正則+主世界書殘留一起清
                    try { await _purgeLinkedPhoneApp(tpl.id); } catch (e) {}            // 連對應的手機 app + 資料一起清（共用＝整個移除）
                    renderVnComponents();
                };
                ob.appendChild(row);
            });
            listEl.appendChild(ob);
        }

        // 底部：選擇並打包
        const foot = document.createElement('div'); foot.className = 'vc-browse-foot';
        foot.innerHTML = `<button class="vc-pack-cta" type="button"${templates.length ? '' : ' disabled'}><i class="fa-solid fa-box-archive"></i> 選擇並打包</button>`;
        foot.querySelector('.vc-pack-cta').onclick = () => { if (!templates.length) return; _vcPackSel.clear(); _vcView = 'package'; renderVnComponents(); };
        listEl.appendChild(foot);

        const content = _vcCtx.content;
        if (content) content.scrollTop = _vcBrowseScroll;   // 從子頁返回時還原捲動
    }
    function _vcApplyBrowseFilter(listEl) {
        const q = _vcSearch.trim().toLowerCase();
        listEl.querySelectorAll('.vc-card').forEach(c => {
            const ok = !q || (c.getAttribute('data-name') || '').toLowerCase().includes(q);
            c.classList.toggle('vc-hide', !ok);
        });
    }
    function _vcCard(tpl, nameMap, validIds) {
        const safeTagId = (tpl.tagId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
        const gids = _tplGroupIds(tpl).filter(id => validIds.has(id));
        const tags = gids.length
            ? gids.map(id => `<span class="vc-tag">${_sgcEsc(nameMap[id])}</span>`).join('')
            : '<span class="vc-tag muted">未分組</span>';
        const card = document.createElement('div');
        card.className = 'vc-card';
        card.setAttribute('data-name', `${tpl.title || ''} ${tpl.tagId || ''}`);
        card.innerHTML = `<div class="vc-card-main">
                <div class="vc-card-title">${_sgcEsc((tpl.title && String(tpl.title).trim()) || tpl.tagId || '未知')}</div>
                <div class="vc-card-tags">${tags}</div>
            </div>
            <span class="vc-dot${tpl.isActive ? ' on' : ''}" title="${tpl.isActive ? '啟用中' : '停用'}"></span>
            <span class="vc-chev"><i class="fa-solid fa-chevron-right"></i></span>`;
        card.insertBefore(_vcThumbBox(tpl, safeTagId), card.firstChild);
        card.onclick = () => {
            const content = _vcCtx.content;
            _vcBrowseScroll = content ? content.scrollTop : 0;
            _vcTpl = tpl; _vcView = 'detail'; renderVnComponents();
        };
        return card;
    }

    // ── ② 詳情：預覽 + 繼續編輯 + 複製/匯出 + 使用與設置 + 底部紅色刪除 ──
    function _vcRenderDetail(listEl) {
        const tpl = _vcTpl; if (!tpl) { _vcView = 'browse'; return renderVnComponents(); }
        const db = win.OS_DB;
        const safeTagId = (tpl.tagId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
        const previewHtml = (tpl.html || '').replace(/\{\{1\}\}/g, '參數A').replace(/\{\{2\}\}/g, '參數B');
        listEl.innerHTML = `
            <div class="swb-bar">
                <button class="swb-iconbtn" id="vc-back" type="button"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title">${_sgcEsc((tpl.title && String(tpl.title).trim()) || tpl.tagId || '未知')}</div>
            </div>
            <div class="vc-page">
                <div class="vc-set-row vc-enable-row"><span class="vc-set-label">啟用這個組件</span>
                    <label class="sgc-switch"><input type="checkbox" class="sgc-switch-input" id="vc-d-active"${tpl.isActive ? ' checked' : ''}><span class="sgc-switch-slider"></span></label>
                </div>
                <div class="studio-pv-tabs">
                    <button class="studio-pv active" data-pv="phone">手機</button>
                    <button class="studio-pv" data-pv="center">中間</button>
                    <button class="studio-pv" data-pv="full">全屏</button>
                </div>
                <div class="sgc-preview"><div class="studio-pv-box">
                    ${tpl.css ? `<style>${tpl.css}</style>` : ''}
                    <div class="vn-dynamic-panel-${safeTagId} vc-pv-panel">${previewHtml}</div>
                </div></div>
                <button class="swb-primary vc-full" id="vc-continue" type="button"><i class="fa-solid fa-pen-to-square"></i> 繼續編輯</button>
                <div class="vc-row2">
                    <button class="swb-secondary" id="vc-dup" type="button"><i class="fa-solid fa-copy"></i> 複製組件</button>
                    <button class="swb-secondary" id="vc-export" type="button"><i class="fa-solid fa-file-export"></i> 匯出</button>
                </div>
                <button class="vc-navrow" id="vc-settings" type="button"><span class="vc-navrow-ico"><i class="fa-solid fa-gear"></i></span><span class="vc-navrow-label">使用與設置</span><span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span></button>
                <div class="vc-delzone"><button class="vc-delbtn" id="vc-del" type="button"><i class="fa-solid fa-trash"></i> 刪除組件</button></div>
            </div>`;
        listEl.querySelector('#vc-back').onclick = () => { _vcView = 'browse'; renderVnComponents(); };
        listEl.querySelector('#vc-d-active').onchange = async (e) => { await _setComponentActive(tpl, e.target.checked); };
        listEl.querySelector('#vc-continue').onclick = () => {
            if (!confirm(`把 [${tpl.tagId}] 載回煉丹爐繼續編輯？\n\n會：\n• 清空當前對話\n• 把這個面板載入預覽\n• 之後在對話框打修改建議，AI 只會微調\n• 改完按「確定創建」會覆蓋這個面板\n\n確定嗎？`)) return;
            if (_vcStandalone) {   // 獨立區：編輯需要創作室編輯器→關浮層、開創作室、進編輯（沿用 openEditApp 模式）
                const root = _vcStandaloneRoot;
                if (_vcExit) _vcExit();
                try { launch(root); } catch (e) {}
                setTimeout(() => { try { _enterEditMode(tpl); } catch (e) { console.warn('[OS_STUDIO] 繼續編輯', e); } }, 60);
            } else {
                _enterEditMode(tpl);
            }
        };
        listEl.querySelector('#vc-dup').onclick = () => _vcDuplicate(tpl);
        listEl.querySelector('#vc-export').onclick = () => exportOneVnUiTemplate(tpl);
        listEl.querySelector('#vc-settings').onclick = () => { _vcView = 'settings'; renderVnComponents(); };
        listEl.querySelector('#vc-del').onclick = async () => {
            if (!confirm(`刪除組件 [${tpl.tagId}]？此操作無法復原。`)) return;
            await db.deleteUITemplate(tpl.id); await syncActiveTagsToLocal();
            if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
            try { await _removeTavernPanelArtifacts(tpl.tagId); } catch (e) {}   // 連酒館正則+主世界書殘留一起清，不留孤兒
            try { await _purgeLinkedPhoneApp(tpl.id); } catch (e) {}            // 連對應的手機 app + 資料一起清（共用＝整個移除）
            _vcTpl = null; _vcView = 'browse'; renderVnComponents();
        };
        _activatePreview(listEl, tpl, safeTagId);
    }

    async function _vcDuplicate(tpl) {
        const db = win.OS_DB;
        const copy = JSON.parse(JSON.stringify(tpl));
        delete copy.id;
        copy.isActive = false;   // 複本預設停用，避免兩個同 tag 撞在一起
        copy.title = `${(tpl.title && String(tpl.title).trim()) || tpl.tagId || '組件'} 複本`;
        const base = (tpl.tagId || 'tag');
        let nt = `${base}_copy`;
        try {
            const used = new Set((await db.getAllVNTagTemplates()).map(t => t.tagId));
            let i = 1; while (used.has(nt)) { i++; nt = `${base}_copy${i}`; }
        } catch (e) {}
        copy.tagId = nt;
        await db.saveVNTagTemplate(copy);
        _studioToast(`已複製成「${copy.title}」（預設停用，到設置開啟）`, 'success', '複製組件');
        _vcTpl = null; _vcView = 'browse'; renderVnComponents();
    }

    // ── ③ 使用與設置：把詳情頁的按鈕牆拆過來，分組整齊 ──
    function _vcRenderSettings(listEl) {
        const tpl = _vcTpl; if (!tpl) { _vcView = 'browse'; return renderVnComponents(); }
        const db = win.OS_DB;
        const safeFmt = (tpl.demoFormat || '無結構定義').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const phoneRec = (_vcAllPhoneApps || []).find(a => a && a.srcTplId === tpl.id);
        const phoneRow = (tpl.caps === 'display') ? '' : `
                    <div class="vc-set-row"><span class="vc-set-label"><i class="fa-solid fa-mobile-screen"></i> 裝到手機</span>
                        <label class="sgc-switch"><input type="checkbox" class="sgc-switch-input" id="vc-set-phone"${phoneRec ? ' checked' : ''}><span class="sgc-switch-slider"></span></label>
                    </div>`;
        listEl.innerHTML = `
            <div class="swb-bar">
                <button class="swb-iconbtn" id="vc-back" type="button"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title">使用與設置</div>
            </div>
            <div class="vc-page">
                <div class="vc-set-block"><div class="vc-set-blabel">歸到群組</div><div id="vc-set-groups"></div></div>
                <div class="vc-set-block"><div class="vc-set-blabel">觸發格式</div>
                    <div class="sgc-format-box">
                        <div class="sgc-format-text">${safeFmt}</div>
                        <textarea class="sgc-format-input vc-hide" id="vc-fmt-input">${_sgcEsc(tpl.demoFormat || '')}</textarea>
                        <div class="vc-fmt-actions">
                            <button class="swb-secondary btn-edit-fmt" type="button"><i class="fa-solid fa-pen"></i> 編輯</button>
                            <button class="swb-secondary btn-save-fmt vc-hide" type="button"><i class="fa-solid fa-floppy-disk"></i> 儲存</button>
                            <button class="swb-secondary btn-cancel-fmt vc-hide" type="button"><i class="fa-solid fa-xmark"></i> 取消</button>
                        </div>
                    </div>
                </div>
                <div class="vc-set-block"><div class="vc-set-blabel">注入方式</div>
                    <div class="vc-set-row"><span class="vc-set-label"><i class="fa-solid fa-key"></i> 關鍵字觸發</span>
                        <label class="sgc-switch"><input type="checkbox" class="sgc-switch-input" id="vc-set-kwmode"${tpl.injectMode === 'keyword' ? ' checked' : ''}><span class="sgc-switch-slider"></span></label>
                    </div>
                    <div class="sgc-format-box vc-kw-box${tpl.injectMode === 'keyword' ? '' : ' vc-hide'}">
                        <textarea class="sgc-format-input" id="vc-kw-input" placeholder="關鍵字用逗號分隔；正文最近 3 輪或你的輸入出現任一個，才注入這個面板。關掉＝常駐、每輪都注入。">${_sgcEsc((tpl.keywords || []).join('、'))}</textarea>
                        <div class="vc-fmt-actions">
                            <button class="swb-secondary btn-save-kw" type="button"><i class="fa-solid fa-floppy-disk"></i> 儲存關鍵字</button>
                        </div>
                    </div>
                </div>
                <div class="vc-set-block"><div class="vc-set-blabel">整合</div>
                    <button class="vc-navrow" id="vc-import-st" type="button"><span class="vc-navrow-ico"><i class="fa-solid fa-file-import"></i></span><span class="vc-navrow-label">注入酒館正則</span><span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span></button>
                    ${phoneRow}
                    <div class="vc-set-row"><span class="vc-set-label"><i class="fa-solid fa-house"></i> 大廳顯示</span>
                        <label class="sgc-switch"><input type="checkbox" class="sgc-switch-input" id="vc-set-lobby"${tpl.lobbyEnabled ? ' checked' : ''}><span class="sgc-switch-slider"></span></label>
                    </div>
                </div>
                <div class="vc-set-block"><div class="vc-set-blabel">進階</div>
                    <button class="vc-navrow" id="vc-raw" type="button"><span class="vc-navrow-ico"><i class="fa-solid fa-code"></i></span><span class="vc-navrow-label">編輯原碼</span><span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span></button>
                </div>
            </div>`;
        listEl.querySelector('#vc-back').onclick = () => { _vcView = 'detail'; renderVnComponents(); };
        listEl.querySelector('#vc-set-groups').appendChild(_buildGroupAssignRow(tpl));
        const fmtBox = listEl.querySelector('.sgc-format-box');
        const fmtText = fmtBox.querySelector('.sgc-format-text'), fmtInput = fmtBox.querySelector('.sgc-format-input');
        const bE = fmtBox.querySelector('.btn-edit-fmt'), bS = fmtBox.querySelector('.btn-save-fmt'), bC = fmtBox.querySelector('.btn-cancel-fmt');
        const setEditing = (on) => { fmtText.classList.toggle('vc-hide', on); bE.classList.toggle('vc-hide', on); fmtInput.classList.toggle('vc-hide', !on); bS.classList.toggle('vc-hide', !on); bC.classList.toggle('vc-hide', !on); };
        bE.onclick = () => setEditing(true);
        bC.onclick = () => { fmtInput.value = tpl.demoFormat || ''; setEditing(false); };
        bS.onclick = async () => { tpl.demoFormat = fmtInput.value; await db.saveVNTagTemplate(tpl); await syncActiveTagsToLocal(); _studioToast('已儲存觸發格式', 'success', '設置'); _vcRenderSettings(listEl); };
        listEl.querySelector('#vc-import-st').onclick = () => importToSillyTavern(tpl);
        const phoneInput = listEl.querySelector('#vc-set-phone');
        if (phoneInput) phoneInput.onchange = async (e) => { await _vcTogglePhone(tpl, e.target.checked); };
        listEl.querySelector('#vc-set-lobby').onchange = async (e) => { tpl.lobbyEnabled = e.target.checked; await db.saveVNTagTemplate(tpl); };
        // 注入方式：常駐 ⇄ 關鍵字觸發
        const kwModeChk = listEl.querySelector('#vc-set-kwmode'), kwBox = listEl.querySelector('.vc-kw-box');
        if (kwModeChk) kwModeChk.onchange = async (e) => {
            tpl.injectMode = e.target.checked ? 'keyword' : 'constant';
            if (kwBox) kwBox.classList.toggle('vc-hide', !e.target.checked);
            await db.saveVNTagTemplate(tpl); await syncActiveTagsToLocal();
        };
        const kwSave = listEl.querySelector('.btn-save-kw');
        if (kwSave) kwSave.onclick = async () => {
            const raw = (listEl.querySelector('#vc-kw-input') || {}).value || '';
            tpl.keywords = raw.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean).slice(0, 12);
            await db.saveVNTagTemplate(tpl); await syncActiveTagsToLocal();
            _studioToast('已儲存關鍵字（' + tpl.keywords.length + '）', 'success', '設置');
        };
        listEl.querySelector('#vc-raw').onclick = () => openRawEditModal(tpl);
    }
    async function _vcTogglePhone(tpl, want) {
        const db = win.OS_DB;
        const rec = (_vcAllPhoneApps || []).find(a => a && a.srcTplId === tpl.id);
        try {
            if (rec && !want) {
                await db.deletePhoneApp(rec.id);
                if (win.VoidPhoneShell && win.VoidPhoneShell.removeApp) win.VoidPhoneShell.removeApp(rec.id);
            } else if (!rec && want) {
                const r = { name: tpl.tagId || '面板', emoji: '🧩', iconUrl: '', html: _templateToPhoneHtml(tpl), source: 'studio', srcTplId: tpl.id };
                const nid = await db.savePhoneApp(r);
                if (win.VoidPhoneShell && win.VoidPhoneShell.addApp) win.VoidPhoneShell.addApp({ id: nid, name: r.name, emoji: r.emoji, iconUrl: '' });
            }
            _vcAllPhoneApps = db.getAllPhoneApps ? ((await db.getAllPhoneApps()) || []) : _vcAllPhoneApps;
        } catch (e) { console.error('[studio] 裝手機切換失敗', e); }
    }

    // ── ④ 選擇並打包：多選 + 全選 + 驗證並打包（重用 _downloadVnUiPack）──
    async function _vcRenderPackage(listEl) {
        const db = win.OS_DB;
        let templates = [];
        try { templates = (await db.getAllVNTagTemplates()).filter(t => t && t.panelType !== '純應用'); } catch (e) {}
        const allSel = templates.length > 0 && templates.every(t => _vcPackSel.has(t.id));
        listEl.innerHTML = `
            <div class="swb-bar">
                <button class="swb-iconbtn" id="vc-back" type="button"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title">選擇並打包</div>
                <button class="swb-iconbtn" id="vc-selall" type="button" title="全選/全不選">${allSel ? '<i class="fa-solid fa-square-check"></i>' : '<i class="fa-solid fa-square vc-uncheck"></i>'}</button>
            </div>
            <div class="vc-page"><div class="vc-list" id="vc-pack-list"></div></div>
            <div class="vc-pack-foot">
                <span class="vc-pack-count" id="vc-pack-count"></span>
                <button class="swb-primary" id="vc-pack-go" type="button"><i class="fa-solid fa-circle-check"></i> 驗證並打包</button>
            </div>`;
        const list = listEl.querySelector('#vc-pack-list');
        if (!templates.length) {
            list.innerHTML = '<div class="vc-empty">沒有可打包的組件。</div>';
        } else {
            templates.forEach(tpl => {
                const safeTagId = (tpl.tagId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
                const on = _vcPackSel.has(tpl.id);
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'vc-card vc-pack-row' + (on ? ' on' : '');
                row.innerHTML = `<span class="vc-pack-check">${on ? '<i class="fa-solid fa-square-check"></i>' : '<i class="fa-solid fa-square vc-uncheck"></i>'}</span>
                    <div class="vc-card-main"><div class="vc-card-title">${_sgcEsc((tpl.title && String(tpl.title).trim()) || tpl.tagId || '未知')}</div></div>`;
                row.insertBefore(_vcThumbBox(tpl, safeTagId), row.children[1]);
                row.onclick = () => { if (_vcPackSel.has(tpl.id)) _vcPackSel.delete(tpl.id); else _vcPackSel.add(tpl.id); _vcRenderPackage(listEl); };
                list.appendChild(row);
            });
            _vcObserveThumbs(list);
        }
        listEl.querySelector('#vc-pack-count').textContent = `已選擇 ${_vcPackSel.size} 個組件`;
        const go = listEl.querySelector('#vc-pack-go'); go.disabled = _vcPackSel.size === 0;
        listEl.querySelector('#vc-back').onclick = () => { _vcView = 'browse'; renderVnComponents(); };
        listEl.querySelector('#vc-selall').onclick = () => { if (allSel) _vcPackSel.clear(); else templates.forEach(t => _vcPackSel.add(t.id)); _vcRenderPackage(listEl); };
        go.onclick = () => {
            if (!_vcPackSel.size) return;
            const sel = templates.filter(t => _vcPackSel.has(t.id));
            const today = new Date().toISOString().slice(0, 10);
            _downloadVnUiPack(sel, `aurelia-vn-ui-pack-${today}.json`);
            _studioToast(`已打包 ${sel.length} 個組件，已下載到本機。`, 'success', '打包');
        };
    }

    // ════════════════════════════════════════════════════════════════
    // VN 組件「群組」：群組定義存 localStorage；成員關係掛在組件 tpl.groupIds[]（可掛多組）。
    //   群組＝標籤；批次開關＝把成員 isActive 一起開/關（重用 syncActiveTagsToLocal 管線）。
    //   不綁世界觀自動套，全手動（Rae 拍板）。
    // ════════════════════════════════════════════════════════════════
    const VN_GROUPS_KEY = 'vn_component_groups';
    function _sgcEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _loadGroups() { try { return JSON.parse(localStorage.getItem(VN_GROUPS_KEY) || '[]') || []; } catch (e) { return []; } }
    function _saveGroups(arr) { try { localStorage.setItem(VN_GROUPS_KEY, JSON.stringify(arr || [])); } catch (e) {} }
    function _newGroupId() { return 'g_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); }
    function _tplGroupIds(tpl) { return Array.isArray(tpl.groupIds) ? tpl.groupIds : []; }

    async function _setComponentActive(tpl, active) {
        const db = win.OS_DB; if (!db) return;
        tpl.isActive = !!active;
        await db.saveVNTagTemplate(tpl);
        await syncActiveTagsToLocal();
        if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
    }
    async function _setGroupActive(members, active) {
        const db = win.OS_DB; if (!db) return;
        for (const t of members) { if (t.isActive !== active) { t.isActive = active; await db.saveVNTagTemplate(t); } }
        await syncActiveTagsToLocal();
        if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
    }
    function _groupState(members) {
        if (!members.length) return 'empty';
        const on = members.filter(t => t.isActive).length;
        return on === 0 ? 'off' : (on === members.length ? 'on' : 'partial');
    }

    function _createGroup() {
        const name = (prompt('新群組名稱（例：古代 / 現代 / 賽博龐克）') || '').trim();
        if (!name) return;
        const groups = _loadGroups();
        groups.push({ id: _newGroupId(), name });
        _saveGroups(groups);
        _vcView = 'browse'; renderVnComponents();
    }

    // 群組管理 modal：改名 / 指派成員（勾選哪些組件屬於本組）/ 刪除（退回未分組、不刪組件）
    async function _openGroupManage(group) {
        const doc = win.document || document;
        const old = doc.getElementById('sgc-group-modal'); if (old) old.remove();
        const db = win.OS_DB;
        let tpls = [];
        try { tpls = (await db.getAllVNTagTemplates()).filter(t => t && t.panelType !== '純應用'); } catch (e) {}
        const rows = tpls.map(t => {
            const inG = _tplGroupIds(t).includes(group.id);
            const nm = (t.title && String(t.title).trim()) || t.tagId || '未知';
            return `<label class="sgc-assign-row"><input type="checkbox" data-tpl-id="${_sgcEsc(t.id)}"${inG ? ' checked' : ''}><span>${_sgcEsc(nm)}</span></label>`;
        }).join('') || '<div class="sgc-folder-empty">沒有組件</div>';
        const modal = doc.createElement('div');
        modal.id = 'sgc-group-modal';
        modal.className = 'sgc-modal';
        modal.innerHTML = `
            <div class="sgc-modal-card">
                <div class="sgc-modal-title"><i class="fa-solid fa-layer-group"></i> 群組管理</div>
                <div class="sgc-modal-row">
                    <input class="sgc-modal-name" type="text" value="${_sgcEsc(group.name)}" placeholder="群組名稱">
                    <button class="sgc-mini-btn" id="sgc-grp-rename" type="button">改名</button>
                </div>
                <div class="sgc-modal-sub">指派成員（勾選＝屬於這組；組件可同時屬於多組）</div>
                <div class="sgc-assign-list">${rows}</div>
                <div class="sgc-modal-actions">
                    <button class="sgc-mini-btn danger" id="sgc-grp-del" type="button"><i class="fa-solid fa-trash"></i> 刪除群組</button>
                    <button class="sgc-mini-btn" id="sgc-grp-close" type="button">關閉</button>
                </div>
            </div>`;
        (doc.body || doc.documentElement).appendChild(modal);
        const close = () => { modal.remove(); renderVnComponents(); };
        modal.addEventListener('click', e => { if (e.target === modal) close(); });
        modal.querySelector('#sgc-grp-close').onclick = close;
        modal.querySelector('#sgc-grp-rename').onclick = () => {
            const nn = (modal.querySelector('.sgc-modal-name').value || '').trim();
            if (!nn) return;
            const groups = _loadGroups(); const g = groups.find(x => x.id === group.id); if (g) { g.name = nn; _saveGroups(groups); }
            close();
        };
        modal.querySelector('#sgc-grp-del').onclick = async () => {
            if (!confirm(`刪除群組「${group.name}」？\n組件不會被刪，只會退回未分組。`)) return;
            _saveGroups(_loadGroups().filter(x => x.id !== group.id));
            for (const t of tpls) { const gids = _tplGroupIds(t); if (gids.includes(group.id)) { t.groupIds = gids.filter(id => id !== group.id); await db.saveVNTagTemplate(t); } }
            _vcFilterGid = 'all';
            close();
        };
        modal.querySelectorAll('.sgc-assign-row input').forEach(cb => cb.onchange = async () => {
            const tpl = tpls.find(t => t.id === cb.getAttribute('data-tpl-id')); if (!tpl) return;
            let gids = _tplGroupIds(tpl);
            if (cb.checked) { if (!gids.includes(group.id)) gids = gids.concat(group.id); }
            else gids = gids.filter(x => x !== group.id);
            tpl.groupIds = gids;
            await db.saveVNTagTemplate(tpl);
        });
    }

    // 設置頁用：這個組件「歸到哪些群組」的多選 chip 列（寫 tpl.groupIds）
    function _buildGroupAssignRow(tpl) {
        const wrap = document.createElement('div');
        wrap.className = 'sgc-grouprow';
        const groups = _loadGroups();
        if (!groups.length) {
            wrap.innerHTML = '<span class="sgc-grouprow-empty">還沒有群組，回瀏覽層用標籤列的「＋ 群組」新增</span>';
            return wrap;
        }
        const gids = _tplGroupIds(tpl);
        wrap.innerHTML = groups.map(g =>
            `<label class="sgc-grouptag"><input type="checkbox" data-gid="${_sgcEsc(g.id)}"${gids.includes(g.id) ? ' checked' : ''}><span>${_sgcEsc(g.name)}</span></label>`
        ).join('');
        wrap.querySelectorAll('input').forEach(cb => cb.onchange = async () => {
            const gid = cb.getAttribute('data-gid');
            let cur = _tplGroupIds(tpl);
            if (cb.checked) { if (!cur.includes(gid)) cur = cur.concat(gid); }
            else cur = cur.filter(x => x !== gid);
            tpl.groupIds = cur;
            await win.OS_DB.saveVNTagTemplate(tpl);
        });
        return wrap;
    }

    // ============================================================
    // === VN UI 展廳：匯出／匯入「包」（把模板搬到別台裝置的酒館，非奧瑞亞手機殼）===
    //   匯出 = 打包成 .json 下載；匯入 = 讀檔逐筆寫回，同 tagId 覆蓋更新、新的就新增。
    // ============================================================
    // 視覺回饋：用酒館原生 toastr（win.toastr，全擴展通用）；沒有就退回 alert。
    // TauriTavern 下載會直接存本機、但「不彈任何通知」→ 一定要自己給可見回饋。
    function _studioToast(msg, type, title) {
        const t = win.toastr || window.toastr;
        const fn = t && typeof t[type] === 'function' ? t[type] : (t && t.info);
        if (fn) { try { fn.call(t, msg, title || '創作室'); return; } catch (e) {} }
        alert(msg);
    }

    function _downloadVnUiPack(templates, filename) {
        const pack = {
            type: 'aurelia-vn-ui-pack',
            version: 1,
            exportedAt: new Date().toISOString(),
            count: templates.length,
            templates: templates
        };
        const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (e) {} a.remove(); }, 0);
    }

    // exportAllVnUiPack 已移除：整包匯出改走打包頁「全選 → 驗證並打包」（_vcRenderPackage）

    function exportOneVnUiTemplate(tpl) {
        if (!tpl) return;
        try {
            const safe = ((tpl.tagId || 'panel').replace(/[^a-zA-Z0-9_-]/g, '')) || 'panel';
            const fname = `aurelia-vn-ui-${safe}.json`;
            _downloadVnUiPack([tpl], fname);
            _studioToast(`✅ 已匯出面板「${tpl.tagId || safe}」，已下載到本機：${fname}`, 'success', '匯出');
        } catch (e) { _studioToast('匯出失敗：' + ((e && e.message) || e), 'error', '匯出'); }
    }

    async function importVnUiPack(file) {
        const db = win.OS_DB || window.OS_DB;
        if (!db || typeof db.saveVNTagTemplate !== 'function') { _studioToast('找不到資料庫，無法匯入。', 'error', '匯入包'); return; }
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const list = Array.isArray(data) ? data : (Array.isArray(data.templates) ? data.templates : null);
            if (!list || !list.length) { _studioToast('這個檔案裡找不到面板資料，不是有效的匯出包。', 'warning', '匯入包'); return; }
            // 以 tagId 去重：同 tagId 覆蓋更新、新的就新增
            const existing = await db.getAllVNTagTemplates();
            const byTag = {};
            existing.forEach(t => { if (t && t.tagId) byTag[t.tagId] = t; });
            let added = 0, updated = 0;
            for (const raw of list) {
                if (!raw || typeof raw !== 'object') continue;
                const tpl = JSON.parse(JSON.stringify(raw));
                const hit = tpl.tagId && byTag[tpl.tagId];
                if (hit) { tpl.id = hit.id; updated++; }   // 蓋掉既有同名
                else { delete tpl.id; added++; }           // 新增 → saveVNTagTemplate 自動產 id
                await db.saveVNTagTemplate(tpl);
            }
            await syncActiveTagsToLocal();
            if (win.VN_DynamicParser) { try { await win.VN_DynamicParser.init(); } catch (e) {} }
            _vcView = 'browse'; renderVnComponents();
            _studioToast(`✅ 匯入完成：新增 ${added} 個、覆蓋更新 ${updated} 個。`, 'success', '匯入包');
        } catch (e) { _studioToast('匯入失敗：' + ((e && e.message) || e), 'error', '匯入包'); }
    }

    function _wireVnUiPackButtons() {
        const impBtn = document.getElementById('studio-import-pack-btn');
        const fileInput = document.getElementById('studio-import-pack-file');
        if (impBtn && fileInput) {
            impBtn.onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                const f = e.target.files && e.target.files[0];
                if (f) importVnUiPack(f);
                e.target.value = '';   // 清掉，讓同一檔可重複選
            };
        }
    }

    // ============================================================
    // === VN 煉丹：Diff-based refine（AI 給 find/replace pair）+ 歷史快照 ===
    // AI 不重寫整段 CSS/JS/HTML，改成輸出精準替換指令 <patch target><find>...</find><replace>...</replace></patch>
    // 前端驗證 find 在原文中唯一存在後才套用 → AI 沒寫到的東西物理上動不到
    // ============================================================
    const SCOPE_HUMAN_LABEL = {
        css:        '外觀樣式',
        js:         '互動邏輯',
        html:       '面板結構',
        demoFormat: '劇情格式',
        usageDesc:  'AI 使用說明',
        all:        '整個面板（重新設計）'
    };
    function humanizeScopeKeys(keys) {
        if (!Array.isArray(keys) || keys.length === 0) return '面板內容';
        const uniq = [...new Set(keys)];
        return uniq.map(k => SCOPE_HUMAN_LABEL[k] || k).join('、');
    }
    const VN_HISTORY_LIMIT = 10;
    const VALID_DIFF_TARGETS = ['css', 'js', 'html', 'demoFormat', 'usageDesc'];

    // 構建 diff prompt：要 AI 給 <patch target><find>...</find><replace>...</replace></patch>
    function buildDiffRefinePrompt(refineMsg) {
        if (!currentParsedData) return null;
        const d = currentParsedData;

        return `你是一個 VN 視覺小說引擎的 UI 工程師。用戶已有一個動態面板，給你修改建議。

**你的任務：產生精準的「替換指令」（find / replace pair），讓前端套用到當前面板。不要重寫整個 CSS / HTML / JS，只給要改的片段。**

⚠️【保守原則 — 絕對遵守】
- 只 patch 用戶**明確要求**的部分。沒被指名的內容絕對不動，即使你覺得設計可以更好
- 即使附了參考圖，圖只是「氛圍參考」，不是「重做模板」。用戶說「改字顏色」就只動顏色屬性
- 即使當前面板的代碼風格你不喜歡、或違反了某些「最佳實踐」——閉嘴照辦，不要順手「優化」
- 規則：用戶說 X，你只動 X；用戶沒說的，你裝沒看到

### 【當前面板狀態】(tagId: ${d.tagId || ''})

[--- CSS BEGIN ---]
${d.css || ''}
[--- CSS END ---]

[--- HTML BEGIN ---]
${d.html || ''}
[--- HTML END ---]

[--- JS BEGIN ---]
${d.js || ''}
[--- JS END ---]

[--- demoFormat BEGIN ---]
${d.demoFormat || ''}
[--- demoFormat END ---]

[--- usageDesc BEGIN ---]
${d.usageDesc || ''}
[--- usageDesc END ---]

### 【用戶的修改建議】
「${refineMsg}」

### 【輸出規範 — 必讀】

對每個改動，輸出一個 <patch> 區塊：

<patch target="css">
<find>原始片段（必須與上面當前面板狀態中的內容【完全一致、一字不差】，包含空白與換行）</find>
<replace>新片段（你要把 find 替換成的新內容）</replace>
</patch>

**關鍵規則**：
1. target 必須是這五個之一：css / js / html / demoFormat / usageDesc
2. **find 必須在 target 對應的內容裡【唯一存在】**：選擇足夠長、足夠特別的片段。前端會驗證唯一性，找不到或找到多個都會放棄這條 patch
3. **find 必須一字不差**：包含縮排、空白、換行、引號方向、註解。**從上面 BEGIN/END 區塊內複製貼上**，不要重寫或重新格式化
4. **🚨 find 越短越好（省 token）**：選最精簡的片段，不要為了保險整段當 find
   - 正例：只放需要被替換的那幾個 token / 那一行 / 那個 CSS rule 的核心宣告
   - 反例：把整段 5KB CSS 或整段 HTML 當 find（雖然不會被擋，但浪費 token，diff 的初衷就是省）
   - 如果你發現自己需要長 find 才能精準定位（找不到夠特別的短片段），那這次改動其實是「大改」，請改走整包重做：直接輸出全新面板的 <json>（見下方【🆘 大改】），不要硬塞超長 find / 超大 patch
5. **可以一次輸出多個 <patch>**（改多處、改多個 target 都行）
6. **新增內容**：把 find 設為「新內容應該插入點的前一段現有內容」，replace 設為「該段現有內容 + 你的新內容」
7. **刪除內容**：把 find 設為要刪的片段，replace 設為空字串
8. **可以簡短說明、可以提可選建議**——在 patches 之前或之後可以寫 1-3 句話：確認你改了什麼、或附帶提一個可選建議。但不要說教、不要評論或推翻用戶的點子，照用戶說的改就好。
   - ⚠️ 但 **<patch>…</patch> 區塊內絕對不要對話**——區塊內只能有 <find> 和 <replace>，否則 patch 解析會失敗
   - ⚠️ 不要輸出 JSON、不要 markdown ${'```'} 包裹 patches
   - 對話放在所有 patches 之前或之後（最外層），不要塞在 patch 之間（patch 之間有對話會干擾解析）
   - 範例：「字改紅了。順便提醒這暗背景配紅字對比可能不夠，要不要加個陰影？」

### 【🆘 大改＝直接給整包新面板，禁止喊「太大」、禁止叫用戶重做】

如果用戶的修改建議**無法用幾條精準小 patch 表達**（例如「整個換藍色科技風」「改成英文版」「重新設計成 X 風格」，或一次「同時加 A、改 B、換 C」這種多項大改）——**絕對不要喊太大、不要叫用戶重發、也不要硬塞超大 patch**。請直接在這「同一次回覆」裡輸出整包全新面板的 JSON，用 <json> 包住，含七個鍵：

<json>
{"tagId":"沿用原面板的 tagId","isBlock":維持原面板的 true/false,"html":"...","css":"...","js":"...","usageDesc":"...","demoFormat":"..."}
</json>

規則：① JSON 字串值內換行寫成 \\n、雙引號轉義成 \\"，整個 JSON 不可有真實換行。② 用戶沒提到、原本就有的部分要完整保留，只把該大改的依用戶要求重做。③ 一旦輸出 <json> 就不要再輸出任何 <patch>。④ 整包重做時設計品質要在線：避免卡片套卡片、配合面板主題與世界觀、響應式照舊，別因為是重做就變陽春。前端收到整包會直接換上新面板、舊版自動進「歷史快照」可一鍵還原——**用戶完全不用重發**。

### 【範例】

範例 A（用戶說「把背景改深」，原 CSS 含 \`background: #2c3e50;\`）：
<patch target="css">
<find>background: #2c3e50;</find>
<replace>background: #EEF0F6;</replace>
</patch>

範例 B（用戶說「加一個關閉按鈕」，原 HTML 含 \`<div class="confirm-btn">確認</div>\`）：
<patch target="html">
<find><div class="confirm-btn">確認</div></find>
<replace><div class="confirm-btn">確認</div>
<div class="close-btn">關閉</div></replace>
</patch>

範例 C（用戶說「整個換成藍色科技風 / 改成英文版 / 一次加好幾項」＝大改 → 直接給整包，不要喊太大）：
<json>
{"tagId":"原本的","isBlock":true,"html":"…全新…","css":"…全新…","js":"…","usageDesc":"…","demoFormat":"…"}
</json>

開始輸出（小修 → 只輸出 <patch> 區塊；大改 → 只輸出 <json>…</json> 整包；兩者擇一，其他都不要寫）：`;
    }

    // 抽取 AI 在 patches 之外講的對話（吐槽 / 建議 / 確認）
    function extractConversationalText(responseText) {
        if (!responseText) return '';
        let text = responseText;
        // 去掉所有 <patch>...</patch> 區塊
        text = text.replace(/<patch\s+target=["'][^"']+["']\s*>[\s\S]*?<\/patch>/gi, '');
        // 去掉整包 <json>（大改路徑）與舊逃生標籤，避免被當成對話文字
        text = text.replace(/<json>[\s\S]*?<\/json>/gi, '');
        text = text.replace(/<too_big_for_diff\s*\/?\s*>/gi, '');
        // 去掉常見的 markdown 包裹
        text = text.replace(/```[\s\S]*?```/g, '');
        return text.trim();
    }

    // 套用 AI 的 diff patch 到 currentParsedData，回傳每條 patch 的處理結果
    // 回傳值：陣列（每條 patch 結果 + .conversationalText 屬性）或 { status: 'too_big', message, conversationalText }
    function applyDiffPatches(responseText) {
        if (!currentParsedData) return [];

        const conversationalText = extractConversationalText(responseText);

        // === 🆘 AI 主動逃生：用戶要求超出 diff 能處理的範圍 ===
        if (/<too_big_for_diff\s*\/?\s*>/i.test(responseText)) {
            return { status: 'too_big', message: '這次改動較大、AI 沒給出可套用的結果，請把想要的樣子描述清楚一點再發一次（系統會自動整包重做、不用任何按鈕）', conversationalText };
        }

        const patchRegex = /<patch\s+target=["']([^"']+)["']\s*>([\s\S]*?)<\/patch>/gi;
        const findRegex = /<find>([\s\S]*?)<\/find>/i;
        const replaceRegex = /<replace>([\s\S]*?)<\/replace>/i;

        // 第一輪：解析所有 patch（先不套用），同時做長度檢查
        const parsedPatches = []; // { target, findStr, replaceStr, original, findLen, originalLen }
        const results = [];
        let m;
        while ((m = patchRegex.exec(responseText)) !== null) {
            const target = m[1].trim();
            const body = m[2];

            if (!VALID_DIFF_TARGETS.includes(target)) {
                results.push({ target, status: 'invalid_target' });
                continue;
            }
            const findMatch = body.match(findRegex);
            const replaceMatch = body.match(replaceRegex);
            if (!findMatch || !replaceMatch) {
                results.push({ target, status: 'malformed' });
                continue;
            }
            const findStr = findMatch[1];
            const replaceStr = replaceMatch[1];
            if (!findStr || findStr.trim() === '') {
                results.push({ target, status: 'empty_find' });
                continue;
            }
            parsedPatches.push({ target, findStr, replaceStr });
        }

        // 砍掉所有長度檢查（過去版本擋掉 patch 反而強迫用戶重發、更耗 token）
        // 大改防線改靠：(a) prompt 約束 (b) <too_big_for_diff/> AI 主動逃生 (c) 歷史快照保底還原
        parsedPatches.forEach(p => {
            const { target, findStr, replaceStr } = p;
            const original = currentParsedData[target] || '';

            // 驗證 find 在原文中只出現一次（diff 機制核心，不能砍）
            const occurrences = original.split(findStr).length - 1;
            if (occurrences === 0) {
                results.push({ target, status: 'not_found', find: findStr.slice(0, 80) });
                return;
            }
            if (occurrences > 1) {
                results.push({ target, status: 'multi_match', find: findStr.slice(0, 80), count: occurrences });
                return;
            }

            // 套用：split + join 字串替換（避開 replace 的 $ 特殊字元）
            currentParsedData[target] = original.split(findStr).join(replaceStr);
            results.push({ target, status: 'applied', findLen: findStr.length, replaceLen: replaceStr.length, originalLen: original.length });
        });

        // 診斷 log：印出每條 patch 的處理結果（讓「整個面板被改」的問題能追蹤）
        const stats = results.reduce((acc, r) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
        }, {});
        console.log(`[Studio] 📦 diff 套用統計:`, stats, '— 詳情:', results, '— AI 對話:', conversationalText || '(無)');

        // 把對話文字附到 results array 上（陣列也能掛非數字屬性）
        results.conversationalText = conversationalText;
        return results;
    }

    function summarizeDiffResults(results) {
        // 抽 AI 對話文字（patches 之外的吐槽 / 建議 / 確認）
        const conv = (results && results.conversationalText) ? results.conversationalText : '';
        const appendConv = (baseText) => conv ? `${baseText}\n\n${conv}` : baseText;

        // === AI 主動逃生 / 前端全局長度檢查 abort ===
        if (results && !Array.isArray(results) && results.status === 'too_big') {
            return { text: appendConv('⚠️ ' + results.message), failed: true };
        }

        if (!Array.isArray(results) || results.length === 0) {
            // 完全沒 patch 但有對話 → AI 純聊天 / 問問題 / 給建議，不是失敗
            if (conv) {
                return { text: conv, failed: false, conversational: true };
            }
            return { text: '⚠️ AI 沒給出可套用的修改，預覽未更新。請把需求描述清楚一點再發一次（大改會自動整包重做）', failed: true };
        }
        const applied = results.filter(r => r.status === 'applied');
        const failed = results.filter(r => r.status !== 'applied');

        if (applied.length === 0) {
            const reasons = failed.slice(0, 3).map(r => {
                if (r.status === 'not_found') return `找不到原文「${(r.find || '').slice(0,30)}…」`;
                if (r.status === 'multi_match') return `「${(r.find || '').slice(0,30)}…」在原文出現 ${r.count} 次無法精準定位`;
                if (r.status === 'invalid_target') return `不認得目標欄位「${r.target}」`;
                if (r.status === 'malformed') return 'patch 格式錯誤';
                if (r.status === 'empty_find') return 'find 是空的';
                return r.status;
            });
            return { text: appendConv(`⚠️ AI 給了 ${results.length} 條修改指令但全部失敗：${reasons.join('；')}。請把需求描述清楚一點再發一次（大改會自動整包重做）`), failed: true };
        }

        const appliedTargets = applied.map(r => r.target);
        let text = `✅ 已套用 ${applied.length} 處修改：${humanizeScopeKeys(appliedTargets)}`;
        if (failed.length > 0) {
            text += `（另有 ${failed.length} 處定位失敗）`;
        }
        return { text: appendConv(text), failed: false, appliedTargets };
    }

    async function handleDiffVNRefine(refineMsg) {
        const inputEl = document.getElementById('studio-input');
        const sendBtn = document.getElementById('studio-send-btn');
        const container = document.getElementById('studio-chat-history');

        // 診斷 log：發送 diff 前印當前面板狀態（重整 / cache miss 的問題可從這裡看出來）
        const _d = currentParsedData || {};
        console.log(`[Studio] 🔧 diff refine 觸發: tagId=${_d.tagId || '?'}, css=${(_d.css||'').length}字, html=${(_d.html||'').length}字, 用戶建議="${refineMsg.slice(0,50)}", 附圖=${pendingImages.length}張`);

        // 修改前先拍快照（防 AI 改壞可還原）
        snapshotCurrentVNState(refineMsg, 'diff');
        renderVNHistoryArea();

        inputEl.value = '';
        inputEl.style.height = '50px';
        inputEl.disabled = true;
        sendBtn.disabled = false;
        sendBtn.innerText = '⏹ 停止';
        sendBtn.onclick = () => { if (_studioAbortCtrl) _studioAbortCtrl.abort(); };
        _studioAbortCtrl = new AbortController();

        // 帶圖時 content 變陣列；同時把圖也塞給 AI 看
        const userContent = buildUserMessageContent(refineMsg, pendingImages);
        const imagesForAI = pendingImages.slice(); // diff prompt 是單條 user message，圖片直接帶上
        chatMessages.push({ role: 'user', content: userContent });
        pendingImages = [];
        renderPendingImages();
        _studioSave(getChatSessionId());
        renderChatHistory();

        const aiBubble = document.createElement('div');
        aiBubble.className = 'studio-bubble ai';
        // 一建立就放打字三點，不等 API 第一個 chunk（避免空泡泡尷尬幾秒）
        aiBubble._typingSet = true;
        aiBubble.innerHTML = `<div class="studio-typing-wrap">
            <span class="studio-typing-dot"></span>
            <span class="studio-typing-dot"></span>
            <span class="studio-typing-dot"></span>
        </div>`;
        container.appendChild(aiBubble);
        container.scrollTop = container.scrollHeight;

        try {
            const apiEngine = win.OS_API || window.OS_API;
            if (!apiEngine || !apiEngine.chat) throw new Error("找不到 API 引擎");

            let baseConfig = win.OS_SETTINGS?.getConfig?.() || JSON.parse(localStorage.getItem('os_global_config') || '{}');
            // diff 路徑也要夾 maxTokens（patch 輸出更短、本就用不到大值），避免 gemini/vertex「maxOutputTokens 超過上限」
            const pureConfig = { ...baseConfig, usePresetPrompts: false, enableThinking: false, temperature: 0.2, maxTokens: Math.min(parseInt(baseConfig.maxTokens) || 8192, 32768) };

            const diffPrompt = buildDiffRefinePrompt(refineMsg);
            // 如有附圖：把圖跟 prompt 一起送（diff 路徑 apiPayload 只有單條 user message）
            const promptContent = imagesForAI.length > 0
                ? buildUserMessageContent(diffPrompt, imagesForAI)
                : diffPrompt;
            const apiPayload = [{ role: 'user', content: promptContent }];
            // 啟用的「功能 chip」用法 → 併進請求(system)，不貼輸入框（diff 修改路徑同樣帶上）
            _studioInjectActiveFeatures(apiPayload);

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
                        const _bad = _studioBadReply(finalText);
                        if (_bad.bad) {
                            // 編輯路徑同樣攔截錯誤頁/空/截斷 → 重試（面板沒被動到、snapshot 已拍可還原）
                            _renderErrorBubble(aiBubble, { message: _bad.reason }, () => _retryLastDiffRefine(aiBubble));
                            resolve();
                            return;
                        }
                        aiBubble.remove();

                        // 🆘 大改：AI 直接在這同一通給整包新面板 <json>（取代舊的「喊太大→叫你按重新設計重發」）
                        //    → 直接換上新面板，舊版進入前已拍進歷史快照可還原，用戶不用重發、不浪費第二次調用。
                        if (/<json>[\s\S]*?<\/json>/i.test(finalText)) {
                            const _oldTag = (currentParsedData && currentParsedData.tagId) || '';
                            const _oldBlock = currentParsedData ? currentParsedData.isBlock : undefined;
                            if (extractAndParseJson(finalText) && currentParsedData && !Array.isArray(currentParsedData)) {
                                // AI 偶爾漏 tagId/isBlock → 用舊面板的補回，避免面板認不出來
                                if (!currentParsedData.tagId && _oldTag) currentParsedData.tagId = _oldTag;
                                if (currentParsedData.isBlock === undefined && _oldBlock !== undefined) currentParsedData.isBlock = _oldBlock;
                                activePreviewData = currentParsedData;
                                renderPreviewPanel();
                                renderVNHistoryArea();
                                const conv = extractConversationalText(finalText);
                                const msg = '🔄 這次改動較大，已直接幫你整個重做（沒用小修補）。舊版已存進「⏪ 還原舊版」，不滿意可一鍵還原——你不用重發。' + (conv ? '\n\n' + conv : '');
                                chatMessages.push({ role: 'assistant', content: msg });
                                _studioSave(lockedChatId);
                                const fb = document.createElement('div');
                                fb.className = 'studio-bubble ai studio-bubble-enter';
                                fb.style.cssText = 'background:rgba(52,152,219,0.08); border-color:rgba(52,152,219,0.4); color:#1A1C28;';
                                fb.textContent = msg;
                                container.appendChild(fb);
                                container.scrollTop = container.scrollHeight;
                                resolve();
                                return;
                            }
                            // 整包解析失敗 → 落回下面的 diff 流程當保底
                        }

                        // 套用 diff patches（AI 沒指定的內容物理上動不到）
                        // applyDiffPatches 回傳：陣列（每條 patch 結果）/ {status:'too_big'}（AI 主動逃生 or 前端全局長度檢查 abort）
                        const results = applyDiffPatches(finalText);
                        const summary = summarizeDiffResults(results);

                        // 套用：陣列且 summary 未 failed 才更新預覽（too_big 物件返回 failed=true，預覽不動，原本面板保留）
                        if (Array.isArray(results) && !summary.failed) {
                            activePreviewData = currentParsedData;
                            renderPreviewPanel();
                        }

                        // 聊天歷史只存摘要、不存原始 <patch> 標籤回覆
                        chatMessages.push({ role: 'assistant', content: summary.text });
                        _studioSave(lockedChatId);

                        const summaryBubble = document.createElement('div');
                        summaryBubble.className = 'studio-bubble ai studio-bubble-enter';
                        const style = summary.failed
                            ? 'background:rgba(230,126,34,0.08); border-color:rgba(230,126,34,0.4); color:#f5b07d;'
                            : 'background:rgba(228,232,245,0.6); border-color:rgba(26,28,40,0.20); color:#1A1C28;';
                        summaryBubble.style.cssText = style;
                        summaryBubble.textContent = summary.text;
                        container.appendChild(summaryBubble);
                        container.scrollTop = container.scrollHeight;

                        resolve();
                    },
                    reject,
                    { useRealStream, disableTyping: useRealStream, signal: _studioAbortCtrl.signal, keepCodeFences: true }
                );
            });
        } catch (err) {
            if (err.name === 'AbortError' || err.message?.includes('abort')) {
                aiBubble.innerHTML = '<span style="color:rgba(26,28,40,0.72); font-size:12px;">⏹ 已停止</span>';
            } else {
                _renderErrorBubble(aiBubble, err, () => _retryLastDiffRefine(aiBubble));
            }
        } finally {
            _studioAbortCtrl = null;
            inputEl.disabled = false;
            sendBtn.disabled = false;
            sendBtn.innerText = '發送';
            sendBtn.onclick = handleSend;
            inputEl.focus();
        }
    }

    // 重試 VN diff refine：抽出最後 user 訊息、重新呼叫 handleDiffVNRefine
    function _retryLastDiffRefine(errBubble) {
        let lastUserIdx = -1;
        for (let i = chatMessages.length - 1; i >= 0; i--) {
            const m = chatMessages[i];
            if (m._isCompressed || m._isSummary) continue;
            if (m.role === 'user') { lastUserIdx = i; break; }
        }
        if (lastUserIdx === -1) { alert('找不到上次的訊息'); return; }
        const lastUserMsg = chatMessages[lastUserIdx];
        const textOnly = messageContentToString(lastUserMsg.content);
        if (Array.isArray(lastUserMsg.content)) {
            pendingImages = lastUserMsg.content
                .filter(p => p.type === 'image_url')
                .map(p => ({ dataUrl: p.image_url?.url || '', mime: 'image/jpeg', sizeKB: 0 }));
            renderPendingImages();
        }
        chatMessages.splice(lastUserIdx, 1);
        errBubble.remove();
        handleDiffVNRefine(textOnly);
    }

    function snapshotCurrentVNState(note, scope) {
        if (!currentParsedData) return;
        if (Array.isArray(currentParsedData)) return; // VN 是物件不是陣列
        if (!Array.isArray(currentParsedData.history)) currentParsedData.history = [];

        const d = currentParsedData;
        const snap = {
            ts: Date.now(),
            html: d.html || '',
            css: d.css || '',
            js: d.js || '',
            demoFormat: d.demoFormat || '',
            usageDesc: d.usageDesc || '',
            isBlock: !!d.isBlock,
            tagId: d.tagId || '',
            note: note || '',
            scope: scope || 'all',
            pinned: false
        };
        currentParsedData.history.unshift(snap);

        const unpinnedCount = currentParsedData.history.filter(h => !h.pinned).length;
        if (unpinnedCount > VN_HISTORY_LIMIT) {
            let toRemove = unpinnedCount - VN_HISTORY_LIMIT;
            for (let i = currentParsedData.history.length - 1; i >= 0 && toRemove > 0; i--) {
                if (!currentParsedData.history[i].pinned) {
                    currentParsedData.history.splice(i, 1);
                    toRemove--;
                }
            }
        }
    }

    function restoreFromVNSnapshot(idx) {
        if (!currentParsedData || !Array.isArray(currentParsedData.history)) return;
        const snap = currentParsedData.history[idx];
        if (!snap) return;

        snapshotCurrentVNState(`還原前自動備份（即將套用 ${formatSnapTime(snap.ts)}）`, 'all');

        currentParsedData.html = snap.html;
        currentParsedData.css = snap.css;
        currentParsedData.js = snap.js;
        currentParsedData.demoFormat = snap.demoFormat;
        currentParsedData.usageDesc = snap.usageDesc;
        if (typeof snap.isBlock === 'boolean') currentParsedData.isBlock = snap.isBlock;
        if (snap.tagId) currentParsedData.tagId = snap.tagId;

        activePreviewData = currentParsedData;
        renderPreviewPanel();
    }

    function formatSnapTime(ts) {
        const d = new Date(ts);
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function renderVNHistoryArea() {
        const area = document.getElementById('vn-studio-history-area');
        const countEl = document.getElementById('vn-studio-history-count');
        if (!area) return;

        const list = (currentParsedData && !Array.isArray(currentParsedData) && Array.isArray(currentParsedData.history))
            ? currentParsedData.history
            : [];
        if (countEl) countEl.textContent = list.length;

        if (list.length === 0) {
            area.innerHTML = '<div class="vn-history-empty">尚無快照。每次發送修改建議前會自動拍一張，最多保留 ' + VN_HISTORY_LIMIT + ' 張（📌 釘住的不計入）。</div>';
            return;
        }

        area.innerHTML = '<div class="vn-history-hint">📸 由新到舊。點「還原」可回到該版本（會先自動備份當前）。釘住的快照不會被自動清理。聊天歷史不會跟著動。</div>';

        list.forEach((snap, idx) => {
            const item = document.createElement('div');
            item.className = 'vn-history-item' + (snap.pinned ? ' pinned' : '');
            const scopeBadge = snap.scope && snap.scope !== 'all' && snap.scope !== 'auto'
                ? `[${humanizeScopeKeys([snap.scope])}] `
                : '';
            const noteText = (scopeBadge + (snap.note || '(無備註)')).replace(/</g, '&lt;');
            item.innerHTML = `
                <span class="h-time">${formatSnapTime(snap.ts)}</span>
                <span class="h-note" title="${noteText}">${noteText}</span>
                <button class="h-btn btn-restore">⏪ 還原</button>
                <button class="h-btn btn-pin">${snap.pinned ? '📌' : '📍'}</button>
                <button class="h-btn danger btn-del">✖</button>
            `;
            item.querySelector('.btn-restore').onclick = () => {
                if (confirm('要還原到這個版本嗎？目前的狀態會先拍進快照，可以再還原回來。')) {
                    restoreFromVNSnapshot(idx);
                    renderVNHistoryArea();
                }
            };
            item.querySelector('.btn-pin').onclick = () => {
                snap.pinned = !snap.pinned;
                renderVNHistoryArea();
            };
            item.querySelector('.btn-del').onclick = () => {
                if (confirm('刪除這張快照？')) {
                    currentParsedData.history.splice(idx, 1);
                    renderVNHistoryArea();
                }
            };
            area.appendChild(item);
        });
    }

    function updateVNToolbarVisibility() {
        const toolbar = document.getElementById('studio-vn-toolbar');
        if (!toolbar) return;
        const shouldShow = currentMode === 'vn_ui' && !!currentParsedData && !Array.isArray(currentParsedData);
        toolbar.classList.toggle('active', shouldShow);
        if (shouldShow) renderVNHistoryArea();
    }

    // 展示尺寸縮放器（畫布預覽 / 展廳卡共用）：手機390 / 中間1000 / 全屏=螢幕寬。
    //   用真實外框寬渲染卡片 → transform:scale 等比縮小 → 外層裁切；ResizeObserver 校正高度。看面板在各尺寸 reflow。
    function _attachVpScaler(tabsEl, wrapEl, boxEl) {
        if (!tabsEl || !wrapEl || !boxEl) return;
        wrapEl.style.overflow = 'hidden';
        wrapEl.style.minHeight = '0';
        boxEl.style.transformOrigin = 'top left';
        boxEl.style.overflow = 'hidden';
        // 用「固定螢幕框比例」當外框（跟主題預覽一致），卡片放進框裡——不再讓框去貼合卡片高度(比例會怪)
        const FRAMES = {
            phone:  { w: 390,  h: 844 },
            center: { w: 1000, h: 660 },
            full:   { w: (window.screen && screen.width) || 1920, h: (window.screen && screen.height) || 1080 }
        };
        let vp = 'phone';
        const apply = () => {
            const f = FRAMES[vp] || FRAMES.phone;
            const s = Math.min((wrapEl.clientWidth || 320) / f.w, 1);
            boxEl.style.width = f.w + 'px';
            boxEl.style.height = f.h + 'px';
            boxEl.style.transform = 'scale(' + s + ')';
            wrapEl.style.height = Math.round(f.h * s) + 'px';
            tabsEl.querySelectorAll('[data-pv]').forEach(b => b.classList.toggle('active', b.dataset.pv === vp));
        };
        tabsEl.querySelectorAll('[data-pv]').forEach(b => b.onclick = () => { vp = b.dataset.pv; apply(); });
        apply();
        setTimeout(apply, 80);   // 等面板 JS / 圖片渲染後再套一次
    }

    function renderPreviewPanel() {
        const previewMain = document.getElementById('studio-preview-main');
        const sourceEl = document.getElementById('studio-source-content');
        const exportBtn = document.getElementById('studio-export-btn');
        const publishBtn = document.getElementById('studio-publish-btn');

        let displayData = currentParsedData || activePreviewData;

        const fabEl = document.getElementById('studio-preview-fab');
        if (fabEl) fabEl.style.display = 'none';   // 浮動 FAB 退役：改用 header 的 👁️ 預覽鈕

        if (!displayData) {
            previewMain.innerHTML = `<div class="studio-empty">尚未生成任何內容。<br><br>請輸入點子讓 AI 創作。</div>`;
            sourceEl.textContent = '';
            exportBtn.style.display = 'none';
            if (publishBtn) publishBtn.style.display = 'none';
            togglePreviewDrawer(false);   
            return;
        }

        // 預覽改由 header 👁️ 預覽鈕開（固定位置、不綁資料），不自動彈、不掛聊天卡片

        const isUnsaved = !!currentParsedData;
        exportBtn.style.display = isUnsaved ? 'block' : 'none';
        
        if (publishBtn) {
            publishBtn.style.display = 'none';
        }

        sourceEl.textContent = JSON.stringify(displayData, null, 2);
        previewMain.innerHTML = '';

        if (currentMode === 'vn_ui') {
            const data = displayData;
            const safeFormat = (data.demoFormat || '無結構定義').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeTagId = (data.tagId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');

            previewMain.innerHTML = `
                <div class="studio-card">
                    <div class="studio-card-title">標籤 ID: [${data.tagId || '未命名'}]</div>
                    <div style="font-size:12px; color:rgba(26,28,40,0.80); margin-bottom:8px; padding:6px; background:rgba(228,232,245,0.5); border-left:3px solid rgba(26,28,40,0.30);">💡 <b>給劇本 AI 的使用說明：</b><br>${data.usageDesc || '無特別說明'}</div>
                    <div style="font-size:12px; color:rgba(26,28,40,0.68); margin-bottom:10px;">資料格式示範：<br><span style="font-family:monospace; color:#FFF;">${safeFormat}</span></div>
                    <div class="studio-pv-tabs">
                        <button class="studio-pv active" data-pv="phone" title="手機端（外框約 390）">手機</button>
                        <button class="studio-pv" data-pv="center" title="桌面·中間聊天區（外框約 1000）">中間</button>
                        <button class="studio-pv" data-pv="full" title="桌面·全屏（外框＝螢幕寬）">全屏</button>
                    </div>
                    <div class="studio-pv-wrap" id="studio-pv-wrap">
                        <div class="studio-pv-box" id="studio-pv-box">
                            <style>${data.css || ''}</style>
                            <div class="vn-dynamic-panel-${safeTagId}" style="position:relative; width:100%; height:auto; display:flex; flex-direction:column;">
                                ${(data.html || '').replace(/\{\{1\}\}/g, '參數A').replace(/\{\{2\}\}/g, '參數B')}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            _attachVpScaler(previewMain.querySelector('.studio-pv-tabs'), previewMain.querySelector('#studio-pv-wrap'), previewMain.querySelector('#studio-pv-box'));

            if (data.isBlock && data.js) {
                setTimeout(() => {
                    try {
                        const rawLines = (data.demoFormat || '').split('\n').map(l => l.trim()).filter(Boolean);
                        const lines = rawLines.filter(l => !l.startsWith('<') && !l.startsWith('</'));
                        const container = previewMain.querySelector(`.vn-dynamic-panel-${safeTagId}`);
                        if (!container) return;
                        
                        let safeJs = data.js || '';
                        safeJs = safeJs.trim().replace(new RegExp('^\\x60\\x60\\x60(?:javascript|js|html|css)?\\s*', 'i'), '').replace(new RegExp('\\s*\\x60\\x60\\x60\\s*$'), '').trim();
                        
                        const onComplete = () => { 
                            const msg = document.createElement('div');
                            msg.style.cssText = 'position:absolute; top:5px; right:5px; background:rgba(46,204,113,0.8); color:white; padding:4px 8px; font-size:12px; border-radius:4px; z-index:999;';
                            msg.innerText = '✅ 腳本已觸發 onComplete()';
                            container.parentElement.appendChild(msg);
                        };

                        // 🛡️ 注入預覽隔離標記
                        window.__IS_PREVIEW = true;
                        const st = _buildPreviewSt(lines);
                        const runMicroApp = new Function('container', 'lines', 'onComplete', 'st', safeJs);
                        runMicroApp(container, lines, onComplete, st);
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
                    <span style="color:#1A1C28; font-weight:bold;">${v.key}</span>
                    <span style="color:rgba(26,28,40,0.72); font-size:11px;">類型: ${v.type} | 預設: ${v.default}</span>
                </div>
            `).join('');

            previewMain.innerHTML = `
                <div class="studio-card">
                    <div class="studio-card-title">🎲 [${data.id || '未知ID'}] ${data.name || '未命名變數包'}</div>
                    <div style="font-size:13px; color:#1A1C28;">${varsHtml}</div>
                </div>
            `;
        }

        // 🔪 同步 VN 工具列顯示狀態（vn_ui 模式有資料 → 顯示；其他模式 → 隱藏）
        updateVNToolbarVisibility();

        // 🔪 持久化當前預覽狀態：雙重保險
        // 1. localStorage cache（快、輕量）
        // 2. 聊天記錄內隱藏 system 訊息（重整後 localStorage 被清也救得回）
        try { _saveParsedCache(getChatSessionId()); } catch(e) {}
        try { _saveLatestPanelToHistory(); } catch(e) {}
    }

    // ===== 預設模板安裝器 =====
    win.OS_STUDIO = {
        launch, openVnComponents, attachVpScaler: _attachVpScaler,
        // 給「應用工坊 · 我的應用」的管理按鈕用：靠 srcTplId 操作該 app 的可編輯底稿
        openEditApp: async function (tplId, c) {
            try { if (c) launch(c); } catch (e) {}
            const tpl = await _getTplById(tplId);
            if (!tpl) { alert('找不到這個應用的可編輯底稿（可能是舊資料，重新生成一次即可）'); return; }
            setTimeout(function () { try { _enterEditMode(tpl); } catch (e) { console.warn('[OS_STUDIO] openEditApp', e); } }, 60);
        },
        injectAppToTavern: async function (tplId) {
            const tpl = await _getTplById(tplId);
            if (!tpl) { alert('找不到底稿'); return; }
            try { importToSillyTavern(tpl); } catch (e) { alert('載入酒館失敗：' + ((e && e.message) || e)); }
        },
        exportApp: async function (tplId) {
            const tpl = await _getTplById(tplId);
            if (!tpl) { alert('找不到底稿'); return; }
            try { exportOneVnUiTemplate(tpl); } catch (e) {}
        },
        toggleAppLobby: async function (tplId) {
            const tpl = await _getTplById(tplId);
            if (!tpl) return null;
            tpl.lobbyEnabled = !tpl.lobbyEnabled;
            try { await win.OS_DB.saveVNTagTemplate(tpl); await syncActiveTagsToLocal(); } catch (e) {}
            return !!tpl.lobbyEnabled;
        },
        // 給「我的應用」卸載用：共用＝一個東西（VN組件＋app），卸載 app 時連它的 VN 組件模板＋酒館殘留一起清。
        // 只清模板側（app 那側由 app_store 自己刪）→ 卸載＝整個面板消失，不留 VN 組件孤兒。
        purgeTemplateFully: async function (tplId) {
            if (!tplId) return;
            try {
                const tpl = await _getTplById(tplId);
                try { await win.OS_DB.deleteUITemplate(tplId); } catch (e) {}
                try { await syncActiveTagsToLocal(); } catch (e) {}
                if (win.VN_DynamicParser) { try { await win.VN_DynamicParser.init(); } catch (e) {} }
                if (tpl && tpl.tagId) { try { await _removeTavernPanelArtifacts(tpl.tagId); } catch (e) {} }
            } catch (e) { console.warn('[OS_STUDIO] purgeTemplateFully', e); }
        }
    };
})();