// ----------------------------------------------------------------
// [手機] os_photo_viewer.js
// 職責：點圖片放大看，像 iOS 相簿那樣：
//   從縮圖放大開場、左右滑換張、兩指／雙擊縮放、放大後拖著看、往下拉關掉、底下一排小縮圖可以跳。
//   還沒生成的圖（AI 只寫了描述）也能翻到，顯示描述；有給生成函式就多一顆「展開圖片」。
//
// 用法：
//   OS_PHOTO_VIEWER.open(items, index, { fromEl, thumbOf })
//     items  [{ src, desc, who, when, kind:'image'|'video', gen: async () => url }]
//     fromEl 點下去的那格（開場從它放大）；thumbOf(i) 回第 i 張的縮圖元素（關掉時縮回去）
//   OS_PHOTO_VIEWER.openFrom(el)
//     點到的那張（聊天泡泡的圖、微博九宮格）：同一串的圖自動收進來，可以左右滑
//
// 樣式在 css/os_photo_viewer.css；class 一律 opv- 開頭。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const doc = win.document;

    const MAX_ZOOM = 4;
    const DBL_ZOOM = 2.5;
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const cleanDesc = (d) => {
        const PI = win.OS_PHONE_IMAGE || window.OS_PHONE_IMAGE;
        return PI && PI.displayText ? PI.displayText(d) : String(d || '');
    };

    let S = null;   // 目前開著的那一個

    function open(items, index, opts) {
        if (!Array.isArray(items) || !items.length) return;
        if (S) _destroy();
        opts = opts || {};
        const root = doc.createElement('div');
        root.className = 'opv-root';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.innerHTML =
            '<div class="opv-bg"></div>'
          + '<div class="opv-track"></div>'
          + '<div class="opv-top">'
          +   '<button class="opv-btn opv-close" type="button" aria-label="關閉"><i class="fa-solid fa-chevron-left"></i></button>'
          +   '<div class="opv-meta"><div class="opv-who"></div><div class="opv-sub"></div></div>'
          +   '<span class="opv-top-sp"></span>'
          + '</div>'
          + '<div class="opv-bottom"><div class="opv-cap"></div><div class="opv-strip"></div></div>';
        doc.body.appendChild(root);

        S = {
            root, items: items.map(it => Object.assign({}, it)), idx: clamp(index | 0, 0, items.length - 1),
            opts, track: root.querySelector('.opv-track'), bg: root.querySelector('.opv-bg'),
            slides: [], zoom: { s: 1, x: 0, y: 0 }, chrome: true, closing: false,
            pointers: new Map(), g: null, lastTap: 0, tapTimer: 0
        };
        root.classList.toggle('opv-single', S.items.length < 2);
        S.items.forEach((it, i) => {
            const sl = doc.createElement('div');
            sl.className = 'opv-slide';
            sl.innerHTML = '<div class="opv-zoom"></div>';
            S.track.appendChild(sl);
            S.slides.push(sl);
        });
        _renderStrip();
        _goto(S.idx, false);
        _bind();

        // 開場：從縮圖放大到置中（沒縮圖、或圖還沒載好就淡入）
        const cur = S.slides[S.idx].querySelector('.opv-zoom');
        const from = opts.fromEl && opts.fromEl.getBoundingClientRect ? opts.fromEl.getBoundingClientRect() : null;
        const img = cur.querySelector('img');
        const flip = from && from.width > 4 && img && img.complete && img.naturalWidth;
        if (flip) {
            const to = img.getBoundingClientRect();
            const k = from.width / (to.width || 1);
            const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
            const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
            cur.style.transition = 'none';
            cur.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + k + ')';
            void cur.offsetWidth;
            cur.style.transition = '';
            root.classList.add('opv-on');
            _applyZoom();
        } else {
            void root.offsetWidth;
            root.classList.add('opv-on', 'opv-fadein');
        }
    }

    // 從畫面上點到的那張開：同一串對話／同一則貼文裡的圖全收進來，可以左右滑
    //   認得兩種：共用圖片管道畫的 <img class="os-img-photo">，和帶 data-photo="網址" 的格子（微博九宮格）
    //   範圍：最近的 [data-photo-scope]；沒有就找最近一層會捲動的容器（聊天室訊息列）
    const PICK = 'img.os-img-photo, [data-photo]';
    function _scrollParent(el) {
        for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
            const oy = getComputedStyle(p).overflowY;
            if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
        }
        return null;
    }
    function _srcOf(el) { return el.dataset && el.dataset.photo ? el.dataset.photo : (el.currentSrc || el.src || ''); }
    function openFrom(el) {
        if (!el) return;
        const scope = el.closest('[data-photo-scope]') || _scrollParent(el);
        let list = scope ? [...scope.querySelectorAll(PICK)].filter(x => _srcOf(x)) : [el];
        if (list.indexOf(el) < 0) list = [el];
        open(list.map(x => ({ src: _srcOf(x) })), list.indexOf(el), { fromEl: el, thumbOf: (i) => list[i] });
    }

    // ── 畫面 ─────────────────────────────────────────
    function _slideHTML(it) {
        if (it.src) return '<img class="opv-img" alt="" draggable="false">';
        const video = it.kind === 'video';
        return '<div class="opv-ph">'
             +   '<div class="opv-ph-ic"><i class="fa-solid ' + (video ? 'fa-video' : 'fa-image') + '"></i></div>'
             +   '<div class="opv-ph-tx">' + esc(cleanDesc(it.desc) || (video ? '影片' : '圖片')) + '</div>'
             +   (it.gen && !video ? '<button class="opv-gen" type="button">展開圖片</button>' : '')
             +   (video ? '<div class="opv-ph-note">影片只有文字描述，沒有檔案可以播放</div>' : '')
             + '</div>';
    }

    // 只替眼前這張和左右兩張放圖，其他先空著（一次載全部太吃記憶體）
    function _hydrate() {
        S.slides.forEach((sl, i) => {
            const z = sl.querySelector('.opv-zoom');
            const near = Math.abs(i - S.idx) <= 1;
            if (!near) { if (z.firstChild && z.dataset.k !== 'ph') { z.innerHTML = ''; z.dataset.k = ''; } return; }
            const it = S.items[i];
            const k = it.src ? 'img' : 'ph';
            if (z.dataset.k === k && z.firstChild) return;
            z.dataset.k = k;
            z.innerHTML = _slideHTML(it);
            if (k === 'img') {
                const img = z.querySelector('img');
                img.onerror = () => { z.dataset.k = 'ph'; z.innerHTML = '<div class="opv-ph"><div class="opv-ph-ic"><i class="fa-solid fa-image"></i></div><div class="opv-ph-tx">這張圖載不出來</div></div>'; };
                img.src = it.src;
            } else {
                const b = z.querySelector('.opv-gen');
                if (b) b.onclick = (ev) => { ev.stopPropagation(); _gen(i, b); };
            }
        });
    }

    async function _gen(i, btn) {
        const it = S && S.items[i];
        if (!it || !it.gen || btn.disabled) return;
        btn.disabled = true;
        btn.textContent = '生成中…';
        S.slides[i].classList.add('opv-loading');
        try {
            const url = await it.gen();
            if (!url) throw new Error('沒拿到圖');
            if (!S || S.items[i] !== it) return;
            it.src = url;
            S.slides[i].classList.remove('opv-loading');
            S.slides[i].querySelector('.opv-zoom').dataset.k = '';
            _hydrate();
            _renderStrip();
            _updateChrome();   // 生出來之後描述改放到下方說明列
        } catch (e) {
            console.warn('[PhotoViewer] 生圖失敗:', e);
            if (!S) return;
            S.slides[i].classList.remove('opv-loading');
            btn.disabled = false;
            btn.textContent = '失敗，再試一次';
        }
    }

    function _renderStrip() {
        const strip = S.root.querySelector('.opv-strip');
        if (S.items.length < 2) { strip.innerHTML = ''; return; }
        strip.innerHTML = S.items.map((it, i) =>
            '<button class="opv-th' + (i === S.idx ? ' on' : '') + '" type="button" data-i="' + i + '">'
          + (it.src ? '<img alt="" src="' + esc(it.src) + '" loading="lazy" draggable="false">' : '<i class="fa-solid ' + (it.kind === 'video' ? 'fa-video' : 'fa-image') + '"></i>')
          + '</button>').join('');
        strip.querySelectorAll('.opv-th').forEach(b => {
            b.onclick = (ev) => { ev.stopPropagation(); _goto(+b.dataset.i, true); };
        });
    }

    function _updateChrome() {
        const it = S.items[S.idx];
        S.root.querySelector('.opv-who').textContent = it.who || '';
        const n = S.items.length > 1 ? (S.idx + 1) + ' / ' + S.items.length : '';
        S.root.querySelector('.opv-sub').textContent = [n, it.when || ''].filter(Boolean).join(' · ');
        const cap = S.root.querySelector('.opv-cap');
        const d = it.src && it.desc ? cleanDesc(it.desc) : '';
        cap.textContent = d;
        cap.hidden = !d;
        const strip = S.root.querySelector('.opv-strip');
        S.root.querySelectorAll('.opv-th').forEach((b, i) => {
            b.classList.toggle('on', i === S.idx);
            // 🚨 不用 scrollIntoView：它會連 overflow:hidden 的外層一起捲，整個看圖器被推歪
            if (i === S.idx && strip.scrollWidth > strip.clientWidth) {
                strip.scrollLeft = b.offsetLeft - (strip.clientWidth - b.offsetWidth) / 2;
            }
        });
    }

    function _goto(i, animate) {
        S.idx = clamp(i, 0, S.items.length - 1);
        S.root.scrollLeft = 0; S.root.scrollTop = 0;
        _resetZoom(false);
        S.track.style.transition = animate ? '' : 'none';
        S.track.style.transform = 'translateX(' + (-S.idx * 100) + '%)';
        if (!animate) { void S.track.offsetWidth; S.track.style.transition = ''; }
        _hydrate();
        _updateChrome();
    }

    // ── 縮放 ─────────────────────────────────────────
    function _cur() { return S.slides[S.idx].querySelector('.opv-zoom'); }
    function _curImg() { return _cur().querySelector('img'); }
    function _applyZoom(noAnim) {
        const z = _cur();
        z.style.transition = noAnim ? 'none' : '';
        z.style.transform = 'translate(' + S.zoom.x + 'px,' + S.zoom.y + 'px) scale(' + S.zoom.s + ')';
        S.root.classList.toggle('opv-zoomed', S.zoom.s > 1.01);
    }
    function _resetZoom(anim) {
        S.slides.forEach(sl => { const z = sl.querySelector('.opv-zoom'); z.style.transition = 'none'; z.style.transform = ''; });
        S.zoom = { s: 1, x: 0, y: 0 };
        if (anim !== false) _applyZoom();
        S.root.classList.remove('opv-zoomed');
    }
    // 放大後可以拖多遠：圖放大後超出畫面的那一半
    function _bounds(s) {
        const img = _curImg();
        const vw = S.root.clientWidth, vh = S.root.clientHeight;
        if (!img) return { x: 0, y: 0 };
        const w = img.offsetWidth * s, h = img.offsetHeight * s;
        return { x: Math.max(0, (w - vw) / 2), y: Math.max(0, (h - vh) / 2) };
    }
    function _clampPan() {
        const b = _bounds(S.zoom.s);
        S.zoom.x = clamp(S.zoom.x, -b.x, b.x);
        S.zoom.y = clamp(S.zoom.y, -b.y, b.y);
    }
    // 以畫面上某點為中心縮放（p 是相對畫面中心的座標）
    function _zoomAt(s1, px, py) {
        const s0 = S.zoom.s;
        s1 = clamp(s1, 1, MAX_ZOOM);
        S.zoom.x = px - (px - S.zoom.x) * (s1 / s0);
        S.zoom.y = py - (py - S.zoom.y) * (s1 / s0);
        S.zoom.s = s1;
        if (s1 <= 1.001) { S.zoom.x = 0; S.zoom.y = 0; S.zoom.s = 1; }
        _clampPan();
    }
    function _center(e) {
        const r = S.root.getBoundingClientRect();
        return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
    }

    // ── 手勢 ─────────────────────────────────────────
    function _bind() {
        const root = S.root;
        root.querySelector('.opv-close').onclick = (ev) => { ev.stopPropagation(); close(); };
        root.addEventListener('pointerdown', _down);
        root.addEventListener('pointermove', _move);
        root.addEventListener('pointerup', _up);
        root.addEventListener('pointercancel', _up);
        root.addEventListener('wheel', _wheel, { passive: false });
        doc.addEventListener('keydown', _key, true);
        // 不讓點擊漏到底下的面板
        ['click', 'mousedown', 'touchstart'].forEach(n => root.addEventListener(n, ev => ev.stopPropagation()));
    }
    function _isUi(t) { return t && t.closest && t.closest('.opv-top, .opv-strip, .opv-gen'); }

    function _down(e) {
        if (S.closing || _isUi(e.target)) return;
        try { S.root.setPointerCapture(e.pointerId); } catch (_) {}
        S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (S.pointers.size === 2) {
            const [a, b] = [...S.pointers.values()];
            S.g = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: S.zoom.s,
                    mid: _center({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }), x0: S.zoom.x, y0: S.zoom.y };
            return;
        }
        S.g = { mode: '', sx: e.clientX, sy: e.clientY, t: Date.now(), x0: S.zoom.x, y0: S.zoom.y, moved: false };
    }

    function _move(e) {
        if (!S || !S.pointers.has(e.pointerId) || !S.g) return;
        S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const g = S.g;
        if (g.mode === 'pinch') {
            if (S.pointers.size < 2) return;
            const [a, b] = [...S.pointers.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            S.zoom.s = g.s0; S.zoom.x = g.x0; S.zoom.y = g.y0;
            _zoomAt(g.s0 * d / g.d0, g.mid.x, g.mid.y);
            _applyZoom(true);
            return;
        }
        const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
        if (!g.mode) {
            if (Math.hypot(dx, dy) < 8) return;
            g.moved = true;
            if (S.zoom.s > 1.01) g.mode = 'pan';
            else if (Math.abs(dy) > Math.abs(dx) && dy > 0) g.mode = 'dismiss';
            else if (Math.abs(dx) >= Math.abs(dy)) g.mode = 'swipe';
            else g.mode = 'none';
        }
        if (g.mode === 'pan') {
            S.zoom.x = g.x0 + dx; S.zoom.y = g.y0 + dy;
            const b = _bounds(S.zoom.s);
            // 拖出邊界時給一點阻力，放開再彈回
            S.zoom.x = S.zoom.x > b.x ? b.x + (S.zoom.x - b.x) * 0.3 : S.zoom.x < -b.x ? -b.x + (S.zoom.x + b.x) * 0.3 : S.zoom.x;
            S.zoom.y = S.zoom.y > b.y ? b.y + (S.zoom.y - b.y) * 0.3 : S.zoom.y < -b.y ? -b.y + (S.zoom.y + b.y) * 0.3 : S.zoom.y;
            _applyZoom(true);
        } else if (g.mode === 'swipe') {
            const edge = (S.idx === 0 && dx > 0) || (S.idx === S.items.length - 1 && dx < 0);
            const off = edge ? dx * 0.35 : dx;
            S.track.style.transition = 'none';
            S.track.style.transform = 'translateX(calc(' + (-S.idx * 100) + '% + ' + off + 'px))';
        } else if (g.mode === 'dismiss') {
            const p = clamp(dy / (S.root.clientHeight * 0.6), 0, 1);
            const z = _cur();
            z.style.transition = 'none';
            z.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + (1 - p * 0.25) + ')';
            S.bg.style.transition = 'none';
            S.bg.style.opacity = String(1 - p * 0.9);
            S.root.classList.add('opv-dragging');
        }
    }

    function _up(e) {
        if (!S || !S.pointers.has(e.pointerId)) return;
        S.pointers.delete(e.pointerId);
        const g = S.g;
        if (!g) return;
        if (g.mode === 'pinch') {
            if (S.pointers.size === 0) {
                if (S.zoom.s < 1.05) _resetZoom(); else { _clampPan(); _applyZoom(); }
                S.g = null;
            } else {
                // 放開一指：剩下那指接著拖
                const [p] = [...S.pointers.values()];
                S.g = { mode: S.zoom.s > 1.01 ? 'pan' : 'none', sx: p.x, sy: p.y, t: Date.now(), x0: S.zoom.x, y0: S.zoom.y, moved: true };
            }
            return;
        }
        S.g = null;
        const dx = e.clientX - g.sx, dy = e.clientY - g.sy, dt = Math.max(1, Date.now() - g.t);
        if (g.mode === 'pan') { _clampPan(); _applyZoom(); return; }
        if (g.mode === 'swipe') {
            const w = S.root.clientWidth;
            const fast = Math.abs(dx) / dt > 0.5 && Math.abs(dx) > 30;
            let n = S.idx;
            if (dx < -w * 0.22 || (fast && dx < 0)) n++;
            else if (dx > w * 0.22 || (fast && dx > 0)) n--;
            _goto(n, true);
            return;
        }
        if (g.mode === 'dismiss') {
            S.root.classList.remove('opv-dragging');
            S.bg.style.transition = '';
            if (dy > 110 || dy / dt > 0.6) { close(); return; }
            S.bg.style.opacity = '';
            _applyZoom();
            return;
        }
        if (!g.moved && S.pointers.size === 0) _tap(e);
    }

    function _tap(e) {
        const now = Date.now();
        if (now - S.lastTap < 280) {
            // 雙擊：放大到那一點／縮回
            clearTimeout(S.tapTimer);
            S.lastTap = 0;
            if (!_curImg()) return;
            if (S.zoom.s > 1.01) _resetZoom();
            else { const c = _center(e); _zoomAt(DBL_ZOOM, c.x, c.y); _applyZoom(); }
            return;
        }
        S.lastTap = now;
        S.tapTimer = setTimeout(() => {
            if (!S) return;
            S.chrome = !S.chrome;
            S.root.classList.toggle('opv-bare', !S.chrome);
        }, 280);
    }

    function _wheel(e) {
        if (!S || !_curImg()) return;
        e.preventDefault();
        const c = _center(e);
        _zoomAt(S.zoom.s * Math.exp(-e.deltaY * 0.0022), c.x, c.y);
        _applyZoom(true);
    }

    function _key(e) {
        if (!S) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); _goto(S.idx + 1, true); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); _goto(S.idx - 1, true); }
    }

    // ── 關掉：縮回它的縮圖，找不到縮圖就淡出 ────────────────
    function close() {
        if (!S || S.closing) return;
        S.closing = true;
        const root = S.root;
        const z = _cur();
        const img = _curImg();
        const th = S.opts.thumbOf ? S.opts.thumbOf(S.idx) : (S.idx === 0 || S.items.length === 1 ? S.opts.fromEl : null);
        const tr = th && th.isConnected && th.getBoundingClientRect ? th.getBoundingClientRect() : null;
        const visible = tr && tr.width > 4 && tr.bottom > 0 && tr.top < (win.innerHeight || 9999);
        root.classList.add('opv-closing');
        if (img && visible) {
            const ir = img.getBoundingClientRect();
            const k = tr.width / (ir.width || 1);
            const cx = (tr.left + tr.width / 2) - (ir.left + ir.width / 2);
            const cy = (tr.top + tr.height / 2) - (ir.top + ir.height / 2);
            const m = (z.style.transform || '').match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/);
            const tx = m ? parseFloat(m[1]) : 0, ty = m ? parseFloat(m[2]) : 0, s = m ? parseFloat(m[3]) : 1;
            z.style.transition = '';
            z.style.transform = 'translate(' + (tx + cx) + 'px,' + (ty + cy) + 'px) scale(' + (s * k) + ')';
        } else {
            root.classList.add('opv-fadeout');
        }
        root.classList.remove('opv-on');
        setTimeout(_destroy, 300);
    }

    function _destroy() {
        if (!S) return;
        clearTimeout(S.tapTimer);
        doc.removeEventListener('keydown', _key, true);
        if (S.root.parentNode) S.root.parentNode.removeChild(S.root);
        S = null;
    }

    win.OS_PHOTO_VIEWER = { open, openFrom, close };
    if (win !== window) window.OS_PHOTO_VIEWER = win.OS_PHOTO_VIEWER;
    console.log('[PhotoViewer] 看圖器已載入');
})();
