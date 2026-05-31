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
       系統設置：角色快取管理
       ========================================= */
    async function loadAvatarManager(listId) {
        const list = document.getElementById(listId || 'avatar-mgr-list'); if (!list) return;
        const entries = await VN_Cache.getAll('avatar_cache'); list.innerHTML = '';
        if (entries.length === 0) { list.innerHTML = '<div style="color:#666; font-size:0.85rem; padding:15px 0; text-align:center;">尚無快取紀錄（角色首次出現時自動建立）</div>'; return; }
        const clearAllBtn = document.createElement('button');
        clearAllBtn.textContent = '🗑 清空全部快取';
        clearAllBtn.style.cssText = 'display:block;width:100%;margin-bottom:12px;padding:8px;background:rgba(180,60,60,0.15);border:1px solid rgba(200,80,80,0.35);color:#e07070;border-radius:6px;cursor:pointer;font-size:12px;letter-spacing:1px;';
        clearAllBtn.onclick = async () => {
            if (!confirm(`確定要清空全部 ${entries.length} 筆頭像快取？此動作無法復原。`)) return;
            for (const e of entries) await VN_Cache.delete('avatar_cache', e.key);
            if (window.VN_PLAYER) window.VN_PLAYER._avatarMemCache = {};
            loadAvatarManager(listId);
        };
        list.appendChild(clearAllBtn);
        entries.forEach(entry => {
            const item = document.createElement('div'); item.className = 'avatar-mgr-item';
            const img = document.createElement('img'); img.className = 'avatar-preview'; img.title = entry.key;
            img.onerror = () => { img.style.opacity = '0.25'; img.title = entry.key + '（圖片失效，請重新生成）'; };
            // blob URL 在重開後無效，直接跳過不顯示
            if (entry.url && !entry.url.startsWith('blob:')) {
                img.src = entry.url;
            } else if (entry.url && entry.url.startsWith('blob:')) {
                img.style.opacity = '0.25'; img.title = entry.key + '（快取已過期，請點↺重生成）';
                // 同步清掉無效的 blob URL 記錄，下次打開面板不再顯示
                VN_Cache.delete('avatar_cache', entry.key);
            }
            const info = document.createElement('div'); info.style.cssText = 'flex:1; min-width:0;';
            const nameEl = document.createElement('div'); nameEl.className = 'avatar-mgr-name'; nameEl.textContent = entry.key;
            const textarea = document.createElement('textarea'); textarea.className = 'avatar-mgr-prompt'; textarea.value = entry.prompt || '';
            info.appendChild(nameEl); info.appendChild(textarea);
            const btnWrap = document.createElement('div'); btnWrap.style.cssText = 'display:flex; flex-direction:column; gap:8px; flex-shrink:0;';
            const btn = document.createElement('button'); btn.className = 'avatar-regen-btn'; btn.textContent = '↺ 重生成';
            btn.onclick = () => regenerateAvatarEntry(btn, entry.key, textarea, img);
            const delBtn = document.createElement('button'); delBtn.className = 'avatar-del-btn'; delBtn.textContent = '✕ 刪除';
            delBtn.onclick = () => deleteAvatarEntry(entry.key, item, list);
            btnWrap.appendChild(btn); btnWrap.appendChild(delBtn);
            item.appendChild(img); item.appendChild(info); item.appendChild(btnWrap); list.appendChild(item);
        });
    }
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

    async function loadBgManager(listId) {
        const list = document.getElementById(listId || 'bg-mgr-list'); if (!list) return;
        const entries = await VN_Cache.getAll('bg_cache'); list.innerHTML = '';
        const _empty = '<div style="color:#666; font-size:0.85rem; padding:15px 0; text-align:center;">尚無快取紀錄（場景首次生成時自動建立）</div>';
        if (entries.length === 0) { list.innerHTML = _empty; return; }
        const clearAllBtn = document.createElement('button');
        clearAllBtn.textContent = `🗑 清空全部快取（${entries.length} 筆）`;
        clearAllBtn.style.cssText = 'display:block;width:100%;margin-bottom:12px;padding:8px;background:rgba(180,60,60,0.15);border:1px solid rgba(200,80,80,0.35);color:#e07070;border-radius:6px;cursor:pointer;font-size:12px;letter-spacing:1px;';
        clearAllBtn.onclick = async () => {
            if (!confirm(`確定要清空全部 ${entries.length} 筆背景快取？此動作無法復原。`)) return;
            for (const e of entries) await VN_Cache.delete('bg_cache', e.key);
            loadBgManager(listId);
        };
        list.appendChild(clearAllBtn);
        entries.forEach(entry => {
            const item = document.createElement('div'); item.className = 'avatar-mgr-item';
            const img = document.createElement('img'); img.className = 'avatar-preview';
            img.style.cssText = 'width:96px;height:56px;object-fit:cover;border-radius:4px;flex-shrink:0;';
            img.title = entry.key;
            img.onerror = () => { img.style.opacity = '0.25'; img.title = entry.key + '（圖片失效）'; };
            if (entry.url && !entry.url.startsWith('blob:')) {
                img.src = entry.url;
            } else {
                img.style.opacity = '0.25'; img.title = entry.key + '（快取已過期）';
                VN_Cache.delete('bg_cache', entry.key);
            }
            const info = document.createElement('div'); info.style.cssText = 'flex:1; min-width:0;';
            const nameEl = document.createElement('div'); nameEl.className = 'avatar-mgr-name';
            nameEl.textContent = entry.key; nameEl.style.cssText = 'font-size:11px;color:#aaa;margin-bottom:4px;word-break:break-all;';
            const textarea = document.createElement('textarea'); textarea.className = 'avatar-mgr-prompt'; textarea.value = entry.prompt || '';
            info.appendChild(nameEl); info.appendChild(textarea);
            const btnWrap = document.createElement('div'); btnWrap.style.cssText = 'display:flex; flex-direction:column; gap:8px; flex-shrink:0;';
            const regenBtn = document.createElement('button'); regenBtn.className = 'avatar-regen-btn'; regenBtn.textContent = '↺ 重生成';
            regenBtn.onclick = () => regenerateBgEntry(regenBtn, entry.key, textarea, img);
            const delBtn = document.createElement('button'); delBtn.className = 'avatar-del-btn'; delBtn.textContent = '✕ 刪除';
            delBtn.onclick = () => deleteBgEntry(entry.key, item, list);
            btnWrap.appendChild(regenBtn); btnWrap.appendChild(delBtn);
            item.appendChild(img); item.appendChild(info); item.appendChild(btnWrap); list.appendChild(item);
        });
    }
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
                            // 走 _loadWithSceneAnalysis：若場景插圖已啟用，先送副模型分析再播放
                            window.VN_Core._showStartLoader(4000, () => window.VN_Core._loadWithSceneAnalysis(ch.content, null));
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
            // 所以手機一頁塞全部章節靠滾動看；桌機維持每頁 5 張的卡片輪播。
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            const PER = isMobile ? chapters.length : 5;
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
        loadBgManager, regenerateBgEntry, deleteBgEntry,
        openChapterPanel, closeChapterPanel
    };
})();
