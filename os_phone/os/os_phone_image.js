// ----------------------------------------------------------------
// [手機] os_phone_image.js
// 職責：VN 手機、微信、微博三個 app 共用的「圖片描述 → 一張佔位卡 → 一顆鈕 → 生圖」。
//   規則只有這一份：
//   ① AI 寫的圖片描述先畫成相片縮圖樣的卡片，附「展開圖片」鈕，按了才生，不自動燒額度。
//   ② 生圖走頭像桶（OS_IMAGE_MANAGER.serviceFor('char')），1024×1024；NAI 的免費尺寸保險在那層。
//   ③ 描述裡的 ##角色名## / ##C1## 跟劇情插圖同一套展開（OS_STATE_RUNTIME.expandLooks），外觀跟頭像一致。
//   ④ 生完的網址交還給各 app 寫回自己的資料（wx 訊息／wb 貼文），下次開不再重生；VN 手機沒有資料層、只換畫面。
//   ⑤ 描述裡的 (…) 括號是給生圖看的外貌補充，顯示時剝掉。
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
    `;

    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const REF = '(window.parent.OS_PHONE_IMAGE || window.OS_PHONE_IMAGE)';

    const API = {
        TYPE: 'char',
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

        // 顯示用描述：剝掉 (外貌補充) 與 ## 井號，只留給人看的那句
        displayText: function (desc) {
            return String(desc || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/##\s*([^#]+?)\s*##/g, '$1').replace(/\s+/g, ' ').trim() || '圖片';
        },

        // 佔位卡：desc 是 AI 寫的完整描述；app 是登記過的寫回處理器名；ref 是該 app 認得的資料位置
        card: function (desc, opts) {
            const o = opts || {};
            const cls = 'os-img-card' + (o.fill ? ' os-img-card--fill' : '') + (o.cls ? ' ' + o.cls : '');
            return `<div class="${cls}" data-prompt="${esc(desc)}" data-app="${esc(o.app || '')}" data-ref="${esc(o.ref || '')}">`
                + `<span class="os-img-icon"></span>`
                + `<span class="os-img-desc">${esc(this.displayText(desc))}</span>`
                + `<button class="os-img-gen" onclick="event.stopPropagation(); ${REF}.generate(this);">展開圖片</button>`
                + `</div>`;
        },

        // 已經是網址：直接放圖
        photo: function (url, opts) {
            const o = opts || {};
            const cls = 'os-img-photo' + (o.fill ? ' os-img-photo--fill' : '') + (o.cls ? ' ' + o.cls : '');
            return `<img class="${cls}" src="${esc(url)}" onclick="event.stopPropagation(); window.open(this.src)">`;
        },

        // 描述是網址就放圖、否則放卡；三個 app 渲染時都只呼叫這一個
        render: function (desc, opts) {
            return this.isUrl(desc) ? this.photo(desc, opts) : this.card(desc, opts);
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

        generate: async function (btnEl) {
            const card = btnEl && btnEl.closest('.os-img-card');
            if (!card || card.dataset.gening === '1') return;
            const raw = card.dataset.prompt || '';
            if (!raw.trim()) return;

            card.dataset.gening = '1';
            const origText = btnEl.textContent;
            btnEl.textContent = '載入中…';
            btnEl.disabled = true;
            card.classList.add('os-img-loading');

            try {
                const mgr = win.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER;
                if (!mgr || typeof mgr.generate !== 'function') throw new Error('OS_IMAGE_MANAGER 未載入');
                const prompt = await this.expand(raw);
                const url = await mgr.generate(prompt, this.TYPE, { width: this.SIZE.width, height: this.SIZE.height });
                if (!url) throw new Error('未取得圖片');
                await new Promise((resolve, reject) => { const pre = new Image(); pre.onload = resolve; pre.onerror = reject; pre.src = url; });

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
