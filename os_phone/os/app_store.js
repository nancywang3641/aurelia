// os_phone/os/app_store.js
// 🛒 應用商店：手機殼裡「貼上匯入」或「開創作室生成」完整 HTML 功能型 app，安裝到桌面。
// UI：首頁總覽（AI生成→OS_STUDIO / 匯入）+ 匯入 view + 我的應用 view + 底部 nav。
(function () {
    'use strict';
    const win = window;
    const INSTALLED_KEY = 'aurelia_phone_apps';      // 與 phone_shell.js 同 key：[{id,name,emoji,iconUrl}]
    const OPENED_KEY = 'aurelia_app_opened';         // {id: timestamp} —— 最近使用，phone_shell 開 app 時寫
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _loadList() { try { return JSON.parse(win.localStorage.getItem(INSTALLED_KEY)) || []; } catch (e) { return []; } }
    function _saveList(list) { try { win.localStorage.setItem(INSTALLED_KEY, JSON.stringify(list)); } catch (e) {} }
    function _loadOpened() { try { return JSON.parse(win.localStorage.getItem(OPENED_KEY)) || {}; } catch (e) { return {}; } }
    function _markOpened(id) { try { var m = _loadOpened(); m[id] = Date.now(); win.localStorage.setItem(OPENED_KEY, JSON.stringify(m)); } catch (e) {} }
    function _relTime(ts) {
        if (!ts) return '尚未使用';
        var d = Date.now() - ts, m = 60000, h = 3600000, day = 86400000;
        if (d < m) return '剛剛使用';
        if (d < h) return Math.floor(d / m) + ' 分鐘前';
        if (d < day) return Math.floor(d / h) + ' 小時前';
        return Math.floor(d / day) + ' 天前';
    }
    function _toast(c, msg) {
        const t = c.querySelector('#as-toast'); if (!t) return;
        t.textContent = msg; t.classList.add('show');
        clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
    }

    // 素材圖：GPT 工坊插畫，host 在獨立 sound-files 素材庫（code repo 有 jsdelivr 50MB 上限、aseets 不追蹤）
    const ASSET_BASE = 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/studio-ui/';
    const ASSET_MAP = {
        'ai-icon': 'workshop-ai.png',       // AI 生成應用（機器人寫字）
        'im-icon': 'workshop-import.png',   // 匯入應用（資料箱）
        'vn-icon': 'studio-panel.png'       // VN 劇情面板（卷軸面板）
    };
    function _applyAssets(c) {
        c.querySelectorAll('[data-asset]').forEach(function (img) {
            var k = img.dataset.asset;
            if (!ASSET_MAP[k]) { img.remove(); return; }            // 沒對應素材 → 拿掉，不留破圖
            img.onerror = function () { img.classList.add('ws-img-broken'); };   // 載入失敗也隱藏（卡片文字照常可用）
            img.src = ASSET_BASE + ASSET_MAP[k];
        });
    }

    const STORE_HTML =
        '<div class="ws-app">'
      +   '<div class="ws-views">'
      // ── 首頁 ──
      +     '<div class="ws-view active" data-view="home">'
      +       '<div class="ws-home-hd"><button class="ws-back ws-home-back" type="button" title="返回桌面"><i class="fa-solid fa-chevron-left"></i></button><div class="ws-home-hd-tx"><div class="ws-home-title">應用工坊 <i class="fa-solid fa-wand-magic-sparkles ws-spark"></i></div><div class="ws-home-sub">創造屬於你的專屬應用</div></div></div>'
      +       '<button class="ws-card ws-card-ai" data-go="workshop" type="button"><img class="ws-card-ic" data-asset="ai-icon" alt=""><span class="ws-card-tx"><span class="ws-card-t">AI 生成應用</span><span class="ws-card-d">描述想法，AI 幫你生成專屬應用</span></span><span class="ws-card-go"><i class="fa-solid fa-chevron-right"></i></span></button>'
      +       '<button class="ws-card ws-card-im" data-go="import" type="button"><img class="ws-card-ic" data-asset="im-icon" alt=""><span class="ws-card-tx"><span class="ws-card-t">匯入應用</span><span class="ws-card-d">貼上現成 HTML，快速安裝使用</span></span><span class="ws-card-go"><i class="fa-solid fa-chevron-right"></i></span></button>'
      +       '<button class="ws-card ws-card-vn" data-go="workshop" type="button"><img class="ws-card-ic" data-asset="vn-icon" alt=""><span class="ws-card-tx"><span class="ws-card-t">VN 劇情面板</span><span class="ws-card-d">用 AI 打造專屬劇情面板，存進創作室展廳隨時取用</span></span><span class="ws-card-go"><i class="fa-solid fa-chevron-right"></i></span></button>'
      +       '<div class="ws-sec-row"><span class="ws-sec-t">我的應用</span><button class="ws-sec-more" data-go="mine" type="button">查看全部 <i class="fa-solid fa-chevron-right"></i></button></div>'
      +       '<div class="ws-home-mine" id="ws-home-mine"></div>'
      +     '</div>'
      // ── 匯入 ──
      +     '<div class="ws-view" data-view="import">'
      +       '<div class="ws-vhd"><button class="ws-back" data-go="home" type="button"><i class="fa-solid fa-chevron-left"></i></button><span class="ws-vhd-t">匯入應用</span></div>'
      +       '<div class="ws-vbody">'
      +         '<div class="ws-hero"><img class="ws-hero-img ws-hero-sm" data-asset="im-icon" alt=""></div>'
      +         '<div class="ws-field-lab">應用名稱</div>'
      +         '<input class="ws-input" id="as-im-name" type="text" placeholder="例：恐怖電台">'
      +         '<div class="ws-field-lab">圖標 emoji</div>'
      +         '<input class="ws-input ws-emoji" id="as-im-emoji" type="text" maxlength="2" placeholder="📦">'
      +         '<div class="ws-field-lab">貼上完整 HTML（或上傳 .html 檔）</div>'
      +         '<label class="ws-file-btn" for="as-im-file"><i class="fa-solid fa-folder-open"></i> 選擇 .html 檔</label><input class="ws-file" id="as-im-file" type="file" accept=".html,.htm,text/html">'
      +         '<textarea class="ws-ta ws-ta-code" id="as-im-html" placeholder="&lt;!DOCTYPE html&gt; ... &lt;/html&gt;"></textarea>'
      +         '<button class="ws-btn ws-btn-line" id="as-im-prev-btn" type="button">預覽</button>'
      +         '<div class="ws-prev-wrap hidden" id="as-im-prev-wrap"><div class="ws-prev-lab">預覽</div><div class="ws-prev" id="as-im-prev"></div></div>'
      +         '<button class="ws-btn ws-btn-ok" id="as-im-install" type="button">安裝到桌面</button>'
      +       '</div>'
      +     '</div>'
      // ── 我的應用 ──
      +     '<div class="ws-view" data-view="mine">'
      +       '<div class="ws-vhd"><button class="ws-back" data-go="home" type="button"><i class="fa-solid fa-chevron-left"></i></button><span class="ws-vhd-t">我的應用</span></div>'
      +       '<div class="ws-vbody"><div class="ws-mine-list" id="as-mine-list"></div></div>'
      +     '</div>'
      // ── app 操作詳情（第二層：從我的應用點一條進來，換頁、不摺疊）──
      +     '<div class="ws-view" data-view="appdetail">'
      +       '<div class="ws-vhd"><button class="ws-back" data-go="mine" type="button"><i class="fa-solid fa-chevron-left"></i></button><span class="ws-vhd-t" id="as-detail-title">應用</span></div>'
      +       '<div class="ws-vbody"><div id="as-detail-body"></div></div>'
      +     '</div>'
      +   '</div>'
      // ── 底部 nav ──
      +   '<div class="ws-nav">'
      +     '<button class="ws-nav-b active" data-go="home" type="button"><span class="ws-nav-ic"><i class="fa-solid fa-house"></i></span><span class="ws-nav-t">首頁</span></button>'
      +     '<button class="ws-nav-b" data-go="mine" type="button"><span class="ws-nav-ic"><i class="fa-solid fa-table-cells-large"></i></span><span class="ws-nav-t">我的</span></button>'
      +   '</div>'
      // ── 安裝成功覆蓋 + toast ──
      +   '<div class="ws-success hidden" id="ws-success"><div class="ws-suc-check"><i class="fa-solid fa-check"></i></div><div class="ws-suc-t">安裝成功！</div><div class="ws-suc-name"></div></div>'
      +   '<div class="ws-toast" id="as-toast"></div>'
      + '</div>';

    function launch(c) {
        if (!c) return;
        c.innerHTML = STORE_HTML;
        _applyAssets(c);
        // 首頁返回鈕：退出工坊 app 回手機桌面（phone_shell 已把 PhoneSystem.goHome 接成回桌面）
        var _homeBack = c.querySelector('.ws-home-back');
        if (_homeBack) _homeBack.addEventListener('click', function () {
            if (win.PhoneSystem && win.PhoneSystem.goHome) win.PhoneSystem.goHome();
            else if (win.VoidPhoneShell && win.VoidPhoneShell.home) win.VoidPhoneShell.home();
        });
        // 導覽：所有 data-go（卡片/返回/查看全部/底部 nav）
        c.querySelectorAll('[data-go]').forEach(function (b) {
            b.addEventListener('click', function () { _go(c, b.dataset.go); });
        });
        // 「AI 生成應用」入口改開創作室（取代一次性工坊）
        (function () {
            var openStudio = function (e) {
                if (e) e.stopPropagation();
                if (win.OS_STUDIO && win.OS_STUDIO.launch) win.OS_STUDIO.launch(c);
                else _toast(c, '❌ 創作室未載入');
            };
            c.querySelectorAll('[data-go="workshop"]').forEach(function (el) {
                el.setAttribute('data-go', '');            // 解除舊路由，避免 _go 切到死的 workshop view
                el.addEventListener('click', openStudio);
            });
        })();
        _bindImport(c);
        renderHomeMine(c);
    }

    // 切換視圖
    function _go(c, view) {
        // 空字串／不存在的目標（例：AI生成卡 data-go 被 openStudio 解除成 ''，但通用監聽仍會帶 '' 進來）
        // 不可硬切——否則所有 .ws-view 都被關掉，開完創作室返回工坊就整片空白（nav 還在、內容沒了）。
        if (!view || !c.querySelector('.ws-view[data-view="' + view + '"]')) return;
        c.querySelectorAll('.ws-view').forEach(function (v) { v.classList.toggle('active', v.dataset.view === view); });
        c.querySelectorAll('.ws-nav-b').forEach(function (b) { b.classList.toggle('active', b.dataset.go === view); });
        var body = c.querySelector('.ws-view[data-view="' + view + '"] .ws-vbody') || c.querySelector('.ws-view[data-view="' + view + '"]');
        if (body) body.scrollTop = 0;
        if (view === 'mine') renderMine(c);
        else if (view === 'home') renderHomeMine(c);
    }

    // ── 安裝 / 卸載（共用）──
    async function _install(c, rec) {
        if (!win.OS_DB || !win.OS_DB.savePhoneApp) { _toast(c, '❌ 儲存層未就緒'); return; }
        const id = await win.OS_DB.savePhoneApp(rec);
        rec.id = id;
        const list = _loadList().filter(function (m) { return m.id !== id; });
        list.push({ id: id, name: rec.name, emoji: rec.emoji, iconUrl: rec.iconUrl || '' });
        _saveList(list);
        _markOpened(id);
        if (win.VoidPhoneShell && win.VoidPhoneShell.addApp) win.VoidPhoneShell.addApp({ id: id, name: rec.name, emoji: rec.emoji, iconUrl: rec.iconUrl || '' });
        _showSuccess(c, rec.name);
    }
    async function _uninstall(id, c) {
        if (win.OS_DB && win.OS_DB.deletePhoneApp) await win.OS_DB.deletePhoneApp(id);
        _saveList(_loadList().filter(function (m) { return m.id !== id; }));
        if (win.VoidPhoneShell && win.VoidPhoneShell.removeApp) win.VoidPhoneShell.removeApp(id);
        renderMine(c);
    }
    function _showSuccess(c, name) {
        var ov = c.querySelector('#ws-success'); if (!ov) { _go(c, 'mine'); return; }
        var nm = ov.querySelector('.ws-suc-name'); if (nm) nm.textContent = '「' + (name || 'App') + '」已安裝到你的桌面';
        ov.classList.remove('hidden');
        setTimeout(function () { ov.classList.add('hidden'); _go(c, 'mine'); }, 1600);
    }

    // ── 我的應用 列：第一層只乾淨一條（圖示＋名稱＋›），點整列換頁進操作頁，不摺疊 ──
    function _mineRow(c, a, opened) {
        const row = document.createElement('div');
        row.className = 'ws-mine-row ws-mine-row-clean';
        row.innerHTML =
            '<span class="ws-mine-ic">' + _esc(a.emoji || '📦') + '</span>'
          + '<span class="ws-mine-info"><span class="ws-mine-name">' + _esc(a.name || 'App') + '</span><span class="ws-mine-sub">' + _esc(_relTime(opened[a.id])) + '</span></span>'
          + '<span class="ws-mine-go"><i class="fa-solid fa-chevron-right"></i></span>';
        row.addEventListener('click', function () { _openAppDetail(c, a); });
        return row;
    }

    // ── 第二層：單一 app 操作頁（換頁到 appdetail），操作分組成乾淨的列，記憶用 toggle ──
    function _openAppDetail(c, a) {
        const body = c.querySelector('#as-detail-body');
        const titleEl = c.querySelector('#as-detail-title');
        if (!body) return;
        if (titleEl) titleEl.textContent = (a.emoji ? a.emoji + ' ' : '') + (a.name || '應用');
        body.innerHTML = '';
        const isStudio = !!a.srcTplId;
        const S = win.OS_STUDIO || {};

        const mkRow = function (icon, label, onclick, opts) {
            opts = opts || {};
            const r = document.createElement('div');
            r.className = 'ws-act-row' + (opts.danger ? ' danger' : '');
            const right = opts.toggle
                ? '<span class="ws-act-tog' + (opts.on ? ' on' : '') + '"><span class="ws-act-knob"></span></span>'
                : '<span class="ws-act-go">' + (opts.noChev ? '' : '<i class="fa-solid fa-chevron-right"></i>') + '</span>';
            r.innerHTML = '<i class="fa-solid ' + icon + ' ws-act-ico"></i><span class="ws-act-label">' + _esc(label) + '</span>' + right;
            if (onclick) r.addEventListener('click', onclick);
            return r;
        };
        const mkGroup = function (rows) {
            const g = document.createElement('div');
            g.className = 'ws-act-group';
            rows.filter(Boolean).forEach(function (r) { g.appendChild(r); });
            if (g.children.length) body.appendChild(g);
        };

        mkGroup([
            isStudio ? mkRow('fa-pen-to-square', '編輯', function () { if (S.openEditApp) S.openEditApp(a.srcTplId, c); else _toast(c, '創作室未就緒'); }) : null,
            mkRow('fa-code', '原始碼', function () {
                const ta = c.querySelector('#as-im-html'); if (ta) ta.value = a.html || '';
                const nmI = c.querySelector('#as-im-name'); if (nmI) nmI.value = a.name || '';
                _go(c, 'import'); _toast(c, '原始碼已載入「匯入」框，可全選複製');
            }),
            mkRow('fa-pen', '改名', async function () {
                const nm = prompt('新名稱', a.name || ''); if (nm == null) return;
                a.name = nm.trim() || a.name; await win.OS_DB.savePhoneApp(a); _syncMeta(a);
                if (titleEl) titleEl.textContent = (a.emoji ? a.emoji + ' ' : '') + a.name;
            }),
            mkRow('fa-face-smile', '換圖標', async function () {
                const em = prompt('新圖標 emoji（單一符號）', a.emoji || '📦'); if (em == null) return;
                a.emoji = (em.trim() || a.emoji).slice(0, 2); await win.OS_DB.savePhoneApp(a); _syncMeta(a);
                if (titleEl) titleEl.textContent = a.emoji + ' ' + (a.name || '應用');
            })
        ]);

        if (isStudio) {
            const memOn = !!(win.OS_APP_MEMORY_INJECT && win.OS_APP_MEMORY_INJECT.isPluginEnabled && win.OS_APP_MEMORY_INJECT.isPluginEnabled(a.id));
            mkGroup([
                mkRow('fa-brain', '記憶回傳酒館', function () {
                    const M = win.OS_APP_MEMORY_INJECT; if (!M || !M.setPluginEnabled) { _toast(c, '記憶模組未就緒'); return; }
                    const cur = M.isPluginEnabled ? M.isPluginEnabled(a.id) : false;
                    M.setPluginEnabled(a.id, !cur);
                    _openAppDetail(c, a);
                    _toast(c, '這個 app 的記憶' + (!cur ? '會' : '不會') + '回傳酒館');
                }, { toggle: true, on: memOn }),
                mkRow('fa-file-import', '載入酒館', function () { if (S.injectAppToTavern) { S.injectAppToTavern(a.srcTplId); _toast(c, '已寫入酒館正則，純文字也能跑'); } }),
                mkRow('fa-house', '放進大廳', async function () { if (S.toggleAppLobby) { const on = await S.toggleAppLobby(a.srcTplId); _toast(c, '大廳：' + (on ? '已啟用' : '已關閉')); } }),
                mkRow('fa-box-archive', '匯出 .json', function () { if (S.exportApp) S.exportApp(a.srcTplId); })
            ]);
        }

        mkGroup([
            mkRow('fa-trash', '卸載', function () { if (confirm('卸載「' + (a.name || 'App') + '」？(桌面圖標移除、內容刪除)')) { _uninstall(a.id, c); _go(c, 'mine'); } }, { danger: true, noChev: true })
        ]);

        _go(c, 'appdetail');
    }

    async function renderMine(c) {
        const list = c.querySelector('#as-mine-list'); if (!list) return;
        list.innerHTML = '<div class="ws-empty">載入中…</div>';
        let apps = [];
        try { apps = (win.OS_DB && win.OS_DB.getAllPhoneApps) ? await win.OS_DB.getAllPhoneApps() : []; } catch (e) {}
        if (!apps.length) { list.innerHTML = '<div class="ws-empty">還沒安裝任何應用。<br>去工坊生成、或從匯入貼一個吧。</div>'; return; }
        const opened = _loadOpened();
        list.innerHTML = '';
        apps.forEach(function (a) { list.appendChild(_mineRow(c, a, opened)); });
    }

    // 首頁的「我的應用」預覽（最近 3 個 + 查看全部）
    async function renderHomeMine(c) {
        const box = c.querySelector('#ws-home-mine'); if (!box) return;
        let apps = [];
        try { apps = (win.OS_DB && win.OS_DB.getAllPhoneApps) ? await win.OS_DB.getAllPhoneApps() : []; } catch (e) {}
        if (!apps.length) { box.innerHTML = '<div class="ws-empty sm">還沒有應用，從上面開始創造吧</div>'; return; }
        const opened = _loadOpened();
        box.innerHTML = '';
        apps.slice(0, 3).forEach(function (a) { box.appendChild(_mineRow(c, a, opened)); });
    }

    // 改名/換圖標後同步 localStorage 清單 + 重註冊桌面 meta
    function _syncMeta(a) {
        const list = _loadList().map(function (m) { return m.id === a.id ? { id: a.id, name: a.name, emoji: a.emoji, iconUrl: a.iconUrl || '' } : m; });
        _saveList(list);
        if (win.VoidPhoneShell) { win.VoidPhoneShell.removeApp(a.id); win.VoidPhoneShell.addApp({ id: a.id, name: a.name, emoji: a.emoji, iconUrl: a.iconUrl || '' }); }
    }

    // ── 匯入 ──
    function _bindImport(c) {
        const prevBtn = c.querySelector('#as-im-prev-btn');
        const installBtn = c.querySelector('#as-im-install');
        const fileInput = c.querySelector('#as-im-file');
        if (fileInput) fileInput.addEventListener('change', function () {
            var f = this.files && this.files[0]; if (!f) return;
            var r = new FileReader();
            r.onload = function () {
                c.querySelector('#as-im-html').value = String(r.result || '');
                var nmI = c.querySelector('#as-im-name'); if (nmI && !nmI.value) nmI.value = f.name.replace(/\.html?$/i, '');
                _toast(c, '已讀入檔案，可按預覽');
            };
            r.readAsText(f);
        });
        prevBtn.addEventListener('click', function () {
            const html = (c.querySelector('#as-im-html').value || '').trim();
            if (!/<body|<html|<div|<!doctype/i.test(html)) { _toast(c, '看起來不是完整 HTML 面板'); return; }
            c.querySelector('#as-im-prev-wrap').classList.remove('hidden');
            if (win.AppRuntime) win.AppRuntime.mountAppIframe(c.querySelector('#as-im-prev'), html, { preview: true });
        });
        installBtn.addEventListener('click', function () {
            const name = (c.querySelector('#as-im-name').value || '').trim();
            const emoji = (c.querySelector('#as-im-emoji').value || '📦').trim().slice(0, 2) || '📦';
            const html = (c.querySelector('#as-im-html').value || '').trim();
            if (!name) { _toast(c, '請填應用名稱'); return; }
            if (!/<body|<html|<div|<!doctype/i.test(html)) { _toast(c, '請貼上完整 HTML'); return; }
            _install(c, { name: name, emoji: emoji, iconUrl: '', html: html, source: 'import' });
        });
    }

    win.APP_STORE = { launch: launch };
    console.log('✅ APP_STORE（應用工坊）模組就緒');
})();
