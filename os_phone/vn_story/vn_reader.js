// ----------------------------------------------------------------
// [檔案] vn_reader.js — 獨立劇情閱讀器
// 職責：從 OS_DB 直接讀取 VN 章節，不依賴 VN 面板是否啟動。
//       暴露 window.VN_READER.show() 供大廳按鈕直接呼叫。
// ----------------------------------------------------------------
(function () {
    'use strict';

    const win = window.parent || window;
    let _overlay = null;
    let _activeStoryId = '';

    // ── 取得/建立 overlay DOM ─────────────────────────────────────
    function _ensureDOM() {
        if (_overlay && document.contains(_overlay)) return _overlay;

        const container = document.getElementById('aurelia-phone-screen')
            || document.getElementById('aurelia-embedded-root')
            || document.body;

        _overlay = document.createElement('div');
        _overlay.id = 'vn-reader-sa';
        _overlay.style.cssText = [
            'position:absolute;inset:0;',
            'background:rgba(6,6,10,0.98);',
            'z-index:200;',
            'display:none;flex-direction:column;',
        ].join('');

        _overlay.innerHTML = `
            <div id="vn-reader-sa-hd" style="display:flex;justify-content:space-between;align-items:center;
                 padding:calc(14px + env(safe-area-inset-top,0px)) 20px 14px;
                 border-bottom:1px solid rgba(212,175,55,0.2);flex-shrink:0;box-sizing:border-box;">
                <div style="color:#d4af37;font-size:1rem;letter-spacing:2px;
                            font-family:'Playfair Display','Noto Serif TC',serif;">📖 劇情閱讀器</div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div id="vn-reader-sa-summary-btn"
                         style="color:#888;font-size:0.78rem;cursor:pointer;padding:3px 8px;
                                border:1px solid rgba(212,175,55,0.2);border-radius:4px;">📝 大總結</div>
                    <div id="vn-reader-sa-close"
                         style="color:#666;font-size:1.6rem;cursor:pointer;line-height:1;">✕</div>
                </div>
            </div>
            <div id="vn-reader-sa-tabs"
                 style="display:none;flex-shrink:0;gap:2px;padding:8px 14px 0;
                        overflow-x:auto;border-bottom:1px solid rgba(255,255,255,0.05);
                        scrollbar-width:none;"></div>
            <div id="vn-reader-sa-body"
                 style="flex:1;overflow-y:auto;padding:16px 14px;
                        display:flex;flex-direction:column;gap:16px;
                        scrollbar-width:thin;scrollbar-color:#222 transparent;"></div>`;

        container.appendChild(_overlay);

        _overlay.querySelector('#vn-reader-sa-close').onclick      = () => VN_READER.hide();
        _overlay.querySelector('#vn-reader-sa-summary-btn').onclick = () => VN_READER.showSummaryEditor();

        return _overlay;
    }

    // ── strip VN tags → 純文字 ────────────────────────────────────
    function _strip(text) {
        if (!text) return '';
        let s = text;
        s = s.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, '');
        s = s.replace(/<summary>[\s\S]*?<\/summary>/gi, '');
        s = s.replace(/<profile>[\s\S]*?<\/profile>/gi, '');
        s = s.replace(/<avatar>[\s\S]*?<\/avatar>/gi, '');
        s = s.replace(/<status>[\s\S]*?<\/status>/gi, '');
        const cm = s.match(/<content>([\s\S]*?)<\/content>/i);
        if (cm) s = cm[1];
        else s = s.replace(/<\/?(content)[^>]*>/gi, '');
        s = s.replace(/\[Char\|([^|]+)\|[^|]*\|([^|\]]+)(?:\|[^\]]+)?\]/g, (_, n, d) => `${n.trim()}：${d.trim()}`);
        s = s.replace(/\[Nar\|([^|\]]+)(?:\|[^\]]+)?\]/g, (_, t) => `　　${t.trim()}`);
        s = s.replace(/\[Inner\|[^|]+\|([^|\]]+)(?:\|[^\]]+)?\]/g, (_, t) => `（${t.trim()}）`);
        s = s.replace(/\[(Story|Chapter|Protagonist|Area|BGM|Bg|Trans|Item|SessionEnd|Achievement|Choice|Quest)[^\]]*\]/gi, '');
        s = s.replace(/\[[^\[\]\n]{1,80}\]/g, '');
        s = s.replace(/<[^>]+>/g, '');
        s = s.replace(/\n{3,}/g, '\n\n').trim();
        return s;
    }

    function _toHtml(text) {
        return text
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/\n\n+/g,'</p><p style="margin:0 0 0.8em">')
            .replace(/\n/g,'<br>');
    }

    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // ── 模式偵測：有 TavernHelper 且非 standalone 視為酒館模式 ────
    function _isTavernMode() {
        if (win.OS_API?.isStandalone?.()) return false;
        return !!win.TavernHelper;
    }

    // ── 從酒館 TavernHelper 拉訊息，組成統一 chapter 格式 ─────────
    function _fetchTavernChapters() {
        const helper = win.TavernHelper;
        if (!helper) return [];

        const lastId = helper.getLastMessageId?.();
        if (lastId == null || lastId < 0) return [];

        let allMsgs = [];
        try {
            allMsgs = helper.getChatMessages(`0-${lastId}`) || [];
        } catch (e) {
            console.error('[VN_READER] getChatMessages 失敗:', e);
            return [];
        }

        const chapters = [];
        let chapterIndex = 0;
        let pendingUserText = '';

        allMsgs.forEach(m => {
            // user 訊息：暫存，等下個 assistant 訊息配對成章節的 request
            if (m.role === 'user' || m.is_user === true) {
                pendingUserText = m.message || m.mes || '';
                return;
            }

            const text = m.message || m.mes || '';
            // 過濾沒 <content> 標籤的（純對話/系統訊息）
            if (!text.includes('<content>')) {
                pendingUserText = '';
                return;
            }

            chapterIndex++;
            let chTitle = `對話紀錄 ${chapterIndex}`;
            const chMatch = text.match(/\[Chapter\|(?:\d+\|)?([^\]|]+)\]/i);
            const storyMatch = text.match(/\[Story\|([^\]]+)\]/i);
            if (chMatch) chTitle = chMatch[1].trim();
            else if (storyMatch) chTitle = storyMatch[1].trim();

            // thinking 抽取（兼容 <think> 跟 <thinking>）
            let thinking = '';
            const thMatch = text.match(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/i);
            if (thMatch) thinking = thMatch[1].trim();

            // createdAt
            let createdAt = Date.now();
            if (m.send_date) {
                const t = typeof m.send_date === 'number' ? m.send_date : Date.parse(m.send_date);
                if (!isNaN(t)) createdAt = t;
            }

            chapters.push({
                id: `tv_${m.message_id ?? chapterIndex}`,
                storyId: '__tavern__',
                storyTitle: '當前對話',
                title: chTitle,
                request: pendingUserText,
                content: text,
                thinking: thinking,
                createdAt: createdAt
            });

            pendingUserText = '';
        });

        return chapters;
    }

    // ── 渲染章節列表 ──────────────────────────────────────────────
    function _renderChapters(chapters, body) {
        const sorted = [...chapters].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        if (!sorted.length) {
            body.innerHTML = '<div style="text-align:center;color:#333;font-size:0.82rem;padding:40px;">此故事無章節記錄</div>';
            return;
        }
        let html = '';
        sorted.forEach((ch, i) => {
            const id        = ch.id || `ch_${i}`;
            const userText  = ch.request ? esc(ch.request) : '';
            const novelText = `<p style="margin:0">${_toHtml(_strip(ch.content || ''))}</p>`;
            const rawText   = esc(ch.content || '');
            const thinkText = esc(ch.thinking || '');
            const ts        = ch.createdAt ? new Date(ch.createdAt).toLocaleString('zh-TW') : '';

            html += `<div class="vn-reader-divider">── CH.${String(i+1).padStart(2,'0')} ${esc(ch.title||'')} · ${ts} ──</div>`;

            if (userText) {
                html += `<div class="vn-reader-msg user">
                    <div class="vn-reader-label">👤 用戶</div>
                    <div class="vn-reader-bubble">${userText}</div>
                </div>`;
            }

            const thinkBlock = thinkText ? `
                <div class="vn-reader-think-wrap" id="vrth-${id}">
                    <div class="vn-reader-think-hd" onclick="window.VN_READER._thinkToggle('${id}')">
                        <span class="rth-arrow">▶</span><span>思考了一段時間</span>
                    </div>
                    <div class="vn-reader-think-body">${thinkText}</div>
                </div>` : '';

            html += `<div class="vn-reader-msg ai">
                <div class="vn-reader-msg-hd">
                    <div class="vn-reader-label">🤖 AI</div>
                    <div class="vn-reader-actions">
                        <button class="vn-reader-act-btn" onclick="window.VN_READER._toggle('${id}',this)">📄 看原始 tag</button>
                    </div>
                </div>
                ${thinkBlock}
                <div class="vn-reader-bubble novel-view" id="vrb-novel-${id}">${novelText || '<span style="color:#555">（無內容）</span>'}</div>
                <div class="vn-reader-bubble raw-view" id="vrb-raw-${id}">${rawText}</div>
            </div>`;
        });
        body.innerHTML = html;
        body.scrollTop = body.scrollHeight;
    }

    // ── 公開 API ──────────────────────────────────────────────────
    const VN_READER = {

        async show() {
            const overlay = _ensureDOM();
            overlay.style.display = 'flex';

            const body   = overlay.querySelector('#vn-reader-sa-body');
            const tabsEl = overlay.querySelector('#vn-reader-sa-tabs');

            body.innerHTML = '<div style="text-align:center;color:#333;font-size:0.82rem;padding:40px;">載入中...</div>';

            // 🔥 酒館模式：從 TavernHelper 拿當前 chat 訊息
            if (_isTavernMode()) {
                const chapters = _fetchTavernChapters();
                if (!chapters.length) {
                    body.innerHTML = '<div style="text-align:center;color:#333;font-size:0.82rem;padding:40px;line-height:1.6;">當前聊天無含 &lt;content&gt; 標籤的章節<br><span style="font-size:0.78rem;color:#444;">(需要 AI 用 VN 格式回覆才會被識別)</span></div>';
                    tabsEl.style.display = 'none';
                    return;
                }
                tabsEl.style.display = 'none';
                _activeStoryId = '__tavern__';
                _renderChapters(chapters, body);
                return;
            }

            // PWA 模式：從 OS_DB 拿章節
            let allChapters = [];
            try { allChapters = await (win.OS_DB?.getAllVnChapters?.() || []); } catch(e) {}

            if (!allChapters.length) {
                body.innerHTML = '<div style="text-align:center;color:#333;font-size:0.82rem;padding:40px;">尚無章節記錄</div>';
                return;
            }

            // 按 storyId 分組
            const groups = {};
            allChapters.forEach(ch => {
                const gid = ch.storyId || '__legacy__';
                if (!groups[gid]) groups[gid] = { storyTitle: ch.storyTitle || '舊版資料', storyId: ch.storyId || '', chapters: [] };
                groups[gid].chapters.push(ch);
            });
            const sorted = Object.values(groups).sort((a, b) => {
                const aMax = Math.max(...a.chapters.map(c => c.createdAt || 0));
                const bMax = Math.max(...b.chapters.map(c => c.createdAt || 0));
                return bMax - aMax;
            });

            const currentId = win.VN_Core?._currentStoryId || localStorage.getItem('vn_current_story_id') || '';
            let active = sorted.find(g => g.storyId && g.storyId === currentId) || sorted[0];
            _activeStoryId = active.storyId || '';

            // 建 Tab 列
            tabsEl.innerHTML = '';
            if (sorted.length > 1) {
                tabsEl.style.display = 'flex';
                sorted.forEach(group => {
                    const tab = document.createElement('div');
                    tab.className = 'vn-reader-tab' + (group === active ? ' active' : '');
                    tab.textContent = group.storyTitle;
                    tab.onclick = () => {
                        tabsEl.querySelectorAll('.vn-reader-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        _activeStoryId = group.storyId || '';
                        _renderChapters(group.chapters, body);
                    };
                    tabsEl.appendChild(tab);
                });
            } else {
                tabsEl.style.display = 'none';
            }

            _renderChapters(active.chapters, body);
        },

        hide() {
            if (_overlay) _overlay.style.display = 'none';
        },

        // ── 大總結編輯器 ──────────────────────────────────────────
        async showSummaryEditor() {
            const overlay = _ensureDOM();
            const body    = overlay.querySelector('#vn-reader-sa-body');
            const tabsEl  = overlay.querySelector('#vn-reader-sa-tabs');
            if (!body) return;

            body._prevHtml   = body.innerHTML;
            body._prevScroll = body.scrollTop;
            if (tabsEl) { body._prevTabsDisplay = tabsEl.style.display; tabsEl.style.display = 'none'; }

            body.innerHTML = '<div style="padding:20px;color:#555;font-size:0.85rem;">載入大總結中...</div>';

            const storyId = _activeStoryId || localStorage.getItem('vn_current_story_id') || '';
            let summaries = [];
            try {
                if (win.OS_DB?.getGrandSummaries) summaries = await win.OS_DB.getGrandSummaries(storyId);
            } catch(e) {}

            if (!summaries.length) {
                body.innerHTML = `
                    <div style="display:flex;flex-direction:column;height:100%;padding:20px;box-sizing:border-box;">
                        <div style="color:#555;font-size:0.85rem;margin-bottom:16px;">尚無大總結記錄。Token 達 70% 時可在 CTX 彈窗中生成。</div>
                        <button onclick="window.VN_READER.hideSummaryEditor()"
                            style="align-self:flex-start;background:transparent;border:1px solid rgba(212,175,55,0.25);
                                   color:#888;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:0.82rem;">← 返回閱讀器</button>
                    </div>`;
                return;
            }

            const latest = summaries.reduce((a, b) => (a.count >= b.count ? a : b));
            body._summaryEntry = latest;

            const ts = latest.timestamp ? new Date(latest.timestamp).toLocaleString('zh-TW') : '';
            body.innerHTML = `
                <div style="display:flex;flex-direction:column;height:100%;padding:16px;box-sizing:border-box;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                        <div style="color:#d4af37;font-size:0.82rem;letter-spacing:1px;">
                            📝 大總結（第 ${latest.count} 次）
                            <span style="color:#555;font-size:0.75rem;margin-left:8px;">${ts}</span>
                        </div>
                        <div style="color:#555;font-size:0.72rem;">覆蓋 ${(latest.coveredChapterIds||[]).length} 章</div>
                    </div>
                    <textarea id="vn-reader-sa-summary-area"
                        style="flex:1;width:100%;background:rgba(255,255,255,0.04);
                               border:1px solid rgba(212,175,55,0.18);color:#e8dfc8;
                               padding:12px;border-radius:6px;font-family:monospace;
                               font-size:0.78rem;resize:none;line-height:1.6;
                               box-sizing:border-box;outline:none;"
                        spellcheck="false">${esc(latest.content)}</textarea>
                    <div style="display:flex;gap:8px;margin-top:12px;flex-shrink:0;">
                        <button onclick="window.VN_READER.hideSummaryEditor()"
                            style="background:transparent;border:1px solid rgba(255,255,255,0.12);color:#888;
                                   padding:7px 18px;border-radius:4px;cursor:pointer;font-size:0.82rem;">← 返回</button>
                        <button onclick="window.VN_READER.saveSummaryEdit()"
                            style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.35);
                                   color:#d4af37;padding:7px 18px;border-radius:4px;
                                   cursor:pointer;font-size:0.82rem;flex:1;">💾 儲存修改</button>
                    </div>
                </div>`;
        },

        hideSummaryEditor() {
            const body   = _overlay?.querySelector('#vn-reader-sa-body');
            const tabsEl = _overlay?.querySelector('#vn-reader-sa-tabs');
            if (!body) return;
            if (body._prevHtml !== undefined) {
                body.innerHTML   = body._prevHtml;
                body.scrollTop   = body._prevScroll || 0;
            }
            if (tabsEl && body._prevTabsDisplay !== undefined) tabsEl.style.display = body._prevTabsDisplay;
        },

        async saveSummaryEdit() {
            const body     = _overlay?.querySelector('#vn-reader-sa-body');
            const textarea = document.getElementById('vn-reader-sa-summary-area');
            if (!textarea || !body?._summaryEntry) return;
            const entry = { ...body._summaryEntry, content: textarea.value };
            try {
                await win.OS_DB?.saveGrandSummary(entry);
                const saveBtn = textarea.closest('div').nextElementSibling?.querySelector('button:last-child');
                if (saveBtn) {
                    const orig = saveBtn.textContent;
                    saveBtn.textContent = '✓ 已儲存';
                    setTimeout(() => { saveBtn.textContent = orig; }, 1500);
                }
                body._summaryEntry = entry;
            } catch(e) { alert('儲存失敗: ' + (e.message || e)); }
        },

        // ── 內部輔助（供 onclick 呼叫）────────────────────────────
        _thinkToggle(id) {
            document.getElementById(`vrth-${id}`)?.classList.toggle('open');
        },
        // 切換小說 ↔ 原始 tag（互斥顯示，不展開在底部）
        _toggle(id, btn) {
            const novel = document.getElementById(`vrb-novel-${id}`);
            const raw   = document.getElementById(`vrb-raw-${id}`);
            if (!novel || !raw) return;
            const showRaw = !raw.classList.contains('active');
            raw.classList.toggle('active', showRaw);
            novel.classList.toggle('hidden', showRaw);
            btn.classList.toggle('active', showRaw);
            btn.textContent = showRaw ? '📖 看小說' : '📄 看原始 tag';
        }
    };

    win.VN_READER = VN_READER;
    console.log('[PhoneOS] 獨立閱讀器模組 (vn_reader.js) 已載入');
})();
