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
//   ② 碎裂＝白色碎片沿「圓形波前」從卡面剝落（卡心小圓→卡角），沿卡心射線外飛、
//      微轉、淡出；🚨卡片本體保持一張完整的——把卡片內容切碎飛（縮圖剁成暗色塊）
//      實測醜爆；白片在卡上時白對白隱形、飛出卡外立刻可見＝天然的「從邊緣剝落」。
//      波前外零碎片：開場只要有任何一塊碎片出現在外圈，眼睛就鎖定那個靜止位置，
//      zoom 動勢直接歸零（滿屏格線版與 random 蓋過距離版都實測陣亡）。
//      旁卡同時被爆風沿「卡心→旁卡心」推出畫面（composite:'add' 疊在輪播定位上）。
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

    // v2 語音 5.3 秒（前兩版 7.9／10 秒還在同資料夾）；開頭無靜音，點擊反饋即時
    const SFX = 'https://cdn.jsdelivr.net/gh/nancywang3641/aurelia-ui-assets@v1/aseets/chapter_ui/enter-warp-short-v2.mp3';
    const DUR = 1150;          // 演出總長 ms（含尾段淡出）；1500 版點下去到進場景要 1.32 秒，拖
    // 🚨 必須等白閃「全滿」才載入：這版 canvas 大部分是透明的（底下是真 DOM 在縮放），
    //    太早換場景會從碎塊縫隙看到面板消失的瞬間（第一版 0.72 就是這樣穿幫）
    const LOAD_AT = 0.88;
    let _busy = false;

    function enabled() {
        try { return localStorage.getItem('vn_chwarp') !== '0'; } catch (e) { return true; }
    }

    // 語音預載：開章節面板時就抓好（vn_panels 呼叫）。點下去才 new Audio 的話，
    // 下載＋解碼那段就是「聲音慢畫面一拍」——畫面現在 12ms 就動，聲音更顯得拖。
    let _sfx = null;
    function prime() {
        if (_sfx || !enabled()) return;
        try { _sfx = new Audio(SFX); _sfx.preload = 'auto'; _sfx.volume = 0.9; _sfx.load(); } catch (e) { _sfx = null; }
    }
    // 播語音：預載好的直接倒帶重播（零解碼）；還沒好就照舊現開一顆
    function _playSfx() {
        try {
            prime();
            const a = _sfx && _sfx.readyState >= 2 ? _sfx : new Audio(SFX);
            a.volume = 0.9;
            try { a.currentTime = 0; } catch (e) {}
            const p = a.play();
            if (p && p.catch) p.catch(() => {});
        } catch (e) {}
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
            // 🚨 絕不要設 crossOrigin='anonymous'：這裡只 drawImage 不 getImageData，本來就不需要 CORS，
            //    但加了它會讓瀏覽器把這次請求視為另一個快取鍵 → 明明縮圖剛剛才顯示過，
            //    演出時整張圖重新下載一次，網路慢就撞 800ms 逾時＝點下去乾等一秒。
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
        // 🚨 doLoad 掛掉不能只印 console：玩家看到的是「點了進入章節→演完→回到章節選擇」，
        //    完全不知道發生什麼事（她沒有 console）。錯誤一定要浮到畫面上。
        const fire = () => {
            if (loaded) return;
            loaded = true;
            try { doLoad(); } catch (e) {
                console.error('[ChapterWarp] 載入回呼失敗', e);
                try {
                    const T = window.toastr || (window.parent && window.parent.toastr);
                    if (T && T.error) T.error('章節載入失敗：' + (e && e.message ? e.message : e), '', { timeOut: 12000 });
                    else alert('章節載入失敗：' + (e && e.message ? e.message : e));
                } catch (_) {}
            }
        };
        if (_busy || !enabled() || !opts || !opts.host) { fire(); return; }
        _busy = true;
        // 保險絲：演出掛了也要放行載入。DUR 才 1.15 秒，3 秒還沒收場＝rAF 停了
        // （面板被藏起來時瀏覽器會停發幀），順手把殘局收掉並解鎖 _busy，
        // 否則旗標卡住，之後每次進章節都會被當成「正在演出」直接跳過轉場。
        const fuse = setTimeout(() => { fire(); try { restore(); } catch (e) {} _busy = false; }, 3000);

        // 殘局收拾放外層：中途 throw 也要拆掉碎片層、把原卡還原、取消旁卡動畫，
        // 不然面板上永遠疊著一張假卡（或旁卡永遠停在飛出去的位置）
        let wrap = null, hidCard = null, sideAnims = [];
        const restore = () => {
            try { if (wrap) wrap.remove(); } catch (e) {}
            if (hidCard) hidCard.style.visibility = '';
            sideAnims.forEach(a => { try { a.cancel(); } catch (e) {} });
            wrap = null; hidCard = null; sideAnims = [];
        };

        try {
            const tStart = performance.now();      // 圖晚到時要判斷「碎裂開始了沒」
            const host = opts.host;
            const hr = host.getBoundingClientRect();
            if (!hr.width || !hr.height) { fire(); _busy = false; clearTimeout(fuse); return; }

            _playSfx();

            // 🚨 絕不 await 圖再開演：演出第一幀完全不需要它（碎片要到 t=0.34 才現形、
            //    場景層要到 t=0.55），先 await 等於把圖的載入時間變成「點下去毫無反應」的空窗。
            //    圖到了再回頭補：碎片貼圖、canvas 場景層啟用；沒到就是白片＋純白閃，演出照跑。
            let img = null;
            const imgP = _sourceFor(opts.thumb, opts.bg);

            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            const cv = document.createElement('canvas');
            cv.className = 'chx-warp-canvas';
            cv.width = Math.round(hr.width * dpr);
            cv.height = Math.round(hr.height * dpr);
            host.appendChild(cv);
            const cx = cv.getContext('2d');
            cx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const W = hr.width, H = hr.height;

            // ① 卡片本體 punch-in ＋ 真 DOM 碎裂：
            //    把選中卡 clone 35 份、每份 clip-path 只露一格，全部裝進跟卡片同位置的 wrapper；
            //    wrapper 整個 zoom（＝卡片衝向玩家），波前掃到的格子帶著自己的 transform 沿
            //    卡心射線飛出去——巢狀 transform 相乘，碎片同時被 zoom 帶著走，方向場一致。
            //    🚨 wrapper 必須掛回 chapter-window 裡：卡片的字級/框角全是 cqw/cqh，
            //    掛外面 container units 斷鏈、碎片全變形。
            //    面板其餘部分不動（前幾版整面 zoom 被驗證是錯的主角）。
            const card = opts.thumb && opts.thumb.closest ? opts.thumb.closest('.chx-card') : null;
            const mount = opts.zoomEl || host;
            if (card && mount) {
                const mrect = mount.getBoundingClientRect();
                const crect = card.getBoundingClientRect();
                wrap = document.createElement('div');
                wrap.className = 'chx-warp-shatter';
                wrap.style.cssText = 'position:absolute;left:' + (crect.left - mrect.left) + 'px;top:' + (crect.top - mrect.top) +
                    'px;width:' + crect.width + 'px;height:' + crect.height + 'px;z-index:55;pointer-events:none;will-change:transform;';
                // 卡片 zoom：前段就要衝起來，中點破 2 倍、結尾 6 倍（卡片是主角，衝得比整面版狠）
                // 🚨 第一幀就要看得出動作：純 ease-in 起手（scale 1 配 cubic-bezier(.42,0,...)）前
                //    三分之一幾乎靜止，點下去像沒反應＝延遲感的真兇（不是掉幀也不是等圖，都量過）。
                //    改成「按壓 → 彈起 → 衝刺」：頭 100ms 就有可讀的動作，衝刺曲線接在後面。
                wrap.animate(
                    [
                        { transform: 'scale(0.965)', offset: 0, easing: 'cubic-bezier(0.2, 0, 0.2, 1)' },
                        { transform: 'scale(1.08)', offset: 0.1, easing: 'cubic-bezier(0.35, 0, 0.75, 0.45)' },
                        { transform: 'scale(2.6)', offset: 0.52, easing: 'cubic-bezier(0.4, 0, 0.8, 0.5)' },
                        { transform: 'scale(6.4)' },
                    ],
                    { duration: Math.round(DUR * LOAD_AT), fill: 'forwards' });

                // 🚨 卡片保持一張完整的：把卡片內容切碎飛（縮圖被剁成暗色塊）實測醜爆。
                //    完整 clone 一張在中間衝，碎裂感全部交給「白色碎片」——從卡面沿波前剝落、
                //    向外飛、微轉、淡出，像玻璃鍍膜一片片崩掉，中間的卡從頭到尾讀得出來。
                const clone = card.cloneNode(true);
                // 🚨 z-index:1 必須寫死：clone 帶著輪播選中卡的 z-index:6，碎片 z-auto 整層
                //    被墊在卡片底下＝碎了完全看不見（實測踩過）
                clone.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;max-width:none;aspect-ratio:auto;transform:none;margin:0;z-index:1;';
                wrap.appendChild(clone);

                const CS = 9, RS = 12;                    // 碎片格數
                const cw = crect.width, chh = crect.height;
                const cxc = cw / 2, cyc = chh / 2;
                const maxD = Math.hypot(cxc, cyc);

                // 碎片貼場景圖：取景**完全對齊底下的縮圖**（同一個 cover 縮放與置中偏移），
                //  每格再用負偏移露出自己那一塊＝縮圖本身裂成方塊浮起飛走。
                //  🚨 取景必須跟縮圖一致：改用整張卡去 cover 會變成另一個裁切，
                //     碎片跟底下的畫面對不上，讀起來只是半透明玻璃格（實測過）。
                //  卡片白底區的格子落在圖框外 → 維持白片，跟卡面本來的顏色一致。
                // 🚨 純 CSS background 只是貼圖不讀像素，遠端無 CORS 圖照樣安全（canvas 才會 taint）。
                const trect = opts.thumb && opts.thumb.getBoundingClientRect ? opts.thumb.getBoundingClientRect() : null;
                const _bgOf = (im) => {
                    // 🚨 只認真實圖片的 src：漸層退路是 canvas，轉 dataURL 會把幾十 KB 的 base64
                    //    塞進近百個 inline style（整段演出瞬間吃掉數 MB）——沒真圖就乖乖用白片
                    if (!im || !im.src || !trect || !trect.width) return null;
                    const iw = im.width || 1, ih = im.height || 1;
                    const tw = trect.width, th = trect.height;
                    const s = Math.max(tw / iw, th / ih);            // 跟 .chx-thumb 的 background-size:cover 同一套算法
                    const bw = iw * s, bh = ih * s;
                    return {
                        url: im.src, bw, bh,
                        ox: (trect.left - crect.left) + (tw - bw) / 2,   // 圖左上角相對卡片左上角
                        oy: (trect.top - crect.top) + (th - bh) / 2,
                    };
                };
                const pieceEls = [];                      // 圖晚到時要回頭補貼的碎片
                // 🚨 波前延到 zoom 一半才起：前 0.4 全是乾淨的衝刺，碎裂是「衝到一半解體」，
                //    開頭就碎會把 zoom 的第一眼吃掉（實測回饋）。
                const WAVE_T0 = 0.34, WAVE_T1 = 0.74;     // 波前：卡心小圓 → 掃到卡角
                for (let gy = 0; gy < RS; gy++) {
                    for (let gx = 0; gx < CS; gx++) {
                        if (Math.random() < 0.18) continue;   // 留些缺口，崩落才不像整齊瓷磚
                        const piece = document.createElement('div');
                        const w = 100 / CS, h = 100 / RS;
                        // 🚨 陰影＋細邊必加：圖塊飛到白閃／白卡上時邊界會糊掉，
                        //    有影子跟細邊才讀得出「一片片浮起剝離」而不是一團色斑
                        const skin = 'background:rgba(255,255,255,' + (0.88 + Math.random() * 0.12).toFixed(2) + ');';
                        piece.style.cssText = 'position:absolute;left:' + (gx * w).toFixed(2) + '%;top:' + (gy * h).toFixed(2) +
                            '%;width:' + w.toFixed(2) + '%;height:' + h.toFixed(2) + '%;' + skin +
                            'border:1px solid rgba(255,255,255,0.55);box-shadow:0 3px 12px rgba(30,52,84,0.45);' +
                            'z-index:3;will-change:transform,opacity;opacity:0;';
                        wrap.appendChild(piece);
                        pieceEls.push({ el: piece, gx, gy });
                        // 這格的剝落時刻＝波前掃到的距離；飛行方向＝卡心 → 格心；
                        // 距離要飛得夠遠——卡片自己也在長大，飛太慢等於永遠貼在卡上
                        const px = (gx + 0.5) / CS * cw, py = (gy + 0.5) / RS * chh;
                        const dist = Math.hypot(px - cxc, py - cyc) / maxD;
                        const on = WAVE_T0 + (WAVE_T1 - WAVE_T0) * dist + Math.random() * 0.03;
                        // 擴散收斂：外推 1.2~2.4 倍卡距就好，太發散會變滿天紙屑、跟卡片脫節
                        const spd = 1.2 + Math.random() * 0.6 + dist * 0.6;
                        const dx = (px - cxc) * spd, dy = (py - cyc) * spd;
                        const rot = (Math.random() - 0.5) * 24;
                        piece.animate(
                            [
                                { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 0, offset: 0 },
                                { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 0, offset: Math.max(0, Math.min(0.98, on - 0.02)) },
                                { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, offset: Math.min(0.985, on) },
                                { transform: 'translate(' + (dx * 0.5).toFixed(1) + 'px,' + (dy * 0.5).toFixed(1) + 'px) rotate(' + (rot * 0.5).toFixed(1) + 'deg) scale(1.15)', opacity: 0.95, offset: Math.min(0.995, on + (1 - on) * 0.5) },
                                { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) rotate(' + rot.toFixed(1) + 'deg) scale(1.3)', opacity: 0 },
                            ],
                            { duration: DUR, easing: 'linear', fill: 'forwards' });
                    }
                }
                mount.appendChild(wrap);

                // 圖到了才貼：碎片還沒開始剝落就補上，已經在飛的維持白片
                // （半路換裝會整片突然變色，比全白更怪）
                imgP.then((im) => {
                    img = im;
                    if (!wrap || !wrap.isConnected) return;
                    if (performance.now() - tStart > DUR * WAVE_T0) return;
                    const pb = _bgOf(im);
                    if (!pb) return;
                    const cellW = cw / CS, cellH = chh / RS;
                    pieceEls.forEach(({ el, gx, gy }) => {
                        const gxPx = gx * cellW, gyPx = gy * cellH;
                        // 這格跟圖框沒交集＝卡片白底那圈，維持白片
                        if (!(gxPx + cellW > pb.ox && gxPx < pb.ox + pb.bw &&
                              gyPx + cellH > pb.oy && gyPx < pb.oy + pb.bh)) return;
                        // 每格露出自己那一塊：整圖尺寸不變，位置扣掉這格的左上角
                        el.style.backgroundImage = "url('" + pb.url + "')";
                        el.style.backgroundSize = pb.bw.toFixed(1) + 'px ' + pb.bh.toFixed(1) + 'px';
                        el.style.backgroundPosition = (pb.ox - gxPx).toFixed(1) + 'px ' + (pb.oy - gyPx).toFixed(1) + 'px';
                        el.style.backgroundRepeat = 'no-repeat';
                        el.style.backgroundColor = 'rgba(255,255,255,0.92)';   // 圖框邊緣那排：沒蓋到的部分接回白卡
                    });
                });

                // 原卡藏起來（完整 clone 就是它的替身）；restore 會還原
                hidCard = card;
                card.style.visibility = 'hidden';

                // 旁卡被爆風推開：沿「選中卡心→旁卡心」方向飛出畫面、微轉、淡出——
                // 跟中心爆炸同一個力場，不是各自亂飛。
                // 🚨 transform 用 composite:'add' 疊在輪播的置中 transform 上；opacity 不能跟著
                //    composite:'add'（base 1＋關鍵幀值＝永遠不透明，淡出會失效），拆成第二支動畫。
                const ccx = crect.left + crect.width / 2, ccy = crect.top + crect.height / 2;
                (card.parentElement ? card.parentElement.querySelectorAll('.chx-card') : []).forEach(sib => {
                    if (sib === card) return;
                    const sr = sib.getBoundingClientRect();
                    if (!sr.width) return;
                    let ddx = sr.left + sr.width / 2 - ccx, ddy = sr.top + sr.height / 2 - ccy;
                    const len = Math.hypot(ddx, ddy) || 1;
                    const fly = Math.max(W, H) * 1.1;
                    ddx = ddx / len * fly; ddy = ddy / len * fly;
                    const rot = ((Math.random() - 0.5) * 26).toFixed(1);
                    const opt = { duration: Math.round(DUR * 0.6), delay: Math.round(DUR * 0.1), fill: 'forwards' };
                    sideAnims.push(sib.animate(
                        [{ transform: 'translate(0,0) rotate(0deg)', easing: 'cubic-bezier(0.55, 0, 0.8, 0.45)' },
                         { transform: 'translate(' + ddx.toFixed(0) + 'px,' + ddy.toFixed(0) + 'px) rotate(' + rot + 'deg) scale(1.3)' }],
                        Object.assign({ composite: 'add' }, opt)));
                    sideAnims.push(sib.animate(
                        [{ opacity: 1, easing: 'cubic-bezier(0.7, 0, 0.9, 0.6)' }, { opacity: 0 }], opt));
                });
            }

            const rFull = { x: 0, y: 0, w: W, h: H };

            const t0 = performance.now();
            const tick = () => {
                const t = (performance.now() - t0) / DUR;
                // 🚨 收場前一定要 fire()：載入是掛在「t 落在 [LOAD_AT,1) 的那一幀」上，
                //    但那段只有 DUR*(1-LOAD_AT)＝138ms（1150 版）。畫面一卡、幀距超過這段，
                //    下一幀就直接 t>=1 收場並清掉保險絲 → doLoad 從沒被呼叫，
                //    玩家看到的正是「zoom in 演完又回到章節面板」。fire() 自帶去重，補呼叫安全。
                //    (1500ms 版窗口 180ms 比較不容易踩到，縮短成 1150 之後就常態化了)
                if (t >= 1) { fire(); cv.remove(); restore(); _busy = false; clearTimeout(fuse); return; }
                cx.clearRect(0, 0, W, H);

                // ③ 目的地場景滲入墊底：t≈0.55 起整層淡入並緩慢推進＝衝刺終點已在場景裡
                const arrive = Math.max(0, (t - 0.55) / 0.3);
                if (arrive > 0 && img) _drawCover(cx, img, rFull, 1 + 0.35 * _easeOut(Math.min(1, arrive)), Math.min(0.92, _easeOut(Math.min(1, arrive))));

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

    window.VN_ChapterWarp = { play, prime, get busy() { return _busy; } };
    console.log('🌀 [VN ChapterWarp] 章節穿越轉場就緒');
})();
