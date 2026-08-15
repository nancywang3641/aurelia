// ----------------------------------------------------------------
// [檔案] vn_end_panel.js — 🎴 劇情末尾的世界活動面板（2026-08-15）
// 職責：VN 章節演完 → 讀當前視差世界的面板資料，把 AI 生的外觀渲染成末尾主畫面。
//   拿不到世界、或這個世界還沒生成過面板 → 回 false，vn_core 照舊顯示原本那四顆按鈕。
//   舊世界與生成失敗一律走這條退路，末尾畫面不會因為新功能壞掉。
// 資料：world.panel {html,css}｜底圖優先用 launchArt(這趟隊伍的啟航群像)，退回 art(世界概念圖)
// 隔離：AI 生的 CSS 逐條 selector 前綴 #vn-end-panel（同煉丹預覽 os_avs.js 的做法）。
//   生成端已經要求 class 帶 wgp- 前綴，但模型照樣會寫出 .card/.btn 這種菜市場名，
//   而 VN 跟酒館兩邊都有同名樣式——前綴是程式端的保險，不靠模型守規矩。
// 功能鍵：面板裡的按鈕用 data-act 認（data/ctx/journal/map），行為由 vn_core 傳進來，
//   不在這裡重寫一份（開手機 app 要頂 z-index、還原頂欄那套只能有一個版本）。
// 入口：VN_EndPanel.render(acts) / VN_EndPanel.clear()
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const PANEL_ID = 'vn-end-panel';

    function _wg() { return win.OS_WORLDGATE || window.OS_WORLDGATE; }
    function _el() { return document.getElementById(PANEL_ID); }

    // 逐條 selector 前綴 #vn-end-panel。整包包一層 #id{...} 的巢狀寫法在舊瀏覽器不成立，
    // 所以照煉丹預覽那條逐條改寫。
    // 🚨兩種東西長得像選擇器但不是，加了前綴會讓整段失效：
    //   ①@media/@supports/@keyframes 的條件行 → 變成 @#vn-end-panel media(...)，瀏覽器直接丟掉整塊，
    //     手機版型就這樣整組消失(實測)。②@keyframes 裡的 0%/from/to → 前綴後動畫不再套用。
    //   前面那個 [^{}@] 的寫法擋不住①：@ 被排除在第一個字元之外，正則只是往後挪一格從 media 開始配。
    const _KEYFRAME_STEP = /^(?:\d+(?:\.\d+)?%|from|to)(?:\s*,\s*(?:\d+(?:\.\d+)?%|from|to))*$/i;
    function _scopeCss(css) {
        return String(css || '').replace(/(^|[{}])([^{}]+)\{/g, (m, pre, sel) => {
            const s = sel.trim();
            if (!s || s.charAt(0) === '@' || _KEYFRAME_STEP.test(s)) return m;
            return pre + s.split(',').map(x => '#' + PANEL_ID + ' ' + x.trim()).join(', ') + ' {';
        });
    }

    // 底圖：這趟隊伍的啟航群像優先，沒有就退回世界概念圖，兩個都沒有就純色底。
    // 🚨圖是動態網址(常常是 dataURL)，只能由 JS 設成 CSS 變數——寫進樣式表會被整份重新解析。
    function _applyBg(root, w) {
        const url = (w.launchArt && w.launchArt.url) || w.art || '';
        if (url) root.style.setProperty('--vnep-bg', 'url("' + url.replace(/"/g, '\\"') + '")');
        else root.style.removeProperty('--vnep-bg');
        root.classList.toggle('has-bg', !!url);
    }

    // 面板裡的按鈕綁既有行為。認不得的 data-act 一律不綁也不刪——
    // 那可能是還沒做的功能(成就)，留著讓它不動作，比整顆消失好判斷是哪裡沒接上。
    function _bindActs(root, acts) {
        root.querySelectorAll('[data-act]').forEach(el => {
            const fn = acts && acts[el.getAttribute('data-act')];
            if (typeof fn !== 'function') return;
            el.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
            el.classList.add('vnep-live');
        });
    }

    async function render(acts) {
        const root = _el();
        if (!root) return false;
        clear();
        const WG = _wg();
        if (!WG || typeof WG.getWorldPanel !== 'function') return false;   // 舊版世界門＝優雅跳過
        let w = null;
        try { w = await WG.getWorldPanel(); } catch (e) { w = null; }
        if (!w || !w.panel || !w.panel.html) return false;                 // 沒生成過面板＝走原本那四顆按鈕

        // 🚨面板是在「上一次演完」之後才可能被換掉的東西：每次都重建，不要沿用上一個世界的節點。
        const style = document.createElement('style');
        style.textContent = _scopeCss(w.panel.css);
        const ui = document.createElement('div');
        ui.className = 'vnep-ui';
        ui.innerHTML = w.panel.html;
        root.appendChild(style);
        root.appendChild(ui);
        _applyBg(root, w);
        _bindActs(root, acts);
        root.classList.add('active');
        console.log('[VN末尾面板] 已套用「' + (w.name || '未命名世界') + '」的活動面板');
        return true;
    }

    function clear() {
        const root = _el();
        if (!root) return;
        root.classList.remove('active', 'has-bg');
        root.style.removeProperty('--vnep-bg');
        root.innerHTML = '';
    }

    win.VN_EndPanel = window.VN_EndPanel = { render, clear };
    console.log('[VN末尾面板] 模組就緒');
})();
