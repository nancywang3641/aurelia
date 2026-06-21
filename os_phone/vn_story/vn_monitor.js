// ----------------------------------------------------------------
// [檔案] vn_monitor.js
// 路徑：os_phone/vn_story/vn_monitor.js
// 職責：VN 視覺小說播放器 - 上下文 Token 監控器
// 自 vn_core.js V8.6 拆分出獨立模組
// 依賴：(運行期) OS_API, extension_settings.variables.global
// 暴露：window.VN_CtxMonitor
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[PhoneOS] 載入 VN 上下文監控模組 (vn_monitor.js)...');
    const win = window.parent || window;

    const VN_CtxMonitor = {
        sendTokens: null, sendChars: null,
        recvTokens: null, recvChars: null,
        msgs: null, lastUpdate: null,
        breakdown: null,

        // 讀取用戶設定的警戒 token 上限（localStorage 持久化）
        getLimit: function() {
            return parseInt(localStorage.getItem('vn_ctx_limit') || '50000') || 50000;
        },
        saveLimit: function(val) {
            const n = Math.max(1000, parseInt(val) || 50000);
            localStorage.setItem('vn_ctx_limit', String(n));
            this._refreshDisplay();
        },

        // 獨立模式：從 OS_API._lastCtx 讀取
        _readFromStandalone: function() {
            try {
                const ctx = win.OS_API?._lastCtx;
                if (!ctx) return false;
                this.sendTokens = ctx.sendTokens;
                this.sendChars  = ctx.sendChars;
                this.recvTokens = ctx.recvTokens;
                this.recvChars  = ctx.recvChars;
                this.msgs       = ctx.msgCount;
                this.lastUpdate = new Date(ctx.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return true;
            } catch(e) { return false; }
        },

        // ST 模式：優先讀插件全域變數
        _readFromPlugin: function() {
            try {
                const g = win.extension_settings?.variables?.global;
                if (!g) return false;
                const sT = parseInt(g.LAST_SEND_TOKENS);
                const sC = parseInt(g.LAST_SEND_CHARS);
                const rT = parseInt(g.LAST_RECEIVE_TOKENS);
                const rC = parseInt(g.LAST_RECEIVE_CHARS);
                if (!isNaN(sT)) this.sendTokens = sT;
                if (!isNaN(sC)) this.sendChars  = sC;
                if (!isNaN(rT)) this.recvTokens = rT;
                if (!isNaN(rC)) this.recvChars  = rC;
                return !isNaN(sT);
            } catch(e) { return false; }
        },

        // 動態 import 酒館原生 itemized-prompts 模組（同源、同一實例、live 陣列）。
        // 注意：itemizedPrompts/itemizedParams「不在」getContext() 上，是該模組的匯出，
        //       只能 import 拿；且 token 數字沒存在 entry，要呼叫 itemizedParams() 現算。
        _itemizedMod: null,
        _getItemizedMod: function() {
            if (!this._itemizedMod) {
                try {
                    // 動態 import 酒館的 itemized-prompts.js。難點：CDN(助手)版這支從 jsdelivr 載入，
                    // 裸 '/scripts/...' 會解析到 jsdelivr origin → 404；而 TauriTavern 等改後端的環境，
                    // 前端路徑也可能不是 origin+/scripts/。最耐的做法：找酒館主腳本 script.js 實際在哪，
                    // 據此組 itemized-prompts.js 的絕對網址（跟著酒館自己的路徑走）。
                    let url = '';
                    try {
                        const doc = (win && win.document) || document;
                        const tags = doc.querySelectorAll('script[src]');
                        for (let i = 0; i < tags.length; i++) {
                            const mm = (tags[i].src || '').match(/^(.*)\/script\.js(?:\?|$)/);
                            if (mm) { url = mm[1] + '/scripts/itemized-prompts.js'; break; }
                        }
                    } catch (e) {}
                    if (!url) {
                        const _org = (win && win.location && win.location.origin) || (window.location && window.location.origin) || '';
                        url = _org + '/scripts/itemized-prompts.js';
                    }
                    this._itemizedModUrl = url;
                    this._itemizedMod = import(url);
                }
                catch (e) { this._itemizedMod = Promise.reject(e); }
            }
            return this._itemizedMod;
        },

        // ST 模式優先：讀酒館原生 itemized 資料，準確且有細項拆解
        _readFromItemized: async function() {
            try {
                // TauriTavern：import 模組會炸/不穩，且 live 索引會挑到高 mesId 的小幻影紀錄 →
                //   一律改走存檔讀取（讀所有 record、挑總和最大的真上下文）。
                if (this._isTauri()) return await this._readFromTauriStorage();
                let mod;
                try { mod = await this._getItemizedMod(); }
                catch (e) { return await this._readFromTauriStorage(); }   // 萬一非 Tauri 但 import 仍失敗，也退存檔
                if (!mod || typeof mod.itemizedParams !== 'function') return await this._readFromTauriStorage();
                // 取 live 陣列。原版酒館(非 bundle)＝同一實例，已有資料、直接用。
                // TauriTavern：itemized 已改成「持久化」(tt_prompts_index / tt_prompts_record)，但這個 import
                //   實例的陣列可能是空的（沒被載進來）。只有「空」時才呼叫 loadItemizedPrompts(chatId) 從存檔載出來
                //   —— 空的不會蓋掉任何 live 資料；有資料時絕不呼叫（避免覆寫酒館剛生成未存檔的記憶體陣列）。
                let items = mod.itemizedPrompts;
                if ((!Array.isArray(items) || items.length === 0) && typeof mod.loadItemizedPrompts === 'function') {
                    try {
                        const ctx = (win.SillyTavern && win.SillyTavern.getContext && win.SillyTavern.getContext())
                                 || (window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext());
                        const chatId = ctx && ctx.chatId;
                        if (chatId) { await mod.loadItemizedPrompts(chatId); items = mod.itemizedPrompts; }
                    } catch (e) {}
                }
                if (!Array.isArray(items) || items.length === 0) return false;
                // 挑「最大的一筆」= 真正的主對話上下文。
                // （不能只挑最新 mesId：TauriTavern 等環境會多出高 mesId 的小型/幻影紀錄，
                //   會把真正的大上下文蓋掉 → CTX 顯示成那筆小的。改用 token 量挑最大最穩。）
                const _score = function (it) {
                    if (!it) return -1;
                    let s = Number(it.oaiTotalTokens);
                    if (!s || isNaN(s)) {
                        s = (Number(it.oaiConversationTokens) || 0)
                          + (Number(it.oaiMainTokens) || 0)
                          + (typeof it.worldInfoString === 'string' ? Math.ceil(it.worldInfoString.length / 4) : 0)
                          + (typeof it.finalPrompt === 'string' ? Math.ceil(it.finalPrompt.length / 4) : 0);
                    }
                    return isNaN(s) ? 0 : s;
                };
                let idx = -1, best = -1;
                for (let i = 0; i < items.length; i++) {
                    const sc = _score(items[i]);
                    if (sc > best) { best = sc; idx = i; }
                }
                // TauriTavern 的 itemizedPrompts 是精簡索引 {mesId, recordId}，沒有 inline token 欄位
                //   → 上面 score 全 0。改挑「最新 mesId」(= 當前這輪生成的上下文)，token 交給 itemizedParams 從 record 現拉。
                if (best <= 0) {
                    let maxMes = -Infinity;
                    for (let i = 0; i < items.length; i++) {
                        const m = Number(items[i].mesId);
                        if (!isNaN(m) && m > maxMes) { maxMes = m; idx = i; }
                    }
                }
                if (idx < 0) return false;
                const p = await mod.itemizedParams(items, idx, Number(items[idx].mesId));
                if (!p) return false;
                try { this.breakdownContent = this._recordToContent(items[idx]); } catch(e) { this.breakdownContent = null; }
                const n = (v) => { const x = Number(v); return isNaN(x) ? 0 : x; };
                const isOai = p.this_main_api === 'openai';
                const total = n(p.finalPromptTokens) || n(p.totalTokensInPrompt);
                if (!total) return false;
                const world    = n(p.worldInfoStringTokens);
                const chat     = n(p.ActualChatHistoryTokens);
                const examples = n(p.examplesStringTokens);
                const inject   = n(p.chatInjects) + n(p.summarizeStringTokens) + n(p.smartContextStringTokens) + n(p.chatVectorsStringTokens) + n(p.dataBankVectorsStringTokens);
                let system, character, persona, note, bias;
                if (isOai) {
                    system    = n(p.oaiSystemTokens);
                    character = n(p.charDescriptionTokens) + n(p.charPersonalityTokens) + n(p.scenarioTextTokens);
                    persona   = n(p.userPersonaStringTokens);
                    note      = n(p.authorsNoteStringTokens);
                    bias      = n(p.oaiBiasTokens);
                } else {
                    system    = 0;
                    character = n(p.storyStringTokens);   // 文字補全：角色卡（已扣世界書）
                    persona   = 0;
                    note      = n(p.allAnchorsTokens);
                    bias      = n(p.promptBiasTokens);
                }
                this.sendTokens = total;
                this.sendChars  = null;
                this.breakdown  = { system, character, world, examples, chat, persona, note, inject, bias, total };
                this.lastUpdate = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return true;
            } catch (e) { return false; }
        },

        // ── TauriTavern 專用：直接讀它持久化的 itemized 存檔（import 模組會因 window.SillyTavern 唯讀而炸）──
        //   localForage db 'SillyTavern_Prompts' / store 'keyvaluepairs'
        //   key: tt_prompts_index:<chatId>（[{mesId,recordId}]）、tt_prompts_record:<chatId>:<recordId>（完整 record）
        _idbGet: function(dbName, storeName, key) {
            return new Promise(function(res){
                try {
                    const req = indexedDB.open(dbName);
                    req.onsuccess = function(){
                        const db = req.result;
                        try {
                            if (!db.objectStoreNames.contains(storeName)) { db.close(); return res(undefined); }
                            const g = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
                            g.onsuccess = function(){ res(g.result); db.close(); };
                            g.onerror = function(){ res(undefined); db.close(); };
                        } catch(e){ res(undefined); try{ db.close(); }catch(_){} }
                    };
                    req.onerror = function(){ res(undefined); };
                } catch(e){ res(undefined); }
            });
        },
        _promptStoreGet: async function(key) {
            const lf = (win.localforage || window.localforage);
            if (lf && lf.createInstance) {
                try {
                    if (!this._lfInst) this._lfInst = lf.createInstance({ name: 'SillyTavern_Prompts' });
                    const v = await this._lfInst.getItem(key);
                    if (v !== undefined && v !== null) return v;
                } catch (e) {}
            }
            return await this._idbGet('SillyTavern_Prompts', 'keyvaluepairs', key);
        },
        _isTauri: function() {
            try {
                if (win.__TAURI__ || window.__TAURI__ || win.__TAURI_INTERNALS__ || window.__TAURI_INTERNALS__) return true;
                const h = (win.location && win.location.host) || (window.location && window.location.host) || '';
                return /tauri/i.test(h);
            } catch (e) { return false; }
        },
        // 真分詞器 token 計數（getContext().getTokenCountAsync，對齊原生面板）；拿不到才退 len/4 估
        _tokAsync: async function(str) {
            if (!str || typeof str !== 'string') return 0;
            try {
                if (this._ctxTok === undefined) {
                    const ctx = (win.SillyTavern && win.SillyTavern.getContext && win.SillyTavern.getContext())
                             || (window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext());
                    this._ctxTok = (ctx && typeof ctx.getTokenCountAsync === 'function') ? ctx.getTokenCountAsync : null;
                }
                if (this._ctxTok) { const t = await this._ctxTok(str); if (typeof t === 'number' && !isNaN(t)) return t; }
            } catch (e) {}
            return Math.ceil(str.length / 4);
        },
        // 快速排序分數（同步、不分詞）—— 只為從所有 record 挑出「最大那筆」真上下文，避免每筆都跑分詞器
        _pickScore: function(rec) {
            if (!rec) return -1;
            const n = function(v){ const x = Number(v); return isNaN(x) ? 0 : x; };
            const l4 = function(s){ return (typeof s === 'string') ? Math.ceil(s.length / 4) : 0; };
            if (rec.main_api === 'openai') return n(rec.oaiConversationTokens) + n(rec.oaiMainTokens) + n(rec.oaiPromptTokens) + l4(rec.worldInfoString);
            return l4(rec.mesSendString) + l4(rec.storyString);
        },
        // 把選中的 record 換算成 { total, breakdown }：OAI 數字用存好的（精確），字串分項用真分詞器（對齊原生）
        _recordToBreakdown: async function(rec) {
            if (!rec) return null;
            try { this.breakdownContent = this._recordToContent(rec); } catch(e) { this.breakdownContent = null; }
            const n = function(v){ const x = Number(v); return isNaN(x) ? 0 : x; };
            const isOai = rec.main_api === 'openai';
            const world  = await this._tokAsync(rec.worldInfoString);
            const inject = (await this._tokAsync(rec.chatInjects)) + (await this._tokAsync(rec.summarizeString)) + (await this._tokAsync(rec.smartContextString)) + (await this._tokAsync(rec.chatVectorsString)) + (await this._tokAsync(rec.dataBankVectorsString));
            let system, character, persona, note, bias, chat, examples, total;
            if (isOai) {
                chat      = n(rec.oaiConversationTokens);
                system    = n(rec.oaiStartTokens) + n(rec.oaiNsfwTokens) + n(rec.oaiMainTokens) + n(rec.oaiImpersonateTokens) + n(rec.oaiJailbreakTokens) + n(rec.oaiNudgeTokens);
                character = (await this._tokAsync(rec.charDescription)) + (await this._tokAsync(rec.charPersonality)) + (await this._tokAsync(rec.scenarioText));
                persona   = await this._tokAsync(rec.userPersona);
                note      = await this._tokAsync(rec.authorsNoteString);
                bias      = n(rec.oaiBiasTokens);
                examples  = n(rec.oaiExamplesTokens);
                // 對齊 itemizedParams OAI 公式（前後錨點相消）：各 oai 數字加總 + 真實世界書 tokens
                total = n(rec.oaiStartTokens) + n(rec.oaiPromptTokens) + n(rec.oaiExamplesTokens) + n(rec.oaiMainTokens)
                      + n(rec.oaiNsfwTokens) + n(rec.oaiBiasTokens) + n(rec.oaiImpersonateTokens) + n(rec.oaiJailbreakTokens)
                      + n(rec.oaiNudgeTokens) + n(rec.oaiConversationTokens) + world;
            } else {
                examples  = await this._tokAsync(rec.examplesString);
                const story = Math.max(0, (await this._tokAsync(rec.storyString)) - world);
                chat      = await this._tokAsync(rec.mesSendString);
                system    = 0;
                character = story;
                persona   = 0;
                note      = await this._tokAsync(rec.allAnchors);
                bias      = await this._tokAsync(rec.promptBias);
                total     = story + world + examples + chat + note + bias;
            }
            return { total: total, breakdown: { system: system||0, character: character||0, world: world||0, examples: examples||0, chat: chat||0, persona: persona||0, note: note||0, inject: inject||0, bias: bias||0, total: total } };
        },

        // 🔧 用「真送出訊息」重算 breakdown（_liveChat = CHAT_COMPLETION_PROMPT_READY 抓的，=模型真收到的、對齊平台）。
        //   itemized 帳本在自訂連線(如 Gemini)常算少/把重預設拆走→系統提示變 260、合計對不上平台；這條治本。
        //   世界書/角色卡無法從「一大包 system」裡乾淨拆出(本來就一起當 system 送)→ 併進「系統提示」如實顯示。
        _breakdownFromLive: async function() {
            const lc = this._liveChat;
            if (!Array.isArray(lc) || !lc.length) return null;
            const s = function(m){ return (m && m.content != null) ? String(m.content) : ''; };
            const sysText  = lc.filter(function(m){ return m && m.role === 'system'; }).map(s).join('\n\n');
            const chatText = lc.filter(function(m){ return m && m.role !== 'system'; }).map(s).join('\n\n');
            const sysTok  = await this._tokAsync(sysText);
            const chatTok = await this._tokAsync(chatText);
            const total = sysTok + chatTok;
            this.breakdownContent = { system: sysText, chat: chatText };
            return {
                total: total,
                chars: (sysText.length + chatText.length),
                breakdown: { system: sysTok, character: 0, world: 0, examples: 0, chat: chatTok, persona: 0, note: 0, inject: 0, bias: 0, total: total }
            };
        },

        // ── 逐項內容檢視：點 breakdown 列 → 看實際送出去的原文（OAI/文字補全共用，欄位缺就空）──
        _KEY_LABELS: { system:'系統提示', character:'角色卡', world:'世界資訊', examples:'對話範例', chat:'聊天記錄', persona:'使用者角色', note:'作者備註', inject:'注入/擴充', recall:'記憶召回' },

        _recordToContent: function(rec) {
            if (!rec) return {};
            const s = function(v){ return (typeof v === 'string') ? v : (v == null ? '' : String(v)); };
            const join = function(){ return Array.prototype.slice.call(arguments).map(s).filter(function(t){ return t && t.trim(); }).join('\n\n'); };
            // OAI/chat completion：實際送出的是 rawPrompt(=[{role,content}] 訊息陣列)，沒有 mesSendString。
            // 取 user/assistant 訊息 = 對話歷史；system 訊息 = 系統段；rpAll = 全部(備援)。
            const rp = rec.rawPrompt;
            const rpArr = Array.isArray(rp) ? rp : null;
            const rpByRole = function(roles){ return rpArr ? rpArr.filter(function(m){ return m && roles.indexOf(m.role) >= 0; }).map(function(m){ return '['+(m.role||'?')+']\n'+s(m.content); }).join('\n\n') : ''; };
            const rpAll = rpArr ? rpArr.map(function(m){ return '['+(m.role||'?')+']\n'+s(m.content); }).join('\n\n') : s(rp);
            return {
                system:    join(rec.systemPromptString, rec.main, rec.oaiMainString) || rpByRole(['system']),
                character: join(rec.charDescription, rec.charPersonality, rec.scenarioText) || s(rec.storyString),
                world:     s(rec.worldInfoString),
                examples:  s(rec.examplesString) || s(rec.mesExamplesString),
                chat:      s(rec.mesSendString) || rpByRole(['user', 'assistant']) || rpAll,
                persona:   s(rec.userPersona),
                note:      s(rec.authorsNoteString) || s(rec.allAnchors),
                inject:    join(rec.chatInjects, rec.summarizeString, rec.smartContextString, rec.chatVectorsString, rec.dataBankVectorsString),
            };
        },

        _bindContentClicks: function() {
            if (this._contentBound) return;
            const bd = document.getElementById('ctx-breakdown');
            if (!bd) return;
            const self = this;
            bd.addEventListener('click', function(e){
                const item = e.target.closest && e.target.closest('.ctx-bd-item');
                if (!item || !item.id) return;
                e.stopPropagation();
                self.showContent(item.id.replace('ctx-bd-i-', ''));
            });
            this._contentBound = true;
        },

        showContent: function(key) {
            let text;
            if (key === 'recall') {
                text = this.recallText || '';
            } else if ((key === 'chat' || key === 'system') && Array.isArray(this._liveChat) && this._liveChat.length) {
                // 即時捕捉到的真實送出訊息優先（chat=對話、system=系統段）
                const roles = (key === 'chat') ? ['user', 'assistant'] : ['system'];
                text = this._liveChat.filter(function(m){ return m && roles.indexOf(m.role) >= 0; })
                                     .map(function(m){ return '[' + (m.role || '?') + ']\n' + (m.content == null ? '' : m.content); })
                                     .join('\n\n');
                if (!text) text = (this.breakdownContent && this.breakdownContent[key]) || '';
            } else {
                text = (this.breakdownContent && this.breakdownContent[key]) || '';
            }
            const label = this._KEY_LABELS[key] || key;
            const esc = function(x){ return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
            const old = document.getElementById('ctx-cv-overlay');
            if (old) old.remove();
            const ov = document.createElement('div');
            ov.id = 'ctx-cv-overlay';
            ov.className = 'ctx-cv-overlay';
            const meta = text ? (text.length.toLocaleString() + ' 字元（非 token，上方數字才是 token）') : '此項酒館未保留原文 / 本輪為空';
            ov.innerHTML = '<div class="ctx-cv-box">'
                + '<div class="ctx-cv-head"><span class="ctx-cv-title">' + esc(label) + '</span><span class="ctx-cv-meta">' + meta + '</span><button class="ctx-cv-close" type="button">✕</button></div>'
                + '<pre class="ctx-cv-body">' + (text ? esc(text) : '（無內容）') + '</pre>'
                + '</div>';
            document.body.appendChild(ov);
            const close = function(){ ov.remove(); };
            ov.addEventListener('click', function(e){ if (e.target === ov) close(); });
            const cb = ov.querySelector('.ctx-cv-close');
            if (cb) cb.addEventListener('click', close);
        },
        _readFromTauriStorage: async function() {
            try {
                const ctx = (win.SillyTavern && win.SillyTavern.getContext && win.SillyTavern.getContext())
                         || (window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext());
                const chatId = ctx && ctx.chatId;
                if (!chatId) return false;
                const index = await this._promptStoreGet('tt_prompts_index:' + chatId);
                if (!Array.isArray(index) || !index.length) return false;
                // 讀全部 record，過濾掉「小幻影紀錄」(score 極小，如 64)，在真紀錄裡挑「最新 mesId」=
                //   當前實際送出的上下文。這樣總結+隱藏正文後再生成一次，CTX 會反映縮小；
                //   不像挑「最大那筆」會永遠卡在歷史峰值、降不下來。
                const cands = [];
                for (let i = 0; i < index.length; i++) {
                    const rec = await this._promptStoreGet('tt_prompts_record:' + chatId + ':' + index[i].recordId);
                    if (!rec) continue;
                    cands.push({ mesId: Number(index[i].mesId), score: this._pickScore(rec), rec: rec });
                }
                if (!cands.length) return false;
                const real = cands.filter(function(c){ return c.score > 500; }); // 幻影通常 <100；真紀錄遠大於此
                const pool = real.length ? real : cands;
                let pick = pool[0];
                for (let i = 1; i < pool.length; i++) { if (pool[i].mesId > pick.mesId) pick = pool[i]; }
                const b = await this._recordToBreakdown(pick.rec);   // 只對選中那筆跑真分詞器
                if (!b || !b.total) return false;
                this.sendTokens = b.total;
                this.sendChars  = null;
                this.breakdown  = b.breakdown;
                this.lastUpdate = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return true;
            } catch (e) { return false; }
        },

        // 從 console 攔截更新（ST 模式插件未安裝時備援）
        updateSend: function(tokens, chars) {
            this.sendTokens = tokens; this.sendChars = chars;
            this.lastUpdate = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            this._refreshDisplay();
        },
        updateRecv: function(tokens, chars) {
            this.recvTokens = tokens; this.recvChars = chars;
            this._refreshDisplay();
        },
        updateMsgs: function(count) {
            this.msgs = count;
            this._refreshDisplay();
        },

        // 點開 Ctx 時呼叫（async：原生算 token 是非同步的）
        poll: async function() {
            this.breakdown = null;
            this._bindContentClicks();
            const isStandalone = win.OS_API?.isStandalone?.() ?? false;
            if (isStandalone) {
                this._readFromStandalone();
            } else {
                // 同步 input + 先 refresh 一次（避免等算 token 時面板空白），再非同步補上細項
                const limitInputEarly = document.getElementById('ctx-limit-input');
                if (limitInputEarly) limitInputEarly.value = this.getLimit();
                this._refreshDisplay();
                // 優先讀酒館原生 itemizedPrompts（準+有細項）；拿不到再退回插件全域
                if (!(await this._readFromItemized())) {
                    this._readFromPlugin();
                    this.lastUpdate = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                }
            }
            // 記憶召回（向量記憶）獨立計數：用我們實際注入的那段文字算 token（酒館把它併進「注入/擴充」桶，這裡單獨拆出來看）
            try {
                const lr = win.OS_VECTOR_INJECT?._lastRecall;
                this.recallCount  = (lr && lr.count) || 0;
                this.recallTokens = (lr && lr.text) ? await this._tokAsync(lr.text) : 0;
                this.recallText   = (lr && lr.text) || '';
            } catch (e) { this.recallTokens = 0; this.recallCount = 0; this.recallText = ''; }
            // 未總結樓層（酒館）：目前最後樓 − 上次大總結記的 Last
            try {
                if (!(win.OS_API?.isStandalone?.() ?? false) && win.OS_STORY_TOOLS?.getUnsummarizedInfo) {
                    this.unsum = await win.OS_STORY_TOOLS.getUnsummarizedInfo();
                } else { this.unsum = null; }
            } catch (e) { this.unsum = null; }
            // 🔧 有「真送出訊息」就用它重算 breakdown＋合計（蓋掉 itemized 帳本——自訂連線常算少/把重預設拆成 260）。
            //   _liveChat = 模型真收到的那包 → 合計貼近平台、系統提示顯示真實重預設。記憶召回(下面)仍照原本算當 system 子項。
            try {
                const live = await this._breakdownFromLive();
                if (live) {
                    this.breakdown  = live.breakdown;
                    this.sendTokens = live.total;
                    this.sendChars  = live.chars;
                    if (!this.lastUpdate) this.lastUpdate = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                }
            } catch (e) {}

            // 同步 input 顯示值
            const limitInput = document.getElementById('ctx-limit-input');
            if (limitInput) limitInput.value = this.getLimit();
            this._refreshDisplay();
        },

        _refreshDisplay: function() {
            try {
                const eT    = document.getElementById('ctx-tokens');
                const eC    = document.getElementById('ctx-chars');
                const eRT   = document.getElementById('ctx-recv-tokens');
                const eRC   = document.getElementById('ctx-recv-chars');
                const eM    = document.getElementById('ctx-msgs');
                const eTime = document.getElementById('ctx-time');
                if (eT)  eT.textContent  = this.sendTokens != null ? this.sendTokens.toLocaleString() : '—';
                if (eC)  eC.textContent  = this.sendChars  != null ? this.sendChars.toLocaleString()  : '—';
                if (eRT) eRT.textContent = this.recvTokens != null ? this.recvTokens.toLocaleString() : '—';
                if (eRC) eRC.textContent = this.recvChars  != null ? this.recvChars.toLocaleString()  : '—';
                if (eM)  eM.textContent  = this.msgs       != null ? this.msgs.toLocaleString()       : '—';
                if (eTime) eTime.textContent = this.lastUpdate ? `更新 ${this.lastUpdate}` : '尚未偵測到數據';

                // 未總結樓層（酒館）：直觀看到還有多少對話沒總結
                const usRow = document.getElementById('ctx-unsum-row');
                const usVal = document.getElementById('ctx-unsum');
                if (usRow) usRow.style.display = this.unsum ? '' : 'none';
                if (usVal && this.unsum) {
                    const _u = this.unsum;
                    if (_u.uncounted > 0 && _u.start <= _u.end) usVal.textContent = `${_u.uncounted} 樓（第 ${_u.start}–${_u.end}）`;
                    else if (_u.lastSummarized > _u.currentLast) usVal.textContent = `⚠️ 已總結到 #${_u.lastSummarized}、目前剩 #${_u.currentLast}（刪過訊息）`;
                    else usVal.textContent = `0（已最新）`;
                }

                // 總結次數（已做過第幾次大總結，來自世界書總結 entry 的「第N次」最大值）
                const scRow = document.getElementById('ctx-sumcount-row');
                const scVal = document.getElementById('ctx-sumcount');
                if (scRow) scRow.style.display = this.unsum ? '' : 'none';
                if (scVal && this.unsum) {
                    const _c = this.unsum.summaryCount || 0;
                    scVal.textContent = _c > 0 ? `第 ${_c} 次` : '尚未總結';
                }

                // 本輪用量：文字 API 次數 + 生圖次數（追蹤一輪劇情觸發幾次 API / 生圖）
                const uVal = document.getElementById('ctx-usage-cnt');
                if (uVal) {
                    const u = win.AURELIA_USAGE;
                    uVal.textContent = u ? `${u.tText} 次 · 生圖 ${u.tImg}　（累計 ${u.text} / ${u.img}）` : '—';
                }

                // 細項拆解（來自酒館原生 itemizedPrompts；沒資料就隱藏）
                const bd = this.breakdown;
                const bdWrap = document.getElementById('ctx-breakdown');
                if (bdWrap) bdWrap.style.display = bd ? 'block' : 'none';
                if (bd) {
                    const total = bd.total || this.sendTokens || 0;
                    const ROWS = [
                        ['system',    bd.system],
                        ['character', bd.character],
                        ['world',     bd.world],
                        ['examples',  bd.examples],
                        ['chat',      bd.chat],
                        ['persona',   bd.persona],
                        ['note',      bd.note],
                        ['inject',    bd.inject],
                    ];
                    ROWS.forEach(function(row) {
                        const key = row[0];
                        const v = Number(row[1]) || 0;
                        const item = document.getElementById('ctx-bd-i-' + key);
                        const eVal = document.getElementById('ctx-bd-' + key);
                        const eBar = document.getElementById('ctx-bd-bar-' + key);
                        if (item) item.style.display = v > 0 ? 'flex' : 'none';
                        if (eVal) eVal.textContent = v.toLocaleString();
                        if (eBar) eBar.style.width = (total > 0 ? Math.min(100, Math.round(v / total * 100)) : 0) + '%';
                    });
                    // 記憶召回獨立行（值來自 this.recallTokens，是「注入/擴充」的子項、不另計入合計）
                    const recallV = Number(this.recallTokens) || 0;
                    const rItem = document.getElementById('ctx-bd-i-recall');
                    const rVal  = document.getElementById('ctx-bd-recall');
                    const rBar  = document.getElementById('ctx-bd-bar-recall');
                    if (rItem) rItem.style.display = recallV > 0 ? 'flex' : 'none';
                    if (rVal)  rVal.textContent = recallV.toLocaleString() + (this.recallCount ? ` · ${this.recallCount}條` : '');
                    if (rBar)  rBar.style.width = (total > 0 ? Math.min(100, Math.round(recallV / total * 100)) : 0) + '%';

                    const eTot = document.getElementById('ctx-bd-total-val');
                    if (eTot) eTot.textContent = total.toLocaleString();
                }

                // 進度條
                const barFill   = document.getElementById('ctx-bar-fill');
                const usageText = document.getElementById('ctx-usage-text');
                if (barFill && usageText && this.sendTokens != null) {
                    const limit = this.getLimit();
                    const pct   = Math.min(100, Math.round((this.sendTokens / limit) * 100));
                    const level = pct >= 100 ? 'danger' : pct >= 70 ? 'warn' : '';
                    barFill.style.width = pct + '%';
                    barFill.className   = 'ctx-bar-fill' + (level ? ' ' + level : '');
                    usageText.textContent = `${this.sendTokens.toLocaleString()} / ${limit.toLocaleString()} (${pct}%)`;
                    usageText.className   = 'ctx-usage-text' + (level ? ' ' + level : '');
                    // 超過警戒：讓 Ctx 按鈕閃爍提示
                    const ctxBtn = document.getElementById('vn-btn-ctx');
                    if (ctxBtn) {
                        if (level === 'danger') {
                            ctxBtn.style.color  = '#ff6b6b';
                            ctxBtn.title        = '⚠️ 已超過警戒 Token！建議立即總結';
                        } else if (level === 'warn') {
                            ctxBtn.style.color  = '#f6ad55';
                            ctxBtn.title        = '注意：Token 用量已達 70%';
                        } else {
                            ctxBtn.style.color  = '';
                            ctxBtn.title        = '';
                        }
                    }
                    // 顯示/隱藏大總結按鈕
                    const sumWrap = document.getElementById('ctx-summary-wrap');
                    const sumBtn  = document.getElementById('ctx-summary-btn');
                    if (sumWrap) sumWrap.style.display = (level === 'warn' || level === 'danger') ? 'block' : 'none';
                    if (sumBtn) {
                        if (level === 'danger') {
                            sumBtn.style.borderColor = 'rgba(255,107,107,0.5)';
                            sumBtn.style.color = '#ff6b6b';
                            sumBtn.style.background = 'rgba(255,107,107,0.08)';
                        } else {
                            sumBtn.style.borderColor = 'rgba(246,173,85,0.35)';
                            sumBtn.style.color = '#f6ad55';
                            sumBtn.style.background = 'rgba(246,173,85,0.08)';
                        }
                    }
                }

                const popup = document.getElementById('vn-ctx-popup');
                if (popup && popup.classList.contains('show')) {
                    popup.classList.remove('ctx-pulse');
                    void popup.offsetWidth;
                    popup.classList.add('ctx-pulse');
                }
            } catch(e) {}
        }
    };

    window.VN_CtxMonitor = VN_CtxMonitor;

    // 生成當下抓「實際要送出的訊息陣列」——OAI/chat completion 沒有 mesSendString，
    // 對話歷史在 rawPrompt；這裡直接從 CHAT_COMPLETION_PROMPT_READY 事件拿，最可靠、不靠任何持久化。
    (function bindPromptCapture(tries) {
        try {
            const te = win.tavern_events;
            if (win.eventOn && te && te.CHAT_COMPLETION_PROMPT_READY) {
                win.eventOn(te.CHAT_COMPLETION_PROMPT_READY, function(data) {
                    try {
                        if (!data || data.dryRun) return;   // dryRun = 純算 token、不是真送，跳過
                        const msgs = data.chat || data.messages || data.prompt;
                        if (Array.isArray(msgs)) VN_CtxMonitor._liveChat = msgs;
                    } catch (e) {}
                });
                return;
            }
        } catch (e) {}
        if (tries > 0) setTimeout(function(){ bindPromptCapture(tries - 1); }, 1500);
    })(8);

    // console.log 攔截：備援（插件未安裝）+ 捕捉訊息數（插件不寫全域變數）
    (function() {
        const _orig = console.log;
        // 用第一個 arg 做快速前置過濾，避免每條 log 都做 join + regex
        console.log = function(...args) {
            _orig.apply(console, args);
            try {
                const first = typeof args[0] === 'string' ? args[0] : '';
                // 只處理來自 Prompt Template 或 processing 的 log，其他全部跳過
                if (!first.includes('processing') && !first.includes('[Prompt Template]')) return;
                const msg = args.join(' ');
                const hasPlugin = !!win.extension_settings?.variables?.global?.LAST_SEND_TOKENS;
                if (!hasPlugin) {
                    if (msg.includes('send result')) {
                        const m1 = msg.match(/processing send result:\s*(\d+)\s*tokens and\s*(\d+)\s*chars/);
                        if (m1) { VN_CtxMonitor.updateSend(parseInt(m1[1]), parseInt(m1[2])); return; }
                    }
                    if (msg.includes('receive result')) {
                        const m3 = msg.match(/processing receive result:\s*(\d+)\s*tokens and\s*(\d+)\s*chars/);
                        if (m3) { VN_CtxMonitor.updateRecv(parseInt(m3[1]), parseInt(m3[2])); return; }
                    }
                }
                // 訊息數（插件不寫全域，只能從 log 取）
                if (msg.includes('[Prompt Template]')) {
                    const m2 = msg.match(/\[Prompt Template\] processing (\d+) messages in/);
                    if (m2) VN_CtxMonitor.updateMsgs(parseInt(m2[1]));
                }
            } catch(e) {}
        };
    })();
})();
