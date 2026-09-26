// ----------------------------------------------------------------
// [檔案] world_painter.js
// 路徑：os_phone/map/world_painter.js
// 職責：世界地圖由程式畫，一張圖都不生。
//   模型只列一份清單（FORM_PROMPT → <world-plan>：世界名＋風格、每區的地形與位置、每區有哪些地點），
//   paintWorld(plan) 畫成 SVG：地圖風（奇幻/歷史/武俠/和風/廢土）是海包著陸塊，城市風（現代/科幻）是整片街廓。
//   區座標跟 map_core 一樣是容器的百分比（clamp 在 6-94 / 8-92），圖釘直接對得上。
//   buildWorldData(plan) 轉成 WORLD_RUNTIME.setWorld 吃的格式；進區底圖＝同一張放大到那一區（cropTo）。
//   首頁大地圖在 map_core 照容器實際比例現畫（homeUrl），不然 cover 一裁圖釘就歪。
//   給沒接生圖、或不想等生圖的人：「生成此世界地圖」旁邊那顆「直接畫地圖」。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    console.log('[PhoneOS] 載入世界地圖畫家...');

    function hashStr(s) { var h = 2166136261; s = String(s || ''); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    function rngOf(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function r1(n) { return Math.round(n * 10) / 10; }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    // ============================================================
    // 一、風格與地形
    // ============================================================
    var STYLES = {
        fantasy:    { zh: '奇幻', sea: true,  seaC: '#9dbdb5', shallow: '#bfd5cb', land: '#e9d8ad', land2: '#dcc592', ink: '#4a3521', tree: '#7d9352', tree2: '#5d7439', mtn: '#c7ab79', mtnShade: '#a68b5c', road: '#6b4a2a', river: '#86aeb2', roof: '#a4553a', grain: 0.22, font: 'Georgia,&quot;Songti TC&quot;,serif' },
        historical: { zh: '歷史', sea: true,  seaC: '#b8b196', shallow: '#cdc6a8', land: '#e6d6b0', land2: '#d8c49a', ink: '#4b3a26', tree: '#8c8a5c', tree2: '#6c6a42', mtn: '#c9b489', mtnShade: '#a8936a', road: '#5e4428', river: '#9fa58d', roof: '#8a5a3a', grain: 0.28, font: 'Georgia,&quot;Songti TC&quot;,serif' },
        wuxia:      { zh: '武俠', sea: true,  seaC: '#dfe2da', shallow: '#e8e9e1', land: '#f2ecdc', land2: '#e7dfc9', ink: '#2e2c29', tree: '#6f7d6a', tree2: '#4b5749', mtn: '#8d8c86', mtnShade: '#55544f', road: '#7a6a55', river: '#b7c4c1', roof: '#3b3a38', grain: 0.12, font: '&quot;Kaiti TC&quot;,&quot;STKaiti&quot;,&quot;KaiTi&quot;,serif', ink2: true, seal: '#b3302a' },
        japanese:   { zh: '和風', sea: true,  seaC: '#c9d9dc', shallow: '#dbe6e4', land: '#f1ead9', land2: '#e6dcc4', ink: '#33302c', tree: '#7f9474', tree2: '#5b6f52', mtn: '#9a9a93', mtnShade: '#63635d', road: '#7d6b52', river: '#a9c1c6', roof: '#8e3b32', grain: 0.12, font: '&quot;Yu Mincho&quot;,&quot;Hiragino Mincho ProN&quot;,serif', ink2: true, seal: '#c0392b' },
        modern:     { zh: '現代', sea: false, seaC: '#0e1624', shallow: '#12203a', land: '#1a2231', land2: '#1f2939', ink: '#2e3b52', tree: '#1f3a2e', tree2: '#2a4a3a', mtn: '#26303f', mtnShade: '#2f3a4b', road: '#d4af37', street: '#2d3a50', river: '#16304e', roof: '#28344a', grain: 0, font: '&quot;Segoe UI&quot;,&quot;Microsoft JhengHei&quot;,sans-serif', city: true },
        scifi:      { zh: '科幻', sea: false, seaC: '#050812', shallow: '#0a1224', land: '#0a101c', land2: '#0e1626', ink: '#123049', tree: '#0f3a3a', tree2: '#12524e', mtn: '#101c2c', mtnShade: '#16263a', road: '#3fe0ff', street: '#12314a', river: '#0b2440', roof: '#132238', grain: 0, font: '&quot;Segoe UI&quot;,&quot;Microsoft JhengHei&quot;,sans-serif', city: true, neon: '#ff4fd8' },
        wasteland:  { zh: '廢土', sea: true,  seaC: '#6f6857', shallow: '#857c66', land: '#c7a36a', land2: '#b48e56', ink: '#44301f', tree: '#7d7447', tree2: '#5c5533', mtn: '#a57f4d', mtnShade: '#81603a', road: '#5b3e24', river: '#7a7560', roof: '#6e4a30', grain: 0.35, font: '&quot;Impact&quot;,&quot;Microsoft JhengHei&quot;,sans-serif' }
    };
    var TERRAINS = { city: '城市', palace: '宮城', harbor: '港口', forest: '森林', mountain: '山地', desert: '沙漠', snow: '雪原', swamp: '沼澤', farmland: '田野', ruins: '廢墟', lake: '湖泊', island: '島嶼', plain: '平原' };
    var TERRAIN_WORDS = [
        [/harbor|harbour|port|dock|pier|港|碼頭|埠|灣|海岸|海濱/i, 'harbor'], [/island|isle|島/i, 'island'], [/palace|castle|imperial|throne|宮|皇城|王城|城堡|殿/i, 'palace'],
        [/mountain|peak|cliff|summit|山|峰|嶺|崖/i, 'mountain'], [/snow|ice|frost|glacier|雪|冰|霜/i, 'snow'], [/forest|wood|grove|jungle|林|森|竹/i, 'forest'],
        [/desert|dune|sand|沙漠|荒漠|沙/i, 'desert'], [/swamp|marsh|bog|沼|澤/i, 'swamp'], [/farm|field|village|rural|田|農|村|莊|鄉/i, 'farmland'],
        [/ruin|wasteland|abandon|廢墟|遺跡|廢/i, 'ruins'], [/lake|river|湖|河|江|潭/i, 'lake'], [/city|town|market|street|district|quarter|城|市|街|區|鎮|坊/i, 'city']
    ];
    function guessTerrain(text) { for (var i = 0; i < TERRAIN_WORDS.length; i++) if (TERRAIN_WORDS[i][0].test(text)) return TERRAIN_WORDS[i][1]; return 'plain'; }
    function guessStyle(text, genre) {
        var s = String(text || '');
        if (/cyber|sci-?fi|futur|neon|space|賽博|科幻|星際|未來/i.test(s)) return 'scifi';
        if (/wuxia|xianxia|ancient chinese|武俠|仙俠|修仙|江湖|古代中國/i.test(s)) return 'wuxia';
        if (/japan|edo|和風|江戶|日式/i.test(s)) return 'japanese';
        if (/post-apocalyptic|wasteland|末日|廢土|末世/i.test(s)) return 'wasteland';
        if (/modern|contemporary|現代|都市|urban/i.test(s)) return 'modern';
        if (genre === 'historical') return 'historical';
        return 'fantasy';
    }

    // ============================================================
    // 二、畫家：plan → SVG
    //   plan = { name, style, zones:[{ key, name, terrain, x, y (0-100), places:[名字] }] }
    //   畫布寬 1000，高照容器比例；區域座標跟 map_core 一樣是容器的百分比，圖釘直接對得上。
    // ============================================================
    function smoothPath(pts) {   // 封閉 Catmull-Rom → 三次貝茲
        var n = pts.length, d = 'M' + r1(pts[0][0]) + ' ' + r1(pts[0][1]);
        for (var i = 0; i < n; i++) {
            var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
            d += 'C' + r1(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + r1(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + r1(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + r1(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + r1(p2[0]) + ' ' + r1(p2[1]);
        }
        return d + 'Z';
    }
    function makeBlob(cx, cy, R, rng, wob) {
        var co = [];
        for (var k = 2; k <= 7; k++) co.push([k, (wob || 0.2) / (k * 0.55) * (0.5 + rng()), rng() * 6.283]);
        function rad(th) { var v = 1; co.forEach(function (c) { v += c[1] * Math.sin(c[0] * th + c[2]); }); return R * v; }
        var pts = [];
        for (var i = 0; i < 48; i++) { var th = i / 48 * 6.283; var rr = rad(th); pts.push([cx + Math.cos(th) * rr, cy + Math.sin(th) * rr]); }
        return { cx: cx, cy: cy, R: R, rad: rad, d: smoothPath(pts), grow: function (g) { return smoothPath(pts.map(function (p) { var dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * g, p[1] + dy / l * g]; })); } };
    }
    function inBlob(b, x, y, pad) { var dx = x - b.cx, dy = y - b.cy; return Math.hypot(dx, dy) < b.rad(Math.atan2(dy, dx)) - (pad || 0); }
    function mst(pts) {   // Prim：區與區之間的道路
        var n = pts.length, inT = [0], edges = [];
        while (inT.length < n) {
            var best = null;
            inT.forEach(function (a) { for (var b = 0; b < n; b++) { if (inT.indexOf(b) >= 0) continue; var d = Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y); if (!best || d < best[2]) best = [a, b, d]; } });
            inT.push(best[1]); edges.push(best);
        }
        return edges;
    }

    // ---------- 地形小圖（筆觸） ----------
    function mountain(x, y, s, S, snow) {
        if (S.ink2) {   // 水墨：幾層淡墨山頭
            return '<path d="M' + r1(x - s * 1.3) + ' ' + r1(y) + 'Q' + r1(x - s * 0.4) + ' ' + r1(y - s * 1.6) + ' ' + r1(x) + ' ' + r1(y - s * 1.5) + 'Q' + r1(x + s * 0.5) + ' ' + r1(y - s * 1.4) + ' ' + r1(x + s * 1.3) + ' ' + r1(y) + 'Z" fill="url(#inkwash)" opacity="0.8"/>'
                + '<path d="M' + r1(x - s * 1.1) + ' ' + r1(y - s * 0.1) + 'Q' + r1(x - s * 0.4) + ' ' + r1(y - s * 1.5) + ' ' + r1(x) + ' ' + r1(y - s * 1.5) + '" fill="none" stroke="' + S.ink + '" stroke-width="1.6" opacity="0.7" stroke-linecap="round"/>';
        }
        var top = y - s * 1.35;
        var sh = '<path d="M' + r1(x - s) + ' ' + r1(y) + 'L' + r1(x) + ' ' + r1(top) + 'L' + r1(x + s) + ' ' + r1(y) + 'Z" fill="' + (snow ? '#eef2f3' : S.mtn) + '"/>'
            + '<path d="M' + r1(x) + ' ' + r1(top) + 'L' + r1(x + s) + ' ' + r1(y) + 'L' + r1(x + s * 0.15) + ' ' + r1(y) + 'L' + r1(x + s * 0.25) + ' ' + r1(y - s * 0.6) + 'Z" fill="' + (snow ? '#c8d3d8' : S.mtnShade) + '"/>';
        if (!snow && !S.city) sh += '<path d="M' + r1(x - s * 0.28) + ' ' + r1(top + s * 0.38) + 'L' + r1(x) + ' ' + r1(top) + 'L' + r1(x + s * 0.28) + ' ' + r1(top + s * 0.38) + 'L' + r1(x + s * 0.1) + ' ' + r1(top + s * 0.3) + 'L' + r1(x - s * 0.08) + ' ' + r1(top + s * 0.42) + 'Z" fill="#f4efe2" opacity="0.8"/>';
        return sh + '<path d="M' + r1(x - s) + ' ' + r1(y) + 'L' + r1(x) + ' ' + r1(top) + 'L' + r1(x + s) + ' ' + r1(y) + '" fill="none" stroke="' + S.ink + '" stroke-width="1.5" stroke-linejoin="round"/>';
    }
    function tree(x, y, s, S, rng) {
        if (S.ink2) return '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + r1(s * 0.75) + '" fill="' + S.tree2 + '" opacity="' + r1(0.35 + rng() * 0.35) + '"/>';
        return '<path d="M' + r1(x) + ' ' + r1(y + s * 0.9) + 'V' + r1(y + s * 0.3) + '" stroke="' + S.ink + '" stroke-width="1.2"/>'
            + '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + r1(s * 0.7) + '" fill="' + (rng() < 0.5 ? S.tree : S.tree2) + '" stroke="' + S.ink + '" stroke-width="1"/>';
    }
    function house(x, y, s, S, rng) {
        var w = s * (0.8 + rng() * 0.6), h = s * 0.7;
        if (S.ink2) return '<path d="M' + r1(x - w * 0.7) + ' ' + r1(y - h * 0.2) + 'Q' + r1(x) + ' ' + r1(y - h * 1.1) + ' ' + r1(x + w * 0.7) + ' ' + r1(y - h * 0.2) + '" fill="' + S.roof + '" stroke="' + S.ink + '" stroke-width="1"/><rect x="' + r1(x - w / 2) + '" y="' + r1(y - h * 0.2) + '" width="' + r1(w) + '" height="' + r1(h * 0.7) + '" fill="#f7f2e6" stroke="' + S.ink + '" stroke-width="0.8"/>';
        return '<rect x="' + r1(x - w / 2) + '" y="' + r1(y - h / 2) + '" width="' + r1(w) + '" height="' + r1(h) + '" fill="' + S.roof + '" stroke="' + S.ink + '" stroke-width="1"/><path d="M' + r1(x - w / 2) + ' ' + r1(y) + 'H' + r1(x + w / 2) + '" stroke="' + S.ink + '" stroke-width="0.6" opacity="0.6"/>';
    }
    function castle(x, y, s, S) {
        var p = '<rect x="' + r1(x - s) + '" y="' + r1(y - s * 0.6) + '" width="' + r1(s * 2) + '" height="' + r1(s * 1.1) + '" fill="' + S.land2 + '" stroke="' + S.ink + '" stroke-width="1.5"/>';
        [-1, 1].forEach(function (k) { p += '<rect x="' + r1(x + k * s - s * 0.3) + '" y="' + r1(y - s * 1.1) + '" width="' + r1(s * 0.6) + '" height="' + r1(s * 1.6) + '" fill="' + S.land2 + '" stroke="' + S.ink + '" stroke-width="1.5"/><path d="M' + r1(x + k * s - s * 0.38) + ' ' + r1(y - s * 1.1) + 'L' + r1(x + k * s) + ' ' + r1(y - s * 1.6) + 'L' + r1(x + k * s + s * 0.38) + ' ' + r1(y - s * 1.1) + 'Z" fill="' + S.roof + '" stroke="' + S.ink + '" stroke-width="1.2"/>'; });
        return p + '<path d="M' + r1(x - s * 0.25) + ' ' + r1(y + s * 0.5) + 'V' + r1(y) + 'Q' + r1(x) + ' ' + r1(y - s * 0.35) + ' ' + r1(x + s * 0.25) + ' ' + r1(y) + 'V' + r1(y + s * 0.5) + '" fill="' + S.ink + '" opacity="0.7"/>';
    }
    function dune(x, y, s, S) { return '<path d="M' + r1(x - s) + ' ' + r1(y) + 'Q' + r1(x) + ' ' + r1(y - s * 0.55) + ' ' + r1(x + s) + ' ' + r1(y) + '" fill="none" stroke="' + S.ink + '" stroke-width="1.1" opacity="0.55"/>'; }
    function reed(x, y, s, S) { return '<path d="M' + r1(x) + ' ' + r1(y) + 'l-2 -' + r1(s) + 'M' + r1(x) + ' ' + r1(y) + 'l0.5 -' + r1(s * 1.2) + 'M' + r1(x) + ' ' + r1(y) + 'l2.4 -' + r1(s * 0.9) + '" stroke="' + S.tree2 + '" stroke-width="1.1"/><ellipse cx="' + r1(x + s) + '" cy="' + r1(y + 2) + '" rx="' + r1(s * 0.8) + '" ry="' + r1(s * 0.3) + '" fill="' + S.river + '" opacity="0.7"/>'; }
    function field(x, y, s, S, rng) {
        var a = Math.floor(rng() * 40 - 20), w = s * 2, h = s * 1.3, lines = '';
        for (var i = 1; i < 5; i++) lines += '<path d="M' + r1(-w / 2) + ' ' + r1(-h / 2 + i * h / 5) + 'H' + r1(w / 2) + '"/>';
        return '<g transform="translate(' + r1(x) + ' ' + r1(y) + ') rotate(' + a + ')"><rect x="' + r1(-w / 2) + '" y="' + r1(-h / 2) + '" width="' + r1(w) + '" height="' + r1(h) + '" fill="' + (rng() < 0.5 ? '#d9cf8f' : '#c6c98a') + '" stroke="' + S.ink + '" stroke-width="0.8" opacity="0.9"/><g stroke="' + S.ink + '" stroke-width="0.4" opacity="0.5">' + lines + '</g></g>';
    }
    function ruin(x, y, s, S, rng) { var a = rng() * 90; return '<g transform="translate(' + r1(x) + ' ' + r1(y) + ') rotate(' + r1(a) + ')"><path d="M' + r1(-s) + ' ' + r1(-s * 0.4) + 'H' + r1(s * 0.3) + 'M' + r1(s * 0.6) + ' ' + r1(-s * 0.4) + 'H' + r1(s) + 'V' + r1(s * 0.2) + 'M' + r1(-s) + ' ' + r1(-s * 0.4) + 'V' + r1(s * 0.5) + 'H' + r1(-s * 0.2) + '" fill="none" stroke="' + S.ink + '" stroke-width="1.6" opacity="0.75"/></g>'; }
    function boat(x, y, s, S) { return '<path d="M' + r1(x - s) + ' ' + r1(y) + 'Q' + r1(x) + ' ' + r1(y + s * 0.6) + ' ' + r1(x + s) + ' ' + r1(y) + 'Z" fill="' + S.roof + '" stroke="' + S.ink + '" stroke-width="1"/><path d="M' + r1(x) + ' ' + r1(y) + 'V' + r1(y - s * 1.3) + 'L' + r1(x + s * 0.7) + ' ' + r1(y - s * 0.3) + 'Z" fill="#f7f1e2" stroke="' + S.ink + '" stroke-width="0.8"/>'; }
    function wave(x, y, s, S) { return '<path d="M' + r1(x - s) + ' ' + r1(y) + 'q' + r1(s / 2) + ' -' + r1(s * 0.45) + ' ' + r1(s) + ' 0t' + r1(s) + ' 0" fill="none" stroke="' + S.ink + '" stroke-width="0.9" opacity="0.35"/>'; }

    // ---------- 城市風（現代／科幻）：街廓 ----------
    function cityBlock(z, S, rng, dens) {
        var ang = Math.floor(rng() * 50 - 25), step = dens > 1 ? 16 : 26, R = z.R * 0.95, out = '', bld = '';
        for (var gx = -R; gx <= R; gx += step) out += '<path d="M' + r1(gx) + ' ' + r1(-R) + 'V' + r1(R) + '"/>';
        for (var gy = -R; gy <= R; gy += step) out += '<path d="M' + r1(-R) + ' ' + r1(gy) + 'H' + r1(R) + '"/>';
        for (var bx = -R; bx < R; bx += step) for (var by = -R; by < R; by += step) {
            if (rng() > (dens > 1 ? 0.8 : 0.45)) continue;
            var m = 3 + rng() * 2;
            bld += '<rect x="' + r1(bx + m) + '" y="' + r1(by + m) + '" width="' + r1(step - m * 2) + '" height="' + r1(step - m * 2) + '" rx="1"/>';
        }
        return '<g clip-path="url(#zc' + z.i + ')"><g transform="translate(' + r1(z.x) + ' ' + r1(z.y) + ') rotate(' + ang + ')">'
            + '<g fill="' + S.roof + '" opacity="0.9">' + bld + '</g><g stroke="' + S.street + '" stroke-width="' + (dens > 1 ? 1.4 : 1) + '">' + out + '</g></g></g>';
    }

    function paintWorld(plan, opt) {
        var S = STYLES[plan.style] || STYLES.fantasy;
        var VW = 1000, VH = Math.round(1000 * (opt.h || 600) / (opt.w || 1000));
        var rng = rngOf(hashStr((plan.name || '') + '|' + plan.style + '|' + (opt.seed || 0)));
        var zs = (plan.zones || []).map(function (z, i) {
            return { i: i, key: z.key, name: z.name, terrain: TERRAINS[z.terrain] ? z.terrain : 'plain', px: clamp(z.x, 6, 94), py: clamp(z.y, 8, 92), x: clamp(z.x, 6, 94) / 100 * VW, y: clamp(z.y, 8, 92) / 100 * VH, places: z.places || [] };
        });
        if (!zs.length) return { svg: '', zones: [], vw: VW, vh: VH };
        var minWH = Math.min(VW, VH);
        zs.forEach(function (z) {
            var nn = zs.reduce(function (m, o) { return o === z ? m : Math.min(m, Math.hypot(o.x - z.x, o.y - z.y)); }, Infinity);
            if (!isFinite(nn)) nn = minWH * 0.6;
            z.R = clamp(nn * 0.62, minWH * 0.12, minWH * 0.3);
            var dEdge = [z.x, VW - z.x, z.y, VH - z.y], k = dEdge.indexOf(Math.min.apply(null, dEdge));
            z.edge = [[-1, 0], [1, 0], [0, -1], [0, 1]][k];   // 最近的那一邊（港口朝那裡開海）
        });

        // --- 陸塊：每區一塊＋道路沿線的橋塊（島嶼不接），奇幻系再撒幾座小島 ---
        var blobs = [];
        zs.forEach(function (z) {
            var cx = z.x, cy = z.y;
            if (z.terrain === 'harbor') { cx -= z.edge[0] * z.R * 0.45; cy -= z.edge[1] * z.R * 0.45; }
            z.blob = makeBlob(cx, cy, z.terrain === 'island' ? z.R * 0.75 : z.R, rng, 0.2);
            blobs.push(z.blob);
        });
        var edges = mst(zs);
        edges.forEach(function (e) {
            var A = zs[e[0]], B = zs[e[1]];
            if (A.terrain === 'island' || B.terrain === 'island') return;
            [0.33, 0.66].forEach(function (t) { blobs.push(makeBlob(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, Math.min(A.R, B.R) * 0.7, rng, 0.25)); });
        });
        if (S.sea) for (var k = 0; k < 7; k++) {
            var ix = rng() * VW, iy = rng() * VH;
            if (blobs.some(function (b) { return Math.hypot(b.cx - ix, b.cy - iy) < b.R + 60; })) continue;
            blobs.push(makeBlob(ix, iy, 14 + rng() * 26, rng, 0.3));
        }
        function onLand(x, y, pad) { return blobs.some(function (b) { return inBlob(b, x, y, pad); }); }
        var markerFree = function (x, y, r) { return !zs.some(function (z) { return Math.hypot(z.x - x, z.y - y) < (r || 48); }); };

        var defs = '';
        defs += '<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="' + Math.floor(rng() * 99) + '"/><feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.15  0 0 0 0 0.1  0 0 0 0.6 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>';
        defs += '<filter id="blur2"><feGaussianBlur stdDeviation="2"/></filter><filter id="glowf" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>';
        defs += '<linearGradient id="inkwash" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + S.mtnShade + '" stop-opacity="0.85"/><stop offset="100%" stop-color="' + S.mtn + '" stop-opacity="0.08"/></linearGradient>';
        defs += '<radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="' + (S.city ? 0.55 : 0.3) + '"/></radialGradient>';
        zs.forEach(function (z) { defs += '<clipPath id="zc' + z.i + '"><path d="' + z.blob.d + '"/></clipPath>'; });
        var landUnion = blobs.map(function (b) { return '<path d="' + b.d + '"/>'; }).join('');
        defs += '<clipPath id="landclip">' + landUnion + '</clipPath>';
        if (plan.style === 'scifi') defs += '<pattern id="hex" width="24" height="41.6" patternUnits="userSpaceOnUse"><path d="M12 0L24 6.9V20.8L12 27.7L0 20.8V6.9Z M12 27.7V41.6" fill="none" stroke="#1d5f7a" stroke-width="0.6" opacity="0.5"/></pattern>';

        var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VW + ' ' + VH + '" preserveAspectRatio="xMidYMid slice"><defs>' + defs + '</defs>';

        if (S.city) {
            // ===== 城市風：整片是陸地，港口／湖才有水 =====
            s += '<rect width="' + VW + '" height="' + VH + '" fill="' + S.land + '"/>';
            if (plan.style === 'scifi') s += '<rect width="' + VW + '" height="' + VH + '" fill="url(#hex)"/>';
            zs.forEach(function (z) {   // 水：港口往最近那一邊開一片海，湖在區裡
                if (z.terrain === 'harbor' || z.terrain === 'island') {
                    var sx = z.x + z.edge[0] * z.R * 1.1, sy = z.y + z.edge[1] * z.R * 1.1;
                    s += '<path d="' + makeBlob(sx, sy, z.R * 1.1, rng, 0.15).d + '" fill="' + S.seaC + '" stroke="' + S.ink + '" stroke-width="2"/>';
                } else if (z.terrain === 'lake') s += '<path d="' + makeBlob(z.x + z.R * 0.35, z.y + z.R * 0.25, z.R * 0.45, rng, 0.2).d + '" fill="' + S.seaC + '" stroke="' + S.ink + '" stroke-width="1.5"/>';
            });
            // 一條河斜穿全圖
            var ry0 = VH * (0.2 + rng() * 0.6), rp = 'M-20 ' + r1(ry0);
            for (var rx = 0; rx <= VW + 40; rx += 80) rp += ' Q' + r1(rx + 40) + ' ' + r1(ry0 + (rng() - 0.5) * 120) + ' ' + r1(rx + 80) + ' ' + r1(ry0 += (rng() - 0.5) * 60);
            s += '<path d="' + rp + '" fill="none" stroke="' + S.river + '" stroke-width="16" stroke-linecap="round"/>';
            zs.forEach(function (z) {
                var dens = (z.terrain === 'city' || z.terrain === 'palace') ? 2 : 1;   // 城市風裡的田野、港口、廢墟＝低密度街廓
                s += '<path d="' + z.blob.d + '" fill="' + S.land2 + '" opacity="0.8"/>';
                if (z.terrain === 'forest' || z.terrain === 'plain') {
                    s += '<g clip-path="url(#zc' + z.i + ')"><path d="' + makeBlob(z.x, z.y, z.R * 0.8, rng, 0.25).d + '" fill="' + S.tree + '"/>';
                    for (var t = 0; t < 30; t++) { var a = rng() * 6.28, d = rng() * z.R * 0.75; s += '<circle cx="' + r1(z.x + Math.cos(a) * d) + '" cy="' + r1(z.y + Math.sin(a) * d) + '" r="' + r1(2 + rng() * 3) + '" fill="' + S.tree2 + '"/>'; }
                    s += '</g>';
                } else if (z.terrain === 'mountain' || z.terrain === 'snow' || z.terrain === 'desert') {
                    for (var c = 1; c < 6; c++) s += '<path d="' + makeBlob(z.x, z.y, z.R * c / 6, rng, 0.18).d + '" fill="none" stroke="' + S.street + '" stroke-width="1"/>';
                } else s += cityBlock(z, S, rng, dens);
                s += '<path d="' + z.blob.d + '" fill="none" stroke="' + S.road + '" stroke-width="1" opacity="0.28" stroke-dasharray="4 5"/>';
            });
            edges.forEach(function (e) {   // 幹道
                var A = zs[e[0]], B = zs[e[1]], mx = (A.x + B.x) / 2 + (rng() - 0.5) * 60, my = (A.y + B.y) / 2 + (rng() - 0.5) * 60;
                var d = 'M' + r1(A.x) + ' ' + r1(A.y) + 'Q' + r1(mx) + ' ' + r1(my) + ' ' + r1(B.x) + ' ' + r1(B.y);
                s += '<path d="' + d + '" fill="none" stroke="' + S.road + '" stroke-width="7" opacity="0.18" filter="url(#glowf)"/><path d="' + d + '" fill="none" stroke="' + S.road + '" stroke-width="2.2" opacity="0.85"/>';
                if (S.neon) s += '<path d="' + d + '" fill="none" stroke="' + S.neon + '" stroke-width="0.8" stroke-dasharray="2 10" opacity="0.9"/>';
            });
        } else {
            // ===== 地圖風：海包著陸地 =====
            s += '<rect width="' + VW + '" height="' + VH + '" fill="' + S.seaC + '"/>';
            for (var wv = 0; wv < 60; wv++) { var wx = rng() * VW, wy = rng() * VH; if (!onLand(wx, wy, -24)) s += wave(wx, wy, 6 + rng() * 5, S); }
            s += blobs.map(function (b) { return '<path d="' + b.grow(16) + '" fill="' + S.shallow + '"/>'; }).join('');
            s += blobs.map(function (b) { return '<path d="' + b.grow(7) + '" fill="none" stroke="' + S.ink + '" stroke-width="0.8" opacity="0.4"/>'; }).join('');
            s += blobs.map(function (b) { return '<path d="' + b.d + '" fill="' + S.land + '" stroke="' + S.ink + '" stroke-width="' + (S.ink2 ? 2.4 : 3) + '"/>'; }).join('');
            s += '<g clip-path="url(#landclip)">' + blobs.map(function (b) { return '<path d="' + b.d + '" fill="' + S.land + '"/>'; }).join('');
            // 區域底色微差（看得出是不同的區）
            zs.forEach(function (z) { s += '<path d="' + makeBlob(z.x, z.y, z.R * 0.85, rng, 0.25).d + '" fill="' + S.land2 + '" opacity="0.45"/>'; });
            // 河：從山區（沒有就隨便一區）流向最近的海
            var src = zs.filter(function (z) { return z.terrain === 'mountain' || z.terrain === 'snow'; })[0] || zs[Math.floor(rng() * zs.length)];
            var hx = src.x + (rng() - 0.5) * src.R * 0.4, hy = src.y + (rng() - 0.5) * src.R * 0.4, ang = Math.atan2(src.edge[1], src.edge[0]) + (rng() - 0.5), rpath = 'M' + r1(hx) + ' ' + r1(hy);
            for (var st = 0; st < 40; st++) { ang += (rng() - 0.5) * 0.7; hx += Math.cos(ang) * 16; hy += Math.sin(ang) * 16; rpath += 'L' + r1(hx) + ' ' + r1(hy); if (!onLand(hx, hy, -10)) break; }
            s += '<path d="' + rpath + '" fill="none" stroke="' + S.ink + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/><path d="' + rpath + '" fill="none" stroke="' + S.river + '" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>';
            // 各區地形小圖
            zs.forEach(function (z) {
                var n = { mountain: 12, snow: 12, forest: 34, city: 16, palace: 10, harbor: 10, desert: 14, swamp: 12, farmland: 9, ruins: 9, lake: 10, island: 10, plain: 10 }[z.terrain];
                var items = [];
                if (z.terrain === 'lake') s += '<path d="' + makeBlob(z.x + z.R * 0.3, z.y - z.R * 0.2, z.R * 0.32, rng, 0.2).d + '" fill="' + S.river + '" stroke="' + S.ink + '" stroke-width="1.5"/>';
                for (var t = 0, tries = 0; t < n && tries < n * 12; tries++) {
                    var a = rng() * 6.283, d = z.R * (0.25 + rng() * 0.6), x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d;
                    if (!onLand(x, y, 14) || !markerFree(x, y, 46) || items.some(function (p) { return Math.hypot(p[0] - x, p[1] - y) < (z.terrain === 'forest' ? 10 : 20); })) continue;
                    items.push([x, y]); t++;
                }
                items.sort(function (a, b) { return a[1] - b[1]; }).forEach(function (p) {
                    var x = p[0], y = p[1];
                    switch (z.terrain) {
                        case 'mountain': s += mountain(x, y, 14 + rng() * 10, S, false); break;
                        case 'snow': s += mountain(x, y, 12 + rng() * 9, S, true); break;
                        case 'forest': s += tree(x, y, 6 + rng() * 3, S, rng); break;
                        case 'city': case 'harbor': s += rng() < 0.2 ? tree(x, y, 5, S, rng) : house(x, y, 9, S, rng); break;
                        case 'palace': s += rng() < 0.5 ? house(x, y, 9, S, rng) : tree(x, y, 6, S, rng); break;
                        case 'desert': s += dune(x, y, 12 + rng() * 8, S); break;
                        case 'swamp': s += reed(x, y, 6, S); break;
                        case 'farmland': s += rng() < 0.75 ? field(x, y, 12, S, rng) : house(x, y, 7, S, rng); break;
                        case 'ruins': s += ruin(x, y, 9, S, rng); break;
                        default: s += rng() < 0.6 ? tree(x, y, 5.5, S, rng) : (rng() < 0.5 ? house(x, y, 7, S, rng) : ''); break;
                    }
                });
                if (z.terrain === 'palace') s += castle(z.x + z.R * 0.42, z.y - z.R * 0.3, 16, S);
                if (z.terrain === 'city' || z.terrain === 'palace') s += '<path d="' + makeBlob(z.x, z.y, z.R * 0.62, rng, 0.08).d + '" fill="none" stroke="' + S.ink + '" stroke-width="1.6" stroke-dasharray="7 4" opacity="0.6"/>';
            });
            // 道路
            edges.forEach(function (e) {
                var A = zs[e[0]], B = zs[e[1]];
                if (A.terrain === 'island' || B.terrain === 'island') {   // 島：航線
                    s += '<path d="M' + r1(A.x) + ' ' + r1(A.y) + 'Q' + r1((A.x + B.x) / 2 + 40) + ' ' + r1((A.y + B.y) / 2 - 40) + ' ' + r1(B.x) + ' ' + r1(B.y) + '" fill="none" stroke="' + S.ink + '" stroke-width="1.3" stroke-dasharray="2 6" opacity="0.55"/>';
                    return;
                }
                var mx = (A.x + B.x) / 2 + (rng() - 0.5) * 70, my = (A.y + B.y) / 2 + (rng() - 0.5) * 70;
                s += '<path d="M' + r1(A.x) + ' ' + r1(A.y) + 'Q' + r1(mx) + ' ' + r1(my) + ' ' + r1(B.x) + ' ' + r1(B.y) + '" fill="none" stroke="' + S.road + '" stroke-width="2" stroke-dasharray="8 5" opacity="0.75"/>';
            });
            if (S.grain) s += '<rect width="' + VW + '" height="' + VH + '" fill="#000" filter="url(#grain)" opacity="' + S.grain + '"/>';
            s += '</g>';
            // 港口的船
            zs.forEach(function (z) { if (z.terrain !== 'harbor' && z.terrain !== 'island') return; for (var b = 0, tr = 0; b < 3 && tr < 40; tr++) { var bx = z.x + z.edge[0] * z.R * (0.7 + rng() * 0.6) + (rng() - 0.5) * z.R, by = z.y + z.edge[1] * z.R * (0.7 + rng() * 0.6) + (rng() - 0.5) * z.R * 0.6; if (!onLand(bx, by, -12)) { s += boat(bx, by, 7, S); b++; } } });
            if (S.grain) s += '<rect width="' + VW + '" height="' + VH + '" fill="#000" filter="url(#grain)" opacity="' + r1(S.grain * 0.6) + '"/>';
        }

        // ===== 外框、羅盤、標題 =====
        var cx = VW - 70, cy = VH - 70;
        if (S.city) {
            s += '<rect x="10" y="10" width="' + (VW - 20) + '" height="' + (VH - 20) + '" fill="none" stroke="' + S.road + '" stroke-width="1" opacity="0.45"/>';
            s += '<g stroke="' + S.road + '" stroke-width="2" opacity="0.8" fill="none"><path d="M10 40V10H40M' + (VW - 40) + ' 10H' + (VW - 10) + 'V40M10 ' + (VH - 40) + 'V' + (VH - 10) + 'H40M' + (VW - 40) + ' ' + (VH - 10) + 'H' + (VW - 10) + 'V' + (VH - 40) + '"/></g>';
            s += '<g transform="translate(' + cx + ' ' + cy + ')" fill="none" stroke="' + S.road + '" opacity="0.7"><circle r="26" stroke-width="1"/><circle r="4" fill="' + S.road + '"/><path d="M0 -34V34M-34 0H34" stroke-width="0.8"/></g><text x="' + cx + '" y="' + (cy - 38) + '" text-anchor="middle" font-size="12" fill="' + S.road + '" font-family="' + S.font + '">N</text>';
        } else {
            s += '<rect x="8" y="8" width="' + (VW - 16) + '" height="' + (VH - 16) + '" fill="none" stroke="' + S.ink + '" stroke-width="3"/><rect x="15" y="15" width="' + (VW - 30) + '" height="' + (VH - 30) + '" fill="none" stroke="' + S.ink + '" stroke-width="1"/>';
            s += '<g transform="translate(' + cx + ' ' + cy + ')"><circle r="30" fill="' + S.land + '" stroke="' + S.ink + '" stroke-width="1.5" opacity="0.9"/><circle r="24" fill="none" stroke="' + S.ink + '" stroke-width="0.6"/>'
                + '<path d="M0 -38L6 -6L38 0L6 6L0 38L-6 6L-38 0L-6 -6Z" fill="' + S.land2 + '" stroke="' + S.ink + '" stroke-width="1.2"/><path d="M0 -38L6 -6L0 0Z M38 0L6 6L0 0Z M0 38L-6 6L0 0Z M-38 0L-6 -6L0 0Z" fill="' + S.ink + '" opacity="0.75"/></g>';
        }
        if (plan.name && opt.title !== false) {
            var nm = esc(plan.name), fs = 26, tw = Math.max(120, String(plan.name).length * fs * 0.95 + 40);
            if (S.city) s += '<text x="30" y="48" font-size="22" fill="' + S.road + '" font-family="' + S.font + '" letter-spacing="3">' + nm + '</text><path d="M30 58H' + r1(30 + tw * 0.8) + '" stroke="' + S.road + '" stroke-width="1" opacity="0.6"/>';
            else if (S.seal) s += '<g transform="translate(34 30)"><rect width="' + r1(tw * 0.9) + '" height="44" fill="' + S.land + '" stroke="' + S.ink + '" stroke-width="1.2" opacity="0.92"/><text x="16" y="31" font-size="' + fs + '" fill="' + S.ink + '" font-family="' + S.font + '">' + nm + '</text><rect x="' + r1(tw * 0.9 + 8) + '" y="4" width="34" height="34" rx="3" fill="' + S.seal + '"/><text x="' + r1(tw * 0.9 + 25) + '" y="28" text-anchor="middle" font-size="16" fill="#f4e9da" font-family="' + S.font + '">圖</text></g>';
            else s += '<g transform="translate(30 28)"><path d="M0 0H' + r1(tw) + 'L' + r1(tw - 14) + ' 25L' + r1(tw) + ' 50H0L14 25Z" fill="' + S.land + '" stroke="' + S.ink + '" stroke-width="1.8"/><text x="' + r1(tw / 2) + '" y="34" text-anchor="middle" font-size="' + fs + '" fill="' + S.ink + '" font-family="' + S.font + '" font-weight="600">' + nm + '</text></g>';
        }
        s += '<rect width="' + VW + '" height="' + VH + '" fill="url(#vig)"/></svg>';
        return { svg: s, zones: zs, vw: VW, vh: VH };
    }
    // 區域底圖＝同一張世界地圖放大到那一區（進區時的背景就不用另外生圖）
    function cropTo(svg, z, vw, vh, ow, oh) {
        var ar = oh / ow, cw = z.R * 3.2, ch = cw * ar;
        var x = clamp(z.x - cw / 2, 0, Math.max(0, vw - cw)), y = clamp(z.y - ch / 2, 0, Math.max(0, vh - ch));
        return svg.replace(/viewBox="[^"]*"/, 'viewBox="' + r1(x) + ' ' + r1(y) + ' ' + r1(cw) + ' ' + r1(ch) + '"');
    }
    // SVG → data URL：只跳脫一定要跳的字，比整串 encodeURIComponent 小，存進世界檔也省。
    //   🚨 單引號一定要跳（%27）：map_core 套背景是 url('…')，網址裡出現 ' 就斷掉、整條背景失效；雙引號留著沒事。
    function toDataUrl(svg) {
        const body = String(svg).replace(/\s+/g, ' ')
            .replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/'/g, '%27')
            .replace(/[^ -~]/gu, function (c) { return encodeURIComponent(c); });
        return 'data:image/svg+xml,' + body;
    }

    // ============================================================
    // 三、清單：模型怎麼填、怎麼讀；怎麼變成世界
    // ============================================================
    const TERRAIN_ICON = { city: 'city', palace: 'building-columns', harbor: 'anchor', forest: 'tree', mountain: 'mountain', desert: 'sun', snow: 'snowflake', swamp: 'frog', farmland: 'wheat-awn', ruins: 'monument', lake: 'water', island: 'sailboat', plain: 'leaf' };
    function buildFormPrompt() {
        const icons = (win.MAP_ICONS && win.MAP_ICONS.promptList()) || '';
        return [
            '[替這個故事的世界整理一份地圖清單]',
            '從上面的角色卡、世界書和劇情，整理出這個故事的世界有哪些區域、每一區裡有哪些地方。',
            '程式會照這份清單畫出整張世界地圖；你不用畫、不用描述畫面長相，也不用寫生圖用的英文句子。',
            '',
            '只回下面這個區塊，區塊外面不要有任何字：',
            '<world-plan>',
            'WORLD|世界名|風格',
            'ZONE|區域代號|區域名|地形|橫向位置|縱向位置|圖示',
            'PLACE|區域代號|地點代號|地點名|短名|圖示',
            '</world-plan>',
            '',
            '規則：',
            '- WORLD 只有一行。風格照抄一個：fantasy（西方奇幻、中世紀）、wuxia（中式古代、武俠、仙俠）、japanese（日式和風）、modern（現代都市）、scifi（未來、賽博）、wasteland（末日廢土）、historical（真實的歷史年代）。',
            '- ZONE 一行一區，照世界書的規模決定寫幾行：一所學校、一個村子寫 2 到 3 區；一座城 3 到 5 區；整片大陸 4 到 6 區。',
            '- 區域代號、地點代號：英文小寫加底線，看得出是哪裡（不要寫 z1、f2、zone_a 這種編號）。PLACE 的第二欄用區域代號指它屬於哪一區。',
            '- 地形照抄一個最接近的：' + Object.keys(TERRAINS).join(', ') + '。',
            '- 橫向位置、縱向位置：這一區在整張地圖上的位置，0 到 100 的整數，左上角是 0|0，右下角是 100|100。照世界書的地理放（港口靠邊、中心城放中間）。區與區至少差 20，別疊在一起。',
            '- PLACE 每區 3 到 6 行，是玩家可以走進去的地方，名稱要合這個世界的年代與文化。短名 4 個字以內。不要寫人。',
            '- 圖示：從下面清單照抄一個最貼近那個地方的英文名（不加 fa- 前綴，不要寫 emoji）：',
            icons
        ].join('\n');
    }
    function parseWorldForm(txt) {
        let body = String(txt || '');
        const m = body.match(/<world-plan>([\s\S]*?)(<\/world-plan>|$)/i);
        if (m) body = m[1];
        const plan = { name: '', style: 'fantasy', zones: [] }, byKey = {};
        body.split(/\n/).forEach(function (line) {
            const f = line.replace(/^[\s\-*•]+/, '').split(/[|｜]/).map(function (x) { return x.trim(); }), tag = (f[0] || '').toUpperCase();
            if (tag === 'WORLD') { plan.name = f[1] || ''; const st = String(f[2] || '').toLowerCase().replace(/[^a-z]/g, ''); plan.style = STYLES[st] ? st : guessStyle(f[2]); }
            else if (tag === 'ZONE' && f[1]) {
                const tr = String(f[3] || '').toLowerCase().replace(/[^a-z]/g, '');
                const z = { key: f[1], name: f[2] || f[1], terrain: TERRAINS[tr] ? tr : guessTerrain((f[2] || '') + ' ' + (f[3] || '')), x: parseFloat(f[4]), y: parseFloat(f[5]), icon: f[6] || '', places: [] };
                if (!isFinite(z.x) || !isFinite(z.y)) { z.x = NaN; z.y = NaN; }
                if (!byKey[z.key]) { byKey[z.key] = z; plan.zones.push(z); }
            } else if (tag === 'PLACE' && f[1]) {
                const zz = byKey[f[1]];
                if (zz && f[3]) zz.places.push({ key: f[2] || '', name: f[3], shortName: f[4] || '', icon: f[5] || '' });
            }
        });
        placeMissing(plan.zones);
        return plan.zones.length ? plan : null;
    }
    function placeMissing(zones) {   // 沒給座標的：繞圈排開
        const miss = zones.filter(function (z) { return !isFinite(z.x); });
        miss.forEach(function (z, i) { const a = i / miss.length * 6.283 - 1.2; z.x = 50 + Math.cos(a) * 30; z.y = 50 + Math.sin(a) * 28; });
    }
    function _safeKey(k, fallback, used) {   // 代號當資料鍵：只留英數底線，撞名補序號
        const s = String(k || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || fallback;
        let out = s, n = 2;
        while (used[out]) out = s + '_' + (n++);
        used[out] = 1;
        return out;
    }
    // 清單 → WORLD_RUNTIME.setWorld 的格式。座標先 clamp 成畫家用的範圍，圖釘跟畫的區塊才對得上。
    function buildWorldData(plan) {
        const MI = win.MAP_ICONS;
        const icon = function (v, fb) { return MI ? MI.name(v && MI.isName(v) ? v : fb) : (v || fb); };
        plan.zones.forEach(function (z) { z.x = clamp(Math.round(z.x), 6, 94); z.y = clamp(Math.round(z.y), 8, 92); });
        const style = STYLES[plan.style] ? plan.style : 'fantasy';
        const res = paintWorld({ name: plan.name, style: style, zones: plan.zones }, { w: 1600, h: 1000, title: false });
        const zones = {}, usedZ = {};
        plan.zones.forEach(function (z, i) {
            const zKey = _safeKey(z.key, 'zone_' + (i + 1), usedZ), facilities = {}, usedF = {};
            z.places.forEach(function (p, j) {
                const fKey = _safeKey(p.key, 'place_' + (j + 1), usedF);
                facilities[fKey] = {
                    sceneId: zKey + '_' + fKey,
                    name: p.name,
                    shortName: p.shortName || p.name,
                    icon: icon(p.icon, 'location-dot'),
                    className: 'facility-' + fKey,
                    characters: [],
                    imageUrl: ''   // 沒有地點圖：進設施時 map_core 退回這一區的底圖
                };
            });
            zones[zKey] = {
                name: z.name || zKey,
                icon: icon(z.icon, TERRAIN_ICON[z.terrain] || 'location-dot'),
                mapX: z.x, mapY: z.y,
                terrain: z.terrain,
                background: toDataUrl(cropTo(res.svg, res.zones[i], res.vw, res.vh, 16, 10)),
                bgPrompt: '',
                facilities: facilities
            };
        });
        const genre = style === 'historical' ? 'historical' : 'fictional';
        return {
            name: plan.name || 'Generated World',
            genre: genre,
            worldMap: {
                backdropPrompt: '',
                backdropUrl: toDataUrl(res.svg),   // 備用：首頁會照容器比例現畫（homeUrl）
                genre: genre,
                painted: { name: plan.name || '', style: style, zones: plan.zones.map(function (z) { return { name: z.name, terrain: z.terrain, x: z.x, y: z.y }; }) }
            },
            zones: zones
        };
    }
    // 首頁大地圖：照容器實際寬高現畫，圖釘（map_core 用 mapX/mapY 百分比貼的）才會落在畫出來的區塊上。
    const _homeCache = {};
    function homeUrl(world, w, h) {
        const pd = world && world.worldMap && world.worldMap.painted;
        if (!pd || !(w > 0) || !(h > 0)) return '';
        const key = (world.id || world.name || '') + '|' + Math.round(w) + 'x' + Math.round(h);
        if (!_homeCache[key]) _homeCache[key] = toDataUrl(paintWorld(pd, { w: w, h: h, title: false }).svg);
        return _homeCache[key];
    }

    win.WORLD_PAINTER = { paintWorld, cropTo, toDataUrl, buildFormPrompt, parseWorldForm, buildWorldData, homeUrl, STYLES, TERRAINS };
    if (win !== window) window.WORLD_PAINTER = win.WORLD_PAINTER;
})();
