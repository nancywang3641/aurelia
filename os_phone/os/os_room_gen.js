// ----------------------------------------------------------------
// [檔案] os_room_gen.js
// 路徑：os_phone/os/os_room_gen.js
// 職責：整房生圖引擎——把玩家親手擺好的「包裹訂單」翻成一條英文布置提示詞，
//       再拿 SVG 空房當母圖、房間內部當遮罩，一次 inpaint 出整間房。
//   一間房只燒一次生圖(＋一次副模型翻譯訂單)；家具是畫進圖裡的像素，不是可搬動的物件。
//   純邏輯無 UI，依賴 OS_ROOM_SVG / OS_IMAGE_MANAGER / OS_API。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    // 底詞：鎖住「由上往下看、牆面可放東西、天花板不准有東西」，實測通過的組合，不要改。
    const ROOM_POSITIVE = "bird's-eye top-down tilemap room layout, fixed camera looking downward, objects may be placed on the floor plane or mounted on the wall plane, all visible from above";
    const ROOM_NEGATIVE = 'ceiling plane objects, ceiling-mounted objects, objects hanging from the ceiling, objects suspended from the ceiling, low-angle view, eye-level view, interior photography perspective';

    // 🚨 地板材質一定要寫進提示詞：房型定了材質、母圖也畫了，但重繪幅度夠高時整片室內都會被重畫，
    //   沒有提示詞護著就被模型自己編的地板蓋掉（房型的材質設定等於白設）。順便讓重抽時地板保持一致。
    const FLOOR_WORDS = {
        oak:      'warm oak plank wood flooring',
        walnut:   'dark walnut plank wood flooring',
        greywash: 'grey washed wood plank flooring',
        tile:     'pale grey ceramic tile flooring',
        carpet:   'soft green carpet flooring',
    };

    // 🚨 生圖參數寫死不外露，面板一律不給調。
    //   重繪幅度 0.87＝Rae 2026-07-26 在 ComfyUI 原介面細調出來的定案（0.90 位置準但放飛、0.85 太貼母圖）。
    //   取捨：往上＝位置更準、畫面更放飛；往下＝更貼母圖的房型與透視、但提示詞份量變小位置會飄。
    //   位置偶爾歪掉不用改參數——「重新生成」只換圖不重翻訂單，重抽很便宜。
    //   🚨 這是三個值來回比出來的，別無腦改成整數。
    const DENOISE = 0.87;
    const PROTECT = 4;
    const LONG_SIDE = 1024;      // 母圖長邊

    const K_STYLE = 'aurelia_room_style_preset';   // 畫風預設包名稱(小資料走 localStorage，不動 OS_DB schema)

    function _svg() { return win.OS_ROOM_SVG || window.OS_ROOM_SVG || null; }
    function _mgr() { try { return win.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER || null; } catch (e) { return null; } }
    function _api() { try { return win.OS_API || window.OS_API || null; } catch (e) { return null; } }
    function _clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function _strip(dataUrl) { return String(dataUrl || '').replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ''); }

    // ── 畫風預設包：只認得整房 inpaint 那顆接口的包 ──
    function listStylePresets() {
        const m = _mgr();
        const live = (m && m.config && m.config.comfyuiDirect) || {};
        const all = Array.isArray(live.presets) ? live.presets : [];
        const list = all.filter(function (p) {
            return String((p && p.modelType) || '').toLowerCase() === 'anima' || /anima/i.test(String((p && p.model) || ''));
        });
        if (!list.length && (String(live.modelType || '').toLowerCase() === 'anima' || /anima/i.test(String(live.model || '')))) {
            return [Object.assign({ name: '目前的畫風設定' }, live)];
        }
        return list;
    }

    function getStyleName() {
        try { return win.localStorage.getItem(K_STYLE) || ''; } catch (e) { return ''; }
    }
    function setStyleName(name) {
        try { win.localStorage.setItem(K_STYLE, String(name || '')); } catch (e) {}
    }
    function pickStylePreset() {
        const list = listStylePresets();
        if (!list.length) return null;
        const want = getStyleName();
        for (let i = 0; i < list.length; i++) if ((list[i].name || '') === want) return list[i];
        return list[0];
    }

    // ── 位置語言：0~100 座標 → 九宮格位置詞(提示詞看得懂的說法) ──
    const ROWS = ['top', 'middle', 'bottom'];
    const COLS = ['left', 'center', 'right'];
    function positionWord(x, y) {
        const c = x < 33.34 ? 0 : (x < 66.67 ? 1 : 2);
        const r = y < 33.34 ? 0 : (y < 66.67 ? 1 : 2);
        return ROWS[r] + ' ' + COLS[c];
    }

    // 🛋 玩家把幾件東西擺在一起＝他要的是一個生活區域（沙發配電視、書桌配椅子）。
    //   只給九宮格位置的話 AI 只知道「同一區」，不知道「這是一組」，也不知道彼此該怎麼擺；
    //   而且九宮格是粗格子，兩件明明靠在一起卻可能跨在格線兩側被說成不同區。
    //   → 先把距離近的併成一群，位置用整群的重心算，翻譯時整群寫成一行。
    const CLUSTER_R = 20;   // 中心距離小於這個（座標是 0~100 的百分比）就算擺在一起
    function clusterOrder(order) {
        const n = order.length;
        const parent = order.map(function (_, i) { return i; });
        function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const dx = (order[i].x || 0) - (order[j].x || 0), dy = (order[i].y || 0) - (order[j].y || 0);
                if (Math.sqrt(dx * dx + dy * dy) <= CLUSTER_R) {
                    const ra = find(i), rb = find(j);
                    if (ra !== rb) parent[ra] = rb;
                }
            }
        }
        const buckets = {}, seq = [];
        order.forEach(function (it, i) {
            const r = find(i);
            if (!buckets[r]) { buckets[r] = []; seq.push(r); }
            buckets[r].push(it);
        });
        return seq.map(function (r) {
            const items = buckets[r];
            let sx = 0, sy = 0;
            items.forEach(function (it) { sx += (it.x || 0); sy += (it.y || 0); });
            return { items: items, x: sx / items.length, y: sy / items.length };
        });
    }

    // ── 訂單 → 副模型 messages：只准翻譯，不准自己加減物件、不准改位置 ──
    function orderMessages(order) {
        const sys = [
            '你是房間布置提示詞翻譯器。玩家已經親手決定了每件東西要放在房間的哪個位置，你的工作只是把這份訂單翻成一條英文生圖提示詞。',
            '硬性規則：',
            '一、只能翻譯訂單上有的東西，不准自己增加、刪除或合併任何一件，件數必須跟訂單一模一樣。',
            '二、每件東西的位置以訂單給的為準，不准更動、不准重新安排。',
            '三、這是固定俯視角的房間布置，鏡頭只能由上往下看。牆面物件、壁掛物件、靠牆物件全部允許。',
            '四、唯獨附著於天花板、位於天花板平面，或從天花板向下垂落的元素一律不准出現；照明只能用立燈、壁燈、桌燈這類不碰天花板的燈具。',
            '五、不得加入人物。',
            '六、標了「※同一組」的那幾件，是玩家刻意擺在一起的一個生活區域：要畫成彼此相鄰、方向互相配合（例如電視要對著沙發、椅子要靠著書桌），不是各擺各的；但它們仍然是各自獨立的物件，不可以合併成一件。',
            '輸出骨架只能理解為：<位置> <該件東西的英文名稱與必要細節>，各件之間用英文逗號分隔。',
            '角括號是結構佔位說明，正式輸出時要換成實際英文內容，不可保留角括號或方括號。',
            '不要解釋、不要 markdown、不要給替代版本。只輸出 <room-layout>...</room-layout>。',
        ].join('\n');
        const body = clusterOrder(order).map(function (g) {
            const pos = positionWord(g.x, g.y);   // 整群用重心定位，不會被格線切開
            const line = g.items.map(function (it) {
                const name = String(it.name || '').trim();
                const note = String(it.content || '').trim();
                return name + (note ? '（' + note + '）' : '');
            }).join('、');
            return pos + '：' + line + (g.items.length > 1 ? '　※同一組，這 ' + g.items.length + ' 件要擺在一起' : '');
        }).join('\n');
        return [
            { role: 'system', content: sys },
            { role: 'user', content: '訂單（共 ' + order.length + ' 件，位置在前、東西在後）：\n' + body + '\n\n請照這份訂單輸出 <room-layout>。' },
        ];
    }

    // 天花板／垂吊詞就地改寫成牆或地面的等效詞：改寫而非退件，一發過、不白燒
    function sanitizeCeiling(text) {
        return String(text || '')
            .replace(/\bceiling[-\s]?mounted\b/gi, 'wall-mounted')
            .replace(/\bchandeliers?\b/gi, 'floor lamp')
            .replace(/\bpendant\s+lights?\b/gi, 'wall sconce')
            .replace(/\bceiling\s+fans?\b/gi, 'floor fan')
            .replace(/\b(?:hanging|suspended|attached)\s+from\s+the\s+ceiling\b/gi, 'mounted on the wall')
            .replace(/\battached\s+to\s+the\s+ceiling\b/gi, 'attached to the wall')
            .replace(/\bceiling\s+lights?\b/gi, 'wall lamp')
            .replace(/\bceilings?\b/gi, 'wall');
    }

    function parseLayout(raw) {
        const t = String(raw || '')
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .replace(/```(?:[a-z]+)?/gi, '')
            .replace(/```/g, '')
            .trim();
        const m = t.match(/<room-layout>([\s\S]*?)<\/room-layout>/i);
        const layout = sanitizeCeiling(String(m ? m[1] : t).replace(/\s+/g, ' ').trim());
        if (!layout) throw new Error('這次沒收到布置內容，再按一次配送就好。');
        if (/\[[^\]]+\]/.test(layout)) throw new Error('這次的布置沒寫完整，再按一次配送就好。');
        return layout;
    }

    function translateOrder(order) {
        return new Promise(function (resolve, reject) {
            const api = _api();
            if (!api || typeof api.chatSecondary !== 'function') { reject(new Error('副模型還沒接好，沒辦法整理訂單。')); return; }
            let done = false;
            const finish = function (fn, v) { if (!done) { done = true; clearTimeout(timer); fn(v); } };
            const timer = setTimeout(function () { finish(reject, new Error('整理訂單等太久了，再按一次配送就好。')); }, 60000);
            try {
                api.chatSecondary(orderMessages(order), null,
                    function (text) {
                        try { finish(resolve, parseLayout(text)); }
                        catch (e) { finish(reject, e); }
                    },
                    function (err) { finish(reject, err instanceof Error ? err : new Error(String(err || '訂單整理失敗'))); },
                    { task: 'estate', label: '房間包裹訂單' });
            } catch (e) { finish(reject, e); }
        });
    }

    // ── 空房母圖：SVG → PNG(母圖) + 內部多邊形 → 白遮罩 ──
    async function buildBase(spec) {
        const S = _svg();
        if (!S || typeof S.makeRoom !== 'function') throw new Error('房間產生器還沒載入。');
        const room = S.makeRoom(spec);
        const vw = room.viewBox[0], vh = room.viewBox[1];
        let bw, bh;
        if (vw >= vh) { bw = LONG_SIDE; bh = Math.max(64, Math.round(LONG_SIDE * vh / vw / 8) * 8); }
        else { bh = LONG_SIDE; bw = Math.max(64, Math.round(LONG_SIDE * vw / vh / 8) * 8); }
        const baseData = await S.rasterizeSvg(room.svg, bw, bh);
        const maskData = S.polyMaskDataUrl(room.interior, room.viewBox, bw, bh);
        return { room: room, baseData: baseData, maskData: maskData, width: bw, height: bh };
    }

    // ── 整房 inpaint 工作流：母圖＋遮罩塞進畫風預設包，重繪幅度與保護像素寫死 ──
    function buildInpaintPreset(manager, preset, layout, baseData, maskData, size, floorWord) {
        if (!manager || typeof manager._buildComfyWorkflow !== 'function') throw new Error('目前版本的生圖介面接不上房間。');
        const live = (manager.config && manager.config.comfyuiDirect) || {};
        const cfg = Object.assign({}, live, preset, { modelType: 'anima' });
        const posText = [cfg.basePrompt, ROOM_POSITIVE, floorWord, layout].filter(Boolean).join(', ');
        const negText = [cfg.negPrompt, ROOM_NEGATIVE].filter(Boolean).join(', ');
        const workflow = manager._buildComfyWorkflow(posText, negText, 'char', {
            width: size.width, height: size.height, seed: Math.floor(Math.random() * 1e15),
        }, cfg);
        const sampler = workflow && workflow['3'];
        const vaeRef = (workflow && workflow['10']) ? ['10', 0] : (workflow && workflow['8'] && workflow['8'].inputs && workflow['8'].inputs.vae);
        if (!sampler || sampler.class_type !== 'KSampler' || !vaeRef) throw new Error('這個畫風的設定接不上房間，換一個畫風試試。');

        workflow['900'] = { class_type: 'ETN_LoadImageBase64', inputs: { image: _strip(baseData) } };
        workflow['901'] = { class_type: 'ETN_LoadImageBase64', inputs: { image: _strip(maskData) } };
        workflow['902'] = { class_type: 'ImageScale', inputs: { image: ['900', 0], upscale_method: 'lanczos', width: size.width, height: size.height, crop: 'disabled' } };
        workflow['903'] = { class_type: 'ImageScale', inputs: { image: ['901', 0], upscale_method: 'nearest-exact', width: size.width, height: size.height, crop: 'disabled' } };
        workflow['904'] = { class_type: 'ImageToMask', inputs: { image: ['903', 0], channel: 'red' } };
        workflow['906'] = { class_type: 'GrowMask', inputs: { mask: ['904', 0], expand: -PROTECT, tapered_corners: true } };
        workflow['907'] = { class_type: 'FeatherMask', inputs: { mask: ['906', 0], left: 4, top: 4, right: 4, bottom: 4 } };
        workflow['905'] = { class_type: 'VAEEncodeForInpaint', inputs: { pixels: ['902', 0], vae: vaeRef, mask: ['906', 0], grow_mask_by: 0 } };
        sampler.inputs.latent_image = ['905', 0];
        sampler.inputs.steps = 12;
        sampler.inputs.cfg = 1.0;
        sampler.inputs.sampler_name = 'er_sde';
        sampler.inputs.scheduler = 'simple';
        sampler.inputs.denoise = _clamp(DENOISE, 0.45, 1.00);
        workflow['908'] = { class_type: 'ImageCompositeMasked', inputs: { destination: ['902', 0], source: ['8', 0], x: 0, y: 0, resize_source: false, mask: ['907', 0] } };
        if (workflow['9'] && workflow['9'].inputs) {
            workflow['9'].inputs.images = ['908', 0];
            workflow['9'].inputs.filename_prefix = 'Aurelia_room';
        }
        return Object.assign({}, preset, {
            modelType: 'anima', model: cfg.model, width: size.width, height: size.height,
            workflowMode: 'custom', customWorkflow: JSON.stringify(workflow), basePrompt: '', negPrompt: '',
        });
    }

    // ── 對外主流程：訂單 → 整房一次生圖 ──
    // order：[{name, content, x, y}]，x/y 是 0~100 的房間座標
    // onStep：進度回呼(給畫面顯示現在做到哪，純文案)
    // opts.layout：上次翻好的那份英文清單。給了就不再燒副模型重翻——「重新生成」走這條，
    //   同一份提示詞只換種子，調參數時才是單一變因。
    // ====================================================================
    // 🖼 另一條路：用自訂接口（GPT 那種）畫整間房，順便描出家具擋在哪（2026-09-22，她在測試頁跑過定案）
    //   ① 送「高牆空房」當參考圖，第一通照訂單畫整間房。
    //      矮牆空房是為了 ComfyUI；矮牆的左右牆在畫面上只剩一條往內斜的邊，GPT 會讀成牆頂、把房間畫歪。
    //   ② 把畫好的房間送回去，第二通只描家具：家具壓在地上的範圍黑、其他全白。
    //      牆、地板、門口不靠它——程式自己知道空房的地板在哪，而且是準的（她：「程式的 svg 保留地板白色，
    //      配上家具遮罩，等於一個完美的遮罩」）。
    //   ③ 官方接口會自己把房間挪一點、拉寬壓扁；照「房間外形」量出它挪了多少，把畫好的房間裁回空房的框。
    //      之後擺放位置、小人大小、門口都照舊用空房那一套，一個座標都不用換。
    //   🚨 描家具那張整片白一定碰到圖邊，別拿「白色碰邊就清掉」那套保險去洗它（測試頁踩過：會整張清光）。
    // ====================================================================
    const K_ROUTE = 'aurelia_room_route';
    function getRoute() {
        let r = {};
        try { r = JSON.parse(win.localStorage.getItem(K_ROUTE) || '{}') || {}; } catch (e) {}
        // mode：comfy＝原本那套；capi1＝自訂接口只畫房間（家具不擋路，省一半）；capi＝自訂接口畫房間＋量家具
        const mode = (r.mode === 'capi' || r.mode === 'capi1') ? r.mode : 'comfy';
        return { mode: mode, roomNode: String(r.roomNode || ''), maskNode: String(r.maskNode || '') };
    }
    function setRoute(patch) {
        const r = Object.assign(getRoute(), patch || {});
        try { win.localStorage.setItem(K_ROUTE, JSON.stringify(r)); } catch (e) {}
        return r;
    }
    // 自訂接口的選項：'' ＝圖片設置裡現在填的那組；其他是存起來的節點
    function listCapiNodes() {
        const out = [];
        try {
            const cur = (_mgr() && _mgr().config && _mgr().config.customApi) || {};
            out.push({ id: '', name: '圖片設置裡現在那組', url: cur.url, apiKey: cur.apiKey, model: cur.model });
        } catch (e) {}
        try {
            const arr = JSON.parse(win.localStorage.getItem('os_img_capi_nodes') || '[]');
            (Array.isArray(arr) ? arr : []).forEach(function (n) { if (n && n.id && n.url) out.push({ id: n.id, name: n.name || n.model || n.url, url: n.url, apiKey: n.apiKey, model: n.model }); });
        } catch (e) {}
        return out;
    }
    function _capiNode(id) {
        const list = listCapiNodes();
        return list.find(function (n) { return n.id === String(id || ''); }) || list[0] || null;
    }
    function _cv(w, h) { const c = win.document.createElement('canvas'); c.width = w; c.height = h; return c; }
    function _scaleCv(src, w, h) { const c = _cv(w, h); const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(src, 0, 0, w, h); return c; }
    function _dataUrlToBlob(u) {
        const m = String(u).match(/^data:([^;]+);base64,(.*)$/);
        const bin = atob(m[2]); const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: m[1] });
    }
    async function _capiEdit(node, prompt, refDataUrls, size) {
        if (!node || !node.url) throw new Error('房間用的自訂接口還沒填網址，先到設置的圖片頁填好。');
        try { win.OS_USAGE && win.OS_USAGE.note({ source: 'custom_api', type: 'room' }); } catch (e) {}
        const b = String(node.url).trim().replace(/\/+$/, '');
        const url = /\/images\/edits$/.test(b) ? b : (/\/images\/generations$/.test(b) ? b.replace(/\/images\/generations$/, '/images/edits') : b + '/images/edits');
        const fd = new FormData();
        if (node.model) fd.append('model', node.model);
        fd.append('prompt', prompt);
        fd.append('n', '1');
        fd.append('size', size);
        if (/^gpt-image/i.test(String(node.model || ''))) {
            const q = String(((_mgr() && _mgr().config && _mgr().config.customApi) || {}).quality || 'medium').toLowerCase();
            fd.append('quality', (q === 'low' || q === 'high') ? q : 'medium');
        }
        [].concat(refDataUrls).forEach(function (u, i) { fd.append('image[]', _dataUrlToBlob(u), 'ref' + (i + 1) + '.png'); });
        const headers = {};
        if (node.apiKey) headers.Authorization = 'Bearer ' + String(node.apiKey).trim();
        const resp = await fetch(url, { method: 'POST', headers: headers, body: fd });
        const text = await resp.text();
        if (!resp.ok) {
            if (resp.status === 404 || resp.status === 405) throw new Error('這個接口不收帶圖的請求，房間要換一個接口畫。');
            if (/insufficient_quota|billing_hard_limit|exceeded your current quota/i.test(text)) throw new Error('生圖的額度用完了。');
            if (/safety system|content[_ ]policy|moderation_blocked/i.test(text)) throw new Error('這次被接口的內容審查擋掉了，改一下包裹再配送。');
            throw new Error('房間沒畫成（' + resp.status + '），再按一次配送就好。');
        }
        let data; try { data = JSON.parse(text); } catch (e) { throw new Error('接口回來的不是圖，網址可能填錯了。'); }
        const first = data && Array.isArray(data.data) ? data.data[0] : null;
        if (first && first.b64_json) return 'data:image/png;base64,' + first.b64_json;
        if (first && first.url) {
            const r = await fetch(first.url); const blob = await r.blob();
            return await new Promise(function (res, rej) { const fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(blob); });
        }
        throw new Error('接口沒有回圖，再按一次配送就好。');
    }

    // 黑底上那一整塊房間的外形框（含牆、含門口）：從四邊灌水把黑底挖掉，剩下的就是房間
    function _roomBox(cv) {
        const MW = 256, MH = Math.max(8, Math.round(MW * cv.height / cv.width));
        const px = _scaleCv(cv, MW, MH).getContext('2d').getImageData(0, 0, MW, MH).data;
        const N = MW * MH, dark = new Uint8Array(N), out = new Uint8Array(N);
        for (let i = 0; i < N; i++) dark[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) < 40 ? 1 : 0;
        const q = []; const push = function (p) { if (dark[p] && !out[p]) { out[p] = 1; q.push(p); } };
        for (let x = 0; x < MW; x++) { push(x); push(N - MW + x); }
        for (let y = 0; y < MH; y++) { push(y * MW); push(y * MW + MW - 1); }
        while (q.length) { const p = q.pop(), x = p % MW, y = (p / MW) | 0; if (x > 0) push(p - 1); if (x < MW - 1) push(p + 1); if (y > 0) push(p - MW); if (y < MH - 1) push(p + MW); }
        let x0 = MW, y0 = MH, x1 = -1, y1 = -1, n = 0;
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (!out[y * MW + x]) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (n < N * 0.03 || x1 < 0) return null;
        const kx = cv.width / MW, ky = cv.height / MH;
        return { x0: x0 * kx, y0: y0 * ky, x1: (x1 + 1) * kx, y1: (y1 + 1) * ky };
    }
    // 塗了洋紅的那張房間 → 對回第一通畫的房間 → 挑出洋紅＝家具（白底、家具黑）
    //   兩張幾乎是同一張圖，兩邊都只留最明顯的一成五的邊來比（家具輪廓、牆腳、窗框），不比強弱。
    function _paintedEdgeHit(roomCv, paintCv, S) {
        const gw = 160, gh = Math.max(8, Math.round(160 * roomCv.height / roomCv.width));
        const bin = function (cv) {
            const p = _scaleCv(cv, gw, gh).getContext('2d').getImageData(0, 0, gw, gh).data, g = new Float32Array(gw * gh), e = new Float32Array(gw * gh);
            for (let i = 0; i < gw * gh; i++) g[i] = (0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2]) / 255;
            for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) { const i = y * gw + x; e[i] = Math.abs(g[i + 1] - g[i - 1]) + Math.abs(g[i + gw] - g[i - gw]); }
            const cut = Array.from(e).sort(function (a, b) { return a - b; })[Math.floor(e.length * 0.85)] || 0.1;
            const b = new Uint8Array(e.length); for (let i = 0; i < e.length; i++) b[i] = e[i] > cut ? 1 : 0;
            return b;
        };
        const rb = bin(roomCv), pb = bin(paintCv);
        const rg = new Uint8Array(rb.length);
        for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) { const i = y * gw + x; rg[i] = (rb[i] | rb[i - 1] | rb[i + 1] | rb[i - gw] | rb[i + gw]) ? 1 : 0; }
        const score = function (dx, dy) {
            let hit = 0, n = 0;
            for (let y = S; y < gh - S; y++) for (let x = S; x < gw - S; x++) { if (!pb[y * gw + x]) continue; n++; if (rg[(y - dy) * gw + (x - dx)]) hit++; }
            return n ? hit / n : 0;
        };
        let best = { dx: 0, dy: 0, s: score(0, 0) };
        for (let dy = -S; dy <= S; dy++) for (let dx = -S; dx <= S; dx++) { const s = score(dx, dy); if (s > best.s) best = { dx: dx, dy: dy, s: s }; }
        const k = roomCv.width / gw;
        return { dx: Math.round(best.dx * k), dy: Math.round(best.dy * k), hit: best.s };
    }
    function _moveCv(cv, scale, dx, dy) {
        const c = _cv(cv.width, cv.height); const g = c.getContext('2d');
        g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
        const w = cv.width * scale, h = cv.height * scale;
        g.imageSmoothingEnabled = true;
        g.drawImage(cv, (c.width - w) / 2 - dx, (c.height - h) / 2 - dy, w, h);
        return c;
    }
    function _furnitureFromPainted(roomCv, paintCv) {
        let best = null;
        for (let sc = 0.94; sc <= 1.0601; sc += 0.02) {
            const m = _paintedEdgeHit(roomCv, _moveCv(paintCv, sc, 0, 0), 12);
            if (!best || m.hit > best.m.hit) best = { sc: sc, m: m };
        }
        const moved = _moveCv(paintCv, best.sc, best.m.dx, best.m.dy);
        const w = moved.width, h = moved.height;
        const src = moved.getContext('2d').getImageData(0, 0, w, h).data;
        const out = _cv(w, h); const og = out.getContext('2d'); const od = og.createImageData(w, h);
        for (let i = 0; i < w * h; i++) {
            const r = src[i * 4], gg = src[i * 4 + 1], b = src[i * 4 + 2];
            // 洋紅：紅藍都高、綠低（它塗的洋紅會帶一點陰影，別卡死 #FF00FF）
            const mag = r > 140 && b > 120 && gg < 110 && (r - gg) > 90 && (b - gg) > 70;
            const v = mag ? 0 : 255;
            od.data[i * 4] = od.data[i * 4 + 1] = od.data[i * 4 + 2] = v; od.data[i * 4 + 3] = 255;
        }
        og.putImageData(od, 0, 0);
        return { cv: out, scale: best.sc, dx: best.m.dx, dy: best.m.dy, hit: best.m.hit };
    }

    function _gptRoomPrompt(layout, floorWord, style, withFigure) {
        return 'The ' + (withFigure ? 'first ' : '') + 'attached image is an empty room seen from above at a slightly tilted camera: the floor, the back wall, the two side walls, and a low front wall with a doorway in the middle. '
            + 'Draw that same room furnished. Keep the walls, the floor outline, the doorway, the camera angle and the proportions as in the ' + (withFigure ? 'first ' : '') + 'attached image, and keep the room at the same size and position with the same empty black margin around it. '
            + (withFigure
                ? 'The second attached image is the same empty room with one small character standing on the floor. That character is the person who will walk around this room, shown at exactly the size it will appear in it. '
                  + 'Use it only as a size reference: make every piece of furniture and every object as big as it would be next to that character in real life, so the character could lie on the bed, sit on the chairs and reach the tables. '
                  + 'Do not draw the character or any other person in the result. '
                : '')
            + 'Furniture and objects: ' + layout + '. Floor: ' + floorWord + '. '
            + 'Nothing hangs from the ceiling; everything stands on the floor or is mounted on a wall.'
            + (style ? '\n\n' + style : '');
    }
    // 🚨 09-22 她實跑兩間都偏：以前叫它另畫一張黑白圖（家具黑、其他白），交回來只剩幾塊黑，
    //   跟房間沒有共同的東西可對，對齊只能拿黑塊的邊去碰房間的邊，常撞到地板木紋停在錯的地方；
    //   而且叫它塗「壓在地上的範圍」，它自己猜腳在哪，比看得到的家具偏下或縮一截。
    //   改成：房間原封不動，只把家具整件塗成洋紅。牆、窗、地板都還在→整張拿來對齊；塗的是看得到的整件家具。
    function _gptFurniturePrompt() {
        return 'The attached image is a furnished room seen from above. Return this same picture unchanged — same room, same camera, same size, every wall, window and object in exactly the same place — with only one change: '
            + 'fill every piece of furniture and every object that stands on the floor with solid flat magenta (#FF00FF), covering its whole visible shape from its top down to where it meets the floor, together with anything sitting on it. '
            + 'Leave rugs, carpets and mats unpainted, and leave the floor, the walls, the windows and anything hanging on the walls as they are. '
            + 'The magenta is one flat colour: no shading, no outlines, no texture.';
    }

    // 舞台上她現在那隻小人（換過裝就是換過的樣子）：走路圖取「面向前方、站著」那一格
    async function _playerFigure() {
        const LS = win.LobbyStage;
        const p = LS && LS._S && LS._S.player;
        let src = null, sheet = false;
        if (p && p.el) {
            if (p.sheet) { const m = String(p.el.style.backgroundImage || '').match(/url\(["']?(.*?)["']?\)$/); if (m) { src = m[1]; sheet = true; } }
            else if (p.el.src) src = p.el.src;
        }
        if (!src) {
            const A = LS && LS._b && LS._b.ASSET;
            if (A) src = (win.localStorage.getItem('lobby_stage_mc') === 'm') ? A.mcM : A.mcF;
        }
        if (!src) return null;
        const im = await new Promise(function (res) {
            const i = new win.Image();
            if (/^https?:/i.test(src)) i.crossOrigin = 'anonymous';
            i.onload = function () { res(i); }; i.onerror = function () { res(null); };
            i.src = src;
        });
        if (!im || !im.naturalWidth) return null;
        const fw = sheet ? im.naturalWidth / 3 : im.naturalWidth, fh = sheet ? im.naturalHeight / 4 : im.naturalHeight;
        return { im: im, sx: sheet ? fw : 0, sy: 0, sw: fw, sh: fh };
    }
    // 空房（送出去那張）上站一隻小人：高度照舞台的規矩換算——一個真人高在這間房是 personH，小人畫 FIGURE_PX/PERSON_PX 那麼高
    async function _figureRef(pad, base, pr, ps) {
        try {
            const fig = await _playerFigure();
            if (!fig) return null;
            const room = base.room, vb = room.viewBox;
            const k = (base.width / vb[0]) * ps;   // viewBox 單位 → 送出去那張的像素
            const h = room.personH * k * (FIGURE_PX / PERSON_PX);
            if (!(h > 4)) return null;
            const w = h * fig.sw / fig.sh;
            const q = room.inner4 || room.floor || [];
            if (!q.length) return null;
            let cx = 0, cy = 0; q.forEach(function (pt) { cx += pt[0]; cy += pt[1]; });
            cx = pr.x + (cx / q.length) * k; cy = pr.y + (cy / q.length) * k;   // 腳踩在地板正中
            const c = _cv(pad.width, pad.height); const g = c.getContext('2d');
            g.drawImage(pad, 0, 0);
            g.imageSmoothingEnabled = false;   // 像素小人放大別糊掉
            g.drawImage(fig.im, fig.sx, fig.sy, fig.sw, fig.sh, cx - w / 2, cy - h, w, h);
            return c.toDataURL('image/png');
        } catch (e) { return null; }   // 讀不到小人（跨網域被擋等）就照舊只送空房
    }

    async function _deliverCapi(spec, order, onStep, opts, layout) {
        const route = getRoute();
        const roomNode = _capiNode(route.roomNode), maskNode = _capiNode(route.maskNode);
        const S = _svg();
        if (!S || typeof S.makeRoom !== 'function') throw new Error('房間產生器還沒載入。');
        // 高牆空房（幾何跟矮牆版不同，存下來的地板/尺度也是這一份）
        const tallSpec = Object.assign({}, spec, { tallWalls: true });
        if (onStep) onStep('正在準備空房…');
        const base = await buildBase(tallSpec);
        const bw = base.width, bh = base.height, vb = base.room.viewBox;
        const r = bw / bh;
        const size = r > 1.2 ? '1536x1024' : (r < 0.83 ? '1024x1536' : '1024x1024');
        const OW = parseInt(size, 10), OH = parseInt(size.split('x')[1], 10);
        // 參考圖塞進跟輸出一樣的比例（補黑邊）：比例不同時它會自己把房間拉長壓扁，地板就對不回去
        const baseIm = await _loadImg(base.baseData);
        const pad = _cv(OW, OH);
        const pg = pad.getContext('2d'); pg.fillStyle = '#000'; pg.fillRect(0, 0, OW, OH);
        const ps = Math.min(OW / bw, OH / bh);
        const pr = { x: (OW - bw * ps) / 2, y: (OH - bh * ps) / 2, w: bw * ps, h: bh * ps };
        pg.drawImage(baseIm, pr.x, pr.y, pr.w, pr.h);

        if (onStep) onStep('正在把東西一件件擺進房間…');
        const style = String(((_mgr() && _mgr().config && _mgr().config.customApi) || {}).basePrompt || '').trim();
        // 🧍 比例尺：同一張空房，站一隻她現在的小人，大小＝進房間後實際畫的大小。
        //   只給空房的話 GPT 只能照牆高猜家具多大，常常畫太大（床比小人長三倍）；看得到小人它才知道家具該多大。
        //   另外一張送，不直接畫在空房上：畫在上面它會把小人一起畫進房間。
        const figRef = await _figureRef(pad, base, pr, ps);
        const refs = figRef ? [pad.toDataURL('image/png'), figRef] : pad.toDataURL('image/png');
        const roomData = await _capiEdit(roomNode, _gptRoomPrompt(layout, FLOOR_WORDS[spec && spec.floor] || FLOOR_WORDS.oak, style, !!figRef), refs, size);
        // 只畫一次（capi1）：不量家具，家具不擋路，跟 ComfyUI 畫的房間一樣——想省錢的人用
        const twoPass = route.mode === 'capi';
        let maskData = null;
        if (twoPass) {
            if (onStep) onStep('正在量家具擋在哪裡…');
            maskData = await _capiEdit(maskNode, _gptFurniturePrompt(), roomData, size);
        }

        const roomIm = await _loadImg(roomData);
        const roomCv = _scaleCv(roomIm, roomIm.width, roomIm.height);
        const painted = maskData ? _furnitureFromPainted(roomCv, _scaleCv(await _loadImg(maskData), roomCv.width, roomCv.height)) : null;
        const furn = painted ? painted.cv : null;
        // 最近一次的原圖留在記憶體裡（不存檔）：下次又偏，DEBUG 執行框拿得到它塗的那張來看
        try { win.OS_ROOM_GEN._last = { room: roomData, painted: maskData, align: painted ? { scale: painted.scale, dx: painted.dx, dy: painted.dy, hit: painted.hit } : null }; } catch (e) {}
        // 它畫的房間跟送出去的空房差多少：外形框對外形框，寬高各自換算
        const bA = _roomBox(pad), bB0 = _roomBox(roomCv);
        const kx = roomCv.width / OW, ky = roomCv.height / OH;
        const bB = bB0 || { x0: bA.x0 * kx, y0: bA.y0 * ky, x1: bA.x1 * kx, y1: bA.y1 * ky };
        const sx = (bB.x1 - bB.x0) / (bA.x1 - bA.x0), sy = (bB.y1 - bB.y0) / (bA.y1 - bA.y0);
        // 空房的框（送出去時在 pr 那一塊）落在它畫的圖上哪裡 → 裁下來、縮回空房原本的大小
        const cx0 = bB.x0 + (pr.x - bA.x0) * sx, cy0 = bB.y0 + (pr.y - bA.y0) * sy;
        const cw = pr.w * sx, ch = pr.h * sy;
        const cropTo = function (src) {
            const c = _cv(bw, bh); const g = c.getContext('2d');
            g.fillStyle = '#000'; g.fillRect(0, 0, bw, bh);
            g.imageSmoothingEnabled = true;
            g.drawImage(src, cx0, cy0, cw, ch, 0, 0, bw, bh);
            return c;
        };
        const roomOut = cropTo(roomCv);
        const furnOut = furn ? cropTo(furn) : null;
        // 家具圖二值化：黑＝家具、白＝沒擋（裁出去的邊被補成黑也沒關係，那裡本來就在地板外）
        if (furnOut) {
            const g = furnOut.getContext('2d'); const d = g.getImageData(0, 0, bw, bh);
            for (let i = 0; i < d.data.length; i += 4) {
                const v = (0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]) >= 128 ? 255 : 0;
                d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
            }
            g.putImageData(d, 0, 0);
        }
        void vb;
        const nm = function (n) { return (n && n.name) || '自訂接口'; };
        return {
            image: roomOut.toDataURL('image/png'),
            furnMask: furnOut ? furnOut.toDataURL('image/png') : null,
            layout: layout,
            floor: base.room.floor,
            inner4: base.room.inner4,
            viewBox: base.room.viewBox,
            personH: base.room.personH,
            styleName: nm(roomNode) + (twoPass && maskNode && maskNode !== roomNode ? '／' + nm(maskNode) : ''),
            at: Date.now(),
        };
    }

    async function deliver(spec, order, onStep, opts) {
        if (!Array.isArray(order) || !order.length) throw new Error('房間裡還沒有東西，先丟幾個包裹進去。');
        // 設置裡房間選了自訂接口 → 走上面那條（訂單翻譯照舊共用）
        if (getRoute().mode !== 'comfy') {
            const reuse0 = String((opts && opts.layout) || '').trim();
            let layout0;
            if (reuse0) { if (onStep) onStep('照上次那份清單重畫…'); layout0 = reuse0; }
            else { if (onStep) onStep('正在核對這批包裹…'); layout0 = await translateOrder(order); }
            return _deliverCapi(spec, order, onStep, opts, layout0);
        }
        const manager = _mgr();
        if (!manager || typeof manager.previewComfyPreset !== 'function') throw new Error('找不到生圖介面。');
        const preset = pickStylePreset();
        if (!preset) throw new Error('還沒挑房間的畫風，先到設置的圖片頁挑一個。');

        const reuse = String((opts && opts.layout) || '').trim();
        let layout;
        if (reuse) {
            if (onStep) onStep('照上次那份清單重畫…');
            layout = reuse;
        } else {
            if (onStep) onStep('正在核對這批包裹…');
            layout = await translateOrder(order);
        }

        if (onStep) onStep('正在準備空房…');
        const base = await buildBase(spec);

        if (onStep) onStep('正在把東西一件件擺進房間…');
        const runPreset = buildInpaintPreset(manager, preset, layout, base.baseData, base.maskData,
            { width: base.width, height: base.height }, FLOOR_WORDS[spec && spec.floor] || FLOOR_WORDS.oak);
        const image = await manager.previewComfyPreset(runPreset, '', { packSize: true });
        if (!image) throw new Error('這次沒生出房間圖，再按一次配送就好。');

        return {
            image: image,
            layout: layout,
            floor: base.room.floor,
            inner4: base.room.inner4,     // 房內四角(不含玄關)：貼牆放東西的都靠這個
            viewBox: base.room.viewBox,
            personH: base.room.personH,   // 🚨 尺度參考,少了它下次進來會退回「拉滿舞台」
            styleName: preset.name || '',
            at: Date.now(),
        };
    }

    // ── 房間 → 舞台圖層 ──
    //   🚨 走 RPG 的規矩：**小人固定大小，地圖照真實尺寸畫**。
    //   所以不是把每間房都拉滿舞台（那會讓 2.2m 的蝸居跟 7.8m 的豪門在螢幕上一樣大，
    //   比例尺永遠對不上），而是**讓「一個人的高度」在每間房裡都等於同一個像素值**，
    //   房間圖跟著那個比例縮放置中——小房間就佔比較小、周圍留黑（那本來就是牆外）。
    //   兩個旋鈕，都是常數、跟房型無關（所以小人在每一間房都一樣大）：
    //   PERSON_PX＝房間畫多大（等於「一個真人高」佔幾像素）。往上加＝所有房間一起放大；
    //     上限由最大的房型（豪門 7.8m 寬）決定，再大就撐出舞台。
    //   FIGURE_PX＝小人實際畫多高。這才是「小人看起來大不大」的旋鈕。
    //     兩者相等＝完全照真實比例；FIGURE_PX 調小＝小人相對房間變小（RPG 常見的處理）。
    //     🚨 135 是 Rae 2026-07-26 在房間裡逐個試出來的定案（200 寫實太大、150 還是偏大）。
    //     ＝真人尺度的 0.68；chibi 比例的角色頭佔份量大，畫到寫實高度會顯得笨重。
    const PERSON_PX = 200;
    let FIGURE_PX = 135;
    function _fit(viewBox, W, H, personH) {
        let s = (personH > 0) ? (PERSON_PX / personH) : Math.min(W / viewBox[0], H / viewBox[1]);
        s = Math.min(s, W / viewBox[0], H / viewBox[1]);   // 保險：房間再大也不准撐出舞台
        return { s: s, ox: (W - viewBox[0] * s) / 2, oy: (H - viewBox[1] * s) / 2 };
    }
    function _loadImg(src) {
        return new Promise(function (resolve, reject) {
            const im = new win.Image();
            im.onload = function () { resolve(im); };
            im.onerror = function () { reject(new Error('房間圖讀不進來')); };
            im.src = src;
        });
    }
    // 🖼 房間形狀遮罩(map 底板遮罩同款亮度閾值,改「從畫布邊緣灌水」版):
    //    ① 亮度 >= 閾值 = 亮格;② 從四邊只沿「暗格」灌水,走得到的=房外黑底;
    //    ③ 其餘全算房內——被房間包住的深色家具/門洞不是洞,大白區整片填滿;
    //    ④ 只留最大連通塊(8連通,門前台階隔線暗縫也算同塊),黑底上的雜訊亮點浮不起來。
    //    占比不合理(退化)回 null=照舊整張顯示。閾值 console 可調 aurelia_room_mask_threshold(不進 UI)。
    //    🚨 wall＝地板多邊形(舞台座標)：先把地板整塊當亮格擋住。前牆中間是門口沒有牆，
    //       深色地板會被從門口一路灌進去，整片地板連深色地毯、盆栽、椅子一起被挖成黑的（09-22 她實跑踩到）。
    function _roomShapeMask(srcCv, W, H, wall) {
        try {
            const MW = 384, MH = Math.max(2, Math.round(MW * H / W));
            const doc = win.document;
            const sc = doc.createElement('canvas'); sc.width = MW; sc.height = MH;
            const sx = sc.getContext('2d', { willReadFrequently: true });
            sx.imageSmoothingEnabled = false;
            sx.drawImage(srcCv, 0, 0, MW, MH);
            const d = sx.getImageData(0, 0, MW, MH).data;
            let TH = 70;
            try { const t = parseInt(localStorage.getItem('aurelia_room_mask_threshold'), 10); if (t >= 0 && t <= 255) TH = t; } catch (e) {}
            const N = MW * MH;
            const bright = new Uint8Array(N);
            for (let i = 0; i < N; i++) {
                if (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114 >= TH) bright[i] = 1;
            }
            if (Array.isArray(wall) && wall.length >= 3) {
                const fc = doc.createElement('canvas'); fc.width = MW; fc.height = MH;
                const fx = fc.getContext('2d', { willReadFrequently: true });
                fx.fillStyle = '#fff'; fx.beginPath();
                wall.forEach(function (p, i) { const x = p[0] * MW / W, y = p[1] * MH / H; if (i) fx.lineTo(x, y); else fx.moveTo(x, y); });
                fx.closePath(); fx.fill();
                const fd = fx.getImageData(0, 0, MW, MH).data;
                for (let i = 0; i < N; i++) if (fd[i * 4 + 3] > 0) bright[i] = 1;
            }
            const outside = new Uint8Array(N);
            const q = [];
            const push = function (p) { if (!outside[p] && !bright[p]) { outside[p] = 1; q.push(p); } };
            for (let x = 0; x < MW; x++) { push(x); push(N - MW + x); }
            for (let y = 0; y < MH; y++) { push(y * MW); push(y * MW + MW - 1); }
            while (q.length) {
                const p = q.pop(); const x = p % MW, y = (p / MW) | 0;
                if (x > 0) push(p - 1);
                if (x < MW - 1) push(p + 1);
                if (y > 0) push(p - MW);
                if (y < MH - 1) push(p + MW);
            }
            const comp = new Int32Array(N);
            let compCount = 0, bestId = 0, bestSize = 0;
            for (let p0 = 0; p0 < N; p0++) {
                if (outside[p0] || comp[p0]) continue;
                const id = ++compCount; let size = 0;
                comp[p0] = id; q.length = 0; q.push(p0);
                while (q.length) {
                    const p = q.pop(); size++;
                    const x = p % MW, y = (p / MW) | 0;
                    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                        if (!dx && !dy) continue;
                        const nx = x + dx, ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
                        const np = ny * MW + nx;
                        if (!outside[np] && !comp[np]) { comp[np] = id; q.push(np); }
                    }
                }
                if (size > bestSize) { bestSize = size; bestId = id; }
            }
            // 下限別設高:personH 定尺度後房形常只佔舞台畫布 8% 上下(小房間更小)
            if (!(bestSize / N > 0.03 && bestSize / N < 0.98)) return null;
            const im = sx.createImageData(MW, MH);
            for (let i = 0; i < N; i++) {
                if (comp[i] === bestId) {
                    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = 255;
                    im.data[i * 4 + 3] = 255;
                }
            }
            const mc = doc.createElement('canvas'); mc.width = MW; mc.height = MH;
            mc.getContext('2d').putImageData(im, 0, 0);
            return mc;
        } catch (e) { return null; }
    }

    // room：{ image, floor, viewBox }。回 { base, mask, floorStage }，floorStage=換算成舞台座標的地板多邊形
    async function stageLayers(room, W, H) {
        if (!room || !room.image) throw new Error('這間房還沒有圖。');
        const vb = (room.viewBox && room.viewBox.length === 2) ? room.viewBox : [W, H];
        const f = _fit(vb, W, H, room.personH);
        const doc = win.document;

        const cv = doc.createElement('canvas'); cv.width = W; cv.height = H;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#0b0d12'; cx.fillRect(0, 0, W, H);
        cx.drawImage(await _loadImg(room.image), f.ox, f.oy, vb[0] * f.s, vb[1] * f.s);
        // 🖼 剪掉成品圖四周的黑底,只留房間形狀貼在舞台上;算不出可信遮罩=照舊整張顯示
        const shape = _roomShapeMask(cv, W, H, (room.floor || []).map(function (p) { return [p[0] * f.s + f.ox, p[1] * f.s + f.oy]; }));
        if (shape) {
            cx.globalCompositeOperation = 'destination-in';
            cx.imageSmoothingEnabled = true;
            cx.drawImage(shape, 0, 0, W, H);
            cx.globalCompositeOperation = 'source-over';
        }

        const toStage = function (p) { return [p[0] * f.s + f.ox, p[1] * f.s + f.oy]; };
        const floorStage = (room.floor || []).map(toStage);
        // 房內地板四角（不含玄關）：要貼牆放東西的一律用這個，別去猜 floorStage 的索引
        const innerStage = (room.inner4 || room.floor || []).map(toStage);
        const mv = doc.createElement('canvas'); mv.width = W; mv.height = H;
        const mx = mv.getContext('2d');
        mx.fillStyle = '#000'; mx.fillRect(0, 0, W, H);
        if (floorStage.length >= 3) {
            mx.fillStyle = '#fff'; mx.beginPath();
            floorStage.forEach(function (p, i) { if (i) mx.lineTo(p[0], p[1]); else mx.moveTo(p[0], p[1]); });
            mx.closePath(); mx.fill();
        }
        // 🛋 自訂接口畫的房間多一張家具圖（黑＝家具）：乘上去，家具壓著的地方就走不過去
        let spawn = null;
        if (room.furnMask && floorStage.length >= 3) {
            try {
                mx.globalCompositeOperation = 'multiply';
                mx.drawImage(await _loadImg(room.furnMask), f.ox, f.oy, vb[0] * f.s, vb[1] * f.s);
                mx.globalCompositeOperation = 'source-over';
                // 落點：地板正中那一格被家具壓住（床常常就在正中）→ 找最近一塊能走的地方，不然一進門就卡在床裡
                const SW = 192, SH = Math.max(2, Math.round(SW * H / W));
                const sc = _scaleCv(mv, SW, SH).getContext('2d').getImageData(0, 0, SW, SH).data;
                let cx = 0, cy = 0; floorStage.forEach(function (p) { cx += p[0]; cy += p[1]; });
                cx = cx / floorStage.length * SW / W; cy = cy / floorStage.length * SH / H;
                let best = null;
                for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
                    let ok = true;   // 連周圍一圈都能走才算，免得落在家具邊上
                    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) if (sc[((y + dy) * SW + x + dx) * 4] < 200) ok = false;
                    if (!ok) continue;
                    const dd = (x - cx) * (x - cx) + (y - cy) * (y - cy);
                    if (!best || dd < best.d) best = { d: dd, x: x, y: y };
                }
                if (best) spawn = { x: Math.round((best.x + 0.5) * W / SW), y: Math.round((best.y + 0.5) * H / SH) };
            } catch (e) { mx.globalCompositeOperation = 'source-over'; }
        }
        return {
            base: cv.toDataURL('image/png'), mask: mv.toDataURL('image/png'),
            floorStage: floorStage, innerStage: innerStage, fit: f, viewBox: vb,
            spawn: spawn,   // 有家具遮罩時才有：不在家具上的落點
            // 🧍 一個真人在這間房裡、站在舞台座標系下該有多高（房間幾何算出來的；等於 PERSON_PX）
            personPx: (room.personH || 0) * f.s,
            // 🧍 小人實際畫多高：固定值，走到哪一間房都一樣大（RPG 規矩）
            figurePx: FIGURE_PX,
        };
    }

    // ── 房形摳圖(縮圖/卡片用)──
    //   同一套房形遮罩直接算在原圖上:剪掉房外黑底、再裁到房形的邊界框,
    //   拿到的是「只有房間本體」的透明底小圖,貼在什麼底色上都乾淨。
    //   算不出可信遮罩回 null=呼叫端照舊用原圖,絕不變更糟。
    async function cutout(imageSrc) {
        try {
            const img = await _loadImg(imageSrc);
            const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
            if (!W || !H) return null;
            const doc = win.document;
            const cv = doc.createElement('canvas'); cv.width = W; cv.height = H;
            const cx = cv.getContext('2d');
            // 先鋪黑:空房母圖是透明底,透明在亮度上=黑,跟成品圖的「房外」走同一條判定
            cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H);
            cx.drawImage(img, 0, 0, W, H);
            const shape = _roomShapeMask(cv, W, H);
            if (!shape) return null;
            const md = shape.getContext('2d').getImageData(0, 0, shape.width, shape.height).data;
            let x0 = shape.width, y0 = shape.height, x1 = -1, y1 = -1;
            for (let y = 0; y < shape.height; y++) {
                for (let x = 0; x < shape.width; x++) {
                    if (!md[(y * shape.width + x) * 4 + 3]) continue;
                    if (x < x0) x0 = x; if (x > x1) x1 = x;
                    if (y < y0) y0 = y; if (y > y1) y1 = y;
                }
            }
            if (x1 < 0) return null;
            cx.globalCompositeOperation = 'destination-in';
            cx.imageSmoothingEnabled = true;
            cx.drawImage(shape, 0, 0, W, H);
            cx.globalCompositeOperation = 'source-over';
            // 邊界框換回原圖座標,四周留 2 格呼吸(遮罩是縮小算的,邊緣有半格誤差)
            const sx = W / shape.width, sy = H / shape.height, pad = 2;
            const rx = Math.max(0, Math.round((x0 - pad) * sx));
            const ry = Math.max(0, Math.round((y0 - pad) * sy));
            const rw = Math.min(W - rx, Math.round((x1 - x0 + 1 + pad * 2) * sx));
            const rh = Math.min(H - ry, Math.round((y1 - y0 + 1 + pad * 2) * sy));
            if (rw < 8 || rh < 8) return null;
            const out = doc.createElement('canvas'); out.width = rw; out.height = rh;
            out.getContext('2d').drawImage(cv, rx, ry, rw, rh, 0, 0, rw, rh);
            return out.toDataURL('image/png');
        } catch (e) { return null; }
    }

    win.OS_ROOM_GEN = {
        deliver, buildBase, stageLayers, cutout, positionWord, orderMessages, parseLayout, sanitizeCeiling, clusterOrder,
        listStylePresets, getStyleName, setStyleName, pickStylePreset,
        getRoute, setRoute, listCapiNodes,   // 房間用哪個接口畫（設置的圖片頁）
        // console 調小人大小用：改完重進房間就看得到（決定好再寫回上面那個常數）
        _setFigure: function (px) { const v = parseFloat(px); if (isFinite(v) && v > 20) FIGURE_PX = v; return FIGURE_PX; },
        _cfg: { DENOISE, PROTECT, LONG_SIDE },
    };
    if (win !== window) { try { window.OS_ROOM_GEN = win.OS_ROOM_GEN; } catch (e) {} }
    console.log('[RoomGen] 整房生圖引擎已載入');
})();
