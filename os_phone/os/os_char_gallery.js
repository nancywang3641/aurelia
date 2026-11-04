// ----------------------------------------------------------------
// [檔案] os_char_gallery.js
// 路徑：os_phone/os/os_char_gallery.js
// 職責：角色圖鑑——看每個角色舞台會用哪張立繪、哪裡缺圖、哪個網址壞了；在這裡加圖、改世界書條目。
// 暴露：window.OS_CHAR_GALLERY = { open(name?), close(), localUrl(name, exp) }
//
// 🔴 找圖順序只有一份（2026-09-14 她定）：本地上傳 → 世界書 → 網址庫 → 立繪庫 → AI 頭像。
//    舞台（vn_core_stage.js）、圖鑑、之後的插圖參考圖都照這個順序。改順序三邊一起改。
//    表情格：本地上傳(表情) → 【素材-角色表情立繪】 → 立繪目錄/名字_表情.png → 意思最近的表情（nearExp）
//    預設格：本地上傳(預設) → 【素材-角色預設立繪素材】 → 角色預設圖目錄/名字_presets.png → 立繪庫
//    表情格找不到時舞台會往下用預設格。
// 🎭 生一組表情（11-04）：拿預設那張，ComfyUI 只重畫臉那一圈，存成本地上傳的表情格（EXPR_SET；畫法在 OS_IMAGE_MANAGER.comfyInpaint）
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
        if (va.some(x => vb.indexOf(x) >= 0)) return true;
        // 劇情寫簡體（指令規定）、圖鑑和世界書多半是繁體：折成同一把鑰匙也算同一個人（11-04 動嘴對不上名字）
        const Z = win.OS_ZH || window.OS_ZH;
        return !!(Z && Z.key && a && b && Z.key(a) === Z.key(b));
    }
    // 「生一組表情」那幾種寫中文（劇情裡照樣寫英文，對照在 EXPR_SET），其他照她取的名字
    const expLabel = (exp) => (exp === DEFAULT_EXP ? '預設' : ((EXPR_SET.find(x => x.exp === exp) || {}).zh || exp));

    // 🔒 奧瑞亞官方立繪（管理員＋丹、雷伊在大廳那張）：名冊在 LobbyNpcs.official，名單最後一區，只能看、不能換。
    //   跟上面那套找圖順序無關：官方那張只在小劇場的舞台用（VN_Core._officialSprite），她故事裡同名的別人照舊。
    function officialList() {
        try { const N = win.LobbyNpcs || window.LobbyNpcs; return (N && N.official) ? N.official() : []; } catch (e) { return []; }
    }
    try {
        const A = AUIx();
        if (A && A.registerHelp) A.registerHelp({
            acg_official: { title: '奧瑞亞官方立繪', body: '大廳的管理員（還有丹、雷伊）的固定立繪，跟著奧瑞亞一起來的，這裡換不了。\n大廳、小機培養室的小劇場、地圖番外遇到這幾位，舞台都用這張，不會另外生圖。\n你自己的故事裡如果也有同名的角色，那是另一個角色，照舊用自己的圖。' },
            acg_expr: { title: '生一組表情', body: '拿這個角色「預設」那張圖，只重畫臉那一圈，做出微笑、生氣、哭這些表情。身體、衣服、頭髮都不會變。\n劇情寫到哪個表情，舞台就換那張；寫的字不一樣（像 Smiling、Furious）也會找意思最近的那張。\n劇情沒寫表情的話（選了「不寫」、或在視差世界裡），在劇情 CTX 小窗或開頭那排把「表情」選成「副模型補」：副模型讀劇本時會順便替有表情圖的角色挑。\n圈圈是會重畫的地方：從眉毛到下巴就好，瀏海留在圈外，每張的頭髮才會一樣。\n「講話會動嘴」開著的話，每張圖會順便做微張、張開兩種嘴；劇情裡他講話時，字在跑、配音在響，嘴就會開合。圈裡那個小圈就是嘴的位置，跟著大圈走。大笑、驚訝嘴本來就開著，不做。\n「內收」給靦腆、冷淡、壓抑的角色：表情動作小、嘴巴多半閉著，生氣是冷冷瞪著、哭是忍著淚。每個角色記得自己選哪個；換了就整組重做。\n用什麼畫看設置→圖片「每個地方用什麼」的「立繪表情」那列（沒選就跟「立繪」那列用同一個）：\n・選 ComfyUI 的包：一個表情畫一次，不用錢。\n・選自訂接口（GPT 那種）：一次把七個表情一起畫好，顏色跟原圖最接近；開著講話會動嘴的話再多畫一次做嘴。每次都會花一點生圖的錢，只存你選的那幾個。\n換了預設那張圖，表情要重做，不然換表情時身體會對不上。' }
        });
    } catch (e) {}

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
    // 世界書：酒館走酒館助手；網頁版（10-20 補齊）走手機自己的書包——「角色卡主書」＝這本故事掛的第一本書包，
    //   讀的順序跟舞台（VN_Core._loadLorebookAvatars）一樣：常駐書包 → 這本故事的書包
    // ================================================================
    function _pwa() { try { return !!(win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()); } catch (e) { return false; } }
    function _lb() { return _pwa() ? ((win.OS_WORLDBOOK && win.OS_WORLDBOOK.lorebookApi) || null) : TH(); }
    function _storyPacks() { try { return (win.OS_WORLDBOOK && win.OS_WORLDBOOK.getActivePacks && win.OS_WORLDBOOK.getActivePacks()) || []; } catch (e) { return []; } }
    function wbAvailable() {
        const t = _lb();
        return !!(t && t.getLorebookEntries && t.setLorebookEntries && t.createLorebookEntries);
    }
    function charPrimary() {
        if (_pwa()) { const g = (_lb().getGlobalWorldbookNames && _lb().getGlobalWorldbookNames()) || []; return _storyPacks().find(p => g.indexOf(p) < 0) || ''; }
        try { const c = TH().getCharLorebooks(); return (c && c.primary) || ''; } catch (e) { return ''; }
    }
    // 讀的順序跟舞台一樣（全域 → 角色卡主 → 角色卡附加），同一個名字後讀到的蓋前面
    function wbBooks() {
        const t = _lb(); const out = [];
        const add = (b) => { if (b && out.indexOf(b) < 0) out.push(b); };
        if (_pwa()) {
            try { ((t.getGlobalWorldbookNames && t.getGlobalWorldbookNames()) || []).forEach(add); } catch (e) {}
            _storyPacks().forEach(add);
            return out;
        }
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
        const t = _lb();
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
        const t = _lb();
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
              info: {}, marks: {}, draft: null, extra: [], changed: false, token: 0, filter: '', offSel: null };
        root.classList.toggle('acg-has-wb', S.wbOk);
        root.addEventListener('click', onClick);
        root.addEventListener('input', onInput);
        root.querySelector('.acg-file').addEventListener('change', onFile);
        doc.addEventListener('keydown', onKey, true);
        await reload();
    }

    function close() {
        if (!S) return;
        if (S.ex) S.ex.stop = true;   // 生表情生到一半：做好的已經存了，後面的不排了
        const st = S; S = null;
        doc.removeEventListener('keydown', onKey, true);
        st.root.remove();
        if (st.changed) refreshStage();
    }
    function onKey(ev) {
        if (ev.key !== 'Escape' || !S) return;
        if (doc.querySelector('.aud-mask.on, .opv-root')) return;   // 小窗或看圖開著時先關那個
        ev.preventDefault();
        if (S.ex) { exClose(); return; }   // 生表情那頁開著：先回圖鑑
        close();
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
        const offs = officialList().filter(o => !f || [o.name].concat(o.aliases).some(a => a.indexOf(f) >= 0));
        let h;
        if (!S.names.length) h = (f || offs.length) ? '' : '<div class="acg-empty-list">還沒有角色</div>';   // 有官方那區時右邊會寫「還沒有角色」，名單不重複
        else h = names.map(n =>
            '<button class="acg-item' + (!S.offSel && n === S.sel ? ' is-on' : '') + '" type="button" data-act="pick" data-name="' + esc(n) + '">'
          +   '<span class="acg-item-thumb">' + itemThumb(n) + '</span>'
          +   '<span class="acg-item-name">' + esc(n) + '</span>'
          +   '<span class="acg-mark' + (S.marks[n] ? ' acg-mark-' + S.marks[n] : '') + '" title="' + esc(MARK_TXT[S.marks[n]] || '') + '"></span>'
          + '</button>').join('');
        if (offs.length) {
            h += '<div class="acg-group"><i class="fa-solid fa-lock"></i><span>奧瑞亞官方</span></div>'
               + offs.map(o =>
                    '<button class="acg-item acg-item-official' + (S.offSel === o.key ? ' is-on' : '') + '" type="button" data-act="pick-official" data-key="' + esc(o.key) + '">'
                  +   '<span class="acg-item-thumb"><img src="' + esc(o.portrait) + '" alt="" loading="lazy"></span>'
                  +   '<span class="acg-item-name">' + esc(o.name) + '</span>'
                  + '</button>').join('');
        }
        if (!h) h = '<div class="acg-empty-list">找不到「' + esc(f) + '」</div>';
        list.innerHTML = h;
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

    // 官方那位：一張圖、鎖頭、小問號，沒有上傳／網址／世界書
    function renderOfficial(main) {
        const o = officialList().find(x => x.key === S.offSel);
        if (!o) { S.offSel = null; return false; }
        const A = AUIx();
        main.innerHTML = '<div class="acg-main-head">'
          +   '<div class="acg-name-row"><div class="acg-name">' + esc(o.name) + '</div>' + (A && A.helpBtn ? A.helpBtn('acg_official') : '') + '</div>'
          +   (o.subTitle ? '<div class="acg-sub">' + esc(o.subTitle) + '</div>' : '')
          + '</div>'
          + '<div class="acg-slots"><div class="acg-slot">'
          +   '<div class="acg-slot-img" data-act="view-official"><img src="' + esc(o.portrait) + '" alt=""></div>'
          +   '<div class="acg-slot-meta"><span class="acg-slot-exp">預設</span><span class="acg-src acg-src-official"><i class="fa-solid fa-lock"></i> 奧瑞亞官方</span></div>'
          + '</div></div>';
        main.scrollTop = 0;
        return true;
    }

    async function renderMain() {
        const main = S.root.querySelector('.acg-main');
        if (S.offSel && renderOfficial(main)) return;
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

        const M = win.OS_IMAGE_MANAGER;
        const canExpr = !!(M && M.comfyInpaint) && (info.slots.some(s => s.exp === DEFAULT_EXP && s.used) || info.gen.length > 0);
        h += '<div class="acg-slots">' + info.slots.map(slotCard).join('')
           + '<button class="acg-slot acg-slot-add" type="button" data-act="add-exp"><i class="fa-solid fa-plus"></i><span>加表情</span></button>'
           + (canExpr ? '<button class="acg-slot acg-slot-add" type="button" data-act="expr-open"><i class="fa-solid fa-wand-magic-sparkles"></i><span>生表情</span></button>' : '')
           + '</div>';

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
        fillMouthTags(info, tk);
    }
    // 表情格標「會動嘴」：那張圖有對得上的嘴才亮（背景一格一格算，要讀圖比對）
    async function fillMouthTags(info, tk) {
        let names = [];
        try { names = (await mouthNames()).filter(k => sameChar(k, info.name)); } catch (e) { return; }
        if (!names.length) return;
        const entries = [];
        for (const n of names) { const d = await mouthLoad(n); Object.keys(d.entries).forEach(k => entries.push({ exp: k, e: d.entries[k] })); }
        for (const sl of info.slots) {
            if (!S || tk !== S.token || S.sel !== info.name) return;
            if (!sl.used) continue;
            const cand = entries.filter(x => x.exp === sl.exp);
            if (!cand.length) continue;
            let im = null;
            try { im = await loadImg(sl.used.url); } catch (e) { continue; }
            const key = srcKey(sl.used.url);
            let ok = false;
            try { ok = cand.some(x => mouthFits(x.e, im, key)); } catch (e) {}
            if (!S || tk !== S.token) return;   // 等讀圖的時候圖鑑被關掉了
            const card = S.root.querySelector('.acg-slot[data-exp="' + sl.exp + '"]');
            if (card) card.classList.toggle('has-mouth', ok);
        }
    }
    async function fillGenThumbs(info, tk) {
        const C = Cache(); if (!C) return;
        for (let i = 0; i < info.gen.length; i++) {
            if (!S || tk !== S.token || S.sel !== info.name) return;
            const g = info.gen[i];
            if (!g.url) { const full = await C.getRaw(g.store, g.key); g.url = (full && full.url) || ''; }
            if (!S || tk !== S.token) return;   // 等讀圖的時候圖鑑被關掉了
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
        return '<div class="' + cls + '" data-exp="' + esc(s.exp) + '">'
          + '<div class="acg-slot-img"' + (u ? ' data-act="view" data-exp="' + esc(s.exp) + '"' : '') + '>'
          +   (u ? '<img src="' + esc(u.url) + '" alt="" loading="lazy">' : '<i class="fa-regular fa-image"></i>')
          + '</div>'
          + '<div class="acg-slot-meta"><span class="acg-slot-exp">' + esc(expLabel(s.exp)) + '</span>'
          +   (u ? '<span class="acg-src acg-src-' + u.source + '">' + esc(u.label) + '</span>' : '')
          +   '<span class="acg-mouth-tag" title="講話會動嘴"><i class="fa-solid fa-comment-dots"></i></span></div>'
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
            if (act === 'expr-open') { await exOpen(ch); return; }
            if (act === 'expr-close') { exClose(); return; }
            if (act === 'expr-pick') { exPick(b.dataset.exp); return; }
            if (act === 'expr-style') { exStyle(b.dataset.style); return; }
            if (act === 'expr-mouth') { exMouth(); return; }
            if (act === 'expr-go') { await exGo(); return; }
            if (act === 'expr-view') {
                const done = S.ex ? S.ex.done.filter(r => r.url) : [];
                const PV = win.OS_PHOTO_VIEWER || window.OS_PHOTO_VIEWER;
                const r = done.find(x => x.exp === b.dataset.exp);
                if (PV && r) PV.open(done.map(x => ({ src: x.url, who: S.ex.ch, desc: x.zh })), done.indexOf(r), { fromEl: b.querySelector('img') });
                return;
            }
            if (act === 'pick') { S.sel = b.dataset.name; S.offSel = null; renderList(); await renderMain(); return; }
            if (act === 'pick-official') { S.offSel = b.dataset.key; renderList(); await renderMain(); return; }
            if (act === 'view-official') {
                const o = officialList().find(x => x.key === S.offSel);
                const PV = win.OS_PHOTO_VIEWER || window.OS_PHOTO_VIEWER;
                if (PV && o) PV.open([{ src: o.portrait, who: o.name, desc: '奧瑞亞官方' }], 0, { fromEl: b.querySelector('img') });
                return;
            }
            if (act === 'add-char') {
                const n = A && await A.prompt('角色叫什麼名字', '');
                if (n == null || !String(n).trim()) return;
                const nm = String(n).trim();
                if (!S.names.some(x => sameChar(x, nm))) { S.names.push(nm); S.extra.push(nm); }
                S.sel = S.names.find(x => sameChar(x, nm)); S.offSel = null;
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
                if (ins.length) {
                    const el = ins[kind === 'exp' ? ins.length - 3 : ins.length - 2];
                    // focus 自己會連外層一起捲（整個圖鑑窗被帶歪）：不讓它捲，改成只把新的那行所在那一格捲到看得見
                    el.focus({ preventScroll: true });
                    let box = el.parentElement;
                    while (box && box !== S.root.parentElement) {
                        const oy = getComputedStyle(box).overflowY;
                        if ((oy === 'auto' || oy === 'scroll') && box.scrollHeight > box.clientHeight) break;
                        box = box.parentElement;
                    }
                    if (box && box !== S.root.parentElement) {
                        const off = el.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientTop;
                        if (off < 0 || off + el.offsetHeight > box.clientHeight) box.scrollTop += off - (off < 0 ? 0 : box.clientHeight - el.offsetHeight);
                    }
                }
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

    // ================================================================
    // 🎭 生一組表情（11-04 她：「把表情都生了? 但不動身體?」）
    //   拿預設那張 → ComfyUI 找臉 → 她看圈對不對（可以拖） → 一個一個表情：裁臉那塊放大到 1024、只重畫圈裡、
    //   縮回去羽化貼回原圖。圈外一點都不動；原圖去背過的，透明度照原圖套回去。存進本地上傳的表情格。
    //   不帶角色描述：只給畫風＋表情就認得出是同一張臉（11-04 試過），描述裡手上的東西反而會被畫到臉上。
    // ================================================================
    const EXPR_PRE = 'close-up portrait, face focus, solo, ';
    // tags＝一般；quiet＝內收（靦腆、冷淡、壓抑的角色：動作小、嘴巴多半閉著。11-04 同一張圖對照過她說「好，加上去」）
    const EXPR_SET = [
        { exp: 'Happy',     zh: '微笑', d: 0.7, tags: '(gentle smile:1.3), closed mouth smile, soft eyes, happy',
                                            quiet: 'faint smile, (slight smile:1.2), closed mouth, calm soft eyes' },
        { exp: 'Laughing',  zh: '大笑', d: 0.8, tags: '(laughing:1.3), open mouth, big smile, closed eyes, happy',
                                            quiet: 'stifled laugh, (closed mouth smile:1.2), (eyes curved:1.2), holding back laughter' },
        { exp: 'Shy',       zh: '害羞', d: 0.7, tags: '(embarrassed:1.3), (blush:1.3), looking away, wavy mouth',
                                            quiet: '(light blush:1.1), averted gaze, looking down, closed mouth, shy' },
        { exp: 'Angry',     zh: '生氣', d: 0.8, tags: '(angry:1.4), furrowed brows, glaring, clenched teeth, frown',
                                            quiet: 'cold stare, (slightly furrowed brows:1.2), closed mouth, serious expression' },
        { exp: 'Sad',       zh: '難過', d: 0.8, tags: '(sad:1.4), downturned eyebrows, teary eyes, frown, looking down',
                                            quiet: 'downcast eyes, (slight frown:1.2), closed mouth, melancholic' },
        { exp: 'Surprised', zh: '驚訝', d: 0.8, tags: '(surprised:1.4), wide eyes, raised eyebrows, open mouth',
                                            quiet: '(slightly widened eyes:1.2), lips slightly parted, mild surprise' },
        { exp: 'Crying',    zh: '哭',   d: 0.8, tags: '(crying:1.4), tears streaming down face, frown, wet eyes',
                                            quiet: 'eyes glistening with tears, single tear, holding back tears, closed mouth' },
    ];
    // 每個角色選一般還是內收：{ 名字: 'quiet' }，一般的不存
    const STYLE_KEY = 'acg_expr_style';
    function styleMap() { try { const v = JSON.parse(localStorage.getItem(STYLE_KEY) || '{}'); return (v && typeof v === 'object') ? v : {}; } catch (e) { return {}; } }
    function styleOf(ch) { const m = styleMap(); const k = Object.keys(m).find(n => sameChar(n, ch)); return (k && m[k] === 'quiet') ? 'quiet' : 'normal'; }
    function styleSave(ch, style) {
        const m = styleMap();
        Object.keys(m).forEach(n => { if (sameChar(n, ch)) delete m[n]; });
        if (style === 'quiet') m[ch] = 'quiet';
        const A = AUIx();
        return A && A.lsSet ? A.lsSet(STYLE_KEY, JSON.stringify(m), '角色表情的個性') : false;
    }
    // 劇情寫的表情 → 上面哪一張（照順序比：大笑、哭要排在微笑、難過前面；Unhappy 要先被難過接走）
    const NEAR_EXP = [
        [/laugh|giggl|chuckl/i, 'Laughing'],
        [/cry|tear|weep|sob/i, 'Crying'],
        [/shy|embarrass|blush|bashful|fluster/i, 'Shy'],
        [/ang|mad|furious|rage|irritat|annoy|frustrat|glar/i, 'Angry'],
        [/surpris|shock|amaz|astonish|startl|stun/i, 'Surprised'],
        [/sad|sorrow|grief|depress|melanchol|gloom|upset|disappoint|hurt|unhappy/i, 'Sad'],
        [/happy|smil|joy|pleas|cheer|delight|glad|grin|excite/i, 'Happy'],
    ];
    function nearExp(exp) {
        const e = String(exp || '');
        for (const [re, name] of NEAR_EXP) if (re.test(e)) return name;
        return '';
    }
    // 這個角色有上面那幾種表情的哪幾張（本地上傳＋表情條目）：副模型補表情時只讓它挑真的有圖的
    async function exprHave(name) {
        const locals = (await localAll()).filter(r => r && sameChar(r.name, name));
        const V = VN(), lore = (V && V._lorebookExpCache) || {};
        return EXPR_SET.filter(x => locals.some(r => r.exp === x.exp) || variants(name).some(v => lore[v + '_' + x.exp])).map(x => x.exp);
    }

    function loadImg(src) {
        return new Promise((res, rej) => {
            const i = new Image();
            if (/^https?:/i.test(src)) i.crossOrigin = 'anonymous';   // 別的網站的圖要能畫進畫布再拿出來
            i.onload = () => res(i); i.onerror = () => rej(new Error('圖讀不到'));
            i.src = src;
        });
    }
    function canvasOf(w, h) { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; }
    // 羽化的橢圓：中間全白、最外 soft 那段漸漸透明（不用 ctx.filter：iPhone 的畫布不吃）
    function softOval(g, cx, cy, rx, ry, soft) {
        g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
        const gr = g.createRadialGradient(0, 0, Math.max(0, rx - soft), 0, 0, rx);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
    }
    // 圈（原圖像素）→ 要裁的正方形：邊長是圈的 2.2 倍，夾在圖裡
    function cropOf(ring, W, H) {
        const side = Math.max(16, Math.min(W, H, Math.round(Math.max(ring.rx, ring.ry) * 2 * 2.2)));
        return { side, L: Math.round(Math.max(0, Math.min(W - side, ring.cx - side / 2))), T: Math.round(Math.max(0, Math.min(H - side, ring.cy - side / 2))) };
    }
    async function makeExpr(ex, item, seed) {
        const M = win.OS_IMAGE_MANAGER;
        const src = ex.img, W = ex.W, H = ex.H, ring = ex.ring;
        const { side, L, T } = cropOf(ring, W, H);
        const P = 1024, k = P / side;
        const crop = canvasOf(P, P), cg = crop.getContext('2d');
        cg.fillStyle = '#fff'; cg.fillRect(0, 0, P, P);   // 去背過的透明處墊白，模型看不懂透明
        cg.drawImage(src, L, T, side, side, 0, 0, P, P);
        const mask = canvasOf(P, P), mg = mask.getContext('2d');
        mg.fillStyle = '#000'; mg.fillRect(0, 0, P, P);
        softOval(mg, (ring.cx - L) * k, (ring.cy - T) * k, ring.rx * k, ring.ry * k, P * 0.01);
        // 裁的那塊送 JPEG：整份工作流要經酒館的代理，PNG 一張一兩 MB；圈外那圈最後貼回的是原圖，壓縮只碰得到要重畫的地方
        const words = ex.style === 'quiet' ? item.quiet : item.tags;
        const out = await M.comfyInpaint(crop.toDataURL('image/jpeg', 0.95), mask.toDataURL('image/png'), EXPR_PRE + words, { denoise: item.d, seed });
        const gen = await loadImg(out);
        // 貼回：生出來那塊縮回原大小，逐點只換羽化圈裡的顏色，透明度一律照原圖。
        //   以前是「畫原圖 → 疊補丁 → destination-in 再畫一次原圖」：原圖半透明的點透明度被乘兩次（128 變 64），
        //   去背立繪整圈外輪廓、髮絲每張表情都變淡（11-04 tmp/expr_alpha_test.cjs）。圈外的點現在一個都不碰。
        const patch = canvasOf(side, side), pg = patch.getContext('2d');
        pg.drawImage(gen, 0, 0, side, side);
        const mk = canvasOf(side, side), mkg = mk.getContext('2d');
        softOval(mkg, ring.cx - L, ring.cy - T, ring.rx, ring.ry, side * 0.03);
        const mA = mkg.getImageData(0, 0, side, side).data, pA = pg.getImageData(0, 0, side, side).data;
        const res = canvasOf(W, H), rg = res.getContext('2d');
        rg.drawImage(src, 0, 0);
        const area = rg.getImageData(L, T, side, side), d = area.data;
        for (let i = 0; i < d.length; i += 4) {
            const m = mA[i + 3] / 255;
            if (!m) continue;
            d[i] = d[i] * (1 - m) + pA[i] * m; d[i + 1] = d[i + 1] * (1 - m) + pA[i + 1] * m; d[i + 2] = d[i + 2] * (1 - m) + pA[i + 2] * m;
        }
        rg.putImageData(area, L, T);
        return await shrink(res.toDataURL('image/png'));
    }
    // 結果卡片只放臉那塊：整個人縮成小圖，表情根本看不出來
    async function faceThumb(ex, url) {
        const img = await loadImg(url);
        const { side, L, T } = cropOf(ex.ring, ex.W, ex.H);
        const c = canvasOf(240, 240);
        c.getContext('2d').drawImage(img, L, T, side, side, 0, 0, 240, 240);
        return c.toDataURL('image/webp', 0.85);
    }

    // ================================================================
    // 👄 講話動嘴（11-04 她：「生成三張開嘴中開微張 搞那啥開合動嘴?」「好，接進去」）
    //   每張圖另外只重畫嘴那一小塊兩次（微張、張開），存成兩塊小圖＋位置（app_data vn_mouth／角色名）；
    //   舞台講話時把它們疊回立繪輪流換（vn_core_stage.js 的 _mouthTalk 來問 mouthFor）。
    //   嘴的位置照臉圈推（臉圈＝眉毛到下巴）：圈的中線、圈心往下 0.32 個半高，11-04 那張立繪量過對得上。
    //   大笑、驚訝嘴本來就開著，不做。
    // ================================================================
    const MOUTH_APP = 'vn_mouth';
    const MOUTH_KEY = 'acg_expr_mouth';            // '0'＝生表情時不順便做動嘴
    const MOUTH_SKIP = ['Laughing', 'Surprised'];
    const MOUTH_MOOD = { default: 'neutral expression', Happy: 'smile', Shy: 'embarrassed, blush', Angry: 'angry, frown', Sad: 'sad, frown', Crying: 'crying, tears' };
    const MOUTH_SHAPES = [
        { k: 'half', d: 0.6,  tags: '(slightly open mouth:1.3), talking, small mouth opening' },
        { k: 'open', d: 0.75, tags: '(open mouth:1.3), talking, speaking' },
    ];
    const mouthOn = () => { try { return localStorage.getItem(MOUTH_KEY) !== '0'; } catch (e) { return true; } };
    function mouthOval(ring) { return { cx: ring.cx, cy: ring.cy + ring.ry * 0.324, rx: ring.rx * 0.357, ry: ring.ry * 0.243 }; }
    // 認圖：只看臉那塊、縮成 20×20 存下來。舞台那張同一塊縮一樣大來比，差很少＝同一張
    //   （存成 WebP、轉成 blob 網址都認得；同一個人不同表情差在臉，一比就分得開）
    function faceSig(img, f) {
        const c = canvasOf(20, 20), g = c.getContext('2d');
        g.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, 20, 20);
        return Array.from(g.getImageData(0, 0, 20, 20).data);
    }
    function sigDiff(a, b) {
        if (!a || !b || a.length !== b.length) return 999;
        let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]);
        return t / a.length;
    }
    // 同一張才算：臉那塊差不到 2.5、嘴那塊差不到 4（11-04 量過：同一張 0、存成 WebP 再讀不到 1、微笑對預設 5.7）。
    //   嘴那塊另外比：表情沒做動嘴時，絕不能借別張的嘴貼上去
    function sameShot(img, e) {
        if (!e || e.w !== img.naturalWidth || e.h !== img.naturalHeight) return 999;
        const d = sigDiff(faceSig(img, e.face), e.sig);
        if (d >= 2.5) return 999;
        if (e.msig && sigDiff(faceSig(img, e.box), e.msig) >= 4) return 999;
        return d;
    }
    // 圖本身的身分證：本機的圖（data:）＝長度＋雜湊，網址＝網址本身；blob 那種沒得認回空。
    //   11-04 她酒館裡：舞台那張微笑跟做嘴那張縮圖差 4.45（微笑後來重生過、嘴是照舊的那張做的）——只靠縮圖像不像分不夠開。
    //   做嘴時記下照哪一筆做的（e.src），舞台先比這個；一字不差才算，對上了就不用再比縮圖
    function srcKey(s) {
        s = String(s || '');
        if (/^https?:/i.test(s)) return 'u:' + s;
        if (s.indexOf('data:') !== 0) return '';
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
        return 'd:' + s.length + ':' + h.toString(16);
    }
    // 這組嘴是不是做給這張圖的：照哪一筆做的一字不差就是；不然再比縮圖（同一張圖換了網址寫法、轉成 blob 的那種）
    function mouthFits(e, img, key) {
        if (!e) return false;
        if (e.src && key && e.src === key) return true;
        return !!img && sameShot(img, e) < 999;
    }
    const _mouthMem = {};
    async function mouthLoad(name) {
        if (_mouthMem[name]) return _mouthMem[name];
        let v = null;
        try { v = await DB().getAppData(MOUTH_APP, name); } catch (e) {}
        return (_mouthMem[name] = (v && v.entries) ? v : { entries: {} });
    }
    // 每存一組嘴就 +1：舞台把「這張圖沒有嘴」記在快取裡，版號變了才會重問（不然先看過劇情、才回來做嘴，要重整才會動）
    let _mouthRev = 0;
    const mouthRev = () => _mouthRev;
    async function mouthSave(name, exp, data) {
        const v = await mouthLoad(name);
        v.entries[exp] = data;
        await DB().saveAppData(MOUTH_APP, name, v);
        _mouthRev++;
    }
    // 舞台問：這個人現在這張圖（img 已經載好）有沒有做過動嘴。回 { box, half, open } 或 null
    // 存了嘴的是哪幾個名字（舞台的名字跟圖鑑存的可能差簡繁、全名短名，用 sameChar 對；存新的嘴就重讀）
    let _mouthNames = null, _mouthNamesRev = -1;
    async function mouthNames() {
        if (_mouthNames && _mouthNamesRev === _mouthRev) return _mouthNames;
        let rows = [];
        try { rows = (await DB().getAppDataByApp(MOUTH_APP)) || []; } catch (e) {}
        _mouthNamesRev = _mouthRev;
        return (_mouthNames = rows.map(r => r.key).filter(Boolean));
    }
    // key＝舞台那張圖的 srcKey（舞台算好帶過來；blob 的那種舞台會先找回原本那筆）
    async function mouthFor(name, img, key) {
        if (!img || !img.naturalWidth) return null;
        let best = null;
        const names = (await mouthNames()).filter(k => sameChar(k, name));
        for (const n of names) {   // 先找一字不差那筆
            const data = await mouthLoad(n);
            for (const exp of Object.keys(data.entries)) { const e = data.entries[exp]; if (e && e.src && key && e.src === key) return e; }
        }
        for (const n of names) {
            const data = await mouthLoad(n);
            for (const exp of Object.keys(data.entries)) {
                const e = data.entries[exp];
                let d; try { d = sameShot(img, e); } catch (err) { return null; }   // 別的網站的圖畫不進來
                if (d < 999 && (!best || d < best.d)) best = { d, e };
            }
        }
        return best ? best.e : null;
    }
    // 嘴的位置（原圖像素）：mo＝嘴那顆橢圓、box＝切下來存的那塊、face＝認圖用的臉框。ComfyUI、GPT 兩條同一份
    function mouthGeom(ring, W, H) {
        const mo = mouthOval(ring);
        const bx = Math.max(0, Math.floor(mo.cx - mo.rx * 1.15)), by = Math.max(0, Math.floor(mo.cy - mo.ry * 1.15));
        const bw = Math.min(W - bx, Math.ceil(mo.rx * 2.3)), bh = Math.min(H - by, Math.ceil(mo.ry * 2.3));
        const fx = Math.max(0, Math.round(ring.cx - ring.rx)), fy = Math.max(0, Math.round(ring.cy - ring.ry));
        const face = { x: fx, y: fy, w: Math.max(1, Math.min(W - fx, Math.round(ring.rx * 2))), h: Math.max(1, Math.min(H - fy, Math.round(ring.ry * 2))) };
        return { mo, box: { x: bx, y: by, w: bw, h: bh }, face };
    }
    // 一組嘴除了兩塊圖以外的那些：認圖用的縮圖、照哪一筆做的（src）
    function mouthEntryBase(src, url, g) {
        return { w: src.naturalWidth, h: src.naturalHeight, face: g.face, sig: faceSig(src, g.face), box: g.box, msig: faceSig(src, g.box), src: srcKey(url) };
    }
    // 這張圖做一組嘴：微張、張開各重畫一次嘴那一小塊，切下來羽化。透明度照原圖
    async function makeMouth(ex, exp, url, seed) {
        const M = win.OS_IMAGE_MANAGER;
        const src = await loadImg(url);
        const W = src.naturalWidth, H = src.naturalHeight, ring = ex.ring;
        const { side, L, T } = cropOf(ring, W, H);
        const P = 1024, k = P / side;
        const crop = canvasOf(P, P), cg = crop.getContext('2d');
        cg.fillStyle = '#fff'; cg.fillRect(0, 0, P, P);
        cg.drawImage(src, L, T, side, side, 0, 0, P, P);
        const geo = mouthGeom(ring, W, H), mo = geo.mo;
        const mask = canvasOf(P, P), mg = mask.getContext('2d');
        mg.fillStyle = '#000'; mg.fillRect(0, 0, P, P);
        softOval(mg, (mo.cx - L) * k, (mo.cy - T) * k, mo.rx * k, mo.ry * k, P * 0.008);
        const cropUrl = crop.toDataURL('image/jpeg', 0.95), maskUrl = mask.toDataURL('image/png');
        const bx = geo.box.x, by = geo.box.y, bw = geo.box.w, bh = geo.box.h;
        const out = mouthEntryBase(src, url, geo);   // src：照哪一筆做的
        for (const sh of MOUTH_SHAPES) {
            const r = await M.comfyInpaint(cropUrl, maskUrl, EXPR_PRE + (MOUTH_MOOD[exp] || MOUTH_MOOD.default) + ', ' + sh.tags, { denoise: sh.d, seed });
            const gen = await loadImg(r);
            const pc = canvasOf(bw, bh), pg = pc.getContext('2d');
            pg.drawImage(gen, (bx - L) * k, (by - T) * k, bw * k, bh * k, 0, 0, bw, bh);
            pg.globalCompositeOperation = 'destination-in';
            softOval(pg, mo.cx - bx, mo.cy - by, mo.rx, mo.ry, Math.max(2, mo.rx * 0.3));
            pg.drawImage(src, bx, by, bw, bh, 0, 0, bw, bh);   // 再乘一次原圖的透明度
            out[sh.k] = pc.toDataURL('image/png');
        }
        return out;
    }
    // 結果卡片：嘴張開那張的臉（full＝整張，點開看用）
    async function mouthThumb(ex, url, m) {
        const base = await loadImg(url), p = await loadImg(m.open);
        const c = canvasOf(m.w, m.h), g = c.getContext('2d');
        g.drawImage(base, 0, 0); g.drawImage(p, m.box.x, m.box.y, m.box.w, m.box.h);
        const full = c.toDataURL('image/png');
        return { full, thumb: await faceThumb(ex, full) };
    }
    // 這次打開時哪幾張圖還沒有對得上的嘴（預設那張＋已經有的表情格，大笑驚訝除外）
    async function mouthMissing(ex, info) {
        const need = [];
        const list = [{ exp: DEFAULT_EXP, url: ex.srcUrl || ex.img.src }].concat(info.slots.filter(s => s.used && s.exp !== DEFAULT_EXP && MOUTH_SKIP.indexOf(s.exp) < 0).map(s => ({ exp: s.exp, url: s.used.url })));
        const data = await mouthLoad(ex.ch);
        for (const it of list) {
            let im;
            try { im = await loadImg(it.url); faceSig(im, { x: 0, y: 0, w: 1, h: 1 }); } catch (err) { continue; }   // 讀不到、別的網站畫不進來的跳過
            if (im.naturalWidth !== ex.W || im.naturalHeight !== ex.H) continue;   // 跟預設那張不一樣大：臉圈對不上，不做
            if (!mouthFits(data.entries[it.exp], im, srcKey(it.url))) need.push(it);
        }
        return need;
    }

    // 預設那張（舞台平常用的）；預設格空著就拿生成過的第一張（立繪庫排在頭像前面）
    async function exprSource(info) {
        const def = info.slots.find(s => s.exp === DEFAULT_EXP);
        if (def && def.used) return def.used.url;
        const C = Cache();
        for (const g of info.gen) {
            if (!g.url && C) { const full = await C.getRaw(g.store, g.key); g.url = (full && full.url) || ''; }
            if (g.url && g.url.indexOf('blob:') !== 0) return g.url;
        }
        return '';
    }
    async function exOpen(ch) {
        if (!S || !ch || S.ex) return;
        const info = S.info[ch];
        const url = info && await exprSource(info);
        if (!url) { toast('這個角色還沒有圖', 'warn'); return; }
        let img;
        try { img = await loadImg(url); } catch (e) { toast('這張圖讀不到', 'error'); return; }
        try { const t = canvasOf(1, 1); t.getContext('2d').drawImage(img, 0, 0); t.toDataURL(); }   // 別的網站沒開放的圖畫進去就拿不出來
        catch (e) { toast('這張圖放在別的網站、拿不進來；先用「上傳」把它放進圖鑑再做', 'warn'); return; }
        const W = img.naturalWidth, H = img.naturalHeight;
        const has = {};
        info.slots.forEach(s => { if (s.used) has[s.exp] = true; });
        const ex = { ch, img, W, H, has, srcUrl: url, picks: EXPR_SET.filter(x => !has[x.exp]).map(x => x.exp), done: [], busy: false, stop: false, style: styleOf(ch),
                     ring: { cx: W / 2, cy: H * 0.2, rx: W * 0.13, ry: W * 0.15 }, found: null, el: null,
                     mouth: mouthOn(), mouthNeed: null };   // mouthNeed：還沒對得上動嘴的那幾張（算好之前是 null）
        S.ex = ex;
        const A = AUIx();
        const el = doc.createElement('div');
        el.className = 'acg-ex is-finding';
        el.innerHTML =
            '<div class="acg-head">'
          +   '<button class="acg-back" type="button" data-act="expr-close" aria-label="返回"><i class="fa-solid fa-chevron-left"></i></button>'
          +   '<div class="acg-title">生一組表情</div>'
          +   (A && A.helpBtn ? A.helpBtn('acg_expr') : '')
          +   '<span class="acg-head-sp"></span>'
          + '</div>'
          + '<div class="acg-ex-body">'
          +   '<div class="acg-ex-who">' + esc(ch) + '</div>'
          +   '<div class="acg-ex-stage"><div class="acg-ex-frame">'
          +     '<img class="acg-ex-img" alt="">'
          +     '<svg class="acg-ex-ring" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">'
          +       '<ellipse class="acg-ex-oval" vector-effect="non-scaling-stroke"></ellipse>'
          +       '<ellipse class="acg-ex-mouth" vector-effect="non-scaling-stroke"></ellipse>'
          +       '<circle class="acg-ex-knob" vector-effect="non-scaling-stroke"></circle>'
          +     '</svg>'
          +   '</div></div>'
          +   '<div class="acg-ex-note">找臉中…</div>'
          +   '<div class="acg-ex-seg">'
          +     '<button class="acg-ex-seg-btn" type="button" data-act="expr-style" data-style="normal">一般</button>'
          +     '<button class="acg-ex-seg-btn" type="button" data-act="expr-style" data-style="quiet">內收</button>'
          +   '</div>'
          +   '<div class="acg-ex-picks">' + EXPR_SET.map(x =>
                  '<button class="acg-ex-chip" type="button" data-act="expr-pick" data-exp="' + x.exp + '">' + esc(x.zh)
                + (has[x.exp] ? '<span class="acg-ex-has">有了</span>' : '') + '</button>').join('') + '</div>'
          +   '<div class="acg-ex-opts"><button class="acg-ex-toggle" type="button" data-act="expr-mouth"><i class="fa-solid fa-comment-dots"></i> 講話會動嘴</button></div>'
          +   '<div class="acg-ex-foot"><button class="acg-btn acg-btn-main acg-ex-go" type="button" data-act="expr-go"></button></div>'
          +   '<div class="acg-gen acg-ex-out"></div>'
          + '</div>';
        S.root.appendChild(el);
        ex.el = el;
        el.querySelector('.acg-ex-img').src = img.src;
        exBindRing(ex);
        exPaint(ex);
        // 哪幾張還沒有對得上的動嘴（背景算，算好再更新按鈕上的數字）
        mouthMissing(ex, info).then(n => { ex.mouthNeed = n; if (S && S.ex === ex) exPaint(ex); }, () => { ex.mouthNeed = []; });
        // 用什麼畫：「立繪表情」那列選 ComfyUI＝一張一張重畫臉；選自訂接口（GPT）＝一通九宮格（OS_EXPR_GRID）；別的做不了
        const M = win.OS_IMAGE_MANAGER;
        ex.engine = (M && M.exprEngine) ? M.exprEngine() : 'comfy';
        if (ex.engine === 'gpt' && !(win.OS_EXPR_GRID && M.capiEdit)) ex.engine = '';
        // 找臉（ComfyUI 沒裝找臉的外掛、走 GPT 又沒填 ComfyUI → 圈先放在上面中間，她自己拖）
        let box = null, why = '';
        if (!ex.engine) why = '生表情要用 ComfyUI 或 GPT 那種的自訂接口：到設置→圖片「每個地方用什麼」，把「立繪表情」選成 ComfyUI 的包或自訂接口';
        else try {
            const t = canvasOf(W, H), tg = t.getContext('2d');
            tg.fillStyle = '#fff'; tg.fillRect(0, 0, W, H); tg.drawImage(img, 0, 0);
            box = await M.comfyFindFace(t.toDataURL('image/jpeg', 0.9));
        }
        catch (e) { if (ex.engine === 'comfy') why = (e && e.message) || String(e); }   // GPT 那條找不到臉只是要她自己拖圈，不擋
        if (S !== null && S.ex === ex) {
            if (box) {
                const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
                const l = box.x0 + bw * 0.08, r = box.x1 - bw * 0.08, t = box.y0 + bh * 0.28, b = box.y1 + bh * 0.02;   // 眉毛到下巴，瀏海留在外面
                ex.ring = { cx: (l + r) / 2, cy: (t + b) / 2, rx: (r - l) / 2, ry: (b - t) / 2 };
            }
            ex.found = box ? 'yes' : 'no';
            ex.blocked = why;
            el.classList.remove('is-finding');
            exPaint(ex);
        }
    }
    function exClose() {
        if (!S || !S.ex) return;
        const ex = S.ex;
        ex.stop = true;
        ex.el && ex.el.remove();
        S.ex = null;
        if (ex.done.length) afterChange(ex.ch);   // 做好的已經存了：重畫這個角色，表情格會多出來
    }
    // 換個性＝整組要照新的重做：七個全選（做過的也選，她不要的再點掉）
    function exStyle(style) {
        const ex = S && S.ex;
        if (!ex || ex.busy || style === ex.style) return;
        ex.style = style === 'quiet' ? 'quiet' : 'normal';
        styleSave(ex.ch, ex.style);
        ex.picks = EXPR_SET.map(x => x.exp);
        exPaint(ex);
    }
    function exPick(exp) {
        const ex = S && S.ex;
        if (!ex || ex.busy) return;
        const i = ex.picks.indexOf(exp);
        if (i >= 0) ex.picks.splice(i, 1); else ex.picks.push(exp);
        exPaint(ex);
    }
    function exPaint(ex) {
        const el = ex.el; if (!el) return;
        const r = ex.ring;
        const oval = el.querySelector('.acg-ex-oval'), knob = el.querySelector('.acg-ex-knob');
        oval.setAttribute('cx', r.cx); oval.setAttribute('cy', r.cy); oval.setAttribute('rx', r.rx); oval.setAttribute('ry', r.ry);
        knob.setAttribute('cx', r.cx + r.rx * 0.7071); knob.setAttribute('cy', r.cy + r.ry * 0.7071); knob.setAttribute('r', Math.max(ex.W, ex.H) * 0.016);
        const mo = mouthOval(r), mEl = el.querySelector('.acg-ex-mouth');   // 圈裡那個小圈＝嘴（跟著大圈走）
        mEl.setAttribute('cx', mo.cx); mEl.setAttribute('cy', mo.cy); mEl.setAttribute('rx', mo.rx); mEl.setAttribute('ry', mo.ry);
        el.classList.toggle('is-mouth', ex.mouth);
        const tg = el.querySelector('.acg-ex-toggle'); tg.classList.toggle('is-on', ex.mouth); tg.disabled = ex.busy;
        el.querySelectorAll('.acg-ex-chip').forEach(c => { c.classList.toggle('is-on', ex.picks.indexOf(c.dataset.exp) >= 0); c.disabled = ex.busy; });
        el.querySelectorAll('.acg-ex-seg-btn').forEach(c => { c.classList.toggle('is-on', c.dataset.style === ex.style); c.disabled = ex.busy; });
        el.classList.toggle('is-busy', ex.busy);
        // blocked＝設定不對（不是 ComfyUI 之類），整頁做不了；err＝這一輪有一張沒做成，可以再按一次補
        const note = el.querySelector('.acg-ex-note');
        const warn = ex.blocked || ex.err;
        note.classList.toggle('is-warn', !!warn || ex.found === 'no');
        note.textContent = warn ? warn
            : ex.found === null ? '找臉中…'
            : ex.busy ? (ex.engine === 'gpt' ? 'GPT 畫圖中，通常一到兩分鐘' : '圈裡的地方會重畫')
            : ex.found === 'no' ? '沒找到臉，把圈拖到眉毛到下巴那塊' + (ex.engine === 'gpt' ? '（用 GPT：七個表情一起畫）' : '')
            : ex.engine === 'gpt' ? '圈裡的地方會重畫，不對可以拖（用 GPT：七個表情一起畫）'
            : '圈裡的地方會重畫，不對可以拖';
        const go = el.querySelector('.acg-ex-go');
        const n = ex.picks.length, m = mouthJobs(ex).length;
        const finished = !ex.busy && ex.ranAll && !n && !m && ex.done.length > 0;
        go.disabled = ex.busy || ex.found === null || (!finished && (!!ex.blocked || (!n && !m)));
        go.dataset.act = finished ? 'expr-close' : 'expr-go';
        go.textContent = ex.busy ? ('生成中 ' + (ex.done.length - ex.base) + '／' + ex.total)
            : finished ? '完成'
            : n ? (ex.err ? '再生成剩下的（' : '開始生成（') + n + ' 個表情' + (m ? '＋' + m + ' 組動嘴' : '') + '）'
            : m ? '補動嘴（' + m + ' 組）' : '選要哪幾個表情';
    }
    // 這一輪要做的動嘴：要生的表情（大笑驚訝除外）＋還沒對得上的那幾張（預設那張也算）
    function mouthJobs(ex) {
        if (!ex.mouth) return [];
        return ex.picks.filter(e => MOUTH_SKIP.indexOf(e) < 0).map(e => ({ exp: e, url: '' }))
            .concat((ex.mouthNeed || []).filter(it => ex.picks.indexOf(it.exp) < 0));
    }
    function exMouth() {
        const ex = S && S.ex;
        if (!ex || ex.busy) return;
        ex.mouth = !ex.mouth;
        const A = AUIx(); if (A && A.lsSet) A.lsSet(MOUTH_KEY, ex.mouth ? '1' : '0', '生表情時順便做動嘴');
        exPaint(ex);
    }
    // 拖圈：按在圈上（或空白處）＝搬，按右下的圓點＝改大小；座標換成原圖像素
    function exBindRing(ex) {
        const svg = ex.el.querySelector('.acg-ex-ring');
        let drag = null;
        const at = (ev) => { const b = svg.getBoundingClientRect(); return { x: (ev.clientX - b.left) / b.width * ex.W, y: (ev.clientY - b.top) / b.height * ex.H }; };
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        svg.addEventListener('pointerdown', (ev) => {
            if (ex.busy || ex.found === null) return;
            const p = at(ev);
            const r = ex.ring;
            if (ev.target.classList.contains('acg-ex-knob')) drag = { mode: 'size' };
            else {
                const inside = ((p.x - r.cx) / r.rx) ** 2 + ((p.y - r.cy) / r.ry) ** 2 <= 1;
                if (!inside) { r.cx = p.x; r.cy = p.y; }
                drag = { mode: 'move', dx: p.x - r.cx, dy: p.y - r.cy };
            }
            try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
            ev.preventDefault();
            exPaint(ex);
        });
        svg.addEventListener('pointermove', (ev) => {
            if (!drag) return;
            const p = at(ev), r = ex.ring;
            if (drag.mode === 'move') { r.cx = clamp(p.x - drag.dx, 0, ex.W); r.cy = clamp(p.y - drag.dy, 0, ex.H); }
            else { r.rx = clamp(Math.abs(p.x - r.cx) / 0.7071, ex.W * 0.03, ex.W * 0.5); r.ry = clamp(Math.abs(p.y - r.cy) / 0.7071, ex.H * 0.02, ex.H * 0.5); }
            exPaint(ex);
        });
        const end = () => { drag = null; };
        svg.addEventListener('pointerup', end);
        svg.addEventListener('pointercancel', end);
    }
    async function exGo() {
        const ex = S && S.ex;
        if (!ex || ex.busy) return;
        const list = EXPR_SET.filter(x => ex.picks.indexOf(x.exp) >= 0);
        const mJobs = mouthJobs(ex);
        if (!list.length && !mJobs.length) return;
        // 一件一張卡：表情一張、動嘴一張（卡的鍵：動嘴那張多個 ~m）
        const zhOf = (exp) => exp === DEFAULT_EXP ? '預設' : ((EXPR_SET.find(x => x.exp === exp) || {}).zh || exp);
        const jobs = [];
        list.forEach(x => {
            jobs.push({ kind: 'face', key: x.exp, exp: x.exp, zh: x.zh, item: x });
            if (mJobs.some(j => j.exp === x.exp)) jobs.push({ kind: 'mouth', key: x.exp + '~m', exp: x.exp, zh: x.zh + '・動嘴', url: '' });
        });
        mJobs.filter(j => !list.some(x => x.exp === j.exp)).forEach(j => jobs.push({ kind: 'mouth', key: j.exp + '~m', exp: j.exp, zh: zhOf(j.exp) + '・動嘴', url: j.url }));
        ex.done = ex.done.filter(r => !jobs.some(j => j.key === r.exp));   // 這一輪要重做的先拿掉
        const doneBefore = ex.done.length;
        ex.busy = true; ex.ranAll = false; ex.total = jobs.length; ex.base = doneBefore; ex.err = '';
        const out = ex.el.querySelector('.acg-ex-out');
        const cardOf = (key, zh, thumb) =>
            '<div class="acg-gen-card acg-ex-card" data-exp="' + key + '">'
          +   '<div class="acg-gen-img acg-ex-cell" data-exp="' + key + '"' + (thumb ? ' data-act="expr-view"' : '') + '>'
          +     (thumb ? '<img src="' + esc(thumb) + '" alt="">' : '<i class="fa-solid fa-hourglass-half"></i>') + '</div>'
          +   '<div class="acg-ex-cap">' + esc(zh) + '</div>'
          + '</div>';
        out.innerHTML = ex.done.map(r => cardOf(r.exp, r.zh, r.thumb)).join('') + jobs.map(j => cardOf(j.key, j.zh, '')).join('');
        exPaint(ex);
        const seed = Math.floor(Math.random() * 1e15);   // 同一輪同一顆種子，幾張的筆觸比較像
        const madeUrl = {};                                // 這一輪剛生的表情圖：動嘴要拿它當底
        if (ex.engine === 'gpt') await exGoGpt(ex, jobs, out, madeUrl);
        else for (const j of jobs) {
            if (ex.stop || !S || S.ex !== ex) break;
            const card = out.querySelector('.acg-ex-card[data-exp="' + j.key + '"]');
            const cell = card.querySelector('.acg-ex-cell');
            card.classList.add('is-run');
            cell.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            try {
                let rec;
                if (j.kind === 'face') {
                    const data = await makeExpr(ex, j.item, seed);
                    await localSave(ex.ch, j.exp, data, 'file');
                    madeUrl[j.exp] = data;
                    ex.picks = ex.picks.filter(p => p !== j.exp);
                    rec = { exp: j.key, zh: j.zh, url: data, thumb: await faceThumb(ex, data) };
                } else {
                    const base = j.url || madeUrl[j.exp];
                    if (!base) throw new Error('表情那張沒做成，嘴先不做');
                    const m = await makeMouth(ex, j.exp, base, seed);
                    await mouthSave(ex.ch, j.exp, m);
                    if (ex.mouthNeed) ex.mouthNeed = ex.mouthNeed.filter(it => it.exp !== j.exp);
                    const t = await mouthThumb(ex, base, m);
                    rec = { exp: j.key, zh: j.zh, url: t.full, thumb: t.thumb };
                }
                if (S) S.changed = true;
                ex.done = ex.done.filter(r => r.exp !== j.key).concat(rec);
                cell.dataset.act = 'expr-view';
                cell.innerHTML = '<img src="' + esc(rec.thumb) + '" alt="">';
                card.classList.remove('is-run');
            } catch (e) {
                card.classList.remove('is-run'); card.classList.add('is-fail');
                cell.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                ex.err = '「' + j.zh + '」沒做成：' + ((e && e.message) || e);
                break;   // 多半是設定或連線的問題，後面的也會一樣失敗；沒做的留在選取裡，可以再按一次
            }
            exPaint(ex);
        }
        ex.busy = false;
        ex.ranAll = true;
        if (S && S.ex === ex) exPaint(ex);
        else if (S && ex.done.length > doneBefore) afterChange(ex.ch);   // 生到一半按了返回：最後那張是返回之後才存好的
    }
    // GPT 那條（OS_EXPR_GRID）：七個表情一通畫完、只存選了的；動嘴再一通（每通最多六張圖，一張一對微張／張開）。
    //   卡片跟 ComfyUI 那條同一套：這一通在跑的卡轉圈，回來一張一張填上
    async function exGoGpt(ex, jobs, out, madeUrl) {
        const G = win.OS_EXPR_GRID;
        const cardOf = (j) => out.querySelector('.acg-ex-card[data-exp="' + j.key + '"]');
        const spin = (list) => list.forEach(j => { const c = cardOf(j); if (!c) return; c.classList.add('is-run'); c.querySelector('.acg-ex-cell').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; });
        const put = (j, rec) => {
            if (S) S.changed = true;
            ex.done = ex.done.filter(r => r.exp !== j.key).concat(rec);
            const c = cardOf(j); if (!c) return;
            const cell = c.querySelector('.acg-ex-cell');
            cell.dataset.act = 'expr-view';
            cell.innerHTML = '<img src="' + esc(rec.thumb) + '" alt="">';
            c.classList.remove('is-run');
        };
        const fail = (list, what, e) => {
            list.forEach(j => { const c = cardOf(j); if (!c) return; c.classList.remove('is-run'); c.classList.add('is-fail'); c.querySelector('.acg-ex-cell').innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>'; });
            ex.err = what + '沒做成：' + ((e && e.message) || e);
        };
        const live = () => !ex.stop && S && S.ex === ex;
        const faceJobs = jobs.filter(j => j.kind === 'face'), mouthJobs0 = jobs.filter(j => j.kind === 'mouth');
        if (faceJobs.length) {
            spin(faceJobs); exPaint(ex);
            try {
                const r = await G.makeFaces(ex.img, ex.ring, ex.style);
                for (const j of faceJobs) {   // 回來了就存（按了返回也存：錢已經花了）
                    const data = await shrink(r.faces[j.exp].toDataURL('image/png'));
                    await localSave(ex.ch, j.exp, data, 'file');
                    madeUrl[j.exp] = data;
                    ex.picks = ex.picks.filter(p => p !== j.exp);
                    put(j, { exp: j.key, zh: j.zh, url: data, thumb: await faceThumb(ex, data) });
                }
            } catch (e) {
                fail(faceJobs.concat(mouthJobs0.filter(j => !j.url)), '表情', e);   // 表情沒做成，這一輪要照它做的嘴也做不了
                return;
            }
            if (live()) exPaint(ex);
        }
        const mj = mouthJobs0.filter(j => j.url || madeUrl[j.exp]);
        if (!mj.length || !live()) return;
        spin(mj); exPaint(ex);
        const geo = mouthGeom(ex.ring, ex.W, ex.H);
        for (let k = 0; k < mj.length; k += 6) {
            const part = mj.slice(k, k + 6);
            try {
                const bases = [];
                for (const j of part) { const url = j.url || madeUrl[j.exp]; bases.push({ j, url, img: await loadImg(url) }); }
                const pats = await G.makeMouths(bases.map(b => ({ img: b.img })), ex.ring, geo.mo, geo.box);
                for (let q = 0; q < bases.length; q++) {
                    const b = bases[q], m = Object.assign(mouthEntryBase(b.img, b.url, geo), pats[q]);
                    await mouthSave(ex.ch, b.j.exp, m);
                    if (ex.mouthNeed) ex.mouthNeed = ex.mouthNeed.filter(it => it.exp !== b.j.exp);
                    const t = await mouthThumb(ex, b.url, m);
                    put(b.j, { exp: b.j.key, zh: b.j.zh, url: t.full, thumb: t.thumb });
                }
            } catch (e) { fail(mj.slice(k), '動嘴', e); return; }
            if (live()) exPaint(ex); else return;
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

    win.OS_CHAR_GALLERY = { open, close, localUrl, userRefUrl, nearExp, exprHave, mouthFor, mouthRev, srcKey, _test: { parseLine, parseImport, wbSaveMany, wbRowsFor, fmtLine, sameChar, cropOf, mouthOval, sigDiff } };
    if (win !== window) window.OS_CHAR_GALLERY = win.OS_CHAR_GALLERY;
})();
