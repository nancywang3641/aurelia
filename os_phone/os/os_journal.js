// ----------------------------------------------------------------
// [檔案] os_journal.js
// 路徑：os_phone/os/os_journal.js
// 職責：📖 故事日誌（Story Journal）— 跨卡顯示 lobby_summary_index 內容
// 數據源：OS_DB.getLobbySummaryForPrompt(5) — 已分組到 (cardName, chatId) 顆粒度
//        每筆 { cardName, chatId, storyTitle, briefs[最近5], characters[] }
// 入口：大廳 SPENT POINT 卡片改成 data-app-launch="journal"
// ----------------------------------------------------------------
(function() {
    'use strict';
    const win = window.parent || window;

    // 「主角本尊 / 初見 / 追求中…」這類視覺標籤從 character row 第 4 欄（狀態）抽
    //   row 格式：姓名 | 身份 | 性格 | 狀態 | 特徵 | 與MC關係 | 備註
    function _parseCharRow(row) {
        const cols = (row || '').split('|').map(s => s.trim());
        // markdown 表格行常有前導/結尾 |，切完首尾會多出空欄 → 去掉，否則欄位整體位移一格（身份顯示成姓名）
        if (cols.length && cols[0] === '') cols.shift();
        if (cols.length && cols[cols.length - 1] === '') cols.pop();
        return {
            name:    cols[0] || '',
            role:    cols[1] || '',
            person:  cols[2] || '',
            status:  cols[3] || '',
            feature: cols[4] || '',
            relate:  cols[5] || '',
            note:    cols[6] || '',
        };
    }

    // 「名_姓」總結標籤 → 顯示用「姓名」（姓在前）。只在顯示層轉，配頭像仍用原始字串。
    //   子寒_应 → 应子寒、予_纪 → 纪予、無_老狗 → 老狗（無=沒有姓）。
    //   格式怪的（如沒填好的範本「姓名(名_姓氏)」）原樣留著，不硬轉成亂碼。
    function _displayName(raw) {
        const s = String(raw || '').trim();
        if (!s) return s;
        if (!/^[^\s_（）()]+_[^\s_（）()]+$/.test(s)) return s; // 僅處理乾淨的「名_姓」
        const parts = s.split('_').map(p => p.trim());
        const given = parts[0], surname = parts[1];
        if (surname === '無' || surname === '无') return given;   // 沒有姓
        if (given   === '無' || given   === '无') return surname;
        return surname + given; // 姓 + 名
    }

    function _escape(s) {
        return String(s ?? '').replace(/[&<>"']/g, c =>
            ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
        );
    }

    // 簡化版 markdown 轉 HTML：處理 【標題】 + 表格 + 一般段落
    //   - 連續含 ≥2 個 | 的行收成 table，第二行若為對齊列（純 :-）就當表頭
    //   - 【XXX】 → <h4>
    //   - 其他非空行 → <p>，空行 → <br>
    //   - 全部 escape 過，安全
    function _renderMd(text) {
        if (!text) return '';
        const lines = String(text).split('\n');
        const out = [];
        let tableBuf = [];

        const flushTable = () => {
            if (!tableBuf.length) return;
            const parsed = tableBuf.map(line => {
                const inner = line.trim().replace(/^\||\|$/g, '');
                return inner.split('|').map(s => s.trim());
            });
            const alignIdx = parsed.findIndex(row => row.length && row.every(c => /^[:\-\s]+$/.test(c) && c.length));
            let head = null, body = parsed;
            if (alignIdx > 0) {
                head = parsed[alignIdx - 1];
                body = [...parsed.slice(0, alignIdx - 1), ...parsed.slice(alignIdx + 1)];
            } else if (alignIdx === 0) {
                body = parsed.slice(1);
            }
            let html = '<table class="jrnl-md-table">';
            if (head) html += `<thead><tr>${head.map(c => `<th>${_escape(c)}</th>`).join('')}</tr></thead>`;
            html += `<tbody>${body.map(r => `<tr>${r.map(c => `<td>${_escape(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
            html += '</table>';
            out.push(html);
            tableBuf = [];
        };

        for (const raw of lines) {
            const trimmed = raw.trim();
            const pipeCount = (trimmed.match(/\|/g) || []).length;
            if (pipeCount >= 2) { tableBuf.push(trimmed); continue; }
            flushTable();
            if (!trimmed) { out.push('<br>'); continue; }
            if (/^【[^】]+】/.test(trimmed)) {
                out.push(`<h4 class="jrnl-md-h">${_escape(trimmed)}</h4>`);
                continue;
            }
            out.push(`<p>${_escape(trimmed)}</p>`);
        }
        flushTable();
        return out.join('\n');
    }

    function _fmtDate(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}.${m}.${day}`;
    }

    function _shortChatId(chatId) {
        if (!chatId) return '';
        // 截短：取末尾 8 字（chatId 通常含時間戳，末尾差異最大）
        return chatId.length > 16 ? chatId.slice(-10) : chatId;
    }

    // 故事卡封面：inline url() 會被解到 document base（ST 的根），失效
    //   改走 CSS class（CSS 內 url 相對 css/ 檔解析，正確）。池有 N 個 .cover-0 ~ .cover-(N-1)
    const COVER_POOL_SIZE = 6;
    function _coverFor(key) {
        let h = 0; for (const c of (key || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
        return Math.abs(h) % COVER_POOL_SIZE;
    }

    // 故事的封面 URL：優先 VN bg_cache（依 bgCacheId 查），fallback 用 sprite 池索引
    //   _resolveCover() 同步給 fallback 索引，真正 URL 在 _renderList 結束後 async 補上
    async function _resolveBgUrl(bgCacheId) {
        if (!bgCacheId || !win.VN_Cache) return '';
        try {
            const rec = await win.VN_Cache.get('bg_cache', bgCacheId);
            return rec?.url || '';
        } catch (_) { return ''; }
    }
    // Fuzzy 配對：大總結用「名_姓氏」格式存，VN avatar_cache key 是 [Char|...] 的原樣名
    //   策略：完全相等 → 變體拼法（姓名連寫 / 中間點） → substring 包含
    //   配 _hydrateVnImages 一次 getAll、各 character 在記憶體內比對，避免重複查 DB
    function _matchAvatar(name, pool) {
        if (!name || !pool.length) return '';
        let hit = pool.find(e => e.key === name);
        if (hit) return hit.url || '';
        const parts = name.split('_').map(s => s.trim()).filter(s => s && s !== '無');
        if (!parts.length) return '';
        const [given, family] = parts;
        const variants = [];
        if (family) {
            variants.push(family + given, family + '·' + given, given + family, given + '·' + family);
        }
        variants.push(given);
        for (const v of variants) {
            hit = pool.find(e => e.key === v);
            if (hit) return hit.url || '';
        }
        // substring fallback
        if (family) {
            hit = pool.find(e => (e.key || '').includes(given) && (e.key || '').includes(family));
            if (hit) return hit.url || '';
        }
        hit = pool.find(e => (e.key || '').includes(given));
        return hit?.url || '';
    }

    function _renderCard(story, idx, isActive) {
        const coverIdx = _coverFor(story.cardName + story.chatId);
        const title = story.storyTitle || story.cardName || '未命名故事線';
        const subtitle = story.storyTitle && story.cardName !== story.storyTitle ? story.cardName : '';
        const firstBrief = story.briefs[0]?.brief || '';
        const chapters = story.briefs.length;
        const chars = story.characters.length;
        const date = _fmtDate(story.briefs[0]?.ts);
        return `
            <div class="jrnl-card ${isActive ? 'active' : ''}" data-key="${_escape(story.cardName)}|||${_escape(story.chatId)}">
                <span class="jrnl-card-num">${idx + 1}</span>
                <div class="jrnl-card-img jrnl-cover-${coverIdx}" data-bg-key="${_escape(story.bgCacheId || '')}"></div>
                <div class="jrnl-card-body">
                    <div class="jrnl-card-head">
                        <span class="jrnl-card-title">${_escape(title)}</span>
                        <span class="jrnl-card-badge">進行中</span>
                    </div>
                    ${subtitle ? `<div class="jrnl-card-sub">${_escape(subtitle)}</div>` : ''}
                    <div class="jrnl-card-brief">${_escape(firstBrief)}</div>
                    <div class="jrnl-card-meta">
                        <span>第 ${chapters} 章</span>
                        <span>${chars} 名角色</span>
                        <span>${date}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function _renderDetail(story) {
        if (!story) {
            return `
                <div class="jrnl-empty">
                    <div class="jrnl-empty-icon">📖</div>
                    <div class="jrnl-empty-txt">
                        左邊還沒有故事線。<br>
                        去酒館生成大總結後，這裡會自動同步。
                    </div>
                </div>
            `;
        }
        const coverIdx = _coverFor(story.cardName + story.chatId);
        const title = story.storyTitle || story.cardName || '未命名故事線';
        const subtitle = story.cardName && story.cardName !== title ? story.cardName : '';
        const latestTs = story.briefs[0]?.ts || 0;

        const timelineHtml = story.briefs.map((b) => `
            <li class="jrnl-tl-item">
                <span class="jrnl-tl-num">${b.count || ''}</span>
                <div class="jrnl-tl-body">
                    <div class="jrnl-tl-head">
                        第 ${b.count || '?'} 章
                        <time>${_fmtDate(b.ts)}</time>
                    </div>
                    <div class="jrnl-tl-brief">${_escape(b.brief)}</div>
                </div>
            </li>
        `).join('');

        const charsHtml = story.characters.map((c, i) => {
            const parsed = _parseCharRow(c.row);
            const name = c.name || parsed.name;          // 原始「名_姓」：配頭像 / 查詳情用
            const role = parsed.role;
            const trait = (parsed.person || parsed.feature || '').slice(0, 30);
            const tag = parsed.status || parsed.relate || '';
            return `
                <div class="jrnl-char-card" data-char-idx="${i}" title="${_escape(parsed.row || c.row || '')}">
                    <div class="jrnl-char-img" data-avatar-key="${_escape(name)}"><span class="jrnl-char-img-fallback">✿</span></div>
                    <div class="jrnl-char-name">${_escape(_displayName(name))}</div>
                    ${role ? `<div class="jrnl-char-role">${_escape(role)}</div>` : ''}
                    ${trait ? `<div class="jrnl-char-trait">${_escape(trait)}</div>` : ''}
                    ${tag ? `<div class="jrnl-char-tag">${_escape(tag.slice(0, 12))}</div>` : ''}
                </div>
            `;
        }).join('');

        return `
            <button class="jrnl-back-mobile" id="jrnl-back-mobile">‹ 故事列表</button>
            <div class="jrnl-d-head">
                <div class="jrnl-d-img jrnl-cover-${coverIdx}" data-bg-key="${_escape(story.bgCacheId || '')}"></div>
                <div class="jrnl-d-info">
                    <h2 class="jrnl-d-title">${_escape(title)}</h2>
                    ${subtitle ? `<div class="jrnl-d-sub">${_escape(subtitle)}</div>` : ''}
                    <div class="jrnl-d-tags">
                        <span class="jrnl-d-tag-chat">Chat ID：${_escape(_shortChatId(story.chatId))}</span>
                        <span class="jrnl-d-tag-status">進行中</span>
                        <span class="jrnl-d-tag-date">最近更新：${_fmtDate(latestTs)}</span>
                    </div>
                </div>
            </div>

            <div class="jrnl-d-foot">
                <button class="jrnl-view-full">📖 查看完整總結內容
                    <span class="jrnl-view-full-sub">回顧更多細節，重溫完整故事</span>
                </button>
                <button class="jrnl-view-full jrnl-story-tools">🛠️ 故事管理
                    <span class="jrnl-view-full-sub">生成大總結 / 隱藏對話（作用於目前開啟的對話）</span>
                </button>
            </div>

            <div class="jrnl-d-section">
                <div class="jrnl-d-section-head">
                    <h3>劇情時間軸</h3>
                    <span class="jrnl-d-count">共 ${story.briefs.length} 章</span>
                </div>
                <ol class="jrnl-timeline">${timelineHtml}</ol>
            </div>

            <div class="jrnl-d-section">
                <div class="jrnl-d-section-head">
                    <h3>出場角色</h3>
                    <span class="jrnl-d-count">共 ${story.characters.length} 名</span>
                </div>
                ${charsHtml ? `<div class="jrnl-chars-grid">${charsHtml}</div>` : '<div class="jrnl-empty-txt" style="text-align:center; padding:20px;">尚無角色紀錄</div>'}
            </div>
        `;
    }

    async function launch(container) {
        if (!container) return;
        const osDb = win.OS_DB;
        if (!osDb || !osDb.getLobbySummaryForPrompt) {
            container.innerHTML = `<div style="padding:40px; text-align:center; color:#9a8678;">⚠️ OS_DB 未載入</div>`;
            return;
        }

        let avatarPool = []; // 頭像快取池：_hydrateVnImages 填，角色詳情 modal 共用

        // 拉所有故事線
        let stories = [];
        try { stories = await osDb.getLobbySummaryForPrompt(5); }
        catch (e) { console.warn('[OS_JOURNAL] 讀 lobby_summary_index 失敗:', e); }

        container.innerHTML = `
            <div class="jrnl-root">
                <div class="jrnl-deco jrnl-deco-tr"></div>
                <div class="jrnl-note-bl" aria-hidden="true">
                    <svg class="jrnl-note-svg" viewBox="0 0 280 110" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <filter id="jrnlNoteShadow" x="-10%" y="-10%" width="120%" height="130%">
                                <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#9c8266" flood-opacity="0.18"/>
                            </filter>
                        </defs>
                        <!-- 後一張紙條（略旋轉） -->
                        <g transform="rotate(2 140 55)">
                            <rect x="20" y="18" width="246" height="74" rx="1.5"
                                  fill="#fbf3e4" stroke="#e0cfb4" stroke-width="0.5" opacity="0.7"/>
                        </g>
                        <!-- 前一張紙條 -->
                        <rect x="14" y="12" width="252" height="80" rx="1.5"
                              fill="#fffaf0" stroke="#e8d8c0" stroke-width="0.6"
                              filter="url(#jrnlNoteShadow)"/>
                        <!-- 紙質橫線 -->
                        <g stroke="#f0e6d2" stroke-width="0.5">
                            <line x1="60" y1="40" x2="220" y2="40"/>
                            <line x1="60" y1="62" x2="220" y2="62"/>
                        </g>
                        <!-- 金色迴紋針 -->
                        <g stroke="#c8a86b" stroke-width="2.2" fill="none"
                           stroke-linecap="round" stroke-linejoin="round">
                            <path d="M 30 3 L 30 58 Q 30 70 22 70 Q 14 70 14 58 L 14 20"/>
                            <path d="M 22 7 L 22 52 Q 22 62 28 62 Q 34 62 34 52 L 34 14"/>
                        </g>
                        <!-- 文字 -->
                        <text x="60" y="38" font-family="'Songti TC', 'Microsoft JhengHei', serif"
                              font-size="12" fill="#8a6856" letter-spacing="2">打開回憶的書頁，</text>
                        <text x="60" y="60" font-family="'Songti TC', 'Microsoft JhengHei', serif"
                              font-size="12" fill="#8a6856" letter-spacing="2">我們會在故事裡再次相遇。</text>
                        <!-- 手繪愛心 -->
                        <path d="M 230 30 c -3.5 -5 -11 -2 -11 3.5 c 0 5.5 11 12 11 12 c 0 0 11 -6.5 11 -12 c 0 -5.5 -7.5 -8.5 -11 -3.5 z"
                              fill="none" stroke="#d4a3b3" stroke-width="1.2" stroke-linecap="round"/>
                        <!-- 簽名 -->
                        <text x="248" y="84" font-family="'Playfair Display', cursive"
                              font-size="11" font-style="italic" fill="#a89078" text-anchor="end">— Y.Y.</text>
                    </svg>
                    <div class="jrnl-note-flower"></div>
                </div>
                <div class="jrnl-deco jrnl-deco-br"></div>
                <div class="jrnl-deco jrnl-deco-petal1"></div>
                <div class="jrnl-deco jrnl-deco-petal2"></div>

                <button class="jrnl-close" id="jrnl-close" title="關閉">✕</button>

                <aside class="jrnl-left">
                    <div class="jrnl-brand">
                        <h1>瀅瀅的<span>故事日誌</span></h1>
                        <div class="jrnl-brand-sub">Story Journal</div>
                        <div class="jrnl-brand-tagline">每一段故事，都是心跳的回響。</div>
                    </div>
                    <input class="jrnl-search" id="jrnl-search" type="text" placeholder="搜尋故事線 / 角色…">
                    <div class="jrnl-toolbar">
                        <select class="jrnl-sort" id="jrnl-sort">
                            <option value="newest">最新更新</option>
                            <option value="oldest">最早建立</option>
                            <option value="chapters">章節數最多</option>
                        </select>
                    </div>
                    <div class="jrnl-list" id="jrnl-list"></div>
                </aside>

                <main class="jrnl-right" id="jrnl-right"></main>
            </div>
        `;

        const listEl   = container.querySelector('#jrnl-list');
        const rightEl  = container.querySelector('#jrnl-right');
        const searchEl = container.querySelector('#jrnl-search');
        const sortEl   = container.querySelector('#jrnl-sort');
        const closeEl  = container.querySelector('#jrnl-close');

        // 狀態
        let allStories = stories;
        let activeKey  = stories[0] ? `${stories[0].cardName}|||${stories[0].chatId}` : null;

        function _applyFilters() {
            const q = (searchEl.value || '').trim().toLowerCase();
            let arr = allStories.slice();
            if (q) {
                arr = arr.filter(s =>
                    (s.cardName || '').toLowerCase().includes(q) ||
                    (s.storyTitle || '').toLowerCase().includes(q) ||
                    (s.characters || []).some(c => (c.name || '').toLowerCase().includes(q))
                );
            }
            const sortMode = sortEl.value;
            if (sortMode === 'oldest') {
                arr.sort((a, b) => (a.briefs[0]?.ts || 0) - (b.briefs[0]?.ts || 0));
            } else if (sortMode === 'chapters') {
                arr.sort((a, b) => b.briefs.length - a.briefs.length);
            }
            // newest 已是 default 排序
            return arr;
        }

        function _renderList() {
            const arr = _applyFilters();
            if (!arr.length) {
                listEl.innerHTML = `<div class="jrnl-empty-txt" style="padding:30px; text-align:center;">沒有符合的故事線</div>`;
                rightEl.innerHTML = _renderDetail(null);
                return;
            }
            // 若 active 已過濾掉，自動選第一個
            if (!arr.find(s => `${s.cardName}|||${s.chatId}` === activeKey)) {
                activeKey = `${arr[0].cardName}|||${arr[0].chatId}`;
            }
            listEl.innerHTML = arr.map((s, i) =>
                _renderCard(s, i, `${s.cardName}|||${s.chatId}` === activeKey)
            ).join('');
            const active = arr.find(s => `${s.cardName}|||${s.chatId}` === activeKey);
            rightEl.innerHTML = _renderDetail(active);
            _wireDetail(active);
            _hydrateVnImages();
        }

        // VN 圖片補位：掃 data-bg-key / data-avatar-key，async 查 VN_Cache 覆蓋 background-image
        //   有命中 → 換掉 sprite fallback；沒命中 → 保留 sprite cover / ✿ icon
        async function _hydrateVnImages() {
            // BG：逐個查
            container.querySelectorAll('[data-bg-key]').forEach(async (el) => {
                const key = el.dataset.bgKey;
                if (!key) return;
                const url = await _resolveBgUrl(key);
                if (url) {
                    el.style.backgroundImage = `url("${url}")`;
                    el.classList.forEach(c => { if (c.startsWith('jrnl-cover-')) el.classList.remove(c); });
                }
            });
            // Avatar：一次性 getAll、然後在記憶體做 fuzzy 比對（存到 launch 層 avatarPool 供 modal 共用）
            try { avatarPool = (await win.VN_Cache?.getAll?.('avatar_cache')) || []; } catch (_) {}
            container.querySelectorAll('[data-avatar-key]').forEach((el) => {
                const name = el.dataset.avatarKey;
                if (!name) return;
                const url = _matchAvatar(name, avatarPool);
                if (url) {
                    el.style.backgroundImage = `url("${url}")`;
                    el.style.backgroundSize = 'cover';
                    el.style.backgroundPosition = 'center';
                    const fb = el.querySelector('.jrnl-char-img-fallback');
                    if (fb) fb.style.display = 'none';
                }
            });
        }

        function _wireDetail(active) {
            // 手機返回鍵：切回故事列表
            const backBtn = rightEl.querySelector('#jrnl-back-mobile');
            if (backBtn) backBtn.onclick = () => {
                container.querySelector('.jrnl-root')?.classList.remove('show-detail-mobile');
            };

            // 🛠️ 故事管理：在日誌同一容器內就地展開（大總結 + 隱藏對話）
            const toolsBtn = rightEl.querySelector('.jrnl-story-tools');
            if (toolsBtn) toolsBtn.onclick = () => {
                const T = win.OS_STORY_TOOLS || window.OS_STORY_TOOLS;
                if (T && T.openPanel) T.openPanel(container);
                else alert('故事管理工具尚未載入');
            };

            const viewBtn = rightEl.querySelector('.jrnl-view-full');
            if (viewBtn && active) {
                viewBtn.onclick = async () => {
                    try {
                        const helper = win.TavernHelper;
                        if (!helper) return _openFullModal('（無 TavernHelper，無法讀世界書）', active);
                        const all = await osDb.getAllLobbySummaryIndex();
                        const recs = all.filter(r =>
                            (r.cardName || '') === active.cardName &&
                            (r.chatId || '')   === active.chatId
                        ).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                        const latest = recs[0];
                        if (!latest || !latest.lorebookBook) return _openFullModal('找不到對應的世界書條目', active);
                        const entries = await helper.getLorebookEntries(latest.lorebookBook);
                        const target = entries.find(e => (e.keys || []).includes(latest.lorebookKey));
                        if (!target) return _openFullModal('世界書內找不到該條目（可能已被刪除）', active);
                        _openFullModal(target.content || '(空)', active);
                    } catch (e) {
                        _openFullModal('讀取失敗：' + (e.message || e), active);
                    }
                };
            }

            // 角色卡片點擊 → 跳 modal 看完整內容（卡片塞不下全部）
            rightEl.querySelectorAll('.jrnl-char-card').forEach(card => {
                card.onclick = () => {
                    const idx = parseInt(card.dataset.charIdx, 10);
                    const c = (active && active.characters && !isNaN(idx)) ? active.characters[idx] : null;
                    if (c) _openCharModal(c);
                };
            });
        }

        // 角色詳情 modal：沿用 .jrnl-modal 外殼，內容換成欄位列表 + 頭像
        function _openCharModal(c) {
            if (!c) return;
            const old = container.querySelector('.jrnl-modal');
            if (old) old.remove();

            const parsed = _parseCharRow(c.row);
            const rawName = c.name || parsed.name;       // 配頭像用原始「名_姓」
            const disp = _displayName(rawName);          // 顯示用「姓名」
            const fields = [
                ['身份', parsed.role],
                ['性格概述', parsed.person],
                ['狀態 / 位置', parsed.status],
                ['特徵', parsed.feature],
                ['與主角關係', parsed.relate],
                ['備註', parsed.note],
            ].filter(([, v]) => v && String(v).trim());
            const fieldsHtml = fields.length
                ? fields.map(([k, v]) =>
                    `<div class="jrnl-cm-row"><span class="jrnl-cm-k">${_escape(k)}</span><span class="jrnl-cm-v">${_escape(v)}</span></div>`
                  ).join('')
                : '<div class="jrnl-cm-empty">這個角色還沒有更多資料</div>';

            // 模板 B：左大圖 + 右資料分欄（淺色，配合日誌風格）
            const modal = document.createElement('div');
            modal.className = 'jrnl-modal';
            modal.innerHTML = `
                <div class="jrnl-modal-card jrnl-modal-char">
                    <button class="jrnl-cm-close" title="關閉">✕</button>
                    <div class="jrnl-cm-photo" data-avatar-key="${_escape(rawName)}"><span class="jrnl-char-img-fallback">✿</span></div>
                    <div class="jrnl-cm-side">
                        <div class="jrnl-cm-name">${_escape(disp)}</div>
                        <div class="jrnl-cm-sub">👤 ${_escape(rawName)}</div>
                        <div class="jrnl-cm-fields">${fieldsHtml}</div>
                    </div>
                </div>
            `;
            container.appendChild(modal);

            // 補頭像（用已抓好的 avatarPool 做 fuzzy 配對）
            const avEl = modal.querySelector('[data-avatar-key]');
            const url = _matchAvatar(rawName, avatarPool);
            if (url && avEl) {
                avEl.style.backgroundImage = `url("${url}")`;
                avEl.style.backgroundSize = 'cover';
                avEl.style.backgroundPosition = 'center';
                const fb = avEl.querySelector('.jrnl-char-img-fallback');
                if (fb) fb.style.display = 'none';
            }

            const close = () => modal.remove();
            modal.querySelector('.jrnl-cm-close').onclick = close;
            modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
            const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
            document.addEventListener('keydown', onKey);
        }

        // 自訂 modal：在 container 內疊一層、不用瀏覽器 alert
        function _openFullModal(content, active) {
            // 已存在就先收掉
            const old = container.querySelector('.jrnl-modal');
            if (old) old.remove();

            const title = active?.storyTitle || active?.cardName || '完整總結';
            const modal = document.createElement('div');
            modal.className = 'jrnl-modal';
            modal.innerHTML = `
                <div class="jrnl-modal-card">
                    <div class="jrnl-modal-head">
                        <span class="jrnl-modal-title">${_escape(title)}</span>
                        <button class="jrnl-modal-close" title="關閉">✕</button>
                    </div>
                    <div class="jrnl-modal-body"></div>
                </div>
            `;
            container.appendChild(modal);
            // 把 markdown table + 【標題】轉成 HTML（內容 escape 過、不會被當 HTML 注入）
            modal.querySelector('.jrnl-modal-body').innerHTML = _renderMd(content);
            const close = () => modal.remove();
            modal.querySelector('.jrnl-modal-close').onclick = close;
            modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
            // ESC 關閉
            const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
            document.addEventListener('keydown', onKey);
        }

        // 卡片點擊：切換 active；手機自動切到詳情頁
        listEl.addEventListener('click', (e) => {
            const card = e.target.closest('.jrnl-card');
            if (!card) return;
            activeKey = card.dataset.key;
            _renderList();
            if (window.matchMedia('(max-width: 720px)').matches) {
                container.querySelector('.jrnl-root')?.classList.add('show-detail-mobile');
            }
        });

        // 搜尋與排序
        searchEl.addEventListener('input', _renderList);
        sortEl.addEventListener('change', _renderList);

        // 關閉 → 回大廳（走 PhoneSystem.goHome，跟 spend 面板同套）
        //   不能用 AureliaControlCenter.hide()，那會關整支手機 + 下次打開 state 還在 → 回不去大廳
        closeEl.addEventListener('click', () => {
            if (win.PhoneSystem?.goHome) win.PhoneSystem.goHome();
        });

        _renderList();
    }

    win.OS_JOURNAL = { launch };
    console.log('✅ Story Journal (OS_JOURNAL) 模組就緒');
})();
