// =================================================================
// [檔案] vn_fx.js — VN 畫面特效引擎（積木 + 配方播放器 + 內建特效包）
// -----------------------------------------------------------------
// 設計：特效 = JSON「配方」（積木組合 + 參數），不是自由 JS——
//   引擎提供調校好效能的固定積木（粒子/閃色/震動/光軌/邊緣滲色/罩色），
//   創作室特效工坊的 AI 只負責把描述翻成配方，絕不會生出卡死的東西。
// 觸發：正文 #fx-id# 標記（同 SFX 管線，vn_core._extractInlineSFX 路由過來）。
// 兩種性質：once 瞬發（播完自散）／loop 持續（天氣類，掛到 [Bg] 換場自停）。
// 效能鐵則：單一 canvas、粒子總數封頂、document.hidden 或面板不在畫面就暫停。
// =================================================================
(function () {
    'use strict';
    if (window.OS_FX) return;   // 單實例

    const MAX_PARTICLES = 500;        // 全域粒子封頂
    const MAX_PER_EMITTER = 300;      // 單積木粒子封頂
    const ONCE_MAX_DUR = 8000;        // 瞬發特效總長封頂(ms)
    const PREVIEW_LOOP_MS = 4000;     // 試播持續型時自動停的時長

    // ── 內建特效包（配方格式與創作室生成的完全相同）──
    const BUILTINS = [
        { fxId: 'fx-snow', name: '下雪', desc: '雪花緩緩飄落', kind: 'loop', steps: [
            { block: 'particles', preset: 'snow', count: 140, size: 3, speed: 45, color: '#ffffff' },
        ]},
        { fxId: 'fx-rain', name: '下雨', desc: '雨絲落下', kind: 'loop', steps: [
            { block: 'particles', preset: 'rain', count: 160, size: 11, speed: 850, color: 'rgba(180,200,230,0.55)' },
        ]},
        { fxId: 'fx-petals', name: '花瓣飄落', desc: '粉色花瓣隨風飄落', kind: 'loop', steps: [
            { block: 'particles', preset: 'petal', count: 40, size: 6, speed: 55, color: '#ffc0d0' },
        ]},
        { fxId: 'fx-blood', name: '滴血閃紅', desc: '受傷／重創：螢幕邊緣滲血、血珠下滑、閃紅兩下', kind: 'once', steps: [
            { block: 'flash', color: '#c00000', times: 2, at: 0, dur: 520 },
            { block: 'edge', color: '#8a0000', at: 0, dur: 2600 },
            { block: 'particles', preset: 'drip', count: 12, size: 5, speed: 60, color: 'rgba(150,0,0,0.85)', at: 150, dur: 2200 },
            { block: 'shake', strength: 6, at: 0, dur: 420 },
        ]},
        { fxId: 'fx-thunder', name: '雷擊', desc: '鋸齒閃電劈下＋白閃＋震動（雷劈/驚嚇/衝擊性轉折）', kind: 'once', steps: [
            { block: 'bolt', color: '#bfe3ff', width: 3, at: 0, dur: 620 },
            { block: 'flash', color: '#eaf6ff', times: 2, at: 0, dur: 480 },
            { block: 'shake', strength: 5, at: 100, dur: 380 },
        ]},
        { fxId: 'fx-slash', name: '劍光', desc: '一道斜切光軌劃過畫面＋震動（斬擊/攻擊）', kind: 'once', steps: [
            { block: 'streak', color: '#e8f4ff', angle: 115, width: 3, at: 0, dur: 320 },
            { block: 'flash', color: '#ffffff', times: 1, at: 60, dur: 200 },
            { block: 'shake', strength: 8, at: 120, dur: 320 },
        ]},
        { fxId: 'fx-shake', name: '震動', desc: '畫面劇烈搖晃（撞擊/爆炸/地震）', kind: 'once', steps: [
            { block: 'shake', strength: 10, at: 0, dur: 600 },
        ]},
        { fxId: 'fx-flash-white', name: '白閃', desc: '白光一閃（爆炸/閃回/靈光）', kind: 'once', steps: [
            { block: 'flash', color: '#ffffff', times: 1, at: 0, dur: 420 },
        ]},
        { fxId: 'fx-anger', name: '怒氣', desc: '漫畫怒氣💢符號彈出（生氣/暴怒/青筋）', kind: 'once', steps: [
            { block: 'svg', anim: 'pop', pos: 'top', size: 22, at: 0, dur: 1400,
              svg: '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#e0342f" stroke-width="13" stroke-linecap="round"><path d="M52 14 C42 34 42 46 50 58"/><path d="M68 106 C78 86 78 74 70 62"/><path d="M14 68 C34 78 46 78 58 70"/><path d="M106 52 C86 42 74 42 62 50"/></svg>' },
        ]},
        { fxId: 'fx-speedlines', name: '集中線', desc: '漫畫集中線框住畫面（緊張/衝刺/關鍵一擊）', kind: 'once', steps: [
            { block: 'svg', anim: 'pulse', pos: 'full', size: 100, at: 0, dur: 1800,
              svg: '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" stroke="#15151a" stroke-linecap="round"><g stroke-width="7" opacity="0.85"><line x1="195" y1="100" x2="155" y2="100"/><line x1="167.2" y1="167.2" x2="138.9" y2="138.9"/><line x1="100" y1="195" x2="100" y2="155"/><line x1="32.8" y1="167.2" x2="61.1" y2="138.9"/><line x1="5" y1="100" x2="45" y2="100"/><line x1="32.8" y1="32.8" x2="61.1" y2="61.1"/><line x1="100" y1="5" x2="100" y2="45"/><line x1="167.2" y1="32.8" x2="138.9" y2="61.1"/></g><g stroke-width="4" opacity="0.55"><line x1="187.8" y1="136.4" x2="150.8" y2="121.1"/><line x1="136.4" y1="187.8" x2="121.1" y2="150.8"/><line x1="63.6" y1="187.8" x2="78.9" y2="150.8"/><line x1="12.2" y1="136.4" x2="49.2" y2="121.1"/><line x1="12.2" y1="63.6" x2="49.2" y2="78.9"/><line x1="63.6" y1="12.2" x2="78.9" y2="49.2"/><line x1="136.4" y1="12.2" x2="121.1" y2="49.2"/><line x1="187.8" y1="63.6" x2="150.8" y2="78.9"/></g></svg>' },
        ]},
        { fxId: 'fx-heart', name: '愛心', desc: '粉色愛心啵一下冒出飄走（心動/曖昧/戀愛）', kind: 'once', steps: [
            { block: 'svg', anim: 'rise', pos: 'center', size: 18, at: 0, dur: 1600,
              svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 84 C20 60 8 38 22 24 C34 12 50 20 50 32 C50 20 66 12 78 24 C92 38 80 60 50 84 Z" fill="#ff6b9a" opacity="0.95"/><path d="M30 30 C26 34 26 40 30 44" stroke="#ffd3e2" stroke-width="5" stroke-linecap="round" fill="none"/></svg>' },
        ]},
    ];

    const VALID_BLOCKS = ['particles', 'flash', 'shake', 'edge', 'streak', 'tint', 'bolt', 'svg', 'code'];
    const VALID_PRESETS = ['snow', 'rain', 'drip', 'petal', 'ember', 'burst', 'bubble', 'sparkle'];
    const SVG_ANIMS = ['pop', 'drop', 'rise', 'pulse', 'burst'];
    const SVG_POS = ['center', 'top', 'bottom', 'full'];

    function clamp(v, lo, hi) { const n = Number(v); return isNaN(n) ? lo : Math.min(hi, Math.max(lo, n)); }

    // SVG 消毒：只留純圖形——剝 script/foreignObject/外部參照/事件屬性；必須帶 viewBox。回 '' = 不合格
    function sanitizeSvg(raw) {
        try {
            const s = String(raw || '').trim();
            if (!s || s.length > 20000 || !/^<svg[\s>]/i.test(s)) return '';
            const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
            if (doc.querySelector('parsererror')) return '';
            const root = doc.documentElement;
            if (!root || root.tagName.toLowerCase() !== 'svg') return '';
            if (!root.getAttribute('viewBox')) return '';
            doc.querySelectorAll('script, foreignObject, iframe, embed, object, image, video, audio, use, a').forEach(n => n.remove());
            const walk = (el) => {
                for (const attr of Array.from(el.attributes || [])) {
                    const n = attr.name.toLowerCase(), v = String(attr.value || '');
                    if (n.indexOf('on') === 0 || n === 'href' || n === 'xlink:href'
                        || /javascript:|data:text/i.test(v)
                        || (n === 'style' && /url\s*\(|expression/i.test(v))) el.removeAttribute(attr.name);
                }
                for (const c of Array.from(el.children || [])) walk(c);
            };
            walk(root);
            root.removeAttribute('width'); root.removeAttribute('height');   // 尺寸交給引擎控
            return new XMLSerializer().serializeToString(root);
        } catch (e) { return ''; }
    }

    // 配方消毒：只認白名單積木、危險參數封頂；回 null = 整份不可用
    function normalizeRecipe(r) {
        if (!r || typeof r !== 'object') return null;
        const fxId = String(r.fxId || '').trim().toLowerCase();
        if (!/^fx-[a-z0-9_-]{1,40}$/.test(fxId)) return null;
        const kind = r.kind === 'loop' ? 'loop' : 'once';
        const steps = [];
        for (const s of (Array.isArray(r.steps) ? r.steps : [])) {
            if (!s || VALID_BLOCKS.indexOf(s.block) === -1) continue;
            const at  = kind === 'once' ? clamp(s.at || 0, 0, ONCE_MAX_DUR) : 0;
            const dur = kind === 'once' ? clamp(s.dur || 800, 60, ONCE_MAX_DUR) : Infinity;
            const st = { block: s.block, at: at, dur: dur, color: typeof s.color === 'string' ? s.color.slice(0, 40) : '' };
            if (s.block === 'particles') {
                if (VALID_PRESETS.indexOf(s.preset) === -1) continue;
                st.preset = s.preset;
                st.count  = clamp(s.count || 60, 1, MAX_PER_EMITTER);
                st.size   = clamp(s.size || 4, 1, 40);
                st.speed  = clamp(s.speed || 60, 5, 1200);
            } else if (s.block === 'flash') { st.times = clamp(s.times || 1, 1, 6); }
            else if (s.block === 'shake')   { st.strength = clamp(s.strength || 6, 1, 24); if (kind === 'loop') continue; }
            else if (s.block === 'streak')  { st.angle = clamp(s.angle === undefined ? 115 : s.angle, 0, 360); st.width = clamp(s.width || 3, 1, 12); if (kind === 'loop') continue; }
            else if (s.block === 'bolt')    { st.width = clamp(s.width || 3, 1, 12); if (kind === 'loop') continue; }
            else if (s.block === 'svg') {
                if (kind === 'loop') continue;
                st.svg = sanitizeSvg(s.svg);
                if (!st.svg) continue;
                st.anim = SVG_ANIMS.indexOf(s.anim) !== -1 ? s.anim : 'pop';
                st.pos  = SVG_POS.indexOf(s.pos) !== -1 ? s.pos : 'center';
                st.size = clamp(s.size || 30, 8, 100);
            }
            else if (s.block === 'code') {
                // 自訂繪製：AI 寫每幀 canvas 繪製碼（積木做不到的效果用這條路，once/loop 都可）。
                // 引擎只當播放器：生命週期/暫停/清理歸引擎，程式碼壞了停用該特效、不拖死舞台。
                const js = String(s.js || '').trim();
                if (!js || js.length > 20000) continue;
                try { new Function('ctx', 'p', 'dt', 't', 'w', 'h', 'state', js); } catch (e) { console.warn('[OS_FX] 自訂特效語法錯誤，剔除:', e && e.message); continue; }
                st.js = js;
            }
            else if (s.block === 'tint')    { st.alpha = clamp(s.alpha || 0.18, 0.02, 0.45); }
            steps.push(st);
        }
        if (!steps.length) return null;
        return { fxId: fxId, name: String(r.name || fxId).slice(0, 30), desc: String(r.desc || '').slice(0, 60), kind: kind, steps: steps };
    }

    // ── 引擎本體 ──
    const OS_FX = {
        _saved: null,          // 創作室已存配方快取（null = 未載入）
        _overlay: null, _canvas: null, _ctx: null,
        _stageEl: null,        // 震動目標（overlay 的父容器）
        _raf: 0, _lastT: 0,
        _fx: [],               // 進行中特效實例 [{recipe, t0, loop, ending, endAt}]
        _particles: [],        // 全域粒子池 [{em, x, y, vx, vy, size, rot, vr, life, maxLife, phase}]
        _emitters: [],         // 進行中發射器 [{fx, step, t0, stopped, burstDone}]
        _shakeOn: false,

        // ── 對外 API ──
        // 播放：id 字串（查內建+已存）或直接給配方物件（創作室試播）。container 可選（試播用）。
        play: function (idOrRecipe, container) {
            try {
                const recipe = (typeof idOrRecipe === 'string') ? this._resolve(idOrRecipe) : normalizeRecipe(idOrRecipe);
                if (!recipe) { if (typeof idOrRecipe === 'string') console.log('[OS_FX] 未知特效ID，略過:', idOrRecipe); return false; }
                const host = container || document.getElementById('page-game');
                if (!host || !host.isConnected) return false;
                this._mount(host);
                if (recipe.kind === 'loop') this._stopLoops(true);   // 同時只掛一個持續型（新天氣頂掉舊天氣）
                const inst = { recipe: recipe, t0: performance.now(), loop: recipe.kind === 'loop', ending: false, endAt: 0, state: {} };
                if (!inst.loop) {
                    let total = 0;
                    for (const s of recipe.steps) total = Math.max(total, s.at + s.dur);
                    inst.endAt = inst.t0 + Math.min(total, ONCE_MAX_DUR);
                }
                this._fx.push(inst);
                for (const s of recipe.steps) {
                    if (s.block === 'particles') this._emitters.push({ fx: inst, step: s, t0: inst.t0 + s.at, stopped: false, burstDone: false });
                }
                this._start();
                return true;
            } catch (e) { console.warn('[OS_FX] play 失敗:', e); return false; }
        },

        // 停掉持續型（天氣）；瞬發不受影響
        stopWeather: function () { this._stopLoops(false); },
        // [Bg] 換場：天氣跟著場景走 → 停
        sceneChange: function () { this._stopLoops(false); },

        stopAll: function () {
            for (const inst of this._fx) this._cleanupInst(inst);
            this._fx = []; this._emitters = []; this._particles = [];
            this._clearShake();
            if (this._ctx && this._canvas) this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
            try { if (this._overlay) this._overlay.querySelectorAll('.vn-fx-svg').forEach(n => n.remove()); } catch (e) {}
        },

        // 創作室試播：在指定容器上播一次；持續型自動 4 秒後停
        preview: function (recipe, container) {
            this.stopAll();
            const ok = this.play(recipe, container);
            if (ok) {
                const norm = (typeof recipe === 'string') ? this._resolve(recipe) : normalizeRecipe(recipe);
                if (norm && norm.kind === 'loop') setTimeout(() => { this._stopLoops(false); }, PREVIEW_LOOP_MS);
            }
            return ok;
        },

        // 配方驗證（給創作室存檔前用）
        validate: function (recipe) { return normalizeRecipe(recipe); },

        // 重新載入創作室已存特效（存檔/刪除後呼叫）
        reloadSaved: async function () {
            try {
                const db = window.OS_DB || (window.parent && window.parent.OS_DB);
                if (!db || !db.getAllUITemplates) { this._saved = []; return; }
                const all = await db.getAllUITemplates();
                this._saved = (all || []).filter(t => t && t.isFX && t.fxRecipe)
                    .map(t => normalizeRecipe(t.fxRecipe)).filter(Boolean);
            } catch (e) { console.warn('[OS_FX] 載入已存特效失敗:', e); if (!this._saved) this._saved = []; }
        },

        // ── 開關 / 群組（localStorage、內建與自製統一按 fxId 記；關掉＝不注入白名單、標記來了也不播）──
        _disabled: function () {
            try { return new Set(JSON.parse(localStorage.getItem('os_fx_disabled') || '[]')); } catch (e) { return new Set(); }
        },
        isEnabled: function (id) { return !this._disabled().has(String(id || '').trim().toLowerCase()); },
        setEnabled: function (id, on) {
            try {
                const s = this._disabled();
                const key = String(id || '').trim().toLowerCase();
                if (on) s.delete(key); else s.add(key);
                localStorage.setItem('os_fx_disabled', JSON.stringify(Array.from(s)));
            } catch (e) {}
        },
        _groups: function () { try { return JSON.parse(localStorage.getItem('os_fx_groups') || '{}') || {}; } catch (e) { return {}; } },
        getGroup: function (id) { return this._groups()[String(id || '').trim().toLowerCase()] || ''; },
        setGroup: function (id, group) {
            try {
                const g = this._groups();
                const key = String(id || '').trim().toLowerCase();
                if (group && String(group).trim()) g[key] = String(group).trim().slice(0, 12); else delete g[key];
                localStorage.setItem('os_fx_groups', JSON.stringify(g));
            } catch (e) {}
        },

        // 全清單（內建 + 已存、含開關/群組標註），給工坊瀏覽用
        listAll: function () {
            const saved = this._saved || [];
            const ids = new Set(saved.map(r => r.fxId));
            const dis = this._disabled(), grp = this._groups();
            return BUILTINS.filter(b => !ids.has(b.fxId)).concat(saved)   // 已存同名蓋內建
                .map(r => Object.assign(r, { enabled: !dis.has(r.fxId), group: grp[r.fxId] || '' }));
        },
        // 注入主模型的白名單文字（每行一個；只列開著的）
        listForPrompt: function () {
            return this.listAll().filter(r => r.enabled)
                .map(r => `#${r.fxId}# ${r.desc || r.name}（${r.kind === 'loop' ? '持续到换场' : '瞬发'}）`).join('\n');
        },

        // ── 內部 ──
        _resolve: function (id) {
            const key = String(id || '').trim().toLowerCase();
            if (!this.isEnabled(key)) { console.log('[OS_FX] 特效已被關閉，略過:', key); return null; }
            const saved = this._saved || [];
            for (const r of saved) if (r.fxId === key) return r;
            for (const r of BUILTINS) if (r.fxId === key) return r;
            if (this._saved === null) this.reloadSaved();   // 首次沒快取：這輪找不到就先載，下輪就有
            return null;
        },

        _stopLoops: function (immediate) {
            for (const inst of this._fx) {
                if (!inst.loop || inst.ending) continue;
                inst.ending = true;
                inst.endAt = performance.now() + (immediate ? 0 : 600);   // 罩色類淡出
            }
            for (const em of this._emitters) if (em.fx.loop) em.stopped = true;   // 停產新粒子，存量自然落完
        },

        _mount: function (host) {
            if (this._overlay && this._overlay.parentElement === host) return;
            if (!this._overlay) {
                this._overlay = document.createElement('div');
                this._overlay.className = 'vn-fx-overlay';
                this._canvas = document.createElement('canvas');
                this._canvas.className = 'vn-fx-canvas';
                this._overlay.appendChild(this._canvas);
                this._ctx = this._canvas.getContext('2d');
            }
            host.appendChild(this._overlay);
            this._stageEl = host;
        },

        _start: function () {
            if (this._raf) return;
            this._lastT = performance.now();
            const loop = (ts) => {
                if (!this._fx.length && !this._particles.length) { this._raf = 0; this._clearShake(); return; }
                this._tick(ts);
                this._raf = requestAnimationFrame(loop);
            };
            this._raf = requestAnimationFrame(loop);
        },

        _tick: function (ts) {
            const ov = this._overlay;
            if (!ov || !ov.isConnected) { this.stopAll(); return; }       // 面板被關 → 全停
            if (document.hidden) { this._lastT = ts; return; }            // 背景分頁 → 暫停不燒
            let dt = (ts - this._lastT) / 1000;
            this._lastT = ts;
            if (dt > 0.1) dt = 0.1;   // 掉幀保護

            // 尺寸同步（含 DPR 封頂）
            const w = ov.clientWidth, h = ov.clientHeight;
            if (!w || !h) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
            if (this._canvas.width !== cw || this._canvas.height !== ch) { this._canvas.width = cw; this._canvas.height = ch; }
            const ctx = this._ctx;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);

            // 過期實例出場（連同它掛的 SVG 元素一起收）
            this._fx = this._fx.filter(inst => {
                const dead = (inst.ending || !inst.loop) && inst.endAt && ts > inst.endAt;
                if (dead) this._cleanupInst(inst);
                return !dead;
            });
            this._emitters = this._emitters.filter(em => this._fx.indexOf(em.fx) !== -1);

            // 發射器產粒子
            for (const em of this._emitters) {
                if (em.stopped || ts < em.t0) continue;
                if (!em.fx.loop && ts > em.t0 + em.step.dur) { em.stopped = true; continue; }
                this._spawn(em, w, h, ts);
            }

            // 粒子更新+繪製
            this._drawParticles(ctx, dt, w, h);

            // 全屏積木（閃色/邊緣/光軌/罩色）+ 震動
            let shakeAmp = 0;
            for (const inst of this._fx) {
                const el = ts - inst.t0;
                for (let _si = 0; _si < inst.recipe.steps.length; _si++) {
                    const s = inst.recipe.steps[_si];
                    if (s.block === 'particles') continue;
                    if (s.block === 'svg') { this._tickSvg(s, el, inst, _si); continue; }   // DOM 層自管生滅，不走 canvas 窗口
                    let p;   // 0~1 進度；loop 罩色恆定、ending 時淡出
                    if (inst.loop) {
                        p = inst.ending ? Math.min(1, Math.max(0, (inst.endAt - ts) / 600)) : 1;
                        if (s.block === 'tint') this._drawTint(ctx, s, 0.5 * p, w, h);
                        else if (s.block === 'edge') this._drawEdge(ctx, s, 0.5 * p, w, h);
                        else if (s.block === 'code') this._runCode(ctx, s, p, dt, w, h, inst, _si);
                        continue;
                    }
                    if (el < s.at || el > s.at + s.dur) continue;
                    p = (el - s.at) / s.dur;
                    if (s.block === 'flash')  this._drawFlash(ctx, s, p, w, h);
                    else if (s.block === 'edge')   this._drawEdge(ctx, s, this._envelope(p), w, h);
                    else if (s.block === 'tint')   this._drawTint(ctx, s, this._envelope(p), w, h);
                    else if (s.block === 'streak') this._drawStreak(ctx, s, p, w, h);
                    else if (s.block === 'bolt')   this._drawBolt(ctx, s, p, w, h, inst, _si, el - s.at);
                    else if (s.block === 'code')   this._runCode(ctx, s, p, dt, w, h, inst, _si);
                    else if (s.block === 'shake')  shakeAmp = Math.max(shakeAmp, s.strength * (1 - p));
                }
            }
            this._applyShake(shakeAmp);
        },

        _envelope: function (p) {   // 快進慢出：前15%淡入、後30%淡出
            if (p < 0.15) return p / 0.15;
            if (p > 0.7) return Math.max(0, (1 - p) / 0.3);
            return 1;
        },

        _spawn: function (em, w, h, ts) {
            const s = em.step;
            if (s.preset === 'burst') {   // 爆發型：一次全放
                if (em.burstDone) return;
                em.burstDone = true;
                for (let i = 0; i < s.count && this._particles.length < MAX_PARTICLES; i++) {
                    const a = Math.random() * Math.PI * 2, v = s.speed * (0.4 + Math.random() * 0.8);
                    this._particles.push({ em: em, x: w / 2, y: h / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                        size: s.size * (0.5 + Math.random()), rot: 0, vr: 0, life: 0, maxLife: 0.9 + Math.random() * 0.6, phase: Math.random() * 6.28 });
                }
                return;
            }
            // 族群維持型：現存 < 目標數就補（每幀限量、避免瞬間尖峰）
            // 首次填充＝一次到位且「全場散開」——否則第一批粒子同齡同速，會結成一條帶狀「雪浪」整條下移（超怪）；
            // 之後的補位才從邊緣（頂/底）進場，此時死亡時序已打散、不會再結浪。
            let alive = 0;
            for (const p of this._particles) if (p.em === em) alive++;
            const first = !em.warmed; em.warmed = true;
            let budget = Math.min(first ? s.count : 8, s.count - alive, MAX_PARTICLES - this._particles.length);
            while (budget-- > 0) {
                const p = { em: em, x: Math.random() * w, y: -10, vx: 0, vy: s.speed * (0.7 + Math.random() * 0.6),
                    size: s.size * (0.6 + Math.random() * 0.8), rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 2,
                    life: 0, maxLife: 999, phase: Math.random() * 6.28 };
                if (s.preset === 'rain')    { p.vx = -s.speed * 0.08; }
                else if (s.preset === 'drip')   { p.vy = s.speed * (0.4 + Math.random() * 0.9); p.y0 = p.y = Math.random() * h * 0.25; }
                else if (s.preset === 'ember' || s.preset === 'bubble') { p.y = h + 10; p.vy = -s.speed * (0.5 + Math.random() * 0.8); }
                else if (s.preset === 'sparkle') { p.x = Math.random() * w; p.y = Math.random() * h; p.vy = 0; p.maxLife = 0.8 + Math.random() * 1.2; }
                if (first && s.preset !== 'sparkle' && s.preset !== 'drip') p.y = Math.random() * h;   // 預散全場（sparkle 本來就散、drip 該待頂區）
                this._particles.push(p);
            }
        },

        _drawParticles: function (ctx, dt, w, h) {
            const alive = [];
            for (const p of this._particles) {
                const s = p.em.step;
                p.life += dt;
                // 運動
                if (s.preset === 'snow')   { p.y += p.vy * dt; p.x += Math.sin(p.life * 1.5 + p.phase) * 18 * dt; }
                else if (s.preset === 'petal')  { p.y += p.vy * dt; p.x += Math.sin(p.life * 1.2 + p.phase) * 34 * dt; p.rot += p.vr * dt; }
                else if (s.preset === 'rain')   { p.y += p.vy * dt; p.x += p.vx * dt; }
                else if (s.preset === 'drip')   { p.vy += 18 * dt; p.y += p.vy * dt; }
                else if (s.preset === 'ember')  { p.y += p.vy * dt; p.x += Math.sin(p.life * 2 + p.phase) * 14 * dt; }
                else if (s.preset === 'bubble') { p.y += p.vy * dt; p.x += Math.sin(p.life * 1.8 + p.phase) * 10 * dt; }
                else if (s.preset === 'burst')  { p.vy += 120 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
                // 出界/壽終
                const dead = p.life > p.maxLife || p.y > h + 20 || p.y < -30 || p.x < -30 || p.x > w + 30;
                if (dead) continue;
                alive.push(p);
                // 繪製
                const col = s.color || '#ffffff';
                ctx.fillStyle = col; ctx.strokeStyle = col;
                if (s.preset === 'rain') {
                    ctx.globalAlpha = 0.7; ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.018, p.y - p.vy * 0.018); ctx.stroke();
                } else if (s.preset === 'drip') {
                    ctx.globalAlpha = 0.25;   // 淌痕
                    ctx.fillRect(p.x - p.size * 0.18, p.y0 || 0, p.size * 0.36, p.y - (p.y0 || 0));
                    ctx.globalAlpha = 0.9;
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * 0.5, p.size * 0.75, 0, 0, 6.29); ctx.fill();
                } else if (s.preset === 'petal') {
                    ctx.globalAlpha = 0.85;
                    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
                    ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, 6.29); ctx.fill(); ctx.restore();
                } else if (s.preset === 'bubble') {
                    ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.29); ctx.stroke();
                } else if (s.preset === 'sparkle') {
                    const tw = 0.5 + 0.5 * Math.sin(p.life * 6 + p.phase);
                    ctx.globalAlpha = tw * Math.max(0, 1 - p.life / p.maxLife);
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.6, 0, 6.29); ctx.fill();
                } else {   // snow / ember / burst
                    let a = 0.85;
                    if (s.preset === 'ember') a = 0.55 + 0.35 * Math.sin(p.life * 5 + p.phase);
                    if (s.preset === 'burst') a = Math.max(0, 1 - p.life / p.maxLife);
                    ctx.globalAlpha = a;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.5, 0, 6.29); ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
            this._particles = alive;
        },

        _drawFlash: function (ctx, s, p, w, h) {
            const a = Math.abs(Math.sin(Math.PI * s.times * p)) * 0.5;   // times 個波峰
            if (a < 0.01) return;
            ctx.globalAlpha = a; ctx.fillStyle = s.color || '#ffffff';
            ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
        },

        _drawEdge: function (ctx, s, a, w, h) {
            if (a < 0.01) return;
            const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, s.color || '#8a0000');
            ctx.globalAlpha = a * 0.75; ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
        },

        _drawTint: function (ctx, s, a, w, h) {
            if (a < 0.01) return;
            ctx.globalAlpha = a * (s.alpha || 0.18) * 2; ctx.fillStyle = s.color || '#000000';
            ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
        },

        _drawStreak: function (ctx, s, p, w, h) {
            // 一道帶光暈的光軌沿法線方向掃過整個畫面
            const rad = (s.angle || 115) * Math.PI / 180;
            const diag = Math.sqrt(w * w + h * h);
            const dx = Math.cos(rad), dy = Math.sin(rad);          // 光軌本身的方向
            const nx = -dy, ny = dx;                                // 掃過方向（法線）
            const off = (p * 1.4 - 0.2) * diag;                     // 起點在畫面外、終點也掃出畫面
            const cx = w / 2 + nx * (off - diag / 2), cy = h / 2 + ny * (off - diag / 2);
            const a = p < 0.7 ? 1 : (1 - p) / 0.3;
            ctx.save();
            ctx.globalAlpha = a; ctx.strokeStyle = s.color || '#ffffff';
            ctx.shadowColor = s.color || '#ffffff'; ctx.shadowBlur = 22;
            ctx.lineCap = 'round';
            for (let i = 0; i < 3; i++) {   // 主軌 + 兩道殘影
                const trail = i * 0.05 * diag;
                ctx.globalAlpha = a * (1 - i * 0.35);
                ctx.lineWidth = (s.width || 3) * (1 - i * 0.25);
                ctx.beginPath();
                ctx.moveTo(cx - dx * diag * 0.7 - nx * trail, cy - dy * diag * 0.7 - ny * trail);
                ctx.lineTo(cx + dx * diag * 0.7 - nx * trail, cy + dy * diag * 0.7 - ny * trail);
                ctx.stroke();
            }
            ctx.restore();
        },

        // 鋸齒閃電：折線主幹＋1-2 條分枝，每 ~130ms 重生路徑（多次落雷感）、每幀隨機頻閃
        _genBoltPath: function (w, h) {
            const segs = 12 + Math.floor(Math.random() * 4);
            const pts = [];
            let x = w * (0.25 + Math.random() * 0.5);
            const drift = (Math.random() - 0.5) * w * 0.25;   // 整體斜向
            const endY = h * (0.65 + Math.random() * 0.25);
            for (let i = 0; i <= segs; i++) {
                const t = i / segs;
                pts.push([x + drift * t + (i === 0 ? 0 : (Math.random() - 0.5) * w * 0.09), -8 + endY * t]);
            }
            // 分枝：從主幹中段抽 1-2 條短折線
            const branches = [];
            const nBr = 1 + Math.floor(Math.random() * 2);
            for (let b = 0; b < nBr; b++) {
                const start = pts[3 + Math.floor(Math.random() * (segs - 6))];
                const dir = Math.random() < 0.5 ? -1 : 1;
                const bp = [start];
                let bx = start[0], by = start[1];
                for (let i = 0; i < 4; i++) {
                    bx += dir * (6 + Math.random() * w * 0.05);
                    by += 10 + Math.random() * h * 0.06;
                    bp.push([bx, by]);
                }
                branches.push(bp);
            }
            return { pts: pts, branches: branches };
        },
        _strokePath: function (ctx, pts) {
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.stroke();
        },
        _drawBolt: function (ctx, s, p, w, h, inst, si, elapsed) {
            const key = 'bolt' + si;
            let st = inst.state[key];
            if (!st || elapsed >= st.regenAt) {
                st = { path: this._genBoltPath(w, h), regenAt: elapsed + 130 };
                inst.state[key] = st;
            }
            const flicker = 0.65 + Math.random() * 0.35;                  // 每幀頻閃
            const a = (p > 0.75 ? (1 - p) / 0.25 : 1) * flicker;          // 尾段淡出
            const col = s.color || '#bfe3ff';
            ctx.save();
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.shadowColor = col; ctx.shadowBlur = 18;
            // 外圈色光 → 白色芯，分枝細一號
            ctx.globalAlpha = a * 0.55; ctx.strokeStyle = col; ctx.lineWidth = (s.width || 3) * 2.2;
            this._strokePath(ctx, st.path.pts);
            for (const bp of st.path.branches) { ctx.lineWidth = (s.width || 3) * 1.1; this._strokePath(ctx, bp); }
            ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = (s.width || 3) * 0.8;
            this._strokePath(ctx, st.path.pts);
            for (const bp of st.path.branches) { ctx.lineWidth = (s.width || 3) * 0.4; this._strokePath(ctx, bp); }
            ctx.restore();
        },

        // SVG 積木：DOM 元素生滅（進場動畫走 CSS、尾段 25% 淡出、窗口過了就收）
        _tickSvg: function (s, elapsed, inst, si) {
            const key = 'svg' + si;
            let st = inst.state[key];
            if (elapsed < s.at) return;
            if (elapsed > s.at + s.dur) {
                if (st && st.el) { try { st.el.remove(); } catch (e) {} st.el = null; }
                return;
            }
            if (!st || !st.el) {
                if (st && st.spent) return;   // 已播完收掉的別復活
                const div = document.createElement('div');
                div.className = 'vn-fx-svg vn-fx-pos-' + s.pos + ' vn-fx-anim-' + s.anim;
                if (s.pos !== 'full') div.style.width = s.size + '%';
                if (s.anim === 'rise' || s.anim === 'burst') div.style.setProperty('--vnfx-dur', s.dur + 'ms');
                div.innerHTML = s.svg;
                this._overlay.appendChild(div);
                inst.state[key] = st = { el: div, fading: false, spent: true };
                return;
            }
            if (!st.fading && elapsed > s.at + s.dur * 0.75) { st.fading = true; st.el.classList.add('vn-fx-svg-out'); }
        },
        // 自訂繪製積木：每幀呼叫 AI 寫的 draw 碼。ctx 有 save/restore 護欄；連錯 3 次自動停用該段，別的積木照播
        _runCode: function (ctx, s, p, dt, w, h, inst, si) {
            const key = 'code' + si;
            let st = inst.state[key];
            if (!st) {
                st = { fn: null, state: {}, errs: 0, t0: performance.now() };
                try { st.fn = new Function('ctx', 'p', 'dt', 't', 'w', 'h', 'state', s.js); }
                catch (e) { console.warn('[OS_FX] 自訂特效編譯失敗:', e && e.message); }
                inst.state[key] = st;
            }
            if (!st.fn) return;
            ctx.save();
            try {
                st.fn(ctx, p, dt, (performance.now() - st.t0) / 1000, w, h, st.state);
                st.errs = 0;
            } catch (e) {
                st.errs++;
                if (st.errs >= 3) { st.fn = null; console.warn('[OS_FX] 自訂特效連續出錯，已停用:', e && e.message); }
            }
            ctx.restore();
            ctx.globalAlpha = 1;
        },

        _cleanupInst: function (inst) {
            if (!inst || !inst.state) return;
            for (const k of Object.keys(inst.state)) {
                const st = inst.state[k];
                if (st && st.el) { try { st.el.remove(); } catch (e) {} st.el = null; }
            }
        },

        _applyShake: function (amp) {
            const el = this._stageEl;
            if (!el) return;
            if (amp < 0.3) { this._clearShake(); return; }
            this._shakeOn = true;
            el.style.transform = `translate(${(Math.random() - 0.5) * 2 * amp}px, ${(Math.random() - 0.5) * 2 * amp}px)`;
        },
        _clearShake: function () {
            if (this._shakeOn && this._stageEl) { this._stageEl.style.transform = ''; this._shakeOn = false; }
        },
    };

    window.OS_FX = OS_FX;
    // 延遲載入已存特效（DB 就緒後）；失敗不擋內建包
    setTimeout(() => { try { OS_FX.reloadSaved(); } catch (e) {} }, 3000);
    console.log('⚡ [OS_FX] 畫面特效引擎就緒（內建', BUILTINS.length, '個）');
})();
