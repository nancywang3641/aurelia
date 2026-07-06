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
    ];

    const VALID_BLOCKS = ['particles', 'flash', 'shake', 'edge', 'streak', 'tint'];
    const VALID_PRESETS = ['snow', 'rain', 'drip', 'petal', 'ember', 'burst', 'bubble', 'sparkle'];

    function clamp(v, lo, hi) { const n = Number(v); return isNaN(n) ? lo : Math.min(hi, Math.max(lo, n)); }

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
                const inst = { recipe: recipe, t0: performance.now(), loop: recipe.kind === 'loop', ending: false, endAt: 0 };
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
            this._fx = []; this._emitters = []; this._particles = [];
            this._clearShake();
            if (this._ctx && this._canvas) this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
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

        // 全清單（內建 + 已存），給清單注入與工坊瀏覽用
        listAll: function () {
            const saved = this._saved || [];
            const ids = new Set(saved.map(r => r.fxId));
            return BUILTINS.filter(b => !ids.has(b.fxId)).concat(saved);   // 已存同名蓋內建
        },
        // 注入主模型的白名單文字（每行一個）
        listForPrompt: function () {
            return this.listAll().map(r => `#${r.fxId}# ${r.desc || r.name}（${r.kind === 'loop' ? '持续到换场' : '瞬发'}）`).join('\n');
        },

        // ── 內部 ──
        _resolve: function (id) {
            const key = String(id || '').trim().toLowerCase();
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

            // 過期實例出場
            this._fx = this._fx.filter(inst => !( (inst.ending || !inst.loop) && inst.endAt && ts > inst.endAt ));
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
                for (const s of inst.recipe.steps) {
                    if (s.block === 'particles') continue;
                    let p;   // 0~1 進度；loop 罩色恆定、ending 時淡出
                    if (inst.loop) {
                        p = inst.ending ? Math.min(1, Math.max(0, (inst.endAt - ts) / 600)) : 1;
                        if (s.block === 'tint') this._drawTint(ctx, s, 0.5 * p, w, h);
                        else if (s.block === 'edge') this._drawEdge(ctx, s, 0.5 * p, w, h);
                        continue;
                    }
                    if (el < s.at || el > s.at + s.dur) continue;
                    p = (el - s.at) / s.dur;
                    if (s.block === 'flash')  this._drawFlash(ctx, s, p, w, h);
                    else if (s.block === 'edge')   this._drawEdge(ctx, s, this._envelope(p), w, h);
                    else if (s.block === 'tint')   this._drawTint(ctx, s, this._envelope(p), w, h);
                    else if (s.block === 'streak') this._drawStreak(ctx, s, p, w, h);
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
            let alive = 0;
            for (const p of this._particles) if (p.em === em) alive++;
            let budget = Math.min(8, s.count - alive, MAX_PARTICLES - this._particles.length);
            while (budget-- > 0) {
                const p = { em: em, x: Math.random() * w, y: -10, vx: 0, vy: s.speed * (0.7 + Math.random() * 0.6),
                    size: s.size * (0.6 + Math.random() * 0.8), rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 2,
                    life: 0, maxLife: 999, phase: Math.random() * 6.28 };
                if (s.preset === 'rain')    { p.vx = -s.speed * 0.08; }
                else if (s.preset === 'drip')   { p.vy = s.speed * (0.4 + Math.random() * 0.9); p.y0 = p.y = Math.random() * h * 0.25; }
                else if (s.preset === 'ember' || s.preset === 'bubble') { p.y = h + 10; p.vy = -s.speed * (0.5 + Math.random() * 0.8); }
                else if (s.preset === 'sparkle') { p.x = Math.random() * w; p.y = Math.random() * h; p.vy = 0; p.maxLife = 0.8 + Math.random() * 1.2; }
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
