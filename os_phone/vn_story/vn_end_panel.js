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

    // 面板裡的按鈕綁既有行為。認不得的 data-act 不綁、也不刪:那是還沒做完的功能(成就)，
    // 整顆藏掉會讓版面破一個洞，留成能點卻沒反應又更糟 → 標成暗的、不吃點擊，看得出來「還沒開」。
    // 回傳真的綁上的那幾個：呼叫方要靠它決定哪些原生按鈕可以收起來（模型漏做的那顆不能收）。
    function _bindActs(root, acts) {
        const found = [];
        root.querySelectorAll('[data-act]').forEach(el => {
            const act = el.getAttribute('data-act');
            const fn = acts && acts[act];
            if (typeof fn !== 'function') { el.classList.add('vnep-dead'); return; }
            el.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
            el.classList.add('vnep-live');
            if (found.indexOf(act) < 0) found.push(act);
        });
        return found;
    }
    // 🚨系統鍵的文字鎖死：模型會忍不住把它們改寫成這個世界的說法（離艦／調律／終端），
    //   但那三顆是遊戲本身的功能，換了名字玩家會找不到自己的手機。
    //   只換 [data-label] 裡那幾個字，模型設計的外框與圖示原樣留著；沒照規則包 span 才整顆換掉。
    const SYS_LABEL = { phone: '手機', settings: '設定', home: '退出' };
    const SYS_NATIVE = { phone: 'btn-phone', settings: 'btn-settings', home: 'btn-home' };
    function _lockSysLabels(root) {
        Object.keys(SYS_LABEL).forEach(act => {
            const el = root.querySelector('[data-act="' + act + '"]');
            if (!el) return;
            const slot = el.querySelector('[data-label]');
            if (slot) slot.textContent = SYS_LABEL[act];
            else el.textContent = SYS_LABEL[act];
        });
    }
    // 面板自己做了哪顆，就收起哪顆原生系統鍵。模型漏做的那顆維持原本的金色框留在畫面上——
    // 醜歸醜，總比手機或退出整個消失好（重做一次面板就會補齊）。
    function _toggleNative(found) {
        Object.keys(SYS_NATIVE).forEach(act => {
            const b = document.getElementById(SYS_NATIVE[act]);
            if (b) b.classList.toggle('vnep-off', found.indexOf(act) >= 0);
        });
    }

    async function render(acts) {
        const root = _el();
        if (!root) return null;
        clear();
        const WG = _wg();
        if (!WG || typeof WG.getWorldPanel !== 'function') return null;    // 舊版世界門＝優雅跳過
        let w = null;
        try { w = await WG.getWorldPanel(); } catch (e) { w = null; }
        if (!w || !w.panel || !w.panel.html) return null;                  // 沒生成過面板＝走原本那四顆按鈕

        // 🚨面板是在「上一次演完」之後才可能被換掉的東西：每次都重建，不要沿用上一個世界的節點。
        const style = document.createElement('style');
        style.textContent = _scopeCss(w.panel.css);
        const ui = document.createElement('div');
        ui.className = 'vnep-ui';
        ui.innerHTML = w.panel.html;
        root.appendChild(style);
        root.appendChild(ui);
        _applyBg(root, w);
        _lockSysLabels(root);
        const found = _bindActs(root, acts);
        _toggleNative(found);
        root.classList.add('active');
        const miss = Object.keys(acts || {}).filter(a => found.indexOf(a) < 0);
        console.log('[VN末尾面板] 已套用「' + (w.name || '未命名世界') + '」的活動面板' +
            (miss.length ? '；模型漏做了 ' + miss.join('、') + '，那幾顆維持原本的按鈕' : ''));
        return { found: found, missing: miss };
    }

    function clear() {
        const root = _el();
        _toggleNative([]);   // 原生系統鍵先還原，不然面板拆了按鈕也跟著不見
        if (!root) return;
        root.classList.remove('active', 'has-bg');
        root.style.removeProperty('--vnep-bg');
        root.innerHTML = '';
    }

    win.VN_EndPanel = window.VN_EndPanel = { render, clear };
    console.log('[VN末尾面板] 模組就緒');
})();
