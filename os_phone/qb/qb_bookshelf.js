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
                border:1px solid rgba(183,132,86,0.45);
                border-radius:10px;padding:24px 28px;max-width:340px;width:90%;
                box-shadow:0 8px 40px rgba(0,0,0,0.8);color:#FBDFA2;font-family:'Noto Sans TC',sans-serif;
            ">
                <div style="font-size:15px;font-weight:700;margin-bottom:8px;">📕 刪除《${cardName}》</div>
                <div style="font-size:12px;color:rgba(251,223,162,0.6);margin-bottom:18px;line-height:1.6;">
                    請選擇刪除範圍：
                </div>

                <div id="qb-del-scope" style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
                    <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:8px 10px;border-radius:6px;border:1px solid rgba(251,223,162,0.15);transition:border-color 0.2s;" id="qb-del-opt-book">
                        <input type="radio" name="qb-del-scope" value="book" checked style="margin-top:2px;accent-color:#e67e22;">
                        <span>
                            <strong style="font-size:13px;">只刪書籍</strong>
                            <div style="font-size:11px;color:rgba(251,223,162,0.45);margin-top:2px;">書脊移除，其他資料保留</div>
                        </span>
                    </label>
                    <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:8px 10px;border-radius:6px;border:1px solid rgba(251,223,162,0.15);transition:border-color 0.2s;" id="qb-del-opt-all">
                        <input type="radio" name="qb-del-scope" value="all" style="margin-top:2px;accent-color:#e53e3e;">
                        <span>
                            <strong style="font-size:13px;color:#fc8181;">完整清除</strong>
                            <div style="font-size:11px;color:rgba(251,223,162,0.45);margin-top:2px;">
                                書籍
                                ${hasVarPack ? '＋ 變數包' : ''}
                                ＋ 世界書條目（分類「${cardName}」）
                            </div>
                        </span>
                    </label>
                </div>

                <div style="display:flex;gap:10px;">
                    <button id="qb-del-cancel" style="
                        flex:1;background:rgba(251,223,162,0.08);border:1px solid rgba(251,223,162,0.2);
                        color:rgba(251,223,162,0.6);border-radius:6px;padding:9px;font-size:13px;cursor:pointer;
                        font-family:inherit;transition:background 0.2s;">取消</button>
                    <button id="qb-del-confirm" style="
                        flex:1;background:rgba(180,30,30,0.7);border:1px solid rgba(220,50,50,0.4);
                        color:#fff;border-radius:6px;padding:9px;font-size:13px;cursor:pointer;
                        font-family:inherit;transition:background 0.2s;">確認刪除</button>
                </div>
            </div>
        `;

        // 高亮選中選項
        const radios = dlg.querySelectorAll('input[name="qb-del-scope"]');
        const labels = [dlg.querySelector('#qb-del-opt-book'), dlg.querySelector('#qb-del-opt-all')];
        radios.forEach((r, i) => {
            r.onchange = () => labels.forEach((l, j) => {
                l.style.borderColor = j === i ? 'rgba(251,223,162,0.5)' : 'rgba(251,223,162,0.15)';
            });
        });
        labels[0].style.borderColor = 'rgba(251,223,162,0.5)';

        dlg.querySelector('#qb-del-cancel').onclick  = () => dlg.remove();
        dlg.querySelector('#qb-del-confirm').onclick = async () => {
            const scope = dlg.querySelector('input[name="qb-del-scope"]:checked')?.value || 'book';
            dlg.remove();

            // 1. 從書架移除
            window.AURELIA_CUSTOM_WORLDS = (window.AURELIA_CUSTOM_WORLDS || []).filter(x => x.id !== w.id);
            try { localStorage.setItem('aurelia_custom_worlds', JSON.stringify(window.AURELIA_CUSTOM_WORLDS)); } catch(e) {}

            if (scope === 'all') {
                // 2. 刪變數包
                if (hasVarPack && window.OS_DB?.deleteVarPack) {
                    try { await window.OS_DB.deleteVarPack(w.autoPackId); } catch(e) { console.warn('[DelWorld] 變數包刪除失敗', e); }
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
                // 4. 刪條件規則（worldId）
                try {
                    const rulesKey = 'avs_rules';
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
        spine.style.cssText = `
            flex-shrink:0; width:48px; height:${bookH}px; position:relative; z-index:1;
            background:url('${w.cover}') center/cover;
            border-radius:2px 1px 1px 2px;
            border-left:5px solid rgba(255,255,255,0.25);
            border-right:2px solid rgba(0,0,0,0.6);
            box-shadow:inset 4px 0 10px rgba(0,0,0,0.5), 4px 4px 12px rgba(0,0,0,0.7);
            cursor:pointer;
            transition:transform 0.25s cubic-bezier(0.2,0.8,0.2,1), box-shadow 0.25s;
            transform-origin:bottom center;
        `;
        spine.innerHTML = `
            <div style="position:absolute;inset:0;background:rgba(0,0,0,0.52);border-radius:inherit;"></div>
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:8px 0;">
                <span style="writing-mode:vertical-rl;text-orientation:mixed;color:#FBDFA2;font-size:11px;font-weight:700;letter-spacing:3px;text-shadow:0 1px 4px #000;max-height:78%;overflow:hidden;line-height:1.3;">${w.title}</span>
            </div>
            <div style="position:absolute;top:6px;left:0;right:0;text-align:center;font-size:14px;line-height:1;">${w.icon}</div>
            <div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;color:rgba(229,62,62,0.9);font-size:8px;font-weight:bold;text-shadow:0 0 4px #000;">▲${w.danger}</div>
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
            border:1.5px dashed rgba(251,223,162,0.25);
            border-radius:2px; cursor:pointer;
            display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
            transition:background 0.2s, border-color 0.2s;
        `;
        addSpine.innerHTML = `
            <span style="color:rgba(251,223,162,0.45);font-size:20px;line-height:1;">＋</span>
            <span style="writing-mode:vertical-rl;color:rgba(251,223,162,0.35);font-size:10px;letter-spacing:3px;">撰寫新書</span>
        `;
        addSpine.onmouseenter = () => {
            addSpine.style.background = 'rgba(62,39,22,0.9)';
            addSpine.style.borderColor = 'rgba(251,223,162,0.5)';
        };
        addSpine.onmouseleave = () => {
            addSpine.style.background = 'rgba(44,28,16,0.7)';
            addSpine.style.borderColor = 'rgba(251,223,162,0.25)';
        };
        addSpine.onclick = () => openCreate();
        return addSpine;
    }

    // ── 渲染書架（移動端動態寬高適配＋手勢滑動）────────────────────────
    function render() {
        const shelves = _getShelves();
        if (!shelves.length) return;

        const allWorlds = Object.values(window.AURELIA_WORLDS || {})
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

            <button id="qb-create-back" style="position:absolute;top:12px;left:12px;background:rgba(0,0,0,0.4);backdrop-filter:blur(6px);border:1px solid rgba(251,223,162,0.25);color:#FBDFA2;padding:6px 14px;border-radius:20px;cursor:pointer;font-size:12px;letter-spacing:1px;z-index:30;">← 書架</button>

            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px 28px 28px;z-index:2;gap:0;overflow-y:auto;">
                <div style="font-size:30px;margin-bottom:14px;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.8));">✒️</div>
                <div style="font-size:16px;font-weight:800;color:#FBDFA2;letter-spacing:2px;margin-bottom:6px;">撰寫新書</div>
                <div style="font-size:11px;color:rgba(251,223,162,0.5);letter-spacing:1px;margin-bottom:18px;">描述你想前往的世界</div>

                <input id="qb-create-input" type="text" placeholder="例：蒸汽朋克工業帝國、末日後的海底城市…"
                    style="width:100%;background:rgba(0,0,0,0.5);border:1px solid rgba(251,223,162,0.3);border-radius:4px;color:#FFF8E7;font-size:13px;padding:12px 14px;outline:none;text-align:center;letter-spacing:0.5px;font-family:'Noto Sans TC',sans-serif;">
                <div style="margin-top:6px;font-size:10px;color:rgba(251,223,162,0.3);letter-spacing:0.5px;">按 Enter 或點下方按鈕送出</div>

                <div style="width:100%;margin-top:14px;">
                    <button id="qb-wb-toggle" style="
                        width:100%;background:rgba(0,0,0,0.3);
                        border:1px solid rgba(251,223,162,0.2);
                        color:rgba(251,223,162,0.55);padding:8px 14px;
                        border-radius:4px;cursor:pointer;font-size:11px;
                        letter-spacing:1px;text-align:left;transition:border-color 0.2s;">
                        📚 從世界書條目生成 ▼
                    </button>
                    <div id="qb-wb-list" style="
                        display:none;max-height:150px;overflow-y:auto;margin-top:4px;
                        background:rgba(0,0,0,0.35);border:1px solid rgba(251,223,162,0.15);
                        border-radius:4px;padding:6px 10px;">
                        <div style="font-size:10px;color:rgba(255,255,255,0.3);text-align:center;padding:10px;">
                            載入中…
                        </div>
                    </div>
                    <div id="qb-wb-hint" style="display:none;margin-top:5px;font-size:10px;color:rgba(251,223,162,0.4);text-align:center;">
                        已勾選的條目內容將提供給 AI 作為世界觀參考
                    </div>
                </div>

                <button id="qb-create-submit" style="margin-top:20px;background:linear-gradient(135deg,#FBDFA2,#c8a030);color:#1a0a04;font-weight:900;font-size:14px;padding:12px 36px;border:none;border-radius:3px;cursor:pointer;letter-spacing:2px;box-shadow:0 4px 20px rgba(251,223,162,0.3);transition:opacity 0.2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">📖 創建世界</button>
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
            wbToggle.textContent = `📚 從世界書條目生成 ${isOpen ? '▼' : '▲'}`;
            wbToggle.style.borderColor = isOpen
                ? 'rgba(251,223,162,0.2)' : 'rgba(251,223,162,0.5)';

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
                setTimeout(() => { input.style.borderColor = 'rgba(251,223,162,0.3)'; }, 1500);
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

    // ── 書封面與內頁展開面板 (雙層結構 + 滑動卡片) ────────────────────────
    function openCover(w) {
        const panel = document.getElementById('qb-book-cover-panel');
        const shelves = _getShelves();
        const nav = document.getElementById('qb-shelf-nav');
        if (!panel) return;

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
                border:1px solid rgba(251,223,162,0.3);color:#FBDFA2;
                padding:6px 14px;border-radius:20px;cursor:pointer;
                font-size:12px;letter-spacing:1px;z-index:30;">← 書架</button>

            <div id="qb-cover-view" style="
                position:absolute;bottom:0;left:0;right:0;
                padding:20px 20px 32px;text-align:center;z-index:2;
                display:flex;flex-direction:column;align-items:center;">
                
                <div style="font-size:40px;margin-bottom:4px;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.8));">${w.icon}</div>
                <div style="font-size:24px;font-weight:900;color:#FBDFA2;
                            letter-spacing:3px;text-shadow:0 2px 16px rgba(0,0,0,0.9);
                            margin-bottom:14px;font-family:'Noto Sans TC',sans-serif;line-height:1.3;">${w.title}</div>
                
                ${!isCard ? `
                <div style="font-size:13px;color:rgba(255,242,210,0.88);line-height:2;font-style:italic;
                            text-shadow:0 1px 6px rgba(0,0,0,1);margin-bottom:18px;">${w.desc}</div>
                <div style="color:rgba(229,62,62,0.85);font-size:11px;letter-spacing:2px;margin-bottom:16px;
                            text-shadow:0 0 6px rgba(0,0,0,0.8);">
                    危&ensp;險&ensp;度 &nbsp;${dangerFill}<span style="opacity:0.3;">${dangerEmpty}</span>
                </div>
                ` : `
                <div style="font-size:12px;color:rgba(251,223,162,0.6);margin-bottom:16px;letter-spacing:1px;">
                    收錄 ${greetings.length} 條開場白記憶
                </div>
                `}

                <div id="qb-wb-pack-slot" style="
                    width: 100%; margin-bottom: 24px;
                    display: flex; flex-direction: column; align-items: center; gap: 8px;">
                    <div style="display:flex; align-items:center; gap:8px; width:75%;">
                        <div style="flex:1; height:1px; background:linear-gradient(90deg, transparent, rgba(251,223,162,0.25));"></div>
                        <span style="font-size:10px; color:rgba(251,223,162,0.5); letter-spacing:3px; text-shadow:0 1px 2px #000; font-weight:bold;">擴充館藏</span>
                        <div style="flex:1; height:1px; background:linear-gradient(270deg, transparent, rgba(251,223,162,0.25));"></div>
                    </div>
                    <div style="display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:6px; width:100%;">
                        <div id="qb-wb-pack-tags" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;"></div>
                        <select id="qb-wb-pack-add" style="
                            background:rgba(0,0,0,0.4); border:1px dashed rgba(251,223,162,0.3);
                            border-radius:12px; color:rgba(251,223,162,0.5); font-size:10px;
                            padding:3px 8px; outline:none; font-family:inherit; cursor:pointer; text-align:center;
                            transition:all 0.2s;">
                            <option value="">＋ 掛載</option>
                        </select>
                    </div>
                </div>

                <div id="qb-var-pack-row" style="
                    width:78%; display:flex; align-items:center; gap:8px; margin-bottom:16px;">
                    <span style="font-size:10px; color:rgba(251,223,162,0.45); letter-spacing:2px; white-space:nowrap; flex-shrink:0;">⚙ 變數包</span>
                    <select id="qb-var-pack-sel" style="
                        flex:1; background:rgba(0,0,0,0.45); border:1px solid rgba(251,223,162,0.2);
                        border-radius:12px; color:rgba(251,223,162,0.75); font-size:10px;
                        padding:4px 10px; outline:none; font-family:inherit; cursor:pointer;
                        transition:border-color 0.2s;">
                        <option value="">— 未連結 —</option>
                    </select>
                </div>

                <div style="display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;">
                    ${isCard ? `
                    <button id="qb-open-inner-btn" style="
                        background:linear-gradient(135deg,#FBDFA2,#c8a030);color:#1a0a04;
                        font-weight:900;font-size:15px;padding:14px 44px;border:none;
                        border-radius:3px;cursor:pointer;letter-spacing:3px;
                        box-shadow:0 4px 24px rgba(251,223,162,0.35);transition:opacity 0.2s;"
                        onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                        📖 翻閱開場白
                    </button>
                    ` : `
                    <button class="qb-dive-world-btn" data-wid="${w.id}" style="
                        background:linear-gradient(135deg,#FBDFA2,#c8a030);color:#1a0a04;
                        font-weight:900;font-size:15px;padding:14px 44px;border:none;
                        border-radius:3px;cursor:pointer;letter-spacing:3px;
                        box-shadow:0 4px 24px rgba(251,223,162,0.35);transition:opacity 0.2s;"
                        onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                        踏入故事
                    </button>
                    `}
                    ${w.custom ? `<button class="qb-remove-world-btn" data-wid="${w.id}" style="
                        background:rgba(180,30,30,0.6);border:1px solid rgba(255,80,80,0.4);
                        color:rgba(255,180,180,0.9);font-size:12px;padding:10px 18px;
                        border-radius:3px;cursor:pointer;letter-spacing:1px;transition:opacity 0.2s;"
                        onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">下架</button>` : ''}
                </div>
            </div>

            ${isCard ? `
            <div id="qb-inner-view" style="
                display:none;position:absolute;inset:0;z-index:10;
                background:rgba(20,12,8,0.98);
                flex-direction:column;animation:panelSlideIn 0.25s ease-out;">
                
                <div style="padding:16px 20px;border-bottom:1px solid rgba(251,223,162,0.15);
                            display:flex;align-items:center;justify-content:space-between;
                            background:rgba(0,0,0,0.3);flex-shrink:0;">
                    <div style="font-size:14px;font-weight:bold;color:#FBDFA2;letter-spacing:1px;">
                        📖 選擇開場白：${w.title}
                    </div>
                    <button id="qb-inner-close" style="
                        background:none;border:none;color:rgba(251,223,162,0.6);
                        font-size:24px;cursor:pointer;line-height:1;padding:0 5px;"
                        onmouseover="this.style.color='#FBDFA2'" onmouseout="this.style.color='rgba(251,223,162,0.6)'">×</button>
                </div>
                
                <div id="qb-greeting-slider" style="flex:1; overflow:hidden; position:relative; width:100%; display:flex; flex-direction:column;">
                    <div id="qb-greeting-track" style="display:flex; width:100%; height:100%; transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);">
                        
                        ${greetings.map((g, i) => `
                            <div class="qb-greet-slide" style="flex: 0 0 100%; max-width: 100%; box-sizing: border-box; padding: 20px; display:flex; flex-direction:column; overflow-y:auto; scrollbar-width:none;">
                                <div style="border:1px solid rgba(251,223,162,0.25); background:rgba(0,0,0,0.5); border-radius:10px; padding:20px; flex:1; display:flex; flex-direction:column;">
                                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;border-bottom:1px solid rgba(251,223,162,0.15);padding-bottom:12px;">
                                        <span style="font-size:14px;color:#FBDFA2;letter-spacing:2px;font-weight:bold;">
                                            開場白 ${i + 1}
                                        </span>
                                        <input type="radio" name="qb-greeting" value="${i}" ${i === 0 ? 'checked' : ''} style="display:none;">
                                    </div>
                                    <div style="font-size:14px;color:rgba(255,248,231,0.88);line-height:1.8;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;">
                                        ${_escHtml(g).replace(/\{\{\s*user\s*\}\}/gi, currentUserName).replace(/\{\{\s*char\s*\}\}/gi, w.title)}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                        
                        <div class="qb-greet-slide" style="flex: 0 0 100%; max-width: 100%; box-sizing: border-box; padding: 20px; display:flex; flex-direction:column; overflow-y:auto; scrollbar-width:none;">
                            <div style="border:1px solid rgba(100,160,255,0.3); background:rgba(20,45,100,0.4); border-radius:10px; padding:20px; flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                                <input type="radio" name="qb-greeting" value="-1" style="display:none;">
                                <div style="font-size:48px; margin-bottom:20px; filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5));">🎲</div>
                                <span style="font-size:18px;color:rgba(150,200,255,0.9);font-weight:bold;letter-spacing:3px;">讓 AI 自由發揮</span>
                                <div style="font-size:13px;color:rgba(150,200,255,0.6);margin-top:12px;text-align:center;line-height:1.6;">無預設開場故事<br>直接踏入這個世界的未知領域</div>
                            </div>
                        </div>

                    </div>
                    
                    <button id="qb-greet-prev-btn" style="position:absolute;left:4px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);border:1px solid rgba(251,223,162,0.3);color:#FBDFA2;width:36px;height:36px;border-radius:50%;cursor:pointer;display:none;align-items:center;justify-content:center;z-index:5;">◀</button>
                    <button id="qb-greet-next-btn" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);border:1px solid rgba(251,223,162,0.3);color:#FBDFA2;width:36px;height:36px;border-radius:50%;cursor:pointer;display:none;align-items:center;justify-content:center;z-index:5;">▶</button>
                </div>

                <div style="padding:14px 20px 24px;border-top:1px solid rgba(251,223,162,0.15);
                            background:rgba(0,0,0,0.4);flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:16px;">
                    
                    <div id="qb-greet-dots" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;max-width:80%;">
                        ${greetings.map((_, i) => `<div class="qb-greet-dot" data-idx="${i}" style="width:8px;height:8px;border-radius:50%;background:#FBDFA2;opacity:${i===0?'1':'0.3'};cursor:pointer;transition:all 0.2s;"></div>`).join('')}
                        <div class="qb-greet-dot" data-idx="${greetings.length}" style="width:8px;height:8px;border-radius:50%;background:#4a9eff;opacity:0.3;cursor:pointer;transition:all 0.2s;"></div>
                    </div>

                    <button class="qb-dive-world-btn" data-wid="${w.id}" style="
                        width:100%;max-width:340px;
                        background:linear-gradient(135deg,#FBDFA2,#c8a030);color:#1a0a04;
                        font-weight:900;font-size:16px;padding:15px;border:none;
                        border-radius:6px;cursor:pointer;letter-spacing:4px;
                        box-shadow:0 4px 24px rgba(251,223,162,0.25);transition:opacity 0.2s;"
                        onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                        與TA相遇 🚀
                    </button>
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
                    background:rgba(251,223,162,0.1);border:1px solid rgba(251,223,162,0.25);
                    border-radius:12px;padding:3px 10px;font-size:10px;
                    color:rgba(251,223,162,0.8);backdrop-filter:blur(2px);`;
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
            sel.innerHTML = '<option value="">＋ 掛載</option>';
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

        // ── 🔧 變數包插槽 初始化 ──────────────────────────────────
        (async () => {
            const varSel = panel.querySelector('#qb-var-pack-sel');
            if (!varSel || !window.OS_DB?.getAllVarPacks) return;
            try {
                const packs = await window.OS_DB.getAllVarPacks();
                packs.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.name || p.id;
                    if (p.id === w.autoPackId) opt.selected = true;
                    varSel.appendChild(opt);
                });
            } catch(e) { console.warn('[QB] 變數包列表載入失敗', e); }
            varSel.onchange = () => {
                w.autoPackId = varSel.value || undefined;
                // 寫回 AURELIA_CUSTOM_WORLDS + localStorage
                const idx = (window.AURELIA_CUSTOM_WORLDS || []).findIndex(x => x.id === w.id);
                if (idx !== -1) {
                    if (w.autoPackId) window.AURELIA_CUSTOM_WORLDS[idx].autoPackId = w.autoPackId;
                    else delete window.AURELIA_CUSTOM_WORLDS[idx].autoPackId;
                    try { localStorage.setItem('aurelia_custom_worlds', JSON.stringify(window.AURELIA_CUSTOM_WORLDS)); } catch(e) {}
                }
                // 高亮邊框反饋
                varSel.style.borderColor = w.autoPackId ? 'rgba(251,223,162,0.6)' : 'rgba(251,223,162,0.2)';
            };
            // 初始高亮
            if (w.autoPackId) varSel.style.borderColor = 'rgba(251,223,162,0.6)';
        })();
        // ──────────────────────────────────────────────────────────

        // ── 視圖切換與滑動卡片邏輯 (角色卡專屬) ───────────────────────
        if (isCard) {
            const coverView = panel.querySelector('#qb-cover-view');
            const innerView = panel.querySelector('#qb-inner-view');
            const coverBack = panel.querySelector('#qb-cover-back');
            
            // 開啟內頁
            panel.querySelector('#qb-open-inner-btn').onclick = () => {
                coverView.style.display = 'none';
                coverBack.style.display = 'none';
                innerView.style.display = 'flex';
                updateSlider(); // 初始化顯示第一張
            };
            
            // 關閉內頁
            panel.querySelector('#qb-inner-close').onclick = () => {
                innerView.style.display = 'none';
                coverView.style.display = 'flex';
                coverBack.style.display = 'block';
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
                if (prevBtn) prevBtn.style.display = (currentSlide === 0) ? 'none' : 'flex';
                if (nextBtn) nextBtn.style.display = (currentSlide === totalSlides - 1) ? 'none' : 'flex';
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
            btn.onclick = () => {
                const isStandalone = window.OS_API?.isStandalone?.() ?? false;

                // ── 角色卡路徑（cardImport）─────────────────────────
                if (w.cardImport) {
                    const sel = panel.querySelector('input[name="qb-greeting"]:checked');
                    const idx = sel ? parseInt(sel.value) : 0;
                    const chosenGreeting = (idx >= 0 && greetings && greetings[idx]) ? greetings[idx] : '';

                    localStorage.setItem('vn_current_world_id', w.id);
                    localStorage.removeItem('vn_pending_first_mes');
                    try { localStorage.setItem('vn_active_wb_packs', JSON.stringify(w.wbPacks || [])); } catch(e) {}

                    document.getElementById('qb-bookshelf-overlay').style.display = 'none';
                    panel.style.display = 'none';
                    shelves.forEach(s => s.style.display = 'flex');

                    if (isStandalone) {
                        window._pendingCardDive = { worldId: w.id, greeting: chosenGreeting, title: w.title };
                        if (window.AureliaControlCenter?.switchPage) window.AureliaControlCenter.switchPage('nav-story');
                        setTimeout(() => window.VN_Core?.openGeneratePanel?.(), 400);
                    } else {
                        if (window.AureliaControlCenter?.switchPage) window.AureliaControlCenter.switchPage('nav-story');
                        if (window.StoryExtractor?.show) window.StoryExtractor.show();
                    }
                    return;
                }

                // ── 一般世界路徑（QB 任務板）───────────────────────
                try { localStorage.setItem('vn_active_wb_packs', JSON.stringify(w.wbPacks || [])); } catch(e) {}

                // 初始化變數包（若有綁定）
                if (w.autoPackId && window.OS_DB && window._AVS_ENGINE) {
                    window.OS_DB.getAllVarPacks?.().then(packs => {
                        const pack = (packs || []).find(p => p.id === w.autoPackId);
                        if (pack) {
                            window._AVS_ENGINE.initFromPack(pack);
                            window.OS_AVS?.activateTemplateForPack?.(w.autoPackId);
                            console.log(`[QB] 已初始化變數包：${pack.name}`);
                        }
                    }).catch(e => console.warn('[QB] 變數包初始化失敗:', e));
                }

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
    window.QbBookshelf = { render, openCover, openCreate };

    console.log('✅ QbBookshelf 模組就緒 (v1.6 - 動態人設防汙染預覽版)');
})();