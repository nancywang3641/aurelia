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

        // ST 模式優先：讀酒館原生 itemizedPrompts(getContext)，準確且有細項拆解
        _readFromItemized: function() {
            try {
                const ctx = (win.SillyTavern && win.SillyTavern.getContext) ? win.SillyTavern.getContext() : null;
                const items = ctx && ctx.itemizedPrompts;
                if (!Array.isArray(items) || items.length === 0) return false;
                const it = items[items.length - 1];
                if (!it) return false;
                const n = (v) => { const x = Number(v); return isNaN(x) ? 0 : x; };
                const total = n(it.oaiTotalTokens) || n(it.finalPromptTokens);
                if (!total) return false;
                const world = n(it.worldInfoStringTokens);
                const chat  = n(it.ActualChatHistoryTokens);
                const ext   = n(it.chatInjects) + n(it.summarizeStringTokens) + n(it.authorsNoteStringTokens) + n(it.smartContextStringTokens) + n(it.chatVectorsStringTokens) + n(it.dataBankVectorsStringTokens);
                const system = Math.max(0, total - world - chat - ext);
                this.sendTokens = total;
                this.sendChars = null;
                this.breakdown = { system: system, world: world, chat: chat, ext: ext };
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

        // 點開 Ctx 時呼叫
        poll: function() {
            this.breakdown = null;
            const isStandalone = win.OS_API?.isStandalone?.() ?? false;
            if (isStandalone) {
                this._readFromStandalone();
            } else {
                // 優先讀酒館原生 itemizedPrompts（準+有細項）；拿不到再退回插件全域
                if (!this._readFromItemized()) {
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
                    const _setBd = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = (v != null ? v.toLocaleString() : '—'); };
                    _setBd('ctx-bd-system', bd.system);
                    _setBd('ctx-bd-world', bd.world);
                    _setBd('ctx-bd-chat', bd.chat);
                    _setBd('ctx-bd-ext', bd.ext);
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
