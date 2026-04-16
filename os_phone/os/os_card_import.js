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
        // 兼容兩種呼叫慣例：
        //   callApi(prompt)               ← 本模組內部用
        //   callApi(promptKey, userMsg)   ← os_avs_rules.generateRulesForWorld 用
        const callApi = async (promptKeyOrMsg, userMsg) => {
            const key = userMsg ? promptKeyOrMsg : 'general_assistant';
            const msg = userMsg || promptKeyOrMsg;
            if (win.OS_API_ENGINE?.generateText) {
                return await win.OS_API_ENGINE.generateText(key, msg);
            }
            if (win.OS_API?.chat) {
                return await win.OS_API.chat(key, msg);
            }
            return '';
        };

        // ── 1. 直接從卡片取世界描述（不需要 AI）─────────────────
        // 角色卡本身就有完整設定，不需要再讓 AI 重新生成
        const worldDesc = (card.scenario || card.description || '')
            .replace(/<[^>]*>/g, '').trim().slice(0, 150)
            || `以「${card.name}」為主角的故事。`;

        // ── 2. 儲存世界書條目（不需要 AI）────────────────────────
        // 使用確定性 ID（角色名 + 條目 key 的 hash），重複匯入自動覆蓋，不產生重複條目
        _setProgress(panelEl, '📚 匯入世界書條目…', 20);
        let importedEntryCount = 0;
        const cardCategory = card.name; // 用角色名當資料夾，多角色卡各自獨立

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
                    title: entry.comment || entry.title || keys.slice(0, 20) || '條目',
                    keys,
                    content: entry.content || '',
                    category: cardCategory,   // 角色名作為分類資料夾
                    enabled: entry.enabled !== false,
                    order: entry.insertion_order ?? 50,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
                importedEntryCount++;
            } catch (e) { console.warn('[CardImport] 世界書條目存入失敗', e); }
        }

        // ── 3. 單次 AI call：變數包 + 條件規則 + 風格建議 ────────
        _setProgress(panelEl, '🤖 AI 分析角色資料…', 40);
        // worldId 用角色名的 hash 確定化 → 同一張卡重複匯入會覆蓋而非新增
        const worldId = 'world_card_' + _simpleHash(card.name);
        let packId         = null;
        let packVars       = [];
        let savedRuleCount = 0;
        let stylePresetSaved = false;

        // ── 取得 AI 回應 ───────────────────────────────────────
        let raw = '';
        try {
            const cardContext =
                `角色名：${card.name}\n` +
                `描述：${card.description.slice(0, 600)}\n` +
                (card.personality ? `個性：${card.personality.slice(0, 200)}\n` : '') +
                (card.scenario    ? `背景：${card.scenario.slice(0, 300)}\n`    : '');

            const combined = await callApi(
                `你是 RPG 系統設計師。根據以下角色卡，輸出三個區塊。` +
                `絕對禁止使用任何 Markdown（**、*、#、-、數字列表等），不要輸出任何解釋文字，只輸出三個標籤區塊。\n\n` +

                `<variables>\n` +
                `（必填規則：\n` +
                `1. 每行格式：變數名 = 預設值\n` +
                `2. 必須為每個核心角色設定獨立的「好感度」變數（例：小晴好感度 = 50），最多5個角色\n` +
                `3. 其餘變數可自由選擇，總共最多15個，數值不加引號，字串加引號）\n` +
                `</variables>\n\n` +

                `<rules>\n` +
                `（必填規則：\n` +
                `1. 每行格式：名稱|變數名|運算子|比較值|行為說明\n` +
                `2. 運算子只能用 >= <= > < = !=，比較值不加引號\n` +
                `3. 行為說明不超過40字，純文字，絕對不用任何 Markdown 符號\n` +
                `4. 【必填】為核心角色→主角(User)的好感度生成四層條件，請注意只有可攻略角色，路人/大嬸/一次性NPC不在考慮範圍內（範例格式，替換角色名與行為描述）：\n` +
                `   初識階段|角色好感度|>=|25|角色對玩家態度轉變，開始稍微敞開心扉\n` +
                `   逐漸親近|角色好感度|>=|50|角色對玩家展現更真實的一面，減少防備\n` +
                `   深度信任|角色好感度|>=|75|角色主動分享秘密或脆弱，親密行為增加\n` +
                `   完全開放|角色好感度|>=|100|角色完全接受玩家，展現最深層的感情\n` +
                `5. 其餘條件根據角色特性自由發揮，條數不限）\n` +
                `</rules>\n\n` +

                `<style>\n` +
                `（一句30字內中文，描述適合這個角色的 UI 面板視覺風格，純文字）\n` +
                `</style>\n\n` +
                cardContext
            );
            raw = combined || '';
            console.log('[CardImport] AI 回應長度', raw.length, '前80字：', raw.slice(0, 80));
        } catch (e) {
            console.warn('[CardImport] ❌ AI call 失敗', e);
        }

        // ── 解析 <variables> ──────────────────────────────────
        try {
            const varBlock = (raw.match(/<variables>([\s\S]*?)<\/variables>/i) || [])[1] || '';
            console.log('[CardImport] varBlock 長度', varBlock.length);
            varBlock.split('\n').forEach(line => {
                const m = line.trim().match(/^([^\s=]+)\s*=\s*(.+)$/);
                if (!m) return;
                let def = m[2].trim().replace(/^["'「]|["'」]$/g, '');
                const num = Number(def);
                packVars.push({ name: m[1].trim(), defaultValue: isNaN(num) ? def : num });
            });
            console.log('[CardImport] 解析到變數', packVars.length, '個');

            if (packVars.length > 0) {
                packId = 'pack_card_' + Date.now();
                await win.OS_DB.saveVarPack({
                    id: packId,
                    name: card.name + ' — 角色包',
                    variables: packVars,
                    createdAt: Date.now(),
                });
                console.log('[CardImport] ✅ 變數包已存', packId);
            }
        } catch (e) { console.warn('[CardImport] ❌ 變數包存入失敗', e); }

        // ── 解析 <rules> ──────────────────────────────────────
        _setProgress(panelEl, '⚡ 處理條件規則…', 70);
        try {
            const rulesBlock = (raw.match(/<rules>([\s\S]*?)<\/rules>/i) || [])[1] || '';
            console.log('[CardImport] rulesBlock 長度', rulesBlock.length, '前80字：', rulesBlock.slice(0, 80));
            if (rulesBlock.trim()) {
                const LSKEY = 'avs_condition_rules';
                // 先移除同一 worldId 的舊規則，避免重複匯入疊加
                const allRules  = JSON.parse(localStorage.getItem(LSKEY) || '[]');
                const existing  = allRules.filter(r => r.worldId !== worldId);
                const newRules = [];
                rulesBlock.split('\n').forEach(line => {
                    const parts = line.split('|').map(s => s.trim());
                    if (parts.length < 5) return;
                    const [name, path, op, rawVal] = parts;
                    // content = 第5欄起全部合併（防止說明本身含有 | 符號）
                    const content = parts.slice(4).join('|');
                    if (!path || !op || !content) return;
                    const n = parseFloat(rawVal);
                    newRules.push({
                        id:       'rule_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
                        worldId,
                        name:     _stripMd(name || path),
                        enabled:  true,
                        path:     _stripMd(path).trim(),
                        op:       op.trim(),
                        value:    isNaN(n) ? _stripMd(rawVal) : n,
                        content:  _stripMd(content),
                        priority: 50,
                        folder:   card.name,
                    });
                });
                if (newRules.length > 0) {
                    localStorage.setItem(LSKEY, JSON.stringify([...existing, ...newRules]));
                    savedRuleCount = newRules.length;
                    console.log('[CardImport] ✅ 規則已存', savedRuleCount, '條，worldId:', worldId);
                } else {
                    console.warn('[CardImport] ⚠️ 規則解析結果為 0，原始 rulesBlock：', rulesBlock);
                }
            } else {
                console.warn('[CardImport] ⚠️ 未找到 <rules> 區塊，raw 回應片段：', raw.slice(0, 300));
            }
        } catch (e) { console.warn('[CardImport] ❌ 規則存入失敗', e); }

        // ── 解析 <style> ──────────────────────────────────────
        try {
            const styleBlock = (raw.match(/<style>([\s\S]*?)<\/style>/i) || [])[1] || '';
            const suggestion  = _stripMd(styleBlock).trim().slice(0, 120);
            if (packId && suggestion) {
                const presets = JSON.parse(localStorage.getItem('avs_furnace_presets') || '[]');
                presets.push({
                    id:        'fpreset_' + Date.now(),
                    packId,
                    packName:  card.name + ' — 角色包',
                    suggestion,
                    createdAt: Date.now(),
                });
                localStorage.setItem('avs_furnace_presets', JSON.stringify(presets));
                stylePresetSaved = true;
                console.log('[CardImport] ✅ 風格建議已存：', suggestion);
            }
        } catch (e) { console.warn('[CardImport] ❌ 風格建議存入失敗', e); }

        // ── 6. 建立世界物件並持久化 ────────────────────────────
        _setProgress(panelEl, '📖 建立世界…', 92);
        const newWorld = {
            id:          worldId,
            title:       card.name,
            icon:        '👤',
            desc:        worldDesc,
            danger:      Math.floor(Math.random() * 4) + 3,
            cover:       coverDataUrl || null,
            custom:      true,
            autoPackId:  packId,
            cardImport:  true,
            importedAt:  Date.now(),
            // 開場白：first_mes + alternate_greetings 合併，過濾空值
            greetings: [
                rawCard.first_mes || rawCard.data?.first_mes,
                ...( rawCard.data?.alternate_greetings || rawCard.alternate_greetings || [] )
            ].filter(s => s && s.trim()),
        };

        // Upsert：同一 worldId 只保留最新一筆，避免重複匯入產生多本書
        if (!win.AURELIA_CUSTOM_WORLDS) win.AURELIA_CUSTOM_WORLDS = [];
        const existingIdx = win.AURELIA_CUSTOM_WORLDS.findIndex(w => w.id === worldId);
        if (existingIdx >= 0) win.AURELIA_CUSTOM_WORLDS[existingIdx] = newWorld;
        else win.AURELIA_CUSTOM_WORLDS.push(newWorld);
        try {
            const saved    = JSON.parse(localStorage.getItem('aurelia_custom_worlds') || '[]');
            const savedIdx = saved.findIndex(w => w.id === worldId);
            if (savedIdx >= 0) saved[savedIdx] = newWorld; else saved.push(newWorld);
            localStorage.setItem('aurelia_custom_worlds', JSON.stringify(saved));
        } catch (e) { console.warn('[CardImport] localStorage 寫入失敗', e); }

        // ── 7. 完成 ────────────────────────────────────────────
        _setProgress(panelEl, `✅ 完成！`, 100);
        setTimeout(() => {
            _showSuccess(panelEl, {
                name: card.name,
                worldDesc,
                importedEntryCount,
                packId,
                packVarCount:  packVars.length,
                savedRuleCount,
                stylePresetSaved,
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
    function _showSuccess(panelEl, { name, worldDesc, importedEntryCount, packId, packVarCount, savedRuleCount, stylePresetSaved, railEl }) {
        panelEl.innerHTML = `
            <div style="position:absolute;inset:0;background:linear-gradient(160deg,#0e2a1a 0%,#061a0e 100%);"></div>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
                        justify-content:center;padding:28px;z-index:2;gap:14px;text-align:center;">
                <div style="font-size:48px;filter:drop-shadow(0 2px 12px rgba(0,200,100,0.5));">✅</div>
                <div style="font-size:18px;font-weight:900;color:#a8ffcc;letter-spacing:2px;">匯入成功</div>
                <div style="font-size:15px;font-weight:700;color:#FBDFA2;">${_esc(name)}</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.45);line-height:1.7;max-width:260px;">
                    ${_esc(worldDesc)}
                </div>
                <div style="font-size:11px;color:rgba(168,255,204,0.8);line-height:2.4;
                            background:rgba(0,0,0,0.3);padding:10px 18px;border-radius:6px;">
                    📚 世界書條目　${importedEntryCount} 條<br>
                    ${packId
                        ? `📦 變數包　${packVarCount} 個變數<br>` +
                          `⚡ 條件規則　${savedRuleCount > 0 ? savedRuleCount + ' 條（含好感度四層）' : '<span style="color:rgba(255,180,100,0.8);">生成失敗，請查看 console</span>'}<br>` +
                          (stylePresetSaved
                              ? `🔥 煉丹爐　已存風格建議（去煉丹爐 → 載入建議）`
                              : `<span style="color:rgba(255,200,100,0.5);">🔥 煉丹爐　可手動前往煉製</span>`)
                        : '<span style="color:rgba(255,200,100,0.6);">⚠️ 變數包生成失敗（可手動建立）</span>'
                    }
                </div>
                <button id="ci-go-back" style="
                    margin-top:8px;background:linear-gradient(135deg,#FBDFA2,#c8a030);
                    color:#1a0a04;font-weight:900;font-size:14px;padding:12px 36px;
                    border:none;border-radius:3px;cursor:pointer;letter-spacing:2px;
                    box-shadow:0 4px 20px rgba(251,223,162,0.3);
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
                border:1px solid rgba(251,223,162,0.25);color:#FBDFA2;
                padding:6px 14px;border-radius:20px;cursor:pointer;
                font-size:12px;letter-spacing:1px;z-index:30;">← 書架</button>

            <div style="position:absolute;inset:0;display:flex;flex-direction:column;
                        align-items:center;justify-content:center;
                        padding:20px 28px;z-index:2;gap:0;">

                <div style="font-size:30px;margin-bottom:14px;
                            filter:drop-shadow(0 2px 8px rgba(0,0,0,0.8));">📥</div>
                <div style="font-size:16px;font-weight:800;color:#FBDFA2;
                            letter-spacing:2px;margin-bottom:6px;">匯入角色卡</div>
                <div style="font-size:11px;color:rgba(251,223,162,0.5);
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
                                                     color:#FBDFA2;margin-bottom:4px;"></div>
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

            urlReader.onload = (e) => { coverDataUrl = e.target.result; };
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
    };

    console.log('[OS_CARD_IMPORT] 已載入 v1.1 - 核心人設轉化世界書支援版');
})();