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
                let mod;
                try { mod = await this._getItemizedMod(); }
                catch (e) { return false; }
                if (!mod || typeof mod.itemizedParams !== 'function') return false;
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
