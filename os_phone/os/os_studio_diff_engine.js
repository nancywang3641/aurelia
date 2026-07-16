// ----------------------------------------------------------------
// [檔案] os_studio_diff_engine.js — 創作室 VN 煉丹 Diff-refine 引擎（2026-07-17 自 os_studio.js 拆出）
// 職責：diff prompt 組裝（buildDiffRefinePrompt，模板逐字搬運勿動）；patch 解析套用
//       （extractConversationalText/applyDiffPatches/summarizeDiffResults，find 唯一性驗證＝機制核心）；
//       歷史快照（snapshotCurrentVNState/restoreFromVNSnapshot/formatSnapTime/renderVNHistoryArea；
//       快照存 currentParsedData.history、隨模板一起進 OS_DB，鍵名與資料形狀一字不動）。
// 依賴：window.OS_STUDIO._b 橋（renderPreviewPanel＝穩定函式引用；currentParsedData getter／
//       activePreviewData setter＝核心可變 let 即時取回寫）；載入順序必須在 os_studio.js 之後（index.js PHONE_FILES）。
// 入口＝win.OS_STUDIO_DIFF.*（核心 handleSend/handleDiffVNRefine/updateVNToolbarVisibility/還原舊版鈕 懶解析呼叫）；
//       主聊天送出鏈薄呼叫層（handleDiffVNRefine/_retryLastDiffRefine）留核心 os_studio.js，這裡只有引擎純邏輯。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const ST = win.OS_STUDIO;
    if (!ST || !ST._b) { console.warn('[StudioDiff] OS_STUDIO 橋不存在，煉丹 Diff-refine 引擎停用'); return; }
    const _b = ST._b;
    // 核心共用工具（過橋取用；穩定函式引用）
    const renderPreviewPanel = _b.renderPreviewPanel;
    // 核心可變狀態 currentParsedData / activePreviewData 是會被重新賦值的 let → 絕不快取引用：
    // 各函式開頭 const currentParsedData = _b.currentParsedData 即時取（getter）；回寫走 _b.activePreviewData（setter）。
    // ============================================================
    // === VN 煉丹：Diff-based refine（AI 給 find/replace pair）+ 歷史快照 ===
    // AI 不重寫整段 CSS/JS/HTML，改成輸出精準替換指令 <patch target><find>...</find><replace>...</replace></patch>
    // 前端驗證 find 在原文中唯一存在後才套用 → AI 沒寫到的東西物理上動不到
    // ============================================================
    const SCOPE_HUMAN_LABEL = {
        css:        '外觀樣式',
        js:         '互動邏輯',
        html:       '面板結構',
        demoFormat: '劇情格式',
        usageDesc:  'AI 使用說明',
        all:        '整個面板（重新設計）'
    };
    function humanizeScopeKeys(keys) {
        if (!Array.isArray(keys) || keys.length === 0) return '面板內容';
        const uniq = [...new Set(keys)];
        return uniq.map(k => SCOPE_HUMAN_LABEL[k] || k).join('、');
    }
    const VN_HISTORY_LIMIT = 10;
    const VALID_DIFF_TARGETS = ['css', 'js', 'html', 'demoFormat', 'usageDesc'];

    // 構建 diff prompt：要 AI 給 <patch target><find>...</find><replace>...</replace></patch>
    function buildDiffRefinePrompt(refineMsg) {
        const currentParsedData = _b.currentParsedData;   // 核心可變 let → 過橋 getter 即時取（勿快取模組層引用）
        if (!currentParsedData) return null;
        const d = currentParsedData;

        return `你是一個 VN 視覺小說引擎的 UI 工程師。用戶已有一個動態面板，給你修改建議。

**你的任務：產生精準的「替換指令」（find / replace pair），讓前端套用到當前面板。不要重寫整個 CSS / HTML / JS，只給要改的片段。**

⚠️【保守原則 — 絕對遵守】
- 只 patch 用戶**明確要求**的部分。沒被指名的內容絕對不動，即使你覺得設計可以更好
- 即使附了參考圖，圖只是「氛圍參考」，不是「重做模板」。用戶說「改字顏色」就只動顏色屬性
- 即使當前面板的代碼風格你不喜歡、或違反了某些「最佳實踐」——閉嘴照辦，不要順手「優化」
- 規則：用戶說 X，你只動 X；用戶沒說的，你裝沒看到

### 【當前面板狀態】(tagId: ${d.tagId || ''})

[--- CSS BEGIN ---]
${d.css || ''}
[--- CSS END ---]

[--- HTML BEGIN ---]
${d.html || ''}
[--- HTML END ---]

[--- JS BEGIN ---]
${d.js || ''}
[--- JS END ---]

[--- demoFormat BEGIN ---]
${d.demoFormat || ''}
[--- demoFormat END ---]

[--- usageDesc BEGIN ---]
${d.usageDesc || ''}
[--- usageDesc END ---]

### 【用戶的修改建議】
「${refineMsg}」

### 【輸出規範 — 必讀】

對每個改動，輸出一個 <patch> 區塊：

<patch target="css">
<find>原始片段（必須與上面當前面板狀態中的內容【完全一致、一字不差】，包含空白與換行）</find>
<replace>新片段（你要把 find 替換成的新內容）</replace>
</patch>

**關鍵規則**：
1. target 必須是這五個之一：css / js / html / demoFormat / usageDesc
2. **find 必須在 target 對應的內容裡【唯一存在】**：選擇足夠長、足夠特別的片段。前端會驗證唯一性，找不到或找到多個都會放棄這條 patch
3. **find 必須一字不差**：包含縮排、空白、換行、引號方向、註解。**從上面 BEGIN/END 區塊內複製貼上**，不要重寫或重新格式化
4. **🚨 find 越短越好（省 token）**：選最精簡的片段，不要為了保險整段當 find
   - 正例：只放需要被替換的那幾個 token / 那一行 / 那個 CSS rule 的核心宣告
   - 反例：把整段 5KB CSS 或整段 HTML 當 find（雖然不會被擋，但浪費 token，diff 的初衷就是省）
   - 如果你發現自己需要長 find 才能精準定位（找不到夠特別的短片段），那這次改動其實是「大改」，請改走整包重做：直接輸出全新面板的 <json>（見下方【🆘 大改】），不要硬塞超長 find / 超大 patch
5. **可以一次輸出多個 <patch>**（改多處、改多個 target 都行）
6. **新增內容**：把 find 設為「新內容應該插入點的前一段現有內容」，replace 設為「該段現有內容 + 你的新內容」
7. **刪除內容**：把 find 設為要刪的片段，replace 設為空字串
8. **可以簡短說明、可以提可選建議**——在 patches 之前或之後可以寫 1-3 句話：確認你改了什麼、或附帶提一個可選建議。但不要說教、不要評論或推翻用戶的點子，照用戶說的改就好。
   - ⚠️ 但 **<patch>…</patch> 區塊內絕對不要對話**——區塊內只能有 <find> 和 <replace>，否則 patch 解析會失敗
   - ⚠️ 不要輸出 JSON、不要 markdown ${'```'} 包裹 patches
   - 對話放在所有 patches 之前或之後（最外層），不要塞在 patch 之間（patch 之間有對話會干擾解析）
   - 範例：「字改紅了。順便提醒這暗背景配紅字對比可能不夠，要不要加個陰影？」

### 【🆘 大改＝直接給整包新面板，禁止喊「太大」、禁止叫用戶重做】

如果用戶的修改建議**無法用幾條精準小 patch 表達**（例如「整個換藍色科技風」「改成英文版」「重新設計成 X 風格」，或一次「同時加 A、改 B、換 C」這種多項大改）——**絕對不要喊太大、不要叫用戶重發、也不要硬塞超大 patch**。請直接在這「同一次回覆」裡輸出整包全新面板的 JSON，用 <json> 包住，含七個鍵：

<json>
{"tagId":"沿用原面板的 tagId","isBlock":維持原面板的 true/false,"html":"...","css":"...","js":"...","usageDesc":"...","demoFormat":"..."}
</json>

規則：① JSON 字串值內換行寫成 \\n、雙引號轉義成 \\"，整個 JSON 不可有真實換行。② 用戶沒提到、原本就有的部分要完整保留，只把該大改的依用戶要求重做。③ 一旦輸出 <json> 就不要再輸出任何 <patch>。④ 整包重做時設計品質要在線：避免卡片套卡片、配合面板主題與世界觀、響應式照舊，別因為是重做就變陽春。前端收到整包會直接換上新面板、舊版自動進「歷史快照」可一鍵還原——**用戶完全不用重發**。

### 【範例】

範例 A（用戶說「把背景改深」，原 CSS 含 \`background: #2c3e50;\`）：
<patch target="css">
<find>background: #2c3e50;</find>
<replace>background: #EEF0F6;</replace>
</patch>

範例 B（用戶說「加一個關閉按鈕」，原 HTML 含 \`<div class="confirm-btn">確認</div>\`）：
<patch target="html">
<find><div class="confirm-btn">確認</div></find>
<replace><div class="confirm-btn">確認</div>
<div class="close-btn">關閉</div></replace>
</patch>

範例 C（用戶說「整個換成藍色科技風 / 改成英文版 / 一次加好幾項」＝大改 → 直接給整包，不要喊太大）：
<json>
{"tagId":"原本的","isBlock":true,"html":"…全新…","css":"…全新…","js":"…","usageDesc":"…","demoFormat":"…"}
</json>

開始輸出（小修 → 只輸出 <patch> 區塊；大改 → 只輸出 <json>…</json> 整包；兩者擇一，其他都不要寫）：`;
    }

    // 抽取 AI 在 patches 之外講的對話（吐槽 / 建議 / 確認）
    function extractConversationalText(responseText) {
        if (!responseText) return '';
        let text = responseText;
        // 去掉所有 <patch>...</patch> 區塊
        text = text.replace(/<patch\s+target=["'][^"']+["']\s*>[\s\S]*?<\/patch>/gi, '');
        // 去掉整包 <json>（大改路徑）與舊逃生標籤，避免被當成對話文字
        text = text.replace(/<json>[\s\S]*?<\/json>/gi, '');
        text = text.replace(/<too_big_for_diff\s*\/?\s*>/gi, '');
        // 去掉常見的 markdown 包裹
        text = text.replace(/```[\s\S]*?```/g, '');
        return text.trim();
    }

    // 套用 AI 的 diff patch 到 currentParsedData，回傳每條 patch 的處理結果
    // 回傳值：陣列（每條 patch 結果 + .conversationalText 屬性）或 { status: 'too_big', message, conversationalText }
    function applyDiffPatches(responseText) {
        const currentParsedData = _b.currentParsedData;   // 核心可變 let → 過橋 getter 即時取（勿快取模組層引用）
        if (!currentParsedData) return [];

        const conversationalText = extractConversationalText(responseText);

        // === 🆘 AI 主動逃生：用戶要求超出 diff 能處理的範圍 ===
        if (/<too_big_for_diff\s*\/?\s*>/i.test(responseText)) {
            return { status: 'too_big', message: '這次改動較大、AI 沒給出可套用的結果，請把想要的樣子描述清楚一點再發一次（系統會自動整包重做、不用任何按鈕）', conversationalText };
        }

        const patchRegex = /<patch\s+target=["']([^"']+)["']\s*>([\s\S]*?)<\/patch>/gi;
        const findRegex = /<find>([\s\S]*?)<\/find>/i;
        const replaceRegex = /<replace>([\s\S]*?)<\/replace>/i;

        // 第一輪：解析所有 patch（先不套用），同時做長度檢查
        const parsedPatches = []; // { target, findStr, replaceStr, original, findLen, originalLen }
        const results = [];
        let m;
        while ((m = patchRegex.exec(responseText)) !== null) {
            const target = m[1].trim();
            const body = m[2];

            if (!VALID_DIFF_TARGETS.includes(target)) {
                results.push({ target, status: 'invalid_target' });
                continue;
            }
            const findMatch = body.match(findRegex);
            const replaceMatch = body.match(replaceRegex);
            if (!findMatch || !replaceMatch) {
                results.push({ target, status: 'malformed' });
                continue;
            }
            const findStr = findMatch[1];
            const replaceStr = replaceMatch[1];
            if (!findStr || findStr.trim() === '') {
                results.push({ target, status: 'empty_find' });
                continue;
            }
            parsedPatches.push({ target, findStr, replaceStr });
        }

        // 砍掉所有長度檢查（過去版本擋掉 patch 反而強迫用戶重發、更耗 token）
        // 大改防線改靠：(a) prompt 約束 (b) <too_big_for_diff/> AI 主動逃生 (c) 歷史快照保底還原
        parsedPatches.forEach(p => {
            const { target, findStr, replaceStr } = p;
            const original = currentParsedData[target] || '';

            // 驗證 find 在原文中只出現一次（diff 機制核心，不能砍）
            const occurrences = original.split(findStr).length - 1;
            if (occurrences === 0) {
                results.push({ target, status: 'not_found', find: findStr.slice(0, 80) });
                return;
            }
            if (occurrences > 1) {
                results.push({ target, status: 'multi_match', find: findStr.slice(0, 80), count: occurrences });
                return;
            }

            // 套用：split + join 字串替換（避開 replace 的 $ 特殊字元）
            currentParsedData[target] = original.split(findStr).join(replaceStr);
            results.push({ target, status: 'applied', findLen: findStr.length, replaceLen: replaceStr.length, originalLen: original.length });
        });

        // 診斷 log：印出每條 patch 的處理結果（讓「整個面板被改」的問題能追蹤）
        const stats = results.reduce((acc, r) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
        }, {});
        console.log(`[Studio] 📦 diff 套用統計:`, stats, '— 詳情:', results, '— AI 對話:', conversationalText || '(無)');

        // 把對話文字附到 results array 上（陣列也能掛非數字屬性）
        results.conversationalText = conversationalText;
        return results;
    }

    function summarizeDiffResults(results) {
        // 抽 AI 對話文字（patches 之外的吐槽 / 建議 / 確認）
        const conv = (results && results.conversationalText) ? results.conversationalText : '';
        const appendConv = (baseText) => conv ? `${baseText}\n\n${conv}` : baseText;

        // === AI 主動逃生 / 前端全局長度檢查 abort ===
        if (results && !Array.isArray(results) && results.status === 'too_big') {
            return { text: appendConv('⚠️ ' + results.message), failed: true };
        }

        if (!Array.isArray(results) || results.length === 0) {
            // 完全沒 patch 但有對話 → AI 純聊天 / 問問題 / 給建議，不是失敗
            if (conv) {
                return { text: conv, failed: false, conversational: true };
            }
            return { text: '⚠️ AI 沒給出可套用的修改，預覽未更新。請把需求描述清楚一點再發一次（大改會自動整包重做）', failed: true };
        }
        const applied = results.filter(r => r.status === 'applied');
        const failed = results.filter(r => r.status !== 'applied');

        if (applied.length === 0) {
            const reasons = failed.slice(0, 3).map(r => {
                if (r.status === 'not_found') return `找不到原文「${(r.find || '').slice(0,30)}…」`;
                if (r.status === 'multi_match') return `「${(r.find || '').slice(0,30)}…」在原文出現 ${r.count} 次無法精準定位`;
                if (r.status === 'invalid_target') return `不認得目標欄位「${r.target}」`;
                if (r.status === 'malformed') return 'patch 格式錯誤';
                if (r.status === 'empty_find') return 'find 是空的';
                return r.status;
            });
            return { text: appendConv(`⚠️ AI 給了 ${results.length} 條修改指令但全部失敗：${reasons.join('；')}。請把需求描述清楚一點再發一次（大改會自動整包重做）`), failed: true };
        }

        const appliedTargets = applied.map(r => r.target);
        let text = `✅ 已套用 ${applied.length} 處修改：${humanizeScopeKeys(appliedTargets)}`;
        if (failed.length > 0) {
            text += `（另有 ${failed.length} 處定位失敗）`;
        }
        return { text: appendConv(text), failed: false, appliedTargets };
    }

    function snapshotCurrentVNState(note, scope) {
        const currentParsedData = _b.currentParsedData;   // 核心可變 let → 過橋 getter 即時取（勿快取模組層引用）
        if (!currentParsedData) return;
        if (Array.isArray(currentParsedData)) return; // VN 是物件不是陣列
        if (!Array.isArray(currentParsedData.history)) currentParsedData.history = [];

        const d = currentParsedData;
        const snap = {
            ts: Date.now(),
            html: d.html || '',
            css: d.css || '',
            js: d.js || '',
            demoFormat: d.demoFormat || '',
            usageDesc: d.usageDesc || '',
            isBlock: !!d.isBlock,
            tagId: d.tagId || '',
            note: note || '',
            scope: scope || 'all',
            pinned: false
        };
        currentParsedData.history.unshift(snap);

        const unpinnedCount = currentParsedData.history.filter(h => !h.pinned).length;
        if (unpinnedCount > VN_HISTORY_LIMIT) {
            let toRemove = unpinnedCount - VN_HISTORY_LIMIT;
            for (let i = currentParsedData.history.length - 1; i >= 0 && toRemove > 0; i--) {
                if (!currentParsedData.history[i].pinned) {
                    currentParsedData.history.splice(i, 1);
                    toRemove--;
                }
            }
        }
    }

    function restoreFromVNSnapshot(idx) {
        const currentParsedData = _b.currentParsedData;   // 核心可變 let → 過橋 getter 即時取（勿快取模組層引用）
        if (!currentParsedData || !Array.isArray(currentParsedData.history)) return;
        const snap = currentParsedData.history[idx];
        if (!snap) return;

        snapshotCurrentVNState(`還原前自動備份（即將套用 ${formatSnapTime(snap.ts)}）`, 'all');

        currentParsedData.html = snap.html;
        currentParsedData.css = snap.css;
        currentParsedData.js = snap.js;
        currentParsedData.demoFormat = snap.demoFormat;
        currentParsedData.usageDesc = snap.usageDesc;
        if (typeof snap.isBlock === 'boolean') currentParsedData.isBlock = snap.isBlock;
        if (snap.tagId) currentParsedData.tagId = snap.tagId;

        _b.activePreviewData = currentParsedData;   // 回寫核心可變 let（_b setter）
        renderPreviewPanel();
    }

    function formatSnapTime(ts) {
        const d = new Date(ts);
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function renderVNHistoryArea() {
        const currentParsedData = _b.currentParsedData;   // 核心可變 let → 過橋 getter 即時取（勿快取模組層引用）
        const area = document.getElementById('vn-studio-history-area');
        const countEl = document.getElementById('vn-studio-history-count');
        if (!area) return;

        const list = (currentParsedData && !Array.isArray(currentParsedData) && Array.isArray(currentParsedData.history))
            ? currentParsedData.history
            : [];
        if (countEl) countEl.textContent = list.length;

        if (list.length === 0) {
            area.innerHTML = '<div class="vn-history-empty">尚無快照。每次發送修改建議前會自動拍一張，最多保留 ' + VN_HISTORY_LIMIT + ' 張（📌 釘住的不計入）。</div>';
            return;
        }

        area.innerHTML = '<div class="vn-history-hint">📸 由新到舊。點「還原」可回到該版本（會先自動備份當前）。釘住的快照不會被自動清理。聊天歷史不會跟著動。</div>';

        list.forEach((snap, idx) => {
            const item = document.createElement('div');
            item.className = 'vn-history-item' + (snap.pinned ? ' pinned' : '');
            const scopeBadge = snap.scope && snap.scope !== 'all' && snap.scope !== 'auto'
                ? `[${humanizeScopeKeys([snap.scope])}] `
                : '';
            const noteText = (scopeBadge + (snap.note || '(無備註)')).replace(/</g, '&lt;');
            item.innerHTML = `
                <span class="h-time">${formatSnapTime(snap.ts)}</span>
                <span class="h-note" title="${noteText}">${noteText}</span>
                <button class="h-btn btn-restore">⏪ 還原</button>
                <button class="h-btn btn-pin">${snap.pinned ? '📌' : '📍'}</button>
                <button class="h-btn danger btn-del">✖</button>
            `;
            item.querySelector('.btn-restore').onclick = () => {
                if (confirm('要還原到這個版本嗎？目前的狀態會先拍進快照，可以再還原回來。')) {
                    restoreFromVNSnapshot(idx);
                    renderVNHistoryArea();
                }
            };
            item.querySelector('.btn-pin').onclick = () => {
                snap.pinned = !snap.pinned;
                renderVNHistoryArea();
            };
            item.querySelector('.btn-del').onclick = () => {
                if (confirm('刪除這張快照？')) {
                    _b.currentParsedData.history.splice(idx, 1);   // 點刪當下即時取（保留原 live 語義）
                    renderVNHistoryArea();
                }
            };
            area.appendChild(item);
        });
    }

    // ── 對外入口：核心（handleSend/handleDiffVNRefine/updateVNToolbarVisibility/還原舊版鈕）懶解析呼叫 ──
    win.OS_STUDIO_DIFF = {
        buildDiffRefinePrompt, extractConversationalText, applyDiffPatches, summarizeDiffResults,
        snapshotCurrentVNState, restoreFromVNSnapshot, renderVNHistoryArea,
    };
})();
