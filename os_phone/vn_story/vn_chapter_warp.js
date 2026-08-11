// ----------------------------------------------------------------
// [檔案] vn_chapter_warp.js — 「進入章節」穿越轉場（碎裂 zoom-in）
// 路徑：os_phone/vn_story/vn_chapter_warp.js
// 職責：點「進入章節」→ 選中卡的場景縮圖 punch-in 放大 + datamosh 方塊碎裂
//       + 假 radial blur + 白閃 → 高峰時回呼真正的載入（校準艙 loading 在底下接手）。
//       只管演出，載入邏輯仍在 vn_panels 的 _loadChapter。
//
// 效果拆解（照 Gemini 概念片仿製，純 2D canvas、零 WebGL）：
//   ① punch-in：從縮圖矩形一路放大到蓋滿容器再往裡衝，origin 釘在畫面中心偏上
//      （走廊構圖的消失點九成在那）→「走進圖裡」的體感。
//   ② datamosh：畫面切格，部分格子用「滯後的縮放時間」重畫同一張圖＝顯示到舊幀的壓縮壞塊，
//      另一部分直接白塊（沒讀到資料的 tile）。距消失點越遠滯後越重＝假景深視差。
//   ③ radial blur：同一張圖多疊幾層遞增縮放的半透明 echo，2D 版八成像。
//   ④ 白閃到頂時回呼 doLoad（此刻換場景玩家看不見），canvas 再淡出讓底下的 loading 浮現。
//
// 🚨 canvas 只 drawImage 不 getImageData：縮圖來源可能是無 CORS 的遠端圖，
//    讀像素會炸 taint，純畫不讀就永遠安全。
// 🚨 rAF 迴圈固定時長（~1.4s）自己收尾，另掛 3 秒保險絲：演出中途出錯也要把載入放行，
//    轉場絕不能反過來把章節卡死。
// 開關：localStorage vn_chwarp=0 → 跳過演出直接載入。
// ----------------------------------------------------------------
(function () {
    if (window.VN_ChapterWarp) return;

    const SFX = 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/chapter_ui/enter-warp.mp3';
    const DUR = 1400;          // 演出總長 ms（含尾段淡出）
    const LOAD_AT = 0.72;      // 白閃接近頂點的時刻回呼載入
    let _busy = false;

    function enabled() {
        try { return localStorage.getItem('vn_chwarp') !== '0'; } catch (e) { return true; }
    }

    // 縮圖沒真圖時的退路：把 CSS 漸層字串裡的色碼撈出來畫一張假縮圖，管線照走
    function _gradientCanvas(bgStr, w, h) {
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        const colors = String(bgStr || '').match(/#[0-9a-fA-F]{3,8}/g) || ['#aebfd4', '#d5e0ec'];
        const g = cx.createLinearGradient(0, 0, w * 0.35, h);   // 近似 160deg
        colors.forEach((c, i) => g.addColorStop(colors.length < 2 ? 0 : i / (colors.length - 1), c));
        cx.fillStyle = g;
        cx.fillRect(0, 0, w, h);
        return cv;
    }

    // 取縮圖的圖源：backgroundImage 的 url(...) → Image；只有漸層 → 漸層假圖
    function _sourceFor(thumbEl, bgStr) {
        return new Promise((resolve) => {
            let url = '';
            try {
                const bi = thumbEl && getComputedStyle(thumbEl).backgroundImage;
                const m = bi && bi.match(/url\(["']?([^"')]+)["']?\)/);
                if (m) url = m[1];
            } catch (e) {}
            if (!url) { resolve(_gradientCanvas(bgStr, 640, 400)); return; }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const bail = setTimeout(() => resolve(_gradientCanvas(bgStr, 640, 400)), 800);
            img.onload = () => { clearTimeout(bail); resolve(img); };
            img.onerror = () => { clearTimeout(bail); resolve(_gradientCanvas(bgStr, 640, 400)); };
            img.src = url;
        });
    }

    // 把圖以 cover 畫進矩形，extra 為對矩形中心的額外縮放（punch-in 用）
    function _drawCover(cx, img, r, extra, alpha) {
        const iw = img.width || 1, ih = img.height || 1;
        const s = Math.max(r.w / iw, r.h / ih) * (extra || 1);
        const dw = iw * s, dh = ih * s;
        cx.globalAlpha = alpha == null ? 1 : alpha;
        cx.drawImage(img, r.x + r.w / 2 - dw / 2, r.y + r.h / 2 - dh / 2, dw, dh);
        cx.globalAlpha = 1;
    }

    const _easeIn = (t) => t * t * t;
    const _easeOut = (t) => 1 - Math.pow(1 - t, 3);

    /**
     * 播轉場。opts = { thumb: 縮圖元素, host: 蓋 canvas 的容器, bg: CSS 漸層退路 }
     * doLoad 在白閃高峰執行一次；任何錯誤都保證 doLoad 仍會被呼叫。
     */
    async function play(opts, doLoad) {
        let loaded = false;
        const fire = () => { if (!loaded) { loaded = true; try { doLoad(); } catch (e) { console.error('[ChapterWarp] 載入回呼失敗', e); } } };
        if (_busy || !enabled() || !opts || !opts.host) { fire(); return; }
        _busy = true;
        const fuse = setTimeout(fire, 3000);   // 保險絲：演出掛了也要放行載入

        try {
            const host = opts.host;
            const hr = host.getBoundingClientRect();
            if (!hr.width || !hr.height) { fire(); _busy = false; clearTimeout(fuse); return; }

            try { const a = new Audio(SFX); a.volume = 0.9; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}

            const img = await _sourceFor(opts.thumb, opts.bg);

            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            const cv = document.createElement('canvas');
            cv.className = 'chx-warp-canvas';
            cv.width = Math.round(hr.width * dpr);
            cv.height = Math.round(hr.height * dpr);
            host.appendChild(cv);
            const cx = cv.getContext('2d');
            cx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const W = hr.width, H = hr.height;

            // 起點＝縮圖在容器內的矩形（找不到就用中央小框）；終點＝整個容器
            let r0 = { x: W * 0.36, y: H * 0.3, w: W * 0.28, h: H * 0.3 };
            if (opts.thumb) {
                const tr = opts.thumb.getBoundingClientRect();
                if (tr.width && tr.height) r0 = { x: tr.left - hr.left, y: tr.top - hr.top, w: tr.width, h: tr.height };
            }
            const rFull = { x: 0, y: 0, w: W, h: H };
            // 消失點：中心偏上（穿越走廊時視線釘的地方）
            const vp = { x: W * 0.5, y: H * 0.44 };

            // datamosh 格子：一次生成，各自帶「滯後量」與「白塊機率」；離消失點越遠滯後越重＝假景深
            const COLS = W > 700 ? 18 : 11, ROWS = W > 700 ? 11 : 8;
            const tiles = [];
            for (let gy = 0; gy < ROWS; gy++) {
                for (let gx = 0; gx < COLS; gx++) {
                    if (Math.random() > 0.46) continue;   // 只有一部分格子壞掉，底圖是好的
                    const tx = gx * W / COLS, ty = gy * H / ROWS;
                    const dist = Math.hypot(tx + W / COLS / 2 - vp.x, ty + H / ROWS / 2 - vp.y) / Math.hypot(W / 2, H / 2);
                    tiles.push({
                        x: tx, y: ty, w: W / COLS + 1, h: H / ROWS + 1,
                        lag: (0.06 + Math.random() * 0.1) * (0.35 + dist),   // 滯後的縮放時間
                        white: Math.random() < 0.34,                           // 白塊（沒讀到資料）
                        on: 0.18 + Math.random() * 0.3,                        // 幾時開始壞
                        off: 0.85 + Math.random() * 0.15,                      // 幾時修好/被白閃吃掉
                    });
                }
            }

            // 某時刻 t 的取景框：先從縮圖長到滿版（0~0.38），再往圖裡衝（extra 放大）
            const frameAt = (t) => {
                const g = _easeOut(Math.min(1, t / 0.38));
                const r = {
                    x: r0.x + (rFull.x - r0.x) * g, y: r0.y + (rFull.y - r0.y) * g,
                    w: r0.w + (rFull.w - r0.w) * g, h: r0.h + (rFull.h - r0.h) * g,
                };
                const extra = 1 + 4.2 * _easeIn(Math.max(0, (t - 0.3) / 0.7));
                return { r, extra };
            };

            const t0 = performance.now();
            const tick = () => {
                const t = (performance.now() - t0) / DUR;
                if (t >= 1) { cv.remove(); _busy = false; clearTimeout(fuse); return; }
                cx.clearRect(0, 0, W, H);

                const { r, extra } = frameAt(t);
                // 假 radial blur：3 層遞減縮放的殘影墊底 + 本幀
                for (let e = 3; e >= 1; e--) _drawCover(cx, img, r, extra * (1 - e * 0.045), 0.16);
                _drawCover(cx, img, r, extra, 1);

                // datamosh 壞塊：clip 出格子，用滯後時間的取景重畫（＝顯示到舊幀）
                for (const tile of tiles) {
                    if (t < tile.on || t > tile.off) continue;
                    cx.save();
                    cx.beginPath();
                    cx.rect(tile.x, tile.y, tile.w, tile.h);
                    cx.clip();
                    if (tile.white) {
                        cx.fillStyle = 'rgba(255,255,255,' + (0.55 + 0.4 * Math.random()).toFixed(2) + ')';
                        cx.fillRect(tile.x, tile.y, tile.w, tile.h);
                    } else {
                        const lagF = frameAt(Math.max(0, t - tile.lag));
                        _drawCover(cx, img, lagF.r, lagF.extra, 1);
                    }
                    cx.restore();
                }

                // 白閃：0.55 起爬，LOAD_AT 附近到頂；頂點後整片白蓋住換場景
                const flash = Math.max(0, (t - 0.55) / 0.3);
                if (flash > 0) {
                    cx.fillStyle = 'rgba(255,255,255,' + Math.min(1, _easeIn(Math.min(1, flash))).toFixed(3) + ')';
                    cx.fillRect(0, 0, W, H);
                }
                if (t >= LOAD_AT) fire();
                // 尾段：白幕淡出，底下的校準艙 loading 浮現
                if (t > 0.86) cv.style.opacity = String(Math.max(0, 1 - (t - 0.86) / 0.14));

                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        } catch (e) {
            console.warn('[ChapterWarp] 演出失敗，直接載入', e);
            fire(); _busy = false; clearTimeout(fuse);
        }
    }

    window.VN_ChapterWarp = { play, get busy() { return _busy; } };
    console.log('🌀 [VN ChapterWarp] 章節穿越轉場就緒');
})();
