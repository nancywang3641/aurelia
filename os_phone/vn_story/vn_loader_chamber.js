// ----------------------------------------------------------------
// [檔案] vn_loader_chamber.js — 開場 Loading 的「視差校準艙」背景
// 路徑：os_phone/vn_story/vn_loader_chamber.js
// 職責：只做 loading 畫面的氣氛層（透視框／資料碎片／HUD／管理員待機動畫），
//       進度條、狀態文字、跳過按鈕仍是 vn_core 那三個原件，這裡不碰。
//
// 概念：不是一間實體房間，是跑團 API 重新生成期間暫時展開的「現實層校準介面」。
//       中央保持純黑安靜區 —— 管理員動畫是黑底 H.264，疊上去才不會露出方形邊界。
//
// 🚨 收掉 loading 一定要 stop()：面板只是被 display:none 藏起來的話 DOM 還在，
//    rAF 迴圈會一直空轉燒電（跟持續型特效那次是同一個坑）。
// ----------------------------------------------------------------
(function () {
    if (window.VN_LoaderChamber) return;

    const CDN = 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/loading/';
    const CASTS = ['alice', 'rabbit', 'yingying', 'cheshire'];
    const BITS = 70;   // 資料碎片數；動態幅度要小，等待畫面不該比故事本身搶眼

    const CSS = [
        '#vn-start-loader{position:absolute;inset:0;z-index:900;overflow:hidden;background:#000;',
        'display:flex;align-items:center;justify-content:center;}',
        // 外圍暈染：中央那塊挖掉保持純黑
        '#vn-start-loader .vsl-glow{position:absolute;inset:0;pointer-events:none;background:',
        'radial-gradient(58% 46% at 50% 47%,#000 55%,rgba(0,0,0,0) 100%),',
        'radial-gradient(120% 90% at 12% 8%,rgba(60,96,132,.30),transparent 62%),',
        'radial-gradient(120% 90% at 92% 6%,rgba(120,96,52,.16),transparent 58%),',
        'radial-gradient(140% 100% at 50% 108%,rgba(52,84,120,.30),transparent 66%);}',
        // 七層透視框：各自不同速度漂移＝不同現實層正在靠攏
        '#vn-start-loader .vsl-layers{position:absolute;inset:0;pointer-events:none;}',
        '#vn-start-loader .vsl-lyr{position:absolute;inset:0;border:1px solid rgba(143,184,216,.14);',
        'animation:vslDrift var(--d) ease-in-out infinite alternate;}',
        '@keyframes vslDrift{from{transform:scale(var(--s)) translate3d(calc(var(--x) * -1),calc(var(--y) * -1),0);}',
        'to{transform:scale(calc(var(--s) + .012)) translate3d(var(--x),var(--y),0);}}',
        // 對齊態：文字生成完成時逐層收攏
        '#vn-start-loader.vsl-aligned .vsl-lyr{animation-play-state:paused;transition:transform 1.1s cubic-bezier(.22,.9,.3,1);',
        'transform:scale(calc(.5 + (var(--s) - .5) * .55));border-color:rgba(143,184,216,.26);}',
        '#vn-start-loader .vsl-cv{position:absolute;inset:0;width:100%;height:100%;}',
        // LUNA-VII 菱形浮水印：幽靈般的系統水印，不搶戲
        '#vn-start-loader .vsl-mark{position:absolute;top:50%;left:50%;width:46%;aspect-ratio:1;margin:-23% 0 0 -23%;',
        'border:1px solid rgba(143,184,216,.08);pointer-events:none;animation:vslSpin 46s linear infinite;}',
        '#vn-start-loader .vsl-mark::before,#vn-start-loader .vsl-mark::after{content:"";position:absolute;border:1px solid rgba(143,184,216,.06);}',
        '#vn-start-loader .vsl-mark::before{inset:13%;}#vn-start-loader .vsl-mark::after{inset:27%;}',
        '@keyframes vslSpin{from{transform:rotate(45deg);}to{transform:rotate(405deg);}}',
        // 中央角色區
        '#vn-start-loader .vsl-stage{position:absolute;top:10%;left:50%;transform:translateX(-50%);height:56%;',
        'aspect-ratio:16/9;display:grid;place-items:center;pointer-events:none;}',
        // 🔑 黑底影片真正的「去背」：screen 混合對黑色不作用 ⇒ 影片的黑底直接消失，
        //    方形邊界不會再壓在背景暈染上（這就是為什麼不需要真的做透明影片）。
        //    前提是底下那塊要是純黑，所以 .vsl-glow 才把中央挖成 #000 —— 疊在純黑上 screen 的結果就是原色。
        '#vn-start-loader .vsl-vid{height:100%;max-width:100%;object-fit:contain;opacity:0;transition:opacity .6s ease;',
        'mix-blend-mode:screen;}',
        '#vn-start-loader .vsl-vid.on{opacity:1;}',
        // HUD
        '#vn-start-loader .vsl-hud{position:absolute;inset:0;pointer-events:none;}',
        '#vn-start-loader .vsl-tl{position:absolute;top:6.4%;left:5%;}',
        '#vn-start-loader .vsl-tl b{display:block;font-size:clamp(12px,1.5vw,22px);letter-spacing:.13em;color:#eaf3fb;font-weight:400;}',
        '#vn-start-loader .vsl-tl small{display:block;margin-top:5px;font-size:clamp(6px,.7vw,10px);letter-spacing:.2em;color:rgba(143,184,216,.34);}',
        '#vn-start-loader .vsl-tr{position:absolute;top:7.2%;right:5%;font-size:clamp(6px,.7vw,10px);letter-spacing:.16em;color:rgba(143,184,216,.34);}',
        '#vn-start-loader .vsl-tr i{font-style:normal;color:#cfe2f2;}',
        '#vn-start-loader .vsl-bc{position:absolute;bottom:5.6%;left:0;right:0;text-align:center;',
        'font-size:clamp(5px,.6vw,9px);letter-spacing:.34em;color:rgba(143,184,216,.24);}',
        // 進度／狀態／跳過：沿用 vn_core 的三個原件，只換皮
        '#vn-start-loader .vsl-ui{position:absolute;left:0;right:0;bottom:13.5%;display:flex;flex-direction:column;',
        'align-items:center;gap:13px;z-index:2;}',
        '#vn-start-loader-track{position:relative;width:56%;height:2px;background:rgba(143,184,216,.14);border-radius:0;overflow:visible;}',
        '#vn-start-loader-bar{position:absolute;inset:0;width:0%;height:100%;border-radius:0;',
        'background:linear-gradient(90deg,rgba(143,184,216,.25),#8fb8d8);}',
        '#vn-start-loader-bar::after{content:"";position:absolute;right:-3px;top:-2px;width:6px;height:6px;border-radius:50%;',
        'background:#eaf6ff;box-shadow:0 0 9px #8fb8d8;}',
        '#vn-start-loader-label{font-size:clamp(9px,1vw,13px);letter-spacing:.22em;color:rgba(226,238,248,.82);text-transform:none;}',
        '#vn-start-loader-skip{display:none;margin-top:0;font-size:clamp(9px,.86vw,12px);letter-spacing:.16em;',
        'color:rgba(226,238,248,.6);border:1px solid rgba(143,184,216,.28);background:rgba(6,12,18,.5);',
        'border-radius:3px;padding:7px 22px;cursor:pointer;}',
        '#vn-start-loader-skip:hover{color:#fff;border-color:#8fb8d8;}',
        // 完成閃光
        '#vn-start-loader .vsl-flash{position:absolute;inset:0;pointer-events:none;opacity:0;',
        'background:radial-gradient(50% 40% at 50% 46%,rgba(210,235,255,.9),transparent 70%);}',
        '#vn-start-loader.vsl-flashing .vsl-flash{animation:vslFl .5s ease-out;}',
        '@keyframes vslFl{0%{opacity:0;}18%{opacity:1;}100%{opacity:0;}}',
        // 柴郡出場：透視層錯位、RGB 分離、強調色整組換成酸綠
        '#vn-start-loader.vsl-glitch .vsl-layers{animation:vslSk .18s steps(2) infinite;}',
        '#vn-start-loader.vsl-glitch .vsl-tl b{text-shadow:1.5px 0 rgba(255,0,80,.7),-1.5px 0 rgba(0,255,190,.7);}',
        '#vn-start-loader.vsl-glitch .vsl-lyr{border-color:rgba(145,255,24,.18);}',
        '#vn-start-loader.vsl-glitch #vn-start-loader-bar{background:linear-gradient(90deg,rgba(145,255,24,.3),#91ff18);}',
        '#vn-start-loader.vsl-glitch #vn-start-loader-bar::after{background:#eaffd6;box-shadow:0 0 9px #91ff18;}',
        '@keyframes vslSk{0%{transform:translate(0,0);}50%{transform:translate(-2px,1px);}100%{transform:translate(1px,-1px);}}',
    ].join('');

    const S = {
        el: null, cv: null, ctx: null, vid: null,
        raf: 0, bits: [], burst: 0, W: 0, H: 0,
        sync: 42.8, syncTarget: 44, syncTimer: 0, cast: '',
    };

    function _spawn(edge) {
        return {
            a: Math.random() * Math.PI * 2,
            r: edge ? (0.52 + Math.random() * 0.5) : (0.16 + Math.random() * 0.86),
            sz: 1 + Math.random() * 2.4,
            sp: 0.00016 + Math.random() * 0.00042,
            gold: Math.random() < 0.14,
            tw: Math.random() * 6.28,
        };
    }

    function _resize() {
        if (!S.el || !S.cv) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        S.W = S.el.clientWidth; S.H = S.el.clientHeight;
        if (!S.W || !S.H) return;
        S.cv.width = Math.round(S.W * dpr); S.cv.height = Math.round(S.H * dpr);
        S._dpr = dpr;
    }

    function _draw() {
        if (!S.el || !S.el.isConnected) { stop(); return; }
        if (document.hidden) { S.raf = requestAnimationFrame(_draw); return; }
        const w = S.el.clientWidth, h = S.el.clientHeight;
        if (!w || !h) { S.raf = requestAnimationFrame(_draw); return; }
        if (w !== S.W || h !== S.H) _resize();
        const cx = S.ctx;
        cx.setTransform(S._dpr, 0, 0, S._dpr, 0, 0);
        cx.clearRect(0, 0, S.W, S.H);
        const px = S.W / 2, py = S.H * 0.47, R = Math.max(S.W, S.H) * 0.72;
        const flow = S.burst > 0 ? -2.4 : 1;
        if (S.burst > 0) S.burst--;
        for (const b of S.bits) {
            b.r -= b.sp * flow * 16;
            b.tw += 0.03;
            if (b.r < 0.14 || b.r > 1.15) { Object.assign(b, _spawn(b.r >= 1.15 ? false : true)); continue; }
            const x = px + Math.cos(b.a) * b.r * R;
            const y = py + Math.sin(b.a) * b.r * R * 0.62;
            // 越靠近中央越淡：中央要留給管理員動畫
            const fade = Math.min(1, (b.r - 0.15) * 3.2) * (0.42 + Math.sin(b.tw) * 0.3);
            cx.fillStyle = b.gold ? 'rgba(212,175,55,' + (fade * 0.7).toFixed(3) + ')'
                                  : 'rgba(168,205,235,' + fade.toFixed(3) + ')';
            cx.fillRect(x, y, b.sz, b.sz);
        }
        S.raf = requestAnimationFrame(_draw);
    }

    // 把校準艙的層鋪進既有 loader 殼；原本的 track/label/skip 三個原件搬進 .vsl-ui 裡，不換 id
    function mount(el) {
        if (!el) return;
        if (!document.getElementById('vn-sl-chamber-style')) {
            const st = document.createElement('style');
            st.id = 'vn-sl-chamber-style';
            st.textContent = CSS;
            document.head.appendChild(st);
        }
        S.el = el;
        if (el.querySelector('.vsl-glow')) { S.cv = el.querySelector('.vsl-cv'); S.ctx = S.cv.getContext('2d'); S.vid = el.querySelector('.vsl-vid'); return; }

        const track = el.querySelector('#vn-start-loader-track');
        const label = el.querySelector('#vn-start-loader-label');
        const skip = el.querySelector('#vn-start-loader-skip');

        const glow = document.createElement('div'); glow.className = 'vsl-glow';
        const layers = document.createElement('div'); layers.className = 'vsl-layers';
        for (let i = 0; i < 7; i++) {
            const d = document.createElement('div');
            d.className = 'vsl-lyr';
            const t = i / 6;
            d.style.setProperty('--s', (0.995 - t * 0.46).toFixed(3));
            d.style.setProperty('--x', (2.5 + t * 9).toFixed(1) + 'px');
            d.style.setProperty('--y', (1.5 + t * 5).toFixed(1) + 'px');
            d.style.setProperty('--d', (13 + i * 2.6).toFixed(1) + 's');
            d.style.opacity = (0.9 - t * 0.34).toFixed(2);
            layers.appendChild(d);
        }
        const cv = document.createElement('canvas'); cv.className = 'vsl-cv';
        const mark = document.createElement('div'); mark.className = 'vsl-mark';
        const stage = document.createElement('div'); stage.className = 'vsl-stage';
        const vid = document.createElement('video');
        vid.className = 'vsl-vid'; vid.muted = true; vid.loop = true; vid.autoplay = true;
        vid.setAttribute('playsinline', ''); vid.setAttribute('preload', 'auto');
        stage.appendChild(vid);
        const hud = document.createElement('div');
        hud.className = 'vsl-hud';
        hud.innerHTML = '<div class="vsl-tl"><b>NEXUS PARALLAX</b><small>LUNA-VII&nbsp;&nbsp;//&nbsp;&nbsp;CALIBRATION BUFFER</small></div>'
            + '<div class="vsl-tr">REALITY LAYERS <i class="vsl-ly">04</i> &nbsp;//&nbsp; SYNC <i class="vsl-sy">42.8%</i></div>'
            + '<div class="vsl-bc">PARALLAX FIELD STABLE</div>';
        const ui = document.createElement('div'); ui.className = 'vsl-ui';
        const flash = document.createElement('div'); flash.className = 'vsl-flash';

        el.appendChild(glow); el.appendChild(layers); el.appendChild(cv);
        el.appendChild(mark); el.appendChild(stage); el.appendChild(hud);
        el.appendChild(ui); el.appendChild(flash);
        if (track) ui.appendChild(track);
        if (label) ui.appendChild(label);
        if (skip) ui.appendChild(skip);

        S.cv = cv; S.ctx = cv.getContext('2d'); S.vid = vid;
        for (let i = 0; i < BITS; i++) S.bits.push(_spawn(false));
        window.addEventListener('resize', _resize);
    }

    // 每次開 loading 隨機抽一位管理員待機。柴郡抽到就整套 glitch，其餘只換文案。
    function _pickCast() {
        const c = CASTS[Math.floor(Math.random() * CASTS.length)];
        S.cast = c;
        if (S.vid) {
            S.vid.classList.remove('on');
            S.vid.src = CDN + c + '.mp4';
            // 影片載不到就純背景跑，不擋 loading（離線／CDN 掛掉都不該卡住開場）
            S.vid.oncanplay = () => { S.vid.classList.add('on'); };
            S.vid.onerror = () => { S.vid.classList.remove('on'); };
            try { const p = S.vid.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
        }
        if (S.el) S.el.classList.toggle('vsl-glitch', c === 'cheshire');
        return c;
    }

    function start() {
        if (!S.el) return;
        _resize();
        if (!S.cast) _pickCast();
        if (!S.raf) S.raf = requestAnimationFrame(_draw);
        if (!S.syncTimer) {
            S.syncTimer = setInterval(() => {
                S.sync += (S.syncTarget - S.sync) * 0.08;
                const e = S.el && S.el.querySelector('.vsl-sy');
                if (e) e.textContent = S.sync.toFixed(1) + '%';
            }, 90);
        }
    }

    function stop() {
        if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
        if (S.syncTimer) { clearInterval(S.syncTimer); S.syncTimer = 0; }
        // 影片也要停：detached 的 video 在某些瀏覽器會繼續解碼
        if (S.vid) { try { S.vid.pause(); } catch (e) {} S.vid.classList.remove('on'); }
        S.cast = '';
        S.sync = 42.8; S.syncTarget = 44;
        if (S.el) S.el.classList.remove('vsl-aligned', 'vsl-flashing');
    }

    // 階段：wait 等待開始／text 文字生成／img 圖片生成／done 完成
    function phase(name) {
        if (!S.el) return;
        const ly = S.el.querySelector('.vsl-ly'), bc = S.el.querySelector('.vsl-bc');
        const set = (l, b) => { if (ly) ly.textContent = l; if (bc) bc.textContent = b; };
        S.el.classList.remove('vsl-aligned');
        if (name === 'text') { S.syncTarget = 71; S.el.classList.add('vsl-aligned'); set('05', 'REALITY LAYERS CONVERGING'); }
        else if (name === 'img') { S.syncTarget = 88; S.burst = 44; set('06', 'RENDERING VISUAL LAYER'); }
        else if (name === 'done') {
            S.syncTarget = 100; S.sync = 100;
            S.el.classList.add('vsl-aligned', 'vsl-flashing');
            set('07', 'ALL LAYERS ALIGNED');
            setTimeout(() => { if (S.el) S.el.classList.remove('vsl-flashing'); }, 600);
        } else { S.syncTarget = 44; set('04', 'PARALLAX FIELD STABLE'); }
    }

    window.VN_LoaderChamber = { mount, start, stop, phase, get cast() { return S.cast; } };
    console.log('🛰 [VN LoaderChamber] 視差校準艙就緒');
})();
