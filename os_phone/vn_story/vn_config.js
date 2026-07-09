// ----------------------------------------------------------------
// [檔案] vn_config.js
// 路徑：os_phone/vn_story/vn_config.js
// 職責：VN 視覺小說播放器 - 系統配置、Prompt 排列管理、BGM 模糊匹配、生圖引擎
// 自 vn_core.js V8.6 拆分出獨立模組
// 依賴：(運行期) OS_PROMPTS, OS_IMAGE_MANAGER
// 暴露：window.VN_Config, window.VN_PromptOrder, window.VN_BgmIndex, window.VN_Image
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[PhoneOS] 載入 VN 配置/生圖模組 (vn_config.js)...');
    const win = window.parent || window;

    // === 系統配置 ===
    const VN_Config = {
        data: { bgm: '', sfx: '', spriteBase: '', stickerBase: '', charDefaultBase: '', finalFallbackSprite: 'https://files.catbox.moe/9je7j2.png', avatarBasePrompt: '', avatarNegPrompt: 'bad anatomy, extra limbs, disfigured, blurry, low quality, worst quality, watermark, text', bgBasePrompt: '', bgNegPrompt: 'people, person, man, woman, child, crowd, character, pedestrian, anime screencap, cel shading, flat color, simple lines, sketch, low quality, worst quality, blurry, overexposed, photography, photorealistic, 3d render', itemBasePrompt: 'item only, product shot, no background, white background, clean illustration, high quality', itemNegPrompt: 'person, human, character, body, face, hands, people, crowd, bad anatomy, blurry, low quality, worst quality, watermark, text', ctxChapters: 5 },
        // UI 設置由 vn_settings.js 管理，此處只負責從 localStorage 載入供運行期使用
        load: function() {
            try {
                const s = localStorage.getItem('vn_cfg_v4');
                if (s) this.data = { ...this.data, ...JSON.parse(s) };
            } catch (e) {}
        }
    };
    // 🔑 腳本載入就先讀一次設定——早鳥/大總結補頭像等路徑在「VN 面板還沒開」時就會生圖，
    //    等 vn_core init 才 load 的話，那些生成讀到的 spriteDirect 永遠是 undefined
    //    → 立繪模式開著卻偶爾生出頭像（帶背景大頭照）的真兇。之後 vn_core/設定存檔會再 load、無害。
    VN_Config.load();

    // === Prompt 排列管理（讀取順序供 API 使用，UI 統一在 os_prompts.js） ===
    const VN_PromptOrder = {
        STORAGE_KEY: 'vn_prompt_order',

        getOrder() {
            // 返回 bundle ID 列表（全域順序），供 os_api_engine 排序用
            try {
                const saved = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
                if (Array.isArray(saved) && saved.length) return saved;
            } catch(e) {}
            return (win.OS_PROMPTS?.getBundles?.() || []).map(b => b.id);
        },

        saveOrder(order) { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(order)); },
        reset()          { localStorage.removeItem(this.STORAGE_KEY); }
    };

    // ─── BGM 模糊匹配 index ───────────────────────────────────────
    // AI 流口水寫錯 BGM 名時，從本地 bgm 目錄找最接近的檔名。找不到夠像的就靜音（避免氛圍違和）
    const VN_BgmIndex = {
        _list: null,
        _loadPromise: null,

        async load() {
            if (this._list) return this._list;
            if (this._loadPromise) return this._loadPromise;
            this._loadPromise = (async () => {
                const baseUrl = (win.VN_Config?.data?.bgm) || '';
                // 解析 GitHub Pages URL：https://owner.github.io/repo/path/ → owner/repo/path
                const m = baseUrl.match(/^https:\/\/([^.]+)\.github\.io\/([^/]+)\/(.+?)\/?$/);
                if (!m) {
                    console.warn('[VN] BGM 目錄非 GitHub Pages URL，跳過 fuzzy match index');
                    this._list = [];
                    return [];
                }
                const [, owner, repo, path] = m;
                try {
                    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
                    const res = await fetch(apiUrl);
                    if (!res.ok) throw new Error('GitHub API ' + res.status);
                    const arr = await res.json();
                    this._list = arr
                        .filter(f => f.type === 'file' && /\.(mp3|m4a|ogg|wav|flac)$/i.test(f.name))
                        .map(f => f.name.replace(/\.[^.]+$/, ''));
                    console.log(`[VN] BGM index 載入 ${this._list.length} 個檔案`);
                    return this._list;
                } catch (e) {
                    console.warn('[VN] BGM index 載入失敗:', e);
                    this._list = [];
                    return [];
                }
            })();
            return this._loadPromise;
        },

        findMatch(needName) {
            if (!this._list || !this._list.length) return null;
            const need = String(needName).toLowerCase().trim();
            if (!need) return null;
            let best = null, bestScore = 0;
            for (const cand of this._list) {
                const c = String(cand).toLowerCase();
                if (c === need) return cand;
                let score = 0;
                // 子字串包含優先（最常見：「咖啡時光」vs「咖啡時光午後」）
                if (c.includes(need) || need.includes(c)) {
                    const lenRatio = Math.min(need.length, c.length) / Math.max(need.length, c.length);
                    score = 0.5 + lenRatio * 0.4;  // 0.5~0.9 看相對長度
                } else {
                    // Jaccard 字符集合相似度
                    const sa = new Set(need); const sb = new Set(c);
                    const inter = [...sa].filter(x => sb.has(x)).length;
                    const union = new Set([...need, ...c]).size;
                    score = union ? inter / union : 0;
                }
                if (score > bestScore) { best = cand; bestScore = score; }
            }
            // 門檻 0.5 — 不夠像就回 null（讓系統選擇靜音而非配錯氛圍）
            return bestScore >= 0.5 ? { name: best, score: bestScore } : null;
        }
    };

    // === 生圖引擎 ===
    const VN_Image = {
        _join: function(...parts) { return parts.filter(Boolean).join(', '); },
        getBg: async function(prompt, outMeta) {
            if (win.OS_IMAGE_MANAGER && typeof win.OS_IMAGE_MANAGER.generateBackgroundAsync === 'function') {
                const full = this._join(VN_Config.data.bgBasePrompt, prompt);
                // 背景尺寸：讀「🌄 背景 → 背景尺寸」設定（取代原本寫死 1024×768）
                let _bw = 1024, _bh = 768;
                try { const _p = String((JSON.parse(localStorage.getItem('os_image_config')||'{}').bgSize) || '1024x768').split('x').map(Number); if (_p[0]&&_p[1]) { _bw=_p[0]; _bh=_p[1]; } } catch(e) {}
                const opts = { width: _bw, height: _bh, negativePrompt: VN_Config.data.bgNegPrompt || undefined };
                const url = await win.OS_IMAGE_MANAGER.generateBackgroundAsync(full, opts);
                if (outMeta) outMeta.translatedPrompt = opts.translatedPrompt;
                return url;
            } return "";
        },
        getAvatar: async function(prompt, exp, force) {
            if (win.OS_IMAGE_MANAGER && typeof win.OS_IMAGE_MANAGER.generate === 'function') {
                // 來源隔離：走「酒館原生(tavern_sd)」時改用「酒館原生專屬」頭像底詞/負詞（預設空＝乾淨），
                // 避免給 poll ai 的 avatarBasePrompt/avatarNegPrompt 漏進 ComfyUI → 跟模型底詞打架爆光
                const _svc = (typeof win.OS_IMAGE_MANAGER.serviceFor === 'function') ? win.OS_IMAGE_MANAGER.serviceFor('char') : ((win.OS_IMAGE_MANAGER.config && win.OS_IMAGE_MANAGER.config.service) || '');
                // tavern_sd / comfyui_direct：底詞由各自來源控制，VN 層改用「乾淨」專屬底詞，避免 poll ai 底詞漏入
                const _isTavern = (_svc === 'tavern_sd' || _svc === 'comfyui_direct');
                const _base = _isTavern ? VN_Config.data.avatarBasePromptTavern : VN_Config.data.avatarBasePrompt;
                const _neg  = _isTavern ? VN_Config.data.avatarNegPromptTavern  : VN_Config.data.avatarNegPrompt;
                // 順序：(來源對應)追加詞 → 角色描述詞 → 表情
                const full = this._join(_base, prompt, `${exp} expression`);
                const negPrompt = _neg || undefined;
                // 角色頭像尺寸：讀「🎭 頭像 → 角色頭像尺寸」設定（空＝預設 512×768 小直式立繪，不再吃 NAI 1024 大正方；設了就用設的）
                const _avOpts = { negativePrompt: negPrompt, force: !!force };
                try { const _p = String((JSON.parse(localStorage.getItem('os_image_config')||'{}').avatarSize) || '512x768').split('x').map(Number); if (_p[0]&&_p[1]) { _avOpts.width=_p[0]; _avOpts.height=_p[1]; } } catch(e) {}
                // force=true（畫廊「重生」用）→ 繞過 generate() 記憶體快取
                return await win.OS_IMAGE_MANAGER.generate(full, 'char', _avOpts);
            } return "";
        },
        // 立繪模式專用：直接從角色描述生「全身站姿立繪」(跟 studio 頭像轉立繪同套邏輯)。
        // 清掉跟立繪衝突的構圖/背景/視角 tag → 套全身模板 → 512×896 直立 → 非 NAI 走 raw(純模板)，NAI 套頭像同畫風底詞避免太裸。
        getSprite: async function(prompt, force) {
            if (!(win.OS_IMAGE_MANAGER && typeof win.OS_IMAGE_MANAGER.generate === 'function')) return "";
            const _svc = (typeof win.OS_IMAGE_MANAGER.serviceFor === 'function') ? win.OS_IMAGE_MANAGER.serviceFor('char') : ((win.OS_IMAGE_MANAGER.config && win.OS_IMAGE_MANAGER.config.service) || '');
            const _useNAI = (_svc === 'novelai');
            // ⭐ 跟「角色立繪 studio / 一鍵生立繪」一字不差：用她在 studio 調好的前綴/後綴(localStorage os_sprite_tpl_prefix/suffix)，
            //   別再自己硬編模板。沒設過才退預設(她的 cowboy shot + brown background 那組，避免 full body 打架被切、純色底好去背)。
            //   prompt 是角色描述：清掉跟立繪衝突的構圖/背景/視角 tag(同 studio renderAvatarPicker 的 stripPromptForSprite)。
            //   底詞/負詞/畫師串交給 generate(raw=!NAI 同 studio)：NAI 套 charBasePrompt、非 NAI raw 純模板，這裡不另塞。
            // ⚠️ 預設必須跟 studio「一鍵生立繪」的 DEF_PREFIX/DEF_SUFFIX 一字不差(os_settings.js _initSpriteUI)——
            //    studio 手動生讀的是「框裡的值」(沒存過也預填這預設,所以永遠帶 no shading→不出陰影);
            //    getSprite 讀 localStorage,沒存過就退這裡的預設。以前這裡前綴不同、後綴是空字串→少了 no shading + simple bright background
            //    → spriteDirect 才會跑出陰影(手動不會)。改成一字不差,兩條路才真的一樣。改 studio 預設記得同步這裡。
            const DEF_PFX = 'straight posturing, solo, (facing viewer:1.2), (cowboy shot:1.2), front view, clothes and pants, standing, ';
            const DEF_SFX = 'simple bright background, straight view, no shading';
            let pfx = null, sfx = null;
            try { pfx = localStorage.getItem('os_sprite_tpl_prefix'); } catch (e) {}
            try { sfx = localStorage.getItem('os_sprite_tpl_suffix'); } catch (e) {}
            if (pfx == null) pfx = DEF_PFX;
            if (sfx == null) sfx = DEF_SFX;
            const full = pfx + this._stripForSprite(prompt) + sfx;   // = studio 的 prefix + finalPrompt + suffix
            // 立繪尺寸：跟 studio 共用「立繪比例」設定 os_sprite_size，預設 512×896
            let _w = 512, _h = 896;
            try { const _p = String(localStorage.getItem('os_sprite_size') || '512x896').split('x').map(Number); if (_p[0] && _p[1]) { _w = _p[0]; _h = _p[1]; } } catch(e) {}
            return await win.OS_IMAGE_MANAGER.generate(full, 'char', { width: _w, height: _h, raw: !_useNAI, force: !!force });
        },
        // 剝掉跟立繪衝突的構圖/背景/視角 tag（與 os_settings studio 的 stripPromptForSprite 同規則）
        _stripForSprite: function(p) {
            if (!p) return '';
            const patterns = [
                /\bbust(\s+|-)?shot\b/gi, /\bportrait\b/gi, /\bheadshot\b/gi, /\bhead\s+shot\b/gi,
                /\bclose[\s-]?up\b/gi, /\bcowboy(\s+|-)?shot\b/gi, /\bupper(\s+|-)?body\b/gi, /\bfull(\s+|-)?body\b/gi,
                /\bhead\s+and\s+shoulders\b/gi, /\bwaist[\s-]?up\b/gi, /\bchest[\s-]?up\b/gi,
                /\b[a-z]*\s*background\b/gi, /\bisolated\b/gi, /\bno\s+bg\b/gi,
                /\bsoft\s+lighting\b/gi, /\bstudio\s+lighting\b/gi, /\bflat\s+lighting\b/gi,   // 同 studio：剝燈光詞避免跟後綴 no shading 打架
                /\bfrom\s+(above|below|side|behind|front)\b/gi,
            ];
            let s = p;
            patterns.forEach(rx => { s = s.replace(rx, ''); });
            return s.replace(/,\s*,+/g, ',').replace(/^\s*,+/, '').replace(/,+\s*$/, '').replace(/\s+/g, ' ').trim();
        },
        getItem: async function(prompt) {
            if (win.OS_IMAGE_MANAGER && typeof win.OS_IMAGE_MANAGER.generateItem === 'function') {
                return await win.OS_IMAGE_MANAGER.generateItem(prompt);
            } return "";
        },
        getScene: async function(prompt) {
            if (win.OS_IMAGE_MANAGER && typeof win.OS_IMAGE_MANAGER.generate === 'function') {
                // 場景插圖尺寸：讀「圖片設置 → 場景插圖尺寸」下拉（獨立設定），預設 1024×1024
                // 底詞：場景跟角色共用「角色底詞」（generate→_genNovelAI 把 scene 當 char 套 charBasePrompt/charNegPrompt），不另設場景底詞（Rae 拍板：場景只吃角色底詞）
                let _sw = 1024, _sh = 1024;
                try {
                    const _sz = (JSON.parse(localStorage.getItem('os_image_config') || '{}').sceneGen || {}).size || '1024x1024';
                    const _p = String(_sz).split('x').map(Number);
                    if (_p[0] && _p[1]) { _sw = _p[0]; _sh = _p[1]; }
                } catch(e) {}
                return await win.OS_IMAGE_MANAGER.generate(prompt, 'scene', { width: _sw, height: _sh });
            } return "";
        }
    };

    // === 暴露到全域 ===
    window.VN_Config = VN_Config;
    window.VN_PromptOrder = VN_PromptOrder;
    win.VN_BgmIndex = VN_BgmIndex;
    window.VN_Image = VN_Image;
})();
