// ============================================================
// farm_item_draw.js — 商店小圖示用程式畫（局外 LAB）
// ------------------------------------------------------------
// 取代舊的商店 PNG（09-29 已刪）。
// FarmItemDraw.svg({ kind: 'seed' | 'harvest', crop }) → '<svg …>'（viewBox 64×64）
//   圖示很小：形狀要一眼認得出，靠漸層＋一點高光做出亮面立體感。
// ============================================================
(function (root) {
    'use strict';

    var uid = 0;

    function r1(n) { return Math.round(n * 10) / 10; }

    // 每張圖自己一組漸層 id（同一頁會有很多張）
    function kit() {
        var n = ++uid, defs = [];
        return {
            defs: defs,
            rg: function (a, b, cx, cy) {
                var id = 'fi' + n + '_' + defs.length;
                defs.push('<radialGradient id="' + id + '" cx="' + (cx || 0.35) + '" cy="' + (cy || 0.3) + '" r=".85"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></radialGradient>');
                return 'url(#' + id + ')';
            },
            lg: function (a, b, x2, y2) {
                var id = 'fi' + n + '_' + defs.length;
                defs.push('<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (x2 == null ? 0 : x2) + '" y2="' + (y2 == null ? 1 : y2) + '"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>');
                return 'url(#' + id + ')';
            }
        };
    }

    function at(x, y, rot, s, body) {
        return '<g transform="translate(' + x + ',' + y + ')' + (rot ? ' rotate(' + rot + ')' : '') + (s && s !== 1 ? ' scale(' + s + ')' : '') + '">' + body + '</g>';
    }
    function hl(x, y, rx, ry, rot, op) {
        return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '"' + (rot ? ' transform="rotate(' + rot + ' ' + x + ' ' + y + ')"' : '') + ' fill="#fff" opacity="' + (op || 0.6) + '"/>';
    }
    function path(d, fill, edge, w) {
        return '<path d="' + d + '" fill="' + fill + '"' + (edge ? ' stroke="' + edge + '" stroke-width="' + (w || 1.2) + '" stroke-linejoin="round"' : '') + '/>';
    }
    // 基本形：都以 (0,0) 為中心、大小約 ±1，再用 at() 放大
    var DROP = 'M0 -1C.55 -.45 .78 .02 .78 .36A.78 .78 0 0 1 -.78 .36C-.78 .02 -.55 -.45 0 -1Z';
    var HEART = 'M0 .9C-.95 .25 -.95 -.62 -.48 -.8C-.22 -.9 0 -.72 0 -.52C0 -.72 .22 -.9 .48 -.8C.95 -.62 .95 .25 0 .9Z';
    var BEAN = 'M-.95 .1C-.95 -.55 -.35 -.75 .1 -.6C.5 -.47 .95 -.5 .95 .05C.95 .6 .4 .72 -.05 .66C-.55 .6 -.95 .62 -.95 .1Z';
    var CRESCENT = 'M-.9 .35C-.9 -.45 -.2 -.85 .55 -.75C.1 -.55 -.25 -.15 -.2 .3C-.15 .62 .2 .8 .6 .82C.05 1.05 -.9 .95 -.9 .35Z';
    var LEAF = 'M0 0C.5 -.25 .5 -.8 0 -1C-.5 -.8 -.5 -.25 0 0Z';

    // 描邊寬度要跟著縮放抵銷，不然放大的形狀邊會變很粗
    function shape(d, x, y, s, rot, fill, edge) {
        return at(x, y, rot, s, path(d, fill, edge, r1(1.2 / s)));
    }
    function leaf(x, y, len, w, rot, fill, edge) {
        var d = 'M0 0C' + r1(w) + ' ' + r1(-len * 0.25) + ' ' + r1(w) + ' ' + r1(-len * 0.8) + ' 0 ' + (-len) +
            'C' + r1(-w) + ' ' + r1(-len * 0.8) + ' ' + r1(-w) + ' ' + r1(-len * 0.25) + ' 0 0Z';
        return at(x, y, rot, 1, path(d, fill, edge, 1) + '<path d="M0 -1.5L0 ' + r1(-len * 0.85) + '" stroke="' + edge + '" stroke-width=".7" opacity=".6"/>');
    }
    function sparkle(x, y, r, c) {
        return '<path d="M' + x + ' ' + (y - r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'Z" fill="' + (c || '#fff') + '"/>';
    }
    function flower(x, y, s, petal, core) {
        var o = '';
        for (var k = 0; k < 5; k++) {
            var a = (k * 72) * Math.PI / 180;
            o += '<circle cx="' + r1(x + Math.sin(a) * 2.4 * s) + '" cy="' + r1(y - Math.cos(a) * 2.4 * s) + '" r="' + r1(1.9 * s) + '" fill="' + petal + '"/>';
        }
        return o + '<circle cx="' + x + '" cy="' + y + '" r="' + r1(1.1 * s) + '" fill="' + core + '"/>';
    }

    // ── 種子：三顆一組，後面一顆先畫 ──
    var TRIO = [[32, 25, -12], [21, 40, 18], [43, 40, -20]];
    function trio(fn) { return TRIO.map(function (p, i) { return fn(p[0], p[1], p[2], i); }).join(''); }

    var SEED = {
        stardew: function (K) {
            var f = K.rg('#b8fbf3', '#28a6a8');
            return trio(function (x, y, r) { return shape(BEAN, x, y, 12, r, f, '#16706f') + hl(x - 4, y - 4, 4, 2, r - 20); });
        },
        sunroot: function (K) {
            var f = K.rg('#f7b640', '#9a4608', 0.4, 0.3);
            return trio(function (x, y, r) { return shape(DROP, x, y, 13, r * 0.6, f, '#8c4a0c') + hl(x - 3, y - 2, 2.2, 4.5, r * 0.6 + 15); });
        },
        moonleaf: function (K) {
            var f = K.rg('#f1ecff', '#8b73d0');
            return trio(function (x, y, r) { return shape(BEAN, x, y, 12.5, r + 10, f, '#5b4596') + hl(x - 4, y - 3, 4, 1.8, r - 10, 0.7); });
        },
        emberpepper: function (K) {
            var f = K.rg('#4a3a34', '#120c0a');
            return trio(function (x, y, r) {
                return at(x, y, r * 0.6, 1, path('M0 -13C7 -6 10 0 10 4A10 10 0 0 1 -10 4C-10 0 -7 -6 0 -13Z', f, '#e24a1c', 1.6) +
                    '<path d="M0 -9L-2 -3L2 1L-1 7M-2 -3L-6 1M2 1L6 3" stroke="#ff8a3a" stroke-width="1.3" fill="none" stroke-linecap="round"/>');
            });
        },
        cloudberry: function (K) {
            var f = K.rg('#e8f6ff', '#4a9ae8');
            return trio(function (x, y) {
                return '<circle cx="' + x + '" cy="' + y + '" r="10.5" fill="' + f + '" stroke="#2d6fb3" stroke-width="1.2"/>' +
                    '<path d="M' + (x - 4) + ' ' + y + 'a4 4 0 1 1 4 4a2.2 2.2 0 1 1 -2 -2.4" stroke="#f58cbc" stroke-width="2" fill="none" stroke-linecap="round"/>' + hl(x - 4, y - 5, 3, 1.8, -25, 0.8);
            });
        },
        frostbell: function (K) {
            var f = K.lg('#e6f6ff', '#5aa6e6', 1, 1);
            return trio(function (x, y, r) {
                return at(x, y, r + 30, 1, path('M0 -12L7 -4L7 4L0 12L-7 4L-7 -4Z', f, '#2e6fae', 1.2) +
                    '<path d="M0 -12V12M-7 -4L0 0L7 -4" stroke="#fff" stroke-width="1" fill="none" opacity=".8"/>');
            });
        },
        nightstar: function (K) {
            var f = K.rg('#7c6ae6', '#1c1450');
            return trio(function (x, y, r) { return shape(CRESCENT, x, y, 12, r + 20, f, '#0e0a2e') + sparkle(x + 1, y - 2, 2.6) + sparkle(x - 3, y + 4, 1.6); });
        },
        honeycorn: function (K) {
            var f = K.rg('#ffcc3a', '#c06006', 0.4, 0.3);
            return trio(function (x, y, r) {
                return at(x, y, r * 0.5, 1, path('M-8 -8C-4 -12 4 -12 8 -8C10 -2 7 8 0 12C-7 8 -10 -2 -8 -8Z', f, '#a2600c', 1.2)) + hl(x - 3, y - 4, 2.4, 4, r * 0.5 + 10, 0.7);
            });
        },
        dawnberry: function (K) {
            var f = K.rg('#ffd6cc', '#ee5a4c');
            return trio(function (x, y, r) {
                return shape(HEART, x, y, 11.5, r * 0.5, f, '#b0342c') + '<circle cx="' + x + '" cy="' + (y - 1) + '" r="3.2" fill="' + K.rg('#e8fbff', '#3aa0e6') + '" stroke="#fff" stroke-width=".8"/>';
            });
        },
        silverwheat: function (K) {
            var f = K.lg('#f4f8ff', '#7f9cc8', 1, 1);
            return [[24, 32, -30], [33, 30, 2], [42, 34, 32]].map(function (p) {
                return at(p[0], p[1], p[2], 1, path('M0 -17C6.5 -10 7.5 4 0 17C-7.5 4 -6.5 -10 0 -17Z', f, '#4d6f98', 1.2) +
                    path('M0 10C2 12 1.6 14.6 0 16C-1.6 14.6 -2 12 0 10Z', '#4fb3a0') + '<path d="M0 -13V12" stroke="#fff" stroke-width=".8" opacity=".7"/>');
            }).join('');
        }
    };

    // ── 收成品：一束成品 ──
    var HARVEST = {
        stardew: function (K) {
            var f = K.lg('#8ff4ff', '#1a9fc2', 1, 0);
            var pods = [[20, 24, 30], [27, 22, 12], [35, 22, -6], [42, 25, -24]].map(function (p) {
                return at(p[0], p[1], p[2], 1, path('M-3 0C-4 10 -3 22 1 30C4 22 4.5 10 3 0Z', f, '#0f6e8a', 1.1) + hl(-1, 12, 1, 6, 0, 0.6));
            }).join('');
            return leaf(24, 26, 16, 6, -40, '#6ac24a', '#2f7a2a') + leaf(40, 24, 16, 6, 40, '#6ac24a', '#2f7a2a') + pods +
                flower(30, 20, 1.1, '#9fd4ff', '#fff') + flower(40, 16, 0.9, '#9fd4ff', '#fff');
        },
        sunroot: function (K) {
            var f = K.rg('#ffe08a', '#e0700c');
            var crown = [-54, -36, -18, 0, 18, 36, 54].map(function (a, i) { return leaf(32, 30, i % 2 ? 22 : 26, 4.6, a, i % 2 ? '#9cc43a' : '#d8c23a', '#4e6a1a'); }).join('');
            return crown + '<ellipse cx="32" cy="42" rx="17" ry="15" fill="' + f + '" stroke="#9a4a0c" stroke-width="1.3"/>' +
                '<path d="M20 38Q32 34 44 38M19 45Q32 42 45 45M24 52Q32 50 40 52" stroke="#b8600c" stroke-width="1" fill="none" opacity=".6"/>' +
                '<path d="M32 57L32 61" stroke="#9a4a0c" stroke-width="1.6" stroke-linecap="round"/>' + hl(25, 36, 5, 3, -20, 0.55);
        },
        moonleaf: function (K) {
            var rings = [[22, 12, '#2f5578'], [18, 9, '#4a79a8'], [13, 7, '#79a6cf'], [8, 7, '#b3cde6']];
            var o = '';
            rings.forEach(function (rg, j) {
                for (var k = 0; k < rg[1]; k++) o += leaf(32, 36, rg[0], rg[0] * 0.55, r1(k * 360 / rg[1] + j * 17), rg[2], '#1b3350');
            });
            return '<g transform="translate(0,4) scale(1,.9) translate(0,-3)">' + o + '</g><circle cx="32" cy="35" r="4" fill="#dfeafa" stroke="#1b3350"/>' +
                '<circle cx="24" cy="30" r="1.4" fill="#fff" opacity=".8"/><circle cx="40" cy="40" r="1.2" fill="#fff" opacity=".8"/>';
        },
        emberpepper: function (K) {
            var f = K.lg('#ff5a2a', '#c0140a', 1, 1);
            return [[22, 16, 18], [32, 14, 0], [42, 16, -18]].map(function (p) {
                return at(p[0], p[1], p[2], 1, path('M-4 2C-6 14 -4 30 2 40C5 32 7 16 4 2Z', f, '#5a0c06', 1.2) +
                    '<path d="M0 8L-1.5 16L1 22L-.5 30" stroke="#ffb05a" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
                    path('M-5 3C-3 -1 3 -1 5 3Z', '#4f9a2c', '#2a5a18', 0.9) + '<path d="M0 0Q1 -4 4 -6" stroke="#3f7a22" stroke-width="2" fill="none" stroke-linecap="round"/>');
            }).join('');
        },
        cloudberry: function (K) {
            var f = K.rg('#fbeaff', '#9a6ee6', 0.35, 0.3);
            var g = K.rg('#e6f4ff', '#5aa0f0', 0.35, 0.3);
            var berries = [[24, 30, g], [40, 30, f], [32, 42, g], [21, 44, f], [43, 44, g]].map(function (b) {
                return '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="9" fill="' + b[2] + '" stroke="#6a4aa8" stroke-width="1.1"/>' +
                    '<path d="M' + (b[0] - 4) + ' ' + b[1] + 'q4 -4 8 0" stroke="#fff" stroke-width="1.1" fill="none" opacity=".7"/>' + hl(b[0] - 3, b[1] - 4, 2.4, 1.4, -25, 0.8);
            }).join('');
            return leaf(24, 22, 14, 6, -50, '#6ac24a', '#2f7a2a') + leaf(40, 22, 14, 6, 50, '#6ac24a', '#2f7a2a') + berries;
        },
        frostbell: function (K) {
            var f = K.rg('#f2fbff', '#6ab4ec', 0.4, 0.35);
            return '<ellipse cx="32" cy="38" rx="22" ry="19" fill="' + f + '" stroke="#2e6fae" stroke-width="1.3"/>' +
                '<path d="M32 19V57M21 21C15 30 15 46 21 55M43 21C49 30 49 46 43 55" stroke="#4a8ac8" stroke-width="1.1" fill="none" opacity=".7"/>' +
                '<path d="M24 34l3 -2 2 3M37 30l3 2 -1 3M36 45l3 1 -2 3M25 46l2 2 -3 1" stroke="#fff" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
                '<path d="M32 20C31 14 34 10 38 11C41 12 40 16 37 15" stroke="#3f7a70" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
                leaf(26, 20, 12, 5, -60, '#6fa7a0', '#2c5552') + hl(24, 30, 5, 3, -30, 0.6);
        },
        nightstar: function (K) {
            var f = K.rg('#8a78f0', '#221660', 0.35, 0.25);
            return [[21, 18, 16], [32, 16, 0], [43, 18, -16]].map(function (p) {
                return at(p[0], p[1], p[2], 1, path('M0 0C7 2 9 14 8 24C7 34 -7 34 -8 24C-9 14 -7 2 0 0Z', f, '#120a3a', 1.2) +
                    sparkle(-2, 14, 2.2) + sparkle(3, 22, 1.5) + sparkle(-3, 26, 1.2) +
                    path('M-6 3L0 -3L6 3L0 6Z', '#4f9a4c', '#265a26', 0.9) + '<path d="M0 -2V-7" stroke="#3f7a3a" stroke-width="2" stroke-linecap="round"/>');
            }).join('');
        },
        honeycorn: function (K) {
            var f = K.lg('#ffd84a', '#e07a08', 1, 1);
            return [[25, 34, -16], [39, 34, 16]].map(function (p) {
                var rows = '';
                for (var k = -16; k <= 14; k += 3.4) rows += '<path d="M-6.4 ' + r1(k) + 'H6.4" stroke="#b86a08" stroke-width=".8" opacity=".55"/>';
                return at(p[0], p[1], p[2], 1, '<ellipse rx="7.5" ry="20" fill="' + f + '" stroke="#a2600c" stroke-width="1.2"/>' + rows +
                    '<path d="M0 -18V16" stroke="#c07a10" stroke-width=".8" opacity=".5"/>' + hl(-3, -6, 1.8, 7, 0, 0.6) +
                    path('M-7 20C-11 12 -10 4 -7 -2C-6 6 -4 12 0 21Z', '#8fc43f', '#45661f', 1) + path('M7 20C11 12 10 4 7 -2C6 6 4 12 0 21Z', '#6fa22f', '#45661f', 1));
            }).join('');
        },
        dawnberry: function (K) {
            var f = K.rg('#ff9a8a', '#d61e18', 0.35, 0.3);
            var berry = function (x, y, s, r) {
                return at(x, y, r, 1, path('M0 ' + r1(11 * s) + 'C' + r1(-11 * s) + ' ' + r1(3 * s) + ' ' + r1(-10 * s) + ' ' + r1(-7 * s) + ' ' + r1(-4.5 * s) + ' ' + r1(-7.5 * s) +
                    'C' + r1(-2 * s) + ' ' + r1(-8 * s) + ' 0 ' + r1(-6 * s) + ' 0 ' + r1(-4 * s) + 'C0 ' + r1(-6 * s) + ' ' + r1(2 * s) + ' ' + r1(-8 * s) + ' ' + r1(4.5 * s) + ' ' + r1(-7.5 * s) +
                    'C' + r1(10 * s) + ' ' + r1(-7 * s) + ' ' + r1(11 * s) + ' ' + r1(3 * s) + ' 0 ' + r1(11 * s) + 'Z', f, '#9c2a25', 1.1) +
                    '<circle cx="-3" cy="0" r=".8" fill="#ffe27a"/><circle cx="3" cy="2" r=".8" fill="#ffe27a"/><circle cx="0" cy="5" r=".8" fill="#ffe27a"/>' +
                    path('M-4 -7L0 -11L4 -7L0 -5Z', '#4f9a2c', '#2a5a18', 0.8) + hl(-4, -3, 2, 1.3, -30, 0.8));
            };
            return leaf(20, 24, 14, 6, -55, '#6ac24a', '#2f7a2a') + leaf(44, 24, 14, 6, 55, '#6ac24a', '#2f7a2a') +
                berry(22, 32, 1, -12) + berry(42, 32, 1, 12) + berry(32, 24, 0.95, 0) + berry(26, 46, 0.9, -6) + berry(39, 46, 0.9, 8);
        },
        silverwheat: function (K) {
            var f = K.lg('#ffffff', '#8fb0d6', 1, 1);
            var ears = [-22, -11, 0, 11, 22].map(function (a) {
                var g = '';
                for (var k = 0; k < 6; k++) g += '<ellipse cx="' + (k % 2 ? 2.4 : -2.4) + '" cy="' + (-26 - k * 4) + '" rx="3" ry="3.6" fill="' + f + '" stroke="#56789f" stroke-width=".8"/>';
                return at(32, 58, a, 1, '<path d="M0 0V-26" stroke="#4f9a7c" stroke-width="1.6"/>' + g + '<path d="M0 -48l-2 -6M0 -48l2 -6" stroke="#8fb0d6" stroke-width=".8"/>');
            }).join('');
            return ears + '<path d="M26 46Q32 49 38 46L38 50Q32 53 26 50Z" fill="#7fb8e6" stroke="#3f6f9f" stroke-width="1"/>' +
                '<path d="M30 50q-5 4 -8 3M34 50q5 4 8 3" stroke="#7fb8e6" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
        }
    };

    function svg(opts) {
        opts = opts || {};
        var table = opts.kind === 'harvest' ? HARVEST : SEED;
        var draw = table[opts.crop] || table.stardew;
        var K = kit();
        var body = draw(K);
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="fi-icon" role="img" aria-hidden="true">' +
            '<defs>' + K.defs.join('') + '</defs>' + body + '</svg>';
    }

    // 出貨箱：木頭箱子、蓋子往後掀開一點、正面一塊金色小牌（照星露谷那個 shipping bin）。
    // 斜上方往下看，正面在下、蓋子在上；腳底＝畫布底邊往上一點（影子那條）。
    // full：箱子裡有東西時，箱口露出一點點（金黃的一團）。
    function binSvg(full) {
        var ol = '#5b3a1c';
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 92" class="fi-bin" aria-hidden="true">' +
            '<defs><linearGradient id="fibinF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c48a4c"/><stop offset="1" stop-color="#9a6533"/></linearGradient>' +
            '<linearGradient id="fibinT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9a766"/><stop offset="1" stop-color="#b98146"/></linearGradient></defs>' +
            '<ellipse cx="50" cy="86" rx="40" ry="5" fill="rgba(40,50,25,.28)"/>' +
            // 箱身正面（三片木板）
            '<path d="M12 44H88V80Q88 84 84 84H16Q12 84 12 80Z" fill="url(#fibinF)" stroke="' + ol + '" stroke-width="2"/>' +
            '<path d="M12 56H88M12 68H88" stroke="#7d4f25" stroke-width="1.6" opacity=".7"/>' +
            '<path d="M14 47H86" stroke="#e0b37a" stroke-width="1.4" opacity=".7"/>' +
            // 箱口（往裡看，暗的）＋有東西時露出一團
            '<path d="M12 44L20 34H80L88 44Z" fill="#4a2f17" stroke="' + ol + '" stroke-width="2" stroke-linejoin="round"/>' +
            (full ? '<path d="M24 43Q30 34 40 38Q48 32 57 37Q66 33 74 40L78 43Z" fill="#e8c46a" stroke="#b98a3c" stroke-width="1.2"/><circle cx="46" cy="39" r="3.2" fill="#f6f1e6" stroke="#bfb4a2" stroke-width=".8"/><circle cx="62" cy="40" r="2.6" fill="#d9534f" stroke="#a33b37" stroke-width=".8"/>' : '') +
            // 蓋子：往後掀開，斜斜靠在箱口後緣
            '<path d="M20 34L26 12H74L80 34Z" fill="url(#fibinT)" stroke="' + ol + '" stroke-width="2" stroke-linejoin="round"/>' +
            '<path d="M23 23H77" stroke="#8a5a2b" stroke-width="1.4" opacity=".6"/>' +
            // 四角的鐵片
            '<path d="M12 44V52M88 44V52M12 76V84M88 76V84" stroke="#6f7680" stroke-width="3.2" stroke-linecap="round"/>' +
            // 正面金色小牌
            '<rect x="40" y="58" width="20" height="12" rx="2.5" fill="#f3c969" stroke="#a8741e" stroke-width="1.4"/>' +
            '<path d="M45 64H55M50 61V67" stroke="#a8741e" stroke-width="1.6" stroke-linecap="round"/>' +
            '</svg>';
    }

    // 收購商諾瓦：暖金色的四角星星，戴大草帽、繫奶油色圍裙（口袋插紅筆）、左手拿收貨單。
    // 09-29 她從三個小樣挑了「圍裙店主」、取名諾瓦。故意不用那個藍紫漸層的 AI 星星：畫面不掛別人的招牌。
    // 🚨 圍裙要從嘴巴下面開始（第一版蓋到嘴巴）。
    var buyerUid = 0;
    function novaStar(cx, cy, R, k) {
        var a = R * k, t = R * .16;   // k：邊往內凹多少（越大越胖）；t：角尖磨圓的寬度
        return 'M' + (cx - t) + ' ' + (cy - R + t * .6) + 'Q' + cx + ' ' + (cy - R - t * .4) + ' ' + (cx + t) + ' ' + (cy - R + t * .6) +
            'Q' + (cx + a) + ' ' + (cy - a) + ' ' + (cx + R - t * .6) + ' ' + (cy - t) +
            'Q' + (cx + R + t * .4) + ' ' + cy + ' ' + (cx + R - t * .6) + ' ' + (cy + t) +
            'Q' + (cx + a) + ' ' + (cy + a) + ' ' + (cx + t) + ' ' + (cy + R - t * .6) +
            'Q' + cx + ' ' + (cy + R + t * .4) + ' ' + (cx - t) + ' ' + (cy + R - t * .6) +
            'Q' + (cx - a) + ' ' + (cy + a) + ' ' + (cx - R + t * .6) + ' ' + (cy + t) +
            'Q' + (cx - R - t * .4) + ' ' + cy + ' ' + (cx - R + t * .6) + ' ' + (cy - t) +
            'Q' + (cx - a) + ' ' + (cy - a) + ' ' + (cx - t) + ' ' + (cy - R + t * .6) + 'Z';
    }
    function buyerSvg() {
        var id = 'fibuy' + (++buyerUid);
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="fi-buyer" aria-hidden="true">' +
            '<defs><radialGradient id="' + id + '" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#fff3c8"/><stop offset=".55" stop-color="#ffd978"/><stop offset="1" stop-color="#eaa43e"/></radialGradient></defs>' +
            '<ellipse cx="50" cy="96" rx="22" ry="3.5" fill="rgba(60,40,20,.2)"/>' +
            '<path d="' + novaStar(50, 56, 38, .36) + '" fill="url(#' + id + ')" stroke="#b9782a" stroke-width="2.2" stroke-linejoin="round"/>' +
            '<path d="M38 40q5 -7 12 -8" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".8"/>' +
            // 臉
            '<ellipse cx="43" cy="56" rx="2.8" ry="3.8" fill="#3a2a1c"/><ellipse cx="57" cy="56" rx="2.8" ry="3.8" fill="#3a2a1c"/>' +
            '<circle cx="44" cy="54.6" r="1" fill="#fff"/><circle cx="58" cy="54.6" r="1" fill="#fff"/>' +
            '<ellipse cx="37.5" cy="62" rx="3.4" ry="2" fill="#f29a7a" opacity=".55"/><ellipse cx="62.5" cy="62" rx="3.4" ry="2" fill="#f29a7a" opacity=".55"/>' +
            '<path d="M46.5 62q3.5 3 7 0" stroke="#3a2a1c" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
            // 圍裙＋口袋裡的紅筆
            '<path d="M40 70Q50 67 60 70L58.5 87Q50 91 41.5 87Z" fill="#fff6e0" stroke="#c9a46a" stroke-width="1.6" stroke-linejoin="round"/>' +
            '<path d="M40 70Q37 66 36 63M60 70Q63 66 64 63" stroke="#c9a46a" stroke-width="1.2" fill="none"/>' +
            '<rect x="45.5" y="76" width="9" height="6.5" rx="1.5" fill="none" stroke="#c9a46a" stroke-width="1.2"/>' +
            '<path d="M52.5 72.5l1.2 4.5" stroke="#d9534f" stroke-width="1.6" stroke-linecap="round"/>' +
            // 大草帽
            '<ellipse cx="50" cy="22" rx="22" ry="5.5" fill="#e9c77a" stroke="#a8803a" stroke-width="1.8"/>' +
            '<path d="M39 21Q40 9 50 9Q60 9 61 21Z" fill="#f0d488" stroke="#a8803a" stroke-width="1.8" stroke-linejoin="round"/>' +
            '<path d="M39.5 18Q50 21 60.5 18" stroke="#d9534f" stroke-width="2.6" fill="none"/>' +
            // 收貨單：左邊那個角拿著
            '<g transform="rotate(-12 14 64)"><rect x="4" y="54" width="17" height="22" rx="2" fill="#fffdf6" stroke="#8a6a3a" stroke-width="1.5"/>' +
            '<rect x="8.5" y="51.5" width="8" height="4" rx="1" fill="#b08a3c"/>' +
            '<path d="M7.5 61h10M7.5 65h10M7.5 69h7" stroke="#b9a58a" stroke-width="1.2" stroke-linecap="round"/></g>' +
            '</svg>';
    }

    root.FarmItemDraw = { svg: svg, binSvg: binSvg, buyerSvg: buyerSvg };
})(typeof window !== 'undefined' ? window : this);
