// ----------------------------------------------------------------
// [檔案] vn_nav.js (獨立擴充模組)
// 路徑：os_phone/vn_story/vn_nav.js
// 職責：VN 播放器裡的手機導航分支（跟 Chat / Call / Browser 同一個手機殼的第四個面）
//   正文：<nav to="目的地" from="出發地" mode="步行"> … </nav>
//   每行一項：[Route: 時間|距離]（可省，程式會算）、[Step: 怎麼走]、[Arrive]、[Nar|…]、[Char|…]
//   地圖是程式畫的通用向量圖（白街道格、綠地、一條水），用出發地＋目的地當種子，同一趟路每次同一張。
//   開場動效（她選的「電影」版）：主畫面點開地圖 → 慢推近到藍點 → 目的地圖釘軟落 → 路線描邊帶光頭、相機跟線頭 → 拉遠看全程、底部卡滑上
//   之後每個 [Step] 藍點沿線滑到下一段、相機跟、卡片換字；[Arrive] 或收尾圖釘放大、卡片變「已到達」。
// ⚠️ 請確保在載入 vn_core.js 之後載入此檔案
// ----------------------------------------------------------------
(function () {
    console.log('[PhoneOS] 載入 VN 手機導航模組...');
    const win = window.parent || window;

    const W = 300, H = 600;   // 地圖座標系（viewBox），殼多大都用 slice 鋪滿
    const STEP_RE   = /^\[(?:Step|步|路線|路线|導引|导引|Turn|Go)[：:]\s*([\s\S]+?)\]$/i;
    const ROUTE_RE  = /^\[(?:Route|路程|Trip|ETA)[：:]\s*([\s\S]+?)\]$/i;
    const ARRIVE_RE = /^\[(?:Arrive|Arrived|到達|到达|抵達|抵达)\s*[：:]?\s*([\s\S]*?)\]$/i;
    const MODE_LABEL = { walk: '步行', drive: '開車', taxi: '計程車', rail: '空軌', bus: '公車', bike: '單車' };
    const MODE_SPEED = { 步行: 80, 開車: 500, 計程車: 500, 空軌: 700, 公車: 300, 單車: 220 };   // 公尺／分鐘
    const M_PER_PX = 3.2;   // 地圖 1 座標單位≈幾公尺（拿來算距離與時間，跑團用不求準）

    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const $ = id => document.getElementById(id);
    const SVG_NS = 'http://www.w3.org/2000/svg';

    function rng(seed) {
        let s = 0; for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
        return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    }

    // ---------- 地圖與路線（純函式，測試直接測） ----------
    function buildMap(seed) {
        const r = rng(seed);
        const xs = [], ys = [];
        for (let x = 30; x < W; x += 52 + r() * 26) xs.push(Math.round(x));
        for (let y = 30; y < H; y += 56 + r() * 30) ys.push(Math.round(y));
        let g = '';
        for (let k = 0; k < 2; k++) {
            const i = Math.floor(r() * (xs.length - 1)), j = Math.floor(r() * (ys.length - 1));
            g += `<rect class="nv-park" x="${xs[i] + 6}" y="${ys[j] + 6}" width="${xs[i + 1] - xs[i] - 12}" height="${ys[j + 1] - ys[j] - 12}" rx="6"/>`;
        }
        const wy = ys[Math.floor(ys.length * (0.55 + r() * 0.3))] + 20;
        g += `<path class="nv-water" d="M -20 ${wy} C 80 ${wy - 30}, 160 ${wy + 40}, ${W + 20} ${wy - 10}"/>`;
        const mainX = Math.floor(r() * 3), mainY = Math.floor(r() * 3);
        xs.forEach((x, i) => { g += `<line class="nv-road ${i % 3 === mainX ? 'nv-main' : ''}" x1="${x}" y1="-40" x2="${x}" y2="${H + 40}"/>`; });
        ys.forEach((y, i) => { g += `<line class="nv-road ${i % 3 === mainY ? 'nv-main' : ''}" x1="-40" y1="${y}" x2="${W + 40}" y2="${y}"/>`; });
        return { g, xs, ys, r };
    }

    // 起點在下半、終點在上半，沿格線走兩三個轉角；左右哪邊出發看種子
    function buildRoute(m) {
        const r = m.r;
        const nx = m.xs.length, ny = m.ys.length;
        const flip = r() < 0.5;
        const sxi = 1 + Math.floor(r() * Math.max(1, nx - 4)), exi = Math.min(nx - 2, sxi + 1 + Math.floor(r() * Math.max(1, nx - sxi - 2)));
        const sx = m.xs[flip ? nx - 1 - sxi : sxi], ex = m.xs[flip ? nx - 1 - exi : exi];
        const sy = m.ys[ny - 3], ey = m.ys[2];
        const midX = m.xs[Math.max(1, Math.min(nx - 2, Math.floor((sxi + exi) / 2) + (r() < 0.5 ? 0 : 1)))];
        const midY = m.ys[Math.floor(ny / 2)];
        const pts = [[sx, sy], [flip ? m.xs[nx - 1 - Math.floor((sxi + exi) / 2)] : midX, sy], [flip ? m.xs[nx - 1 - Math.floor((sxi + exi) / 2)] : midX, midY], [ex, midY], [ex, ey]];
        const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
        let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        return { d, pts, start: pts[0], end: pts[pts.length - 1], len };
    }

    function estimate(lenPx, modeLabel) {
        const meters = Math.round(lenPx * M_PER_PX / 10) * 10;
        const speed = MODE_SPEED[modeLabel] || MODE_SPEED['步行'];
        const minutes = Math.max(1, Math.round(meters / speed));
        const dist = meters >= 1000 ? (meters / 1000).toFixed(1) + ' 公里' : meters + ' 公尺';
        return { minutes, dist };
    }

    const VN_Nav = {
        to: '', from: '', mode: '步行',
        busy: false,
        steps: 0, stepIdx: 0, arrived: false,
        _core: null, _seq: 0, _route: null, _len: 0, _eta: null,

        resetState: function () {
            this._seq++;
            this.busy = false; this.steps = 0; this.stepIdx = 0; this.arrived = false;
            this.to = ''; this.from = ''; this.mode = '步行'; this._route = null; this._eta = null;
            const root = $('phone-nav'); if (root) root.classList.remove('nv-map-on', 'nv-card-on', 'nv-arrived', 'nv-nomotion');
            this._hideNar();
        },

        // ---------- 純解析 ----------
        parseOpen: function (line) {
            const attr = (name) => { const s = String(line); const m = s.match(new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i')) || s.match(new RegExp('\\b' + name + "\\s*=\\s*'([^']*)'", 'i')); return m ? m[1].trim() : ''; };
            const to = attr('to') || attr('dest') || attr('目的地') || '';
            const from = attr('from') || attr('出發地') || attr('出发地') || '';
            let mode = attr('mode') || attr('by') || '步行';
            const low = mode.toLowerCase();
            if (MODE_LABEL[low]) mode = MODE_LABEL[low];
            if (!MODE_SPEED[mode]) mode = /車|车|taxi|drive/i.test(mode) ? '計程車' : /軌|轨|rail|metro|train/i.test(mode) ? '空軌' : '步行';
            return { to: to || '目的地', from: from || '目前位置', mode };
        },

        classify: function (line) {
            const l = String(line || '').trim();
            if (!l) return { kind: 'skip' };
            let m;
            if ((m = l.match(STEP_RE))) return { kind: 'step', text: m[1].trim() };
            if ((m = l.match(ROUTE_RE))) { const p = m[1].split('|').map(s => s.trim()); return { kind: 'route', time: p[0] || '', dist: p[1] || '' }; }
            if ((m = l.match(ARRIVE_RE))) return { kind: 'arrive', text: (m[1] || '').trim() };
            if (/^\[Nar\|/.test(l)) return { kind: 'nar', text: l.slice(5, -1) };
            if (/^\[Char\|/.test(l)) return { kind: 'char', raw: l };
            if (/^\[(?:Time|With|時間|时间|Chat)[\]：:|]/i.test(l)) return { kind: 'skip' };   // 聊天室那套的行：不畫
            if (/^\[[^\]]*\]$/.test(l) || /^<\/?[a-z]/i.test(l)) return { kind: 'skip' };
            return { kind: 'nar', text: l };   // 沒包 TAG 的字＝路上的旁白
        },

        // 正文裡數一下這趟有幾個 [Step]，路線才知道要切幾段
        countSteps: function (script, index) {
            let n = 0;
            for (let i = index + 1; i < script.length; i++) {
                const l = String(script[i] || '').trim();
                if (l.startsWith('</nav>')) break;
                if (STEP_RE.test(l)) n++;
            }
            return n;
        },

        skipTarget: function (script, index) {
            for (let i = index + 1; i < script.length; i++) if (String(script[i] || '').trim().startsWith('</nav>')) return i;
            return script.length;
        },

        // ---------- 進出 ----------
        initNav: function (core, line) {
            core.mode = 'nav';
            this._core = core;
            const o = this.parseOpen(line);
            this.to = o.to; this.from = o.from; this.mode = o.mode;
            this.steps = Math.max(1, this.countSteps(core.script, core.index));
            this.stepIdx = 0; this.arrived = false; this._eta = null;
            this._hideNar();
            core.toggleUI('phone-nav');
            core.addLog('手機', `導航到「${o.to}」`);
            this._playOpening(core);
        },

        _playOpening: async function (core) {
            const seq = ++this._seq;
            const alive = () => seq === this._seq && core.mode === 'nav';
            const root = $('phone-nav');
            if (!root) { core.next(); return; }
            this.busy = true;
            root.classList.add('nv-nomotion');
            root.classList.remove('nv-map-on', 'nv-card-on', 'nv-arrived');
            void root.offsetHeight;
            root.classList.remove('nv-nomotion');
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
            setText('nv-clock', `${hh}:${mm}`);
            setText('nv-date', `${now.getMonth() + 1}月${now.getDate()}日`);
            this._drawMap();
            const rt = this._route;
            try {
                await sleep(450);                          if (!alive()) return;
                root.classList.add('nv-map-on');           // 主畫面退、地圖進
                await sleep(400);                          if (!alive()) return;
                this._cam(rt.start[0], rt.start[1], 1.7, 1400);   // 慢推近到藍點
                await sleep(1500);                         if (!alive()) return;
                const pin = $('nv-pin'); if (pin) pin.classList.add('nv-drop');
                await sleep(500);                          if (!alive()) return;
                await this._drawRoute(alive);              // 描邊＋光頭＋相機跟
                if (!alive()) return;
                await sleep(150);                          if (!alive()) return;
                this._camFit(700);
                this._renderCard();
                root.classList.add('nv-card-on');
                await sleep(500);
            } finally {
                if (seq === this._seq) this.busy = false;
            }
            if (alive()) core.next();
        },

        exitNav: function (core) {
            this.busy = false;
            this._hideNar();
            core.mode = 'vn';
            core.toggleUI('vn');
            core.next();
        },

        tap: function () {
            if (this.busy) return;
            const core = this._core || win.VN_Core || window.VN_Core;
            if (core) core.next();
        },

        // 返回鍵：跳過剩下的導航行回 VN（同 closeChat）
        back: function () {
            const core = this._core || win.VN_Core || window.VN_Core;
            if (!core || this.busy) return;
            const stop = this.skipTarget(core.script, core.index);
            core.index = Math.min(stop, core.script.length) - 1;
            if (stop >= core.script.length) { this.exitNav(core); return; }
            core.next();
        },

        // ---------- 每行 ----------
        handleNavLine: function (line, core) {
            core.toggleUI('phone-nav');
            const it = this.classify(line);
            switch (it.kind) {
                case 'route':  this._eta = { time: it.time, dist: it.dist }; this._renderCard(); break;
                case 'step':   this._advance(it.text); break;
                case 'arrive': this._arrive(it.text); break;
                case 'nar':    this._narrate(core, '', it.text); break;
                case 'char':   this._speak(core, it.raw); break;
                default: break;
            }
            core.checkAutoNext();
        },

        // ---------- 畫 ----------
        _drawMap: function () {
            const svg = $('nv-svg'); if (!svg) return;
            const seed = `${this.from}→${this.to}`;
            const m = buildMap(seed);
            const rt = buildRoute(m);
            this._route = rt; this._len = rt.len;
            svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
            svg.innerHTML = `<g id="nv-cam">
                <rect x="-600" y="-600" width="${W + 1200}" height="${H + 1200}" class="nv-ground"/>
                ${m.g}
                <path id="nv-route-under" class="nv-route-under" d="${rt.d}"/>
                <path id="nv-route" class="nv-route" d="${rt.d}"/>
                <circle id="nv-head" class="nv-head" r="6" cx="${rt.start[0]}" cy="${rt.start[1]}"/>
                <g transform="translate(${rt.end[0]},${rt.end[1]})"><g id="nv-pin" class="nv-pin">
                    <path class="nv-pin-body" d="M0 0 C -9 -12, -12 -18, -12 -24 A 12 12 0 1 1 12 -24 C 12 -18, 9 -12, 0 0 Z"/>
                    <circle class="nv-pin-hole" cx="0" cy="-24" r="4.5"/>
                </g></g>
                <circle id="nv-halo" class="nv-halo" cx="${rt.start[0]}" cy="${rt.start[1]}" r="10"/>
                <circle id="nv-dot" class="nv-dot" cx="${rt.start[0]}" cy="${rt.start[1]}" r="7"/>
            </g>`;
            const route = $('nv-route'), under = $('nv-route-under');
            const len = route.getTotalLength ? route.getTotalLength() : rt.len;
            this._len = len;
            [route, under].forEach(p => { p.setAttribute('stroke-dasharray', String(len)); p.setAttribute('stroke-dashoffset', String(len)); });
            this._camInstant(W / 2, H / 2, 1);
        },

        // 相機：SVG transform 屬性，用 CSS transition 過渡（在 .nv-cam 上）
        _cam: function (cx, cy, scale, ms) {
            const g = $('nv-cam'); if (!g) return;
            g.style.transitionDuration = (ms || 0) + 'ms';
            const tx = W / 2 - cx * scale, ty = H * 0.42 - cy * scale;
            g.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
        },
        _camInstant: function (cx, cy, scale) { this._cam(cx, cy, scale, 0); },
        _camFit: function (ms) {
            const rt = this._route; if (!rt) return;
            const xs = rt.pts.map(p => p[0]), ys = rt.pts.map(p => p[1]);
            const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
            const spanX = Math.max(80, maxX - minX + 90), spanY = Math.max(140, maxY - minY + 160);
            const scale = Math.min(1.15, Math.max(0.75, Math.min((W - 40) / spanX, (H * 0.62) / spanY)));
            this._cam((minX + maxX) / 2, (minY + maxY) / 2 + 30, scale, ms || 700);
        },

        _drawRoute: function (alive) {
            const route = $('nv-route'), under = $('nv-route-under'), head = $('nv-head');
            if (!route || !under) return Promise.resolve();
            const len = this._len, self = this;
            head.classList.add('nv-on');
            route.setAttribute('stroke-dashoffset', '0'); under.setAttribute('stroke-dashoffset', '0');
            const dur = 1700, t0 = performance.now();
            return new Promise(res => {
                const tick = (now) => {
                    if (!alive()) { res(); return; }
                    const k = Math.min(1, (now - t0) / dur);
                    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
                    const pt = route.getPointAtLength(e * len);
                    head.setAttribute('cx', pt.x); head.setAttribute('cy', pt.y);
                    self._cam(pt.x, pt.y, 1.7, 90);
                    if (k < 1) requestAnimationFrame(tick); else { head.classList.remove('nv-on'); res(); }
                };
                requestAnimationFrame(tick);
            });
        },

        _renderCard: function () {
            const est = estimate(this._len || 300, this.mode);
            const time = (this._eta && this._eta.time) || `${est.minutes} 分鐘`;
            const dist = (this._eta && this._eta.dist) || est.dist;
            const mins = parseInt(String(time).match(/\d+/)?.[0] || est.minutes, 10);
            const arr = new Date(Date.now() + mins * 60000);
            const arrTxt = `${String(arr.getHours()).padStart(2, '0')}:${String(arr.getMinutes()).padStart(2, '0')}`;
            setText('nv-eta', time);
            setText('nv-meta', `${this.mode} · ${dist} · ${arrTxt} 抵達`);
            const step = $('nv-step');
            if (step && !step.dataset.filled) {
                step.innerHTML = `<span class="nv-arrow"><i class="fa-solid fa-location-dot"></i></span><span class="nv-step-text">前往 ${esc(this.to)}</span>`;
            }
        },

        // 一個 [Step]：藍點沿線滑到下一段、相機跟、卡片換字與轉向圖示
        _advance: function (text) {
            const route = $('nv-route'), dot = $('nv-dot'), halo = $('nv-halo');
            if (!route) return;
            const total = this.steps || 1;
            this.stepIdx = Math.min(total, this.stepIdx + 1);
            const fromL = ((this.stepIdx - 1) / total) * this._len, toL = (this.stepIdx / total) * this._len;
            const a = route.getPointAtLength(Math.min(this._len, fromL + 1)), b = route.getPointAtLength(Math.max(0, toL - 1));
            const before = route.getPointAtLength(Math.max(0, fromL - 8));
            // 轉向：比較這一段起點前後的方向
            const d1 = Math.atan2(a.y - before.y, a.x - before.x), d2 = Math.atan2(b.y - a.y, b.x - a.x);
            let turn = ((d2 - d1) * 180 / Math.PI + 540) % 360 - 180;
            const icon = this.stepIdx === 1 || Math.abs(turn) < 40 ? 'fa-arrow-up' : (turn > 0 ? 'fa-arrow-right' : 'fa-arrow-left');
            const step = $('nv-step');
            if (step) { step.dataset.filled = '1'; step.innerHTML = `<span class="nv-arrow"><i class="fa-solid ${icon}"></i></span><span class="nv-step-text">${esc(text)}</span>`; step.classList.remove('nv-swap'); void step.offsetWidth; step.classList.add('nv-swap'); }
            const self = this, dur = 900, t0 = performance.now();
            const tick = (now) => {
                const k = Math.min(1, (now - t0) / dur);
                const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
                const pt = route.getPointAtLength(fromL + (toL - fromL) * e);
                dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
                halo.setAttribute('cx', pt.x); halo.setAttribute('cy', pt.y);
                self._cam(pt.x, pt.y, 1.6, 90);
                if (k < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        },

        _arrive: function (text) {
            const root = $('phone-nav'); if (!root) return;
            this.arrived = true;
            const route = $('nv-route'), dot = $('nv-dot'), halo = $('nv-halo');
            if (route && dot) { const pt = route.getPointAtLength(this._len); dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y); halo.setAttribute('cx', pt.x); halo.setAttribute('cy', pt.y); }
            root.classList.add('nv-arrived');
            this._camFit(700);
            setText('nv-eta', '已到達');
            setText('nv-meta', text || this.to);
            const step = $('nv-step');
            if (step) { step.dataset.filled = '1'; step.innerHTML = `<span class="nv-arrow nv-arrow-done"><i class="fa-solid fa-flag-checkered"></i></span><span class="nv-step-text">${esc(this.to)}</span>`; }
        },

        _narrate: function (core, name, text) {
            const ex = core._extractTextAndSFX ? core._extractTextAndSFX([text]) : { text, sfx: null };
            const box = $('nv-nar'); if (!box) return;
            box.innerHTML = (name ? `<b>${esc(name)}</b>` : '') + (core.parseMarkdown ? core.parseMarkdown(ex.text) : esc(ex.text));
            box.classList.remove('hidden');
            core.addLog(name || '旁白', ex.text);
            if (ex.sfx) core.playSFX(ex.sfx);
            if (!name && core._vnNarrVoicePlay) core._vnNarrVoicePlay(ex.text);
        },

        _speak: function (core, raw) {
            let parts = raw.slice(6, -1).split('|');
            if (core._normCharParts) parts = core._normCharParts(parts);
            const name = parts[0] || '';
            const ex = core._extractTextAndSFX ? core._extractTextAndSFX(parts.slice(2)) : { text: parts.slice(2).join('|'), sfx: null };
            const box = $('nv-nar'); if (!box) return;
            box.innerHTML = `<b>${esc(name)}</b>` + (core.parseMarkdown ? core.parseMarkdown(ex.text) : esc(ex.text));
            box.classList.remove('hidden');
            core.addLog(name, ex.text);
            if (ex.sfx) core.playSFX(ex.sfx);
            try {
                let rawExp = parts[1] || '', typeHint = '';
                if (rawExp.includes('_')) { const p = rawExp.split('_'); typeHint = p[0].trim(); rawExp = p.slice(1).join('_').trim(); }
                if (core._vnSoVITSPlay) core._vnSoVITSPlay(name, ex.text, core._mapExprToEmotion ? core._mapExprToEmotion(rawExp) : rawExp, typeHint);
                const mm = win.OS_MINIMAX || window.OS_MINIMAX;
                if (mm) mm.playForChar(name, core._speechOnly ? core._speechOnly(ex.text) : ex.text, { expression: rawExp });
            } catch (e) { /* 語音失敗不影響畫面 */ }
        },

        _hideNar: function () { const box = $('nv-nar'); if (box) { box.classList.add('hidden'); box.innerHTML = ''; } },

        // 給測試用
        _buildMap: buildMap, _buildRoute: buildRoute, _estimate: estimate,
    };

    function setText(id, s) { const el = $(id); if (el) el.textContent = s; }

    win.VN_Nav = VN_Nav;
    window.VN_Nav = VN_Nav;
})();
