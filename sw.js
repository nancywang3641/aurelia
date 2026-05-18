/**
 * Aurelia Service Worker v3
 * ─────────────────────────────────────────────────────────────
 * 策略說明：
 *   HTML / JS / CSS  → Network-First（永遠先抓最新版，離線才用快取）
 *   圖片 / 字型      → Cache-First  （不常變動，快取優先加快速度）
 *
 * ⚠️ 每次部署只需把下面 CACHE_VERSION 加 1，iOS 就會強制更新！
 * ─────────────────────────────────────────────────────────────
 */

const CACHE_VERSION = 146;                         // ← 每次部署 +1
const CACHE_NAME    = `aurelia-shell-v${CACHE_VERSION}`;

// App Shell 核心資源（用於離線備援）
const SHELL_ASSETS = [
    './',
    './index.html',
    './aurelia_core.css',
    './core/void/lobby.css',
    // css/ 模組樣式（從各 JS 抽離後的集中區）
    './css/toast_manager.css',
    './css/story_extractor.css',
    './css/html_extractor.css',
    './css/image_settings_panel.css',
    './css/settings_manager.css',
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
    './css/os_user_center.css',
    './css/os_monitor.css',
    './css/os_barrage.css',
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
    './os_phone/vn_story/vn_settings.js',
    './os_phone/vn_story/vn_tts.js',
    './os_phone/vn_story/vn_tts_panel.js',
    './os_phone/vn_story/vn_core.js',
    './os_phone/qb/qb_bookshelf.js',
    './os_phone/qb/qb_core.js',
];

// ── Install：預快取（直接從網路抓最新版）──────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            Promise.allSettled(
                SHELL_ASSETS.map(url =>
                    fetch(url, { cache: 'no-store' })   // 強制繞過 HTTP 快取
                        .then(res => {
                            if (res && res.status === 200) cache.put(url, res);
                        })
                        .catch(() => {/* 靜默忽略單個失敗 */})
                )
            )
        ).then(() => self.skipWaiting())  // 新 SW 立刻接管，不等舊分頁關閉
    );
});

// ── Activate：刪除所有舊版快取，立刻接管所有分頁 ────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())  // 立刻接管，不等重新整理
    );
});

// ── Fetch：依資源類型決定策略 ────────────────────────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 跳過跨域（API / CDN 字型 / catbox 圖片）
    if (url.origin !== self.location.origin) return;

    const path = url.pathname;
    const isCodeFile = /\.(js|css|html)(\?.*)?$/.test(path) || path === '/' || path.endsWith('/');

    if (isCodeFile) {
        // ── Network-First：HTML / JS / CSS ──
        // 每次都先抓網路最新版，成功後更新快取；
        // 離線或網路失敗才回落到快取，確保 PWA 仍可使用。
        event.respondWith(
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
        // ── Cache-First：圖片 / 字型等靜態資源 ──
        // 快取命中就直接返回（快），沒有再去抓並存入快取。
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    }
                    return response;
                }).catch(() => cached); // 完全離線時的最後保底
            })
        );
    }
});
