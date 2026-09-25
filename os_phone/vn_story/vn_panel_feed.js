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

    // 比對用：去掉空白、全形分隔符換半形（VN 劇本與存檔原文的空白、全形寫法可能不一樣）
    function _norm(s) { return String(s == null ? '' : s).replace(/[｜]/g, '|').replace(/[［]/g, '[').replace(/[］]/g, ']').replace(/\s+/g, ''); }
    function _keyLines(lines) { return (lines || []).map(_norm).filter(Boolean); }
    function _sameBlock(blockLines, keys) {
        const b = _keyLines(blockLines);
        return b.length === keys.length && b.every(function (l, i) { return l === keys[i]; });
    }
    // 劇情裡彈出的這一個區塊在哪：哪一樓、那一樓的第幾個 <tagId> 區塊。
    //   at = { lines: 這個區塊的原始資料行, floor: 正在播的樓號（可空）, ord: 劇本裡這是第幾個同名區塊（可空） }
    //   樓號給了而且那樓真的有這些行就用它；沒給（新生成那則常是 null）就找最後一個含這些行的樓。
    //   找不到（這則還沒進存檔）回 null＝存檔裡的全是前面的事。
    function _locate(texts, tagId, at) {
        const keys = _keyLines(at && at.lines);
        if (!keys.length) return null;
        const holds = function (t) { if (!t) return false; const n = _norm(t); return keys.every(function (k) { return n.indexOf(k) >= 0; }); };
        const hint = (at.floor == null || at.floor === '') ? NaN : Number(at.floor);
        let f = -1;
        if (hint >= 0 && hint < texts.length && holds(texts[hint])) f = hint;
        else for (let i = texts.length - 1; i >= 0; i--) { if (holds(texts[i])) { f = i; break; } }
        if (f < 0) return null;
        const blocks = _blocksIn(texts[f], tagId);
        const ord = (typeof at.ord === 'number' && at.ord >= 0) ? at.ord : -1;
        let b = -1;
        if (ord >= 0 && blocks[ord] && _sameBlock(blocks[ord], keys)) b = ord;
        if (b < 0) {
            blocks.forEach(function (bl, i) {
                if (!_sameBlock(bl, keys)) return;
                if (b < 0 || (ord >= 0 && Math.abs(i - ord) < Math.abs(b - ord))) b = i;
            });
        }
        // 對不到整塊（AI 沒寫外層標籤、由 VN 補殼的散行）：排在它前面那幾個區塊之後
        if (b < 0) b = ord >= 0 ? Math.min(ord, blocks.length) : blocks.length;
        return { floor: f, block: b };
    }

    // 正文那份：每筆 { id:'s:樓:序', src:'story', tag, fields, floor }
    //   cut = { floor, block }：只收演到這裡之前的（那樓之前全部、那樓第 block 個區塊之前），後面的不先露出來
    async function storyRecords(tagId, cut) {
        const texts = await _fullChat();
        const out = [];
        let nextSeq = 0;
        const probe = String(tagId || '').toLowerCase();
        for (let f = 0; f < texts.length; f++) {
            if (cut && f > cut.floor) break;
            const text = texts[f];
            if (!text || text.toLowerCase().indexOf(probe) < 0) continue;
            let seq = 0;
            _blocksIn(text, tagId).forEach(function (lines, bi) {
                if (cut && f === cut.floor && bi >= cut.block) return;
                parseRecords(lines).forEach(function (r) { out.push({ id: 's:' + f + ':' + (seq++), src: 'story', tag: r.tag, fields: r.fields, floor: f }); });
            });
            if (cut && f === cut.floor) nextSeq = seq;
        }
        return { records: out, lastFloor: texts.length - 1, nextSeq: nextSeq };
    }

    // 應用那份：存 OS_DB app_data（appId=vnpanel:<tagId>、scope=當前聊天）
    // strict：要改完整份寫回的（新增／修改／刪除）讀失敗就丟錯，別當成空的再寫回把整份清掉
    async function _loadEntries(tagId, strict) {
        const d = _db(); const cid = _chatId();
        if (!d || !d.getAppData || !cid) { if (strict) throw new Error('資料庫還沒載入'); return []; }
        try { const v = await d.getAppData(_appId(tagId), ENTRIES_KEY, cid); return Array.isArray(v) ? v : []; }
        catch (e) { if (strict) throw e; return []; }
    }
    async function _saveEntries(tagId, list) {
        const d = _db(); const cid = _chatId();
        if (!d || !d.saveAppData || !cid) return false;
        try { return await d.saveAppData(_appId(tagId), ENTRIES_KEY, list, cid); } catch (e) { return false; }
    }
    function _newId() { return 'a:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 7); }

    // 合併：正文紀錄照樓號；應用紀錄釘在「新增當時正文到哪一樓」之後，同樓內照新增時間
    //   opts.at（劇情裡彈出時才給）：只給演到這個區塊為止的，同一則後段才出場的區塊、之後的樓都不先給，
    //   不然第一次彈出就把後面的全亮出來、演到後面又再亮一次。手機 app 與創作室預覽不給 at，照舊拿全部。
    async function feed(tagId, opts) {
        opts = opts || {};
        let cut = null;
        if (opts.at) { try { cut = _locate(await _fullChat(), tagId, opts.at); } catch (e) { cut = null; } }
        const story = await storyRecords(tagId, cut);
        const records = story.records.slice();
        if (cut) {
            // 這個區塊自己：用彈出時拿到的 lines（已套好名字巨集），排在同一樓前面那幾塊之後
            let seq = story.nextSeq;
            if (Array.isArray(opts.lines)) parseRecords(opts.lines).forEach(function (r) {
                records.push({ id: 's:' + cut.floor + ':' + (seq++), src: 'story', tag: r.tag, fields: r.fields, floor: cut.floor });
            });
        } else if (Array.isArray(opts.lines) && opts.lines.length) {
            // 劇情彈出當下若這一樓還沒進聊天檔（極少見），把彈出時拿到的 lines 補上、內容重複的不重加
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
        }).filter(function (r) { return !cut || r.floor <= cut.floor; });   // 劇情裡：之後的樓才新增的不先露；這一則當下新增的（在面板裡留言）照樣看得到
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
        let list; try { list = await _loadEntries(tagId, true); } catch (e) { return null; }
        let lastFloor = -1;
        try { lastFloor = (await _fullChat()).length - 1; } catch (e) {}
        const rec = { id: _newId(), tag: String(tag || '').trim(), fields: Array.isArray(fields) ? fields.map(function (s) { return String(s == null ? '' : s); }) : [], ts: Date.now(), afterFloor: lastFloor };
        if (!rec.tag) return null;
        list.push(rec);
        if (!(await _saveEntries(tagId, list))) return null;   // 🚨 存不進去就回 null，別讓面板以為新增成功
        return { id: rec.id, src: 'app', tag: rec.tag, fields: rec.fields.slice(), floor: lastFloor, ts: rec.ts };
    }
    async function update(tagId, id, fields) {
        let list; try { list = await _loadEntries(tagId, true); } catch (e) { return false; }
        const rec = list.find(function (e) { return e && e.id === id; });
        if (!rec) return false;
        rec.fields = Array.isArray(fields) ? fields.map(function (s) { return String(s == null ? '' : s); }) : rec.fields;
        rec.edited = Date.now();
        return await _saveEntries(tagId, list);
    }
    async function remove(tagId, id) {
        let list; try { list = await _loadEntries(tagId, true); } catch (e) { return false; }
        const kept = list.filter(function (e) { return e && e.id !== id; });
        if (kept.length === list.length) return false;
        return await _saveEntries(tagId, kept);
    }
    async function clear(tagId) { return await _saveEntries(tagId, []); }

    // 使用者身分：酒館人設（名字／頭像／簡介）＋微信「我」頁的暱稱與簽名；面板裡凡是「我」發的東西都用這個，不准寫死 User、不用做登入頁
    // 同步版：不換頭像網址（存在手機 DB 的頭像回空字串）。給各執行處把欄位掛在 st.user 函式上，AI 手滑寫 st.user.name 也讀得到
    function userSync() {
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
        if (/^(img_|avt_)/.test(out.avatar)) out.avatar = '';
        return out;
    }
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

    // 微信通訊錄（當前故事那本）：給面板做「選一個聯絡人」的清單。群聊也在裡面，isGroup 分得出來；使用者本人不列。
    //   通訊錄本來就按故事分本（WX_CONTACTS 的鍵帶當前聊天 id），別張角色卡的人不會混進來。
    //   persona＝聊天設置裡替他設的人設（群聊是群聊備註）：關掉「吃這本的劇情」的人，設定只剩這裡有，
    //   論壇、直播那種 app 要寫到他，從這裡拿才不會把他寫成別人。聯絡人 id 就是聊天室 id。
    const EMPTY_BIO = ['這個人很懶，什麼都沒寫', '这个人很懒，什么都没写', '...'];
    async function contacts() {
        let list = [];
        try {
            const C = win.WX_CONTACTS || (win.parent && win.parent.WX_CONTACTS);
            list = (C && C.getAllCustomContacts) ? (C.getAllCustomContacts() || []) : [];
        } catch (e) { list = []; }
        const me = userSync();
        const d = _db();
        const out = [], seen = {};
        for (const c of list) {
            if (!c || !c.id || seen[c.id]) continue;
            const name = String(c.name || '').trim();
            if (!name) continue;
            if (!c.isGroup && (name === me.name || name === me.nickname || name === '我' || name === 'User')) continue;
            seen[c.id] = true;
            let avatar = '';
            const aid = c.avatarId ? String(c.avatarId) : '';
            if (/^(https?:|data:|blob:)/.test(aid)) avatar = aid;
            else if (aid) { try { avatar = (d && d.getImage) ? ((await d.getImage(aid)) || '') : ''; } catch (e) { avatar = ''; } }
            const bio = String(c.desc || c.bio || '').trim();
            let persona = '';
            try {
                const A = win.OS_API;
                if (A && A.chatNoteOf) {
                    const W = win.wxApp;
                    const chat = (W && W.GLOBAL_CHATS && W.GLOBAL_CHATS[c.id]) || ((d && d.getApiChat) ? await d.getApiChat(c.id) : null);
                    persona = String((await A.chatNoteOf(chat)) || '').trim();
                }
            } catch (e) { persona = ''; }
            out.push({ id: String(c.id), name: name, desc: EMPTY_BIO.indexOf(bio) >= 0 ? '' : bio, avatar: avatar, isGroup: !!c.isGroup, persona: persona });
        }
        return out;
    }

    // 寫進當前世界書（原小世界「生成完存成一條世界書」那段，改給面板用）：同標題就改那條、沒有就新建。
    //   酒館：角色卡主世界書；手機：手機世界書正在用的那本（OS_WORLDBOOK.getTargetBook）。
    //   沒給關鍵字＝常駐（每輪都送）；有給＝對話提到才送。回 true/false，false 多半是角色卡沒綁世界書。
    function _standalone() { try { const A = win.OS_API; return !!(A && A.isStandalone && A.isStandalone()); } catch (e) { return false; } }
    function _keyList(keys) {
        return (Array.isArray(keys) ? keys : String(keys == null ? '' : keys).split(/[,，、\n]/)).map(k => String(k == null ? '' : k).trim()).filter(Boolean);
    }
    function _tavernBook() {
        const TH = win.TavernHelper;
        try { return (TH && ((TH.getCurrentCharPrimaryLorebook && TH.getCurrentCharPrimaryLorebook()) || (TH.getCharWorldbookNames && (TH.getCharWorldbookNames('current') || {}).primary))) || ''; } catch (e) { return ''; }
    }
    function _pwaBook() { const W = win.OS_WORLDBOOK; try { return (W && W.getTargetBook) ? W.getTargetBook() : '預設書包'; } catch (e) { return '預設書包'; } }
    async function wbSave(title, content, keys) {
        title = String(title == null ? '' : title).trim();
        if (!title) return false;
        content = String(content == null ? '' : content);
        const kl = _keyList(keys);
        try {
            if (_standalone()) {
                const d = _db();
                if (!d || !d.getAllWorldbookEntries || !d.saveWorldbookEntry) return false;
                const book = _pwaBook();
                const old = ((await d.getAllWorldbookEntries()) || []).find(e => e && e.book === book && e.title === title);
                const now = Date.now();
                await d.saveWorldbookEntry(Object.assign({}, old || {
                    id: 'wb_' + now + '_' + Math.random().toString(36).slice(2, 6),
                    book: book, title: title, category: '預設', order: 100, depth: null, role: 0, createdAt: now
                }, { content: content, keys: kl.join(','), enabled: true, updatedAt: now }));
                return true;
            }
            const TH = win.TavernHelper, book = _tavernBook();
            if (!TH || !book || !TH.getLorebookEntries) return false;
            const old = ((await TH.getLorebookEntries(book)) || []).find(e => e && e.comment === title);
            const type = kl.length ? 'selective' : 'constant';
            if (old) await TH.setLorebookEntries(book, [{ uid: old.uid, content: content, keys: kl, type: type, enabled: true }]);
            else await TH.createLorebookEntries(book, [{ comment: title, content: content, keys: kl, type: type, enabled: true }]);
            return true;
        } catch (e) { console.warn('[VN_PANEL_FEED] 寫世界書失敗:', e); return false; }
    }
    async function wbLoad(title) {
        title = String(title == null ? '' : title).trim();
        if (!title) return '';
        try {
            if (_standalone()) {
                const d = _db();
                if (!d || !d.getAllWorldbookEntries) return '';
                const book = _pwaBook();
                const e = ((await d.getAllWorldbookEntries()) || []).find(x => x && x.book === book && x.title === title);
                return e ? String(e.content || '') : '';
            }
            const TH = win.TavernHelper, book = _tavernBook();
            if (!TH || !book || !TH.getLorebookEntries) return '';
            const e = ((await TH.getLorebookEntries(book)) || []).find(x => x && x.comment === title);
            return e ? String(e.content || '') : '';
        } catch (e) { return ''; }
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
        feed: feed, add: add, update: update, remove: remove, clear: clear, user: user, userSync: userSync, contacts: contacts, wbSave: wbSave, wbLoad: wbLoad,
        storyRecords: storyRecords, parseRecords: parseRecords, parseMap: parseMap,
        purgeTag: purgeTag, invalidate: invalidate, chatId: _chatId, appId: _appId
    };
})();
