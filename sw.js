/**
 * Aurelia Service Worker — iOS PWA 背景恢復快取
 * 策略：Cache-First for static assets, Network-First for index.html
 */

const CACHE_NAME = 'aurelia-shell-v1';

// App Shell 靜態資源（index.html 載入所需的核心檔案）
const SHELL_ASSETS = [
    './',
    './index.html',
    './aurelia_core.css',
    './core/panel_manager.js',
    './core/ui_utilities.js',
    './core/void_terminal.js',
    './core/control_center.js',
    './core/settings_manager.js',
    './os_phone/os/os_settings.js',
    './os_phone/os/os_db.js',
    './os_phone/os/os_api_engine.js',
    './os_phone/os/os_avs_engine.js',
    './os_phone/os/os_avs_rules.js',
    './os_phone/os/os_avs.js',
    './os_phone/os/os_worldbook.js',
    './os_phone/os/os_prompts.js',
    './os_phone/os/os_card_import.js',
    './os_phone/os/phone_system.js',
    './os_phone/vn_story/vn_styles.js',
    './os_phone/vn_story/vn_core.js',
    './os_phone/qb/qb_bookshelf.js',
    './os_phone/qb/qb_core.js',
];

// ── Install：預快取 App Shell ────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // 逐一快取，單個失敗不影響整體
            return Promise.allSettled(
                SHELL_ASSETS.map(url =>
                    cache.add(url).catch(() => {/* 靜默忽略單個快取失敗 */})
                )
            );
        }).then(() => self.skipWaiting())
    );
});

// ── Activate：清除舊版快取 ───────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch：快取策略 ──────────────────────────────────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 只處理同源請求，跳過 API 呼叫（外部 URL）
    if (url.origin !== self.location.origin) return;

    // index.html：Network-First（確保最新版本），網路失敗才用快取
    if (url.pathname === '/' || url.pathname.endsWith('/index.html')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 靜態資源（JS/CSS）：Cache-First，快取找不到再請求網路
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                }
                return response;
            });
        })
    );
});
