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
            acg_expr: { title: '生一組表情', body: '拿這個角色「預設」那張圖，只重畫臉那一圈，做出微笑、生氣、哭這些表情。身體、衣服、頭髮都不會變。\n劇情寫到哪個表情，舞台就換那張；寫的字不一樣（像 Smiling、Furious）也會找意思最近的那張。\n劇情沒寫表情的話（選了「不寫」、或在視差世界裡），在劇情 CTX 小窗或開頭那排把「表情」選成「副模型補」：副模型讀劇本時會順便替有表情圖的角色挑。\n圈圈是會重畫的地方：從眉毛到下巴就好，瀏海留在圈外，每張的頭髮才會一樣。找到臉會自動放大到只看頭部，圈比較好拉；想看整張圖按右上角「看整張」。\n「講話動嘴、會眨眼」開著的話，每張圖會順便做微張、張開兩種嘴和一張閉眼；劇情裡他講話時，字在跑、配音在響，嘴就會開合，平常隔幾秒眨一下眼。圈裡的小圈是嘴和兩隻眼睛的位置，跟著大圈走；哪個沒套到就直接拖那個小圈，嘴和兩隻眼睛各拖各的，下次打開這個角色還記得。\n側臉：只看得到一隻眼睛的話，按下面「左邊眼睛」或「右邊眼睛」把看不到的那隻關掉，眨眼就只做看得到的那隻；頭歪的立繪，拖大圈正上方那顆空心圓點把圈轉正對著臉，小圈跟著一起轉。想回到原本的位置和角度，按「圈放回原位」。大笑、驚訝嘴本來就開著，不做嘴；大笑眼睛瞇著，不做閉眼。沒做到的表情，講話、眨眼時借同一個人差不多的表情來用。\n「眼睛顏色」「臉上要留著的」：重畫時會照這幾樣畫，眼鏡才不會被畫掉、眼睛不會換顏色。AI 生的立繪會從它的外觀描述自動勾好，不對就點掉或改選；你改過就照你選的。\n「內收」給靦腆、冷淡、壓抑的角色：表情動作小、嘴巴多半閉著，生氣是冷冷瞪著、哭是忍著淚。每個角色記得自己選哪個；換了就整組重做。\n用什麼畫看設置→圖片「每個地方用什麼」的「立繪表情」那列（沒選就跟「立繪」那列用同一個）：\n・選 ComfyUI 的包：一個表情畫一次，不用錢；畫好的臉會照原圖校一次膚色。\n・選自訂接口（GPT 那種）：一次把七個表情一起畫好，顏色跟原圖最接近；開著動嘴眨眼的話再多畫一到兩次做嘴和閉眼（一次四張圖）。每次都會花一點生圖的錢，只存你選的那幾個。\n換了預設那張圖，表情要重做，不然換表情時身體會對不上。' }
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
          +       '<button class="acg-tool" type="button" data-act="dl-chibi" title="下載全部 Q 版"><i class="fa-solid fa-file-zipper"></i></button>'
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
    // 表情格標「會動嘴」「會眨眼」：劇情裡這張講話嘴會不會動、會不會眨眼（自己的、借來的都算；跟劇情畫面同一套 mouthPick）。背景一格一格算，要讀圖比對
    async function fillMouthTags(info, tk) {
        let entries = [];
        try { entries = await mouthList(info.name); } catch (e) { return; }
        if (!entries.length) return;
        for (const sl of info.slots) {
            if (!S || tk !== S.token || S.sel !== info.name) return;
            if (!sl.used) continue;
            let im = null;
            try { im = await loadImg(sl.used.url); } catch (e) { continue; }
            const key = srcKey(sl.used.url);
            let ok = false, blink = false;
            try { ok = !!mouthPick(entries, im, key, sl.exp); blink = !!mouthPick(entries, im, key, sl.exp, 'shut'); } catch (e) {}
            if (!S || tk !== S.token) return;   // 等讀圖的時候圖鑑被關掉了
            const card = S.root.querySelector('.acg-slot[data-exp="' + sl.exp + '"]');
            if (card) { card.classList.toggle('has-mouth', ok); card.classList.toggle('has-blink', blink); }
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
          +   '<span class="acg-mouth-tag" title="講話會動嘴"><i class="fa-solid fa-comment-dots"></i></span>'
          +   '<span class="acg-mouth-tag acg-blink-tag" title="會眨眼"><i class="fa-solid fa-eye"></i></span></div>'
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

    // 📦 下載全部 Q 版（11-07 她要拿去給阿洛當頭髮參考）：奧瑞亞裡的 Q 版人物打成一個壓縮檔，存到「下載」資料夾。
    //   兩個來源：生立繪「一次生三種」切出來的那張（圖片快取每個角色那筆的 chibi）→ 角色/；
    //   大廳裝扮室給角色換的小人（LobbyStage 的皮膚，圖在 lobby_stage_assets 或網址）→ 大廳/。
    //   🚨 不整庫一次讀：清單走 getAllMeta、圖一張一張讀（同 VN_Cache 的規矩）。不壓縮（圖本來就壓過），只是包成一個檔。
    const _CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
    function _crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = _CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
    // files：[{ name, data: Uint8Array }] → zip 的 Blob（不壓縮、檔名 UTF-8）
    function _zipBlob(files) {
        const enc = new TextEncoder(), parts = [], central = [];
        const d = new Date();
        const dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
        const dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
        let off = 0;
        for (const f of files) {
            const nm = enc.encode(f.name), crc = _crc32(f.data), sz = f.data.length;
            const h = new DataView(new ArrayBuffer(30));
            h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
            h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true);
            h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
            parts.push(h.buffer, nm, f.data);
            const c = new DataView(new ArrayBuffer(46));
            c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
            c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true);
            c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
            central.push(c.buffer, nm);
            off += 30 + nm.length + sz;
        }
        let csz = 0; central.forEach(p => { csz += p.byteLength; });
        const e = new DataView(new ArrayBuffer(22));
        e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
        return new Blob(parts.concat(central, [e.buffer]), { type: 'application/zip' });
    }
    // 一張圖（data: 或網址）→ { data: Uint8Array, ext }；讀不到回 null
    async function _imgBytes(src) {
        const extOf = (mime) => { const m = String(mime || '').toLowerCase(); return m.indexOf('webp') >= 0 ? 'webp' : m.indexOf('jpeg') >= 0 || m.indexOf('jpg') >= 0 ? 'jpg' : m.indexOf('gif') >= 0 ? 'gif' : m.indexOf('svg') >= 0 ? 'svg' : 'png'; };
        try {
            const s = String(src || '');
            const m = s.match(/^data:([^;,]+)(;base64)?,(.*)$/);
            if (m) {
                if (!m[2]) return { data: new TextEncoder().encode(decodeURIComponent(m[3])), ext: extOf(m[1]) };
                const bin = atob(m[3]); const u8 = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
                return { data: u8, ext: extOf(m[1]) };
            }
            if (!s) return null;
            const r = await fetch(s);
            if (!r.ok) return null;
            return { data: new Uint8Array(await r.arrayBuffer()), ext: extOf(r.headers.get('content-type') || s.split('?')[0].split('.').pop()) };
        } catch (e) { return null; }
    }
    async function dlChibi() {
        const VC = win.VN_Cache || window.VN_Cache;
        const files = [], used = new Set();
        const clean = (s) => String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 60) || '未命名';
        const nameOf = (dir, base, ext) => { let n = dir + '/' + base + '.' + ext, i = 2; while (used.has(n)) n = dir + '/' + base + '_' + (i++) + '.' + ext; used.add(n); return n; };
        toast('正在收集 Q 版…');
        if (VC && VC.getAllMeta && VC.getRaw) {
            const list = await VC.getAllMeta('avatar_cache', { partial: true });
            for (const e of list) {
                const rec = await VC.getRaw('avatar_cache', e.key);
                if (!rec || !rec.chibi) continue;
                const img = await _imgBytes(rec.chibi);
                if (img) files.push({ name: nameOf('角色', clean(VC.bareKeyOf ? VC.bareKeyOf(e) : e.key), img.ext), data: img.data });
            }
        }
        const LB = (win.LobbyStage || window.LobbyStage || {})._b;
        if (LB && LB.skins && LB.resolveRef) {
            const sk = LB.skins() || {};
            for (const k of Object.keys(sk)) {
                const one = sk[k];
                const src = one && await LB.resolveRef(one.ref);
                const img = src && await _imgBytes(src);
                if (img) files.push({ name: nameOf('大廳', clean(k) + (one.kind === 'sheet' ? '_走路圖' : ''), img.ext), data: img.data });
            }
        }
        if (!files.length) { toast('還沒有 Q 版可以下載：角色要用「一次生三種」生過立繪，或在大廳裝扮室換過小人', 'warning'); return; }
        const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
        const fname = '奧瑞亞Q版人物_' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.zip';
        const a = doc.createElement('a');
        a.href = URL.createObjectURL(_zipBlob(files));
        a.download = fname;
        (doc.body || doc.documentElement).appendChild(a);
        a.click();
        setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (e) {} a.remove(); }, 3000);
        toast('已下載 ' + files.length + ' 張 Q 版：' + fname + '（在「下載」資料夾）', 'success');
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
            if (act === 'expr-lay-reset') { exLayReset(); return; }
            if (act === 'expr-zoom') { exZoom(); return; }
            if (act === 'expr-eyeoff') { exEyeOff(+b.dataset.i); return; }
            if (act === 'expr-eyecolor') { exLook('eye', b.dataset.k); return; }
            if (act === 'expr-acc') { exLook('acc', b.dataset.k); return; }
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
            if (act === 'dl-chibi') {
                if (b.disabled) return;
                b.disabled = true;
                try { await dlChibi(); } finally { b.disabled = false; }
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
    // 🚨 只寫臉長什麼樣，不寫「忍住」這種動作：stifled laugh／holding back laughter／holding back tears 在動漫模型裡畫出來就是手摀嘴、手擦淚
    //   （11-06 她：「表情面膜大笑每次都跑出手來摀嘴」→ ComfyUI /history 她那晚 11 張內收大笑 8 張有手；
    //    同一張裁圖、同一個遮罩、同一顆種子只換詞：改成只寫臉的 0 張有手，tmp/expr_laugh_hand/）。
    //   一般那套的 (laughing:1.3) 也偶爾帶手（重跑 30 張 1 張）：laughing 這個標籤在圖庫裡常配手摀嘴，改寫成張嘴大笑的樣子（18 張 0 張）。
    //   她的包是 CFG 1 的 Turbo，負面詞完全沒作用，擋手只能從正面詞下手
    const EXPR_SET = [
        { exp: 'Happy',     zh: '微笑', d: 0.7, tags: '(gentle smile:1.3), closed mouth smile, soft eyes, happy',
                                            quiet: 'faint smile, (slight smile:1.2), closed mouth, calm soft eyes' },
        { exp: 'Laughing',  zh: '大笑', d: 0.8, tags: '(open mouth:1.3), (big smile:1.3), (closed eyes:1.2), upper teeth, happy, joyful',
                                            quiet: '(closed mouth smile:1.3), (eyes curved:1.3), (closed eyes:1.1), wide smile, amused, happy' },
        { exp: 'Shy',       zh: '害羞', d: 0.7, tags: '(embarrassed:1.3), (blush:1.3), looking away, wavy mouth',
                                            quiet: '(light blush:1.1), averted gaze, looking down, closed mouth, shy' },
        { exp: 'Angry',     zh: '生氣', d: 0.8, tags: '(angry:1.4), furrowed brows, glaring, clenched teeth, frown',
                                            quiet: 'cold stare, (slightly furrowed brows:1.2), closed mouth, serious expression' },
        { exp: 'Sad',       zh: '難過', d: 0.8, tags: '(sad:1.4), downturned eyebrows, teary eyes, frown, looking down',
                                            quiet: 'downcast eyes, (slight frown:1.2), closed mouth, melancholic' },
        { exp: 'Surprised', zh: '驚訝', d: 0.8, tags: '(surprised:1.4), wide eyes, raised eyebrows, open mouth',
                                            quiet: '(slightly widened eyes:1.2), lips slightly parted, mild surprise' },
        { exp: 'Crying',    zh: '哭',   d: 0.8, tags: '(crying:1.4), tears streaming down face, frown, wet eyes',
                                            quiet: 'eyes glistening with tears, (teary eyes:1.3), single tear, closed mouth, sad' },
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
    // 👓 臉上本來就有的（11-06 她：「眼鏡也是大問題，完全會被吃掉」）
    //   生表情不帶角色描述（描述裡手上的東西會被畫到臉上），所以模型不知道這張臉戴眼鏡、眼睛什麼顏色：
    //   圈裡整個重畫，眼鏡就不見、棕眼睛變藍（11-06 她那晚 20 張戴眼鏡的全壞、約 18 張換了眼睛顏色）。
    //   → 每個角色記「眼睛顏色＋臉上要留著的東西」，只把這幾樣帶進重畫的詞。沒記過就從生成立繪時的描述自動帶出來，她可以改。
    const LOOK_KEY = 'acg_expr_look';
    const EYE_COLORS = [
        { k: 'brown', zh: '棕', tag: 'brown eyes', re: /\b(brown|hazel|amber)\b|棕|褐|咖啡|琥珀/ },
        { k: 'black', zh: '黑', tag: 'black eyes', re: /\bblack\b|黑/ },
        { k: 'blue', zh: '藍', tag: 'blue eyes', re: /\b(blue|azure)\b|藍|蓝/ },
        { k: 'green', zh: '綠', tag: 'green eyes', re: /\bgreen\b|綠|绿/ },
        { k: 'grey', zh: '灰', tag: 'grey eyes', re: /\b(grey|gray|silver)\b|灰|銀|银/ },
        { k: 'red', zh: '紅', tag: 'red eyes', re: /\b(red|crimson|scarlet)\b|紅|红/ },
        { k: 'gold', zh: '金', tag: 'yellow eyes', re: /\b(gold|golden|yellow)\b|金|黃|黄/ },
        { k: 'purple', zh: '紫', tag: 'purple eyes', re: /\b(purple|violet)\b|紫/ },
        { k: 'pink', zh: '粉', tag: 'pink eyes', re: /\bpink\b|粉/ },
    ];
    // tag＝送給模型的詞；re＝從描述認出來（英文、中文都認）
    const FACE_ACCS = [
        { k: 'glasses', zh: '眼鏡', tag: 'glasses', re: /glasses|spectacles|eyewear|眼鏡|眼镜/ },
        { k: 'sunglasses', zh: '墨鏡', tag: 'sunglasses', re: /sunglasses|墨鏡|墨镜/ },
        { k: 'monocle', zh: '單邊眼鏡', tag: 'monocle', re: /monocle|單邊眼鏡|單片眼鏡|单片眼镜/ },
        { k: 'eyepatch', zh: '眼罩', tag: 'eyepatch', re: /eye ?patch|眼罩/ },
        { k: 'hairover', zh: '瀏海遮眼', tag: 'hair over one eye', re: /hair over (one |an |the )?eyes?|瀏海.{0,4}[遮蓋]|刘海.{0,4}[遮盖]/ },
        { k: 'scar', zh: '疤', tag: 'scar on face', re: /\bscars?\b|疤/ },
        { k: 'mole', zh: '痣', tag: 'mole', re: /\bmole\b|beauty mark|痣/ },
        { k: 'freckles', zh: '雀斑', tag: 'freckles', re: /freckle|雀斑/ },
        { k: 'beard', zh: '鬍子', tag: 'facial hair', re: /beard|stubble|mustache|moustache|goatee|鬍|胡子|胡渣/ },
        { k: 'mask', zh: '面具', tag: 'mask', re: /\b(half[- ]?)?mask\b|面具/ },
        { k: 'makeup', zh: '妝', tag: 'makeup', re: /makeup|lipstick|eyeshadow|eyeliner|口紅|眼影|[妝妆]/ },
        { k: 'facemark', zh: '臉上花紋', tag: 'facial mark', re: /facial (mark|tattoo)|face paint|tattoo on (the )?face|臉上.{0,3}(紋|彩繪)|面紋/ },
    ];
    function lookMap() { try { const v = JSON.parse(localStorage.getItem(LOOK_KEY) || '{}'); return (v && typeof v === 'object') ? v : {}; } catch (e) { return {}; } }
    function lookFix(v) {
        if (!v || typeof v !== 'object') return null;
        return { eye: EYE_COLORS.some(c => c.k === v.eye) ? v.eye : '', acc: Array.isArray(v.acc) ? v.acc.filter(k => FACE_ACCS.some(a => a.k === k)) : [],
                 phrase: (v.phrase && typeof v.phrase === 'object') ? v.phrase : {} };
    }
    function lookOf(ch) { const m = lookMap(); const k = Object.keys(m).find(n => sameChar(n, ch)); return k ? lookFix(m[k]) : null; }
    function lookSave(ch, look) {
        const m = lookMap();
        Object.keys(m).forEach(n => { if (sameChar(n, ch)) delete m[n]; });
        if (look) m[ch] = { eye: look.eye || '', acc: look.acc || [], phrase: look.phrase || {} };
        const A = AUIx();
        return A && A.lsSet ? A.lsSet(LOOK_KEY, JSON.stringify(m), '生表情時角色臉上要留著的東西') : false;
    }
    // 從立繪生成時的描述認出眼睛顏色和臉上的東西（英文的話連前面的形容一起留，像 thin black-framed glasses）
    function lookFromText(text) {
        const t = String(text || '').toLowerCase(), out = { eye: '', acc: [], phrase: {} };
        if (!t) return out;
        // 眼睛顏色：英文找「○○ eyes」、中文找「○色的眼睛／瞳」；兩種以上（異色瞳）不猜
        const eyeBits = [];
        (t.match(/\b([a-z]+)[- ](eyes|eyed|pupils|irises)\b/g) || []).forEach(s => eyeBits.push(s));
        (t.match(/([一-鿿]{1,3})色?的?(眼睛|眼眸|瞳孔|瞳|眸)/g) || []).forEach(s => eyeBits.push(s));
        const hit = EYE_COLORS.filter(c => eyeBits.some(s => c.re.test(s)));
        if (hit.length === 1) out.eye = hit[0].k;
        let rest = t;
        // 墨鏡、單邊眼鏡先認：認到就從字裡拿掉，後面才不會又算成一般眼鏡
        FACE_ACCS.slice().sort((a, b) => (/^(sunglasses|monocle)$/.test(b.k) ? 1 : 0) - (/^(sunglasses|monocle)$/.test(a.k) ? 1 : 0)).forEach(a => {
            if (!a.re.test(rest)) return;
            out.acc.push(a.k);
            const m = rest.match(new RegExp('((?:[a-z]+[- ]){0,3})(' + a.re.source + ')'));
            if (m && /^[a-z -]+$/.test(m[0]) && m[1]) out.phrase[a.k] = m[0].trim();
            if (a.k === 'sunglasses' || a.k === 'monocle') rest = rest.replace(a.re, ' ');   // 墨鏡、單邊眼鏡不要再被算成一般眼鏡
        });
        return out;
    }
    async function lookAuto(info) {
        const C = Cache();
        if (!C || !info) return null;
        for (const g of (info.gen || []).slice().sort((a, b) => (a.store === 'avatar_cache' ? 0 : 1) - (b.store === 'avatar_cache' ? 0 : 1))) {
            try { const full = await C.getRaw(g.store, g.key); if (full && full.prompt) return lookFromText(full.prompt); } catch (e) {}
        }
        return null;
    }
    // 送給模型的詞：眼睛顏色（只有表情那張要，閉眼、動嘴不用）＋臉上的東西
    function lookTags(look, withEye) {
        if (!look) return '';
        const t = [];
        if (withEye && look.eye) t.push((EYE_COLORS.find(c => c.k === look.eye) || {}).tag);
        (look.acc || []).forEach(k => { const a = FACE_ACCS.find(x => x.k === k); if (a) t.push('(' + ((look.phrase || {})[k] || a.tag) + ':1.2)'); });
        return t.filter(Boolean).map(s => s + ', ').join('');
    }
    // 臉的角度：只看得到一隻眼睛＝側臉；兩隻眼睛都往同一邊拖＝斜側；大圈轉了＝歪頭。重畫時照這個角度畫，不會轉回正面
    function viewTags(lay) {
        if (!lay) return '';
        const t = [];
        if (lay.eyes.some(e => e.off)) t.push('from side');
        else if (Math.abs((lay.eyes[0].u + lay.eyes[1].u) / 2) > 0.15) t.push('three-quarter view');
        if (Math.abs(lay.rot || 0) > 0.14) t.push('head tilt');
        return t.map(s => s + ', ').join('');
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
    function softOval(g, cx, cy, rx, ry, soft, rot) {
        g.save(); g.translate(cx, cy); if (rot) g.rotate(rot); g.scale(1, ry / rx);   // rot＝頭歪的時候圈跟著轉（弧度）
        const gr = g.createRadialGradient(0, 0, Math.max(0, rx - soft), 0, 0, rx);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
    }
    // 圈（原圖像素）→ 要裁的正方形：邊長是圈的 2.2 倍，夾在圖裡
    function cropOf(ring, W, H) {
        const side = Math.max(16, Math.min(W, H, Math.round(Math.max(ring.rx, ring.ry) * 2 * 2.2)));
        return { side, L: Math.round(Math.max(0, Math.min(W - side, ring.cx - side / 2))), T: Math.round(Math.max(0, Math.min(H - side, ring.cy - side / 2))) };
    }
    // 🎨 顏色對齊（11-04 她：「anima肉眼看其實有色差，眼睛顏色色差，皮膚顏色色差」「好，加」）
    //   ComfyUI 只重畫圈裡、圈外照原圖，所以偏的不是接縫外面，是整張臉照模型自己的膚色畫（原圖不是同一個包畫的就更明顯）。
    //   拿圈裡靠邊那一圈（臉頰外緣、下巴、眉梢：表情不太動的地方）跟原圖同一圈比，平均和深淺照原圖校，整塊一起套。
    //   o＝那顆橢圓在 patch 裡的位置；只看原圖不透明的點；校的幅度有上下限，不會把臉整個換色
    //   o 也可以是好幾顆（兩隻眼睛）：離哪顆最近算哪顆
    function rimMatch(patch, orig, o, r0, r1) {
        const w = patch.width, h = patch.height, os = Array.isArray(o) ? o : [o];
        const pg = patch.getContext('2d'), P = pg.getImageData(0, 0, w, h), O = orig.getContext('2d').getImageData(0, 0, w, h);
        const st = (d) => {
            const m = [0, 0, 0], q = [0, 0, 0]; let n = 0;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                let r = 1e9;
                for (const v of os) r = Math.min(r, ovalDist(v, x + 0.5, y + 0.5));
                const i = (y * w + x) * 4;
                if (r < r0 || r > r1 || O.data[i + 3] < 200) continue;
                for (let k = 0; k < 3; k++) { m[k] += d[i + k]; q[k] += d[i + k] * d[i + k]; } n++;
            }
            return n < 30 ? null : [0, 1, 2].map(k => { const mu = m[k] / n; return { mu, sd: Math.sqrt(Math.max(1, q[k] / n - mu * mu)) }; });
        };
        const want = st(O.data), have = st(P.data);
        if (!want || !have) return patch;
        const gain = [0, 1, 2].map(k => Math.max(0.85, Math.min(1.18, want[k].sd / have[k].sd)));
        const off = [0, 1, 2].map(k => Math.max(-40, Math.min(40, want[k].mu - gain[k] * have[k].mu)));
        const d = P.data;
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, d[i + k] * gain[k] + off[k]));
        pg.putImageData(P, 0, 0);
        return patch;
    }
    // 🎚 重畫的力道分區（11-06 她：「反正我生成十次，八次糟糕」）：她那晚 75 張，眉毛臉型走樣、平白冒汗珠、臉紅、眼鏡不見，
    //   都是整圈用同一個力道（0.7～0.8）把整張臉重畫的副作用。眼睛連眉毛、嘴才是表情在的地方給全力；
    //   臉頰、臉型、鼻子只給一部分（DifferentialDiffusion：遮罩越灰的地方改得越少）。害羞要臉紅、哭要淚痕，臉頰多給一點。
    const DIFF = { on: true, base: 0.55, cheek: { Shy: 0.8, Crying: 0.8, Laughing: 0.7 } };
    function exprMask(ex, item, L, T, k, P) {
        const ring = ex.ring, lay = ex.lay || LAY_DEF;
        const mask = canvasOf(P, P), mg = mask.getContext('2d');
        mg.fillStyle = '#000'; mg.fillRect(0, 0, P, P);
        const put = (g, o, soft) => softOval(g, (o.cx - L) * k, (o.cy - T) * k, o.rx * k, o.ry * k, soft, o.rot);
        if (!DIFF.on) { put(mg, ring, P * 0.01); return mask; }
        mg.globalAlpha = DIFF.cheek[item.exp] || DIFF.base; put(mg, ring, P * 0.01); mg.globalAlpha = 1;
        // 全力的那幾塊另外畫，再剪成大圈裡面：眉毛那塊常超出大圈頂，不剪的話瀏海也會被重畫（瀏海留在圈外是原本的規矩）
        const fc = canvasOf(P, P), fg = fc.getContext('2d');
        lay.eyes.forEach(e => { if (!e.off) put(fg, ovalAt(ring, { u: e.u, v: e.v - e.b * 0.7, a: e.a * 1.35, b: e.b * 2.2 }), P * 0.02); });   // 眼睛連眉毛
        put(fg, ovalAt(ring, { u: lay.mouth.u, v: lay.mouth.v, a: lay.mouth.a * 1.5, b: lay.mouth.b * 1.8 }), P * 0.02);
        fg.globalCompositeOperation = 'destination-in';
        put(fg, ring, P * 0.01);
        mg.drawImage(fc, 0, 0);
        return mask;
    }
    // 表情那張送的詞：取景＋臉的角度＋這張臉本來就有的（眼睛顏色、眼鏡…）＋表情
    function exprPrompt(ex, words) { return EXPR_PRE + viewTags(ex.lay) + lookTags(ex.look, true) + words; }
    async function makeExpr(ex, item, seed) {
        const M = win.OS_IMAGE_MANAGER;
        const src = ex.img, W = ex.W, H = ex.H, ring = ex.ring;
        const { side, L, T } = cropOf(ring, W, H);
        const P = 1024, k = P / side;
        const crop = canvasOf(P, P), cg = crop.getContext('2d');
        cg.fillStyle = '#fff'; cg.fillRect(0, 0, P, P);   // 去背過的透明處墊白，模型看不懂透明
        cg.drawImage(src, L, T, side, side, 0, 0, P, P);
        const mask = exprMask(ex, item, L, T, k, P);
        // 裁的那塊送 JPEG：整份工作流要經酒館的代理，PNG 一張一兩 MB；圈外那圈最後貼回的是原圖，壓縮只碰得到要重畫的地方
        const words = ex.style === 'quiet' ? item.quiet : item.tags;
        const out = await M.comfyInpaint(crop.toDataURL('image/jpeg', 0.95), mask.toDataURL('image/png'), exprPrompt(ex, words), { denoise: item.d, seed, diff: DIFF.on });
        const gen = await loadImg(out);
        // 貼回：生出來那塊縮回原大小，逐點只換羽化圈裡的顏色，透明度一律照原圖。
        //   以前是「畫原圖 → 疊補丁 → destination-in 再畫一次原圖」：原圖半透明的點透明度被乘兩次（128 變 64），
        //   去背立繪整圈外輪廓、髮絲每張表情都變淡（11-04 tmp/expr_alpha_test.cjs）。圈外的點現在一個都不碰。
        const patch = canvasOf(side, side), pg = patch.getContext('2d');
        pg.drawImage(gen, 0, 0, side, side);
        const oc = canvasOf(side, side); oc.getContext('2d').drawImage(src, L, T, side, side, 0, 0, side, side);
        rimMatch(patch, oc, { cx: ring.cx - L, cy: ring.cy - T, rx: ring.rx, ry: ring.ry, rot: ring.rot }, 0.78, 0.98);
        const mk = canvasOf(side, side), mkg = mk.getContext('2d');
        softOval(mkg, ring.cx - L, ring.cy - T, ring.rx, ring.ry, side * 0.03, ring.rot);
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
    //   大笑、驚訝嘴本來就開著，不做；講話時借別張的（mouthPick）。
    // 👁 眨眼（11-05 她：「是不是可以多生成一張閉眼照？這樣還能有眨眼效果」→ 小樣選了 A 快眨）
    //   同一套：每張圖再重畫兩隻眼睛那一小塊一次（閉眼），存在同一筆（eye＝位置、shut＝那塊圖）。
    //   劇情畫面隔幾秒閉一下（約 0.1 秒）、偶爾連眨兩下，講話時照樣眨。大笑眼睛本來就瞇著，不做。
    // ================================================================
    const MOUTH_APP = 'vn_mouth';
    const MOUTH_KEY = 'acg_expr_mouth';            // '0'＝生表情時不順便做動嘴、閉眼
    const MOUTH_SKIP = ['Laughing', 'Surprised'];
    const BLINK_SKIP = ['Laughing'];
    const MOUTH_MOOD = { default: 'neutral expression', Happy: 'smile', Shy: 'embarrassed, blush', Angry: 'angry, frown', Sad: 'sad, frown', Crying: 'crying, tears', Surprised: 'surprised, raised eyebrows' };
    const MOUTH_SHAPES = [
        { k: 'half', d: 0.6,  tags: '(slightly open mouth:1.3), talking, small mouth opening' },
        { k: 'open', d: 0.75, tags: '(open mouth:1.3), talking, speaking' },
    ];
    const EYE_SHAPE = { k: 'shut', d: 0.7, tags: '(closed eyes:1.4), eyelashes, sleeping eyes' };   // 11-05 小樣那份
    const EYE_GROW = 1.3;   // 閉眼重畫那塊比小圈大一點（見 mouthGeom）
    const mouthOn = () => { try { return localStorage.getItem(MOUTH_KEY) !== '0'; } catch (e) { return true; } };
    // 嘴、兩隻眼睛在臉圈裡的位置：u、v＝中心離圈心多少個半徑（左右、上下），a、b＝大小是半徑的幾倍。
    //   每張臉比例不一樣，固定比例常常顧了嘴、眼睛就歪（11-06 她：「圈好嘴，眼睛圈沒對上，移到眼睛圈，嘴又沒圈上」）
    //   → 生表情頁三個小圈可以各自拖，每個角色記一份（LAY_KEY），跟著大圈搬、縮放
    const LAY_KEY = 'acg_expr_lay';
    //   側臉（11-06 她：「面膜只適合正面？你有沒有想過有側臉一說？」）：
    //   eyes[i].off＝這隻眼睛看不到（全側臉只剩一隻），閉眼、眼睛那塊只做看得到的；rot＝大圈轉了幾度（弧度，頭歪的立繪），小圈跟著轉。
    //   兩個都是選填：以前存的（兩隻眼睛、沒轉）照樣讀得進來
    const LAY_DEF = { mouth: { u: 0, v: 0.324, a: 0.357, b: 0.243 }, eyes: [{ u: -0.42, v: -0.64, a: 0.32, b: 0.2 }, { u: 0.42, v: -0.64, a: 0.32, b: 0.2 }] };
    const layCopy = (l) => JSON.parse(JSON.stringify(l));
    function layFix(l) {
        const ok = (p) => p && ['u', 'v', 'a', 'b'].every(k => typeof p[k] === 'number' && isFinite(p[k]));
        if (!(l && ok(l.mouth) && Array.isArray(l.eyes) && l.eyes.length === 2 && l.eyes.every(ok))) return null;
        l.eyes.forEach(e => { if (e.off !== true) delete e.off; });
        if (l.eyes.every(e => e.off)) l.eyes.forEach(e => { delete e.off; });   // 兩隻都關＝壞掉的存檔，當兩隻都看得到
        if (!(typeof l.rot === 'number' && isFinite(l.rot)) || !l.rot) delete l.rot;
        return l;
    }
    // 位置一樣（不算哪隻眼睛關掉）：決定「圈放回原位」要不要出現
    const layPosKey = (l) => JSON.stringify({ m: l.mouth, e: l.eyes.map(e => [e.u, e.v, e.a, e.b]), r: l.rot || 0 });
    function layMap() { try { const v = JSON.parse(localStorage.getItem(LAY_KEY) || '{}'); return (v && typeof v === 'object') ? v : {}; } catch (e) { return {}; } }
    function layOf(ch) { const m = layMap(); const k = Object.keys(m).find(n => sameChar(n, ch)); return k ? layFix(m[k]) : null; }
    function laySave(ch, lay) {
        const m = layMap();
        Object.keys(m).forEach(n => { if (sameChar(n, ch)) delete m[n]; });
        if (lay) m[ch] = lay;
        const A = AUIx();
        return A && A.lsSet ? A.lsSet(LAY_KEY, JSON.stringify(m), '生表情時嘴和眼睛小圈的位置') : false;
    }
    // 小圈在原圖的位置：u、v 是大圈自己的方向（大圈轉了，小圈跟著繞圈心轉、自己也一起斜）
    function ovalAt(ring, p) {
        const t = ring.rot || 0, c = Math.cos(t), s = Math.sin(t), dx = p.u * ring.rx, dy = p.v * ring.ry;
        const o = { cx: ring.cx + dx * c - dy * s, cy: ring.cy + dx * s + dy * c, rx: p.a * ring.rx, ry: p.b * ring.ry };
        if (t) o.rot = t;
        if (p.off) o.off = true;
        return o;
    }
    function mouthOval(ring, lay) { return ovalAt(ring, (lay || LAY_DEF).mouth); }
    // 兩隻眼睛（也照臉圈推，預設在 LAY_DEF）：圈心往上 0.64 個半高、左右各 0.42 個半寬（11-05 那張立繪量過：眼睛中心對得上）
    //   回兩隻（關掉的帶 off）；要畫遮罩、切那塊的用 eyesOn（只有看得到的）
    function eyeOvals(ring, lay) { return (lay || LAY_DEF).eyes.map(p => ovalAt(ring, p)); }
    function eyesOn(ring, lay) { return eyeOvals(ring, lay).filter(o => !o.off); }
    // 斜的橢圓的外框半寬、半高
    function ovalHalf(o) {
        const t = o.rot || 0, c = Math.cos(t), s = Math.sin(t);
        return { w: Math.sqrt((o.rx * c) ** 2 + (o.ry * s) ** 2), h: Math.sqrt((o.rx * s) ** 2 + (o.ry * c) ** 2) };
    }
    // 點 (x, y) 在橢圓自己的座標裡離圈心幾個半徑（1＝剛好在圈上）
    function ovalDist(o, x, y) {
        const t = o.rot || 0, c = Math.cos(t), s = Math.sin(t), dx = x - o.cx, dy = y - o.cy;
        return Math.hypot((dx * c + dy * s) / o.rx, (-dx * s + dy * c) / o.ry);
    }
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
    //   這裡只認「這張自己的嘴」；自己沒有的，下面 mouthPick 再借同一個人別張的
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
    // 同一張圖補做的（只補閉眼、只補嘴）併進原本那筆；換過的圖整筆換新
    function samePic(a, b) {
        if (!a || !b || a.w !== b.w || a.h !== b.h) return false;
        if (a.src && b.src) return a.src === b.src;
        return sigDiff(a.sig, b.sig) < 2.5;
    }
    async function mouthSave(name, exp, data) {
        const v = await mouthLoad(name);
        const old = v.entries[exp];
        v.entries[exp] = samePic(old, data) ? Object.assign({}, old, data) : data;
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
    // 🗣 講話就要動嘴，跟表情無關（11-05 她：「講話就要動嘴，跟表情什麼關係，難道生氣就閉上嘴？」）
    //   這張圖自己沒有嘴（大笑、驚訝本來就不做；表情後來重生過；只做了幾張）→ 借同一個人別張的嘴：
    //   嘴角往上那幾種（微笑、害羞、大笑）先借同一類，往下那幾種（生氣、難過、哭）先借同一類，再來預設，都沒有就隨便一張。
    //   只借給「同一張立繪改出來的」：臉框四個角（臉圈外面，生表情不會動到的頭髮、背景）要一樣，不然嘴會貼到臉以外的地方
    const MOUTH_UP = ['Happy', 'Shy', 'Laughing'], MOUTH_DOWN = ['Angry', 'Sad', 'Crying'];
    function borrowOrder(exp) {
        const n = (exp === DEFAULT_EXP || EXPR_SET.some(x => x.exp === exp)) ? exp : (nearExp(exp) || DEFAULT_EXP);
        const fam = MOUTH_UP.indexOf(n) >= 0 ? MOUTH_UP : (MOUTH_DOWN.indexOf(n) >= 0 ? MOUTH_DOWN : []);
        return [n].concat(fam.filter(k => k !== n), [DEFAULT_EXP]);
    }
    // 同比例、不同大小（表情存檔時長邊縮到 1600）：嘴的位置照比例換算
    function mouthScaled(e, img) {
        const W = img.naturalWidth, H = img.naturalHeight;
        if (!e || !e.w || !e.h || !e.face || !e.box) return null;
        if (e.w === W && e.h === H) return e;
        if (Math.abs(e.w / e.h - W / H) > 0.01) return null;
        const s = W / e.w, sc = (b) => ({ x: Math.round(b.x * s), y: Math.round(b.y * s), w: Math.max(1, Math.round(b.w * s)), h: Math.max(1, Math.round(b.h * s)) });
        return Object.assign({}, e, { w: W, h: H, face: sc(e.face), box: sc(e.box) }, e.eye ? { eye: sc(e.eye) } : {});
    }
    // 臉框縮圖只比橢圓外那幾格（四個角）：同一張立繪改出來的表情，那裡一點都沒動
    function cornerDiff(a, b) {
        if (!a || !b || a.length !== b.length) return 999;
        let t = 0, n = 0;
        for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
            if (((x + 0.5 - 10) / 10) ** 2 + ((y + 0.5 - 10) / 10) ** 2 < 1.15) continue;
            const i = (y * 20 + x) * 4;
            for (let k = 0; k < 4; k++) t += Math.abs(a[i + k] - b[i + k]);
            n += 4;
        }
        return n ? t / n : 999;
    }
    function samePose(img, e) {
        const a = faceSig(img, e.face);
        return cornerDiff(a, e.sig) < 8 && sigDiff(a, e.sig) < 30;
    }
    // 這張圖講話用哪組嘴。list＝[{ exp, e }]（這個人存的每組嘴）；回 { e, own }（own＝這張自己的）或 null
    //   part＝'half' 找嘴、'shut' 找閉眼（同一套：自己的 → 同一類 → 預設 → 隨便一張）
    //   畫不進畫布的（別的網站的圖）會丟例外，呼叫的人接
    function mouthPick(list, img, key, exp, part) {
        part = part || 'half';
        list = list.filter(x => x.e && x.e[part]);
        for (const x of list) if (x.e.src && key && x.e.src === key) return { e: x.e, own: true };
        let best = null;
        for (const x of list) { const d = sameShot(img, x.e); if (d < 999 && (!best || d < best.d)) best = { d, e: x.e }; }
        if (best) return { e: best.e, own: true };
        const order = borrowOrder(exp), rank = (k) => { const i = order.indexOf(k); return i < 0 ? 99 : i; };
        const cand = list.map(x => ({ exp: x.exp, e: mouthScaled(x.e, img) })).filter(o => o.e && samePose(img, o.e));
        cand.sort((p, q) => rank(p.exp) - rank(q.exp));
        return cand.length ? { e: cand[0].e, own: false } : null;
    }
    async function mouthList(name) {
        const list = [];
        for (const n of (await mouthNames()).filter(k => sameChar(k, name))) {
            const d = await mouthLoad(n);
            Object.keys(d.entries).forEach(k => { if (d.entries[k]) list.push({ exp: k, e: d.entries[k] }); });
        }
        return list;
    }
    // key＝舞台那張圖的 srcKey（舞台算好帶過來；blob 的那種舞台會先找回原本那筆）；exp＝劇情寫的表情（借嘴時先借同一類）
    async function mouthFor(name, img, key, exp) {
        if (!img || !img.naturalWidth) return null;
        const list = await mouthList(name);
        if (!list.length) return null;
        try { const p = mouthPick(list, img, key, exp); return p ? p.e : null; } catch (err) { return null; }   // 別的網站的圖畫不進來
    }
    // 劇情畫面用：這張圖的嘴和閉眼各用哪一筆 { mouth, eyes }（沒有的是 null）
    async function faceFor(name, img, key, exp) {
        const none = { mouth: null, eyes: null };
        if (!img || !img.naturalWidth) return none;
        const list = await mouthList(name);
        if (!list.length) return none;
        try {
            const m = mouthPick(list, img, key, exp, 'half');
            // 大笑眼睛本來就瞇著：不借別張的閉眼來眨
            const e = (BLINK_SKIP.indexOf(exp) >= 0 || BLINK_SKIP.indexOf(nearExp(exp) || '') >= 0) ? null : mouthPick(list, img, key, exp, 'shut');
            return { mouth: m ? m.e : null, eyes: e ? e.e : null };
        } catch (err) { return none; }
    }
    // 嘴的位置（原圖像素）：mo＝嘴那顆橢圓、box＝切下來存的那塊、face＝認圖用的臉框。ComfyUI、GPT 兩條同一份
    //   斜的圈（頭歪）照外框算；眼睛只算看得到的那幾隻，每隻照自己的高度（11-06：以前眼睛那塊只看第一隻的高度，
    //   側臉兩眼不同高時另一隻被切掉一半，她那晚斜側臉那個角色 6 張閉眼都只閉了一隻）
    function mouthGeom(ring, W, H, lay) {
        const mo = mouthOval(ring, lay), mh = ovalHalf(mo);
        const bx = Math.max(0, Math.floor(mo.cx - mh.w * 1.15)), by = Math.max(0, Math.floor(mo.cy - mh.h * 1.15));
        const bw = Math.min(W - bx, Math.ceil(mh.w * 2.3)), bh = Math.min(H - by, Math.ceil(mh.h * 2.3));
        const rh = ovalHalf(ring);
        const fx = Math.max(0, Math.round(ring.cx - rh.w)), fy = Math.max(0, Math.round(ring.cy - rh.h));
        const face = { x: fx, y: fy, w: Math.max(1, Math.min(W - fx, Math.round(rh.w * 2))), h: Math.max(1, Math.min(H - fy, Math.round(rh.h * 2))) };
        // 眼睛：看得到的那幾顆橢圓（重畫、切那塊時放大 EYE_GROW 倍），切下來存的是包住它們的那一塊
        //   11-06：她那晚斜側臉那個角色閉眼 6 張都只閉一隻——遠的那隻眼睛輪廓超出小圈一點，模型就不肯把它畫閉。
        //   同一份工作流試過：力道 0.85、一次一隻都還是閉不上，小圈放大 1.3 倍 6 張都閉上了（tmp/expr_audit/eyevar_b08.png）
        const eyes = eyesOn(ring, lay).map(o => Object.assign({}, o, { rx: o.rx * EYE_GROW, ry: o.ry * EYE_GROW }));
        let ex0 = W, ex1 = 0, ey0 = H, ey1 = 0;
        eyes.forEach(o => {
            const h = ovalHalf(o);
            ex0 = Math.min(ex0, o.cx - h.w - o.rx * 0.15); ex1 = Math.max(ex1, o.cx + h.w + o.rx * 0.15);
            ey0 = Math.min(ey0, o.cy - h.h * 1.15); ey1 = Math.max(ey1, o.cy + h.h * 1.15);
        });
        ex0 = Math.max(0, Math.floor(ex0)); ex1 = Math.min(W, Math.ceil(ex1)); ey0 = Math.max(0, Math.floor(ey0)); ey1 = Math.min(H, Math.ceil(ey1));
        return { mo, box: { x: bx, y: by, w: bw, h: bh }, face, eyes, eye: { x: ex0, y: ey0, w: Math.max(1, ex1 - ex0), h: Math.max(1, ey1 - ey0) } };
    }
    // 一組嘴除了兩塊圖以外的那些：認圖用的縮圖、照哪一筆做的（src）、眼睛那塊在哪（eye）
    function mouthEntryBase(src, url, g) {
        return { w: src.naturalWidth, h: src.naturalHeight, face: g.face, sig: faceSig(src, g.face), box: g.box, msig: faceSig(src, g.box), src: srcKey(url), eye: g.eye };
    }
    // 重畫完的那一小塊：切下來、邊上那圈的膚色照原圖、只留橢圓裡（羽化）、透明度照原圖
    //   講話、眨眼時那塊才不會一閃一閃換色
    function cutPatch(gen, src, b, ovals, L, T, k, r0) {
        const pc = canvasOf(b.w, b.h), pg = pc.getContext('2d');
        pg.drawImage(gen, (b.x - L) * k, (b.y - T) * k, b.w * k, b.h * k, 0, 0, b.w, b.h);
        const ob = canvasOf(b.w, b.h); ob.getContext('2d').drawImage(src, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
        const local = ovals.map(o => ({ cx: o.cx - b.x, cy: o.cy - b.y, rx: o.rx, ry: o.ry, rot: o.rot }));
        rimMatch(pc, ob, local, r0, 0.98);
        pg.globalCompositeOperation = 'destination-in';
        const mk = canvasOf(b.w, b.h), mg = mk.getContext('2d');
        local.forEach(o => softOval(mg, o.cx, o.cy, o.rx, o.ry, Math.max(2, o.rx * 0.3), o.rot));
        pg.drawImage(mk, 0, 0);
        pg.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);   // 再乘一次原圖的透明度
        return pc.toDataURL('image/png');
    }
    // 這張圖做一組嘴、閉眼：微張、張開各重畫一次嘴那一小塊，閉眼重畫一次兩隻眼睛那塊。
    //   parts＝{ mouth, eyes } 要做哪幾樣（沒給＝都做）；只做一樣的，存的時候併進同一張原本那筆
    async function makeMouth(ex, exp, url, seed, parts) {
        parts = parts || { mouth: true, eyes: true };
        const M = win.OS_IMAGE_MANAGER;
        const src = await loadImg(url);
        const W = src.naturalWidth, H = src.naturalHeight, ring = ex.ring;
        const { side, L, T } = cropOf(ring, W, H);
        const P = 1024, k = P / side;
        const crop = canvasOf(P, P), cg = crop.getContext('2d');
        cg.fillStyle = '#fff'; cg.fillRect(0, 0, P, P);
        cg.drawImage(src, L, T, side, side, 0, 0, P, P);
        const cropUrl = crop.toDataURL('image/jpeg', 0.95);
        const geo = mouthGeom(ring, W, H, ex.lay);
        const maskOf = (ovals) => {
            const mask = canvasOf(P, P), mg = mask.getContext('2d');
            mg.fillStyle = '#000'; mg.fillRect(0, 0, P, P);
            ovals.forEach(o => softOval(mg, (o.cx - L) * k, (o.cy - T) * k, o.rx * k, o.ry * k, P * 0.008, o.rot));
            return mask.toDataURL('image/png');
        };
        const mood = MOUTH_MOOD[exp] || MOUTH_MOOD.default;
        // 臉的角度、臉上本來就有的（眼鏡…）也帶上：閉眼那塊蓋到鏡框，不說的話鏡框就被畫掉，眨眼時眼鏡一閃一閃
        const pre = EXPR_PRE + viewTags(ex.lay) + lookTags(ex.look, false);
        const out = mouthEntryBase(src, url, geo);   // src：照哪一筆做的
        if (parts.mouth) {
            const maskUrl = maskOf([geo.mo]);
            for (const sh of MOUTH_SHAPES) {
                const r = await M.comfyInpaint(cropUrl, maskUrl, pre + mood + ', ' + sh.tags, { denoise: sh.d, seed });
                out[sh.k] = cutPatch(await loadImg(r), src, geo.box, [geo.mo], L, T, k, 0.6);
            }
        }
        if (parts.eyes) {
            const r = await M.comfyInpaint(cropUrl, maskOf(geo.eyes), pre + mood + ', ' + EYE_SHAPE.tags, { denoise: EYE_SHAPE.d, seed });
            out.shut = cutPatch(await loadImg(r), src, geo.eye, geo.eyes, L, T, k, 0.6);
        }
        return out;
    }
    // 結果卡片：嘴張開＋閉著眼那張的臉（full＝整張，點開看用）
    async function mouthThumb(ex, url, m) {
        const base = await loadImg(url);
        const c = canvasOf(m.w, m.h), g = c.getContext('2d');
        g.drawImage(base, 0, 0);
        if (m.open) g.drawImage(await loadImg(m.open), m.box.x, m.box.y, m.box.w, m.box.h);
        if (m.shut && m.eye) g.drawImage(await loadImg(m.shut), m.eye.x, m.eye.y, m.eye.w, m.eye.h);
        const full = c.toDataURL('image/png');
        return { full, thumb: await faceThumb(ex, full) };
    }
    // 這次打開時哪幾張圖講話嘴不會動、不會眨眼（預設那張＋已經有的表情格）：自己沒有、也借不到別張的才要補。
    //   回 [{ exp, url, mouth, eyes }]（mouth／eyes＝要補哪樣）。
    //   要補閉眼的那張自己沒嘴的話，嘴一起重做：存進去會換掉這個表情原本那筆（舊的嘴是照舊圖做的，別張可能正借著用）
    async function mouthMissing(ex, info) {
        const need = [];
        const list = [{ exp: DEFAULT_EXP, url: ex.srcUrl || ex.img.src }].concat(info.slots.filter(s => s.used && s.exp !== DEFAULT_EXP).map(s => ({ exp: s.exp, url: s.used.url })));
        const entries = await mouthList(ex.ch);
        for (const it of list) {
            const canM = MOUTH_SKIP.indexOf(it.exp) < 0, canE = BLINK_SKIP.indexOf(it.exp) < 0;
            if (!canM && !canE) continue;
            let im;
            try { im = await loadImg(it.url); faceSig(im, { x: 0, y: 0, w: 1, h: 1 }); } catch (err) { continue; }   // 讀不到、別的網站畫不進來的跳過
            if (im.naturalWidth !== ex.W || im.naturalHeight !== ex.H) continue;   // 跟預設那張不一樣大：臉圈對不上，不做
            const key = srcKey(it.url);
            const eyes = canE && !mouthPick(entries, im, key, it.exp, 'shut');
            let mouth = canM && !mouthPick(entries, im, key, it.exp, 'half');
            if (eyes && canM && !mouth) {
                const own = mouthPick(entries.filter(x => x.exp === it.exp), im, key, it.exp, 'half');
                if (!own || !own.own) mouth = true;
            }
            if (mouth || eyes) need.push({ exp: it.exp, url: it.url, mouth, eyes });
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
                     mouth: mouthOn(), mouthNeed: null,   // mouthNeed：還沒對得上動嘴的那幾張（算好之前是 null）
                     lay: layOf(ch) || layCopy(LAY_DEF),     // 嘴、眼睛小圈的位置（她拖過就記在這個角色身上）
                     zoom: 'full', view: null,                // 畫面看整張（找臉時）還是放大頭部（找到臉就放大）
                     look: lookOf(ch) };                      // 眼睛顏色、臉上要留著的（她改過才有；沒改過下面從立繪描述自動帶）
        if (ex.lay.rot) ex.ring.rot = ex.lay.rot;
        ex.view = exFullView(ex);
        if (!ex.look) lookAuto(info).then(l => { if (!ex.lookTouched) { ex.look = l; if (S && S.ex === ex) exPaint(ex); } }, () => {});
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
          // 圖和圈畫在同一張 SVG 裡：座標一律是原圖像素，放大頭部＝只改 viewBox（看原圖哪一塊），存下來的位置不受畫面大小影響
          +   '<div class="acg-ex-stage">'
          +     '<svg class="acg-ex-ring" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">'
          +       '<image class="acg-ex-img" x="0" y="0" width="' + W + '" height="' + H + '" preserveAspectRatio="none"></image>'
          +       '<ellipse class="acg-ex-oval" vector-effect="non-scaling-stroke"></ellipse>'
          +       '<ellipse class="acg-ex-mouth" vector-effect="non-scaling-stroke"></ellipse>'
          +       '<ellipse class="acg-ex-mouth acg-ex-eye" vector-effect="non-scaling-stroke"></ellipse>'
          +       '<ellipse class="acg-ex-mouth acg-ex-eye" vector-effect="non-scaling-stroke"></ellipse>'
          +       '<line class="acg-ex-rotline" vector-effect="non-scaling-stroke"></line>'
          +       '<circle class="acg-ex-rot" vector-effect="non-scaling-stroke"></circle>'
          +       '<circle class="acg-ex-knob" vector-effect="non-scaling-stroke"></circle>'
          +       '<circle class="acg-ex-rot-hit"></circle>'
          +       '<circle class="acg-ex-knob-hit"></circle>'
          +     '</svg>'
          +     '<button class="acg-ex-zoom" type="button" data-act="expr-zoom"></button>'
          +   '</div>'
          +   '<div class="acg-ex-note">找臉中…</div>'
          +   '<div class="acg-ex-seg">'
          +     '<button class="acg-ex-seg-btn" type="button" data-act="expr-style" data-style="normal">一般</button>'
          +     '<button class="acg-ex-seg-btn" type="button" data-act="expr-style" data-style="quiet">內收</button>'
          +   '</div>'
          // 這張臉本來就有的：重畫時帶進詞裡，眼鏡才不會被吃掉、眼睛不會換顏色（沒改過＝從立繪描述自動勾）
          +   '<div class="acg-ex-look">'
          +     '<div class="acg-ex-look-row"><span class="acg-ex-look-k">眼睛顏色</span><div class="acg-ex-look-chips">'
          +       EYE_COLORS.map(c => '<button class="acg-ex-trait" type="button" data-act="expr-eyecolor" data-k="' + c.k + '">' + esc(c.zh) + '</button>').join('')
          +     '</div></div>'
          +     '<div class="acg-ex-look-row"><span class="acg-ex-look-k">臉上要留著的</span><div class="acg-ex-look-chips">'
          +       FACE_ACCS.map(a => '<button class="acg-ex-trait" type="button" data-act="expr-acc" data-k="' + a.k + '">' + esc(a.zh) + '</button>').join('')
          +     '</div></div>'
          +   '</div>'
          +   '<div class="acg-ex-picks">' + EXPR_SET.map(x =>
                  '<button class="acg-ex-chip" type="button" data-act="expr-pick" data-exp="' + x.exp + '">' + esc(x.zh)
                + (has[x.exp] ? '<span class="acg-ex-has">有了</span>' : '') + '</button>').join('') + '</div>'
          +   '<div class="acg-ex-opts"><button class="acg-ex-toggle" type="button" data-act="expr-mouth"><i class="fa-solid fa-comment-dots"></i> 講話動嘴、會眨眼</button>'
          // 側臉只看得到一隻眼睛：把看不到的那隻關掉，閉眼只做看得到的（左右＝畫面上的左右）
          +     '<button class="acg-ex-eyeon" type="button" data-act="expr-eyeoff" data-i="0"></button>'
          +     '<button class="acg-ex-eyeon" type="button" data-act="expr-eyeoff" data-i="1"></button>'
          +     '<button class="acg-ex-layreset" type="button" data-act="expr-lay-reset"><i class="fa-solid fa-rotate-left"></i> 圈放回原位</button></div>'
          +   '<div class="acg-ex-foot"><button class="acg-btn acg-btn-main acg-ex-go" type="button" data-act="expr-go"></button></div>'
          +   '<div class="acg-gen acg-ex-out"></div>'
          + '</div>';
        S.root.appendChild(el);
        ex.el = el;
        const pic = el.querySelector('.acg-ex-img');
        pic.setAttribute('href', img.src);
        try { pic.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', img.src); } catch (e) {}   // 舊的 Safari 只認 xlink:href
        exBindRing(ex);
        exSetView(ex, ex.view, false);
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
                if (ex.lay.rot) ex.ring.rot = ex.lay.rot;   // 這個角色轉過圈（頭歪）就照轉過的角度
            }
            ex.found = box ? 'yes' : 'no';
            ex.blocked = why;
            el.classList.remove('is-finding');
            // 找到臉＝放大到只剩頭（手機上整張立繪縮那麼小，圈根本拉不準）；沒找到先看整張，讓她把圈拖到頭上
            ex.zoom = box ? 'head' : 'full';
            exSetView(ex, box ? exHeadView(ex) : exFullView(ex), true);
        }
    }
    // ── 生表情頁看原圖哪一塊（原圖像素的正方形 {x, y, s}）──
    //   11-06 她：「表情面膜可以放大給我頭部就好嗎？手機窗口那麼小，還要我用那小面膜拉」
    //   head＝以臉圈為中心、往上多留一點頭髮，圈的直徑約占畫面六成；full＝整張放得下
    const HEAD_VIEW = 1.75;   // 畫面邊長＝圈的直徑的幾倍
    function exFullView(ex) {
        const s = Math.max(ex.W, ex.H);
        return { x: (ex.W - s) / 2, y: (ex.H - s) / 2, s };
    }
    function exHeadView(ex) {
        const r = ex.ring, s = Math.min(Math.max(r.rx, r.ry) * 2 * HEAD_VIEW, Math.max(ex.W, ex.H));
        let x = r.cx - s / 2, y = r.cy - r.ry * 0.25 - s / 2;
        if (s <= ex.W) x = Math.max(0, Math.min(ex.W - s, x));   // 圖夠大就別看到圖外面
        if (s <= ex.H) y = Math.max(0, Math.min(ex.H - s, y));
        return { x, y, s };
    }
    // 換看的那塊：滑過去（0.24 秒）；減少動態、或第一次畫就直接到。座標換算一律讀 SVG 當下的 viewBox，滑到一半拖也對得上
    function exSetView(ex, v, anim) {
        const svg = ex.el && ex.el.querySelector('.acg-ex-ring');
        if (!svg || !v) return;
        const from = ex.view;
        ex.view = v;
        const id = ex.viewRun = (ex.viewRun || 0) + 1;
        const put = (b) => svg.setAttribute('viewBox', b.x + ' ' + b.y + ' ' + b.s + ' ' + b.s);
        let still = !anim || !from;
        try { if (win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) still = true; } catch (e) {}
        exPaint(ex);
        if (still) { put(v); return; }
        const t0 = Date.now(), D = 240;
        const step = () => {
            if (ex.viewRun !== id) return;
            const k = Math.min(1, (Date.now() - t0) / D), e = 1 - Math.pow(1 - k, 3);
            put({ x: from.x + (v.x - from.x) * e, y: from.y + (v.y - from.y) * e, s: from.s + (v.s - from.s) * e });
            if (k < 1) win.requestAnimationFrame(step);
        };
        win.requestAnimationFrame(step);
        setTimeout(() => { if (ex.viewRun === id) put(v); }, D + 150);   // 看不到的時候 rAF 不跑，照樣停在終點
    }
    function exZoom() {
        const ex = S && S.ex;
        if (!ex || ex.found === null) return;
        ex.zoom = ex.zoom === 'head' ? 'full' : 'head';
        exSetView(ex, ex.zoom === 'head' ? exHeadView(ex) : exFullView(ex), true);
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
        const r = ex.ring, t = r.rot || 0, cs = Math.cos(t), sn = Math.sin(t);
        const world = (lx, ly) => [r.cx + lx * cs - ly * sn, r.cy + lx * sn + ly * cs];   // 大圈自己的座標 → 原圖
        const putOval = (node, o) => {
            node.setAttribute('cx', o.cx); node.setAttribute('cy', o.cy); node.setAttribute('rx', o.rx); node.setAttribute('ry', o.ry);
            if (o.rot) node.setAttribute('transform', 'rotate(' + (o.rot * 180 / Math.PI) + ' ' + o.cx + ' ' + o.cy + ')'); else node.removeAttribute('transform');
        };
        putOval(el.querySelector('.acg-ex-oval'), r);
        // 拉大小的圓點（右下）、轉的圓點（正上方，頭歪的立繪轉這個）跟著畫面大小走（不跟原圖）：放大頭部時才不會變成一大顆；
        //   外面一圈看不見的比較大，手指好按
        const vs = (ex.view || exFullView(ex)).s;
        const kn = world(r.rx * 0.7071, r.ry * 0.7071), top = world(0, -r.ry), rk = world(0, -r.ry - vs * 0.08);
        [['.acg-ex-knob', 0.026, kn], ['.acg-ex-knob-hit', 0.065, kn], ['.acg-ex-rot', 0.022, rk], ['.acg-ex-rot-hit', 0.06, rk]].forEach(([q, k, at]) => {
            const c = el.querySelector(q); if (!c) return;
            c.setAttribute('cx', at[0]); c.setAttribute('cy', at[1]); c.setAttribute('r', vs * k);
        });
        const rl = el.querySelector('.acg-ex-rotline');
        if (rl) { rl.setAttribute('x1', top[0]); rl.setAttribute('y1', top[1]); rl.setAttribute('x2', rk[0]); rl.setAttribute('y2', rk[1]); }
        const zb = el.querySelector('.acg-ex-zoom');
        if (zb) {
            zb.hidden = ex.found === null;
            if (zb.dataset.zoom !== ex.zoom) {   // 拖圈時每動一下都會重畫，鈕的字只在換的時候換
                zb.dataset.zoom = ex.zoom;
                zb.innerHTML = ex.zoom === 'head' ? '<i class="fa-solid fa-expand"></i> 看整張' : '<i class="fa-solid fa-magnifying-glass-plus"></i> 放大頭部';
            }
        }
        // 圈裡的小圈＝嘴、兩隻眼睛（跟著大圈走、跟著轉）；關掉的那隻眼睛不畫
        const small = [mouthOval(r, ex.lay)].concat(eyeOvals(r, ex.lay));
        el.querySelectorAll('.acg-ex-mouth').forEach((mEl, i) => { const o = small[i]; if (!o) return; putOval(mEl, o); mEl.classList.toggle('is-off', !!o.off); });
        el.classList.toggle('is-mouth', ex.mouth);
        const lr = el.querySelector('.acg-ex-layreset');
        if (lr) { lr.hidden = layPosKey(ex.lay) === layPosKey(LAY_DEF) || (!ex.mouth && !ex.lay.rot); lr.disabled = ex.busy; }
        // 看得到哪幾隻眼睛（動嘴眨眼開著才有小圈，才出現）；剩一隻時那隻不能再關
        el.querySelectorAll('.acg-ex-eyeon').forEach(b => {
            const i = +b.dataset.i, off = !!ex.lay.eyes[i].off, other = ex.lay.eyes[1 - i];
            b.hidden = !ex.mouth;
            b.classList.toggle('is-on', !off);
            b.disabled = ex.busy || (!off && !!other.off);
            const want = (off ? 'off' : 'on') + i;
            if (b.dataset.st !== want) { b.dataset.st = want; b.innerHTML = '<i class="fa-solid ' + (off ? 'fa-eye-slash' : 'fa-eye') + '"></i> ' + (i ? '右邊眼睛' : '左邊眼睛'); }
        });
        // 眼睛顏色、臉上要留著的
        const lk = ex.look || {};
        el.querySelectorAll('[data-act="expr-eyecolor"]').forEach(b => { b.classList.toggle('is-on', lk.eye === b.dataset.k); b.disabled = ex.busy; });
        el.querySelectorAll('[data-act="expr-acc"]').forEach(b => { b.classList.toggle('is-on', (lk.acc || []).indexOf(b.dataset.k) >= 0); b.disabled = ex.busy; });
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
            : ex.engine === 'gpt' ? (ex.mouth ? '大圈會重畫，小圈是嘴和眼睛，都可以拖（用 GPT：七個表情一起畫）' : '圈裡的地方會重畫，不對可以拖（用 GPT：七個表情一起畫）')
            : ex.mouth ? '大圈會重畫，小圈是嘴和眼睛，都可以拖' : '圈裡的地方會重畫，不對可以拖';
        const go = el.querySelector('.acg-ex-go');
        const n = ex.picks.length, m = mouthJobs(ex).length;
        const finished = !ex.busy && ex.ranAll && !n && !m && ex.done.length > 0;
        go.disabled = ex.busy || ex.found === null || (!finished && (!!ex.blocked || (!n && !m)));
        go.dataset.act = finished ? 'expr-close' : 'expr-go';
        go.textContent = ex.busy ? ('生成中 ' + (ex.done.length - ex.base) + '／' + ex.total)
            : finished ? '完成'
            : n ? (ex.err ? '再生成剩下的（' : '開始生成（') + n + ' 個表情' + (m ? '＋' + m + ' 組動嘴眨眼' : '') + '）'
            : m ? '補動嘴眨眼（' + m + ' 組）' : '選要哪幾個表情';
    }
    // 這一輪要做的動嘴、閉眼：要生的表情（嘴：大笑驚訝除外；眼：大笑除外）＋還沒對得上的那幾張（預設那張也算）
    function mouthJobs(ex) {
        if (!ex.mouth) return [];
        return ex.picks.map(e => ({ exp: e, url: '', mouth: MOUTH_SKIP.indexOf(e) < 0, eyes: BLINK_SKIP.indexOf(e) < 0 })).filter(j => j.mouth || j.eyes)
            .concat((ex.mouthNeed || []).filter(it => ex.picks.indexOf(it.exp) < 0));
    }
    // 卡片上寫這組做了哪樣
    const partZh = (j) => j.mouth && j.eyes ? '・動嘴眨眼' : j.mouth ? '・動嘴' : '・眨眼';
    function exMouth() {
        const ex = S && S.ex;
        if (!ex || ex.busy) return;
        ex.mouth = !ex.mouth;
        const A = AUIx(); if (A && A.lsSet) A.lsSet(MOUTH_KEY, ex.mouth ? '1' : '0', '生表情時順便做動嘴、閉眼');
        exPaint(ex);
    }
    // 圈放回原位：小圈的位置、大圈轉的角度回到原本；哪隻眼睛關掉照留（那是看不看得到，不是位置）
    function exLayReset() {
        const ex = S && S.ex;
        if (!ex || ex.busy) return;
        const offs = ex.lay.eyes.map(e => !!e.off);
        ex.lay = layCopy(LAY_DEF);
        offs.forEach((o, i) => { if (o) ex.lay.eyes[i].off = true; });
        delete ex.ring.rot;
        laySave(ex.ch, offs.some(Boolean) ? ex.lay : null);
        exPaint(ex);
    }
    // 側臉：關掉看不到的那隻眼睛（另一隻不能也關）；存在這個角色的小圈位置裡
    function exEyeOff(i) {
        const ex = S && S.ex;
        if (!ex || ex.busy) return;
        const e = ex.lay.eyes[i], other = ex.lay.eyes[1 - i];
        if (!e) return;
        if (e.off) delete e.off;
        else if (!other.off) e.off = true;
        else return;
        laySave(ex.ch, ex.lay);
        exPaint(ex);
    }
    // 眼睛顏色（再按一次＝不指定）、臉上要留著的（可以好幾樣）：她改過就記在這個角色身上，之後不再自動帶
    function exLook(kind, k) {
        const ex = S && S.ex;
        if (!ex || ex.busy) return;
        const look = lookFix(ex.look) || { eye: '', acc: [], phrase: {} };
        if (kind === 'eye') look.eye = look.eye === k ? '' : k;
        else { const i = look.acc.indexOf(k); if (i >= 0) { look.acc.splice(i, 1); delete look.phrase[k]; } else look.acc.push(k); }
        ex.look = look; ex.lookTouched = true;
        lookSave(ex.ch, look);
        exPaint(ex);
    }
    // 拖圈：按在小圈上＝搬那個小圈，按在大圈上（或空白處）＝搬大圈，按右下的圓點＝改大小；座標換成原圖像素
    //   畫面看的是原圖哪一塊照 SVG 當下的 viewBox 換算（放大頭部、滑到一半都對得上），k＝原圖一點在畫面上幾點
    function exBindRing(ex) {
        const svg = ex.el.querySelector('.acg-ex-ring');
        let drag = null;
        const at = (ev) => {
            const b = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
            const k = Math.min(b.width / vb.width, b.height / vb.height) || 1;
            const ox = (b.width - vb.width * k) / 2, oy = (b.height - vb.height * k) / 2;   // meet：上下或左右可能留白
            return { x: vb.x + (ev.clientX - b.left - ox) / k, y: vb.y + (ev.clientY - b.top - oy) / k, k };
        };
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        // 按到哪個小圈：按在圈上；用手指的話圈外一圈 10 點以內也算（手機上小圈只有十幾點寬，按不準）；都不是回 null
        //   🚨 滑鼠不放寬：大圈正中間離嘴的小圈只差幾點，放寬的話按圈心想搬大圈會變成搬嘴
        const nearPart = (ev, p) => {
            if (!ex.mouth) return null;
            const parts = [ex.lay.mouth].concat(ex.lay.eyes);
            const i = Array.prototype.indexOf.call(ex.el.querySelectorAll('.acg-ex-mouth'), ev.target);
            if (i >= 0) return (parts[i] && !parts[i].off) ? parts[i] : null;
            if (ev.pointerType === 'mouse') return null;
            const sc = p.k;   // 原圖一點＝畫面幾點
            let best = null, bd = 10;
            parts.forEach(pt => {
                if (pt.off) return;   // 關掉的眼睛沒畫出來，抓不到
                const o = ovalAt(ex.ring, pt);
                const d = (ovalDist(o, p.x, p.y) - 1) * Math.min(o.rx, o.ry) * sc;   // 離圈邊幾點（圈裡是負的）
                if (d < bd) { bd = d; best = pt; }
            });
            return best;
        };
        // 原圖的點 → 大圈自己的座標（大圈轉了也對）
        const local = (p) => { const r = ex.ring, t = r.rot || 0, c = Math.cos(t), s = Math.sin(t), dx = p.x - r.cx, dy = p.y - r.cy; return { x: dx * c + dy * s, y: -dx * s + dy * c }; };
        svg.addEventListener('pointerdown', (ev) => {
            if (ex.busy || ex.found === null) return;
            const p = at(ev);
            const r = ex.ring;
            const cl = ev.target.classList;
            if (cl.contains('acg-ex-knob') || cl.contains('acg-ex-knob-hit')) drag = { mode: 'size' };
            else if (cl.contains('acg-ex-rot') || cl.contains('acg-ex-rot-hit')) drag = { mode: 'rot' };
            else if (nearPart(ev, p)) {
                // 小圈（嘴、兩隻眼睛）各自拖：記成離圈心幾個半徑，大圈之後怎麼搬、縮放都跟著走
                const part = nearPart(ev, p);
                const o = ovalAt(r, part);
                drag = { mode: 'part', part, dx: p.x - o.cx, dy: p.y - o.cy };
            } else {
                const inside = ovalDist(r, p.x, p.y) <= 1;
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
            if (drag.mode === 'part') {
                // 小圈的位置記成大圈自己的座標（大圈轉了也對）；不要拖出大圈太遠（重畫只裁大圈附近那塊）
                const q = local({ x: p.x - drag.dx, y: p.y - drag.dy });
                drag.part.u = clamp(q.x / r.rx, -1.3, 1.3);
                drag.part.v = clamp(q.y / r.ry, -1.3, 1.3);
                drag.moved = true;
            }
            else if (drag.mode === 'move') { r.cx = clamp(p.x - drag.dx, 0, ex.W); r.cy = clamp(p.y - drag.dy, 0, ex.H); }
            else if (drag.mode === 'rot') {
                // 轉的圓點在正上方：手指繞著圈心轉多少，圈就轉多少；差 3 度以內吸回正的；最多轉 ±80 度
                let a = Math.atan2(p.y - r.cy, p.x - r.cx) + Math.PI / 2;
                if (a > Math.PI) a -= Math.PI * 2;
                a = clamp(a, -1.4, 1.4);
                if (Math.abs(a) < 0.052) a = 0;
                if (a) { r.rot = a; ex.lay.rot = a; } else { delete r.rot; delete ex.lay.rot; }
                drag.moved = true;
            }
            else { const q = local(p); r.rx = clamp(Math.abs(q.x) / 0.7071, ex.W * 0.03, ex.W * 0.5); r.ry = clamp(Math.abs(q.y) / 0.7071, ex.H * 0.02, ex.H * 0.5); }
            exPaint(ex);
        });
        const end = () => {
            if (drag && (drag.mode === 'part' || drag.mode === 'rot') && drag.moved) { laySave(ex.ch, ex.lay); exPaint(ex); }   // 拖完記在這個角色身上
            // 放大頭部時：大圈搬到快出畫面、或拉得太大太小，放手後畫面跟過去（圈回到畫面中間、約占六成）
            if (drag && drag.mode !== 'part' && ex.zoom === 'head') {
                const v = ex.view, r = ex.ring, h = ovalHalf(r), m = v.s * 0.04, d = Math.max(r.rx, r.ry) * 2 / v.s;
                const inside = r.cx - h.w >= v.x + m && r.cx + h.w <= v.x + v.s - m && r.cy - h.h >= v.y + m && r.cy + h.h <= v.y + v.s - m;
                if (!inside || d < 0.42 || d > 0.72) exSetView(ex, exHeadView(ex), true);
            }
            drag = null;
        };
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
        const partsOf = (j) => ({ mouth: !!j.mouth, eyes: !!j.eyes });
        list.forEach(x => {
            jobs.push({ kind: 'face', key: x.exp, exp: x.exp, zh: x.zh, item: x });
            const mj = mJobs.find(j => j.exp === x.exp);
            if (mj) jobs.push({ kind: 'mouth', key: x.exp + '~m', exp: x.exp, zh: x.zh + partZh(mj), url: '', parts: partsOf(mj) });
        });
        mJobs.filter(j => !list.some(x => x.exp === j.exp)).forEach(j => jobs.push({ kind: 'mouth', key: j.exp + '~m', exp: j.exp, zh: zhOf(j.exp) + partZh(j), url: j.url, parts: partsOf(j) }));
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
                    const m = await makeMouth(ex, j.exp, base, seed, j.parts);
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
    // GPT 那條（OS_EXPR_GRID）：七個表情一通畫完、只存選了的；動嘴、閉眼再一通（每通最多四張圖，一張一排：微張、張開、閉眼）。
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
        const geo = mouthGeom(ex.ring, ex.W, ex.H, ex.lay);
        const per = G.MOUTH_PER_CALL || 4;
        for (let k = 0; k < mj.length; k += per) {
            const part = mj.slice(k, k + per);
            try {
                const bases = [];
                for (const j of part) { const url = j.url || madeUrl[j.exp]; bases.push({ j, url, img: await loadImg(url) }); }
                const pats = await G.makeMouths(bases.map(b => ({ img: b.img })), ex.ring, geo.mo, geo.box, geo.eyes, geo.eye);
                for (let q = 0; q < bases.length; q++) {
                    // 每排三格都畫了，只收這組要的（大笑驚訝的嘴不收；只補閉眼的不動原本的嘴）
                    const b = bases[q], p = b.j.parts || { mouth: true, eyes: true }, m = mouthEntryBase(b.img, b.url, geo);
                    if (p.mouth) { m.half = pats[q].half; m.open = pats[q].open; }
                    if (p.eyes && pats[q].shut) m.shut = pats[q].shut;
                    await mouthSave(ex.ch, b.j.exp, m);
                    if (ex.mouthNeed) ex.mouthNeed = ex.mouthNeed.filter(it => it.exp !== b.j.exp);
                    const t = await mouthThumb(ex, b.url, m);
                    put(b.j, { exp: b.j.key, zh: b.j.zh, url: t.full, thumb: t.thumb });
                }
            } catch (e) { fail(mj.slice(k), '動嘴眨眼', e); return; }
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

    win.OS_CHAR_GALLERY = { open, close, localUrl, userRefUrl, nearExp, exprHave, mouthFor, faceFor, mouthRev, srcKey, _test: { parseLine, parseImport, wbSaveMany, wbRowsFor, fmtLine, sameChar, cropOf, mouthOval, eyeOvals, eyesOn, mouthGeom, sigDiff, ovalDist, layFix, lookFromText, lookTags, viewTags, exprMask, DIFF } };
    if (win !== window) window.OS_CHAR_GALLERY = win.OS_CHAR_GALLERY;
})();
