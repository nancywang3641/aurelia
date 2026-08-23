/**
 * os_card_import.js — ST 角色卡 PNG 匯入模組  v1.1
 *
 * 流程：
 * 上傳 PNG → 解析 tEXt/chara chunk → 取出 Base64 JSON
 * → 顯示預覽 → 確認後 AI 分析
 * → 建立世界 + 轉換核心人設為常駐條目 + 匯入世界書 + 變數包 + 條件規則
 * → 書架自動出現新書
 *
 * 依賴：os_db.js · os_avs_rules.js · OS_API (chat)
 * 暴露：window.OS_CARD_IMPORT.openImportPanel / injectImportSpine / parsePngCard
 */
(function () {
    'use strict';
    const win = window.parent || window;

    // ═══════════════════════════════════════════════════════════
    //  PNG 解析器
    //  ST 把角色 JSON base64 塞進 PNG tEXt chunk，key = "chara"
    // ═══════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════
    //  🚨 封面與 localStorage 配額
    //  角色卡 PNG 動輒 1MB 起跳，以前是整張 readAsDataURL 直接塞進
    //  localStorage 的 aurelia_custom_worlds（base64 還會再脹三成）。
    //  兩三本就撞破 5MB → QuotaExceededError，而且從那一刻起
    //  「所有 localStorage 寫入」都開始失敗（AVS 規則、設定、storyId…），
    //  症狀會出現在完全無關的功能上。所以封面一律先縮成縮圖再存。
    // ═══════════════════════════════════════════════════════════
    const COVER_MAX_W = 420;        // 書封在畫面上最寬也就這個量級
    const COVER_BUDGET = 120 * 1024; // 單張縮圖上限，超過就再降一級品質

    function _shrinkCover(dataUrl) {
        return new Promise((resolve) => {
            if (!dataUrl) return resolve(null);
            const img = new Image();
            img.onload = () => {
                try {
                    const scale = Math.min(1, COVER_MAX_W / (img.naturalWidth || COVER_MAX_W));
                    const w = Math.max(1, Math.round((img.naturalWidth || COVER_MAX_W) * scale));
                    const h = Math.max(1, Math.round((img.naturalHeight || COVER_MAX_W) * scale));
                    const cv = document.createElement('canvas');
                    cv.width = w; cv.height = h;
                    cv.getContext('2d').drawImage(img, 0, 0, w, h);
                    let out = cv.toDataURL('image/webp', 0.82);
                    if (out.length > COVER_BUDGET) out = cv.toDataURL('image/webp', 0.6);
                    if (out.length > COVER_BUDGET) out = cv.toDataURL('image/jpeg', 0.6);
                    // 🚨 縮圖失敗絕不退回原圖：原圖就是撐爆配額的那個東西
                    resolve(out && out.length < dataUrl.length ? out : null);
                } catch (e) { console.warn('[CardImport] 封面縮圖失敗 → 這本書不存封面', e); resolve(null); }
            };
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }

    // 配額安全寫入：滿了先把舊封面全部瘦身騰空間，再不行就放棄這本的封面 —— 但書一定要存下來。
    //   以前只 console.warn 一句就算了 → 書根本沒寫進去，重載就消失，章節/正則/追蹤數值全成孤兒。
    function _saveWorlds(list) {
        const write = (arr) => localStorage.setItem('aurelia_custom_worlds', JSON.stringify(arr));
        try { write(list); return { ok: true }; } catch (e) {
            console.warn('[CardImport] localStorage 滿了 → 先把舊封面瘦身', e);
        }
        const shrunk = list.map(w => (w && typeof w.cover === 'string' && w.cover.length > COVER_BUDGET)
            ? Object.assign({}, w, { cover: null, coverDropped: true }) : w);
        try { write(shrunk); return { ok: true, droppedCovers: true }; } catch (e) {
            console.warn('[CardImport] 瘦身後還是寫不下', e);
        }
        return { ok: false };
    }

    function parsePngCard(buffer) {
        const bytes = new Uint8Array(buffer);
        const view  = new DataView(buffer);

        // 驗證 PNG 標頭
        const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
        for (let i = 0; i < 8; i++) {
            if (bytes[i] !== SIG[i]) throw new Error('不是有效的 PNG 文件');
        }

        let offset = 8;
        while (offset + 12 <= bytes.length) {
            const length    = view.getUint32(offset);
            const type      = String.fromCharCode(
                bytes[offset+4], bytes[offset+5], bytes[offset+6], bytes[offset+7]
            );
            const dataStart = offset + 8;

            if (type === 'tEXt') {
                // 找 null 分隔符（keyword\0text）
                let nullPos = dataStart;
                while (nullPos < dataStart + length && bytes[nullPos] !== 0) nullPos++;
                const keyword = new TextDecoder('utf-8').decode(bytes.slice(dataStart, nullPos));

                if (keyword === 'chara') {
                    const b64 = new TextDecoder('latin1').decode(
                        bytes.slice(nullPos + 1, dataStart + length)
                    );
                    try {
                        // atob 解出原始位元組，再用 UTF-8 正確解碼（支援中文）
                        const bin     = atob(b64.trim());
                        const utf8Buf = Uint8Array.from(bin, c => c.charCodeAt(0));
                        return JSON.parse(new TextDecoder('utf-8').decode(utf8Buf));
                    } catch (e) {
                        throw new Error('角色卡 JSON 解析失敗，可能檔案損壞');
                    }
                }
            }

            // 跳到下一個 chunk：4(length) + 4(type) + length(data) + 4(CRC)
            offset += 12 + length;
        }
        throw new Error('找不到角色卡資料（這張圖片不是 ST 角色卡？）');
    }

    // ═══════════════════════════════════════════════════════════
    //  正規化卡片格式（相容 V1 / V2 / V3 spec）
    // ═══════════════════════════════════════════════════════════
    function normalizeCard(raw) {
        const d = raw.data || raw; // V2/V3 把欄位放在 .data；V1 直接在根
        return {
            name:        d.name        || raw.name        || '未知角色',
            description: d.description || raw.description || '',
            personality: d.personality || raw.personality || '',
            scenario:    d.scenario    || raw.scenario    || '',
            first_mes:   d.first_mes   || raw.first_mes   || '',
            lorebook:    d.character_book || raw.character_book || null,
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  主要匯入流程
    // ═══════════════════════════════════════════════════════════
    async function importCard(rawCard, railEl, panelEl, coverDataUrl) {
        const card = normalizeCard(rawCard);
        const lorebookEntries = card.lorebook?.entries || [];

        // ── 1. 直接從卡片取世界描述（不需要 AI）─────────────────
        // 角色卡本身就有完整設定，不需要再讓 AI 重新生成
        const worldDesc = (card.scenario || card.description || '')
            .replace(/<[^>]*>/g, '').trim().slice(0, 150)
            || `以「${card.name}」為主角的故事。`;

        // ── 2. 儲存世界書條目（不需要 AI）────────────────────────
        // 使用確定性 ID（角色名 + 條目 key 的 hash），重複匯入自動覆蓋，不產生重複條目
        _setProgress(panelEl, '📚 匯入世界書條目…', 20);
        let importedEntryCount = 0;
        const cardCategory = card.name; // 用角色名當書包，多角色卡各自獨立
        // 書包名要註冊進清單，否則世界書面板的下拉看不到這一本
        try { win.OS_WORLDBOOK?.registerBook?.(cardCategory); } catch (e) {}

        // 🔥 新增：將角色卡核心人設轉換為一條「常駐」的世界書條目
        const coreSheetContent = (
            (card.description ? `【角色描述】\n${card.description}\n\n` : '') +
            (card.personality ? `【角色個性】\n${card.personality}\n\n` : '') +
            (card.scenario    ? `【場景背景】\n${card.scenario}` : '')
        ).trim();

        if (coreSheetContent) {
            try {
                const sheetStableId = 'wb_' + _simpleHash(card.name + '|core_persona_sheet');
                await win.OS_DB.saveWorldbookEntry({
                    id: sheetStableId,
                    book: cardCategory,   // 🚨 一定要有：生成時 getContextByPacks 濾的是 book，不是 category
                    title: `${card.name}-人設`,
                    keys: '', // 留空表示常駐
                    content: coreSheetContent,
                    category: cardCategory, // 放進該角色的專屬世界書包
                    enabled: true,
                    order: 100, // 給予最高權重 100，確保人設優先度高
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
                importedEntryCount++;
                console.log(`[CardImport] ✅ 核心人設已成功轉為世界書條目: ${card.name}-人設`);
            } catch (e) { console.warn('[CardImport] 核心人設條目存入失敗', e); }
        }

        // 繼續存原本內建的世界書條目
        for (const entry of lorebookEntries) {
            try {
                const keys = Array.isArray(entry.keys)
                    ? entry.keys.join(',')
                    : String(entry.key || entry.keys || '');
                // 確定性 ID：同一角色卡同一條目永遠是同一個 ID → 重複匯入只會覆蓋不會複製
                const stableId = 'wb_' + _simpleHash(card.name + '|' + keys + '|' + (entry.comment || ''));
                await win.OS_DB.saveWorldbookEntry({
                    id: stableId,
                    book: cardCategory,   // 🚨 同上：少了它，整本卡片世界書在生成時一條都撈不到
                    title: entry.comment || entry.title || keys.slice(0, 20) || '條目',
                    keys,
                    content: entry.content || '',
                    category: cardCategory,   // 角色名作為分類資料夾
                    enabled: entry.enabled !== false,
                    order: entry.insertion_order ?? 50,
                    // 酒館 @D 的深度／身分：character_book 把這些塞在 entry.extensions 裡，
                    //   換算統一交給 OS_WORLDBOOK（那支兩種形狀都吃得到）
                    depth: win.OS_WORLDBOOK?.stDepthOf?.(entry) ?? null,
                    role:  win.OS_WORLDBOOK?.stRoleOf?.(entry) ?? 0,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
                importedEntryCount++;
            } catch (e) { console.warn('[CardImport] 世界書條目存入失敗', e); }
        }

        // worldId 用角色名的 hash 確定化 → 同一張卡重複匯入會覆蓋而非新增
        const worldId = 'world_card_' + _simpleHash(card.name);

        // 🗑️ 匯入時的「AI 生變數包＋條件規則＋風格建議」已整段移除（Rae 定案）：
        //    追蹤欄位改由狀態面板的「開始追蹤狀態」按鈕負責，匯入不再當觸發條件。
        //    匯入回歸純資料搬運（世界書條目／開場白／封面），省掉一次大 AI 呼叫。

        // ── 3. 建立世界物件並持久化 ────────────────────────────
        _setProgress(panelEl, '📖 建立世界…', 70);
        const newWorld = {
            id:          worldId,
            title:       card.name,
            icon:        '👤',
            desc:        worldDesc,
            danger:      Math.floor(Math.random() * 4) + 3,
            cover:       coverDataUrl || null,
            custom:      true,
            cardImport:  true,
            importedAt:  Date.now(),
            // 🚨 這本書要讀哪個世界書書包：匯入時就掛上去。
            //    以前沒寫這欄 → 踏入故事時 `w.wbPacks || []` 寫進 vn_active_wb_packs 的是空陣列，
            //    組 context 時「這本書自己的書包」是空的 → 退到 getEnabledContext(它濾的是
            //    「世界書 app 當下正在看的那本」) → 玩 A 書卻讀到 B 書的設定，而且完全不報錯。
            wbPacks:     [cardCategory],
            // 開場白：first_mes + alternate_greetings 合併，過濾空值
            greetings: [
                rawCard.first_mes || rawCard.data?.first_mes,
                ...( rawCard.data?.alternate_greetings || rawCard.alternate_greetings || [] )
            ].filter(s => s && s.trim()),
        };

        // Upsert：同一 worldId 只保留最新一筆，避免重複匯入產生多本書
        // 重複匯入＝就地更新，不整顆換掉：
        //   ① 蓋掉整顆會把這本書後來長出來的東西（擴充館藏、追蹤欄位範本、立繪模式…）一起洗掉
        //   ② 開場白被改過就留她那份 —— 卡片自帶的那幾則永遠回得來，她改過的字回不來
        //   （為了讓舊書吃到自帶正則，重新匯入同一張卡是唯一的路，這條路不能順手弄丟東西）
        function _mergeWorld(prev) {
            if (!prev) return newWorld;
            const merged = Object.assign({}, prev, newWorld);
            if (Array.isArray(prev.greetings) && prev.greetings.length) {
                merged.greetings = prev.greetings;
                console.log('[CardImport] 這本書已經有 ' + prev.greetings.length + ' 則開場白（可能被你改過）→ 保留，不用卡片自帶的覆蓋');
            }
            if (!newWorld.cover && prev.cover) merged.cover = prev.cover;
            if (!Array.isArray(merged.wbPacks) || !merged.wbPacks.length) merged.wbPacks = [cardCategory];
            return merged;
        }

        if (!win.AURELIA_CUSTOM_WORLDS) win.AURELIA_CUSTOM_WORLDS = [];
        const existingIdx = win.AURELIA_CUSTOM_WORLDS.findIndex(w => w.id === worldId);
        if (existingIdx >= 0) win.AURELIA_CUSTOM_WORLDS[existingIdx] = _mergeWorld(win.AURELIA_CUSTOM_WORLDS[existingIdx]);
        else win.AURELIA_CUSTOM_WORLDS.push(newWorld);
        {
            let saved = [];
            try { saved = JSON.parse(localStorage.getItem('aurelia_custom_worlds') || '[]'); } catch (e) {}
            const savedIdx = saved.findIndex(w => w.id === worldId);
            if (savedIdx >= 0) saved[savedIdx] = _mergeWorld(saved[savedIdx]); else saved.push(newWorld);
            const r = _saveWorlds(saved);
            // 🚨 存不下來就要炸：書沒進 localStorage，重載後書會不見,
            //    但它的世界書條目/自帶正則/之後產生的章節與追蹤數值都在 IDB → 全部變孤兒。
            if (!r.ok) throw new Error('存不下這本書：瀏覽器的 localStorage 已滿。到書架刪掉幾本不玩的書再匯入一次。');
            if (r.droppedCovers) console.warn('[CardImport] 空間不足 → 已捨棄部分書封（書本身都在）');
        }

        // ── 3.5 卡片自帶的美化正則 ─────────────────────────────
        //  酒館卡把美化面板放在 extensions.regex_scripts（找一段標記 → 換成一整份 HTML）。
        //  不收下來的話，這張卡在這裡就只剩裸文字（<标题栏> 那種標記直接晾在畫面上）。
        //  存進 IDB 的正則庫，不塞進上面那顆 world 物件——它是進 localStorage 的，一張卡的正則就上百 KB。
        let regexCount = 0;
        try {
            if (win.OS_CARD_REGEX) regexCount = await win.OS_CARD_REGEX.saveFromCard(worldId, card.name, rawCard);
            else console.warn('[CardImport] 正則庫模組沒載入，這張卡自帶的美化面板不會生效');
        } catch (e) { console.warn('[CardImport] 自帶正則存入失敗', e); }

        // ── 4. 完成 ────────────────────────────────────────────
        _setProgress(panelEl, `✅ 完成！`, 100);
        setTimeout(() => {
            _showSuccess(panelEl, {
                name: card.name,
                worldDesc,
                importedEntryCount,
                regexCount,
                railEl,
            });
        }, 600);
    }

    // ═══════════════════════════════════════════════════════════
    //  進度條更新
    // ═══════════════════════════════════════════════════════════
    function _setProgress(panelEl, text, pct) {
        const bar   = panelEl.querySelector('#ci-progress-bar');
        const label = panelEl.querySelector('#ci-progress-label');
        if (bar)   bar.style.width   = pct + '%';
        if (label) label.textContent = text;
    }

    // ═══════════════════════════════════════════════════════════
    //  匯入成功畫面
    // ═══════════════════════════════════════════════════════════
    function _showSuccess(panelEl, { name, worldDesc, importedEntryCount, regexCount, railEl }) {
        panelEl.innerHTML = `
            <div style="position:absolute;inset:0;background:linear-gradient(160deg,#0e2a1a 0%,#061a0e 100%);"></div>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
                        justify-content:center;padding:28px;z-index:2;gap:14px;text-align:center;">
                <div style="font-size:48px;filter:drop-shadow(0 2px 12px rgba(0,200,100,0.5));">✅</div>
                <div style="font-size:18px;font-weight:900;color:#a8ffcc;letter-spacing:2px;">匯入成功</div>
                <div style="font-size:15px;font-weight:700;color:#1A1C28;">${_esc(name)}</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.45);line-height:1.7;max-width:260px;">
                    ${_esc(worldDesc)}
                </div>
                <div style="font-size:11px;color:rgba(168,255,204,0.8);line-height:2.4;
                            background:rgba(0,0,0,0.3);padding:10px 18px;border-radius:6px;">
                    📚 世界書條目　${importedEntryCount} 條${regexCount ? `<br>✨ 自帶美化面板　${regexCount} 條` : ''}
                </div>
                <button id="ci-go-back" style="
                    margin-top:8px;background:linear-gradient(135deg,rgba(26,28,40,0.25),#c8a030);
                    color:#1a0a04;font-weight:900;font-size:14px;padding:12px 36px;
                    border:none;border-radius:3px;cursor:pointer;letter-spacing:2px;
                    box-shadow:0 4px 20px rgba(26,28,40,0.15);
                ">📖 回到書架</button>
            </div>
        `;

        panelEl.querySelector('#ci-go-back').onclick = () => {
            panelEl.style.display = 'none';
            panelEl.innerHTML = '';
            // 通知書架重新渲染（CARD_IMPORT_COMPLETE listener 會還原 shelves + render）
            win.dispatchEvent(new CustomEvent('CARD_IMPORT_COMPLETE', {
                detail: { worldId: null }
            }));
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  開啟匯入面板
    // ═══════════════════════════════════════════════════════════
    function openImportPanel(railEl) {
        const panel = document.getElementById('qb-book-cover-panel');
        if (!panel) return;
        // 隱藏所有書架層 + 翻頁 nav（與 openCover/openCreate 行為一致）
        const _allShelves = ['qb-shelf-1','qb-shelf-2','qb-shelf-3']
            .map(id => document.getElementById(id)).filter(Boolean);
        const _nav = document.getElementById('qb-shelf-nav');
        _allShelves.forEach(s => s.style.display = 'none');
        if (_nav) _nav.style.display = 'none';

        panel.innerHTML = `
            <div style="position:absolute;inset:0;
                background:linear-gradient(160deg,#0e1a2a 0%,#060e1a 100%);"></div>
            <div style="position:absolute;inset:0;pointer-events:none;
                background-image:repeating-linear-gradient(
                    180deg,rgba(255,255,255,0.015) 0px,rgba(255,255,255,0.015) 1px,
                    transparent 1px,transparent 20px);"></div>

            <button id="ci-back" style="
                position:absolute;top:12px;left:12px;
                background:rgba(0,0,0,0.4);backdrop-filter:blur(6px);
                border:1px solid rgba(26,28,40,0.12);color:#1A1C28;
                padding:6px 14px;border-radius:20px;cursor:pointer;
                font-size:12px;letter-spacing:1px;z-index:30;">← 書架</button>

            <div style="position:absolute;inset:0;display:flex;flex-direction:column;
                        align-items:center;justify-content:center;
                        padding:20px 28px;z-index:2;gap:0;">

                <div style="font-size:30px;margin-bottom:14px;
                            filter:drop-shadow(0 2px 8px rgba(0,0,0,0.8));">📥</div>
                <div style="font-size:16px;font-weight:800;color:#1A1C28;
                            letter-spacing:2px;margin-bottom:6px;">匯入角色卡</div>
                <div style="font-size:11px;color:rgba(26,28,40,0.30);
                            letter-spacing:1px;margin-bottom:22px;">
                    支援 SillyTavern PNG 角色卡（V1 / V2 / V3）
                </div>

                <div id="ci-drop-zone" style="
                    width:100%;padding:28px 20px;
                    border:2px dashed rgba(100,160,255,0.4);border-radius:8px;
                    text-align:center;cursor:pointer;
                    background:rgba(30,60,120,0.2);
                    transition:background 0.2s,border-color 0.2s;
                    display:flex;flex-direction:column;align-items:center;gap:10px;">
                    <div style="font-size:32px;">🖼️</div>
                    <div style="font-size:13px;color:rgba(255,255,255,0.7);">拖放角色卡 PNG 到此處</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.35);">或點擊選擇文件</div>
                    <input id="ci-file-input" type="file" accept=".png,image/png" style="display:none;">
                </div>

                <div id="ci-preview" style="
                    display:none;width:100%;margin-top:16px;padding:14px;
                    background:rgba(0,0,0,0.4);border-radius:6px;
                    border:1px solid rgba(100,160,255,0.3);">
                    <div style="font-size:11px;color:rgba(100,200,255,0.8);
                                letter-spacing:1px;margin-bottom:8px;">✓ 讀取成功</div>
                    <div id="ci-preview-name" style="font-size:15px;font-weight:700;
                                                     color:#1A1C28;margin-bottom:4px;"></div>
                    <div id="ci-preview-desc" style="font-size:11px;color:rgba(255,255,255,0.5);
                                                     line-height:1.6;max-height:60px;overflow:hidden;"></div>
                    <div id="ci-preview-stats" style="font-size:10px;
                                                      color:rgba(100,200,255,0.6);margin-top:6px;"></div>
                </div>

                <div id="ci-progress-wrap" style="display:none;width:100%;margin-top:16px;">
                    <div id="ci-progress-label" style="font-size:11px;
                        color:rgba(255,255,255,0.4);margin-bottom:6px;">準備中…</div>
                    <div style="height:4px;background:rgba(255,255,255,0.1);
                                border-radius:2px;overflow:hidden;">
                        <div id="ci-progress-bar" style="
                            height:100%;width:0%;border-radius:2px;transition:width 0.4s;
                            background:linear-gradient(90deg,#4a9eff,#a8ffcc);"></div>
                    </div>
                </div>

                <button id="ci-submit" style="
                    display:none;margin-top:20px;
                    background:linear-gradient(135deg,#4a9eff,#6ab8ff);
                    color:#fff;font-weight:900;font-size:14px;
                    padding:12px 36px;border:none;border-radius:3px;cursor:pointer;
                    letter-spacing:2px;box-shadow:0 4px 20px rgba(74,158,255,0.3);
                    transition:opacity 0.2s;"
                    onmouseover="this.style.opacity='0.85'"
                    onmouseout="this.style.opacity='1'">
                    🚀 開始匯入
                </button>
            </div>
        `;

        panel.style.display = 'block';

        let parsedCard   = null;
        let coverDataUrl = null;

        // 返回按鈕
        panel.querySelector('#ci-back').onclick = () => {
            panel.style.display = 'none';
            panel.innerHTML = '';
            _allShelves.forEach(s => s.style.display = 'flex');
            window.QbBookshelf?.render?.();
        };

        // 拖放 + 點擊選擇
        const dropZone  = panel.querySelector('#ci-drop-zone');
        const fileInput = panel.querySelector('#ci-file-input');

        dropZone.onclick = () => fileInput.click();

        dropZone.ondragover = (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'rgba(100,160,255,0.8)';
            dropZone.style.background  = 'rgba(30,60,120,0.45)';
        };
        dropZone.ondragleave = () => {
            dropZone.style.borderColor = 'rgba(100,160,255,0.4)';
            dropZone.style.background  = 'rgba(30,60,120,0.2)';
        };
        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'rgba(100,160,255,0.4)';
            dropZone.style.background  = 'rgba(30,60,120,0.2)';
            const file = e.dataTransfer?.files?.[0];
            if (file) _handleFile(file);
        };
        fileInput.onchange = () => {
            if (fileInput.files?.[0]) _handleFile(fileInput.files[0]);
        };

        // 確認按鈕
        panel.querySelector('#ci-submit').onclick = async () => {
            if (!parsedCard) return;
            panel.querySelector('#ci-submit').style.display   = 'none';
            panel.querySelector('#ci-progress-wrap').style.display = 'block';
            try {
                await importCard(parsedCard, railEl, panel, coverDataUrl);
            } catch (e) {
                console.error('[CardImport] 匯入出錯', e);
                _setProgress(panel, '❌ 匯入失敗：' + e.message, 0);
            }
        };

        // ── 處理上傳的文件 ────────────────────────────────────
        function _handleFile(file) {
            if (!file.name.toLowerCase().endsWith('.png') && file.type !== 'image/png') {
                alert('請選擇 PNG 格式的角色卡文件！');
                return;
            }

            // 同時讀兩次：ArrayBuffer 用來解析角色 JSON，DataURL 用來當封面圖
            const bufReader = new FileReader();
            const urlReader = new FileReader();

            // 整張 PNG 的 dataURL 只用來做縮圖，原圖不留（它就是撐爆 localStorage 的元凶）
            urlReader.onload = async (e) => { coverDataUrl = await _shrinkCover(e.target.result); };
            urlReader.readAsDataURL(file);

            bufReader.onload = (e) => {
                try {
                    parsedCard = parsePngCard(e.target.result);
                    const card = normalizeCard(parsedCard);
                    const entryCount = card.lorebook?.entries?.length || 0;

                    panel.querySelector('#ci-preview-name').textContent =
                        card.name;
                    panel.querySelector('#ci-preview-desc').textContent =
                        card.description.slice(0, 130) + (card.description.length > 130 ? '…' : '');
                    panel.querySelector('#ci-preview-stats').textContent =
                        `世界書條目：${entryCount} 條　` +
                        (card.scenario ? '有劇情背景　' : '') +
                        (card.first_mes ? '有開場白' : '');

                    panel.querySelector('#ci-preview').style.display = 'block';
                    panel.querySelector('#ci-submit').style.display   = 'inline-block';

                    // 拖放區換成角色卡縮圖預覽
                    dropZone.style.borderColor = 'rgba(100,255,150,0.6)';
                    dropZone.style.background  = 'none';
                    dropZone.style.padding     = '0';
                    dropZone.style.overflow    = 'hidden';
                    dropZone.innerHTML = `
                        <img src="${URL.createObjectURL(file)}"
                             style="width:100%;height:100%;object-fit:cover;border-radius:6px;display:block;">
                        <div style="position:absolute;bottom:0;left:0;right:0;
                                    background:linear-gradient(transparent,rgba(0,0,0,0.7));
                                    padding:6px 8px;font-size:11px;color:rgba(150,255,180,0.9);">
                            ✅ ${_esc(file.name)}
                        </div>
                    `;
                    dropZone.style.position = 'relative';
                } catch (err) {
                    alert('⚠️ 讀取失敗：' + err.message);
                    console.error('[CardImport]', err);
                }
            };
            bufReader.onerror = () => alert('文件讀取失敗，請重試');
            bufReader.readAsArrayBuffer(file);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  向書架軌道注入「📥 匯入角色卡」書脊
    // ═══════════════════════════════════════════════════════════
    function injectImportSpine(railEl) {
        if (!railEl) return;
        // 防重複注入
        if (railEl.querySelector('.ci-import-spine')) return;

        const spine = document.createElement('div');
        spine.className = 'ci-import-spine';
        spine.style.cssText = `
            flex-shrink:0;width:48px;height:145px;position:relative;z-index:1;
            background:rgba(16,28,44,0.7);
            border:1.5px dashed rgba(100,160,255,0.25);
            border-radius:2px;cursor:pointer;
            display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
            transition:background 0.2s,border-color 0.2s;
            scroll-snap-align:start;
        `;
        spine.innerHTML = `
            <span style="color:rgba(100,160,255,0.6);font-size:18px;line-height:1;">📥</span>
            <span style="writing-mode:vertical-rl;color:rgba(100,160,255,0.4);
                         font-size:10px;letter-spacing:3px;">匯入角色卡</span>
        `;
        spine.onmouseenter = () => {
            spine.style.background   = 'rgba(22,44,88,0.9)';
            spine.style.borderColor  = 'rgba(100,160,255,0.6)';
        };
        spine.onmouseleave = () => {
            spine.style.background   = 'rgba(16,28,44,0.7)';
            spine.style.borderColor  = 'rgba(100,160,255,0.25)';
        };
        spine.onclick = () => openImportPanel(railEl);

        // 插在「撰寫新書」書脊之前
        const addSpine = [...railEl.children].find(el =>
            el.innerHTML?.includes('撰寫新書')
        );
        railEl.insertBefore(spine, addSpine || null);
    }

    // ═══════════════════════════════════════════════════════════
    //  簡易字串 hash（用來產生確定性 ID，避免世界書重複匯入）
    // ═══════════════════════════════════════════════════════════
    function _simpleHash(str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h * 0x01000193) >>> 0;
        }
        return h.toString(36);
    }

    // ═══════════════════════════════════════════════════════════
    //  剔除 Markdown 符號（AI 常帶入 **bold**、*italic*、# 等）
    // ═══════════════════════════════════════════════════════════
    function _stripMd(s) {
        return String(s)
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g,     '$1')
            .replace(/`(.+?)`/g,       '$1')
            .replace(/^#{1,6}\s+/gm,   '')
            .replace(/^\s*[-*]\s+/gm,  '')
            .replace(/^\s*\d+\.\s+/gm, '')
            .replace(/「\*\*|\*\*」/g,  '')
            .trim();
    }

    // ═══════════════════════════════════════════════════════════
    //  HTML 轉義（防 XSS）
    // ═══════════════════════════════════════════════════════════
    function _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ═══════════════════════════════════════════════════════════
    //  公開 API
    // ═══════════════════════════════════════════════════════════
    win.OS_CARD_IMPORT = {
        /** 開啟匯入面板（需傳書架 railEl） */
        openImportPanel,
        /** 向書架 railEl 注入匯入書脊按鈕 */
        injectImportSpine,
        /** 直接解析 PNG ArrayBuffer → 角色 JSON（供外部使用） */
        parsePngCard,
        /** 舊書補上世界書書包（書名同名者）*/
        backfillWbPacks,
        /** 把已存的大張書封就地縮成縮圖，把 localStorage 空間要回來 */
        reclaimCoverSpace,
    };

    // ── 🧷 舊書補書包（開機跑一次）────────────────────────────
    //   匯入時沒寫 wbPacks 的書，踏進去會拿到空書包 → 世界書退到「app 當下在看的那本」，
    //   玩 A 書讀到 B 書的設定。這裡按「書名 ＝ 世界書書包名」把它補回去（匯入時本來就是同名）。
    async function backfillWbPacks() {
        let list;
        try { list = JSON.parse(localStorage.getItem('aurelia_custom_worlds') || '[]'); } catch (e) { return 0; }
        if (!Array.isArray(list) || !list.length) return 0;
        let books = [];
        try { books = (win.OS_WORLDBOOK?.getAvailablePacks?.()) || []; } catch (e) {}
        if (!books.length) return 0;
        let n = 0;
        for (const w of list) {
            if (!w || !w.cardImport) continue;
            if (Array.isArray(w.wbPacks) && w.wbPacks.length) continue;
            if (w.title && books.includes(w.title)) { w.wbPacks = [w.title]; n++; }
        }
        if (!n) return 0;
        const r = _saveWorlds(list);
        if (!r.ok) { console.warn('[CardImport] 補書包後寫不回去'); return 0; }
        try { win.AURELIA_CUSTOM_WORLDS = list; window.AURELIA_CUSTOM_WORLDS = list; } catch (e) {}
        console.log('[CardImport] 🧷 補上世界書書包 ' + n + ' 本（以前踏進去會讀到別本書的設定）');
        return n;
    }

    // ── 🧹 舊書封瘦身（開機跑一次）──────────────────────────────
    //   在縮圖這條路之前匯入的書，封面是整張角色卡 PNG 的 dataURL（1MB 起跳）。
    //   localStorage 一旦撐破 5MB，之後「每一個」localStorage 寫入都會失敗 ——
    //   而且錯誤會出現在完全無關的功能上（設定存不了、AVS 規則不見、storyId 沒換）。
    //   所以開機時掃一遍，超標的就地縮圖再寫回去；沒有超標的話這段等於沒跑。
    async function reclaimCoverSpace() {
        let list;
        try { list = JSON.parse(localStorage.getItem('aurelia_custom_worlds') || '[]'); } catch (e) { return 0; }
        if (!Array.isArray(list) || !list.length) return 0;
        const fat = list.filter(w => w && typeof w.cover === 'string' && w.cover.length > COVER_BUDGET);
        if (!fat.length) return 0;
        const before = JSON.stringify(list).length;
        for (const w of fat) {
            const small = await _shrinkCover(w.cover);
            w.cover = small || null;   // 縮不動就不留封面，絕不把原圖寫回去
        }
        const r = _saveWorlds(list);
        if (!r.ok) { console.warn('[CardImport] 書封瘦身後仍寫不回去'); return 0; }
        const saved = before - JSON.stringify(list).length;
        try { win.AURELIA_CUSTOM_WORLDS = list; window.AURELIA_CUSTOM_WORLDS = list; } catch (e) {}
        console.log('[CardImport] 🧹 書封瘦身 ' + fat.length + ' 本，騰出約 ' + Math.round(saved / 1024) + ' KB');
        return saved;
    }
    setTimeout(() => { reclaimCoverSpace().catch(() => {}); }, 3000);   // 開機忙完再跑，別跟首屏搶
    setTimeout(() => { backfillWbPacks().catch(() => {}); }, 3500);

    console.log('[OS_CARD_IMPORT] 已載入 v1.1 - 核心人設轉化世界書支援版');
})();