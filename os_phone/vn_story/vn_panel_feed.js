// ----------------------------------------------------------------
// [檔案] vn_panel_feed.js — VN 組件（共用面板）的資料接口
// 職責：一個面板要顯示的資料由這裡算出來，面板 js 只負責畫。
//   ・正文那份：掃當前聊天全部樓層裡的 <tagId>…</tagId> 區塊，解析成一筆一筆的紀錄，每筆帶樓號。
//     不落地、每次現算 → 重播不會累積、刪樓／回朔自動消失、換聊天自然不混。
//   ・應用那份：使用者（或面板裡的 AI 鈕）在 app 裡新增的紀錄，存 OS_DB app_data，
//     appId = 'vnpanel:<tagId>'、scope = 當前聊天。刪聊天時由 OS_DB.deleteAllByChatId 連帶清；
//     刪組件時由創作室呼叫 purgeTag 清。
//   ・feed() 把兩份依「樓號 / 新增時正文到哪一樓」交錯成一串回給面板。
// 三個執行處（劇情彈出、手機 app、創作室預覽）都透過各自的 st 轉呼叫這裡。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window;
    if (win.VN_PANEL_FEED) return;

    const APP_PREFIX = 'vnpanel:';
    const ENTRIES_KEY = 'entries';
    const LEGACY_BUCKET = 'pwa_panel';          // 舊制：對照不到 app 時全丟這桶，無分艙、無人清 → 啟動時整桶砍掉
    const LEGACY_FLAG = 'vnpanel_legacy_purged_v1';

    let _msgCache = { chatId: '', at: 0, msgs: null };
    const MSG_TTL = 1200;

    function _db() { return win.OS_DB || (win.parent && win.parent.OS_DB) || null; }
    function _chatId() { try { const d = _db(); const c = d && d.currentChatId ? d.currentChatId() : null; return c == null ? '' : String(c); } catch (e) { return ''; } }
    function _appId(tagId) { return APP_PREFIX + String(tagId || '').trim(); }
    function _esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    // 讀當前聊天全部樓層（酒館與 PWA 同一支 VN_READER.fetchFullChat），短暫快取免得一個面板連按幾次就讀檔幾次
    async function _fullChat() {
        const cid = _chatId();
        const now = Date.now();
        if (_msgCache.msgs && _msgCache.chatId === cid && now - _msgCache.at < MSG_TTL) return _msgCache.msgs;
        let msgs = null;
        try {
            const R = win.VN_READER || (win.parent && win.parent.VN_READER);
            msgs = (R && R.fetchFullChat) ? await R.fetchFullChat() : null;
        } catch (e) { msgs = null; }
        const texts = Array.isArray(msgs) ? msgs.map(function (m) { return (typeof m === 'string') ? m : ((m && (m.mes || m.message)) || ''); }) : [];
        _msgCache = { chatId: cid, at: now, msgs: texts };
        return texts;
    }
    function invalidate() { _msgCache = { chatId: '', at: 0, msgs: null }; }

    // 把區塊裡的行解析成紀錄：[Tag|欄1|欄2…] 一行一筆；跨多行的長內容縫回一行；全形分隔符容錯
    function parseRecords(lines) {
        const out = [];
        const stitched = [];
        let buf = null;
        (lines || []).forEach(function (raw) {
            let line = String(raw == null ? '' : raw).trim().replace(/[｜]/g, '|').replace(/[［]/g, '[').replace(/[］]/g, ']');
            if (!line) return;
            if (buf !== null) {
                buf += '\n\n' + line;
                if (line.charAt(line.length - 1) === ']') { stitched.push(buf); buf = null; }
                return;
            }
            if (/^\[[A-Za-z0-9_一-鿿-]+\|/.test(line) && line.charAt(line.length - 1) !== ']') { buf = line; return; }
            stitched.push(line);
        });
        if (buf !== null) stitched.push(buf + ']');
        stitched.forEach(function (line) {
            if (line.charAt(0) !== '[' || line.charAt(line.length - 1) !== ']') return;
            const parts = line.slice(1, -1).split('|');
            const tag = (parts[0] || '').trim();
            if (!tag) return;
            out.push({ tag: tag, fields: parts.slice(1).map(function (s) { return s.trim(); }) });
        });
        return out;
    }
    // 舊 st.parse() 的形狀：{ 標籤名: [[欄…], …] }
    function parseMap(lines) {
        const map = {};
        parseRecords(lines).forEach(function (r) { (map[r.tag] = map[r.tag] || []).push(r.fields); });
        return map;
    }

    // 從一樓正文裡撈出所有 <tagId>…</tagId>（或 [tagId]…[/tagId]）區塊的行
    function _blocksIn(text, tagId) {
        const t = _esc(String(tagId || ''));
        const re = new RegExp('^[ \\t]*[<\\[]' + t + '[>\\]][ \\t]*$([\\s\\S]*?)^[ \\t]*[<\\[]\\/' + t + '[>\\]][ \\t]*$', 'gim');
        const blocks = [];
        let m;
        while ((m = re.exec(text)) !== null) blocks.push(m[1].split('\n'));
        return blocks;
    }

    // 正文那份：每筆 { id:'s:樓:序', src:'story', tag, fields, floor }
    async function storyRecords(tagId) {
        const texts = await _fullChat();
        const out = [];
        const probe = String(tagId || '').toLowerCase();
        for (let f = 0; f < texts.length; f++) {
            const text = texts[f];
            if (!text || text.toLowerCase().indexOf(probe) < 0) continue;
            let seq = 0;
            _blocksIn(text, tagId).forEach(function (lines) {
                parseRecords(lines).forEach(function (r) { out.push({ id: 's:' + f + ':' + (seq++), src: 'story', tag: r.tag, fields: r.fields, floor: f }); });
            });
        }
        return { records: out, lastFloor: texts.length - 1 };
    }

    // 應用那份：存 OS_DB app_data（appId=vnpanel:<tagId>、scope=當前聊天）
    async function _loadEntries(tagId) {
        const d = _db(); const cid = _chatId();
        if (!d || !d.getAppData || !cid) return [];
        try { const v = await d.getAppData(_appId(tagId), ENTRIES_KEY, cid); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    async function _saveEntries(tagId, list) {
        const d = _db(); const cid = _chatId();
        if (!d || !d.saveAppData || !cid) return false;
        try { return await d.saveAppData(_appId(tagId), ENTRIES_KEY, list, cid); } catch (e) { return false; }
    }
    function _newId() { return 'a:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 7); }

    // 合併：正文紀錄照樓號；應用紀錄釘在「新增當時正文到哪一樓」之後，同樓內照新增時間
    async function feed(tagId, opts) {
        opts = opts || {};
        const story = await storyRecords(tagId);
        const records = story.records.slice();
        // 劇情彈出當下若這一樓還沒進聊天檔（極少見），把彈出時拿到的 lines 補上、內容重複的不重加
        if (Array.isArray(opts.lines) && opts.lines.length) {
            const seen = {};
            records.forEach(function (r) { seen[r.tag + '|' + r.fields.join('|')] = 1; });
            let seq = 0;
            parseRecords(opts.lines).forEach(function (r) {
                const k = r.tag + '|' + r.fields.join('|');
                if (seen[k]) return;
                seen[k] = 1;
                records.push({ id: 's:' + (story.lastFloor + 1) + ':' + (seq++), src: 'story', tag: r.tag, fields: r.fields, floor: story.lastFloor + 1 });
            });
        }
        const app = (await _loadEntries(tagId)).map(function (e) {
            return { id: e.id, src: 'app', tag: e.tag, fields: Array.isArray(e.fields) ? e.fields.slice() : [], floor: (e.afterFloor == null ? Infinity : e.afterFloor), ts: e.ts || 0 };
        });
        const out = [];
        let ai = 0;
        app.sort(function (a, b) { return (a.floor - b.floor) || (a.ts - b.ts); });
        records.forEach(function (r) {
            while (ai < app.length && app[ai].floor < r.floor) out.push(app[ai++]);
            out.push(r);
        });
        while (ai < app.length) out.push(app[ai++]);
        if (opts.tag) return out.filter(function (r) { return r.tag === opts.tag; });
        return out;
    }

    async function add(tagId, tag, fields) {
        const list = await _loadEntries(tagId);
        let lastFloor = -1;
        try { lastFloor = (await _fullChat()).length - 1; } catch (e) {}
        const rec = { id: _newId(), tag: String(tag || '').trim(), fields: Array.isArray(fields) ? fields.map(function (s) { return String(s == null ? '' : s); }) : [], ts: Date.now(), afterFloor: lastFloor };
        if (!rec.tag) return null;
        list.push(rec);
        await _saveEntries(tagId, list);
        return { id: rec.id, src: 'app', tag: rec.tag, fields: rec.fields.slice(), floor: lastFloor, ts: rec.ts };
    }
    async function update(tagId, id, fields) {
        const list = await _loadEntries(tagId);
        const rec = list.find(function (e) { return e && e.id === id; });
        if (!rec) return false;
        rec.fields = Array.isArray(fields) ? fields.map(function (s) { return String(s == null ? '' : s); }) : rec.fields;
        rec.edited = Date.now();
        return await _saveEntries(tagId, list);
    }
    async function remove(tagId, id) {
        const list = await _loadEntries(tagId);
        const kept = list.filter(function (e) { return e && e.id !== id; });
        if (kept.length === list.length) return false;
        return await _saveEntries(tagId, kept);
    }
    async function clear(tagId) { return await _saveEntries(tagId, []); }

    // 使用者身分：酒館人設（名字／頭像／簡介）＋微信「我」頁的暱稱與簽名；面板裡凡是「我」發的東西都用這個，不准寫死 User、不用做登入頁
    async function user() {
        const out = { name: 'User', nickname: '', avatar: '', signature: '', desc: '' };
        try {
            const P = win.OS_PERSONA || win.OS_USER || (win.parent && (win.parent.OS_PERSONA || win.parent.OS_USER));
            const c = P && P.getInfo ? P.getInfo() : null;
            if (c) { if (c.name) out.name = String(c.name); if (c.avatar) out.avatar = String(c.avatar); if (c.desc) out.desc = String(c.desc); }
        } catch (e) {}
        try {
            const W = win.WX_PROFILE || (win.parent && win.parent.WX_PROFILE);
            const pr = W && W.get ? W.get() : null;
            if (pr) {
                if (pr.nickname && pr.nickname !== 'User') out.nickname = String(pr.nickname);
                if (pr.signature) out.signature = String(pr.signature);
                if (pr.avatar && !out.avatar) out.avatar = String(pr.avatar);
            }
        } catch (e) {}
        if (!out.nickname) out.nickname = out.name;
        // 頭像存在手機 DB 的（img_／avt_ 開頭）換成可用的網址
        if (/^(img_|avt_)/.test(out.avatar)) {
            try { const d = _db(); const u = d && d.getImage ? await d.getImage(out.avatar) : null; out.avatar = u || ''; } catch (e) { out.avatar = ''; }
        }
        return out;
    }

    // 刪組件：這個面板在所有聊天裡的應用紀錄整批清
    async function purgeTag(tagId) {
        const d = _db();
        if (!d || !d.deleteAppDataByApp || !tagId) return false;
        try { await d.deleteAppDataByApp(_appId(tagId)); return true; } catch (e) { return false; }
    }

    // 舊制通用桶一次性砍掉（沒分艙、混了所有聊天、沒人清）
    async function _purgeLegacyOnce() {
        try {
            if (win.localStorage.getItem(LEGACY_FLAG) === '1') return;
            const d = _db();
            if (!d || !d.deleteAppDataByApp) return;
            await d.deleteAppDataByApp(LEGACY_BUCKET);
            win.localStorage.setItem(LEGACY_FLAG, '1');
            console.log('[VN_PANEL_FEED] 舊制 pwa_panel 通用桶已清');
        } catch (e) {}
    }

    // 酒館事件：正文一動就丟掉快取（下次 feed 重讀）
    (function hook() {
        let tries = 0;
        const tick = function () {
            if (typeof win.eventOn === 'function' && win.tavern_events) {
                const ev = win.tavern_events;
                ['MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_UPDATED', 'CHAT_CHANGED'].forEach(function (k) { if (ev[k]) win.eventOn(ev[k], invalidate); });
                return;
            }
            if (++tries < 40) setTimeout(tick, 500);
        };
        tick();
    })();
    setTimeout(_purgeLegacyOnce, 3000);

    win.VN_PANEL_FEED = {
        feed: feed, add: add, update: update, remove: remove, clear: clear, user: user,
        storyRecords: storyRecords, parseRecords: parseRecords, parseMap: parseMap,
        purgeTag: purgeTag, invalidate: invalidate, chatId: _chatId, appId: _appId
    };
})();
