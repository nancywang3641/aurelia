// ----------------------------------------------------------------
// [檔案] status_core.js (V22 - 頭像數據庫版)
// 職責：
// 1. 監聽 <status> 標籤，解析表格並同步到世界書。
// 2. 🔥【白名單模式】只保留 [錢包], [當前已出場過的角色列表], [已有頭像數據庫] 到 [RPG_DATA]。
// 3. ❌ 已從白名單移除 [日誌] (Log)。
// 4. 🔥【好感度系統】自動讀取舊值，計算 AI 輸出的加減值 (+/-)，並更新總分。
// 5. 🔥 [角色] 區塊自動轉換為「當前已出場過的角色列表」(名字 | 當前好感值: X)。
// 6. 🔥 識別 [錢包] 並觸發 os_economy.js 進行實際交易。
// 7. 🔥 V20: 移除 C01/C02 等ID代號，改用「名字」作為唯一識別符。
// 8. 🔥 V22: 從「系統」世界書讀取 [隨機頭像素材]，自動生成 [已有頭像數據庫] 區塊。
// ----------------------------------------------------------------
(function() {
    console.log('🛡️ [Status Core] V22 頭像數據庫版已啟動');

    const STATUS_REGEX = /<status(?:\s+[^>]*)?>([\s\S]*?)<\/status>/i;

    // 🔥 追蹤已處理的消息 ID，避免重複處理
    const processedMessageIds = new Set();

    // --- 1. 基礎工具 ---
    function getChatIdentifier() {
        if (window.SillyTavern && window.SillyTavern.getContext) {
            const ctx = window.SillyTavern.getContext();
            if (ctx && ctx.chatId) {
                let fileName = ctx.chatId.split(/[\\/]/).pop().replace(/\.jsonl?$/i, '');
                return fileName.trim().replace(/\s+/g, '_');
            }
        }
        return "Unsaved_Chat_" + new Date().toISOString().slice(0,10);
    }

    function getDynamicTag() { return `[STATUS_${getChatIdentifier()}]`; }
    function showToast(msg, type = 'info') { if (window.toastr) window.toastr[type](msg); else console.log(`[Toast] ${msg}`); }

    function cleanStatusText(text) {
        if (!text) return text;
        let cleaned = text;
        cleaned = cleaned.replace(/<branches(?:\s+[^>]*)?>[\s\S]*?<\/branches>/gi, '');
        cleaned = cleaned.replace(/<選項(?:\s+[^>]*)?>[\s\S]*?<\/選項>/gi, '');
        cleaned = cleaned.replace(/<options(?:\s+[^>]*)?>[\s\S]*?<\/options>/gi, '');
        cleaned = cleaned.replace(/<summary(?:\s+[^>]*)?>[\s\S]*?<\/summary>/gi, '');
        cleaned = cleaned.replace(/<avatar(?:\s+[^>]*)?>[\s\S]*?<\/avatar>/gi, '');
        cleaned = cleaned.trim();
        return cleaned;
    }

    // 🔥 白名單過濾
    // 錢包 / 交易 LOG 已由 os_economy.js 統一寫入 [Wallet_Data] 條目，不再存入 [RPG_DATA]
    function shouldKeepSection(secName) {
        if (secName === '當前已出場過的角色列表') return true;
        if (secName === '已有頭像數據庫') return true;
        return false;
    }

    function isCharacterSection(secName) {
        return /^角色/i.test(secName) || /Character/i.test(secName) || /^Char/i.test(secName);
    }

    // === 同步開關（由黑金狀態欄面板寫入 localStorage）===
    function isSyncEnabled(key) { return localStorage.getItem(key) === '1'; }
    function isLogSection(secName) {
        return ['日誌','Log','LOG','事件','Event','記錄','RECORD'].some(k => secName.includes(k));
    }

    // === <profile> 區塊解析 ===
    // 輸出格式: { tableHeaders, tableRows: Map<名字, 整行文字>, mermaid }
    function parseProfileBlock(text) {
        const clean = text.replace(/<!--[\s\S]*?-->/g, ''); // 移除草稿注釋
        const lines = clean.split('\n');
        let tableHeaders = '';
        const tableRows = new Map();
        let inMermaid = false, mermaidBuf = [], mermaid = '';

        for (const raw of lines) {
            const t = raw.trim();
            if (!t) continue;
            if (!inMermaid && t === '```mermaid') { inMermaid = true; mermaidBuf = []; continue; }
            if (inMermaid) {
                if (t === '```') { inMermaid = false; mermaid = '```mermaid\n' + mermaidBuf.join('\n') + '\n```'; }
                else mermaidBuf.push(raw);
                continue;
            }
            if (!t.includes('|')) continue;
            if (/^\|?[\s\-:]+\|/.test(t)) continue; // 分隔行
            const cols = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
            if (!cols[0]) continue;
            if (/名字|名稱|姓名/i.test(cols[0])) { tableHeaders = t; }
            else if (cols[0] !== '--') { tableRows.set(cols[0], t); }
        }
        return { tableHeaders, tableRows, mermaid };
    }

    // === 寫入 [Character_Profiles] 世界書條目（de-dup 相同名字覆蓋更新）===
    async function syncProfileToLorebook(newData, bookName) {
        if (!isSyncEnabled('rpg_sync_rpgdata')) return;
        const chatId = getChatIdentifier();
        const COMMENT = `[Character_Profiles] - ${chatId}`;
        const KEY = `[PROFILE_${chatId}]`;
        try {
            const entries = await window.TavernHelper.getLorebookEntries(bookName);
            const exist = entries.find(e => e.comment === COMMENT);

            // 讀取舊條目中已有的角色行
            let mergedHeaders = newData.tableHeaders;
            const mergedRows = new Map();
            if (exist && exist.content) {
                let inTbl = false;
                for (const line of exist.content.split('\n')) {
                    const t = line.trim();
                    if (!t || t.startsWith('[') || t.startsWith('```')) { inTbl = false; continue; }
                    if (!t.includes('|') || /^\|?[\s\-:]+\|/.test(t)) continue;
                    const cols = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
                    if (!cols[0]) continue;
                    if (/名字|名稱|姓名/i.test(cols[0])) { mergedHeaders = t; inTbl = true; continue; }
                    if (inTbl && cols[0] !== '--') mergedRows.set(cols[0], t);
                }
            }

            // 新資料覆蓋同名角色，新角色追加
            newData.tableRows.forEach((row, name) => mergedRows.set(name, row));

            // 組裝最終內容
            const now = new Date().toLocaleString();
            const colCount = mergedHeaders ? mergedHeaders.replace(/^\|/, '').replace(/\|$/, '').split('|').length : 0;
            const sep = colCount > 0 ? '|' + Array(colCount).fill('---').join('|') + '|' : '';
            let content = `[角色檔案_更新: ${now}]\n`;
            if (mergedHeaders) content += mergedHeaders + '\n' + sep + '\n';
            mergedRows.forEach(row => { content += row + '\n'; });
            // mermaid：有新圖就換，否則保留舊圖
            if (newData.mermaid) {
                content += `\n[關係圖_更新: ${now}]\n${newData.mermaid}\n`;
            } else if (exist) {
                const oldMer = exist.content.match(/(```mermaid[\s\S]*?```)/);
                if (oldMer) content += `\n[關係圖]\n${oldMer[1]}\n`;
            }

            const entryData = {
                comment: COMMENT, keys: [KEY], content: content.trim(),
                constant: false, enabled: true, position: 'at_depth_as_system', depth: 1, order: 9998
            };
            if (exist) {
                await window.TavernHelper.updateLorebookEntriesWith(bookName, list =>
                    list.map(e => e.comment === COMMENT ? { ...e, ...entryData } : e));
            } else {
                await window.TavernHelper.createLorebookEntries(bookName, [entryData]);
            }
            showToast('✅ 角色檔案已更新', 'success');
        } catch (e) { console.error('[Status Core] Profile sync error:', e); }
    }

    // === 寫入 [RPG_LOG] 世界書條目 ===
    async function syncLogToLorebook(logStruct, bookName) {
        if (!isSyncEnabled('rpg_sync_rpglog')) return;
        const chatId = getChatIdentifier();
        const COMMENT = `[RPG_LOG] - ${chatId}`;
        const KEY = `[LOG_${chatId}]`;
        let content = '';
        for (const [secName, data] of Object.entries(logStruct)) {
            content += `[${secName}]\n`;
            data.rows.forEach((line, key) => { if (!key.endsWith('_raw')) content += line + '\n'; });
            content += '\n';
        }
        if (!content.trim()) return;
        try {
            const entries = await window.TavernHelper.getLorebookEntries(bookName);
            const exist = entries.find(e => e.comment === COMMENT);
            const entryData = {
                comment: COMMENT, keys: [KEY], content: content.trim(),
                constant: false, enabled: true, position: 'at_depth_as_system', depth: 1, order: 9997
            };
            if (exist) {
                await window.TavernHelper.updateLorebookEntriesWith(bookName, list =>
                    list.map(e => e.comment === COMMENT ? { ...e, ...entryData } : e));
            } else {
                await window.TavernHelper.createLorebookEntries(bookName, [entryData]);
            }
        } catch (e) { console.error('[Status Core] Log sync error:', e); }
    }

    // --- 🔥 2. 好感度核心邏輯 ---

    // A. 從舊存檔中提取好感度總值 { 名字: 數值 }
    function extractOldAffectionMap(struct) {
        const map = {};
        const section = struct['當前已出場過的角色列表'];
        if (!section || !section.rows) return map;

        section.rows.forEach((line, key) => {
            if (key.endsWith('_raw')) return;
            // key 就是名字，匹配格式: "當前好感值: 10" 或 "Affection: -5"
            const match = line.match(/(?:當前好感值|Affection|好感度)[:：]\s*([+-]?\d+)/i);
            if (match) {
                map[key] = parseInt(match[1], 10);
            }
        });
        return map;
    }

    // B. 從新消息中提取好感度變化量 { 名字: 變化值 }
    function extractAffectionDeltas(charData) {
        const deltas = {};
        if (!charData || !charData.rows) return deltas;

        // 嘗試從標題找到 "好感" 所在的列索引
        let colIndex = -1;
        if (charData.headers) {
            const headers = Array.isArray(charData.headers)
                ? charData.headers
                : charData.headers.split('|').map(s => s.trim());
            colIndex = headers.findIndex(h => /好感|心情|Mood|Affection/i.test(h));
        }

        charData.rows.forEach((val, key) => {
            if (!key.endsWith('_raw')) return; // 需要原始數組數據
            // val 是 [名字, 內心獨白, 好感度, 生理狀態]

            const name = val[0].trim(); // 第一列是名字
            let textToCheck = "";

            if (colIndex > -1 && val.length > colIndex) {
                textToCheck = val[colIndex];
            } else {
                // 如果找不到標題，搜尋整行文字
                textToCheck = val.join(' ');
            }

            // 搜尋帶符號的數字 (如 +5, -2)
            const changeMatch = textToCheck.match(/([+-]\d+)/);
            if (changeMatch) {
                deltas[name] = parseInt(changeMatch[1], 10);
            }
        });
        return deltas;
    }

    // C. 轉換並計算好感度 (Transform Logic) - V22: 恢復簡潔格式
    function simplifyAndCalcAffection(struct, oldAffectionMap) {
        const charSectionName = Object.keys(struct).find(secName => isCharacterSection(secName));
        if (!charSectionName) return;

        const charData = struct[charSectionName];
        if (charData.type !== 'table' || !charData.rows) return;

        // 1. 計算本次變化
        const deltas = extractAffectionDeltas(charData);

        // 2. 建立新表格
        const simplifiedData = {
            type: 'table',
            headers: '名字 | 數值',
            rows: new Map()
        };

        // 遍歷當前角色
        charData.rows.forEach((value, key) => {
            if (key.endsWith('_raw') && Array.isArray(value) && value.length >= 1) {
                const name = value[0].trim();
                if (name) {
                    // 計算公式: 舊值(默認0) + 變化值(默認0)
                    const oldVal = oldAffectionMap[name] || 0;
                    const change = deltas[name] || 0;
                    const newVal = oldVal + change;

                    const valStr = `當前好感值: ${newVal}`;
                    const simplifiedLine = `${name} | ${valStr}`;

                    simplifiedData.rows.set(name, simplifiedLine);
                    simplifiedData.rows.set(name + '_raw', [name, valStr]);
                }
            }
        });

        // 替換區塊
        delete struct[charSectionName];
        struct['當前已出場過的角色列表'] = simplifiedData;
    }

    // --- 🔥 V22: 從「系統」世界書讀取已有頭像的角色名 ---
    async function fetchAvatarNames() {
        const names = [];
        try {
            const entries = await window.TavernHelper.getLorebookEntries('系統');
            const targetEntry = entries.find(e => e.comment === '[隨機頭像素材]');

            if (targetEntry && targetEntry.content) {
                const lines = targetEntry.content.split('\n');
                lines.forEach(line => {
                    // 格式: 角色名:URL
                    const idx = line.indexOf(':');
                    if (idx > -1) {
                        const name = line.substring(0, idx).trim();
                        if (name) {
                            names.push(name);
                        }
                    }
                });
            }
        } catch (e) {
            console.warn('[Status Core] 讀取頭像數據庫失敗:', e);
        }
        return names;
    }

    // 🔥 V22: 生成 [已有頭像數據庫] 區塊
    function buildAvatarDatabaseSection(avatarNames) {
        if (!avatarNames || avatarNames.length === 0) return null;

        const section = {
            type: 'text',
            headers: '',
            rows: new Map()
        };

        // 添加說明行
        section.rows.set('_notice', '⚠️以下角色已有頭像數據,禁止重複輸出<avatar>標籤');

        // 添加角色名（每行一個）
        avatarNames.forEach(name => {
            section.rows.set(name, name);
        });

        return section;
    }

    // --- 3. 結構化解析器 ---
    function parseToStruct(text) {
        const struct = {};
        if (!text) return struct;

        const lines = text.split('\n');
        let currentSection = "General";

        lines.forEach(line => {
            const trimLine = line.trim();
            if (!trimLine) return;

            const sectionMatch = trimLine.match(/^\[([^\]]+)\]:?/);
            if (sectionMatch) {
                currentSection = sectionMatch[1].trim();
                if (!struct[currentSection]) {
                    struct[currentSection] = { type: 'unknown', headers: '', rows: new Map() };
                }
                return;
            }

            if (!struct[currentSection]) {
                struct[currentSection] = { type: 'unknown', headers: '', rows: new Map() };
            }
            const secData = struct[currentSection];

            if (trimLine.match(/^\|?[\s-]+\|[\s-]+\|/)) { secData.type = 'table'; return; }

            if (trimLine.includes('|')) {
                secData.type = 'table';
                let content = trimLine;
                if (content.startsWith('|')) content = content.slice(1);
                if (content.endsWith('|')) content = content.slice(0, -1);

                const parts = content.split('|').map(s => s.trim());
                if (parts.length === 0) return;

                const firstCol = parts[0];
                // V20: 不再使用 ID 格式判斷，直接用第一列（名字）作為 key
                // 但仍需區分標題行和數據行
                const isHeaderRow = /名字|職業|地點|服裝|好感|心情|狀態|名稱|金額|原因/i.test(firstCol);

                if (isHeaderRow && (!secData.headers || secData.headers === '')) {
                    secData.headers = trimLine;
                } else if (firstCol && firstCol !== '--') {
                    secData.rows.set(firstCol, trimLine);
                    secData.rows.set(firstCol + '_raw', parts);
                }
                return;
            }

            secData.type = 'text';
            secData.rows.set(trimLine, trimLine);
        });

        return struct;
    }

    // --- 4. 合併邏輯 ---
    function mergeStructs(oldStruct, newStruct) {
        const merged = { ...oldStruct };

        for (const [secName, newData] of Object.entries(newStruct)) {
            if (!shouldKeepSection(secName)) {
                delete merged[secName];
                continue;
            }

            if (!merged[secName]) {
                let headersValue = '';
                if (newData.headers) {
                    headersValue = Array.isArray(newData.headers) ? newData.headers.join(' | ') : String(newData.headers);
                }
                merged[secName] = {
                    type: newData.type,
                    headers: headersValue,
                    rows: new Map(newData.rows)
                };
                continue;
            }
            const oldData = merged[secName];

            if (newData.type === 'table') {
                if (newData.headers) {
                    const hStr = Array.isArray(newData.headers) ? newData.headers.join(' | ') : String(newData.headers);
                    if (hStr.trim()) oldData.headers = hStr;
                }

                const newIds = new Set();
                newData.rows.forEach((val, key) => { if (!key.endsWith('_raw')) newIds.add(key); });

                newIds.forEach(id => {
                    oldData.rows.delete(id);
                    oldData.rows.delete(id + '_raw');
                });

                newData.rows.forEach((val, key) => {
                    oldData.rows.set(key, val);
                });
                oldData.type = 'table';
            } else {
                oldData.rows.clear();
                newData.rows.forEach((line, key) => { oldData.rows.set(key, line); });
            }
        }
        return merged;
    }

    // --- 5. 序列化 ---
    function serializeStruct(struct) {
        let output = "";
        for (const [secName, data] of Object.entries(struct)) {
            if (!shouldKeepSection(secName)) continue;

            output += `\n[${secName}]\n`;
            if (data.type === 'table') {
                if (data.headers) {
                    const headerStr = Array.isArray(data.headers) ? data.headers.join(' | ') : String(data.headers);
                    if (headerStr.trim()) {
                        output += headerStr + "\n";
                        const pipeCount = (headerStr.match(/\|/g) || []).length;
                        if (pipeCount > 0) {
                            const separator = "|" + Array(pipeCount).fill("---").join("|") + "|";
                            output += separator + "\n";
                        }
                    }
                }
                data.rows.forEach((line, key) => {
                    if (!key.endsWith('_raw')) output += line + "\n";
                });
            } else {
                data.rows.forEach(line => output += line + "\n");
            }
            output += "\n";
        }
        return output.trim();
    }

    // --- 6. 錢包處理 ---
    function processWalletLogs(struct) {
        const walletSection = struct['錢包'] || struct['錢包LOG'] || struct['Wallet Log'] || struct['Wallet'] || struct['交易LOG'];
        if (walletSection && walletSection.rows) {
            const win = window.parent || window;
            if (!win.OS_ECONOMY || typeof win.OS_ECONOMY.processAiTransaction !== 'function') return;

            walletSection.rows.forEach((val, key) => {
                if (key.endsWith('_raw') && Array.isArray(val) && val.length >= 3) {
                    const id = val[0];      // T01
                    const amount = val[1];  // -500
                    const reason = val[2];  // 買藥水
                    win.OS_ECONOMY.processAiTransaction(id, amount, reason);
                }
            });
        }
    }

    // --- 7. 主流程 ---
    async function handleMessage(messageId) {
        if (processedMessageIds.has(messageId)) return;
        processedMessageIds.add(messageId);

        setTimeout(async () => {
            try {
                const msgs = await window.TavernHelper.getChatMessages(messageId);
                if (!msgs || msgs.length === 0) { processedMessageIds.delete(messageId); return; }

                const msg = msgs[0];
                const rawContent = msg.message || msg.mes || msg.content || "";

                // === 偵測 <status> 與 <profile> 兩種區塊 ===
                const statusMatch  = rawContent.match(STATUS_REGEX);
                const profileMatch = rawContent.match(/<profile>([\s\S]*?)<\/profile>/i);
                if (!statusMatch && !profileMatch) { processedMessageIds.delete(messageId); return; }

                // 取得世界書（所有同步路徑共用）
                const _cb = window.TavernHelper.getCharWorldbookNames('current');
                const bookName = _cb && _cb.primary ? _cb.primary : null;
                if (!bookName) { showToast('⚠️ 未綁定世界書，跳過同步', 'warning'); processedMessageIds.delete(messageId); return; }

                // ── A. 處理 <status> 區塊 ──────────────────────────────────
                if (statusMatch) {
                    let newStatusText = cleanStatusText(statusMatch[1].trim());
                    if (newStatusText) {
                        const newStruct = parseToStruct(newStatusText);

                        // 1. 錢包（無論開關，都要處理）
                        processWalletLogs(newStruct);

                        // 2. 日誌區塊 → [RPG_LOG]（有開關）
                        const logStruct = {};
                        Object.keys(newStruct).forEach(k => { if (isLogSection(k)) logStruct[k] = newStruct[k]; });
                        if (Object.keys(logStruct).length > 0) {
                            await syncLogToLorebook(logStruct, bookName);
                        }

                        // 3. [RPG_DATA]：角色表 + 頭像庫（有開關）
                        if (isSyncEnabled('rpg_sync_rpgdata')) {
                            const dynamicTag = getDynamicTag();
                            const targetComment = `[RPG_DATA] - ${getChatIdentifier()}`;
                            const entries = await window.TavernHelper.getLorebookEntries(bookName);
                            const existEntry = entries.find(e => e.comment === targetComment);
                            const avatarNames = await fetchAvatarNames();

                            let finalContent = "";
                            if (existEntry && existEntry.content) {
                                try {
                                    const oldStruct = parseToStruct(existEntry.content);
                                    simplifyAndCalcAffection(newStruct, extractOldAffectionMap(oldStruct));
                                    const mergedStruct = mergeStructs(oldStruct, newStruct);
                                    const avatarSection = buildAvatarDatabaseSection(avatarNames);
                                    if (avatarSection) mergedStruct['已有頭像數據庫'] = avatarSection;
                                    finalContent = serializeStruct(mergedStruct);
                                } catch (err) {
                                    console.error("合併錯誤", err);
                                    simplifyAndCalcAffection(newStruct, {});
                                    const filteredStruct = {};
                                    Object.keys(newStruct).forEach(k => { if (shouldKeepSection(k)) filteredStruct[k] = newStruct[k]; });
                                    const avatarSection = buildAvatarDatabaseSection(avatarNames);
                                    if (avatarSection) filteredStruct['已有頭像數據庫'] = avatarSection;
                                    finalContent = serializeStruct(filteredStruct);
                                }
                            } else {
                                simplifyAndCalcAffection(newStruct, {});
                                const filteredStruct = {};
                                Object.keys(newStruct).forEach(k => { if (shouldKeepSection(k)) filteredStruct[k] = newStruct[k]; });
                                const avatarSection = buildAvatarDatabaseSection(avatarNames);
                                if (avatarSection) filteredStruct['已有頭像數據庫'] = avatarSection;
                                finalContent = serializeStruct(filteredStruct);
                            }

                            // 若內容為空（角色 section 名稱不符）→ console 提示，不強行創建空條目
                            if (!finalContent.trim()) {
                                console.warn('[Status Core] RPG_DATA 內容為空，可能是 <status> 中找不到角色 section（需以 角色/Character/Char 開頭）');
                                showToast('⚠️ RPG_DATA：找不到角色區塊，跳過', 'warning');
                                return;
                            }

                            // 寫入 [RPG_DATA]
                            if (existEntry) {
                                await window.TavernHelper.updateLorebookEntriesWith(bookName, list =>
                                    list.map(e => e.comment === targetComment
                                        ? { ...e, content: finalContent, keys: [dynamicTag], position: e.position || 'at_depth_as_system' }
                                        : e));
                            } else {
                                await window.TavernHelper.createLorebookEntries(bookName, [{
                                    comment: targetComment, keys: [dynamicTag], content: finalContent,
                                    constant: false, enabled: true, position: 'at_depth_as_system', depth: 1, order: 9999
                                }]);
                            }

                            // 注入 KEY
                            try {
                                const lastMessageId = await window.TavernHelper.getLastMessageId();
                                if (lastMessageId !== null && lastMessageId >= 0) {
                                    const lastMsgs = await window.TavernHelper.getChatMessages(-1);
                                    if (lastMsgs && lastMsgs.length > 0) {
                                        const cur = lastMsgs[0].message || lastMsgs[0].mes || '';
                                        if (!cur.includes(dynamicTag)) {
                                            await window.TavernHelper.setChatMessages([{
                                                message_id: lastMessageId,
                                                message: cur + (cur ? ' ' : '') + dynamicTag,
                                                mes:     cur + (cur ? ' ' : '') + dynamicTag
                                            }], { refresh: 'affected' });
                                        }
                                    }
                                }
                            } catch (keyError) { console.warn('KEY注入失敗', keyError); }

                            showToast('✅ 狀態與好感度已更新', 'success');
                            if (window.eventEmit) window.eventEmit('RPG_STATUS_UPDATED');
                        }
                        // [RPG_DATA] 關閉時僅靜默跳過，不顯示提示
                    }
                }

                // ── B. 處理 <profile> 區塊 → [Character_Profiles]（共用 rpg_sync_rpgdata 開關）
                if (profileMatch) {
                    const profileData = parseProfileBlock(profileMatch[1]);
                    if (profileData.tableRows.size > 0) {
                        await syncProfileToLorebook(profileData, bookName);
                    }
                }

            } catch (e) {
                console.error('[Status Core Error]', e);
                processedMessageIds.delete(messageId);
            }
        }, 800);
    }

    function init() {
        if (!window.TavernHelper) { setTimeout(init, 1000); return; }
        if (window.eventOn && window.tavern_events) {
            window.eventOn(window.tavern_events.MESSAGE_RECEIVED, (id) => handleMessage(id));
            if (window.tavern_events.CHAT_CHANGED) {
                window.eventOn(window.tavern_events.CHAT_CHANGED, () => processedMessageIds.clear());
            }
            console.log('🛡️ [Status Core] V22 Ready');
        }
    }

    init();
})();