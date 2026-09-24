// ----------------------------------------------------------------
// [檔案] vn_moments.js (獨立擴充模組)
// 路徑：os_phone/vn_story/vn_moments.js
// 職責：VN 播放器裡的手機朋友圈（跟 Chat / Call / 瀏覽器 / 導航同一個手機殼的第五個面）
//   正文：<moments> … </moments>（別人的手機加 owner="名"），一行一件事：
//     [Post|編號|發文的人|內容]、[Photo|編號|給人看的一句 >> 畫圖的英文句子]、[Like|編號|按讚的人]、
//     [Comment|編號|留言的人|內容]、[Reply|編號|留言的人|回覆誰|內容]、[Nar|…]、[Char|…]
//   🚨 解析與畫法都借聊天 app 的朋友圈（WX_MOMENTS.parseStoryLine / _postHTML）：同一則在劇情裡跟打開手機看到的長一樣，
//      聊天 app 的主題也吃得到（#phone-moments 排在 #phone-chat（.wx-shell）後面，主題的「外殼兄弟」那條範圍罩得到）。
//   這裡只管畫面：收進手機朋友圈是跑團同步（wx_core → WX_MOMENTS.syncStory）掃整本正文做的，重播不會重收。
// ⚠️ 請確保在載入 vn_core.js 之後載入此檔案
// ----------------------------------------------------------------
(function () {
    console.log('[PhoneOS] 載入 VN 手機朋友圈模組...');
    const win = window.parent || window;

    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const bare = s => String(s || '').replace(/^[*＊_]+|[*＊_]+$/g, '').trim();
    const $ = id => document.getElementById(id);

    const VN_Moments = {
        owner: '',
        posts: {},     // key → 這一段畫出來的那則（格式同 WX_MOMENTS 的動態）
        cur: {},       // 編號 → key（同一編號換人發＝另一則，規則跟同步那邊一樣）
        used: {},
        _core: null,
        _mcAlias: '',

        resetState: function () {
            this.owner = ''; this._seg = false;
            this.posts = {}; this.cur = {}; this.used = {};
            const r = $('phone-moments'); if (r) r.innerHTML = '';
        },

        _mo: function () { return win.WX_MOMENTS || window.WX_MOMENTS; },

        _isMe: function (name) {
            const n = bare(name);
            if (!n) return false;
            if (/^(You|主角|我|User|Self|Me|\{\{user\}\})$/i.test(n)) return true;
            try { if (win.WX_ME && win.WX_ME.isMine && win.WX_ME.isMine(n)) return true; } catch (e) {}
            const mc = (win.OS_PERSONA && win.OS_PERSONA.getName && win.OS_PERSONA.getName()) || (win.OS_API && win.OS_API.getGlobalUserName && win.OS_API.getGlobalUserName()) || '';
            if (mc && mc !== 'User' && bare(mc) === n) return true;
            return !!(this._mcAlias && bare(this._mcAlias) === n);
        },
        _myName: function () {
            try { if (win.WX_ME && win.WX_ME.name) { const n = win.WX_ME.name(); if (n) return n; } } catch (e) {}
            return (win.OS_API && win.OS_API.getGlobalUserName && win.OS_API.getGlobalUserName()) || '我';
        },
        // 名字 → 聊天 app 裡是誰：主角＝'me'；通訊錄有這個人＝他那間聊天室（頭像就是她在聊天 app 設的那張）；都沒有＝路人
        _who: function (name) {
            const n = bare(name);
            if (!n) return { id: '', name: '' };
            if (this._isMe(n)) return { id: 'me', name: this._myName() };
            const P = win.VN_Phone || window.VN_Phone;
            const c = (P && P._wxChatByName) ? P._wxChatByName(n) : null;
            if (c && c.id) return { id: c.id, name: n };
            return { id: 'npc:' + n, name: n };
        },

        // ---------- 進出 ----------
        initMoments: function (core, line) {
            core.mode = 'moments';
            this._core = core;
            // 同一樓裡朋友圈被正文切成好幾段（發完文→去聊天→回來看讚留言）：同一支手機就接著前一段，
            //   前面發的那則還在、讚留言往上加。以前每段從零開始，後一段的讚留言只能去手機存檔裡找那則，
            //   存檔還沒讀進來（沒開過朋友圈）就整段找不到、一行都畫不出來。換樓時 resetState 會清。
            const owner = ((String(line).match(/\bowner\s*=\s*["'“”]?([^"'“”>]*)/i) || [])[1] || '').trim();
            if (owner !== this.owner || !this._seg) { this.posts = {}; this.cur = {}; this.used = {}; }
            this.owner = owner;
            this._seg = true;
            try { const M = win.OS_MC_STATUS; if (M && M.load) M.load().then(st => { this._mcAlias = (st && st.name) ? String(st.name).trim() : ''; }).catch(() => {}); } catch (e) {}
            this._build();
            Object.keys(this.posts).forEach(k => this._paint(this.posts[k], false, true));
            core.toggleUI('phone-moments');
            core.addLog('手機', this.owner && !this._isMe(this.owner) ? (this.owner + '在看朋友圈') : '打開朋友圈');
            core.next();
        },

        exitMoments: function (core) {
            this._hideNar();
            core.mode = 'vn';
            core.toggleUI('vn');
            core.next();
        },

        // 返回鍵：跳過這段朋友圈剩下的行（同聊天室的返回）
        back: function () {
            const core = this._core || win.VN_Core || window.VN_Core;
            if (!core) return;
            let i = core.index + 1;
            while (i < core.script.length && !/^<\/moments\s*>/i.test(String(core.script[i] || '').trim())) i++;
            core.index = i - 1;
            if (i >= core.script.length) { this.exitMoments(core); return; }
            core.next();   // 下一行就是 </moments>
        },

        tap: function () {
            const core = this._core || win.VN_Core || window.VN_Core;
            if (core) core.next();
        },

        // ---------- 畫面 ----------
        _build: function () {
            const host = $('phone-moments');
            if (!host) return;
            const MO = this._mo();
            let dark = false;
            try { dark = localStorage.getItem('wx_dark_mode') === 'true'; } catch (e) {}
            const ow = this.owner ? this._who(this.owner) : { id: 'me', name: this._myName() };
            host.innerHTML =
                '<div class="wxmo-root wxmo-vn' + (dark ? ' is-dark' : '') + '">' +
                '  <div class="wxmo-bar">' +
                '    <button class="wxmo-bar-btn" type="button" onclick="window.VN_Moments.back(); event.stopPropagation()"><i class="fa-solid fa-chevron-left"></i></button>' +
                '    <div class="wxmo-bar-t">朋友圈</div><span class="wxmo-bar-pad"></span>' +
                '  </div>' +
                '  <div class="wxmo-scroll">' +
                '    <div class="wxmo-cover"><img class="wxmo-cover-img" alt="">' +
                '      <div class="wxmo-cover-who"><span class="wxmo-cover-name">' + esc(ow.name) + '</span>' +
                         (MO && MO._avatarHTML ? MO._avatarHTML(ow.id, ow.name, 'wxmo-av-lg') : '') + '</div>' +
                '    </div>' +
                '    <div class="wxmo-list"></div>' +
                '  </div>' +
                '  <div class="vnmo-nar hidden"></div>' +
                '</div>';
            host.scrollTop = 0; host.scrollLeft = 0;   // 以前 scrollIntoView 把這格捲歪過，重畫時扶正
            const root = host.firstElementChild;
            const sc = root.querySelector('.wxmo-scroll');
            sc.addEventListener('scroll', function () { root.classList.toggle('is-scrolled', sc.scrollTop > 120); });
            if (MO && MO._hydrate) MO._hydrate(root);
            // 主角自己的朋友圈封面：聊天 app 那邊換過就用那張
            if (ow.id === 'me') {
                try {
                    const scp = MO && MO.scope ? MO.scope() : '';
                    const id = localStorage.getItem('wx_moments_cover__' + scp) || '';
                    const db = win.OS_DB;
                    if (id && db && db.getImage) db.getImage(id).then(url => { if (url && root.isConnected) { root.querySelector('.wxmo-cover-img').src = url; root.classList.add('has-cover'); } }).catch(() => {});
                } catch (e) {}
            }
        },

        _paint: function (p, isNew, quiet) {   // quiet＝回到朋友圈把這一樓前面那段的擺回去，不跳動畫
            const MO = this._mo();
            const root = $('phone-moments');
            const list = root && root.querySelector('.wxmo-list');
            if (!MO || !MO._postHTML || !list) return;
            const tmp = document.createElement('div');
            tmp.innerHTML = MO._postHTML(p);
            const card = tmp.firstElementChild;
            card.dataset.vnKey = p._vnKey;
            const old = list.querySelector('[data-vn-key="' + CSS.escape(p._vnKey) + '"]');
            // 每加一個讚、一則留言整則重畫：舊的那則的照片格整格搬過來（照片只會往後加，照順序對）。
            //   她按「展開圖片」生出來的圖只換了畫面上那一格，這一段的資料不知道 → 以前重畫就變回沒展開的卡片；
            //   還在生的那格搬過來，生完照樣換得上去。生好的網址順便記回來，下一段朋友圈擺回這則時也是展開的。
            if (old) {
                const was = old.querySelectorAll('.wxmo-ph');
                card.querySelectorAll('.wxmo-ph').forEach(function (n, i) {
                    const o = was[i];
                    if (!o) return;
                    const im = o.querySelector('img.os-img-photo');
                    if (im && im.src && p.photos[i] && !p.photos[i].src) p.photos[i].src = im.src;
                    n.replaceWith(o);
                });
            }
            if (old) old.replaceWith(card); else list.insertBefore(card, list.firstChild);   // 新的一則排最上面，跟手機裡一樣
            if (!quiet) card.classList.add(isNew ? 'vnmo-in' : 'vnmo-pop');
            MO._hydrate(card);
            // 🚨 不用 scrollIntoView：它連外層一起捲，手機正滑進來的時候整個框被拖著抖一下（#phone-moments 被捲歪 14px）。只捲朋友圈自己那格
            const sc = root.querySelector('.wxmo-scroll');
            if (sc) {
                const cr = card.getBoundingClientRect(), sr = sc.getBoundingClientRect();
                if (cr.top < sr.top) sc.scrollTop += cr.top - sr.top - 8;
                else if (cr.bottom > sr.bottom) sc.scrollTop += Math.min(cr.bottom - sr.bottom + 8, cr.top - sr.top - 8);
            }
        },

        // ---------- 每行 ----------
        handleLine: function (line, core) {
            core.toggleUI('phone-moments');
            const l = String(line || '').trim();
            if (/^\[Nar\|/.test(l)) { this._narrate(core, '', l.slice(5, -1)); core.checkAutoNext(); return; }
            if (/^\[Char\|/.test(l)) { this._speak(core, l); core.checkAutoNext(); return; }
            const MO = this._mo();
            const it = MO && MO.parseStoryLine ? MO.parseStoryLine(l) : null;
            if (!it || !this._apply(it, core)) { core.next(); return; }   // 畫不出東西的行（時間、打錯的）不必等她點
            this._hideNar();
            core.checkAutoNext();
        },

        _apply: function (it, core) {
            const MO = this._mo();
            const sid = it.sid;
            if (it.verb === 'post') {
                const w = this._who(it.who);
                let key = this.cur[sid];
                if (key && this.posts[key].author !== w.id) key = '';
                const isNew = !key;
                if (isNew) {
                    this.used[sid] = (this.used[sid] || 0) + 1;
                    key = sid + '#' + this.used[sid];
                    this.cur[sid] = key;
                    // 已經同步進手機的同一則：借它的 id 與照片（手機那邊展開過的圖，這裡也看得到）
                    const saved = MO.findStory ? MO.findStory(sid) : null;
                    const same = saved && saved.author === w.id ? saved : null;
                    this.posts[key] = { id: same ? same.id : 'vnmo_' + key, _vnKey: key, _saved: same, author: w.id, authorName: w.name, text: '', photos: [], likes: [], comments: [], at: Date.now() };
                }
                const p = this.posts[key];
                if (it.text) p.text = it.text;
                // 照片塞在發文那一行裡：解析那邊拆好放在 photos
                (it.photos || []).forEach(d => {
                    if (p.photos.some(x => x.desc === d)) return;
                    const old = p._saved && (p._saved.photos || []).find(x => x.desc === d);
                    p.photos.push({ src: (old && old.src) || '', desc: d });
                });
                this._paint(p, isNew);
                core.addLog(w.name, '發了朋友圈：' + (it.text || '（照片）'));
                return true;
            }
            let p = this._postFor(sid);
            // 照片給自己取了編號（moment_104_p1）：前綴對得到的那則，都對不到就是最後發的那則（跟同步那邊同一條規則）
            if (!p && it.verb === 'photo' && MO && MO._photoHost) { const h = MO._photoHost(sid, Object.keys(this.cur)); p = h ? this.posts[this.cur[h]] : null; }
            if (!p) return false;
            if (it.verb === 'photo') {
                if (p.photos.some(x => x.desc === it.text)) return false;
                const old = p._saved && (p._saved.photos || []).find(x => x.desc === it.text);
                p.photos.push({ src: (old && old.src) || '', desc: it.text });
                this._paint(p, false);
                return true;
            }
            if (it.verb === 'like') {
                // 一行寫了好幾個人（解析那邊拆好在 whos）：一起加上去，算一步
                const added = (it.whos || [it.who]).map(n => this._who(n)).filter(w => w.id && !p.likes.some(x => x.who === w.id));
                if (!added.length) return false;
                added.forEach(w => p.likes.push({ who: w.id, whoName: w.name, at: Date.now() }));
                this._paint(p, false);
                core.addLog(added.map(w => w.name).join('、'), '按了讚');
                return true;
            }
            const w = this._who(it.who);
            let to = it.verb === 'reply' ? this._who(it.to) : { id: '', name: '' };
            // 回覆沒寫回覆誰：照前面的留言補（跟同步那邊同一條規則）
            if (it.verb === 'reply' && !to.id && MO && MO._storyReplyTo) { const r = MO._storyReplyTo(p, w.id); if (r) to = { id: r.who, name: r.name }; }
            p.comments.push({ id: 'vnc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), who: w.id, whoName: w.name, toWho: to.id, toName: to.name, text: it.text, at: Date.now() });
            this._paint(p, false);
            core.addLog(w.name, (to.name ? '回覆 ' + to.name + '：' : '留言：') + it.text);
            return true;
        },

        // 這一段裡的讚留言指到前面章節發的那則：從手機裡拿出來擺上去（只拿那則本身，讚留言照這一段演的一條條加）
        _postFor: function (sid) {
            const key = this.cur[sid];
            if (key && this.posts[key]) return this.posts[key];
            const MO = this._mo();
            const saved = MO && MO.findStory ? MO.findStory(sid) : null;
            if (!saved) return null;
            this.used[sid] = (this.used[sid] || 0) + 1;
            const k = sid + '#' + this.used[sid];
            this.cur[sid] = k;
            this.posts[k] = Object.assign({}, saved, { _vnKey: k, _saved: saved, likes: [], comments: [], photos: (saved.photos || []).slice() });
            return this.posts[k];
        },

        // 螢幕底部一條字幕（主角看著手機的反應／旁邊的人說話），同瀏覽器那條
        _narrate: function (core, name, text) {
            const ex = core._extractTextAndSFX ? core._extractTextAndSFX([text]) : { text, sfx: null };
            const box = document.querySelector('#phone-moments .vnmo-nar'); if (!box) return;
            box.innerHTML = (name ? `<b>${esc(name)}</b>` : '') + (core.parseMarkdown ? core.parseMarkdown(ex.text) : esc(ex.text));
            box.classList.remove('hidden');
            core.addLog(name || '旁白', ex.text);
            if (ex.sfx) core.playSFX(ex.sfx);
            if (!name && core._vnNarrVoicePlay) core._vnNarrVoicePlay(ex.text);
        },
        _speak: function (core, raw) {
            let parts = raw.slice(6, -1).split('|');
            if (core._normCharParts) parts = core._normCharParts(parts);
            const name = parts[0] || '';
            const ex = core._extractTextAndSFX ? core._extractTextAndSFX(parts.slice(2)) : { text: parts.slice(2).join('|'), sfx: null };
            const box = document.querySelector('#phone-moments .vnmo-nar'); if (!box) return;
            box.innerHTML = `<b>${esc(name)}</b>` + (core.parseMarkdown ? core.parseMarkdown(ex.text) : esc(ex.text));
            box.classList.remove('hidden');
            core.addLog(name, ex.text);
            if (ex.sfx) core.playSFX(ex.sfx);
            try {
                let rawExp = parts[1] || '', typeHint = '';
                if (rawExp.includes('_')) { const p = rawExp.split('_'); typeHint = p[0].trim(); rawExp = p.slice(1).join('_').trim(); }
                if (core._vnSoVITSPlay) core._vnSoVITSPlay(name, ex.text, core._mapExprToEmotion ? core._mapExprToEmotion(rawExp) : rawExp, typeHint);
                const mm = win.OS_MINIMAX || window.OS_MINIMAX;
                if (mm) mm.playForChar(name, core._speechOnly ? core._speechOnly(ex.text) : ex.text, { expression: rawExp });
            } catch (e) { /* 語音失敗不影響畫面 */ }
        },
        _hideNar: function () { const box = document.querySelector('#phone-moments .vnmo-nar'); if (box) { box.classList.add('hidden'); box.innerHTML = ''; } },
    };

    win.VN_Moments = VN_Moments;
    window.VN_Moments = VN_Moments;
})();
