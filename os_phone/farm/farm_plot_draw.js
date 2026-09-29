// ============================================================
// farm_plot_draw.js — 農田用程式畫（局外 LAB 小樣）
// ------------------------------------------------------------
// 取代 assets/farm_obj_plot_*.png 那批大圖：一塊田＝一段 SVG 字串，沒有圖檔。
// FarmPlotDraw.svg({ state, crop }) → '<svg …>'
//   state：'dry' 乾土空田 / 'wet' 濕土空田 /
//          'seeded' 'emerging' 'seedling' 'growing' 'mature' 'wilted'
//   crop ：目前只有 stardew（星露豆）的配色；其他作物之後照 CROP_STYLE 加一列
// ============================================================
(function (root) {
    'use strict';

    var uid = 0;

    var SOIL = {
        dry: { base: '#b27b49', dark: '#8a5a33', light: '#cf9c6a' },
        wet: { base: '#5d3c24', dark: '#3f2717', light: '#7c5438' }
    };
    var CROP_STYLE = {
        stardew: {
            seed: '#a6ece0', seedEdge: '#3f8f86', glow: '#62eeff',
            leaf: '#7fc646', leafDark: '#4d8a2c', leafEdge: '#3b6e22', rib: '#c3ea7a',
            bud: '#d8edff', petal: '#8ec8ff', pod: '#34cbe3', podHi: '#c8fcff'
        }
    };
    var WILT = { leaf: '#a88b3d', leafDark: '#75602a', edge: '#5e4b1f', pod: '#5d4b2b' };

    // 田在畫面上只有手機寬的兩成左右，作物要夠大才讀得出階段
    var PLANT_SCALE = { seeded: 1.2, emerging: 1.5, seedling: 1.55, growing: 1.5, mature: 1.4, wilted: 1.45 };

    // 兩排各三株：跟現在的圖同一個排法
    // 兩排的中線：把土面（y 14..208）上下四等分，第一、三條。作物是「看起來的中心」對齊這兩條，
    //   不是根部對齊——各階段伸出去的方向不同（成熟的豆莢往下垂一大截、枯萎往上長），用根部對齊整片會偏下。
    var SPOTS = [[84, 62.5], [200, 62.5], [316, 62.5], [84, 159.5], [200, 159.5], [316, 159.5]];
    // 每種作物、每個階段一株實際佔的範圍 [頂, 底, 左, 右]（沒縮放前，根部＝(0,0)、往上為負）。
    //   第一次畫到時在畫面外偷畫一株、用 getBBox() 量，之後記著用；改了形狀不必手動重量。
    //   用途：①讓「看起來的中心」對齊兩排中線 ②太高太寬的（玉米、麥）自動縮到放得下。
    var FIT_CACHE = {};
    function fitOf(key, drawOne, doc) {
        if (FIT_CACHE[key]) return FIT_CACHE[key];
        doc = doc || (typeof document !== 'undefined' ? document : null);
        if (!doc || !doc.body) return null;
        var host = doc.createElement('div');
        host.className = 'fp-measure';
        host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><g>' + drawOne() + '</g></svg>';
        doc.body.appendChild(host);
        var box = null;
        try {
            var r = host.querySelector('g').getBBox();
            if (r.height > 0) box = [r.y, r.y + r.height, r.x, r.x + r.width];
        } catch (e) {}
        host.parentNode.removeChild(host);
        if (box) FIT_CACHE[key] = box;
        return box;
    }
    var MAX_H = 86;    // 一株最多佔多高：兩排中線相距 97，留一點縫
    var MAX_W = 104;   // 一株最多佔多寬：同一排三株相距約 116
    // 其他九種作物的放大倍數（星露豆已定案，用上面的 PLANT_SCALE）；超過 MAX_H / MAX_W 會自動縮
    var SP_SCALE = { seeded: 1.3, emerging: 1.7, seedling: 1.85, growing: 1.95, mature: 1.95, wilted: 1.8 };

    // 🚨 動畫一律分格播放（steps）：36 株各自在 SVG 裡平滑轉動＝每一格都要重畫整片田，
    //    鏡頭一移動就一頓一頓（量過：顯示卡工作 1600ms/5 秒 → 270）。幅度只有 ±2.2 度，分六格看起來一樣。
    var CSS = [
        '.fp-sw{transform-box:fill-box;transform-origin:50% 100%;animation:fp-sway 3.4s steps(6,jump-none) infinite;}',
        '.fp-tw{animation:fp-tw 2.6s steps(6,jump-none) infinite;}',
        '.fp-pulse{animation:fp-pulse 2.2s steps(6,jump-none) infinite;}',
        '@keyframes fp-sway{0%,100%{transform:rotate(-2.2deg)}50%{transform:rotate(2.2deg)}}',
        '@keyframes fp-tw{0%,100%{opacity:.25}50%{opacity:.85}}',
        '@keyframes fp-pulse{0%,100%{opacity:.35}50%{opacity:.95}}',
        '.fp-still .fp-sw,.fp-still .fp-tw,.fp-still .fp-pulse{animation:none;}',
        '.fp-measure{position:absolute;left:-9999px;top:0;width:10px;height:10px;visibility:hidden;pointer-events:none;}',
        '.fp-measure *{animation:none!important;}',
        '@media (prefers-reduced-motion:reduce){.fp-sw,.fp-tw,.fp-pulse{animation:none;}}'
    ].join('');

    function ensureCss(doc) {
        doc = doc || (typeof document !== 'undefined' ? document : null);
        if (!doc || doc.getElementById('fp-style')) return;
        var st = doc.createElement('style');
        st.id = 'fp-style';
        st.textContent = CSS;
        (doc.head || doc.documentElement).appendChild(st);
    }

    function r1(n) { return Math.round(n * 10) / 10; }

    // 一片葉：葉柄在 (0,0)、朝上長 len、最寬 w，轉 ang 度
    function leaf(len, w, ang, fill, edge, rib) {
        var d = 'M0 0 C' + r1(w) + ' ' + r1(-len * 0.22) + ' ' + r1(w * 0.92) + ' ' + r1(-len * 0.8) + ' 0 ' + r1(-len) +
            ' C' + r1(-w * 0.92) + ' ' + r1(-len * 0.8) + ' ' + r1(-w) + ' ' + r1(-len * 0.22) + ' 0 0Z';
        return '<g transform="rotate(' + ang + ')"><path d="' + d + '" fill="' + fill + '" stroke="' + edge + '" stroke-width=".9"/>' +
            (rib ? '<path d="M0 -1.5L0 ' + r1(-len * 0.82) + '" stroke="' + rib + '" stroke-width="1" stroke-linecap="round" opacity=".6"/>' : '') +
            '</g>';
    }

    // 一圈 n 片葉，第一片轉 start 度
    function ring(n, len, w, start, fill, edge, rib) {
        var out = '';
        for (var i = 0; i < n; i++) out += leaf(len, w, r1(start + i * 360 / n), fill, edge, rib);
        return out;
    }

    function shadow(rx) {
        return '<ellipse cy="2" rx="' + rx + '" ry="' + r1(rx * 0.34) + '" fill="rgba(0,0,0,.28)"/>';
    }

    // 座標：田本身畫在 0..400 × 0..231（上面那片 222 高，底下 9 是框的厚度），
    //   外面留白照原圖的比例（原圖 1448×1086 裡，田只佔中間 1064×615），兩者放同一格時一樣大。
    var VIEWBOX = '-72.2 -87.2 544.4 408.3';
    var SOIL_BOX = { x: 15, y: 14, w: 370, h: 194 };

    // 俯視約 45 度：上緣比下緣窄（原圖量出來上緣約是下緣的 92%）。
    //   slant(y)＝在高度 y 時，左右邊各往內收多少；頂 0 收最多，到框底 222 收到 0。
    var SLANT_TOP = 18, FACE_H = 222;
    function slant(y) { return SLANT_TOP * Math.max(0, Math.min(1, 1 - y / FACE_H)); }
    // 同一高度的東西往中間收的比例（作物、框上的刻痕都照這個）
    function persp(y) { return 1 - 2 * slant(y) / 400; }
    function px(x, y) { return r1(200 + (x - 200) * persp(y)); }

    // 圓角梯形：四個角照 slant 收，角用二次曲線修圓
    function trap(x, y, w, h, r, dy) {
        dy = dy || 0;
        var pts = [[x + slant(y - dy), y], [x + w - slant(y - dy), y], [x + w - slant(y + h - dy), y + h], [x + slant(y + h - dy), y + h]];
        var d = '';
        for (var i = 0; i < 4; i++) {
            var p = pts[i], a = pts[(i + 3) % 4], b = pts[(i + 1) % 4];
            var la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
            var s1 = [p[0] + (a[0] - p[0]) * r / la, p[1] + (a[1] - p[1]) * r / la];
            var s2 = [p[0] + (b[0] - p[0]) * r / lb, p[1] + (b[1] - p[1]) * r / lb];
            d += (i ? 'L' : 'M') + r1(s1[0]) + ' ' + r1(s1[1]) + 'Q' + r1(p[0]) + ' ' + r1(p[1]) + ' ' + r1(s2[0]) + ' ' + r1(s2[1]);
        }
        return d + 'Z';
    }

    // 土的顆粒（雜訊濾鏡）很貴：每次田重畫（換一塊亮、作物換格）都要重算。
    // 改成一張 SVG 圖貼上去——瀏覽器畫過一次就記住那張圖，之後重畫直接貼，不再重算雜訊。
    // 圖跟田用同一個座標框（viewBox＝SOIL_BOX），雜訊是照座標算的，所以長得跟以前直接在田裡算的一樣。
    var NOISE = {};
    function noiseImg(kind) {
        if (NOISE[kind]) return NOISE[kind];
        var B = SOIL_BOX;
        var f = kind === 'dk'
            ? '<feTurbulence type="fractalNoise" baseFrequency=".16 .26" numOctaves="4" seed="7"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.5 -.58"/>'
            : '<feTurbulence type="fractalNoise" baseFrequency=".45 .7" numOctaves="2" seed="21"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .9  0 0 0 0 .78  0 0 0 2.6 -1.5"/>';
        var box = 'x="' + B.x + '" y="' + B.y + '" width="' + B.w + '" height="' + B.h + '"';
        var doc = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + B.x + ' ' + B.y + ' ' + B.w + ' ' + B.h + '" width="' + B.w + '" height="' + B.h + '">' +
            '<filter id="n" filterUnits="userSpaceOnUse" ' + box + '>' + f + '</filter><rect ' + box + ' filter="url(#n)"/></svg>';
        NOISE[kind] = 'data:image/svg+xml,' + encodeURIComponent(doc);
        return NOISE[kind];
    }

    function frame(id, soilKey) {
        var S = SOIL[soilKey];
        var B = SOIL_BOX;
        var box = 'x="' + B.x + '" y="' + B.y + '" width="' + B.w + '" height="' + B.h + '"';
        var soilD = trap(B.x, B.y, B.w, B.h, 10);
        var seg = '';
        var x, y;
        for (x = 44; x <= 356; x += 39) {
            seg += '<path d="M' + px(x, 1.5) + ' 1.5L' + px(x, 13.5) + ' 13.5M' + px(x, 208.5) + ' 208.5L' + px(x, 220.5) + ' 220.5" stroke="rgba(120,95,60,.45)" stroke-width="1.3"/>';
        }
        for (y = 48; y <= 180; y += 33) {
            var sl = r1(slant(y));
            seg += '<path d="M' + r1(1.5 + sl) + ' ' + y + 'H' + r1(14.5 + sl) + 'M' + r1(385.5 - sl) + ' ' + y + 'H' + r1(398.5 - sl) + '" stroke="rgba(120,95,60,.45)" stroke-width="1.3"/>';
        }
        var light = function (x0, y0, w, h) {
            return '<rect x="' + (x0 - 2) + '" y="' + (y0 - 2) + '" width="' + (w + 4) + '" height="' + (h + 4) + '" rx="4" fill="#63d2ff" filter="url(#' + id + 'gl)" opacity=".85"/>' +
                '<rect x="' + x0 + '" y="' + y0 + '" width="' + w + '" height="' + h + '" rx="3" fill="#ecfcff" stroke="#8fdcff" stroke-width=".8"/>';
        };
        // 側邊的燈跟著斜邊擺、順著斜邊轉一點
        var sideLight = function (left) {
            var yc = 111, sl = slant(yc), ang = r1(Math.atan(SLANT_TOP / FACE_H) * 180 / Math.PI);
            var cx = left ? 6 + sl : 394 - sl;
            return '<g transform="rotate(' + (left ? -ang : ang) + ' ' + r1(cx) + ' ' + yc + ')">' + light(r1(cx - 3), yc - 19, 6, 38) + '</g>';
        };
        return '' +
            '<defs>' +
            '<linearGradient id="' + id + 'st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3e5c8"/><stop offset="1" stop-color="#d2b98e"/></linearGradient>' +
            '<linearGradient id="' + id + 'in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(0,0,0,.42)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></linearGradient>' +
            '<clipPath id="' + id + 'cl"><path d="' + soilD + '"/></clipPath>' +
            '<filter id="' + id + 'gl" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3"/></filter>' +
            '</defs>' +
            // 石框：底下一層深色＝框的厚度（整片往下挪 9，斜邊照同一條線）
            '<path d="' + trap(0, 9, 400, 222, 22, 9) + '" fill="#9a8360"/>' +
            '<path d="' + trap(0, 0, 400, 222, 22) + '" fill="url(#' + id + 'st)" stroke="#b09772" stroke-width="1.5"/>' +
            seg +
            // 土
            '<path d="' + soilD + '" fill="' + S.base + '"/>' +
            '<g clip-path="url(#' + id + 'cl)">' +
            // 土的顆粒：一層暗的土塊、一層亮的碎屑，頻率低一點才像土不像砂紙（雜訊圖見 noiseImg）
            '<image href="' + noiseImg('dk') + '" ' + box + ' preserveAspectRatio="none" opacity=".5"/>' +
            '<image href="' + noiseImg('lt') + '" ' + box + ' preserveAspectRatio="none" opacity="' + (soilKey === 'dry' ? '.4' : '.2') + '"/>' +
            '<rect x="' + B.x + '" y="' + B.y + '" width="' + B.w + '" height="20" fill="url(#' + id + 'in)"/>' +
            '</g>' +
            '<path d="' + soilD + '" fill="none" stroke="rgba(60,38,20,.55)" stroke-width="1.5"/>' +
            // 框上的四條燈
            light(172, 2.5, 56, 6) + light(172, 213.5, 56, 6) + sideLight(true) + sideLight(false);
    }

    function cracks() {
        return '<g stroke="rgba(90,55,28,.55)" stroke-width="1.3" fill="none" stroke-linecap="round">' +
            '<path d="M60 52l14 9 6 14M74 61l12-4"/><path d="M262 176l-10 11-16 4M252 187l4 9"/>' +
            '<path d="M334 40l-8 13 4 11"/></g>';
    }

    var DRAW = {
        seeded: function (C, S, id) {
            return '<ellipse rx="13" ry="7" fill="' + S.dark + '"/>' +
                '<ellipse cy="-1" rx="13" ry="7" fill="none" stroke="' + S.light + '" stroke-width="1.4" opacity=".55"/>' +
                '<ellipse class="fp-tw" cy="-1" rx="9" ry="6" fill="' + C.glow + '" filter="url(#' + id + 'gl)"/>' +
                '<ellipse cy="-1" rx="5.6" ry="4" fill="' + C.seed + '" stroke="' + C.seedEdge + '" stroke-width=".9"/>' +
                '<ellipse cx="-1.6" cy="-2.4" rx="1.6" ry="1" fill="#fff" opacity=".7"/>';
        },
        emerging: function (C, S, id) {
            return '<ellipse rx="10" ry="4" fill="' + S.light + '" opacity=".45"/>' +
                '<circle class="fp-tw" cy="-8" r="6" fill="' + C.glow + '" filter="url(#' + id + 'gl)"/>' +
                '<g class="fp-sw"><path d="M0 0Q1.5 -6 0 -11" stroke="' + C.leafDark + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
                '<g transform="translate(0,-10)">' + leaf(9, 4.6, -58, C.leaf, C.leafEdge) + leaf(9, 4.6, 58, C.leaf, C.leafEdge) + '</g></g>';
        },
        // 從斜上方往下看：葉子朝四面張開成一圈（星形），整圈壓扁一點當透視
        seedling: function (C) {
            return shadow(14) + '<g class="fp-sw"><g transform="translate(0,-3) scale(1,.82)">' +
                ring(4, 14, 9, 45, C.leaf, C.leafEdge, C.rib) + '</g>' +
                '<circle cy="-3" r="2.4" fill="' + C.rib + '"/></g>';
        },
        growing: function (C) {
            // 花苞散在葉圈邊上、方向各不同，不要成對擺在頂上（會變成一對眼睛）
            var buds = [[-14, -9, -50], [11, -13, 35], [3, 4, 170]].map(function (p) {
                return '<g transform="translate(' + p[0] + ',' + p[1] + ') rotate(' + p[2] + ')">' +
                    '<path d="M0 0C2.4 -1.4 2 -5 0 -6.4C-2 -5 -2.4 -1.4 0 0Z" fill="' + C.bud + '" stroke="#86acd2" stroke-width=".7"/></g>';
            }).join('');
            return shadow(24) + '<g class="fp-sw"><g transform="translate(0,-5) scale(1,.82)">' +
                ring(8, 21, 9, 22.5, C.leafDark, C.leafEdge) + ring(6, 15, 8.5, 0, C.leaf, C.leafEdge, C.rib) + '</g>' +
                '<circle cy="-5" r="3" fill="' + C.rib + '"/>' + buds + '</g>';
        },
        mature: function (C, S, id) {
            // 豆莢從葉圈前緣垂下來；花散在葉圈裡、大小不一
            var pods = [[-15, 3, 18], [-5, 7, 5], [6, 7, -6], [16, 3, -18]].map(function (p) {
                var body = 'M0 0C4.5 4 5.5 14 1.5 22C-2 16 -4.5 7 0 0Z';
                return '<g transform="translate(' + p[0] + ',' + p[1] + ') rotate(' + p[2] + ')">' +
                    '<path class="fp-pulse" d="' + body + '" fill="' + C.glow + '" filter="url(#' + id + 'gl)"/>' +
                    '<path d="' + body + '" fill="' + C.pod + '" stroke="#1f8fa6" stroke-width=".9"/>' +
                    '<path d="M1 4Q2.6 11 1.4 17" stroke="' + C.podHi + '" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".85"/></g>';
            }).join('');
            var flowers = [[-15, -12, 1], [-1, -22, .85], [14, -14, 1], [-7, -3, .75], [19, -2, .8], [5, -8, .7], [-20, 0, .7]].map(function (p) {
                var petals = '';
                for (var k = 0; k < 5; k++) {
                    var a = (k * 72 + 18) * Math.PI / 180;
                    petals += '<circle cx="' + r1(p[0] + Math.sin(a) * 2.5 * p[2]) + '" cy="' + r1(p[1] - Math.cos(a) * 2.5 * p[2]) + '" r="' + r1(2.1 * p[2]) + '" fill="' + C.petal + '" stroke="#4f8fcf" stroke-width=".5"/>';
                }
                return petals + '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + r1(1.1 * p[2]) + '" fill="#e9f6ff"/>';
            }).join('');
            return shadow(29) + '<g class="fp-sw"><g transform="translate(0,-8) scale(1,.82)">' +
                ring(10, 26, 10, 18, C.leafDark, C.leafEdge) + ring(8, 19, 9, 0, C.leaf, C.leafEdge, C.rib) + '</g>' +
                flowers + '</g>' + pods;
        },
        wilted: function () {
            // 枯株：葉子細長、從中心往外往下垂成一把，顏色黃褐；兩三個乾掉的豆莢
            var droop = '';
            [100, 125, 150, 175, 200, 225, 250, 262, 98].forEach(function (a, i) {
                droop += leaf(i % 2 ? 20 : 24, 5.2, a, i % 3 ? WILT.leaf : WILT.leafDark, WILT.edge);
            });
            var up = [-35, 0, 35].map(function (a, i) { return leaf(12 + (i % 2) * 3, 4.5, a, WILT.leafDark, WILT.edge); }).join('');
            var dead = [[-10, -4, 12], [9, -2, -14]].map(function (p) {
                return '<g transform="translate(' + p[0] + ',' + p[1] + ') rotate(' + p[2] + ')"><path d="M0 0C2.8 3 3.2 9 .8 14C-1.6 10 -2.6 4 0 0Z" fill="' + WILT.pod + '" stroke="' + WILT.edge + '" stroke-width=".7"/></g>';
            }).join('');
            return shadow(22) + '<g transform="translate(0,-20)">' + up + droop + '</g>' +
                '<circle cy="-20" r="2.6" fill="' + WILT.edge + '"/>' + dead;
        }
    };

    // ══════════════════════════════════════════════════════════════
    // 其他九種作物：同一組零件（葉形、葉圈、細長葉、種子），照各自的樣子組。
    //   形態只有四種：rosette 葉圈（從上面看張成一圈）、tuft 直立葉叢（曦根）、
    //   corn 一根莖往上長（蜜光玉米）、wheat 細葉加麥穗（銀穗麥）。
    //   成熟的果實各作物自己畫（FRUIT）。
    // ══════════════════════════════════════════════════════════════
    var SP = {
        sunroot: { form: 'tuft', shape: 'pointed',
            seed: { shape: 'drop', fill: '#f2b33d', edge: '#a3641b', glow: '#ffd46b' },
            leaf: '#a9c64a', dark: '#6f8a2a', edge: '#4e6320', rib: '#e7dc7a', tip: '#f2c24a',
            fruit: '#f59a2b', fruitHi: '#ffd07a', fruitEdge: '#b0561a' },
        moonleaf: { form: 'rosette', shape: 'broad',
            seed: { shape: 'halfmoon', fill: '#c9c2e6', edge: '#6d6699', glow: '#b9a8ff' },
            leaf: '#4f7fa8', dark: '#2f5578', edge: '#1f3a55', rib: '#9fc0dc' },
        emberpepper: { form: 'rosette', shape: 'pointed',
            seed: { shape: 'ember', fill: '#2b2522', edge: '#120e0c', glow: '#ff8a3a', crack: '#ff7a2a' },
            leaf: '#6fa23e', dark: '#3f6a26', edge: '#2f4f1c', rib: '#a6cf6a', tip: '#ff8a3a',
            fruit: '#d9361f', fruitHi: '#ffb27a', fruitEdge: '#7d1a10' },
        cloudberry: { form: 'rosette', shape: 'round',
            seed: { shape: 'pearl', fill: '#bfe3ff', edge: '#6a9cc9', glow: '#bfe3ff', core: '#f59ac4' },
            leaf: '#8cc46a', dark: '#5c9444', edge: '#406e30', rib: '#f3a6c8', bud: '#f7b6d2',
            fruit: '#c7a3ea', fruitHi: '#f1e3ff', fruitEdge: '#7f5aa8', flower: '#f8cfe2' },
        frostbell: { form: 'rosette', shape: 'heart',
            seed: { shape: 'oval', fill: '#8fc3f2', edge: '#3f78b0', glow: '#9fdcff', vein: '#e6f4ff' },
            leaf: '#6fa7a0', dark: '#3f7470', edge: '#2c5552', rib: '#dff4ff', bud: '#bfe2ff',
            fruit: '#a8d2f5', fruitHi: '#eef8ff', fruitEdge: '#4b7fb3' },
        nightstar: { form: 'rosette', shape: 'broad',
            seed: { shape: 'halfmoon', fill: '#2d2a5a', edge: '#c9cde6', glow: '#8c8cff' },
            leaf: '#3f6b52', dark: '#274636', edge: '#1c3226', rib: '#c9d6e6', stem: '#6a3f8a',
            flower: '#b58df0', fruit: '#3a2878', fruitHi: '#8f7fe0', fruitEdge: '#1d1440' },
        honeycorn: { form: 'corn', shape: 'pointed',
            seed: { shape: 'kernel', fill: '#f2b640', edge: '#a8701c', glow: '#ffd46b' },
            leaf: '#8fbf3f', dark: '#5e8a2a', edge: '#45661f', rib: '#d8e68a', tip: '#f2cf55',
            fruit: '#f6c64a', fruitHi: '#fff0a8', fruitEdge: '#a8701c' },
        dawnberry: { form: 'rosette', shape: 'serrated',
            seed: { shape: 'heart', fill: '#f58f7f', edge: '#b54a3e', glow: '#ffb3a6' },
            leaf: '#8cc35a', dark: '#5a9238', edge: '#3f6d28', rib: '#f2a28f',
            fruit: '#ef5448', fruitHi: '#ffc2b6', fruitEdge: '#9c2a25', flower: '#fff4f0' },
        silverwheat: { form: 'wheat', shape: 'pointed',
            seed: { shape: 'grain', fill: '#cfdcea', edge: '#6f86a3', glow: '#cfe8ff' },
            leaf: '#6f9f8f', dark: '#4b7768', edge: '#34574b', rib: '#cfe3dc', tip: '#d8e6f0',
            fruit: '#aac6e6', fruitHi: '#f2f8ff', fruitEdge: '#4d6f98' }
    };
    Object.keys(SP).forEach(function (k) { SP[k].key = k; });
    // 枯萎時的葉色：大多是黃褐；夜星茄偏紫褐、月葉菜偏灰紫
    var WILT_OF = {
        nightstar: { leaf: '#6e5862', leafDark: '#4a3a44', edge: '#2e232b', pod: '#5d5560' },
        moonleaf: { leaf: '#857d88', leafDark: '#605866', edge: '#433c48', pod: '#6b6570' },
        emberpepper: { leaf: '#7a5a38', leafDark: '#553d24', edge: '#352414', pod: '#3a2420' },
        cloudberry: { leaf: '#8a6e48', leafDark: '#634e32', edge: '#40321f', pod: '#7d7088' },
        dawnberry: { leaf: '#7e5c3a', leafDark: '#5a4028', edge: '#382818', pod: '#9a4a3a' },
        frostbell: { leaf: '#7d7a6c', leafDark: '#5a584c', edge: '#3c3a32', pod: '#7f8f9c' }
    };
    // 枯萎時垂在旁邊那兩個乾掉的果實
    var DEAD_FRUIT = { emberpepper: '#3a2420', cloudberry: '#7d7088', frostbell: '#7f8f9c', nightstar: '#55506a', dawnberry: '#9a4a3a' };

    // 葉形：半邊寬是長度的幾成（星露豆的圓葉 15 長、9 寬＝0.6）
    var SHAPE_W = { round: 0.6, broad: 0.52, pointed: 0.3, heart: 0.56, serrated: 0.58 };

    function heartLeaf(len, w, ang, fill, edge, rib) {
        var L = len;
        var d = 'M0 ' + r1(-L * 0.1) +
            'C' + r1(w * 0.55) + ' ' + r1(L * 0.08) + ' ' + r1(w * 1.05) + ' ' + r1(-L * 0.22) + ' ' + r1(w * 0.85) + ' ' + r1(-L * 0.5) +
            'C' + r1(w * 0.65) + ' ' + r1(-L * 0.75) + ' ' + r1(w * 0.22) + ' ' + r1(-L * 0.92) + ' 0 ' + r1(-L) +
            'C' + r1(-w * 0.22) + ' ' + r1(-L * 0.92) + ' ' + r1(-w * 0.65) + ' ' + r1(-L * 0.75) + ' ' + r1(-w * 0.85) + ' ' + r1(-L * 0.5) +
            'C' + r1(-w * 1.05) + ' ' + r1(-L * 0.22) + ' ' + r1(-w * 0.55) + ' ' + r1(L * 0.08) + ' 0 ' + r1(-L * 0.1) + 'Z';
        return '<g transform="rotate(' + ang + ')"><path d="' + d + '" fill="' + fill + '" stroke="' + edge + '" stroke-width=".9"/>' +
            (rib ? '<path d="M0 -3L0 ' + r1(-L * 0.85) + '" stroke="' + rib + '" stroke-width="1" stroke-linecap="round" opacity=".65"/>' : '') + '</g>';
    }
    function shapeLeaf(shape, len, ang, fill, edge, rib) {
        var w = len * (SHAPE_W[shape] || 0.5);
        if (shape === 'heart') return heartLeaf(len, w, ang, fill, edge, rib);
        var out = leaf(len, w, ang, fill, edge, rib);
        // 鋸齒葉：邊緣改描虛線，小尺寸下看起來就是一圈細齒
        if (shape === 'serrated') out = out.replace('stroke-width=".9"/>', 'stroke-width="1.3" stroke-dasharray="1.6 1.1"/>');
        return out;
    }
    function ringShape(n, len, shape, start, fill, edge, rib) {
        var out = '';
        for (var i = 0; i < n; i++) out += shapeLeaf(shape, len, r1(start + i * 360 / n), fill, edge, rib);
        return out;
    }
    // 細長葉：bend 正＝葉尖往右彎；tip 給葉尖另一個顏色
    function blade(len, w, ang, fill, edge, tip, bend) {
        var b = bend || 0;
        var d = 'M' + r1(-w) + ' 0Q' + r1(-w * 0.7 + b * 0.5) + ' ' + r1(-len * 0.55) + ' ' + r1(b) + ' ' + r1(-len) +
            'Q' + r1(w * 0.7 + b * 0.5) + ' ' + r1(-len * 0.55) + ' ' + r1(w) + ' 0Z';
        var t = tip ? '<path d="M' + r1(-w * 0.42 + b * 0.62) + ' ' + r1(-len * 0.66) + 'L' + r1(b) + ' ' + r1(-len) + 'L' + r1(w * 0.42 + b * 0.62) + ' ' + r1(-len * 0.66) + 'Z" fill="' + tip + '"/>' : '';
        return '<g transform="rotate(' + ang + ')"><path d="' + d + '" fill="' + fill + '" stroke="' + edge + '" stroke-width=".8"/>' + t + '</g>';
    }
    // 直立葉叢：n 片細長葉從同一點往上張開，中間最長
    function tuft(n, len, w, spread, fill, edge, tip, bend) {
        var out = '';
        for (var i = 0; i < n; i++) {
            var t = n === 1 ? 0 : i / (n - 1) * 2 - 1;
            out += blade(r1(len * (1 - Math.abs(t) * 0.28)), w, r1(t * spread), fill, edge, tip, r1(t * (bend || 3)));
        }
        return out;
    }
    function rosette(n, len, shape, start, fill, edge, rib, lift) {
        return '<g transform="translate(0,' + (lift || -4) + ') scale(1,.82)">' + ringShape(n, len, shape, start, fill, edge, rib) + '</g>';
    }
    function glowDot(cy, r, color, id) {
        return '<circle class="fp-tw" cy="' + cy + '" r="' + r + '" fill="' + color + '" filter="url(#' + id + 'gl)"/>';
    }
    function flower5(x, y, s, petal, edge, core) {
        var out = '';
        for (var k = 0; k < 5; k++) {
            var a = (k * 72 + 18) * Math.PI / 180;
            out += '<circle cx="' + r1(x + Math.sin(a) * 2.5 * s) + '" cy="' + r1(y - Math.cos(a) * 2.5 * s) + '" r="' + r1(2.1 * s) + '" fill="' + petal + '" stroke="' + edge + '" stroke-width=".5"/>';
        }
        return out + '<circle cx="' + x + '" cy="' + y + '" r="' + r1(1.1 * s) + '" fill="' + core + '"/>';
    }
    function star5(x, y, r, fill, edge) {
        var d = '';
        for (var k = 0; k < 10; k++) {
            var a = k * 36 * Math.PI / 180, rr = k % 2 ? r * 0.45 : r;
            d += (k ? 'L' : 'M') + r1(x + Math.sin(a) * rr) + ' ' + r1(y - Math.cos(a) * rr);
        }
        return '<path d="' + d + 'Z" fill="' + fill + '" stroke="' + edge + '" stroke-width=".6" stroke-linejoin="round"/>';
    }

    function seedOf(sp, S, id) {
        var s = sp.seed, body;
        var ed = ' stroke="' + s.edge + '" stroke-width=".9"';
        switch (s.shape) {
            case 'drop': body = '<path d="M0 -7C2.8 -3.5 4 -1 4 1A4 4 0 0 1 -4 1C-4 -1 -2.8 -3.5 0 -7Z" fill="' + s.fill + '"' + ed + '/>'; break;
            case 'halfmoon': body = '<path d="M-5.5 1A5.5 5.5 0 0 1 5.5 1A5.5 2.4 0 0 0 -5.5 1Z" fill="' + s.fill + '"' + ed + '/>' +
                '<path d="M-4.6 -.6A4.6 4.6 0 0 1 3.2 -3.2" stroke="' + s.edge + '" stroke-width="1.1" fill="none" opacity=".8"/>'; break;
            case 'ember': body = '<ellipse cy="-1" rx="5" ry="3.8" fill="' + s.fill + '"' + ed + '/>' +
                '<path d="M-2.4 -3L-.6 -1.2L-1.6 1.2M1 -3.4L2 -.6L.8 1.6" stroke="' + s.crack + '" stroke-width=".9" fill="none" stroke-linecap="round"/>'; break;
            case 'pearl': body = '<circle cy="-1" r="3.8" fill="' + s.fill + '"' + ed + '/><circle cy="-1" r="1.4" fill="' + s.core + '"/>'; break;
            case 'oval': body = '<ellipse cy="-2" rx="4.2" ry="5.6" fill="' + s.fill + '"' + ed + '/>' +
                '<path d="M0 -6.4Q1.4 -2 0 2.6" stroke="' + s.vein + '" stroke-width=".9" fill="none"/>'; break;
            case 'kernel': body = '<ellipse cy="-1.5" rx="5.8" ry="4.8" fill="' + s.fill + '"' + ed + '/>'; break;
            case 'heart': body = '<path d="M0 3C-5 -1 -4.6 -5.4 -2 -5.4C-.9 -5.4 0 -4.4 0 -3.4C0 -4.4 .9 -5.4 2 -5.4C4.6 -5.4 5 -1 0 3Z" fill="' + s.fill + '"' + ed + '/>'; break;
            default: body = [-32, 0, 32].map(function (a) {   // grain：三顆細長麥種張成扇形
                return '<ellipse transform="rotate(' + a + ')" cy="-4" rx="1.7" ry="4.2" fill="' + s.fill + '"' + ed + '/>';
            }).join('');
        }
        return '<ellipse rx="13" ry="7" fill="' + S.dark + '"/>' +
            '<ellipse cy="-1" rx="13" ry="7" fill="none" stroke="' + S.light + '" stroke-width="1.4" opacity=".55"/>' +
            '<ellipse class="fp-tw" cy="-1" rx="9" ry="6" fill="' + s.glow + '" filter="url(#' + id + 'gl)"/>' + body +
            '<ellipse cx="-1.6" cy="-2.6" rx="1.4" ry=".9" fill="#fff" opacity=".6"/>';
    }

    // ── 成熟的果實：各作物自己的樣子（畫在葉子前面）──
    var FRUIT = {
        sunroot: function (sp) {   // 金橙圓根露出土面，上面有太陽紋
            var rays = '';
            for (var k = 0; k < 8; k++) {
                var a = k * 45 * Math.PI / 180;
                rays += '<path d="M' + r1(Math.sin(a) * 4) + ' ' + r1(-7 - Math.cos(a) * 4) + 'L' + r1(Math.sin(a) * 8) + ' ' + r1(-7 - Math.cos(a) * 8) + '" stroke="' + sp.fruitHi + '" stroke-width="1" stroke-linecap="round" opacity=".75"/>';
            }
            return '<ellipse cy="-7" rx="12" ry="10.5" fill="' + sp.fruit + '" stroke="' + sp.fruitEdge + '" stroke-width="1.1"/>' + rays +
                '<ellipse cx="-4" cy="-11" rx="3.4" ry="2.2" fill="' + sp.fruitHi + '" opacity=".7"/>';
        },
        emberpepper: function (sp, id) {   // 彎彎的紅椒垂在葉圈前緣，表皮有橙色裂紋在發光
            return [[-15, -2, 22], [-5, 1, 6], [6, 1, -8], [16, -2, -22]].map(function (p) {
                var body = 'M0 0C3.4 2 4 9 1.4 16C.4 18.6 -1.6 17.6 -1.2 14.6C-.2 9 -2.4 3 0 0Z';
                return '<g transform="translate(' + p[0] + ',' + p[1] + ') rotate(' + p[2] + ')">' +
                    '<path class="fp-pulse" d="' + body + '" fill="' + sp.tip + '" filter="url(#' + id + 'gl)"/>' +
                    '<path d="' + body + '" fill="' + sp.fruit + '" stroke="' + sp.fruitEdge + '" stroke-width=".9"/>' +
                    '<path d="M.6 3.5L1.4 7L.4 10M1.6 9L2.2 12" stroke="' + sp.fruitHi + '" stroke-width=".8" fill="none" stroke-linecap="round"/>' +
                    '<path d="M-1.6 .4Q0 -2.4 1.8 .2" fill="' + sp.dark + '"/></g>';
            }).join('');
        },
        cloudberry: function (sp) {   // 一串串粉紫小莓果＋幾朵粉花
            var cluster = function (x, y) {
                var o = '';
                [[0, 0], [3.6, -1], [-3.6, -1], [1.8, -4], [-1.8, -4], [1.8, 2.8], [-1.8, 2.8]].forEach(function (q) {
                    o += '<circle cx="' + r1(x + q[0]) + '" cy="' + r1(y + q[1]) + '" r="2.3" fill="' + sp.fruit + '" stroke="' + sp.fruitEdge + '" stroke-width=".6"/>' +
                        '<circle cx="' + r1(x + q[0] - 0.7) + '" cy="' + r1(y + q[1] - 0.8) + '" r=".7" fill="' + sp.fruitHi + '"/>';
                });
                return o;
            };
            return cluster(-12, -8) + cluster(11, -10) + cluster(0, 3) +
                flower5(-2, -17, 0.9, sp.flower, '#d98ab0', '#ffe27a') + flower5(17, 1, 0.8, sp.flower, '#d98ab0', '#ffe27a');
        },
        frostbell: function (sp) {   // 一顆冰藍鈴形瓜擋在葉叢前面，身上有銀霜紋
            return '<g transform="translate(0,4)">' +
                '<path d="M0 -20C7 -20 11.5 -10 11.5 0C11.5 8 6.5 12 0 12C-6.5 12 -11.5 8 -11.5 0C-11.5 -10 -7 -20 0 -20Z" fill="' + sp.fruit + '" stroke="' + sp.fruitEdge + '" stroke-width="1.1"/>' +
                '<path d="M-5.5 -17C-8 -8 -8 4 -4.5 11M5.5 -17C8 -8 8 4 4.5 11M0 -20V12" stroke="' + sp.fruitEdge + '" stroke-width=".8" fill="none" opacity=".6"/>' +
                '<path d="M-7 -6l2 -1.5 1.5 2M3 -11l1.6 1.4 -.4 2M4 2l2 1 -1 1.8" stroke="' + sp.fruitHi + '" stroke-width=".9" fill="none" stroke-linecap="round"/>' +
                '<path d="M-2 -20Q0 -25 2.6 -24" stroke="' + sp.edge + '" stroke-width="2" fill="none" stroke-linecap="round"/></g>';
        },
        nightstar: function (sp) {   // 深靛紫茄子垂著，身上有星點；一朵淡紫星花
            var egg = function (x, y, rot) {
                return '<g transform="translate(' + x + ',' + y + ') rotate(' + rot + ')">' +
                    '<path d="M0 0C4.4 1 6.4 7 5.4 12.4C4.4 17.6 -4.4 17.6 -5.4 12.4C-6.4 7 -4.4 1 0 0Z" fill="' + sp.fruit + '" stroke="' + sp.fruitEdge + '" stroke-width=".9"/>' +
                    '<circle cx="-2" cy="7" r=".7" fill="#fff"/><circle cx="1.8" cy="11" r=".6" fill="#fff"/><circle cx="-.6" cy="13.6" r=".5" fill="#fff"/>' +
                    '<path d="M-3.4 1.4L0 -1.4L3.4 1.4L0 3Z" fill="' + sp.leaf + '"/></g>';
            };
            return egg(-12, -4, 16) + egg(0, 0, 0) + egg(12, -4, -16) + star5(-5, -16, 4.2, sp.flower, '#7a55b8') + '<circle cx="-5" cy="-16" r="1.1" fill="#ffe27a"/>';
        },
        dawnberry: function (sp) {   // 珊瑚紅的愛心莓，一朵白花
            var berry = function (x, y, s) {
                return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
                    '<path d="M0 8C-7 2 -6.4 -4.6 -3 -4.6C-1.4 -4.6 0 -3.2 0 -2C0 -3.2 1.4 -4.6 3 -4.6C6.4 -4.6 7 2 0 8Z" fill="' + sp.fruit + '" stroke="' + sp.fruitEdge + '" stroke-width=".9"/>' +
                    '<circle cx="-2.4" cy="-.4" r=".5" fill="#ffe27a"/><circle cx="1.8" cy="1" r=".5" fill="#ffe27a"/><circle cx="-.4" cy="3.6" r=".5" fill="#ffe27a"/>' +
                    '<ellipse cx="-2.6" cy="-2.4" rx="1.3" ry=".8" fill="' + sp.fruitHi + '" opacity=".8"/>' +
                    '<path d="M-2.6 -4.4L0 -6.4L2.6 -4.4" stroke="' + sp.dark + '" stroke-width="1.4" fill="none" stroke-linecap="round"/></g>';
            };
            return berry(-13, -4, 1) + berry(12, -6, 0.95) + berry(-3, 3, 1.05) + berry(8, 6, 0.9) + flower5(2, -14, 1, sp.flower, '#e6c9c0', '#ffd23a');
        }
    };
    // 月葉菜成熟：多層葉球，外圈深、往內越亮
    function cabbage(c1, c2, c3, core, edge, tf) {
        return '<g transform="' + (tf || 'translate(0,-6) scale(1,.84)') + '">' +
            ringShape(10, 24, 'broad', 0, c1, edge) + ringShape(9, 19, 'broad', 20, c2, edge) + ringShape(7, 14, 'broad', 8, c3, edge) + ringShape(5, 9, 'broad', 30, core, edge) +
            '<circle r="4.6" fill="' + core + '" stroke="' + edge + '" stroke-width=".8"/></g>';
    }
    // 玉米：一根莖，葉子沿莖左右交錯長出去；droop 給枯萎時把葉子往下掰
    function cornStalk(col, h, leaves, droop) {
        var out = '<path d="M0 0L0 ' + (-h) + '" stroke="' + col.dark + '" stroke-width="4.4" stroke-linecap="round"/>';
        for (var i = 0; i < leaves; i++) {
            var y = -r1(h * (0.18 + i * 0.7 / Math.max(1, leaves - 1)));
            var side = i % 2 ? 1 : -1;
            out += '<g transform="translate(0,' + y + ')">' +
                blade(r1(h * 0.7 - i * 1.5), 4, side * r1(60 - i * 5 + (droop || 0)), i % 2 ? col.leaf : col.dark, col.edge, col.tip, side * 6) + '</g>';
        }
        return out;
    }
    function cornCob(x, y, rot, c) {
        var rows = '';
        for (var k = -8; k <= 8; k += 2.7) rows += '<path d="M-4.8 ' + r1(k) + 'H4.8" stroke="' + c.fruitEdge + '" stroke-width=".6" opacity=".55"/>';
        return '<g transform="translate(' + x + ',' + y + ') rotate(' + rot + ')">' +
            '<ellipse rx="5.4" ry="11" fill="' + c.fruit + '" stroke="' + c.fruitEdge + '" stroke-width=".9"/>' + rows +
            '<ellipse cx="-1.4" cy="-3" rx="1.2" ry="3" fill="' + c.fruitHi + '" opacity=".7"/>' +
            '<path d="M-5.4 10C-7.4 2 -6 -5 -2.4 -10M5.4 10C7.4 2 6 -5 2.4 -10" stroke="' + c.leaf + '" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>';
    }
    // 麥穗：一串小顆粒左右交錯，頂上幾根細芒；closed＝還沒飽滿的幼穗
    function wheatEar(ang, len, stalk, a, b, closed) {
        var g = '';
        var n = closed ? 4 : 7;
        for (var k = 0; k < n; k++) {
            var y = -len - k * 3.4;
            g += '<ellipse cx="' + (closed ? 0 : (k % 2 ? 1.8 : -1.8)) + '" cy="' + r1(y) + '" rx="' + (closed ? 1.5 : 2.3) + '" ry="' + (closed ? 2.4 : 3) + '" fill="' + a + '" stroke="' + b + '" stroke-width=".6"/>';
        }
        var top = r1(-len - n * 3.4);
        var awn = closed ? '' : '<path d="M0 ' + top + 'l-2 -5M0 ' + top + 'l2 -5M0 ' + top + 'v-6" stroke="' + a + '" stroke-width=".5"/>';
        return '<g transform="rotate(' + ang + ')"><path d="M0 0V' + r1(-len) + '" stroke="' + stalk + '" stroke-width="1"/>' + g + awn + '</g>';
    }

    function plume(len, w, ang, sp, bend) {
        var b = bend || 0;
        var d = 'M0 0Q' + r1(-w * 1.2 + b * 0.4) + ' ' + r1(-len * 0.5) + ' ' + r1(b) + ' ' + r1(-len) + 'Q' + r1(w * 1.2 + b * 0.4) + ' ' + r1(-len * 0.5) + ' 0 0Z';
        var barbs = '';
        for (var k = 1; k <= 6; k++) {
            var t = k / 7, y = r1(-len * t), x = r1(b * t * t), ww = r1(w * (1 - Math.abs(t - 0.45) * 1.2));
            barbs += '<path d="M' + x + ' ' + y + 'l' + (-ww) + ' -2.6M' + x + ' ' + y + 'l' + ww + ' -2.6" stroke="' + sp.fruitHi + '" stroke-width=".7" stroke-linecap="round" opacity=".85"/>';
        }
        return '<g transform="rotate(' + ang + ')"><path d="' + d + '" fill="' + sp.fruit + '" stroke="' + sp.fruitEdge + '" stroke-width=".8"/>' +
            '<path d="M0 -1Q' + r1(b * 0.3) + ' ' + r1(-len * 0.5) + ' ' + r1(b) + ' ' + r1(-len) + '" stroke="' + sp.fruitEdge + '" stroke-width=".8" fill="none"/>' + barbs + '</g>';
    }

    var STAGE = {
        seeded: function (sp, S, id) { return seedOf(sp, S, id); },
        emerging: function (sp, S, id) {
            var sprout = sp.form !== 'rosette'
                ? tuft(sp.form === 'corn' ? 2 : 3, 11, 1.7, 24, sp.leaf, sp.edge, sp.tip, 2)
                : '<path d="M0 0Q1.5 -6 0 -10" stroke="' + (sp.stem || sp.dark) + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
                  '<g transform="translate(0,-9)">' + shapeLeaf(sp.shape, 10, -58, sp.leaf, sp.edge, sp.rib) + shapeLeaf(sp.shape, 10, 58, sp.leaf, sp.edge, sp.rib) + '</g>';
            return '<ellipse rx="10" ry="4" fill="' + S.light + '" opacity=".45"/>' + glowDot(-8, 6, sp.seed.glow, id) +
                '<g class="fp-sw">' + sprout + '</g>';
        },
        seedling: function (sp) {
            if (sp.form === 'tuft') return shadow(12) + '<g class="fp-sw">' + tuft(5, 17, 2.2, 40, sp.leaf, sp.edge, sp.tip, 3) + '</g>';
            if (sp.form === 'corn') return shadow(12) + '<g class="fp-sw">' + tuft(5, 22, 3.6, 38, sp.leaf, sp.edge, sp.tip, 4) + '</g>';
            if (sp.form === 'wheat') return shadow(12) + '<g class="fp-sw">' + tuft(7, 16, 1.4, 44, sp.leaf, sp.edge, sp.tip, 3) + '</g>';
            var n = sp.shape === 'broad' || sp.shape === 'round' ? 4 : 3;   // 細葉排四片會變成一個 X
            return shadow(14) + '<g class="fp-sw">' + rosette(n, sp.shape === 'heart' ? 17 : 14, sp.shape, n === 3 ? 0 : 45, sp.leaf, sp.edge, sp.rib, -3) +
                '<circle cy="-3" r="2.2" fill="' + (sp.stem || sp.rib) + '"/></g>';
        },
        growing: function (sp) {
            if (sp.form === 'tuft') {   // 曦根：葉叢長大，土面剛露出一點金色根肩
                return shadow(18) + '<ellipse cy="-1" rx="7.5" ry="4.2" fill="' + sp.fruit + '" stroke="' + sp.fruitEdge + '" stroke-width=".9"/>' +
                    '<g class="fp-sw">' + tuft(7, 25, 2.6, 52, sp.leaf, sp.edge, sp.tip, 4) + '</g>';
            }
            if (sp.form === 'corn') return shadow(16) + '<g class="fp-sw">' + cornStalk(sp, 34, 6) +
                '<path d="M0 -34l-3 -6M0 -34l3 -6M0 -34v-7" stroke="' + sp.tip + '" stroke-width="1.2" stroke-linecap="round"/></g>';
            if (sp.form === 'wheat') return shadow(16) + '<g class="fp-sw">' + tuft(9, 24, 1.5, 40, sp.leaf, sp.edge, null, 3) +
                wheatEar(-14, 18, sp.dark, sp.rib, sp.edge, true) + wheatEar(0, 21, sp.dark, sp.rib, sp.edge, true) + wheatEar(14, 18, sp.dark, sp.rib, sp.edge, true) + '</g>';
            var extra = '';
            if (sp.key === 'nightstar') extra = star5(-9, -12, 3.4, sp.flower, '#7a55b8') + star5(10, -6, 3, sp.flower, '#7a55b8');
            else if (sp.key === 'frostbell') extra = '<path d="M-16 -2c-4 -1 -4 -6 0 -6s3 4 0 3M15 -12c4 0 5 -5 1 -6s-3 3 0 3" stroke="' + sp.edge + '" stroke-width="1" fill="none"/>' +
                '<path d="M-6 -16a3 3 0 0 0 6 0z" fill="' + sp.bud + '" stroke="#6e9ccc" stroke-width=".7"/><path d="M9 -2a2.6 2.6 0 0 0 5.2 0z" fill="' + sp.bud + '" stroke="#6e9ccc" stroke-width=".7"/>';
            else if (sp.bud) extra = [[-13, -9], [4, -17], [14, -4]].map(function (p) {
                return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.4" fill="' + sp.bud + '" stroke="' + sp.edge + '" stroke-width=".6"/>';
            }).join('');
            else if (sp.flower) extra = flower5(-10, -10, 0.75, sp.flower, '#e6c9c0', '#ffd23a') + flower5(9, -14, 0.7, sp.flower, '#e6c9c0', '#ffd23a');
            return shadow(24) + '<g class="fp-sw">' + rosette(8, sp.shape === 'broad' ? 23 : 21, sp.shape, 22.5, sp.dark, sp.edge, null, -5) +
                rosette(6, 15, sp.shape, 0, sp.leaf, sp.edge, sp.rib, -5) + extra + '</g>';
        },
        mature: function (sp, S, id) {
            if (sp.key === 'sunroot') return shadow(20) + '<g class="fp-sw"><g transform="translate(0,-14)">' + tuft(7, 22, 2.6, 55, sp.leaf, sp.edge, sp.tip, 4) + '</g></g>' + FRUIT.sunroot(sp);
            if (sp.key === 'moonleaf') return shadow(28) + '<g class="fp-sw">' + cabbage('#2d4f78', '#4a79a8', '#79a6cf', '#b3cde6', '#1b3350') + '</g>';
            if (sp.key === 'honeycorn') return shadow(16) + '<g class="fp-sw">' + cornStalk(sp, 40, 6) + cornCob(-7, -22, -18, sp) + cornCob(7, -13, 20, sp) +
                '<path d="M0 -40l-4 -7M0 -40l4 -7M0 -40v-9M0 -40l-7 -3M0 -40l7 -3" stroke="' + sp.tip + '" stroke-width="1.3" stroke-linecap="round"/></g>';
            if (sp.key === 'silverwheat') {
                // 飽滿的麥穗像一根根銀藍羽毛：中間一條穗軸，兩邊一排細芒，往外彎
                var plumes = '';
                [-46, -26, -8, 10, 28, 46].forEach(function (a, i) { plumes += plume(i % 2 ? 26 : 30, 5.4, a, sp, a < 0 ? -4 : 4); });
                return shadow(20) + '<g class="fp-sw">' + tuft(7, 18, 1.5, 50, sp.dark, sp.edge, null, 3) + plumes + '</g>';
            }
            return shadow(28) + '<g class="fp-sw">' + rosette(10, sp.shape === 'broad' ? 26 : 24, sp.shape, 18, sp.dark, sp.edge, null, -7) +
                rosette(8, 18, sp.shape, 0, sp.leaf, sp.edge, sp.rib, -7) + FRUIT[sp.key](sp, id) + '</g>';
        },
        wilted: function (sp) {
            var W = WILT_OF[sp.key] || WILT;
            if (sp.key === 'moonleaf') return shadow(24) + cabbage(W.leafDark, W.leaf, '#9a93a0', '#b4adb8', W.edge, 'translate(0,-4) scale(.9,.72)');
            if (sp.form === 'tuft' || sp.form === 'wheat') {   // 細長葉整把倒伏
                var out = '';
                [-120, -95, -70, 60, 85, 110, 130].forEach(function (a, i) { out += blade(i % 2 ? 20 : 24, 1.8, a, i % 3 ? W.leaf : W.leafDark, W.edge, null, a < 0 ? 6 : -6); });
                var dead = sp.form === 'tuft'
                    ? '<ellipse cy="-4" rx="8" ry="6.5" fill="#a8793a" stroke="' + W.edge + '" stroke-width="1"/><path d="M-4 -6q2 2 0 4M2 -8q2 3 0 5" stroke="' + W.edge + '" stroke-width=".8" fill="none"/>'
                    : wheatEar(-58, 14, W.edge, '#b8a88a', W.edge, true) + wheatEar(64, 12, W.edge, '#b8a88a', W.edge, true);
                return shadow(20) + '<g transform="translate(0,-6)">' + out + '</g>' + dead;
            }
            if (sp.form === 'corn') {   // 莖彎折、葉子往下垂，玉米沒了光
                return shadow(14) + '<g transform="rotate(14)">' + cornStalk({ leaf: W.leaf, dark: W.leafDark, edge: W.edge }, 30, 4, 55) +
                    cornCob(4, -16, 50, { fruit: '#b8a070', fruitHi: '#d8c89a', fruitEdge: W.edge, leaf: W.leaf }) + '</g>';
            }
            // 塌下來的一叢：葉子還是張成一圈，但壓得很扁、顏色枯掉；乾掉的果實散在邊上
            var shp = sp.shape === 'heart' ? 'heart' : sp.shape === 'broad' ? 'broad' : 'pointed';
            var mound = '<g transform="translate(0,-3) scale(1,.58)">' + ringShape(9, 21, shp, 12, W.leafDark, W.edge) + '</g>' +
                '<g transform="translate(0,-5) scale(.9,.52)">' + ringShape(7, 15, shp, 30, W.leaf, W.edge) + '</g>' +
                '<path d="M-3 -4q-2 -7 1 -12M3 -4q3 -6 1 -11" stroke="' + W.edge + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
            var shrivel = [[-14, 0, 30], [13, -1, -30], [2, 4, 5]].map(function (p) {
                return '<g transform="translate(' + p[0] + ',' + p[1] + ') rotate(' + p[2] + ')"><path d="M0 0C2.6 2.4 3 7 .8 11C-1.4 8 -2.4 3.4 0 0Z" fill="' + W.pod + '" stroke="' + W.edge + '" stroke-width=".7"/></g>';
            }).join('');
            return shadow(24) + mound + shrivel;
        }
    };

    function svg(opts) {
        opts = opts || {};
        var state = opts.state || 'dry';
        var C = CROP_STYLE[opts.crop] || CROP_STYLE.stardew;
        var id = 'fp' + (++uid) + '_';
        // 有作物的田：opts.wet 說今天澆過沒（09-29 起種下不會順便澆，不能一種上就畫濕土）；
        // 沒給 opts.wet 的（對照頁）照舊當濕的。枯萎一律乾。
        var soilKey = (state === 'dry' || state === 'wilted') ? 'dry'
            : (state !== 'wet' && opts.wet === false) ? 'dry' : 'wet';
        var S = SOIL[soilKey];
        ensureCss(opts.doc);
        var body = frame(id, soilKey);
        if (state === 'dry') body += cracks();
        var sp = SP[opts.crop];
        var draw = sp ? (STAGE[state] && function (C2, S2, id2) { return STAGE[state](sp, S2, id2); }) : DRAW[state];
        var fit = draw ? fitOf((sp ? opts.crop : 'stardew') + ':' + state, function () { return draw(C, S, 'fpm_'); }, opts.doc) : null;
        var k = (sp ? SP_SCALE[state] : PLANT_SCALE[state]) || 1;
        if (fit) k = Math.min(k, MAX_H / (fit[1] - fit[0]), fit[3] != null ? MAX_W / (fit[3] - fit[2]) : 99);
        var mid = fit ? (fit[0] + fit[1]) / 2 : 0;
        if (draw) {
            SPOTS.forEach(function (p, i) {
                var delay = r1(-(i * 0.53) % 3.4);
                var sc = Math.round(k * persp(p[1]) * 100) / 100;
                var gy = r1(p[1] - mid * sc);
                body += '<g class="fp-plant" transform="translate(' + px(p[0], gy) + ',' + gy + ') scale(' + sc + ')">' +
                    draw(C, S, id).replace(/class="fp-(sw|tw|pulse)"/g, 'class="fp-$1" style="animation-delay:' + delay + 's"') + '</g>';
            });
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + VIEWBOX + '" class="fp-plot" role="img" aria-label="農田">' + body + '</svg>';
    }

    root.FarmPlotDraw = { svg: svg, ensureCss: ensureCss, CROPS: ['stardew'].concat(Object.keys(SP)), STATES: ['dry', 'wet', 'seeded', 'emerging', 'seedling', 'growing', 'mature', 'wilted'] };
})(typeof window !== 'undefined' ? window : this);
