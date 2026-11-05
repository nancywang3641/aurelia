// ----------------------------------------------------------------
// 🎭 GPT 九宮格表情（11-04）
//   角色圖鑑「生表情」：設置→圖片「每個地方用什麼」的「立繪表情」選了自訂接口（GPT 那種帶圖編輯）時走這條，
//   選 ComfyUI 照舊走 OS_IMAGE_MANAGER.comfyInpaint 一張一張畫。
//   表情：臉裁下來（跟 ComfyUI 那條同一個圈、同一種裁法）排成 3×3，中間那格叫它不准動，一通畫完七個
//         → 找黑線切九格 → 每格拿臉外面（頭髮、耳朵、衣領、背景）跟原圖比，量它挪了多少、放大多少，拉回原位
//         → 臉圈外面那一圈的顏色照原圖對齊 → 只換臉圈裡的顏色，透明度一律照原圖，身體一個點都不碰。
//   動嘴、閉眼：第二通 3×4（直的），每張圖（預設、各表情）一排三格：左＝嘴微張、中＝嘴張開、右＝閉眼；
//         只拿嘴那一小塊、兩隻眼睛那一塊（位置由圖鑑算好給）。一通最多四張圖（11-05 加閉眼前是 4×3、六張）。
//   她 11-04 在 參考資料/EXPR_GPT_LAB.js 試過：「比anima準好多...簡直原生圖，anima肉眼看其實有色差」。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const doc = win.document;

    const LINE = 10;
    const FACE_GRID = { cols: 3, rows: 3, W: 1024, H: 1024 };
    const MOUTH_GRID = { cols: 3, rows: 4, W: 1024, H: 1536 };
    const MOUTH_PER_CALL = MOUTH_GRID.rows;
    const POS9 = ['top left', 'top middle', 'top right', 'middle left', 'center', 'middle right', 'bottom left', 'bottom middle', 'bottom right'];
    // 九格（左到右、上到下）。表情跟圖鑑 EXPR_SET 同七種；GPT 聽句子不聽標籤，所以寫成白話英文。
    //   quiet＝內收（靦腆、冷淡、壓抑的角色：動作小、嘴巴多半閉著）
    //   🚨 只寫臉長什麼樣，不寫「忍住笑／忍住淚」：畫出來常是手摀嘴、手擦淚（11-06 ComfyUI 那條抓到的，圖鑑 EXPR_SET 同一件）
    const FACE_CELLS = [
        { exp: 'Happy',
          normal: 'a gentle, warm smile with the mouth closed and soft, relaxed eyes.',
          quiet: 'a faint, barely visible smile; mouth closed, calm soft eyes.' },
        { exp: 'Laughing',
          normal: 'laughing happily: mouth open in a big smile, eyes squeezed shut into happy curves.',
          quiet: 'a quiet, closed-mouth laugh: eyes squeezed shut into happy curves, a wide smile with the lips together, cheeks lifted.' },
        { exp: 'Shy',
          normal: 'embarrassed: cheeks flushed pink, eyes glancing away to the side, a small wavering mouth.',
          quiet: 'quietly shy: a light blush, gaze lowered and turned aside, mouth closed.' },
        { exp: 'Angry',
          normal: 'angry: brows sharply furrowed, glaring eyes, teeth clenched in a frown.',
          quiet: 'cold anger: a flat, cold stare, brows slightly drawn together, mouth closed in a firm line.' },
        { exp: '_ref' },
        { exp: 'Sad',
          normal: 'sad: brows tilted up in the middle, eyes wet and looking down, mouth turned down.',
          quiet: 'subdued sadness: eyes lowered, a slight frown, mouth closed.' },
        { exp: 'Surprised',
          normal: 'surprised: eyes wide open, eyebrows raised high, mouth open.',
          quiet: 'mildly surprised: eyes slightly widened, eyebrows a little raised, lips slightly parted.' },
        { exp: 'Crying',
          normal: 'crying: tears streaming down both cheeks, brows knotted, mouth open and trembling.',
          quiet: 'quiet tears: eyes glistening and wet, brows drawn up in the middle, a single tear on one cheek, mouth pressed closed.' },
        // 右下這格不用（嘴另外一通做），字照 LAB 她試成功那份原樣留著：整段提示詞跟她看過的一字不差
        { exp: '_talk',
          normal: 'exactly the same face as the center panel, but with the mouth slightly open as if in the middle of saying a word. Nothing else changes.',
          quiet: 'exactly the same face as the center panel, but with the mouth slightly open as if in the middle of saying a word. Nothing else changes.' },
    ];
    const KEEP = 'In every panel keep these exactly as they are: the hair and every strand of the bangs; the head\'s position, size and angle inside the panel; the ears, neck, collar and clothes; the background; the lighting; and the art style, meaning the line weight, the coloring and the shading.';
    const LINES = 'Keep the black lines and the outer black frame exactly where they are. Nothing crosses a line. No hands, text, labels, speech bubbles, symbols or extra people.';
    function facePrompt(style) {
        const lines = FACE_CELLS.map((c, i) => '- ' + POS9[i] + ': ' + (c.exp === '_ref' ? 'leave this panel exactly as it is. It is the reference for all the others.' : (style === 'quiet' ? c.quiet : c.normal)));
        return [
            'This image is a 3 by 3 grid of nine identical close-up crops of one character\'s face, separated by thick black lines. Turn it into an expression sheet of this same character.',
            '',
            KEEP + ' Change only the face itself: eyebrows, eyes, eyelids, mouth and cheeks.',
            LINES,
            'Do not add blush, sweat drops or tears unless a panel asks for them.',
            '',
            'What each panel shows:',
        ].concat(lines).join('\n');
    }
    function mouthPrompt() {
        return [
            'This image is a grid of twelve close-up crops of one character\'s face, three panels across and four rows down, separated by thick black lines. The three panels in a row show the same face.',
            '',
            'In every row, do this:',
            '- Left panel: the character is talking. Open the mouth slightly, as if in the middle of saying a word. If the mouth is already open, open it a little more than it is now.',
            '- Middle panel: the character is talking. Open the mouth wider, as if speaking clearly; clearly wider than the left panel.',
            '- Right panel: the character is blinking. Close both eyes all the way, so the upper eyelids meet the lower ones and only the eyelashes show. Do not open the mouth.',
            '',
            'In the left and middle panels, change only the lips and the inside of the mouth. Keep each face\'s mood by keeping the direction of the mouth corners and the shape of the lips; only change how far the lips and jaw open. Keep the eyes, eyebrows, cheeks and any blush or tears exactly as they are.',
            'In the right panel, change only the eyes and eyelids. Keep the eyebrows, mouth, cheeks and any blush or tears exactly as they are.',
            'Apart from that, the three panels of a row stay identical. ' + KEEP,
            LINES,
        ].join('\n');
    }

    // ---------- 畫布小工具（跟圖鑑同一套） ----------
    function canvasOf(w, h) { const c = doc.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
    function loadImg(src) {
        return new Promise((res, rej) => {
            const i = new Image();
            if (/^https?:/i.test(src)) i.crossOrigin = 'anonymous';
            i.onload = () => res(i); i.onerror = () => rej(new Error('圖讀不到'));
            i.src = src;
        });
    }
    function softOval(g, cx, cy, rx, ry, soft) {
        g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
        const gr = g.createRadialGradient(0, 0, Math.max(0, rx - soft), 0, 0, rx);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
    }
    const sizeOf = (im) => ({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height });
    // 臉那塊的範圍：正方形＝圖鑑 cropOf（圈的 2.2 倍）；aspect＝格子寬÷高（動嘴那張的格子是橫的），裁的時候照格子的比例
    function cropRect(ring, w, h, aspect) {
        let ch = Math.max(16, Math.min(w, h, Math.round(Math.max(ring.rx, ring.ry) * 2 * 2.2))), cw = ch;
        if (aspect && aspect !== 1) {
            cw = Math.round(ch * aspect);
            if (cw > w) { cw = w; ch = Math.round(w / aspect); }
            if (ch > h) { ch = h; cw = Math.round(h * aspect); }
        }
        const L = Math.round(Math.max(0, Math.min(w - cw, ring.cx - cw / 2))), T = Math.round(Math.max(0, Math.min(h - ch, ring.cy - ch / 2)));
        return { L, T, cw, ch, oval: { cx: (ring.cx - L) / cw, cy: (ring.cy - T) / ch, rx: ring.rx / cw, ry: ring.ry / ch } };
    }
    function cropCanvas(img, rect) {
        const c = canvasOf(rect.cw, rect.ch), g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, rect.cw, rect.ch);   // 去背過的透明處墊白，模型看不懂透明
        g.drawImage(img, rect.L, rect.T, rect.cw, rect.ch, 0, 0, rect.cw, rect.ch);
        return c;
    }
    function cellSize(G) { return { w: Math.floor((G.W - LINE * (G.cols + 1)) / G.cols), h: Math.floor((G.H - LINE * (G.rows + 1)) / G.rows) }; }
    function cellBox(G, i) { const s = cellSize(G), r = Math.floor(i / G.cols), c = i % G.cols; return { x: LINE + c * (s.w + LINE), y: LINE + r * (s.h + LINE), w: s.w, h: s.h }; }
    function makeMother(G, crops) {
        const c = canvasOf(G.W, G.H), g = c.getContext('2d');
        g.fillStyle = '#000'; g.fillRect(0, 0, G.W, G.H);
        g.imageSmoothingQuality = 'high';
        for (let i = 0; i < G.cols * G.rows; i++) { const b = cellBox(G, i), cv = crops[i % crops.length]; g.drawImage(cv, 0, 0, cv.width, cv.height, b.x, b.y, b.w, b.h); }
        return c;
    }

    // ---------- 切格：找黑線 ----------
    //   每條線在預期位置附近找「這一欄（列）幾乎整條都黑」的那一段；黑頭髮只佔每格上半，整條算下來不到一半，不會被當成線。
    //   找不到就照母圖的位置切（下面對齊那步會把挪掉的量回來）
    function findCuts(img, G) {
        const { w, h } = sizeOf(img);
        const c = canvasOf(w, h), g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, w, h).data, L = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
        const kx = w / G.W, ky = h / G.H, cs = cellSize(G);
        const darkCol = (x) => { let n = 0, t = 0; for (let y = Math.floor(h * 0.03); y < h * 0.97; y += 2) { t++; if (L[y * w + x] < 60) n++; } return n / t; };
        const darkRow = (y) => { let n = 0, t = 0; for (let x = Math.floor(w * 0.03); x < w * 0.97; x += 2) { t++; if (L[y * w + x] < 60) n++; } return n / t; };
        function find(frac, size, center, k) {
            const win0 = Math.round(size * 0.05), lo = Math.max(0, Math.round(center - win0)), hi = Math.min(size - 1, Math.round(center + win0));
            const runs = []; let a = -1;
            for (let i = lo; i <= hi + 1; i++) {
                const on = i <= hi && frac(i) > 0.85;
                if (on && a < 0) a = i;
                if (!on && a >= 0) { runs.push({ a, b: i - 1 }); a = -1; }
            }
            const ok = runs.filter(r => r.b - r.a + 1 <= size * 0.04);
            ok.sort((p, q) => Math.abs((p.a + p.b) / 2 - center) - Math.abs((q.a + q.b) / 2 - center));
            if (ok.length) return { a: ok[0].a, b: ok[0].b, found: true };
            const half = LINE * k / 2;
            return { a: Math.round(center - half), b: Math.round(center + half - 1), found: false };
        }
        const xs = [], ys = [];
        for (let j = 0; j <= G.cols; j++) xs.push(find(darkCol, w, (j * (cs.w + LINE) + LINE / 2) * kx, kx));
        for (let j = 0; j <= G.rows; j++) ys.push(find(darkRow, h, (j * (cs.h + LINE) + LINE / 2) * ky, ky));
        const cells = [];
        for (let i = 0; i < G.cols * G.rows; i++) {
            const r = Math.floor(i / G.cols), cc = i % G.cols;
            const x0 = xs[cc].b + 1, x1 = xs[cc + 1].a - 1, y0 = ys[r].b + 1, y1 = ys[r + 1].a - 1;   // 兩條線中間＝母圖那一格
            cells.push({ x: x0, y: y0, w: Math.max(8, x1 - x0 + 1), h: Math.max(8, y1 - y0 + 1) });
        }
        return { cells, found: xs.concat(ys).filter(r => r.found).length, total: xs.length + ys.length };
    }

    // ---------- 對齊：每格拿「臉外面」跟原圖比，量它挪了多少、放大多少 ----------
    //   原圖 p 那一點，畫在格子裡的 q = 中心 + s×(p − 中心) + d（都用整格的比例算）
    function grayOf(src, sx, sy, sw, sh, N) {
        const c = canvasOf(N, N), g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.fillStyle = '#fff'; g.fillRect(0, 0, N, N);
        g.drawImage(src, sx, sy, sw, sh, 0, 0, N, N);
        const d = g.getImageData(0, 0, N, N).data, out = new Float32Array(N * N);
        for (let i = 0; i < N * N; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
        return out;
    }
    function outsidePts(N, oval) {
        const pts = [];
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const u = (x + 0.5) / N, v = (y + 0.5) / N;
            if (u < 0.05 || u > 0.95 || v < 0.05 || v > 0.95) continue;
            if (((u - oval.cx) / (oval.rx * 1.15)) ** 2 + ((v - oval.cy) / (oval.ry * 1.15)) ** 2 > 1) pts.push(y * N + x);
        }
        return Int32Array.from(pts);
    }
    function sample(A, N, x, y) {
        if (x < 0 || y < 0 || x > N - 1 || y > N - 1) return -1;
        const x0 = x | 0, y0 = y | 0, x1 = Math.min(N - 1, x0 + 1), y1 = Math.min(N - 1, y0 + 1), fx = x - x0, fy = y - y0;
        return (A[y0 * N + x0] * (1 - fx) + A[y0 * N + x1] * fx) * (1 - fy) + (A[y1 * N + x0] * (1 - fx) + A[y1 * N + x1] * fx) * fy;
    }
    function scorer(R, C, N, pts) {
        const A = new Float32Array(pts.length), B = new Float32Array(pts.length), c = (N - 1) / 2;
        return function (s, dx, dy) {
            let n = 0, sa = 0, sb = 0;
            for (let i = 0; i < pts.length; i++) {
                const p = pts[i], x = p % N, y = (p / N) | 0;
                const b = sample(C, N, c + s * (x - c) + dx, c + s * (y - c) + dy);
                if (b < 0) continue;
                A[n] = R[p]; B[n] = b; sa += R[p]; sb += b; n++;
            }
            if (n < pts.length * 0.6) return 1e9;
            const ma = sa / n, mb = sb / n; let t = 0;
            for (let i = 0; i < n; i++) t += Math.abs((A[i] - ma) - (B[i] - mb));
            return t / n;
        };
    }
    function register(crop, oval, img, box) {
        let N = 64;
        let f = scorer(grayOf(crop, 0, 0, crop.width, crop.height, N), grayOf(img, box.x, box.y, box.w, box.h, N), N, outsidePts(N, oval));
        let best = { e: 1e9, s: 1, dx: 0, dy: 0 };
        for (let s = 0.9; s <= 1.1001; s += 0.02) for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
            const e = f(s, dx, dy); if (e < best.e) best = { e, s, dx, dy };
        }
        const N2 = 160, k = N2 / N;
        f = scorer(grayOf(crop, 0, 0, crop.width, crop.height, N2), grayOf(img, box.x, box.y, box.w, box.h, N2), N2, outsidePts(N2, oval));
        let cur = { s: best.s, dx: best.dx * k, dy: best.dy * k }; cur.e = f(cur.s, cur.dx, cur.dy);
        let ds = 0.01, dd = 1.25;
        for (let it = 0; it < 200 && (ds > 0.0015 || dd > 0.15); it++) {
            let moved = false;
            for (const t of [[ds, 0, 0], [-ds, 0, 0], [0, dd, 0], [0, -dd, 0], [0, 0, dd], [0, 0, -dd]]) {
                const s = cur.s + t[0], dx = cur.dx + t[1], dy = cur.dy + t[2], e = f(s, dx, dy);
                if (e < cur.e - 1e-6) { cur = { s, dx, dy, e }; moved = true; }
            }
            if (!moved) { ds /= 2; dd /= 2; }
        }
        return { s: cur.s, dx: cur.dx / N2, dy: cur.dy / N2 };
    }
    // 照量到的拉回原位，畫成跟臉那塊一樣大
    function alignedPatch(img, box, cw, ch, t) {
        const c = canvasOf(cw, ch), g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch);
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, box.x, box.y, box.w, box.h, cw * (0.5 + (-0.5 - t.dx) / t.s), ch * (0.5 + (-0.5 - t.dy) / t.s), cw / t.s, ch / t.s);
        return c;
    }
    // 顏色對齊：臉圈外面那一圈（1.0～1.3 倍：瀏海、耳朵、脖子）的平均和深淺照原圖校
    function bandStats(px, oval, cw, ch) {
        const m = [0, 0, 0], q = [0, 0, 0]; let n = 0; const d = px.data;
        for (let y = 0; y < ch; y += 2) for (let x = 0; x < cw; x += 2) {
            const r = Math.sqrt((((x + 0.5) / cw - oval.cx) / oval.rx) ** 2 + (((y + 0.5) / ch - oval.cy) / oval.ry) ** 2);
            if (r < 1 || r > 1.3) continue;
            const i = (y * cw + x) * 4; for (let k = 0; k < 3; k++) { m[k] += d[i + k]; q[k] += d[i + k] * d[i + k]; } n++;
        }
        return [0, 1, 2].map(k => { const mu = n ? m[k] / n : 0; return { mu, sd: n ? Math.sqrt(Math.max(1, q[k] / n - mu * mu)) : 1 }; });
    }
    function colorMatch(patch, crop, oval) {
        const cw = patch.width, ch = patch.height;
        const want = bandStats(crop.getContext('2d').getImageData(0, 0, cw, ch), oval, cw, ch);
        const pg = patch.getContext('2d'), px = pg.getImageData(0, 0, cw, ch), have = bandStats(px, oval, cw, ch), d = px.data;
        const gain = [0, 1, 2].map(k => Math.max(0.8, Math.min(1.25, want[k].sd / have[k].sd)));
        const off = [0, 1, 2].map(k => want[k].mu - gain[k] * have[k].mu);
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, d[i + k] * gain[k] + off[k]));
        pg.putImageData(px, 0, 0);
        return patch;
    }
    // 一格 → 拉回原位、顏色對齊後的臉那塊（跟 rect 一樣大）
    function cellPatch(raw, cuts, i, crop, rect) {
        const box = cuts.cells[i];
        const t = register(crop, rect.oval, raw, box);
        return { patch: colorMatch(alignedPatch(raw, box, rect.cw, rect.ch, t), crop, rect.oval), t };
    }
    // 貼回：只換臉圈裡的顏色，透明度照原圖；圈外的點不讀不寫
    function compose(src, ring, rect, patch) {
        const { w, h } = sizeOf(src), cw = rect.cw, ch = rect.ch;
        const mk = canvasOf(cw, ch), mg = mk.getContext('2d');
        softOval(mg, ring.cx - rect.L, ring.cy - rect.T, ring.rx, ring.ry, Math.max(cw, ch) * 0.03);
        const M = mg.getImageData(0, 0, cw, ch).data, P = patch.getContext('2d').getImageData(0, 0, cw, ch).data;
        const res = canvasOf(w, h), rg = res.getContext('2d');
        rg.drawImage(src, 0, 0);
        const area = rg.getImageData(rect.L, rect.T, cw, ch), d = area.data;
        for (let i = 0; i < d.length; i += 4) {
            const m = M[i + 3] / 255; if (!m) continue;
            d[i] = d[i] * (1 - m) + P[i] * m; d[i + 1] = d[i + 1] * (1 - m) + P[i + 1] * m; d[i + 2] = d[i + 2] * (1 - m) + P[i + 2] * m;
        }
        rg.putImageData(area, rect.L, rect.T);
        return res;
    }
    async function callGrid(mother, prompt, G) {
        const M = win.OS_IMAGE_MANAGER;
        if (!M || !M.capiEdit) throw new Error('生圖引擎還沒載好');
        const r = await M.capiEdit(M.exprUse(), prompt, [mother.toDataURL('image/png')], G.W + 'x' + G.H);
        return { raw: await loadImg(r.image), usage: r.usage };
    }

    // 七個表情一通。src＝預設那張（已載好）、ring＝臉圈（原圖像素）、style＝'normal'｜'quiet'
    //   回 { faces: { Happy: canvas(整張), … }, usage, cuts: { found, total } }
    async function makeFaces(src, ring, style) {
        const { w, h } = sizeOf(src);
        const rect = cropRect(ring, w, h, 1), crop = cropCanvas(src, rect);
        const { raw, usage } = await callGrid(makeMother(FACE_GRID, [crop]), facePrompt(style), FACE_GRID);
        const cuts = findCuts(raw, FACE_GRID);
        const faces = {};
        FACE_CELLS.forEach((c, i) => {
            if (c.exp.charAt(0) === '_') return;
            faces[c.exp] = compose(src, ring, rect, cellPatch(raw, cuts, i, crop, rect).patch);
        });
        return { faces, usage, cuts: { found: cuts.found, total: cuts.total } };
    }
    // 動嘴、閉眼一通：bases＝[{ img }]（最多四張，同樣大小、同一個臉圈）、mo＝嘴的橢圓、box＝嘴要切下來的那塊、
    //   eyes＝兩隻眼睛的橢圓、eye＝眼睛要切下來的那塊（都是原圖像素，圖鑑算好）
    //   回 [{ half, open, shut }]（dataURL，各自那塊那麼大、只剩橢圓裡、透明度照原圖），順序跟 bases 一樣
    async function makeMouths(bases, ring, mo, box, eyes, eye) {
        if (!bases.length) return [];
        if (bases.length > MOUTH_PER_CALL) throw new Error('一通最多' + MOUTH_PER_CALL + '張');
        const cs = cellSize(MOUTH_GRID);
        const { w, h } = sizeOf(bases[0].img);
        const rect = cropRect(ring, w, h, cs.w / cs.h);
        const crops = bases.map(b => cropCanvas(b.img, rect));
        const cells = [];   // 每張一排三格（嘴微張、嘴張開、閉眼）；不滿四張就從頭重複，多的不用
        for (let i = 0; i < MOUTH_PER_CALL; i++) { const c = crops[i % crops.length]; cells.push(c, c, c); }
        const { raw } = await callGrid(makeMother(MOUTH_GRID, cells), mouthPrompt(), MOUTH_GRID);
        const cuts = findCuts(raw, MOUTH_GRID);
        const cut = (img, i, b, ovals) => {
            const patch = cellPatch(raw, cuts, i, crops[Math.floor(i / 3) % crops.length], rect).patch;
            const pc = canvasOf(b.w, b.h), pg = pc.getContext('2d');
            pg.drawImage(patch, b.x - rect.L, b.y - rect.T, b.w, b.h, 0, 0, b.w, b.h);
            const mk = canvasOf(b.w, b.h), mg = mk.getContext('2d');
            ovals.forEach(o => softOval(mg, o.cx - b.x, o.cy - b.y, o.rx, o.ry, Math.max(2, o.rx * 0.3)));
            pg.globalCompositeOperation = 'destination-in';
            pg.drawImage(mk, 0, 0);
            pg.drawImage(img, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);   // 再乘一次原圖的透明度（跟 ComfyUI 那條同一種）
            return pc.toDataURL('image/png');
        };
        return bases.map((b, k) => ({
            half: cut(b.img, k * 3, box, [mo]),
            open: cut(b.img, k * 3 + 1, box, [mo]),
            shut: (eyes && eye) ? cut(b.img, k * 3 + 2, eye, eyes) : '',
        }));
    }

    win.OS_EXPR_GRID = { makeFaces, makeMouths, facePrompt, mouthPrompt, MOUTH_PER_CALL,
        _test: { cropRect, cellBox, cellSize, makeMother, findCuts, register, FACE_GRID, MOUTH_GRID } };
    if (window !== win) window.OS_EXPR_GRID = win.OS_EXPR_GRID;
})();
