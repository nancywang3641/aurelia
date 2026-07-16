// ----------------------------------------------------------------
// [檔案] os_studio_persona.js — 創作室 🧑 我的角色（人設寫作）（2026-07-16 自 os_studio.js 拆出）
// 職責：借世界書引擎存「我的角色」本（一角色一條、內含【區塊】分段）；
//       清單→編輯器(聊天/預覽兩面板)→寫入世界書；匯入酒館人設改寫、對標世界換皮；AI 吐 <persona><seg> → merge 區塊。
// 依賴：window.OS_STUDIO._b 橋（_sgcEsc/renderMarkdown/_studioBadReply/_wbTH/_wbToast/_studioConfirmRetry）；
//       載入順序必須在 os_studio.js 之後（index.js PHONE_FILES）。入口＝win.OS_STUDIO_MC.renderPersonaPanel()。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const ST = win.OS_STUDIO;
    if (!ST || !ST._b) { console.warn('[StudioMC] OS_STUDIO 橋不存在，我的角色停用'); return; }
    const _b = ST._b;
    // 核心共用工具（過橋取用；全是穩定函式引用，毋需 getter）
    const _sgcEsc = _b._sgcEsc;
    const renderMarkdown = _b.renderMarkdown;
    const _studioBadReply = _b._studioBadReply;
    const _wbTH = _b._wbTH;
    const _wbToast = _b._wbToast;
    const _studioConfirmRetry = _b._studioConfirmRetry;

    // ====== 🧑 我的角色（人設寫作）：借世界書引擎，存成「我的角色」本、一角色一條（內含分段）======
    const MC_BOOK = '我的角色';
    let _mcView = 'list';        // list | editor
    let _mcPane = 'chat';        // editor 內：chat | preview
    let _mcChars = [];           // 清單快取 [{uid,name,summary,enabled,content}]
    let _mcWorking = null;       // {uid|null, name, blocks:[{label,content,userEdited,aiNew,editing}]}
    let _mcChat = [];            // [{role,content}]
    let _mcLastError = null;     // 人設聊天的錯誤狀態（畫在聊天尾巴、帶重試鈕，同世界書聊天）
    let _mcPendCount = 0;        // 自上次開預覽以來 AI 動到的區塊數
    let _mcModel = localStorage.getItem('mc_model') === 'sec' ? 'sec' : 'main';
    let _mcImportPick = null;     // 匯入時選中的那個酒館人設

    // 純函式：<seg> 解析 / 區塊組裝成條目內容 / 反解析回區塊（組裝⇄反解析互為逆運算）
    function _mcParseSegs(text) {
        const out = [];
        const re = /<seg\s+label="([^"]*)"\s*>([\s\S]*?)<\/seg>/gi;
        let m;
        while ((m = re.exec(String(text || ''))) !== null) out.push({ label: (m[1] || '').trim(), content: (m[2] || '').trim() });
        return out;
    }
    function _mcAssembleContent(blocks) {
        return (blocks || []).map(b => '【' + b.label + '】\n' + (b.content || '').trim()).join('\n\n');
    }
    function _mcParseEntryContent(content) {
        const out = [];
        const re = /【([^】]+)】\n([\s\S]*?)(?=\n\n【|$)/g;
        let m;
        while ((m = re.exec(String(content || ''))) !== null) out.push({ label: (m[1] || '').trim(), content: (m[2] || '').trim() });
        return out;
    }

    function renderPersonaPanel() {
        const host = document.getElementById('studio-persona-content');
        if (!host) return;
        host.classList.add('swb-host');
        if (!_mcWorking && _mcView !== 'list' && _mcView !== 'import' && _mcView !== 'importopts') _mcView = 'list';
        if (_mcView === 'import') return _mcRenderImport(host);
        if (_mcView === 'importopts') return _mcRenderImportOpts(host);
        if (_mcView === 'editor') return _mcPane === 'preview' ? _mcRenderPreview(host) : _mcRenderEditorChat(host);
        return _mcRenderList(host);
    }

    async function _mcEnsureBook() {
        const TH = _wbTH();
        if (!TH || !TH.getLorebooks) return false;
        let books = [];
        try { books = TH.getLorebooks() || []; } catch (e) {}
        if (!books.includes(MC_BOOK)) { try { await TH.createLorebook(MC_BOOK); } catch (e) {} }
        // 掛全域常駐：讀舊全域清單→沒有我的角色就 append→rebind（rebind 是整個替換，必須帶上舊的）
        try {
            if (TH.getGlobalWorldbookNames && TH.rebindGlobalWorldbooks) {
                const g = TH.getGlobalWorldbookNames() || [];
                if (!g.includes(MC_BOOK)) await TH.rebindGlobalWorldbooks([...g, MC_BOOK]);
            }
        } catch (e) {}
        return true;
    }
    async function _mcLoadChars() {
        const TH = _wbTH();
        _mcChars = [];
        if (!TH || !TH.getLorebookEntries) return;
        let entries = [];
        try { entries = await TH.getLorebookEntries(MC_BOOK) || []; } catch (e) {}
        _mcChars = entries.map(e => ({
            uid: e.uid,
            name: e.comment || '(未命名)',
            summary: String(e.content || '').replace(/^【用戶人設】[^\n]*\n+/, '').replace(/【[^】]*】/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40),
            enabled: e.enabled !== false,
            content: e.content || ''
        }));
    }
    function _mcOpenChar(entry) {
        if (entry) _mcWorking = { uid: entry.uid, name: entry.name, blocks: _mcParseEntryContent(String(entry.content || '').replace(/^【用戶人設】[^\n]*\n+/, '')).map(b => ({ label: b.label, content: b.content, userEdited: false })) };
        else _mcWorking = { uid: null, name: '', blocks: [] };
        _mcChat = []; _mcPendCount = 0; _mcView = 'editor'; _mcPane = 'chat';
        renderPersonaPanel();
    }
    async function _mcRenderList(host) {
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar"><div class="swb-bar-title">我的角色<span class="swb-bar-sub" id="mc-count"></span></div></div>
            <div class="swb-list mc-list" id="mc-list"><div class="swb-psub">載入中…</div></div>
            <div class="swb-footbar"><button class="swb-primary" id="mc-new"><i class="fa-solid fa-plus"></i> 新增角色</button></div>
        </div>`;
        host.querySelector('#mc-new').onclick = () => _mcNewChooser();
        const ok = await _mcEnsureBook();
        const listEl = host.querySelector('#mc-list'); if (!listEl) return;
        if (!ok) { listEl.innerHTML = '<div class="swb-psub">酒館助手未就緒（需在酒館內 + 已裝酒館助手）。</div>'; return; }
        await _mcLoadChars();
        const cnt = host.querySelector('#mc-count'); if (cnt) cnt.textContent = _mcChars.length ? ' ' + _mcChars.length + ' 個' : '';
        if (!_mcChars.length) { listEl.innerHTML = '<div class="swb-psub">還沒有角色。點下面「新增角色」開始寫你的主角。</div>'; return; }
        listEl.innerHTML = _mcChars.map(c => `<div class="swb-card mc-charcard" data-uid="${c.uid}">
            <div class="swb-card-main">
                <div class="swb-card-title">${_sgcEsc(c.name)}${c.enabled ? '<span class="mc-active-tag">使用中</span>' : ''}</div>
                <div class="swb-card-sum">${_sgcEsc(c.summary) || '（空）'}</div>
            </div>
            <button class="mc-usebtn ${c.enabled ? 'on' : ''}" data-use="${c.uid}">${c.enabled ? '使用中' : '設為使用中'}</button>
            <span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span>
        </div>`).join('');
        listEl.querySelectorAll('.mc-charcard').forEach(card => {
            const main = card.querySelector('.swb-card-main');
            if (main) main.onclick = () => { const c = _mcChars.find(x => x.uid === parseInt(card.getAttribute('data-uid'), 10)); if (c) _mcOpenChar(c); };
        });
        listEl.querySelectorAll('[data-use]').forEach(btn => btn.onclick = (ev) => { ev.stopPropagation(); _mcSetActive(parseInt(btn.getAttribute('data-use'), 10)); });
    }

    // 新增角色 → 兩條路：創建新的 / 修改我現有的（酒館）人設
    function _mcNewChooser() {
        _mcSheet('新增角色 — 從哪開始？', [
            { label: '<i class="fa-solid fa-plus"></i> 創建新的（從零跟 AI 寫）', onClick: () => _mcOpenChar(null) },
            { label: '<i class="fa-solid fa-address-card"></i> 修改我現有的人設（選一個酒館人設）', onClick: () => { _mcView = 'import'; renderPersonaPanel(); } }
        ]);
    }
    // 匯入頁：列出 ST 酒館人設，選一個 → AI 拆塊落進編輯器（之後可直接「對標當前世界」）
    function _mcRenderImport(host) {
        const OP = (window.parent || window).OS_PERSONA || window.OS_PERSONA;
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar"><button class="swb-iconbtn" id="mc-iback"><i class="fa-solid fa-chevron-left"></i></button><div class="swb-bar-title">修改我現有的人設</div></div>
            <div class="swb-list mc-list" id="mc-implist"><div class="swb-psub">讀取中…</div></div>
        </div>`;
        host.querySelector('#mc-iback').onclick = () => { _mcView = 'list'; renderPersonaPanel(); };
        const listEl = host.querySelector('#mc-implist');
        const paint = (arr) => {
            if (!arr || !arr.length) { listEl.innerHTML = '<div class="swb-psub">讀不到酒館人設（可先到大廳「使用者」開一次，或這環境沒有人設）。</div>'; return; }
            listEl.innerHTML = arr.map((p, i) => `<div class="swb-card mc-charcard" data-i="${i}">
                ${p.avatar ? `<img class="mc-impavatar" src="${_sgcEsc(p.avatar)}" onerror="this.classList.add('mc-impavatar-broke')">` : '<div class="mc-impavatar mc-impavatar-ph"><i class="fa-solid fa-user"></i></div>'}
                <div class="swb-card-main"><div class="swb-card-title">${_sgcEsc(p.name)}</div><div class="swb-card-sum">${_sgcEsc(String(p.desc || '').replace(/\s+/g, ' ').slice(0, 40)) || 'ST 原生人設'}</div></div>
                <span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span>
            </div>`).join('');
            listEl.querySelectorAll('.mc-charcard').forEach(card => card.onclick = () => { const p = arr[parseInt(card.getAttribute('data-i'), 10)]; if (p) { _mcImportPick = p; _mcView = 'importopts'; renderPersonaPanel(); } });
        };
        let list = [];
        try { list = (OP && OP.getList && OP.getList()) || []; } catch (e) {}
        paint(list);
        if (!list.length) setTimeout(() => { let l2 = []; try { l2 = (OP && OP.getList && OP.getList()) || []; } catch (e) {} if (_mcView === 'import') paint(l2); }, 450);
    }
    // 選了現有人設 → 面板內小表單：對標當前世界 / 或自己打要求讓 AI 改＋整理(留空=只整理)。都存成新一份(uid:null)
    function _mcRenderImportOpts(host) {
        const p = _mcImportPick || {};
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar"><button class="swb-iconbtn" id="mc-oback"><i class="fa-solid fa-chevron-left"></i></button><div class="swb-bar-title">${_sgcEsc(p.name || '人設')}</div></div>
            <button class="mc-optbtn" id="mc-opt-world"><i class="fa-solid fa-earth-asia"></i> 對標當前世界（變這張卡的世界版）</button>
            <div class="mc-opt-or">或，照你的要求改</div>
            <textarea class="swb-field mc-optreq" id="mc-optreq" rows="3" placeholder="想怎麼改這份人設？（例：更陰沉一點、加一段職業背景）留空＝只整理分類"></textarea>
            <button class="mc-optbtn primary" id="mc-opt-refine"><i class="fa-solid fa-wand-magic-sparkles"></i> 改＋整理</button>
        </div>`;
        host.querySelector('#mc-oback').onclick = () => { _mcView = 'import'; renderPersonaPanel(); };
        host.querySelector('#mc-opt-world').onclick = () => _mcImportToWorld(p);
        host.querySelector('#mc-opt-refine').onclick = () => { const req = (host.querySelector('#mc-optreq').value || '').trim(); _mcImportRefine(p, req); };
    }
    function _mcImportEnter(p, blocks, pane, nameOverride) {
        _mcWorking = { uid: null, name: nameOverride != null ? nameOverride : ((p && p.name) || ''), blocks };
        _mcChat = []; _mcPendCount = blocks.length; _mcView = 'editor'; _mcPane = pane; renderPersonaPanel();
    }
    // 照使用者要求改寫＋整理成區塊（req 留空＝只整理）。落進編輯器預覽
    async function _mcImportRefine(p, req) {
        const desc = String((p && p.desc) || '').trim();
        if (!desc) { _mcImportEnter(p, [], 'chat'); return; }
        const api = (window.parent || window).OS_API || window.OS_API;
        if (!api || (typeof api.chatMain !== 'function' && typeof api.chatSecondary !== 'function')) {
            _wbToast('沒有可用 AI，先整段放著、可手動拆塊');
            _mcImportEnter(p, [{ label: '人設', content: desc, userEdited: true }], 'preview'); return;
        }
        _wbToast(req ? 'AI 改寫＋整理中…' : 'AI 整理中…');
        const task = req
            ? ('請依使用者要求改寫這份人設，並整理成區塊。沒被要求動到的部分保留原樣，別自己亂加設定。\n【使用者要求】' + req)
            : '請把這份人設整理成區塊，內容忠於原文、別自己加設定。';
        const sys = _MC_SYS + '\n\n【任務】下面是使用者現有的人設（一整段散文）。' + task + ' 結果用 <persona><seg> 輸出。\n\n【現有人設】\n' + desc;
        const messages = [{ role: 'system', content: sys }, { role: 'user', content: req || '整理成區塊。' }];
        const fallback = () => { _wbToast('先整段放著，可手動拆塊'); _mcImportEnter(p, [{ label: '人設', content: desc, userEdited: true }], 'preview'); };
        const done = (full) => {
            const _bad = _studioBadReply(String(full || ''));   // 錯誤頁/空/截斷 → 問重試（同創作室其他路徑）
            if (_bad.bad) { _studioConfirmRetry(_bad.reason, () => _mcImportRefine(p, req), fallback); return; }
            const segs = _mcParseSegs(String(full || ''));
            if (segs.length) _mcImportEnter(p, segs.map(s => ({ label: s.label, content: s.content, userEdited: false, aiNew: true })), 'preview');
            else { _wbToast('AI 沒整理成功，先整段放著'); _mcImportEnter(p, [{ label: '人設', content: desc, userEdited: true }], 'preview'); }
        };
        const errCb = (err) => _studioConfirmRetry((err && err.message) || err, () => _mcImportRefine(p, req), fallback);
        const useMain = _mcModel === 'main' && typeof api.chatMain === 'function';
        const callFn = useMain ? api.chatMain : (typeof api.chatSecondary === 'function' ? api.chatSecondary : api.chatMain);
        try { callFn.call(api, messages, () => {}, done, errCb, { stream: true }); } catch (e) { errCb(e); }   // 長輸出開串流防閘道504
    }
    // 對標當前世界：一個 AI call 直接把現有人設改寫成這張卡世界的版本(現代→古代)，存成新變體
    async function _mcImportToWorld(p) {
        const desc = String((p && p.desc) || '').trim();
        if (!desc) { _wbToast('這個人設沒有描述內容，先整理一下'); _mcImportRefine(p, ''); return; }
        let ctx = await _mcWorldContext('card');
        let tag = '對標版';
        if (!ctx) {
            const d = prompt('這張卡沒抓到綁定的世界書。\n用一句話描述要對標的世界（例：古風武俠）：');
            if (!d || !d.trim()) return;
            ctx = '世界觀：' + d.trim(); tag = d.trim().slice(0, 8);
        }
        const api = (window.parent || window).OS_API || window.OS_API;
        if (!api || (typeof api.chatMain !== 'function' && typeof api.chatSecondary !== 'function')) { alert('AI 不可用'); return; }
        _wbToast('AI 對標世界中…');
        const sys = _MC_SYS + '\n\n【任務】下面是使用者現有的人設（一整段散文）。請把它改寫成「貼合下面這個世界」的版本。原則：\n1. 保留核心個性／這個人是誰／與人相處的方式——性格本質不變。\n2. 外觀、說話習慣、出身背景這類「世界皮層」改寫成貼合該世界（例如現代身分改成古代身分）。\n3. ★取捨優先於硬凹：原設定裡若有「在新世界根本不存在或不合理」的東西（某些職業、物品、習慣、背景細節），就「直接捨棄那一項」，不要硬找個對應物去套。寧可這個人在新世界少幾條設定，也不要為了照搬而生出彆扭的拼湊對應。\n4. 只留／改「換了世界仍然成立」的部分；不合的就讓它消失、別硬交代它的去向。\n把結果拆成區塊用 <persona><seg> 輸出。\n\n【現有人設】\n' + desc + '\n\n' + ctx;
        const messages = [{ role: 'system', content: sys }, { role: 'user', content: '把我的人設改寫成這個世界的版本。' }];
        const done = (full) => {
            const _bad = _studioBadReply(String(full || ''));   // 錯誤頁/空/截斷 → 問重試
            if (_bad.bad) { _studioConfirmRetry(_bad.reason, () => _mcImportToWorld(p)); return; }
            const segs = _mcParseSegs(String(full || ''));
            if (!segs.length) { alert('AI 沒吐出區塊，再試一次'); return; }
            _mcImportEnter(p, segs.map(s => ({ label: s.label, content: s.content, userEdited: false, aiNew: true })), 'preview', ((p && p.name) || '我') + '（' + tag + '）');
            _wbToast('已生成世界版，按確定會存成「新的一份」、不動你原本的');
        };
        const errCb = (err) => _studioConfirmRetry((err && err.message) || err, () => _mcImportToWorld(p));
        const useMain = _mcModel === 'main' && typeof api.chatMain === 'function';
        const callFn = useMain ? api.chatMain : (typeof api.chatSecondary === 'function' ? api.chatSecondary : api.chatMain);
        try { callFn.call(api, messages, () => {}, done, errCb, { stream: true }); } catch (e) { errCb(e); }   // 長輸出開串流防閘道504
    }

    const _MC_SYS = `你是「我的角色」人設寫作助手，幫使用者寫他自己在故事裡扮演的主角（MC/OC）。可能含成人/NSFW 設定，照常專業協助、不要拒絕、不要說教。
- 先用一兩句白話跟使用者討論。
- 要寫或改人設時，把人設拆成多個「區塊」，每個區塊用一個 <seg> 標籤包起來，整批放在 <persona>…</persona> 裡：
  <persona>
  <seg label="區塊名">這個區塊的內容</seg>
  <seg label="區塊名">這個區塊的內容</seg>
  </persona>
- 區塊名你依內容自取（例如：外觀、個性、說話習慣、背景、喜好、討厭的事物…），需要幾塊就給幾塊。
- 同一個「區塊名」代表同一塊；使用者只想改某一塊時，就只重出那一塊（同名會覆蓋舊的）。
- 只輸出你的對話與 <persona> 區塊，不要解釋格式本身。`;

    // 把 AI 吐的 segs 合進 _mcWorking.blocks：同名覆蓋，但使用者手改過(userEdited)的不蓋；回傳這輪動到幾塊
    function _mcMergeSegs(segs) {
        let touched = 0;
        (segs || []).forEach(s => {
            const ex = _mcWorking.blocks.find(b => b.label === s.label);
            if (!ex) { _mcWorking.blocks.push({ label: s.label, content: s.content, userEdited: false, aiNew: true }); touched++; }
            else if (!ex.userEdited) { ex.content = s.content; ex.aiNew = true; touched++; }
        });
        return touched;
    }
    function _mcRenderEditorChat(host) {
        const nm = _mcWorking.name || '新角色';
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar">
                <button class="swb-iconbtn" id="mc-back"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title">${_sgcEsc(nm)}</div>
                <button class="swb-iconbtn" id="mc-toworld" title="對標某個世界，把人設換皮成那個世界的版本"><i class="fa-solid fa-earth-asia"></i></button>
            </div>
            <div class="mc-chat" id="mc-chat"></div>
            <div class="mc-pendbar" id="mc-pendbar"></div>
            <div class="mc-inputrow">
                <textarea class="swb-field mc-input" id="mc-msg" rows="2" placeholder="${_mcWorking.blocks.length ? '想再加或修改哪裡，直接跟 AI 說…' : '跟 AI 說你的主角是什麼樣的人…'}"></textarea>
                <button class="swb-primary" id="mc-send">送出</button>
            </div>
        </div>`;
        host.querySelector('#mc-back').onclick = () => { _mcView = 'list'; _mcWorking = null; renderPersonaPanel(); };
        host.querySelector('#mc-send').onclick = () => _mcSend(host);
        host.querySelector('#mc-toworld').onclick = () => _mcAdaptToWorld(host);
        _mcPaintChat(host);
        _mcPaintPendBar(host);
    }
    function _mcPaintChat(host) {
        const box = host.querySelector('#mc-chat'); if (!box) return;
        let html = _mcChat.map(m => {
            const body = String(m.content || '').replace(/<persona>[\s\S]*?<\/persona>/gi, '').trim();   // 先剝人設機器標記，再渲染 markdown
            return `<div class="mc-msg ${m.role === 'user' ? 'me' : 'ai'}">${renderMarkdown(body) || '…'}</div>`;
        }).join('');
        // 錯誤泡泡＋重試（API錯誤頁/空回應/截斷不進歷史，同世界書聊天）
        if (_mcLastError) html += `<div class="mc-msg ai studio-error-bubble"><div class="studio-error-msg">❌ 錯誤：${String(_mcLastError).replace(/</g, '&lt;').slice(0, 200)}</div><button class="studio-retry-btn">🔄 重試</button></div>`;
        box.innerHTML = html;
        const rb = box.querySelector('.studio-retry-btn');
        if (rb) rb.onclick = () => { _mcLastError = null; _mcPaintChat(host); _mcCall(host); };
        box.scrollTop = box.scrollHeight;
    }
    function _mcPaintPendBar(host) {
        const bar = host.querySelector('#mc-pendbar'); if (!bar) return;
        if (_mcWorking.blocks.length && _mcPendCount > 0) {
            bar.innerHTML = `<button class="mc-pend" id="mc-viewprev"><i class="fa-solid fa-eye"></i> 人設更新了 · 看預覽（${_mcWorking.blocks.length}）</button>`;
            bar.querySelector('#mc-viewprev').onclick = () => { _mcPane = 'preview'; renderPersonaPanel(); };
        } else if (_mcWorking.blocks.length) {
            bar.innerHTML = `<button class="mc-pend ghost" id="mc-viewprev2"><i class="fa-solid fa-eye"></i> 看預覽（${_mcWorking.blocks.length}）</button>`;
            bar.querySelector('#mc-viewprev2').onclick = () => { _mcPane = 'preview'; renderPersonaPanel(); };
        } else { bar.innerHTML = ''; }
    }
    async function _mcSend(host) {
        const ta = host.querySelector('#mc-msg'); const msg = (ta.value || '').trim();
        if (!msg) return;
        const api = (window.parent || window).OS_API || window.OS_API;
        if (!api || (typeof api.chatSecondary !== 'function' && typeof api.chatMain !== 'function')) { alert('AI 不可用，請先到「寫作 → API 設置」設好模型'); return; }
        _mcChat.push({ role: 'user', content: msg }); ta.value = '';
        _mcLastError = null;
        _mcPaintChat(host);
        _mcCall(host);
    }
    // 真正發 API——_mcSend 與錯誤泡泡「重試」共用（用當前 _mcChat 重打、不重複塞 user 訊息）
    function _mcCall(host) {
        const api = (window.parent || window).OS_API || window.OS_API;
        if (!api) return;
        const sendBtn = host.querySelector('#mc-send'); if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '生成中…'; }
        const existing = _mcWorking.blocks.length ? ('\n\n【目前人設區塊】\n' + _mcAssembleContent(_mcWorking.blocks)) : '';
        const messages = [{ role: 'system', content: _MC_SYS + existing }].concat(_mcChat.slice(-8));
        const done = (full) => {
            if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '送出'; }
            const reply = String(full || '');
            // 驗貨（同主聊天室 7d2b629）：錯誤頁/空回應/截斷別當正常回覆收
            const _bad = _studioBadReply(reply);
            if (_bad.bad) { _mcLastError = _bad.reason; _mcPaintChat(host); return; }
            _mcLastError = null;
            _mcChat.push({ role: 'assistant', content: reply });
            _mcPendCount += _mcMergeSegs(_mcParseSegs(reply));
            _mcPaintChat(host); _mcPaintPendBar(host);
        };
        const errCb = (err) => { if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '送出'; } _mcLastError = (err && err.message) || String(err || '未知錯誤'); _mcPaintChat(host); };
        const useMain = _mcModel === 'main' && typeof api.chatMain === 'function';
        const callFn = useMain ? api.chatMain : (typeof api.chatSecondary === 'function' ? api.chatSecondary : api.chatMain);
        try { callFn.call(api, messages, () => {}, done, errCb, { stream: true }); } catch (e) { errCb(e); }   // 長輸出開串流防閘道504
    }

    function _mcRenderPreview(host) {
        _mcPendCount = 0;
        host.innerHTML = `<div class="swb-page">
            <div class="swb-bar">
                <button class="swb-iconbtn" id="mc-pback"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title"><i class="fa-solid fa-eye"></i> 人設預覽<span class="swb-bar-sub">${_mcWorking.blocks.length} 個區塊</span></div>
            </div>
            <input class="swb-field mc-namefield" id="mc-name" placeholder="角色名（例：冷面男主）" value="${_sgcEsc(_mcWorking.name)}">
            <div class="mc-blocks" id="mc-blocks"></div>
            <button class="mc-addblock" id="mc-addblock"><i class="fa-solid fa-plus"></i> 自己加一個區塊</button>
            <div class="swb-footbar">
                <button class="swb-secondary" id="mc-pcancel"><i class="fa-solid fa-chevron-left"></i> 返回對話</button>
                <button class="swb-primary" id="mc-save"><i class="fa-solid fa-floppy-disk"></i> 確定寫入世界書</button>
            </div>
        </div>`;
        host.querySelector('#mc-pback').onclick = () => { _mcPane = 'chat'; renderPersonaPanel(); };
        host.querySelector('#mc-pcancel').onclick = () => { _mcPane = 'chat'; renderPersonaPanel(); };
        host.querySelector('#mc-name').oninput = (e) => { _mcWorking.name = e.target.value; };
        host.querySelector('#mc-addblock').onclick = () => { _mcWorking.blocks.push({ label: '新區塊', content: '', userEdited: true, editing: true }); renderPersonaPanel(); };
        host.querySelector('#mc-save').onclick = () => _mcWriteEntry(host);
        _mcPaintBlocks(host);
    }
    function _mcPaintBlocks(host) {
        const box = host.querySelector('#mc-blocks'); if (!box) return;
        box.innerHTML = _mcWorking.blocks.map((b, i) => b.editing ? `
            <div class="mc-block editing" data-i="${i}">
                <input class="mc-block-label" data-label="${i}" value="${_sgcEsc(b.label)}" placeholder="區塊名">
                <textarea class="mc-block-text" data-text="${i}" rows="3" placeholder="這個區塊的內容">${_sgcEsc(b.content)}</textarea>
                <div class="mc-block-editrow"><button class="swb-secondary mc-bdone" data-done="${i}"><i class="fa-solid fa-check"></i> 完成</button></div>
            </div>` : `
            <div class="mc-block" data-i="${i}">
                <div class="mc-block-head">
                    <i class="fa-solid fa-grip-vertical mc-grip"></i>
                    <span class="mc-block-name">${_sgcEsc(b.label)}${b.aiNew ? '<span class="mc-ai-dot" title="AI 更新">·</span>' : ''}</span>
                    <span class="mc-block-spacer"></span>
                    <button class="mc-iconbtn" data-edit="${i}" aria-label="編輯"><i class="fa-solid fa-pen"></i></button>
                    <button class="mc-iconbtn danger" data-del="${i}" aria-label="刪除"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="mc-block-body">${_sgcEsc(b.content).replace(/\n/g, '<br>') || '（空）'}</div>
                <div class="mc-block-move"><button class="mc-movebtn" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="上移"><i class="fa-solid fa-arrow-up"></i></button><button class="mc-movebtn" data-down="${i}" ${i === _mcWorking.blocks.length - 1 ? 'disabled' : ''} aria-label="下移"><i class="fa-solid fa-arrow-down"></i></button></div>
            </div>`).join('');
        box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { _mcWorking.blocks[+b.getAttribute('data-edit')].editing = true; renderPersonaPanel(); });
        box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { _mcWorking.blocks.splice(+b.getAttribute('data-del'), 1); renderPersonaPanel(); });
        box.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const i = +b.getAttribute('data-up'); const a = _mcWorking.blocks; const t = a[i - 1]; a[i - 1] = a[i]; a[i] = t; renderPersonaPanel(); });
        box.querySelectorAll('[data-down]').forEach(b => b.onclick = () => { const i = +b.getAttribute('data-down'); const a = _mcWorking.blocks; const t = a[i + 1]; a[i + 1] = a[i]; a[i] = t; renderPersonaPanel(); });
        box.querySelectorAll('[data-done]').forEach(b => b.onclick = () => {
            const i = +b.getAttribute('data-done');
            const lab = box.querySelector('[data-label="' + i + '"]').value.trim();
            const txt = box.querySelector('[data-text="' + i + '"]').value;
            _mcWorking.blocks[i].label = lab || '未命名'; _mcWorking.blocks[i].content = txt;
            _mcWorking.blocks[i].userEdited = true; _mcWorking.blocks[i].aiNew = false; _mcWorking.blocks[i].editing = false;
            renderPersonaPanel();
        });
    }
    async function _mcWriteEntry(host) {
        if (!_mcWorking.name || !_mcWorking.name.trim()) { alert('先給角色取個名字'); return; }
        if (!_mcWorking.blocks.length) { alert('至少要有一個區塊'); return; }
        const TH = _wbTH();
        if (!TH) { alert('酒館助手未就緒'); return; }
        await _mcEnsureBook();
        const _nm = _mcWorking.name.trim();
        // 主模型只讀條目「內容」、讀不到標題 → 內容開頭標【用戶人設】+角色名，讓它知道這是玩家扮演的主角、別當 NPC/世界設定
        const content = '【用戶人設】這是玩家本人在故事中扮演的主角「' + _nm + '」的設定，請以此理解並扮演使用者角色：\n\n' + _mcAssembleContent(_mcWorking.blocks);
        const entry = { comment: _nm, keys: [], content, type: 'constant' };
        try {
            if (_mcWorking.uid != null) await TH.setLorebookEntries(MC_BOOK, [{ uid: _mcWorking.uid, ...entry }]);
            else await TH.createLorebookEntries(MC_BOOK, [{ ...entry, enabled: false }]);
            _wbToast('已寫入世界書 ✓');
            _mcView = 'list'; _mcWorking = null;
            renderPersonaPanel();
        } catch (e) { alert('寫入失敗：' + (e && e.message || e)); }
    }
    async function _mcSetActive(uid) {
        const TH = _wbTH();
        if (!TH || !TH.setLorebookEntries) { alert('酒館助手未就緒'); return; }
        try {
            const cur = _mcChars.find(c => c.uid === uid);
            const turnOff = !!(cur && cur.enabled);   // 已是使用中 → 再點＝取消使用（全部關掉、允許一個都不開）
            const updates = _mcChars.map(c => ({ uid: c.uid, enabled: turnOff ? false : (c.uid === uid) }));
            await TH.setLorebookEntries(MC_BOOK, updates);
            _wbToast(turnOff ? '已取消使用 ✓' : '已設為使用中 ✓');
            renderPersonaPanel();
        } catch (e) { alert('切換失敗：' + (e && e.message || e)); }
    }

    function _mcSheet(title, actions) {
        const host = document.getElementById('studio-persona-content');
        if (!host) return;
        const ov = document.createElement('div');
        ov.className = 'swb-sheet-ov';
        ov.innerHTML = `<div class="swb-sheet"><div class="swb-sheet-title">${_sgcEsc(title)}</div></div>`;
        const sheet = ov.querySelector('.swb-sheet');
        actions.forEach(a => {
            const b = document.createElement('button');
            b.className = 'swb-sheet-btn' + (a.danger ? ' danger' : '');
            b.innerHTML = a.label;
            b.onclick = () => { ov.remove(); a.onClick && a.onClick(); };
            sheet.appendChild(b);
        });
        const cancel = document.createElement('button');
        cancel.className = 'swb-sheet-btn cancel'; cancel.textContent = '取消';
        cancel.onclick = () => ov.remove();
        sheet.appendChild(cancel);
        ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
        host.appendChild(ov);
    }
    function _mcAdaptToWorld(host) {
        if (!_mcWorking.blocks.length) { alert('先寫好一個底版人設，再對標世界'); return; }
        _mcSheet('對標哪個世界？', [
            { label: '<i class="fa-solid fa-id-card"></i> 我現在這張卡的世界', onClick: () => _mcDoAdapt(host, 'card') },
            { label: '<i class="fa-solid fa-pen"></i> 我自己描述一個世界', onClick: () => { const desc = prompt('用一句話描述世界觀（例：古風武俠／賽博龐克…）'); if (desc && desc.trim()) _mcDoAdapt(host, 'desc', desc.trim()); } }
        ]);
    }
    async function _mcWorldContext(mode, desc) {
        if (mode === 'desc') return '世界觀：' + desc;
        const TH = _wbTH();
        try {
            const names = new Set();
            try { const cw = TH.getCharWorldbookNames && TH.getCharWorldbookNames('current'); if (cw) { if (cw.primary) names.add(cw.primary); (cw.additional || []).forEach(n => names.add(n)); } } catch (e) {}
            try { const chat = TH.getChatWorldbookName && TH.getChatWorldbookName('current'); if (chat) names.add(chat); } catch (e) {}
            names.delete(MC_BOOK);
            if (!names.size) return null;
            const parts = [];
            for (const name of names) {
                const entries = await TH.getLorebookEntries(name) || [];
                const txt = entries.filter(e => e.enabled !== false).map(e => '【' + (e.comment || '') + '】' + (e.content || '')).join('\n');
                if (txt) parts.push(txt);
            }
            const all = parts.join('\n').slice(0, 4000);
            return all ? ('目標世界設定：\n' + all) : null;
        } catch (e) { return null; }
    }
    async function _mcDoAdapt(host, mode, desc) {
        const ctx = await _mcWorldContext(mode, desc);
        if (!ctx) { alert('拿不到世界資料（這張卡可能沒綁世界書）。改用「我自己描述一個世界」。'); return; }
        const api = (window.parent || window).OS_API || window.OS_API;
        if (!api || (typeof api.chatMain !== 'function' && typeof api.chatSecondary !== 'function')) { alert('AI 不可用'); return; }
        _wbToast('AI 換皮中…');
        const sys = _MC_SYS + '\n\n【對標世界】使用者要把現有人設改成貼合下面這個世界。請「保留人設的核心個性／這個人是誰」，只把外觀、說話習慣、背景這類「世界皮層」改寫成貼合該世界；不要改掉性格本質。一樣用 <persona><seg> 輸出全部區塊。\n\n【現有人設】\n' + _mcAssembleContent(_mcWorking.blocks) + '\n\n' + ctx;
        const messages = [{ role: 'system', content: sys }, { role: 'user', content: '把我的人設對標到這個世界，重寫全部區塊。' }];
        const done = (full) => {
            const _bad = _studioBadReply(String(full || ''));   // 錯誤頁/空/截斷 → 問重試
            if (_bad.bad) { _studioConfirmRetry(_bad.reason, () => _mcDoAdapt(host, mode, desc)); return; }
            const segs = _mcParseSegs(String(full || ''));
            if (!segs.length) { alert('AI 沒吐出區塊，再試一次'); return; }
            const base = _mcWorking.name || '我';
            const tag = mode === 'desc' ? desc : '對標版';
            _mcWorking = { uid: null, name: base + '（' + tag.slice(0, 8) + '）', blocks: segs.map(s => ({ label: s.label, content: s.content, userEdited: false, aiNew: true })) };
            _mcChat = []; _mcPendCount = segs.length; _mcPane = 'preview';
            renderPersonaPanel();
            _wbToast('已生成變體，檢查後按確定寫入');
        };
        const errCb = (err) => _studioConfirmRetry((err && err.message) || err, () => _mcDoAdapt(host, mode, desc));
        const useMain = _mcModel === 'main' && typeof api.chatMain === 'function';
        const callFn = useMain ? api.chatMain : (typeof api.chatSecondary === 'function' ? api.chatSecondary : api.chatMain);
        try { callFn.call(api, messages, () => {}, done, errCb, { stream: true }); } catch (e) { errCb(e); }   // 長輸出開串流防閘道504
    }

    // ── 對外入口：核心 switchTopMode 懶解析呼叫 ──
    win.OS_STUDIO_MC = { renderPersonaPanel };
})();
