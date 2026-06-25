// ----------------------------------------------------------------
// [檔案] os_avs_memory.js
// 路徑：os_phone/os/os_avs_memory.js
// 職責：AVS「📝 記憶」分頁 —— 把現成的「向量記憶」收進變數工坊、酒館也看得到。
//       給非工程玩家的直觀 UI：
//         • 一個開關「劇情記憶（防 AI 失憶）」= os_vector_config.enabled
//         • 記憶清單：列出 AI 自動記下的事實卡，可單條刪除
//         • 服務設定（端點/模型/Key/召回條數 + 測試連線）收進「⚙️ 進階」摺疊
//       存的引擎（提取/向量化/搜尋）由 os_vector_engine.js 提供，這裡只做 UI + 設定。
// 依賴：window.OS_VECTOR_ENGINE（embed/isEnabled）、window.OS_DB（getAllVnMemories/deleteVnMemory）
//       window.VN_Core._currentStoryId / window.OS_AVS_ADAPTER.getStoryId
// 對外：window.OS_AVS_MEMORY = { renderInto(host) }
// 樣式：css/os_avs.css 的 .avs-mem-*（沿用 .avs-st-toggle / .avs-st-adv / .avs-card / .avs-btn / .avs-input）
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    console.log('[AVS Memory] 載入 os_avs_memory.js（📝 記憶分頁）');

    const CFG_KEY = 'os_vector_config';
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function _cfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { return {}; } }
    function _saveCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {} }
    function _storyId() {
        return (win.VN_Core && win.VN_Core._currentStoryId)
            || win.OS_AVS_ADAPTER?.getStoryId?.()
            || localStorage.getItem('vn_current_story_id') || '';
    }
    function _typeLabel(t) {
        const M = { npc: '👤 角色', event: '📅 事件', item: '🎒 物品', location: '🗺️ 地點', rule: '📜 規則', relationship: '💞 關係', sex: '🔞 性事', dialogue: '🗨️ 語氣' };
        return M[t] || ('• ' + (t || '記憶'));
    }

    let _host = null;
    let _advOpen = false;
    let _memCache = [];        // 目前世界全部記憶（篩選用，免重抓 DB）
    let _memFilter = 'all';    // 分類篩選（type）
    let _memSearch = '';       // 關鍵字搜尋

    function _filterMems(list) {
        let r = list || [];
        if (_memFilter && _memFilter !== 'all') r = r.filter(m => m.type === _memFilter);
        const kw = (_memSearch || '').trim().toLowerCase();
        if (kw) r = r.filter(m => (m.text || '').toLowerCase().includes(kw) || (m.tags || []).some(t => String(t).toLowerCase().includes(kw)));
        return r;
    }

    function _memTypeOpts(mems) {
        const present = [...new Set((mems || []).map(m => m.type).filter(Boolean))];
        if (_memFilter !== 'all' && !present.includes(_memFilter)) _memFilter = 'all';   // 篩選值已不存在(資料變了)退回全部
        return `<option value="all"${_memFilter === 'all' ? ' selected' : ''}>全部分類</option>` +
            present.map(t => `<option value="${esc(t)}"${_memFilter === t ? ' selected' : ''}>${esc(_typeLabel(t))}</option>`).join('');
    }

    function _bindMemDelete() {
        if (!_host) return;
        _host.querySelectorAll('[data-del]').forEach(btn => btn.onclick = async () => {
            const id = btn.getAttribute('data-del');
            if (!confirm('刪掉這條記憶？AI 之後就不會再想起它。')) return;
            try { await win.OS_DB?.deleteVnMemory?.(id); } catch (e) {}
            _build();
        });
    }

    function _updateMemList() {
        const listEl = _host && _host.querySelector('#avs-mem-list');
        if (listEl) listEl.innerHTML = _renderList(_filterMems(_memCache));
        _bindMemDelete();
    }

    function _renderList(mems) {
        if (!mems.length) {
            return `<div class="avs-mem-empty">還沒有記憶。<br>把上面的開關打開、在「⚙️ 進階」設好記憶服務後，跑團存章節時系統會自動把重點記在這裡。</div>`;
        }
        return mems.map(m => `<div class="avs-mem-card" data-id="${esc(m.id)}">
            <div class="avs-mem-card-top">
                <span class="avs-mem-type">${esc(_typeLabel(m.type))}</span>
                <button class="avs-mem-del" data-del="${esc(m.id)}" title="刪掉這條">×</button>
            </div>
            <div class="avs-mem-text">${esc(m.text)}</div>
            ${(m.tags && m.tags.length) ? `<div class="avs-mem-tags">${m.tags.map(t => `<span class="avs-mem-tag">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>`).join('');
    }

    async function _build() {
        if (!_host) return;
        _host.innerHTML = `<div class="avs-mem"><div class="avs-mem-loading">載入記憶中…</div></div>`;

        const cfg = _cfg();
        const on = cfg.enabled === true;
        const sid = _storyId();
        const engOk = !!win.OS_VECTOR_ENGINE;
        const _standalone = !!(win.OS_API?.isStandalone?.());   // PWA/獨立版＝true（用向量搜尋）；酒館(index.js載入)＝false（目錄挑碼、不需 embeddings）

        let mems = [];
        try { if (win.OS_DB?.getAllVnMemories) mems = (await win.OS_DB.getAllVnMemories(sid) || []).filter(m => m && !m.merged); } catch (e) {}   // 隱藏被壓縮的原始條目
        _memCache = mems;
        // 還沒建向量的條數（回填鈕用）：開了記憶 + 設好服務(雲端有端點 or 本地) + 有「當前模型沒算過」的記憶 才提示回填
        const _curModel = win.OS_VECTOR_ENGINE?.curModelId?.();
        const _svcReady = cfg.embeddingLocal === true || !!cfg.embeddingUrl;
        const _noVec = (on && engOk && _svcReady && _curModel) ? mems.filter(m => !(Array.isArray(m.vector) && m.vector.length && m.vecModel === _curModel)).length : 0;

        // 其他「有記憶」的世界（給「轉入記憶」用）——換聊天/備份檔 chatId 變了，可把舊世界記憶搬過來
        let _srcOptions = '';
        try {
            if (win.OS_DB?.getAllVnMemories) {
                const all = await win.OS_DB.getAllVnMemories('') || [];
                const grp = {};
                for (const m of all) { const w = m.storyId || ''; if (w && w !== sid) grp[w] = (grp[w] || 0) + 1; }
                _srcOptions = Object.keys(grp).map(w => `<option value="${esc(w)}">${esc(w)}（${grp[w]} 條）</option>`).join('');
            }
        } catch (e) {}

        const statusTxt = !engOk
            ? '⚠️ 記憶引擎未載入'
            : (!on
                ? '目前關閉中 — 打開開關並設好服務才會開始記'
                : ((!_standalone || cfg.embeddingUrl)
                    ? `已記 ${mems.length} 條　·　目前故事：${sid ? esc(sid) : '（未開故事）'}`
                    : '已開啟，但還沒設定記憶服務（去下面「⚙️ 進階」填）'));

        _host.innerHTML = `<div class="avs-mem">
            <div class="avs-card avs-mem-top">
                <div class="avs-mem-top-text">
                    <div class="avs-mem-top-name">劇情記憶（防 AI 失憶）</div>
                    <div class="avs-mem-top-desc">開啟後，每存一個章節會自動把重點記下來；之後 AI 回話前會自動翻出相關記憶餵給它。</div>
                </div>
                <div class="avs-st-toggle${on ? ' on' : ''}" id="avs-mem-toggle" role="switch"></div>
            </div>

            <div class="avs-mem-status">${statusTxt}</div>

            <div class="avs-st-btn-grid">
                <button class="avs-btn avs-btn-outline" id="avs-mem-tidy">🗜️ 整理舊記憶</button>
                <button class="avs-btn avs-btn-outline" id="avs-mem-reconcile">🧹 對齊劇情</button>
                ${_noVec > 0 ? `<button class="avs-btn avs-btn-outline" id="avs-mem-backfill">🔢 建立記憶向量（${_noVec} 待補）</button>` : ''}
            </div>
            <div class="avs-mem-srchint" id="avs-mem-tidy-result">把舊的零碎記憶併成精簡版，省效能；重要角色與關係不會動。</div>

            <button class="avs-st-adv-btn${_advOpen ? ' open' : ''}" id="avs-mem-adv-btn">⚙️ 進階：記憶服務設定</button>
            <div class="avs-st-adv${_advOpen ? ' open' : ''}" id="avs-mem-adv">
                <div class="avs-st-adv-sec">
                    <div class="avs-st-adv-hd">記憶服務（embeddings）<span class="avs-st-adv-hint">${cfg.embeddingLocal ? '本地模型在你電腦裡算、文字不外流' : 'SiliconFlow 等 OpenAI 相容服務；免費 BAAI/bge-m3 即可'}</span></div>
                    <div class="avs-mem-cfg">
                        <label class="avs-mem-fld avs-mem-chk"><input type="checkbox" id="avs-mem-local" ${cfg.embeddingLocal ? 'checked' : ''}><span>🔒 用本地模型（在你電腦裡算，文字不外流、最安心、零封號風險；首次要下載 30–60MB）</span></label>
                        ${cfg.embeddingLocal ? `<label class="avs-mem-fld"><span>本地模型</span>
                            <select class="avs-input" id="avs-mem-localmodel">
                                <option value="Xenova/bge-small-zh-v1.5"${(cfg.localModel || 'Xenova/bge-small-zh-v1.5') === 'Xenova/bge-small-zh-v1.5' ? ' selected' : ''}>中文小模型（快、約 30MB）</option>
                                <option value="Xenova/multilingual-e5-small"${cfg.localModel === 'Xenova/multilingual-e5-small' ? ' selected' : ''}>多語小模型（約 60MB）</option>
                                <option value="Xenova/bge-m3"${cfg.localModel === 'Xenova/bge-m3' ? ' selected' : ''}>多語大模型（較準、較大較慢）</option>
                            </select>
                        </label>
                        <div class="avs-mem-srchint">第一次按「測試本地模型」會從網路下載模型、之後存在瀏覽器免重下；換模型要重新「建立記憶向量」。</div>` : `
                        <label class="avs-mem-fld"><span>端點</span><input class="avs-input" id="avs-mem-url" placeholder="https://api.siliconflow.cn/v1" value="${esc(cfg.embeddingUrl || '')}"></label>
                        <label class="avs-mem-fld"><span>模型</span><input class="avs-input" id="avs-mem-model" placeholder="BAAI/bge-m3" value="${esc(cfg.embeddingModel || 'BAAI/bge-m3')}"></label>
                        <label class="avs-mem-fld avs-mem-chk"><input type="checkbox" id="avs-mem-sync" ${cfg.syncKeyWithPrimary !== false ? 'checked' : ''}><span>跟主模型共用 Key（主模型也走 SiliconFlow 就勾，免再填）</span></label>
                        <label class="avs-mem-fld"><span>Key</span><input class="avs-input" id="avs-mem-key" type="password" placeholder="sk-...（沒勾共用才要填）" value="${esc(cfg.embeddingKey || '')}"></label>`}
                        ${(win.OS_API?.isStandalone?.()) ? `<label class="avs-mem-fld"><span>召回條數</span><input class="avs-input avs-mem-num" id="avs-mem-topk" type="number" min="1" max="20" value="${parseInt(cfg.topK) || 5}"></label>` : ''}
                        <label class="avs-mem-fld"><span>記憶來源</span>
                            <select class="avs-input" id="avs-mem-src">
                                <option value="content"${(cfg.extractSource || 'content') !== 'summary' ? ' selected' : ''}>全文（完整、較花）</option>
                                <option value="summary"${cfg.extractSource === 'summary' ? ' selected' : ''}>摘要（省、但可能漏對話）</option>
                            </select>
                        </label>
                        <div class="avs-mem-srchint">「摘要」是拿主模型每輪吐的 &lt;summary&gt; 去記，省 token；那則沒摘要時自動回退全文。</div>
                        <label class="avs-mem-fld avs-mem-chk"><input type="checkbox" id="avs-mem-main-recent" ${cfg.mainRecentOnly ? 'checked' : ''}><span>主模型只注入「近期＋角色」記憶（省 token；舊記憶的精準召回交副模型導演。沒跑副模型導演的別勾）</span></label>
                    </div>
                    <div class="avs-st-btn-grid">
                        <button class="avs-btn avs-btn-primary" id="avs-mem-save">💾 儲存設定</button>
                        ${cfg.embeddingLocal ? `<button class="avs-btn avs-btn-outline" id="avs-mem-local-test">🔒 測試本地模型</button>` : `<button class="avs-btn avs-btn-outline" id="avs-mem-test">🔌 測試連線</button>`}
                    </div>
                    <div class="avs-mem-test-result" id="avs-mem-test-result"></div>
                </div>
                <div class="avs-st-adv-sec">
                    <div class="avs-st-adv-hd">轉入記憶 <span class="avs-st-adv-hint">換聊天 / 換備份檔(chatId 變了)後，把舊世界的記憶搬過來</span></div>
                    ${_srcOptions
                        ? `<div class="avs-mem-move">
                            <select class="avs-input" id="avs-mem-src-world"><option value="">選擇來源世界…</option>${_srcOptions}</select>
                            <button class="avs-btn avs-btn-primary" id="avs-mem-move-btn">轉入到目前</button>
                        </div>
                        <div class="avs-mem-srchint">把選的世界記憶「複製」到目前世界（來源保留、不刪，確認沒問題再自己清）。</div>`
                        : `<div class="avs-mem-srchint">目前沒有其他世界的記憶可轉。</div>`}
                </div>
            </div>

            <div class="avs-mem-list-hd-row">
                <div class="avs-mem-list-hd">📝 記住的事</div>
                <div class="avs-mem-filter">
                    <select class="avs-input avs-mem-filter-sel" id="avs-mem-filter">${_memTypeOpts(mems)}</select>
                    <input class="avs-input avs-mem-filter-search" id="avs-mem-search" placeholder="🔍 搜尋…" value="${esc(_memSearch)}">
                </div>
            </div>
            <div class="avs-mem-list" id="avs-mem-list">${_renderList(_filterMems(mems))}</div>
        </div>`;

        _bind();
    }

    function _bind() {
        const h = _host;
        const q = s => h.querySelector(s);

        // 進階摺疊
        const advBtn = q('#avs-mem-adv-btn'), adv = q('#avs-mem-adv');
        if (advBtn && adv) advBtn.onclick = () => { _advOpen = !_advOpen; advBtn.classList.toggle('open', _advOpen); adv.classList.toggle('open', _advOpen); };

        // 開關 = enabled
        const toggle = q('#avs-mem-toggle');
        if (toggle) toggle.onclick = function () {
            const cfg = _cfg();
            cfg.enabled = !this.classList.contains('on');
            _saveCfg(cfg);
            _build();
        };

        // 分類篩選 + 搜尋（只重渲染清單，不重抓 DB）
        const filterSel = q('#avs-mem-filter');
        if (filterSel) filterSel.onchange = () => { _memFilter = filterSel.value; _updateMemList(); };
        const searchInp = q('#avs-mem-search');
        if (searchInp) searchInp.oninput = () => { _memSearch = searchInp.value; _updateMemList(); };

        // 刪單條記憶
        _bindMemDelete();

        // 儲存設定
        const saveBtn = q('#avs-mem-save');
        if (saveBtn) saveBtn.onclick = () => {
            const cfg = _cfg();
            // 這些 embeddings 欄位只在 PWA 顯示；酒館隱藏時欄位不存在 → 別覆蓋既有值(否則酒館存檔會把 PWA 設定清空)
            const _u = q('#avs-mem-url'); if (_u) cfg.embeddingUrl = (_u.value || '').trim();
            const _m = q('#avs-mem-model'); if (_m) cfg.embeddingModel = (_m.value || '').trim() || 'BAAI/bge-m3';
            const _sy = q('#avs-mem-sync'); if (_sy) cfg.syncKeyWithPrimary = !!_sy.checked;
            const _k = q('#avs-mem-key'); if (_k) cfg.embeddingKey = (_k.value || '').trim();
            const _tk = q('#avs-mem-topk'); if (_tk) cfg.topK = parseInt(_tk.value) || 5;   // 此欄只在 PWA 顯示；酒館隱藏時別覆蓋既有值
            const _lc = q('#avs-mem-local'); if (_lc) cfg.embeddingLocal = !!_lc.checked;   // 本地模型開關
            const _lm = q('#avs-mem-localmodel'); if (_lm) cfg.localModel = _lm.value || 'Xenova/bge-small-zh-v1.5';   // 本地模型只在開本地時顯示
            cfg.extractSource = q('#avs-mem-src')?.value || 'content';
            const _mr = q('#avs-mem-main-recent'); if (_mr) cfg.mainRecentOnly = !!_mr.checked;   // 主模型只注入近期+角色記憶
            _saveCfg(cfg);
            const b = saveBtn; const o = b.textContent; b.textContent = '✓ 已儲存'; setTimeout(() => { b.textContent = o; }, 1200);
        };

        // 本地模型開關：切換要重畫面板（換顯示雲端欄位 ↔ 本地模型選單）
        const localChk = q('#avs-mem-local');
        if (localChk) localChk.onchange = () => { const c = _cfg(); c.embeddingLocal = !!localChk.checked; _saveCfg(c); _build(); };

        // 🔒 測試本地模型（spike）：第一次會下載模型，回報哪一階段掛掉 + 錯誤（無 F12 靠這診斷）
        const localTestBtn = q('#avs-mem-local-test');
        if (localTestBtn) localTestBtn.onclick = async () => {
            const res = q('#avs-mem-test-result');
            if (!win.OS_VECTOR_ENGINE?.testLocal) { if (res) { res.className = 'avs-mem-test-result err'; res.textContent = '記憶引擎未載入'; } return; }
            if (saveBtn) saveBtn.onclick();   // 先存目前選的本地模型
            localTestBtn.disabled = true; const _o = localTestBtn.textContent; localTestBtn.textContent = '測試中…';
            if (res) { res.className = 'avs-mem-test-result'; res.textContent = '測試中…首次要下載模型(30–60MB)，可能 1–2 分鐘，請別關面板'; }
            try {
                const r = await win.OS_VECTOR_ENGINE.testLocal();
                if (r.ok) { if (res) { res.className = 'avs-mem-test-result ok'; res.textContent = `✅ 本地模型可用！向量維度 ${r.dim}、耗時 ${r.ms}ms　→ 現在可以「建立記憶向量」`; } }
                else { if (res) { res.className = 'avs-mem-test-result err'; res.textContent = `❌ 卡在「${r.stage}」：${r.error}`; } }
            } catch (e) {
                if (res) { res.className = 'avs-mem-test-result err'; res.textContent = '❌ ' + (e?.message || e); }
            }
            localTestBtn.textContent = _o; localTestBtn.disabled = false;
        };

        // 測試連線
        const testBtn = q('#avs-mem-test');
        if (testBtn) testBtn.onclick = async () => {
            const res = q('#avs-mem-test-result');
            if (!win.OS_VECTOR_ENGINE?.embed) { if (res) { res.className = 'avs-mem-test-result err'; res.textContent = '記憶引擎未載入'; } return; }
            // 先把當前欄位存起來再測（避免測到舊值）
            if (saveBtn) saveBtn.onclick();
            if (res) { res.className = 'avs-mem-test-result'; res.textContent = '測試中…'; }
            try {
                const v = await win.OS_VECTOR_ENGINE.embed('測試文字');
                if (res) { res.className = 'avs-mem-test-result ok'; res.textContent = `✅ 連線成功！向量維度：${v.length}`; }
            } catch (e) {
                if (res) { res.className = 'avs-mem-test-result err'; res.textContent = '❌ ' + (e?.message || e); }
            }
        };

        // 轉入記憶：把其他世界的記憶複製到目前世界（換聊天/備份檔後搬家用）
        const moveBtn = q('#avs-mem-move-btn');
        if (moveBtn) moveBtn.onclick = async () => {
            const src = q('#avs-mem-src-world')?.value;
            if (!src) { alert('先選來源世界'); return; }
            const target = _storyId();
            if (!target) { alert('目前沒有有效的世界（先開著要轉入的那個聊天）'); return; }
            if (src === target) { alert('來源和目前是同一個世界'); return; }
            if (!confirm(`把「${src}」的記憶複製到目前世界？\n（來源保留、不會刪）`)) return;
            moveBtn.disabled = true; const _o = moveBtn.textContent; moveBtn.textContent = '轉入中…';
            try {
                const n = await win.OS_DB?.copyVnMemoriesToStory?.(src, target);
                alert(`✅ 已轉入 ${n || 0} 條記憶到目前世界`);
            } catch (e) { alert('轉入失敗：' + (e?.message || e)); moveBtn.textContent = _o; moveBtn.disabled = false; }
            _build();
        };

        // 🗜️ 整理舊記憶（合併壓縮）：交副模型把舊的零碎記憶併成精簡版，治長線過載
        const tidyBtn = q('#avs-mem-tidy');
        if (tidyBtn) tidyBtn.onclick = async () => {
            if (!win.OS_STATE_RUNTIME?.compressOldMemories) { alert('整理功能尚未載入，請重載擴展'); return; }
            const sid = _storyId();
            if (!sid) { alert('目前沒有有效的世界（先開著要整理的那個聊天）'); return; }
            if (!confirm('把舊的零碎記憶交副模型併成精簡版？\n\n• 重要角色、關係、代表台詞不會動\n• 最近的記憶保留原樣\n• 原始資料只隱藏不刪、可還原')) return;
            const res = q('#avs-mem-tidy-result');
            tidyBtn.disabled = true; const _o = tidyBtn.textContent; tidyBtn.textContent = '整理中…';
            try {
                const r = await win.OS_STATE_RUNTIME.compressOldMemories({ storyId: sid, onProgress: (m) => { if (res) res.textContent = m; } });
                alert(`✅ 整理完成\n把 ${r.mergedCount} 條舊記憶併成 ${r.madeCount} 條\n目前共 ${r.after} 條`);
            } catch (e) {
                alert('整理失敗：' + (e?.message || e));
            }
            tidyBtn.textContent = _o; tidyBtn.disabled = false;
            _build();
        };

        // 🧹 對齊劇情：清掉「來源訊息已被刪掉」的孤兒記憶（刪劇情後 AI 還一直想起被刪內容時用）
        const recBtn = q('#avs-mem-reconcile');
        if (recBtn) recBtn.onclick = async () => {
            if (!win.OS_VECTOR_INJECT?.reconcileToStory) { alert('記憶引擎未載入，請重載擴展'); return; }
            if (!confirm('清掉「已經不在目前劇情裡」的記憶？\n\n• 用在：刪掉劇情後，AI 還一直想起被刪內容\n• 只清「來源訊息已被刪除」的那幾條，現存劇情的記憶不動\n• 讀不到完整劇情會自動中止、不誤刪')) return;
            recBtn.disabled = true; const _o = recBtn.textContent; recBtn.textContent = '對齊中…';
            try {
                const r = await win.OS_VECTOR_INJECT.reconcileToStory();
                if (r.ok) alert(`✅ 對齊完成\n清掉 ${r.removed} 條已刪內容的記憶（目前劇情 ${r.total} 樓、共掃 ${r.scanned} 條）`);
                else alert('未執行：' + (r.msg || '未知原因'));
            } catch (e) { alert('對齊失敗：' + (e?.message || e)); }
            recBtn.textContent = _o; recBtn.disabled = false;
            _build();
        };

        // 🔢 建立記憶向量（回填）：把已存但沒向量的舊記憶批次補上 embedding —— 啟用向量召回的一次性遷移
        const bfBtn = q('#avs-mem-backfill');
        if (bfBtn) bfBtn.onclick = async () => {
            if (!win.OS_VECTOR_ENGINE?.backfillVectors) { alert('記憶引擎未載入，請重載擴展'); return; }
            const sid2 = _storyId();
            if (!sid2) { alert('目前沒有有效的世界（先開著要建立向量的那個聊天）'); return; }
            const res = q('#avs-mem-tidy-result');
            if (!confirm('把目前世界還沒建立向量的記憶批次補上？\n\n• 會分批呼叫記憶服務（免費 BGE 友善、有節流）\n• 一次性：完成後召回才改用向量、不再每輪背整份目錄\n• 條數多時需要一點時間，跑完前別關面板')) return;
            bfBtn.disabled = true; const _o = bfBtn.textContent; bfBtn.textContent = '建立中…';
            try {
                const r = await win.OS_VECTOR_ENGINE.backfillVectors(sid2, (done, total) => {
                    if (res) res.textContent = `建立記憶向量中… ${done}/${total}`;
                    bfBtn.textContent = `建立中… ${done}/${total}`;
                });
                alert(`✅ 完成\n已建立 ${r.ok}/${r.total} 條記憶向量` + (r.ok < r.total ? '\n（部分沒成功，可再按一次補剩下的）' : ''));
            } catch (e) {
                alert('建立失敗：' + (e?.message || e));
            }
            bfBtn.textContent = _o; bfBtn.disabled = false;
            _build();
        };
    }

    async function renderInto(host) {
        if (!host) return;
        _host = host;
        await _build();
    }

    win.OS_AVS_MEMORY = { renderInto };
    window.OS_AVS_MEMORY = win.OS_AVS_MEMORY;
})();
