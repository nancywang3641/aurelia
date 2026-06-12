// os_phone/os/app_store.js
// 🛒 應用工坊：手機殼裡 AI 生成 / 貼上匯入「完整 HTML 功能型 app」，安裝到桌面。
// UI：首頁總覽 + 工坊(AI生成 step flow) + 匯入 + 我的應用 + 設定 + 底部 nav。
// 生成 = OS_API.chat + 分段 prompt → _assembleApp 組裝；helper(callAI/genImg/saveData…)由橋接 app_runtime 提供。
(function () {
    'use strict';
    const win = window;
    const INSTALLED_KEY = 'aurelia_phone_apps';      // 與 phone_shell.js 同 key：[{id,name,emoji,iconUrl}]
    const OPENED_KEY = 'aurelia_app_opened';         // {id: timestamp} —— 最近使用，phone_shell 開 app 時寫
    const PROVIDER_KEY = 'aurelia_appstore_provider'; // 生圖預設來源

    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _loadList() { try { return JSON.parse(win.localStorage.getItem(INSTALLED_KEY)) || []; } catch (e) { return []; } }
    function _saveList(list) { try { win.localStorage.setItem(INSTALLED_KEY, JSON.stringify(list)); } catch (e) {} }
    function _apiEngine() { return win.OS_API || (win.parent && win.parent.OS_API) || null; }
    function _loadOpened() { try { return JSON.parse(win.localStorage.getItem(OPENED_KEY)) || {}; } catch (e) { return {}; } }
    function _markOpened(id) { try { var m = _loadOpened(); m[id] = Date.now(); win.localStorage.setItem(OPENED_KEY, JSON.stringify(m)); } catch (e) {} }
    function _loadProvider() { try { return win.localStorage.getItem(PROVIDER_KEY) === 'novelai' ? 'novelai' : 'pollinations'; } catch (e) { return 'pollinations'; } }
    function _saveProvider(v) { try { win.localStorage.setItem(PROVIDER_KEY, v); } catch (e) {} }
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

    // 素材圖：data-asset 屬性 → aseets 檔名（中文檔名要 encode）
    const ASSET_MAP = {
        'ai-icon': '應用_AI_ICON圖.png',
        'im-icon': '應用_匯入_ICON圖.png',
        'idea':    '應用_應用想法圖.png',
        'ai':      '應用_AI圖.png',
        'im':      '應用_匯入_ICON圖.png',
        'success': '應用_成功圖.png'
    };
    function _applyAssets(c) {
        var base = (win.AURELIA_EXT_BASE || (win.parent && win.parent.AURELIA_EXT_BASE) || '') + '/aseets/';
        c.querySelectorAll('[data-asset]').forEach(function (img) {
            var k = img.dataset.asset;
            if (ASSET_MAP[k]) img.src = base + encodeURIComponent(ASSET_MAP[k]);
        });
    }

    let _genHtml = null;   // 工坊最近一次生成的 HTML（待安裝）

    const STORE_HTML =
        '<div class="ws-app">'
      +   '<div class="ws-views">'
      // ── 首頁 ──
      +     '<div class="ws-view active" data-view="home">'
      +       '<div class="ws-home-hd"><div class="ws-home-title">應用工坊 <span class="ws-spark">✨</span></div><div class="ws-home-sub">創造屬於你的專屬應用</div></div>'
      +       '<button class="ws-card ws-card-ai" data-go="workshop" type="button"><img class="ws-card-ic" data-asset="ai-icon" alt=""><span class="ws-card-tx"><span class="ws-card-t">AI 生成應用</span><span class="ws-card-d">描述想法，AI 幫你生成專屬應用</span></span><span class="ws-card-go">›</span></button>'
      +       '<button class="ws-card ws-card-im" data-go="import" type="button"><img class="ws-card-ic" data-asset="im-icon" alt=""><span class="ws-card-tx"><span class="ws-card-t">匯入應用</span><span class="ws-card-d">貼上現成 HTML，快速安裝使用</span></span><span class="ws-card-go">›</span></button>'
      +       '<div class="ws-sec-row"><span class="ws-sec-t">我的應用</span><button class="ws-sec-more" data-go="mine" type="button">查看全部 ›</button></div>'
      +       '<div class="ws-home-mine" id="ws-home-mine"></div>'
      +     '</div>'
      // ── 工坊 ──
      +     '<div class="ws-view" data-view="workshop">'
      +       '<div class="ws-vhd"><button class="ws-back" data-go="home" type="button">‹</button><span class="ws-vhd-t">AI 生成應用</span></div>'
      +       '<div class="ws-vbody">'
      +         '<div class="ws-hero"><img class="ws-hero-img" data-asset="idea" alt=""></div>'
      +         '<div class="ws-field-t">描述你的應用想法</div>'
      +         '<div class="ws-field-d">越詳細越好，AI 會生成更貼合需求的應用</div>'
      +         '<textarea class="ws-ta" id="as-ws-desc" placeholder="例：一個角色日記本，可輸入角色名稱新增日記，粉米色風格"></textarea>'
      +         '<div class="ws-field-lab">配圖用哪個 AI</div>'
      +         '<select class="ws-input" id="as-ws-provider"><option value="pollinations">Poll AI — 快、省額度（推薦）</option><option value="novelai">NAI — 精緻二次元角色風</option></select>'
      +         '<button class="ws-btn ws-btn-main" id="as-ws-gen" type="button">✨ 開始生成</button>'
      +         '<div class="ws-gen hidden" id="as-ws-loading"><img class="ws-gen-img" data-asset="ai" alt=""><div class="ws-gen-t">AI 正在為你生成應用…</div><div class="ws-gen-bar"><span></span></div></div>'
      +         '<div class="ws-prev-wrap hidden" id="as-ws-prev-wrap"><div class="ws-prev-lab">預覽（生圖走佔位、不燒額度）</div><div class="ws-prev" id="as-ws-prev"></div></div>'
      +         '<div class="ws-install hidden" id="as-ws-install-row"><input class="ws-input" id="as-ws-name" type="text" placeholder="應用名稱"><input class="ws-input ws-emoji" id="as-ws-emoji" type="text" maxlength="2" placeholder="📦"><button class="ws-btn ws-btn-ok" id="as-ws-install" type="button">安裝到桌面</button></div>'
      +       '</div>'
      +     '</div>'
      // ── 匯入 ──
      +     '<div class="ws-view" data-view="import">'
      +       '<div class="ws-vhd"><button class="ws-back" data-go="home" type="button">‹</button><span class="ws-vhd-t">匯入應用</span></div>'
      +       '<div class="ws-vbody">'
      +         '<div class="ws-hero"><img class="ws-hero-img ws-hero-sm" data-asset="im-icon" alt=""></div>'
      +         '<div class="ws-field-lab">應用名稱</div>'
      +         '<input class="ws-input" id="as-im-name" type="text" placeholder="例：恐怖電台">'
      +         '<div class="ws-field-lab">圖標 emoji</div>'
      +         '<input class="ws-input ws-emoji" id="as-im-emoji" type="text" maxlength="2" placeholder="📦">'
      +         '<div class="ws-field-lab">貼上完整 HTML（或上傳 .html 檔）</div>'
      +         '<label class="ws-file-btn" for="as-im-file">📂 選擇 .html 檔</label><input class="ws-file" id="as-im-file" type="file" accept=".html,.htm,text/html">'
      +         '<textarea class="ws-ta ws-ta-code" id="as-im-html" placeholder="&lt;!DOCTYPE html&gt; ... &lt;/html&gt;"></textarea>'
      +         '<button class="ws-btn ws-btn-line" id="as-im-prev-btn" type="button">預覽</button>'
      +         '<div class="ws-prev-wrap hidden" id="as-im-prev-wrap"><div class="ws-prev-lab">預覽</div><div class="ws-prev" id="as-im-prev"></div></div>'
      +         '<button class="ws-btn ws-btn-ok" id="as-im-install" type="button">安裝到桌面</button>'
      +       '</div>'
      +     '</div>'
      // ── 我的應用 ──
      +     '<div class="ws-view" data-view="mine">'
      +       '<div class="ws-vhd"><button class="ws-back" data-go="home" type="button">‹</button><span class="ws-vhd-t">我的應用</span></div>'
      +       '<div class="ws-vbody"><div class="ws-mine-list" id="as-mine-list"></div></div>'
      +     '</div>'
      +   '</div>'
      // ── 底部 nav ──
      +   '<div class="ws-nav">'
      +     '<button class="ws-nav-b active" data-go="home" type="button"><span class="ws-nav-ic">🏠</span><span class="ws-nav-t">首頁</span></button>'
      +     '<button class="ws-nav-b" data-go="workshop" type="button"><span class="ws-nav-ic">🛠️</span><span class="ws-nav-t">工坊</span></button>'
      +     '<button class="ws-nav-b" data-go="mine" type="button"><span class="ws-nav-ic">📱</span><span class="ws-nav-t">我的</span></button>'
      +   '</div>'
      // ── 安裝成功覆蓋 + toast ──
      +   '<div class="ws-success hidden" id="ws-success"><img class="ws-suc-img" data-asset="success" alt=""><div class="ws-suc-t">安裝成功！</div><div class="ws-suc-name"></div></div>'
      +   '<div class="ws-toast" id="as-toast"></div>'
      + '</div>';

    function launch(c) {
        if (!c) return;
        c.innerHTML = STORE_HTML;
        _applyAssets(c);
        // provider：工坊下拉自動記住上次選擇（無聲、不需要設定頁）
        var pSel = c.querySelector('#as-ws-provider');
        if (pSel) { pSel.value = _loadProvider(); pSel.addEventListener('change', function () { _saveProvider(pSel.value); }); }
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
        _bindWorkshop(c);
        renderHomeMine(c);
    }

    // 切換視圖
    function _go(c, view) {
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

    // ── 我的應用 列 (共用 row 產生器) ──
    function _mineRow(c, a, opened) {
        const row = document.createElement('div');
        row.className = 'ws-mine-row';
        row.innerHTML =
            '<span class="ws-mine-ic">' + _esc(a.emoji || '📦') + '</span>'
          + '<span class="ws-mine-info"><span class="ws-mine-name">' + _esc(a.name || 'App') + '</span><span class="ws-mine-sub">' + _esc(_relTime(opened[a.id])) + '</span></span>'
          + '<button class="ws-mine-menu" data-act="menu" type="button">⋯</button>'
          + '<div class="ws-mine-acts hidden">'
          +   '<button class="ws-mini" data-act="src" type="button">原始碼</button>'
          +   '<button class="ws-mini" data-act="rename" type="button">改名</button>'
          +   '<button class="ws-mini" data-act="emoji" type="button">換圖標</button>'
          +   '<button class="ws-mini danger" data-act="del" type="button">卸載</button>'
          + '</div>';
        row.querySelector('[data-act="menu"]').onclick = function () { row.querySelector('.ws-mine-acts').classList.toggle('hidden'); };
        row.querySelector('[data-act="src"]').onclick = function () {
            const ta = c.querySelector('#as-im-html'); if (ta) ta.value = a.html || '';
            const nmI = c.querySelector('#as-im-name'); if (nmI) nmI.value = a.name || '';
            _go(c, 'import');
            _toast(c, '原始碼已載入「匯入」框，可全選複製給我');
        };
        row.querySelector('[data-act="del"]').onclick = function () {
            if (confirm('卸載「' + (a.name || 'App') + '」？(桌面圖標移除、內容刪除)')) _uninstall(a.id, c);
        };
        row.querySelector('[data-act="rename"]').onclick = async function () {
            const nm = prompt('新名稱', a.name || ''); if (nm == null) return;
            a.name = nm.trim() || a.name;
            await win.OS_DB.savePhoneApp(a); _syncMeta(a); renderMine(c);
        };
        row.querySelector('[data-act="emoji"]').onclick = async function () {
            const em = prompt('新圖標 emoji（單一符號）', a.emoji || '📦'); if (em == null) return;
            a.emoji = (em.trim() || a.emoji).slice(0, 2);
            await win.OS_DB.savePhoneApp(a); _syncMeta(a); renderMine(c);
        };
        return row;
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
        if (!apps.length) { box.innerHTML = '<div class="ws-empty sm">還沒有應用，從上面開始創造吧 ✨</div>'; return; }
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

    // ── 工坊：AI 分段輸出 css/html/js（各自獨立、js 不可漏），由 _assembleApp 組成完整 HTML ──
    function _wsPrompt(desc, provider) {
        return '你是資深前端工程師。請依需求設計一個「功能型 HTML 小 app」，把它拆成 css / html / js 三段輸出。\n\n'
            + '【使用者需求】\n' + desc + '\n\n'
            + '【版面與尺寸（重要）】這個 app 會「全螢幕」塞進一個直式手機螢幕(約 寬330×高640px)。#app-root 必須 width:100%; min-height:100%; box-sizing:border-box 填滿整個螢幕——不要 max-width 置中、不要假設桌面寬度、不要固定大像素寬。版面用直向 flex(column) 自適應，需要捲動的內容區用 overflow:auto。整體要像一個真的手機 app 全頁。\n\n'
            + '【執行環境已幫你準備好這些工具，直接用、不要自己重定義】\n'
            + '- root：#app-root 容器元素（已 = document.getElementById("app-root")）\n'
            + '- callAI(systemPrompt) → Promise<string>：呼叫 AI 生成文字、回純文字。它「會」自動帶上當前角色卡(描述/個性/情境)、當前角色綁定的世界書、與最近劇情；但「不會」吃酒館預設與全域世界書(所以乖乖照你的 systemPrompt 走)。把這個 app 的具體要求與輸出格式寫進 systemPrompt 即可、不必重述角色設定。\n'
            + '- genImg(prompt, type) → Promise<imageUrl>：生圖（已內建預覽省額度，預覽時自動給佔位圖）\n'
            + '- goBack()：回到手機主畫面（給 header 的返回鍵用）\n'
            + '- saveData(key, value) / loadData(key)：把資料存進手機(JSON、跨「關閉再打開」保留)。凡是使用者建立/輸入要留住的東西(清單、紀錄…)都用它存、用它讀。\n'
            + '- document / window 照常用\n\n'
            + '【各段要求】\n'
            + '- css：每個選擇器都以 #app-root 開頭；#app-root 要填滿螢幕(見上「版面與尺寸」)；禁止 *{}、body{}、position:fixed、100vw、100vh；@keyframes 用獨特前綴。簡潔好看即可、別堆砌。\n'
            + '- html：放進 #app-root 內的「內層 HTML」（不要 <!DOCTYPE>/<html>/<head>/<body>，只要內容）。按鈕等互動元素一定要給 id。app 最上方要有一個 header，header「左側」固定放一個返回鍵(用 ‹ 或 ←)，js 裡綁定它呼叫 goBack() 回手機主畫面——這是所有 app 統一規範、務必加。\n'
            + '- js：⚠️ 這是 app 的靈魂、最重要：完整互動邏輯。用 addEventListener 綁按鈕（root.querySelector("#id")）、實作功能（讀輸入→顯示 loading→await callAI/genImg→把結果 render 進畫面→收 loading）、每個 await 包 try/catch。js 不可為空、要把功能寫完整。⚠️ 凡是使用者建立的資料(日記/清單/紀錄…)務必用 saveData 存、app 一啟動就用 loadData 還原並畫出來——否則關掉重開會不見。\n\n'
            + '【輸出格式（嚴格，只輸出下面四個區塊、其餘一字都別寫；各段用純文字、不要包 ``` 代碼框）】\n'
            + '<app_meta>{"name":"app名稱(4字內最佳)","emoji":"最貼切的emoji"}</app_meta>\n'
            + '<app_css>\n（這裡放 CSS）\n</app_css>\n'
            + '<app_html>\n（這裡放 #app-root 內層 HTML）\n</app_html>\n'
            + '<app_js>\n（這裡放完整互動邏輯 JS——最重要、務必寫滿）\n</app_js>';
    }

    // 把 AI 分段結果組成完整、可在 iframe 跑的 HTML。helper 由橋接(app_runtime)提供，這裡只組版面 + 跑 js。
    function _assembleApp(parsed) {
        return '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8">\n'
            + '<style>\n'
            + 'html,body{margin:0;padding:0;height:100%;}\n'
            + '#app-root{box-sizing:border-box;width:100%;min-height:100%;}\n'
            + (parsed.css || '') + '\n</style></head>\n'
            + '<body><div id="app-root">\n' + (parsed.html || '') + '\n</div>\n'
            + '<scr' + 'ipt>(function(){\n'
            + 'var root = document.getElementById("app-root");\n'
            + '(async function(){ try {\n' + (parsed.js || '') + '\n} catch(e){ console.error("[app run]", e); } })();\n'
            + '})();</scr' + 'ipt></body></html>';
    }

    function _parseGen(text) {
        function pick(tag) { var m = text.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>', 'i')); return m ? m[1] : ''; }
        function defence(s) { return String(s || '').replace(/^\s*```(?:\w+)?\s*/i, '').replace(/```\s*$/i, '').trim(); }
        var meta = {};
        var mm = text.match(/<app_meta>([\s\S]*?)<\/app_meta>/i);
        if (mm) { try { meta = JSON.parse(mm[1].trim()); } catch (e) {} }
        return { css: defence(pick('app_css')), html: defence(pick('app_html')), js: defence(pick('app_js')), meta: meta };
    }

    function _bindWorkshop(c) {
        const gen = c.querySelector('#as-ws-gen');
        const installRow = c.querySelector('#as-ws-install-row');
        const loading = c.querySelector('#as-ws-loading');
        const prevWrap = c.querySelector('#as-ws-prev-wrap');
        if (!gen) return;

        gen.addEventListener('click', async function () {
            const desc = (c.querySelector('#as-ws-desc').value || '').trim();
            if (!desc) { _toast(c, '先描述你想要的應用'); return; }
            const provider = c.querySelector('#as-ws-provider').value === 'novelai' ? 'novelai' : 'pollinations';
            const api = _apiEngine();
            if (!api || typeof api.chat !== 'function') { _toast(c, '❌ 找不到 AI 引擎(OS_API)'); return; }

            gen.disabled = true; loading.classList.remove('hidden'); installRow.classList.add('hidden'); prevWrap.classList.add('hidden'); _genHtml = null;
            try {
                let baseConfig = (win.OS_SETTINGS && win.OS_SETTINGS.getConfig && win.OS_SETTINGS.getConfig()) || {};
                try { if (!baseConfig || !Object.keys(baseConfig).length) baseConfig = JSON.parse(win.localStorage.getItem('os_global_config') || '{}'); } catch (e) {}
                const pureConfig = Object.assign({}, baseConfig, { usePresetPrompts: false, enableThinking: false, temperature: 0.5, maxTokens: Math.max(parseInt(baseConfig.maxTokens, 10) || 8192, 4096) });
                const messages = [{ role: 'user', content: _wsPrompt(desc, provider) }];

                const resp = await new Promise(function (resolve, reject) {
                    api.chat(messages, pureConfig, null, resolve, reject, { disableTyping: true });
                });
                if (!resp) throw new Error('AI 回傳空白');

                const parsed = _parseGen(resp);
                if (!parsed.js || parsed.js.length < 20) throw new Error('生成的應用缺少互動邏輯，請重試或把需求講更具體');
                if (!parsed.html && !parsed.css) throw new Error('沒解析到應用內容，請重試');
                _genHtml = _assembleApp(parsed);

                prevWrap.classList.remove('hidden');
                if (win.AppRuntime) win.AppRuntime.mountAppIframe(c.querySelector('#as-ws-prev'), _genHtml, { preview: true, provider: provider });
                c.querySelector('#as-ws-name').value = (parsed.meta && parsed.meta.name) ? parsed.meta.name : '新應用';
                c.querySelector('#as-ws-emoji').value = (parsed.meta && parsed.meta.emoji) ? String(parsed.meta.emoji).slice(0, 2) : '📦';
                installRow.classList.remove('hidden');
            } catch (e) {
                _toast(c, '生成失敗：' + (e.message || e) + '，可改描述重試');
            } finally {
                gen.disabled = false; loading.classList.add('hidden');
            }
        });

        const installBtn = c.querySelector('#as-ws-install');
        if (installBtn) installBtn.addEventListener('click', function () {
            if (!_genHtml) { _toast(c, '請先生成'); return; }
            const name = (c.querySelector('#as-ws-name').value || '').trim() || '新應用';
            const emoji = (c.querySelector('#as-ws-emoji').value || '📦').trim().slice(0, 2) || '📦';
            const provider = c.querySelector('#as-ws-provider').value === 'novelai' ? 'novelai' : 'pollinations';
            _install(c, { name: name, emoji: emoji, iconUrl: '', html: _genHtml, source: 'workshop', provider: provider });
        });
    }

    win.APP_STORE = { launch: launch };
    console.log('✅ APP_STORE（應用工坊）模組就緒');
})();
