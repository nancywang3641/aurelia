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

    // ── 🩹 對比度守衛（原理同 story_extractor 偷學樣式那條）──
    //   實測最常見的壞法：模型給某個元素換了背景色卻沒給文字色，文字色就從 VN 繼承下來，
    //   白底配上淺色字＝整行看不見。規則裡有寫要成對指定，但寫了不等於做到 → 渲染後自己量一遍。
    function _rgb(s) {
        const m = String(s || '').match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/);
        return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
    }
    function _luma(c) { return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255; }
    // 往上找第一層夠實的底色。一路透明到面板本身＝底下是那張啟航圖，亮暗未知。
    function _bgUnder(el, root) {
        let cur = el;
        while (cur && cur !== root) {
            const c = _rgb(win.getComputedStyle ? getComputedStyle(cur).backgroundColor : '');
            if (c && c.a >= 0.5) return c;
            cur = cur.parentElement;
        }
        return null;
    }
    function _guardContrast(root) {
        let fixed = 0, outlined = 0;
        root.querySelectorAll('*').forEach(el => {
            if (el.tagName === 'STYLE') return;
            // 只管自己直接帶文字的元素：容器的文字色改了會連累它整棵子樹
            const hasText = Array.prototype.some.call(el.childNodes, n => n.nodeType === 3 && n.nodeValue.trim());
            if (!hasText) return;
            const cs = getComputedStyle(el);
            const fg = _rgb(cs.color);
            if (!fg) return;
            const bg = _bgUnder(el, root);
            // 🚨半透明卡片(規則禁了但它照做不誤)算出來的對比不作數：底圖會從後面透上來，
            //   而那張圖每個世界都不一樣。底不夠實、或一路透明到底，都補一圈反差描邊。
            const outline = () => {
                if (cs.textShadow && cs.textShadow !== 'none') return;
                el.style.textShadow = _luma(fg) > 0.5
                    ? '0 0 4px rgba(0,0,0,.85), 0 1px 2px rgba(0,0,0,.9)'
                    : '0 0 4px rgba(255,255,255,.85), 0 1px 2px rgba(255,255,255,.9)';
                outlined++;
            };
            if (!bg) { outline(); return; }   // 底是圖片，亮暗說不準 → 不動模型挑的顏色，只加描邊
            const lb = _luma(bg), lt = _luma(fg);
            if ((Math.max(lb, lt) + 0.05) / (Math.min(lb, lt) + 0.05) < 3) {
                el.style.color = lb > 0.5 ? '#14161c' : '#f2f4f8';   // 行內樣式贏過模型寫的任何選擇器
                fixed++;
            }
            if (bg.a < 0.9) outline();
        });
        if (fixed || outlined) console.log('[VN末尾面板] 對比守衛：改字色 ' + fixed + ' 處、加描邊 ' + outlined + ' 處');
        return { fixed: fixed, outlined: outlined };
    }

    // ── 🩹 溢出守衛：把飛出面板的元素拉回來 ──
    //   規則已經禁了 px 寫死與視窗單位，但模型照樣會照桌機尺寸排。面板本身 overflow:hidden，
    //   所以飛出去的東西不是擠壞版面而是「整顆被裁掉看不見」——按鈕消失比排版醜嚴重得多。
    //   用 transform 位移而不是改 left/top：模型可能是用 right/bottom 定位的，改錯邊會跑更遠。
    function _guardOverflow(root) {
        const pr = root.getBoundingClientRect();
        if (!pr.width || !pr.height) return 0;
        let moved = 0;
        const list = root.querySelectorAll('.vnep-ui *');
        // 🚨面板寬度會變（她會拉酒館的聊天欄），這支會重跑 → 先把上一次的位移全部清掉再量，
        //   不然 translate 會一次疊一次，元素愈跑愈遠。清完才量，因為清父層會連帶移動子層。
        list.forEach(el => {
            if (el.style.transform) el.style.transform = '';
            if (el.style.maxWidth) { el.style.maxWidth = ''; el.style.boxSizing = ''; }
        });
        // 依文件順序處理：父層先被拉回來，子層量到的位置已經含那次位移
        list.forEach(el => {
            const cs = getComputedStyle(el);
            if (cs.position !== 'absolute' && cs.position !== 'fixed') return;
            let r = el.getBoundingClientRect();
            if (!r.width || !r.height) return;
            // 元素本身就比面板寬時位移救不回來（推回左緣右邊照樣凸出去）→ 先把寬度夾住
            if (r.width > pr.width) {
                el.style.boxSizing = 'border-box';
                el.style.maxWidth = Math.round(pr.width) + 'px';
                r = el.getBoundingClientRect();
            }
            let dx = 0, dy = 0;
            if (r.right > pr.right) dx = pr.right - r.right;
            if (r.left + dx < pr.left) dx = pr.left - r.left;     // 比面板還寬 → 至少對齊左緣
            if (r.bottom > pr.bottom) dy = pr.bottom - r.bottom;
            if (r.top + dy < pr.top) dy = pr.top - r.top;
            if (!dx && !dy) return;
            const t = cs.transform && cs.transform !== 'none' ? cs.transform + ' ' : '';
            el.style.transform = t + 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px)';
            moved++;
        });
        if (moved) console.warn('[VN末尾面板] 有 ' + moved + ' 個元素排到面板外面，已拉回可視範圍');
        return moved;
    }

    // 面板尺寸一變就重算溢出（酒館聊天欄是可以拖寬拖窄的）。只留一個觀察者，換世界時拆掉。
    let _ro = null;
    function _watchResize(root) {
        _unwatch();
        if (typeof ResizeObserver !== 'function') return;
        let t = null;
        _ro = new ResizeObserver(() => {
            clearTimeout(t);
            t = setTimeout(() => { try { _guardOverflow(root); } catch (e) {} }, 120);
        });
        _ro.observe(root);
    }
    function _unwatch() { try { _ro && _ro.disconnect(); } catch (e) {} _ro = null; }

    // ── 🏅 成就頁 ──
    //   刻意不交給生成端做：這是資料清單，每個世界長不一樣會很難讀，而且隱藏成就要遮。
    //   系統性的東西維持固定樣子（同系統鍵那條理由），變化留給面板本身。
    function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }
    function _achvRows(list, done, hidden) {
        return (list || []).map(x => {
            const ok = !!(done && done[x.name]);
            // 隱藏成就沒達成前連名字都不給：給了就不叫隱藏了
            const n = (hidden && !ok) ? '？？？' : x.name;
            const d = (hidden && !ok) ? '還沒被碰到的事' : (x.desc || '');
            return '<div class="vnep-ac-row' + (ok ? ' done' : '') + '">' +
                   '<span class="vnep-ac-n">' + _esc(n) + '</span>' +
                   '<span class="vnep-ac-d">' + _esc(d) + '</span></div>';
        }).join('');
    }
    function _openAchv(root, w) {
        root.querySelector('.vnep-achv')?.remove();
        const a = w.achv || {}, done = w.achvDone || {};
        const all = [].concat(a.normal || [], a.bond || [], a.hidden || []);
        const got = all.filter(x => done[x.name]).length;
        const sec = (title, list, hidden) => (list && list.length)
            ? '<div class="vnep-ac-sec">' + title + '</div>' + _achvRows(list, done, hidden) : '';
        const box = document.createElement('div');
        box.className = 'vnep-achv';
        box.innerHTML =
            '<div class="vnep-ac-head"><span class="vnep-ac-title">這個世界的成就</span>' +
              '<span class="vnep-ac-count">' + got + ' / ' + all.length + '</span>' +
              '<span class="vnep-ac-x">✕</span></div>' +
            '<div class="vnep-ac-body">' +
              sec('一般', a.normal, false) + sec('與同行者之間', a.bond, false) + sec('隱藏', a.hidden, true) +
            '</div>';
        box.querySelector('.vnep-ac-x').addEventListener('click', () => box.remove());
        root.appendChild(box);
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
        // 成就頁的資料就在手上，不必繞回 vn_core 再拿一次；沒有清單就不接，那顆維持暗的
        const acts2 = (w.achv && (w.achv.normal || w.achv.bond || w.achv.hidden))
            ? Object.assign({}, acts, { achv: () => _openAchv(root, w) }) : acts;
        const found = _bindActs(root, acts2);
        _toggleNative(found);
        root.classList.add('active');
        _guardContrast(root);   // 要在掛上 active、文字也寫定之後才量，量的是最終畫面
        _guardOverflow(root);
        _watchResize(root);     // 聊天欄被拉寬拉窄時要重算，不然又跑出去
        const miss = Object.keys(acts2 || {}).filter(a => found.indexOf(a) < 0);
        console.log('[VN末尾面板] 已套用「' + (w.name || '未命名世界') + '」的活動面板' +
            (miss.length ? '；模型漏做了 ' + miss.join('、') + '，那幾顆維持原本的按鈕' : ''));
        return { found: found, missing: miss };
    }

    function clear() {
        const root = _el();
        _unwatch();
        _toggleNative([]);   // 原生系統鍵先還原，不然面板拆了按鈕也跟著不見
        if (!root) return;
        root.classList.remove('active', 'has-bg');
        root.style.removeProperty('--vnep-bg');
        root.innerHTML = '';
    }

    win.VN_EndPanel = window.VN_EndPanel = { render, clear };
    console.log('[VN末尾面板] 模組就緒');
})();
