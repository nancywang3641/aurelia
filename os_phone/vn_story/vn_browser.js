// ----------------------------------------------------------------
// [檔案] vn_browser.js (獨立擴充模組)
// 路徑：os_phone/vn_story/vn_browser.js
// 職責：VN 播放器裡的手機瀏覽器分支（跟 Chat / Call 同一個手機殼的第三個面）
//   正文：<browser query="搜尋字"> … </browser>
//   每行一項：[Result: 標題|站名|摘要]、[Open: 標題]、[Page: 標題|站名]、[Text: 段落]、[Img: 描述]、[Nar|…]、[Char|…]
//   開場動效：主畫面搜尋框長成網址列 → 逐字打出查詢 → 骨架閃爍 → 結果一張張長出來
// ⚠️ 請確保在載入 vn_core.js 之後載入此檔案
// ----------------------------------------------------------------
(function () {
    console.log('[PhoneOS] 載入 VN 手機瀏覽器模組...');
    const win = window.parent || window;

    const RESULT_RE = /^\[(?:Result|結果|结果|搜尋結果|搜索结果)[：:]\s*([\s\S]+?)\]$/i;
    const OPEN_RE   = /^\[(?:Open|Click|Tap|打開|打开|點開|点开|進入|进入)[：:]\s*([\s\S]+?)\]$/i;
    const PAGE_RE   = /^\[(?:Page|頁面|页面|網頁|网页)[：:]\s*([\s\S]+?)\]$/i;
    const TEXT_A_RE = /^\[(?:Text|內文|内文|正文|段落)[：:]\s*([\s\S]+?)\]$/i;     // [Text: 段落]
    const TEXT_B_RE = /^\[(?:Text|內文|内文|正文|段落)\]\s*([\s\S]+)$/i;          // [Text] 段落
    const IMG_RE    = /^\[(?:圖片|图片|Image|Img|Photo|插圖|插图|截圖|截图)[：:]\s*([\s\S]+?)\]$/i;
    const STOP_PAGE_RE = /^(\[(?:Open|Click|Tap|打開|打开|點開|点开|進入|进入|Result|結果|结果|搜尋結果|搜索结果)[：:]|<\/browser>)/i;

    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const $ = id => document.getElementById(id);

    const VN_Browser = {
        query: '',
        view: 'home',        // home | results | page
        busy: false,         // 開場動效期間吃掉點擊
        resultCount: 0,
        _core: null,
        _openingSeq: 0,

        resetState: function () {
            this.query = '';
            this.view = 'home';
            this.busy = false;
            this.resultCount = 0;
            this._openingSeq++;
            const r = $('br-results'), b = $('br-page-body');
            if (r) r.innerHTML = '';
            if (b) b.innerHTML = '';
            const q = $('br-q'); if (q) textOnly(q, '');
            const root = $('phone-browser');
            if (root) root.classList.remove('br-grow', 'br-app-on', 'br-page-on');
            this._hideNar();
        },

        // ---------- 純解析（tmp/vn_browser_test.cjs 直接測這三支） ----------
        parseOpen: function (line) {
            const attr = (name) => { const m = String(line).match(new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i')) || String(line).match(new RegExp('\\b' + name + "\\s*=\\s*'([^']*)'", 'i')); return m ? m[1].trim() : ''; };
            const query = attr('query') || attr('q') || attr('search') || '';
            const url = attr('url') || attr('site') || '';
            return { query: query || url || '搜尋', url };
        },

        classify: function (line) {
            const l = String(line || '').trim();
            if (!l) return { kind: 'skip' };
            let m;
            if ((m = l.match(RESULT_RE))) {
                const p = m[1].split('|').map(s => s.trim());
                return { kind: 'result', title: p[0] || '', site: p[1] || '', snip: p.slice(2).join('｜') };
            }
            if ((m = l.match(OPEN_RE))) return { kind: 'open', title: m[1].trim() };
            if ((m = l.match(PAGE_RE))) {
                const p = m[1].split('|').map(s => s.trim());
                return { kind: 'page', title: p[0] || '', site: p.slice(1).join('｜') };
            }
            if ((m = l.match(TEXT_A_RE)) || (m = l.match(TEXT_B_RE))) return { kind: 'text', text: m[1].trim() };
            if ((m = l.match(IMG_RE))) return { kind: 'img', desc: m[1].trim() };
            if (/^\[Nar\|/.test(l)) return { kind: 'nar', text: l.slice(5, -1) };
            if (/^\[Char\|/.test(l)) return { kind: 'char', raw: l };
            if (/^\[(?:Time|With|時間|时间|Chat)[\]：:|]/i.test(l)) return { kind: 'skip' };   // 聊天室那套的行：不畫
            if (/^\[[^\]]*\]$/.test(l) || /^<\/?[a-z]/i.test(l)) return { kind: 'skip' };   // 其他 TAG / 容器行：不畫
            return { kind: 'text', text: l };   // 沒包 TAG 的字＝內文
        },

        // 返回鍵要跳到哪：文章頁 → 跳過這頁剩下的行，停在下一條結果/下一個點開/收尾；結果頁 → 直接停在收尾
        skipTarget: function (script, index, view) {
            for (let i = index + 1; i < script.length; i++) {
                const l = String(script[i] || '').trim();
                if (l.startsWith('</browser>')) return i;
                if (view === 'page' && STOP_PAGE_RE.test(l)) return i;
            }
            return script.length;
        },

        // ---------- 進出 ----------
        initBrowser: function (core, line) {
            core.mode = 'browser';
            this._core = core;
            const { query } = this.parseOpen(line);
            this.query = query;
            this.resultCount = 0;
            this.view = 'home';
            const r = $('br-results'), b = $('br-page-body');
            if (r) r.innerHTML = '';
            if (b) b.innerHTML = '';
            this._hideNar();
            core.toggleUI('phone-browser');
            core.addLog('手機', `搜尋「${query}」`);
            this._playOpening(core, query);
        },

        _playOpening: async function (core, query) {
            const seq = ++this._openingSeq;
            const alive = () => seq === this._openingSeq && core.mode === 'browser';
            const root = $('phone-browser');
            if (!root) { core.next(); return; }
            this.busy = true;
            // 同一章第二次打開瀏覽器：上一次留下的狀態還在過渡中，先關掉所有動效歸零、強制排版，再放開，開場才會從主畫面乾淨起手
            root.classList.add('br-nomotion');
            root.classList.remove('br-grow', 'br-app-on', 'br-page-on');
            void root.offsetHeight;
            root.classList.remove('br-nomotion');
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
            textOnly($('br-clock'), `${hh}:${mm}`);
            textOnly($('br-date'), `${now.getMonth() + 1}月${now.getDate()}日`);
            const q = $('br-q');
            textOnly(q, '');
            try {
                await sleep(450);                       if (!alive()) return;
                root.classList.add('br-grow');          // 搜尋框長成網址列
                await sleep(650);                       if (!alive()) return;
                root.classList.add('br-app-on');        // 主畫面退、瀏覽器進
                await sleep(420);                       if (!alive()) return;
                // 逐字打，快慢不一像真人
                q.innerHTML = '<span class="br-typed"></span><span class="br-caret"></span>';
                const t = q.querySelector('.br-typed');
                for (const ch of String(query)) {
                    t.textContent += ch;
                    await sleep(40 + Math.random() * 110);
                    if (!alive()) return;
                }
                await sleep(220);                       if (!alive()) return;
                const caret = q.querySelector('.br-caret'); if (caret) caret.remove();
                this._showSkeleton();
                this.view = 'results';
                await sleep(900);                       if (!alive()) return;
            } finally {
                if (seq === this._openingSeq) this.busy = false;
            }
            if (alive()) core.next();
        },

        exitBrowser: function (core) {
            this.view = 'home';
            this.busy = false;
            this._hideNar();
            core.mode = 'vn';
            core.toggleUI('vn');
            core.next();
        },

        // 手機殼上的點擊：開場動效期間不理，其他時候等於下一句
        tap: function () {
            if (this.busy) return;
            const core = this._core || win.VN_Core || window.VN_Core;
            if (core) core.next();
        },

        // 返回鍵：文章頁回結果頁（跳過這頁剩下的行）；結果頁跳過整段回 VN（同 closeChat）
        back: function () {
            const core = this._core || win.VN_Core || window.VN_Core;
            if (!core || this.busy) return;
            const stop = this.skipTarget(core.script, core.index, this.view);
            if (this.view === 'page') {
                core.index = stop - 1;
                this._showResults();
                return;   // 停在結果頁，等她自己點
            }
            core.index = Math.min(stop, core.script.length) - 1;
            if (stop >= core.script.length) { this.exitBrowser(core); return; }
            core.next();   // 下一行就是 </browser>
        },

        // ---------- 每行 ----------
        handleBrowserLine: function (line, core) {
            core.toggleUI('phone-browser');
            const it = this.classify(line);
            switch (it.kind) {
                case 'result': this._addResult(it); break;
                case 'open':   this._openResult(it.title); break;
                case 'page':   this._showPage(it.title, it.site); break;
                case 'text':   this._addParagraph(it.text); break;
                case 'img':    this._addImage(it.desc); break;
                case 'nar':    this._narrate(core, '', it.text); break;
                case 'char':   this._speak(core, it.raw); break;
                default: break;
            }
            core.checkAutoNext();
        },

        _showSkeleton: function () {
            const r = $('br-results'); if (!r) return;
            r.innerHTML = '';
            for (let i = 0; i < 3; i++) {
                r.insertAdjacentHTML('beforeend', '<div class="br-card br-skel"><div class="br-site">　</div><div class="br-title">　</div><div class="br-snip">　</div></div>');
            }
        },

        _showResults: function () {
            const root = $('phone-browser'); if (root) root.classList.remove('br-page-on');
            this.view = 'results';
            this._hideNar();
        },

        _addResult: function (it) {
            const r = $('br-results'); if (!r) return;
            if (this.view === 'page') this._showResults();   // 文章看完 AI 又給新結果＝回到結果頁
            if (this.resultCount === 0) r.innerHTML = '';     // 第一條真結果把骨架換掉
            this.resultCount++;
            const el = document.createElement('div');
            el.className = 'br-card br-in';
            el.dataset.title = it.title;
            el.innerHTML = `<div class="br-site">${esc(it.site)}</div><div class="br-title">${esc(it.title)}</div><div class="br-snip">${esc(it.snip)}</div>`;
            r.appendChild(el);
            el.scrollIntoView({ block: 'nearest' });
        },

        _openResult: function (title) {
            const r = $('br-results');
            let card = null;
            if (r) {
                const cards = [...r.querySelectorAll('.br-card:not(.br-skel)')];
                card = cards.find(c => (c.dataset.title || '') === title) || cards.find(c => title && (c.dataset.title || '').includes(title)) || cards.find(c => title && title.includes(c.dataset.title || '')) || null;
            }
            if (card) card.classList.add('br-tap');
            const site = card ? card.querySelector('.br-site')?.textContent : '';
            const self = this;
            setTimeout(() => self._showPage(title, site || '', true), card ? 260 : 0);
        },

        _showPage: function (title, site, skeleton) {
            const root = $('phone-browser'); if (!root) return;
            const head = $('br-page-title'), s = $('br-page-site'), b = $('br-page-body');
            if (this.view !== 'page') {
                if (b) b.innerHTML = skeleton ? '<div class="br-skel br-p-skel"><div class="br-p">　</div><div class="br-p">　</div><div class="br-p br-short">　</div></div>' : '';
                root.classList.add('br-page-on');
                this.view = 'page';
                this._hideNar();
            }
            if (title) textOnly(head, title);
            if (site || this.view !== 'page') textOnly(s, site || '');
        },

        _ensurePageBody: function () {
            if (this.view !== 'page') this._showPage($('br-page-title')?.textContent || this.query, $('br-page-site')?.textContent || '', false);
            const b = $('br-page-body');
            if (b) { const sk = b.querySelector('.br-p-skel'); if (sk) sk.remove(); }
            return b;
        },

        _addParagraph: function (text) {
            const b = this._ensurePageBody(); if (!b) return;
            const core = this._core;
            const html = core && core.parseMarkdown ? core.parseMarkdown(text) : esc(text);
            b.insertAdjacentHTML('beforeend', `<p class="br-p br-in">${html}</p>`);
            b.lastElementChild?.scrollIntoView({ block: 'nearest' });
        },

        _addImage: function (desc) {
            const b = this._ensurePageBody(); if (!b) return;
            // 圖片走三個手機 app 共用的管道（佔位卡＋展開鈕＋頭像桶生圖）；跟 VN 手機聊天同一條
            const PI = win.OS_PHONE_IMAGE || window.OS_PHONE_IMAGE;
            const inner = PI ? PI.render(desc, { app: 'vn_phone' }) : `<div class="br-fig-alt">${esc(desc)}</div>`;
            b.insertAdjacentHTML('beforeend', `<figure class="br-fig br-in">${inner}</figure>`);
            b.lastElementChild?.scrollIntoView({ block: 'nearest' });
        },

        // 主角看著螢幕的旁白／自語：底部一條半透明字幕，不佔頁面
        _narrate: function (core, name, text) {
            const ex = core._extractTextAndSFX ? core._extractTextAndSFX([text]) : { text, sfx: null };
            const box = $('br-nar'); if (!box) return;
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
            const box = $('br-nar'); if (!box) return;
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

        _hideNar: function () { const box = $('br-nar'); if (box) { box.classList.add('hidden'); box.innerHTML = ''; } },
    };

    function textOnly(el, s) { if (el) el.textContent = s; }

    win.VN_Browser = VN_Browser;
    window.VN_Browser = VN_Browser;
})();
