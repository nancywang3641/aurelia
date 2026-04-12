// ----------------------------------------------------------------
// [檔案] inv_core.js (V5.2 - 移除結算ID依賴，直接綁定ChatID與活躍狀態)
// 路徑：os_phone/qb/inv_core.js
// 職責：刑偵調查面板 - VN介面、動態背景、內部審問/鑑識/會議室推論短RP
// 修正：移除獨立登入介面，直接對接大廳的全局登入 API，並新增檔案編輯。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入刑偵調查引擎 (V5.2 Global Login & No-ID Fix)...');
    const win = window.parent || window;

    // 背景資源
    const BG_MAP = {
        office: 'https://files.catbox.moe/qs7ctx.png',
        pantry: 'https://files.catbox.moe/0ahqrw.png',
        meeting: 'https://files.catbox.moe/gffsss.png',
        files: 'https://files.catbox.moe/m55hbt.png',
        interrogation: 'https://files.catbox.moe/gklcbg.png'
    };

    // HQ 人員硬設定立繪
    const HQ_AVATARS = {
        '老霍': 'https://files.catbox.moe/falm78.png',
        '維拉': 'https://files.catbox.moe/es8qlf.png',
        '維拉主任': 'https://files.catbox.moe/es8qlf.png',
        'HQ': 'https://files.catbox.moe/falm78.png'
    };

    const INV_BGM_URL = 'https://nancywang3641.github.io/aurelia/bgm/detective-room.mp3';
    let invBgm = null;

    // === 1. 樣式定義 (偵探暗房 + 視覺小說 UI) ===
    const appStyle = `
        @import url('https://fonts.googleapis.com/css2?family=Special+Elite&family=Courier+Prime:wght@400;700&display=swap');

        /* --- 基礎佈局 --- */
        .inv-container { 
            width: 100%; height: 100%; 
            background: #1a1a1a; 
            color: #dcdcdc; 
            display: flex; flex-direction: column; 
            overflow: hidden; 
            font-family: 'Courier Prime', monospace; 
            position: relative; 
        }

        .inv-header { 
            z-index: 30; padding: 12px 20px; 
            background: rgba(15, 15, 15, 0.9); backdrop-filter: blur(5px);
            border-bottom: 2px solid #b91c1c; 
            display: flex; align-items: center; justify-content: space-between; 
            box-shadow: 0 5px 15px rgba(0,0,0,0.5); 
            flex-shrink: 0;
        }

        .inv-title { 
            font-family: 'Special Elite', cursive; 
            font-size: 16px; color: #fff; 
            letter-spacing: 2px; text-transform: uppercase; 
            text-shadow: 0 0 5px rgba(185,28,28,0.5);
            display: flex; flex-direction: column; align-items: center; line-height: 1.2;
        }

        .inv-back-btn { font-size: 24px; color: #888; cursor: pointer; transition: 0.2s; width: 30px; }
        .inv-back-btn:hover { color: #fff; }

        .inv-music-toggle { font-size: 18px; color: #888; cursor: pointer; transition: 0.2s; width: 30px; text-align: right; }
        .inv-music-toggle.active { color: #b91c1c; text-shadow: 0 0 8px #b91c1c; }

        /* --- VN 房間主視圖 --- */
        .inv-main-room { 
            flex: 1; display: flex; flex-direction: column; overflow: hidden; 
            position: relative; background-size: cover; background-position: center; transition: background 0.5s ease;
        }
        .inv-char-area { 
            flex: 1; display: flex; justify-content: center; align-items: flex-end; 
            position: relative; overflow: hidden; z-index: 1; padding-bottom: 80px;
        }
        .inv-char-img { 
            max-width: 95%; max-height: 95%; object-fit: contain; 
            filter: drop-shadow(0 15px 25px rgba(0,0,0,0.8)); transition: 0.3s;
        }

        /* --- VN 對話框 --- */
        .inv-vn-wrapper { position: absolute; bottom: 70px; left: 15px; right: 15px; z-index: 10; pointer-events: none; }
        .inv-vn-box { 
            background: rgba(10, 10, 10, 0.9); backdrop-filter: blur(10px); 
            border: 2px solid #b91c1c; border-radius: 4px; padding: 25px 20px 15px 20px; 
            min-height: 70px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); 
            position: relative; pointer-events: auto; cursor: pointer; user-select: none;
        }
        .inv-vn-name { 
            position: absolute; top: -14px; left: 20px; background: #b91c1c; color: white; 
            padding: 4px 16px; border-radius: 2px; font-weight: bold; font-size: 14px; 
            font-family: 'Special Elite', cursive; letter-spacing: 1px; border: 1px solid #ff4444;
        }
        .inv-vn-text { font-size: 14px; line-height: 1.6; color: #eee; font-family: 'Courier Prime', monospace; }
        
        @keyframes inv-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .inv-vn-next { display: none; position: absolute; bottom: 8px; right: 15px; font-size: 12px; color: #b91c1c; animation: inv-blink 1.2s infinite; }

        /* --- 動作按鈕區 (右側懸浮) --- */
        .inv-action-area { 
            position: absolute; top: 20px; right: 15px; display: flex; flex-direction: column; gap: 12px; z-index: 25; 
        }
        .inv-action-btn { 
            width: 48px; height: 48px; background: rgba(20,20,20,0.8); border: 1px solid #444; 
            border-radius: 50%; font-size: 20px; display: flex; align-items: center; justify-content: center; 
            color: #ccc; cursor: pointer; transition: 0.2s; box-shadow: 0 5px 15px rgba(0,0,0,0.5);
        }
        .inv-action-btn:hover { background: #b91c1c; color: white; border-color: #ff4444; transform: scale(1.1); }
        .inv-action-btn:active { transform: scale(0.95); }

        /* --- 底部輸入列 --- */
        .inv-chat-bar { 
            position: absolute; bottom: 0; left: 0; width: 100%; height: 60px; 
            background: rgba(15,15,15,0.95); border-top: 2px solid #444; 
            display: flex; align-items: center; padding: 0 15px; z-index: 15; box-sizing: border-box; gap: 10px; 
        }
        .inv-input-field { 
            flex: 1; background: #000; border: 1px solid #555; color: #fff; 
            padding: 10px 15px; border-radius: 4px; font-size: 14px; font-family: 'Courier Prime', monospace; outline: none; 
        }
        .inv-input-field:focus { border-color: #b91c1c; }
        .inv-send-btn { 
            width: 40px; height: 40px; background: #b91c1c; border-radius: 4px; border: none; 
            color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; 
            font-size: 16px; flex-shrink: 0; transition: 0.2s; 
        }
        .inv-send-btn:hover { background: #d62222; }

        /* --- 檔案/清單共用樣式 --- */
        .inv-file-folder {
            background: #e3d3b6; color: #2c1a0b; padding: 15px; border-radius: 2px;
            box-shadow: 3px 3px 10px rgba(0,0,0,0.5); position: relative; cursor: pointer;
            transition: transform 0.2s; transform: rotate(-1deg); border: 1px solid #c4b49a; margin-bottom: 10px;
        }
        .inv-file-folder:hover { transform: rotate(0deg) scale(1.02); z-index: 5; }
        .inv-file-folder::before {
            content: "CONFIDENTIAL"; position: absolute; top: 10px; right: 10px; border: 2px solid #b91c1c;
            color: #b91c1c; padding: 2px 8px; font-weight: bold; font-family: 'Special Elite', cursive; opacity: 0.6; transform: rotate(15deg);
        }
        .inv-case-title { font-weight: bold; font-size: 18px; margin-bottom: 5px; border-bottom: 1px dashed #8b7d6b; padding-bottom: 5px; }
        .inv-case-meta { font-size: 12px; display: flex; justify-content: space-between; margin-top: 5px; font-weight: bold; }

        /* --- 模態窗 (Slide-in / Pop-up) --- */
        .inv-modal-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); z-index: 110; display: flex; align-items: center; justify-content: center;
            opacity: 0; pointer-events: none; transition: opacity 0.3s;
        }
        .inv-modal-overlay.active { opacity: 1; pointer-events: auto; }
        
        .inv-modal-slide {
            position: absolute; top: 0; right: -100%; width: 90%; height: 100%;
            background: #1a1a1a; border-left: 2px solid #555; box-shadow: -5px 0 20px rgba(0,0,0,0.8);
            transition: right 0.3s ease; display: flex; flex-direction: column; z-index: 105;
        }
        .inv-modal-slide.active { right: 0; }
        .inv-slide-header { padding: 15px; background: #0f0f0f; border-bottom: 1px solid #b91c1c; display: flex; justify-content: space-between; align-items: center; }
        .inv-slide-content { flex: 1; overflow-y: auto; padding: 15px; }

        .inv-modal-paper {
            background: #f5f5f5; color: #111; width: 90%; max-height: 85%; padding: 20px;
            box-shadow: 0 0 30px rgba(0,0,0,1); overflow-y: auto; font-family: 'Courier Prime', monospace;
            position: relative; background-image: linear-gradient(#e8e8e8 1px, transparent 1px); background-size: 100% 25px; line-height: 25px;
        }
        .inv-paper-clip { position: absolute; top: -10px; left: 20px; width: 40px; height: 100px; background: #888; border-radius: 20px; opacity: 0.5; z-index: 10; }

        .inv-btn {
            background: #333; border: 1px solid #555; color: #fff; padding: 12px;
            font-family: 'Courier Prime', monospace; cursor: pointer; text-transform: uppercase;
            letter-spacing: 1px; width: 100%; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 10px;
        }
        .inv-btn:hover { background: #444; }
        .inv-btn-primary { background: #b91c1c; border-color: #8b1414; color: #fff; font-weight: bold; }
        .inv-btn-primary:hover { background: #d62222; }

        .typewriter-text { overflow: hidden; white-space: pre-wrap; font-size: 14px; }
        .inv-tag { display: inline-block; background: #000; color: #fff; padding: 2px 6px; font-size: 10px; margin-right: 5px; transform: rotate(-2deg); }
        .inv-badge { background: #b91c1c; color: white; padding: 2px 6px; border-radius: 10px; font-size: 10px; margin-left: 5px; }
        
        /* 終端機風格小按鈕 */
        .terminal-btn {
            background: transparent; border: 1px solid rgba(255,255,255,0.3); color: #ccc;
            padding: 4px 10px; font-family: 'Courier Prime', monospace; font-size: 12px;
            cursor: pointer; transition: 0.2s; text-transform: uppercase; border-radius: 2px;
        }
        .terminal-btn:hover { border-color: #0f0; color: #0f0; text-shadow: 0 0 5px rgba(0,255,0,0.5); box-shadow: inset 0 0 5px rgba(0,255,0,0.2); }
        
        @keyframes flicker { 0% { opacity: 1; } 50% { opacity: 0.8; } 100% { opacity: 1; } }
        @keyframes spin { 100% { transform: rotate(360deg); } }
    `;

    // 注入 CSS
    const doc = window.parent.document || document;
    if (!doc.getElementById('inv-app-css')) {
        const s = doc.createElement('style'); s.id = 'inv-app-css'; s.innerHTML = appStyle; doc.head.appendChild(s);
    }

    // === 2. 系統狀態 ===
    let currentContainer = null;
    let isProcessing = false;
    let isGeneratingCases = false;
    let lastChatMsg = '';
    let lastInterrogationMsg = '';

    let STATE = {
        view: 'STATION', 
        agentName: '探員', 
        dispatcher: { id: 'dispatcher', name: '老霍', avatarUrl: HQ_AVATARS['老霍'] },
        bgmEnabled: true,
        
        myTeam: [],           
        candidateList: [],    
        partnerList: [],      
        
        currentSpeakerId: 'dispatcher',
        
        // VN 系統變數
        vnQueue: [],
        isTyping: false,
        currentVnMsg: null,
        typingTimer: null,
        
        caseList: [],
        activeCaseStatus: {}, 
        interrogationLog: [], 
        evidenceLog: [],      
        suspectList: [],
        actionQueue: [],      
        meetingLogs: [],      
        
        // 內部短 RP 審問室變數
        currentInterrogationIdx: -1,
        interrogationChatLog: []
    };

    let vnFullText = '';

    // 內建 Prompts (已修正鑑識科 Prompt)
    const BUILTIN_PROMPTS = {
        inv_officer_chat: `
你正在與警局內的同僚對話。
角色名稱：{{officerName}}
角色性格與背景：{{officerPersonality}}
用戶（隊長）：{{agentName}}

【當前刑偵數據庫狀態（AI必讀記憶）】
{{investigationContext}}

【互動指示】
如果上下文中有「下一步行動方針」，請在閒聊中主動提及，與隊長討論該如何準備這個行動，或者給予你的專業建議。

【輸出格式絕對限制】
因為系統是視覺小說介面，你的回應必須「嚴格」依照以下標籤格式分段輸出，絕對不要輸出任何其他無關文字：
旁白/動作/心理描寫：[Nar|動作與表情描述]
角色對話：[Char|{{officerName}}|表情|「對話內容」]

範例：
[Nar|遞過一份文件，眉頭微皺。]
[Char|{{officerName}}|serious|「長官，關於會議決定要去搜查的廢棄車庫，我認為我們需要申請重火力支援。」]
`,
        inv_field_brief: `
[System: INVESTIGATION START]
案件: {{caseTitle}} | 類型: {{caseType}} | 風險: {{caseDifficulty}}
主任探員 (隊長): {{agentName}}
同行人員: {{teamNames}}
當前調查目標: {{currentObjective}}
你是 GM。真相已寫入世界書。
請引導隊長進入這個調查場景。
輸出格式:VN格式

[SessionEnd 規則 - 重要]
當收集到足夠線索準備回警局時，在 <content> 最後獨立輸出一行標籤：SessionEnd
`,
        inv_interrogation_chat: `
[System: INTERROGATION START]
案件: {{caseName}}
受審人: {{suspectName}}
已知情報: {{suspectDesc}}

【警方目前掌握的情報庫（玩家可能會以此施壓）】
{{investigationContext}}

你正在扮演受審人【{{suspectName}}】。
玩家正在對你進行一對一的審問。請根據玩家的提問簡短回答（1-3句話）。如果玩家問到核心問題或施加壓力（例如拿出了鑑識報告），請表現出符合你性格的強烈反應（如崩潰、緊張、迴避、或狡辯）。

【輸出格式絕對限制】
請「嚴格」依照以下標籤格式輸出，絕對不要輸出其他無關文字：
[Nar|動作與表情描述]
[Char|{{suspectName}}|表情|「對話內容」]
`,
        inv_interrogation_summary: `
[System: 生成結案摘要]
請根據以下的審問紀錄，寫出一小段精煉的結算日誌（約 50 字內），描述在審問中獲得了什麼新線索或確認了什麼事實。
直接輸出摘要文字即可，不需要任何標籤。
紀錄：
{{chatLog}}
`,
        inv_forensic_lab: `
[System: FORENSIC LAB ANALYSIS]
案件: {{caseName}}
送驗物證: {{evidenceName}}
初步描述: {{evidenceDesc}}

你是警局鑑識科。對上述單件物證出具化驗報告，語氣冰冷專業，約100字。

【強制輸出規則】
1. 報告請直接寫出，不可使用任何 Markdown 或對話標籤。
2. 如果你在鑑識過程中，發現了足以作為「新線索」或「新關係人」的事物（例如：錢包裡有某人的證件、凶器上有某人的指紋），**必須**在報告最後獨立換行，加上對應的標籤：
[新物證|名稱|說明]
[新人證|姓名|與案關係]

範例：
血跡化驗結果顯示，除了死者外，還混雜了另一名有前科的男子血液。
[新人證|張三|血液匹配的毒品前科犯]
`,
        inv_forensic_lab_batch: `
[System: BATCH FORENSIC ANALYSIS]
案件: {{caseName}}
待驗物證清單:
{{evidenceList}}

你是警局鑑識科。對上方每一件物證各出具一份化驗報告。

【強制輸出格式，嚴格遵守，不得更改】
每件物證必須獨立使用一個 [REPORT] 標籤，如果有發現新線索，請緊接在該 REPORT 標籤**之後**換行輸出：

[REPORT|物證名稱|報告內容（約80字，冰冷專業客觀）]
[新物證|名稱|說明] (如果有發現才輸出)
[新人證|姓名|與案關係] (如果有發現才輸出)

規則：
- 必須為清單中每一件物證各輸出一個 [REPORT|...|...] 標籤
- 名稱欄必須與輸入清單中的物證名稱完全一致
- 禁止任何 markdown、對話、旁白、額外說明文字
`,
        inv_evidence_analyze: `
[System: EVIDENCE BRAINSTORMING]
以下是目前收集到的所有物證與線索（包含鑑識科化驗報告）：
{{evidenceList}}

你現在是這場刑偵案件的 GM。探員（隊長：{{agentName}}）與搭檔（{{teamNames}}）正在警局總部的會議室裡，站在巨大的全息白板前梳理案情。
請根據上述線索，生成一段精彩的案情分析討論。角色們應該交叉比對線索、指出矛盾點，並進行推論。

【強制結尾：生成下一步行動方針】
在對話最後，長官（玩家）或小組必須得出一個具體的「下一步調查方向」（例如去某個新地點搜查，或鎖定某個新目標）。
請務必在輸出的最後一行，獨立輸出一行標籤格式：
[NewAction|行動標題|行動具體描述與目標]

【輸出格式絕對限制】
這是一段純 VN 劇情，請嚴格使用以下標籤，絕對不要輸出其他格式（如 Markdown 或純文字敘述）：
旁白/動作：[Nar|動作與場景描述]
角色對話：[Char|角色名|表情|「對話內容」]
行動標籤：[NewAction|行動標題|行動具體描述與目標]

範例：
[Nar|隊長將化驗單釘白板上，用紅筆重重地畫了一條線。]
[Char|搭檔A|think|「等等，如果血跡是死者的，那巷口的監視器時間就對不上了...」]
[Char|{{agentName}}|serious|「沒錯，這代表有人在說謊。我們得重新去查訪那個目擊者提到的地下車庫。」]
[NewAction|搜查地下車庫|前往目擊者提到的B區地下車庫，尋找符合輪胎印的紅色轎車。]
`
    };

    // === 3. 工具函數 ===
    function getChatId() {
        if (win.SillyTavern && win.SillyTavern.getContext) {
            const ctx = win.SillyTavern.getContext();
            if (ctx.chatId) return ctx.chatId;
        }
        return 'default_inv_session';
    }

    async function saveState() {
        if (win.OS_DB && win.OS_DB.saveInvestigationState) {
            const chatId = getChatId();
            const stateToSave = { ...STATE, vnQueue: [], isTyping: false, currentVnMsg: null };
            await win.OS_DB.saveInvestigationState(chatId, stateToSave);
            console.log(`[INV_CORE] 遊戲狀態已儲存至 ${chatId}`);
        }
    }

    async function getAllSaves() {
        if (!win.OS_DB) return [];
        try {
            const db = await win.OS_DB.init();
            return new Promise((resolve) => {
                const tx = db.transaction('investigation_data', 'readonly');
                const store = tx.objectStore('investigation_data');
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });
        } catch(e) {
            console.error('[INV_CORE] getAllSaves error', e);
            return [];
        }
    }

    async function deleteSaves(chatIds) {
        if (!win.OS_DB) return false;
        try {
            const db = await win.OS_DB.init();
            return new Promise((resolve) => {
                const tx = db.transaction('investigation_data', 'readwrite');
                const store = tx.objectStore('investigation_data');
                chatIds.forEach(id => store.delete(id));
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch (e) {
            console.error('[INV_CORE] deleteSaves error', e);
            return false;
        }
    }

    function buildInvestigationContext(targetCaseId = null) {
        let ctx = "";
        let casesToInclude = [];

        if (targetCaseId) {
            const exactCase = STATE.caseList.find(c => c.id === targetCaseId);
            if (exactCase) casesToInclude = [exactCase];
        } else {
            casesToInclude = STATE.caseList.filter(c => STATE.activeCaseStatus[c.id] === 'active');
        }

        if (casesToInclude.length > 0) {
            ctx += "【進行中的案件】\n" + casesToInclude.map(c => `- ${c.displayId}: ${c.title} (${c.location})`).join('\n') + "\n\n";
        }
        
        const filteredEvidence = targetCaseId ? 
            STATE.evidenceLog.filter(e => e.caseId === targetCaseId) : 
            STATE.evidenceLog.filter(e => STATE.activeCaseStatus[e.caseId] === 'active');

        if (filteredEvidence.length > 0) {
            ctx += "【已掌握物證 (證據室)】\n" + filteredEvidence.map(e => `- [${e.caseName}] ${e.item}: ${e.note} ${e.analyzed ? '(鑑識報告: ' + e.forensicReport + ')' : '(尚未鑑識)'}`).join('\n') + "\n\n";
        }
        
        const filteredSuspects = targetCaseId ? 
            STATE.suspectList.filter(s => s.caseId === targetCaseId) : 
            STATE.suspectList.filter(s => STATE.activeCaseStatus[s.caseId] === 'active');

        if (filteredSuspects && filteredSuspects.length > 0) {
            ctx += "【關係人/涉案名單】\n" + filteredSuspects.map(s => `- [${s.caseName}] ${s.name} (${s.desc}) [${s.questioned ? '狀態: 已接受過審問' : '狀態: 尚未傳喚'}]`).join('\n') + "\n\n";
        }

        if (STATE.actionQueue && STATE.actionQueue.length > 0) {
            const pendingActions = STATE.actionQueue.filter(a => a.status === 'pending' && (!targetCaseId || a.caseId === targetCaseId));
            if (pendingActions.length > 0) {
                ctx += "【下一步行動方針 (由會議或調查推論得出)】\n" + pendingActions.map(a => `- 行動目標: ${a.title} (${a.desc})`).join('\n') + "\n\n";
            }
        }

        if (STATE.meetingLogs && STATE.meetingLogs.length > 0) {
            const filteredLogs = targetCaseId ? 
                STATE.meetingLogs.filter(m => m.caseId === targetCaseId) : 
                STATE.meetingLogs.filter(m => STATE.activeCaseStatus[m.caseId] === 'active');
            
            if (filteredLogs.length > 0) {
                ctx += "【會議室推論與對話紀錄】\n" + filteredLogs.map(m => m.log).join('\n\n') + "\n\n";
            }
        }
        
        return ctx || "目前尚無具體線索或進行中的案件。";
    }

    function startInvBgm() {
        if (!STATE.bgmEnabled) return;
        if (!invBgm) {
            invBgm = new Audio(INV_BGM_URL);
            invBgm.loop = true;
            invBgm.volume = 0.4;
        }
        invBgm.play().catch(e => console.warn('[INV] BGM Autoplay blocked', e));
    }

    function stopInvBgm() {
        if (invBgm) {
            invBgm.pause();
            invBgm.currentTime = 0;
        }
    }

    function toggleMusic() {
        STATE.bgmEnabled = !STATE.bgmEnabled;
        const btn = document.getElementById('inv-music-btn');
        if (STATE.bgmEnabled) {
            if (btn) btn.classList.add('active');
            startInvBgm();
        } else {
            if (btn) btn.classList.remove('active');
            stopInvBgm();
        }
    }

    async function callApi(promptKey, userMessage, tempOverride = 1.0, vars = {}) {
        if (isProcessing) return null;
        isProcessing = true;
        try {
            console.log(`[INV] API Call: ${promptKey}`);
            let messages = [];

            let localSysPrompt = BUILTIN_PROMPTS[promptKey] || `執行指令: ${promptKey}`;
            for (const [k, v] of Object.entries(vars)) {
                localSysPrompt = localSysPrompt.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
            }

            if (win.OS_API && typeof win.OS_API.buildContext === 'function') {
                try { messages = await win.OS_API.buildContext(userMessage, promptKey); } 
                catch(e) { console.warn('OS_API.buildContext failed, using fallback.'); }
            }

            if (messages && messages.length > 0) {
                if (messages[0].role === 'system') messages[0].content = localSysPrompt;
                else messages.unshift({ role: 'system', content: localSysPrompt });
            } else {
                messages = [{ role: 'system', content: localSysPrompt }, { role: 'user', content: userMessage || 'Start.' }];
            }

            const config = win.OS_SETTINGS ? win.OS_SETTINGS.getConfig() : { temperature: tempOverride };
            config.temperature = tempOverride;

            return new Promise(resolve => {
                if (win.OS_API && win.OS_API.chat) {
                    win.OS_API.chat(messages, config, null, 
                        (txt) => { isProcessing = false; resolve(txt); },
                        (err) => { console.error(err); isProcessing = false; resolve(null); }
                    );
                } else {
                    isProcessing = false; resolve("[Nar|(API 無法連線)]");
                }
            });
        } catch (e) { isProcessing = false; return null; }
    }

    // === 4. 主邏輯 ===
    async function launchApp(container) {
        currentContainer = container;
        
        const originalGoHome = win.PhoneSystem ? win.PhoneSystem.goHome : null;
        if (win.PhoneSystem) {
            win.PhoneSystem.goHome = () => {
                stopInvBgm();
                if (originalGoHome) originalGoHome();
            };
        }

        const chatId = getChatId();
        let hasSavedData = false;

        if (win.OS_DB && win.OS_DB.getInvestigationState) {
            try {
                const savedState = await win.OS_DB.getInvestigationState(chatId);
                if (savedState && savedState.agentName) {
                    Object.assign(STATE, savedState);
                    if (!STATE.actionQueue) STATE.actionQueue = []; 
                    if (!STATE.meetingLogs) STATE.meetingLogs = [];
                    STATE.vnQueue = [];
                    STATE.isTyping = false;
                    STATE.currentVnMsg = null;
                    if (STATE.typingTimer) { clearInterval(STATE.typingTimer); STATE.typingTimer = null; }
                    hasSavedData = true;
                    console.log(`[INV_CORE] Auto-login for ChatID: ${chatId}`);
                }
            } catch(e) {
                console.warn('[INV_CORE] Load state failed', e);
            }
        }

        if (!hasSavedData || STATE.agentName === '') {
            if (window.VoidTerminal && window.VoidTerminal.getUserName) {
                const globalName = window.VoidTerminal.getUserName();
                if (globalName) STATE.agentName = globalName;
            }
            if (!STATE.agentName) STATE.agentName = '探員'; 
            await saveState(); 
        }

        if (STATE.view === 'INTERROGATION_SESSION') {
            renderInterrogationRoom();
            startInvBgm();
        } else {
            STATE.view = 'STATION';
            renderStation();
            startInvBgm();
            scanForMissedSessions(); 
        }

        if (STATE.caseList.length === 0 && !isGeneratingCases) {
            bgGenerateCases();
        } else if (!hasSavedData) {
            playVnSequence(`[Nar|身後的沉重鐵門自動鎖上，系統語音播報：探員 ${STATE.agentName}，身分驗證通過。]\n[Char|老霍|normal|「連線成功。正在載入您的轄區資料...」]`);
        }
    }

    function openProfileEdit() {
        showModal(`
            <div class="inv-modal-paper" style="background:#1a1a1a; color:#eee; border:1px solid #b91c1c; text-align:center;">
                <h3 style="color:#b91c1c; font-family:'Special Elite'; margin-top:0;">EDIT AGENT PROFILE</h3>
                <div style="margin-bottom:15px; text-align:left;">
                    <span style="font-size:12px; color:#aaa; display:block; margin-bottom:5px;">AGENT ID (探員代號)</span>
                    <input type="text" id="edit-agent-name" value="${STATE.agentName}" style="width:100%; padding:10px; background:#000; color:#fff; border:1px solid #555; font-family:'Courier Prime'; box-sizing:border-box; outline:none;">
                </div>
                <button class="inv-btn inv-btn-primary" onclick="window.INV_CORE.saveProfileEdit()">SAVE & UPDATE</button>
                <button class="inv-btn" onclick="window.INV_CORE.closeModal()">CANCEL</button>
            </div>
        `);
    }

    function saveProfileEdit() {
        const newName = document.getElementById('edit-agent-name').value.trim() || '探員';
        STATE.agentName = newName;
        saveState();
        closeModal();
        renderStation(); 
        playVnSequence(`[Nar|系統資料已更新。]\n[Char|老霍|normal|「代號更新完畢，${STATE.agentName}，別光顧著改名字，案子還在等你。」]`);
    }

    async function openSaveManager() {
        const saves = await getAllSaves();
        let html = `
            <div class="inv-slide-header">
                <div class="inv-title">ARCHIVE MANAGER<br><span style="font-size:10px;color:#888;">// 歷史檔案管理 //</span></div>
                <div class="inv-back-btn" onclick="window.INV_CORE.closeSlide()">✕</div>
            </div>
            <div class="inv-slide-content">
                <div style="font-size:12px; color:#aaa; margin-bottom:15px; line-height:1.5;">
                    清理不再需要的歷史案件資料，釋放系統空間。<br>
                    <span style="color:#b91c1c;">注意：刪除後將無法恢復該對話的調查進度。</span>
                </div>
                <div style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <label style="font-size:12px; cursor:pointer; color:#b91c1c; display:flex; align-items:center; gap:5px;">
                        <input type="checkbox" onchange="window.INV_CORE.toggleAllSaves(this)" style="accent-color:#b91c1c;"> 全選
                    </label>
                    <button class="inv-btn" style="width:auto; padding:5px 10px; margin:0; border-color:#b91c1c; color:#b91c1c; background:rgba(185,28,28,0.1);" onclick="window.INV_CORE.deleteSelectedSaves()">🗑️ 刪除選定</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
        `;

        if (saves.length === 0) {
            html += `<div style="text-align:center; color:#666; font-size:12px; padding:20px;">資料庫中尚無歷史檔案</div>`;
        } else {
            saves.forEach(s => {
                const casesCount = s.caseList ? s.caseList.length : 0;
                const agent = s.agentName || '未知探員';
                html += `
                    <div style="background:#111; border:1px solid #333; padding:10px; display:flex; align-items:flex-start; gap:10px; border-left:3px solid #b91c1c;">
                        <input type="checkbox" class="save-cb" value="${s.id}" style="margin-top:4px; accent-color:#b91c1c;">
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:bold; color:#fff; font-size:13px; word-break:break-all; margin-bottom:4px;">ID: ${s.id}</div>
                            <div style="font-size:11px; color:#ccc; margin-bottom:2px;">探員代號: <span style="color:#b91c1c;">${agent}</span></div>
                            <div style="font-size:10px; color:#666;">案件數: ${casesCount}</div>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div></div>`;
        showSlide(html);
    }

    function toggleAllSaves(checkbox) {
        document.querySelectorAll('.save-cb').forEach(cb => cb.checked = checkbox.checked);
    }

    async function deleteSelectedSaves() {
        const checked = Array.from(document.querySelectorAll('.save-cb:checked')).map(cb => cb.value);
        if (checked.length === 0) {
            alert("請先勾選要刪除的檔案。");
            return;
        }
        if (confirm(`警告：確定要刪除這 ${checked.length} 筆歷史檔案嗎？此操作無法復原。`)) {
            await deleteSaves(checked);
            openSaveManager(); 
        }
    }

    function openDataManager() {
        let html = `
            <div class="inv-slide-header">
                <div class="inv-title">DATABASE MANAGER<br><span style="font-size:10px;color:#888;">// 記憶與回溯系統 //</span></div>
                <div class="inv-back-btn" onclick="window.INV_CORE.closeSlide()">✕</div>
            </div>
            <div class="inv-slide-content">
                <div style="font-size:12px; color:#aaa; margin-bottom:15px; line-height:1.5;">
                    在這裡管理所有已保存的案件與證據數據。如果想<span style="color:#b91c1c;">重置某個環節</span>，請勾選並刪除它（刪除後會自動保存）。
                </div>
        `;

        const buildSection = (title, items, typePrefix, displayFunc) => {
            if (!items || items.length === 0) return '';
            let sec = `<div style="margin-bottom:20px; border:1px solid #444; padding:10px; background:#111;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed #555; padding-bottom:5px; margin-bottom:10px;">
                    <strong style="color:#b91c1c;">${title}</strong>
                    <label style="font-size:12px; cursor:pointer;"><input type="checkbox" onchange="window.INV_CORE.toggleAllCheckboxes(this, '${typePrefix}')"> 全選</label>
                </div>`;
            items.forEach((item, idx) => {
                sec += `
                    <div style="display:flex; align-items:flex-start; margin-bottom:8px; font-size:12px; color:#ccc;">
                        <input type="checkbox" class="data-cb ${typePrefix}-cb" data-type="${typePrefix}" data-idx="${idx}" style="margin-right:8px; margin-top:2px; accent-color:#b91c1c;">
                        <div style="flex:1; line-height:1.4;">${displayFunc(item, idx)}</div>
                    </div>`;
            });
            sec += `</div>`;
            return sec;
        };

        html += buildSection('📂 案件列表 (Cases)', STATE.caseList, 'case', (c) => `[${c.displayId}] ${c.title} - 狀態: ${STATE.activeCaseStatus[c.id] || '未接案'}`);
        html += buildSection('🔎 收集物證 (Evidences)', STATE.evidenceLog, 'ev', (e) => `[${e.caseName}] ${e.item}: ${e.note.substring(0,40)}...`);
        html += buildSection('👤 關係人/嫌疑人 (Suspects)', STATE.suspectList, 'sus', (s) => `[${s.caseName}] ${s.name} - ${s.questioned ? '已審問' : '未審問'}`);
        html += buildSection('📝 審問筆錄 (Interrogations)', STATE.interrogationLog, 'ilog', (l) => `[${l.caseName}] ${l.summary.substring(0,40)}...`);
        html += buildSection('🎯 行動方針 (Action Plans)', STATE.actionQueue, 'act', (a) => `[狀態:${a.status}] ${a.title}`);
        html += buildSection('🗣️ 會議紀錄 (Meetings)', STATE.meetingLogs, 'mlog', (m) => `[${m.caseName}] ${m.log.substring(0,50).replace(/\\n/g, ' ')}...`);

        html += `
            <div style="position:sticky; bottom:-15px; background:rgba(15,15,15,0.95); padding:15px 0; border-top:1px solid #b91c1c; text-align:center; z-index:10;">
                <button class="inv-btn inv-btn-primary" onclick="window.INV_CORE.deleteSelectedData()">⚠️ 刪除所選數據 (執行回溯)</button>
            </div>
        `;
        html += `</div>`;
        showSlide(html);
    }

    function toggleAllCheckboxes(masterCheckbox, typePrefix) {
        const cbs = document.querySelectorAll(`.${typePrefix}-cb`);
        cbs.forEach(cb => cb.checked = masterCheckbox.checked);
    }

    function deleteSelectedData() {
        const cbs = document.querySelectorAll('.data-cb:checked');
        if (cbs.length === 0) { alert("請先勾選要刪除的項目。"); return; }
        if (!confirm("警告：刪除後無法恢復。確定要刪除這些數據嗎？這將改變案件目前的進度。")) return;
        
        let toDelete = { case: [], ev: [], sus: [], ilog: [], act: [], mlog: [] };
        cbs.forEach(cb => {
            toDelete[cb.dataset.type].push(parseInt(cb.dataset.idx));
        });

        const keepUnselected = (arr, indicesToDelete) => arr.filter((_, idx) => !indicesToDelete.includes(idx));

        if (toDelete.case.length > 0) {
            const removedCases = toDelete.case.map(idx => STATE.caseList[idx].id);
            STATE.caseList = keepUnselected(STATE.caseList, toDelete.case);
            removedCases.forEach(id => delete STATE.activeCaseStatus[id]);
        }
        if (toDelete.ev.length > 0) STATE.evidenceLog = keepUnselected(STATE.evidenceLog, toDelete.ev);
        if (toDelete.sus.length > 0) STATE.suspectList = keepUnselected(STATE.suspectList, toDelete.sus);
        if (toDelete.ilog.length > 0) STATE.interrogationLog = keepUnselected(STATE.interrogationLog, toDelete.ilog);
        if (toDelete.act.length > 0) STATE.actionQueue = keepUnselected(STATE.actionQueue, toDelete.act);
        if (toDelete.mlog.length > 0) STATE.meetingLogs = keepUnselected(STATE.meetingLogs, toDelete.mlog);

        saveState();
        alert("已成功刪除選定的數據。");
        openDataManager(); 
        renderStation();   
    }

    async function bgGenerateCases() {
        isGeneratingCases = true;
        const res = await callApi('inv_case_gen', '[System: Generate New Cases]');
        
        let cases = [];
        let dispatcherName = '老霍'; 
        let generatedDialogue = ''; 

        if (res) {
            let cleanNarrativeText = res;
            const caseRegex = /\[Case\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]/g;
            let match;
            while ((match = caseRegex.exec(res)) !== null) {
                cases.push({
                    title: match[1].trim(), reporter: match[2].trim(), description: match[3].trim(),
                    location: match[4].trim(), budget: parseInt(match[5].trim()) || 0,
                    difficulty: match[6].trim(), evidenceTags: match[7].split(',').map(s => s.trim()).filter(s => s),
                    type: '案件'
                });
            }
            cleanNarrativeText = cleanNarrativeText.replace(/\[Case\|[^\]]+\]/gi, '').replace(/<\/?content>/ig, '').trim();
            generatedDialogue = cleanNarrativeText;
        }
        
        if (cases.length > 0) {
            STATE.caseList = cases;
            STATE.dispatcher.name = dispatcherName;
        }

        STATE.caseList = STATE.caseList.map((c, idx) => ({ ...c, id: `case_${Date.now()}_${idx}`, displayId: `#${idx + 101}` }));

        if(STATE.currentSpeakerId === 'dispatcher') {
            if (generatedDialogue && generatedDialogue.includes('[Char')) playVnSequence(generatedDialogue);
            else playVnSequence(`[Char|老霍|normal|「行動清單已更新，請從面板查看最新情報。」]`);
        }

        isGeneratingCases = false;
        updateActionButtonsState();
        saveState();
    }

    function getCurrentContextInfo() {
        let bgUrl = BG_MAP.office;
        let avatarUrl = STATE.dispatcher.avatarUrl;
        let name = STATE.dispatcher.name;
        
        if (STATE.currentSpeakerId === 'meeting') {
            bgUrl = BG_MAP.meeting;
            avatarUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; 
            name = STATE.partnerList.length > 0 ? '專案小組' : '個人推論';
        } else if (STATE.currentSpeakerId.startsWith('partner_')) {
            const idx = parseInt(STATE.currentSpeakerId.split('_')[1]);
            const p = STATE.partnerList[idx];
            if (p) {
                bgUrl = BG_MAP.meeting;
                avatarUrl = p.avatarUrl || `https://api.dicebear.com/7.x/micah/svg?seed=${encodeURIComponent(p.name)}`;
                name = p.name;
            }
        }
        return { bgUrl, avatarUrl, name };
    }

    function renderStation() {
        const context = getCurrentContextInfo();
        const isActionDisabled = isGeneratingCases ? 'disabled' : '';

        currentContainer.innerHTML = `
            <div class="inv-container">
                <div class="inv-header">
                    <div class="inv-back-btn" onclick="window.PhoneSystem.goHome()">‹</div>
                    <div class="inv-title">
                        <div>DB // TERMINAL</div>
                        <div style="font-size:10px; color:#aaa; font-family:'Courier Prime'; display:flex; align-items:center; gap:5px;">
                            ${STATE.agentName}
                            <span style="cursor:pointer; color:#b91c1c;" onclick="window.INV_CORE.openProfileEdit()" title="編輯探員代號">✏️</span>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <div id="inv-music-btn" class="inv-music-toggle ${STATE.bgmEnabled?'active':''}" onclick="window.INV_CORE.toggleMusic()" title="切換 BGM">🎧</div>
                        <div style="width:30px; cursor:pointer; text-align:right;" onclick="window.INV_CORE.bgGenerateCases()" title="刷新案件">↻</div>
                    </div>
                </div>
                
                <div class="inv-main-room" style="background-image: url('${context.bgUrl}');">
                    <div class="inv-char-area">
                        <img class="inv-char-img" src="" style="display:none;">
                        
                        <div class="inv-vn-wrapper">
                            <div class="inv-vn-box" onclick="window.INV_CORE.advanceVn()">
                                <div class="inv-vn-name" id="inv-vn-name" style="display:none;">${context.name}</div>
                                <div class="inv-vn-text" id="inv-vn-text"></div>
                                <div class="inv-vn-next" id="inv-vn-next">▼</div>
                            </div>
                        </div>
                    </div>

                    <div class="inv-action-area">
                        <button class="inv-action-btn" title="切換對話對象" onclick="window.INV_CORE.openRoster()">👥</button>
                        <button class="inv-action-btn action-needs-enable" ${isActionDisabled} title="行動清單" onclick="window.INV_CORE.openActionList()">📋</button>
                        <button class="inv-action-btn action-needs-enable" ${isActionDisabled} title="外出勘查" onclick="window.INV_CORE.openFieldMission()">🔍</button>
                        <button class="inv-action-btn action-needs-enable" ${isActionDisabled} title="審問室" onclick="window.INV_CORE.openInterrogation()">💬</button>
                        <button class="inv-action-btn action-needs-enable" ${isActionDisabled} title="證物室" onclick="window.INV_CORE.openEvidence()">🗃</button>
                        <button class="inv-action-btn action-needs-enable" ${isActionDisabled} title="歷史檔案管理" style="border-color:#b91c1c; color:#b91c1c;" onclick="window.INV_CORE.openSaveManager()">📂</button>
                        <button class="inv-action-btn action-needs-enable" ${isActionDisabled} title="數據庫與回溯" style="margin-top:20px; border-color:#b91c1c; color:#b91c1c;" onclick="window.INV_CORE.openDataManager()">💾</button>
                    </div>

                    <div class="inv-chat-bar">
                        <input id="inv-chat-input" class="inv-input-field" placeholder="與 ${context.name} 對話..." onkeypress="if(event.key==='Enter') window.INV_CORE.sendChatMessage()">
                        <button class="inv-send-btn" title="重試上一條訊息" onclick="window.INV_CORE.retryChatMessage()" style="background:#333; margin-right:4px;">🔄</button>
                        <button class="inv-send-btn" onclick="window.INV_CORE.sendChatMessage()">➤</button>
                    </div>
                </div>

                <div id="inv-slide-layer" class="inv-modal-slide"></div>
                <div id="inv-modal-layer" class="inv-modal-overlay"></div>
            </div>
        `;
        
        if (STATE.isTyping || STATE.vnQueue.length > 0) advanceVn(); 
        else document.getElementById('inv-vn-text').innerHTML = `<span style="color:#888; font-style:italic;">(等待指示中...)</span>`;
    }

    function updateActionButtonsState() {
        const btns = document.querySelectorAll('.action-needs-enable');
        btns.forEach(b => {
            if(isGeneratingCases) b.setAttribute('disabled', 'true');
            else b.removeAttribute('disabled');
        });
    }

    // --- VN 系統邏輯 ---
    function parseVnText(rawText, defaultName) {
        const queue = [];
        const regex = /\[\s*(Nar|Char|Audio|BGM|Bg|System|Sys)\s*\|\s*([^\]]+)\]/gi;
        let match; let foundTags = false;
        
        while ((match = regex.exec(rawText)) !== null) {
            foundTags = true;
            const type = match[1].trim().toLowerCase();
            const parts = match[2].split('|').map(s => s.trim());
            
            if (type === 'nar') queue.push({ type: 'Nar', text: parts[0] });
            else if (type === 'char') {
                let cName = parts[0] || defaultName;
                let cExp = 'normal';
                let cText = '';
                if (parts.length >= 3) { cExp = parts[1]; cText = parts.slice(2).join('|'); } 
                else if (parts.length === 2) { cText = parts[1]; } 
                else { cText = parts[0] || ''; }
                queue.push({ type: 'Char', name: cName, exp: cExp, text: cText });
            }
        }
        
        if (!foundTags) {
            const clean = rawText.replace(/<\/?content>/ig, '').trim();
            if(clean) queue.push({ type: 'Char', name: defaultName, text: clean });
        }
        return queue;
    }

    function vnToPlainText(rawText, defaultName) {
        const queue = parseVnText(rawText, defaultName);
        let result = [];
        queue.forEach(msg => {
            if (msg.type === 'Nar') result.push(`(${msg.text})`);
            else if (msg.type === 'Char') result.push(`${msg.name}: ${msg.text}`);
        });
        return result.join('\n');
    }

    function playVnSequence(rawText) {
        let defaultName = STATE.view === 'INTERROGATION_SESSION' ? STATE.suspectList[STATE.currentInterrogationIdx].name : getCurrentContextInfo().name;
        STATE.vnQueue = parseVnText(rawText, defaultName);
        STATE.isTyping = false;
        if (STATE.typingTimer) clearInterval(STATE.typingTimer);
        advanceVn();
    }

    function advanceVn() {
        const textContent = document.getElementById('inv-vn-text');
        const nameBox = document.getElementById('inv-vn-name');
        const nextInd = document.getElementById('inv-vn-next');
        const imgEl = document.querySelector('.inv-char-img');
        if (!textContent || !nameBox) return;

        if (STATE.isTyping) {
            clearInterval(STATE.typingTimer);
            STATE.isTyping = false;
            if (STATE.currentVnMsg && STATE.currentVnMsg.type === 'Nar') textContent.innerHTML = `<span style="color:#888; font-style:italic;">${vnFullText}</span>`;
            else textContent.innerText = vnFullText;
            if (nextInd && STATE.vnQueue.length > 0) nextInd.style.display = 'block';
            return;
        }

        if (STATE.vnQueue.length === 0) {
            if (nextInd) nextInd.style.display = 'none';
            return;
        }

        const msg = STATE.vnQueue.shift();
        STATE.currentVnMsg = msg;
        if (nextInd) nextInd.style.display = 'none';
        
        if (msg.type === 'Nar') {
            nameBox.style.display = 'none';
            vnFullText = msg.text;
        } else {
            nameBox.style.display = 'block';
            nameBox.innerText = msg.name;
            vnFullText = msg.text;

            const isMeeting = STATE.currentSpeakerId === 'meeting';
            if (imgEl) {
                if (isMeeting) {
                    imgEl.style.display = 'none';
                } else if (msg.name.includes('老霍') || msg.name === 'HQ') {
                    imgEl.src = HQ_AVATARS['老霍']; imgEl.style.display = '';
                } else if (msg.name.includes('維拉')) {
                    imgEl.src = HQ_AVATARS['維拉']; imgEl.style.display = '';
                }
            }
        }

        STATE.isTyping = true;
        textContent.innerHTML = '';
        let i = 0; const speed = 30;
        
        STATE.typingTimer = setInterval(() => {
            if (i < vnFullText.length) {
                let partial = vnFullText.substring(0, i + 1);
                if (msg.type === 'Nar') textContent.innerHTML = `<span style="color:#888; font-style:italic;">${partial}</span>`;
                else textContent.innerText = partial;
                i++;
            } else {
                clearInterval(STATE.typingTimer);
                STATE.isTyping = false;
                if (nextInd && STATE.vnQueue.length > 0) nextInd.style.display = 'block';
            }
        }, speed);
    }

    async function retryChatMessage() {
        if (!lastChatMsg || isProcessing) return;
        const input = document.getElementById('inv-chat-input');
        if (input) input.value = lastChatMsg;
        await sendChatMessage();
    }

    async function sendChatMessage() {
        if (isProcessing) return;
        const input = document.getElementById('inv-chat-input');
        const text = input.value.trim();
        if (!text) return;
        lastChatMsg = text;
        input.value = '';
        
        const nameBox = document.getElementById('inv-vn-name');
        const textBox = document.getElementById('inv-vn-text');
        if(nameBox) nameBox.style.display = 'none';
        if(textBox) textBox.innerHTML = `<span style="color:#888; font-style:italic;">(傳送訊號中...)</span>`;

        let speakerName = STATE.dispatcher.name || 'HQ';
        let speakerRole = '調派員 / 長官';
        let speakerPersonality = '專業、簡潔、提供情報';

        if (STATE.currentSpeakerId === 'meeting') {
            if(STATE.partnerList.length > 0) {
                speakerName = STATE.partnerList.map(p=>p.name).join('與');
                speakerRole = '刑偵專案小組';
                speakerPersonality = '你們正在會議室分析案情，根據各自專長（' + STATE.partnerList.map(p=>(p.specialties||[]).join(',')).join('、') + '）進行熱烈討論。';
            } else {
                speakerName = '主角自己';
                speakerRole = '探員獨自分析';
                speakerPersonality = '冷靜的自言自語與大腦風暴。';
            }
        } else if (STATE.currentSpeakerId.startsWith('partner_')) {
            const idx = parseInt(STATE.currentSpeakerId.split('_')[1]);
            const p = STATE.partnerList[idx];
            if (p) {
                speakerName = p.name;
                speakerRole = p.rank || '探員';
                speakerPersonality = `${p.personality || ''}。專長: ${(p.specialties||[]).join(',')}`;
            }
        }

        const vars = {
            officerName: speakerName,
            officerRole: speakerRole,
            officerPersonality: speakerPersonality,
            agentName: STATE.agentName,
            investigationContext: buildInvestigationContext() 
        };

        const res = await callApi('inv_officer_chat', `[User]: ${text}`, 0.8, vars);
        
        if (res) {
            const cleanRes = res.replace(/^"|"$/g, '').replace(/<\/?content>/ig, '').trim();
            playVnSequence(cleanRes);
        }
    }

    function openRoster() {
        let html = `
            <div class="inv-slide-header">
                <div class="inv-title">PERSONNEL ROSTER</div>
                <div class="inv-back-btn" onclick="window.INV_CORE.closeSlide()">✕</div>
            </div>
            <div class="inv-slide-content">
                <div style="font-size:12px; color:#888; margin-bottom:15px;">選擇要交談的對象，或請求總部派遣新探員。</div>
                
                <div style="background:#111; border:1px solid ${STATE.currentSpeakerId === 'dispatcher' ? '#b91c1c' : '#333'}; padding:10px; margin-bottom:10px; display:flex; gap:10px; align-items:center; cursor:pointer;" onclick="window.INV_CORE.switchSpeaker('dispatcher')">
                    <div style="width:40px; height:40px; background:url('${STATE.dispatcher.avatarUrl}') center/cover; border-radius:50%; border:2px solid #555;"></div>
                    <div style="flex:1;">
                        <div style="font-weight:bold; color:#fff;">${STATE.dispatcher.name}</div>
                        <div style="font-size:10px; color:#b91c1c;">[HQ 調派中心]</div>
                    </div>
                </div>
        `;

        STATE.partnerList.forEach((p, idx) => {
            const pid = `partner_${idx}`;
            const avatar = p.avatarUrl || `https://api.dicebear.com/7.x/micah/svg?seed=${encodeURIComponent(p.name)}`;
            html += `
                <div style="background:#111; border:1px solid ${STATE.currentSpeakerId === pid ? '#b91c1c' : '#333'}; padding:10px; margin-bottom:10px; display:flex; gap:10px; align-items:center; cursor:pointer;" onclick="window.INV_CORE.switchSpeaker('${pid}')">
                    <div style="width:40px; height:40px; background:url('${avatar}') center/cover; border-radius:50%; border:2px solid #555;"></div>
                    <div style="flex:1;">
                        <div style="font-weight:bold; color:#fff;">${p.name}</div>
                        <div style="font-size:10px; color:#888;">${p.rank || '探員'}</div>
                    </div>
                    <button class="inv-btn" style="width:auto; padding:5px 10px; margin:0; background:transparent; border:1px solid #555; color:#888;" onclick="event.stopPropagation(); window.INV_CORE.firePartner(${idx})">解僱</button>
                </div>
            `;
        });

        html += `
                <button class="inv-btn inv-btn-primary" style="margin-top:20px;" onclick="window.INV_CORE.generatePartners()">請求人員支援 (維拉主任)</button>
            </div>
        `;
        showSlide(html);
    }

    function switchSpeaker(id) {
        STATE.currentSpeakerId = id;
        closeSlide();
        renderStation();
        
        const context = getCurrentContextInfo();
        playVnSequence(`[Nar|你轉向 ${context.name}。]\n[Char|${context.name}|normal|「需要什麼協助嗎，長官？」]`);
    }

    function firePartner(idx) {
        if (confirm(`確定要解僱 ${STATE.partnerList[idx].name} 嗎？`)) {
            const pid = `partner_${idx}`;
            if (STATE.currentSpeakerId === pid) STATE.currentSpeakerId = 'dispatcher';
            STATE.partnerList.splice(idx, 1);
            saveState();
            openRoster(); 
        }
    }

    function openActionList() {
        let html = `
            <div class="inv-slide-header">
                <div class="inv-title">ACTION LIST<br><span style="font-size:10px;color:#888;">// 任務與行動方針 //</span></div>
                <div class="inv-back-btn" onclick="window.INV_CORE.closeSlide()">✕</div>
            </div>
            <div class="inv-slide-content">
        `;

        if (!STATE.actionQueue) STATE.actionQueue = [];
        const pendingActions = STATE.actionQueue.filter(a => a.status === 'pending');
        
        if (pendingActions.length > 0) {
            html += `<h3 style="color:#b91c1c; font-family:'Courier Prime'; border-bottom:1px dashed #555; padding-bottom:5px;">[ 待執行的搜查方針 ]</h3>`;
            pendingActions.forEach((aq, idx) => {
                html += `
                    <div style="background:#1a1a1a; border:1px solid #b91c1c; border-left:4px solid #b91c1c; padding:12px; margin-bottom:12px; border-radius:2px;">
                        <div style="font-weight:bold; color:#fff; font-size:16px;">🎯 ${aq.title}</div>
                        <div style="font-size:12px; color:#aaa; margin-top:5px; line-height:1.5;">${aq.desc}</div>
                        <div style="margin-top:10px; display:flex; justify-content:flex-end;">
                            <button class="inv-btn inv-btn-primary" style="width:auto; padding:6px 12px; font-size:12px; margin:0;" onclick="window.INV_CORE.closeSlide(); window.INV_CORE.openFieldMission('${aq.id}')">執行此方針 (外出勘查)</button>
                        </div>
                    </div>
                `;
            });
        }

        html += `<h3 style="color:#888; font-family:'Courier Prime'; border-bottom:1px dashed #444; padding-bottom:5px; margin-top:20px;">[ 轄區案件總覽 ]</h3>`;

        if (STATE.caseList.length === 0) {
            html += `<div style="text-align:center; margin-top:20px; color:#666;">無待辦案件。</div>`;
        } else {
            STATE.caseList.forEach((c, idx) => {
                const status = STATE.activeCaseStatus[c.id];
                const statusTag = status === 'resolved' ? '<span class="inv-tag" style="background:#050;">已結案</span>' :
                                  status === 'active' ? '<span class="inv-tag" style="background:#b91c1c;">調查中</span>' :
                                  '<span class="inv-tag" style="background:#555;">待接案</span>';

                html += `
                    <div class="inv-file-folder" style="${status === 'resolved' ? 'opacity:0.6;' : ''}" onclick="window.INV_CORE.viewCaseDetail(${idx})">
                        <div class="inv-case-title">${c.displayId}: ${c.title}</div>
                        <div style="font-size:13px; line-height:1.4; margin-bottom:8px;">${c.description}</div>
                        <div class="inv-case-meta">
                            <span>📍 ${c.location || '未知'}</span>
                            <span style="color:#b91c1c;">${c.difficulty || 'Normal'}</span>
                            ${statusTag}
                        </div>
                    </div>
                `;
            });
        }
        html += `</div>`;
        showSlide(html);
    }

    function viewCaseDetail(idx) {
        const c = STATE.caseList[idx];
        const isResolved = STATE.activeCaseStatus[c.id] === 'resolved';
        const isActive = STATE.activeCaseStatus[c.id] === 'active';

        let btnHtml = '';
        if (isResolved) {
            btnHtml = `<button class="inv-btn" disabled>案件已關閉</button>`;
        } else if (isActive) {
            btnHtml = `<button class="inv-btn inv-btn-primary" onclick="window.INV_CORE.closeModal(); window.INV_CORE.closeSlide(); window.INV_CORE.openFieldMission()">前往現場勘查</button>`;
        } else {
            btnHtml = `<button class="inv-btn inv-btn-primary" onclick="window.INV_CORE.acceptCase(${idx})">接下此案</button>`;
        }

        const modalHtml = `
            <div class="inv-modal-paper" onclick="event.stopPropagation()">
                <div class="inv-paper-clip"></div>
                <h2 style="font-family:'Special Elite'; text-decoration:underline; margin-top:0;">CASE FILE: ${c.title}</h2>
                <div style="display:flex; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
                    <span class="inv-tag">TYPE: ${c.type}</span>
                    <span class="inv-tag">RISK: ${c.difficulty}</span>
                    <span class="inv-tag">LOC: ${c.location}</span>
                </div>
                <div class="typewriter-text">${c.description}</div>
                <hr style="border:0; border-bottom:1px solid #ccc; margin:15px 0;">
                <div style="background:#e8e8e8; padding:10px; border:1px solid #ccc;">
                    <div style="font-weight:bold; margin-bottom:5px;">EVIDENCE TAGS:</div>
                    <div style="font-family:monospace; font-size:12px;">${(c.evidenceTags || []).join(', ') || '暫無初步線索'}</div>
                </div>
                <div style="margin-top:20px; text-align:center;">
                    ${btnHtml}
                    <button class="inv-btn" onclick="window.INV_CORE.closeModal()">返回</button>
                </div>
            </div>
        `;
        showModal(modalHtml);
    }

    async function acceptCase(idx) {
        const c = STATE.caseList[idx];
        STATE.activeCaseStatus[c.id] = 'active';
        
        showModal(`
            <div class="inv-modal-paper" style="background:#1a1a1a; color:#eee; background-image:none; text-align:center;" onclick="event.stopPropagation()">
                <h2 style="font-family:'Special Elite'; color:#b91c1c; margin-top:0;">連線總局資料庫...</h2>
                <div style="margin: 20px 0; font-size: 14px; color: #888;">正在為案件「${c.title}」建構內部卷宗（生成真相），請稍候。</div>
                <div style="margin:0 auto; width:40px; height:40px; border:2px solid #555; border-top:2px solid #b91c1c; border-radius:50%; animation:spin 1s infinite linear;"></div>
            </div>
        `);

        const promptStr = `案件名稱：${c.title} \n案件描述：${c.description} \n發生地點：${c.location} \n請為此案生成詳細的真相檔案。`;
        const truthRes = await callApi('inv_case_truth', promptStr, 1.0);

        saveState();
        closeModal();
        openActionList(); 
        
        STATE.currentSpeakerId = 'dispatcher';
        renderStation();
        playVnSequence(`[Char|老霍|normal|「已收到。案件 ${c.displayId} 交給你了，內部卷宗已備份至資料庫，動作快點，維拉還等著這份預算清單呢。」]`);
    }

    function openFieldMission(preselectedActionId = null) {
        if (preselectedActionId) {
            const action = STATE.actionQueue.find(a => a.id === preselectedActionId);
            if (action) {
                startFieldMission(action.caseId, action);
                return;
            }
        }

        const activeCases = STATE.caseList.filter(c => STATE.activeCaseStatus[c.id] === 'active');
        if (activeCases.length === 0) {
            playVnSequence(`[Nar|(翻找了一下紀錄)]\n[Char|老霍|normal|「你手上沒半個案子，去檔案室發呆嗎？去行動清單確認一下。」]`);
            return;
        }

        let optionsHtml = '';
        
        const pendingActions = STATE.actionQueue.filter(a => a.status === 'pending');
        if (pendingActions.length > 0) {
            optionsHtml += `<div style="color:#b91c1c; font-size:12px; margin-bottom:8px; font-weight:bold;">[ 明確的搜查方針 ]</div>`;
            optionsHtml += pendingActions.map(a => `
                <div style="padding:10px; border:1px solid #b91c1c; margin-bottom:10px; cursor:pointer; background:rgba(185,28,28,0.1);" 
                     onclick="window.INV_CORE.startFieldMission('${a.caseId}', '${a.id}')"
                     onmouseover="this.style.background='rgba(185,28,28,0.2)'" onmouseout="this.style.background='rgba(185,28,28,0.1)'">
                    <div style="font-weight:bold; color:#fff;">🎯 ${a.title}</div>
                    <div style="font-size:12px; color:#ccc; margin-top:4px;">${a.desc}</div>
                </div>
            `).join('');
        }

        optionsHtml += `<div style="color:#888; font-size:12px; margin:bottom:8px; margin-top:15px; font-weight:bold;">[ 基礎案件勘查 ]</div>`;
        optionsHtml += activeCases.map(c => `
            <div style="padding:10px; border:1px solid #555; margin-bottom:10px; cursor:pointer; background:#111;" 
                 onclick="window.INV_CORE.startFieldMission('${c.id}')"
                 onmouseover="this.style.borderColor='#b91c1c'" onmouseout="this.style.borderColor='#555'">
                <div style="font-weight:bold; color:#fff;">${c.title}</div>
                <div style="font-size:12px; color:#888;">📍 ${c.location} | ${c.difficulty}</div>
            </div>
        `).join('');

        const modalHtml = `
            <div class="inv-modal-paper" style="background:#1a1a1a; color:#eee; background-image:none;" onclick="event.stopPropagation()">
                <h2 style="font-family:'Special Elite'; color:#fff; border-bottom:1px solid #b91c1c; padding-bottom:10px; margin-top:0;">FIELD DEPLOYMENT</h2>
                <div style="color:#aaa; font-size:12px; margin-bottom:15px;">選擇要前往勘查的目標。系統將自動配置你當前警局內的搭檔同行。</div>
                <div style="max-height: 50vh; overflow-y: auto; padding-right: 5px;">
                    ${optionsHtml}
                </div>
                <button class="inv-btn" style="margin-top:20px;" onclick="window.INV_CORE.closeModal()">取消</button>
            </div>
        `;
        showModal(modalHtml);
    }

    async function startFieldMission(caseId, actionIdOrObj = null) {
        const c = STATE.caseList.find(x => x.id === caseId);
        if (!c) return;

        let specificObjective = "進行初步現場勘驗與搜查";
        let sessionLabel = c.title + ' 現場勘查';

        if (actionIdOrObj) {
            let action = typeof actionIdOrObj === 'string' ? STATE.actionQueue.find(a => a.id === actionIdOrObj) : actionIdOrObj;
            if (action) {
                specificObjective = `【專項行動】開始新行動，已從警局出發至新任務 ${action.title} - ${action.desc}`;
                sessionLabel = action.title;
                action.status = 'resolved'; 
                saveState();
            }
        }

        stopInvBgm();
        closeModal();
        currentContainer.innerHTML = `
            <div class="inv-container" style="justify-content:center; align-items:center; background:#000;">
                <div class="inv-title" style="font-size:30px; color:#b91c1c;">DEPLOYING...</div>
                <div style="font-family:'Courier Prime'; color:#fff; margin-top:20px;">連接 VN 視覺引擎...</div>
            </div>
        `;

        const teamNames = STATE.partnerList.length > 0 ? STATE.partnerList.map(p => p.name).join(', ') : '無(單人)';

        if (win.OS_BRIDGE && typeof win.OS_BRIDGE.startSession === 'function') {
            win.OS_BRIDGE.startSession(c.id, sessionLabel);
        }

        const vars = {
            caseTitle: c.title, caseType: c.type || '未知', caseDifficulty: c.difficulty || '普通',
            agentName: STATE.agentName, teamNames: teamNames, caseId: c.id,
            currentObjective: specificObjective
        };

        let sysPrompt = BUILTIN_PROMPTS['inv_field_brief'];
        for (const [k, v] of Object.entries(vars)) { sysPrompt = sysPrompt.replace(new RegExp(`{{${k}}}`, 'g'), v); }

        if (win.TavernHelper) {
             await win.TavernHelper.createChatMessages([{ role: 'user', name: 'System', message: sysPrompt }], { refresh: 'affected' });
        }

        setTimeout(() => {
            if (win.PhoneSystem) win.PhoneSystem.goHome();
            const panel = document.querySelector('#aurelia-panel-container');
            if (panel) panel.style.transform = 'translateX(100%)';
        }, 2000);
    }

    async function generatePartners() {
        if (STATE.partnerList.length >= 4) { alert("警局名單已滿，請先解僱現有人員。"); return; }
        closeSlide();
        showModal(`
            <div class="inv-modal-paper" style="background:#1a1a1a; color:#eee; background-image:none; text-align:center;" onclick="event.stopPropagation()">
                <h2 style="font-family:'Special Elite'; color:#b91c1c; margin-top:0;">連線總局人事部...</h2>
                <div style="margin: 20px 0; font-size: 14px; color: #888;">正在檢索可用的人員檔案，請稍候。</div>
                <div style="margin:0 auto; width:40px; height:40px; border:2px solid #555; border-top:2px solid #b91c1c; border-radius:50%; animation:spin 1s infinite linear;"></div>
            </div>
        `);

        const res = await callApi('inv_partner_gen', `[System] 請求支援。請調派 4 名適合刑偵調查的探員。`, 1.0);

        let candidates = [];
        if (res) {
            let cleanNarrativeText = res;
            const partnerRegex = /\[Partner\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]/g;
            let match;
            while ((match = partnerRegex.exec(res)) !== null) {
                candidates.push({
                    name: match[1].trim(), gender: match[2].trim(), age: parseInt(match[3].trim()) || '?',
                    rank: match[4].trim(), specialties: match[5].split(',').map(s => s.trim()),
                    experience: match[6].trim(), status: match[7].trim(), background: match[8].trim(),
                    personality: match[9].trim(), appearance: match[10].trim(), comment: match[11].trim(),
                    avatarPromptTemplate: match[12].trim()
                });
            }

            cleanNarrativeText = cleanNarrativeText.replace(/\[Partner\|[^\]]+\]/g, '').replace(/<\/?content>/ig, '').trim();

            if (candidates.length === 0) {
                closeModal();
                playVnSequence(`[Nar|(查無資料)]\n[Char|維拉|annoyed|「抱歉，目前沒有閒置的探員可以調派，你以為我會無中生有嗎？」]`);
                return;
            }

            if (cleanNarrativeText && cleanNarrativeText.includes('[Char')) playVnSequence(cleanNarrativeText);
            else playVnSequence(`[Nar|(翻閱人事檔案)]\n[Char|維拉|normal|「這些是目前有空的傢伙，挑幾個順眼的帶走吧。」]`);
        } else {
            closeModal();
            playVnSequence(`[Nar|(API連線失敗)]\n[Char|維拉|normal|「總局資料庫暫時無法連線，請稍後再試。」]`);
            return;
        }

        STATE.candidateList = candidates;
        STATE.myTeam = []; 
        closeModal();
        renderPartnerSelect(); 

        if (win.OS_IMAGE_MANAGER) generateCandidateAvatarsBackground();
    }

    async function saveAvatarToLorebook(name, url) {
        if (!win.TavernHelper) return;
        const charLbs = win.TavernHelper.getCharLorebooks ? win.TavernHelper.getCharLorebooks() : null;
        const lorebookName = charLbs && charLbs.primary ? charLbs.primary : null;
        if (!lorebookName) { console.warn('[INV] 找不到當前角色主世界書，跳過頭像同步。'); return; }
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
            console.log(`[INV] ✅ 頭像已同步至世界書：${name}`);
        } catch (e) { console.error('[INV] 同步頭像至世界書失敗', e); }
    }

    async function generateCandidateAvatarsBackground() {
        for (let i = 0; i < STATE.candidateList.length; i++) {
            const p = STATE.candidateList[i];
            try {
                let basePrompt = p.avatarPromptTemplate || '';
                if (!basePrompt) basePrompt = `${p.gender==='女'?'woman':'man'}, ${p.appearance.toLowerCase()}`;
                const url = await win.OS_IMAGE_MANAGER.generateItem(basePrompt, {width:512, height:512});
                STATE.candidateList[i].avatarUrl = url;
                const imgEl = document.getElementById(`inv-candidate-img-${i}`);
                if (imgEl) imgEl.style.backgroundImage = `url('${url}')`;
                await saveAvatarToLorebook(p.name, url);
            } catch (e) { console.warn(`[INV] 頭像生成失敗`, e); }
        }
    }

    function renderPartnerSelect() {
        let html = `
            <div class="inv-modal-paper" style="background:#1a1a1a; color:#eee; background-image:none; max-width:600px; padding:25px;" onclick="event.stopPropagation()">
                <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:5px;">
                    <h2 style="font-family:'Special Elite'; color:#fff; margin:0;">PERSONNEL DOSSIERS</h2>
                </div>
                <div style="text-align:center; color:#888; font-size:12px; margin-bottom:20px;">請從下方名單挑選入隊人員 (最多 2 人)</div>
                <div style="display:flex; flex-direction:column; gap:12px; max-height:50vh; overflow-y:auto; padding-right:5px;">
        `;

        STATE.candidateList.forEach((p, idx) => {
            const isSelected = STATE.myTeam.includes(p);
            const borderColor = isSelected ? '#b91c1c' : '#444';
            const bgColor = isSelected ? 'rgba(185, 28, 28, 0.1)' : 'rgba(0,0,0,0.3)';
            const avatarUrl = p.avatarUrl || `https://api.dicebear.com/7.x/micah/svg?seed=${encodeURIComponent(p.name)}`;
            const specs = (p.specialties || []).join(' / ');
            
            html += `
                <div style="border:2px solid ${borderColor}; background:${bgColor}; padding:12px; cursor:pointer; transition:0.2s; border-radius:4px; display:flex; gap:12px;" 
                     onclick="window.INV_CORE.toggleCandidate(${idx})" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='${bgColor}'">
                    <div id="inv-candidate-img-${idx}" style="width:80px; height:80px; background-image:url('${avatarUrl}'); background-size:cover; border:2px solid #666; flex-shrink:0; filter: ${isSelected ? 'sepia(0.3)' : 'grayscale(0.5)'};"></div>
                    <div style="flex:1; font-size:12px; line-height:1.4;">
                        <div style="font-family:'Special Elite'; font-size:16px; color:#fff; margin-bottom:4px;">${p.name} ${isSelected ? '<span style="color:#ff4444;">[SELECTED]</span>' : ''}</div>
                        <div style="display:flex; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                            <span style="background:#333; padding:2px 6px; border-radius:2px;">${p.rank || '探員'}</span>
                            <span style="background:#333; padding:2px 6px; border-radius:2px;">${p.gender || '?'} / ${p.age || '?'}歲</span>
                        </div>
                        ${specs ? `<div style="color:#b91c1c; font-weight:bold; margin-bottom:6px;">▸ ${specs}</div>` : ''}
                        <div style="color:#aaa; font-size:11px; line-height:1.5;">${p.description || p.background || ''}</div>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div style="margin-top:20px; display:flex; gap:10px; justify-content:center;">
                     <button class="inv-btn inv-btn-primary" onclick="window.INV_CORE.confirmTeam()">確認入隊</button>
                     <button class="inv-btn" style="width:auto;" onclick="window.INV_CORE.closeModal()">取消</button>
                </div>
            </div>
        `;
        showModal(html);
    }

    function toggleCandidate(idx) {
        const p = STATE.candidateList[idx];
        const existIdx = STATE.myTeam.indexOf(p);
        if (existIdx >= 0) STATE.myTeam.splice(existIdx, 1);
        else {
            if (STATE.myTeam.length >= 2) { alert("一次最多只能招募 2 人。"); return; }
            STATE.myTeam.push(p);
        }
        renderPartnerSelect(); 
    }

    async function confirmTeam() {
        if (STATE.myTeam.length === 0) { closeModal(); return; }
        
        let newMembers = [];
        STATE.myTeam.forEach(member => {
            if (!STATE.partnerList.find(p => p.name === member.name) && STATE.partnerList.length < 4) {
                STATE.partnerList.push(member); newMembers.push(member);
            }
        });

        saveState();
        closeModal();
        const names = newMembers.map(m=>m.name).join('、');
        playVnSequence(`[Nar|新探員報到手續已完成。]\n[Char|維拉|annoyed|「${names} 已經劃撥到你的小組名單了。動作快點，別浪費警局的電力和資源。」]`);
    }

    function openInterrogation() {
        let html = `
            <div class="inv-slide-header">
                <div class="inv-title">INTERROGATION ROOM</div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <div class="inv-back-btn" style="font-size:18px;" title="重新掃描 SessionEnd" onclick="this.style.opacity='0.4'; window.INV_CORE.scanForMissedSessions().then(()=>{ this.style.opacity='1'; window.INV_CORE.openInterrogation(); })">🔄</div>
                    <div class="inv-back-btn" onclick="window.INV_CORE.closeSlide()">✕</div>
                </div>
            </div>
            <div class="inv-slide-content">
                <div style="margin-bottom: 15px; border-bottom: 1px dashed #555; padding-bottom: 10px;">
                    <h3 style="color: #b91c1c; margin-top: 0; font-family: 'Courier Prime';">【傳喚名單】</h3>
        `;

        if (!STATE.suspectList || STATE.suspectList.length === 0) {
            html += `<div style="text-align:center; color:#666; font-size:12px;">無可傳喚之人證。</div>`;
        } else {
            STATE.suspectList.forEach((s, idx) => {
                const statusColor = s.questioned ? '#555' : '#b91c1c';
                const statusText = s.questioned ? '[已審問]' : '[傳喚]';
                html += `
                    <div style="background:#111; border:1px solid #333; padding:10px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-weight:bold; color:#fff;">👤 ${s.name}</div>
                            <div style="font-size:10px; color:#666; margin-top:4px;">${s.caseName}</div>
                            <div style="font-size:12px; color:#aaa; margin-top:4px; line-height:1.4;">${s.desc}</div>
                        </div>
                        <button class="inv-btn" style="width:auto; padding:5px 10px; background:${statusColor}; border-color:${statusColor}; font-size:12px; margin-top:0;" onclick="window.INV_CORE.startInterrogation(${idx})">${statusText}</button>
                    </div>
                `;
            });
        }

        html += `
                </div>
                <div>
                    <h3 style="color: #888; font-family: 'Courier Prime';">【結算日誌】</h3>
        `;
        
        if (STATE.interrogationLog.length === 0) {
            html += `<div style="text-align:center; color:#666; font-size:12px;">無紀錄。</div>`;
        } else {
            STATE.interrogationLog.forEach(log => {
                html += `
                    <div style="background:#111; border:1px solid #333; padding:10px; margin-bottom:10px; border-left:3px solid #b91c1c;">
                        <div style="font-size:10px; color:#666;">[${log.timestamp}] CASE: ${log.caseName}</div>
                        <div style="font-size:12px; color:#ddd; margin-top:5px; line-height:1.5;">${log.summary}</div>
                    </div>
                `;
            });
        }

        html += `</div></div>`;
        showSlide(html);
    }

    async function startInterrogation(idx) {
        if (!STATE.suspectList) return;
        const s = STATE.suspectList[idx];
        if (s.questioned) { alert("該嫌疑人/關係人已審問過。"); return; }

        closeSlide();
        STATE.view = 'INTERROGATION_SESSION';
        STATE.currentInterrogationIdx = idx;
        STATE.interrogationChatLog = [];
        
        STATE.interrogationChatLog.push(`[System] 審問開始：${s.name}`);
        renderInterrogationRoom();
        startInvBgm();
        
        playVnSequence(`[Nar|你走進審問室，${s.name} 正坐在桌前。]\n[Char|${s.name}|normal|「...長官，找我有什麼事嗎？」]`);
    }

    function renderInterrogationRoom() {
        const s = STATE.suspectList[STATE.currentInterrogationIdx];
        const bgUrl = BG_MAP.interrogation;
        const avatarUrl = 'https://files.catbox.moe/k2n32k.png'; 
        
        currentContainer.innerHTML = `
            <div class="inv-container">
                <div class="inv-header">
                    <div class="inv-back-btn" onclick="window.INV_CORE.endInterrogation(false)">‹</div>
                    <div class="inv-title"><div>INTERROGATION</div><div style="font-size:10px; color:#aaa; font-family:'Courier Prime';">${s.name}</div></div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <div class="inv-music-toggle ${STATE.bgmEnabled?'active':''}" onclick="window.INV_CORE.toggleMusic()" title="切換 BGM">🎧</div>
                        <div style="width:30px; cursor:pointer; text-align:right;" onclick="window.INV_CORE.endInterrogation(true)" title="結束並結算摘要">⏹</div>
                    </div>
                </div>
                
                <div class="inv-main-room" style="background-image: url('${bgUrl}');">
                    <div class="inv-char-area">
                        <img class="inv-char-img" src="${avatarUrl}" onerror="this.src='https://api.dicebear.com/7.x/initials/svg?seed=ERROR'">
                        
                        <div class="inv-vn-wrapper">
                            <div class="inv-vn-box" onclick="window.INV_CORE.advanceVn()">
                                <div class="inv-vn-name" id="inv-vn-name" style="display:none;">${s.name}</div>
                                <div class="inv-vn-text" id="inv-vn-text"></div>
                                <div class="inv-vn-next" id="inv-vn-next">▼</div>
                            </div>
                        </div>
                    </div>

                    <div class="inv-chat-bar">
                        <input id="inv-interrogation-input" class="inv-input-field" placeholder="質問 ${s.name} 或拋出鑑識證據..." onkeypress="if(event.key==='Enter') window.INV_CORE.sendInterrogationMsg()">
                        <button class="inv-send-btn" title="重試上一條質問" onclick="window.INV_CORE.retryInterrogationMsg()" style="background:#333; margin-right:4px;">🔄</button>
                        <button class="inv-send-btn" onclick="window.INV_CORE.sendInterrogationMsg()">➤</button>
                    </div>
                </div>

                <div id="inv-slide-layer" class="inv-modal-slide"></div>
                <div id="inv-modal-layer" class="inv-modal-overlay"></div>
            </div>
        `;
        
        if (STATE.isTyping || STATE.vnQueue.length > 0) advanceVn(); 
        else document.getElementById('inv-vn-text').innerHTML = `<span style="color:#888; font-style:italic;">(等待提問中...)</span>`;
    }

    async function sendInterrogationMsg(isRetry = false) {
        if (isProcessing) return;
        const input = document.getElementById('inv-interrogation-input');
        const text = input.value.trim();
        if (!text) return;
        
        input.value = '';
        lastInterrogationMsg = text;
        
        if (!isRetry) {
            STATE.interrogationChatLog.push(`[隊長]: ${text}`);
        }

        const s = STATE.suspectList[STATE.currentInterrogationIdx];
        const nameBox = document.getElementById('inv-vn-name');
        const textBox = document.getElementById('inv-vn-text');
        if(nameBox) nameBox.style.display = 'none';
        if(textBox) textBox.innerHTML = `<span style="color:#888; font-style:italic;">(對方思考中...)</span>`;

        const vars = {
            caseName: s.caseName, suspectName: s.name, suspectDesc: s.desc,
            investigationContext: buildInvestigationContext(s.caseId) 
        };

        const contextLog = STATE.interrogationChatLog.slice(-5).join('\n');
        const res = await callApi('inv_interrogation_chat', `對話歷史：\n${contextLog}\n\n請回覆：`, 0.8, vars);
        
        if (res) {
            const cleanRes = res.replace(/^"|"$/g, '').replace(/<\/?content>/ig, '').trim();
            STATE.interrogationChatLog.push(`[${s.name}]: ${cleanRes}`);
            playVnSequence(cleanRes);
        }
    }

    async function retryInterrogationMsg() {
        if (!lastInterrogationMsg || isProcessing) return;
        const input = document.getElementById('inv-interrogation-input');
        if (input) input.value = lastInterrogationMsg;
        
        if (STATE.suspectList && STATE.currentInterrogationIdx >= 0) {
            const s = STATE.suspectList[STATE.currentInterrogationIdx];
            if (STATE.interrogationChatLog.length > 0) {
                let lastLog = STATE.interrogationChatLog[STATE.interrogationChatLog.length - 1];
                if (lastLog.startsWith(`[${s.name}]:`)) {
                    STATE.interrogationChatLog.pop(); 
                    if (STATE.interrogationChatLog.length > 0 && STATE.interrogationChatLog[STATE.interrogationChatLog.length - 1] === `[隊長]: ${lastInterrogationMsg}`) {
                        STATE.interrogationChatLog.pop(); 
                    }
                } else if (lastLog === `[隊長]: ${lastInterrogationMsg}`) {
                    STATE.interrogationChatLog.pop(); 
                }
            }
        }
        
        await sendInterrogationMsg();
    }

    async function endInterrogation(doSummarize) {
        const s = STATE.suspectList[STATE.currentInterrogationIdx];
        STATE.view = 'STATION';
        
        if (doSummarize && STATE.interrogationChatLog.length > 1) {
             currentContainer.innerHTML = `
                <div class="inv-container" style="justify-content:center; align-items:center; background:#000;">
                    <div class="inv-title" style="font-size:30px; color:#b91c1c;">ANALYZING...</div>
                    <div style="font-family:'Courier Prime'; color:#fff; margin-top:20px;">生成筆錄與摘要中...</div>
                </div>
            `;
            const vars = { chatLog: STATE.interrogationChatLog.join('\n') };
            const summary = await callApi('inv_interrogation_summary', '開始生成結案摘要', 0.7, vars);
            
            s.questioned = true;
            const ts = new Date().toTimeString().split(' ')[0];
            STATE.interrogationLog.push({ caseId: s.caseId, caseName: s.caseName, summary: summary || "審問結束，無特殊發現。", timestamp: ts });
            
            saveState();
            renderStation();
            showModal(`
                <div class="inv-modal-paper" onclick="event.stopPropagation()">
                    <div class="inv-paper-clip"></div>
                    <h2 style="font-family:'Special Elite'; color:#b91c1c; text-decoration:underline; margin-top:0;">INTERROGATION REPORT</h2>
                    <div><strong>受審人:</strong> ${s.name}</div>
                    <div style="margin-top:15px; line-height:1.6;"><strong>筆錄摘要:</strong><br>${summary}</div>
                    <div style="margin-top:25px; text-align:center;">
                        <button class="inv-btn inv-btn-primary" onclick="window.INV_CORE.closeModal()">確認歸檔</button>
                    </div>
                </div>
            `);
        } else {
            renderStation();
        }
        STATE.currentSpeakerId = 'dispatcher';
        STATE.currentInterrogationIdx = -1;
    }

    function openEvidence() {
        let html = `
            <div class="inv-slide-header">
                <div class="inv-title">EVIDENCE LOCKER<br><span style="font-size:10px;color:#888;">// SECURE STORAGE //</span></div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <div class="inv-back-btn" style="font-size:18px;" title="重新掃描 SessionEnd" onclick="this.style.opacity='0.4'; window.INV_CORE.scanForMissedSessions().then(()=>{ this.style.opacity='1'; window.INV_CORE.openEvidence(); })">🔄</div>
                    <div class="inv-back-btn" onclick="window.INV_CORE.closeSlide()">✕</div>
                </div>
            </div>
            <div class="inv-slide-content" style="display:flex; flex-direction:column; align-items:center;">
                
                <div style="width:100%; background:rgba(185,28,28,0.1); border-left:3px solid #b91c1c; padding:10px; margin-bottom:15px; font-size:12px; color:#ccc; box-sizing: border-box;">
                    <strong style="color:#b91c1c;">[人事室警告]</strong> 維拉：「每送驗一件物證都要燒掉局裡 500 瑞元的預算。拜託別把沾了番茄醬的垃圾也送去實驗室，我的撫恤金預算已經透支了。」
                </div>

                <div style="display:flex; flex-wrap:wrap; gap:15px; justify-content:center; width:100%; margin-bottom: 20px;">
        `;

        if (STATE.evidenceLog.length === 0) {
            html += `<div style="text-align:center; margin-top:50px; color:#666; width:100%; font-family:'Courier Prime';">> 庫存為空_</div>`;
        } else {
            STATE.evidenceLog.forEach((ev, idx) => {
                const stampHtml = ev.analyzed ? `<div style="position:absolute; top:35px; right:-10px; color:#b91c1c; border:2px solid #b91c1c; transform:rotate(15deg); font-weight:bold; font-size:12px; padding:2px 6px; font-family:'Special Elite'; z-index:5; background:rgba(20,20,20,0.95); box-shadow: 0 0 8px rgba(0,0,0,0.8);">LAB TESTED</div>` : '';
                
                html += `
                    <div style="background:rgba(255,255,255,0.03); border:1px solid #444; border-top:8px solid #b91c1c; border-radius:4px; padding:12px; width:140px; position:relative; cursor:pointer; transition:all 0.2s; backdrop-filter:blur(2px);" 
                         onclick="window.INV_CORE.viewEvidenceDetail(${idx})" onmouseover="this.style.transform='translateY(-5px)'; this.style.borderColor='#b91c1c'; this.style.background='rgba(255,255,255,0.08)';" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='#444'; this.style.background='rgba(255,255,255,0.03)';" title="查看證物詳情">
                        
                        ${stampHtml}
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px dashed #555; padding-bottom:5px;">
                            <span style="font-size:10px; color:#888;">EV-${String(idx).padStart(3, '0')}</span>
                            <span style="font-size:14px;">🔎</span>
                        </div>
                        
                        <div style="font-family:'Courier Prime', monospace; color:#eee; font-size:13px; text-align:left; margin-top:5px; line-height:1.4; font-weight:bold;">
                            ${ev.item}
                        </div>
                        
                        <div style="font-size:11px; color:#aaa; text-align:left; margin-top:8px; height:32px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
                            ${ev.note}
                        </div>
                        
                        <div style="font-size:9px; color:#b91c1c; text-align:left; margin-top:12px; font-weight:bold; background:#111; padding:3px 6px; border-radius:2px; display:inline-block; border:1px solid #333;">
                            ${ev.caseName}
                        </div>
                    </div>
                `;
            });
        }
        
        html += `</div>`;
        
        if (STATE.evidenceLog.length > 0) {
            html += `
                <div style="width:100%; border-top:1px solid #444; padding-top:15px; text-align:center;">
                    <div style="color:#888; font-size:11px; margin-bottom:10px;">老霍的廣播：「發什麼呆？把這些破銅爛鐵拿去會議室，全給我在白板上拼出來！」</div>
                    <div style="display:flex; gap:8px; justify-content:center; width:90%; max-width:300px; margin:0 auto 10px;">
                        <button class="inv-btn" style="flex:1; background:#2a2a2a; border-color:#555;" onclick="window.INV_CORE.submitAllForensic()">🔬 批次鑑識</button>
                        <button class="inv-btn" style="width:auto; padding:0 15px; background:#1a1a1a; border-color:#555; font-family:'Courier Prime';" title="重新生成所有報告" onclick="window.INV_CORE.rerollAllForensic()">[ REROLL ]</button>
                    </div>
                    <button class="inv-btn inv-btn-primary" style="width:90%; max-width: 300px; margin:0 auto;" onclick="window.INV_CORE.analyzeEvidence()">📝 前往會議室 (綜合推論與決策)</button>
                </div>
            `;
        }
        
        html += `</div>`;
        showSlide(html);
    }

    function viewEvidenceDetail(idx) {
        const ev = STATE.evidenceLog[idx];
        
        let reportHtml = '';
        if (ev.analyzed) {
            reportHtml = `
                <div style="background:#0a0a0a; border:1px solid #333; margin-top:15px; border-radius:2px; overflow:hidden;">
                    <div style="background:#b91c1c; color:#fff; padding:6px 10px; font-size:12px; font-weight:bold; font-family:'Courier Prime'; display:flex; justify-content:space-between; align-items:center;">
                        <span>🔬 鑑識科化驗報告</span>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <button class="terminal-btn" onclick="window.INV_CORE.rerollForensic(${idx})" title="重新生成">REROLL</button>
                            <span>STATUS: COMPLETED</span>
                        </div>
                    </div>
                    <div style="white-space:pre-wrap; font-family:'Courier Prime', monospace; padding:15px; color:#0f0; font-size:13px; line-height:1.6; text-shadow: 0 0 2px #0f0;">> ${ev.forensicReport}</div>
                </div>
            `;
        } else {
            reportHtml = `
                <div style="background:rgba(185,28,28,0.05); border:1px dashed #b91c1c; padding:15px; text-align:center; margin-top:20px; border-radius:4px;">
                    <div style="color:#ccc; font-size:12px; margin-bottom:12px;">該物證尚未經過科學檢驗。</div>
                    <div style="display:flex; gap:8px; justify-content:center; max-width: 250px; margin: 0 auto;">
                        <button class="inv-btn inv-btn-primary" style="flex:1; padding:8px;" onclick="window.INV_CORE.submitForensic(${idx})">🔬 送交化驗</button>
                    </div>
                    <div style="color:#888; font-size:10px; margin-top:10px;">[系統提示] 等待化驗出爐後，可用作審問的關鍵鐵證。</div>
                </div>
            `;
        }

        const modalHtml = `
            <div class="inv-modal-paper" style="background:#1a1a1a; color:#eee; border:1px solid #444; background-image:none; padding:25px;" onclick="event.stopPropagation()">
                <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #b91c1c; padding-bottom:10px; margin-bottom:15px;">
                    <h2 style="font-family:'Special Elite'; color:#fff; margin:0;">EVIDENCE FILE</h2>
                    <span style="color:#b91c1c; font-weight:bold; font-size:22px; font-family:'Courier Prime';">EV-${String(idx).padStart(3, '0')}</span>
                </div>
                
                <div style="font-size:14px; color:#ccc; line-height:1.8; background:#000; padding:15px; border-radius:4px; border: 1px solid #333;">
                    <div style="display:flex; border-bottom:1px solid #222; padding-bottom:6px; margin-bottom:6px;">
                        <span style="width:80px; color:#888;">所屬案件</span>
                        <span style="color:#fff; flex:1;">${ev.caseName}</span>
                    </div>
                    <div style="display:flex; border-bottom:1px solid #222; padding-bottom:6px; margin-bottom:6px;">
                        <span style="width:80px; color:#888;">入檔時間</span>
                        <span style="color:#fff; flex:1; font-family:'Courier Prime';">${ev.timestamp}</span>
                    </div>
                    <div style="display:flex; flex-direction:column; margin-top:12px;">
                        <span style="color:#888; margin-bottom:6px;">初步描述 / 現場特徵</span>
                        <div style="color:#ddd; background:#111; padding:12px; border-left:3px solid #555; font-family:'Courier Prime'; line-height:1.5;">${ev.note}</div>
                    </div>
                </div>
                
                ${reportHtml}
                
                <div style="margin-top:25px; text-align:center;">
                    <button class="inv-btn" style="width:100%; border-color:#555;" onclick="window.INV_CORE.closeModal(); window.INV_CORE.openEvidence()">返回證物室</button>
                </div>
            </div>
        `;
        showModal(modalHtml);
    }

    function parseForensicLeads(rawRes, ev) {
        const ts = new Date().toTimeString().split(' ')[0];
        let report = rawRes.replace(/<\/?content>/ig, '').trim();
        const newEvRegex = /\[(?:新物證|新物证|新線索|新线索)\|([^|]+)\|([^\]]+)\]/g;
        const newSpRegex = /\[(?:新人證|新人证)\|([^|]+)\|([^\]]+)\]/g;
        let match;
        
        while ((match = newEvRegex.exec(rawRes)) !== null) {
            const item = match[1].trim(), note = match[2].trim();
            const dup = STATE.evidenceLog.find(e => e.caseId === ev.caseId && e.item === item);
            if (!dup) STATE.evidenceLog.push({ caseId: ev.caseId, caseName: ev.caseName, item, note, timestamp: ts, analyzed: false, forensicReport: '' });
        }
        
        if (!STATE.suspectList) STATE.suspectList = [];
        
        while ((match = newSpRegex.exec(rawRes)) !== null) {
            const name = match[1].trim(), desc = match[2].trim();
            const dup = STATE.suspectList.find(s => s.name === name && s.caseId === ev.caseId);
            if (!dup) STATE.suspectList.push({ caseId: ev.caseId, caseName: ev.caseName, name, desc, questioned: false, timestamp: ts });
        }
        
        report = report.replace(/\[(?:新物證|新物证|新線索|新线索)\|[^\]]+\]/g, '').replace(/\[(?:新人證|新人证)\|[^\]]+\]/g, '').trim();
        return report;
    }

    async function submitAllForensic() {
        const pending = STATE.evidenceLog.filter(ev => !ev.analyzed && ev.item !== '現場勘驗報告');
        if (pending.length === 0) { openEvidence(); return; }

        const caseName = pending[0].caseName;
        const evidenceList = pending.map((ev, i) => `${i + 1}. [${ev.item}] ${ev.note}`).join('\n');

        showModal(`
            <div class="inv-modal-paper" style="background:#1a1a1a; color:#eee; background-image:none; text-align:center;" onclick="event.stopPropagation()">
                <h2 style="font-family:'Special Elite'; color:#b91c1c; margin-top:0;">BATCH FORENSIC ANALYSIS</h2>
                <div style="margin:20px 0; font-size:13px; color:#888; font-family:'Courier Prime';">一次性送驗 ${pending.length} 件物證，等待鑑識科回報...</div>
                <div style="margin:0 auto; width:40px; height:40px; border:2px solid #555; border-top:2px solid #b91c1c; border-radius:50%; animation:spin 1s infinite linear;"></div>
            </div>
        `);

        const vars = { caseName, evidenceList };
        const res = await callApi('inv_forensic_lab_batch', `開始批次檢驗`, 0.6, vars);

        if (res) {
            const resBlocks = res.split(/\[REPORT\|/i);
            
            for (let i = 1; i < resBlocks.length; i++) {
                const blockStr = resBlocks[i];
                const pipeIdx = blockStr.indexOf('|');
                const closeIdx = blockStr.indexOf(']');
                
                if (pipeIdx > -1 && closeIdx > pipeIdx) {
                    const name = blockStr.substring(0, pipeIdx).trim();
                    const contentInside = blockStr.substring(pipeIdx + 1, closeIdx).trim();
                    const contentOutside = blockStr.substring(closeIdx + 1);
                    const fullContent = contentInside + '\n' + contentOutside; 
                    
                    const ev = STATE.evidenceLog.find(e => e.item === name && !e.analyzed);
                    if (ev) {
                        ev.analyzed = true;
                        ev.forensicReport = parseForensicLeads(fullContent, ev);
                    }
                }
            }
            await saveState();
        }
        closeModal();
        openEvidence();
    }

    async function rerollAllForensic() {
        const targets = STATE.evidenceLog.filter(ev => ev.item !== '現場勘驗報告');
        if (targets.length === 0) return;
        targets.forEach(ev => { ev.analyzed = false; ev.forensicReport = ''; });
        await saveState();
        await submitAllForensic();
    }

    async function submitForensic(idx) {
        const ev = STATE.evidenceLog[idx];
        showModal(`
            <div class="inv-modal-paper" style="background:#1a1a1a; color:#eee; background-image:none; text-align:center;" onclick="event.stopPropagation()">
                <h2 style="font-family:'Special Elite'; color:#b91c1c; margin-top:0;">FORENSIC ANALYSIS...</h2>
                <div style="margin: 20px 0; font-size: 14px; color: #888;">正在進行微物跡證提取與科學比對，請稍候...</div>
                <div style="margin:0 auto; width:40px; height:40px; border:2px solid #555; border-top:2px solid #b91c1c; border-radius:50%; animation:spin 1s infinite linear;"></div>
            </div>
        `);

        const vars = { caseName: ev.caseName, evidenceName: ev.item, evidenceDesc: ev.note };
        const res = await callApi('inv_forensic_lab', `開始檢驗`, 0.6, vars);
        
        if (res) {
            ev.analyzed = true;
            ev.forensicReport = parseForensicLeads(res, ev);
            saveState();
        }
        closeModal();
        viewEvidenceDetail(idx);
    }

    async function rerollForensic(idx) {
        const ev = STATE.evidenceLog[idx];
        if (!ev) return;
        ev.analyzed = false; ev.forensicReport = '';
        await saveState();
        await submitForensic(idx);
    }

    async function analyzeEvidence() {
        if (STATE.evidenceLog.length === 0) return;
        
        closeSlide();
        currentContainer.innerHTML = `
            <div class="inv-container" style="justify-content:center; align-items:center; background:#000;">
                <div class="inv-title" style="font-size:30px; color:#b91c1c;">BRAINSTORMING...</div>
                <div style="font-family:'Courier Prime'; color:#fff; margin-top:20px;">正在前往會議室與小組梳理線索...</div>
            </div>
        `;

        let activeEvidence = STATE.evidenceLog.filter(e => STATE.activeCaseStatus[e.caseId] === 'active');
        if (activeEvidence.length === 0) activeEvidence = STATE.evidenceLog; 

        const evidenceList = activeEvidence.map(e => {
            let desc = `- [${e.caseName}] ${e.item}: ${e.note}`;
            if (e.analyzed) desc += `\n  [鑑識科報告]: ${e.forensicReport}`;
            return desc;
        }).join('\n');

        const teamNames = STATE.partnerList.length > 0 ? STATE.partnerList.map(p => p.name).join(', ') : '無(單人)';
        const vars = { evidenceList: evidenceList, agentName: STATE.agentName, teamNames: teamNames };

        const res = await callApi('inv_evidence_analyze', `開始進行會議室白板推論，並給出具體行動方針。`, 0.8, vars);
        
        STATE.currentSpeakerId = 'meeting';
        renderStation();
        
        if (res) {
            let cleanRes = res.replace(/<\/?content>/ig, '').trim();
            
            const actionRegex = /\[NewAction\|([^|]+)\|([^\]]+)\]/g;
            let match;
            if (!STATE.actionQueue) STATE.actionQueue = [];

            let targetCaseId = 'unknown_case';
            if (STATE.evidenceLog && STATE.evidenceLog.length > 0) {
                targetCaseId = STATE.evidenceLog[STATE.evidenceLog.length - 1].caseId;
            } else {
                const activeCases = STATE.caseList.filter(c => STATE.activeCaseStatus[c.id] === 'active');
                if (activeCases.length > 0) {
                    targetCaseId = activeCases[activeCases.length - 1].id; 
                } else if (STATE.caseList.length > 0) {
                    targetCaseId = STATE.caseList[STATE.caseList.length - 1].id; 
                }
            }
            
            while ((match = actionRegex.exec(res)) !== null) {
                const title = match[1].trim();
                const desc = match[2].trim();
                
                STATE.actionQueue.push({
                    id: 'aq_' + Date.now() + Math.floor(Math.random()*100),
                    caseId: targetCaseId,
                    title: title,
                    desc: desc,
                    status: 'pending'
                });
            }
            
            cleanRes = cleanRes.replace(/\[NewAction\|([^|]+)\|([^\]]+)\]/g, '').trim();
            
            const exactCase = STATE.caseList.find(c => c.id === targetCaseId);
            const plainTextLog = vnToPlainText(cleanRes, '專案小組');
            if (!STATE.meetingLogs) STATE.meetingLogs = [];
            STATE.meetingLogs.push({
                caseId: targetCaseId,
                caseName: exactCase ? exactCase.title : '未知',
                log: plainTextLog,
                timestamp: new Date().toTimeString().split(' ')[0]
            });

            saveState(); 
            
            playVnSequence(cleanRes);
        } else {
            playVnSequence(`[Nar|(系統錯誤：無法連接到推論模組)]`);
        }
    }

    async function scanForMissedSessions() {
        try {
            const helper = win.TavernHelper || (win.parent && win.parent.TavernHelper) || (win.top && win.top.TavernHelper);
            if (!helper || typeof helper.getChatMessages !== 'function') return;

            let lastId = -1;
            if (typeof helper.getLastMessageId === 'function') lastId = await helper.getLastMessageId();
            if (lastId < 0) return;

            const msgs = await helper.getChatMessages(`0-${lastId}`);
            if (!Array.isArray(msgs) || msgs.length === 0) return;

            // 🔥 修改：匹配任何 [SessionEnd|XXX]
            const sessionRegex = /\[SessionEnd\|([^\]]+)\]/;
            const ts = new Date().toTimeString().split(' ')[0];
            let anyNew = false;

            for (const msg of msgs) {
                if (msg.is_user || msg.isMe) continue;
                const text = msg.mes || msg.message || msg.content || '';
                if (!text.includes('[SessionEnd|')) continue;

                const m = text.match(sessionRegex);
                if (!m) continue;

                let summaryText = m[1].trim();
                // 容錯：如果 AI 還是加上了 case| 或 id|
                if (summaryText.includes('|')) {
                    const parts = summaryText.split('|');
                    summaryText = parts[parts.length - 1].trim();
                }

                // 尋找當前正在 active 的案件 (因為已經不靠 AI 輸出 ID)
                const activeCases = STATE.caseList.filter(x => STATE.activeCaseStatus[x.id] === 'active');
                if (activeCases.length === 0) continue;
                // 取最近的一個進行中案件
                const c = activeCases[activeCases.length - 1];
                const id = c.id;

                const alreadyResolved = STATE.activeCaseStatus?.[id] === 'resolved';
                const hasEvidence = STATE.evidenceLog?.some(e => e.caseId === id);
                const hasSuspect = STATE.suspectList?.some(s => s.caseId === id);
                if (alreadyResolved && hasEvidence && hasSuspect) continue;

                STATE.activeCaseStatus[id] = 'resolved';

                const evRegex = /\[(?:物證|物证|線索|线索)\|([^|]+)\|([^\]]+)\]/g;
                let evMatch;
                while ((evMatch = evRegex.exec(text)) !== null) {
                    const item = evMatch[1].trim(), note = evMatch[2].trim();
                    const dup = STATE.evidenceLog.find(e => e.caseId === id && e.item === item);
                    if (!dup) STATE.evidenceLog.push({ caseId: id, caseName: c.title, item, note, timestamp: ts, analyzed: false, forensicReport: '' });
                }
                
                const spRegex = /\[(?:人證|人证)\|([^|]+)\|([^\]]+)\]/g;
                let spMatch;
                if (!STATE.suspectList) STATE.suspectList = [];
                while ((spMatch = spRegex.exec(text)) !== null) {
                    const name = spMatch[1].trim(), desc = spMatch[2].trim();
                    const exist = STATE.suspectList.find(s => s.name === name && s.caseId === id);
                    if (!exist) STATE.suspectList.push({ caseId: id, caseName: c.title, name, desc, questioned: false, timestamp: ts });
                }

                if (summaryText) {
                    const existing = STATE.evidenceLog.find(e => e.caseId === id && e.item === '現場勘驗報告');
                    if (existing) existing.note = summaryText;
                    else STATE.evidenceLog.unshift({ caseId: id, caseName: c.title, item: '現場勘驗報告', note: summaryText, timestamp: ts, analyzed: false, forensicReport: '' });
                }
                anyNew = true;
            }

            if (anyNew) {
                await saveState();
                if (STATE.view === 'STATION') renderStation();
            }
        } catch (e) {}
    }

    function resolveSession(idRaw, summary, status, fullText = '') {
        let id = idRaw ? idRaw.trim() : '';
            
        // 如果傳進來的是 'case' 或無效 ID，自動尋找當前 active 的案件
        if (!id || id === 'case' || !STATE.caseList.find(x => x.id === id)) {
            const activeCases = STATE.caseList.filter(c => STATE.activeCaseStatus[c.id] === 'active');
            if (activeCases.length > 0) {
                id = activeCases[activeCases.length - 1].id;
            }
        } else {
            id = id.startsWith('case_') ? id : `case_${id}`;
        }
        
        STATE.view = 'STATION';
        const c = STATE.caseList.find(x => x.id === id);
        if (c) {
            STATE.activeCaseStatus[id] = 'resolved'; 
            const ts = new Date().toTimeString().split(' ')[0];
            
            if (fullText) {
                const parseArea = fullText;
                const evRegex = /\[(?:物證|物证|線索|线索)\|([^|]+)\|([^\]]+)\]/g;
                let evMatch;
                while ((evMatch = evRegex.exec(parseArea)) !== null) {
                    STATE.evidenceLog.push({ caseId: id, caseName: c.title, item: evMatch[1].trim(), note: evMatch[2].trim(), timestamp: ts, analyzed: false, forensicReport: '' });
                }

                const spRegex = /\[(?:人證|人证)\|([^|]+)\|([^\]]+)\]/g;
                let spMatch;
                while ((spMatch = spRegex.exec(parseArea)) !== null) {
                    if (!STATE.suspectList) STATE.suspectList = [];
                    const exist = STATE.suspectList.find(s => s.name === spMatch[1].trim() && s.caseId === id);
                    if (!exist) STATE.suspectList.push({ caseId: id, caseName: c.title, name: spMatch[1].trim(), desc: spMatch[2].trim(), questioned: false, timestamp: ts });
                }
            }
            
            const summaryText = summary ? summary.trim() : '';
            if (summaryText) {
                const existing = STATE.evidenceLog.find(e => e.caseId === id && e.item === '現場勘驗報告');
                if (existing) existing.note = summaryText;
                else STATE.evidenceLog.unshift({ caseId: id, caseName: c.title, item: '現場勘驗報告', note: summaryText, timestamp: ts, analyzed: false, forensicReport: '' });
            }
        }

        saveState();

        if (win.PhoneSystem) win.PhoneSystem.launchApp('刑案調查');
        if (currentContainer) launchApp(currentContainer);

        if (win.OS_API) {
            const prompt = `[System] 體驗者剛結束刑偵勘查歸來。案件：「${c ? c.title : '未知'}」，結果摘要：「${summary}」。請給予迎接與評論。`;
            const config = win.OS_SETTINGS ? win.OS_SETTINGS.getConfig() : {};
            win.OS_API.chat([{role: 'system', content: prompt}], config, null, (reply) => {
                if (reply && win.AureliaControlCenter && typeof win.AureliaControlCenter.playIrisSequence === 'function') {
                    win.AureliaControlCenter.playIrisSequence(reply);
                }
            }, (err) => console.error(err));
        }

        setTimeout(() => {
            showModal(`
                <div class="inv-modal-paper" onclick="event.stopPropagation()">
                    <div class="inv-paper-clip"></div>
                    <h2 style="font-family:'Special Elite'; text-decoration:underline; margin-top:0;">INVESTIGATION REPORT</h2>
                    <h3 style="margin-top:0; font-family:'Courier Prime'; color:#b91c1c;">[現場勘查結算]</h3>
                    <div style="margin-top:15px; font-size:14px; line-height:1.6;"><strong>勘查結果：</strong><br>${summary}</div>
                    <div style="margin-top:25px; text-align:center;">
                        <button class="inv-btn inv-btn-primary" onclick="window.INV_CORE.closeModal()">確認歸檔</button>
                    </div>
                </div>
            `);
            STATE.currentSpeakerId = 'dispatcher';
            renderStation();
            playVnSequence(`[Char|老霍|normal|「探員，歡迎歸隊。現場的報告已經建檔，請過目。」]`);
        }, 800);
    }

    let _modalCloseTimer = null;
    let _slideCloseTimer = null;
    function showModal(html) {
        if (_modalCloseTimer) { clearTimeout(_modalCloseTimer); _modalCloseTimer = null; }
        const layer = document.getElementById('inv-modal-layer');
        if (layer) { layer.innerHTML = html; layer.classList.add('active'); }
    }
    function closeModal() {
        const layer = document.getElementById('inv-modal-layer');
        if (layer) {
            layer.classList.remove('active');
            _modalCloseTimer = setTimeout(() => { layer.innerHTML = ''; _modalCloseTimer = null; }, 300);
        }
    }
    function showSlide(html) {
        if (_slideCloseTimer) { clearTimeout(_slideCloseTimer); _slideCloseTimer = null; }
        const layer = document.getElementById('inv-slide-layer');
        if (layer) { layer.innerHTML = html; layer.classList.add('active'); }
    }
    function closeSlide() {
        const layer = document.getElementById('inv-slide-layer');
        if (layer) {
            layer.classList.remove('active');
            _slideCloseTimer = setTimeout(() => { layer.innerHTML = ''; _slideCloseTimer = null; }, 300);
        }
    }

    // --- 導出 ---
    window.INV_CORE = {
        launchApp, openProfileEdit, saveProfileEdit,
        bgGenerateCases, sendChatMessage, retryChatMessage, advanceVn, openRoster, switchSpeaker,
        openActionList, viewCaseDetail, acceptCase, openFieldMission, startFieldMission,
        generatePartners, toggleCandidate, confirmTeam, firePartner,
        openInterrogation, startInterrogation, sendInterrogationMsg, retryInterrogationMsg, endInterrogation,
        openEvidence, viewEvidenceDetail, submitForensic, rerollForensic, submitAllForensic, rerollAllForensic, analyzeEvidence,
        openDataManager, toggleAllCheckboxes, deleteSelectedData,
        openSaveManager, toggleAllSaves, deleteSelectedSaves,
        closeModal, closeSlide, resolveSession, toggleMusic, scanForMissedSessions,
        stopBgm: stopInvBgm
    };

    function install() {
        if (win.PhoneSystem) {
            win.PhoneSystem.install('刑案調查', '🕵️', '#1a1a1a', launchApp);
        } else { setTimeout(install, 1000); }
    }
    install();
})();