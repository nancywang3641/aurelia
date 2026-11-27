// ----------------------------------------------------------------
// [檔案] core/void/lobby_loom.js
// 職責：🎩 帽匠工坊的造物儀會動：四道環轉、七張全息小卡繞著光球轉。
//   11-20 Vproject 的丹把工坊整間畫成 SVG，造物儀另外拆成分層、做了「造物儀環繞.html」動效示範；這支照搬那支的算法。
//   做法：家具那張 img 換成底座（base），在同一個位置疊一層：後面的卡 → 後半環 → 光球 → 前半環 → 前面的卡。
//     環每一幀照 3D 參數重算前後半圈（算法＝Vproject src/c_loom.py 的 ring_point／ring_halves／ring_svg 的 JS 版），卡片沿各自的半徑、高度繞軸、永遠畫正面。
//     速度 0 那一刻＝原圖姿勢。系統開了「減少動態」就停在原圖姿勢；一秒畫 30 次。
//   擺設模式拖造物儀時跟著走（lobby_stage.js 的 placeObj 叫 place），家具被拿掉時一起拿掉。
//   原始檔、產生器在本機的 HATTER_WORKSHOP_SVG_LAB；數字從那邊的 rings.json、manifest.json 抄進來（拿掉說明欄）。
// 依賴：window.LobbyStage._b（resolveRef）；呼叫端：lobby_stage.js 的 _spawnObjEl（造物儀那件家具）
// ----------------------------------------------------------------
(function () {
    'use strict';
    const PART = (n) => ({ file: 'lobby_workshop_loom_' + n + '_v1.svg' });   // 素材庫 sound-files
    const RJ = {"back":["ring1","ring2","ring4","ring3"],"front":["ring2","ring4","ring3","ring1"],"rings":[{"id":"ring1","kind":"band","center":[399.0,312.5],"radius":384.0,"normal":[-0.04209,0.98897,-0.142],"width":31.0,"thickness":20.0,"style":{"outline":"#170d12","edge":"#e0a764","edge2":"#b97f45","wall_back":"#1c1626","grad":[140,500,300,520],"top":[[0,"#6a4a3c"],[0.4,"#4a3d55"],[0.75,"#5a4a68"],[1,"#8a7088"]],"wall":[[0,"#2a2236"],[1,"#40355e"]]},"beads":{"count":36,"radius":2.2,"color":"#120c14"}},{"id":"ring2","kind":"band","center":[428.8,296.1],"radius":311.7,"normal":[-0.10545,0.9941,0.02526],"width":22.0,"thickness":8.0,"style":{"outline":"#170d12","edge":"#e0a764","edge2":"#b97f45","wall_back":"#1c1626","grad":[110,480,300,490],"top":[[0,"#7a5236"],[0.35,"#3e3350"],[0.62,"#4a3e5c"],[0.85,"#c79a66"],[1,"#f0d4a8"]],"wall":[[0,"#2a2236"],[1,"#8a5a32"]]},"beads":{"count":24,"radius":2.0,"color":"#2a1a10"}},{"id":"ring3","kind":"gold","center":[440.5,275.8],"radius":254.7,"normal":[-0.43417,0.59731,0.67432],"width":15.0,"thickness":0.0,"style":{"outline":"#170d12","light":"#f7d08a","dark":"#7a4a22","grad":[20,560],"body":[[0,"#e8b06a"],[0.45,"#d8995a"],[1,"#b9783f"]]},"beads":{"count":16,"radius":3.4,"color":"#f2c070"}},{"id":"ring4","kind":"gold","center":[400.0,302.0],"radius":262.0,"normal":[-0.75924,0.45963,0.46075],"width":13.0,"thickness":0.0,"style":{"outline":"#170d12","light":"#f7d08a","dark":"#7a4a22","grad":[20,560],"body":[[0,"#e8b06a"],[0.45,"#d8995a"],[1,"#b9783f"]]},"beads":{"count":12,"radius":3.0,"color":"#f2c070"}}]};
    const MAN = {"K":0.572,"axis":404.0,"cards":[{"f":"screen1","c":[181.76,137.65],"r":[10.0,10.0,161.76,117.65],"R":428.8,"cy":308.7,"az":214.2},{"f":"screen2","c":[214.49,158.37],"r":[10.0,10.0,194.49,138.37],"R":482.1,"cy":338.0,"az":247.0},{"f":"screen3","c":[153.32,104.73],"r":[10.0,10.0,133.32,84.73],"R":378.4,"cy":281.0,"az":314.6},{"f":"screen4","c":[163.41,102.29],"r":[10.0,10.0,143.41,82.29],"R":394.3,"cy":306.7,"az":340.9},{"f":"screen5","c":[113.13,109.0],"r":[10.0,10.0,93.13,89.0],"R":428.3,"cy":476.3,"az":314.0},{"f":"screen6","c":[151.73,132.77],"r":[10.0,10.0,131.73,112.77],"R":370.1,"cy":331.5,"az":127.1},{"f":"screen7","c":[194.75,98.02],"r":[10.0,10.0,174.75,78.02],"R":386.4,"cy":376.4,"az":44.7}]};
    // 每道環怎麼動：直立金環的法向量繞垂直軸擺（precess，rad/s）；所有環的刻度沿環跑（spin，rad/s）——照示範頁
    const MOTION = { ring1: { spin: .10 }, ring2: { spin: -.16 }, ring3: { spin: .35, precess: .22 }, ring4: { spin: -.45, precess: -.30 } };
    const CARD_SPEED = .18, FPS = 30, OW = 5, W = 801, H = 900;
    const K = MAN.K, E = Math.asin(K), CE = Math.cos(E), SE = Math.sin(E);
    const NS = 'http://www.w3.org/2000/svg';

    // ── 3D 環（照示範頁）──
    const norm = v => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return v.map(c => c / n); };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    function basis(n) {
        n = norm(n);
        let a = [1, 0, 0]; let d = dot(a, n); a = a.map((x, i) => x - d * n[i]);
        if (Math.hypot(a[0], a[1], a[2]) < 1e-3) { a = [0, 0, 1]; d = dot(a, n); a = a.map((x, i) => x - d * n[i]); }
        a = norm(a); return [a, cross(n, a), n];
    }
    function pt(r, t, rad, off) {
        off = off || 0;
        const A = r._b[0], B = r._b[1], N = r._b[2], R = rad == null ? r.radius : rad;
        const p = [0, 1, 2].map(i => R * (Math.cos(t) * A[i] + Math.sin(t) * B[i]) + off * N[i]);
        return [r.center[0] + p[0], r.center[1] - p[1] * CE + p[2] * SE, p[1] * SE + p[2] * CE];
    }
    function halves(r) {
        const A = r._b[0], B = r._b[1], v = [0, SE, CE], f0 = Math.atan2(dot(B, v), dot(A, v));
        return { front: [f0 - Math.PI / 2, f0 + Math.PI / 2], back: [f0 + Math.PI / 2, f0 + 3 * Math.PI / 2] };
    }
    const fx = v => Math.round(v * 10) / 10;
    function arc(r, half, rad, off, n) {
        n = n || 40;
        const t0 = r._h[half][0], t1 = r._h[half][1], out = [];
        for (let i = 0; i <= n; i++) out.push(pt(r, t0 + (t1 - t0) * i / n, rad, off));
        return out;
    }
    function cr(p, move) {
        let d = (move === false ? ' L' : 'M') + fx(p[0][0]) + ',' + fx(p[0][1]);
        for (let i = 0; i < p.length - 1; i++) {
            const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
            d += ' C' + fx(p1[0] + (p2[0] - p0[0]) / 6) + ',' + fx(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + fx(p2[0] - (p3[0] - p1[0]) / 6) + ',' + fx(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + fx(p2[0]) + ',' + fx(p2[1]);
        }
        return d;
    }
    const band = (r, h, ro, ri, oo, oi) => cr(arc(r, h, ro, oo || 0)) + cr(arc(r, h, ri, oi || 0).reverse(), false) + ' Z';
    function beads(r, half) {
        const b = r.beads; if (!b) return [];
        const out = [];
        for (let k = 0; k < b.count; k++) { const t = r._spin + 2 * Math.PI * k / b.count; if ((pt(r, t)[2] > 0) === (half === 'front')) out.push(t); }
        return out;
    }
    function ringSvg(r, half, pre) {
        const st = r.style, R = r.radius, w = r.width, id = pre + r.id;
        let s = '<g fill="none" stroke-linejoin="round">';
        if (r.kind === 'gold') {
            const c = cr(arc(r, half));
            s += '<path d="' + c + '" stroke="' + st.outline + '" stroke-width="' + (w + OW) + '"/>';
            s += '<path d="' + c + '" stroke="url(#' + id + '-body)" stroke-width="' + w + '"/>';
            s += '<path d="' + cr(arc(r, half, R + w * .27)) + '" stroke="' + st.dark + '" stroke-width="' + fx(w * .28) + '" opacity=".75"/>';
            s += '<path d="' + cr(arc(r, half, R - w * .2)) + '" stroke="' + st.light + '" stroke-width="' + fx(w * .26) + '" opacity="' + (half === 'front' ? .95 : .55) + '"/>';
            const br = r.beads.radius;
            for (const t of beads(r, half)) {
                const q = pt(r, t);
                s += '<circle cx="' + fx(q[0]) + '" cy="' + fx(q[1]) + '" r="' + br + '" fill="' + r.beads.color + '" stroke="' + st.outline + '" stroke-width="1.6"/>';
                s += '<circle cx="' + fx(q[0] - br * .3) + '" cy="' + fx(q[1] - br * .3) + '" r="' + fx(br * .38) + '" fill="#fff3d0"/>';
            }
        } else {
            const ht = r.thickness, Ri = R - w;
            if (half === 'back') s += '<path d="' + band(r, half, Ri, Ri, 0, -ht) + '" fill="' + st.wall_back + '" stroke="' + st.outline + '" stroke-width="' + OW + '"/>';
            else {
                s += '<path d="' + band(r, half, R, R, 0, -ht) + '" fill="url(#' + id + '-wall)" stroke="' + st.outline + '" stroke-width="' + OW + '"/>';
                if (ht > 12) s += '<path d="' + cr(arc(r, half, R, -ht * .45)) + '" stroke="' + st.edge + '" stroke-width="2.2"/>';
            }
            s += '<path d="' + band(r, half, R, Ri) + '" fill="url(#' + id + '-top)" stroke="' + st.outline + '" stroke-width="' + OW + '"/>';
            s += '<path d="' + cr(arc(r, half, R - w * .5)) + '" stroke="#1b1522" stroke-width="' + fx(w * .17) + '" opacity=".6"/>';
            s += '<path d="' + cr(arc(r, half, R - 3.5)) + '" stroke="' + st.edge + '" stroke-width="2.8"/>';
            s += '<path d="' + cr(arc(r, half, Ri + 3.5)) + '" stroke="' + st.edge2 + '" stroke-width="2.2"/>';
            s += '<path d="' + cr(arc(r, half, R - w * .25)) + '" stroke="#8fb4ff" stroke-width="1.6" opacity=".4"/>';
            for (const t of beads(r, half)) {
                const p0 = pt(r, t, R - 5), p1 = pt(r, t, Ri + 5);
                s += '<path d="M' + fx(p0[0]) + ',' + fx(p0[1]) + ' L' + fx(p1[0]) + ',' + fx(p1[1]) + '" stroke="' + r.beads.color + '" stroke-width="' + r.beads.radius + '" stroke-linecap="round" opacity=".9"/>';
            }
        }
        return s + '</g>';
    }
    function ringDefs(r, pre) {
        const st = r.style, g = st.grad, id = pre + r.id;
        const stops = a => a.map(x => '<stop offset="' + x[0] + '" stop-color="' + x[1] + '"/>').join('');
        if (r.kind === 'gold') return '<linearGradient id="' + id + '-body" gradientUnits="userSpaceOnUse" x1="0" y1="' + g[0] + '" x2="0" y2="' + g[1] + '">' + stops(st.body) + '</linearGradient>';
        return '<linearGradient id="' + id + '-top" gradientUnits="userSpaceOnUse" x1="0" y1="' + g[0] + '" x2="0" y2="' + g[1] + '">' + stops(st.top) + '</linearGradient>' +
               '<linearGradient id="' + id + '-wall" gradientUnits="userSpaceOnUse" x1="0" y1="' + g[2] + '" x2="0" y2="' + g[3] + '">' + stops(st.wall) + '</linearGradient>';
    }
    function poseRing(r, sec) {
        const m = MOTION[r.id] || {};
        const th = (m.precess || 0) * sec, n0 = r._n0;
        const n = [n0[0] * Math.cos(th) + n0[2] * Math.sin(th), n0[1], -n0[0] * Math.sin(th) + n0[2] * Math.cos(th)];
        r._b = basis(n); r._h = halves(r);
        r._spin = (m.spin || 0) * sec;
    }
    function placeCard(c, az) {
        const s = Math.sin(az), co = Math.cos(az);
        const cx = MAN.axis + c.R * co, cy = c.cy + K * c.R * s;
        const front = s >= 0;
        const a = front ? s : -s, b = front ? -K * co : K * co, d = CE;   // 卡片畫布座標 → 801×900（跟 manifest 的 matrix 同一套）
        const u = c.mid[0], v = c.mid[1];
        const e = cx - a * u, f = cy - b * u - d * v;
        c.el.style.transform = 'matrix(' + a.toFixed(4) + ',' + b.toFixed(4) + ',0,' + d.toFixed(4) + ',' + e.toFixed(1) + ',' + f.toFixed(1) + ')';
        c.el.style.zIndex = String(front ? 70 + Math.round(s * 20) : 3 + Math.round((1 + s) * 10));
        c.el.style.opacity = (front ? 1 : .55 + .45 * (1 + s)).toFixed(3);
    }

    // ── 掛到大廳 ──
    let _uid = 0;
    const _live = new Set();
    let _raf = 0, _last = 0;
    const _still = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
    function attach(img, o) {
        const B = window.LobbyStage && window.LobbyStage._b;
        if (!B || !img) return null;
        const pre = 'llm' + (++_uid) + '-';
        const rings = JSON.parse(JSON.stringify(RJ.rings));
        const rmap = {};
        rings.forEach(r => { r._n0 = norm(r.normal); rmap[r.id] = r; poseRing(r, 0); });
        const box = document.createElement('div');
        box.className = 'lstage-loom';
        const stage = document.createElement('div');
        stage.className = 'lstage-loom-stage';
        const mk = (z) => { const sv = document.createElementNS(NS, 'svg'); sv.setAttribute('viewBox', '0 0 ' + W + ' ' + H); sv.setAttribute('class', 'lstage-loom-full'); sv.style.zIndex = z; stage.appendChild(sv); return sv; };
        const back = mk(30);
        const orb = document.createElement('img'); orb.className = 'lstage-loom-full'; orb.alt = ''; orb.style.zIndex = 50; stage.appendChild(orb);
        const front = mk(60);
        const defs = '<defs>' + rings.map(r => ringDefs(r, pre)).join('') + '</defs>';
        const cards = MAN.cards.map(c => {
            const im = document.createElement('img'); im.className = 'lstage-loom-card'; im.alt = '';
            im.style.width = c.c[0] + 'px'; im.style.height = c.c[1] + 'px';
            B.resolveRef(PART(c.f)).then(src => { if (src) im.src = src; });
            stage.appendChild(im);
            return { el: im, R: c.R, cy: c.cy, az0: c.az * Math.PI / 180, mid: [(c.r[0] + c.r[2]) / 2, (c.r[1] + c.r[3]) / 2] };
        });
        B.resolveRef(PART('orb')).then(src => { if (src) orb.src = src; });
        box.appendChild(stage);
        const L = { img, box, stage, back, front, rings, rmap, cards, defs, t: 0, ready: false };
        // 家具那張換成底座：等底座讀好再換（換之前照舊是整台靜止的造物儀，不會空一下）；換好了疊的那層才出來
        B.resolveRef(PART('base')).then(src => {
            if (!src) return;
            const pre2 = new Image();
            if (B.sfRetry) B.sfRetry(pre2);
            pre2.onload = () => { img.src = pre2.src; L.ready = true; box.classList.add('on'); };
            pre2.src = src;
        });
        L.draw = (sec) => {
            for (const r of rings) poseRing(r, sec);
            back.innerHTML = defs + RJ.back.map(id => ringSvg(rmap[id], 'back', pre)).join('');
            front.innerHTML = RJ.front.map(id => ringSvg(rmap[id], 'front', pre)).join('');
            for (const c of cards) placeCard(c, c.az0 + sec * CARD_SPEED);
        };
        L.place = () => {   // 跟著家具那張的位置、大小、前後
            box.style.left = img.style.left; box.style.top = img.style.top;
            const w = parseFloat(img.style.width) || 0;
            box.style.width = w + 'px'; box.style.height = (w * H / W) + 'px';
            stage.style.transform = 'scale(' + (w / W) + ')';
            box.style.zIndex = img.style.zIndex;
        };
        L.draw(0);
        L.place();
        if (img.parentNode) img.parentNode.insertBefore(box, img.nextSibling);
        _live.add(L);
        if (!_raf) { _last = performance.now(); _raf = requestAnimationFrame(_tick); }
        return L;
    }
    function detach(L) {
        if (!L) return;
        _live.delete(L);
        try { L.box.remove(); } catch (e) {}
    }
    function _tick(now) {
        _raf = 0;
        if (!_live.size) return;
        const dt = Math.min(.05, (now - _last) / 1000);
        if (now - _last >= 1000 / FPS - 1) {
            _last = now;
            const still = _still();
            for (const L of [..._live]) {
                if (!L.box.isConnected && !L.img.isConnected) { detach(L); continue; }
                if (document.hidden || !L.ready || still) continue;
                L.t += dt;
                L.draw(L.t);
            }
        }
        if (_live.size) _raf = requestAnimationFrame(_tick);
    }

    window.LobbyLoom = { attach, detach, _live: () => _live };
})();
