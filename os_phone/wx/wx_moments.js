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
//   ・不寫進大總結、不寫進正文記憶；她在朋友圈做的事（跟別人對她動態做的事）走手機事件簿，下一輪交給劇情一次。
//   ・劇情裡的朋友圈：正文 <moments> 容器（格式見「劇情裡的朋友圈」那段），跑團同步收進來；劇情播放時 vn_moments.js 借這裡的畫法。
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

    // 🏠 常駐角色（聊天室蓋大廳章）發的動態，存在大廳那一本，每個故事都併進來看。
    //    編號從 1001 起，跟各本自己的 1、2、3 不會撞（AI 用「動態幾號」指是哪一則）。
    //    別本故事的人在那則底下的讚、留言，在這本裡看不到（只留我、跟這本聊天列表裡有的人）。
    const LOBBY_NO_BASE = 1001;
    function _lobbyScope() { const db = _db(); return (db && db.LOBBY_ID) || ''; }
    function _isLobbyWho(who) { const L = _lobbyScope(); const c = _chats()[who]; return !!(L && c && c.tavernChatId === L); }
    function _here(p) {
        const ok = function (w) { return w === 'me' || !!_chats()[w]; };
        return Object.assign({}, p, {
            likes: (p.likes || []).filter(function (l) { return ok(l.who); }),
            comments: (p.comments || []).filter(function (c) { return ok(c.who); }).map(function (c) {
                return (c.toWho && !ok(c.toWho)) ? Object.assign({}, c, { toWho: '', toName: '' }) : c;
            })
        });
    }
    function _viewOf(st, lb) {
        if (!lb || lb === st) return st;
        return { feed: { posts: st.feed.posts.concat(lb.feed.posts.map(_here)).sort(function (a, b) { return a.at - b.at; }) }, links: st.links };
    }
    // 這本＋大廳那本併起來看
    async function _view() {
        const st = await load();
        const L = _lobbyScope();
        return _viewOf(st, (L && scope() !== L) ? await load(L) : null);
    }
    function _viewSync() {
        const st = _cache[scope()];
        if (!st) return null;
        const L = _lobbyScope();
        if (!L || scope() === L) return st;
        return _cache[L] ? _viewOf(st, _cache[L]) : null;
    }
    // 這則動態存在哪一本
    function _scopeOfPost(id) {
        const L = _lobbyScope();
        const lb = L && _cache[L];
        return (lb && lb.feed.posts.some(function (x) { return x.id === id; })) ? L : scope();
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
            const _base = (s && s === _lobbyScope()) ? LOBBY_NO_BASE : 1;
            if (!feed || !Array.isArray(feed.posts)) feed = { nextNo: _base, posts: [] };
            if (!(feed.nextNo >= _base)) feed.nextNo = feed.posts.reduce(function (m, p) { return Math.max(m, p.no || 0); }, _base - 1) + 1;
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
    function _flush() { const L = _lobbyScope(); return Promise.all([_queue[scope()] || Promise.resolve(), (L && _queue[L]) || Promise.resolve()]); }
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
        const sc = _isLobbyWho(p && p.author) ? _lobbyScope() : scope();
        return _run(sc, function (st) { out = _pushPost(st, p); return true; }).then(function () { return out; });
    }
    function toggleLike(postId, who, whoName) {
        let liked = false;
        return _run(_scopeOfPost(postId), function (st) {
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
        return _run(_scopeOfPost(postId), function (st) {
            const p = _post(st, postId);
            const text = String((c && c.text) || '').trim();
            if (!p || !text) return false;
            out = _mkComment(c.who, c.whoName, c.toWho, c.toName, text);
            p.comments.push(out);
            return true;
        }).then(function () { return out; });
    }
    function removePost(postId) {
        return _run(_scopeOfPost(postId), function (st) {
            const before = st.feed.posts.length;
            // 劇情同步進來的那則，她刪了就記著：下次同步不再放回來
            const p = _post(st, postId);
            if (p && p.storyKey) {
                const h = st.feed.hiddenStory = st.feed.hiddenStory || [];
                if (h.indexOf(p.storyKey) < 0) h.push(p.storyKey);
            }
            st.feed.posts = st.feed.posts.filter(function (x) { return x.id !== postId; });
            return st.feed.posts.length !== before;
        });
    }
    function removeComment(postId, commentId) {
        return _run(_scopeOfPost(postId), function (st) {
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
    // ── 她發的動態裡的照片：只給它看一次（共用 OS_PHONE_IMAGE.lookOnce，照設置「看圖」那格）──
    //   看過的描述存回那張照片的 desc，之後 brief 裡的「照片 N 張：…」就帶著描述，圖不再送。
    //   以前沒接：她發的照片角色只知道「照片 N 張」。
    let _phBatch = { refs: [] };
    async function photoOnceMessage(chatId) {
        _phBatch = { refs: [] };
        if (!chatId) return null;
        const chat = _chats()[chatId];
        if (chat && chat.isGroup) return null;
        const pi = _pi();
        if (!pi || !pi.lookOnce) return null;
        const st = await _view();
        const seen = visibleTo(chatId, st.feed, st.links).slice(-BRIEF_POSTS);
        const cand = [], info = new Map();
        seen.forEach(function (p) {
            if (p.author !== 'me') return;
            (p.photos || []).forEach(function (ph, i) {
                if (ph && ph.src && pi.isDbId(ph.src)) { cand.push(ph); info.set(ph, { post: p, i: i }); }
            });
        });
        const got = await pi.lookOnce(cand, { src: function (ph) { return ph.src; }, descKey: 'desc', triesKey: 'tries', max: 3,
            about: '這是發在朋友圈動態裡的照片。' });
        if (!got) return null;
        _savePhotosOf(got.used, info);
        const where = function (ph) { const x = info.get(ph); return '動態' + x.post.no + (x.post.photos.length > 1 ? ' 的第 ' + (x.i + 1) + ' 張' : ' 的照片'); };
        const who = _userName() || '對方';
        if (got.mode === 'helper') {
            const lines = [];
            got.used.forEach(function (ph, i) { if (got.descs[i]) lines.push(where(ph) + '：' + got.descs[i]); });
            if (!lines.length) return null;
            return { role: 'user', content: '（這是' + who + '發在朋友圈的照片。' + lines.join('；') + '。）' };
        }
        _phBatch.refs = got.used.map(function (ph) { return { ph: ph, info: info.get(ph) }; });
        const n = got.used.length;
        const text = '（這是' + who + '發在朋友圈的' + (n > 1 ? ' ' + n + ' 張照片，照順序是' : '照片，在') + got.used.map(where).join('、') + '。'
            + '看完在回覆的最後，' + (n > 1 ? '每張各' : '') + '單獨一行寫：[系統: 朋友圈照片 ' + (n > 1 ? '編號' : '1') + ' 一句話描述]，'
            + '之後就不用再看圖了。那一行不會變成聊天訊息。）';
        return { role: 'user', content: [{ type: 'text', text: text }].concat(got.parts) };
    }
    function _savePhotosOf(phs, info) {
        const scopes = {};
        (phs || []).forEach(function (ph) { const x = info.get(ph); if (x) scopes[_scopeOfPost(x.post.id) || ''] = true; });
        Object.keys(scopes).forEach(function (sc) { _run(sc || scope(), function () { return true; }).catch(function () {}); });
    }
    function rememberPhoto(num, desc) {
        const s = String(desc || '').replace(/\]+\s*$/, '').trim();
        const refs = _phBatch.refs;
        if (!s || !refs.length) return false;
        const x = (num >= 1 && num <= refs.length) ? refs[num - 1] : refs.find(function (r) { return !r.ph.desc; });
        if (!x) return false;
        x.ph.desc = s.slice(0, 300);
        const m = new Map(); m.set(x.ph, x.info);
        _savePhotosOf([x.ph], m);
        return true;
    }

    async function brief(chatId) {
        if (!chatId) return '';
        const chat = _chats()[chatId];
        if (chat && chat.isGroup) return '';
        const st = await _view();
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
        // 發文：大廳的人發到大廳那本；讚／留言：1001 號以後的是大廳那本的
        const sc = (a.verb === 'post') ? (_isLobbyWho(who) ? _lobbyScope() : scope())
                 : ((a.no >= LOBBY_NO_BASE && _lobbyScope()) ? _lobbyScope() : scope());
        _run(sc, function (st) {
            if (a.verb === 'post') { _pushPost(st, { author: who, authorName: whoName, text: a.text, photos: a.photos }); return true; }
            const p = st.feed.posts.find(function (x) { return x.no === a.no; });
            if (!p) return false;
            const v = _viewSync() || st;   // 看不看得到照這本的「認識的人」算
            if (!visibleTo(who, v.feed, v.links).some(function (x) { return x.id === p.id; })) return false;
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

    // ── 📖 劇情裡的朋友圈（正文的 <moments> 容器）──────────────────
    //   正文 AI 照 VN 指令「朋友圈格式」寫，一行一件事、英文標籤、第一格是動態的編號（它自己取，之後照抄）：
    //     <moments>                 ← 別人的手機才加 owner="名"，那種不進她的手機
    //     [Post|編號|發文的人|內容]
    //     [Photo|編號|給人看的一句 >> 畫圖的英文句子]
    //     [Like|編號|按讚的人]
    //     [Comment|編號|留言的人|內容]
    //     [Reply|編號|留言的人|回覆誰|內容]
    //     </moments>
    //   劇情播放時 vn_moments.js 用下面同一支解析、借這裡的畫法畫；跑團同步（wx_core）整本正文掃過一次交給 syncStory。
    //   🚨 同步每次整份重建：劇情那幾則帶 storyKey、讚留言帶 story:1；她自己按的讚留的言不帶，永遠留著。
    //      正文裡已經沒有的（回朔、刪樓）整則拿掉；她自己刪掉的記在 hiddenStory，不再放回來。
    const STORY_BLOCK_RE = /<moments\b([^>]*)>([\s\S]*?)<\/moments\s*>/gi;
    const STORY_LINE_RE = /^\[\s*(Post|Photo|Like|Comment|Reply)\s*[|｜]([\s\S]*)\]\s*$/i;
    // AI 常在尾巴多補一格「沒有」（她 09-24 截圖：[Post|moment_101|方尽|无聊。|none] → 畫面上印出「无聊。|none」）
    const NONE_RE = /^(?:none|null|nil|n\/a|無|无|空|沒有|没有|-+|—+)?$/i;
    function _body(parts) {
        const a = parts.slice();
        while (a.length && NONE_RE.test(a[a.length - 1])) a.pop();
        return a.join('|').trim();
    }
    function parseStoryLine(line) {
        const m = String(line || '').trim().match(STORY_LINE_RE);
        if (!m) return null;
        const verb = m[1].toLowerCase();
        const p = m[2].split('|').map(function (x) { return x.trim(); });
        const sid = p[0] || '';
        if (!sid) return null;
        if (verb === 'post') {
            if (!p[1]) return null;
            // 照片塞在發文那一行裡（她 09-25 截圖：[Post|編號|游星|光線很好。[Photo|編號_p1|… >> …]]）→ 拆出來當這則的照片，內文不留那串格式
            const photos = [];
            const text = _body(p.slice(2)).replace(EMBED_PHOTO_RE, function (all, body) {
                const f = body.split(/[|｜]/).map(function (x) { return x.trim(); });
                const desc = (f.length > 1 && f[0].indexOf('>>') < 0) ? f.slice(1).join('|').trim() : f.join('|').trim();
                if (desc) photos.push(desc);
                return '';
            }).trim();
            const it = { verb: verb, sid: sid, who: p[1], text: text };
            if (photos.length) it.photos = photos;
            return it;
        }
        if (verb === 'photo') { const desc = _body(p.slice(1)); return desc ? { verb: verb, sid: sid, text: desc } : null; }
        // 一行寫了好幾個人（[Like|編號|沈喜喜, 驰翊]）：拆開，一人一個讚
        if (verb === 'like') {
            const whos = p.slice(1).join(',').split(/[,，、;；]/).map(function (x) { return x.trim(); }).filter(function (x, i, a) { return x && !NONE_RE.test(x) && a.indexOf(x) === i; });
            return whos.length ? { verb: verb, sid: sid, who: whos[0], whos: whos } : null;
        }
        if (verb === 'comment') { const t = _body(p.slice(2)); return (p[1] && t) ? { verb: verb, sid: sid, who: p[1], text: t } : null; }
        // 少了「回覆誰」那格（[Reply|編號|游星|不辛苦…]）：以前整行丟掉。當成回覆，對象由疊的那邊照前面的留言補（_storyReplyTo）
        if (p.length === 3) return (p[1] && p[2]) ? { verb: 'reply', sid: sid, who: p[1], to: '', text: p[2] } : null;
        const t = _body(p.slice(3));
        return (p[1] && t) ? { verb: 'reply', sid: sid, who: p[1], to: p[2] || '', text: t } : null;
    }
    const EMBED_PHOTO_RE = /\[\s*(?:Photo|圖片|图片|照片)\s*[|｜:：]([^\[\]]*)\]/gi;
    // 回覆沒寫回覆誰：回給這則底下最後一個不是自己的留言者；沒有就回給發文的人；發文的就是自己＝當普通留言
    //   comments 的每筆有 who／whoName，post 有 who／whoName（兩邊——劇情播放、同步——長一樣）
    function _storyReplyTo(post, who) {
        const cs = (post && post.comments) || [];
        for (let i = cs.length - 1; i >= 0; i--) if (cs[i].who && cs[i].who !== who) return { who: cs[i].who, name: cs[i].whoName || '' };
        const a = post && (post.who || post.author);
        return (a && a !== who) ? { who: a, name: post.whoName || post.authorName || '' } : null;
    }
    // 照片指到一個沒發過的編號（AI 給照片自己取了編號：moment_104_p1）：前綴對得到哪則就是那則，都對不到就是最後發的那則
    function _photoHost(sid, sids) {
        let best = '';
        (sids || []).forEach(function (s) { if (s && sid.indexOf(s) === 0 && s.length > best.length) best = s; });
        return best || (sids && sids.length ? sids[sids.length - 1] : '');
    }
    // 一則正文 → [{ owner, items:[…] }]（一個容器一筆）
    function parseStory(text) {
        const out = [];
        const s = String(text || '');
        if (s.indexOf('<moments') < 0) return out;
        STORY_BLOCK_RE.lastIndex = 0;
        let bm;
        while ((bm = STORY_BLOCK_RE.exec(s))) {
            const owner = ((bm[1] || '').match(/\bowner\s*=\s*["'“”]?([^"'“”>]*)/i) || [])[1] || '';
            const items = [];
            (bm[2] || '').split(/\r?\n/).forEach(function (ln) {
                const it = parseStoryLine(ln);
                if (!it) return;
                if (it.whos) it.whos.forEach(function (w) { items.push({ verb: 'like', sid: it.sid, who: w }); });
                else if (it.photos) { const ps = it.photos; delete it.photos; items.push(it); ps.forEach(function (d) { items.push({ verb: 'photo', sid: it.sid, text: d }); }); }
                else items.push(it);
            });
            out.push({ owner: owner.trim(), items: items });
        }
        return out;
    }
    // 照順序疊成「劇情裡每一則現在長什麼樣」。list 的每一筆已經把名字換成 who（'me'／聊天室 id／'npc:名字'）。
    //   同一個編號換了人發＝另一則（AI 在不同章節重用了編號），之後指這個編號的都算新的那則。
    function _storyPlan(list) {
        const posts = {}, order = [], cur = {}, used = {};
        (list || []).forEach(function (it) {
            const sid = String((it && it.sid) || '').trim();
            if (!sid) return;
            if (it.verb === 'post') {
                let key = cur[sid];
                if (key && posts[key].who !== it.who) key = '';
                if (!key) {
                    used[sid] = (used[sid] || 0) + 1;
                    key = 's:' + sid + (used[sid] > 1 ? '#' + used[sid] : '');
                    cur[sid] = key;
                    posts[key] = { key: key, who: it.who, whoName: it.whoName || '', text: '', photos: [], likes: [], comments: [] };
                    order.push(key);
                }
                if (it.text) posts[key].text = it.text;
                return;
            }
            let p = cur[sid] ? posts[cur[sid]] : null;
            if (!p && it.verb === 'photo') { const h = _photoHost(sid, Object.keys(cur)); p = h ? posts[cur[h]] : null; }
            if (!p) return;   // 指到劇情裡沒發過的動態：不收
            if (it.verb === 'photo') { if (!p.photos.some(function (x) { return x.desc === it.text; })) p.photos.push({ desc: it.text }); return; }
            if (it.verb === 'like') { if (!p.likes.some(function (x) { return x.who === it.who; })) p.likes.push({ who: it.who, whoName: it.whoName || '' }); return; }
            const c = { who: it.who, whoName: it.whoName || '', toWho: it.verb === 'reply' ? (it.toWho || '') : '', toName: it.verb === 'reply' ? (it.toName || '') : '', text: it.text };
            if (it.verb === 'reply' && !c.toWho && !c.toName) { const r = _storyReplyTo(p, it.who); if (r) { c.toWho = r.who; c.toName = r.name; } }
            // 同一句重演一次（AI 重播整個朋友圈）不算兩條
            if (!p.comments.some(function (x) { return x.who === c.who && x.toWho === c.toWho && x.toName === c.toName && x.text === c.text; })) p.comments.push(c);
        });
        return { posts: posts, order: order };
    }
    function syncStory(list) {
        const sc = scope();
        if (!sc) return Promise.resolve(false);
        const plan = _storyPlan(list);
        return _run(sc, function (st) {
            const before = JSON.stringify(st.feed.posts);
            const hidden = st.feed.hiddenStory || [];
            const byKey = {};
            st.feed.posts.forEach(function (p) { if (p.storyKey) byKey[p.storyKey] = p; });
            st.feed.posts = st.feed.posts.filter(function (p) { return !p.storyKey || (plan.posts[p.storyKey] && hidden.indexOf(p.storyKey) < 0); });
            plan.order.forEach(function (key) {
                if (hidden.indexOf(key) >= 0) return;
                const d = plan.posts[key];
                let p = byKey[key];
                if (!p) { p = _pushPost(st, { author: d.who, authorName: d.whoName, text: '', photos: [] }); p.storyKey = key; }
                p.author = d.who;
                p.authorName = String(d.whoName || '');
                p.text = String(d.text || '').slice(0, TEXT_MAX);
                const oldPh = p.photos || [];
                p.photos = d.photos.slice(0, PHOTO_MAX).map(function (ph) {
                    const o = oldPh.find(function (x) { return x.desc === ph.desc; });
                    return { src: (o && o.src) || '', desc: String(ph.desc).slice(0, 300) };
                });
                const natL = p.likes.filter(function (l) { return !l.story; });
                const oldL = p.likes.filter(function (l) { return l.story; });
                p.likes = natL.concat(d.likes.filter(function (l) { return !natL.some(function (n) { return n.who === l.who; }); }).map(function (l) {
                    const o = oldL.find(function (x) { return x.who === l.who; });
                    return { who: l.who, whoName: l.whoName, at: o ? o.at : _now(), story: 1 };
                }));
                const natC = p.comments.filter(function (c) { return !c.story; });
                const oldC = p.comments.filter(function (c) { return c.story; });
                const stC = d.comments.map(function (c) {
                    const o = oldC.find(function (x) { return x.who === c.who && x.toWho === c.toWho && x.text === c.text; });
                    const nc = o ? Object.assign({}, o, { whoName: c.whoName, toName: c.toName }) : _mkComment(c.who, c.whoName, c.toWho, c.toName, c.text);
                    nc.story = 1;
                    return nc;
                });
                p.comments = natC.concat(stC).sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
            });
            return JSON.stringify(st.feed.posts) !== before;
        });
    }
    // 劇情播放時，這一段的讚留言指到前面章節發的那則：拿同步進來的那一份（同一編號換過人的，拿最後那一則）
    function findStory(sid) {
        const st = _viewSync();
        if (!st || !sid) return null;
        const base = 's:' + String(sid).trim();
        let hit = null, n = 0;
        st.feed.posts.forEach(function (p) {
            if (!p.storyKey) return;
            if (p.storyKey === base) { if (!hit) { hit = p; n = 1; } return; }
            const m = p.storyKey.indexOf(base + '#') === 0 ? parseInt(p.storyKey.slice(base.length + 1), 10) : 0;
            if (m > n) { hit = p; n = m; }
        });
        return hit ? _clone(hit) : null;
    }

    // ── 手機事件簿（手機上剛發生的事只交劇情一次）：她在朋友圈做的事、別人對她的動態做的事 ──
    //   劇情同步進來的那幾則（story）正文本來就有，不算。角色自己發的動態也不算（跟微博那格一樣，只收跟她有關的）。
    async function _eventsSince(cid, from) {
        const st = await load(cid == null ? scope() : String(cid));
        const me = _userName();
        const cut = function (t) { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > 60 ? t.slice(0, 60) + '…' : t; };
        const evs = [];
        st.feed.posts.forEach(function (p) {
            const mine = p.author === 'me';
            const about = '「' + (cut(p.text) || (p.photos.length ? '照片' : '')) + '」';
            const whose = mine ? me + '的' : _nameOf(p.author, p.authorName) + '的';
            if (mine && !p.storyKey && p.at > from) {
                evs.push({ at: p.at, line: '・' + me + '發了一則朋友圈：' + cut(p.text) + (p.photos.length ? '（附了 ' + p.photos.length + ' 張照片）' : '') });
            }
            p.likes.forEach(function (l) {
                if (l.story || !(l.at > from)) return;
                if (l.who === 'me') evs.push({ at: l.at, line: '・' + me + '讚了' + whose + '朋友圈' + about });
                else if (mine) evs.push({ at: l.at, line: '・' + _nameOf(l.who, l.whoName) + '讚了' + me + '的朋友圈' + about });
            });
            p.comments.forEach(function (c) {
                if (c.story || !(c.at > from)) return;
                const act = c.toWho ? '回覆 ' + (c.toWho === 'me' ? me : _nameOf(c.toWho, c.toName)) : '留言';
                if (c.who === 'me') evs.push({ at: c.at, line: '・' + me + '在' + whose + '朋友圈' + about + '底下' + act + '：' + cut(c.text) });
                else if (mine || c.toWho === 'me') evs.push({ at: c.at, line: '・' + _nameOf(c.who, c.whoName) + '在' + whose + '朋友圈' + about + '底下' + act + '：' + cut(c.text) });
            });
        });
        if (!evs.length) return [];
        evs.sort(function (a, b) { return a.at - b.at; });
        return [{ name: '朋友圈', last: evs[evs.length - 1].at, lines: evs.map(function (e) { return e.line; }) }];
    }
    (function registerSource(n) {
        const B = win.OS_PHONE_EVENTS;
        if (B && B.addSource) { B.addSource('wxmo', _eventsSince); return; }
        if (n > 0) setTimeout(function () { registerSource(n - 1); }, 500);
    })(20);

    // ── 紅點 ─────────────────────────────────────────────
    function _seenAt() { try { return parseInt(localStorage.getItem(SEEN_KEY(scope())), 10) || 0; } catch (e) { return 0; } }
    // count：角色的動態、讚、留言（她看過之後的）；actor：最新那個人；replies：她動態上的讚留言＋回覆她的
    function unseen() {
        const st = _viewSync();
        if (!st) { _view().then(function () { try { paintBadges(); } catch (e) {} }); return { count: 0, actor: '', replies: 0 }; }
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
        // 劇情裡按讚留言的路人（不在通訊錄）：頭像照劇情立繪那一庫找名字
        if (String(who || '').indexOf('npc:') === 0) return { src: '', vn: String(who).slice(4) };
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
        await _view();
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
        const st = _viewSync();
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
        _avatarHTML: _avatarHTML, _hydrate: _hydrate, _nameOf: _nameOf, _postHTML: _postHTML,
        parseStory: parseStory, parseStoryLine: parseStoryLine, syncStory: syncStory, findStory: findStory, _storyPlan: _storyPlan, _storyReplyTo: _storyReplyTo, _photoHost: _photoHost, _eventsSince: _eventsSince,
        scope: scope, load: load, onChange: onChange, _flush: _flush,
        addPost: addPost, toggleLike: toggleLike, addComment: addComment,
        removePost: removePost, removeComment: removeComment,
        setLink: setLink, linksOf: linksOf, visibleTo: visibleTo,
        brief: brief, photoOnceMessage: photoOnceMessage, rememberPhoto: rememberPhoto, parseTags: parseTags, strip: strip, extract: extract, actedSince: actedSince,
        unseen: unseen, markSeen: markSeen, paintBadges: paintBadges
    };
    if (win !== window) { try { window.WX_MOMENTS = win.WX_MOMENTS; } catch (e) {} }
})();
