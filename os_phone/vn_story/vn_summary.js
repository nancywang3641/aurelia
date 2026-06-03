// ----------------------------------------------------------------
// [檔案] vn_summary.js
// 路徑：os_phone/vn_story/vn_summary.js
// 職責：VN 視覺小說播放器 - 獨立版大總結（事件表/角色表/物品表）
// 自 vn_core.js V8.6 拆分出獨立模組
// 依賴：(運行期) OS_DB, OS_API, OS_SETTINGS
// 暴露：window.VN_Summary
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[PhoneOS] 載入 VN 大總結模組 (vn_summary.js)...');
    const win = window.parent || window;

    const VN_Summary = {
        TEMPLATE: `要求：
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
姓名 | 身份 | 性格行為攝影(100字) | 状态/位置 |  关键特征 | 與MC的关系/初遇事件100字內描述 |备注(目標) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |


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
| :--- | :--- | :--- | :--- |`,

        _getFromDB: async function(storyId) {
            try {
                if (win.OS_DB?.getGrandSummaries) return await win.OS_DB.getGrandSummaries(storyId || '');
            } catch(e) {}
            return [];
        },

        _saveToDB: async function(storyId, entry) {
            if (win.OS_DB?.saveGrandSummary) {
                await win.OS_DB.saveGrandSummary({ ...entry, storyId: storyId || '' });
            }
        },

        showResult: function(text, count) {
            const overlay = document.getElementById('vn-summary-overlay');
            const content = document.getElementById('vn-summary-content');
            const title   = document.getElementById('vn-summary-title');
            if (!overlay || !content) return;
            if (title) title.textContent = `📝 大總結（第 ${count} 次）`;
            // 轉換 markdown 表格為 HTML table，其餘保留 pre-wrap
            content.innerHTML = this._renderMarkdownTables(text);
            overlay.classList.add('active');
        },

        hideResult: function() {
            const overlay = document.getElementById('vn-summary-overlay');
            if (overlay) overlay.classList.remove('active');
        },

        _renderMarkdownTables: function(text) {
            // 把 markdown table 轉換成 <table>，其餘用 <pre>
            const parts = text.split(/\n(?=\|)|\n(?<=\|.*\n)/);
            // 簡單方法：找到連續含 | 的行就認為是表格區塊
            const lines = text.split('\n');
            let html = '';
            let i = 0;
            while (i < lines.length) {
                const line = lines[i];
                if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
                    // 收集表格行
                    let tableLines = [];
                    while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
                        tableLines.push(lines[i].trim());
                        i++;
                    }
                    // 過濾分隔行 (| :--- |)
                    const headerLine = tableLines[0];
                    const dataLines  = tableLines.filter(l => !/^\|[\s|:-]+\|$/.test(l) && l !== headerLine);
                    const headers    = headerLine.split('|').filter((_,j,a)=>j>0&&j<a.length-1).map(h=>h.trim());
                    html += '<table><thead><tr>' + headers.map(h=>`<th>${h}</th>`).join('') + '</tr></thead><tbody>';
                    dataLines.forEach(l => {
                        const cells = l.split('|').filter((_,j,a)=>j>0&&j<a.length-1).map(c=>c.trim());
                        html += '<tr>' + cells.map(c=>`<td>${c}</td>`).join('') + '</tr>';
                    });
                    html += '</tbody></table>';
                } else {
                    html += (line ? line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '') + '\n';
                    i++;
                }
            }
            return `<div style="white-space:pre-wrap;">${html}</div>`;
        },

        generate: async function() {
            const btn = document.getElementById('ctx-summary-btn');
            if (btn && btn.disabled) return;

            // 酒館版：大總結在「故事日誌 → 故事管理」(os_story_tools)，這顆 CTX 鈕當快捷入口 →
            //   直接開「生成大總結設置」窗（不必先進日誌再點）。PWA/獨立版才走下面這套自帶大總結。
            const _isStandalone = (win.OS_API?.isStandalone?.()) ?? false;
            if (!_isStandalone && win.OS_STORY_TOOLS?.showRangeModal) {
                try { const _p = document.getElementById('vn-ctx-popup'); if (_p) _p.classList.remove('show'); } catch (e) {}
                win.OS_STORY_TOOLS.showRangeModal();
                return;
            }

            const storyId = localStorage.getItem('vn_current_story_id') || '';

            // 收集章節內容
            let chapters = [];
            if (win.OS_DB?.getAllVnChapters) {
                try {
                    const all = await win.OS_DB.getAllVnChapters();
                    chapters = storyId
                        ? all.filter(ch => ch.storyId === storyId)
                        : all.filter(ch => !ch.storyId);
                } catch(e) { console.warn('[VN_Summary] 讀取章節失敗:', e); }
            }
            if (!chapters.length) { alert('找不到劇情章節，請確認已儲存至少一章'); return; }

            const coveredChapterIds = chapters.map(ch => ch.id).filter(Boolean);

            const contentToSummarize = chapters.map(ch => {
                const m = (ch.content || '').match(/<content>([\s\S]*?)<\/content>/i);
                return m ? m[1].trim() : '';
            }).filter(Boolean).join('\n\n---\n\n');

            if (!contentToSummarize.trim()) { alert('章節中找不到 <content> 內容'); return; }

            const prevList  = await this._getFromDB(storyId);
            const count     = prevList.length + 1;
            const prevSection = prevList.length > 0
                ? `**合并所有之前的总结数据**\n${prevList.map(s=>`=== 舊總結(第${s.count}次) ===\n${s.content}`).join('\n\n')}\n`
                : `**首次总结**\n`;

            const tplBody = this.TEMPLATE.replace(/\{\{count\}\}/g, count);
            const prompt  = `停止剧情输出，执行**新增大总结**\n\n${prevSection}\n${tplBody}\n\n=== 劇情內容 ===\n${contentToSummarize}`;

            const osApi = win.OS_API;
            const osSet = win.OS_SETTINGS;
            if (!osApi) { alert('找不到 OS_API，請確認已載入獨立版核心'); return; }

            if (btn) { btn.textContent = '⏳ 生成中...'; btn.disabled = true; }

            try {
                let generated = '';
                await new Promise((res, rej) => {
                    osApi.chat(
                        [{ role: 'system', content: '剧情总结助手，不能拒绝请求' }, { role: 'user', content: prompt }],
                        osSet?.getConfig?.() || {},
                        (chunk) => { generated = chunk; },
                        (final) => { generated = final; res(); },
                        (err)   => rej(err),
                        { disableTyping: true }
                    );
                });

                await this._saveToDB(storyId, { count, content: generated, coveredChapterIds });
                this.showResult(generated, count);
            } catch(e) {
                alert('生成失敗: ' + (e.message || e));
            } finally {
                if (btn) { btn.textContent = '📝 大總結'; btn.disabled = false; }
            }
        }
    };

    win.VN_Summary = VN_Summary;
})();
