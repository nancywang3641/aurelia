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
                row.style.cssText = 'display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:6px; border:1px solid #2a2a2a; border-radius:4px; background:#111;';
                const cb = document.createElement('input');
                cb.type = 'checkbox'; cb.value = String(e.uid); cb.dataset.bookName = bookName;
                cb.style.cssText = 'margin-top:2px; flex-shrink:0; accent-color:var(--gold-p);';
                const text = document.createElement('span');
                text.style.cssText = 'font-size:11px; color:#ccc; line-height:1.4;';
                const preview = (e.content || '').slice(0, 80).replace(/\n/g, ' ');
                text.innerHTML = `<span style="color:var(--gold-p); font-size:10px;">${e.comment || ''}</span><br>${preview}${(e.content || '').length > 80 ? '...' : ''}`;
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

    API.showRangeModal = async function () {
        document.getElementById('rpg-range-modal').classList.add('active');
        try {
            const helper = window.parent.TavernHelper;
            if (!helper) return;
            const msgs = await helper.getChatMessages('0-{{lastMessageId}}');
            if (msgs.length > 0) document.getElementById('range-end-id').placeholder = `最後一條 ID: ${msgs[msgs.length - 1].message_id}`;

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
        document.getElementById('rpg-range-modal').classList.remove('active');
        API._generateSummary(start, end, sourceType, mergePrev);
    };

    API._generateSummary = async function (startId, endId, sourceType, mergePrev) {
        const btn = document.getElementById('btn-grand-summary');
        btn.innerText = "生成中 (請勿關閉)..."; btn.classList.add('spinning');
        try {
            const helper = window.parent.TavernHelper;
            if (!helper) throw new Error("無 TavernHelper");
            const bookName = helper.getCurrentCharPrimaryLorebook();
            const chatId = getChatIdentifier();
            const entries = await helper.getLorebookEntries(bookName);

            let contentToSummarize = "";
            let sourceDesc = "";

            if (sourceType === 'summary') {
                const logComment = `[RPG_LOG] - ${chatId}`;
                const logEntry = entries.find(e => e.comment === logComment);
                if (!logEntry) throw new Error(`找不到摘要日誌，請確保已同步`);
                const lines = logEntry.content.replace(/^\[.*?\]\s*/, '').split('\n');
                contentToSummarize = lines.filter(line => {
                    const match = line.match(/ID:(\d+)/);
                    if (!match) return true;
                    const id = parseInt(match[1]);
                    return (!startId || id >= startId) && (!endId || id <= endId);
                }).join('\n');
                sourceDesc = "摘要日誌";
            } else {
                const msgs = await helper.getChatMessages('0-{{lastMessageId}}');
                const filtered = msgs.filter(m => {
                    const id = parseInt(m.message_id);
                    return (!startId || id >= startId) && (!endId || id <= endId);
                });
                if (filtered.length === 0) throw new Error("範圍內無對話");
                contentToSummarize = filtered.map(m => {
                    const match = (m.message || m.mes || "").match(/<content>([\s\S]*?)<\/content>/i);
                    return match ? `\n[ID:${m.message_id}] ${match[1].trim()}` : "";
                }).join("");
                if (!contentToSummarize.trim()) throw new Error("未找到 <content> 標籤");
                sourceDesc = "全文對話";
            }

            let prevSummary = "";
            let summaryCount = 1;
            const oldSummaries = entries.filter(e => e.comment && e.comment.includes(`[大总结] - ${chatId}`));
            if (oldSummaries.length > 0) {
                summaryCount = oldSummaries.length + 1;
                if (mergePrev) prevSummary = oldSummaries.map(e => `=== 舊總結 ===\n${e.content}`).join("\n\n");
            }

            let prevSection = prevSummary ? (mergePrev ? `**合并所有之前的总结数据**\n${prevSummary}\n` : `**只总结新增剧情**\n${prevSummary}\n`) : `**首次总结**\n`;
            let actualLastId = endId || await helper.getLastMessageId() || startId;

            const tplBody = getSummaryTemplate().replace(/\{\{count\}\}/g, summaryCount);
            const prompt = `停止剧情输出，执行**新增大总结**\n\n${prevSection}\n${tplBody}\n=== ${sourceDesc} ===\n${contentToSummarize}`;

            const osApi = window.parent.OS_API;
            const osSet = window.parent.OS_SETTINGS;
            if (!osApi) throw new Error("找不到 OS_API");

            let generated = "";
            await new Promise((res, rej) => {
                osApi.chat([{ role: 'system', content: '剧情总结助手' }, { role: 'user', content: prompt }], osSet.getConfig(),
                    (chunk) => { generated = chunk; }, (final) => { generated = final; res(); }, (err) => rej(err), { disableTyping: true });
            });

            const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            let finalContent = generated;
            if (/【大总结\(第\d+次\)】/.test(finalContent)) finalContent = finalContent.replace(/【大总结\(第\d+次\)】/, `【大总结(第${summaryCount}次)】\nFirst: ${startId || 1}\nLast: ${actualLastId}`);
            else finalContent = `【大总结(第${summaryCount}次)】\nFirst: ${startId || 1}\nLast: ${actualLastId}\n\n${finalContent}`;

            const newEntry = { comment: `[大总结] - ${chatId} - 第${summaryCount}次 - ${now}`, keys: [`[SUMMARY_${chatId}_${now}]`], content: finalContent, enabled: true, position: 'at_depth_as_system', depth: 1, order: 998 };
            await helper.createLorebookEntries(bookName, [newEntry]);

            // 嘗試注入 KEY
            try {
                const lastId = await helper.getLastMessageId();
                if (lastId >= 0) {
                    const lastMsg = (await helper.getChatMessages(-1))[0];
                    if (lastMsg && !(lastMsg.mes || '').includes(newEntry.keys[0])) {
                        const _cur = lastMsg.mes || lastMsg.message || '';
                        await helper.setChatMessages([{ message_id: lastId, message: _cur + ' ' + newEntry.keys[0], mes: _cur + ' ' + newEntry.keys[0] }], { refresh: 'affected' });
                    }
                }
            } catch (e) { }

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

            alert(`✅ 第 ${summaryCount} 次大總結已生成！`);
        } catch (e) { alert("生成失敗: " + e.message); } finally {
            btn.innerText = "📝 生成 / 更新大總結 (Grand Summary)"; btn.classList.remove('spinning');
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
            await API._callSlashCommand('/unhide 0-{{lastMessageId}}');
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
    API._updateHideStatus = function () {
        const lastEl = document.getElementById('vrs-last-id');
        const hiddenEl = document.getElementById('vrs-hidden-list');
        if (!lastEl || !hiddenEl) return;
        try {
            const helper = win.TavernHelper;
            const ctx = win.SillyTavern?.getContext?.();
            const chat = ctx?.chat || [];
            let lastId = -1;
            if (helper?.getLastMessageId) lastId = helper.getLastMessageId();
            else if (chat.length) lastId = chat.length - 1;
            lastEl.textContent = lastId >= 0 ? `#${lastId}` : '—';
            const hiddenIds = [];
            chat.forEach((m, idx) => {
                if (m && m.is_system === true) hiddenIds.push(idx);
            });
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
            <div id="rpg-range-modal" class="rpg-modal-overlay">
                <div class="rpg-modal-card">
                    <div class="rpg-modal-title">生成大總結設置</div>
                    <div class="rpg-opt-group">
                        <div style="font-size:12px; color:#aaa; margin-bottom:8px; font-weight:bold;">數據來源 (Source):</div>
                        <label class="rpg-opt-label"><input type="radio" name="sum_source" value="summary" checked><span>📋 使用摘要 (summary)</span></label>
                        <span class="rpg-opt-desc">推薦: 讀取已同步的精簡摘要</span>
                        <label class="rpg-opt-label" style="margin-top:10px;"><input type="radio" name="sum_source" value="content"><span>📄 使用全文 (content)</span></label>
                        <span class="rpg-opt-desc">直接讀取對話內容 (較耗時)</span>
                        <div style="border-top:1px solid #333; margin-top:12px; padding-top:12px;">
                            <label class="rpg-opt-label" style="margin-bottom:4px;"><input type="checkbox" id="sum_merge" checked><span>合併之前的總結</span></label>
                            <span class="rpg-opt-desc">將舊的 [大總結] 一併發送給 AI 重整</span>
                        </div>
                    </div>
                    <div style="text-align:left; font-size:13px; color:#ccc; margin-bottom:10px;">
                        <label style="display:block; margin-bottom:5px;">起始 ID (Start):</label>
                        <input type="number" id="range-start-id" class="rpg-range-input" value="1" min="1">
                        <label style="display:block; margin-bottom:5px;">結束 ID (End):</label>
                        <input type="number" id="range-end-id" class="rpg-range-input" placeholder="留空代表最後一條">
                    </div>
                    <div class="rpg-btn-group">
                        <button class="bg-btn-action" onclick="document.getElementById('rpg-range-modal').classList.remove('active')">取消</button>
                        <button class="bg-btn-action gold" onclick="window.OS_STORY_TOOLS.confirmRangeAndGenerate()">開始生成</button>
                    </div>
                </div>
            </div>
            <div id="rpg-merge-modal" class="rpg-modal-overlay">
                <div class="rpg-modal-card" style="max-width:520px;">
                    <div class="rpg-modal-title">🔀 合併大總結</div>
                    <div style="margin-bottom:12px;">
                        <label style="display:block; font-size:11px; color:var(--gold-p); margin-bottom:5px;">備註 / 調整要求（發給 AI）</label>
                        <textarea id="sp-merge-note" style="width:100%; height:60px; background:#0d0d0d; border:1px solid #333; color:#ccc; font-size:11px; padding:6px; border-radius:3px; resize:vertical; box-sizing:border-box; font-family:'Microsoft YaHei',sans-serif;" placeholder="例：請特別保留角色A與B的關係細節，合併後去掉重複的物品記錄..."></textarea>
                    </div>
                    <div style="font-size:11px; color:#888; margin-bottom:8px;">勾選要合併的條目：</div>
                    <div id="sp-merge-list" style="flex:1; overflow-y:auto; max-height:260px; border:1px solid #222; border-radius:4px; padding:10px; background:#0f0f0f; min-height:80px; display:flex; flex-direction:column; gap:8px;">載入中...</div>
                    <div class="rpg-btn-group" style="margin-top:15px;">
                        <button class="bg-btn-action" onclick="document.getElementById('rpg-merge-modal').classList.remove('active')">取消</button>
                        <button class="bg-btn-action gold" onclick="window.OS_STORY_TOOLS.executeMergeSummaries()">🔀 開始合併</button>
                    </div>
                </div>
            </div>
            <div id="rpg-summary-tpl-modal" class="rpg-modal-overlay">
                <div class="rpg-modal-card" style="max-width:640px;">
                    <div class="rpg-modal-title">✏️ 大總結 生成模板</div>
                    <div style="font-size:11px; color:#666; margin-bottom:8px;">編輯後點保存，下次生成大總結時使用此模板。<br>可用佔位符：<span style="color:var(--gold-p);">{{count}}</span>（第幾次）</div>
                    <textarea id="sp-summary-tpl-area" style="width:100%; height:400px; background:#0d0d0d; border:1px solid #333; color:#ccc; font-size:11px; padding:8px; border-radius:3px; resize:vertical; box-sizing:border-box; font-family:'Microsoft YaHei',monospace;"></textarea>
                    <div class="rpg-btn-group" style="margin-top:12px;">
                        <button class="bg-btn-action" onclick="window.OS_STORY_TOOLS.resetSummaryTemplate()">↺ 還原預設</button>
                        <button class="bg-btn-action" onclick="document.getElementById('rpg-summary-tpl-modal').classList.remove('active')">關閉</button>
                        <button class="bg-btn-action gold" onclick="window.OS_STORY_TOOLS.saveSummaryTemplate()">💾 保存</button>
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
                        <button class="bg-btn-action gold" id="btn-grand-summary" onclick="window.OS_STORY_TOOLS.showRangeModal()">📝 生成 / 更新大總結 (Grand Summary)</button>
                        <div class="ost-hint">將最近的劇情壓縮成永久記憶</div>
                        <button class="bg-btn-action" onclick="window.OS_STORY_TOOLS.openSummaryTemplateModal()">✏️ 編輯大總結生成模板</button>
                        <div style="height:8px"></div>
                        <button class="bg-btn-action" onclick="window.OS_STORY_TOOLS.openMergeSummaryModal()">🔀 合併多個大總結</button>
                    </div>
                    <div class="ost-section">
                        <div class="ost-section-title">🙈 隱藏對話</div>
                        <div id="vn-reader-sa-toolbar">
                            <div class="tb-row">
                                <span class="tb-label">樓層</span>
                                <input type="number" class="tb-floor" id="vrs-hide-start" placeholder="起始" min="0">
                                <span class="tb-sep">~</span>
                                <input type="number" class="tb-floor" id="vrs-hide-end" placeholder="結束" min="0">
                                <button class="tb-btn" onclick="window.OS_STORY_TOOLS._slashHide(this)">隱藏</button>
                                <button class="tb-btn gold" onclick="window.OS_STORY_TOOLS._slashUnhide(this)">取消</button>
                                <button class="tb-btn danger" onclick="window.OS_STORY_TOOLS._slashShowAll(this)">全顯示</button>
                                <button class="tb-btn" onclick="window.OS_STORY_TOOLS._refreshStatus(this)" title="重新整理">🔄</button>
                            </div>
                            <div id="vrs-status">
                                <span class="lab">最後樓層</span><span class="val" id="vrs-last-id">—</span>
                                <span class="sep">｜</span>
                                <span class="lab">已隱藏</span><span class="val" id="vrs-hidden-list">—</span>
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
