// ----------------------------------------------------------------
// [檔案] map_core.js (V4.2 - World Runtime Container)
// 路徑：scripts/os_phone/map/map_core.js
// 職責：地圖導覽 + 隨機事件系統 + 酒館跑團接口
// 更新：地圖資料來源改走 WORLD_RUNTIME 容器（為動態世界鋪路）
//        AUREALIS_DATA 仍在背景作為「預設世界」，不破壞原行為
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入奧瑞亞地圖系統 (V4.2 World Runtime)...');
    const win = window.parent || window;

    // 統一從 WORLD_RUNTIME 取資料（容器內已包奧瑞亞當預設世界）
    const WORLD = () => win.WORLD_RUNTIME;

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


    // === 2. 狀態管理 ===
    let STATE = {
        container: null,
        view: 'home',
        currentZoneId: null,
        activeFacility: null,
        generatedChars: [],
        introSegments: [],
        activeCharIndex: -1,
        // 🔥 事件系統狀態
        activeEvents: {}, // { "zoneId_facilityKey": EventObject }
        lastRefreshTime: 0,
        isGeneratingEvents: false, // 防止重複生成
        eventResponseProcessed: false, // 標記響應是否已處理（防止流式響應重複處理）
        selectedMode: 'vn', // 🔥 'vn' | 'novel' - 發送給酒館的故事模式
        pendingEventKey: null, // 待確認的事件 key
        animationTimers: [], // 冒泡 setTimeout 集中管理
        rafId: null // 走路逐幀動畫的 requestAnimationFrame id
    };

    // === 走路 + 冒泡動畫：清理 ===
    function _clearAnimationTimers() {
        if (STATE.rafId) {
            cancelAnimationFrame(STATE.rafId);
            STATE.rafId = null;
        }
        if (STATE.animationTimers && STATE.animationTimers.length) {
            STATE.animationTimers.forEach(id => clearTimeout(id));
            STATE.animationTimers = [];
        }
    }

    // 🗺️ 底板可站遮罩（Rae 的「黑白遮罩批量工具」同款演算法搬進瀏覽器：亮度閾值 128→白=可站）：
    //    生成/載入底板圖後當場在 canvas 算，零安裝、手機同跑。白覆蓋 <30% 自動反轉（深色地板圖）；
    //    全白/全黑=退化遮罩→當沒有，小人回原本的走道帶隨機刷位，絕不變更糟。
    const _BDMASK_W = 192, _BDMASK_H = 108;   // 解析度夠細，630px 面積語意才對得上她工具的刻度
    async function _buildBackdropMask(url) {
        try {
            const img = await new Promise((res, rej) => {
                const i = new Image();
                if (!/^data:/.test(String(url))) i.crossOrigin = 'anonymous';
                i.onload = () => res(i); i.onerror = rej; i.src = url;
            });
            const cv = document.createElement('canvas'); cv.width = _BDMASK_W; cv.height = _BDMASK_H;
            const cx = cv.getContext('2d', { willReadFrequently: true });
            cx.imageSmoothingEnabled = false;   // nearest 取樣：黑塊邊緣不暈灰，「刪小黑塊」面積判定才準
            cx.drawImage(img, 0, 0, _BDMASK_W, _BDMASK_H);
            const d = cx.getImageData(0, 0, _BDMASK_W, _BDMASK_H).data;
            const white = new Uint8Array(_BDMASK_W * _BDMASK_H);
            // 參數對齊 Rae 在「黑白遮罩批量工具」實測調好的那組：閾值 70、刪小黑塊 630px。
            // localStorage 可微調（console 改口味用，不進 UI）：aurelia_bdmask_threshold / aurelia_bdmask_minblack
            let TH = 70, MINBLACK = 630;
            try { const t = parseInt(localStorage.getItem('aurelia_bdmask_threshold'), 10); if (t >= 0 && t <= 255) TH = t; } catch (e) {}
            try { const m = parseInt(localStorage.getItem('aurelia_bdmask_minblack'), 10); if (m >= 0) MINBLACK = m; } catch (e) {}
            let n = 0;
            for (let i = 0; i < white.length; i++) {
                const lum = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
                if (lum >= TH) { white[i] = 1; n++; }
            }
            let ratio = n / white.length;
            if (ratio < 0.3) { for (let i = 0; i < white.length; i++) white[i] ^= 1; ratio = 1 - ratio; }   // 深色地板自動反轉
            // 刪小黑塊（同她工具的 cleanup）：面積換算到縮小後格數（630px @ 原圖 → 等比格）
            const natPx = (img.naturalWidth || 1024) * (img.naturalHeight || 512);
            const minCells = Math.max(2, Math.round(MINBLACK * (white.length / natPx)));
            const seen = new Int32Array(white.length).fill(0);
            const q = [];
            for (let p0 = 0; p0 < white.length; p0++) {
                if (white[p0] || seen[p0]) continue;
                const comp = []; seen[p0] = 1; q.length = 0; q.push(p0);
                while (q.length) {
                    const p = q.pop(); comp.push(p);
                    const x = p % _BDMASK_W, y = (p / _BDMASK_W) | 0;
                    if (x > 0 && !seen[p - 1] && !white[p - 1]) { seen[p - 1] = 1; q.push(p - 1); }
                    if (x < _BDMASK_W - 1 && !seen[p + 1] && !white[p + 1]) { seen[p + 1] = 1; q.push(p + 1); }
                    if (y > 0 && !seen[p - _BDMASK_W] && !white[p - _BDMASK_W]) { seen[p - _BDMASK_W] = 1; q.push(p - _BDMASK_W); }
                    if (y < _BDMASK_H - 1 && !seen[p + _BDMASK_W] && !white[p + _BDMASK_W]) { seen[p + _BDMASK_W] = 1; q.push(p + _BDMASK_W); }
                }
                if (comp.length < minCells) { comp.forEach(p => { white[p] = 1; n++; }); }
            }
            ratio = white.reduce((a, b) => a + b, 0) / white.length;
            if (ratio > 0.02 && ratio < 0.98) return { w: _BDMASK_W, h: _BDMASK_H, white };
        } catch (e) { /* 跨域/壞圖 → 無遮罩，走原行為 */ }
        return null;
    }
    async function _getBackdropMask() {
        const fac = STATE.activeFacility;
        const url = fac && fac.sceneMap && fac.sceneMap.backdropUrl;
        if (!url) return null;
        if (STATE._bdMask && STATE._bdMask.url === url) return STATE._bdMask.mask;
        const mask = await _buildBackdropMask(url);
        STATE._bdMask = { url, mask };
        return mask;
    }
    // 以 (x%,y%) 為中心、半徑 r% 的採樣圈白率（同書咖舞台 _whiteRatio 的打分思路）
    function _bdWhiteRatio(mask, xPct, yPct, rPct) {
        const cx = xPct / 100 * mask.w, cy = yPct / 100 * mask.h, r = Math.max(1, rPct / 100 * mask.w);
        let ok = 0, n = 0;
        for (let gy = Math.floor(cy - r); gy <= Math.ceil(cy + r); gy++) {
            for (let gx = Math.floor(cx - r); gx <= Math.ceil(cx + r); gx++) {
                const dx = gx - cx, dy = gy - cy;
                if (dx * dx + dy * dy > r * r) continue;
                n++;
                if (gx < 0 || gy < 0 || gx >= mask.w || gy >= mask.h) continue;
                if (mask.white[gy * mask.w + gx]) ok++;
            }
        }
        return n ? ok / n : 0;
    }

    function _startCharacterAnimations(charGrid) {
        if (!charGrid) return;
        const characters = charGrid.querySelectorAll('.walking-character');
        if (!characters.length) return;

        // 拿當前 facility 的 landmarks 做避撞（同 0-100 % 座標系）
        const landmarks = (STATE.activeFacility
            && STATE.activeFacility.sceneMap
            && Array.isArray(STATE.activeFacility.sceneMap.landmarks))
            ? STATE.activeFacility.sceneMap.landmarks : [];
        const COLLISION_R = 8; // 半徑 8% 視為擋路

        function isBlocked(x, y) {
            for (let i = 0; i < landmarks.length; i++) {
                const lm = landmarks[i];
                const dx = x - lm.x;
                const dy = y - lm.y;
                if (dx * dx + dy * dy < COLLISION_R * COLLISION_R) return true;
            }
            return false;
        }
        // 小人活動範圍：x 14-86 / y 62-85（下半部走道；考慮元素本身寬高，避免中心錨點貼邊時元素超出容器）
        function pickValidTarget() {
            for (let i = 0; i < 6; i++) {
                const x = 14 + Math.random() * 72;
                const y = 62 + Math.random() * 23;
                if (!isBlocked(x, y)) return { x, y };
            }
            // 6 次都撞 → 認了，至少有個目標
            return { x: 14 + Math.random() * 72, y: 62 + Math.random() * 23 };
        }

        // 🧍 小人站定不走動（Rae 定案，同書咖舞台客人）：進場擺一次位（撞到地標就重擲），
        //    之後不再逐幀移動——省掉 rAF 迴圈，小地圖只留冒泡是活的。
        characters.forEach((charEl) => {
            const startX = parseFloat(charEl.style.left) || 50;
            const startY = parseFloat(charEl.style.top) || 75;
            if (isBlocked(startX, startY)) {
                const p = pickValidTarget();
                charEl.style.left = p.x + '%';
                charEl.style.top = p.y + '%';
            }
        });
        // 🗺️ 底板遮罩站位（Rae 點子）：亮度遮罩算好後，把小人重擺到「最多%白」的開闊地板；
        //    有可信遮罩就不再侷限走道帶（全圖找地板站）；遮罩退化/分數太低=不動、維持上面的擺位。
        _getBackdropMask().then((mask) => {
            if (!mask) return;
            const taken = [];
            characters.forEach((charEl) => {
                if (!charEl.isConnected) return;
                let best = null, bestScore = -1;
                for (let t = 0; t < 40; t++) {
                    const x = 8 + Math.random() * 84, y = 22 + Math.random() * 68;   // 全圖留邊；頂部留給名牌/冒泡
                    if (isBlocked(x, y)) continue;
                    let s = _bdWhiteRatio(mask, x, y, 6);
                    if (taken.some(p => Math.hypot(p.x - x, p.y - y) < 14)) s -= 0.5;   // 別擠成一坨
                    if (s > bestScore) { bestScore = s; best = { x, y }; }
                }
                if (best && bestScore >= 0.55) {   // 分太低=遮罩對這張圖不可信 → 不動
                    taken.push(best);
                    charEl.style.left = best.x + '%';
                    charEl.style.top = best.y + '%';
                }
            });
        }).catch(() => {});

        // 冒泡：每 4-8 秒冒一次，停 2-3 秒 fade out
        characters.forEach((charEl) => {
            const bubble = charEl.querySelector('.character-dialogue-bubble');
            if (!bubble || bubble.textContent.trim() === '...') return;

            const scheduleBubble = () => {
                const delay = 4000 + Math.random() * 4000;
                const id = setTimeout(() => {
                    if (!bubble.isConnected) return;
                    bubble.classList.add('show');
                    const stayMs = 2000 + Math.random() * 1000;
                    const hideId = setTimeout(() => {
                        if (!bubble.isConnected) return;
                        bubble.classList.remove('show');
                        scheduleBubble();
                    }, stayMs);
                    STATE.animationTimers.push(hideId);
                }, delay);
                STATE.animationTimers.push(id);
            };
            scheduleBubble();
        });
    }

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

        const zoneIds = WORLD() ? WORLD().getZoneIds() : [];

        // 🔥 構建設施列表給 AI 選擇
        let facilityList = [];
        zoneIds.forEach(zId => {
            const zone = WORLD().getZone(zId);
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
你是本世界的情報仲介（身分名稱依世界觀自定：現代=線人／武俠=茶館說書人／奇幻=公會職員…）。請為以下設施生成 3-5 個隨機事件/委託。
🌏 事件內容與用詞一律貼合上文 [World Info] 的世界觀時代與文化，禁止預設賽博/科幻用語。

**可用設施列表：**
${facilityText}

事件類型可以是：delivery, combat, investigate, negotiate, escort, hack, rescue, theft, sabotage, surveillance 等。請根據設施的性質與世界觀選擇合理的事件類型（hack 之類只給科技世界用）。

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
                        const zone = WORLD().getZone(zId);
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
                        const zone = WORLD().getZone(zId);
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
            const zone = WORLD().getZone(zId);
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
        _clearAnimationTimers(); // 關面板前先把走路 / 冒泡定時器清掉，避免洩漏
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
        updatePreviewBanner();
        renderHome();
    }

    function renderStructure() {
        if (!STATE.container) return;
        
        STATE.container.innerHTML = `
            <div class="am-container">
                <div class="am-backdrop" id="am-bg"></div>

                <div id="am-preview-banner" style="display:none; position:absolute; top:0; left:0; right:0; z-index:30; background:linear-gradient(90deg, rgba(255,140,0,0.85), rgba(220,80,0,0.85)); color:#fff; padding:6px 12px; font-size:11px; font-family:'Cinzel'; letter-spacing:2px; text-align:center; cursor:pointer;"
                     onclick="window.AUREALIS_MAP.exitPreview()">
                    👁️ PREVIEW MODE — <span id="am-preview-name"></span> · 點此返回當前世界
                </div>

                <div class="am-header">
                    <div class="am-btn-icon" onclick="window.AUREALIS_MAP.handleBack()">‹</div>
                    <div style="display:flex; align-items:center;">
                        <div class="am-title" id="am-main-title">AUREALIS</div>
                    </div>
                    <div style="display:flex; align-items:center;">
                        <div class="am-refresh-btn" onclick="window.AUREALIS_MAP.showMapSettings()" title="地圖設置">⚙️</div>
                        <div class="am-refresh-btn" onclick="window.AUREALIS_MAP.showWorldManager()" title="多世界管理">🌐</div>
                        <div class="am-refresh-btn" onclick="window.AUREALIS_MAP.generateSchedules()" title="生成/重生角色排程">📋 排程</div>
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
                        <div class="am-detail-title-wrap">
                            <div class="am-detail-zone" id="am-detail-zone-text"></div>
                            <div class="am-detail-facility" id="am-detail-facility-text"></div>
                        </div>
                    </div>
                    <div class="am-center-stage">
                        <div id="am-mission-area" class="am-mission-card"></div>
                        
                        <div id="am-scan-results" class="am-scan-results">
                            <div id="am-intro-container" class="am-intro-box"></div>
                            <div id="am-char-grid" class="am-scene-stage"></div>
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

        // 全頁底色維持奧瑞亞固定圖（就算 marker 模式也保留作氛圍底色）
        bg.style.backgroundImage = `url('${getHomeBackground()}')`;
        bg.classList.remove('blur');

        // 預先準備 worldMap URL（marker 模式時貼到 selector 上，跟 marker 座標 100% 對齊）
        const _world = WORLD() ? WORLD().getCurrentWorld() : null;
        const worldMapUrl = (_world && _world.worldMap && _world.worldMap.backdropUrl) ? _world.worldMap.backdropUrl : null;

        homeLayer.classList.add('active');
        innerLayer.classList.remove('active');

        const selector = document.getElementById('am-zone-selector');

        // 🔥 V2.0：判斷是否需要初始化此世界
        if (win.WORLD_RUNTIME && win.WORLD_RUNTIME.needsInit && win.WORLD_RUNTIME.needsInit()) {
            title.innerText = "";
            selector.innerHTML = `
                <div class="am-navi-entry">
                    <div class="am-navi-left">
                        <div class="am-navi-block">
                            <div class="am-navi-section-label">▶ NAVIGATION TERMINAL</div>
                            <h2 class="am-navi-cn-title">出門導航終端</h2>
                            <div class="am-navi-en-sub">AUREALIS NAVI SYS_01</div>
                            <p class="am-navi-desc">尚未建立當前世界地圖資料。<br>LUNA-VII 將根據當前角色卡、世界書與劇情上下文，生成可探索的區域、設施與角色排程。</p>
                        </div>
                        <div class="am-navi-letter">
                            <div class="am-navi-letter-head">
                                <span class="am-navi-letter-title">瀅瀅的話</span>
                                <span class="am-navi-letter-clip">📎</span>
                            </div>
                            <p class="am-navi-letter-body">還沒決定去哪裡嗎？<br>沒關係，<br>我們先把世界的門牌<br>找出來。</p>
                            <div class="am-navi-letter-sign">— Yingying ♡</div>
                        </div>
                    </div>

                    <div class="am-navi-center">
                        <div class="am-navi-frame">
                            <span class="am-navi-corner tl"></span>
                            <span class="am-navi-corner tr"></span>
                            <span class="am-navi-corner bl"></span>
                            <span class="am-navi-corner br"></span>
                            <div class="am-navi-no-data">NO MAP DATA</div>
                            <div class="am-navi-no-data-sub">WAITING FOR WORLD INITIALIZATION</div>
                            <div class="am-navi-divider"></div>
                            <div class="am-navi-no-data-hint">尚未生成當前世界地圖</div>
                            <div class="am-navi-progress-row">
                                <span class="am-navi-progress-label">SYSTEM STATUS · STANDBY</span>
                                <div class="am-navi-progress-bar"><div class="am-navi-progress-fill"></div></div>
                                <span class="am-navi-progress-val">0%</span>
                            </div>
                        </div>
                    </div>

                    <div class="am-navi-right">
                        <div class="am-navi-block">
                            <div class="am-navi-section-label-r">INITIALIZATION INFO</div>
                            <div class="am-navi-info-card">
                                <div class="am-navi-info-icon">👤</div>
                                <div class="am-navi-info-body">
                                    <div class="am-navi-info-title">角色卡</div>
                                    <div class="am-navi-info-val" id="am-navi-info-chars">未連接</div>
                                </div>
                            </div>
                            <div class="am-navi-info-card">
                                <div class="am-navi-info-icon">📖</div>
                                <div class="am-navi-info-body">
                                    <div class="am-navi-info-title">世界書</div>
                                    <div class="am-navi-info-val" id="am-navi-info-wb">未綁定</div>
                                </div>
                            </div>
                            <div class="am-navi-info-card">
                                <div class="am-navi-info-icon">📋</div>
                                <div class="am-navi-info-body">
                                    <div class="am-navi-info-title">劇情上下文</div>
                                    <div class="am-navi-info-val" id="am-navi-info-chapter">尚未開始</div>
                                </div>
                            </div>
                            <div class="am-navi-info-card">
                                <div class="am-navi-info-icon">💠</div>
                                <div class="am-navi-info-body">
                                    <div class="am-navi-info-title">系統模型</div>
                                    <div class="am-navi-info-val">LUNA-VII v3.2.7</div>
                                </div>
                            </div>
                        </div>
                        <div class="am-navi-tips">
                            <div class="am-navi-tips-label">TIPS</div>
                            <p class="am-navi-tips-body">💡 地圖生成時間會依據世界複雜度約需 10-30 秒，請稍候片刻。</p>
                        </div>
                    </div>

                    <div class="am-navi-actions">
                        <button class="am-navi-btn primary" onclick="window.AUREALIS_MAP.initCurrentWorld()">
                            <span class="am-navi-btn-icon">⊕</span>
                            <div class="am-navi-btn-text">
                                <div class="am-navi-btn-title">生成此世界地圖</div>
                                <div class="am-navi-btn-sub">根據當前資料進行動態生成</div>
                            </div>
                            <span class="am-navi-btn-arrow">›</span>
                        </button>
                        <button class="am-navi-btn secondary" onclick="window.AUREALIS_MAP.useAurealisFallback()">
                            <span class="am-navi-btn-icon">🏙</span>
                            <div class="am-navi-btn-text">
                                <div class="am-navi-btn-title">使用奧瑞亞預設城市</div>
                                <div class="am-navi-btn-sub">載入 Aurelia Core 預設區域</div>
                            </div>
                            <span class="am-navi-btn-arrow">›</span>
                        </button>
                    </div>
                </div>
            `;

            // 動態填入 INITIALIZATION INFO（角色卡 / 世界書 / 劇情上下文）
            try {
                const ctx = (win.SillyTavern && win.SillyTavern.getContext) ? win.SillyTavern.getContext() : null;
                const charName = ctx && ctx.characters && ctx.characters[ctx.characterId] ? ctx.characters[ctx.characterId].name : null;
                const lbName = win.TavernHelper && win.TavernHelper.getCurrentCharPrimaryLorebook ? win.TavernHelper.getCurrentCharPrimaryLorebook() : null;
                const msgCount = ctx && ctx.chat ? ctx.chat.length : 0;

                const cE = document.getElementById('am-navi-info-chars');
                const wE = document.getElementById('am-navi-info-wb');
                const chE = document.getElementById('am-navi-info-chapter');
                if (cE && charName) cE.textContent = charName;
                if (wE && lbName) wE.textContent = lbName;
                if (chE) chE.textContent = msgCount > 0 ? `${msgCount} 則訊息` : '尚未開始';
            } catch(e) { console.warn('[Map] 動態資訊填入失敗', e); }

            return;
        }

        const world = WORLD() ? WORLD().getCurrentWorld() : null;
        title.innerText = (world && world.name ? world.name : 'AUREALIS').toUpperCase();

        const zoneIds = WORLD() ? WORLD().getZoneIds() : [];
        const labels = { 'A': 'Central', 'B': 'Nocturne', 'C': 'Horizon', 'D': 'Ivory', 'E': 'Spire' };
        const dynamicId = win.WORLD_RUNTIME ? win.WORLD_RUNTIME.DYNAMIC_ZONE_ID : 'Z_DYNAMIC';

        // 動態區永遠排最後
        const sortedIds = zoneIds.slice().sort((a, b) => {
            if (a === dynamicId) return 1;
            if (b === dynamicId) return -1;
            return 0;
        });

        // marker 模式：所有非動態區都有 mapX/mapY 才啟用（動態區允許沒座標，後面用右下角 fallback）
        const realZoneIds = sortedIds.filter(id => id !== dynamicId);
        const useMarkerMode = realZoneIds.length > 0 && realZoneIds.every(id => {
            const z = WORLD().getZone(id);
            return z && typeof z.mapX === 'number' && typeof z.mapY === 'number';
        });

        if (useMarkerMode) {
            selector.classList.add('am-marker-mode');
            // 把 worldMap 直接貼到 selector 上：marker 用 % 浮在這層，座標 100% 對齊
            if (worldMapUrl) {
                selector.style.backgroundImage = `url('${worldMapUrl}')`;
            } else {
                selector.style.backgroundImage = '';
            }
            selector.innerHTML = sortedIds.map(id => {
                const zone = WORLD().getZone(id);
                const isDynamic = (id === dynamicId) || (zone && zone.isDynamic);
                const hasEvent = Object.values(STATE.activeEvents).some(ev => ev.zoneId === id);
                const dotHtml = hasEvent ? `<div class="am-zone-dot"></div>` : '';
                const safeId = String(id).replace(/'/g, "\\'");

                // 沒座標的動態區放右下角，避免疊在主要 zone 上
                const mx = (zone && typeof zone.mapX === 'number') ? zone.mapX : (isDynamic ? 92 : 50);
                const my = (zone && typeof zone.mapY === 'number') ? zone.mapY : (isDynamic ? 88 : 50);
                const icon = (zone && zone.icon) ? zone.icon : (isDynamic ? '🌀' : '🌐');
                const labelText = (zone && zone.name) ? zone.name : 'ZONE';

                return `
                <div class="am-zone-marker" style="left:${mx}%; top:${my}%;" onclick="window.AUREALIS_MAP.enterZone('${safeId}')">
                    ${dotHtml}
                    <div class="am-zone-marker-emoji">${icon}</div>
                    <div class="am-zone-marker-label">${labelText}</div>
                </div>
                `;
            }).join('');
            return;
        }

        // === fallback：卡片 grid 模式（奧瑞亞 / 舊存檔沒 mapX/mapY 用這個）===
        selector.classList.remove('am-marker-mode');
        selector.style.backgroundImage = '';
        selector.innerHTML = sortedIds.map(id => {
            const hasEvent = Object.values(STATE.activeEvents).some(ev => ev.zoneId === id);
            const dotHtml = hasEvent ? `<div class="am-zone-dot"></div>` : '';
            const zone = WORLD().getZone(id);
            const isDynamic = (id === dynamicId) || (zone && zone.isDynamic);
            const facCount = zone && zone.facilities ? Object.keys(zone.facilities).length : 0;

            if (isDynamic) {
                return `
                <div class="am-zone-entrance" onclick="window.AUREALIS_MAP.enterZone('${id}')"
                     style="border-style:dashed; border-color:rgba(255,140,66,0.6); background:rgba(40,15,5,0.4);">
                    <div style="font-size:32px;">🌀</div>
                    <div class="am-zone-label" style="color:#ffaa50;">DRIFT · ${facCount}</div>
                </div>`;
            }

            // 奧瑞亞 5 區用單字母（A-E 是設計感）；其他用 zone.icon；都沒有就 fallback emoji
            const aurealisLetters = { A: true, B: true, C: true, D: true, E: true };
            const isAurealisLetter = aurealisLetters[id] === true && id.length === 1;
            const zoneIcon = (zone && zone.icon) ? zone.icon : '';
            const zoneName = (zone && zone.name) ? zone.name : 'ZONE';
            const labelText = labels[id] || zoneName;
            const safeId = String(id).replace(/'/g, "\\'");

            const topDisplay = zoneIcon
                ? `<div class="am-zone-emoji">${zoneIcon}</div>`
                : isAurealisLetter
                    ? `<div class="am-zone-letter">${id}</div>`
                    : `<div class="am-zone-emoji">🌐</div>`;

            return `
            <div class="am-zone-entrance" onclick="window.AUREALIS_MAP.enterZone('${safeId}')">
                ${dotHtml}
                ${topDisplay}
                <div class="am-zone-label">${labelText}</div>
            </div>
        `}).join('');
    }

    // 🔥 V2.0：初始化當前 chatId 對應的動態世界
    async function initCurrentWorld() {
        if (blockIfPreview('初始化世界')) return;
        if (!win.WORLD_GENERATOR) {
            if (win.toastr) win.toastr.error('世界生成器未就緒', 'Map');
            return;
        }
        const selector = document.getElementById('am-zone-selector');
        if (selector) {
            selector.innerHTML = `
                <div class="am-navi-loading">
                    <div class="am-navi-loading-frame">
                        <span class="am-navi-corner tl"></span>
                        <span class="am-navi-corner tr"></span>
                        <span class="am-navi-corner bl"></span>
                        <span class="am-navi-corner br"></span>
                        <div class="am-navi-loading-spinner"></div>
                        <div class="am-navi-loading-title">GENERATING</div>
                        <div class="am-navi-loading-sub">AI IS DRAFTING THE WORLD MAP</div>
                        <div class="am-navi-divider"></div>
                        <div class="am-navi-loading-status" id="am-gen-status">正在掃描世界書...</div>
                    </div>
                </div>
            `;
        }
        const statusEl = () => document.getElementById('am-gen-status');
        const ok = await win.WORLD_GENERATOR.generateForCurrentChat((stage, msg) => {
            const el = statusEl();
            if (el) el.innerText = msg || stage;
            console.log('[Map] 生成進度:', stage, msg);
        });
        if (ok) {
            renderHome();
            if (win.toastr) win.toastr.success('世界已生成', 'Map');
        } else {
            renderHome();
            if (win.toastr) win.toastr.error('生成失敗，請看 console', 'Map');
        }
    }

    // 🔥 V2.0：用奧瑞亞當作這個聊天室的預設世界
    function useAurealisFallback() {
        if (win.WORLD_RUNTIME && win.WORLD_RUNTIME.useAurealisAsFallback) {
            win.WORLD_RUNTIME.useAurealisAsFallback();
            renderHome();
        }
    }

    // 🔥 V4.0：預覽模式守門 — 互動操作呼叫前先檢查
    function blockIfPreview(actionName) {
        if (win.WORLD_RUNTIME && win.WORLD_RUNTIME.isPreview && win.WORLD_RUNTIME.isPreview()) {
            const msg = `🔒 預覽模式：「${actionName || '此操作'}」需要你切到對應角色卡才能執行（不同角色卡是獨立世界書）`;
            if (win.toastr) win.toastr.warning(msg, 'Map');
            else alert(msg);
            return true;
        }
        return false;
    }

    // 🔥 V4.0：更新預覽橫幅顯示
    function updatePreviewBanner() {
        const banner = document.getElementById('am-preview-banner');
        if (!banner) return;
        const inPreview = win.WORLD_RUNTIME && win.WORLD_RUNTIME.isPreview && win.WORLD_RUNTIME.isPreview();
        if (inPreview) {
            const w = win.WORLD_RUNTIME.getCurrentWorld();
            const name = (w && w.name) || '???';
            const nameEl = document.getElementById('am-preview-name');
            if (nameEl) nameEl.textContent = name;
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    }

    // 🔥 V4.0：退出預覽，回到當前 chatId 對應的世界
    async function exitPreviewMap() {
        if (win.WORLD_RUNTIME && win.WORLD_RUNTIME.exitPreview) {
            await win.WORLD_RUNTIME.exitPreview();
            updatePreviewBanner();
            renderHome();
            if (win.toastr) win.toastr.info('已返回當前世界', 'Map');
        }
    }

    // 地圖設置面板（精簡版）
    function showMapSettings() {
        const modal = document.getElementById('am-char-modal');
        modal.innerHTML = `
            <div class="am-modal-card" style="max-width:380px; max-height:85vh; display:flex; flex-direction:column;" onclick="event.stopPropagation()">
                <div style="padding:14px 16px 10px; border-bottom:1px solid #222;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="margin:0; color:#D4AF37; font-family:'Cinzel'; letter-spacing:2px;">⚙️ 地圖設置</h3>
                        <span class="am-btn-icon" onclick="window.AUREALIS_MAP.closeModal()" style="font-size:18px;">×</span>
                    </div>
                </div>

                <div style="padding:14px 16px; overflow-y:auto; flex:1;">
                    <div style="color:#aaa; font-size:11px; margin:0 0 6px; letter-spacing:1px; font-family:'Cinzel';">SCENE MAP</div>
                    <div style="background:rgba(20,20,20,0.4); border:1px solid #333; border-radius:6px; padding:10px; margin-bottom:8px;">
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                            <input type="checkbox" id="scenemap-backdrop-auto"
                                ${(win.SCENE_MAP_ENGINE && win.SCENE_MAP_ENGINE.isBackdropAuto && win.SCENE_MAP_ENGINE.isBackdropAuto()) ? 'checked' : ''}
                                style="width:18px; height:18px; accent-color:#D4AF37;">
                            <div style="flex:1;">
                                <div style="color:#D4AF37; font-weight:bold; font-size:13px;">自動補底板圖</div>
                                <div style="color:#888; font-size:10px; margin-top:2px;">進設施生地標時順便出張底板背景（用「圖片設置→背景」選的接口生）；關閉省流量，地標 emoji 仍會顯示</div>
                            </div>
                        </label>
                    </div>
                </div>

                <div style="padding:10px 16px; border-top:1px solid #222; display:flex; gap:6px;">
                    <button class="am-btn-full am-btn-main" style="padding:8px; border-radius:4px; cursor:pointer; font-size:11px;"
                            onclick="window.AUREALIS_MAP._mapSaveSettings()">💾 儲存並關閉</button>
                </div>
            </div>
        `;
        modal.classList.add('active');
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };
    }

    function _mapSaveSettings() {
        const scenemapBackdrop = document.getElementById('scenemap-backdrop-auto');
        if (scenemapBackdrop && win.SCENE_MAP_ENGINE && typeof win.SCENE_MAP_ENGINE.setBackdropAuto === 'function') {
            win.SCENE_MAP_ENGINE.setBackdropAuto(scenemapBackdrop.checked);
        }
        if (win.toastr) win.toastr.success('設置已儲存', 'Map');
        closeModal();
    }

    // 🔥 V4.0：多世界管理器
    async function showWorldManager() {
        if (!win.OS_DB || typeof win.OS_DB.listWorlds !== 'function') {
            if (win.toastr) win.toastr.error('OS_DB 未就緒', 'Map');
            return;
        }
        let worlds = [];
        try { worlds = await win.OS_DB.listWorlds(); } catch (e) { console.error(e); }

        const realChatId = win.WORLD_RUNTIME.getRealChatId();
        const currentId = win.WORLD_RUNTIME.getCurrentWorldId();
        const inPreview = win.WORLD_RUNTIME.isPreview();

        // 預設世界（奧瑞亞）虛擬列為一張卡
        const cards = [];
        cards.push({
            worldId: win.WORLD_RUNTIME.AUREALIS_ID,
            name: 'AUREALIS（預設世界）',
            isDefault: true,
            zoneCount: win.AUREALIS_DATA ? win.AUREALIS_DATA.getZoneIds().length : 0,
            facilityCount: 0,
            scheduleCount: 0,
            timestamp: 0
        });

        worlds.forEach(w => {
            const zoneCount = w.zones ? Object.keys(w.zones).length : 0;
            let facilityCount = 0;
            if (w.zones) {
                Object.values(w.zones).forEach(z => {
                    facilityCount += Object.keys(z.facilities || {}).length;
                });
            }
            const scheduleCount = w.schedules ? Object.keys(w.schedules).length : 0;
            cards.push({
                worldId: w.worldId,
                name: w.name || '未命名世界',
                isDefault: false,
                zoneCount,
                facilityCount,
                scheduleCount,
                timestamp: w.timestamp || 0
            });
        });

        const overflow = cards.length > 11; // >10 個動態世界
        const fmtDate = (t) => {
            if (!t) return '—';
            try { return new Date(t).toLocaleString(); } catch (e) { return '—'; }
        };

        const cardsHtml = cards.map(c => {
            const isCurrent = c.worldId === currentId;
            const isReal = c.worldId === realChatId;
            const tag = isReal ? '⭐ 當前 chatId 對應'
                              : (isCurrent && inPreview ? '👁️ 預覽中' : '');
            const tagColor = isReal ? '#FFD700' : '#ff8c42';
            return `
                <div style="background:rgba(20,20,20,0.7); border:1px solid ${isReal?'#D4AF37':'#333'}; border-radius:8px; padding:10px 12px; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:6px;">
                        <div style="flex:1; min-width:0;">
                            <div style="color:#D4AF37; font-weight:bold; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${c.name}">${c.name}</div>
                            ${tag ? `<div style="color:${tagColor}; font-size:10px; margin-top:2px;">${tag}</div>` : ''}
                            <div style="color:#777; font-size:10px; margin-top:2px;">id: ${String(c.worldId).substring(0, 50)}${String(c.worldId).length > 50 ? '…' : ''}</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; font-size:10px; color:#aaa; margin-bottom:8px;">
                        <span>🗺️ ${c.zoneCount} 區</span>
                        <span>📍 ${c.facilityCount} 設施</span>
                        <span>📋 ${c.scheduleCount} 排程</span>
                        ${c.isDefault ? '<span>（內建）</span>' : `<span>🕒 ${fmtDate(c.timestamp)}</span>`}
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button class="am-btn-full" style="padding:6px 8px; border-radius:4px; cursor:pointer; font-size:11px; background:${isCurrent?'#222':'#D4AF37'}; color:${isCurrent?'#666':'#000'}; border:none; ${isCurrent?'cursor:not-allowed;':''}"
                                ${isCurrent?'disabled':''}
                                onclick="window.AUREALIS_MAP._previewWorld('${String(c.worldId).replace(/'/g, "\\'")}')">
                            ${isCurrent?'（已顯示）':'👁️ 切換顯示'}
                        </button>
                        ${c.isDefault ? '' : `
                            <button class="am-btn-full" style="padding:6px 8px; border-radius:4px; cursor:pointer; font-size:11px; background:#3a1010; color:#ff453a; border:1px solid #5a2020;"
                                    onclick="window.AUREALIS_MAP._deleteWorld('${String(c.worldId).replace(/'/g, "\\'")}')">
                                🗑️ 刪除
                            </button>`}
                    </div>
                </div>
            `;
        }).join('');

        const modal = document.getElementById('am-char-modal');
        modal.innerHTML = `
            <div class="am-modal-card" style="max-width:420px; max-height:85vh; display:flex; flex-direction:column;" onclick="event.stopPropagation()">
                <div style="padding:14px 16px 10px; border-bottom:1px solid #222;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="margin:0; color:#D4AF37; font-family:'Cinzel'; letter-spacing:2px;">🌐 多世界管理</h3>
                        <span class="am-btn-icon" onclick="window.AUREALIS_MAP.closeModal()" style="font-size:18px;">×</span>
                    </div>
                    ${overflow ? `<div style="margin-top:8px; padding:6px 8px; background:rgba(255,140,0,0.15); border:1px solid rgba(255,140,0,0.4); border-radius:4px; color:#ffaa50; font-size:11px;">
                        ⚠️ 已有 ${cards.length - 1} 個動態世界，建議清理舊資料
                    </div>` : ''}
                    <div style="font-size:10px; color:#666; margin-top:6px;">⭐ 當前 chatId 對應的世界 · 👁️ 預覽其他世界（不可互動）</div>
                </div>
                <div style="padding:12px 14px; overflow-y:auto; flex:1;">${cardsHtml}</div>
                <div style="padding:10px 16px; border-top:1px solid #222; display:flex; gap:8px;">
                    <button class="am-btn-full" style="background:#3a1010; color:#ff7755; border:1px solid #5a2020; padding:8px; border-radius:4px; cursor:pointer; font-size:11px;"
                            onclick="window.AUREALIS_MAP._wipeAllDynamicWorlds()">🧹 清空所有動態世界（保留奧瑞亞）</button>
                    <button class="am-btn-full am-btn-main" style="padding:8px; border-radius:4px; cursor:pointer; font-size:11px;"
                            onclick="window.AUREALIS_MAP.closeModal()">關閉</button>
                </div>
            </div>
        `;
        modal.classList.add('active');
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };
    }

    async function _previewWorld(worldId) {
        if (!win.WORLD_RUNTIME || !win.WORLD_RUNTIME.previewWorld) return;
        await win.WORLD_RUNTIME.previewWorld(worldId);
        updatePreviewBanner();
        renderHome();
        closeModal();
        if (win.toastr) {
            const inP = win.WORLD_RUNTIME.isPreview();
            win.toastr.info(inP ? '👁️ 已切換到預覽模式' : '已切回當前世界', 'Map');
        }
    }

    async function _deleteWorld(worldId) {
        const ok = window.confirm('確定刪除這個世界？所有區域、設施、排程都會永久消失。');
        if (!ok) return;
        try {
            await win.OS_DB.deleteWorldData(worldId);
            // 如果刪的是當前正在看的世界
            const currentId = win.WORLD_RUNTIME.getCurrentWorldId();
            if (worldId === currentId) {
                await win.WORLD_RUNTIME.exitPreview();
                await win.WORLD_RUNTIME.switchTo(win.WORLD_RUNTIME.getRealChatId());
                updatePreviewBanner();
                renderHome();
            }
            if (win.toastr) win.toastr.success('世界已刪除', 'Map');
            await showWorldManager(); // 重開 modal 刷新列表
        } catch (e) {
            console.error('[Map] 刪除世界失敗:', e);
            if (win.toastr) win.toastr.error('刪除失敗', 'Map');
        }
    }

    async function _wipeAllDynamicWorlds() {
        const ok = window.confirm('確定清空「所有動態世界」？奧瑞亞會保留，但所有 AI 生成的世界都會消失。');
        if (!ok) return;
        try {
            const worlds = await win.OS_DB.listWorlds();
            for (const w of worlds) {
                await win.OS_DB.deleteWorldData(w.worldId);
            }
            await win.WORLD_RUNTIME.exitPreview();
            await win.WORLD_RUNTIME.switchTo(win.WORLD_RUNTIME.getRealChatId());
            updatePreviewBanner();
            renderHome();
            if (win.toastr) win.toastr.success(`已清空 ${worlds.length} 個世界`, 'Map');
            await showWorldManager();
        } catch (e) {
            console.error('[Map] 清空失敗:', e);
        }
    }

    // 🔥 V3.0：排程按鈕入口 — 有排程開時刻表，沒排程走生成流程
    async function generateSchedules() {
        if (!win.SCHEDULE_ENGINE) {
            if (win.toastr) win.toastr.error('排程引擎未就緒', 'Map');
            return;
        }
        if (!win.WORLD_RUNTIME || !win.WORLD_RUNTIME.getCurrentWorld()) {
            if (win.toastr) win.toastr.warning('請先初始化此世界', 'Map');
            return;
        }
        if (win.WORLD_RUNTIME.hasSchedules()) {
            showScheduleViewer();
            return;
        }
        if (blockIfPreview('生成排程')) return;
        await runScheduleGenerator();
    }

    async function runScheduleGenerator() {
        if (blockIfPreview('生成排程')) return;
        if (win.toastr) win.toastr.info('正在生成角色排程...', 'Map');
        const result = await win.SCHEDULE_ENGINE.generateSchedules((stage, msg) => {
            console.log('[Map] 排程進度:', stage, msg);
            if (stage === 'error' && win.toastr) win.toastr.error(msg, 'Map');
        });
        if (result && win.toastr) win.toastr.success('排程已生成', 'Map');
    }

    // === V3.0：時刻表查看器 ===
    let _scheduleViewerTab = null; // 當前選中時段，null = 用「現在」
    function showScheduleViewer() {
        const world = win.WORLD_RUNTIME.getCurrentWorld();
        const schedules = (world && world.schedules) || {};
        const charNames = Object.keys(schedules);
        if (charNames.length === 0) {
            if (win.toastr) win.toastr.warning('尚無排程資料', 'Map');
            return;
        }

        const periods = ['黎明','上午','下午','黃昏','晚上','午夜','凌晨'];
        const periodHours = { '黎明':'05-08', '上午':'08-12', '下午':'12-17', '黃昏':'17-19', '晚上':'19-23', '午夜':'23-02', '凌晨':'02-05' };
        const nowPeriod = win.SCHEDULE_ENGINE.getTimePeriod();
        if (!_scheduleViewerTab) _scheduleViewerTab = nowPeriod;

        const facMap = {}; // sceneId → "區/設施名（用 shortName 與地圖 icon 一致）"
        if (world.zones) {
            Object.keys(world.zones).forEach(zKey => {
                const z = world.zones[zKey];
                Object.keys(z.facilities || {}).forEach(fKey => {
                    const f = z.facilities[fKey];
                    const sid = f.sceneId || `${zKey}_${fKey}`;
                    const displayName = f.shortName || f.name || fKey;
                    facMap[sid] = `${z.name} / ${displayName}`;
                });
            });
        }
        const locName = (locId) => {
            if (!locId || locId === 'Home') return '🏠 家';
            return facMap[locId] || locId;
        };

        const tabsHtml = periods.map(p => {
            const isActive = p === _scheduleViewerTab;
            const isNow = p === nowPeriod;
            return `<div class="am-mode-opt ${isActive?'active':''}"
                onclick="window.AUREALIS_MAP._switchScheduleTab('${p}')"
                style="position:relative; ${isNow?'border-color:#FFD700; box-shadow:0 0 6px rgba(255,215,0,0.4);':''}">
                ${p}<div style="font-size:9px; opacity:0.6;">${periodHours[p]}</div>
                ${isNow?'<span style="position:absolute; top:-4px; right:-4px; font-size:10px;">🕒</span>':''}
            </div>`;
        }).join('');

        // 🔥 V5.0：即時狀態區（VN 抽取的 liveStates）
        const liveStates = (world.liveStates && Object.keys(world.liveStates).length > 0)
            ? world.liveStates : null;
        const liveHtml = liveStates ? `
            <div style="background:rgba(40,15,5,0.5); border:1px solid rgba(255,140,0,0.4); border-radius:6px; padding:10px; margin-bottom:10px;">
                <div style="color:#ffaa50; font-weight:bold; font-size:12px; margin-bottom:6px;">📡 即時狀態（VN 抽取，覆蓋排程）</div>
                ${Object.keys(liveStates).map(name => {
                    const s = liveStates[name];
                    const loc = s.location_id === 'Home' ? '🏠 家'
                        : (s.location_id && s.location_id.startsWith('DYNAMIC:'))
                            ? `🌀 ${s.location_id.substring(8)}（地圖外）`
                            : (facMap[s.location_id] || s.location_id);
                    const until = s.until_period ? `· 直到 ${s.until_period}` : '';
                    return `<div style="border-left:2px solid #ff8c42; padding:4px 0 4px 8px; margin-bottom:4px;">
                        <div style="font-size:11px;"><span style="color:#ffaa50; font-weight:bold;">${name}</span>
                            <span style="color:#aaa; margin-left:6px;">📍 ${loc}</span>
                            <span style="color:#888; margin-left:6px; font-size:10px;">${until}</span></div>
                        ${s.action ? `<div style="color:#ddd; font-size:11px; margin-top:2px; font-style:italic;">${s.action}</div>` : ''}
                        ${s.dialogue ? `<div style="color:#fff; font-size:11px; margin-top:2px;">「${s.dialogue}」</div>` : ''}
                    </div>`;
                }).join('')}
            </div>
        ` : '';

        const charsHtml = liveHtml + charNames.map(name => {
            const periodData = schedules[name][_scheduleViewerTab];
            if (!Array.isArray(periodData) || periodData.length === 0) {
                return `<div style="background:rgba(20,20,20,0.6); border:1px solid #333; border-radius:6px; padding:10px; margin-bottom:8px;">
                    <div style="color:#D4AF37; font-weight:bold; margin-bottom:4px;">⭐ ${name}</div>
                    <div style="color:#666; font-size:11px;">（此時段無排程）</div>
                </div>`;
            }
            const branches = periodData.map(b => {
                const probBar = `<div style="background:#333; height:4px; border-radius:2px; overflow:hidden; margin-top:4px;">
                    <div style="background:#D4AF37; height:100%; width:${b.prob||0}%;"></div>
                </div>`;
                const catColor = { 'Work':'#6e45e2', 'Home':'#88d3ce', 'Outing':'#ff8c42' }[b.category] || '#aaa';
                return `<div style="border-left:2px solid ${catColor}; padding:6px 0 6px 8px; margin-bottom:6px;">
                    <div style="font-size:11px;">
                        <span style="color:${catColor}; font-weight:bold;">${b.category}</span>
                        <span style="color:#999; margin-left:6px;">${b.prob}%</span>
                        <span style="color:#aaa; margin-left:6px;">📍 ${locName(b.location_id)}</span>
                    </div>
                    <div style="color:#ddd; font-size:11px; margin-top:3px; font-style:italic;">${b.action || ''}</div>
                    <div style="color:#fff; font-size:11px; margin-top:2px;">「${b.dialogue || '...'}」</div>
                    ${probBar}
                </div>`;
            }).join('');
            return `<div style="background:rgba(20,20,20,0.6); border:1px solid #333; border-radius:6px; padding:10px; margin-bottom:8px;">
                <div style="color:#D4AF37; font-weight:bold; margin-bottom:6px;">⭐ ${name}</div>
                ${branches}
            </div>`;
        }).join('');

        const modal = document.getElementById('am-char-modal');
        modal.innerHTML = `
            <div class="am-modal-card" style="max-width:380px; max-height:85vh; display:flex; flex-direction:column;" onclick="event.stopPropagation()">
                <div style="padding:14px 16px 8px; border-bottom:1px solid #222;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <h3 style="margin:0; color:#D4AF37; font-family:'Cinzel'; letter-spacing:2px;">📅 角色時刻表</h3>
                        <span class="am-btn-icon" onclick="window.AUREALIS_MAP.closeModal()" style="font-size:18px;">×</span>
                    </div>
                    <div style="font-size:11px; color:#888;">當前時段：<span style="color:#FFD700;">🕒 ${nowPeriod}</span> · ${charNames.length} 個角色</div>
                    <div class="am-mode-selector" style="flex-wrap:wrap; gap:5px; margin-top:10px;">${tabsHtml}</div>
                </div>
                <div style="padding:12px 16px; overflow-y:auto; flex:1;">${charsHtml}</div>
                <div style="padding:10px 16px; border-top:1px solid #222; display:flex; gap:8px;">
                    <button class="am-btn-full" style="background:#444; color:#aaa; border:none; padding:8px; border-radius:4px; cursor:pointer; font-size:12px;"
                        onclick="window.AUREALIS_MAP._regenerateSchedules()">🔄 重新生成</button>
                    <button class="am-btn-full am-btn-main" style="padding:8px; border-radius:4px; cursor:pointer; font-size:12px;"
                        onclick="window.AUREALIS_MAP.closeModal()">關閉</button>
                </div>
            </div>
        `;
        modal.classList.add('active');
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };
    }

    function _switchScheduleTab(period) {
        _scheduleViewerTab = period;
        showScheduleViewer();
    }

    async function _regenerateSchedules() {
        const ok = window.confirm('確定重新生成排程？舊資料會被覆蓋。');
        if (!ok) return;
        closeModal();
        await runScheduleGenerator();
    }

    function enterZone(zoneId) {
        STATE.currentZoneId = zoneId;
        STATE.view = 'zone';

        const bg = document.getElementById('am-bg');
        const homeLayer = document.getElementById('am-home-layer');
        const innerLayer = document.getElementById('am-inner-layer');
        const title = document.getElementById('am-main-title');

        const zoneData = WORLD().getZone(zoneId);
        
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
                const eventKey = `${zoneId}_${key}`;
                const hasEvent = STATE.activeEvents[eventKey];
                const dotHtml = hasEvent ? `<div class="am-red-dot"></div>` : '';

                // 🔥 V5.0：動態 facility 用虛線邊框 + 🌀 角落徽章
                const isDynamic = f.isDynamic;
                const cardStyle = isDynamic
                    ? 'border-style:dashed; border-color:rgba(255,140,66,0.6); background:rgba(20,10,5,0.6);'
                    : '';
                const dynBadge = isDynamic
                    ? '<div style="position:absolute; top:6px; left:6px; font-size:11px; opacity:0.8;">🌀</div>'
                    : '';

                return `
                    <div class="am-fac-card" style="${cardStyle}" onclick="window.AUREALIS_MAP.openFacilityDetail('${key}')">
                        ${dotHtml}
                        ${dynBadge}
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
        const zoneData = WORLD().getZone(STATE.currentZoneId);
        const facility = zoneData.facilities[facKey];
        if (!facility) return;

        STATE.activeFacility = facility;
        STATE.activeFacilityKey = facKey; // 保存 Key 以便查詢事件

        // 標題列填上「區域名 / 設施名」
        const zoneText = document.getElementById('am-detail-zone-text');
        const facText = document.getElementById('am-detail-facility-text');
        if (zoneText) zoneText.textContent = zoneData.name || STATE.currentZoneId || '';
        if (facText) facText.textContent = `${facility.icon || '📍'} ${facility.name || ''}`;

        // 切換設施先把 stage 整個清乾淨:背景圖 + 內容(避免上一個設施的 landmark / 小人殘留到新設施)
        const charGridReset = document.getElementById('am-char-grid');
        if (charGridReset) {
            charGridReset.style.backgroundImage = '';
            charGridReset.innerHTML = '';
        }
        // 上一輪的走路 / 冒泡定時器也要立刻收乾淨
        _clearAnimationTimers();

        // 讀取舊有數據（臨時掃描的路人）；小發現改住 facility.sceneMap.landmarks（isDiscovery），跟場景圖一起載入
        STATE.generatedChars = [];
        STATE.introSegments = [];
        if (win.OS_DB) {
            try {
                const saved = await win.OS_DB.getMapFacilityData(STATE.currentZoneId, facKey);
                if (saved && saved.characters) {
                    STATE.generatedChars = saved.characters;
                    STATE.introSegments = saved.intro || [];
                }
            } catch (e) {}
        }

        // 🔥 V3.0：把當下時段的常駐排程角色補到最前面（不覆蓋掃描的臨時路人）
        if (win.SCHEDULE_ENGINE && typeof win.SCHEDULE_ENGINE.getCharsAtFacility === 'function') {
            try {
                const residents = win.SCHEDULE_ENGINE.getCharsAtFacility(STATE.currentZoneId, facKey);
                if (residents && residents.length > 0) {
                    // 標記 isResident，避免跟臨時路人撞名
                    const tagged = residents.map(r => ({ ...r, isResident: true }));
                    // 去重（如果掃描結果有同名）
                    const existingNames = new Set(STATE.generatedChars.map(c => c.name));
                    const fresh = tagged.filter(r => !existingNames.has(r.name));
                    STATE.generatedChars = [...fresh, ...STATE.generatedChars];
                    console.log('[Map] 📋 常駐角色出現:', fresh.map(c => c.name).join(', '));
                }
            } catch (e) {
                console.warn('[Map] 排程查詢失敗:', e);
            }
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

        detailView.classList.add('active');

        // 進設施「不再自動」生小地圖（省 API）→ 生成已併進「🔍 探索此地」按鈕（scanForCharacters 內一次做完）。
        // 這裡只 render 現有狀態：有 sceneMap 就顯示地標＋線框圖，沒有就等使用者按探索。
        renderScanResults();
    }

    // 復古線框小地圖：沒生底板圖時用它當背景，取代黑底。純 SVG（零生圖 API、秒出、風格統一）。
    //   暗底 + 發光外框 + 淡網格 + 地標間巡邏虛線 + 每個地標的柔光暈；地標 emoji/名字仍由上層 div 疊放。
    //   viewBox 0-100 配 background-size:100% 100% → 跟地標的 x/y 0-100% 座標系完全對齊。
    function _buildSceneMinimap(landmarks) {
        const lms = (Array.isArray(landmarks) ? landmarks : []).filter(l => l && typeof l.x === 'number' && typeof l.y === 'number');
        let grid = '';
        for (let i = 1; i < 8; i++) { const p = i * 12.5; grid += `<line x1='${p}' y1='0' x2='${p}' y2='100' stroke='#3a5a6a' stroke-width='0.15' opacity='0.22'/><line x1='0' y1='${p}' x2='100' y2='${p}' stroke='#3a5a6a' stroke-width='0.15' opacity='0.22'/>`; }
        const pathLine = lms.length > 1
            ? `<polyline points='${lms.map(l => `${l.x},${l.y}`).join(' ')}' fill='none' stroke='#d4af37' stroke-width='0.35' stroke-dasharray='1.5 1.6' opacity='0.32'/>`
            : '';
        const glows = lms.map(l => `<circle cx='${l.x}' cy='${l.y}' r='4.5' fill='#d4af37' opacity='0.10'/><circle cx='${l.x}' cy='${l.y}' r='1.1' fill='#ffe9a8' opacity='0.55'/>`).join('');
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>`
            + `<defs><radialGradient id='g' cx='50%' cy='38%' r='78%'><stop offset='0%' stop-color='#13212f'/><stop offset='100%' stop-color='#060b12'/></radialGradient></defs>`
            + `<rect width='100' height='100' fill='url(#g)'/>${grid}`
            + `<rect x='2' y='2' width='96' height='96' fill='none' stroke='#d4af37' stroke-width='0.5' opacity='0.55'/>`
            + `<rect x='3.6' y='3.6' width='92.8' height='92.8' fill='none' stroke='#d4af37' stroke-width='0.18' opacity='0.3'/>`
            + `${pathLine}${glows}</svg>`;
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    function renderScanResults() {
        const resultsDiv = document.getElementById('am-scan-results');
        const charGrid = document.getElementById('am-char-grid');
        const introBox = document.getElementById('am-intro-container');

        // 有 sceneMap 也算「有內容」，這樣進設施一回來就能看到地標
        const hasSceneMap = !!(STATE.activeFacility && STATE.activeFacility.sceneMap);
        if (STATE.generatedChars.length > 0 || STATE.introSegments.length > 0 || hasSceneMap) {
            resultsDiv.classList.add('active');

            // 🔍 發現物件已併進小地圖當 pin（sceneMap.landmarks 的 isDiscovery），不再出獨立文字清單
            let introHtml = STATE.introSegments.map(text => `<div style="background:rgba(0,0,0,0.5); padding:10px; margin-bottom:10px; border-radius:4px;">${text}</div>`).join('');
            introBox.innerHTML = introHtml;

            // 重渲染前先把上一輪的走路 / 冒泡定時器清掉
            _clearAnimationTimers();

            // 替換為動態大頭娃娃渲染
            // sceneMap 底板圖（用戶開了 pollinations 補圖才有）
            const sceneMap = STATE.activeFacility && STATE.activeFacility.sceneMap;
            if (sceneMap && sceneMap.backdropUrl) {
                charGrid.style.backgroundImage = `url('${sceneMap.backdropUrl}')`;
                charGrid.style.backgroundSize = 'cover';
            } else if (sceneMap && Array.isArray(sceneMap.landmarks) && sceneMap.landmarks.length) {
                // 沒生底板圖 → 復古線框小地圖當背景（不再黑）；地標 emoji 照舊疊上層
                charGrid.style.backgroundImage = `url("${_buildSceneMinimap(sceneMap.landmarks)}")`;
                charGrid.style.backgroundSize = '100% 100%';
            } else {
                charGrid.style.backgroundImage = '';
                charGrid.style.backgroundSize = '';
            }

            // 場景地標層（純靜態裝飾，避撞由 _startCharacterAnimations 處理）
            // emoji + 短名常駐顯示，點擊（適配移動端）才彈出長描述 popup
            const escAttr = (s) => String(s || '').replace(/"/g, '&quot;');
            const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const landmarkHtml = (sceneMap && Array.isArray(sceneMap.landmarks) && sceneMap.landmarks.length > 0)
                ? sceneMap.landmarks.map(lm => {
                    const popupHtml = lm.description
                        ? `<div class="am-landmark-popup">${escHtml(lm.description)}</div>`
                        : '';
                    // 靠邊自動翻向：避免 popup 被 stage 的 overflow:hidden 切掉
                    // popup 估算 ~100px 高 ≈ stage 40-50%，所以 y<50 都該翻下方
                    const sideClasses = ['am-landmark'];
                    if (lm.isDiscovery) sideClasses.push('am-landmark-disc');   // 🔍 探索找到的發現物：金色強調區分固有地標
                    if (lm.y < 50) sideClasses.push('popup-below');     // 上半 → popup 改下方
                    if (lm.x < 28) sideClasses.push('popup-left');      // 太靠左 → popup 對齊左邊
                    else if (lm.x > 72) sideClasses.push('popup-right'); // 太靠右 → popup 對齊右邊
                    return `
                    <div class="${sideClasses.join(' ')}" style="left:${lm.x}%; top:${lm.y}%;" title="${escAttr(lm.label)}" onclick="event.stopPropagation(); this.classList.toggle('am-landmark-open');">
                        ${popupHtml}
                        <div class="am-landmark-emoji">${lm.emoji || '📍'}</div>
                        <div class="am-landmark-label">${escHtml(lm.label) || ''}</div>
                    </div>
                    `;
                }).join('')
                : '';

            const charsHtml = STATE.generatedChars.map((char, idx) => {
                // 中心錨點座標：x 14-86 / y 62-85（跟 pickValidTarget 同範圍，避免初始位置貼邊）
                const randomLeft = Math.floor(Math.random() * 72) + 14;
                const randomTop = Math.floor(Math.random() * 23) + 62;
                const colors = ['#D4AF37', '#ff453a', '#6e45e2', '#88d3ce', '#ffffff'];
                const residentColor = '#FFD700'; // 常駐用金色
                const liveColor = '#ff8c42';     // VN 即時用橘紅
                const charColor = char.isLive ? liveColor : (char.isResident ? residentColor : colors[idx % colors.length]);
                const shortDialogue = char.dialogue ? char.dialogue.substring(0, 15) + (char.dialogue.length > 15 ? '...' : '') : '...';
                const residentBadge = char.isLive ? `<span style="margin-right:3px;">📡</span>`
                                    : char.isResident ? `<span style="margin-right:3px;">⭐</span>` : '';

                const avatarUrl = char.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${char.name}&backgroundColor=000000`;

                const borderStyle = char.isLive
                    ? 'border: 2px solid #ff8c42; box-shadow: 0 0 14px rgba(255,140,66,0.7);'
                    : char.isResident
                        ? 'border: 2px solid #FFD700; box-shadow: 0 0 12px rgba(255,215,0,0.6);'
                        : '';

                return `
                <div class="walking-character" style="left: ${randomLeft}%; top: ${randomTop}%;" onclick="window.AUREALIS_MAP.openCharacterDetail(${idx})">
                    <div class="character-dialogue-bubble">${shortDialogue}</div>
                    <div class="character-avatar" style="background-image: url('${avatarUrl}'); ${borderStyle}"></div>
                    <div class="character-chibi" style="background-color: ${charColor};"></div>
                    <div class="character-name">${residentBadge}${char.name}</div>
                </div>
                `;
            }).join('');

            charGrid.innerHTML = landmarkHtml + charsHtml;
            // 按鈕文字：真的有掃描結果（路人 / intro / 發現）才改「重新掃描」
            // 只有常駐排程角色 / sceneMap 不算掃過（探索此地是去抽路人，跟 landmark 無關）
            const reallyScanned = (STATE.introSegments && STATE.introSegments.length > 0)
                || STATE.generatedChars.some(c => !c.isResident && !c.isLive);
            document.getElementById('am-scan-btn').innerHTML = reallyScanned
                ? '<span>↻</span> 重新掃描'
                : '<span>🔍</span> 探索此地';

            // 啟動走路 + 冒泡動畫
            _startCharacterAnimations(charGrid);
        } else {
            _clearAnimationTimers(); // 沒角色就把舊定時器收乾淨
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
        if (blockIfPreview('接取委託')) { closeMissionConfirm(); return; }
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

    // 🔍 小發現 → 小地圖 pin：轉成地標同形狀（isDiscovery 標記）併進 sceneMap.landmarks，
    //    同名去重、最多留 6 個（超出裁最舊）——地標不裁，只裁發現物。
    function _mergeDiscoveriesIntoSceneMap(sceneMap, discoveries) {
        if (!sceneMap || !Array.isArray(discoveries) || !discoveries.length) return false;
        if (!Array.isArray(sceneMap.landmarks)) sceneMap.landmarks = [];
        let added = false;
        for (const d of discoveries) {
            if (!d || !d.title) continue;
            if (sceneMap.landmarks.some(l => l.isDiscovery && l.label === d.title)) continue;
            sceneMap.landmarks.push({
                label: d.title, emoji: d.icon || '🔍', description: d.desc || '',
                x: d.x, y: d.y, isDiscovery: true
            });
            added = true;
        }
        const discs = sceneMap.landmarks.filter(l => l.isDiscovery);
        if (discs.length > 6) {
            const drop = new Set(discs.slice(0, discs.length - 6));
            sceneMap.landmarks = sceneMap.landmarks.filter(l => !drop.has(l));
        }
        return added;
    }

    // 🔥 掃描角色 (Hybrid Tag 解析版)
    async function scanForCharacters() {
        if (blockIfPreview('探索此地')) return;
        const btn = document.getElementById('am-scan-btn');
        btn.innerHTML = '<span>📡</span> 掃描中...';
        btn.disabled = true;

        const fac = STATE.activeFacility;
        const _SME = win.SCENE_MAP_ENGINE;
        // 沒生過小地圖 → 這次探索「同一份 AI 回覆」順便把小地圖也要了（不再另打第二次 API）
        //   discoveryOnly＝之前只存過發現物的空圖（場景圖本體沒生成過）→ 照樣要
        const _needScene = !!(fac && (!fac.sceneMap || fac.sceneMap.discoveryOnly) && _SME && typeof _SME.buildScenePrompt === 'function');
        const _zid = STATE.currentZoneId, _fk = STATE.activeFacilityKey;

        // 使用 OS_API
        try {
            let prompt = `請為地點「${fac.name}」生成 2-3 位路人角色與一段環境描寫。`;
            // 🕒 時間一致性：讓 AI 從跑團上下文自己判定當下時段，別生出不合時宜的活動
            prompt += '\n【時間一致性】從對話上下文判斷當前劇情的時段與情境，生成的人物與活動必須符合該時段。';
            // 🧑‍🤝‍🧑 跨設施名冊：同區其他地點已掃出的人物唸給 AI 聽，防撞名/行蹤矛盾（A在食堂吃飯就別在B教室出現）
            try {
                const _zone = WORLD().getZone(_zid);
                const _lines = [];
                if (_zone && _zone.facilities && win.OS_DB) {
                    for (const k of Object.keys(_zone.facilities)) {
                        if (k === _fk) continue;
                        const _saved = await win.OS_DB.getMapFacilityData(_zid, k);
                        if (_saved && Array.isArray(_saved.characters) && _saved.characters.length) {
                            const _list = _saved.characters
                                .filter(c => c && c.name && !c.isResident && !c.isLive)
                                .slice(0, 6)
                                .map(c => c.name + (c.role ? `(${c.role})` : ''))
                                .join('、');
                            if (_list) _lines.push(`${_zone.facilities[k].name || k}：${_list}`);
                        }
                    }
                }
                if (_lines.length) {
                    prompt += '\n【同區域其他地點已知在場人物】\n' + _lines.join('\n') +
                        '\n規則：新生成的角色不得與上述人物同名；若劇情需要提及他們，其行蹤必須與所在地點一致。';
                }
            } catch (e) {}
            if (_needScene) {
                const _sp = _SME.buildScenePrompt(_zid, _fk);   // 把 <scene-map> 生成規則拼進同一次呼叫
                if (_sp) prompt += '\n\n' + _sp;
            }
            const messages = await win.OS_API.buildContext(prompt, 'map_scan');
            // 🔍 探索此地走副模型（Rae：主模型等太久）——工具型生成(路人/環境/小地圖)不需要主模型品質；
            //   舊環境沒 chatSecondary 才退回主模型
            const _dispatch = (typeof win.OS_API.chatSecondary === 'function')
                ? (onFin) => win.OS_API.chatSecondary(messages, null, onFin)
                : (onFin) => win.OS_API.chat(messages, win.OS_SETTINGS.getConfig(), null, onFin);
            _dispatch(async (txt) => {
                let chars = [];
                let intro = [];
                let discoveries = [];

                let cleanText = txt.replace(/<scene-map>[\s\S]*?<\/scene-map>/i, '');   // 剝掉小地圖區塊，免得被當對話播

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

                // 3. 解析 Discoveries [🔍|#1|💊|標題|描述|x:12,y:38]
                //    欄位容錯歸位：AI 常省略#編號、或把 emoji+標題黏一起（跟地標格式看齊）——
                //    錯位會讓標題掉進 emoji 槽(22px大字常駐)、描述掉進短名槽 → 看起來像 popup 沒 toggle。
                const EMOJI_HEAD = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{2300}-\u{23FF}]/u;
                const discRegex = /\[🔍\|([^\]]+)\]/g;
                while ((match = discRegex.exec(txt)) !== null) {
                    cleanText = cleanText.replace(match[0], '');
                    const fields = match[1].split('|').map(s => s.trim()).filter(Boolean);
                    if (fields.length && /^[#＃]?\d+$/.test(fields[0])) fields.shift();   // 掉頭的 #編號 欄
                    // 座標欄可能在任何位置（通常最後）
                    let coords = '';
                    const ci = fields.findIndex(f => /x\s*[:：]\s*\d/i.test(f) && /y\s*[:：]\s*\d/i.test(f));
                    if (ci >= 0) coords = fields.splice(ci, 1)[0];
                    // emoji：獨立欄 or 黏在標題開頭
                    let icon = '🔍';
                    if (fields.length) {
                        const em = String(fields[0]).match(EMOJI_HEAD);
                        if (em) {
                            icon = em[0];
                            const rest = fields[0].slice(em[0].length).trim();
                            if (rest) fields[0] = rest; else fields.shift();
                        }
                    }
                    const title = (fields.shift() || '').trim();
                    if (!title) continue;
                    const desc = fields.join('，').trim();
                    const xm = coords.match(/x\s*[:：]\s*(\d+(?:\.\d+)?)/i);
                    const ym = coords.match(/y\s*[:：]\s*(\d+(?:\.\d+)?)/i);
                    discoveries.push({
                        icon, title, desc,
                        x: xm ? Math.max(0, Math.min(100, parseFloat(xm[1]))) : (Math.floor(Math.random() * 70) + 15),
                        y: ym ? Math.max(0, Math.min(100, parseFloat(ym[1]))) : (Math.floor(Math.random() * 40) + 18)
                    });
                }

                cleanText = cleanText.trim();
                
                // 🔥 將剩下純對話交給大廳播放
                if (cleanText && win.AureliaControlCenter && win.AureliaControlCenter.playIrisSequence) {
                    win.AureliaControlCenter.playIrisSequence(cleanText);
                }
                
                STATE.generatedChars = chars.length > 0 ? chars : [{name:'路人A', role:'居民', dialogue:'...'}];
                STATE.introSegments = intro.length > 0 ? intro : ["環境嘈雜，人來人往..."];

                // 💾 掃描結果落地（治「開場語/路人離開設施就蒸發」——saveMapFacilityData 以前是沒人呼叫的死代碼）
                //    留到下一次掃描覆蓋＝狀態更新才換班；只存真解析結果，不存兜底填充
                if (chars.length || intro.length) {
                    try { await win.OS_DB?.saveMapFacilityData?.(_zid, _fk, { characters: chars, intro: intro }); } catch (e) {}
                }

                renderScanResults();
                btn.disabled = false;

                // 🗺️ 同一份回覆裡的 <scene-map> → 解析＋補底板圖＋存檔；🔍 小發現轉成地標同形狀併進
                //    sceneMap.landmarks（isDiscovery 標記），跟場景圖走同一條持久化管道——
                //    治舊蟲：以前小發現只活在記憶體（saveMapFacilityData 從沒被呼叫），離開設施就蒸發。
                //    （放最後：背景生圖較慢，別擋路人先顯示）
                try {
                    let _sm = (fac && fac.sceneMap) || null;
                    let _fresh = false;
                    if (_needScene && _SME && typeof _SME.applySceneMapFromText === 'function') {
                        // 場景圖重生會換新物件 → 先撈舊圖上的小發現，等下併回來不弄丟
                        const _oldDiscs = (_sm && Array.isArray(_sm.landmarks))
                            ? _sm.landmarks
                                .filter(l => l.isDiscovery && !(l.emoji && [...String(l.emoji)].length > 3))   // 錯位壞資料不搬進新圖
                                .map(l => ({ icon: l.emoji, title: l.label, desc: l.description, x: l.x, y: l.y }))
                            : [];
                        const _gen = await _SME.applySceneMapFromText(_zid, _fk, txt);
                        if (_gen) { _sm = _gen; _fresh = true; discoveries = _oldDiscs.concat(discoveries); }
                    }
                    // 連場景圖都沒有：開一張只有發現物的空圖，標 discoveryOnly 讓下次探索照樣補正圖
                    if (!_sm && discoveries.length) _sm = { backdropPrompt: '', backdropUrl: '', landmarks: [], generatedAt: Date.now(), discoveryOnly: true };
                    if (_sm) {
                        // 🧹 舊壞資料：先前欄位錯位存進來的發現物（emoji 槽塞了整串標題文字）→ 移除，這輪重新收
                        let _cleaned = false;
                        if (Array.isArray(_sm.landmarks)) {
                            const _bad = l => l.isDiscovery && l.emoji && [...String(l.emoji)].length > 3;
                            if (_sm.landmarks.some(_bad)) { _sm.landmarks = _sm.landmarks.filter(l => !_bad(l)); _cleaned = true; }
                        }
                        const _merged = _mergeDiscoveriesIntoSceneMap(_sm, discoveries);
                        if (_merged && _sm.landmarks.some(l => !l.isDiscovery)) delete _sm.discoveryOnly;
                        if (_fresh || _merged || _cleaned) {
                            try { await win.WORLD_RUNTIME?.saveFacilitySceneMap?.(_zid, _fk, _sm); } catch (e) { console.warn('[Map] 小地圖存檔失敗:', e); }
                            renderScanResults();
                        }
                    }
                } catch (e) { console.error('[Map] sceneMap 解析失敗:', e); }
            });
        } catch (e) {
            btn.innerHTML = '失敗';
            btn.disabled = false;
        }
    }

    function openCharacterDetail(idx) {
        const char = STATE.generatedChars[idx];
        const modal = document.getElementById('am-char-modal');
        
        // 替換彈窗內容，加入 char.action (動作描述)
        modal.innerHTML = `
            <div class="am-modal-card" onclick="event.stopPropagation()">
                <div style="padding:20px; text-align:center;">
                    <h3 style="color: #D4AF37; margin: 0 0 5px 0;">${char.name}</h3>
                    <p style="color: #888; font-size: 12px; margin: 0 0 15px 0;">${char.role}</p>
                    
                    <!-- 這裡是新加的動作描述區塊 -->
                    <div style="background: rgba(20,20,20,0.8); border-radius: 6px; padding: 10px; margin-bottom: 15px; border: 1px solid #333;">
                        <p style="color: #aaa; font-style: italic; font-size: 13px; margin: 0;">${char.action || '靜靜地待在這裡'}</p>
                    </div>
                    
                    <!-- 對話區塊 -->
                    <p style="color: #fff; font-size: 14px; line-height: 1.5; margin: 0 0 20px 0;">" ${char.dialogue || '...'} "</p>
                    
                    <div class="am-btn-row">
                        <button class="am-btn-full am-btn-main" onclick="window.AUREALIS_MAP.interactChar(${idx})">搭話</button>
                        <button class="am-btn-full" style="background:#333; color:#aaa;" onclick="window.AUREALIS_MAP.closeModal()">關閉</button>
                    </div>
                </div>
            </div>
        `;
        modal.classList.add('active');
    }

    function interactChar(idx) {
        if (blockIfPreview('搭話')) return;
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
        if (blockIfPreview('刷新情報')) return;
        await generateWorldEvents(true);
    }

    async function clearAllData() {
        STATE.activeEvents = {};
        STATE.generatedChars = [];
        STATE.introSegments = [];
        STATE.lastRefreshTime = 0;
        STATE.pendingEventKey = null;
        STATE.activeCharIndex = -1;
        if (win.OS_DB) {
            try { await win.OS_DB.clearAllMapData(); } catch (e) {}
        }
        alert('已清空地圖數據');
        renderHome();
    }

    // 訂閱世界容器變動 → 自動重渲染
    if (win.WORLD_RUNTIME && typeof win.WORLD_RUNTIME.onChange === 'function') {
        win.WORLD_RUNTIME.onChange(() => {
            if (STATE.container) {
                updatePreviewBanner();
                if (STATE.view === 'home') renderHome();
            }
        });
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
        initCurrentWorld,
        useAurealisFallback,
        generateSchedules,
        _switchScheduleTab,
        _regenerateSchedules,
        showWorldManager,
        showMapSettings,
        _mapSaveSettings,
        exitPreview: exitPreviewMap,
        _previewWorld,
        _deleteWorld,
        _wipeAllDynamicWorlds,
        clearAllData,
        // console 診斷用（無 F12 環境）：底板→可站遮罩 / 白率打分
        buildBackdropMask: _buildBackdropMask,
        bdWhiteRatio: _bdWhiteRatio,
    };

    // 🔥 註冊到 OS 系統
    win.OS_MAP = { launchApp: launchMap };
})();