// ==SillyTavern Extension==
// @name         多功能面板系統 - 精簡版 (RPG & WX & VN)
// @version      4.3.0
// @description  修復 CSS 破圖問題，刪除多餘 APP，專注於 RPG、微信與長線劇情。
// @author       none
// @license      MIT

// 🔥 0. 偵測載入來源，決定所有檔案（JS / CSS / settings.html）要從哪裡載
//    ① 原生擴展安裝（酒館 Extensions 直接裝）→ 偵測得到 index.js 的 script 標籤 → 走本地路徑（行為不變）
//    ② 酒館助手匯入（朋友貼 JSON，從 CDN 載入）→ 偵測不到 → 走 GitHub CDN，113 個檔全部從 repo 載
//    兩種裝法並存、互不影響；改動只多了一條 CDN fallback。
// 🔥 CDN 來源 ref：助手 JSON 可在「動態 import 前」設 globalThis.__AURELIA_REF__='<commit hash>'，
//    讓整包（index.js + 全部模組 + CSS）統一鎖那個不可變 commit —— jsdelivr 對 commit 永遠正確、零快取陳舊問題。
//    沒設則預設 'main'（自動跟更新，但有 jsdelivr @main 邊緣快取延遲，更新約半天內生效）。
const _AURELIA_REF = (function () {
    try {
        if (window.__AURELIA_REF__) return String(window.__AURELIA_REF__);
        if (window.parent && window.parent !== window) { try { if (window.parent.__AURELIA_REF__) return String(window.parent.__AURELIA_REF__); } catch (e) {} }
    } catch (e) {}
    return 'main';
})();
// CDN base 可被 window.__AURELIA_CDN_BASE__ 覆寫：jsdelivr 限流/壞掉時改走 statically.io 等其他 CDN
//   (statically 用 /ref/path、jsdelivr 用 @ref/path，覆寫值自帶完整前綴，下游一律 base + '/path' 接得上)
const _AURELIA_CDN_OVERRIDE = (function () {
    try { if (window.__AURELIA_CDN_BASE__) return String(window.__AURELIA_CDN_BASE__); } catch (e) {}
    try { if (window.parent && window.parent !== window && window.parent.__AURELIA_CDN_BASE__) return String(window.parent.__AURELIA_CDN_BASE__); } catch (e) {}
    return null;
})();
const _AURELIA_CDN_BASE = _AURELIA_CDN_OVERRIDE || ('https://cdn.jsdelivr.net/gh/nancywang3641/aurelia@' + _AURELIA_REF);

// 🔥 0a. 酒館助手把匯入的腳本丟進「沙盒 <iframe>」跑：裸 document 指向 iframe 自己，UI 注入不到主頁面（按鈕出不來）。
//    對策：偵測到「自己不在主頁面、但 parent 才是主頁面」→ 把 index.js 重新注入主頁面以 classic script 執行，
//    讓整個擴展（含 100+ 模組）都跑在主頁面，裸 document 自動＝主頁面、UI 正常注入；iframe 這份隨即停手。
//    原生安裝時「自己就在主頁面」→ 不觸發，行為完全不變。
let _AURELIA_SKIP = false;
(function () {
    try {
        const _hasST = (d) => { try { return !!(d && (d.getElementById('chat') || d.getElementById('sheld') || d.querySelector('#send_form'))); } catch (e) { return false; } };
        if (!_hasST(document) && window.parent && window.parent !== window && _hasST(window.parent.document)) {
            _AURELIA_SKIP = true; // 我在酒館助手沙盒 iframe，主頁面在 parent
            const pwin = window.parent, pdoc = pwin.document;
            if (!pwin.__AURELIA_BOOTSTRAPPED__) {
                pwin.__AURELIA_BOOTSTRAPPED__ = true;
                pwin.__AURELIA_REF__ = _AURELIA_REF; // 把 ref 傳進主頁面，讓重注入的 index.js + 模組都鎖同一 commit
                pwin.__AURELIA_FROM_CDN__ = true;    // 標記主頁面這份＝從 CDN 重注入 → 強制 CDN 模式，別誤抓同頁其他擴展(如 claude-codex-room)的 index.js 標籤當成自己的資料夾
                if (_AURELIA_CDN_OVERRIDE) pwin.__AURELIA_CDN_BASE__ = _AURELIA_CDN_BASE; // 把 CDN 覆寫(statically.io 等)傳進主頁面，讓重注入的 index.js + 全部模組都走同一條 CDN
                const s = pdoc.createElement('script');
                s.src = _AURELIA_CDN_BASE + '/index.js?boot=' + Date.now();
                // 🩹 注入腳本若載入失敗(jsdelivr 對剛 push 的新 commit 冷快取會 503/timeout) → 解鎖，
                //    否則 __AURELIA_BOOTSTRAPPED__ 凍在 true，重跑同一個 ref 會「完全沒反應」(兩個分支都不走)。
                //    解鎖後使用者重跑 import 即可重試(TauriTavern webview 不銷毀、不會自己歸零)。
                s.onerror = function () {
                    pwin.__AURELIA_BOOTSTRAPPED__ = false;
                    pwin.__AURELIA_REF__ = undefined;
                    pwin.__AURELIA_FROM_CDN__ = undefined;
                    console.warn('[Aurelia] 重注入腳本載入失敗(多半 jsdelivr 冷快取 503) → 已解鎖，重跑 import 即可重試');
                };
                pdoc.head.appendChild(s);
                console.log('[Aurelia] 偵測到酒館助手沙盒 → 已將擴展重新注入主頁面執行');
            } else if (pwin.__AURELIA_REF__ !== _AURELIA_REF) {
                // 🔁 換了 hash，但主頁面 webview 沒被銷毀、還凍結在舊 ref（TauriTavern 常見）→
                //    一次性注入鎖會讓新 hash 永遠進不來。偵測到 ref 變更就強制重載主頁面：
                //    重載後 __AURELIA_BOOTSTRAPPED__ 歸零，會用新 ref 重新 bootstrap。只觸發一次、不會無限重載。
                console.log('[Aurelia] 偵測到 ref 變更（' + pwin.__AURELIA_REF__ + ' → ' + _AURELIA_REF + '）→ 強制重載主頁面套用新版');
                try { pwin.location.reload(); } catch (e) { console.warn('[Aurelia] 強制重載失敗', e); }
            }
        }
    } catch (e) { console.warn('[Aurelia] 沙盒偵測失敗，照原樣在當前環境執行', e); }
})();

// ⚠️ 同頁可能有別的 third-party 擴展(如「Claude/Codex 房間」claude-codex-room)也掛 index.js 標籤。
//    舊版只取「最後一個」會誤抓到它 → 把奧瑞亞檔案往別人資料夾撈 → 整盤 404。
//    改：① 經酒館助手 CDN 重注入(__AURELIA_FROM_CDN__) → 直接走 CDN，根本不掃本地標籤。
//        ② 原生安裝 → 認自己的資料夾(優先 my-tavern-extension；排掉已知兄弟擴展)，都沒有就退 CDN。
const _AURELIA_OTHER_EXTS = ['claude-codex-room'];   // Rae 自己其他獨立擴展，別被當成奧瑞亞
const _AURELIA_EXT_NAME = (() => {
    try {
        const fromCdn = window.__AURELIA_FROM_CDN__
            || (() => { try { return !!(window.parent && window.parent !== window && window.parent.__AURELIA_FROM_CDN__); } catch (e) { return false; } })();
        if (fromCdn) return null;
        const names = [];
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const m = (scripts[i].src || '').match(/scripts\/extensions\/third-party\/([^\/]+)\/index\.js/);
            if (m) names.push(m[1]);
        }
        if (names.includes('my-tavern-extension')) return 'my-tavern-extension';   // 原生奧瑞亞資料夾
        const own = names.filter(n => _AURELIA_OTHER_EXTS.indexOf(n) === -1);
        return own.length ? own[own.length - 1] : null;   // 沒有自己的標籤 → null 退 CDN(總比往別人資料夾撈 404 好)
    } catch (e) {}
    return null; // 偵測不到 = 不是原生安裝（多半是酒館助手從 CDN 匯入）
})();
const _AURELIA_EXT_BASE = _AURELIA_EXT_NAME
    ? './scripts/extensions/third-party/' + _AURELIA_EXT_NAME
    : _AURELIA_CDN_BASE;
// CDN 模式下 EXT_NAME 為 null；下游用到它的本地路徑（TTS 本機模型等）會自行 `|| 'my-tavern-extension'` fallback，
// 那些是本機限定功能，朋友端載不到很正常（會優雅降級，不影響面板本體）。
window.AURELIA_EXT_NAME = _AURELIA_EXT_NAME;
window.AURELIA_EXT_BASE = _AURELIA_EXT_BASE;

// 🔥 防快取參數開關：
//   本機(原生安裝，EXT_NAME 有值) → 加 ?v=時間，方便你開發時即時看到改動。
//   CDN(酒館助手，EXT_NAME 為 null) → 加 ?v=版本號 → 同版本內 jsdelivr/瀏覽器照樣快取(載入快)，
//      但每次「改版 bump _AURELIA_VERSION」後，朋友的瀏覽器會自動重抓模組，不用手動清快取。
//      （index.js 本身是 ?boot= 強制重抓的，所以這個版本號一改、下次載入就生效。）
const _AURELIA_VERSION = '2026.06.12.1'; // ⚠️ 每次發佈更新就 bump 這個（CDN 朋友端靠它更新）
const _AURELIA_CACHE_BUST = _AURELIA_EXT_NAME ? ('?v=' + Date.now()) : ('?v=' + _AURELIA_VERSION);

// 🔥 1. 全局通訊狀態
window.PANEL_COMMUNICATION = {
    ready: false,
    processors: {},
    modulesLoaded: {}
};

// 🔥 2. 模組加載順序
const MODULE_LOAD_ORDER = [
    { name: 'debug_console', path: _AURELIA_EXT_BASE + '/core/debug_console.js', key: 'debugConsole' }, // 🐛 螢幕 console（無 devtools 環境用）— 最先載才攔得到後續 log
    { name: 'aurelia_api', path: _AURELIA_EXT_BASE + '/core/aurelia_api.js', key: 'aureliaApi' }, // 📦 統一資料入口(備用版插座)— 必須最先載
    { name: 'bgm_collector', path: _AURELIA_EXT_BASE + '/bgm-global-collector.js', key: 'bgmCollector' },
    { name: 'loader_core', path: _AURELIA_EXT_BASE + '/core/loader_core.js', key: 'core' },
    { name: 'ui_utilities', path: _AURELIA_EXT_BASE + '/core/ui_utilities.js', key: 'utilities' },
    { name: 'tavern_bridge', path: _AURELIA_EXT_BASE + '/core/tavern_bridge.js', key: 'bridge' },
    { name: 'panel_manager', path: _AURELIA_EXT_BASE + '/core/panel_manager.js', key: 'panelManager' },
    { name: 'claude_terminal', path: _AURELIA_EXT_BASE + '/core/claude_terminal.js', key: 'claudeTerminal' },
    { name: 'void_panels', path: _AURELIA_EXT_BASE + '/core/void/panels.js', key: 'voidPanels' },
    { name: 'void_worldview', path: _AURELIA_EXT_BASE + '/core/void/worldview.js', key: 'voidWorldview' },
    { name: 'void_prompts', path: _AURELIA_EXT_BASE + '/core/void/prompts.js', key: 'voidPrompts' },
    { name: 'void_ambient', path: _AURELIA_EXT_BASE + '/core/void/ambient.js', key: 'voidAmbient' },
    { name: 'void_canvas', path: _AURELIA_EXT_BASE + '/core/void/canvas.js', key: 'voidCanvas' },
    { name: 'void_lobby_stage', path: _AURELIA_EXT_BASE + '/core/void/lobby_stage.js', key: 'voidLobbyStage' },
    { name: 'void_lobby_theater', path: _AURELIA_EXT_BASE + '/core/void/lobby_theater.js', key: 'voidLobbyTheater' },   // 🎭 小劇場（拆自 lobby_stage，靠 _b 橋，必須排它後面）
    { name: 'void_lobby_dress', path: _AURELIA_EXT_BASE + '/core/void/lobby_dress.js', key: 'voidLobbyDress' },   // 👗 裝扮室/右鍵選單/對話紀錄窗（拆自 lobby_stage，靠 _b 橋，必須排它後面）
    { name: 'void_lobby_editor', path: _AURELIA_EXT_BASE + '/core/void/lobby_editor.js', key: 'voidLobbyEditor' },   // 🖊 擺設模式編輯器（拆自 lobby_stage，靠 _b 橋，必須排它後面）
    { name: 'void_lobby_npcs', path: _AURELIA_EXT_BASE + '/core/void/lobby_npcs.js', key: 'voidLobbyNpcs' },   // 🧑‍🤝‍🧑 NPC 生成/名冊（拆自 lobby_stage，靠 _b 橋，必須排它後面）
    { name: 'void_login', path: _AURELIA_EXT_BASE + '/core/void/login.js', key: 'voidLogin' },
    { name: 'void_phone_shell', path: _AURELIA_EXT_BASE + '/core/void/phone_shell.js', key: 'voidPhoneShell' },
    { name: 'app_runtime', path: _AURELIA_EXT_BASE + '/core/void/app_runtime.js', key: 'appRuntime' },
    { name: 'chat_window', path: _AURELIA_EXT_BASE + '/core/chat_window.js', key: 'chatWindow' },
    { name: 'chat_room', path: _AURELIA_EXT_BASE + '/core/chat_room.js', key: 'voidClaudeRoom' },
    { name: 'chat_group', path: _AURELIA_EXT_BASE + '/core/chat_group.js', key: 'chatGroup' },
    { name: 'chat_canvas', path: _AURELIA_EXT_BASE + '/core/chat_canvas.js', key: 'chatCanvas' },
    { name: 'void_terminal', path: _AURELIA_EXT_BASE + '/core/void_terminal.js', key: 'voidTerminal' },
    { name: 'control_center', path: _AURELIA_EXT_BASE + '/core/control_center.js', key: 'controlCenter' },
    { name: 'html_extractor', path: _AURELIA_EXT_BASE + '/core/html_extractor.js', key: 'htmlExtractor' },
    { name: 'story_extractor', path: _AURELIA_EXT_BASE + '/core/story_extractor.js', key: 'storyExtractor' },
    { name: 'vn_free_mode', path: _AURELIA_EXT_BASE + '/core/vn_free_mode.js', key: 'vnFreeMode' },   // 🎲 自由模式（總綱二選一+歷史表情格剝除，藏書切換）

    { name: 'regex_bridge', path: _AURELIA_EXT_BASE + '/core/aurelia_regex_bridge.js', key: 'regexBridge' },
    { name: 'vn_dom_bridge', path: _AURELIA_EXT_BASE + '/core/vn_dom_bridge.js', key: 'vnDomBridge' }
];

// 🔥 [配置] 手機系統檔案列表 (已移除寵物/不夜城/育兒/刑偵/WB/錢包，且移除酒館不需要的 AVS 與獨立世界書)
const PHONE_BASE_PATH = _AURELIA_EXT_BASE + '/os_phone/';
const PHONE_FILES = [
    // === 🟢 OS 層 (系統基礎) ===
    'os/os_settings.js',
    'os/os_db.js',
    'os/app_store.js',
    'os/os_sync.js',
    'os/os_persona.js',
    'os/os_prompts.js', // 提示詞底層需要保留，但 UI 按鈕已透過 isStandalone 隱藏
    'os/os_lorebook.js',
    'os/os_contacts.js',
    'os/os_tavern_bridge.js',
    'os/os_bridge.js',
    'os/os_avs_adapter.js',   // 雙端切換層：必須在 engine / rules 之前載入
    'os/os_avs_engine.js',
    'os/os_avs_rules.js',
    'os/os_avs_state.js',     // STATE 管理 UI（從 status_panel 搬入；必須在 os_avs.js 之前）
    'os/os_avs_memory.js',    // 📝 記憶 分頁 UI（向量記憶；必須在 os_avs.js 之前）
    'os/os_avs.js',           // 變數工坊 UI（PWA / 酒館共用一套面板）
    'os/os_studio.js',        // 靈感創作室（VN UI 煉丹，PWA / 酒館共用）
    'os/os_studio_worldbook.js', // 🌍 世界書設計師（自 os_studio.js 拆出；靠 OS_STUDIO._b 橋，必須在其後載入）
    'os/os_api_engine.js',
    'os/os_vector_engine.js', // 向量記憶引擎（embed/ingest/search；酒館原本沒載入，補上）
    'os/os_vector_inject.js', // 酒館版記憶召回注入器（GENERATION_STARTED → injectPrompts）
    'os/os_app_memory_inject.js', // app→酒館 記憶反向注入器（在場角色的手機近況，唯讀注入不貼回 chat）
    'os/os_summary_inject.js', // 酒館版大總結程式注入器（OS_DB tavern_summary → 壓縮 → injectPrompts；搬出世界書）
    'os/phone_system.js',
    'os/os_monitor.js',
    'os/os_minimax.js',
    'os/translation_manager.js',
    'os/os_image_manager.js',
    'os/os_control_room.js',     // 🎛️ 控制室：監控/遙控桌面控制塔（SoVITS+ComfyUI）

    'os/os_achievement.js',
    'os/os_backup.js',
    'os/os_404_store.js',
    'os/os_tarot.js',
    'os/os_spend_panel.js',
    'os/os_board.js',
    'os/os_card_import.js',
    'os/nai_recipe.js',
    'os/os_journal.js',
    'os/os_story_tools.js',   // 故事管理（大總結 + 隱藏對話）— 從 RPG 面板 / VN 閱讀器搬來，掛進故事日誌
    'os/os_workbench.js',

    // === 📖 VN 視覺小說系統 ===
    'vn_story/vn_styles.js',
    'vn_story/vn_settings.js',
    'vn_story/vn_tts.js',
    'vn_story/vn_tts_panel.js',
    // vn_core 拆分後的底層工具（必須先於 vn_core.js 載入）
    'vn_story/vn_cache.js',
    'vn_story/vn_config.js',
    'vn_story/vn_monitor.js',
    'vn_story/vn_summary.js',
    'vn_story/vn_sticker.js',
    'vn_story/vn_panels.js',
    'vn_story/vn_generator.js',
    'vn_story/vn_dynamic_parser.js',   // 創作室（展廳）動態標籤引擎 — 原本只有 PWA(index.html) 載，酒館漏載害自建 tag 摸不到 → 補上
    'vn_story/vn_theme.js',            // VN 劇情面板主題（[World|] 驅動換樣式）— 須在 vn_core 前
    'vn_story/vn_fx.js',               // ⚡ 畫面特效引擎（#fx-id# 標記由 vn_core 抽取路由過來）
    'vn_story/vn_core.js',
    'vn_story/vn_scene_insert.js',     // 副模型場景插圖渲染器（state_runtime.extractOnce → splice 進 VN 劇本）
    'vn_story/vn_avatar_earlybird.js', // 頭像早鳥：串流/訊息落地搶先生成 ChapterCard 的 [Avatar|...]（須在 vn_core 後）
    'vn_story/vn_inspect.js',
    'vn_story/vn_phone.js',
    'vn_story/vn_reader.js',
    'vn_story/vn_ui_workshop.js',

    // === 🛡️ RPG 狀態系統 ===
    'rpg/state_schema.js',         // Stage 1：主模型生 schema
    'rpg/npc_dossier.js',          // 📇 NPC 長期人物檔案（群像卡防失憶；state_runtime 搭便車建檔＋名冊/名字觸發注入）
    'rpg/state_runtime.js',        // Stage 2：副模型抽 + patch + injectPrompts
    'rpg/blacklist_injector.js',   // 每輪 inject 黑名單條目（避免世界書 keys 觸發漏掉）
    'rpg/avatar_rules_injector.js', // 依選的頭像產圖器，自動翻「-VN小說家-」世界書三條目(依名字)的開關
    // 'rpg/summary_core.js',  // ⛔ 已刪(2026-06-19)：舊「<summary>→[RPG_LOG]世界書」自動寫入，key 從不觸發=寫了沒人讀，已被 AVS+向量+大總結取代
    'rpg/status_panel.js',
    // 'rpg/avatar_manager.js',  // ⛔ 已停用：廢棄舊檔，會與 VN 頭像系統並行重複生成同一角色（浪費資源）+ 亂跳「已收錄」toast。檔案保留；vn_core 仍會讀世界書既有頭像。

    // === 🗺️ MAP 地圖系統 ===
    'map/map_data.js',
    'map/world_runtime.js',
    'map/world_generator.js',
    'map/schedule_engine.js',
    'map/scene_map_engine.js',
    'map/map_core.js',

    // === 🔵 微信 (WeChat) ===
    'wx/wx_user_profile.js', 'wx/wx_theme.js',
    'wx/wx_contacts.js', 'wx/wx_chat_settings.js', 'wx/wx_bubble_settings.js',
    'wx/wx_message_manager.js', 'wx/wx_view.js', 'wx/wx_core.js',
    'wx/wx_tavern_api_bridge.js',

    // === 📞 電話 (dialer) ===
    'os/os_dialer.js',

    // === 🟣 微薄 (Weibo) — 搬回酒館（順序同 PWA index.html）===
    'wb/wb_user_profile.js', 'wb/wb_account.js', 'wb/wb_theme.js',
    'wb/wb_view.js', 'wb/wb_core.js'
];

// CSS 內相對 url() 改寫成絕對(相對 CSS 檔自己的目錄)。
//   inline <style> 的相對 url 會相對「文件根」而非 CSS 檔→打斷資產路徑，故改絕對。
function _absolutizeCssUrls(css, cssPath) {
    const dir = cssPath.replace(/[?#].*$/, '').replace(/[^/]*$/, '');   // 去 query/hash 後留到最後一個 /
    return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
        const t = u.trim();
        if (/^(https?:|data:|blob:|#|\/)/i.test(t)) return m;   // 絕對 / data / blob / 錨點不動
        try { return 'url(' + q + new URL(dir + t, document.baseURI).href + q + ')'; }
        catch (e) { return m; }
    });
}

// 載入 CSS 工具 (🔥 修復酒館模式破圖的關鍵)
//   改 fetch→inline <style> 而非 <link rel=stylesheet>：酒館某些版本把 .css 回成 text/plain，
//   瀏覽器開 strict MIME(nosniff) 後 <link> 會被拒套("Refused to apply style")；純文字注入 <style>
//   不做 MIME 檢查，繞過。同時相容本地/CDN(jsdelivr 帶 CORS)。
function loadCSS(path) {
    return new Promise((resolve) => {
        const MAX = 3;
        let attempt = 0;
        // 先同步插空 <style> 佔位 → 保 cascade 順序＝呼叫順序(平行 fetch 完成順序不定)
        const style = document.createElement('style');
        style.setAttribute('data-aurelia-css', path);
        document.head.appendChild(style);
        const tryLoad = () => {
            attempt++;
            // 重試時加唯一參數：繞過瀏覽器對「上次失敗」的快取，也給 jsdelivr 新 commit 冷快取暖機時間
            const url = path + _AURELIA_CACHE_BUST + (attempt > 1 ? ('&_retry=' + attempt) : '');
            fetch(url)
                .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
                .then(css => { style.textContent = _absolutizeCssUrls(css, path); resolve(); })
                .catch(() => {
                    if (attempt < MAX) {
                        setTimeout(tryLoad, 600 * attempt);   // 退避重試(jsdelivr 新 commit 並行冷載常少數檔噴錯，稍等就好)
                    } else {
                        console.error(`[Aurelia] 核心樣式載入失敗(已重試 ${MAX} 次): ${path}`);
                        resolve();
                    }
                });
        };
        tryLoad();
        if (!_AURELIA_EXT_NAME) resolve(); // CDN 模式：立即放行讓 CSS 平行下載(失敗的會在背景自動重試、自癒，不阻塞初始化)
    });
}

// 載入模組工具
async function loadModule(conf) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = conf.path + _AURELIA_CACHE_BUST;
        s.async = false;
        s.onload = () => { window.PANEL_COMMUNICATION.modulesLoaded[conf.key] = true; resolve(); };
        s.onerror = () => { console.error(`載入失敗: ${conf.name}`); reject(new Error(`Load failed: ${conf.name}`)); };
        document.head.appendChild(s);
    });
}

// 手機腳本載入工具
function loadPhoneScript(path) {
    return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = PHONE_BASE_PATH + path + _AURELIA_CACHE_BUST;
        s.onload = () => resolve();
        s.onerror = () => { console.error(`[PhoneOS] 缺失腳本: ${path}`); resolve(); }; 
        document.head.appendChild(s);
    });
}

// CDN 並行載入器：一次插入全部 <script>，async=false → 平行下載、依插入順序執行(保留依賴順序)
//   ⚠️ jsdelivr 對「剛 push 的新 commit」冷啟動抓檔時，並行請求會隨機 403/限流掉幾個檔
//      → 那個模組整個沒了→大廳死。故失敗要自動重試(退避 + cache-bust 繞開 jsdelivr 負快取)，
//        而非一次 onerror 就放掉。重試是自我註冊型 IIFE、依賴在 runtime 才解，遲到幾百ms無妨。
function _loadOne(item, attempt) {
    return new Promise((resolve) => {
        const s = document.createElement('script');
        // 重試時加 cache-bust 參數，避免 jsdelivr/瀏覽器把上次的 403 當負快取回放
        let src = item.src;
        if (attempt > 0) src += (src.indexOf('?') >= 0 ? '&' : '?') + 'rt=' + attempt;
        s.src = src;
        s.async = false;
        s.onload = () => { if (item.key) window.PANEL_COMMUNICATION.modulesLoaded[item.key] = true; resolve(true); };
        s.onerror = () => {
            try { s.remove(); } catch (e) {}
            if (attempt < 3) {
                const wait = 400 * (attempt + 1);   // 400 / 800 / 1200 ms 退避
                console.warn(`[Aurelia] 載入失敗(第${attempt + 1}次)，${wait}ms 後重試:`, item.src);
                setTimeout(() => { _loadOne(item, attempt + 1).then(resolve); }, wait);
            } else {
                console.error('[Aurelia] 並行載入失敗(重試3次仍失敗):', item.src);
                resolve(false);
            }
        };
        document.head.appendChild(s);
    });
}
function _loadBatchOrdered(list) {
    return Promise.all(list.map(item => _loadOne(item, 0)));
}

// 讀取設置
function getExtensionSettings() {
    if (typeof window.extension_settings === 'undefined') window.extension_settings = {};
    let settings = window.extension_settings['多功能面板系統'];
    if (!settings) {
        try {
            const saved = localStorage.getItem('extension_settings');
            if (saved) settings = JSON.parse(saved)['多功能面板系統'];
        } catch (e) {}
    }
    if (!settings) {
        settings = { enabled: true, mount: { mode: 'embedded', selector: '#chat', placement: 'bottom' } };
    }
    return settings;
}

// 🔥 核心：監聽酒館消息 (已移除金錢與物品解析，僅保留成就解鎖)
function setupMessageListener() {
    console.log('[System] 啟動結算監聽器 (僅成就)...');
    
    if (window.eventOn) {
        window.eventOn('message_received', async (messageId) => {
            setTimeout(async () => {
                try {
                    const context = window.SillyTavern.getContext();
                    const chat = context.chat;
                    const lastMsg = chat[messageId];
                    if (!lastMsg || !lastMsg.mes) return;

                    const content = lastMsg.mes;
                    
                    // 🏆 成就解鎖（全局監聽）
                    //   新格式：[Achievement|emotion|名|描述]   (V1.2+)
                    //   舊格式：[Achievement|名|描述]           (向下相容)
                    const achRegex = /\[Achievement\|([^\]]+)\]/g;
                    let achMatch;
                    while ((achMatch = achRegex.exec(content)) !== null) {
                        const parts = achMatch[1].split('|').map(s => s.trim());
                        let achEmotion = null, achName = '', achDesc = '';
                        if (parts.length >= 3) {
                            achEmotion = parts[0] || null;
                            achName    = parts[1] || '';
                            achDesc    = parts[2] || '';
                        } else {
                            achName = parts[0] || '';
                            achDesc = parts[1] || '';
                        }
                        if (achName && window.OS_ACHIEVEMENT?.unlock) {
                            window.OS_ACHIEVEMENT.unlock(achEmotion, achName, achDesc);
                        }
                    }
                } catch (err) { console.error('監聽錯誤:', err); }
            }, 500);
        });
    }
}

// 核心初始化
async function initializeExtension() {
    // 單實例守衛：原生安裝(my-tavern-extension/index.js) 與酒館助手 CDN 重注入那份可能同時在主頁面 →
    //   只讓先到的一份跑(兩份都是完整奧瑞亞、誰贏都行)，避免雙載重複注入 UI。
    if (window.__AURELIA_INITIALIZED__) { console.warn('[Aurelia] 已有一份在執行 → 這份跳過(避免 native+助手雙載)'); return; }
    window.__AURELIA_INITIALIZED__ = true;
    try {
        setupEventBridge();

        // 🔥 1. 強制載入核心 CSS，解決大廳與設置破圖問題
        console.log('[System] 正在載入核心樣式 (CSS)...');
        await loadCSS(_AURELIA_EXT_BASE + '/aurelia_core_st.css');
        await loadCSS(_AURELIA_EXT_BASE + '/core/void/lobby.css');
        await loadCSS(_AURELIA_EXT_BASE + '/core/void/lobby_stage.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/phone_shell.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/app_store.css');

        // core 模組 CSS（兩版共用，selector 已 scoped 不污染酒館）
        await loadCSS(_AURELIA_EXT_BASE + '/css/toast_manager.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/story_extractor.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/html_extractor.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/image_settings_panel.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/settings_manager.css');

        // os_phone/os 模組 CSS
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_settings.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_control_room.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_studio.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_worldbook.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_persona.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_prompts.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_avs.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_avs_rules.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_think.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_debug_panel.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_tarot.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_journal.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_story_tools.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_workbench.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_user_center.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_monitor.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_barrage.css');

        // vn_story / qb / wx / map / rpg 模組 CSS
        await loadCSS(_AURELIA_EXT_BASE + '/css/vn_styles.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/vn_core.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/vn_fx.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/vn_gallery.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/vn_tts_panel.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/vn_ui_workshop.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/qb_core.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/qb_os_404_chaos.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/wx_chat_settings.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/map_core.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/rpg_status_panel.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/void_achievement.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/void_claude_recents.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/void_claude_ask.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/chat_window.css');
        await loadCSS(_AURELIA_EXT_BASE + '/css/os_board.css');

        if (_AURELIA_EXT_NAME) {
            // 本機：維持原樣(本地讀檔極快、且已驗證穩定，不動)
            for (const conf of MODULE_LOAD_ORDER) await loadModule(conf);
            console.log('[System] 正在掛載手機模組...');
            for (const file of PHONE_FILES) await loadPhoneScript(file);
        } else {
            // CDN：並行下載、依序執行 → 解決 130 個檔排隊造成的數秒延遲
            console.log('[System] CDN 並行載入核心模組...');
            await _loadBatchOrdered(MODULE_LOAD_ORDER.map(c => ({ src: c.path + _AURELIA_CACHE_BUST, key: c.key })));
            console.log('[System] CDN 並行載入手機模組...');
            await _loadBatchOrdered(PHONE_FILES.map(f => ({ src: PHONE_BASE_PATH + f + _AURELIA_CACHE_BUST })));
        }
        
        // 延遲執行：確保 PhoneSystem 和各個 App 模組都載入完畢後再註冊圖標
        setTimeout(() => {
            if (window.PhoneSystem) {
                // 註冊 RPG 狀態
                if (window.RPG_PANEL) {
                    window.PhoneSystem.install('RPG 狀態', '🛡️', '#5d4037', window.RPG_PANEL.launch);
                }

                // 註冊賽博塔羅系統
                if (window.OS_TAROT) {
                    window.PhoneSystem.install('賽博塔羅', '🔮', '#9b59b6', window.OS_TAROT.launch);
                }

                // 註冊地圖系統
                if (window.OS_MAP) {
                    window.PhoneSystem.install('地圖', '🗺️', '#2f9544', window.OS_MAP.launchApp);
                }

                // 註冊 VN 視覺小說
                if (window.VN_STORY) { 
                    window.PhoneSystem.install('故事模式', '📖', '#ff69b4', window.VN_STORY.launch);
                }

                // 註冊設置 (確保它在最後)
                if (window.OS_SETTINGS) {
                     window.PhoneSystem.install('設置', '⚙️', '#4c4c4c', window.OS_SETTINGS.launchApp);
                }
            }
            
            // 啟動監聽器
            setupMessageListener();

        }, 1500);

        installAPI();
        registerSettingsPage();

        setTimeout(() => {
            if (window.AureliaUIUtils) {
                window.AureliaUIUtils.init();
                overrideToggleLogic();
            }
        }, 1000);

        console.log('✅ 多功能面板系統 (V4.3 Clean) 已就緒');
    } catch (e) { console.error('啟動錯誤:', e); }
}

function registerSettingsPage() {
    try {
        if (typeof window.registerSettings === 'function') {
            window.registerSettings('多功能面板系統', _AURELIA_EXT_BASE + '/settings.html');
        } else {
            createManualSettingsPage();
        }
    } catch (error) {
        createManualSettingsPage();
    }
}

function createManualSettingsPage() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectSettingsPage);
    } else {
        injectSettingsPage();
    }
}

function injectSettingsPage() {
    try {
        let settingsContainer = document.querySelector('#extensions_settings');
        if (!settingsContainer) {
            settingsContainer = document.createElement('div');
            settingsContainer.id = 'extensions_settings';
            settingsContainer.style.display = 'none';
            document.body.appendChild(settingsContainer);
        }
        
        const settingsPageContainer = document.createElement('div');
        settingsPageContainer.id = 'multi_panel_settings_container';
        settingsPageContainer.innerHTML = `
            <div class="extension_settings">
                <div id="multi_panel_settings_content"></div>
            </div>
        `;
        settingsContainer.appendChild(settingsPageContainer);
        loadSettingsContent();
    } catch (error) {}
}

function loadSettingsContent() {
    try {
        fetch(_AURELIA_EXT_BASE + '/settings.html')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.text();
            })
            .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const settingsContent = doc.querySelector('#multi_panel_settings');
                const settingsScriptContent = doc.querySelector('script'); 

                if (settingsContent) {
                    const targetContainer = document.getElementById('multi_panel_settings_content');
                    targetContainer.innerHTML = settingsContent.outerHTML;
                    
                    if (settingsScriptContent) {
                        const script = document.createElement('script');
                        if (typeof window.extension_settings === 'undefined') window.extension_settings = {};
                        script.textContent = settingsScriptContent.textContent;
                        document.body.appendChild(script);
                    }
                }
            })
            .catch(e => console.error('無法載入設置頁面', e));
    } catch (e) {}
}

function overrideToggleLogic() {
    const originalToggle = window.AureliaControlCenter ? window.AureliaControlCenter.toggle : null;

    const smartToggle = () => {
        const settings = getExtensionSettings();
        const mount = settings.mount || { mode: 'embedded', selector: '#chat', placement: 'bottom' };

        if (mount.mode === 'embedded') {
            const target = document.querySelector(mount.selector) || 
                           document.querySelector('#chat') || 
                           document.querySelector('.chat-body');
            
            if (target) {
                if (window.AureliaControlCenter && window.AureliaControlCenter.mountEmbedded) {
                    if (!window.AureliaControlCenter.isEmbeddedMounted()) {
                        const useFixed = mount.placement === 'bottom';
                        window.AureliaControlCenter.mountEmbedded(target, mount.placement, useFixed);
                    } else {
                        if (originalToggle) originalToggle.call(window.AureliaControlCenter);
                    }
                    return;
                }
            }
            
            console.log('[Aurelia] 尚未找到 #chat，啟動監聽器...');
            const obs = new MutationObserver(() => {
                const t = document.querySelector(mount.selector) || document.querySelector('#chat');
                if (t && window.AureliaControlCenter) {
                    const useFixed = mount.placement === 'bottom';
                    window.AureliaControlCenter.mountEmbedded(t, mount.placement, useFixed);
                    obs.disconnect();
                }
            });
            obs.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => obs.disconnect(), 10000);

        } else {
            if (window.AureliaControlCenter && window.AureliaControlCenter.isEmbeddedMounted && window.AureliaControlCenter.isEmbeddedMounted()) {
                window.AureliaControlCenter.unmountEmbedded();
            }
            if (originalToggle) originalToggle.call(window.AureliaControlCenter);
        }
    };

    if (window.AureliaControlCenter) window.AureliaControlCenter.toggle = smartToggle;
    window.toggleControlCenter = smartToggle;
}

function installAPI() {
    window.toggleVnPanel = () => safeTogglePanel('VN');
    window.toggleHtmlExtractor = () => window.AureliaHtmlExtractor?.show();
    window.toggleSettingsPanel = () => window.AureliaSettingsManager?.toggle();
    window.togglePhoneSystem = () => {
        if (window.PhoneSystem) window.PhoneSystem.show();
        else console.warn('手機系統載入中...');
    };

    window.openPanel = function(type) {
        const t = type.toUpperCase();
        if (t === 'STORY' || t === 'VN') safeTogglePanel('VN');
        else if (t === 'HTML_EXTRACTOR') window.AureliaHtmlExtractor?.show();
        else if (t === 'PHONE') window.togglePhoneSystem();
    };

    window.AureliaLoader = {
        toggleVnPanel: window.toggleVnPanel,
        toggleHtmlExtractor: window.toggleHtmlExtractor,
        toggleSettingsPanel: window.toggleSettingsPanel,
        togglePhoneSystem: window.togglePhoneSystem,
        hidePhoneModal: () => window.AureliaControlCenter?.hide(),
        openPhoneApp: function(targetAppName) {
            if (!window.AureliaControlCenter) return;
            if (typeof window.AureliaControlCenter.showOsApp === 'function') {
                window.AureliaControlCenter.showOsApp(targetAppName);
            }
        }
    };
    
    Object.defineProperty(window.AureliaLoader, 'isPhoneModalVisible', {
        get: function() { return window.AureliaControlCenter && window.AureliaControlCenter.isVisible(); }
    });
}

function safeTogglePanel(type) {
    const pm = window.AureliaPanelManager;
    if (pm) {
        pm.togglePanel(type);
        if (window.eventEmit && type === 'VN') {
            console.log(`🔔 [Aurelia] 廣播事件: VN_PANEL_OPENED`);
            window.eventEmit('VN_PANEL_OPENED');
        }
        if (window.AureliaControlCenter?.isVisible()) window.AureliaControlCenter.hide();
    }
}

function setupEventBridge() {
    console.log("🔥 [Aurelia] 初始化通訊橋樑...");
    if (!window.eventEmit) {
        window.eventEmit = function(eventName, data) {
            if (window.eventSource && typeof window.eventSource.emit === 'function') {
                window.eventSource.emit(eventName, data);
            }
            const payload = { type: eventName, data: data };
            document.querySelectorAll('iframe').forEach(iframe => {
                try { iframe.contentWindow.postMessage(payload, '*'); } catch(e){}
            });
            window.dispatchEvent(new CustomEvent(eventName, { detail: data }));
        };
    }
    // 📦 「統一資料入口 / 備用版插座」已搬到獨立模塊 core/aurelia_api.js（它在模組載入第一個就跑）。
    //    那裡負責設好 window.AureliaAPI + window.TavernHelper fallback —— 助手在用助手、不在走原生備用。
    //    要補更多原生備用方法，只改 aurelia_api.js 一處，不再散落在 index.js。

    function tryBridgeEventSource() {
        if (window.SillyTavern?.getContext) {
            try {
                const ctx = window.SillyTavern.getContext();
                if (ctx.eventSource) {
                    window.eventSource = ctx.eventSource;
                    window.event_types = ctx.eventTypes;
                    window.eventOn = (t, h) => ctx.eventSource.on(t, h);
                    window.eventOnce = (t, h) => ctx.eventSource.once(t, h);
                    window.eventOnButton = (n, h) => ctx.eventSource.on(`button_${n}`, h);
                    window.tavern_events = ctx.eventTypes;
                    return true;
                }
            } catch (e) {}
        }
        return false;
    }
    if (!tryBridgeEventSource()) {
        let n = 0;
        const i = setInterval(() => { if (tryBridgeEventSource() || ++n > 20) clearInterval(i); }, 500);
    }
    setTimeout(() => {
        if (window.eventEmit) {
            console.log("🔔 [Aurelia] System Ready");
            window.eventEmit('APP_READY'); 
            window.eventEmit('VN_PANEL_READY');
            window.eventEmit('CHAT_CHANGED');
        }

        function updateControlCenterTitle() {
            if (!window.AureliaControlCenter || !window.AureliaControlCenter.setChatTitle) return;
            if (window.SillyTavern && window.SillyTavern.getContext) {
                const ctx = window.SillyTavern.getContext();
                if (ctx.chatId) {
                    let fullPath = ctx.chatId;
                    let fileName = fullPath.split(/[\\/]/).pop();
                    let finalName = fileName.replace(/\.jsonl?$/i, '').replace(/\.json$/i, '');
                    window.AureliaControlCenter.setChatTitle(finalName);
                    return;
                }
            }
        }

        updateControlCenterTitle();
        
        const retryTimer = setInterval(() => {
            updateControlCenterTitle();
        }, 1000); 
        
        if (window.eventSource) {
            const refresh = () => setTimeout(updateControlCenterTitle, 200);
            window.eventOn('chat_id_changed', refresh);
            window.eventOn('character_loaded', refresh);
            window.eventOn('chat_saved', refresh);
        }

        window.addEventListener('click', () => setTimeout(updateControlCenterTitle, 200));

    }, 2000);
    window.addEventListener('message', (e) => {
        if (e.data?.type === 'REQUEST_OPEN_PANEL') {
            const t = e.data.data?.panelType;
            if (t) window.openPanel(t);
        }
    });
}

if (!_AURELIA_SKIP) {
    // 沙盒 iframe 那份(_AURELIA_SKIP=true)不啟動；真正執行的是被重新注入主頁面的那份
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeExtension);
    else initializeExtension();
}