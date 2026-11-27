// ----------------------------------------------------------------
// [檔案] os_chat_tidy.js
// 路徑：os_phone/os/os_chat_tidy.js
// 職責：聊天記錄整理頁（只有酒館版）。把每張卡底下的酒館聊天列出來，標出哪些進過日誌、哪些很短、
//       各佔幾張圖；勾選後一次刪掉「酒館的聊天檔＋奧瑞亞綁在那條聊天上的所有資料（含圖）」。
//       最上面另有一塊：聊天已經不在酒館了、但圖還留著的，一鍵清掉。
// 為什麼要有：日誌的清單只列總結過的故事；測試用、玩一下就丟的聊天從來不進日誌，
//       它們生的頭像／背景／插圖沒有任何地方刪得到。在酒館自己的聊天記錄窗口刪聊天，圖也不會跟著走。
// 依賴：SillyTavern.getContext()、VN_Cache（getAllMeta / deleteByWorld）、OS_DB（deleteAllByChatId）、AUI
// 暴露：window.OS_CHAT_TIDY = { open(opts), close(), available() }
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const doc = win.document || document;
    const IMG_STORES = ['bg_cache', 'avatar_cache', 'item_cache', 'scene_cache', 'sprite_cache'];
    const SHORT_MAX = 10;                       // 幾樓以下算「很短」
    const KEEP_WORLDS = { '': 1, 'lobby_default': 1, '__lobby__': 1 };   // 不屬於任何酒館聊天的圖，永遠不當遺留

    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    // 跟 VN_Cache.deleteByWorld、OS_STORY_TOOLS.getChatId 同一種正規化：只留檔名、去副檔名、空白換底線
    const norm = w => !w ? '' : String(w).split(/[\\/]/).pop().replace(/\.jsonl?$/i, '').trim().replace(/\s+/g, '_');
    const stCtx = () => { try { return win.SillyTavern && win.SillyTavern.getContext && win.SillyTavern.getContext() || null; } catch (e) { return null; } };
    const AUI = () => win.AUI || window.AUI;
    function available() { const c = stCtx(); return !!(c && typeof c.getRequestHeaders === 'function' && Array.isArray(c.characters)); }

    async function stPost(path, body) {
        const ctx = stCtx();
        const f = win.fetch || fetch;
        const resp = await f(path, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) });
        if (!resp.ok) throw new Error(path + ' ' + resp.status);
        return resp.json();
    }

    // ── 把最後一樓的原文變成人看得懂的一句 ──
    // 酒館給的是最後一樓的尾巴，通常整段都是狀態欄與選項的標籤。標籤拿掉、狀態欄整塊丟掉，剩下的才是句子。
    function readable(raw) {
        let t = String(raw || '');
        t = t.replace(/<os_status>[\s\S]*?(<\/os_status>|$)/gi, ' ')
             .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
             .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
             .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        t = t.replace(/^[.…\s]+/, '');
        return t.length > 120 ? t.slice(0, 120) + '…' : t;
    }
    // 酒館的聊天檔名＝「卡名 - 2026-09-18@04h12m44s057ms」→ 拿得到開聊的那一天
    function startedAt(name) {
        const m = /(\d{4})-(\d{1,2})-(\d{1,2})\s*@\s*(\d{1,2})h\s*(\d{1,2})m/.exec(name || '');
        return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : 0;
    }
    function toTime(v) {
        if (!v) return 0;
        if (typeof v === 'number') return v;
        const d = Date.parse(v); if (!isNaN(d)) return d;
        return startedAt(String(v));
    }
    // 畫面上不出現檔名原樣：「卡名 - 2026-09-18@04h12m44s057ms」→「9/18 04:12 開的聊天」（遺留那塊沒有分區，前面帶卡名）
    function niceName(name, withCard) {
        const ts = startedAt(name);
        if (!ts) return String(name || '').replace(/_/g, ' ');
        const d = new Date(ts), p2 = n => (n < 10 ? '0' : '') + n;
        const when = dayText(ts) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ' 開的聊天';
        const card = String(name).replace(/[\s_]*-?[\s_]*\d{4}-\d{1,2}-\d{1,2}[\s_]*@.*$/, '').replace(/_/g, ' ').trim();
        return (withCard && card) ? card + '　' + when : when;
    }
    function dayText(ts) { if (!ts) return ''; const d = new Date(ts); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); }
    function sizeText(v) {
        if (typeof v === 'string' && v) return v;
        const n = +v || 0; if (!n) return '';
        return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
    }

    // ── 讀資料 ──
    // 每個世界（＝哪條聊天生的）各有幾張圖。只看鑰匙與小帳，不讀任何一張圖。
    async function imageCounts() {
        const C = win.VN_Cache || window.VN_Cache;
        const byWorld = new Map();   // 正規化世界 → { n, raws:Set(原本的世界寫法) }
        if (!C || !C.getAllMeta) return byWorld;
        for (const store of IMG_STORES) {
            const all = await C.getAllMeta(store, { partial: true });
            for (const e of all) {
                const raw = C.worldOf(e) || '';
                const k = norm(raw);
                let rec = byWorld.get(k); if (!rec) byWorld.set(k, rec = { n: 0, raws: new Set() });
                rec.n++; rec.raws.add(raw);
            }
        }
        return byWorld;
    }
    async function journalIndex() {
        const map = new Map();
        try {
            const D = win.OS_DB || window.OS_DB;
            const all = (D && D.getAllLobbySummaryIndex) ? await D.getAllLobbySummaryIndex() : [];
            for (const e of all) { const k = norm(e.chatId); if (k && !map.has(k)) map.set(k, e); }   // 已照時間新到舊排好，留最新那筆
        } catch (e) {}
        return map;
    }
    async function loadAll(onStep) {
        const ctx = stCtx();
        const chars = (ctx.characters || []).filter(c => c && c.avatar);
        const cur = norm(ctx.chatId);
        const [imgs, jr] = await Promise.all([imageCounts(), journalIndex()]);
        const cards = [], exist = new Set(); let failed = 0;
        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            if (onStep) onStep(i + 1, chars.length);
            let rows = null;
            try { rows = await stPost('/api/chats/search', { query: '', avatar_url: ch.avatar, group_id: null }); } catch (e) { rows = null; }
            if (!Array.isArray(rows)) { failed++; continue; }
            const chats = rows.map(r => {
                const name = String(r.file_name || r.file_id || '').replace(/\.jsonl?$/i, '');
                const key = norm(name); exist.add(key);
                const j = jr.get(key) || null;
                return {
                    avatar: ch.avatar, name, key, isCur: key === cur,
                    count: +r.message_count || +r.chat_items || 0,
                    size: sizeText(r.file_size), last: toTime(r.last_mes) || startedAt(name), start: startedAt(name),
                    text: readable(r.preview_message || r.mes), journal: j,
                    images: (imgs.get(key) || { n: 0 }).n
                };
            }).filter(c => c.name).sort((a, b) => b.last - a.last);
            if (chats.length) cards.push({ name: ch.name || ch.avatar, avatar: ch.avatar, chats });
        }
        // 群聊的聊天也算「還在」，不然它們的圖會被當成遺留
        (ctx.groups || []).forEach(g => { (g && g.chats || []).forEach(id => exist.add(norm(id))); if (g && g.chat_id) exist.add(norm(g.chat_id)); });
        // 對帳：清單的檔名寫法要是跟圖庫記的對不起來（酒館改了回傳格式之類），每條聊天都會被誤判成「不在了」。
        //   ① 現在開著的這條聊天一定要在清單裡找得到（找到了＝寫法對得上，這樣就夠）
        //   ② 沒開著聊天、沒得對的時候：圖庫裡有聊天的圖，就至少要有一條對得上
        const curListed = !cur || exist.has(cur) || !!ctx.groupId;
        const proven = !!cur && exist.has(cur);
        let matched = 0, chatWorlds = 0;
        imgs.forEach((rec, k) => { if (KEEP_WORLDS[k]) return; chatWorlds++; if (exist.has(k)) matched++; });
        const lined = curListed && (proven || chatWorlds === 0 || matched > 0);
        if (cur) exist.add(cur);
        cards.sort((a, b) => b.chats.length - a.chats.length);

        const orphans = [];
        imgs.forEach((rec, k) => { if (!KEEP_WORLDS[k] && !exist.has(k)) orphans.push({ key: k, raws: Array.from(rec.raws), images: rec.n, journal: jr.get(k) || null }); });
        orphans.sort((a, b) => b.images - a.images);
        // 任何一張卡的聊天清單讀不到，就沒辦法肯定「這條聊天真的不在了」→ 這次不給清
        const sure = failed === 0 && chars.length > 0 && exist.size > 0 && lined;
        return { cards, orphans, sure, failed, lined };
    }

    // 刪一條聊天綁的所有奧瑞亞資料（含圖）。raws＝這條聊天在圖庫裡出現過的世界寫法
    async function wipeAurelia(key, raws, journal) {
        const D = win.OS_DB || window.OS_DB, C = win.VN_Cache || window.VN_Cache;
        let storyId = '', rawChatId = '';
        try { const rec = D && D.getTavernSummary ? (await D.getTavernSummary(key)) : null; if (rec) { storyId = rec.storyId || ''; rawChatId = rec.rawChatId || ''; } } catch (e) {}
        const raw = rawChatId || (raws && raws[0]) || key;
        if (D && D.deleteAllByChatId) await D.deleteAllByChatId(key, { storyId, vnWorld: raw, rawChatId: raw });
        else if (C && C.deleteByWorld) await C.deleteByWorld(raw);
        try { if (journal && win.OS_SUMMARY_INJECT && win.OS_SUMMARY_INJECT.invalidate) win.OS_SUMMARY_INJECT.invalidate(key); } catch (e) {}
    }

    // ================================================================
    // 畫面
    // ================================================================
    let S = null;
    function shown(el) { return !!(el && el.getClientRects().length && el.clientWidth > 0 && el.clientHeight > 0); }
    function pickHost(opts) {
        const from = opts && opts.from;
        if (from && from.closest) { const h = from.closest('#aps-app') || from.closest('#aurelia-phone-screen'); if (h) return h; }
        const shellApp = doc.querySelector('#aurelia-phone-shell #aps-app'); if (shown(shellApp)) return shellApp;
        const scr = doc.getElementById('aurelia-phone-screen'); if (shown(scr)) return scr;
        return null;
    }

    async function open(opts) {
        if (S) close();
        const host = pickHost(opts);
        const root = doc.createElement('div');
        root.className = 'act-root' + (host ? ' act-in-screen' : '');
        root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
        root.innerHTML =
            '<div class="act-head">'
          +   '<button class="act-back" type="button" data-act="close" aria-label="返回"><i class="fa-solid fa-chevron-left"></i></button>'
          +   '<div class="act-title">聊天記錄</div>'
          + '</div>'
          + '<div class="act-body"><div class="act-wait"><i class="fa-solid fa-spinner fa-spin"></i><span class="act-wait-t">正在讀聊天清單</span></div></div>'
          + '<div class="act-bar"></div>';
        (host || doc.body).appendChild(root);
        S = { root, data: null, sel: new Set(), filter: 'all', busy: false };
        root.addEventListener('click', onClick);
        root.addEventListener('change', onChange);
        doc.addEventListener('keydown', onKey, true);
        await reload();
    }
    function close() {
        if (!S) return;
        const st = S; S = null;
        doc.removeEventListener('keydown', onKey, true);
        st.root.remove();
    }
    function onKey(ev) {
        if (ev.key !== 'Escape' || !S || S.busy) return;
        if (doc.querySelector('.aud-mask.on')) return;
        ev.preventDefault(); close();
    }

    async function reload() {
        const st = S; if (!st) return;
        const body = st.root.querySelector('.act-body');
        if (!available()) { body.innerHTML = '<div class="act-empty">這一頁整理的是酒館裡的聊天記錄，要在酒館裡打開才有東西。</div>'; return; }
        const waitT = () => st.root.querySelector('.act-wait-t');
        if (!waitT()) body.innerHTML = '<div class="act-wait"><i class="fa-solid fa-spinner fa-spin"></i><span class="act-wait-t">正在讀聊天清單</span></div>';
        try {
            st.data = await loadAll((i, n) => { const el = waitT(); if (el) el.textContent = '正在讀聊天清單 ' + i + ' / ' + n; });
        } catch (e) {
            if (S === st) body.innerHTML = '<div class="act-empty">聊天清單讀不到：' + esc(e && e.message || e) + '</div>';
            return;
        }
        if (S !== st) return;
        const alive = new Set(); st.data.cards.forEach(c => c.chats.forEach(x => alive.add(x.key)));
        st.sel.forEach(k => { if (!alive.has(k)) st.sel.delete(k); });
        render();
    }

    const FILTERS = [['all', '全部'], ['nojournal', '沒進過日誌'], ['short', '很短'], ['hasimg', '有圖']];
    function pass(c, f) {
        if (f === 'nojournal') return !c.journal;
        if (f === 'short') return c.count <= SHORT_MAX;
        if (f === 'hasimg') return c.images > 0;
        return true;
    }
    function allChats() { const out = []; S.data.cards.forEach(c => c.chats.forEach(x => out.push(x))); return out; }

    function render() {
        const st = S, d = st.data;
        const body = st.root.querySelector('.act-body');
        const keepTop = body.scrollTop;
        const total = allChats();
        let h = '';

        // ① 聊天已經不在了、圖還留著
        h += '<section class="act-orphan">';
        h += '<div class="act-sec-title"><i class="fa-solid fa-ghost"></i>聊天已經刪掉、圖還留著的</div>';
        if (!d.sure) {
            h += '<div class="act-orphan-say">' + (d.failed ? '有 ' + d.failed + ' 張卡的聊天清單這次讀不到，沒辦法確定哪些聊天真的不在了，先不清。'
                                                           : '酒館給的聊天清單跟圖庫記的名字對不起來，怕誤刪，先不清。') + '</div>';
        } else if (!d.orphans.length) {
            h += '<div class="act-orphan-say">沒有。圖庫裡每一張圖的聊天都還在。</div>';
        } else {
            const n = d.orphans.reduce((s, o) => s + o.images, 0);
            h += '<div class="act-orphan-row"><div class="act-orphan-num"><b>' + n + '</b> 張圖<span>來自 ' + d.orphans.length + ' 條已經不在酒館裡的聊天</span></div>'
               + '<button class="act-btn act-danger" type="button" data-act="orphan"><i class="fa-solid fa-broom"></i>全部清掉</button></div>';
            h += '<ul class="act-orphan-list">' + d.orphans.slice(0, 6).map(o =>
                    '<li><span class="act-o-name">' + esc((o.journal && o.journal.storyTitle) || niceName(o.raws[0] || o.key, true)) + '</span><span class="act-o-n">' + o.images + ' 張</span></li>').join('')
               + (d.orphans.length > 6 ? '<li class="act-o-more">還有 ' + (d.orphans.length - 6) + ' 條</li>' : '') + '</ul>';
        }
        h += '</section>';

        // ② 篩選
        h += '<div class="act-filters">' + FILTERS.map(([k, label]) =>
                '<button class="act-chip' + (st.filter === k ? ' on' : '') + '" type="button" data-act="filter" data-f="' + k + '">' + label
              + '<span>' + total.filter(c => pass(c, k)).length + '</span></button>').join('') + '</div>';

        // ③ 一張卡一區
        let shownN = 0;
        d.cards.forEach((card, ci) => {
            const list = card.chats.filter(c => pass(c, st.filter));
            if (!list.length) return;
            shownN += list.length;
            const imgN = list.reduce((s, c) => s + c.images, 0);
            const pickable = list.filter(c => !c.isCur);
            const allOn = pickable.length > 0 && pickable.every(c => st.sel.has(c.key));
            h += '<section class="act-card">'
               + '<div class="act-card-head"><div class="act-card-name">' + esc(card.name) + '</div>'
               + '<div class="act-card-meta">' + list.length + ' 條' + (imgN ? ' · ' + imgN + ' 張圖' : '') + '</div>'
               + (pickable.length ? '<button class="act-link" type="button" data-act="pick-card" data-ci="' + ci + '">' + (allOn ? '取消這一區' : '這一區全選') + '</button>' : '')
               + '</div>';
            list.forEach(c => {
                const title = (c.journal && c.journal.storyTitle) || niceName(c.name);
                const line = (c.journal && c.journal.brief) ? readable(c.journal.brief) : c.text;
                h += '<label class="act-row' + (c.isCur ? ' is-cur' : '') + (st.sel.has(c.key) ? ' on' : '') + '">'
                   + '<input type="checkbox" class="act-check" data-key="' + esc(c.key) + '"' + (st.sel.has(c.key) ? ' checked' : '') + (c.isCur ? ' disabled' : '') + '>'
                   + '<div class="act-row-main">'
                   +   '<div class="act-row-top"><span class="act-row-title">' + esc(title) + '</span>'
                   +     (c.isCur ? '<span class="act-tag cur">正在玩</span>' : '')
                   +     (c.journal ? '<span class="act-tag jr">日誌裡有</span>' : '')
                   +     (c.count <= SHORT_MAX ? '<span class="act-tag short">很短</span>' : '')
                   +   '</div>'
                   +   (line ? '<div class="act-row-text">' + esc(line) + '</div>' : '')
                   +   '<div class="act-row-meta">'
                   +     (c.last ? '<span>最後玩 ' + dayText(c.last) + '</span>' : '')
                   +     '<span>' + c.count + ' 樓</span>'
                   +     (c.size ? '<span>' + esc(c.size) + '</span>' : '')
                   +     '<span class="' + (c.images ? 'act-has-img' : '') + '">' + (c.images ? c.images + ' 張圖' : '沒有圖') + '</span>'
                   +   '</div>'
                   + '</div></label>';
            });
            h += '</section>';
        });
        if (!total.length) h += '<div class="act-empty">酒館裡還沒有任何聊天記錄。</div>';
        else if (!shownN) h += '<div class="act-empty">沒有符合的聊天。</div>';
        body.innerHTML = h;
        body.scrollTop = keepTop;
        renderBar();
    }

    function renderBar(progressText) {
        const st = S, bar = st.root.querySelector('.act-bar');
        const picked = allChats().filter(c => st.sel.has(c.key));
        st.root.classList.toggle('act-has-sel', picked.length > 0 || !!progressText);
        if (progressText) { bar.innerHTML = '<div class="act-bar-say">' + esc(progressText) + '</div>'; return; }
        if (!picked.length) { bar.innerHTML = ''; return; }
        const imgN = picked.reduce((s, c) => s + c.images, 0);
        bar.innerHTML = '<div class="act-bar-say">選了 <b>' + picked.length + '</b> 條' + (imgN ? '，連同 <b>' + imgN + '</b> 張圖' : '') + '</div>'
                      + '<button class="act-btn" type="button" data-act="clear-sel">取消</button>'
                      + '<button class="act-btn act-danger" type="button" data-act="delete"><i class="fa-solid fa-trash-can"></i>刪除</button>';
    }

    function onChange(ev) {
        const cb = ev.target.closest && ev.target.closest('.act-check'); if (!cb || !S || S.busy) return;
        const k = cb.getAttribute('data-key');
        if (cb.checked) S.sel.add(k); else S.sel.delete(k);
        const row = cb.closest('.act-row'); if (row) row.classList.toggle('on', cb.checked);
        render();
    }
    async function onClick(ev) {
        const b = ev.target.closest && ev.target.closest('[data-act]'); if (!b || !S) return;
        const act = b.getAttribute('data-act');
        if (act === 'close') { if (!S.busy) close(); return; }
        if (S.busy) return;
        if (act === 'filter') { S.filter = b.getAttribute('data-f'); render(); return; }
        if (act === 'clear-sel') { S.sel.clear(); render(); return; }
        if (act === 'pick-card') {
            const card = S.data.cards[+b.getAttribute('data-ci')]; if (!card) return;
            const list = card.chats.filter(c => pass(c, S.filter) && !c.isCur);
            const allOn = list.length > 0 && list.every(c => S.sel.has(c.key));
            list.forEach(c => { if (allOn) S.sel.delete(c.key); else S.sel.add(c.key); });
            render(); return;
        }
        if (act === 'orphan') return cleanOrphans();
        if (act === 'delete') return deletePicked();
    }

    async function cleanOrphans() {
        const st = S, list = st.data.orphans.slice();
        if (!st.data.sure || !list.length) return;
        const n = list.reduce((s, o) => s + o.images, 0);
        const ok = await AUI().confirm('這 ' + list.length + ' 條聊天已經不在酒館裡了。\n把它們留下的 ' + n + ' 張圖、以及奧瑞亞替它們存的其他資料全部清掉？\n清掉就拿不回來。');
        if (!ok || S !== st) return;
        st.busy = true;
        for (let i = 0; i < list.length; i++) {
            renderBar('清理中 ' + (i + 1) + ' / ' + list.length);
            try { for (const raw of list[i].raws) await wipeAurelia(list[i].key, [raw], list[i].journal); } catch (e) { console.error('[OS_CHAT_TIDY] 清遺留失敗', list[i].key, e); }
            if (S !== st) return;
        }
        st.busy = false;
        try { AUI().toast && AUI().toast('清掉了 ' + n + ' 張圖', { type: 'success' }); } catch (e) {}
        await reload();
    }

    async function deletePicked() {
        const st = S;
        const list = allChats().filter(c => st.sel.has(c.key) && !c.isCur);
        if (!list.length) return;
        const imgN = list.reduce((s, c) => s + c.images, 0), jrN = list.filter(c => c.journal).length;
        const ok = await AUI().confirm('刪掉這 ' + list.length + ' 條聊天？\n酒館裡的聊天記錄' + (imgN ? '、它們的 ' + imgN + ' 張圖' : '') + '、奧瑞亞替它們存的所有資料會一起刪掉，拿不回來。'
                 + (jrN ? '\n\n其中 ' + jrN + ' 條在日誌裡有總結，也會一起刪。' : ''));
        if (!ok || S !== st) return;
        st.busy = true;
        const C = win.VN_Cache || window.VN_Cache; let failed = 0;
        for (let i = 0; i < list.length; i++) {
            const c = list[i];
            renderBar('刪除中 ' + (i + 1) + ' / ' + list.length);
            try {
                // 先刪酒館的聊天檔；這一步沒成功就不動奧瑞亞那邊，免得聊天還在、圖與記憶卻沒了
                // 🚨 副檔名自己補：卡名裡有句點（V1.97）時酒館會以為已經有副檔名、不補 .jsonl，結果找不到檔
                await stPost('/api/chats/delete', { chatfile: c.name + '.jsonl', avatar_url: c.avatar });
                await wipeAurelia(c.key, [c.name], c.journal);
                st.sel.delete(c.key);
            } catch (e) { failed++; console.error('[OS_CHAT_TIDY] 刪除失敗', c.name, e); }
            if (S !== st) return;
        }
        st.busy = false;
        try {
            if (failed) AUI().alert('有 ' + failed + ' 條沒刪成功，還留在清單裡。');
            else if (AUI().toast) AUI().toast('刪掉了 ' + list.length + ' 條聊天', { type: 'success' });
        } catch (e) {}
        await reload();
    }

    win.OS_CHAT_TIDY = { open, close, available, _test: { readable, norm, startedAt } };
    if (win !== window) window.OS_CHAT_TIDY = win.OS_CHAT_TIDY;
})();
