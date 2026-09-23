// ----------------------------------------------------------------
// [檔案] os_vn_rules.js — VN 指令（程式內建的 VN 主 prompt）
// 路徑：os_phone/os/os_vn_rules.js
// 職責：VN 面板靠它產出能解析的格式——正文格式與 TAG 總綱、SFX、BGM、手機／戰鬥模組、頭像規則。
//   內容在 os_vn_rules_data.js，跟著程式走：沒有匯入匯出、沒有編輯畫面，要改就改那支檔案。
//   以前住三個地方各改各的：酒館全域世界書「-VN小說家-」、os_prompts 寫死給 PWA 的總綱、PWA 常駐書包。
//   ・酒館：GENERATION_STARTED → injectPrompts（倒數第 N 則前）／setExtensionPrompt（最前面），生成完就撤
//   ・PWA：os_api_engine 組 VN context 時把 getDepthParts() 併進世界書 @D 那批；「最前面」的走面板提示詞那格
//   ・自由模式／世界題材／頭像產圖只撥開關，狀態記在這台裝置（os_vn_rules_on）
//   ・BGM／音效那 8 條清單例外：素材是使用者自己的，可以在 設置→素材目錄 改（os_vn_rules_custom）；其餘內容永遠是程式裡那份
//   ・角色、CP 關係、內容偏好不放這裡：那些是世界設定或個人偏好，留在世界書
//   ・第一次載入：把世界書裡跟內建條目「同名」的關掉（只做一次、只撥開關），不然會送兩份
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const STATE_KEY = 'os_vn_rules_on';             // { id: true/false }：被撥過的才記，沒記的用出廠值
    const CUSTOM_KEY = 'os_vn_rules_custom';        // { id: 內容 }：只收 EDITABLE 那幾條，跟出廠一樣就不存

    // 使用者可以自己改的清單：音樂與音效是他們自己的素材（資料夾在 設置→素材目錄 填），
    //   清單要跟資料夾裡的檔名對得上，所以給他們改。其餘條目（總綱、規範、模組）一律鎖在程式裡。
    const EDITABLE = [
        { id: 'bgm_modern',  group: 'bgm', label: '現代一般' },
        { id: 'bgm_mystery', group: 'bgm', label: '偵探' },
        { id: 'bgm_fantasy', group: 'bgm', label: '奇幻' },
        { id: 'bgm_wuxia',   group: 'bgm', label: '武俠仙俠' },
        { id: 'bgm_horror',  group: 'bgm', label: '恐怖' },
        { id: 'sfx_common',  group: 'sfx', label: '通用' },
        { id: 'sfx_modern',  group: 'sfx', label: '現代' },
        { id: 'sfx_fantasy', group: 'sfx', label: '奇幻中世紀' }
    ];
    const _isEditable = id => EDITABLE.some(x => x.id === id);
    const MIGRATE_KEY = 'os_vn_rules_book_off_v1';  // 世界書同名條目已經關過
    const INJECT_ID = 'aurelia_vn_rules';
    const ROLE_NAME = { 0: 'system', 1: 'user', 2: 'assistant' };
    const SEP = '\n\n';

    // 126c44a 那一版是可編輯、要匯入的副本，已經不用
    try { localStorage.removeItem('os_vn_rules'); } catch (e) {}

    function _toast(kind, msg, title) {
        try { const A = win.AUI || window.AUI; const t = A && A.toastr; if (t && t[kind]) t[kind](msg, title); } catch (e) {}
    }
    function _isStandalone() { try { return !!(win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()); } catch (e) { return false; } }
    function _normDepth(d) {
        if (d === null || d === undefined || d === '') return null;
        const n = parseInt(d, 10);
        return (isNaN(n) || n < 0) ? null : n;
    }
    function _normRole(r) { return (r === 1 || r === 2) ? r : 0; }

    // ================================================================
    // 資料
    // ================================================================
    function _data() {
        const d = win.OS_VN_RULES_DATA || window.OS_VN_RULES_DATA;
        return Array.isArray(d) ? d : [];
    }
    function _loadState() {
        try { const s = JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); return (s && typeof s === 'object') ? s : {}; }
        catch (e) { return {}; }
    }
    function _saveState(s) {
        try { localStorage.setItem(STATE_KEY, JSON.stringify(s || {})); return true; }
        catch (e) { console.warn('[VN指令] 開關狀態存不進去:', e); return false; }
    }

    // 🎵 音效和音樂交給 Jev 配（os_jev_sfx.js）：開著＋有決策模型鑰匙才算。
    //   生效時 BGM／音效清單和 BGM 規範不送給正文 AI，總綱裡教它寫 #音效# 和 [BGM|] 的那幾行也拿掉（清單還是留在設置裡給 Jev 用）。
    function _jevSfxOn() {
        try { return localStorage.getItem('jev_sfx_on') === '1' && !!(localStorage.getItem('npc_decide_key') || '').trim(); } catch (e) { return false; }
    }
    const JEV_SFX_HIDE = ['bgm_rules'].concat(EDITABLE.map(x => x.id));
    function _jevSfxStrip(id, content) {
        if (id !== 'core_format' && id !== 'core_format_free') return content;
        return String(content)
            .replace(/^\[BGM\|BGM_ID\][^\n]*\n?/m, '')
            .replace(/^- Bg\/BGM 可在[^\n]*$/m, '- Bg 可在 ChapterCard 外的正文區穿插換場。')
            .replace(/^## SFX \/ FX$/m, '## FX')
            // 🚨 音效那行連著「正文禁止任何音效說明/註解/技術自白」這條禁令；整行拿掉過一次，AI 就在正文裡寫「(此处不用特效，改掉，删)」
            .replace(/^- #SFXID#[^\n]*$/m, '- 正文禁止任何音效／特效的說明、註解、技術自白（例如「這裡不用特效」），違者該段作廢。');
    }
    // 🪙 起始金額：這本故事的微信錢包還沒設過 → 手機那條（通話與手機聊天，兩版）後面多一句，叫正文 AI 在章節卡寫 [Wallet|金額]。
    //   手機那條只在現代題材開著，奇幻武俠那種卡本來就沒微信錢包、也就不會看到這句（她 09-23）。
    const WALLET_SEED_LINE = '\n\n- 主角手機裡的微信錢包還沒有設過金額。這一回合在 <ChapterCard> 裡多寫一行 [Wallet|金額]：照主角的身分、職業、家境，寫他的微信錢包現在大概有多少錢（只寫數字，單位是元）。這行只寫這一次，之後的回合都不要再寫。';
    function _walletSeedLine(id) {
        if (id !== 'call_phone' && id !== 'call_phone_free') return '';
        try { const W = win.WX_WALLET || window.WX_WALLET; return (W && W.needsSeed && W.needsSeed()) ? WALLET_SEED_LINE : ''; } catch (e) { return ''; }
    }
    function list() {
        const st = _loadState();
        const cu = _loadCustom();
        const jev = _jevSfxOn();
        return _data().map(d => ({
            id: d.id,
            name: d.name,
            content: _jevSfxStrip(d.id, String((Object.prototype.hasOwnProperty.call(cu, d.id) ? cu[d.id] : d.content) || '')) + _walletSeedLine(d.id),
            depth: _normDepth(d.depth),
            role: _normRole(d.role),
            enabled: Object.prototype.hasOwnProperty.call(st, d.id) ? st[d.id] !== false : d.on !== false,
            jevHidden: jev && JEV_SFX_HIDE.indexOf(d.id) >= 0   // 清單本身還是「開著」（設置頁、Jev 都照這個），只是不送給正文 AI
        }));
    }
    function hasAny() { return _data().length > 0; }

    // ── 使用者改過的清單（BGM／音效）──
    function _loadCustom() {
        try {
            const c = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}');
            const out = {};
            if (c && typeof c === 'object') Object.keys(c).forEach(k => { if (_isEditable(k) && typeof c[k] === 'string') out[k] = c[k]; });
            return out;
        } catch (e) { return {}; }
    }
    function _saveCustom(c) {
        try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(c || {})); return true; }
        catch (e) {
            console.warn('[VN指令] 清單存不進去:', e);
            _toast('error', '清單存不進去：瀏覽器的儲存空間滿了');
            return false;
        }
    }
    const _norm = s => String(s == null ? '' : s).replace(/\r\n/g, '\n').trim();
    // group 省略＝全部：[{ id, group, label, content, defaultContent, custom }]
    function getLists(group) {
        const cu = _loadCustom();
        return EDITABLE.filter(x => !group || x.group === group).map(x => {
            const d = _data().find(y => y.id === x.id);
            if (!d) return null;
            const has = Object.prototype.hasOwnProperty.call(cu, x.id);
            return { id: x.id, group: x.group, label: x.label, content: has ? cu[x.id] : String(d.content || ''), defaultContent: String(d.content || ''), custom: has };
        }).filter(Boolean);
    }
    // 跟出廠一樣就刪掉那筆（之後出廠清單更新才跟得上）；清空也算一種改法（＝這組不給 AI 挑）
    function setList(id, content) {
        if (!_isEditable(id)) return false;
        const d = _data().find(y => y.id === id);
        if (!d) return false;
        const cu = _loadCustom();
        if (_norm(content) === _norm(d.content)) delete cu[id];
        else cu[id] = String(content == null ? '' : content).replace(/\r\n/g, '\n');
        return _saveCustom(cu);
    }
    const _live = e => !!(e && e.enabled && !e.jevHidden && e.content.trim());

    // 設了位置的：[{ depth, role, text }]，深度大的排前面（呼叫端由大到小插），形狀跟 OS_WORLDBOOK.getContextParts 的 depths 一樣
    function getDepthParts() {
        const byKey = new Map();
        list().forEach(e => {
            if (!_live(e) || e.depth === null) return;
            const k = e.depth + ':' + e.role;
            if (!byKey.has(k)) byKey.set(k, { depth: e.depth, role: e.role, arr: [] });
            byKey.get(k).arr.push(e.content.trim());
        });
        return [...byKey.values()]
            .map(o => ({ depth: o.depth, role: o.role, text: o.arr.join(SEP) }))
            .sort((a, b) => (b.depth - a.depth) || (b.role - a.role));
    }
    // 「最前面」那幾條
    function getPreText() {
        return list().filter(e => _live(e) && e.depth === null).map(e => e.content.trim()).join(SEP);
    }
    // 全部開著的，不分位置（小劇場那種自己組 prompt 的地方用）
    function getText() {
        return list().filter(_live).map(e => e.content.trim()).join('\n\n──────\n\n');
    }

    // 批次撥開關。decide(entry) 回 undefined＝不碰；true/false＝該開/該關；{ want, label }＝同上，回報時用 label 當名字。
    function apply(decide) {
        const out = { opened: [], closed: [], seen: [] };
        const st = _loadState();
        let dirty = false;
        list().forEach(e => {
            let r;
            try { r = decide(e); } catch (err) { r = undefined; }
            if (r === undefined || r === null) return;
            const want = (typeof r === 'object') ? !!r.want : !!r;
            const label = (typeof r === 'object' && r.label) || e.name || '';
            out.seen.push(label);
            if (e.enabled === want) return;
            st[e.id] = want;
            dirty = true;
            (want ? out.opened : out.closed).push(label);
        });
        if (dirty) _saveState(st);
        return out;
    }
    // 名字含 managed 其中之一的才動；on 裡的開、其餘關。回報用命中的關鍵字
    function setEnabledByName(managed, on, adjust) {
        if (!Array.isArray(managed) || !managed.length) return { opened: [], closed: [], seen: [] };
        const onSet = on instanceof Set ? on : new Set(on || []);
        return apply(e => {
            const hit = managed.find(n => e.name.includes(n));
            if (!hit) return undefined;
            let should = onSet.has(hit);
            if (typeof adjust === 'function') { try { should = !!adjust(e.name, hit, should); } catch (err) {} }
            return { want: should, label: hit };
        });
    }

    // ================================================================
    // 酒館注入
    // ================================================================
    let _undo = [];
    let _lastInjected = null;
    function _clearInjected() {
        _undo.forEach(f => { try { f(); } catch (e) {} });
        _undo = [];
    }
    function inject(dryRun) {
        _clearInjected();
        if (dryRun) return;                        // 空跑不注入（once 會被空跑吃掉）
        if (win.__AURELIA_SUMMARIZING) return;     // 大總結／小工具自己的生成，別塞 VN 寫法進去
        if (_isStandalone()) return;               // PWA 走 os_api_engine
        const TH = win.TavernHelper;
        if (!TH || !TH.injectPrompts) return;
        const parts = getDepthParts();
        const pre = getPreText();
        if (parts.length) {
            const r = TH.injectPrompts(parts.map(p => ({
                id: INJECT_ID + '_d' + p.depth + '_' + p.role,
                content: p.text,
                position: 'in_chat',
                depth: p.depth,
                role: ROLE_NAME[p.role]
            })), { once: true });
            if (r && typeof r.uninject === 'function') _undo.push(r.uninject);
        }
        if (pre) {
            let ctx = null;
            try { ctx = (win.SillyTavern && win.SillyTavern.getContext) ? win.SillyTavern.getContext() : null; } catch (e) {}
            if (ctx && ctx.setExtensionPrompt) {
                // IN_PROMPT＝preset 主提示正後方（跟大總結同一個位置，os_summary_inject 對過酒館原始碼）
                ctx.setExtensionPrompt(INJECT_ID + '_pre', (win.AURELIA_BLOCK ? win.AURELIA_BLOCK.wrap(INJECT_ID + '_pre', pre) : pre), 0, 0, false, 0);
                _undo.push(() => ctx.setExtensionPrompt(INJECT_ID + '_pre', '', 0, 0, false, 0));
            }
        }
        _lastInjected = {
            parts: parts.map(p => ({ depth: p.depth, role: ROLE_NAME[p.role], len: p.text.length })),
            preLen: pre.length
        };
    }

    // ================================================================
    // 第一次載入：世界書裡同名的關掉
    // ================================================================
    // 酒館：全域掛著的＋這張卡掛的＋名叫 -VN小說家- 的那本（沒掛也查，搬過來以前內建條目就住那裡）
    async function _tavernBooksToCheck(H) {
        const out = [];
        const add = n => { const s = typeof n === 'string' ? n : (n && n.name); if (s && out.indexOf(s) < 0) out.push(s); };
        try { if (H.getGlobalWorldbookNames) ((await H.getGlobalWorldbookNames()) || []).forEach(add); } catch (e) {}
        try { const st = H.getLorebookSettings ? await H.getLorebookSettings() : null; ((st && st.selected_global_lorebooks) || []).forEach(add); } catch (e) {}
        try { const c = H.getCharLorebooks ? await H.getCharLorebooks() : null; if (c) { add(c.primary); (c.additional || []).forEach(add); } } catch (e) {}
        try {
            const fn = H.getWorldbookNames || H.getLorebooks;
            const all = fn ? ((await fn.call(H)) || []) : [];
            if (all.some(n => (typeof n === 'string' ? n : (n && n.name)) === '-VN小說家-')) add('-VN小說家-');
        } catch (e) {}
        return out;
    }
    // 回 true＝做完了（有沒有關到都算）；false＝還沒就緒，等一下再試
    async function _closeSameNameOnce() {
        try { if (localStorage.getItem(MIGRATE_KEY)) return true; } catch (e) { return true; }
        const names = new Set(_data().map(d => String(d.name || '').trim()));
        if (!names.size) return false;
        let closed = 0;
        const where = [];
        if (_isStandalone()) {
            const DB = win.OS_DB;
            if (!DB || !DB.getAllWorldbookEntries || !DB.saveWorldbookEntry) return false;
            const all = (await DB.getAllWorldbookEntries()) || [];
            for (const e of all) {
                // 名字完全一樣才算：固定版／自由版名字互為前綴，用「包含」會關錯
                if (!e || e.enabled === false || !names.has(String(e.title || '').trim())) continue;
                await DB.saveWorldbookEntry(Object.assign({}, e, { enabled: false, updatedAt: Date.now() }));
                closed++;
                const b = e.book || '世界書';
                if (where.indexOf(b) < 0) where.push(b);
            }
        } else {
            const H = win.TavernHelper;
            if (!H || typeof H.getLorebookEntries !== 'function' || typeof H.setLorebookEntries !== 'function') return false;
            for (const book of await _tavernBooksToCheck(H)) {
                let ents = [];
                try { ents = (await H.getLorebookEntries(book)) || []; } catch (e) { continue; }
                const ups = ents
                    .filter(e => e && e.enabled !== false && names.has(String(e.comment || '').trim()))
                    .map(e => ({ uid: e.uid, enabled: false }));
                if (!ups.length) continue;
                try { await H.setLorebookEntries(book, ups); closed += ups.length; where.push(book); }
                catch (e) { console.warn('[VN指令] 關掉「' + book + '」同名條目失敗:', e); }
            }
        }
        try { localStorage.setItem(MIGRATE_KEY, String(Date.now())); } catch (e) {}
        if (closed) {
            console.log('🪶 [VN指令] 世界書同名條目已關掉 ' + closed + ' 條：' + where.join('、'));
            _toast('info', '「' + where.join('、') + '」裡同名的 ' + closed + ' 條已關掉，內容沒動', 'VN 指令改由程式內建');
        }
        return true;
    }
    function _scheduleCloseSameName(tries) {
        setTimeout(async () => {
            let done = false;
            try { done = await _closeSameNameOnce(); } catch (e) { console.warn('[VN指令] 關世界書同名條目失敗:', e); done = true; }
            if (!done && tries < 6) _scheduleCloseSameName(tries + 1);
        }, tries ? 5000 : 6000);
    }

    function _hook() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(_hook, 1000); return; }
        const ev = win.tavern_events;
        if (ev.GENERATION_STARTED) win.eventOn(ev.GENERATION_STARTED, function (type, opts, dryRun) { inject(dryRun); });
        // setExtensionPrompt 是持久值 → 生成一結束就撤，免得被後面別的生成吃進去
        if (ev.GENERATION_ENDED) win.eventOn(ev.GENERATION_ENDED, _clearInjected);
        if (ev.GENERATION_STOPPED) win.eventOn(ev.GENERATION_STOPPED, _clearInjected);
        if (ev.CHAT_CHANGED) win.eventOn(ev.CHAT_CHANGED, _clearInjected);
    }

    // ================================================================
    // 世界題材快捷（VN 設定面板）＋ 手機格式跟著 BGM 走
    // ================================================================
    // Rae 2026-09-16：「開啟應用刪除，直接改成 world快捷，BGM/SFX快捷。還有如果BGM開啟的不是現代或未來就自動關閉VN手機應用格式，不然玩古風會跟著送」
    //   世界門的世界會自動撥（world_rules_injector），但角色卡故事那邊一條都不碰 → 玩古風卡手機格式照送、BGM 也沒地方換。
    //   題材一鍵：BGM 只留那一組、音效增補跟著換。戰鬥不跟題材（現代也可能打架），這裡不碰。
    //   手機格式跟 BGM：沒開「現代一般」→ 手機那組全關，關之前記下原本哪幾條開著；
    //     現代一般開回來 → 照記下的還原（沒記錄、或手機條目已經有開著的就不碰），不會擅自多開彈幕。
    const THEMES = [
        { key: 'modern',  label: '現代',     bgm: 'bgm_modern',  sfx: ['sfx_modern'] },
        { key: 'mystery', label: '偵探',     bgm: 'bgm_mystery', sfx: ['sfx_modern'] },
        { key: 'fantasy', label: '奇幻',     bgm: 'bgm_fantasy', sfx: ['sfx_fantasy'] },
        { key: 'wuxia',   label: '武俠仙俠', bgm: 'bgm_wuxia',   sfx: [] },
        { key: 'horror',  label: '恐怖',     bgm: 'bgm_horror',  sfx: ['sfx_modern'] }
    ];
    const BGM_IDS = THEMES.map(t => t.bgm);
    const SFX_ADDON_IDS = ['sfx_modern', 'sfx_fantasy'];          // 通用那組常駐，不給關
    const PHONE_IDS = ['call_phone', 'call_phone_free', 'danmu'];   // 表情包清單那條拿掉了：表情包改由手機共用的表情包庫送（os_app_memory_inject 的 aurelia_sticker_list）
    const PHONE_SAVED_KEY = 'os_vn_rules_phone_auto_off';          // 自動關手機時記下的原狀 { id: bool }
    const QUICK_IDS = BGM_IDS.concat(SFX_ADDON_IDS);
    const _empty = () => ({ opened: [], closed: [], seen: [] });
    const _merge = (a, b) => ({ opened: a.opened.concat(b.opened), closed: a.closed.concat(b.closed), seen: a.seen.concat(b.seen) });

    function syncPhoneWithBgm() {
        const L = list();
        const modernOn = L.some(e => e.id === 'bgm_modern' && e.enabled);
        const phones = L.filter(e => PHONE_IDS.indexOf(e.id) >= 0);
        if (!modernOn) {
            if (!phones.some(e => e.enabled)) return _empty();
            const snap = {};
            phones.forEach(e => { snap[e.id] = !!e.enabled; });
            try { localStorage.setItem(PHONE_SAVED_KEY, JSON.stringify(snap)); } catch (e) {}
            return apply(e => PHONE_IDS.indexOf(e.id) >= 0 ? false : undefined);
        }
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(PHONE_SAVED_KEY) || 'null'); } catch (e) {}
        if (!saved || typeof saved !== 'object') return _empty();
        try { localStorage.removeItem(PHONE_SAVED_KEY); } catch (e) {}
        if (phones.some(e => e.enabled)) return _empty();          // 別處（例如世界門）已經開過了 → 不蓋回舊狀態
        return apply(e => Object.prototype.hasOwnProperty.call(saved, e.id) ? !!saved[e.id] : undefined);
    }
    function setTheme(key) {
        const t = THEMES.find(x => x.key === key);
        if (!t) return null;
        const r = apply(e => {
            if (BGM_IDS.indexOf(e.id) >= 0) return e.id === t.bgm;
            if (SFX_ADDON_IDS.indexOf(e.id) >= 0) return t.sfx.indexOf(e.id) >= 0;
            return undefined;
        });
        return _merge(r, syncPhoneWithBgm());
    }
    function setQuick(id, on) {
        if (QUICK_IDS.indexOf(id) < 0) return null;
        const r = apply(e => e.id === id ? !!on : undefined);
        return BGM_IDS.indexOf(id) >= 0 ? _merge(r, syncPhoneWithBgm()) : r;
    }
    function quickState() {
        const L = list();
        const on = id => L.some(e => e.id === id && e.enabled);
        const bgmOn = BGM_IDS.filter(on), sfxOn = SFX_ADDON_IDS.filter(on);
        const theme = THEMES.find(t => bgmOn.length === 1 && bgmOn[0] === t.bgm
            && t.sfx.length === sfxOn.length && t.sfx.every(s => sfxOn.indexOf(s) >= 0));
        let autoOff = false;
        try { autoOff = !!localStorage.getItem(PHONE_SAVED_KEY); } catch (e) {}
        return {
            themes: THEMES.map(t => ({ key: t.key, label: t.label })),
            theme: theme ? theme.key : '',
            bgm: EDITABLE.filter(x => x.group === 'bgm').map(x => ({ id: x.id, label: x.label, on: on(x.id) })),
            sfx: EDITABLE.filter(x => SFX_ADDON_IDS.indexOf(x.id) >= 0).map(x => ({ id: x.id, label: x.label, on: on(x.id) })),
            phoneOn: PHONE_IDS.some(on),
            phoneAutoOff: autoOff
        };
    }

    // 🧩 內建格式：寫死在 VN 指令裡、只能開關不能改的幾樣（故事畫面「設定」→「內建格式」）
    //   手機格式有兩版（一般／自由版），跟著「VN 總綱」現在用哪一版開對應那條；關就兩條一起關。
    //   主角狀態＝教模型寫狀態欄的那條；關掉時主角狀態模組也跟著不注入、不顯示（mc_status 讀這條）。
    //   她手動撥手機格式之後，「BGM 沒開現代一般就自動關」記下的原狀作廢，免得下次換 BGM 又被蓋回去。
    const BUILTIN = [
        { key: 'phone',  label: '手機格式', ids: ['call_phone', 'call_phone_free'] },
        { key: 'danmu',  label: '直播彈幕', ids: ['danmu'] },
        { key: 'battle', label: '戰鬥',     ids: ['battle'] },
        { key: 'status', label: '主角狀態', ids: ['status_bar'] }
    ];
    function builtinState() {
        const L = list();
        const on = id => L.some(e => e.id === id && e.enabled);
        return BUILTIN.map(b => ({ key: b.key, label: b.label, on: b.ids.some(on) }));
    }
    function setBuiltin(key, want) {
        const b = BUILTIN.find(x => x.key === key);
        if (!b) return null;
        let target = b.ids;
        if (key === 'phone') {
            try { localStorage.removeItem(PHONE_SAVED_KEY); } catch (e) {}
            if (want) {
                const free = list().some(e => e.id === 'core_format_free' && e.enabled);
                target = [free ? 'call_phone_free' : 'call_phone'];
            }
        }
        const r = apply(e => (want ? (target.indexOf(e.id) >= 0 ? true : (b.ids.indexOf(e.id) >= 0 ? false : undefined))
                                   : (b.ids.indexOf(e.id) >= 0 ? false : undefined)));
        if (key === 'status') { try { (win.OS_MC_STATUS || window.OS_MC_STATUS)?.renderHud?.(); } catch (e) {} }
        return r;
    }
    function isOn(id) { return list().some(e => e.id === id && e.enabled); }

    win.OS_VN_RULES = {
        builtinState: builtinState, setBuiltin: setBuiltin, isOn: isOn,
        list: list, hasAny: hasAny,
        getDepthParts: getDepthParts, getPreText: getPreText, getText: getText,
        apply: apply, setEnabledByName: setEnabledByName,
        getLists: getLists, setList: setList,
        setTheme: setTheme, setQuick: setQuick, quickState: quickState, syncPhoneWithBgm: syncPhoneWithBgm,
        inject: inject,
        get lastInjected() { return _lastInjected; }
    };
    window.OS_VN_RULES = win.OS_VN_RULES;
    _hook();
    _scheduleCloseSameName(0);
    console.log('🪶 [VN指令] 模組就緒（' + _data().length + ' 條內建）');
})();
