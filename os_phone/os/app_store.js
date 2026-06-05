// os_phone/os/app_store.js
// 🛒 應用商店：在手機殼裡 AI 生成 / 貼上匯入「完整 HTML 功能型 app」，安裝到桌面。
// 工坊用 OS_API.chat + PANEL_DEV_GUIDE prompt 生成；安裝 = OS_DB.savePhoneApp + localStorage 清單 + VoidPhoneShell.addApp。
(function () {
    'use strict';
    const win = window;
    const INSTALLED_KEY = 'aurelia_phone_apps';   // 與 phone_shell.js 同 key：[{id,name,emoji,iconUrl}]
    const EMOJIS = ['📦','📕','📘','🛍️','🎬','🎵','📷','🗺️','🎮','💬','📰','🧭','🍔','🎲','⭐','🔔'];

    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _loadList() { try { return JSON.parse(win.localStorage.getItem(INSTALLED_KEY)) || []; } catch (e) { return []; } }
    function _saveList(list) { try { win.localStorage.setItem(INSTALLED_KEY, JSON.stringify(list)); } catch (e) {} }
    function _imgMgr() { return win.OS_IMAGE_MANAGER || (win.parent && win.parent.OS_IMAGE_MANAGER) || null; }
    function _apiEngine() { return win.OS_API || (win.parent && win.parent.OS_API) || null; }
    function _toast(c, msg) {
        const t = c.querySelector('#as-toast'); if (!t) return;
        t.textContent = msg; t.classList.add('show');
        clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
    }

    let _root = null;        // 商店容器
    let _genHtml = null;     // 工坊最近一次生成的 HTML（待安裝）

    const STORE_HTML =
        '<div class="as-wrap">'
      +   '<div class="as-head"><span class="as-title">🛒 應用商店</span></div>'
      +   '<div class="as-tabs">'
      +     '<button class="as-tab active" data-tab="workshop" type="button">🛠️ 工坊</button>'
      +     '<button class="as-tab" data-tab="import" type="button">📥 匯入</button>'
      +     '<button class="as-tab" data-tab="mine" type="button">📱 我的應用</button>'
      +   '</div>'
      +   '<div class="as-body">'
      +     '<div class="as-view active" data-view="workshop">'
      +       '<label class="as-lab">想要什麼 app？(用途＋風格，越具體越好)</label>'
      +       '<textarea class="as-ta" id="as-ws-desc" placeholder="例：一個小紅書 app，能生成貼文標題+內文+一張配圖，整體粉色少女風"></textarea>'
      +       '<label class="as-lab">配圖用哪個 AI</label>'
      +       '<select class="as-input" id="as-ws-provider">'
      +         '<option value="pollinations">POLL AI — 快、省額度（一般配圖推薦）</option>'
      +         '<option value="novelai">NAI — 精緻二次元角色風</option>'
      +       '</select>'
      +       '<button class="as-btn as-btn-main" id="as-ws-gen" type="button">✨ 生成 app</button>'
      +       '<div class="as-loading" id="as-ws-loading">AI 正在生成 app，請稍候…</div>'
      +       '<div class="as-prev-wrap"><div class="as-prev-lab">預覽（生圖走佔位、不燒額度）</div><div class="as-prev" id="as-ws-prev"></div></div>'
      +       '<div class="as-install-row" id="as-ws-install-row" style="display:none;">'
      +         '<input class="as-input" id="as-ws-name" type="text" placeholder="app 名稱">'
      +         '<input class="as-input as-emoji-in" id="as-ws-emoji" type="text" maxlength="2" placeholder="📦">'
      +         '<button class="as-btn as-btn-ok" id="as-ws-install" type="button">安裝到桌面</button>'
      +       '</div>'
      +     '</div>'
      +     '<div class="as-view" data-view="import">'
      +       '<label class="as-lab">app 名稱</label>'
      +       '<input class="as-input" id="as-im-name" type="text" placeholder="例：恐怖電台">'
      +       '<label class="as-lab">圖標 emoji（單一符號）</label>'
      +       '<input class="as-input as-emoji-in" id="as-im-emoji" type="text" maxlength="2" placeholder="📦">'
      +       '<label class="as-lab">貼上完整 HTML（GPT 生成的面板）</label>'
      +       '<textarea class="as-ta as-ta-code" id="as-im-html" placeholder="<!DOCTYPE html> ... </html>"></textarea>'
      +       '<button class="as-btn as-btn-main" id="as-im-prev-btn" type="button">預覽</button>'
      +       '<div class="as-prev-wrap"><div class="as-prev-lab">預覽</div><div class="as-prev" id="as-im-prev"></div></div>'
      +       '<button class="as-btn as-btn-ok" id="as-im-install" type="button">安裝到桌面</button>'
      +     '</div>'
      +     '<div class="as-view" data-view="mine">'
      +       '<div class="as-mine-list" id="as-mine-list"></div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="as-toast" id="as-toast"></div>'
      + '</div>';

    function launch(c) {
        if (!c) return;
        _root = c;
        c.innerHTML = STORE_HTML;
        _bindTabs(c);
        _bindImport(c);
        _bindWorkshop(c);   // Task 5 實作；此處為 stub
        renderMine(c);
    }

    function _bindTabs(c) {
        c.querySelectorAll('.as-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                c.querySelectorAll('.as-tab').forEach(function (t) { t.classList.remove('active'); });
                c.querySelectorAll('.as-view').forEach(function (v) { v.classList.remove('active'); });
                tab.classList.add('active');
                const v = c.querySelector('.as-view[data-view="' + tab.dataset.tab + '"]');
                if (v) v.classList.add('active');
                if (tab.dataset.tab === 'mine') renderMine(c);
            });
        });
    }

    // ── 安裝 / 卸載（共用）──
    async function _install(rec) {
        if (!win.OS_DB || !win.OS_DB.savePhoneApp) { _toast(_root, '❌ 儲存層未就緒'); return; }
        const id = await win.OS_DB.savePhoneApp(rec);
        rec.id = id;
        const list = _loadList().filter(function (m) { return m.id !== id; });
        list.push({ id: id, name: rec.name, emoji: rec.emoji, iconUrl: rec.iconUrl || '' });
        _saveList(list);
        if (win.VoidPhoneShell && win.VoidPhoneShell.addApp) win.VoidPhoneShell.addApp({ id: id, name: rec.name, emoji: rec.emoji, iconUrl: rec.iconUrl || '' });
        _toast(_root, '🎉 已安裝到桌面：' + rec.name);
    }
    async function _uninstall(id) {
        if (win.OS_DB && win.OS_DB.deletePhoneApp) await win.OS_DB.deletePhoneApp(id);
        _saveList(_loadList().filter(function (m) { return m.id !== id; }));
        if (win.VoidPhoneShell && win.VoidPhoneShell.removeApp) win.VoidPhoneShell.removeApp(id);
        renderMine(_root);
    }

    // ── 我的應用 ──
    async function renderMine(c) {
        const list = c.querySelector('#as-mine-list'); if (!list) return;
        list.innerHTML = '<div class="as-empty">載入中…</div>';
        let apps = [];
        try { apps = (win.OS_DB && win.OS_DB.getAllPhoneApps) ? await win.OS_DB.getAllPhoneApps() : []; } catch (e) {}
        if (!apps.length) { list.innerHTML = '<div class="as-empty">還沒安裝任何 app。去工坊生成、或從匯入貼一個吧。</div>'; return; }
        list.innerHTML = '';
        apps.forEach(function (a) {
            const row = document.createElement('div');
            row.className = 'as-mine-row';
            row.innerHTML =
                '<span class="as-mine-ic">' + _esc(a.emoji || '📦') + '</span>'
              + '<span class="as-mine-name">' + _esc(a.name || 'App') + '</span>'
              + '<button class="as-mini" data-act="rename" type="button">改名</button>'
              + '<button class="as-mini" data-act="emoji" type="button">換圖標</button>'
              + '<button class="as-mini danger" data-act="del" type="button">卸載</button>';
            row.querySelector('[data-act="del"]').onclick = function () {
                if (confirm('卸載「' + (a.name || 'App') + '」？(桌面圖標移除、內容刪除)')) _uninstall(a.id);
            };
            row.querySelector('[data-act="rename"]').onclick = async function () {
                const nm = prompt('新名稱', a.name || ''); if (nm == null) return;
                a.name = nm.trim() || a.name;
                await win.OS_DB.savePhoneApp(a);
                _syncMeta(a); renderMine(c);
            };
            row.querySelector('[data-act="emoji"]').onclick = async function () {
                const em = prompt('新圖標 emoji（單一符號）', a.emoji || '📦'); if (em == null) return;
                a.emoji = (em.trim() || a.emoji).slice(0, 2);
                await win.OS_DB.savePhoneApp(a);
                _syncMeta(a); renderMine(c);
            };
            list.appendChild(row);
        });
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
        prevBtn.addEventListener('click', function () {
            const html = (c.querySelector('#as-im-html').value || '').trim();
            if (!/<body|<html|<div|<!doctype/i.test(html)) { _toast(c, '看起來不是完整 HTML 面板'); return; }
            if (win.AppRuntime) win.AppRuntime.mountAppIframe(c.querySelector('#as-im-prev'), html, { preview: true });
        });
        installBtn.addEventListener('click', function () {
            const name = (c.querySelector('#as-im-name').value || '').trim();
            const emoji = (c.querySelector('#as-im-emoji').value || '📦').trim().slice(0, 2) || '📦';
            const html = (c.querySelector('#as-im-html').value || '').trim();
            if (!name) { _toast(c, '請填 app 名稱'); return; }
            if (!/<body|<html|<div|<!doctype/i.test(html)) { _toast(c, '請貼上完整 HTML'); return; }
            _install({ name: name, emoji: emoji, iconUrl: '', html: html, source: 'import' });
        });
    }

    // ── 工坊（Task 5 實作）──
    function _bindWorkshop(c) {
        const gen = c.querySelector('#as-ws-gen');
        if (gen) gen.addEventListener('click', function () { _toast(c, '工坊建置中…'); });
    }

    win.APP_STORE = { launch: launch };
    console.log('✅ APP_STORE（應用商店）模組就緒');
})();
