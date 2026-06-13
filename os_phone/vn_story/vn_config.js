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
            const s = localStorage.getItem('vn_cfg_v4');
            if (s) this.data = { ...this.data, ...JSON.parse(s) };
        }
    };

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
                // 角色頭像尺寸：讀「🎭 頭像 → 角色頭像尺寸」設定（空＝用各接口預設 Poll512/NAI1024），設了就傳給 generate
                const _avOpts = { negativePrompt: negPrompt, force: !!force };
                try { const _p = String((JSON.parse(localStorage.getItem('os_image_config')||'{}').avatarSize) || '').split('x').map(Number); if (_p[0]&&_p[1]) { _avOpts.width=_p[0]; _avOpts.height=_p[1]; } } catch(e) {}
                // force=true（畫廊「重生」用）→ 繞過 generate() 記憶體快取
                return await win.OS_IMAGE_MANAGER.generate(full, 'char', _avOpts);
            } return "";
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
