// ----------------------------------------------------------------
// [檔案] aurelia_tilefx.js
// 路徑：core/aurelia_tilefx.js
// 職責：🧱 全螢幕窗口的切塊進出場（2026-10-13 她從 參考資料/JOURNAL_BG_BUILD_LAB.html 選的「上下層」）
//   下層＝大廳（打開窗口前站的地方），上層＝窗口。
//   進場：從畫面中間往外一格格蓋上來，每格先亮淡藍框、再把那格窗口填上；
//   出場：反過來，外圈先收、中間最後，露回大廳。
//   露出哪幾格靠窗口的 clip-path（一格一個方塊路徑）；框畫在窗口「外面」那層畫布上，畫在窗口裡會被一起剪掉。
// 用的人：core/control_center.js（大廳開的全螢幕窗口：地圖、後院、房產、日曆、設置…）、
//         os_phone/os/os_journal.js（故事日誌自己配書翻開／闔上的時間演）。
// 對外：window.AURELIA_TILEFX = { canRun, hide, run, clear }
// 🚨 演的時候窗口是被剪掉的：任何一條路沒收尾都會讓整格消失 → 每次都有保險計時器，畫面藏著 rAF 不跑也一定收尾。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const IN_MS = 900, OUT_MS = 850, COLS = 24;
    const HIDE_ALL = 'path("M0 0Z")';
    const states = new WeakMap();   // 窗口 → 它自己那一份（同時只會有一個在演，但不同窗口各記各的）
    const st = (host) => {
        let s = states.get(host);
        if (!s) { s = { cv: null, raf: 0, timer: 0, guard: 0, run: 0 }; states.set(host, s); }
        return s;
    };

    // 這次要不要演：大廳設置「演出動畫」開著、系統沒要求減少動態、畫面夠寬（電腦）、
    // 劇情全螢幕那層沒開著（從劇情末尾開的窗口走劇情自己那套淡入淡出，兩套疊在一起會打架）
    function canRun() {
        try {
            if (localStorage.getItem('aurelia_reveal_fx') === '0') return false;
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
            if ((window.innerWidth || 0) < 960) return false;
            if (!(window.CSS && CSS.supports && CSS.supports('clip-path', HIDE_ALL))) return false;
            const vn = document.getElementById('aurelia-vn-panel');
            if (vn && vn.style.display !== 'none' && vn.offsetParent !== null) return false;
            return true;
        } catch (e) { return false; }
    }

    function _stop(host) {
        const s = st(host);
        cancelAnimationFrame(s.raf); clearTimeout(s.timer);
        if (s.cv) { s.cv.remove(); s.cv = null; }
        s.run++;
    }
    // 收乾淨：停掉、拿掉畫布、窗口整格露出來
    function clear(host) {
        if (!host) return;
        _stop(host);
        clearTimeout(st(host).guard);
        host.style.clipPath = '';
    }
    // 先整格藏起來（等內容畫好、確定要演再 run）；3 秒內沒 run 就放出來，別讓窗口一直藏著
    function hide(host) {
        if (!host) return;
        _stop(host);
        const s = st(host);
        host.style.clipPath = HIDE_ALL;   // clip-path 是照窗口大小即時算的路徑，進不了 css/（見檔頭）
        clearTimeout(s.guard);
        s.guard = setTimeout(() => { if (!s.cv) clear(host); }, 3000);
    }

    // dir='in' 蓋上來、'out' 收掉；done 在演完（或保險計時器到）時叫一次。
    // 'in' 演完窗口是整格露出、'out' 演完是整格剪掉（之後藏窗口、clear 是叫的人的事）
    function run(host, dir, done) {
        done = typeof done === 'function' ? done : () => {};
        const par = host && host.parentElement;
        if (!host) { done(); return; }
        _stop(host);
        const s = st(host);
        clearTimeout(s.guard);
        if (!par || !host.offsetWidth) { done(); return; }
        const run = s.run, ms = dir === 'in' ? IN_MS : OUT_MS;
        const W = host.offsetWidth, H = host.offsetHeight;
        const DPR = Math.min(2, window.devicePixelRatio || 1);
        // 畫布疊在窗口正上方、跟窗口一樣大：窗口的定位父層就是它爸的話用 offset，不然用畫面座標相減
        let L = host.offsetLeft, T = host.offsetTop;
        if (host.offsetParent !== par) {
            const hr = host.getBoundingClientRect(), pr = par.getBoundingClientRect();
            L = hr.left - pr.left - par.clientLeft; T = hr.top - pr.top - par.clientTop;
        }
        const cv = document.createElement('canvas');
        cv.className = 'aurelia-tilefx';
        cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
        // 位置、大小、層級是照窗口當下量出來的，進不了 css/（樣式本身在 css/aurelia_tilefx.css）
        cv.style.left = L + 'px'; cv.style.top = T + 'px'; cv.style.width = W + 'px'; cv.style.height = H + 'px';
        cv.style.zIndex = String((parseInt(getComputedStyle(host).zIndex, 10) || 0) + 1);
        par.appendChild(cv);
        s.cv = cv;
        const ctx = cv.getContext('2d');
        const size = W / COLS, rows = Math.ceil(H / size), cx = W / 2, cy = H / 2, far = Math.hypot(cx, cy);
        const cells = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) {
            const x = c * size, y = r * size;
            const d = Math.hypot(x + size / 2 - cx, y + size / 2 - cy) / far;
            // 進場越靠中間越早；出場越靠外圈越早。每格各跑 34% 的時間，起跑時間抖一點點才不會像機器排隊
            cells.push({ x, y, at: (dir === 'in' ? d : 1 - d) * .62 + Math.random() * .04 });
        }
        const easeOut = (t) => 1 - Math.pow(1 - t, 3);
        const draw = (t) => {
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            ctx.clearRect(0, 0, W, H);
            let path = '';
            for (const c of cells) {
                let p = (t - c.at) / .34;
                if (dir === 'out') p = 1 - p;
                if (p <= 0) continue;
                // 前 30% 只亮框（框從小一點長到剛好一格），之後這格窗口露出來、框退掉
                const fill = Math.max(0, Math.min(1, (p - .3) / .7));
                if (fill > 0) {
                    const w = size * (.6 + .4 * easeOut(fill)) + .6, o = (size - w) / 2;   // +.6 補縫，格子之間不留細線
                    path += `M${(c.x + o).toFixed(1)} ${(c.y + o).toFixed(1)}h${w.toFixed(1)}v${w.toFixed(1)}h${(-w).toFixed(1)}Z`;
                }
                const edge = p < .3 ? p / .3 : 1 - fill;
                if (edge > 0) {
                    const g = size * (1 - .25 * (1 - Math.min(1, p / .3)));
                    ctx.globalAlpha = Math.min(1, edge) * .85; ctx.strokeStyle = '#7fa6db'; ctx.lineWidth = 1;
                    ctx.strokeRect(c.x + (size - g) / 2 + .5, c.y + (size - g) / 2 + .5, g - 1, g - 1);
                }
            }
            ctx.globalAlpha = 1;
            host.style.clipPath = path ? `path('${path}')` : HIDE_ALL;
        };
        const t0 = performance.now();
        const finish = () => {
            if (run !== s.run) return;   // 中途被別人停掉或重演了：這一趟的收尾不算
            _stop(host);
            host.style.clipPath = dir === 'in' ? '' : HIDE_ALL;   // 保險計時器先到的話，畫面可能停在半路：直接收到終點
            done();
        };
        const tick = (now) => {
            if (run !== s.run) return;
            const t = Math.min(1, (now - t0) / ms);
            draw(t);
            if (t < 1) s.raf = requestAnimationFrame(tick); else finish();
        };
        draw(0);
        s.raf = requestAnimationFrame(tick);
        s.timer = setTimeout(finish, ms + 400);   // 畫面藏著時 rAF 不跑，也一定收尾
    }

    const api = { canRun, hide, run, clear, IN_MS, OUT_MS };
    win.AURELIA_TILEFX = api;
    if (win !== window) window.AURELIA_TILEFX = api;
})();
