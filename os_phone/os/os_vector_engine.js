// ----------------------------------------------------------------
// [檔案] os_vector_engine.js (V1.0)
// 路徑：os_phone/os/os_vector_engine.js
// 職責：VN 向量記憶系統
//   - embed()   : 呼叫 Embedding API 產生向量
//   - ingest()  : 副模型提取記憶條目 → 向量化 → 存 IDB
//   - search()  : 向量相似度搜尋 → 返回 top-K 條目
//   - 監聽 VN_CHAPTER_SAVED 事件，自動觸發 ingest
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const VEC_CFG_KEY = 'os_vector_config';

    // ================================================================
    // 一、設定讀取
    // ================================================================

    function _cfg() {
        try { return JSON.parse(localStorage.getItem(VEC_CFG_KEY) || '{}'); } catch(e) { return {}; }
    }

    function _isEnabled() { return _cfg().enabled === true; }

    function _getEmbedUrl() {
        const c = _cfg();
        let base = (c.embeddingUrl || '').replace(/\/$/, '');
        if (!base) return '';
        if (!base.includes('/embeddings')) {
            base = base.replace(/\/chat\/completions$/, '');
            base = base.endsWith('/v1') ? base : base + '/v1';
            base += '/embeddings';
        }
        return base;
    }

    function _getEmbedKey() {
        const c = _cfg();
        if (c.syncKeyWithPrimary !== false) {
            try { return JSON.parse(localStorage.getItem('os_global_config') || '{}').key || c.embeddingKey || ''; }
            catch(e) {}
        }
        return c.embeddingKey || '';
    }

    function _getEmbedModel() { return _cfg().embeddingModel || 'text-embedding-3-small'; }
    function _getTopK()       { return parseInt(_cfg().topK) || 5; }
    const LOCAL_MODEL_DEFAULT = 'Xenova/bge-small-zh-v1.5';
    function _isLocal()       { return _cfg().embeddingLocal === true; }                      // 本地模型(transformers.js 在瀏覽器內算)：文字不外流、最安心、零封號風險
    function _localModel()    { return _cfg().localModel || LOCAL_MODEL_DEFAULT; }
    function _curModelId()    { return _isLocal() ? _localModel() : _getEmbedModel(); }        // 目前算向量用哪個模型 → 存進記憶當 vecModel，防換模型後新舊向量維度不一致被混算(餘弦垃圾)
    function _hasEmbedConfig(){ return _isLocal() || !!(_getEmbedUrl() && _getEmbedKey()); }   // 本地模式免端點/Key；雲端要有端點+Key 才算得了（沒設就 best-effort 退 null，不報錯洗版）

    // ================================================================
    // 二、Embedding API
    // ================================================================

    // text 可傳「字串」(單筆→回 Float 陣列) 或「字串陣列」(批次→回 Float 陣列的陣列、照 index 排好)。批次給回填用、省往返。
    async function embed(text) {
        if (_isLocal()) return _embedLocal(text);   // 🔒 本地模型：transformers.js 在瀏覽器內算，文字零外流
        const url = _getEmbedUrl();
        const key = _getEmbedKey();
        if (!url || !key) throw new Error('[VecEngine] Embedding 端點或 Key 未設定');
        const isBatch = Array.isArray(text);

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ model: _getEmbedModel(), input: text })
        });
        if (!resp.ok) throw new Error(`[VecEngine] Embedding API 錯誤 HTTP ${resp.status}`);
        const data = await resp.json();
        if (isBatch) {
            const rows = Array.isArray(data?.data) ? data.data.slice().sort((a, b) => (a.index || 0) - (b.index || 0)) : [];
            const vecs = rows.map(r => r?.embedding);
            if (!vecs.length || !Array.isArray(vecs[0])) throw new Error('[VecEngine] Embedding 批次回應格式異常');
            return vecs; // Array<Float array>
        }
        const vec = data?.data?.[0]?.embedding;
        if (!Array.isArray(vec)) throw new Error('[VecEngine] Embedding 回應格式異常');
        return vec; // Float array
    }

    // ================================================================
    // 二之二、本地 Embedding（transformers.js / WASM，文字零外流）
    //   懶載：第一次用到才從 CDN import transformers.js + 從 HF 下載模型(快取在瀏覽器，之後免重下)。
    //   單執行緒 WASM：避開 Worker/SharedArrayBuffer 的 CSP 雷，最大化在 TauriTavern webview 跑得動的機率。
    // ================================================================
    const _TF_URLS = [
        'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm',   // jsdelivr 保證轉 ESM
        'https://esm.sh/@xenova/transformers@2.17.2',                       // esm.sh 一定是 ESM
        'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2'          // 官方文件用的裸 URL（多數情況也行）
    ];
    let _tfModP = null, _localPipeP = null, _localPipeModel = '';

    async function _loadTF() {
        if (_tfModP) return _tfModP;
        _tfModP = (async () => {
            let lastErr = null;
            for (const u of _TF_URLS) {
                try {
                    const mod = await import(/* webpackIgnore: true */ u);
                    const T = (mod && mod.pipeline) ? mod : ((mod && mod.default && mod.default.pipeline) ? mod.default : null);   // 認 pipeline 匯出(CJS interop 退 default)
                    if (T && T.pipeline) return T;
                    lastErr = new Error('模組沒有 pipeline 匯出');
                } catch (e) { lastErr = e; console.warn('[VecEngine] transformers.js 載入失敗，換下一個 CDN:', u, e?.message || e); }
            }
            throw new Error('transformers.js 載入失敗（CDN 都連不上 / 被 CSP 擋 / 格式不對）：' + (lastErr?.message || lastErr));
        })();
        return _tfModP;
    }

    async function _getLocalPipe() {
        const model = _localModel();
        if (_localPipeP && _localPipeModel === model) return _localPipeP;
        _localPipeModel = model;
        _localPipeP = (async () => {
            const T = await _loadTF();
            try {
                T.env.allowLocalModels = false;   // 不找本機檔，只從 HF 下載一次後快取
                if (T.env.backends?.onnx?.wasm) T.env.backends.onnx.wasm.numThreads = 1;   // 單執行緒，避開 Worker/SAB 的 CSP 限制
            } catch (e) {}
            return await T.pipeline('feature-extraction', model, { quantized: true });
        })();
        return _localPipeP;
    }

    async function _embedLocal(text) {
        const pipe = await _getLocalPipe();
        const input = Array.isArray(text) ? text.map(t => String(t || '')) : String(text || '');
        const out = await pipe(input, { pooling: 'mean', normalize: true });   // mean-pool + L2 normalize → 餘弦可直接比
        const dims = out.dims || [];
        const dim = dims[dims.length - 1] || out.data.length;
        if (Array.isArray(text)) {
            const n = dims[0] || 1, flat = Array.from(out.data), vecs = [];
            for (let i = 0; i < n; i++) vecs.push(flat.slice(i * dim, (i + 1) * dim));
            return vecs;
        }
        return Array.from(out.data);
    }

    // 可行性測試（spike）：分階段試「載函式庫 → 下模型 → 算一條」，哪一關掛了回報哪一關 + 錯誤訊息（無 F12 環境靠這個診斷）。
    async function testLocal() {
        let stage = '初始化';
        try {
            stage = '載入函式庫(transformers.js)';
            await _loadTF();
            stage = '下載/載入模型(首次需下 30–60MB)';
            const t0 = Date.now();
            const v = await _embedLocal('測試文字 hello world');
            const ms = Date.now() - t0;
            if (!Array.isArray(v) || !v.length) throw new Error('回傳向量為空');
            return { ok: true, dim: v.length, ms, model: _localModel() };
        } catch (e) {
            return { ok: false, stage, error: (e?.message || String(e)) };
        }
    }

    // ================================================================
    // 三、Cosine Similarity
    // ================================================================

    function cosineSim(a, b) {
        let dot = 0, na = 0, nb = 0;
        const len = Math.min(a.length, b.length);
        for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
        return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
    }

    // ================================================================
    // 四、副模型記憶提取（Extraction Pass）
    // ================================================================

    const EXTRACTION_PROMPT = `從以下視覺小說章節提取「有長期重要性」的記憶條目。
輸出純 JSON 陣列，不要 markdown 包裹。每筆記錄包含：
- type: "npc" | "event" | "item" | "location" | "rule" | "relationship" | "dialogue" | "sex"
- summary:【索引用】一句話、≤20字，要能「跟其他記憶區分開」。寫出這條獨有的識別點（誰對誰做了什麼、發生什麼變化、得到/失去什麼）。
    ⚠️ 主角是誰大家都知道——summary 不要每條都用主角名開頭、更別只寫一串角色名，把字數全留給「有區別性的內容」。
    （示意「結構」非實際內容：「〈某角色〉在〈某處〉做了〈某具體事〉」「〈某規則〉被觸發」；實際請填劇情真正發生的事。）
- text:【細節用】較完整的描述（1～3句），保留之後可能要回想的具體細節。若 type 為 "dialogue"，請寫「<角色名>的說話風格／口癖 ＋ 一句最能代表其性格的原句台詞」，盡量保留原話、別改寫成轉述。若 type 為 "sex"，寫「目的·手段·結果」(以何名義交合、對方獲得何增益、身心/關係如何變化)，別寫露骨過程細節。
- tags: 檢索用關鍵詞陣列，依 type 給不同內容：
    · relationship／dialogue：放相關「角色名」（關係雙方／說話者）——這兩類就是靠人名定位。
    · sex：放「對方角色名」（主角不入）——靠人名定位「哪個 NPC 跟主角發生過性事」。
    · event：事件名 ＋ 區別關鍵詞。
    · rule：規則的關鍵詞。
    · item：物品名。
    · location：地點名。
    · npc：該角色名 ＋ 最能定位的狀態／變化詞（別只放主角名充數）。
    ⚠️ 除 relationship／dialogue 外，**每條最多 3 個 tag**，挑最能「跟其他記憶區分開」的，別一條塞一堆觸發點。
    ⚠️ 主角名人人皆知，當 tag 形同沒標——非人名類別裡絕不拿主角名湊數。

提取重點：
- 關鍵事件、角色狀態變化、重要物品、世界規則、人物關係
- ⭐ type:"dialogue"：每個重要出場角色，抓 1～2 句最能展現其「性格／語氣／口癖」的代表台詞（保留原話），這是用來防止之後 AI 把角色寫 OOC 的依據
- ⭐ type:"sex"：主角跟某 NPC 發生性事就記一條（目的·手段·結果），防 NPC 後續見面忘記有過性事、變成拔屌無情 OOC
跳過：純過場、場景描述、不帶性格的閒聊水詞。
若無重要內容輸出 []。`;

    async function _extractMemories(chapterContent) {
        const secCfg = (win.OS_SETTINGS?.getSecondaryConfig?.()) || (win.OS_SETTINGS?.getConfig?.()) || {};
        secCfg._isSecondary = true;

        return new Promise((resolve) => {
            win.OS_API.chat(
                [
                    { role: 'system', content: EXTRACTION_PROMPT },
                    { role: 'user',   content: chapterContent.slice(0, 6000) } // 限制長度
                ],
                secCfg,
                null,
                (text) => {
                    try {
                        const match = (text || '').match(/\[[\s\S]*\]/);
                        const arr = match ? JSON.parse(match[0]) : [];
                        resolve(Array.isArray(arr) ? arr : []);
                    } catch(e) { resolve([]); }
                },
                () => resolve([]),
                { disableTyping: true }
            );
        });
    }

    // ================================================================
    // 五、Ingest：提取 + 向量化 + 存 IDB
    // ================================================================

    async function ingest(chapterContent, storyId, chapterId) {
        if (!_isEnabled() || !win.OS_DB?.saveVnMemory) return;

        // 記憶來源（可在 📝 記憶設定切換）：
        //   'summary' = 讀 PRO 主模型的 <summary>（省 token，但可能漏對話細節）
        //   其他/預設 = 讀 <content> 全文（完整，較花）
        const src = _cfg().extractSource || 'content';
        let cleanContent = '';
        if (src === 'summary') {
            const sm = chapterContent.match(/<summary>([\s\S]*?)<\/summary>/i);
            cleanContent = sm ? sm[1] : '';
        }
        if (!cleanContent.trim()) {   // 全文模式，或摘要模式但這則沒 <summary> → 回退全文
            const cm = chapterContent.match(/<content>([\s\S]*?)<\/content>/i);
            cleanContent = cm ? cm[1] : chapterContent;
        }
        if (!cleanContent.trim()) return;

        console.log('[VecEngine] 開始 ingest，章節:', chapterId);
        try {
            const entries = await _extractMemories(cleanContent);
            await ingestEntries(entries, storyId, chapterId);
        } catch(e) {
            console.error('[VecEngine] ingest 失敗:', e);
        }
    }

    // 入庫「已抽好的記憶條目」——給「結合觸發」用：state_runtime 一通副模型同時抽好 memories 後直接丟進來，
    // 跳過這裡的副模型抽取(_extractMemories)，只做去重 + 向量化 + 存。
    async function ingestEntries(entries, storyId, chapterId) {
        if (!_isEnabled() || !win.OS_DB?.saveVnMemory) return;
        if (!Array.isArray(entries)) return;
        // 重 roll/重生：先清同章舊記憶再寫新的(自動替換)
        if (chapterId != null && win.OS_DB?.deleteVnMemoriesByChapter) {
            try { await win.OS_DB.deleteVnMemoriesByChapter(chapterId, storyId); } catch (e) {}
        }
        if (!entries.length) { console.log('[VecEngine] 無記憶條目，跳過（已清同章舊記憶）'); return; }
        for (const entry of entries) {
            if (!entry || !entry.text) continue;
            try {
                // 向量供相似度搜尋(search)用——酒館也算（召回改「向量粗篩→導演精排」、取代 2000 行全目錄常駐）。
                //   best-effort：沒設 BGE / 額度滿 / 算失敗都退 vector=null，召回端自動退回全目錄、絕不害記憶存不進去。
                let vec = null;
                if (_hasEmbedConfig()) {
                    try { vec = await embed(entry.text); } catch (vErr) { console.warn('[VecEngine] 向量化失敗(不影響存):', vErr?.message || vErr); }
                }
                await win.OS_DB.saveVnMemory({
                    storyId, chapterId,
                    type: entry.type || 'event',
                    summary: String(entry.summary || '').trim(),   // 索引用一句話摘要(學星河目錄)；舊資料沒有→召回端退回 text
                    text: entry.text || '',
                    tags: entry.tags || [],
                    vector: vec,
                    vecModel: vec ? _curModelId() : null,           // 算這條向量用的模型 → search 只認同模型的(換模型後新舊維度不混算)
                    createdAt: Date.now()
                });
            } catch (saveErr) {
                console.warn('[VecEngine] 存記憶失敗，跳過:', entry.text, saveErr);
            }
        }
        console.log(`[VecEngine] ✅ 入庫完成：${entries.length} 條記憶`);
    }

    // 回填：把「已存但沒向量」的舊記憶批次補上 embedding（啟用向量後一次性遷移，例如把 2000 條舊記憶補齊）。
    //   分批打 BGE（免費 tier 友善：每批 BATCH 條 + 批間 DELAY 節流）；saveVnMemory 同 id 覆寫＝原地更新；
    //   被壓縮隱藏(merged)的原始條目不搜尋→不浪費額度回填；單批失敗跳過續跑、可重按補剩下的。
    async function backfillVectors(storyId, onProgress) {
        if (!win.OS_DB?.getAllVnMemories || !win.OS_DB?.saveVnMemory) return { done: 0, ok: 0, total: 0 };
        if (!_hasEmbedConfig()) throw new Error('尚未設定記憶服務（端點／Key）');
        const all = (await win.OS_DB.getAllVnMemories(storyId)) || [];
        const cur = _curModelId();
        // 沒向量、或向量是「別的模型」算的(換過模型) → 都要(重)建
        const todo = all.filter(m => m && m.text && !m.merged && !(Array.isArray(m.vector) && m.vector.length && m.vecModel === cur));
        const total = todo.length;
        if (!total) return { done: 0, ok: 0, total: 0 };
        const BATCH = 32, DELAY = 350;
        let done = 0, ok = 0;
        for (let i = 0; i < todo.length; i += BATCH) {
            const chunk = todo.slice(i, i + BATCH);
            try {
                const vecs = await embed(chunk.map(m => String(m.text || '').slice(0, 2000)));
                for (let j = 0; j < chunk.length; j++) {
                    const v = vecs[j];
                    if (Array.isArray(v) && v.length) {
                        chunk[j].vector = v;
                        chunk[j].vecModel = cur;
                        try { await win.OS_DB.saveVnMemory(chunk[j]); ok++; } catch (e) {}
                    }
                }
            } catch (e) {
                console.warn('[VecEngine] 回填批次失敗(跳過、可重按補):', e?.message || e);
            }
            done += chunk.length;
            try { onProgress && onProgress(done, total); } catch (e) {}
            if (i + BATCH < todo.length) await new Promise(r => setTimeout(r, DELAY));
        }
        console.log(`[VecEngine] 🔢 回填完成：${ok}/${total} 條建立向量`);
        return { done, ok, total };
    }

    // ================================================================
    // 六、Search：向量搜尋 → top-K
    // ================================================================

    async function search(queryText, storyId, topK) {
        if (!_isEnabled() || !win.OS_DB?.getAllVnMemories) return [];
        try {
            const queryVec = await embed(queryText);
            const cur = _curModelId();
            const all = await win.OS_DB.getAllVnMemories(storyId);
            if (!all.length) return [];

            return all
                .filter(m => Array.isArray(m.vector) && m.vector.length && m.vecModel === cur)   // 只比同模型算的向量(維度一致、餘弦才有意義)
                .map(m => ({ ...m, _score: cosineSim(queryVec, m.vector) }))
                .sort((a, b) => b._score - a._score)
                .slice(0, topK || _getTopK());
        } catch(e) {
            console.warn('[VecEngine] search 失敗:', e);
            return [];
        }
    }

    // ================================================================
    // 七、事件監聽：VN_CHAPTER_SAVED → 自動 ingest
    // ================================================================

    win.addEventListener('VN_CHAPTER_SAVED', async (e) => {
        if (!_isEnabled()) return;
        const { content, storyId, id } = e.detail || {};
        if (!content) return;
        // 背景執行，不阻塞 UI
        setTimeout(() => ingest(content, storyId, id), 500);
    });

    // ================================================================
    // 八、公開 API
    // ================================================================

    win.OS_VECTOR_ENGINE = { embed, ingest, ingestEntries, backfillVectors, search, isEnabled: _isEnabled, hasEmbedConfig: _hasEmbedConfig, testLocal, curModelId: _curModelId, isLocal: _isLocal, EXTRACTION_PROMPT, cleanForExtract: function(raw) {
        // 把章節原文清成「要餵給抽取的內容」(跟 ingest 同邏輯：summary 或 <content>)，給結合觸發共用
        const src = _cfg().extractSource || 'content';
        let c = '';
        if (src === 'summary') { const sm = String(raw||'').match(/<summary>([\s\S]*?)<\/summary>/i); c = sm ? sm[1] : ''; }
        if (!c.trim()) { const cm = String(raw||'').match(/<content>([\s\S]*?)<\/content>/i); c = cm ? cm[1] : String(raw||''); }
        return c.trim();
    } };

    console.log('[VecEngine] ✅ os_vector_engine.js V1.0 就緒');
})();
