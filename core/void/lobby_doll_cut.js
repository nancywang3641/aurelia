// ----------------------------------------------------------------
// [檔案] core/void/lobby_doll_cut.js
// 職責：✂ GPT 生的不倒翁小人切成「頭／身體」兩層，站著時照衣櫥的呼吸動；切錯的地方在「切頭和身體」窗裡點一點換過去。
//   11-19 她：「給GPT生成的做切圖」「切圖你以前有做過，參考，別再重複造東西」→ 這支是 11-14 切圖小修（參考資料/CUT_FIX_LAB.html，本機）搬進來的：
//     自動切＝D:\lora-train\mochidoll\sheet_parts.py 不倒翁版（ROLY）那套翻成網頁版：
//       頭頂以上、脖子線以上露出的皮膚、從頭頂一路連下來的頭髮色＝頭；身體外框（她擦掉腳的那張 ctrl_sheet_roly）裡、下巴以下、不是頭髮色的＝身體；
//       剩下的沿「畫的描線」（black-hat＋sobel 當高度）用分水嶺分給兩邊；沒接到起點的小碎塊歸頭。
//     小塊＝cut_pieces.py（描線分塊→分水嶺補線→再照顏色分開→太碎的併回旁邊）；scipy／skimage 那幾個換成這裡自己寫的同一個意思。
//     編輯（點選＝點或按住拖過那幾小塊、圈選＝一點一點拉直線圈起來、復原、全部還原）和預覽的待機呼吸、走路，照小樣的程式搬，數字不改。
//   單位：三面原圖照正面身體寬縮成 278（＝小樣、DOLL_LIMB 那把尺；衣櫥一單位＝2.71），三面並排成一張（跟小樣的三面圖同一種），切的結果每點記「第幾面×3＋部位」。
//   存：不倒翁造型（lobby_dress.js 的 _saveDollSkin）多存 raw＝沒手沒腳的三面原圖、cut＝切好的那張（JSON，存在大廳素材庫 lobby_stage_assets）。
//   大廳：站著不動時疊一張畫布照衣櫥的待機呼吸畫（鞋釘在地上、身體底部釘住往上衰減、頭接在脖子點上、跟不上的延遲），走路照舊那張走路圖。
//     格子大小、位置跟走路圖那一格一樣（lobby_dress.js 的 _dollLayout／_dollCell 同一套），疊上去對得上。
// 依賴：window.LobbyDress.dollKit（量法、版面、鞋、拳頭）、window.LobbyStage（_b、_S）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const VIEWS = ['front', 'side', 'back'];
    const TINT = [[70, 130, 255], [255, 150, 40], [60, 200, 90]];
    const TAU = Math.PI * 2, LAG = .06, LAG_K = .6, LAG_MAX = 1.5, UNIT = 2.71, STEP = 2;
    const NECK_UP = 234;          // 身體外框：脖子線到圓底多高（ctrl_sheet_roly.json 的 feet − neck）
    // 身體外框（ctrl_sheet_roly.png）：從脖子線往下每 3 單位一排 [左, 右]（相對中線）；背面＝正面
    const EGG = {
        front: [[-88,89],[-92,93],[-96,97],[-99,101],[-103,104],[-106,107],[-108,109],[-111,112],[-113,114],[-115,116],[-117,118],[-118,119],[-120,121],[-121,122],[-122,123],[-123,124],[-124,125],[-125,126],[-126,127],[-127,128],[-128,129],[-128,129],[-129,130],[-129,130],[-130,131],[-130,131],[-131,132],[-131,132],[-131,132],[-132,133],[-132,133],[-133,134],[-133,134],[-133,134],[-134,135],[-134,135],[-134,135],[-135,136],[-135,136],[-135,136],[-136,137],[-136,137],[-136,137],[-136,137],[-136,137],[-136,137],[-136,137],[-136,137],[-135,136],[-135,136],[-134,135],[-134,135],[-133,134],[-132,133],[-131,132],[-130,131],[-129,130],[-128,129],[-126,127],[-125,126],[-123,124],[-122,123],[-120,121],[-118,119],[-116,117],[-114,115],[-112,113],[-109,110],[-107,108],[-104,105],[-100,101],[-97,98],[-93,94],[-88,89],[-82,83],[-73,74],[-61,63],[-43,46],[-14,18]],
        side: [[-102,83],[-85,85],[-88,88],[-91,90],[-93,92],[-95,94],[-97,95],[-99,97],[-101,99],[-103,100],[-105,101],[-106,103],[-108,104],[-109,105],[-110,106],[-111,107],[-113,108],[-113,109],[-114,110],[-115,111],[-116,112],[-117,113],[-117,114],[-118,114],[-119,115],[-119,116],[-120,117],[-120,117],[-120,118],[-121,118],[-121,119],[-121,119],[-122,120],[-122,120],[-122,120],[-122,120],[-122,121],[-122,121],[-122,121],[-122,121],[-122,121],[-122,121],[-122,122],[-122,122],[-122,122],[-121,122],[-121,121],[-121,121],[-120,121],[-120,121],[-119,121],[-119,120],[-118,120],[-117,119],[-117,118],[-116,118],[-115,117],[-114,116],[-113,115],[-112,114],[-111,112],[-110,111],[-109,110],[-108,108],[-107,106],[-105,105],[-104,102],[-102,100],[-100,98],[-98,95],[-96,92],[-94,89],[-91,85],[-88,81],[-84,76],[-79,70],[-72,62],[-62,47],[-26,23]],
    };
    EGG.back = EGG.front;
    const kit = () => (window.LobbyDress && window.LobbyDress.dollKit) || null;
    const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('圖讀不進來')); i.src = src; });

    // ================= 三面原圖 → 並排一張（單位＝正面身體寬 278） =================
    async function buildSheet(raw) {
        const K = kit();
        if (!K) throw new Error('大廳的小人那支還沒載入');
        const M = {};
        for (const v of VIEWS) { M[v] = K.measure(await K.loadImg(raw[v])); if (!M[v]) throw new Error('量不到小人的位置'); }
        const Lo = K.layout(M), s = Lo.s;   // s＝原圖 px／單位
        let half = 0, up = 0;
        for (const v of VIEWS) { const m = M[v]; half = Math.max(half, (m.cx - m.left) / s, (m.right - m.cx) / s); up = Math.max(up, (m.bot - m.top) / s); }
        const slot = Math.ceil(Math.max(half * 2 + 40, 420)), PADT = 24, PADB = 70;
        const w = slot * 3, h = Math.ceil(PADT + up + PADB);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const g = cv.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high';
        const views = VIEWS.map((v, k) => {
            const m = M[v], px = slot * k + slot / 2, feet = h - PADB;
            g.save(); g.translate(px, feet); g.scale(1 / s, 1 / s); g.drawImage(m.img, -m.cx, -m.bot); g.restore();
            return { view: v, x: slot * k, w: slot, px, feet, neck: feet - NECK_UP };
        });
        // 鞋：跟走路圖同一雙、同一個位置（DOLL_LIMB 的單位剛好就是這裡的單位）。小樣的順序：側面 0＝近、1＝遠；正背面 0＝左、1＝右
        const L = K.LIMB;
        const shoes = views.map((V) => {
            const list = L[V.view].map(o => ({ r: o.r, x: V.px + o.dx, y: V.feet + o.dy, w: o.r[2], h: o.r[3] }));
            return V.view === 'side' ? [list[1], list[0]] : list;
        });
        const data = g.getImageData(0, 0, w, h);
        // 脖子線：外框那張的脖子線離圓底 234，但 GPT 畫的身體高矮會差一點——照圖上「身體往上變窄、一過下巴突然變寬」那一排抓；
        //   抓不到或差太多（垂下來的長髮把那一段撐寬）就照外框的。抓錯的話衣領會被當成後頸的皮膚切給頭。
        views.forEach((V) => {
            const on = (x, y) => x >= 0 && x < w && y >= 0 && y < h && data.data[(y * w + x) * 4 + 3] >= 40;
            const X = Math.round(V.px), run = (y) => { if (!on(X, y)) return 0; let a = X, b2 = X; while (on(a - 1, y)) a--; while (on(b2 + 1, y)) b2++; return b2 - a + 1; };
            let ymax = -1, wmax = 0;
            for (let y = V.feet - 200; y <= V.feet - 60; y++) { const r = run(y); if (r > wmax) { wmax = r; ymax = y; } }
            if (ymax < 0) return;
            for (let y = ymax; y > V.feet - 320; y--) {
                const here = run(y), above = run(y - 3);
                if (above > here * 1.25 && above > wmax * .9) {
                    const up = V.feet - y;
                    if (up >= 180 && up <= 300) V.neck = y;
                    break;
                }
            }
        });
        return { cv, w, h, views, shoes, M, Lo, data };
    }

    // ================= 影像小工具（scipy／skimage 那幾個的網頁版） =================
    function grayOf(d, n) { const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3; return out; }
    // 一維滑動最大／最小（半徑 r），再做另一軸＝方形；closing＝先膨脹再侵蝕
    function rank1(src, w, h, r, horiz, isMax) {
        const out = new Float32Array(src.length), len = horiz ? w : h, lines = horiz ? h : w;
        const buf = new Float32Array(len);
        for (let L = 0; L < lines; L++) {
            for (let i = 0; i < len; i++) buf[i] = horiz ? src[L * w + i] : src[i * w + L];
            for (let i = 0; i < len; i++) {
                let v = isMax ? -1e9 : 1e9;
                const a = Math.max(0, i - r), b = Math.min(len - 1, i + r);
                for (let j = a; j <= b; j++) { const x = buf[j]; if (isMax ? x > v : x < v) v = x; }
                if (horiz) out[L * w + i] = v; else out[i * w + L] = v;
            }
        }
        return out;
    }
    function closing(gray, w, h, r) {
        let a = rank1(gray, w, h, r, true, true); a = rank1(a, w, h, r, false, true);
        a = rank1(a, w, h, r, true, false); return rank1(a, w, h, r, false, false);
    }
    function gauss(src, w, h, sig) {
        const R = Math.ceil(sig * 3), k = []; let sum = 0;
        for (let i = -R; i <= R; i++) { const v = Math.exp(-i * i / (2 * sig * sig)); k.push(v); sum += v; }
        for (let i = 0; i < k.length; i++) k[i] /= sum;
        const t = new Float32Array(src.length), out = new Float32Array(src.length);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let i = -R; i <= R; i++) { const xx = Math.min(w - 1, Math.max(0, x + i)); v += src[y * w + xx] * k[i + R]; } t[y * w + x] = v; }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let i = -R; i <= R; i++) { const yy = Math.min(h - 1, Math.max(0, y + i)); v += t[yy * w + x] * k[i + R]; } out[y * w + x] = v; }
        return out;
    }
    function sobel(src, w, h) {
        const out = new Float32Array(src.length), at = (x, y) => src[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
            const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
            out[y * w + x] = Math.sqrt(gx * gx + gy * gy) / 4 / Math.SQRT2;   // skimage 的 sobel 量級
        }
        return out;
    }
    // 分水嶺（有起點的那種）：mk>0 的點先放進去，照高度從低到高往外長，只長在 mask 裡；回每點的標號
    function watershed(elev, mk, mask, w, h) {
        const n = w * h, out = Int32Array.from(mk), NB = 1024;
        const q = Array.from({ length: NB }, () => []);
        const lvl = (i) => Math.min(NB - 1, Math.max(0, Math.round(elev[i])));
        for (let i = 0; i < n; i++) if (out[i] > 0 && mask[i]) q[lvl(i)].push(i);
        for (let b = 0; b < NB; b++) {
            const B = q[b];
            for (let p = 0; p < B.length; p++) {
                const i = B[p], x = i % w, lab = out[i];
                const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
                for (const j of nb) {
                    if (j < 0 || j >= n || out[j] || !mask[j]) continue;
                    out[j] = lab;
                    q[Math.max(b, lvl(j))].push(j);
                }
            }
            q[b] = null;
            if (b + 1 < NB && !q[b + 1]) q[b + 1] = [];
        }
        return out;
    }
    // 連通塊（4 鄰）：on[i] 為真的點標號 1..n
    function label(on, w, h) {
        const n = w * h, lab = new Int32Array(n), st = new Int32Array(n); let k = 0;
        for (let i = 0; i < n; i++) {
            if (!on[i] || lab[i]) continue;
            k++; let sp = 0; st[sp++] = i; lab[i] = k;
            while (sp) { const c = st[--sp], x = c % w; for (const j of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w]) { if (j < 0 || j >= n || lab[j] || !on[j]) continue; lab[j] = k; st[sp++] = j; } }
        }
        return { lab, count: k };
    }
    // RGB → HSV（色相 0～360、飽和、明度 0～1）
    function hsv(r, g, b) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let hh = 0;
        if (d) { if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; }
        return [hh, mx ? d / mx : 0, mx / 255];
    }

    // ================= 自動切（sheet_parts.py 不倒翁版） =================
    function prep(S) {
        const { w, h } = S, n = w * h, d = S.data.data;
        const char = new Uint8Array(n); for (let i = 0; i < n; i++) char[i] = d[i * 4 + 3] >= 40 ? 1 : 0;
        const gray = grayOf(d, n);
        const cl = closing(gray, w, h, 4), bh = new Float32Array(n);
        for (let i = 0; i < n; i++) bh[i] = Math.max(0, cl[i] - gray[i]);
        const gr = sobel(gauss(gray, w, h, 1.5), w, h), elev = new Float32Array(n);
        for (let i = 0; i < n; i++) elev[i] = bh[i] * 3 + gr[i];
        const line = new Uint8Array(n); for (let i = 0; i < n; i++) line[i] = (bh[i] > 22 && char[i]) ? 1 : 0;
        const skin = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            if (!char[i]) continue;
            const [hh, ss, vv] = hsv(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
            skin[i] = (hh >= 8 && hh <= 45 && ss > .1 && ss < .42 && vv > .78) ? 1 : 0;
        }
        return { char, gray, bh, elev, line, skin };
    }
    function eggAt(view, y, V) {   // 身體外框在這一排的 [左, 右]（絕對座標），外框外回 null
        const up = V.feet - V.neck, t = (y - V.neck) * NECK_UP / up; if (t < 0 || t > NECK_UP) return null;
        const E = EGG[view], f = t / 3, i = Math.min(E.length - 1, Math.floor(f)), j = Math.min(E.length - 1, i + 1), u = f - i;
        return [V.px + E[i][0] + (E[j][0] - E[i][0]) * u, V.px + E[i][1] + (E[j][1] - E[i][1]) * u];
    }
    function autoSeg(S, P) {
        const { w, h, views } = S, n = w * h, d = S.data.data, { char, line, skin, elev } = P;
        const mk = new Int32Array(n);   // 1-based：k*3+1 頭、k*3+2 身
        const yOf = i => (i / w) | 0, xOf = i => i % w;
        // 像不像頭髮色：同一個顏色（量化到 4）只算一次
        let memo = new Map(), memoPal = null;
        const near = (c, pal, lim) => {
            if (memoPal !== pal) { memo = new Map(); memoPal = pal; }
            const key = ((c[0] >> 2) * 4096 + (c[1] >> 2) * 64 + (c[2] >> 2)) * 2 + (lim > 40 ? 1 : 0);
            const hit = memo.get(key); if (hit !== undefined) return hit;
            let r = false;
            for (let k = 0; k < pal.length; k += 3) { const dr = c[0] - pal[k], dg = c[1] - pal[k + 1], db = c[2] - pal[k + 2]; if (dr * dr + dg * dg + db * db < lim * lim) { r = true; break; } }
            memo.set(key, r); return r;
        };
        // 下巴：中線左右 90 內、脖子線以上所有皮膚的最低那排（正面、側面；背面借正面的）
        const chins = {};
        views.slice(0, 2).forEach((V) => {
            let lo = -1;
            for (let y = 0; y < Math.min(h, V.neck + 8); y++) for (let x = Math.max(0, Math.round(V.px - 90)); x < Math.min(w, V.px + 90); x++) if (skin[y * w + x]) lo = Math.max(lo, y);
            if (lo >= 0) chins[V.view] = lo;
        });
        const chinDef = chins.front != null ? chins.front : (chins.side != null ? chins.side : views[0].neck - 100);
        views.forEach((V, k) => {
            const chin = chins[V.view] != null ? chins[V.view] : chinDef;
            // 頭：脖子線上 175 以上
            for (let y = 0; y < Math.min(h, V.neck - 175); y++) for (let x = V.x; x < V.x + V.w; x++) { const i = y * w + x; if (char[i]) mk[i] = k * 3 + 1; }
            // 頭髮色：頭頂那圈（脖子線上 300 以上、不是皮膚）佔 3% 以上的顏色
            const cnt = new Map(), all = [];
            for (let y = 0; y < Math.min(h, V.neck - 300); y++) for (let x = V.x; x < V.x + V.w; x++) {
                const i = y * w + x; if (!char[i] || skin[i]) continue;
                const key = ((d[i * 4] / 24) | 0) * 10000 + ((d[i * 4 + 1] / 24) | 0) * 100 + ((d[i * 4 + 2] / 24) | 0);
                cnt.set(key, (cnt.get(key) || 0) + 1); all.push(i);
            }
            let pal = [], sub = [];
            if (all.length > 50) {
                const keep = all.filter(i => { const key = ((d[i * 4] / 24) | 0) * 10000 + ((d[i * 4 + 1] / 24) | 0) * 100 + ((d[i * 4 + 2] / 24) | 0); return cnt.get(key) >= .03 * all.length; });
                // 不重複的顏色（量化到 4）各留一個，太多就均勻抽
                const seen = new Set(), uniq = [];
                keep.forEach(i => { const c = (d[i * 4] >> 2) * 4096 + (d[i * 4 + 1] >> 2) * 64 + (d[i * 4 + 2] >> 2); if (!seen.has(c)) { seen.add(c); uniq.push(i); } });
                const take = (arr, m) => { const out = []; const st = Math.max(1, arr.length / m); for (let f = 0; f < arr.length && out.length < m; f += st) { const i = arr[Math.floor(f)]; out.push(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); } return out; };
                pal = take(uniq, 900); sub = take(uniq, 300);
            }
            const px = i => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
            if (pal.length) {
                // 下巴下 25 起（背面最晚從脖子線上 20 起）、中線 110 內、不像頭髮也不是皮膚的＝衣服＝身體
                const y0 = Math.min(chin + 25, V.neck - 20);
                for (let y = Math.max(0, y0 + 1); y < Math.min(h, V.feet - 4); y++) for (let x = Math.max(V.x, Math.round(V.px - 110)); x < Math.min(V.x + V.w, V.px + 110); x++) {
                    const i = y * w + x; if (!char[i] || skin[i]) continue;
                    if (!near(px(i), pal, 45)) mk[i] = k * 3 + 2;
                }
            }
            // 後頸、耳朵、下巴底下：脖子線以上露出的皮膚＝頭
            const nape = new Uint8Array(n);
            for (let y = 0; y < Math.min(h, V.neck + 8); y++) for (let x = V.x; x < V.x + V.w; x++) { const i = y * w + x; if (char[i] && skin[i]) nape[i] = 1; }
            // 外框往內縮 18（core）
            const inCore = (x, y, m) => { m = m == null ? 18 : m; if (y < V.neck + m || y > V.feet - m) return false; const e = eggAt(V.view, y, V); return !!e && x >= e[0] + m && x <= e[1] - m; };
            // 從頭頂一路連下來、沒被描線隔開的頭髮色＝頭（垂下來的馬尾、長髮）
            const hairConn = new Uint8Array(n);
            if (sub.length) {
                const hl = new Uint8Array(n);
                for (let y = 0; y < h; y++) for (let x = V.x; x < V.x + V.w; x++) { const i = y * w + x; if (char[i] && !skin[i] && !line[i] && near(px(i), sub, 30)) hl[i] = 1; }
                const L = label(hl, w, h), top = new Set();
                for (let y = 0; y < Math.min(h, V.neck - 175); y++) for (let x = V.x; x < V.x + V.w; x++) { const i = y * w + x; if (hl[i]) top.add(L.lab[i]); }
                for (let i = 0; i < n; i++) if (hl[i] && top.has(L.lab[i])) hairConn[i] = 1;
            }
            for (let y = 0; y < h; y++) for (let x = V.x; x < V.x + V.w; x++) {
                const i = y * w + x; if (!char[i]) continue;
                // 不倒翁：頭髮垂下來多半在身體外面；身體外框裡、下巴以下跟頭髮同色的是衣服（咖啡色圍裙配咖啡色頭髮，11-19 測的：
                //   照原本「連得到頭頂就是頭髮」，整片圍裙被切給頭）
                const deep = inCore(x, y) && y > chin + 25;
                if (inCore(x, y) && y < V.feet - 4 && y > chin + 25 && !nape[i] && (!hairConn[i] || deep)) mk[i] = k * 3 + 2;
                if (hairConn[i] && y >= V.neck - 175 && !deep) mk[i] = k * 3 + 1;
                if (inCore(x, y) && y >= V.feet - 80 && y < V.feet - 4 && !nape[i]) mk[i] = k * 3 + 2;   // 身體最下面那段一定是衣服
                // 不倒翁身體兩邊（圍裙吊帶外面露出的那條襯衫）被描線隔開、上面又碰到髮尾：外框只往內縮 6 也算身體起點，不然會從頭髮那邊被搶走
                if (y > chin + 40 && y < V.feet - 4 && inCore(x, y, 6) && !line[i] && !nape[i]) mk[i] = k * 3 + 2;
                if (nape[i]) mk[i] = k * 3 + 1;
            }
        });
        const seg = watershed(elev, mk, char, w, h);
        // 沒接到起點的小碎塊：歸最近那一面的頭
        for (let i = 0; i < n; i++) if (char[i] && !seg[i]) { const x = xOf(i); let best = 0, bd = 1e9; views.forEach((V, k) => { const dd = Math.abs(V.px - x); if (dd < bd) { bd = dd; best = k; } }); seg[i] = best * 3 + 1; }
        const out = new Int8Array(n);
        for (let i = 0; i < n; i++) out[i] = char[i] ? seg[i] - 1 : -1;   // 0-based：k*3＝頭、k*3+1＝身（同小樣）
        void yOf;
        return out;
    }
    // 小塊（cut_pieces.py）：描線和頭身交界先隔開→連通塊（太小的丟掉）→分水嶺把線補回去→每塊再照顏色分開→太碎的併回旁邊
    function makePieces(S, P, seg) {
        const { w, h } = S, n = w * h, d = S.data.data, { char, line, elev } = P;
        const cores = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            if (!char[i] || line[i]) continue;
            const x = i % w, s0 = seg[i];
            let border = false;
            for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) { if (j >= 0 && j < n && char[j] && seg[j] !== s0) { border = true; break; } }
            if (!border) cores[i] = 1;
        }
        const drop = (lab, count, min) => { const sz = new Int32Array(count + 1); for (let i = 0; i < n; i++) sz[lab[i]]++; for (let i = 0; i < n; i++) if (lab[i] && sz[lab[i]] < min) lab[i] = 0; };
        let L = label(cores, w, h); drop(L.lab, L.count, 40);
        let ids = watershed(elev, L.lab, char, w, h);
        // 照顏色分開：同一塊裡、跟起點顏色差 < 40 的連在一起
        const col = new Int32Array(n); let k = 0; const st = new Int32Array(n);
        for (let i = 0; i < n; i++) {
            if (!char[i] || col[i] || !ids[i]) continue;
            k++; const r0 = d[i * 4], g0 = d[i * 4 + 1], b0 = d[i * 4 + 2], id0 = ids[i];
            let sp = 0; st[sp++] = i; col[i] = k;
            while (sp) {
                const c = st[--sp], x = c % w;
                for (const j of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w]) {
                    if (j < 0 || j >= n || col[j] || ids[j] !== id0) continue;
                    const dr = d[j * 4] - r0, dg = d[j * 4 + 1] - g0, db = d[j * 4 + 2] - b0;
                    if (dr * dr + dg * dg + db * db > 1600) continue;
                    col[j] = k; st[sp++] = j;
                }
            }
        }
        drop(col, k, 60);
        ids = watershed(elev, col, char, w, h);
        // 重新編號 1..n
        const map = new Map(); let m = 0;
        for (let i = 0; i < n; i++) { if (!ids[i]) continue; let v = map.get(ids[i]); if (!v) { v = ++m; map.set(ids[i], v); } ids[i] = v; }
        return ids;
    }

    // ================= 存：切好的每點 → JSON（一排一排的連續段） =================
    function encode(lab, w, h) {
        const parts = []; let prev = lab[0], run = 0;
        for (let i = 0; i < lab.length; i++) { if (lab[i] === prev) run++; else { parts.push(prev + ':' + run); prev = lab[i]; run = 1; } }
        parts.push(prev + ':' + run);
        return JSON.stringify({ v: 1, w, h, rle: parts.join(',') });
    }
    function decode(json, w, h) {
        try {
            const o = typeof json === 'string' ? JSON.parse(json) : json;
            if (!o || o.w !== w || o.h !== h) return null;
            const out = new Int8Array(w * h); let p = 0;
            for (const seg of String(o.rle).split(',')) { const [v, c] = seg.split(':').map(Number); out.fill(v, p, p + c); p += c; }
            return p === w * h ? out : null;
        } catch (e) { return null; }
    }
    // 生完不倒翁時叫（lobby_dress.js 的 _dollAutoCut）：三面原圖 → 自動切好的 JSON
    async function autoCut(raw) {
        const S = await buildSheet(raw), P = prep(S);
        return encode(autoSeg(S, P), S.w, S.h);
    }

    // ================= 圖層、姿勢、畫（照小樣 rebuildLayers／pose／drawBody／drawPreview 搬） =================
    function buildRig(S, lab, shoesImg) {
        const { w, h, views } = S, base = S.data.data;
        const layers = [];
        for (let L = 0; L < 9; L++) {
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const cx = c.getContext('2d'), im = cx.createImageData(w, h), o = im.data;
            for (let i = 0; i < lab.length; i++) { if (lab[i] !== L) continue; const j = i * 4; o[j] = base[j]; o[j + 1] = base[j + 1]; o[j + 2] = base[j + 2]; o[j + 3] = base[j + 3]; }
            cx.putImageData(im, 0, 0); layers.push(c);
        }
        const feetLayers = views.map((V, k) => S.shoes[k].map(q => {
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            if (shoesImg) c.getContext('2d').drawImage(shoesImg, q.r[0], q.r[1], q.r[2], q.r[3], q.x, q.y, q.w, q.h);
            return c;
        }));
        const rig = views.map((V, k) => {      // 每一面：身體（中線 ±60 欄）的上下
            let by0 = 1e9, by1 = -1;
            for (let y = 0; y < h; y++) for (let x = Math.max(0, Math.round(V.px - 60)); x < Math.min(w, V.px + 60); x++) {
                if (lab[y * w + x] !== k * 3 + 1) continue;
                if (y < by0) by0 = y; if (y > by1) by1 = y;
            }
            if (by1 < 0) { by0 = V.neck; by1 = V.feet; }
            // 不倒翁沒有畫出來的腳（鞋是另外接的）：身體底部就是釘住的那條線
            return { cx: V.px, baseY: by1, pinY: by1, H: Math.max(1, by1 - by0), s: UNIT };
        });
        return { layers, feetLayers, rig };
    }
    const idle = t => { const b = Math.sin(TAU * t / 2.4); return { dy: 1.2 * b, sy: 1 + .025 * b, sx: 1 - .02 * b }; };
    const MOTION_LEN = { idle: 2.4, walk: .9 };
    function pose(motion, view, t) {
        const P = { plant: false, dy: 0, sx: 1, sy: 1, rot: 0, head: 0, feet: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }] };
        if (motion === 'idle') { Object.assign(P, idle(t)); P.plant = true; return P; }
        const q = t / .9, hh = (q * 2) % 1, up = Math.sin(Math.PI * hh), land = Math.max(0, 1 - hh / .18) + Math.max(0, (hh - .86) / .14);
        if (view === 1) {
            const sw = Math.sin(TAU * q);
            P.dy = -5 * up; P.sy = 1 + .04 * up - .06 * land; P.sx = 1 - .02 * up + .05 * land; P.rot = -2; P.head = -1.5 + 1.5 * Math.sin(TAU * q);
            P.feet[0] = { dx: -9 * sw, dy: -5 * Math.max(0, sw) * up }; P.feet[1] = { dx: 9 * sw, dy: -5 * Math.max(0, -sw) * up };
            return P;
        }
        P.dy = -7 * up; P.sy = 1 + .05 * up - .07 * land; P.sx = 1 - .03 * up + .06 * land; P.head = 2.5 * Math.sin(TAU * q);
        const step = q < .5 ? 0 : 1;
        P.feet[step] = { dy: -6 * up, dx: (step ? 1 : -1) * 1.5 * up };
        if (view === 2) { P.head = -P.head; P.rot = -P.rot; P.feet = [{ dx: -P.feet[1].dx, dy: P.feet[1].dy }, { dx: -P.feet[0].dx, dy: P.feet[0].dy }]; }
        return P;
    }
    const neckOf = (P, r) => { const th = P.rot * Math.PI / 180; return { x: r.H * P.sy * Math.sin(th), y: r.H - r.H * P.sy * Math.cos(th) + P.dy * r.s }; };
    // 身體跟腳接的地方釘住：一排一排畫，動作量乘 w（底下 0、往上 35% 身高內 smoothstep 到 1）
    function bodyMap(p, r) {
        const ramp = Math.max(4, r.H * .35);
        return y => { const u = Math.min(1, Math.max(0, (r.pinY - y) / ramp)), w = u * u * (3 - 2 * u);
            return { y: y + w * ((y - r.baseY) * (p.sy - 1) + p.dy * r.s), sx: 1 + (p.sx - 1) * w }; };
    }
    function drawBody(g, src, p, r, W) {
        const top = r.baseY - r.H - 2, x0 = Math.max(0, Math.round(r.cx - 220)), wid = Math.min(W - x0, 440), yOf = bodyMap(p, r);
        for (let y = Math.floor(top); y <= r.baseY + 1; y += STEP) {
            const a = yOf(y), b = yOf(y + STEP), hh = Math.max(.5, b.y - a.y + .6);
            g.drawImage(src, x0, y, wid, STEP, r.cx + (x0 - r.cx) * a.sx, a.y, wid * a.sx, hh);
        }
    }
    // 一面一格：k＝第幾面；拳頭（衣櫥的）跟著身體那個高度動；回傳畫好了沒
    function drawView(g, R, k, motion, t, S, fist) {
        const r = R.rig[k]; if (!r || r.baseY < 0) return;
        const L = MOTION_LEN[motion] || 2.4, tq = ((t - LAG) % L + L) % L;
        const P = pose(motion, k, t), Q = pose(motion, k, tq), nn = neckOf(P, r), nq = neckOf(Q, r), c = x => Math.max(-LAG_MAX * r.s, Math.min(LAG_MAX * r.s, x * LAG_K));
        const lag = { x: c(nq.x - nn.x), y: c(nq.y - nn.y) }, neck0 = r.baseY - r.H;
        const fists = (front) => { if (fist) fist(g, k, front, P.plant ? bodyMap(P, r) : null, P, r); };
        if (P.plant) {
            [1, 0].forEach(i => R.feetLayers[k][i] && g.drawImage(R.feetLayers[k][i], 0, 0));
            fists(false);
            drawBody(g, R.layers[k * 3 + 1], P, r, S.w);
            fists(true);
        } else {
            g.save();
            g.translate(0, P.dy * r.s); g.translate(r.cx, r.baseY); g.rotate(P.rot * Math.PI / 180); g.scale(P.sx, P.sy); g.translate(-r.cx, -r.baseY);
            [1, 0].forEach(i => { if (!R.feetLayers[k][i]) return; g.save(); g.translate(P.feet[i].dx * r.s, P.feet[i].dy * r.s); g.drawImage(R.feetLayers[k][i], 0, 0); g.restore(); });
            fists(false);
            g.drawImage(R.layers[k * 3 + 1], 0, 0);
            fists(true);
            g.restore();
        }
        g.save();
        g.translate(nn.x + lag.x, nn.y + lag.y);
        g.translate(r.cx, neck0); g.rotate((P.rot + P.head) * Math.PI / 180); g.translate(-r.cx, -neck0);
        g.drawImage(R.layers[k * 3], 0, 0);
        g.restore();
    }
    // 衣櫥的拳頭（跟走路圖同一個位置、同一個顏色；正背面兩顆、側面一顆）：front＝畫在身體前面那一批
    function fistPainter(S) {
        const K = kit(), Lm = K.LIMB, skin = S.Lo.skin;
        return (g, k, front, map, P, r) => {
            const V = S.views[k], view = V.view;
            if ((view === 'back') === front) return;    // 背面：手在身體後面；正面、側面：前面
            const fy0 = V.feet - Lm.fistUp;
            let fy = fy0, kx = 1;
            if (map) { const q = map(fy0); fy = q.y; kx = q.sx; }
            const draw = (x, flip) => K.fist(g, x, fy, Lm.fistK, flip, skin);
            if (view === 'side') draw(V.px + Lm.fistSideX * kx, true);
            else { draw(V.px - Lm.fistX * kx, false); draw(V.px + Lm.fistX * kx, true); }
        };
    }

    // ================= 一隻小人的零件（大廳和切圖窗共用） =================
    const _parts = new Map();   // 切好的那筆鑰匙 → Promise<{S, R, fist}>
    async function _skinOf(key) { const LS = window.LobbyStage; return (LS && LS._b && LS._b.skins) ? LS._b.skins()[key] : null; }
    async function _rawOf(skin) {
        const b = window.LobbyStage._b, raw = {};
        for (const v of VIEWS) { raw[v] = await b.resolveRef(skin.raw[v]); if (!raw[v]) throw new Error('原圖讀不到'); }
        return raw;
    }
    function partsOf(skin) {
        const id = (skin.cut && skin.cut.idb) || '';
        if (_parts.has(id)) return _parts.get(id);
        const p = (async () => {
            const b = window.LobbyStage._b, K = kit();
            const S = await buildSheet(await _rawOf(skin));
            let lab = decode(await b.resolveRef(skin.cut), S.w, S.h);
            if (!lab) lab = autoSeg(S, prep(S));
            const R = buildRig(S, lab, await K.shoes());
            return { S, R, fist: fistPainter(S) };
        })();
        _parts.set(id, p);
        p.catch(() => _parts.delete(id));
        if (_parts.size > 12) _parts.delete(_parts.keys().next().value);
        return p;
    }

    // ================= 大廳：站著時疊一張畫布照衣櫥的待機呼吸畫 =================
    const _live = new Set(); let _timer = null;
    function bindLive(a, key, skin) {
        if (!a || !skin || !skin.raw || !skin.cut) return;
        if (a._dollLive) unbindLive(a._dollLive);
        const B = { a, key, el0: a.el, parts: null, cv: null, on: false, clock: Math.random() * 2.4 };
        a._dollLive = B; _live.add(B);
        partsOf(skin).then(v => { if (_live.has(B)) B.parts = v; }).catch(e => { console.warn('[DollCut] 小人的頭身讀不到，照舊用走路圖', e); unbindLive(B); });
        if (!_timer) _timer = setInterval(_tick, 100);
    }
    function unbindLive(B) {
        if (!B) return;
        _live.delete(B);
        _showLive(B, false);
        if (B.cv) { try { B.cv.remove(); } catch (e) {} B.cv = null; }
        if (B.a && B.a._dollLive === B) B.a._dollLive = null;
        if (!_live.size && _timer) { clearInterval(_timer); _timer = null; }
    }
    function _showLive(B, on) {
        if (B.on === on) return; B.on = on;
        if (B.cv) B.cv.style.display = on ? '' : 'none';
        try { if (B.a.el === B.el0) B.a.el.style.opacity = on ? '0' : ''; } catch (e) {}
    }
    function _tick() {
        const LS = window.LobbyStage, S = LS && LS._S;
        if (document.hidden) return;
        const now = performance.now() / 1000;
        for (const B of [..._live]) {
            const a = B.a;
            const here = S && S.active && (a === S.player || S.npcs.indexOf(a) >= 0);
            if (!here || a.el !== B.el0 || !a.el || !a.el.isConnected) { unbindLive(B); continue; }
            if (!B.parts || !a.frameW || !a.frameH) continue;
            if (a.walking || a.dest) { _showLive(B, false); continue; }
            try { _drawLive(B, S, now); } catch (e) { console.warn('[DollCut] 畫不出來，照舊用走路圖', e); unbindLive(B); }
        }
    }
    function _drawLive(B, S, now) {
        const a = B.a, { S: SH, R, fist } = B.parts, Lo = SH.Lo, L = kit().LIMB;
        const cw = Lo.cw, ch = Lo.ch;
        if (!B.cv || B.cv.parentNode !== S.world) {
            if (B.cv) { try { B.cv.remove(); } catch (e) {} }
            B.cv = document.createElement('canvas'); B.cv.width = cw; B.cv.height = ch;
            B.cv.className = 'ldc-live'; B.cv.style.display = 'none';
            S.world.appendChild(B.cv); B.on = false;
        }
        const d = a.dir || 0, k = d === 3 ? 2 : (d === 1 || d === 2) ? 1 : 0, mirror = d === 1;   // 走路圖：往左那列是側面翻過來
        const g = B.cv.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
        if (mirror) { g.translate(cw, 0); g.scale(-1, 1); }
        // 同走路圖那一格（lobby_dress.js 的 _dollCell）：原點＝圓底中心、圓底最低點；這裡再縮回 278 那把尺
        g.translate(cw / 2, ch - 1); g.scale(Lo.k0, Lo.k0); g.translate(0, -L.below * Lo.s); g.scale(Lo.s, Lo.s);
        const V = SH.views[k];
        g.translate(-V.px, -V.feet);
        drawView(g, R, k, 'idle', now + B.clock, SH, fist);
        const w = a.h * a.frameW / a.frameH, left = a.x - w / 2, top = a.y - a.h;
        const st = B.cv.style, tf = 'translate3d(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px,0)';
        if (B._tf !== tf) { st.transform = tf; B._tf = tf; }
        const ws = w.toFixed(1) + 'px', hs = a.h.toFixed(1) + 'px';
        if (st.width !== ws) st.width = ws;
        if (st.height !== hs) st.height = hs;
        const z = a.el.style.zIndex || '';
        if (st.zIndex !== z) st.zIndex = z;
        _showLive(B, true);
    }
    // 存好了：那隻小人重讀零件
    function refresh(key) {
        _skinOf(key).then(skin => {
            for (const B of [..._live]) if (B.key === key) { const a = B.a; unbindLive(B); if (skin) bindLive(a, key, skin); }
        });
    }

    // ================= 「切頭和身體」窗（照小樣的版面和操作搬） =================
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    async function openPanel(host, o) {
        o = o || {};
        const A = window.AUI || (window.parent || window).AUI;
        const b = window.LobbyStage && window.LobbyStage._b;
        const skin = await _skinOf(o.key);
        if (!b || !skin || !skin.raw) { A && A.alert('這隻小人沒有留原圖，切不了（11-19 之後生的不倒翁才有）。'); return; }
        try {
            if (A && A.registerHelp) A.registerHelp({ ldc_cut: { title: '切頭和身體', body: '大廳裡他站著的時候會呼吸：身體一吸一吐、頭跟著脖子動、腳釘在地上。頭和身體是程式自動切的，切錯的地方在這裡換過去。\n\n先選「換成頭」或「換成身體」。\n點選：點一下那一小塊（或按住拖過好幾塊）就換過去。\n圈選：一點一點拉直線圈起來，點回第一個點（或按「完成圈選」）就把圈裡的全部換過去。\n\n下面那張照衣櫥的待機呼吸動，看有沒有分對。' } });
        } catch (e) {}
        const wrap = document.createElement('div');
        wrap.className = 'lstage-genprev ldc-wrap';
        wrap.innerHTML =
            '<div class="lgp-box ldc-box">' +
                '<div class="lgp-title">切頭和身體' + (o.name ? '・' + esc(o.name) : '') + ((A && A.helpBtn) ? A.helpBtn('ldc_cut') : '') + '</div>' +
                '<div class="ldc-bar">' +
                    '<div class="ldc-seg" data-g="tool"><button type="button" data-v="piece" class="is-on">點選</button><button type="button" data-v="poly">圈選</button></div>' +
                    '<div class="ldc-seg" data-g="part"><button type="button" data-v="0" class="is-on is-head">換成頭</button><button type="button" data-v="1" class="is-body">換成身體</button></div>' +
                    '<button type="button" class="lep-btn ldc-undo" disabled><i class="fa-solid fa-rotate-left"></i> 復原</button>' +
                    '<button type="button" class="lep-btn ldc-reset"><i class="fa-solid fa-wand-magic-sparkles"></i> 全部還原</button>' +
                '</div>' +
                '<div class="ldc-legend"><span><i class="is-head"></i>頭</span><span><i class="is-body"></i>身體</span></div>' +
                '<div class="ldc-canvas"><canvas class="ldc-edit"></canvas><div class="ldc-loading">切圖中…</div></div>' +
                '<div class="ldc-polybar" hidden><button type="button" class="lep-btn ldc-polydone" disabled>完成圈選</button><button type="button" class="lep-btn ldc-polycancel">取消</button></div>' +
                '<div class="ldc-status" aria-live="polite"></div>' +
                '<div class="ldc-canvas ldc-prevbox"><canvas class="ldc-prev"></canvas></div>' +
                '<div class="lgp-btns">' +
                    '<button type="button" class="lep-btn lgp-apply ldc-save"><i class="fa-solid fa-check"></i> 存好了</button>' +
                    '<button type="button" class="lep-btn lgp-cancel ldc-close"><i class="fa-solid fa-xmark"></i> 關閉</button>' +
                '</div>' +
            '</div>';
        (host || document.body).appendChild(wrap);
        const $ = (sel) => wrap.querySelector(sel);
        const edit = $('.ldc-edit'), prev = $('.ldc-prev'), status = $('.ldc-status');
        let alive = true, raf = 0;
        const close = () => { alive = false; cancelAnimationFrame(raf); wrap.remove(); };
        $('.ldc-close').addEventListener('click', close);
        let S, P, ids, seg0, base0, rigP, cur, part = 0, tool = 'piece', painting = false, strokeIds = null, poly = [], mouse = null;
        try {
            const raw = await _rawOf(skin);
            S = await buildSheet(raw);
            await new Promise(r => setTimeout(r, 30));   // 先讓「切圖中…」畫出來
            P = prep(S);
            seg0 = autoSeg(S, P);
            ids = makePieces(S, P, seg0);
            base0 = decode(await b.resolveRef(skin.cut), S.w, S.h) || Int8Array.from(seg0);
        } catch (e) {
            console.warn('[DollCut] 切圖窗開不起來', e);
            status.textContent = '讀不到這隻小人的原圖：' + ((e && e.message) || e);
            $('.ldc-loading').hidden = true; return;
        }
        if (!alive) return;
        $('.ldc-loading').hidden = true;
        const shoesImg = await kit().shoes().catch(() => null);
        const fist = fistPainter(S);
        cur = { ids, start: base0, lab: Int8Array.from(base0), ops: [], R: null };
        const ectx = edit.getContext('2d', { willReadFrequently: true }), pctx = prev.getContext('2d');
        const PADT = 30;
        edit.width = prev.width = S.w; edit.height = S.h; prev.height = S.h + PADT;
        function applyOp(op, lab) {
            const set = v => Math.floor(v / 3) * 3 + op.part;
            if (op.t === 'pieces') {
                const SS = new Set(op.ids);
                for (let i = 0; i < ids.length; i++) if (lab[i] >= 0 && SS.has(ids[i])) lab[i] = set(lab[i]);
            } else {
                const c = document.createElement('canvas'); c.width = S.w; c.height = S.h;
                const cx = c.getContext('2d', { willReadFrequently: true });
                cx.beginPath(); op.pts.forEach(([x, y], j) => j ? cx.lineTo(x, y) : cx.moveTo(x, y)); cx.closePath();
                cx.fillStyle = '#000'; cx.fill();
                const a = cx.getImageData(0, 0, S.w, S.h).data;
                for (let i = 0; i < lab.length; i++) if (lab[i] >= 0 && a[i * 4 + 3] > 127) lab[i] = set(lab[i]);
            }
        }
        function rebuild() { cur.R = buildRig(S, cur.lab, shoesImg); }
        function recompute() { cur.lab = Int8Array.from(cur.start); cur.ops.forEach(op => applyOp(op, cur.lab)); redraw(); rebuild(); $('.ldc-undo').disabled = !cur.ops.length; }
        function pushOp(op, msg) { cur.ops.push(op); applyOp(op, cur.lab); redraw(); rebuild(); $('.ldc-undo').disabled = false; status.textContent = msg; }
        function redraw(hoverId) {
            const base = S.data, lab = cur.lab;
            const out = ectx.createImageData(S.w, S.h), o2 = out.data, bd = base.data;
            for (let i = 0; i < lab.length; i++) {
                const j = i * 4, L = lab[i];
                if (L < 0) { o2[j] = 255; o2[j + 1] = 255; o2[j + 2] = 255; o2[j + 3] = 255; continue; }
                const t = TINT[L % 3], a = (hoverId && ids[i] === hoverId) ? .72 : .42;
                o2[j] = bd[j] * (1 - a) + t[0] * a; o2[j + 1] = bd[j + 1] * (1 - a) + t[1] * a; o2[j + 2] = bd[j + 2] * (1 - a) + t[2] * a; o2[j + 3] = 255;
            }
            ectx.putImageData(out, 0, 0);
            if (tool === 'poly' && poly.length) {
                ectx.save(); ectx.lineWidth = 2; ectx.strokeStyle = '#111'; ectx.setLineDash([6, 4]);
                ectx.beginPath(); poly.forEach(([x, y], j) => j ? ectx.lineTo(x, y) : ectx.moveTo(x, y));
                if (mouse) ectx.lineTo(mouse[0], mouse[1]);
                ectx.stroke(); ectx.setLineDash([]); ectx.fillStyle = '#fff';
                poly.forEach(([x, y], j) => { ectx.beginPath(); ectx.arc(x, y, j ? 3 : 5, 0, Math.PI * 2); ectx.fill(); ectx.stroke(); });
                ectx.restore();
            }
        }
        function tick(ms) {
            if (!alive) return;
            if (cur.R) {
                const t = ms / 1000;
                pctx.setTransform(1, 0, 0, 1, 0, 0);
                pctx.fillStyle = '#fff'; pctx.fillRect(0, 0, prev.width, prev.height);
                pctx.save(); pctx.translate(0, PADT);
                S.views.forEach((V, k) => drawView(pctx, cur.R, k, 'idle', t, S, fist));
                pctx.restore();
            }
            raf = requestAnimationFrame(tick);
        }
        recompute();
        raf = requestAnimationFrame(tick);
        // ---- 滑鼠／手指（照小樣）
        const at = (ev) => { const r = edit.getBoundingClientRect(); return [Math.round((ev.clientX - r.left) / r.width * edit.width), Math.round((ev.clientY - r.top) / r.height * edit.height)]; };
        const idAt = ([x, y]) => (x < 0 || y < 0 || x >= edit.width || y >= edit.height) ? 0 : ids[y * edit.width + x];
        const PART = ['頭', '身體'];
        function addStroke(id) {
            if (!id || strokeIds.has(id)) return false;
            const i0 = ids.indexOf(id); if (i0 < 0 || cur.lab[i0] < 0) return false;
            strokeIds.add(id);
            applyOp({ t: 'pieces', ids: [id], part }, cur.lab); return true;
        }
        function setPolyBar() { $('.ldc-polybar').hidden = tool !== 'poly'; $('.ldc-polydone').disabled = poly.length < 3; }
        function closePoly() {
            if (poly.length < 3) { status.textContent = '至少要三個點才圈得起來。'; return; }
            const pts = poly.map(p => p.slice()); poly = []; mouse = null; setPolyBar();
            pushOp({ t: 'poly', pts, part }, '圈起來的範圍換成「' + PART[part] + '」。');
        }
        function cancelPoly() { poly = []; mouse = null; setPolyBar(); redraw(); status.textContent = '取消圈選。'; }
        edit.addEventListener('pointerdown', ev => {
            const p = at(ev);
            if (tool === 'poly') {
                if (poly.length >= 3 && Math.hypot(p[0] - poly[0][0], p[1] - poly[0][1]) < 10) { closePoly(); return; }
                const last = poly[poly.length - 1];
                if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 2) poly.push(p);
                setPolyBar(); redraw(); return;
            }
            painting = true; strokeIds = new Set(); try { edit.setPointerCapture(ev.pointerId); } catch (e) {}
            if (addStroke(idAt(p))) redraw();
        });
        edit.addEventListener('dblclick', () => { if (tool === 'poly' && poly.length >= 3) closePoly(); });
        edit.addEventListener('pointermove', ev => {
            const p = at(ev);
            if (tool === 'poly') { mouse = p; if (poly.length) redraw(); return; }
            if (painting) { if (addStroke(idAt(p))) redraw(); }
            else redraw(idAt(p));
        });
        function endStroke() {
            if (!painting) return;
            painting = false;
            if (strokeIds.size) {
                cur.ops.push({ t: 'pieces', ids: [...strokeIds], part });
                rebuild(); $('.ldc-undo').disabled = false;
                status.textContent = '換了 ' + strokeIds.size + ' 小塊成「' + PART[part] + '」。';
            }
            strokeIds = null;
        }
        edit.addEventListener('pointerup', endStroke);
        edit.addEventListener('pointercancel', endStroke);
        edit.addEventListener('pointerleave', () => { mouse = null; if (!painting) redraw(); });
        wrap.addEventListener('keydown', ev => {
            if (tool !== 'poly') return;
            if (ev.key === 'Enter') { ev.preventDefault(); closePoly(); }
            else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cancelPoly(); }
            else if (ev.key === 'Backspace' && poly.length) { ev.preventDefault(); poly.pop(); setPolyBar(); redraw(); }
        });
        $('.ldc-polydone').addEventListener('click', closePoly);
        $('.ldc-polycancel').addEventListener('click', cancelPoly);
        $('.ldc-undo').addEventListener('click', () => { if (!cur.ops.length) return; cur.ops.pop(); recompute(); status.textContent = '復原了上一步。'; });
        $('.ldc-reset').addEventListener('click', () => { cur.start = Int8Array.from(seg0); cur.ops = []; poly = []; setPolyBar(); recompute(); status.textContent = '回到程式自動切的樣子。'; });
        wrap.querySelectorAll('.ldc-seg').forEach(g => g.addEventListener('click', e => {
            const btn = e.target.closest('button[data-v]'); if (!btn) return;
            g.querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x === btn));
            if (g.dataset.g === 'part') part = +btn.dataset.v;
            else { tool = btn.dataset.v; poly = []; mouse = null; setPolyBar(); redraw(); }
        }));
        $('.ldc-save').addEventListener('click', async () => {
            const btn = $('.ldc-save'); btn.disabled = true;
            try {
                const id = 'cut_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                await b.idbPut(id, encode(cur.lab, S.w, S.h));
                const now = await _skinOf(o.key);
                if (!now || !now.raw) throw new Error('這隻小人的造型換掉了');
                const old = now.cut && now.cut.idb;
                const next = Object.assign({}, now, { cut: { idb: id } });
                if (b.saveSkin(o.key, next) === false) { try { await b.idbDel(id); } catch (e) {} throw new Error('本機空間滿了，存不下來'); }
                if (old && old !== id) { try { await b.idbDel(old); } catch (e) {} _parts.delete(old); }
                refresh(o.key);
                status.textContent = '存好了：大廳裡他站著時照這樣分頭和身體。';
                if (typeof o.onSaved === 'function') { try { o.onSaved(); } catch (e) {} }
                setTimeout(close, 700);
            } catch (e) { status.textContent = '沒存到：' + ((e && e.message) || e); btn.disabled = false; }
        });
        // 測試用
        wrap.__ldc = { get cur() { return cur; }, S, ids, seg0 };
    }

    window.LobbyDollCut = {
        autoCut,            // 三面原圖 → 自動切好的 JSON（生完不倒翁時存）
        openPanel,          // 裝扮頁「切頭和身體」
        bindLive, unbindLive, refresh,
        _parts: partsOf, _buildSheet: buildSheet, _prep: prep, _autoSeg: autoSeg, _pieces: makePieces, _encode: encode, _decode: decode, _live: () => _live,
    };
})();
