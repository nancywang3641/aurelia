// ----------------------------------------------------------------
// [檔案] os_phone/os/os_sn_board_ui.js — 🧑‍💼 SN 32 樓白板的畫面（掛回 OS_SN_BOARD）
// 職責：32 樓場景（白板發亮、值班的兩位站旁邊）、白板三欄、素材頁、點子頁、稿頁、收進世界的單子、值班頁、空的／睡著的。
// 資料與規則全在 os_sn_board.js；這支只畫和接按鈕。🚨 要排在 os_sn_board.js 後面載入。
// 外框 .snb-win：大廳地點的「應用」窗格用 _mountFloating 認這個 class 搬進去。
// 🚨 她的規矩：不准原地展開。長清單、要動手的東西一律換一頁（素材、點子、稿），頁首有返回鈕；白板上的卡只放看的東西＋孵化一顆。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const S = win.OS_SN_BOARD || window.OS_SN_BOARD;
    if (!S) { console.warn('[SNBoardUI] 本體沒載入'); return; }
    const SCENE_IMG = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@main/lobby_pv_bg_sn32_v1.jpg';
    const LS_MODE = 'aurelia_sn_board_mode';   // player｜author，每台機器自己記，預設玩家
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const A = () => win.AUI || window.AUI;
    function _ls() { return win.localStorage || window.localStorage; }
    function _mode() { try { return _ls().getItem(LS_MODE) === 'author' ? 'author' : 'player'; } catch (e) { return 'player'; } }
    function _setMode(m) { try { _ls().setItem(LS_MODE, m); } catch (e) {} }
    function _ago(t) {
        const m = Math.round((Date.now() - (t || 0)) / 60000);
        if (m < 1) return '剛剛';
        if (m < 60) return m + ' 分鐘前';
        if (m < 1440) return Math.round(m / 60) + ' 小時前';
        return Math.round(m / 1440) + ' 天前';
    }
    function _when(t) { const d = new Date(t), p = n => String(n).padStart(2, '0'); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }

    try {
        const a = A();
        if (a && a.registerHelp) a.registerHelp({
            sn_board: { title: 'SN 32 樓白板', body:
                '值班的人照時間來上班，一次只做一件事：先剪素材，攢到 10 張再湊成點子。\n' +
                '妳覺得哪個點子有意思就按「孵化」，他們才會寫成一份稿；另一位挑過毛病，稿才放進「等妳看」。\n' +
                '點開一份稿：左邊是方向，右邊封起來的是真正會寫進世界書的內容。「我要當玩家」不按偷看就看不到；「我要當作者」整份攤開。\n' +
                '「好，收進世界」會先給妳看單子，同意了才寫進【奧瑞亞-白板】這本世界書。\n' +
                '「回爐」寫一句為什麼，他們會照著重寫；放棄的點子，他們之後不會再提類似的。\n' +
                '「丟素材」寫一句妳的感覺，可以再貼一個連結。貼 YouTube 的歌，會先讀歌詞（字幕）剪成素材卡：連結停在哪首（或一句話裡寫「第五首」）就剪那首，都沒有就整張歌單挑最有故事的一到三首，後面重播的不算。讀歌詞要宿舍的連線開著。\n' +
                '有的歌沒有字幕（例如英文歌單裡夾一首韓文歌），讀不到歌詞；設置「哪件事走哪個模型」的「白板看影片／讀歌詞」指到看得了影片的通道（例如 Gemini）的話，連結停在那首（或寫第幾首）再丟一次，會叫它只聽那首。一次丟只叫一次模型。\n' +
                '等妳看最多 3 份，滿了就先不孵新的；兩週沒打開白板，白板會睡著、不排班，按「叫醒」再繼續。' },
            sn_board_staff: { title: '值班', body:
                '挑一位或兩位值班的人。小機用他自己的門卡（會花錢）；宿舍住戶要宿舍的連線開著才叫得到（用會員額度）。\n' +
                '每個上班時間只叫一個人，兩位輪流。一班只叫一次；沒事做的那班不叫。\n' +
                '只排一位的話，他寫的稿沒人挑毛病，會直接放進「等妳看」。\n' +
                '奧瑞亞關著的時候不上班；下次打開，錯過的只補一班。' },
        });
    } catch (e) {}

    let _win = null, _tab = 'board', _off = null, _view = null, _pickFor = -1;

    function open() {
        close();
        const doc = win.document;
        const host = doc.querySelector('.lobby-left') || doc.body;
        host.classList.add('void-dock-open');
        const box = doc.createElement('div');
        box.className = 'snb-win';
        box.innerHTML =
            '<div class="snb-head"><span class="snb-brand"><i class="fa-solid fa-building"></i><b>SN 32 樓</b><small>研討室</small></span>' +
                '<span class="snb-tabs"><button class="snb-tab" data-tab="board"><i class="fa-solid fa-chalkboard"></i>白板</button>' +
                '<button class="snb-tab" data-tab="staff"><i class="fa-solid fa-id-badge"></i>值班</button></span>' +
                '<button class="snb-x" title="關閉"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="snb-body"></div>';
        host.appendChild(box);
        _win = box;
        box.querySelector('.snb-x').addEventListener('click', close);
        box.querySelectorAll('.snb-tab').forEach(t => t.addEventListener('click', () => { _tab = t.dataset.tab; _view = null; _pickFor = -1; _render(); }));
        box.addEventListener('click', _onClick);
        _off = S.onChange(() => { if (!_view) _render(); });
        _tab = 'board'; _view = null; _pickFor = -1;
        _render();
        // 🚨 「來過」只在打開時記一次：記的時候會 saveStaff → onChange → 重畫，放在 _render 裡會無限迴圈
        S.visit().catch(() => {});
    }
    function close() {
        if (_off) { _off(); _off = null; }
        if (_win) _win.remove();
        _win = null;
        // 🚨 立繪模式時外框已經被搬進窗格，parentElement 不是 .lobby-left 了 → 一律回 .lobby-left 拿掉（同書咖、世界門、交易所）
        try { const host = win.document.querySelector('.lobby-left'); if (host) host.classList.remove('void-dock-open'); } catch (e) {}
    }
    function isOpen() { return !!(_win && _win.isConnected); }

    let _seq = 0;
    async function _render() {
        if (!_win) return;
        const my = ++_seq;   // 慢的那次畫完別蓋掉後來的
        _win.querySelectorAll('.snb-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === _tab));
        const body = _win.querySelector('.snb-body');
        let html = '';
        try {
            if (_view && _view.kind === 'draft') html = await _draftPage(_view.id);
            else if (_view && _view.kind === 'idea') html = await _ideaPage(_view.id);
            else if (_view && _view.kind === 'world') html = await _worldPage(_view.id);
            else if (_view && _view.kind === 'mats') html = await _matsPage();
            else if (_tab === 'staff') html = await _staffPage();
            else html = await _boardPage();
        } catch (e) { html = '<div class="snb-quiet">讀不到白板：' + esc((e && e.message) || '') + '</div>'; }
        if (my !== _seq || !_win) return;
        if (html === null) { _view = null; return _render(); }   // 那一頁的東西不見了（被處理掉了）→ 回白板
        // 換頁才捲回最上面；同一頁被背景重畫（有人在上班）就留在原地，不然她正在看的地方會一直跳走
        const pageKey = _tab + '|' + (_view ? _view.kind + ':' + (_view.id || '') : '');
        const keep = pageKey === _pageKey ? body.scrollTop : 0;
        _pageKey = pageKey;
        body.innerHTML = html;
        body.scrollTop = keep;
        _afterRender(body);
    }
    let _pageKey = '';
    let _after = null;
    function _afterRender(body) { const f = _after; _after = null; if (f) f(body); }

    // ── 場景：32 樓那張圖、白板發亮、值班的兩位 ──
    function _bubble(st, p) {
        if (st.running && st.runningWho === p.id) return (S.JOBS[st.runningJob] || '上班') + '中…';
        const s = (st.says || {})[p.id];
        if (s && Date.now() - s.at < 12 * 3600000) return s.text;
        return '下班了';
    }
    function _sceneHtml(st, waiting) {
        const who = st.slots.map((p, i) => p ? '<div class="snb-who snb-at-' + i + '"><div class="snb-bub">' + esc(_bubble(st, p)) + '</div>' +
            '<span class="snb-fig" data-fig="' + i + '"></span><em>' + esc(p.name) + '</em></div>' : '').join('');
        // .snb-stage＝整張圖＋疊在圖上的東西（座標都是整張圖的 %）；手機寬度只露中間白板那段（CSS 把 stage 放大平移）
        return '<div class="snb-scene"><div class="snb-stage"><img class="snb-scene-img" alt="" src="' + SCENE_IMG + '">' +
            '<div class="snb-hot' + (waiting ? ' is-lit' : '') + '">' + (waiting ? '<span>' + waiting + ' 份等妳看</span>' : '') + '</div>' + who + '</div>' +
            '<div class="snb-floor"><i class="fa-solid fa-building"></i>SN · 32F 研討室</div></div>';
    }
    function _figs(body, st) {
        st.slots.forEach((p, i) => {
            if (!p) return;
            S.lookOf(p).then(u => { const el = body.querySelector('[data-fig="' + i + '"]'); if (u && el && el.isConnected) el.innerHTML = '<img alt="" src="' + esc(u) + '">'; });
        });
    }
    function _pageHead(title, extra) {
        return '<div class="snb-oh"><button class="snb-back-btn" data-snb="back"><i class="fa-solid fa-arrow-left"></i>白板</button><h3>' + esc(title) + '</h3>' + (extra || '') + '</div>';
    }
    function _modeHtml() {
        const m = _mode();
        return '<span class="snb-mode" role="group"><button data-snb="mode" data-m="player" class="' + (m === 'player' ? 'on' : '') + '"><i class="fa-solid fa-gamepad"></i>我要當玩家</button>' +
            '<button data-snb="mode" data-m="author" class="' + (m === 'author' ? 'on' : '') + '"><i class="fa-solid fa-pen-nib"></i>我要當作者</button></span>';
    }

    // ── 第一層：白板 ──
    function _ideaCard(i, b) {
        const can = S.canHatch(b);
        const tag = i.state === 'hatching' ? '<span class="snb-tag snb-t-run">' + (i.prev ? '回爐重寫中' : '寫稿中') + '</span>' : '';
        return '<div class="snb-note ' + (i.state === 'hatching' ? 'snb-w is-pending' : 'snb-y') + '"><button class="snb-note-hit" data-snb="open-idea" data-id="' + esc(i.id) + '">' + tag + '<span class="snb-note-tx">' + esc(i.text) + '</span>' +
            '<span class="snb-meta">' + esc(i.byName || '') + '・' + _ago(i.at) + '</span></button>' +
            (i.state === 'wild' ? '<button class="snb-hatch" data-snb="hatch" data-id="' + esc(i.id) + '"' + (can ? '' : ' disabled') + '><i class="fa-solid fa-egg"></i>' + (can ? '孵化' : '先看完再孵') + '</button>' : '') + '</div>';
    }
    function _draftCard(d) {
        const tag = d.state === 'check' ? '<span class="snb-tag snb-t-run">挑毛病中</span>' : d.unchecked ? '<span class="snb-tag snb-t-hot">沒人挑過</span>' : '<span class="snb-tag snb-t-hot">等妳看</span>';
        return '<div class="snb-note snb-w"><button class="snb-note-hit" data-snb="open-draft" data-id="' + esc(d.id) + '">' + tag + '<span class="snb-note-tx">' + esc(d.title) + '</span>' +
            '<span class="snb-meta">' + esc(d.writer && d.writer.name) + ' 寫' + (d.checker ? '・' + esc(d.checker.name) + ' 挑過' : '') + '・' + _ago(d.at) + '</span></button></div>';
    }
    async function _boardPage() {
        const st = await S.getStaff(), b = await S.getBoard();
        const waiting = b.drafts.filter(d => d.state === 'wait').length;
        let h = _sceneHtml(st, waiting);
        if (S.isAsleep(st, Date.now())) {
            h += '<div class="snb-board snb-mini is-asleep"><span class="snb-zz">z z</span><p>白板睡著了</p><small>兩週沒人看，大家先停手不花額度</small>' +
                '<button class="snb-wake" data-snb="wake"><i class="fa-solid fa-sun"></i>叫醒</button></div>';
        } else {
            const empty = !b.materials.length && !b.ideas.length && !b.drafts.length && !b.world.length;
            const a = A();
            h += '<div class="snb-board"><div class="snb-tools">' +
                '<button data-snb="open-mats"><i class="fa-solid fa-layer-group"></i>素材 ' + b.materials.length + '／' + S.CAPS.MATS + '</button>' +
                '<button data-snb="add-mat"><i class="fa-solid fa-plus"></i>丟素材</button>' +
                (a && a.helpBtn ? a.helpBtn('sn_board') : '') + '</div>';
            if (empty) {
                h += '<div class="snb-mini"><i class="fa-solid fa-thumbtack"></i><p>白板還是空的</p><small>' +
                    (st.slots.some(Boolean) ? '值班的人上班時會先剪素材；妳也可以按「丟素材」丟一句話' : '先到「值班」排人，他們上班時會先剪素材') + '</small></div>';
            } else {
                const wc = S.waitCount(b);
                // 孵化中／回爐中的點子算在「等妳看」那 3 份裡，就排在那一欄（不然那欄寫 1／3 卻是空的）
                const wild = b.ideas.filter(i => i.state === 'wild'), hatching = b.ideas.filter(i => i.state === 'hatching');
                h += '<div class="snb-cols">' +
                    '<section class="snb-col snb-c-idea"><div class="snb-ch"><i class="fa-solid fa-lightbulb"></i>野生點子<small>' + wild.length + '／' + S.CAPS.IDEAS + '</small></div>' +
                        (wild.length ? wild.map(i => _ideaCard(i, b)).join('') : '<div class="snb-slot">素材攢到 10 張，他們會湊點子</div>') + '</section>' +
                    '<section class="snb-col snb-c-wait"><div class="snb-ch"><i class="fa-solid fa-hourglass-half"></i>等妳看<small>' + wc + '／' + S.CAPS.WAIT + '</small></div>' +
                        (wc ? hatching.map(i => _ideaCard(i, b)).join('') + b.drafts.map(_draftCard).join('') : '<div class="snb-slot">孵化一個點子，他們會寫成稿</div>') +
                        (wc >= S.CAPS.WAIT ? '<div class="snb-quiet"><i class="fa-solid fa-circle-pause"></i>滿了，先看完再孵</div>' : '') + '</section>' +
                    '<section class="snb-col snb-c-done"><div class="snb-ch"><i class="fa-solid fa-book-bookmark"></i>收進世界<small>' + b.world.length + '</small></div>' +
                        (b.world.length ? b.world.map(w => '<div class="snb-note snb-g"><button class="snb-note-hit" data-snb="open-world" data-id="' + esc(w.id) + '"><span class="snb-tag snb-t-ok">已進世界書</span><span class="snb-note-tx">' + esc(w.title) + '</span>' +
                            '<span class="snb-meta">' + esc(S.countText(w.count)) + '・' + _when(w.at) + '</span></button></div>').join('') : '<div class="snb-slot">還沒有</div>') + '</section>' +
                    '</div>';
            }
            h += '</div>';
        }
        _after = body => _figs(body, st);
        return h;
    }

    // ── 第二層：素材 ──
    async function _matsPage() {
        const b = await S.getBoard();
        return '<div class="snb-page">' + _pageHead('素材 ' + b.materials.length + '／' + S.CAPS.MATS, '<button class="snb-pill" data-snb="add-mat"><i class="fa-solid fa-plus"></i>丟素材</button>') +
            (b.materials.length ? '<div class="snb-list">' + b.materials.map(m =>
                '<div class="snb-row-item"><div class="snb-row-main"><span>' + esc(m.text) + '</span><small>' + esc([m.by === 'rae' ? '' : m.byName, m.why, m.source].filter(Boolean).join('・')) + '</small></div>' +
                (m.link ? '<a class="snb-link" href="' + esc(m.link) + '" target="_blank" rel="noopener noreferrer" title="打開連結"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>' : '') +
                (m.by === 'rae' ? '<button class="snb-mini-x" data-snb="drop-mat" data-id="' + esc(m.id) + '" title="拿掉"><i class="fa-solid fa-xmark"></i></button>' : '') + '</div>').join('') + '</div>'
                : '<div class="snb-mini"><i class="fa-solid fa-layer-group"></i><p>還沒有素材</p><small>值班的人上班時會剪；妳也可以丟一句話</small></div>') +
            '<p class="snb-foot">攢到 10 張，值班的人會挑 2～3 張湊成點子；妳丟的先用。</p></div>';
    }

    // ── 第二層：一個點子（從哪幾張素材來、放棄）──
    async function _ideaPage(id) {
        const b = await S.getBoard();
        const i = b.ideas.find(x => x.id === id);
        if (!i) return null;
        return '<div class="snb-page">' + _pageHead(i.state === 'hatching' ? (i.prev ? '回爐重寫中' : '寫稿中的點子') : '野生點子') +
            '<div class="snb-front"><p>' + esc(i.text) + '</p>' + (i.keys && i.keys.length ? '<div class="snb-adds">' + i.keys.map(k => '<span>' + esc(k) + '</span>').join('') + '</div>' : '') + '</div>' +
            (i.redo ? '<div class="snb-msg"><span class="snb-ava">妳</span><div><u>回爐的理由</u>' + esc(i.redo) + '</div></div>' : '') +
            '<h4 class="snb-h4"><i class="fa-solid fa-layer-group"></i>用了這幾張素材</h4>' +
            (i.from && i.from.length ? '<div class="snb-list">' + i.from.map(m => '<div class="snb-row-item"><div class="snb-row-main"><span>' + esc(m.text) + '</span><small>' + esc([m.why, m.source].filter(Boolean).join('・')) + '</small></div></div>').join('') + '</div>' : '<div class="snb-quiet">沒有記到</div>') +
            '<div class="snb-acts"><button class="snb-drop" data-snb="drop-idea" data-id="' + esc(i.id) + '"><i class="fa-solid fa-xmark"></i>放棄這個點子</button></div></div>';
    }

    // ── 第二層：一份稿 ──
    async function _draftPage(id) {
        const b = await S.getBoard();
        const d = b.drafts.find(x => x.id === id);
        if (!d) return null;
        const author = _mode() === 'author', opened = author || d.peeked;
        const back = opened
            ? '<div class="snb-back is-open"><h4><i class="fa-solid fa-lock-open"></i>後台</h4>' + d.entries.map(e =>
                '<div class="snb-entry"><b>' + esc(e.name) + '</b><small>' + esc(S.KINDS[e.kind]) + '・' + esc(e.keys.join('、')) + '</small><p>' + esc(e.content) + '</p></div>').join('') + '</div>'
            : '<div class="snb-back"><h4><i class="fa-solid fa-lock"></i>後台（封起來）</h4><div class="snb-seal"><div class="snb-wax"><i class="fa-solid fa-feather"></i></div>' +
                '<button class="snb-peek" data-snb="peek" data-id="' + esc(d.id) + '"><i class="fa-solid fa-eye"></i>偷看</button>' +
                '<small>' + (d.checker ? esc(d.checker.name) + ' 挑過毛病：跟現有世界書對過了' : d.state === 'check' ? '還在等另一位挑毛病' : '沒人挑過毛病') + '</small></div></div>';
        const counts = S._pure.countKinds(d.entries);
        return '<div class="snb-page snb-open">' + _pageHead(d.title, _modeHtml()) +
            '<div class="snb-two"><div class="snb-front"><h4><i class="fa-solid fa-compass"></i>方向</h4><p>' + esc(d.front) + '</p>' +
                '<h4><i class="fa-solid fa-box-open"></i>會加進世界的東西</h4><div class="snb-adds">' +
                Object.keys(S.KINDS).filter(k => counts[k]).map(k => '<span><b>' + counts[k] + '</b>個' + S.KINDS[k] + '</span>').join('') + '</div></div>' + back + '</div>' +
            (d.notes.length ? '<div class="snb-talk">' + d.notes.map(n => '<div class="snb-msg"><span class="snb-ava">' + esc(String(n.name || '?').slice(0, 1)) + '</span><div><u>' + (n.role === 'check' ? '挑毛病的' : '寫稿的') + '・' + esc(n.name) + '</u>' + esc(n.text) + '</div></div>').join('') + '</div>' : '') +
            (d.state === 'wait'
                ? '<div class="snb-acts"><button class="snb-go" data-snb="approve" data-id="' + esc(d.id) + '"><i class="fa-solid fa-stamp"></i>好，收進世界</button>' +
                  '<button class="snb-redo" data-snb="redo" data-id="' + esc(d.id) + '"><i class="fa-solid fa-rotate"></i>回爐</button>' +
                  '<button class="snb-drop" data-snb="drop-draft" data-id="' + esc(d.id) + '"><i class="fa-solid fa-xmark"></i>放棄</button></div>'
                : '<div class="snb-quiet"><i class="fa-solid fa-hourglass-half"></i>還在等另一位挑毛病</div>' +
                  '<div class="snb-acts"><button class="snb-drop" data-snb="drop-draft" data-id="' + esc(d.id) + '"><i class="fa-solid fa-xmark"></i>放棄</button></div>') + '</div>';
    }

    // ── 第二層：收進世界的一份（看寫了什麼、改回去）──
    async function _worldPage(id) {
        const b = await S.getBoard();
        const w = b.world.find(x => x.id === id);
        if (!w) return null;
        const d = w.draft || null;
        const showAll = _mode() === 'author' || !!(d && d.peeked);
        return '<div class="snb-page">' + _pageHead(w.title, _modeHtml()) +
            '<p class="snb-foot">' + _when(w.at) + ' 寫進【' + esc(S.BOOK.replace(/[【】]/g, '')) + '】：' + esc(S.countText(w.count)) + '</p>' +
            (d && showAll ? '<div class="snb-back is-open">' + d.entries.map(e => '<div class="snb-entry"><b>' + esc(e.name) + '</b><small>' + esc(S.KINDS[e.kind]) + '・' + esc(e.keys.join('、')) + '</small><p>' + esc(e.content) + '</p></div>').join('') + '</div>'
                : '<p class="snb-quiet">內容先不給妳看，免得劇透。</p>') +
            ((w.props || []).length
                ? '<div class="snb-acts"><button class="snb-drop" data-snb="undo-world" data-id="' + esc(w.id) + '"><i class="fa-solid fa-rotate-left"></i>改回去</button></div><p class="snb-foot">改回去會把這幾條從那本世界書拿掉，稿回到「等妳看」。</p>'
                : '') + '</div>';
    }

    // ── 丟素材：一句話＋連結（YouTube 的會先看一遍，要等一下）──
    function _dropSheet() {
        if (!_win || _win.querySelector('.snb-sheet-wrap')) return;
        const a = A();
        const sheet = win.document.createElement('div');
        sheet.className = 'snb-sheet-wrap';
        sheet.innerHTML = '<div class="snb-sheet"><h3>丟素材</h3>' +
            '<label class="snb-field"><span>一句話</span><input class="snb-in" data-f="note" maxlength="80"></label>' +
            '<label class="snb-field"><span>連結</span><input class="snb-in" data-f="link" maxlength="300" inputmode="url"></label>' +
            '<div class="snb-drop-status"></div>' +
            '<div class="snb-acts"><button class="snb-go" data-snb="drop-ok"><i class="fa-solid fa-thumbtack"></i>丟上去</button><button class="snb-drop" data-snb="drop-no">先不要</button></div></div>';
        _win.appendChild(sheet);
        const note = sheet.querySelector('[data-f="note"]'), link = sheet.querySelector('[data-f="link"]'), st = sheet.querySelector('.snb-drop-status');
        try { note.focus({ preventScroll: true }); } catch (e) {}
        const lock = on => sheet.querySelectorAll('input,button').forEach(x => { x.disabled = on; });
        sheet.addEventListener('click', async ev => {
            const t = ev.target.closest('[data-snb]');
            if (!t) return;
            if (t.dataset.snb === 'drop-no') { sheet.remove(); return; }
            if (t.dataset.snb !== 'drop-ok') return;
            const yt = !!S._pure.youTubeUrl(link.value);
            lock(true);
            st.innerHTML = yt ? '<i class="fa-solid fa-spinner fa-spin"></i> 正在讀這支…（要用聽的會等一兩分鐘）' : '';
            const r = await S.act.dropMaterial({ note: note.value, link: link.value });
            if (!r || !r.ok) { st.textContent = (r && r.why) || '沒丟上去'; lock(false); return; }
            sheet.remove();
            const done = r.read ? '讀了歌詞，' + r.n + ' 張素材放上白板' : r.watched ? '看完了，素材放上白板' : '';
            if (a) a.toast(done ? done + (r.why ? '。' + r.why : '') : (r.why || '素材放上白板了'), { type: r.why ? 'warn' : 'success' });
            _render();
        });
    }

    // ── 收進世界的單子 ──
    async function _approve(id) {
        const a = A();
        const p = await S.prepareWorld(id);
        if (!p.ok) { if (a) a.alert(p.why); return; }
        const b = await S.getBoard();
        const d = b.drafts.find(x => x.id === id);
        if (!d || !_win) return;
        const author = _mode() === 'author';
        const sheet = win.document.createElement('div');
        sheet.className = 'snb-sheet-wrap';
        sheet.innerHTML = '<div class="snb-sheet"><h3>收進世界：「' + esc(d.title) + '」</h3>' +
            '<p>寫進【' + esc(S.BOOK.replace(/[【】]/g, '')) + '】：' + esc(S.countText(p.count)) + '。</p>' +
            (author ? d.entries.map(e => '<div class="snb-entry"><b>' + esc(e.name) + '</b><small>' + esc(S.KINDS[e.kind]) + '・' + esc(e.keys.join('、')) + '</small><p>' + esc(e.content) + '</p></div>').join('')
                : '<p class="snb-quiet">內容先不給妳看，免得劇透。</p>') +
            (p.attached ? '' : '<div class="snb-attach"><span>' + (p.pwa ? '手機版還沒打開這本（打開後每個故事都讀得到）' : '這本還沒掛在現在的角色卡上') + '</span><button data-snb="attach"><i class="fa-solid fa-link"></i>掛上</button></div>') +
            '<div class="snb-acts"><button class="snb-go" data-snb="sheet-ok"><i class="fa-solid fa-check"></i>同意，寫進去</button><button class="snb-drop" data-snb="sheet-no">先不要</button></div></div>';
        _win.appendChild(sheet);
        sheet.addEventListener('click', async ev => {
            const t = ev.target.closest('[data-snb]');
            if (!t) return;
            if (t.dataset.snb === 'sheet-no') { sheet.remove(); return; }
            if (t.dataset.snb === 'attach') {
                const r = await S.attach();
                if (!r.ok) { if (a) a.alert(r.why); return; }
                const row = t.closest('.snb-attach'); if (row) row.remove();
                return;
            }
            if (t.dataset.snb === 'sheet-ok') {
                t.disabled = true;
                const r = await S.commitWorld(id);
                sheet.remove();
                if (!r.ok) { if (a) a.alert(r.why); return; }
                if (a) a.toast('收進世界了', { type: 'success' });
                _view = null; _render();
            }
        });
    }

    // ── 值班頁 ──
    async function _staffPage() {
        const st = await S.getStaff(), c = await S.candidates(), log = await S.shifts();
        if (st.unread) S.saveStaff({ unread: false }).catch(() => {});
        const a = A();
        const frame = (p, i) => p
            ? '<div class="snb-frame"><span class="snb-face" data-face="' + i + '"><i class="fa-solid fa-user"></i></span><span class="snb-fname">' + esc(p.name) + '</span>' +
              '<span class="snb-frame-acts"><button data-snb="pick" data-i="' + i + '">換人</button><button data-snb="unpick" data-i="' + i + '">空出來</button></span></div>'
            : '<button class="snb-frame is-empty" data-snb="pick" data-i="' + i + '"><i class="fa-solid fa-plus"></i><span>排一位</span></button>';
        const busy = S.isBusy() || !!(st.running && Date.now() - st.running < 10 * 60000);
        const taken = st.slots.filter(Boolean).map(p => p.id);
        const cand = x => '<button class="snb-cand" data-snb="choose" data-i="' + _pickFor + '" data-type="' + x.type + '" data-id="' + esc(x.id) + '"' + (taken.indexOf(x.id) >= 0 ? ' disabled' : '') + '>' +
            '<span class="snb-cface" data-cface="' + esc(x.type + ':' + x.id) + '"><i class="fa-solid fa-user"></i></span><span>' + esc(x.name) + '</span></button>';
        let h = '<div class="snb-staff"><div class="snb-sh"><b><i class="fa-solid fa-id-badge"></i>值班的人</b>' + (a && a.helpBtn ? a.helpBtn('sn_board_staff') : '') + '</div>' +
            '<div class="snb-frames">' + frame(st.slots[0], 0) + frame(st.slots[1], 1) + '</div>';
        if (_pickFor >= 0) {
            h += '<div class="snb-picker"><div class="snb-glabel">小機（用自己的門卡）</div>' + (c.xiaoji.length ? '<div class="snb-grid">' + c.xiaoji.map(cand).join('') + '</div>' : '<div class="snb-quiet">還沒有收下小機</div>') +
                '<div class="snb-glabel">宿舍住戶（用會員額度）</div>' + (!c.dormReady ? '<div class="snb-quiet">宿舍的連線還沒設定</div>' : c.dorm.length ? '<div class="snb-grid">' + c.dorm.map(cand).join('') + '</div>' : '<div class="snb-quiet">宿舍還沒有人</div>') + '</div>';
        }
        if (st.slots.some(Boolean)) {
            h += '<div class="snb-block"><div class="snb-row"><span>上班</span><button class="snb-switch" role="switch" aria-checked="' + (st.on ? 'true' : 'false') + '" data-snb="on"><i></i></button></div>' +
                '<div class="snb-glabel">上班時間</div><div class="snb-times">' +
                st.times.map(t => '<span class="snb-time">' + t + '<button data-snb="del-time" data-t="' + t + '" aria-label="刪掉 ' + t + '"><i class="fa-solid fa-xmark"></i></button></span>').join('') +
                (st.times.length ? '' : '<span class="snb-quiet">還沒排</span>') +
                (st.times.length < 6 ? '<button class="snb-add" data-snb="add-time" aria-label="加一個時間"><i class="fa-solid fa-plus"></i></button>' : '') + '</div>' +
                '<button class="snb-now" data-snb="now"' + (busy ? ' disabled' : '') + '>' + (busy ? '<i class="fa-solid fa-spinner fa-spin"></i>上班中…' : '<i class="fa-solid fa-bell"></i>現在叫下一位上班') + '</button></div>';
        }
        h += '<div class="snb-sh"><b><i class="fa-solid fa-clipboard-list"></i>值班紀錄</b><small>' + log.length + ' 班</small></div>' +
            (log.length ? log.map(r => '<div class="snb-shift' + (r.error ? ' is-err' : r.did === 'idle' ? ' is-quiet' : '') + '"><b>' + _when(r.at) + '・' + esc(r.who.name) + '・' + esc(S.JOBS[r.did] || '') + '</b>' +
                '<span>' + esc(r.error ? '沒上成：' + r.error : r.text) + (r.quota && !r.error && r.did !== 'idle' ? '（用的是會員額度）' : '') + '</span>' + (r.say ? '<small>「' + esc(r.say) + '」</small>' : '') + '</div>').join('')
                : '<div class="snb-quiet">還沒有人上過班。</div>') + '</div>';
        _after = body => {
            st.slots.forEach((p, i) => { if (p) S.faceOf(p).then(u => { const el = body.querySelector('[data-face="' + i + '"]'); if (u && el) el.innerHTML = '<img alt="" src="' + esc(u) + '">'; }); });
            if (_pickFor >= 0) [].concat(c.xiaoji, c.dorm).forEach(x => S.faceOf(x).then(u => {
                const el = [].find.call(body.querySelectorAll('[data-cface]'), e => e.getAttribute('data-cface') === x.type + ':' + x.id);
                if (u && el) el.innerHTML = '<img alt="" src="' + esc(u) + '">';
            }));
        };
        return h;
    }

    // ── 按鈕 ──
    async function _onClick(ev) {
        const t = ev.target.closest('[data-snb]');
        if (!t || !_win || !_win.contains(t) || t.closest('.snb-sheet-wrap')) return;
        const k = t.dataset.snb, id = t.dataset.id, a = A();
        const said = r => { if (r && !r.ok && a) a.toast(r.why, { type: 'warn' }); return r; };
        if (k === 'mode') { _setMode(t.dataset.m); return _render(); }
        if (k === 'back') { _view = null; return _render(); }
        if (k === 'open-mats') { _view = { kind: 'mats' }; return _render(); }
        if (k === 'open-idea') { _view = { kind: 'idea', id }; return _render(); }
        if (k === 'open-draft') { _view = { kind: 'draft', id }; return _render(); }
        if (k === 'open-world') { _view = { kind: 'world', id }; return _render(); }
        if (k === 'undo-world') {
            if (a && !(await a.confirm('改回去？這幾條會從【' + S.BOOK.replace(/[【】]/g, '') + '】拿掉，稿回到「等妳看」。'))) return;
            t.disabled = true;
            const r = await S.undoWorld(id);
            if (!r.ok) { if (a) a.alert(r.why); return _render(); }
            if (a) a.toast('改回去了', { type: 'success' });
            _view = null; return _render();
        }
        if (k === 'add-mat') return _dropSheet();
        if (k === 'drop-mat') { said(await S.act.drop('material', id)); return _render(); }
        if (k === 'hatch') { said(await S.act.hatch(id)); return _render(); }
        if (k === 'drop-idea') {
            if (a && !(await a.confirm('放棄這個點子？他們之後不會再提類似的。'))) return;
            said(await S.act.drop('idea', id)); _view = null; return _render();
        }
        if (k === 'peek') { said(await S.act.peek(id)); return _render(); }
        if (k === 'approve') return _approve(id);
        if (k === 'redo') {
            const why = a ? await a.prompt('哪裡不對？寫一句，他們會照著重寫', '') : '';
            if (!why) return;
            said(await S.act.redo(id, why)); _view = null; return _render();
        }
        if (k === 'drop-draft') {
            if (a && !(await a.confirm('放棄這份稿？他們之後不會再提類似的。'))) return;
            said(await S.act.drop('draft', id)); _view = null; return _render();
        }
        if (k === 'wake') { await S.wake(); return _render(); }
        if (k === 'pick') { const i = +t.dataset.i; _pickFor = _pickFor === i ? -1 : i; return _render(); }
        if (k === 'unpick') { said(await S.setSlot(+t.dataset.i, null)); return _render(); }
        if (k === 'choose') {
            const c = await S.candidates();
            const x = [].concat(c.xiaoji, c.dorm).find(y => y.type === t.dataset.type && y.id === id);
            if (!x) return;
            said(await S.setSlot(+t.dataset.i, x)); _pickFor = -1; return _render();
        }
        if (k === 'on') { const st = await S.getStaff(); await S.setOn(!st.on); return _render(); }
        if (k === 'del-time') { const st = await S.getStaff(); await S.setTimes(st.times.filter(x => x !== t.dataset.t)); return _render(); }
        if (k === 'add-time') {
            const inp = win.document.createElement('input');
            inp.type = 'time'; inp.className = 'snb-newtime'; inp.setAttribute('aria-label', '新的上班時間');
            t.replaceWith(inp);
            try { inp.focus({ preventScroll: true }); } catch (e) {}
            let done = false;
            const commit = async () => { if (done) return; done = true; const st = await S.getStaff(); if (inp.value) await S.setTimes(st.times.concat(inp.value)); _render(); };
            inp.addEventListener('change', commit);
            inp.addEventListener('blur', commit);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { done = true; _render(); } });
            return;
        }
        if (k === 'now') {
            t.disabled = true;
            const p = S.runShift({ force: true });
            _render();   // 馬上換成「上班中…」
            const r = await p;
            if (r && r.skipped && a) a.toast(r.skipped === 'locked' ? '另一個視窗有人在上班，等一下再來看。' : r.skipped === 'nostaff' ? '先排一位值班的人。' : '現在還不能上班。', { type: 'info' });
            return _render();
        }
    }

    Object.assign(S, { open, close, isOpen });
})();
