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
            if (this.activeTemplates.length === 0) return false;
            const safeLine = (line || '').trim();

            // 狀態 1：正在收集區塊內容中
            // ⚠️ 必須在空行判斷之前處理！區塊內的空行（如 StellarFeed 的分節空行）
            // 若不攔截就 return false，VN 引擎會自行推進 next()，
            // 與 parser 的 setTimeout(next,20) 產生雙重推進，導致後面的行被跳過。
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
                    // 空行不加入資料（不影響 JS 解析），但仍攔截避免 VN 引擎介入
                    if (safeLine) this._blockLines.push(safeLine);
                    // 🔥 關鍵修復：使用 setTimeout (20ms) 讓出執行緒，避開 VN 引擎的防連點鎖 (isProcessing)
                    setTimeout(() => { vnCore.next(); }, 20);
                }
                return true; // 無論空行或否，一律攔截
            }

            // 非區塊模式下，空行直接放行給 VN 引擎
            if (!safeLine) return false;

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

        // st helper：與創作室預覽 _buildPreviewSt 同一套 API（md / parse / setImage）。
        // 模板 JS 是針對 (container, lines, onComplete, st) 四參數寫的；不給 st 會「st is not defined」。
        // 跟 PWA/酒館共用同一支引擎，創作室建的 tag 兩邊一致。
        _buildSt: function(lines) {
            const imgManager = (window.parent && window.parent.OS_IMAGE_MANAGER) || window.OS_IMAGE_MANAGER;
            return {
                md: function(text) {
                    if (!text) return '';
                    return String(text)
                        .replace(new RegExp('[*][*](.+?)[*][*]', 'g'), function(_, p1){ return '<b>' + p1 + '</b>'; })
                        .replace(new RegExp('[*](.+?)[*]', 'g'),       function(_, p1){ return '<i>' + p1 + '</i>'; })
                        .replace(new RegExp('[`](.+?)[`]', 'g'),       function(_, p1){ return '<code>' + p1 + '</code>'; });
                },
                parse: function() {
                    const result = {};
                    (lines || []).forEach(function(line){
                        line = (line || '').trim();
                        if (line.charAt(0) !== '[' || line.charAt(line.length-1) !== ']') return;
                        const parts = line.slice(1, -1).split('|');
                        const tag = parts[0];
                        if (!result[tag]) result[tag] = [];
                        result[tag].push(parts.slice(1));
                    });
                    return result;
                },
                setImage: async function(el, prompt, type) {
                    if (!el || !prompt) return;
                    type = type || 'scene';
                    try {
                        const url = window.__IS_PREVIEW
                            ? ('https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(prompt))
                            : (imgManager ? await imgManager.generate(prompt, type) : '');
                        if (url) el.src = url;
                    } catch(e) { console.error('[VN Parser] setImage 失敗:', e); }
                }
            };
        },

        // --- 執行區塊微型 App (核心魔法) ---
        _renderBlock: function(tagId, lines, vnCore) {
            const tpl = this.activeTemplates.find(t => t.tagId.toLowerCase() === tagId.toLowerCase());
            
            // 隱藏原生 VN 面板
            if (vnCore.hideVNPanel) vnCore.hideVNPanel();
            else if (vnCore.toggleUI) vnCore.toggleUI('none'); 
            
            // 優先掛 VN 劇情窗口容器（酒館用 #page-game，跟 _showDomBlock 一致），沒有才退 body（避免在酒館全屏蓋整個畫面）
            const layer = document.getElementById('vn-game-layer') || document.getElementById('page-game') || document.body;
            const overlay = document.createElement('div');
            overlay.className = 'vn-dyn-overlay block-mode';
            overlay.style.cssText = 'position:absolute;inset:0;z-index:9000;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;opacity:0;transition:0.3s;';
            
            const panel = document.createElement('div');
            panel.className = `vn-dynamic-panel-${tpl.tagId}`;
            panel.style.cssText = 'position:relative; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:auto; box-sizing:border-box; padding:20px;';
            panel.innerHTML = tpl.html || ''; 
            
            overlay.appendChild(panel);
            layer.appendChild(overlay);
            requestAnimationFrame(() => overlay.style.opacity = '1');

            // 定義完成回調：關閉 UI，呼叫 VN Core 繼續
            let _done = false;
            const onComplete = () => {
                if (_done) return; _done = true;
                overlay.style.opacity = '0';
                setTimeout(() => {
                    overlay.remove();
                    // 恢復原生 VN 面板
                    if (vnCore.showVNPanel) vnCore.showVNPanel();
                    else if (vnCore.toggleUI) vnCore.toggleUI('vn');
                    vnCore.next();
                }, 300);
            };

            // 跳過/繼續：點擊卡片外的暗背景或空白處 → 收掉繼續。
            // 純顯示卡（如 ChapterCard）沒自帶按鈕時的退路，對齊舊 _showDomBlock 的「點擊背景關閉」。
            // 只認 overlay/panel 本身（暗區、空白 padding），點到卡片內容（子元素）不關 → 不影響互動卡。
            overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target === panel) onComplete(); });
            const _hint = document.createElement('div');
            _hint.textContent = '點擊空白處繼續';
            _hint.style.cssText = 'position:absolute;left:0;right:0;bottom:10px;text-align:center;color:rgba(255,255,255,0.45);font-size:11px;letter-spacing:1px;pointer-events:none;z-index:1;';
            overlay.appendChild(_hint);

            // 沙盒執行 AI 生成的 JS
            try {
                let safeJs = tpl.js || '';
                // 清洗干擾標籤
                safeJs = safeJs.replace(new RegExp('\\x60\\x60\\x60(?:javascript|js|html|css)?', 'gi'), '').replace(new RegExp('\\x60\\x60\\x60', 'g'), '').trim();

                // 真正播放（非預覽）→ 走真實圖片 API；並注入 st helper（與創作室同一套 API）
                window.__IS_PREVIEW = false;
                const st = this._buildSt(lines);
                const runMicroApp = new Function('container', 'lines', 'onComplete', 'st', safeJs);
                runMicroApp(panel, lines, onComplete, st);
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
            
            // 優先掛 VN 劇情窗口容器（酒館用 #page-game，跟 _showDomBlock 一致），沒有才退 body（避免在酒館全屏蓋整個畫面）
            const layer = document.getElementById('vn-game-layer') || document.getElementById('page-game') || document.body;
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