// ----------------------------------------------------------------
// [檔案] vn_settings.js  (VN 系統設置面板模組)
// 職責：管理 VN 面板的路徑、Prompt 設置，供 os_settings.js 外接調用。
//       資料存於 localStorage['vn_cfg_v4']，與 vn_core.js VN_Config 同一鍵。
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[PhoneOS] 載入 VN 設置面板模組...');

    const STORAGE_KEY = 'vn_cfg_v4';

    const DEFAULTS = {
        bgm:                 '',
        sfx:                 '',
        spriteBase:          '',
        stickerBase:         '',
        charDefaultBase:     '',
        finalFallbackSprite: 'https://files.catbox.moe/9je7j2.png',
        avatarBasePrompt:    '',
        avatarNegPrompt:     'bad anatomy, extra limbs, disfigured, blurry, low quality, worst quality, watermark, text',
        bgBasePrompt:        '',
        bgNegPrompt:         'people, person, man, woman, child, crowd, character, pedestrian, anime screencap, cel shading, flat color, simple lines, sketch, low quality, worst quality, blurry, overexposed, photography, photorealistic, 3d render',
        itemBasePrompt:      'item only, product shot, no background, white background, clean illustration, high quality',
        itemNegPrompt:       'person, human, character, body, face, hands, people, crowd, bad anatomy, blurry, low quality, worst quality, watermark, text',
        homeBgBase:          '',
        homeBgCount:         '0',
        homeBgExt:           'jpg',
        ctxChapters:         5
    };

    const VN_SETTINGS_PANEL = {

        // ── 讀取設定 ─────────────────────────────────────────────
        load() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : { ...DEFAULTS };
            } catch (e) { return { ...DEFAULTS }; }
        },

        // ── 儲存設定（從 os_settings 的 container 讀取） ─────────
        save(container) {
            const g  = (id) => (container.querySelector(`#vncfg-${id}`)?.value || '').trim();
            const gi = (id, def) => parseInt(container.querySelector(`#vncfg-${id}`)?.value || def) || def;

            const data = {
                bgm:                 g('bgm'),
                sfx:                 g('sfx'),
                spriteBase:          g('sprite'),
                stickerBase:         g('sticker'),
                charDefaultBase:     g('char-default-base'),
                finalFallbackSprite: g('final-fallback') || DEFAULTS.finalFallbackSprite,
                avatarBasePrompt:    g('avatar-prompt'),
                avatarNegPrompt:     g('avatar-neg'),
                bgBasePrompt:        g('bg-prompt'),
                bgNegPrompt:         g('bg-neg'),
                itemBasePrompt:      g('item-prompt'),
                itemNegPrompt:       g('item-neg'),
                homeBgBase:          g('home-bg-base'),
                homeBgCount:         g('home-bg-count') || '0',
                homeBgExt:           container.querySelector('#vncfg-home-bg-ext')?.value || 'jpg',
                ctxChapters:         gi('ctx-chapters', 5)
            };

            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

            // 若 VN_Config 正在運行，即時同步（下次開啟 VN 時也會重新 load）
            try { if (window.VN_Config?.load) window.VN_Config.load(); } catch (e) {}

            return data;
        },

        // ── 輸出 HTML 字串（供 os_settings launchApp 嵌入） ──────
        getHTML(d) {
            d = d || this.load();
            const extOpt = (v) => ['jpg','jpeg','png','webp']
                .map(e => `<option value="${e}"${d.homeBgExt === e ? ' selected' : ''}>${e.toUpperCase()}</option>`)
                .join('');

            return /* html */`
<div style="padding-bottom:4px;">

    <!-- 子 Tab 列 -->
    <div class="set-tabs" id="vn-sub-tabs" style="margin:0 -20px 16px; padding:0 10px;">
        <div class="set-tab active" data-vntab="path"   onclick="window.VN_SETTINGS_PANEL._switchTab(this,'path')">🗂️ 路徑</div>
        <div class="set-tab"        data-vntab="prompt" onclick="window.VN_SETTINGS_PANEL._switchTab(this,'prompt')">🖼️ Prompt</div>
        <div class="set-tab"        data-vntab="avatar" onclick="window.VN_SETTINGS_PANEL._switchTab(this,'avatar')">🎭 頭像</div>
        <div class="set-tab"        data-vntab="tts"    onclick="window.VN_SETTINGS_PANEL._switchTab(this,'tts')">🎙 語音</div>
    </div>

    <!-- Tab：路徑 -->
    <div id="vn-subtab-path" class="vn-subtab-view">

        <div class="set-group">
            <div class="set-label">🏠 主頁背景圖</div>
            <input class="set-input" id="vncfg-home-bg-base" placeholder="https://example.com/bg/" value="${d.homeBgBase}">
            <div style="display:flex; gap:8px; margin-top:8px; align-items:center;">
                <input class="set-input" type="number" id="vncfg-home-bg-count" placeholder="圖片數量" min="1" value="${d.homeBgCount}" style="flex:1;">
                <select class="set-select" id="vncfg-home-bg-ext" style="flex:1;">${extOpt()}</select>
            </div>
            <div class="set-desc">URL 目錄 + 數量，檔名命名為 1.jpg / 2.jpg…，系統每次隨機抽取。</div>
        </div>

        <div class="set-group">
            <div class="set-label">🎵 遊戲 BGM 目錄</div>
            <input class="set-input" id="vncfg-bgm" placeholder="./bgm/" value="${d.bgm}">
        </div>

        <div class="set-group">
            <div class="set-label">🔊 音效目錄</div>
            <input class="set-input" id="vncfg-sfx" placeholder="./sfx/" value="${d.sfx}">
        </div>

        <div class="set-group">
            <div class="set-label">🖼️ 立繪目錄</div>
            <input class="set-input" id="vncfg-sprite" placeholder="./sprites/" value="${d.spriteBase}">
        </div>

        <div class="set-group">
            <div class="set-label">😄 表情包資料夾</div>
            <input class="set-input" id="vncfg-sticker" placeholder="https://cdn.com/stickers/ 或 ./stickers/" value="${d.stickerBase}">
        </div>

        <div class="set-group">
            <div class="set-label">🧍 角色預設圖目錄 <span style="font-weight:normal; color:#B78456; font-size:11px;">Fallback 1 — 自動拼接 角色名_presets.png</span></div>
            <input class="set-input" id="vncfg-char-default-base" placeholder="./presets/" value="${d.charDefaultBase}">
        </div>

        <div class="set-group">
            <div class="set-label">🌑 最終預設立繪 <span style="font-weight:normal; color:#B78456; font-size:11px;">Fallback 2 — 所有渠道失敗時顯示</span></div>
            <input class="set-input" id="vncfg-final-fallback" placeholder="https://files.catbox.moe/9je7j2.png" value="${d.finalFallbackSprite}">
            <div class="set-desc">建議用透明背景 PNG 剪影。</div>
        </div>

        <div class="set-group">
            <div class="set-label">📚 Context 保留最近幾章全文 <span style="font-weight:normal; color:#B78456; font-size:11px;">其餘舊章節自動縮成摘要</span></div>
            <input class="set-input" type="number" id="vncfg-ctx-chapters" min="1" max="20" placeholder="5" value="${d.ctxChapters ?? 5}" style="width:120px;">
            <div class="set-desc">建議 3–6 章。設 0 或留空 = 全送（不限制）。</div>
        </div>

    </div><!-- /vn-subtab-path -->

    <!-- Tab：Prompt -->
    <div id="vn-subtab-prompt" class="vn-subtab-view" style="display:none;">

        <div class="set-group">
            <div class="set-label">🧑‍🎨 頭像追加詞</div>
            <div class="set-desc">插在 OS 通用底詞 與 角色描述詞 之間。</div>
            <textarea class="set-textarea" id="vncfg-avatar-prompt" style="min-height:70px;">${d.avatarBasePrompt}</textarea>
        </div>

        <div class="set-group">
            <div class="set-label">🚫 頭像 Negative Prompt</div>
            <textarea class="set-textarea" id="vncfg-avatar-neg" style="min-height:50px;">${d.avatarNegPrompt}</textarea>
        </div>

        <div class="set-group">
            <div class="set-label">🌄 背景生圖底詞</div>
            <textarea class="set-textarea" id="vncfg-bg-prompt" style="min-height:70px;">${d.bgBasePrompt}</textarea>
        </div>

        <div class="set-group">
            <div class="set-label">🚫 背景 Negative Prompt</div>
            <textarea class="set-textarea" id="vncfg-bg-neg" style="min-height:50px;">${d.bgNegPrompt}</textarea>
        </div>

        <div class="set-group">
            <div class="set-label">📦 物品底詞</div>
            <textarea class="set-textarea" id="vncfg-item-prompt" style="min-height:50px;">${d.itemBasePrompt}</textarea>
        </div>

        <div class="set-group">
            <div class="set-label">🚫 物品 Negative Prompt</div>
            <textarea class="set-textarea" id="vncfg-item-neg" style="min-height:50px;">${d.itemNegPrompt}</textarea>
        </div>

    </div><!-- /vn-subtab-prompt -->

    <!-- Tab：TTS 語音 -->
    <div id="vn-subtab-tts" class="vn-subtab-view" style="display:none;">
        <div id="vn-tts-inline-root"></div>
    </div>

    <!-- Tab：頭像快取 -->
    <div id="vn-subtab-avatar" class="vn-subtab-view" style="display:none;">
        <div class="set-group">
            <div class="set-label">🎭 角色立繪快取 <span style="font-weight:normal; color:#B78456; font-size:11px;">防重複生圖</span></div>
            <div id="vncfg-avatar-mgr-list" style="margin-top:8px;"></div>
        </div>
        <div class="set-desc" style="margin-top:4px;">* 生圖已全數自動接管至 OS_IMAGE_MANAGER。</div>
    </div><!-- /vn-subtab-avatar -->

</div>`;
        },

        // ── 子 Tab 切換（由 HTML onclick 呼叫） ──────────────────
        _switchTab(btnEl, tabId) {
            // 按鈕高亮
            btnEl.closest('#vn-sub-tabs').querySelectorAll('.set-tab').forEach(b => b.classList.remove('active'));
            btnEl.classList.add('active');
            // 面板顯隱
            document.querySelectorAll('.vn-subtab-view').forEach(v => v.style.display = 'none');
            const target = document.getElementById(`vn-subtab-${tabId}`);
            if (target) target.style.display = '';
            // TTS tab：切換時初始化 inline 面板
            if (tabId === 'tts') {
                window.VN_TTS_Panel?.initInline('vn-tts-inline-root');
            }
            // 頭像 tab：切換時才從 IDB 載入快取列表
            if (tabId === 'avatar') {
                if (window.VN_PLAYER?.loadAvatarManager) {
                    window.VN_PLAYER.loadAvatarManager('vncfg-avatar-mgr-list');
                } else {
                    const list = document.getElementById('vncfg-avatar-mgr-list');
                    if (list) list.innerHTML = '<div style="color:#B78456; font-size:12px; padding:10px 0;">⚠️ VN 尚未啟動，請先開啟 VN 面板再查看快取。</div>';
                }
            }
        }
    };

    window.VN_SETTINGS_PANEL = VN_SETTINGS_PANEL;

})();
