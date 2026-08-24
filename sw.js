/**
 * Aurelia Service Worker v3
 * ?????????????????????????????????????????????????????????????
 * 蝑隤芣?嚗? *   HTML / JS / CSS  ??Network-First嚗偶?????啁?嚗蝺??典翰??
 *   ?? / 摮?      ??Cache-First  嚗?撣貉???敹怠??芸??翰?漲嚗? *
 * ?? 瘥活?函蔡?芷?????CACHE_VERSION ??1嚗OS 撠望?撘瑕?湔嚗? * ?????????????????????????????????????????????????????????????
 */

const CACHE_VERSION = 195;                         // ??瘥活?函蔡 +1
const CACHE_NAME    = `aurelia-shell-v${CACHE_VERSION}`;

// App Shell ?詨?鞈?嚗?潮蝺??湛?
const SHELL_ASSETS = [
    './',
    './index.html',
    './aurelia_core.css',
    './core/void/lobby.css',
    // css/ 璅∠?璅??嚗???JS ?賡敺??葉?嚗?    './css/story_extractor.css',
    './css/story_entry_wizard.css',
    './css/html_extractor.css',
    './css/os_settings.css',
    './css/os_studio.css',
    './css/os_worldbook.css',
    './css/os_persona.css',
    './css/os_prompts.css',
    './css/os_avs.css',
    './css/os_avs_rules.css',
    './css/os_think.css',
    './css/os_debug_panel.css',
    './css/os_tarot.css',
    './css/os_monitor.css',
    './css/vn_styles.css',
    './css/vn_core.css',
    './css/vn_tts_panel.css',
    './css/vn_ui_workshop.css',
    './css/qb_core.css',
    './css/qb_os_404_chaos.css',
    './css/wx_chat_settings.css',
    './css/map_core.css',
    './css/rpg_status_panel.css',
    './css/void_achievement.css',
    './core/panel_manager.js',
    './core/ui_utilities.js',
    './core/void_terminal.js',
    './core/control_center.js',
    './os_phone/os/os_settings.js',
    './os_phone/os/os_settings_comfyui.js',
    './os_phone/os/os_settings_voice.js',
    './os_phone/os/os_db.js',
    './os_phone/os/os_api_engine.js',
    './os_phone/os/os_avs_engine.js',
    './os_phone/os/os_avs_rules.js',
    './os_phone/os/os_avs.js',
    './os_phone/os/os_worldbook.js',
    './os_phone/os/os_prompts.js',
    './os_phone/os/os_card_import.js',
    './os_phone/os/os_card_regex.js',
    './os_phone/os/phone_system.js',
    './os_phone/vn_story/vn_styles.js',
    './os_phone/vn_story/vn_settings.js',
    './os_phone/vn_story/vn_tts.js',
    './os_phone/vn_story/vn_tts_panel.js',
    './os_phone/vn_story/vn_core.js',
    './os_phone/qb/qb_bookshelf.js',
    './os_phone/qb/qb_core.js',
];

// ?? Install嚗?敹怠?嚗?亙?蝬脰楝???啁?嚗??????????????????????
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            Promise.allSettled(
                SHELL_ASSETS.map(url =>
                    fetch(url, { cache: 'no-store' })   // 撘瑕蝜? HTTP 敹怠?
                        .then(res => {
                            if (res && res.status === 200) cache.put(url, res);
                        })
                        .catch(() => {/* ??敹賜?桀仃??*/})
                )
            )
        ).then(() => self.skipWaiting())  // ??SW 蝡?亦恣嚗?蝑?????
    );
});

// ?? Activate嚗?斗????翰??蝡?亦恣?????????????????
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())  // 蝡?亦恣嚗?蝑??唳??    );
});

// ?? Fetch嚗?鞈?憿?瘙箏?蝑 ????????????????????????????????
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 頝喲?頝典?嚗PI / CDN 摮? / catbox ??嚗?    if (url.origin !== self.location.origin) return;

    const path = url.pathname;
    const isCodeFile = /\.(js|css|html)(\?.*)?$/.test(path) || path === '/' || path.endsWith('/');

    if (isCodeFile) {
        // ?? Network-First嚗TML / JS / CSS ??
        // 瘥活?賢??雯頝舀??啁?嚗????湔敹怠?嚗?        // ?Ｙ??雯頝臬仃????啣翰??蝣箔? PWA 隞雿輻??        event.respondWith(
            fetch(event.request, { cache: 'no-store' })
                .then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    } else {
        // ?? Cache-First嚗???/ 摮?蝑???皞???
        // 敹怠??賭葉撠梁?亥???敹恬?嚗????餅?銝血??亙翰??        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    }
                    return response;
                }).catch(() => cached); // 摰?Ｙ????敺?摨?            })
        );
    }
});
