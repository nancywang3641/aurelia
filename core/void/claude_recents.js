/**
 * core/void/claude_recents.js — Claude Recents 多會話清單（列表渲染/改名/刪除/右鍵選單/切換會話/左上標題小卡）
 * 從 void_terminal.js 抽出。橋：VoidTerminal._bridge（renderHistoryList / showHistoryConfirm /
 * closeHistoryPanel / scheduleSave / isClaudeRoom / setActiveHistory / setClaudeHistoryBackup）。
 * CSS 在 css/void_claude_recents.css（原本就獨立、不動）。
 */
(function (VoidClaudeRecents) {
    'use strict';

    function _bridge() { return window.VoidTerminal && window.VoidTerminal._bridge; }

    // ---- 借核心的函式（惰性取橋，載入順序無硬依賴）----
    function renderHistoryList()  { const br = _bridge(); if (br) br.renderHistoryList(); }
    function closeHistoryPanel()  { const br = _bridge(); if (br) br.closeHistoryPanel(); }
    function debouncedSave()      { const br = _bridge(); if (br) br.scheduleSave(); }
    function showHistoryConfirm(message, type, onConfirm) {
        const br = _bridge(); if (br) br.showHistoryConfirm(message, type, onConfirm);
    }

    // ===== Claude Recents 視圖（多會話）=====

    /** 更新左上角 conv 標題小卡：tab icon + title + 下拉箭頭。
     *  在 enter room / switch conv / delete conv / 新會話 / 送完訊息（title 可能自動改）後呼叫。
     */
    function _updateClaudeConvChip() {
        const chip = document.getElementById('claude-conv-chip');
        if (!chip || !window.ClaudeTerminal) return;
        const tab = window.ClaudeTerminal.getActiveTab();
        const convId = window.ClaudeTerminal.getActiveConvId(tab);
        const tabIcon = tab === 'codex' ? '🔷' : tab === 'api' ? '🌐' : '☕';
        const tabEl = document.getElementById('ccc-tab');
        const titleEl = document.getElementById('ccc-title');
        if (tabEl) tabEl.textContent = tabIcon;
        if (!convId) {
            if (titleEl) titleEl.textContent = '新會話';
            return;
        }
        const found = window.ClaudeTerminal.findConv(convId);
        if (titleEl) titleEl.textContent = (found && found.meta.title) || '新會話';
    }
    // 暴露給 claude-room.js（送訊息完成後呼叫、因為新 conv 第一條 user msg 會自動設標題）
    window._VoidClaudeUpdateChip = _updateClaudeConvChip;

    function _claudeRelTime(ts) {
        if (!ts) return '從未對話';
        const diff = Date.now() - ts;
        const min = Math.floor(diff / 60000);
        if (min < 1) return '剛剛';
        if (min < 60) return min + ' 分鐘前';
        const hr = Math.floor(min / 60);
        if (hr < 24) return hr + ' 小時前';
        const day = Math.floor(hr / 24);
        if (day < 7) return day + ' 天前';
        const d = new Date(ts);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    function renderClaudeRecentsList() {
        const listEl  = document.getElementById('hist-list');
        const countEl = document.getElementById('hist-count');
        if (!listEl) return;
        if (!window.ClaudeTerminal) {
            listEl.innerHTML = '<div class="hist-empty" style="color:rgba(26,28,40,0.72); text-align:center; padding: 20px;">── ClaudeTerminal 未載入 ──</div>';
            if (countEl) countEl.textContent = '';
            return;
        }
        const activeTab = window.ClaudeTerminal.getActiveTab();
        const convs = window.ClaudeTerminal.listConversations(activeTab);
        const activeConvId = window.ClaudeTerminal.getActiveConvId(activeTab);

        if (countEl) countEl.textContent = `${convs.length} 個會話`;

        listEl.innerHTML = '';

        // tab bar：訂閱 Max / Anthropic API（Codex 房間單一 backend，不顯示）
        if (activeTab !== 'codex') {
            const tabBar = document.createElement('div');
            tabBar.className = 'claude-recents-tabs';
            tabBar.innerHTML = `
                <button class="cr-tab ${activeTab === 'max' ? 'active' : ''}" data-tab="max">🏠 訂閱 Max</button>
                <button class="cr-tab ${activeTab === 'api' ? 'active' : ''}" data-tab="api">🌐 Anthropic API</button>
            `;
            tabBar.querySelectorAll('.cr-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    window.ClaudeTerminal.setActiveTab(btn.dataset.tab);
                    renderHistoryList();
                });
            });
            listEl.appendChild(tabBar);
        }

        if (!convs.length) {
            const empty = document.createElement('div');
            empty.className = 'hist-empty';
            empty.style.cssText = 'color:rgba(26,28,40,0.72); text-align:center; padding: 30px 20px;';
            empty.textContent = activeTab === 'max'
                ? '── 訂閱 Max 還沒有對話 ──'
                : '── Anthropic API 還沒有對話 ──';
            listEl.appendChild(empty);
            return;
        }

        convs.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'hist-item claude-recent';
            if (conv.id === activeConvId) item.classList.add('active');

            const titleSafe = (conv.title || '新會話').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const checkMark = conv.id === activeConvId ? '✓ ' : '';

            item.innerHTML = `
                <div class="claude-recent-body">
                    <div class="claude-recent-title">${checkMark}${titleSafe}</div>
                    <div class="claude-recent-meta">${conv.msgCount || 0} 條訊息 · ${_claudeRelTime(conv.lastActive)}</div>
                </div>
                <div class="claude-recent-actions">
                    <button class="cr-icon-btn" data-act="rename" title="改名">✎</button>
                    <button class="cr-icon-btn danger" data-act="delete" title="刪除">✕</button>
                </div>
            `;
            // 點 item body 切換 conv；點 action 按鈕單獨處理（stopPropagation）
            item.addEventListener('click', () => _switchToClaudeConv(conv.id));
            const renameBtn = item.querySelector('[data-act="rename"]');
            const delBtn    = item.querySelector('[data-act="delete"]');
            if (renameBtn) renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                _startRenameClaudeConv(item, conv);
            });
            if (delBtn) delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                _confirmDeleteClaudeConv(conv);
            });
            // 桌面右鍵也跳改名/刪除 mini menu（簡單版：直接 confirm 後執行）
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                _showClaudeConvContextMenu(e.pageX, e.pageY, item, conv);
            });
            listEl.appendChild(item);
        });
    }

    function _startRenameClaudeConv(itemEl, conv) {
        if (!window.ClaudeTerminal) return;
        const titleEl = itemEl.querySelector('.claude-recent-title');
        if (!titleEl || titleEl.querySelector('input')) return;
        const oldTitle = conv.title || '新會話';

        titleEl.innerHTML = '';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'claude-recent-rename-input';
        inp.value = oldTitle;
        inp.maxLength = 50;

        let done = false;
        const commit = () => {
            if (done) return; done = true;
            const newTitle = inp.value.trim();
            if (newTitle && newTitle !== oldTitle) {
                window.ClaudeTerminal.renameConversation(conv.id, newTitle);
            }
            renderHistoryList();
        };
        const cancel = () => {
            if (done) return; done = true;
            renderHistoryList();
        };
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault(); commit();
            } else if (e.key === 'Escape') {
                e.preventDefault(); cancel();
            }
        });
        inp.addEventListener('blur', commit);
        inp.addEventListener('click', (e) => e.stopPropagation());

        titleEl.appendChild(inp);
        inp.focus();
        inp.select();
    }

    async function _confirmDeleteClaudeConv(conv) {
        if (!window.ClaudeTerminal) return;
        const title = conv.title || '新會話';
        const msg = `將永久刪除「${title}」（${conv.msgCount || 0} 條訊息）。\n此操作不可復原。`;
        showHistoryConfirm(msg, 'danger', async () => {
            const tab = window.ClaudeTerminal.getActiveTab();
            const wasActive = window.ClaudeTerminal.getActiveConvId(tab) === conv.id;
            await window.ClaudeTerminal.deleteConversation(conv.id);
            // 剛刪的是 active conv 且當前在 Claude 房間：載入新的 active 或清空畫面
            const br = _bridge();
            if (wasActive && br && br.isClaudeRoom()) {
                const nextActive = window.ClaudeTerminal.getActiveConvId(tab);
                if (nextActive) {
                    // _switchToClaudeConv 會 closeHistoryPanel，刪除完讓 Recents 留著、直接重渲
                    const result = await window.ClaudeTerminal.loadConversation(nextActive);
                    if (result) {
                        br.setActiveHistory((result.messages || []).map(m => ({
                            role: m.role, content: m.content,
                            ts: m.timestamp || Date.now(),
                            thinking: m.thinking, usage: m.usage,
                            tools_used: m.tools_used, attachments: m.attachments,
                        })));
                        const stream = document.getElementById('claude-chat-stream');
                        if (stream) stream.innerHTML = '';
                        if (window.VoidClaudeRoom && typeof window.VoidClaudeRoom.hydrateStream === 'function') {
                            window.VoidClaudeRoom.hydrateStream();
                        }
                    }
                } else {
                    // 沒剩 conv：清 chat stream，下次發訊息會自動新建
                    br.setActiveHistory([]);
                    const stream = document.getElementById('claude-chat-stream');
                    if (stream) stream.innerHTML = '';
                    if (window.VoidClaudeRoom && typeof window.VoidClaudeRoom.renderBubble === 'function') {
                        window.VoidClaudeRoom.renderBubble('assistant', '對話都刪完了。發新訊息會自動開始新對話。');
                    }
                }
            }
            renderHistoryList();
            _updateClaudeConvChip();
            debouncedSave();
        });
    }

    function _showClaudeConvContextMenu(x, y, itemEl, conv) {
        const existing = document.getElementById('claude-recent-ctx-menu');
        if (existing) existing.remove();
        const menu = document.createElement('div');
        menu.id = 'claude-recent-ctx-menu';
        menu.className = 'claude-recent-ctx-menu';
        menu.innerHTML = `
            <button class="cr-ctx-item" data-act="rename">✎ 改名</button>
            <button class="cr-ctx-item danger" data-act="delete">✕ 刪除</button>
        `;
        const close = () => menu.remove();
        menu.querySelector('[data-act="rename"]').addEventListener('click', (e) => {
            e.stopPropagation(); close(); _startRenameClaudeConv(itemEl, conv);
        });
        menu.querySelector('[data-act="delete"]').addEventListener('click', (e) => {
            e.stopPropagation(); close(); _confirmDeleteClaudeConv(conv);
        });
        document.body.appendChild(menu);
        // 視窗內定位（避免出邊界）
        const r = menu.getBoundingClientRect();
        const px = Math.min(x, window.innerWidth - r.width - 8);
        const py = Math.min(y, window.innerHeight - r.height - 8);
        menu.style.left = px + 'px';
        menu.style.top  = py + 'px';
        // 任意點擊關閉
        setTimeout(() => {
            const off = (e) => {
                if (!menu.contains(e.target)) { close(); document.removeEventListener('click', off, true); }
            };
            document.addEventListener('click', off, true);
        }, 0);
    }

    async function _switchToClaudeConv(convId) {
        if (!window.ClaudeTerminal) return;
        const result = await window.ClaudeTerminal.switchConversation(convId);
        if (!result) return;
        const messages = (result.messages || []).map(m => ({
            role: m.role,
            content: m.content,
            ts: m.timestamp || Date.now(),
            thinking: m.thinking,
            usage: m.usage,
            tools_used: m.tools_used,
            attachments: m.attachments,
        }));
        const br = _bridge();
        if (br && br.isClaudeRoom()) {
            br.setActiveHistory(messages);
            const stream = document.getElementById('claude-chat-stream');
            if (stream) stream.innerHTML = '';
            if (window.VoidClaudeRoom && typeof window.VoidClaudeRoom.hydrateStream === 'function') {
                window.VoidClaudeRoom.hydrateStream();
            }
            if (messages.length === 0 && window.VoidClaudeRoom && typeof window.VoidClaudeRoom.renderBubble === 'function') {
                window.VoidClaudeRoom.renderBubble('assistant', '新對話開始了。說吧。');
            }
            if (window.VoidClaudeRoom && typeof window.VoidClaudeRoom.setPortraitState === 'function') {
                window.VoidClaudeRoom.setPortraitState('living');
            }
        } else if (br) {
            br.setClaudeHistoryBackup(messages);
        }
        _updateClaudeConvChip();
        closeHistoryPanel();
        debouncedSave();
    }

    // ===== 導出 =====
    VoidClaudeRecents.renderList = renderClaudeRecentsList;   // 歷史面板 claude 分支（void_terminal renderHistoryList 呼叫）
    VoidClaudeRecents.updateChip = _updateClaudeConvChip;     // 左上 conv 標題小卡（enterClaudeRoom / 新會話後呼叫）

    console.log('✅ VoidClaudeRecents（Recents 多會話清單）模組就緒');
})(window.VoidClaudeRecents = window.VoidClaudeRecents || {});
