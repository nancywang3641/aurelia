// ----------------------------------------------------------------
// [檔案] core/void/lobby_doll_cut.js
// 職責：✂ GPT 生的不倒翁小人切成「頭／身體」兩層，站著時照衣櫥的呼吸動；切錯的地方在「切頭和身體」窗裡點一點換過去。
//   11-19：給 GPT 生成的做切圖，沿用既有切圖、不重複造 → 這支是 11-14 切圖小修（參考資料/CUT_FIX_LAB.html，本機）搬進來的：
//     自動切＝本機的切件腳本 sheet_parts.py 不倒翁版（ROLY）那套翻成網頁版：
//       頭頂以上、脖子線以上露出的皮膚、從頭頂一路連下來的頭髮色＝頭；身體外框（擦掉腳的那張 ctrl_sheet_roly）裡、下巴以下、不是頭髮色的＝身體；
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

    // 讀圖：網址的（內建六位管理員在素材庫）要帶跨網域，不然畫布讀不了像素；素材庫偶爾 403 就換 GitHub raw 再拿一次（lobby_stage 的 sfMirror）
    async function _imgOf(K, src) {
        const net = !/^(data:|blob:)/.test(String(src));
        try { return await K.loadImg(src, net); }
        catch (e) {
            const B = window.LobbyStage && window.LobbyStage._b, alt = net && B && B.sfMirror ? B.sfMirror(src) : null;
            if (alt) return await K.loadImg(alt, true);
            throw e;
        }
    }
    async function _textOf(ref) {   // 切好的頭身：本機存的是字串；內建的是素材庫的 json 檔
        const B = window.LobbyStage._b;
        if (!ref || !ref.url) return await B.resolveRef(ref);
        try { const r = await fetch(ref.url); if (r.ok) return await r.text(); } catch (e) {}
        const alt = B.sfMirror ? B.sfMirror(ref.url) : null;
        if (alt) { try { const r = await fetch(alt); if (r.ok) return await r.text(); } catch (e) {} }
        return null;
    }
    // ================= 三面原圖 → 並排一張（單位＝正面身體寬 278） =================
    async function buildSheet(raw) {
        const K = kit();
        if (!K) throw new Error('大廳小人那支還沒載入');
        const M = {};
        for (const v of VIEWS) { M[v] = K.measure(await _imgOf(K, raw[v])); if (!M[v]) throw new Error('量不到小人的位置'); }
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
    // 🧠 11-23 大廳待越久越卡 → 以前每一層（頭、身體、每隻鞋）都是整張三面圖那麼大的畫布，
    //   一隻小人 17 張（量到 1488×653 的三面圖＝約 63MB），partsOf 又最多留 12 隻：客人換來換去，記憶體一路吃到快 750MB。
    //   現在每層只留有畫東西的那一塊（{ cv, x, y }＝畫布和它在三面圖上的左上角），畫的時候走 _put 放回原位；一隻剩幾 MB。
    function _put(g, L, dx, dy) { if (L) g.drawImage(L.cv, L.x + (dx || 0), L.y + (dy || 0)); }
    function buildRig(S, lab, shoesImg) {
        const { w, h, views } = S, base = S.data.data;
        const bb = [];
        for (let L = 0; L < 9; L++) bb.push([w, h, -1, -1]);
        for (let i = 0; i < lab.length; i++) {
            const L = lab[i]; if (!(L >= 0 && L < 9)) continue;
            const x = i % w, y = (i / w) | 0, b = bb[L];
            if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
        }
        // 四周多留 EDGE 格透明：旋轉、縮放著畫時瀏覽器會取到畫布外一點點，緊貼著裁會在外框拖出一圈邊（跟整張畫的不一樣）
        const EDGE = 3;
        const layers = bb.map((b, L) => {
            if (b[2] < 0) return null;
            const x0 = Math.max(0, b[0] - EDGE), y0 = Math.max(0, b[1] - EDGE);
            const lw = Math.min(w, b[2] + 1 + EDGE) - x0, lh = Math.min(h, b[3] + 1 + EDGE) - y0;
            const c = document.createElement('canvas'); c.width = lw; c.height = lh;
            const cx = c.getContext('2d'), im = cx.createImageData(lw, lh), o = im.data;
            for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
                const i = (y0 + y) * w + x0 + x; if (lab[i] !== L) continue;
                const j = i * 4, q = (y * lw + x) * 4; o[q] = base[j]; o[q + 1] = base[j + 1]; o[q + 2] = base[j + 2]; o[q + 3] = base[j + 3];
            }
            cx.putImageData(im, 0, 0);
            return { cv: c, x: x0, y: y0 };
        });
        const feetLayers = views.map((V, k) => S.shoes[k].map(q => {
            // 畫布放在整數格上、鞋照原本的小數位置畫進去（跟以前畫在整張上逐點一樣）
            const ox = Math.floor(q.x) - EDGE, oy = Math.floor(q.y) - EDGE;
            const c = document.createElement('canvas'); c.width = Math.ceil(q.x + q.w) + EDGE - ox; c.height = Math.ceil(q.y + q.h) + EDGE - oy;
            if (shoesImg) c.getContext('2d').drawImage(shoesImg, q.r[0], q.r[1], q.r[2], q.r[3], q.x - ox, q.y - oy, q.w, q.h);
            return { cv: c, x: ox, y: oy };
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
        if (!src) return;
        const top = r.baseY - r.H - 2, x0 = Math.max(0, Math.round(r.cx - 220)), wid = Math.min(W - x0, 440), yOf = bodyMap(p, r);
        // src 只是有畫東西的那一塊（左上角在 src.x, src.y）：每一條只取跟它重疊的那段，目的地照同一個比例算
        const xa = Math.max(x0, src.x), xb = Math.min(x0 + wid, src.x + src.cv.width);
        if (xb <= xa) return;
        const sy0 = src.y, sy1 = src.y + src.cv.height;
        for (let y = Math.floor(top); y <= r.baseY + 1; y += STEP) {
            const ya = Math.max(y, sy0), yb = Math.min(y + STEP, sy1);
            if (yb <= ya) continue;
            const a = yOf(y), b = yOf(y + STEP), hh = Math.max(.5, b.y - a.y + .6), ky = hh / STEP;
            g.drawImage(src.cv, xa - src.x, ya - sy0, xb - xa, yb - ya,
                r.cx + (xa - r.cx) * a.sx, a.y + (ya - y) * ky, (xb - xa) * a.sx, (yb - ya) * ky);
        }
    }
    // 一面一格：k＝第幾面；拳頭（衣櫥的）跟著身體那個高度動；回傳畫好了沒
    // ================= 👁 眨眼：GPT 畫的睜眼零件對準臉上那雙，閉眼時把睜眼補成膚色、貼上閉眼零件 =================
    //   11-19 加 GPT 小人的眼睛拆分。照阿洛那張「眨眼拆件參考圖」說的：每個角色、每一面對準一次，以後眨眼都用同一套；
    //   零件常比臉上那雙大一點（他看出來的），所以找位置時連大小一起找（0.55～1.25 倍）。
    //   找法：灰階正規化互相關（只算零件不透明那些點），先縮三分之一粗找、再原尺寸在附近細找。正面左右眼各找各的（左零件找左半臉），側面一隻。
    //   閉眼：睜眼那塊（外擴 4）塗成臉的膚色（lobby_dress.js 量的那個顏色，同拳頭），閉眼零件水平對齊睜眼中心、高度放在睜眼六成那條（眼皮蓋下來的位置）。
    async function eyesOf(skin) {
        if (!skin || !skin.eyes) return null;
        try {
            const o = JSON.parse(await window.LobbyStage._b.resolveRef(skin.eyes));
            if (!o || !o.fo || !o.fc || !o.so || !o.sc) return null;
            const L = async (p) => Object.assign({}, p, { img: await loadImg(p.src) });
            return { fo: await Promise.all(o.fo.map(L)), fc: await Promise.all(o.fc.map(L)), so: await L(o.so), sc: await L(o.sc) };
        } catch (e) { console.warn('[DollCut] 眼睛零件讀不到（不眨眼）', e); return null; }
    }
    function _grayAt(S) {
        const n = S.w * S.h, d = S.data.data, gr = new Float32Array(n), al = new Uint8Array(n);
        for (let i = 0; i < n; i++) { gr[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3; al[i] = d[i * 4 + 3] >= 128 ? 1 : 0; }
        return { gr, al };
    }
    // 零件 → 縮放 f、再縮 q 倍的灰階＋遮罩
    function _tpl(part, unitK, f, q) {
        const w = Math.max(3, Math.round(part.w * unitK * f / q)), h = Math.max(3, Math.round(part.h * unitK * f / q));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(part.img, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h).data, pts = [];
        let sum = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i + 3] < 128) continue; const v = (d[i] + d[i + 1] + d[i + 2]) / 3; pts.push(x, y, v); sum += v; }
        const m = pts.length / 3; if (m < 8) return null;
        const mean = sum / m; let ss = 0;
        for (let i = 2; i < pts.length; i += 3) { pts[i] -= mean; ss += pts[i] * pts[i]; }
        return { w, h, pts, ss };
    }
    // 在 [x0,x1)×[y0,y1)（單位座標）裡找零件最像的位置和大小；回 { x, y, w, h, f, score }（左上角、單位）
    function _match(G, S, part, unitK, box) {
        const W = S.w;
        const score = (T, ox, oy, q) => {   // 縮 q 倍的取樣：原圖第 (ox + x)*q 那點
            let si = 0, sii = 0, sti = 0; const m = T.pts.length / 3;
            for (let i = 0; i < T.pts.length; i += 3) {
                const X = (ox + T.pts[i]) * q, Y = (oy + T.pts[i + 1]) * q;
                if (X < 0 || Y < 0 || X >= W || Y >= S.h) return -1;
                const j = Y * W + X; if (!G.al[j]) return -1;
                const v = G.gr[j]; si += v; sii += v * v; sti += T.pts[i + 2] * v;
            }
            const vi = sii - si * si / m; if (vi <= 1e-3) return -1;
            return sti / Math.sqrt(vi * T.ss);
        };
        let best = { score: -2 };
        const q = 3;
        for (let f = 0.55; f <= 1.2501; f += 0.05) {
            const T = _tpl(part, unitK, f, q); if (!T) continue;
            for (let oy = Math.floor(box[1] / q); oy + T.h <= Math.ceil(box[3] / q); oy++) for (let ox = Math.floor(box[0] / q); ox + T.w <= Math.ceil(box[2] / q); ox++) {
                const sc = score(T, ox, oy, q); if (sc > best.score) best = { score: sc, f, x: ox * q, y: oy * q };
            }
        }
        if (best.score < -1) return null;
        let fine = { score: -2 };
        for (let f = best.f - 0.04; f <= best.f + 0.0401; f += 0.01) {
            const T = _tpl(part, unitK, f, 1); if (!T) continue;
            for (let oy = best.y - 4; oy <= best.y + 4; oy++) for (let ox = best.x - 4; ox <= best.x + 4; ox++) {
                const sc = score(T, ox, oy, 1); if (sc > fine.score) fine = { score: sc, f, x: ox, y: oy };
            }
        }
        if (fine.score < -1) fine = best;
        return { x: fine.x, y: fine.y, w: part.w * unitK * fine.f, h: part.h * unitK * fine.f, f: fine.f, score: fine.score };
    }
    // 每一面：[{ open, closed, place:{x,y,w,h}, shut:{x,y,w,h} }]；找不到（像不到 0.35）就那一面不眨
    function fitEyes(S, E) {
        if (!E) return null;
        const G = _grayAt(S), unitK = 1 / S.Lo.s, out = [[], [], []];
        const go = (k, open, closed, box) => {
            const m = _match(G, S, open, unitK, box);
            if (!m || m.score < 0.35) return;
            const cw = closed.w * unitK * m.f, ch = closed.h * unitK * m.f, cx = m.x + m.w / 2, cy = m.y + m.h * 0.6;
            out[k].push({ open, closed, place: m, shut: { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch } });
        };
        const F = S.views[0], D = S.views[1];
        go(0, E.fo[0], E.fc[0], [F.px - 190, F.neck - 270, F.px + 10, F.neck - 10]);
        go(0, E.fo[1], E.fc[1], [F.px - 10, F.neck - 270, F.px + 190, F.neck - 10]);
        go(1, E.so, E.sc, [D.px - 120, D.neck - 270, D.px + 260, D.neck - 10]);
        return out;
    }
    // 閉眼的頭：頭那層複製一份，睜眼那塊塗膚色、貼閉眼
    function buildBlink(S, R, fits) {
        R.shut = [];
        if (!fits) return;
        const skin = (S.Lo.skin && S.Lo.skin.fill) || 'rgb(250,222,198)';
        fits.forEach((list, k) => {
            const head = R.layers[k * 3];
            if (!list.length || !head) return;
            // 只開頭那一塊（四周多留一點，閉眼零件偶爾比臉上那雙寬）；c 上的 (0,0)＝三面圖上的 (ox, oy)
            const PAD = 24, ox = Math.max(0, head.x - PAD), oy = Math.max(0, head.y - PAD);
            const c = document.createElement('canvas');
            c.width = Math.min(S.w, head.x + head.cv.width + PAD) - ox; c.height = Math.min(S.h, head.y + head.cv.height + PAD) - oy;
            const g = c.getContext('2d'); g.drawImage(head.cv, head.x - ox, head.y - oy);
            const sk = (S.Lo.skin && S.Lo.skin.rgb) || [250, 222, 198];
            list.forEach(e => {
                const p = e.place;
                const x0 = Math.max(ox, Math.floor(p.x - 16)), x1 = Math.min(ox + c.width, Math.ceil(p.x + p.w + 16));
                const y0 = Math.max(oy, Math.floor(p.y - 16)), y1 = Math.min(oy + c.height, Math.ceil(p.y + p.h + 16));
                if (x1 <= x0 || y1 <= y0) return;
                const bw = x1 - x0, bh = y1 - y0;
                // 睜眼那塊的形狀：零件的不透明處放到臉上那個位置再外擴（畫好幾次錯開＝簡單的膨脹）；近的（4）一律補，遠一點的（12）只補剩下的眼白和下睫毛
                //   遮罩也只開這隻眼睛那一小塊（以前是整張三面圖那麼大）
                const maskOf = (pad, step) => {
                    const m = document.createElement('canvas'); m.width = bw; m.height = bh;
                    const mg = m.getContext('2d', { willReadFrequently: true });
                    for (let dy = -pad; dy <= pad; dy += step) for (let dx = -pad; dx <= pad; dx += step) mg.drawImage(e.open.img, p.x + dx - x0, p.y + dy - y0, p.w, p.h);
                    return mg;
                };
                const near = maskOf(4, 2), far = maskOf(12, 3);
                const mn4 = near.getImageData(0, 0, bw, bh).data, mf = far.getImageData(0, 0, bw, bh).data, im = g.getImageData(x0 - ox, y0 - oy, bw, bh), d = im.data;
                // 補的顏色：這隻眼睛旁邊（遠的那圈外面）的皮膚平均，不是整張臉一個色（眼睛旁邊常比較暗或比較粉，用一個色會補出一塊）
                let sr = 0, sg = 0, sb = 0, sn = 0;
                for (let i = 0; i < bw * bh; i++) {
                    const j = i * 4; if (d[j + 3] < 250 || mf[j + 3] > 10) continue;
                    if (Math.abs(d[j] - sk[0]) + Math.abs(d[j + 1] - sk[1]) + Math.abs(d[j + 2] - sk[2]) > 60) continue;
                    sr += d[j]; sg += d[j + 1]; sb += d[j + 2]; sn++;
                }
                const fill = sn > 20 ? [sr / sn, sg / sn, sb / sn] : sk;
                for (let i = 0; i < bw * bh; i++) {
                    const j = i * 4; if (d[j + 3] < 8) continue;
                    const r = d[j], gg = d[j + 1], b2 = d[j + 2], mx = Math.max(r, gg, b2), mn = Math.min(r, gg, b2);
                    const white = mn > 222 && mx - mn < 26;
                    const lash = (r + gg + b2) / 3 < 150 && (mx - mn) < 60;
                    const blush = r > 200 && r - gg > 35;   // 腮紅、嘴：遠的那圈不碰
                    if (mn4[j + 3] > 40 || (mf[j + 3] > 40 && !blush && (white || lash))) { d[j] = fill[0]; d[j + 1] = fill[1]; d[j + 2] = fill[2]; }
                }
                g.putImageData(im, x0 - ox, y0 - oy);
                g.drawImage(e.closed.img, e.shut.x - ox, e.shut.y - oy, e.shut.w, e.shut.h);
            });
            R.shut[k] = { cv: c, x: ox, y: oy };
        });
    }
    function drawView(g, R, k, motion, t, S, fist, closed) {
        const r = R.rig[k]; if (!r || r.baseY < 0) return;
        const L = MOTION_LEN[motion] || 2.4, tq = ((t - LAG) % L + L) % L;
        const P = pose(motion, k, t), Q = pose(motion, k, tq), nn = neckOf(P, r), nq = neckOf(Q, r), c = x => Math.max(-LAG_MAX * r.s, Math.min(LAG_MAX * r.s, x * LAG_K));
        const lag = { x: c(nq.x - nn.x), y: c(nq.y - nn.y) }, neck0 = r.baseY - r.H;
        const fists = (front) => { if (fist) fist(g, k, front, P.plant ? bodyMap(P, r) : null, P, r); };
        if (P.plant) {
            [1, 0].forEach(i => _put(g, R.feetLayers[k][i]));
            fists(false);
            drawBody(g, R.layers[k * 3 + 1], P, r, S.w);
            fists(true);
        } else {
            g.save();
            g.translate(0, P.dy * r.s); g.translate(r.cx, r.baseY); g.rotate(P.rot * Math.PI / 180); g.scale(P.sx, P.sy); g.translate(-r.cx, -r.baseY);
            [1, 0].forEach(i => { if (!R.feetLayers[k][i]) return; g.save(); g.translate(P.feet[i].dx * r.s, P.feet[i].dy * r.s); _put(g, R.feetLayers[k][i]); g.restore(); });
            fists(false);
            _put(g, R.layers[k * 3 + 1]);
            fists(true);
            g.restore();
        }
        g.save();
        g.translate(nn.x + lag.x, nn.y + lag.y);
        g.translate(r.cx, neck0); g.rotate((P.rot + P.head) * Math.PI / 180); g.translate(-r.cx, -neck0);
        _put(g, (closed && R.shut && R.shut[k]) || R.layers[k * 3]);
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
    const _parts = new Map();   // 切好的那筆鑰匙 → Promise<{S, film, fits}>（大場景烤好的格子）
    async function _skinOf(key) { const LS = window.LobbyStage; return (LS && LS._b && LS._b.skins) ? LS._b.skins()[key] : null; }
    async function _rawOf(skin) {
        const b = window.LobbyStage._b, raw = {};
        for (const v of VIEWS) { raw[v] = await b.resolveRef(skin.raw[v]); if (!raw[v]) throw new Error('原圖讀不到'); }
        return raw;
    }
    // 🎞 11-23 起呼吸動作只在一對一 focus 時現算，其餘大場景全部烤成一格格（同衣櫥「只有在 focus 一人時才開」那條）
    //   大場景：做好零件時先把三個方向的待機呼吸各烤 FILM_N 格＋一格閉眼，拼成一張小圖（每格 FILM_H 高），之後每 0.2 秒換一格、貼一張，不再現算；
    //     烤完現算用的零件（R）就放掉。以前每隻每秒現算 10 次（身體切一條一條拉伸再拼），六位管理員加客人一起在跑。
    //   一對一（正在跟他講話，S.talkTarget）：才臨時把現算那套組起來（rigOf，最多留兩隻），講完收掉。
    //   眨眼那一格是第 0 格的姿勢閉眼：呼吸幅度只有一兩 px，閉 0.14 秒看不出姿勢跳。
    const FILM_N = 10, FILM_H = 200;
    async function bakeFilm(S, R, fist) {
        const Lo = S.Lo, L = kit().LIMB, cw = Lo.cw, ch = Lo.ch;
        const FH = Math.min(ch, FILM_H), FW = Math.max(1, Math.round(cw * FH / ch));
        const film = document.createElement('canvas'); film.width = FW * (FILM_N + 1); film.height = FH * 3;
        const fg = film.getContext('2d'); fg.imageSmoothingQuality = 'high';
        const T = document.createElement('canvas'); T.width = cw; T.height = ch;
        const tg = T.getContext('2d');
        const P = MOTION_LEN.idle;
        for (let k = 0; k < 3; k++) {
            const V = S.views[k];
            for (let f = 0; f <= FILM_N; f++) {
                tg.setTransform(1, 0, 0, 1, 0, 0); tg.clearRect(0, 0, cw, ch);
                tg.translate(cw / 2, ch - 1); tg.scale(Lo.k0, Lo.k0); tg.translate(0, -L.below * Lo.s); tg.scale(Lo.s, Lo.s);
                tg.translate(-V.px, -V.feet);
                const closed = f === FILM_N;
                drawView(tg, R, k, 'idle', closed ? 0 : f * P / FILM_N, S, fist, closed);
                fg.drawImage(T, 0, 0, cw, ch, f * FW, k * FH, FW, FH);
            }
            await new Promise(r => setTimeout(r, 0));   // 一個方向烤完讓一下，別一口氣卡住畫面
        }
        T.width = T.height = 0;
        return { cv: film, fw: FW, fh: FH };
    }
    // 做零件（切頭身、閉眼頭）：大場景拿去烤格子，一對一拿去現算
    async function buildParts(skin) {
            const K = kit();
            const raw = await _rawOf(skin);
            const S = await buildSheet(raw);
            let lab = decode(await _textOf(skin.cut), S.w, S.h);
            if (!lab) lab = autoSeg(S, prep(S));
            const shoes = await K.shoes();
            const R = buildRig(S, lab, shoes);
            let fits = null;
            if (skin.shut && skin.shut.front) {
                // 👁 閉眼現成的兩面（內建六位：阿洛的貼片貼回原圖，跟睜眼逐像素對齊）→ 同一套切法切出閉眼的頭，眨眼直接換
                try {
                    const b = window.LobbyStage._b;
                    const shut = { front: await b.resolveRef(skin.shut.front), side: await b.resolveRef(skin.shut.side), back: raw.back };
                    const S2 = await buildSheet(shut);
                    if (S2.w === S.w && S2.h === S.h) {
                        const R2 = buildRig(S2, lab, shoes);
                        R.shut = [R2.layers[0], R2.layers[3]];   // 正面、側面的頭（背面看不到眼睛）
                    } else console.warn('[DollCut] 閉眼那張跟睜眼對不齊，不眨眼', skin.cut);
                } catch (e) { console.warn('[DollCut] 閉眼那兩面讀不到，不眨眼', e); }
            } else {
                fits = fitEyes(S, await eyesOf(skin));
                buildBlink(S, R, fits);
            }
            // 大廳畫的時候只用得到這幾樣：整張三面圖的畫布、像素、三面原圖（S.cv／S.data／S.M）切完就放掉，不跟著快取留著
            //   側面原圖（沒手沒腳那張）留著：坐下時照衣櫥坐桌前的位置拼（sitPose）
            const slim = { w: S.w, h: S.h, views: S.views, shoes: S.shoes, Lo: S.Lo, shoesImg: shoes, side: { img: S.M.side.img, cx: S.M.side.cx, bot: S.M.side.bot, bodyH: Math.max(60, S.views[1].feet - S.views[1].neck) } };
            return { S: slim, R, fist: fistPainter(slim), fits };
    }
    const _cutId = (skin) => (skin.cut && (skin.cut.idb || skin.cut.url)) || '';
    // 大場景用：烤好的格子（零件烤完就放掉）
    function partsOf(skin) {
        const id = _cutId(skin);
        if (_parts.has(id)) return _parts.get(id);
        const p = (async () => {
            const P = await buildParts(skin);
            const film = await bakeFilm(P.S, P.R, P.fist);
            return { S: P.S, film, fits: P.fits };   // S.side：坐下用
        })();
        _parts.set(id, p);
        p.catch(() => _parts.delete(id));
        if (_parts.size > 12) _parts.delete(_parts.keys().next().value);
        return p;
    }
    // 一對一用：現算的零件，最多留兩隻
    const _rigs = new Map();
    function rigOf(skin) {
        const id = _cutId(skin);
        if (_rigs.has(id)) return _rigs.get(id);
        const p = buildParts(skin);
        _rigs.set(id, p);
        p.catch(() => _rigs.delete(id));
        if (_rigs.size > 2) _rigs.delete(_rigs.keys().next().value);
        return p;
    }

    // ================= 🪑 坐下、吃東西（11-23：送了吃的，小人卻還是站著 → 照衣櫥做） =================
    //   🚨 位置全部照衣櫥：衣櫥常客「坐桌前」（sitTable，定案的那個）和「叉子吃一口」（biteFork）的側面，
    //     11-23 從衣櫥入口實際量（getBoundingClientRect，衣櫥單位、相對身體底部中心；衣櫥側面臉朝左，這裡的側面臉朝右，所以 x 反過來），
    //     不自己估。
    //   坐桌前（衣櫥單位、相對身體底部中心）：遠的那隻腳在前面 31.3、上面 20.5；近的那條腿被身體擋住不畫；一隻拳頭擱桌面（前 64.5、上 98.2），另一隻（前 64.5、上 34.7）。
    //   吃一口（5.2 秒）：下面那隻拳頭照衣櫥那段軌跡舉到嘴邊再放下（每 0.2 秒一格，BITE_PATH 是相對坐著那個位置差多少）。
    //   身體：衣櫥坐下會壓扁一點（寬 1.156、高 0.897），不倒翁的身體跟頭是同一張圖，壓了頭也會扁，這裡不壓。
    //   🚨 11-23 第一版拿「坐著比站著移動多少」直接加在不倒翁站著的手腳上 → 兩隻拳頭堆到臉上：不倒翁大頭小身，身體只有衣櫥小人八成高。
    //     改成照衣櫥坐著時「手腳相對身體在哪」，再照身體大小等比換過來（寬：不倒翁身體 278／2.71 比衣櫥坐著的身體寬 128.1；
    //     高：不倒翁脖子線到圓底 NECK_UP／2.71 比衣櫥坐著的身體高 112.3）。
    const WU = 2.71;
    //     高用「這一隻」切圖時量到的身體高（側面脖子線到圓底，S.views[1]）：GPT 畫的每隻身體高矮不一，改成大頭小身之後更矮，照樣板的 NECK_UP 手會跑到臉上。
    const SIT_KX = (278 / WU) / 128.1 * WU;                    // 衣櫥單位 → 這裡的單位（寬，已含 2.71）
    const _sitKY = (bodyH) => bodyH / 112.3;                   // 高
    const SIT_SHOE_W = [-31.3, -20.5];                         // 遠的那隻腳（中心，衣櫥單位，相對身體底部中心）
    const SIT_FIST_TABLE_W = [-64.5, -98.2];                   // 擱桌面那隻
    const SIT_FIST_LOW_W = [-64.5, -34.7];                     // 另一隻（吃的時候舉起來那隻）
    const BITE_LEN = 5.2, BITE_STEP = 0.2;
    const BITE_PATH = [[-22.7,-35.1],[-22.9,-35.1],[-32.6,-40.1],[-68.9,-84.1],[-53.2,-119.7],[-39.1,-117.7],[-37.7,-102.4],[-72.1,-100.5],[-75.8,-97.3],[-77.2,-91.1],[-75,-80.8],[-70.7,-72.8],[-65.9,-73.6],[-51.1,-78.3],[-50.1,-79.6],[-52.4,-81.5],[-65.3,-79.8],[-71.8,-81.1],[-65.5,-75.5],[-49.9,-60.8],[-31.5,-43.4],[-22.6,-35.2],[-22.6,-35.1],[-22.6,-35.1],[-22.6,-35],[-22.6,-35.1],[-22.7,-35.1]];
    const BITES = 6;                                        // 吃幾口就吃完（同 lobby_ember.js 的常客）
    function _bitePose(t, KY) {   // 吃到第 t 秒：下面那隻拳頭比「坐著」差多少（這裡的單位、臉朝右）
        const f = Math.max(0, Math.min(BITE_PATH.length - 1, t / BITE_STEP)), i = Math.floor(f), j = Math.min(BITE_PATH.length - 1, i + 1), u = f - i;
        const p = BITE_PATH[i], q = BITE_PATH[j], o = BITE_PATH[0];
        return [-(p[0] + (q[0] - p[0]) * u - o[0]) * SIT_KX, (p[1] + (q[1] - p[1]) * u - o[1]) * KY];
    }
    // 叫法（lobby_cafe_regulars.js）：sitPose(a, seat) 坐下（seat＝_seatsOf 那種：sx/sy 椅面、right 朝右坐）、sitPose(a, null) 站起來、eat(a) 開始吃
    function sitPose(a, seat) {
        const B = a && a._dollLive;
        if (!B) return false;
        if (!seat) { B.sit = null; if (B.sc) { try { B.sc.remove(); } catch (e) {} B.sc = null; } try { a.el.style.opacity = ''; } catch (e) {} B.on = false; return true; }
        B.sit = { seat, eat: null };
        return true;
    }
    function eat(a) {
        const B = a && a._dollLive;
        if (!B || !B.sit) return false;
        B.sit.eat = { bites: 0, next: performance.now() / 1000 + 2 + Math.random() * 2, act: null };
        return true;
    }
    const canSit = (a) => !!(a && a._dollLive && a._dollLive.skin && a._dollLive.skin.raw && a._dollLive.skin.raw.side);
    function _drawSit(B, S, now) {
        const a = B.a, SH = B.parts.S, Lo = SH.Lo, L = kit().LIMB, K = kit(), sd = SH.side, seat = B.sit.seat;
        if (!sd || !sd.img) return;
        const s = Lo.s, q = FILM_H / Lo.ch;                     // 畫布解析度跟烤好的格子一樣
        const W = Math.ceil(Lo.cw * 1.9 * q), H = Math.ceil(Lo.ch * 1.3 * q), ox = Math.round(W * 0.3), oy = Math.round(H * 0.8);
        if (!B.sc || B.sc.parentNode !== S.world) {
            if (B.sc) { try { B.sc.remove(); } catch (e) {} }
            B.sc = document.createElement('canvas'); B.sc.className = 'ldc-sit'; B.sc.width = W; B.sc.height = H;
            B._stf = '';   // 新的那張還沒擺位置：別被「上次一樣就不設」擋掉（11-23 坐著的人飛到左上角）
            B.sc.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;transform-origin:0 0';
            S.world.appendChild(B.sc);
        }
        if (B.cv) B.cv.style.display = 'none';
        // 吃：兩口之間 7～15 秒，吃 BITES 口
        const E = B.sit.eat;
        let bite = [0, 0];
        if (E) {
            if (E.act != null) { const t = now - E.act; if (t >= BITE_LEN) { E.act = null; E.bites++; E.next = now + 7 + Math.random() * 8; } else bite = _bitePose(t, _sitKY(sd.bodyH)); }
            else if (E.bites < BITES && now >= E.next) E.act = now;
        }
        const g = B.sc.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
        g.translate(ox, oy); g.scale(q * Lo.k0, q * Lo.k0);    // 原點＝蛋形身體最低點中心（坐在椅面上），單位＝原圖 px
        const KY = _sitKY(sd.bodyH), pt = (p) => [-p[0] * SIT_KX, p[1] * KY];   // 衣櫥側面臉朝左，這裡朝右：x 反過來
        const SIT_SHOE = pt(SIT_SHOE_W), SIT_FIST_TABLE = pt(SIT_FIST_TABLE_W), SIT_FIST_LOW = pt(SIT_FIST_LOW_W);
        const far = L.side[0];
        // 遠的那隻手（擱桌面那隻）畫在身體和頭後面（11-23）：
        //   衣櫥裡它畫在前面，但只碰到臉一小角（實測約 2%）；不倒翁頭大、臉低，同一個位置會整塊壓在臉上。它是身體另一側的手，藏到後面才對，露出擱桌上那一截。
        K.fist(g, SIT_FIST_TABLE[0] * s, SIT_FIST_TABLE[1] * s, L.fistK * s, true, Lo.skin);
        g.drawImage(sd.img, -sd.cx, -sd.bot);                  // 其餘照衣櫥的順序：身體 → 腳 → 近的那隻拳頭
        g.drawImage(SH.shoesImg, far.r[0], far.r[1], far.r[2], far.r[3], (SIT_SHOE[0] - far.r[2] / 2) * s, (SIT_SHOE[1] - far.r[3] / 2) * s, far.r[2] * s, far.r[3] * s);
        K.fist(g, (SIT_FIST_LOW[0] + bite[0]) * s, (SIT_FIST_LOW[1] + bite[1]) * s, L.fistK * s, true, Lo.skin);
        // 擺到椅子上：蛋底對到椅面；朝左坐的整張翻過來；畫面大小照他站著時那一格的比例
        const wpc = (a._standH || a.h) / Lo.ch / q;                // 這張畫布一 px＝舞台幾 px
        const mirror = !seat.right;
        const left = seat.sx - (mirror ? (W - ox) : ox) * wpc, top = seat.sy - oy * wpc;
        const tf = 'translate3d(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px,0) scale(' + (mirror ? -wpc : wpc).toFixed(4) + ',' + wpc.toFixed(4) + ')' + (mirror ? ' translateX(' + (-W) + 'px)' : '');
        if (B._stf !== tf) { B.sc.style.transform = tf; B._stf = tf; }
        const z = a.el.style.zIndex || '';
        if (B.sc.style.zIndex !== z) B.sc.style.zIndex = z;
        try { if (a.el.style.opacity !== '0') a.el.style.opacity = '0'; } catch (e) {}
    }

    // ================= 大廳：站著時疊一張畫布照衣櫥的待機呼吸畫 =================
    const _live = new Set(); let _timer = null;
    function bindLive(a, key, skin) {
        if (!a || !skin || !skin.raw || !skin.cut) return;
        if (a._dollLive) unbindLive(a._dollLive);
        const B = { a, key, skin, el0: a.el, parts: null, rig: null, rigP: null, cv: null, on: false, clock: Math.random() * 2.4 };
        a._dollLive = B; _live.add(B);
        partsOf(skin).then(v => { if (_live.has(B)) B.parts = v; }).catch(e => { console.warn('[DollCut] 小人的頭身讀不到，照舊用走路圖', e); unbindLive(B); });
        if (!_timer) _timer = setInterval(_tick, 100);
    }
    function unbindLive(B) {
        if (!B) return;
        _live.delete(B);
        _showLive(B, false);
        if (B.cv) { try { B.cv.remove(); } catch (e) {} B.cv = null; }
        if (B.sc) { try { B.sc.remove(); } catch (e) {} B.sc = null; }
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
            if (B.sit) { try { _drawSit(B, S, now); } catch (e) { console.warn('[DollCut] 坐姿畫不出來', e); sitPose(a, null); } continue; }
            if (a.walking || a.dest) { _showLive(B, false); continue; }
            try { _drawLive(B, S, now); } catch (e) { console.warn('[DollCut] 畫不出來，照舊用走路圖', e); unbindLive(B); }
        }
    }
    function _drawLive(B, S, now) {
        const a = B.a, SH = B.parts.S, film = B.parts.film, Lo = SH.Lo, L = kit().LIMB;
        // 一對一（正在跟他講話）才組現算的零件；講完收掉，回去換格
        const focus = S.talkTarget === a;
        if (focus && !B.rig && !B.rigP) B.rigP = rigOf(B.skin).then(v => { if (B.rigP && S.talkTarget === a) B.rig = v; B.rigP = null; }).catch(() => { B.rigP = null; });
        if (!focus && (B.rig || B.rigP)) { B.rig = null; B.rigP = null; }
        const live = !!(focus && B.rig);
        const cw = live ? Lo.cw : film.fw, ch = live ? Lo.ch : film.fh;
        if (!B.cv || B.cv.parentNode !== S.world) {
            if (B.cv) { try { B.cv.remove(); } catch (e) {} }
            B.cv = document.createElement('canvas'); B._tf = '';   // 新的那張還沒擺位置（同坐姿那張）
            B.cv.className = 'ldc-live'; B.cv.style.display = 'none';
            S.world.appendChild(B.cv); B.on = false; B._fk = '';
        }
        if (B.cv.width !== cw || B.cv.height !== ch) { B.cv.width = cw; B.cv.height = ch; B._fk = ''; }
        const d = a.dir || 0, k = d === 3 ? 2 : (d === 1 || d === 2) ? 1 : 0, mirror = d === 1;   // 走路圖：往左那列是側面翻過來
        // 眨眼：每人自己的節奏 2.5～4.5 秒一次、閉 0.14 秒（同衣櫥）
        if (!B.nextBlink) B.nextBlink = now + 1 + Math.random() * 3;
        if (now >= B.nextBlink + 0.14) B.nextBlink = now + 2.5 + Math.random() * 2;
        const closed = now >= B.nextBlink && now < B.nextBlink + 0.14;
        const g = B.cv.getContext('2d');
        if (!live) {
            // 換格：跟上一次同一格就不動
            const P = MOTION_LEN.idle, ph = (((now + B.clock) % P) + P) % P;
            const f = closed ? FILM_N : Math.min(FILM_N - 1, Math.floor(ph / P * FILM_N));
            const fk = k + '|' + f + '|' + (mirror ? 1 : 0);
            if (B._fk !== fk) {
                B._fk = fk;
                g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
                if (mirror) { g.translate(cw, 0); g.scale(-1, 1); }
                g.drawImage(film.cv, f * cw, k * ch, cw, ch, 0, 0, cw, ch);
            }
        } else {
            const { R, fist } = B.rig;
            B._fk = '';
            g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
            if (mirror) { g.translate(cw, 0); g.scale(-1, 1); }
            // 同走路圖那一格（lobby_dress.js 的 _dollCell）：原點＝圓底中心、圓底最低點；這裡再縮回 278 那把尺
            g.translate(cw / 2, ch - 1); g.scale(Lo.k0, Lo.k0); g.translate(0, -L.below * Lo.s); g.scale(Lo.s, Lo.s);
            const V = SH.views[k];
            g.translate(-V.px, -V.feet);
            drawView(g, R, k, 'idle', now + B.clock, SH, fist, closed);
        }
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
        const fits = fitEyes(S, await eyesOf(skin));
        function rebuild() { cur.R = buildRig(S, cur.lab, shoesImg); buildBlink(S, cur.R, fits); }
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
                const closed = (t % 3.2) < 0.14;   // 預覽也眨（三秒多一次）
                S.views.forEach((V, k) => drawView(pctx, cur.R, k, 'idle', t, S, fist, closed));
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
        wrap.__ldc = { get cur() { return cur; }, S, ids, seg0, fits };
    }

    window.LobbyDollCut = {
        autoCut,            // 三面原圖 → 自動切好的 JSON（生完不倒翁時存）
        openPanel,          // 裝扮頁「切頭和身體」
        bindLive, unbindLive, refresh,
        sitPose, eat, canSit,   // 🪑 坐下（照衣櫥坐桌前）、吃一口（照衣櫥叉子吃一口）；lobby_cafe_regulars.js 用
        _parts: partsOf, _eyesOf: eyesOf, _fitEyes: fitEyes, _buildSheet: buildSheet, _prep: prep, _autoSeg: autoSeg, _pieces: makePieces, _encode: encode, _decode: decode, _live: () => _live,
    };
})();
