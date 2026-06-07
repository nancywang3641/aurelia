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

    // ================================================================
    // 二、Embedding API
    // ================================================================

    async function embed(text) {
        const url = _getEmbedUrl();
        const key = _getEmbedKey();
        if (!url || !key) throw new Error('[VecEngine] Embedding 端點或 Key 未設定');

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ model: _getEmbedModel(), input: text })
        });
        if (!resp.ok) throw new Error(`[VecEngine] Embedding API 錯誤 HTTP ${resp.status}`);
        const data = await resp.json();
        const vec = data?.data?.[0]?.embedding;
        if (!Array.isArray(vec)) throw new Error('[VecEngine] Embedding 回應格式異常');
        return vec; // Float array
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
- type: "npc" | "event" | "item" | "location" | "rule" | "relationship" | "dialogue"
- summary:【索引用】一句話、≤20字，要能「跟其他記憶區分開」。寫出這條獨有的識別點（誰對誰做了什麼、發生什麼變化、得到/失去什麼）。
    ⚠️ 主角是誰大家都知道——summary 不要每條都用主角名開頭、更別只寫一串角色名，把字數全留給「有區別性的內容」。
    （示意「結構」非實際內容：「〈某角色〉在〈某處〉做了〈某具體事〉」「〈某規則〉被觸發」；實際請填劇情真正發生的事。）
- text:【細節用】較完整的描述（1～3句），保留之後可能要回想的具體細節。若 type 為 "dialogue"，請寫「<角色名>的說話風格／口癖 ＋ 一句最能代表其性格的原句台詞」，盡量保留原話、別改寫成轉述。
- tags: 檢索用關鍵詞陣列，依 type 給不同內容：
    · relationship／dialogue：放相關「角色名」（關係雙方／說話者）——這兩類就是靠人名定位。
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
                const vec = await embed(entry.text);
                await win.OS_DB.saveVnMemory({
                    storyId, chapterId,
                    type: entry.type || 'event',
                    summary: String(entry.summary || '').trim(),   // 索引用一句話摘要(學星河目錄)；舊資料沒有→召回端退回 text
                    text: entry.text || '',
                    tags: entry.tags || [],
                    vector: vec,
                    createdAt: Date.now()
                });
            } catch (vecErr) {
                console.warn('[VecEngine] 單條向量化失敗，跳過:', entry.text, vecErr);
            }
        }
        console.log(`[VecEngine] ✅ 入庫完成：${entries.length} 條記憶`);
    }

    // ================================================================
    // 六、Search：向量搜尋 → top-K
    // ================================================================

    async function search(queryText, storyId) {
        if (!_isEnabled() || !win.OS_DB?.getAllVnMemories) return [];
        try {
            const queryVec = await embed(queryText);
            const all = await win.OS_DB.getAllVnMemories(storyId);
            if (!all.length) return [];

            return all
                .filter(m => Array.isArray(m.vector) && m.vector.length)
                .map(m => ({ ...m, _score: cosineSim(queryVec, m.vector) }))
                .sort((a, b) => b._score - a._score)
                .slice(0, _getTopK());
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

    win.OS_VECTOR_ENGINE = { embed, ingest, ingestEntries, search, isEnabled: _isEnabled, EXTRACTION_PROMPT, cleanForExtract: function(raw) {
        // 把章節原文清成「要餵給抽取的內容」(跟 ingest 同邏輯：summary 或 <content>)，給結合觸發共用
        const src = _cfg().extractSource || 'content';
        let c = '';
        if (src === 'summary') { const sm = String(raw||'').match(/<summary>([\s\S]*?)<\/summary>/i); c = sm ? sm[1] : ''; }
        if (!c.trim()) { const cm = String(raw||'').match(/<content>([\s\S]*?)<\/content>/i); c = cm ? cm[1] : String(raw||''); }
        return c.trim();
    } };

    console.log('[VecEngine] ✅ os_vector_engine.js V1.0 就緒');
})();
