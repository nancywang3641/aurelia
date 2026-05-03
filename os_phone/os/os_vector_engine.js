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

    const EXTRACTION_PROMPT = `從以下視覺小說章節提取有長期重要性的記憶條目。
輸出純 JSON 陣列，不要 markdown 包裹。每筆記錄包含：
- type: "npc" | "event" | "item" | "location" | "rule" | "relationship"
- text: 一句話描述（中文，20-60字）
- tags: 關鍵詞陣列（角色名、地點、物品等）

只提取真正重要的資訊（關鍵事件、角色狀態變化、重要物品、世界規則）。
日常對話、場景描述、情緒旁白不要提取。
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

        // 從 <content> 提取劇情正文（去掉 summary/vars 等）
        const contentMatch = chapterContent.match(/<content>([\s\S]*?)<\/content>/i);
        const cleanContent = contentMatch ? contentMatch[1] : chapterContent;
        if (!cleanContent.trim()) return;

        console.log('[VecEngine] 開始 ingest，章節:', chapterId);
        try {
            const entries = await _extractMemories(cleanContent);
            if (!entries.length) { console.log('[VecEngine] 無重要記憶，跳過'); return; }

            for (const entry of entries) {
                try {
                    const vec = await embed(entry.text);
                    await win.OS_DB.saveVnMemory({
                        storyId, chapterId,
                        type:      entry.type  || 'event',
                        text:      entry.text  || '',
                        tags:      entry.tags  || [],
                        vector:    vec,
                        createdAt: Date.now()
                    });
                } catch(vecErr) {
                    console.warn('[VecEngine] 單條向量化失敗，跳過:', entry.text, vecErr);
                }
            }
            console.log(`[VecEngine] ✅ ingest 完成：${entries.length} 條記憶`);
        } catch(e) {
            console.error('[VecEngine] ingest 失敗:', e);
        }
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

    win.OS_VECTOR_ENGINE = { embed, ingest, search, isEnabled: _isEnabled };

    console.log('[VecEngine] ✅ os_vector_engine.js V1.0 就緒');
})();
