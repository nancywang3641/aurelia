// ----------------------------------------------------------------
// [檔案] frames.js — 照窗的實際大小畫的外框（2026-10-06，window.AURELIA_FRAMES）
// 以前小劇場、成就收藏冊的外框是一張圖撐滿整個窗（阿洛畫的 PNG）：窗的長寬比一變，四角缺口、頂上的拱、花飾就跟著被拉扁拉長，
// 成就那顆大菱形還擋住標題。她：「把這個原本是用素材圖做成的框 改 成CSS UI」→ 看過比較頁（tmp/frames_compare.html，本地）說可以。
// 做法：一層 svg 墊在窗的最底下（z-index:-1；窗本身有 transform＋z-index，自成一層，所以墊得進去），
//   ResizeObserver 照實際寬高重畫；角、拱、花飾固定大小，只有直線跟著伸長。形狀照原圖量的（原圖 794 寬、遊戲 340 寬＝0.43 倍）。
// 用法：AURELIA_FRAMES.mount(元素, 'theater' | 'achievement')；同一個元素再 mount 只會重畫，不會疊兩層。
//   svg 的定位寫在各自的 css（lobby_stage.css、void_achievement.css 的 .aurelia-vframe）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const NS = 'http://www.w3.org/2000/svg';
    let _seq = 0;

    // 四角內凹的長方形；上下可以各帶一個拱：肩膀先內凹一小段＋平台＋圓頂（top / bot），或一道 S 形淺弧（bot.smooth）
    function outline(x0, y0, x1, y1, R, top, bot) {
        let p = `M${x0},${y0 + R} A${R},${R} 0 0 0 ${x0 + R},${y0}`;
        if (top) {
            const a = top.cx - top.hw, b = top.cx + top.hw, s = top.s, L = top.ledge;
            const rx = top.hw - s - L, ry = top.h - s;
            p += ` L${a},${y0} A${s},${s} 0 0 0 ${a + s},${y0 - s} L${a + s + L},${y0 - s}`
                + ` A${rx},${ry} 0 0 1 ${b - s - L},${y0 - s} L${b - s},${y0 - s} A${s},${s} 0 0 0 ${b},${y0}`;
        }
        p += ` L${x1 - R},${y0} A${R},${R} 0 0 0 ${x1},${y0 + R} L${x1},${y1 - R} A${R},${R} 0 0 0 ${x1 - R},${y1}`;
        if (bot && bot.smooth) {
            const a = bot.cx + bot.hw, b = bot.cx - bot.hw, k = bot.hw * 0.5, y2 = y1 + bot.h;
            p += ` L${a},${y1} C${a - k},${y1} ${bot.cx + k},${y2} ${bot.cx},${y2} C${bot.cx - k},${y2} ${b + k},${y1} ${b},${y1}`;
        }
        p += ` L${x0 + R},${y1} A${R},${R} 0 0 0 ${x0},${y1 - R} Z`;
        return p;
    }
    // 成就的內框：四角內凹，左右兩側中間一段往外凸
    function panel(x0, y0, x1, y1, R, ya, yb, k, f) {
        return `M${x0},${y0 + R} A${R},${R} 0 0 0 ${x0 + R},${y0} L${x1 - R},${y0} A${R},${R} 0 0 0 ${x1},${y0 + R}`
            + ` L${x1},${ya} A${f},${f} 0 0 0 ${x1 + k},${ya + f} L${x1 + k},${yb - f} A${f},${f} 0 0 0 ${x1},${yb}`
            + ` L${x1},${y1 - R} A${R},${R} 0 0 0 ${x1 - R},${y1} L${x0 + R},${y1} A${R},${R} 0 0 0 ${x0},${y1 - R}`
            + ` L${x0},${yb} A${f},${f} 0 0 0 ${x0 - k},${yb - f} L${x0 - k},${ya + f} A${f},${f} 0 0 0 ${x0},${ya} Z`;
    }
    // 四角星（邊往內彎）
    function star(cx, cy, r, w) {
        const c = r * (w || 0.16);
        return `M${cx},${cy - r} Q${cx + c},${cy - c} ${cx + r},${cy} Q${cx + c},${cy + c} ${cx},${cy + r} Q${cx - c},${cy + c} ${cx - r},${cy} Q${cx - c},${cy - c} ${cx},${cy - r} Z`;
    }

    // ── 小劇場：左右透明邊 5、上緣 26、下緣 20、四角缺口 13、內線往內 6.5（上下偏金、兩側藍灰）──
    const TH = { X: 5, T: 26, B: 20, R: 13, d: 6.5, hump: { hw: 52, s: 5, ledge: 6, h: 21 }, dip: { hw: 64, h: 15, smooth: true } };
    function theater(W, H, id) {
        const { X, T, B, R, d } = TH, Hb = H - B, cx = W / 2;
        const top = Object.assign({ cx }, TH.hump), bot = Object.assign({ cx }, TH.dip);
        const topIn = Object.assign({}, top, { hw: top.hw - d }), botIn = Object.assign({}, bot, { hw: bot.hw - d });
        const ty = T + 5, by = Hb - 14;   // 上下花飾的中心
        const gold = '#efd28e', goldLine = '#dcbc8c', navy = '#233a78';
        const lines = (x0, x1) => `<path d="M${x0},${by} L${x1},${by}" stroke="${goldLine}" stroke-width="1" fill="none"/>`
            + `<circle cx="${x0}" cy="${by}" r="1.4" fill="${goldLine}"/><circle cx="${x1}" cy="${by}" r="1.4" fill="${goldLine}"/>`;
        return `<defs><linearGradient id="${id}-in" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#ddc6a3"/><stop offset=".12" stop-color="#cfd5e6"/><stop offset=".88" stop-color="#cfd5e6"/><stop offset="1" stop-color="#ddc6a3"/>
            </linearGradient></defs>
            <path d="${outline(X + 0.5, T, W - X - 0.5, Hb, R, top, bot)}" fill="#f8f9fb" stroke="rgba(150,135,118,.4)" stroke-width="1"/>
            <path d="${outline(X + d, T + d, W - X - d, Hb - d, R, topIn, botIn)}" fill="none" stroke="url(#${id}-in)" stroke-width="1"/>
            <g fill="none" stroke="${gold}" stroke-width=".8" stroke-linecap="round">
              <path d="M${cx},${ty - 9} L${cx},${ty - 13}"/><path d="M${cx - 5},${ty - 8} L${cx - 7},${ty - 11.5}"/><path d="M${cx + 5},${ty - 8} L${cx + 7},${ty - 11.5}"/>
              <path d="M${cx - 9.5},${ty - 5} L${cx - 12.5},${ty - 7.5}"/><path d="M${cx + 9.5},${ty - 5} L${cx + 12.5},${ty - 7.5}"/>
              <path d="M${cx - 9},${ty} Q${cx - 18},${ty - 6} ${cx - 29},${ty - 3}"/><path d="M${cx + 9},${ty} Q${cx + 18},${ty - 6} ${cx + 29},${ty - 3}"/>
              <path d="M${cx - 11},${ty + 2} Q${cx - 18},${ty - 1.5} ${cx - 23},${ty + 0.5}"/><path d="M${cx + 11},${ty + 2} Q${cx + 18},${ty - 1.5} ${cx + 23},${ty + 0.5}"/>
            </g>
            <path d="${star(cx, ty, 5.5, 0.2)}" fill="${gold}"/>
            <path d="${star(W * 0.258, T + 22, 5)}" fill="${navy}"/><path d="${star(W * 0.746, T + 22, 5)}" fill="${navy}"/>
            ${lines(W * 0.165, W * 0.34)}${lines(W * 0.655, W * 0.835)}
            <path d="${star(W * 0.36, by, 3.8)}" fill="${navy}"/><path d="${star(W * 0.64, by, 3.8)}" fill="${navy}"/>
            <g fill="none" stroke="${goldLine}" stroke-width="1" stroke-linecap="round">
              <path d="M${cx - 12},${by + 2} Q${cx - 26},${by - 8} ${cx - 44},${by + 2}"/><path d="M${cx + 12},${by + 2} Q${cx + 26},${by - 8} ${cx + 44},${by + 2}"/>
              <path d="M${cx - 14},${by + 6} Q${cx - 28},${by - 1} ${cx - 40},${by + 6}"/><path d="M${cx + 14},${by + 6} Q${cx + 28},${by - 1} ${cx + 40},${by + 6}"/>
              <path d="M${cx},${by - 11} L${cx},${by - 15}"/><path d="M${cx},${by + 11} L${cx},${by + 15}"/>
              <path d="M${cx - 6.5},${by - 6.5} L${cx - 9},${by - 9}"/><path d="M${cx + 6.5},${by - 6.5} L${cx + 9},${by - 9}"/>
              <path d="M${cx - 6.5},${by + 6.5} L${cx - 9},${by + 9}"/><path d="M${cx + 6.5},${by + 6.5} L${cx + 9},${by + 9}"/>
            </g>
            <path d="${star(cx, by, 8, 0.24)}" fill="#fbf6ec" stroke="${goldLine}" stroke-width="1"/>
            <path d="${star(cx, by, 5, 0.18)}" fill="${navy}"/>`;
    }

    // ── 成就收藏冊：外圈凹角 16＋帶狀邊 9、四角一抹金；內框藍金兩條、凹角 13、左右中間一段往外凸 6 ──
    //   上下的大菱形／羅盤（以前兩張小圖）她說擋標題 → 換成貼在框頂邊、底邊的同一顆小菱形
    const AC = { R: 16, band: 9, Ri: 13, line2: 4, k: 6, f: 6 };
    function gem(cx, cy, id) {
        const kite = (w, h) => `M${cx},${cy - h} Q${cx + w * 0.22},${cy - h * 0.22} ${cx + w},${cy} Q${cx + w * 0.22},${cy + h * 0.22} ${cx},${cy + h}`
            + ` Q${cx - w * 0.22},${cy + h * 0.22} ${cx - w},${cy} Q${cx - w * 0.22},${cy - h * 0.22} ${cx},${cy - h} Z`;
        return `<g stroke="#d6b06e" stroke-width="1" fill="none" stroke-linecap="round">
              <path d="M${cx - 13},${cy} L${cx - 30},${cy}"/><path d="M${cx + 13},${cy} L${cx + 30},${cy}"/>
            </g>
            <path d="${star(cx - 33, cy, 3.2)}" fill="#e7c98c"/><path d="${star(cx + 33, cy, 3.2)}" fill="#e7c98c"/>
            <path d="${kite(10, 13)}" fill="#fdfcf8" stroke="#d6b06e" stroke-width="1.2"/>
            <path d="${kite(5.6, 7.4)}" fill="url(#${id}-gem)" stroke="#c99a52" stroke-width=".8"/>
            <path d="M${cx},${cy - 7.4} L${cx},${cy + 7.4} M${cx - 5.6},${cy} L${cx + 5.6},${cy}" stroke="rgba(255,255,255,.55)" stroke-width=".5"/>`;
    }
    function achievement(W, H, id) {
        const { R, band, Ri, line2, k, f } = AC;
        const ya = H * 0.443, yb = H * 0.557;
        const outer = outline(0.75, 0.75, W - 0.75, H - 0.75, R);
        const C = R + 4;
        const corners = `<path d="M${C},0 A${C},${C} 0 0 1 0,${C}"/><path d="M${W - C},0 A${C},${C} 0 0 0 ${W},${C}"/>`
            + `<path d="M${C},${H} A${C},${C} 0 0 0 0,${H - C}"/><path d="M${W - C},${H} A${C},${C} 0 0 1 ${W},${H - C}"/>`;
        return `<defs>
              <linearGradient id="${id}-band" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#eef1f7"/><stop offset=".5" stop-color="#fbfcfe"/><stop offset="1" stop-color="#e6ebf4"/>
              </linearGradient>
              <linearGradient id="${id}-gem" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#9fd0ff"/><stop offset=".5" stop-color="#4a8fe6"/><stop offset="1" stop-color="#2c63c4"/>
              </linearGradient>
              <clipPath id="${id}-clip"><path d="${outer}"/></clipPath>
            </defs>
            <path d="${outer}" fill="url(#${id}-band)" stroke="#7f95bf" stroke-width="1.5"/>
            <g clip-path="url(#${id}-clip)" fill="none" stroke="rgba(230,196,128,.5)" stroke-width="6">${corners}</g>
            <path d="${panel(band, band, W - band, H - band, Ri, ya, yb, k, f)}" fill="#fbfbfd" stroke="#8a9cc2" stroke-width="1.3"/>
            <path d="${panel(band + line2, band + line2, W - band - line2, H - band - line2, Ri, ya, yb, k, f)}" fill="none" stroke="#d9b77c" stroke-width="1"/>
            ${gem(W / 2, 1, id)}${gem(W / 2, H - 1, id)}`;
    }

    const DRAW = { theater, achievement };

    function mount(el, kind) {
        if (!el || !DRAW[kind]) return;
        if (el._avf) { el._avf.draw(true); return; }
        const doc = el.ownerDocument || document;
        const svg = doc.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'aurelia-vframe');
        svg.setAttribute('aria-hidden', 'true');
        el.insertBefore(svg, el.firstChild);
        const id = 'avf' + (++_seq);
        let lastW = 0, lastH = 0;
        const draw = (force) => {
            const W = el.clientWidth, H = el.clientHeight;
            if (!W || !H) return;   // 還沒顯示（display:none）：等它出現、尺寸有了再畫
            if (!force && W === lastW && H === lastH) return;
            lastW = W; lastH = H;
            svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
            svg.innerHTML = DRAW[kind](W, H, id);
        };
        const RO = (doc.defaultView && doc.defaultView.ResizeObserver) || window.ResizeObserver;
        if (RO) new RO(() => draw()).observe(el);
        el._avf = { draw };
        draw();
    }

    const api = { mount };
    window.AURELIA_FRAMES = api;
    try { if (window.parent && window.parent !== window) window.parent.AURELIA_FRAMES = api; } catch (e) {}
})();
