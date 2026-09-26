// ----------------------------------------------------------------
// [檔案] scene_painter.js
// 路徑：os_phone/map/scene_painter.js
// 職責：進設施的小地圖由程式畫成俯視平面圖（地面、牆、窗、門口、家具零件），不生圖。
//   plan = { name, floor, indoor, night, items:[{ kind, label, x, y (0-100) | pos 九宮格 }] }
//   畫布 200×100，跟小地圖 .am-scene-stage 一樣 2:1。會貼牆的東西自己貼牆、正面朝房間，重疊的推開，門口留路，
//   所以畫出來的位置可能跟地標原本的 x/y 差一點——paint() 回傳每件的實際位置，map_core 用它貼名牌。
//   目前只給「直接畫」的世界用（世界地圖也是程式畫的那種，見 world_painter.js）；生圖世界照舊。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    function hashStr(s) { var h = 2166136261; s = String(s || ''); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    function rngOf(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function r2(n) { return Math.round(n * 100) / 100; }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }


    var VW = 200, VH = 100, WALL = 5;

    var FLOORS = {
        wood:       { name: '木地板',     base: '#c99a62', line: '#a87840', alt: '#d2a56d', wall: '#efe5d6', wallEdge: '#b9ab96' },
        dark_wood:  { name: '深色木地板', base: '#5e3f29', line: '#3f2a1b', alt: '#63432c', wall: '#2c2622', wallEdge: '#15110e' },
        tile:       { name: '磁磚',       base: '#e3e4e0', line: '#c3c5bf', alt: '#eceee9', wall: '#f5f6f3', wallEdge: '#a9aca4' },
        marble:     { name: '大理石',     base: '#eeeae3', line: '#d6d0c5', alt: '#f5f2ec', wall: '#fbf9f5', wallEdge: '#b8b0a2' },
        carpet:     { name: '地毯',       base: '#6d3a40', line: '#5a2f35', alt: '#76434a', wall: '#e9dfd2', wallEdge: '#a99b88' },
        concrete:   { name: '水泥',       base: '#8f918e', line: '#7a7c79', alt: '#999b98', wall: '#5f615f', wallEdge: '#3b3c3b' },
        stone:      { name: '石板',       base: '#aaa397', line: '#8c857a', alt: '#b5aea2', wall: '#8a8378', wallEdge: '#5f594f' },
        grass:      { name: '草地',       base: '#6f9b55', line: '#5d8747', alt: '#7aa75f', wall: '#4f7a3c', wallEdge: '#355527' },
        sand:       { name: '沙地',       base: '#dcc596', line: '#c9b07e', alt: '#e4cfa4', wall: '#bfa674', wallEdge: '#907a4f' }
    };
    var FLOOR_ALIAS = { '木地板': 'wood', '木': 'wood', '深色木地板': 'dark_wood', '深木': 'dark_wood', '磁磚': 'tile', '瓷磚': 'tile', '大理石': 'marble', '地毯': 'carpet', '水泥': 'concrete', '石板': 'stone', '石頭': 'stone', '草地': 'grass', '草': 'grass', '沙地': 'sand', '沙': 'sand' };

    // 家具尺寸（畫布單位；w=沿牆那一邊）＋會不會貼牆
    var KINDS = {
        counter:     { w: 56, h: 10, wall: true,  zh: '吧檯／櫃檯' },
        table:       { w: 22, h: 13, wall: false, zh: '方桌' },
        round_table: { w: 20, h: 20, wall: false, zh: '圓桌' },
        chair:       { w: 6,  h: 6,  wall: false, zh: '椅子' },
        sofa:        { w: 28, h: 11, wall: true,  zh: '沙發' },
        bed:         { w: 20, h: 28, wall: true,  zh: '床' },
        shelf:       { w: 34, h: 7,  wall: true,  zh: '書架／貨架' },
        desk:        { w: 22, h: 11, wall: true,  zh: '書桌' },
        plant:       { w: 9,  h: 9,  wall: false, zh: '盆栽' },
        tree:        { w: 22, h: 22, wall: false, zh: '樹' },
        fountain:    { w: 30, h: 30, wall: false, zh: '噴泉' },
        stage:       { w: 62, h: 22, wall: true,  zh: '舞台' },
        stall:       { w: 22, h: 15, wall: false, zh: '攤位' },
        bench:       { w: 22, h: 6,  wall: false, zh: '長椅' },
        fireplace:   { w: 24, h: 8,  wall: true,  zh: '壁爐' },
        water:       { w: 56, h: 28, wall: false, zh: '水池' },
        screen:      { w: 34, h: 4,  wall: true,  zh: '螢幕' },
        machine:     { w: 11, h: 9,  wall: true,  zh: '機器' },
        piano:       { w: 20, h: 14, wall: false, zh: '鋼琴' },
        crate:       { w: 14, h: 12, wall: false, zh: '木箱' },
        board:       { w: 24, h: 4,  wall: true,  zh: '佈告板' },
        statue:      { w: 14, h: 14, wall: false, zh: '雕像' },
        car:         { w: 30, h: 15, wall: false, zh: '車' },
        lamp:        { w: 6,  h: 6,  wall: false, zh: '燈' },
        ring:        { w: 46, h: 40, wall: false, zh: '擂台' },
        rug:         { w: 40, h: 24, wall: false, zh: '地毯' },
        pillar:      { w: 8,  h: 8,  wall: false, zh: '柱子' },
        spot:        { w: 12, h: 12, wall: false, zh: '其他' }
    };

    // 現有地標（只有名字＋emoji）→ 猜種類
    var KIND_WORDS = [
        [/擂台|拳台|八角籠/, 'ring'], [/DJ|混音|控台|操作台/i, 'desk'], [/噴泉/, 'fountain'], [/舞台|舞池|講台|表演/, 'stage'], [/壁爐|火爐|爐火/, 'fireplace'],
        [/吧檯|吧台|櫃檯|櫃台|收銀|服務台|前台|接待/, 'counter'], [/書架|書櫃|貨架|架/, 'shelf'], [/圓桌/, 'round_table'],
        [/書桌|辦公桌|工作台|工作桌/, 'desk'], [/桌/, 'table'], [/沙發/, 'sofa'], [/床|睡墊|臥鋪/, 'bed'], [/長椅|長凳/, 'bench'],
        [/椅|凳/, 'chair'], [/樹/, 'tree'], [/盆栽|植物|花/, 'plant'], [/攤|推車|小販/, 'stall'], [/池|湖|水|溪|河/, 'water'],
        [/螢幕|電視|屏|顯示/, 'screen'], [/販賣機|機台|終端|機器|機/, 'machine'], [/鋼琴|琴/, 'piano'], [/箱|貨/, 'crate'],
        [/佈告|公告|看板|告示|板/, 'board'], [/雕像|塑像|銅像/, 'statue'], [/車/, 'car'], [/燈/, 'lamp'], [/柱/, 'pillar'], [/地毯/, 'rug']
    ];
    function guessKind(label, emoji) {
        var s = String(label || '');
        for (var i = 0; i < KIND_WORDS.length; i++) if (KIND_WORDS[i][0].test(s)) return KIND_WORDS[i][1];
        var e = String(emoji || '');
        if (/🍻|🍷|🍸|☕/.test(e)) return 'counter';
        if (/📚/.test(e)) return 'shelf';
        if (/🪑/.test(e)) return 'chair';
        if (/🌳|🌲|🌴/.test(e)) return 'tree';
        if (/🌸|🌿|🪴/.test(e)) return 'plant';
        if (/⛲/.test(e)) return 'fountain';
        if (/🛏/.test(e)) return 'bed';
        if (/🔥/.test(e)) return 'fireplace';
        if (/🎹|🎵|🎶/.test(e)) return 'piano';
        if (/🥊/.test(e)) return 'ring';
        if (/📺|💻|🖥/.test(e)) return 'screen';
        if (/🪧|📋/.test(e)) return 'board';
        if (/🚗|🚙|🏎/.test(e)) return 'car';
        return 'spot';
    }
    // 設施名＋說明 → 猜地面／室內外／夜晚
    function guessGround(name, desc) {
        var s = String(name || '') + ' ' + String(desc || '');
        var outdoor = /廣場|公園|街|市集|夜市|港|碼頭|花園|庭園|天台|屋頂|海灘|沙灘|操場|球場|墓園|山|林|營地/.test(s) && !/街區.*大樓|室內/.test(s);
        var floor = 'wood';
        if (/醫院|診所|實驗|車站|轉運|捷運|空軌|浴|廁|廚房/.test(s)) floor = 'tile';
        else if (/總部|金融|大廳|尖塔|酒店|飯店|百貨|議會|博物館|美術館/.test(s)) floor = 'marble';
        else if (/俱樂部|酒吧|夜店|club|Club|地下/.test(s)) floor = 'dark_wood';
        else if (/拳館|競技|車庫|倉庫|工廠|停車|廢墟|工地/.test(s)) floor = 'concrete';
        else if (/劇院|影院|包廂|套房/.test(s)) floor = 'carpet';
        if (outdoor) floor = /公園|花園|庭園|林|營地/.test(s) ? 'grass' : (/海灘|沙灘/.test(s) ? 'sand' : 'stone');
        var night = /俱樂部|酒吧|夜店|夜市|深夜|午夜|club|Club/.test(s);
        return { floor: floor, indoor: !outdoor, night: night };
    }

    // ---------- 地面 ----------
    function floorDefs(f, key, rng) {
        var p = FLOORS[f];
        var d = '';
        if (f === 'wood' || f === 'dark_wood') {
            d += '<pattern id="fl" width="80" height="14" patternUnits="userSpaceOnUse">'
                + '<rect width="80" height="14" fill="' + p.base + '"/>'
                + '<rect x="0" y="0" width="40" height="7" fill="' + p.alt + '" opacity="0.55"/><rect x="60" y="7" width="20" height="7" fill="' + p.alt + '" opacity="0.4"/><rect x="0" y="7" width="20" height="7" fill="' + p.alt + '" opacity="0.4"/>'
                + '<path d="M0 7H80M0 14H80M0 0V7M40 0V7M20 7V14M60 7V14" stroke="' + p.line + '" stroke-width="' + (f === 'dark_wood' ? 0.25 : 0.35) + '" opacity="' + (f === 'dark_wood' ? 0.6 : 1) + '" fill="none"/></pattern>';
        } else if (f === 'tile') {
            d += '<pattern id="fl" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="' + p.base + '"/><rect x="0.4" y="0.4" width="9.2" height="9.2" fill="' + p.alt + '" opacity="0.5"/><path d="M0 0H10M0 0V10" stroke="' + p.line + '" stroke-width="0.4"/></pattern>';
        } else if (f === 'marble') {
            d += '<pattern id="fl" width="25" height="25" patternUnits="userSpaceOnUse"><rect width="25" height="25" fill="' + p.base + '"/><rect x="12.5" y="0" width="12.5" height="12.5" fill="' + p.alt + '"/><rect x="0" y="12.5" width="12.5" height="12.5" fill="' + p.alt + '"/><path d="M0 0H25M0 0V25" stroke="' + p.line + '" stroke-width="0.25"/></pattern>';
        } else if (f === 'carpet') {
            d += '<pattern id="fl" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="' + p.base + '"/><path d="M0 4L4 0L8 4L4 8Z" fill="' + p.alt + '" opacity="0.45"/></pattern>';
        } else if (f === 'stone') {
            d += '<pattern id="fl" width="32" height="20" patternUnits="userSpaceOnUse"><rect width="32" height="20" fill="' + p.base + '"/><rect x="0.5" y="0.5" width="15" height="9" fill="' + p.alt + '" opacity="0.6"/><rect x="24.5" y="10.5" width="7" height="9" fill="' + p.alt + '" opacity="0.5"/><rect x="0.5" y="10.5" width="7" height="9" fill="' + p.alt + '" opacity="0.5"/>'
                + '<path d="M0 10H32M0 20H32M16 0V10M8 10V20M24 10V20M0 0V10" stroke="' + p.line + '" stroke-width="0.45" fill="none"/></pattern>';
        } else if (f === 'concrete') {
            d += '<pattern id="fl" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="' + p.base + '"/><path d="M0 0H40M0 0V40" stroke="' + p.line + '" stroke-width="0.4"/></pattern>';
        } else {
            d += '<pattern id="fl" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="' + p.base + '"/></pattern>';
        }
        // 紋理雜訊（水泥／草／沙／石頭才有）
        d += '<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="' + (f === 'grass' ? '0.09' : '0.6') + '" numOctaves="' + (f === 'grass' ? 3 : 2) + '" seed="' + Math.floor(rng() * 99) + '"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>';
        d += '<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1"/></filter>';
        d += '<radialGradient id="vig" cx="50%" cy="46%" r="72%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.38"/></radialGradient>';
        d += '<radialGradient id="glow"><stop offset="0%" stop-color="#ffd58a" stop-opacity="0.55"/><stop offset="100%" stop-color="#ffd58a" stop-opacity="0"/></radialGradient>';
        d += '<radialGradient id="neon"><stop offset="0%" stop-color="#b56cff" stop-opacity="0.5"/><stop offset="100%" stop-color="#b56cff" stop-opacity="0"/></radialGradient>';
        d += '<radialGradient id="wat" cx="45%" cy="40%"><stop offset="0%" stop-color="#8fd3e8"/><stop offset="100%" stop-color="#3f8fb3"/></radialGradient>';
        return d;
    }
    function drawFloor(f, rng) {
        var s = '<rect width="' + VW + '" height="' + VH + '" fill="url(#fl)"/>';
        if (f === 'concrete' || f === 'grass' || f === 'sand' || f === 'stone') s += '<rect width="' + VW + '" height="' + VH + '" fill="#000" filter="url(#grain)" opacity="' + (f === 'grass' ? 0.35 : 0.22) + '"/>';
        if (f === 'marble') {   // 幾道淡淡的大理石紋
            for (var i = 0; i < 5; i++) {
                var x0 = rng() * VW, y0 = rng() * VH;
                s += '<path d="M' + r2(x0) + ' ' + r2(y0) + ' q' + r2(20 + rng() * 30) + ' ' + r2(-10 + rng() * 20) + ' ' + r2(45 + rng() * 40) + ' ' + r2(-6 + rng() * 12) + '" stroke="#b9b0a2" stroke-width="0.35" fill="none" opacity="0.5"/>';
            }
        }
        if (f === 'grass') {   // 草叢
            for (var j = 0; j < 70; j++) {
                var gx = rng() * VW, gy = rng() * VH;
                s += '<path d="M' + r2(gx) + ' ' + r2(gy) + 'l-0.8 -2.2M' + r2(gx) + ' ' + r2(gy) + 'l0.2 -2.6M' + r2(gx) + ' ' + r2(gy) + 'l1 -2" stroke="#4d7a38" stroke-width="0.4" opacity="0.7"/>';
            }
        }
        return s;
    }
    function drawWalls(p, indoor, rng) {
        if (!indoor) return '';
        var t = WALL, dw = 26, dx = VW / 2 - dw / 2;
        var s = '<g>';
        s += '<path d="M0 0H' + VW + 'V' + VH + 'H' + (dx + dw) + 'V' + (VH - t) + 'H' + (VW - t) + 'V' + t + 'H' + t + 'V' + (VH - t) + 'H' + dx + 'V' + VH + 'H0Z" fill="' + p.wall + '"/>';
        s += '<path d="M' + t + ' ' + (VH - t) + 'V' + t + 'H' + (VW - t) + 'V' + (VH - t) + '" fill="none" stroke="' + p.wallEdge + '" stroke-width="0.6"/>';
        s += '<rect x="0.3" y="0.3" width="' + (VW - 0.6) + '" height="' + (VH - 0.6) + '" fill="none" stroke="' + p.wallEdge + '" stroke-width="0.6"/>';
        // 牆內側陰影
        s += '<rect x="' + t + '" y="' + t + '" width="' + (VW - 2 * t) + '" height="3" fill="#000" opacity="0.12"/>';
        // 上牆兩扇窗
        [0.25, 0.75].forEach(function (k) { var wx = VW * k - 11; s += '<rect x="' + r2(wx) + '" y="1.2" width="22" height="2.6" fill="#bfe3f2" stroke="' + p.wallEdge + '" stroke-width="0.35"/>'; });
        // 門口地墊
        s += '<rect x="' + (dx + 5) + '" y="' + (VH - t - 4) + '" width="' + (dw - 10) + '" height="4" rx="0.8" fill="#6b5a4a" opacity="0.75"/>';
        return s + '</g>';
    }
    function drawOutdoorEdge(rng) {
        var s = '';
        for (var i = 0; i < 26; i++) {   // 四周灌木
            var side = i % 4, k = rng();
            var x = side === 0 ? k * VW : side === 1 ? VW - rng() * 5 : side === 2 ? k * VW : rng() * 5;
            var y = side === 0 ? rng() * 5 : side === 1 ? k * VH : VH - rng() * 5;
            if (side === 2 && Math.abs(x - VW / 2) < 20) continue;   // 下方中間留入口
            var r = 3 + rng() * 3;
            s += '<circle cx="' + r2(x + 0.8) + '" cy="' + r2(y + 1.2) + '" r="' + r2(r) + '" fill="#000" opacity="0.18"/><circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r) + '" fill="#4f7d3d"/><circle cx="' + r2(x - r * 0.3) + '" cy="' + r2(y - r * 0.3) + '" r="' + r2(r * 0.5) + '" fill="#6c9a55"/>';
        }
        return s;
    }

    // ---------- 家具 ----------
    var FABRIC = ['#8c4a4a', '#3f5d7a', '#5e7a4a', '#7a6a3f', '#6a4a7a', '#3f7a74'];
    function shadow(w, h, rx) { return '<rect x="' + r2(-w / 2 + 0.9) + '" y="' + r2(-h / 2 + 1.4) + '" width="' + r2(w) + '" height="' + r2(h) + '" rx="' + (rx || 1) + '" fill="#000" opacity="0.28"/>'; }
    function cshadow(r) { return '<circle cx="0.9" cy="1.4" r="' + r2(r) + '" fill="#000" opacity="0.28"/>'; }
    function chairAt(x, y, rot, col) { return '<g transform="translate(' + r2(x) + ' ' + r2(y) + ') rotate(' + rot + ')">' + shadow(5, 5, 1) + '<rect x="-2.5" y="-2.5" width="5" height="5" rx="1" fill="' + col + '"/><rect x="-2.5" y="-2.5" width="5" height="1.3" rx="0.6" fill="#000" opacity="0.25"/></g>'; }
    var DRAW = {
        counter: function (w, h, o) {
            var s = shadow(w, h, 1.5) + '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="1.5" fill="' + o.wood + '"/>'
                + '<rect x="' + (-w / 2 + 1) + '" y="' + (-h / 2 + 1) + '" width="' + (w - 2) + '" height="' + (h * 0.45) + '" rx="1" fill="' + o.woodTop + '"/>';
            for (var i = 0; i < Math.floor(w / 9); i++) {   // 杯子
                var cx = -w / 2 + 5 + i * 9 + o.rng() * 2;
                s += '<circle cx="' + r2(cx) + '" cy="' + r2(-h / 2 + 2.6) + '" r="0.9" fill="#e8f1f5" stroke="#8aa" stroke-width="0.2"/>';
            }
            for (var j = 0; j < Math.floor(w / 9); j++) s += chairAt(-w / 2 + 5 + j * 9, h / 2 + 3.4, 180, o.accent);   // 高腳椅
            return s;
        },
        table: function (w, h, o) {
            var s = chairAt(-w / 4, -h / 2 - 3, 0, o.accent) + chairAt(w / 4, -h / 2 - 3, 0, o.accent) + chairAt(-w / 4, h / 2 + 3, 180, o.accent) + chairAt(w / 4, h / 2 + 3, 180, o.accent);
            s += shadow(w, h, 1) + '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="1" fill="' + o.woodTop + '" stroke="' + o.wood + '" stroke-width="0.6"/>';
            s += '<rect x="-3" y="-2" width="6" height="4" rx="0.6" fill="#f3efe6" opacity="0.9"/>';
            return s;
        },
        round_table: function (w, h, o) {
            var r = w / 2 - 3, s = '';
            for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2 + Math.PI / 4; s += chairAt(Math.cos(a) * (r + 3), Math.sin(a) * (r + 3), i * 90 + 135, o.accent); }
            s += cshadow(r) + '<circle r="' + r + '" fill="' + o.woodTop + '" stroke="' + o.wood + '" stroke-width="0.6"/><circle r="' + r2(r * 0.35) + '" fill="#f3efe6" opacity="0.85"/>';
            return s;
        },
        chair: function (w, h, o) { return chairAt(0, 0, 0, o.accent); },
        sofa: function (w, h, o) {
            return shadow(w, h, 3) + '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="3" fill="' + o.accent + '"/>'
                + '<rect x="' + (-w / 2 + 3) + '" y="' + (-h / 2 + 3.5) + '" width="' + (w - 6) + '" height="' + (h - 5) + '" rx="1.5" fill="#fff" opacity="0.14"/>'
                + '<path d="M0 ' + (-h / 2 + 3.5) + 'V' + (h / 2 - 1.5) + '" stroke="#000" stroke-width="0.4" opacity="0.3"/>';
        },
        bed: function (w, h, o) {
            return shadow(w, h, 1.5) + '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="1.5" fill="' + o.wood + '"/>'
                + '<rect x="' + (-w / 2 + 1) + '" y="' + (-h / 2 + 1) + '" width="' + (w - 2) + '" height="' + (h - 2) + '" rx="1" fill="#f4f1ea"/>'
                + '<rect x="' + (-w / 2 + 2.5) + '" y="' + (-h / 2 + 2) + '" width="' + (w / 2 - 3.5) + '" height="5" rx="1.5" fill="#fff" stroke="#ddd" stroke-width="0.3"/><rect x="1" y="' + (-h / 2 + 2) + '" width="' + (w / 2 - 3.5) + '" height="5" rx="1.5" fill="#fff" stroke="#ddd" stroke-width="0.3"/>'
                + '<rect x="' + (-w / 2 + 1) + '" y="' + (-h / 2 + h * 0.38) + '" width="' + (w - 2) + '" height="' + (h * 0.6 - 1) + '" rx="1" fill="' + o.accent + '"/>';
        },
        shelf: function (w, h, o) {
            var s = shadow(w, h, 0.6) + '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="0.6" fill="' + o.wood + '"/>';
            var x = -w / 2 + 1;
            while (x < w / 2 - 2) { var bw = 1.2 + o.rng() * 1.6; s += '<rect x="' + r2(x) + '" y="' + r2(-h / 2 + 1) + '" width="' + r2(bw) + '" height="' + (h - 2) + '" fill="' + FABRIC[Math.floor(o.rng() * FABRIC.length)] + '"/>'; x += bw + 0.3; }
            return s;
        },
        desk: function (w, h, o) {
            return chairAt(0, h / 2 + 3.5, 180, o.accent) + shadow(w, h, 0.8) + '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="0.8" fill="' + o.woodTop + '" stroke="' + o.wood + '" stroke-width="0.5"/>'
                + '<rect x="-5" y="' + (-h / 2 + 1.5) + '" width="10" height="1.4" rx="0.4" fill="#2b3440"/><rect x="-4" y="' + (-h / 2 + 4.5) + '" width="8" height="2.5" rx="0.4" fill="#cfd6dd"/><rect x="' + (w / 2 - 6) + '" y="-1" width="3.5" height="4.5" fill="#f4f1ea" transform="rotate(12 ' + (w / 2 - 4) + ' 1)"/>';
        },
        plant: function (w, h, o) {
            var s = cshadow(3.2) + '<circle r="3.2" fill="#9a6a45"/>';
            for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2 + o.rng(); s += '<ellipse cx="' + r2(Math.cos(a) * 2.4) + '" cy="' + r2(Math.sin(a) * 2.4) + '" rx="2.6" ry="1.3" transform="rotate(' + r2(a * 57.3) + ' ' + r2(Math.cos(a) * 2.4) + ' ' + r2(Math.sin(a) * 2.4) + ')" fill="' + (i % 2 ? '#4f8a45' : '#6aa85a') + '"/>'; }
            return s + '<circle r="1.4" fill="#3f7a38"/>';
        },
        tree: function (w, h, o) {
            var r = w / 2, s = '<circle cx="2.2" cy="3" r="' + r + '" fill="#000" opacity="0.22"/>';
            for (var i = 0; i < 7; i++) { var a = i / 7 * Math.PI * 2 + o.rng(); s += '<circle cx="' + r2(Math.cos(a) * r * 0.45) + '" cy="' + r2(Math.sin(a) * r * 0.45) + '" r="' + r2(r * 0.55) + '" fill="' + (i % 2 ? '#3f7434' : '#4d8a40') + '"/>'; }
            return s + '<circle cx="' + r2(-r * 0.2) + '" cy="' + r2(-r * 0.25) + '" r="' + r2(r * 0.4) + '" fill="#6aa85a" opacity="0.8"/>';
        },
        fountain: function (w, h, o) {
            var r = w / 2;
            return cshadow(r) + '<circle r="' + r + '" fill="#c9c3b6" stroke="#8f887b" stroke-width="0.8"/><circle r="' + r2(r - 2.5) + '" fill="url(#wat)"/>'
                + '<circle r="' + r2(r * 0.55) + '" fill="none" stroke="#fff" stroke-width="0.35" opacity="0.6"/><circle r="' + r2(r * 0.3) + '" fill="none" stroke="#fff" stroke-width="0.35" opacity="0.5"/>'
                + '<circle r="3" fill="#c9c3b6" stroke="#8f887b" stroke-width="0.5"/><circle r="1.2" fill="#dff4fb"/>';
        },
        stage: function (w, h, o) {
            var s = shadow(w, h, 1) + '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="1" fill="' + (o.night ? '#1c1a24' : o.wood) + '"/>'
                + '<rect x="' + (-w / 2 + 1.5) + '" y="' + (-h / 2 + 1.5) + '" width="' + (w - 3) + '" height="' + (h - 3) + '" fill="' + (o.night ? '#2a2636' : o.woodTop) + '"/>'
                + '<path d="M' + (-w / 2) + ' ' + (h / 2) + 'H' + (w / 2) + '" stroke="#d4af37" stroke-width="0.8"/>';
            s += '<circle cx="' + (-w / 4) + '" cy="0" r="1.6" fill="#333"/><circle cx="' + (w / 4) + '" cy="0" r="1.6" fill="#333"/><rect x="-6" y="-3" width="12" height="5" rx="1" fill="#222"/>';
            if (o.night) s += '<ellipse cx="0" cy="2" rx="' + r2(w * 0.45) + '" ry="' + r2(h * 0.6) + '" fill="url(#neon)"/>';
            return s;
        },
        stall: function (w, h, o) {
            var s = shadow(w, h, 0.8), n = 6, sw = w / n;
            for (var i = 0; i < n; i++) s += '<rect x="' + r2(-w / 2 + i * sw) + '" y="' + (-h / 2) + '" width="' + r2(sw + 0.05) + '" height="' + h + '" fill="' + (i % 2 ? '#f4efe4' : o.accent) + '"/>';
            return s + '<path d="M' + (-w / 2) + ' ' + (h / 2) + 'H' + (w / 2) + '" stroke="#000" stroke-width="0.6" opacity="0.35"/>';
        },
        bench: function (w, h, o) {
            var s = shadow(w, h, 0.6);
            for (var i = 0; i < 3; i++) s += '<rect x="' + (-w / 2) + '" y="' + r2(-h / 2 + i * h / 3) + '" width="' + w + '" height="' + r2(h / 3 - 0.4) + '" rx="0.4" fill="' + (i % 2 ? o.woodTop : o.wood) + '"/>';
            return s;
        },
        fireplace: function (w, h, o) {
            return shadow(w, h, 0.6) + '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="0.6" fill="#8b857c"/>'
                + '<rect x="' + (-w / 2 + 5) + '" y="' + (-h / 2 + 1.5) + '" width="' + (w - 10) + '" height="' + (h - 3) + '" fill="#2a1a12"/>'
                + '<ellipse cx="0" cy="0.6" rx="' + r2(w * 0.22) + '" ry="1.8" fill="#ff9a3c"/><ellipse cx="0" cy="0.4" rx="' + r2(w * 0.1) + '" ry="1" fill="#ffe08a"/>';
        },
        water: function (w, h, o) {
            return '<ellipse cx="0.9" cy="1.4" rx="' + (w / 2) + '" ry="' + (h / 2) + '" fill="#000" opacity="0.15"/><ellipse rx="' + (w / 2) + '" ry="' + (h / 2) + '" fill="#bfb8a8"/><ellipse rx="' + (w / 2 - 2) + '" ry="' + (h / 2 - 2) + '" fill="url(#wat)"/>'
                + '<path d="M' + r2(-w * 0.25) + ' -2 q4 -1.5 8 0 t8 0M' + r2(-w * 0.05) + ' 4 q4 -1.5 8 0 t8 0" stroke="#fff" stroke-width="0.35" fill="none" opacity="0.6"/>';
        },
        screen: function (w, h, o) {
            return shadow(w, h, 0.4) + '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="0.4" fill="#1d2430"/><rect x="' + (-w / 2 + 0.8) + '" y="' + (-h / 2 + 0.8) + '" width="' + (w - 1.6) + '" height="' + (h - 1.6) + '" fill="#5fb3d9" opacity="0.8"/>'
                + '<ellipse cx="0" cy="' + (h / 2 + 4) + '" rx="' + r2(w * 0.4) + '" ry="5" fill="#5fb3d9" opacity="0.12"/>';
        },
        machine: function (w, h, o) {
            return shadow(w, h, 0.8) + '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="0.8" fill="#c8cfd6"/><rect x="' + (-w / 2 + 1.2) + '" y="' + (-h / 2 + 1.2) + '" width="' + (w - 2.4) + '" height="' + r2(h * 0.4) + '" rx="0.4" fill="#2f5e7a"/>'
                + '<circle cx="' + r2(w / 2 - 2.5) + '" cy="' + r2(h / 2 - 2.2) + '" r="0.9" fill="#e05050"/><circle cx="' + r2(w / 2 - 5) + '" cy="' + r2(h / 2 - 2.2) + '" r="0.9" fill="#50c070"/>';
        },
        piano: function (w, h, o) {
            var s = shadow(w, h, 2) + '<path d="M' + (-w / 2) + ' ' + (-h / 2) + 'H' + (w / 2) + 'V' + r2(h * 0.1) + 'Q' + (w / 2) + ' ' + (h / 2) + ' ' + r2(w * 0.1) + ' ' + (h / 2) + 'H' + (-w / 2) + 'Z" fill="#161616"/>';
            s += '<rect x="' + (-w / 2 + 1) + '" y="' + (-h / 2 + 0.8) + '" width="' + r2(w * 0.8) + '" height="2" fill="#f5f5f0"/>';
            for (var i = 0; i < 10; i++) s += '<rect x="' + r2(-w / 2 + 1.8 + i * w * 0.08) + '" y="' + (-h / 2 + 0.8) + '" width="0.6" height="1.2" fill="#111"/>';
            return s + chairAt(-w / 4, -h / 2 - 3, 0, '#222');
        },
        crate: function (w, h, o) {
            var s = '';
            [[-3.5, -2.5, 7], [3.2, 1.5, 6.5], [-2, 3.8, 5.5]].forEach(function (c) {
                s += '<g transform="translate(' + c[0] + ' ' + c[1] + ') rotate(' + r2(o.rng() * 20 - 10) + ')">' + shadow(c[2], c[2], 0.3) + '<rect x="' + (-c[2] / 2) + '" y="' + (-c[2] / 2) + '" width="' + c[2] + '" height="' + c[2] + '" fill="#b78a55" stroke="#7a5a35" stroke-width="0.5"/><path d="M' + (-c[2] / 2) + ' ' + (-c[2] / 2) + 'L' + (c[2] / 2) + ' ' + (c[2] / 2) + 'M' + (c[2] / 2) + ' ' + (-c[2] / 2) + 'L' + (-c[2] / 2) + ' ' + (c[2] / 2) + '" stroke="#7a5a35" stroke-width="0.4"/></g>';
            });
            return s;
        },
        board: function (w, h, o) {
            var s = shadow(w, h, 0.4) + '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="0.4" fill="#9a6a3d"/>';
            for (var i = 0; i < 5; i++) s += '<rect x="' + r2(-w / 2 + 1.5 + i * (w - 3) / 5) + '" y="' + r2(-h / 2 + 0.6) + '" width="' + r2((w - 3) / 5 - 0.8) + '" height="' + r2(h - 1.2) + '" fill="' + (i % 2 ? '#f6f0dc' : '#fff8e8') + '" transform="rotate(' + r2(o.rng() * 8 - 4) + ')"/>';
            return s;
        },
        statue: function (w, h, o) {
            return shadow(w, h, 1) + '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="1" fill="#b8b2a6" stroke="#8f887b" stroke-width="0.6"/>'
                + '<circle r="' + r2(w * 0.28) + '" fill="#d8d3c8"/><circle cy="' + r2(-w * 0.05) + '" r="' + r2(w * 0.12) + '" fill="#e8e4db"/>';
        },
        car: function (w, h, o) {
            return shadow(w, h, 4) + '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="4" fill="' + o.accent + '"/>'
                + '<rect x="' + r2(-w * 0.18) + '" y="' + r2(-h / 2 + 1.5) + '" width="' + r2(w * 0.42) + '" height="' + (h - 3) + '" rx="2" fill="#26313d"/><rect x="' + r2(-w * 0.14) + '" y="' + r2(-h / 2 + 2.5) + '" width="' + r2(w * 0.34) + '" height="' + (h - 5) + '" rx="1.5" fill="' + o.accent + '"/>'
                + '<rect x="' + r2(w / 2 - 2) + '" y="' + r2(-h / 2 + 1.5) + '" width="1.2" height="2.5" fill="#fff6c8"/><rect x="' + r2(w / 2 - 2) + '" y="' + r2(h / 2 - 4) + '" width="1.2" height="2.5" fill="#fff6c8"/>';
        },
        lamp: function (w, h, o) { return '<circle r="9" fill="url(#glow)"/>' + cshadow(2) + '<circle r="2" fill="#f7e7b8" stroke="#8a7a50" stroke-width="0.4"/>'; },
        ring: function (w, h, o) {
            var s = shadow(w, h, 1) + '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="1" fill="#2f4f86"/><rect x="' + (-w / 2 + 3) + '" y="' + (-h / 2 + 3) + '" width="' + (w - 6) + '" height="' + (h - 6) + '" fill="#e9e6de"/>';
            for (var i = 0; i < 3; i++) { var k = 3.4 + i * 1.1; s += '<rect x="' + r2(-w / 2 + k) + '" y="' + r2(-h / 2 + k) + '" width="' + r2(w - 2 * k) + '" height="' + r2(h - 2 * k) + '" fill="none" stroke="' + (i === 1 ? '#fff' : '#c83a3a') + '" stroke-width="0.45"/>'; }
            [[-1, -1, '#c83a3a'], [1, 1, '#2f5fb8'], [1, -1, '#ddd'], [-1, 1, '#ddd']].forEach(function (c) { s += '<rect x="' + r2(c[0] * (w / 2 - 3) - 1.6) + '" y="' + r2(c[1] * (h / 2 - 3) - 1.6) + '" width="3.2" height="3.2" fill="' + c[2] + '"/>'; });
            return s;
        },
        rug: function (w, h, o) {
            return '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="1" fill="' + o.accent + '" opacity="0.85"/><rect x="' + (-w / 2 + 2) + '" y="' + (-h / 2 + 2) + '" width="' + (w - 4) + '" height="' + (h - 4) + '" rx="0.6" fill="none" stroke="#f3e6c8" stroke-width="0.5" opacity="0.7"/>';
        },
        pillar: function (w, h, o) { return cshadow(w / 2) + '<circle r="' + (w / 2) + '" fill="#dcd6ca" stroke="#a8a092" stroke-width="0.6"/><circle r="' + r2(w / 2 - 1.5) + '" fill="none" stroke="#fff" stroke-width="0.3" opacity="0.6"/>'; },
        spot: function (w, h, o) { return cshadow(w / 2 - 1) + '<circle r="' + (w / 2 - 1) + '" fill="' + o.woodTop + '" stroke="' + o.wood + '" stroke-width="0.6"/><circle r="' + r2(w / 4) + '" fill="' + o.accent + '" opacity="0.7"/>'; }
    };

    // ---------- 排位 ----------
    var POS9 = { '左上': [0, 0], '上': [1, 0], '右上': [2, 0], '左': [0, 1], '中': [1, 1], '右': [2, 1], '左下': [0, 2], '下': [1, 2], '右下': [2, 2] };
    function layout(items, indoor) {
        var inner = indoor ? WALL + 2 : 7;
        var colX = [VW * 0.18, VW * 0.5, VW * 0.82], rowY = [VH * 0.26, VH * 0.5, VH * 0.72];
        var byCell = {};
        var out = items.map(function (it, i) {
            var k = KINDS[it.kind] ? it.kind : 'spot', sz = KINDS[k];
            var S = (k === 'ring' || k === 'water' || k === 'stage' || k === 'fountain') ? 1.1 : 1.3;   // 房間 2:1 很寬，家具放大一點才不空
            var o = { kind: k, label: it.label || '', desc: it.desc || '', w: r2(sz.w * S), h: r2(sz.h * S), rot: 0, i: i };
            if (typeof it.x === 'number' && typeof it.y === 'number') { o.x = it.x / 100 * VW; o.y = it.y / 100 * VH; }
            else { var c = POS9[it.pos] || POS9['中']; o.col = c[0]; o.row = c[1]; o.x = colX[c[0]]; o.y = rowY[c[1]]; var key = c.join(','); (byCell[key] = byCell[key] || []).push(o); }
            return o;
        });
        // 同一格多件：沿著長邊攤開
        Object.keys(byCell).forEach(function (key) {
            var g = byCell[key]; if (g.length < 2) return;
            var horiz = g[0].col === 1 || g[0].row !== 1;
            var step = horiz ? Math.min(34, VW * 0.3 / (g.length - 1) + 12) : Math.min(22, VH * 0.4 / (g.length - 1) + 8);
            g.forEach(function (o, j) { var off = (j - (g.length - 1) / 2) * step; if (horiz) o.x += off; else o.y += off; });
        });
        // 貼牆：會貼牆的東西靠近哪面牆就貼上去、長邊順著牆
        out.forEach(function (o) {
            if (!KINDS[o.kind].wall || !indoor) return;
            var dT = o.y, dL = o.x / 2, dR = (VW - o.x) / 2;   // 左右牆用一半權重，畫布是 2:1
            var m = Math.min(dT, dL, dR);
            if (m > 34) return;
            if (m === dT) { o.y = inner + o.h / 2; }
            else if (m === dL) { o.rot = -90; o.x = inner + o.h / 2; }   // 正面（本地 +y）朝房間裡
            else { o.rot = 90; o.x = VW - inner - o.h / 2; }
        });
        // 推開重疊＋夾在牆內、門口讓開
        function box(o) { var vert = Math.abs(o.rot) === 90; return { hw: (vert ? o.h : o.w) / 2 + 3, hh: (vert ? o.w : o.h) / 2 + 3 }; }
        for (var it = 0; it < 40; it++) {
            for (var a = 0; a < out.length; a++) for (var b = a + 1; b < out.length; b++) {
                var A = out[a], B = out[b], ba = box(A), bb = box(B);
                var dx = B.x - A.x, dy = B.y - A.y, ox = ba.hw + bb.hw - Math.abs(dx), oy = ba.hh + bb.hh - Math.abs(dy);
                if (ox > 0 && oy > 0) {
                    var aw = A.rot && KINDS[A.kind].wall ? 0 : 1, bw = B.rot && KINDS[B.kind].wall ? 0 : 1;   // 貼側牆的不橫推
                    if (ox / VW < oy / VH) { var sx = (dx >= 0 ? 1 : -1) * ox / 2; A.x -= sx * (aw || 0.2); B.x += sx * (bw || 0.2); }
                    else { var sy = (dy >= 0 ? 1 : -1) * oy / 2; A.y -= sy; B.y += sy; }
                }
            }
            out.forEach(function (o) {
                var bx = box(o);
                o.x = Math.max(inner + bx.hw - 3, Math.min(VW - inner - bx.hw + 3, o.x));
                o.y = Math.max(inner + bx.hh - 3, Math.min(VH - inner - bx.hh + 3, o.y));
                if (Math.abs(o.x - VW / 2) < 13 + bx.hw && o.y + bx.hh > VH - 16) o.y = VH - 16 - bx.hh;   // 門口留路
            });
        }
        return out;
    }

    function paint(plan) {
        var seed = hashStr((plan.name || '') + '|' + (plan.seed || 0));
        var rng = rngOf(seed);
        var f = FLOORS[plan.floor] ? plan.floor : 'wood', p = FLOORS[f];
        var night = !!plan.night;
        var accent = FABRIC[Math.floor(rng() * FABRIC.length)];
        var dark = f === 'dark_wood' || night;
        var o = { rng: rng, night: night, accent: accent, wood: dark ? '#3a2618' : '#8a5a36', woodTop: dark ? '#5a3c28' : '#b98552' };
        var items = layout(plan.items || [], plan.indoor !== false);
        // 自動點綴：室內角落補盆栽；桌子群下面補地毯
        var extra = [];
        if (plan.indoor !== false) {
            var corners = [[WALL + 6, WALL + 6], [VW - WALL - 6, WALL + 6], [WALL + 6, VH - WALL - 6], [VW - WALL - 6, VH - WALL - 6]];
            corners.forEach(function (c) { if (rng() < 0.6 && !items.some(function (it) { return Math.abs(it.x - c[0]) < 18 && Math.abs(it.y - c[1]) < 14; })) extra.push({ kind: 'plant', x: c[0], y: c[1], w: 9, h: 9, rot: 0 }); });
        }
        var tables = items.filter(function (it) { return it.kind === 'table' || it.kind === 'round_table' || (it.kind === 'sofa' && !it.rot && it.y > VH * 0.3); });
        var rugs = '';
        if (tables.length && f !== 'carpet' && f !== 'grass' && f !== 'sand') {
            var t0 = tables[0];
            rugs = '<g transform="translate(' + r2(t0.x) + ' ' + r2(t0.y) + ')">' + DRAW.rug(Math.max(t0.w, 30) + 12, Math.max(t0.h, 18) + 12, o) + '</g>';
        }
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VW + ' ' + VH + '" preserveAspectRatio="none">';
        svg += '<defs>' + floorDefs(f, plan.name, rng) + '</defs>';
        svg += drawFloor(f, rng) + rugs;
        if (plan.indoor === false) svg += drawOutdoorEdge(rng);
        // 大件先畫（地上的先、會被踩在下面的先）
        var order = ['water', 'ring', 'stage', 'rug', 'fountain', 'car'];
        var all = items.concat(extra).sort(function (a, b) { return (order.indexOf(b.kind) >= 0) - (order.indexOf(a.kind) >= 0) || a.y - b.y; });
        all.forEach(function (it) {
            svg += '<g transform="translate(' + r2(it.x) + ' ' + r2(it.y) + ') rotate(' + (it.rot || 0) + ')">' + DRAW[it.kind](it.w, it.h, o) + '</g>';
        });
        if (night) {   // 夜：先整片壓暗，再在會發光的東西前面補一圈暖光（往房間裡偏，不照進牆）
            svg += '<rect width="' + VW + '" height="' + VH + '" fill="#0b0d24" opacity="0.42"/>';
            items.forEach(function (it) {
                if (it.kind !== 'counter' && it.kind !== 'lamp' && it.kind !== 'stall') return;
                var a = (it.rot || 0) * Math.PI / 180, fx = -Math.sin(a) * 9, fy = Math.cos(a) * 9;
                var vert = Math.abs(it.rot) === 90, rw = (vert ? it.h : it.w) * 0.6 + 8, rh = (vert ? it.w : it.h) * 0.6 + 8;
                svg += '<ellipse cx="' + r2(it.x + fx) + '" cy="' + r2(it.y + fy) + '" rx="' + r2(rw) + '" ry="' + r2(rh) + '" fill="url(#glow)"/>';
            });
        }
        svg += drawWalls(p, plan.indoor !== false, rng);
        svg += '<rect width="' + VW + '" height="' + VH + '" fill="url(#vig)"/>';
        svg += '</svg>';
        return { svg: svg, items: items };
    }
    // SVG → data URL：只跳脫必要字元。🚨 單引號一定要跳（%27）：map_core 套背景是 url('…')，出現 ' 整條背景失效。
    function toDataUrl(svg) {
        const body = String(svg).replace(/\s+/g, ' ')
            .replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/'/g, '%27')
            .replace(/[^ -~]/gu, function (c) { return encodeURIComponent(c); });
        return 'data:image/svg+xml,' + body;
    }
    // 地面中文名 → 代號（模型寫中文地面時用）
    function floorKey(v) {
        const g = String(v || '').trim();
        if (FLOORS[g]) return g;
        if (FLOOR_ALIAS[g]) return FLOOR_ALIAS[g];
        const hit = Object.keys(FLOOR_ALIAS).find(function (k) { return g.indexOf(k) >= 0; });
        return hit ? FLOOR_ALIAS[hit] : '';
    }

    win.SCENE_PAINTER = {
        paint: paint, toDataUrl: toDataUrl, guessKind: guessKind, guessGround: guessGround, floorKey: floorKey,
        KINDS: Object.keys(KINDS).filter(function (k) { return k !== 'spot'; }),
        FLOOR_NAMES: Object.keys(FLOORS).map(function (k) { return FLOORS[k].name; }),
        VW: VW, VH: VH
    };
    if (win !== window) window.SCENE_PAINTER = win.SCENE_PAINTER;
})();
