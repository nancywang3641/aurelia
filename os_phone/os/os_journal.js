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

    // 角色表欄位 = 動態對位：用大總結存下來的「表頭(charHeader)」貼標籤，不硬寫欄序——
    //   模板可變、新版角色表有 髮色/髮型/眼色，硬寫欄序會從第 4 欄起全錯位(身份對、之後全偏)。
    //   沒存到表頭的舊資料 → 按欄數套預設(≥8欄=新版9欄／否則舊版7欄)。
    const _CH_DEF_9 = ['姓名', '身份', '性格', '狀態 / 位置', '與主角關係', '髮色', '髮型', '眼色', '伏筆 / 備註'];
    const _CH_DEF_7 = ['姓名', '身份', '性格', '狀態 / 位置', '特徵', '與主角關係', '備註'];
    function _cellsOf(row) {
        const cols = String(row || '').split('|').map(s => s.trim());
        // markdown 表格行常有前導/結尾 |，切完首尾會多出空欄 → 去掉，否則欄位整體位移一格
        if (cols.length && cols[0] === '') cols.shift();
        if (cols.length && cols[cols.length - 1] === '') cols.pop();
        return cols;
    }
    function _labelsOf(charHeader, cellCount) {
        if (charHeader) {
            const hs = _cellsOf(charHeader);
            if (hs.length >= 2) return hs;
        }
        return cellCount >= 8 ? _CH_DEF_9 : _CH_DEF_7;
    }
    // 回傳 [{label, value}]（含 name 在 index 0）；label 來自表頭，對不到就用「欄N」
    function _charFields(row, charHeader) {
        const cells = _cellsOf(row);
        const labels = _labelsOf(charHeader, cells.length);
        return cells.map((v, i) => ({ label: String(labels[i] || `欄${i + 1}`).trim(), value: v }));
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
            if (/^Last[:：]\s*\d+$/i.test(trimmed)) continue;   // 內部指標行(Last: 61)別端給讀者
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

    // ── ☕ 書咖常客 pin：每張卡指定「哪一輪」的角色上書咖舞台（lobby_stage 讀同一把 key）──
    //   map = { 卡名: chatId }；沒 pin 的卡預設用最新一輪
    const NPC_PICK_KEY = 'lstage_npc_pick_v1';
    function _npcPickMap() {
        try { const o = JSON.parse(localStorage.getItem(NPC_PICK_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
    }
    // 回 true／false：存不下來 lsSet 自己跳提示，按鈕就不翻成「已設好」
    function _saveNpcPickMap(m) {
        return win.AUI.lsSet(NPC_PICK_KEY, JSON.stringify(m || {}), '書咖常客的來源');
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
    //   🚨 pool 是「不含 url 的中繼資料」(getAllMeta)：整庫頭像 dataURL 一次進記憶體會 OOM
    //      （畫廊那次的同款坑）。這裡只比對 key，回傳命中的 key，真正的圖用 getRaw 一張張取。
    function _matchAvatarKey(name, pool, world) {
        if (!name || !pool || !pool.length) return '';
        const VC = win.VN_Cache;
        // 只在「這個故事自己的世界(chatId)」裡找頭像，避免同名 MC 跨卡誤抓（宮廷劇撈到校園卡頭像那種）。
        // world 有傳才過濾（含空字串=未分類）；沒傳則維持舊行為。配對一律用「去掉世界前綴的原始名」。
        // 兩邊世界格式不同：日誌的 story.chatId 是正規化過的（basename、去 .jsonl、空白→底線），
        // 但頭像存的 worldOf 是原始 ctx.chatId（含空白）。比對前都正規化成同一格式，否則永遠不相等→頭像全消失。
        const _normW = w => !w ? '' : String(w).split(/[\\/]/).pop().replace(/\.jsonl?$/i, '').trim().replace(/\s+/g, '_');
        let p = pool;
        if (VC && VC.worldOf && world !== undefined) {
            const wn = _normW(world);
            p = pool.filter(e => _normW(VC.worldOf(e)) === wn);
        }
        if (!p.length) return '';
        const keyOf = e => ((VC && VC.bareKeyOf) ? VC.bareKeyOf(e) : e.key) || '';
        let hit = p.find(e => keyOf(e) === name);
        if (hit) return hit.key || '';
        const parts = name.split('_').map(s => s.trim()).filter(s => s && s !== '無');
        if (!parts.length) return '';
        const [given, family] = parts;
        const variants = [];
        if (family) {
            variants.push(family + given, family + '·' + given, given + family, given + '·' + family);
        }
        variants.push(given);
        for (const v of variants) {
            hit = p.find(e => keyOf(e) === v);
            if (hit) return hit.key || '';
        }
        // substring fallback（已限定在同世界內，不會跨卡）
        if (family) {
            hit = p.find(e => keyOf(e).includes(given) && keyOf(e).includes(family));
            if (hit) return hit.key || '';
        }
        hit = p.find(e => keyOf(e).includes(given));
        return hit?.key || '';
    }
    // 拿單張頭像的圖：只在真的要顯示時才碰那筆資料
    async function _avatarUrlByKey(win, key) {
        if (!key) return '';
        try { const rec = await win.VN_Cache?.getRaw?.('avatar_cache', key); return win.VN_Cache.headOf ? win.VN_Cache.headOf(rec) : ((rec && rec.url) || ''); }
        catch (e) { return ''; }
    }

    // 一共幾章：看每筆大總結自己記的第幾章（最新那筆最大）。
    //   briefs 只帶最近 5 筆，以前拿它的長度當章數，超過 5 章一律顯示「第 5 章」；舊資料沒記章數才退回數筆數
    function _chapterCount(story) {
        const bs = (story && story.briefs) || [];
        return bs.reduce((n, b) => Math.max(n, Number(b && b.count) || 0), bs.length);
    }

    function _renderCard(story, idx, isActive) {
        const coverIdx = _coverFor(story.cardName + story.chatId);
        const title = story.storyTitle || story.cardName || '未命名故事線';
        const subtitle = story.storyTitle && story.cardName !== story.storyTitle ? story.cardName : '';
        const firstBrief = story.briefs[0]?.brief || '';
        const chapters = _chapterCount(story);
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
                    <div class="jrnl-empty-icon"><i class="fa-solid fa-book-open"></i></div>
                    <div class="jrnl-empty-txt">
                        左邊還沒有故事線。<br>
                        去酒館生成大總結後，這裡會自動同步。
                    </div>
                </div>
            `;
        }
        const coverIdx = _coverFor(story.cardName + story.chatId);
        const pinned = _npcPickMap()[story.cardName] === story.chatId;
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
            const fields = _charFields(c.row, story.charHeader);
            const name = c.name || (fields[0] && fields[0].value) || '';    // 原始「名_姓」：配頭像 / 查詳情用
            const role = (fields[1] && fields[1].value) || '';              // 身份
            const trait = ((fields[2] && fields[2].value) || '').slice(0, 30);   // 性格
            const tag = (fields[3] && fields[3].value) || '';               // 狀態 / 位置
            return `
                <div class="jrnl-char-card" data-char-idx="${i}" title="${_escape(c.row || '')}">
                    <div class="jrnl-char-img" data-avatar-key="${_escape(name)}" data-world="${_escape(story.chatId || '')}"><span class="jrnl-char-img-fallback">✿</span></div>
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
                <button class="jrnl-view-full"><i class="fa-solid fa-book-open"></i> 查看完整總結內容
                    <span class="jrnl-view-full-sub">回顧更多細節，重溫完整故事</span>
                </button>
                <div class="jrnl-foot-acts">
                    <button class="jrnl-act-btn jrnl-pin-npc ${pinned ? 'active' : ''}"
                            data-on-label="書咖常客來源（點擊取消）" data-off-label="設為書咖常客"
                            title="書咖舞台的客人會從這一輪的角色裡挑（同一張卡只認一輪，沒指定就用最新的）">
                        ${pinned ? '書咖常客來源（點擊取消）' : '設為書咖常客'}
                    </button>
                    <button class="jrnl-act-btn jrnl-edit-full"><i class="fa-solid fa-pen"></i> 編輯總結</button>
                    <button class="jrnl-act-btn jrnl-act-danger jrnl-wipe-story"><i class="fa-solid fa-trash-can"></i> 清空這段劇情</button>
                </div>
            </div>

            <div class="jrnl-volume" aria-hidden="true">
                <div class="jrnl-volume-main">共 ${_chapterCount(story)} 章</div>
                <div class="jrnl-volume-sub">${story.characters.length} 名角色 · ${_fmtDate(latestTs)}</div>
            </div>

            <div class="jrnl-d-section jrnl-sec-story">
                <div class="jrnl-d-section-head">
                    <h3>劇情時間軸</h3>
                    <span class="jrnl-d-count">共 ${_chapterCount(story)} 章</span>
                </div>
                <ol class="jrnl-timeline">${timelineHtml}</ol>
            </div>

            <div class="jrnl-d-section jrnl-sec-chars">
                <div class="jrnl-d-section-head">
                    <h3>出場角色</h3>
                    <span class="jrnl-d-count">共 ${story.characters.length} 名</span>
                </div>
                ${charsHtml ? `<div class="jrnl-chars-grid">${charsHtml}</div>` : '<div class="jrnl-empty-txt" style="text-align:center; padding:20px;">尚無角色紀錄</div>'}
            </div>

            <div class="jrnl-d-section jrnl-sec-manage">
                <div class="jrnl-d-section-head">
                    <h3>故事管理</h3>
                </div>
                <div class="jrnl-mg-list">
                    <div class="jrnl-mg-row">
                        <div class="jrnl-mg-txt">
                            <div class="jrnl-mg-k"><i class="fa-solid fa-file-lines"></i>完整總結</div>
                            <div class="jrnl-mg-d">這段故事目前記下的全部內容</div>
                        </div>
                        <div class="jrnl-mg-acts">
                            <button class="jrnl-ornate jrnl-sum-view" type="button">查看</button>
                            <button class="jrnl-ornate jrnl-ornate-primary jrnl-sum-edit" type="button">編輯</button>
                        </div>
                    </div>
                    <div class="jrnl-mg-row">
                        <div class="jrnl-mg-txt">
                            <div class="jrnl-mg-k"><i class="fa-solid fa-mug-saucer"></i>書咖常客</div>
                            <div class="jrnl-mg-d">書咖舞台的客人會從這一輪的角色裡挑</div>
                        </div>
                        <div class="jrnl-mg-acts">
                            <button class="jrnl-ornate jrnl-pin-npc ${pinned ? 'active' : ''}" type="button"
                                    data-on-label="取消指定" data-off-label="設為常客">${pinned ? '取消指定' : '設為常客'}</button>
                        </div>
                    </div>
                    <div class="jrnl-mg-row">
                        <div class="jrnl-mg-txt">
                            <div class="jrnl-mg-k"><i class="fa-solid fa-screwdriver-wrench"></i>總結與隱藏工具</div>
                            <div class="jrnl-mg-d">生成／重壓大總結、把手機聊天室寫進來、隱藏樓層，作用於目前開啟的對話</div>
                        </div>
                        <div class="jrnl-mg-acts">
                            <button class="jrnl-ornate jrnl-open-tools" type="button">開啟</button>
                        </div>
                    </div>
                    <div class="jrnl-mg-row jrnl-mg-row-danger">
                        <div class="jrnl-mg-txt">
                            <div class="jrnl-mg-k"><i class="fa-solid fa-trash-can"></i>清空這段劇情</div>
                            <div class="jrnl-mg-d">刪掉這段故事記下的內容，之後無法復原</div>
                        </div>
                        <div class="jrnl-mg-acts">
                            <button class="jrnl-ornate jrnl-ornate-danger jrnl-wipe-story" type="button">清空</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 🔊 書類紙質音：音檔／開關／音量都掛在大廳那套 VoidUiSfx（設置關掉時這裡自然不響）
    function _sfx(kind) {
        try { (win.VoidUiSfx || window.VoidUiSfx)?.play?.(kind); } catch (e) { }
    }

    async function launch(container) {
        if (!container) return;
        const osDb = win.OS_DB;
        if (!osDb || !osDb.getLobbySummaryForPrompt) {
            container.innerHTML = `<div style="padding:40px; text-align:center; color:#9a8678;"><i class="fa-solid fa-triangle-exclamation"></i> OS_DB 未載入</div>`;
            return;
        }

        let avatarPool = []; // 頭像快取池：_hydrateVnImages 填，角色詳情 modal 共用

        // ── 🧱 日誌窗口切塊進出場：引擎在 core/aurelia_tilefx.js（大廳開的全螢幕窗口共用同一套）──
        //    日誌自己演、control_center 開日誌時跳過它那一套，因為日誌多了開書／闔書：
        //    進場時書晚 0.3 秒才翻開；出場跟闔書同時跑，兩邊都好了才回大廳。
        //    🚨 演的時候窗口是被剪掉的：引擎自己有保險計時器；回大廳之後一定 _tileClear，下一個開在這格的 app 才不會被剪。
        const TF = win.AURELIA_TILEFX || window.AURELIA_TILEFX || null;
        const TILE = { on: false, host: null };
        const BK_LATE = 300;   // 切塊進場時，書晚 0.3 秒才翻開（她在小樣裡試了 1 秒、0.5 秒、0.3 秒，定 0.3）
        const _tileClear = () => { if (TF && TILE.host) TF.clear(TILE.host); };
        // 一開始就先把窗口整格藏起來：等資料、畫好之前那一下不要先露一整片空窗口（3 秒內沒開始演，引擎會自己放出來）
        try {
            if (TF && TF.canRun()) {
                TILE.host = container.closest('#aurelia-panel-container') || container;
                TF.hide(TILE.host);
            }
        } catch (e) { }

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

                <!-- 🕮 桌面書裝(jrnl-desk 時啟用;窄屏全部 display:none,原版型不動) -->
                <div class="jrnl-topbar-desk">
                    <span class="jrnl-topbar-brand">瀅瀅的故事日誌</span>
                    <span class="jrnl-topbar-en">STORY JOURNAL</span>
                </div>
                <div class="jrnl-stage">
                    <div class="jrnl-book-art"></div>
                    <nav class="jrnl-tabs" aria-label="日誌頁籤">
                        <button class="jrnl-tab active" type="button" data-tab="story"><i class="fa-solid fa-book-open"></i><span>故事回顧</span></button>
                        <button class="jrnl-tab" type="button" data-tab="chars"><i class="fa-solid fa-user"></i><span>人物圖鑑</span></button>
                        <button class="jrnl-tab" type="button" data-tab="manage"><i class="fa-solid fa-screwdriver-wrench"></i><span>故事管理</span></button>
                    </nav>
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
            </div>
        `;

        // 🕮 書裝開關:看「容器」寬(手機殼/窄窗維持原版型),同入場精靈的判定思路
        const rootEl = container.querySelector('.jrnl-root');
        const launchedAt = Date.now();
        try {
            const ro = new ResizeObserver(() => {
                if (!rootEl.isConnected) return;
                rootEl.classList.toggle('jrnl-desk', rootEl.clientWidth >= 960);
                // 一打開時容器還沒量好寬度的話，書裝晚一點才掛上：剛打開那一下才補演開書，之後拉寬視窗不演
                if (!BK.inited && Date.now() - launchedAt < 1500) _bkInit();
            });
            ro.observe(rootEl);
            rootEl.classList.toggle('jrnl-desk', rootEl.clientWidth >= 960);
        } catch (e) { /* 沒 ResizeObserver 就永遠原版型 */ }

        const leftEl   = container.querySelector('.jrnl-left');
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
                arr.sort((a, b) => _chapterCount(b) - _chapterCount(a));
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
            // Avatar：只抓「中繼資料」做 fuzzy 比對(不含 dataURL)，命中的才逐張取圖。
            //   🚨 這裡以前是 getAll('avatar_cache')＝整庫頭像 base64 一次進記憶體，
            //      而 _renderList 綁在搜尋框的每一次按鍵上 → 每打一個字重讀一次全庫＝OOM。
            //   中繼資料只在第一次撈（很小、不含圖），之後重渲染直接重用。
            if (!avatarPool.length) {
                try { avatarPool = (await win.VN_Cache?.getAllMeta?.('avatar_cache')) || []; } catch (_) {}
            }
            for (const el of container.querySelectorAll('[data-avatar-key]')) {
                const name = el.dataset.avatarKey;
                if (!name) continue;
                const hitKey = _matchAvatarKey(name, avatarPool, el.dataset.world);
                if (!hitKey) continue;
                const url = await _avatarUrlByKey(win, hitKey);
                if (!url || !el.isConnected) continue;   // 圖還沒到就換頁了 → 別往舊節點寫
                el.style.backgroundImage = `url("${url}")`;
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
                const fb = el.querySelector('.jrnl-char-img-fallback');
                if (fb) fb.style.display = 'none';
            }
        }

        function _wireDetail(active) {
            // 手機返回鍵：切回故事列表
            const backBtn = rightEl.querySelector('#jrnl-back-mobile');
            if (backBtn) backBtn.onclick = () => {
                container.querySelector('.jrnl-root')?.classList.remove('show-detail-mobile');
            };

            // 查看：大總結已搬 OS_DB tavern_summary（不再讀世界書）；舊版未遷移的退回讀世界書
            //   桌面書裝的總結頁另有一組 ornate 鈕(.jrnl-sum-view/.jrnl-sum-edit),行為同款
            const _viewFull = async () => {
                try {
                    _sfx('page_turn');   // 翻到總結那頁
                    const rec = await _readStorySummary(active);
                    if (!rec || !rec.content) return _openFullModal('這段劇情還沒有大總結（或已清空）。', active);
                    _openSummaryFull(rec.content, active, rec, false);
                } catch (e) { _openFullModal('讀取失敗：' + (e.message || e), active); }
            };
            const _editFull = async () => {
                try {
                    _sfx('pen_write');   // 開編輯器＝落筆
                    const rec = (await _readStorySummary(active)) || { content: '' };
                    _openSummaryFull(rec.content || '', active, rec, true);
                } catch (e) { _openFullModal('讀取失敗：' + (e.message || e), active); }
            };
            if (active) {
                rightEl.querySelectorAll('.jrnl-view-full, .jrnl-sum-view').forEach(b => { b.onclick = _viewFull; });
                rightEl.querySelectorAll('.jrnl-edit-full, .jrnl-sum-edit').forEach(b => { b.onclick = _editFull; });
            }
            if (active) rightEl.querySelectorAll('.jrnl-wipe-story').forEach(b => {
                b.onclick = () => _openWipeConfirm(active);
            });

            // 🛠️ 總結與隱藏工具：獨立 overlay（作用於目前開啟的對話）
            rightEl.querySelectorAll('.jrnl-open-tools').forEach(b => {
                b.onclick = () => {
                    try { win.OS_STORY_TOOLS?.openPanel ? win.OS_STORY_TOOLS.openPanel(container) : AUI.alert('故事管理工具尚未載入'); } catch (e) { }
                };
            });

            // ☕ 書咖常客 pin：這張卡 → 這一輪；再點取消（回到預設「最新一輪」）
            //    手機版在頁尾、書裝版在「故事管理」頁，兩顆都在 DOM 裡 → 一起同步（各自的字面走 data-*-label）
            const _syncPinBtns = (on) => rightEl.querySelectorAll('.jrnl-pin-npc').forEach(b => {
                b.classList.toggle('active', on);
                b.textContent = on ? (b.dataset.onLabel || '') : (b.dataset.offLabel || '');
            });
            if (active) rightEl.querySelectorAll('.jrnl-pin-npc').forEach(btn => {
                btn.onclick = () => {
                    const m = _npcPickMap();
                    const on = m[active.cardName] === active.chatId;
                    if (on) delete m[active.cardName];
                    else m[active.cardName] = active.chatId;
                    if (!_saveNpcPickMap(m)) return;
                    _sfx('book_stamp');
                    _syncPinBtns(!on);
                };
            });

            // 角色卡片點擊 → 跳 modal 看完整內容（卡片塞不下全部）
            rightEl.querySelectorAll('.jrnl-char-card').forEach(card => {
                card.onclick = () => {
                    const idx = parseInt(card.dataset.charIdx, 10);
                    const c = (active && active.characters && !isNaN(idx)) ? active.characters[idx] : null;
                    if (c) _openCharModal(c, active);
                };
            });
        }

        // 書裝環境的彈窗跟著換皮(彈窗掛在 container、是 .jrnl-root 的兄弟,desk 狀態靠這裡手動同步)
        function _tagModalDesk(modal, kind) {
            try {
                if (container.querySelector('.jrnl-root')?.classList.contains('jrnl-desk')) {
                    modal.classList.add('jrnl-modal-desk');
                    if (kind) modal.classList.add('jrnl-modal-' + kind);
                }
            } catch (e) { }
        }

        // 角色詳情 modal：沿用 .jrnl-modal 外殼，內容換成欄位列表 + 頭像
        function _openCharModal(c, story) {
            if (!c) return;
            const world = (story && story.chatId) || '';
            const charHeader = (story && story.charHeader) || '';
            const old = container.querySelector('.jrnl-modal');
            if (old) old.remove();

            const allFields = _charFields(c.row, charHeader);   // 含 name 在 index 0；按表頭動態貼標籤
            const rawName = c.name || (allFields[0] && allFields[0].value) || '';   // 配頭像用原始「名_姓」
            const disp = _displayName(rawName);                  // 顯示用「姓名」
            const fields = allFields.slice(1)                    // 跳過姓名欄；其餘全列(身份/性格/狀態/與MC關係/髮色/髮型/眼色/伏筆…)
                .filter(f => f.value && String(f.value).trim())
                .map(f => [f.label, f.value]);
            const fieldsHtml = fields.length
                ? fields.map(([k, v]) =>
                    `<div class="jrnl-cm-row"><span class="jrnl-cm-k">${_escape(k)}</span><span class="jrnl-cm-v">${_escape(v)}</span></div>`
                  ).join('')
                : '<div class="jrnl-cm-empty">這個角色還沒有更多資料</div>';

            // 模板 B：左大圖 + 右資料分欄（淺色，配合日誌風格）
            const modal = document.createElement('div');
            modal.className = 'jrnl-modal';
            _tagModalDesk(modal, 'kchar');
            modal.innerHTML = `
                <div class="jrnl-modal-card jrnl-modal-char">
                    <button class="jrnl-cm-close" title="關閉">✕</button>
                    <div class="jrnl-cm-photo" data-avatar-key="${_escape(rawName)}" data-world="${_escape(world || '')}"><span class="jrnl-char-img-fallback">✿</span></div>
                    <div class="jrnl-cm-side">
                        <div class="jrnl-cm-name">${_escape(disp)}</div>
                        <div class="jrnl-cm-sub"><i class="fa-solid fa-user"></i> ${_escape(rawName)}</div>
                        <div class="jrnl-cm-fields">${fieldsHtml}</div>
                    </div>
                </div>
            `;
            container.appendChild(modal);

            // 補頭像（中繼資料配對 → 只取這一張的圖）
            const avEl = modal.querySelector('[data-avatar-key]');
            const hitKey = _matchAvatarKey(rawName, avatarPool, world);
            if (hitKey && avEl) {
                _avatarUrlByKey(win, hitKey).then(url => {
                    if (!url || !avEl.isConnected) return;
                    avEl.style.backgroundImage = `url("${url}")`;
                    avEl.style.backgroundSize = 'cover';
                    avEl.style.backgroundPosition = 'center';
                    const fb = avEl.querySelector('.jrnl-char-img-fallback');
                    if (fb) fb.style.display = 'none';
                });
            }

            const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };   // 按 ✕、點外面關也要拆鍵盤監聽，不然開一次多一個
            modal.querySelector('.jrnl-cm-close').onclick = close;
            modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
            const onKey = (e) => {
                if (!modal.isConnected) { document.removeEventListener('keydown', onKey); return; }   // 被下一個彈窗直接換掉的
                if (e.key === 'Escape') close();
            };
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
            _tagModalDesk(modal, 'kview');
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
            const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
            modal.querySelector('.jrnl-modal-close').onclick = close;
            modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
            // ESC 關閉
            const onKey = (e) => {
                if (!modal.isConnected) { document.removeEventListener('keydown', onKey); return; }
                if (e.key === 'Escape') close();
            };
            document.addEventListener('keydown', onKey);
        }

        // 讀某段故事的大總結全文：OS_DB tavern_summary 為主；舊版未遷移的退回世界書
        async function _readStorySummary(story) {
            if (!story) return null;
            try {
                if (osDb.getTavernSummary) {
                    const rec = await osDb.getTavernSummary(story.chatId);
                    if (rec && rec.content) return rec;
                }
            } catch (e) {}
            try {
                const helper = win.TavernHelper;
                if (!helper) return null;
                const all = await osDb.getAllLobbySummaryIndex();
                const recs = all.filter(r => (r.cardName || '') === story.cardName && (r.chatId || '') === story.chatId)
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                const latest = recs[0];
                if (!latest || !latest.lorebookBook) return null;
                const entries = await helper.getLorebookEntries(latest.lorebookBook);
                const target = entries.find(e => (e.keys || []).includes(latest.lorebookKey))
                    || entries.find(e => e.comment && e.comment.includes(`[大总结] - ${story.chatId}`));
                if (!target || !target.content) return null;
                return { content: target.content, summaryCount: latest.summaryCount || 0, _legacy: true };
            } catch (e) { return null; }
        }

        // 查看 / 編輯 大總結全文 modal（editMode=true 顯示 textarea + 儲存回 OS_DB）
        function _openSummaryFull(content, story, rec, editMode) {
            const old = container.querySelector('.jrnl-modal'); if (old) old.remove();
            const title = story?.storyTitle || story?.cardName || '完整總結';
            const modal = document.createElement('div');
            modal.className = 'jrnl-modal';
            _tagModalDesk(modal, editMode ? 'kedit' : 'kview');
            const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
            if (editMode) {
                modal.innerHTML = `
                    <div class="jrnl-modal-card">
                        <div class="jrnl-modal-head">
                            <span class="jrnl-modal-title"><i class="fa-solid fa-pen"></i> 編輯總結 — ${_escape(title)}</span>
                            <button class="jrnl-modal-close" title="關閉">✕</button>
                        </div>
                        <div class="jrnl-modal-body">
                            <textarea class="jrnl-edit-area" spellcheck="false"></textarea>
                            <div class="jrnl-modal-foot">
                                <span class="jrnl-modal-status"></span>
                                <button class="jrnl-mbtn jrnl-edit-cancel">取消</button>
                                <button class="jrnl-mbtn jrnl-mbtn-primary jrnl-edit-save"><i class="fa-solid fa-floppy-disk"></i> 儲存</button>
                            </div>
                        </div>
                    </div>`;
                container.appendChild(modal);
                const area = modal.querySelector('.jrnl-edit-area');
                const status = modal.querySelector('.jrnl-modal-status');
                const saveB = modal.querySelector('.jrnl-edit-save');
                area.value = content || '';
                modal.querySelector('.jrnl-modal-close').onclick = close;
                modal.querySelector('.jrnl-edit-cancel').onclick = close;
                saveB.onclick = async () => {
                    saveB.disabled = true; status.textContent = '儲存中…';
                    try {
                        if (!osDb.saveTavernSummary) throw new Error('OS_DB 不可用');
                        await osDb.saveTavernSummary(story.chatId, {
                            content: area.value,
                            summaryCount: (rec && rec.summaryCount) ? rec.summaryCount : 1,
                            lastId: (rec && rec.lastId != null) ? rec.lastId : null,
                            title: (rec && rec.title) || '',
                            bgCacheId: (rec && rec.bgCacheId) || '',
                            storyId: (rec && rec.storyId) || '',
                            rawChatId: (rec && rec.rawChatId) || '',
                        });
                        try { win.OS_SUMMARY_INJECT?.invalidate?.(story.chatId); } catch (e) {}
                        _sfx('book_stamp');   // 存檔完成＝書放回桌上
                        status.textContent = '已儲存 ✓';
                        setTimeout(close, 700);
                    } catch (e) { status.textContent = '儲存失敗：' + (e.message || e); saveB.disabled = false; }
                };
            } else {
                modal.innerHTML = `
                    <div class="jrnl-modal-card">
                        <div class="jrnl-modal-head">
                            <span class="jrnl-modal-title">${_escape(title)}</span>
                            <button class="jrnl-modal-close" title="關閉">✕</button>
                        </div>
                        <div class="jrnl-modal-body"></div>
                    </div>`;
                container.appendChild(modal);
                modal.querySelector('.jrnl-modal-body').innerHTML = _renderMd(content);
                modal.querySelector('.jrnl-modal-close').onclick = close;
            }
            modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
            const onKey = (e) => {
                if (!modal.isConnected) { document.removeEventListener('keydown', onKey); return; }
                if (e.key === 'Escape') close();
            };
            document.addEventListener('keydown', onKey);
        }

        // 🗑️ 清空這段劇情的所有綁定資料（雙重確認；走 OS_DB.deleteAllByChatId，storyId/rawChatId 從大總結那筆拿）
        function _openWipeConfirm(story) {
            if (!story) return;
            const old = container.querySelector('.jrnl-modal'); if (old) old.remove();
            const title = story.storyTitle || story.cardName || '這段劇情';
            const modal = document.createElement('div');
            modal.className = 'jrnl-modal';
            _tagModalDesk(modal, 'kview');
            const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
            modal.innerHTML = `
                <div class="jrnl-modal-card">
                    <div class="jrnl-modal-head">
                        <span class="jrnl-modal-title"><i class="fa-solid fa-trash-can"></i> 清空「${_escape(title)}」</span>
                        <button class="jrnl-modal-close" title="關閉">✕</button>
                    </div>
                    <div class="jrnl-modal-body">
                        <div class="jrnl-wipe-note">不玩這段劇情了？這會把它綁定的資料全部刪掉，<b>無法復原</b>。別段劇情 / 別張卡不受影響。</div>
                        <div class="jrnl-wipe-list">將清除：大總結、AVS 狀態、向量記憶、頭像 / 立繪 / 場景插圖 / 背景圖、微信 / 電話 / 微博、各 app 記憶、調查進度、成就、大廳記錄。<br>聊天室 ID：<b>${_escape(story.chatId || '')}</b></div>
                        <div class="jrnl-wipe-note">※ 酒館聊天本身請自己在酒館刪；這裡只清奧瑞亞附加的資料。</div>
                        <label class="jrnl-wipe-confirm"><input type="checkbox" class="jrnl-wipe-ack"><span>我了解這會永久刪除、無法復原</span></label>
                        <div class="jrnl-modal-foot">
                            <span class="jrnl-modal-status"></span>
                            <button class="jrnl-mbtn jrnl-wipe-cancel">取消</button>
                            <button class="jrnl-mbtn jrnl-mbtn-danger jrnl-wipe-go" disabled><i class="fa-solid fa-trash-can"></i> 永久清除</button>
                        </div>
                    </div>
                </div>`;
            container.appendChild(modal);
            const ack = modal.querySelector('.jrnl-wipe-ack');
            const go = modal.querySelector('.jrnl-wipe-go');
            const status = modal.querySelector('.jrnl-modal-status');
            ack.onchange = () => { go.disabled = !ack.checked; };
            modal.querySelector('.jrnl-modal-close').onclick = close;
            modal.querySelector('.jrnl-wipe-cancel').onclick = close;
            go.onclick = async () => {
                if (!ack.checked) return;
                go.disabled = true; status.textContent = '清除中…';
                try {
                    if (!osDb.deleteAllByChatId) throw new Error('OS_DB.deleteAllByChatId 不存在');
                    let rec = {};
                    try { rec = (await osDb.getTavernSummary(story.chatId)) || {}; } catch (e) {}
                    let storyId = rec.storyId || '', rawChatId = rec.rawChatId || '';
                    const curNorm = win.OS_STORY_TOOLS?.getChatId?.() || '';
                    if (story.chatId === curNorm) {   // 正在開著的這段 → 補 context 的 storyId/raw
                        if (!rawChatId) { try { rawChatId = String(win.SillyTavern?.getContext?.()?.chatId || ''); } catch (e) {} }
                        if (!storyId) { try { storyId = (win.VN_Core && win.VN_Core._currentStoryId) || win.OS_AVS_ADAPTER?.getStoryId?.() || localStorage.getItem('vn_current_story_id') || ''; } catch (e) {} }
                    }
                    const report = await osDb.deleteAllByChatId(story.chatId, { storyId, vnWorld: rawChatId || story.chatId, rawChatId: rawChatId || story.chatId });
                    try { win.OS_SUMMARY_INJECT?.invalidate?.(story.chatId); } catch (e) {}
                    _sfx('paper_tear');   // 清空完成＝撕頁
                    console.log('[OS_JOURNAL] 🗑️ 清空', story.chatId, report);
                    allStories = allStories.filter(s => !((s.cardName || '') === (story.cardName || '') && (s.chatId || '') === (story.chatId || '')));
                    activeKey = allStories[0] ? `${allStories[0].cardName}|||${allStories[0].chatId}` : null;
                    status.textContent = '已清空';
                    setTimeout(() => { close(); _renderList(); }, 600);
                } catch (e) { status.textContent = '清除失敗：' + (e.message || e); go.disabled = false; }
            };
            modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
            const onKey = (e) => {
                if (!modal.isConnected) { document.removeEventListener('keydown', onKey); return; }
                if (e.key === 'Escape') close();
            };
            document.addEventListener('keydown', onKey);
        }

        // ── 🕮 開書／翻頁動效（只在書裝；2026-10-13 從 Vproject 的 JOURNAL_OPEN_LAB 搬進來，她看過選定）──
        //    打開＝先看到闔著的皮面封面，自己翻開；換故事／換書籤＝翻一頁；✕＝闔上再回大廳。
        //    書本那幾層（封面、右半書殼、紙）只在演的時候用，演完換回原本那張整頁書殼圖，攤開的樣子跟以前一樣。
        //    大廳設置「演出動畫」關掉、或系統要求減少動態效果＝全部照舊直接出現。
        //    🚨 收尾一律用計時器、不等動畫的 finished：畫面藏著時動畫不前進，等它的話會卡在演到一半。
        // 開書、闔書的快慢：1＝小樣的「正常」；10-13 她說「闔上和打開可以加快」→ 用小樣的「快」那檔（六成時間）。翻頁不算在內
        const BK_FAST = 0.6;
        const BK = { inited: false, state: 'none', leaf: null, hold: null, turnTimer: 0, introTimer: 0, openSfx: false };
        const _bkDesk = () => rootEl.classList.contains('jrnl-desk');
        function _bkFxOn() {
            try {
                if (localStorage.getItem('aurelia_reveal_fx') === '0') return false;   // 大廳設置的「演出動畫」
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
                return !!(window.Element && Element.prototype.animate);
            } catch (e) { return false; }
        }
        const _bkAnim = (el, kf, o) => el ? el.animate(kf, Object.assign({ fill: 'forwards', easing: 'ease' }, o)) : null;
        // 收掉自己掛的動畫（緞帶尾巴那種 CSS 自己的擺動留著）
        const _bkClear = (els) => els.forEach(el => el && el.getAnimations && el.getAnimations().forEach(a => {
            if (!(window.CSSAnimation && a instanceof CSSAnimation)) a.cancel();
        }));
        const _bkStripIds = (el) => { el.removeAttribute('id'); el.querySelectorAll('[id]').forEach(n => n.removeAttribute('id')); return el; };

        const BK_CORNER = (pos) => `<svg class="jrnl-bk-corner jrnl-bk-${pos}" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">`
            + '<path d="M3 37V14C3 7.9 7.9 3 14 3H37"/><path d="M8.5 30C8.5 18 18 8.5 30 8.5" stroke-width=".7" opacity=".7"/>'
            + '<path d="M3 14c4.5 0 7.5 3 7.5 7.5M14 3c0 4.5 3 7.5 7.5 7.5" stroke-width=".8"/><circle cx="12.6" cy="12.6" r="1.7" fill="currentColor" stroke="none"/></svg>';
        const BK_HTML = `
            <div class="jrnl-bk" aria-hidden="true">
                <div class="jrnl-bk-book">
                    <div class="jrnl-bk-shadow"></div>
                    <div class="jrnl-bk-thick"></div>
                    <div class="jrnl-bk-base"></div>
                    <div class="jrnl-bk-cast"></div>
                    <div class="jrnl-bk-tail"></div>
                    <div class="jrnl-bk-coverwrap">
                        <div class="jrnl-bk-cover">
                            <div class="jrnl-bk-face jrnl-bk-front">
                                <div class="jrnl-bk-leather">
                                    <div class="jrnl-bk-frame">${BK_CORNER('tl')}${BK_CORNER('tr')}${BK_CORNER('bl')}${BK_CORNER('br')}</div>
                                    <div class="jrnl-bk-center">
                                        <svg class="jrnl-bk-orn" viewBox="0 0 160 18" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"><path d="M4 9h56M100 9h56"/><path d="M60 9c6-6 12-6 14 0-2 6-8 6-14 0zM100 9c-6-6-12-6-14 0 2 6 8 6 14 0z"/><path d="M80 2l2.2 7L80 16l-2.2-7z" fill="currentColor"/></svg>
                                        <div class="jrnl-bk-en">STORY JOURNAL</div>
                                        <div class="jrnl-bk-title">故事日誌</div>
                                        <div class="jrnl-bk-name">瀅瀅</div>
                                        <svg class="jrnl-bk-emblem" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width=".8"><circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="10.5" stroke-dasharray="1.2 2.2"/><path d="M24 3l2.6 18.4L45 24l-18.4 2.6L24 45l-2.6-18.4L3 24l18.4-2.6z" fill="currentColor" stroke="none"/></svg>
                                    </div>
                                    <div class="jrnl-bk-lthshade"></div>
                                </div>
                            </div>
                            <div class="jrnl-bk-face jrnl-bk-back"><div class="jrnl-bk-pimg"><div class="jrnl-bk-pshade"></div></div></div>
                        </div>
                    </div>
                </div>
                <div class="jrnl-bk-leafwrap"><div class="jrnl-bk-lcast jrnl-bk-r"></div><div class="jrnl-bk-lcast jrnl-bk-l"></div></div>
            </div>`;

        // 一打開：書裝的話先擺一本闔著的書，停一下自己翻開（點封面就馬上翻）
        function _bkInit() {
            if (BK.inited || !_bkDesk()) return;
            BK.inited = true;
            if (!_bkFxOn()) return;
            rootEl.querySelector('.jrnl-stage').insertAdjacentHTML('beforeend', BK_HTML);
            rootEl.classList.add('jrnl-bk-closed');
            BK.state = 'closed';
            rootEl.querySelector('.jrnl-bk-cover').addEventListener('click', _bkOpen);
            // 窗口一開始藏起來的話（見最上面切塊那段），現在從中間往外蓋上來；書晚一點才翻開
            if (TILE.host && !TILE.on) {
                TILE.on = true;
                TF.run(TILE.host, 'in');
            }
            BK.introTimer = setTimeout(_bkOpen, 450 * BK_FAST + (TILE.on ? BK_LATE : 0));
        }
        const _bkQ = (sel) => rootEl.querySelector('.jrnl-bk ' + sel);

        function _bkOpen() {
            if (BK.state !== 'closed') return;
            clearTimeout(BK.introTimer);
            BK.state = 'opening';
            const bk = rootEl.querySelector('.jrnl-bk');
            const T = 1300 * BK_FAST;
            if (!BK.openSfx) _sfx('book_open');
            _bkAnim(_bkQ('.jrnl-bk-cover'), [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }], { duration: T, easing: 'cubic-bezier(.55,.06,.3,1)' });
            _bkAnim(bk, [{ transform: 'translateX(-24.2%) scale(.94)' }, { transform: 'translateX(0%) scale(1)' }], { duration: T * 1.05, easing: 'cubic-bezier(.5,0,.25,1)' });
            _bkAnim(_bkQ('.jrnl-bk-shadow'), [{ left: '49.6%' }, { left: '49.6%', offset: .4 }, { left: '1.2%' }], { duration: T, easing: 'cubic-bezier(.5,0,.25,1)' });
            _bkAnim(_bkQ('.jrnl-bk-thick'), [{ opacity: 1 }, { opacity: 0 }], { duration: 260 * BK_FAST });
            _bkAnim(_bkQ('.jrnl-bk-tail'), [{ opacity: 1 }, { opacity: 0 }], { duration: 300 * BK_FAST });
            _bkAnim(_bkQ('.jrnl-bk-lthshade'), [{ opacity: 0 }, { opacity: .8, offset: .45 }, { opacity: .8 }], { duration: T });
            _bkAnim(_bkQ('.jrnl-bk-pshade'), [{ opacity: .8 }, { opacity: .8, offset: .5 }, { opacity: 0 }], { duration: T });
            _bkAnim(_bkQ('.jrnl-bk-cast'), [{ opacity: 0 }, { opacity: .85, offset: .3 }, { opacity: 0, offset: .62 }, { opacity: 0 }], { duration: T });
            // 封面過了垂直線才讓兩張紙嘩啦帶過，紙才不會疊在還沒翻過去的封面上
            setTimeout(_bkRiffle, T * .52);
            setTimeout(_bkRiffle, T * .63);
            setTimeout(() => {
                if (BK.state !== 'opening') return;
                // 封面落地：換回原本那張整頁書殼圖＋真的頁面，書本那幾層收起來
                rootEl.classList.remove('jrnl-bk-closed');
                rootEl.classList.add('jrnl-bk-open');
                _bkClear([bk, ...bk.querySelectorAll('.jrnl-bk-book *')]);
                BK.state = 'open';
                _bkReveal();
            }, T * 1.03);
        }

        // 攤開後頁面上的東西一樣一樣浮出來：左頁往右、右頁往上、書籤從書裡抽出來
        function _bkReveal() {
            const ease = 'cubic-bezier(.2,.7,.3,1)';
            const CAP = 9;   // 條目很多時，第 9 個之後一起出來，不要排到好幾秒後
            const shown = (el) => el.offsetParent !== null;
            try {   // 左頁標題「目 錄」是 ::before 畫的
                leftEl.animate([{ opacity: 0, transform: 'translateX(-.8cqw)' }, { opacity: 1, transform: 'none' }],
                    { duration: 420 * BK_FAST, easing: ease, fill: 'backwards', pseudoElement: '::before' });
            } catch (e) {}
            [...leftEl.querySelectorAll('.jrnl-search, .jrnl-toolbar, .jrnl-card')].forEach((el, i) =>
                _bkAnim(el, [{ opacity: 0, transform: 'translateX(-.8cqw)' }, { opacity: 1, transform: 'none' }],
                    { duration: 420 * BK_FAST, delay: Math.min(i + 1, CAP) * 55 * BK_FAST, easing: ease, fill: 'backwards' }));
            [...rightEl.querySelectorAll('.jrnl-d-head, .jrnl-volume, .jrnl-d-section-head, .jrnl-tl-item, .jrnl-char-card, .jrnl-mg-row, .jrnl-empty')]
                .filter(shown).forEach((el, i) =>
                    _bkAnim(el, [{ opacity: 0, transform: 'translateY(.8cqw)' }, { opacity: 1, transform: 'none' }],
                        { duration: 480 * BK_FAST, delay: (120 + Math.min(i, CAP) * 75) * BK_FAST, easing: ease, fill: 'backwards' }));
            [...container.querySelectorAll('.jrnl-tab')].forEach((el, i) =>
                _bkAnim(el, [{ opacity: 0, transform: 'translateX(-75%)' }, { opacity: 1, transform: 'none' }],
                    { duration: 440 * BK_FAST, delay: (280 + i * 90) * BK_FAST, easing: 'cubic-bezier(.3,1.35,.5,1)', fill: 'backwards' }));
        }

        // 一張紙：正面帶右頁那塊圖、背面帶左頁那塊圖；frontPg/backPg 是要跟著紙一起翻的頁面複本
        function _bkLeaf(frontPg, backPg) {
            const wrap = _bkQ('.jrnl-bk-leafwrap');
            if (!wrap) return null;
            const leaf = document.createElement('div');
            leaf.className = 'jrnl-bk-leaf';
            leaf.innerHTML = '<div class="jrnl-bk-face jrnl-bk-front"><div class="jrnl-bk-limg"></div><div class="jrnl-bk-lshade"></div></div>'
                + '<div class="jrnl-bk-face jrnl-bk-back"><div class="jrnl-bk-limg"></div><div class="jrnl-bk-lshade"></div></div>';
            if (frontPg) leaf.children[0].insertBefore(frontPg, leaf.children[0].lastChild);
            if (backPg) leaf.children[1].insertBefore(backPg, leaf.children[1].lastChild);
            wrap.appendChild(leaf);
            return leaf;
        }
        const BK_FLIP_FWD = [{ transform: 'translateZ(0) rotateY(0deg)' }, { transform: 'translateZ(1.4cqw) rotateY(-90deg)', offset: .5 }, { transform: 'translateZ(0) rotateY(-180deg)' }];
        const BK_FLIP_BACK = [{ transform: 'translateZ(0) rotateY(-180deg)' }, { transform: 'translateZ(1.4cqw) rotateY(-90deg)', offset: .5 }, { transform: 'translateZ(0) rotateY(0deg)' }];
        // dir>0 從右翻到左（往後翻），dir<0 從左翻回右；紙上的陰影、兩邊書頁上的投影跟著走
        function _bkFlipLeaf(leaf, dir, T, easing) {
            const [fs, bs] = leaf.querySelectorAll('.jrnl-bk-lshade');
            const up = [{ opacity: 0 }, { opacity: .9, offset: .5 }, { opacity: .9 }];
            const down = [{ opacity: .9 }, { opacity: .9, offset: .5 }, { opacity: 0 }];
            _bkAnim(fs, dir > 0 ? up : down, { duration: T });
            _bkAnim(bs, dir > 0 ? down : up, { duration: T });
            const near = [{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 0, offset: .6 }, { opacity: 0 }];
            const far = [{ opacity: 0 }, { opacity: 0, offset: .45 }, { opacity: .9, offset: .82 }, { opacity: 0 }];
            _bkAnim(_bkQ('.jrnl-bk-lcast.jrnl-bk-r'), dir > 0 ? near : far, { duration: T });
            _bkAnim(_bkQ('.jrnl-bk-lcast.jrnl-bk-l'), dir > 0 ? far : near, { duration: T });
            _bkAnim(leaf, dir > 0 ? BK_FLIP_FWD : BK_FLIP_BACK, { duration: T, easing });
        }
        // 開書時嘩啦帶過的空白紙
        function _bkRiffle() {
            if (BK.state !== 'opening') return;
            const leaf = _bkLeaf(null, null);
            if (!leaf) return;
            _bkFlipLeaf(leaf, 1, 560 * BK_FAST, 'cubic-bezier(.45,.05,.3,1)');
            setTimeout(() => leaf.remove(), 600 * BK_FAST);
        }

        // 頁面複本。右頁要定格在複製這一刻：換書籤是 root 上換 class 切區塊，不鎖的話複本會跟著變成新的那頁
        function _bkCloneRight() {
            const c = _bkStripIds(rightEl.cloneNode(true));
            const src = rightEl.querySelectorAll('.jrnl-d-section');
            c.querySelectorAll('.jrnl-d-section').forEach((s, i) => {
                if (src[i] && getComputedStyle(src[i]).display === 'none') s.remove();
                else s.classList.add('jrnl-bk-keep');
            });
            return c;
        }
        const _bkCloneLeft = () => _bkStripIds(leftEl.cloneNode(true));

        // 換故事／換書籤＝翻一頁。apply() 換掉底下的內容
        //   往後翻（dir>0）：底下先換成新的，紙的正面帶著舊的右頁掀到左邊
        //   往前翻（dir<0）：紙從左邊翻回來、正面帶著新的右頁，落下後才露出底下新的那頁
        function _bkTurn(dir, apply) {
            if (BK.state !== 'open' || !_bkDesk()) { apply(); return; }
            _bkSettle();   // 上一頁還沒翻完：直接翻完，接著翻這一頁
            const T = 880, easing = 'cubic-bezier(.42,0,.28,1)';
            const listTop = listEl.scrollTop, rightTop = rightEl.scrollTop;
            const wrap = _bkQ('.jrnl-bk-leafwrap');
            let front;
            if (dir > 0) front = _bkCloneRight();
            else {
                BK.hold = _bkCloneRight();
                BK.hold.classList.add('jrnl-bk-hold');
                wrap.insertBefore(BK.hold, wrap.firstChild);
                BK.hold.scrollTop = rightTop;
                rootEl.classList.add('jrnl-bk-holding');
            }
            apply();
            listEl.scrollTop = listTop;
            rightEl.scrollTop = 0;
            if (dir < 0) front = _bkCloneRight();
            const back = _bkCloneLeft();
            BK.leaf = _bkLeaf(front, back);
            if (dir > 0) front.scrollTop = rightTop;
            const backList = back.querySelector('.jrnl-list');
            if (backList) backList.scrollTop = listTop;
            _bkFlipLeaf(BK.leaf, dir, T, easing);
            BK.turnTimer = setTimeout(_bkSettle, T + 30);
        }
        function _bkSettle() {
            clearTimeout(BK.turnTimer); BK.turnTimer = 0;
            if (BK.leaf) { BK.leaf.remove(); BK.leaf = null; }
            if (BK.hold) { BK.hold.remove(); BK.hold = null; }
            rootEl.classList.remove('jrnl-bk-holding');
        }

        // ✕：頁面淡掉、封面闔回來、整本挪回正中，然後才回大廳
        function _bkClose(done) {
            _bkSettle();
            BK.state = 'closing';
            _sfx('book_close');
            const fades = [leftEl, rightEl, container.querySelector('.jrnl-tabs')].map(el =>
                _bkAnim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 * BK_FAST }));
            setTimeout(() => {
                if (BK.state !== 'closing') return;
                rootEl.classList.remove('jrnl-bk-open');
                rootEl.classList.add('jrnl-bk-closed');
                fades.forEach(a => a && a.cancel());
                const bk = rootEl.querySelector('.jrnl-bk');
                const T = 1150 * BK_FAST;
                _bkAnim(_bkQ('.jrnl-bk-cover'), [{ transform: 'rotateY(-180deg)' }, { transform: 'rotateY(0deg)' }], { duration: T, easing: 'cubic-bezier(.55,0,.35,1)' });
                _bkAnim(bk, [{ transform: 'translateX(0%) scale(1)' }, { transform: 'translateX(-24.2%) scale(.94)' }], { duration: T * 1.05, easing: 'cubic-bezier(.5,0,.3,1)' });
                _bkAnim(_bkQ('.jrnl-bk-shadow'), [{ left: '1.2%' }, { left: '49.6%', offset: .6 }, { left: '49.6%' }], { duration: T, easing: 'cubic-bezier(.5,0,.3,1)' });
                _bkAnim(_bkQ('.jrnl-bk-lthshade'), [{ opacity: .8 }, { opacity: .8, offset: .5 }, { opacity: 0 }], { duration: T });
                _bkAnim(_bkQ('.jrnl-bk-pshade'), [{ opacity: 0 }, { opacity: .8, offset: .5 }, { opacity: .8 }], { duration: T });
                _bkAnim(_bkQ('.jrnl-bk-cast'), [{ opacity: 0 }, { opacity: 0, offset: .45 }, { opacity: .85, offset: .8 }, { opacity: 0 }], { duration: T });
                _bkAnim(_bkQ('.jrnl-bk-thick'), [{ opacity: 0 }, { opacity: 1 }], { duration: 200 * BK_FAST, delay: T * .9, fill: 'both' });
                _bkAnim(_bkQ('.jrnl-bk-tail'), [{ opacity: 0 }, { opacity: 1 }], { duration: 300 * BK_FAST, delay: T * .9, fill: 'both' });
                setTimeout(done, T * 1.06);
            }, 230 * BK_FAST);
        }

        // 卡片點擊：切換 active；手機自動切到詳情頁
        listEl.addEventListener('click', (e) => {
            const card = e.target.closest('.jrnl-card');
            if (!card) return;
            const key = card.dataset.key;
            const apply = () => { activeKey = key; _renderList(); };
            if (key !== activeKey) {
                _sfx('page_turn');   // 換故事線＝翻一頁
                const cards = [...listEl.querySelectorAll('.jrnl-card')];
                const from = cards.findIndex(c => c.dataset.key === activeKey);
                _bkTurn(cards.indexOf(card) > from ? 1 : -1, apply);
            } else apply();
            if (window.matchMedia('(max-width: 720px)').matches) {
                container.querySelector('.jrnl-root')?.classList.add('show-detail-mobile');
            }
        });

        // 搜尋與排序（搜尋防抖：每個按鍵都重渲染＝連帶重跑封面/頭像補圖，打字時記憶體與 IDB 都會被灌爆）
        let _searchTimer = null;
        searchEl.addEventListener('input', () => {
            clearTimeout(_searchTimer);
            _searchTimer = setTimeout(_renderList, 220);
        });
        sortEl.addEventListener('change', _renderList);

        // 🕮 書裝側邊書籤:story/chars/manage 三枚切右頁區塊
        //    切換只掛 class,區塊顯隱交給 CSS(窄屏書籤整列 display:none,原版型全區塊直排不受影響)
        const rootForTabs = container.querySelector('.jrnl-root');
        let activeTab = 'story';
        function _applyTab() {
            rootForTabs.classList.remove('jrnl-tab-story', 'jrnl-tab-chars', 'jrnl-tab-manage');
            rootForTabs.classList.add('jrnl-tab-' + activeTab);
            container.querySelectorAll('.jrnl-tab').forEach(b =>
                b.classList.toggle('active', b.dataset.tab === activeTab));
        }
        const TAB_ORDER = ['story', 'chars', 'manage'];
        container.querySelectorAll('.jrnl-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const to = btn.dataset.tab;
                if (to === activeTab) { _applyTab(); return; }
                _sfx('book_riffle');   // 切書籤＝快速翻書
                // 書籤在下面的往後翻、在上面的往前翻
                _bkTurn(TAB_ORDER.indexOf(to) > TAB_ORDER.indexOf(activeTab) ? 1 : -1, () => { activeTab = to; _applyTab(); });
            });
        });
        _applyTab();

        // 滑過目錄條目／書籤：紙張輕滑（只給真滑鼠，觸控 tap 會補一次 mouseover 變兩聲）
        //   🚨點條目會重畫整份清單 → 游標沒動，底下的節點卻被換成新的,瀏覽器補一次 mouseover,
        //     於是「翻頁聲」後面又跟一聲滑動聲。所以滑動聲要求「游標真的有移動過」，
        //     而且點擊後那段重畫時間一律不響。
        if (!window.matchMedia || window.matchMedia('(hover: hover)').matches) {
            let hoverEl = null, hoverAt = 0, lastX = -1, lastY = -1, quietUntil = 0;
            //   🚨判斷「游標真的移動過」不能靠 mousemove 有沒有來過:游標跳到新元素時
            //     mouseover 是排在 mousemove 前面的,旗標會來不及翻。改成比座標——
            //     重畫補的那次 mouseover 帶的是原地座標,跟上一次一模一樣,一眼分得出來。
            container.addEventListener('mousemove', (e) => { lastX = e.clientX; lastY = e.clientY; }, true);
            container.addEventListener('mousedown', () => { quietUntil = Date.now() + 320; }, true);
            container.addEventListener('mouseover', (e) => {
                const samePos = (e.clientX === lastX && e.clientY === lastY);
                lastX = e.clientX; lastY = e.clientY;
                // 只有目錄條目給滑過音（一張張卡＝抽卡聲）。右側書籤刻意不給：
                // 那三片本來就會點出翻書聲，滑過再加一層整體太吵。
                const el = e.target.closest?.('.jrnl-card');
                if (!el || el === hoverEl) return;
                hoverEl = el;
                const now = Date.now();
                if (samePos || now < quietUntil || now - hoverAt < 120) return;   // 掃過一整排也不要連環響
                _sfx('card_pick');
                hoverAt = now;
            }, true);
            container.addEventListener('mouseout', (e) => {
                if (hoverEl && e.target === hoverEl) hoverEl = null;
            }, true);
        }

        // 關閉 → 回大廳（走 PhoneSystem.goHome，跟 spend 面板同套）
        //   不能用 AureliaControlCenter.hide()，那會關整支手機 + 下次打開 state 還在 → 回不去大廳
        let wentHome = false;
        closeEl.addEventListener('click', () => {
            // 回大廳只走一次；回去之後把窗口的剪裁清掉，下一個開在這一格的 app 才不會被剪掉
            const home = () => {
                if (wentHome) return;
                wentHome = true;
                if (win.PhoneSystem?.goHome) win.PhoneSystem.goHome();
                _tileClear();
            };
            if (BK.state === 'open' && _bkDesk()) {   // 書裝：先闔上再走
                if (!TILE.on) { _bkClose(home); return; }
                // 書一開始闔，窗口就同時從外圈一格格收掉，中間的書最後收（她：「已經開始闔書了，但內容物還未收起」）；
                // 兩邊都好了才真的回大廳
                let left = 2;
                const one = () => { if (--left === 0) home(); };
                _bkClose(one);
                TF.run(TILE.host, 'out', one);
                return;
            }
            if (BK.state === 'closing') { home(); return; }                    // 闔到一半又按一次＝不等了
            _sfx('book_close');
            home();
        });

        _renderList();
        _bkInit();
        // 窗口先藏起來了、結果沒有要演（窄版面、或演出動畫關著）：馬上露出來，之後也不補演
        if (TILE.host && !TILE.on) { _tileClear(); TILE.host = null; }
        if (BK.state !== 'closed') { _sfx('book_open'); BK.openSfx = true; }   // 日誌開場＝翻開書（要演開書的話，等封面翻起來那一下才響）
    }

    win.OS_JOURNAL = { launch };
    console.log('✅ Story Journal (OS_JOURNAL) 模組就緒');
})();
