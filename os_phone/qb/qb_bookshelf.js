// ---------------------------------------------------------------
// [檔案] qb_bookshelf.js (v1.6 - 動態人設防汙染預覽版)
// 職責：書架視窗模組 — 書脊渲染、書封面展開、撰寫新書、刪除確認彈窗
// 從 void_terminal.js 抽出，完全無狀態，依賴全域物件：
//   window.AURELIA_WORLDS / AURELIA_CUSTOM_WORLDS
//   window.QB_CORE        (createCustomWorld / openBook)
//   window.OS_DB          (deleteVarPack / worldbook CRUD)
//   window.OS_WORLDBOOK   (getAvailablePacks)
//   window.OS_API         (isStandalone)
//   window.OS_CARD_IMPORT (injectImportSpine)
//   window.VoidTerminal   (playSequence — 錯誤回饋台詞)
//   window.AureliaControlCenter (switchPage)
//   window.VN_Core        (openGeneratePanel)
//   window.StoryExtractor (show)
// ---------------------------------------------------------------
(function() {
    'use strict';

    // ── 自由書籍常數 & 歷史助手 ──────────────────────────────────
    const FREE_SCRIPT_WID        = '__free_script__';
    const FREE_SCRIPT_HISTORY_KEY = 'vn_free_history';

    const _FREE_WORLD = {
        id: FREE_SCRIPT_WID,
        isFreeScript: true,
        title: '自由劇情',
        icon: '✍️',
        cover: '',
        desc: '不限角色，自由輸入劇情指令',
        wbPacks: [],
        custom: false
    };

    // 📂 具名開場白：跟舊的「AI 生成劇情」面板共用同一份鍵（os_vn_gen_presets）。
    //    兩個入口合併成一個之後，你以前在那邊存的那幾筆直接就在這裡看得到，不用重打。
    //    它跟下面的「過往開場」語意不同：這份是你主動命名收藏的，那份是每次踏入自動記的。
    const GEN_PRESETS_KEY = 'os_vn_gen_presets';
    function _getPresets() {
        try { const a = JSON.parse(localStorage.getItem(GEN_PRESETS_KEY) || '[]'); return Array.isArray(a) ? a : []; }
        catch(e) { return []; }
    }
    function _savePreset(title, request) {
        if (!title) return;                                   // 沒命名就不收藏，只進歷史
        const list = _getPresets().filter(p => p && p.title !== title);   // 同名覆蓋
        list.unshift({ title, request, savedAt: Date.now() });
        try { localStorage.setItem(GEN_PRESETS_KEY, JSON.stringify(list)); }
        catch(e) { console.warn('[書架] 開場白存不下來（本機空間滿了？）', e); }
    }
    function _delPreset(title) {
        try { localStorage.setItem(GEN_PRESETS_KEY, JSON.stringify(_getPresets().filter(p => p && p.title !== title))); }
        catch(e) {}
    }

    function _getFreeHistory() {
        try { return JSON.parse(localStorage.getItem(FREE_SCRIPT_HISTORY_KEY) || '[]'); } catch(e) { return []; }
    }
    function _addFreeHistory(title, request) {
        const list = _getFreeHistory();
        // 同指令去重（只保留最新）
        const key = (request || '').slice(0, 40);
        const deduped = list.filter(h => (h.request || '').slice(0, 40) !== key);
        deduped.unshift({ id: 'fh_' + Date.now(), title, request, ts: Date.now() });
        try { localStorage.setItem(FREE_SCRIPT_HISTORY_KEY, JSON.stringify(deduped.slice(0, 30))); } catch(e) {}
    }
    function _deleteFreeHistory(id) {
        const list = _getFreeHistory().filter(h => h.id !== id);
        try { localStorage.setItem(FREE_SCRIPT_HISTORY_KEY, JSON.stringify(list)); } catch(e) {}
    }

    // ── HTML 轉義 ─────────────────────────────────────────────────
    function _escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── 書籍刪除確認彈窗 ──────────────────────────────────────────
    function _confirmDeleteWorld(w, afterDelete) {
        const old = document.getElementById('qb-del-world-dialog');
        if (old) old.remove();

        const hasVarPack = !!w.autoPackId;
        const cardName   = w.title || w.id;

        const dlg = document.createElement('div');
        dlg.id = 'qb-del-world-dialog';
        dlg.style.cssText = `
            position:fixed;inset:0;z-index:99999;
            background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);
            display:flex;align-items:center;justify-content:center;
        `;
        dlg.innerHTML = `
            <div style="
                background:linear-gradient(160deg,#1a1008,#0d0804);
                border:1px solid rgba(210,215,235,0.45);
                border-radius:10px;padding:24px 28px;max-width:340px;width:90%;
                box-shadow:0 8px 40px rgba(0,0,0,0.8);color:var(--qbk-ink);font-family:'Noto Sans TC',sans-serif;
            ">
                <div style="font-size:15px;font-weight:700;margin-bottom:8px;">📕 刪除《${cardName}》</div>
                <div style="font-size:12px;color:var(--qbk-ink);margin-bottom:18px;line-height:1.6;">
                    請選擇刪除範圍：
                </div>

                <div id="qb-del-scope" style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
                    <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:8px 10px;border-radius:6px;border:1px solid var(--qbk-line);transition:border-color 0.2s;" id="qb-del-opt-book">
                        <input type="radio" name="qb-del-scope" value="book" checked style="margin-top:2px;accent-color:#e67e22;">
                        <span>
                            <strong style="font-size:13px;">只刪書籍</strong>
                            <div style="font-size:11px;color:var(--qbk-ink-dim);margin-top:2px;">書脊移除，其他資料保留</div>
                        </span>
                    </label>
                    <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:8px 10px;border-radius:6px;border:1px solid var(--qbk-line);transition:border-color 0.2s;" id="qb-del-opt-all">
                        <input type="radio" name="qb-del-scope" value="all" style="margin-top:2px;accent-color:#e53e3e;">
                        <span>
                            <strong style="font-size:13px;color:#fc8181;">完整清除</strong>
                            <div style="font-size:11px;color:var(--qbk-ink-dim);margin-top:2px;">
                                書籍${hasVarPack ? '、追蹤欄位' : ''}、世界書條目（分類「${cardName}」）
                            </div>
                        </span>
                    </label>
                </div>

                <div style="display:flex;gap:10px;">
                    <button id="qb-del-cancel" class="qb-btn-ghost" style="flex:1;">取消</button>
                    <button id="qb-del-confirm" class="qb-btn-danger" style="flex:1;">確認刪除</button>
                </div>
            </div>
        `;

        // 高亮選中選項
        const radios = dlg.querySelectorAll('input[name="qb-del-scope"]');
        const labels = [dlg.querySelector('#qb-del-opt-book'), dlg.querySelector('#qb-del-opt-all')];
        radios.forEach((r, i) => {
            r.onchange = () => labels.forEach((l, j) => {
                l.style.borderColor = j === i ? 'rgba(239,227,208,0.40)' : 'rgba(239,227,208,0.14)';
            });
        });
        labels[0].style.borderColor = 'rgba(239,227,208,0.40)';

        dlg.querySelector('#qb-del-cancel').onclick  = () => dlg.remove();
        dlg.querySelector('#qb-del-confirm').onclick = async () => {
            const scope = dlg.querySelector('input[name="qb-del-scope"]:checked')?.value || 'book';
            dlg.remove();

            // 1. 從書架移除
            window.AURELIA_CUSTOM_WORLDS = (window.AURELIA_CUSTOM_WORLDS || []).filter(x => x.id !== w.id);
            try { localStorage.setItem('aurelia_custom_worlds', JSON.stringify(window.AURELIA_CUSTOM_WORLDS)); } catch(e) {}

            if (scope === 'all') {
                // 2. 刪這本書自帶的追蹤欄位範本（匯入／生成時建的那一份）
                if (hasVarPack && window.OS_DB?.deleteVarPack) {
                    try { await window.OS_DB.deleteVarPack(w.autoPackId); } catch(e) { console.warn('[DelWorld] 追蹤欄位刪除失敗', e); }
                }
                // 3. 刪世界書條目（category = 書名）
                if (window.OS_DB?.getAllWorldbookEntries && window.OS_DB?.deleteWorldbookEntry) {
                    try {
                        const entries = await window.OS_DB.getAllWorldbookEntries();
                        const targets = entries.filter(e => e.category === cardName);
                        for (const e of targets) {
                            await window.OS_DB.deleteWorldbookEntry(e.id).catch(() => {});
                        }
                        console.log(`[DelWorld] 已刪世界書條目 ${targets.length} 筆（分類：${cardName}）`);
                    } catch(e) { console.warn('[DelWorld] 世界書刪除失敗', e); }
                }
                // 4. 刪條件規則（worldId） - 修復鍵值錯誤
                try {
                    const rulesKey = 'avs_condition_rules'; // ✅ 已修正為正確的 AVS 規則鍵值
                    const allRules = JSON.parse(localStorage.getItem(rulesKey) || '[]');
                    const filtered = allRules.filter(r => r.worldId !== w.id);
                    localStorage.setItem(rulesKey, JSON.stringify(filtered));
                    console.log(`[DelWorld] 已刪條件規則 ${allRules.length - filtered.length} 條`);
                } catch(e) {}
            }

            if (typeof afterDelete === 'function') afterDelete();
        };

        document.body.appendChild(dlg);
    }

    // ── 書架分頁狀態 ────────────────────────────────────────────
    let _currentPage = 0;

    function _getShelves() {
        return [
            document.getElementById('qb-shelf-1'),
            document.getElementById('qb-shelf-2'),
            document.getElementById('qb-shelf-3'),
        ].filter(Boolean);
    }

    function _clearShelf(shelfEl) {
        // 保留底板（position:absolute），移除書脊
        Array.from(shelfEl.children)
            .filter(el => el.style.position !== 'absolute')
            .forEach(el => el.remove());
    }

    function _makeSpine(w, bookH) {
        const spine = document.createElement('div');
        spine.className = 'qb-spine';
        spine.dataset.wid = w.id;
        const bgStyle = w.isFreeScript
            ? 'background:linear-gradient(160deg,#1a1a2e,#16213e,#0f3460);'
            : `background:url('${w.cover}') center/cover;`;
        spine.style.cssText = `
            flex-shrink:0; width:48px; height:${bookH}px; position:relative; z-index:1;
            ${bgStyle}
            border-radius:2px 1px 1px 2px;
            border-left:5px solid ${w.isFreeScript ? 'rgba(100,180,255,0.35)' : 'rgba(255,255,255,0.25)'};
            border-right:2px solid rgba(0,0,0,0.6);
            box-shadow:inset 4px 0 10px rgba(0,0,0,0.5), 4px 4px 12px rgba(0,0,0,0.7);
            cursor:pointer;
            transition:transform 0.25s cubic-bezier(0.2,0.8,0.2,1), box-shadow 0.25s;
            transform-origin:bottom center;
        `;
        spine.innerHTML = `
            <!-- 書名壓在封面圖上，封面亮起來(水墨、白底立繪)時字會糊掉 → 罩深一點。
                 0.62 是實算出來的門檻：就算封面整片全白，書名對比也還有 4.9。 -->
            <div style="position:absolute;inset:0;background:rgba(0,0,0,${w.isFreeScript ? '0.3' : '0.62'});border-radius:inherit;"></div>
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:8px 0;">
                <span style="writing-mode:vertical-rl;text-orientation:mixed;color:${w.isFreeScript ? 'rgba(150,200,255,0.95)' : 'var(--qbk-ink)'};font-size:11px;font-weight:700;letter-spacing:3px;text-shadow:0 1px 4px #000;max-height:78%;overflow:hidden;line-height:1.3;">${w.title}</span>
            </div>
            <div style="position:absolute;top:6px;left:0;right:0;text-align:center;font-size:14px;line-height:1;">${w.icon}</div>
            ${!w.isFreeScript ? `<div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;color:rgba(229,62,62,0.9);font-size:8px;font-weight:bold;text-shadow:0 0 4px #000;">▲${w.danger}</div>` : ''}
            ${w.custom ? `<button class="qb-spine-del" title="下架" style="position:absolute;top:4px;right:3px;background:rgba(180,30,30,0.75);border:none;color:#fff;font-size:9px;width:16px;height:16px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;padding:0;z-index:5;">✕</button>` : ''}
        `;
        spine.onmouseenter = () => {
            spine.style.transform = 'translateY(-12px) scale(1.04)';
            spine.style.boxShadow = 'inset 4px 0 10px rgba(0,0,0,0.5), 6px 18px 20px rgba(0,0,0,0.8)';
            spine.style.zIndex = '5';
        };
        spine.onmouseleave = () => {
            spine.style.transform = '';
            spine.style.boxShadow = 'inset 4px 0 10px rgba(0,0,0,0.5), 4px 4px 12px rgba(0,0,0,0.7)';
            spine.style.zIndex = '1';
        };
        if (w.custom) {
            const delBtn = spine.querySelector('.qb-spine-del');
            if (delBtn) {
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    _confirmDeleteWorld(w, () => render());
                };
            }
        }
        spine.onclick = () => openCover(w);
        return spine;
    }

    function _makeAddSpine(bookH) {
        const addSpine = document.createElement('div');
        addSpine.style.cssText = `
            flex-shrink:0; width:48px; height:${bookH}px; position:relative; z-index:1;
            background:rgba(44,28,16,0.7);
            border:1.5px dashed rgba(239,227,208,0.20);
            border-radius:2px; cursor:pointer;
            display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
            transition:background 0.2s, border-color 0.2s;
        `;
        addSpine.innerHTML = `
            <span style="color:var(--qbk-ink-dim);font-size:20px;line-height:1;">＋</span>
            <span style="writing-mode:vertical-rl;color:var(--qbk-ink-faint);font-size:10px;letter-spacing:3px;">撰寫新書</span>
        `;
        addSpine.onmouseenter = () => {
            addSpine.style.background = 'rgba(62,39,22,0.9)';
            addSpine.style.borderColor = 'rgba(239,227,208,0.40)';
        };
        addSpine.onmouseleave = () => {
            addSpine.style.background = 'rgba(44,28,16,0.7)';
            addSpine.style.borderColor = 'rgba(239,227,208,0.16)';
        };
        addSpine.onclick = () => openCreate();
        return addSpine;
    }

    // ── 渲染書架（移動端動態寬高適配＋手勢滑動）────────────────────────
    function render() {
        const shelves = _getShelves();
        if (!shelves.length) return;
        // 回到書架這一層就不是在讀開場白了 → 收掉滿版態，木框書架窗照舊
        try { document.getElementById('qb-bookshelf-overlay')?.classList.remove('qb-reading'); } catch (e) { }

        const allWorlds = [_FREE_WORLD]
            .concat(Object.values(window.AURELIA_WORLDS || {}))
            .concat(window.AURELIA_CUSTOM_WORLDS || []);

        // 動態獲取第一層書架的真實寬度。
        let shelfW = shelves[0].clientWidth;
        if (shelfW <= 0) {
            shelfW = window.innerWidth > 0 ? (window.innerWidth - 40) : 300;
        }

        // 計算每層可放幾本（保底最少1本，完美適配移動端）
        const bookW    = 48, gap = 3, padH = 28;
        const perShelf = Math.max(1, Math.floor((shelfW - padH + gap) / (bookW + gap)));
        const perPage  = perShelf * shelves.length;

        // 計算書本高度（依層高，避免在移動端變形）
        const shelfH = shelves[0].clientHeight || 185;
        const bookH  = Math.min(145, Math.max(60, shelfH - 40));

        // 換頁邊界計算
        const totalPages = Math.max(1, Math.ceil((allWorlds.length + 1) / perPage));
        _currentPage = Math.max(0, Math.min(_currentPage, totalPages - 1));
        const startIdx = _currentPage * perPage;
        const pageWorlds = allWorlds.slice(startIdx, startIdx + perPage);

        // 清空三層書架
        shelves.forEach(s => _clearShelf(s));

        // 將書本依序塞入各層
        shelves.forEach((shelfEl, i) => {
            const slice = pageWorlds.slice(i * perShelf, (i + 1) * perShelf);
            slice.forEach(w => shelfEl.appendChild(_makeSpine(w, bookH)));

            // 綁定移動端 Swipe 滑動手勢翻頁
            if (!shelfEl._swipeWired) {
                let touchStartX = 0;
                shelfEl.addEventListener('touchstart', (e) => {
                    touchStartX = e.changedTouches[0].screenX;
                }, { passive: true });
                
                shelfEl.addEventListener('touchend', (e) => {
                    let touchEndX = e.changedTouches[0].screenX;
                    if (touchStartX - touchEndX > 50) {
                        const nextBtn = document.getElementById('qb-page-next');
                        if (nextBtn && !nextBtn.disabled) { _currentPage++; render(); }
                    } else if (touchEndX - touchStartX > 50) {
                        const prevBtn = document.getElementById('qb-page-prev');
                        if (prevBtn && !prevBtn.disabled) { _currentPage--; render(); }
                    }
                }, { passive: true });
                
                shelfEl._swipeWired = true;
            }
        });

        // ＋ 新增按鈕
        if (_currentPage === totalPages - 1) {
            const addShelfIdx = Math.min(
                Math.floor(pageWorlds.length / perShelf),
                shelves.length - 1
            );
            shelves[addShelfIdx].appendChild(_makeAddSpine(bookH));
            window.OS_CARD_IMPORT?.injectImportSpine?.(shelves[addShelfIdx]);
        }

        // 翻頁導航箭頭狀態更新
        const nav      = document.getElementById('qb-shelf-nav');
        const label    = document.getElementById('qb-page-label');
        const prevBtn  = document.getElementById('qb-page-prev');
        const nextBtn  = document.getElementById('qb-page-next');
        
        if (nav) {
            if (totalPages > 1) {
                nav.style.display = 'flex';
                if (label)   label.textContent      = `${_currentPage + 1} / ${totalPages}`;
                if (prevBtn) prevBtn.disabled       = _currentPage === 0;
                if (nextBtn) nextBtn.disabled       = _currentPage === totalPages - 1;
                
                if (!nav._clickWired) {
                    nav._clickWired = true;
                    if (prevBtn) prevBtn.onclick = () => { if (_currentPage > 0) { _currentPage--; render(); } };
                    if (nextBtn) nextBtn.onclick = () => { if (_currentPage < totalPages - 1) { _currentPage++; render(); } };
                }
            } else {
                nav.style.display = 'none';
            }
        }
    }

    // ── 撰寫新書面板 ─────────────────────────────────────────────
    function openCreate() {
        const panel   = document.getElementById('qb-book-cover-panel');
        const shelves = _getShelves();
        const nav     = document.getElementById('qb-shelf-nav');
        if (!panel) return;

        panel.innerHTML = `
            <div style="position:absolute;inset:0;background:linear-gradient(160deg,#2a1a0e 0%,#1a0e06 100%);"></div>
            <div style="position:absolute;inset:0;background-image:repeating-linear-gradient(180deg,rgba(255,255,255,0.015) 0px,rgba(255,255,255,0.015) 1px,transparent 1px,transparent 20px);pointer-events:none;"></div>

            <button id="qb-create-back" style="position:absolute;top:12px;left:12px;background:rgba(0,0,0,0.4);backdrop-filter:blur(6px);border:1px solid var(--qbk-line);color:var(--qbk-ink);padding:6px 14px;border-radius:20px;cursor:pointer;font-size:12px;letter-spacing:1px;z-index:30;">返回書架</button>

            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px 28px 28px;z-index:2;gap:0;overflow-y:auto;">
                <div style="font-size:30px;margin-bottom:14px;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.8));">✒️</div>
                <div style="font-size:16px;font-weight:800;color:var(--qbk-ink);letter-spacing:2px;margin-bottom:6px;">撰寫新書</div>
                <div style="font-size:11px;color:var(--qbk-ink-dim);letter-spacing:1px;margin-bottom:18px;">描述你想前往的世界</div>

                <input id="qb-create-input" type="text" placeholder="例：蒸汽朋克工業帝國、末日後的海底城市…"
                    style="width:100%;background:rgba(0,0,0,0.5);border:1px solid var(--qbk-line);border-radius:4px;color:var(--qbk-ink);font-size:13px;padding:12px 14px;outline:none;text-align:center;letter-spacing:0.5px;font-family:'Noto Sans TC',sans-serif;">
                <div style="margin-top:6px;font-size:10px;color:var(--qbk-ink-faint);letter-spacing:0.5px;">按 Enter 或點下方按鈕送出</div>

                <div style="width:100%;margin-top:14px;">
                    <button id="qb-wb-toggle" style="
                        width:100%;background:rgba(0,0,0,0.3);
                        border:1px solid var(--qbk-line);
                        color:var(--qbk-ink);padding:8px 14px;
                        border-radius:4px;cursor:pointer;font-size:11px;
                        letter-spacing:1px;text-align:left;transition:border-color 0.2s;">
                        從世界書條目生成
                    </button>
                    <div id="qb-wb-list" style="
                        display:none;max-height:150px;overflow-y:auto;margin-top:4px;
                        background:rgba(0,0,0,0.35);border:1px solid var(--qbk-line);
                        border-radius:4px;padding:6px 10px;">
                        <div style="font-size:10px;color:rgba(255,255,255,0.3);text-align:center;padding:10px;">
                            載入中…
                        </div>
                    </div>
                    <div id="qb-wb-hint" style="display:none;margin-top:5px;font-size:10px;color:var(--qbk-ink-faint);text-align:center;">
                        已勾選的條目內容將提供給 AI 作為世界觀參考
                    </div>
                </div>

                <button id="qb-create-submit" class="qb-btn-primary">創建世界</button>
            </div>
        `;

        panel.style.display = 'block';
        shelves.forEach(s => s.style.display = 'none');
        if (nav) nav.style.display = 'none';

        const input    = panel.querySelector('#qb-create-input');
        const submit   = panel.querySelector('#qb-create-submit');
        const wbToggle = panel.querySelector('#qb-wb-toggle');
        const wbList   = panel.querySelector('#qb-wb-list');
        const wbHint   = panel.querySelector('#qb-wb-hint');

        let wbLoaded = false;
        wbToggle.onclick = async () => {
            const isOpen = wbList.style.display !== 'none';
            wbList.style.display = isOpen ? 'none' : 'block';
            wbHint.style.display = isOpen ? 'none' : 'block';
            wbToggle.textContent = `從世界書條目生成 ${isOpen ? '▼' : '▲'}`;
            wbToggle.style.borderColor = isOpen
                ? 'rgba(239,227,208,0.14)' : 'rgba(239,227,208,0.40)';

            if (!isOpen && !wbLoaded) {
                wbLoaded = true;
                try {
                    const entries = await window.OS_DB?.getAllWorldbookEntries?.() || [];
                    if (entries.length === 0) {
                        wbList.innerHTML = `<div style="font-size:11px;color:rgba(255,255,255,0.3);text-align:center;padding:12px;">世界書目前沒有條目</div>`;
                    } else {
                        wbList.innerHTML = entries.map(e => `
                            <label style="display:flex;align-items:flex-start;gap:8px;padding:5px 2px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);">
                                <input type="checkbox" data-id="${e.id}" data-content="${encodeURIComponent(e.content || '')}"
                                    style="margin-top:2px;accent-color:#d4af37;flex-shrink:0;">
                                <span style="font-size:11px;color:rgba(255,248,231,0.8);line-height:1.5;">
                                    <span style="color:#d4af37;">${e.title || '未命名'}</span>
                                    ${e.keys ? `<span style="color:rgba(255,255,255,0.3);font-size:10px;"> · ${e.keys.slice(0,30)}</span>` : ''}
                                </span>
                            </label>
                        `).join('');
                    }
                } catch(err) {
                    wbList.innerHTML = `<div style="font-size:11px;color:rgba(255,100,100,0.6);text-align:center;padding:12px;">載入失敗</div>`;
                }
            }
        };

        const getCheckedLore = () => {
            const checked = wbList.querySelectorAll('input[type=checkbox]:checked');
            if (!checked.length) return '';
            return Array.from(checked).map(cb => {
                const label   = cb.closest('label');
                const title   = label?.querySelector('span > span')?.textContent || '';
                const content = decodeURIComponent(cb.dataset.content || '');
                return `【${title}】\n${content}`;
            }).join('\n\n');
        };

        const doCreate = async () => {
            const keyword = input.value.trim();
            const lore    = getCheckedLore();
            if (!keyword && !lore) {
                input.focus();
                input.style.borderColor = 'rgba(255,100,100,0.6)';
                setTimeout(() => { input.style.borderColor = 'rgba(239,227,208,0.16)'; }, 1500);
                return;
            }
            if (window.QB_CORE && typeof window.QB_CORE.createCustomWorld === 'function') {
                submit.textContent = '撰寫中…';
                submit.disabled = true;
                await window.QB_CORE.createCustomWorld(keyword || lore.slice(0, 20), lore);
                panel.style.display = 'none';
                shelves.forEach(s => s.style.display = 'flex');
                render();
            } else {
                window.VoidTerminal?.playSequence?.(`[Char|瀅瀅|think|「哎呀，我的鋼筆好像沒水了 (QB_CORE 未連線)。」]`);
            }
        };

        input.onkeydown = (e) => { if (e.key === 'Enter') doCreate(); };
        submit.onclick  = doCreate;
        panel.querySelector('#qb-create-back').onclick = () => {
            panel.style.display = 'none';
            panel.innerHTML = '';
            shelves.forEach(s => s.style.display = 'flex');
            render();
        };
        setTimeout(() => input.focus(), 50);
    }

    // ── 自由書籍封面（獨立渲染路徑）──────────────────────────────
    function _openFreeScriptCover() {
        const panel   = document.getElementById('qb-book-cover-panel');
        const shelves = _getShelves();
        const nav     = document.getElementById('qb-shelf-nav');
        if (!panel) return;

        panel.innerHTML = `
            <div style="position:absolute;inset:0;background:linear-gradient(160deg,#0d0d1a,#111827,#0f1f40);"></div>
            <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 30% 40%,rgba(60,120,255,0.12),transparent 65%);"></div>

            <button id="qb-cover-back" style="
                position:absolute;top:12px;left:12px;
                background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);
                border:1px solid rgba(100,180,255,0.3);color:rgba(150,200,255,0.9);
                padding:6px 14px;border-radius:20px;cursor:pointer;
                font-size:12px;letter-spacing:1px;z-index:30;">返回書架</button>

            <div id="qb-cover-view" style="
                position:absolute;bottom:0;left:0;right:0;
                padding:20px 20px 32px;text-align:center;z-index:2;
                display:flex;flex-direction:column;align-items:center;">

                <div style="font-size:48px;margin-bottom:8px;filter:drop-shadow(0 2px 12px rgba(100,180,255,0.5));">✍️</div>
                <div style="font-size:24px;font-weight:900;color:rgba(150,210,255,0.95);
                            letter-spacing:3px;text-shadow:0 2px 16px rgba(0,0,0,0.9);
                            margin-bottom:6px;font-family:'Noto Sans TC',sans-serif;">自由劇情</div>
                <div style="font-size:12px;color:rgba(150,200,255,0.5);margin-bottom:24px;letter-spacing:1px;">
                    不限角色，自由輸入劇情指令
                </div>

                <button id="qb-free-open-inner-btn" class="qb-btn-primary">翻閱開場白</button>
            </div>

            <div id="qb-free-inner-view" style="
                display:none;position:absolute;inset:0;z-index:10;
                background:rgba(10,12,22,0.98);
                flex-direction:column;">

                <div style="padding:14px 18px;border-bottom:1px solid rgba(100,180,255,0.15);
                            display:flex;align-items:center;justify-content:space-between;
                            background:rgba(0,0,0,0.3);flex-shrink:0;">
                    <div style="font-size:13px;font-weight:bold;color:rgba(150,210,255,0.9);letter-spacing:1px;">
                        ✍️ 自由劇情 · 指令輸入
                    </div>
                    <button id="qb-free-inner-close" style="
                        background:none;border:none;color:rgba(150,200,255,0.5);
                        font-size:24px;cursor:pointer;line-height:1;padding:0 5px;"
                        onmouseover="this.style.color='rgba(150,200,255,0.9)'" onmouseout="this.style.color='rgba(150,200,255,0.5)'">×</button>
                </div>

                <div style="padding:14px 18px;border-bottom:1px solid rgba(100,180,255,0.1);flex-shrink:0;">
                    <div style="font-size:11px;color:rgba(150,200,255,0.4);letter-spacing:1px;margin-bottom:5px;">故事標題（可留空）</div>
                    <input id="qb-free-title-input" placeholder="例：廢土女傭兵" style="
                        width:100%;box-sizing:border-box;
                        background:rgba(0,0,0,0.45);border:1px solid rgba(100,180,255,0.2);
                        border-radius:6px;color:#e0f0ff;font-size:13px;
                        padding:8px 10px;outline:none;font-family:inherit;
                        transition:border-color 0.2s;"
                        onfocus="this.style.borderColor='rgba(100,180,255,0.5)'"
                        onblur="this.style.borderColor='rgba(100,180,255,0.2)'">
                    <div style="font-size:11px;color:rgba(150,200,255,0.4);letter-spacing:1px;margin:10px 0 5px;">劇情指令</div>
                    <textarea id="qb-free-request-input" rows="4" placeholder="直接描述你想要的開場情境、角色設定、世界觀…" style="
                        width:100%;box-sizing:border-box;
                        background:rgba(0,0,0,0.45);border:1px solid rgba(100,180,255,0.2);
                        border-radius:6px;color:#e0f0ff;font-size:13px;line-height:1.6;
                        padding:10px 12px;resize:none;font-family:inherit;outline:none;
                        transition:border-color 0.2s;scrollbar-width:none;"
                        onfocus="this.style.borderColor='rgba(100,180,255,0.5)'"
                        onblur="this.style.borderColor='rgba(100,180,255,0.2)'"></textarea>
                </div>

                <div style="flex:1;overflow-y:auto;padding:10px 18px;scrollbar-width:thin;scrollbar-color:#334 transparent;">
                    <!-- 📂 收藏：主動命名存下的開場白（跟舊「AI 生成劇情」面板同一份資料） -->
                    <div id="qb-free-presets-wrap" class="qbfp-wrap">
                        <div class="qbfp-hd">收藏的開場白<span id="qb-free-presets-count" class="qbfp-count"></span></div>
                        <div id="qb-free-presets-list" class="qbfp-list"></div>
                    </div>
                    <div style="font-size:10px;color:rgba(150,200,255,0.3);letter-spacing:2px;margin-bottom:8px;text-transform:uppercase;">過往開場</div>
                    <div id="qb-free-history-list" style="display:flex;flex-direction:column;gap:6px;"></div>
                </div>

                <div style="padding:12px 18px;border-top:1px solid rgba(100,180,255,0.15);flex-shrink:0;">
                    <button id="qb-free-dive-btn" class="qb-btn-primary cool block">踏入故事</button>
                </div>
            </div>
        `;

        panel.style.display = 'block';
        shelves.forEach(s => s.style.display = 'none');
        if (nav) nav.style.display = 'none';

        const coverView  = panel.querySelector('#qb-cover-view');
        const innerView  = panel.querySelector('#qb-free-inner-view');
        const titleInput = panel.querySelector('#qb-free-title-input');
        const reqInput   = panel.querySelector('#qb-free-request-input');

        // ── 開啟/關閉內頁 ───────────────────────────────────────
        panel.querySelector('#qb-free-open-inner-btn').onclick = () => {
            coverView.style.display = 'none';
            panel.querySelector('#qb-cover-back').style.display = 'none';
            innerView.style.display = 'flex';
            _renderPresets();
            _renderFreeHistory();
            setTimeout(() => reqInput?.focus(), 150);
        };
        panel.querySelector('#qb-free-inner-close').onclick = () => {
            innerView.style.display = 'none';
            coverView.style.display = 'flex';
            panel.querySelector('#qb-cover-back').style.display = 'block';
        };
        panel.querySelector('#qb-cover-back').onclick = () => {
            panel.style.display = 'none';
            shelves.forEach(s => s.style.display = 'flex');
            if (nav) nav.style.display = '';
        };

        // ── 收藏的開場白（主動命名存的，同名覆蓋）────────────────
        function _renderPresets() {
            const wrap = panel.querySelector('#qb-free-presets-wrap');
            const listEl = panel.querySelector('#qb-free-presets-list');
            const cntEl = panel.querySelector('#qb-free-presets-count');
            if (!wrap || !listEl) return;
            const list = _getPresets();
            wrap.classList.toggle('qbfp-none', !list.length);   // 一筆都沒有就整區收掉，不留空標題
            if (cntEl) cntEl.textContent = list.length ? '共 ' + list.length + ' 筆' : '';
            listEl.innerHTML = '';
            list.forEach((p) => {
                if (!p || !p.title) return;
                const chip = document.createElement('span');
                chip.className = 'qbfp-chip';
                chip.title = String(p.request || '').slice(0, 120);
                const nm = document.createElement('span');
                nm.className = 'qbfp-chip-nm';
                nm.textContent = p.title;                        // textContent：標題是使用者打的，不進 innerHTML
                const del = document.createElement('i');
                del.className = 'qbfp-chip-del';
                del.textContent = '✕';
                chip.appendChild(nm); chip.appendChild(del);
                chip.onclick = (ev) => {
                    if (ev.target === del) { _delPreset(p.title); _renderPresets(); return; }
                    if (titleInput) titleInput.value = p.title;
                    if (reqInput) { reqInput.value = p.request || ''; reqInput.focus(); }
                };
                listEl.appendChild(chip);
            });
        }

        // ── 歷史列表渲染 ──────────────────────────────────────────
        function _renderFreeHistory() {
            const listEl = panel.querySelector('#qb-free-history-list');
            if (!listEl) return;
            const hist = _getFreeHistory();
            if (!hist.length) {
                listEl.innerHTML = `<div style="font-size:12px;color:rgba(255,255,255,0.2);text-align:center;padding:12px;">尚無歷史紀錄</div>`;
                return;
            }
            listEl.innerHTML = hist.map(h => `
                <div class="qb-free-hist-item" data-id="${h.id}" style="
                    background:rgba(100,180,255,0.05);border:1px solid rgba(100,180,255,0.15);
                    border-radius:6px;padding:10px 12px;cursor:pointer;
                    transition:background 0.15s,border-color 0.15s;position:relative;"
                    onmouseover="this.style.background='rgba(100,180,255,0.1)';this.style.borderColor='rgba(100,180,255,0.3)'"
                    onmouseout="this.style.background='rgba(100,180,255,0.05)';this.style.borderColor='rgba(100,180,255,0.15)'">
                    ${h.title ? `<div style="font-size:11px;color:rgba(150,210,255,0.7);font-weight:bold;margin-bottom:4px;letter-spacing:1px;">${_escHtml(h.title)}</div>` : ''}
                    <div style="font-size:12px;color:rgba(220,235,255,0.75);line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${_escHtml(h.request || '')}</div>
                    <div style="font-size:10px;color:rgba(150,200,255,0.25);margin-top:4px;">${new Date(h.ts).toLocaleDateString('zh-TW')}</div>
                    <button class="qb-free-hist-del" data-id="${h.id}" style="
                        position:absolute;top:6px;right:6px;
                        background:rgba(180,30,30,0.5);border:none;color:rgba(255,180,180,0.7);
                        font-size:10px;width:18px;height:18px;border-radius:50%;
                        cursor:pointer;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;"
                        onclick="event.stopPropagation();">✕</button>
                </div>
            `).join('');

            listEl.querySelectorAll('.qb-free-hist-item').forEach(item => {
                item.onclick = () => {
                    const id = item.dataset.id;
                    const h  = _getFreeHistory().find(x => x.id === id);
                    if (!h) return;
                    if (titleInput) titleInput.value = h.title || '';
                    if (reqInput)   reqInput.value   = h.request || '';
                    reqInput?.focus();
                };
            });
            listEl.querySelectorAll('.qb-free-hist-del').forEach(btn => {
                btn.onclick = () => {
                    _deleteFreeHistory(btn.dataset.id);
                    _renderFreeHistory();
                };
            });
        }

        // ── 踏入故事 ──────────────────────────────────────────────
        panel.querySelector('#qb-free-dive-btn').onclick = () => {
            const title   = (titleInput?.value || '').trim();
            const request = (reqInput?.value || '').trim();
            if (!request) {
                reqInput.style.borderColor = 'rgba(255,100,100,0.6)';
                setTimeout(() => { reqInput.style.borderColor = 'rgba(100,180,255,0.2)'; }, 1500);
                reqInput?.focus();
                return;
            }

            _addFreeHistory(title, request);
            _savePreset(title, request);   // 有命名才會收藏，沒填就只進歷史

            // 清除舊世界書狀態
            localStorage.removeItem('vn_active_wb_packs');
            localStorage.removeItem('vn_current_world_id');
            // 自由劇情不屬於任何一本書，但一樣是一條新故事線 → 這裡就生 id
            try { window.VN_Core?.newStoryId?.(title || '自由劇情', ''); } catch(e) {}

            // 設置 pending，讓 VN 頁接收後自動生成
            window._pendingFreeScriptDive = { title, request };

            // 收起書架
            const overlay = document.getElementById('qb-bookshelf-overlay');
            if (overlay) overlay.style.display = 'none';
            panel.style.display = 'none';
            shelves.forEach(s => s.style.display = 'flex');
            if (nav) nav.style.display = '';

            // 切換到 VN 頁
            if (window.AureliaControlCenter?.switchPage) window.AureliaControlCenter.switchPage('nav-story');
        };
    }

    // ══════════════════════════════════════════════════════════════
    // 📇 篇章目錄 —— 一本書開過的故事線清單（＝酒館一張卡底下的那些聊天室）
    // ──────────────────────────────────────────────────────────────
    // 清單來源 vn_story_index（踏入時寫的 storyId → worldId / wbPacks / title / createdAt），
    // 章數與最後更新時間再從 OS_DB 章節補。索引裡有、章節數 0 的是「踏進去但沒生成成功」，
    // 照樣列出來也照樣切得過去 —— 那就是酒館的空聊天室。
    // ══════════════════════════════════════════════════════════════
    function _storyIndex() {
        try { return JSON.parse(localStorage.getItem('vn_story_index') || '{}') || {}; } catch (e) { return {}; }
    }

    async function _renderToc(w, panel) {
        const listEl = panel.querySelector('#qb-toc-list');
        if (!listEl) return;
        listEl.innerHTML = '<div class="qb-toc-empty">讀取中…</div>';

        const idx = _storyIndex();
        const mine = Object.keys(idx).filter(sid => (idx[sid] || {}).worldId === w.id);
        let chapters = [];
        try { chapters = (await window.OS_DB?.getAllVnChapters?.()) || []; } catch (e) {}
        const byStory = {};
        chapters.forEach(c => { if (c.storyId) (byStory[c.storyId] = byStory[c.storyId] || []).push(c); });

        const rows = mine.map(sid => {
            const meta = idx[sid] || {};
            const chs  = byStory[sid] || [];
            const last = chs.length ? Math.max(...chs.map(c => c.createdAt || 0)) : (meta.createdAt || 0);
            return { sid, title: meta.title || sid, n: chs.length, last };
        }).sort((a, b) => b.last - a.last);

        if (!rows.length) {
            listEl.innerHTML = '<div class="qb-toc-empty">這本書還沒有篇章</div>';
            return;
        }

        const cur = window.VN_Core?._currentStoryId || localStorage.getItem('vn_current_story_id') || '';
        listEl.innerHTML = '';
        rows.forEach(r => {
            const when = r.last ? new Date(r.last).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
            const row = document.createElement('div');
            row.className = 'qb-toc-item' + (r.sid === cur ? ' now' : '');
            row.innerHTML = `<div class="qb-toc-item-main">
                    <span class="qb-toc-item-t">${_escHtml(r.title)}</span>
                    <span class="qb-toc-item-m">${r.n ? r.n + ' 章' : '尚未開始'}${when ? '　' + when : ''}</span>
                    ${r.sid === cur ? '<span class="qb-toc-now">進行中</span>' : ''}
                </div>
                <button class="qb-toc-del" title="刪除這條篇章"><i class="fa-solid fa-trash"></i></button>`;
            row.querySelector('.qb-toc-item-main').onclick = () => _resumeStory(r, w, panel);
            row.querySelector('.qb-toc-del').onclick = async (ev) => {
                ev.stopPropagation();
                // 整條刪掉＝章節、記憶、人物檔案、追蹤數值全走；問清楚再動手
                if (!confirm(`刪除篇章「${r.title}」？

這條的章節、記憶、人物檔案與追蹤數值都會一起刪掉，救不回來。`)) return;
                try { await window.VN_Core?.deleteStoryLine?.(r.sid); }
                catch (e) { console.warn('[書架] 刪除篇章失敗:', e); alert('刪除失敗，請看 console'); return; }
                await _renderToc(w, panel);
            };
            listEl.appendChild(row);
        });
    }

    // 接著玩某一條：切分艙鑰匙 → 把那條當初掛的書與世界書帶回來 → 載入最新一章開播
    async function _resumeStory(r, w, panel) {
        try {
            const meta = _storyIndex()[r.sid] || {};
            window.VN_Core?._setStoryId?.(r.sid, r.title);
            if (meta.worldId) { try { localStorage.setItem('vn_current_world_id', meta.worldId); } catch (e) {} }
            if (Array.isArray(meta.wbPacks)) { try { localStorage.setItem('vn_active_wb_packs', JSON.stringify(meta.wbPacks)); } catch (e) {} }
            try { await window.VN_FREE_MODE?.applyForCurrent?.(true); } catch (e) {}
            try { window.AureliaControlCenter?.setChatTitle?.(r.title); } catch (e) {}

            let chs = [];
            try { chs = ((await window.OS_DB?.getAllVnChapters?.()) || []).filter(c => c.storyId === r.sid); } catch (e) {}
            chs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

            // 空篇章（踏進去沒生成成功）→ 只切過去，讓她從「創建新篇章」重來
            if (!chs.length) {
                await _renderToc(w, panel);
                console.log(`[書架] 已切到「${r.title}」，這條還沒有章節`);
                return;
            }

            const overlay = document.getElementById('qb-bookshelf-overlay');
            if (overlay) overlay.style.display = 'none';
            panel.style.display = 'none';
            _getShelves().forEach(s => s.style.display = 'flex');

            window._lobbyPendingChapter = chs[chs.length - 1];
            if (window.AureliaControlCenter?.showVnPanel) window.AureliaControlCenter.showVnPanel('autoload');
        } catch (e) {
            console.warn('[書架] 切換篇章失敗:', e);
        }
    }

    // ── 書封面與內頁展開面板 (雙層結構 + 滑動卡片) ────────────────────────
    function openCover(w) {
        const panel = document.getElementById('qb-book-cover-panel');
        const shelves = _getShelves();
        const nav = document.getElementById('qb-shelf-nav');
        if (!panel) return;

        // 自由書籍走獨立路徑
        if (w.isFreeScript) { _openFreeScriptCover(); return; }

        const dangerFill  = '▮'.repeat(w.danger || 0);
        const dangerEmpty = '▯'.repeat(Math.max(0, 5 - (w.danger || 0)));

        // 角色卡：有開場白列表
        const greetings = (w.cardImport && Array.isArray(w.greetings) && w.greetings.length)
            ? w.greetings : null;
        const isCard    = !!greetings;

        // 🔥 動態獲取面板中最新切換的人設名字 (UI 防汙染蒙版核心)
        const currentUserName = window.OS_PERSONA?.getName ? window.OS_PERSONA.getName() : 'User';

        panel.innerHTML = `
            <div style="position:absolute;inset:0;background:url('${w.cover}') center/cover;"></div>
            <div style="position:absolute;inset:0;background:linear-gradient(180deg,
                rgba(0,0,0,0.28) 0%,rgba(0,0,0,0.05) 25%,
                rgba(0,0,0,0.65) 55%,rgba(0,0,0,0.97) 100%);"></div>

            <button id="qb-cover-back" style="
                position:absolute;top:12px;left:12px;
                background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);
                border:1px solid var(--qbk-line);color:var(--qbk-ink);
                padding:6px 14px;border-radius:20px;cursor:pointer;
                font-size:12px;letter-spacing:1px;z-index:30;">返回書架</button>

            <div id="qb-cover-view" style="
                position:absolute;bottom:0;left:0;right:0;
                padding:20px 20px 32px;text-align:center;z-index:2;
                display:flex;flex-direction:column;align-items:center;">
                
                <div style="font-size:40px;margin-bottom:4px;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.8));">${w.icon}</div>
                <div style="font-size:24px;font-weight:900;color:var(--qbk-ink);
                            letter-spacing:3px;text-shadow:0 2px 16px rgba(0,0,0,0.9);
                            margin-bottom:14px;font-family:'Noto Sans TC',sans-serif;line-height:1.3;">${w.title}</div>
                
                ${!isCard ? `
                <div style="font-size:13px;color:rgba(255,242,210,0.88);line-height:2;font-style:italic;
                            text-shadow:0 1px 6px rgba(0,0,0,1);margin-bottom:18px;">${_escHtml(w.desc || '')}</div>
                <div style="color:rgba(229,62,62,0.85);font-size:11px;letter-spacing:2px;margin-bottom:16px;
                            text-shadow:0 0 6px rgba(0,0,0,0.8);">
                    危&ensp;險&ensp;度 &nbsp;${dangerFill}<span style="opacity:0.3;">${dangerEmpty}</span>
                </div>
                ` : `
                <div style="font-size:12px;color:var(--qbk-ink);margin-bottom:16px;letter-spacing:1px;">
                    收錄 ${greetings.length} 條開場白記憶
                </div>
                `}

                <div id="qb-wb-pack-slot" style="
                    width: 100%; margin-bottom: 24px;
                    display: flex; flex-direction: column; align-items: center; gap: 8px;">
                    <div style="display:flex; align-items:center; gap:8px; width:75%;">
                        <div style="flex:1; height:1px; background:linear-gradient(90deg, transparent, rgba(239,227,208,0.16));"></div>
                        <span style="font-size:10px; color:var(--qbk-ink-dim); letter-spacing:3px; text-shadow:0 1px 2px #000; font-weight:bold;">擴充館藏</span>
                        <div style="flex:1; height:1px; background:linear-gradient(270deg, transparent, rgba(239,227,208,0.16));"></div>
                    </div>
                    <div style="display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:6px; width:100%;">
                        <div id="qb-wb-pack-tags" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;"></div>
                        <select id="qb-wb-pack-add" style="
                            background:rgba(0,0,0,0.4); border:1px dashed var(--qbk-line);
                            border-radius:12px; color:var(--qbk-ink-dim); font-size:10px;
                            padding:3px 8px; outline:none; font-family:inherit; cursor:pointer; text-align:center;
                            transition:all 0.2s;">
                            <option value="">掛載</option>
                        </select>
                    </div>
                </div>

                <div id="qb-sprite-mode-row" class="qb-spmode-row">
                    <span class="qb-spmode-label">立繪</span>
                    <button class="qb-spmode-btn" data-free="0">圖庫</button>
                    <button class="qb-spmode-btn" data-free="1">自由</button>
                </div>

                <div style="display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;">
                    <button id="qb-toc-open-btn" class="qb-btn-primary">${isCard ? '翻閱開場白' : '踏入故事'}</button>
                    ${w.custom ? `<button class="qb-remove-world-btn qb-btn-danger" data-wid="${w.id}">下架</button>` : ''}
                </div>
            </div>

            <!-- 📇 篇章目錄：這本書開過幾條故事線（＝酒館的聊天室列表）。
                 一律先經過這一層，跟酒館「選卡片先看到聊天室清單」同一個心智模型。
                 「創建新篇章」那一格放的就是原本封面上的那顆鈕(id/class 都沒動)，
                 所以既有的開場白內頁與 dive 綁定完全不用改。 -->
            <div id="qb-toc-view" style="
                display:none;position:absolute;inset:0;z-index:9;
                background:rgba(20,12,8,0.98);
                flex-direction:column;animation:panelSlideIn 0.25s ease-out;">
                <div style="padding:16px 20px;border-bottom:1px solid var(--qbk-line);
                            display:flex;align-items:center;justify-content:space-between;
                            background:rgba(0,0,0,0.3);flex-shrink:0;">
                    <div style="font-size:14px;font-weight:bold;color:var(--qbk-ink);letter-spacing:1px;">${_escHtml(w.title)}</div>
                    <button id="qb-toc-close" style="background:none;border:none;color:var(--qbk-ink-dim);font-size:13px;letter-spacing:1px;cursor:pointer;line-height:1;padding:4px 2px;">‹ 返回</button>
                </div>
                <div class="qb-toc-body" id="qb-toc-body">
                    <div class="qb-toc-new">
                        ${isCard
                            ? `<button id="qb-open-inner-btn" class="qb-btn-primary block">創建新篇章</button>`
                            : `<button class="qb-dive-world-btn qb-btn-primary block" data-wid="${w.id}">創建新篇章</button>`}
                    </div>
                    <div class="qb-toc-label">歷史篇章</div>
                    <div id="qb-toc-list"></div>
                </div>
            </div>

            ${isCard ? `
            <div id="qb-inner-view" style="
                display:none;position:absolute;inset:0;z-index:10;
                background:rgba(20,12,8,0.98);
                flex-direction:column;animation:panelSlideIn 0.25s ease-out;">
                
                <!-- 標題列不寫「選擇開場白：《書名》」：都點進這本書了，不必再報一次是誰的開場白。
                     返回擺左邊，跟啟程幕同一個位置。 -->
                <div style="padding:10px 16px;border-bottom:1px solid var(--qbk-line);
                            display:flex;align-items:center;justify-content:space-between;
                            background:rgba(0,0,0,0.3);flex-shrink:0;">
                    <button id="qb-inner-close" style="
                        background:none;border:none;color:var(--qbk-ink-dim);
                        font-size:13px;letter-spacing:1px;cursor:pointer;line-height:1;padding:4px 2px;">‹ 返回</button>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <button id="qb-greet-beautify-btn" class="qb-btn-ghost qb-hidden" title="這張卡自帶的美化面板">美化</button>
                        <button id="qb-greet-replace-btn" class="qb-btn-ghost" title="文字取代">取代</button>
                    </div>
                </div>

                <!-- 批量取代：獨立 modal（原本是內嵌展開，一開就把正文擠掉，
                     那一列三個欄位並排在手機寬度直接爆出畫面外）-->
                <div id="qb-greet-replace-panel" style="display:none;position:absolute;inset:0;z-index:30;background:rgba(0,0,0,0.72);align-items:center;justify-content:center;padding:18px;box-sizing:border-box;">
                    <div id="qb-greet-replace-box" style="width:100%;max-width:340px;max-height:92%;overflow-y:auto;box-sizing:border-box;background:#1e1208;border:1px solid var(--qbk-line);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 18px 44px rgba(0,0,0,0.7);">
                        <div style="display:flex;align-items:center;justify-content:space-between;">
                            <div style="font-size:13px;font-weight:bold;color:var(--qbk-ink);letter-spacing:1px;">全部開場白批量取代</div>
                            <button id="qb-greet-replace-close" style="background:none;border:none;color:var(--qbk-ink-dim);font-size:20px;line-height:1;cursor:pointer;padding:0 2px;">×</button>
                        </div>
                        <input id="qb-greet-find" placeholder="搜尋文字…" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.5);border:1px solid var(--qbk-line);border-radius:6px;color:var(--qbk-ink);padding:9px 10px;font-size:13px;outline:none;font-family:inherit;">
                        <div style="text-align:center;color:var(--qbk-ink-faint);font-size:13px;line-height:1;">↓</div>
                        <input id="qb-greet-repl" placeholder="替換為…（留空＝刪掉這段字）" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.5);border:1px solid var(--qbk-line);border-radius:6px;color:var(--qbk-ink);padding:9px 10px;font-size:13px;outline:none;font-family:inherit;">
                        <button id="qb-greet-replace-do" class="qb-btn-primary" style="width:100%;">取代全部</button>
                        <div id="qb-greet-replace-msg" style="font-size:12px;color:rgba(150,220,130,0.8);min-height:16px;text-align:center;"></div>
                        <div id="qb-greet-saved-rules" style="display:none;border-top:1px solid var(--qbk-line);padding-top:12px;flex-direction:column;gap:8px;">
                            <div style="font-size:11px;color:var(--qbk-ink-faint);letter-spacing:1px;">已儲存規則（點擊套用）</div>
                            <div id="qb-greet-rules-list" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
                        </div>
                    </div>
                </div>
                
                <div id="qb-greeting-slider" style="flex:1; overflow:hidden; position:relative; width:100%; display:flex; flex-direction:column;">
                    <div id="qb-greeting-track" style="display:flex; width:100%; height:100%; transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);">
                        
                        ${greetings.map((g, i) => `
                            <div class="qb-greet-slide" data-greet-idx="${i}" style="flex: 0 0 100%; max-width: 100%; box-sizing: border-box; padding: 10px 12px; display:flex; flex-direction:column; overflow-y:auto; scrollbar-width:none;">
                                <div style="border:1px solid var(--qbk-line); background:rgba(0,0,0,0.5); border-radius:10px; padding:14px 16px; flex:1; display:flex; flex-direction:column;">
                                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;border-bottom:1px solid var(--qbk-line);padding-bottom:8px;">
                                        <span style="font-size:14px;color:var(--qbk-ink);letter-spacing:2px;font-weight:bold;">
                                            開場白 ${i + 1}
                                        </span>
                                        <div style="display:flex;align-items:center;gap:6px;">
                                            <button class="qb-greet-edit-btn qb-btn-ghost" data-idx="${i}" title="編輯此開場白">編輯</button>
                                            <input type="radio" name="qb-greeting" value="${i}" ${i === 0 ? 'checked' : ''} style="display:none;">
                                        </div>
                                    </div>
                                    <div class="qb-greet-text" data-idx="${i}" style="font-size:14px;color:rgba(255,248,231,0.88);line-height:1.8;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;">
                                        ${_escHtml(g).replace(/\{\{\s*user\s*\}\}/gi, currentUserName).replace(/\{\{\s*char\s*\}\}/gi, w.title)}
                                    </div>
                                    <textarea class="qb-greet-editor" data-idx="${i}" style="display:none;flex:1;min-height:200px;background:rgba(0,0,0,0.6);border:1px solid var(--qbk-line);border-radius:6px;color:var(--qbk-ink);font-size:13px;line-height:1.8;padding:12px;resize:vertical;font-family:inherit;outline:none;"></textarea>
                                    <div class="qb-greet-save-row" data-idx="${i}" style="display:none;justify-content:flex-end;gap:8px;margin-top:10px;">
                                        <button class="qb-greet-cancel-btn qb-btn-ghost" data-idx="${i}">取消</button>
                                        <button class="qb-greet-save-btn qb-btn-ghost" data-idx="${i}">儲存</button>
                                    </div>
                                    <div class="qb-greet-go-row">
                                        <button class="qb-goto-embark-btn qb-btn-primary block" data-idx="${i}" data-wid="${w.id}">與TA相遇</button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                        
                        <div class="qb-greet-slide" style="flex: 0 0 100%; max-width: 100%; box-sizing: border-box; padding: 10px 12px; display:flex; flex-direction:column; overflow-y:auto; scrollbar-width:none;">
                            <div style="border:1px solid rgba(100,160,255,0.3); background:rgba(20,45,100,0.4); border-radius:10px; padding:20px; flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                                <input type="radio" name="qb-greeting" value="-1" style="display:none;">
                                <div style="font-size:48px; margin-bottom:20px; filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5));">🎲</div>
                                <span style="font-size:18px;color:rgba(150,200,255,0.9);font-weight:bold;letter-spacing:3px;">讓 AI 自由發揮</span>
                                <div style="font-size:13px;color:rgba(150,200,255,0.6);margin-top:12px;text-align:center;line-height:1.6;">無預設開場故事<br>直接踏入這個世界的未知領域</div>
                                <div class="qb-greet-go-row">
                                    <button class="qb-goto-embark-btn qb-btn-primary block" data-idx="-1" data-wid="${w.id}">與TA相遇</button>
                                </div>
                            </div>
                        </div>

                    </div>
                    
                </div>

                <div style="padding:10px 16px 14px;border-top:1px solid var(--qbk-line);
                            background:rgba(0,0,0,0.4);flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:10px;">
                    
                    <div style="display:flex;align-items:center;justify-content:center;gap:14px;width:100%;">
                    <button id="qb-greet-prev-btn" style="flex-shrink:0;background:rgba(0,0,0,0.5);border:1px solid var(--qbk-line);color:var(--qbk-ink);width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;padding:0;">◀</button>
                    <div id="qb-greet-dots" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;max-width:70%;">
                        ${greetings.map((_, i) => `<div class="qb-greet-dot" data-idx="${i}" style="width:8px;height:8px;border-radius:50%;background:#1A1C28;opacity:${i===0?'1':'0.3'};cursor:pointer;transition:all 0.2s;"></div>`).join('')}
                        <div class="qb-greet-dot" data-idx="${greetings.length}" style="width:8px;height:8px;border-radius:50%;background:#4a9eff;opacity:0.3;cursor:pointer;transition:all 0.2s;"></div>
                    </div>
                    <button id="qb-greet-next-btn" style="flex-shrink:0;background:rgba(0,0,0,0.5);border:1px solid var(--qbk-line);color:var(--qbk-ink);width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;padding:0;">▶</button>
                    </div>
                </div>

                <!-- ✍️ 啟程：第一句回應自己一幕（跟酒館版同一個心智模型），不再跟開場白擠在同一頁 -->
                <div id="qb-embark-view" style="display:none;position:absolute;inset:0;z-index:25;background:rgba(20,12,8,0.98);flex-direction:column;">
                    <div style="padding:10px 16px;border-bottom:1px solid var(--qbk-line);display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.3);flex-shrink:0;">
                        <button id="qb-embark-back" style="background:none;border:none;color:var(--qbk-ink-dim);font-size:13px;letter-spacing:1px;cursor:pointer;line-height:1;padding:4px 2px;">‹ 返回</button>
                        <div style="font-size:13px;font-weight:bold;color:var(--qbk-ink);letter-spacing:3px;">啟程</div>
                        <span style="width:44px;"></span>
                    </div>
                    <div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;padding:14px 16px;box-sizing:border-box;">
                        <div style="font-size:12px;color:var(--qbk-ink-dim);letter-spacing:1px;text-align:center;">寫下你踏入故事的第一步——行動、對白或心聲都可以，也可以留空</div>
                        <textarea id="qb-user-reply" placeholder="在這裡寫下你的第一句…" style="
                            flex:1;min-height:0;width:100%;box-sizing:border-box;
                            background:rgba(0,0,0,0.45);border:1px solid var(--qbk-line);
                            border-radius:8px;color:var(--qbk-ink);font-size:14px;line-height:1.8;
                            padding:12px 14px;resize:none;font-family:inherit;outline:none;
                            scrollbar-width:none;"></textarea>
                    </div>
                    <div style="padding:0 16px 16px;flex-shrink:0;">
                        <button class="qb-dive-world-btn qb-btn-primary block" data-wid="${w.id}">與TA相遇</button>
                    </div>
                </div>
            </div>
            ` : ''}
        `;

        panel.style.display = 'block';
        shelves.forEach(s => s.style.display = 'none');
        if (nav) nav.style.display = 'none';

        // ── 📚 擴充館藏插槽 初始化 ───────────────────────────────
        if (!Array.isArray(w.wbPacks)) {
            w.wbPacks = w.cardImport ? [w.title] : [];
        }

        function _saveWbPacks() {
            const idx = (window.AURELIA_CUSTOM_WORLDS || []).findIndex(x => x.id === w.id);
            if (idx !== -1) {
                window.AURELIA_CUSTOM_WORLDS[idx].wbPacks = w.wbPacks;
                try { localStorage.setItem('aurelia_custom_worlds', JSON.stringify(window.AURELIA_CUSTOM_WORLDS)); } catch(e) {}
            }
        }

        function _renderPackTags() {
            const tagsEl = panel.querySelector('#qb-wb-pack-tags');
            if (!tagsEl) return;
            tagsEl.innerHTML = '';
            (w.wbPacks || []).forEach(pack => {
                const chip = document.createElement('div');
                // 美化：輕量化的半透明小標籤
                chip.style.cssText = `display:inline-flex;align-items:center;gap:4px;
                    background:rgba(239,227,208,0.07);border:1px solid var(--qbk-line);
                    border-radius:12px;padding:3px 10px;font-size:10px;
                    color:var(--qbk-ink);backdrop-filter:blur(2px);`;
                chip.innerHTML = `<span>${_escHtml(pack)}</span>
                    <span style="cursor:pointer;opacity:0.6;font-size:12px;line-height:1;margin-left:2px;"
                          class="wb-chip-remove" data-pack="${_escHtml(pack)}">×</span>`;
                chip.querySelector('.wb-chip-remove').onclick = () => {
                    w.wbPacks = w.wbPacks.filter(p => p !== pack);
                    _saveWbPacks();
                    _renderPackTags();
                    _populatePackSelect();
                };
                tagsEl.appendChild(chip);
            });
            if (!w.wbPacks.length) {
                tagsEl.innerHTML = `<span style="font-size:10px;color:rgba(255,255,255,0.2);font-style:italic;">
                    （尚無掛載館藏）</span>`;
            }
        }

        function _populatePackSelect() {
            const sel = panel.querySelector('#qb-wb-pack-add');
            if (!sel) return;
            sel.innerHTML = '<option value="">掛載</option>';
            const allPacks  = window.OS_WORLDBOOK?.getAvailablePacks?.() || [];
            const available = allPacks.filter(p => !(w.wbPacks || []).includes(p));
            available.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                sel.appendChild(opt);
            });
            if (!available.length) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.disabled = true;
                opt.textContent = '（無其他可掛載）';
                sel.appendChild(opt);
            }
        }

        function _packSelectChange() {
            const sel = panel.querySelector('#qb-wb-pack-add');
            if (!sel || !sel.value) return;
            const pack = sel.value;
            if (!w.wbPacks.includes(pack)) {
                w.wbPacks.push(pack);
                _saveWbPacks();
                _renderPackTags();
                _populatePackSelect();
            }
            sel.value = '';
        }

        _renderPackTags();
        _populatePackSelect();
        const _packSel = panel.querySelector('#qb-wb-pack-add');
        if (_packSel) _packSel.onchange = _packSelectChange;

        // ── 立繪模式（圖庫／自由）──────────────────────────────
        //   酒館那邊這組在藏書開場白提取器裡，PWA 的藏書長得不一樣、一直沒有地方放 →
        //   放在這本書的設定列（跟擴充館藏、變數包同一區）。按書記（w.id），不是按開場白記，
        //   所以同一本書開新故事不用重選。只在獨立版顯示，免得跟酒館那組變成兩個入口。
        (function _initSpriteMode() {
            const row = panel.querySelector('#qb-sprite-mode-row');
            if (!row) return;
            const FM = window.VN_FREE_MODE;
            const standalone = window.OS_API?.isStandalone?.() ?? false;
            if (!FM || !standalone) { row.style.display = 'none'; return; }
            const btns = row.querySelectorAll('.qb-spmode-btn');
            const paint = () => {
                const free = FM.isFree(w.id);
                btns.forEach(b => b.classList.toggle('on', (b.dataset.free === '1') === free));
            };
            btns.forEach(b => {
                b.title = b.dataset.free === '1'
                    ? '角色是隨機/新登場的：立繪直接生成，AI 不用每句寫表情，省字'
                    : '這本有準備好的表情圖庫：照舊用圖庫的表情立繪';
                b.onclick = async () => {
                    await FM.set(b.dataset.free === '1', w.id);
                    paint();
                };
            });
            paint();
        })();


        // ── 開場白儲存輔助 ────────────────────────────────────────────
        function _saveGreetings() {
            const idx = (window.AURELIA_CUSTOM_WORLDS || []).findIndex(x => x.id === w.id);
            if (idx !== -1) {
                window.AURELIA_CUSTOM_WORLDS[idx].greetings = w.greetings;
                try { localStorage.setItem('aurelia_custom_worlds', JSON.stringify(window.AURELIA_CUSTOM_WORLDS)); } catch(e) {}
            }
        }

        // ── 📇 篇章目錄（兩種書共用）───────────────────────────────
        (function _initToc() {
            const tocView  = panel.querySelector('#qb-toc-view');
            const coverView= panel.querySelector('#qb-cover-view');
            const coverBack= panel.querySelector('#qb-cover-back');
            const openBtn  = panel.querySelector('#qb-toc-open-btn');
            if (!tocView || !openBtn) return;

            const _shelfWin = () => document.getElementById('qb-bookshelf-overlay');
            const showToc = async () => {
                coverView.style.display = 'none';
                if (coverBack) coverBack.style.display = 'none';
                tocView.style.display = 'flex';
                _shelfWin()?.classList.add('qb-reading');    // 滿版+藏木框標題列:整層只留一顆返回
                await _renderToc(w, panel);
            };
            const hideToc = () => {
                tocView.style.display = 'none';
                _shelfWin()?.classList.remove('qb-reading');
                coverView.style.display = 'flex';
                if (coverBack) coverBack.style.display = 'block';
            };
            openBtn.onclick = showToc;
            panel.querySelector('#qb-toc-close').onclick = hideToc;
            panel._qbHideToc = hideToc;   // 開場白內頁關閉時要退回目錄，不是退回封面
        })();

        // ── 視圖切換與滑動卡片邏輯 (角色卡專屬) ───────────────────────
        if (isCard) {
            const coverView = panel.querySelector('#qb-cover-view');
            const innerView = panel.querySelector('#qb-inner-view');
            const coverBack = panel.querySelector('#qb-cover-back');
            const tocView   = panel.querySelector('#qb-toc-view');

            // 開啟內頁（現在是從目錄的「創建新篇章」進來）
            // 「與TA相遇」→ 先進啟程幕寫第一句（真正 dive 的是啟程幕裡那顆，走既有 qb-dive-world-btn）
            const embarkView = panel.querySelector('#qb-embark-view');
            const gotoEmbarkBtns = panel.querySelectorAll('.qb-goto-embark-btn');
            if (embarkView && gotoEmbarkBtns.length) {
                gotoEmbarkBtns.forEach(btn => {
                    btn.onclick = () => {
                        // 按鈕現在跟在每一張開場白的內容末尾 → 按哪一張就選哪一張，
                        //   不再靠「當前這張剛好是選取的那張」這個隱性前提。
                        const v = String(btn.dataset.idx);
                        const radio = panel.querySelector('input[name="qb-greeting"][value="' + v + '"]');
                        if (radio) radio.checked = true;
                        if (panel._qbLeaveGreetings) panel._qbLeaveGreetings();   // 寫第一句時背後不該還有卡片 BGM 在響
                        embarkView.style.display = 'flex';
                        setTimeout(() => { try { panel.querySelector('#qb-user-reply')?.focus(); } catch (e) { } }, 40);
                    };
                });
                panel.querySelector('#qb-embark-back').onclick = () => { embarkView.style.display = 'none'; };
            }

            // 讀開場白時整個書架窗滿版、木框標題列退場（內容被上下兩層殼夾成一小條，看不下去）
            const _reading = (on) => {
                try { document.getElementById('qb-bookshelf-overlay')?.classList.toggle('qb-reading', !!on); } catch (e) { }
            };

            panel.querySelector('#qb-open-inner-btn').onclick = () => {
                if (tocView) tocView.style.display = 'none';
                coverView.style.display = 'none';
                coverBack.style.display = 'none';
                innerView.style.display = 'flex';
                _reading(true);
                updateSlider(); // 初始化顯示第一張
            };

            // 關閉內頁 → 退回目錄那一層（從哪裡進來就退回哪裡）
            panel.querySelector('#qb-inner-close').onclick = () => {
                if (panel._qbLeaveGreetings) panel._qbLeaveGreetings();
                innerView.style.display = 'none';
                // 退回目錄：目錄現在也是滿版，滿版態要留著；只有退到書封才收回木框書架窗
                if (tocView) { tocView.style.display = 'flex'; }
                else { _reading(false); coverView.style.display = 'flex'; coverBack.style.display = 'block'; }
            };

            // 滑動核心邏輯
            const track = panel.querySelector('#qb-greeting-track');
            const slides = panel.querySelectorAll('.qb-greet-slide');
            const dots = panel.querySelectorAll('.qb-greet-dot');
            const prevBtn = panel.querySelector('#qb-greet-prev-btn');
            const nextBtn = panel.querySelector('#qb-greet-next-btn');
            const totalSlides = slides.length;
            let currentSlide = 0;

            function updateSlider() {
                // 平滑推動軌道
                track.style.transform = `translateX(-${currentSlide * 100}%)`;

                // 更新內部隱藏的 radio (為了最後點擊「與TA相遇」能讀取正確值)
                slides.forEach((s, i) => {
                    const radio = s.querySelector('input[type="radio"]');
                    if (radio) radio.checked = (i === currentSlide);
                });

                // 更新底部小圓點
                dots.forEach((d, i) => {
                    d.style.opacity = (i === currentSlide) ? '1' : '0.3';
                    d.style.transform = (i === currentSlide) ? 'scale(1.3)' : 'scale(1)';
                });

                // 控制左右按鈕的顯示 (非觸控裝置輔助)
                // 移到底部圓點列兩端後改用 visibility:位置留著,列才不會隨著到頭/到尾左右跳
                if (prevBtn) prevBtn.style.visibility = (currentSlide === 0) ? 'hidden' : 'visible';
                if (nextBtn) nextBtn.style.visibility = (currentSlide === totalSlides - 1) ? 'hidden' : 'visible';

                // 翻到的這一張才做美化（函式在下面宣告，updateSlider 只在使用者操作時才跑得到）
                try { _renderSlideText(currentSlide); } catch (e) {}
            }

            // ── 卡片自帶的美化面板：只做「現在這一張」──────────────────────
            //   一張卡動輒十幾則開場白，每個面板都是一份完整 HTML 文件(iframe)；
            //   全部一次渲染會直接把手機拖死，所以跟著 updateSlider 走，翻到哪張才做哪張。
            const _CR = window.OS_CARD_REGEX || (window.parent && window.parent.OS_CARD_REGEX);
            const beautifyBtn = panel.querySelector('#qb-greet-beautify-btn');
            let _beautifyOn = false;
            const _greetRaw = (i) => String(w.greetings[i] || '')
                .replace(/\{\{\s*user\s*\}\}/gi, currentUserName)
                .replace(/\{\{\s*char\s*\}\}/gi, w.title);
            // 面板是整份 HTML 文件，塞進 iframe 後沒有高度可言 → 交給共用那支撐高
            //   （它會順手把收起來的 <details> 展開、並盯著內容變動重量，見 os_card_regex.fitCardFrames）
            function _fitCardFrames(root) {
                if (_CR && _CR.fitCardFrames) _CR.fitCardFrames(root);
            }
            // 🔇 卡片的音樂面板會自己播：只要不是「現在正在看的那一張」，一律拆成純文字。
            //   iframe 從 DOM 移掉＝它的 document 連同 <audio> 一起銷毀，這是唯一保證停得掉的做法
            //   （只 pause 擋不住腳本抓完網址後才呼叫的 .play()）。
            function _teardownSlides(keepIdx) {
                panel.querySelectorAll('.qb-greet-slide').forEach(slide => {
                    const i = parseInt(slide.dataset.greetIdx, 10);
                    if (i === keepIdx) return;
                    const td = slide.querySelector('.qb-greet-text');
                    if (!td || !td.querySelector('iframe, audio, video')) return;   // 已經是純文字就別重畫
                    if (_CR && _CR.stopMedia) _CR.stopMedia(td, true);
                    td.innerHTML = _escHtml(_greetRaw(i));
                });
            }
            // 離開開場白這一頁（返回／進啟程幕／踏進故事）→ 全部拆光，不留任何還在響的面板
            function _leaveGreetings() {
                try { _teardownSlides(-1); } catch (e) {}
            }
            panel._qbLeaveGreetings = _leaveGreetings;   // 給同檔其它路徑（踏入故事那顆按鈕）叫，同 panel._qbHideToc 的做法

            function _renderSlideText(i) {
                const slide = panel.querySelector(`.qb-greet-slide[data-greet-idx="${i}"]`);
                const textDiv = slide && slide.querySelector('.qb-greet-text');
                if (!textDiv) return;
                _teardownSlides(i);   // 先把別張拆乾淨，再畫這一張
                if (_CR && _CR.stopMedia) _CR.stopMedia(textDiv, false);   // 這一張自己的舊面板先閉嘴
                const raw = _greetRaw(i);
                if (_beautifyOn && _CR) {
                    try {
                        const html = _CR.renderRichHtml(raw, _escHtml, w.id);
                        if (html) { textDiv.innerHTML = html; _fitCardFrames(textDiv); return; }
                    } catch (e) { console.warn('[書架] 開場白美化失敗，退回原文', e); }
                }
                textDiv.innerHTML = _escHtml(raw);
            }
            function _syncBeautifyBtn() {
                if (!beautifyBtn) return;
                beautifyBtn.textContent = _beautifyOn ? '美化' : '原文';
                beautifyBtn.classList.toggle('qb-btn-on', _beautifyOn);
            }
            if (_CR && beautifyBtn) {
                _CR.getPack(w.id).then(pack => {
                    if (!pack || !Array.isArray(pack.scripts) || !pack.scripts.length) return;   // 這張卡沒帶正則＝按鈕不出現
                    beautifyBtn.classList.remove('qb-hidden');
                    _beautifyOn = pack.enabled !== false;
                    _syncBeautifyBtn();
                    // 🚨 只有「開場白那一頁真的開著」才畫。這支是非同步回來的，
                    //    在書封就畫下去＝人還在看封面，卡片的音樂面板已經在背景響了。
                    if (innerView && innerView.style.display !== 'none') _renderSlideText(currentSlide);
                }).catch(() => {});
                beautifyBtn.onclick = async () => {
                    _beautifyOn = !_beautifyOn;
                    _syncBeautifyBtn();
                    // 這個開關同時決定劇情播放時要不要套（就是這本書的正則總開關），所以寫回正則庫
                    try { await _CR.setEnabled(w.id, _beautifyOn); } catch (e) {}
                    _renderSlideText(currentSlide);
                };
            }

            // 綁定點擊按鈕切換
            if (prevBtn) prevBtn.onclick = () => { if (currentSlide > 0) { currentSlide--; updateSlider(); } };
            if (nextBtn) nextBtn.onclick = () => { if (currentSlide < totalSlides - 1) { currentSlide++; updateSlider(); } };
            dots.forEach((d, i) => d.onclick = () => { currentSlide = i; updateSlider(); });

            // 綁定移動端手勢滑動 (Swipe)
            const sliderContainer = panel.querySelector('#qb-greeting-slider');
            let startX = 0;
            let isSwiping = false;

            sliderContainer.addEventListener('touchstart', (e) => {
                startX = e.changedTouches[0].screenX;
                isSwiping = true;
            }, { passive: true });

            sliderContainer.addEventListener('touchend', (e) => {
                if (!isSwiping) return;
                isSwiping = false;
                let endX = e.changedTouches[0].screenX;
                let diff = startX - endX;

                // 滑動超過 50px 判定為翻頁
                if (diff > 50 && currentSlide < totalSlides - 1) {
                    currentSlide++;
                    updateSlider();
                } else if (diff < -50 && currentSlide > 0) {
                    currentSlide--;
                    updateSlider();
                }
            }, { passive: true });

            // ── ✏️ 逐張編輯開場白 ─────────────────────────────────────
            function _enterEditMode(idx) {
                const slide = innerView.querySelector(`.qb-greet-slide[data-greet-idx="${idx}"]`);
                if (!slide) return;
                const textDiv  = slide.querySelector('.qb-greet-text');
                const editor   = slide.querySelector('.qb-greet-editor');
                const saveRow  = slide.querySelector('.qb-greet-save-row');
                const editBtn  = slide.querySelector('.qb-greet-edit-btn');
                if (!textDiv || !editor) return;
                // 填入原始文字（未轉義、未替換），供用戶編輯
                editor.value = w.greetings[idx] || '';
                textDiv.style.display   = 'none';
                editor.style.display    = 'block';
                if (saveRow) saveRow.style.display = 'flex';
                if (editBtn) editBtn.style.display  = 'none';
            }

            function _exitEditMode(idx, save) {
                const slide = innerView.querySelector(`.qb-greet-slide[data-greet-idx="${idx}"]`);
                if (!slide) return;
                const textDiv  = slide.querySelector('.qb-greet-text');
                const editor   = slide.querySelector('.qb-greet-editor');
                const saveRow  = slide.querySelector('.qb-greet-save-row');
                const editBtn  = slide.querySelector('.qb-greet-edit-btn');
                if (save) {
                    const newText = editor.value;
                    w.greetings[idx] = newText;
                    _saveGreetings();
                    _renderSlideText(idx);   // 走同一支重畫：美化開著就重新長面板，關著就是轉義原文
                }
                textDiv.style.display   = '';
                editor.style.display    = 'none';
                if (saveRow) saveRow.style.display = 'none';
                if (editBtn) editBtn.style.display  = '';
            }

            // 綁定所有「編輯」按鈕
            innerView.querySelectorAll('.qb-greet-edit-btn').forEach(btn => {
                btn.onclick = () => _enterEditMode(parseInt(btn.dataset.idx));
            });
            // 綁定所有「儲存」按鈕
            innerView.querySelectorAll('.qb-greet-save-btn').forEach(btn => {
                btn.onclick = () => _exitEditMode(parseInt(btn.dataset.idx), true);
            });
            // 綁定所有「取消」按鈕
            innerView.querySelectorAll('.qb-greet-cancel-btn').forEach(btn => {
                btn.onclick = () => _exitEditMode(parseInt(btn.dataset.idx), false);
            });

            // ── 🔄 批量文字取代 + 規則儲存 ───────────────────────────
            const _RULES_KEY  = 'aurelia_greet_replace_rules';
            const replaceBtn  = innerView.querySelector('#qb-greet-replace-btn');
            const replacePanel= innerView.querySelector('#qb-greet-replace-panel');
            const findInput   = innerView.querySelector('#qb-greet-find');
            const replInput   = innerView.querySelector('#qb-greet-repl');
            const doReplBtn   = innerView.querySelector('#qb-greet-replace-do');
            const replMsg     = innerView.querySelector('#qb-greet-replace-msg');
            const savedRulesWrap = innerView.querySelector('#qb-greet-saved-rules');
            const rulesList   = innerView.querySelector('#qb-greet-rules-list');

            // 讀取 / 儲存規則到 localStorage
            function _loadRules() {
                try { return JSON.parse(localStorage.getItem(_RULES_KEY) || '[]'); } catch(e) { return []; }
            }
            function _persistRules(rules) {
                try { localStorage.setItem(_RULES_KEY, JSON.stringify(rules)); } catch(e) {}
            }
            function _addRule(find, repl) {
                const rules = _loadRules();
                // 去重：相同 find 直接更新 repl
                const existing = rules.findIndex(r => r.find === find);
                if (existing !== -1) { rules[existing].repl = repl; }
                else { rules.unshift({ find, repl }); }
                if (rules.length > 30) rules.length = 30;  // 最多 30 條
                _persistRules(rules);
            }
            function _deleteRule(find) {
                _persistRules(_loadRules().filter(r => r.find !== find));
            }

            // 渲染規則 chips
            function _renderRules() {
                if (!rulesList) return;
                const rules = _loadRules();
                if (!rules.length) {
                    if (savedRulesWrap) savedRulesWrap.style.display = 'none';
                    return;
                }
                if (savedRulesWrap) savedRulesWrap.style.display = 'flex';
                rulesList.innerHTML = '';
                rules.forEach(r => {
                    const chip = document.createElement('div');
                    chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:rgba(239,227,208,0.08);border:1px solid var(--qbk-line);border-radius:20px;padding:4px 10px 4px 12px;cursor:pointer;transition:background 0.15s;max-width:100%;';
                    chip.title = `點擊填入：「${r.find}」→「${r.repl}」`;

                    const label = document.createElement('span');
                    label.style.cssText = 'font-size:12px;color:rgba(255,248,231,0.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;';
                    label.textContent = `${r.find} → ${r.repl || '（刪除）'}`;

                    const del = document.createElement('button');
                    del.textContent = '×';
                    del.style.cssText = 'background:none;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:14px;line-height:1;padding:0;flex-shrink:0;';
                    del.title = '刪除此規則';
                    del.onclick = e => {
                        e.stopPropagation();
                        _deleteRule(r.find);
                        _renderRules();
                    };

                    chip.appendChild(label);
                    chip.appendChild(del);
                    chip.addEventListener('mouseenter', () => chip.style.background = 'rgba(239,227,208,0.14)');
                    chip.addEventListener('mouseleave', () => chip.style.background = 'rgba(239,227,208,0.14)');
                    // 點擊 chip → 填入輸入框並立即執行
                    chip.onclick = () => {
                        if (findInput) findInput.value = r.find;
                        if (replInput) replInput.value = r.repl;
                        doReplBtn?.click();
                    };
                    rulesList.appendChild(chip);
                });
            }

            // 執行取代的核心函式
            function _doReplace(find, repl) {
                if (!find) {
                    if (replMsg) { replMsg.textContent = '請輸入搜尋文字'; replMsg.style.color = 'rgba(255,160,100,0.8)'; }
                    return;
                }
                let count = 0;
                w.greetings = w.greetings.map(g => {
                    const updated = g.split(find).join(repl);
                    if (updated !== g) count++;
                    return updated;
                });
                if (count > 0) {
                    _saveGreetings();
                    // 更新所有顯示中的文字
                    innerView.querySelectorAll('.qb-greet-text').forEach(el => {
                        const i = parseInt(el.dataset.idx);
                        el.innerHTML = _escHtml(w.greetings[i])
                            .replace(/\{\{\s*user\s*\}\}/gi, currentUserName)
                            .replace(/\{\{\s*char\s*\}\}/gi, w.title);
                    });
                    // 若有正在編輯的框也同步
                    innerView.querySelectorAll('.qb-greet-editor').forEach(el => {
                        const i = parseInt(el.dataset.idx);
                        if (el.style.display !== 'none') el.value = w.greetings[i];
                    });
                    // 儲存這條規則
                    _addRule(find, repl);
                    _renderRules();
                    if (replMsg) { replMsg.textContent = `✅ 已取代 ${count} 個開場白，規則已儲存`; replMsg.style.color = 'rgba(150,220,130,0.9)'; }
                } else {
                    if (replMsg) { replMsg.textContent = '未找到匹配文字'; replMsg.style.color = 'rgba(255,160,100,0.8)'; }
                }
                setTimeout(() => { if (replMsg) replMsg.textContent = ''; }, 3000);
            }

            if (replaceBtn && replacePanel) {
                const closeRepl = () => { replacePanel.style.display = 'none'; };
                replaceBtn.onclick = () => {
                    replacePanel.style.display = 'flex';
                    _renderRules();
                    setTimeout(() => { try { findInput?.focus(); } catch (e) { } }, 30);
                };
                innerView.querySelector('#qb-greet-replace-close').onclick = closeRepl;
                replacePanel.onclick = (e) => { if (e.target === replacePanel) closeRepl(); };   // 點遮罩收掉
                replacePanel.addEventListener('keydown', e => { if (e.key === 'Escape') closeRepl(); });
            }

            if (doReplBtn) {
                doReplBtn.onclick = () => _doReplace(findInput?.value || '', replInput?.value ?? '');
            }

            // Enter 鍵快捷觸發
            [findInput, replInput].forEach(inp => {
                if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') doReplBtn?.click(); });
            });
        }

        // 返回書架按鈕
        panel.querySelector('#qb-cover-back').onclick = () => {
            panel.style.display = 'none';
            panel.innerHTML = '';
            shelves.forEach(s => s.style.display = 'flex');
            render();
        };

        // 下架按鈕
        const removeBtn = panel.querySelector('.qb-remove-world-btn');
        if (removeBtn) {
            removeBtn.onclick = () => {
                _confirmDeleteWorld(w, () => {
                    panel.style.display = 'none';
                    panel.innerHTML = '';
                    shelves.forEach(s => s.style.display = 'flex');
                    render();
                });
            };
        }

        // 踏入故事 / 與TA相遇 按鈕
        panel.querySelectorAll('.qb-dive-world-btn').forEach(btn => {
            btn.onclick = async () => {
                // 踏進故事＝開場白預覽退場：先把卡片自帶的音樂面板拆掉，
                //   不然生成 loading 的整段時間它都還在放（面板只是被蓋住，iframe 還活著）。
                if (panel._qbLeaveGreetings) panel._qbLeaveGreetings();
                const isStandalone = window.OS_API?.isStandalone?.() ?? false;

                // ── 角色卡路徑（cardImport）─────────────────────────
                if (w.cardImport) {
                    const sel = panel.querySelector('input[name="qb-greeting"]:checked');
                    const idx = sel ? parseInt(sel.value) : 0;
                    const chosenGreeting = (idx >= 0 && greetings && greetings[idx]) ? greetings[idx] : '';
                    const userReply = (panel.querySelector('#qb-user-reply')?.value || '').trim();

                    localStorage.setItem('vn_current_world_id', w.id);
                    localStorage.removeItem('vn_pending_first_mes');
                    try { localStorage.setItem('vn_active_wb_packs', JSON.stringify(w.wbPacks || [])); } catch(e) {}
                    try { window.VN_Core?.newStoryId?.(w.title, w.id); } catch(e) {}     // 這一刻＝建立聊天室
                    // 🚨 一定要等：這支會改世界書（VN 總綱固定版/自由版二選一）。
                    //    以前沒 await，切換還在寫 IDB，prompt 就已經組好送出 →
                    //    選了「自由」的第一輪，AI 讀到的還是固定版總綱，照樣每句寫表情格。
                    try { await window.VN_FREE_MODE?.applyForCurrent?.(true); } catch(e) {}

                    document.getElementById('qb-bookshelf-overlay').classList.remove('qb-reading');
                    document.getElementById('qb-bookshelf-overlay').style.display = 'none';
                    panel.style.display = 'none';
                    shelves.forEach(s => s.style.display = 'flex');

                    if (isStandalone) {
                        // 直接把參數交給生成器，不再設 pending 等面板自己去撿 ——
                        //   那條路得先叫出生成面板才跑得動，面板一拆整個 dive 就斷了。
                        const _dive = { worldId: w.id, greeting: chosenGreeting, title: w.title, userReply };
                        if (window.AureliaControlCenter?.switchPage) window.AureliaControlCenter.switchPage('nav-story');
                        // 🚨 VN 的舞台 DOM（#page-game / #text-panel-wrapper …）是 showVnPanel → launchApp 建的。
                        //    以前這裡只切 nav-story，舞台從沒被建出來 → 生成完要開播時 hideOverlays 讀到
                        //    null.style 直接炸掉，畫面就停在白底。（續讀舊篇章那條本來就有叫 showVnPanel，
                        //    所以只有「新開的第一輪」會中。）showVnPanel 內部有 vnInited 旗標，重複叫不會重建。
                        if (window.AureliaControlCenter?.showVnPanel) window.AureliaControlCenter.showVnPanel();
                        // 舞台 DOM 是 showVnPanel → launchApp 當場同步建好的，不必再空等。
                        //   等的那段時間畫面上是「VN 上一次停在哪一頁」（空舞台或主選單），
                        //   看起來就是劇情頁先漏出來、進度遮罩慢半拍才蓋上。
                        setTimeout(() => {
                            // 🚨掛在 VN_PLAYER 不是 VN_Core：舊碼寫成 VN_Core，?. 把它整個吞掉，
                            //   角色卡 Dive 一直是空打。找不到就出聲，不要再靜靜失敗。
                            const P = window.VN_PLAYER || window.VN_Core;
                            if (P && P.runCardDive) P.runCardDive(_dive);
                            else console.warn('[書架] 生成器還沒就緒，這次 dive 沒跑起來');
                        }, 0);
                    } else {
                        if (window.AureliaControlCenter?.switchPage) window.AureliaControlCenter.switchPage('nav-story');
                        if (window.StoryExtractor?.show) window.StoryExtractor.show();
                    }
                    return;
                }

                // ── 一般世界路徑（QB 任務板）───────────────────────
                try { localStorage.setItem('vn_active_wb_packs', JSON.stringify(w.wbPacks || [])); } catch(e) {}
                // 這條路以前沒寫 vn_current_world_id，留著上一次 dive 的舊值 →
                //   「這本書」的設定（立繪模式、AVS 條件規則的 worldId）全部認錯書。
                try { localStorage.setItem('vn_current_world_id', w.id); } catch(e) {}
                // 🚨 故事線的 id 要在這裡就生出來（＝酒館建立聊天室的那一刻）。
                //    下面的變數包初始化、AVS、記憶、手機資料都按 storyId 分艙，
                //    晚一步生就會全部寫進「上一本書」的桶裡。
                try { window.VN_Core?.newStoryId?.(w.title, w.id); } catch(e) {}
                // 🚨 同上：等世界書切完再往下走，不然第一輪的總綱是舊的
                try { await window.VN_FREE_MODE?.applyForCurrent?.(true); } catch(e) {}

                // 這本書自帶的追蹤欄位範本（匯入角色卡／生成世界時順手建的，不是手動綁的）→
                //   倒進「剛生出來的這條篇章」的狀態桶。順序很重要：newStoryId 要在前面。
                if (w.autoPackId && window.OS_DB && window._AVS_ENGINE) {
                    window.OS_DB.getAllVarPacks?.().then(packs => {
                        const pack = (packs || []).find(p => p.id === w.autoPackId);
                        if (pack) {
                            window._AVS_ENGINE.initFromPack(pack);
                            window.OS_AVS?.activateTemplateForPack?.(w.autoPackId);
                            console.log(`[QB] 已初始化追蹤欄位：${pack.name}`);
                        }
                    }).catch(e => console.warn('[QB] 追蹤欄位初始化失敗:', e));
                }

                document.getElementById('qb-bookshelf-overlay').classList.remove('qb-reading');
                document.getElementById('qb-bookshelf-overlay').style.display = 'none';
                panel.style.display = 'none';
                shelves.forEach(s => s.style.display = 'flex');

                if (isStandalone) {
                    if (window.QB_CORE?.openBook) {
                        window.QB_CORE.openBook(w.id);
                    } else {
                        window.VoidTerminal?.playSequence?.(`[Char|瀅瀅|think|「哎呀，這本書好像還沒準備好 (QB_CORE 模組未連線)。」]`);
                    }
                } else {
                    if (window.AureliaControlCenter?.switchPage) window.AureliaControlCenter.switchPage('nav-story');
                    if (window.StoryExtractor?.show) window.StoryExtractor.show();
                    else window.VoidTerminal?.playSequence?.(`[Char|瀅瀅|think|「哎呀，故事提取器還沒準備好 (StoryExtractor 未連線)。」]`);
                }
            };
        });
    }

    // ── 監聽視窗大小改變 (移動端橫直屏旋轉或縮放適配) ─────────────────────
    let _resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => {
            const shelves = _getShelves();
            if (shelves.length > 0 && shelves[0].clientWidth > 0) {
                render();
            }
        }, 150);
    });

    // ── 公開 API ─────────────────────────────────────────────────
    // 🚪 從 dock 的「故事」直接進自由劇情：開書架 → 跳過封面那層，直接落在指令輸入。
    //    合併前那顆開的是另一個「AI 生成劇情」面板，跟這裡做的是同一件事 ——
    //    兩個長得不一樣、資料又各存各的入口，只會讓人每次都要想一下該按哪個。
    //    書架照樣 render()：使用者按「返回書架」時要退得回去，不能退到空的。
    function openFreeScript() {
        try {
            const overlay = document.getElementById('qb-bookshelf-overlay');
            if (!overlay) return false;
            overlay.style.display = 'flex';
            render();
            openCover(_FREE_WORLD);
            const btn = document.querySelector('#qb-free-open-inner-btn');
            if (btn) btn.click();   // 從 dock 進來就是要寫，不必再按一次「翻閱開場白」
            return true;
        } catch (e) { console.warn('[書架] 自由劇情開啟失敗', e); return false; }
    }

    window.QbBookshelf = { render, openCover, openCreate, openFreeScript };

    console.log('✅ QbBookshelf 模組就緒 (v1.6 - 動態人設防汙染預覽版)');
})();