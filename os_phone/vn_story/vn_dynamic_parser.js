// ----------------------------------------------------------------
// [檔案] vn_dynamic_parser.js (VN 動態標籤萬用解析引擎 - 避開引擎同步死鎖版)
// 職責：讀取 DB 中的自定義標籤模板，並在 VN 劇情中自動攔截與渲染。
// ----------------------------------------------------------------
(function () {
    console.log('[PhoneOS] 載入 VN 動態標籤萬用解析引擎 (支援互動區塊腳本)...');
    const VN_DynamicParser = {
        activeTemplates: [],
        _inBlockId: null,      // 記錄當前正在收集哪個區塊
        _blockLines: [],       // 收集區塊內的資料行
        
        init: async function() {
            const win = window.parent || window;
            if (win.OS_DB?.getAllVNTagTemplates) {
                const tpls = await win.OS_DB.getAllVNTagTemplates();
                this.activeTemplates = tpls.filter(t => t.isActive);
                this._injectCSS();
            }
        },
        
        _injectCSS: function() {
            let s = document.getElementById('vn-dyn-css');
            if (!s) { s = document.createElement('style'); s.id = 'vn-dyn-css'; document.head.appendChild(s); }
            s.innerHTML = this.activeTemplates.map(t => t.css || '').join('\n');
        },
        
        processLine: function(line, vnCore) {
            if (!line || this.activeTemplates.length === 0) return false;
            const safeLine = line.trim();
            
            // 狀態 1：正在收集區塊內容中
            if (this._inBlockId) {
                // 防呆：去除空白比較，避免結尾多了空格導致無法閉合
                const cleanLine = safeLine.toLowerCase().replace(/\s+/g, '');
                const targetClose = `</${this._inBlockId.toLowerCase()}>`;
                
                if (cleanLine === targetClose) {
                    // 區塊結束，啟動沙盒執行
                    const targetTag = this._inBlockId;
                    const lines = [...this._blockLines];
                    this._inBlockId = null;
                    this._blockLines = [];
                    this._renderBlock(targetTag, lines, vnCore);
                } else {
                    this._blockLines.push(safeLine); // 繼續收集
                    // 🔥 關鍵修復：使用 setTimeout (20ms) 讓出執行緒，避開 VN 引擎的防連點鎖 (isProcessing)
                    setTimeout(() => { vnCore.next(); }, 20); 
                }
                return true; // 攔截，暫停 VN 原生處理
            }

            // 狀態 2：偵測是否為區塊開頭 (例如 <weibo>)
            const blockStartMatch = safeLine.match(/^<([a-zA-Z0-9_-]+)>\s*$/i);
            if (blockStartMatch) {
                const tag = blockStartMatch[1];
                const tpl = this.activeTemplates.find(t => t.tagId.toLowerCase() === tag.toLowerCase() && t.isBlock);
                if (tpl) {
                    this._inBlockId = tag;
                    this._blockLines = [];
                    // 🔥 關鍵修復：同樣使用 setTimeout 避開引擎死鎖
                    setTimeout(() => { vnCore.next(); }, 20); 
                    return true; // 攔截開始
                }
            }
            
            // 狀態 3：傳統單行正則攔截 (保留向下相容)
            for (const tpl of this.activeTemplates) {
                if (tpl.isBlock) continue; // 區塊模式跳過正則匹配
                try {
                    let relaxedRegex = tpl.regexString;
                    if (!relaxedRegex) continue;
                    relaxedRegex = relaxedRegex.replace(/^\^/, '').replace(/\$$/, '');
                    const match = safeLine.match(new RegExp(relaxedRegex, 'i'));
                    if (match) {
                        this._renderInline(tpl, match, vnCore);
                        return true; 
                    }
                } catch (e) {}
            }
            return false;
        },

        // --- 執行區塊微型 App (核心魔法) ---
        _renderBlock: function(tagId, lines, vnCore) {
            const tpl = this.activeTemplates.find(t => t.tagId.toLowerCase() === tagId.toLowerCase());
            
            // 隱藏原生 VN 面板
            if (vnCore.hideVNPanel) vnCore.hideVNPanel();
            else if (vnCore.toggleUI) vnCore.toggleUI('none'); 
            
            const layer = document.getElementById('vn-game-layer') || document.body;
            const overlay = document.createElement('div');
            overlay.className = 'vn-dyn-overlay block-mode';
            overlay.style.cssText = 'position:absolute;inset:0;z-index:9000;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;opacity:0;transition:0.3s;';
            
            const panel = document.createElement('div');
            panel.className = `vn-dynamic-panel-${tpl.tagId}`;
            panel.style.cssText = 'position:relative; width:100%; height:100%; overflow:hidden; box-sizing:border-box; padding:20px;';
            panel.innerHTML = tpl.html || ''; 
            
            overlay.appendChild(panel);
            layer.appendChild(overlay);
            requestAnimationFrame(() => overlay.style.opacity = '1');

            // 定義完成回調：關閉 UI，呼叫 VN Core 繼續
            const onComplete = () => {
                overlay.style.opacity = '0';
                setTimeout(() => { 
                    overlay.remove(); 
                    // 恢復原生 VN 面板
                    if (vnCore.showVNPanel) vnCore.showVNPanel();
                    else if (vnCore.toggleUI) vnCore.toggleUI('vn');
                    vnCore.next(); 
                }, 300);
            };

            // 沙盒執行 AI 生成的 JS
            try {
                let safeJs = tpl.js || '';
                // 清洗干擾標籤
                safeJs = safeJs.replace(new RegExp('\\x60\\x60\\x60(?:javascript|js|html|css)?', 'gi'), '').replace(new RegExp('\\x60\\x60\\x60', 'g'), '').trim();
                
                const runMicroApp = new Function('container', 'lines', 'onComplete', safeJs);
                runMicroApp(panel, lines, onComplete);
            } catch(e) {
                console.error(`[VN Parser] 執行標籤腳本失敗 [${tagId}]:`, e);
                panel.innerHTML += `<div style="color:red; background:#000; padding:10px;">腳本執行錯誤: ${e.message}</div>`;
                overlay.onclick = onComplete; // 防卡死
            }
        },
        
        // 傳統單行渲染 (保留不變)
        _renderInline: function(tpl, match, vnCore) {
            if (vnCore.hideVNPanel) vnCore.hideVNPanel();
            else if (vnCore.toggleUI) vnCore.toggleUI('none');
            
            const layer = document.getElementById('vn-game-layer') || document.body;
            let html = tpl.html;
            for (let i = 1; i < match.length; i++) { html = html.split(`{{${i}}}`).join((match[i] || '').trim()); }
            
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:absolute;inset:0;z-index:9000;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;opacity:0;transition:0.3s;';
            
            const panel = document.createElement('div');
            panel.className = `vn-dynamic-panel-${tpl.tagId}`;
            panel.style.cssText = 'position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; box-sizing:border-box; padding:20px;';
            panel.innerHTML = html;
            
            overlay.appendChild(panel);
            overlay.onclick = () => { 
                overlay.style.opacity = '0'; 
                setTimeout(() => { 
                    overlay.remove(); 
                    if (vnCore.showVNPanel) vnCore.showVNPanel();
                    else if (vnCore.toggleUI) vnCore.toggleUI('vn');
                    vnCore.next(); 
                }, 300); 
            };
            layer.appendChild(overlay);
            requestAnimationFrame(() => overlay.style.opacity = '1');
        }
    };
    
    window.VN_DynamicParser = VN_DynamicParser;
    
    // 全自動偵測喚醒機制
    let checkCount = 0;
    const autoWakeup = setInterval(() => {
        if (window.parent?.OS_DB) {
            VN_DynamicParser.init();
            clearInterval(autoWakeup);
        }
        if (++checkCount > 20) clearInterval(autoWakeup);
    }, 500);
})();