// ----------------------------------------------------------------
// [檔案] vn_browser.js (獨立擴充模組)
// 路徑：os_phone/vn_story/vn_browser.js
// 職責：VN 播放器裡的手機瀏覽器分支（跟 Chat / Call 同一個手機殼的第三個面）
//   正文：<browser query="搜尋字"> … </browser>
//   每行一項：[Result: 標題|站名|摘要]、[Open: 標題]、[Page: 標題|站名]、[Text: 段落]、[Img: 描述]、[Video: 標題|頻道|彈幕…]、[Nar|…]、[Char|…]
//   開場動效：主畫面搜尋框長成網址列 → 逐字打出查詢 → 骨架閃爍 → 結果一張張長出來
//   節奏：瀏覽器自己會動的步驟（結果一條條載入、點開、換頁）不等點，接著播；要讀的東西（內文、圖、旁白、台詞、整份結果清單）才停。
//     停下來等點時畫面上不留骨架（骨架＝還在載入，人會乾等），右下角出一個小箭頭
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
    // 🎬 [Video: 標題|頻道|彈幕|彈幕…]：搜尋結果裡一支在播的影片（世界門「通知主角」的新世界宣傳片走這條）。
    //   標題是世界門檔案庫裡的世界 → 概念圖、旁白、Jev 挑的配樂由世界門給（OS_WORLDGATE.pvOf）；不是的話照一般影片放（片名＋彈幕）
    const VIDEO_RE  = /^\[(?:Video|PV|影片|視頻|视频|宣傳片|宣传片)[：:|]\s*([\s\S]+?)\]$/i;
    const PV_DM_DUR = 6.5;   // 一條彈幕飄過去幾秒
    const PV_STEP = 3.4;     // 一句旁白佔幾秒
    // 鏡頭：每句換一個畫面（背景位置 x% 起→迄、縮放 起→迄），段跟段之間黑一下；片名那段最後
    const PV_CAMS = [[58, 64, 1.05, 1.13], [22, 34, 1.16, 1.07], [72, 60, 1.06, 1.15], [42, 46, 1.2, 1.3], [30, 40, 1.08, 1.16]];
    const STOP_PAGE_RE = /^(\[(?:Open|Click|Tap|打開|打开|點開|点开|進入|进入|Result|結果|结果|搜尋結果|搜索结果)[：:]|<\/browser>)/i;

    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const $ = id => document.getElementById(id);
    // 新的一條／一段長出來時捲到看得見（等同 block:'nearest'），但只捲它自己那格：
    //   scrollIntoView 會連所有外層一起捲，手機正滑進來時整個框被拖歪，overflow:hidden 的外層也會被程式捲動
    function scrollNearest(el) {
        if (!el) return;
        let box = el.parentElement;
        while (box && box !== document.body && box !== document.documentElement) {
            const oy = getComputedStyle(box).overflowY;
            if ((oy === 'auto' || oy === 'scroll') && box.scrollHeight > box.clientHeight) break;
            box = box.parentElement;
        }
        if (!box || box === document.body || box === document.documentElement) return;
        const br = box.getBoundingClientRect(), er = el.getBoundingClientRect();
        let top;
        if (er.top < br.top) top = box.scrollTop + (er.top - br.top);
        else if (er.bottom > br.bottom) top = box.scrollTop + Math.min(er.bottom - br.bottom, er.top - br.top);   // 比整格還高就對齊上緣
        else return;
        box.scrollTo({ top: top });
    }

    const VN_Browser = {
        query: '',
        view: 'home',        // home | results | page
        busy: false,         // 開場動效期間吃掉點擊
        resultCount: 0,
        _core: null,
        _openingSeq: 0,
        _opened: {},   // 已經演過開場的 <browser> 行：同一則訊息重載就直接到位不重演
        _chainTimer: null,   // 自己接著播的下一步
        _rush: false,        // 自己播的途中她點了：剩下的步驟不等，一口氣播到該停的地方
        _openTimer: null,    // [Open] 卡片按下去到換頁中間那一下
        _pendingOpen: null,
        _land: null,         // 🎬 正轉橫看影片：{ el: 那張影片卡, start: 收回去要縮回的位置 }

        resetState: function () {
            this.landOff(true);
            this._pvStop();
            this.query = '';
            this.view = 'home';
            this.busy = false;
            this.resultCount = 0;
            this._openingSeq++;
            this._stopChain();
            this._cancelOpen();
            this._setHint(false);
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
            if ((m = l.match(VIDEO_RE))) {
                const p = m[1].split('|').map(s => s.trim());
                return { kind: 'video', title: p[0] || '', ch: p[1] || '', dm: p.slice(2).filter(Boolean).slice(0, 16) };
            }
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

        // 下一行是哪種（跳過空行）；收尾行、會被當成容器已關的正文行都算 end
        peekKind: function (script, index, escapeRe) {
            for (let i = index + 1; i < script.length; i++) {
                const l = String(script[i] || '').trim();
                if (!l) continue;
                if (/^<\/browser\s*>/i.test(l) || (escapeRe && escapeRe.test(l))) return 'end';
                return this.classify(l).kind;
            }
            return 'end';
        },

        // 這一行畫完要不要自己接著播：回等幾毫秒，null＝停下來等她點
        //   結果：後面還有結果就接著長（像搜尋結果陸續出來），最後一條停（整份清單讓她看）
        //   點開、換頁：骨架閃一下就接著出內文；後面沒東西了就停（不然會在骨架上直接收掉）
        autoDelay: function (kind, nextKind, wasPage) {
            if (kind === 'result') return nextKind === 'result' ? 380 : null;
            if (nextKind === 'end') return null;
            if (kind === 'open') return 800;
            if (kind === 'page') return wasPage ? 300 : 650;
            return null;
        },

        // ---------- 進出 ----------
        initBrowser: function (core, line) {
            this.landOff(true);
            core.mode = 'browser';
            this._core = core;
            this._stopChain();
            this._cancelOpen();
            this._setHint(false);
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
            const key = `${(core.script || []).length}|${core.index}|${line}`;
            if (this._opened[key] || core.isSkip) { this._instantOpen(core, query); return; }
            this._opened[key] = true;
            this._playOpening(core, query);
        },

        // 不演開場：網址列、查詢字、骨架一次到位
        _instantOpen: function (core, query) {
            const root = $('phone-browser');
            if (!root) { core.next(); return; }
            this._openingSeq++;
            this.busy = false;
            root.classList.add('br-nomotion');
            root.classList.remove('br-page-on');
            root.classList.add('br-grow', 'br-app-on');
            textOnly($('br-q'), String(query));
            this._showSkeleton();
            this.view = 'results';
            void root.offsetHeight;
            root.classList.remove('br-nomotion');
            core.next();
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
            this.landOff(true);   // 正轉橫看影片：先轉回直的
            this._pvStop();   // 手機收起來了：影片停、音樂換回原本那首
            this.view = 'home';
            this.busy = false;
            this._stopChain();
            this._cancelOpen();
            this._setHint(false);
            this._hideNar();
            core.mode = 'vn';
            core.toggleUI('vn');
            core.next();
        },

        // 手機殼上的點擊：開場動效期間不理；自己在播的途中點＝剩下的一口氣播完；其他時候等於下一句
        tap: function () {
            if (this.busy) return;
            const core = this._core || win.VN_Core || window.VN_Core;
            if (!core) return;
            if (this._chainTimer) { this._rush = true; this._stopChain(true); }
            core.next();
        },

        // 返回鍵：文章頁回結果頁（跳過這頁剩下的行）；結果頁跳過整段回 VN（同 closeChat）
        back: function () {
            const core = this._core || win.VN_Core || window.VN_Core;
            if (!core || this.busy) return;
            this._stopChain();
            this._cancelOpen();
            const stop = this.skipTarget(core.script, core.index, this.view);
            if (this.view === 'page') {
                core.index = stop - 1;
                this._showResults();
                this._settle();
                return;   // 停在結果頁，等她自己點
            }
            core.index = Math.min(stop, core.script.length) - 1;
            if (stop >= core.script.length) { this.exitBrowser(core); return; }
            core.next();   // 下一行就是 </browser>
        },

        // ---------- 每行 ----------
        handleBrowserLine: function (line, core) {
            if (this._land) this.landOff(true);   // 轉橫看影片時她用鍵盤往下播了：先轉回直的，新的一行才看得到
            core.toggleUI('phone-browser');
            this._stopChain(true);
            this._flushOpen();   // 上一行的點開還在卡片按下去那一下：先換頁，這一行才接得上
            this._setHint(false);
            const it = this.classify(line);
            if (it.kind === 'skip') { core.next(); return; }   // 畫不出東西的行（時間、其他標籤）不必等她點
            const wasPage = this.view === 'page';
            switch (it.kind) {
                case 'result': this._addResult(it); break;
                case 'open':   this._openResult(it.title); break;
                case 'page':   this._showPage(it.title, it.site, true); break;
                case 'text':   this._addParagraph(it.text); break;
                case 'img':    this._addImage(it.desc); break;
                case 'video':  this._addVideo(it, core); break;
                case 'nar':    this._narrate(core, '', it.text); break;
                case 'char':   this._speak(core, it.raw); break;
                default: break;
            }
            if (core.isSkip) { this._rush = false; core.checkAutoNext(); return; }
            const ms = this.autoDelay(it.kind, this.peekKind(core.script || [], core.index, core._phoneEscapeRe), wasPage);
            if (ms != null) { this._chain(core, ms); return; }
            this._settle();
        },

        _chain: function (core, ms) {
            const idx = core.index, seq = this._openingSeq;
            this._chainTimer = setTimeout(() => {
                this._chainTimer = null;
                if (seq !== this._openingSeq || core.mode !== 'browser' || core.index !== idx) return;   // 她已經自己往下了（鍵盤、返回鍵），或已經離開瀏覽器
                core.next();
            }, this._rush ? 0 : ms);
        },

        _stopChain: function (keepRush) {
            if (this._chainTimer) { clearTimeout(this._chainTimer); this._chainTimer = null; }
            if (!keepRush) this._rush = false;
        },

        // 停下來等她點：「還在載入」的骨架收掉，右下角出小箭頭
        _settle: function () {
            this._rush = false;
            const r = $('br-results'); if (r && this.resultCount === 0) r.innerHTML = '';
            const b = $('br-page-body'); if (b) { const sk = b.querySelector('.br-p-skel'); if (sk) sk.remove(); }
            this._setHint(true);
        },

        _setHint: function (on) { const h = $('br-hint'); if (h) h.classList.toggle('br-hint-on', !!on); },

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
            scrollNearest(el);
        },

        _openResult: function (title) {
            if (this.view === 'page') this._showResults();   // 看完一篇又點開另一條：先回結果頁再點，新的一頁才不會接在上一篇後面
            const r = $('br-results');
            let card = null;
            if (r) {
                const cards = [...r.querySelectorAll('.br-card:not(.br-skel)')];
                card = cards.find(c => (c.dataset.title || '') === title) || cards.find(c => title && (c.dataset.title || '').includes(title)) || cards.find(c => title && title.includes(c.dataset.title || '')) || null;
            }
            if (card) card.classList.add('br-tap');
            const site = card ? card.querySelector('.br-site')?.textContent : '';
            this._pendingOpen = { title, site: site || '' };
            if (!card || this._rush) { this._flushOpen(); return; }
            this._openTimer = setTimeout(() => this._flushOpen(), 260);   // 卡片按下去那一下再換頁
        },

        _flushOpen: function () {
            if (this._openTimer) { clearTimeout(this._openTimer); this._openTimer = null; }
            const p = this._pendingOpen; this._pendingOpen = null;
            if (p) this._showPage(p.title, p.site, true);
        },

        _cancelOpen: function () {
            if (this._openTimer) { clearTimeout(this._openTimer); this._openTimer = null; }
            this._pendingOpen = null;
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
            scrollNearest(b.lastElementChild);
        },

        _addImage: function (desc) {
            const b = this._ensurePageBody(); if (!b) return;
            // 圖片走三個手機 app 共用的管道（佔位卡＋展開鈕＋頭像桶生圖）；跟 VN 手機聊天同一條
            const PI = win.OS_PHONE_IMAGE || window.OS_PHONE_IMAGE;
            const inner = PI ? PI.render(desc, { app: 'vn_phone' }) : `<div class="br-fig-alt">${esc(desc)}</div>`;
            b.insertAdjacentHTML('beforeend', `<figure class="br-fig br-in">${inner}</figure>`);
            scrollNearest(b.lastElementChild);
        },

        // ---------- 🎬 搜尋結果裡的影片（世界門新世界宣傳片）----------
        // 時間表（純函式，tmp/vn_pv_test.cjs 直接測）：n 句旁白一句一畫面 → 片名；彈幕平均撒在旁白到片名之間
        pvTimeline: function (nLines, nDm) {
            const L0 = 1.2;
            const lines = [];
            for (let i = 0; i < nLines; i++) lines.push({ t0: L0 + i * PV_STEP, t1: L0 + i * PV_STEP + PV_STEP - 0.4 });
            const titleAt = nLines ? L0 + nLines * PV_STEP + 0.2 : 0.6;
            const span = Math.max(titleAt + 1.5 - L0, nDm * 0.55);
            const dm = [];
            for (let i = 0; i < nDm; i++) dm.push(L0 + i * span / Math.max(1, nDm));
            const end = Math.max(titleAt + 4.5, nDm ? dm[nDm - 1] + PV_DM_DUR : 0);
            const cuts = lines.slice(1).map(l => l.t0 - 0.2).concat(nLines ? [titleAt] : []);
            return { lines, titleAt, dm, end, cuts };
        },

        _addVideo: function (it, core) {
            const r = $('br-results'); if (!r) return;
            if (this.view === 'page') this._showResults();
            if (this.resultCount === 0) r.innerHTML = '';
            this.resultCount++;
            const el = document.createElement('div');
            el.className = 'br-card br-vid br-in';
            el.dataset.title = it.title;
            el.innerHTML = `<div class="br-site"><span class="br-vch">${esc(it.ch || '影片')}</span></div>` +
                `<div class="br-vbox"><div class="br-vimg"></div><div class="br-vdim"></div><div class="br-vdm"></div><div class="br-vcap"></div>` +
                `<div class="br-vttl"><b>${esc(it.title)}</b><span></span></div><div class="br-vprog"></div>` +
                `<button type="button" class="br-vx" aria-label="轉橫看"><i class="fa-solid fa-expand"></i></button>` +
                `<button type="button" class="br-vre br-voff" aria-label="重播"><i class="fa-solid fa-rotate-right"></i></button></div>` +
                `<div class="br-vinfo br-voff"><div class="br-title"></div><div class="br-snip"></div><div class="br-vtags"></div></div>`;
            r.appendChild(el);
            scrollNearest(el);
            // 點影片＝整支手機轉橫看（不算「點下一句」）
            el.querySelector('.br-vbox').onclick = (ev) => { ev.stopPropagation(); this.landOn(el); };
            const replay = !!(core && core._scriptIsReplay);
            const W = win.OS_WORLDGATE || window.OS_WORLDGATE;
            const go = (pv) => { if (!el.isConnected) return; el._pvArgs = { it, pv }; this._pvFill(el, it, pv); this._pvPlay(el, it, pv); };
            if (W && W.pvOf) {
                W.pvOf(it.title).then(pv => { if (pv && !replay && W.pvSeen) W.pvSeen(it.title); go(pv); }).catch(() => go(null));
            } else go(null);
        },

        // 世界的料填進卡片：概念圖、片名下那行、底下的介紹和標籤（不是世界就只有片名＋頻道）
        _pvFill: function (el, it, pv) {
            const box = el.querySelector('.br-vbox');
            const art = this._pvBase(pv);
            if (art) this._pvSetImg(box.querySelector('.br-vimg'), art);
            else box.classList.add('br-vnoart');
            textOnly(el.querySelector('.br-vttl span'), pv ? 'NEXUS PARALLAX ・ 新世界開放' : (it.ch || ''));
            if (!pv) return;
            const info = el.querySelector('.br-vinfo');
            textOnly(info.querySelector('.br-title'), pv.name + '｜視差新世界');
            textOnly(info.querySelector('.br-snip'), pv.intro || '');
            const tg = info.querySelector('.br-vtags');
            (pv.tags || []).forEach(t => { const s = document.createElement('span'); s.textContent = t; tg.appendChild(s); });
            info.classList.remove('br-voff');
        },

        // 底圖：世界的概念圖；沒有就拿 SN 畫的第一張
        _pvBase: function (pv) { return pv ? String(pv.art || ((pv.imgs || []).find(Boolean)) || '') : ''; },
        _pvSetImg: function (img, src) { img.style.setProperty('--br-vart', 'url("' + String(src).replace(/["\\\n\r]/g, m => '\\' + m) + '")'); },
        // 播一次：畫面照時間算（不靠動畫排程，預覽窗 rAF 慢也不亂）；一次只播一支，新的開始舊的就停
        //   SN 收尾畫過畫面的（pv.imgs）一句換一張，沒畫到的那句、片名用底圖
        //   同一個時鐘可以同時畫好幾格（卡片那格＋轉橫那格 st.views），轉過去、轉回來都接得上
        _pvPlay: function (el, it, pv) {
            this._pvStop();
            const lines = (pv && pv.lines) || [];
            const TL = this.pvTimeline(lines.length, (it.dm || []).length);
            const box = el.querySelector('.br-vbox'), re = box.querySelector('.br-vre');
            re.classList.add('br-voff');
            const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
            const ease = k => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
            const imgs = (pv && pv.imgs) || [], baseImg = this._pvBase(pv);   // 🚨 別叫 base：render 裡下面有一個暗度 base（同名會在宣告前就被讀到而整支停掉）
            const render = (v, t) => {
                // 鏡頭：第幾句就用第幾個畫面；片名那段固定一個
                let seg, k, src = baseImg;
                if (t >= TL.titleAt && lines.length) { seg = [50, 52, 1.0, 1.05]; k = (t - TL.titleAt) / 4.5; }
                else {
                    const i = Math.max(0, Math.floor((t - 1.0) / PV_STEP));
                    seg = PV_CAMS[i % PV_CAMS.length]; k = ((t - 1.0) - i * PV_STEP) / PV_STEP;
                    src = imgs[Math.min(i, lines.length - 1)] || baseImg;
                }
                if (src && src !== v.shown) { this._pvSetImg(v.img, src); v.shown = src; }   // 換句的那一下剛好是黑場，換圖看不到跳
                v.img.style.backgroundPosition = lerp(seg[0], seg[1], k).toFixed(2) + '% 50%';
                v.img.style.transform = 'scale(' + lerp(seg[2], seg[3], k).toFixed(4) + ')';
                let cut = 0;
                TL.cuts.forEach(c => { const d = Math.abs(t - c); if (d < 0.3) cut = Math.max(cut, 1 - d / 0.3); });
                let base = lines.length ? 0.12 : 0.4;
                if (lines.length >= 3 && t >= TL.lines[lines.length - 1].t0 - 0.2 && t < TL.titleAt) base = 0.36;   // 最後一句（危機）壓暗
                if (t >= TL.titleAt && lines.length) base = lerp(0.36, 0.55, ease((t - TL.titleAt) / 0.8));
                if (t < 0.6) base = Math.max(base, 1 - t / 0.6);
                v.dim.style.opacity = Math.max(base, cut).toFixed(3);
                const L = TL.lines.findIndex(l => t >= l.t0 - 0.05 && t < l.t1 + 0.4);
                v.cap.textContent = L >= 0 ? lines[L] : '';
                v.cap.style.opacity = L >= 0 ? Math.min(ease((t - TL.lines[L].t0) / 0.45), 1 - ease((t - TL.lines[L].t1) / 0.4)).toFixed(3) : 0;
                const tk = ease((t - TL.titleAt) / 0.9);
                v.ttl.style.opacity = tk.toFixed(3);
                v.ttl.style.transform = 'scale(' + lerp(1.08, 1, tk).toFixed(4) + ')';
                v.prog.style.width = (Math.min(1, t / TL.end) * 100).toFixed(2) + '%';
                const Wd = v.dmz.clientWidth, H = v.dmz.clientHeight;
                v.dms.forEach(d => {
                    const q = (t - d.t0) / PV_DM_DUR;
                    // 🚨 藏用 opacity 不用 visibility：子層寫了 visible 會蓋過外層的 hidden，藏著的轉橫那格彈幕會漏出來
                    if (q < 0 || q > 1) { d.e.style.opacity = '0'; return; }
                    if (!d.w) d.w = d.e.offsetWidth || 60;
                    d.e.style.opacity = '1';
                    d.e.style.transform = 'translate(' + (Wd - q * (Wd + d.w)).toFixed(1) + 'px,' + (d.lane * H / 4).toFixed(1) + 'px)';
                });
            };
            const t0 = performance.now();
            const st = { el, it, pv, TL, render, t: 0, views: [this._pvView(box, it, TL, baseImg)], timer: null, bgm: (pv && pv.bgm) || '' };
            this._pv = st;
            if (st.bgm) this._pvBgmOn(st.bgm);   // 🎵 Jev 挑的那首（沒挑到就照舊放現在的歌）
            const tick = () => {
                if (this._pv !== st) return;
                if (!el.isConnected) { this._pvStop(); return; }   // 卡片被拆掉（換章、重開瀏覽器）
                const t = (performance.now() - t0) / 1000;
                st.t = Math.min(t, TL.end);
                st.views.forEach(v => render(v, st.t));
                if (t >= TL.end) { this._pvStop(); re.classList.remove('br-voff'); return; }
                st.timer = setTimeout(tick, 33);
            };
            re.onclick = (ev) => { ev.stopPropagation(); this._pvPlay(el, it, pv); };   // 重播不算「點下一句」
            st.views.forEach(v => render(v, 0));
            tick();
        },

        // 一格畫面（卡片那格、轉橫那格用同一套 class），彈幕每格自己一份
        _pvView: function (box, it, TL, shown) {
            const dmz = box.querySelector('.br-vdm');
            dmz.innerHTML = '';
            const dms = (it.dm || []).map((s, i) => { const e = document.createElement('span'); if (i % 3) e.className = 'c' + (i % 3); e.textContent = s; dmz.appendChild(e); return { e, t0: TL.dm[i], lane: i % 4, w: 0 }; });
            return { box, img: box.querySelector('.br-vimg'), dim: box.querySelector('.br-vdim'), cap: box.querySelector('.br-vcap'), ttl: box.querySelector('.br-vttl'), prog: box.querySelector('.br-vprog'), dmz, dms, shown };
        },
        // 在播的這支多畫一格（轉橫那格）：底圖、片名照卡片的
        _pvAddView: function (box) {
            const st = this._pv; if (!st) return;
            st.views = st.views.filter(v => v.box !== box);
            const art = this._pvBase(st.pv);
            if (art) { this._pvSetImg(box.querySelector('.br-vimg'), art); box.classList.remove('br-vnoart'); }
            else box.classList.add('br-vnoart');
            textOnly(box.querySelector('.br-vttl b'), st.it.title || '');
            const sub = st.el.querySelector('.br-vttl span');
            textOnly(box.querySelector('.br-vttl span'), sub ? sub.textContent : '');
            const v = this._pvView(box, st.it, st.TL, art);
            st.views.push(v);
            st.render(v, st.t);
        },
        _pvDropView: function (box) { const st = this._pv; if (st) st.views = st.views.filter(v => v.box !== box); },

        // ---------- 🎬 點影片：整支手機轉成橫的，影片塞滿（小樣 A，參考資料/PHONE_LANDSCAPE_LAB.html） ----------
        //   外框 #phone-device 往左轉 90 度、放大到塞得下；螢幕裡蓋一層 #br-land（寬高對調、往右轉 90 度），
        //   兩個用同一條時間曲線，所以影片一路都是正的，從卡片那格長到滿螢幕。
        //   觸控螢幕而且劇情畫面是直的（iPhone 拿直的）：外框不轉、影片側躺填滿，她把真手機轉過來看；
        //   iPhone 轉過去畫面變橫的時候 resize 會照新尺寸重擺（_landFit）
        _landGeom: function () {
            const ov = $('phone-overlay'), dev = $('phone-device'), scr = $('phone-screen');
            if (!ov || !dev || !scr) return null;
            const W = ov.clientWidth, H = ov.clientHeight, pw = dev.offsetWidth, ph = dev.offsetHeight, sw = scr.offsetWidth, sh = scr.offsetHeight;
            if (!W || !H || !pw || !ph || !sw || !sh) return null;
            let touch = false;
            try { touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) {}
            const side = touch && H > W;   // 滑鼠的話螢幕轉不過來，畫面再窄也照樣轉外框
            const k = side ? Math.max(1, Math.min((W - 12) / pw, (H - 12) / ph)) : Math.min((W - 24) / ph, (H - 24) / pw);
            return { sw, sh, side, dev: 'translateY(0px) rotate(' + (side ? 0 : -90) + 'deg) scale(' + k.toFixed(4) + ')' };
        },
        _landEnd: function (g) { return 'translate(' + (g.sw / 2 - g.sh / 2) + 'px,' + (g.sh / 2 - g.sw / 2) + 'px) rotate(90deg) scale(1)'; },
        _landSize: function (land, g) {
            const vw = g.sw * 16 / 9;   // 影片 16:9，兩側剩下的是黑邊（膠囊島落在左邊那條上）
            land.style.width = g.sh + 'px';
            land.style.height = g.sw + 'px';
            land.style.setProperty('--br-lvw', vw.toFixed(2) + 'px');
            land.style.setProperty('--br-lbar', ((g.sh - vw) / 2).toFixed(2) + 'px');
            // 外框很小（iPhone 拿橫的時候劇情畫面很矮）：黑邊太窄、膠囊島（98px 寬，見 .vnp-notch）上方也放不下返回鈕 → 返回鈕改放影片左上角
            land.classList.toggle('br-lnarrow', (g.sh - vw) / 2 < 40 || (g.sw - 98) / 2 < 46);
            return vw;
        },
        _landEl: function () {
            let land = $('br-land');
            if (land) return land;
            const scr = $('phone-screen'); if (!scr) return null;
            land = document.createElement('div');
            land.id = 'br-land';
            land.innerHTML = '<div class="br-lbox"><div class="br-vimg"></div><div class="br-vdim"></div><div class="br-vdm"></div><div class="br-vcap"></div>' +
                '<div class="br-vttl"><b></b><span></span></div><div class="br-vprog"></div></div>' +
                '<button type="button" class="br-lback" aria-label="轉回直的"><i class="fa-solid fa-chevron-left"></i></button><div class="br-lhome"></div>';
            land.onclick = (ev) => { ev.stopPropagation(); this.landOff(); };   // 點任何地方（含返回鈕）都轉回直的
            scr.appendChild(land);   // 排在狀態列後面（同一層、後來的蓋前面），膠囊島還在它上面
            return land;
        },
        landOn: function (el) {
            if (this._land || !el || !el.isConnected || !el._pvArgs) return;
            const g = this._landGeom(), land = this._landEl();
            const dev = $('phone-device'), scr = $('phone-screen'), card = el.querySelector('.br-vbox');
            if (!g || !land || !card) return;
            if (!this._pv || this._pv.el !== el) this._pvPlay(el, el._pvArgs.it, el._pvArgs.pv);   // 播完了：從頭再播一次
            const box = land.querySelector('.br-lbox');
            const vw = this._landSize(land, g);
            this._pvAddView(box);
            // 起點：疊在卡片那格上（外層有縮放就換算回來）
            const r = card.getBoundingClientRect(), s = scr.getBoundingClientRect();
            const sc = (s.width / scr.offsetWidth) || 1;
            const cx = (r.left - s.left + r.width / 2) / sc, cy = (r.top - s.top + r.height / 2) / sc;
            const start = 'translate(' + (cx - g.sh / 2).toFixed(2) + 'px,' + (cy - g.sw / 2).toFixed(2) + 'px) rotate(0deg) scale(' + ((r.width / sc) / vw).toFixed(4) + ')';
            this._land = { el, start };
            clearTimeout(this._landTimer);
            land.style.transition = 'none';
            land.style.opacity = '';
            land.style.transform = start;
            land.classList.add('br-lon');
            land.classList.remove('br-ldark');
            card.classList.add('br-vaway');
            dev.style.transition = 'none';
            dev.style.transform = 'translateY(0px) rotate(0deg) scale(1)';   // 先換成同一串寫法，轉的時候才會一段段補間
            void land.offsetWidth;
            const D = 560, E = 'cubic-bezier(.45,0,.2,1)';
            land.style.transition = 'transform ' + D + 'ms ' + E + ', background-color 280ms ease ' + Math.round(D * 0.35) + 'ms';
            land.style.transform = this._landEnd(g);
            land.classList.add('br-ldark');
            dev.style.transition = 'transform ' + D + 'ms ' + E;
            dev.style.transform = g.dev;
            scr.classList.add('vnp-rot');
            this._landBusy = performance.now() + D;
            if (g.side) this._turnHint(true);
        },
        // instant＝不演、馬上回直的（手機要收起來、換章、往下播）
        landOff: function (instant) {
            const L = this._land; if (!L) return;
            if (!instant && performance.now() < (this._landBusy || 0)) return;   // 還在轉過去，別半路折返
            this._land = null;
            const land = $('br-land'), dev = $('phone-device'), scr = $('phone-screen');
            const card = L.el && L.el.querySelector('.br-vbox');
            const box = land && land.querySelector('.br-lbox');
            clearTimeout(this._landTimer);
            const done = () => {
                if (land) { land.style.transition = 'none'; land.classList.remove('br-lon', 'br-ldark'); land.style.opacity = ''; }
                if (card) card.classList.remove('br-vaway');
                if (box) this._pvDropView(box);
                if (dev) { dev.style.transition = 'none'; dev.style.transform = ''; void dev.offsetWidth; dev.style.transition = ''; }   // 交回 CSS（滑進滑出那套）
            };
            if (scr) scr.classList.remove('vnp-rot');
            this._turnHint(false);
            if (instant || !land || !dev) { done(); return; }
            const D = 520, E = 'cubic-bezier(.45,0,.2,1)';
            if (L.start) {
                land.style.transition = 'transform ' + D + 'ms ' + E + ', background-color 200ms ease';
                land.style.transform = L.start;   // 縮回卡片那格
            } else {
                land.style.transition = 'opacity 300ms ease';   // 轉著的時候畫面尺寸變過，卡片位置不準了：淡掉
                land.style.opacity = '0';
            }
            land.classList.remove('br-ldark');
            dev.style.transition = 'transform ' + D + 'ms ' + E;
            dev.style.transform = 'translateY(0px) rotate(0deg) scale(1)';
            this._landTimer = setTimeout(done, D + 20);
        },
        // 轉著的時候畫面尺寸變了（真手機轉過來、視窗拉大小）：照新尺寸直接擺好
        _landFit: function () {
            const L = this._land, g = this._landGeom(), land = $('br-land'), dev = $('phone-device');
            if (!L || !g || !land || !dev) { this.landOff(true); return; }
            land.style.transition = 'none';
            dev.style.transition = 'none';
            this._landSize(land, g);
            land.style.transform = this._landEnd(g);
            dev.style.transform = g.dev;
            L.start = null;
            if (this._pv) this._pv.views.forEach(v => v.dms.forEach(d => { d.w = 0; }));
            this._turnHint(g.side);
        },
        // 劇情畫面是直的、影片側躺時：上面冒一下「把手機轉橫看」
        _turnHint: function (on) {
            let h = $('br-turnhint');
            clearTimeout(this._hintTimer);
            if (!on) { if (h) h.classList.remove('br-on'); return; }
            const ov = $('phone-overlay'); if (!ov) return;
            if (!h) {
                h = document.createElement('div');
                h.id = 'br-turnhint';
                h.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i><span>把手機轉橫看</span>';
                ov.appendChild(h);
            }
            h.classList.add('br-on');
            this._hintTimer = setTimeout(() => h.classList.remove('br-on'), 2400);
        },

        _pvStop: function () {
            const st = this._pv; this._pv = null;
            if (!st) return;
            if (st.timer) clearTimeout(st.timer);
            if (st.bgm) this._pvBgmOff(st.bgm);
        },

        // 🎵 宣傳片的配樂走劇情原本的背景音樂（VN_Core._playBgm）；播完換回原本那首。
        //   中途劇情自己換了歌（Jev 這章排的下一首）就不換回去，免得蓋掉
        _pvBgmKey: function (core) { return 'vn_last_bgm:' + ((core && core._currentStoryId) || ''); },
        _pvBgmOn: function (id) {
            const core = win.VN_Core || window.VN_Core;
            if (!core || !core._playBgm) return;
            let last = '';
            try { last = localStorage.getItem(this._pvBgmKey(core)) || ''; } catch (e) {}
            this._pvPrev = { last, playing: !!(core._bgmPlaying && core._bgmPlaying()) };
            core._playBgm(id);
        },
        _pvBgmOff: function (id) {
            const p = this._pvPrev; this._pvPrev = null;
            const core = win.VN_Core || window.VN_Core;
            if (!p || !core || !core._playBgm) return;
            let now = '';
            try { now = localStorage.getItem(this._pvBgmKey(core)) || ''; } catch (e) {}
            if (now !== id) return;   // 播的途中已經換成別首了
            if (p.playing && p.last) { core._playBgm(p.last); return; }
            core._playBgm('stop');
            if (p.last) { try { win.AUI.lsSet(this._pvBgmKey(core), p.last, '上一首背景音樂'); } catch (e) {} }
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
            box.innerHTML = `<b>${esc(name)}</b>` + (core._tlHtml ? core._tlHtml(ex.text) : core.parseMarkdown ? core.parseMarkdown(ex.text) : esc(ex.text));   // 外語台詞的翻譯拆到下面一行
            box.classList.remove('hidden');
            core.addLog(name, ex.text);
            if (ex.sfx) core.playSFX(ex.sfx);
            try {
                let rawExp = parts[1] || '', typeHint = '';
                if (rawExp.includes('_')) { const p = rawExp.split('_'); typeHint = p[0].trim(); rawExp = p.slice(1).join('_').trim(); }
                if (core._speakAs) core._speakAs(name, ex.text, rawExp, typeHint);   // 誰用哪個聲音交給角色配音名單
            } catch (e) { /* 語音失敗不影響畫面 */ }
        },

        _hideNar: function () { const box = $('br-nar'); if (box) { box.classList.add('hidden'); box.innerHTML = ''; } },
    };

    function textOnly(el, s) { if (el) el.textContent = s; }

    // 轉橫看影片的時候畫面尺寸變了（真手機轉過來、視窗拉大小）：照新尺寸重擺。模組載入時掛一次就好
    if (window.addEventListener) window.addEventListener('resize', () => { if (VN_Browser._land) VN_Browser._landFit(); });   // node 測試的假 window 沒這支

    win.VN_Browser = VN_Browser;
    window.VN_Browser = VN_Browser;
})();
