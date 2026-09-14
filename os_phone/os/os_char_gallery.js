// ----------------------------------------------------------------
// [檔案] os_char_gallery.js
// 路徑：os_phone/os/os_char_gallery.js
// 職責：角色圖鑑——看每個角色舞台會用哪張立繪、哪裡缺圖、哪個網址壞了；在這裡加圖、改世界書條目。
// 暴露：window.OS_CHAR_GALLERY = { open(name?), close(), localUrl(name, exp) }
//
// 🔴 找圖順序只有一份（2026-09-14 她定）：本地上傳 → 世界書 → 網址庫 → 立繪庫 → AI 頭像。
//    舞台（vn_core_stage.js）、圖鑑、之後的插圖參考圖都照這個順序。改順序三邊一起改。
//    表情格：本地上傳(表情) → 【素材-角色表情立繪】 → 立繪目錄/名字_表情.png
//    預設格：本地上傳(預設) → 【素材-角色預設立繪素材】 → 角色預設圖目錄/名字_presets.png → 立繪庫
//    表情格找不到時舞台會往下用預設格。
// 樣式在 css/os_char_gallery.css；class 一律 acg- 開頭。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const doc = win.document;

    const KEY_PRE = 'char_img::';
    const DEFAULT_EXP = 'default';
    const WB_EXP = '【素材-角色表情立繪】';
    const WB_PRESET = '【素材-角色預設立繪素材】';
    const WB_NEW_KEYS = ['立繪素材_倉庫_請勿觸發_DO_NOT_TRIGGER'];
    const SHRINK_SIDE = 1600;

    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const AUIx = () => win.AUI || window.AUI;
    const VN = () => win.VN_Core || window.VN_Core;
    const DB = () => win.OS_DB || window.OS_DB;
    const Cache = () => win.VN_Cache || window.VN_Cache;
    const Cfg = () => (win.VN_Config || window.VN_Config || {}).data || {};
    const TH = () => win.TavernHelper || null;
    const toast = (msg, type) => { try { const A = AUIx(); A && A.toast(msg, { type: type || 'info' }); } catch (e) {} };

    // 名字比對跟舞台同一套：卡蜜拉·洛爾德 和 卡蜜拉 算同一個人
    function variants(n) {
        const V = VN();
        const s = String(n || '').trim();
        if (!s) return [];
        return (V && V._nameVariants) ? V._nameVariants(s) : [s];
    }
    function sameChar(a, b) {
        const va = variants(a), vb = variants(b);
        return va.some(x => vb.indexOf(x) >= 0);
    }
    const expLabel = (exp) => (exp === DEFAULT_EXP ? '預設' : exp);

    // ================================================================
    // 本地上傳（跟生成的圖分開放，不分故事）
    // ================================================================
    let _localList = null;          // 記憶體裡的一份，舞台每次換立繪都會問，別每次都開資料庫
    let _localLoading = null;
    async function localAll() {
        if (_localList) return _localList;
        if (_localLoading) return _localLoading;
        const D = DB();
        if (!D || !D.listCharImages) return [];
        _localLoading = D.listCharImages().then(list => { _localList = list || []; _localLoading = null; return _localList; })
            .catch(() => { _localLoading = null; return []; });
        return _localLoading;
    }
    function localInvalidate() { _localList = null; }
    const localKey = (name, exp) => KEY_PRE + name + '::' + (exp || DEFAULT_EXP);
    async function localFind(name, exp) {
        const list = await localAll();
        const want = exp || DEFAULT_EXP;
        return list.find(r => r && r.exp === want && sameChar(r.name, name)) || null;
    }
    async function localUrl(name, exp) {
        try { const r = await localFind(name, exp); return (r && r.data) || ''; } catch (e) { return ''; }
    }
    async function localSave(name, exp, data, kind) {
        const D = DB();
        if (!D || !D.saveCharImage) throw new Error('資料庫還沒準備好');
        const old = await localFind(name, exp);
        if (old && old.id !== localKey(name, exp)) await D.deleteCharImage(old.id);
        await D.saveCharImage({ id: localKey(name, exp), name, exp: exp || DEFAULT_EXP, data, kind, createdAt: Date.now() });
        localInvalidate();
    }
    async function localDelete(name, exp) {
        const D = DB();
        const r = await localFind(name, exp);
        if (r && D && D.deleteCharImage) await D.deleteCharImage(r.id);
        localInvalidate();
    }

    // 上傳的圖一律縮過再存：長邊 1600、WebP（保留透明）。未壓縮的大圖曾把酒館卡死。
    function fileToDataUrl(file) {
        return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    }
    async function shrink(dataUrl, maxSide) {
        try {
            const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
            const w = img.naturalWidth || 1, h = img.naturalHeight || 1;
            const k = Math.min(1, (maxSide || SHRINK_SIDE) / Math.max(w, h));
            const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
            const cv = doc.createElement('canvas'); cv.width = cw; cv.height = ch;
            cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
            const webp = cv.toDataURL('image/webp', 0.9);
            return (webp.indexOf('data:image/webp') === 0) ? webp : cv.toDataURL('image/png');
        } catch (e) { return dataUrl; }
    }

    // ================================================================
    // 世界書（只有酒館版有）
    // ================================================================
    function wbAvailable() {
        const t = TH();
        return !!(t && t.getLorebookEntries && t.setLorebookEntries && t.createLorebookEntries);
    }
    function charPrimary() {
        try { const c = TH().getCharLorebooks(); return (c && c.primary) || ''; } catch (e) { return ''; }
    }
    // 讀的順序跟舞台一樣（全域 → 角色卡主 → 角色卡附加），同一個名字後讀到的蓋前面
    function wbBooks() {
        const t = TH(); const out = [];
        const add = (b) => { if (b && out.indexOf(b) < 0) out.push(b); };
        try { const g = t.getLorebookSettings && t.getLorebookSettings(); (g && g.selected_global_lorebooks || []).forEach(add); } catch (e) {}
        try { const c = t.getCharLorebooks && t.getCharLorebooks(); if (c) { add(c.primary); (c.additional || []).forEach(add); } } catch (e) {}
        return out;
    }
    function parseLine(raw, kind) {
        const t = String(raw || '').trim();
        if (!t || t.indexOf('//') === 0) return { raw, parsed: false };
        const m = t.match(/^([^:]+):([^|]+)(?:\|(.*))?$/);
        if (!m) return { raw, parsed: false };
        const main = m[1].trim(), url = m[2].trim();
        const aliases = m[3] ? m[3].split(',').map(a => a.trim()).filter(Boolean) : [];
        if (kind === 'exp') {
            const i = main.lastIndexOf('_');
            if (i <= 0) return { raw, parsed: false };
            return { raw, parsed: true, name: main.slice(0, i), exp: main.slice(i + 1), url, aliases };
        }
        return { raw, parsed: true, name: main, exp: '', url, aliases };
    }
    const lineIsChar = (l, ch) => !!(l && l.parsed && [l.name].concat(l.aliases).some(n => sameChar(n, ch)));
    async function wbLoad() {
        const out = { exp: [], preset: [] };
        if (!wbAvailable()) return out;
        const t = TH();
        for (const book of wbBooks()) {
            let entries = [];
            try { entries = await t.getLorebookEntries(book) || []; } catch (e) { continue; }
            for (const e of entries) {
                const kind = e.comment === WB_EXP ? 'exp' : (e.comment === WB_PRESET ? 'preset' : '');
                if (!kind) continue;
                out[kind].push({ book, uid: e.uid, lines: String(e.content || '').split('\n').map(raw => parseLine(raw, kind)) });
            }
        }
        return out;
    }
    const entryKeyOf = (E) => E.book + '#' + E.uid;
    function wbRowsFor(wb, kind, ch) {
        const rows = [];
        (wb[kind] || []).forEach(E => E.lines.forEach(l => {
            if (lineIsChar(l, ch)) rows.push({ entryKey: entryKeyOf(E), name: l.name, exp: l.exp, url: l.url, aliases: l.aliases.join(', ') });
        }));
        return rows;
    }
    function fmtLine(kind, r) {
        const al = String(r.aliases || '').split(',').map(a => a.trim()).filter(Boolean);
        return (kind === 'exp' ? (r.name + '_' + r.exp) : r.name) + ':' + r.url + (al.length ? '|' + al.join(', ') : '');
    }
    // 一次改好幾個角色（手動保存是一個、匯入清單是很多個）。每個角色的行整批換掉，別人的行原封不動。
    //   新行放進「這個角色原本所在的條目」；原本沒有 → 角色卡主世界書裡那一條；再沒有 → 在角色卡主世界書新建（停用、不進 AI）。
    async function wbSaveMany(wb, kind, changes) {
        const t = TH();
        const entries = wb[kind] || [];
        const primary = charPrimary();
        const fallback = entries.find(E => E.book === primary) || entries[0] || null;
        const per = new Map();
        const ensure = (E) => { const k = entryKeyOf(E); if (!per.has(k)) per.set(k, { E, chars: [], add: [] }); return per.get(k); };
        const createLines = [];
        for (const ch of changes) {
            const rows = (ch.rows || []).map(r => ({
                entryKey: r.entryKey || '', name: String(r.name || ch.char).trim(), exp: String(r.exp || '').trim(),
                url: String(r.url || '').trim(), aliases: r.aliases || ''
            })).filter(r => r.url && r.name && (kind !== 'exp' || r.exp));
            const home = entries.find(E => E.lines.some(l => lineIsChar(l, ch.char))) || fallback;
            entries.forEach(E => { if (E.lines.some(l => lineIsChar(l, ch.char))) ensure(E).chars.push(ch.char); });
            rows.forEach(r => {
                const E = entries.find(x => entryKeyOf(x) === r.entryKey) || home;
                if (E) ensure(E).add.push({ char: ch.char, line: fmtLine(kind, r) });
                else createLines.push(fmtLine(kind, r));
            });
        }
        for (const { E, chars, add } of per.values()) {
            const out = []; const done = [];
            E.lines.forEach(l => {
                const c = chars.find(ch => lineIsChar(l, ch));
                if (c) {
                    if (done.indexOf(c) < 0) { add.filter(a => a.char === c).forEach(a => out.push(a.line)); done.push(c); }
                    return;
                }
                out.push(l.raw);
            });
            add.filter(a => done.indexOf(a.char) < 0).forEach(a => out.push(a.line));
            await t.setLorebookEntries(E.book, [{ uid: E.uid, content: out.join('\n') }]);
        }
        if (createLines.length) {
            if (!primary) throw new Error('這張角色卡沒有綁角色世界書，存不進去');
            await t.createLorebookEntries(primary, [{ comment: kind === 'exp' ? WB_EXP : WB_PRESET, content: createLines.join('\n'), enabled: false, keys: WB_NEW_KEYS }]);
        }
        const V = VN(); if (V) V._lorebookLoaded = false;   // 舞台下次換立繪重讀
    }
    // 匯入清單：跟表情包同一種格式（第一行可以是 library:名字），一行 名字_表情:檔名 或 名字:檔名
    function parseImport(base, text) {
        const dir = String(base || '').trim().replace(/\/?$/, '/');
        const items = [];
        String(text || '').split('\n').map(l => l.trim()).filter(Boolean).forEach((line, i) => {
            if (i === 0 && line.indexOf('library:') === 0) return;
            const sep = line.indexOf(':');
            if (sep <= 0) return;
            let key = line.slice(0, sep).trim().replace(/\.(png|webp|jpe?g|gif)$/i, '');
            const file = line.slice(sep + 1).trim();
            if (!key || !file) return;
            const url = /^https?:\/\//i.test(file) ? file : ((dir === '/' ? '' : dir) + file);
            if (/_presets$/i.test(key)) { items.push({ kind: 'preset', name: key.replace(/_presets$/i, ''), exp: '', url }); return; }
            const u = key.lastIndexOf('_');
            const suf = u > 0 ? key.slice(u + 1) : '';
            if (u > 0 && /^[A-Za-z][A-Za-z0-9]*$/.test(suf)) items.push({ kind: 'exp', name: key.slice(0, u), exp: suf, url });
            else items.push({ kind: 'preset', name: key, exp: '', url });
        });
        return items;
    }

    // ================================================================
    // 網址探測
    // ================================================================
    const _probeMemo = new Map();
    function probe(url) {
        if (!url) return Promise.resolve(false);
        if (_probeMemo.has(url)) return _probeMemo.get(url);
        const p = new Promise(res => {
            const im = new Image(); let done = false;
            const fin = (ok) => { if (done) return; done = true; clearTimeout(to); res(ok); };
            const to = setTimeout(() => fin(false), 8000);
            im.onload = () => fin(true); im.onerror = () => fin(false);
            im.src = url;
        });
        if (url.indexOf('data:') !== 0) _probeMemo.set(url, p);
        return p;
    }

    // ================================================================
    // 某個角色「舞台會用哪張」——跟舞台一模一樣的順序
    // ================================================================
    async function worldEntries(store, ch) {
        const C = Cache(); if (!C || !C.getAllMeta) return [];
        const cur = C.getCurrentWorld();
        const all = await C.getAllMeta(store);
        return all.filter(e => C.worldOf(e) === cur && e.hasUrl && sameChar(String(C.bareKeyOf(e) || ''), ch));
    }
    async function resolveChar(ch, wb) {
        const cfg = Cfg();
        const locals = (await localAll()).filter(r => r && sameChar(r.name, ch));
        const exps = [];
        const addExp = (e) => { if (e && e !== DEFAULT_EXP && exps.indexOf(e) < 0) exps.push(e); };
        locals.forEach(r => addExp(r.exp));
        wbRowsFor(wb, 'exp', ch).forEach(r => addExp(r.exp));

        const lastWb = (kind, exp) => {
            let hit = null;
            (wb[kind] || []).forEach(E => E.lines.forEach(l => { if (lineIsChar(l, ch) && (kind !== 'exp' || l.exp === exp)) hit = l; }));
            return hit;
        };
        async function slot(exp) {
            const cands = [];
            const loc = locals.find(r => r.exp === exp);
            if (loc) cands.push({ source: 'local', label: '本地上傳', url: loc.data, isFile: loc.kind === 'file' });
            const w = lastWb(exp === DEFAULT_EXP ? 'preset' : 'exp', exp);
            if (w) cands.push({ source: 'wb', label: '世界書', url: w.url });
            const dirBase = exp === DEFAULT_EXP ? cfg.charDefaultBase : cfg.spriteBase;
            if (dirBase) variants(ch).forEach(v => cands.push({ source: 'dir', label: '網址庫', url: dirBase + v + (exp === DEFAULT_EXP ? '_presets.png' : '_' + exp + '.png'), quiet: true }));
            if (exp === DEFAULT_EXP) {
                const sp = await worldEntries('sprite_cache', ch);
                const C = Cache();
                for (const e of sp) { const full = await C.getRaw('sprite_cache', e.key); if (full && full.url) { cands.push({ source: 'sprite', label: '立繪庫', url: full.url }); break; } }
            }
            let used = null; const broken = [];
            for (const c of cands) {
                c.ok = await probe(c.url);
                if (c.ok) { used = c; break; }
                if (!c.quiet) broken.push(c);
            }
            return { exp, used, broken };
        }
        const slots = [await slot(DEFAULT_EXP)];
        for (const e of exps) slots.push(await slot(e));

        // 生成過的圖（這個故事的頭像快取＋立繪庫），滿意的可以收進圖鑑
        const gen = [];
        const C = Cache();
        for (const store of ['sprite_cache', 'avatar_cache']) {
            for (const e of await worldEntries(store, ch)) {
                gen.push({ store, key: e.key, label: store === 'sprite_cache' ? '立繪庫' : '頭像' });
            }
        }
        return { name: ch, slots, gen, ok: C != null };
    }
    function markOf(info, cast) {
        if (!info) return '';
        if (info.slots.some(s => s.broken.length)) return 'bad';
        if (!info.slots.some(s => s.used)) return 'empty';
        if (cast.length && !cast.some(c => sameChar(c, info.name))) return 'stranger';
        return '';
    }

    // ================================================================
    // 名單
    // ================================================================
    async function castNames() {
        const out = [];
        const add = (n) => { n = String(n || '').trim(); if (n && !out.some(x => sameChar(x, n))) out.push(n); };
        const V = VN();
        try { Object.keys((V && V.avatars) || {}).forEach(add); } catch (e) {}
        const C = Cache();
        if (C && C.getAllMeta) {
            try {
                const cur = C.getCurrentWorld();
                (await C.getAllMeta('avatar_cache')).forEach(e => { if (C.worldOf(e) === cur) add(C.bareKeyOf(e)); });
            } catch (e) {}
        }
        return out;
    }
    async function collectNames(cast, wb) {
        const out = [];
        const add = (n) => { n = String(n || '').trim(); if (n && !out.some(x => sameChar(x, n))) out.push(n); };
        cast.forEach(add);
        (await localAll()).forEach(r => add(r && r.name));
        ['preset', 'exp'].forEach(k => (wb[k] || []).forEach(E => E.lines.forEach(l => { if (l.parsed) add(l.name); })));
        const C = Cache();
        if (C && C.getAllMeta) {
            try {
                const cur = C.getCurrentWorld();
                (await C.getAllMeta('sprite_cache')).forEach(e => { if (C.worldOf(e) === cur) add(C.bareKeyOf(e)); });
            } catch (e) {}
        }
        (S && S.extra || []).forEach(add);
        return out;
    }

    // ================================================================
    // 畫面
    // ================================================================
    let S = null;

    // 開在哪裡：有兩個「螢幕」——
    //   大廳浮動手機的 app 區 #aps-app（fixed、z 99990，浮在奧瑞亞主窗口上面）
    //   奧瑞亞主窗口的螢幕 #aurelia-phone-screen
    //   🚨 浮動手機開著時一定要開在它裡面：開進主窗口的螢幕會被浮動手機整個蓋住。
    //   opts.from＝按下去的那顆鈕，它在哪個螢幕裡就開在那裡；兩個都沒有才蓋滿畫面。
    function shown(el) { return !!(el && el.getClientRects().length && el.clientWidth > 0 && el.clientHeight > 0); }
    function pickHost(opts) {
        const from = opts && opts.from;
        if (from && from.closest) {
            const inFrom = from.closest('#aps-app') || from.closest('#aurelia-phone-screen');
            if (inFrom) return inFrom;
        }
        const shellApp = doc.querySelector('#aurelia-phone-shell #aps-app');
        if (shown(shellApp)) return shellApp;
        const scr = doc.getElementById('aurelia-phone-screen');
        if (shown(scr)) return scr;
        return null;
    }

    async function open(name, opts) {
        if (S) close();
        const host = pickHost(opts);
        const root = doc.createElement('div');
        root.className = 'acg-root' + (host ? ' acg-in-screen' : '');
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.innerHTML =
            '<div class="acg-head">'
          +   '<button class="acg-back" type="button" data-act="close" aria-label="返回"><i class="fa-solid fa-chevron-left"></i></button>'
          +   '<div class="acg-title">角色圖鑑</div>'
          +   '<span class="acg-head-sp"></span>'
          + '</div>'
          + '<div class="acg-body">'
          +   '<aside class="acg-side">'
          +     '<div class="acg-tools">'
          +       '<input class="acg-search" type="text" placeholder="找角色">'
          +       '<button class="acg-tool" type="button" data-act="add-char" title="新增角色"><i class="fa-solid fa-user-plus"></i></button>'
          +       '<button class="acg-tool acg-wb-only" type="button" data-act="import" title="匯入清單"><i class="fa-solid fa-file-import"></i></button>'
          +     '</div>'
          +     '<div class="acg-list"></div>'
          +   '</aside>'
          +   '<main class="acg-main"></main>'
          + '</div>'
          + '<input class="acg-file" type="file" accept="image/*">';
        (host || doc.body).appendChild(root);
        S = { root, sel: null, want: name || '', names: [], cast: [], wb: { exp: [], preset: [] }, wbOk: wbAvailable(),
              info: {}, marks: {}, draft: null, extra: [], changed: false, token: 0, filter: '' };
        root.classList.toggle('acg-has-wb', S.wbOk);
        root.addEventListener('click', onClick);
        root.addEventListener('input', onInput);
        root.querySelector('.acg-file').addEventListener('change', onFile);
        doc.addEventListener('keydown', onKey, true);
        await reload();
    }

    function close() {
        if (!S) return;
        const st = S; S = null;
        doc.removeEventListener('keydown', onKey, true);
        st.root.remove();
        if (st.changed) refreshStage();
    }
    function onKey(ev) {
        if (ev.key !== 'Escape' || !S) return;
        if (doc.querySelector('.aud-mask.on, .opv-root')) return;   // 小窗或看圖開著時先關那個
        ev.preventDefault(); close();
    }
    // 關掉時如果改過圖，舞台上現在站著的人重新找一次圖
    function refreshStage() {
        const V = VN();
        if (!V || !V._stage) return;
        V._lorebookLoaded = false;
        V._stage.forEach((s, i) => { if (s && s.name) { try { V._renderSlot(i, s.name, s.exp); } catch (e) {} } });
    }

    async function reload() {
        if (!S) return;
        const tk = ++S.token;
        S.root.querySelector('.acg-list').innerHTML = '<div class="acg-loading">載入中…</div>';
        localInvalidate();
        S.wb = await wbLoad();
        S.cast = await castNames();
        S.names = await collectNames(S.cast, S.wb);
        if (!S || tk !== S.token) return;
        S.info = {}; S.marks = {};
        const want = S.want || S.sel;
        S.want = '';
        S.sel = (want && (S.names.find(n => sameChar(n, want)) || (S.names.push(want), want))) || S.names[0] || null;
        renderList();
        await renderMain();
        scanMarks(tk);
    }
    // 名單上的記號在背景一個一個算（要試網址，一次全開會把圖床打爆）
    async function scanMarks(tk) {
        for (const n of S ? S.names.slice() : []) {
            if (!S || tk !== S.token) return;
            if (!S.info[n]) S.info[n] = await resolveChar(n, S.wb);
            if (!S || tk !== S.token) return;
            S.marks[n] = markOf(S.info[n], S.cast);
            paintItem(n);
        }
    }

    const MARK_TXT = { bad: '有網址打不開', empty: '還沒有圖', stranger: '這個故事沒有這個名字' };
    function itemThumb(n) {
        const info = S.info[n];
        const used = info && (info.slots.find(s => s.used) || {}).used;
        return used ? '<img src="' + esc(used.url) + '" alt="">' : '<span class="acg-item-initial">' + esc(n.slice(0, 1)) + '</span>';
    }
    function renderList() {
        const list = S.root.querySelector('.acg-list');
        const f = S.filter.trim();
        const names = f ? S.names.filter(n => n.indexOf(f) >= 0 || sameChar(n, f)) : S.names;
        if (!S.names.length) {
            list.innerHTML = '<div class="acg-empty-list">還沒有角色</div>';
            return;
        }
        if (!names.length) { list.innerHTML = '<div class="acg-empty-list">找不到「' + esc(f) + '」</div>'; return; }
        list.innerHTML = names.map(n =>
            '<button class="acg-item' + (n === S.sel ? ' is-on' : '') + '" type="button" data-act="pick" data-name="' + esc(n) + '">'
          +   '<span class="acg-item-thumb">' + itemThumb(n) + '</span>'
          +   '<span class="acg-item-name">' + esc(n) + '</span>'
          +   '<span class="acg-mark' + (S.marks[n] ? ' acg-mark-' + S.marks[n] : '') + '" title="' + esc(MARK_TXT[S.marks[n]] || '') + '"></span>'
          + '</button>').join('');
    }
    function paintItem(n) {
        if (!S) return;
        const el = Array.prototype.find.call(S.root.querySelectorAll('.acg-item'), b => b.dataset.name === n);
        if (!el) return;
        el.querySelector('.acg-item-thumb').innerHTML = itemThumb(n);
        const m = el.querySelector('.acg-mark');
        m.className = 'acg-mark' + (S.marks[n] ? ' acg-mark-' + S.marks[n] : '');
        m.title = MARK_TXT[S.marks[n]] || '';
    }

    async function renderMain() {
        const main = S.root.querySelector('.acg-main');
        const ch = S.sel;
        if (!ch) {
            main.innerHTML = '<div class="acg-empty-main"><i class="fa-solid fa-user-plus"></i><div class="acg-empty-title">還沒有角色</div>'
              + '<div class="acg-empty-acts"><button class="acg-btn acg-btn-main" type="button" data-act="add-char">新增角色</button>'
              + (S.wbOk ? '<button class="acg-btn" type="button" data-act="import">匯入清單</button>' : '') + '</div></div>';
            return;
        }
        main.innerHTML = '<div class="acg-loading">載入中…</div>';
        const tk = S.token;
        const info = S.info[ch] || (S.info[ch] = await resolveChar(ch, S.wb));
        if (!S || S.sel !== ch || tk !== S.token) return;
        S.marks[ch] = markOf(info, S.cast);
        paintItem(ch);
        S.draft = { preset: wbRowsFor(S.wb, 'preset', ch), exp: wbRowsFor(S.wb, 'exp', ch) };

        const stranger = S.marks[ch] === 'stranger';
        let h = '<div class="acg-main-head"><div class="acg-name">' + esc(ch) + '</div>'
              + (stranger ? '<div class="acg-note acg-note-stranger"><i class="fa-solid fa-circle-exclamation"></i> 這個故事沒有叫這個名字的角色</div>' : '')
              + '</div>';

        h += '<div class="acg-slots">' + info.slots.map(slotCard).join('')
           + '<button class="acg-slot acg-slot-add" type="button" data-act="add-exp"><i class="fa-solid fa-plus"></i><span>加表情</span></button></div>';

        if (info.gen.length) {
            h += '<section class="acg-sec"><div class="acg-sec-title">生成過的圖</div><div class="acg-gen">'
               + info.gen.map((g, i) =>
                    '<div class="acg-gen-card" data-gen="' + i + '">'
                  +   '<div class="acg-gen-img" data-act="view-gen" data-gen="' + i + '"></div>'
                  +   '<div class="acg-gen-foot"><span class="acg-src">' + esc(g.label) + '</span>'
                  +   '<button class="acg-mini" type="button" data-act="keep-gen" data-gen="' + i + '"><i class="fa-solid fa-thumbtack"></i> 收進圖鑑</button></div>'
                  + '</div>').join('')
               + '</div></section>';
        }

        if (S.wbOk) {
            h += '<section class="acg-sec"><div class="acg-sec-title">世界書條目</div>'
               + wbEditor('preset', '角色預設立繪素材') + wbEditor('exp', '角色表情立繪') + '</section>';
        }
        main.innerHTML = h;
        main.scrollTop = 0;
        fillGenThumbs(info, tk);
    }
    async function fillGenThumbs(info, tk) {
        const C = Cache(); if (!C) return;
        for (let i = 0; i < info.gen.length; i++) {
            if (!S || tk !== S.token || S.sel !== info.name) return;
            const g = info.gen[i];
            if (!g.url) { const full = await C.getRaw(g.store, g.key); g.url = (full && full.url) || ''; }
            const box = S.root.querySelector('.acg-gen-img[data-gen="' + i + '"]');
            if (box && g.url) box.innerHTML = '<img src="' + esc(g.url) + '" alt="" loading="lazy">';
        }
    }
    function slotCard(s) {
        const u = s.used;
        const cls = 'acg-slot' + (u ? '' : ' is-empty') + (s.broken.length ? ' is-bad' : '');
        let state = '';
        if (s.broken.length) state = '<div class="acg-slot-state acg-state-bad"><i class="fa-solid fa-link-slash"></i> ' + esc(s.broken.map(b => b.label).join('、')) + '的網址打不開</div>';
        else if (!u) state = '<div class="acg-slot-state">' + (s.exp === DEFAULT_EXP ? '沒有圖' : '沒有圖，會用預設') + '</div>';
        const localUsed = u && u.source === 'local';
        return '<div class="' + cls + '">'
          + '<div class="acg-slot-img"' + (u ? ' data-act="view" data-exp="' + esc(s.exp) + '"' : '') + '>'
          +   (u ? '<img src="' + esc(u.url) + '" alt="" loading="lazy">' : '<i class="fa-regular fa-image"></i>')
          + '</div>'
          + '<div class="acg-slot-meta"><span class="acg-slot-exp">' + esc(expLabel(s.exp)) + '</span>'
          +   (u ? '<span class="acg-src acg-src-' + u.source + '">' + esc(u.label) + '</span>' : '') + '</div>'
          + state
          + '<div class="acg-slot-acts">'
          +   '<button class="acg-mini" type="button" data-act="upload" data-exp="' + esc(s.exp) + '"><i class="fa-solid fa-upload"></i> 上傳</button>'
          +   '<button class="acg-mini" type="button" data-act="paste" data-exp="' + esc(s.exp) + '"><i class="fa-solid fa-link"></i> 網址</button>'
          +   (localUsed ? '<button class="acg-mini acg-mini-icon" type="button" data-act="del-local" data-exp="' + esc(s.exp) + '" aria-label="移除本地上傳"><i class="fa-solid fa-trash"></i></button>' : '')
          + '</div></div>';
    }
    function wbEditor(kind, title) {
        const rows = S.draft[kind];
        return '<div class="acg-wb" data-kind="' + kind + '">'
          + '<div class="acg-wb-head"><span class="acg-wb-title">' + esc(title) + '</span>'
          +   '<button class="acg-mini acg-mini-icon" type="button" data-act="wb-add" data-kind="' + kind + '" aria-label="加一行"><i class="fa-solid fa-plus"></i></button></div>'
          + (rows.length ? rows.map((r, i) =>
                '<div class="acg-wb-row' + (kind === 'exp' ? ' acg-wb-row-exp' : '') + '">'
              +   (kind === 'exp' ? '<input class="acg-in" type="text" data-kind="' + kind + '" data-i="' + i + '" data-f="exp" placeholder="表情" value="' + esc(r.exp) + '">' : '')
              +   '<input class="acg-in acg-in-url" type="text" data-kind="' + kind + '" data-i="' + i + '" data-f="url" placeholder="網址" value="' + esc(r.url) + '">'
              +   '<input class="acg-in" type="text" data-kind="' + kind + '" data-i="' + i + '" data-f="aliases" placeholder="別名" value="' + esc(r.aliases) + '">'
              +   '<button class="acg-mini acg-mini-icon" type="button" data-act="wb-del" data-kind="' + kind + '" data-i="' + i + '" aria-label="刪這一行"><i class="fa-solid fa-minus"></i></button>'
              + '</div>').join('')
            : '<div class="acg-wb-none">沒有這個角色的行</div>')
          + '<div class="acg-wb-foot"><button class="acg-btn acg-btn-main" type="button" data-act="wb-save" data-kind="' + kind + '"><i class="fa-solid fa-floppy-disk"></i> 保存</button></div>'
          + '</div>';
    }
    function rerenderEditor(kind) {
        const box = S.root.querySelector('.acg-wb[data-kind="' + kind + '"]');
        if (box) box.outerHTML = wbEditor(kind, kind === 'exp' ? '角色表情立繪' : '角色預設立繪素材');
    }

    // 改完之後：清掉這個角色算好的結果，重畫
    async function afterChange(ch) {
        S.changed = true;
        delete S.info[ch];
        if (S.wbOk) S.wb = await wbLoad();
        if (!S.names.some(n => sameChar(n, ch))) S.names.push(ch);
        await renderMain();
    }

    function onInput(ev) {
        const t = ev.target;
        if (t.classList.contains('acg-search')) { S.filter = t.value; renderList(); return; }
        if (t.classList.contains('acg-in') && S.draft) {
            const row = S.draft[t.dataset.kind] && S.draft[t.dataset.kind][+t.dataset.i];
            if (row) row[t.dataset.f] = t.value;
        }
    }

    async function onClick(ev) {
        const b = ev.target.closest('[data-act]');
        if (!b || !S || !S.root.contains(b)) return;
        const act = b.dataset.act;
        const A = AUIx();
        const ch = S.sel;
        try {
            if (act === 'close') { close(); return; }
            if (act === 'pick') { S.sel = b.dataset.name; renderList(); await renderMain(); return; }
            if (act === 'add-char') {
                const n = A && await A.prompt('角色叫什麼名字', '');
                if (n == null || !String(n).trim()) return;
                const nm = String(n).trim();
                if (!S.names.some(x => sameChar(x, nm))) { S.names.push(nm); S.extra.push(nm); }
                S.sel = S.names.find(x => sameChar(x, nm));
                renderList(); await renderMain(); return;
            }
            if (act === 'view') {
                const info = S.info[ch]; const s = info && info.slots.find(x => x.exp === b.dataset.exp);
                const items = info.slots.filter(x => x.used).map(x => ({ src: x.used.url, who: ch, desc: expLabel(x.exp) + '・' + x.used.label }));
                const idx = Math.max(0, info.slots.filter(x => x.used).indexOf(s));
                const PV = win.OS_PHOTO_VIEWER || window.OS_PHOTO_VIEWER;
                if (PV) PV.open(items, idx, { fromEl: b.querySelector('img') });
                return;
            }
            if (act === 'view-gen') {
                const info = S.info[ch]; const withUrl = info.gen.filter(g => g.url);
                const g = info.gen[+b.dataset.gen];
                const PV = win.OS_PHOTO_VIEWER || window.OS_PHOTO_VIEWER;
                if (PV && g && g.url) PV.open(withUrl.map(x => ({ src: x.url, who: ch, desc: x.label })), withUrl.indexOf(g), { fromEl: b.querySelector('img') });
                return;
            }
            if (act === 'add-exp') {
                const e = A && await A.prompt('表情叫什麼（跟劇情裡寫的一樣，例如 Happy）', '');
                if (e == null) return;
                const exp = String(e).trim();
                if (!exp) return;
                if (!/^[A-Za-z][A-Za-z0-9]*$/.test(exp)) { toast('表情名要用英文字母', 'warn'); return; }
                S.pendingExp = exp;
                S.root.querySelector('.acg-file').click();
                return;
            }
            if (act === 'upload') { S.pendingExp = b.dataset.exp; S.root.querySelector('.acg-file').click(); return; }
            if (act === 'paste') {
                const exp = b.dataset.exp;
                const url = A && await A.prompt(expLabel(exp) + '的圖片網址', '');
                if (url == null) return;
                const u = String(url).trim();
                if (!/^https?:\/\//i.test(u)) { if (u) toast('網址要以 http 開頭', 'warn'); return; }
                if (!(await probe(u))) { if (!(A && await A.confirm('這個網址現在打不開，還是要存嗎？'))) return; }
                if (S.wbOk) {
                    const kind = exp === DEFAULT_EXP ? 'preset' : 'exp';
                    const rows = wbRowsFor(S.wb, kind, ch);
                    const same = rows.filter(r => kind === 'preset' || r.exp === exp);
                    if (same.length) same[same.length - 1].url = u;
                    else rows.push({ name: ch, exp: kind === 'exp' ? exp : '', url: u, aliases: '' });
                    await wbSaveMany(S.wb, kind, [{ char: ch, rows }]);
                    toast('存進世界書了', 'success');
                } else {
                    await localSave(ch, exp, u, 'url');
                    toast('存好了', 'success');
                }
                await afterChange(ch);
                return;
            }
            if (act === 'del-local') {
                const exp = b.dataset.exp;
                if (!(A && await A.confirm('移除「' + expLabel(exp) + '」的本地上傳？'))) return;
                await localDelete(ch, exp);
                await afterChange(ch);
                return;
            }
            if (act === 'keep-gen') {
                const g = S.info[ch].gen[+b.dataset.gen];
                if (!g) return;
                if (!g.url) { const full = await Cache().getRaw(g.store, g.key); g.url = (full && full.url) || ''; }
                if (!g.url || g.url.indexOf('blob:') === 0) { toast('這張還沒存好，收不進來', 'warn'); return; }
                if (await localFind(ch, DEFAULT_EXP)) { if (!(A && await A.confirm('「預設」已經有本地上傳的圖，要換成這張嗎？'))) return; }
                const data = g.url.indexOf('data:') === 0 ? await shrink(g.url) : g.url;
                await localSave(ch, DEFAULT_EXP, data, g.url.indexOf('data:') === 0 ? 'file' : 'url');
                toast('收進「預設」了', 'success');
                await afterChange(ch);
                return;
            }
            if (act === 'wb-add') {
                const kind = b.dataset.kind;
                S.draft[kind].push({ entryKey: '', name: ch, exp: '', url: '', aliases: '' });
                rerenderEditor(kind);
                const ins = S.root.querySelectorAll('.acg-wb[data-kind="' + kind + '"] .acg-in');
                if (ins.length) ins[kind === 'exp' ? ins.length - 3 : ins.length - 2].focus();
                return;
            }
            if (act === 'wb-del') { S.draft[b.dataset.kind].splice(+b.dataset.i, 1); rerenderEditor(b.dataset.kind); return; }
            if (act === 'wb-save') {
                const kind = b.dataset.kind;
                const rows = S.draft[kind];
                if (kind === 'exp' && rows.some(r => r.url && !String(r.exp || '').trim())) { toast('有一行沒填表情', 'warn'); return; }
                b.disabled = true;
                await wbSaveMany(S.wb, kind, [{ char: ch, rows }]);
                toast('世界書存好了', 'success');
                await afterChange(ch);
                return;
            }
            if (act === 'import') {
                const base = A && await A.prompt('圖片放在哪個資料夾（網址）', '');
                if (base == null) return;
                const text = A && await A.prompt('貼上檔名清單，一行一張：名字_表情:檔名 或 名字:檔名', '', { multiline: true });
                if (text == null) return;
                const items = parseImport(base, text);
                if (!items.length) { toast('清單裡沒有認得的行', 'warn'); return; }
                const chars = [];
                items.forEach(it => { if (!chars.some(c => sameChar(c, it.name))) chars.push(it.name); });
                if (!(A && await A.confirm('要把 ' + items.length + ' 張圖（' + chars.length + ' 個角色）加進世界書嗎？同一個角色同一個表情原本有的會換成新的。'))) return;
                for (const kind of ['preset', 'exp']) {
                    const mine = items.filter(it => it.kind === kind);
                    if (!mine.length) continue;
                    const changes = [];
                    chars.forEach(c => {
                        const add = mine.filter(it => sameChar(it.name, c));
                        if (!add.length) return;
                        const rows = wbRowsFor(S.wb, kind, c);
                        add.forEach(it => {
                            const same = rows.filter(r => kind === 'preset' || r.exp === it.exp);
                            if (same.length) same[same.length - 1].url = it.url;
                            else rows.push({ name: it.name, exp: it.exp, url: it.url, aliases: '' });
                        });
                        changes.push({ char: c, rows });
                    });
                    await wbSaveMany(S.wb, kind, changes);
                    S.wb = await wbLoad();
                }
                toast('匯入好了', 'success');
                S.changed = true;
                await reload();
                return;
            }
        } catch (e) {
            const msg = (e && e.message) || String(e);
            try { A ? A.alert('沒存成功：' + msg, { type: 'error' }) : toast(msg, 'error'); } catch (_) {}
            if (b) b.disabled = false;
        }
    }

    async function onFile(ev) {
        const input = ev.target;
        const file = input.files && input.files[0];
        input.value = '';
        if (!file || !S || !S.sel) return;
        const exp = S.pendingExp || DEFAULT_EXP;
        S.pendingExp = '';
        try {
            const data = await shrink(await fileToDataUrl(file));
            await localSave(S.sel, exp, data, 'file');
            toast('「' + expLabel(exp) + '」上傳好了', 'success');
            await afterChange(S.sel);
        } catch (e) {
            toast('上傳失敗：' + ((e && e.message) || e), 'error');
        }
    }

    // 插圖參考圖用：只看她自己放的圖（本地上傳 → 世界書 → 網址庫），不拿立繪庫與 AI 頭像。
    //   預設格優先（最完整的一張），沒有再看 Neutral 表情。回傳第一張打得開的網址，沒有就回空字串。
    async function userRefUrl(name) {
        const V = VN(); const cfg = Cfg();
        if (V && !V._lorebookLoaded && V._loadLorebookAvatars) { try { await V._loadLorebookAvatars(); V._lorebookLoaded = true; } catch (e) {} }
        const vs = variants(name);
        const first = async (urls) => { for (const u of urls) { if (u && await probe(u)) return u; } return ''; };
        const def = [];
        const ld = await localUrl(name, DEFAULT_EXP); if (ld) def.push(ld);
        vs.forEach(v => { const u = V && V._lorebookSpriteCache && V._lorebookSpriteCache[v]; if (u) def.push(u); });
        if (cfg.charDefaultBase) vs.forEach(v => def.push(cfg.charDefaultBase + v + '_presets.png'));
        const hit = await first(def);
        if (hit) return hit;
        const neu = [];
        const ln = await localUrl(name, 'Neutral'); if (ln) neu.push(ln);
        vs.forEach(v => { const u = V && V._lorebookExpCache && V._lorebookExpCache[v + '_Neutral']; if (u) neu.push(u); });
        if (cfg.spriteBase) vs.forEach(v => neu.push(cfg.spriteBase + v + '_Neutral.png'));
        return await first(neu);
    }

    win.OS_CHAR_GALLERY = { open, close, localUrl, userRefUrl, _test: { parseLine, parseImport, wbSaveMany, wbRowsFor, fmtLine, sameChar } };
    if (win !== window) window.OS_CHAR_GALLERY = win.OS_CHAR_GALLERY;
})();
