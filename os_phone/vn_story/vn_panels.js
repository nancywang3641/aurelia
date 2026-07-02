// ----------------------------------------------------------------
// [檔案] vn_panels.js
// 路徑：os_phone/vn_story/vn_panels.js
// 職責：VN 視覺小說播放器 - 遊戲內設定 + 各類面板開關
//       (遊戲內設定 / 聊天背景 / 角色快取 / 背景快取 / 章節面板)
// 自 vn_core.js V8.6 拆分出獨立模組
// 依賴：VN_Cache, VN_Image（皆需先載入）；運行期使用 window.VN_Core / window.VN_PLAYER
// 暴露：window.VN_Settings, window.VN_Panels
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[PhoneOS] 載入 VN 面板模組 (vn_panels.js)...');
    const win = window.parent || window;
    const VN_Cache = window.VN_Cache;
    const VN_Image = window.VN_Image;

    /* =========================================
       🔊 iOS 音量修正：Web Audio GainNode
       iOS / iPadOS 把 HTMLMediaElement.volume 設成唯讀，JS 寫了不生效（音量只能靠機身實體鍵）。
       唯一能用程式控制音量的辦法是把音訊接進 Web Audio 的 GainNode 調增益。
       非 iOS 平台 .volume 本來就能用，這裡完全不碰，零回歸風險。
       ========================================= */
    const VN_AudioGain = (function () {
        let ctx = null;
        let hooked = false;
        const routed = new WeakMap();   // audioEl -> GainNode

        function isIOS() {
            const ua = navigator.userAgent || '';
            return /iPhone|iPad|iPod/i.test(ua) ||
                   (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1); // iPadOS 偽裝成 Mac
        }
        function _AC() { return win.AudioContext || win.webkitAudioContext; }
        function _ensureCtx() {
            if (ctx) return ctx;
            const AC = _AC();
            if (!AC) return null;
            try { ctx = new AC(); } catch (e) { return null; }
            return ctx;
        }
        // iOS 的 AudioContext 一開始是 suspended，必須在使用者手勢內 resume 才會出聲。
        function _hookUnlock() {
            if (hooked) return;
            hooked = true;
            const unlock = () => {
                const c = _ensureCtx();
                if (c && c.state === 'suspended') c.resume().catch(() => {});
            };
            const docs = (win.document === document) ? [document] : [win.document, document];
            docs.forEach(d => ['touchend', 'pointerup', 'mousedown', 'keydown'].forEach(ev =>
                d.addEventListener(ev, unlock, { passive: true })));
        }
        function _route(el) {
            if (!el) return null;
            if (routed.has(el)) return routed.get(el);
            const c = _ensureCtx();
            if (!c) return null;
            let gain;
            try {
                const src = c.createMediaElementSource(el);
                gain = c.createGain();
                src.connect(gain);
                gain.connect(c.destination);
            } catch (e) {
                console.warn('[VN_AudioGain] 接線失敗（可能跨域未開 CORS）:', e);
                return null;
            }
            routed.set(el, gain);
            return gain;
        }
        // iOS 一載入就掛手勢解鎖：使用者第一次點擊（進故事/翻頁）後 context 就 running，
        // 之後 BGM / TTS 播放才不會因 context 還 suspended 而靜音。
        if (isIOS() && _AC()) _hookUnlock();

        return {
            isIOS,
            // 設音量 0..1。非 iOS 走原生 .volume；iOS 走 GainNode。
            set: function (el, v) {
                if (!el) return;
                v = Math.max(0, Math.min(1, Number(v) || 0));
                try { el.volume = v; } catch (e) {}   // 非 iOS 有效；iOS 無效但無害
                if (!isIOS()) return;
                const gain = _route(el);
                if (gain && ctx) {
                    gain.gain.value = v;
                    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
                }
            }
        };
    })();
    win.VN_AudioGain = VN_AudioGain;

    /* =========================================
       ⚙ 遊戲內設定
       ========================================= */
    const VN_Settings = {
        defaults: { fontSize: 19, twSpeed: 30, danmuSpeed: 18, bgmVolume: 10, sfxVolume: 50, ttsVolume: 80, textColor: '#dddddd', innerColor: '#c9aaff', nameColor: '#d4af37' },
        data: {},
        load: function() { const saved = localStorage.getItem('vn_game_settings'); this.data = saved ? { ...this.defaults, ...JSON.parse(saved) } : { ...this.defaults }; this._syncUI(); this._applyAll(); },
        save: function() { localStorage.setItem('vn_game_settings', JSON.stringify(this.data)); },
        _syncUI: function() {
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            set('gs-font-size', this.data.fontSize);   setText('gs-font-size-val', this.data.fontSize + 'px');
            set('gs-tw-speed',  this.data.twSpeed);    setText('gs-tw-speed-val',  this.data.twSpeed  + 'ms');
            set('gs-danmu-speed', this.data.danmuSpeed); setText('gs-danmu-speed-val', this.data.danmuSpeed + 's');
            set('gs-bgm-vol',   this.data.bgmVolume);  setText('gs-bgm-vol-val',   this.data.bgmVolume + '%');
            set('gs-sfx-vol',   this.data.sfxVolume);  setText('gs-sfx-vol-val',   this.data.sfxVolume + '%');
            set('gs-tts-vol',   this.data.ttsVolume);  setText('gs-tts-vol-val',   this.data.ttsVolume + '%');
            set('gs-text-color',  this.data.textColor); set('gs-inner-color', this.data.innerColor); set('gs-name-color',  this.data.nameColor);
        },
        _applyAll: function() { this._applyFontSize(this.data.fontSize); this._applyTwSpeed(this.data.twSpeed); this._applyDanmuSpeed(this.data.danmuSpeed); this._applyBgmVol(this.data.bgmVolume); this._applyTtsVol(this.data.ttsVolume); this._applyColors(); },
        _applyFontSize: function(v) { document.getElementById('dialogue-text').style.fontSize = v + 'px'; },
        // VN_Core 在運行期已載入（vn_core.js 後於本檔），透過 window 取
        _applyTwSpeed: function(v) { if (window.VN_Core) window.VN_Core._twSpeed = parseInt(v); },
        _applyDanmuSpeed: function(v) { if (window.VN_Core) window.VN_Core._danmuSpeed = parseInt(v); },
        _applyBgmVol: function(v) {
            const el = document.getElementById('bgm-player');
            if (el) VN_AudioGain.set(el, parseInt(v) / 100); // iOS 走 GainNode，其他平台走原生 .volume
        },
        _applyTtsVol: function(v) {
            const vol = parseInt(v) / 100;
            // ① MiniMax 引擎：播放前讀此值
            win._vnTtsVolume = vol;
            const mmEl = win.document.getElementById('os-minimax-tts-player');
            if (mmEl) VN_AudioGain.set(mmEl, vol); // 即時更新正在播放的音量（iOS 走 GainNode）
            // ② GPT-SoVITS（VN_TTS）引擎：有自己的 config.volume，這裡一併同步並即時套到正在播的音訊
            const tts = win.VN_TTS || window.VN_TTS;
            if (tts && tts.config) {
                tts.config.volume = vol;
                if (typeof tts.save === 'function') tts.save();
                if (tts._currentAudio) VN_AudioGain.set(tts._currentAudio, vol);
            }
        },
        _applyColors: function() {
            const root = document.documentElement;
            root.style.setProperty('--text-color', this.data.textColor);
            root.style.setProperty('--em-color',   this.data.innerColor);
            root.style.setProperty('--name-color',  this.data.nameColor);
            // clear any leftover inline styles so CSS vars take effect
            const dt = document.getElementById('dialogue-text');
            const sn = document.getElementById('speaker-name');
            if (dt) dt.style.color = '';
            if (sn) sn.style.color = '';
        },
        applyFontSize: function(v) { this.data.fontSize = parseInt(v); document.getElementById('gs-font-size-val').textContent = v + 'px'; this._applyFontSize(v); this.save(); },
        applyTwSpeed: function(v) { this.data.twSpeed = parseInt(v); document.getElementById('gs-tw-speed-val').textContent = v + 'ms'; this._applyTwSpeed(v); this.save(); },
        applyDanmuSpeed: function(v) { this.data.danmuSpeed = parseInt(v); document.getElementById('gs-danmu-speed-val').textContent = v + 's'; this._applyDanmuSpeed(v); this.save(); },
        applyBgmVol: function(v) { this.data.bgmVolume = parseInt(v); document.getElementById('gs-bgm-vol-val').textContent = v + '%'; this._applyBgmVol(v); this.save(); },
        applySfxVol: function(v) { this.data.sfxVolume = parseInt(v); document.getElementById('gs-sfx-vol-val').textContent = v + '%'; this.save(); },
        applyTtsVol: function(v) { this.data.ttsVolume = parseInt(v); document.getElementById('gs-tts-vol-val').textContent = v + '%'; this._applyTtsVol(v); this.save(); },
        applyTextColor: function(v) { this.data.textColor = v; this._applyColors(); this.save(); },
        applyInnerColor: function(v) { this.data.innerColor = v; this._applyColors(); this.save(); },
        applyNameColor: function(v) { this.data.nameColor = v; this._applyColors(); this.save(); },
        resetColors: function() { this.data.textColor = this.defaults.textColor; this.data.innerColor = this.defaults.innerColor; this.data.nameColor = this.defaults.nameColor; document.getElementById('gs-text-color').value = this.data.textColor; document.getElementById('gs-inner-color').value = this.data.innerColor; document.getElementById('gs-name-color').value = this.data.nameColor; this._applyColors(); this.save(); }
    };

    function openGameSettings() { VN_Settings._syncUI(); document.getElementById('game-settings-overlay').classList.add('active'); }
    function closeGameSettings() { document.getElementById('game-settings-overlay').classList.remove('active'); }

    /* =========================================
       📱 聊天背景面板
       ========================================= */
    async function openChatBgPanel() { await _refreshChatBgThumbs(); document.getElementById('chat-bg-panel').classList.add('active'); }
    function closeChatBgPanel() { document.getElementById('chat-bg-panel').classList.remove('active'); }
    async function _refreshChatBgThumbs() {
        const grid = document.getElementById('chat-bg-grid'); const addBtn = grid.querySelector('.chat-bg-add');
        grid.querySelectorAll('.chat-bg-thumb').forEach(t => t.remove());
        const current = await VN_Cache.get('chat_bg', '_current'); const currentUrl = current ? current.url : '';
        const entries = await VN_Cache.getAll('chat_bg');
        entries.filter(e => e.key !== '_current').forEach(entry => {
            const img = document.createElement('img'); img.className = 'chat-bg-thumb'; img.src = entry.url || '';
            if (entry.url && entry.url === currentUrl) img.classList.add('selected');
            img.onclick = () => _setChatBg(entry.url);
            grid.insertBefore(img, addBtn);
        });
    }
    async function handleChatBgFile(input) {
        const file = input.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => { const dataUrl = e.target.result; const key = 'local_' + Date.now(); await VN_Cache.set('chat_bg', key, { url: dataUrl }); await _setChatBg(dataUrl); await _refreshChatBgThumbs(); };
        reader.readAsDataURL(file); input.value = '';
    }
    async function applyChatBgUrl() {
        const url = document.getElementById('chat-bg-url-input').value.trim(); if (!url) return;
        const key = 'url_' + Date.now(); await VN_Cache.set('chat_bg', key, { url }); document.getElementById('chat-bg-url-input').value = ''; await _setChatBg(url); await _refreshChatBgThumbs();
    }
    async function _setChatBg(url) {
        const img = document.getElementById('chat-bg-img'); img.src = url; img.style.display = url ? 'block' : 'none';
        document.getElementById('phone-chat').classList.toggle('has-bg', !!url); await VN_Cache.set('chat_bg', '_current', { url }); closeChatBgPanel();
    }
    async function clearChatBg() {
        const img = document.getElementById('chat-bg-img'); img.src = ''; img.style.display = 'none';
        document.getElementById('phone-chat').classList.remove('has-bg'); await VN_Cache.set('chat_bg', '_current', { url: '' }); closeChatBgPanel();
    }
    async function loadSavedChatBg() {
        const current = await VN_Cache.get('chat_bg', '_current');
        if (current && current.url) { const img = document.getElementById('chat-bg-img'); img.src = current.url; img.style.display = 'block'; document.getElementById('phone-chat').classList.add('has-bg'); }
    }

    /* =========================================
       系統設置：圖片快取管理（🌍 世界感知 · 圖片網格畫廊）
       縮圖為主、右上「⋯」選單操作；依當前世界(chatId)分組，舊圖歸「未分類」。
       ========================================= */
    const _mgrState = {};   // listId -> { world, filter }
    function _worldLabel(world, curWorld) {
        if (!world) return '📦 未分類（舊資料）';
        const short = world.length > 24 ? ('…' + world.slice(-22)) : world;
        return (world === curWorld ? '★ 當前世界 · ' : '') + short;
    }
    async function _imgToDataUrl(raw) {
        try {
            const res = await fetch(raw); const blob = await res.blob();
            return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(''); fr.readAsDataURL(blob); });
        } catch (e) { return ''; }
    }
    // 把一張 dataURL 重編成 WebP（保留透明、~80%+ 縮小；瀏覽器不支援 WebP 就放棄、不轉 JPEG 免毀透明）
    function _imgCompressDataUrl(dataUrl, quality) {
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return Promise.resolve('');
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const cv = document.createElement('canvas');
                    cv.width = img.naturalWidth || 512; cv.height = img.naturalHeight || 512;
                    cv.getContext('2d').drawImage(img, 0, 0);
                    let out = '';
                    try { out = cv.toDataURL('image/webp', quality); } catch (e) {}
                    resolve((out && out.indexOf('image/webp') !== -1) ? out : '');
                } catch (e) { resolve(''); }
            };
            img.onerror = () => resolve('');
            img.src = dataUrl;
        });
    }
    // 批次壓縮一組圖片（序列、一張一張來→峰值記憶體只有一張，不會 OOM）；已壓過/太小的略過。回 {done,saved,skipped}
    async function _vngCompressEntries(cfg, entries, btn) {
        const orig = btn ? btn.textContent : '';
        let done = 0, saved = 0, skipped = 0;
        for (const entry of entries) {
            done++;
            if (entry.compressed || !_vngHasImg(entry)) { skipped++; continue; }   // 壓過/沒圖 → 跳過(免越壓越糊)
            const full = await VN_Cache.getRaw(cfg.store, entry.key);   // 列表只有中繼資料 → 壓的時候才撈這一張的圖
            const url = full && full.url;
            if (!url || typeof url !== 'string' || !url.startsWith('data:') || url.indexOf('image/webp') !== -1) { skipped++; continue; }
            if (btn) btn.textContent = `壓縮中 ${done}/${entries.length}…`;
            const out = await _imgCompressDataUrl(url, 0.85);
            if (out && out.length < url.length * 0.92) {   // 至少省 8% 才換，免反而變大
                saved += (url.length - out.length);
                await VN_Cache.setRaw(cfg.store, entry.key, { ...full, url: out, compressed: 1 });
                entry.compressed = 1;
            } else { skipped++; }
            await new Promise(r => setTimeout(r, 0));   // 讓出主執行緒 + 讓上一張的 canvas/img 被 GC
        }
        if (btn) btn.textContent = orig;
        return { done, saved, skipped };
    }
    function _closeCardMenus() { document.querySelectorAll('.vng-menu').forEach(m => m.remove()); }
    function _vngLightbox(url) {
        const ov = document.createElement('div'); ov.className = 'vng-lightbox';
        const img = document.createElement('img'); img.src = url; ov.appendChild(img);
        ov.onclick = () => ov.remove();
        document.body.appendChild(ov);
    }
    function _vngEditModal(initial, onOk) {
        const ov = document.createElement('div'); ov.className = 'vng-modal';
        const box = document.createElement('div'); box.className = 'vng-modal-box';
        const h = document.createElement('h4'); h.textContent = '編輯 Prompt 後重生成';
        const ta = document.createElement('textarea'); ta.value = initial || '';
        const acts = document.createElement('div'); acts.className = 'vng-modal-actions';
        const cancel = document.createElement('button'); cancel.className = 'vng-btn-cancel'; cancel.textContent = '取消'; cancel.onclick = () => ov.remove();
        const ok = document.createElement('button'); ok.className = 'vng-btn-ok'; ok.textContent = '重生成'; ok.onclick = () => { const v = ta.value.trim(); ov.remove(); if (v) onOk(v); };
        acts.appendChild(cancel); acts.appendChild(ok);
        box.appendChild(h); box.appendChild(ta); box.appendChild(acts);
        ov.appendChild(box); ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
        document.body.appendChild(ov); setTimeout(() => ta.focus(), 50);
    }
    async function _vngRegen(cfg, fullKey, val, prompt) {
        // force=true：頭像走 generate() 會查記憶體快取(_urlCache)，同 prompt 會吐舊圖 → 重生必須強制繞過
        let raw;
        if (cfg.kind === 'bg') raw = await VN_Image.getBg(prompt, {});
        else if (cfg.kind === 'scene') {
            // 場景插圖：同 getScene 的尺寸設定，但帶 force 繞過記憶體快取
            const _W = window.parent || window;
            let _sw = 1024, _sh = 1024;
            try {
                const _sz = (JSON.parse(localStorage.getItem('os_image_config') || '{}').sceneGen || {}).size || '1024x1024';
                const _p = String(_sz).split('x').map(Number);
                if (_p[0] && _p[1]) { _sw = _p[0]; _sh = _p[1]; }
            } catch (e) {}
            raw = _W.OS_IMAGE_MANAGER ? await _W.OS_IMAGE_MANAGER.generate(prompt, 'scene', { width: _sw, height: _sh, force: true }) : '';
        }
        else raw = await VN_Image.getAvatar(prompt, 'Neutral', true);
        if (!raw) return '';
        const url = (await _imgToDataUrl(raw)) || raw;
        await VN_Cache.setRaw(cfg.store, fullKey, { ...val, prompt, url });   // 不再存 rawUrl(只寫不讀的死資料、徒增 DB+記憶體)
        // 已轉成持久 dataURL → 釋放暫時的 blob 與 OS_IMAGE_MANAGER 快取，免 NAI blob 永久洩漏
        try {
            if (typeof raw === 'string' && raw.startsWith('blob:') && raw !== url) URL.revokeObjectURL(raw);
            const _W = window.parent || window;
            if (cfg.kind === 'scene' && _W.OS_IMAGE_MANAGER && _W.OS_IMAGE_MANAGER.evict) _W.OS_IMAGE_MANAGER.evict('scene', prompt);
        } catch (e) {}
        return url;
    }
    function _vngCardMenu(anchor, cfg, entry, curWorld, st, rerender) {
        _closeCardMenus();
        const store = cfg.store, fullKey = entry.key, bare = VN_Cache.bareKeyOf(entry);
        // 畫廊列表只帶中繼資料（大圖不進記憶體）→ 動作當下才回 IDB 撈完整值。
        // ⚠️ 寫回絕不能用列表的 entry 展開（沒有 url，會把圖洗掉），一律以 _fullVal() 為底。
        const _fullVal = async () => { const v = await VN_Cache.getRaw(store, fullKey); return (v && typeof v === 'object') ? v : {}; };
        const hasImg = _vngHasImg(entry);
        const menu = document.createElement('div'); menu.className = 'vng-menu';
        const add = (txt, fn, danger) => { const b = document.createElement('button'); if (danger) b.className = 'danger'; b.textContent = txt; b.onclick = (e) => { e.stopPropagation(); _closeCardMenus(); fn(); }; menu.appendChild(b); };
        if (hasImg) add('🔍 查看大圖', async () => { const v = await _fullVal(); if (v.url) _vngLightbox(v.url); });
        if (!cfg.noRegen) {
            // 重生只換這一張卡的圖(_vngSetCardImg)，不呼叫 rerender() 整庫重渲染 → 不再把整庫大圖重 decode 害 OOM
            add('✏️ 編輯重生', () => _vngEditModal(entry.prompt, async (p) => {
                const card = anchor.closest('.vng-card');
                const newUrl = await _vngRegen(cfg, fullKey, await _fullVal(), p);
                if (newUrl) { entry.prompt = p; _vngSetCardImg(card, newUrl, cfg.kind); }
            }));
            add('↻ 直接重生', async () => {
                if (!entry.prompt) return;
                const card = anchor.closest('.vng-card');
                const newUrl = await _vngRegen(cfg, fullKey, await _fullVal(), entry.prompt);
                if (newUrl) _vngSetCardImg(card, newUrl, cfg.kind);
            });
            // 從頭像快取轉立繪：把這張頭像設成同名同世界的立繪（VN 顯示時最優先用立繪）
            if (cfg.kind === 'avatar' && hasImg) add('🎭 設為立繪', async () => {
                const v = await _fullVal(); if (!v.url) return;
                await VN_Cache.setRaw('sprite_cache', fullKey, { url: v.url, prompt: v.prompt || entry.prompt || '', chatId: VN_Cache.worldOf(entry), createdAt: Date.now(), fromAvatar: true });
                alert('已把「' + bare + '」設為立繪（限此世界）。\nVN 會優先用立繪顯示；要透明去背可到「立繪面板」處理。');
            });
        }
        add(entry.favorite ? '★ 取消收藏' : '☆ 加入收藏', async () => { const v = await _fullVal(); await VN_Cache.setRaw(store, fullKey, { ...v, favorite: !entry.favorite }); rerender(); });
        if (st.world === '') {
            add('→ 移到當前世界', async () => { const v = await _fullVal(); await VN_Cache.setRaw(store, VN_Cache.scopedKey(curWorld, bare), { ...v, chatId: curWorld }); await VN_Cache.deleteRaw(store, fullKey); rerender(); });
        } else if (st.world !== curWorld) {
            add('⧉ 複製到當前世界', async () => { const v = await _fullVal(); await VN_Cache.setRaw(store, VN_Cache.scopedKey(curWorld, bare), { ...v, chatId: curWorld }); alert('已複製到當前世界'); });
        }
        add('🗑 刪除', async () => {
            await VN_Cache.deleteRaw(store, fullKey);
            if (cfg.kind === 'avatar' && window.VN_PLAYER) { try { delete window.VN_PLAYER._avatarMemCache[bare]; } catch (e) {} }
            if (cfg.kind === 'scene' && window.VN_Core) { try { delete window.VN_Core._sceneMemCache[bare]; } catch (e) {} }
            rerender();
        }, true);
        document.body.appendChild(menu);
        const r = anchor.getBoundingClientRect();
        let left = r.right - menu.offsetWidth; if (left < 6) left = 6;
        let top = r.bottom + 4; if (top + menu.offsetHeight > window.innerHeight - 6) top = Math.max(6, r.top - menu.offsetHeight - 4);
        menu.style.left = left + 'px'; menu.style.top = top + 'px';
        setTimeout(() => document.addEventListener('click', _closeCardMenus, { once: true }), 0);
    }
    function _vngPh(kind) {
        const d = document.createElement('div'); d.className = 'vng-ph';
        d.textContent = kind === 'bg' ? '🌄' : (kind === 'scene' ? '🎬' : (kind === 'sprite' ? '🎭' : '👤'));
        return d;
    }
    function _vngImg(url, kind) {
        const img = document.createElement('img');
        img.loading = 'lazy'; img.decoding = 'async';   // 延後/非同步 decode → 降低同時解碼一堆大圖的記憶體尖峰
        img.src = url; img.onerror = () => img.replaceWith(_vngPh(kind));
        return img;
    }
    // 只換「這一張卡」的圖（重生用）→ 不整庫 rerender，避免整庫大圖重 decode 害 TauriTavern OOM
    function _vngSetCardImg(card, url, kind) {
        if (!card) return;
        const old = card.querySelector(':scope > img, :scope > .vng-ph');
        const ok = !!(url && !String(url).startsWith('blob:'));
        const node = ok ? _vngImg(url, kind) : _vngPh(kind);
        card._vngLoaded = ok ? 1 : 0;   // 給視口觀察器判斷「有圖可釋放」
        if (old) old.replaceWith(node); else card.insertBefore(node, card.firstChild);
    }
    // 圖片虛擬化：卡片捲進視口才從 IDB 撈「這一張」的圖、滑遠了換回佔位符釋放
    // → 整庫幾百張 base64 大圖不再同時常駐記憶體（插圖庫一開就 OOM 的真凶）
    function _vngMakeLazyIO(store, kind) {
        if (!('IntersectionObserver' in window)) return null;
        return new IntersectionObserver((recs) => {
            recs.forEach(async (rec) => {
                const card = rec.target;
                card._vngVisible = rec.isIntersecting ? 1 : 0;
                if (rec.isIntersecting) {
                    if (card._vngLoaded || card._vngLoading) return;
                    card._vngLoading = 1;
                    const v = await VN_Cache.getRaw(store, card._vngKey);
                    delete card._vngLoading;
                    if (!card.isConnected || !card._vngVisible) return;   // 撈回來時已滑走/已重渲染 → 不塞
                    if (v && v.url) _vngSetCardImg(card, v.url, kind);
                } else if (card._vngLoaded) {
                    _vngSetCardImg(card, '', kind);
                }
            });
        }, { rootMargin: '500px 0px 500px 0px' });
    }
    function _vngHasImg(entry) { return entry.hasUrl !== undefined ? !!entry.hasUrl : !!(entry.url && !String(entry.url).startsWith('blob:')); }
    function _vngCard(cfg, entry, curWorld, st, rerender) {
        const bare = VN_Cache.bareKeyOf(entry);
        const card = document.createElement('div'); card.className = 'vng-card' + ((cfg.kind === 'bg' || cfg.kind === 'scene') ? ' kind-bg' : '') + (cfg.kind === 'sprite' ? ' kind-sprite' : '');
        card.appendChild(_vngPh(cfg.kind));
        card._vngKey = entry.key;
        const hasImg = _vngHasImg(entry);
        if (hasImg) {
            if (st.io) st.io.observe(card);
            else VN_Cache.getRaw(cfg.store, entry.key).then(v => { if (v && v.url && card.isConnected) _vngSetCardImg(card, v.url, cfg.kind); });   // 沒有 IntersectionObserver 的舊環境退回逐張直載
        }
        if (entry.favorite) { const b = document.createElement('div'); b.className = 'vng-badge fav'; b.textContent = '★ 收藏'; card.appendChild(b); }
        else if (st.world === '') { const b = document.createElement('div'); b.className = 'vng-badge unclassed'; b.textContent = '未分類'; card.appendChild(b); }
        const foot = document.createElement('div'); foot.className = 'vng-foot'; foot.textContent = bare; card.appendChild(foot);
        const more = document.createElement('button'); more.className = 'vng-more'; more.textContent = '⋯';
        more.onclick = (e) => { e.stopPropagation(); _vngCardMenu(more, cfg, entry, curWorld, st, rerender); };
        card.appendChild(more);
        card.onclick = async (e) => {
            if (e.target.closest('.vng-more') || !hasImg) return;
            const v = await VN_Cache.getRaw(cfg.store, entry.key);   // 大圖看的時候才撈
            if (v && v.url) _vngLightbox(v.url);
        };
        return card;
    }
    async function _renderImgMgr(cfg) {
        const list = document.getElementById(cfg.listId); if (!list) return;
        const store = cfg.store, curWorld = VN_Cache.getCurrentWorld();
        const all = await VN_Cache.getAllMeta(store);   // 只撈中繼資料，大圖等卡片進視口才逐張載（整庫一次全載會 OOM）
        const groups = {};
        all.forEach(e => { const w = VN_Cache.worldOf(e); (groups[w] = groups[w] || []).push(e); });
        const st = _mgrState[cfg.listId] || (_mgrState[cfg.listId] = { world: curWorld, filter: 'all' });
        if (groups[st.world] === undefined && st.world !== curWorld) st.world = curWorld;
        const rerender = () => _renderImgMgr(cfg);
        if (st.io) { try { st.io.disconnect(); } catch (e) {} }
        st.io = _vngMakeLazyIO(store, cfg.kind);
        list.innerHTML = '';

        // 工具列：世界選擇 + 篩選
        const bar = document.createElement('div'); bar.className = 'vng-bar';
        const sel = document.createElement('select'); sel.className = 'vng-sel';
        const wkeys = Object.keys(groups).sort((a, b) => {
            if (a === curWorld) return -1; if (b === curWorld) return 1;
            if (a === '') return 1; if (b === '') return -1; return a < b ? -1 : 1;
        });
        if (!wkeys.includes(curWorld)) wkeys.unshift(curWorld);
        wkeys.forEach(w => { const o = document.createElement('option'); o.value = w; o.textContent = _worldLabel(w, curWorld) + ` (${(groups[w] || []).length})`; if (w === st.world) o.selected = true; sel.appendChild(o); });
        sel.onchange = () => { st.world = sel.value; rerender(); };
        bar.appendChild(sel);
        const chips = document.createElement('div'); chips.className = 'vng-chips';
        [['all', '全部'], ['fav', '收藏'], ['unused', '未收藏']].forEach(([k, label]) => {
            const c = document.createElement('button'); c.className = 'vng-chip' + (st.filter === k ? ' active' : ''); c.textContent = label;
            c.onclick = () => { st.filter = k; rerender(); }; chips.appendChild(c);
        });
        bar.appendChild(chips);
        list.appendChild(bar);

        let entries = (groups[st.world] || []).slice();
        if (st.filter === 'fav') entries = entries.filter(e => e.favorite);
        else if (st.filter === 'unused') entries = entries.filter(e => !e.favorite);
        // 收藏置頂，其餘照時間新→舊（lastUsed 寫入時自動蓋章；舊資料沒章的沉底）
        entries.sort((a, b) =>
            ((b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)) ||
            ((b.lastUsed || b.createdAt || 0) - (a.lastUsed || a.createdAt || 0)));

        if (!entries.length) {
            const em = document.createElement('div'); em.className = 'vng-empty';
            em.textContent = st.world === '' ? '未分類沒有圖片' : (st.filter !== 'all' ? '沒有符合的圖片' : '這個世界還沒有圖片（劇情出現時自動生成）');
            list.appendChild(em); return;
        }
        // 🗜️ 壓縮鈕：把目前這個世界的圖批次轉成更小的 WebP（省空間/記憶體；輕微失真、畫質幾乎不變）
        const compressBtn = document.createElement('button');
        compressBtn.className = 'vng-chip'; compressBtn.textContent = '🗜️ 壓縮';
        compressBtn.title = '把這個世界的圖片壓成更小的 WebP，省空間與記憶體（畫質幾乎看不出差別、輕微失真）';
        compressBtn.onclick = async () => {
            if (compressBtn.dataset.busy) return;
            if (!confirm('把目前這個世界的圖片壓成更小的 WebP？\n畫質幾乎看不出差別，但能省下不少空間與記憶體、也比較不會卡。\n（輕微失真壓縮，已壓過的會自動略過）')) return;
            compressBtn.dataset.busy = '1';
            try {
                const r = await _vngCompressEntries(cfg, entries, compressBtn);
                const mb = (r.saved * 0.75 / 1048576);
                const win = window.parent || window;
                const msg = `🗜️ 壓縮完成：${r.done - r.skipped} 張壓縮、${r.skipped} 張略過，約省 ${mb.toFixed(1)} MB`;
                try { if (win.toastr) win.toastr.success(msg); else alert(msg); } catch (e) { alert(msg); }
            } catch (e) { alert('壓縮失敗：' + (e.message || e)); }
            delete compressBtn.dataset.busy;
            rerender();
        };
        chips.appendChild(compressBtn);

        const grid = document.createElement('div'); grid.className = 'vng-grid';
        entries.forEach(entry => grid.appendChild(_vngCard(cfg, entry, curWorld, st, rerender)));
        list.appendChild(grid);
    }
    async function loadAvatarManager(listId) { return _renderImgMgr({ store: 'avatar_cache', listId: listId || 'avatar-mgr-list', kind: 'avatar' }); }
    async function loadSpriteManager(listId) { return _renderImgMgr({ store: 'sprite_cache', listId: listId || 'sprite-list', kind: 'sprite', noRegen: true }); }
    async function regenerateAvatarEntry(btn, name, textarea, previewImg) {
        const prompt = textarea.value.trim(); if (!prompt) return;
        const orig = btn.textContent; btn.textContent = '生成中...'; btn.disabled = true; btn.classList.add('loading');
        try {
            const raw = await VN_Image.getAvatar(prompt, 'Neutral');
            if (raw) {
                // 統一轉 dataUrl 再存 IDB，確保重開後不破圖（NAI 回傳 blob URL 不持久）
                try {
                    const fetchRes = await fetch(raw);
                    const blob = await fetchRes.blob();
                    const dataUrl = await new Promise(r => {
                        const reader = new FileReader();
                        reader.onload = () => r(reader.result);
                        reader.onerror = () => r('');
                        reader.readAsDataURL(blob);
                    });
                    const saveUrl = dataUrl || raw;
                    await VN_Cache.set('avatar_cache', name, { prompt, url: saveUrl });
                    previewImg.src = saveUrl;
                } catch(e) {
                    // fetch 失敗（已是 data: URL 等）→ 直接存
                    await VN_Cache.set('avatar_cache', name, { prompt, url: raw });
                    previewImg.src = raw;
                }
                previewImg.style.opacity = '1';
            }
        } catch(e) { console.error('[VN] regenerateAvatarEntry 失敗', e); }
        btn.textContent = orig; btn.disabled = false; btn.classList.remove('loading');
    }
    async function deleteAvatarEntry(name, itemEl, listEl) {
        await VN_Cache.delete('avatar_cache', name); itemEl.style.transition = 'opacity 0.2s'; itemEl.style.opacity = '0';
        const _empty = '<div style="color:#666; font-size:0.85rem; padding:15px 0; text-align:center;">尚無快取紀錄（角色首次出現時自動建立）</div>';
        setTimeout(() => { itemEl.remove(); const list = listEl || document.getElementById('avatar-mgr-list'); if (list && list.children.length === 0) list.innerHTML = _empty; }, 200);
    }

    async function loadBgManager(listId) { return _renderImgMgr({ store: 'bg_cache', listId: listId || 'bg-mgr-list', kind: 'bg' }); }
    async function loadSceneManager(listId) { return _renderImgMgr({ store: 'scene_cache', listId: listId || 'scene-mgr-list', kind: 'scene' }); }
    async function regenerateBgEntry(btn, key, textarea, previewImg) {
        const prompt = textarea.value.trim(); if (!prompt) return;
        const orig = btn.textContent; btn.textContent = '生成中...'; btn.disabled = true; btn.classList.add('loading');
        try {
            const meta = {};
            const raw = await VN_Image.getBg(prompt, meta);
            if (raw) {
                const savedPrompt = meta.translatedPrompt || prompt;
                try {
                    const fetchRes = await fetch(raw);
                    const blob = await fetchRes.blob();
                    const dataUrl = await new Promise(r => {
                        const reader = new FileReader();
                        reader.onload = () => r(reader.result);
                        reader.onerror = () => r('');
                        reader.readAsDataURL(blob);
                    });
                    const saveUrl = dataUrl || raw;
                    await VN_Cache.set('bg_cache', key, { prompt: savedPrompt, rawUrl: raw, url: saveUrl });
                    previewImg.src = saveUrl; previewImg.style.opacity = '1';
                    if (textarea && savedPrompt !== prompt) textarea.value = savedPrompt;
                } catch(e) {
                    await VN_Cache.set('bg_cache', key, { prompt: savedPrompt, rawUrl: raw, url: raw });
                    previewImg.src = raw; previewImg.style.opacity = '1';
                    if (textarea && savedPrompt !== prompt) textarea.value = savedPrompt;
                }
            }
        } catch(e) { console.error('[VN] regenerateBgEntry 失敗', e); }
        btn.textContent = orig; btn.disabled = false; btn.classList.remove('loading');
    }
    async function deleteBgEntry(key, itemEl, listEl) {
        await VN_Cache.delete('bg_cache', key); itemEl.style.transition = 'opacity 0.2s'; itemEl.style.opacity = '0';
        const _empty = '<div style="color:#666; font-size:0.85rem; padding:15px 0; text-align:center;">尚無快取紀錄（場景首次生成時自動建立）</div>';
        setTimeout(() => { itemEl.remove(); const list = listEl || document.getElementById('bg-mgr-list'); if (list && list.children.length === 0) list.innerHTML = _empty; }, 200);
    }

    /* =========================================
       🔥 終極解析器：嚴格要求 <content> 標籤
       ========================================= */
    async function openChapterPanel() {
        const list = document.getElementById('chapter-list');
        const subheader = document.getElementById('chapter-subheader');
        document.getElementById('chapter-overlay').classList.add('active');

        // 獨立模式：從 OS_DB 讀取本地存檔
        const isStandalone = win.OS_API?.isStandalone?.() ?? false;
        if (isStandalone) {
            list.innerHTML = '<div style="color:#aaa; text-align:center; padding: 25px; font-weight: bold;">讀取本地存檔中...</div>';
            if (subheader) subheader.textContent = '📦 來源: 本地存檔 (IndexedDB)';

            try {
                if (!win.OS_DB) throw new Error('OS_DB 未載入');
                const chapters = await win.OS_DB.getAllVnChapters();
                list.innerHTML = '';

                if (!chapters.length) {
                    list.innerHTML = '<div style="color:#ff453a; text-align:center; padding: 25px; line-height:1.6;">尚無存檔記錄。<br><span style="font-size:0.85rem; color:#aaa;">按「✨ 踏入故事」生成第一章吧！</span></div>';
                    return;
                }

                // 按 storyId 分組（沒有 storyId 的舊資料歸入「舊版資料」群組）
                const groups = {};
                chapters.forEach(ch => {
                    const gid = ch.storyId || '__legacy__';
                    if (!groups[gid]) groups[gid] = { storyTitle: ch.storyTitle || '舊版資料', storyId: ch.storyId || '', chapters: [] };
                    groups[gid].chapters.push(ch);
                });

                // 按各群組最新章節時間排序（最新的故事顯示在上面）
                const sortedGroups = Object.values(groups).sort((a, b) => {
                    const aMax = Math.max(...a.chapters.map(c => c.createdAt || 0));
                    const bMax = Math.max(...b.chapters.map(c => c.createdAt || 0));
                    return bMax - aMax;
                });

                const currentStoryId = window.VN_Core._currentStoryId || '';

                sortedGroups.forEach(group => {
                    const isActive = group.storyId && group.storyId === currentStoryId;
                    const groupId  = 'chgrp_' + Math.random().toString(36).slice(2, 8);
                    const maxTime  = Math.max(...group.chapters.map(c => c.createdAt || 0));

                    // 1. 資料夾顯示完整的 日期 + 時間 (例如：04/16 下午01:30)
                    const dateStr  = maxTime ? new Date(maxTime).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

                    // ── 資料夾標題列 ──
                    const header = document.createElement('div');
                    header.className = 'ch-story-header' + (isActive ? ' active' : '');
                    header.innerHTML = `
                        <span class="ch-story-arrow">${isActive ? '▼' : '▶'}</span>
                        <span class="ch-story-title">${group.storyTitle}</span>
                        <span class="ch-story-meta">${dateStr}${dateStr ? ' · ' : ''}${group.chapters.length} 章</span>
                        <button class="ch-story-del" title="刪除整個劇情">🗑️</button>
                    `;

                    // ── 章節容器（預設：當前故事展開，其他折疊）──
                    const body = document.createElement('div');
                    body.id = groupId;
                    body.className = 'ch-story-body';
                    body.style.display = isActive ? 'block' : 'none';

                    // 折疊 / 展開
                    header.onclick = (e) => {
                        if (e.target.classList.contains('ch-story-del')) return;
                        const open = body.style.display !== 'none';
                        body.style.display = open ? 'none' : 'block';
                        header.querySelector('.ch-story-arrow').textContent = open ? '▶' : '▼';
                    };

                    // 刪除整個故事
header.querySelector('.ch-story-del').onclick = async (e) => {
    e.stopPropagation();
    const sid = group.storyId;
    if (!confirm(`確定刪除「${group.storyTitle}」的所有章節？\n（開場白預設不受影響）`)) return;
    if (sid) {
        // 1. 刪除資料庫裡的章節
        await win.OS_DB.deleteVnChaptersByStoryId(sid);

        // ✨ 2. 新增這兩行：同步清除遺留在 localStorage 的 AVS 變數與回朔快照
        localStorage.removeItem(`avs_state_${sid}`);
        localStorage.removeItem(`avs_snap_${sid}`);

        if (sid === window.VN_Core._currentStoryId) {
            window.VN_Core._setStoryId('', '');
        }
    } else {
        // 舊版無 storyId 資料，逐條刪除
        for (const ch of group.chapters) await win.OS_DB.deleteVnChapter(ch.id);
    }
    header.remove();
    body.remove();
};

                    // 2. 章節強制按時間「升序」（舊到新：第一章在最上面）
                    group.chapters.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

                    // ── 各章節 ──
                    group.chapters.forEach(ch => {
                        const item = document.createElement('div');
                        item.className = 'ch-item';
                        // 移除單獨時間，並增加右側 padding 避免標題太長壓到刪除鈕
                        item.style.cssText = 'position:relative; padding-right: 50px;';
                        item.innerHTML = `
                            <span class="ch-name">${ch.title}</span>
                            <button style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:rgba(200,50,50,.15);border:1px solid rgba(200,50,50,.3);color:#e06060;border-radius:4px;padding:2px 8px;font-size:0.75rem;cursor:pointer;" data-id="${ch.id}">刪</button>
                        `;
                        // 點擊載入
                        item.onclick = (e) => {
                            if (e.target.dataset.id) return;
                            window.VN_Core._setStoryId(ch.storyId || '', ch.storyTitle || '');
                            if (window.VN_PLAYER?.switchPage) window.VN_PLAYER.switchPage('page-game');
                            closeChapterPanel();
                            try { window.VN_Core.earlybirdFromText(ch.content); } catch (e) {}  // 頭像早鳥：先開生
                            window.VN_Core._startWithLoader(ch.content, null);   // 載入→loading 等全部圖片→開播
                        };
                        // 刪除單章
                        item.querySelector('button[data-id]').onclick = async (e) => {
                            e.stopPropagation();
                            if (!confirm(`確定刪除「${ch.title}」？`)) return;
                            await win.OS_DB.deleteVnChapter(ch.id);
                            item.remove();
                            // 更新章數顯示
                            const remaining = body.querySelectorAll('.ch-item').length;
                            header.querySelector('.ch-story-meta').textContent = `${dateStr}${dateStr ? ' · ' : ''}${remaining} 章`;
                            // 整組都刪完了就移除資料夾
                            if (remaining === 0) { header.remove(); body.remove(); }
                        };
                        body.appendChild(item);
                    });

                    list.appendChild(header);
                    list.appendChild(body);
                });

            } catch(e) {
                console.error('[VN_PLAYER] 讀取本地存檔失敗:', e);
                list.innerHTML = `<div style="color:#ff453a; text-align:center; padding: 25px;">讀取失敗: ${e.message}</div>`;
            }
            return;
        }

        // 酒館模式：從 ST 聊天歷史讀取，渲染筆記本卡片
        list.className = 'ch-cards-container';
        list.innerHTML = '<div class="ch-empty"><div style="font-size:22px">⏳</div><div>讀取中...</div></div>';
        if (subheader) subheader.textContent = '酒館數據庫';

        const TIME_GRAD = {
            '黎明': 'linear-gradient(160deg,#c4a68a,#e8c4a0)',
            '上午': 'linear-gradient(160deg,#b8cce0,#dce8f0)',
            '下午': 'linear-gradient(160deg,#8aaac5,#b0c8de)',
            '黃昏': 'linear-gradient(160deg,#c4785a,#e8a878)',
            '晚上': 'linear-gradient(160deg,#2a3a5a,#3a4a7a)',
            '午夜': 'linear-gradient(160deg,#1a2540,#2a3560)',
            '凌晨': 'linear-gradient(160deg,#2a3a5a,#5a4a7a)',
        };
        const SEASON_GRAD = {
            '春': 'linear-gradient(160deg,#8ab898,#c0e0b0)',
            '夏': 'linear-gradient(160deg,#5a9ab5,#a0c8e0)',
            '秋': 'linear-gradient(160deg,#c47a3a,#e0a870)',
            '冬': 'linear-gradient(160deg,#8a9ab5,#c0cee0)',
        };
        function _parseBg(text) {
            const m = text.match(/\[Bg\|([^|]*)\|([^|]*)\|/);
            if (!m) return { place: '', bg: 'linear-gradient(160deg,#7a8a9a,#5a6a7a)', cacheId: '' };
            const season = m[1].trim();
            const cacheIdRaw = m[2].trim();  // 例：黃昏_卡萊爾大宅後花園
            const [time, place] = cacheIdRaw.split('_');
            const bg = TIME_GRAD[time] || SEASON_GRAD[season] || 'linear-gradient(160deg,#7a8a9a,#5a6a7a)';
            return { place: place || '', bg, cacheId: cacheIdRaw };
        }
        // 嘗試從 mem / IDB 取已保存的 bg 圖片塗到 .ch-scene
        async function _fillSceneImg(sceneEl, cacheId) {
            if (!sceneEl || !cacheId) return;
            const apply = (url) => {
                sceneEl.style.backgroundImage = `url('${url}')`;
                sceneEl.style.backgroundSize = 'cover';
                sceneEl.style.backgroundPosition = 'center';
                sceneEl.style.backgroundRepeat = 'no-repeat';
            };
            const memUrl = win.VN_Core?._bgMemCache?.[cacheId];
            if (memUrl) { apply(memUrl); return; }
            try {
                const cached = await (win.VN_Cache?.get?.('bg_cache', cacheId));
                if (cached && cached.url) apply(cached.url);
            } catch(e) {}
        }
        function _parseWorld(text) {
            const m = text.match(/\[World\|([^\]]+)\]/);
            return m ? m[1].trim() : '';
        }
        let _pages = [], _page = 0;

        function _renderPage(pg) {
            list.innerHTML = '';
            const slice = _pages[pg] || [];
            if (!slice.length) {
                list.innerHTML = '<div class="ch-empty"><div style="font-size:28px;opacity:.45">📖</div><div>此頁無章節</div></div>';
            } else {
                slice.forEach((ch, i) => {
                    const isGold = (i === 1 && slice.length > 1);
                    const { place, bg, cacheId } = _parseBg(ch.content);
                    const world = _parseWorld(ch.content);
                    const card = document.createElement('div');
                    card.className = 'ch-card' + (isGold ? ' ch-active' : '');
                    card.innerHTML = `
                        <div class="ch-tab-wrap"><div class="ch-tab"></div></div>
                        <div class="ch-chapter-label">CHAPTER</div>
                        <div class="ch-chapter-num">${String(ch.index).padStart(2, '0')}</div>
                        <div class="ch-chapter-title">${ch.title}</div>
                        <div class="ch-scene" style="background:${bg}"></div>
                        <div class="ch-card-info">
                            <div class="ch-info-row"><span class="ch-info-label">地點</span><span class="ch-info-sep">｜</span><span class="ch-info-val">${place || '—'}</span></div>
                            <div class="ch-info-row"><span class="ch-info-label">世界</span><span class="ch-info-sep">｜</span><span class="ch-info-val">${world || '—'}</span></div>
                        </div>
                        <div class="ch-card-progress">
                            <span class="ch-progress-label">已完成</span>
                            <div class="ch-progress-bar"><div class="ch-progress-fill" style="width:100%"></div></div>
                        </div>`;
                    card.onclick = () => {
                        window.VN_Core.loadScript(ch.content, ch.message_id);
                        // 回放也把這章存檔的插圖插回（生成當時已寫進 ch.scenes）；圖檔在硬碟、不重生
                        try { window.VN_SceneInsert && ch.scenes && window.VN_SceneInsert.applyChapterScenes(ch.scenes); } catch (e) {}
                        if (window.VN_PLAYER?.switchPage) window.VN_PLAYER.switchPage('page-game');
                        closeChapterPanel();
                        window.VN_Core.next();
                    };
                    list.appendChild(card);
                    // 從已保存的圖片快取（mem / IDB）拉真實場景圖
                    _fillSceneImg(card.querySelector('.ch-scene'), cacheId);
                });
            }
            const dotsEl = document.getElementById('ch-dots');
            if (dotsEl) {
                dotsEl.innerHTML = '';
                _pages.forEach((_, idx) => {
                    const dot = document.createElement('button');
                    dot.className = 'ch-dot' + (idx === pg ? ' active' : '');
                    dot.onclick = () => { _page = idx; _renderPage(idx); };
                    dotsEl.appendChild(dot);
                });
            }
            const navBtn = document.getElementById('ch-nav-btn');
            if (navBtn) navBtn.onclick = () => { _page = (_page + 1) % _pages.length; _renderPage(_page); };
            const prevBtn = document.getElementById('ch-nav-prev');
            if (prevBtn) prevBtn.onclick = () => { _page = (_page - 1 + _pages.length) % _pages.length; _renderPage(_page); };
        }

        try {
            const helper = win.TavernHelper;
            if (!helper) throw new Error("TavernHelper 未載入");

            const lastId = helper.getLastMessageId();
            const allMsgs = helper.getChatMessages(`0-${lastId}`, { role: 'assistant' });

            let chapters = [], index = 1;
            allMsgs.forEach(m => {
                const text = m.message || "";
                if (!text.includes('<content>')) return;
                let chTitle = `對話紀錄 ${index}`;
                const chMatch = text.match(/\[Chapter\|(?:\d+\|)?([^\]|]+)\]/i);
                const storyMatch = text.match(/\[Story\|([^\]]+)\]/i);
                if (chMatch) chTitle = chMatch[1].trim();
                else if (storyMatch) chTitle = storyMatch[1];
                chapters.push({ title: chTitle, content: text, index: index++, message_id: m.message_id });
            });

            if (!chapters.length) {
                list.innerHTML = '<div class="ch-empty"><div style="font-size:28px;opacity:.45">📖</div><div>未找到含 &lt;content&gt; 標籤的劇情</div></div>';
                return;
            }

            // 手機（≤768px）CSS 把左右翻頁箭頭與圓點藏了、卡片容器改垂直滾動，
            // 所以手機一頁塞全部章節靠滾動看；桌機維持每頁 4 張的卡片輪播。
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            const PER = isMobile ? chapters.length : 4;
            _pages = [];
            for (let i = 0; i < chapters.length; i += PER) _pages.push(chapters.slice(i, i + PER));
            _renderPage(0);

        } catch (e) {
            console.error('[VN_PLAYER] 讀取酒館歷史失敗:', e);
            list.innerHTML = `<div class="ch-empty"><div style="font-size:22px">❌</div><div>讀取失敗: ${e.message}</div></div>`;
        }
    }

    function closeChapterPanel() {
        document.getElementById('chapter-overlay').classList.remove('active');
        const pageGame = document.getElementById('page-game');
        if (pageGame && pageGame.classList.contains('hidden')) {
            if (window.AureliaControlCenter?.hideVnPanel) window.AureliaControlCenter.hideVnPanel();
        }
    }

    // === 暴露到全域 ===
    window.VN_Settings = VN_Settings;
    window.VN_Panels = {
        openGameSettings, closeGameSettings,
        openChatBgPanel, closeChatBgPanel, handleChatBgFile, applyChatBgUrl, clearChatBg, loadSavedChatBg,
        loadAvatarManager, regenerateAvatarEntry, deleteAvatarEntry,
        loadBgManager, regenerateBgEntry, deleteBgEntry, loadSpriteManager,
        loadSceneManager,
        openChapterPanel, closeChapterPanel
    };
})();
