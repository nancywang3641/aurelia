// ----------------------------------------------------------------
// [檔案] map_core.js (V4.1 - Event Horizon & Hybrid Tag Update)
// 路徑：scripts/os_phone/map/map_core.js
// 職責：地圖導覽 + 隨機事件系統 + 酒館跑團接口
// 更新：全面廢棄 JSON，升級為 V4.0 混合標籤協議 (Hybrid Tag Protocol)
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入奧瑞亞地圖系統 (V4.1 Event & Tag Protocol)...');
    const win = window.parent || window;

    // === 0. 任務模板庫 (AI 演出的劇本種子) ===
    const MISSION_TEMPLATES = [
        { type: 'delivery', title: '危險快遞', difficulty: 'D', baseReward: 1000, desc: '幫忙運送一個不該被看見的手提箱。', objective: '將物品安全送達指定地點，中途可能遭遇攔截。' },
        { type: 'combat', title: '街頭清理', difficulty: 'C', baseReward: 2500, desc: '一群賽博瘋子正在騷擾商鋪，需要有人去「講道理」。', objective: '擊退或威嚇敵對目標，確保區域安全。' },
        { type: 'investigate', title: '失蹤數據', difficulty: 'B', baseReward: 4000, desc: '某公司的硬碟在轉運站遺失了，裡面有重要情報。', objective: '蒐集線索，找出小偷並奪回數據。' },
        { type: 'negotiate', title: '債務糾紛', difficulty: 'C', baseReward: 1500, desc: '有人欠了黑幫一筆錢，需要中間人去協調（或討債）。', objective: '說服目標還錢，或達成雙方都能接受的協議。' },
        { type: 'escort', title: 'VIP護送', difficulty: 'A', baseReward: 8000, desc: '一位重要人物需要通過危險區域，不能受傷。', objective: '保護目標直到抵達安全屋。' },
        { type: 'hack', title: '節點入侵', difficulty: 'B', baseReward: 5000, desc: '需要駭入區域伺服器刪除一條紀錄。', objective: '潛入或遠端駭入，並在反制系統啟動前撤離。' }
    ];

    // === 1. 樣式定義 (新增紅點與任務卡) ===
    const mapStyle = `
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap');

        .am-container { width: 100%; height: 100%; background: #050505; color: #D4AF37; display: flex; flex-direction: column; overflow: hidden; font-family: 'Playfair Display', serif; position: relative; }
        .am-backdrop { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-size: cover; background-position: center; transition: background-image 0.8s ease-in-out, filter 0.5s; z-index: 0; }
        .am-backdrop.blur { filter: blur(5px) brightness(0.5); }
        
        .am-header { z-index: 20; padding: 15px; background: linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.6)); border-bottom: 1px solid rgba(212, 175, 55, 0.1); display: flex; align-items: center; justify-content: space-between; height: 60px; box-sizing: border-box; }
        .am-title { font-family: 'Cinzel', serif; font-size: 18px; font-weight: 700; color: #D4AF37; letter-spacing: 3px; text-shadow: 0 0 10px rgba(212, 175, 55, 0.5); }
        .am-btn-icon { font-size: 24px; cursor: pointer; color: #D4AF37; transition: 0.2s; width: 30px; text-align: center; }
        .am-btn-icon:hover { text-shadow: 0 0 8px #fff; transform: scale(1.1); }
        
        /* 區域選擇層 */
        .am-home-layer { z-index: 5; position: absolute; top: 60px; left: 0; width: 100%; height: calc(100% - 60px); display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.5s; }
        .am-home-layer.active { opacity: 1; pointer-events: auto; }
        .am-zone-selector { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; width: 100%; max-width: 800px; padding: 20px; animation: floatUp 0.8s ease-out; }
        .am-zone-entrance { width: 100px; height: 120px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: 0.3s; backdrop-filter: blur(5px); position: relative; overflow: visible; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
        .am-zone-entrance:hover { transform: translateY(-10px) scale(1.05); background: rgba(20,20,20,0.8); border-color: #D4AF37; box-shadow: 0 0 25px rgba(212, 175, 55, 0.4); }
        .am-zone-letter { font-family: 'Cinzel'; font-size: 42px; font-weight: bold; margin-bottom: 5px; background: linear-gradient(45deg, #D4AF37, #FFF); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .am-zone-label { font-size: 9px; color: #bbb; text-transform: uppercase; letter-spacing: 2px; text-align: center; font-weight: bold; }
        
        /* 設施網格層 */
        .am-inner-layer { z-index: 5; position: absolute; top: 60px; left: 0; width: 100%; height: calc(100% - 60px); display: flex; flex-direction: column; opacity: 0; pointer-events: none; transition: opacity 0.3s; padding: 20px; box-sizing: border-box; }
        .am-inner-layer.active { opacity: 1; pointer-events: auto; }
        .am-grid-view { width: 100%; height: 100%; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 15px; align-content: start; padding-bottom: 20px; scrollbar-width: none; }
        
        /* 設施卡片 */
        .am-fac-card { background: rgba(10, 10, 10, 0.6); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; cursor: pointer; transition: 0.2s; backdrop-filter: blur(10px); height: 110px; text-align: center; position: relative; }
        .am-fac-card:hover { border-color: #D4AF37; background: rgba(20, 20, 20, 0.9); transform: translateY(-3px); box-shadow: 0 5px 20px rgba(0,0,0,0.6); }
        .am-fac-icon { font-size: 36px; filter: drop-shadow(0 0 5px rgba(255,255,255,0.2)); }
        .am-fac-name { font-family: 'Cinzel'; font-size: 13px; color: #eee; font-weight: bold; letter-spacing: 0.5px; }

        /* 🔥 紅點系統 */
        .am-red-dot { position: absolute; top: 8px; right: 8px; width: 10px; height: 10px; background: #ff453a; border-radius: 50%; box-shadow: 0 0 8px #ff453a; animation: pulse 2s infinite; pointer-events: none; }
        .am-zone-dot { position: absolute; top: -5px; right: -5px; width: 14px; height: 14px; background: #ff453a; border-radius: 50%; border: 2px solid #000; z-index: 10; animation: pulse 2s infinite; }

        /* 詳情頁覆蓋層 */
        .am-detail-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #000; z-index: 100; display: flex; flex-direction: column; opacity: 0; pointer-events: none; transition: opacity 0.4s; background-size: cover; background-position: center; }
        .am-detail-overlay.active { opacity: 1; pointer-events: auto; }
        .am-detail-header { padding: 15px; display: flex; justify-content: space-between; background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent); }

        .am-center-stage { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 20px; overflow-y: auto; gap: 15px; }

        /* 🔥 任務卡片樣式 */
        .am-mission-card { width: 90%; max-width: 400px; background: rgba(20, 0, 0, 0.85); border: 1px solid #ff453a; border-radius: 8px; padding: 15px; margin-bottom: 20px; box-shadow: 0 5px 20px rgba(255, 69, 58, 0.3); animation: slideDown 0.5s; display: none; }
        .am-mission-card.active { display: block; }
        .am-mission-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 69, 58, 0.3); padding-bottom: 8px; margin-bottom: 8px; }
        .am-mission-tag { background: #ff453a; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
        .am-mission-title { font-size: 16px; font-weight: bold; color: #fff; font-family: 'Cinzel', serif; }
        .am-mission-body { font-size: 13px; color: #ddd; line-height: 1.4; margin-bottom: 12px; }
        .am-mission-reward { font-size: 14px; color: #ffd700; font-weight: bold; text-align: right; }
        .am-accept-btn { width: 100%; background: linear-gradient(90deg, #8B0000, #ff453a); border: none; padding: 10px; color: white; font-weight: bold; cursor: pointer; margin-top: 10px; border-radius: 4px; transition: 0.3s; }
        .am-accept-btn:hover { filter: brightness(1.2); }

        /* 掃描結果區 */
        .am-scan-results { width: 100%; display: none; flex-direction: column; gap: 20px; }
        .am-scan-results.active { display: flex; }
        
        .am-detail-footer { padding: 20px; display: flex; justify-content: center; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent); }
        .am-scan-btn { background: #D4AF37; color: #000; border: none; padding: 12px 30px; border-radius: 30px; font-weight: bold; cursor: pointer; box-shadow: 0 0 15px rgba(212, 175, 55, 0.3); font-family: 'Cinzel'; display: flex; align-items: center; gap: 8px; }

        /* 角色與模態窗 */
        .am-char-grid-display { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px; width: 100%; }
        .am-char-card { background: rgba(10, 10, 10, 0.9); border: 1px solid #555; border-radius: 8px; overflow: hidden; cursor: pointer; }
        .am-char-card:hover { border-color: #D4AF37; transform: translateY(-3px); }
        .am-char-img-area { height: 100px; background-size: cover; background-position: center; }
        .am-char-info { padding: 10px; }
        .am-char-name { color: #D4AF37; font-weight: bold; font-size: 14px; }
        .am-char-role { color: #888; font-size: 11px; }

        .am-modal-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); backdrop-filter: blur(5px); z-index: 200; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
        .am-modal-overlay.active { opacity: 1; pointer-events: auto; }
        .am-modal-card { width: 85%; max-width: 320px; background: #050505; border: 1px solid #D4AF37; border-radius: 12px; overflow: hidden; }
        .am-modal-content { padding: 20px; text-align: center; }
        .am-btn-row { display: flex; gap: 10px; margin-top: 15px; }
        .am-btn-full { flex: 1; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold; }
        .am-btn-main { background: #D4AF37; border: none; color: #000; }
        
        /* 🔥 模式選擇器 */
        .am-mode-selector { display: flex; gap: 8px; justify-content: center; margin: 15px 0; }
        .am-mode-opt { padding: 8px 16px; border: 1px solid #333; color: #666; border-radius: 6px; font-size: 12px; cursor: pointer; transition: 0.2s; font-family: 'Cinzel', serif; letter-spacing: 1px; background: transparent; }
        .am-mode-opt:hover { border-color: #888; color: #aaa; }
        .am-mode-opt.active { border-color: #D4AF37; background: #D4AF37; color: #000; font-weight: bold; }

        /* 刷新按鈕 */
        .am-refresh-btn { font-size: 12px; border: 1px solid #333; padding: 5px 10px; border-radius: 15px; background: rgba(0,0,0,0.5); cursor: pointer; color: #888; margin-right: 10px; }
        .am-refresh-btn:hover { color: #fff; border-color: #fff; }

        @keyframes floatUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); opacity: 0.8; } }
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    `;

    const doc = window.parent.document || document;
    if (!doc.getElementById('aurealis-map-css')) {
        const s = doc.createElement('style'); s.id = 'aurealis-map-css'; s.innerHTML = mapStyle; doc.head.appendChild(s);
    }

    // === 2. 狀態管理 ===
    let STATE = {
        container: null,
        view: 'home',
        currentZoneId: null,
        activeFacility: null,
        generatedChars: [],
        introSegments: [],
        discoveries: [],
        activeCharIndex: -1,
        // 🔥 事件系統狀態
        activeEvents: {}, // { "zoneId_facilityKey": EventObject }
        lastRefreshTime: 0,
        isGeneratingEvents: false, // 防止重複生成
        eventResponseProcessed: false, // 標記響應是否已處理（防止流式響應重複處理）
        selectedMode: 'vn', // 🔥 'vn' | 'novel' - 發送給酒館的故事模式
        pendingEventKey: null // 待確認的事件 key
    };

    // === 3. 核心邏輯 ===

    // 🔥 生成全地圖隨機事件 - 使用 AI 生成
    async function generateWorldEvents(force = false) {
        // 🔒 防止重複執行
        if (STATE.isGeneratingEvents) {
            console.log('[Map] ⚠️ 事件生成已在進行中，跳過');
            return;
        }
        
        const now = Date.now();
        // 如果距離上次刷新不到 10 分鐘，且非強制，則不刷新
        if (!force && (now - STATE.lastRefreshTime < 600000) && Object.keys(STATE.activeEvents).length > 0) {
            return; 
        }

        console.log('[Map] 🔍 正在聯繫情報網絡，生成隨機事件...');
        
        if (force && win.toastr) win.toastr.info('正在聯繫情報網絡...', 'System');

        STATE.isGeneratingEvents = true; // 設置標誌
        STATE.eventResponseProcessed = false; // 重置響應處理標誌
        STATE.activeEvents = {}; // 清空舊事件
        STATE.lastRefreshTime = now;

        const zoneIds = win.AUREALIS_DATA ? win.AUREALIS_DATA.getZoneIds() : [];
        
        // 🔥 構建設施列表給 AI 選擇
        let facilityList = [];
        zoneIds.forEach(zId => {
            const zone = win.AUREALIS_DATA.getZone(zId);
            Object.keys(zone.facilities).forEach(facKey => {
                const fac = zone.facilities[facKey];
                const sceneId = fac.sceneId || `${zId}_${facKey}`;
                facilityList.push({
                    sceneId: sceneId,
                    zone: `${zId}區`,
                    name: fac.name
                });
            });
        });
        
        // 將設施列表格式化為文字
        const facilityText = facilityList.map(f => `- ${f.sceneId} (${f.zone} ${f.name})`).join('\n');

        // 🔥 構建 AI 提示詞 (Hybrid Tag Protocol)
        const prompt = `[系統指令：情報網路掃描協議]
你是奧瑞亞城市的情報經紀人（或者是系統導覽員）。請為以下設施生成 3-5 個隨機事件/委託。

**可用設施列表：**
${facilityText}

事件類型可以是：delivery, combat, investigate, negotiate, escort, hack, rescue, theft, sabotage, surveillance 等。請根據設施的性質選擇合理的事件類型。

【輸出規則：絕對禁止使用 JSON】
1. 導覽員對話：請使用標準對話標籤開場。
   格式：[Char|情報員|表情|「對話內容，為用戶介紹這些情報」]
2. 數據標籤：嚴格使用以下單行標籤格式輸出事件，每個事件一行。
   格式：[Event|sceneId|type|title|difficulty(D/C/B/A/S)|desc|objective|baseReward(整數)]

【標籤範例】
[Char|情報經紀人|smirk|「看來今天街頭有點熱鬧，我幫你過濾了幾個值得跑一趟的委託。」]
[Event|B_Night_Market|combat|夜市騷亂平息|C|夜市核心區出現了一群醉酒鬧事者，商販需要協助。|驅散暴徒|2500]`;

        try {
            // 🔥 使用 OS_API 調用 AI
            const messages = await win.OS_API.buildContext(prompt, 'map_event_gen');
            
            win.OS_API.chat(messages, win.OS_SETTINGS.getConfig(), null, (responseText) => {
                // 🔒 防止重複處理（流式響應會多次調用回調）
                if (STATE.eventResponseProcessed) {
                    return;
                }
                
                console.log('[Map] 📡 收到 AI 響應:', responseText.substring(0, 100) + '...');
                
                let events = [];
                let cleanText = responseText;

                try {
                    // 解析 [Event] 標籤
                    const regex = /\[Event\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]/g;
                    let match;
                    while ((match = regex.exec(responseText)) !== null) {
                        events.push({
                            sceneId: match[1].trim(),
                            type: match[2].trim(),
                            title: match[3].trim(),
                            difficulty: match[4].trim(),
                            desc: match[5].trim(),
                            objective: match[6].trim(),
                            baseReward: parseInt(match[7].trim()) || 1000
                        });
                        cleanText = cleanText.replace(match[0], '');
                    }
                } catch (e) {
                    console.log('[Map] ⏳ 等待完整響應或解析失敗...', e.message);
                    return;
                }

                // 🔒 標記為已處理（防止重複）
                STATE.eventResponseProcessed = true;

                cleanText = cleanText.trim();
                // 🔥 調用大廳介面播放敘事
                if (cleanText && win.AureliaControlCenter && win.AureliaControlCenter.playIrisSequence) {
                    win.AureliaControlCenter.playIrisSequence(cleanText);
                }

                // 🔥 如果 AI 生成失敗，使用後備模板
                if (events.length === 0) {
                    console.warn('[Map] ⚠️ AI 生成事件失敗，使用後備模板');
                    events = generateFallbackEvents(zoneIds);
                }

                // 🔥 將事件根據 sceneId 精確分配到設施
                events.forEach((event, i) => {
                    const sceneId = event.sceneId;
                    if (!sceneId) return;
                    
                    let foundZone = null;
                    let foundFacKey = null;
                    let foundFac = null;
                    
                    for (const zId of zoneIds) {
                        const zone = win.AUREALIS_DATA.getZone(zId);
                        for (const facKey of Object.keys(zone.facilities)) {
                            const fac = zone.facilities[facKey];
                            if (fac.sceneId === sceneId || `${zId}_${facKey}` === sceneId) {
                                foundZone = zId;
                                foundFacKey = facKey;
                                foundFac = fac;
                                break;
                            }
                        }
                        if (foundFac) break;
                    }
                    
                    if (!foundFac) return;
                    
                    const eventId = `${foundZone}_${foundFacKey}`;
                    STATE.activeEvents[eventId] = {
                        id: `evt_${Date.now()}_${i}`,
                        zoneId: foundZone,
                        facKey: foundFacKey,
                        facName: foundFac.name,
                        sceneId: sceneId,
                        type: event.type || 'delivery',
                        title: event.title || '未命名任務',
                        difficulty: event.difficulty || 'C',
                        desc: event.desc || '任務描述缺失',
                        objective: event.objective || '達成目標',
                        money: event.baseReward || 1000
                    };
                });

                // 重新渲染介面
                if (STATE.container) {
                    if (STATE.view === 'home') renderHome();
                    else if (STATE.view === 'zone') enterZone(STATE.currentZoneId);
                }

                if (force && win.toastr) {
                    win.toastr.success(`已生成 ${events.length} 個新事件`, 'System');
                }
                
                console.log('[Map] ✅ 事件生成完成:', Object.keys(STATE.activeEvents).length, '個');
                STATE.isGeneratingEvents = false; // 重置標誌
            }, (error) => {
                console.error('[Map] ❌ API 調用失敗:', error);
                if (force && win.toastr) win.toastr.error('情報網絡連接失敗', 'System');
                STATE.isGeneratingEvents = false; // 重置標誌
                STATE.eventResponseProcessed = false; // 重置響應處理標誌
                
                // 失敗時使用後備模板
                const events = generateFallbackEvents(zoneIds);
                events.forEach((event, i) => {
                    const sceneId = event.sceneId;
                    if (!sceneId) return;
                    
                    let foundZone = null;
                    let foundFacKey = null;
                    let foundFac = null;
                    
                    for (const zId of zoneIds) {
                        const zone = win.AUREALIS_DATA.getZone(zId);
                        for (const facKey of Object.keys(zone.facilities)) {
                            const fac = zone.facilities[facKey];
                            if (fac.sceneId === sceneId || `${zId}_${facKey}` === sceneId) {
                                foundZone = zId;
                                foundFacKey = facKey;
                                foundFac = fac;
                                break;
                            }
                        }
                        if (foundFac) break;
                    }
                    
                    if (!foundFac) return;
                    
                    const eventId = `${foundZone}_${foundFacKey}`;
                    STATE.activeEvents[eventId] = {
                        id: `evt_${Date.now()}_${i}`,
                        zoneId: foundZone,
                        facKey: foundFacKey,
                        facName: foundFac.name,
                        sceneId: sceneId,
                        type: event.type,
                        title: event.title,
                        difficulty: event.difficulty,
                        desc: event.desc,
                        objective: event.objective,
                        money: event.baseReward
                    };
                });
                
                if (STATE.container) {
                    if (STATE.view === 'home') renderHome();
                    else if (STATE.view === 'zone') enterZone(STATE.currentZoneId);
                }
            });
        } catch (e) {
            console.error('[Map] ❌ 事件生成錯誤:', e);
            if (force && win.toastr) win.toastr.error('事件生成失敗', 'System');
            STATE.isGeneratingEvents = false;
            STATE.eventResponseProcessed = false;
        }
    }

    // 🔥 後備事件生成（當 AI 失敗時使用）
    function generateFallbackEvents(zoneIds) {
        const events = [];
        zoneIds.forEach(zId => {
            const zone = win.AUREALIS_DATA.getZone(zId);
            const facilities = Object.keys(zone.facilities);
            
            // 每個區域 30% 機率生成 1-2 個事件
            if (Math.random() > 0.3) {
                const eventCount = Math.floor(Math.random() * 2) + 1;
                for (let i = 0; i < eventCount; i++) {
                    const template = MISSION_TEMPLATES[Math.floor(Math.random() * MISSION_TEMPLATES.length)];
                    const reward = Math.floor(template.baseReward * (0.8 + Math.random() * 0.4));
                    const facKey = facilities[Math.floor(Math.random() * facilities.length)];
                    const fac = zone.facilities[facKey];
                    
                    events.push({
                        sceneId: fac.sceneId || `${zId}_${facKey}`,
                        type: template.type,
                        title: template.title,
                        difficulty: template.difficulty,
                        desc: template.desc,
                        objective: template.objective,
                        baseReward: reward
                    });
                }
            }
        });
        return events;
    }

    function getHomeBackground() {
        const hour = new Date().getHours();
        const isNight = hour >= 18 || hour < 6;
        return isNight 
            ? 'https://nancywang3641.github.io/aurelia/district/AURELIA-NIGHT.jpg' 
            : 'https://nancywang3641.github.io/aurelia/district/AURELIA-DAY.jpg';
    }

    function exitMap() {
        if (window.PhoneSystem && typeof window.PhoneSystem.goHome === 'function') {
            window.PhoneSystem.goHome();
        } else if (STATE.container) {
            STATE.container.innerHTML = '';
            STATE.container.style.display = 'none';
        }
    }

    // === 4. UI 渲染 ===

    function launchMap(container) {
        STATE.container = container;
        STATE.view = 'home';
        STATE.currentZoneId = null;

        renderStructure();
        renderHome();
    }

    function renderStructure() {
        if (!STATE.container) return;
        
        STATE.container.innerHTML = `
            <div class="am-container">
                <div class="am-backdrop" id="am-bg"></div>
                
                <div class="am-header">
                    <div class="am-btn-icon" onclick="window.AUREALIS_MAP.handleBack()">‹</div>
                    <div style="display:flex; align-items:center;">
                        <div class="am-title" id="am-main-title">AUREALIS</div>
                    </div>
                    <div style="display:flex; align-items:center;">
                        <div class="am-refresh-btn" onclick="window.AUREALIS_MAP.refreshEvents()">⟳ 情報</div>
                        <div class="am-btn-icon" onclick="window.AUREALIS_MAP.clearAllData()" style="font-size:16px;">🗑️</div>
                    </div>
                </div>

                <div id="am-home-layer" class="am-home-layer active">
                    <div class="am-zone-selector" id="am-zone-selector"></div>
                </div>

                <div id="am-inner-layer" class="am-inner-layer">
                    <div class="am-grid-view" id="am-grid"></div>
                </div>

                <div id="am-detail-view" class="am-detail-overlay">
                    <div class="am-detail-header">
                        <div class="am-btn-icon" onclick="window.AUREALIS_MAP.closeDetail()">‹</div>
                    </div>
                    <div class="am-center-stage">
                        <div id="am-mission-area" class="am-mission-card"></div>
                        
                        <div id="am-scan-results" class="am-scan-results">
                            <div id="am-intro-container" class="am-intro-box"></div>
                            <div id="am-char-grid" class="am-char-grid-display"></div>
                        </div>
                    </div>
                    <div class="am-detail-footer">
                        <button id="am-scan-btn" class="am-scan-btn" onclick="window.AUREALIS_MAP.scanForCharacters()"><span>🔍</span> 探索此地</button>
                    </div>
                </div>

                <div id="am-char-modal" class="am-modal-overlay"></div>
                <div id="am-mission-confirm-modal" class="am-modal-overlay"></div>
            </div>
        `;
    }

    function renderHome() {
        const bg = document.getElementById('am-bg');
        const homeLayer = document.getElementById('am-home-layer');
        const innerLayer = document.getElementById('am-inner-layer');
        const title = document.getElementById('am-main-title');
        
        bg.style.backgroundImage = `url('${getHomeBackground()}')`;
        bg.classList.remove('blur');

        title.innerText = "AUREALIS";
        homeLayer.classList.add('active');
        innerLayer.classList.remove('active');

        const zoneIds = win.AUREALIS_DATA ? win.AUREALIS_DATA.getZoneIds() : ['A'];
        const selector = document.getElementById('am-zone-selector');
        const labels = { 'A': 'Central', 'B': 'Nocturne', 'C': 'Horizon', 'D': 'Ivory', 'E': 'Spire' };

        // 檢查區域是否有紅點
        selector.innerHTML = zoneIds.map(id => {
            // 檢查該區是否有任何事件
            const hasEvent = Object.values(STATE.activeEvents).some(ev => ev.zoneId === id);
            const dotHtml = hasEvent ? `<div class="am-zone-dot"></div>` : '';

            return `
            <div class="am-zone-entrance" onclick="window.AUREALIS_MAP.enterZone('${id}')">
                ${dotHtml}
                <div class="am-zone-letter">${id}</div>
                <div class="am-zone-label">${labels[id] || 'ZONE'}</div>
            </div>
        `}).join('');
    }

    function enterZone(zoneId) {
        STATE.currentZoneId = zoneId;
        STATE.view = 'zone';

        const bg = document.getElementById('am-bg');
        const homeLayer = document.getElementById('am-home-layer');
        const innerLayer = document.getElementById('am-inner-layer');
        const title = document.getElementById('am-main-title');

        const zoneData = win.AUREALIS_DATA.getZone(zoneId);
        
        homeLayer.classList.remove('active');
        innerLayer.classList.add('active');

        if (zoneData) {
            bg.style.backgroundImage = `url('${zoneData.background}')`;
            bg.classList.add('blur');
            title.innerText = zoneData.name.toUpperCase();
        }

        const gridEl = document.getElementById('am-grid');
        if (gridEl && zoneData) {
            const facs = zoneData.facilities || {};
            gridEl.innerHTML = Object.keys(facs).map(key => {
                const f = facs[key];
                // 🔥 檢查該設施是否有事件
                const eventKey = `${zoneId}_${key}`;
                const hasEvent = STATE.activeEvents[eventKey];
                const dotHtml = hasEvent ? `<div class="am-red-dot"></div>` : '';

                return `
                    <div class="am-fac-card" onclick="window.AUREALIS_MAP.openFacilityDetail('${key}')">
                        ${dotHtml}
                        <div class="am-fac-icon">${f.icon}</div>
                        <div class="am-fac-name">${f.shortName || f.name}</div>
                    </div>
                `;
            }).join('');
        }
    }

    function handleBack() {
        if (STATE.view === 'zone') {
            STATE.view = 'home';
            STATE.currentZoneId = null;
            renderHome();
        } else {
            exitMap();
        }
    }

    // === 5. 詳情與互動 ===

    async function openFacilityDetail(facKey) {
        const zoneData = win.AUREALIS_DATA.getZone(STATE.currentZoneId);
        const facility = zoneData.facilities[facKey];
        if (!facility) return;

        STATE.activeFacility = facility;
        STATE.activeFacilityKey = facKey; // 保存 Key 以便查詢事件

        // 讀取舊有數據
        STATE.generatedChars = [];
        STATE.introSegments = [];
        STATE.discoveries = [];
        if (win.OS_DB) {
            try {
                const saved = await win.OS_DB.getMapFacilityData(STATE.currentZoneId, facKey);
                if (saved && saved.characters) {
                    STATE.generatedChars = saved.characters;
                    STATE.introSegments = saved.intro || [];
                    STATE.discoveries = saved.discoveries || [];
                }
            } catch (e) {}
        }

        const detailView = document.getElementById('am-detail-view');
        detailView.style.backgroundImage = `url('${facility.imageUrl || zoneData.background}')`;

        // 🔥 檢查是否有事件
        const eventKey = `${STATE.currentZoneId}_${facKey}`;
        const event = STATE.activeEvents[eventKey];
        const missionCard = document.getElementById('am-mission-area');

        if (event) {
            missionCard.classList.add('active');
            missionCard.innerHTML = `
                <div class="am-mission-header">
                    <div class="am-mission-tag">MISSION / ${event.type.toUpperCase()}</div>
                    <div style="font-size:12px; color:#aaa;">難度: ${event.difficulty}</div>
                </div>
                <div class="am-mission-title">${event.title}</div>
                <div class="am-mission-body">${event.desc}<br><br><b>目標：</b>${event.objective}</div>
                <div class="am-mission-reward">報酬: $${event.money}</div>
                <button class="am-accept-btn" onclick="window.AUREALIS_MAP.acceptMission('${eventKey}')">⚡ 接取委託</button>
            `;
        } else {
            missionCard.classList.remove('active');
        }

        renderScanResults();
        detailView.classList.add('active');
    }

    function renderScanResults() {
        const resultsDiv = document.getElementById('am-scan-results');
        const charGrid = document.getElementById('am-char-grid');
        const introBox = document.getElementById('am-intro-container');

        if (STATE.generatedChars.length > 0 || STATE.introSegments.length > 0 || (STATE.discoveries && STATE.discoveries.length > 0)) {
            resultsDiv.classList.add('active');
            
            let introHtml = STATE.introSegments.map(text => `<div style="background:rgba(0,0,0,0.5); padding:10px; margin-bottom:10px; border-radius:4px;">${text}</div>`).join('');
            
            // 加入 Discoveries UI
            if (STATE.discoveries && STATE.discoveries.length > 0) {
                introHtml += `<div style="margin-top: 15px; border-top: 1px solid #333; padding-top: 10px;">
                    <h4 style="color:#D4AF37; margin:0 0 10px 0;">🔍 發現物件</h4>
                    ${STATE.discoveries.map(d => `
                        <div style="display:flex; align-items:center; background:rgba(20,20,20,0.8); padding:8px; border-radius:6px; margin-bottom:8px; border:1px solid #444;">
                            <div style="font-size:24px; margin-right:10px;">${d.icon}</div>
                            <div>
                                <div style="color:#fff; font-weight:bold; font-size:13px;">${d.title}</div>
                                <div style="color:#aaa; font-size:11px;">${d.desc}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>`;
            }
            introBox.innerHTML = introHtml;

            charGrid.innerHTML = STATE.generatedChars.map((char, idx) => `
                <div class="am-char-card" onclick="window.AUREALIS_MAP.openCharacterDetail(${idx})">
                    <div class="am-char-img-area" style="background-image:url('https://api.dicebear.com/7.x/notionists/svg?seed=${char.name}&backgroundColor=000000')"></div>
                    <div class="am-char-info">
                        <div class="am-char-name">${char.name}</div>
                        <div class="am-char-role">${char.role}</div>
                    </div>
                </div>
            `).join('');
            document.getElementById('am-scan-btn').innerHTML = '<span>↻</span> 重新掃描';
        } else {
            resultsDiv.classList.remove('active');
            document.getElementById('am-scan-btn').innerHTML = '<span>🔍</span> 探索此地';
        }
    }

    // 🔥 接取任務：顯示確認對話框
    function acceptMission(eventKey) {
        console.log('[Map] 🔍 acceptMission 被調用, eventKey =', eventKey);
        const event = STATE.activeEvents[eventKey];
        
        if (!event) {
            console.error('[Map] ❌ 找不到事件！eventKey =', eventKey);
            return;
        }

        STATE.pendingEventKey = eventKey;
        showMissionConfirmDialog(event);
    }

    // 🔥 顯示任務確認對話框
    function showMissionConfirmDialog(event) {
        const modal = document.getElementById('am-mission-confirm-modal');
        const currentMode = STATE.selectedMode || 'vn';
        
        // 點擊外部關閉
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeMissionConfirm();
            }
        };
        
        modal.innerHTML = `
            <div class="am-modal-card" onclick="event.stopPropagation()">
                <div class="am-modal-content">
                    <h3 style="margin: 0 0 10px 0; color: #D4AF37;">接取委託</h3>
                    <div style="margin-bottom: 15px;">
                        <div style="font-size: 14px; color: #aaa; margin-bottom: 5px;">${event.type.toUpperCase()} / 難度: ${event.difficulty}</div>
                        <div style="font-size: 18px; font-weight: bold; margin-bottom: 8px;">${event.title}</div>
                        <div style="font-size: 12px; color: #888; line-height: 1.5;">${event.desc}</div>
                        <div style="font-size: 12px; color: #D4AF37; margin-top: 10px;"><b>目標：</b>${event.objective}</div>
                        <div style="font-size: 12px; color: #D4AF37; margin-top: 5px;"><b>報酬：</b>$${event.money}</div>
                    </div>
                    
                    <div class="am-mode-selector">
                        <button class="am-mode-opt ${currentMode === 'vn' ? 'active' : ''}" 
                                onclick="window.AUREALIS_MAP.selectMissionMode('vn')">VN 模式</button>
                        <button class="am-mode-opt ${currentMode === 'novel' ? 'active' : ''}" 
                                onclick="window.AUREALIS_MAP.selectMissionMode('novel')">小說模式</button>
                    </div>
                    
                    <div class="am-btn-row">
                        <button class="am-btn-full" style="background:#333; border:none; color:#aaa;" 
                                onclick="window.AUREALIS_MAP.closeMissionConfirm()">取消</button>
                        <button class="am-btn-full am-btn-main" 
                                onclick="window.AUREALIS_MAP.confirmAcceptMission()">確認接取</button>
                    </div>
                </div>
            </div>
        `;
        modal.classList.add('active');
    }

    // 🔥 選擇任務模式
    function selectMissionMode(mode) {
        STATE.selectedMode = mode;
        const event = STATE.pendingEventKey ? STATE.activeEvents[STATE.pendingEventKey] : null;
        if (event) {
            showMissionConfirmDialog(event); // 重新渲染對話框以更新按鈕狀態
        }
    }

    // 🔥 關閉任務確認對話框
    function closeMissionConfirm() {
        document.getElementById('am-mission-confirm-modal').classList.remove('active');
        STATE.pendingEventKey = null;
    }

    // 🔥 確認接取任務並發送給酒館
    async function confirmAcceptMission() {
        const eventKey = STATE.pendingEventKey;
        if (!eventKey) {
            console.error('[Map] ❌ 沒有待確認的事件');
            return;
        }

        const event = STATE.activeEvents[eventKey];
        if (!event) {
            console.error('[Map] ❌ 找不到事件！eventKey =', eventKey);
            closeMissionConfirm();
            return;
        }

        // 📋 複製事件數據（避免刪除後丟失引用）
        const eventData = {
            type: event.type,
            title: event.title,
            zoneId: event.zoneId,
            facName: event.facName,
            desc: event.desc,
            objective: event.objective,
            difficulty: event.difficulty,
            money: event.money
        };

        // 關閉確認對話框
        closeMissionConfirm();

        // 1. 移除該事件（避免重複接取）
        delete STATE.activeEvents[eventKey];

        // 2. 構建酒館跑團指令
        const modeText = STATE.selectedMode === 'vn' ? 'VN格式' : '小說模式';
        const systemPrompt = `[System Command: Start RPG Mission]
**任務類型**: ${eventData.type}
**任務名稱**: ${eventData.title}
**地點**: ${eventData.zoneId}區 - ${eventData.facName}
**委託描述**: ${eventData.desc}
**主要目標**: ${eventData.objective}
**難度等級**: ${eventData.difficulty}
**預期報酬**: $${eventData.money}
**模式**: ${modeText}

**指令**: 
1. 先執行開場白，並慢慢展開，最多十章內收尾(短篇)。
2. 根據難度設置障礙或敵人。
3. 當任務完成或失敗時，請務必輸出 JSON 格式的「任務結算小票」以觸發銀行轉帳。

(現在，請開始演出任務開頭...)`;

        // 3. 發送給酒館
        if (win.TavernHelper) {
            await win.TavernHelper.createChatMessages([
                { 
                    role: 'user',
                    name: 'System',
                    message: systemPrompt
                }
            ], { refresh: 'affected' });
            console.log('[Map] ✅ 已發送給酒館');
        } else {
            console.error('[Map] ❌ TavernHelper 不存在');
        }

        // 4. 關閉手機
        exitMap();
    }

    // 🔥 掃描角色 (Hybrid Tag 解析版)
    async function scanForCharacters() {
        const btn = document.getElementById('am-scan-btn');
        btn.innerHTML = '<span>📡</span> 掃描中...';
        btn.disabled = true;

        const fac = STATE.activeFacility;
        
        // 使用 OS_API
        try {
            const prompt = `請為地點「${fac.name}」生成 2-3 位路人角色與一段環境描寫。`;
            const messages = await win.OS_API.buildContext(prompt, 'map_scan');
            win.OS_API.chat(messages, win.OS_SETTINGS.getConfig(), null, (txt) => {
                let chars = [];
                let intro = [];
                let discoveries = [];
                
                let cleanText = txt;

                // 1. 解析 NPC
                const npcRegex = /\[NPC\|([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]/g;
                let match;
                while ((match = npcRegex.exec(txt)) !== null) {
                    chars.push({
                        name: match[1].trim(),
                        role: match[2].trim(),
                        action: match[3].trim(),
                        dialogue: match[4].trim()
                    });
                    cleanText = cleanText.replace(match[0], '');
                }

                // 2. 解析 Intro [📖|#1|描述]
                const introRegex = /\[📖\|[^|]+\|([^\]]+)\]/g;
                while ((match = introRegex.exec(txt)) !== null) {
                    intro.push(match[1].trim());
                    cleanText = cleanText.replace(match[0], '');
                }

                // 3. 解析 Discoveries [🔍|#1|💊|標題|描述]
                const discRegex = /\[🔍\|[^|]+\|([^|]+)\|([^|]+)\|([^\]]+)\]/g;
                while ((match = discRegex.exec(txt)) !== null) {
                    discoveries.push({
                        icon: match[1].trim(),
                        title: match[2].trim(),
                        desc: match[3].trim()
                    });
                    cleanText = cleanText.replace(match[0], '');
                }

                cleanText = cleanText.trim();
                
                // 🔥 將剩下純對話交給大廳播放
                if (cleanText && win.AureliaControlCenter && win.AureliaControlCenter.playIrisSequence) {
                    win.AureliaControlCenter.playIrisSequence(cleanText);
                }
                
                STATE.generatedChars = chars.length > 0 ? chars : [{name:'路人A', role:'居民', dialogue:'...'}];
                STATE.introSegments = intro.length > 0 ? intro : ["環境嘈雜，人來人往..."];
                STATE.discoveries = discoveries;
                
                renderScanResults();
                btn.disabled = false;
            });
        } catch (e) {
            btn.innerHTML = '失敗';
            btn.disabled = false;
        }
    }

    function openCharacterDetail(idx) {
        // 簡單的角色互動彈窗
        const char = STATE.generatedChars[idx];
        const modal = document.getElementById('am-char-modal');
        modal.innerHTML = `
            <div class="am-modal-card" onclick="event.stopPropagation()">
                <div style="padding:20px; text-align:center;">
                    <h3>${char.name}</h3>
                    <p style="color:#888">${char.role}</p>
                    <p>"${char.dialogue || '...'}"</p>
                    <div class="am-btn-row">
                        <button class="am-btn-full am-btn-main" onclick="window.AUREALIS_MAP.interactChar(${idx})">搭話</button>
                        <button class="am-btn-full" style="background:#333;" onclick="window.AUREALIS_MAP.closeModal()">關閉</button>
                    </div>
                </div>
            </div>
        `;
        modal.classList.add('active');
    }

    function interactChar(idx) {
        const char = STATE.generatedChars[idx];
        const prompt = `[System: Interaction]\n{{user}} 正在與 ${char.name} (${char.role}) 搭話。\n地點: ${STATE.activeFacility.name}`;
        if (win.TavernHelper) win.TavernHelper.createChatMessages([{ role: 'system', content: prompt }]);
        exitMap();
    }

    function closeModal() {
        document.getElementById('am-char-modal').classList.remove('active');
    }

    function closeDetail() {
        document.getElementById('am-detail-view').classList.remove('active');
    }
    
    async function refreshEvents() {
        await generateWorldEvents(true);
    }

    async function clearAllData() {
        STATE.activeEvents = {};
        STATE.generatedChars = [];
        STATE.introSegments = [];
        STATE.discoveries = [];
        STATE.lastRefreshTime = 0;
        STATE.pendingEventKey = null;
        STATE.activeCharIndex = -1;
        if (win.OS_DB) {
            try { await win.OS_DB.clearAllMapData(); } catch (e) {}
        }
        alert('已清空地圖數據');
        renderHome();
    }

    // 掛載全域
    window.AUREALIS_MAP = {
        launch: launchMap,
        enterZone,
        handleBack,
        refreshEvents,
        openFacilityDetail,
        closeDetail,
        scanForCharacters,
        openCharacterDetail,
        interactChar,
        acceptMission,
        selectMissionMode,
        closeMissionConfirm,
        confirmAcceptMission,
        closeModal,
        clearAllData
    };

    // 🔥 註冊到 OS 系統
    win.OS_MAP = { launchApp: launchMap };
})();