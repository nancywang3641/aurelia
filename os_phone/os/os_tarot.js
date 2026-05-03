// ----------------------------------------------------------------
// [檔案] os_tarot.js (V6.0 - Seamless Immersion)
// 路徑：os_phone/os/os_tarot.js
// 職責：賽博塔羅占卜 V6.0
// 修改：
// 1. [UX重構] "揭示"後，頂部舞台會完全隱藏 (display:none)，聊天室佔滿全屏。
// 2. [流程] 卡牌結果會直接成為聊天記錄的第一條內容，實現「無縫轉移」視覺效果。
// 3. [單抽優化] 點擊單抽時，舞台會暫時滑出，選完後自動收回。
// 4. [保留] V5.1 的 Ace 圖片修復 (swac, waac...)。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入賽博塔羅系統 (V6.0 Seamless Immersion)...');
    const win = window.parent || window;

    // =================================================================
    // 1. 樣式定義 (Cyber Mysticism V6.0)
    // =================================================================
    const style = `
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Share+Tech+Mono&display=swap');

        :root {
            --tr-bg: #0a0a12;
            --tr-primary: #d4af37; /* Gold */
            --tr-accent: #9b59b6; /* Purple */
            --tr-glitch: #00f2ff; /* Cyan */
            --tr-danger: #ff4757;
            --tr-text: #e0e0e0;
        }

        .tr-container {
            width: 100%; height: 100%;
            background: radial-gradient(circle at center, #1a1a2e 0%, #000000 100%);
            color: var(--tr-text);
            font-family: 'Share Tech Mono', monospace;
            display: flex; flex-direction: column;
            overflow: hidden; position: relative;
        }

        /* Header */
        .tr-header {
            padding: 10px 15px; border-bottom: 1px solid rgba(212, 175, 55, 0.3);
            display: flex; justify-content: space-between; align-items: center;
            background: rgba(0,0,0,0.6); backdrop-filter: blur(5px); z-index: 10; flex-shrink: 0;
        }
        .tr-title {
            font-family: 'Cinzel', serif; font-size: 15px; color: var(--tr-primary);
            text-shadow: 0 0 10px rgba(212, 175, 55, 0.5); letter-spacing: 2px;
        }
        .tr-btn-icon {
            background: transparent; border: 1px solid var(--tr-primary); color: var(--tr-primary);
            width: 26px; height: 26px; border-radius: 50%; cursor: pointer;
            display: flex; align-items: center; justify-content: center; transition: 0.3s; font-size: 12px;
        }
        .tr-btn-icon:hover { background: var(--tr-primary); color: #000; box-shadow: 0 0 15px var(--tr-primary); }

        /* Main Stage (儀式區) */
        .tr-stage {
            flex: 1; 
            min-height: 0; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: flex-start;
            position: relative; 
            overflow: hidden; 
            padding-top: 5px;
            transition: all 0.8s cubic-bezier(0.22, 1, 0.36, 1); /* 平滑過渡 */
            opacity: 1;
        }
        
        /* 🔥 [V6.0] 隱藏模式：高度歸零，完全消失 */
        .tr-stage.hidden-mode {
            flex: 0 0 0;
            padding-top: 0;
            opacity: 0;
            pointer-events: none;
        }

        /* Input Area (初始問題) */
        .tr-input-area {
            position: absolute; top: 55%; left: 50%; transform: translate(-50%, -50%);
            width: 85%; max-width: 350px; z-index: 20;
            display: flex; flex-direction: column; gap: 10px;
            transition: 0.3s;
        }
        .tr-input-area.hidden { opacity: 0; pointer-events: none; transform: translate(-50%, -60%); }

        .tr-input {
            background: rgba(0,0,0,0.85); border: 1px solid var(--tr-primary);
            color: var(--tr-primary); padding: 10px; border-radius: 4px;
            font-family: 'Share Tech Mono', monospace; outline: none; text-align: center;
            font-size: 13px;
        }
        .tr-btn-main {
            background: linear-gradient(90deg, #9b59b6 0%, #111 100%);
            border: 1px solid var(--tr-accent); color: #fff; padding: 10px;
            font-family: 'Cinzel', serif; font-weight: bold; cursor: pointer;
            text-transform: uppercase; letter-spacing: 1px; font-size: 13px;
            box-shadow: 0 0 10px rgba(155, 89, 182, 0.3); transition: 0.3s;
        }
        .tr-btn-main:hover { box-shadow: 0 0 20px rgba(155, 89, 182, 0.6); border-color: #fff; }

        /* 三卡槽區域 */
        .tr-slots-wrapper {
            display: flex; gap: 12px; justify-content: center; align-items: center;
            width: 100%; padding: 0 10px; box-sizing: border-box;
            margin-top: 20px; z-index: 5; transition: 0.3s;
        }
        
        .tr-slot {
            width: 110px; height: 180px;
            border: 2px dashed rgba(212, 175, 55, 0.4);
            border-radius: 8px; position: relative;
            display: flex; justify-content: center; align-items: center;
            font-size: 12px; color: #555; perspective: 1000px;
        }
        .tr-slot.filled { border-style: solid; border-color: var(--tr-primary); }

        /* 橫向選牌區 */
        .tr-deck-scroll {
            position: absolute; bottom: 70px; left: 0; width: 100%; height: 150px;
            display: flex; align-items: center; gap: -15px;
            overflow-x: auto; overflow-y: hidden;
            padding: 0 35px; scroll-behavior: smooth;
            z-index: 10; opacity: 0; pointer-events: none; transform: translateY(50px);
            transition: 0.5s;
        }
        .tr-deck-scroll.active { opacity: 1; pointer-events: auto; transform: translateY(0); }
        
        .tr-deck-scroll::-webkit-scrollbar { height: 3px; }
        .tr-deck-scroll::-webkit-scrollbar-thumb { background: var(--tr-primary); border-radius: 2px; }

        .tr-mini-card {
            width: 70px; height: 110px; flex-shrink: 0;
            background: linear-gradient(135deg, #111, #222);
            border: 1px solid #444; border-radius: 4px;
            cursor: pointer; transition: 0.3s;
            background-image: radial-gradient(#d4af37 1px, transparent 1px);
            background-size: 10px 10px;
            box-shadow: -2px 0 5px rgba(0,0,0,0.5);
            display: flex; justify-content: center; align-items: center;
        }
        .tr-mini-card:hover { transform: translateY(-15px) scale(1.1); z-index: 100; border-color: var(--tr-primary); }
        .tr-mini-card.picked { opacity: 0; pointer-events: none; transform: translateY(-50px); }

        /* 卡牌本體 */
        .tr-card-obj {
            width: 100%; height: 100%; position: relative;
            transform-style: preserve-3d; transition: transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .tr-face {
            position: absolute; width: 100%; height: 100%;
            backface-visibility: hidden; border-radius: 5px;
            box-shadow: 0 0 8px rgba(0,0,0,0.8);
            background-size: cover; background-position: center;
        }
        .tr-face.back {
            background: linear-gradient(135deg, #1a1a1a, #000);
            border: 1px solid var(--tr-primary);
            background-image: repeating-linear-gradient(45deg, rgba(212,175,55,0.1) 0, rgba(212,175,55,0.1) 2px, transparent 2px, transparent 8px);
        }
        .tr-face.front { transform: rotateY(180deg); background-color: #fff; }
        .tr-card-obj.flipped { transform: rotateY(180deg); }
        .tr-card-obj.flipped.reversed .tr-face.front { transform: rotateY(180deg) rotateZ(180deg); }

        .tr-card-label {
            position: absolute; bottom: -25px; width: 150%; left: -25%; text-align: center;
            font-size: 11px; color: #fff; text-shadow: 0 0 3px #000;
            opacity: 0; transition: 0.5s; pointer-events: none;
        }
        .tr-card-obj.flipped .tr-card-label { opacity: 1; }
        .label-rev { color: var(--tr-danger) !important; }

        /* Reveal Button */
        .tr-action-bar {
            position: absolute; bottom: 15px; width: 100%; text-align: center;
            z-index: 15; pointer-events: none;
        }
        .tr-btn-reveal {
            pointer-events: auto; padding: 8px 25px; border-radius: 20px;
            background: var(--tr-primary); color: #000; font-weight: bold; border: none;
            box-shadow: 0 0 15px var(--tr-primary); cursor: pointer; font-size: 12px;
            font-family: 'Cinzel', serif; opacity: 0; transform: translateY(20px); transition: 0.3s;
        }
        .tr-btn-reveal.show { opacity: 1; transform: translateY(0); }

        /* Chat Panel (下半部：聊天室) */
        .tr-analysis-panel {
            flex: 0 0 0;
            background: rgba(10, 10, 18, 0.95); 
            border-top: 1px solid #333;
            display: flex; flex-direction: column; overflow: hidden;
            transform: translateY(100%); 
            transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
            position: absolute; bottom: 0; left: 0; right: 0;
            z-index: 5; max-height: 0; opacity: 0; pointer-events: none;
        }
        .tr-analysis-panel.active { 
            flex: 1; position: relative; 
            transform: translateY(0); max-height: none; opacity: 1; pointer-events: auto;
        }
        
        .tr-chat-content {
            flex: 1; overflow-y: auto; overflow-x: hidden; padding: 15px; 
            font-size: 13px; line-height: 1.6; display: flex; flex-direction: column; gap: 16px;
            -webkit-overflow-scrolling: touch; scroll-behavior: smooth;
        }
        .tr-chat-content::-webkit-scrollbar { width: 8px; }
        .tr-chat-content::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.3); border-radius: 4px; }
        .tr-chat-content::-webkit-scrollbar-thumb { background: var(--tr-primary); border-radius: 4px; transition: background 0.2s; }
        .tr-chat-content::-webkit-scrollbar-thumb:hover { background: #f4d03f; }

        .tr-msg-block { animation: fadeIn 0.5s; max-width: 90%; margin-bottom: 4px; word-wrap: break-word; }
        .tr-msg-block.ai { align-self: flex-start; border-left: 2px solid var(--tr-primary); padding: 10px 12px; margin-right: auto; }
        .tr-msg-block.user { align-self: flex-end; background: rgba(155, 89, 182, 0.2); padding: 10px 14px; border-radius: 8px; border-right: 2px solid var(--tr-accent); text-align: right; margin-left: auto; }
        .tr-role { font-weight: bold; font-size: 11px; margin-bottom: 6px; text-transform: uppercase; opacity: 0.8; letter-spacing: 0.5px; }
        .role-pythia { color: var(--tr-primary); }
        .role-user { color: var(--tr-accent); }
        .tr-text { color: #ddd; white-space: pre-wrap; font-family: sans-serif; line-height: 1.7; margin: 0; }

        /* 🔥 歷史卡牌快照樣式 */
        .tr-history-snap {
            display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
            padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.1); margin: 5px auto 15px auto;
            animation: fadeIn 0.8s;
            max-width: 90%;
        }
        .tr-history-card {
            width: 60px; display: flex; flex-direction: column; align-items: center; gap: 5px;
        }
        .tr-history-img {
            width: 60px; height: 100px; border-radius: 4px; background-size: cover; background-position: center;
            border: 1px solid #666; box-shadow: 0 2px 5px rgba(0,0,0,0.5);
        }
        .tr-history-img.rev { transform: rotate(180deg); }
        .tr-history-name { font-size: 10px; color: #aaa; text-align: center; line-height: 1.2; }
        .tr-history-rev-tag { font-size: 9px; color: var(--tr-danger); }

        /* Chat Input Bar */
        .tr-chat-bar { padding: 8px 12px; background: #000; border-top: 1px solid #333; display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
        .tr-chat-input { flex: 1; background: #222; border: 1px solid #444; color: #fff; padding: 8px 12px; border-radius: 20px; font-size: 13px; outline: none; transition: 0.3s; }
        .tr-chat-input:focus { border-color: var(--tr-primary); background: #333; }
        .tr-chat-btn { background: var(--tr-primary); color: #000; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .tr-chat-btn:active { transform: scale(0.9); }

        .tr-panel-footer { padding: 5px; background:#000; display: flex; gap: 10px; justify-content: center; font-size:10px; color:#555; border-top:1px solid #222; }
        .tr-link-btn { cursor:pointer; color:#666; text-decoration: underline; }
        .tr-link-btn:hover { color:var(--tr-danger); }

        /* 單卡抽卡按鈕 */
        .tr-draw-card-btn {
            display: inline-block; background: linear-gradient(90deg, var(--tr-primary) 0%, #f4d03f 100%);
            color: #000; padding: 10px 20px; border-radius: 20px; cursor: pointer;
            font-weight: bold; font-size: 13px; border: 2px solid var(--tr-primary);
            box-shadow: 0 0 15px rgba(212, 175, 55, 0.5); transition: all 0.3s;
            margin: 10px 0; text-align: center;
        }
        .tr-draw-card-btn:hover { transform: translateY(-2px); box-shadow: 0 0 20px rgba(212, 175, 55, 0.8); background: linear-gradient(90deg, #f4d03f 0%, var(--tr-primary) 100%); }
        .tr-draw-card-btn:active { transform: translateY(0); }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
    `;

    const doc = window.parent.document || document;
    if (!doc.getElementById('os-tarot-css')) {
        const s = doc.createElement('style'); s.id = 'os-tarot-css'; s.innerHTML = style; doc.head.appendChild(s);
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
                         <span class="tr-link-btn" onclick="window.OS_TAROT.callJury()">💬 召喚吐槽評判室</span>
                         <span>|</span>
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
牌陣數據:
1. ${card1.name} [${card1.isReversed ? '逆位 (Reversed)' : '正位 (Upright)'}]
2. ${card2.name} [${card2.isReversed ? '逆位 (Reversed)' : '正位 (Upright)'}]
3. ${card3.name} [${card3.isReversed ? '逆位 (Reversed)' : '正位 (Upright)'}]`;

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
請先進行整體的牌陣解讀 (三張牌的關聯)。語氣要自然，像在對話，不要像寫論文。` 
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
            
            const cardInfo = `單卡: ${card.name} [${card.isReversed ? '逆位 (Reversed)' : '正位 (Upright)'}]`;
            
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

    // 評判室
    async function callJury() {
        const log = document.getElementById('tr-log');
        log.innerHTML += `<div style="text-align:center; color:#00f2ff; margin:20px 0; font-size:12px;">——— 系統插播：評判室吐槽 ———</div>`;
        
        const currentTime = getCurrentTime();
        
        const prompt = `
【當前時間】${currentTime.formatted}

用戶問題: ${STATE.question}
Pythia 的解讀已經結束。
請 Logic, Emo, Troll 三人組針對剛才的牌局進行簡短的吐槽。
牌面: ${STATE.selectedCards.map(c => c.name).join(', ')}
        `;
        
        let sysPrompt = "你是吐槽三人組。";
        if (win.OS_PROMPTS) {
            const customPrompt = win.OS_PROMPTS.get('tarot_jury');
            if (customPrompt && customPrompt.trim().length > 0) {
                sysPrompt = customPrompt;
            }
        }

        let config = win.OS_SETTINGS && win.OS_SETTINGS.getSecondaryConfig ? win.OS_SETTINGS.getSecondaryConfig() : {};
        const messages = [{ role: 'system', content: sysPrompt }, { role: 'user', content: prompt }];

        const msgDiv = document.createElement('div');
        log.appendChild(msgDiv);
        log.scrollTop = log.scrollHeight;

        let fullText = "";
        try {
            await new Promise((resolve, reject) => {
                win.OS_API.chat(messages, config, (chunk) => {
                    fullText += chunk;
                    msgDiv.innerHTML = parseJury(fullText);
                    log.scrollTop = log.scrollHeight;
                }, (final) => {
                    fullText = final;
                    msgDiv.innerHTML = parseJury(final);
                    resolve();
                }, reject);
            });
        } catch (e) {
            msgDiv.innerHTML = `<div style="color:red">吐槽失敗: ${e.message}</div>`;
        }
    }

    function parseJury(text) {
        if (!text) return "";
        let html = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        html = html.replace(/Logic/g, '<span style="color:#3498db">Logic</span>')
                   .replace(/Emo/g, '<span style="color:#ff6b81">Emo</span>')
                   .replace(/Troll/g, '<span style="color:#00f2ff">Troll</span>');
        return `<div class="tr-msg-block" style="font-size:12px; opacity:0.8;">${html}</div>`;
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
        callJury,
        reset,
        startNewReading, 
        triggerSingleCardDraw 
    };

})();