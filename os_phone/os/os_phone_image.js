// ----------------------------------------------------------------
// [手機] os_phone_image.js
// 職責：VN 手機、微信、微博三個 app 共用的「圖片描述 → 一張佔位卡 → 一顆鈕 → 生圖」。
//   規則只有這一份：
//   ① AI 寫的圖片描述先畫成相片縮圖樣的卡片，附「展開圖片」鈕，按了才生，不自動燒額度。
//   ② 生圖走插圖桶（OS_IMAGE_MANAGER.serviceFor('scene')），1024×1024；NAI 的免費尺寸保險在那層。
//      🚨 以前走的是頭像桶。手機照片是生活照、場景照，不是單人胸像——走頭像桶等於跟著「頭像」那格的
//      接口與底詞走（她的頭像走的是立繪那套畫風，出場景會崩），而且拿不到插圖才有的「附上出場角色立繪
//      當參考圖」。她：「怎麼看都應該接插圖吧？」
//   ③ 描述裡的 ##角色名## / ##C1## 跟劇情插圖同一套展開（OS_STATE_RUNTIME.expandLooks），外觀跟頭像一致。
//   ④ 生完的網址交還給各 app 寫回自己的資料（wx 訊息／wb 貼文），下次開不再重生；VN 手機沒有資料層、只換畫面。
//   ⑤ 描述裡的 (…) 括號是給生圖看的外貌補充，顯示時剝掉。
//   ⑥ 一則寫成「給人看的描述 >> 畫圖的英文句子」兩段（見 split）：卡片上顯示前段，按下去生圖用後段。
//      沒有分隔線的（舊的、她自己打的）就一段兩用，行為跟以前一樣。
// ----------------------------------------------------------------
(function () {
    const win = window.parent || window;
    const doc = win.document;

    const CSS = `
        .os-img-card { position: relative; display: block; width: 240px; height: 150px; border-radius: 10px; overflow: hidden; cursor: default;
            background: linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 35%, rgba(0,0,0,0.12) 100%),
                        linear-gradient(160deg, #b8a08c 0%, #d8c8b4 45%, #8a7058 100%);
            box-shadow: 0 1px 4px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.08); }
        .os-img-card--fill { width: 100%; height: 100%; min-height: 120px; border-radius: 0; }
        .os-img-icon { position: absolute; top: 8px; right: 8px; width: 16px; height: 16px; opacity: 0.6; z-index: 2; }
        .os-img-icon::before { content: ''; display: block; width: 100%; height: 100%; background-size: contain; background-repeat: no-repeat; background-position: center; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));
            background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='5' width='18' height='14' rx='2'/><circle cx='8.5' cy='10' r='1.5'/><path d='M21 16l-5-5-9 9'/></svg>"); }
        .os-img-desc { position: absolute; left: 0; right: 0; bottom: 0; padding: 28px 12px 10px; font-size: 0.82rem; line-height: 1.45; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.5); word-break: break-word; z-index: 1;
            background: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.78) 100%);
            display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
        .os-img-card--fill .os-img-desc { font-size: 0.72rem; -webkit-line-clamp: 3; padding: 20px 8px 8px; }
        .os-img-gen { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 3; background: rgba(255,255,255,0.18); color: rgba(255,255,255,0.92); border: 1px solid rgba(255,255,255,0.45); border-radius: 999px; padding: 4px 12px; font-size: 0.72rem; font-weight: 500; letter-spacing: 0.5px; cursor: pointer; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); text-shadow: 0 1px 2px rgba(0,0,0,0.4); transition: background 0.2s, opacity 0.2s; opacity: 0.85; white-space: nowrap; }
        .os-img-gen:hover:not(:disabled) { background: rgba(255,255,255,0.32); opacity: 1; }
        .os-img-gen:disabled { cursor: wait; opacity: 0.65; }
        .os-img-card.os-img-loading { animation: osImgPulse 1.4s ease-in-out infinite; }
        @keyframes osImgPulse { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.18); } }
        .os-img-photo { max-width: 240px; max-height: 320px; border-radius: 8px; display: block; cursor: pointer; }
        .os-img-photo--fill { width: 100%; height: 100%; max-width: none; max-height: none; object-fit: cover; border-radius: 0; }
        .os-img-db:not([src]) { width: 160px; height: 120px; background: rgba(0,0,0,0.08); }
    `;

    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const REF = '(window.parent.OS_PHONE_IMAGE || window.OS_PHONE_IMAGE)';

    const API = {
        TYPE: 'scene',   // 設置 → 圖片 → 插圖 那一格（見檔頭 ②）
        SIZE: { width: 1024, height: 1024 },
        _handlers: {},

        injectCss: function (d) {
            const target = d || doc;
            if (!target || target.getElementById('os-phone-image-css')) return;
            const st = target.createElement('style');
            st.id = 'os-phone-image-css';
            st.textContent = CSS;
            (target.head || target.documentElement).appendChild(st);
        },

        isUrl: function (s) { return /^(https?:\/\/|data:|blob:)/i.test(String(s || '').trim()); },

        // 「給人看的描述 >> 畫圖的英文句子」：一則兩段，中間兩個大於號。
        //   分開的理由：同一段字要同時當「聊天室裡看到的那句中文」跟「送去畫圖的提示詞」，
        //   兩邊要的東西是打架的——人要短句，畫圖的要把誰、長什麼樣、在哪裡、在做什麼全講完，
        //   而且畫圖那邊吃英文句子。（她：照片還是得分開，描述和 PROMPT 分開，PROMPT 自然語言）
        //   🚨 分隔線不能用直線：直線在聊天協議裡已經是欄位分隔（轉帳、紅包、禮物、記一筆那幾條
        //      都是照直線切欄），照片描述裡再出現一根就會被當成下一欄，那一則直接散掉。
        //   ⚠️ 只寫一段的（舊訊息、她自己打的、貼網址的）照舊一段兩用，存檔不用動。
        //   ⚠️ 全形＞與》都收：它寫中文時常常打成全形。
        //   ⚠️ 只寫了一邊（前面空的或後面空的）當它沒分段，有字的那邊兩用——別讓卡片變空白。
        SPLIT_RE:   /\s*(?:[>＞》]\s*){2,}/,
        SPLIT_RE_G: /\s*(?:[>＞》]\s*){2,}/g,
        split: function (raw) {
            const t = String(raw == null ? '' : raw).trim();
            if (!t) return { desc: '', gen: '' };
            const m = t.match(this.SPLIT_RE);
            if (!m) return { desc: t, gen: t };
            const d = t.slice(0, m.index).trim();
            const g = t.slice(m.index + m[0].length).replace(this.SPLIT_RE_G, ' ').trim();   // 後段再有分隔線＝它多打的，當空白
            if (!d || !g) return { desc: d || g, gen: g || d };
            return { desc: d, gen: g };
        },

        // 只要前段（給人看的那句）。送給模型的歷史、朋友圈與記事本的目錄都用這個——
        //   後段是畫圖用的英文，餵回模型只會多花字數，還會被它當成聊天內容照抄。
        //   （同「畫面用的東西別原樣餵回模型」那條教訓）
        textOnly: function (raw) { return this.split(raw).desc; },

        // 一句話裡夾著的 [圖片: 前段 >> 後段] 收成 [圖片: 前段]：訊息是一整句、不是單獨一格描述時用。
        //   標籤名連簡體與英文別名一起認（同各 app 的圖片別名）。
        HIST_IMG_RE: /([\[［]\s*(?:图片|圖片|照片|相片|Img|Image|Photo)\s*[:：]\s*)([^\]］]*)([\]］])/gi,
        stripGenFromText: function (text) {
            const self = this;
            return String(text == null ? '' : text).replace(this.HIST_IMG_RE, function (m, head, body, tail) {
                const d = self.split(body).desc;
                return d ? (head + d + tail) : m;
            });
        },

        // 顯示用描述：先拆掉後段（畫圖用的英文），再剝掉 (外貌補充) 與 ## 井號，只留給人看的那句
        displayText: function (desc) {
            return String(this.textOnly(desc) || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/##\s*([^#]+?)\s*##/g, '$1').replace(/\s+/g, ' ').trim() || '圖片';
        },

        // 佔位卡：desc 是 AI 寫的完整描述；app 是登記過的寫回處理器名；ref 是該 app 認得的資料位置
        card: function (desc, opts) {
            const o = opts || {};
            const cls = 'os-img-card' + (o.fill ? ' os-img-card--fill' : '') + (o.cls ? ' ' + o.cls : '');
            // data-prompt 照舊放「整串」：各 app 生完寫回時拿它比對是哪一則，動了就對不上。
            // 真正送去畫圖的是 data-gen（後段）；卡片上顯示的是前段。
            const two = this.split(desc);
            return `<div class="${cls}" data-prompt="${esc(desc)}" data-gen="${esc(two.gen)}" data-app="${esc(o.app || '')}" data-ref="${esc(o.ref || '')}">`
                + `<span class="os-img-icon"></span>`
                + `<span class="os-img-desc">${esc(this.displayText(two.desc))}</span>`
                + `<button class="os-img-gen" onclick="event.stopPropagation(); ${REF}.generate(this);">展開圖片</button>`
                + `</div>`;
        },

        // 已經是網址：直接放圖
        photo: function (url, opts) {
            const o = opts || {};
            const cls = 'os-img-photo' + (o.fill ? ' os-img-photo--fill' : '') + (o.cls ? ' ' + o.cls : '');
            return `<img class="${cls}" src="${esc(url)}" onclick="event.stopPropagation(); var V = (window.parent.OS_PHOTO_VIEWER || window.OS_PHOTO_VIEWER); if (V) V.openFrom(this); else window.open(this.src);">`;
        },

        // 圖庫編號（img_／avt_ 開頭，存在 OS_DB）：先放一個空的 <img>，hydrate 再把圖貼上。
        //   她從相簿上傳的照片走這條——訊息裡只存短短一個編號，不把整張圖的編碼塞進訊息
        //   （塞進去的話，送給 AI 的聊天歷史、摘要、回傳酒館都會把那一大串當文字送出去）。
        isDbId: function (s) { return /^(img_|avt_)[A-Za-z0-9_]+$/.test(String(s || '').trim()); },
        dbPhoto: function (id, opts) {
            const o = opts || {};
            const cls = 'os-img-photo os-img-db' + (o.fill ? ' os-img-photo--fill' : '') + (o.cls ? ' ' + o.cls : '');
            return `<img class="${cls}" data-db-img="${esc(String(id).trim())}" alt="" onclick="event.stopPropagation(); if (!this.src) return; var V = (window.parent.OS_PHOTO_VIEWER || window.OS_PHOTO_VIEWER); if (V) V.openFrom(this); else window.open(this.src);">`;
        },
        hydrate: function (root) {
            const db = win.OS_DB || window.OS_DB;
            if (!db || !db.getImage || !root || !root.querySelectorAll) return;
            root.querySelectorAll('img[data-db-img]:not([data-img-done])').forEach(async function (el) {
                el.setAttribute('data-img-done', '1');
                try {
                    const url = await db.getImage(el.getAttribute('data-db-img'));
                    if (url) el.src = url; else el.removeAttribute('data-img-done');
                } catch (e) { el.removeAttribute('data-img-done'); }
            });
        },

        // 描述是網址就放圖、圖庫編號就從圖庫拿、否則放卡；三個 app 渲染時都只呼叫這一個
        render: function (desc, opts) {
            if (this.isUrl(desc)) return this.photo(desc, opts);
            if (this.isDbId(desc)) return this.dbPhoto(desc, opts);
            return this.card(desc, opts);
        },

        // 選一張照片（手機會跳相機／相簿），壓成 JPEG 回 data URL；取消回空字串。
        //   邊長壓到 1280、品質 0.82：一張手機照約 150～300KB，夠 AI 看、也不撐爆 IndexedDB 與請求。
        pickPhoto: function (opts) {
            const o = Object.assign({ maxSide: 1280, quality: 0.82 }, opts || {});
            return new Promise((resolve, reject) => {
                const input = doc.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.style.display = 'none';
                doc.body.appendChild(input);
                const done = (v) => { input.remove(); resolve(v); };
                input.onchange = () => {
                    const file = input.files && input.files[0];
                    if (!file) return done('');
                    const img = new Image();
                    const url = URL.createObjectURL(file);
                    img.onload = () => {
                        try {
                            let { width, height } = img;
                            if (width > o.maxSide || height > o.maxSide) {
                                if (width >= height) { height = Math.round(height * o.maxSide / width); width = o.maxSide; }
                                else { width = Math.round(width * o.maxSide / height); height = o.maxSide; }
                            }
                            const canvas = doc.createElement('canvas');
                            canvas.width = width; canvas.height = height;
                            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                            URL.revokeObjectURL(url);
                            done(canvas.toDataURL('image/jpeg', o.quality));
                        } catch (e) { URL.revokeObjectURL(url); input.remove(); reject(e); }
                    };
                    img.onerror = () => { URL.revokeObjectURL(url); input.remove(); reject(new Error('圖片載入失敗')); };
                    img.src = url;
                };
                // 使用者按取消不會觸發 change：視窗回焦後沒選到就收掉
                win.addEventListener('focus', function onFocus() { win.removeEventListener('focus', onFocus); setTimeout(() => { if (input.isConnected && !(input.files && input.files.length)) done(''); }, 800); });
                input.click();
            });
        },

        // 各 app 登記「生完寫回」：fn(ref, url, cardEl) 可為 async
        onDone: function (app, fn) { this._handlers[app] = fn; },

        // ##角色名## 展開：跟劇情插圖同一份登記表；runtime 不在（例如純手機殼）就原樣送
        expand: async function (prompt) {
            try {
                const rt = win.OS_STATE_RUNTIME || window.OS_STATE_RUNTIME;
                if (rt && typeof rt.expandLooks === 'function') return await rt.expandLooks(prompt);
            } catch (e) { console.warn('[PhoneImage] 角色名展開失敗，原樣送出:', e); }
            return prompt;
        },

        // ── 👁 看圖（設置 → API → 通道 最上面那格）─────────────────────
        //    off＝不送圖（預設）、main＝聊天的模型自己看、helper＝先交給看圖小模型寫成一句話。
        //    四個會讓模型看照片的地方（微信照片、頭像、記事本照片、微博照片）都先問這裡。
        visionMode: function () {
            try {
                const S = win.OS_SETTINGS || window.OS_SETTINGS;
                return (S && typeof S.getVisionMode === 'function') ? S.getVisionMode() : 'off';
            } catch (e) { return 'off'; }
        },

        // 等看圖小模型最多多久（毫秒）
        VISION_WAIT_MS: 120000,

        // 交給看圖小模型（名冊 vision 那列）：一批圖各寫一句描述，回陣列、跟送進來的順序一樣，沒寫到的是空字串。
        // about：一句話說這是哪裡的照片，讓它知道看的是什麼場合。
        describeImages: async function (urls, about) {
            const list = (urls || []).filter(Boolean);
            if (!list.length) return [];
            const S = win.OS_SETTINGS || window.OS_SETTINGS;
            const O = win.OS_API || window.OS_API;
            if (!S || typeof S.getConfigFor !== 'function' || !O || typeof O.chat !== 'function') throw new Error('設定或模型連線還沒載入');
            // 名冊沒改過也要照 vision 那列走（預設副模型），不能吃呼叫端的主模型設定
            // 最大輸出照她在名冊／通道填的走，不另外壓：看圖的模型多半會先思考，思考跟回答共用這個上限，
            // 壓小了（DeepSeek 實測給 400）整格被思考吃光、回來是空的。描述本身短，後面也會截在 300 字。
            const cfg = Object.assign({}, S.getConfigFor('vision'));
            const sys = '你負責替看不到圖片的另一個模型看照片。每張照片寫一到兩句繁體中文，只寫畫面裡看得到的東西：'
                + '有沒有人、人的樣子、穿著和動作，地點與場景，重要的物品，畫面上的文字，光線與氣氛。'
                + '不猜照片裡的人是誰，不評論，不寫其他的話。\n'
                + '格式固定，一張一行，號碼照照片送來的順序，標籤名照抄英文：\n'
                + '<photo n="號碼">描述</photo>';
            const parts = [{ type: 'text', text: (about ? about + '\n' : '') + '一共 ' + list.length + ' 張。' }]
                .concat(list.map(function (u) { return { type: 'image_url', image_url: { url: u } }; }));
            const self = this;
            const text = await new Promise(function (resolve, reject) {
                let done = false;
                // 🚨 放棄時要真的把請求斷掉：DeepSeek 不出字時會一直送空行吊著連線（實測掛到 11 分鐘），
                //    只是不等它的話那條連線還開著、可能照樣扣錢。
                const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
                // 🚨 不能在 chat 回傳後就判「沒回話」：有些連線（托管那條）chat 先回、結果晚一點才從 onFinish 來。
                //    兩分鐘都沒消息才算，別讓聊天一直卡在等它。
                const timer = setTimeout(function () {
                    bad(new Error('看圖小模型兩分鐘沒有回話'));
                    if (ctrl) { try { ctrl.abort(); } catch (e) {} }
                }, self.VISION_WAIT_MS || 120000);
                const ok = function (t) { if (!done) { done = true; clearTimeout(timer); resolve(String(t || '')); } };
                const bad = function (e) { if (!done) { done = true; clearTimeout(timer); reject(e instanceof Error ? e : new Error(String((e && e.message) || e))); } };
                Promise.resolve(O.chat([{ role: 'system', content: sys }, { role: 'user', content: parts }], cfg, null, ok, bad, { task: 'vision', label: '看圖', signal: ctrl ? ctrl.signal : undefined }))
                    .catch(bad);
            });
            const out = list.map(function () { return ''; });
            // 🚨 號碼前面的 n= 模型常常漏寫：DeepSeek 實測三次有兩次寫成 <photo 1> 或 <photo 1">，
            //    只認 n= 的話描述明明回來了卻當成沒看到。n、= 都可有可無，認的是「photo 後面第一個號碼」。
            const re = /[<＜]\s*photo\s*(?:n\s*)?[=:：]?\s*["“”＂']?(\d+)[^>＞]*[>＞]([\s\S]*?)[<＜]\s*\/\s*photo\s*[>＞]/gi;
            let m, hit = false;
            while ((m = re.exec(text))) {
                const i = parseInt(m[1], 10) - 1;
                const d = String(m[2] || '').replace(/\s+/g, ' ').trim();
                if (i >= 0 && i < out.length && d) { out[i] = d.slice(0, 300); hit = true; }
            }
            // 只有一張、它沒套標籤直接寫了描述：那段話就是描述
            if (!hit && list.length === 1 && !/[<＜]/.test(text)) out[0] = text.replace(/\s+/g, ' ').trim().slice(0, 300);
            return out;
        },

        // 看圖小模型沒看成：跟她說一聲（一分鐘內只說一次），不擋聊天
        _visionWarnAt: 0,
        visionFailed: function (e) {
            console.warn('[看圖] 看圖小模型沒看成:', e);
            if (Date.now() - this._visionWarnAt < 60000) return;
            this._visionWarnAt = Date.now();
            try {
                const A = win.AUI || window.AUI;
                if (A && A.toastr) A.toastr.warning('看圖小模型沒看成：' + ((e && e.message) || e) + '。照片這次先當成沒看過。', '看圖');
            } catch (x) {}
        },

        // 描述 → 生圖網址（卡片上的「展開圖片」和看圖器裡那顆都走這條）
        makeUrl: async function (raw) {
            const mgr = win.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER;
            if (!mgr || typeof mgr.generate !== 'function') throw new Error('OS_IMAGE_MANAGER 未載入');
            const prompt = await this.expand(raw);
            const url = await mgr.generate(prompt, this.TYPE, { width: this.SIZE.width, height: this.SIZE.height });
            if (!url) throw new Error('未取得圖片');
            await new Promise((resolve, reject) => { const pre = new Image(); pre.onload = resolve; pre.onerror = reject; pre.src = url; });
            return url;
        },

        generate: async function (btnEl) {
            const card = btnEl && btnEl.closest('.os-img-card');
            if (!card || card.dataset.gening === '1') return;
            const raw = card.dataset.prompt || '';
            if (!raw.trim()) return;
            const gen = (card.dataset.gen || '').trim() || this.split(raw).gen;   // 送去畫圖的是後段

            card.dataset.gening = '1';
            const origText = btnEl.textContent;
            btnEl.textContent = '載入中…';
            btnEl.disabled = true;
            card.classList.add('os-img-loading');

            try {
                const url = await this.makeUrl(gen);

                const fill = card.classList.contains('os-img-card--fill');
                const app = card.dataset.app || '';
                const ref = card.dataset.ref || '';
                const holder = card.ownerDocument.createElement('div');
                holder.innerHTML = this.photo(url, { fill });
                const img = holder.firstElementChild;
                card.replaceWith(img);

                const fn = this._handlers[app];
                if (typeof fn === 'function') {
                    try { await fn(ref, url, img, raw); }
                    catch (e) { console.warn('[PhoneImage] 寫回失敗(' + app + '):', e); }
                }
            } catch (e) {
                console.warn('[PhoneImage] 生圖失敗:', e);
                btnEl.textContent = '失敗，重試';
                btnEl.disabled = false;
                card.classList.remove('os-img-loading');
                delete card.dataset.gening;
                setTimeout(() => { if (btnEl.isConnected && btnEl.textContent === '失敗，重試') btnEl.textContent = origText; }, 2500);
            }
        }
    };

    win.OS_PHONE_IMAGE = API;
    if (win !== window) window.OS_PHONE_IMAGE = API;
    API.injectCss(doc);
    if (doc !== document) API.injectCss(document);
    console.log('[PhoneImage] 手機圖片共用管道已載入');
})();
