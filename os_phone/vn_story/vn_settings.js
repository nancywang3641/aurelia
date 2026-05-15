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

            // 「Context 保留最近幾章全文」僅獨立(PWA)版本有意義；酒館版由酒館自己管 prompt 注入，隱藏這個設定
            const isStandalone = !!(window.OS_API?.isStandalone?.());
            const ctxChaptersBlock = isStandalone ? `
        <div class="set-group">
            <div class="set-label">📚 Context 保留最近幾章全文 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">其餘舊章節自動縮成摘要</span></div>
            <input class="set-input" type="number" id="vncfg-ctx-chapters" min="1" max="20" placeholder="5" value="${d.ctxChapters ?? 5}" style="width:120px;">
            <div class="set-desc">建議 3–6 章。設 0 或留空 = 全送（不限制）。</div>
        </div>` : '';

            return /* html */`
<div style="padding-bottom:4px;">
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
        <div class="set-label">🧍 角色預設圖目錄 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">Fallback 1 — 自動拼接 角色名_presets.png</span></div>
        <input class="set-input" id="vncfg-char-default-base" placeholder="./presets/" value="${d.charDefaultBase}">
    </div>

    <div class="set-group">
        <div class="set-label">🌑 最終預設立繪 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">Fallback 2 — 所有渠道失敗時顯示</span></div>
        <input class="set-input" id="vncfg-final-fallback" placeholder="https://files.catbox.moe/9je7j2.png" value="${d.finalFallbackSprite}">
        <div class="set-desc">建議用透明背景 PNG 剪影。</div>
    </div>

    ${ctxChaptersBlock}
</div>`;
        }
    };

    window.VN_SETTINGS_PANEL = VN_SETTINGS_PANEL;

})();
