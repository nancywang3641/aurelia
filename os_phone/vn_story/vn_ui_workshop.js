// ----------------------------------------------------------------
// [檔案] vn_ui_workshop.js (VN 動態標籤煉丹爐 - 終極純淨版 + 世界書同步)
// 職責：生成 VN 美化標籤，並提供一鍵寫入酒館正則與主世界書的絲滑體驗，自動過濾重複標籤。
// ----------------------------------------------------------------
(function() {
    const win = window.parent || window;
    console.log('[PhoneOS] 啟動 VN 標籤煉丹爐 (酒館專屬全自動版)...');

    const workshopStyle = `
        .vn-ws-container { width: 100%; height: 100%; background: #1a0d0a; color: #FFF8E7; display: flex; flex-direction: column; font-family: 'Noto Sans TC', sans-serif; position: relative; z-index: 9999; }
        .vn-ws-header { padding: calc(15px + var(--safe-top, env(safe-area-inset-top, 0px))) 20px 15px; background: rgba(69,34,22,0.9); border-bottom: 1px solid rgba(251,223,162,0.3); display: flex; justify-content: space-between; align-items: center; box-sizing: border-box; }
        .vn-ws-title { font-size: 18px; font-weight: bold; color: #FBDFA2; display: flex; align-items: center; gap: 10px; }
        .vn-ws-close { background: none; border: none; color: #FBDFA2; font-size: 20px; cursor: pointer; }
        .vn-ws-idea-btn { background: rgba(251,223,162,0.2); border: 1px solid #FBDFA2; color: #FBDFA2; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; transition: 0.2s; }
        .vn-ws-idea-btn:hover { background: #FBDFA2; color: #1a0d0a; box-shadow: 0 0 10px rgba(251,223,162,0.8); }
        .vn-ws-tabs { display: flex; background: rgba(69,34,22,0.9); border-bottom: 1px solid rgba(251,223,162,0.3); flex-shrink: 0; }
        .vn-ws-tab { flex: 1; text-align: center; padding: 12px 0; font-size: 14px; color: #B78456; cursor: pointer; font-weight: bold; transition: 0.3s; position: relative; letter-spacing: 1px; }
        .vn-ws-tab.active { color: #FBDFA2; }
        .vn-ws-tab.active::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 3px; background: #FBDFA2; box-shadow: 0 -2px 8px rgba(251,223,162,0.5); }
        .vn-ws-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        .vn-ws-view { display: none; flex-direction: column; gap: 15px; }
        .vn-ws-view.active { display: flex; animation: fadeIn 0.4s ease-out; }
        .vn-ws-group { display: flex; flex-direction: column; gap: 8px; }
        .vn-ws-group label { font-size: 14px; color: #FBDFA2; font-weight: bold; }
        .vn-ws-input, .vn-ws-textarea { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(251,223,162,0.4); color: #FFF; padding: 10px; border-radius: 6px; font-size: 14px; outline: none; transition: 0.2s; }
        .vn-ws-input:focus, .vn-ws-textarea:focus { border-color: #FBDFA2; box-shadow: 0 0 8px rgba(251,223,162,0.2); }
        .vn-ws-textarea { resize: vertical; min-height: 80px; }
        .vn-ws-btn { background: transparent; color: #FBDFA2; border: 1px solid #FBDFA2; padding: 12px; border-radius: 6px; cursor: pointer; font-weight: bold; text-align: center; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .vn-ws-btn:hover { background: rgba(251,223,162,0.1); }
        .vn-ws-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .vn-ws-preview-box { border: 1px dashed rgba(251,223,162,0.5); padding: 15px; border-radius: 6px; min-height: 120px; position: relative; background: #000; overflow: hidden;}
        .vn-ws-code-box { background: #0d0d0d; color: #00ffcc; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; border: 1px solid #333; }
        #vn-ws-loading { display: none; text-align: center; color: #00ffcc; font-size: 14px; margin-top: 10px; letter-spacing: 1px; }
        .vn-ws-card { background: rgba(20, 10, 5, 0.85); border-radius: 12px; padding: 20px; border: 1px solid rgba(251,223,162,0.2); margin-bottom: 15px; box-shadow: 0 8px 24px rgba(0,0,0,0.6); }
        #vn-ws-refine-area { display: none; margin-top: 15px; padding-top: 15px; border-top: 1px dashed rgba(251,223,162,0.4); animation: fadeIn 0.5s; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        
        #vn-ws-idea-overlay { display: none; position: absolute; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000; align-items: center; justify-content: center; backdrop-filter: blur(5px); }
        .vn-ws-idea-modal { background: #1a0d0a; border: 1px solid #FBDFA2; border-radius: 12px; width: 85%; max-width: 400px; padding: 25px; display: flex; flex-direction: column; gap: 15px; box-shadow: 0 15px 40px rgba(0,0,0,0.9); }
    `;

    const workshopHTML = `
        <div class="vn-ws-container">
            <div class="vn-ws-header">
                <div class="vn-ws-title">
                    ✨ 視覺展廳 & 煉丹爐
                    <button class="vn-ws-idea-btn" id="vn-ws-btn-idea" title="呼叫點子 AI 幫你配藥材">💡</button>
                </div>
                <button class="vn-ws-close" id="vn-ws-btn-close">✖</button>
            </div>
            <div class="vn-ws-tabs">
                <div class="vn-ws-tab active" data-tab="gallery">🖼️ 展廳</div>
                <div class="vn-ws-tab" data-tab="furnace">🔥 煉丹爐</div>
            </div>

            <div class="vn-ws-body">
                <div id="vn-ws-view-gallery" class="vn-ws-view active">
                    <div id="vn-ws-gallery-list" style="display:flex; flex-direction:column;"></div>
                </div>

                <div id="vn-ws-view-furnace" class="vn-ws-view">
                    <div class="vn-ws-group">
                        <label>1. 標籤名稱 (限英數字)</label>
                        <input type="text" class="vn-ws-input" id="vn-ws-tag-id" placeholder="例如: auction">
                    </div>
                    <div class="vn-ws-group">
                        <label>2. 劇情格式定義 (支援單行與多行區塊)</label>
                        <textarea class="vn-ws-textarea" id="vn-ws-format" placeholder="格式定義..." style="min-height: 120px; font-family: monospace; line-height: 1.4;"></textarea>
                    </div>
                    <div class="vn-ws-group">
                        <label>3. 外觀與動畫描述 (交給 AI 設計師)</label>
                        <textarea class="vn-ws-textarea" id="vn-ws-desc" placeholder="UI描述..." style="min-height: 100px;"></textarea>
                    </div>
                    <button class="vn-ws-btn" id="vn-ws-btn-generate" style="background: rgba(251,223,162,0.1);">讓 AI 開始煉丹 (全新生成)</button>
                    <div id="vn-ws-loading">AI 正在撰寫特效代碼，請稍候...</div>
                    
                    <div class="vn-ws-group" style="margin-top: 10px;">
                        <label>預覽效果 (可以直接點擊互動！)</label>
                        <div class="vn-ws-preview-box" id="vn-ws-preview"></div>
                    </div>

                    <div id="vn-ws-refine-area">
                        <div class="vn-ws-group">
                            <label style="color:#e67e22;">💡 效果不滿意？告訴 AI 怎麼修改：</label>
                            <textarea class="vn-ws-textarea" id="vn-ws-refine-desc" placeholder="例如：背景顏色改暗一點..."></textarea>
                            <button class="vn-ws-btn" id="vn-ws-btn-refine" style="background: rgba(230,126,34,0.1); color:#e67e22; border-color:#e67e22;">🛠️ 根據建議進行微調</button>
                        </div>
                    </div>

                    <div class="vn-ws-group">
                        <label>底層代碼 (JSON)</label>
                        <div class="vn-ws-code-box" id="vn-ws-code">等待生成...</div>
                    </div>
                    <button class="vn-ws-btn" id="vn-ws-btn-save" style="display: none; background: rgba(46, 204, 113, 0.15); color: #2ecc71; border-color: #2ecc71;">💾 儲存並收錄至展廳</button>
                </div>
            </div>

            <div id="vn-ws-idea-overlay">
                <div class="vn-ws-idea-modal">
                    <h3 style="color:#FBDFA2; margin:0; display:flex; align-items:center; gap:8px;">💡 點子 AI 助手</h3>
                    <p style="font-size:12px; color:#aaa; margin:0; line-height:1.5;">不會寫 UI 指令嗎？直接用大白話許願！</p>
                    <textarea id="vn-ws-idea-input" class="vn-ws-textarea" placeholder="請用白話文描述你想做的介面..." style="min-height: 100px;"></textarea>
                    <div style="display:flex; flex-direction:column; gap:10px; margin-top:5px;">
                        <button id="vn-ws-idea-submit" class="vn-ws-btn" style="background:rgba(52, 152, 219, 0.15); border-color:#3498db; color:#3498db;">🤖 幫我生成煉丹配方</button>
                        <button id="vn-ws-idea-cancel" class="vn-ws-btn" style="border-color:#666; color:#aaa;">取消</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    let generatedData = null;
    let basePrompt = ""; 

    function launchWorkshop(root) {
        if (!root) root = document.getElementById('aurelia-phone-screen') || document.body;

        let existing = document.getElementById('vn_workshop_app');
        if (existing) existing.remove();

        if (!document.getElementById('vn_workshop_style')) {
            const styleElement = document.createElement('style');
            styleElement.id = 'vn_workshop_style';
            styleElement.innerHTML = workshopStyle;
            document.head.appendChild(styleElement);
        }

        const appDiv = document.createElement('div');
        appDiv.id = 'vn_workshop_app';
        appDiv.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; z-index:9999;';
        appDiv.innerHTML = workshopHTML;
        root.appendChild(appDiv);

        bindEvents();
        loadGallery(); 
    }

    function launchInTab(tabContainer) { launchWorkshop(tabContainer); }

    function bindEvents() {
        document.getElementById('vn-ws-btn-close').onclick = () => document.getElementById('vn_workshop_app').remove();

        const tabs = document.querySelectorAll('.vn-ws-tab');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.vn-ws-view').forEach(v => v.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`vn-ws-view-${tab.dataset.tab}`).classList.add('active');
                if (tab.dataset.tab === 'gallery') loadGallery();
            };
        });

        document.getElementById('vn-ws-btn-idea').onclick = () => { document.getElementById('vn-ws-idea-overlay').style.display = 'flex'; };
        document.getElementById('vn-ws-idea-cancel').onclick = () => { document.getElementById('vn-ws-idea-overlay').style.display = 'none'; };
        document.getElementById('vn-ws-idea-submit').onclick = async () => {
            const ideaInput = document.getElementById('vn-ws-idea-input').value.trim();
            if (!ideaInput) return alert('請先輸入你的點子！');
            const btn = document.getElementById('vn-ws-idea-submit');
            const originalText = btn.innerHTML;
            btn.innerHTML = '配方調製中...';
            btn.disabled = true;
            await requestIdeaTranslation(ideaInput);
            btn.innerHTML = originalText;
            btn.disabled = false;
        };

        document.getElementById('vn-ws-btn-generate').onclick = async () => {
            let rawTagId = document.getElementById('vn-ws-tag-id').value.trim();
            const tagId = rawTagId.replace(/[^a-zA-Z0-9_-]/g, '');
            if (rawTagId !== tagId) document.getElementById('vn-ws-tag-id').value = tagId;

            const format = document.getElementById('vn-ws-format').value.trim();
            const desc = document.getElementById('vn-ws-desc').value.trim();
            if (!tagId || !format || !desc) return alert('請完整填寫資訊');

            document.getElementById('vn-ws-loading').style.display = 'block';
            document.getElementById('vn-ws-btn-generate').disabled = true;
            document.getElementById('vn-ws-refine-area').style.display = 'none';

            await requestAIGeneration(tagId, format, desc, false);

            document.getElementById('vn-ws-loading').style.display = 'none';
            document.getElementById('vn-ws-btn-generate').disabled = false;
        };

        document.getElementById('vn-ws-btn-refine').onclick = async () => {
            const refineMsg = document.getElementById('vn-ws-refine-desc').value.trim();
            if (!refineMsg) return alert('請輸入修改建議！');

            document.getElementById('vn-ws-loading').style.display = 'block';
            document.getElementById('vn-ws-btn-refine').disabled = true;

            await requestAIGeneration(null, null, refineMsg, true);

            document.getElementById('vn-ws-loading').style.display = 'none';
            document.getElementById('vn-ws-btn-refine').disabled = false;
        };

        document.getElementById('vn-ws-btn-save').onclick = async () => {
            if (!generatedData || !generatedData.tagId) return alert('❌ 無法儲存：缺少標籤 ID！請重新生成。');
            const db = win.OS_DB || window.OS_DB;
            if (db && typeof db.saveVNTagTemplate === 'function') {
                try {
                    if (!generatedData.id) generatedData.id = 'tpl_' + Date.now();
                    generatedData.isActive = true;
                    const formatText = document.getElementById('vn-ws-format').value.trim();
                    generatedData.demoFormat = formatText;
                    
                    await db.saveVNTagTemplate(generatedData);
                    if (typeof syncActiveTagsToLocal === 'function') await syncActiveTagsToLocal();
                    alert('🎉 標籤已成功收錄！即將為您切換至展廳。');
                    document.querySelector('.vn-ws-tab[data-tab="gallery"]').click();
                } catch (err) { alert('❌ 儲存失敗: ' + err.message); }
            }
        };
    }

    function generateRegexReplacement(data) {
        if (!data || !data.tagId) return '';
        const safeTagId = data.tagId.replace(/[^a-zA-Z0-9_-]/g, '');
        let htmlContent = (data.html || '').replace(/\{\{(\d+)\}\}/g, '$$$$$1'); 
        
        let fullHtml = `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<style>\n${data.css || ''}\n</style>\n</head>\n<body>\n`;
        fullHtml += `<div class="vn-dynamic-panel-${safeTagId}" id="${safeTagId}-container">\n${htmlContent}\n</div>\n`;
        
        if (data.js) {
            let safeJs = data.js.replace(/\x60\x60\x60(?:javascript|js|html|css)?/gi, '').replace(/\x60\x60\x60/g, '').trim();
            fullHtml += `\n<script>\n(async function(){\n  try {\n    const ctx = window.parent || window;\n    const imgManager = ctx.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER;\n    const container = document.getElementById('${safeTagId}-container');\n    const rawText = \`$1\`;\n    const lines = rawText.split('\\n').map(l=>l.trim()).filter(Boolean);\n    window.__IS_PREVIEW = false;\n    ${safeJs}\n  } catch(e) {\n    console.error('${safeTagId} 腳本執行錯誤:', e);\n  }\n})();\n</script>\n`;
        }
        fullHtml += `</body>\n</html>`;
        return "```\n" + fullHtml + "\n```";
    }

    // 🔪 將標籤說明優雅地折疊進當前角色的主世界書中 (自動去除多餘外套)
    async function syncPromptToWorldbook(th, data) {
        if (typeof th.getCharWorldbookNames !== 'function') return false;

        const charWbInfo = th.getCharWorldbookNames('current');
        const primaryWb = charWbInfo?.primary;
        
        if (!primaryWb) return false;

        const ENTRY_NAME = 'VN動態面板大全';
        
        // 暴力扒掉 AI 在 demoFormat 裡自作主張加上的外層標籤，確保純淨
        let cleanFormat = (data.demoFormat || '').trim();
        const regStart = new RegExp(`^<${data.tagId}>\\s*`, 'i');
        const regEnd = new RegExp(`\\s*<\\/${data.tagId}>$`, 'i');
        cleanFormat = cleanFormat.replace(regStart, '').replace(regEnd, '').trim();

        const tagBlock = `【標籤：${data.tagId}】\n說明：${data.usageDesc || '無'}\n格式示範：\n<${data.tagId}>\n${cleanFormat}\n</${data.tagId}>`;

        let entries = [];
        try {
            entries = await th.getWorldbook(primaryWb);
        } catch (e) {
            console.error('[VN Workshop] 讀取主世界書失敗:', e);
            return false;
        }
        
        let targetEntry = entries.find(e => e.name === ENTRY_NAME);

        if (targetEntry) {
            await th.updateWorldbookWith(primaryWb, (wbEntries) => {
                const entry = wbEntries.find(e => e.name === ENTRY_NAME);
                if (entry) {
                    const regex = new RegExp(`【標籤：${data.tagId}】[\\s\\S]*?(?=(?:\\n\\n【標籤：|$))`);
                    if (regex.test(entry.content)) {
                        entry.content = entry.content.replace(regex, tagBlock).trim();
                    } else {
                        entry.content = (entry.content.trim() + '\n\n' + tagBlock).trim();
                    }
                }
                return wbEntries;
            });
        } else {
            const initContent = `### [擴充動態特效標籤]\n你現在擁有額外的視覺特效標籤可以使用。請根據劇情氛圍，在最適合的時機輸出這些標籤來增強沉浸感：\n\n${tagBlock}`;
            await th.createWorldbookEntries(primaryWb, [{
                name: ENTRY_NAME,
                enabled: true,
                content: initContent,
                strategy: { type: 'constant' }, 
                position: { type: 'before_author_note', order: -5 }
            }]);
        }
        return true;
    }

    // 核心接口：一鍵寫入正則並同步至主世界書
    async function importToSillyTavern(data) {
        const th = win.TavernHelper || (window.parent && window.parent.TavernHelper);
        if (!th) {
            alert('❌ 找不到 TavernHelper！請確保你在酒館環境內，且已安裝酒館助手腳本。');
            return;
        }

        if (!data || !data.tagId) return;

        const safeTagId = data.tagId.replace(/[^a-zA-Z0-9_-]/g, '');
        const searchRegex = `/<${safeTagId}>([\\s\\S]*?)<\\/${safeTagId}>/gi`;
        const replacement = generateRegexReplacement(data);

        const regexObj = {
            id: th.uuidv4 ? th.uuidv4() : ('vn_tag_' + Date.now()),
            script_name: `[VN面板] ${safeTagId}`,
            enabled: true,
            find_regex: searchRegex,
            replace_string: replacement,
            trim_strings: [],
            source: { user_input: false, ai_output: true, slash_command: false, world_info: false },
            destination: { display: true, prompt: false },
            run_on_edit: true,
            min_depth: null,
            max_depth: null,
            markdownOnly: true,
            promptOnly: false,
            substituteRegex: 0
        };

        try {
            await th.updateTavernRegexesWith(regexes => {
                const filtered = regexes.filter(r => r.script_name !== regexObj.script_name);
                filtered.push(regexObj);
                return filtered;
            }, { type: 'global' });
            
            let wbMsg = "";
            try {
                const wbSynced = await syncPromptToWorldbook(th, data);
                if (wbSynced) {
                    wbMsg = "\n✅ 已優雅地將使用說明折疊至角色的主世界書中。";
                } else {
                    wbMsg = "\n⚠️ 未找到角色綁定的主世界書，跳過提示詞同步。";
                }
            } catch (e) {
                console.error(e);
                wbMsg = "\n❌ 同步主世界書失敗。";
            }

            alert(`🎉 匯入成功！已將標籤 [${safeTagId}] 寫入全局正則。${wbMsg}\n請發送新訊息或重新載入聊天查看效果。`);
        } catch (err) {
            console.error('[TavernHelper Regex Import]', err);
            alert('❌ 匯入失敗: ' + err.message);
        }
    }

    async function loadGallery() {
        const listEl = document.getElementById('vn-ws-gallery-list');
        listEl.innerHTML = '<div style="color:#aaa; text-align:center; padding: 40px 0;">展廳載入中...</div>';
        const db = win.OS_DB || window.OS_DB;
        if (!db || typeof db.getAllVNTagTemplates !== 'function') return;

        try {
            const templates = await db.getAllVNTagTemplates();
            if (templates.length === 0) {
                listEl.innerHTML = '<div style="color:#aaa; text-align:center; padding: 40px 0; letter-spacing: 1px;">展廳空空如也，前往煉丹爐創作你的第一個面板吧。</div>';
                return;
            }
            listEl.innerHTML = '';
            
            templates.forEach(tpl => {
                const card = document.createElement('div');
                card.className = 'vn-ws-card';
                const previewHtml = (tpl.html || '').replace(/\{\{1\}\}/g, '參數A').replace(/\{\{2\}\}/g, '參數B');
                const scopedCss = tpl.css ? `<style>${tpl.css}</style>` : '';
                
                const safeTagId = (tpl.tagId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
                const safeDemoFormat = (tpl.demoFormat || '無結構定義').replace(/</g, '&lt;').replace(/>/g, '&gt;');

                card.innerHTML = `
                    ${scopedCss}
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px; border-bottom: 1px solid rgba(251,223,162,0.15); padding-bottom: 10px;">
                        <strong style="color:#FBDFA2; font-size:16px; letter-spacing: 1px;">[${tpl.tagId || '未知'}] 視覺模組</strong>
                    </div>
                    
                    <div style="font-size:12px; color:#2ecc71; margin-bottom:10px; padding:8px 12px; background:rgba(46,204,113,0.08); border-left:3px solid #2ecc71; border-radius: 0 4px 4px 0; line-height: 1.5;">
                        💡 <b>AI 使用說明：</b><br>${tpl.usageDesc || '無特別說明'}
                    </div>

                    <div class="format-display-box" style="margin-bottom:15px; padding:12px; background:rgba(0,0,0,0.6); border-left:3px solid #B78456; border-radius:4px; position:relative;">
                        <div class="format-text" style="font-family:monospace; font-size:12px; color:#E0D8C8; white-space:pre-wrap; word-break:break-all;">${safeDemoFormat}</div>
                        <textarea class="format-input" style="display:none; width:100%; min-height:100px; background:rgba(0,0,0,0.8); color:#FFF; border:1px solid #FBDFA2; font-family:monospace; line-height:1.4; font-size:12px; padding:8px; border-radius:4px; box-sizing:border-box;">${tpl.demoFormat || ''}</textarea>
                        
                        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
                            <button class="vn-ws-btn btn-edit-format" style="padding:4px 12px; font-size:12px; background:rgba(52, 152, 219, 0.1); border-color:#3498db; color:#3498db;">✏️ 編輯格式</button>
                            <button class="vn-ws-btn btn-save-format" style="display:none; padding:4px 12px; font-size:12px; background:rgba(46,204,113,0.15); border-color:#2ecc71; color:#2ecc71;">💾 儲存</button>
                            <button class="vn-ws-btn btn-cancel-format" style="display:none; padding:4px 12px; font-size:12px; border-color:#e74c3c; color:#e74c3c;">✖ 取消</button>
                        </div>
                    </div>
                    
                    <div style="margin-bottom:15px; padding:15px; background:rgba(0,0,0,0.6); border-radius:8px; min-height:150px; position:relative; overflow:hidden; border: 1px solid rgba(251,223,162,0.1);">
                        <div class="vn-dynamic-panel-${safeTagId}" style="position:relative; transform:none; left:0; top:0; width:100%; height:100%; min-height:150px; display:flex; flex-direction:column; justify-content:center;">
                            ${previewHtml}
                        </div>
                    </div>

                    <div style="display:flex; gap:12px; margin-top: 5px;">
                        <div class="vn-ws-btn btn-import-st" style="flex:2; background:rgba(46, 204, 113, 0.12); border-color:#2ecc71; color:#2ecc71; font-size: 14px; box-shadow: 0 0 10px rgba(46,204,113,0.1);" title="一鍵將此面板邏輯寫入酒館全局正則">
                            📥 注入酒館正則
                        </div>
                        <div class="vn-ws-btn btn-del" style="flex:1; background:rgba(231,76,60,0.1); border-color:#e74c3c; color:#e74c3c; font-size: 14px;">
                            🗑️ 銷毀
                        </div>
                    </div>
                `;
                
                const box = card.querySelector('.format-display-box');
                const textEl = box.querySelector('.format-text');
                const inputEl = box.querySelector('.format-input');
                const btnEdit = box.querySelector('.btn-edit-format');
                const btnSave = box.querySelector('.btn-save-format');
                const btnCancel = box.querySelector('.btn-cancel-format');

                btnEdit.onclick = () => { textEl.style.display = 'none'; btnEdit.style.display = 'none'; inputEl.style.display = 'block'; btnSave.style.display = 'flex'; btnCancel.style.display = 'flex'; };
                btnCancel.onclick = () => { textEl.style.display = 'block'; btnEdit.style.display = 'flex'; inputEl.style.display = 'none'; btnSave.style.display = 'none'; btnCancel.style.display = 'none'; inputEl.value = tpl.demoFormat || ''; };

                btnSave.onclick = async () => {
                    tpl.demoFormat = inputEl.value;
                    await db.saveVNTagTemplate(tpl);
                    if (typeof syncActiveTagsToLocal === 'function') await syncActiveTagsToLocal();
                    loadGallery();
                };

                card.querySelector('.btn-import-st').onclick = () => {
                    importToSillyTavern(tpl);
                };
                
                card.querySelector('.btn-del').onclick = async () => {
                    if (confirm(`確定要將 [${tpl.tagId}] 模組從庫中徹底銷毀嗎？\n(注意：這不會刪除已寫入酒館的正則，需自行前往酒館設置移除)`)) {
                        await db.deleteUITemplate(tpl.id);
                        if (typeof syncActiveTagsToLocal === 'function') await syncActiveTagsToLocal();
                        loadGallery();
                    }
                };

                listEl.appendChild(card);

                if (tpl.isBlock && tpl.js) {
                    setTimeout(() => {
                        try {
                            const rawLines = (tpl.demoFormat || '').split('\n').map(l => l.trim()).filter(Boolean);
                            const lines = rawLines.filter(l => !l.startsWith('<') && !l.startsWith('</'));
                            const container = card.querySelector(`.vn-dynamic-panel-${safeTagId}`);
                            if (!container) return;
                            
                            let safeJs = tpl.js || '';
                            safeJs = safeJs.replace(new RegExp('\\x60\\x60\\x60(?:javascript|js|html|css)?', 'gi'), '').replace(new RegExp('\\x60\\x60\\x60', 'g'), '').trim();
                            
                            window.__IS_PREVIEW = true;
                            const runMicroApp = new Function('container', 'lines', 'onComplete', safeJs);
                            runMicroApp(container, lines, () => { console.log(`[展廳] ${tpl.tagId} 渲染完成`); });
                        } catch (e) { console.warn('[展廳預覽 JS 錯誤]', e); }
                    }, 50);
                }
            });
        } catch (err) { console.error('[展廳載入失敗]', err); }
    }

    async function requestIdeaTranslation(ideaText) {
        const apiEngine = win.OS_API || window.OS_API;
        if (!apiEngine || typeof apiEngine.chat !== 'function') return alert("找不到底層 API 引擎");
        
        const prompt = `你是一個 VN 視覺小說引擎的「提示詞工程師 (Prompt Engineer)」。
用戶是一個不會寫程式的玩家，他會用大白話描述想要的遊戲面板。
你的任務是將點子轉化為給「下一個 AI (UI設計師)」看的標準指令。

用戶的點子：「${ideaText}」

### 輸出指令規範：
1. **tagId**: 適合點子的英文標籤名。
2. **format**: 單行或多行區塊格式，若需圖片請加上提示詞欄位。
3. **desc**: 詳細的風格與互動描述。
4. **usageDesc**: 這是給劇本 AI 看的「使用說明書」。必須清楚說明何時該用這個標籤、每個欄位代表什麼意思。嚴禁要求劇本 AI 提供 URL，若需圖片請指明該欄位應填入「外觀提示詞 (Prompt)」。

### ⚠️ 嚴格語法規範： 必須且只能使用角括號 <tag_Id> 與 </tag_Id> 包裝內
如:
<item>...</item>
<cafelist>...</cafelist>

### 內部格式:
[tagId|content|content]
[tagId|content|content]
...

如:
<loot>
[Item|book|content]
...
</loot>


### 嚴禁格式:
❌[item]...[itrm]，不可用[]

### 格式要求：
- 必須將 JSON 物件包裹在 <json> 與 </json> 標籤內。
- JSON 內部換行請寫成 "\\n"。

請開始轉換：`;

        try {
            let baseConfig = win.OS_SETTINGS?.getConfig?.() || JSON.parse(localStorage.getItem('os_global_config') || '{}');
            const pureConfig = { ...baseConfig, usePresetPrompts: false, enableThinking: false, temperature: 0.3 };

            const responseText = await new Promise((resolve, reject) => {
                apiEngine.chat([{ role: 'user', content: prompt }], pureConfig, null, resolve, reject, { disableTyping: true });
            });

            if (!responseText) throw new Error('AI 回傳空白');
            let cleanJsonStr = responseText;
            const xmlMatch = cleanJsonStr.match(/<json>([\s\S]*?)<\/json>/i);
            if (xmlMatch) cleanJsonStr = xmlMatch[1].trim();
            else {
                const jsonMatch = cleanJsonStr.match(/\{[\s\S]*\}/);
                if (jsonMatch) cleanJsonStr = jsonMatch[0];
            }
            cleanJsonStr = cleanJsonStr.replace(/[\u0000-\u0009\u000B-\u001F]+/g, "");
            const resultObj = JSON.parse(cleanJsonStr);

            document.getElementById('vn-ws-tag-id').value = resultObj.tagId || 'custom_tag';
            document.getElementById('vn-ws-format').value = resultObj.format || '';
            document.getElementById('vn-ws-desc').value = resultObj.desc || '';

            if (resultObj.usageDesc) {
                if (!generatedData) generatedData = {};
                generatedData.usageDesc = resultObj.usageDesc;
            }
            document.getElementById('vn-ws-idea-overlay').style.display = 'none';
        } catch (error) { alert('點子轉換失敗，請檢查 API 連線。\n錯誤: ' + error.message); }
    }

    async function requestAIGeneration(tagId, format, desc, isRefine) {
        document.getElementById('vn-ws-code').innerText = isRefine ? "正在請 AI 進行修改..." : "開始呼叫底層 API (純淨模式)...";
        let messages = [];

        if (!isRefine) {
            basePrompt = `你是一個擁有頂級美學的 UI/UX 設計師、資深前端工程師與 VN 引擎架構師。
使用者需要建立一個全新的動態面板，它會以「區塊（Block）」模式攔截多行文本，並由你編寫的 JS 來解析與呈現這些文本。

標籤名（Tag）：${tagId}
資料格式範例：
${format}
情境與風格描述：
${desc}

【✨ 頂級 UI/UX 設計指令】
請發揮頂級設計師實力，調配出具備高級感的色彩計畫，廣泛使用漸層與半透明玻璃質感。包含優雅的進場動畫。

### 🚨 核心必備：使用說明書 (usageDesc)
劇本 AI 很笨，看到 \`[Item|name]\` 會自己亂猜。因此你「必須」提供 \`usageDesc\` (標籤使用說明)，清楚告訴劇本 AI 這個標籤的「適用情境」，不廢話，最多50字。

### 🖼️ 圖片處理核心規範 (預覽隔離機制) ⚠️極度重要⚠️
劇本 AI 只是「純文字模型」，無法生成圖片 URL。請在 \`demoFormat\` 中要求劇本 AI 提供「圖片提示詞 (Prompt)」。
然後在你的 \`js\` 腳本中，調用全域圖片引擎生成圖片。
**【重點防護】：** 為了避免在「展廳/創作室」預覽時觸發真實 API 導致浪費 Token，你必須在 \`js\` 中使用 \`window.__IS_PREVIEW\` 變數進行隔離！
請**嚴格遵守**以下 JS 範例結構來實作圖片載入：

\`\`\`javascript
// 必須使用 async IIFE 包裝
(async () => {
    let promptDesc = "a glowing magic sword"; // 解析出來的提示詞
    // 🛡️ 防護機制：預覽環境給佔位圖；正式劇情才呼叫 API
    const imgUrl = window.__IS_PREVIEW 
        ? 'https://via.placeholder.com/512/333333/FBDFA2?text=Preview+Image' 
        : await window.OS_IMAGE_MANAGER.generate(promptDesc, "item");
    container.querySelector('.my-image-element').src = imgUrl;
})();
\`\`\`

【重點 JS 與 CSS 編寫規範】
你的 JS 腳本會被 \x60new Function('container', 'lines', 'onComplete', tpl.js)\x60 包裝執行。你擁有以下變數可用：
1. \x60container\x60: HTML 所在的根節點。
2. \x60lines\x60: 介於 <\${tagId}> 到 </\${tagId}> 之間的所有純文字行。
3. \x60onComplete\x60: 結束時務必呼叫。
4. ⚠️ 絕對禁止在 CSS 使用 \x60position: fixed\x60、\x60100vw\x60 或 \x60100vh\x60！

【最終輸出 JSON 格式規範】(必須輸出此區塊)
<json>
{
  "tagId": "${tagId}",
  "isBlock": true 或 false,
  "html": "你的骨架 HTML (不需要填入資料，由 JS 渲染)",
  "css": "你的頂級 CSS (包含 .vn-dynamic-panel-xxx 前綴)",
  "js": "你的 JS 互動邏輯腳本 (若需圖片記得套用上述的 window.__IS_PREVIEW 隔離機制)",
  "usageDesc": "給劇本 AI 的使用說明 (什麼情境用、欄位是什麼意思)",
  "demoFormat": "你設計的格式"
}
</json>
⚠️ JSON 的字串值內部「絕對禁止」出現真實的換行符號！換行請寫成 "\\n"，雙引號轉義為 "\\""！`;
            messages = [{ role: 'user', content: basePrompt }];
        } else {
            messages = [
                { role: 'user', content: basePrompt },
                { role: 'assistant', content: JSON.stringify(generatedData) },
                { role: 'user', content: `請根據以下建議，修改你剛才生成的 JSON 結構：\n\n修改建議：【${desc}】\n\n⚠️ 必須輸出「完整」的 JSON 對象（包含 tagId, isBlock, html, css, js, usageDesc, demoFormat），絕不能只輸出修改的部分。保持純 JSON 格式，包裹在 <json> 標籤內。` }
            ];
        }

        try {
            const apiEngine = win.OS_API || window.OS_API;
            if (!apiEngine || typeof apiEngine.chat !== 'function') throw new Error("找不到獨立 API 引擎");

            let baseConfig = win.OS_SETTINGS?.getConfig?.() || JSON.parse(localStorage.getItem('os_global_config') || '{}');
            const pureConfig = { ...baseConfig, usePresetPrompts: false, enableThinking: false, temperature: 0.2 };

            const responseText = await new Promise((resolve, reject) => {
                apiEngine.chat(messages, pureConfig, null, resolve, reject, { disableTyping: true });
            });

            if (!responseText) throw new Error('AI 回傳空白');
            let cleanJsonStr = responseText;
            const xmlMatch = cleanJsonStr.match(/<json>([\s\S]*?)<\/json>/i);
            if (xmlMatch) cleanJsonStr = xmlMatch[1].trim();
            else {
                const jsonMatch = cleanJsonStr.match(/\{[\s\S]*\}/);
                if (jsonMatch) cleanJsonStr = jsonMatch[0];
            }

            cleanJsonStr = cleanJsonStr.replace(/[\u0000-\u0009\u000B-\u001F]+/g, "");
            const resultObj = JSON.parse(cleanJsonStr);

            if (isRefine && generatedData) {
                generatedData = { ...generatedData, ...resultObj };
            } else {
                generatedData = resultObj;
            }

            renderPreview(generatedData);
            document.getElementById('vn-ws-refine-area').style.display = 'block';

        } catch (error) { alert('API 調用失敗: ' + error.message); }
    }

    function renderPreview(data) {
        document.getElementById('vn-ws-code').innerText = JSON.stringify(data, null, 2);
        const previewBox = document.getElementById('vn-ws-preview');
        
        let styleTag = document.getElementById(`preview-style-${data.tagId}`);
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = `preview-style-${data.tagId}`;
            document.head.appendChild(styleTag);
        }
        styleTag.innerHTML = data.css || '';

        let mockHtml = (data.html || '').replace(/\{\{1\}\}/g, '預覽參數 A').replace(/\{\{2\}\}/g, '預覽參數 B');
        previewBox.innerHTML = `<div class="vn-dynamic-panel-${data.tagId}" style="position:relative; transform:none; left:0; top:0; width:100%; height:100%; min-height: 150px; display: flex; flex-direction: column; justify-content: center; overflow: hidden;">${mockHtml}</div>`;
        document.getElementById('vn-ws-btn-save').style.display = 'block';

        if (data.isBlock && data.js) {
            try {
                const formatText = document.getElementById('vn-ws-format').value.trim();
                const rawLines = formatText.split('\n').map(l => l.trim()).filter(l => l);
                const lines = rawLines.filter(l => !l.startsWith('<') && !l.startsWith('</'));

                const container = previewBox.querySelector(`.vn-dynamic-panel-${data.tagId}`);
                
                const onComplete = () => { 
                    const msg = document.createElement('div');
                    msg.style.cssText = 'position:absolute; top:5px; right:5px; background:rgba(46,204,113,0.8); color:white; padding:4px 8px; font-size:12px; border-radius:4px; z-index:999;';
                    msg.innerText = '✅ 腳本已觸發 onComplete()';
                    previewBox.appendChild(msg);
                };

                let safeJs = data.js || '';
                safeJs = safeJs.replace(new RegExp('\\x60\\x60\\x60(?:javascript|js|html|css)?', 'gi'), '').replace(new RegExp('\\x60\\x60\\x60', 'g'), '').trim();

                window.__IS_PREVIEW = true;
                const runMicroApp = new Function('container', 'lines', 'onComplete', safeJs);
                runMicroApp(container, lines, onComplete);

            } catch (e) {
                previewBox.innerHTML += `<div style="color:red; font-size:12px; margin-top:10px;">預覽腳本錯誤: ${e.message}</div>`;
            }
        }
    }

    // 🔪 將標籤狀態同步給獨立版使用 (自動去除多餘外套)
    async function syncActiveTagsToLocal() {
        const db = win.OS_DB || window.OS_DB;
        if (!db || typeof db.getAllVNTagTemplates !== 'function') return;
        try {
            const templates = await db.getAllVNTagTemplates();
            // 在酒館模式裡，展廳只是儲存庫，有 demoFormat 的都會被同步提示詞
            const activeTags = templates.filter(t => t.demoFormat);
            
            if (activeTags.length > 0) {
                let extraPrompt = `\n\n### [擴充動態特效標籤]\n你現在擁有額外的視覺特效標籤可以使用。請根據劇情氛圍，在最高潮或最適合的時機，獨立輸出這些標籤來增強沉浸感：\n`;
                activeTags.forEach(t => {
                    let cleanFormat = (t.demoFormat || '').trim();
                    const regStart = new RegExp(`^<${t.tagId}>\\s*`, 'i');
                    const regEnd = new RegExp(`\\s*<\\/${t.tagId}>$`, 'i');
                    cleanFormat = cleanFormat.replace(regStart, '').replace(regEnd, '').trim();

                    extraPrompt += `\n【標籤：${t.tagId}】\n[使用時機與說明]：${t.usageDesc || '無特別說明'}\n[格式示範]：\n<${t.tagId}>\n${cleanFormat}\n</${t.tagId}>\n`;
                });
                localStorage.setItem('os_vn_extra_tags_prompt', extraPrompt);
            } else {
                localStorage.removeItem('os_vn_extra_tags_prompt');
            }
        } catch (e) {}
    }

    win.VN_UI_Workshop = {
        launch: launchWorkshop,
        launchInTab: launchInTab,
    };
})();