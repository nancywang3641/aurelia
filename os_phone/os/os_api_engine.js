// ----------------------------------------------------------------
// [檔案] os_api_engine.js (V3.24 - 終極完整版：支援 <vars_analyze> 思考鏈)
// 路徑：os_phone/os/os_api_engine.js
// 職責：組裝 Prompt 並負責與 AI 通訊。
//       AVS 底層引擎由 os_avs_engine.js 提供，本檔僅呼叫 win._AVS_ENGINE。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入 API 引擎 (V3.24)...');
    const win = window.parent || window; // 🔥 絕對保留：雙通向架構的核心

    // AVS 快捷引用（os_avs_engine.js 必須在本檔之前載入）
    const _avsRead  = () => win._AVS_ENGINE?.read?.()       ?? {};
    const _avsApply = (t) => win._AVS_ENGINE?.apply?.(t);

    // ── 用量計數（CTX 面板用）：追蹤一輪劇情觸發幾次文字 API + 幾次生圖 ──
    //   tText/tImg = 本輪(本次主模型生成 → 下次生成之間)；text/img = 本次開啟累計。
    win.AURELIA_USAGE = win.AURELIA_USAGE || {
        text: 0, img: 0, tText: 0, tImg: 0,
        bumpText: function () { this.text++; this.tText++; },
        bumpImg:  function () { this.img++;  this.tImg++; },
        newTurn:  function () { this.tText = 0; this.tImg = 0; }
    };

    // ── 副/主模型輸出記錄環形緩衝（DEBUG 面板「副模型」「主模型」TAB 讀；每次呼叫存 prompt／原始輸出／狀態／耗時）──
    win.AURELIA_API_LOG = win.AURELIA_API_LOG || [];     // 🔥 全局：中央 chat 記「所有」文字呼叫(rec.cat=main/sec/aux + rec.route 用途)
    const SEC_LOG_MAX = 120;
    let _secSeq = 0;
    function _apiLogStart(arr, messages) {
        // 記整包送出的 messages（標 role），DEBUG 面板「📤 送出 prompt」才看得到完整 sysPrompt＋上下文＋歷史；
        // 原本只撈最後一則 user → 跟 inTok（用整包估）對不起來，也看不到組好的人設/世界觀。
        let prompt = '';
        try {
            prompt = (messages || []).map(m => {
                const role = (m && m.role) || '?';
                let c;
                if (typeof m.content === 'string') c = m.content;
                else if (Array.isArray(m.content)) c = m.content.map(p => (p && p.text) || (p && p.type) || '').join('\n');
                else c = JSON.stringify(m && m.content);
                return '【' + role + '】\n' + c;
            }).join('\n\n');
        } catch (e) {}
        const rec = { id: (++_secSeq), t: Date.now(), ok: null, ms: 0, prompt: prompt, raw: '', err: '' };
        try {
            arr.push(rec);
            while (arr.length > SEC_LOG_MAX) arr.shift();
        } catch (e) {}
        return rec;
    }
    function _secLogEnd(rec, ok, payload) {
        if (!rec) return;
        rec.ok = !!ok;
        rec.ms = Date.now() - rec.t;
        if (ok) rec.raw = (typeof payload === 'string') ? payload : '';
        else rec.err = (payload && payload.message) ? payload.message : String(payload);
    }
    // token 估算：優先用酒館 tokenizer；PWA/取不到 → 粗估(CJK≈1字1token、其餘≈4字1token)。非阻塞。
    async function _estTok(text) {
        const s = String(text || '');
        if (!s) return 0;
        try {
            const ST = win.SillyTavern || (win.parent && win.parent.SillyTavern);
            if (ST && typeof ST.getTokenCountAsync === 'function') return await ST.getTokenCountAsync(s);
        } catch (e) {}
        const cjk = (s.match(/[㐀-鿿豈-﫿぀-ヿ]/g) || []).length;
        return cjk + Math.ceil((s.length - cjk) / 4);
    }
    // 把 messages 拼成純文字（多模態只取 text 片段）供估 token
    function _msgsText(messages) {
        try {
            return (messages || []).map(m => {
                if (typeof m.content === 'string') return m.content;
                if (Array.isArray(m.content)) return m.content.map(p => (p && p.text) || '').join(' ');
                return '';
            }).join('\n');
        } catch (e) { return ''; }
    }

    // 酒館主模型每次生成＝一輪起點：歸零本輪 + 主模型本身計一次。
    //   (副模型走 OS_API.chat、生圖走 image_manager，各自計數；大總結 generateRaw 也會觸發此事件→只計次、不重置輪)
    (function _hookUsageTurn() {
        if (!win.eventOn || !win.tavern_events || !win.tavern_events.GENERATION_STARTED) { setTimeout(_hookUsageTurn, 1000); return; }
        win.eventOn(win.tavern_events.GENERATION_STARTED, function (type, opts, dryRun) {
            try {
                if (dryRun) return;   // 🚫 dryRun 空跑非真 API 呼叫 → 別計次(免 API 次數算錯)
                if (win.__AURELIA_SUMMARIZING) { win.AURELIA_USAGE.bumpText(); return; }
                win.AURELIA_USAGE.newTurn();
                win.AURELIA_USAGE.bumpText();
            } catch (e) {}
        });
    })();

    // --- 1. 核心清洗函數 ---
    // keepFences=true：跳過「吃 markdown 三反引號圍欄」那步。
    //   劇情顯示要砍圍欄（不想 ``` 字面跑進對話框），但創作室生成 JSON 程式碼時，
    //   AI 寫的 /```/g 之類三反引號是「資料」不是「顯示圍欄」，砍掉會把 /```/g 削成 //g（=註解）整段壞掉。
    function cleanRawOutput(text, keepFences) {
        if (!text || typeof text !== 'string') return text;
        let cleaned = text;

        const thinkBlocks = [];
        // 🔥 思考鏈剝離：CoT 用哪種標籤包都收（<think>/<thinking>/<thought(s)>/<reasoning>/<thinking_process>/<vars_analyze>），送入思考面板、不顯示進聊天
        cleaned = cleaned.replace(/<(think(?:ing)?|thoughts?|reasoning|thinking_process|vars_analyze)>([\s\S]*?)<\/\1>/gi, (_, tag, inner) => {
            const trimmed = inner.trim();
            if (trimmed) thinkBlocks.push(`[${tag.toUpperCase()}]\n${trimmed}`);
            return ''; // 從最終顯示文本中剔除
        });
        // 原生推理模型/酒館常把思考包成 <details type="reasoning">…</details> → 一併剝掉，別漏進聊天
        cleaned = cleaned.replace(/<details\b[^>]*reasoning[^>]*>[\s\S]*?<\/details>/gi, '');
        
        if (thinkBlocks.length > 0 && win.OS_THINK) {
            win.OS_THINK.push(thinkBlocks.join('\n\n──────\n\n'), text);
        }

        if (thinkBlocks.length === 0) {
            const wxStart = cleaned.search(/<chat\b|\[wx_os\]|\[Chat:/i);
            if (wxStart > 20) {
                const preamble = cleaned.substring(0, wxStart).trim();
                if (preamble.length > 10 && win.OS_THINK) {
                    win.OS_THINK.push('[前置推理]\n' + preamble, text);
                    cleaned = cleaned.substring(wxStart);
                }
            }
        }

        // 🔥 AVS 系統：攔截 <vars> 動態變數（升級：更寬鬆的標籤匹配，防呆機制）
        cleaned = cleaned.replace(/<vars\b[^>]*>([\s\S]*?)<\/vars>/gi, (_, inner) => {
            console.log('🌟 [OS_API] 成功攔截 <vars> 區塊，轉交 AVS 引擎處理');
            try {
                _avsApply(inner.trim());
            } catch(e) {
                console.warn('[OS_API] <vars> 交接失敗:', e, inner);
            }
            return '';
        });

        // 🔥 終極修復：過濾 AI 幻覺產生的危險 HTML 標籤，防止 file:/// 模式下 iframe 渲染崩潰
        cleaned = cleaned.replace(/<(iframe|script|meta|link|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '');
        cleaned = cleaned.replace(/<(iframe|script|meta|link|object|embed)[^>]*\/?>/gi, '');

        if (!keepFences) {
            cleaned = cleaned.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, "$1");
        }
        cleaned = cleaned.trim();
        return cleaned;
    }

    // --- 1.5. 歷史記錄 VN 格式清洗 ---
    function stripVnTags(text) {
        if (!text || typeof text !== 'string') return '';
        let s = text;
        // 🔥 AVS 擴充：將 status、vars、vars_analyze 一併從歷史記錄中隱藏，不浪費 Token
        s = s.replace(/<(session_settlement|status|vars|vars_analyze)>[\s\S]*?<\/\1>/gi, '');
        s = s.replace(/<\/?(content|summary)>/gi, '');
        s = s.replace(/<(think(?:ing)?|thoughts?|reasoning|thinking_process)>([\s\S]*?)<\/\1>/gi, '');
        s = s.replace(/<details\b[^>]*reasoning[^>]*>[\s\S]*?<\/details>/gi, '');
        s = s.replace(/\[Char\|([^|]+)\|[^|]*\|([^|\]]+)(?:\|[^\]]+)?\]/g,
            (_, name, dialogue) => `${name.trim()}: ${dialogue.trim()}`);
        s = s.replace(/\[Nar\|([^|\]]+)(?:\|[^\]]+)?\]/g,
            (_, t) => `(${t.trim()})`);
        s = s.replace(/\[Inner\|[^|]+\|([^|\]]+)(?:\|[^\]]+)?\]/g,
            (_, t) => `(${t.trim()})`);
        s = s.replace(/\[Sys\|[^|]+\|([^\]]+)\]/g, (_, t) => t.trim());
        s = s.replace(/\[(Story|Chapter|Protagonist|Area|BGM|Bg|Trans|Item|SessionEnd|物證|人證|scene)[^\]]*\]/gi, '');
        s = s.replace(/\[[^\[\]\n]{1,60}\]/g, '');
        s = s.replace(/<[^>]+>/g, '');
        s = s.replace(/\n{3,}/g, '\n\n').trim();
        return s;
    }

    // --- 2. 輔助函數 ---
    function sanitizeContent(content) {
        if (!content || typeof content !== 'string') return content;
        if (content.trim().startsWith('{') && content.includes('"content"')) {
            try { const parsed = JSON.parse(content); if (parsed.content) return parsed.content; } catch (e) {}
        }
        return content;
    }

    function normalizeResponse(data, keepFences) {
        if (!data) return "";
        let rawContent = "";

        if (data.candidates && data.candidates[0]?.content?.parts) {
            const parts = data.candidates[0].content.parts;
            const thoughtParts = parts.filter(p => p.thought === true);
            const textParts    = parts.filter(p => p.thought !== true);
            if (thoughtParts.length > 0 && win.OS_THINK) {
                const t = thoughtParts.map(p => p.text || '').join('\n\n').trim();
                if (t) win.OS_THINK.push(t);
            }
            rawContent = textParts.map(p => p.text || '').join('');
        }
        else if (data.choices?.[0]?.message) {
            const msg = data.choices[0].message;
            const thinkText = msg.reasoning_content || msg.reasoning || msg.thinking || '';
            if (thinkText && win.OS_THINK) win.OS_THINK.push(String(thinkText).trim());
            rawContent = msg.content || '';
        }
        else if (typeof data === 'string') rawContent = data;
        else if (data.content) rawContent = data.content;
        else rawContent = JSON.stringify(data);

        return cleanRawOutput(rawContent, keepFences);
    }

    // 給 ConnectionManager.sendRequest 補 vertex 認證欄位：
    // ST 的 sendRequest 漏帶 vertexai_auth_mode → 後端預設 'express' → 服務帳號(full)被當 API Key 找不到金鑰
    // (Secret id not found for api_key_vertexai)。從 oai_settings 多來源讀回 auth_mode/project 塞進 overridePayload
    // (createRequestData 用 ...props 保留 → 整包送後端 /generate；後端讀 request.body.vertexai_auth_mode)。
    function _vertexOverride(ctx, profileId, base) {
        const ov = Object.assign({}, base);
        try {
            const oai = (ctx && ctx.oai_settings) || win.oai_settings || (win.parent && win.parent.oai_settings) || {};
            if (oai.vertexai_auth_mode) ov.vertexai_auth_mode = oai.vertexai_auth_mode;
            if (oai.vertexai_express_project_id) ov.vertexai_express_project_id = oai.vertexai_express_project_id;
            // 保底：全域讀不到、但這個 profile 是 vertexai → 預設服務帳號(full)。
            // (express 用戶全域 auth_mode 會是 'express'、上面已讀到、不會誤觸這條)
            if (!ov.vertexai_auth_mode) {
                const profs = (ctx && ctx.extensionSettings && ctx.extensionSettings.connectionManager && ctx.extensionSettings.connectionManager.profiles) || [];
                const p = profs.find(x => x && x.id === profileId);
                if (p && /vertex/i.test(p.api || '')) ov.vertexai_auth_mode = 'full';
            }
        } catch (e) {}
        return ov;
    }

    // profile 沒設 model（靠激活時的當前 model/preset 決定）→ sendRequest 直接送 profile.model=''（shared.js line448）→
    // vertex/gemini 報「Gemini request is missing model」(Model=? 就是這個)。補：profile 無 model 時把奧瑞亞 config.model
    // 塞進 overridePayload（shared.js line460 ...overridePayload 在 model 之後 → 蓋過空的 profile.model）。有設 model 的 profile 不動。
    function _ensureModelOverride(ctx, profileId, ov, cfgModel) {
        try {
            const profs = (ctx && ctx.extensionSettings && ctx.extensionSettings.connectionManager && ctx.extensionSettings.connectionManager.profiles) || [];
            const p = profs.find(x => x && x.id === profileId);
            if (p && p.model) return ov;   // profile 自帶 model → 交給 ST、不覆寫
            const m = (cfgModel && String(cfgModel).trim()) || '';
            if (m) ov.model = m;           // profile 沒 model → 用奧瑞亞 config.model 補上
        } catch (e) {}
        return ov;
    }

    function smartMergeMessages(msgList) {
        if (!msgList || msgList.length === 0) return [];
        const mergedList = [];
        let lastMsg = null;
        msgList.forEach(curr => {
            const currContent = curr.content || "";
            const isProto = currContent.includes('[Chat:');
            const chatMatch = currContent.match(/\[Chat:\s*(.*?)(?:\||\])/i);
            const currChatId = chatMatch ? chatMatch[1] : null;

            if (lastMsg && lastMsg._isProto && isProto &&
                lastMsg.role === curr.role &&
                lastMsg._chatId && currChatId && 
                lastMsg._chatId === currChatId) {
                
                let body = currContent
                           .replace(/^\[Chat:[^\]]+\]\n?/im, '')
                           .replace(/^\[With:[^\]]+\]\n?/im, '')
                           .replace(/^\[Notice:[^\]]+\]\n?/im, '');
                if (body.trim()) { lastMsg.content = lastMsg.content.trim() + "\n" + body.trim(); }
            } else {
                const newObj = { role: curr.role, content: currContent, _isProto: isProto, _chatId: currChatId, _source: curr._source };
                mergedList.push(newObj);
                lastMsg = newObj;
            }
        });
        return mergedList;
    }

    // --- 3. OS API 主對象 ---
    win.OS_API = {

        isStandalone: function() {
            try {
                const w = window.parent || window;
                return !(w.SillyTavern &&
                         typeof w.SillyTavern.getContext === 'function' &&
                         w.SillyTavern.getContext());
            } catch(e) { return true; }
        },

        getGlobalUserName: function() {
            let uName = "";
            try {
                const w = window.parent || window;
                if (w.OS_PERSONA && typeof w.OS_PERSONA.getName === 'function') {
                    const pName = w.OS_PERSONA.getName();
                    if (pName && pName.trim() !== 'User') uName = pName.trim();
                }
                if (!uName && !this.isStandalone() && w.SillyTavern?.getContext) {
                    const stCtx = w.SillyTavern.getContext();
                    if (stCtx?.user?.name && stCtx.user.name.trim() !== 'User') {
                        uName = stCtx.user.name.trim();
                    }
                }
            } catch(e) {}
            return uName || "User";
        },

        /**
         * 場景插圖分析：把劇情文本送給副模型，讓它在適當位置插入 [Scene|id|prompt] 標籤
         * @param {string} storyText   - 已提取的 <content> 劇情文本
         * @param {function} onFinish  - callback(enhancedText) 回傳插入了 [Scene|] 的增強版文本
         * @param {function} [onError] - callback(err) 錯誤處理
         */
        analyzeSceneInserts: function(storyText, onFinish, onError) {
            const imgCfg   = (win.OS_SETTINGS?.getImageConfig?.()) || {};
            const sceneCfg = imgCfg.sceneGen || {};

            if (!sceneCfg.enabled) { onFinish(storyText); return; }

            const specPrompt = (sceneCfg.specPrompt || '').trim();
            if (!specPrompt) { onFinish(storyText); return; }

            // ── 依「插圖來源」決定 prompt 格式指令：NAI → 標籤、其餘 → 自然語言 ──
            const _globalSvc = ((typeof win.OS_IMAGE_MANAGER?.serviceFor === 'function') ? win.OS_IMAGE_MANAGER.serviceFor('scene') : (win.OS_IMAGE_MANAGER?.config?.service)) || 'pollinations';
            const _useNatural = _globalSvc !== 'novelai';

            const _taskInstruction = _useNatural ? [
                'Analyze the story and output a JSON array of scene-insertion points.',
                'Each object has two fields:',
                '  "after"  — a SHORT phrase (5-20 chars) copied VERBATIM from the story,',
                '             identifying the line AFTER which the scene should appear.',
                '  "prompt" — vivid natural-language English description of the scene (no tag syntax, no commas as separators).',
                '',
                'OUTPUT: raw JSON array only — no markdown fences, no explanation, nothing else.',
                '',
                'EXAMPLE:',
                '[',
                '  {"after": "她推開了門", "prompt": "a girl standing in a doorway bathed in golden sunset light, cinematic mood"},',
                '  {"after": "握住她的手腕", "prompt": "close-up of two hands clasped together, soft dramatic lighting"}',
                ']',
                '',
                'ANCHOR RULES:',
                '• Copy "after" exactly as it appears in the story — do NOT paraphrase.',
                '• Pick a phrase near the END of the target line so it pinpoints that location.',
                '• If no suitable visual moment exists, output: []',
                '',
                'Scene description style rules (apply when writing the "prompt" field):',
                '──────────────────────────────────────────────────────────────────'
            ].join('\n') : [
                'Analyze the story and output a JSON array of scene-insertion points.',
                'Each object has two fields:',
                '  "after"  — a SHORT phrase (5-20 chars) copied VERBATIM from the story,',
                '             identifying the line AFTER which the scene should appear.',
                '  "prompt" — Danbooru image prompt tags for that scene (see format rules below).',
                '',
                'OUTPUT: raw JSON array only — no markdown fences, no explanation, nothing else.',
                '',
                'EXAMPLE:',
                '[',
                '  {"after": "她推開了門", "prompt": "1girl, doorway, sunset, medium_shot"},',
                '  {"after": "握住她的手腕", "prompt": "2girls, hand_holding, close-up"}',
                ']',
                '',
                'ANCHOR RULES:',
                '• Copy "after" exactly as it appears in the story — do NOT paraphrase.',
                '• Pick a phrase near the END of the target line so it pinpoints that location.',
                '• If no suitable visual moment exists, output: []',
                '',
                'Scene prompt format rules (apply when writing the "prompt" field):',
                '──────────────────────────────────────────────────────────────────'
            ].join('\n');

            const sysPrompt = _taskInstruction + '\n' + specPrompt;

            const messages = [
                { role: 'system', content: sysPrompt },
                { role: 'user',   content: storyText }
            ];

            let secConfig = {};
            if (win.OS_SETTINGS?.getSecondaryConfig) secConfig = win.OS_SETTINGS.getSecondaryConfig();
            else if (win.OS_SETTINGS?.getConfig)     secConfig = win.OS_SETTINGS.getConfig();
            secConfig._isSecondary = true;

            this.chat(
                messages,
                secConfig,
                null,
                (aiResponse) => {
                    try {
                        // 提取 JSON 陣列（防止 AI 多包了 markdown code fence）
                        const jsonMatch = (aiResponse || '').match(/\[[\s\S]*\]/);
                        if (!jsonMatch) { onFinish(storyText); return; }

                        const insertions = JSON.parse(jsonMatch[0]);
                        if (!Array.isArray(insertions) || insertions.length === 0) {
                            onFinish(storyText); return;
                        }

                        // 原文按行分割，依序找錨點並插入 <scene> block
                        const lines = storyText.split('\n');
                        let offset = 0; // 每次插入後需偏移行索引

                        for (const ins of insertions) {
                            if (!ins.after || !ins.prompt) continue;

                            // 找包含錨點的行（從前往後，取第一個）
                            let targetIdx = -1;
                            for (let i = 0; i < lines.length; i++) {
                                if (lines[i].includes(ins.after)) { targetIdx = i; break; }
                            }
                            if (targetIdx < 0) {
                                console.warn('[VN SceneGen] 找不到錨點，跳過:', ins.after);
                                continue;
                            }

                            // 在錨點行後插入 <scene>...<\/scene>
                            lines.splice(targetIdx + 1 + offset, 0, '<scene>', ins.prompt, '</scene>');
                            offset += 3;
                        }

                        onFinish(lines.join('\n'));
                    } catch(e) {
                        console.warn('[VN SceneGen] JSON 解析失敗，使用原文:', e);
                        onFinish(storyText);
                    }
                },
                (err) => {
                    console.warn('[VN SceneGen] 副模型分析失敗，跳過插圖:', err);
                    if (onError) onError(err);
                    else onFinish(storyText);
                }
            );
        },

        chatSecondary: async function(messages, onChunk, onFinish, onError, options) {
            let secConfig = {};
            if (win.OS_SETTINGS && typeof win.OS_SETTINGS.getSecondaryConfig === 'function') {
                secConfig = win.OS_SETTINGS.getSecondaryConfig();
            } else if (win.OS_SETTINGS && typeof win.OS_SETTINGS.getConfig === 'function') {
                secConfig = win.OS_SETTINGS.getConfig();
            }
            secConfig._isSecondary = true;
            // 副模型自訂前置指令（破甲）：在入口統一以 system 插最前 → 不分派發路徑（直連/跟隨/🍎）都生效。
            // 插完就把欄位拿掉，免得 🍎 generateRaw 路徑照 config.customCot 再插一次（雙重注入）。
            try {
                const _secCot = secConfig.customCot;
                if (_secCot && String(_secCot).trim()) {
                    messages = [{ role: 'system', content: String(_secCot) }, ...(messages || [])];
                }
                delete secConfig.customCot;
            } catch (e) {}
            this.chat(messages, secConfig, onChunk, onFinish, onError, options || {});
        },

        // 主模型入口（對稱 chatSecondary）：低頻重品質任務用（如世界書二改，大總結重壓、深度整理）。
        // 這類任務輸出都很長 → 預設開串流（見 chat 的 options.stream；非串流等整篇會撞閘道 ~100s 逾時 504）。
        chatMain: async function(messages, onChunk, onFinish, onError, options) {
            let mainConfig = {};
            if (win.OS_SETTINGS && typeof win.OS_SETTINGS.getConfig === 'function') {
                mainConfig = Object.assign({}, win.OS_SETTINGS.getConfig());
            }
            mainConfig._isSecondary = false;   // 明確走主模型連線（防 getConfig 回傳被副模型標過的共用物件）
            this.chat(messages, mainConfig, onChunk, onFinish, onError, Object.assign({ stream: true }, options || {}));
        },

        chat: async function(messages, config, onChunk, onFinish, onError, options = {}) {
            try { win.AURELIA_USAGE && win.AURELIA_USAGE.bumpText(); } catch (e) {}   // 文字 API 計數（副模型/PWA主模型/總結都走這）
            // 呼叫方要「保留三反引號」（創作室生成 JSON 程式碼）→ 跳過 cleanRawOutput 吃圍欄那步，避免 /```/g 被削成 //g。
            const _keepFences = !!options.keepCodeFences;
            const globalUserName = this.getGlobalUserName();
            // 兼容 multimodal：content 可能是字串或 [{type:'text',...},{type:'image_url',...}] 陣列
            messages.forEach(m => {
                if (typeof m.content === 'string') {
                    m.content = m.content.replace(/\{\{\s*user\s*\}\}/gi, globalUserName);
                } else if (Array.isArray(m.content)) {
                    m.content.forEach(part => {
                        if (part && part.type === 'text' && typeof part.text === 'string') {
                            part.text = part.text.replace(/\{\{\s*user\s*\}\}/gi, globalUserName);
                        }
                    });
                }
            });

            // ── 🔥 全局 API 記錄：中央 chat 攔「所有」文字呼叫（不論哪個入口、有沒有貼標都記），
            //    按連線分類（main=主模型 / sec=副模型 / aux=未標記的手搭 config）+ 標註用途 route ──
            {
                const _cat = (config && config._isSecondary === false) ? 'main'
                           : (config && config._isSecondary === true)  ? 'sec'
                           : 'aux';
                const _rec = _apiLogStart(win.AURELIA_API_LOG, messages);
                _rec.cat = _cat;
                _rec.route = (config && config.route) || (options && options.label) || '';
                _rec.inTok = null; _rec.outTok = null;   // token 估算(非阻塞，算完面板下次刷新即顯示)
                _estTok(_msgsText(messages)).then(n => { _rec.inTok = n; }).catch(() => {});
                const _of = onFinish, _oe = onError;
                onFinish = (text) => { try { _secLogEnd(_rec, true, text); _estTok(text).then(n => { _rec.outTok = n; }).catch(() => {}); } catch (e) {} if (_of) _of(text); };
                onError  = (err)  => { try { _secLogEnd(_rec, false, err); } catch (e) {} if (_oe) _oe(err); };
            }

            if (this.isStandalone() && config.useSystemApi) {
                config = { ...config, useSystemApi: false };
                if (!config.url || !config.key) {
                    const err = new Error('獨立模式需填入 API URL 與 Key（設置 → 🧠 主模型）');
                    console.error('[OS_API]', err.message);
                    if (onError) onError(err);
                    return;
                }
                console.log('[OS_API] 獨立模式：自動切換為直連 API →', config.url);
            }

            const useSystemApi = config.useSystemApi === true;
            const stProfileId = config.stProfileId || ""; 
            const enableStreaming = config.enableStreaming || false;
            let maxTokens = parseInt(config.maxTokens);
            if (isNaN(maxTokens) || maxTokens <= 0) maxTokens = 8192;
            const temperature = isFinite(parseFloat(config.temperature)) ? parseFloat(config.temperature) : 1.0;
            const top_p = isFinite(parseFloat(config.top_p)) ? parseFloat(config.top_p) : undefined;
            // ⚠️ penalty 為 0（預設值）時「不送」：gemini 原生 API 沒有 frequency/presence_penalty 這兩個欄位，
            // 連送 0 都會被 Pioneer/反代的 gemini 路由 404（No endpoints found that can handle the requested parameters）。
            // 非 0 才送（給 GPT/Claude 等支援的模型用），這樣 gemini/claude/gpt 同一套程式碼都能跑。
            const _freqPen = parseFloat(config.frequency_penalty);
            const frequency_penalty = (isFinite(_freqPen) && _freqPen !== 0) ? _freqPen : undefined;
            const _presPen = parseFloat(config.presence_penalty);
            const presence_penalty = (isFinite(_presPen) && _presPen !== 0) ? _presPen : undefined;

            if (!useSystemApi && (!config.url || !config.key)) {
                if (onError) onError(new Error('API 配置不完整 (無 URL/Key)')); return;
            }

            let totalTokens = 0;
            let totalChars = 0;
            try {
                // 兼容陣列 content：抽 text 部分計算 token；圖片不計入文字字數但會在送 API 時算 token
                const fullPromptString = messages.map(m => {
                    if (typeof m.content === 'string') return m.content;
                    if (Array.isArray(m.content)) {
                        return m.content.filter(p => p && p.type === 'text').map(p => p.text || '').join('\n');
                    }
                    return '';
                }).join('\n');
                totalChars = fullPromptString.length;
                if (win.SillyTavern && typeof win.SillyTavern.getTokenCountAsync === 'function') {
                    totalTokens = await win.SillyTavern.getTokenCountAsync(fullPromptString);
                } else {
                    totalTokens = Math.ceil(totalChars * 0.5);
                }
            } catch(e) { totalTokens = Math.ceil(totalChars * 0.5) || 0; }

            try {
                const typeLabel = config._isSecondary ? "⚡ 副模型 (Secondary)" : "🧠 主模型 (Primary)";
                console.group(`📊 [OS_API] ${typeLabel} 發送檢查 (Token: ${totalTokens} | Chars: ${totalChars})`);
                let modelDisplay = config.model;
                if (useSystemApi) {
                    if (stProfileId) {
                        const profileInfo = (win.SillyTavern?.getContext?.()?.extensionSettings?.connectionManager?.profiles || [])
                            .find(p => p.id === stProfileId);
                        modelDisplay = profileInfo
                            ? `${profileInfo.model || '?'} [Profile: ${profileInfo.name}]`
                            : `(未知 ProfileId: ${stProfileId})`;
                    } else {
                        try {
                            const stModel = win.SillyTavern?.getContext?.()?.getChatCompletionModel?.();
                            modelDisplay = stModel ? `${stModel} (ST當前激活)` : '(由酒館主系統決定)';
                        } catch(_) { modelDisplay = '(由酒館主系統決定)'; }
                    }
                }
                console.log(`⚙️ 參數: Temp=${temperature}, MaxTokens=${maxTokens}, ProfileId=${stProfileId || '(空-當前激活)'}, Model=${modelDisplay}`);

                const groups = { prompts: [], char: [], lore: [], reality: [], chat: [], persona: [] };

                messages.forEach((msg, index) => {
                    // 兼容陣列 content：preview 抽 text 部分 + 標記圖片數
                    let textContent = '';
                    let imgCount = 0;
                    if (typeof msg.content === 'string') {
                        textContent = msg.content;
                    } else if (Array.isArray(msg.content)) {
                        textContent = msg.content.filter(p => p && p.type === 'text').map(p => p.text || '').join('\n');
                        imgCount = msg.content.filter(p => p && p.type === 'image_url').length;
                    }
                    const content = textContent || "";
                    const imgTag = imgCount > 0 ? ` [📎×${imgCount}]` : '';
                    let preview = content.length > 80 ? content.substring(0, 80).replace(/\n/g, ' ') + "..." : content.replace(/\n/g, ' ');
                    preview += imgTag;

                    const item = { "#": index, "Role": msg.role, "預覽": preview, "Length": content.length };
                    
                    if (msg.role === 'system') {
                        if (content.includes('Reality Context')) { item["類型"] = "🔥 線下劇情"; groups.reality.push(item); } 
                        else if (content.includes('[World Info:') || (content.includes('World Info') && !content.includes('[Character Persona (Private Chat)]'))) {
                            const matches = content.match(/\[World Info: (.*?)\]/g);
                            item["📖 觸發條目"] = matches ? matches.map(s => s.replace(/\[World Info: |\]/g, '')).join(', ') : "(無)";
                            groups.lore.push(item);
                        }
                        else if (content.includes('[User Info (') || content.includes('[User Persona (')) {
                            item["類型"] = "👤 玩家本人"; groups.char.push(item);
                        }
                        else if (content.includes('[Character Persona (Private Chat)]')) { 
                            item["類型"] = "🎭 私聊人設"; 
                            item["來源"] = content.includes('---') ? "混合（自定義+世界書）" : "已設置";
                            groups.persona.push(item); 
                        }
                        else if (content.includes('[Group Note]')) { 
                            item["類型"] = "📝 群聊備註"; 
                            item["來源"] = content.includes('---') ? "混合（自定義+世界書）" : "已設置";
                            groups.persona.push(item); 
                        } 
                        else if (content.includes('Character Info') || content.includes('Scenario')) {
                            item["類型"] = "👤 角色/場景"; groups.char.push(item);
                        }
                        else if (content.includes('Roleplay Instruction') || content.includes('Chain of Thought')) {
                            item["類型"] = "📝 指令/CoT"; groups.prompts.push(item);
                        }
                        else { item["類型"] = "⚙️ 其他"; groups.prompts.push(item); }
                    } else {
                        item["來源"] = msg._source === 'phone' ? "📱 手機" : "💬 輸入";
                        groups.chat.push(item);
                    }
                });

                if(groups.prompts.length) { console.group("📝 核心提示詞"); console.table(groups.prompts); console.groupEnd(); }
                if(groups.char.length) { console.group("👤 角色與用戶"); console.table(groups.char); console.groupEnd(); }
                if(groups.lore.length) { console.group("📖 世界書"); console.table(groups.lore); console.groupEnd(); }
                if(groups.persona.length) { 
                    const privatePersona = groups.persona.filter(p => p["類型"] === "🎭 私聊人設");
                    const groupNote = groups.persona.filter(p => p["類型"] === "📝 群聊備註");
                    if (privatePersona.length) { console.group("🎭 私聊人設"); console.table(privatePersona); console.groupEnd(); }
                    if (groupNote.length) { console.group("📝 群聊備註"); console.table(groupNote); console.groupEnd(); }
                }
                if(groups.reality.length) { console.group("🔥 線下劇情"); console.table(groups.reality); console.groupEnd(); }
                if(groups.chat.length) { console.group("💬 對話歷史"); console.table(groups.chat); console.groupEnd(); }

                console.groupEnd(); 
            } catch (e) { console.warn("Debug View Error", e); }

            if (config.usePresetPrompts) {
                try {
                    const th = win.TavernHelper || win.parent?.TavernHelper;
                    if (th && typeof th.getPreset === 'function') {
                        const targetPreset = config.presetName && config.presetName.trim()
                            ? config.presetName.trim()
                            : 'in_use';
                        const preset = th.getPreset(targetPreset);
                        const prompts = preset?.prompts || [];

                        const PLACEHOLDER_IDS = new Set(['world_info_before','world_info_after','persona_description','char_description','char_personality','scenario','dialogue_examples','chat_history','main','nsfw','jailbreak','enhance_definitions']);
                        const injected = prompts
                            .filter(p => !PLACEHOLDER_IDS.has(p.id))
                            .filter(p => p.enabled !== false)
                            .filter(p => p.content && p.content.trim());

                        if (injected.length > 0) {
                            let combined = injected.map(p => p.content.trim()).join('\n\n');
                            combined = combined.replace(/\{\{\s*user\s*\}\}/gi, globalUserName);
                            messages.unshift({ role: 'system', content: combined });
                            console.log(`📋 [PresetPrompt] 注入 ${injected.length} 個條目 (來源: "${targetPreset}")，共 ${combined.length} 字元`);
                        }
                    } else {
                        console.warn('📋 [PresetPrompt] TavernHelper 不可用，跳過注入');
                    }
                } catch(e) { console.warn('📋 [PresetPrompt] 注入失敗：', e); }
            }

            let cleanMessages = messages
                .map(m => { const { _source, _isProto, _chatId, ...rest } = m; return rest; })
                .filter(m => {
                    // 字串非空 或 陣列非空（含 text/image 任一）
                    if (typeof m.content === 'string') return m.content.trim().length > 0;
                    if (Array.isArray(m.content)) return m.content.length > 0;
                    return false;
                });

            try {
                let stringifiedPayload = JSON.stringify(cleanMessages);
                stringifiedPayload = stringifiedPayload.replace(/\{\{\s*user\s*\}\}/gi, globalUserName);
                cleanMessages = JSON.parse(stringifiedPayload);
            } catch(e) { console.warn("核彈替換失效", e); }

            let _dbgId    = Date.now() + Math.random();
            let _dbgStart = Date.now();

            try {
                let fullText = "";
                let rawApiResponse = null; 
                const extraParams = {};
                if (top_p !== undefined) extraParams.top_p = top_p;
                if (frequency_penalty !== undefined) extraParams.frequency_penalty = frequency_penalty;
                if (presence_penalty !== undefined) extraParams.presence_penalty = presence_penalty;

                const commonBody = {
                    model: config.model, messages: cleanMessages,
                    stream: false, max_tokens: maxTokens, temperature: temperature,
                    ...extraParams
                };

                _dbgStart = Date.now();
                try {
                    const _dbgUrl = !useSystemApi ? (config.url || '') : '/api/st-backend';
                    window._OS_DBG_REQUEST?.(_dbgId, commonBody, _dbgUrl, config.model);
                } catch(e) { }

                if (config.enableThinking) {
                    commonBody.include_reasoning = true;
                    const effort = config.reasoningEffort || 'auto';
                    if (effort !== 'auto') commonBody.reasoning_effort = effort;
                    console.log(`💭 [OS_API] 思考鏈已啟用 (effort: ${effort})`);
                } else {
                    commonBody.include_reasoning = false;
                    // ⚠️ 不送 reasoning_effort: 'none'：'none' 是非標準值，gemini(Pioneer/反代)路由會 404；
                    // include_reasoning:false 已足以關閉推理輸出，GPT/Claude 也不受影響。
                }

                if (config.useGenerateRaw) {
                    // 🍎 generateRaw 模式（iOS 相容）：走酒館原生生成管線。
                    // ordered_prompts 只送這些訊息 → 排除 preset/角色卡/世界書/歷史（文件：未列入的不會使用）。
                    // 好處：①不直連外部 → 避開 iOS WebView 的 CORS/Load failed；
                    //       ②由酒館前端管線送出 → 套用「排除請求主體參數」(penalty 被剝) → gemini 不 404。
                    // 🍎 iOS 相容（原生、零插件依賴）：不讓 WebView 直連 Pioneer（會被 iOS CORS/Load failed 擋），
                    // 改 POST 到酒館「同源」後端 /api/backends/chat-completions/generate → 後端用原生 HTTP 代打外部 API
                    // （原生無 CORS）。body 只送精簡乾淨欄位（無 penalty / include_reasoning / reasoning_effort）→ gemini 不 404。
                    // 自訂前置指令（破甲 COT）：每個連接預設各記各的(customCotMap[profileId])、舊版單格 customCot 當退路；有設就以 system 角色插在最前面，只影響 🍎 路徑（native /generate 與 generateRaw 退路皆吃到）
                    const _cotMap = config.customCotMap || {};
                    const _cotKey = (config.stProfileId && String(config.stProfileId).trim()) ? String(config.stProfileId) : '__none__';
                    const _cot = (_cotKey in _cotMap) ? (_cotMap[_cotKey] || '') : (config.customCot || '');
                    if (_cot && String(_cot).trim()) {
                        cleanMessages = [{ role: 'system', content: String(_cot) }, ...cleanMessages];
                    }
                    let _ngOk = false;
                    try {
                        const _ctx = win.SillyTavern && win.SillyTavern.getContext ? win.SillyTavern.getContext() : null;
                        const _src = _ctx && (_ctx.oai_settings && _ctx.oai_settings.chat_completion_source);
                        if (_ctx && config.stProfileId && _ctx.ConnectionManagerRequestService) {
                            // 🍎＋選了 profile：交給酒館 ConnectionManager 用「該 profile 的完整連線」
                            // （來源 api / secret / exclude / region 全照 profile）→ 真的打到 profile 的來源。
                            // 串流＝呼叫端決定（options.stream）：預設關（隔離酒館串流開關，免撞「便宜端點
                            // (如 Pioneer gemini)不支援串流」的 404）；長輸出任務（重壓/深度整理走 chatMain）
                            // 開 true——非串流要等整篇生完才回首位元組，Opus 長輸出會撞閘道 ~100s 逾時 504。
                            // overridePayload 在 ST 合併序最後，蓋過 oai_settings.stream_openai。
                            const _streamOn = options.stream === true;
                            let _ov = _vertexOverride(_ctx, config.stProfileId, { temperature, stream: _streamOn, ...extraParams });
                            _ov = _ensureModelOverride(_ctx, config.stProfileId, _ov, config.model);
                            const _response = await _ctx.ConnectionManagerRequestService.sendRequest(
                                config.stProfileId, cleanMessages, maxTokens, { signal: options.signal, stream: _streamOn }, _ov   // 帶 abort signal→停止鈕(創作室等)才停得了；undefined 時 signal=undefined 不影響
                            );
                            if (_streamOn && typeof _response === 'function') {
                                // 串流：generator 每次 yield {text: 累積全文} → 收到最後一筆＝完整輸出
                                let _acc = '';
                                for await (const _chunk of _response()) {
                                    if (_chunk && typeof _chunk.text === 'string') { _acc = _chunk.text; if (onChunk) { try { onChunk(_acc); } catch (e) {} } }
                                }
                                const _t2 = normalizeResponse({ content: _acc }, _keepFences);   // 同非串流路：keepFences 交給它自己判斷
                                if (_t2) { rawApiResponse = { content: _acc }; fullText = _t2; _ngOk = true; }
                                else { console.warn('[OS_API] 🍎 profile 串流無內容回傳'); }
                            } else {
                                const _t = normalizeResponse(_response, _keepFences);
                                if (_t) { rawApiResponse = _response; fullText = _t; _ngOk = true; }
                                else { console.warn('[OS_API] 🍎 profile 路徑無內容回傳', _response); }
                            }
                        } else if (_ctx && _src) {
                            // 🍎＋沒選 profile（或 ConnectionManager 不可用）：精簡乾淨 body 打「ST 當前激活來源」
                            // （避開 gemini penalty 404 / iOS CORS）。跟隨酒館＝型號以酒館當前為準（同跟隨路徑），
                            // 不卡奧瑞亞凍結的 config.model（型號名對不上會 404 No endpoints found）。
                            // 優先序：profile 自帶型號 > 酒館當前型號 > config.model 保底。
                            let _model = '';
                            if (config.stProfileId) {
                                try {
                                    const _profs = (_ctx.extensionSettings && _ctx.extensionSettings.connectionManager && _ctx.extensionSettings.connectionManager.profiles) || [];
                                    const _p = _profs.find(p => p && p.id === config.stProfileId);
                                    if (_p && _p.model) _model = _p.model;
                                } catch (e) {}
                            }
                            if (!_model && typeof _ctx.getChatCompletionModel === 'function') _model = _ctx.getChatCompletionModel();
                            if (!_model) _model = config.model;
                            const _body = {
                                chat_completion_source: _src,
                                model: _model,
                                messages: cleanMessages,
                                temperature: temperature,
                                max_tokens: maxTokens,
                                stream: false
                            };
                            if (top_p !== undefined) _body.top_p = top_p;
                            // 還原 CoT：思考開啟時帶 include_reasoning（讓模型推理情感/規範條目）；不送 'none'，避免 gemini 404
                            if (config.enableThinking) {
                                _body.include_reasoning = true;
                                const _eff = config.reasoningEffort || 'auto';
                                if (_eff !== 'auto') _body.reasoning_effort = _eff;
                            }
                            // vertex 服務帳號：這條「🍎+沒選 profile」走直連 body、不經 ConnectionManager → 也要自己補 vertexai_auth_mode，
                            // 否則後端預設 'express' → 服務帳號(full)被當 API Key 找不到金鑰（Secret id not found for api_key_vertexai）。
                            // 同 _vertexOverride 的修；那邊修的是 sendRequest(選 profile) 兩條，這條無 profile 的直連當時漏補（創作室主模型開🍎+vertex 踩到）。
                            if (/vertex/i.test(_src || '')) {
                                const _oai = (_ctx && _ctx.oai_settings) || win.oai_settings || (win.parent && win.parent.oai_settings) || {};
                                _body.vertexai_auth_mode = _oai.vertexai_auth_mode || 'full';   // 讀不到全域 → 保底服務帳號(full)；express 用戶全域是 'express' 會讀到、不誤觸
                                if (_oai.vertexai_express_project_id) _body.vertexai_express_project_id = _oai.vertexai_express_project_id;
                            }
                            const _resp = await fetch('/api/backends/chat-completions/generate', {
                                method: 'POST',
                                headers: { ..._ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
                                body: JSON.stringify(_body),
                                signal: options.signal || undefined
                            });
                            const _data = await _resp.json();
                            const _t = normalizeResponse(_data, _keepFences);
                            if (_resp.ok && _t) { rawApiResponse = _data; fullText = _t; _ngOk = true; }
                            else { console.warn('[OS_API] 原生 /generate 未成功，HTTP', _resp.status, _data && _data.error); }
                        }
                    } catch (e) {
                        // 選了 profile 卻失敗：別退 generateRaw（它用「當前激活連線」答、會拿錯模型掩蓋真錯誤）→ 把真錯誤拋出去顯示
                        if (config.stProfileId) throw e;
                        console.warn('[OS_API] 原生 /generate 例外，退回 generateRaw', e);
                    }
                    // 保險：原生那條若失敗，退回 window.generateRaw（僅「沒選 profile」時；選了 profile 不偷換連線）
                    if (!_ngOk && !config.stProfileId) {
                        const _genRaw = win.generateRaw || (win.parent && win.parent.generateRaw)
                            || (win.TavernHelper && win.TavernHelper.generateRaw)
                            || (win.parent && win.parent.TavernHelper && win.parent.TavernHelper.generateRaw);
                        if (typeof _genRaw !== 'function') throw new Error('generateRaw 不可用');
                        const _ordered = cleanMessages.map(m => ({
                            role: m.role || 'user',
                            content: typeof m.content === 'string' ? m.content
                                : (Array.isArray(m.content) ? m.content.filter(p => p && p.type === 'text').map(p => p.text || '').join('\n') : String(m.content || ''))
                        }));
                        const _raw = await _genRaw({ user_input: ' ', ordered_prompts: _ordered, should_silence: true, max_chat_history: 0, generation_id: 'os_api_' + _dbgId });
                        rawApiResponse = { via: 'generateRaw' };
                        fullText = (typeof cleanRawOutput === 'function') ? cleanRawOutput(String(_raw || ''), _keepFences) : String(_raw || '');
                    }
                } else if (useSystemApi) {
                    const context = win.SillyTavern && win.SillyTavern.getContext ? win.SillyTavern.getContext() : null;
                    if (!context) throw new Error("無 Context");
                    
                    if (stProfileId) {
                        // 砍掉舊的 UI profile switching dance（之前會把 #connection_profiles select 切過去再切回來）
                        // 原因：並發呼叫會互相 abort 對方的 in-flight fetch，console 噴 "Canceled because main api changed"
                        // ST 的 sendRequest(profileId, ...) 本身就會用對應 profile 的 url/key/model，不需要 UI 同步切
                        // stream:false 隔離酒館串流開關：奧瑞亞不需要串流、一律強制關（overridePayload 蓋過 oai_settings.stream_openai）
                        // → 酒館串流開著也不影響奧瑞亞，免撞「便宜端點(如 Pioneer gemini)不支援串流」的 404。
                        let _ov = _vertexOverride(context, stProfileId, { temperature, stream: false, ...extraParams });
                        _ov = _ensureModelOverride(context, stProfileId, _ov, config.model);
                        const response = await context.ConnectionManagerRequestService.sendRequest(
                            stProfileId, cleanMessages, maxTokens, { signal: options.signal }, _ov   // 帶 abort signal→停止鈕才停得了
                        );
                        rawApiResponse = response;
                        fullText = normalizeResponse(response, _keepFences);
                    } else {
                        const headers = context.getRequestHeaders();
                        const activeSource = context.oai_settings?.chat_completion_source
                            || win.oai_settings?.chat_completion_source;
                        if (!activeSource) throw new Error("無法讀取酒館當前 API 來源，請先在酒館選好連接");
                        const activeModel = (typeof context.getChatCompletionModel === 'function')
                            ? context.getChatCompletionModel()
                            : undefined;
                        // 跟隨酒館（無 profile）：模型一律以酒館當前選擇為準。UI 寫「模型由酒館決定」、
                        // 奧瑞亞型號欄在跟隨模式下是隱藏凍結的，不能拿來覆蓋——第三方端點型號名各異
                        // （gemini-3.1-pro-preview vs gemini-3.1-pro），凍結舊值會跟酒館實選的對不上 → 供應商 404
                        // No endpoints found。要主/副跑不同型號請改用 profile 或關閉跟隨。
                        // 酒館真的讀不到型號時才退回 config.model 保底。commonBody 已是乾淨 body（penalty 不送）。
                        const requestBody = { ...commonBody, chat_completion_source: activeSource };
                        if (activeModel) requestBody.model = activeModel;
                        const response = await fetch('/api/backends/chat-completions/generate', {
                            method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                            body: JSON.stringify(requestBody),
                            signal: options.signal || undefined
                        });
                        const data = await response.json();
                        rawApiResponse = data; 
                        fullText = normalizeResponse(data, _keepFences);
                    }
                } else {
                    let targetUrl = config.url.replace(/\/$/, '');
                    if (!targetUrl.includes('/chat/completions')) targetUrl += (targetUrl.endsWith('/v1') ? '' : '/v1') + '/chat/completions';

                    // ── 真實 SSE 串流路徑 ──────────────────────────────────────
                    // 只有呼叫方明確傳入 options.useRealStream:true 才啟用
                    // 其他所有面板繼續走非串流路線，完全不受影響
                    if (options.useRealStream) {
                        const streamBody = { ...commonBody, stream: true };
                        const streamResp = await fetch(targetUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` },
                            body: JSON.stringify(streamBody),
                            signal: options.signal || undefined
                        });
                        if (!streamResp.ok) throw new Error(`SSE 請求失敗 HTTP ${streamResp.status}`);
                        if (!streamResp.body) throw new Error('此瀏覽器不支援 ReadableStream，請改用 Chrome/Safari');

                        const reader = streamResp.body.getReader();
                        const decoder = new TextDecoder();
                        let buf = '', acc = '';

                        outer: while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buf += decoder.decode(value, { stream: true });
                            const lines = buf.split('\n');
                            buf = lines.pop() ?? '';   // 保留不完整的末尾行
                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (!trimmed.startsWith('data: ')) continue;
                                const payload = trimmed.slice(6);
                                if (payload === '[DONE]') break outer;
                                try {
                                    const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content || '';
                                    if (delta) { acc += delta; if (onChunk) onChunk(acc); }
                                } catch(e) { /* 忽略格式有誤的行 */ }
                            }
                        }

                        fullText = cleanRawOutput(acc, _keepFences);
                        win.OS_API._lastCtx = {
                            sendTokens: totalTokens, sendChars: totalChars,
                            recvChars: acc.length, recvTokens: Math.ceil(acc.length * 0.5),
                            msgCount: cleanMessages.length, updatedAt: Date.now()
                        };
                        if (onFinish) onFinish(fullText);
                        return;   // ← 提前返回，跳過下方的非串流邏輯
                    }
                    // ── 一般非串流路徑（原邏輯，其他面板走這裡）─────────────

                    const response = await fetch(targetUrl, {
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` },
                        body: JSON.stringify(commonBody),
                        signal: options.signal || undefined
                    });
                    const data = await response.json();
                    rawApiResponse = data;
                    fullText = normalizeResponse(data, _keepFences);
                }

                if (!fullText) throw new Error("API 返回內容為空 (可能被過濾或生成失敗)");

                try { window._OS_DBG_RESPONSE?.(_dbgId, 200, rawApiResponse || fullText, Date.now() - _dbgStart); } catch(e) {}

                const recvChars = fullText.length;
                const recvTokens = Math.ceil(recvChars * 0.5);
                win.OS_API._lastCtx = {
                    sendTokens: typeof totalTokens === 'number' ? totalTokens : 0,
                    sendChars:  totalChars,
                    recvTokens: recvTokens,
                    recvChars:  recvChars,
                    msgCount:   cleanMessages.length,
                    updatedAt:  Date.now()
                };

                console.log("🧹 [OS_API] 最終清洗文本:", fullText.substring(0, 100).replace(/\n/g, ' ') + "...");

                if (onFinish) onFinish(fullText);
            } catch (err) {
                console.error("[OS_API Error]", err);
                try { window._OS_DBG_RESPONSE?.(_dbgId, 'error', err.message, Date.now() - _dbgStart); } catch(e) {}
                if (onError) onError(err);
            }
        },

        buildContext: async function(userMessage, promptKey = 'wx_chat_system') {
            console.log(`[OS_API.buildContext] 目標路由: ${promptKey} | 模式: ${this.isStandalone() ? '獨立' : 'ST'}`);

            if (this.isStandalone()) {
                return this._buildStandaloneContext(userMessage, promptKey);
            }

            let ctx = { char: {}, user: {}, lore: "", history: [] };
            if (win.OS_TAVERN_BRIDGE && typeof win.OS_TAVERN_BRIDGE.getApiContext === 'function') {
                try { ctx = await win.OS_TAVERN_BRIDGE.getApiContext(); } catch (e) { console.error(e); }
            }

            let userName = this.getGlobalUserName(); 
            let userDesc = "";

            const userModule = win.OS_USER || win.WX_USER;
            if (userModule && typeof userModule.getInfo === 'function') {
                const uInfo = userModule.getInfo();
                if (uInfo.desc) userDesc = uInfo.desc;
            }
            let charName = ctx.char.name || "AI";
            // {{char}} 用「實際在聊的那個聯絡人」名字（群像卡尤其重要：一張卡很多角色，聯絡人靠世界書條目設人設）
            try {
                const _activeId = win.wxApp && win.wxApp.GLOBAL_ACTIVE_ID;
                if (_activeId && win.WX_DB && typeof win.WX_DB.getApiChat === 'function') {
                    const _ac = await win.WX_DB.getApiChat(_activeId);
                    if (_ac && !_ac.isGroup && _ac.name) charName = _ac.name;
                }
            } catch (e) {}

            let sysPrompt = "";
            let cotPrompt = "";

            const NO_COT_ROUTES = ['iris_chat', 'cheshire_chat'];   // 📞 通話「保留」CoT：AI 靠它讀世界書情感/規範條目想怎麼回；思考關進 <thinking> 由字幕端剝掉

            if (win.OS_PROMPTS) {
                if (promptKey) sysPrompt = win.OS_PROMPTS.get(promptKey);
                if (!NO_COT_ROUTES.includes(promptKey)) cotPrompt = win.OS_PROMPTS.get('universal_cot');
            }

            // 🔑 解析巨集：模板裡的 {{char}}/{{user}} 走直連 API「不會」被酒館替換 → 自己換成真名。
            //    否則 AI 拿到字面「{{user}}」只能亂猜，加上劇情歷史滿是 MC（${userName}）→ 把使用者當成別的角色。
            const _resolveMacros = (s) => String(s == null ? '' : s).split('{{char}}').join(charName).split('{{user}}').join(userName);
            sysPrompt = _resolveMacros(sysPrompt);
            cotPrompt = _resolveMacros(cotPrompt);

            if (!sysPrompt && promptKey === 'wx_chat_system') {
                sysPrompt = `You are ${charName}. Chat with ${userName}.`;
            }

            const apiMessages = [];

            if (cotPrompt) apiMessages.push({ role: "system", content: `### \n${cotPrompt}` });
            if (sysPrompt) apiMessages.push({ role: "system", content: `### Instruction\n${sysPrompt}` });

            let contextBlock = "";
            // 🚫 大廳(iris/cheshire)完全自足：不吃「當前正在玩的卡」的 persona/角色卡/世界書，避免跨卡污染
            //    （否則你在玩東京現代卡時，古風大廳 NPC 會吃到「MC 住東京」）。訪客身分/人設/世界觀由 buildNpcPrompt·buildSysPrompt 自己給。
            const NO_CARD_ROUTES = ['iris_chat', 'cheshire_chat'];
            if (!NO_CARD_ROUTES.includes(promptKey)) {
                if (userDesc || userName !== "User") contextBlock += `[User Persona — ${userName}]:\n${userDesc || '(玩家本人)'}\n⚠️ ${userName} 就是正在跟你聊天的真實使用者本人；你回覆與稱呼的對象永遠是 ${userName}，絕對不要把他當成劇情裡的其他角色或 NPC。\n\n`;
                if (ctx.char.description) contextBlock += `[Character Description]:\n${ctx.char.description}\n\n`;
                if (ctx.char.personality) contextBlock += `[Personality]:\n${ctx.char.personality}\n\n`;
                if (ctx.char.scenario) contextBlock += `[Scenario]:\n${ctx.char.scenario}\n\n`;
                if (ctx.lore) contextBlock += `[World Info]:\n${ctx.lore}\n\n`;
            }
            
            if (contextBlock) {
                apiMessages.push({ role: "system", content: contextBlock });
            }

            // 劇情長期記憶：APP 走 OS_API.chat、不發 GENERATION_STARTED → 吃不到 os_summary_inject 的自動注入；
            //   總結後舊樓又被自動隱藏(橋接 getApiContext 濾掉隱藏)→ 對被總結的舊劇情整段失憶。
            //   這裡補上酒館大總結壓縮版(getCurrentInjectionPayload，與正文同一份輕量版)，讓 APP 也共享長期記憶。
            //   ⚠️ 只給「劇情類 APP」路由：工具型呼叫(煉丹 general_assistant、UI 生成…)不該背劇情總結。關閉：localStorage sp_app_inject_summary='0'。
            const _SUMMARY_ROUTES = new Set(['wx_chat_system', 'call_voice_system', 'wb_world_gen', 'wb_world_continue']);   // 大廳(iris/cheshire)移除：NPC 靠自己的一對一記憶，不吃當前卡大總結(跨卡污染)
            try {
                if (_SUMMARY_ROUTES.has(promptKey) && localStorage.getItem('sp_app_inject_summary') !== '0' && win.OS_STORY_TOOLS?.getCurrentInjectionPayload) {
                    const _sum = await win.OS_STORY_TOOLS.getCurrentInjectionPayload();
                    if (_sum && _sum.trim()) {
                        apiMessages.push({ role: "system", content: `[劇情總結 — 至今為止的劇情長期記憶，延續勿矛盾]\n${_sum}` });
                        console.log(`[OS_API.buildContext] 注入大總結壓縮版 ${_sum.length} 字 (route: ${promptKey})`);
                    }
                }
            } catch (e) { console.warn('[OS_API.buildContext] 大總結注入失敗:', e); }

            if ((promptKey === 'wx_chat_system' || promptKey === 'call_voice_system') && win.WX_DB && typeof win.WX_DB.getApiChat === 'function') {
                try {
                    const currentChatId = win.wxApp && win.wxApp.GLOBAL_ACTIVE_ID;
                    if (currentChatId) {
                        const apiChat = await win.WX_DB.getApiChat(currentChatId);
                        if (apiChat && !apiChat.isGroup) {
                            let personaText = '';
                            if (apiChat.personaFromLorebook && win.TavernHelper) {
                                try {
                                    const currentLorebook = win.TavernHelper.getCurrentCharPrimaryLorebook();
                                    if (currentLorebook) {
                                        const entries = await win.TavernHelper.getLorebookEntries(currentLorebook);
                                        const selectedEntry = entries.find(e => e.uid === apiChat.personaFromLorebook);
                                        if (selectedEntry && selectedEntry.content) personaText = selectedEntry.content;
                                    }
                                } catch (e) {}
                            }
                            if (!personaText && apiChat.personaCustom) personaText = apiChat.personaCustom;
                            if (apiChat.personaCustom && apiChat.personaFromLorebook) personaText = `${apiChat.personaCustom}\n\n---\n\n${personaText}`;
                            
                            if (personaText) apiMessages.push({ role: "system", content: `[Character Persona (Private Chat)]:\n${personaText}\n\n` });
                        } else if (apiChat && apiChat.isGroup) {
                            let groupNoteText = '';
                            if (apiChat.groupNoteFromLorebook && win.TavernHelper) {
                                try {
                                    const currentLorebook = win.TavernHelper.getCurrentCharPrimaryLorebook();
                                    if (currentLorebook) {
                                        const entries = await win.TavernHelper.getLorebookEntries(currentLorebook);
                                        const selectedEntry = entries.find(e => e.uid === apiChat.groupNoteFromLorebook);
                                        if (selectedEntry && selectedEntry.content) groupNoteText = selectedEntry.content;
                                    }
                                } catch (e) {}
                            }
                            if (!groupNoteText && apiChat.groupNoteCustom) groupNoteText = apiChat.groupNoteCustom;
                            if (apiChat.groupNoteCustom && apiChat.groupNoteFromLorebook) groupNoteText = `${apiChat.groupNoteCustom}\n\n---\n\n${groupNoteText}`;
                            
                            if (groupNoteText) apiMessages.push({ role: "system", content: `[Group Note]:\n${groupNoteText}\n\n` });
                        }
                        if (promptKey === 'wx_chat_system' && apiChat && apiChat.stickerLibId) {
                            try {
                                const _stkLibs = JSON.parse(localStorage.getItem('os_sticker_libs') || '[]');
                                const _stkLib = _stkLibs.find(l => l.id === apiChat.stickerLibId);
                                if (_stkLib && _stkLib.stickers && _stkLib.stickers.length > 0) {
                                    const names = _stkLib.stickers
                                        .map(s => s.name.replace(/\.(gif|png|jpg|jpeg|webp)$/i, ''))
                                        .join('\n');
                                    apiMessages.push({ role: "system", content: `[Available 表情包]\nYou can ONLY use sticker names from this list. Use format: [表情包:名字]\n嚴禁自創，only choose from below:\n\n${names}` });
                                }
                            } catch(_e) { console.warn('[buildContext] sticker lib error:', _e); }
                        }
                    }
                } catch (e) { console.warn('讀取聊天設置失敗:', e); }
            }

            const NO_HISTORY_ROUTES = ['iris_chat', 'cheshire_chat', 'general_assistant'];   // general_assistant=煉丹/規則/卡片匯入/qb 等工具型生成→不需劇情歷史(角色卡+世界書仍保留給主題化)
            // 大廳可選：打開「大廳 NPC 看你當前劇情」→ 讓 iris/cheshire 破例吃當前卡劇情歷史(跨書吐槽的趣味;預設關)
            const _lobbySeeStory = (promptKey === 'iris_chat' || promptKey === 'cheshire_chat') && localStorage.getItem('lobby_npc_see_current_story') === '1';
            if ((!NO_HISTORY_ROUTES.includes(promptKey) || _lobbySeeStory) && ctx.history && ctx.history.length > 0) {
                let realityText = "### Reality Context (Story History)\nThis is the background story. Use this ONLY for context. DO NOT reply to the story directly. Stick to the APP FORMAT.\n\n";
                ctx.history.forEach(m => {
                    const isUser = m.is_user || m.isMe;
                    const speaker = isUser ? userName : charName;
                    const text = stripVnTags(m.message || m.mes || m.content || "");
                    if (text) realityText += `[${speaker}]: ${text}\n`;
                });
                apiMessages.push({ role: "system", content: realityText });
            }

            if ((promptKey === 'wx_chat_system' || promptKey === 'call_voice_system') && win.WX_DB && typeof win.WX_DB.getApiChat === 'function') {
                 try {
                    const currentChatId = win.wxApp && win.wxApp.GLOBAL_ACTIVE_ID;
                    if (currentChatId) {
                        const apiChat = await win.WX_DB.getApiChat(currentChatId);
                        if (apiChat && apiChat.messages) {
                            const rawPhoneMsgs = apiChat.messages.map(msg => ({
                                role: msg.isMe ? 'user' : 'assistant',
                                // 📞 通話餵乾淨口語(content)，不帶 [Chat:|With:][名] 標頭的 raw → 免 AI 學歷史去用聊天格式
                                content: (promptKey === 'call_voice_system') ? (msg.content || "") : (msg.raw || msg.content || ""),
                                _source: 'phone'
                            }));
                            const mergedPhoneMsgs = smartMergeMessages(rawPhoneMsgs);
                            mergedPhoneMsgs.forEach(msg => {
                                let content = sanitizeContent(msg.content); 
                                if (content) apiMessages.push({ role: msg.role, content: content });
                            });
                        }
                        
                        if (apiChat && !apiChat.isGroup && apiChat.linkedGroupChats && Array.isArray(apiChat.linkedGroupChats) && apiChat.linkedGroupChats.length > 0) {
                            let groupMemoryText = "### Group Chat Memory (Associated Context)\nThe following are messages from associated group chats. Use this for context only.\n\n";
                            let hasGroupMessages = false;
                            const maxMessagesPerGroup = (apiChat.groupMemoryMessageLimit && apiChat.groupMemoryMessageLimit >= 1) ? Math.min(apiChat.groupMemoryMessageLimit, 500) : 50;
                            const maxTotalLength = 10000;
                            let totalLength = 0;
                            
                            for (const groupChatId of apiChat.linkedGroupChats) {
                                if (totalLength >= maxTotalLength) break;
                                try {
                                    const groupChat = await win.WX_DB.getApiChat(groupChatId);
                                    if (groupChat && groupChat.messages && groupChat.messages.length > 0) {
                                        const groupName = groupChat.name || groupChatId;
                                        groupMemoryText += `[Group: ${groupName}]\n`;
                                        const recentMessages = groupChat.messages.slice(-maxMessagesPerGroup);
                                        for (const msg of recentMessages) {
                                            if (totalLength >= maxTotalLength) break;
                                            const isUser = msg.isMe || msg.is_user;
                                            const speaker = isUser ? userName : (msg.senderName || msg.sender || "Unknown");
                                            let text = msg.content || "";
                                            if (!text && msg.raw) {
                                                text = msg.raw.replace(/^\[Chat:[^\]]+\]\n?/im, '').replace(/^\[With:[^\]]+\]\n?/im, '').replace(/^\[Time:[^\]]+\]\n?/im, '').replace(/^\[System:[^\]]+\]\n?/im, '').replace(/^\[Notice:[^\]]+\]\n?/im, '').replace(/^\[(.*?)\]\s*/m, '').trim();
                                            }
                                            text = text.replace(/<[^>]+>/g, "").trim();
                                            if (text && text.length > 0) {
                                                const messageLine = `[${speaker}]: ${text}\n`;
                                                if (totalLength + messageLine.length <= maxTotalLength) {
                                                    groupMemoryText += messageLine;
                                                    totalLength += messageLine.length;
                                                    hasGroupMessages = true;
                                                } else break;
                                            }
                                        }
                                        groupMemoryText += "\n";
                                    }
                                } catch (e) { console.warn(`Failed to load group chat ${groupChatId}:`, e); }
                            }
                            if (hasGroupMessages) apiMessages.push({ role: "system", content: groupMemoryText });
                        }
                    }
                } catch (e) { console.error("Chat history load error", e); }
            }

            try {
                const avsState = _avsRead();
                if (Object.keys(avsState).length > 0) {
                    apiMessages.push({ role: "system", content: `[SYSTEM: Current Dynamic Variables (AVS)]\n${JSON.stringify(avsState)}` });
                }
            } catch(e) {}

            if (userMessage) {
                let finalUserMsg = userMessage;
                if (promptKey.includes('wb_')) {
                    finalUserMsg += `\n\n[SYSTEM FORCE COMMAND]\nOutput the defined TAGS ONLY. No conversational filler. No "Here is the post". No markdown code blocks.\nStart immediately with [wb_post] or [wb_reply].`;
                } else if (promptKey === 'wx_chat_system') {
                     let chatHeader = "";
                    const wxApp = win.wxApp;
                    if (wxApp && wxApp.GLOBAL_ACTIVE_ID) {
                        const activeId = wxApp.GLOBAL_ACTIVE_ID;
                        const currentChat = wxApp.GLOBAL_CHATS?.[activeId];
                        if (currentChat) {
                            const cName = currentChat.name || "Unknown";
                            const members = currentChat.members?.join(', ') || userName;
                            chatHeader = `[Chat: ${cName}|${activeId}]\n[With: ${members}]\n`;
                        }
                    }
                    finalUserMsg = chatHeader ? `${chatHeader}[${userName}] ${userMessage}` : userMessage;
                }
                apiMessages.push({ role: "user", content: finalUserMsg });
            }

            return apiMessages;
        },

        // --- 5. 獨立模式 Context Builder (精準掃描引擎) ---
        _buildStandaloneContext: async function(userMessage, promptKey) {
            const NO_COT_ROUTES = ['iris_chat', 'cheshire_chat'];   // 📞 通話「保留」CoT：AI 靠它讀世界書情感/規範條目想怎麼回；思考關進 <thinking> 由字幕端剝掉

            const apiMessages = [];

            let userName = this.getGlobalUserName();
            let userDesc = '';
            try {
                const persona = win.OS_PERSONA?.getCurrent?.() || {};
                if (persona.description || persona.desc) userDesc = persona.description || persona.desc;
            } catch(e) {}

            let sysPrompt = '', cotPrompt = '';
            if (win.OS_PROMPTS) {
                sysPrompt  = win.OS_PROMPTS.get(promptKey) || '';
                if (!NO_COT_ROUTES.includes(promptKey)) cotPrompt = win.OS_PROMPTS.get('universal_cot') || '';
            }

            let charPersona = '';
            if (promptKey === 'wx_chat_system' && win.wxApp?.GLOBAL_ACTIVE_ID) {
                try {
                    const chatObj = win.wxApp.GLOBAL_CHATS?.[win.wxApp.GLOBAL_ACTIVE_ID];
                    if (chatObj?.personaCustom) charPersona = chatObj.personaCustom;
                    if (!charPersona && chatObj?.persona) charPersona = chatObj.persona;
                } catch(e) {}
            }

            let scanText = userMessage || '';

            if (promptKey === 'wx_chat_system' && win.wxApp?.GLOBAL_ACTIVE_ID && win.WX_DB?.getApiChat) {
                try {
                    const chat = await win.WX_DB.getApiChat(win.wxApp.GLOBAL_ACTIVE_ID);
                    if (chat?.messages?.length) {
                        scanText += " " + chat.messages.slice(-5).map(m => {
                            let text = m.raw || m.content || "";
                            // 🔥 V3.24: 一併剔除 vars_analyze 以避免影響掃描
                            text = text.replace(/<(think(?:ing)?|vars_analyze)>[\s\S]*?<\/\1>/gi, '');
                            const match = text.match(/<content>([\s\S]*?)<\/content>/i);
                            if (match) text = match[1];
                            return text;
                        }).join(" ");
                    }
                } catch(e) {}
            } else if (promptKey === 'vn_story' && win.OS_DB?.getAllVnChapters) {
                try {
                    const chapters = await win.OS_DB.getAllVnChapters();
                    const currentStoryId = localStorage.getItem('vn_current_story_id') || '';
                    const storyChapters = currentStoryId ? chapters.filter(ch => ch.storyId === currentStoryId) : chapters.filter(ch => !ch.storyId);
                    
                    scanText += " " + storyChapters.slice(-3).map(ch => {
                        let req = ch.request || "";
                        let text = ch.content || "";
                        // 🔥 V3.24: 一併剔除 vars_analyze 以避免影響掃描
                        text = text.replace(/<(think(?:ing)?|vars_analyze)>[\s\S]*?<\/\1>/gi, '');
                        const match = text.match(/<content>([\s\S]*?)<\/content>/i);
                        if (match) text = match[1];
                        return req + " " + text;
                    }).join(" ");
                    
                    const doc = win.document;
                    if (doc) {
                        const genTitle = doc.getElementById('vn-gen-title')?.value || '';
                        const genReq = doc.getElementById('vn-gen-request')?.value || '';
                        scanText += " " + genTitle + " " + genReq;
                    }
                } catch(e) {}
            }

            let lore = '';
            try {
                const _rawPacks = localStorage.getItem('vn_active_wb_packs');
                const _activePacks = _rawPacks ? JSON.parse(_rawPacks) : null;
                if (_activePacks && _activePacks.length && win.OS_WORLDBOOK?.getContextByPacks) {
                    lore = await win.OS_WORLDBOOK.getContextByPacks(_activePacks, scanText);
                } else if (win.OS_WORLDBOOK?.getEnabledContext) {
                    lore = await win.OS_WORLDBOOK.getEnabledContext(scanText);
                }
            } catch(e) { console.warn('[OS_API standalone] 世界書載入失敗:', e); }

            try {
                const _avsRulesCtx = win.OS_AVS_RULES?.getActiveContext?.(_avsRead());
                if (_avsRulesCtx) lore = lore ? lore + '\n\n---\n\n' + _avsRulesCtx : _avsRulesCtx;
            } catch(e) { console.warn('[OS_API standalone] AVS 條件規則載入失敗:', e); }

            if (cotPrompt) apiMessages.push({ role: 'system', content: `### \n${cotPrompt}` });
            apiMessages.push({ role: 'system', content: `### Roleplay Instruction\n${sysPrompt}` });

            let avsPrompt = '';
            try {
                const avsState = _avsRead();
                if (Object.keys(avsState).length > 0) {
                    avsPrompt = `[SYSTEM: Current Dynamic Variables (AVS)]\n${JSON.stringify(avsState)}`;
                }
            } catch(e) {}

            if (promptKey === 'vn_story') {
                const _promptOrder = (() => {
                    try {
                        const s = JSON.parse(localStorage.getItem('vn_prompt_order') || '[]');
                        if (Array.isArray(s) && s.length) return s;
                    } catch(e) {}
                    return ['cot', 'main_prompt', 'worldbook', 'persona', 'vn_history'];
                })();

                const _vnMsgs = [];
                let _stCh = [];
                if (win.OS_DB?.getAllVnChapters) {
                    try {
                        const _ctxN = (() => {
                            try { return parseInt(JSON.parse(localStorage.getItem('vn_cfg_v4') || '{}').ctxChapters || '5') || 5; }
                            catch(e) { return 5; }
                        })();
                        const _allCh  = await win.OS_DB.getAllVnChapters();
                        const _sid    = localStorage.getItem('vn_current_story_id') || '';
                        _stCh     = _sid
                            ? _allCh.filter(ch => ch.storyId === _sid)
                            : _allCh.filter(ch => !ch.storyId);

                        // 查詢大總結，過濾已覆蓋章節
                        let _grandSummaryBlock = '';
                        if (win.OS_DB?.getGrandSummaries) {
                            const _summaries = await win.OS_DB.getGrandSummaries(_sid);
                            if (_summaries.length > 0) {
                                // 取最新一筆（count 最大）
                                const _latest = _summaries.reduce((a, b) => (a.count >= b.count ? a : b));
                                const _coveredIds = new Set(_latest.coveredChapterIds || []);
                                if (_coveredIds.size > 0) {
                                    _stCh = _stCh.filter(ch => !_coveredIds.has(ch.id));
                                }
                                _grandSummaryBlock = `【大總結（第${_latest.count}次）】\n${_latest.content}`;
                                console.log(`[OS_API vn_story] 大總結注入：第${_latest.count}次，已過濾 ${_coveredIds.size} 章`);
                            }
                        }

                        _stCh.reverse().forEach((ch, idx, arr) => {
                            let _c = ch.content || '';
                            if (!_c) return;
                            _c = _c.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');   // 先剝 CoT：思考區提到 <content> 會從 CoT 開抓
                            const _isRecent = _ctxN === 0 || idx >= arr.length - _ctxN;
                            if (!_isRecent) {
                                const _sm = _c.match(/<summary>([\s\S]*?)<\/summary>/i);
                                _c = _sm ? _sm[1].trim() : '';
                            } else {
                                const _m = _c.match(/<content>([\s\S]*?)<\/content>/i);
                                if (_m) _c = _m[1].trim();
                                _c = _c.replace(/<summary>[\s\S]*?<\/summary>/gi, '').trim();
                            }
                            if (ch.request) _vnMsgs.push({ role: 'user', content: ch.request });
                            if (_c) _vnMsgs.push({ role: 'assistant', content: _c });
                        });

                        // 大總結插在歷史最前面
                        if (_grandSummaryBlock) {
                            _vnMsgs.unshift({ role: 'system', content: _grandSummaryBlock });
                        }
                    } catch(e) { console.warn('[OS_API vn_story] VN 歷史載入失敗:', e); }
                }

                // ── 故事時間掃描（從章節 summary 抽最新「故事時間:」）──
                let _latestStoryTime = '';
                for (const _ch of _stCh) {
                    const _sm = (_ch.content || '').match(/<summary>([\s\S]*?)<\/summary>/i);
                    if (!_sm) continue;
                    const _tMatch = _sm[1].match(/故事時間\s*[:：]\s*(.+)/);
                    if (_tMatch) _latestStoryTime = _tMatch[1].trim();
                }

                const _vn = [];
                const _entryMap = Object.fromEntries((win.OS_PROMPTS?.getEntries?.() || []).map(e => [e.id, e]));
                const _vnBundles = (win.OS_PROMPTS?.getBundles?.() || [])
                    .filter(b => b.enabled !== false && (b.panels||[]).some(p => 'vn_story' === p || 'vn_story'.startsWith(p + '_') || 'vn_story'.startsWith(p)))
                    .sort((a, b) => { const ai = _promptOrder.indexOf(a.id), bi = _promptOrder.indexOf(b.id); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi); });
                const _injectedSys = new Set(); 
                for (const _bundle of _vnBundles) {
                    for (const _item of (_bundle.items || [])) {
                        if (_item.type === 'sys') {
                            if (_injectedSys.has(_item.id)) continue;
                            _injectedSys.add(_item.id);
                            if      (_item.id === 'cot'          && cotPrompt) _vn.push({ role: 'system', content: `### \n${cotPrompt}` });
                            else if (_item.id === 'panel_prompt')              { const fmt = win.OS_PROMPTS?.getSystemPrompt?.('vn_story') || win.OS_PROMPTS?.getFormat?.('vn_story') || ''; if (fmt) _vn.push({ role: 'system', content: fmt }); }
                            else if (_item.id === 'worldbook'   && lore)       _vn.push({ role: 'system', content: `[World Info]:\n${lore}` });
                            else if (_item.id === 'persona'     && (userDesc || userName !== 'User'))  _vn.push({ role: 'system', content: `[User Info (${userName})]:\n${userDesc || '(玩家本人)'}` });
                            else if (_item.id === 'vn_history') _vnMsgs.forEach(m => _vn.push(m));
                        } else if (_item.type === 'entry') {
                            const _e = _entryMap[_item.id];
                            if (_e?.enabled !== false && _e?.content?.trim()) _vn.push({ role: 'system', content: _e.content.trim() });
                        }
                    }
                }
                
                if (_vnBundles.length === 0) {
                    if (sysPrompt)  _vn.push({ role: 'system', content: `### Roleplay Instruction\n${sysPrompt}` });
                    if (lore)       _vn.push({ role: 'system', content: `[World Info]:\n${lore}` });
                    if (userDesc || userName !== 'User') _vn.push({ role: 'system', content: `[User Info (${userName})]:\n${userDesc || '(玩家本人)'}` });
                    _vnMsgs.forEach(m => _vn.push(m));
                }

                // ── 角色記錄 / 向量召回 ──
                const _vecEnabled = win.OS_VECTOR_ENGINE?.isEnabled?.() === true;
                if (_vecEnabled && userMessage) {
                    // 向量模式：跳過全量 [角色記錄]，改用語意召回
                    try {
                        const _memories = await win.OS_VECTOR_ENGINE.search(userMessage, _sid);
                        if (_memories.length > 0) {
                            let _recallBlock = `[記憶召回]\n`;
                            if (_latestStoryTime) _recallBlock += `當前故事時間：${_latestStoryTime}\n\n`;
                            for (const _m of _memories) {
                                _recallBlock += `[${_m.type || 'event'}] ${_m.text}`;
                                if (_m.tags?.length) _recallBlock += `（${_m.tags.join('、')}）`;
                                _recallBlock += '\n';
                            }
                            _vn.push({ role: 'system', content: _recallBlock.trim() });
                            console.log(`[OS_API vn_story] 向量召回：${_memories.length} 條記憶`);
                        }
                    } catch(_ve) {
                        console.warn('[OS_API vn_story] 向量召回失敗:', _ve);
                    }
                }

                if (avsPrompt) _vn.push({ role: 'system', content: avsPrompt });

                if (userMessage) {
                    const _cotReminder = `\n\n[SYS]\n叮! 委託者發來新的消息，請查收後，提交<thinking> tag，草稿及正文本`;
                    _vn.push({ role: 'user', content: userMessage + _cotReminder });
                }

                console.log(`[OS_API vn_story] Context 組裝完成：${_vn.length} 段 | 包：${_vnBundles.map(b=>b.name).join(' → ')}`);
                return _vn;
            }

            // 🚫 大廳(iris/cheshire)自足：不吃當前 persona/世界書/AVS 變數，避免跨卡污染(同酒館路徑)
            const _NO_CARD_STD = (promptKey === 'iris_chat' || promptKey === 'cheshire_chat');
            let contextBlock = '';
            if (!_NO_CARD_STD) {
                if (userDesc || userName !== 'User') contextBlock += `[User Info (${userName})]:\n${userDesc || '(玩家本人)'}\n\n`;
                if (charPersona)  contextBlock += `[Character Persona (Private Chat)]:\n${charPersona}\n\n`;
                if (lore)         contextBlock += `[World Info]:\n${lore}\n\n`;
            }
            if (contextBlock) apiMessages.push({ role: 'system', content: contextBlock });

            if (avsPrompt && !_NO_CARD_STD) apiMessages.push({ role: 'system', content: avsPrompt });

            if (promptKey === 'wx_chat_system' && win.WX_DB?.getApiChat && win.wxApp?.GLOBAL_ACTIVE_ID) {
                try {
                    const useSummary = (() => {
                        try {
                            const cfg = JSON.parse(localStorage.getItem('os_global_config') || '{}');
                            return cfg.enableSummaryOnly === true;
                        } catch(e) { return false; }
                    })();

                    const apiChat = await win.WX_DB.getApiChat(win.wxApp.GLOBAL_ACTIVE_ID);
                    if (apiChat?.messages?.length) {
                        apiChat.messages.forEach(msg => {
                            let content = msg.raw || msg.content || '';
                            if (!content) return;
                            content = content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');   // 先剝 CoT：思考區提到 <content> 會從 CoT 開抓

                            if (useSummary) {
                                const match = content.match(/<summary>([\s\S]*?)<\/summary>/i);
                                content = match ? match[1].trim() : content;
                            } else {
                                const match = content.match(/<content>([\s\S]*?)<\/content>/i);
                                if (match) content = match[1].trim();
                                content = content.replace(/<summary>[\s\S]*?<\/summary>/gi, '').trim();
                            }

                            if (content) apiMessages.push({
                                role: msg.isMe ? 'user' : 'assistant',
                                content
                            });
                        });
                    }
                } catch(e) { console.warn('[OS_API standalone] 聊天歷史載入失敗:', e); }
            }

            if (userMessage) {
                let finalUserMsg = userMessage;
                const cotReminder = `\n\n[SYS]\n叮! 委託者發來新的消息，請查收後，提交<thinking> tag，草稿及正文本`;
                finalUserMsg += cotReminder;
                apiMessages.push({ role: 'user', content: finalUserMsg });
            }

            console.log(`[OS_API standalone] Context 組裝完成：${apiMessages.length} 段，世界書 ${lore.length} 字`);
            return apiMessages;
        }
    };

    win.WX_API = win.OS_API;

    // --- 4. OS_API_ENGINE 獨立應用暴露介面 ---
    win.OS_API_ENGINE = {
        generateText: async function(promptKey, userMessage) {
            return new Promise(async (resolve, reject) => {
                try {
                    let config = {};
                    if (win.OS_SETTINGS && typeof win.OS_SETTINGS.getConfig === 'function') {
                        config = win.OS_SETTINGS.getConfig();
                    } else {
                        const rawCfg = localStorage.getItem('os_global_config');
                        if (rawCfg) config = JSON.parse(rawCfg);
                    }
                    // 工具型路由(煉丹等 general_assistant)不背 preset 自訂條目——只要乾淨指令+角色卡/世界書(歷史由 NO_HISTORY_ROUTES 擋)
                    if (promptKey === 'general_assistant') config = Object.assign({}, config, { usePresetPrompts: false });

                    const messages = await win.OS_API.buildContext(userMessage, promptKey);

                    win.OS_API.chat(
                        messages,
                        config,
                        (chunk) => { /* 忽略串流輸出，直接等待結果 */ },
                        (finalText) => { resolve(finalText); },
                        (err) => { reject(err); },
                        { disableTyping: true } // 告知不使用打字機效果，加速回傳
                    );
                } catch (e) {
                    console.error("[OS_API_ENGINE] generateText 執行失敗:", e);
                    resolve(""); 
                }
            });
        },

        startStandaloneStory: async function(sessionPayload) {
            console.log("[OS_API_ENGINE] 啟動獨立劇情:", sessionPayload);

            localStorage.setItem('vn_current_story_id', sessionPayload.entityId);
            localStorage.setItem('vn_current_story_title', sessionPayload.title);

            if (win.OS_DB && typeof win.OS_DB.saveVnChapter === 'function') {
                await win.OS_DB.saveVnChapter({
                    storyId: sessionPayload.entityId,
                    request: "【系統：載入視差宇宙節點】", 
                    content: sessionPayload.startPrompt 
                });
            } else {
                console.warn("[OS_API_ENGINE] 找不到 OS_DB.saveVnChapter，無法儲存開場紀錄");
            }

            if (win.dispatchEvent) {
                const event = new CustomEvent('VN_STORY_STARTED', { detail: sessionPayload });
                win.dispatchEvent(event);
            }
        }
    };

    console.log('[PhoneOS] API 引擎 (V3.24 - 終極完整版：支援 <vars_analyze> 思考鏈) 就緒');
})();