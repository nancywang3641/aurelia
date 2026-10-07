// ----------------------------------------------------------------
// [檔案] story_threads.js (V1 - 線索帳：已經發生、還沒有下文的事)
// 路徑：os_phone/rpg/story_threads.js
// 職責：
// 1. 記帳搭便車：每輪副模型本來就要讀新章節（狀態／劇情記憶那一通），同一個 JSON 多吐 "threads"，
//    只回報這一章的變化（開／續／收），不多打 API。
// 2. 帳是程式記的：每一章的變化按章存，要用時拿「還活著的章節」從頭疊一遍 → 刪章／重生／swipe 自動退回。
//    收場的線不會被抄下去（Ako 那種「每章讓模型重抄一份清單」會把收場的線改寫成僵局接著列）。
// 3. 送回正文：<線索帳> 一塊＝還沒下文的線＋玩家挑的「想看／先放著」＋最近收場的只點名。
// 4. 畫面：劇情末尾「線索」鈕 → 圖譜＋清單，想看／先放著在這裡按。
//
// 🔀 誰負責記（同一章只記一次）：
//   酒館：AVS 開著 → state_runtime.extractOnce（記憶也在那通）；AVS 關、記憶開 → os_vector_engine.ingest。
//   PWA ：記憶開著 → os_vector_engine.ingest（VN_CHAPTER_SAVED）；記憶關、AVS 開 → state_runtime.extractOnce。
//   兩個都關＝沒有任何一通在跑 → 不記（不為了記帳另外叫模型，那是她的錢）。
// 🔑 章節鑰匙：酒館＝樓號（message_id）；PWA＝章節 id。分艙走 OS_AVS_ADAPTER（酒館 chatId／PWA storyId）。
// 🚨 酒館別拿 ctx.chat.length 當樓數（TauriTavern 懶載入），要總數讀 VN_READER.fetchFullChat。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    console.log('🧵 [Story Threads] V1 載入');

    const APP_ID = 'story_threads';
    const INJECT_ID = 'aurelia_story_threads';
    const CFG = {
        flagKey: 'sp_story_threads',   // =0 關，預設開
        staleAfter: 10,                // 幾章沒動就不再每輪送（帳上留著，劇情回頭找時還接得上）
        closedNameFor: 20,             // 收場的線，幾章內還點名「過去了別再提」
        maxItemsPerRound: 5,
        labelMax: 16,
        factMax: 160,
        onceStaleAfter: 3              // 一次性小事幾章沒動就不再每輪送（辦完該收；沒收也別一直掛著讓 AI 回頭演）
    };

    // 方向：這條線往下走會是哪一種。副模型開線時挑一個，面板上掛成小標籤給她看；
    //   🚨 不當任務交給寫正文的 AI（標了「謎團」它就會硬把人寫神秘），只有她按「想看」的線附上方向。
    const KINDS = [
        { id: 'once', name: '一次性', re: /一次|小事|once/i, desc: '一件具體的小事，辦完就結束，之後不會再牽出別的事' },
        { id: 'favor', name: '人情', re: /人情|往來|往来|favor/i, desc: '之後會互相幫忙、欠人情、有來往' },
        { id: 'love', name: '感情', re: /感情|曖昧|暧昧|戀|恋|love|romance/i, desc: '曖昧、心動、兩個人的關係起變化' },
        { id: 'trouble', name: '麻煩', re: /麻煩|麻烦|危險|危险|衝突|冲突|trouble|danger/i, desc: '衝突、被人找麻煩、有人會吃虧或受傷' },
        { id: 'mystery', name: '謎團', re: /謎|谜|秘密|mystery/i, desc: '有沒解開的秘密、來歷不明的人或東西' },
        { id: 'chance', name: '機會', re: /機會|机会|門路|门路|賺|赚|chance|opportunity/i, desc: '能賺錢、搭上門路、拿到好處' }
    ];
    function _normKind(k) {
        const s = String(k == null ? '' : k).trim();
        if (!s) return '';
        const hit = KINDS.find(x => x.re.test(s));
        return hit ? hit.id : '';
    }
    function _kindName(id) { const k = KINDS.find(x => x.id === id); return k ? k.name : ''; }

    function _isOn() { try { return localStorage.getItem(CFG.flagKey) !== '0'; } catch (e) { return true; } }
    function _setOn(on) { try { localStorage.setItem(CFG.flagKey, on ? '1' : '0'); } catch (e) {} }
    function _isStandalone() { try { return !!win.OS_API?.isStandalone?.(); } catch (e) { return false; } }
    function _chatId() {
        try {
            const id = win.OS_AVS_ADAPTER?.getCurrentChatId?.();
            if (id) return String(id);
            const raw = win.SillyTavern?.getContext?.()?.chatId;
            return raw ? String(raw).split(/[\\/]/).pop().replace(/\.jsonl?$/i, '').trim() : '';
        } catch (e) { return ''; }
    }
    function _memOn() { try { return win.OS_VECTOR_ENGINE?.isEnabled?.() === true; } catch (e) { return false; } }
    function _avsOn() { try { return !!win.OS_STATE_RUNTIME?.isEnabled?.(); } catch (e) { return false; } }

    // 這一章由哪一通記：'avs'＝state_runtime.extractOnce、'vector'＝os_vector_engine.ingest、''＝沒有人跑
    function siteFor() {
        if (!_isOn()) return '';
        const mem = _memOn(), avs = _avsOn();
        if (_isStandalone()) return mem ? 'vector' : (avs ? 'avs' : '');
        return avs ? 'avs' : (mem ? 'vector' : '');
    }

    // 線名 → 比對鑰匙：去空白、去結尾的「線」、簡繁折成同一把（副模型常把帳上的名字換成另一種寫法）
    function _labelOf(s) {
        return String(s || '').replace(/[【】\[\]「」]/g, '').replace(/\s+/g, '').trim().slice(0, CFG.labelMax);
    }
    function _keyOf(label) {
        const base = _labelOf(label).replace(/[线線]$/, '');
        try { if (win.OS_ZH?.key) return win.OS_ZH.key(base); } catch (e) {}
        return base.toLowerCase();
    }

    // ── 存取 ────────────────────────────────────────────────────────
    function _blank() { return { v: 1, deltas: {}, picks: {}, lean: {} }; }
    let _cache = null, _cacheChat = '';
    let _q = Promise.resolve();
    function _run(fn) { const p = _q.then(fn, fn); _q = p.catch(function () {}); return p; }

    async function _load(cid) {
        cid = cid || _chatId();
        if (!cid) return null;
        if (_cache && _cacheChat === cid) return _cache;
        let d = null;
        try { d = await win.OS_DB?.getAppData?.(APP_ID, 'ledger', cid); } catch (e) { console.warn('[Story Threads] 讀取失敗:', e); }
        _cache = Object.assign(_blank(), d || {});
        if (!_cache.deltas || typeof _cache.deltas !== 'object') _cache.deltas = {};
        if (!_cache.picks || typeof _cache.picks !== 'object') _cache.picks = {};
        if (!_cache.lean || typeof _cache.lean !== 'object') _cache.lean = {};
        _cacheChat = cid;
        return _cache;
    }
    async function _save() {
        if (!_cache || !_cacheChat) return false;
        let ok = true;
        try { await win.OS_DB?.saveAppData?.(APP_ID, 'ledger', _cache, _cacheChat); }
        catch (e) { ok = false; console.warn('[Story Threads] 存檔失敗:', e); }
        try { win.dispatchEvent(new CustomEvent('aurelia:story-threads')); } catch (e) {}
        return ok;
    }

    // ── 章節順序與存活 ───────────────────────────────────────────────
    // 回 { order: [key...舊→新], alive: Set|null }；alive=null 表示「不知道，全部當活著」
    async function _chapterOrder(data) {
        const keys = Object.keys(data.deltas || {});
        if (_isStandalone()) {
            try {
                const sid = _chatId();
                const all = (await win.OS_DB?.getAllVnChapters?.()) || [];
                // 舊→新：跟 state_runtime 讀最近幾章同一個排法（按建立時間）
                const mine = all.filter(ch => ch && ch.storyId === sid).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
                const pos = new Map(mine.map((ch, i) => [String(ch.id), i]));
                const alive = new Set(pos.keys());
                const order = keys.filter(k => alive.has(k)).sort((a, b) => pos.get(a) - pos.get(b));
                return { order, alive, posOf: k => pos.has(String(k)) ? pos.get(String(k)) : null };
            } catch (e) { /* 讀不到章節就退回照時間排 */ }
            const order = keys.slice().sort((a, b) => (data.deltas[a].at || 0) - (data.deltas[b].at || 0));
            return { order, alive: null, posOf: null };
        }
        const order = keys.slice().sort((a, b) => {
            const na = Number(a), nb = Number(b);
            if (isFinite(na) && isFinite(nb)) return na - nb;
            return (data.deltas[a].at || 0) - (data.deltas[b].at || 0);
        });
        // 酒館鑰匙是樓號，一來一回兩樓＝一章
        return { order, alive: null, posOf: k => /^\d+$/.test(String(k)) ? Math.floor(Number(k) / 2) : null };
    }

    // ── 起點：酒館裡帳還是空的時候，拿聊天記錄裡最後一份 Ako 💫伏笔清單當開帳的底 ─────────
    //   不然剛換過來的第一章，副模型看到的是空帳，以前列過的線全部斷掉，她在圖譜上挑過的線也只剩名字。
    //   只試一次（seedTried）；之後帳就自己長。線名規則照⑦伏笔圖譜正則：去結尾的「线」，
    //   「X之线」的「之」看內文——內文寫著「X之…」就是名字的一部分（秦鹤之），否則是「的」。
    const FB_RE = /<summary>\s*💫\s*伏[笔筆]\s*<\/summary>([\s\S]*?)<\/details>/;
    function _parseDraftLines(raw) {
        const out = [], seen = new Set();
        String(raw || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').split(/\r?\n/).forEach(l => {
            const m = l.trim().match(/^【([^】]+)】\s*(.*)$/);
            if (!m) return;
            let k = m[1].replace(/\s+/g, '').replace(/[线線]$/, '');
            const text = m[2].trim();
            if (/之$/.test(k) && text.indexOf(k) < 0) k = k.slice(0, -1);
            const label = _labelOf(k);
            const key = _keyOf(label);
            if (!label || label.length < 2 || !key || seen.has(key)) return;
            seen.add(key);
            out.push({ line: label, act: 'open', fact: text.replace(/\s+/g, ' ').slice(0, CFG.factMax) });
        });
        return out;
    }
    async function _ensureSeed(data) {
        try {
            if (_isStandalone() || !data || data.seedTried) return;
            const hasAny = Object.keys(data.deltas).some(k => (data.deltas[k].items || []).length);
            if (hasAny) { data.seedTried = true; return; }
            let msgs = null;
            try { msgs = await win.VN_READER?.fetchFullChat?.(); } catch (e) {}
            if (!Array.isArray(msgs) || !msgs.length) return;   // 讀不到就下次再試
            data.seedTried = true;
            for (let i = msgs.length - 1; i >= 0; i--) {
                const m = msgs[i];
                if (!m || m.is_user) continue;
                const hit = String(m.mes || m.message || '').match(FB_RE);
                if (!hit) continue;
                const items = _parseDraftLines(hit[1]);
                if (items.length) {
                    const from = String(m.message_id != null ? m.message_id : i);
                    data.seed = { at: Date.now(), from, items };
                    console.log(`🧵 [Story Threads] 開帳：從第 ${from} 樓的💫伏笔帶進 ${items.length} 條線`);
                }
                break;
            }
            await _save();
        } catch (e) { console.warn('[Story Threads] 開帳失敗:', e?.message || e); }
    }

    // 把各章的變化疊成一本帳。beforeKey：只疊這一章「之前」的（副模型記這一章時看的是它之前的帳）
    //   exclude：這些章不算（酒館 swipe 時正在重寫的那一樓）
    function _fold(data, order, opts) {
        opts = opts || {};
        const lines = new Map();   // key → { label, fact, opened, updated, closed, closedAt, lastAct }（位置＝第幾章，算「幾章沒動」用）
        let idx = 0, lastPos = -1;
        const posOf = (k) => { const p = opts.posOf ? opts.posOf(k) : null; return (p == null) ? idx : p; };
        const stopAt = opts.beforeKey != null ? order.indexOf(String(opts.beforeKey)) : -1;
        const seq = stopAt >= 0 ? order.slice(0, stopAt) : order;
        const ex = opts.exclude || null;
        const used = [];
        // 開帳的底（酒館從 Ako 伏笔帶進來的）排在所有章節前面
        if (data.seed && Array.isArray(data.seed.items)) {
            const at0 = opts.posOf ? (opts.posOf(data.seed.from) ?? 0) : 0;
            data.seed.items.forEach(it => {
                const key = _keyOf(it.line);
                if (key && !lines.has(key)) lines.set(key, { label: _labelOf(it.line), fact: it.fact || '', opened: at0, updated: at0, closed: false, lastAct: 'seed', lastKey: 'seed' });
            });
            lastPos = Math.max(lastPos, at0);
        }
        for (const k of seq) {
            if (ex && ex.has(k)) continue;
            const d = data.deltas[k];
            if (!d || !Array.isArray(d.items)) continue;
            used.push(k);
            const at = Math.max(posOf(k), lastPos);   // 位置只准往後走（萬一排序跟位置對不上，不讓「幾章沒動」變負的）
            lastPos = at;
            for (const it of d.items) {
                const key = _keyOf(it.line);
                if (!key) continue;
                let L = lines.get(key);
                if (it.act === 'close') {
                    if (!L) L = { label: _labelOf(it.line), fact: '', opened: at };
                    if (it.kind) L.kind = it.kind;
                    L.closed = true; L.closedAt = at; L.lastAct = 'close'; L.lastKey = k;
                } else {
                    const isNew = !L;
                    if (!L) L = { label: _labelOf(it.line), fact: '', opened: at };
                    if (it.fact) L.fact = it.fact;
                    if (it.kind) L.kind = it.kind;   // 開線時標的；之後「續」補標或這條線真的變成另一種事才會換
                    L.closed = false; L.updated = at; L.lastAct = isNew ? 'open' : 'update'; L.lastKey = k;
                }
                lines.set(key, L);
            }
            idx++;
        }
        return { lines, count: idx, used, lastPos };
    }

    // ── 1. 給副模型的那一段（記帳搭便車）───────────────────────────────
    // chapterKey：這一章的鑰匙（酒館樓號／PWA 章節 id）。回 { block, handle } 或 null
    async function addendum(chapterKey) {
        try {
            if (!_isOn()) return null;
            const cid = _chatId();
            if (!cid || chapterKey == null || chapterKey === '') return null;
            const key = String(chapterKey);
            const data = await _run(async () => { const d = await _load(cid); await _ensureSeed(d); return d; });
            if (!data) return null;
            const { order } = await _chapterOrder(data);
            // 這一章還沒記過（第一次）或正在被重寫（重生／swipe 同一把鑰匙）→ 都只看它之前的帳
            const ord = order.indexOf(key) >= 0 ? order : order.concat([key]);
            const { lines } = _fold(data, ord, { beforeKey: key });
            const open = [];
            lines.forEach(L => { if (!L.closed) open.push(`【${L.label}】${L.kind ? '〔' + _kindName(L.kind) + '〕' : '〔還沒標方向〕'}${L.fact || '（沒有記下現況）'}`); });
            const block = `

═══════════════════════════════════════
【★ 兼任「線索記帳」→ 放進同一個 JSON 的 "threads" 欄位】
帳上記的是這個故事裡「已經發生、還沒有下文的事」：有人答應了什麼還沒做、欠了什麼還沒還、起了衝突還沒了結、有東西不見了還沒找到、有秘密還沒被發現。它是事實紀錄，不是劇情安排。
目前帳上的線：
${open.length ? open.join('\n') : '（空）'}
讀完這一章，只回報這一章帶來的變化：
- 帳上的線這一章有了新發展：act 寫「續」，fact 寫這條線現在的樣子，一到兩句，會整句取代舊的現況。
- 帳上的線這一章結束了（事情說開了、東西還了、有人出面擺平、當事人各自散了、主角已經抽身）：act 寫「收」，fact 可以空著。結束的事就是結束了，不要改寫成「雙方僵持」「暫時平息」接著記。
- 這一章冒出新的、之後還會有下文的事：act 寫「開」，取一個新線名，fact 寫發生了什麼，kind 寫這條線往下走會是哪一種，只能從下面六個挑一個：
${KINDS.map(k => `  ${k.name}：${k.desc}`).join('\n')}
- 帳上標著〔還沒標方向〕的線，這一章有動到就順便寫 kind。已經標過的不用再寫，除非這條線真的變成另一種事了。
- 一次性的線，那件事辦完了就寫「收」。之後同一個人再出現、只是碰面聊天，不算這條線的後續，也不要為了他再開一條線。
- 只寫已經發生的事實：誰做了什麼、留下了什麼沒解決。不寫你猜接下來會怎樣，也不寫誰打算怎樣。
- 當場就結束的小事、純日常、純心情不記。沒有變化就給 []。一章最多 ${CFG.maxItemsPerRound} 條。
- 線名用「牽涉的人或事＋線」，四到八個字。帳上已有的線，名字照抄，不要換字、不要簡繁互換。
格式："threads": [ { "line": "線名", "act": "開／續／收", "kind": "方向", "fact": "現況" } ]`;
            return { block, handle: { cid, key } };
        } catch (e) {
            console.warn('[Story Threads] 組記帳指示失敗:', e?.message || e);
            return null;
        }
    }

    function _normAct(a) {
        const s = String(a || '').trim().toLowerCase();
        if (/收|结|結|close|end|done/.test(s)) return 'close';
        if (/開|开|新|open|new/.test(s)) return 'open';
        return 'update';
    }

    // 副模型回來的 threads → 存成這一章的變化（同一章重記＝整份取代，重生／swipe 不會疊兩次）
    //   threads 不是陣列＝副模型沒寫這格／整通失敗 → 什麼都不動（別把這章已有的紀錄洗掉）
    async function commit(handle, threads) {
        if (!handle || !handle.cid || handle.key == null) return;
        if (!Array.isArray(threads)) { console.log('🧵 [Story Threads] 這輪副模型沒回 threads，帳不動'); return; }
        return _run(async () => {
            const data = await _load(handle.cid);
            if (!data) return;
            const items = [];
            const seen = new Set();
            for (const t of threads.slice(0, CFG.maxItemsPerRound)) {
                if (!t || typeof t !== 'object') continue;
                const label = _labelOf(t.line || t.name || t.title);
                const k = _keyOf(label);
                if (!label || label.length < 2 || !k || seen.has(k)) continue;
                seen.add(k);
                const act = _normAct(t.act || t.op || t.type);
                const fact = String(t.fact || t.text || t.state || '').replace(/\s+/g, ' ').trim().slice(0, CFG.factMax);
                const kind = _normKind(t.kind || t.direction || t.category);
                if (act !== 'close' && !fact && !kind) continue;   // 開／續卻沒寫現況＝沒東西可記（只補標方向也算）
                items.push(kind ? { line: label, act, fact, kind } : { line: label, act, fact });
            }
            data.deltas[String(handle.key)] = { at: Date.now(), items };
            await _save();
            console.log(`🧵 [Story Threads] 第 ${handle.key} 章：` + (items.length
                ? items.map(i => `${i.act === 'close' ? '收' : (i.act === 'open' ? '開' : '續')}【${i.line}】`).join(' ')
                : '沒有變化'));
        });
    }

    // ── 2. 對帳：刪掉的章節，變化跟著丟 ─────────────────────────────────
    async function reconcile(tag) {
        return _run(async () => {
            const cid = _chatId();
            if (!cid) return;
            const data = await _load(cid);
            if (!data || !Object.keys(data.deltas).length) return;
            let dead = [];
            if (_isStandalone()) {
                const { alive } = await _chapterOrder(data);
                if (!alive) return;
                if (!alive.size) return;   // 讀到零章多半是還沒載好，別全清
                dead = Object.keys(data.deltas).filter(k => !alive.has(k));
            } else {
                let total = -1;
                try { const msgs = await win.VN_READER?.fetchFullChat?.(); if (Array.isArray(msgs)) total = msgs.length; } catch (e) {}
                if (total < 0) return;   // 讀不到完整聊天檔 → 寧可不動
                dead = Object.keys(data.deltas).filter(k => /^\d+$/.test(k) && Number(k) >= total);
            }
            if (!dead.length) return;
            dead.forEach(k => { delete data.deltas[k]; });
            await _save();
            console.log(`🧵 [Story Threads] 對帳(${tag})：拿掉 ${dead.length} 章已不在劇情裡的紀錄`);
        });
    }

    // ── 3. 帳本現況（面板和注入共用）────────────────────────────────────
    async function snapshot(opts) {
        const cid = _chatId();
        if (!cid) return null;
        const data = await _run(async () => { const d = await _load(cid); await _ensureSeed(d); return d; });
        if (!data) return null;
        const co = await _chapterOrder(data);
        const { lines, count, used, lastPos } = _fold(data, co.order, { exclude: opts && opts.exclude, posOf: co.posOf });
        // 「現在」＝最新一章的位置（PWA 用實際章節數，記帳沒跑的章也算時間有在走）
        let nowPos = lastPos;
        try { if (_isStandalone() && co.alive && co.alive.size) nowPos = Math.max(nowPos, co.alive.size - 1); } catch (e) {}
        const latestKey = used.length ? used[used.length - 1] : null;
        const out = { open: [], stale: [], closed: [], picks: data.picks, count, latestKey, site: siteFor(), on: _isOn() };
        lines.forEach((L, key) => {
            const row = { key, label: L.label, fact: L.fact, kind: L.kind || '', pick: data.picks[key]?.s || '' };
            if (L.closed) {
                row.age = nowPos - L.closedAt;
                row.mark = (L.lastKey === latestKey) ? 'closed_now' : '';
                out.closed.push(row);
                return;
            }
            row.age = nowPos - (L.updated != null ? L.updated : L.opened);
            row.mark = (L.lastKey === latestKey) ? (L.lastAct === 'open' ? 'new' : 'chg') : 'same';
            row.staleAt = (L.kind === 'once') ? CFG.onceStaleAfter : CFG.staleAfter;
            if (row.age >= row.staleAt) out.stale.push(row); else out.open.push(row);
        });
        out.closed.sort((a, b) => a.age - b.age);
        // 挑過、但帳上已經沒有這條（章節被刪光了）→ 留給她取消
        out.orphanPicks = Object.keys(data.picks).filter(k => !lines.has(k)).map(k => ({ key: k, label: data.picks[k].label || k, pick: data.picks[k].s }));
        return out;
    }

    function setPick(key, label, s) {
        return _run(async () => {
            const data = await _load();
            if (!data) return;
            if (!s || (data.picks[key] && data.picks[key].s === s)) delete data.picks[key];
            else data.picks[key] = { s, label: _labelOf(label) || key };
            await _save();
        });
    }

    // ── 💗 主角對他：想靠近／疏遠（劇情裡雙擊立繪那張角色卡上的三選一）──────────────
    //   10-07 她：想攻略的人 AI 常常找不到、或把他當路人；也想讓 AI 知道主角對誰有好感、對誰好感在掉。
    //   存在這本帳（每個故事一份），送出時接在〈線索帳〉裡，不另開一塊。線索帳關掉也照送：這是她親手挑的。
    //   near＝想靠近（可攻略），far＝疏遠，沒有＝普通。鑰匙簡繁折成一把（狀態裡「赵亦乾」、立繪名可能是「趙亦乾」）。
    function _leanKey(name) {
        const n = String(name == null ? '' : name).trim();
        try { if (n && win.OS_ZH?.key) return win.OS_ZH.key(n); } catch (e) {}
        return n.toLowerCase();
    }
    async function getLean(name) {
        const d = await _run(() => _load());
        const v = d && d.lean && d.lean[_leanKey(name)];
        return (v && v.s) || '';
    }
    // 回 true＝存好了；false＝沒有故事可存、或存檔失敗（呼叫端要讓她看到）
    function setLean(name, s) {
        return _run(async () => {
            const d = await _load();
            const k = _leanKey(name);
            if (!d || !k) return false;
            if (s === 'near' || s === 'far') d.lean[k] = { s, name: String(name).trim() };
            else delete d.lean[k];
            return _save();
        });
    }
    async function leanList() {
        const d = await _run(() => _load());
        const out = { near: [], far: [] };
        Object.keys((d && d.lean) || {}).forEach(k => { const v = d.lean[k]; if (v && out[v.s]) out[v.s].push(v.name); });
        return out;
    }
    async function _leanText() {
        const L = await leanList();
        const parts = [];
        if (L.near.length) parts.push(`主角想靠近的人：${L.near.join('、')}\n玩家（螢幕前的人，不是主角）想跟這幾個人走感情線，主角對他們也有好感。讓他們照自己的日子過、在合理的場合出現在主角身邊，給主角接得住的機會；別讓他們消失，也別寫成只路過一次的人。關係怎麼走、走多快，照兩人之間實際發生過的事。`);
        if (L.far.length) parts.push(`主角在疏遠的人：${L.far.join('、')}\n主角對這幾個人的好感在往下掉。寫到主角跟他們的互動時照這個心意；他們怎麼反應，照他們自己的個性。`);
        return parts.join('\n\n');
    }

    // 送給寫正文的那一塊（不含外框標籤；酒館 injectPrompts 會照 NAMES 包成 <線索帳>，PWA 自己叫 wrap）
    async function buildText(opts) {
        try {
            const parts = [];
            const s = _isOn() ? await snapshot(opts) : null;
            if (s) {
                const want = [], hold = [], facts = [];
                const all = s.open.concat(s.stale);
                all.forEach(r => {
                    if (r.pick === 'hold') { hold.push(r.label); return; }
                    if (r.pick === 'want') want.push(r.label + (r.kind ? '（' + _kindName(r.kind) + '）' : ''));
                    if (r.age < r.staleAt || r.pick === 'want') facts.push(`【${r.label}】${r.fact || '（沒有記下現況）'}`);
                });
                const closed = s.closed.filter(r => r.age < CFG.closedNameFor).map(r => r.label);
                if (facts.length) {
                    parts.push('這個故事裡已經發生、還沒有下文的事。這是背景紀錄，不是這一章非處理不可的清單：碰不碰、碰哪一條，照這一章的場面自然決定；沒碰到的線，線裡的人照樣在過自己的日子。');
                    parts.push(facts.join('\n'));
                }
                if (want.length) parts.push(`玩家想看的線：${want.join('、')}\n玩家（螢幕前的人，不是主角）想看這幾條往下走。讓線裡的人照自己的打算行動，出現在主角身邊、把事情往前推一步，給主角一個可以接的機會。主角接不接、怎麼接，照主角自己的個性，不替主角決定。`);
                if (hold.length) parts.push(`先放著的線：${hold.join('、')}\n這段時間線裡的人不主動來找主角，旁人也別聊起。`);
                if (closed.length) parts.push(`已經收場：${closed.join('、')}\n這些事已經過去了，這一章不要再提，也別讓誰再聊起。`);
            }
            const lean = await _leanText();
            if (lean) parts.push(lean);
            return parts.join('\n\n');
        } catch (e) {
            console.warn('[Story Threads] 組注入文字失敗:', e?.message || e);
            return '';
        }
    }
    // PWA：包好外框直接用
    async function buildBlock() {
        const t = await buildText();
        if (!t) return '';
        const B = win.AURELIA_BLOCK;
        return B ? B.wrap(INJECT_ID, t) : ('<線索帳>\n' + t + '\n</線索帳>');
    }

    // ── 4. 酒館注入 ───────────────────────────────────────────────────
    let _lastUninject = null;
    // 酒館版之前那張「⑦伏笔圖譜」正則挑的線，搬進這本帳，並拿掉它自己那份注入（不拿掉會送兩次，而且永遠停在舊的）
    async function _migrateRegexPicks() {
        try {
            const ctx = win.SillyTavern?.getContext?.();
            const meta = ctx?.chatMetadata;
            if (!meta) return;
            const old = meta.fb_line_picks;
            const hasInject = !!(meta.script_injects && meta.script_injects.fb_lines);
            if (!old && !hasInject) return;
            const data = await _run(() => _load());
            if (!data || !Object.keys(data.deltas).length) return;   // 帳還沒開始記（還在用 Ako 伏笔）→ 先別動她的正則
            if (old && typeof old === 'object') {
                Object.keys(old).forEach(k => {
                    const p = old[k];
                    if (!p || !p.s) return;
                    const key = _keyOf(p.label || k);
                    if (key && !data.picks[key]) data.picks[key] = { s: p.s, label: _labelOf(p.label || k) };
                });
                await _run(_save);
            }
            delete meta.fb_line_picks;
            if (meta.script_injects) delete meta.script_injects.fb_lines;
            try { ctx.setExtensionPrompt('script_inject_fb_lines', '', 1, 1, false, 0); } catch (e) {}
            try { if (ctx.saveMetadataDebounced) ctx.saveMetadataDebounced(); else if (ctx.saveMetadata) ctx.saveMetadata(); } catch (e) {}
            console.log('🧵 [Story Threads] 已把伏筆圖譜正則挑的線搬進線索帳，舊的那份注入拿掉了');
        } catch (e) { console.warn('[Story Threads] 搬舊挑線失敗:', e?.message || e); }
    }

    async function _inject(type) {
        try {
            try { _lastUninject?.(); } catch (e) {}
            _lastUninject = null;
            if (!win.TavernHelper?.injectPrompts || _isStandalone()) return;
            await _migrateRegexPicks();
            // swipe／繼續：最後一樓正在被重寫，它自己記下的變化不能拿來當「之前發生的事」
            let exclude = null;
            if (type === 'swipe' || type === 'continue') {
                try {
                    const last = await win.TavernHelper.getChatMessages?.(-1);
                    const id = last && last[0] ? String(last[0].message_id ?? last[0].id ?? '') : '';
                    if (id) exclude = new Set([id]);
                } catch (e) {}
            }
            const content = await buildText({ exclude });
            if (!content) return;
            const r = win.TavernHelper.injectPrompts([{ id: INJECT_ID, content, position: 'in_chat', depth: 1, role: 'system' }], { once: true });
            _lastUninject = r?.uninject || null;
        } catch (e) { console.warn('[Story Threads] 注入失敗:', e?.message || e); }
    }

    const WAIT_MS = 2500;
    function _waitFor(fn) { return Promise.race([Promise.resolve().then(fn).catch(function () {}), new Promise(function (r) { setTimeout(r, WAIT_MS); })]); }

    function init() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(init, 1000); return; }
        const ev = win.tavern_events;
        if (ev.GENERATION_STARTED) win.eventOn(ev.GENERATION_STARTED, (type, opts, dryRun) => {
            if (dryRun) return;
            if (win.__AURELIA_SUMMARIZING) return;
            return _waitFor(() => _inject(type));
        });
        if (ev.CHAT_CHANGED) win.eventOn(ev.CHAT_CHANGED, () => {
            try { _lastUninject?.(); } catch (e) {}
            _lastUninject = null; _cache = null; _cacheChat = '';
            _closePanel();
        });
        if (ev.MESSAGE_DELETED) win.eventOn(ev.MESSAGE_DELETED, () => {
            if (_isStandalone() || win.__AURELIA_SUMMARIZING) return;
            setTimeout(() => reconcile('刪樓'), 400);
        });
        console.log('🧵 [Story Threads] Ready');
    }

    // ── 5. 面板：劇情末尾「線索」 ─────────────────────────────────────
    const HELP = {
        threads_what: { title: '線索', body: '副模型每寫完一章就記一次：這章新冒出來、還沒有下文的事，哪一條有了進展，哪一條收場了。還沒下文的線每一輪都會交給寫正文的 AI 參考；收場的線會點名「已經過去了」，不再被拿出來演。\n\n要打開「劇情記憶」或「狀態面板」其中一個才會記，記帳是搭那一通順便做的，不會另外多叫一次模型。\n\n刪掉或重新生成某一章，那一章記下的變化也會一起拿掉。\n\n每條線旁邊的小標籤是這條線往下走的方向，副模型開線時判斷的：一次性、人情、感情、麻煩、謎團、機會。一次性的小事辦完就收場，不會再被翻出來演。方向只給你參考，不會叫寫正文的 AI 照著寫；你按「想看」的線，才會告訴它想往哪個方向走。' },
        threads_pick: { title: '想看／先放著', body: '想看：讓這條線自己找上門。線裡的人照自己的打算出現在主角身邊、把事情往前推一步；主角接不接、怎麼接，照主角自己的個性，不替他決定。\n\n先放著：這段時間線裡的人不主動來找主角，旁人也別聊起。\n\n選了會一直有效，再按一次取消。' },
        threads_stale: { title: '很久沒動', body: '十章以上沒有進展的線（一次性的小事是三章），不再每一輪交給 AI，免得它覺得非處理不可。帳上還留著，劇情自己回頭碰到時會接上；按「想看」也會重新交出去。' }
    };
    let _helpReg = false;
    function _regHelp() {
        if (_helpReg) return;
        const A = win.AUI || window.AUI;
        if (A && A.registerHelp) { A.registerHelp(HELP); _helpReg = true; }
    }
    function _help(k) { const A = win.AUI || window.AUI; return (A && A.helpBtn) ? A.helpBtn(k) : ''; }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    let _panel = null, _sel = null, _ro = null;
    function _host() {
        const end = document.getElementById('vn-end-overlay');
        return (end && end.parentElement) || document.body;
    }
    function _closePanel() {
        try { _ro?.disconnect(); } catch (e) {}
        _ro = null;
        if (_panel) { try { _panel.remove(); } catch (e) {} }
        _panel = null; _sel = null;
    }

    async function openPanel() {
        _regHelp();
        _closePanel();
        const el = document.createElement('div');
        el.id = 'vn-threads-overlay';
        el.innerHTML = `
            <div class="sthr-head">
                <button type="button" class="sthr-back" aria-label="返回"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="sthr-title">線索 ${_help('threads_what')}</div>
                <label class="sthr-switch"><input type="checkbox" class="sthr-on"><span>每章記一次</span></label>
            </div>
            <div class="sthr-body"><div class="sthr-loading">讀取中…</div></div>`;
        _host().appendChild(el);
        _panel = el;
        el.querySelector('.sthr-back').addEventListener('click', _closePanel);
        const sw = el.querySelector('.sthr-on');
        sw.checked = _isOn();
        sw.addEventListener('change', () => { _setOn(sw.checked); _render(); });
        requestAnimationFrame(() => el.classList.add('active'));
        await _render();
    }

    async function _render() {
        if (!_panel) return;
        const body = _panel.querySelector('.sthr-body');
        let s = null;
        try { s = await snapshot(); } catch (e) {}
        if (!_panel) return;
        if (!s) { body.innerHTML = '<div class="sthr-empty">這裡要在劇情裡打開才看得到。</div>'; return; }

        const total = s.open.length + s.stale.length;
        if (!total && !s.closed.length && !s.orphanPicks.length) {
            let why = '寫完下一章就會開始記。';
            if (!s.on) why = '記帳現在是關的，打開右上角「每章記一次」就會開始記。';
            else if (!s.site) why = '要打開「劇情記憶」或「狀態面板」其中一個才會記：記帳是搭那一通順便做的。';
            body.innerHTML = `<div class="sthr-empty"><i class="fa-solid fa-diagram-project"></i><div>還沒有記下任何線索</div><div class="sthr-empty-sub">${_esc(why)}</div></div>`;
            return;
        }

        const cnt = { want: 0, hold: 0 };
        s.open.concat(s.stale).forEach(r => { if (r.pick) cnt[r.pick] = (cnt[r.pick] || 0) + 1; });
        const chips = [`還沒下文 ${total}`];
        const nNew = s.open.filter(r => r.mark === 'new').length, nChg = s.open.filter(r => r.mark === 'chg').length;
        const nClosedNow = s.closed.filter(r => r.mark === 'closed_now').length;
        if (nNew) chips.push(`這章新線 ${nNew}`);
        if (nChg) chips.push(`這章有變化 ${nChg}`);
        if (nClosedNow) chips.push(`這章收場 ${nClosedNow}`);
        if (cnt.want) chips.push(`想看 ${cnt.want}`);
        if (cnt.hold) chips.push(`先放著 ${cnt.hold}`);

        body.innerHTML = `
            <div class="sthr-sum">${chips.map(c => `<span>${_esc(c)}</span>`).join('')}</div>
            ${s.open.length ? '<div class="sthr-graph"></div>' : ''}
            <div class="sthr-list"></div>`;
        const list = body.querySelector('.sthr-list');
        const MARK = { new: ['sthr-c-new', '新線'], chg: ['sthr-c-chg', '有變化'], closed_now: ['sthr-c-gone', '這章收場'] };

        const row = (r, kind) => {
            const d = document.createElement('div');
            d.className = 'sthr-row' + (kind ? ' sthr-' + kind : '') + (r.pick ? ' sthr-pk-' + r.pick : '');
            d.dataset.key = r.key;
            const m = MARK[r.mark];
            const pickable = kind !== 'closed';
            d.innerHTML = `
                <div class="sthr-row-top">
                    ${m ? `<span class="sthr-chip ${m[0]}">${m[1]}</span>` : ''}
                    <span class="sthr-lb${r.kind ? ' sthr-lb-k' : ''}">${_esc(r.label)}</span>
                    ${r.kind ? `<span class="sthr-kd sthr-k-${r.kind}">${_esc(_kindName(r.kind))}</span>` : ''}
                    ${pickable ? `<span class="sthr-pk">
                        <button type="button" class="sthr-pkb sthr-pk-want${r.pick === 'want' ? ' on' : ''}" data-s="want">想看</button>
                        <button type="button" class="sthr-pkb sthr-pk-hold${r.pick === 'hold' ? ' on' : ''}" data-s="hold">先放著</button>
                    </span>` : ''}
                </div>
                ${r.fact ? `<div class="sthr-tx">${_esc(r.fact)}</div>` : ''}`;
            d.querySelectorAll('.sthr-pkb').forEach(b => b.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                await setPick(r.key, r.label, b.dataset.s);
                _render();
            }));
            if (kind === '' || kind === 'stale') d.addEventListener('click', () => { _sel = (_sel === r.key) ? null : r.key; _paint(); });
            return d;
        };
        const section = (title, helpKey) => {
            const h = document.createElement('div');
            h.className = 'sthr-sec';
            h.innerHTML = _esc(title) + (helpKey ? ' ' + _help(helpKey) : '');
            list.appendChild(h);
        };

        if (s.open.length) {
            section('還沒有下文', 'threads_pick');
            s.open.slice().sort((a, b) => a.age - b.age).forEach(r => list.appendChild(row(r, '')));
        }
        if (s.stale.length) {
            section('很久沒動', 'threads_stale');
            s.stale.slice().sort((a, b) => a.age - b.age).forEach(r => list.appendChild(row(r, 'stale')));
        }
        if (s.orphanPicks.length) {
            section('挑過、但帳上已經沒有', '');
            s.orphanPicks.forEach(r => list.appendChild(row({ key: r.key, label: r.label, fact: '', pick: r.pick }, 'stale')));
        }
        if (s.closed.length) {
            section('已經收場', '');
            s.closed.slice(0, 30).forEach(r => list.appendChild(row(r, 'closed')));
        }

        if (s.open.length) {
            _graphData = await _buildGraphData(s.open);
            _drawGraph();
            const g = body.querySelector('.sthr-graph');
            let lastW = 0;
            try { _ro = new ResizeObserver(() => { const w = Math.round(g.clientWidth); if (w && Math.abs(w - lastW) > 8) { lastW = w; _drawGraph(); } }); _ro.observe(g); } catch (e) {}
        }
        _paint();
    }

    // ── 圖譜：線是節點；線裡提到別條線的主人＝兩條線連起來；誰的線都不是的人掛在外圈 ──
    let _graphData = null;
    async function _knownNames() {
        const names = {};
        try {
            const st = win._AVS_ENGINE?.read?.();
            const box = st && (st['角色状态'] || st['角色狀態']);
            if (box && typeof box === 'object') Object.keys(box).forEach(n => { if (n) names[n] = 1; });
        } catch (e) {}
        try {
            const d = await win.OS_NPC_DOSSIER?.dump?.();
            if (d && d.dossiers) Object.keys(d.dossiers).forEach(n => { names[n] = 1; });
        } catch (e) {}
        return names;
    }
    function _mcName() {
        try { const n = String(win.SillyTavern?.getContext?.()?.name1 || '').trim(); if (n && n !== 'User') return n; } catch (e) {}
        try { return String(win.OS_API?.getGlobalUserName?.() || '').trim(); } catch (e) { return ''; }
    }
    async function _buildGraphData(open) {
        const mc = _mcName();
        const names = await _knownNames();
        const lines = open.map(r => ({ key: r.key, label: r.label, text: r.fact || '', mark: r.mark, pick: r.pick }));
        lines.forEach(L => {
            L.owners = L.label.replace(/[线線]$/, '').split(/[与和、&＆及跟]/).map(x => x.trim()).filter(x => x.length >= 2);
            L.owners.forEach(n => { names[n] = 1; });
        });
        if (mc) names[mc] = 1;
        // 三個字的中文名另認後兩個字；兩個人撞同一個簡稱就都不認
        const alias = {}, bad = {};
        Object.keys(names).forEach(n => { alias[n] = n; });
        Object.keys(names).forEach(n => {
            if (n.length === 3 && /^[一-鿿]+$/.test(n)) {
                const a = n.slice(1);
                if (names[a] && a !== n) return;
                if (alias[a] && alias[a] !== n) bad[a] = 1; else alias[a] = n;
            }
        });
        Object.keys(bad).forEach(a => { delete alias[a]; });
        const aliasKeys = Object.keys(alias).sort((a, b) => b.length - a.length);
        const who = (s) => { const hit = {}; aliasKeys.forEach(a => { if (String(s).indexOf(a) >= 0) hit[alias[a]] = 1; }); return Object.keys(hit); };
        const ownerOf = {};
        lines.forEach((L, i) => L.owners.forEach(o => { (ownerOf[o] = ownerOf[o] || []).push(i); }));
        const links = {};
        lines.forEach((L, i) => {
            const ps = who(L.label + '｜' + L.text);
            L.mcIn = !!mc && ps.indexOf(mc) >= 0;
            L.people = [];
            ps.forEach(p => {
                if (p === mc || L.owners.indexOf(p) >= 0) return;
                if (ownerOf[p]) ownerOf[p].forEach(j => { if (j !== i) { const a = Math.min(i, j), b = Math.max(i, j); links[a + '-' + b] = [a, b]; } });
                else L.people.push(p);
            });
        });
        const people = {};
        lines.forEach((L, i) => L.people.forEach(p => { (people[p] = people[p] || []).push(i); }));
        return { mc, lines, links: Object.keys(links).map(k => links[k]), people };
    }

    const NS = 'http://www.w3.org/2000/svg';
    function _svg(t, a, p) { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
    function _tw(s, fs) { let w = 0; for (let i = 0; i < s.length; i++) w += /[\x00-\xff]/.test(s.charAt(i)) ? fs * 0.58 : fs; return w; }
    let _nodes = [];
    function _drawGraph() {
        if (!_panel || !_graphData) return;
        const graph = _panel.querySelector('.sthr-graph');
        if (!graph) return;
        const { mc, lines, links, people } = _graphData;
        const pNames = Object.keys(people);
        const W = Math.max(300, Math.round(graph.clientWidth || 600));
        // 沒有外圈的人就不用留那一圈的位置（圖會空一大塊）
        const H = Math.round(W < 520 ? W * (pNames.length ? 1.02 : 0.72) : Math.min(W * (pNames.length ? 0.66 : 0.5), 480));
        graph.innerHTML = ''; _nodes = [];
        const svg = _svg('svg', { viewBox: '0 0 ' + W + ' ' + H }, graph);
        const cx = W / 2, cy = H / 2, rx1 = W * 0.27, ry1 = H * 0.27, rx2 = W * 0.42, ry2 = H * 0.41;
        const n = lines.length, la = [];
        lines.forEach((L, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; la.push(a); L.x = cx + rx1 * Math.cos(a); L.y = cy + ry1 * Math.sin(a); });
        const ps = pNames.map(p => { let sx = 0, sy = 0; people[p].forEach(i => { sx += Math.cos(la[i]); sy += Math.sin(la[i]); }); return { n: p, a: (sx || sy) ? Math.atan2(sy, sx) : 0 }; });
        ps.sort((a, b) => a.a - b.a);
        const gap = Math.min(0.5, 2 * Math.PI / Math.max(ps.length, 1));
        for (let it = 0; it < 60 && ps.length > 1; it++) {
            for (let j = 0; j < ps.length; j++) {
                const A = ps[j], B = ps[(j + 1) % ps.length];
                let d = B.a - A.a; if (j === ps.length - 1) d += 2 * Math.PI;
                if (d < gap) { const push = (gap - d) / 2; A.a -= push; B.a += push; }
            }
        }
        const clampX = (x, w) => Math.max(w / 2 + 3, Math.min(W - w / 2 - 3, x));
        const clampY = (y) => Math.max(14, Math.min(H - 14, y));
        const boxes = []; if (mc) boxes.push({ x: cx, y: cy, w: _tw(mc, 13) + 20, h: 26 });
        lines.forEach(L => { const w = _tw(L.label, 12) + 18; boxes.push({ x: clampX(L.x, w), y: clampY(L.y), w, h: 24 }); });
        const pPos = {};
        ps.forEach(P => {
            const w = _tw(P.n, 11.5) + 14, h = 21;
            const b = { x: clampX(cx + rx2 * Math.cos(P.a), w), y: clampY(cy + ry2 * Math.sin(P.a)), w, h };
            for (let k = 0; k < 24; k++) {
                let hit = null;
                for (const o of boxes) { if (Math.abs(b.x - o.x) < (b.w + o.w) / 2 + 4 && Math.abs(b.y - o.y) < (b.h + o.h) / 2 + 3) { hit = o; break; } }
                if (!hit) break;
                let dir = (b.y >= hit.y ? 1 : -1);
                if ((dir > 0 && b.y > H - 24) || (dir < 0 && b.y < 24)) dir = -dir;
                b.y = clampY(hit.y + dir * ((b.h + hit.h) / 2 + 4));
            }
            boxes.push(b); pPos[P.n] = { x: b.x, y: b.y };
        });
        const gE = _svg('g', {}, svg), gN = _svg('g', {}, svg);
        const node = (cls, x, y, w, h, label) => {
            const g = _svg('g', { 'class': cls, transform: 'translate(' + x + ',' + y + ')' }, gN);
            _svg('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: h / 2 }, g);
            const t = _svg('text', { x: 0, y: 0.5 }, g); t.textContent = label;
            const o = { g }; _nodes.push(o); return o;
        };
        if (mc) { const o = node('sthr-nd sthr-n-mc', cx, cy, _tw(mc, 13) + 20, 26, mc); o.kind = 'mc'; }
        lines.forEach((L, i) => {
            const w = _tw(L.label, 12) + 18, x = clampX(L.x, w), y = clampY(L.y); L.x = x; L.y = y;
            if (L.mcIn && mc) { const e = _svg('line', { x1: cx, y1: cy, x2: x, y2: y, 'class': 'sthr-e sthr-e-mc' }, gE); e.dataset.l = i; }
            L.people.forEach(p => { const q = pPos[p]; const pw = _tw(p, 11.5) + 14; const e = _svg('line', { x1: x, y1: y, x2: clampX(q.x, pw), y2: clampY(q.y), 'class': 'sthr-e' }, gE); e.dataset.l = i; e.dataset.p = p; });
            const o = node('sthr-nd sthr-n-line' + (L.mark ? ' sthr-st-' + L.mark : '') + (L.pick ? ' sthr-pk-' + L.pick : ''), x, y, w, 24, L.label);
            o.kind = 'line'; o.key = L.key; o.i = i;
            o.g.addEventListener('click', (ev) => { ev.stopPropagation(); _sel = (_sel === L.key) ? null : L.key; _paint(); });
        });
        links.forEach(k => {
            const A = lines[k[0]], B = lines[k[1]];
            const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, qx = mx + (cx - mx) * 0.35, qy = my + (cy - my) * 0.35;
            const e = _svg('path', { d: 'M' + A.x + ',' + A.y + ' Q' + qx + ',' + qy + ' ' + B.x + ',' + B.y, 'class': 'sthr-e sthr-e-ll' }, gE);
            e.dataset.a = k[0]; e.dataset.b = k[1]; gE.insertBefore(e, gE.firstChild);
        });
        pNames.forEach(p => {
            const q = pPos[p]; const pw = _tw(p, 11.5) + 14;
            const o = node('sthr-nd sthr-n-p', clampX(q.x, pw), clampY(q.y), pw, 21, p); o.kind = 'p'; o.n = p;
            o.g.addEventListener('click', (ev) => { ev.stopPropagation(); _sel = (_sel === '@' + p) ? null : '@' + p; _paint(); });
        });
        svg.addEventListener('click', () => { _sel = null; _paint(); });
        _paint();
    }
    function _paint() {
        if (!_panel) return;
        const gd = _graphData;
        const idxOf = (key) => gd ? gd.lines.findIndex(L => L.key === key) : -1;
        const linked = (a, b) => gd && gd.links.some(k => (k[0] === a && k[1] === b) || (k[0] === b && k[1] === a));
        const selLine = _sel && _sel[0] !== '@' ? idxOf(_sel) : -1;
        const selP = _sel && _sel[0] === '@' ? _sel.slice(1) : '';
        const lineOn = (i) => {
            if (!_sel) return true;
            if (selLine >= 0) return selLine === i || linked(selLine, i);
            if (selP) return gd.lines[i].people.indexOf(selP) >= 0;
            return true;
        };
        if (gd) {
            const litP = {};
            gd.lines.forEach((L, i) => { if (lineOn(i)) L.people.forEach(p => { litP[p] = 1; }); });
            _nodes.forEach(o => {
                let on = true, me = false;
                if (o.kind === 'line') { on = lineOn(o.i); me = selLine === o.i; }
                else if (o.kind === 'p') { on = !_sel || !!litP[o.n]; me = selP === o.n; }
                else if (o.kind === 'mc') { on = !_sel || gd.lines.some((L, i) => lineOn(i) && L.mcIn); }
                o.g.classList.toggle('sthr-dim', !on); o.g.classList.toggle('sthr-sel', me);
            });
            _panel.querySelectorAll('line.sthr-e').forEach(e => {
                const i = +e.dataset.l;
                const on = !_sel || (selLine >= 0 ? selLine === i : e.dataset.p === selP);
                e.classList.toggle('sthr-dim', !on);
            });
            _panel.querySelectorAll('path.sthr-e-ll').forEach(e => {
                const a = +e.dataset.a, b = +e.dataset.b;
                e.classList.toggle('sthr-dim', !(!_sel || (selLine >= 0 && (selLine === a || selLine === b))));
            });
        }
        _panel.querySelectorAll('.sthr-row').forEach(r => {
            if (r.classList.contains('sthr-closed')) return;
            const i = idxOf(r.dataset.key);
            const on = i < 0 ? !_sel : lineOn(i);
            r.classList.toggle('sthr-dim', !!_sel && !on);
            r.classList.toggle('sthr-sel', !!_sel && (_sel === r.dataset.key || (selP && on && i >= 0)));
        });
    }

    // PWA：章節存好 → 事件晚一點再畫（面板開著時刷新）
    win.addEventListener('aurelia:story-threads', () => { if (_panel) _render(); });

    win.OS_STORY_THREADS = {
        siteFor, addendum, commit, reconcile, snapshot, setPick, buildText, buildBlock,
        getLean, setLean, leanList,
        openPanel, closePanel: _closePanel,
        isOn: _isOn, setOn: _setOn,
        INJECT_ID, CFG,
        // 診斷：印出目前帳本
        dump: async () => { const s = await snapshot(); console.table((s?.open || []).concat(s?.stale || [])); return s; }
    };
    if (win !== window) window.OS_STORY_THREADS = win.OS_STORY_THREADS;

    init();
})();
