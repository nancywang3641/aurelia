// ----------------------------------------------------------------
// [檔案] phone_system.js (V4.0 - Shim Mode)
// 職責：API 相容層。視覺手機框架已移除。
//       wx/wb/錢包 直接透過 AureliaControlCenter.showOsApp() 開啟面板。
//       所有 win.PhoneSystem.install / goHome / launchApp 呼叫均正常運作。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneSystem] 相容層啟動 (Shim Mode — 無視覺手機框架)');

    if (!window.__PHONE_APPS) window.__PHONE_APPS = {};

    window.PhoneSystem = {
        install: function(name, iconHtml, bgColor, onOpenCallback) {
            window.__PHONE_APPS[name] = onOpenCallback;
            console.log(`[PhoneSystem] 已註冊 App：${name}`);
        },
        launchApp: function(name) {
            if (window.AureliaControlCenter && window.AureliaControlCenter.showOsApp) {
                window.AureliaControlCenter.showOsApp(name);
            }
        },
        // goHome 由 showOsApp / launchGameApp 在每次開啟前動態更新
        goHome: function() {
            const panel = document.querySelector('#aurelia-panel-container');
            if (panel) panel.style.transform = 'translateX(100%)';
            if (window.VoidTerminal && window.VoidTerminal.resumeLobbyActivity) {
                window.VoidTerminal.resumeLobbyActivity();
            }
        },
        show:      function() {},
        hide:      function() {},
        toggle:    function() {},
        isVisible: function() { return false; },
    };

    // 相容舊版 togglePhoneSystem 呼叫
    window.togglePhoneSystem = function() {};

    // 處理在 shim 就緒前透過舊 __PENDING_APPS 隊列堆積的安裝請求
    if (window.__PENDING_APPS && window.__PENDING_APPS.length) {
        window.__PENDING_APPS.forEach(({ name, iconHtml, color, onOpen }) => {
            window.__PHONE_APPS[name] = onOpen;
        });
        window.__PENDING_APPS = [];
    }

    console.log('✅ PhoneSystem 相容層載入完成');
})();
