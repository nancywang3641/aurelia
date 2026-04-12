// ----------------------------------------------------------------
// [檔案] os_tavern_bridge.js (V3.8 - Hidden Fix + Summary)
// 路徑：os_phone/os/os_tavern_bridge.js
// 職責：
// 1. [主動] 監聽 OS_USER 請求，抓取網頁 DOM 元素中的用戶列表 (Personas)。
// 2. [被動] 提供 API 發送所需的上下文。
// 3. [過濾] 自動剔除 is_hidden (隱藏) 的系統訊息。
// 4. [摘要] 支援摘要模式，過濾 <summary> 標籤。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入數據橋接器 (V3.8 - Hidden Fix)...');
    const win = window.parent || window;
    const doc = win.document; // 這是酒館的主文檔

    function getHelper() {
        return win.TavernHelper || (win.parent && win.parent.TavernHelper) || (win.top && win.top.TavernHelper);
    }

    // --- 讀取設定檔 ---
    function getSummaryConfig() {
        try {
            const saved = localStorage.getItem('os_global_config') || localStorage.getItem('wx_phone_api_config');
            if (saved) {
                const config = JSON.parse(saved);
                return config.enableSummaryOnly === true; 
            }
        } catch(e) {}
        return false;
    }

    // --- 1. 監聽器 (用戶列表) ---
    win.addEventListener('message', async (event) => {
        if (!event.data) return;

        // 📥 收到：請求用戶列表
        if (event.data.type === 'REQUEST_USER_PERSONA_LIST') {
            let personas = [];

            // A. 優先：呼叫 ST API 取全部 avatar 檔案（不分頁）
            try {
                const ctx = win.SillyTavern && win.SillyTavern.getContext ? win.SillyTavern.getContext() : null;
                const headers = ctx && ctx.getRequestHeaders ? ctx.getRequestHeaders() : {};
                const res = await fetch('/api/avatars/get', {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' }
                });
                if (res.ok) {
                    const allAvatars = await res.json(); // string[] — 全部 avatar 檔名
                    const pu = ctx && ctx.powerUserSettings;
                    const currentAvatar = ctx && ctx.userAvatar;
                    if (Array.isArray(allAvatars)) {
                        personas = allAvatars.map(avatar => ({
                            id: avatar,
                            name: (pu && pu.personas && pu.personas[avatar]) || avatar.replace(/\.[^.]+$/, ''),
                            avatar: `User Avatars/${avatar}`,
                            description: (pu && pu.persona_descriptions && pu.persona_descriptions[avatar]?.description) || '',
                            isSelected: avatar === currentAvatar,
                        }));
                    }
                }
            } catch(e) { console.warn('[Bridge] API 抓取失敗，改用 DOM', e); }

            // B. 備用：DOM 抓取（分頁限制）
            if (personas.length === 0) {
                try {
                    const container = doc.getElementById('user_avatar_block');
                    if (container) {
                        container.querySelectorAll('.avatar-container').forEach(el => {
                            const id = el.getAttribute('data-avatar-id');
                            const nameEl = el.querySelector('.ch_name');
                            const imgEl = el.querySelector('img');
                            if (id && nameEl) {
                                personas.push({
                                    id, name: nameEl.innerText.trim(),
                                    avatar: imgEl ? imgEl.src : `User Avatars/${id}`,
                                    description: '',
                                    isSelected: el.classList.contains('selected')
                                });
                            }
                        });
                    }
                } catch(e) { console.error('[Bridge] DOM 抓取失敗', e); }
            }

            if (personas.length === 0) {
                personas.push({ id: 'default', name: 'User', avatar: '', description: '無法讀取列表', isSelected: true });
            }

            const target = event.source || window;
            target.postMessage({ type: 'USER_PERSONA_LIST_RESPONSE', data: { personas: personas } }, '*');
        }

        // 📥 收到：切換用戶請求
        if (event.data.type === 'REQUEST_SWITCH_USER_PERSONA') {
            const personaId = event.data.personaId;
            try {
                const $ = win.$;
                if (!$) throw new Error('jQuery not available');

                const container = $('#user_avatar_block');
                let el = container.find(`.avatar-container[data-avatar-id="${CSS.escape(personaId)}"]`);

                if (el.length === 0) {
                    // 面板從未開啟，元素不在 DOM → 臨時插入一個假元素觸發 jQuery 委派
                    el = $('<div class="avatar-container _os-temp">').attr('data-avatar-id', personaId);
                    container.append(el);
                }

                // jQuery .trigger 會走 $(document).on('click', '#user_avatar_block .avatar-container', ...)
                // → 呼叫 ST 的 setUserAvatar(imgfile)，完整走一遍: 設 user_avatar、更新描述、saveSettingsDebounced
                el.trigger('click');
                container.find('._os-temp').remove();

            } catch(e) {
                console.error('[Bridge] 切換人設失敗', e);
            }

            const target = event.source || window;
            target.postMessage({ type: 'SWITCH_USER_PERSONA_RESPONSE', success: true }, '*');
        }
    });

    // --- 2. 獲取 API 上下文 (核心) ---
    function getCharacterData() {
        try {
            const ctx = win.SillyTavern && win.SillyTavern.getContext ? win.SillyTavern.getContext() : null;
            if (ctx && ctx.characters && ctx.characterId !== undefined) {
                const c = ctx.characters[ctx.characterId];
                if(c) return {
                    name: c.name, description: c.description || c.data?.description || "", personality: c.personality || c.data?.personality || "",
                    scenario: c.scenario || c.data?.scenario || "", first_mes: c.first_mes || ""
                };
            }
        } catch(e) {}
        return { name: "AI", description: "", personality: "", scenario: "" };
    }

    win.OS_TAVERN_BRIDGE = {
        getApiContext: async function(options = {}) {
            const helper = getHelper();
            const charData = getCharacterData();

            let loreData = "";
            try {
                if (win.OS_LOREBOOK) {
                    // 先刷新快取（冷啟動時快取為空），再取文字
                    if (typeof win.OS_LOREBOOK.refresh === 'function') {
                        await win.OS_LOREBOOK.refresh();
                    }
                    if (typeof win.OS_LOREBOOK.getPromptText === 'function') {
                        loreData = win.OS_LOREBOOK.getPromptText();
                    }
                }
            } catch(e) {}

            let userName = "User";
            let userDesc = "";
            try {
                if (helper && helper.getName) userName = helper.getName();
                if (win.SillyTavern && win.SillyTavern.getContext) {
                    const ctx = win.SillyTavern.getContext();
                    if (ctx && ctx.user && ctx.user.description) userDesc = ctx.user.description;
                }
            } catch(e) {}

            // 🔥 歷史紀錄 (Hidden 過濾 + 摘要處理)
            let messages = [];
            try {
                if (helper && typeof helper.getLastMessageId === 'function') {
                    const lastId = await helper.getLastMessageId();
                    if (lastId >= 0) {
                        let rawMsgs = await helper.getChatMessages(`0-${lastId}`);

                        // 🔥 第一步：過濾隱藏訊息 (最重要的修復)
                        if (Array.isArray(rawMsgs)) {
                            messages = rawMsgs.filter(m => m.is_hidden !== true);
                        }

                        // 🔥 第二步：摘要過濾 (Summary Logic)
                        // skipSummary: true 時跳過此步驟（供 VN 等需要完整原文的面板使用）
                        const useSummary = !options.skipSummary && getSummaryConfig();
                        if (useSummary) {
                            const summaryRegex = /<summary>([\s\S]*?)<\/summary>/i;
                            messages = messages.map(msg => {
                                let newMsg = { ...msg };
                                let rawContent = newMsg.mes || newMsg.message || newMsg.content || "";
                                const match = rawContent.match(summaryRegex);
                                if (match && match[1]) {
                                    const summaryText = match[1].trim();
                                    newMsg.mes = summaryText;
                                    newMsg.message = summaryText;
                                    newMsg.content = summaryText;
                                }
                                return newMsg;
                            });
                            console.log(`[PhoneOS] 已處理 ${messages.length} 條訊息 (含 Hidden 過濾 & Summary)`);
                        }
                    }
                }
            } catch (e) { console.error("[Bridge] 歷史讀取失敗", e); }

            return {
                char: charData,
                user: { name: userName, description: userDesc },
                lore: loreData,
                history: messages || []
            };
        }
    };

    console.log('[PhoneOS] 數據橋接器 (V3.8 - Hidden Fix) 就緒');
})();