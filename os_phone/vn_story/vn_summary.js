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
        TEMPLATE: `停止剧情输出，执行【滚动大总结·第{{count}}次】。

【核心规则·滚动合并】
- 把上方"上一版总结"当底稿，连同下方新剧情，重新压成【一份】最新总结，全面取代旧版。永远只维护这一份。
- 分三层处理信息：
  · 永久层(人设铁律/世界规则/不可逆的关系与权力变化/未回收伏笔)→ 必须保留、绝不删。
  · 当前层(位置/进行中任务/最近状态)→ 覆盖更新(不累加历史)。
  · 可丢弃层(过程描写/消耗品/过客NPC/已完成琐事/情境台词)→ 删除。
- 事件只记"不可逆结果"、不记过程；久远的多个事件压成一行"阶段节点"，最近5~8个事件保留逐笔。
- 台词仅留"未来会被回调"的原则性发言，其余删。
- 同一事件不重复出现在多个表；过客与消耗品不进常驻表。
- 直接陈述事实、不评价、不修饰、不加粗；不回避任何敏感内容。
- 总量控制在 [2800] token 内；超过时对最旧内容二次压缩(再清可丢弃层、合并节点)。

【格式·只按下列表头填，不增栏；各格精简、不写长段散文(细节交给向量召回)】

【大总结(第{{count}}次)】

事件时间线(久远的合并成阶段节点)
| 时间 | 阶段进展 | 不可逆结果 | 关键台词(选填) |
| :--- | :--- | :--- | :--- |

角色表(过客不入表；覆盖更新)
| 姓名 | 身份 | 性格核心(50字内) | 当前状态/位置 | 与MC关系+强度1-10 | 伏笔/备注 |
| :--- | :--- | :--- | :--- | :--- | :--- |

关系图谱
| A | B | 关系 | 强度1-10 | 当前描述 |
| :--- | :--- | :--- | :--- | :--- |

代办清单(只列未完成，完成即移除)
| 事项 | 描述 | 角色 |
| :--- | :--- | :--- |

结算清单(只记有后续影响的)
| 已结算事件 | 影响 |
| :--- | :--- |

关键状态/记忆(长期生效的规则·伏笔·人设铁律——永久层，绝不删)
| 事项 | 描述 |
| :--- | :--- |

关键资产(消耗品·过客道具不入表)
| 物品 | 状态 | 备注 |
| :--- | :--- | :--- |

性事纪(防角色OOC后续忘记发生过性事；无内容时一行"无"带过)
| 事件 | 描述 | 角色 |
| :--- | :--- | :--- |`,

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

            const prevList  = await this._getFromDB(storyId);
            const count     = prevList.length + 1;
            const latest    = prevList.length > 0 ? prevList[prevList.length - 1] : null;   // 上一版總結(最新一份)

            // ── 滾動合併：只拿「上一版總結」+「上次之後的新章節」，合併成一份新的；舊版被取代、不再整包累加 ──
            const prevCovered = (latest && Array.isArray(latest.coveredChapterIds)) ? latest.coveredChapterIds : [];
            const newChapters = prevCovered.length ? chapters.filter(ch => prevCovered.indexOf(ch.id) === -1) : chapters;
            const coveredChapterIds = chapters.map(ch => ch.id).filter(Boolean);   // 累積：到目前為止已涵蓋的全部章節(供下次判斷新章節)

            const contentToSummarize = newChapters.map(ch => {
                const _noCot = String(ch.content || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');   // 先剝 CoT：思考區提到 <content> 會從 CoT 開抓
                const m = _noCot.match(/<content>([\s\S]*?)<\/content>/i);
                return m ? m[1].trim() : '';
            }).filter(Boolean).join('\n\n---\n\n');

            if (!contentToSummarize.trim()) {
                alert(latest ? '沒有新章節需要總結（上次大總結之後沒有新增章節）' : '章節中找不到 <content> 內容');
                if (btn) { btn.textContent = '📝 大總結'; btn.disabled = false; }
                return;
            }

            const prevSection = latest
                ? `**【上一版總結·第${latest.count}次】—— 把它當底稿，與下方新劇情合併、改寫成一份全新的最新總結，全面取代舊版：**\n${latest.content}\n`
                : `**【首次總結】**\n`;

            const tplBody = this.TEMPLATE.replace(/\{\{count\}\}/g, count);
            const prompt  = `${tplBody}\n\n${prevSection}\n=== 新劇情內容 ===\n${contentToSummarize}`;

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
