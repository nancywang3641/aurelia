// ----------------------------------------------------------------
// [檔案] os_economy.js (V3.1 - AI Transaction Support)
// 路徑：scripts/os_phone/os/os_economy.js
// 職責：管理金流、交易紀錄，並提供電子錢包介面與卡包。
// 升級點：
// 1. [新增] processAiTransaction()：專門處理 AI 輸出的 Txx 交易指令。
// 2. [防呆] 增加 ai_processed_ids 列表，防止刷新頁面時重複扣款。
// 3. [同步] 保持 V3.0 的世界書同步功能。
// 4. [優化] 全新黑金質感 (Black-Gold) 與玻璃擬物化 UI 設計。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入電子錢包系統 (V3.1 AI連動版)...');
    const win = window.parent || window;

    // 定義 Lorebook 關鍵字
    const LORE_COMMENT = '[Wallet_Data]'; 
    const LORE_KEYS = ['錢包', 'wallet', 'money', 'balance', '會員卡', 'card'];

    // 卡片定義
    const CARD_DEFINITIONS = {
        'vip_silver': { name: '不夜城白銀卡', color: 'linear-gradient(135deg, #7f8c8d 0%, #bdc3c7 100%)', icon: '🥈', desc: '基礎會員資格' },
        'vip_gold':   { name: '不夜城黃金卡', color: 'linear-gradient(135deg, #d4af37 0%, #f39c12 100%)', icon: '👑', desc: '尊貴客戶證明' },
        'vip_black':  { name: '黑曜石無限卡', color: 'linear-gradient(135deg, #111111 0%, #2c3e50 100%)', icon: '💳', desc: '極致奢華，權力象徵' },
        'gang_pass':  { name: '地下通行證',   color: 'linear-gradient(135deg, #00d2d3 0%, #185a9d 100%)', icon: '☠️', desc: '黑市與禁區通行' }
    };

    // 預設數據模板
    const DEFAULT_DATA = {
        balance: 5000, 
        transactions: [],
        cards: [],
        ai_processed_ids: [] // 🔥 新增：用來記錄已經處理過的 AI 交易ID (如 T01, T02)
    };

    // === 樣式定義 (全面翻新黑金高質感 UI) ===
    const walletStyle = `
        .eco-container { width: 100%; height: 100%; background: #050505; background: radial-gradient(circle at top right, #1a1a24, #050505); color: #f5f6fa; display: flex; flex-direction: column; overflow: hidden; font-family: 'Segoe UI', -apple-system, sans-serif; }
        
        .eco-header { padding: 35px 20px 25px; text-align: center; border-bottom: 1px solid rgba(212,175,55,0.2); background: rgba(10,10,12,0.8); backdrop-filter: blur(10px); box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 10; position: relative; }
        .eco-header::after { content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 40%; height: 1px; background: linear-gradient(90deg, transparent, #d4af37, transparent); }
        .eco-title { color: #aaa; font-size: 12px; letter-spacing: 4px; margin-bottom: 8px; text-transform: uppercase; font-weight: 600; }
        .eco-balance { font-size: 44px; font-weight: bold; color: #d4af37; text-shadow: 0 0 20px rgba(212,175,55,0.4); font-family: 'Courier New', monospace; letter-spacing: 2px; }
        
        .eco-cards-section { padding: 25px 0; overflow-x: auto; white-space: nowrap; flex-shrink: 0; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2); }
        .eco-cards-section::-webkit-scrollbar { height: 4px; }
        .eco-cards-section::-webkit-scrollbar-track { background: transparent; }
        .eco-cards-section::-webkit-scrollbar-thumb { background: rgba(212,175,55,0.4); border-radius: 2px; }
        
        .eco-card-slot { display: inline-block; width: 280px; height: 165px; margin-left: 20px; border-radius: 14px; position: relative; overflow: hidden; box-shadow: 0 15px 35px rgba(0,0,0,0.7); transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); vertical-align: top; border: 1px solid rgba(255,255,255,0.15); }
        .eco-card-slot:hover { transform: translateY(-8px) scale(1.02); box-shadow: 0 20px 40px rgba(0,0,0,0.9), 0 0 15px rgba(212,175,55,0.3); border-color: rgba(212,175,55,0.6); }
        .eco-card-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; opacity: 0.95; }
        .eco-card-bg::after { content: ''; position: absolute; top: 0; left: -100%; width: 50%; height: 100%; background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%); transform: skewX(-25deg); animation: cardShine 6s infinite; pointer-events: none; }
        @keyframes cardShine { 0% { left: -100%; } 20% { left: 200%; } 100% { left: 200%; } }
        
        .eco-card-content { position: relative; z-index: 2; padding: 20px; height: 100%; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 100%); }
        .eco-card-top { display: flex; justify-content: space-between; align-items: center; }
        .eco-card-icon { font-size: 26px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6)); }
        .eco-card-name { font-weight: bold; font-size: 15px; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.9); letter-spacing: 1.5px; text-transform: uppercase; }
        .eco-card-chip { width: 42px; height: 28px; background: linear-gradient(135deg, #e5b252 0%, #b38728 100%); border-radius: 6px; margin-top: 5px; opacity: 0.95; border: 1px solid rgba(0,0,0,0.5); box-shadow: inset 0 1px 1px rgba(255,255,255,0.5); position: relative; overflow: hidden; }
        .eco-card-chip::after { content: ''; position: absolute; top: 50%; left: 0; width: 100%; height: 1px; background: rgba(0,0,0,0.3); }
        .eco-card-chip::before { content: ''; position: absolute; top: 0; left: 50%; width: 1px; height: 100%; background: rgba(0,0,0,0.3); }
        .eco-card-number { font-family: 'Courier New', monospace; font-size: 16px; letter-spacing: 3px; text-shadow: 0 2px 4px rgba(0,0,0,0.9); margin-top: 10px; color: rgba(255,255,255,0.95); }
        .eco-card-desc { font-size: 10px; color: rgba(255,255,255,0.6); margin-top: 4px; letter-spacing: 1px; text-transform: uppercase; }

        .eco-empty-slot { background: rgba(212,175,55,0.02); border: 1px dashed rgba(212,175,55,0.3); display: inline-flex; flex-direction: column; align-items: center; justify-content: center; color: rgba(212,175,55,0.7); width: 280px; height: 165px; margin-left: 20px; border-radius: 14px; vertical-align: top; box-sizing: border-box; transition: 0.3s; }
        
        .eco-history-title { padding: 20px 25px 10px; font-size: 12px; color: #d4af37; letter-spacing: 2px; font-weight: bold; border-bottom: 1px solid rgba(212,175,55,0.2); background: rgba(0,0,0,0.4); }
        .eco-list { flex: 1; overflow-y: auto; padding: 10px 25px; background: rgba(0,0,0,0.4); }
        .eco-list::-webkit-scrollbar { width: 4px; }
        .eco-list::-webkit-scrollbar-track { background: transparent; }
        .eco-list::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        
        .eco-item { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 1px solid rgba(255,255,255,0.04); animation: fadeIn 0.4s ease-out; transition: background 0.3s, padding-left 0.3s; border-left: 2px solid transparent; }
        .eco-item:hover { background: rgba(255,255,255,0.02); border-left: 2px solid #d4af37; padding-left: 10px; }
        .eco-item-left { display: flex; flex-direction: column; gap: 6px; }
        .eco-item-reason { font-size: 14px; color: #eee; font-weight: 500; letter-spacing: 0.5px; }
        .eco-item-time { font-size: 11px; color: #777; font-family: monospace; }
        .eco-item-amount { font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold; letter-spacing: 1px; }
        .amount-plus { color: #00d2d3; text-shadow: 0 0 10px rgba(0,210,211,0.3); }
        .amount-minus { color: #ff4757; }

        .eco-actions { padding: 25px 20px; display: flex; gap: 12px; justify-content: center; background: rgba(10,10,12,0.95); border-top: 1px solid rgba(212,175,55,0.2); box-shadow: 0 -10px 30px rgba(0,0,0,0.6); z-index: 10; }
        .eco-btn { flex: 1; padding: 14px 8px; background: transparent; border: 1px solid #d4af37; color: #d4af37; border-radius: 2px; cursor: pointer; transition: all 0.3s; font-size: 12px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; font-family: inherit; }
        .eco-btn:hover { background: #d4af37; color: #000; box-shadow: 0 0 15px rgba(212,175,55,0.4); transform: translateY(-2px); }
        .eco-btn:active { transform: translateY(0); }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    `;

    const doc = window.parent.document || document;
    if (!doc.getElementById('os-economy-css')) {
        const s = doc.createElement('style'); s.id = 'os-economy-css'; s.innerHTML = walletStyle; doc.head.appendChild(s);
    }

    // === 工具：Scope ===
    function getScopeInfo() {
        let chatId = 'global';
        let userName = 'User';
        if (win.SillyTavern && win.SillyTavern.getContext) {
            const ctx = win.SillyTavern.getContext();
            if (ctx.chatId) chatId = ctx.chatId.split(/[\\/]/).pop().replace(/\.jsonl?$/i, '');
        }
        if (win.OS_USER && typeof win.OS_USER.getInfo === 'function') {
            const info = win.OS_USER.getInfo();
            if (info.name) userName = info.name;
        } else if (win.SillyTavern && win.SillyTavern.getContext) {
            const ctx = win.SillyTavern.getContext();
            if (ctx.name1) userName = ctx.name1;
        }
        return { chatId, userName };
    }

    // === 工具：取得世界書名稱 ===
    function getPrimaryBook() {
        if (!win.TavernHelper) return null;
        const _cb = win.TavernHelper.getCharWorldbookNames('current');
        return (_cb && _cb.primary) ? _cb.primary : null;
    }

    // === 工具：解析 [Wallet_Data] 條目內容 → data 物件 ===
    function parseLorebookEntry(content) {
        try {
            const data = { balance: 0, cards: [], transactions: [], ai_processed_ids: [] };
            const lines = content.split('\n');
            let inTxLog = false;
            for (const line of lines) {
                const t = line.trim();
                if (!t) continue;
                if (t === '[Transaction_LOG]') { inTxLog = true; continue; }
                if (/^\[[^\]]+\]$/.test(t)) { inTxLog = false; continue; }
                if (!inTxLog) {
                    if      (t.startsWith('Balance:'))      data.balance = parseInt(t.slice(8).replace(/[^0-9\-]/g, ''), 10) || 0;
                    else if (t.startsWith('Cards:'))        data.cards = t.slice(6).trim().split(',').map(s=>s.trim()).filter(Boolean);
                    else if (t.startsWith('ProcessedIds:')) data.ai_processed_ids = t.slice(13).trim().split(',').map(s=>s.trim()).filter(Boolean);
                } else {
                    // 格式: "2024/1/1 12:00 | +1000 | 原因"
                    if (t === '(empty)') continue;
                    const parts = t.split('|').map(s => s.trim());
                    if (parts.length >= 3) {
                        const amount = parseInt(parts[1].replace(/[^0-9\-]/g, ''), 10);
                        if (!isNaN(amount)) data.transactions.push({ time: parts[0], amount, reason: parts[2] });
                    }
                }
            }
            return data;
        } catch (e) { return null; }
    }

    // === 工具：Sync to Lorebook（[Wallet_Data] 為單一來源） ===
    async function syncToLorebook(data) {
        if (!win.TavernHelper) {
            // 獨立模式：改存至 OS_WORLDBOOK (IDB)
            if (win.OS_ECONOMY && typeof win.OS_ECONOMY._syncToWorldbook === 'function') {
                win.OS_ECONOMY._syncToWorldbook(data);
            }
            return;
        }
        const { userName } = getScopeInfo();
        const bookName = getPrimaryBook();
        if (!bookName) return;

        const cardNames = data.cards.map(cid => CARD_DEFINITIONS[cid] ? CARD_DEFINITIONS[cid].name : cid).join(', ') || 'None';

        const txLog = (data.transactions || []).slice(0, 50)
            .map(t => `${t.time} | ${t.amount >= 0 ? '+' : ''}${t.amount} | ${t.reason}`)
            .join('\n') || '(empty)';

        // 上半段：人類 / AI 可讀；下半段：機器可解析（供 load 恢復用）
        const content =
`[Wallet_Status]
持有者: ${userName}
餘額: $${data.balance.toLocaleString()}
會員卡: ${cardNames}

[Transaction_LOG]
${txLog}

[_machine_]
Balance: ${data.balance}
Cards: ${data.cards.join(',')}
ProcessedIds: ${(data.ai_processed_ids || []).join(',')}`;

        try {
            const entries = await win.TavernHelper.getLorebookEntries(bookName);
            const existEntry = entries.find(e => e.comment === LORE_COMMENT);
            const entryData = {
                comment: LORE_COMMENT, keys: LORE_KEYS, content,
                constant: true, enabled: true, position: 'before_char_defs', order: 90
            };
            if (existEntry) {
                await win.TavernHelper.updateLorebookEntriesWith(bookName, list =>
                    list.map(e => e.comment === LORE_COMMENT ? { ...e, ...entryData } : e));
            } else {
                await win.TavernHelper.createLorebookEntries(bookName, [entryData]);
            }
        } catch (e) { console.error('[Economy] Sync Error:', e); }
    }

    win.OS_ECONOMY = {
        data: { ...DEFAULT_DATA },
        currentKey: '',
        container: null,

        init: function() { this.load(); this.setupListeners(); },

        load: function() {
            const { chatId, userName } = getScopeInfo();
            this.currentKey = `os_eco_${chatId}_${userName.replace(/\s+/g, '_')}`;

            // 1. 先從 localStorage 快速載入（同步，避免 UI 空白）
            const saved = localStorage.getItem(this.currentKey);
            if (saved) {
                try {
                    this.data = JSON.parse(saved);
                    if (!this.data.cards) this.data.cards = [];
                    if (!this.data.transactions) this.data.transactions = [];
                    if (!this.data.ai_processed_ids) this.data.ai_processed_ids = [];
                } catch (e) { this.data = { ...DEFAULT_DATA }; }
            } else {
                this.data = { ...DEFAULT_DATA };
            }

            // 2. 非同步從 [Wallet_Data] 讀取最新數據（lorebook 為權威來源）
            this._syncFromLorebook();
        },

        // 從 lorebook [Wallet_Data] 條目讀取並更新本地快取
        _syncFromLorebook: async function() {
            try {
                if (!win.TavernHelper) {
                    return this._syncFromWorldbook();
                }
                const bookName = getPrimaryBook();
                if (!bookName) return;
                const entries = await win.TavernHelper.getLorebookEntries(bookName);
                const entry = entries.find(e => e.comment === LORE_COMMENT);
                if (!entry || !entry.content) return;

                // 解析 [_machine_] 區塊（精確數字）+ [Transaction_LOG]
                const parsed = parseLorebookEntry(entry.content);
                if (!parsed) return;

                // 合併：保留本地比 lorebook 更新的 processed_ids（防重複扣款）
                const mergedIds = [...new Set([
                    ...(this.data.ai_processed_ids || []),
                    ...(parsed.ai_processed_ids || [])
                ])];
                this.data = { ...parsed, ai_processed_ids: mergedIds };
                localStorage.setItem(this.currentKey, JSON.stringify(this.data));
                if (this.container) this.render();
                console.log('[Economy] 已從 [Wallet_Data] 同步最新數據');
            } catch (e) { console.warn('[Economy] 從 lorebook 讀取失敗，使用本地快取:', e); }
        },

        // === 獨立模式：OS_WORLDBOOK (IDB) 持久化 ===

        // 將 data 物件序列化為與 lorebook 相同格式的文字
        _buildWalletContent: function(data) {
            const { userName } = getScopeInfo();
            const cardNames = data.cards.map(cid =>
                CARD_DEFINITIONS[cid] ? CARD_DEFINITIONS[cid].name : cid
            ).join(', ') || 'None';
            const txLog = (data.transactions || []).slice(0, 50)
                .map(t => `${t.time} | ${t.amount >= 0 ? '+' : ''}${t.amount} | ${t.reason}`)
                .join('\n') || '(empty)';
            return (
`[Wallet_Status]
持有者: ${userName}
餘額: $${data.balance.toLocaleString()}
會員卡: ${cardNames}

[Transaction_LOG]
${txLog}

[_machine_]
Balance: ${data.balance}
Cards: ${data.cards.join(',')}
ProcessedIds: ${(data.ai_processed_ids || []).join(',')}`
            );
        },

        // 寫入 OS_DB worldbook（upsert by comment）
        _syncToWorldbook: async function(data) {
            if (!win.OS_DB) return;
            const content = this._buildWalletContent(data);
            try {
                const entries = await win.OS_DB.getAllWorldbookEntries();
                const existing = entries.find(e => e.comment === LORE_COMMENT);
                const entryObj = {
                    comment: LORE_COMMENT,
                    title:   LORE_COMMENT,       // 方便 getEnabledContext() 查詢
                    keys:    LORE_KEYS,
                    content,
                    constant: true,
                    enabled:  true,
                    position: 'before_char_defs',
                    order:    90
                };
                if (existing) entryObj.id = existing.id; // upsert：沿用舊 id 讓 put() 覆寫
                await win.OS_DB.saveWorldbookEntry(entryObj);
                console.log('[Economy] ✅ 已同步至 OS_WORLDBOOK');
            } catch(e) { console.error('[Economy] OS_WORLDBOOK Sync Error:', e); }
        },

        // 從 OS_DB worldbook 讀取並更新本地快取
        _syncFromWorldbook: async function() {
            if (!win.OS_DB) return;
            try {
                const entries = await win.OS_DB.getAllWorldbookEntries();
                const entry = entries.find(e => e.comment === LORE_COMMENT);
                if (!entry || !entry.content) return;
                const parsed = parseLorebookEntry(entry.content);
                if (!parsed) return;
                // 合併：保留本地比 worldbook 更新的 processed_ids（防重複扣款）
                const mergedIds = [...new Set([
                    ...(this.data.ai_processed_ids || []),
                    ...(parsed.ai_processed_ids || [])
                ])];
                this.data = { ...parsed, ai_processed_ids: mergedIds };
                localStorage.setItem(this.currentKey, JSON.stringify(this.data));
                if (this.container) this.render();
                console.log('[Economy] ✅ 已從 OS_WORLDBOOK 載入數據');
            } catch(e) { console.warn('[Economy] 從 OS_WORLDBOOK 讀取失敗，使用本地快取:', e); }
        },

        save: function() {
            if (!this.currentKey) this.load();
            localStorage.setItem(this.currentKey, JSON.stringify(this.data));
            syncToLorebook(this.data);
        },

        setupListeners: function() {
            if (win.eventOn && win.tavern_events) {
                win.eventOn(win.tavern_events.CHAT_CHANGED, () => {
                    setTimeout(() => { this.load(); if (this.container) this.render(); }, 500);
                });
            }
        },

        getBalance: function() { return this.data.balance; },
        formatMoney: function(n) { return '$' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); },

        // --- 手動交易 ---
        transaction: function(amount, reason) {
            if (amount < 0 && this.data.balance + amount < 0) {
                this.notify('交易失敗', `餘額不足！無法支付: ${reason}`, 'error');
                return false;
            }
            this.data.balance += amount;
            const record = { time: new Date().toLocaleString(), amount: amount, reason: reason };
            this.data.transactions.unshift(record);
            if (this.data.transactions.length > 50) this.data.transactions.pop();
            this.save();
            if (this.container) this.render();
            
            const type = amount >= 0 ? 'income' : 'expense';
            const title = amount >= 0 ? '入帳通知' : '扣款通知';
            const msg = `${reason}: ${amount >= 0 ? '+' : ''}${this.formatMoney(amount)}`;
            this.notify(title, msg, type);
            return true;
        },

        // --- 🔥 核心：處理 AI 發起的交易 ---
        processAiTransaction: function(id, amountStr, reason) {
            // 1. 檢查是否已經處理過
            if (this.data.ai_processed_ids.includes(id)) {
                // console.log(`[Economy] 交易 ${id} 已處理過，跳過。`);
                return;
            }

            // 2. 解析金額 (移除錢號和逗號)
            const cleanAmount = parseInt(amountStr.replace(/[^0-9\-]/g, ''), 10);
            if (isNaN(cleanAmount)) return;

            console.log(`[Economy] 收到 AI 交易請求: ID=${id}, Amount=${cleanAmount}, Reason=${reason}`);

            // 3. 執行交易
            const success = this.transaction(cleanAmount, reason);

            // 4. 如果交易成功，將 ID 加入已處理清單
            if (success) {
                this.data.ai_processed_ids.push(id);
                // 避免陣列無限膨脹，只保留最近 200 筆
                if (this.data.ai_processed_ids.length > 200) this.data.ai_processed_ids.shift();
                this.save();
            }
        },

        // --- 卡片功能 ---
        addCard: function(cardId) {
            if (!CARD_DEFINITIONS[cardId]) return false;
            if (this.data.cards.includes(cardId)) return false;
            this.data.cards.push(cardId);
            this.save();
            this.notify('獲得會員卡', `收到: ${CARD_DEFINITIONS[cardId].name}`, 'income');
            if (this.container) this.render();
            return true;
        },

        removeCard: function(cardId) {
            const idx = this.data.cards.indexOf(cardId);
            if (idx > -1) {
                this.data.cards.splice(idx, 1);
                this.save();
                if (this.container) this.render();
                return true;
            }
            return false;
        },

        hasCard: function(cardId) { return this.data.cards.includes(cardId); },

        topUp: function() {
            const input = prompt("請輸入儲值金額 (整數):", "1000");
            if (input === null) return;
            const amount = parseInt(input, 10);
            if (isNaN(amount) || amount <= 0) {
                this.notify('儲值失敗', '請輸入有效的正整數金額', 'error');
                return;
            }
            this.transaction(amount, '手動儲值');
        },

        launch: function(container) { this.container = container; this.render(); },

        render: function() {
            if (!this.container) return;
            const { userName } = getScopeInfo();
            
            let cardsHtml = '';
            if (this.data.cards.length === 0) {
                cardsHtml = `<div class="eco-empty-slot"><div>無會員卡</div><div style="font-size:10px; margin-top:5px; color:rgba(212,175,55,0.5);">完成任務或購買以獲取</div></div>`;
            } else {
                cardsHtml = this.data.cards.map(id => {
                    const def = CARD_DEFINITIONS[id] || { name: '未知卡片', color: '#333', icon: '❓' };
                    return `
                        <div class="eco-card-slot">
                            <div class="eco-card-bg" style="background: ${def.color}"></div>
                            <div class="eco-card-content">
                                <div class="eco-card-top">
                                    <div class="eco-card-icon">${def.icon}</div>
                                    <div class="eco-card-name">${def.name}</div>
                                </div>
                                <div>
                                    <div class="eco-card-chip"></div>
                                    <div class="eco-card-number">**** **** **** ${Math.floor(1000 + Math.random() * 9000)}</div>
                                    <div class="eco-card-desc">${def.desc || 'MEMBER CARD'}</div>
                                </div>
                            </div>
                        </div>`;
                }).join('');
            }

            const listHtml = this.data.transactions.map(t => `
                <div class="eco-item">
                    <div class="eco-item-left">
                        <div class="eco-item-reason">${t.reason}</div>
                        <div class="eco-item-time">${t.time}</div>
                    </div>
                    <div class="eco-item-amount ${t.amount >= 0 ? 'amount-plus' : 'amount-minus'}">
                        ${t.amount >= 0 ? '+' : ''}${this.formatMoney(t.amount)}
                    </div>
                </div>`).join('');

            this.container.innerHTML = `
                <div class="eco-container">
                    <div class="eco-header">
                        <div class="eco-title">Account Holder: ${userName}</div>
                        <div class="eco-balance">${this.formatMoney(this.data.balance)}</div>
                    </div>
                    <div style="padding:15px 25px 5px; font-size:12px; color:#d4af37; letter-spacing:2px; font-weight:bold; background: rgba(0,0,0,0.2);">MY CARDS / 卡包</div>
                    <div class="eco-cards-section">${cardsHtml}</div>
                    <div class="eco-history-title">TRANSACTIONS / 交易紀錄</div>
                    <div class="eco-list">${listHtml.length ? listHtml : '<div style="text-align:center; color:#666; margin-top:30px; letter-spacing:1px; font-size:13px;">尚無任何交易紀錄</div>'}</div>
                    <div class="eco-actions">
                        <button class="eco-btn" onclick="window.PhoneSystem.goHome()">返回首頁</button>
                        <button class="eco-btn" onclick="window.OS_ECONOMY.topUp()">💰 儲值</button>
                        <button class="eco-btn" onclick="window.OS_ECONOMY.addCard('vip_silver')">💳 白銀卡</button>
                    </div>
                </div>`;
        },

        notify: function(title, message, type = 'info') {
            console.log(`[Wallet] ${title}: ${message}`);
            if (win.toastr) {
                if (type === 'error' || type === 'expense') win.toastr.error(message, title);
                else win.toastr.success(message, title);
            }
        }
    };
    win.OS_ECONOMY.init();
})();