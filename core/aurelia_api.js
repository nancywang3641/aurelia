// ============================================================
// Aurelia API — 統一的酒館資料入口（備用版插座）
// ------------------------------------------------------------
// 職責：所有「跟酒館要資料」的方法集中在這一個檔，不散落各處。
//   • 酒館助手(TavernHelper)在    → 用助手（享受它幫你擋酒館改版）。
//   • 助手不在 / 被關掉 / 爆掉     → 自動用酒館「原生」getContext() 頂上，功能照常。
//
// 用法：
//   • 未來新程式 → 直接呼叫 window.AureliaAPI.getChatMessages(...) 等。
//   • 舊的 28 個檔用 window.TavernHelper.xxx → 照常相容（助手不在時自動指向這裡）。
//
// 要新增「助手某方法的原生備用」時，只改這一個檔的 native 物件即可。
// ============================================================
(function () {
    'use strict';
    if (window.AureliaAPI) return; // 單例

    // —— 小工具：拿酒館原生的 chat 陣列（助手不在時的資料來源）——
    const _chatArr = () => {
        const ctx = (window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext() : null;
        return (ctx && ctx.chat) || window.chat || [];
    };
    const _ctx = () => (window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext() : null;

    // ===== 世界書轉換工具：酒館原生條目形狀 ↔ TavernHelper 形狀 =====
    //   只映射實際用到的欄位；寫入直接接 getContext().loadWorldInfo / saveWorldInfo。
    const _POS_ST2TH = { 0: 'before_character_definition', 1: 'after_character_definition', 2: 'before_author_note', 3: 'after_author_note', 4: 'at_depth_as_system' };
    const _POS_TH2ST = { before_character_definition: 0, after_character_definition: 1, before_example_messages: 0, after_example_messages: 1, before_author_note: 2, after_author_note: 3, at_depth_as_system: 4, at_depth_as_assistant: 4, at_depth_as_user: 4 };
    const _loadWI = async (name) => { const c = _ctx(); return (c && typeof c.loadWorldInfo === 'function') ? await c.loadWorldInfo(name) : null; };
    const _saveWI = async (name, data) => { const c = _ctx(); if (c && typeof c.saveWorldInfo === 'function') await c.saveWorldInfo(name, data, true); };
    const _entriesArr = (data) => (data && data.entries) ? Object.keys(data.entries).map((k) => data.entries[k]) : [];
    // 酒館原生條目 → TavernHelper LorebookEntry（讀取用；同時保留原生 .key/.disable 相容舊碼）
    const _st2th = (e) => ({
        uid: e.uid, display_index: e.displayIndex, comment: e.comment || '', enabled: !e.disable,
        type: e.constant ? 'constant' : (e.vectorized ? 'vectorized' : 'selective'),
        position: (_POS_ST2TH[e.position] != null ? _POS_ST2TH[e.position] : 'before_character_definition'),
        depth: (e.depth == null ? null : e.depth), order: e.order, probability: e.probability,
        keys: Array.isArray(e.key) ? e.key.slice() : [], content: e.content || ''
    });
    // TavernHelper partial → 套到原生條目（寫入用；TH 名與原生名都接）
    const _applyTh2St = (e, p) => {
        if (!p) return e;
        if (p.content !== undefined) e.content = p.content;
        if (p.comment !== undefined) e.comment = p.comment;
        if (p.key !== undefined) e.key = Array.isArray(p.key) ? p.key : [p.key];
        if (p.keys !== undefined) e.key = Array.isArray(p.keys) ? p.keys : [p.keys];   // keys 優先，別讓帶著的舊 key 蓋掉
        if (p.disable !== undefined) e.disable = !!p.disable;
        if (p.enabled !== undefined) e.disable = !p.enabled;                            // enabled 優先
        if (p.order !== undefined) e.order = p.order;
        if (p.position !== undefined) e.position = (_POS_TH2ST[p.position] != null ? _POS_TH2ST[p.position] : (typeof p.position === 'number' ? p.position : e.position));
        if (p.type !== undefined) { e.constant = p.type === 'constant'; e.vectorized = p.type === 'vectorized'; e.selective = p.type === 'selective'; }
        if (p.constant !== undefined) e.constant = !!p.constant;
        if (p.selective !== undefined) e.selective = !!p.selective;
        return e;
    };
    const _newStEntry = (uid) => ({
        uid: uid, key: [], keysecondary: [], comment: '', content: '', constant: false, vectorized: false,
        selective: true, selectiveLogic: 0, addMemo: true, order: 100, position: 0, disable: false,
        excludeRecursion: false, preventRecursion: false, delayUntilRecursion: false, probability: 100, useProbability: true,
        depth: 4, group: '', groupOverride: false, groupWeight: 100, scanDepth: null, caseSensitive: null,
        matchWholeWords: null, useGroupScoring: null, automationId: '', role: 0, sticky: 0, cooldown: 0, delay: 0, displayIndex: uid
    });
    const _nextUid = (data) => { let m = -1; _entriesArr(data).forEach((e) => { if (typeof e.uid === 'number' && e.uid > m) m = e.uid; }); return m + 1; };

    // 酒館原生正則 → TavernHelper TavernRegex（讀取用；VN「彈窗抓正則」靠這拿卡片）
    const _st2thRegex = (r) => {
        const p = Array.isArray(r.placement) ? r.placement : [];
        return {
            id: r.id, script_name: r.scriptName, enabled: !r.disabled,
            find_regex: r.findRegex, replace_string: r.replaceString, trim_strings: r.trimStrings,
            source: { user_input: p.indexOf(1) >= 0, ai_output: p.indexOf(2) >= 0, slash_command: p.indexOf(3) >= 0, world_info: p.indexOf(5) >= 0 },
            destination: { display: !r.promptOnly, prompt: !r.markdownOnly },
            run_on_edit: r.runOnEdit, min_depth: r.minDepth, max_depth: r.maxDepth
        };
    };

    // =========================================================
    // 原生備用實作（助手不在時，用酒館原生 getContext 自己組）
    //   ↓↓↓ 以後要補更多方法的原生退路，就加在這個 native 物件裡 ↓↓↓
    // =========================================================
    const native = {
        // 讀訊息：形狀對齊 TavernHelper 的 ChatMessage（同步回陣列）
        getChatMessages: function (range, opts) {
            let arr = _chatArr().map((m, i) => ({
                message_id: i,
                name: m.name,
                role: m.is_user ? 'user' : (m.is_system ? 'system' : 'assistant'),
                is_hidden: !!m.is_system,
                message: m.mes || '',
                data: m.variables || {},
                extra: m.extra || {}
            }));
            // 解析 range：數字 / "A-B" / 負數(從尾算)
            if (range !== undefined && range !== null && range !== '') {
                const last = arr.length - 1;
                const norm = (n) => { n = parseInt(n, 10); return isNaN(n) ? null : (n < 0 ? last + 1 + n : n); };
                const mm = String(range).match(/^(-?\d+)\s*-\s*(-?\d+)$/);
                if (mm) { let a = norm(mm[1]), b = norm(mm[2]); if (a !== null && b !== null) { if (a > b) { const t = a; a = b; b = t; } arr = arr.slice(a, b + 1); } }
                else { const one = norm(String(range)); if (one !== null) arr = arr[one] ? [arr[one]] : []; }
            }
            // opts.role / hide_state 篩選
            if (opts && opts.role && opts.role !== 'all') arr = arr.filter(x => x.role === opts.role);
            if (opts && opts.hide_state === 'unhidden') arr = arr.filter(x => !x.is_hidden);
            else if (opts && opts.hide_state === 'hidden') arr = arr.filter(x => x.is_hidden);
            return arr;
        },
        getLastMessageId: function () { return _chatArr().length - 1; },
        // ===== 世界書（原生備用，直接接 getContext().loadWorldInfo / saveWorldInfo）=====
        // ⚠️ 寫入(set/create/update/delete)會動到真實世界書檔，務必先拿「備用世界書」測，別拿真 lore。
        getLorebookEntries: async function (lorebook) { return _entriesArr(await _loadWI(lorebook)).map(_st2th); },
        getWorldbook: async function (worldbook_name) { return _entriesArr(await _loadWI(worldbook_name)).map(_st2th); },
        getCurrentCharPrimaryLorebook: function () {
            try { const c = _ctx(); const ch = c && c.characters && c.characters[c.characterId]; return (ch && ch.data && ch.data.extensions && ch.data.extensions.world) || null; }
            catch (e) { return null; }
        },
        getCharWorldbookNames: function (character_name) {
            try { const c = _ctx(); const ch = c && c.characters && c.characters[c.characterId]; return { primary: (ch && ch.data && ch.data.extensions && ch.data.extensions.world) || null, additional: [] }; }
            catch (e) { return { primary: null, additional: [] }; }
        },
        setLorebookEntries: async function (lorebook, entries) {
            const data = await _loadWI(lorebook); if (!data || !data.entries) return [];
            (entries || []).forEach((p) => { if (p && p.uid != null && data.entries[p.uid]) _applyTh2St(data.entries[p.uid], p); });
            await _saveWI(lorebook, data); return _entriesArr(data).map(_st2th);
        },
        updateLorebookEntriesWith: async function (lorebook, updater) {
            const data = await _loadWI(lorebook); if (!data || !data.entries) return [];
            let out = updater(_entriesArr(data).map(_st2th)); if (out && typeof out.then === 'function') out = await out;
            (out || []).forEach((p) => { if (p && p.uid != null && data.entries[p.uid]) _applyTh2St(data.entries[p.uid], p); });
            await _saveWI(lorebook, data); return _entriesArr(data).map(_st2th);
        },
        updateWorldbookWith: async function (worldbook_name, updater) { return native.updateLorebookEntriesWith(worldbook_name, updater); },
        createLorebookEntries: async function (lorebook, entries) {
            const data = await _loadWI(lorebook); if (!data) return { entries: [], new_uids: [] };
            if (!data.entries) data.entries = {};
            const new_uids = [];
            (entries || []).forEach((p) => { const uid = _nextUid(data); data.entries[uid] = _applyTh2St(_newStEntry(uid), p); new_uids.push(uid); });
            await _saveWI(lorebook, data); return { entries: _entriesArr(data).map(_st2th), new_uids: new_uids };
        },
        deleteLorebookEntries: async function (lorebook, uids) {
            const data = await _loadWI(lorebook); if (!data || !data.entries) return { entries: [], delete_occurred: false };
            let occurred = false;
            (uids || []).forEach((u) => { if (data.entries[u]) { delete data.entries[u]; occurred = true; } });
            if (occurred) await _saveWI(lorebook, data); return { entries: _entriesArr(data).map(_st2th), delete_occurred: occurred };
        },
        replaceLorebookEntries: async function (lorebook, entries) {
            const data = await _loadWI(lorebook); if (!data) return;
            const map = {}; let auto = 0;
            (entries || []).forEach((p) => {
                let uid = (p && p.uid != null) ? p.uid : auto++;
                while (map[uid] != null) uid = auto++;
                const base = (data.entries && data.entries[uid]) ? data.entries[uid] : _newStEntry(uid);
                base.uid = uid; map[uid] = _applyTh2St(base, p);
            });
            data.entries = map; await _saveWI(lorebook, data);
        },
        createWorldbookEntries: function (worldbook_name, entries) { return native.createLorebookEntries(worldbook_name, entries); },

        // ===== 助手不在時的「優雅降級」：回安全預設 + 提醒，不讓 handler 崩；要正式原生化再個別補 =====
        // 轉發/新增訊息到酒館對話框（原生：push 進 chat + addOneMessage 渲染 + saveChat）
        //   兼容 {message} 與 {content} 兩種寫法；role: user/system/assistant。
        createChatMessages: async function (chat_messages, opt) {
            const ctx = _ctx(); if (!ctx || !Array.isArray(ctx.chat)) return;
            opt = opt || {};
            const ib = (opt.insert_before !== undefined) ? opt.insert_before : opt.insert_at;
            const atEnd = (ib === undefined || ib === 'end' || typeof ib !== 'number');
            const stamp = (typeof window.getMessageTimeStamp === 'function') ? window.getMessageTimeStamp() : new Date().toISOString();
            const built = (chat_messages || []).map((m) => {
                const text = (m.message != null) ? m.message : (m.content != null ? m.content : '');
                const isUser = m.role === 'user', isSystem = m.role === 'system';
                return {
                    name: m.name || (isUser ? (ctx.name1 || 'You') : (isSystem ? 'System' : (ctx.name2 || 'Assistant'))),
                    is_user: isUser, is_system: isSystem, mes: String(text), send_date: stamp, extra: m.extra || {}
                };
            });
            if (atEnd) {
                for (const msg of built) { ctx.chat.push(msg); if (opt.refresh !== 'none' && typeof ctx.addOneMessage === 'function') ctx.addOneMessage(msg); }
            } else {
                ctx.chat.splice(ib, 0, ...built);
                if (opt.refresh !== 'none' && typeof ctx.reloadCurrentChat === 'function') await ctx.reloadCurrentChat();
            }
            if (typeof ctx.saveChat === 'function') await ctx.saveChat();
        },
        setChatMessages: async function (chat_messages, opt) {
            const ctx = _ctx(); if (!ctx || !Array.isArray(ctx.chat)) return;
            opt = opt || {}; let touched = false;
            (chat_messages || []).forEach((p) => {
                const id = p.message_id; if (id == null || !ctx.chat[id]) return;
                const m = ctx.chat[id];
                if (p.message !== undefined) m.mes = p.message;
                if (p.mes !== undefined) m.mes = p.mes;
                if (p.data !== undefined) m.variables = p.data;
                if (p.extra !== undefined) m.extra = p.extra;
                touched = true;
                if (opt.refresh !== 'none' && typeof ctx.updateMessageBlock === 'function') { try { ctx.updateMessageBlock(id, m); } catch (e) {} }
            });
            if (touched && typeof ctx.saveChat === 'function') await ctx.saveChat();
        },
        getTavernRegexes: function (option) {
            const ctx = _ctx(); if (!ctx) return [];
            option = option || {}; let raw = [];
            try {
                if (option.type === 'character') {
                    const ch = ctx.characters && ctx.characters[ctx.characterId];
                    raw = (ch && ch.data && ch.data.extensions && ch.data.extensions.regex_scripts) || [];
                } else if (option.type === 'preset') {
                    const pm = ctx.getPresetManager && ctx.getPresetManager();
                    raw = (pm && typeof pm.readPresetExtensionField === 'function') ? (pm.readPresetExtensionField({ path: 'regex_scripts' }) || []) : [];
                } else {
                    raw = (ctx.extensionSettings && ctx.extensionSettings.regex) || [];
                }
            } catch (e) { raw = []; }
            return (raw || []).map(_st2thRegex);
        },
        updateTavernRegexesWith: async function () { console.warn('[AureliaAPI] 助手不在：updateTavernRegexesWith 已略過'); return []; },
        generateRaw: async function () { console.warn('[AureliaAPI] 助手不在：generateRaw 無原生備用，回空字串'); return ''; },
        triggerSlash: async function () { console.warn('[AureliaAPI] 助手不在：triggerSlash 無原生備用，已略過'); return ''; },
        injectPrompts: function () { console.warn('[AureliaAPI] 助手不在：injectPrompts 已略過'); }
    };

    // =========================================================
    // 對外統一入口：每個方法「助手在用助手、不在走原生」（呼叫時即時判斷）
    // =========================================================
    const AureliaAPI = {};
    Object.keys(native).forEach(function (k) {
        AureliaAPI[k] = function () {
            const th = window.TavernHelper;
            // th 是「真助手」(不是我們自己) 且有這方法 → 用助手；否則走原生
            if (th && th !== AureliaAPI && typeof th[k] === 'function') return th[k].apply(th, arguments);
            return native[k].apply(native, arguments);
        };
    });
    window.AureliaAPI = AureliaAPI;

    // =========================================================
    // 插座：保住舊的 window.TavernHelper.xxx 呼叫（28 個檔不用改）
    // =========================================================
    const realTH = window.TavernHelper;
    if (realTH && typeof realTH.getChatMessages === 'function') {
        // 真助手在 → 不蓋它，只補它「沒有」的方法
        ['getLorebookEntries', 'setLorebookEntries'].forEach(function (k) {
            if (typeof realTH[k] !== 'function') realTH[k] = native[k];
        });
    } else {
        // 助手不在 → 讓舊的 window.TavernHelper 呼叫走 AureliaAPI(= 原生備用)
        window.TavernHelper = AureliaAPI;
    }
    window.getLorebookEntries = function (n) { return (window.TavernHelper.getLorebookEntries || native.getLorebookEntries)(n); };
    if (window.top && window.top !== window && !window.top.TavernHelper) window.top.TavernHelper = window.TavernHelper;

    console.log('[AureliaAPI] ✅ 統一資料入口就緒（助手在用助手、不在走原生備用）');
})();
