/**
 * os_story_tools.js — 故事管理工具（統一收進「瀅瀅的故事日誌」）
 * 內容：大總結（生成/更新 + 編輯模板 + 合併）— 原 rpg/status_panel.js
 *       隱藏對話（/hide /unhide）— 原 vn_story/vn_reader.js
 * 作用對象：目前開啟的酒館對話。
 * 對外：window.OS_STORY_TOOLS.openPanel(container) / closePanel()
 *
 * 註：函式幾乎逐字搬移、保留原本的 element id，行為與原檔一致；只把 onclick 的
 *     window.RPG_PANEL / window.VN_READER 改成 window.OS_STORY_TOOLS。
 */
(function () {
    'use strict';
    console.log('[OS] 載入故事管理工具 (os_story_tools.js)...');
    const win = window.parent || window;
    const API = {};

    // === 取目前對話 id（沿用原 status_panel 邏輯）===
    function getChatIdentifier() {
        if (window.parent.SillyTavern && window.parent.SillyTavern.getContext) {
            const ctx = window.parent.SillyTavern.getContext();
            if (ctx && ctx.chatId) {
                return ctx.chatId.split(/[\\/]/).pop().replace(/\.jsonl?$/i, '').trim().replace(/\s+/g, '_');
            }
        }
        return "Unsaved_Chat_" + new Date().toISOString().slice(0, 10);
    }

    // === 酒館原生 API：背景讀聊天檔（不靠記憶體 chat 陣列、不展開、不靠酒館助手）===
    function _stCtx() { try { return win.SillyTavern?.getContext?.() || null; } catch (e) { return null; } }
    async function _stPost(path, body) {
        const ctx = _stCtx();
        if (!ctx || typeof ctx.getRequestHeaders !== 'function') return null;
        const f = (win.fetch || fetch);
        const resp = await f(path, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) });
        if (!resp.ok) return null;
        return await resp.json();
    }
    function _curAvatar() { const ctx = _stCtx(); return (ctx && !ctx.groupId) ? (ctx.characters?.[ctx.characterId]?.avatar || null) : null; }
    function _curChatFile() { const ctx = _stCtx(); return ctx?.chatId || null; }   // 聊天檔名(無副檔名)

    // 真實對話數 = /api/chats/search 的 message_count(=檔案訊息數)；最後樓號 = -1。就是聊天列表那個「💬 數字」。
    async function _apiLastId() {
        try {
            const avatar = _curAvatar(), chatFile = _curChatFile();
            if (!avatar || !chatFile) return null;
            const data = await _stPost('/api/chats/search', { query: '', avatar_url: avatar, group_id: null });
            if (!Array.isArray(data)) return null;
            const norm = s => String(s || '').replace(/\.jsonl?$/i, '').trim();
            const target = norm(chatFile);
            const hit = data.find(c => norm(c.file_name) === target);
            if (hit && typeof hit.message_count === 'number' && hit.message_count > 0) return hit.message_count - 1;
        } catch (e) { console.warn('[OS_STORY_TOOLS] /api/chats/search 失敗:', e); }
        return null;
    }

    // 背景讀「整個聊天檔」的訊息陣列(已去掉開頭 metadata 行)；讀不到回 null
    async function _apiFullChat() {
        try {
            const avatar = _curAvatar(), chatFile = _curChatFile();
            if (!avatar || !chatFile) return null;
            const arr = await _stPost('/api/chats/get', { avatar_url: avatar, file_name: chatFile });
            if (Array.isArray(arr) && arr.length) return arr.slice(1);   // [0] 是 chat_metadata
        } catch (e) { console.warn('[OS_STORY_TOOLS] /api/chats/get 失敗:', e); }
        return null;
    }

    // === 取真實最後樓號：優先酒館原生 API(背景讀檔)，後備讀記憶體陣列 ===
    async function _trueLastId() {
        const api = await _apiLastId();
        if (api != null) return api;
        let best = -1;
        try { const c = win.SillyTavern?.getContext?.()?.chat; if (Array.isArray(c) && c.length) best = Math.max(best, c.length - 1); } catch (e) {}
        try { const TH = win.TavernHelper; if (TH?.getLastMessageId) { const lid = await TH.getLastMessageId(); if (typeof lid === 'number' && !isNaN(lid)) best = Math.max(best, lid); } } catch (e) {}
        return best >= 0 ? best : null;
    }
    // 記憶體 chat 陣列的最後 index —— 給「對陣列操作」用(注入 KEY / /hide)；陣列被截短時即截短後的最後一格。
    function _arrayLastId() { try { const c = win.SillyTavern?.getContext?.()?.chat; if (Array.isArray(c) && c.length) return c.length - 1; } catch (e) {} return null; }

    // ====================================================================
    // A. 大總結
    // ====================================================================
    const SUMMARY_DEFAULT_TPL = `要求：
- 注明这是第{{count}}次大总结。
- 直接陈述事实、含具体时间、省略冗余；不回避敏感内容、不评价、不修饰、不加粗。

【精简原则·重要】
- 各格只写"硬信息"，不写长段散文(细节由向量召回补)。
- 信息分三层：永久层(人设铁律/世界规则/不可逆关系与权力变化/未回收伏笔)→保留绝不删；当前层(位置/进行中任务/最近状态)→覆盖更新；可丢弃层(过程描写/消耗品/过客NPC/已完成琐事/情境台词)→删除。
- 事件只记"不可逆结果"、不记过程；久远的多个事件压成一行"阶段节点"，最近5~8个事件保留逐笔。
- 台词仅留"未来会被回调"的原则性发言，其余删。

格式如下（区块标题与"结语/故事标题"务必原样保留）：
【大总结(第{{count}}次)】
【事件表】（久远的合并成阶段节点，只记不可逆结果、不写过程）
時間 | 关键事件 | 不可逆结果/影响 | 关键角色 | 关键台词(选填) |
| :--- | :--- | :--- | :--- | :--- |

【角色表】
- 所有对剧情有影响的角色均需出现(包括没有实体的角色)
- 姓名用角色的慣用稱呼即可（有正式全名就用全名）；同一角色前後務必用同一個名字，別這次全名、下次暱稱，以免同一人重複入表
姓名 | 身份 | 性格核心(50字内) | 当前状态/位置 | 与MC关系+强度(1-10) | 髮色 | 髮型 | 眼色 | 伏笔/备注 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |


【關係圖譜】
角色A | 角色B | 關係 | 強度(1-10) | 當前描述 |
| :--- | :--- | :--- | :--- | :--- |


【結算清單】（只记有后续影响的）
| 結算事件 | 影响/后续 | 參與角色 |
| :--- | :--- | :--- |

【物品表】（只記關鍵/有後續影響的物品；過客雜物不入表。狀態必為下列五種之一；已交付/已消耗/損壞的「保留並改狀態」別刪掉，好讓劇情記得這件事發生過；同一物品只一列、別因數量不同或叫法不同重複入表；不要寫備註）
物品名 | 狀態(在庫/使用中/已交付/已消耗/損壞) |
| :--- | :--- |

【注意規範】（跑團中新確立的「世界/區域規則」：村莊規則、城市律法、組織禁忌、特殊機制等，常是 AI 自己補的設定；永久層、绝不删）
規範(人事物/地點) | 規範描述 |
| :--- | :--- |

【性事紀】(以免出現AI角色後續忘記有過性事，導致角色OOC變成拔屌無情的渣男渣女)
| 性事事件 | 事件描述 | 參與角色 |
| :--- | :--- | :--- |

【結語】(必填，200字以內純文字。這是「整個故事至今」的滾動總述，當作長期總記憶用：把上方給你的「上一版結語」當底稿，融入這次新劇情後重新改寫成一段，全面取代舊版——不是只寫這一段、也不要分段累積堆疊。需涵蓋主線走向、當前處境、尚未了結的承諾/伏筆；不要加任何標題、序號、表格或裝飾符號)

【故事標題】(只有「第一次」總結才填——給這個聊天室下一個總標題，30字以內純文字一行、不要引號或裝飾；第二次起系統會自動移除此區塊、不用再填)`;

    function getSummaryTemplate() {
        return localStorage.getItem('sp_summary_tpl') || SUMMARY_DEFAULT_TPL;
    }

    // ===== 結構化合併：把「這次增量」疊到「上一份累積總結」，不重濾舊內容 =====
    // 事件類(事件表/代辦/結算/性事紀)→ 新列接在後面；角色/物品類 → 同名(第一欄)更新、新名加後面；
    // 結語/場景索引 → 取新；故事標題 → 保留最早。表頭沒有前導「|」也吃得到（用「含 |」判斷）。
    // 合法區塊名白名單：固定繁簡/舊區塊 + 從當前模板動態抽（支援自訂模板）。
    //   ★ 內容裡的物品/技能名也常寫成 【坐骑缰绳】【熔炉之韧】，若把每個 【】 都當區塊標題 → 表格被從中間切碎、合併後亂飛。
    //   只認白名單內的才算區塊標題，其餘 【...】 一律當內容留在 body。
    function _knownSectionHeaders() {
        const s = new Set([
            '事件表','角色表','關係圖譜','关系图谱','結算清單','结算清单','物品表',
            '注意規範','注意规范','注意規範/記憶事項表','注意规范/记忆事项表','關鍵狀態/記憶','关键状态/记忆','關鍵狀態','关键状态',
            '性事紀','性事记','結語','结语','故事標題','故事标题',
            '代辦清單','代办清单','場景索引','场景索引'
        ]);
        try {
            const tpl = getSummaryTemplate();   // 自訂模板的區塊名也抽進來
            const re = /【([^】]+)】/g; let mm;
            while ((mm = re.exec(tpl)) !== null) { const n = mm[1].trim(); if (n && !/大总结|大總結/.test(n)) s.add(n); }
        } catch (e) {}
        return s;
    }
    // 第二道保險：把「內容裡」的物品/技能名 【X】 正規化成「X」(只用在已切好的 body、標題不動)，
    //   存進去就乾淨、跟區塊分隔符 【】 徹底不撞、顯示也更清爽。
    function _normContentBrackets(body) {
        return String(body == null ? '' : body).replace(/【([^】]+)】/g, '「$1」');
    }
    function _splitSummarySections(text) {
        const known = _knownSectionHeaders();
        const res = []; const re = /【([^】]+)】/g; let m, idx = 0, header = null;
        while ((m = re.exec(text)) !== null) {
            const name = m[1].trim();
            const isSection = /^大总结|^大總結/.test(name) || known.has(name);   // 標題行(保險) 或 白名單區塊
            if (!isSection) continue;                                              // 內容的物品/技能名 → 不切、留在當前 body
            if (header !== null) res.push({ header: header.trim(), body: text.slice(idx, m.index).trim() });
            header = name; idx = re.lastIndex;
        }
        if (header !== null) res.push({ header: header.trim(), body: text.slice(idx).trim() });
        return res;
    }
    function _parseMdTable(body) {
        const out = { header: null, sep: null, rows: [], extra: [] };
        for (const raw of String(body).split('\n')) {
            const l = raw.trim();
            if (!l) continue;
            if (/-{2,}/.test(l) && /^[|\s:\-]+$/.test(l)) { if (out.sep === null) out.sep = l; continue; }  // :--- 分隔列
            if (l.includes('|')) { if (out.header === null) out.header = l; else out.rows.push(l); }
            else if (!/^「[^」]*」$/.test(l) && l !== '与' && l !== '與') out.extra.push(l);   // 丟掉舊版亂掉折進來的單名碎片(「魔力共振网络」/与…)
        }
        return out;
    }
    function _buildMdTable(t) {
        const lines = [];
        if (t.extra && t.extra.length) lines.push(t.extra.join('\n'));
        if (t.header) lines.push(t.header);
        if (t.sep) lines.push(t.sep);
        lines.push(...t.rows);
        return lines.join('\n');
    }
    function _firstCell(row) {
        return (String(row).replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|')[0] || '').trim();
    }
    // 去重正規化：物品表常因「數量括號(2颗)/叫法不同/簡繁」生分身(毒腺/极品毒腺/毒腺(2颗)各一列)→ 膨脹。
    //   合併比對前把這些雜訊抹平，讓同一物品落同一格、只留最新一列。角色表不正規化(怕把不同角色併掉)。
    function _normMergeKey(header, raw) {
        let k = String(raw == null ? '' : raw).trim();
        if (header === '物品表') {
            k = k.replace(/[（(][^（()]*[)）]/g, '')       // 去括號內容(數量/說明)
                 .replace(/[x×]\s*\d+\s*$/i, '')          // 去尾綴 x2
                 .replace(/[「」『』“”"'·,，。、\s]/g, '')   // 去標點/空白
                 .replace(/[極极]品|[頂顶]級|[稀]有/g, ''); // 去品階形容(极品毒腺 = 毒腺)
        }
        return k || String(raw == null ? '' : raw).trim();
    }
    function _mergeSection(header, prevBody, incBody) {
        const APPEND = ['事件表', '結算清單', '结算清单', '性事紀', '性事记'];
        const MERGEKEY = ['角色表', '物品表', '關係圖譜', '关系图谱', '注意規範', '注意規範/記憶事項表', '注意规范/记忆事项表'];
        if (APPEND.includes(header)) {
            const tp = _parseMdTable(prevBody), ti = _parseMdTable(incBody);
            return _buildMdTable({ header: tp.header || ti.header, sep: tp.sep || ti.sep, rows: [...tp.rows, ...ti.rows], extra: tp.extra.length ? tp.extra : ti.extra });
        }
        if (MERGEKEY.includes(header)) {
            const tp = _parseMdTable(prevBody), ti = _parseMdTable(incBody);
            const order = [], map = {};
            const add = r => { const k = _normMergeKey(header, _firstCell(r)); if (!(k in map)) order.push(k); map[k] = r; };   // 同(正規化)名更新、新名加後面
            tp.rows.forEach(add); ti.rows.forEach(add);
            // 物品表偏好「新版表頭」(2 欄、無備註)，讓舊 3 欄資料隨新生成收斂；其餘區塊沿用既有表頭
            const head = (header === '物品表') ? (ti.header || tp.header) : (tp.header || ti.header);
            const sep  = (header === '物品表') ? (ti.sep || tp.sep) : (tp.sep || ti.sep);
            return _buildMdTable({ header: head, sep, rows: order.map(k => map[k]), extra: tp.extra.length ? tp.extra : ti.extra });
        }
        // 純文字區塊：濾掉混進來的「表格列 / 單名碎片」(舊版亂掉的殘留會折進這些尾端文字區 → 你看到的「下面多餘東西」)
        const _textOnly = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean)
            .filter(x => !x.startsWith('|') && !/^「[^」]*」$/.test(x) && x !== '与' && x !== '與');
        if (['結語', '结语'].includes(header)) { const t = _textOnly(incBody); return (t.length ? t : _textOnly(prevBody)).join('\n'); }   // 結語：滾動總述，取最新一版(AI 已把舊段融進來)；這次沒寫才退回舊的
        if (['故事標題', '故事标题'].includes(header)) return (_textOnly(prevBody)[0] || _textOnly(incBody)[0] || '');   // 故事標題：只取標題那行、丟尾端殘留
        return incBody || prevBody;   // 其他純文字 → 取新
    }
    function _structuredMerge(incFull, prevFull, summaryCount, lastTxt) {
        try {
            if (!prevFull) return incFull;
            const stripHead = t => String(t).replace(/^\s*【大总结[^】]*】[^\n]*\n*(Last:[^\n]*\n*)?/i, '');
            const prevSecs = _splitSummarySections(stripHead(prevFull));
            const incSecs = _splitSummarySections(stripHead(incFull));
            const incMap = {}; incSecs.forEach(s => { incMap[s.header] = s; });
            const used = new Set(); const out = [];
            const KEEPOLD = ['故事標題', '故事标题'];
            const DROP = ['場景索引', '场景索引', '代辦清單', '代办清单'];   // 已棄用區塊：合併時直接丟掉、不再輸出
            for (const p of prevSecs) {
                if (DROP.includes(p.header)) { used.add(p.header); continue; }
                const i = incMap[p.header];
                if (!i) { out.push(p); continue; }
                used.add(p.header);
                if (KEEPOLD.includes(p.header)) { out.push(p); continue; }
                out.push({ header: p.header, body: _mergeSection(p.header, p.body, i.body) });
            }
            for (const i of incSecs) { if (!used.has(i.header) && !DROP.includes(i.header)) out.push(i); }   // 增量有、舊的沒有 → 加後面
            const body = out.map(s => `【${s.header}】\n${_normContentBrackets(s.body)}`).join('\n\n');   // 內容【】→「」，存進去乾淨不再撞
            return `【大总结(第${summaryCount}次)】${lastTxt}\n\n${body}`;
        } catch (e) {
            console.warn('[大總結] 結構化合併失敗，改用增量本身:', e);
            return incFull;
        }
    }

    // ── 注入壓縮：把「全文存檔」壓成「每輪實際送主模型」的精簡版（存檔保留全部、注入只送活著的狀態）──
    //   事件表→只留最近 N 筆；物品表→只留 在庫/使用中(已交付/已消耗/損壞 不送)；結算清單→丟(跟事件/結語重複)；
    //   性事紀→只留最近數筆；結語(總記憶)/角色表/關係圖譜/注意規範→全送。供 os_summary_inject 每輪呼叫。
    function _stripSummaryHead(t) { return String(t == null ? '' : t).replace(/^\s*【大总结[^】]*】[^\n]*\n*(Last:[^\n]*\n*)?/i, ''); }
    const _ITEM_DEAD = /已交付|已消耗|已用完|消耗完|損壞|损坏|損毀|损毁|報廢|报废/;
    API.buildInjectionPayload = function (fullContent, opts) {
        const o = opts || {};
        const eventsKeep = (o.eventsKeep != null) ? o.eventsKeep : 10;
        const sexKeep = (o.sexKeep != null) ? o.sexKeep : 5;
        try {
            const secs = _splitSummarySections(_stripSummaryHead(fullContent));
            const DROP = new Set(['結算清單', '结算清单', '場景索引', '场景索引', '代辦清單', '代办清单', '故事標題', '故事标题']);
            const out = [];
            for (const s of secs) {
                const h = s.header;
                if (DROP.has(h)) continue;
                let body = s.body;
                if (h === '事件表') {
                    const t = _parseMdTable(body);
                    if (t.rows.length > eventsKeep) t.rows = t.rows.slice(-eventsKeep);   // 只留最近 N 筆事件(舊的靠結語涵蓋)
                    body = _buildMdTable(t);
                } else if (h === '物品表') {
                    const t = _parseMdTable(body);
                    t.rows = t.rows.filter(r => !_ITEM_DEAD.test(r));   // 已交付/已消耗/損壞 不注入(存檔仍保留)
                    if (!t.rows.length) continue;                       // 全沒活物品 → 整塊省略
                    body = _buildMdTable(t);
                } else if (h === '性事紀' || h === '性事记') {
                    const t = _parseMdTable(body);
                    if (t.rows.length > sexKeep) t.rows = t.rows.slice(-sexKeep);
                    body = _buildMdTable(t);
                }
                if (String(body || '').trim()) out.push(`【${h}】\n${String(body).trim()}`);
            }
            return out.join('\n\n').trim();
        } catch (e) {
            console.warn('[大總結] buildInjectionPayload 失敗，退回全文:', e);
            return _stripSummaryHead(fullContent).trim();
        }
    };

    // ── 讀「目前 chatId 的大總結」：OS_DB 為主；OS_DB 沒有但世界書有舊版 → 一次性遷移進 OS_DB(舊聊天無痛接軌) ──
    async function _migrateSummaryFromLorebook(chatId) {
        try {
            const helper = window.parent.TavernHelper;
            const bookName = helper?.getCurrentCharPrimaryLorebook?.();
            if (!bookName || !helper?.getLorebookEntries) return null;
            const entries = await helper.getLorebookEntries(bookName);
            const olds = (entries || []).filter(e => e.comment && e.comment.includes(`[大总结] - ${chatId}`));
            if (!olds.length) return null;
            const _seq = e => { const m = (e.comment || '').match(/第\s*(\d+)\s*次/); return m ? parseInt(m[1]) : 0; };
            olds.sort((a, b) => _seq(b) - _seq(a));
            const latest = olds[0];
            const content = latest.content || '';
            if (!content) return null;
            const lm = content.match(/Last:\s*(\d+)/i);
            // 搬出世界書：把舊大總結條目停用（資料已遷進 OS_DB，避免和新的程式注入雙重觸發）。
            //   fire-and-forget：不 await，免得在 GENERATION_STARTED 當下卡住生成；只是停用 dormant 條目、晚一拍也無妨。
            try {
                if (helper.setLorebookEntries) {
                    const ups = olds.filter(e => e.uid != null && e.enabled !== false).map(e => ({ uid: e.uid, enabled: false }));
                    if (ups.length) helper.setLorebookEntries(bookName, ups)
                        .then(() => console.log('[大總結] 已停用世界書舊條目 ' + ups.length + ' 筆'))
                        .catch(e => console.warn('[大總結] 停用舊世界書條目失敗（不影響遷移）:', e));
                }
            } catch (e) { console.warn('[大總結] 停用舊世界書條目失敗（不影響遷移）:', e); }
            return { content, summaryCount: _seq(latest) || olds.length, lastId: lm ? parseInt(lm[1]) : null, title: '', bgCacheId: '' };
        } catch (e) { return null; }
    }
    async function _loadTavernSummary(chatId) {
        try {
            const osDb = window.parent.OS_DB;
            if (osDb?.getTavernSummary) {
                const rec = await osDb.getTavernSummary(chatId);
                if (rec && rec.content) return rec;
            }
            const migrated = await _migrateSummaryFromLorebook(chatId);
            if (migrated && osDb?.saveTavernSummary) { try { await osDb.saveTavernSummary(chatId, migrated); console.log('[大總結] 已把世界書舊版遷移進 OS_DB'); } catch (e) {} }
            return migrated;
        } catch (e) { return null; }
    }
    API._loadTavernSummary = _loadTavernSummary;
    API.getChatId = getChatIdentifier;   // 注入器/外部要用「跟存檔 key 同款」的 chatId，從這拿(別用 OS_DB.currentChatId，空白正規化不同)

    // 給 os_summary_inject 每輪呼叫：讀目前 chatId 的大總結 → 回壓縮後注入字串(沒有就回 '')
    API.getCurrentInjectionPayload = async function (opts) {
        try {
            const chatId = getChatIdentifier();
            if (!chatId) return '';
            const rec = await _loadTavernSummary(chatId);
            if (!rec || !rec.content) return '';
            return API.buildInjectionPayload(rec.content, opts);
        } catch (e) { console.warn('[大總結] getCurrentInjectionPayload 失敗:', e); return ''; }
    };

    API.openSummaryTemplateModal = function () {
        document.getElementById('rpg-summary-tpl-modal').classList.add('active');
        document.getElementById('sp-summary-tpl-area').value = getSummaryTemplate();
    };

    API.saveSummaryTemplate = function () {
        localStorage.setItem('sp_summary_tpl', document.getElementById('sp-summary-tpl-area').value);
        document.getElementById('rpg-summary-tpl-modal').classList.remove('active');
    };

    API.resetSummaryTemplate = function () {
        if (!confirm('確定還原為預設模板？')) return;
        localStorage.removeItem('sp_summary_tpl');
        document.getElementById('sp-summary-tpl-area').value = SUMMARY_DEFAULT_TPL;
    };

    API.openMergeSummaryModal = async function () {
        document.getElementById('rpg-merge-modal').classList.add('active');
        const listEl = document.getElementById('sp-merge-list');
        listEl.innerHTML = '載入中...';
        try {
            const helper = window.parent.TavernHelper;
            if (!helper) throw new Error('無 TavernHelper');
            const bookName = helper.getCurrentCharPrimaryLorebook();
            if (!bookName) throw new Error('未綁定世界書');
            const entries = await helper.getLorebookEntries(bookName);
            const chatId = getChatIdentifier();
            const summaries = entries.filter(e => e.comment && e.comment.includes(`[大总结] - ${chatId}`));
            if (summaries.length === 0) { listEl.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">此對話暫無大總結</div>'; return; }
            summaries.sort((a, b) => (a.uid || 0) - (b.uid || 0));
            listEl.innerHTML = '';
            summaries.forEach(e => {
                const row = document.createElement('label');
                row.style.cssText = 'display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:7px 9px; border:1px solid #e8d8c0; border-radius:6px; background:#fff8f0;';
                const cb = document.createElement('input');
                cb.type = 'checkbox'; cb.value = String(e.uid); cb.dataset.bookName = bookName;
                cb.style.cssText = 'margin-top:2px; flex-shrink:0; accent-color:#c97a8e;';
                const text = document.createElement('span');
                text.style.cssText = 'font-size:11px; color:#5a4836; line-height:1.5;';
                const preview = (e.content || '').slice(0, 80).replace(/\n/g, ' ');
                text.innerHTML = `<span style="color:#c97a8e; font-size:10px;">${e.comment || ''}</span><br>${preview}${(e.content || '').length > 80 ? '...' : ''}`;
                row.appendChild(cb); row.appendChild(text);
                listEl.appendChild(row);
            });
        } catch (e) { listEl.innerHTML = `<div style="color:#ff4444; padding:10px;">❌ 載入失敗: ${e.message}</div>`; }
    };

    API.executeMergeSummaries = async function () {
        const listEl = document.getElementById('sp-merge-list');
        const checked = Array.from(listEl.querySelectorAll('input[type="checkbox"]:checked'));
        if (checked.length < 2) { alert('請至少勾選 2 個條目進行合併'); return; }
        const userNote = (document.getElementById('sp-merge-note').value || '').trim();
        document.getElementById('rpg-merge-modal').classList.remove('active');
        const btn = document.getElementById('btn-grand-summary');
        const origText = btn ? btn.innerText : '';
        if (btn) { btn.innerText = '合併中 (請勿關閉)...'; btn.classList.add('spinning'); }
        try {
            const helper = window.parent.TavernHelper;
            const bookName = checked[0].dataset.bookName;
            const allEntries = await helper.getLorebookEntries(bookName);
            const _seq = e => { const m = (e.comment || '').match(/第\s*(\d+)\s*次/); return m ? parseInt(m[1]) : 0; };
            const selected = checked.map(cb => allEntries.find(e => String(e.uid) === cb.value)).filter(Boolean).sort((a, b) => _seq(a) - _seq(b));
            const combined = '';   // (舊：把全文丟 AI 重濾，已棄用，改下面結構化合併)
            const chatId = getChatIdentifier();
            const existingCount = allEntries.filter(e => e.comment && e.comment.includes(`[大总结] - ${chatId}`)).length;
            const newCount = existingCount + 1;

            const noteSection = userNote ? `\n【用户备注/调整要求】\n${userNote}\n` : '';
            const prompt = `停止剧情输出，执行**合并大总结**\n${noteSection}\n以下是 ${selected.length} 份需要合并的大总结，请将其整合为一份完整的新大总结，保留所有重要信息，去除重复内容，按时间顺序重新组织。\n\n${combined}\n\n要求：\n- 注明这是第${newCount}次大总结（合并版）\n- 合并所有事件表、角色表、代办清单、物品表等\n- 同一角色或事件的重复记录请合并去重\n- 保留所有重要细节，不遗漏敏感内容\n- 按以下格式输出：\n\n格式如下：\n【大总结(第${newCount}次·合并版)】\n【事件表】\n時間 |关键事件 | 事件描述(詳細100字上下) | 关键行为 | 事件地點 | 重要细节 | 简要的事件后续 | 備註 |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n\n【角色表】\n姓名 | 身份 | 性格行為 | 状态/位置 | 关键特征 | 與MC的关系 | 备注 |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n\n【代辦清單】\n| 代辦事項 | 描述 | 參與角色 | 備註 |\n| :--- | :--- | :--- | :--- |\n\n【結算清單】\n| 結算事件 | 描述 | 參與角色 | 備註 |\n| :--- | :--- | :--- | :--- |\n\n【物品表】\n物品名 | 描述 | 狀態 | 獲取途徑 | 備註 |\n| :--- | :--- | :--- | :--- | :--- |\n\n【注意規範/記憶事項表】\n事項 | 描述 | 備註 |\n| :--- | :--- | :--- |\n\n【性事紀】\n| 性事事件 | 描述 | 參與角色 | 備註 |\n| :--- | :--- | :--- | :--- |`;

            const osApi = window.parent.OS_API;
            const osSet = window.parent.OS_SETTINGS;
            if (!osApi) throw new Error('找不到 OS_API');

            // === 混合合併：角色/物品/記憶/關係/代辦/結算/性事紀 → 程式保留去重(碰不到 AI→一個都不會少)；事件表 → 丟 AI 濃縮 ===
            const stripHead = t => String(t).replace(/^\s*【大总结[^】]*】[^\n]*\n*(Last:[^\n]*\n*)?/i, '');
            const allSecs = selected.map(e => _splitSummarySections(stripHead(e.content)));
            const headerOrder = [];
            allSecs.forEach(secs => secs.forEach(s => { if (!headerOrder.includes(s.header)) headerOrder.push(s.header); }));
            const KEEPFIRST = ['故事標題', '故事标题'], TAKELAST = ['結語', '结语', '場景索引', '场景索引'];
            const bodiesOf = (h) => allSecs.map(secs => { const s = secs.find(x => x.header === h); return s ? s.body : null; }).filter(b => b != null && b !== '');
            const aiChat = (pr) => new Promise((res, rej) => { let g = ''; osApi.chat([{ role: 'system', content: '剧情总结整理助手，只输出要求的内容' }, { role: 'user', content: pr }], osSet.getConfig(), (c) => { g = c; }, (f) => { g = f; res(g); }, (err) => rej(err), { disableTyping: true }); });

            // 角色表/關係圖譜 → 程式先合出「完整版」(一個都不少)，等下強制蓋回 AI 輸出，保證不漏角色
            const PRESERVE = ['角色表', '關係圖譜', '关系图谱'];
            const preserved = {};
            for (const h of headerOrder) {
                if (!PRESERVE.includes(h)) continue;
                const bodies = bodiesOf(h);
                if (!bodies.length) continue;
                let acc = bodies[0];
                for (let i = 1; i < bodies.length; i++) acc = _mergeSection(h, acc, bodies[i]);
                preserved[h] = acc;
            }
            const preservedBlock = Object.keys(preserved).map(h => `【${h}】\n${preserved[h]}`).join('\n\n');

            // 「一通」主模型：把整份整理濃縮成一份；角色表/關係圖譜用我附的完整版照抄
            const combinedAll = selected.map((e, i) => `=== 第${i + 1}份 ===\n${stripHead(e.content)}`).join('\n\n');
            const mergePrompt = `下面有 ${selected.length} 份大總結，請合併整理成「一份」精簡完整總結。\n` +
                `【規則】\n` +
                `- 事件表 → 壓縮重點：久遠的多筆壓成「階段節點」(一行涵蓋一整段劇情、只記不可逆結果與關鍵轉折、不記過程)，最近 8 筆保留逐筆。\n` +
                `- 物品表 → 只留關鍵物品，狀態用 在庫/使用中/已交付/已消耗/損壞 五選一、不寫備註欄；同物品別因數量不同或叫法不同重複列(如「毒腺」「极品毒腺」「毒腺(2颗)」算同一格)。注意規範 / 結算清單 → 去重、保留所有仍有後續影響的項目。\n` +
                `- 結語 → 直接用「最新一份」的結語(它已是涵蓋全程的滾動總述)；若最新那份不夠完整，再融合補成「一段」，別把每份結語分段堆疊。\n` +
                `- 場景索引 → 整個刪除、不要輸出。\n` +
                `- 故事標題 → 用第一份的、原樣保留，不要改寫或重下。\n` +
                `- 代辦清單 → **整個刪除、不要輸出這個區塊**（待辦已改用 AVS 狀態系統管理）。\n` +
                `- 性事紀 → 整併成「目的·手段·結果」一行(以何名義交合 / 獲得何增益 / 對方身心關係變化)，但**每個發生過性事的角色至少保留一條、絕不刪光**(防 NPC 後續見面忘記有過性事變 OOC)。\n` +
                `- 角色表、關係圖譜 → **直接用我下面附的「完整版」原樣放進去，一個角色都不准刪或漏**。\n` +
                `- 目標：整份壓到 2000 字以內(角色表/關係圖譜不計)；用原本的【區塊】格式輸出一份，開頭寫【大总结(第${newCount}次·合并版)】，只輸出總結本身、不要解釋。\n` +
                (userNote ? `- 額外要求：${userNote}\n` : '') +
                `\n【附：完整角色表/關係圖譜（照抄、不准刪角色）】\n${preservedBlock || '（無）'}\n\n` +
                `【要合併的 ${selected.length} 份】\n${combinedAll}`;
            let finalContent = String((await aiChat(mergePrompt)) || '');
            if (!/【大总结/.test(finalContent)) finalContent = `【大总结(第${newCount}次·合并版)】\n\n${finalContent}`;
            // 保險：AI 輸出裡的 角色表/關係圖譜 強制換成程式保留的完整版（萬一 AI 漏角色也救回來）
            try {
                if (Object.keys(preserved).length) {
                    const headLine = (finalContent.match(/^\s*(【大总结[^】]*】[^\n]*)/) || [])[1] || `【大总结(第${newCount}次·合并版)】`;
                    const secs = _splitSummarySections(stripHead(finalContent));
                    const rebuilt = secs.map(s => preserved[s.header] ? { header: s.header, body: preserved[s.header] } : s);
                    for (const h of Object.keys(preserved)) { if (!rebuilt.find(s => s.header === h)) rebuilt.push({ header: h, body: preserved[h] }); }
                    finalContent = headLine + '\n\n' + rebuilt.map(s => `【${s.header}】\n${s.body}`).join('\n\n');
                }
            } catch (e) { console.warn('[合併] 角色表回填失敗，用 AI 原輸出:', e); }

            const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const newEntry = { comment: `[大总结] - ${chatId} - 第${newCount}次(合并) - ${now}`, keys: [`[SUMMARY_${chatId}_MERGE_${now}]`], content: finalContent, enabled: true, position: 'at_depth_as_system', depth: 1, order: 998 };
            await helper.createLorebookEntries(bookName, [newEntry]);
            alert(`✅ 合併完成！第 ${newCount} 次（合并版）——角色/關係全保留；事件/物品/記憶/性事/結算/代辦已濃縮整理。確認沒問題後可手動刪掉舊的 ${selected.length} 份。`);
        } catch (e) { alert('合併失敗: ' + e.message); }
        finally { if (btn) { btn.innerText = origText; btn.classList.remove('spinning'); } }
    };

    // CTX 面板用：算「還有多少樓沒總結」= 目前最後樓 − 上次大總結記的 Last
    API.getUnsummarizedInfo = async function () {
        try {
            const helper = window.parent.TavernHelper;
            if (!helper) return null;
            // 真實最後樓號（對抗懶載入：取各來源最大值）。CTX 是高頻背景讀取，故不強制展開全部，best-effort。
            let currentLast = await _trueLastId();
            if (currentLast == null || isNaN(currentLast)) return null;
            const chatId = getChatIdentifier();
            let lastSummarized = 0;
            let summaryCount = 0;
            // 大總結已搬 OS_DB（key=chatId）；讀那筆的 summaryCount + lastId。舊聊天會在 _loadTavernSummary 自動遷移。
            try {
                const rec = await _loadTavernSummary(chatId);
                if (rec) {
                    summaryCount = rec.summaryCount || 0;
                    if (rec.lastId != null && !isNaN(parseInt(rec.lastId))) lastSummarized = parseInt(rec.lastId);
                }
            } catch (e) {}
            const uncounted = Math.max(0, currentLast - lastSummarized);
            return { lastSummarized, currentLast, uncounted, start: lastSummarized + 1, end: currentLast, summaryCount };
        } catch (e) { return null; }
    };

    API.showRangeModal = async function () {
        _ensureSubModals();   // 確保子 modal 已注入（從 CTX 快捷入口直接呼叫時，可能還沒開過故事管理面板）
        document.getElementById('rpg-range-modal').classList.add('active');
        try {
            const helper = window.parent.TavernHelper;
            if (!helper) return;
            const _endShow = await _trueLastId();      // 背景讀真實樓號(不展開；chat 陣列完整時即正確)
            if (_endShow != null && _endShow !== '') document.getElementById('range-end-id').placeholder = `最後一條 ID: ${_endShow}`;

            // 還原「自動隱藏 / 預留樓層」設定
            try {
                const _kr = document.getElementById('range-keep-recent');
                if (_kr) { const v = parseInt(localStorage.getItem('sp_summary_keep_recent')); _kr.value = isNaN(v) ? 5 : v; }
                const _ah = document.getElementById('sum_autohide');
                if (_ah) _ah.checked = localStorage.getItem('sp_summary_autohide') !== '0';
            } catch (e) {}

            // 起始 ID 自動帶「上次總結到的下一樓」——從 OS_DB 那筆讀 lastId（舊聊天自動遷移進 OS_DB）
            try {
                const chatId = getChatIdentifier();
                const rec = await _loadTavernSummary(chatId);
                if (rec && rec.lastId != null && !isNaN(parseInt(rec.lastId))) {
                    document.getElementById('range-start-id').value = parseInt(rec.lastId) + 1;
                }
            } catch (e) {}
        } catch (e) { console.error('[大總結] 初始化失敗:', e); }
    };

    API.confirmRangeAndGenerate = function () {
        const start = parseInt(document.getElementById('range-start-id').value) || 1;
        const endVal = document.getElementById('range-end-id').value;
        const end = endVal ? parseInt(endVal) : null;
        const sourceType = 'content';   // 一律用全文當源（大總結本來就在濃縮，再拿摘要當源＝本末倒置）；摘要選項已移除
        const mergePrev = document.getElementById('sum_merge').checked;
        // 存「自動隱藏 / 預留樓層」設定(給 _doSave 讀)
        try {
            const _ah = document.getElementById('sum_autohide');
            localStorage.setItem('sp_summary_autohide', (_ah && _ah.checked) ? '1' : '0');
            const _kr = parseInt(document.getElementById('range-keep-recent')?.value);
            localStorage.setItem('sp_summary_keep_recent', isNaN(_kr) ? '5' : String(Math.max(0, _kr)));
        } catch (e) {}
        document.getElementById('rpg-range-modal').classList.remove('active');
        API._generateSummary(start, end, sourceType, mergePrev);
    };

    API._generateSummary = async function (startId, endId, sourceType, mergePrev) {
        const btn = document.getElementById('btn-grand-summary');   // 從 CTX 快捷入口開時不存在 → null-safe
        if (btn) { btn.innerText = "生成中 (請勿關閉)..."; btn.classList.add('spinning'); }
        try {
            const TH = window.parent.TavernHelper;
            if (!TH || typeof TH.generateRaw !== 'function') throw new Error("找不到 generateRaw（需要酒館助手在線）");
            const helper = TH;
            const chatId = getChatIdentifier();
            let bookName = ''; try { bookName = helper.getCurrentCharPrimaryLorebook?.() || ''; } catch (e) {}   // 只給 lobby 索引/卡名用，可空

            // 大總結改存 OS_DB（key=chatId、一卡一筆全文），不再寫世界書。讀「上一版」：OS_DB 為主；
            // 舊聊天只有世界書版 → _loadTavernSummary 一次性遷移進 OS_DB、無痛接軌。合併走結構化疊加(AI 只輸出增量)。
            const prevRec = await _loadTavernSummary(chatId);
            const prevFull = (prevRec && prevRec.content) ? prevRec.content : '';
            let summaryCount = ((prevRec && prevRec.summaryCount) ? prevRec.summaryCount : 0) + 1;
            const prevSection = prevFull
                ? `**只总结「这次新增」的剧情即可；旧事件/角色不用重写（系统会自动叠加：事件接在后面、同名角色更新、新角色加后面）**\n`
                : `**首次总结**\n`;
            // 滾動結語：抽出「上一版結語」當底稿丟給副模型，要它改寫成涵蓋到最新的一段(取代、不累積)。
            //   只送這一小段結語(≤200字)、不送整份舊總結 → 省 token 又能讓結語當完整長期記憶。
            let prevEpilogue = '';
            if (prevFull) {
                try {
                    const mm = prevFull.match(/【結語】[^\n]*\n+([\s\S]*?)(?:\n【|$)/);
                    if (mm) prevEpilogue = mm[1].replace(/^[-*\s]+/, '').replace(/\s+$/, '').trim();
                } catch (e) {}
            }
            const epilogueHint = prevEpilogue
                ? `\n【上一版結語（請當底稿，融入這次新劇情後改寫成「一段」涵蓋全程的滾動總述，全面取代、不要分段堆疊）】\n${prevEpilogue}\n`
                : '';
            let tplBody = getSummaryTemplate().replace(/\{\{count\}\}/g, summaryCount);
            if (summaryCount > 1) tplBody = tplBody.replace(/\n*【故事標題】[\s\S]*?(?=\n【|$)/g, '').trim();   // 故事標題只第一次生成、第二次起移除(日誌只要一個總篇名)

            let finalContent = '';
            let _summarizedEnd = null;   // 這次總結到的最後樓號（給存檔 Last: + 自動隱藏範圍）
            async function _genOnce() {
                const _W = window.parent || window;
                _W.__AURELIA_SUMMARIZING = true;
                console.log('[大總結] 🚩 SUMMARIZING=true（generateRaw 開始）');   // 診斷：旗標窗起點
                let generated = '';
                const _sys = '你是剧情总结助手。只输出大总结内容（按用户给的模板），绝不续写剧情。';
                try {
                    // 背景讀整個聊天檔(原生 /api/chats/get；不靠記憶體陣列、不展開、不卡)
                    const fileMsgs = await _apiFullChat();
                    if (fileMsgs && fileMsgs.length) {
                        // 只取「上次總結之後的新樓」(startId 由彈窗帶入=舊總結 Last+1) → 不重讀舊樓、省 token
                        const _lastIdx = fileMsgs.length - 1;
                        const sId = (startId != null && !isNaN(startId)) ? Math.max(0, startId) : 0;
                        const eId = (endId != null && !isNaN(endId)) ? Math.min(endId, _lastIdx) : _lastIdx;
                        _summarizedEnd = eId;
                        const transcript = fileMsgs.slice(sId, eId + 1).map((m, i) => {
                            const who = m.is_user ? '用户' : (m.name || '角色');
                            return `[#${sId + i}] ${who}：${String(m.mes || '').trim()}`;
                        }).join('\n\n');
                        const userMsg = `以下是需要总结的剧情原文（楼层 ${sId}~${eId}）：\n\n${transcript}\n\n----\n${prevSection}${epilogueHint}\n${tplBody}`;
                        generated = await TH.generateRaw({
                            user_input: userMsg,
                            ordered_prompts: [{ role: 'system', content: _sys }, 'user_input'],   // 不讀 chat_history → 純送我給的全文
                            max_chat_history: 0,
                            should_stream: false,
                        });
                    } else {
                        // 後備：讀不到檔 → generateRaw 讀記憶體 chat_history(all)
                        _summarizedEnd = await _trueLastId();
                        const instruction = `停止剧情输出，执行**新增大总结**。請依完整劇情產出大總結，只輸出總結內容、不要續寫劇情。\n\n${prevSection}${epilogueHint}\n${tplBody}`;
                        generated = await TH.generateRaw({
                            user_input: instruction,
                            ordered_prompts: [{ role: 'system', content: _sys }, 'chat_history', 'user_input'],
                            max_chat_history: 'all',
                            should_stream: false,
                        });
                    }
                } finally {
                    // ⏱️ 真凶：TH.generateRaw 的 GENERATION_ENDED 在 await resolve「之後」才發；若此刻就清旗標，
                    //    state_runtime 等抽取器在事件裡看到的是 false → 誤抽（重複 AVS/記憶/場景生圖）。
                    //    → 延遲清除，讓旗標撐過 GENERATION_ENDED（事件就在同秒發）。下一輪真實劇情遠在 3s 後、不受影響。
                    console.log('[大總結] 🏁 generateRaw 結束，旗標延遲 3s 清除（蓋過隨後才發的 GENERATION_ENDED）');
                    setTimeout(function () { _W.__AURELIA_SUMMARIZING = false; console.log('[大總結] ✅ 旗標已清除'); }, 3000);
                }
                finalContent = String(generated || '');
                const _lastTxt = (_summarizedEnd != null) ? `\nLast: ${_summarizedEnd}` : '';
                if (/【大总结\(第\d+次\)】/.test(finalContent)) finalContent = finalContent.replace(/【大总结\(第\d+次\)】/, `【大总结(第${summaryCount}次)】${_lastTxt}`);
                else finalContent = `【大总结(第${summaryCount}次)】${_lastTxt}\n\n${finalContent}`;
                // 合併模式：把這次增量「結構化疊加」到上一份累積總結（事件接後面、角色同名更新+新名加後面），不重濾舊內容
                if (mergePrev && prevFull) finalContent = _structuredMerge(finalContent, prevFull, summaryCount, _lastTxt);
            }

            async function _doSave() {
            // 大總結搬出世界書：全文存 OS_DB(key=chatId、一卡一筆覆蓋更新)。注入改走程式壓縮(os_summary_inject)，
            // 不再寫 lorebook、不再塞觸發 KEY；故事管理直接編這筆 OS_DB 記錄。
            try {
                const osDb = window.parent.OS_DB;
                if (!osDb?.saveTavernSummary) throw new Error('OS_DB.saveTavernSummary 不存在');
                const _tm = finalContent.match(/【故事標題】[^\n]*\n+([^\n【]+)/);
                const _title = (_tm ? _tm[1] : (prevRec?.title || '')).replace(/[「」"']/g, '').trim().slice(0, 50);
                const _bm = finalContent.match(/\[Bg\|[^|]*\|([^|]+)\|/);
                const _bg = _bm ? _bm[1].trim() : (prevRec?.bgCacheId || '');
                // 一起存 rawChatId(VN圖片world)+storyId(向量記憶/PWA總結)，讓日誌清空任一段(非當前聊天也行)能完整清到
                let _rawCid = ''; try { _rawCid = String(win.SillyTavern?.getContext?.()?.chatId || ''); } catch (e) {}
                let _sid = ''; try { _sid = (win.VN_Core && win.VN_Core._currentStoryId) || win.OS_AVS_ADAPTER?.getStoryId?.() || localStorage.getItem('vn_current_story_id') || ''; } catch (e) {}
                await osDb.saveTavernSummary(chatId, {
                    content: finalContent,
                    summaryCount,
                    lastId: (_summarizedEnd != null ? _summarizedEnd : (prevRec?.lastId ?? null)),
                    title: _title,
                    bgCacheId: _bg,
                    storyId: _sid || (prevRec?.storyId || ''),
                    rawChatId: _rawCid || (prevRec?.rawChatId || ''),
                });
                console.log('[大總結] ✅ 已存 OS_DB tavern_summary（chatId=' + chatId + '、第' + summaryCount + '次）');
                try { window.parent.OS_SUMMARY_INJECT?.invalidate?.(chatId); } catch (e) {}   // 讓注入器丟掉快取、下輪重抓壓縮版
            } catch (e) { console.error('[大總結] 存 OS_DB 失敗:', e); throw e; }

            // 🔒 自動隱藏已總結樓層，但預留最新 N 樓可見(近期上下文 + 末樓帶觸發 KEY)。
            //    開關與 N 由彈窗設定(sp_summary_autohide / sp_summary_keep_recent)。
            try {
                const _autohide = localStorage.getItem('sp_summary_autohide') !== '0';
                let _keep = parseInt(localStorage.getItem('sp_summary_keep_recent'));
                if (isNaN(_keep) || _keep < 0) _keep = 5;
                const _end = _arrayLastId();   // 陣列索引(/hide 是對記憶體陣列操作)
                const _hideTo = (_end != null) ? (_end - _keep) : null;   // 藏到這樓為止，之後 _keep 樓保留可見
                if (_autohide && _hideTo != null && _hideTo >= 0) await API._callSlashCommand(`/hide 0-${_hideTo}`);
            } catch (e) { console.warn('[大總結] 自動隱藏失敗:', e); }

            // 🌟 parse【結語】+ 角色名單 → 寫 lobby_summary_index（給瀅瀅/柴郡注 sysPrompt）
            try {
                const osDb = window.parent.OS_DB;
                if (osDb && osDb.saveLobbySummaryIndex) {
                    const briefMatch = finalContent.match(/【結語】[^\n]*\n+([\s\S]*?)(?:\n【|$)/);
                    const briefRaw = briefMatch ? briefMatch[1] : '';
                    const brief = briefRaw.replace(/\|/g, '').replace(/^[-*\s]+|[-*\s]+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);

                    const characters = [];
                    const charNameSet = new Set();
                    const charSectionMatch = finalContent.match(/【角色表】[\s\S]*?(?=\n【|$)/);
                    if (charSectionMatch) {
                        const lines = charSectionMatch[0].split('\n');
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed.includes('|')) continue;
                            if (/^[|\s:\-]+$/.test(trimmed)) continue;
                            const cols = trimmed.split('|').map(s => s.trim()).filter(Boolean);
                            if (!cols.length) continue;
                            const name = cols[0];
                            if (!name) continue;
                            if (name === '姓名') continue;
                            if (/^[-:\s]+$/.test(name)) continue;
                            if (name.length > 40) continue;
                            if (charNameSet.has(name)) continue;
                            charNameSet.add(name);
                            characters.push({ name, row: trimmed });
                        }
                    }
                    console.log('[lobby_summary_index] parsed:', { brief: brief?.slice(0, 60), charsCount: characters.length, firstChar: characters[0] });

                    const cardName = (helper.getCharData?.()?.name) || helper.getCurrentCharPrimaryLorebook?.() || '';

                    const titleMatch = finalContent.match(/【故事標題】[^\n]*\n+([^\n【]+)/);
                    let storyTitle = (titleMatch ? titleMatch[1] : '').replace(/[「」"']/g, '').trim().slice(0, 50);

                    const bgMatch = finalContent.match(/\[Bg\|[^|]*\|([^|]+)\|/);
                    const bgCacheId = bgMatch ? bgMatch[1].trim() : '';

                    let newCharacters = characters;
                    try {
                        const existing = await osDb.getAllLobbySummaryIndex();
                        const seen = new Set();
                        for (const r of existing) {
                            if ((r.cardName || '') !== cardName) continue;
                            if ((r.chatId || '') !== chatId) continue;
                            for (const c of (r.characters || [])) seen.add(c.name || c);
                            if (r.storyTitle && !storyTitle) storyTitle = r.storyTitle;
                            if (r.storyTitle) storyTitle = r.storyTitle;  // 強制沿用第一次
                        }
                        newCharacters = characters.filter(c => !seen.has(c.name));
                    } catch (_) { /* dedup 失敗就照寫 */ }

                    if (brief || newCharacters.length) {
                        await osDb.saveLobbySummaryIndex({
                            cardName, chatId, storyTitle, bgCacheId, summaryCount, brief,
                            characters: newCharacters,
                            lorebookBook: bookName,
                            lorebookKey: `tavern_summary::${chatId}`,   // 已搬 OS_DB，非世界書 key（保留欄位相容）
                        });
                    }
                    console.log('[lobby_summary_index]', { storyTitle, bgCacheId, allChars: characters.length, newChars: newCharacters.length });
                }
            } catch (e) { console.warn('[os_story_tools] 寫 lobby_summary_index 失敗（不影響大總結）:', e); }
            } // end _doSave

            // 生成完先跳「預覽窗」給用戶檢查（可直接編輯）；滿意按儲存才寫世界書，不滿意可重新生成
            function _showSummaryPreview() {
                const oldM = document.getElementById('rpg-summary-preview-modal'); if (oldM) oldM.remove();
                const modal = document.createElement('div');
                modal.id = 'rpg-summary-preview-modal';
                modal.className = 'ost-modal active';
                modal.innerHTML = `
                    <div class="ost-modal-card ost-modal-wide">
                        <div class="ost-modal-title">📝 大總結預覽（第 ${summaryCount} 次）</div>
                        <div class="ost-opt-desc">檢查內容、可直接編輯。滿意按「儲存」才會存進故事日誌（本機、綁這個聊天室）；不滿意可「重新生成」。</div>
                        <textarea id="rpg-sum-preview-area" class="ost-textarea ost-sum-preview-area" spellcheck="false"></textarea>
                        <div class="ost-sum-preview-status" id="rpg-sum-preview-status"></div>
                        <div class="ost-modal-btns">
                            <button class="ost-btn" id="rpg-sum-cancel">取消</button>
                            <button class="ost-btn" id="rpg-sum-regen">🔄 重新生成</button>
                            <button class="ost-btn ost-btn-primary" id="rpg-sum-save">💾 儲存</button>
                        </div>
                    </div>`;
                document.body.appendChild(modal);
                const area = modal.querySelector('#rpg-sum-preview-area');
                const status = modal.querySelector('#rpg-sum-preview-status');
                area.value = finalContent;
                modal.querySelector('#rpg-sum-cancel').onclick = () => modal.remove();
                modal.querySelector('#rpg-sum-regen').onclick = async () => {
                    const rb = modal.querySelector('#rpg-sum-regen'), sb = modal.querySelector('#rpg-sum-save');
                    rb.disabled = true; sb.disabled = true; status.textContent = '重新生成中…';
                    try { await _genOnce(); area.value = finalContent; status.textContent = '已重新生成 ✓'; }
                    catch (e) { status.textContent = '重新生成失敗：' + (e.message || e); }
                    rb.disabled = false; sb.disabled = false;
                };
                modal.querySelector('#rpg-sum-save').onclick = async () => {
                    const sb = modal.querySelector('#rpg-sum-save');
                    sb.disabled = true; status.textContent = '儲存中…';
                    try { finalContent = area.value; await _doSave(); modal.remove(); }
                    catch (e) { status.textContent = '儲存失敗：' + (e.message || e); sb.disabled = false; }
                };
            }

            await _genOnce();
            _showSummaryPreview();
        } catch (e) { alert("生成失敗: " + e.message); } finally {
            if (btn) { btn.innerText = "📝 生成 / 更新大總結 (Grand Summary)"; btn.classList.remove('spinning'); }
        }
    };

    // ====================================================================
    // B. 隱藏對話（/hide /unhide）
    // ====================================================================
    API._callSlashCommand = async function (cmd) {
        const trigger = win.TavernHelper?.triggerSlash || win.triggerSlash;
        if (typeof trigger === 'function') {
            try {
                await trigger(cmd);
                return;
            } catch (e) {
                console.error('[OS_STORY_TOOLS] triggerSlash 失敗:', e);
            }
        }
        const ta = document.querySelector('#send_textarea');
        const btn = document.querySelector('#send_but');
        if (!ta || !btn) {
            console.error('[OS_STORY_TOOLS] 既無 TavernHelper 也找不到酒館輸入框');
            return;
        }
        ta.value = cmd;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        btn.click();
    };
    API._readHideRange = function () {
        const s = parseInt(document.getElementById('vrs-hide-start')?.value);
        const e = parseInt(document.getElementById('vrs-hide-end')?.value);
        if (isNaN(s) || isNaN(e) || s < 0 || e < 0) {
            alert('請輸入有效樓層號（>= 0）');
            return null;
        }
        return s > e ? `${e}-${s}` : `${s}-${e}`;
    };
    API._withBtnFeedback = async function (btn, action, successText = '✓') {
        if (!btn) return action();
        const orig = btn.textContent;
        const wasDisabled = btn.disabled;
        btn.textContent = '⏳';
        btn.disabled = true;
        btn.classList.add('busy');
        try {
            const r = await action();
            btn.textContent = successText;
            btn.classList.remove('busy');
            btn.classList.add('ok');
            setTimeout(() => {
                btn.textContent = orig;
                btn.disabled = wasDisabled;
                btn.classList.remove('ok');
            }, 1200);
            return r;
        } catch (e) {
            btn.textContent = '✗';
            btn.classList.remove('busy');
            btn.classList.add('err');
            console.error('[OS_STORY_TOOLS] 操作失敗:', e);
            setTimeout(() => {
                btn.textContent = orig;
                btn.disabled = wasDisabled;
                btn.classList.remove('err');
            }, 1500);
        }
    };
    API._slashHide = async function (btn) {
        const range = API._readHideRange();
        if (!range) return;
        await API._withBtnFeedback(btn, async () => {
            await API._callSlashCommand(`/hide ${range}`);
            API._updateHideStatus();
        });
    };
    API._slashUnhide = async function (btn) {
        const range = API._readHideRange();
        if (!range) return;
        await API._withBtnFeedback(btn, async () => {
            await API._callSlashCommand(`/unhide ${range}`);
            API._updateHideStatus();
        });
    };
    API._slashShowAll = async function (btn) {
        await API._withBtnFeedback(btn, async () => {
            const _tlu = await _trueLastId();
            await API._callSlashCommand('/unhide 0-' + (_tlu != null ? _tlu : '{{lastMessageId}}'));
            API._updateHideStatus();
        });
    };
    API._refreshStatus = function (btn) {
        API._updateHideStatus();
        if (btn) {
            btn.classList.add('ok');
            setTimeout(() => btn.classList.remove('ok'), 600);
        }
    };
    API._formatRanges = function (ids) {
        if (!ids || !ids.length) return '無';
        const sorted = [...ids].sort((a, b) => a - b);
        const out = [];
        let start = sorted[0], prev = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === prev + 1) {
                prev = sorted[i];
            } else {
                out.push(start === prev ? `${start}` : `${start}-${prev}`);
                start = prev = sorted[i];
            }
        }
        out.push(start === prev ? `${start}` : `${start}-${prev}`);
        return out.join(', ');
    };
    API._updateHideStatus = async function () {
        const lastEl = document.getElementById('vrs-last-id');
        const hiddenEl = document.getElementById('vrs-hidden-list');
        if (!lastEl || !hiddenEl) return;
        try {
            const lastId = await _trueLastId();   // 真實最後樓號(/api/chats/search 的 message_count-1)
            lastEl.textContent = (lastId != null && lastId >= 0) ? `#${lastId}` : '—';

            // 隱藏狀態優先「讀檔」拿真實全量(/api/chats/get 的 is_system)——跟最後樓號同一把真實尺規，
            // 不會因記憶體陣列截短/重編號而亂跳；讀不到檔才退回讀記憶體陣列(截短，可能偏少)。
            let hiddenIds = null;
            try {
                const fileMsgs = await _apiFullChat();
                if (Array.isArray(fileMsgs)) {
                    hiddenIds = [];
                    fileMsgs.forEach((m, i) => { if (m && m.is_system === true) hiddenIds.push(i); });
                }
            } catch (e) {}
            if (hiddenIds == null) {
                const helper = win.TavernHelper;
                const hiddenSet = new Set();
                try { const chat = win.SillyTavern?.getContext?.()?.chat || []; chat.forEach((m, idx) => { if (m && m.is_system === true) hiddenSet.add(idx); }); } catch (e) {}
                try { if (helper?.getChatMessages) { const hidden = await helper.getChatMessages('0-999999', { hide_state: 'hidden' }); if (Array.isArray(hidden)) hidden.forEach(m => { if (typeof m.message_id === 'number') hiddenSet.add(m.message_id); }); } } catch (e) {}
                hiddenIds = [...hiddenSet];
            }
            hiddenEl.textContent = API._formatRanges(hiddenIds);
        } catch (e) {
            console.error('[OS_STORY_TOOLS] _updateHideStatus 失敗:', e);
        }
    };

    // ====================================================================
    // C. 面板（掛在故事日誌容器內）+ 大總結三個子 modal（固定全螢幕，掛 body）
    // ====================================================================
    let _subModalsInjected = false;
    function _ensureSubModals() {
        if (_subModalsInjected && document.getElementById('rpg-range-modal')) return;
        _subModalsInjected = true;
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div id="rpg-range-modal" class="ost-modal">
                <div class="ost-modal-card">
                    <div class="ost-modal-title">生成大總結設置</div>
                    <div class="ost-modal-sec">
                        <label class="ost-opt"><input type="checkbox" id="sum_merge" checked><span>合併之前的總結</span></label>
                        <span class="ost-opt-desc">將舊的 [大總結] 一併發送給 AI 重整</span>
                    </div>
                    <div class="ost-modal-sec">
                        <label class="ost-modal-lab">起始 ID (Start)</label>
                        <input type="number" id="range-start-id" class="ost-input" value="1" min="1">
                        <label class="ost-modal-lab">結束 ID (End)</label>
                        <input type="number" id="range-end-id" class="ost-input" placeholder="留空代表最後一條">
                    </div>
                    <div class="ost-modal-sec">
                        <label class="ost-opt"><input type="checkbox" id="sum_autohide" checked><span>總結後自動隱藏舊樓層</span></label>
                        <span class="ost-opt-desc">已總結的對話藏起來、AI 不再重複讀（只是隱藏，資料不會刪）</span>
                        <label class="ost-modal-lab">預留最新樓層（不隱藏）</label>
                        <input type="number" id="range-keep-recent" class="ost-input" value="5" min="0">
                        <span class="ost-opt-desc">保留最近幾樓給 AI 看，維持劇情連貫</span>
                    </div>
                    <div class="ost-modal-btns">
                        <button class="ost-btn" onclick="document.getElementById('rpg-range-modal').classList.remove('active')">取消</button>
                        <button class="ost-btn ost-btn-primary" onclick="window.OS_STORY_TOOLS.confirmRangeAndGenerate()">開始生成</button>
                    </div>
                </div>
            </div>
            <div id="rpg-merge-modal" class="ost-modal">
                <div class="ost-modal-card ost-modal-wide">
                    <div class="ost-modal-title">🔀 合併大總結</div>
                    <label class="ost-modal-lab">備註 / 調整要求（發給 AI）</label>
                    <textarea id="sp-merge-note" class="ost-textarea" style="height:60px;" placeholder="例：請特別保留角色A與B的關係細節，合併後去掉重複的物品記錄..."></textarea>
                    <div class="ost-modal-lab" style="margin-top:10px;">勾選要合併的條目</div>
                    <div id="sp-merge-list" class="ost-merge-list">載入中...</div>
                    <div class="ost-modal-btns">
                        <button class="ost-btn" onclick="document.getElementById('rpg-merge-modal').classList.remove('active')">取消</button>
                        <button class="ost-btn ost-btn-primary" onclick="window.OS_STORY_TOOLS.executeMergeSummaries()">🔀 開始合併</button>
                    </div>
                </div>
            </div>
            <div id="rpg-summary-tpl-modal" class="ost-modal">
                <div class="ost-modal-card ost-modal-wide">
                    <div class="ost-modal-title">✏️ 大總結 生成模板</div>
                    <div class="ost-opt-desc" style="margin-bottom:8px;">編輯後點保存，下次生成大總結時使用此模板。可用佔位符：{{count}}（第幾次）</div>
                    <textarea id="sp-summary-tpl-area" class="ost-textarea" style="height:360px; font-family:monospace;"></textarea>
                    <div class="ost-modal-btns">
                        <button class="ost-btn" onclick="window.OS_STORY_TOOLS.resetSummaryTemplate()">↺ 還原預設</button>
                        <button class="ost-btn" onclick="document.getElementById('rpg-summary-tpl-modal').classList.remove('active')">關閉</button>
                        <button class="ost-btn ost-btn-primary" onclick="window.OS_STORY_TOOLS.saveSummaryTemplate()">💾 保存</button>
                    </div>
                </div>
            </div>`;
        while (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);
    }

    API.openPanel = function (container) {
        if (!container) return;
        _ensureSubModals();
        API.closePanel();
        const ov = document.createElement('div');
        ov.className = 'ost-overlay';
        ov.id = 'ost-panel';
        ov.innerHTML = `
            <div class="ost-card">
                <div class="ost-head">
                    <span class="ost-title">🛠️ 故事管理</span>
                    <button class="ost-close" title="關閉">✕</button>
                </div>
                <div class="ost-body">
                    <div class="ost-note">以下工具作用於「<b>目前開啟的對話</b>」。點故事卡片只是看該故事的總結；要生成大總結 / 隱藏，請先確定酒館開的是這個對話。</div>
                    <div class="ost-section">
                        <div class="ost-section-title">📝 大總結</div>
                        <button class="ost-btn ost-btn-primary" id="btn-grand-summary" onclick="window.OS_STORY_TOOLS.showRangeModal()">📝 生成 / 更新大總結 (Grand Summary)</button>
                        <div class="ost-hint">將最近的劇情壓縮成永久記憶</div>
                        <button class="ost-btn" onclick="window.OS_STORY_TOOLS.openSummaryTemplateModal()">✏️ 編輯大總結生成模板</button>
                        <div class="ost-hint">查看 / 編輯 / 清空各段劇情 → 大廳「瀅瀅的故事日誌」</div>
                    </div>
                    <div class="ost-section">
                        <div class="ost-section-title">🙈 隱藏對話</div>
                        <div class="ost-hide">
                            <div class="ost-hide-row">
                                <span class="ost-hide-label">樓層</span>
                                <input type="number" class="ost-hide-input" id="vrs-hide-start" placeholder="起始" min="0">
                                <span class="ost-hide-sep">~</span>
                                <input type="number" class="ost-hide-input" id="vrs-hide-end" placeholder="結束" min="0">
                                <button class="ost-hide-btn" onclick="window.OS_STORY_TOOLS._slashHide(this)">隱藏</button>
                                <button class="ost-hide-btn primary" onclick="window.OS_STORY_TOOLS._slashUnhide(this)">取消</button>
                                <button class="ost-hide-btn danger" onclick="window.OS_STORY_TOOLS._slashShowAll(this)">全顯示</button>
                                <button class="ost-hide-btn" onclick="window.OS_STORY_TOOLS._refreshStatus(this)" title="重新整理">🔄</button>
                            </div>
                            <div class="ost-hide-status">
                                <span class="ost-hide-stat-lab">最後樓層</span><span class="ost-hide-stat-val" id="vrs-last-id">—</span>
                                <span class="ost-hide-stat-sep">｜</span>
                                <span class="ost-hide-stat-lab">已隱藏</span><span class="ost-hide-stat-val" id="vrs-hidden-list">—</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        container.appendChild(ov);
        ov.querySelector('.ost-close').onclick = () => API.closePanel();
        ov.addEventListener('click', (e) => { if (e.target === ov) API.closePanel(); });
        try { API._updateHideStatus(); } catch (_) { }
    };

    API.closePanel = function () {
        const ov = document.getElementById('ost-panel');
        if (ov) ov.remove();
    };

    window.OS_STORY_TOOLS = API;
    console.log('✅ 故事管理工具 (OS_STORY_TOOLS) 模組就緒');
})();
