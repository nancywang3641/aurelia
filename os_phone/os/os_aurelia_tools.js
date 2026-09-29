// ----------------------------------------------------------------
// [檔案] os_aurelia_tools.js — 「翻奧瑞亞的資料」：給 AI 用的唯讀工具
// 路徑：os_phone/os/os_aurelia_tools.js
//
// 小機（之後的 API 小機、培養室）與聊天 app 的角色要能自己去查奧瑞亞裡的東西，
// 而不是每一輪把整個故事都塞給它。這支只放「會查」那一級：全部只讀、不叫模型、不花錢。
// 盤點見 docs/小機奧瑞亞工具清單_20260930.md（一、會查）。
//
//   ・酒館與手機 PWA 共用：各工具自己分兩條路（酒館讀聊天樓、手機讀章節…），呼叫端不用管。
//   ・「這個故事」有三把不同的鑰匙（大總結、狀態/記憶、錢包/聊天室各用各的），
//     一律交給原本那個模組自己去取，這裡不另外算——算錯會靜靜找不到東西。
//   ・🚫 這裡不准寫任何東西：錢包、章節、狀態、世界書一律只讀。要動手的是下一級，另外做、要她確認。
//
// 目前接在聊天 app 的「可以用工具」（wx_tools.js 內建的「翻奧瑞亞的資料」）。
// 暴露：window.OS_AURELIA_TOOLS = { tools, run(name, args, ctx) }
//   ctx.chat：叫工具的那間聊天室（看朋友圈要知道是誰在看、列聊天室要排除自己）
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    function _pwa() { try { return !!(win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()); } catch (e) { return false; } }
    function _TH() { return _pwa() ? null : (win.TavernHelper || null); }
    function _one(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
    function _cut(s, n) { s = String(s == null ? '' : s).trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
    function _tail(s, n) { s = String(s == null ? '' : s).trim(); return s.length > n ? '…' + s.slice(-n) : s; }
    // 故事線的鑰匙（酒館＝chatId、手機＝storyId）。狀態、記憶、線索帳用的是這把。
    function _storyId() {
        try { const A = win.OS_AVS_ADAPTER; const v = A && A.getStoryId && A.getStoryId(); if (v) return String(v); } catch (e) {}
        try { return localStorage.getItem('vn_current_story_id') || ''; } catch (e) { return ''; }
    }
    const NO_STORY = '現在沒有打開的故事，查不到故事裡的東西。';
    // 關鍵字：空白、頓號、逗號都當分隔；每個詞都要出現才算中。
    //   繁簡都認：角色常用簡體查（VN 指令要角色名寫簡體），她的設定多半是繁體。
    //   WX_ZH 只拿來「比對」，顯示一律是原字（表收人名與常用字，不求全）。
    function _fold(s) { s = String(s == null ? '' : s).toLowerCase(); try { const Z = win.WX_ZH || window.WX_ZH; return (Z && Z.fold) ? Z.fold(s) : s; } catch (e) { return s; } }
    function _terms(q) { return String(q || '').split(/[\s,，、;；]+/).map(function (x) { return _fold(x.trim()); }).filter(Boolean).slice(0, 5); }
    function _hitAll(hay, terms) { hay = _fold(hay); return terms.every(function (t) { return hay.indexOf(t) !== -1; }); }

    // ── 1. 最近幾章劇情 ─────────────────────────────────────────────
    //   手機：OS_DB 章節（照 state_runtime 那段：篩 storyId、照 createdAt 排）。
    //   酒館：只讀最後那一段樓層就好（getChatMessages 窗口版一定含最新幾樓），不必整本讀檔。
    //   🚨 ctx.chat.length 在 TauriTavern 不是總樓數，要用 getLastMessageId。
    function _clean(t) {
        const R = win.VN_READER;
        let s = String(t || '');
        try { if (R && R.sumStrip) s = R.sumStrip(s); } catch (e) {}
        try { if (R && R.clean) s = R.clean(s); } catch (e) {}
        return s.replace(/\n{3,}/g, '\n\n').trim();
    }
    function _summaryOf(t) { try { const R = win.VN_READER; return (R && R.sumExtract) ? String(R.sumExtract(t) || '').trim() : ''; } catch (e) { return ''; } }
    async function _recentChapters(n) {
        if (_pwa()) {
            const sid = _storyId();
            if (!sid) return null;
            let all = [];
            try { all = (await win.OS_DB.getAllVnChapters()) || []; } catch (e) {}
            return all.filter(function (c) { return c && c.storyId === sid; })
                .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); })
                .slice(-n)
                .map(function (c) { return { head: c.title || '（沒有標題）', raw: c.content || '' }; });
        }
        const TH = _TH();
        if (!TH || !TH.getChatMessages || !TH.getLastMessageId) return null;
        const last = TH.getLastMessageId();
        if (last == null || last < 0) return [];
        let msgs = [];
        try { msgs = (await TH.getChatMessages(Math.max(0, last - 40) + '-' + last)) || []; } catch (e) {}
        return msgs.filter(function (m) { return m && m.role === 'assistant' && !m.is_hidden; })
            .slice(-n)
            .map(function (m) { return { head: '第 ' + m.message_id + ' 樓', raw: m.message || '' }; });
    }
    async function storyRecent(args) {
        const n = Math.min(4, Math.max(1, parseInt(args && args.count, 10) || 2));
        const chs = await _recentChapters(n);
        if (chs === null) return NO_STORY;
        if (!chs.length) return '這個故事還沒有任何劇情。';
        // 最新一章給正文的後半（停在哪裡最要緊），前面幾章給摘要；沒有摘要才給正文尾巴
        return chs.map(function (c, i) {
            const latest = i === chs.length - 1;
            const sum = _summaryOf(c.raw);
            const body = latest ? _tail(_clean(c.raw), 1500) : (sum ? '（摘要）' + _cut(sum, 400) : _tail(_clean(c.raw), 400));
            return '── ' + c.head + (latest ? '（最新）' : '') + '\n' + (body || '（沒有內容）');
        }).join('\n\n');
    }

    // ── 2. 故事總整理：大總結＋結案表＋線索帳＋配角近況 ─────────────────────
    //   大總結那組自己處理兩邊存法與鑰匙（OS_STORY_TOOLS.getChatId，空白會換底線，別自己算）。
    //   線索帳 snapshot 在酒館第一次讀會順手開帳——每一輪送劇情時本來就會做，這裡讀一次不多出什麼。
    async function storyOverview() {
        if (!_storyId()) return NO_STORY;
        const ST = win.OS_STORY_TOOLS, parts = [];
        try { const s = ST && ST.getCurrentInjectionPayload ? await ST.getCurrentInjectionPayload() : ''; if (s) parts.push('【大總結】\n' + _cut(s, 1400)); } catch (e) {}
        try { const s = ST && ST.getCurrentClosedBlock ? await ST.getCurrentClosedBlock() : ''; if (s) parts.push('【已經結束的事】\n' + _cut(s, 500)); } catch (e) {}
        try {
            const T = win.OS_STORY_THREADS;
            const snap = T && T.snapshot ? await T.snapshot() : null;
            if (snap) {
                const open = (snap.open || []).concat(snap.stale || []).filter(function (r) { return r.pick !== 'hold'; });
                if (open.length) parts.push('【還沒有下文的事】\n' + open.slice(0, 10).map(function (r) { return '・' + r.label + (r.fact ? '：' + _cut(_one(r.fact), 80) : ''); }).join('\n'));
            }
        } catch (e) {}
        try { const s = ST && ST.getCurrentLifeBlock ? await ST.getCurrentLifeBlock() : ''; if (s) parts.push('【配角最近的生活】\n' + _cut(s.replace(/<\/?配角近況>/g, '').trim(), 500)); } catch (e) {}
        return parts.length ? parts.join('\n\n') : '這個故事還沒有總整理（大總結還沒做過）。';
    }

    // ── 3. 世界書關鍵字搜尋（兩邊原本都沒有）──────────────────────────────
    //   範圍＝這個故事現在開著的書。酒館：角色卡的主書＋附加書＋聊天綁的書＋全域書；
    //   手機：常駐書包＋這本藏書掛的書包（OS_WORLDBOOK.getActivePacks，組 context 也是走這支）。
    //   停用的條目不找（她關掉的就是不要用）。
    async function _wbEntries() {
        if (_pwa()) {
            const WB = win.OS_WORLDBOOK;
            let all = [];
            try { all = (await win.OS_DB.getAllWorldbookEntries()) || []; } catch (e) {}
            all = all.filter(function (e) { return e && e.enabled !== false; });
            const packs = (WB && WB.getActivePacks) ? WB.getActivePacks() : [];
            let mine = all.filter(function (e) { return packs.indexOf(e.book || '預設書包') !== -1; });
            let note = '';
            if (!packs.length || !mine.length) { mine = all; note = '（這個故事沒有掛世界書，下面是所有書裡找到的）'; }
            return { note: note, list: mine.map(function (e) { return { book: e.book || '預設書包', title: e.title || '', keys: String(e.keys || ''), content: e.content || '' }; }) };
        }
        const TH = _TH();
        if (!TH || !TH.getLorebookEntries) return { note: '', list: [] };
        const names = [];
        const add = function (n) { if (n && names.indexOf(n) === -1) names.push(n); };
        try { const cw = TH.getCharWorldbookNames && TH.getCharWorldbookNames('current'); if (cw) { add(cw.primary); (cw.additional || []).forEach(add); } } catch (e) {}
        try { add(TH.getChatWorldbookName && TH.getChatWorldbookName('current')); } catch (e) {}
        try { ((TH.getGlobalWorldbookNames && TH.getGlobalWorldbookNames()) || []).forEach(add); } catch (e) {}
        const list = [];
        for (const b of names) {
            let es = [];
            try { es = (await TH.getLorebookEntries(b)) || []; } catch (e) {}
            es.forEach(function (e) {
                if (!e || e.enabled === false) return;
                list.push({ book: b, title: e.comment || '', keys: (e.keys || []).join(','), content: e.content || '' });
            });
        }
        return { note: '', list: list };
    }
    async function worldbookSearch(args) {
        const terms = _terms(args && args.keyword);
        if (!terms.length) return '要給一個關鍵字。';
        const got = await _wbEntries();
        const hits = got.list.map(function (e) {
            if (!_hitAll(e.title + ' ' + e.keys + ' ' + e.content, terms)) return null;
            // 標題中的排最前，其次關鍵字，最後是只在內容裡出現的
            const score = (_hitAll(e.title, terms) ? 4 : 0) + (_hitAll(e.keys, terms) ? 2 : 0) + 1;
            return { e: e, score: score };
        }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });
        if (!hits.length) return '世界書裡沒有找到「' + terms.join(' ') + '」。' + (got.list.length ? '' : '（這個故事現在沒有開著的世界書）');
        const out = [got.note ? got.note : '', '找到 ' + hits.length + ' 條' + (hits.length > 5 ? '，列前 5 條' : '') + '：'].filter(Boolean);
        hits.slice(0, 5).forEach(function (h) {
            out.push('── ' + (h.e.title || '（沒有標題）') + '｜' + h.e.book + (h.e.keys ? '｜關鍵字：' + _cut(h.e.keys, 60) : '｜常駐'));
            out.push(_cut(h.e.content, 500));
        });
        return out.join('\n');
    }

    // ── 4. 劇情記憶關鍵字搜尋 ─────────────────────────────────────────
    //   只用關鍵字：語意搜尋（OS_VECTOR_ENGINE.search）每查一次要花嵌入的錢，這一級不用。
    const MEM_TYPE = { npc: '人物', event: '事件', item: '物品', location: '地點', rule: '規則', relationship: '關係', dialogue: '說過的話', sex: '親密' };
    async function memorySearch(args) {
        const sid = _storyId();
        if (!sid) return NO_STORY;
        const terms = _terms(args && args.keyword);
        if (!terms.length) return '要給一個關鍵字。';
        let all = [];
        try { all = (await win.OS_DB.getAllVnMemories(sid)) || []; } catch (e) {}
        all = all.filter(function (m) { return m && !m.merged && (m.text || m.summary); });
        if (!all.length) return '這個故事還沒有劇情記憶（可能還沒開記憶，或還沒演到會記的地方）。';
        const hits = all.filter(function (m) { return _hitAll((m.summary || '') + ' ' + (m.text || '') + ' ' + (m.tags || []).join(' '), terms); })
            .sort(function (a, b) { return ((b.weight == null ? 0.5 : b.weight) - (a.weight == null ? 0.5 : a.weight)) || ((b.createdAt || 0) - (a.createdAt || 0)); });
        if (!hits.length) return '劇情記憶裡沒有找到「' + terms.join(' ') + '」。';
        return ['找到 ' + hits.length + ' 筆' + (hits.length > 8 ? '，列前 8 筆' : '') + '：'].concat(hits.slice(0, 8).map(function (m) {
            return '・［' + (MEM_TYPE[m.type] || '其他') + '］' + _cut(_one(m.text || m.summary), 260);
        })).join('\n');
    }

    // ── 4b. 在這張卡以前玩過的每一次裡找（跨篇章找回憶）──────────────────────
    //   她 09-30：「我以前玩了這張卡，但我忘記是哪一次了，但我記得XXX某某去過廁所」。
    //   一次把三層翻完再交回去（分三輪查＝多兩次回話的錢）：劇情記憶 → 大總結 → 劇情原文。
    //   🚨 沒有記憶或大總結的那幾次不能排除：那只代表沒整理過，事情可能就在原文裡，所以原文每一次都翻。
    //   全部在本機翻（不叫模型、跟故事長短無關），只有找到的那幾段交給模型，有上限。
    //   範圍＝這張卡：酒館是目前角色卡的所有聊天檔；手機是同一本書（vn_story_index 的 worldId）的所有篇章，
    //   自由劇情沒有書，就是所有自由劇情。
    //   詞的寫法：空白隔開＝都要出現在同一小段（前後兩百多字內，不是整章各出現一次）；| 隔開＝同一個東西的不同說法，任一個就算。
    function _groups(q) {
        return String(q || '').split(/[\s,，、;；]+/).map(function (g) {
            return g.split(/[|｜／/]+/).map(function (x) { return _fold(x.trim()); }).filter(Boolean);
        }).filter(function (g) { return g.length; }).slice(0, 5);
    }
    function _matchGroups(folded, groups) { return groups.every(function (g) { return g.some(function (w) { return folded.indexOf(w) !== -1; }); }); }
    // 原文切成小段（約 240 字）；比對時相鄰兩段併起來看，才不會因為剛好切在中間而漏掉
    function _passages(text) {
        const out = []; let cur = '';
        String(text || '').split('\n').forEach(function (line) {
            line = line.trim();
            if (!line) return;
            while (line.length > 240) { if (cur) { out.push(cur); cur = ''; } out.push(line.slice(0, 240)); line = line.slice(240); }
            if (cur && cur.length + line.length > 240) { out.push(cur); cur = ''; }
            cur = cur ? cur + '\n' + line : line;
        });
        if (cur) out.push(cur);
        return out;
    }
    // 取第一個中的詞前後一小段（WX_ZH 是一字對一字，折過的位置就是原文的位置）
    function _snippet(text, groups, n) {
        const f = _fold(text);
        let at = -1;
        groups.some(function (g) { return g.some(function (w) { const i = f.indexOf(w); if (i !== -1) { at = i; return true; } return false; }); });
        const s = Math.max(0, (at < 0 ? 0 : at) - Math.floor(n / 3)), e = Math.min(text.length, s + n);
        return (s > 0 ? '…' : '') + _one(text.slice(s, e)) + (e < text.length ? '…' : '');
    }
    // 這張卡玩過的每一次 → [{ name, isNow, memKey, sumKey, when, units: [{ at, text }] }]；讀不到回 null
    async function _playthroughs() {
        if (_pwa()) {
            const now = _storyId();
            let idx = {};
            try { idx = JSON.parse(localStorage.getItem('vn_story_index') || '{}') || {}; } catch (e) {}
            const world = (idx[now] && idx[now].worldId != null) ? idx[now].worldId : (localStorage.getItem('vn_current_world_id') || '');
            let all = [];
            try { all = (await win.OS_DB.getAllVnChapters()) || []; } catch (e) {}
            const byStory = {};
            all.forEach(function (c) { if (c && c.storyId) (byStory[c.storyId] = byStory[c.storyId] || []).push(c); });
            const sids = Object.keys(idx).filter(function (sid) { return (idx[sid].worldId || '') === (world || ''); });
            if (now && sids.indexOf(now) === -1) sids.push(now);
            return sids.map(function (sid) {
                const chs = (byStory[sid] || []).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
                const meta = idx[sid] || {};
                return {
                    name: meta.title || (chs[0] && chs[0].storyTitle) || sid, isNow: sid === now, memKey: sid, sumKey: sid,
                    when: meta.createdAt || (chs[0] && chs[0].createdAt) || 0,
                    units: chs.map(function (c, i) {
                        return { at: '第 ' + (i + 1) + ' 章' + (c.title ? '｜' + c.title : ''), text: (c.request ? '（對方）' + c.request + '\n' : '') + _clean(c.content) };
                    })
                };
            });
        }
        const TH = _TH();
        if (!TH || !TH.getChatHistoryBrief || !TH.getChatHistoryDetail) return null;
        let detail = null;
        try { detail = await TH.getChatHistoryDetail(await TH.getChatHistoryBrief('current')); } catch (e) {}
        if (!detail || typeof detail !== 'object') return null;
        const now = _storyId();
        return Object.keys(detail).map(function (file) {
            // 記憶、狀態那把＝檔名去掉 .jsonl（同 OS_AVS_ADAPTER）；大總結那把再把空白換底線（同 OS_STORY_TOOLS.getChatId）
            const key = String(file).split(/[\\/]/).pop().replace(/\.jsonl?$/i, '').trim();
            const msgs = (detail[file] || []).filter(function (m) { return m && typeof m.mes === 'string'; });   // 檔頭那行沒有 mes
            return {
                name: key, isNow: key === now, memKey: key, sumKey: key.replace(/\s+/g, '_'), when: 0,
                units: msgs.map(function (m, i) { return { at: '第 ' + i + ' 樓', text: m.is_user ? '（對方）' + m.mes : _clean(m.mes) }; })
            };
        });
    }
    async function _summaryText(p) {
        try {
            if (_pwa()) {
                const list = (await win.OS_DB.getGrandSummaries(p.sumKey)) || [];
                const last = list.reduce(function (a, b) { return (a && (a.count || 0) >= (b.count || 0)) ? a : b; }, null);
                return (last && last.content) || '';
            }
            const rec = win.OS_DB.getTavernSummary ? await win.OS_DB.getTavernSummary(p.sumKey) : null;
            return (rec && rec.content) || '';
        } catch (e) { return ''; }
    }
    async function searchPast(args) {
        const words = _one(args && args.words);
        const groups = _groups(words);
        if (!groups.length) return '要給要找的詞。';
        const pts = await _playthroughs();
        if (pts === null) return '讀不到這張卡的聊天記錄（現在沒有打開角色卡，或酒館助手沒開）。';
        if (!pts.length) return '這張卡還沒有玩過的記錄。';
        const name = function (p) { return '「' + _cut(p.name, 40) + '」' + (p.isNow ? '（現在這一次）' : ''); };
        const byKey = {};
        pts.forEach(function (p) { byKey[p.memKey] = p; });

        // ① 劇情記憶
        let mems = [];
        try { mems = (await win.OS_DB.getAllVnMemories()) || []; } catch (e) {}
        mems = mems.filter(function (m) { return m && !m.merged && byKey[m.storyId]; });
        const withMem = new Set(mems.map(function (m) { return m.storyId; }));
        const memHits = mems.filter(function (m) { return _matchGroups(_fold((m.summary || '') + ' ' + (m.text || '') + ' ' + (m.tags || []).join(' ')), groups); })
            .sort(function (a, b) { return (b.weight == null ? 0.5 : b.weight) - (a.weight == null ? 0.5 : a.weight); });
        // ② 大總結
        const sumHits = [];
        let withSum = 0;
        for (const p of pts) {
            const content = await _summaryText(p);
            if (!content) continue;
            withSum++;
            // 大總結是 markdown（## 標題、| 表格 |），排版符號拿掉再比對與節錄
            const plain = String(content).replace(/^\s*#+\s*/gm, '').replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, '').replace(/\s*\|\s*/g, ' ');
            _passages(plain).forEach(function (ps) { if (_matchGroups(_fold(ps), groups)) sumHits.push({ p: p, text: ps }); });
        }
        // ③ 劇情原文（每一次都翻）
        const raw = [];
        let rawTotal = 0;
        pts.forEach(function (p) {
            const hits = [];
            p.units.forEach(function (u) {
                const ps = _passages(u.text);
                for (let i = 0; i < ps.length; i++) {
                    const two = ps[i] + (ps[i + 1] ? '\n' + ps[i + 1] : '');
                    if (_matchGroups(_fold(two), groups)) { hits.push({ at: u.at, text: two }); i++; }
                }
            });
            if (hits.length) { raw.push({ p: p, hits: hits }); rawTotal += hits.length; }
        });
        raw.sort(function (a, b) { return (b.hits.length - a.hits.length) || ((b.p.when || 0) - (a.p.when || 0)); });

        const out = ['在這張卡玩過的 ' + pts.length + ' 次裡找「' + words + '」'
            + '（' + withMem.size + ' 次有劇情記憶、' + withSum + ' 次有大總結；原文每一次都翻了）：'];
        if (memHits.length) {
            out.push('【劇情記憶】');
            memHits.slice(0, 5).forEach(function (m) { out.push('・' + name(byKey[m.storyId]) + '：' + _cut(_one(m.text || m.summary), 150)); });
        }
        if (sumHits.length) {
            out.push('【大總結】');
            sumHits.slice(0, 3).forEach(function (h) { out.push('・' + name(h.p) + '：' + _snippet(h.text, groups, 150)); });
        }
        if (rawTotal) {
            out.push('【劇情原文】共 ' + rawTotal + ' 處，在 ' + raw.length + ' 次裡：');
            raw.slice(0, 5).forEach(function (r) {
                out.push('── ' + name(r.p) + '：' + r.hits.length + ' 處');
                r.hits.slice(0, 2).forEach(function (h) { out.push('  ' + h.at + '：' + _snippet(h.text, groups, 160)); });
            });
            if (raw.length > 5) out.push('（還有 ' + (raw.length - 5) + ' 次也有，沒列出來）');
            if (rawTotal > 10) out.push('找到的地方很多：再加一個那一段裡一定會出現的詞（空白隔開），可以縮小範圍。');
        }
        if (!memHits.length && !sumHits.length && !rawTotal) {
            out.push('劇情記憶、大總結、原文都沒有找到。原文可能用的是別的說法：把想得到的說法用 | 一次寫齊再找一次，或問對方還記得什麼細節。');
        }
        return _cut(out.join('\n'), 2900);
    }

    // ── 5. 人物：名冊或某人的檔案 ──────────────────────────────────────
    async function people(args) {
        if (!_storyId()) return NO_STORY;
        let d = null;
        try { d = win.OS_NPC_DOSSIER && win.OS_NPC_DOSSIER.dump ? await win.OS_NPC_DOSSIER.dump() : null; } catch (e) {}
        const dos = (d && d.dossiers) || {};
        const chars = (d && d.ledger && d.ledger.chars) || {};
        const names = Object.keys(dos).sort(function (a, b) { return ((chars[b] && chars[b].lastAt) || 0) - ((chars[a] && chars[a].lastAt) || 0); });
        if (!names.length) return '這個故事還沒有人物檔案。';
        const q = _one(args && args.name), fq = _fold(q);
        if (!q) {
            return ['登場過的人（最近出場的在前，共 ' + names.length + ' 人）：'].concat(names.slice(0, 30).map(function (n) {
                return '・' + n + '｜' + _cut(_one(dos[n].hook) || '（沒有簡介）', 60);
            })).join('\n');
        }
        const hit = names.filter(function (n) { const fn = _fold(n); return fn.indexOf(fq) !== -1 || fq.indexOf(fn) !== -1; });
        if (!hit.length) return '人物檔案裡沒有「' + q + '」。登場過的人：' + names.slice(0, 20).join('、');
        return hit.slice(0, 3).map(function (n) {
            const x = dos[n] || {};
            return '【' + n + '】' + (x.hook ? _one(x.hook) + '\n' : '') + _cut(x.file || '（檔案還是空的）', 900);
        }).join('\n\n');
    }

    // ── 6. 現況：日期、主角狀態、約定、狀態面板、錢包餘額 ────────────────────
    // 狀態面板的值可能是一層物件（關係：{店長: 信任}）→ 寫成「店長 信任、…」，別把程式格式原樣交出去
    function _avsVal(v, depth) {
        if (v == null) return '';
        if (typeof v !== 'object') return _one(v);
        if (Array.isArray(v)) return v.map(function (x) { return _avsVal(x, depth + 1); }).filter(Boolean).join('、');
        if (depth > 1) return _one(JSON.stringify(v));
        return Object.keys(v).filter(function (k) { return !/^_/.test(k); }).map(function (k) {
            const s = _avsVal(v[k], depth + 1);
            return s ? k + ' ' + s : '';
        }).filter(Boolean).join('、');
    }
    function _avsLines(o) {
        const out = [];
        Object.keys(o || {}).forEach(function (k) {
            if (/^_/.test(k)) return;   // 底線開頭的是程式自己用的
            const s = _avsVal(o[k], 0);
            if (s) out.push('・' + k + '：' + _cut(s, 160));
        });
        return out;
    }
    async function status() {
        if (!_storyId()) return NO_STORY;
        const parts = [];
        try {
            const M = win.OS_MC_STATUS;
            let s = M && M.buildBlock ? await M.buildBlock() : '';
            if (!s && M && M.load && M.summary) { const st = await M.load(); const bits = M.summary(st); if (bits.length) s = bits.join('｜'); }
            // 原本是寫給正文 AI 的措辭；這裡換成看記錄的說法，並標明是故事裡的時間（不然會被當成現實的今天）
            if (s) parts.push(s.replace('【主角狀態｜系統記錄，以此為準】', '【主角的狀態】')
                .replace(/^現在：/m, '故事裡現在：').replace(/^近期約定：/m, '故事裡接下來的約定：')
                .replace(/\n（狀態效果的剩餘回合[^\n]*）/, ''));
        } catch (e) {}
        try {
            const E = win._AVS_ENGINE;
            const lines = _avsLines(E && E.read ? E.read() : null);
            if (lines.length) parts.push('【狀態面板上的記錄】\n' + lines.slice(0, 14).join('\n'));
        } catch (e) {}
        try {
            const W = win.WX_WALLET;
            if (W && W.load && W.getBalance) { await W.load(); parts.push('【主角的錢包餘額】' + (W.money ? W.money(W.getBalance()) : W.getBalance())); }
        } catch (e) {}
        return parts.length ? parts.join('\n\n') : '這個故事還沒有記下任何狀態。';
    }

    // ── 7. 聊天 app 的其他聊天室 ──────────────────────────────────────
    //   範圍＝這個故事的聊天室＋大廳的人（getApiChatsForCurrentCard 已經篩好）。
    //   不給：叫工具的這一間自己（它本來就看得到）、她設了「不算進故事」的聊天室、只有通話記錄的。
    function _roomName(c) { return String((c && (c.name || c.realName)) || (c && c.id) || '').trim(); }   // 聊天列表上顯示的就是 name
    function _msgLine(m, room) {
        const who = m.isMe ? ((win.WX_ME && win.WX_ME.name) ? win.WX_ME.name() : '我') : (m.senderName || m.sender || _roomName(room));
        let t = _one(m.content);
        t = t.replace(/\[(?:图片|圖片)[:：][^\]]*\]/g, '（圖片）').replace(/\[Voice:\s*([^\]]*)\]/gi, '（語音）$1');
        return who + '：' + _cut(t, 120);
    }
    async function chatRooms(args, ctx) {
        let map = {};
        try { map = (await win.OS_DB.getApiChatsForCurrentCard()) || {}; } catch (e) {}
        const self = ctx && ctx.chat && ctx.chat.id;
        const rooms = Object.keys(map).map(function (k) { return map[k]; }).filter(function (c) {
            if (!c || c.id === self || c.noHistory === true) return false;
            const ms = Array.isArray(c.messages) ? c.messages : [];
            return ms.length && !ms.every(function (m) { return m && m._viaCall; });
        });
        if (!rooms.length) return '手機聊天 app 裡沒有其他聊天室。';
        const q = _one(args && args.room);
        const lastAt = function (c) { const ms = c.messages; return (ms[ms.length - 1] && ms[ms.length - 1].timestamp) || 0; };
        rooms.sort(function (a, b) { return lastAt(b) - lastAt(a); });
        if (!q) {
            return ['有這些聊天室（最近有聊的在前）：'].concat(rooms.slice(0, 20).map(function (c) {
                return '・' + _roomName(c) + (c.isGroup ? '（群聊）' : '') + '｜' + c.messages.length + ' 則';
            })).join('\n');
        }
        const fq = _fold(q);
        const hit = rooms.find(function (c) { return _fold(_roomName(c)) === fq; }) || rooms.find(function (c) { const n = _fold(_roomName(c)); return n.indexOf(fq) !== -1 || fq.indexOf(n) !== -1; });
        if (!hit) return '沒有叫「' + q + '」的聊天室。有這些：' + rooms.slice(0, 15).map(_roomName).join('、');
        const ms = hit.messages.filter(function (m) { return m && m.type !== 'system' && m.content; }).slice(-12);
        return '【' + _roomName(hit) + (hit.isGroup ? '（群聊）' : '') + '】最近 ' + ms.length + ' 則：\n' + ms.map(function (m) { return _msgLine(m, hit); }).join('\n');
    }

    // ── 8. 朋友圈與微博 ──────────────────────────────────────────────
    //   朋友圈照「叫工具的這個人看得到的」給（WX_MOMENTS.brief 已經處理誰看得到誰）。
    async function phoneFeed(args, ctx) {
        const parts = [];
        try {
            const MO = win.WX_MOMENTS, cid = ctx && ctx.chat && ctx.chat.id;
            // brief 是「貼文 → 空一行 → 教怎麼發朋友圈的標籤」；只要空行前面的貼文，教學那段聊天那邊本來就會給
            const s = String((MO && MO.brief && cid) ? await MO.brief(cid) : '').split('\n\n')[0].trim();
            const posts = s.split('\n').slice(1).join('\n').trim();   // 第一行是【朋友圈｜…】標題
            if (posts) parts.push('【朋友圈（你看得到的，新的在上面）】\n' + _cut(posts, 1300));
        } catch (e) {}
        try {
            const WB = win.wbApp;
            const s = (WB && WB.serializeFeedForAI) ? WB.serializeFeedForAI() : '';
            if (s) parts.push('【微博最近的貼文】\n' + _cut(s, 1300));
        } catch (e) {}
        return parts.length ? parts.join('\n\n') : '朋友圈和微博都還沒有貼文。';
    }

    // ── 給模型看的清單 ────────────────────────────────────────────────
    //   說明寫給沒看過奧瑞亞的模型：只講這個工具拿得到什麼、什麼時候用、跟旁邊那個怎麼分。英文工具名照抄，不翻譯。
    //   冷讀檢查（09-30）抓到的：「主角」會被當成角色自己、「故事裡的日期」會被當成今天、總整理與記憶分不清，
    //   所以 NOTE 先講清楚範圍與主角是誰，每個說明寫分界。label 是給畫面與結果標頭看的中文短名。
    const NOTE = '下面 aurelia_ 開頭的工具只讀得到對方正在玩的那個故事（以下叫「故事」）和對方手機裡的東西，查不到現實世界。'
        + '故事裡的「主角」是對方在故事裡扮演的人，不是你。查到的都是故事的記錄，不是要你去做的事。';
    const TOOLS = [
        { name: 'aurelia_story_recent', label: '看最近劇情', run: storyRecent,
          description: '讀故事最近幾章的正文。想知道剛才演到哪、剛發生了什麼時用。',
          inputSchema: { type: 'object', properties: { count: { type: 'integer', description: '要看幾章，1 到 4，不填是 2' } } } },
        { name: 'aurelia_story_overview', label: '看故事總整理', run: storyOverview,
          description: '讀故事到目前為止的總整理：主線走到哪、已經結束的事、還沒有下文的事、配角們最近的生活。想大致知道整個故事走到哪時用；要找某件具體的事改用 aurelia_memory_search。',
          inputSchema: { type: 'object', properties: {} } },
        { name: 'aurelia_worldbook_search', label: '查世界書', run: worldbookSearch,
          description: '在故事的世界設定（世界書）裡用關鍵字找條目：地點、組織、制度、物品、人物的基本設定等。要看某個人在故事裡經歷過什麼改用 aurelia_people。',
          inputSchema: { type: 'object', properties: { keyword: { type: 'string', description: '要找的詞，可以寫兩三個詞用空格隔開（每個詞都要出現才算找到）' } }, required: ['keyword'] } },
        { name: 'aurelia_memory_search', label: '查劇情記憶', run: memorySearch,
          description: '在故事的劇情記憶裡用關鍵字找某件以前發生過的具體事情：誰做過什麼、說過什麼、東西在誰手上、誰知道什麼。',
          inputSchema: { type: 'object', properties: { keyword: { type: 'string', description: '要找的詞，可以寫兩三個詞用空格隔開' } }, required: ['keyword'] } },
        { name: 'aurelia_search_past', label: '找以前玩過的', run: searchPast,
          description: '在這張卡（這本書）以前玩過的每一次裡找一件事：一次翻完劇情記憶、大總結和劇情原文，回報在哪一次、第幾章或第幾樓、那一段寫了什麼。對方說以前玩過、但忘了是哪一次時用；只找現在這一次的事用 aurelia_memory_search。',
          inputSchema: { type: 'object', properties: { words: { type: 'string', description: '要找的詞。不同的東西用空格隔開（每個都要出現在同一小段裡才算）；同一個東西的不同說法用 | 隔開（任一個有就算）。想得到的說法一次寫齊，不要分好幾次查' } }, required: ['words'] } },
        { name: 'aurelia_people', label: '查人物', run: people,
          description: '查故事裡登場過的人的檔案：身分、個性、跟主角之間發生過的事。不填名字就列出登場過的所有人；填名字就看那個人的檔案。',
          inputSchema: { type: 'object', properties: { name: { type: 'string', description: '要查的人的名字；想看有哪些人就不要填' } } } },
        { name: 'aurelia_status', label: '看故事現況', run: status,
          description: '看故事現在的狀況：故事裡的日期（不是現實的今天）、主角的身體狀態、故事裡接下來的約定、狀態面板上的記錄、主角錢包的餘額。',
          inputSchema: { type: 'object', properties: {} } },
        { name: 'aurelia_chat_rooms', label: '看其他聊天室', run: chatRooms,
          description: '看對方手機聊天 app 裡、你這一間以外的聊天室。不填名字就列出有哪些聊天室；填名字就看那一間最近的對話。',
          inputSchema: { type: 'object', properties: { room: { type: 'string', description: '聊天室的名字；想看有哪些聊天室就不要填' } } } },
        { name: 'aurelia_phone_feed', label: '看朋友圈與微博', run: phoneFeed,
          description: '看對方手機上朋友圈（你看得到的那些）和微博最近的貼文。',
          inputSchema: { type: 'object', properties: {} } },
    ];

    async function run(name, args, ctx) {
        const t = TOOLS.find(function (x) { return x.name === name; });
        if (!t) throw new Error('沒有叫做「' + name + '」的工具');
        const out = await t.run(args || {}, ctx || {});
        return String(out == null ? '' : out).trim() || '什麼都沒有查到。';
    }

    const API = {
        note: NOTE,
        tools: TOOLS.map(function (t) { return { name: t.name, label: t.label, description: t.description, inputSchema: t.inputSchema }; }),
        run: run,
    };
    win.OS_AURELIA_TOOLS = API;
    window.OS_AURELIA_TOOLS = API;
})();
