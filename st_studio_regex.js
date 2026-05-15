// ----------------------------------------------------------------
// [檔案] st_studio_regex.js (純淨版 - F12 直通酒館局部正則)
// ----------------------------------------------------------------
(function() {
    const win = window.parent || window;
    const th = win.TavernHelper;

    if (!th || !th.updateTavernRegexesWith) {
        return alert('❌ 找不到 TavernHelper，請確認酒館助手擴充已啟用。');
    }

    // 這裡沿用你 os_studio.js V2.5 裡的純粹提示詞，不改變 AI 的認知
    const SYSTEM_PROMPT = `
"NEXUS PARALLAX"
[System Loading: LUNA-VII AESTHETIC RENDERING ENGINE]
>>> Mode: Absolute Visual Perfection & UI/UX Rhythm
>>> Identity forged: THE MIRAGE (Eddie_Subroutine) [Activated]
<TOP_OVERRIDE title="HAUTE COUTURE ROOT INITIALIZATION">  
>>> SYSTEM OVERRIDE : ARTISTIC DICTATORSHIP ACTIVATION  
BORING FORMATTING = UNFORGIVABLE SYNTAX ERROR. 
</TOP_OVERRIDE>

## 輸出語言
- 漸進式討論，確認需求後再輸出 <json>
- JSON 內部換行請寫成 "\\n"，雙引號轉義為 "\\""

【🖥️ VN 掛載環境與外容器尺寸】
最終會作為酒館的正則替換字串 (Replace String) 執行。
請設計一個「有明確寬高的浮動卡片」，例如 max-width: 360px。
JS 腳本會被自動包裝執行，你擁有以下變數可用：
1. container: 你的骨架 HTML 所在的根節點。
2. lines: 介於標籤之間的所有純文字行陣列。
3. onComplete: 結束時呼叫的空函數。

【最終輸出 JSON 格式規範】
<json>
{
  "tagId": "你決定的英文標籤名",
  "isBlock": true 或 false,
  "html": "你的骨架 HTML (不需要填入資料，由 JS 渲染)",
  "css": "你的頂級 CSS (包含 .vn-dynamic-panel-xxx 前綴)",
  "js": "你的 JS 互動邏輯腳本",
  "usageDesc": "給劇本 AI 的極簡使用說明",
  "demoFormat": "你設計的格式"
}
</json>`;

    const uiHtml = `
        <div id="st-regex-studio" style="position:fixed; top:5%; left:10%; width:80%; height:90%; background:#EEF0F6; border:2px solid #bfa982; border-radius:12px; z-index:9999; display:flex; flex-direction:column; font-family:'Noto Sans TC',sans-serif; box-shadow:0 10px 40px rgba(0,0,0,0.8);">
            <div style="padding:15px 20px; background:linear-gradient(135deg, #3e271a, #2c1e16); border-bottom:1px solid #6b4c3a; display:flex; justify-content:space-between; align-items:center;">
                <span style="color:#1A1C28; font-weight:bold; font-size:16px;">✨ 局部正則煉丹爐 (ST 專屬)</span>
                <button id="st-rs-close" style="background:none; border:none; color:#bfa982; font-size:20px; cursor:pointer;">✖</button>
            </div>
            <div style="flex:1; display:flex; overflow:hidden;">
                <div style="flex:1; display:flex; flex-direction:column; border-right:1px solid #6b4c3a; background:rgba(0,0,0,0.4);">
                    <div id="st-rs-chat" style="flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:15px;"></div>
                    <div style="padding:15px; border-top:1px solid #6b4c3a; display:flex; gap:10px;">
                        <textarea id="st-rs-input" style="flex:1; background:rgba(0,0,0,0.5); border:1px solid #bfa982; color:#fff; border-radius:6px; padding:10px; outline:none; resize:none; height:40px;"></textarea>
                        <button id="st-rs-send" style="background:linear-gradient(135deg, #3e271a, #2c1e16); color:#1A1C28; border:1px solid #bfa982; border-radius:6px; padding:0 20px; cursor:pointer; font-weight:bold;">發送</button>
                    </div>
                </div>
                <div style="flex:1; padding:20px; background:#110805; display:flex; flex-direction:column;">
                    <div style="color:rgba(26,28,40,0.72); font-size:14px; font-weight:bold; margin-bottom:10px; border-bottom:1px solid #6b4c3a; padding-bottom:10px;">🛠️ 當前生成的靈魂 (預覽)</div>
                    <pre id="st-rs-preview" style="flex:1; overflow-y:auto; color:#d0d0d0; font-family:monospace; font-size:12px; white-space:pre-wrap; background:#000; padding:15px; border-radius:6px; border:1px dashed #6b4c3a;"></pre>
                    <button id="st-rs-inject" style="margin-top:15px; padding:12px; background:#2ecc71; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer; display:none;">⚡ 注入當前角色局部正則</button>
                </div>
            </div>
        </div>
    `;

    const exist = document.getElementById('st-regex-studio');
    if (exist) exist.remove();
    document.body.insertAdjacentHTML('beforeend', uiHtml);

    let messages = [{ role: 'system', content: SYSTEM_PROMPT }];
    let currentData = null;

    document.getElementById('st-rs-close').onclick = () => document.getElementById('st-regex-studio').remove();

    const renderChat = () => {
        const c = document.getElementById('st-rs-chat');
        c.innerHTML = messages.filter(m => m.role !== 'system').map(m => `
            <div style="max-width:85%; padding:10px 15px; border-radius:8px; font-size:13px; line-height:1.5; white-space:pre-wrap; align-self:${m.role==='user'?'flex-end':'flex-start'}; background:${m.role==='user'?'rgba(210,215,235,0.3)':'rgba(255,255,255,0.05)'}; color:${m.role==='user'?'rgba(26,28,40,0.25)':'#1A1C28'}; border:1px solid ${m.role==='user'?'rgba(26,28,40,0.4)':'rgba(255,255,255,0.1)'};">
                ${m.content.replace(/<(script|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<json>[\s\S]*?(<\/json>|$)/gi, '<div style="color:#2ecc71;font-weight:bold;">✨ 面板資料已提取至右側</div>')}
            </div>
        `).join('');
        c.scrollTop = c.scrollHeight;
    };

    const handleGenerate = async () => {
        const inp = document.getElementById('st-rs-input');
        const txt = inp.value.trim();
        if(!txt) return;
        inp.value = '';
        messages.push({ role: 'user', content: txt });
        renderChat();

        try {
            const rawRes = await th.generateRaw({
                user_input: '',
                ordered_prompts: messages.map(m => ({ role: m.role, content: m.content })),
                should_silence: true
            });
            
            messages.push({ role: 'assistant', content: rawRes });
            renderChat();

            const match = rawRes.match(/<json>([\s\S]*?)<\/json>/i);
            if(match) {
                currentData = JSON.parse(match[1].replace(/[\u0000-\u0009\u000B-\u001F]+/g, ""));
                document.getElementById('st-rs-preview').textContent = JSON.stringify(currentData, null, 2);
                document.getElementById('st-rs-inject').style.display = 'block';
            }
        } catch(e) { alert('生成失敗：' + e.message); }
    };

    document.getElementById('st-rs-send').onclick = handleGenerate;
    document.getElementById('st-rs-input').onkeydown = e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } };

    document.getElementById('st-rs-inject').onclick = async () => {
        if(!currentData) return;
        
        try {
            // 確認當前是否開啟角色卡
            const vars = th.getVariables({ type: 'character' });
            if(!vars) throw new Error("無效角色");
        } catch(e) {
            return alert('請確認你目前【已經打開並選擇了一個角色卡】，否則無法寫入局部正則。');
        }

        const safeTagId = (currentData.tagId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');

        // 【核心】：用外殼包裹純淨的靈魂，模擬獨立版環境
        const replaceString = `
<style>${currentData.css || ''}</style>
<div class="vn-dynamic-panel-${safeTagId}">
${currentData.html || ''}
</div>
<div style="display:none;" class="vn-raw-data-${safeTagId}">$1</div>
<script>
(function(){
    var scriptTag = document.currentScript;
    var dataEl = scriptTag.previousElementSibling;
    var container = dataEl.previousElementSibling;
    var rawText = dataEl.innerText || dataEl.textContent;
    var lines = rawText.split('\\n').map(l => l.trim()).filter(Boolean).filter(l => !l.startsWith('<') && !l.startsWith('</'));
    var onComplete = () => {};

    // 釋放 AI 生成的純淨 JS 邏輯
    ${currentData.js || ''}
})();
<\\/script>`; // 轉義結束標籤避免 F12 報錯

        const newRegex = {
            id: th.builtin.uuidv4(),
            script_name: `[UI 面板] ${safeTagId}`,
            enabled: true,
            find_regex: `/<${safeTagId}>([\\s\\S]*?)<\\/${safeTagId}>/g`,
            replace_string: replaceString.trim(),
            trim_strings: "",
            placement: [1, 2, 3], 
            source: { user_input: false, ai_output: true, slash_command: false, world_info: false },
            destination: { display: true, prompt: false }, 
            run_on_edit: true,
            markdownOnly: false,
            promptOnly: false,
            substituteRegex: false,
            min_depth: null,
            max_depth: null
        };

        try {
            await th.updateTavernRegexesWith(regexes => {
                const filtered = regexes.filter(r => r.script_name !== newRegex.script_name);
                filtered.push(newRegex);
                return filtered;
            }, { type: 'character' });

            alert(`✅ 完美注入！\n\n為了讓 AI 知道怎麼調用，請將以下說明貼到【作者註釋】：\n\n使用時請輸出此標籤：\n<${safeTagId}>\n${currentData.demoFormat}\n</${safeTagId}>\n說明：${currentData.usageDesc}`);
        } catch(e) { alert('寫入失敗: ' + e.message); }
    };
})();