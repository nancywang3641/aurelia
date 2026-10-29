// ----------------------------------------------------------------
// [檔案] vn_end_show.js — 🎬 視差世界的結局片尾＋岔路圖導覽（2026-10-30）
// 職責：
//   ①結局片尾（劇情播到 [Ending|E1]）：這個世界一路上生過的插圖輪流放、旁邊捲名單（走過的岔路、一路上的人），
//     停在結局那張圖、結局名一個字一個字浮出來蓋印章；接著岔路圖導覽；最後出「留下來／撤離」。
//   ②岔路圖導覽：鏡頭從降生沿著走過的路一格一格跟過去（像導航），以前演過的快速帶過；
//     新走到的那格跳一張卡片，紙從角落燒開、冒火星飄煙灰，露出那一章的插圖，再收回那一格；最後拉遠看整張圖。
//     成就→岔路圖打開時，有還沒演過的格子就演（演過記在世界門 planToured）。點圖上亮著的結局＝重看片尾。
//   10-30 她挑的：片尾用「回顧＋名單」、解鎖用「火燒出來」（tmp 裡三選一的小樣）。
// 資料：OS_WORLDGATE.planRecap()（插圖代號＋第幾章、說話的人、岔路圖）；圖到 VN_Cache 相簿拿——不生圖、不叫模型
// 畫圖：岔路圖的排法和畫法借 VN_EndPanel._b（跟成就頁那張同一張），所以要排在 vn_end_panel.js 後面
// 演出動畫關掉（大廳設置「演出動畫」、系統減少動態）→ 不演：結局退回原本那張結局卡，岔路圖照常靜態畫
// 入口：VN_EndShow.ending(h, onClose, fallback)、tour({ tree, world, fresh })、replay(code)
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const KIND = { good: '好結局', bad: '壞結局', surprise: '意外結局' };
    const SLIDE_MS = 2600, SLIDE_MAX = 6;
    const M = 60;      // 岔路圖外圍多留的紙，鏡頭貼著邊的格子時旁邊還是格紙

    function _b() { const P = win.VN_EndPanel || window.VN_EndPanel; return (P && P._b) || null; }
    function _wg() { return win.OS_WORLDGATE || window.OS_WORLDGATE; }
    function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }
    function _sfx(kind) { try { (win.VoidUiSfx || window.VoidUiSfx)?.play?.(kind); } catch (e) {} }
    function _motionOk() { const B = _b(); return !!(B && B.motionOk()); }
    const _sleep = ms => new Promise(r => setTimeout(r, ms));
    const SV = 'http://www.w3.org/2000/svg';
    function _sv(tag, attrs) { const e = document.createElementNS(SV, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }

    // 一場演出一張號碼牌：跳過、關掉、又開一場 → 換號，還在跑的那段一碰到 chk() 就停
    function _ticket() {
        const t = { n: 0, chk() {} };
        t.renew = () => { const my = ++t.n; t.chk = () => { if (t.n !== my) throw new Error('vnes-stop'); }; return t.chk; };
        return t;
    }
    // 跳過時把還在跑的動畫整個取消，等它的那段會收到 AbortError：也算「停了」
    const _isStop = e => !!e && (e.message === 'vnes-stop' || e.name === 'AbortError');

    // ── 圖 ──
    //   相簿裡的插圖多半是 dataURL，正在播的那一章已經轉好的在 VN_Core 手上（_sceneMemCache）。
    //   拿不到、或載不起來就當沒有（不生圖：片尾不能替她花錢）。
    async function _sceneUrl(id) {
        if (!id) return '';
        try { const C = win.VN_Core || window.VN_Core; const u = C && C._sceneMemCache && C._sceneMemCache[id]; if (u) return u; } catch (e) {}
        try {
            const VC = win.VN_Cache || window.VN_Cache;
            const r = VC && await VC.get('scene_cache', id);
            if (r && typeof r.url === 'string' && r.url && r.url.indexOf('blob:') !== 0) return r.url;
        } catch (e) {}
        return '';
    }
    function _loads(url) {
        return new Promise(res => {
            if (!url) { res(false); return; }
            const im = new Image();
            const t = setTimeout(() => res(false), 8000);
            im.onload = () => { clearTimeout(t); res(true); };
            im.onerror = () => { clearTimeout(t); res(false); };
            im.src = url;
        });
    }
    async function _okUrl(id) { const u = await _sceneUrl(id); return (u && await _loads(u)) ? u : ''; }
    // 候選照順序試，第一張拿得到、載得起來的就用（相簿裡被刪掉、AI 亂寫的代號會拿不到）
    async function _firstUrl(ids, chk) {
        for (const id of ids) { const u = await _okUrl(id); if (chk) chk(); if (u) return { id, url: u }; }
        return { id: '', url: '' };
    }
    // 某一格的卡片用哪張：那一章的插圖從最後一張往前 → 前面幾章的 → （_cardUrl 再退世界概念圖）
    function _cardSceneIds(R, code) {
        const ch = (((R.tree.hit || {})[code] || {}).ch) || 0;
        if (!ch) return [];
        return R.scenes.filter(s => s.ch === ch).reverse().concat(R.scenes.filter(s => s.ch < ch).reverse()).map(s => s.id).slice(0, 8);
    }
    // 結局那張圖：剛剛播過的那張插圖（就是定局前那一幕）→ 結局那一章（含之前）從最後一張往前
    function _endSceneIds(R, code, live) {
        const out = [];
        if (live) {
            try { const C = win.VN_Core || window.VN_Core; const cur = C && C._sceneCgCur; if (cur && cur.cacheId) out.push(cur.cacheId); } catch (e) {}
        }
        const ch = ((R.tree.hit || {})[code] || {}).ch || 0;
        (ch ? R.scenes.filter(s => s.ch <= ch) : R.scenes).slice().reverse().forEach(s => { if (out.indexOf(s.id) < 0) out.push(s.id); });
        return out.slice(0, 8);
    }
    // 片尾輪流放的：結局那張以外，平均挑幾張（太多就跳著挑，頭尾都留）
    function _slideIds(R, endId) {
        const all = R.scenes.map(s => s.id).filter(id => id !== endId);
        if (all.length <= SLIDE_MAX) return all;
        const out = [];
        for (let i = 0; i < SLIDE_MAX; i++) out.push(all[Math.round(i * (all.length - 1) / (SLIDE_MAX - 1))]);
        return Array.from(new Set(out));
    }
    // 走過的路：照第幾章排（同一章照碰到的時間），沒有章數的排最後
    function _route(T) {
        const hit = T.hit || {};
        return T.nodes.concat(T.endings).map(x => x.code).filter(c => hit[c])
            .sort((a, b) => ((hit[a].ch || 1e4) - (hit[b].ch || 1e4)) || ((hit[a].at || 0) - (hit[b].at || 0)));
    }
    function _byCode(T) { const o = {}; T.nodes.concat(T.endings).forEach(x => { o[x.code] = x; }); return o; }

    // ── 外框 ──
    function _overlay(cls) {
        document.getElementById('vnes')?.remove();
        const ov = document.createElement('div');
        ov.id = 'vnes';
        ov.className = 'vnes ' + (cls || '');
        ov.innerHTML = '<button type="button" class="vnes-skip">跳過</button>';
        document.body.appendChild(ov);
        ov.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease-out' });
        return ov;
    }
    function _teardown(ov, ticket, onGone) {
        ticket.renew();
        if (ov._onKey) document.removeEventListener('keydown', ov._onKey, true);
        if (ov._onResize) window.removeEventListener('resize', ov._onResize);
        const gone = () => {
            ov.querySelectorAll('img').forEach(im => { im.src = BLANK; });   // 拆下的圖換成空白圖，別留著一整張 dataURL
            ov.remove();
            if (typeof onGone === 'function') { try { onGone(); } catch (e) {} }
        };
        const a = ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
        a.finished.then(gone, gone);
    }

    // ── 🔥 火燒出來 ──
    //   卡片先蓋一張寫著「？？？」的格紙，從左下角燒開：燒到的地方透明露出底下的插圖，邊上一圈亮橘、再外一圈焦黑；
    //   燒的那條邊冒火星（橘點往上竄）、飄煙灰（灰片慢慢飄）。畫布用固定的小解析度算，放大顯示（每格只算六萬點）。
    function _burn(pic, chk) {
        const cw = 304, chh = 208;
        const cv = document.createElement('canvas'); cv.className = 'vnes-cover'; cv.width = cw; cv.height = chh;
        const ash = document.createElement('canvas'); ash.className = 'vnes-ash';
        pic.appendChild(cv); pic.appendChild(ash);
        const pr = pic.getBoundingClientRect();
        const AW = Math.max(1, Math.round(pr.width * 1.2)), AH = Math.max(1, Math.round(pr.height * 1.8));
        ash.width = AW; ash.height = AH;
        const offX = pr.width * 0.1, offY = AH - pr.height * 1.1;    // 卡片左上角落在灰燼畫布的哪裡（灰燼畫布往上多一大截）
        const off = document.createElement('canvas'); off.width = cw; off.height = chh;
        const o = off.getContext('2d');
        o.fillStyle = '#f4eedf'; o.fillRect(0, 0, cw, chh);
        o.strokeStyle = 'rgba(90,140,210,0.16)'; o.lineWidth = 1;
        for (let x = 9; x < cw; x += 18) { o.beginPath(); o.moveTo(x + 0.5, 0); o.lineTo(x + 0.5, chh); o.stroke(); }
        for (let y = 9; y < chh; y += 18) { o.beginPath(); o.moveTo(0, y + 0.5); o.lineTo(cw, y + 0.5); o.stroke(); }
        o.fillStyle = '#8a9bbd'; o.font = '700 30px "Noto Serif TC", "Songti TC", serif'; o.textAlign = 'center'; o.textBaseline = 'middle';
        o.fillText('？？？', cw / 2, chh / 2);
        const cover = o.getImageData(0, 0, cw, chh).data;
        // 燒的路線＝雜訊＋離起火點多遠（不然會四處同時冒洞，不像從一角燒過去）
        let seed = (Math.random() * 2147483646 | 0) + 1;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const nz = new Float32Array(cw * chh);
        [[28, 0.55], [14, 0.3], [6, 0.15]].forEach(([cell, amp]) => {
            const gw = Math.ceil(cw / cell) + 2, g = new Float32Array(gw * (Math.ceil(chh / cell) + 2));
            for (let i = 0; i < g.length; i++) g[i] = rnd();
            for (let y = 0; y < chh; y++) {
                const gy = y / cell, y0 = gy | 0, fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
                for (let x = 0; x < cw; x++) {
                    const gx = x / cell, x0 = gx | 0, fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
                    const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
                    const top = a + (b - a) * sx, bot = c + (d - c) * sx;
                    nz[y * cw + x] += amp * (top + (bot - top) * sy);
                }
            }
        });
        const fx0 = cw * 0.18, fy0 = chh * 0.82, diag = Math.hypot(cw, chh);
        let lo = 9, hi = -9;
        for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
            const i = y * cw + x, v = 0.42 * nz[i] + 0.58 * (Math.hypot(x - fx0, y - fy0) / diag) * 1.4;
            nz[i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
        }
        for (let i = 0; i < nz.length; i++) nz[i] = (nz[i] - lo) / (hi - lo);
        const ctx = cv.getContext('2d'), id = ctx.createImageData(cw, chh), d = id.data;
        const actx = ash.getContext('2d');
        const parts = [], sx = pr.width / cw;
        const DUR = 1400, t0 = performance.now();
        let last = t0, ended = false;
        return new Promise((res, rej) => {
            const frame = now => {
                try { chk(); } catch (e) { rej(e); return; }
                if (!pic.isConnected) { res(); return; }
                const p = Math.min(1, (now - t0) / DUR), dt = Math.min(0.05, (now - last) / 1000);
                last = now;
                const T = -0.06 + Math.pow(p, 1.15) * 1.16;
                const G = 0.028, C2 = 0.085, edge = [];
                for (let i = 0; i < cw * chh; i++) {
                    const v = nz[i] - T, j = i * 4;
                    if (v < 0) { d[j + 3] = 0; continue; }
                    if (v < G) {
                        const f = v / G;
                        d[j] = 255; d[j + 1] = 236 - 130 * f; d[j + 2] = 150 - 140 * f; d[j + 3] = 255;
                        if ((i % 5) === 0) edge.push(i);
                        continue;
                    }
                    if (v < C2) {
                        const f = Math.pow((v - G) / (C2 - G), 1.6);
                        d[j] = 46 + (cover[j] - 46) * f; d[j + 1] = 26 + (cover[j + 1] - 26) * f; d[j + 2] = 14 + (cover[j + 2] - 14) * f; d[j + 3] = 255;
                        continue;
                    }
                    d[j] = cover[j]; d[j + 1] = cover[j + 1]; d[j + 2] = cover[j + 2]; d[j + 3] = 255;
                }
                ctx.putImageData(id, 0, 0);
                const n = edge.length ? Math.min(7, 2 + (edge.length / 60) | 0) : 0;
                for (let k = 0; k < n; k++) {
                    const i = edge[(Math.random() * edge.length) | 0], ember = Math.random() < 0.45;
                    parts.push({ x: offX + (i % cw) * sx, y: offY + ((i / cw) | 0) * sx, vx: (Math.random() - 0.5) * 22,
                        vy: -(ember ? 40 + Math.random() * 60 : 18 + Math.random() * 30), life: 0,
                        max: ember ? 0.5 + Math.random() * 0.7 : 0.9 + Math.random() * 1.1, ember,
                        r: ember ? 0.8 + Math.random() * 1.3 : 1.2 + Math.random() * 2.2, ph: Math.random() * 6.28, rot: Math.random() * 3 });
                }
                actx.clearRect(0, 0, AW, AH);
                for (let k = parts.length - 1; k >= 0; k--) {
                    const q = parts[k];
                    q.life += dt;
                    if (q.life >= q.max) { parts.splice(k, 1); continue; }
                    q.x += q.vx * dt + Math.sin(q.life * 5 + q.ph) * 0.35; q.y += q.vy * dt; q.vy *= 0.995; q.rot += dt * 3;
                    const a = 1 - q.life / q.max;
                    if (q.ember) {
                        actx.fillStyle = 'rgba(255,' + (150 + 80 * a | 0) + ',60,' + a + ')';
                        actx.beginPath(); actx.arc(q.x, q.y, q.r, 0, 6.283); actx.fill();
                    } else {
                        actx.save(); actx.translate(q.x, q.y); actx.rotate(q.rot);
                        actx.fillStyle = 'rgba(78,70,64,' + (a * 0.75) + ')'; actx.fillRect(-q.r, -q.r * 0.5, q.r * 2, q.r);
                        actx.restore();
                    }
                }
                if (p >= 1 && !ended) { ended = true; cv.remove(); setTimeout(res, 250); }   // 燒完就往下走，剩下的灰自己飄完
                if (p < 1 || parts.length) requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        });
    }

    // ── 🌳 岔路圖導覽 ──
    //   stage 是一塊滿版的幕；圖紙放在裡面一層 world，鏡頭＝world 的 translate＋scale。
    //   底圖用成就頁那張（VN_EndPanel._b.treeHtml），新走到的那幾格先當沒走過畫，解鎖一格重畫一次；
    //   畫線、波紋在另一層 svg（重畫底圖不會洗掉）。
    function _tourStage(host, T, world, fresh, opt) {
        const B = _b();
        const L = B.treeLayout(T);
        const stage = document.createElement('div');
        stage.className = 'vnes-stage';
        const wd = document.createElement('div');
        wd.className = 'vnes-world';
        const WW = L.width + M * 2, WH = L.height + M * 2;
        wd.style.width = WW + 'px'; wd.style.height = WH + 'px';
        const base = document.createElement('div');
        base.className = 'vnes-base';
        const fx = _sv('svg', { class: 'vnes-fx', width: L.width, height: L.height, viewBox: '0 0 ' + L.width + ' ' + L.height });
        wd.appendChild(base); wd.appendChild(fx);
        stage.appendChild(wd);
        const dim = document.createElement('div'); dim.className = 'vnes-dim';
        stage.appendChild(dim);
        host.appendChild(stage);
        const shown = {};
        Object.keys(T.hit || {}).forEach(c => { if (fresh.indexOf(c) < 0) shown[c] = T.hit[c]; });
        const st = { stage, wd, base, fx, dim, L, T, world, shown, WW, WH, cur: '', cam: null, reserve: (opt && opt.reserve) || 0 };
        _measure(st);
        _paintBase(st);
        return st;
    }
    function _measure(st) {
        const r = st.stage.getBoundingClientRect();
        st.SW = r.width; st.SH = r.height;
        st.fit = Math.min(st.SW * 0.94 / st.WW, Math.max(80, st.SH - st.reserve) * 0.94 / st.WH);
        const W = _b().TR.W;
        st.Z = Math.max(st.fit, Math.min(st.fit * 2.4, st.SW * 0.3 / W));
    }
    function _paintBase(st) {
        const tmp = document.createElement('div');
        tmp.innerHTML = _b().treeHtml(Object.assign({}, st.T, { hit: st.shown }), st.world);
        const svg = tmp.querySelector('svg');
        st.base.innerHTML = '';
        if (svg) st.base.appendChild(svg);
    }
    const _ctr = (st, c) => { const p = st.L.pos[c], TR = _b().TR; return { x: p.x + TR.W / 2 + M, y: p.y + TR.H / 2 + M }; };
    function _camTo(st, x, y, s, dur) {
        const tx = st.SW / 2 - x * s, ty = (st.SH - st.reserve) / 2 - y * s;
        const to = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + s + ')';
        st.cam = { tx, ty, s, x, y };
        if (!dur || !st.cur) { st.wd.style.transform = to; st.cur = to; return Promise.resolve(); }
        const a = st.wd.animate([{ transform: st.cur }, { transform: to }], { duration: dur, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' });
        st.cur = to;
        return a.finished.then(() => { st.wd.style.transform = to; a.cancel(); });
    }
    function _drawEdge(st, p, c, dur) {
        const TR = _b().TR, a = st.L.pos[p], b = st.L.pos[c];
        const x1 = a.x + TR.W / 2, y1 = a.y + TR.H, x2 = b.x + TR.W / 2, y2 = b.y, my = (y1 + y2) / 2;
        const path = _sv('path', { class: 'vnes-pen', d: 'M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + my + ' ' + x2 + ' ' + my + ' ' + x2 + ' ' + (y2 - 2) });
        st.fx.appendChild(path);
        const len = path.getTotalLength();
        path.style.strokeDasharray = len;
        path.style.strokeDashoffset = len;
        return path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: dur, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' }).finished;
    }
    function _ring(st, c, kind) {
        const TR = _b().TR, p = st.L.pos[c];
        const col = { good: '#2f7a55', bad: '#b8564a', surprise: '#8a5aa8' }[kind] || '#2a4a80';
        const r = _sv('circle', { class: 'vnes-ring', cx: p.x + TR.W / 2, cy: p.y + TR.H / 2, r: 30, stroke: col });
        st.fx.appendChild(r);
        const a = r.animate([{ r: 30, opacity: 0.9, strokeWidth: 3 }, { r: 95, opacity: 0, strokeWidth: 0.5 }], { duration: 750, easing: 'ease-out', fill: 'forwards' });
        a.finished.then(() => r.remove(), () => r.remove());
    }
    // 卡片：跳出來→火燒開→名字浮上來→縮回那一格
    async function _card(st, x, url, chk) {
        const isE = x.code[0] === 'E';
        const hit = (st.T.hit || {})[x.code] || {};
        const card = document.createElement('div');
        card.className = 'vnes-card' + (isE ? ' is-end k-' + (KIND[x.kind] ? x.kind : 'other') : '');
        card.innerHTML = '<div class="vnes-pic">' + (url ? '<img class="vnes-pic-img" alt="">' : '<div class="vnes-pic-plate"><span>' + _esc(x.name) + '</span></div>') + '</div>' +
            '<div class="vnes-ccap"><div class="vnes-cn">' + _esc(x.name) + '</div><div class="vnes-cm">' +
            (isE ? (KIND[x.kind] || '結局') : '岔路') + (hit.ch ? '・第 ' + hit.ch + ' 章' : '') + '</div></div>';
        if (url) card.querySelector('img').src = url;
        st.stage.appendChild(card);
        _sfx('thread_new');
        st.dim.classList.add('on');
        await card.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(0.9)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }],
            { duration: 240, easing: 'ease-out', fill: 'forwards' }).finished;
        chk();
        await _burn(card.querySelector('.vnes-pic'), chk);
        _sfx('unlock');
        card.classList.add('cap-on');
        await _sleep(700); chk();
        const cam = st.cam, TR = _b().TR, p = st.L.pos[x.code];
        const nx = cam.tx + (p.x + TR.W / 2 + M) * cam.s, ny = cam.ty + (p.y + TR.H / 2 + M) * cam.s;
        const cr = card.getBoundingClientRect(), sr = st.stage.getBoundingClientRect();
        const k = (TR.W * cam.s) / Math.max(1, cr.width);
        st.dim.classList.remove('on');
        await card.animate([
            { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
            { opacity: 0.15, transform: 'translate(calc(-50% + ' + (nx - (cr.left - sr.left + cr.width / 2)) + 'px), calc(-50% + ' + (ny - (cr.top - sr.top + cr.height / 2)) + 'px)) scale(' + k + ')' }
        ], { duration: 420, easing: 'cubic-bezier(.55,0,.8,.2)', fill: 'forwards' }).finished;
        card.querySelectorAll('img').forEach(im => { im.src = BLANK; });
        card.remove();
        chk();
        _sfx('thread_slot');
    }
    // 跑一趟：imgOf(code) → 圖網址（空字串＝沒圖）
    async function _runTour(st, fresh, imgOf, chk) {
        const T = st.T, by = _byCode(T), L = st.L;
        const route = _route(T);
        const s0 = _ctr(st, 'S');
        await _camTo(st, s0.x, s0.y, st.Z, 0);
        await _sleep(450); chk();
        for (const c of route) {
            const a = _ctr(st, c);
            if (fresh.indexOf(c) < 0) { await _camTo(st, a.x, a.y, st.Z, 380); chk(); continue; }
            // 從已經亮著的上一格畫線過來（一格都沒亮＝從開頭）
            const ps = L.parentsOf(c).filter(p => p === 'S' || st.shown[p]);
            await Promise.all([_camTo(st, a.x, a.y, st.Z, 700)].concat((ps.length ? ps : []).map(p => _drawEdge(st, p, c, 700))));
            chk();
            const url = await imgOf(c); chk();
            await _card(st, by[c], url, chk);
            st.shown[c] = T.hit[c];
            _paintBase(st);
            _ring(st, c, by[c].kind);
            await _sleep(280); chk();
        }
        await _sleep(250); chk();
        await _camTo(st, st.WW / 2, st.WH / 2, st.fit, 1150); chk();
    }
    // 跳過／演完：整張圖全亮、拉遠
    function _tourFinal(st) {
        st.wd.getAnimations().forEach(a => a.cancel());
        st.stage.querySelectorAll('.vnes-card').forEach(c => { c.querySelectorAll('img').forEach(im => { im.src = BLANK; }); c.remove(); });
        st.dim.classList.remove('on');
        st.fx.innerHTML = '';
        Object.assign(st.shown, st.T.hit || {});
        _paintBase(st);
        _measure(st);
        st.cur = '';
        _camTo(st, st.WW / 2, st.WH / 2, st.fit, 0);
    }
    function _watch(ov, st, onSkip) {
        ov._onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onSkip(); } };
        document.addEventListener('keydown', ov._onKey, true);
        ov._onResize = () => { if (!st.s) return; _measure(st.s); if (st.s.cam) { st.s.cur = ''; _camTo(st.s, st.s.cam.x, st.s.cam.y, st.s.cam.s > st.s.fit * 1.01 ? st.s.Z : st.s.fit, 0); } };
        window.addEventListener('resize', ov._onResize);
    }

    // 成就→岔路圖：有還沒演過的格子就演一趟，演完（或跳過）記下來
    async function tour(opt) {
        const T = opt && opt.tree, fresh = ((opt && opt.fresh) || []).slice();
        if (!T || !fresh.length || !_motionOk()) return false;
        const R = (await _recap()) || { tree: T, scenes: [], art: '' };
        R.tree = T;
        const ov = _overlay('is-tour');
        const ticket = _ticket(), holder = { s: null };
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            const WG = _wg();
            if (WG && WG.markPlanToured) WG.markPlanToured(fresh).catch(() => {});
            _teardown(ov, ticket);
        };
        ov.querySelector('.vnes-skip').addEventListener('click', finish);
        _watch(ov, holder, finish);
        const chk = ticket.renew();
        try {
            holder.s = _tourStage(ov, T, String((opt && opt.world) || R.world || ''), fresh, {});
            await _runTour(holder.s, fresh, c => _cardUrl(R, c), chk);
            await _sleep(1200); chk();
        } catch (e) { if (!_isStop(e)) console.warn('[VN片尾] 岔路圖導覽沒演完：' + e.message); }
        finish();
        return true;
    }
    async function _recap() {
        const WG = _wg();
        if (!WG || typeof WG.planRecap !== 'function') return null;
        try { return await WG.planRecap(); } catch (e) { return null; }
    }
    async function _cardUrl(R, code) {
        const u = (await _firstUrl(_cardSceneIds(R, code))).url;
        if (u) return u;
        return (R.art && await _loads(R.art)) ? R.art : '';
    }

    // ── 🎬 結局片尾 ──
    function _creditsHtml(R, T, by) {
        const hit = T.hit || {};
        const walked = T.nodes.filter(n => hit[n.code]).sort((a, b) => (hit[a.code].ch || 1e4) - (hit[b.code].ch || 1e4));
        const left = T.nodes.length - walked.length;
        const ends = T.endings.filter(e => hit[e.code]);
        const sec = (t, rows) => rows ? '<h3>' + t + '</h3><ul>' + rows + '</ul>' : '';
        return '<div class="vnes-big">' + _esc(R.world) + '</div>' +
            sec('走過的岔路', walked.map(n => '<li>' + _esc(n.name) + (hit[n.code].ch ? '<small>第 ' + hit[n.code].ch + ' 章</small>' : '') + '</li>').join('') +
                (left > 0 ? '<li class="off">還有 ' + left + ' 條沒走</li>' : '')) +
            (ends.length ? sec('走到的結局', ends.map(e => '<li>' + _esc(e.name) + '<small>' + (KIND[e.kind] || '結局') + '</small></li>').join('')) : '') +
            (R.cast && R.cast.length ? sec('一路上的人', R.cast.map(n => '<li>' + _esc(n) + '</li>').join('')) : '');
    }
    function _titleHtml(world, x, prog) {
        const k = KIND[x.kind] ? x.kind : 'other';
        return '<div class="vnes-world-label">' + _esc(world) + '・結局</div>' +
            '<div class="vnes-name">' + Array.from(String(x.name)).map(ch => '<span>' + _esc(ch) + '</span>').join('') + '</div>' +
            '<div class="vnes-row"><span class="vnes-stamp k-' + k + '">' + (KIND[x.kind] || '結局') + '</span>' +
            '<span class="vnes-meta">走過 ' + prog.hit + ' / ' + prog.total + ' 個岔路</span></div>';
    }
    async function _playEd(ov, R, x, endUrl, slides, chk) {
        const T = R.tree, by = _byCode(T);
        const hit = T.hit || {};
        const prog = { hit: T.nodes.filter(n => hit[n.code]).length, total: T.nodes.length };
        const ed = document.createElement('div');
        ed.className = 'vnes-ed' + (slides.length ? '' : ' no-slides') + (endUrl ? '' : ' no-cg');
        ed.innerHTML =
            '<div class="vnes-slides">' + slides.map(() => '<img class="vnes-slide" alt="">').join('') + '</div>' +
            '<div class="vnes-side"><div class="vnes-roll">' + _creditsHtml(R, T, by) + '</div></div>' +
            (endUrl ? '<img class="vnes-endcg" alt="">' : '') +
            '<div class="vnes-shade"></div>' +
            '<div class="vnes-title">' + _titleHtml(R.world, x, prog) + '</div>';
        ov.appendChild(ed);
        ed.querySelectorAll('.vnes-slide').forEach((im, i) => { im.src = slides[i]; });
        if (endUrl) ed.querySelector('.vnes-endcg').src = endUrl;
        await _sleep(600); chk();
        // 插圖輪流放＋名單往上捲（沒有插圖：全黑只捲名單）
        const side = ed.querySelector('.vnes-side'), roll = ed.querySelector('.vnes-roll');
        const showMs = Math.max(8000, slides.length * (SLIDE_MS - 500) + 500);
        const dist = roll.offsetHeight + side.clientHeight;
        const rollA = roll.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(' + (-dist) + 'px)' }], { duration: showMs, easing: 'linear', fill: 'forwards' });
        ed.querySelectorAll('.vnes-slide').forEach((im, i) => im.animate([
            { opacity: 0, transform: 'scale(1.1) translateX(1.5%)' }, { opacity: 1, offset: 0.18 }, { opacity: 1, offset: 0.82 },
            { opacity: 0, transform: 'scale(1.02) translateX(-1.5%)' }
        ], { duration: SLIDE_MS, delay: i * (SLIDE_MS - 500), easing: 'ease-in-out', fill: 'both' }));
        await rollA.finished; chk();
        // 停在結局那張：慢慢亮、結局名一個字一個字浮出來、蓋章
        const cg = ed.querySelector('.vnes-endcg');
        if (cg) {
            cg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1100, easing: 'ease-out', fill: 'forwards' });
            cg.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 7000, easing: 'ease-out', fill: 'forwards' });
            ed.querySelector('.vnes-shade').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 700, fill: 'both' });
        }
        await _sleep(cg ? 1300 : 300); chk();
        const tl = ed.querySelector('.vnes-title');
        tl.querySelector('.vnes-world-label').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, fill: 'both' });
        tl.querySelectorAll('.vnes-name span').forEach((s, i) => s.animate([
            { opacity: 0, transform: 'translateY(0.6em)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'none' }
        ], { duration: 500, delay: 200 + i * 120, easing: 'ease-out', fill: 'both' }));
        const n = tl.querySelectorAll('.vnes-name span').length;
        await _sleep(300 + n * 120 + 400); chk();
        _sfx('book_stamp');
        tl.querySelector('.vnes-stamp').animate([{ opacity: 0, transform: 'rotate(-4deg) scale(1.8)' }, { opacity: 1, transform: 'rotate(-4deg) scale(1)' }],
            { duration: 350, easing: 'cubic-bezier(.2,1.6,.4,1)', fill: 'both' });
        tl.querySelector('.vnes-meta').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 350, fill: 'both' });
        await _sleep(2600); chk();
        // 換到岔路圖
        await ed.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: 'ease-in', fill: 'forwards' }).finished;
        ed.querySelectorAll('img').forEach(im => { im.src = BLANK; });
        ed.remove();
    }
    // 最後那排：結局名＋選擇（重看＝只有「關掉」）
    function _finalBar(ov, R, x, replay, onPick) {
        const k = KIND[x.kind] ? x.kind : 'other';
        const bar = document.createElement('div');
        bar.className = 'vnes-final';
        bar.innerHTML = '<div class="vnes-final-name">' + _esc(R.world) + '・結局「' + _esc(x.name) + '」<span class="vnes-stamp k-' + k + '">' + (KIND[x.kind] || '結局') + '</span></div>' +
            '<div class="vnes-final-btns">' + (replay
                ? '<button type="button" data-k="close">關掉</button>'
                : '<button type="button" data-k="stay">留下來繼續過日子</button><button type="button" data-k="leave">撤離回奧瑞亞</button>') + '</div>';
        ov.appendChild(bar);
        bar.querySelectorAll('button').forEach((b, i) => b.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
            { duration: 450, delay: 150 + i * 120, easing: 'ease-out', fill: 'both' }));
        bar.querySelectorAll('button').forEach(b => b.addEventListener('click', () => onPick(b.dataset.k)));
        ov.querySelector('.vnes-skip')?.remove();
    }

    // 劇情播到 [Ending|E1]：外框當場蓋上（擋住點擊，不然等資料那幾百毫秒她一點就把下一句播掉），料到了再開演。
    //   拿不到料／這個世界沒有岔路圖 → 拆掉外框，叫 fallback（原本那張結局卡）
    function ending(h, onClose, fallback, opt) {
        const replay = !!(opt && opt.replay);
        const ov = _overlay('is-ending');
        const ticket = _ticket(), holder = { s: null };
        let R = null, x = null, fresh = [], picked = false, atFinal = false;
        const toFinal = () => {
            if (atFinal) return;
            atFinal = true;
            ticket.renew();
            ov.querySelectorAll('.vnes-ed').forEach(e => { e.querySelectorAll('img').forEach(im => { im.src = BLANK; }); e.remove(); });
            if (!holder.s) holder.s = _tourStage(ov, R.tree, R.world, [], { reserve: 120 });
            _tourFinal(holder.s);
            if (fresh.length) { const WG = _wg(); if (WG && WG.markPlanToured) WG.markPlanToured(fresh).catch(() => {}); }
            _finalBar(ov, R, x, replay, pick);
        };
        const pick = k => {
            if (picked) return;
            picked = true;
            if (k === 'leave') {
                const WG = _wg();
                if (WG && WG.leaveAfterChapter) WG.leaveAfterChapter(true);
                const A = win.AUI || window.AUI;
                if (A && A.toast) A.toast('這一章演完就送妳回奧瑞亞');
            }
            _teardown(ov, ticket, onClose);
        };
        const bail = why => {
            console.warn('[VN片尾] 改跳結局卡：' + why);
            _teardown(ov, ticket, () => { if (typeof fallback === 'function') fallback(); else if (typeof onClose === 'function') onClose(); });
        };
        ov.querySelector('.vnes-skip').addEventListener('click', () => { if (R) toFinal(); });
        _watch(ov, holder, () => { if (R) toFinal(); });
        const chk = ticket.renew();
        (async () => {
            try {
                if (!_b()) { bail('岔路圖的畫法沒載到'); return; }
                R = await _recap(); chk();
                if (!R || !R.tree) { bail('拿不到這個世界的岔路圖'); return; }
                const code = String(h.code || '').toUpperCase();
                x = _byCode(R.tree)[code];
                if (!x) { bail('岔路圖裡沒有 ' + code); return; }
                // 播到的這一格世界門可能還沒記（記帳在整章掃完之後）：先當它已經走到，章數用播放器給的
                if (!R.tree.hit[code]) R.tree.hit[code] = { at: Date.now(), ch: h.ch || 0 };
                fresh = _route(R.tree).filter(c => !(R.tree.toured || {})[c]);
                if (replay && fresh.indexOf(code) < 0) fresh.push(code);   // 重看：結局那格再燒一次
                const end = await _firstUrl(_endSceneIds(R, code, !replay), chk);
                const endId = end.id, endUrl = end.url;
                const slides = [];
                for (const id of _slideIds(R, endId)) { const u = await _okUrl(id); chk(); if (u) slides.push(u); }
                await _playEd(ov, R, x, endUrl, slides, chk);
                holder.s = _tourStage(ov, R.tree, R.world, fresh, { reserve: 120 });
                holder.s.stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, fill: 'both' });
                await _runTour(holder.s, fresh, c => (c === code && endUrl) ? Promise.resolve(endUrl) : _cardUrl(R, c), chk);
                toFinal();
            } catch (e) {
                if (_isStop(e)) return;
                console.warn('[VN片尾] 沒演完：' + e.message);
                if (R && x) { try { toFinal(); } catch (e2) { bail(e2.message); } }
                else bail(e.message);
            }
        })();
    }
    // 岔路圖上點亮著的結局：重看片尾（最後只有「關掉」）
    function replay(code) {
        if (!_motionOk()) return false;
        ending({ code: code }, null, null, { replay: true });
        return true;
    }

    win.VN_EndShow = window.VN_EndShow = { ending, tour, replay };
    console.log('[VN片尾] 模組就緒');
})();
