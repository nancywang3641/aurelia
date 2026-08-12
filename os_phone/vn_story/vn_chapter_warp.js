// ----------------------------------------------------------------
// [檔案] vn_chapter_warp.js — 「進入章節」穿越轉場（整面 zoom-in＋碎裂）
// 路徑：os_phone/vn_story/vn_chapter_warp.js
// 職責：點「進入章節」→ 整個章節面板（卡片＋UI＋背景）一起衝向選中卡並碎裂
//       → 目的地場景從碎塊間滲入 → 白閃到頂時回呼真正的載入（校準艙在底下接手）。
//       只管演出，載入邏輯仍在 vn_panels 的 _loadChapter。
//
// 效果拆解（照 Gemini 概念片仿製，零 WebGL 零依賴）：
//   ① punch-in 用「真 DOM 縮放」：WAAPI 對 chapter-window 整個 scale 1→4.6，
//      transform-origin 釘在選中卡縮圖中心——卡片、標題、旁卡全部一起衝，
//      不是抽一張背景圖出來放大（🚨第一版就是那樣，畫面突然換成陌生的大圖，超突兀）。
//   ② 碎片在上層 canvas，會飛，而且碎裂順序是「圓形波前」：從卡片中心的小圓開始
//      往外圈擴大到全屏，波前掃到才碎、波前外零碎片。🚨開場只要有任何一塊碎片出現在
//      外圈（哪怕一塊），眼睛就鎖定那個靜止位置，zoom 動勢直接歸零——第二版滿屏格線
//      如此，第三版「random 權重蓋過距離」也是如此，都實測陣亡。
//      碎片沿射線外爆、越飛越大越淡＝跟 punch-in 同一個方向場。
//      白片＝沒讀到資料；圖片＝目的地場景的對應區塊（生成時凍結，像帶畫面的碎玻璃）。
//   ③ t≈0.55 起目的地場景整層淡入墊底＝衝刺的終點是「已經在場景裡」，再白閃收尾。
//   ④ 白閃全滿（t=0.88）才回呼 doLoad：canvas 大部分是透明的，太早換場景會從
//      碎塊縫隙看到面板消失的瞬間。
//
// 🚨 canvas 只 drawImage 不 getImageData：縮圖來源可能是無 CORS 的遠端圖，
//    讀像素會炸 taint，純畫不讀就永遠安全。
// 🚨 rAF 迴圈固定時長（~1.5s）自己收尾，另掛 3 秒保險絲：演出中途出錯也要把載入放行，
//    轉場絕不能反過來把章節卡死；DOM 縮放結束一定要 cancel＋還原 origin，
//    殘留 transform 會讓下次開面板整個歪掉。
// 開關：localStorage vn_chwarp=0 → 跳過演出直接載入。
// ----------------------------------------------------------------
(function () {
    if (window.VN_ChapterWarp) return;

    // 短版 7.5 秒（原 10 秒版還在同資料夾）；已剪掉素材開頭 0.4 秒純靜音，點擊反饋即時
    const SFX = 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/chapter_ui/enter-warp-short.mp3';
    const DUR = 1500;          // 演出總長 ms（含尾段淡出）
    // 🚨 必須等白閃「全滿」才載入：這版 canvas 大部分是透明的（底下是真 DOM 在縮放），
    //    太早換場景會從碎塊縫隙看到面板消失的瞬間（第一版 0.72 就是這樣穿幫）
    const LOAD_AT = 0.88;
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
     * 播轉場。opts = { thumb: 縮圖元素, host: 蓋 canvas 的容器, zoomEl: 要整個縮放的面板, bg: CSS 漸層退路 }
     * doLoad 在白閃全滿時執行一次；任何錯誤都保證 doLoad 仍會被呼叫。
     */
    async function play(opts, doLoad) {
        let loaded = false;
        const fire = () => { if (!loaded) { loaded = true; try { doLoad(); } catch (e) { console.error('[ChapterWarp] 載入回呼失敗', e); } } };
        if (_busy || !enabled() || !opts || !opts.host) { fire(); return; }
        _busy = true;
        const fuse = setTimeout(fire, 3000);   // 保險絲：演出掛了也要放行載入

        // DOM 縮放的殘局收拾放外層：中途 throw 也要把 transform 還原，不然下次開面板整個歪掉
        let anim = null, zoomEl = null, prevOrigin = '', prevWillChange = '';
        const restore = () => {
            try { if (anim) anim.cancel(); } catch (e) {}
            if (zoomEl) { zoomEl.style.transformOrigin = prevOrigin; zoomEl.style.willChange = prevWillChange; }
            anim = null; zoomEl = null;
        };

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

            // ① 整面 punch-in：真 DOM 縮放，origin 釘在選中卡縮圖中心 → 卡片跟整個面板一起衝
            zoomEl = opts.zoomEl || null;
            let vp = { x: W * 0.5, y: H * 0.44 };   // 消失點（碎塊景深用），預設中心偏上
            if (zoomEl) {
                const zr = zoomEl.getBoundingClientRect();
                let ox = 50, oy = 44;
                if (opts.thumb) {
                    const tr = opts.thumb.getBoundingClientRect();
                    if (tr.width && zr.width) {
                        ox = (tr.left + tr.width / 2 - zr.left) / zr.width * 100;
                        oy = (tr.top + tr.height / 2 - zr.top) / zr.height * 100;
                        vp = { x: (tr.left + tr.width / 2 - hr.left), y: (tr.top + tr.height / 2 - hr.top) };
                    }
                }
                prevOrigin = zoomEl.style.transformOrigin;
                prevWillChange = zoomEl.style.willChange;
                zoomEl.style.transformOrigin = ox.toFixed(2) + '% ' + oy.toFixed(2) + '%';
                zoomEl.style.willChange = 'transform';
                // 前段就要衝起來：慢熱曲線＋滿屏靜止碎塊＝觀感上「沒有 zoom」（上一版的死因）
                anim = zoomEl.animate(
                    [
                        { transform: 'scale(1)', easing: 'cubic-bezier(0.4, 0, 0.7, 0.4)' },
                        { transform: 'scale(2)', offset: 0.5, easing: 'cubic-bezier(0.4, 0, 0.8, 0.5)' },
                        { transform: 'scale(4.8)' },
                    ],
                    { duration: Math.round(DUR * LOAD_AT), fill: 'forwards' });
            }

            // ② 碎片：🚨會飛的，不是釘在格線上的。釘死的滿屏格子等於一層靜止紗窗，
            //    把底下的 zoom 動勢整個遮沒（上一版實測）。碎片沿「消失點→自身」的射線向外爆，
            //    越飛越大越淡＝跟 punch-in 同一個方向場，是在放大動勢而不是抵消它。
            //    內容在生成時就凍結（目的地場景的對應區塊或白塊）＝螢幕碎成帶畫面的玻璃片。
            const COLS = W > 700 ? 16 : 10, ROWS = W > 700 ? 10 : 7;
            const iw = img.width || 1, ih = img.height || 1;
            const cover0 = Math.max(W / iw, H / ih);
            const cox = W / 2 - iw * cover0 / 2, coy = H / 2 - ih * cover0 / 2;   // 目的地圖 cover 全屏的貼法
            // 🚨 碎裂順序是嚴格的圓形波前：從卡片中心的小圓開始、圓圈擴大到全屏，
            //    波前掃到那格才准碎，波前外面一塊碎片都沒有——開場任何一塊碎片出現在
            //    外圈（哪怕只有一塊），眼睛就會鎖定那個靜止格線，zoom 動勢直接歸零
            //    （第三版的 dist*0.25+random*0.25 就是這樣死的：random 比 dist 權重還大，
            //    等於開場就全屏撒碎片）。距離正規化用「離消失點最遠的角落」，波前才會
            //    真的掃完整個畫面。jitter 只留 0.03，攪不亂掃描順序。
            const maxDist = Math.max(
                Math.hypot(vp.x, vp.y), Math.hypot(W - vp.x, vp.y),
                Math.hypot(vp.x, H - vp.y), Math.hypot(W - vp.x, H - vp.y));
            const WAVE_T0 = 0.12, WAVE_T1 = 0.68;   // 波前從中心到最遠角落的時間窗
            const shards = [];
            for (let gy = 0; gy < ROWS; gy++) {
                for (let gx = 0; gx < COLS; gx++) {
                    if (Math.random() > 0.62) continue;
                    const x = gx * W / COLS, y = gy * H / ROWS, w = W / COLS + 1, h = H / ROWS + 1;
                    const dist = Math.hypot(x + w / 2 - vp.x, y + h / 2 - vp.y) / maxDist;
                    shards.push({
                        x, y, w, h, dist,
                        white: Math.random() < 0.42,
                        on: WAVE_T0 + (WAVE_T1 - WAVE_T0) * dist + Math.random() * 0.03,
                        speed: 2.2 + Math.random() * 2 + dist * 1.6,     // 遠的飛得快＝假景深
                        // 圖塊內容凍結：取目的地場景在這個位置的區塊（cover 對映回原圖座標）
                        sx: (x - cox) / cover0, sy: (y - coy) / cover0, sw: w / cover0, sh: h / cover0,
                    });
                }
            }
            const rFull = { x: 0, y: 0, w: W, h: H };

            const t0 = performance.now();
            const tick = () => {
                const t = (performance.now() - t0) / DUR;
                if (t >= 1) { cv.remove(); restore(); _busy = false; clearTimeout(fuse); return; }
                cx.clearRect(0, 0, W, H);

                // ③ 目的地場景滲入墊底：t≈0.55 起整層淡入並緩慢推進＝衝刺終點已在場景裡
                const arrive = Math.max(0, (t - 0.55) / 0.3);
                if (arrive > 0) _drawCover(cx, img, rFull, 1 + 0.35 * _easeOut(Math.min(1, arrive)), Math.min(0.92, _easeOut(Math.min(1, arrive))));

                // 飛行碎片：沿射線外爆、放大、後段淡出
                for (const s of shards) {
                    if (t < s.on) continue;
                    const u = Math.min(1, (t - s.on) / (1 - s.on));
                    const k = 1 + s.speed * _easeIn(u);                  // 位置外推倍率＝跟 zoom 同方向場
                    const px = vp.x + (s.x + s.w / 2 - vp.x) * k;
                    const py = vp.y + (s.y + s.h / 2 - vp.y) * k;
                    const g = 1 + 1.6 * _easeIn(u);                      // 碎片自身也放大
                    const dw = s.w * g, dh = s.h * g;
                    const a = u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.45);
                    if (px + dw / 2 < 0 || px - dw / 2 > W || py + dh / 2 < 0 || py - dh / 2 > H) continue;
                    if (s.white) {
                        cx.fillStyle = 'rgba(255,255,255,' + (a * 0.9).toFixed(2) + ')';
                        cx.fillRect(px - dw / 2, py - dh / 2, dw, dh);
                    } else {
                        cx.globalAlpha = a;
                        try { cx.drawImage(img, s.sx, s.sy, s.sw, s.sh, px - dw / 2, py - dh / 2, dw, dh); } catch (e) {}
                        cx.globalAlpha = 1;
                    }
                }

                // ④ 白閃：0.6 起爬，0.88 全滿（此刻才真正換場景），尾段淡出交給 loading
                const flash = Math.max(0, (t - 0.6) / 0.28);
                if (flash > 0) {
                    cx.fillStyle = 'rgba(255,255,255,' + Math.min(1, _easeIn(Math.min(1, flash))).toFixed(3) + ')';
                    cx.fillRect(0, 0, W, H);
                }
                if (t >= LOAD_AT) { fire(); restore(); }   // 面板已藏在全白底下，transform 立刻還原也看不見
                if (t > 0.9) cv.style.opacity = String(Math.max(0, 1 - (t - 0.9) / 0.1));

                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        } catch (e) {
            console.warn('[ChapterWarp] 演出失敗，直接載入', e);
            restore(); fire(); _busy = false; clearTimeout(fuse);
        }
    }

    window.VN_ChapterWarp = { play, get busy() { return _busy; } };
    console.log('🌀 [VN ChapterWarp] 章節穿越轉場就緒');
})();
