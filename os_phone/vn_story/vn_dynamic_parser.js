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
                this._buildRowOwners();
                this._injectCSS();
            }
        },
        
        // 🧵 「資料行名字 → 哪個組件」對照（init 時建一次）。
        //    AI 常常只寫組件的資料行、忘了外面那層 <Tag>…</Tag>（她看到的就是「卡沒跳出來」）。
        //    有了這張表，看到一行 [Merchant|…] 就知道它是哪個組件的，可以自己把外殼補回去。
        //    🚨 一個名字被兩個組件宣告＝認不出是誰的，寧可不認（留給原本的流程）。
        //    🚨 劇本本來就有的那些標籤一律不收：[Bg|、[BGM| 這些在正文裡本來就會單獨出現，
        //       收進來會被當成某個組件的資料行、把後面整段吃掉。
        _rowOwner: {},
        _vnOwnTags: ['char','inner','trans','exit','sys','bg','bgm','avatar','story','chapter',
                     'preface','protagonist','world','date','hp','buff','debuff','event','pay',
                     'with','foe','arrive','rename','time'],
        _buildRowOwners: function() {
            const map = {}, dup = {};
            this.activeTemplates.forEach(t => {
                if (!t.isBlock || !t.tagId || !t.demoFormat) return;
                const rows = {};
                String(t.demoFormat).split(/\r?\n/).forEach(ln => {
                    const m = String(ln).trim().match(/^\[([A-Za-z0-9_-]+)\|/);
                    if (m) rows[m[1].toLowerCase()] = 1;
                });
                Object.keys(rows).forEach(r => {
                    if (this._vnOwnTags.indexOf(r) >= 0) return;
                    if (map[r] && map[r] !== t.tagId) dup[r] = 1;
                    map[r] = t.tagId;
                });
            });
            Object.keys(dup).forEach(r => { delete map[r]; });
            this._rowOwner = map;
        },
        // 這一行是某個組件的資料行嗎？是的話把後面連著的同組資料行一起收走，補上外殼直接渲染。
        //    停在最後一行資料行、由 _renderBlock 接手，跟 vn_core 收 <system>／<BattleStart> 同一種走法。
        _adoptOrphanRows: function(firstLine, vnCore) {
            const m = firstLine.match(/^\[([A-Za-z0-9_-]+)\|/);
            if (!m) return false;
            const tag = this._rowOwner[m[1].toLowerCase()];
            if (!tag || !vnCore || !Array.isArray(vnCore.script)) return false;
            const mine = (ln) => {
                const g = String(ln || '').trim().match(/^\[([A-Za-z0-9_-]+)\|/);
                return !!(g && this._rowOwner[g[1].toLowerCase()] === tag);
            };
            const lines = [firstLine];
            let i = vnCore.index + 1, last = vnCore.index;
            while (i < vnCore.script.length) {
                const raw = String(vnCore.script[i] || '').trim();
                if (!raw) { i++; continue; }      // 中間的空行跳過，不算結束
                if (!mine(raw)) break;
                lines.push(raw); last = i; i++;
            }
            vnCore.index = last;
            console.warn('[VN 動態組件] 正文裡有 <' + tag + '> 的資料行卻沒有外層標籤，已自動補上', lines);
            this._renderBlock(tag, lines, vnCore, { orphan: true });
            return true;
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
            
            // 狀態 2.5：AI 只寫了資料行、忘了外層標籤 → 自己補外殼（見 _adoptOrphanRows）
            if (this._adoptOrphanRows(safeLine, vnCore)) return true;

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
        _buildSt: function(lines, tpl, at) {
            const imgManager = (window.parent && window.parent.OS_IMAGE_MANAGER) || window.OS_IMAGE_MANAGER;
            // 共用面板：dbSave/dbLoad 要對到「該模板對應的手機 app id」，跟桌面 app 端存進同一個桶 → 兩邊讀同一份。
            // 沒對應 app（未裝成 app／純展示）就用這個面板自己的桶 vnpanel:<tagId>（刪組件時一起清；舊制 pwa_panel 通用桶已廢）。
            const shareAppId = (tpl && tpl.id && this._tplAppMap && this._tplAppMap[tpl.id]) || ('vnpanel:' + ((tpl && tpl.tagId) || ''));
            const feedTag = (tpl && tpl.tagId) || '';
            const FEED = () => window.VN_PANEL_FEED || (window.parent && window.parent.VN_PANEL_FEED) || null;
            const TOOLS = () => window.OS_APP_TOOLS || (window.parent && window.parent.OS_APP_TOOLS) || null;
            return {
                md: function(text) {
                    if (!text) return '';
                    return String(text)
                        .replace(/\\n/g, '\n')   // AI 常寫「字面 \n」(反斜線n)當換行 → 先轉成真換行
                        .replace(new RegExp('[*][*](.+?)[*][*]', 'g'), function(_, p1){ return '<b>' + p1 + '</b>'; })
                        .replace(new RegExp('[*](.+?)[*]', 'g'),       function(_, p1){ return '<i>' + p1 + '</i>'; })
                        .replace(new RegExp('[`](.+?)[`]', 'g'),       function(_, p1){ return '<code>' + p1 + '</code>'; })
                        .replace(/\n/g, '<br>')                 // 換行→<br>(原本完全沒做→長信/多段內容全擠一起)
                        .replace(/(<br>\s*){3,}/g, '<br><br>'); // 收斂過多空行
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
                getContacts: function() {   // 微信通訊錄（當前故事）[{id,name,desc,avatar,isGroup}]，做選聯絡人清單用
                    try { const F = FEED(); return (F && F.contacts) ? F.contacts() : Promise.resolve([]); } catch (e) { return Promise.resolve([]); }
                },
                wbSave: function(title, content, keys) {   // 寫進當前世界書（同標題就改那條）
                    try { const F = FEED(); return (F && F.wbSave) ? F.wbSave(title, content, keys) : Promise.resolve(false); } catch (e) { return Promise.resolve(false); }
                },
                wbLoad: function(title) {
                    try { const F = FEED(); return (F && F.wbLoad) ? F.wbLoad(title) : Promise.resolve(''); } catch (e) { return Promise.resolve(''); }
                },
                esc: function(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
                // 提示條／確認窗走全站同一套（core/aurelia_dialog.js）
                toast: function(msg, opts) { try { return AUI.toast(msg, opts); } catch (e) {} },
                confirm: function(msg, opts) { try { return AUI.confirm(msg, opts); } catch (e) { return Promise.resolve(false); } },
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
                // 📖 資料接口（共用面板）：正文全樓層 <tagId> 區塊 + 應用裡新增的，程式合併好給面板畫；面板不自己存清單
                // 劇情裡只給演到這個區塊為止的（at），同一則後段才出場的不先亮
                feed: function(o) { try { const F = FEED(); return F ? F.feed(feedTag, Object.assign({ lines: lines, at: at || null }, o || {})) : Promise.resolve([]); } catch (e) { return Promise.resolve([]); } },
                parseText: function(text) { try { const F = FEED(); return F ? F.parseRecords(String(text == null ? '' : text).split('\n')) : []; } catch (e) { return []; } },
                user: (function() {
                    // 正確用法 await st.user()；欄位同時掛在函式上，AI 手滑寫 st.user.name 也讀得到（頭像存 DB 的在這條會是空）
                    const fn = function() { try { const F = FEED(); return F ? F.user() : Promise.resolve({ name: 'User', nickname: 'User', avatar: '', signature: '', desc: '' }); } catch (e) { return Promise.resolve({ name: 'User', nickname: 'User', avatar: '', signature: '', desc: '' }); } };
                    try { const F = FEED(); if (F && F.userSync) Object.assign(fn, F.userSync()); } catch (e) {}
                    return fn;
                })(),
                feedAdd: function(tag, fields) { try { const F = FEED(); return F ? F.add(feedTag, tag, fields) : Promise.resolve(null); } catch (e) { return Promise.resolve(null); } },
                feedUpdate: function(id, fields) { try { const F = FEED(); return F ? F.update(feedTag, id, fields) : Promise.resolve(false); } catch (e) { return Promise.resolve(false); } },
                feedRemove: function(id) { try { const F = FEED(); return F ? F.remove(feedTag, id) : Promise.resolve(false); } catch (e) { return Promise.resolve(false); } },
                // 記進手機事件簿：下次劇情接著寫時排在她那句話前面帶到一次
                toStory: function(text) { try { if (window.__IS_PREVIEW) return Promise.resolve(false); const B = window.OS_PHONE_EVENTS || (window.parent && window.parent.OS_PHONE_EVENTS); const t = String(text == null ? '' : text).trim(); return (B && B.record && t) ? B.record({ room: feedTag || '手機', line: t }) : Promise.resolve(false); } catch (e) { return Promise.resolve(false); } },
                // 手機本身的東西（OS_APP_TOOLS）；劇情裡的面板沒有桌面圖標、不會被叫醒，紅點／通知／自己動不做事
                clock: function() { try { const T = TOOLS(); return T ? T.clock() : Promise.resolve({ date: '', time: '', upcoming: [] }); } catch (e) { return Promise.resolve({ date: '', time: '', upcoming: [] }); } },
                balance: function() { try { const T = TOOLS(); return T ? T.balance() : Promise.resolve(0); } catch (e) { return Promise.resolve(0); } },
                share: function(id, title, text) { try { if (window.__IS_PREVIEW) return Promise.resolve(false); const T = TOOLS(); return T ? T.share(feedTag || '手機', id, title, text) : Promise.resolve(false); } catch (e) { return Promise.resolve(false); } },
                pay: function(amount, why) { try { if (window.__IS_PREVIEW) return Promise.resolve(false); const T = TOOLS(); return T ? T.pay(feedTag || '手機', amount, why) : Promise.resolve(false); } catch (e) { return Promise.resolve(false); } },
                badge: function() {},
                notify: function() { return Promise.resolve(false); },
                onWake: function() {},
                dbSave: async function(k, v, scope) { try { var DB = window.OS_DB || (window.parent && window.parent.OS_DB); if (!DB || !DB.saveAppData) return false; var cid = null; if (scope === 'chat') { try { var ST = window.parent && window.parent.SillyTavern; cid = (ST && ST.getCurrentChatId) ? ST.getCurrentChatId() : null; } catch (e) {} } return await DB.saveAppData(shareAppId, k, v, cid); } catch (e) { return false; } },
                dbLoad: async function(k, scope) { try { var DB = window.OS_DB || (window.parent && window.parent.OS_DB); if (!DB || !DB.getAppData) return null; var cid = null; if (scope === 'chat') { try { var ST = window.parent && window.parent.SillyTavern; cid = (ST && ST.getCurrentChatId) ? ST.getCurrentChatId() : null; } catch (e) {} } return await DB.getAppData(shareAppId, k, cid); } catch (e) { return null; } },
                setImage: async function(el, prompt, type, provider) {
                    if (!el || !prompt) return;
                    type = type || 'scene';
                    const ph = 'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(prompt);
                    el.src = ph;   // 先放佔位（生成慢/失敗都不破圖），成功再換成真圖
                    if (window.__IS_PREVIEW) return;
                    try {
                        const url = imgManager ? await imgManager.generate(prompt, type, { provider: provider, use: 'app' }) : '';
                        if (url) el.src = url;
                    } catch(e) { console.error('[VN Parser] setImage 失敗(保留佔位):', e); }
                },
                // 選一張照片（手機跳相機／相簿）→ 縮好的 data 網址；取消回空字串
                pickPhoto: async function(o) {
                    const PI = window.OS_PHONE_IMAGE || (window.parent && window.parent.OS_PHONE_IMAGE);
                    try { return (PI && PI.pickPhoto) ? await PI.pickPhoto(o) : ''; } catch (e) { return ''; }
                },
                callAI: async function(systemPrompt, opts) {
                    if (window.__IS_PREVIEW) return '（預覽模式示範回覆）';
                    try {
                        const OS = window.OS_API || (window.parent && window.parent.OS_API);
                        if (!OS || !OS.chat) throw new Error('OS_API 不可用');
                        const S = window.OS_SETTINGS || (window.parent && window.parent.OS_SETTINGS);
                        let cfg = (S && S.getConfig && S.getConfig()) || {};
                        cfg = Object.assign({}, cfg, { usePresetPrompts: false, maxTokens: Math.max(parseInt(cfg.maxTokens) || 0, 8192) });   // 思考照主模型設定走；字數上限保底 8192 同正文那條
                        // PWA：任務指令前面接背景（人設、世界書、大總結、最近劇情），跟酒館版 app 一樣；酒館裡引擎回空、照舊
                        let _ctx = '';
                        try { if (OS.appContextBlock) _ctx = await OS.appContextBlock(); } catch (e) {}
                        // 任務放 user、背景放 system（同 app_runtime）：全塞 system 到 Gemini 會整包進 systemInstruction，過濾嚴得多
                        // 背景一則 system、任務一則 user（同 app_runtime）。借正文整包那一版退掉了：太貴，而且正文的條目會叫它寫視覺小說。
                        const _msgs = [];
                        if (_ctx) _msgs.push({ role: 'system', content: _ctx + '----\n上面是背景參考；這次要做的事在下面那則訊息裡，請嚴格照它做。' });
                        // 附圖（opts.images）照設置「看圖」那格送（OS_PHONE_IMAGE.withImages）
                        const _PI = window.OS_PHONE_IMAGE || (window.parent && window.parent.OS_PHONE_IMAGE);
                        const _imgs = (opts && Array.isArray(opts.images)) ? opts.images : [];
                        _msgs.push({ role: 'user', content: (_imgs.length && _PI && _PI.withImages) ? await _PI.withImages(String(systemPrompt || ''), _imgs, '這是使用者在 app 裡附上的圖片。') : String(systemPrompt || '') });   // 是指令還是使用者在 app 裡打的話，由 app 的指令自己寫清楚，引擎不標
                        return await new Promise(function(res, rej) {
                            OS.chat(_msgs, cfg, null,
                                function(t) { res(typeof t === 'string' ? t : (t && t.message) || ''); }, rej,
                                { task: 'apps', disableTyping: true });
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

        // 👤 資料行裡的 {{user}} 換成主角現在的名字。
        //    AI 寫主角名字時繁簡老是搖擺，所以指令改成叫它寫 {{user}}（見付款畫面那張卡）。
        //    酒館在送進模型之前有沒有先把它換掉都不一定，所以這裡再換一次
        //    —— 沒換到就會有一張卡上大大寫著「{{user}}」，那本身就是壞掉的畫面。
        _meName: function() {
            const w = window.parent || window;
            try { const n = String(w.WX_ME.name() || '').trim(); if (n && n !== 'User') return n; } catch (e) {}
            try { const i = w.OS_USER.getInfo(); const n = String((i && i.name) || '').trim(); if (n && n !== 'User') return n; } catch (e) {}
            return '我';
        },
        _fillMacros: function(lines) {
            const me = this._meName();
            return (lines || []).map(ln => String(ln == null ? '' : ln).split('{{user}}').join(me));
        },

        // --- 執行區塊微型 App (核心魔法) ---
        // 這個區塊在劇本裡的位置，給共用面板只拿「演到這裡為止」的資料：
        //   正在播哪一樓、這是這一則第幾個同名區塊（數劇本裡到目前為止的開頭行；補殼的散行沒有開頭行，前面有幾個就是第幾）
        _blockAt: function(tagId, rawLines, vnCore, orphan) {
            let ord = 0;
            try {
                const re = new RegExp('^[<\\[]' + String(tagId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[>\\]]$', 'i');
                const sc = (vnCore && Array.isArray(vnCore.script)) ? vnCore.script : [];
                const end = Math.min(sc.length - 1, vnCore ? vnCore.index : -1);
                for (let i = 0; i <= end; i++) { if (re.test(String(sc[i] || '').trim())) ord++; }
                if (!orphan && ord > 0) ord--;
            } catch (e) { ord = -1; }
            return { lines: rawLines.slice(), floor: (vnCore && vnCore._currentMessageId != null) ? vnCore._currentMessageId : null, ord: ord };
        },

        _renderBlock: function(tagId, lines, vnCore, how) {
            const _at = this._blockAt(tagId, lines || [], vnCore, !!(how && how.orphan));
            lines = this._fillMacros(lines);
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
            // 「共用」面板是照手機 app 設計的（寬高吃滿、內容多了往下長），在劇情裡直接放出來沒有邊界可以撐。
            // 故劇情裡套一個手機殼：殼裡的螢幕跟手機 app 同一個盒子（寬 390、定高），面板在螢幕裡長、螢幕自己捲，
            // 跟手機桌面打開時是同一種環境。樣式在 css/vn_styles.css 的 .vn-dyn-phone*。純 VN 區塊卡維持原樣由內容自己決定尺寸。
            const _shared = tpl.panelType === '共用';
            let _mount = panel;
            if (_shared) {
                overlay.classList.add('vn-dyn-shared');
                panel.classList.add('vn-dyn-phone-app');
                const _screen = document.createElement('div');
                _screen.className = 'vn-dyn-phone-screen';
                _screen.appendChild(panel);
                _mount = document.createElement('div');
                _mount.className = 'vn-dyn-phone';
                _mount.appendChild(_screen);
            } else {
                panel.style.cssText = 'position:relative; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:auto; box-sizing:border-box; padding:20px;';
            }
            panel.innerHTML = tpl.html || '';

            overlay.appendChild(_mount);
            // 🔤 面板字體槽：模板 appearFont 蓋過組件自帶字體（留空=跟隨組件）。
            // 治繁簡混排時缺字退回系統字體、同一句有細有粗；style 掛 overlay 上，收卡即回收。
            if (tpl.appearFont) {
                const _fs = document.createElement('style');
                _fs.textContent = `.vn-dynamic-panel-${tpl.tagId}, .vn-dynamic-panel-${tpl.tagId} *{font-family:${tpl.appearFont} !important}`;
                overlay.appendChild(_fs);
            }
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

            // 跳過/繼續：背景點擊兩段式，跟 vn_core._showDomBlock 的裸卡同一套。
            // 第一下只浮出「再點一次關閉」提示（1.6 秒沒續點就淡出歸位），短窗內再點才真的收掉繼續。
            // 手殘單擊不會誤跳過，右上✕也不用了（組件沒做真正關閉鈕時，這條就是逃生口）。
            // 只認 overlay/panel 本身（暗區、空白 padding），點到卡片內容（子元素）不關 → 不影響互動卡。
            // overlay 每次新建、關閉即拆，待確認狀態跟著 overlay 走，不會帶到下一張卡。
            const _hint = document.createElement('div');
            _hint.textContent = '再點一次關閉';
            _hint.style.cssText = 'position:absolute;left:0;right:0;bottom:14px;z-index:2;text-align:center;color:rgba(180,180,180,0.45);font-size:11px;letter-spacing:1px;pointer-events:none;opacity:0;transition:opacity .25s;';
            overlay.appendChild(_hint);
            let _bgArmed = false, _bgTimer = null;
            overlay.addEventListener('click', (e) => {
                // 共用套了手機殼：螢幕裡的空白是 app 本身，只認殼外的暗區
                if (e.target !== overlay && (_shared || e.target !== panel)) return;
                if (_bgArmed) { clearTimeout(_bgTimer); _bgArmed = false; onComplete(); return; }
                _bgArmed = true;
                _hint.style.opacity = '1';
                clearTimeout(_bgTimer);
                _bgTimer = setTimeout(() => { _bgArmed = false; _hint.style.opacity = '0'; }, 1600);
            });

            // 沙盒執行 AI 生成的 JS
            try {
                let safeJs = tpl.js || '';
                // 只刪「整段最外層」的 markdown 圍欄（AI 偶爾把整份 js 包進 ```js…```），不碰程式碼內部正當的三反引號（如 /```/g 正則），否則會把 /```/g 削成 //g=註解整段壞。
                safeJs = safeJs.trim().replace(new RegExp('^\\x60\\x60\\x60(?:javascript|js|html|css)?\\s*', 'i'), '').replace(new RegExp('\\s*\\x60\\x60\\x60\\s*$'), '').trim();

                // 真正播放（非預覽）→ 走真實圖片 API；並注入 st helper（與創作室同一套 API）
                window.__IS_PREVIEW = false;
                const st = this._buildSt(lines, tpl, _at);
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
            // 🔤 面板字體槽（同 _renderBlock）：留空=跟隨組件
            if (tpl.appearFont) {
                const _fs = document.createElement('style');
                _fs.textContent = `.vn-dynamic-panel-${tpl.tagId}, .vn-dynamic-panel-${tpl.tagId} *{font-family:${tpl.appearFont} !important}`;
                overlay.appendChild(_fs);
            }
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