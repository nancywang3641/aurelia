// ----------------------------------------------------------------
// [檔案] os_studio_worldbook.js — 創作室 🌍 世界書設計師（2026-07-16 自 os_studio.js 拆出）
// 職責：建/複製/編輯酒館 lorebook；5 換頁 UI（選書→瀏覽條目→條目詳情→AI討論→確認改動）；
//       跟主/副模型聊規則 → AI 吐 <wb> ops → 真 diff 累積 merge → 用戶確認後才寫入酒館。
// 依賴：window.OS_STUDIO._b 橋（_sgcEsc/renderMarkdown/_studioBadReply/_wbTH/_wbToast）；
//       載入順序必須在 os_studio.js 之後（index.js PHONE_FILES）。入口＝win.OS_STUDIO_WB.renderWorldbookPanel()。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const ST = win.OS_STUDIO;
    if (!ST || !ST._b) { console.warn('[StudioWB] OS_STUDIO 橋不存在，世界書設計師停用'); return; }
    const _b = ST._b;
    // 核心共用工具（過橋取用；_wbTH/_wbToast 留核心因「我的角色」_mc 區塊也在用）
    const _sgcEsc = _b._sgcEsc;
    const renderMarkdown = _b.renderMarkdown;
    const _studioBadReply = _b._studioBadReply;
    const _wbTH = _b._wbTH;
    const _wbToast = _b._wbToast;

    // ══════════════════════════════════════════════════════════════
    // 🌍 世界書 tab：建/複製/編輯酒館 lorebook，跟副模型聊規則→AI 改/加條目，套用前 diff 預覽。
    //   複製模式做成 [VN副本]-名、只動副本→原檔不碰(二改別人卡安全)。走酒館助手 lorebook API。
    //   UI＝5 換頁(選書→瀏覽條目→條目詳情→AI討論→確認改動)，任何時刻只顯示一頁；吃創作室 --jrpg-* 暖色變數。
    //   spec: docs/superpowers/specs/2026-06-22-studio-worldbook-redesign-design.md（前身 2026-06-21-studio-worldbook-tab）
    // ══════════════════════════════════════════════════════════════
    let _wbWorking = null;   // 工作世界書名(null=在選擇層)
    let _wbView = 'picker';  // picker|entries|detail|chat|confirm（5 換頁，任何時刻只顯示一頁）
    let _wbChat = [];        // [{role,content}]
    let _wbLastError = null; // 上次 AI 呼叫的錯誤（畫在聊天尾巴的錯誤泡泡＋重試鈕；null=沒錯誤）
    let _wbEntries = [];     // 目前條目快取
    let _wbPending = null;   // 待套用 ops（跨輪累積的 diff；每輪 AI 只吐新改動、程式自己 merge）
    let _wbTempUid = -1;     // 待新增條目的臨時 uid（負數，跟酒館真 uid≥0 不撞）→ 讓「還沒寫入的新條目」也能被再次改/刪
    let _wbEntryEditing = null; // 條目詳情頁：null=新增，否則=正在編的 uid
    let _wbSearch = '';      // 條目搜尋字
    let _wbFilter = 'all';   // all|on|off 篩選
    let _wbConfirmIdx = null; // 確認頁第二層：null=改動總覽，數字=看第 N 項完整內容
    let _wbModel = localStorage.getItem('swb_model') === 'sec' ? 'sec' : 'main';   // 世界書二改用主/副模型（預設主：低頻重品質）
    const _WB_SYS = `你是世界書編輯助手。下面會給你目前世界書的條目清單，使用者跟你討論要怎麼改或新增條目（可能含成人/NSFW 規則設定，照常專業協助、不要拒絕、不要說教）。\n- 改/新增務必跟下面給的現有條目一致、尤其標【常駐基石】的不可矛盾，不要虛構出跟作者既定設定衝突的內容；資訊不足寧可先問使用者、別硬編。\n- 先用一兩句白話回覆討論。\n- 要實際改動世界書時，把每個改動用 <wb> 區塊輸出（沒要改的條目一律別碰、別重列）：\n  新增：<wb op="add"><comment>標題</comment><keys>關鍵字1,關鍵字2</keys><content>條目內容</content></wb>\n  修改：<wb op="update" uid="條目編號"><comment>…</comment><keys>…</keys><content>…</content></wb>（只放要改的欄位，沒放的保留原值）\n  刪除：<wb op="del" uid="條目編號"/>\n- ★【新增 vs 修改 — 最重要，常出錯】使用者要「新增／另外／再寫一個／分開／獨立成一條」新設定 → 一律用 op="add" 開「全新條目」；【絕對禁止】把新設定塞進、或拿去覆蓋任何現有條目。只有使用者「明確指名要改某一條既有條目」(例如說『把第N條／某標題那條』的內容改成…) 時才用 op="update" 並帶『那條』的 uid。判斷不確定一律 add，寧可多開一條，也不要蓋掉舊的。一次想加好幾條就輸出好幾個 op="add" 區塊。\n- keys 用逗號分隔；常駐條目可留空 keys。只輸出 <wb> 區塊與你的對話，不要解釋格式本身。`;

    // ── 換頁路由：依 _wbView 分派到 5 頁，返回鈕各自硬接上一層 ──
    function renderWorldbookPanel() {
        const host = document.getElementById('studio-worldbook-content');
        if (!host) return;
        if (host.classList) host.classList.add('swb-host');
        if (!_wbWorking && _wbView !== 'picker') _wbView = 'picker';   // 沒選書卻殘留子頁(切走又回來)→退回選書頁
        if (_wbView === 'entries') return _wbRenderEntries(host);
        if (_wbView === 'detail')  return _wbRenderDetail(host);
        if (_wbView === 'chat')    return _wbRenderChat(host);
        if (_wbView === 'confirm') return _wbRenderConfirm(host);
        return _wbRenderPicker(host);
    }
    function _wbEnter(name) {   // 進入某本書 → 條目瀏覽頁
        _wbWorking = name; _wbChat = []; _wbPending = null; _wbTempUid = -1; _wbEntries = []; _wbLastError = null;
        _wbSearch = ''; _wbFilter = 'all'; _wbView = 'entries';
        renderWorldbookPanel();
    }
    // 通用底部動作面板（取代「一張卡塞滿按鈕」；三點選單／副本-or-直接 都走這個）
    function _wbSheet(title, actions) {
        const host = document.getElementById('studio-worldbook-content');
        if (!host) return;
        const ov = document.createElement('div');
        ov.className = 'swb-sheet-ov';
        ov.innerHTML = `<div class="swb-sheet"><div class="swb-sheet-title">${_sgcEsc(title)}</div>`
            + actions.map((a, i) => `<button class="swb-sheet-btn ${a.cls || ''}" data-i="${i}">${a.label}</button>`).join('')
            + `<button class="swb-sheet-btn cancel" data-cancel>取消</button></div>`;
        host.appendChild(ov);
        const close = () => ov.remove();
        ov.addEventListener('click', (e) => { if (e.target === ov || e.target.hasAttribute('data-cancel')) close(); });
        ov.querySelectorAll('[data-i]').forEach(btn => btn.onclick = () => { close(); const a = actions[parseInt(btn.getAttribute('data-i'), 10)]; a && a.onClick && a.onClick(); });
    }
    function _wbBookMenu(name) {   // 點書卡＝唯一路口，統一選單（複製/編輯/刪除）
        const isCopy = String(name).startsWith('[VN副本]');
        const acts = [];
        if (!isCopy) acts.push({ label: '<i class="fa-solid fa-copy"></i> 建立安全副本後編輯', cls: 'safe', onClick: () => _wbCopyBook(name) });
        acts.push({ label: isCopy ? '<i class="fa-solid fa-pen"></i> 編輯這份副本' : '<i class="fa-solid fa-pen"></i> 直接改原檔', cls: isCopy ? '' : 'danger', onClick: () => { if (isCopy || confirm(`⚠️ 直接改原檔「${name}」？確定？`)) _wbEnter(name); } });
        acts.push({ label: '<i class="fa-solid fa-trash"></i> 刪除世界書', cls: 'danger', onClick: () => _wbDeleteBook(name) });
        _wbSheet(`「${name}」`, acts);
    }
    async function _wbDeleteBook(name) {
        if (!confirm(`⚠️ 刪除世界書「${name}」？此動作無法復原。`)) return;
        const TH = _wbTH();
        if (!TH || !TH.deleteLorebook) { alert('酒館助手未就緒'); return; }
        try { await TH.deleteLorebook(name); _wbToast('已刪除「' + name + '」'); renderWorldbookPanel(); }
        catch (e) { alert('刪除失敗：' + (e && e.message || e)); }
    }
    // ① 選世界書（乾淨瀏覽：書名＋條目數＋›＋⋮）
    async function _wbRenderPicker(host) {
        const TH = _wbTH();
        let books = [];
        try { books = (TH && TH.getLorebooks && TH.getLorebooks()) || []; } catch (e) {}
        host.innerHTML = `<div class="swb-page">
            <div class="swb-phead"><div class="swb-ptitle">整理世界書</div><div class="swb-psub">挑一本世界書，AI 幫你改規則、加條目。二改別人的卡建議用「複製」，原檔不會被動到。</div></div>
            <button class="swb-primary swb-block" id="swb-new-toggle"><i class="fa-solid fa-plus"></i> 新增世界書</button>
            <div class="swb-newrow" id="swb-newrow" hidden><input id="swb-new-name" class="swb-field" placeholder="新世界書名稱…"><button class="swb-primary swb-sm" id="swb-new-go">建立</button></div>
            <div class="swb-list" id="swb-list"></div>
        </div>`;
        const toggle = host.querySelector('#swb-new-toggle');
        const newrow = host.querySelector('#swb-newrow');
        toggle.onclick = () => { newrow.hidden = !newrow.hidden; if (!newrow.hidden) { const i = host.querySelector('#swb-new-name'); i && i.focus(); } };
        host.querySelector('#swb-new-go').onclick = () => _wbCreateNew(host.querySelector('#swb-new-name').value);
        const listEl = host.querySelector('#swb-list');
        if (!books.length) { listEl.innerHTML = `<div class="swb-empty"><div class="swb-empty-art"><i class="fa-solid fa-globe"></i></div><div>酒館裡還沒有世界書<br>按上面「新增世界書」開一本吧</div></div>`; return; }
        const _isCopy = (b) => String(b).startsWith('[VN副本]');
        const _bookCard = (b, i) => `<div class="swb-card swb-bookcard${_isCopy(b) ? ' swb-copycard' : ''}" data-book="${_sgcEsc(b)}">
            <div class="swb-card-main"><div class="swb-card-title">${_sgcEsc(b)}</div><div class="swb-card-meta" data-cnt="${i}">… 條目</div></div>
            <span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span>
        </div>`;
        const _copies = [], _origs = [];
        books.forEach((b, i) => (_isCopy(b) ? _copies : _origs).push(_bookCard(b, i)));   // 副本(我複製的)跟酒館原檔分區，免選錯
        listEl.innerHTML = (_copies.length
            ? '<div class="swb-seclabel"><i class="fa-solid fa-copy"></i> 我的副本（改這些，原檔不動）</div>' + _copies.join('')
              + '<div class="swb-seclabel swb-seclabel-div"><i class="fa-solid fa-landmark"></i> 酒館世界書</div>'
            : '') + _origs.join('');
        listEl.querySelectorAll('.swb-bookcard').forEach(card => card.onclick = () => _wbBookMenu(card.getAttribute('data-book')));
        books.forEach(async (b, i) => {   // 條目數逐本補（getLorebooks 不給數量）
            let txt = '—';
            try { txt = ((await TH.getLorebookEntries(b)) || []).length + ' 條目'; } catch (e) {}
            const el = listEl.querySelector(`[data-cnt="${i}"]`); if (el) el.textContent = txt;
        });
    }
    async function _wbCreateNew(name) {
        name = String(name || '').trim();
        if (!name) { alert('先輸入世界書名稱'); return; }
        const TH = _wbTH();
        if (!TH || !TH.createLorebook) { alert('酒館助手未就緒'); return; }
        try {
            const ok = await TH.createLorebook(name);
            if (ok === false) { if (!confirm(`「${name}」可能已存在，要直接打開它編輯嗎？`)) return; }
            _wbEnter(name);
        } catch (e) { alert('建立失敗：' + (e && e.message || e)); }
    }
    async function _wbCopyBook(src) {
        const TH = _wbTH();
        if (!TH || !TH.createLorebook) { alert('酒館助手未就緒'); return; }
        const copyName = `[VN副本]-${src}`;
        try {
            const created = await TH.createLorebook(copyName);
            if (created !== false) {
                const entries = (await TH.getLorebookEntries(src)) || [];
                if (entries.length) {
                    const clones = entries.map(e => { const c = { ...e }; delete c.uid; delete c.display_index; return c; });
                    await TH.createLorebookEntries(copyName, clones);
                }
                alert(`✅ 已複製成「${copyName}」（${entries.length} 條），改它不會動到原檔。`);
            } else {
                if (!confirm(`「${copyName}」已存在，直接打開上次那份副本繼續編輯嗎？`)) return;
            }
            _wbEnter(copyName);
        } catch (e) { alert('複製失敗：' + (e && e.message || e)); }
    }
    // ② 瀏覽條目（搜尋＋篩選＋條目卡；底部 AI整理／新增條目）
    async function _wbRenderEntries(host) {
        const TH = _wbTH();
        try { _wbEntries = (await TH.getLorebookEntries(_wbWorking)) || []; } catch (e) { _wbEntries = []; }
        const isCopy = String(_wbWorking).startsWith('[VN副本]');
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar">
                <button class="swb-iconbtn" id="swb-back"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title" title="${_sgcEsc(_wbWorking)}">${_sgcEsc(_wbWorking)}</div>
                ${isCopy ? '<span class="swb-chip safe">副本·原檔安全</span>' : '<span class="swb-chip warn">直接改原檔</span>'}
            </div>
            <div class="swb-tools">
                <input id="swb-search" class="swb-field" placeholder="搜尋條目…" value="${_sgcEsc(_wbSearch)}">
                <div class="swb-seg" id="swb-filter">
                    <button class="swb-seg-btn${_wbFilter === 'all' ? ' on' : ''}" data-f="all">全部</button>
                    <button class="swb-seg-btn${_wbFilter === 'on' ? ' on' : ''}" data-f="on">已啟用</button>
                    <button class="swb-seg-btn${_wbFilter === 'off' ? ' on' : ''}" data-f="off">已停用</button>
                </div>
            </div>
            <div class="swb-list" id="swb-entry-list"></div>
            <div class="swb-footbar">
                <button class="swb-primary" id="swb-ai"><i class="fa-solid fa-robot"></i> 請 AI 幫我整理</button>
                <button class="swb-secondary" id="swb-add"><i class="fa-solid fa-plus"></i> 新增條目</button>
            </div>
        </div>`;
        host.querySelector('#swb-back').onclick = () => { _wbWorking = null; _wbView = 'picker'; renderWorldbookPanel(); };
        host.querySelector('#swb-ai').onclick = () => { _wbView = 'chat'; renderWorldbookPanel(); };
        host.querySelector('#swb-add').onclick = () => { _wbEntryEditing = null; _wbView = 'detail'; renderWorldbookPanel(); };
        const search = host.querySelector('#swb-search');
        search.oninput = () => { _wbSearch = search.value; _wbPaintEntryList(host); };
        host.querySelectorAll('#swb-filter .swb-seg-btn').forEach(b => b.onclick = () => {
            _wbFilter = b.getAttribute('data-f');
            host.querySelectorAll('#swb-filter .swb-seg-btn').forEach(x => x.classList.toggle('on', x.getAttribute('data-f') === _wbFilter));
            _wbPaintEntryList(host);
        });
        _wbPaintEntryList(host);
    }
    function _wbPaintEntryList(host) {
        const el = host.querySelector('#swb-entry-list'); if (!el) return;
        if (!_wbEntries.length) { el.innerHTML = `<div class="swb-empty"><div class="swb-empty-art"><i class="fa-solid fa-book"></i></div><div>這本世界書還沒有條目<br>用下面「新增條目」或「請 AI 幫我整理」開始</div></div>`; return; }
        const q = _wbSearch.trim().toLowerCase();
        const list = _wbEntries.filter(e => {
            if (_wbFilter === 'on' && !e.enabled) return false;
            if (_wbFilter === 'off' && e.enabled) return false;
            if (q) { const hay = (String(e.comment || '') + ' ' + (e.keys || []).join(' ') + ' ' + String(e.content || '')).toLowerCase(); if (!hay.includes(q)) return false; }
            return true;
        });
        if (!list.length) { el.innerHTML = '<div class="swb-empty">沒有符合的條目</div>'; return; }
        el.innerHTML = list.map(e => {
            const keys = (e.keys || []).filter(Boolean);
            const tags = keys.length ? keys.map(k => `<span class="swb-tag">${_sgcEsc(k)}</span>`).join('') : '<span class="swb-tag muted">常駐</span>';
            const sum = _sgcEsc(String(e.content || '').replace(/\s+/g, ' ').trim().slice(0, 80)) || '（無內容）';
            return `<div class="swb-card swb-entrycard" data-uid="${e.uid}">
                <div class="swb-card-main">
                    <div class="swb-card-title">${_sgcEsc(e.comment || '(無標題)')}</div>
                    <div class="swb-card-sum">${sum}</div>
                    <div class="swb-tags">${tags}</div>
                </div>
                <label class="sgc-switch swb-card-tog" title="啟用／停用"><input type="checkbox" class="sgc-switch-input" data-en="${e.uid}"${e.enabled ? ' checked' : ''}><span class="sgc-switch-slider"></span></label>
                <span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span>
            </div>`;
        }).join('');
        el.querySelectorAll('.swb-entrycard').forEach(card => card.onclick = (ev) => {
            if (ev.target.closest('.swb-card-tog')) return;
            _wbEntryEditing = parseInt(card.getAttribute('data-uid'), 10); _wbView = 'detail'; renderWorldbookPanel();
        });
        el.querySelectorAll('[data-en]').forEach(cb => cb.onchange = async (ev) => {
            ev.stopPropagation();
            const uid = parseInt(cb.getAttribute('data-en'), 10);
            try { await _wbTH().setLorebookEntries(_wbWorking, [{ uid, enabled: cb.checked }]); const e = _wbEntries.find(x => x.uid === uid); if (e) e.enabled = cb.checked; }
            catch (err) { alert('改啟用失敗：' + (err && err.message || err)); cb.checked = !cb.checked; }
        });
    }
    // ③ 條目詳情／編輯（手動完整編輯；新增也走這頁）
    function _wbRenderDetail(host) {
        const isNew = _wbEntryEditing == null;
        const e = isNew ? { comment: '', keys: [], content: '', enabled: true }
                        : (_wbEntries.find(x => x.uid === _wbEntryEditing) || { comment: '', keys: [], content: '', enabled: true });
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar">
                <button class="swb-iconbtn" id="swb-back"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title">${isNew ? '新增條目' : '編輯條目'}</div>
            </div>
            <div class="swb-form">
                <label class="swb-flabel">標題</label>
                <input id="swb-f-title" class="swb-field" value="${_sgcEsc(e.comment || '')}" placeholder="這條規則叫什麼…">
                <label class="swb-flabel">關鍵字</label>
                <input id="swb-f-keys" class="swb-field" value="${_sgcEsc((e.keys || []).join('、'))}" placeholder="用、分隔；留空＝一直生效">
                <div class="swb-fhint">提到這些字時 AI 才會讀這條；留空＝常駐、永遠生效。</div>
                <label class="swb-flabel">內容</label>
                <textarea id="swb-f-content" class="swb-field swb-ftext" placeholder="這條世界書要寫的設定／規則…">${_sgcEsc(e.content || '')}</textarea>
                <label class="swb-frow"><span>啟用這條</span><span class="sgc-switch"><input type="checkbox" id="swb-f-en" class="sgc-switch-input"${e.enabled ? ' checked' : ''}><span class="sgc-switch-slider"></span></span></label>
                ${isNew ? '' : '<button class="swb-textdanger" id="swb-del"><i class="fa-solid fa-trash"></i> 刪除這條</button>'}
            </div>
            <div class="swb-footbar">
                <button class="swb-primary swb-block" id="swb-save">${isNew ? '建立條目' : '儲存'}</button>
            </div>
        </div>`;
        host.querySelector('#swb-back').onclick = () => { _wbView = 'entries'; renderWorldbookPanel(); };
        host.querySelector('#swb-save').onclick = () => _wbSaveDetail(host, isNew);
        const del = host.querySelector('#swb-del'); if (del) del.onclick = () => _wbDeleteEntry();
    }
    async function _wbSaveDetail(host, isNew) {
        const TH = _wbTH();
        if (!TH) { alert('酒館助手未就緒'); return; }
        const comment = host.querySelector('#swb-f-title').value.trim();
        const keys = host.querySelector('#swb-f-keys').value.split(/[,，、\n]/).map(s => s.trim()).filter(Boolean);
        const content = host.querySelector('#swb-f-content').value;
        const enabled = host.querySelector('#swb-f-en').checked;
        const type = keys.length ? 'selective' : 'constant';   // 有關鍵字＝綠燈觸發、留空＝藍燈常駐(讓「留空＝一直生效」成真，免手動切換)
        const btn = host.querySelector('#swb-save'); if (btn) { btn.disabled = true; btn.textContent = '儲存中…'; }
        try {
            if (isNew) await TH.createLorebookEntries(_wbWorking, [{ comment, keys, content, enabled, type }]);
            else await TH.setLorebookEntries(_wbWorking, [{ uid: _wbEntryEditing, comment, keys, content, enabled, type }]);
            _wbToast(isNew ? '已新增條目 ✓' : '已儲存 ✓');
            _wbView = 'entries'; renderWorldbookPanel();
        } catch (e) { if (btn) { btn.disabled = false; btn.textContent = isNew ? '建立條目' : '儲存'; } alert('儲存失敗：' + (e && e.message || e)); }
    }
    async function _wbDeleteEntry() {
        if (_wbEntryEditing == null) return;
        const e = _wbEntries.find(x => x.uid === _wbEntryEditing);
        if (!confirm(`刪除條目「${e ? (e.comment || '(無標題)') : ''}」？`)) return;
        try { await _wbTH().deleteLorebookEntries(_wbWorking, [_wbEntryEditing]); _wbToast('已刪除條目'); _wbView = 'entries'; renderWorldbookPanel(); }
        catch (err) { alert('刪除失敗：' + (err && err.message || err)); }
    }
    // ④ 和 AI 討論（只剩對話＋輸入；模型切換收進右上⚙️；有建議冒「查看 N 項」）
    function _wbRenderChat(host) {
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar">
                <button class="swb-iconbtn" id="swb-back"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title" title="${_sgcEsc(_wbWorking)}">${_sgcEsc(_wbWorking)}<span class="swb-bar-sub">${_wbEntries.length} 條目</span></div>
                <button class="swb-iconbtn" id="swb-adv" title="進階設定"><i class="fa-solid fa-gear"></i></button>
            </div>
            <div class="swb-chatlog" id="swb-chatlog"></div>
            <div class="swb-pendbar" id="swb-pendbar"></div>
            <div class="swb-inputrow">
                <textarea id="swb-msg" class="swb-field swb-msg" placeholder="跟 AI 說要怎麼改／加哪些條目（例：加一條關於○○規則的條目；把某條改得更詳細）…"></textarea>
                <button class="swb-primary swb-send" id="swb-send">送出</button>
            </div>
        </div>`;
        host.querySelector('#swb-back').onclick = () => { _wbView = 'entries'; renderWorldbookPanel(); };
        host.querySelector('#swb-adv').onclick = () => _wbAdvSheet();
        host.querySelector('#swb-send').onclick = () => _wbSend(host);
        _wbPaintChat(host); _wbPaintPendBar(host);
    }
    // 泡泡只顯示白話：把給程式解析的 <wb> 機器標記濾掉（原文留在 _wbChat 當 AI 上下文，結構化內容只在確認頁顯示）
    function _wbStripOps(text) {
        return String(text || '')
            .replace(/<wb\b[^>]*\/>/gi, '')              // 自閉合(刪除)
            .replace(/<wb\b[^>]*>[\s\S]*?<\/wb>/gi, '')  // 區塊
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
    function _wbPaintChat(host) {
        const el = host.querySelector('#swb-chatlog'); if (!el) return;
        if (!_wbChat.length && !_wbLastError) { el.innerHTML = `<div class="swb-empty"><div class="swb-empty-art"><i class="fa-solid fa-comment-dots"></i></div><div>跟 AI 說你想怎麼整理這本世界書<br>它幫你改／加條目，你確認後才寫入</div></div>`; return; }
        let html = _wbChat.map(m => {
            let body = m.content;
            if (m.role === 'assistant') { body = _wbStripOps(m.content); if (!body) body = '✏️ 我擬好了改動，點下方「查看建議」確認。'; }
            return `<div class="swb-bubble swb-${m.role}">${renderMarkdown(body)}</div>`;
        }).join('');
        // 錯誤泡泡＋重試（API錯誤頁/空回應/截斷都會落在這，不會再被當正常回覆收進對話）
        if (_wbLastError) html += `<div class="swb-bubble swb-assistant studio-error-bubble"><div class="studio-error-msg">❌ 錯誤：${String(_wbLastError).replace(/</g, '&lt;').slice(0, 200)}</div><button class="studio-retry-btn">🔄 重試</button></div>`;
        el.innerHTML = html;
        const rb = el.querySelector('.studio-retry-btn');
        if (rb) rb.onclick = () => { _wbLastError = null; _wbPaintChat(host); _wbCall(host); };
        el.scrollTop = el.scrollHeight;
    }
    function _wbPaintPendBar(host) {
        const el = host.querySelector('#swb-pendbar'); if (!el) return;
        if (!_wbPending || !_wbPending.length) { el.innerHTML = ''; return; }
        el.innerHTML = `<button class="swb-pendbtn" id="swb-viewpend">查看 ${_wbPending.length} 項建議 <i class="fa-solid fa-chevron-right"></i></button>`;
        const b = host.querySelector('#swb-viewpend'); if (b) b.onclick = () => { _wbConfirmIdx = null; _wbView = 'confirm'; renderWorldbookPanel(); };
    }
    function _wbAdvSheet() {
        _wbSheet('進階設定 · AI 用哪個模型寫', [
            { label: '主模型寫（品質好，預設）' + (_wbModel === 'main' ? ' <i class="fa-solid fa-check"></i>' : ''), cls: _wbModel === 'main' ? 'safe' : '', onClick: () => { _wbModel = 'main'; localStorage.setItem('swb_model', 'main'); } },
            { label: '副模型寫（快、省）' + (_wbModel === 'sec' ? ' <i class="fa-solid fa-check"></i>' : ''), cls: _wbModel === 'sec' ? 'safe' : '', onClick: () => { _wbModel = 'sec'; localStorage.setItem('swb_model', 'sec'); } },
        ]);
    }
    function _wbEntriesForPrompt() {
        // 停用(🔴)的不送(用戶關掉就別餵)；藍燈綠燈全送、內容不截斷——AI 看得到作者完整設定才不會亂編造跟基石矛盾。
        return _wbEntries
            .filter(e => e.enabled !== false)
            .map(e => {
                const tag = e.type === 'constant' ? '常駐基石·務必遵守不可矛盾' : (e.type === 'vectorized' ? '向量' : '關鍵字觸發');
                return `#${e.uid}｜[${tag}]｜標題：${e.comment || '(無)'}｜關鍵字：${(e.keys || []).join(',') || '（無）'}｜內容：${String(e.content || '')}`;
            }).join('\n\n');
    }
    // 把目前「尚未套用的待改動」(_wbPending) 序列化餵回 AI，讓它整套保留重輸出，避免下一輪只回新 op→把上一輪的刪除/新增覆蓋掉
    function _wbPendingForPrompt() {
        if (!_wbPending || !_wbPending.length) return '';
        return _wbPending.map(o => {
            if (o.op === 'del') return '【刪除真條目】uid=' + o.uid;
            const head = o.op === 'add' ? ('【新增·待寫入】uid=' + o.uid + '(負數=尚未寫入)') : ('【修改真條目】uid=' + o.uid);
            const parts = [];
            if (o.comment != null) parts.push('標題：' + o.comment);
            if (o.keys && o.keys.length) parts.push('關鍵字：' + o.keys.join(','));
            if (o.content != null) parts.push('內容：' + o.content);
            return head + (parts.length ? ' ' + parts.join('｜') : '');
        }).join('\n');
    }
    async function _wbSend(host) {
        const ta = host.querySelector('#swb-msg'); const msg = (ta.value || '').trim();
        if (!msg) return;
        const api = (window.parent || window).OS_API || window.OS_API;
        if (!api || (typeof api.chatSecondary !== 'function' && typeof api.chatMain !== 'function')) { alert('AI 不可用，請先到「寫作 → API 設置」設好模型'); return; }
        _wbChat.push({ role: 'user', content: msg }); ta.value = '';
        _wbLastError = null;
        _wbPaintChat(host);
        _wbCall(host);
    }
    // 真正發 API——_wbSend 與錯誤泡泡「重試」共用（用當前 _wbChat 重打、不重複塞 user 訊息）
    function _wbCall(host) {
        const api = (window.parent || window).OS_API || window.OS_API;
        if (!api) return;
        const sendBtn = host.querySelector('#swb-send'); if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '生成中…'; }
        let _wbSysFull = _WB_SYS + '\n\n【目前條目】\n' + (_wbEntriesForPrompt() || '（空，還沒有條目）');
        const _pend = _wbPendingForPrompt();
        if (_pend) _wbSysFull += '\n\n【尚未套用的待改動（系統已自動累積保留，你「不用」也「不要」重複輸出這些）】\n' + _pend + '\n→ 你這輪「只輸出這次使用者要動的那一項 <wb>」即可（真 diff），系統會自動把它併進上面的待改動、沒提到的一個都不會弄丟、也絕不碰沒提到的條目。要「改某項待改動本身」就用它的 uid 下 op="update"／要撤銷就 op="del"（待新增條目的 uid 是負數，照樣能改/刪）。';
        const messages = [{ role: 'system', content: _wbSysFull }].concat(_wbChat.slice(-8));
        const done = (full) => {
            if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '送出'; }
            const reply = String(full || '');
            // 驗貨（同主聊天室 7d2b629）：錯誤頁/空回應/截斷別當正常回覆收進對話 → 轉錯誤泡泡給重試
            const _bad = _studioBadReply(reply);
            if (_bad.bad) { _wbLastError = _bad.reason; _wbPaintChat(host); return; }
            _wbLastError = null;
            _wbChat.push({ role: 'assistant', content: reply });
            // 真 diff：AI 只吐這輪的改動 → merge 進已累積的待改動（不替換、不丟、沒提到的不碰）
            _wbPending = _wbMergeOps(_wbPending, _wbParseOps(reply));
            if (!_wbPending || !_wbPending.length) _wbPending = null;
            _wbPaintChat(host); _wbPaintPendBar(host);
        };
        const errCb = (err) => { if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '送出'; } _wbLastError = (err && err.message) || String(err || '未知錯誤'); _wbPaintChat(host); };
        // 主模型＝chatMain（品質好、世界書二改首選）；副模型＝chatSecondary。選的入口若不存在則退另一個。
        const useMain = _wbModel === 'main' && typeof api.chatMain === 'function';
        const callFn = useMain ? api.chatMain : (typeof api.chatSecondary === 'function' ? api.chatSecondary : api.chatMain);
        try { callFn.call(api, messages, () => {}, done, errCb, { stream: true }); }   // 長輸出開串流防閘道504
        catch (e) { errCb(e); }
    }
    function _wbParseOps(text) {
        const ops = []; const re = /<wb\s+op="(add|update|del)"(?:\s+uid="(-?\d+)")?\s*(?:\/>|>([\s\S]*?)<\/wb>)/gi; let m;   // uid 容許負數＝待新增條目的臨時 uid
        while ((m = re.exec(text)) !== null) {
            const op = m[1].toLowerCase(); const uid = m[2] ? parseInt(m[2], 10) : null; const inner = m[3] || '';
            if (op === 'del') { if (uid != null) ops.push({ op: 'del', uid }); continue; }
            const pick = (tag) => { const mm = inner.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>', 'i')); return mm ? mm[1].trim() : null; };
            const keysRaw = pick('keys');
            ops.push({ op, uid, comment: pick('comment'), keys: keysRaw != null ? keysRaw.split(/[,，、]/).map(s => s.trim()).filter(Boolean) : null, content: pick('content') });
        }
        return ops;
    }
    // 真 diff 累積：把 AI 這輪吐的 ops 併進「已累積的待改動」。沒提到的待改動原封不動、絕不碰沒提到的條目。
    //   - add：給臨時負 uid，登記為待新增（之後可被 update/del 用該 uid 再動）。
    //   - update uid=X：X 命中既有待新增/待修改 → 把欄位併進它（改的是「待改動」本身）；否則登記為對真條目 X 的待修改。
    //   - del uid=X：X 命中待新增 → 直接撤掉那筆待新增；命中待修改 → 取消修改；否則登記為對真條目 X 的待刪除。
    function _wbMergeOps(existing, incoming) {
        const out = (existing || []).slice();
        const idx = (uid) => out.findIndex(x => x.uid === uid);
        for (const op of (incoming || [])) {
            if (op.op === 'add') {
                // 防呆：AI 若沒用 uid、又重吐同標題的待新增 → 當「改那筆」而非開重複
                const j = out.findIndex(x => x.op === 'add' && x.comment && op.comment && x.comment === op.comment);
                if (j >= 0) { if (op.keys != null) out[j].keys = op.keys; if (op.content != null) out[j].content = op.content; }
                else out.push({ op: 'add', uid: _wbTempUid--, comment: op.comment, keys: op.keys, content: op.content });
            } else if (op.op === 'del') {
                if (op.uid == null) continue;
                const i = idx(op.uid);
                if (i >= 0 && out[i].op === 'add') { out.splice(i, 1); continue; }        // 撤銷一筆還沒寫入的待新增
                if (i >= 0 && out[i].op === 'update') out.splice(i, 1);                    // 取消對該真條目的待修改
                if (!out.some(x => x.op === 'del' && x.uid === op.uid)) out.push({ op: 'del', uid: op.uid });
            } else if (op.op === 'update') {
                if (op.uid == null) continue;
                const i = idx(op.uid);
                if (i >= 0 && (out[i].op === 'add' || out[i].op === 'update')) {
                    if (op.comment != null) out[i].comment = op.comment;
                    if (op.keys != null) out[i].keys = op.keys;
                    if (op.content != null) out[i].content = op.content;
                } else {
                    out.push({ op: 'update', uid: op.uid, comment: op.comment, keys: op.keys, content: op.content });
                }
            }
        }
        return out;
    }
    // ⑤ 確認改動（兩層：總覽列每項摘要 → 點一項看完整內容；確認才寫。手機尺寸下長內容用換頁、不摺疊也不一地倒）
    const _wbOpClass = (op) => op === 'add' ? 'add' : op === 'del' ? 'del' : 'upd';
    const _wbOpLabel = (op) => op === 'add' ? '新增' : op === 'del' ? '刪除' : '修改';
    function _wbRenderConfirm(host) {
        const ops = _wbPending || [];
        if (_wbConfirmIdx != null && ops[_wbConfirmIdx]) return _wbRenderConfirmDetail(host, ops[_wbConfirmIdx]);
        _wbConfirmIdx = null;
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar">
                <button class="swb-iconbtn" id="swb-back"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title">確認改動<span class="swb-bar-sub">${ops.length} 項</span></div>
            </div>
            <div class="swb-list" id="swb-conflist"></div>
            <div class="swb-footbar">
                <button class="swb-secondary" id="swb-backedit"><i class="fa-solid fa-chevron-left"></i> 返回修改</button>
                <button class="swb-primary" id="swb-apply"><i class="fa-solid fa-check"></i> 套用 ${ops.length} 項</button>
            </div>
        </div>`;
        const listEl = host.querySelector('#swb-conflist');
        listEl.innerHTML = ops.map((o, i) => {
            const e = _wbEntries.find(x => x.uid === o.uid);
            const title = _sgcEsc((o.comment != null ? o.comment : (e && e.comment)) || '(無標題)');
            const src = o.op === 'del' ? (e ? e.content : '') : o.content;
            const preview = (src != null && src !== '') ? `<div class="swb-card-sum">${_sgcEsc(String(src).replace(/\s+/g, ' ').trim().slice(0, 70))}</div>` : '';
            return `<div class="swb-card swb-op ${_wbOpClass(o.op)}" data-i="${i}">
                <span class="swb-op-chip c-${_wbOpClass(o.op)}">${_wbOpLabel(o.op)}</span>
                <div class="swb-card-main"><div class="swb-card-title">${title}</div>${preview}</div>
                <span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span>
            </div>`;
        }).join('');
        listEl.querySelectorAll('[data-i]').forEach(card => card.onclick = () => { _wbConfirmIdx = parseInt(card.getAttribute('data-i'), 10); renderWorldbookPanel(); });
        host.querySelector('#swb-back').onclick = () => { _wbView = 'chat'; renderWorldbookPanel(); };
        host.querySelector('#swb-backedit').onclick = () => { _wbView = 'chat'; renderWorldbookPanel(); };
        host.querySelector('#swb-apply').onclick = () => _wbApply(host);
    }
    function _wbRenderConfirmDetail(host, o) {
        const e = _wbEntries.find(x => x.uid === o.uid);
        const title = _sgcEsc((o.comment != null ? o.comment : (e && e.comment)) || '(無標題)');
        const keysArr = (o.op === 'del' ? (e && e.keys) : (o.keys != null ? o.keys : (e && e.keys))) || [];
        const keys = keysArr.length ? keysArr.map(k => `<span class="swb-tag">${_sgcEsc(k)}</span>`).join('') : '<span class="swb-tag muted">常駐</span>';
        const content = o.op === 'del' ? (e ? e.content : '') : o.content;
        const note = o.op === 'del' ? '<div class="swb-fhint"><i class="fa-solid fa-triangle-exclamation"></i> 套用後這條會被刪除。下面是它目前的內容：</div>' : '';
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar">
                <button class="swb-iconbtn" id="swb-back"><i class="fa-solid fa-chevron-left"></i></button>
                <span class="swb-op-chip c-${_wbOpClass(o.op)}">${_wbOpLabel(o.op)}</span>
                <div class="swb-bar-title">${title}</div>
            </div>
            <div class="swb-form">
                ${note}
                <label class="swb-flabel">關鍵字</label>
                <div class="swb-tags">${keys}</div>
                <label class="swb-flabel">內容</label>
                <div class="swb-op-body">${(content != null && content !== '') ? _sgcEsc(String(content)) : '（無內容）'}</div>
            </div>
            <div class="swb-footbar">
                <button class="swb-primary swb-block" id="swb-back2"><i class="fa-solid fa-chevron-left"></i> 回改動清單</button>
            </div>
        </div>`;
        host.querySelector('#swb-back').onclick = () => { _wbConfirmIdx = null; renderWorldbookPanel(); };
        host.querySelector('#swb-back2').onclick = () => { _wbConfirmIdx = null; renderWorldbookPanel(); };
    }
    async function _wbApply(host) {
        const TH = _wbTH(); if (!TH || !_wbPending) return;
        const n = _wbPending.length;
        const adds = [], updates = [], dels = [];
        for (const o of _wbPending) {
            // 真 uid≥0 才送酒館；負數＝待新增的臨時 uid（merge 後只會出現在 op='add'，del/update 不該帶負 uid，防呆擋掉）
            if (o.op === 'del') { if (o.uid != null && o.uid >= 0) dels.push(o.uid); }
            else if (o.op === 'add') { const k = o.keys || []; adds.push({ comment: o.comment || '', keys: k, content: o.content || '', enabled: true, type: k.length ? 'selective' : 'constant' }); }
            else if (o.op === 'update' && o.uid != null && o.uid >= 0) { const u = { uid: o.uid }; if (o.comment != null) u.comment = o.comment; if (o.keys != null) u.keys = o.keys; if (o.content != null) u.content = o.content; updates.push(u); }
        }
        const btn = host.querySelector('#swb-apply'); if (btn) { btn.disabled = true; btn.textContent = '套用中…'; }
        try {
            if (adds.length) await TH.createLorebookEntries(_wbWorking, adds);
            if (updates.length) await TH.setLorebookEntries(_wbWorking, updates);
            if (dels.length) await TH.deleteLorebookEntries(_wbWorking, dels);
            _wbPending = null; _wbTempUid = -1;
            try { _wbEntries = (await TH.getLorebookEntries(_wbWorking)) || []; } catch (e) {}
            _wbToast('已套用 ' + n + ' 項 ✓');
            _wbView = 'chat'; renderWorldbookPanel();
        } catch (e) { if (btn) { btn.disabled = false; btn.textContent = '套用 ' + n + ' 項'; } alert('套用失敗：' + (e && e.message || e)); }
    }

    // ── 對外入口：核心 switchTopMode 懶解析呼叫 ──
    win.OS_STUDIO_WB = { renderWorldbookPanel };
})();
