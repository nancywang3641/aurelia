// ----------------------------------------------------------------
// [檔案] vn_theme.js
// 路徑：os_phone/vn_story/vn_theme.js
// 職責：VN 劇情面板主題 — 一套主題 = 一組 CSS 變數，套到 #page-game。
//       由劇情 [World|] 驅動自動切換（World→主題 對照表），可手動鎖；每 chatId 記憶。
// 暴露：window.VN_Theme
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[PhoneOS] 載入 VN 主題模組 (vn_theme.js)...');
    const win = window.parent || window;

    // 主題可調的 CSS 變數（其餘 --gold/--font-classic 等 VN 本來就在用，覆蓋即生效）
    const VAR_KEYS = [
        '--gold', '--gold-dark', '--font-classic',
        '--text-color', '--em-color', '--name-color',
        '--vn-dialog-bg', '--vn-dialog-bg-solid', '--vn-name-bg'
    ];

    // 內建主題包
    const BUILTIN = [
        { id: 'gold', name: '⬛ 黑金（預設）', builtin: true, vars: {} },   // 空 = 用 CSS 預設黑金
        { id: 'fantasy', name: '📜 奇幻羊皮紙', builtin: true, vars: {
            '--gold': '#9c7a3c', '--gold-dark': '#6e5526',
            '--text-color': '#3b2f1d', '--em-color': '#7c5a26', '--name-color': '#6e5526',
            '--font-classic': "'Georgia','Noto Serif TC',serif",
            '--vn-dialog-bg': 'linear-gradient(180deg, rgba(243,232,205,0.93) 0%, rgba(228,212,176,0.97) 100%)',
            '--vn-dialog-bg-solid': 'rgba(238,226,198,0.96)',
            '--vn-name-bg': '#efe3c8'
        } },
        { id: 'cyber', name: '🌃 賽博霓虹', builtin: true, vars: {
            '--gold': '#00e5ff', '--gold-dark': '#0094a8',
            '--text-color': '#cfe9ff', '--em-color': '#ff4da6', '--name-color': '#00e5ff',
            '--font-classic': "'Courier New',monospace",
            '--vn-dialog-bg': 'linear-gradient(180deg, rgba(6,10,24,0.9) 0%, rgba(2,4,12,0.96) 100%)',
            '--vn-dialog-bg-solid': 'rgba(4,8,20,0.94)',
            '--vn-name-bg': '#02040c'
        } },
        { id: 'wafu', name: '🎋 和風墨色', builtin: true, vars: {
            '--gold': '#7a6a52', '--gold-dark': '#574a39',
            '--text-color': '#2b2620', '--em-color': '#8a5a3a', '--name-color': '#574a39',
            '--font-classic': "'KaiTi','Noto Serif TC',serif",
            '--vn-dialog-bg': 'linear-gradient(180deg, rgba(245,240,228,0.94) 0%, rgba(232,224,205,0.97) 100%)',
            '--vn-dialog-bg-solid': 'rgba(240,234,218,0.96)',
            '--vn-name-bg': '#efe9da'
        } },
        { id: 'blood', name: '🩸 暗紅哥德', builtin: true, vars: {
            '--gold': '#c0392b', '--gold-dark': '#7d241b',
            '--text-color': '#e8d8d4', '--em-color': '#e06b5b', '--name-color': '#c0392b',
            '--vn-dialog-bg': 'linear-gradient(180deg, rgba(18,6,8,0.9) 0%, rgba(8,2,3,0.96) 100%)',
            '--vn-dialog-bg-solid': 'rgba(14,4,6,0.94)',
            '--vn-name-bg': '#0a0203'
        } }
    ];

    // 預設 World→主題 對照（子字串比對；可被 localStorage 覆蓋）
    const DEFAULT_MAP = {
        '奇幻': 'fantasy', '魔幻': 'fantasy', '西幻': 'fantasy', '魔法': 'fantasy', '仙俠': 'fantasy', '仙侠': 'fantasy',
        '賽博': 'cyber', '赛博': 'cyber', '科幻': 'cyber', '未來': 'cyber', '未来': 'cyber', '机甲': 'cyber', '機甲': 'cyber',
        '和風': 'wafu', '和风': 'wafu', '日式': 'wafu', '武俠': 'wafu', '武侠': 'wafu', '古代': 'wafu', '古風': 'wafu', '古风': 'wafu',
        '恐怖': 'blood', '驚悚': 'blood', '惊悚': 'blood', '吸血': 'blood', '哥德': 'blood'
    };

    const LS_CUSTOM = 'vn_themes_custom';
    const LS_MAP = 'vn_world_theme_map';
    const LS_BYCHAT = 'vn_theme_by_chat';

    function _lsGet(k, def) { try { return JSON.parse(localStorage.getItem(k) || '') ?? def; } catch (e) { return def; } }
    function _lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    function _loadCustom() { const a = _lsGet(LS_CUSTOM, []); return Array.isArray(a) ? a : []; }
    function _root() { return (win.document || document).getElementById('page-game'); }

    const VN_Theme = {
        VAR_KEYS,
        builtin: () => BUILTIN.slice(),
        getAll() { return BUILTIN.concat(_loadCustom()); },
        byId(id) { return this.getAll().find(t => t.id === id) || null; },

        // 套用主題（傳 id 或 theme 物件）：先清掉所有覆蓋 → 再塞該主題的變數（黑金=空=回預設）
        apply(theme) {
            const el = _root(); if (!el) return;
            const t = (typeof theme === 'string') ? this.byId(theme) : theme;
            VAR_KEYS.forEach(k => el.style.removeProperty(k));
            if (t && t.vars) Object.keys(t.vars).forEach(k => el.style.setProperty(k, t.vars[k]));
            el.dataset.vnTheme = (t && t.id) || 'gold';
        },

        // ── World→主題 對照表 ──
        getMap() { const m = _lsGet(LS_MAP, null); return (m && typeof m === 'object') ? m : { ...DEFAULT_MAP }; },
        setMap(m) { _lsSet(LS_MAP, m || {}); },

        // ── 手動鎖（每 chatId）──
        _byChat() { const m = _lsGet(LS_BYCHAT, {}); return (m && typeof m === 'object') ? m : {}; },
        getManual(chatId) { return this._byChat()[chatId] || 'auto'; },
        setManual(chatId, themeId) {
            const m = this._byChat();
            if (!themeId || themeId === 'auto') delete m[chatId]; else m[chatId] = themeId;
            _lsSet(LS_BYCHAT, m);
        },

        // ── 解析：手動鎖 > [World|] 對照 > 預設黑金 ──
        resolveForWorld(chatId, worldKeyword) {
            const manual = this.getManual(chatId);
            if (manual && manual !== 'auto' && this.byId(manual)) return manual;
            if (worldKeyword) {
                const map = this.getMap();
                const wk = String(worldKeyword);
                // 先精確、再子字串
                if (map[wk] && this.byId(map[wk])) return map[wk];
                for (const key of Object.keys(map)) {
                    if (key && wk.indexOf(key) >= 0 && this.byId(map[key])) return map[key];
                }
            }
            return 'gold';
        },
        resolveAndApply(chatId, worldKeyword) {
            const id = this.resolveForWorld(chatId, worldKeyword);
            this.apply(id);
            return id;
        },

        // ── 自訂主題 CRUD（localStorage）──
        saveCustom(theme) {
            if (!theme || !theme.id) return;
            const list = _loadCustom();
            const i = list.findIndex(t => t.id === theme.id);
            const clean = { id: theme.id, name: theme.name || theme.id, vars: theme.vars || {} };
            if (i >= 0) list[i] = clean; else list.push(clean);
            _lsSet(LS_CUSTOM, list);
        },
        deleteCustom(id) { _lsSet(LS_CUSTOM, _loadCustom().filter(t => t.id !== id)); }
    };

    win.VN_Theme = VN_Theme;
    window.VN_Theme = VN_Theme;
})();
