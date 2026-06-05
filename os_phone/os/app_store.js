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
      +       '<div class="as-install-row hidden" id="as-ws-install-row">'
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
    async function _install(c, rec) {
        if (!win.OS_DB || !win.OS_DB.savePhoneApp) { _toast(c, '❌ 儲存層未就緒'); return; }
        const id = await win.OS_DB.savePhoneApp(rec);
        rec.id = id;
        const list = _loadList().filter(function (m) { return m.id !== id; });
        list.push({ id: id, name: rec.name, emoji: rec.emoji, iconUrl: rec.iconUrl || '' });
        _saveList(list);
        if (win.VoidPhoneShell && win.VoidPhoneShell.addApp) win.VoidPhoneShell.addApp({ id: id, name: rec.name, emoji: rec.emoji, iconUrl: rec.iconUrl || '' });
        _toast(c, '🎉 已安裝到桌面：' + rec.name);
    }
    async function _uninstall(id, c) {
        if (win.OS_DB && win.OS_DB.deletePhoneApp) await win.OS_DB.deletePhoneApp(id);
        _saveList(_loadList().filter(function (m) { return m.id !== id; }));
        if (win.VoidPhoneShell && win.VoidPhoneShell.removeApp) win.VoidPhoneShell.removeApp(id);
        renderMine(c);
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
              + '<button class="as-mini" data-act="src" type="button">原始碼</button>'
              + '<button class="as-mini" data-act="rename" type="button">改名</button>'
              + '<button class="as-mini" data-act="emoji" type="button">換圖標</button>'
              + '<button class="as-mini danger" data-act="del" type="button">卸載</button>';
            row.querySelector('[data-act="src"]').onclick = function () {
                const ta = c.querySelector('#as-im-html'); if (ta) ta.value = a.html || '';
                const nmI = c.querySelector('#as-im-name'); if (nmI) nmI.value = a.name || '';
                c.querySelectorAll('.as-tab').forEach(function (t) { t.classList.remove('active'); });
                c.querySelectorAll('.as-view').forEach(function (v) { v.classList.remove('active'); });
                const tb = c.querySelector('.as-tab[data-tab="import"]'); if (tb) tb.classList.add('active');
                const vw = c.querySelector('.as-view[data-view="import"]'); if (vw) vw.classList.add('active');
                _toast(c, '原始碼已載入「匯入」框，可全選複製給我');
            };
            row.querySelector('[data-act="del"]').onclick = function () {
                if (confirm('卸載「' + (a.name || 'App') + '」？(桌面圖標移除、內容刪除)')) _uninstall(a.id, c);
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
            _install(c, { name: name, emoji: emoji, iconUrl: '', html: html, source: 'import' });
        });
    }

    // ── 工坊：用 OS_API.chat + PANEL_DEV_GUIDE 規範，一次性生成完整 HTML app ──
    function _wsPrompt(desc, provider) {
        return '你是資深前端工程師。請依需求生成「一個完整、可獨立運作的 HTML 小 app」。\n\n'
            + '⚠️⚠️ 最重要：這個 app 的靈魂是 <script> 裡的互動邏輯。沒有可運作的 <script> = 徹底失敗(廢品)。\n'
            + 'CSS 簡潔好看就好、不要堆砌；把輸出預算重壓在 <script> 的功能邏輯、務必把功能寫完整。\n\n'
            + '【使用者需求】\n' + desc + '\n\n'
            + '【硬性規範（每條必守）】\n'
            + '1. 輸出一份完整 HTML：<!DOCTYPE html><html><head><style>…</style></head><body><div id="app-root">…</div><script>…</script></body></html>。<script> 一定要有、放在 </body> 之前、寫滿邏輯。\n'
            + '2. 所有按鈕/互動一律用 addEventListener 綁定（嚴禁 inline onclick="fn()"——函式不在全域會失效、按了沒反應）。元素先給 id，再在 script 用 getElementById/querySelector 綁。\n'
            + '3. CSS 選擇器全部以 #app-root 開頭；@keyframes 用獨特前綴；禁止 *{}、body{}、position:fixed、100vw、100vh。根容器 width:100%; max-width:480px; 適合手機直式。\n'
            + '4. 【文字生成】呼叫 window.generateRaw（已注入，回 Promise<string>）。封裝 helper：\n'
            + '   async function callAI(sys){ var r = await window.generateRaw({ user_input:" ", ordered_prompts:["world_info","chat_history",{role:"system",content:sys}], quiet:true }); return typeof r==="string"?r:(r&&r.message)||""; }\n'
            + '5. 【生圖】用 window.OS_IMAGE_MANAGER.generate，並用 window.__IS_PREVIEW 隔離省額度。封裝：\n'
            + '   async function genImg(p){ return window.__IS_PREVIEW ? ("https://api.dicebear.com/7.x/shapes/svg?seed="+encodeURIComponent(p)) : await window.OS_IMAGE_MANAGER.generate(p,"item",{provider:"' + provider + '"}); }\n'
            + '6. 每個 await 包 try/catch；點擊後要有 loading 狀態、完成後把結果 render 進畫面；失敗顯示友善訊息、不可整頁崩。\n\n'
            + '【骨架——照這結構填滿，務必保留並寫滿 <script>】\n'
            + '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>標題</title>\n'
            + '<style>#app-root{ … } /* 其餘都加 #app-root 前綴、精簡 */</style></head>\n'
            + '<body>\n'
            + '<div id="app-root"><!-- UI：按鈕給 id --></div>\n'
            + '<script>\n'
            + '(function(){\n'
            + '  var root = document.getElementById("app-root");\n'
            + '  async function callAI(sys){ /* 見規範4 */ }\n'
            + '  async function genImg(p){ /* 見規範5 */ }\n'
            + '  // ⬇ 重點：綁按鈕、實作完整功能（讀輸入→顯示loading→await callAI/genImg→建卡片插列表→收loading）\n'
            + '  root.querySelector("#你的按鈕id").addEventListener("click", async function(){ /* ... */ });\n'
            + '})();\n'
            + '</script>\n'
            + '</body></html>\n\n'
            + '【輸出格式（嚴格）】先 meta、再「含完整 <script> 的」HTML，兩段都要、其餘什麼都別寫：\n'
            + '<app_meta>{"name":"app名稱(4字內最佳)","emoji":"最貼切的emoji"}</app_meta>\n'
            + '<app_html>\n<!DOCTYPE html> …完整 HTML，必含寫滿邏輯的 <script>… </html>\n</app_html>';
    }

    function _parseGen(text) {
        let html = '', meta = {};
        const mh = text.match(/<app_html>([\s\S]*?)<\/app_html>/i);
        if (mh) html = mh[1].trim();
        else { const f = text.match(/```(?:html)?\s*([\s\S]*?)```/i); if (f) html = f[1].trim(); }
        html = html.replace(/^```(?:html)?\s*/i, '').replace(/```$/, '').trim();
        const mm = text.match(/<app_meta>([\s\S]*?)<\/app_meta>/i);
        if (mm) { try { meta = JSON.parse(mm[1].trim()); } catch (e) {} }
        return { html: html, meta: meta };
    }

    function _bindWorkshop(c) {
        const gen = c.querySelector('#as-ws-gen');
        const installRow = c.querySelector('#as-ws-install-row');
        const loading = c.querySelector('#as-ws-loading');
        if (!gen) return;

        gen.addEventListener('click', async function () {
            const desc = (c.querySelector('#as-ws-desc').value || '').trim();
            if (!desc) { _toast(c, '先描述你想要的 app'); return; }
            const provider = c.querySelector('#as-ws-provider').value === 'novelai' ? 'novelai' : 'pollinations';
            const api = _apiEngine();
            if (!api || typeof api.chat !== 'function') { _toast(c, '❌ 找不到 AI 引擎(OS_API)'); return; }

            gen.disabled = true; loading.classList.add('show'); installRow.classList.add('hidden'); _genHtml = null;
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
                if (!parsed.html || !/<body|<html|<div|<!doctype/i.test(parsed.html)) throw new Error('沒解析到完整 HTML');
                if (!/<script[\s>][\s\S]{30,}<\/script>/i.test(parsed.html)) throw new Error('生成的 app 缺少互動邏輯(<script>)，請重試或把需求講更具體');
                _genHtml = parsed.html;

                if (win.AppRuntime) win.AppRuntime.mountAppIframe(c.querySelector('#as-ws-prev'), parsed.html, { preview: true });
                c.querySelector('#as-ws-name').value = (parsed.meta && parsed.meta.name) ? parsed.meta.name : '新 App';
                c.querySelector('#as-ws-emoji').value = (parsed.meta && parsed.meta.emoji) ? String(parsed.meta.emoji).slice(0, 2) : '📦';
                installRow.classList.remove('hidden');
            } catch (e) {
                _toast(c, '生成失敗：' + (e.message || e) + '，可改描述重試');
            } finally {
                gen.disabled = false; loading.classList.remove('show');
            }
        });

        const installBtn = c.querySelector('#as-ws-install');
        if (installBtn) installBtn.addEventListener('click', function () {
            if (!_genHtml) { _toast(c, '請先生成'); return; }
            const name = (c.querySelector('#as-ws-name').value || '').trim() || '新 App';
            const emoji = (c.querySelector('#as-ws-emoji').value || '📦').trim().slice(0, 2) || '📦';
            _install(c, { name: name, emoji: emoji, iconUrl: '', html: _genHtml, source: 'workshop' });
        });
    }

    win.APP_STORE = { launch: launch };
    console.log('✅ APP_STORE（應用商店）模組就緒');
})();
