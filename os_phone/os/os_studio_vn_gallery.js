// ----------------------------------------------------------------
// [檔案] os_studio_vn_gallery.js — 創作室 🧩 VN 組件展廳（2026-07-16 自 os_studio.js 拆出）
// 職責：四頁換頁路由（browse 瀏覽/篩選/搜尋 → detail 詳情 → settings 使用與設置 → package 選擇並打包）；
//       群組 chip（vn_component_groups + tpl.groupIds[]，含大廳 g_lobby 內建組與舊旗標遷移）；
//       複製/匯出/匯入 VN UI 包；孤兒組件清理；關鍵字注入/登場音效/面板字體設置；IntersectionObserver 縮圖懶載。
// 依賴：window.OS_STUDIO._b 橋（_sgcEsc/_studioToast/syncActiveTagsToLocal/_templateToPhoneHtml/_buildPreviewSt/
//       _attachVpScaler/importToSillyTavern/openRawEditModal/_removeTavernPanelArtifacts/_purgeLinkedPhoneApp/
//       _enterEditMode/_getTplById/launch）；載入順序必須在 os_studio.js 之後（index.js PHONE_FILES）。
// 入口＝win.OS_STUDIO_VC.loadStudioGallery()（創作室 VN組件 tab）/ openVnComponents()（工坊獨立浮層）
//       / exportOneVnUiTemplate() / toggleAppLobby()（核心 OS_STUDIO 對外方法懶委派到這）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const ST = win.OS_STUDIO;
    if (!ST || !ST._b) { console.warn('[StudioVC] OS_STUDIO 橋不存在，VN 組件展廳停用'); return; }
    const _b = ST._b;
    // 核心共用工具（過橋取用；全是穩定函式引用，毋需 getter）
    const _sgcEsc = _b._sgcEsc;
    const _studioToast = _b._studioToast;
    const syncActiveTagsToLocal = _b.syncActiveTagsToLocal;
    const _templateToPhoneHtml = _b._templateToPhoneHtml;
    const _buildPreviewSt = _b._buildPreviewSt;
    const _attachVpScaler = _b._attachVpScaler;
    const importToSillyTavern = _b.importToSillyTavern;
    const openRawEditModal = _b.openRawEditModal;
    const _removeTavernPanelArtifacts = _b._removeTavernPanelArtifacts;
    const _purgeLinkedPhoneApp = _b._purgeLinkedPhoneApp;
    const _enterEditMode = _b._enterEditMode;
    const _getTplById = _b._getTplById;
    const launch = _b.launch;

    // 預覽啟動（第一層瀏覽縮圖 + 第二層詳情卡共用）：三尺寸縮放器 + 跑面板 JS
    function _activatePreview(card, tpl, safeTagId) {
        _attachVpScaler(card.querySelector('.studio-pv-tabs'), card.querySelector('.sgc-preview'), card.querySelector('.studio-pv-box'));
        if (tpl.isBlock && tpl.js) {
            setTimeout(() => {
                try {
                    const lines = (tpl.demoFormat || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('<') && !/^\[\/?[a-zA-Z0-9_-]+\]$/.test(l));   // 濾掉 <Tag> 與 [Tag]/[/Tag] 外框、留 [Result|…] 內容行
                    const container = card.querySelector(`.vn-dynamic-panel-${safeTagId}`);
                    if (!container) return;
                    let safeJs = tpl.js.trim().replace(/^```(?:javascript|js|html|css)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
                    window.__IS_PREVIEW = true;
                    const st = _buildPreviewSt(lines);
                    new Function('container', 'lines', 'onComplete', 'st', safeJs)(container, lines, () => {}, st);
                } catch (e) { console.warn(`[展廳 JS] ${tpl.tagId}`, e); }
            }, 80);
        }
    }

    // ════════════════════════════════════════════════════════════════
    // VN 組件：四頁換頁路由（browse / detail / settings / package）
    //   照世界書 _wbView 模式：單一 renderVnComponents() 依 _vcView 分派；
    //   子頁頂部用世界書同款 .swb-bar + #vc-back 返回列。
    //   群組資料模型沿用 vn_component_groups + tpl.groupIds[]，只換成標籤 chip 篩選。
    //   spec: docs/superpowers/specs/2026-06-23-vn-components-redesign-design.md
    // ════════════════════════════════════════════════════════════════
    let _vcView = 'browse';        // browse | detail | settings | package
    let _vcTpl = null;             // 詳情/設置頁正在看的組件
    let _vcFilterGid = 'all';      // 標籤篩選的群組 id（'all'=全部）
    let _vcSearch = '';            // 搜尋字串
    let _vcBrowseScroll = 0;       // 進子頁前的瀏覽捲動位置
    let _vcAllPhoneApps = [];      // 裝手機狀態快取
    const _vcPackSel = new Set();  // 打包頁勾選的 tplId
    // 容器解耦：同一套四頁 UI 可掛在「創作室 VN組件 tab」或「獨立 VN組件區」(工坊進來的浮層)
    let _vcCtx = null;             // { list, content, toolbar } 三個容器元素
    let _vcStandalone = false;     // true=獨立區(瀏覽層自帶返回列；只有「繼續編輯」才橋接創作室)
    let _vcExit = null;            // 獨立區瀏覽層返回 → 關掉浮層
    let _vcStandaloneRoot = null;  // 獨立浮層掛載的根容器（繼續編輯時拿來開創作室）

    function loadStudioGallery() {
        _vcStandalone = false; _vcExit = null; _vcStandaloneRoot = null;
        _vcCtx = {
            list: document.getElementById('studio-gallery-list'),
            content: document.getElementById('studio-gallery-content'),
            toolbar: document.getElementById('studio-gallery-toolbar'),
        };
        _vcView = 'browse'; return renderVnComponents();
    }

    // 獨立 VN組件區：工坊「VN組件清單」卡進來，掛成覆蓋層；除了「繼續編輯」其餘全留在這、不碰創作室
    function openVnComponents(rootContainer) {
        const root = rootContainer || document.getElementById('aps-app-body') || document.body;
        const oldOv = root.querySelector(':scope > .vncomp-app'); if (oldOv) oldOv.remove();
        const ov = document.createElement('div');
        ov.className = 'vncomp-app';
        // 定位＋暖色變數寫進元素本身(跟 #os_studio_app 同作法)：保證蓋滿覆蓋層、不靠 os_studio.css 是否載到新版
        // (曾踩坑：jsdelivr 對 js/css 分開快取→js 新但 css 舊時 .vncomp-app 規則缺失→變流式區塊接在 VN組件 tab 下面)
        ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:9000;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;background:#f5ead3;color:#3c2922;'
            + '--jrpg-paper:#f5ead3;--jrpg-paper-light:#fff9eb;--jrpg-paper-deep:#e7d1a9;--jrpg-ink:#3c2922;--jrpg-muted:#7b6654;--jrpg-wine:#681f25;--jrpg-wine-dark:#461319;--jrpg-gold:#b68a45;--jrpg-gold-light:#ddbd78;--jrpg-line:rgba(132,91,45,0.34);';
        ov.innerHTML = '<div class="vncomp-scroll" style="flex:1;min-height:0;overflow-y:auto;padding:0 14px 24px;box-sizing:border-box;"><div class="vncomp-toolbar vc-hide"><input type="file" class="vncomp-pack-file" accept=".json" hidden></div><div class="vncomp-list" style="display:flex;flex-direction:column;gap:10px;"></div></div>';
        root.appendChild(ov);
        _vcStandalone = true;
        _vcStandaloneRoot = root;
        _vcExit = () => { try { ov.remove(); } catch (e) {} };
        _vcCtx = {
            list: ov.querySelector('.vncomp-list'),
            content: ov.querySelector('.vncomp-scroll'),
            toolbar: ov.querySelector('.vncomp-toolbar'),
        };
        _vcView = 'browse'; _vcBrowseScroll = 0;
        renderVnComponents();
    }

    function renderVnComponents() {
        const listEl = _vcCtx && _vcCtx.list;
        if (!listEl) return;
        if (_vcCtx.toolbar) _vcCtx.toolbar.classList.toggle('vc-hide', _vcView !== 'browse');   // 頂部工具列只在瀏覽層顯示
        if (_vcView === 'detail')   return _vcRenderDetail(listEl);
        if (_vcView === 'settings') return _vcRenderSettings(listEl);
        if (_vcView === 'package')  return _vcRenderPackage(listEl);
        return _vcRenderBrowse(listEl);
    }

    // ── lazy 縮圖：捲到才渲染一個縮小版預覽（含面板 JS），渲不出退回 icon ──
    function _vcThumbBox(tpl, safeTagId) {
        const box = document.createElement('div');
        box.className = 'vc-thumb';
        box.setAttribute('data-thumb', '1');
        box.innerHTML = '<span class="vc-thumb-ph"><i class="fa-solid fa-puzzle-piece"></i></span>';
        box._tpl = tpl; box._safeTagId = safeTagId;
        return box;
    }
    function _vcObserveThumbs(root) {
        const cards = root.querySelectorAll('[data-thumb]');
        if (!('IntersectionObserver' in window)) { cards.forEach(_vcRenderThumb); return; }
        const io = new IntersectionObserver((ents) => {
            ents.forEach(en => { if (en.isIntersecting) { _vcRenderThumb(en.target); io.unobserve(en.target); } });
        }, { rootMargin: '160px' });
        cards.forEach(c => io.observe(c));
    }
    function _vcRenderThumb(box) {
        if (box._thumbDone) return; box._thumbDone = true;
        const tpl = box._tpl, safeTagId = box._safeTagId;
        if (!tpl || !tpl.html) return;
        const inner = document.createElement('div');
        inner.className = 'vc-thumb-render';
        inner.innerHTML = (tpl.css ? `<style>${tpl.css}</style>` : '')
            + `<div class="vn-dynamic-panel-${safeTagId}">${(tpl.html || '').replace(/\{\{1\}\}/g, 'A').replace(/\{\{2\}\}/g, 'B')}</div>`;
        box.innerHTML = ''; box.appendChild(inner);
        if (tpl.isBlock && tpl.js) {
            setTimeout(() => {
                try {
                    const lines = (tpl.demoFormat || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('<') && !/^\[\/?[a-zA-Z0-9_-]+\]$/.test(l));   // 濾掉 <Tag> 與 [Tag]/[/Tag] 外框、留 [Result|…] 內容行
                    const cont = inner.querySelector(`.vn-dynamic-panel-${safeTagId}`); if (!cont) return;
                    let safeJs = tpl.js.trim().replace(/^```(?:javascript|js|html|css)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
                    window.__IS_PREVIEW = true;
                    new Function('container', 'lines', 'onComplete', 'st', safeJs)(cont, lines, () => {}, _buildPreviewSt(lines));
                } catch (e) {}
            }, 30);
        }
    }

    // ── ① 瀏覽層：標籤篩選 + 批次開關 + 平鋪輕卡（不折疊）+ 選擇並打包 ──
    async function _vcRenderBrowse(listEl) {
        const db = win.OS_DB || window.OS_DB;
        if (!db || typeof db.getAllVNTagTemplates !== 'function') { listEl.innerHTML = '<div class="vc-empty">找不到 OS_DB</div>'; return; }
        _wireVnUiPackButtons();
        listEl.innerHTML = '<div class="vc-empty">載入中…</div>';
        let templates = [], _allVn = [];
        try { _allVn = await db.getAllVNTagTemplates(); templates = _allVn.filter(t => t && t.panelType !== '純應用'); }
        catch (e) { listEl.innerHTML = `<div class="vc-empty">載入失敗：${_sgcEsc(e.message)}</div>`; return; }
        await _migrateLobbyFlag(_allVn);   // 舊「大廳顯示」開關一次性遷入大廳組
        _vcAllPhoneApps = db.getAllPhoneApps ? ((await db.getAllPhoneApps()) || []) : [];
        const groups = _loadGroups();
        const validIds = new Set(groups.map(g => g.id));
        const nameMap = {}; groups.forEach(g => nameMap[g.id] = g.name);
        if (_vcFilterGid !== 'all' && !validIds.has(_vcFilterGid)) _vcFilterGid = 'all';   // 篩選的群組被刪了→退回全部

        listEl.innerHTML = '';

        // 獨立區：瀏覽層自帶返回列（創作室 tab 模式不需要、靠 tab 切換）
        if (_vcStandalone) {
            const bar = document.createElement('div');
            bar.className = 'swb-bar';
            bar.innerHTML = '<button class="swb-iconbtn" id="vc-exit" type="button"><i class="fa-solid fa-chevron-left"></i></button><div class="swb-bar-title">VN 組件</div><button class="swb-iconbtn" id="vc-import" type="button" title="匯入包"><i class="fa-solid fa-file-import"></i></button>';
            bar.querySelector('#vc-exit').onclick = () => { if (_vcExit) _vcExit(); };
            const _fi = _vcCtx.toolbar && _vcCtx.toolbar.querySelector('.vncomp-pack-file');
            bar.querySelector('#vc-import').onclick = () => { if (_fi) _fi.click(); };
            if (_fi && !_fi._wired) { _fi._wired = 1; _fi.onchange = (e) => { const f = e.target.files && e.target.files[0]; if (f) importVnUiPack(f); e.target.value = ''; }; }
            listEl.appendChild(bar);
        }

        // 標籤 chip 列（全部 + 各群組 + ＋群組）
        const tagbar = document.createElement('div');
        tagbar.className = 'vc-tagbar';
        const chip = (label, gid, on) => `<button class="vc-chip${on ? ' on' : ''}" type="button" data-gid="${_sgcEsc(gid)}">${_sgcEsc(label)}</button>`;
        tagbar.innerHTML = chip('全部', 'all', _vcFilterGid === 'all')
            + groups.map(g => chip(g.name, g.id, _vcFilterGid === g.id)).join('')
            + '<button class="vc-chip vc-chip-add" type="button" data-newgroup="1"><i class="fa-solid fa-plus"></i> 群組</button>';
        tagbar.querySelectorAll('[data-gid]').forEach(b => b.onclick = () => { _vcFilterGid = b.getAttribute('data-gid'); _vcBrowseScroll = 0; renderVnComponents(); });
        tagbar.querySelector('[data-newgroup]').onclick = () => _createGroup();
        listEl.appendChild(tagbar);

        // 搜尋框
        const search = document.createElement('div');
        search.className = 'vc-search';
        search.innerHTML = '<span class="vc-search-ico"><i class="fa-solid fa-magnifying-glass"></i></span><input class="vc-search-input" type="text" placeholder="搜尋組件…">';
        const si = search.querySelector('.vc-search-input'); si.value = _vcSearch;
        si.oninput = () => { _vcSearch = si.value; _vcApplyBrowseFilter(listEl); };
        listEl.appendChild(search);

        // 批次開關條（選了某群組才出現）
        if (_vcFilterGid !== 'all') {
            const grp = groups.find(g => g.id === _vcFilterGid);
            if (grp) {
                const members = templates.filter(t => _tplGroupIds(t).includes(grp.id));
                const st = _groupState(members);
                const bar = document.createElement('div');
                bar.className = 'vc-batchbar';
                bar.innerHTML = `<span class="vc-batchbar-name">「${_sgcEsc(grp.name)}」整組一鍵開關</span>
                    <label class="sgc-switch"><input type="checkbox" class="sgc-switch-input"${st === 'on' ? ' checked' : ''}><span class="sgc-switch-slider"></span></label>
                    <button class="vc-batchbar-mng" type="button" title="管理這組成員"><i class="fa-solid fa-gear"></i> 管理成員</button>`;
                const sw = bar.querySelector('.sgc-switch-input');
                if (st === 'partial') sw.indeterminate = true;
                sw.onchange = async () => { await _setGroupActive(members, st !== 'on'); renderVnComponents(); };
                bar.querySelector('.vc-batchbar-mng').onclick = () => _openGroupManage(grp);
                listEl.appendChild(bar);
            }
        }

        // 篩選後清單
        const shown = (_vcFilterGid === 'all') ? templates
            : templates.filter(t => _tplGroupIds(t).filter(id => validIds.has(id)).includes(_vcFilterGid));
        if (!shown.length) {
            const e = document.createElement('div'); e.className = 'vc-empty';
            e.textContent = templates.length ? '這個標籤下還沒有組件。' : 'VN 組件空空如也，去煉丹做純展示面板吧！';
            listEl.appendChild(e);
        } else {
            const wrap = document.createElement('div'); wrap.className = 'vc-list';
            shown.forEach(tpl => wrap.appendChild(_vcCard(tpl, nameMap, validIds)));
            listEl.appendChild(wrap);
            _vcApplyBrowseFilter(listEl);
            _vcObserveThumbs(wrap);
        }

        // ── 隱藏／孤兒組件：isActive（還在劇情裡作用）但沒出現在上面清單（被 panelType 等藏起）→ 無處可管。
        //    硬列出來給看+刪：解「莫名其妙冒出舊面板、卻在展廳/我的應用都找不到」的孤兒。不管什麼 panelType/版本都抓得到。──
        const _shownIds = new Set(templates.map(t => t.id));
        // 純應用只是手機 app、不屬於 VN 組件 → 不列孤兒（否則刪它會連手機 app 一起清，那是「共用」型才該有的邏輯）
        const _orphans = _allVn.filter(t => t && t.isActive && !_shownIds.has(t.id) && t.panelType !== '純應用');
        if (_orphans.length) {
            const ob = document.createElement('div'); ob.className = 'vc-orphan-box';
            const hd = document.createElement('div'); hd.className = 'vc-orphan-hd';
            hd.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 隱藏／孤兒組件（${_orphans.length}）<span class="vc-orphan-sub">這些不在上面清單、但還在劇情裡作用（AI 會被教著寫、劇情會渲染）。認不得就刪掉。</span>`;
            ob.appendChild(hd);
            _orphans.forEach(tpl => {
                const row = document.createElement('div'); row.className = 'vc-orphan-row';
                const meta = `${(tpl.title && String(tpl.title).trim()) || '(無標題)'} · ${tpl.panelType || '未標類型'}${tpl.isBlock ? ' · 區塊' : ''}`;
                row.innerHTML = `<span class="vc-orphan-info"><span class="vc-orphan-tag">${_sgcEsc(tpl.tagId || '?')}</span><span class="vc-orphan-meta">${_sgcEsc(meta)}</span></span><button class="vc-orphan-del" type="button" title="刪除"><i class="fa-solid fa-trash"></i></button>`;
                row.querySelector('.vc-orphan-del').onclick = async () => {
                    if (!confirm(`刪除隱藏組件 [${tpl.tagId}]？\n刪掉後它會從劇情裡消失、AI 也不再被教著寫它。此動作無法復原。`)) return;
                    try { await db.deleteUITemplate(tpl.id); } catch (e) {}
                    try { await syncActiveTagsToLocal(); } catch (e) {}
                    if (win.VN_DynamicParser) { try { await win.VN_DynamicParser.init(); } catch (e) {} }
                    try { await _removeTavernPanelArtifacts(tpl.tagId); } catch (e) {}   // 連酒館正則+主世界書殘留一起清
                    try { await _purgeLinkedPhoneApp(tpl.id); } catch (e) {}            // 連對應的手機 app + 資料一起清（共用＝整個移除）
                    renderVnComponents();
                };
                ob.appendChild(row);
            });
            listEl.appendChild(ob);
        }

        // 底部：選擇並打包
        const foot = document.createElement('div'); foot.className = 'vc-browse-foot';
        foot.innerHTML = `<button class="vc-pack-cta" type="button"${templates.length ? '' : ' disabled'}><i class="fa-solid fa-box-archive"></i> 選擇並打包</button>`;
        foot.querySelector('.vc-pack-cta').onclick = () => { if (!templates.length) return; _vcPackSel.clear(); _vcView = 'package'; renderVnComponents(); };
        listEl.appendChild(foot);

        const content = _vcCtx.content;
        if (content) content.scrollTop = _vcBrowseScroll;   // 從子頁返回時還原捲動
    }
    function _vcApplyBrowseFilter(listEl) {
        const q = _vcSearch.trim().toLowerCase();
        listEl.querySelectorAll('.vc-card').forEach(c => {
            const ok = !q || (c.getAttribute('data-name') || '').toLowerCase().includes(q);
            c.classList.toggle('vc-hide', !ok);
        });
    }
    function _vcCard(tpl, nameMap, validIds) {
        const safeTagId = (tpl.tagId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
        const gids = _tplGroupIds(tpl).filter(id => validIds.has(id));
        const tags = gids.length
            ? gids.map(id => `<span class="vc-tag">${_sgcEsc(nameMap[id])}</span>`).join('')
            : '<span class="vc-tag muted">未分組</span>';
        const card = document.createElement('div');
        card.className = 'vc-card';
        card.setAttribute('data-name', `${tpl.title || ''} ${tpl.tagId || ''}`);
        card.innerHTML = `<div class="vc-card-main">
                <div class="vc-card-title">${_sgcEsc((tpl.title && String(tpl.title).trim()) || tpl.tagId || '未知')}</div>
                <div class="vc-card-tags">${tags}</div>
            </div>
            <span class="vc-dot${tpl.isActive ? ' on' : ''}" title="${tpl.isActive ? '啟用中' : '停用'}"></span>
            <span class="vc-chev"><i class="fa-solid fa-chevron-right"></i></span>`;
        card.insertBefore(_vcThumbBox(tpl, safeTagId), card.firstChild);
        card.onclick = () => {
            const content = _vcCtx.content;
            _vcBrowseScroll = content ? content.scrollTop : 0;
            _vcTpl = tpl; _vcView = 'detail'; renderVnComponents();
        };
        return card;
    }

    // ── ② 詳情：預覽 + 繼續編輯 + 複製/匯出 + 使用與設置 + 底部紅色刪除 ──
    function _vcRenderDetail(listEl) {
        const tpl = _vcTpl; if (!tpl) { _vcView = 'browse'; return renderVnComponents(); }
        const db = win.OS_DB;
        const safeTagId = (tpl.tagId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
        const previewHtml = (tpl.html || '').replace(/\{\{1\}\}/g, '參數A').replace(/\{\{2\}\}/g, '參數B');
        listEl.innerHTML = `
            <div class="swb-bar">
                <button class="swb-iconbtn" id="vc-back" type="button"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title">${_sgcEsc((tpl.title && String(tpl.title).trim()) || tpl.tagId || '未知')}</div>
            </div>
            <div class="vc-page">
                <div class="vc-set-row vc-enable-row"><span class="vc-set-label">啟用這個組件</span>
                    <label class="sgc-switch"><input type="checkbox" class="sgc-switch-input" id="vc-d-active"${tpl.isActive ? ' checked' : ''}><span class="sgc-switch-slider"></span></label>
                </div>
                <div class="studio-pv-tabs">
                    <button class="studio-pv active" data-pv="phone">手機</button>
                    <button class="studio-pv" data-pv="center">中間</button>
                    <button class="studio-pv" data-pv="full">全屏</button>
                </div>
                <div class="sgc-preview"><div class="studio-pv-box">
                    ${tpl.css ? `<style>${tpl.css}</style>` : ''}
                    <div class="vn-dynamic-panel-${safeTagId} vc-pv-panel">${previewHtml}</div>
                </div></div>
                <button class="swb-primary vc-full" id="vc-continue" type="button"><i class="fa-solid fa-pen-to-square"></i> 繼續編輯</button>
                <div class="vc-row2">
                    <button class="swb-secondary" id="vc-dup" type="button"><i class="fa-solid fa-copy"></i> 複製組件</button>
                    <button class="swb-secondary" id="vc-export" type="button"><i class="fa-solid fa-file-export"></i> 匯出</button>
                </div>
                <button class="vc-navrow" id="vc-settings" type="button"><span class="vc-navrow-ico"><i class="fa-solid fa-gear"></i></span><span class="vc-navrow-label">使用與設置</span><span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span></button>
                <div class="vc-delzone"><button class="vc-delbtn" id="vc-del" type="button"><i class="fa-solid fa-trash"></i> 刪除組件</button></div>
            </div>`;
        listEl.querySelector('#vc-back').onclick = () => { _vcView = 'browse'; renderVnComponents(); };
        listEl.querySelector('#vc-d-active').onchange = async (e) => { await _setComponentActive(tpl, e.target.checked); };
        listEl.querySelector('#vc-continue').onclick = () => {
            if (!confirm(`把 [${tpl.tagId}] 載回煉丹爐繼續編輯？\n\n會：\n• 清空當前對話\n• 把這個面板載入預覽\n• 之後在對話框打修改建議，AI 只會微調\n• 改完按「確定創建」會覆蓋這個面板\n\n確定嗎？`)) return;
            if (_vcStandalone) {   // 獨立區：編輯需要創作室編輯器→關浮層、開創作室、進編輯（沿用 openEditApp 模式）
                const root = _vcStandaloneRoot;
                if (_vcExit) _vcExit();
                try { launch(root, 'vn_ui'); } catch (e) {}   // 直接落製作面板編輯器，不經死首頁
                setTimeout(() => { try { _enterEditMode(tpl); } catch (e) { console.warn('[OS_STUDIO] 繼續編輯', e); } }, 60);
            } else {
                _enterEditMode(tpl);
            }
        };
        listEl.querySelector('#vc-dup').onclick = () => _vcDuplicate(tpl);
        listEl.querySelector('#vc-export').onclick = () => exportOneVnUiTemplate(tpl);
        listEl.querySelector('#vc-settings').onclick = () => { _vcView = 'settings'; renderVnComponents(); };
        listEl.querySelector('#vc-del').onclick = async () => {
            if (!confirm(`刪除組件 [${tpl.tagId}]？此操作無法復原。`)) return;
            await db.deleteUITemplate(tpl.id); await syncActiveTagsToLocal();
            if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
            try { await _removeTavernPanelArtifacts(tpl.tagId); } catch (e) {}   // 連酒館正則+主世界書殘留一起清，不留孤兒
            try { await _purgeLinkedPhoneApp(tpl.id); } catch (e) {}            // 連對應的手機 app + 資料一起清（共用＝整個移除）
            _vcTpl = null; _vcView = 'browse'; renderVnComponents();
        };
        _activatePreview(listEl, tpl, safeTagId);
    }

    async function _vcDuplicate(tpl) {
        const db = win.OS_DB;
        const copy = JSON.parse(JSON.stringify(tpl));
        delete copy.id;
        copy.isActive = false;   // 複本預設停用，避免兩個同 tag 撞在一起
        copy.title = `${(tpl.title && String(tpl.title).trim()) || tpl.tagId || '組件'} 複本`;
        const base = (tpl.tagId || 'tag');
        let nt = `${base}_copy`;
        try {
            const used = new Set((await db.getAllVNTagTemplates()).map(t => t.tagId));
            let i = 1; while (used.has(nt)) { i++; nt = `${base}_copy${i}`; }
        } catch (e) {}
        copy.tagId = nt;
        await db.saveVNTagTemplate(copy);
        _studioToast(`已複製成「${copy.title}」（預設停用，到設置開啟）`, 'success', '複製組件');
        _vcTpl = null; _vcView = 'browse'; renderVnComponents();
    }

    // 登場音效：讀素材設定的「音效目錄」base（優先 localStorage，studio 視窗的 VN_Config 未必載到值）
    function _sfxBase() {
        try { const c = JSON.parse(localStorage.getItem('vn_cfg_v4') || '{}'); if (c && c.sfx) return c.sfx; } catch (e) {}
        try { return (win.VN_Config && win.VN_Config.data && win.VN_Config.data.sfx) || ''; } catch (e) {}
        return '';
    }
    // 音效清單：直接讀「全域世界書」的「SFX音效清單」條目當唯一來源（VN 世界書掛全域、不掛當前聊天）。
    // 逐本找 comment 帶「SFX音效清單」或內容含 <音效_ID> 的條目，解析成分組。單一來源＝朋友只維護世界書一處。
    let _sfxListCache = null;
    function _parseSfxListContent(text) {
        const groups = []; let cur = null;
        String(text || '').split(/\r?\n/).forEach(raw => {
            const l = raw.trim();
            if (!l || l === '### SFX清单' || l === '<音效_ID>' || l === '</音效_ID>') return;
            if (l[0] === '#') { cur = { name: l.replace(/^#+\s*/, ''), ids: [] }; groups.push(cur); return; }
            if (!cur) { cur = { name: '音效', ids: [] }; groups.push(cur); }
            cur.ids.push(l);
        });
        return groups.length ? { groups } : null;
    }
    async function _loadSfxList() {
        if (_sfxListCache) return _sfxListCache;
        const TH = (window.parent || window).TavernHelper || window.TavernHelper;
        if (!TH || !TH.getLorebookEntries) return null;
        let books = [];
        try { if (TH.getGlobalWorldbookNames) books = TH.getGlobalWorldbookNames() || []; } catch (e) {}
        if (!books.length) { try { const s = TH.getLorebookSettings && TH.getLorebookSettings(); books = (s && s.selected_global_lorebooks) || []; } catch (e) {} }
        if (!books.length) { try { books = (TH.getLorebooks && TH.getLorebooks()) || []; } catch (e) {} }   // 保底：掃全部（仍靠條目名比對，找得到全域那本）
        for (const b of books) {
            let entries = [];
            try { entries = (await TH.getLorebookEntries(b)) || []; } catch (e) { continue; }
            const hit = entries.find(e => /SFX音效清單|SFX清单|音效_ID/.test(String(e.comment || '')))
                     || entries.find(e => String(e.content || '').includes('<音效_ID>'));
            if (hit) { const g = _parseSfxListContent(hit.content); if (g) { _sfxListCache = g; return g; } }
        }
        return null;
    }
    async function _populateAppearSfxSelect(sel, current) {
        const m = await _loadSfxList();
        sel.innerHTML = '<option value="">（無 — 不播）</option>';
        let found = false;
        if (m && Array.isArray(m.groups)) {
            m.groups.forEach(g => {
                const og = document.createElement('optgroup'); og.label = g.name || '';
                (g.ids || []).forEach(id => {
                    const o = document.createElement('option'); o.value = id; o.textContent = id;
                    if (id === current) { o.selected = true; found = true; }
                    og.appendChild(o);
                });
                sel.appendChild(og);
            });
        }
        if (current && !found) {   // 目前值不在清單（自訂/舊值）→ 補一個保留，不洗掉
            const o = document.createElement('option'); o.value = current; o.textContent = current + '（自訂）'; o.selected = true;
            sel.appendChild(o);
        }
        if (!m) {
            const o = document.createElement('option'); o.textContent = '（讀不到世界書「SFX音效清單」條目）'; o.disabled = true;
            sel.appendChild(o);
        }
    }

    // 面板字體選項：每款都繁簡成對（Win/Mac/iOS/Android 各補退路），混排時筆畫粗細才一致
    const _VC_FONTS = [
        { label: '跟隨組件', value: '' },
        { label: '黑體', value: "'Microsoft JhengHei','Microsoft YaHei','PingFang TC','PingFang SC','Noto Sans TC','Noto Sans SC',sans-serif" },
        { label: '明體／宋體', value: "'PMingLiU','SimSun','Songti TC','Songti SC','Noto Serif TC','Noto Serif SC',serif" },
        { label: '楷體', value: "'DFKai-SB','KaiTi','BiauKai','Kaiti TC','STKaiti',serif" },
    ];

    // ── ③ 使用與設置：把詳情頁的按鈕牆拆過來，分組整齊 ──
    function _vcRenderSettings(listEl) {
        const tpl = _vcTpl; if (!tpl) { _vcView = 'browse'; return renderVnComponents(); }
        const db = win.OS_DB;
        const safeFmt = (tpl.demoFormat || '無結構定義').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const phoneRec = (_vcAllPhoneApps || []).find(a => a && a.srcTplId === tpl.id);
        const phoneRow = (tpl.caps === 'display') ? '' : `
                    <div class="vc-set-row"><span class="vc-set-label"><i class="fa-solid fa-mobile-screen"></i> 裝到手機</span>
                        <label class="sgc-switch"><input type="checkbox" class="sgc-switch-input" id="vc-set-phone"${phoneRec ? ' checked' : ''}><span class="sgc-switch-slider"></span></label>
                    </div>`;
        listEl.innerHTML = `
            <div class="swb-bar">
                <button class="swb-iconbtn" id="vc-back" type="button"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title">使用與設置</div>
            </div>
            <div class="vc-page">
                <div class="vc-set-block"><div class="vc-set-blabel">歸到群組</div><div id="vc-set-groups"></div></div>
                <div class="vc-set-block"><div class="vc-set-blabel">觸發格式</div>
                    <div class="sgc-format-box">
                        <div class="sgc-format-text">${safeFmt}</div>
                        <textarea class="sgc-format-input vc-hide" id="vc-fmt-input">${_sgcEsc(tpl.demoFormat || '')}</textarea>
                        <div class="vc-fmt-actions">
                            <button class="swb-secondary btn-edit-fmt" type="button"><i class="fa-solid fa-pen"></i> 編輯</button>
                            <button class="swb-secondary btn-save-fmt vc-hide" type="button"><i class="fa-solid fa-floppy-disk"></i> 儲存</button>
                            <button class="swb-secondary btn-cancel-fmt vc-hide" type="button"><i class="fa-solid fa-xmark"></i> 取消</button>
                        </div>
                    </div>
                </div>
                <div class="vc-set-block"><div class="vc-set-blabel">注入方式</div>
                    <div class="vc-set-row"><span class="vc-set-label"><i class="fa-solid fa-key"></i> 關鍵字觸發</span>
                        <label class="sgc-switch"><input type="checkbox" class="sgc-switch-input" id="vc-set-kwmode"${tpl.injectMode === 'keyword' ? ' checked' : ''}><span class="sgc-switch-slider"></span></label>
                    </div>
                    <div class="sgc-format-box vc-kw-box${tpl.injectMode === 'keyword' ? '' : ' vc-hide'}">
                        <textarea class="sgc-format-input" id="vc-kw-input" placeholder="關鍵字用逗號分隔；正文最近 3 輪或你的輸入出現任一個，才注入這個面板。關掉＝常駐、每輪都注入。">${_sgcEsc((tpl.keywords || []).join('、'))}</textarea>
                        <div class="vc-fmt-actions">
                            <button class="swb-secondary btn-save-kw" type="button"><i class="fa-solid fa-floppy-disk"></i> 儲存關鍵字</button>
                        </div>
                    </div>
                </div>
                <div class="vc-set-block"><div class="vc-set-blabel">登場音效</div>
                    <div class="sgc-format-box">
                        <select class="set-select" id="vc-appear-sfx"><option value="">（載入中…）</option></select>
                        <div class="vc-fmt-actions">
                            <button class="swb-secondary btn-appear-try" type="button"><i class="fa-solid fa-play"></i> 試聽</button>
                        </div>
                    </div>
                </div>
                <div class="vc-set-block"><div class="vc-set-blabel">面板字體</div>
                    <div class="sgc-format-box">
                        <select class="set-select" id="vc-appear-font"></select>
                        <div class="vc-font-preview" id="vc-font-preview">繁體筆畫測試紋章編號　简体笔画测试纹章编号</div>
                    </div>
                </div>
                <div class="vc-set-block"><div class="vc-set-blabel">整合</div>
                    <button class="vc-navrow" id="vc-import-st" type="button"><span class="vc-navrow-ico"><i class="fa-solid fa-file-import"></i></span><span class="vc-navrow-label">注入酒館正則</span><span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span></button>
                    ${phoneRow}
                </div>
                <div class="vc-set-block"><div class="vc-set-blabel">進階</div>
                    <button class="vc-navrow" id="vc-raw" type="button"><span class="vc-navrow-ico"><i class="fa-solid fa-code"></i></span><span class="vc-navrow-label">編輯原碼</span><span class="swb-chev"><i class="fa-solid fa-chevron-right"></i></span></button>
                </div>
            </div>`;
        listEl.querySelector('#vc-back').onclick = () => { _vcView = 'detail'; renderVnComponents(); };
        listEl.querySelector('#vc-set-groups').appendChild(_buildGroupAssignRow(tpl));
        const fmtBox = listEl.querySelector('.sgc-format-box');
        const fmtText = fmtBox.querySelector('.sgc-format-text'), fmtInput = fmtBox.querySelector('.sgc-format-input');
        const bE = fmtBox.querySelector('.btn-edit-fmt'), bS = fmtBox.querySelector('.btn-save-fmt'), bC = fmtBox.querySelector('.btn-cancel-fmt');
        const setEditing = (on) => { fmtText.classList.toggle('vc-hide', on); bE.classList.toggle('vc-hide', on); fmtInput.classList.toggle('vc-hide', !on); bS.classList.toggle('vc-hide', !on); bC.classList.toggle('vc-hide', !on); };
        bE.onclick = () => setEditing(true);
        bC.onclick = () => { fmtInput.value = tpl.demoFormat || ''; setEditing(false); };
        bS.onclick = async () => { tpl.demoFormat = fmtInput.value; await db.saveVNTagTemplate(tpl); await syncActiveTagsToLocal(); _studioToast('已儲存觸發格式', 'success', '設置'); _vcRenderSettings(listEl); };
        listEl.querySelector('#vc-import-st').onclick = () => importToSillyTavern(tpl);
        const phoneInput = listEl.querySelector('#vc-set-phone');
        if (phoneInput) phoneInput.onchange = async (e) => { await _vcTogglePhone(tpl, e.target.checked); };
        // 注入方式：常駐 ⇄ 關鍵字觸發
        const kwModeChk = listEl.querySelector('#vc-set-kwmode'), kwBox = listEl.querySelector('.vc-kw-box');
        if (kwModeChk) kwModeChk.onchange = async (e) => {
            tpl.injectMode = e.target.checked ? 'keyword' : 'constant';
            if (kwBox) kwBox.classList.toggle('vc-hide', !e.target.checked);
            await db.saveVNTagTemplate(tpl); await syncActiveTagsToLocal();
        };
        const kwSave = listEl.querySelector('.btn-save-kw');
        if (kwSave) kwSave.onclick = async () => {
            const raw = (listEl.querySelector('#vc-kw-input') || {}).value || '';
            tpl.keywords = raw.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean).slice(0, 12);
            await db.saveVNTagTemplate(tpl); await syncActiveTagsToLocal();
            _studioToast('已儲存關鍵字（' + tpl.keywords.length + '）', 'success', '設置');
        };
        // 登場音效：分組下拉單（清單從音效目錄的 sfx_manifest.json 載入）。選空＝無聲、不預設。
        const appSel = listEl.querySelector('#vc-appear-sfx');
        if (appSel) {
            _populateAppearSfxSelect(appSel, tpl.appearSfx || '');
            appSel.onchange = async () => {
                tpl.appearSfx = appSel.value || '';
                await db.saveVNTagTemplate(tpl); await syncActiveTagsToLocal();
                _studioToast(tpl.appearSfx ? ('登場音效：' + tpl.appearSfx) : '已清除登場音效', 'success', '設置');
            };
        }
        const appTry = listEl.querySelector('.btn-appear-try');
        if (appTry) appTry.onclick = () => {
            const id = appSel ? appSel.value : '';
            if (!id) { _studioToast('先選一個音效', 'info', '試聽'); return; }
            const base = _sfxBase();
            if (!base) { _studioToast('素材設定還沒填「音效目錄」', 'warning', '試聽'); return; }
            try {
                const a = new Audio(base + id + '.mp3');   // 與 playSFX 同：base 已含尾斜線
                a.play().catch(() => _studioToast('播放失敗，確認音效目錄', 'warning', '試聽'));
            } catch (e) {}
        };
        // 面板字體：留空=跟隨組件自帶樣式。每個選項都是「繁體字體+同款簡體字體」成對的字體串，
        // 治 AI 吐簡體字時缺字退回系統預設、同一句話有細有粗的花版面（覆蓋時 !important 蓋過組件 CSS）。
        const fontSel = listEl.querySelector('#vc-appear-font');
        const fontPrev = listEl.querySelector('#vc-font-preview');
        if (fontSel) {
            const cur = tpl.appearFont || '';
            let found = false;
            _VC_FONTS.forEach(f => {
                const o = document.createElement('option');
                o.value = f.value; o.textContent = f.label;
                if (f.value === cur) { o.selected = true; found = true; }
                fontSel.appendChild(o);
            });
            if (cur && !found) {   // 目前值不在清單（自訂/舊值）→ 補一個保留，不洗掉
                const o = document.createElement('option'); o.value = cur; o.textContent = '（自訂）'; o.selected = true;
                fontSel.appendChild(o);
            }
            const _prevApply = () => { if (fontPrev) fontPrev.style.fontFamily = fontSel.value || ''; };
            _prevApply();
            fontSel.onchange = async () => {
                tpl.appearFont = fontSel.value || '';
                _prevApply();
                await db.saveVNTagTemplate(tpl); await syncActiveTagsToLocal();
                const lbl = fontSel.options[fontSel.selectedIndex];
                _studioToast(tpl.appearFont ? ('面板字體：' + (lbl ? lbl.textContent : '')) : '已改回跟隨組件', 'success', '設置');
            };
        }
        listEl.querySelector('#vc-raw').onclick = () => openRawEditModal(tpl);
    }
    async function _vcTogglePhone(tpl, want) {
        const db = win.OS_DB;
        const rec = (_vcAllPhoneApps || []).find(a => a && a.srcTplId === tpl.id);
        try {
            if (rec && !want) {
                await db.deletePhoneApp(rec.id);
                if (win.VoidPhoneShell && win.VoidPhoneShell.removeApp) win.VoidPhoneShell.removeApp(rec.id);
            } else if (!rec && want) {
                const r = { name: tpl.tagId || '面板', emoji: '🧩', iconUrl: '', html: _templateToPhoneHtml(tpl), source: 'studio', srcTplId: tpl.id };
                const nid = await db.savePhoneApp(r);
                if (win.VoidPhoneShell && win.VoidPhoneShell.addApp) win.VoidPhoneShell.addApp({ id: nid, name: r.name, emoji: r.emoji, iconUrl: '' });
            }
            _vcAllPhoneApps = db.getAllPhoneApps ? ((await db.getAllPhoneApps()) || []) : _vcAllPhoneApps;
        } catch (e) { console.error('[studio] 裝手機切換失敗', e); }
    }

    // ── ④ 選擇並打包：多選 + 全選 + 驗證並打包（重用 _downloadVnUiPack）──
    async function _vcRenderPackage(listEl) {
        const db = win.OS_DB;
        let templates = [];
        try { templates = (await db.getAllVNTagTemplates()).filter(t => t && t.panelType !== '純應用'); } catch (e) {}
        const allSel = templates.length > 0 && templates.every(t => _vcPackSel.has(t.id));
        listEl.innerHTML = `
            <div class="swb-bar">
                <button class="swb-iconbtn" id="vc-back" type="button"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="swb-bar-title">選擇並打包</div>
                <button class="swb-iconbtn" id="vc-selall" type="button" title="全選/全不選">${allSel ? '<i class="fa-solid fa-square-check"></i>' : '<i class="fa-solid fa-square vc-uncheck"></i>'}</button>
            </div>
            <div class="vc-page"><div class="vc-list" id="vc-pack-list"></div></div>
            <div class="vc-pack-foot">
                <button class="vc-pack-clear" id="vc-pack-clear" type="button"><i class="fa-solid fa-trash"></i> 清空全部</button>
                <span class="vc-pack-count" id="vc-pack-count"></span>
                <button class="swb-primary" id="vc-pack-go" type="button"><i class="fa-solid fa-circle-check"></i> 驗證並打包</button>
            </div>`;
        const list = listEl.querySelector('#vc-pack-list');
        if (!templates.length) {
            list.innerHTML = '<div class="vc-empty">沒有可打包的組件。</div>';
        } else {
            templates.forEach(tpl => {
                const safeTagId = (tpl.tagId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
                const on = _vcPackSel.has(tpl.id);
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'vc-card vc-pack-row' + (on ? ' on' : '');
                row.innerHTML = `<span class="vc-pack-check">${on ? '<i class="fa-solid fa-square-check"></i>' : '<i class="fa-solid fa-square vc-uncheck"></i>'}</span>
                    <div class="vc-card-main"><div class="vc-card-title">${_sgcEsc((tpl.title && String(tpl.title).trim()) || tpl.tagId || '未知')}</div></div>`;
                row.insertBefore(_vcThumbBox(tpl, safeTagId), row.children[1]);
                row.onclick = () => { if (_vcPackSel.has(tpl.id)) _vcPackSel.delete(tpl.id); else _vcPackSel.add(tpl.id); _vcRenderPackage(listEl); };
                list.appendChild(row);
            });
            _vcObserveThumbs(list);
        }
        listEl.querySelector('#vc-pack-count').textContent = `已選擇 ${_vcPackSel.size} 個組件`;
        const go = listEl.querySelector('#vc-pack-go'); go.disabled = _vcPackSel.size === 0;
        listEl.querySelector('#vc-back').onclick = () => { _vcView = 'browse'; renderVnComponents(); };
        listEl.querySelector('#vc-selall').onclick = () => { if (allSel) _vcPackSel.clear(); else templates.forEach(t => _vcPackSel.add(t.id)); _vcRenderPackage(listEl); };
        // 🗑️ 清空全部 VN 組件：逐筆走跟單顆刪除同套清理(酒館正則/世界書殘留+連動手機app)，不留孤兒
        listEl.querySelector('#vc-pack-clear').onclick = async () => {
            if (!templates.length) { _studioToast('目前沒有組件可清空。', 'warning', '清空'); return; }
            if (!confirm(`確定刪除全部 ${templates.length} 個 VN 組件？\n\n建議先「驗證並打包」匯出備份再清。\n此動作會一併清掉注入酒館的正則／世界書殘留與連動的手機 app，無法復原。`)) return;
            for (const t of templates) {
                try { await db.deleteUITemplate(t.id); } catch (e) {}
                try { await _removeTavernPanelArtifacts(t.tagId); } catch (e) {}
                try { await _purgeLinkedPhoneApp(t.id); } catch (e) {}
            }
            try { await syncActiveTagsToLocal(); } catch (e) {}
            if (win.VN_DynamicParser) { try { await win.VN_DynamicParser.init(); } catch (e) {} }
            _vcPackSel.clear();
            _studioToast(`🗑️ 已清空 ${templates.length} 個 VN 組件。`, 'success', '清空');
            _vcView = 'browse'; renderVnComponents();
        };
        go.onclick = () => {
            if (!_vcPackSel.size) return;
            const sel = templates.filter(t => _vcPackSel.has(t.id));
            const today = new Date().toISOString().slice(0, 10);
            _downloadVnUiPack(sel, `aurelia-vn-ui-pack-${today}.json`);
            _studioToast(`已打包 ${sel.length} 個組件，已下載到本機。`, 'success', '打包');
        };
    }

    // ════════════════════════════════════════════════════════════════
    // VN 組件「群組」：群組定義存 localStorage；成員關係掛在組件 tpl.groupIds[]（可掛多組）。
    //   群組＝標籤；批次開關＝把成員 isActive 一起開/關（重用 syncActiveTagsToLocal 管線）。
    //   不綁世界觀自動套，全手動（Rae 拍板）。
    // ════════════════════════════════════════════════════════════════
    const VN_GROUPS_KEY = 'vn_component_groups';
    const LOBBY_GROUP_ID = 'g_lobby';   // 固定 id 的「大廳」內建組：組件丟進來＝大廳顯示(瀅瀅/愛麗絲可調用)，取代舊的每組件開關
    // _sgcEsc：HTML 轉義留核心 os_studio.js（全拆檔子模組共用，_b 橋成員，見檔頭）
    function _loadGroups() {
        let arr;
        try { arr = JSON.parse(localStorage.getItem(VN_GROUPS_KEY) || '[]') || []; } catch (e) { arr = []; }
        if (!Array.isArray(arr)) arr = [];
        if (!arr.some(g => g && g.id === LOBBY_GROUP_ID)) { arr.unshift({ id: LOBBY_GROUP_ID, name: '大廳', builtin: true }); _saveGroups(arr); }   // 內建大廳組永遠在
        return arr;
    }
    function _saveGroups(arr) { try { localStorage.setItem(VN_GROUPS_KEY, JSON.stringify(arr || [])); } catch (e) {} }
    // 一次性遷移：舊「大廳顯示」開關(lobbyEnabled) → 丟進大廳組、清掉舊旗標（之後成員關係為唯一真相）
    async function _migrateLobbyFlag(tpls) {
        if (localStorage.getItem('vn_lobby_group_migrated') === '1') return;
        try {
            const db = win.OS_DB;
            const list = tpls || (db && db.getAllVNTagTemplates ? await db.getAllVNTagTemplates() : []);
            for (const t of (list || [])) {
                if (t && t.lobbyEnabled) {
                    const ids = Array.isArray(t.groupIds) ? t.groupIds : [];
                    if (!ids.includes(LOBBY_GROUP_ID)) ids.push(LOBBY_GROUP_ID);
                    t.groupIds = ids; t.lobbyEnabled = false;
                    if (db && db.saveVNTagTemplate) await db.saveVNTagTemplate(t);
                }
            }
            localStorage.setItem('vn_lobby_group_migrated', '1');
        } catch (e) {}
    }
    function _newGroupId() { return 'g_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); }
    function _tplGroupIds(tpl) { return Array.isArray(tpl.groupIds) ? tpl.groupIds : []; }

    async function _setComponentActive(tpl, active) {
        const db = win.OS_DB; if (!db) return;
        tpl.isActive = !!active;
        await db.saveVNTagTemplate(tpl);
        await syncActiveTagsToLocal();
        if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
    }
    async function _setGroupActive(members, active) {
        const db = win.OS_DB; if (!db) return;
        for (const t of members) { if (t.isActive !== active) { t.isActive = active; await db.saveVNTagTemplate(t); } }
        await syncActiveTagsToLocal();
        if (win.VN_DynamicParser) await win.VN_DynamicParser.init();
    }
    function _groupState(members) {
        if (!members.length) return 'empty';
        const on = members.filter(t => t.isActive).length;
        return on === 0 ? 'off' : (on === members.length ? 'on' : 'partial');
    }

    function _createGroup() {
        const name = (prompt('新群組名稱（例：古代 / 現代 / 賽博龐克）') || '').trim();
        if (!name) return;
        const groups = _loadGroups();
        const g = { id: _newGroupId(), name };
        groups.push(g);
        _saveGroups(groups);
        _vcView = 'browse';
        _openGroupManage(g);   // 建完直接開「指派成員」勾選面板，一次把組件打勾歸組，免得一個個進組件設置頁
    }

    // 群組管理 modal：改名 / 指派成員（勾選哪些組件屬於本組）/ 刪除（退回未分組、不刪組件）
    async function _openGroupManage(group) {
        const doc = win.document || document;
        const old = doc.getElementById('sgc-group-modal'); if (old) old.remove();
        const db = win.OS_DB;
        let tpls = [];
        try { tpls = (await db.getAllVNTagTemplates()).filter(t => t && t.panelType !== '純應用'); } catch (e) {}
        const rows = tpls.map(t => {
            const inG = _tplGroupIds(t).includes(group.id);
            const nm = (t.title && String(t.title).trim()) || t.tagId || '未知';
            return `<label class="sgc-assign-row"><input type="checkbox" data-tpl-id="${_sgcEsc(t.id)}"${inG ? ' checked' : ''}><span>${_sgcEsc(nm)}</span></label>`;
        }).join('') || '<div class="sgc-folder-empty">沒有組件</div>';
        const modal = doc.createElement('div');
        modal.id = 'sgc-group-modal';
        modal.className = 'sgc-modal';
        modal.innerHTML = `
            <div class="sgc-modal-card">
                <div class="sgc-modal-title"><i class="fa-solid fa-layer-group"></i> 群組管理</div>
                <div class="sgc-modal-row">
                    <input class="sgc-modal-name" type="text" value="${_sgcEsc(group.name)}" placeholder="群組名稱">
                    <button class="sgc-mini-btn" id="sgc-grp-rename" type="button">改名</button>
                </div>
                <div class="sgc-modal-sub">指派成員（勾選＝屬於這組；組件可同時屬於多組）</div>
                <div class="sgc-assign-list">${rows}</div>
                <div class="sgc-modal-actions">
                    <button class="sgc-mini-btn danger" id="sgc-grp-del" type="button"><i class="fa-solid fa-trash"></i> 刪除群組</button>
                    <button class="sgc-mini-btn" id="sgc-grp-close" type="button">關閉</button>
                </div>
            </div>`;
        (doc.body || doc.documentElement).appendChild(modal);
        const close = () => { modal.remove(); renderVnComponents(); };
        modal.addEventListener('click', e => { if (e.target === modal) close(); });
        modal.querySelector('#sgc-grp-close').onclick = close;
        modal.querySelector('#sgc-grp-rename').onclick = () => {
            const nn = (modal.querySelector('.sgc-modal-name').value || '').trim();
            if (!nn) return;
            const groups = _loadGroups(); const g = groups.find(x => x.id === group.id); if (g) { g.name = nn; _saveGroups(groups); }
            close();
        };
        modal.querySelector('#sgc-grp-del').onclick = async () => {
            if (!confirm(`刪除群組「${group.name}」？\n組件不會被刪，只會退回未分組。`)) return;
            _saveGroups(_loadGroups().filter(x => x.id !== group.id));
            for (const t of tpls) { const gids = _tplGroupIds(t); if (gids.includes(group.id)) { t.groupIds = gids.filter(id => id !== group.id); await db.saveVNTagTemplate(t); } }
            _vcFilterGid = 'all';
            close();
        };
        modal.querySelectorAll('.sgc-assign-row input').forEach(cb => cb.onchange = async () => {
            const tpl = tpls.find(t => t.id === cb.getAttribute('data-tpl-id')); if (!tpl) return;
            let gids = _tplGroupIds(tpl);
            if (cb.checked) { if (!gids.includes(group.id)) gids = gids.concat(group.id); }
            else gids = gids.filter(x => x !== group.id);
            tpl.groupIds = gids;
            await db.saveVNTagTemplate(tpl);
        });
    }

    // 設置頁用：這個組件「歸到哪些群組」的多選 chip 列（寫 tpl.groupIds）
    function _buildGroupAssignRow(tpl) {
        const wrap = document.createElement('div');
        wrap.className = 'sgc-grouprow';
        const groups = _loadGroups();
        if (!groups.length) {
            wrap.innerHTML = '<span class="sgc-grouprow-empty">還沒有群組，回瀏覽層用標籤列的「＋ 群組」新增</span>';
            return wrap;
        }
        const gids = _tplGroupIds(tpl);
        wrap.innerHTML = groups.map(g =>
            `<label class="sgc-grouptag"><input type="checkbox" data-gid="${_sgcEsc(g.id)}"${gids.includes(g.id) ? ' checked' : ''}><span>${_sgcEsc(g.name)}</span></label>`
        ).join('');
        wrap.querySelectorAll('input').forEach(cb => cb.onchange = async () => {
            const gid = cb.getAttribute('data-gid');
            let cur = _tplGroupIds(tpl);
            if (cb.checked) { if (!cur.includes(gid)) cur = cur.concat(gid); }
            else cur = cur.filter(x => x !== gid);
            tpl.groupIds = cur;
            await win.OS_DB.saveVNTagTemplate(tpl);
        });
        return wrap;
    }

    // ============================================================
    // === VN UI 展廳：匯出／匯入「包」（把模板搬到別台裝置的酒館，非奧瑞亞手機殼）===
    //   匯出 = 打包成 .json 下載；匯入 = 讀檔逐筆寫回，同 tagId 覆蓋更新、新的就新增。
    // ============================================================
    // _studioToast：toast 視覺回饋留核心 os_studio.js（核心煉丹/變數工坊也在用，_b 橋成員，見檔頭）

    function _downloadVnUiPack(templates, filename) {
        const pack = {
            type: 'aurelia-vn-ui-pack',
            version: 1,
            exportedAt: new Date().toISOString(),
            count: templates.length,
            templates: templates
        };
        const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (e) {} a.remove(); }, 0);
    }

    // exportAllVnUiPack 已移除：整包匯出改走打包頁「全選 → 驗證並打包」（_vcRenderPackage）

    function exportOneVnUiTemplate(tpl) {
        if (!tpl) return;
        try {
            const safe = ((tpl.tagId || 'panel').replace(/[^a-zA-Z0-9_-]/g, '')) || 'panel';
            const fname = `aurelia-vn-ui-${safe}.json`;
            _downloadVnUiPack([tpl], fname);
            _studioToast(`✅ 已匯出面板「${tpl.tagId || safe}」，已下載到本機：${fname}`, 'success', '匯出');
        } catch (e) { _studioToast('匯出失敗：' + ((e && e.message) || e), 'error', '匯出'); }
    }

    async function importVnUiPack(file) {
        const db = win.OS_DB || window.OS_DB;
        if (!db || typeof db.saveVNTagTemplate !== 'function') { _studioToast('找不到資料庫，無法匯入。', 'error', '匯入包'); return; }
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const list = Array.isArray(data) ? data : (Array.isArray(data.templates) ? data.templates : null);
            if (!list || !list.length) { _studioToast('這個檔案裡找不到面板資料，不是有效的匯出包。', 'warning', '匯入包'); return; }
            // 以 tagId 去重：同 tagId 覆蓋更新、新的就新增
            const existing = await db.getAllVNTagTemplates();
            const byTag = {};
            existing.forEach(t => { if (t && t.tagId) byTag[t.tagId] = t; });
            let added = 0, updated = 0;
            for (const raw of list) {
                if (!raw || typeof raw !== 'object') continue;
                const tpl = JSON.parse(JSON.stringify(raw));
                const hit = tpl.tagId && byTag[tpl.tagId];
                if (hit) { tpl.id = hit.id; updated++; }   // 蓋掉既有同名
                else { delete tpl.id; added++; }           // 新增 → saveVNTagTemplate 自動產 id
                await db.saveVNTagTemplate(tpl);
            }
            await syncActiveTagsToLocal();
            if (win.VN_DynamicParser) { try { await win.VN_DynamicParser.init(); } catch (e) {} }
            _vcView = 'browse'; renderVnComponents();
            _studioToast(`✅ 匯入完成：新增 ${added} 個、覆蓋更新 ${updated} 個。`, 'success', '匯入包');
        } catch (e) { _studioToast('匯入失敗：' + ((e && e.message) || e), 'error', '匯入包'); }
    }

    function _wireVnUiPackButtons() {
        const impBtn = document.getElementById('studio-import-pack-btn');
        const fileInput = document.getElementById('studio-import-pack-file');
        if (impBtn && fileInput) {
            impBtn.onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                const f = e.target.files && e.target.files[0];
                if (f) importVnUiPack(f);
                e.target.value = '';   // 清掉，讓同一檔可重複選
            };
        }
    }

    // 給「應用工坊 · 我的應用」的「放進大廳」鈕用（核心 OS_STUDIO.toggleAppLobby 懶委派到這；靠 srcTplId 操作底稿）
    async function toggleAppLobby(tplId) {
        const tpl = await _getTplById(tplId);
        if (!tpl) return null;
        _loadGroups();   // 確保大廳組存在
        const ids = Array.isArray(tpl.groupIds) ? tpl.groupIds.slice() : [];
        const i = ids.indexOf(LOBBY_GROUP_ID);
        if (i >= 0) ids.splice(i, 1); else ids.push(LOBBY_GROUP_ID);   // 進大廳組=開；移出=關
        tpl.groupIds = ids; tpl.lobbyEnabled = false;   // 舊旗標退役，成員關係為準
        try { await win.OS_DB.saveVNTagTemplate(tpl); await syncActiveTagsToLocal(); } catch (e) {}
        return ids.includes(LOBBY_GROUP_ID);
    }

    // ── 對外入口：核心（tab 切換/openRawEditModal/OS_STUDIO 對外方法）懶解析呼叫 ──
    win.OS_STUDIO_VC = { loadStudioGallery, openVnComponents, exportOneVnUiTemplate, toggleAppLobby };
})();
