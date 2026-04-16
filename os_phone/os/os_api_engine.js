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

    // --- 1. 核心清洗函數 ---
    function cleanRawOutput(text) {
        if (!text || typeof text !== 'string') return text;
        let cleaned = text;

        const thinkBlocks = [];
        // 🔥 V3.24 升級：同時攔截 <think> 與 <vars_analyze>，並送入思考面板
        cleaned = cleaned.replace(/<(think(?:ing)?|vars_analyze)>([\s\S]*?)<\/\1>/gi, (_, tag, inner) => {
            const trimmed = inner.trim();
            if (trimmed) thinkBlocks.push(`[${tag.toUpperCase()}]\n${trimmed}`);
            return ''; // 從最終顯示文本中剔除
        });
        
        if (thinkBlocks.length > 0 && win.OS_THINK) {
            win.OS_THINK.push(thinkBlocks.join('\n\n──────\n\n'), text);
        }

        if (thinkBlocks.length === 0) {
            const wxStart = cleaned.search(/\[wx_os\]|\[Chat:/i);
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

        cleaned = cleaned.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, "$1");
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
        s = s.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, '');
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

    function normalizeResponse(data) {
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

        return cleanRawOutput(rawContent);
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

        chatSecondary: async function(messages, onChunk, onFinish, onError) {
            let secConfig = {};
            if (win.OS_SETTINGS && typeof win.OS_SETTINGS.getSecondaryConfig === 'function') {
                secConfig = win.OS_SETTINGS.getSecondaryConfig();
            } else if (win.OS_SETTINGS && typeof win.OS_SETTINGS.getConfig === 'function') {
                secConfig = win.OS_SETTINGS.getConfig();
            }
            secConfig._isSecondary = true;
            this.chat(messages, secConfig, onChunk, onFinish, onError);
        },

        chat: async function(messages, config, onChunk, onFinish, onError, options = {}) {
            const globalUserName = this.getGlobalUserName();
            messages.forEach(m => {
                if (m.content && typeof m.content === 'string') {
                    m.content = m.content.replace(/\{\{\s*user\s*\}\}/gi, globalUserName);
                }
            });

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
            const frequency_penalty = isFinite(parseFloat(config.frequency_penalty)) ? parseFloat(config.frequency_penalty) : undefined;
            const presence_penalty = isFinite(parseFloat(config.presence_penalty)) ? parseFloat(config.presence_penalty) : undefined;

            if (!useSystemApi && (!config.url || !config.key)) {
                if (onError) onError(new Error('API 配置不完整 (無 URL/Key)')); return;
            }

            let totalTokens = 0;
            let totalChars = 0;
            try {
                const fullPromptString = messages.map(m => m.content).join('\n');
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
                    const content = msg.content || "";
                    let preview = content.length > 80 ? content.substring(0, 80).replace(/\n/g, ' ') + "..." : content.replace(/\n/g, ' ');
                    
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
                .filter(m => m.content && m.content.trim().length > 0);

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
                    commonBody.reasoning_effort = 'none'; 
                }

                if (useSystemApi) {
                    const context = win.SillyTavern && win.SillyTavern.getContext ? win.SillyTavern.getContext() : null;
                    if (!context) throw new Error("無 Context");
                    
                    if (stProfileId) {
                        const doc = win.document;
                        const profilesSelect = doc?.getElementById('connection_profiles');
                        if (profilesSelect && profilesSelect.value !== stProfileId) {
                            profilesSelect.value = stProfileId;
                            await new Promise((resolve) => {
                                const timeout = setTimeout(resolve, 10000);
                                context.eventSource.once(context.eventTypes.CONNECTION_PROFILE_LOADED, () => {
                                    clearTimeout(timeout);
                                    resolve();
                                });
                                profilesSelect.dispatchEvent(new Event('change'));
                            });
                        }
                        const currentModel = (typeof context.getChatCompletionModel === 'function')
                            ? context.getChatCompletionModel()
                            : undefined;
                        const response = await context.ConnectionManagerRequestService.sendRequest(
                            stProfileId, cleanMessages, maxTokens,
                            undefined,
                            currentModel
                                ? { temperature, ...extraParams, model: currentModel }
                                : { temperature, ...extraParams }
                        );
                        rawApiResponse = response; 
                        fullText = normalizeResponse(response);
                    } else {
                        const headers = context.getRequestHeaders();
                        const activeSource = context.oai_settings?.chat_completion_source
                            || win.oai_settings?.chat_completion_source;
                        if (!activeSource) throw new Error("無法讀取酒館當前 API 來源，請先在酒館選好連接");
                        const activeModel = (typeof context.getChatCompletionModel === 'function')
                            ? context.getChatCompletionModel()
                            : undefined;
                        const { model: _ignored, ...activeBody } = commonBody;
                        const requestBody = { ...activeBody, chat_completion_source: activeSource };
                        if (activeModel) requestBody.model = activeModel;
                        const response = await fetch('/api/backends/chat-completions/generate', {
                            method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                            body: JSON.stringify(requestBody)
                        });
                        const data = await response.json();
                        rawApiResponse = data; 
                        fullText = normalizeResponse(data);
                    }
                } else {
                    let targetUrl = config.url.replace(/\/$/, '');
                    if (!targetUrl.includes('/chat/completions')) targetUrl += (targetUrl.endsWith('/v1') ? '' : '/v1') + '/chat/completions';
                    
                    const response = await fetch(targetUrl, {
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` },
                        body: JSON.stringify(commonBody)
                    });
                    const data = await response.json();
                    rawApiResponse = data; 
                    fullText = normalizeResponse(data);
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

                if (enableStreaming || options.disableTyping) { if (onFinish) onFinish(fullText); } 
                else {
                    let displayedText = "";
                    for (let i = 0; i < fullText.length; i++) {
                        displayedText += fullText[i];
                        if (onChunk) onChunk(displayedText);
                        await new Promise(r => setTimeout(r, 10));
                    }
                    if (onFinish) onFinish(fullText);
                }
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
            const charName = ctx.char.name || "AI";

            let sysPrompt = "";
            let cotPrompt = "";

            if (win.OS_PROMPTS) {
                if (promptKey) sysPrompt = win.OS_PROMPTS.get(promptKey);
                cotPrompt = win.OS_PROMPTS.get('universal_cot');
            }

            if (!sysPrompt && promptKey === 'wx_chat_system') {
                sysPrompt = `You are ${charName}. Chat with ${userName}.`;
            }

            const apiMessages = [];

            if (cotPrompt) apiMessages.push({ role: "system", content: `### \n${cotPrompt}` });
            if (sysPrompt) apiMessages.push({ role: "system", content: `### Instruction\n${sysPrompt}` });

            let contextBlock = "";
            if (userDesc || userName !== "User") contextBlock += `[User Persona (${userName})]:\n${userDesc || '(玩家本人)'}\n\n`;
            
            if (ctx.char.description) contextBlock += `[Character Description]:\n${ctx.char.description}\n\n`;
            if (ctx.char.personality) contextBlock += `[Personality]:\n${ctx.char.personality}\n\n`;
            if (ctx.char.scenario) contextBlock += `[Scenario]:\n${ctx.char.scenario}\n\n`;
            const NO_LORE_ROUTES = ['iris_chat', 'cheshire_chat'];
            if (ctx.lore && !NO_LORE_ROUTES.includes(promptKey)) contextBlock += `[World Info]:\n${ctx.lore}\n\n`;
            
            if (contextBlock) {
                apiMessages.push({ role: "system", content: contextBlock });
            }
            
            if (promptKey === 'wx_chat_system' && win.WX_DB && typeof win.WX_DB.getApiChat === 'function') {
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
                        if (apiChat && apiChat.stickerLibId) {
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

            const NO_HISTORY_ROUTES = ['iris_chat', 'cheshire_chat'];
            if (!NO_HISTORY_ROUTES.includes(promptKey) && ctx.history && ctx.history.length > 0) {
                let realityText = "### Reality Context (Story History)\nThis is the background story. Use this ONLY for context. DO NOT reply to the story directly. Stick to the APP FORMAT.\n\n";
                ctx.history.forEach(m => {
                    const isUser = m.is_user || m.isMe;
                    const speaker = isUser ? userName : charName;
                    const text = stripVnTags(m.message || m.mes || m.content || "");
                    if (text) realityText += `[${speaker}]: ${text}\n`;
                });
                apiMessages.push({ role: "system", content: realityText });
            }

            if (promptKey === 'wx_chat_system' && win.WX_DB && typeof win.WX_DB.getApiChat === 'function') {
                 try {
                    const currentChatId = win.wxApp && win.wxApp.GLOBAL_ACTIVE_ID;
                    if (currentChatId) {
                        const apiChat = await win.WX_DB.getApiChat(currentChatId);
                        if (apiChat && apiChat.messages) {
                            const rawPhoneMsgs = apiChat.messages.map(msg => ({
                                role: msg.isMe ? 'user' : 'assistant',
                                content: msg.raw || msg.content || "",
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
                cotPrompt  = win.OS_PROMPTS.get('universal_cot') || '';
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
                if (win.OS_DB?.getAllVnChapters) {
                    try {
                        const _ctxN = (() => {
                            try { return parseInt(JSON.parse(localStorage.getItem('vn_cfg_v4') || '{}').ctxChapters || '5') || 5; }
                            catch(e) { return 5; }
                        })();
                        const _allCh  = await win.OS_DB.getAllVnChapters();
                        const _sid    = localStorage.getItem('vn_current_story_id') || '';
                        const _stCh   = _sid
                            ? _allCh.filter(ch => ch.storyId === _sid)
                            : _allCh.filter(ch => !ch.storyId);
                        _stCh.reverse().forEach((ch, idx, arr) => {
                            let _c = ch.content || '';
                            if (!_c) return;
                            const _isRecent = _ctxN === 0 || idx >= arr.length - _ctxN;
                            if (!_isRecent) {
                                const _sm = _c.match(/<summary>([\s\S]*?)<\/summary>/i);
                                if (_sm) {
                                    const _pl = _sm[1].split('\n').find(l => /^\s*plot\s*:/i.test(l));
                                    _c = _pl ? _pl.trim() : '';
                                } else { _c = ''; }
                            } else {
                                const _m = _c.match(/<content>([\s\S]*?)<\/content>/i);
                                if (_m) _c = _m[1].trim();
                                _c = _c.replace(/<summary>[\s\S]*?<\/summary>/gi, '').trim();
                            }
                            if (ch.request) _vnMsgs.push({ role: 'user', content: ch.request });
                            if (_c) _vnMsgs.push({ role: 'assistant', content: _c });
                        });
                    } catch(e) { console.warn('[OS_API vn_story] VN 歷史載入失敗:', e); }
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
                            else if (_item.id === 'panel_prompt')              { const fmt = win.OS_PROMPTS?.getFormat?.('vn_story') || ''; if (fmt) _vn.push({ role: 'system', content: fmt }); }
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

                if (avsPrompt) _vn.push({ role: 'system', content: avsPrompt });

                if (userMessage) {
                    const _cotReminder = `\n\n[SYS]\n叮! 委託者發來新的消息，請查收後，提交<thinking> tag，草稿及正文本`;
                    _vn.push({ role: 'user', content: userMessage + _cotReminder });
                }

                console.log(`[OS_API vn_story] Context 組裝完成：${_vn.length} 段 | 包：${_vnBundles.map(b=>b.name).join(' → ')}`);
                return _vn;
            }

            let contextBlock = '';
            if (userDesc || userName !== 'User') contextBlock += `[User Info (${userName})]:\n${userDesc || '(玩家本人)'}\n\n`;
            if (charPersona)  contextBlock += `[Character Persona (Private Chat)]:\n${charPersona}\n\n`;
            if (lore)         contextBlock += `[World Info]:\n${lore}\n\n`;
            if (contextBlock) apiMessages.push({ role: 'system', content: contextBlock });

            if (avsPrompt) apiMessages.push({ role: 'system', content: avsPrompt });

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