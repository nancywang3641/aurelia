// ----------------------------------------------------------------
// [檔案] os_monitor.js (V3.7 - Token Counter)
// 路徑：os_phone/os/os_monitor.js
// 職責：系統級診斷工具。
// 修改：新增 Token 與字數計算功能，解決「條目數」過於籠統的問題。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入系統診斷中心 (V3.7 Token Counter)...');
    const win = window.parent || window;

    const style = `
        .mon-container { background: #1e1e1e; color: #fff; font-family: 'Consolas', monospace; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
        .mon-header { padding: 15px; border-bottom: 1px solid #333; background: #252526; display: flex; justify-content: space-between; align-items: center; }
        .mon-back-btn { font-size: 24px; color: #fff; cursor: pointer; margin-right: 8px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; line-height: 1; user-select: none; }
        .mon-title-group { display: flex; align-items: center; gap: 8px; }
        .mon-title { font-weight: bold; font-size: 14px; color: #ff9800; }
        .mon-btn { background: #0e639c; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
        .mon-btn:hover { background: #1177bb; }
        .mon-btn.green { background: #07c160; }
        
        .mon-content { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 15px; }
        
        .mon-card { background: #2d2d2d; border-radius: 6px; padding: 10px; border: 1px solid #3e3e3e; }
        .mon-card-title { font-size: 12px; color: #aaa; border-bottom: 1px solid #3e3e3e; padding-bottom: 5px; margin-bottom: 8px; display: flex; justify-content: space-between; }
        .mon-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
        .mon-val { color: #ce9178; text-align: right; }
        .mon-val.ok { color: #6a9955; }
        .mon-val.err { color: #f44747; }
        .mon-val.warn { color: #fa9d3b; }
        .mon-val.info { color: #4fc1ff; font-weight: bold; } /* 新增藍色樣式用於 Token */
        
        .mon-log-box { background: #111; color: #ccc; padding: 10px; border-radius: 4px; font-size: 10px; height: 250px; overflow-y: auto; white-space: pre-wrap; border: 1px solid #333; margin-top: 5px; font-family: monospace; }
    `;

    // 注入樣式
    const targetDoc = (window.parent && window.parent.document) ? window.parent.document : document;
    if (!targetDoc.getElementById('os-monitor-css')) {
        const s = targetDoc.createElement('style'); s.id = 'os-monitor-css'; s.innerHTML = style; targetDoc.head.appendChild(s);
    }

    // --- 輔助：讀取摘要設定狀態 ---
    function getSummaryStatus() {
        try {
            const saved = localStorage.getItem('os_global_config') || localStorage.getItem('wx_phone_api_config');
            if (saved) {
                const config = JSON.parse(saved);
                return config.enableSummaryOnly === true;
            }
        } catch(e) {}
        return false;
    }

    // --- 核心診斷邏輯 ---
    async function runDiagnostics(ui) {
        ui.log("🚀 開始系統診斷 (V3.7)...", true);

        // 1. 檢查模塊存在性
        const modules = [
            { name: 'OS_SETTINGS', ref: win.OS_SETTINGS },
            { name: 'OS_USER', ref: win.OS_USER },
            { name: 'OS_API', ref: win.OS_API },
            { name: 'OS_DB', ref: win.OS_DB },
            { name: 'OS_PROMPTS', ref: win.OS_PROMPTS },
            { name: 'OS_TAVERN_BRIDGE', ref: win.OS_TAVERN_BRIDGE },
            { name: 'WX_TAVERN_API_BRIDGE', ref: win.WX_TAVERN_API_BRIDGE }
        ];

        let modHtml = "";
        modules.forEach(m => {
            const status = m.ref ? '<span class="mon-val ok">運行中</span>' : '<span class="mon-val err">未載入</span>';
            modHtml += `<div class="mon-row"><span>${m.name}</span>${status}</div>`;
        });
        ui.updateSection('mod-status', modHtml);

        // 2. 測試數據橋接 (OS_TAVERN_BRIDGE)
        if (win.OS_TAVERN_BRIDGE && typeof win.OS_TAVERN_BRIDGE.getApiContext === 'function') {
            ui.log("正在呼叫 getApiContext() 獲取數據...");
            try {
                const start = Date.now();
                const ctx = await win.OS_TAVERN_BRIDGE.getApiContext();
                const time = Date.now() - start;
                
                const charName = ctx.char.name || "Unknown";
                const userName = ctx.user.name || "Unknown";
                const historyCount = Array.isArray(ctx.history) ? ctx.history.length : 0;
                const loreLen = ctx.lore ? ctx.lore.length : 0;

                // 🔥 計算 Token 與 字數邏輯
                let totalTextContent = "";
                if (historyCount > 0) {
                    ctx.history.forEach(msg => {
                        // 將內容拼接起來計算
                        totalTextContent += (msg.message || msg.mes || msg.content || "") + "\n";
                    });
                }
                const totalChars = totalTextContent.length;
                let tokenDisplay = "計算中...";

                try {
                    // 嘗試使用酒館內建的 Token 計算器 (最準確)
                    if (win.SillyTavern && typeof win.SillyTavern.getTokenCountAsync === 'function') {
                        const count = await win.SillyTavern.getTokenCountAsync(totalTextContent);
                        tokenDisplay = `${count} Tokens (精確)`;
                    } else {
                        // 備用方案：簡單估算 (中文通常 1字=1~2 token，英文 1字=0.3~0.5 token)
                        // 這裡取一個混合文本的保守估計值
                        const estimated = Math.ceil(totalChars * 1.5); 
                        tokenDisplay = `~${estimated} Tokens (估算)`;
                    }
                } catch(err) {
                    tokenDisplay = "Unknown";
                }

                const isSummaryOn = getSummaryStatus();
                const summaryHtml = isSummaryOn 
                    ? '<span class="mon-val ok">✅ 開啟 (ON)</span>' 
                    : '<span class="mon-val warn">❌ 關閉 (OFF)</span>';

                let dataHtml = `
                    <div class="mon-row"><span>讀取耗時</span><span class="mon-val">${time}ms</span></div>
                    <div class="mon-row"><span>角色名稱</span><span class="mon-val">${charName}</span></div>
                    <div class="mon-row"><span>用戶名稱</span><span class="mon-val">${userName}</span></div>
                    <div class="mon-row"><span>摘要模式 (Summary)</span>${summaryHtml}</div>
                    <div class="mon-row"><span>世界書大小</span><span class="mon-val">${loreLen} 字</span></div>
                    <hr style="border:0; border-top:1px solid #444; margin:5px 0;">
                    <div class="mon-row"><span>歷史訊息量 (Reality)</span><span class="mon-val ok" style="font-weight:bold;">${historyCount} 條</span></div>
                    <div class="mon-row"><span>總字數 (Chars)</span><span class="mon-val">${totalChars} 字</span></div>
                    <div class="mon-row"><span>Token 消耗量</span><span class="mon-val info">${tokenDisplay}</span></div>
                `;
                ui.updateSection('data-status', dataHtml);
                
                // 顯示預覽
                let preview = `--- 🔥 歷史記錄預覽 (共 ${historyCount} 條) ---\n`;
                preview += `[統計] 總長度: ${totalChars} 字 | ${tokenDisplay}\n`;
                if(isSummaryOn) preview += `[提示] 摘要模式已開啟。\n\n`;
                else preview += `[提示] 摘要模式已關閉 (全量讀取)。\n\n`;

                if (historyCount > 0) {
                    ctx.history.forEach((msg, i) => {
                        const role = (msg.is_user || msg.isMe) ? userName : charName;
                        let content = (msg.message || msg.mes || msg.content || "").replace(/<[^>]+>/g, "");
                        if(content.length > 80) content = content.substring(0, 80) + "...";
                        preview += `[#${i}] ${role}: ${content}\n`;
                    });
                    preview += `\n--- (End) ---`;
                } else {
                    preview += "(無歷史記錄)";
                }
                ui.setLog(preview);

            } catch (e) {
                ui.updateSection('data-status', `<div class="mon-row"><span>讀取失敗</span><span class="mon-val err">${e.message}</span></div>`);
                ui.log("❌ 錯誤: " + e.message);
            }
        } else {
            ui.updateSection('data-status', '<div class="mon-row"><span>狀態</span><span class="mon-val err">橋接器不可用</span></div>');
        }

        if (win.WX_TAVERN_API_BRIDGE) {
            ui.updateSection('wx-status', `<div class="mon-row"><span>監聽器</span><span class="mon-val ok">就緒</span></div>`);
        } else {
            ui.updateSection('wx-status', `<div class="mon-row"><span>監聽器</span><span class="mon-val err">未啟動</span></div>`);
        }
    }

    // --- UI 渲染 ---
    function launchApp(container) {
        container.innerHTML = `
            <div class="mon-container">
                <div class="mon-header">
                    <div class="mon-title-group">
                        <div class="mon-back-btn" id="nav-home">‹</div>
                        <span class="mon-title">📊 系統診斷 (V3.7)</span>
                    </div>
                    <button class="mon-btn green" id="mon-run">重新檢測</button>
                </div>
                <div class="mon-content">
                    <div class="mon-card">
                        <div class="mon-card-title">系統模塊 (Modules)</div>
                        <div id="mod-status"><span style="color:#666">...</span></div>
                    </div>
                    <div class="mon-card">
                        <div class="mon-card-title">
                            <span>數據橋接 (Context Bridge)</span>
                        </div>
                        <div id="data-status"><span style="color:#666">...</span></div>
                        <div class="mon-log-box" id="mon-log"></div>
                    </div>
                    <div class="mon-card">
                        <div class="mon-card-title">微信應用 (App Link)</div>
                        <div id="wx-status"><span style="color:#666">...</span></div>
                    </div>
                </div>
            </div>
        `;

        const ui = {
            updateSection: (id, html) => { const el = container.querySelector('#'+id); if(el) el.innerHTML = html; },
            log: (text, clear = false) => { const el = container.querySelector('#mon-log'); if(el) { if(clear) el.innerText = text + "\n"; else el.innerText += text + "\n"; } },
            setLog: (text) => { const el = container.querySelector('#mon-log'); if(el) el.innerText = text; }
        };

        container.querySelector('#nav-home').onclick = () => {
            const w = window.parent || window;
            if (w.PhoneSystem) w.PhoneSystem.goHome();
        };
        container.querySelector('#mon-run').onclick = () => runDiagnostics(ui);
        setTimeout(() => runDiagnostics(ui), 500);
    }

    win.OS_MONITOR = { launchApp: launchApp };
})();