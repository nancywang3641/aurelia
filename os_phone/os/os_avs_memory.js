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
        const M = { npc: '👤 角色', event: '📅 事件', item: '🎒 物品', location: '🗺️ 地點', rule: '📜 規則', relationship: '💞 關係' };
        return M[t] || ('• ' + (t || '記憶'));
    }

    let _host = null;
    let _advOpen = false;

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

        let mems = [];
        try { if (win.OS_DB?.getAllVnMemories) mems = await win.OS_DB.getAllVnMemories(sid) || []; } catch (e) {}

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
                : (cfg.embeddingUrl
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

            <div class="avs-mem-list-hd">📝 記住的事</div>
            <div class="avs-mem-list" id="avs-mem-list">${_renderList(mems)}</div>

            <button class="avs-st-adv-btn${_advOpen ? ' open' : ''}" id="avs-mem-adv-btn">⚙️ 進階：記憶服務設定</button>
            <div class="avs-st-adv${_advOpen ? ' open' : ''}" id="avs-mem-adv">
                <div class="avs-st-adv-sec">
                    <div class="avs-st-adv-hd">記憶服務（embeddings）<span class="avs-st-adv-hint">SiliconFlow 等 OpenAI 相容服務</span></div>
                    <div class="avs-mem-cfg">
                        <label class="avs-mem-fld"><span>端點</span><input class="avs-input" id="avs-mem-url" placeholder="https://api.siliconflow.cn/v1" value="${esc(cfg.embeddingUrl || '')}"></label>
                        <label class="avs-mem-fld"><span>模型</span><input class="avs-input" id="avs-mem-model" placeholder="BAAI/bge-m3" value="${esc(cfg.embeddingModel || 'BAAI/bge-m3')}"></label>
                        <label class="avs-mem-fld avs-mem-chk"><input type="checkbox" id="avs-mem-sync" ${cfg.syncKeyWithPrimary !== false ? 'checked' : ''}><span>跟主模型共用 Key（主模型也走 SiliconFlow 就勾，免再填）</span></label>
                        <label class="avs-mem-fld"><span>Key</span><input class="avs-input" id="avs-mem-key" type="password" placeholder="sk-...（沒勾共用才要填）" value="${esc(cfg.embeddingKey || '')}"></label>
                        <label class="avs-mem-fld"><span>召回條數</span><input class="avs-input avs-mem-num" id="avs-mem-topk" type="number" min="1" max="20" value="${parseInt(cfg.topK) || 5}"></label>
                        <label class="avs-mem-fld"><span>記憶來源</span>
                            <select class="avs-input" id="avs-mem-src">
                                <option value="content"${(cfg.extractSource || 'content') !== 'summary' ? ' selected' : ''}>全文（完整、較花）</option>
                                <option value="summary"${cfg.extractSource === 'summary' ? ' selected' : ''}>摘要（省、但可能漏對話）</option>
                            </select>
                        </label>
                        <div class="avs-mem-srchint">「摘要」是拿主模型每輪吐的 &lt;summary&gt; 去記，省 token；那則沒摘要時自動回退全文。</div>
                    </div>
                    <div class="avs-st-btn-grid">
                        <button class="avs-btn avs-btn-primary" id="avs-mem-save">💾 儲存設定</button>
                        <button class="avs-btn avs-btn-outline" id="avs-mem-test">🔌 測試連線</button>
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

        // 刪單條記憶
        h.querySelectorAll('[data-del]').forEach(btn => btn.onclick = async () => {
            const id = btn.getAttribute('data-del');
            if (!confirm('刪掉這條記憶？AI 之後就不會再想起它。')) return;
            try { await win.OS_DB?.deleteVnMemory?.(id); } catch (e) {}
            _build();
        });

        // 儲存設定
        const saveBtn = q('#avs-mem-save');
        if (saveBtn) saveBtn.onclick = () => {
            const cfg = _cfg();
            cfg.embeddingUrl = (q('#avs-mem-url')?.value || '').trim();
            cfg.embeddingModel = (q('#avs-mem-model')?.value || '').trim() || 'BAAI/bge-m3';
            cfg.syncKeyWithPrimary = !!q('#avs-mem-sync')?.checked;
            cfg.embeddingKey = (q('#avs-mem-key')?.value || '').trim();
            cfg.topK = parseInt(q('#avs-mem-topk')?.value) || 5;
            cfg.extractSource = q('#avs-mem-src')?.value || 'content';
            _saveCfg(cfg);
            const b = saveBtn; const o = b.textContent; b.textContent = '✓ 已儲存'; setTimeout(() => { b.textContent = o; }, 1200);
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
    }

    async function renderInto(host) {
        if (!host) return;
        _host = host;
        await _build();
    }

    win.OS_AVS_MEMORY = { renderInto };
    window.OS_AVS_MEMORY = win.OS_AVS_MEMORY;
})();
