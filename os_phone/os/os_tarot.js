// ----------------------------------------------------------------
// [檔案] os_tarot.js (V6.1 - Grounded Reading)
// 路徑：os_phone/os/os_tarot.js
// 職責：賽博塔羅占卜 V6.1
// 修改：
// 1. [解讀品質] 內建78張牌正逆位牌義庫 (TAROT_MEANINGS)，抽到的牌連同牌義餵給AI，防止瞎編。
// 2. [牌陣] 三牌陣明確標注位置意義 (根源/現況/走向)。
// 3. [精簡] 移除評判室吐槽三人組 (callJury/parseJury)，占卜回歸一對一。
// 4. [保留] V6.0 無縫轉移 UX 與 V5.1 的 Ace 圖片修復 (swac, waac...)。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入賽博塔羅系統 (V6.0 Seamless Immersion)...');
    const win = window.parent || window;

    // =================================================================
    // 1. 樣式定義 (Cyber Mysticism V6.0)
    // =================================================================

    const doc = window.parent.document || document;
    if (!doc.getElementById('os-tarot-css')) {
    }

    // =================================================================
    // 2. 塔羅數據庫
    // =================================================================
    const BASE_URL = "https://www.sacred-texts.com/tarot/pkt/img";
    
    // 大阿爾克那映射
    const MAJOR_ARCANA = [
        { id: 'ar00', name: '0. The Fool (愚者)' }, { id: 'ar01', name: 'I. The Magician (魔術師)' },
        { id: 'ar02', name: 'II. The High Priestess (女祭司)' }, { id: 'ar03', name: 'III. The Empress (皇后)' },
        { id: 'ar04', name: 'IV. The Emperor (皇帝)' }, { id: 'ar05', name: 'V. The Hierophant (教皇)' },
        { id: 'ar06', name: 'VI. The Lovers (戀人)' }, { id: 'ar07', name: 'VII. The Chariot (戰車)' },
        { id: 'ar08', name: 'VIII. Strength (力量)' }, { id: 'ar09', name: 'IX. The Hermit (隱士)' },
        { id: 'ar10', name: 'X. Wheel of Fortune (命運之輪)' }, { id: 'ar11', name: 'XI. Justice (正義)' },
        { id: 'ar12', name: 'XII. The Hanged Man (倒吊人)' }, { id: 'ar13', name: 'XIII. Death (死神)' },
        { id: 'ar14', name: 'XIV. Temperance (節制)' }, { id: 'ar15', name: 'XV. The Devil (惡魔)' },
        { id: 'ar16', name: 'XVI. The Tower (高塔)' }, { id: 'ar17', name: 'XVII. The Star (星星)' },
        { id: 'ar18', name: 'XVIII. The Moon (月亮)' }, { id: 'ar19', name: 'XIX. The Sun (太陽)' },
        { id: 'ar20', name: 'XX. Judgement (審判)' }, { id: 'ar21', name: 'XX1. The World (世界)' }
    ];

    // 小阿爾克那映射
    let FULL_DECK_DEF = [...MAJOR_ARCANA];
    const SUITS = [
        { code: 'wa', name: 'Wands (權杖)' }, { code: 'cu', name: 'Cups (聖杯)' },
        { code: 'sw', name: 'Swords (寶劍)' }, { code: 'pe', name: 'Pentacles (星幣)' }
    ];
    
    SUITS.forEach(suit => {
        for (let i = 1; i <= 14; i++) {
            let cardName = `${i} of ${suit.name}`;
            let fileName = suit.code;
            
            // 處理數字編號
            if (i < 10) fileName += `0${i}`; else fileName += `${i}`;

            // ⚠️ Ace 與宮廷牌修正
            if (i === 1) { 
                cardName = `Ace of ${suit.name}`; 
                fileName = `${suit.code}ac`; 
            }
            if (i === 11) { cardName = `Page of ${suit.name}`; fileName = `${suit.code}pa`; }
            if (i === 12) { cardName = `Knight of ${suit.name}`; fileName = `${suit.code}kn`; }
            if (i === 13) { cardName = `Queen of ${suit.name}`; fileName = `${suit.code}qu`; }
            if (i === 14) { cardName = `King of ${suit.name}`; fileName = `${suit.code}ki`; }
            
            FULL_DECK_DEF.push({ id: fileName, name: cardName });
        }
    });

    // 78張牌的正逆位牌義（餵給AI當解讀依據，防止胡編）
    const TAROT_MEANINGS = {
        ar00: { up: '新的開始、冒險、自由、天真的勇氣', rev: '魯莽、逃避現實、不計後果、遲遲不敢踏出第一步' },
        ar01: { up: '創造力、行動力、資源到位、心想事成', rev: '空談、欺瞞、才能被浪費、準備不足' },
        ar02: { up: '直覺、潛意識、靜觀其變、隱藏的真相', rev: '忽視直覺、秘密洩露、只看表面、沉不住氣' },
        ar03: { up: '豐盛、滋養、感性、成果正在孕育', rev: '依賴、過度保護、享樂過頭、創造力停滯' },
        ar04: { up: '權威、秩序、掌控、事業穩固', rev: '專橫、僵化、控制欲、權威失效' },
        ar05: { up: '傳統、指導、規範、可信賴的建議', rev: '教條、盲從、被規則束縛、需要打破常規' },
        ar06: { up: '愛情、結合、價值觀契合、重要抉擇', rev: '關係失衡、誘惑、三心二意、錯誤的選擇' },
        ar07: { up: '意志力、勝利、掌控方向、勇往直前', rev: '失控、方向迷失、內外拉扯、急躁冒進' },
        ar08: { up: '柔性的力量、勇氣、耐心、馴服慾望', rev: '自我懷疑、意志薄弱、硬碰硬、情緒失控' },
        ar09: { up: '內省、獨處、尋求真理、智者的指引', rev: '孤立、自我封閉、鑽牛角尖、逃避人群' },
        ar10: { up: '轉機、命運的節點、好運降臨、順勢而為', rev: '時運不濟、循環的困境、抗拒改變' },
        ar11: { up: '公平、因果、權衡、法律或契約順利', rev: '不公、失衡、逃避責任、偏頗的判斷' },
        ar12: { up: '換位思考、主動暫停、以犧牲換取領悟', rev: '無謂的犧牲、僵局、拖延、視角固化' },
        ar13: { up: '結束與重生、斷捨離、舊階段落幕', rev: '抗拒結束、拖著爛攤子、恐懼改變' },
        ar14: { up: '平衡、調和、節制、耐心整合', rev: '失衡、走極端、揮霍、欲速則不達' },
        ar15: { up: '慾望、束縛、成癮、物質誘惑', rev: '掙脫枷鎖、覺醒、戒斷、擺脫依賴' },
        ar16: { up: '驟變、崩塌、真相炸裂、推倒重來', rev: '勉強撐著的危樓、延遲的崩壞、僥倖逃過一劫' },
        ar17: { up: '希望、療癒、靈感、值得等待的願景', rev: '失望、信心動搖、好高騖遠' },
        ar18: { up: '不安、迷霧、潛藏的恐懼、真相未明', rev: '迷霧散去、恐懼消退、真相浮現' },
        ar19: { up: '成功、活力、坦率、光明正大的喜悅', rev: '延遲的成功、盲目樂觀、光環褪色' },
        ar20: { up: '覺醒、命運的召喚、重獲新生、蓋棺定論', rev: '過度自我批判、錯過召喚、無法釋懷過去' },
        ar21: { up: '圓滿、完成、整合、抵達終點', rev: '差一步的完成、留有缺憾、停在終點前' },
        waac: { up: '新機會、熱情點燃、行動的火種', rev: '熱情熄滅、虛假的機會、動力不足' },
        wa02: { up: '規劃未來、掌握主動、選定方向', rev: '害怕未知、計畫停在紙上、選擇困難' },
        wa03: { up: '初見成果、遠見、等待船入港', rev: '計畫受阻、目光短淺、成果延遲' },
        wa04: { up: '慶祝、階段性的穩定成果、歸屬感', rev: '基礎不穩、慶祝言之過早、家內失和' },
        wa05: { up: '競爭、摩擦、良性的衝突', rev: '惡性內耗、一味避戰、衝突升級' },
        wa06: { up: '勝利、被認可、凱旋歸來', rev: '虛名、成果被質疑、驕兵必敗' },
        wa07: { up: '堅守立場、以一擋百、防禦成功', rev: '寡不敵眾、疲於應付、快守不住了' },
        wa08: { up: '迅速進展、消息傳來、事態加速', rev: '延誤、節奏混亂、操之過急' },
        wa09: { up: '堅持到底、帶傷防備、最後一哩路', rev: '精疲力竭、偏執的防備、瀕臨放棄' },
        wa10: { up: '重擔、責任壓身、負重前行', rev: '該卸下重擔、學會放手，否則會被壓垮' },
        wapa: { up: '熱情的新消息、探索、躍躍欲試', rev: '三分鐘熱度、壞消息、幼稚衝動' },
        wakn: { up: '衝勁、冒險、大膽行動', rev: '魯莽、半途而廢、火氣上頭' },
        waqu: { up: '自信、魅力、熱情的感染力', rev: '善妒、跋扈、外強中乾' },
        waki: { up: '領導力、有遠見的開創者、魄力', rev: '獨斷、暴躁、承諾跳票' },
        cuac: { up: '新感情、情感豐沛、心靈滿溢', rev: '情感空虛、錯過的感情、壓抑情緒' },
        cu02: { up: '兩情相悅、夥伴契合、和解', rev: '關係失衡、貌合神離、溝通破裂' },
        cu03: { up: '友誼、慶祝、團體的支持', rev: '第三者、社交倦怠、小圈子是非' },
        cu04: { up: '倦怠、無視眼前的機會、需要重新聚焦', rev: '走出低潮、接住新機會、重燃興趣' },
        cu05: { up: '失落、悔恨、眼裡只有失去的', rev: '走出悲傷、接受現實、回頭看見還剩下的' },
        cu06: { up: '懷舊、舊識重逢、純真的善意', rev: '困在過去、舊事重演、該向前看了' },
        cu07: { up: '選項太多、幻想、霧裡看花', rev: '幻象破滅、下定決心、看清現實' },
        cu08: { up: '離開已無意義的事物、去追尋更深的東西', rev: '不敢離開、反覆糾結、假裝灑脫' },
        cu09: { up: '願望成真、滿足、犒賞自己', rev: '貪心不足、表面的滿足、願望變了質' },
        cu10: { up: '圓滿的關係、家庭和樂、情感的歸宿', rev: '家庭失和、表面幸福、理想與現實的落差' },
        cupa: { up: '感性的訊息、創意萌芽、心意傳達', rev: '情緒化、不切實際、曖昧不明的訊號' },
        cukn: { up: '浪漫的追求、心意的邀請、白馬騎士', rev: '花言巧語、情感操縱、承諾不可信' },
        cuqu: { up: '共情、溫柔、直覺敏銳的照顧者', rev: '情緒勒索、多愁善感、界線模糊' },
        cuki: { up: '情緒成熟、包容、以柔御剛', rev: '情緒壓抑、喜怒無常、拿感情當武器' },
        swac: { up: '清晰的判斷、真相、突破性的想法', rev: '思緒混亂、誤判、真相被掩蓋' },
        sw02: { up: '僵持、逃避抉擇、蒙著眼的平衡', rev: '僵局鬆動、被迫面對、底牌掀開' },
        sw03: { up: '心碎、背叛、痛苦的真相', rev: '正在療傷、逐漸釋懷、傷口未癒先別掀' },
        sw04: { up: '休息、暫停、養精蓄銳', rev: '被迫停擺、倦怠爆發、該醒來行動了' },
        sw05: { up: '慘勝、衝突留下裂痕、贏了面子輸了裡子', rev: '冤冤相報、該放下爭端、認賠止損' },
        sw06: { up: '過渡、駛離風暴、漸入平靜', rev: '走不出去、舊問題跟著上船、行程受阻' },
        sw07: { up: '策略、迂迴、隱瞞或取巧', rev: '謊言敗露、自欺欺人、良心發現' },
        sw08: { up: '自我設限、感覺被困、其實出口就在旁邊', rev: '掙脫束縛、看見出口、重獲自由' },
        sw09: { up: '焦慮、失眠、被恐懼放大的陰影', rev: '焦慮緩解、噩夢結束、走出黑暗' },
        sw10: { up: '谷底、結束的劇痛、背後插刀', rev: '觸底反彈、劫後餘生、小心舊傷復發' },
        swpa: { up: '好奇、觀察、蒐集情報', rev: '八卦、窺探、輕率的言論' },
        swkn: { up: '果斷出擊、直言、雷厲風行', rev: '咄咄逼人、莽撞、言語傷人' },
        swqu: { up: '清醒、獨立、一針見血', rev: '刻薄、冷酷、被偏見蒙蔽' },
        swki: { up: '理性的權威、專業判斷、講原則', rev: '濫用權力、冷血、強詞奪理' },
        peac: { up: '新的財源、實際的機會、種子落地', rev: '錯失機會、財務不穩、計畫缺乏根基' },
        pe02: { up: '多工平衡、靈活調度、收支週轉', rev: '顧此失彼、失衡、被瑣事淹沒' },
        pe03: { up: '團隊合作、技能被認可、扎實累積', rev: '單打獨鬥、敷衍了事、合作不順' },
        pe04: { up: '守成、握緊資源、穩固但保守', rev: '吝嗇、抓得太緊，或反過來散財失控' },
        pe05: { up: '匱乏、困頓、被關在門外', rev: '谷底回升、獲得援助、擺脫窮酸心態' },
        pe06: { up: '施與受、資源流動、貴人相助', rev: '不對等的給予、附帶條件的幫助、欠人情債' },
        pe07: { up: '耐心等待收成、盤點、長線投資', rev: '白費工夫、不耐煩、報酬不如預期' },
        pe08: { up: '勤勉、打磨技藝、專注細節', rev: '敷衍、重複勞動的倦怠、半吊子' },
        pe09: { up: '獨立自足、優雅的成果、享受果實', rev: '過勞、虛有其表、靠別人供養' },
        pe10: { up: '家業、長期的富足、傳承', rev: '家產糾紛、財務不穩、短視近利' },
        pepa: { up: '務實的學習、新的實務機會、腳踏實地', rev: '拖延、心不在焉、計畫落不了地' },
        pekn: { up: '穩紮穩打、可靠、按部就班', rev: '停滯、一成不變、過度保守' },
        pequ: { up: '務實的照顧、理財有道、安穩', rev: '患得患失、工作與生活失衡、物質焦慮' },
        peki: { up: '事業有成、財務穩健、可靠的靠山', rev: '貪婪、固執、用金錢衡量一切' }
    };

    function cardBrief(card) {
        const m = TAROT_MEANINGS[card.id];
        if (!m) return '';
        return `｜牌義參考: ${card.isReversed ? m.rev : m.up}`;
    }

    // =================================================================
    // 3. 邏輯狀態管理
    // =================================================================
    let STATE = {
        container: null,
        deck: [],           
        selectedCards: [],  
        question: "",       
        isRevealed: false,
        chatHistory: [],    
        isAnalyzing: false, 
        singleCardMode: false 
    };

    function initDeck() {
        let tempDeck = [...FULL_DECK_DEF];
        for (let i = tempDeck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tempDeck[i], tempDeck[j]] = [tempDeck[j], tempDeck[i]];
        }
        STATE.deck = tempDeck.map(card => ({
            ...card,
            isReversed: Math.random() < 0.5
        }));
        STATE.selectedCards = [];
        STATE.isRevealed = false;
        STATE.chatHistory = []; 
        STATE.question = "";
    }

    function launch(container) {
        STATE.container = container;
        initDeck();
        renderUI();
    }

    function renderUI() {
        STATE.container.innerHTML = `
            <div class="tr-container">
                <div class="tr-header">
                    <button class="tr-btn-icon" onclick="window.PhoneSystem.goHome()">❮</button>
                    <div class="tr-title">CYBER TAROT V6.0</div>
                    <div style="width:28px"></div>
                </div>

                <div class="tr-stage" id="tr-stage">
                    <div class="tr-slots-wrapper">
                        <div class="tr-slot" id="slot-0">1</div>
                        <div class="tr-slot" id="slot-1">2</div>
                        <div class="tr-slot" id="slot-2">3</div>
                </div>

                    <div class="tr-input-area" id="tr-input-box">
                        <div style="text-align:center; color:#aaa; font-size:12px; margin-bottom:5px;">連接命運數據庫...</div>
                        <input class="tr-input" type="text" id="tr-question" placeholder="心中默念問題..." autocomplete="off">
                        <button class="tr-btn-main" onclick="window.OS_TAROT.startSelection()">⚡ 開始儀式 (START) ⚡</button>
                    </div>

                    <div class="tr-deck-scroll" id="tr-scroll-area"></div>
                    
                    <div class="tr-action-bar">
                        <button class="tr-btn-reveal" id="tr-reveal-btn" onclick="window.OS_TAROT.revealCards()">🔮 揭示命運 (REVEAL)</button>
                    </div>
                </div>

                <div class="tr-analysis-panel" id="tr-panel">
                    <div class="tr-chat-content" id="tr-log">
                        </div>
                    
                    <div class="tr-chat-bar">
                        <input class="tr-chat-input" id="tr-chat-input" type="text" placeholder="對牌面有疑問? 請詢問姊姊..." onkeydown="if(event.key==='Enter') window.OS_TAROT.sendFollowUp()">
                        <button class="tr-chat-btn" onclick="window.OS_TAROT.sendFollowUp()">➤</button>
                    </div>

                    <div class="tr-panel-footer">
                         <span class="tr-link-btn" style="color:#00e676; font-weight:bold;" onclick="window.OS_TAROT.startNewReading()">🔄 問下一個問題 (NEXT)</span>
                    </div>
                </div>
            </div>
        `;
        
        setTimeout(() => {
            const chatContent = document.getElementById('tr-log');
            if (chatContent) {
                chatContent.setAttribute('tabindex', '0');
                chatContent.addEventListener('wheel', (e) => { e.stopPropagation(); }, { passive: true });
            }
        }, 100);
    }

    // 開始選牌
    function startSelection() {
        const input = document.getElementById('tr-question');
        if (!input.value.trim()) { alert("請輸入問題以建立連結。"); return; }
        STATE.question = input.value.trim();
        document.getElementById('tr-input-box').classList.add('hidden');
        
        const scrollArea = document.getElementById('tr-scroll-area');
        scrollArea.innerHTML = '';
        STATE.deck.forEach((card, index) => {
            const el = document.createElement('div');
            el.className = 'tr-mini-card';
            el.dataset.index = index;
            el.onclick = () => pickCard(index, el);
            scrollArea.appendChild(el);
        });
        scrollArea.classList.add('active');
        
        if (!scrollArea.dataset.wheelEnabled) {
            scrollArea.dataset.wheelEnabled = 'true';
            scrollArea.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0 && scrollArea.classList.contains('active')) {
                    e.preventDefault(); e.stopPropagation();
                    scrollArea.scrollLeft += e.deltaY;
                }
            }, { passive: false });
        }
    }

    // 選牌邏輯
    function pickCard(deckIndex, element) {
        if (STATE.singleCardMode) {
            if (STATE.selectedCards.length >= 1) return;
        } else {
            if (STATE.selectedCards.length >= 3) return;
        }
        
        element.classList.add('picked');
        
        const cardData = STATE.deck[deckIndex];
        STATE.selectedCards.push(cardData);

        const slotIndex = STATE.singleCardMode ? 0 : STATE.selectedCards.length - 1;
        const slot = document.getElementById(`slot-${slotIndex}`);
        slot.classList.add('filled');
        slot.innerHTML = ''; 

        const imgUrl = `${BASE_URL}/${cardData.id}.jpg`;
        const cardObj = document.createElement('div');
        cardObj.className = 'tr-card-obj';
        cardObj.innerHTML = `
            <div class="tr-face tr-face back"></div>
            <div class="tr-face tr-face front" style="background-image: url('${imgUrl}')"></div>
            <div class="tr-card-label ${cardData.isReversed ? 'label-rev' : ''}">${cardData.name}<br>${cardData.isReversed ? '(逆位)' : '(正位)'}</div>
        `;
        if (cardData.isReversed) cardObj.classList.add('reversed');
        slot.appendChild(cardObj);

        if (STATE.singleCardMode && STATE.selectedCards.length === 1) {
            document.getElementById('tr-scroll-area').classList.remove('active');
            setTimeout(() => {
                const slot0 = document.getElementById('slot-0');
                const cardObj = slot0.querySelector('.tr-card-obj');
                if (cardObj) cardObj.classList.add('flipped');
                setTimeout(() => { analyzeSingleCard(); }, 1000);
            }, 300);
        } else if (!STATE.singleCardMode && STATE.selectedCards.length === 3) {
            document.getElementById('tr-scroll-area').classList.remove('active');
            document.getElementById('tr-reveal-btn').classList.add('show');
        }
    }

    // 揭牌 (3卡) - 執行無縫轉移
    function revealCards() {
        if (STATE.isRevealed) return;
        STATE.isRevealed = true;
        document.getElementById('tr-reveal-btn').classList.remove('show');
        
        // 1. 先執行翻牌動畫 (讓用戶看到儀式)
        [0, 1, 2].forEach((i, delay) => {
            setTimeout(() => {
                const slot = document.getElementById(`slot-${i}`);
                if (slot) {
                    const cardObj = slot.querySelector('.tr-card-obj');
                    if (cardObj) cardObj.classList.add('flipped');
                }
            }, delay * 500);
        });

        // 2. 延遲後，執行「轉移」動作
        setTimeout(() => {
            // 隱藏頂部舞台
            document.getElementById('tr-stage').classList.add('hidden-mode');
            // 顯示聊天面板
            document.getElementById('tr-panel').classList.add('active');
            // 開始分析
            initialAnalyze(); 
        }, 1800); // 等待翻牌動畫結束
    }

    // 將卡牌快照存入聊天記錄
    function renderCardsToHistory(cards) {
        const log = document.getElementById('tr-log');
        const snapContainer = document.createElement('div');
        snapContainer.className = 'tr-history-snap';
        
        cards.forEach(card => {
            const imgUrl = `${BASE_URL}/${card.id}.jpg`;
            const cardHtml = `
                <div class="tr-history-card">
                    <div class="tr-history-img ${card.isReversed ? 'rev' : ''}" style="background-image: url('${imgUrl}')"></div>
                    <div class="tr-history-name">${card.name}</div>
                    ${card.isReversed ? '<div class="tr-history-rev-tag">(逆位)</div>' : ''}
                </div>
            `;
            snapContainer.innerHTML += cardHtml;
        });
        
        log.appendChild(snapContainer);
        log.scrollTop = log.scrollHeight;
    }

    // 開啟新一輪占卜
    function startNewReading() {
        console.log('[Tarot] Starting new reading...');
        
        // 1. 隱藏分析面板
        document.getElementById('tr-panel').classList.remove('active');
        
        // 2. 🔥 恢復舞台顯示 (移除 hidden-mode)
        document.getElementById('tr-stage').classList.remove('hidden-mode');
        document.getElementById('tr-stage').classList.remove('compact');
        
        // 3. 清空頂部舞台
        [0, 1, 2].forEach(i => {
             const slot = document.getElementById(`slot-${i}`);
             slot.className = 'tr-slot'; 
             slot.innerHTML = i + 1;     
             slot.style.display = 'flex'; // 確保顯示
        });

        // 4. 重置 UI 元素
        const inputBox = document.getElementById('tr-input-box');
        inputBox.classList.remove('hidden');
        document.getElementById('tr-question').value = '';
        document.getElementById('tr-reveal-btn').classList.remove('show');
        document.getElementById('tr-scroll-area').innerHTML = ''; 

        // 5. 重新洗牌
        let tempDeck = [...FULL_DECK_DEF];
        for (let i = tempDeck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tempDeck[i], tempDeck[j]] = [tempDeck[j], tempDeck[i]];
        }
        STATE.deck = tempDeck.map(card => ({
            ...card,
            isReversed: Math.random() < 0.5
        }));
        STATE.selectedCards = [];
        STATE.isRevealed = false;
        STATE.question = "";
        STATE.isAnalyzing = false;
        STATE.singleCardMode = false;
    }

    function getCurrentTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const weekday = weekdays[now.getDay()];
        let timeOfDay = '';
        const hour = now.getHours();
        if (hour >= 5 && hour < 12) timeOfDay = '上午';
        else if (hour >= 12 && hour < 18) timeOfDay = '下午';
        else if (hour >= 18 && hour < 22) timeOfDay = '晚上';
        else timeOfDay = '深夜';
        return {
            full: `${year}年${month}月${day}日 ${hours}:${minutes}:${seconds}`,
            date: `${year}年${month}月${day}日`,
            time: `${hours}:${minutes}`,
            datetime: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`,
            weekday: `星期${weekday}`,
            timeOfDay: timeOfDay,
            formatted: `${year}年${month}月${day}日 星期${weekday} ${timeOfDay} ${hours}:${minutes}`
        };
    }

    function appendMessage(role, text) {
        const log = document.getElementById('tr-log');
        const msgDiv = document.createElement('div');
        msgDiv.className = `tr-msg-block ${role === 'user' ? 'user' : 'ai'}`;
        
        const roleName = role === 'user' ? 'User' : '🔮 Pythia';
        const roleClass = role === 'user' ? 'role-user' : 'role-pythia';
        
        msgDiv.innerHTML = `
            <div class="tr-role ${roleClass}">${roleName}</div>
            <div class="tr-text">${text.replace(/\n/g, '<br>')}</div>
        `;
        log.appendChild(msgDiv);
        log.scrollTop = log.scrollHeight;
        return msgDiv.querySelector('.tr-text'); 
    }

    // 初次解讀 (3卡)
    async function initialAnalyze() {
        if (STATE.isAnalyzing) return;
        STATE.isAnalyzing = true;

        appendMessage('user', STATE.question);
        
        // 🔥 轉移：在聊天中顯示卡牌
        renderCardsToHistory(STATE.selectedCards);

        const card1 = STATE.selectedCards[0];
        const card2 = STATE.selectedCards[1];
        const card3 = STATE.selectedCards[2];

        const cardInfo = `
牌陣數據 (時間之流牌陣：1=根源/過去, 2=現況/癥結, 3=走向/結果):
1. ${card1.name} [${card1.isReversed ? '逆位 (Reversed)' : '正位 (Upright)'}]${cardBrief(card1)}
2. ${card2.name} [${card2.isReversed ? '逆位 (Reversed)' : '正位 (Upright)'}]${cardBrief(card2)}
3. ${card3.name} [${card3.isReversed ? '逆位 (Reversed)' : '正位 (Upright)'}]${cardBrief(card3)}`;

        let systemPrompt = "你現在是 Pythia，一位神秘、溫柔且富有洞察力的塔羅占卜師(姊姊)。";
        if (win.OS_PROMPTS) {
            const customPrompt = win.OS_PROMPTS.get('tarot_pythia');
            if (customPrompt && customPrompt.trim().length > 0) {
                systemPrompt = customPrompt;
            }
        }

        const currentTime = getCurrentTime();
        
        STATE.chatHistory.push({ 
            role: 'system', 
            content: `${systemPrompt}

【當前時間】${currentTime.formatted}

請根據以下三張牌為用戶解讀：${cardInfo}
用戶的問題是: "${STATE.question}"。
請先進行整體的牌陣解讀 (三張牌沿位置串成一條因果線)。牌義參考只是你的內部依據，禁止照抄條列，必須揉進用戶的具體問題。語氣要自然，像在對話，不要像寫論文。`
        });

        await streamResponse(STATE.chatHistory);
        STATE.isAnalyzing = false;
    }

    async function sendFollowUp() {
        const input = document.getElementById('tr-chat-input');
        const text = input.value.trim();
        if (!text || STATE.isAnalyzing) return;

        input.value = '';
        STATE.isAnalyzing = true;

        const currentTime = getCurrentTime();
        appendMessage('user', text);
        STATE.chatHistory.push({ role: 'user', content: `【當前時間】${currentTime.formatted}\n\n${text}` });
        await streamResponse(STATE.chatHistory);
        STATE.isAnalyzing = false;
    }

    async function streamResponse(messages) {
        const textEl = appendMessage('ai', '<span style="opacity:0.6;">⚡ 正在解析中...</span>');
        let fullResponse = "";
        const log = document.getElementById('tr-log');

        try {
            const config = win.OS_SETTINGS ? win.OS_SETTINGS.getConfig() : {};

            await new Promise((resolve, reject) => {
                win.OS_API.chat(messages, config, (chunk) => {
                    if (typeof chunk === 'string') {
                        if (chunk.length >= fullResponse.length && fullResponse.length > 0 && chunk.startsWith(fullResponse)) {
                            fullResponse = chunk;
                        } else {
                            fullResponse += chunk;
                        }
                    } else {
                        fullResponse += String(chunk);
                    }
                }, (final) => {
                    fullResponse = final || fullResponse;
                    textEl.innerHTML = fullResponse.replace(/\n/g, '<br>');
                    log.scrollTop = log.scrollHeight;
                    resolve();
                }, reject);
            });
            
            const hasCardDrawTrigger = fullResponse.includes('[drew a card]');
            let cleanResponse = fullResponse;
            
            if (hasCardDrawTrigger) {
                cleanResponse = fullResponse.replace(/\[drew a card\]/g, '').trim();
                textEl.innerHTML = cleanResponse.replace(/\n/g, '<br>');
                setTimeout(() => { showDrawCardButton(); }, 300);
            }
            
            STATE.chatHistory.push({ role: 'assistant', content: cleanResponse });

        } catch (e) {
            textEl.innerHTML = `<span style="color:red">連接斷開: ${e.message}</span>`;
            console.error(e);
        }
    }
    
    function showDrawCardButton() {
        const log = document.getElementById('tr-log');
        const existingBtn = log.querySelector('.tr-draw-card-btn');
        if (existingBtn) existingBtn.parentElement.remove();
        
        const buttonDiv = document.createElement('div');
        buttonDiv.style.cssText = 'text-align:center; margin:15px 0;';
        buttonDiv.innerHTML = `
            <button class="tr-draw-card-btn" onclick="window.OS_TAROT.triggerSingleCardDraw()">
                ✨ 抽一張牌
            </button>
        `;
        log.appendChild(buttonDiv);
        log.scrollTop = log.scrollHeight;
    }
    
    function triggerSingleCardDraw() {
        console.log('[Tarot] 用戶點擊抽卡按鈕，觸發單卡抽卡...');
        
        const logEl = document.getElementById('tr-log');
        const existingBtn = logEl?.querySelector('.tr-draw-card-btn');
        if (existingBtn) existingBtn.parentElement.remove();
        
        STATE.singleCardMode = true;
        STATE.selectedCards = [];
        STATE.isRevealed = false;
        
        let tempDeck = [...FULL_DECK_DEF];
        for (let i = tempDeck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tempDeck[i], tempDeck[j]] = [tempDeck[j], tempDeck[i]];
        }
        STATE.deck = tempDeck.map(card => ({
            ...card,
            isReversed: Math.random() < 0.5
        }));
        
        // 🔥 確保舞台顯示，以進行選牌
        const stage = document.getElementById('tr-stage');
        stage.classList.remove('hidden-mode'); // 顯示舞台
        stage.classList.remove('compact');
        document.getElementById('tr-panel').classList.remove('active'); // 暫時隱藏面板
        
        [0, 1, 2].forEach(i => {
            const slot = document.getElementById(`slot-${i}`);
            if (i === 0) {
                slot.className = 'tr-slot';
                slot.innerHTML = '1';
                slot.style.display = 'flex';
            } else {
                slot.className = 'tr-slot';
                slot.style.display = 'none';
            }
        });
        
        const scrollArea = document.getElementById('tr-scroll-area');
        scrollArea.innerHTML = '';
        STATE.deck.forEach((card, index) => {
            const el = document.createElement('div');
            el.className = 'tr-mini-card';
            el.dataset.index = index;
            el.onclick = () => pickCard(index, el);
            scrollArea.appendChild(el);
        });
        scrollArea.classList.add('active');
        
        const log = document.getElementById('tr-log');
        const tipDiv = document.createElement('div');
        tipDiv.style.cssText = 'text-align:center; color:var(--tr-primary); margin:15px 0; font-size:13px; font-style:italic;';
        tipDiv.innerHTML = '✨ 請從上方選擇一張牌...';
        log.appendChild(tipDiv);
        log.scrollTop = log.scrollHeight;
    }
    
    // 單卡解析
    async function analyzeSingleCard() {
        if (STATE.isAnalyzing || STATE.selectedCards.length !== 1) return;
        STATE.isAnalyzing = true;
        STATE.isRevealed = true;
        
        const card = STATE.selectedCards[0];
        const currentTime = getCurrentTime();
        
        // 🔥 單卡翻牌後，轉移到聊天記錄，並隱藏舞台
        setTimeout(() => {
            document.getElementById('tr-stage').classList.add('hidden-mode');
            document.getElementById('tr-panel').classList.add('active');
            
            // 轉移顯示
            renderCardsToHistory(STATE.selectedCards);
            
            // 開始 AI 請求
            startSingleCardAI();
        }, 1200);

        function startSingleCardAI() {
            let systemPrompt = "你現在是 Pythia，一位神秘、且富有洞察力的塔羅占卜師(姊姊)。";
            if (win.OS_PROMPTS) {
                const customPrompt = win.OS_PROMPTS.get('tarot_pythia');
                if (customPrompt && customPrompt.trim().length > 0) {
                    systemPrompt = customPrompt;
                }
            }
            
            const cardInfo = `單卡: ${card.name} [${card.isReversed ? '逆位 (Reversed)' : '正位 (Upright)'}]${cardBrief(card)}`;
            
            STATE.chatHistory.push({
                role: 'system',
                content: `${systemPrompt}

【當前時間】${currentTime.formatted}

這是一張補充牌。請根據這張牌為用戶進行簡短的單卡解讀（約50-100字）。語氣要自然，像在對話。`
            });
            STATE.chatHistory.push({
                role: 'user',
                content: `請解讀這張牌：${cardInfo}`
            });
            
            streamResponse(STATE.chatHistory).then(() => {
                STATE.singleCardMode = false;
                STATE.isAnalyzing = false;
                
                // 恢復槽位顯示 (為下次做準備，雖然現在是隱藏的)
                [1, 2].forEach(i => {
                    const slot = document.getElementById(`slot-${i}`);
                    if (slot) slot.style.display = 'flex';
                });
            });
        }
    }

    function reset() {
        document.getElementById('tr-panel').classList.remove('active');
        document.getElementById('tr-stage').classList.remove('hidden-mode');
        initDeck();
        renderUI();
    }

    win.OS_TAROT = {
        launch,
        startSelection,
        pickCard,
        revealCards,
        sendFollowUp,
        reset,
        startNewReading, 
        triggerSingleCardDraw 
    };

})();