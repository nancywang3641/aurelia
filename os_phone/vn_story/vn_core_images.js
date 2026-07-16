// ----------------------------------------------------------------
// [檔案] vn_core_images.js
// 路徑：os_phone/vn_story/vn_core_images.js
// 職責：VN 背景/場景CG/道具 AI 生圖管線（自 vn_core.js 拆出）
//       含 fallback 圖庫(Pixabay/LoremFlickr)、預熱(prewarm)、mem+IDB 快取、in-flight 去重
// ⚠️ 方法搬家、Object.assign 掛回同一顆 VN_Core（this 語義不變）；必須在 vn_core.js 之後載入
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const VN = window.VN_Core;
    if (!VN) { console.warn('[VN_CoreImages] VN_Core 不存在，生圖管線未掛載（vn_core.js 必須先載入）'); return; }

    // 與 vn_core.js 同源的 short-name 別名（vn_cache 必須在本檔之前載入）
    const VN_Cache = window.VN_Cache;
    const VN_Image = window.VN_Image;

    Object.assign(VN, {
        _toDataUrl: function(url) {
            return new Promise((res) => {
                if (!url) return res('');
                if (!url.startsWith('blob:')) return res(url); 
                fetch(url)
                    .then(r => r.blob())
                    .then(blob => {
                        const reader = new FileReader();
                        reader.onload  = () => res(reader.result);
                        reader.onerror = () => res('');
                        reader.readAsDataURL(blob);
                    })
                    .catch(() => res(''));
            });
        },

        _toObjectUrl: async function(source) {
            if (!source) return '';
            try {
                const res = await fetch(source);
                const blob = await res.blob();
                return URL.createObjectURL(blob);
            } catch(e) { return ''; }
        },

        // 測試用：console 跑 VN_Core.testFallback('描述', '黎明_候機大廳') 直接套一張 fallback 圖
        // 走完整 chain：Pixabay → LoremFlickr，回報哪個接住
        testFallback: async function(prompt, cacheId) {
            prompt = prompt || 'cafe interior daylight';
            console.log(`[VN] testFallback prompt: "${prompt}", cacheId: "${cacheId || '(無)'}"`);
            let url = await this._pixabayFallback(prompt, cacheId || '');
            let source = 'Pixabay';
            if (!url) { url = await this._loremFlickrFallback(prompt, cacheId || ''); source = 'LoremFlickr'; }
            if (!url) { console.error('[VN] testFallback: 兩個 fallback 都失敗'); return null; }
            console.log(`[VN] ✓ ${source} 接住:`, url);
            const bg = document.getElementById('game-bg');
            if (bg) this._setBgImage(bg, url + '#fallback');
            else console.warn('[VN] #game-bg 不存在，先進 VN 場景再測');
            return url;
        },

        // 統一 BG 套用：URL hash 標記 fallback 等級
        // #fallback        → 中度磨砂（Pixabay，圖經審核可看清場景）
        // #fallback-strong → 重度磨砂（LoremFlickr，圖未審核糊到只剩色塊氛圍）
        _setBgImage: function(el, url) {
            if (!el) return;
            if (url) {
                el.style.backgroundImage = `url('${url}')`;
                el.classList.toggle('bg-fallback', String(url).includes('#fallback'));
            } else {
                el.style.backgroundImage = 'none';
                el.classList.remove('bg-fallback');
            }
        },

        // 提取 fallback 用的英文關鍵字（cacheId 地點 → 翻譯 → 過濾 AI 修飾詞）
        _buildFallbackKeywords: async function(prompt, cacheId) {
            const pureTranslate = async (text) => {
                if (!text || !/[一-龥]/.test(text)) return text;
                if (win.TranslationManager?.translate) {
                    try { return await win.TranslationManager.translate(text, 'zh', 'en'); } catch (e) {}
                }
                return text;
            };

            let searchSrc = '';
            if (cacheId) {
                const idx = String(cacheId).indexOf('_');
                const place = idx >= 0 ? String(cacheId).slice(idx + 1) : String(cacheId);
                searchSrc = place.replace(/_/g, ' ').trim();
                searchSrc = await pureTranslate(searchSrc);
            }
            if (!searchSrc || !/[a-zA-Z]/.test(searchSrc)) {
                searchSrc = await pureTranslate(String(prompt || '').slice(0, 60));
            }

            const STOPWORDS = new Set([
                'photorealistic','realistic','photo','photography','cinematic','dramatic',
                'high','quality','best','detailed','intricate','masterpiece',
                '4k','8k','hd','uhd','ultra','sharp','focus','rendering','render',
                'illustration','painting','artwork','digital','art'
            ]);
            return String(searchSrc || '')
                .replace(/[^a-zA-Z0-9 ]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 2 && !STOPWORDS.has(w.toLowerCase()))
                .slice(0, 3);
        },

        // Pixabay 退路圖庫（高品質，需要 API key）
        _pixabayFallback: async function(prompt, cacheId) {
            const cfg = (win.OS_SETTINGS?.getImageConfig?.()) || {};
            const key = cfg.pixabayKey;
            if (!key) return '';

            const kwArr = await this._buildFallbackKeywords(prompt, cacheId);
            if (!kwArr.length) { console.warn('[VN] Pixabay: 沒英文關鍵字'); return ''; }
            const keywords = kwArr.join('+');
            try {
                const url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(keywords)}&image_type=photo&orientation=horizontal&per_page=20&safesearch=true`;
                const res = await fetch(url);
                const json = await res.json();
                if (!json.hits || !json.hits.length) { console.warn('[VN] Pixabay 無匹配:', keywords); return ''; }
                const pick = json.hits[Math.floor(Math.random() * json.hits.length)];
                console.log(`[VN] Pixabay fallback hit: "${keywords}" → ${pick.tags || ''}`);
                return pick.largeImageURL || pick.webformatURL || '';
            } catch (e) {
                console.error('[VN] Pixabay fallback 失敗:', e);
                return '';
            }
        },

        // LoremFlickr 退路圖庫（免註冊，URL 直接帶關鍵字，最後一搏）
        _loremFlickrFallback: async function(prompt, cacheId) {
            const kwArr = await this._buildFallbackKeywords(prompt, cacheId);
            if (!kwArr.length) { console.warn('[VN] LoremFlickr: 沒英文關鍵字'); return ''; }
            // LoremFlickr 用逗號分隔多個關鍵字
            const tags = kwArr.join(',');
            const url = `https://loremflickr.com/1280/720/${encodeURIComponent(tags)}`;
            console.log(`[VN] LoremFlickr fallback: "${tags}" → ${url}`);
            return url;
        },

        // [Bg|季节|时间状态_设施名|描述...] → 生圖提示詞 = 第二格(设施名,底線換空格) + 第三格(描述)。
        // 第二格身兼兩用：既當快取ID/場景標籤、也進提示詞（補上第三格沒有的具體设施名）。
        // 舊的單格 [Bg|描述] 維持只用該格。live 與 prewarm 共用此函式，確保提示詞一致、快取不錯位。
        _bgGenPrompt: function(parts) {
            const label = (parts.length >= 3 && parts[1]) ? String(parts[1]).replace(/_/g, ' ') : '';
            const desc  = parts[2] || (parts.length === 1 ? parts[0] : '');
            return [label, desc].filter(Boolean).join(', ') || null;
        },

        // [Item|名稱|描述] → 生圖提示詞 = 名稱 + 描述（描述沒有就只用名稱）。名稱仍兼任快取ID。
        _itemGenPrompt: function(name, desc) {
            return [name, desc].filter(Boolean).join(', ');
        },

        // 去重包裝：同一 cacheId 若已在生成中(預熱/現場)，共用同一個 promise，
        // 避免兩邊各生一張(競態) → 顯示一張、快取被另一張覆蓋 → 重開變不同圖。
        _safeFetchBg: function(cacheId, prompt) {
            if (this._bgMemCache[cacheId]) return Promise.resolve(this._bgMemCache[cacheId]);
            if (this._bgInflight[cacheId]) return this._bgInflight[cacheId];
            if (this._bgFailed[cacheId]) return Promise.resolve('');   // 這個背景剛生失敗過 → 不自動重打(同場景的預熱+現場序列各打一次=白燒)；切新背景是新 cacheId、重整重置
            const self = this;
            const p = this._doFetchBg(cacheId, prompt);
            this._bgInflight[cacheId] = p;
            p.then(function (url) {
                if (!url) self._bgFailed[cacheId] = Date.now();   // 回空＝失敗 → 記下、同 cacheId 不再自動觸發
            }, function () {
                self._bgFailed[cacheId] = Date.now();
            }).then(function () { delete self._bgInflight[cacheId]; });
            return p;
        },
        _doFetchBg: async function(cacheId, prompt) {
            // 🆘 fallback(退路真實圖+磨砂)是「主來源掛掉時的應急」、不是正式背景：記憶體/IDB 都不吃它的快取，
            //    一律往下重新走主來源 → Pollinations 恢復 / 切 comfyui 後就能拿正式清晰圖(治「切了來源還是糊、舊糊圖卡快取」)。
            if (this._bgMemCache[cacheId] && !String(this._bgMemCache[cacheId]).includes('#fallback')) return this._bgMemCache[cacheId];
            const cached = await VN_Cache.get('bg_cache', cacheId);
            if (cached && cached.fallback) {
                try { await VN_Cache.delete('bg_cache', cacheId); } catch (e) {}   // 清掉殘留的應急糊圖快取，下面重生
            } else if (cached && cached.url) {
                if (cached.url.startsWith('blob:')) {
                    await VN_Cache.delete('bg_cache', cacheId);
                } else {
                    const objUrl = await this._toObjectUrl(cached.url);
                    this._bgMemCache[cacheId] = objUrl || cached.url;   // 正式圖，無 #fallback 磨砂
                    this._preloadImg(cacheId, this._bgMemCache[cacheId]);
                    return this._bgMemCache[cacheId];
                }
            }
            const meta = {};
            // 強制 fallback 測試模式
            let forceFallback = false;
            try { forceFallback = JSON.parse(localStorage.getItem('os_image_config') || '{}').fallbackForce === true; } catch(e) {}

            // 背景主來源 + timeout。⚠️ timeout 語義隨來源天差地遠：
            //   Pollinations：generateBackgroundAsync 只「組 URL」瞬間回(下載那刻才生圖)→ 12 秒夠且必要(擋組 URL 卡住)。
            //   comfyui_direct/novelai/tavern_sd：是「await 等本機/直連真生完才回」→ 本機生 1024×768 背景常 >12 秒，
            //     套 12 秒會把還在生的圖砍掉、誤掉進 Pixabay 真實圖 fallback(+#fallback 玻璃磨砂)＝「comfyui 背景被套玻璃遮罩」真凶。
            //   → 非 Pollinations 來源放寬到 150 秒(跟頭像/場景逾時同量級)，別再誤砍本機生圖。
            const _IM = win.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER || (window.parent && window.parent.OS_IMAGE_MANAGER);
            let _bgSvc = 'pollinations';
            try { if (_IM && typeof _IM.serviceFor === 'function') _bgSvc = _IM.serviceFor('bg') || 'pollinations'; } catch (e) {}
            const _bgTimeoutMs = (_bgSvc === 'pollinations') ? 12000 : 150000;
            let raw = '';
            if (!forceFallback) {
                try {
                    raw = await Promise.race([
                        VN_Image.getBg(prompt, meta),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('bg timeout ' + _bgTimeoutMs + 'ms / ' + _bgSvc)), _bgTimeoutMs))
                    ]);
                } catch (e) {
                    console.warn('[VN] 背景主來源逾時/失敗，啟用 Pixabay fallback:', e.message);
                    raw = '';
                }
            }

            // Fallback chain：Pixabay (有 key) → LoremFlickr (永遠 work)
            let isFallback = false;
            if (!raw) {
                raw = await this._pixabayFallback(prompt, cacheId);
                if (raw) { isFallback = true; console.log('[VN] fallback source: Pixabay'); }
            }
            if (!raw) {
                raw = await this._loremFlickrFallback(prompt, cacheId);
                if (raw) { isFallback = true; console.log('[VN] fallback source: LoremFlickr'); }
            }
            if (!raw) return '';

            const savedPrompt = meta.translatedPrompt || prompt;
            try {
                // 下載逾時保險：Pollinations 是「下載那一刻才真正生圖」，雲端掛了這格會永遠 pending
                // （黑窗 ComfyUI 閒著、進度卡 4/5 的那種）→ 90 秒放棄，改走備援
                const _ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                const _timer = _ac ? setTimeout(() => { try { _ac.abort(); } catch (e) {} }, 90000) : null;
                let fetchRes;
                try {
                    fetchRes = await fetch(raw, _ac ? { signal: _ac.signal } : undefined);
                } finally {
                    if (_timer) clearTimeout(_timer);
                }
                const blob = await fetchRes.blob();
                const objUrl = URL.createObjectURL(blob);
                const dataUrl = await new Promise(r => {
                    const reader = new FileReader();
                    reader.onload = () => r(reader.result);
                    reader.onerror = () => r('');
                    reader.readAsDataURL(blob);
                });
                const tagged = isFallback ? objUrl + '#fallback' : objUrl;
                this._bgMemCache[cacheId] = tagged;
                this._preloadImg(cacheId, tagged);
                if (dataUrl) await VN_Cache.set('bg_cache', cacheId, { prompt: savedPrompt, rawUrl: raw, url: dataUrl, fallback: isFallback });
                return tagged;
            } catch(e) {
                const _aborted = e && e.name === 'AbortError';
                if (_aborted) console.warn('[VN] 背景下載逾時(90秒)，改走備援:', cacheId);
                // 主來源失敗且還沒用過備援 → 補一輪 Pixabay → LoremFlickr，別讓進度永遠缺一格
                if (!isFallback) {
                    try {
                        let fb = await this._pixabayFallback(prompt, cacheId);
                        if (!fb) fb = await this._loremFlickrFallback(prompt, cacheId);
                        if (fb) {
                            const tagged2 = fb.includes('#') ? fb : fb + '#fallback';
                            this._bgMemCache[cacheId] = tagged2;
                            this._preloadImg(cacheId, tagged2);
                            console.log('[VN] 背景備援接手:', cacheId);
                            return tagged2;
                        }
                    } catch (e2) {}
                }
                if (_aborted) return '';   // 雲端死透：放掉這張，別再沿同一條死路重試
                const url = await this._toDataUrl(raw);
                if (url) {
                    const tagged = isFallback ? url + '#fallback' : url;
                    this._bgMemCache[cacheId] = tagged;
                    this._preloadImg(cacheId, tagged);
                    await VN_Cache.set('bg_cache', cacheId, { prompt: savedPrompt, rawUrl: raw, url, fallback: isFallback });
                }
                return this._bgMemCache[cacheId] || '';
            }
        },

        _preloadImg: function(cacheId, url) {
            if (!url || this._decodedImgs[cacheId]) return;
            const img = new Image();
            img.src = url;
            if (typeof img.decode === 'function') {
                img.decode().catch(() => {}); 
            }
            this._decodedImgs[cacheId] = img; 
        },

        // 判斷 tag 是不是「動態標籤區塊」（創作室 isBlock 模板，如 <ChapterCard>）
        _isDynBlockTag: function(tag) {
            const dp = window.VN_DynamicParser;
            if (!dp || !dp.activeTemplates || !tag) return false;
            const t = tag.toLowerCase();
            return dp.activeTemplates.some(x => x.isBlock && x.tagId && x.tagId.toLowerCase() === t);
        },
        // 回傳 this.script 中「不在動態標籤區塊內」的行。
        // 動態區塊（如 <ChapterCard>）內容是「卡片資料」，裡面的 [Bg|]/[Item|]/[Scene|] 不是 VN 指令；
        // prewarm 預掃必須跳過，否則會把卡片資料當真背景/道具去生成 → 污染真實 VN 的 bg/bgm。
        _linesOutsideDynBlocks: function() {
            const out = [];
            let inBlock = false, closeTag = '';
            for (const line of this.script) {
                if (inBlock) { if (line === closeTag) inBlock = false; continue; }
                const m = line.match(/^<([A-Za-z一-鿿][\w一-鿿-]*)>$/);
                if (m && this._isDynBlockTag(m[1])) { inBlock = true; closeTag = '</' + m[1] + '>'; continue; }
                out.push(line);
            }
            return out;
        },
        // 卡片區塊（如 <ChapterCard>）裡若含真 VN 場景指令（[BGM]/[Bg]/[Scene]）→ 在區塊「前面」插入副本，
        // 讓 VN 引擎照常執行（播音樂、設背景）；區塊內原行仍被 processLine 收進卡片當顯示資料。
        // 解決：把開場 [BGM]/[Bg] 包進美化卡後，音樂/背景失效的問題（不包時正常、包了就被吞）。
        _hoistSceneDirectivesFromDynBlocks: function() {
            const SCENE = /^\[(BGM|Bg|Scene)\|/i;
            const out = [];
            let i = 0;
            while (i < this.script.length) {
                const line = this.script[i];
                const m = line.match(/^<([A-Za-z一-鿿][\w一-鿿-]*)>$/);
                if (m && this._isDynBlockTag(m[1])) {
                    const closeTag = '</' + m[1] + '>';
                    let j = i + 1;
                    while (j < this.script.length && this.script[j] !== closeTag) j++;
                    // 先吐場景指令副本（VN 引擎執行）
                    for (let k = i + 1; k < j; k++) { if (SCENE.test(this.script[k])) out.push(this.script[k]); }
                    // 再吐原區塊（open ~ close）給卡片渲染
                    for (let k = i; k <= j && k < this.script.length; k++) out.push(this.script[k]);
                    i = j + 1;
                } else {
                    out.push(line);
                    i++;
                }
            }
            this.script = out;
        },
        _prewarmBgs: function() {
            const tasks = [];
            const seen = new Set();
            for (const line of this._linesOutsideDynBlocks()) {
                if (!line.startsWith('[Bg|')) continue;
                const parts = line.slice(4, -1).split('|');
                const cacheId = parts[1];
                const prompt  = this._bgGenPrompt(parts);   // 與 live 同一組合：第二格 + 第三格
                if (!cacheId || !prompt || seen.has(cacheId)) continue;
                seen.add(cacheId);
                tasks.push({ cacheId, prompt });
            }
            if (!tasks.length) return;
            console.log(`[VN] 預熱背景：共 ${tasks.length} 張，依序生成中（含 fallback）...`);
            (async () => {
                this._imgScanStart();
                try {
                    for (const { cacheId, prompt } of tasks) {
                        this._imgJobStart();
                        try { await this._safeFetchBg(cacheId, prompt); } finally { this._imgJobEnd(); }
                    }
                } finally { this._imgScanEnd(); }
                console.log('[VN] 所有背景預熱完成');
            })();
        },

        _prewarmItems: function() {
            const tasks = [];
            const seen = new Set();
            for (const line of this._linesOutsideDynBlocks()) {
                if (!line.startsWith('[Item|')) continue;
                const _ip = line.slice(6, -1).split('|');
                const itemName = _ip[0];
                if (!itemName || seen.has(itemName)) continue;
                seen.add(itemName);
                tasks.push({ name: itemName, desc: _ip[1] || '' });
            }
            if (!tasks.length) return;
            console.log(`[VN] 預熱道具圖：共 ${tasks.length} 張，依序生成中...`);
            (async () => {
                this._imgScanStart();
                try {
                    for (const { name: itemName, desc } of tasks) {
                        // 走 _safeFetchItem：與現場 [Item|] 共用 in-flight promise，防重複生成
                        this._imgJobStart();
                        try { await this._safeFetchItem(itemName, desc); } finally { this._imgJobEnd(); }
                    }
                } finally { this._imgScanEnd(); }
                console.log('[VN] 所有道具圖預熱完成');
            })();
        },

        // 去重包裝：同一道具若已在生成中(預熱/現場)，共用同一個 promise（同 _safeFetchBg）
        _safeFetchItem: function(itemName, desc) {
            if (this._itemMemCache[itemName]) return Promise.resolve(this._itemMemCache[itemName]);
            if (this._itemInflight[itemName]) return this._itemInflight[itemName];
            const self = this;
            const p = this._doFetchItem(itemName, desc);
            this._itemInflight[itemName] = p;
            p.then(function () {}, function () {}).then(function () { delete self._itemInflight[itemName]; });
            return p;
        },
        _doFetchItem: async function(itemName, desc) {
            if (this._itemMemCache[itemName]) return this._itemMemCache[itemName];
            const cached = await VN_Cache.get('item_cache', itemName);
            if (cached && cached.url && !cached.url.startsWith('blob:')) {
                const objUrl = await this._toObjectUrl(cached.url);
                this._itemMemCache[itemName] = objUrl || cached.url;
                return this._itemMemCache[itemName];
            }
            if (cached && cached.url && cached.url.startsWith('blob:')) {
                await VN_Cache.delete('item_cache', itemName);
            }
            const raw = await VN_Image.getItem(this._itemGenPrompt(itemName, desc));
            if (!raw) return '';
            try {
                const fetchRes = await fetch(raw);
                const blob = await fetchRes.blob();
                const objUrl = URL.createObjectURL(blob);
                const dataUrl = await new Promise(r => {
                    const reader = new FileReader();
                    reader.onload = () => r(reader.result);
                    reader.onerror = () => r('');
                    reader.readAsDataURL(blob);
                });
                this._itemMemCache[itemName] = objUrl;
                if (dataUrl) await VN_Cache.set('item_cache', itemName, { prompt: itemName, url: dataUrl });
                return objUrl;
            } catch(e) {
                const url = await this._toDataUrl(raw);
                if (url) {
                    this._itemMemCache[itemName] = url;
                    await VN_Cache.set('item_cache', itemName, { prompt: itemName, url });
                }
                return this._itemMemCache[itemName] || '';
            }
        },

        // 解析 <scene> block 內容行 → { cacheId, prompt }。
        // 可選首部「scene-id: Xxx」指定快取ID/存檔名（scene_Xxx.png），該行不進生圖 prompt；
        // 沒給 id 就退回 prompt 雜湊。預熱預掃與正片播放必須共用此函式，
        // 算出同一個 cacheId，in-flight 去重才接得上。
        _parseSceneBlock: function(rawLines) {
            let id = '';
            const pLines = [];
            for (const raw of rawLines) {
                const l = String(raw).trim();
                if (!l || l.startsWith('//')) continue;
                const m = l.match(/^scene[-_ ]?id\s*[:：]\s*(.+)$/i);
                if (m) { id = m[1].trim().replace(/\s+/g, '_'); continue; }
                pLines.push(l);
            }
            const prompt = pLines.join('\n').trim();
            const cacheId = id || (prompt ? 'sc_' + Math.abs(prompt.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) : '');
            return { cacheId, prompt };
        },

        _prewarmScenes: function() {
            const tasks = [];
            const seen = new Set();
            const _lines = this._linesOutsideDynBlocks();
            // 格式 A：[Scene|cacheId|prompt] 單行
            for (let i = 0; i < _lines.length; i++) {
                const line = _lines[i];
                if (line.startsWith('[Scene|')) {
                    const parts = line.slice(7, -1).split('|');
                    const cacheId = parts[0], prompt = parts[1];
                    if (!cacheId || !prompt || seen.has(cacheId)) continue;
                    seen.add(cacheId); tasks.push({ cacheId, prompt });
                }
                // 格式 B：<scene>...</scene> 多行 block（可選 scene-id: 首部）
                if (line === '<scene>') {
                    const _raw = [];
                    let j = i + 1;
                    while (j < _lines.length && _lines[j] !== '</scene>') { _raw.push(_lines[j]); j++; }
                    const { cacheId, prompt } = this._parseSceneBlock(_raw);
                    if (prompt && !seen.has(cacheId)) { seen.add(cacheId); tasks.push({ cacheId, prompt }); }
                }
            }
            if (!tasks.length) return;
            console.log(`[VN] 預熱場景CG：共 ${tasks.length} 張，依序排隊生成（NAI 不支援並發）...`);
            (async () => {
                this._imgScanStart();
                try {
                    for (const { cacheId, prompt } of tasks) {
                        // 走 _safeFetchScene：與現場 [Scene|] 共用 in-flight promise，
                        // 防「預熱在生、正片又播到同場景」各生一張（同 prompt 重複扣錢）
                        this._imgJobStart();
                        try { await this._safeFetchScene(cacheId, prompt); } finally { this._imgJobEnd(); }
                    }
                } finally { this._imgScanEnd(); }
                console.log('[VN] 所有場景CG預熱完成');
            })();
        },

        // 將 scene dataUrl 儲存到 ST user/images/[角色名]/scene_[id].png（gallery 可見）
        _saveSceneToDisk: async function(cacheId, dataUrl) {
            try {
                const p = window.parent || window;
                const ctx = p.SillyTavern?.getContext?.();
                if (!ctx) return;
                const charName = ctx.characters?.[ctx.characterId]?.name || '';
                if (!charName) return;
                const headers = ctx.getRequestHeaders ? ctx.getRequestHeaders() : { 'Content-Type': 'application/json' };
                const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
                const fmt    = (dataUrl.match(/^data:image\/(\w+);/) || ['','png'])[1];
                const res = await fetch('/api/images/upload', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ image: base64, format: fmt, ch_name: charName, filename: 'scene_' + cacheId })
                });
                if (res.ok) { const d = await res.json(); console.log('[VN] Scene → disk:', d.path); }
            } catch(e) { console.warn('[VN] Scene disk save failed:', e); }
        },

        // 去重包裝：同一 cacheId 若已在生成中(預熱/現場)，共用同一個 promise（同 _safeFetchBg）
        _safeFetchScene: function(cacheId, prompt) {
            if (this._sceneMemCache[cacheId]) return Promise.resolve(this._sceneMemCache[cacheId]);
            if (this._sceneInflight[cacheId]) return this._sceneInflight[cacheId];
            // 這個 cacheId 剛生圖失敗過(如拼車撞 NAI 429) → 不自動重打：否則「預熱→插入→渲染」序列會同一張各打一次、白燒額度又易被風控。
            // 要重生按場景 CG 的 🔄（retrySceneCg 會清掉這個標記）；重整頁面也會重置（記憶體 map）。
            if (this._sceneFailed[cacheId]) return Promise.resolve('');
            // 本輪已撞失敗(拼車 NAI 429) → 不再自動猛打後續插圖：標記失敗、回空(顯示佔位卡＋重生鈕)。手動重生/新一輪解除。
            if (this._sceneGenBackoff) { this._sceneFailed[cacheId] = Date.now(); return Promise.resolve(''); }
            const self = this;
            const p = this._doFetchScene(cacheId, prompt);
            this._sceneInflight[cacheId] = p;
            p.then(function (url) {
                if (!url) { self._sceneFailed[cacheId] = Date.now(); self._sceneGenBackoff = Date.now(); }   // 回空＝生失敗 → 記下＋本輪起退避，後續不再猛打
            }, function () {
                self._sceneFailed[cacheId] = Date.now(); self._sceneGenBackoff = Date.now();                // 例外也算失敗
            }).then(function () { delete self._sceneInflight[cacheId]; });
            return p;
        },
        // 🔄 「重生」鈕：撞 NAI 500 後 fallback 出的 poll 圖會卡進 mem/IndexedDB 快取，
        // 這裡清掉卡住的圖、用同個 prompt（沿用 cacheId，完全不碰 LLM）重打生圖。
        retrySceneCg: async function() {
            const cur = this._sceneCgCur;
            if (!cur || !cur.cacheId) return;
            const cacheId = cur.cacheId, prompt = cur.prompt;
            const cgImg = document.getElementById('scene-cg-img');
            const btn   = document.getElementById('scene-cg-retry');
            if (btn) { btn.disabled = true; btn.classList.add('spinning'); }
            try {
                delete this._sceneMemCache[cacheId];
                delete this._sceneInflight[cacheId];
                delete this._sceneFailed[cacheId];   // 清失敗標記，允許這次手動重生
                this._sceneGenBackoff = 0;           // 手動重生：解除本輪退避，這張一定要重打
                try { await VN_Cache.delete('scene_cache', cacheId); } catch (e) {}
                const url = await this._safeFetchScene(cacheId, prompt);
                if (url && cgImg) { cgImg.src = url; this._setSceneCgFailed(false); }
                else { this._setSceneCgFailed(true); }   // 還是失敗(朋友還在生) → 維持佔位卡，可再按
            } finally {
                if (btn) { btn.disabled = false; btn.classList.remove('spinning'); }
            }
        },
        // 插圖失敗(拼車撞 429 等) → 加佔位狀態：顯示佔位底＋置中重生鈕、且 hold 住不淡出；成功則清掉恢復正常淡出
        _setSceneCgFailed: function(on) {
            const ov = document.getElementById('scene-cg-overlay');
            if (ov) ov.classList.toggle('scene-cg-failed', !!on);
            this._sceneCgHold = !!on;   // 失敗→hold(renderVN 不遞減 linger、hideOverlays 不關)；成功→解除照常淡出
            this._sceneCgFailLinger = on ? 3 : 0;   // 失敗佔位也給 3 則寬限：沒手動重生就自己淡出、不永遠卡著
        },
        _doFetchScene: async function(cacheId, prompt) {
            if (this._sceneMemCache[cacheId]) return this._sceneMemCache[cacheId];
            const cached = await VN_Cache.get('scene_cache', cacheId);
            if (cached && cached.url) {
                if (cached.url.startsWith('blob:')) {
                    await VN_Cache.delete('scene_cache', cacheId);
                } else {
                    const objUrl = await this._toObjectUrl(cached.url);
                    this._sceneMemCache[cacheId] = objUrl || cached.url;
                    this._preloadImg('scene_' + cacheId, this._sceneMemCache[cacheId]);
                    return this._sceneMemCache[cacheId];
                }
            }
            if (!prompt) return '';   // 沒 prompt 沒得生（ID-only 標籤走相簿路，正常不會到這；防空 prompt 白燒生圖）
            const raw = await VN_Image.getScene(prompt);
            if (!raw) return '';
            try {
                const fetchRes = await fetch(raw);
                const blob = await fetchRes.blob();
                const objUrl = URL.createObjectURL(blob);
                const dataUrl = await new Promise(r => {
                    const reader = new FileReader();
                    reader.onload = () => r(reader.result);
                    reader.onerror = () => r('');
                    reader.readAsDataURL(blob);
                });
                this._sceneMemCache[cacheId] = objUrl;
                this._preloadImg('scene_' + cacheId, objUrl);
                if (dataUrl) {
                    await VN_Cache.set('scene_cache', cacheId, { prompt, rawUrl: raw, url: dataUrl });
                    this._saveSceneToDisk(cacheId, dataUrl); // fire-and-forget → user/images/[char]/scene_[id].png
                }
                return objUrl;
            } catch(e) {
                const url = await this._toDataUrl(raw);
                if (url) {
                    this._sceneMemCache[cacheId] = url;
                    await VN_Cache.set('scene_cache', cacheId, { prompt, rawUrl: raw, url });
                    this._saveSceneToDisk(cacheId, url); // fire-and-forget
                }
                return this._sceneMemCache[cacheId] || '';
            }
        },
    });

    console.log('[PhoneOS] 已掛載 VN 生圖管線 (vn_core_images.js — 背景/場景CG/道具)');
})();
