// ----------------------------------------------------------------
// [檔案] os_404_chaos.js (V3.5 - 狀態Debuff與解藥任務重構版)
// 職責：404 混沌片場 (樂子人導演系統) - 支援多任務合併、中途空投與 AI 題庫擴充
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入 404 混沌片場 (V3.5 狀態Debuff與解藥任務重構版)...');
    const win = window.parent || window;

    // === 1. 樣式定義 (404 駭客終端機風格) ===
    const appStyle = `
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700;900&display=swap');

        #chaos-modal-root {
            position: absolute; inset: 0;
            background: rgba(0, 10, 0, 0.92); backdrop-filter: blur(4px);
            z-index: 2000; display: flex; justify-content: center; align-items: center;
            opacity: 0; pointer-events: none; transition: opacity 0.3s ease;
            font-family: 'Noto Sans TC', monospace, sans-serif;
        }
        #chaos-modal-root.active { opacity: 1; pointer-events: auto; }

        .chaos-box {
            width: 90%; max-width: 500px; height: 85%; max-height: 800px;
            background: #000a00; border: 2px solid #00cc33;
            border-radius: 4px; display: flex; flex-direction: column;
            box-shadow: 0 0 25px rgba(0, 255, 65, 0.25), inset 0 0 20px rgba(0, 255, 65, 0.05);
            overflow: hidden; position: relative;
        }

        /* 頂部標題列 */
        .chaos-header {
            background: #001a00; border-bottom: 2px solid #00cc33;
            padding: 12px 15px; text-align: center; position: relative;
            color: #00ff41; font-weight: 900; font-size: 1.2rem; letter-spacing: 3px;
            text-shadow: 0 0 8px rgba(0,255,65,0.6);
        }
        .chaos-header::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.03) 2px, rgba(0,255,65,0.03) 4px);
            pointer-events: none;
        }
        .chaos-close-btn {
            position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
            background: #001a00; color: #00cc33; border: 1px solid #00cc33;
            width: 28px; height: 28px; border-radius: 2px;
            font-weight: bold; cursor: pointer; display: flex;
            align-items: center; justify-content: center; font-size: 1rem;
            transition: 0.2s;
        }
        .chaos-close-btn:hover { background: #00cc33; color: #000; }

        /* 內容區 */
        .chaos-content {
            flex: 1; padding: 12px; overflow-y: auto;
            color: #b8ffcb; scrollbar-width: thin; scrollbar-color: #00cc33 #001a00;
        }
        .chaos-content::-webkit-scrollbar { width: 6px; }
        .chaos-content::-webkit-scrollbar-thumb { background: #00cc33; border-radius: 0; }
        .chaos-content::-webkit-scrollbar-track { background: #001a00; }

        .chaos-section {
            background: rgba(0, 255, 65, 0.04); border: 1px dashed rgba(0, 204, 51, 0.5);
            border-radius: 2px; padding: 12px; margin-bottom: 12px;
        }
        .chaos-section-title {
            color: #00ff41; font-size: 0.95rem; font-weight: bold; margin-bottom: 10px;
            text-shadow: 0 0 6px rgba(0,255,65,0.5); display: flex; align-items: center; gap: 8px;
            letter-spacing: 1px;
        }

        /* 輸入框 */
        .chaos-input {
            width: 100%; background: #001a00; border: 1px solid rgba(0, 204, 51, 0.5);
            color: #00ff41; padding: 9px 10px; border-radius: 2px; font-size: 0.95rem;
            box-sizing: border-box; outline: none; transition: 0.2s;
            font-family: 'Noto Sans TC', monospace, sans-serif;
        }
        .chaos-input:focus { border-color: #00ff41; box-shadow: 0 0 8px rgba(0,255,65,0.3); }
        .chaos-input::placeholder { color: rgba(0,204,51,0.4); }

        /* 任務卡片 (Checkboxes) */
        .chaos-task-list {
            display: flex; flex-direction: column; gap: 6px; max-height: 190px; overflow-y: auto;
            padding-right: 4px; margin-bottom: 10px;
        }
        .chaos-task-list::-webkit-scrollbar { width: 4px; }
        .chaos-task-list::-webkit-scrollbar-thumb { background: #00cc33; }
        .chaos-task-list::-webkit-scrollbar-track { background: #001a00; }
        .chaos-task-item {
            display: flex; align-items: flex-start; gap: 10px; cursor: pointer;
            background: #001a00; padding: 9px 10px; border-radius: 2px; border: 1px solid rgba(0,204,51,0.25);
            transition: 0.2s;
        }
        .chaos-task-item:hover { border-color: rgba(0,255,65,0.6); background: rgba(0,255,65,0.06); }
        .chaos-task-item.selected { border-color: #00ff41; background: rgba(0,255,65,0.12); }
        .chaos-task-checkbox { flex-shrink: 0; margin-top: 3px; accent-color: #00ff41; width: 15px; height: 15px; }
        .chaos-task-text { font-size: 0.88rem; color: #b8ffcb; line-height: 1.5; }

        /* 底部按鈕區 */
        .chaos-footer {
            padding: 12px; background: #001a00; border-top: 2px solid #00cc33;
            display: flex; flex-direction: column; gap: 8px;
        }
        .chaos-btn {
            width: 100%; padding: 11px; border: none; border-radius: 2px;
            font-size: 1rem; font-weight: bold; cursor: pointer;
            transition: 0.2s; letter-spacing: 1px;
            font-family: 'Noto Sans TC', monospace, sans-serif;
        }
        .btn-start { background: #004d00; color: #00ff41; border: 1px solid #00cc33; }
        .btn-start:hover:not(:disabled) { background: #006600; box-shadow: 0 0 12px rgba(0,255,65,0.4); }
        .btn-inject { background: #003344; color: #00e5ff; border: 1px solid #0099bb; }
        .btn-inject:hover:not(:disabled) { background: #004466; box-shadow: 0 0 12px rgba(0,229,255,0.3); }
        .btn-random { background: #002200; color: #00cc33; border: 1px solid rgba(0,204,51,0.4);
            margin-bottom: 0; font-size: 0.85rem; padding: 6px 10px; }
        .btn-random:hover:not(:disabled) { background: #003300; border-color: #00cc33; }
        .btn-gen-chaos { background: #003344; color: #00e5ff; border-color: #0099bb; }
        .btn-gen-chaos:hover:not(:disabled) { background: #005577; border-color: #00e5ff; box-shadow: 0 0 8px rgba(0,229,255,0.4); }
        .btn-random:disabled, .btn-gen-chaos:disabled { opacity: 0.5; cursor: not-allowed; }
    `;

    // === 2. 沙雕數據庫 (基礎預設題庫 - 解藥任務) ===
    const DB_TASKS = [
        "坐在對方的大腿上，深情朗讀一段霸道總裁台詞：「男人/女人，你這是在玩火。」",
        "在公共場合跳一段極度羞恥的性感女團舞，並且要求對方鼓掌。",
        "用極致的夾子音（娃娃音）向對方撒嬌要零用錢。",
        "兩人必須十指緊扣，大聲合唱一首非常中二的動漫主題曲。",
        "突然大喊「我是無敵的魔法少女！」，並擺出變身姿勢維持三十秒。",
        "把對方的雙手綁（或按）在牆上，然後...給對方講一個極度冷場的諧音梗笑話。",
        "模仿貓咪，在地上爬行並蹭對方的腿，直到對方摸你的頭為止。",
        "不管對方說什麼，都只能用「汪！」或「喵！」來回答，持續十分鐘。",
        "將兩頰鼓到最大（想像自己是一隻倉鼠或三線鼠），並用手在胸前做出快速啃瓜子的動作，接下來三分鐘只能用「吱吱」聲與對方溝通。",
        "突然把旁邊的人當成 2v2 格鬥遊戲的「援助角色（Assist）」，做出誇張的換人手勢並大喊：「換你上場了！快接連段！」",
        "以做作的播報員腔調，實況轉播對方現在正在做的每一個微小動作（例如：「他眨眼了！這是一個充滿戰術意圖的眨眼！」）。",
        "要求對方配合演出一場生離死別的八點檔戲碼，自己必須負責哭喊：「為什麼！你說過要一起去吃巷口那家滷肉飯的！」",

        // R15 邊緣試探組 - 玩的就是心跳
        "跨坐在對方腰部（或大腿），雙手捧著對方的臉，嚴肅且深情地...數對方的睫毛數量，數錯就要重頭來過。",
        "用指尖從對方的喉結／鎖骨一路滑到腹肌（或胸口），最後停在肚臍上按一下並配音：『叮咚！請問有人在家嗎？』",
        "在對方耳邊用極致的氣音（ASMR），完整背誦一遍『九九乘法表』，背到 9x9 時必須發出滿足的嘆息聲。",
        "含住對方的一根手指，保持眼神接觸十秒鐘，然後拿出來一臉嫌棄地說：『沒味道，差評。』",
        "把對方逼到牆角（壁咚），用鼻尖磨蹭對方的鼻尖，就在對方以為要親下去時，突然大聲打一個這輩子最響的噴嚏。",
        "用嘴咬住對方的衣領或領帶，像牽狗一樣把對方拉到房間另一頭，並命令對方『坐下』。",
        "解開對方衣服的一顆釦子（或拉鍊），往裡面吹一口氣，然後害羞地捂臉跑開喊：『呀！我什麼都沒看到！』",

        // 羞恥度爆表組 - 社會性死亡現場
        "選定身體的一個部位（如鎖骨、手腕），並用口紅在那裡畫一個愛心，然後指著它對所有人說：『這是封印，解開會有妖魔跑出來』。",
        "躺在地上裝死，要求對方必須用『人工呼吸』（或是嘴對嘴餵水）的方式才能喚醒你，否則就一直躺著不動。",
        "模仿某種求偶的鳥類，圍著對方跳一段求偶舞，脖子必須前後伸縮，嘴裡要發出『咕咕！咕咕！』的聲音。",
        "用看垃圾的眼神看著對方，但身體必須誠實地抱住對方的大腿磨蹭，演繹這就是傳說中的『傲嬌毀滅者』。",
        "隨機指著空氣中的一點，驚恐地大喊：『那是...那是我們未出世孩子的靈魂啊！』然後抱著對方的腰痛哭流涕。",
        "兩人必須共吃一根 Pocky（餅乾棒），但在吃到最後一公分前，必須由一方主動咬斷並帥氣地說：『女/男人，你越界了。』"
    ];

    // === 2. 沙雕數據庫 (基礎預設題庫 - 強制狀態 Debuff) ===
    const DB_PENALTIES = [
        "接下來 24 小時，頭頂會長出實體且會隨情緒搖動的粉色貓耳。",
        "說話時，句尾會不受控制地強制加上「喵~」或「嚶嚶嚶」。",
        "身上的衣服會強制變成芭比粉色，且帶有大量蕾絲。",
        "眼淚會不受控制地狂流，但表情強制保持冰冷面癱，形成極度詭異的反差。",
        "雙手被強制變成毛茸茸的倉鼠爪子，接下來只能用啃咬或拍打的方式與物品互動。",
        "進入『格鬥遊戲受擊狀態』：只要對方說話聲音稍微大一點，就會不受控制地做出誇張的被擊飛動作或進入『硬直』狀態。",
        "周圍會無時無刻飄落著粉紅色玫瑰花瓣，並自帶極其老套的薩克斯風獨奏BGM，無論氣氛多嚴肅都無法關閉。",
        "被施加『降智打擊』，接下來每講三句話，就必須像三線鼠一樣在原地轉一圈，並假裝四處尋找瓜子。",
        "接下來說的所有話，都會被系統自動加上極度油膩的『霸道總裁濾鏡』，例如把普通的問候強制翻譯成「呵，你引起了我的注意」。",
        "被剝奪說謊與隱瞞的能力，只要心裡閃過任何一絲吐槽或真心話，都會化為實體的跑馬燈文字，直接在頭頂上輪播。",

        // 生理/服裝改造類 - 視覺衝擊 MAX
        "【服裝Glitch】身上的衣物材質強制替換為『半透明高科技塑料』或『緊身乳膠衣』，且上面滾動著『ERROR 404』的發光彈幕。",
        "【女僕的詛咒】強制換上一套尺寸偏小的女僕裝（含喀秋莎頭飾），並且只要彎腰就會發出『布料崩開』的危險音效（純音效，無實際損壞）。",
        "【敏感肌設定】脖子以上部位變得極度敏感，只要有風吹草動或被視線注視，就會不受控制地臉紅耳赤，頭頂冒出像素蒸汽。",
        "【觸手恐慌】背後長出三根半透明的數據觸手，它們不受控制，會主動去纏繞最近的柱狀物體（或人的手臂/腿），宿主必須不斷向被纏住的人道歉。",

        // 行為/語言病毒類 - 人設崩壞 MAX
        "【阿黑顏Bug】受到任何驚嚇、觸碰或大聲說話時，表情會瞬間卡頓，變成標準的『阿黑顏（Ahegao）』並比出V手勢，持續三秒後恢復正常。",
        "【嬌喘病毒】剝奪正常語氣，強制將所有語助詞（嗯、啊、喔）替換成稍微帶點色氣的喘息聲，哪怕是在討論嚴肅的工作報告。",
        "【M屬性覺醒】每當被對方拒絕、罵或無視時，身體會自動產生『愉悅』反應，嘴裡會不受控地小聲說：『謝...謝謝獎勵...』",
        "【費洛蒙洩漏】身體散發出『高純度貓薄荷』氣味，方圓百里內的貓（或貓系人格的人，如柴郡?）會瘋狂想撲上來吸你。",
        "【視角濾鏡：只有你是裸的】（僅受罰者視角）看系統指定的某個人（通常是死對頭）時，會強制套用『全裸＋聖光』濾鏡，導致受罰者根本無法直視對方，說話結巴。",
        "【誠實的尾巴】尾椎處長出一根惡魔尾巴，直接連結內心的興奮/恐懼程度，完全無法掩飾心情（例如嘴上說不要，尾巴瘋狂愛心形狀擺動）。",

        // 【中二與羞恥設定篇】
        "每走五步路就必須痛苦地握住自己的右手單膝下跪，並對著空氣大喊：『可惡！我的王之力量快控制不住了！』",
        "強制進入『地下偶像營業模式』，接下來 24 小時內對任何人說話前，都必須先雙手比大愛心並大聲自我介紹：『我是為你帶來奇蹟的魔法甜心（自己的本名）～啾咪！』",
        "只要手機響起或收到訊息，必須立刻大喊『報告總部，星際特務007收到指示！』，然後在地上翻滾一圈（前滾翻或側滾）才能接聽或查看。",
        "被設定為『RPG村莊裡的底層NPC』，接下來 12 小時內不管別人問什麼，都只能無限輪迴同一句台詞：『今天的天氣真好呢，不知道村長的痔瘡好點了沒？』且說話時必須一直原地踏步。",

        // 【尊嚴喪失肢體篇】
        "被迫成為『人類掃地機器人』，只要看到地上有任何小碎屑或毛髮，就必須趴在地上用臉蹭過去，並發出『嗡嗡嗡』的機器運作聲。",
        "接下來的兩小時內，走路只能使用『大猩猩移動法』，也就是雙手握拳撐地，四肢並用地跳躍前進，並時不時搥打自己的胸口咆哮。",
        "失去正常坐下的能力。只要碰到椅子，就會像觸電一樣彈起來，接下來只能以『亞洲蹲』或『金雞獨立』的姿勢休息。",

        // 【語言與溝通毀滅篇】
        "說話方式被強制切換為『音樂劇演員』，接下來的所有對話都必須用極度浮誇的美聲唱出來，並且每句話的最後一個字必須破音。",
        "遇到任何人（包含陌生人、老闆或長輩），開口的稱呼強制變成『把拔』或『馬麻』，並用極度嬌嗔的語氣試圖索要 50 塊零用錢。",
        "被剝奪使用第一人稱（我）的權利，接下來只能用『人家』或自己的『疊字小名』（例如：明宏就要自稱宏宏）來稱呼自己，違規一次就要自己大扇一個巴掌。",

        // 【隱私與形象全毀篇】
        "頭頂會自動以 4K 高畫質立體投影出你『過去一週的瀏覽器搜尋歷史（包含無痕模式）』或『最近一次的網購購物車清單』，且會自動朗讀出搜尋關鍵字。",
        "身上散發出極度濃郁的『剛吃完生大蒜配韭菜水餃』的氣味，並且只要一開口說話，就會自帶如同大聲公般擴音的『超大聲打嗝音效』。",
        "表情管理系統徹底崩壞：只要別人對你笑，你就必須做出極度兇狠的『黑道恐嚇臉』；只要氣氛變得嚴肅或有人生氣，你就必須瘋狂『做鬼臉吐舌頭』。",
        "獲得『誠實的身體』Debuff：只要心裡覺得無聊或想離開，身體就會不受控制地開始跳極度性感的『鋼管舞』或『電臀舞（Twerk）』，直到對方放你走為止。"
    ];

    let selectedTasks = new Set();
    let selectedPenalty = 0;
    let isProcessingAPI = false;

    // === 3. HTML 結構 ===
    const htmlTemplate = `
        <div class="chaos-box">
            <div class="chaos-header">
                [ERR_404] CHAOS_DIRECTOR.exe
                <span style="font-size:0.75rem; opacity:0.7;">&nbsp;// ON AIR</span>
                <button class="chaos-close-btn" onclick="OS_CHAOS.closeModal()">✕</button>
            </div>

            <div class="chaos-content">
                <div class="chaos-section">
                    <div class="chaos-section-title">&gt; 01. TARGET // 指定受害者</div>
                    <input type="text" id="chaos-actors-input" class="chaos-input" placeholder="例如：丹 與 白則">
                </div>

                <div class="chaos-section">
                    <div class="chaos-section-title">
                        &gt; 02. CURE_TASK // 解藥任務 (解除狀態的唯一方法)
                        <button class="chaos-btn btn-random btn-gen-chaos" id="btn-gen-chaos" style="width:auto; margin-left:auto; margin-right:5px;" onclick="OS_CHAOS.generateChaosAPI()">✨ AI 生成素材</button>
                        <button class="chaos-btn btn-random" style="width:auto;" onclick="OS_CHAOS.randomTasks()">&#x1F3B2; 隨機</button>
                    </div>
                    <div class="chaos-task-list" id="chaos-task-container"></div>
                    <input type="text" id="chaos-goal-input" class="chaos-input" style="margin-top:8px;" placeholder="// 目標對象（選填，例如：白則）">
                </div>

                <div class="chaos-section">
                    <div class="chaos-section-title">
                        &gt; 03. DEBUFF // 強制狀態 (開場即生效)
                    </div>
                    <select id="chaos-penalty-select" class="chaos-input" style="cursor:pointer;"></select>
                </div>
            </div>

            <div class="chaos-footer">
                <button class="chaos-btn btn-start" onclick="OS_CHAOS.fireEvent('start')">[ EXECUTE ] 開拍新劇本</button>
                <button class="chaos-btn btn-inject" onclick="OS_CHAOS.fireEvent('inject')">[ INJECT ] 空投至當前劇情</button>
            </div>
        </div>
    `;

    // === 4. 核心邏輯 ===
    function init() {
        if (!document.getElementById('chaos-style')) {
            const style = document.createElement('style');
            style.id = 'chaos-style';
            style.innerHTML = appStyle;
            document.head.appendChild(style);
        }
        if (!document.getElementById('chaos-modal-root')) {
            const homeTab = document.getElementById('aurelia-home-tab');
            const container = homeTab || document.body;
            if (homeTab) homeTab.style.position = 'relative';
            const root = document.createElement('div');
            root.id = 'chaos-modal-root';
            root.innerHTML = htmlTemplate;
            container.appendChild(root);
        }
        renderLists();
    }

    function renderLists() {
        const taskContainer = document.getElementById('chaos-task-container');
        if (taskContainer) {
            taskContainer.innerHTML = DB_TASKS.map((task, index) => `
                <div class="chaos-task-item ${selectedTasks.has(index) ? 'selected' : ''}" onclick="OS_CHAOS.toggleTask(${index})">
                    <input type="checkbox" class="chaos-task-checkbox" ${selectedTasks.has(index) ? 'checked' : ''} onclick="event.stopPropagation(); OS_CHAOS.toggleTask(${index})">
                    <span class="chaos-task-text">${task}</span>
                </div>
            `).join('');
            taskContainer.scrollTop = taskContainer.scrollHeight;
        }

        const penaltySelect = document.getElementById('chaos-penalty-select');
        if (penaltySelect) {
            penaltySelect.innerHTML = DB_PENALTIES.map((pen, index) => `
                <option value="${index}">${pen}</option>
            `).join('');
            penaltySelect.innerHTML += `<option value="custom">✍️ [自定義] 我是魔鬼，我要自己打字...</option>`;
            
            if (selectedPenalty < DB_PENALTIES.length) {
                penaltySelect.value = selectedPenalty;
            } else {
                penaltySelect.value = DB_PENALTIES.length - 1;
            }
            
            penaltySelect.onchange = (e) => {
                if(e.target.value === 'custom') {
                    let customPen = prompt("請輸入自定義狀態/Debuff：");
                    if(customPen) {
                        DB_PENALTIES.push(customPen);
                        selectedPenalty = DB_PENALTIES.length - 1;
                        renderLists();
                    } else {
                        penaltySelect.value = selectedPenalty;
                    }
                } else {
                    selectedPenalty = parseInt(e.target.value);
                }
            };
        }
    }

    function toggleTask(index) {
        if (selectedTasks.has(index)) {
            selectedTasks.delete(index);
        } else {
            selectedTasks.add(index);
        }
        renderLists();
    }

    function randomTasks() {
        selectedTasks.clear();
        let count = Math.floor(Math.random() * 3) + 1;
        let available = [...Array(DB_TASKS.length).keys()];
        for(let i=0; i<count; i++) {
            if (available.length === 0) break;
            let rndIdx = Math.floor(Math.random() * available.length);
            selectedTasks.add(available[rndIdx]);
            available.splice(rndIdx, 1);
        }
        renderLists();
    }

    function openModal() {
        init();
        const root = document.getElementById('chaos-modal-root');
        if (root) root.classList.add('active');
    }

    function closeModal() {
        const root = document.getElementById('chaos-modal-root');
        if (root) root.classList.remove('active');
    }

    // === 5. AI API 極速合併生成 ===
    async function generateChaosAPI() {
        if (isProcessingAPI) return;
        const btn = document.getElementById('btn-gen-chaos');
        if (!win.TavernHelper || typeof win.TavernHelper.generateRaw !== 'function') {
            alert("⚠️ 找不到 TavernHelper.generateRaw，無法使用極速生成功能。請確認你的擴展是否支援。");
            return;
        }

        isProcessingAPI = true;
        if (btn) { btn.textContent = "生成中..."; btn.disabled = true; }

        const prompt = `你是「404 混沌片場」的惡搞系統。請直接生成 3 個「極度爆笑/社死的解藥任務(主動行為)」，以及 2 個「荒謬且破壞形象的持續性Debuff狀態(被動狀態)」。
嚴禁流血或真正受傷的殘酷內容，必須以搞笑社死為主。
請嚴格使用以下格式輸出（絕對不要有其他多餘廢話）：
[Task|走到對方面前單膝下跪朗誦土味情話]
[Task|用極致夾子音向對方討抱抱]
[Task|跳一段極度火辣的性感女團舞]
[Penalty|身上的衣服強制變成螢光粉紅色的緊身芭蕾舞裙]
[Penalty|頭頂霓虹燈無死角輪播內心吐槽跑馬燈]`;

        try {
            console.log(`[Chaos] 啟動極速無上下文生成...`);
            const res = await win.TavernHelper.generateRaw({
                ordered_prompts: [
                    { role: 'system', content: prompt }
                ],
                max_chat_history: 0 
            });

            if (res) {
                const taskRegex = /\[Task\|([^\]]+)\]/g;
                const penRegex = /\[Penalty\|([^\]]+)\]/g;
                
                let tMatch, pMatch;
                let tCount = 0, pCount = 0;
                
                while ((tMatch = taskRegex.exec(res)) !== null) {
                    DB_TASKS.push(tMatch[1].trim());
                    selectedTasks.add(DB_TASKS.length - 1);
                    tCount++;
                }
                while ((pMatch = penRegex.exec(res)) !== null) {
                    DB_PENALTIES.push(pMatch[1].trim());
                    selectedPenalty = DB_PENALTIES.length - 1;
                    pCount++;
                }

                if (tCount > 0 || pCount > 0) {
                    renderLists();
                } else {
                    alert("⚠️ AI 生成的格式錯誤，請再試一次。\nAI 回覆內容：" + res);
                }
            } else {
                alert("⚠️ 生成回傳為空，請檢查 API 連線狀態。");
            }
        } catch (e) {
            console.error("[Chaos] API 崩潰:", e);
            alert("⚠️ 生成失敗，請查看控制台 (F12)。");
        } finally {
            isProcessingAPI = false;
            if (btn) { btn.textContent = "✨ AI 生成素材"; btn.disabled = false; }
        }
    }

    // === 6. 發送核心邏輯 (🔥極簡提示+智能偵測+強制Debuff先發) ===
    async function fireEvent(mode) {
        const actorsInput = document.getElementById('chaos-actors-input').value.trim() || "在場的所有人";
        const penaltyIdx = document.getElementById('chaos-penalty-select').value;
        const penaltyText = DB_PENALTIES[penaltyIdx] || DB_PENALTIES[0];
        const targetName = document.getElementById('chaos-goal-input').value.trim();

        if (selectedTasks.size === 0) {
            alert("⚠️ 導演，至少選一張解藥任務卡！");
            return;
        }

        let combinedTasksText = "";
        let count = 1;
        selectedTasks.forEach(idx => {
            combinedTasksText += `\n任務 ${count}：${DB_TASKS[idx]}`;
            count++;
        });

        // 🎯 智能偵測：只在遇到丹或白則時，才給出特定的語氣限制，節省提示詞長度！
        const isSpecialTarget = (actorsInput.includes('丹') || actorsInput.includes('白則') || targetName.includes('丹') || targetName.includes('白則'));
        const tonePrompt = isSpecialTarget 
            ? "語氣警告：對象包含「丹」或「白則」，柴郡台詞切換為惡劣玩笑的翻版丹語氣。" 
            : "語氣設定：柴郡請維持賤兮兮、充滿顏文字與波浪號的樂子人語氣。";

        let finalPrompt = "";
        
        // 依照 GPT 建議重寫的 Debuff vs 解藥 邏輯
        const injectDesc = (mode === 'inject') 
            ? "突發介入：用 [Nar] 描寫面板再次砸臉，宣告狀態疊加生效。" 
            : "劇情開場：使用描寫發光面板砸臉，宣告狀態立刻生效。";

        finalPrompt = `[System Instruction: 🚨 突發異常狀態！柴郡 404 迫害系統介入]

【當前強制狀態 (DEBUFF 已生效)】：
目標 ${actorsInput} ${targetName ? `(目標對象：${targetName})` : ''} 目前已經中了以下狀態，無法免疫、無法閃避，立刻生效：
👉 ${penaltyText}

【唯一解除條件 (解藥任務)】：
若想解除上述的痛苦狀態，目標必須主動完成以下任務：
🔑 ${combinedTasksText}

【扮演與演出強制要求 (Director's Note)】：
1. 既定事實：一開場，角色就已經在承受 Debuff，必須詳細描寫這個 Debuff 帶來的困擾、羞恥或不適感。
2. 心理拉扯：角色絕對不會立刻乖乖做「解藥任務」。他們會先試圖忍耐、生氣、或者尋找其他方法解除 Debuff。
3. 崩潰妥協：由於 Debuff 實在太強烈/太丟臉，角色在經歷短暫的掙扎後，最終只能咬牙切齒、極度屈辱地去執行「解藥任務」。
4. ${injectDesc}
5. ${tonePrompt} (使用 [Sys|柴郡|「台詞」] 發布無情嘲笑)`;

        // 呼叫 TavernHelper 發送
        try {
            const btn = (mode === 'start') ? document.querySelector('.btn-start') : document.querySelector('.btn-inject');
            const originalText = btn.textContent;
            btn.textContent = "發送中...";
            btn.disabled = true;

            if (win.TavernHelper && typeof win.TavernHelper.createChatMessages === 'function') {
                await win.TavernHelper.createChatMessages([{
                    role: 'user',
                    name: 'Director',
                    message: finalPrompt
                }], { refresh: 'affected' });
                
                setTimeout(() => {
                    closeModal();
                    if (window.AureliaControlCenter && typeof window.AureliaControlCenter.switchPage === 'function') {
                        window.AureliaControlCenter.switchPage('nav-story');
                    }
                    btn.textContent = originalText;
                    btn.disabled = false;
                }, 800);
            } else {
                console.error("找不到 TavernHelper");
                alert("發送失敗：請確認已安裝並啟用 TavernHelper 擴展。");
                btn.textContent = originalText;
                btn.disabled = false;
            }
        } catch (e) {
            console.error("發送任務失敗:", e);
            alert("發送失敗，請查看控制台。");
        }
    }

    // === 7. 導出 API ===
    window.OS_CHAOS = {
        openModal: openModal,
        closeModal: closeModal,
        toggleTask: toggleTask,
        randomTasks: randomTasks,
        fireEvent: fireEvent,
        generateChaosAPI: generateChaosAPI
    };

    console.log('[PhoneOS] 404 混沌片場 API 暴露為 window.OS_CHAOS');

})();