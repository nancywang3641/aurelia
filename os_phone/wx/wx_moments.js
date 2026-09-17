// ----------------------------------------------------------------
// [微信] wx_moments.js —— 朋友圈：一個故事一條，她和角色都會發、按讚、留言
// 職責：
//   ・資料：一則動態有流水號（這個故事裡永遠往上加、不重用），AI 用號碼指動態，
//     托管延遲、中間有人刪動態都不會指錯。名字存快照，改名或刪人舊動態照樣畫得出來。
//     author／who 是 'me' 或那個角色的聊天室 id；之後的路人 AI 預留 'npc:名字'，現在不產生。
//   ・誰看得到：她看得到全部；角色只看得到她、自己、跟自己「認識的人」的動態與讚留言。
//   ・給 AI：每輪附它看得到的最近幾則（見 brief），它在回覆裡寫英文標籤
//     <moment_post> / <moment_like id/> / <moment_comment id> / <moment_reply id to>，醒來什麼都不做寫 <moment_skip/>。
//     wx_core.parseAndProcess 一開頭就交給 extract：抽掉標籤、執行、剩下的字才拆成聊天泡泡。
//   ・不寫進大總結、不寫進正文記憶：朋友圈只活在手機裡。
// 存哪：OS_DB app_data（appId 'wx_moments'，key 'feed' 與 'links'，分艙鍵＝OS_DB.currentChatId()，跟通訊錄同一把）。
//   🚨 app_data 是共用倉：appId 不准用 app_ 開頭。
// 對外：WX_MOMENTS.open(opts) / close() / openLinks(chatId) / brief(chatId) / extract(text, chatId, name) / strip(text) / actedSince(...) /
//       unseen() / markSeen() / paintBadges(root) / 其餘資料操作見檔尾
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const d = win.document;

    const APP_ID = 'wx_moments';
    const FEED_KEY = 'feed';
    const LINKS_KEY = 'links';
    const SEEN_KEY = (s) => 'wx_moments_seen__' + s;
    const TEXT_MAX = 2000;
    const COMMENT_MAX = 500;
    const PHOTO_MAX = 9;
    const BRIEF_POSTS = 12;      // 給 AI 看最近幾則
    const BRIEF_COMMENTS = 5;    // 每則最多列幾條留言
    const BRIEF_LEN = 120;       // 每則文字最多幾個字

    const _cache = {};           // scope → { feed, links }
    const _loading = {};         // scope → Promise
    const _queue = {};           // scope → 寫入排隊
    const _acted = {};           // chatId → AI 最後一次在朋友圈動手的時間
    const _listeners = [];

    function _db() { return win.OS_DB || window.OS_DB; }
    function _aui() { return win.AUI || window.AUI; }
    function _pi() { return win.OS_PHONE_IMAGE || window.OS_PHONE_IMAGE; }
    function _chats() { try { return (win.wxApp && win.wxApp.GLOBAL_CHATS) || {}; } catch (e) { return {}; } }
    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function _newId(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    // 時間戳一律從這裡拿，保證一次比一次大：同一輪回覆裡連做好幾件事常落在同一毫秒，
    // 「最新那個人是誰」「她看過之後有沒有新的」都靠比時間，一樣大就判不出先後。
    let _lastTs = 0;
    function _now() { _lastTs = Math.max(Date.now(), _lastTs + 1); return _lastTs; }
    function _clone(o) { return JSON.parse(JSON.stringify(o)); }
    // 「我」在微信裡叫什麼：只有 WX_ME 一個出處
    function _userName() {
        try { const me = win.WX_ME; if (me && me.name) { const n = me.name(); if (n) return n; } } catch (e) {}
        try { const api = win.OS_API; if (api && api.getGlobalUserName) return api.getGlobalUserName() || ''; } catch (e) {}
        return '我';
    }
    // 現在叫什麼（角色改過名就用新名字）；找不到人就用快照
    function _nameOf(who, snapshot) {
        if (who === 'me') return _userName();
        const c = _chats()[who];
        return (c && c.name) || snapshot || '對方';
    }

    function scope() {
        try { const db = _db(); const c = db && db.currentChatId ? db.currentChatId() : null; if (c != null && String(c)) return String(c); } catch (e) {}
        try { const s = win.OS_AVS_ADAPTER && win.OS_AVS_ADAPTER.getStoryId && win.OS_AVS_ADAPTER.getStoryId(); if (s) return String(s); } catch (e) {}
        return '';
    }

    // ── 資料 ─────────────────────────────────────────
    function load(sc) {
        const s = sc == null ? scope() : sc;
        if (_cache[s]) return Promise.resolve(_cache[s]);
        if (_loading[s]) return _loading[s];
        _loading[s] = (async function () {
            let feed = null, links = null;
            try {
                const db = _db();
                if (db && db.getAppData) {
                    feed = await db.getAppData(APP_ID, FEED_KEY, s || null);
                    links = await db.getAppData(APP_ID, LINKS_KEY, s || null);
                }
            } catch (e) { console.warn('[朋友圈] 讀不出來', e); }
            if (!feed || !Array.isArray(feed.posts)) feed = { nextNo: 1, posts: [] };
            if (!(feed.nextNo >= 1)) feed.nextNo = feed.posts.reduce(function (m, p) { return Math.max(m, p.no || 0); }, 0) + 1;
            feed.posts.forEach(function (p) { p.likes = p.likes || []; p.comments = p.comments || []; p.photos = p.photos || []; });
            if (!links || typeof links !== 'object') links = {};
            if (!_cache[s]) _cache[s] = { feed: feed, links: links };
            delete _loading[s];
            return _cache[s];
        })();
        return _loading[s];
    }
    // 所有改動都排隊：先讀進來、改、有變才存、存完通知畫面
    function _run(sc, fn) {
        const prev = _queue[sc] || Promise.resolve();
        const next = prev.then(async function () {
            const st = await load(sc);
            const changed = await fn(st);
            if (changed) {
                const db = _db();
                if (!db || !db.saveAppData) throw new Error('資料庫還沒準備好');
                await db.saveAppData(APP_ID, FEED_KEY, _clone(st.feed), sc || null);
                await db.saveAppData(APP_ID, LINKS_KEY, _clone(st.links), sc || null);
                _emit();
            }
            return changed;
        });
        _queue[sc] = next.catch(function (e) { console.warn('[朋友圈] 存不進去', e); });
        return next;
    }
    function _flush() { return _queue[scope()] || Promise.resolve(); }
    function onChange(fn) { if (typeof fn === 'function') _listeners.push(fn); }
    function _emit() {
        _listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
        try { paintBadges(); } catch (e) {}
        try { if (_root) _renderFeed(); } catch (e) {}
    }

    function _cleanPhotos(list) {
        return (list || []).filter(function (p) { return p && (p.src || p.desc); }).slice(0, PHOTO_MAX)
            .map(function (p) { return { src: String(p.src || ''), desc: String(p.desc || '').slice(0, 300) }; });
    }
    function _pushPost(st, p) {
        const post = {
            id: _newId('m'),
            no: st.feed.nextNo++,
            author: p.author,
            authorName: String(p.authorName || ''),
            text: String(p.text || '').slice(0, TEXT_MAX),
            photos: _cleanPhotos(p.photos),
            at: _now(),
            likes: [],
            comments: []
        };
        st.feed.posts.push(post);
        return post;
    }
    function _mkComment(who, whoName, toWho, toName, text) {
        return { id: _newId('c'), who: who, whoName: String(whoName || ''), toWho: toWho || '', toName: String(toName || ''), text: String(text || '').slice(0, COMMENT_MAX), at: _now() };
    }
    function _post(st, id) { return st.feed.posts.find(function (x) { return x.id === id; }); }

    function addPost(p) {
        let out = null;
        return _run(scope(), function (st) { out = _pushPost(st, p); return true; }).then(function () { return out; });
    }
    function toggleLike(postId, who, whoName) {
        let liked = false;
        return _run(scope(), function (st) {
            const p = _post(st, postId);
            if (!p) return false;
            const i = p.likes.findIndex(function (l) { return l.who === who; });
            if (i >= 0) { p.likes.splice(i, 1); liked = false; }
            else { p.likes.push({ who: who, whoName: String(whoName || ''), at: _now() }); liked = true; }
            return true;
        }).then(function () { return liked; });
    }
    function addComment(postId, c) {
        let out = null;
        return _run(scope(), function (st) {
            const p = _post(st, postId);
            const text = String((c && c.text) || '').trim();
            if (!p || !text) return false;
            out = _mkComment(c.who, c.whoName, c.toWho, c.toName, text);
            p.comments.push(out);
            return true;
        }).then(function () { return out; });
    }
    function removePost(postId) {
        return _run(scope(), function (st) {
            const before = st.feed.posts.length;
            st.feed.posts = st.feed.posts.filter(function (x) { return x.id !== postId; });
            return st.feed.posts.length !== before;
        });
    }
    function removeComment(postId, commentId) {
        return _run(scope(), function (st) {
            const p = _post(st, postId);
            if (!p) return false;
            const before = p.comments.length;
            p.comments = p.comments.filter(function (x) { return x.id !== commentId; });
            return p.comments.length !== before;
        });
    }
    function setLink(a, b, on) {
        return _run(scope(), function (st) {
            if (!a || !b || a === b) return false;
            const L = st.links;
            [[a, b], [b, a]].forEach(function (pair) {
                const arr = (L[pair[0]] || []).filter(function (x) { return x !== pair[1]; });
                if (on) arr.push(pair[1]);
                if (arr.length) L[pair[0]] = arr; else delete L[pair[0]];
            });
            return true;
        }).then(function () {});
    }
    function linksOf(id) {
        const st = _cache[scope()];
        return (st && st.links[id]) ? st.links[id].slice() : [];
    }

    // ── 誰看得到什麼（畫面與 brief 共用這一支）──────────────
    function visibleTo(viewer, feed, links) {
        const posts = (feed && feed.posts) || [];
        if (viewer === 'me') return posts.slice();
        const circle = new Set(['me', viewer].concat((links && links[viewer]) || []));
        return posts.filter(function (p) { return circle.has(p.author); }).map(function (p) {
            return Object.assign({}, p, {
                likes: (p.likes || []).filter(function (l) { return circle.has(l.who); }),
                comments: (p.comments || []).filter(function (c) { return circle.has(c.who); }).map(function (c) {
                    return (c.toWho && !circle.has(c.toWho)) ? Object.assign({}, c, { toWho: '', toName: '' }) : c;
                })
            });
        });
    }

    // ── 給 AI 的朋友圈 ───────────────────────────────────
    function _ago(ts) {
        const m = Math.max(0, Math.round((Date.now() - (ts || 0)) / 60000));
        if (m < 1) return '剛剛';
        if (m < 60) return m + ' 分鐘前';
        const h = Math.round(m / 60);
        if (h < 24) return h + ' 小時前';
        return Math.round(h / 24) + ' 天前';
    }
    async function brief(chatId) {
        if (!chatId) return '';
        const chat = _chats()[chatId];
        if (chat && chat.isGroup) return '';
        const st = await load();
        const seen = visibleTo(chatId, st.feed, st.links);
        const user = _userName();
        const nm = function (who, snap) { return who === chatId ? '你' : _nameOf(who, snap); };
        const lines = [];
        // 回了它的留言、它之後還沒在那則底下再說話的
        seen.forEach(function (p) {
            p.comments.forEach(function (c, i) {
                if (c.toWho !== chatId || c.who === chatId) return;
                const after = p.comments.slice(i + 1).some(function (x) { return x.who === chatId; });
                if (!after) lines.push('（動態' + p.no + '｜' + nm(c.who, c.whoName) + ' 回覆你：' + c.text + '）');
            });
        });
        seen.slice(-BRIEF_POSTS).reverse().forEach(function (p) {
            const txt = p.text.length > BRIEF_LEN ? p.text.slice(0, BRIEF_LEN) + '…' : p.text;
            const _PI2 = _pi();   // 照片描述只給前段：後段是畫圖用的英文，不必餵回去
            const descs = p.photos.map(function (x) { return (_PI2 && _PI2.textOnly) ? _PI2.textOnly(x.desc) : x.desc; }).filter(Boolean);
            const ph = p.photos.length ? '（照片 ' + p.photos.length + ' 張' + (descs.length ? '：' + descs.join('；') : '') + '）' : '';
            const likes = p.likes.length ? '｜讚：' + p.likes.map(function (l) { return nm(l.who, l.whoName); }).join('、') : '';
            const cms = p.comments.slice(-BRIEF_COMMENTS).map(function (c) {
                return nm(c.who, c.whoName) + (c.toWho ? ' 回覆 ' + nm(c.toWho, c.toName) : '') + '：' + c.text;
            });
            const mineLiked = p.likes.some(function (l) { return l.who === chatId; }) ? '｜你讚過' : '';
            lines.push('動態' + p.no + '｜' + nm(p.author, p.authorName) + '發的｜' + _ago(p.at) + '｜' + txt + ph + likes + (cms.length ? '｜留言：' + cms.join('；') : '') + mineLiked);
        });
        const head = seen.length
            ? '【朋友圈｜你看得到的最近幾則，新的在上面】'
            : '【朋友圈｜你看得到的動態現在是空的】';
        return [head].concat(lines).concat([
            '',
            '想發朋友圈、按讚或留言時，在回覆裡另外寫下面的標籤，一個標籤做一件事。標籤名與屬性名照抄英文，不要翻譯、不要改寫：',
            '<moment_post>內容</moment_post>，想附照片就在內容後面加 <photo>給人看的一句中文 >> 畫圖用的英文句子</photo>，一張一個'
                + '（照片那兩段中間一定要有 >>：前段是動態上顯示的那句，中文寫短；後段拿去畫圖，寫成完整的英文句子，把畫面裡有誰、長相穿著、在做什麼、在哪裡講完）',
            '<moment_like id="動態號碼"/>',
            '<moment_comment id="動態號碼">內容</moment_comment>',
            '<moment_reply id="動態號碼" to="對方名字">內容</moment_reply>',
            '動態號碼就是上面「動態」後面那個數字。標籤不會變成聊天訊息，不必每輪都做。' + user + '和其他人的動態，你只看得到上面這些。'
        ]).join('\n');
    }

    // ── AI 在朋友圈動手的寫法：英文標籤 ─────────────────────
    // 🚨 以前是中文系統行（[系統: 發朋友圈｜…]）。她實測 AI 常寫成簡體、換個說法，或寫在 <chat> 容器外面被丟掉，
    //    程式認不出來就整條不見。改成英文標籤、格式固定，像呼叫工具那樣：
    //    <moment_post>內容<photo>給人看的一句 >> 畫圖的英文句子</photo></moment_post>
    //    <moment_like id="17"/>
    //    <moment_comment id="17">內容</moment_comment>
    //    <moment_reply id="17" to="名字">內容</moment_reply>
    //    <moment_skip/>（醒來什麼都不做）
    // 容錯：全形角括號與引號、屬性不加引號、讚與略過沒寫斜線都認。聊天字本身一個字都不改。
    const PAIR_RE = /[<＜]\s*moment_(post|comment|reply|like|skip)\b([^>＞]*?)(?:\/\s*[>＞]|[>＞]([\s\S]*?)[<＜]\s*\/\s*moment_\1\s*[>＞])/gi;
    const SINGLE_RE = /[<＜]\s*moment_(like|skip)\b([^>＞]*?)\/?\s*[>＞]/gi;
    const PHOTO_RE = /[<＜]\s*photo\s*[>＞]([\s\S]*?)[<＜]\s*\/\s*photo\s*[>＞]/gi;
    function _attr(attrs, name) {
        const m = String(attrs || '').match(new RegExp(name + '\\s*=\\s*["“”＂\']?([^"“”＂\'\\s/>＞]+)', 'i'));
        return m ? m[1].trim() : '';
    }
    function _toAction(verb, attrs, inner) {
        if (verb === 'skip') return { verb: 'skip' };
        if (verb === 'post') {
            const photos = [];
            const body = String(inner || '').replace(PHOTO_RE, function (_, dsc) { const t = String(dsc || '').trim(); if (t) photos.push({ src: '', desc: t }); return ''; }).trim();
            return (body || photos.length) ? { verb: 'post', text: body, photos: photos } : null;
        }
        const no = parseInt(_attr(attrs, 'id'), 10);
        if (!(no >= 1)) return null;
        if (verb === 'like') return { verb: 'like', no: no };
        const text = String(inner || '').trim();
        if (!text) return null;
        if (verb === 'comment') return { verb: 'comment', no: no, text: text };
        return { verb: 'reply', no: no, toName: _attr(attrs, 'to'), text: text };
    }
    // 掃一段文字：每個標籤交給 onTag，回傳抽掉標籤之後剩下的字
    function _scan(text, onTag) {
        let rest = String(text == null ? '' : text).replace(PAIR_RE, function (_, verb, attrs, inner) { onTag(verb.toLowerCase(), attrs || '', inner || ''); return ''; });
        rest = rest.replace(SINGLE_RE, function (_, verb, attrs) { onTag(verb.toLowerCase(), attrs || '', ''); return ''; });
        return rest.replace(/\n{3,}/g, '\n\n').trim();
    }
    function parseTags(text) {
        const out = [];
        _scan(text, function (verb, attrs, inner) { const a = _toAction(verb, attrs, inner); if (a) out.push(a); });
        return out;
    }
    function strip(text) { return _scan(text, function () {}); }
    // 它回覆「某某」：她的名字（或「我」）→ 她；那則底下留過言的人 → 那個人；其他角色 → 聊天室
    function _whoByName(name, post, viewer) {
        const n = String(name || '').trim();
        if (!n) return { id: '', name: '' };
        if (n === _userName() || n === '我' || n === '她') return { id: 'me', name: _userName() };
        const hit = (post.comments || []).find(function (c) { return c.who !== viewer && _nameOf(c.who, c.whoName) === n; });
        if (hit) return { id: hit.who, name: _nameOf(hit.who, hit.whoName) };
        const chats = _chats();
        const cid = Object.keys(chats).find(function (k) { return chats[k] && !chats[k].isGroup && chats[k].name === n; });
        return cid ? { id: cid, name: n } : { id: '', name: n };
    }
    // 執行一個動作：群聊、略過、沒有聊天室都不動手；其餘馬上回，寫入在背後排隊
    function _applyAction(chatId, chatName, a) {
        const chat = _chats()[chatId];
        if (!a || !chatId || (chat && chat.isGroup) || a.verb === 'skip') return { acted: false };
        const who = chatId;
        const whoName = chatName || (chat && chat.name) || '對方';
        _acted[chatId] = Date.now();
        _run(scope(), function (st) {
            if (a.verb === 'post') { _pushPost(st, { author: who, authorName: whoName, text: a.text, photos: a.photos }); return true; }
            const p = st.feed.posts.find(function (x) { return x.no === a.no; });
            if (!p) return false;
            if (!visibleTo(who, st.feed, st.links).some(function (x) { return x.id === p.id; })) return false;
            if (a.verb === 'like') {
                if (p.likes.some(function (l) { return l.who === who; })) return false;
                p.likes.push({ who: who, whoName: whoName, at: _now() });
                return true;
            }
            if (!a.text) return false;
            if (a.verb === 'comment') { p.comments.push(_mkComment(who, whoName, '', '', a.text)); return true; }
            const t = _whoByName(a.toName, p, who);
            p.comments.push(_mkComment(who, whoName, t.id, t.name, a.text));
            return true;
        });
        return { acted: true };
    }
    function actedSince(chatId, ts) { return !!(_acted[chatId] && _acted[chatId] >= ts); }
    // wx_core.parseAndProcess 一開頭交過來：抽掉所有朋友圈標籤並執行，回剩下的字（這些才拆成聊天泡泡）
    function extract(text, chatId, chatName) {
        const acts = [];
        const rest = _scan(text, function (verb, attrs, inner) { const a = _toAction(verb, attrs, inner); if (a) acts.push(a); });
        let acted = false;
        acts.forEach(function (a) { if (_applyAction(chatId, chatName, a).acted) acted = true; });
        return { text: rest, found: acts.length, acted: acted };
    }

    // ── 紅點 ─────────────────────────────────────────────
    function _seenAt() { try { return parseInt(localStorage.getItem(SEEN_KEY(scope())), 10) || 0; } catch (e) { return 0; } }
    // count：角色的動態、讚、留言（她看過之後的）；actor：最新那個人；replies：她動態上的讚留言＋回覆她的
    function unseen() {
        const sc = scope();
        const st = _cache[sc];
        if (!st) { load(sc).then(function () { try { paintBadges(); } catch (e) {} }); return { count: 0, actor: '', replies: 0 }; }
        const seen = _seenAt();
        let count = 0, replies = 0, last = null;
        const hit = function (who, at, toMe) {
            if (who === 'me' || !(at > seen)) return;
            count++;
            if (toMe) replies++;
            if (!last || at >= last.at) last = { who: who, at: at };
        };
        st.feed.posts.forEach(function (p) {
            hit(p.author, p.at, false);
            p.likes.forEach(function (l) { hit(l.who, l.at, p.author === 'me'); });
            p.comments.forEach(function (c) { hit(c.who, c.at, p.author === 'me' || c.toWho === 'me'); });
        });
        return { count: count, actor: last ? last.who : '', replies: replies };
    }
    function markSeen() {
        try { localStorage.setItem(SEEN_KEY(scope()), String(_now())); } catch (e) {}
        try { paintBadges(); } catch (e) {}
    }

    // ── 畫面 ─────────────────────────────────────────
    let _root = null;
    let _author = '';        // 只看某個人時是他的 id；看全部是空字串
    let _replyTo = null;     // 底部輸入列正在回誰：{postId, toWho, toName}
    const COVER_KEY = (s) => 'wx_moments_cover__' + s;

    function _host() { return (win.wxApp && win.wxApp.APP_CONTAINER) || null; }
    function _avatarSrc(who) {
        if (who === 'me') {
            try { const P = win.WX_PROFILE; const pr = P && P.get ? P.get() : null; return { src: (pr && pr.avatar) || '', vn: '' }; } catch (e) { return { src: '', vn: '' }; }
        }
        const c = _chats()[who];
        return { src: (c && c.customAvatar) || '', vn: (c && !c.customAvatar && c.realName) || '' };
    }
    // 頭像：沒有圖就畫名字的第一個字；圖庫編號／VN 立繪交給 wx_view 那支貼，一般網址在 _hydrate 用單一屬性指派
    function _avatarHTML(who, name, cls) {
        const a = _avatarSrc(who);
        const pi = _pi();
        const initial = '<span>' + _esc(String(name || '?').trim().charAt(0) || '?') + '</span>';
        const c = 'wxmo-av' + (cls ? ' ' + cls : '');
        if (a.src && pi && pi.isDbId(a.src)) return '<div class="' + c + ' db-load-target" data-db-bg="' + _esc(a.src) + '">' + initial + '</div>';
        if (a.src) return '<div class="' + c + '" data-url-bg="' + _esc(a.src) + '">' + initial + '</div>';
        if (a.vn) return '<div class="' + c + ' vn-load-target" data-vn-name="' + _esc(a.vn) + '">' + initial + '</div>';
        return '<div class="' + c + '">' + initial + '</div>';
    }
    function _hydrate(root) {
        if (!root || !root.querySelectorAll) return;
        try { const V = win.WX_VIEW || window.WX_VIEW; if (V && V.hydrateAvatars) V.hydrateAvatars(root); } catch (e) {}
        try { const pi = _pi(); if (pi && pi.hydrate) pi.hydrate(root); } catch (e) {}
        root.querySelectorAll('[data-url-bg]:not([data-avt-done])').forEach(function (el) {
            el.setAttribute('data-avt-done', '1');
            el.style.backgroundImage = "url('" + String(el.getAttribute('data-url-bg')).replace(/'/g, '%27') + "')";
        });
    }

    function close() {
        if (_root) { try { _root.remove(); } catch (e) {} }
        _root = null; _author = ''; _replyTo = null;
    }

    async function open(opts) {
        const o = opts || {};
        const host = _host();
        if (!host) return false;
        close();
        _author = o.author || '';
        const dark = !!(host.querySelector && host.querySelector('.wx-dark'));
        _root = d.createElement('div');
        _root.className = 'wxmo-root' + (dark ? ' is-dark' : '');
        const canPost = !_author || _author === 'me';
        _root.innerHTML =
            '<div class="wxmo-bar">' +
            '  <button class="wxmo-bar-btn" type="button" data-act="close"><i class="fa-solid fa-chevron-left"></i></button>' +
            '  <div class="wxmo-bar-t">' + _esc(_author ? _nameOf(_author) : '朋友圈') + '</div>' +
            (canPost ? '  <button class="wxmo-bar-btn" type="button" data-act="compose"><i class="fa-solid fa-camera"></i></button>' : '  <span class="wxmo-bar-pad"></span>') +
            '</div>' +
            '<div class="wxmo-scroll">' +
            '  <div class="wxmo-cover' + (canPost ? ' can-change' : '') + '"><img class="wxmo-cover-img" alt=""><div class="wxmo-cover-hint">' + (canPost ? '點一下換封面' : '') + '</div>' +
            '    <div class="wxmo-cover-who"><span class="wxmo-cover-name"></span><div class="wxmo-cover-av"></div></div>' +
            '  </div>' +
            '  <div class="wxmo-list"></div>' +
            '  <div class="wxmo-empty" hidden><i class="fa-regular fa-images"></i><div>' + (_author ? '還沒有發過動態' : '朋友圈還是空的') + '</div></div>' +
            '</div>' +
            '<div class="wxmo-input" hidden><input class="wxmo-in" type="text" maxlength="' + COMMENT_MAX + '" autocomplete="off"><button class="wxmo-send" type="button" data-act="send">發送</button></div>';
        host.appendChild(_root);
        _bindRoot();
        await load();
        if (!_root) return false;
        _renderCover();
        _renderFeed();
        if (!_author) markSeen();
        return true;
    }

    async function _renderCover() {
        if (!_root) return;
        const who = _author || 'me';
        const name = _nameOf(who);
        _root.querySelector('.wxmo-cover-name').textContent = name;
        const avBox = _root.querySelector('.wxmo-cover-av');
        avBox.innerHTML = _avatarHTML(who, name, 'wxmo-av-lg');
        _hydrate(avBox);
        if (who !== 'me') return;
        let id = '';
        try { id = localStorage.getItem(COVER_KEY(scope())) || ''; } catch (e) {}
        if (!id) return;
        try {
            const db = _db();
            const url = db && db.getImage ? await db.getImage(id) : '';
            if (url && _root) { _root.querySelector('.wxmo-cover-img').src = url; _root.classList.add('has-cover'); }
        } catch (e) {}
    }

    function _photosHTML(p) {
        const pi = _pi();
        if (!p.photos.length) return '';
        return '<div class="wxmo-photos n' + Math.min(p.photos.length, 9) + '">' + p.photos.map(function (ph, i) {
            const inner = pi ? pi.render(ph.src || ph.desc, { fill: true, app: 'wxmo', ref: p.id + '|' + i }) : _esc(ph.desc);
            return '<div class="wxmo-ph">' + inner + '</div>';
        }).join('') + '</div>';
    }
    function _postHTML(p) {
        const name = _nameOf(p.author, p.authorName);
        const likedByMe = p.likes.some(function (l) { return l.who === 'me'; });
        const likes = p.likes.length
            ? '<div class="wxmo-likes"><i class="fa-regular fa-heart"></i><span>' + p.likes.map(function (l) { return _esc(_nameOf(l.who, l.whoName)); }).join('、') + '</span></div>'
            : '';
        const cms = p.comments.map(function (c) {
            return '<div class="wxmo-cm" data-cid="' + _esc(c.id) + '" data-who="' + _esc(c.who) + '">' +
                '<b>' + _esc(_nameOf(c.who, c.whoName)) + '</b>' +
                (c.toWho || c.toName ? '<i>回覆</i><b>' + _esc(c.toWho ? _nameOf(c.toWho, c.toName) : c.toName) + '</b>' : '') +
                '<span>：' + _esc(c.text) + '</span></div>';
        }).join('');
        return '<div class="wxmo-post" data-id="' + _esc(p.id) + '">' +
            _avatarHTML(p.author, name) +
            '<div class="wxmo-main">' +
            '  <div class="wxmo-name">' + _esc(name) + '</div>' +
            (p.text ? '  <div class="wxmo-text">' + _esc(p.text) + '</div>' : '') +
            _photosHTML(p) +
            '  <div class="wxmo-meta"><span class="wxmo-time">' + _ago(p.at) + '</span>' +
            '    <button class="wxmo-del" type="button" data-act="delpost">刪除</button>' +
            '    <span class="wxmo-sp"></span>' +
            '    <div class="wxmo-pop" hidden>' +
            '      <button type="button" data-act="like"><i class="' + (likedByMe ? 'fa-solid' : 'fa-regular') + ' fa-heart"></i><span>' + (likedByMe ? '取消' : '讚') + '</span></button>' +
            '      <button type="button" data-act="comment"><i class="fa-regular fa-comment"></i><span>評論</span></button>' +
            '    </div>' +
            '    <button class="wxmo-more" type="button" data-act="more"><i class="fa-solid fa-ellipsis"></i></button>' +
            '  </div>' +
            (likes || cms ? '  <div class="wxmo-social">' + likes + (cms ? '<div class="wxmo-cms">' + cms + '</div>' : '') + '</div>' : '') +
            '</div></div>';
    }
    function _renderFeed() {
        if (!_root) return;
        const st = _cache[scope()];
        if (!st) return;
        const list = st.feed.posts.filter(function (p) { return !_author || p.author === _author; }).slice().reverse();
        const box = _root.querySelector('.wxmo-list');
        box.innerHTML = list.map(_postHTML).join('');
        _root.querySelector('.wxmo-empty').hidden = list.length > 0;
        _hydrate(box);
    }

    function _closePops() { if (_root) _root.querySelectorAll('.wxmo-pop').forEach(function (x) { x.hidden = true; }); }
    function _startInput(postId, toWho, toName) {
        if (!_root) return;
        _replyTo = { postId: postId, toWho: toWho || '', toName: toName || '' };
        const bar = _root.querySelector('.wxmo-input');
        const inp = bar.querySelector('.wxmo-in');
        bar.hidden = false;
        inp.value = '';
        inp.placeholder = toName ? '回覆 ' + toName : '評論';
        try { inp.focus(); } catch (e) {}
    }
    function _stopInput() {
        if (!_root) return;
        _replyTo = null;
        _root.querySelector('.wxmo-input').hidden = true;
    }
    async function _send() {
        if (!_root || !_replyTo) return;
        const inp = _root.querySelector('.wxmo-in');
        const text = inp.value.trim();
        if (!text) return;
        const r = _replyTo;
        _stopInput();
        const c = await addComment(r.postId, { who: 'me', whoName: _userName(), toWho: r.toWho, toName: r.toName, text: text });
        if (!c) { const A = _aui(); if (A && A.toast) A.toast('留不上去，再試一次'); }
    }

    function _bindRoot() {
        const scroller = _root.querySelector('.wxmo-scroll');
        scroller.addEventListener('scroll', function () {
            if (_root) _root.classList.toggle('is-scrolled', scroller.scrollTop > 180);
        });
        _root.querySelector('.wxmo-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); _send(); } });
        _root.addEventListener('click', async function (e) {
            const t = e.target;
            if (!t || !t.closest) return;
            const actEl = t.closest('[data-act]');
            const act = actEl ? actEl.dataset.act : '';
            const post = t.closest('.wxmo-post');
            const pid = post ? post.dataset.id : '';
            if (act === 'close') { close(); return; }
            if (act === 'compose') { _openComposer(); return; }
            if (act === 'send') { _send(); return; }
            if (act === 'more' && post) {
                const pop = post.querySelector('.wxmo-pop');
                const wasHidden = pop.hidden;
                _closePops();
                pop.hidden = !wasHidden;
                return;
            }
            if (act === 'like' && pid) { _closePops(); await toggleLike(pid, 'me', _userName()); return; }
            if (act === 'comment' && pid) { _closePops(); _startInput(pid, '', ''); return; }
            if (act === 'delpost' && pid) {
                const A = _aui();
                const okDel = A && A.confirm ? await A.confirm('刪掉這則動態？') : true;
                if (okDel) await removePost(pid);
                return;
            }
            const cm = t.closest('.wxmo-cm');
            if (cm && pid) {
                const who = cm.dataset.who;
                if (who === 'me') {
                    const A = _aui();
                    const okDel = A && A.confirm ? await A.confirm('刪掉這則留言？') : true;
                    if (okDel) await removeComment(pid, cm.dataset.cid);
                } else {
                    const b = cm.querySelector('b');
                    _startInput(pid, who, _nameOf(who, b ? b.textContent : ''));
                }
                return;
            }
            if (t.closest('.wxmo-cover.can-change')) { _pickCover(); return; }
            if (!t.closest('.wxmo-input')) { _closePops(); _stopInput(); }
        });
    }

    async function _saveBlob(prefix, dataUrl) {
        const db = _db();
        if (!db || !db.saveImage) throw new Error('圖庫還沒準備好');
        const blob = await (await fetch(dataUrl)).blob();
        const id = prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        await db.saveImage(id, blob);
        return id;
    }
    async function _pickCover() {
        const pi = _pi();
        if (!pi || !pi.pickPhoto) return;
        let dataUrl = '';
        try { dataUrl = await pi.pickPhoto({ maxSide: 1600 }); } catch (e) { return; }
        if (!dataUrl) return;
        try {
            const id = await _saveBlob('img_wxmo_cover_', dataUrl);
            localStorage.setItem(COVER_KEY(scope()), id);
            _renderCover();
        } catch (e) { const A = _aui(); if (A && A.toast) A.toast('封面換不上去'); }
    }

    function _openComposer() {
        if (!_root) return;
        const draft = { photos: [] };
        const sheet = d.createElement('div');
        sheet.className = 'wxmo-compose';
        sheet.innerHTML =
            '<div class="wxmo-compose-bar">' +
            '  <button class="wxmo-compose-x" type="button" data-cact="cancel">取消</button>' +
            '  <span class="wxmo-sp"></span>' +
            '  <button class="wxmo-compose-ok" type="button" data-cact="post">發表</button>' +
            '</div>' +
            '<textarea class="wxmo-compose-in" maxlength="' + TEXT_MAX + '" placeholder="這一刻的想法…"></textarea>' +
            '<div class="wxmo-compose-photos"></div>';
        _root.appendChild(sheet);
        const paint = function () {
            const box = sheet.querySelector('.wxmo-compose-photos');
            const pi = _pi();
            const tiles = draft.photos.map(function (id, i) {
                return '<div class="wxmo-tile">' + (pi ? pi.render(id, { fill: true }) : '') + '<button class="wxmo-tile-x" type="button" data-rm="' + i + '"><i class="fa-solid fa-xmark"></i></button></div>';
            });
            if (draft.photos.length < PHOTO_MAX) tiles.push('<button class="wxmo-tile wxmo-tile-add" type="button" data-cact="addph"><i class="fa-solid fa-plus"></i></button>');
            box.innerHTML = tiles.join('');
            _hydrate(box);
        };
        paint();
        sheet.addEventListener('click', async function (e) {
            e.stopPropagation();
            if (!e.target || !e.target.closest) return;
            const rm = e.target.closest('[data-rm]');
            if (rm) { draft.photos.splice(parseInt(rm.dataset.rm, 10), 1); paint(); return; }
            const b = e.target.closest('[data-cact]');
            const act = b ? b.dataset.cact : '';
            if (act === 'cancel') { sheet.remove(); return; }
            if (act === 'addph') {
                const pi = _pi();
                if (!pi || !pi.pickPhoto) return;
                let dataUrl = '';
                try { dataUrl = await pi.pickPhoto(); } catch (err) { return; }
                if (!dataUrl) return;
                try { draft.photos.push(await _saveBlob('img_wxmo_', dataUrl)); paint(); }
                catch (err) { const A = _aui(); if (A && A.toast) A.toast('照片存不進去'); }
                return;
            }
            if (act === 'post') {
                const text = sheet.querySelector('.wxmo-compose-in').value.trim();
                if (!text && !draft.photos.length) return;
                b.disabled = true;
                try {
                    await addPost({ author: 'me', authorName: _userName(), text: text, photos: draft.photos.map(function (id) { return { src: id, desc: '' }; }) });
                    sheet.remove();
                    const sc = _root && _root.querySelector('.wxmo-scroll');
                    if (sc) sc.scrollTop = 0;
                } catch (err) {
                    b.disabled = false;
                    const A = _aui(); if (A && A.toast) A.toast('發不出去，再試一次');
                }
            }
        });
    }

    // 認識的人：同一個故事的一對一聊天室，逐個切換。打開的兩個人才看得到彼此的讚和留言。
    async function openLinks(chatId) {
        const host = _host();
        if (!host || !chatId) return false;
        await load();
        const chats = _chats();
        const others = Object.keys(chats).map(function (k) { return chats[k]; })
            .filter(function (c) { return c && c.id !== chatId && !c.isGroup && !c.wxRemoved; });
        const page = d.createElement('div');
        page.className = 'wxmo-links';
        page.innerHTML =
            '<div class="wxmo-links-bar"><button class="wxmo-bar-btn" type="button" data-act="back"><i class="fa-solid fa-chevron-left"></i></button>' +
            '<div class="wxmo-links-t">' + _esc(_nameOf(chatId)) + ' 認識的人</div><span class="wxmo-bar-pad"></span></div>' +
            '<div class="wxmo-links-note">打開的人，在朋友圈看得到彼此的讚和留言</div>' +
            '<div class="wxmo-links-list"></div>';
        const paint = function () {
            const on = linksOf(chatId);
            page.querySelector('.wxmo-links-list').innerHTML = others.length
                ? others.map(function (c) {
                    return '<div class="wxmo-link' + (on.indexOf(c.id) >= 0 ? ' on' : '') + '" data-id="' + _esc(c.id) + '">' +
                        _avatarHTML(c.id, c.name) + '<div class="wxmo-link-name">' + _esc(c.name) + '</div><div class="wxmo-switch"></div></div>';
                }).join('')
                : '<div class="wxmo-links-empty">這個故事裡還沒有其他人</div>';
            _hydrate(page);
        };
        host.appendChild(page);
        paint();
        page.addEventListener('click', async function (e) {
            if (!e.target || !e.target.closest) return;
            if (e.target.closest('[data-act="back"]')) { page.remove(); return; }
            const row = e.target.closest('.wxmo-link');
            if (!row) return;
            const turnOn = !row.classList.contains('on');
            row.classList.toggle('on', turnOn);
            await setLink(chatId, row.dataset.id, turnOn);
            paint();
        });
        return true;
    }

    // 紅點：「我」分頁一顆點；朋友圈那格右邊是最新那個人的小頭像＋點（她動態上有人互動就換成數字）
    function paintBadges(root) {
        const host = root || _host();
        if (!host || !host.querySelectorAll) return;
        const u = unseen();
        const any = u.count > 0;
        host.querySelectorAll('[data-wxmo-badge="tab"]').forEach(function (el) { el.hidden = !any; });
        host.querySelectorAll('[data-wxmo-badge="cell"]').forEach(function (el) {
            if (!any) { el.hidden = true; el.innerHTML = ''; return; }
            el.hidden = false;
            el.innerHTML = (u.actor ? _avatarHTML(u.actor, _nameOf(u.actor), 'wxmo-av-xs') : '') +
                (u.replies ? '<span class="wxmo-num">' + u.replies + '</span>' : '<span class="wxmo-dot"></span>');
            _hydrate(el);
        });
    }

    // 角色描述的照片按「展開圖片」生完 → 寫回那一則
    try {
        const pi = _pi();
        if (pi && pi.onDone) pi.onDone('wxmo', function (ref, url) {
            const parts = String(ref || '').split('|');
            const postId = parts[0], idx = parseInt(parts[1], 10);
            if (!postId || isNaN(idx)) return;
            return _run(scope(), function (st) {
                const p = _post(st, postId);
                if (!p || !p.photos[idx]) return false;
                p.photos[idx].src = url;
                return true;
            });
        });
    } catch (e) {}

    win.WX_MOMENTS = {
        open: open, close: close, openLinks: openLinks,
        _avatarHTML: _avatarHTML, _hydrate: _hydrate, _nameOf: _nameOf,
        scope: scope, load: load, onChange: onChange, _flush: _flush,
        addPost: addPost, toggleLike: toggleLike, addComment: addComment,
        removePost: removePost, removeComment: removeComment,
        setLink: setLink, linksOf: linksOf, visibleTo: visibleTo,
        brief: brief, parseTags: parseTags, strip: strip, extract: extract, actedSince: actedSince,
        unseen: unseen, markSeen: markSeen, paintBadges: paintBadges
    };
    if (win !== window) { try { window.WX_MOMENTS = win.WX_MOMENTS; } catch (e) {} }
})();
