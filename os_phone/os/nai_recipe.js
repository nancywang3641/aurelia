/**
 * nai_recipe.js — NAI / SD 圖片「生成配方」解析器  v1.0
 *
 * 用途：把一張下載的 AI 圖反解出它內嵌的提示詞與參數，給「拖圖生 NAI 預設」用。
 * 兩種藏法都吃：
 *   1) PNG tEXt/iTXt chunk —— SD(A1111) 寫在 key=parameters；NAI 有時寫 Comment/Description。
 *   2) stealth pnginfo —— NovelAI 把 JSON(gzip) 藏在 alpha 通道最低位元(LSB)，column-major。
 *
 * 依賴：無（純瀏覽器 API：canvas getImageData + DecompressionStream）
 * 暴露：window.NAI_RECIPE.parseFile(file) → Promise<{ ok, recipe?, error? }>
 *   recipe = { source, prompt, neg, sampler, scale, steps, width, height, seed, model }
 */
(function () {
    'use strict';

    // ── PNG tEXt / iTXt chunk 掃描（同步，從 ArrayBuffer）──
    function readPngTextChunks(buffer) {
        const bytes = new Uint8Array(buffer);
        const view = new DataView(buffer);
        const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
        for (let i = 0; i < 8; i++) if (bytes[i] !== SIG[i]) throw new Error('不是 PNG');
        const out = {};
        const latin1 = new TextDecoder('latin1');
        const utf8 = new TextDecoder('utf-8');
        let offset = 8;
        while (offset + 12 <= bytes.length) {
            const length = view.getUint32(offset);
            const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
            const dataStart = offset + 8;
            if (type === 'tEXt') {
                let nul = dataStart;
                while (nul < dataStart + length && bytes[nul] !== 0) nul++;
                const key = latin1.decode(bytes.slice(dataStart, nul));
                const val = utf8.decode(bytes.slice(nul + 1, dataStart + length));
                if (key) out[key] = val;
            } else if (type === 'iTXt') {
                // keyword\0 compFlag compMethod langTag\0 transKeyword\0 text
                let p = dataStart;
                const end = dataStart + length;
                let nul = p; while (nul < end && bytes[nul] !== 0) nul++;
                const key = latin1.decode(bytes.slice(p, nul));
                p = nul + 1;
                const compFlag = bytes[p]; p += 2;                 // compFlag + compMethod
                nul = p; while (nul < end && bytes[nul] !== 0) nul++; p = nul + 1;   // langTag
                nul = p; while (nul < end && bytes[nul] !== 0) nul++; p = nul + 1;   // transKeyword
                if (compFlag === 0 && key) out[key] = utf8.decode(bytes.slice(p, end));
            }
            if (type === 'IEND') break;
            offset += 12 + length;
        }
        return out;
    }

    // ── gzip 解壓（瀏覽器原生 DecompressionStream）──
    async function gunzip(uint8) {
        const ds = new DecompressionStream('gzip');
        const stream = new Blob([uint8]).stream().pipeThrough(ds);
        const ab = await new Response(stream).arrayBuffer();
        return new Uint8Array(ab);
    }

    // ── stealth pnginfo：讀 alpha LSB（column-major）→ gzip JSON ──
    async function readStealth(file) {
        const bmp = await createImageBitmap(file, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        const c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
        if (bmp.close) bmp.close();

        // column-major（x 外、y 內）逐像素取 alpha 最低位元
        let xi = 0, yi = 0;
        function nextBit() {
            if (xi >= width) throw new Error('bits exhausted');
            const idx = (yi * width + xi) * 4 + 3;   // alpha
            const bit = data[idx] & 1;
            yi++; if (yi >= height) { yi = 0; xi++; }
            return bit;
        }
        function readBytes(n) {
            const out = new Uint8Array(n);
            for (let i = 0; i < n; i++) {
                let b = 0;
                for (let k = 0; k < 8; k++) b = (b << 1) | nextBit();
                out[i] = b;
            }
            return out;
        }
        const MAGIC = 'stealth_pnginfo';
        const sig = new TextDecoder('latin1').decode(readBytes(MAGIC.length));
        let comp;
        if (sig === 'stealth_pnginfo') comp = false;
        else if (sig === 'stealth_pngcomp') comp = true;
        else return null;   // 沒有 alpha stealth（可能是 RGB 版或無 metadata）
        const dv = new DataView(readBytes(4).buffer);
        const nbits = dv.getUint32(0);
        let payload = readBytes(Math.floor(nbits / 8));
        if (comp) payload = await gunzip(payload);
        const json = new TextDecoder('utf-8').decode(payload);
        try { return JSON.parse(json); } catch (e) { return null; }
    }

    // ── 萃取：NAI（stealth/Comment JSON）→ 統一 recipe ──
    function extractNAI(commentJson, description) {
        const c = commentJson || {};
        const neg = c.uc
            || (c.v4_negative_prompt && c.v4_negative_prompt.caption && c.v4_negative_prompt.caption.base_caption)
            || '';
        const prompt = c.prompt
            || (c.v4_prompt && c.v4_prompt.caption && c.v4_prompt.caption.base_caption)
            || description || '';
        return {
            source: 'NovelAI',
            prompt: String(prompt || '').trim(),
            neg: String(neg || '').trim(),
            sampler: c.sampler || '',
            scale: (typeof c.scale === 'number') ? c.scale : undefined,
            steps: (typeof c.steps === 'number') ? c.steps : undefined,
            width: c.width, height: c.height, seed: c.seed,
            model: ''
        };
    }

    // ── 萃取：SD(A1111) parameters 字串 → 統一 recipe ──
    function parseSDParameters(text) {
        text = String(text || '');
        let prompt = text, neg = '', paramsLine = '';
        const negIdx = text.indexOf('Negative prompt:');
        const stepsM = text.match(/\nSteps:\s/);
        if (negIdx >= 0) {
            prompt = text.slice(0, negIdx).trim();
            const after = text.slice(negIdx + 'Negative prompt:'.length);
            const sIdx = after.search(/\nSteps:\s/);
            if (sIdx >= 0) { neg = after.slice(0, sIdx).trim(); paramsLine = after.slice(sIdx + 1).trim(); }
            else neg = after.trim();
        } else if (stepsM) {
            const sIdx = text.search(/\nSteps:\s/);
            prompt = text.slice(0, sIdx).trim();
            paramsLine = text.slice(sIdx + 1).trim();
        }
        const params = {};
        if (paramsLine) paramsLine.split(',').forEach(pair => {
            const m = pair.match(/^\s*([^:]+):\s*(.+?)\s*$/);
            if (m) params[m[1].trim()] = m[2].trim();
        });
        const sizeM = (params['Size'] || '').match(/(\d+)x(\d+)/);
        return {
            source: 'StableDiffusion',
            prompt: prompt, neg: neg,
            sampler: params['Sampler'] || '',
            scale: params['CFG scale'] ? parseFloat(params['CFG scale']) : undefined,
            steps: params['Steps'] ? parseInt(params['Steps'], 10) : undefined,
            seed: params['Seed'],
            width: sizeM ? parseInt(sizeM[1], 10) : undefined,
            height: sizeM ? parseInt(sizeM[2], 10) : undefined,
            model: params['Model'] || ''
        };
    }

    // ── 主入口 ──
    async function parseFile(file) {
        let buf;
        try { buf = await file.arrayBuffer(); } catch (e) { return { ok: false, error: '讀檔失敗' }; }

        // 1) PNG 明文 chunk
        let chunks = {};
        try { chunks = readPngTextChunks(buf); } catch (e) {}
        if (chunks['parameters']) {
            const r = parseSDParameters(chunks['parameters']);
            if (r.prompt || r.neg) return { ok: true, recipe: r };
        }
        if (chunks['Comment'] || chunks['Description']) {
            let cj = null;
            try { cj = JSON.parse(chunks['Comment']); } catch (e) {}
            const r = extractNAI(cj, chunks['Description']);
            if (r.prompt || r.neg) return { ok: true, recipe: r };
        }

        // 2) stealth（NAI 主路）
        try {
            const sj = await readStealth(file);
            if (sj) {
                let cj = null;
                try { cj = JSON.parse(sj.Comment); } catch (e) {}
                const r = extractNAI(cj, sj.Description);
                if (sj.Source) r.model = String(sj.Source);
                if (r.prompt || r.neg) return { ok: true, recipe: r };
            }
        } catch (e) {
            if (e && /DecompressionStream/.test(String(e))) {
                return { ok: false, error: '此環境不支援解壓縮，無法讀 NAI 隱藏資訊' };
            }
        }

        return { ok: false, error: '這張圖讀不到生成資訊（可能是截圖、被轉成 JPG、或 metadata 被平台洗掉了）' };
    }

    // ── ComfyUI 工作流萃取：ComfyUI 生成的 PNG 把「API 格式工作流」寫在 tEXt key=prompt、UI 圖寫在 key=workflow ──
    //    給「拖舊圖還原工作流」用。回傳 { ok, api?(物件), apiRaw?(字串), ui?(字串), error? }
    async function extractComfyWorkflow(file) {
        let buf;
        try { buf = await file.arrayBuffer(); } catch (e) { return { ok: false, error: '讀檔失敗' }; }
        let chunks = {};
        try { chunks = readPngTextChunks(buf); } catch (e) { return { ok: false, error: '這不是原始 PNG（ComfyUI 工作流只藏在原始 PNG 裡，截圖／JPG 讀不到）' }; }
        const apiRaw = chunks['prompt'];
        const uiRaw = chunks['workflow'];
        if (!apiRaw && !uiRaw) return { ok: false, error: '這張圖沒有 ComfyUI 工作流資訊（可能不是 ComfyUI 生的、或被轉成 JPG／截圖洗掉了）' };
        let api = null;
        if (apiRaw) { try { api = JSON.parse(apiRaw); } catch (e) { api = null; } }
        if (!api || typeof api !== 'object') return { ok: false, error: '讀到工作流但格式不對（不是 ComfyUI API 格式）' };
        return { ok: true, api: api, apiRaw: apiRaw, ui: uiRaw || null };
    }

    const NAI_RECIPE = { parseFile, parseSDParameters, extractComfyWorkflow, _readStealth: readStealth, _readPngTextChunks: readPngTextChunks };
    window.NAI_RECIPE = NAI_RECIPE;
    try { (window.parent || window).NAI_RECIPE = NAI_RECIPE; } catch (e) {}
    console.log('[PhoneOS] 載入 NAI 配方解析器 (nai_recipe.js)');
})();
