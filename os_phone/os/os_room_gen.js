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

    // 🚨 生圖參數寫死不外露，面板一律不給調。
    //   重繪幅度：0.90 → 0.85（Rae 2026-07-25 調低試看看；低一點＝更貼母圖的房型與透視，家具也比較不會亂長）
    const DENOISE = 0.85;
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
            '輸出骨架只能理解為：<位置> <該件東西的英文名稱與必要細節>，各件之間用英文逗號分隔。',
            '角括號是結構佔位說明，正式輸出時要換成實際英文內容，不可保留角括號或方括號。',
            '不要解釋、不要 markdown、不要給替代版本。只輸出 <room-layout>...</room-layout>。',
        ].join('\n');
        const body = order.map(function (it) {
            const pos = positionWord(it.x, it.y);
            const name = String(it.name || '').trim();
            const note = String(it.content || '').trim();
            return pos + '：' + name + (note ? '（' + note + '）' : '');
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
                    { label: '房間包裹訂單' });
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
    function buildInpaintPreset(manager, preset, layout, baseData, maskData, size) {
        if (!manager || typeof manager._buildComfyWorkflow !== 'function') throw new Error('目前版本的生圖介面接不上房間。');
        const live = (manager.config && manager.config.comfyuiDirect) || {};
        const cfg = Object.assign({}, live, preset, { modelType: 'anima' });
        const posText = [cfg.basePrompt, ROOM_POSITIVE, layout].filter(Boolean).join(', ');
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
    async function deliver(spec, order, onStep) {
        if (!Array.isArray(order) || !order.length) throw new Error('房間裡還沒有東西，先丟幾個包裹進去。');
        const manager = _mgr();
        if (!manager || typeof manager.previewComfyPreset !== 'function') throw new Error('找不到生圖介面。');
        const preset = pickStylePreset();
        if (!preset) throw new Error('還沒挑房間的畫風，先到設置的圖片頁挑一個。');

        if (onStep) onStep('正在核對這批包裹…');
        const layout = await translateOrder(order);

        if (onStep) onStep('正在準備空房…');
        const base = await buildBase(spec);

        if (onStep) onStep('正在把東西一件件擺進房間…');
        const runPreset = buildInpaintPreset(manager, preset, layout, base.baseData, base.maskData, { width: base.width, height: base.height });
        const image = await manager.previewComfyPreset(runPreset, '', { packSize: true });
        if (!image) throw new Error('這次沒生出房間圖，再按一次配送就好。');

        return {
            image: image,
            layout: layout,
            floor: base.room.floor,
            viewBox: base.room.viewBox,
            styleName: preset.name || '',
            at: Date.now(),
        };
    }

    // ── 房間 → 舞台圖層 ──
    //   舞台的座標系是固定的 W×H，房間圖不是。等比置中鋪進去(留黑邊)，
    //   底圖與地板遮罩走「同一個縮放位移」，所以踩到的白區跟看到的地板完全對齊。
    function _fit(viewBox, W, H) {
        const s = Math.min(W / viewBox[0], H / viewBox[1]);
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
    // room：{ image, floor, viewBox }。回 { base, mask, floorStage }，floorStage=換算成舞台座標的地板多邊形
    async function stageLayers(room, W, H) {
        if (!room || !room.image) throw new Error('這間房還沒有圖。');
        const vb = (room.viewBox && room.viewBox.length === 2) ? room.viewBox : [W, H];
        const f = _fit(vb, W, H);
        const doc = win.document;

        const cv = doc.createElement('canvas'); cv.width = W; cv.height = H;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#0b0d12'; cx.fillRect(0, 0, W, H);
        cx.drawImage(await _loadImg(room.image), f.ox, f.oy, vb[0] * f.s, vb[1] * f.s);

        const floorStage = (room.floor || []).map(function (p) { return [p[0] * f.s + f.ox, p[1] * f.s + f.oy]; });
        const mv = doc.createElement('canvas'); mv.width = W; mv.height = H;
        const mx = mv.getContext('2d');
        mx.fillStyle = '#000'; mx.fillRect(0, 0, W, H);
        if (floorStage.length >= 3) {
            mx.fillStyle = '#fff'; mx.beginPath();
            floorStage.forEach(function (p, i) { if (i) mx.lineTo(p[0], p[1]); else mx.moveTo(p[0], p[1]); });
            mx.closePath(); mx.fill();
        }
        return { base: cv.toDataURL('image/png'), mask: mv.toDataURL('image/png'), floorStage: floorStage, fit: f, viewBox: vb };
    }

    win.OS_ROOM_GEN = {
        deliver, buildBase, stageLayers, positionWord, orderMessages, parseLayout, sanitizeCeiling,
        listStylePresets, getStyleName, setStyleName, pickStylePreset,
        _cfg: { DENOISE, PROTECT, LONG_SIDE },
    };
    if (win !== window) { try { window.OS_ROOM_GEN = win.OS_ROOM_GEN; } catch (e) {} }
    console.log('[RoomGen] 整房生圖引擎已載入');
})();
