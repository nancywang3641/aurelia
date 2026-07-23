// ----------------------------------------------------------------
// [檔案] os_room_svg.js
// 路徑：os_phone/os/os_room_svg.js
// 職責：純幾何 SVG 房間產生器。依 spec(寬/深/牆高/地板/窗) 算出房間 SVG，
//       並回傳地板碰撞多邊形。無相依、純函式，可被包租婆/城市/實驗台共用。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    // ============================================================
    // SVG 房間幾何模組
    // makeRoom(spec) → { svg, floor 地板碰撞多邊形, viewBox }；pointInPolygon；
    // rasterizeSvg（SVG→PNG 當母圖）；polyMaskDataUrl（地板→白遮罩）。
    // ============================================================
    var SVGROOM = (function () {
        var FLOORS = {
            oak:      { top: '#c88f52', bot: '#d9a869', line: '#a9743c', plank: true },
            walnut:   { top: '#6f4a2f', bot: '#875f3f', line: '#4a3020', plank: true },
            greywash: { top: '#9a978f', bot: '#b6b3aa', line: '#7d7a72', plank: true },
            tile:     { top: '#d6d6da', bot: '#e6e6ea', line: '#bcbcc4', tile: true },
            carpet:   { top: '#5f906f', bot: '#6fa079', line: null }
        };
        function _sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
        function _add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
        function _mul(a, s) { return [a[0] * s, a[1] * s]; }
        function _len(a) { return Math.hypot(a[0], a[1]); }
        function _norm(a) { var l = _len(a) || 1; return [a[0] / l, a[1] / l]; }
        function _f(n) { return Math.round(n * 100) / 100; }
        function _lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
        function _v3sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
        function _v3dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
        function _v3cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
        function _v3nrm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

        function _roundPath(pts, r) {
            var n = pts.length, d = '';
            for (var i = 0; i < n; i++) {
                var prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
                var v1 = _norm(_sub(prev, cur)), v2 = _norm(_sub(next, cur));
                var rr = Math.min(r, _len(_sub(prev, cur)) / 2, _len(_sub(next, cur)) / 2);
                var p1 = _add(cur, _mul(v1, rr)), p2 = _add(cur, _mul(v2, rr));
                d += (i === 0 ? 'M ' + _f(p1[0]) + ' ' + _f(p1[1]) + ' ' : 'L ' + _f(p1[0]) + ' ' + _f(p1[1]) + ' ');
                d += 'Q ' + _f(cur[0]) + ' ' + _f(cur[1]) + ' ' + _f(p2[0]) + ' ' + _f(p2[1]) + ' ';
            }
            return d + 'Z';
        }
        function _polyPath(pts) { return 'M ' + pts.map(function (p) { return _f(p[0]) + ' ' + _f(p[1]); }).join(' L ') + ' Z'; }

        var UIDN = 0;
        // spec: { w, d, wallH, floor, window } → { svg, floor:[[x,y]x4], viewBox:[w,h] }
        function makeRoom(spec) {
            var w = spec.w, d = spec.d, WALLH = spec.wallH == null ? 0.92 : spec.wallH;
            var FL = FLOORS[spec.floor] || FLOORS.oak;
            var hasWin = spec.window !== false;
            var UID = 'k' + (++UIDN);
            var FOC = 7.0, SC = 150, FRONTH = 0.20, E = 0.16, PILLAR = 0.17, NOTCHW = 0.52;
            var CAMH = 4.2, CAMZ = -3.2, CTRY = 0.2;
            var Cam = [0, CAMH, CAMZ], Ctr = [0, CTRY, d / 2];
            var fwd = _v3nrm(_v3sub(Ctr, Cam));
            var right = _v3nrm(_v3cross([0, 1, 0], fwd));
            var up = _v3cross(fwd, right);
            function P(x, y, z) {
                var rel = _v3sub([x, y, z], Cam);
                return [FOC * _v3dot(rel, right) / _v3dot(rel, fwd) * SC, -FOC * _v3dot(rel, up) / _v3dot(rel, fwd) * SC];
            }
            var L = -w / 2, R = w / 2;
            var oFL0 = P(L, 0, 0), oFR0 = P(R, 0, 0);
            var oFLt = P(L, FRONTH, 0), oFRt = P(R, FRONTH, 0), oBRt = P(R, WALLH, d), oBLt = P(L, WALLH, d);
            var iL = L + E, iR = R - E, iF = E, iB = d - E;
            var fFL = P(iL, 0, iF), fFR = P(iR, 0, iF), fBR = P(iR, 0, iB), fBL = P(iL, 0, iB);
            var iFLt = P(iL, FRONTH, iF), iFRt = P(iR, FRONTH, iF), iBRt = P(iR, WALLH, iB), iBLt = P(iL, WALLH, iB);
            var allp = [oFL0, oFR0, oFLt, oFRt, oBRt, oBLt, fFL, fFR, fBR, fBL, iFLt, iFRt, iBRt, iBLt];
            var mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
            allp.forEach(function (p) { mnx = Math.min(mnx, p[0]); mny = Math.min(mny, p[1]); mxx = Math.max(mxx, p[0]); mxy = Math.max(mxy, p[1]); });
            var PAD = 34, ox = -mnx + PAD, oy = -mny + PAD;
            function g(p) { return [p[0] + ox, p[1] + oy]; }
            var vbW = (mxx - mnx) + PAD * 2, vbH = (mxy - mny) + PAD * 2;
            var floorPoly = [g(fFL), g(fFR), g(fBR), g(fBL)];
            // 內部輪廓（地板＋三面牆內面）：inpaint 白區用，只排除邊框與外面黑區
            var interiorPoly = [g(iFLt), g(iBLt), g(iBRt), g(iFRt), g(fFR), g(fFL)];
            var segs = [[L, -(PILLAR + NOTCHW)], [-PILLAR, PILLAR], [(PILLAR + NOTCHW), R]]
                .map(function (s) { return [Math.max(L, Math.min(R, s[0])), Math.max(L, Math.min(R, s[1]))]; })
                .filter(function (s) { return s[1] - s[0] > 0.02; });
            var floorLines = '';
            if (FL.plank) {
                var NP = Math.max(4, Math.round(d * 3));
                for (var i = 1; i < NP; i++) { var t = i / NP, a = g(_lerp(fFL, fBL, t)), b = g(_lerp(fFR, fBR, t)); floorLines += '<line x1="' + _f(a[0]) + '" y1="' + _f(a[1]) + '" x2="' + _f(b[0]) + '" y2="' + _f(b[1]) + '" stroke="' + FL.line + '" stroke-width="1.4" stroke-opacity="0.5"/>'; }
            } else if (FL.tile) {
                var NPy = Math.max(3, Math.round(d * 2.2)), NPx = Math.max(3, Math.round(w * 2.2));
                for (var yi = 1; yi < NPy; yi++) { var ty = yi / NPy, ya = g(_lerp(fFL, fBL, ty)), yb = g(_lerp(fFR, fBR, ty)); floorLines += '<line x1="' + _f(ya[0]) + '" y1="' + _f(ya[1]) + '" x2="' + _f(yb[0]) + '" y2="' + _f(yb[1]) + '" stroke="' + FL.line + '" stroke-width="1.2" stroke-opacity="0.5"/>'; }
                for (var xi = 1; xi < NPx; xi++) { var tx = xi / NPx, xa = g(_lerp(fFL, fFR, tx)), xb = g(_lerp(fBL, fBR, tx)); floorLines += '<line x1="' + _f(xa[0]) + '" y1="' + _f(xa[1]) + '" x2="' + _f(xb[0]) + '" y2="' + _f(xb[1]) + '" stroke="' + FL.line + '" stroke-width="1.2" stroke-opacity="0.5"/>'; }
            }
            var backWall = _roundPath([g(fBL), g(fBR), g(iBRt), g(iBLt)], 9);
            var leftWall = _roundPath([g(fFL), g(fBL), g(iBLt), g(iFLt)], 9);
            var rightWall = _roundPath([g(fFR), g(fBR), g(iBRt), g(iFRt)], 9);
            var floorD = _polyPath(floorPoly);
            var rimBack = _roundPath([g(iBLt), g(iBRt), g(oBRt), g(oBLt)], 6);
            var rimLeft = _roundPath([g(iFLt), g(iBLt), g(oBLt), g(oFLt)], 6);
            var rimRight = _roundPath([g(iFRt), g(iBRt), g(oBRt), g(oFRt)], 6);
            var lipTops = '', lipFronts = '';
            segs.forEach(function (s) {
                var a = s[0], b = s[1];
                var itA = P(a, FRONTH, iF), itB = P(b, FRONTH, iF), otA = P(a, FRONTH, 0), otB = P(b, FRONTH, 0), obA = P(a, 0, 0), obB = P(b, 0, 0);
                lipTops += '<path d="' + _roundPath([g(itA), g(itB), g(otB), g(otA)], 5) + '" fill="url(#gRim' + UID + ')"/>';
                lipFronts += '<path d="' + _roundPath([g(otA), g(otB), g(obB), g(obA)], 5) + '" fill="url(#gLipF' + UID + ')"/>';
            });
            var windowSvg = '';
            if (hasWin) {
                var bl = g(fBL), br = g(fBR), tl = g(iBLt), tr = g(iBRt);
                var at = function (u, v) { var bot = _lerp(bl, br, u), top = _lerp(tl, tr, u); return _lerp(bot, top, v); };
                var wq = [at(0.28, 0.42), at(0.72, 0.42), at(0.72, 0.86), at(0.28, 0.86)];
                var mv = [at(0.5, 0.42), at(0.5, 0.86)], mh = [at(0.28, 0.64), at(0.72, 0.64)];
                windowSvg = '<path d="' + _polyPath(wq) + '" fill="url(#gWin' + UID + ')" stroke="#f4f1ea" stroke-width="3"/>'
                    + '<line x1="' + _f(mv[0][0]) + '" y1="' + _f(mv[0][1]) + '" x2="' + _f(mv[1][0]) + '" y2="' + _f(mv[1][1]) + '" stroke="#f4f1ea" stroke-width="2.4"/>'
                    + '<line x1="' + _f(mh[0][0]) + '" y1="' + _f(mh[0][1]) + '" x2="' + _f(mh[1][0]) + '" y2="' + _f(mh[1][1]) + '" stroke="#f4f1ea" stroke-width="2.4"/>';
            }
            var cx = (g(oFL0)[0] + g(oFR0)[0]) / 2, cyb = Math.max(g(oFL0)[1], g(oFR0)[1]);
            var shW = _len(_sub(g(oFL0), g(oFR0))) * 0.6, shH = shW * 0.14;
            var svg = '<svg viewBox="0 0 ' + _f(vbW) + ' ' + _f(vbH) + '" xmlns="http://www.w3.org/2000/svg">'
                + '<defs>'
                + '<linearGradient id="gBack' + UID + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4efe6"/><stop offset="1" stop-color="#ddd6c9"/></linearGradient>'
                + '<linearGradient id="gSideL' + UID + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d8d1c4"/><stop offset="1" stop-color="#ece6db"/></linearGradient>'
                + '<linearGradient id="gSideR' + UID + '" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#d8d1c4"/><stop offset="1" stop-color="#ece6db"/></linearGradient>'
                + '<linearGradient id="gRim' + UID + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#faf7f0"/><stop offset="1" stop-color="#ece5d8"/></linearGradient>'
                + '<linearGradient id="gLipF' + UID + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eae2d3"/><stop offset="1" stop-color="#ddd3c1"/></linearGradient>'
                + '<linearGradient id="gFloor' + UID + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + FL.top + '"/><stop offset="1" stop-color="' + FL.bot + '"/></linearGradient>'
                + '<linearGradient id="gWin' + UID + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#aecbe0"/><stop offset="1" stop-color="#dfeaf1"/></linearGradient>'
                + '<radialGradient id="gAO' + UID + '" cx="0.5" cy="0.42" r="0.72"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.22"/></radialGradient>'
                + '<filter id="soft' + UID + '" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="8"/></filter>'
                + '<clipPath id="clipFloor' + UID + '"><path d="' + floorD + '"/></clipPath>'
                + '</defs>'
                + '<ellipse cx="' + _f(cx) + '" cy="' + _f(cyb - 3) + '" rx="' + _f(shW) + '" ry="' + _f(shH) + '" fill="#000" opacity="0.20" filter="url(#soft' + UID + ')"/>'
                + '<path d="' + rimBack + '" fill="url(#gRim' + UID + ')"/>'
                + '<path d="' + rimLeft + '" fill="url(#gRim' + UID + ')"/>'
                + '<path d="' + rimRight + '" fill="url(#gRim' + UID + ')"/>'
                + '<path d="' + backWall + '" fill="url(#gBack' + UID + ')"/>'
                + windowSvg
                + '<path d="' + leftWall + '" fill="url(#gSideL' + UID + ')"/>'
                + '<path d="' + rightWall + '" fill="url(#gSideR' + UID + ')"/>'
                + '<g clip-path="url(#clipFloor' + UID + ')">'
                + '<path d="' + floorD + '" fill="url(#gFloor' + UID + ')"/>'
                + floorLines
                + '<rect x="0" y="0" width="' + _f(vbW) + '" height="' + _f(vbH) + '" fill="url(#gAO' + UID + ')"/>'
                + '</g>'
                + lipFronts + lipTops
                + '</svg>';
            return { svg: svg, floor: floorPoly, interior: interiorPoly, viewBox: [_f(vbW), _f(vbH)] };
        }

        function pointInPolygon(pt, poly) {
            var inside = false;
            for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
                if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
            }
            return inside;
        }

        function parseSpec(raw) {
            var t = String(raw || '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').replace(/```(?:[a-z]+)?/gi, '').replace(/```/g, '').trim();
            var m = t.match(/<room-spec>([\s\S]*?)<\/room-spec>/i);
            var body = m ? m[1] : t;
            var jm = body.match(/\{[\s\S]*\}/);
            if (!jm) throw new Error('副模型沒有回傳房規格 JSON，請再按一次。');
            var o = JSON.parse(jm[0]);
            var w = Math.max(1.6, Math.min(8, parseFloat(o.w)));
            var d = Math.max(1.4, Math.min(6, parseFloat(o.d)));
            var wallH = Math.max(0.5, Math.min(1.7, parseFloat(o.wallH != null ? o.wallH : 0.92)));
            var floor = FLOORS[o.floor] ? o.floor : 'oak';
            var win = !(o.window === false || o.window === 'false' || o.window === 0);
            if (!(w > 0) || !(d > 0)) throw new Error('房規格數值無效，請再按一次。');
            return { w: w, d: d, wallH: wallH, floor: floor, window: win };
        }

        function rasterizeSvg(svg, w, h) {
            return new Promise(function (resolve, reject) {
                var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
                var img = new win.Image();
                img.onload = function () {
                    var cv = win.document.createElement('canvas'); cv.width = w; cv.height = h;
                    cv.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(cv.toDataURL('image/png'));
                };
                img.onerror = function () { reject(new Error('SVG 轉圖失敗')); };
                img.src = url;
            });
        }
        function polyMaskDataUrl(poly, viewBox, w, h) {
            var cv = win.document.createElement('canvas'); cv.width = w; cv.height = h;
            var cx = cv.getContext('2d');
            cx.fillStyle = '#000'; cx.fillRect(0, 0, w, h);
            cx.fillStyle = '#fff'; cx.beginPath();
            poly.forEach(function (p, i) { var x = p[0] / viewBox[0] * w, y = p[1] / viewBox[1] * h; if (i === 0) cx.moveTo(x, y); else cx.lineTo(x, y); });
            cx.closePath(); cx.fill();
            return cv.toDataURL('image/png');
        }

        return {
            makeRoom: makeRoom,
            pointInPolygon: pointInPolygon,
            parseSpec: parseSpec,
            rasterizeSvg: rasterizeSvg,
            polyMaskDataUrl: polyMaskDataUrl
        };
    })();

    // ============================================================
    // 房型清單：給呼叫端「挑一個」而不是自己寫數字（挑選比生成數字可靠，差距才拉得開）。
    // 每型的寬深牆高地板都寫死、差距拉到極端。
    // ============================================================
    var ROOM_TYPES = {
        studio_small: { w: 2.2, d: 2.0, wallH: 0.7,  floor: 'carpet',   label: '蝸居小套房', desc: '清貧／學生／租屋／極簡苦行 → 又小又矮的小套房' },
        snug:         { w: 3.4, d: 3.0, wallH: 0.85, floor: 'oak',      label: '溫馨暖窩',   desc: '慵懶／居家／宅／怕冷 → 小而軟的溫馨窩' },
        cozy:         { w: 3.6, d: 3.2, wallH: 0.95, floor: 'walnut',   label: '樸實獨居',   desc: '一般單身上班族／樸實務實 → 中小型居家' },
        standard:     { w: 4.2, d: 4.0, wallH: 1.0,  floor: 'oak',      label: '標準方正',   desc: '真的沒明顯特徵、中規中矩才選這個' },
        wide:         { w: 6.4, d: 3.0, wallH: 1.05, floor: 'oak',      label: '開闊寬廳',   desc: '外向／社交／愛熱鬧／開闊感 → 又寬又淺的大廳' },
        deep:         { w: 2.8, d: 5.4, wallH: 1.15, floor: 'walnut',   label: '深長書齋',   desc: '書房／研究／工作狂／內斂專注 → 又窄又深的長間' },
        lofty:        { w: 4.8, d: 3.8, wallH: 1.65, floor: 'greywash', label: '挑高設計宅', desc: '講究品味／設計師／冷調時尚 → 挑高、石灰調' },
        maker:        { w: 5.6, d: 4.8, wallH: 1.25, floor: 'greywash', label: '寬敞工作室', desc: '創作者／工程師／實驗狂／東西多 → 寬敞實用工坊' },
        grand:        { w: 7.8, d: 5.6, wallH: 1.7,  floor: 'tile',     label: '豪門大邸',   desc: '千金／豪門／權貴／極度奢華排場 → 巨大挑高、大理石' }
    };

    win.OS_ROOM_SVG = {
        ROOM_TYPES: ROOM_TYPES,
        makeRoom: SVGROOM.makeRoom,
        pointInPolygon: SVGROOM.pointInPolygon,
        rasterizeSvg: SVGROOM.rasterizeSvg,
        polyMaskDataUrl: SVGROOM.polyMaskDataUrl,
    };
    if (win !== window) { try { window.OS_ROOM_SVG = win.OS_ROOM_SVG; } catch (e) {} }
    console.log('[RoomSVG] 房間產生器已載入（' + Object.keys(ROOM_TYPES).length + ' 款房型）');
})();
