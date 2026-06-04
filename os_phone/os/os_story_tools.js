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

    // === 取真實最後樓號（對抗 TauriTavern 懶載入）===
    // 坑：TauriTavern 每約一百樓自動收合(show more)，getContext().chat 陣列、getLastMessageId、
    //     getChatMessages 在收合時都只拿得到「已載入窗口」→ 樓號被騙小(179 樓卻回 99)。
    //     懶載入只會「少報」，所以：(1) 先自動把全部展開，(2) 取各來源最大值還原真實樓號。

    // 自動點「顯示更多訊息」直到全部載入（省得手動一直按）；沒有懶載入的環境(一般酒館)會直接 no-op
    async function _ensureAllLoaded() {
        try {
            const pdoc = window.parent.document;
            if (!pdoc) return;
            const _len = () => { try { const c = win.SillyTavern?.getContext?.()?.chat; return Array.isArray(c) ? c.length : 0; } catch (e) { return 0; } };
            let guard = 0;
            while (guard++ < 80) {
                const btn = pdoc.querySelector('#show_more_messages');
                if (!btn || btn.offsetParent === null) break;   // 沒有「更多」可載入了
                const before = _len();
                btn.click();
                await new Promise(r => setTimeout(r, 220));
                if (_len() <= before) {                          // 沒長 → 再等一次渲染，仍沒長就停
                    await new Promise(r => setTimeout(r, 350));
                    if (_len() <= before) break;
                }
            }
        } catch (e) { console.warn('[OS_STORY_TOOLS] 自動展開全部訊息失敗:', e); }
    }

    // 真實最後樓號 = 各來源最大值（懶載入只少報，取 max 還原）。要保證準確前先 await _ensureAllLoaded()
    async function _trueLastId() {
        let best = -1;
        try {
            const c = win.SillyTavern?.getContext?.()?.chat;
            if (Array.isArray(c) && c.length) best = Math.max(best, c.length - 1);
        } catch (e) {}
        try {
            const TH = win.TavernHelper;
            if (TH?.getChatMessages) {
                const all = await TH.getChatMessages('0-999999');
                if (Array.isArray(all) && all.length) {
                    const mid = all[all.length - 1]?.message_id;
                    if (typeof mid === 'number' && !isNaN(mid)) best = Math.max(best, mid);
                    best = Math.max(best, all.length - 1);
                }
            }
        } catch (e) {}
        try {
            const TH = win.TavernHelper;
            if (TH?.getLastMessageId) { const lid = await TH.getLastMessageId(); if (typeof lid === 'number' && !isNaN(lid)) best = Math.max(best, lid); }
        } catch (e) {}
        return best >= 0 ? best : null;
    }

    // ====================================================================
    // A. 大總結
    // ====================================================================
    const SUMMARY_DEFAULT_TPL = `要求：
- 注明这是第{{count}}次大总结
- 直接陈述事实，包含具体时间，省略冗余。保留敏感内容。
1. 請開始總結紀錄，你將按照以下格式進行總結。

- 按逻辑顺序组织信息，并包含具体的前后时间，可以分辨不同日期与时间发生的事情
- 保留关键事件和重要细节，省略冗余描述
- 直接陈述事实，避免评价
- 使用简洁清晰的语言，避免修饰
- 突出事件发展脉络和关键转折点
- 保留重要的约定、物品、事件以及情感发展
- 不回避任何敏感内容，保证记录完全还原前文
- 可以精简合并较为久远之前的事件
- 无需加粗标注

格式如下：
【大总结(第{{count}}次)】
【事件表】
時間 |关键事件 | 事件描述(詳細100字上下) | 关键行为：(标明角色互動100字內描述) | 事件地點 | 重要细节(角色名:關鍵對話) | 简要的事件后续 | 備註 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |

【角色表】
- 所有对剧情有影响的角色均需出现(包括没有实体的角色)
- 姓名欄格式硬規定：「名_姓氏」（用半形底線分隔）；必須依角色提供的完整正式全名寫入；不可使用模糊小名、暱稱、外號、稱謂；沒有姓氏的角色姓氏欄寫「無」
姓名(名_姓氏) | 身份 | 性格行為攝影(100字) | 状态/位置 |  关键特征 | 與MC的关系/初遇事件100字內描述 |备注(目標) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |


【關係圖譜】
角色A | 角色B | 關係 | 強度(1-10) | 本章變化 | 描述 |
| :--- | :--- | :--- | :--- | :--- | :--- |


【代辦清單】
| 代辦事項 | 代辦事項描述 | 參與角色 | 備註 |
| :--- | :--- | :--- | :--- |

【結算清單】
| 結算事件 | 事件描述 | 參與角色 | 備註 |
| :--- | :--- | :--- | :--- |

【物品表】
物品名 | 物品描述 | 物品狀態(在庫/使用中/損壞) | 獲取途徑 | 備註 |
| :--- | :--- | :--- | :--- | :--- | :--- |

【注意規範/記憶事項表】
事項(人事物) | 事項描述 | 備註 |
| :--- | :--- | :--- |

【性事紀】(以免出現AI角色後續忘記有過性事，導致角色OOC變成拔屌無情的渣男渣女)
| 性事事件 | 事件描述 | 參與角色 | 備註 |
| :--- | :--- | :--- | :--- |

【結語】(必填，100字以內純文字，用一段話描述本章核心走向與結束時的關鍵狀態，給其他系統做跨卡索引用，不要加任何標題、序號、表格或裝飾符號)

【故事標題】(必填，30字以內，給這次跑團/這個聊天室的主題下一個標題，例如本次劇情的核心衝突或主線；純文字一行，不要加引號或裝飾符號)

【場景索引】(選填，從本章原文裡找出最具代表性的一個 [Bg|...] 標籤、原封不動複製貼上一行；格式範例：[Bg|季節|時段_場景名|描述]。沒有合適的就留空、整段省略此欄)`;

    function getSummaryTemplate() {
        return localStorage.getItem('sp_summary_tpl') || SUMMARY_DEFAULT_TPL;
    }

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
            const selected = checked.map(cb => allEntries.find(e => String(e.uid) === cb.value)).filter(Boolean);
            const combined = selected.map((e, i) => `=== 第 ${i + 1} 份總結 (${e.comment}) ===\n${e.content}`).join('\n\n');
            const chatId = getChatIdentifier();
            const existingCount = allEntries.filter(e => e.comment && e.comment.includes(`[大总结] - ${chatId}`)).length;
            const newCount = existingCount + 1;

            const noteSection = userNote ? `\n【用户备注/调整要求】\n${userNote}\n` : '';
            const prompt = `停止剧情输出，执行**合并大总结**\n${noteSection}\n以下是 ${selected.length} 份需要合并的大总结，请将其整合为一份完整的新大总结，保留所有重要信息，去除重复内容，按时间顺序重新组织。\n\n${combined}\n\n要求：\n- 注明这是第${newCount}次大总结（合并版）\n- 合并所有事件表、角色表、代办清单、物品表等\n- 同一角色或事件的重复记录请合并去重\n- 保留所有重要细节，不遗漏敏感内容\n- 按以下格式输出：\n\n格式如下：\n【大总结(第${newCount}次·合并版)】\n【事件表】\n時間 |关键事件 | 事件描述(詳細100字上下) | 关键行为 | 事件地點 | 重要细节 | 简要的事件后续 | 備註 |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n\n【角色表】\n姓名 | 身份 | 性格行為 | 状态/位置 | 关键特征 | 與MC的关系 | 备注 |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n\n【代辦清單】\n| 代辦事項 | 描述 | 參與角色 | 備註 |\n| :--- | :--- | :--- | :--- |\n\n【結算清單】\n| 結算事件 | 描述 | 參與角色 | 備註 |\n| :--- | :--- | :--- | :--- |\n\n【物品表】\n物品名 | 描述 | 狀態 | 獲取途徑 | 備註 |\n| :--- | :--- | :--- | :--- | :--- |\n\n【注意規範/記憶事項表】\n事項 | 描述 | 備註 |\n| :--- | :--- | :--- |\n\n【性事紀】\n| 性事事件 | 描述 | 參與角色 | 備註 |\n| :--- | :--- | :--- | :--- |`;

            const osApi = window.parent.OS_API;
            const osSet = window.parent.OS_SETTINGS;
            if (!osApi) throw new Error('找不到 OS_API');

            let generated = '';
            await new Promise((res, rej) => {
                osApi.chat([{ role: 'system', content: '剧情总结合并助手' }, { role: 'user', content: prompt }], osSet.getConfig(),
                    (chunk) => { generated = chunk; }, (final) => { generated = final; res(); }, (err) => rej(err), { disableTyping: true });
            });

            const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            let finalContent = generated;
            if (!/【大总结/.test(finalContent)) finalContent = `【大总结(第${newCount}次·合并版)】\n\n${finalContent}`;
            const newEntry = { comment: `[大总结] - ${chatId} - 第${newCount}次(合并) - ${now}`, keys: [`[SUMMARY_${chatId}_MERGE_${now}]`], content: finalContent, enabled: true, position: 'at_depth_as_system', depth: 1, order: 998 };
            await helper.createLorebookEntries(bookName, [newEntry]);
            alert(`✅ 合併完成！已生成第 ${newCount} 次（合并版）大總結`);
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
            const bookName = helper.getCurrentCharPrimaryLorebook?.();
            if (bookName) {
                const entries = await helper.getLorebookEntries(bookName);
                // 直接精準抓「當前 chatId」的大總結（不做模糊比對，避免撈到別的聊天）；
                // 挑「第N次」最大的那份(=最新)，現讀它的 Last。每次都重抓世界書、不靠任何快取。
                const prefix = `[大总结] - ${chatId}`;
                const summaries = (entries || []).filter(e => e.comment && e.comment.includes(prefix));
                if (summaries.length) {
                    const _seq = e => { const m = (e.comment || '').match(/第\s*(\d+)\s*次/); return m ? parseInt(m[1]) : 0; };
                    summaries.sort((a, b) => (_seq(b) - _seq(a)) || ((b.uid || 0) - (a.uid || 0)));
                    for (const s of summaries) {
                        const mm = (s.content || '').match(/Last:\s*(\d+)/i);
                        if (mm && !isNaN(parseInt(mm[1]))) { lastSummarized = parseInt(mm[1]); break; }
                    }
                }
            }
            const uncounted = Math.max(0, currentLast - lastSummarized);
            return { lastSummarized, currentLast, uncounted, start: lastSummarized + 1, end: currentLast };
        } catch (e) { return null; }
    };

    API.showRangeModal = async function () {
        _ensureSubModals();   // 確保子 modal 已注入（從 CTX 快捷入口直接呼叫時，可能還沒開過故事管理面板）
        document.getElementById('rpg-range-modal').classList.add('active');
        try {
            const helper = window.parent.TavernHelper;
            if (!helper) return;
            await _ensureAllLoaded();                  // 先自動展開全部，結束 ID 才不會被懶載入騙小
            const _endShow = await _trueLastId();
            if (_endShow != null && _endShow !== '') document.getElementById('range-end-id').placeholder = `最後一條 ID: ${_endShow}`;

            // 還原「自動隱藏 / 預留樓層」設定
            try {
                const _kr = document.getElementById('range-keep-recent');
                if (_kr) { const v = parseInt(localStorage.getItem('sp_summary_keep_recent')); _kr.value = isNaN(v) ? 5 : v; }
                const _ah = document.getElementById('sum_autohide');
                if (_ah) _ah.checked = localStorage.getItem('sp_summary_autohide') !== '0';
            } catch (e) {}

            const bookName = helper.getCurrentCharPrimaryLorebook();
            if (bookName) {
                const entries = await helper.getLorebookEntries(bookName);
                const chatId = getChatIdentifier();
                const prefix = `[大总结] - ${chatId}`;
                const summaries = entries.filter(e => e.comment && (e.comment.includes(prefix) || e.comment.includes(chatId) && e.comment.includes('大总结')));

                if (summaries.length > 0) {
                    const latest = summaries.sort((a, b) => (b.uid || 0) - (a.uid || 0))[0];
                    if (latest && latest.content) {
                        const match = latest.content.match(/Last:\s*(\d+)/i);
                        if (match && !isNaN(parseInt(match[1]))) {
                            document.getElementById('range-start-id').value = parseInt(match[1]) + 1;
                        }
                    }
                }
            }
        } catch (e) { console.error('[大總結] 初始化失敗:', e); }
    };

    API.confirmRangeAndGenerate = function () {
        const start = parseInt(document.getElementById('range-start-id').value) || 1;
        const endVal = document.getElementById('range-end-id').value;
        const end = endVal ? parseInt(endVal) : null;
        const sourceType = document.querySelector('input[name="sum_source"]:checked').value;
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
            const helper = window.parent.TavernHelper;
            if (!helper) throw new Error("無 TavernHelper");
            const bookName = helper.getCurrentCharPrimaryLorebook();
            const chatId = getChatIdentifier();
            const entries = await helper.getLorebookEntries(bookName);

            // 算第幾次 + 要不要合併舊總結（讀世界書，不受懶載入影響）
            let prevSummary = "";
            let summaryCount = 1;
            const oldSummaries = entries.filter(e => e.comment && e.comment.includes(`[大总结] - ${chatId}`));
            if (oldSummaries.length > 0) {
                summaryCount = oldSummaries.length + 1;
                if (mergePrev) prevSummary = oldSummaries.map(e => `=== 舊總結 ===\n${e.content}`).join("\n\n");
            }
            const prevSection = prevSummary ? (mergePrev ? `**合并所有之前的总结数据**\n${prevSummary}\n` : `**只总结新增剧情**\n${prevSummary}\n`) : `**首次总结**\n`;
            const tplBody = getSummaryTemplate().replace(/\{\{count\}\}/g, summaryCount);

            const osApi = win.OS_API;
            const osSet = win.OS_SETTINGS;
            if (!osApi || typeof osApi.chat !== 'function') throw new Error("找不到 OS_API（生成服務未就緒）");

            let finalContent = '';
            let _summarizedEnd = null;   // 這次實際總結到的最後樓號（給存檔 Last: + 自動隱藏範圍）
            async function _genOnce() {
                // 1) 先自動展開全部訊息（對抗 TauriTavern 懶載入）→ 之後抓 ID、抓內容才完整
                await _ensureAllLoaded();
                // 2) 樓層範圍：起始用 UI 給的(增量續總結用)，結束沒填就用真實最後樓
                const _last = await _trueLastId();
                const sId = (startId != null && !isNaN(startId)) ? Math.max(0, startId) : 0;
                const eId = (endId != null && !isNaN(endId)) ? endId : (_last != null ? _last : 0);
                _summarizedEnd = eId;
                // 3) 直接用 ID 抓範圍內全部樓層原文（已展開 → 拿得到完整，不被懶載入截斷）
                const msgs = (await helper.getChatMessages(`${sId}-${eId}`)) || [];
                const transcript = msgs.map(m => {
                    const who = m.is_user ? '用户' : (m.name || '角色');
                    return `[#${m.message_id}] ${who}：${(m.message || m.mes || '').trim()}`;
                }).join('\n\n');
                // 4) 丟給生成服務(同合併總結走的 OS_API.chat)做總結
                const userMsg = `以下是需要总结的剧情原文（楼层 ${sId}~${eId}）：\n\n${transcript}\n\n----\n${prevSection}\n${tplBody}`;
                const _W = window.parent || window;
                _W.__AURELIA_SUMMARIZING = true;   // 保險：生成期間 vector 注入器別摻記憶召回 / 別把它當新劇情
                let generated = '';
                try {
                    await new Promise((res, rej) => {
                        osApi.chat(
                            [{ role: 'system', content: '你是剧情总结助手。只输出大总结内容（按用户给的模板），绝不续写剧情。' },
                             { role: 'user', content: userMsg }],
                            osSet.getConfig(),
                            (chunk) => { generated = chunk; },
                            (final) => { generated = final; res(); },
                            (err) => rej(err),
                            { disableTyping: true }
                        );
                    });
                } finally { _W.__AURELIA_SUMMARIZING = false; }
                finalContent = String(generated || '');
                const _lastTxt = `\nLast: ${eId}`;   // Last: = 已總結到的最後樓號
                if (/【大总结\(第\d+次\)】/.test(finalContent)) finalContent = finalContent.replace(/【大总结\(第\d+次\)】/, `【大总结(第${summaryCount}次)】${_lastTxt}`);
                else finalContent = `【大总结(第${summaryCount}次)】${_lastTxt}\n\n${finalContent}`;
            }

            async function _doSave() {
            const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const newEntry = { comment: `[大总结] - ${chatId} - 第${summaryCount}次 - ${now}`, keys: [`[SUMMARY_${chatId}_${now}]`], content: finalContent, enabled: true, position: 'at_depth_as_system', depth: 1, order: 998 };
            await helper.createLorebookEntries(bookName, [newEntry]);

            await _ensureAllLoaded();   // 先展開全部 → 下面取真實樓號、隱藏範圍才正確（preview 期間可能又被自動收合）

            // 注入觸發 KEY 到「最後一樓」(這一樓會保留可見、不被自動隱藏) → 關鍵字照常觸發世界書總結。
            // 增量模式(沒合併)時把舊增量的 KEY 也補進這一樓，否則它們原本的觸發樓被隱藏後會失效。
            try {
                const lastId = await _trueLastId();
                if (lastId != null && lastId >= 0) {
                    const wantKeys = [newEntry.keys[0]];
                    if (!mergePrev && oldSummaries && oldSummaries.length) {
                        for (const e of oldSummaries) { const k = e.keys && e.keys[0]; if (k) wantKeys.push(k); }
                    }
                    const lastMsg = (await helper.getChatMessages(-1))[0];
                    if (lastMsg) {
                        let cur = lastMsg.mes || lastMsg.message || '';
                        const add = wantKeys.filter(k => k && !cur.includes(k));
                        if (add.length) {
                            cur = (cur + ' ' + add.join(' ')).trim();
                            await helper.setChatMessages([{ message_id: lastId, message: cur, mes: cur }], { refresh: 'affected' });
                        }
                    }
                }
            } catch (e) { console.warn('[大總結] 注入 KEY 失敗:', e); }

            // 🔒 自動隱藏已總結樓層，但預留最新 N 樓可見(近期上下文 + 末樓帶觸發 KEY)。
            //    開關與 N 由彈窗設定(sp_summary_autohide / sp_summary_keep_recent)。
            try {
                const _autohide = localStorage.getItem('sp_summary_autohide') !== '0';
                let _keep = parseInt(localStorage.getItem('sp_summary_keep_recent'));
                if (isNaN(_keep) || _keep < 0) _keep = 5;
                const _end = (_summarizedEnd != null) ? _summarizedEnd : await _trueLastId();
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
                            lorebookKey: newEntry.keys[0],
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
                        <div class="ost-opt-desc">檢查內容、可直接編輯。滿意按「儲存」才會寫進世界書；不滿意可「重新生成」。</div>
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
            await _ensureAllLoaded();
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
            const helper = win.TavernHelper;
            await _ensureAllLoaded();          // 先展開全部，最後樓層 / 已隱藏範圍才不會被收合騙小
            const lastId = await _trueLastId();
            lastEl.textContent = (lastId != null && lastId >= 0) ? `#${lastId}` : '—';
            // 已展開 → 取兩來源聯集，避免任一邊漏報：
            //   (1) chat 陣列的 is_system(這正是 /hide 設的旗標)  (2) getChatMessages hide_state:'hidden'
            const hiddenSet = new Set();
            try {
                const chat = win.SillyTavern?.getContext?.()?.chat || [];
                chat.forEach((m, idx) => { if (m && m.is_system === true) hiddenSet.add(idx); });
            } catch (e) {}
            try {
                if (helper?.getChatMessages) {
                    const hidden = await helper.getChatMessages('0-999999', { hide_state: 'hidden' });
                    if (Array.isArray(hidden)) hidden.forEach(m => { if (typeof m.message_id === 'number') hiddenSet.add(m.message_id); });
                }
            } catch (e) {}
            const hiddenIds = [...hiddenSet];
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
                        <div class="ost-modal-lab">數據來源 (Source)</div>
                        <label class="ost-opt"><input type="radio" name="sum_source" value="summary" checked><span>📋 使用摘要 (summary)</span></label>
                        <span class="ost-opt-desc">推薦: 讀取已同步的精簡摘要</span>
                        <label class="ost-opt"><input type="radio" name="sum_source" value="content"><span>📄 使用全文 (content)</span></label>
                        <span class="ost-opt-desc">直接讀取對話內容 (較耗時)</span>
                        <label class="ost-opt ost-opt-div"><input type="checkbox" id="sum_merge" checked><span>合併之前的總結</span></label>
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
                        <button class="ost-btn" onclick="window.OS_STORY_TOOLS.openMergeSummaryModal()">🔀 合併多個大總結</button>
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
