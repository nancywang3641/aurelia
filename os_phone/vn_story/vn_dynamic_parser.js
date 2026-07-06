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
        
        _tplAppMap: {},        // 模板 id → 已安裝手機 app id（共用面板兩邊讀同一份 DB 資料用）

        init: async function() {
            // 收集狀態歸零：上一輪若 AI 忘了閉合標籤，_inBlockId 會殘留、把下一份劇本的行也吞進區塊
            //（面板不出來+劇情被跳掉還連坐下一輪）。loadScript 每次都呼叫 init → 這裡強制斷開。
            this._inBlockId = null;
            this._blockLines = [];
            const win = window.parent || window;
            if (win.OS_DB?.getAllVNTagTemplates) {
                const tpls = await win.OS_DB.getAllVNTagTemplates();
                this.activeTemplates = tpls.filter(t => t.isActive);
                // 建「模板 → 手機 app id」對照：共用面板在劇情裡(VN)與桌面(app)要存進「同一個 appId 的桶」才共用得到。
                // app 端用自己的 app id 當 appId，所以 VN 端 dbSave 也要對到「該模板對應的那個 app id」(靠 srcTplId 反查)。
                this._tplAppMap = {};
                try {
                    const apps = win.OS_DB.getAllPhoneApps ? (await win.OS_DB.getAllPhoneApps()) : [];
                    (apps || []).forEach(a => { if (a && a.srcTplId) this._tplAppMap[a.srcTplId] = a.id; });
                } catch (e) {}
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
                // 向下兼容：合標籤角括號 </XXX> 或方括號 [/XXX] 都收（AI 常被其他 tag 帶歪吐方括號）
                const idLower = this._inBlockId.toLowerCase();

                if (cleanLine === `</${idLower}>` || cleanLine === `[/${idLower}]`) {
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

            // 狀態 2：偵測是否為區塊開頭 (例如 <weibo>)；向下兼容角括號 <XXX> 與方括號 [XXX]
            const blockStartMatch = safeLine.match(/^[<\[]([a-zA-Z0-9_-]+)[>\]]\s*$/i);
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
        _buildSt: function(lines, tpl) {
            const imgManager = (window.parent && window.parent.OS_IMAGE_MANAGER) || window.OS_IMAGE_MANAGER;
            // 共用面板：dbSave/dbLoad 要對到「該模板對應的手機 app id」，跟桌面 app 端存進同一個桶 → 兩邊讀同一份。
            // 沒對應 app（未裝成 app／純展示）就退回 'pwa_panel' 通用桶。
            const shareAppId = (tpl && tpl.id && this._tplAppMap && this._tplAppMap[tpl.id]) || 'pwa_panel';
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
                    // 先把「跨多行的記錄」縫回一行：AI 寫長信/長描述常把 [Tag|…] 的正文拆成多個段落
                    // （行首開了 [Tag| 但同行沒收 ]）→ 一路收到出現「行尾 ]」為止；
                    // 段落間的空行在收集階段已被丟，改用 \n\n 重建（st.md 會渲染回段落）。
                    const stitched = [];
                    let buf = null;
                    (lines || []).forEach(function(raw){
                        const line = (raw || '').trim();
                        if (!line) return;
                        if (buf !== null) {
                            buf += '\n\n' + line;
                            if (line.charAt(line.length - 1) === ']') { stitched.push(buf); buf = null; }
                            return;
                        }
                        if (/^\[[A-Za-z0-9_一-鿿-]+\|/.test(line) && line.charAt(line.length - 1) !== ']') { buf = line; return; }
                        stitched.push(line);
                    });
                    if (buf !== null) stitched.push(buf + ']');   // AI 忘了收尾 ] → 區塊結束時幫它補上
                    stitched.forEach(function(line){
                        if (line.charAt(0) !== '[' || line.charAt(line.length-1) !== ']') return;
                        const parts = line.slice(1, -1).split('|');
                        const tag = parts[0];
                        if (!result[tag]) result[tag] = [];
                        result[tag].push(parts.slice(1));
                    });
                    return result;
                },
                getCurrentChars: function() {   // 當前聊天室出現過的角色 [{name,count}]，做角色選單用
                    var R = window.VN_READER || (window.parent && window.parent.VN_READER);
                    return (R && R.getCurrentChars) ? R.getCurrentChars() : Promise.resolve([]);
                },
                esc: function(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
                toast: function(msg, opts) {
                    try {
                        opts = opts || {};
                        var d = document.createElement('div');
                        var bg = opts.color || (opts.type === 'error' ? 'rgba(180,60,60,0.95)' : 'rgba(28,28,38,0.92)');
                        d.textContent = String(msg == null ? '' : msg);
                        d.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);max-width:80%;background:' + bg + ';color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;line-height:1.4;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,0.25);opacity:0;transition:opacity .2s;pointer-events:none;text-align:center;';
                        document.body.appendChild(d);
                        requestAnimationFrame(function(){ d.style.opacity = '1'; });
                        setTimeout(function(){ d.style.opacity = '0'; setTimeout(function(){ d.remove(); }, 250); }, opts.duration || 2000);
                    } catch (e) {}
                },
                confirm: function(msg, opts) {
                    return new Promise(function(res){
                        try {
                            opts = opts || {};
                            var ov = document.createElement('div');
                            ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;';
                            var box = document.createElement('div');
                            box.style.cssText = 'background:#fff;color:#222;border-radius:14px;padding:18px;max-width:300px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,0.3);font-size:14px;line-height:1.5;';
                            var m = document.createElement('div'); m.textContent = String(msg == null ? '' : msg); m.style.cssText = 'margin-bottom:14px;white-space:pre-wrap;';
                            var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
                            var no = document.createElement('button'); no.textContent = opts.cancelText || '取消'; no.style.cssText = 'padding:8px 14px;border:1px solid rgba(0,0,0,0.2);background:#fff;color:#333;border-radius:8px;font-size:13px;cursor:pointer;';
                            var yes = document.createElement('button'); yes.textContent = opts.okText || '確定'; yes.style.cssText = 'padding:8px 14px;border:0;background:' + (opts.danger ? '#c0392b' : '#1A1C28') + ';color:#fff;border-radius:8px;font-size:13px;cursor:pointer;';
                            no.onclick = function(){ ov.remove(); res(false); };
                            yes.onclick = function(){ ov.remove(); res(true); };
                            ov.onclick = function(e){ if (e.target === ov) { ov.remove(); res(false); } };
                            row.appendChild(no); row.appendChild(yes); box.appendChild(m); box.appendChild(row); ov.appendChild(box); document.body.appendChild(ov);
                        } catch (e) { res(false); }
                    });
                },
                loading: function(target, on, text) {
                    try {
                        var host = (typeof target === 'string') ? document.querySelector(target) : (target || document.body);
                        if (!host) return;
                        if (on === false) { if (host.__stLoad) { host.__stLoad.remove(); host.__stLoad = null; } return; }
                        if (host.__stLoad) return;
                        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
                        var ov = document.createElement('div');
                        ov.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(0,0,0,0.25);z-index:50;';
                        var sp = document.createElement('div');
                        sp.style.cssText = 'width:28px;height:28px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:__stspin .8s linear infinite;';
                        ov.appendChild(sp);
                        if (text) { var t = document.createElement('div'); t.textContent = text; t.style.cssText = 'color:#fff;font-size:12px;'; ov.appendChild(t); }
                        if (!document.getElementById('__stspin_kf')) { var k = document.createElement('style'); k.id = '__stspin_kf'; k.textContent = '@keyframes __stspin{to{transform:rotate(360deg)}}'; document.head.appendChild(k); }
                        host.__stLoad = ov; host.appendChild(ov);
                    } catch (e) {}
                },
                dbSave: async function(k, v, scope) { try { var DB = window.OS_DB || (window.parent && window.parent.OS_DB); if (!DB || !DB.saveAppData) return false; var cid = null; if (scope === 'chat') { try { var ST = window.parent && window.parent.SillyTavern; cid = (ST && ST.getCurrentChatId) ? ST.getCurrentChatId() : null; } catch (e) {} } return await DB.saveAppData(shareAppId, k, v, cid); } catch (e) { return false; } },
                dbLoad: async function(k, scope) { try { var DB = window.OS_DB || (window.parent && window.parent.OS_DB); if (!DB || !DB.getAppData) return null; var cid = null; if (scope === 'chat') { try { var ST = window.parent && window.parent.SillyTavern; cid = (ST && ST.getCurrentChatId) ? ST.getCurrentChatId() : null; } catch (e) {} } return await DB.getAppData(shareAppId, k, cid); } catch (e) { return null; } },
                setImage: async function(el, prompt, type, provider) {
                    if (!el || !prompt) return;
                    type = type || 'scene';
                    const ph = 'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(prompt);
                    el.src = ph;   // 先放佔位（生成慢/失敗都不破圖），成功再換成真圖
                    if (window.__IS_PREVIEW) return;
                    try {
                        const url = imgManager ? await imgManager.generate(prompt, type, { provider: provider }) : '';
                        if (url) el.src = url;
                    } catch(e) { console.error('[VN Parser] setImage 失敗(保留佔位):', e); }
                },
                callAI: async function(systemPrompt) {
                    if (window.__IS_PREVIEW) return '（預覽模式示範回覆）';
                    try {
                        const OS = window.OS_API || (window.parent && window.parent.OS_API);
                        if (!OS || !OS.chat) throw new Error('OS_API 不可用');
                        const S = window.OS_SETTINGS || (window.parent && window.parent.OS_SETTINGS);
                        let cfg = (S && S.getConfig && S.getConfig()) || {};
                        cfg = Object.assign({}, cfg, { usePresetPrompts: false, enableThinking: false });
                        return await new Promise(function(res, rej) {
                            OS.chat([{ role: 'system', content: String(systemPrompt || '') }], cfg, null,
                                function(t) { res(typeof t === 'string' ? t : (t && t.message) || ''); }, rej,
                                { disableTyping: true });
                        });
                    } catch (e) { console.error('[vn st.callAI]', e); return ''; }
                },
                // 讀當前劇情最近 n 條 [{name,text}]（共用面板「掃描動態／讀劇情」用，不經 AI）。
                // 劇情版 st 原本漏了這個→共用面板的 AI 鈕在劇情裡會噴 getStory is not a function（顯示「掃描失敗」）。
                // 與 app_runtime.js / 創作室預覽同實作，補齊「共用」兩邊兼容。
                getStory: function(n) {
                    try {
                        var P = window.parent || window;
                        var ST = (P && P.SillyTavern) || window.SillyTavern;
                        var c = ST && ST.getContext && ST.getContext();
                        if (!c || !Array.isArray(c.chat)) return [];
                        var R = (P && P.VN_READER) || window.VN_READER;
                        var CL = (R && R.clean) ? R.clean : function(x){ return x || ''; };
                        return c.chat.filter(function(m){ return m && !m.is_system; })
                            .slice(-(n || 30))
                            .map(function(m){ return { name: String(m.name || (m.is_user ? '我' : '')), text: CL(m.mes || '') }; })
                            .filter(function(o){ return o.text && o.text.trim(); });
                    } catch (e) { console.error('[vn st.getStory]', e); return []; }
                }
            };
        },

        // --- 執行區塊微型 App (核心魔法) ---
        _renderBlock: function(tagId, lines, vnCore) {
            const tpl = this.activeTemplates.find(t => t.tagId.toLowerCase() === tagId.toLowerCase());
            // 🔊 組件登場音效：block 組件走這條(非 _showDomBlock)，彈出即播(來源=素材音效目錄，留空不播)
            if (tpl && tpl.appearSfx && vnCore && vnCore.playSFX) { try { vnCore.playSFX(tpl.appearSfx); } catch (e) {} }

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
            // 「共用」面板 app 端設計成吃滿(width/min-height:100%)，但劇情這層 overlay 是全螢幕→會吃滿整個劇情畫面(VN 組件不建議全屏)。
            // 故劇情裡把共用面板收成「手機 app 卡片」：限寬+限高+圓角陰影、置中浮在暗背景上(app 端不經這裡、照樣全展開)。
            // 用「定高」而非 max-height，讓面板內 min-height:100%/flex:1 的內部捲動結構正常(標題固定、內容區自己捲)。純 VN 區塊卡維持原樣由內容自己決定尺寸。
            const _shared = tpl.panelType === '共用';
            panel.style.cssText = _shared
                ? 'position:relative; width:100%; max-width:440px; height:82vh; max-height:760px; display:flex; flex-direction:column; overflow:auto; box-sizing:border-box; border-radius:16px; box-shadow:0 16px 50px rgba(0,0,0,0.55);'
                : 'position:relative; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:auto; box-sizing:border-box; padding:20px;';
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
            // 防手殘誤觸：這裡都是註冊的創作室 block 組件(多半自帶關閉鈕)→不再「點背景關閉」，改右上✕當保底逃生(某些組件沒做真正關閉鈕時的退路)
            const _cx = document.createElement('div');
            _cx.textContent = '✕'; _cx.title = '關閉';
            _cx.style.cssText = 'position:absolute;top:14px;right:16px;z-index:2;width:34px;height:34px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.82);font-size:20px;line-height:1;cursor:pointer;border-radius:50%;background:rgba(0,0,0,0.4);';
            _cx.addEventListener('click', (e) => { e.stopPropagation(); onComplete(); });
            overlay.appendChild(_cx);

            // 沙盒執行 AI 生成的 JS
            try {
                let safeJs = tpl.js || '';
                // 只刪「整段最外層」的 markdown 圍欄（AI 偶爾把整份 js 包進 ```js…```），不碰程式碼內部正當的三反引號（如 /```/g 正則），否則會把 /```/g 削成 //g=註解整段壞。
                safeJs = safeJs.trim().replace(new RegExp('^\\x60\\x60\\x60(?:javascript|js|html|css)?\\s*', 'i'), '').replace(new RegExp('\\s*\\x60\\x60\\x60\\s*$'), '').trim();

                // 真正播放（非預覽）→ 走真實圖片 API；並注入 st helper（與創作室同一套 API）
                window.__IS_PREVIEW = false;
                const st = this._buildSt(lines, tpl);
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