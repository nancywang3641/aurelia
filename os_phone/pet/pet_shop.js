// ----------------------------------------------------------------
// [檔案] pet_shop.js (V4.3 - Soul Injection Update)
// 路徑：os_phone/pet/pet_shop.js
// 職責：寵物商店、基因培育室、物品購買
// 更新：
// 1. [新增] 靈魂注入輸入框 (Custom Prompt Input)。
// 2. [優化] AI 提示詞邏輯，支持將人類人設轉換為寵物形象。
// 3. [介面] 調整培育室佈局以容納輸入框。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入寵物商店 (V4.3 Soul Injection)...');
    const win = window.parent || window;

    // =================================================================
    // 1. 樣式定義 (Sapphire Theme + Lab V3)
    // =================================================================
    const shopStyle = `
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Lato:wght@300;400;700&display=swap');

        :root {
            --ps-royal: #112250;      /* 深藍底 */
            --ps-sapphire: #3C507D;   /* 藍寶石 */
            --ps-gold: #E0C58F;       /* 流沙金 */
            --ps-text: #F5F0E9;       /* 淺米白 */
            --ps-red: #ff6b6b;        /* 警告/愛心 */
            --ps-neon: #00f2ff;       /* 實驗室螢光 */
        }

        .ps-container {
            width: 100%; height: 100%;
            background: linear-gradient(180deg, var(--ps-royal) 0%, #0a1530 100%);
            color: var(--ps-text);
            font-family: 'Lato', sans-serif;
            display: flex; flex-direction: column;
            overflow: hidden; position: relative;
        }

        /* --- Header --- */
        .ps-header {
            padding: 15px 20px;
            background: rgba(17, 34, 80, 0.95);
            border-bottom: 1px solid rgba(224, 197, 143, 0.3);
            display: flex; align-items: center; justify-content: space-between;
            z-index: 10; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            flex-shrink: 0;
        }
        .ps-title {
            font-family: 'Cinzel', serif; font-size: 18px; color: var(--ps-gold);
            text-transform: uppercase; letter-spacing: 2px;
        }
        .ps-balance-box {
            display: flex; flex-direction: column; align-items: flex-end;
        }
        .ps-balance {
            font-size: 14px; color: var(--ps-gold); font-family: monospace; font-weight: bold;
        }
        .ps-balance-label {
            font-size: 9px; color: #888; text-transform: uppercase;
        }

        .ps-btn-icon {
            width: 32px; height: 32px; border-radius: 50%;
            border: 1px solid var(--ps-gold); color: var(--ps-gold);
            background: transparent; display: flex; align-items: center; justify-content: center;
            cursor: pointer; transition: 0.3s;
        }
        .ps-btn-icon:hover { background: var(--ps-gold); color: var(--ps-royal); }
        .ps-btn-settings { border-color: var(--ps-gold); color: var(--ps-gold); }
        .ps-btn-settings:hover { background: var(--ps-gold); color: var(--ps-royal); }
        
        /* --- Settings Panel --- */
        .ps-settings-panel {
            background: rgba(20, 25, 40, 0.95); padding: 20px; border: 1px solid var(--ps-gold);
            border-radius: 12px; width: 85%; max-width: 400px; position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%) scale(0.9); opacity: 0; pointer-events: none;
            transition: 0.3s; z-index: 100; box-shadow: 0 20px 50px rgba(0,0,0,0.8);
        }
        .ps-settings-panel.active {
            transform: translate(-50%, -50%) scale(1); opacity: 1; pointer-events: auto;
        }
        .ps-settings-close {
            position: absolute; top: 10px; right: 10px; color: #666; cursor: pointer; font-size: 18px;
        }
        .ps-settings-close:hover { color: #fff; }
        .ps-settings-title {
            text-align: center; color: var(--ps-gold); font-family: 'Cinzel', serif;
            font-weight: bold; font-size: 16px; margin-bottom: 15px;
        }
        .ps-bg-input-area { margin-top: 15px; }
        .ps-bg-input-label { color: var(--ps-gold); font-size: 12px; margin-bottom: 8px; display: block; text-transform: uppercase; }
        .ps-bg-input { width: 100%; padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(224, 197, 143, 0.3); border-radius: 8px; color: #fff; font-size: 12px; font-family: monospace; box-sizing: border-box; }
        .ps-bg-input:focus { outline: none; border-color: var(--ps-gold); background: rgba(0,0,0,0.5); }
        .ps-bg-preview { width: 100%; aspect-ratio: 16/9; border-radius: 8px; border: 2px solid var(--ps-gold); overflow: hidden; background: #222; margin-top: 10px; position: relative; }
        .ps-bg-preview img { width: 100%; height: 100%; object-fit: cover; }
        .ps-bg-preview-none { display: flex; align-items: center; justify-content: center; color: #666; font-size: 12px; height: 100%; }
        .ps-bg-btn-save { width: 100%; margin-top: 10px; padding: 10px; background: var(--ps-gold); color: var(--ps-royal); border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .ps-bg-remove-btn { width: 100%; margin-top: 10px; padding: 8px; background: transparent; border: 1px solid #fa5151; color: #fa5151; border-radius: 4px; font-size: 12px; cursor: pointer; transition: 0.2s; }

        /* --- Tabs --- */
        .ps-tabs {
            display: flex; background: rgba(17, 34, 80, 0.5);
            border-bottom: 1px solid rgba(255,255,255,0.05);
            flex-shrink: 0;
        }
        .ps-tab {
            flex: 1; text-align: center; padding: 12px;
            font-family: 'Cinzel', serif; font-size: 12px; color: #888;
            cursor: pointer; border-bottom: 2px solid transparent; transition: 0.3s;
        }
        .ps-tab.active {
            color: var(--ps-gold); border-bottom-color: var(--ps-gold);
            background: linear-gradient(to top, rgba(224, 197, 143, 0.1), transparent);
        }

        /* --- Content Area --- */
        .ps-content {
            flex: 1; overflow-y: auto; padding: 15px;
            display: flex; flex-direction: column; gap: 15px;
            position: relative;
        }

        /* --- Section: Refresh Control --- */
        .ps-control-area {
            text-align: center; margin-bottom: 10px;
        }
        .ps-btn-refresh {
            width: 100%; padding: 14px;
            background: linear-gradient(45deg, rgba(60,80,125,0.4), rgba(17,34,80,0.6));
            border: 1px solid var(--ps-gold);
            color: var(--ps-gold);
            font-family: 'Cinzel', serif; font-weight: bold; letter-spacing: 1px;
            cursor: pointer; transition: 0.3s; border-radius: 8px;
            display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .ps-btn-refresh:hover {
            background: rgba(224, 197, 143, 0.1);
            box-shadow: 0 0 15px rgba(224, 197, 143, 0.15);
        }
        .ps-btn-refresh:disabled {
            opacity: 0.5; cursor: wait; filter: grayscale(1);
        }

        /* --- Grid Layouts --- */
        .ps-grid {
            display: grid; grid-template-columns: 1fr; gap: 15px;
        }

        /* --- Pet Card Style --- */
        .ps-pet-card {
            background: rgba(60, 80, 125, 0.2);
            border: 1px solid rgba(224, 197, 143, 0.2);
            border-radius: 12px; overflow: hidden;
            display: flex; flex-direction: column;
            transition: 0.3s;
        }
        .ps-pet-card:hover {
            border-color: var(--ps-gold);
            background: rgba(60, 80, 125, 0.4);
        }
        .ps-pet-img {
            width: 100%; height: 160px; object-fit: cover; background: #000; transition: opacity 0.5s;
        }
        .ps-pet-info {
            padding: 12px;
        }
        .ps-pet-name {
            font-size: 16px; font-weight: bold; color: var(--ps-text);
            font-family: 'Cinzel', serif; margin-bottom: 4px;
        }
        .ps-pet-type {
            font-size: 10px; color: var(--ps-gold); text-transform: uppercase;
            border: 1px solid var(--ps-gold); padding: 1px 4px; border-radius: 4px;
            display: inline-block; margin-bottom: 6px;
        }
        .ps-pet-desc {
            font-size: 11px; color: #ccc; line-height: 1.4; margin-bottom: 10px;
            min-height: 30px;
        }
        .ps-pet-footer {
            display: flex; justify-content: space-between; align-items: center;
            border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;
        }

        /* --- Item Card Style --- */
        .ps-item-card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px; padding: 10px;
            display: flex; align-items: center; gap: 15px;
            transition: 0.2s;
        }
        .ps-item-card:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: var(--ps-gold);
        }
        .ps-item-icon {
            font-size: 32px; width: 50px; height: 50px;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.3); border-radius: 8px;
        }
        .ps-item-details { flex: 1; }
        .ps-item-name { font-size: 14px; font-weight: bold; color: #fff; }
        .ps-item-desc { font-size: 10px; color: #aaa; margin-top: 3px; }
        .ps-item-meta {
            display: flex; gap: 8px; margin-top: 5px; font-size: 10px;
        }
        .ps-tag-price { color: var(--ps-gold); font-weight: bold; border: 1px solid var(--ps-gold); background: transparent; padding: 2px 6px; border-radius: 4px; }

        /* --- LAB Styles (V3: With Input) --- */
        .lab-container {
            display: flex; flex-direction: column; height: 100%;
            position: absolute; top: 0; left: 0; width: 100%;
        }
        .lab-visual {
            flex: 1; width: 100%; position: relative;
            background-image: url('https://files.catbox.moe/d6xpbn.png');
            background-size: cover; background-position: center; background-repeat: no-repeat;
        }
        .lab-slots-overlay {
            position: absolute; bottom: 25%; width: 100%;
            display: flex; justify-content: center; gap: 120px;
        }
        .lab-slot {
            width: 60px; height: 60px; border-radius: 50%;
            border: 2px dashed rgba(0, 242, 255, 0.5);
            background: rgba(0, 0, 0, 0.6);
            display: flex; align-items: center; justify-content: center;
            font-size: 32px; color: var(--ps-neon);
            cursor: pointer; transition: 0.3s;
            box-shadow: 0 0 15px rgba(0, 242, 255, 0.2);
            backdrop-filter: blur(2px);
        }
        .lab-slot.filled {
            border-style: solid; border-color: var(--ps-neon);
            background: rgba(0, 242, 255, 0.3);
            text-shadow: 0 0 10px #fff;
            animation: pulse 2s infinite;
        }
        .lab-slot:hover { transform: scale(1.1); border-color: #fff; }
        
        .lab-controls {
            padding: 10px 15px; background: rgba(10, 15, 30, 0.95);
            border-top: 1px solid var(--ps-gold);
            z-index: 5; display: flex; flex-direction: column; gap: 10px;
        }
        .lab-materials {
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(45px, 1fr));
            gap: 10px; 
            padding: 10px;
            max-height: 200px;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: rgba(0, 242, 255, 0.3) transparent;
        }
        .lab-materials::-webkit-scrollbar { width: 6px; }
        .lab-materials::-webkit-scrollbar-track { background: transparent; }
        .lab-materials::-webkit-scrollbar-thumb { background: rgba(0, 242, 255, 0.3); border-radius: 3px; }
        .lab-materials::-webkit-scrollbar-thumb:hover { background: rgba(0, 242, 255, 0.5); }
        .lab-mat-item {
            width: 45px; height: 45px; background: #1a1a1a; border: 1px solid #444;
            border-radius: 10px; display: flex; align-items: center; justify-content: center;
            font-size: 22px; cursor: pointer; transition: 0.2s;
            aspect-ratio: 1;
        }
        .lab-mat-item:hover { border-color: var(--ps-neon); background: #222; transform: translateY(-3px); }
        
        /* 🔥 新增輸入框樣式 */
        .lab-custom-input {
            width: 100%; height: 50px;
            background: rgba(0, 242, 255, 0.05);
            border: 1px solid rgba(0, 242, 255, 0.3);
            color: var(--ps-neon);
            border-radius: 8px; padding: 8px;
            font-size: 11px; font-family: monospace;
            resize: none; box-sizing: border-box;
            transition: 0.2s;
        }
        .lab-custom-input:focus {
            outline: none; border-color: var(--ps-neon);
            background: rgba(0, 242, 255, 0.1);
            box-shadow: 0 0 10px rgba(0, 242, 255, 0.2);
        }
        .lab-custom-input::placeholder { color: rgba(0, 242, 255, 0.4); }

        .lab-btn-mix {
            width: 100%; padding: 12px;
            background: linear-gradient(90deg, #1e3c72 0%, #2a5298 100%);
            border: 1px solid var(--ps-neon); color: var(--ps-neon);
            font-family: 'Cinzel', serif; font-weight: bold; letter-spacing: 2px;
            border-radius: 8px; cursor: pointer; text-shadow: 0 0 5px var(--ps-neon);
            transition: 0.3s;
        }
        .lab-btn-mix:hover {
            box-shadow: 0 0 20px rgba(0, 242, 255, 0.5);
            background: linear-gradient(90deg, #2a5298 0%, #1e3c72 100%);
        }
        .lab-btn-mix:disabled { filter: grayscale(1); opacity: 0.5; cursor: not-allowed; }

        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(0, 242, 255, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(0, 242, 255, 0); } 100% { box-shadow: 0 0 0 0 rgba(0, 242, 255, 0); } }

        /* --- Result Modal --- */
        .ps-modal-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); z-index: 200;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; pointer-events: none; transition: 0.3s;
            backdrop-filter: blur(5px);
        }
        .ps-modal-overlay.active { opacity: 1; pointer-events: auto; }
        
        .ps-result-card {
            background: linear-gradient(135deg, #111, #1a1a2e);
            border: 2px solid var(--ps-neon); border-radius: 16px;
            width: 85%; max-width: 320px; max-height: 80vh; padding: 20px;
            text-align: center; box-shadow: 0 0 30px rgba(0, 242, 255, 0.2);
            transform: scale(0.9); transition: 0.3s;
            overflow-y: auto; display: flex; flex-direction: column;
            scrollbar-width: thin;
            scrollbar-color: rgba(0, 242, 255, 0.3) transparent;
        }
        .ps-result-card::-webkit-scrollbar { width: 6px; }
        .ps-result-card::-webkit-scrollbar-track { background: transparent; }
        .ps-result-card::-webkit-scrollbar-thumb { background: rgba(0, 242, 255, 0.3); border-radius: 3px; }
        .ps-result-card::-webkit-scrollbar-thumb:hover { background: rgba(0, 242, 255, 0.5); }
        .ps-modal-overlay.active .ps-result-card { transform: scale(1); }
        
        .ps-result-title {
            color: var(--ps-neon); font-family: 'Cinzel', serif; font-size: 18px;
            margin-bottom: 15px; text-shadow: 0 0 10px var(--ps-neon);
        }
        .ps-result-img-box {
            width: 100%; aspect-ratio: 1/1; border-radius: 12px; overflow: hidden;
            border: 1px solid #333; margin-bottom: 15px; background: #000;
        }
        .ps-result-img { width: 100%; height: 100%; object-fit: cover; }
        .ps-result-name { font-size: 20px; font-weight: bold; color: #fff; margin-bottom: 5px; }
        .ps-result-type { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 10px; }
        .ps-result-desc { font-size: 12px; color: #ccc; line-height: 1.4; margin-bottom: 20px; text-align: left; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; flex-shrink: 0; max-height: 200px; overflow-y: auto; }
        
        .ps-result-actions { display: flex; gap: 10px; }
        .ps-btn-confirm {
            flex: 1; padding: 10px; background: var(--ps-neon); color: #000;
            border: none; border-radius: 8px; font-weight: bold; cursor: pointer;
        }
        .ps-btn-discard {
            flex: 1; padding: 10px; background: transparent; color: #ff6b6b;
            border: 1px solid #ff6b6b; border-radius: 8px; font-weight: bold; cursor: pointer;
        }
        .ps-btn-discard:hover { background: rgba(255,107,107,0.1); }

        /* --- BUY Button (Shop & Pet Cards) --- */
        .ps-btn-buy {
            padding: 8px 16px;
            background: var(--ps-gold);
            color: var(--ps-royal);
            border: none;
            border-radius: 6px;
            font-weight: bold;
            font-size: 12px;
            cursor: pointer;
            transition: 0.2s;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .ps-btn-buy:hover {
            background: #fff;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(224, 197, 143, 0.3);
        }
        .ps-btn-buy:active {
            transform: translateY(0);
        }

        /* --- Utils --- */
        .ps-empty-msg {
            text-align: center; color: #666; font-size: 12px; margin-top: 40px;
            border: 1px dashed #444; padding: 30px; border-radius: 10px;
        }
        .ps-category-title {
            color: var(--ps-gold); font-size: 12px; font-weight: bold;
            margin: 15px 0 8px 0; border-left: 3px solid var(--ps-gold);
            padding-left: 8px; text-transform: uppercase;
        }
    `;

    // 注入 CSS
    const doc = window.parent.document || document;
    if (!doc.getElementById('pet-shop-css')) {
        const s = doc.createElement('style'); s.id = 'pet-shop-css'; s.innerHTML = shopStyle; doc.head.appendChild(s);
    }

    // =================================================================
    // 2. 數據與素材庫
    // =================================================================
    
    // 培育素材庫
    const GENE_MATERIALS = [
        // 動物類
        { id: 'monkey', icon: '🐵', name: '猴子基因' },
        { id: 'dog', icon: '🐶', name: '狗狗基因' },
        { id: 'cat', icon: '🐱', name: '貓咪基因' },
        { id: 'wolf', icon: '🐺', name: '狼族基因' },
        { id: 'fox', icon: '🦊', name: '狐狸基因' },
        { id: 'lion', icon: '🦁', name: '獅子基因' },
        { id: 'tiger', icon: '🐯', name: '老虎基因' },
        { id: 'horse', icon: '🐴', name: '馬匹基因' },
        { id: 'unicorn', icon: '🦄', name: '獨角獸基因' },
        { id: 'rabbit', icon: '🐰', name: '兔子基因' },
        { id: 'mouse', icon: '🐭', name: '老鼠基因' },
        { id: 'bear', icon: '🐻', name: '熊族基因' },
        { id: 'panda', icon: '🐼', name: '熊貓基因' },
        { id: 'bird', icon: '🐦', name: '鳥類基因' },
        { id: 'eagle', icon: '🦅', name: '老鷹基因' },
        { id: 'owl', icon: '🦉', name: '貓頭鷹基因' },
        { id: 'frog', icon: '🐸', name: '青蛙基因' },
        { id: 'snake', icon: '🐍', name: '蛇類基因' },
        { id: 'dragon', icon: '🐉', name: '龍族基因' },
        { id: 'fish', icon: '🐟', name: '魚類基因' },
        { id: 'shark', icon: '🦈', name: '鯊魚基因' },
        { id: 'octopus', icon: '🐙', name: '章魚基因' },
        { id: 'butterfly', icon: '🦋', name: '蝴蝶基因' },
        { id: 'bee', icon: '🐝', name: '蜜蜂基因' },
        { id: 'penguin', icon: '🐧', name: '企鵝基因' },
        { id: 'koala', icon: '🐨', name: '無尾熊基因' },
        { id: 'elephant', icon: '🐘', name: '大象基因' },
        { id: 'giraffe', icon: '🦒', name: '長頸鹿基因' },
        { id: 'zebra', icon: '🦓', name: '斑馬基因' },
        { id: 'deer', icon: '🦌', name: '麋鹿基因' },
        { id: 'bat', icon: '🦇', name: '蝙蝠基因' },
        { id: 'turtle', icon: '🐢', name: '海龜基因' },
        { id: 'dinosaur', icon: '🦕', name: '恐龍基因' },
        { id: 'trex', icon: '🦖', name: '暴龍基因' },
        { id: 'dolphin', icon: '🐬', name: '海豚基因' },
        { id: 'whale', icon: '🐋', name: '鯨魚基因' },
        { id: 'crab', icon: '🦀', name: '螃蟹基因' },
        { id: 'spider', icon: '🕷️', name: '蜘蛛基因' },
        { id: 'scorpion', icon: '🦂', name: '蠍子基因' },
        { id: 'ladybug', icon: '🐞', name: '瓢蟲基因' },
        { id: 'snail', icon: '🐌', name: '蝸牛基因' },
        { id: 'chick', icon: '🐣', name: '雛鳥基因' },
        { id: 'peacock', icon: '🦚', name: '孔雀基因' },
        { id: 'swan', icon: '🦢', name: '天鵝基因' },
        { id: 'phoenix', icon: '🔥🦅', name: '鳳凰基因' },
        
        // 元素類
        { id: 'water', icon: '💧', name: '生命之水' },
        { id: 'fire', icon: '🔥', name: '火焰因子' },
        { id: 'thunder', icon: '⚡', name: '閃電能量' },
        { id: 'nature', icon: '🌿', name: '自然氣息' },
        { id: 'dark', icon: '🌑', name: '暗物質' },
        { id: 'light', icon: '✨', name: '星光粉末' },
        { id: 'tech', icon: '💾', name: 'AI 晶片' },
        { id: 'love', icon: '💗', name: '純粹愛意' },
        { id: 'ice', icon: '❄️', name: '冰霜結晶' },
        { id: 'wind', icon: '🌪️', name: '風之力量' },
        { id: 'earth', icon: '🪨', name: '大地能量' },
        { id: 'metal', icon: '⚙️', name: '機械核心' },
        { id: 'poison', icon: '☠️', name: '劇毒精華' },
        { id: 'holy', icon: '☀️', name: '聖光祝福' },
        { id: 'shadow', icon: '👤', name: '影子能量' },
        { id: 'chaos', icon: '🌀', name: '混沌之力' },
        { id: 'time', icon: '⏰', name: '時間碎片' },
        { id: 'space', icon: '🌌', name: '空間之力' },
        
        // 天體/宇宙類
        { id: 'star', icon: '⭐', name: '星辰之力' },
        { id: 'moon', icon: '🌙', name: '月光精華' },
        { id: 'sun', icon: '☀️', name: '太陽能量' },
        { id: 'comet', icon: '☄️', name: '彗星尾跡' },
        { id: 'planet', icon: '🪐', name: '行星之核' },
        { id: 'galaxy', icon: '🌌', name: '銀河星塵' },
        { id: 'meteor', icon: '💫', name: '流星碎片' },
        { id: 'nebula', icon: '🌠', name: '星雲精華' },
        
        // 寶石/礦物類
        { id: 'diamond', icon: '💎', name: '鑽石能量' },
        { id: 'ruby', icon: '♦️', name: '紅寶石心' },
        { id: 'sapphire', icon: '🔷', name: '藍寶石核' },
        { id: 'emerald', icon: '🟢', name: '祖母綠精華' },
        { id: 'crystal', icon: '🔮', name: '水晶球能量' },
        { id: 'pearl', icon: '🦪', name: '珍珠光澤' },
        { id: 'amber', icon: '🟠', name: '琥珀封印' },
        { id: 'obsidian', icon: '⬛', name: '黑曜石魂' },
        
        // 植物類
        { id: 'flower', icon: '🌸', name: '花朵精華' },
        { id: 'rose', icon: '🌹', name: '玫瑰花瓣' },
        { id: 'tree', icon: '🌳', name: '森林氣息' },
        { id: 'leaf', icon: '🍀', name: '幸運葉片' },
        { id: 'mushroom', icon: '🍄', name: '魔法蘑菇' },
        { id: 'sunflower', icon: '🌻', name: '向日葵種子' },
        { id: 'tulip', icon: '🌷', name: '鬱金香精華' },
        { id: 'lotus', icon: '🪷', name: '蓮花淨化' },
        { id: 'cactus', icon: '🌵', name: '仙人掌刺' },
        { id: 'bamboo', icon: '🎋', name: '竹子氣節' },
        { id: 'maple', icon: '🍁', name: '楓葉殘影' },
        { id: 'herb', icon: '🌾', name: '神秘草藥' },
        { id: 'vine', icon: '🍃', name: '藤蔓纏繞' },
        
        // 食物類
        { id: 'apple', icon: '🍎', name: '蘋果精華' },
        { id: 'cherry', icon: '🍒', name: '櫻桃能量' },
        { id: 'strawberry', icon: '🍓', name: '草莓甜心' },
        { id: 'grape', icon: '🍇', name: '葡萄精華' },
        { id: 'cake', icon: '🎂', name: '蛋糕祝福' },
        { id: 'cookie', icon: '🍪', name: '餅乾能量' },
        { id: 'candy', icon: '🍬', name: '糖果甜蜜' },
        { id: 'bread', icon: '🍞', name: '麵包能量' },
        { id: 'pizza', icon: '🍕', name: '披薩因子' },
        { id: 'watermelon', icon: '🍉', name: '西瓜清涼' },
        { id: 'lemon', icon: '🍋', name: '檸檬活力' },
        { id: 'peach', icon: '🍑', name: '水蜜桃甜美' },
        { id: 'pineapple', icon: '🍍', name: '鳳梨酵素' },
        { id: 'banana', icon: '🍌', name: '香蕉能量' },
        { id: 'honey', icon: '🍯', name: '蜂蜜甘甜' },
        { id: 'milk', icon: '🥛', name: '牛奶營養' },
        { id: 'egg', icon: '🥚', name: '生命之卵' },
        { id: 'choco', icon: '🍫', name: '巧克力誘惑' },
        { id: 'icecream', icon: '🍦', name: '冰淇淋快樂' },
        { id: 'donut', icon: '🍩', name: '甜甜圈魔力' },
        
        // 天氣/自然現象類
        { id: 'rainbow', icon: '🌈', name: '彩虹之約' },
        { id: 'cloud', icon: '☁️', name: '雲朵輕盈' },
        { id: 'snow', icon: '❄️', name: '初雪純淨' },
        { id: 'rain', icon: '🌧️', name: '雨露滋潤' },
        { id: 'tornado', icon: '🌪️', name: '龍捲風暴' },
        { id: 'lightning', icon: '⚡', name: '雷鳴閃電' },
        { id: 'fog', icon: '🌫️', name: '迷霧神秘' },
        { id: 'aurora', icon: '🌌', name: '極光幻彩' },
        
        // 神秘/魔法類
        { id: 'magic', icon: '🪄', name: '魔法棒能量' },
        { id: 'potion', icon: '🧪', name: '神秘藥水' },
        { id: 'spell', icon: '📜', name: '古老咒文' },
        { id: 'rune', icon: '🔯', name: '符文之力' },
        { id: 'witch', icon: '🧙', name: '巫師智慧' },
        { id: 'fairy', icon: '🧚', name: '精靈祝福' },
        { id: 'ghost', icon: '👻', name: '幽靈能量' },
        { id: 'demon', icon: '😈', name: '惡魔之力' },
        { id: 'angel', icon: '😇', name: '天使羽翼' },
        { id: 'mermaid', icon: '🧜', name: '人魚之歌' },
        { id: 'elf', icon: '🧝', name: '精靈血統' },
        { id: 'vampire', icon: '🧛', name: '吸血鬼之牙' },
        { id: 'zombie', icon: '🧟', name: '不死能量' },
        
        // 音樂/藝術類
        { id: 'music', icon: '🎵', name: '音樂旋律' },
        { id: 'guitar', icon: '🎸', name: '搖滾靈魂' },
        { id: 'piano', icon: '🎹', name: '鋼琴優雅' },
        { id: 'drum', icon: '🥁', name: '鼓點節奏' },
        { id: 'art', icon: '🎨', name: '藝術靈感' },
        { id: 'dance', icon: '💃', name: '舞蹈韻律' },
        { id: 'theater', icon: '🎭', name: '戲劇天賦' },
        { id: 'camera', icon: '📸', name: '記憶定格' },
        
        // 節慶/特殊類
        { id: 'gift', icon: '🎁', name: '禮物驚喜' },
        { id: 'balloon', icon: '🎈', name: '氣球歡樂' },
        { id: 'firework', icon: '🎆', name: '煙火璀璨' },
        { id: 'crown', icon: '👑', name: '王者之冠' },
        { id: 'trophy', icon: '🏆', name: '勝利榮耀' },
        { id: 'key', icon: '🔑', name: '命運之鑰' },
        { id: 'coin', icon: '🪙', name: '幸運金幣' },
        { id: 'bomb', icon: '💣', name: '爆炸能量' },
        { id: 'rocket', icon: '🚀', name: '火箭推進' },
        { id: 'alien', icon: '👽', name: '外星科技' }
    ];

    let STATE = {
        currentTab: 'pets',
        generatedPets: [], // 暫存商店隨機寵物
        labSlots: [null, null], // 實驗室插槽 [Gene1, Gene2]
        tempSynthesizedPet: null, // 暫存實驗室剛合成但未確認的寵物
        isLoading: false,
        container: null,
        background: null
    };

    // =================================================================
    // 3. 核心邏輯
    // =================================================================

    function getBalance() {
        if (win.OS_ECONOMY && typeof win.OS_ECONOMY.getBalance === 'function') {
            return win.OS_ECONOMY.getBalance();
        }
        return 0;
    }

    // --- A. 商店寵物生成 (隨機) ---
    async function fetchNewPets() {
        if (STATE.isLoading) return;
        if (!win.OS_API) { alert("錯誤: API 引擎未就緒。"); return; }
        setLoading(true);

        try {
            // [TODO: Standalone API] 功能待接入直連 API
            console.warn('[PetShop] AI 功能已停用，等待 Standalone API 整合');
            return;
        } catch (e) {
            console.error('[PetShop] 進貨失敗:', e);
            if(win.toastr) win.toastr.error("進貨失敗: " + e.message);
        } finally {
            setLoading(false);
        }
    }

    // --- B. 實驗室基因培育 (合成) ---
    async function startSynthesis() {
        // 獲取自定義咒語
        const customPrompt = document.getElementById('lab-custom-input') ? document.getElementById('lab-custom-input').value.trim() : "";

        if (STATE.labSlots.some(s => s === null)) {
            alert("請先放入兩個基因素材！");
            return;
        }
        if (getBalance() < 200) {
            if(win.toastr) win.toastr.error("培育需要 $200 實驗費");
            return;
        }
        
        let confirmMsg = "確定消耗 $200 開始基因融合嗎？";
        if (customPrompt) confirmMsg += "\n(已檢測到靈魂注入，AI 將參考您的描述)";
        
        if(!confirm(confirmMsg)) return;

        // 扣款
        if (win.OS_ECONOMY) win.OS_ECONOMY.transaction(-200, "基因實驗室費用");

        setLoading(true);
        const btn = document.getElementById('lab-btn-mix');
        if (btn) btn.innerText = "🧬 SYNTHESIZING... (AI)";

        try {
            // 1. 構建 Prompt
            const gene1 = GENE_MATERIALS.find(g => g.icon === STATE.labSlots[0]);
            const gene2 = GENE_MATERIALS.find(g => g.icon === STATE.labSlots[1]);
            
            let userInstruction = `User is mixing two elements: [${gene1.name} ${gene1.icon}] + [${gene2.name} ${gene2.icon}].`;
            
            // 🔥 注入自定義咒語
            if (customPrompt) {
                userInstruction += `\n\n[SOUL INJECTION / CUSTOM CONTEXT]\nUser provided this description: "${customPrompt}"\n`;
                userInstruction += `INSTRUCTION: If the user provided a human character description, please transform them into a 'Pet/Creature' version. Retain their color scheme, personality, and key features (e.g. hair color becomes fur color, accessories remain). If it's just a spell, use it to influence the outcome.`;
            }

            userInstruction += `\n\nCreate ONE unique pet based on this combination. Strictly output a JSON Array with 1 object. The JSON must include:
- "name": pet name
- "type": species
- "personality": personality keywords (性格關鍵詞, e.g. "慵懶、貪吃、調皮")
- "behavior": behavior description (行為描述, e.g. "喜歡縮在角落、經常打瞌睡")
- "price": 0
- "desc": description
- "image_prompt": visual description for image generation (English, white background)
- "room_name": room name (Chinese, e.g. "星空小窩", "溫馨角落")
- "room_bg_prompt": room background prompt (English, e.g. "cozy pet room, soft lighting, pixel art style")

Example: [{ "name": "Name", "type": "Species", "personality": "性格關鍵詞", "behavior": "行為描述", "price": 0, "desc": "Description...", "image_prompt": "visual description...", "room_name": "房間名", "room_bg_prompt": "room background description" }]`;

            // [TODO: Standalone API] 功能待接入直連 API
            console.warn('[PetShop] AI 功能已停用，等待 Standalone API 整合');
            return;

        } catch (e) {
            console.error("Synthesis failed", e);
            if(win.toastr) win.toastr.error("實驗失敗: " + e.message);
        } finally {
            setLoading(false);
            if (btn) btn.innerText = "🔮 START SYNTHESIS / 開始融合 ($200)";
        }
    }

    async function confirmSynthesis() {
        if (!STATE.tempSynthesizedPet) return;
        await adoptPetDirectly(STATE.tempSynthesizedPet);
        closeResultModal();
        STATE.labSlots = [null, null];
        STATE.tempSynthesizedPet = null;
        // 清空輸入框
        const input = document.getElementById('lab-custom-input');
        if(input) input.value = '';
        renderLabTab();
    }

    function discardSynthesis() {
        if(!confirm("確定要放生這個實驗體嗎？\n(它將會消失，實驗費 $200 不會退還)")) return;
        closeResultModal();
        STATE.labSlots = [null, null];
        STATE.tempSynthesizedPet = null;
        renderLabTab();
        if(win.toastr) win.toastr.info("實驗體已銷毀");
    }

    // 輔助：JSON 解析
    function parseJsonLike(text) {
        let cleanText = text.replace(/```json|```/g, '').trim();
            const arrayMatch = cleanText.match(/\[[\s\S]*\]/);
            if (arrayMatch) cleanText = arrayMatch[0];
        try { return JSON.parse(cleanText); } 
        catch(e) { return [{ name: "Glitch", type: "Error", price: 0, desc: "解析錯誤", image_prompt: "glitch" }]; }
    }

    // 輔助：數據標準化
    function processPetData(data) {
        return data.map(pet => ({
                ...pet,
                id: 'pet_' + Date.now() + Math.random().toString(36).substr(2, 5),
                imageStatus: 'pending',
            imageUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${pet.name}&backgroundColor=112250`
        }));
    }

    // 輔助：批量生圖
    async function generatePetImages(petList) {
        for (let i = 0; i < petList.length; i++) {
            const pet = petList[i];
            try {
                const url = await win.OS_IMAGE_MANAGER.generate(pet.image_prompt, 'pet');
                pet.imageUrl = url;
                pet.imageStatus = 'done';
                if (STATE.currentTab === 'pets') {
                    const imgEl = document.getElementById(`pet-img-${i}`);
                    if (imgEl) { imgEl.src = url; imgEl.style.opacity = 1; }
                }
            } catch (e) { console.warn("Image gen failed", e); }
        }
    }

    // 將頭像同步至世界書共用素材庫
    async function saveAvatarToLorebook(name, url) {
        if (!win.TavernHelper || !url || url.includes('dicebear')) return;
        const charLbs = win.TavernHelper.getCharLorebooks ? win.TavernHelper.getCharLorebooks() : null;
        const lorebookName = charLbs && charLbs.primary ? charLbs.primary : null;
        if (!lorebookName) { console.warn('[PetShop] 找不到當前角色主世界書，跳過頭像同步。'); return; }
        const entryComment = '【素材-隨機頭像素材】';
        const appendText = `${name}:${url}`;
        try {
            const entries = await win.TavernHelper.getLorebookEntries(lorebookName);
            const targetEntry = entries ? entries.find(e => e.comment === entryComment) : null;
            if (targetEntry) {
                if (targetEntry.content && targetEntry.content.includes(`${name}:`)) return;
                const newContent = targetEntry.content ? (targetEntry.content + '\n' + appendText) : appendText;
                await win.TavernHelper.setLorebookEntries(lorebookName, [{ uid: targetEntry.uid, content: newContent }]);
            } else {
                await win.TavernHelper.createLorebookEntries(lorebookName, [{
                    comment: entryComment, content: appendText,
                    key: ['隨機頭像素材_KEY_DO_NOT_TRIGGER'], enabled: true
                }]);
            }
            console.log(`[PetShop] ✅ 頭像已同步至世界書：${name}`);
        } catch (e) { console.error('[PetShop] 同步頭像至世界書失敗', e); }
    }

    // 輔助：寫入資料庫
    async function adoptPetDirectly(pet) {
        if (!win.OS_DB) return;
        try {
            // 使用 AI 生成的 room_name，如果没有则使用默认值
            const roomName = pet.room_name || `${pet.name}的小窩`;
            const saveData = { 
                ...pet, 
                adoptDate: Date.now(), 
                intimacy: 0, 
                hunger: 80, 
                mood: 80, 
                cleanliness: 100, 
                roomName: roomName
            };
            delete saveData.imageStatus;
            
            // 保存宠物数据
            await win.OS_DB.savePet(saveData);
            saveAvatarToLorebook(pet.name, pet.imageUrl);

            // 🔥 如果有 room_bg_prompt，后台生成背景（不阻塞）
            if (pet.room_bg_prompt && win.OS_IMAGE_MANAGER) {
                (async () => {
                    try {
                        console.log(`[PetShop] 開始生成房間背景 (Pet ID: ${saveData.id})...`);
                        const bgUrl = await win.OS_IMAGE_MANAGER.generateBackgroundAsync(pet.room_bg_prompt);
                        
                        if (!bgUrl) {
                            console.warn('[PetShop] 房間背景URL為空，跳過保存（保留 room_bg_prompt）');
                            return;
                        }
                        
                        // 將背景URL轉換為base64（因為需要保存到數據庫）
                        const response = await fetch(bgUrl);
                        if (!response.ok) {
                            console.warn(`[PetShop] 背景圖片獲取失敗: ${response.status}，保留 room_bg_prompt`);
                            return;
                        }
                        
                        const blob = await response.blob();
                        if (!blob || blob.size === 0) {
                            console.warn('[PetShop] 背景圖片blob為空，保留 room_bg_prompt');
                            return;
                        }
                        
                        const reader = new FileReader();
                        
                        reader.onload = async function() {
                            try {
                                const base64Data = reader.result;
                                if (!base64Data || !base64Data.startsWith('data:image')) {
                                    console.warn('[PetShop] 背景base64數據無效，保留 room_bg_prompt');
                                    return;
                                }
                                
                                const petData = await win.OS_DB.getPet(saveData.id);
                                if (petData) {
                                    petData.background = base64Data;
                                    // 保留 room_bg_prompt，即使生成成功也保留，以便用户重新生成
                                    await win.OS_DB.savePet(petData);
                                    console.log(`[PetShop] ✅ 房間背景已生成並保存 (Pet: ${pet.name})`);
                                }
                            } catch (err) {
                                console.error('[PetShop] 保存背景數據失敗:', err);
                            }
                        };
                        reader.onerror = (e) => {
                            console.error('[PetShop] 背景轉換失敗:', e);
                            // 轉換失敗時，room_bg_prompt 已經保存在數據中，不需要額外處理
                        };
                        reader.readAsDataURL(blob);
            } catch (e) {
                        console.warn('[PetShop] 房間背景生成失敗:', e);
                        // 生成失敗時，room_bg_prompt 已經保存在數據中，不需要額外處理
                    }
                })();
            }
            
            if(win.toastr) win.toastr.success(`🎉 [${pet.name}] 已加入你的家庭！`, '領養成功');
        } catch(e) {
            console.error(e);
            alert("保存失敗");
        }
    }

    // --- C. 購買邏輯 ---
    async function buyPet(index) {
        const pet = STATE.generatedPets[index];
        if (!pet) return;
        if (getBalance() < pet.price) { win.toastr ? win.toastr.error('餘額不足') : alert('餘額不足！'); return; }
        if(!confirm(`確定要花費 $${pet.price} 領養 ${pet.name} 嗎？`)) return;

        if (win.OS_ECONOMY) win.OS_ECONOMY.transaction(-pet.price, `領養: ${pet.name}`);

        if (win.OS_DB) {
            // 使用 AI 生成的 room_name，如果没有则使用默认值
            const roomName = pet.room_name || `${pet.name}的小窩`;
            const saveData = { 
                ...pet, 
                adoptDate: Date.now(), 
                intimacy: 0, 
                hunger: 80, 
                mood: 80, 
                cleanliness: 100, 
                roomName: roomName
            };
            delete saveData.imageStatus;
            await win.OS_DB.savePet(saveData);
            saveAvatarToLorebook(pet.name, pet.imageUrl);

            // 🔥 如果有 room_bg_prompt，后台生成背景（不阻塞）
            if (pet.room_bg_prompt && win.OS_IMAGE_MANAGER) {
                (async () => {
                    try {
                        console.log(`[PetShop] 開始生成房間背景 (Pet ID: ${saveData.id})...`);
                        const bgUrl = await win.OS_IMAGE_MANAGER.generateBackgroundAsync(pet.room_bg_prompt);
                        
                        if (!bgUrl) {
                            console.warn('[PetShop] 房間背景URL為空，跳過保存（保留 room_bg_prompt）');
                            return;
                        }
                        
                        // 將背景URL轉換為base64（因為需要保存到數據庫）
                        const response = await fetch(bgUrl);
                        if (!response.ok) {
                            console.warn(`[PetShop] 背景圖片獲取失敗: ${response.status}，保留 room_bg_prompt`);
                            return;
                        }
                        
                        const blob = await response.blob();
                        if (!blob || blob.size === 0) {
                            console.warn('[PetShop] 背景圖片blob為空，保留 room_bg_prompt');
            return;
        }

                        const reader = new FileReader();
                        
                        reader.onload = async function() {
                            try {
                                const base64Data = reader.result;
                                if (!base64Data || !base64Data.startsWith('data:image')) {
                                    console.warn('[PetShop] 背景base64數據無效，保留 room_bg_prompt');
            return;
        }

                                const petData = await win.OS_DB.getPet(saveData.id);
                                if (petData) {
                                    petData.background = base64Data;
                                    // 保留 room_bg_prompt，即使生成成功也保留，以便用户重新生成
                                    await win.OS_DB.savePet(petData);
                                    console.log(`[PetShop] ✅ 房間背景已生成並保存 (Pet: ${pet.name})`);
                                }
                            } catch (err) {
                                console.error('[PetShop] 保存背景數據失敗:', err);
                            }
                        };
                        reader.onerror = (e) => {
                            console.error('[PetShop] 背景轉換失敗:', e);
                            // 轉換失敗時，room_bg_prompt 已經保存在數據中，不需要額外處理
                        };
                        reader.readAsDataURL(blob);
                    } catch (e) {
                        console.warn('[PetShop] 房間背景生成失敗:', e);
                        // 生成失敗時，room_bg_prompt 已經保存在數據中，不需要額外處理
                    }
                })();
            }
            
            if(win.toastr) win.toastr.success(`${pet.name} 已領養！`);
            updateHeader();
        }
    }

    function buyItem(itemId) {
        if (!win.PET_INVENTORY) { alert("無倉庫系統"); return; }
        const item = win.PET_INVENTORY.getItemDef(itemId);
        if (getBalance() < item.price) { win.toastr ? win.toastr.error('餘額不足') : alert('餘額不足'); return; }
        if (win.OS_ECONOMY) win.OS_ECONOMY.transaction(-item.price, `購買: ${item.name}`);
        win.PET_INVENTORY.addItem(itemId, 1);
        if(win.toastr) win.toastr.success(`已購買 ${item.name}`);
        updateHeader();
    }

    // =================================================================
    // 4. UI 渲染
    // =================================================================

    async function launch(container) {
        STATE.container = container;
        await loadBackground();
        renderStructure();
        updateHeader();
        switchTab('pets');
    }

    function renderStructure() {
        STATE.container.innerHTML = `
            <div class="ps-container" id="ps-container-root">
                <div class="ps-header">
                    <button class="ps-btn-icon" onclick="window.PhoneSystem.goHome()">❮</button>
                    <div class="ps-title">SAPPHIRE PETS</div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button class="ps-btn-icon ps-btn-settings" onclick="window.PET_SHOP.openSettings()">⚙</button>
                    <div class="ps-balance-box">
                        <div class="ps-balance" id="ps-bal">$---</div>
                        <div class="ps-balance-label">Credits</div>
                        </div>
                    </div>
                </div>
                
                <div class="ps-tabs">
                    <div class="ps-tab" id="tab-pets" onclick="window.PET_SHOP.switchTab('pets')">🐾 領養 (Pets)</div>
                    <div class="ps-tab" id="tab-lab" onclick="window.PET_SHOP.switchTab('lab')">🧪 培育室 (Lab)</div>
                    <div class="ps-tab" id="tab-items" onclick="window.PET_SHOP.switchTab('items')">🎒 超市 (Shop)</div>
                </div>

                <div class="ps-content" id="ps-main-area"></div>

                <div id="ps-settings-panel" class="ps-settings-panel">
                    <div class="ps-settings-close" onclick="window.PET_SHOP.closeSettings()">✕</div>
                    <div class="ps-settings-title">商店背景</div>
                    <div class="ps-bg-input-area">
                        <input type="text" id="ps-bg-input" class="ps-bg-input" placeholder="Img URL..." onchange="window.PET_SHOP.updatePreview()">
                        <div class="ps-bg-preview" id="ps-bg-preview"></div>
                        <button class="ps-bg-btn-save" onclick="window.PET_SHOP.saveBackground()">保存背景</button>
                        <button class="ps-bg-remove-btn" onclick="window.PET_SHOP.removeBackground()">移除</button>
                    </div>
                </div>

                <div id="ps-result-modal" class="ps-modal-overlay">
                    <div class="ps-result-card">
                        <div class="ps-result-title">🧬 SYNTHESIS COMPLETE</div>
                        <div class="ps-result-img-box">
                            <img id="res-img" class="ps-result-img" src="">
                        </div>
                        <div id="res-name" class="ps-result-name">???</div>
                        <div id="res-type" class="ps-result-type">UNKNOWN</div>
                        <div id="res-desc" class="ps-result-desc">...</div>
                        <div class="ps-result-actions">
                            <button class="ps-btn-discard" onclick="window.PET_SHOP.discardSynthesis()">放生 (DISCARD)</button>
                            <button class="ps-btn-confirm" onclick="window.PET_SHOP.confirmSynthesis()">帶回家 (KEEP)</button>
                        </div>
                    </div>
                    </div>
            </div>
        `;
        applyBackground();
    }

    function switchTab(tab) {
        STATE.currentTab = tab;
        document.querySelectorAll('.ps-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
        
        const area = document.getElementById('ps-main-area');
        area.innerHTML = '';
        
        if (tab === 'pets') renderPetsTab();
        else if (tab === 'lab') renderLabTab();
        else renderItemsTab();
    }

    function renderPetsTab() {
        const area = document.getElementById('ps-main-area');
        let html = `
            <div class="ps-control-area">
                <button class="ps-btn-refresh" id="ps-refresh-btn" onclick="window.PET_SHOP.fetchNewPets()">
                    <span>🧬</span> <span id="ps-btn-text">基因培育 (GENERATE)</span>
                </button>
            </div>
            <div class="ps-grid">
        `;
        if (STATE.generatedPets.length === 0) {
            html += `<div class="ps-empty-msg">展示區是空的<br>請點擊上方按鈕生成</div>`;
        } else {
            STATE.generatedPets.forEach((pet, idx) => {
                html += `
                    <div class="ps-pet-card">
                        <img id="pet-img-${idx}" src="${pet.imageUrl}" class="ps-pet-img">
                        <div class="ps-pet-info">
                            <div class="ps-pet-name">${pet.name}</div>
                            <div class="ps-pet-type">${pet.type}</div>
                            <div class="ps-pet-desc">${pet.desc}</div>
                            <div class="ps-pet-footer">
                                <div class="ps-balance">$${pet.price}</div>
                                <button class="ps-btn-buy" onclick="window.PET_SHOP.buyPet(${idx})">ADOPT</button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        html += `</div>`;
        area.innerHTML = html;
    }

    // 🔥 實驗室渲染 (V3: With Input)
    function renderLabTab() {
        const area = document.getElementById('ps-main-area');
        
        const matsHtml = GENE_MATERIALS.map(m => 
            `<div class="lab-mat-item" onclick="window.PET_SHOP.addToLab('${m.icon}')" title="${m.name}">${m.icon}</div>`
        ).join('');

        const s1 = STATE.labSlots[0] ? `<span style="font-size:30px">${STATE.labSlots[0]}</span>` : '';
        const s2 = STATE.labSlots[1] ? `<span style="font-size:30px">${STATE.labSlots[1]}</span>` : '';
        const filled1 = STATE.labSlots[0] ? 'filled' : '';
        const filled2 = STATE.labSlots[1] ? 'filled' : '';

        area.innerHTML = `
            <div class="lab-container">
                <div class="lab-visual">
                    <div class="lab-slots-overlay">
                        <div class="lab-slot ${filled1}" onclick="window.PET_SHOP.clearLab(0)">${s1}</div>
                        <div class="lab-slot ${filled2}" onclick="window.PET_SHOP.clearLab(1)">${s2}</div>
                    </div>
                </div>
                <div class="lab-controls">
                    <textarea id="lab-custom-input" class="lab-custom-input" placeholder="[靈魂注入] 在此輸入角色人設、特徵或自定義咒語..."></textarea>
                    <div class="lab-materials">${matsHtml}</div>
                    <button class="lab-btn-mix" id="lab-btn-mix" onclick="window.PET_SHOP.startSynthesis()">🔮 START SYNTHESIS / 開始融合 ($200)</button>
                </div>
            </div>
        `;
        
        // 恢復之前的輸入 (如果有的話)
        // 簡單處理：如果變量沒存就不恢復，避免複雜度
    }

    function renderItemsTab() {
        const area = document.getElementById('ps-main-area');
        if (!win.PET_INVENTORY) { area.innerHTML = "Error: Inventory module missing"; return; }
        const items = win.PET_INVENTORY.getAllItems();
        let html = '';
        const cats = { 'Food': '🍖 食品', 'Toy': '🎾 玩具', 'Clean': '🛁 清潔' };

        for (const [key, label] of Object.entries(cats)) {
            const list = items.filter(i => i.type === key);
            if (list.length > 0) {
                html += `<div class="ps-category-title">${label}</div><div class="ps-grid">`;
                list.forEach(item => {
                    html += `
                        <div class="ps-item-card">
                            <div class="ps-item-icon" style="color:${item.color}">${item.icon}</div>
                            <div class="ps-item-details">
                                <div class="ps-item-name">${item.name}</div>
                                <div class="ps-item-desc">${item.desc}</div>
                                <div class="ps-item-meta"><span class="ps-tag-price">$${item.price}</span></div>
                            </div>
                            <button class="ps-btn-buy" onclick="window.PET_SHOP.buyItem('${item.id}')">BUY</button>
                        </div>
                    `;
                });
                html += `</div>`;
            }
        }
        area.innerHTML = html;
    }

    // --- Lab Interaction ---
    function addToLab(icon) {
        if (STATE.labSlots[0] === null) STATE.labSlots[0] = icon;
        else if (STATE.labSlots[1] === null) STATE.labSlots[1] = icon;
        else { STATE.labSlots[0] = STATE.labSlots[1]; STATE.labSlots[1] = icon; } // Shift
        renderLabTab();
    }
    function clearLab(idx) {
        STATE.labSlots[idx] = null;
        renderLabTab();
    }

    // --- Modal Logic ---
    function showResultModal() {
        const modal = document.getElementById('ps-result-modal');
        const pet = STATE.tempSynthesizedPet;
        if (!modal || !pet) return;

        // 🔥 先清空图片，避免显示上一个宠物的图片
        const imgEl = document.getElementById('res-img');
        if (imgEl) imgEl.src = '';
        
        document.getElementById('res-name').innerText = pet.name || '???';
        document.getElementById('res-type').innerText = pet.type || 'UNKNOWN';
        document.getElementById('res-desc').innerText = pet.desc || '...';
        
        // 设置图片（如果有的话）
        if (imgEl && pet.imageUrl) {
            imgEl.src = pet.imageUrl;
        }
        
        modal.classList.add('active');
    }
    function closeResultModal() {
        const modal = document.getElementById('ps-result-modal');
        if (modal) modal.classList.remove('active');
        
        // 🔥 关闭时也清空图片，避免下次打开时显示旧的
        const imgEl = document.getElementById('res-img');
        if (imgEl) imgEl.src = '';
    }

    // --- Utils ---
    function updateHeader() {
        const el = document.getElementById('ps-bal');
        if (el) el.innerText = `$${getBalance().toLocaleString()}`;
    }
    function setLoading(bool) {
        STATE.isLoading = bool;
        const btn = document.getElementById('ps-refresh-btn');
        const txt = document.getElementById('ps-btn-text');
        if (btn && txt) {
            btn.disabled = bool;
            txt.innerText = bool ? "CONNECTING..." : "基因培育 (GENERATE)";
        }
    }

    // --- Background Settings ---
    function openSettings() { document.getElementById('ps-settings-panel').classList.add('active'); updatePreview(); }
    function closeSettings() { document.getElementById('ps-settings-panel').classList.remove('active'); }
    function updatePreview() {
        const val = document.getElementById('ps-bg-input').value;
        const div = document.getElementById('ps-bg-preview');
        div.innerHTML = val ? `<img src="${val}">` : `<div class="ps-bg-preview-none">預覽</div>`;
    }
    async function saveBackground() {
        STATE.background = document.getElementById('ps-bg-input').value;
        await saveToDB();
        applyBackground(); closeSettings();
    }
    async function removeBackground() {
        STATE.background = null;
        document.getElementById('ps-bg-input').value = '';
        await saveToDB();
        applyBackground(); closeSettings();
    }
    async function saveToDB() {
        if(win.OS_DB) await win.OS_DB.savePet({ id: 'pet_shop_settings', background: STATE.background });
    }
    async function loadBackground() {
        if(win.OS_DB) {
            const data = await win.OS_DB.getPet('pet_shop_settings');
            if(data) STATE.background = data.background;
        }
    }
    function applyBackground() {
        const c = document.getElementById('ps-container-root');
        if(c && STATE.background) {
            c.style.backgroundImage = `url('${STATE.background}')`;
            c.style.backgroundSize = 'cover';
        } else if(c) {
            c.style.background = 'linear-gradient(180deg, var(--ps-royal) 0%, #0a1530 100%)';
            c.style.backgroundImage = '';
        }
    }

    // 導出
    win.PET_SHOP = {
        launch, switchTab, fetchNewPets, buyPet, buyItem,
        openSettings, closeSettings, updatePreview, saveBackground, removeBackground,
        addToLab, clearLab, startSynthesis, confirmSynthesis, discardSynthesis
    };

})();