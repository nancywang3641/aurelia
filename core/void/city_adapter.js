// ----------------------------------------------------------------
// [檔案] core/void/city_adapter.js (V1.0 - 視差城市 ⇄ 奧瑞亞 轉接器)
// 職責：CityShell 唯一的「接正式專案」層——延遲載入 shell JS/CSS、城市狀態存取(localStorage 全域，
//       換聊天/換卡不清)、地標路由(視差書咖→cafe 場景、純白大廳→hall 場景)、開關城市時暫停/恢復舞台。
// 載入：本檔不進 index.js 啟動清單；lobby_stage.js 的城市鈕第一次點擊時動態注入本檔，
//       本檔再注入 city_shell.js + city_shell.css 與 runtime 素材（sound-files CDN 的 city/）。
// 鐵律：CityShell 不准反向 import 這裡的東西；所有大廳/酒館依賴只留在本檔。
// ----------------------------------------------------------------
(function () {
    'use strict';

    // 城市 runtime 素材（sound-files CDN 的 city/；source 母版不上 CDN）
    const ASSET_BASE = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@main/city/';
    // 城市狀態=全域（跟大廳同格）：小資料走 localStorage，不動 OS_DB schema
    const LS_KEY = 'aurelia_city_state_v1';

    // 兩個烤在底圖上的固定地標 → 大廳舞台的正式場景
    const LANDMARKS = {
        book_cafe_gate: { name: '視差書咖', desc: '瀅瀅駐店的書咖，也是回程的門', destination: 'cafe' },
        exchange: { name: '純白大廳', desc: '愛麗絲與 LUNA-VII 核心所在的接待大廳', destination: 'hall' },
    };

    let overlay = null;
    let loading = false;

    function extBase() {
        return String(window.AURELIA_EXT_BASE || '.');
    }

    function loadShellOnce() {
        if (window.CityShell) return Promise.resolve();
        if (!document.getElementById('city-shell-css')) {
            const link = document.createElement('link');
            link.id = 'city-shell-css';
            link.rel = 'stylesheet';
            link.href = extBase() + '/core/void/city_shell.css';
            document.head.appendChild(link);
        }
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = extBase() + '/core/void/city_shell.js';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('city_shell.js 載入失敗'));
            document.head.appendChild(s);
        });
    }

    // 日夜跟大廳同一套時段邏輯（ambient.js：6-18 day）；城市只有日/夜兩套素材 → 18:00 起算夜
    function autoTheme() {
        const h = new Date().getHours();
        return (h >= 6 && h < 18) ? 'day' : 'night';
    }

    function defaultState() {
        return {
            version: 1,
            districtId: 'parallax_city_district_01',
            theme: autoTheme(),
            plots: {
                player_plot: { status: 'occupied', buildingId: 'player_house_lv1', ownerId: 'player', ownerName: '玩家' },
                npc_plot_01: { status: 'available', buildingId: null, ownerId: null, ownerName: null },
                npc_plot_02: { status: 'available', buildingId: null, ownerId: null, ownerName: null },
                npc_plot_03: { status: 'available', buildingId: null, ownerId: null, ownerName: null },
                npc_plot_04: { status: 'available', buildingId: null, ownerId: null, ownerName: null },
            },
            npcLocations: [],
            updatedAt: null,
        };
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { console.warn('[CityAdapter] 城市狀態讀取失敗，用預設', e); }
        return defaultState();
    }

    function saveState(state) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
    }

    // 鈕面顯示「按了會切到」的那一邊：白天顯示月亮、夜裡顯示太陽
    function themeIcon(theme) {
        return theme === 'night' ? 'fa-sun' : 'fa-moon';
    }

    // 點地標「前往」：先把舞台場景指過去（舞台在 open() 時已 unmount，這裡只改指針），再關城市＝tryMount 落地
    function navigate(item) {
        const dest = item?.destination;
        if (!dest) return;
        const LS = window.LobbyStage;
        const S = LS?._S;
        if (S && S.scene !== dest) {
            S.scene = dest;
            S.spawnOverride = 'arrive';   // 跟 goScene 同約定：落在目標場景的「落」點
        }
        close();
    }

    async function open() {
        if (overlay || loading) return;
        loading = true;
        try {
            await loadShellOnce();
        } catch (e) {
            console.error('[CityAdapter]', e);
            loading = false;
            return;
        }
        loading = false;
        const host = document.querySelector('.lobby-left');
        if (!host || overlay) return;

        // 進城＝離開室內舞台：完整卸載（RAF/鍵盤/NPC 計時器全停），返回時 tryMount 復原
        window.LobbyStage?.unmount?.();
        host.classList.add('city-open');

        overlay = document.createElement('div');
        overlay.className = 'city-overlay';
        overlay.innerHTML =
            '<div class="city-overlay-top">' +
              '<button class="city-overlay-back" type="button" title="返回"><i class="fa-solid fa-arrow-left"></i></button>' +
              '<span class="city-overlay-title"><i class="fa-solid fa-city"></i>視差城市・第一街區</span>' +
              '<button class="city-overlay-theme" type="button" title="日夜切換"><i class="fa-solid fa-moon"></i></button>' +
            '</div>' +
            '<div class="city-overlay-body"></div>';
        host.appendChild(overlay);

        const state = loadState();
        state.theme = autoTheme();   // 每次進城跟現實時間走；城裡的手動切換只留當次

        window.CityShell.mount(overlay.querySelector('.city-overlay-body'), state, {
            assetBase: ASSET_BASE,
            landmarkOverrides: LANDMARKS,
            onStateChange: saveState,
            onNavigate: navigate,
        });

        const themeBtn = overlay.querySelector('.city-overlay-theme');
        const syncThemeIcon = () => {
            const cur = window.CityShell.getState()?.theme || 'day';
            themeBtn.innerHTML = '<i class="fa-solid ' + themeIcon(cur) + '"></i>';
        };
        syncThemeIcon();
        themeBtn.addEventListener('click', () => {
            const cur = window.CityShell.getState()?.theme || 'day';
            window.CityShell.setTheme(cur === 'night' ? 'day' : 'night');
            syncThemeIcon();
        });
        overlay.querySelector('.city-overlay-back').addEventListener('click', () => close());
    }

    function close() {
        if (!overlay) return;
        try { window.CityShell?.destroy(); } catch (e) {}
        overlay.remove();
        overlay = null;
        document.querySelector('.lobby-left')?.classList.remove('city-open');
        window.LobbyStage?.tryMount?.();   // 回到室內舞台（navigate 已先把 S.scene 指到目的場景）
    }

    window.CityAdapter = {
        open,
        close,
        isOpen: () => !!overlay,
    };
})();
