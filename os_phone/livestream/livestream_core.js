// ----------------------------------------------------------------
// [檔案] livestream_core.js (V1.5 - Mode Select & Viewer Role)
// 路徑：scripts/os_phone/livestream/livestream_core.js
// 職責：模擬直播平台，修復角色扮演邏輯 (User=觀眾)，新增模式選擇
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入 Prism Live 直播模組 (V1.5 Mode Select)...');
    const win = window.parent || window;

    // === 0. 設定與資源對映 (同 V1.4) ===
    const ASSET_PATH = 'assets/district/'; 
    const DISTRICT_CONFIG = {
        'A': { ext: 'jpg', name: 'Solarium' },
        'B': { ext: 'jpg', name: 'Nocturne' },
        'C': { ext: 'jpg', name: 'Horizon' },
        'D': { ext: 'png', name: 'Ivory' },
        'E': { ext: 'png', name: 'Spirehollow' },
        'F': { ext: 'png', name: 'Aetherdock' }
    };

    // === 1. 樣式定義 (新增 Modal 樣式) ===
    const liveStyle = `
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;700&display=swap');

        .pl-container { 
            width: 100%; height: 100%; background: #050a14; color: #e2e8f0; 
            display: flex; flex-direction: column; overflow: hidden; 
            font-family: 'Rajdhani', sans-serif; position: relative; 
        }
        
        .pl-bg {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: radial-gradient(circle at 50% 10%, #1a237e 0%, #000000 70%);
            z-index: 0; opacity: 0.8;
        }
        .pl-bg::after {
            content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background-image: linear-gradient(0deg, transparent 24%, rgba(6, 182, 212, .05) 25%, rgba(6, 182, 212, .05) 26%, transparent 27%, transparent 74%, rgba(6, 182, 212, .05) 75%, rgba(6, 182, 212, .05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(6, 182, 212, .05) 25%, rgba(6, 182, 212, .05) 26%, transparent 27%, transparent 74%, rgba(6, 182, 212, .05) 75%, rgba(6, 182, 212, .05) 76%, transparent 77%, transparent);
            background-size: 50px 50px;
        }

        .pl-header { z-index: 10; padding: 15px; background: rgba(5, 10, 20, 0.9); border-bottom: 1px solid rgba(6, 182, 212, 0.3); display: flex; align-items: center; justify-content: space-between; height: 60px; box-sizing: border-box; backdrop-filter: blur(5px); }
        .pl-logo { font-size: 20px; font-weight: 700; color: #06b6d4; text-transform: uppercase; letter-spacing: 2px; display: flex; align-items: center; gap: 8px; text-shadow: 0 0 10px rgba(6, 182, 212, 0.5); }
        .pl-btn-icon { font-size: 20px; cursor: pointer; color: #94a3b8; transition: 0.2s; }
        .pl-btn-icon:hover { color: #fff; transform: scale(1.1); }

        .pl-tabs { z-index: 10; display: flex; gap: 10px; padding: 10px 15px; overflow-x: auto; scrollbar-width: none; }
        .pl-tab { padding: 6px 16px; border-radius: 20px; font-size: 12px; cursor: pointer; background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; white-space: nowrap; transition: 0.3s; }
        .pl-tab.active { background: #06b6d4; color: #000; font-weight: bold; border-color: #06b6d4; box-shadow: 0 0 15px rgba(6, 182, 212, 0.4); }

        .pl-content { z-index: 5; flex: 1; overflow-y: auto; padding: 15px; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px; align-content: start; position: relative; }
        
        .pl-card { background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(6, 182, 212, 0.1); border-radius: 12px; overflow: hidden; cursor: pointer; transition: all 0.3s ease; position: relative; display: flex; flex-direction: column; height: 180px; }
        .pl-card:hover { transform: translateY(-5px); border-color: #06b6d4; box-shadow: 0 5px 20px rgba(6, 182, 212, 0.2); }
        .pl-card-thumb { height: 100px; background-color: #000; background-size: cover; background-position: center; position: relative; overflow: hidden; transition: background-image 0.5s ease-in-out; }
        .pl-card-thumb.loading::after { content: '📡 SIGNAL SYNC...'; position: absolute; bottom: 5px; right: 5px; background: rgba(0,0,0,0.7); color: #06b6d4; font-size: 9px; padding: 2px 6px; border-radius: 4px; animation: pl-blink 1s infinite; }
        .pl-live-badge { position: absolute; top: 8px; left: 8px; background: #ef4444; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: bold; animation: pl-pulse 1.5s infinite; z-index: 2; }
        .pl-district-badge { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); color: #e2e8f0; font-size: 9px; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); z-index: 2; text-transform: uppercase; }
        .pl-card-info { padding: 10px; flex: 1; display: flex; flex-direction: column; gap: 4px; }
        .pl-card-title { font-size: 13px; font-weight: bold; color: #f1f5f9; line-height: 1.3; margin-bottom: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .pl-card-user { font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 5px; }
        .pl-card-viewers { font-size: 11px; color: #06b6d4; margin-top: auto; display: flex; align-items: center; gap: 4px; }

        .pl-empty-state { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; width: 100%; }
        .pl-start-btn { background: transparent; border: 1px solid #06b6d4; color: #06b6d4; padding: 8px 20px; border-radius: 20px; font-size: 14px; cursor: pointer; transition: 0.3s; }
        .pl-start-btn:hover { background: #06b6d4; color: #000; box-shadow: 0 0 15px rgba(6, 182, 212, 0.5); }
        .pl-refresh-btn { position: absolute; bottom: 20px; right: 20px; width: 50px; height: 50px; border-radius: 50%; background: #06b6d4; color: #000; display: flex; align-items: center; justify-content: center; font-size: 24px; cursor: pointer; z-index: 20; box-shadow: 0 4px 15px rgba(6, 182, 212, 0.5); transition: 0.3s; }
        .pl-refresh-btn:hover { transform: rotate(180deg) scale(1.1); background: #fff; }
        .pl-refresh-btn.loading { animation: pl-spin 1s linear infinite; background: #334155; color: #64748b; pointer-events: none; }

        /* 🔥 新增：Modal 彈窗樣式 (Prism 風格) */
        .pl-modal-overlay { 
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); z-index: 100; 
            display: flex; align-items: center; justify-content: center; 
            opacity: 0; pointer-events: none; transition: opacity 0.3s; 
        }
        .pl-modal-overlay.active { opacity: 1; pointer-events: auto; }
        
        .pl-modal-card { 
            width: 85%; max-width: 320px; background: #0f172a; 
            border: 1px solid #06b6d4; border-radius: 12px; overflow: hidden; 
            transform: scale(0.95); transition: 0.3s; box-shadow: 0 0 30px rgba(6, 182, 212, 0.2);
        }
        .pl-modal-overlay.active .pl-modal-card { transform: scale(1); }
        
        .pl-modal-cover { height: 120px; background-size: cover; background-position: center; position: relative; }
        .pl-modal-content { padding: 20px; text-align: center; }
        .pl-modal-title { font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 5px; }
        .pl-modal-sub { color: #06b6d4; font-size: 13px; margin-bottom: 15px; display:flex; gap:10px; justify-content:center; }
        
        .pl-mode-selector { display: flex; gap: 10px; justify-content: center; margin: 20px 0; }
        .pl-mode-opt { 
            flex: 1; padding: 8px; border: 1px solid #334155; color: #94a3b8; 
            border-radius: 6px; font-size: 12px; cursor: pointer; transition: 0.2s; 
            background: rgba(30, 41, 59, 0.5);
        }
        .pl-mode-opt:hover { border-color: #06b6d4; color: #fff; }
        .pl-mode-opt.active { 
            border-color: #06b6d4; background: #06b6d4; color: #000; font-weight: bold; 
            box-shadow: 0 0 10px rgba(6, 182, 212, 0.4);
        }

        .pl-btn-row { display: flex; gap: 10px; margin-top: 10px; }
        .pl-btn-full { flex: 1; padding: 10px; border-radius: 20px; cursor: pointer; font-weight: bold; font-size: 13px; }
        .pl-btn-sub { background: transparent; border: 1px solid #475569; color: #94a3b8; }
        .pl-btn-sub:hover { border-color: #fff; color: #fff; }
        .pl-btn-main { background: #06b6d4; border: none; color: #000; }
        .pl-btn-main:hover { background: #fff; box-shadow: 0 0 15px rgba(6, 182, 212, 0.5); }

        @keyframes pl-pulse { 0% { opacity: 1; } 50% { opacity: 0.6; } 100% { opacity: 1; } }
        @keyframes pl-spin { to { transform: rotate(360deg); } }
        @keyframes pl-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    `;

    const doc = window.parent.document || document;
    if (!doc.getElementById('prism-live-css')) {
        const s = doc.createElement('style'); s.id = 'prism-live-css'; s.innerHTML = liveStyle; doc.head.appendChild(s);
    }

    // === 2. 狀態管理 ===
    let STATE = {
        container: null,
        streams: [],
        currentCategory: 'all',
        isGenerating: false,
        imageQueueRunning: false,
        // 🔥 新增：當前選中的直播與模式
        activeStreamId: null,
        selectedMode: 'vn' // 'vn' | 'novel'
    };

    // === 3. 輔助函數 (Fallback & Time) ===
    function getTimeContext() {
        const hour = new Date().getHours();
        return (hour >= 6 && hour < 18) ? 'DAY' : 'NIGHT';
    }

    function getDistrictImage(districtCode) {
        const code = (districtCode || 'A').toUpperCase(); 
        const config = DISTRICT_CONFIG[code] || DISTRICT_CONFIG['A'];
        const time = getTimeContext();
        return `${ASSET_PATH}${code}-district-${time}.${config.ext}`;
    }

    // === 4. 核心功能 ===

    function launch(container) {
        console.log('[PrismLive] 啟動應用');
        STATE.container = container;
        render();
    }

    async function refreshStreams() {
        if (STATE.isGenerating) return;
        
        const btn = STATE.container.querySelector('.pl-refresh-btn');
        const startBtn = STATE.container.querySelector('.pl-start-btn');
        
        if(btn) btn.classList.add('loading');
        if(startBtn) { startBtn.innerText = '搜尋訊號中...'; startBtn.style.opacity = '0.7'; }
        
        STATE.isGenerating = true;

        const prompt = `
            請生成一個 JSON 格式的直播列表，背景是「賽博龐克風格的奧瑞亞城市(Aurealis)」。
            包含 4 到 5 個直播間。
            請確保 JSON 格式正確。
            格式要求：
            [
              { 
                "title": "直播標題", 
                "streamer": "主播名字", 
                "viewers": 人數(數字), 
                "category": "類別(game/tech/life/music)", 
                "district": "區域代碼(A/B/C/D/E/F)",
                "desc": "簡短描述" 
              }
            ]
            A區=權力中心, B區=娛樂, C區=政府, D區=富人, E區=貧民窟/黑市, F區=工業。
            內容請多樣化。
        `;

        try {
            if (win.OS_API) {
                const messages = await win.OS_API.buildContext(prompt, 'livestream_gen');
                const config = win.OS_SETTINGS ? win.OS_SETTINGS.getConfig() : null;
                
                await win.OS_API.chat(messages, config, null, async (response) => {
                    try {
                        let cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
                        const jsonMatch = cleanJson.match(/\[\s*\{.*\}\s*\]/s);
                        
                        if (jsonMatch) {
                            const newStreams = JSON.parse(jsonMatch[0]);
                            
                            STATE.streams = newStreams.map((s, i) => ({
                                ...s,
                                id: 'gen_' + Date.now() + '_' + i,
                                cover: getDistrictImage(s.district), // 初始 Fallback
                                isAiGenerated: false
                            }));
                            
                            render(); 
                            processImageQueue(); 
                        } else {
                            throw new Error("JSON 解析失敗");
                        }
                    } catch (e) {
                        console.error('JSON 解析失敗', e);
                        alert('訊號干擾：數據解析異常');
                    }
                    STATE.isGenerating = false;
                    if(btn) btn.classList.remove('loading');
                });
            } else {
                // Mock for testing
                setTimeout(() => {
                    alert('未連接 API，使用測試訊號');
                     STATE.streams = [
                        { title: "E區黑市開箱", streamer: "Ghost", viewers: 1200, category: "life", district: "E", cover: getDistrictImage('E'), isAiGenerated: false, id: "demo1", desc: "撿垃圾也是有學問的" },
                        { title: "D區晚宴直擊", streamer: "Vogue", viewers: 5000, category: "life", district: "D", cover: getDistrictImage('D'), isAiGenerated: false, id: "demo2", desc: "帶你看上層人的生活" }
                     ];
                    render();
                    STATE.isGenerating = false;
                    if(btn) btn.classList.remove('loading');
                }, 1000);
            }
        } catch (e) {
            console.error(e);
            STATE.isGenerating = false;
            if(btn) btn.classList.remove('loading');
        }
    }

    async function processImageQueue() {
        if (STATE.imageQueueRunning) return;
        STATE.imageQueueRunning = true;

        const cardsToLoad = STATE.streams.filter(s => !s.isAiGenerated);
        
        for (const stream of cardsToLoad) {
            const currentStream = STATE.streams.find(s => s.id === stream.id);
            if (!currentStream) continue;

            const seed = Math.floor(Math.random() * 10000);
            const districtName = DISTRICT_CONFIG[stream.district?.toUpperCase()]?.name || 'Cyberpunk City';
            const promptEncoded = encodeURIComponent(`cyberpunk style, ${stream.title}, ${districtName} background, neon lights, detailed`);
            const aiUrl = `https://image.pollinations.ai/prompt/${promptEncoded}?width=300&height=200&nologo=true&seed=${seed}`;

            try {
                await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.src = aiUrl;
                    img.onload = () => resolve(aiUrl);
                    img.onerror = () => reject('Load failed');
                    setTimeout(() => reject('Timeout'), 8000);
                });

                currentStream.cover = aiUrl;
                currentStream.isAiGenerated = true;

                const cardThumb = doc.getElementById(`thumb_${stream.id}`);
                if (cardThumb) {
                    cardThumb.style.backgroundImage = `url('${aiUrl}')`;
                    cardThumb.classList.remove('loading'); 
                }

            } catch (err) {
                const cardThumb = doc.getElementById(`thumb_${stream.id}`);
                if (cardThumb) cardThumb.classList.remove('loading');
            }
            await new Promise(r => setTimeout(r, 4500));
        }
        STATE.imageQueueRunning = false;
    }

    // 🔥 修正：點擊直播間，先打開 Modal，不是直接進入
    function openStreamModal(streamId) {
        const stream = STATE.streams.find(s => s.id === streamId);
        if (!stream) return;

        STATE.activeStreamId = streamId;
        STATE.selectedMode = 'vn'; // Reset to default

        const modal = doc.getElementById('pl-stream-modal');
        if (modal) {
            // 更新 Modal 內容
            const coverHtml = stream.cover 
                ? `style="background-image: url('${stream.cover}')"` 
                : 'style="background-color: #000"';
            
            modal.innerHTML = `
                <div class="pl-modal-card">
                    <div class="pl-modal-cover" ${coverHtml}>
                        <div class="pl-live-badge">LIVE</div>
                    </div>
                    <div class="pl-modal-content">
                        <div class="pl-modal-title">${stream.title}</div>
                        <div class="pl-modal-sub">
                            <span>👨‍💻 ${stream.streamer}</span>
                            <span>📍 ${stream.district}區</span>
                        </div>
                        
                        <div style="font-size:12px; color:#94a3b8; margin-bottom:15px; min-height:3em;">
                            ${stream.desc || stream.title}
                        </div>

                        <div class="pl-mode-selector">
                            <div class="pl-mode-opt active" id="pl-mode-vn" onclick="window.PRISM_LIVE.selectMode('vn')">
                                💬 VN 模式<br><span style="font-size:10px; opacity:0.7">對話框風格</span>
                            </div>
                            <div class="pl-mode-opt" id="pl-mode-novel" onclick="window.PRISM_LIVE.selectMode('novel')">
                                📖 小說模式<br><span style="font-size:10px; opacity:0.7">沉浸式描寫</span>
                            </div>
                        </div>

                        <div class="pl-btn-row">
                            <button class="pl-btn-full pl-btn-sub" onclick="window.PRISM_LIVE.closeModal()">取消</button>
                            <button class="pl-btn-full pl-btn-main" onclick="window.PRISM_LIVE.confirmEnterStream()">📺 開始觀看</button>
                        </div>
                    </div>
                </div>
            `;
            modal.classList.add('active');
        }
    }

    // 切換模式樣式
    function selectMode(mode) {
        STATE.selectedMode = mode;
        const btnVn = doc.getElementById('pl-mode-vn');
        const btnNovel = doc.getElementById('pl-mode-novel');
        if(btnVn && btnNovel) {
            btnVn.classList.toggle('active', mode === 'vn');
            btnNovel.classList.toggle('active', mode === 'novel');
        }
    }

    function closeModal() {
        const modal = doc.getElementById('pl-stream-modal');
        if (modal) modal.classList.remove('active');
    }

    // 🔥 修正：確認進入，發送正確的「觀眾視角」Prompt
    async function confirmEnterStream() {
        const stream = STATE.streams.find(s => s.id === STATE.activeStreamId);
        if (!stream) return;

        closeModal();

        // 1. 關閉手機
        if (win.PhoneSystem && win.PhoneSystem.goHome) {
            win.PhoneSystem.goHome();
            const panel = doc.querySelector('#aurelia-panel-container');
            if (panel) panel.style.transform = 'translateX(100%)';
        }

        // 2. 構建 Prompt (觀眾視角)
        const systemPrompt = `
            [System Event: User starts watching a livestream]
            平台：Prism Live
            頻道：${stream.title}
            主播：${stream.streamer} (所在區域: ${stream.district}區)
            當前熱度：${stream.viewers}
            
            [Roleplay Instructions]
            你負責扮演 **直播間的整體環境** 與 **主播 ${stream.streamer}**。
            {{user}} 是這場直播的一名 **觀眾 (Viewer)**。
            
            請描述主播正在做什麼、說什麼，以及直播間的畫面。
            同時請模擬「彈幕 (Danmaku)」的反應，顯示其他觀眾的留言。
            
            當前輸出模式：${STATE.selectedMode === 'vn' ? 'Visual Novel (VN直播格式) - 請多用對話框和角色動作' : 'Novel (小說) - 請注重場景氛圍和細節描寫'}。
        `;

        // 3. 發送給酒館
        if (win.TavernHelper) {
            await win.TavernHelper.createChatMessages([{ 
                role: 'user', 
                name: 'System', 
                message: systemPrompt 
            }], { refresh: 'affected' });
        }
    }

    // === 5. 渲染邏輯 ===
    function render() {
        if (!STATE.container) return;

        let contentHtml = '';

        if (STATE.streams.length === 0) {
            contentHtml = `
                <div class="pl-empty-state">
                    <div class="pl-empty-icon">📡</div>
                    <div class="pl-empty-text">未連接到直播訊號</div>
                    <button class="pl-start-btn" onclick="window.PRISM_LIVE.refreshStreams()">
                        搜尋直播訊號
                    </button>
                </div>
            `;
        } else {
            const filtered = STATE.currentCategory === 'all' 
                ? STATE.streams 
                : STATE.streams.filter(s => s.category === STATE.currentCategory);
            
            if (filtered.length === 0) {
                contentHtml = `<div class="pl-empty-state"><div class="pl-empty-text">無此類別訊號</div></div>`;
            } else {
                contentHtml = filtered.map(s => {
                    const loadingClass = s.isAiGenerated ? '' : 'loading';
                    const districtLabel = s.district ? `${s.district}區` : '';
                    
                    // 注意：這裡改為呼叫 openStreamModal
                    return `
                        <div class="pl-card" onclick="window.PRISM_LIVE.openStreamModal('${s.id}')">
                            <div id="thumb_${s.id}" class="pl-card-thumb ${loadingClass}" style="background-image: url('${s.cover}')">
                                <div class="pl-live-badge">LIVE</div>
                                ${districtLabel ? `<div class="pl-district-badge">${districtLabel}</div>` : ''}
                            </div>
                            <div class="pl-card-info">
                                <div class="pl-card-title">${s.title}</div>
                                <div class="pl-card-user">
                                    <span style="width:6px; height:6px; background:#06b6d4; border-radius:50%; display:inline-block;"></span>
                                    ${s.streamer}
                                </div>
                                <div class="pl-card-viewers">
                                    👁 ${s.viewers.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        STATE.container.innerHTML = `
            <div class="pl-container">
                <div class="pl-bg"></div>
                
                <div class="pl-header">
                    <div class="pl-btn-icon" onclick="window.PhoneSystem.goHome()">‹</div>
                    <div class="pl-logo">
                        <span>▶</span> PRISM LIVE
                    </div>
                    <div class="pl-btn-icon" style="opacity:0;"></div>
                </div>

                <div class="pl-tabs">
                    <div class="pl-tab ${STATE.currentCategory==='all'?'active':''}" onclick="window.PRISM_LIVE.setCategory('all')">全部</div>
                    <div class="pl-tab ${STATE.currentCategory==='game'?'active':''}" onclick="window.PRISM_LIVE.setCategory('game')">遊戲</div>
                    <div class="pl-tab ${STATE.currentCategory==='tech'?'active':''}" onclick="window.PRISM_LIVE.setCategory('tech')">科技</div>
                    <div class="pl-tab ${STATE.currentCategory==='life'?'active':''}" onclick="window.PRISM_LIVE.setCategory('life')">生活</div>
                    <div class="pl-tab ${STATE.currentCategory==='music'?'active':''}" onclick="window.PRISM_LIVE.setCategory('music')">娛樂</div>
                </div>

                <div class="pl-content">
                    ${contentHtml}
                </div>

                <div class="pl-refresh-btn" onclick="window.PRISM_LIVE.refreshStreams()" title="重整訊號">
                    ↻
                </div>

                <div id="pl-stream-modal" class="pl-modal-overlay"></div>
            </div>
        `;
    }

    function setCategory(cat) {
        STATE.currentCategory = cat;
        render();
    }

    window.PRISM_LIVE = {
        launch, refreshStreams, setCategory,
        // 新增/修改的公開方法
        openStreamModal, selectMode, closeModal, confirmEnterStream
    };

    win.OS_LIVESTREAM = {
        launchApp: launch
    };

})();