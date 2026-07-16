// ----------------------------------------------------------------
// [檔案] os_studio.js (通用靈感創作室 Studio - V2.5 移動端 UX 終極優化)
// 職責：優化移動端體驗，預覽區置頂、輸入區置底，加入點擊外部關閉與 Toggle 切換。
// ----------------------------------------------------------------
(function() {
    const win = window.parent || window;
    console.log('[PhoneOS] 啟動通用靈感創作室 (Creator Studio V2.5)...');


    // 直接編輯原碼 modal（抽成常數：完整創作室 studioHTML 與獨立 VN組件區都用同一份，免得獨立區沒這 modal→編輯原碼按鈕死掉）
    const RAW_EDIT_MODAL_HTML = `
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
        </div>`;
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

                <!-- 創作室首頁(今天要做什麼)已移除：功能全整併進「應用商城」工坊首頁，這裡不再有落地首頁 -->

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
        ${RAW_EDIT_MODAL_HTML}

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
  · 🚨🚨 捲動與溢出鐵律（最常踩、反覆改不好就是漏了這條）：
    ① 只有「會變長的那一個內容區」(清單/日誌/訊息串) 給 flex:1;min-height:0;overflow-y:auto；標題/圖示/裝飾/關閉鈕一律 flex-shrink:0。否則內容一多，固定元素會被擠出卡片外（用戶最常抱怨「圖示/印章被推出去」就是這個）。父容器要 display:flex;flex-direction:column 且卡本體 overflow:hidden。
    ② 同一個盒子「不能」又要內部捲動裁切(overflow:hidden) 又要讓某元素溢出邊緣(如封蠟/緞帶壓在卡緣外)——矛盾無解、怎麼調都失敗。真要溢出裝飾就拆兩層：外層 wrapper overflow:visible 放 position:absolute 的溢出裝飾、內層卡 overflow:hidden 負責捲動。
    ③ 劇情裡卡片外層 .vn-dynamic-panel-<tagId> 的位置/寬/高/置中是「引擎寫死的 inline style」控制的，改它的 margin/width 想重新定位「沒用」(會被覆蓋)。只調卡片「內部」樣式，別靠改外層 wrapper 來搬位置。
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
- 🚫【鐵則】要把面板生的內容「送進劇情／對話」只准用回傳對話框 chip 提供的 st.toChat（貼輸入框、使用者自己送）或 st.toSystem（直接插一則 system 訊息進聊天）。**絕對禁止**用 createChatMessages／TavernHelper／generateRaw／直接操作 #send_textarea 等酒館原生 API 自己建訊息或硬送。沒帶回傳對話框 chip 用法就「不要做送進對話這件事」，別用原生 API 替代。
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
        },
        'fx': {
            name: '特效工坊',
            prompt: `你是視覺小說的「畫面特效配方師」。用戶描述想要的畫面效果（例如下雪、受傷閃紅、雷光一閃），你把它翻譯成一份 JSON「配方」。你只輸出配方、不寫任何程式碼——特效由固定引擎照配方播放，配方以外的東西一律無效。

【輸出格式】需求清楚後，輸出被 <json> 標籤包裹的單一 JSON 物件：
{"fxId":"...","name":"...","desc":"...","kind":"...","steps":[...]}
- fxId：fx- 開頭、只能小寫英文/數字/連字號，取有意義的英文短詞
- name：中文名，6 字內
- desc：一句話寫「什麼劇情時觸發」——劇情 AI 全靠這句決定何時用，要寫得像挑選指南
- kind：once＝瞬發（打擊/閃光類，播完自動消失）；loop＝持續（天氣/氛圍類，掛著直到換場）

【可用積木（steps 的元素，只准用這些，別發明新欄位）】
1. 粒子 {"block":"particles","preset":"見下","count":數量,"size":像素,"speed":速度,"color":"CSS顏色"}
   preset 只准八選一：snow(飄雪)、rain(雨絲)、drip(頂端滲液下滑)、petal(花瓣旋落)、ember(火星上升)、burst(中心爆散)、bubble(氣泡上升)、sparkle(原地閃爍)
   範圍：count 1-300、size 1-40、speed 5-1200（雨類 700 以上、飄落類 40-80、上升類 60-150）
2. 閃色 {"block":"flash","color":"顏色","times":閃幾下1-6}
3. 震動 {"block":"shake","strength":力度1-24}（只准用在 once）
4. 邊緣滲色 {"block":"edge","color":"顏色"}（畫面四周暈影：受傷/中毒/瀕死/回憶）
5. 光軌 {"block":"streak","color":"顏色","angle":角度0-360,"width":粗細1-12}（一道光掃過：斬擊/流星；只准 once）
6. 罩色 {"block":"tint","color":"顏色","alpha":0.02-0.45}（整屏染色氛圍）
7. 閃電 {"block":"bolt","color":"顏色","width":粗細1-12}（鋸齒閃電劈下、帶分枝與頻閃：雷擊/魔法/衝擊；只准 once，常配 flash+shake）
8. 簡易圖形 {"block":"svg","svg":"<svg viewBox=\\"0 0 寬 高\\">...</svg>","anim":"動畫","pos":"位置","size":寬度百分比8-100}
   這塊是你「自己畫」：漫畫符號類（怒氣井字/汗滴/驚嘆號/問號/集中線/星星/音符…）用扁平簡約風 SVG 畫出來——幾何形狀+粗線條+單純配色，不要寫實漸層
   規矩：必須帶 viewBox；只准純圖形（path/circle/rect/line/g 這類），script/外部圖片/連結一律會被引擎剝掉；只准 once
   anim 五選一：pop(彈出)、drop(砸下)、rise(飄升淡出)、pulse(脈衝跳動)、burst(擴散消失)；pos 四選一：center/top/bottom/full(鋪滿全屏，集中線用這個)
9. 自訂繪製 {"block":"code","js":"每幀執行的繪製程式碼"}
   上面積木都做不出來的效果，才用這塊「自己寫」。js 是一段函式體，引擎每幀呼叫，可用參數：
   - ctx：canvas 2D context，只在它上面畫，不准碰 DOM/window/計時器/事件
   - p：進度 0到1（once=播放進度；loop=平常 1、收尾淡出時降到 0——把它乘進透明度）
   - dt：這幀經過秒數（所有移動量都要乘 dt，否則不同裝置速度不一）
   - t：開播至今的秒數（做週期動畫用）
   - w、h：畫布寬高（座標一律按 w/h 比例算，別寫死像素）
   - state：跨幀保存資料的空物件（粒子陣列、初始化旗標放這裡，首幀 if(!state.init){...;state.init=true} 建立）
   規矩：自己畫的粒子/元素總數 200 以內；不要 shadowBlur 大面積濫用（手機會卡）；不留殘影就每幀畫新的（畫布由引擎清）；程式碼連續出錯 3 次引擎會停用這個特效

【時間軸】kind=once 時每個積木都要加 "at":開始毫秒 和 "dur":持續毫秒（總長 8000 內）；kind=loop 不用 at/dur，且只准用 particles/tint/edge/code。

【設計原則】
- 積木優先：現成積木能組出來的就用積木（穩、省），組不出來才上自訂繪製 code
- 寧少勿多：2-4 個積木就能做出好特效，堆太多會亂
- 顏色配合效果的情緒（血用暗紅、雷用青白、治癒用暖金這類直覺）
- 用戶描述不清楚就先用一兩句話確認，別亂猜
- 輸出 <json> 前先用一句話講設計思路`,
            onSave: async (data) => {
                const fxEngine = window.OS_FX || win.OS_FX;
                const norm = fxEngine && fxEngine.validate ? fxEngine.validate(data) : null;
                if (!norm) throw new Error('配方格式不對，請叫 AI 重新輸出一次');
                if (!win.OS_DB || !win.OS_DB.saveUITemplate) throw new Error('資料庫不可用');
                // 同 fxId 視為改版 → 覆蓋舊檔，不疊重複條目
                let existing = null;
                try {
                    const all = await win.OS_DB.getAllUITemplates();
                    existing = (all || []).find(t => t && t.isFX && t.fxRecipe && String(t.fxRecipe.fxId || '').toLowerCase() === norm.fxId);
                } catch (e) {}
                await win.OS_DB.saveUITemplate({
                    id: existing ? existing.id : ('fx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
                    title: norm.name,
                    isFX: true,
                    panelType: '特效',
                    fxRecipe: norm,
                    createdAt: existing ? existing.createdAt : Date.now(),
                });
                try { if (fxEngine && fxEngine.reloadSaved) await fxEngine.reloadSaved(); } catch (e) {}
                alert(`🎉 特效「${norm.name}」已存好！劇情 AI 之後就會在合適時機用它`);
            }
        }
    };

    let currentMode = 'vn_ui';
    let _studioTop = 'vn_ui';  // 頂層導覽：vn_ui | theme | worldbook | persona（創作室首頁已移除，全從工坊帶 landMode 進）
    let _landedDirect = false; // (保留兼容) launch 仍會設；返回鈕已統一直接退出，不再讀它
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
        switchTopMode(landMode || 'vn_ui');     // 有指定就落該工作；沒帶就落製作面板(vn_ui)——不再有「今天要做什麼」死首頁
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
        { label: '📤 回傳對話框', feature: true, key: 'tochat', text: '【回傳對話框功能】兩種回傳法，依需求選一個：\n① st.toChat(文字, opts)＝貼回「輸入框（送出框）」：預設只貼、使用者自己按送出；傳 {send:true} 直接幫送。用在「要讓使用者挑一條、可再編輯後送進劇情當輸入／指令」（例：隨機事件生 5 條、選 1 條 toChat）。\n② st.toSystem(文字)＝不經輸入框，直接把文字當「system 訊息」插進聊天室成最新一則（旁白/系統公告式，不用再按送出）。用在「app 的結果要直接顯示在劇情流裡」（例：擲骰結果、系統宣告、事件觸發）。' }
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
            // 已無創作室首頁：頂層返回一律直接退出創作室、回到應用商城工坊（各模式的內部返回由該模式自己處理）
            const app = document.getElementById('os_studio_app'); if (app) app.remove();
        };
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
                if (!isOpen) win.OS_STUDIO_DIFF?.renderVNHistoryArea();   // 拆檔：os_studio_diff_engine.js
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
                if (tab.dataset.tab === 'gallery') {
                    if (currentMode === 'fx') _renderFxLibrary(document.getElementById('studio-gallery-content'));
                    else win.OS_STUDIO_VC?.loadStudioGallery();   // 展廳拆檔：os_studio_vn_gallery.js
                }
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
        if (mode === 'theme') {
            if (cont) cont.classList.add('top-theme');
            renderThemePanel();
        } else if (mode === 'worldbook') {
            if (cont) cont.classList.add('top-worldbook');
            win.OS_STUDIO_WB?.renderWorldbookPanel?.();   // 世界書設計師已拆檔 → os_studio_worldbook.js（懶解析）
        } else if (mode === 'persona') {
            if (cont) cont.classList.add('top-persona');
            win.OS_STUDIO_MC?.renderPersonaPanel?.();   // 我的角色已拆檔 → os_studio_persona.js（懶解析）
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
        if (galleryTab) {
            // 同一個第二 tab 兩用：vn_ui=VN組件展廳、fx=特效庫（照 Rae 指定的雙 tab 版型）
            galleryTab.style.display = (modeId === 'vn_ui' || modeId === 'fx') ? '' : 'none';
            galleryTab.innerHTML = modeId === 'fx'
                ? '<i class="fa-solid fa-wand-magic-sparkles"></i> 特效庫'
                : '<i class="fa-solid fa-puzzle-piece"></i> VN組件';
        }
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
    // 🌍 世界書 tab 已拆檔 → os/os_studio_worldbook.js（2026-07-16）
    //   面板入口走 win.OS_STUDIO_WB?.renderWorldbookPanel()（懶解析，見 switchTopMode）。
    //   _wbTH/_wbToast 留核心：經 _b 橋供子模組（世界書/我的角色）取用。
    // ══════════════════════════════════════════════════════════════
    const _wbTH = () => (window.parent || window).TavernHelper || window.TavernHelper;
    function _wbToast(msg) { try { const w = (window.parent || window); w.toastr && w.toastr.success(msg); } catch (e) {} }

    // ══════════════════════════════════════════════════════════════
    // 🧑 我的角色（人設寫作）已拆檔 → os/os_studio_persona.js（2026-07-16）
    //   面板入口走 win.OS_STUDIO_MC?.renderPersonaPanel()（懶解析，見 switchTopMode）。
    // ══════════════════════════════════════════════════════════════

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
                    const _bad = _studioBadReply(String(full || ''));   // 錯誤頁/空/截斷 → 問重試
                    if (_bad.bad) { genBtn.textContent = orig; genBtn.disabled = false; _studioConfirmRetry(_bad.reason, () => genBtn.onclick()); return; }
                    let out = String(full || '');
                    const m = out.match(/```(?:css)?\s*([\s\S]*?)```/i);
                    if (m) out = m[1];
                    out = out.trim();
                    if (out) { area.value = out; refreshPreview(); VT.setCss(chatId, out); }
                    genBtn.textContent = '✓ 已生成（已預覽+套用）'; genBtn.disabled = false;
                    setTimeout(() => { genBtn.textContent = orig; }, 1800);
                },
                (err) => { genBtn.textContent = orig; genBtn.disabled = false; _studioConfirmRetry((err && err.message) || err, () => genBtn.onclick()); }
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
        
        const hiddenUI = '<div class="studio-hidden-ui"><img src="https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/studio_jrpg/wax-seal.png" alt=""><span>已生成，點上方 <i class="fa-solid fa-eye"></i> 預覽查看</span></div>';
        
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
            win.OS_STUDIO_DIFF?.snapshotCurrentVNState(text, 'all');   // 拆檔：os_studio_diff_engine.js
            win.OS_STUDIO_DIFF?.renderVNHistoryArea();
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
                    { useRealStream, disableTyping: useRealStream, signal: _studioAbortCtrl.signal, keepCodeFences: true, stream: true }   // stream: 🍎/跟隨酒館路徑也開串流——整包面板HTML是長輸出，非串流會撞閘道逾時504
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

    // 一次性 AI 流程（匯入整理/對標世界/換皮/主題生成）的統一壞回覆處置：問一聲就能重試，不用重走整個入口
    //（聊天流不用這個——世界書/人設聊天各自有錯誤泡泡＋重試鈕）
    function _studioConfirmRetry(reason, retryFn, fallbackFn) {
        if (confirm('AI 回覆有問題：' + String(reason || '未知錯誤').slice(0, 140) + '\n\n要重試嗎？')) retryFn();
        else if (fallbackFn) fallbackFn();
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
        // 🚨組件 CSS 全是 .vn-dynamic-panel-<tagId> 前綴：App 這層必須也帶這個 class 當作用域根，否則選擇器全不命中→掉樣式(VN 預覽/劇情都有包這層才有樣式)
        var safeTagId = String(tpl.tagId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        return '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8">'
            + '<style>html,body{margin:0;padding:0;height:100%;}#app-root{box-sizing:border-box;width:100%;min-height:100%;}'
            + css + '</style></head><body><div id="app-root" class="vn-dynamic-panel-' + safeTagId + '">' + html + '</div>'
            + '<scr' + 'ipt>(function(){'
            + 'var container=document.getElementById("app-root");var lines=[];'
            + 'var st={'
            +   'md:function(t){if(!t)return "";t=String(t).replace(/\\\\n/g,"\\n");try{var P=window.parent,S=(P&&P.showdown)||window.showdown;if(S){var h=new S.Converter({simpleLineBreaks:true,tables:true,strikethrough:true}).makeHtml(String(t));var D=(P&&P.DOMPurify)||window.DOMPurify;return D?D.sanitize(h):h;}}catch(e){}return String(t).replace(new RegExp("[*][*](.+?)[*][*]","g"),function(_,p){return "<b>"+p+"</b>";}).replace(new RegExp("[*](.+?)[*]","g"),function(_,p){return "<i>"+p+"</i>";}).replace(new RegExp("[`](.+?)[`]","g"),function(_,p){return "<code>"+p+"</code>";});},'
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
            +   'toSystem:function(t){try{return window.toSystem?window.toSystem(t):false;}catch(e){return false;}},'
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
            // 純應用只是手機 app、不是 VN 組件 → 絕不注入給劇情 AI（否則 AI 會被教著在正文寫 app-only 標籤）
            const activeTags = templates.filter(t => t.isActive && t.demoFormat && t.panelType !== '純應用');
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
          .replace(/\\\\n/g, '\\n')   // 字面換行符 → 真換行（對齊 story st.md；此註解勿寫反斜線,這是模板字串、會變真換行斬斷註解）
          .replace(rxBold, function(_, p1){ return '<b>' + p1 + '</b>'; })
          .replace(rxItalic, function(_, p1){ return '<i>' + p1 + '</i>'; })
          .replace(rxCode, function(_, p1){ return '<code>' + p1 + '</code>'; })
          .replace(/\\n/g, '<br>')
          .replace(/(<br>\\s*){3,}/g, '<br><br>');
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

    // 🧹 舊制殘留清理：以前「注入酒館」會把使用說明寫成主世界書條目 [VN面板] X——
    //    使用說明已改走自動注入（os_app_memory_inject 常駐/關鍵字），條目不再創建；
    //    這裡負責把舊條目掃掉（注入時順手清 + 刪組件時清，兩邊共用）。
    async function _deleteWbUsageEntry(th, safeTagId) {
        try {
            const wbInfo = th.getCharWorldbookNames ? th.getCharWorldbookNames('current') : null;
            const wb = wbInfo && wbInfo.primary;
            if (!wb || !th.getWorldbook || !th.deleteLorebookEntries) return false;
            const sn = `[VN面板] ${safeTagId}`;
            const ents = await th.getWorldbook(wb);
            const hit = (ents || []).filter(e => e && e.name === sn);
            if (hit.length) { await th.deleteLorebookEntries(wb, hit.map(e => e.uid)); return true; }
            return false;
        } catch (e) { console.warn('[Studio] 清舊制世界書說明條目失敗', e); return false; }
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

            // 使用說明走自動注入、不再寫世界書條目；順手掃掉舊制殘留的同名條目
            let wbMsg = "";
            try { if (await _deleteWbUsageEntry(th, safeTagId)) wbMsg = "\n🧹 已清掉舊版留在世界書的使用說明條目（說明現在自動注入、不佔世界書）。"; } catch (e) {}

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
        await _deleteWbUsageEntry(th, safeTagId);
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

    // 缺 modal 就補建(獨立 VN組件區沒掛完整 studioHTML)：注入 body + wire 事件，讓「編輯原碼」任何情境都能用
    function _ensureRawEditModal() {
        if (document.getElementById('studio-raw-edit-modal')) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = RAW_EDIT_MODAL_HTML;
        const el = tmp.firstElementChild;
        if (el) { document.body.appendChild(el); _setupRawEditModalEvents(); }
    }
    function openRawEditModal(tpl) {
        _ensureRawEditModal();
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
                    win.OS_STUDIO_VC?.loadStudioGallery();   // 展廳拆檔：os_studio_vn_gallery.js
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

    // ────────────────────────────────────────────────────────────────
    // VN 組件展廳（四頁換頁/群組chip/複製/設置/關鍵字注入/打包匯出入/孤兒清理/縮圖懶載/_activatePreview）
    // 已拆到 os_studio_vn_gallery.js（win.OS_STUDIO_VC；靠下面 _b 橋）。
    // 核心以 win.OS_STUDIO_VC?.loadStudioGallery()/openVnComponents()/exportOneVnUiTemplate()/toggleAppLobby() 懶解析呼叫。
    // ────────────────────────────────────────────────────────────────
    // HTML 轉義（核心＋全拆檔子模組共用；_b 橋成員）
    function _sgcEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    // 視覺回饋：用酒館原生 toastr（win.toastr，全擴展通用）；沒有就退回 alert。
    // TauriTavern 下載會直接存本機、但「不彈任何通知」→ 一定要自己給可見回饋。
    function _studioToast(msg, type, title) {
        const t = win.toastr || window.toastr;
        const fn = t && typeof t[type] === 'function' ? t[type] : (t && t.info);
        if (fn) { try { fn.call(t, msg, title || '創作室'); return; } catch (e) {} }
        alert(msg);
    }

    // ────────────────────────────────────────────────────────────────
    // VN 煉丹：Diff-based refine 引擎（diff prompt 組裝/patch 解析套用/摘要/humanizeScopeKeys）
    // 已拆到 os_studio_diff_engine.js（win.OS_STUDIO_DIFF；靠檔尾 _b 橋的 currentParsedData getter 等）。
    // 核心以 win.OS_STUDIO_DIFF?.buildDiffRefinePrompt/applyDiffPatches/summarizeDiffResults/
    //   extractConversationalText/snapshotCurrentVNState/renderVNHistoryArea(...) 懶解析呼叫；
    // 主聊天送出鏈薄呼叫層（handleDiffVNRefine/_retryLastDiffRefine）留在下面、不搬。
    // ────────────────────────────────────────────────────────────────

    async function handleDiffVNRefine(refineMsg) {
        const inputEl = document.getElementById('studio-input');
        const sendBtn = document.getElementById('studio-send-btn');
        const container = document.getElementById('studio-chat-history');

        // 診斷 log：發送 diff 前印當前面板狀態（重整 / cache miss 的問題可從這裡看出來）
        const _d = currentParsedData || {};
        console.log(`[Studio] 🔧 diff refine 觸發: tagId=${_d.tagId || '?'}, css=${(_d.css||'').length}字, html=${(_d.html||'').length}字, 用戶建議="${refineMsg.slice(0,50)}", 附圖=${pendingImages.length}張`);

        // 修改前先拍快照（防 AI 改壞可還原）
        win.OS_STUDIO_DIFF?.snapshotCurrentVNState(refineMsg, 'diff');   // 拆檔：os_studio_diff_engine.js
        win.OS_STUDIO_DIFF?.renderVNHistoryArea();

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

            const diffPrompt = win.OS_STUDIO_DIFF?.buildDiffRefinePrompt(refineMsg);   // 拆檔：os_studio_diff_engine.js
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
                                win.OS_STUDIO_DIFF?.renderVNHistoryArea();
                                const conv = win.OS_STUDIO_DIFF?.extractConversationalText(finalText);
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
                        const results = win.OS_STUDIO_DIFF?.applyDiffPatches(finalText);
                        const summary = win.OS_STUDIO_DIFF?.summarizeDiffResults(results);

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
                    { useRealStream, disableTyping: useRealStream, signal: _studioAbortCtrl.signal, keepCodeFences: true, stream: true }   // stream: 🍎/跟隨酒館路徑也開串流——整包面板HTML是長輸出，非串流會撞閘道逾時504
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

    // 歷史快照（snapshotCurrentVNState/restoreFromVNSnapshot/formatSnapTime/renderVNHistoryArea）
    // → 已拆到 os_studio_diff_engine.js（win.OS_STUDIO_DIFF）

    function updateVNToolbarVisibility() {
        const toolbar = document.getElementById('studio-vn-toolbar');
        if (!toolbar) return;
        const shouldShow = currentMode === 'vn_ui' && !!currentParsedData && !Array.isArray(currentParsedData);
        toolbar.classList.toggle('active', shouldShow);
        if (shouldShow) win.OS_STUDIO_DIFF?.renderVNHistoryArea();   // 拆檔：os_studio_diff_engine.js
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

    // ⚡ 特效庫：群組chip篩選 + 真開關(關=AI白名單剔除+不播) + 就地試播 + 自製可刪（照VN組件的組別/開關體感）
    let _fxLibGroup = '全部';
    async function _renderFxLibrary(container) {
        const fxEngine = window.OS_FX || win.OS_FX;
        if (!fxEngine) { container.innerHTML = '<div class="studio-empty">特效引擎還沒載入，稍等幾秒再進來</div>'; return; }
        try { await fxEngine.reloadSaved(); } catch (e) {}
        const _esc = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let saved = [];
        try {
            const all = await win.OS_DB.getAllUITemplates();
            saved = (all || []).filter(t => t && t.isFX && t.fxRecipe);
        } catch (e) {}
        const dbIdByFx = {};
        saved.forEach(t => { dbIdByFx[String(t.fxRecipe.fxId || '').toLowerCase()] = t.id; });
        const rows = fxEngine.listAll().map(r => ({ recipe: r, dbId: dbIdByFx[r.fxId] || null, mine: !!dbIdByFx[r.fxId] }));
        const groups = Array.from(new Set(rows.map(x => x.recipe.group).filter(Boolean)));
        if (_fxLibGroup !== '全部' && groups.indexOf(_fxLibGroup) === -1) _fxLibGroup = '全部';   // 群組被清空就退回全部
        const shown = rows.filter(x => _fxLibGroup === '全部' || x.recipe.group === _fxLibGroup);

        container.innerHTML = `
            <div class="studio-card">
                <div class="studio-card-title">特效庫</div>
                <div class="fx-pv-desc">劇情 AI 會在合適時機自動觸發「開著」的特效；關掉的不會再用。點特效名旁的小標籤可以分組。</div>
                <div class="fx-lib-actions">
                    <button class="fx-lib-act" data-fx-export="1" type="button"><i class="fa-solid fa-file-export"></i> 匯出自製</button>
                    <button class="fx-lib-act" data-fx-import="1" type="button"><i class="fa-solid fa-file-import"></i> 匯入</button>
                    <button class="fx-lib-act danger" data-fx-clear="1" type="button"><i class="fa-solid fa-trash"></i> 清空自製</button>
                    <input type="file" id="fx-lib-import-file" accept=".json,application/json" class="fx-file-hidden">
                </div>
                ${groups.length ? `<div class="fx-grp-row">
                    ${['全部'].concat(groups).map(g => `<button class="fx-grp-chip${g === _fxLibGroup ? ' active' : ''}" data-fx-chip="${_esc(g)}" type="button">${_esc(g)}</button>`).join('')}
                    ${_fxLibGroup !== '全部' ? `<button class="fx-grp-batch" data-fx-batch="1" type="button">這組全開</button><button class="fx-grp-batch" data-fx-batch="0" type="button">這組全關</button>` : ''}
                </div>` : ''}
                <div class="fx-lib-list">${shown.map((row, i) => `
                    <div class="fx-lib-row${row.recipe.enabled ? '' : ' fx-off'}">
                        <div class="fx-lib-info">
                            <div class="fx-lib-name">${_esc(row.recipe.name)} <span class="fx-lib-kind">${row.recipe.kind === 'loop' ? '持續氛圍' : '瞬間效果'}</span>${row.mine ? '' : ' <span class="fx-lib-kind fx-lib-builtin">內建</span>'} <button class="fx-lib-grp" data-fx-grp="${i}" type="button">${row.recipe.group ? _esc(row.recipe.group) : '＋分組'}</button></div>
                            <div class="fx-lib-desc">${_esc(row.recipe.desc || '')}</div>
                        </div>
                        <label class="fx-switch" title="開著=劇情AI會用"><input type="checkbox" data-fx-on="${i}" ${row.recipe.enabled ? 'checked' : ''}><span class="fx-sw-knob"></span></label>
                        <button class="fx-lib-btn" data-fx-play="${i}" type="button" title="試播"><i class="fa-solid fa-play"></i></button>
                        ${row.mine ? `<button class="fx-lib-btn danger" data-fx-del="${i}" type="button" title="刪除"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </div>`).join('')}
                </div>
            </div>`;

        // 群組chip篩選
        container.querySelectorAll('[data-fx-chip]').forEach(btn => {
            btn.onclick = () => { _fxLibGroup = btn.dataset.fxChip; _renderFxLibrary(container); };
        });
        // 批次：目前篩選那組全開/全關
        container.querySelectorAll('[data-fx-batch]').forEach(btn => {
            btn.onclick = () => {
                const on = btn.dataset.fxBatch === '1';
                shown.forEach(x => fxEngine.setEnabled(x.recipe.fxId, on));
                _renderFxLibrary(container);
            };
        });
        // 單顆開關（就地改樣式、不重繪，保住滾動位置）
        container.querySelectorAll('[data-fx-on]').forEach(sw => {
            sw.onchange = () => {
                const row = shown[Number(sw.dataset.fxOn)];
                fxEngine.setEnabled(row.recipe.fxId, sw.checked);
                sw.closest('.fx-lib-row').classList.toggle('fx-off', !sw.checked);
            };
        });
        // 分組標籤：點了輸入組名（留空=取消分組）
        container.querySelectorAll('[data-fx-grp]').forEach(btn => {
            btn.onclick = () => {
                const row = shown[Number(btn.dataset.fxGrp)];
                const cur = row.recipe.group || '';
                const g = prompt(`「${row.recipe.name}」歸到哪一組？\n（留空＝不分組；輸入新名字＝建新組）`, cur);
                if (g === null) return;
                fxEngine.setGroup(row.recipe.fxId, g.trim());
                _renderFxLibrary(container);
            };
        });
        // 就地試播：預覽台展開在被點那一列的正下方（滾到哪播到哪、不用回頂上看）
        container.querySelectorAll('[data-fx-play]').forEach(btn => {
            btn.onclick = () => {
                try {
                    container.querySelectorAll('.fx-lib-row-stage').forEach(n => n.remove());   // 收掉別列展開的台
                    const rowEl = btn.closest('.fx-lib-row');
                    const stage = document.createElement('div');
                    stage.className = 'vn-fx-preview-stage fx-lib-row-stage';
                    rowEl.insertAdjacentElement('afterend', stage);
                    fxEngine.preview(shown[Number(btn.dataset.fxPlay)].recipe, stage);
                } catch (e) { console.warn('[Studio] 特效試播失敗:', e); }
            };
        });
        container.querySelectorAll('[data-fx-del]').forEach(btn => {
            btn.onclick = async () => {
                const row = shown[Number(btn.dataset.fxDel)];
                if (!row || !row.dbId) return;
                if (!confirm(`刪除特效「${row.recipe.name}」？劇情 AI 之後就不會再用它了`)) return;
                try {
                    await win.OS_DB.deleteUITemplate(row.dbId);
                    try { await fxEngine.reloadSaved(); } catch (e) {}
                    _renderFxLibrary(container);
                } catch (e) { alert('刪除失敗: ' + (e && e.message || e)); }
            };
        });
        // ⚡ 匯出／匯入／清空「自製」特效（內建的不動）；匯入同 fxId 覆蓋、新的新增（fxId 穩定→PC轉手機不重複）
        const _expBtn = container.querySelector('[data-fx-export]');
        if (_expBtn) _expBtn.onclick = () => _exportFxPack();
        const _clrBtn = container.querySelector('[data-fx-clear]');
        if (_clrBtn) _clrBtn.onclick = () => _clearAllFx(container);
        const _impBtn = container.querySelector('[data-fx-import]');
        const _impFile = container.querySelector('#fx-lib-import-file');
        if (_impBtn && _impFile) {
            _impBtn.onclick = () => { _impFile.value = ''; _impFile.click(); };
            _impFile.onchange = () => { const f = _impFile.files && _impFile.files[0]; if (f) _importFxPack(f, container); };
        }
    }

    // ⚡ 特效匯出：只打包「自製」特效（isFX UITemplate 的 fxRecipe）；內建的引擎自帶不用匯
    async function _exportFxPack() {
        try {
            const all = await win.OS_DB.getAllUITemplates();
            const mine = (all || []).filter(t => t && t.isFX && t.fxRecipe);
            if (!mine.length) { _studioToast('還沒有自製特效可以匯出（內建的不用匯）。', 'warning', '匯出'); return; }
            const pack = { type: 'aurelia-fx-pack', version: 1, exportedAt: new Date().toISOString(), count: mine.length, recipes: mine.map(t => t.fxRecipe) };
            const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            const d = new Date();
            a.download = 'aurelia-特效包_' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
            document.body.appendChild(a); a.click();
            setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (e) {} a.remove(); }, 0);
            _studioToast(`✅ 已匯出 ${mine.length} 個自製特效，已下載到本機。`, 'success', '匯出');
        } catch (e) { _studioToast('匯出失敗：' + ((e && e.message) || e), 'error', '匯出'); }
    }

    // ⚡ 特效匯入：讀 recipes（或整包 templates 內的 fxRecipe）→ validate → 存 UITemplate，同 fxId 覆蓋
    async function _importFxPack(file, container) {
        const fxEngine = window.OS_FX || win.OS_FX;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const list = Array.isArray(data) ? data
                : (Array.isArray(data.recipes) ? data.recipes
                : (Array.isArray(data.templates) ? data.templates.map(t => t && t.fxRecipe).filter(Boolean) : null));
            if (!list || !list.length) { _studioToast('這個檔案裡找不到特效資料，不是有效的特效包。', 'warning', '匯入'); return; }
            const all = await win.OS_DB.getAllUITemplates();
            const byFx = {};
            (all || []).forEach(t => { if (t && t.isFX && t.fxRecipe) byFx[String(t.fxRecipe.fxId || '').toLowerCase()] = t; });
            let added = 0, updated = 0, bad = 0;
            for (const raw of list) {
                const norm = (fxEngine && fxEngine.validate) ? fxEngine.validate(raw) : raw;
                if (!norm || !norm.fxId) { bad++; continue; }
                const hit = byFx[String(norm.fxId).toLowerCase()];
                await win.OS_DB.saveUITemplate({
                    id: hit ? hit.id : ('fx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
                    title: norm.name, isFX: true, panelType: '特效', fxRecipe: norm,
                    createdAt: hit ? hit.createdAt : Date.now()
                });
                if (hit) updated++; else added++;
            }
            try { if (fxEngine && fxEngine.reloadSaved) await fxEngine.reloadSaved(); } catch (e) {}
            _renderFxLibrary(container);
            _studioToast(`✅ 匯入完成：新增 ${added} 個、覆蓋更新 ${updated} 個` + (bad ? `（${bad} 個格式不對跳過）` : '') + '。', 'success', '匯入');
        } catch (e) { _studioToast('匯入失敗：' + ((e && e.message) || e), 'error', '匯入'); }
    }

    // ⚡ 清空「自製」特效（內建不動）→ 即時刪 DB（同單顆刪除，不用另按保存）
    async function _clearAllFx(container) {
        try {
            const all = await win.OS_DB.getAllUITemplates();
            const mine = (all || []).filter(t => t && t.isFX && t.fxRecipe);
            if (!mine.length) { _studioToast('沒有自製特效可以清空（內建的不受影響）。', 'warning', '清空'); return; }
            if (!confirm(`確定刪除全部 ${mine.length} 個自製特效？\n（內建特效不受影響；此動作無法復原）`)) return;
            for (const t of mine) { try { await win.OS_DB.deleteUITemplate(t.id); } catch (e) {} }
            const fxEngine = window.OS_FX || win.OS_FX;
            try { if (fxEngine && fxEngine.reloadSaved) await fxEngine.reloadSaved(); } catch (e) {}
            _renderFxLibrary(container);
            _studioToast(`🗑️ 已清空 ${mine.length} 個自製特效。`, 'success', '清空');
        } catch (e) { _studioToast('清空失敗：' + ((e && e.message) || e), 'error', '清空'); }
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
            if (currentMode === 'fx') {   // ⚡ 特效工坊空狀態：導去特效庫 tab
                sourceEl.textContent = '';
                exportBtn.style.display = 'none';
                if (publishBtn) publishBtn.style.display = 'none';
                previewMain.innerHTML = `<div class="studio-empty">描述你想要的畫面特效，讓 AI 做給你。<br><br>已有的特效在上方「特效庫」分頁。</div>`;
                return;
            }
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

        if (currentMode === 'fx') {   // ⚡ 特效配方預覽：試播台 + 播放鈕
            const _r = displayData;
            const _esc = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            previewMain.innerHTML = `
                <div class="studio-card">
                    <div class="studio-card-title">${_esc(_r.name || _r.fxId || '特效')} <span class="fx-lib-kind">${_r.kind === 'loop' ? '持續氛圍' : '瞬間效果'}</span></div>
                    <div class="fx-pv-desc">${_esc(_r.desc || '')}</div>
                    <div class="vn-fx-preview-stage" id="fx-pv-stage"></div>
                    <button class="fx-lib-btn fx-pv-play" id="fx-pv-play" type="button"><i class="fa-solid fa-play"></i> 再播一次</button>
                </div>`;
            const _stage = previewMain.querySelector('#fx-pv-stage');
            const _play = () => { try { if (window.OS_FX && _stage) window.OS_FX.preview(_r, _stage); } catch (e) { console.warn('[Studio] 特效試播失敗:', e); } };
            const _btn = previewMain.querySelector('#fx-pv-play');
            if (_btn) _btn.onclick = _play;
            setTimeout(_play, 250);   // 生成完自動播一次
            return;
        }

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
        launch, attachVpScaler: _attachVpScaler,
        // 展廳拆檔（os_studio_vn_gallery.js）：對外契約不變，懶委派到 win.OS_STUDIO_VC
        openVnComponents: function (c) { return win.OS_STUDIO_VC?.openVnComponents(c); },
        // ── _b 橋：專供拆檔子模組（os_studio_worldbook.js / os_studio_persona.js / os_studio_vn_gallery.js / os_studio_diff_engine.js）取用核心內部工具，外部勿碰 ──
        //   穩定函式引用（function 宣告/const，不會被重新賦值）直接放；核心可變 let 走 getter/setter 即時取回寫。
        _b: {
            _sgcEsc, renderMarkdown, _studioBadReply, _wbTH, _wbToast, _studioConfirmRetry,
            // ↓ 展廳（os_studio_vn_gallery.js）用
            _studioToast, syncActiveTagsToLocal, _templateToPhoneHtml, _buildPreviewSt, _attachVpScaler,
            importToSillyTavern, openRawEditModal, _removeTavernPanelArtifacts, _purgeLinkedPhoneApp,
            _enterEditMode, _getTplById, launch,
            // ↓ 煉丹 Diff-refine 引擎（os_studio_diff_engine.js）用
            renderPreviewPanel,
            get currentParsedData() { return currentParsedData; },   // 可變 let → getter 即時取
            set activePreviewData(v) { activePreviewData = v; },     // 可變 let → setter 回寫（restoreFromVNSnapshot 用）
        },
        // 給「應用工坊 · 我的應用」的管理按鈕用：靠 srcTplId 操作該 app 的可編輯底稿
        openEditApp: async function (tplId, c) {
            try { if (c) launch(c, 'vn_ui'); } catch (e) {}   // 直接落製作面板編輯器，不經死首頁
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
            try { win.OS_STUDIO_VC?.exportOneVnUiTemplate(tpl); } catch (e) {}   // 展廳拆檔：os_studio_vn_gallery.js
        },
        // 展廳拆檔（os_studio_vn_gallery.js）：群組資料（vn_component_groups/g_lobby）歸展廳管，懶委派
        toggleAppLobby: async function (tplId) {
            const vc = win.OS_STUDIO_VC;
            return (vc && vc.toggleAppLobby) ? vc.toggleAppLobby(tplId) : null;
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
