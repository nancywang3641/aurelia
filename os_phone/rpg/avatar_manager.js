/**
 * [檔案] avatar_manager.js (V1.1 - UI Controllable)
 * 職責：監聽 <avatar> 標籤，檢查緩存，自動生成並存入世界書
 */
(function() {
    console.log('[RPG] 載入頭像自動管理器 (Avatar Manager V1.1)...');
    const win = window.parent || window;

    // 全局緩存
    win.RPG_AVATAR_CACHE = {}; 

    const CONFIG = {
        enabled: true, // 預設狀態
        lorebookName: '【奧瑞亞世界】',
        entryComment: '【素材-隨機頭像素材】'
    };

    const AvatarManager = {
        init: async function() {
            // 讀取本地存儲的開關狀態
            const savedState = localStorage.getItem('os_avatar_gen_enabled');
            if (savedState !== null) CONFIG.enabled = (savedState === 'true');

            // 預熱緩存
            await this.refreshCache();

            // 註冊監聽器 (使用 types.d.ts 定義的 eventOn)
            if (win.eventOn) {
                win.eventOn('message_received', this.onMessageReceived.bind(this));
                console.log('[RPG Avatar] 監聽器已啟動');
            }
        },

        // 刷新緩存：從世界書讀取 Name:URL
        refreshCache: async function() {
            if (!win.TavernHelper) return;
            try {
                const entries = await win.TavernHelper.getLorebookEntries(CONFIG.lorebookName);
                const targetEntry = entries.find(e => e.comment === CONFIG.entryComment);
                
                if (targetEntry && targetEntry.content) {
                    const lines = targetEntry.content.split('\n');
                    lines.forEach(line => {
                        // 分割第一個冒號
                        const idx = line.indexOf(':');
                        if (idx > -1) {
                            const name = line.substring(0, idx).trim();
                            const url = line.substring(idx + 1).trim();
                            if (name && url) {
                                win.RPG_AVATAR_CACHE[name] = url; // 存入緩存
                            }
                        }
                    });
                    console.log(`[RPG Avatar] 緩存更新完畢，目前庫存: ${Object.keys(win.RPG_AVATAR_CACHE).length} 人`);
                }
            } catch (e) {
                console.warn('[RPG Avatar] 緩存讀取失敗:', e);
            }
        },

        // 監聽消息
        onMessageReceived: async function(messageId) {
            if (!CONFIG.enabled) return;

            // 延遲一點點確保文本已寫入
            await new Promise(r => setTimeout(r, 800));

            // 獲取上下文
            const context = win.SillyTavern.getContext();
            const chat = context.chat;
            if (!chat || chat.length === 0) return;
            const msg = chat.find(m => m.message_id === messageId) || chat[chat.length - 1];
            if (!msg || !msg.mes) return;

            // 解析 <avatar> 標籤
            const regex = /<avatar>([\s\S]*?)<\/avatar>/gi;
            let match;
            let tasks = [];

            while ((match = regex.exec(msg.mes)) !== null) {
                const content = match[1].trim();
                const lines = content.split('\n');
                lines.forEach(line => {
                    // 格式 Name: Prompt
                    const idx = line.indexOf(':');
                    if (idx > -1) {
                        const name = line.substring(0, idx).trim();
                        const prompt = line.substring(idx + 1).trim();
                        
                        // 🔥 核心邏輯：如果緩存裡已經有這個名字，直接跳過！
                        if (win.RPG_AVATAR_CACHE[name]) {
                            console.log(`[RPG Avatar] ${name} 已存在於圖庫，跳過生成。`);
                        } else if (name && prompt) {
                            tasks.push({ name, prompt });
                        }
                    }
                });
            }

            if (tasks.length > 0) {
                this.processTasks(tasks);
            }
        },

        processTasks: async function(tasks) {
            if (!win.OS_IMAGE_MANAGER) return;

            let newEntries = [];

            for (const task of tasks) {
                if (win.toastr) win.toastr.info(`正在生成新角色: ${task.name}`, 'Avatar Gen');
                
                try {
                    // 確保 Prompt 不會生成真人，並添加預設風格詞
                    const stylePreset = '2D art, CG, 2D paint, Guweiz style, Korean webtoon style, masterpiece illustration, K-pop Aesthetic, Manhwa Style, Semi-realistic, aesthetic lighting, cool tones, grainy texture,detailed eyes, masterpiece illustration, fine glossy glass lips, K-pop Aestheti';
                    const safePrompt = `${task.prompt}, ${stylePreset}, game cg, flat color, no photorealistic`;
                    const url = await win.OS_IMAGE_MANAGER.generate(safePrompt, 'char');
                    
                    if (url) {
                        newEntries.push({ name: task.name, url: url });
                        win.RPG_AVATAR_CACHE[task.name] = url; // 立即更新緩存
                        if (win.toastr) win.toastr.success(`已收錄: ${task.name}`, 'Avatar Gen');
                    }
                } catch (e) {
                    console.error(`[RPG Avatar] 生成失敗: ${task.name}`, e);
                }
            }

            if (newEntries.length > 0) {
                await this.saveToLorebook(newEntries);
            }
        },

        saveToLorebook: async function(newItems) {
            if (!win.TavernHelper) return;
            try {
                const entries = await win.TavernHelper.getLorebookEntries(CONFIG.lorebookName);
                let targetEntry = entries.find(e => e.comment === CONFIG.entryComment);

                const appendText = newItems.map(i => `${i.name}:${i.url}`).join('\n');

                if (targetEntry) {
                    const newContent = targetEntry.content ? (targetEntry.content + '\n' + appendText) : appendText;
                    await win.TavernHelper.setLorebookEntries(CONFIG.lorebookName, [{ uid: targetEntry.uid, content: newContent }]);
                } else {
                    // 如果不存在則創建
                    await win.TavernHelper.createLorebookEntries(CONFIG.lorebookName, [{
                        comment: CONFIG.entryComment,
                        content: appendText,
                        key: ['隨機頭像素材_KEY_DO_NOT_TRIGGER'],
                        enabled: true
                    }]);
                }
            } catch (e) { console.error('Save failed', e); }
        },

        // --- UI 控制接口 ---
        setEnable: function(bool) {
            CONFIG.enabled = bool;
            localStorage.setItem('os_avatar_gen_enabled', bool);
            console.log(`[RPG Avatar] Set Enabled: ${bool}`);
        },
        
        isEnabled: function() { return CONFIG.enabled; }
    };

    win.RPG_AVATAR = AvatarManager;
    setTimeout(() => AvatarManager.init(), 2000);
})();