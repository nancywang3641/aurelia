// ----------------------------------------------------------------
// [檔案] os_sims.js — 模擬市民模式（2026-10-15，只有 PWA 版載）
// 網址帶 ?sims=1 才動；沒帶就什麼都不做（酒館、她手機上的 PWA 平常完全不會走到這支）。
//
// 用在哪：Vproject 的 SimTalk 小程式把奧瑞亞的資料夾掛在自己的 /aurelia/ 底下，
//   疊在遊戲上的小窗開 /aurelia/index.html?sims=1 ——開機不掛大廳，直接是手機、聊天 app；
//   聯絡人＝遊戲裡的市民，聊天室最上面一條狀態卡（心情、你們是、遊戲時間），桌面多一個「最近發生的事」。
//   她的原話：「直接拿奧瑞亞的樣式過來…奧瑞亞也是注入當前內容生成手機資訊」「但是不是狀態卡可以保留?」
//
// 分工：小程式＝腦袋和耳朵（每個市民的記憶、遊戲現況、把回覆送進遊戲跳通知）；這支＝臉和嘴。
//   講話前跟小程式要這位市民的情境（POST /api/aurelia/context），os_api_engine 組內容時接進去；
//   回完把這一輪交回去（POST /api/aurelia/after），該整理記憶時小程式給一份題目（memJob），
//   這邊用設置裡「模擬市民記性」那條模型跑完交回（POST /api/aurelia/memjob）。小程式這條路不拿 API key。
//
// 資料跟酒館分開：小窗是另一個網址，瀏覽器儲存本來就是一個網址一份，不用另外隔。
// 聊天室編號 sims_<市民 id>，聊天室上帶 sims:{id}；其他地方認「這間是不是市民」一律看 chat.sims。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const ACTIVE = (function () { try { return /[?&]sims=1(?:&|$)/.test(location.search); } catch (e) { return false; } })();
    const API = '/api/aurelia';          // 跟這頁同一個網址（小程式自己開的），不用跨網域
    const POLL_MS = 5000;                // 遊戲狀態多久拉一次（小窗藏起來時不拉）
    const ID_PREFIX = 'sims_';
    const KEEP_APPS = ['wx', 'sims_notes', 'sysset', 'settings', 'appstore'];   // 桌面只留這幾個（第一次開才收，之後她自己擺）
    const LAID_KEY = 'os_sims_home_laid';

    let _state = null;    // 最近一次 /state
    let _err = '';        // 連不上小程式時，畫面上那一句
    let _notes = [];
    let _timer = 0;
    let _syncing = false;
    // 她從「最近發生的事」挑的那則，等這一輪講完才清：市民 id → 通知 id。
    //   🚨 不能記在聊天室物件上——聊天 app 一打開就從存檔重讀聊天室、整個換成新物件，記號會跟著不見
    const _pendingNote = {};

    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _toast(s) { try { win.AUI.toast(s); } catch (e) {} }

    async function _get(path) {
        const r = await fetch(API + path, { cache: 'no-store' });
        let j = null; try { j = await r.json(); } catch (e) {}
        if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
        return j || {};
    }
    async function _post(path, body) {
        const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
        let j = null; try { j = await r.json(); } catch (e) {}
        if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
        return j || {};
    }

    function chatIdOf(simId) { return ID_PREFIX + String(simId); }
    function isSimsChat(chat) { return !!(ACTIVE && chat && chat.sims && chat.sims.id != null); }
    function simOf(chat) {
        if (!isSimsChat(chat) || !_state) return null;
        const id = String(chat.sims.id);
        return (_state.sims || []).find(function (s) { return String(s.id) === id; }) || null;
    }
    function meName() { return (_state && _state.me && _state.me.name) || ''; }

    // ── 跟小程式同步：市民變聯絡人、主控市民就是「我」 ───────────────
    async function sync() {
        if (!ACTIVE || _syncing) return;
        _syncing = true;
        try {
            let st;
            try { st = await _get('/state'); _err = ''; }
            catch (e) { _err = '連不上遊戲外的小程式（' + ((e && e.message) || e) + '）'; _paint(); return; }
            _state = st;
            const W = win.wxApp;
            // 聊天 app 還沒打開過＝它的聊天室還沒從存檔讀進來：這時候建聯絡人會蓋掉舊紀錄，等它開了再建
            if (W && W.APP_CONTAINER && W.ensureContactChat) {
                let added = false;
                for (const s of (st.sims || [])) {
                    if (s == null || s.id == null || !s.name) continue;
                    const had = !!W.GLOBAL_CHATS[chatIdOf(s.id)];
                    await W.ensureContactChat(chatIdOf(s.id), String(s.name), { sims: { id: String(s.id) } });
                    if (!had) added = true;
                }
                if (added && !W.GLOBAL_ACTIVE_ID) { try { W.render(); } catch (e) {} }
            }
            // 我＝現在操作的那位市民（聊天 app 裡「我」的名字只有一個出處：WX_PROFILE 的暱稱）
            try {
                const P = win.WX_PROFILE;
                if (st.me && st.me.name && P && P.get && P.update) {
                    const cur = (P.get() || {}).nickname || '';
                    if (cur !== st.me.name) P.update({ nickname: String(st.me.name) });
                }
            } catch (e) {}
            _paint();
        } finally { _syncing = false; }
    }
    async function _syncNotes() {
        try { const r = await _get('/notes'); _notes = Array.isArray(r.notes) ? r.notes : []; return true; }
        catch (e) { _err = '連不上遊戲外的小程式（' + ((e && e.message) || e) + '）'; return false; }
    }

    // ── 聊天室最上面那條狀態卡 ─────────────────────────────────────
    function statusHtml(chat) {
        if (!isSimsChat(chat)) return '';
        if (_err) return '<div class="sims-status is-off"><i class="fa-solid fa-plug-circle-xmark"></i><span>' + _esc(_err) + '</span></div>';
        const s = simOf(chat);
        const g = _state || {};
        if (!s) return '<div class="sims-status is-off"><i class="fa-solid fa-user-slash"></i><span>' + (g.online ? '他現在不在遊戲裡' : '遊戲沒開') + '</span></div>';
        const cells = [
            ['心情', s.mood || '—'],
            ['你們是', s.rel || '還不熟'],
            ['遊戲時間', g.online ? (g.gameTime || '—') : '遊戲沒開']
        ];
        return '<div class="sims-status">' + cells.map(function (c) {
            return '<div class="sims-status-cell"><span>' + _esc(c[0]) + '</span><b>' + _esc(c[1]) + '</b></div>';
        }).join('') + '</div>';
    }
    // 聊天 app 每次重畫完叫這支（wx_core 的 render）；狀態一更新也叫一次
    function decorate(root, chat) {
        if (!ACTIVE || !root) return;
        const old = root.querySelector('.sims-status');
        if (old) old.remove();
        if (!isSimsChat(chat)) return;
        const h = root.querySelector('.wx-header');
        if (h) h.insertAdjacentHTML('afterend', statusHtml(chat));
    }
    function _paint() {
        const W = win.wxApp;
        if (W && W.APP_CONTAINER) decorate(W.APP_CONTAINER, W.GLOBAL_ACTIVE_ID ? W.GLOBAL_CHATS[W.GLOBAL_ACTIVE_ID] : null);
        const n = document.querySelector('.sims-notes');
        if (n) _renderNotesInto(n);
    }

    // ── 講話前：這位市民的情境（os_api_engine 組內容時叫） ───────────────
    // 她剛傳、他還沒回的那幾則（從最後面往前數，數到他上一次說話為止；「對方正在輸入」那顆不算）
    function _pendingUserText(chat) {
        const ms = (chat && chat.messages) || [];
        const out = [];
        for (let i = ms.length - 1; i >= 0; i--) {
            const m = ms[i];
            if (!m || m.isLoading) continue;
            if (m.type && m.type !== 'msg') continue;
            if (!m.isMe) break;
            out.unshift(String(m.content || ''));
        }
        return out.join('\n');
    }
    async function contextFor(chat) {
        if (!isSimsChat(chat)) return '';
        const body = { simId: String(chat.sims.id), text: _pendingUserText(chat) };
        if (_pendingNote[body.simId]) body.noteId = _pendingNote[body.simId];
        const r = await _post('/context', body);
        const blocks = (Array.isArray(r.blocks) ? r.blocks : []).filter(function (b) { return b && b.text; });
        if (!blocks.length) return '';
        return blocks.map(function (b) { return (b.name ? '【' + b.name + '】\n' : '') + String(b.text).trim(); }).join('\n\n');
    }

    // ── 回完話：交回小程式記進他的記憶、送進遊戲跳通知 ─────────────────
    //   newMsgs＝這一輪畫出來的那幾顆泡泡（wx_core 的 onFinishReply／_applyRelayReply 存完檔後叫）
    async function afterReply(chat, newMsgs) {
        if (!isSimsChat(chat)) return;
        const mine = (newMsgs || []).filter(function (m) { return m && !m.isMe && !m.isLoading && (!m.type || m.type === 'msg') && m.content; });
        const reply = mine.map(function (m) { return String(m.content); }).join('\n\n');   // 小程式照空行拆回一則一則
        const sid = String(chat.sims.id);
        const noteId = _pendingNote[sid] || null;
        delete _pendingNote[sid];
        if (!reply) return;
        // 她這一輪說的：第一顆新泡泡前面、連著的那幾則她的話
        const ms = chat.messages || [];
        let at = mine.length ? ms.indexOf(mine[0]) : -1;
        if (at < 0) at = ms.length - mine.length;
        const user = [];
        for (let i = at - 1; i >= 0; i--) {
            const m = ms[i];
            if (!m || m.isLoading) continue;
            if (m.type && m.type !== 'msg') continue;
            if (!m.isMe) break;
            user.unshift(String(m.content || ''));
        }
        let r = null;
        try { r = await _post('/after', { simId: String(chat.sims.id), user: user.join('\n'), reply: reply, noteId: noteId, at: Date.now() }); }
        catch (e) { console.warn('[OS_SIMS] 交回小程式失敗（這一輪沒記進他的記憶）:', e); _toast('這一輪沒交回遊戲外的小程式：' + ((e && e.message) || e)); return; }
        if (r && r.memJob) _runMemJob(r.memJob);
    }

    // 記性那一通：小程式出題、這邊用她設置裡「模擬市民記性」那條模型跑、交回去
    async function _runMemJob(job) {
        if (!job || job.id == null) return;
        const S = win.OS_SETTINGS || {}, A = win.OS_API;
        if (!A || !A.chat) return;
        const base = S.getConfigFor ? S.getConfigFor('sims_memory') : (S.getConfig ? S.getConfig() : {});
        const config = Object.assign({}, base || {}, { customCot: '', customCotMap: {}, usePresetPrompts: false });
        const msgs = [{ role: 'system', content: String(job.system || '') }, { role: 'user', content: String(job.user || '') }];
        let text = '', err = null;
        await new Promise(function (done) {
            try {
                A.chat(msgs, config, null,
                    function (t) { text = String(t == null ? '' : t); done(); },
                    function (e) { err = e; done(); },
                    { task: 'sims_memory', noRoute: true, label: '模擬市民記性' });
            } catch (e) { err = e; done(); }
        });
        try {
            await _post('/memjob', err ? { id: job.id, error: String((err && err.message) || err) } : { id: job.id, text: text });
        } catch (e) { console.warn('[OS_SIMS] 記性結果交不回去:', e); }
    }

    // ── 桌面那個「最近發生的事」：遊戲右上角跳過的通知，挑一則讓那個人傳訊息來聊 ─────
    function _renderNotesInto(root) {
        const g = _state || {};
        let h = '<div class="sims-notes-head"><b><i class="fa-solid fa-bell"></i> 最近發生的事</b>'
            + '<button type="button" class="sims-notes-back" data-sims-act="home" aria-label="回主畫面"><i class="fa-solid fa-chevron-left"></i></button></div>';
        if (_err) h += '<div class="sims-notes-empty"><i class="fa-solid fa-plug-circle-xmark"></i><p>' + _esc(_err) + '</p></div>';
        else if (!_notes.length) h += '<div class="sims-notes-empty"><i class="fa-regular fa-bell-slash"></i><p>' + (g.online ? '遊戲裡還沒跳過通知' : '遊戲沒開') + '</p></div>';
        else {
            const known = {};
            (g.sims || []).forEach(function (s) { known[String(s.id)] = s.name; });
            h += '<ul class="sims-notes-list">' + _notes.map(function (n) {
                const who = (n.sims || []).filter(function (x) { return x && known[String(x.id)] != null; });
                const btns = who.length
                    ? who.map(function (x) { return '<button type="button" class="sims-note-btn" data-sims-act="use" data-note="' + _esc(n.id) + '" data-sim="' + _esc(x.id) + '">讓' + _esc(known[String(x.id)] || x.name) + '傳訊息來</button>'; }).join('')
                    : '<span class="sims-note-none">通知裡的人不在聯絡人裡</span>';
                return '<li class="sims-note' + (n.used ? ' is-used' : '') + '"><p>' + _esc(n.text) + '</p>'
                    + '<div class="sims-note-foot"><small>' + _esc(n.ago || '') + (n.used ? '・聊過了' : '') + '</small><div class="sims-note-btns">' + btns + '</div></div></li>';
            }).join('') + '</ul>';
        }
        root.innerHTML = h;
    }
    async function _openNotes(container) {
        const root = document.createElement('div');
        root.className = 'sims-notes';
        container.appendChild(root);
        root.innerHTML = '<div class="sims-notes-empty"><i class="fa-solid fa-spinner fa-spin"></i></div>';
        root.addEventListener('click', function (e) {
            const b = e.target.closest('[data-sims-act]');
            if (!b) return;
            if (b.dataset.simsAct === 'home') { try { win.VoidPhoneShell.home(); } catch (er) {} return; }
            if (b.dataset.simsAct === 'use') useNote(b.dataset.note, b.dataset.sim);
        });
        await sync();
        await _syncNotes();
        _renderNotesInto(root);
    }
    // 讓那個人主動傳訊息來聊這件事：打開他的聊天室、這一輪帶上 noteId（只有她按才叫模型）
    async function useNote(noteId, simId) {
        const P = win.VoidPhoneShell, id = chatIdOf(simId);
        if (!P || !P.openApp) return;
        const before = win.wxApp && win.wxApp.APP_CONTAINER;
        P.openApp('wx');
        // 聊天 app 開起來要先讀存檔（每次打開都換一個新的畫面容器）：等新的那個畫好，聯絡人也建好，再開那一間
        let W = null;
        for (let i = 0; i < 60; i++) {
            W = win.wxApp;
            if (W && W.APP_CONTAINER && W.APP_CONTAINER !== before && W.APP_CONTAINER.querySelector('.wx-shell')) break;
            await new Promise(function (r) { setTimeout(r, 150); });
        }
        await sync();
        if (!W || !W.GLOBAL_CHATS[id]) { _toast('找不到這個人的聊天室'); return; }
        _pendingNote[String(simId)] = noteId;
        W.openChat(id);
        W.triggerReply();
    }

    // ── 開機：不掛大廳，直接是手機 ─────────────────────────────────
    // 桌面收成只剩聊天、最近發生的事、設置那幾個：用手機殼記住的「不在桌面上」（她之後可以從應用商城放回來）。
    //   🚨 不能用 removeApp：內建的 app 是程式裡寫死的，重開又會長回來。
    //   別的模組的 app 是開機後陸續裝上手機的，所以等一下再收；收一次就記住，之後她自己擺的不再動。
    function _layHome(P) {
        let laid = false;
        try { laid = localStorage.getItem(LAID_KEY) === '1'; } catch (e) {}
        if (laid || !P.appIds || !P.hideWidget) return;
        setTimeout(function () {
            P.appIds().forEach(function (id) { if (KEEP_APPS.indexOf(id) < 0) P.hideWidget(id); });
            try { localStorage.setItem(LAID_KEY, '1'); } catch (e) {}
        }, 2500);
    }
    function boot() {
        if (!ACTIVE) return;
        const P = win.VoidPhoneShell;
        if (!P || !P.open) { setTimeout(boot, 300); return; }
        document.documentElement.classList.add('aurelia-sims');
        if (P.addSystemApp) P.addSystemApp({ id: 'sims_notes', name: '最近發生的事', icon: 'fa-bell', go: _openNotes });
        _layHome(P);
        // 小窗本身就是手機：手機殼收起來那支自己認 OS_SIMS.active，改成回主畫面（phone_shell.js 的 close）
        P.open();
        if (P.openApp) P.openApp('wx');
        sync();
        _timer = setInterval(function () { if (!document.hidden) sync(); }, POLL_MS);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
    }

    const api = {
        active: ACTIVE,
        isSimsChat: isSimsChat,
        chatIdOf: chatIdOf,
        meName: meName,
        state: function () { return _state; },
        sync: sync,
        contextFor: contextFor,
        afterReply: afterReply,
        decorate: decorate,
        useNote: useNote,
        boot: boot
    };
    win.OS_SIMS = api;
    window.OS_SIMS = api;
    if (ACTIVE) console.log('✅ OS_SIMS 模擬市民模式啟動（?sims=1）');
})();
