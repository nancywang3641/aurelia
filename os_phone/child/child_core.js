// ----------------------------------------------------------------
// [檔案] child_core.js (V4.7 - 歷史紀錄與成長軌跡修復版)
// 路徑：os_phone/child/child_core.js
// 職責：AI 育兒系統主面板
// 修正：修復 eventHistory 遺失事件上下文與玩家選擇的問題，為 AI 成長推演提供完整語境。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入育兒系統 (V4.7 Event History Fix Edition)...');
    const win = window.parent || window;

    const CHILD_BGM_URL = 'https://nancywang3641.github.io/aurelia/bgm/our_love.mp3';
    let childBgm = null;

    // === 1. 系統狀態與數據庫 (STATE & DB) ===

    // 成長速度設定
    const GROWTH_MODES = {
        light:  { label: '輕養成',  expMax: 60,  outingExp: 45, desc: '主玩VN，一場外出近乎升一歲' },
        normal: { label: '標準',    expMax: 100, outingExp: 35, desc: '均衡，事件＋外出搭配升級' },
        deep:   { label: '深度養成', expMax: 200, outingExp: 25, desc: '喜歡磨事件的玩法' }
    };
    function getExpMax() { return GROWTH_MODES[STATE.growthMode]?.expMax ?? 100; }
    function getOutingExp() { return GROWTH_MODES[STATE.growthMode]?.outingExp ?? 35; }

    let STATE = {
        isInitialized: false,
        children: [],
        currentChildId: null,
        currentView: 'list',
        typingTimer: null,
        vnQueue: [],
        isTyping: false,
        currentVnMsg: null,
        bgmEnabled: true,
        growthMode: localStorage.getItem('cc_growth_mode') || 'normal'
    };

    function loadDB() {
        try {
            const data = localStorage.getItem('os_child_db_v2');
            if (data) {
                STATE.children = JSON.parse(data);
                STATE.children.forEach(c => {
                    // 遷移：如果 localStorage 仍有舊的 chatHistory，搬至 IDB 後清除
                    if (c.chatHistory && c.chatHistory.length > 0 && win.OS_DB) {
                        win.OS_DB.saveChildChatHistory(c.id, c.chatHistory).catch(e => console.warn('[Child] 遷移聊天記錄失敗', e));
                    }
                    c.chatHistory = []; // 執行期暫為空，enterRoom 時從 IDB 載入
                    if (!c.eventHistory) c.eventHistory = []; 
                    if (!c.gender) c.gender = "未知";
                    if (!c.height) c.height = "成長中";
                    if (!c.weight) c.weight = "成長中";
                    if (!c.birthday) c.birthday = "未知";
                    if (!c.personality) c.personality = "乖巧";
                    if (!c.potential) c.potential = "尚未展現。"; 
                    if (!c.originStory) c.originStory = "這是一個充滿愛的家庭誕生的奇蹟。"; 
                    if (!c.father) c.father = "未知"; 
                    if (!c.mother) c.mother = "未知"; 
                    if (!c.playerRole) c.playerRole = "雙親之一"; 
                    if (!c.worldState) c.worldState = "世界依舊平靜。";
                    if (!c.parentsStatus) c.parentsStatus = "雙親狀態未紀錄。";
                    if (!c.marriage) c.marriage = '';
                    if (!c.familyViews) c.familyViews = '';
                    if (!c.childExpectations) c.childExpectations = '';
                    if (!c.coupleCore) c.coupleCore = '';
                    if (!c.imgPrompt) c.imgPrompt = '';
                    if (!c.room_bg_prompt) c.room_bg_prompt = '';
                    if (c.background && typeof c.background === 'string' && c.background.startsWith('data:')) {
                        c.hasBg = true; 
                    } else if (c.hasBg === undefined) {
                        c.hasBg = false;
                    }
                });
            }
        } catch (e) { console.warn("Load DB Error:", e); }
        STATE.isInitialized = true;
    }

    function saveDB() {
        const cleaned = STATE.children.map(c => {
            // 排除 background（大圖）和 chatHistory（已遷移至 IDB）
            const { background, chatHistory, ...rest } = c;
            return rest;
        });
        localStorage.setItem('os_child_db_v2', JSON.stringify(cleaned));
        STATE.children.forEach(c => { delete c.background; });
    }

    async function migrateBackgroundsToIDB() {
        if (!win.OS_DB) return;
        let raw = [];
        try { raw = JSON.parse(localStorage.getItem('os_child_db_v2') || '[]'); } catch(e) { return; }
        let migrated = false;
        for (const c of raw) {
            if (c.background && typeof c.background === 'string' && c.background.startsWith('data:')) {
                try {
                    await win.OS_DB.saveChildBg(c.id, c.background);
                    const target = STATE.children.find(x => x.id === c.id);
                    if (target) target.hasBg = true;
                    migrated = true;
                    console.log(`[Child Core] ✅ 已遷移 ${c.id} 的背景圖至 IndexedDB`);
                } catch (e) {
                    console.warn(`[Child Core] 背景遷移失敗 (${c.id}):`, e);
                }
            }
        }
        if (migrated) saveDB(); 
    }

    function getCurrentChild() {
        return STATE.children.find(c => c.id === STATE.currentChildId);
    }

    function getGrowthStage(age) {
        if (age <= 6) return "幼童";
        else if (age <= 12) return "兒童";
        else if (age <= 17) return "青少年";
        else return "成年";
    }

    function getStageRules(stage) {
        if (stage === "幼童") {
            return "【階段防護限制-幼童(學齡前)】：絕對禁止表現出成人思維或高智商。大腦還在發育，詞彙極少，會用疊字、發音不清，只能表達簡單生理需求與情緒。無複雜邏輯、無成語。動作笨拙可愛，可能會搗蛋惹麻煩，完全不懂複雜的人情世故。";
        } else if (stage === "兒童") {
            return "【階段防護限制-兒童(小學生)】：能正常對話，思維充滿童真與想像力，活潑稚氣，喜歡問「為什麼」。禁止使用深奧、文言或成人的複雜詞彙，禁止表現得比成年人還聰明。";
        } else if (stage === "青少年") {
            return "【階段防護限制-青少年(中學生)】：進入青春期，思維開始成熟。可能帶有叛逆、敏感、愛面子或獨立思考的特質，用語有學生氣息，不再有幼童稚氣。";
        } else {
            return "【階段防護限制-成年(社會人)】：思維成熟，具備成人的邏輯與理解能力，對話符合職業與背景的成人口吻，懂得克制與表達。";
        }
    }

    async function saveAvatarToLorebook(name, url) {
        if (!win.TavernHelper) return;
        const charLbs = win.TavernHelper.getCharLorebooks ? win.TavernHelper.getCharLorebooks() : null;
        const lorebookName = charLbs && charLbs.primary ? charLbs.primary : null;
        if (!lorebookName) { console.warn('[Child Core] 找不到當前角色主世界書，跳過頭像同步。'); return; }
        const entryComment = '【素材-隨機頭像素材】';
        const appendText = `${name}:${url}`;

        try {
            const entries = await win.TavernHelper.getLorebookEntries(lorebookName);
            let targetEntry = entries ? entries.find(e => e.comment === entryComment) : null;

            if (targetEntry) {
                if (targetEntry.content && targetEntry.content.includes(`${name}:`)) {
                    console.log(`[Child Core] ${name} 的頭像已存在於素材庫中，跳過。`);
                    return;
                }
                const newContent = targetEntry.content ? (targetEntry.content + '\n' + appendText) : appendText;
                await win.TavernHelper.setLorebookEntries(lorebookName, [{ uid: targetEntry.uid, content: newContent }]);
            } else {
                await win.TavernHelper.createLorebookEntries(lorebookName, [{
                    comment: entryComment,
                    content: appendText,
                    key: ['隨機頭像素材_KEY_DO_NOT_TRIGGER'],
                    enabled: true
                }]);
            }
            console.log(`[Child Core] ✅ 成功將 ${name} 的頭像同步至世界書素材庫！`);
        } catch (e) {
            console.error('[Child Core] 同步頭像至世界書失敗', e);
        }
    }

    async function saveChildLoreToLorebook(child) {
        if (!win.TavernHelper) return;
        const charLbs = win.TavernHelper.getCharLorebooks ? win.TavernHelper.getCharLorebooks() : null;
        const lorebookName = charLbs && charLbs.primary ? charLbs.primary : null;
        if (!lorebookName) { console.warn('[Child Core] 找不到當前角色主世界書，跳過 Lore 同步。'); return; }

        const entryComment = `【角色-${child.name}】`;
        const stage = getGrowthStage(child.age);

        const stats = child.stats || {};
        const lines = [
            `【角色資料：${child.name}】`,
            `性別：${child.gender}　年齡：${child.age} 歲　成長階段：${stage}`,
            `身高 / 體重：${child.height} / ${child.weight}　生日：${child.birthday}`,
            `雙親：父親「${child.father}」　母親「${child.mother}」（已婚夫妻）`,
            `玩家身分：${child.playerRole || '雙親之一'}`,
            ``,
            `【能力值】智力(INT)：${stats.int ?? '?'}　體力(STR)：${stats.str ?? '?'}　壓力(Stress)：${stats.stress ?? 0}`,
            ``,
            `【基礎性格】${child.personality || '未知'}`,
            `【開發潛能】${(child.potential || '尚未展現').replace(/\\n/g, '\n')}`,
            `【外貌描述】${child.desc || ''}`,
            ``,
            `【家族緣起】${(child.originStory || '').replace(/\\n/g, '\n')}`,
            `【世界變遷】${(child.worldState || '').replace(/\\n/g, '\n')}`,
            `【雙親現狀】${(child.parentsStatus || '').replace(/\\n/g, '\n')}`,
            `【關係核心】${(child.coupleCore || '').replace(/\\n/g, '\n')}`,
            `【結合方式】${(child.marriage || '').replace(/\\n/g, '\n')}`,
            `【雙方家族態度】${(child.familyViews || '').replace(/\\n/g, '\n')}`,
            `【雙親對孩子的期望】${(child.childExpectations || '').replace(/\\n/g, '\n')}`,
        ];
        const content = lines.join('\n').trim();

        try {
            const entries = await win.TavernHelper.getLorebookEntries(lorebookName);
            const targetEntry = entries ? entries.find(e => e.comment === entryComment) : null;
            if (targetEntry) {
                await win.TavernHelper.setLorebookEntries(lorebookName, [{ uid: targetEntry.uid, content, keys: [child.name] }]);
                console.log(`[Child Core] ✅ 已更新 ${child.name} 的世界書角色條目`);
            } else {
                await win.TavernHelper.createLorebookEntries(lorebookName, [{
                    comment: entryComment,
                    content,
                    keys: [child.name],
                    enabled: true
                }]);
                console.log(`[Child Core] ✅ 已建立 ${child.name} 的世界書角色條目（KEY: ${child.name}）`);
            }
        } catch (e) {
            console.error('[Child Core] 同步角色 Lore 至世界書失敗', e);
        }
    }

    // === 2. 樣式定義 (CSS) ===
    const appStyle = `
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&display=swap');

        :root {
            --cc-primary: #ff7e67;    
            --cc-secondary: #ffb471;  
            --cc-bg-top: #fdfbfb;     
            --cc-bg-bottom: #ebedee;  
            --cc-text: #4e342e;       
            --cc-glass: rgba(255, 255, 255, 0.85); 
            --cc-glass-border: rgba(255, 255, 255, 0.6);
        }

        .cc-container { width: 100%; height: 100%; background: linear-gradient(135deg, var(--cc-bg-top) 0%, var(--cc-bg-bottom) 100%); color: var(--cc-text); display: flex; flex-direction: column; overflow: hidden; font-family: 'Noto Sans TC', sans-serif; position: relative; }
        
        .cc-header { padding: 14px 20px; background: linear-gradient(90deg, var(--cc-primary), var(--cc-secondary)); color: white; display: flex; align-items: center; justify-content: space-between; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(255, 126, 103, 0.3); z-index: 30; flex-shrink: 0; border-bottom: 1px solid rgba(255,255,255,0.2); }
        .cc-btn-icon { font-size: 18px; cursor: pointer; background: rgba(255,255,255,0.25); border: 1px solid rgba(255,255,255,0.5); color: white; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .cc-btn-icon:hover { background: white; color: var(--cc-primary); transform: scale(1.1); box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .cc-music-toggle { font-size: 18px; cursor: pointer; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; transition: all 0.3s; color: rgba(255,255,255,0.5); }
        .cc-music-toggle.active { color: white; background: rgba(255,255,255,0.35); box-shadow: 0 0 10px rgba(255,255,255,0.3); }
        .cc-music-toggle:hover { transform: scale(1.1); }

        .cc-list-view { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 18px; }
        .cc-child-card { background: var(--cc-glass); backdrop-filter: blur(15px); border: 1px solid var(--cc-glass-border); border-radius: 20px; padding: 18px; display: flex; align-items: center; gap: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); transition: all 0.3s ease; position: relative; overflow: hidden; }
        .cc-child-card::before { content: ''; position: absolute; top: 0; left: 0; width: 5px; height: 100%; background: linear-gradient(to bottom, var(--cc-primary), var(--cc-secondary)); }
        .cc-child-card:hover { transform: translateY(-5px); box-shadow: 0 15px 35px rgba(255, 126, 103, 0.15); border-color: white; }
        .cc-card-img { width: 75px; height: 75px; object-fit: cover; border-radius: 50%; border: 4px solid white; background: #fff; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
        .cc-card-info { flex: 1; }
        .cc-card-name { font-size: 17px; font-weight: bold; color: var(--cc-primary); margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
        .cc-card-desc { font-size: 12px; color: #666; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5; margin-bottom: 2px; }
        .cc-card-actions { display: flex; flex-direction: column; gap: 10px; }
        .cc-btn-enter { background: linear-gradient(135deg, var(--cc-primary), var(--cc-secondary)); color: white; border: none; padding: 8px 18px; border-radius: 25px; font-size: 12px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(255, 126, 103, 0.35); transition: all 0.2s; }
        .cc-btn-enter:hover { transform: scale(1.05); filter: brightness(1.05); }
        .cc-btn-delete { background: transparent; color: #e53935; border: 1px solid #e53935; padding: 6px 15px; border-radius: 25px; font-size: 11px; cursor: pointer; transition: 0.2s; }
        .cc-btn-delete:hover { background: #e53935; color: white; }
        .cc-empty-state { text-align: center; color: #888; margin-top: 60px; font-size: 15px; display: flex; flex-direction: column; align-items: center; gap: 18px; }
        .cc-btn-add { background: linear-gradient(135deg, #4ea8de, #56cfe1); color: white; border: none; padding: 14px 35px; border-radius: 35px; font-size: 15px; font-weight: bold; cursor: pointer; box-shadow: 0 6px 20px rgba(78, 168, 222, 0.4); transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .cc-btn-add:hover { transform: scale(1.05) translateY(-2px); }

        .cc-setup-area { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; padding: 25px 20px; text-align: center; overflow-y: auto; background: rgba(255,255,255,0.6); backdrop-filter: blur(8px); }
        .setup-title { font-size: 24px; font-weight: bold; color: var(--cc-primary); margin-bottom: 8px; margin-top: 10px; text-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .setup-desc { font-size: 13px; color: #666; margin-bottom: 25px; line-height: 1.6; padding: 0 15px; }
        .setup-input-group { width: 95%; margin-bottom: 15px; text-align: left; background: white; padding: 15px; border-radius: 16px; box-shadow: 0 5px 15px rgba(0,0,0,0.04); border: 1px solid #f0f0f0; }
        .setup-input-group label { display: block; font-weight: bold; margin-bottom: 10px; color: var(--cc-primary); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
        .setup-input { width: 100%; padding: 12px; border: 2px solid #f0f0f0; border-radius: 10px; font-size: 14px; outline: none; background: #fafafa; box-sizing: border-box; transition: all 0.3s; }
        textarea.setup-input { height: 80px; resize: none; font-family: inherit; }
        .setup-input:focus { border-color: var(--cc-secondary); background: white; box-shadow: 0 0 0 3px rgba(255, 180, 113, 0.15); }
        .setup-row { display: flex; gap: 12px; width: 95%; margin-bottom: 15px; }
        .setup-row .setup-input-group { width: 50%; margin-bottom: 0; }
        .btn-generate { background: linear-gradient(135deg, var(--cc-primary), var(--cc-secondary)); color: white; border: none; padding: 16px 45px; margin-top: 15px; margin-bottom: 40px; border-radius: 35px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 8px 25px rgba(255, 126, 103, 0.4); transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); flex-shrink:0; }
        .btn-generate:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 12px 30px rgba(255, 126, 103, 0.5); }

        .cc-main-room { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; padding-bottom: 60px; background-size: cover; background-position: center; transition: background 0.5s ease; }
        
        /* 數值面板優化 */
        .cc-stats-area { margin: 15px; padding: 15px 20px; background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(15px); border-radius: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); z-index: 5; border: 1px solid rgba(255,255,255,0.8); }
        .stat-item { display: flex; flex-direction: column; font-size: 12px; font-weight: bold; color: #555; }
        .stat-bar-bg { width: 100%; height: 8px; background: #e9ecef; border-radius: 4px; margin-top: 6px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1); }
        .stat-bar-fill { height: 100%; border-radius: 4px; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
        .fill-int { background: linear-gradient(90deg, #4ea8de, #56cfe1); box-shadow: 0 0 10px rgba(86, 207, 225, 0.5); } 
        .fill-str { background: linear-gradient(90deg, #ff8a65, #ffb74d); box-shadow: 0 0 10px rgba(255, 183, 77, 0.5); } 
        .fill-stress { background: linear-gradient(90deg, #b39ddb, #ce93d8); box-shadow: 0 0 10px rgba(206, 147, 216, 0.5); } 
        .fill-exp { background: linear-gradient(90deg, #81c784, #aed581); box-shadow: 0 0 10px rgba(174, 213, 129, 0.5); }

        /* 浮動立繪 */
        .cc-char-area { flex: 1; display: flex; justify-content: center; align-items: center; position: relative; overflow: hidden; z-index: 1; }
        .cc-char-frame { display: inline-flex; max-height: 58%; max-width: 52%; animation: floatAvatar 6s ease-in-out infinite; cursor: pointer; transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .cc-char-frame:active { transform: scale(0.96); animation: none; }
        .cc-char-img { max-height: 100%; max-width: 100%; width: auto; height: auto; object-fit: contain; display: block; border-radius: 24px; box-shadow: 0 8px 32px rgba(0,0,0,0.28), 0 0 0 3px rgba(255,255,255,0.6); }
        @keyframes floatAvatar { 0% { transform: translateY(0px); } 50% { transform: translateY(-15px); } 100% { transform: translateY(0px); } }
        
        /* VN 對話框升級 */
        .cc-vn-wrapper { position: absolute; bottom: 85px; left: 15px; right: 15px; z-index: 10; pointer-events: none; }
        .cc-vn-box { background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(15px); border: 1px solid white; border-radius: 20px; padding: 25px 20px 18px 20px; min-height: 75px; box-shadow: 0 15px 35px rgba(0,0,0,0.15); position: relative; pointer-events: auto; cursor: pointer; user-select: none; transition: all 0.2s; }
        .cc-vn-box:active { transform: scale(0.98); background: rgba(255, 255, 255, 0.98); }
        .cc-vn-name { position: absolute; top: -16px; left: 20px; background: linear-gradient(135deg, var(--cc-primary), var(--cc-secondary)); color: white; padding: 6px 20px; border-radius: 12px 12px 12px 0; font-weight: bold; font-size: 13px; box-shadow: 0 5px 15px rgba(255, 126, 103, 0.4); letter-spacing: 1px; transition: opacity 0.2s; border: 1px solid rgba(255,255,255,0.4); }
        .cc-vn-text { font-size: 14px; line-height: 1.7; color: #333; font-weight: 500; }
        
        @keyframes cc-blink { 0%, 100% { opacity: 1; transform: translateY(0); } 50% { opacity: 0; transform: translateY(3px); } }
        .cc-vn-next { display: none; position: absolute; bottom: 10px; right: 18px; font-size: 14px; color: var(--cc-primary); animation: cc-blink 1.5s infinite; }

        /* 右側動作按鈕 */
        .cc-action-area { position: absolute; bottom: 95px; right: 15px; display: flex; flex-direction: column; gap: 12px; z-index: 25; }
        .action-btn { width: 48px; height: 48px; border: 2px solid white; border-radius: 50%; font-size: 20px; display: flex; align-items: center; justify-content: center; color: white; cursor: pointer; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); box-shadow: 0 6px 20px rgba(0,0,0,0.2); }
        .action-btn:hover { transform: scale(1.15) rotate(5deg); box-shadow: 0 8px 25px rgba(0,0,0,0.3); }
        .action-btn:active { transform: scale(0.95); }
        .btn-study { background: linear-gradient(135deg, #4ea8de, #0077b6); } 
        .btn-exercise { background: linear-gradient(135deg, #ff8a65, #d84315); } 
        .btn-rest { background: linear-gradient(135deg, #b39ddb, #6a1b9a); } 
        .btn-outing { background: linear-gradient(135deg, #81c784, #2e7d32); }

        /* 歷史對話面板 */
        .cc-hist-controls { display: flex; justify-content: space-between; align-items: center; padding: 8px 0 12px; border-bottom: 1px solid #f0f0f0; margin-bottom: 10px; flex-shrink: 0; }
        .cc-hist-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px dashed #f0f0f0; }
        .cc-hist-item:last-child { border-bottom: none; }
        .cc-hist-cb { margin-top: 3px; accent-color: var(--cc-primary); flex-shrink: 0; width: 16px; height: 16px; cursor: pointer; }
        .cc-hist-bubble { flex: 1; font-size: 12px; line-height: 1.55; }
        .cc-hist-sender { font-weight: bold; font-size: 11px; margin-bottom: 3px; }
        .cc-hist-sender.user { color: #0077b6; }
        .cc-hist-sender.ai { color: var(--cc-primary); }
        .cc-hist-text { color: #444; background: #f8f8f8; border-radius: 10px; padding: 6px 10px; white-space: pre-wrap; word-break: break-all; }
        .cc-hist-del-btn { width: 100%; padding: 12px; border-radius: 12px; border: none; background: linear-gradient(135deg, #ff7e67, #ff5252); color: white; font-weight: bold; font-size: 14px; cursor: pointer; margin-top: 10px; flex-shrink: 0; transition: 0.2s; }
        .cc-hist-del-btn:hover { filter: brightness(1.08); }
        .cc-hist-empty { text-align: center; color: #aaa; font-size: 13px; padding: 30px 0; }

        /* 底部對話輸入條 */
        .cc-chat-bar { position: absolute; bottom: 0; left: 0; width: 100%; height: 65px; background: rgba(255,255,255,0.95); backdrop-filter: blur(15px); border-top: 1px solid rgba(0,0,0,0.05); display: flex; align-items: center; padding: 0 15px; z-index: 15; box-sizing: border-box; gap: 12px; box-shadow: 0 -5px 20px rgba(0,0,0,0.05); }
        .cc-input { flex: 1; background: #f0f2f5; border: 1px solid #e4e6e9; color: #333; padding: 14px 20px; border-radius: 30px; font-size: 14px; outline: none; transition: all 0.3s; }
        .cc-input:focus { background: white; border-color: var(--cc-primary); box-shadow: 0 0 0 3px rgba(255, 126, 103, 0.15); }
        .cc-send-btn { width: 42px; height: 42px; background: linear-gradient(135deg, var(--cc-primary), var(--cc-secondary)); border-radius: 50%; border: none; color: white; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; box-shadow: 0 4px 15px rgba(255, 126, 103, 0.4); transition: all 0.2s; }
        .cc-send-btn:active { transform: scale(0.9); }

        /* 彈出資訊面板 */
        .cc-overlay-panel { background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(20px); padding: 25px 20px; border-radius: 24px; width: 88%; max-width: 340px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.95); opacity: 0; pointer-events: none; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index: 100; box-shadow: 0 25px 60px rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.8); max-height: 85%; display: flex; flex-direction: column; }
        .cc-overlay-panel.active { transform: translate(-50%, -50%) scale(1); opacity: 1; pointer-events: auto; }
        .cc-overlay-scroll { overflow-y: auto; padding-right: 5px; flex: 1; }
        .cc-overlay-close { position: absolute; top: 15px; right: 15px; color: #999; cursor: pointer; font-size: 18px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: #f5f5f5; border-radius: 50%; transition: all 0.2s; z-index: 10; border: 1px solid #eee; }
        .cc-overlay-close:hover { background: #feebeb; color: #e53935; border-color: #ffcdd2; transform: rotate(90deg); }
        
        .cc-overlay-title { text-align: center; color: var(--cc-primary); font-weight: bold; font-size: 19px; margin-bottom: 20px; flex-shrink: 0; letter-spacing: 1px; }
        
        .cc-info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px dashed #e0e0e0; font-size: 13px; }
        .cc-info-label { color: #777; font-weight: bold; flex-shrink:0; margin-right:10px; }
        .cc-info-val { color: #222; font-weight: 600; text-align: right; word-break: break-all; }
        .cc-info-desc { margin-top: 15px; padding: 14px; background: #f8f9fa; border-radius: 12px; font-size: 13px; color: #444; line-height: 1.6; border: 1px solid #eee; }
        .cc-tab-bar { display: flex; gap: 6px; margin-bottom: 18px; flex-shrink: 0; background: #f0f2f5; border-radius: 12px; padding: 5px; }
        .cc-tab-btn { flex: 1; padding: 8px 4px; border: none; border-radius: 8px; font-size: 12px; font-weight: bold; cursor: pointer; background: transparent; color: #777; transition: all 0.2s; }
        .cc-tab-btn.active { background: white; color: var(--cc-primary); box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
        .cc-tab-content { display: none; animation: fadeIn 0.3s ease; }
        .cc-tab-content.active { display: block; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        
        .cc-bg-upload-area { border: 2px dashed #ffb471; border-radius: 16px; padding: 30px 15px; text-align: center; cursor: pointer; transition: all 0.3s; background: rgba(255, 180, 113, 0.05); margin-bottom: 15px; }
        .cc-bg-upload-area:hover { background: rgba(255, 180, 113, 0.15); border-color: var(--cc-primary); transform: scale(1.02); }
        .cc-bg-preview-box { width: 100%; aspect-ratio: 16/9; border-radius: 12px; border: 1px solid #ddd; overflow: hidden; background: #f5f5f5; position: relative; margin-bottom: 15px; box-shadow: inset 0 2px 5px rgba(0,0,0,0.05); }
        .cc-bg-preview-box img { width: 100%; height: 100%; object-fit: cover; }
        .cc-btn-danger { width: 100%; padding: 14px; background: #fff0f0; color: #d32f2f; border: 1px solid #ffcdd2; border-radius: 12px; font-weight: bold; cursor: pointer; font-size: 14px; transition: all 0.2s; }
        .cc-btn-danger:hover { background: #ffebee; border-color: #ef5350; box-shadow: 0 4px 10px rgba(211, 47, 47, 0.1); }
        .cc-settings-section { margin-top: 18px; padding-top: 15px; border-top: 1px solid #f0f0f0; }
        .cc-settings-label { font-size: 12px; font-weight: bold; color: var(--cc-primary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: block; }
        .cc-settings-textarea { width: 100%; padding: 10px 12px; border: 1.5px solid #f0e0d0 !important; border-radius: 10px; font-size: 12px; font-family: monospace; background: #fafafa !important; color: #444 !important; resize: vertical; min-height: 56px; box-sizing: border-box; outline: none; transition: border-color 0.2s; line-height: 1.5; }
        .cc-settings-textarea:focus { border-color: var(--cc-secondary) !important; background: #fff !important; color: #333 !important; }
        .cc-settings-btn-row { display: flex; gap: 8px; margin-top: 8px; }
        .cc-settings-btn { flex: 1; padding: 10px; border-radius: 10px; font-size: 12px; font-weight: bold; cursor: pointer; border: 1.5px solid; transition: all 0.2s; }
        .cc-settings-btn.save { background: #fff8f0; color: var(--cc-primary); border-color: #ffb471; }
        .cc-settings-btn.save:hover { background: var(--cc-primary); color: white; }
        .cc-settings-btn.regen { background: #f0f8ff; color: #0077b6; border-color: #4ea8de; }
        .cc-settings-btn.regen:hover { background: #0077b6; color: white; }

        /* Modal (選項與提示框) */
        .cc-modal-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.65); backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; z-index: 200; }
        .cc-modal-layer.active { opacity: 1; pointer-events: auto; }
        .cc-modal { width: 88%; max-width: 340px; max-height: 80%; background: white; border-radius: 24px; padding: 25px; display: flex; flex-direction: column; gap: 18px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); overflow-y: auto; text-align: center; border: 1px solid rgba(255,255,255,0.8); transform: scale(0.95); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .cc-modal-layer.active .cc-modal { transform: scale(1); }
        .modal-title { font-size: 21px; font-weight: bold; color: var(--cc-primary); border-bottom: 2px solid #fff3e0; padding-bottom: 12px; margin-bottom: 5px; }
        .modal-desc { font-size: 14px; color: #444; line-height: 1.6; background: #f8f9fa; padding: 18px; border-radius: 16px; text-align: left; border: 1px solid #eee; }
        .modal-option { padding: 15px; background: #fff8f0; border: 1px solid #ffe0b2; border-radius: 16px; cursor: pointer; font-size: 15px; font-weight: bold; color: var(--cc-text); transition: all 0.2s; display:flex; flex-direction:column; gap:6px; text-align: left; }
        .modal-option:hover { background: var(--cc-primary); color: white; border-color: var(--cc-primary); transform: translateY(-3px); box-shadow: 0 8px 20px rgba(255, 126, 103, 0.3); }
        .modal-option:hover > div { color: white !important; }
        .loading-text { text-align: center; color: #777; font-style: italic; font-size: 14px; line-height: 1.6; padding: 20px 0; }
    `;

    // === 3. 初始化與視圖切換 ===
    let rootContainer = null;

    function launchApp(container) {
        rootContainer = container;
        if (!document.getElementById('cc-style')) {
            const styleEle = document.createElement('style');
            styleEle.id = 'cc-style';
            styleEle.innerHTML = appStyle;
            document.head.appendChild(styleEle);
        }
        
        loadDB();
        migrateBackgroundsToIDB();
        // 延遲同步所有孩子的世界書條目 KEY（修正舊版未設 key 的條目）
        setTimeout(() => {
            if (STATE.children.length > 0) {
                STATE.children.forEach(c => saveChildLoreToLorebook(c));
                console.log(`[Child Core] 🔄 已觸發所有孩子(${STATE.children.length}筆)的世界書 KEY 同步`);
            }
        }, 3000);
        STATE.currentView = STATE.children.length === 0 ? 'setup' : 'list';
        renderView();
        startChildBgm();
    }

    function renderView() {
        if (STATE.currentView === 'list') renderListView();
        else if (STATE.currentView === 'setup') renderSetupScreen();
        else if (STATE.currentView === 'room') renderRoomView();
    }

    function goToList() { STATE.currentView = 'list'; STATE.currentChildId = null; renderView(); }
    function goToSetup() { STATE.currentView = 'setup'; renderView(); }
    async function enterRoom(id) {
        STATE.currentChildId = id;
        STATE.currentView = 'room';
        const child = STATE.children.find(c => c.id === id);
        if (child && win.OS_DB) {
            child.chatHistory = await win.OS_DB.getChildChatHistory(id).catch(() => []);
        }
        renderView();
    }

    function safeExtractJson(apiRes) {
        if (!apiRes) throw new Error("API 回傳了空值。請檢查連線狀態。");
        let rawText = (typeof apiRes === 'string') ? apiRes : (apiRes.text || apiRes.content || JSON.stringify(apiRes));
        let cleanText = rawText.replace(/```[a-zA-Z]*\n/g, "").replace(/```/g, "").trim();
        
        const startIndex = cleanText.indexOf('{');
        const endIndex = cleanText.lastIndexOf('}');
        if (startIndex !== -1 && endIndex !== -1) {
            cleanText = cleanText.substring(startIndex, endIndex + 1);
        }
        
        return JSON.parse(cleanText);
    }

    // === 4. 各大視圖渲染 ===

    function renderListView() {
        let html = `
            <div class="cc-container">
                <div class="cc-header">
                    <button class="cc-btn-icon" onclick="window.PhoneSystem.goHome()">❮</button>
                    <span>我的家庭</span>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <div id="cc-music-btn" class="cc-music-toggle ${STATE.bgmEnabled ? 'active' : ''}" onclick="window.CHILD_CORE.toggleMusic()" title="切換 BGM">🎵</div>
                        <button class="cc-btn-icon" style="background:transparent; border:none; font-size: 22px; font-weight: normal;" onclick="window.CHILD_CORE.goToSetup()">+</button>
                    </div>
                </div>
                <div class="cc-list-view">
        `;

        if (STATE.children.length === 0) {
            html += `
                <div class="cc-empty-state">
                    <div style="font-size: 60px; filter: drop-shadow(0 10px 10px rgba(0,0,0,0.1));">🧸</div>
                    <div style="color:#555; font-weight:bold; font-size: 18px;">這裡還空空如也</div>
                    <div style="font-size: 13px; color: #888; margin-top:-10px; margin-bottom:10px;">準備好迎接新生命了嗎？</div>
                    <button class="cc-btn-add" onclick="window.CHILD_CORE.goToSetup()">領養新寶寶</button>
                </div>
            `;
        } else {
            STATE.children.forEach(child => {
                const sexIcon = child.gender === '男' ? '👦' : child.gender === '女' ? '👧' : '🧒';
                const stage = getGrowthStage(child.age);
                
                const statusTexts = [
                    "正在房間裡打滾...", "看起來有點無聊。", "偷偷看著窗外。", "似乎在思考人生。", "剛睡醒，還在揉眼睛。"
                ];
                const dynamicStatus = statusTexts[Math.floor(Math.random() * statusTexts.length)];

                html += `
                    <div class="cc-child-card">
                        <img src="${child.imageUrl}" class="cc-card-img" onerror="this.src='https://files.catbox.moe/k2n32k.png'">
                        <div class="cc-card-info">
                            <div class="cc-card-name">${child.name} <span style="font-size:12px; background:rgba(0,0,0,0.05); padding:2px 8px; border-radius:10px; color:#555;">${sexIcon} Lv.${child.age}</span></div>
                            <div class="cc-card-desc" style="color:var(--cc-primary); margin-bottom:4px; font-weight:bold;">[${stage}] ${child.playerRole || '家長'}視角</div>
                            <div class="cc-card-desc"><b>當前狀態：</b>${dynamicStatus}</div>
                        </div>
                        <div class="cc-card-actions">
                            <button class="cc-btn-enter" onclick="window.CHILD_CORE.enterRoom('${child.id}')">進入房間</button>
                            <button class="cc-btn-delete" onclick="window.CHILD_CORE.deleteChild('${child.id}')">送走</button>
                        </div>
                    </div>
                `;
            });
            html += `<div style="text-align:center; margin-top:25px;"><button class="cc-btn-add" onclick="window.CHILD_CORE.goToSetup()">+ 迎接新生命</button></div>`;
        }
        html += `</div></div>`;
        rootContainer.innerHTML = html;
    }

    function renderSetupScreen() {
        const showBack = STATE.children.length > 0;
        rootContainer.innerHTML = `
            <div class="cc-container">
                <div class="cc-header">
                    ${showBack ? '<button class="cc-btn-icon" onclick="window.CHILD_CORE.goToList()">❮</button>' : '<button class="cc-btn-icon" onclick="window.PhoneSystem.goHome()">❮</button>'}
                    <span>基因沙盒 (Gene Sandbox)</span>
                    <div id="cc-music-btn" class="cc-music-toggle ${STATE.bgmEnabled ? 'active' : ''}" onclick="window.CHILD_CORE.toggleMusic()" title="切換 BGM">🎵</div>
                </div>
                <div class="cc-setup-area">
                    <div class="setup-title">🧬 未來篇・生命演算</div>
                    <div class="setup-desc">設定雙親與時間推移，AI 將算好未來的世界格局與雙親感情現況，並生成屬於你們的真實幼兒！</div>
                    
                    <div class="setup-row">
                        <div class="setup-input-group"><label>父親名字 (可選)</label><input type="text" id="input-father" class="setup-input" placeholder="例如: 雷伊"></div>
                        <div class="setup-input-group"><label>母親名字 (可選)</label><input type="text" id="input-mother" class="setup-input" placeholder="例如: 肯特"></div>
                    </div>
                    
                    <div class="setup-input-group">
                        <label>你的身分 (扮演視角)</label>
                        <select id="input-player-role" class="setup-input">
                            <option value="專屬保母">🍼 聯合撫育中心保母 / 代理監護人</option>
                            <option value="雙親之一">🧬 我就是雙親之一</option>
                            <option value="遠房親戚">🏡 暫代照顧的遠房親戚</option>
                        </select>
                    </div>
                    
                    <div class="setup-input-group">
                        <label>時間推移 (往後推幾年？)</label>
                        <input type="number" id="input-timeskip" class="setup-input" value="5" min="0" placeholder="例如: 5">
                    </div>

                    <div class="setup-input-group">
                        <label>世界觀與雙親設定補充 (強烈建議)</label>
                        <textarea id="input-lore" class="setup-input" placeholder="例如：背景是總部，兩人一直相愛相殺。希望推移後權力發生變化..."></textarea>
                    </div>
                    
                    <button class="btn-generate" id="btn-create-child">✨ 演算未來與孕育</button>
                </div>
                <div class="cc-modal-layer" id="cc-modal-layer"></div>
            </div>
        `;
        document.getElementById('btn-create-child').onclick = handleCreateChild;
    }

    async function handleCreateChild() {
        const fatherName = document.getElementById('input-father').value.trim() || "未知";
        const motherName = document.getElementById('input-mother').value.trim() || "未知";
        const playerRole = document.getElementById('input-player-role').value;
        const timeSkip = document.getElementById('input-timeskip').value || "5";
        const lore = document.getElementById('input-lore').value.trim();

        const rolledGender = Math.random() < 0.5 ? '男' : '女';

        showModal(`<div class="cc-modal"><div class="modal-title">⏳ 時間線推演中...</div><div class="loading-text">正在推演往後 ${timeSkip} 年的世界變遷與角色狀態...<br>這可能需要較長時間，請耐心等候。</div></div>`);

        let userPrompt = '';
        if (win.CHILD_PROMPTS && typeof win.CHILD_PROMPTS.getSetupPrompt === 'function') {
            userPrompt = win.CHILD_PROMPTS.getSetupPrompt(fatherName, motherName, playerRole, timeSkip, rolledGender, lore);
        } else {
            alert('找不到 CHILD_PROMPTS 庫，請確保 child_prompts.js 已載入！');
            closeModal();
            return;
        }

        try {
            // [TODO: Standalone API] 功能待接入直連 API
            console.warn('[Child] AI 功能已停用，等待 Standalone API 整合');
            closeModal();
            return;

            let imageUrl = "https://files.catbox.moe/k2n32k.png";
            if (win.OS_IMAGE_MANAGER && typeof win.OS_IMAGE_MANAGER.generateItem === 'function') {
                const imgPrompt = resultJson.imgPrompt || "1child";
                imageUrl = await win.OS_IMAGE_MANAGER.generateItem(imgPrompt, { width: 416, height: 640 });
            }

            const newChild = {
                id: 'child_' + Date.now(),
                name: resultJson.name || "無名氏",
                father: fatherName, 
                mother: motherName, 
                playerRole: playerRole, 
                gender: resultJson.gender || "未知",
                height: resultJson.height || "成長中",
                weight: resultJson.weight || "成長中",
                birthday: resultJson.birthday || "未知",
                personality: resultJson.personality || "未知",
                potential: resultJson.potential || "尚未展現",
                originStory: resultJson.originStory || "這是一個充滿愛的家庭誕生的奇蹟。",
                desc: resultJson.desc || "一個充滿潛力的孩子。",
                worldState: resultJson.worldState || "推演資料遺失。",
                parentsStatus: resultJson.parentsStatus || "推演資料遺失。",
                marriage: resultJson.marriage || '',
                familyViews: resultJson.familyViews || '',
                childExpectations: resultJson.childExpectations || '',
                coupleCore: resultJson.coupleCore || '',
                age: 5,
                background: null,
                imgPrompt: resultJson.imgPrompt || '',
                room_bg_prompt: resultJson.room_bg_prompt || '',
                stats: { int: resultJson.int || 10, str: resultJson.str || 10, stress: resultJson.stress || 0, exp: 0 },
                imageUrl: imageUrl,
                chatHistory: [],
                eventHistory: [] 
            };

            STATE.children.push(newChild);
            saveDB();

            await saveAvatarToLorebook(newChild.name, newChild.imageUrl);
            saveChildLoreToLorebook(newChild);

            closeModal();
            enterRoom(newChild.id);

            generateChildRoomBackground(newChild);

        } catch (error) {
            console.error("[Child Room] 生成推演失敗", error); closeModal();
            alert("生成與推演失敗，請檢查面板 Console 確保 JSON 格式正確。\n" + error.message);
        }
    }

    function renderRoomView() {
        const child = getCurrentChild();
        if (!child) return goToList();
        
        let bgStyle = 'background: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%);';
        if (child.hasBg) {
            bgStyle = `background-image: url(''); background-size: cover; background-position: center;`;
        }

        const stage = getGrowthStage(child.age);
        const expMax = getExpMax();
        const expPercent = Math.min(100, (child.stats.exp / expMax) * 100);

        rootContainer.innerHTML = `
            <div class="cc-container">
                <div class="cc-header">
                    <button class="cc-btn-icon" onclick="window.CHILD_CORE.goToList()">❮</button>
                    <span>${child.name} 的房間</span>
                    <div style="display:flex; gap:8px;">
                        <button class="cc-btn-icon" onclick="window.CHILD_CORE.openInfo()" title="角色資訊">ℹ️</button>
                        <button class="cc-btn-icon" onclick="window.CHILD_CORE.openChatHistory()" title="紀錄與軌跡">📜</button>
                        <button class="cc-btn-icon" onclick="window.CHILD_CORE.openSettings()" title="設定與換裝">⚙️</button>
                    </div>
                </div>

                <div class="cc-main-room" id="cc-main-room" style="${bgStyle}">
                    
                    <div class="cc-stats-area">
                        <div class="stat-item">智力 (INT) : <span id="cc-stat-int">${child.stats.int}</span>
                            <div class="stat-bar-bg"><div class="stat-bar-fill fill-int" id="cc-bar-int" style="width: ${Math.min(100, child.stats.int)}%"></div></div>
                        </div>
                        <div class="stat-item">體力 (STR) : <span id="cc-stat-str">${child.stats.str}</span>
                            <div class="stat-bar-bg"><div class="stat-bar-fill fill-str" id="cc-bar-str" style="width: ${Math.min(100, child.stats.str)}%"></div></div>
                        </div>
                        <div class="stat-item">壓力 (Stress) : <span id="cc-stat-stress">${child.stats.stress}</span>
                            <div class="stat-bar-bg"><div class="stat-bar-fill fill-stress" id="cc-bar-stress" style="width: ${Math.min(100, child.stats.stress)}%"></div></div>
                        </div>
                        <div class="stat-item">成長 (EXP) : <span id="cc-stat-exp">${child.stats.exp} / ${expMax}</span>
                            <div class="stat-bar-bg"><div class="stat-bar-fill fill-exp" id="cc-bar-exp" style="width: ${expPercent}%"></div></div>
                        </div>
                    </div>

                    <div class="cc-char-area">
                        <div class="cc-char-frame" onclick="window.CHILD_CORE.pokeChild()">
                            <img src="${child.imageUrl}" class="cc-char-img" id="cc-char-img" onerror="this.src='https://files.catbox.moe/k2n32k.png'">
                        </div>
                    </div>

                    <div class="cc-action-area">
                        <div class="action-btn btn-study" onclick="window.CHILD_CORE.startSchedule('讀書/學習')" title="讀書 (+INT, +Stress)">📚</div>
                        <div class="action-btn btn-exercise" onclick="window.CHILD_CORE.startSchedule('運動/戶外')" title="運動 (+STR, -Stress)">⚽</div>
                        <div class="action-btn btn-rest" onclick="window.CHILD_CORE.startSchedule('休息/睡覺')" title="休息 (-Stress)">💤</div>
                        <div class="action-btn btn-outing" onclick="window.CHILD_CORE.startSchedule('外出出遊')" title="外出出遊">🗺️</div>
                    </div>

                    <div class="cc-vn-wrapper" id="cc-vn-wrapper" style="display:none;">
                        <div class="cc-vn-box" onclick="window.CHILD_CORE.advanceVn()">
                            <div class="cc-vn-name" id="cc-vn-name"></div>
                            <div class="cc-vn-text" id="cc-vn-text"></div>
                            <div class="cc-vn-next" id="cc-vn-next">▼</div>
                        </div>
                    </div>

                </div>

                <div class="cc-chat-bar">
                    <input type="text" id="cc-chat-input" class="cc-input" placeholder="和 ${child.name} 說點什麼吧..." onkeypress="if(event.key==='Enter') window.CHILD_CORE.sendChatMessage()">
                    <button class="cc-send-btn" onclick="window.CHILD_CORE.sendChatMessage()">➤</button>
                </div>
                
                <div class="cc-overlay-panel" id="cc-info-panel"></div>
                <div class="cc-modal-layer" id="cc-modal-layer"></div>
            </div>
        `;

        if (child.hasBg && win.OS_DB) {
            win.OS_DB.getChildBg(child.id).then(bgData => {
                if (bgData) {
                    const roomEl = document.getElementById('cc-main-room');
                    if (roomEl) roomEl.style.backgroundImage = `url('${bgData}')`;
                }
            }).catch(e => console.warn('無法載入背景', e));
        }

        if (child.chatHistory.length === 0) {
            setTimeout(() => {
                STATE.vnQueue.push({ type: 'nar', text: `這是 ${child.name} 專屬的空間。目前 ${child.age} 歲，是個${child.personality}的孩子。` });
                STATE.vnQueue.push({ type: 'char', name: child.name, text: `「...你好。」`, expression: 'smile' });
                advanceVn();
            }, 500);
        }
    }

    // === 音樂控制 ===
    function toggleMusic() {
        STATE.bgmEnabled = !STATE.bgmEnabled;
        const btn = document.getElementById('cc-music-btn');
        if (btn) {
            if (STATE.bgmEnabled) btn.classList.add('active');
            else btn.classList.remove('active');
        }
        if (STATE.bgmEnabled) startChildBgm();
        else stopChildBgm();
    }
    function startChildBgm() {
        if (!STATE.bgmEnabled) return;
        if (!childBgm) {
            childBgm = new Audio(CHILD_BGM_URL);
            childBgm.loop = true;
            childBgm.volume = 0.3;
        }
        childBgm.play().catch(e => console.warn("BGM 播放被瀏覽器阻擋", e));
    }
    function stopChildBgm() {
        if (childBgm) { childBgm.pause(); childBgm.currentTime = 0; }
    }

    // === UI 更新 ===
    function updateStatsUI() {
        const child = getCurrentChild();
        if (!child) return;
        
        const safeUpdate = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        const safeWidth = (id, val, max = 100) => { const el = document.getElementById(id); if (el) el.style.width = `${Math.min(100, (val/max)*100)}%`; };
        
        const expMax = getExpMax();
        
        safeUpdate('cc-stat-int', child.stats.int); safeWidth('cc-bar-int', child.stats.int);
        safeUpdate('cc-stat-str', child.stats.str); safeWidth('cc-bar-str', child.stats.str);
        safeUpdate('cc-stat-stress', child.stats.stress); safeWidth('cc-bar-stress', child.stats.stress);
        safeUpdate('cc-stat-exp', `${child.stats.exp} / ${expMax}`); safeWidth('cc-bar-exp', child.stats.exp, expMax);
    }

    function updateChildAvatarUI() {
        const child = getCurrentChild();
        if (!child) return;
        const imgEl = document.getElementById('cc-char-img');
        if (imgEl && child.imageUrl) {
            imgEl.src = child.imageUrl;
        }
    }

    // === VN 核心解析與播放 ===
    function advanceVn() {
        const wrapper = document.getElementById('cc-vn-wrapper');
        const nameEl = document.getElementById('cc-vn-name');
        const textEl = document.getElementById('cc-vn-text');
        const nextEl = document.getElementById('cc-vn-next');
        if (!wrapper || !nameEl || !textEl || !nextEl) return;

        if (STATE.isTyping) {
            clearInterval(STATE.typingTimer);
            textEl.innerHTML = STATE.currentVnMsg.text;
            STATE.isTyping = false;
            nextEl.style.display = 'block';
            return;
        }

        if (STATE.vnQueue.length === 0) {
            wrapper.style.display = 'none';
            return;
        }

        const msg = STATE.vnQueue.shift();
        STATE.currentVnMsg = msg;
        wrapper.style.display = 'block';
        nextEl.style.display = 'none';
        
        if (msg.type === 'char') {
            nameEl.style.display = 'block';
            nameEl.innerText = msg.name;
        } else {
            nameEl.style.display = 'none';
        }

        textEl.innerHTML = '';
        STATE.isTyping = true;
        let charIndex = 0;
        STATE.typingTimer = setInterval(() => {
            textEl.innerHTML += msg.text.charAt(charIndex);
            charIndex++;
            if (charIndex >= msg.text.length) {
                clearInterval(STATE.typingTimer);
                STATE.isTyping = false;
                nextEl.style.display = 'block';
            }
        }, 30);
    }

    function parseAndQueueVn(text) {
        const lines = text.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            if (line.startsWith('[Nar|')) {
                const content = line.replace('[Nar|', '').replace(']', '');
                STATE.vnQueue.push({ type: 'nar', text: content });
            } else if (line.startsWith('[Char|')) {
                const parts = line.split('|');
                if (parts.length >= 4) {
                    STATE.vnQueue.push({ type: 'char', name: parts[1], expression: parts[2], text: parts[3].replace(']', '') });
                } else if (parts.length >= 3) {
                    STATE.vnQueue.push({ type: 'char', name: parts[1], expression: 'neutral', text: parts[2].replace(']', '') });
                }
            } else {
                if (line.length > 2) STATE.vnQueue.push({ type: 'nar', text: line });
            }
        }
        if (!STATE.isTyping && STATE.vnQueue.length > 0) advanceVn();
    }

    // === 互動核心：戳戳 ===
    function pokeChild() {
        const child = getCurrentChild();
        if (!child || STATE.vnQueue.length > 0 || STATE.isTyping) return;
        const pokes = [
            { n: `你輕輕戳了 ${child.name} 的臉頰。`, c: `「唔...做什麼啦？」` },
            { n: `${child.name} 抬頭看著你。`, c: `「有事嗎？」` },
            { n: `你摸了摸 ${child.name} 的頭。`, c: `「嘿嘿...」` }
        ];
        const p = pokes[Math.floor(Math.random() * pokes.length)];
        STATE.vnQueue.push({ type: 'nar', text: p.n });
        STATE.vnQueue.push({ type: 'char', name: child.name, text: p.c, expression: 'smile' });
        advanceVn();
    }

    // === 互動核心：聊天 (支援 Lorebook) ===
    async function sendChatMessage() {
        const child = getCurrentChild();
        const input = document.getElementById('cc-chat-input');
        if (!child || !input || !input.value.trim() || STATE.isTyping) return;

        const userText = input.value.trim();
        input.value = '';
        
        STATE.vnQueue.push({ type: 'char', name: child.playerRole || "你", text: `「${userText}」`, expression: 'neutral' });
        advanceVn();

        child.chatHistory.push({ role: 'user', content: userText });
        if (child.chatHistory.length > 50) child.chatHistory.shift();
        
        let recentHistoryText = child.chatHistory.map(h => `${h.role === 'user' ? (child.playerRole || '你') : child.name}: ${h.content}`).join('\n');

        const stage = getGrowthStage(child.age);
        const stageRules = getStageRules(stage);

        let sysPrompt = '';
        if (win.CHILD_PROMPTS) sysPrompt = win.CHILD_PROMPTS.getChatSystemPrompt(child, stage, stageRules);
        else sysPrompt = `你扮演 ${child.name}，請用 [Nar|動作] 和 [Char|名字|表情|「對話」] 格式回應。`;

        let chatPrompt = `[近期對話紀錄]\n${recentHistoryText}\n\n你現在該怎麼回應？`;

        try {
            // [TODO: Standalone API] 功能待接入直連 API
            console.warn('[Child] AI 功能已停用，等待 Standalone API 整合');
            return;
        } catch (e) {
            console.error("Chat Error", e);
            parseAndQueueVn(`[Nar|系統連線錯誤]\n[Char|系統|error|「連線失敗，請檢查 API。」]`);
        }
    }

    // === 互動核心：深度排程 (無劇透版 & 支援 Lorebook) ===
    async function startSchedule(activityType) {
        const child = getCurrentChild();
        if (!child) return;
        if (child.stats.stress >= 100 && activityType !== '休息/睡覺') {
            alert("孩子壓力太大了，必須先休息！");
            return;
        }

        const stage = getGrowthStage(child.age);

        if (activityType === '外出出遊') {
            showModal(`<div class="cc-modal"><div class="modal-title">🗺️ 尋找合適地點...</div><div class="loading-text">正在根據 ${child.worldState || '世界現況'} 搜索周遭環境...</div></div>`);
            try {
                let userPrompt = win.CHILD_PROMPTS ? win.CHILD_PROMPTS.getOutingPrompt(child, stage) : `請給5個出遊地點JSON: {"locations":[{"name":"","desc":""}]}`;
                
                // [TODO: Standalone API] 功能待接入直連 API
                console.warn('[Child] AI 功能已停用，等待 Standalone API 整合');
                closeModal();
                return;
                
                let html = `<div class="cc-modal"><div class="modal-title">🗺️ 選擇出遊地點</div><div class="modal-desc" style="margin-bottom:15px;">你要帶 ${child.name} 去哪裡？</div>`;
                resultJson.locations.forEach((loc, idx) => {
                    html += `<div class="modal-option" onclick="window.CHILD_CORE.triggerOutingVN('${loc.name}', '${loc.desc}')">
                                <div>📍 ${loc.name}</div>
                                <div style="font-size:12px; color:#666; font-weight:normal;">${loc.desc}</div>
                             </div>`;
                });
                html += `<button class="cc-btn-danger" style="margin-top:10px;" onclick="window.CHILD_CORE.closeModal()">取消</button></div>`;
                showModal(html);
                return;
            } catch(e) {
                console.error(e);
                alert("獲取地點失敗，請稍後再試。"); closeModal(); return;
            }
        }

        showModal(`<div class="cc-modal"><div class="modal-title">⏳ 進行中...</div><div class="loading-text">${child.name} 正在進行【${activityType}】...<br>這可能會觸發深度事件，請稍候。</div></div>`);

        let sysPrompt = "[System Instruction] 你是一個生動的文字冒險事件生成器。嚴格輸出 JSON，注重情境的代入感與角色性格展現。";
        let userPrompt = win.CHILD_PROMPTS ? win.CHILD_PROMPTS.getSchedulePrompt(child, stage, getStageRules(stage), activityType) : `回傳短JSON {"eventDesc":"","options":[{"text":"","int":1,"str":1,"stress":1,"exp":15,"conclusion":"","habit":""}]}`;

        try {
            // [TODO: Standalone API] 功能待接入直連 API
            console.warn('[Child] AI 功能已停用，等待 Standalone API 整合');
            closeModal();
            return;

            let html = `<div class="cc-modal">
                <div class="modal-title">🎲 突發事件</div>
                <div class="modal-desc" style="margin-bottom:15px; font-size:14px;">${resultJson.eventDesc}</div>`;
            
            resultJson.options.forEach((opt, idx) => {
                // 🔥 修正點：在這裡將事件情境 (eventDesc) 注入到 option 中一併傳遞
                opt.eventContext = resultJson.eventDesc;
                const optJson = JSON.stringify(opt).replace(/'/g, "&#39;");
                html += `<div class="modal-option" onclick='window.CHILD_CORE.applyScheduleResult(${optJson})'>
                            <div>▶ ${opt.text}</div>
                         </div>`;
            });
            html += `</div>`;
            showModal(html);

        } catch(e) {
            console.error("[Schedule] 演算失敗", e);
            alert("排程演算失敗，自動發放基礎經驗值。");
            child.stats.exp += 15; child.stats.stress += 5; 
            checkGrowth(child); saveDB(); updateStatsUI(); closeModal();
        }
    }

    win.CHILD_CORE = win.CHILD_CORE || {};
    win.CHILD_CORE.triggerOutingVN = async function(locName, locDesc) {
        const child = getCurrentChild();
        if (!child) return;
        closeModal();

        // 外出補成長 EXP（依模式給值，同步記進 eventHistory 供日後成長推演）
        const outingExp = getOutingExp();
        child.stats.exp += outingExp;
        child.stats.stress = Math.max(0, (child.stats.stress || 0) - 10);
        if (!child.eventHistory) child.eventHistory = [];
        child.eventHistory.push(`【外出】帶 ${child.name} 前往「${locName}」，度過了充實的時光。（EXP +${outingExp}）`);
        saveDB();
        checkGrowth(child);

        // OS_BRIDGE 為選配（記錄 session），TavernHelper 才是必要條件
        if (win.OS_BRIDGE && typeof win.OS_BRIDGE.startSession === 'function') {
            win.OS_BRIDGE.startSession(child.id, `帶 ${child.name} 去 ${locName}`);
        }

        if (win.TavernHelper && typeof win.TavernHelper.createChatMessages === 'function') {
            const playerName = (win.VoidTerminal && win.VoidTerminal.getUserName && win.VoidTerminal.getUserName()) || child.father || '家長';
            const playerRole = child.playerRole || '雙親之一';
            const prompt = `[系統提示]\n你現在是一個互動式文字冒險遊戲(VN)系統。\n【家庭成員】父親：${child.father}　母親：${child.mother}　孩子：${child.name}\n【規範】父親與母親是已婚夫妻，請以夫妻身分描寫兩人互動，禁止描寫為普通朋友關係。\n【外出資訊】玩家「${playerName}」（身分：${playerRole}）正帶著孩子 ${child.name} 前往【${locName}】(${locDesc})。\n請開啟一段生動的出遊劇情，並給予玩家互動選項。\n請嚴格遵守 VN 格式規範。當這段外出劇情告一段落（準備回家）時，請務必在最後一句輸出 [SessionEnd|${child.id}|出遊結算文字]。`;
            try {
                await win.TavernHelper.createChatMessages([{
                    role: 'user',
                    name: 'System',
                    message: prompt
                }], { refresh: 'affected' });
                console.log(`[Child] ✅ 已觸發 VN 出遊: ${locName}`);
                // 切換到 DIVE 分頁讓用戶看到劇情（同 QB 的做法）
                setTimeout(() => {
                    if (window.AureliaControlCenter && typeof window.AureliaControlCenter.switchPage === 'function') {
                        window.AureliaControlCenter.switchPage('nav-story');
                    }
                }, 800);
            } catch(e) {
                console.error('[Child] 觸發 VN 出遊失敗', e);
                alert('觸發出遊劇情失敗，請檢查 TavernHelper 連線狀態。');
            }
        } else {
            // fallback：TavernHelper 不可用時的純文字模擬
            alert(`【模擬出遊】\n你帶著 ${child.name} 去了 ${locName}。\n度過了愉快的一天！\n(TavernHelper 未就緒，僅文字顯示)`);
            child.stats.stress = Math.max(0, (child.stats.stress || 0) - 15);
            saveDB(); updateStatsUI();
        }
    };

    win.CHILD_CORE.applyScheduleResult = function(opt) {
        const child = getCurrentChild();
        if (!child) return;
        
        child.stats.int = Math.max(0, child.stats.int + (opt.int || 0));
        child.stats.str = Math.max(0, child.stats.str + (opt.str || 0));
        child.stats.stress = Math.max(0, child.stats.stress + (opt.stress || 0));
        child.stats.exp += (opt.exp || 10);
        
        // 整理數值變化字串
        let statChanges = [];
        if (opt.int) statChanges.push(`INT ${opt.int > 0 ? '+'+opt.int : opt.int}`);
        if (opt.str) statChanges.push(`STR ${opt.str > 0 ? '+'+opt.str : opt.str}`);
        if (opt.stress) statChanges.push(`Stress ${opt.stress > 0 ? '+'+opt.stress : opt.stress}`);
        if (opt.exp) statChanges.push(`EXP +${opt.exp}`);
        
        let statHtml = statChanges.length > 0 ? `<div style="margin-top:12px; font-size:13px; color:#d84315; font-weight:bold; border-top:1px dashed rgba(0,0,0,0.1); padding-top:8px;">📊 數值變化: ${statChanges.join(' / ')}</div>` : '';

        let habitHtml = '';
        if (opt.habit) {
            // 🔥 修正點：在推入 eventHistory 時，將事件上下文、玩家選擇一併組合起來
            const contextText = opt.eventContext ? `【事件】${opt.eventContext} 【玩家選擇】${opt.text} ` : '';
            child.eventHistory.push(`[Lv.${child.age}] ${contextText}經歷事件後展現出【${opt.habit}】的傾向。結語：${opt.conclusion}`);
            habitHtml = `<div style="margin-top:10px; padding:10px; background:rgba(255,255,255,0.6); border-radius:10px; font-weight:bold; color:#0077b6; border: 1px solid rgba(0, 119, 182, 0.2);">✨ 養成傾向：${opt.habit}</div>`;
        }

        let reportHtml = `
            <div class="cc-modal" style="background: linear-gradient(135deg, #e0f7fa 0%, #e1bee7 100%); border: 2px solid white;">
                <div class="modal-title" style="color: #0077b6; border-bottom: 2px solid rgba(255,255,255,0.5); padding-bottom: 10px;">📝 結算報告</div>
                <div class="modal-desc" style="background: rgba(255,255,255,0.7); color: #333; font-size: 15px; text-align: left; line-height: 1.6; border: 1px solid rgba(255,255,255,0.9);">
                    ${opt.conclusion || "事件結束了。"}
                    ${statHtml}
                    ${habitHtml}
                </div>
                <button class="btn-generate" style="margin: 20px auto 0; padding: 12px 35px; font-size: 15px; background: linear-gradient(135deg, #0077b6, #4ea8de); box-shadow: 0 6px 20px rgba(0, 119, 182, 0.3);" onclick="window.CHILD_CORE.closeReportAndCheckGrowth()">確認</button>
            </div>
        `;
        showModal(reportHtml);

        STATE.vnQueue.push({ type: 'nar', text: opt.conclusion || "事件結束了。" });
        advanceVn();

        saveDB();
        updateStatsUI();
    };

    win.CHILD_CORE.closeReportAndCheckGrowth = function() {
        closeModal();
        const child = getCurrentChild();
        if (child) checkGrowth(child);
    };

    // === 成長判定與世界書更新 ===
    async function checkGrowth(child) {
        const expMax = getExpMax();
        if (child.stats.exp >= expMax) {
            const oldStage = getGrowthStage(child.age);
            const newAge = child.age + 1;
            const newStage = getGrowthStage(newAge);

            if (newAge >= 18) {
                alert(`🎊 恭喜！${child.name} 已經滿 18 歲，成年了！\n他將帶著你賦予他的性格與能力，獨立面對這個世界。\n(已將成年角色資料永久寫入世界書)`);
                child.age = 18;
                child.stats.exp = expMax; 
                child.playerRole = child.playerRole + " (已獨立)";
                saveDB();
                saveChildLoreToLorebook(child);
                renderRoomView();
                return;
            }

            if (oldStage !== newStage) {
                showModal(`<div class="cc-modal"><div class="modal-title">🌟 階段突破！</div><div class="loading-text">${child.name} 即將從「${oldStage}」成長為「${newStage}」！<br>AI 正在根據過去養成的習慣，重新塑造他的性格與外貌...</div></div>`);
                
                let historyText = child.eventHistory.join('\n');
                let userPrompt = win.CHILD_PROMPTS ? win.CHILD_PROMPTS.getGrowthPrompt(child, oldStage, newStage, historyText, newAge) : `回傳純JSON: {"newPersonality":"","newPotential":"","growthSummary":"","newImgPrompt":""}`;

                try {
                    // [TODO: Standalone API] 功能待接入直連 API
                    console.warn('[Child] AI 功能已停用，等待 Standalone API 整合');
                    closeModal();
                    return;
                    child.potential = resultJson.newPotential || child.potential;
                    child.imgPrompt = resultJson.newImgPrompt || child.imgPrompt;
                    child.eventHistory = []; 
                    
                    child.age = newAge;
                    child.stats.exp = 0; 
                    saveDB();
                    saveChildLoreToLorebook(child); 

                    alert(`🎉 ${child.name} 成長為 ${newStage} (Lv.${child.age})！\n\n【家長總結】\n${resultJson.growthSummary}\n\n【新性格】\n${child.personality}`);
                    renderRoomView();
                    closeModal();

                    if (win.OS_IMAGE_MANAGER && child.imgPrompt) {
                        showModal(`<div class="cc-modal"><div class="modal-title">🎨 繪製新立繪...</div><div class="loading-text">正在更新 ${newStage} 階段的外貌...</div></div>`);
                        win.OS_IMAGE_MANAGER.generateItem(child.imgPrompt, { width: 416, height: 640 }).then(url => {
                            child.imageUrl = url; saveDB(); updateChildAvatarUI(); closeModal();
                            saveAvatarToLorebook(child.name, url); 
                        }).catch(e => { console.warn('成長立繪生成失敗', e); closeModal(); });
                    }

                } catch (error) {
                    console.error("[Child Growth] 成長演算失敗", error); 
                    child.stats.exp = 0; child.age = newAge; saveDB(); renderRoomView(); closeModal();
                    alert(`🎉 ${child.name} 成長為 Lv.${child.age}！\n(註：AI 分析性格失敗，僅提升等級)`);
                }
            } else {
                child.age = newAge;
                child.stats.exp = 0;
                saveDB(); updateStatsUI();
                alert(`🎂 生日快樂！${child.name} 長大了 1 歲 (Lv.${child.age})！`);
            }
        }
    }

    // 將圖片 URL 下載並轉為 base64（用於存 IndexedDB）
    async function fetchImageAsBase64(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async function generateChildRoomBackground(child) {
        if (!win.OS_IMAGE_MANAGER || !child.room_bg_prompt || !win.OS_DB) return;
        try {
            console.log(`[Child Core] 正在為 ${child.name} 生成房間背景...`);
            const prompt = `${child.room_bg_prompt}, bedroom, anime style, high quality, masterpiece`;
            const url = win.OS_IMAGE_MANAGER.generateBackground(prompt, { width: 768, height: 512 });
            const base64Data = await fetchImageAsBase64(url);
            child.hasBg = true;
            saveDB();
            await win.OS_DB.saveChildBg(child.id, base64Data);
            if (STATE.currentView === 'room' && STATE.currentChildId === child.id) {
                const roomEl = document.getElementById('cc-main-room');
                if (roomEl) roomEl.style.backgroundImage = `url('${base64Data}')`;
            }
            console.log(`[Child Core] ✅ ${child.name} 的房間背景已生成並儲存`);
        } catch (e) { console.warn("[Child Room] 自動生成背景失敗:", e); }
    }

    function openInfo() {
        const child = getCurrentChild();
        if (!child) return;
        const panel = document.getElementById('cc-info-panel');
        if (!panel) return;
        
        panel.innerHTML = `
            <div class="cc-overlay-close" onclick="window.CHILD_CORE.closeOverlay()">✕</div>
            <div class="cc-overlay-title">角色檔案</div>
            
            <div class="cc-tab-bar">
                <button class="cc-tab-btn active" onclick="window.CHILD_CORE.switchInfoTab('basic')">基礎資料</button>
                <button class="cc-tab-btn" onclick="window.CHILD_CORE.switchInfoTab('family')">身世緣起</button>
            </div>

            <div class="cc-overlay-scroll">
                <div id="tab-basic" class="cc-tab-content active">
                    <div class="cc-info-row"><span class="cc-info-label">姓名</span><span class="cc-info-val">${child.name} (${child.gender})</span></div>
                    <div class="cc-info-row"><span class="cc-info-label">年齡</span><span class="cc-info-val">${child.age} 歲 (${getGrowthStage(child.age)})</span></div>
                    <div class="cc-info-row"><span class="cc-info-label">體態</span><span class="cc-info-val">${child.height} / ${child.weight}</span></div>
                    <div class="cc-info-row"><span class="cc-info-label">生日</span><span class="cc-info-val">${child.birthday}</span></div>
                    <div class="cc-info-row"><span class="cc-info-label">玩家身分</span><span class="cc-info-val">${child.playerRole || '家長'}</span></div>
                    <div class="cc-info-desc"><b>【基礎性格】</b><br>${child.personality}</div>
                    <div class="cc-info-desc" style="background:#fff3e0; border-color:#ffe0b2;"><b>【開發潛能】</b><br>${(child.potential || '').replace(/\\n/g, '<br>')}</div>
                    <div class="cc-info-desc"><b>【外貌特徵】</b><br>${child.desc}</div>
                </div>

                <div id="tab-family" class="cc-tab-content">
                    <div class="cc-info-row"><span class="cc-info-label">父親</span><span class="cc-info-val">${child.father}</span></div>
                    <div class="cc-info-row"><span class="cc-info-label">母親</span><span class="cc-info-val">${child.mother}</span></div>
                    <div class="cc-info-desc"><b>【家族緣起】</b><br>${(child.originStory || '').replace(/\\n/g, '<br>')}</div>
                    <div class="cc-info-desc"><b>【世界變遷】</b><br>${(child.worldState || '').replace(/\\n/g, '<br>')}</div>
                    <div class="cc-info-desc"><b>【雙親現狀】</b><br>${(child.parentsStatus || '').replace(/\\n/g, '<br>')}</div>
                    ${child.marriage ? `<div class="cc-info-desc"><b>【結合方式】</b><br>${child.marriage.replace(/\\n/g, '<br>')}</div>` : ''}
                    ${child.familyViews ? `<div class="cc-info-desc"><b>【雙方家族態度】</b><br>${child.familyViews.replace(/\\n/g, '<br>')}</div>` : ''}
                    ${child.childExpectations ? `<div class="cc-info-desc"><b>【雙親對孩子的期望】</b><br>${child.childExpectations.replace(/\\n/g, '<br>')}</div>` : ''}
                    ${child.coupleCore ? `<div class="cc-info-desc"><b>【關係核心】</b><br>${child.coupleCore.replace(/\\n/g, '<br>')}</div>` : ''}
                </div>
            </div>
        `;
        panel.classList.add('active');
    }

    function switchInfoTab(tabId) {
        document.querySelectorAll('.cc-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.cc-tab-content').forEach(c => c.classList.remove('active'));
        event.target.classList.add('active');
        document.getElementById(`tab-${tabId}`).classList.add('active');
    }

    function openSettings() {
        const child = getCurrentChild();
        if (!child) return;
        const panel = document.getElementById('cc-info-panel');
        if (!panel) return;

        let bgPreviewHtml = '';
        if (child.hasBg) {
            bgPreviewHtml = `
                <div class="cc-bg-preview-box" id="cc-bg-preview-box">
                    <div style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#999; font-size:12px;">載入中...</div>
                </div>
                <div style="display:flex; gap:10px; margin-bottom:15px;">
                    <button class="cc-btn-danger" style="flex:1;" onclick="window.CHILD_CORE.removeBg()">🗑️ 移除</button>
                    <button class="cc-btn-enter" style="flex:2; margin:0;" onclick="document.getElementById('cc-bg-file-input').click()">🖼️ 更換本地背景</button>
                </div>
            `;
            if (win.OS_DB) {
                win.OS_DB.getChildBg(child.id).then(bgData => {
                    const box = document.getElementById('cc-bg-preview-box');
                    if (box && bgData) box.innerHTML = `<img src="${bgData}">`;
                });
            }
        } else {
            bgPreviewHtml = `
                <div class="cc-bg-upload-area" onclick="document.getElementById('cc-bg-file-input').click()">
                    <div style="font-size:24px; margin-bottom:8px;">🖼️</div>
                    <div style="font-size:13px; font-weight:bold; color:var(--cc-primary);">點擊上傳自訂背景</div>
                    <div style="font-size:11px; color:#888; margin-top:4px;">推薦比例 16:9</div>
                </div>
            `;
        }
        
        bgPreviewHtml += `<input type="file" id="cc-bg-file-input" style="display:none;" accept="image/png, image/jpeg, image/jpg" onchange="window.CHILD_CORE.handleBgUpload(event)">`;

        panel.innerHTML = `
            <div class="cc-overlay-close" onclick="window.CHILD_CORE.closeOverlay()">✕</div>
            <div class="cc-overlay-title">設定與換裝</div>
            <div class="cc-overlay-scroll">
                ${bgPreviewHtml}

                <div class="cc-settings-section">
                    <label class="cc-settings-label">⚡ 成長速度模式</label>
                    <div style="display:flex; gap:8px; margin-bottom:6px;">
                        ${Object.entries(GROWTH_MODES).map(([key, cfg]) => `
                        <button onclick="window.CHILD_CORE.setGrowthMode('${key}')"
                            style="flex:1; padding:9px 4px; border-radius:10px; font-size:11px; font-weight:bold; cursor:pointer; border:2px solid; transition:all 0.2s;
                            ${STATE.growthMode === key
                                ? 'background:var(--cc-primary);color:white;border-color:var(--cc-primary);'
                                : 'background:#fff8f0;color:var(--cc-primary);border-color:#ffb471;'}">
                            ${cfg.label}
                        </button>`).join('')}
                    </div>
                    <div style="font-size:11px; color:#888; text-align:center; margin-bottom:2px;">
                        ${GROWTH_MODES[STATE.growthMode].desc}　｜　升一歲需 <b>${getExpMax()} EXP</b>，外出補 <b>+${getOutingExp()} EXP</b>
                    </div>
                </div>

                <div class="cc-settings-section">
                    <label class="cc-settings-label">人物立繪 Prompt (英文)</label>
                    <textarea id="cc-img-prompt" class="cc-settings-textarea">${child.imgPrompt || ''}</textarea>
                    <div class="cc-settings-btn-row">
                        <button class="cc-settings-btn save" onclick="window.CHILD_CORE.saveImgPrompt()">💾 儲存</button>
                        <button class="cc-settings-btn regen" onclick="window.CHILD_CORE.regenAvatar()">🎨 重新生成立繪</button>
                    </div>
                </div>

                <div class="cc-settings-section">
                    <label class="cc-settings-label">房間背景 Prompt (英文)</label>
                    <textarea id="cc-bg-prompt" class="cc-settings-textarea">${child.room_bg_prompt || ''}</textarea>
                    <div class="cc-settings-btn-row">
                        <button class="cc-settings-btn save" onclick="window.CHILD_CORE.saveBgPrompt()">💾 儲存</button>
                        <button class="cc-settings-btn regen" onclick="window.CHILD_CORE.regenBg()">🌅 重新生成背景</button>
                    </div>
                </div>
            </div>
        `;
        panel.classList.add('active');
    }

    // 🔥 核心修改區：將對話紀錄改為帶有 Tabs 的面板 (對話紀錄 / 成長軌跡)
    function openChatHistory() {
        const child = getCurrentChild();
        if (!child) return;
        const panel = document.getElementById('cc-info-panel');
        if (!panel) return;

        // 1. 生成對話紀錄 HTML
        let chatHtml = '';
        if (!child.chatHistory || child.chatHistory.length === 0) {
            chatHtml = `<div class="cc-hist-empty">目前沒有任何對話紀錄。</div>`;
        } else {
            child.chatHistory.forEach((h, idx) => {
                const isUser = h.role === 'user';
                const senderName = isUser ? (child.playerRole || '你') : child.name;
                const senderClass = isUser ? 'user' : 'ai';
                chatHtml += `
                    <div class="cc-hist-item">
                        <input type="checkbox" class="cc-hist-cb" data-idx="${idx}">
                        <div class="cc-hist-bubble">
                            <div class="cc-hist-sender ${senderClass}">${senderName}</div>
                            <div class="cc-hist-text">${h.content}</div>
                        </div>
                    </div>
                `;
            });
        }

        // 2. 生成成長軌跡 (事件歷史) HTML
        let eventHtml = '';
        if (!child.eventHistory || child.eventHistory.length === 0) {
            eventHtml = `<div class="cc-hist-empty">目前還沒有經歷過任何特別的事件。</div>`;
        } else {
            child.eventHistory.forEach((evt, idx) => {
                eventHtml += `
                    <div class="cc-hist-item" style="flex-direction: column; align-items: flex-start;">
                        <div style="font-weight:bold; color:var(--cc-primary); margin-bottom:5px; font-size:11px;">📌 成長事件</div>
                        <div class="cc-hist-text" style="width: 100%; box-sizing: border-box; background: #fff8f0; border: 1px solid #ffe0b2;">${evt}</div>
                    </div>
                `;
            });
        }

        panel.innerHTML = `
            <div class="cc-overlay-close" onclick="window.CHILD_CORE.closeOverlay()">✕</div>
            <div class="cc-overlay-title">紀錄與軌跡</div>
            
            <div class="cc-tab-bar">
                <button class="cc-tab-btn active" onclick="window.CHILD_CORE.switchInfoTab('chat')">對話紀錄</button>
                <button class="cc-tab-btn" onclick="window.CHILD_CORE.switchInfoTab('event')">成長軌跡</button>
            </div>

            <div class="cc-overlay-scroll" style="background:#fff; border-radius:12px; padding:10px; border:1px solid #f0f0f0; display:flex; flex-direction:column;">
                
                <div id="tab-chat" class="cc-tab-content active" style="flex:1;">
                    <div class="cc-hist-controls">
                        <label style="font-size:12px; cursor:pointer;"><input type="checkbox" id="cc-hist-select-all" onclick="window.CHILD_CORE.toggleAllHistory(this)"> 全選</label>
                        <div style="font-size:11px; color:#888;">僅保留最近20筆</div>
                    </div>
                    ${chatHtml}
                    ${child.chatHistory && child.chatHistory.length > 0 ? `<button class="cc-hist-del-btn" onclick="window.CHILD_CORE.deleteSelectedHistory()">🗑️ 刪除選取紀錄</button>` : ''}
                </div>

                <div id="tab-event" class="cc-tab-content" style="flex:1;">
                    <div class="cc-hist-controls" style="justify-content: flex-end;">
                        <div style="font-size:11px; color:#888;">記錄當前階段經歷的事件（升級後會轉化為性格並重置）</div>
                    </div>
                    ${eventHtml}
                </div>

            </div>
        `;
        panel.classList.add('active');
    }

    function toggleAllHistory(cb) {
        document.querySelectorAll('.cc-hist-cb').forEach(el => el.checked = cb.checked);
    }

    function deleteSelectedHistory() {
        const child = getCurrentChild();
        if (!child) return;
        const cbs = document.querySelectorAll('.cc-hist-cb:checked');
        if (cbs.length === 0) { alert('請先勾選要刪除的紀錄。'); return; }
        if (!confirm(`確定要刪除選取的 ${cbs.length} 筆對話紀錄嗎？`)) return;

        const indicesToDelete = Array.from(cbs).map(cb => parseInt(cb.getAttribute('data-idx'))).sort((a,b) => b-a);
        indicesToDelete.forEach(idx => {
            child.chatHistory.splice(idx, 1);
        });
        saveDB();
        if (win.OS_DB) win.OS_DB.saveChildChatHistory(child.id, child.chatHistory).catch(e => console.warn('[Child] 聊天 IDB 儲存失敗', e));
        openChatHistory();
    }

    function closeOverlay() {
        const panel = document.getElementById('cc-info-panel');
        if (panel) panel.classList.remove('active');
    }

    function handleBgUpload(event) {
        const child = getCurrentChild();
        if (!child || !win.OS_DB) return;
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(e) {
            const base64Data = e.target.result;
            child.hasBg = true;
            saveDB();
            await win.OS_DB.saveChildBg(child.id, base64Data);
            
            const roomEl = document.getElementById('cc-main-room');
            if (roomEl) roomEl.style.backgroundImage = `url('${base64Data}')`;
            openSettings(); 
        };
        reader.readAsDataURL(file);
    }

    async function removeBg() {
        const child = getCurrentChild();
        if (!child) return;
        if (!confirm('確定要移除自訂背景嗎？')) return;
        child.hasBg = false;
        saveDB();
        if (win.OS_DB) await win.OS_DB.deleteChildBg(child.id);
        const roomEl = document.getElementById('cc-main-room');
        if (roomEl) roomEl.style.backgroundImage = 'none';
        openSettings();
    }

    function saveImgPrompt() {
        const child = getCurrentChild();
        const val = document.getElementById('cc-img-prompt').value.trim();
        if (child) { child.imgPrompt = val; saveDB(); alert('立繪 Prompt 已儲存！'); }
    }
    function saveBgPrompt() {
        const child = getCurrentChild();
        const val = document.getElementById('cc-bg-prompt').value.trim();
        if (child) { child.room_bg_prompt = val; saveDB(); alert('背景 Prompt 已儲存！'); }
    }
    async function regenAvatar() {
        const child = getCurrentChild();
        if (!child || !win.OS_IMAGE_MANAGER) { alert("圖片管理系統未載入"); return; }
        if (!child.imgPrompt) { alert("請先填寫 Prompt"); return; }
        
        showModal(`<div class="cc-modal"><div class="modal-title">🎨 繪製立繪...</div><div class="loading-text">正在根據 Prompt 重新生成立繪...</div></div>`);
        try {
            const url = await win.OS_IMAGE_MANAGER.generateItem(child.imgPrompt, { width: 416, height: 640 });
            child.imageUrl = url; saveDB(); updateChildAvatarUI(); closeModal(); openSettings();
            saveAvatarToLorebook(child.name, url);
        } catch(e) { console.error(e); alert("生成失敗"); closeModal(); }
    }
    async function regenBg() {
        const child = getCurrentChild();
        if (!child || !win.OS_IMAGE_MANAGER || !win.OS_DB) { alert("圖片系統或資料庫未載入"); return; }
        if (!child.room_bg_prompt) { alert("請先填寫 Prompt"); return; }

        showModal(`<div class="cc-modal"><div class="modal-title">🌅 繪製背景...</div><div class="loading-text">正在根據 Prompt 重新生成房間背景...<br><small style="color:#aaa;font-size:11px;margin-top:8px;display:block;">圖片生成需要 10–30 秒，請稍候</small></div></div>`);
        try {
            const prompt = `${child.room_bg_prompt}, bedroom, anime style, high quality, masterpiece`;
            const url = win.OS_IMAGE_MANAGER.generateBackground(prompt, { width: 768, height: 512 });
            const base64Data = await fetchImageAsBase64(url);
            child.hasBg = true; saveDB(); await win.OS_DB.saveChildBg(child.id, base64Data);
            const roomEl = document.getElementById('cc-main-room');
            if (roomEl) roomEl.style.backgroundImage = `url('${base64Data}')`;
            console.log('[Child Core] ✅ 背景重新生成成功');
            closeModal(); openSettings();
        } catch(e) {
            console.error('[Child Core] regenBg 失敗:', e);
            closeModal();
            alert(`背景生成失敗：${e.message || '未知錯誤'}\n請確認 AI 繪圖伺服器是否正常運作。`);
        }
    }

    function deleteChild(id) {
        if (!confirm('警告：確定要把這個孩子送走嗎？此操作無法還原！')) return;
        STATE.children = STATE.children.filter(c => c.id !== id);
        if (win.OS_DB) {
            win.OS_DB.deleteChildBg(id).catch(e => console.warn(e));
            win.OS_DB.deleteChildChatHistory(id).catch(e => console.warn(e));
        }
        saveDB();
        renderListView();
    }

    function setGrowthMode(mode) {
        if (!GROWTH_MODES[mode]) return;
        STATE.growthMode = mode;
        localStorage.setItem('cc_growth_mode', mode);
        openSettings(); // 重繪設定面板以更新選中狀態
    }

    function showModal(html) { const layer = document.getElementById('cc-modal-layer'); if (layer) { layer.innerHTML = html; layer.classList.add('active'); } }
    function closeModal() { const layer = document.getElementById('cc-modal-layer'); if (layer) { layer.classList.remove('active'); setTimeout(() => layer.innerHTML = '', 300); } }

    // === 成就 EXP 注入 (由 OS_ACHIEVEMENT.markRedeemed 呼叫) ===
    function addExpFromAchievement(exp) {
        if (!exp || exp <= 0) return;
        let changed = false;
        STATE.children.forEach(child => {
            if (child.age >= 18) return;   // 已成年者不接收 EXP
            child.stats.exp = (child.stats.exp || 0) + exp;
            console.log(`[CHILD_CORE] 成就 EXP +${exp} → ${child.name} (exp: ${child.stats.exp})`);
            checkGrowth(child);
            changed = true;
        });
        if (changed) {
            saveDB();
            updateStatsUI(); // 即時刷新 EXP 進度條
        }
    }

    // === 暴露 API ===
    win.CHILD_CORE = {
        launch: launchApp,
        goToList, goToSetup, enterRoom, deleteChild,
        openInfo, openSettings, openChatHistory, closeOverlay, switchInfoTab, handleBgUpload, removeBg,
        saveImgPrompt, saveBgPrompt, regenAvatar, regenBg,
        setGrowthMode,
        toggleAllHistory, deleteSelectedHistory,
        toggleMusic,
        sendChatMessage, pokeChild, startSchedule, advanceVn, closeModal,
        triggerOutingVN: win.CHILD_CORE.triggerOutingVN,
        applyScheduleResult: win.CHILD_CORE.applyScheduleResult,
        closeReportAndCheckGrowth: win.CHILD_CORE.closeReportAndCheckGrowth,
        stopBgm: stopChildBgm,
        addExpFromAchievement
    };

})();