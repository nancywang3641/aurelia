// ============================================================
// farm_worker.js — 雇來的人在她的畫面上走來走去（後院、牧場都看得到）
// ------------------------------------------------------------
// 10-11 她雇克語、一件沒做成退錢之後問「那我應該可以看到他才對?」→「做吧，讓他在畫面上走，這樣才正確? 畢竟沒說花園只能一個人物存在」。
// 他在伺服器上做事（VPS garden.js 的 workDo），每做成一步，單子裡記一筆站哪、做什麼（job.trail.steps）；
// 雇人那支（farm_hire.js）看著單子時把清單丟過來（update），這支照還沒演過的步驟一步一步演：
//   他從後院下面那道門走進來 → 走到那一步站的地方 → 頭上冒做什麼的圖示（田跟著換成他做完那樣，onPlot）→ 下一步；
//   去牧場就走進小圍欄那個門（在牧場那頁就看到他從下面缺口走進來）；收工講他那句話、從下面走出去。
// 演到第幾步記在這個分頁（換到牧場、存檔衝突重開都接著演，不從頭來）；做完十分鐘內打開也會補演沒看過的。
// 「雇人」面板裡做完的單子可以按「看他怎麼做」從頭再演一次（田先換回他來之前的樣子）。
// 只是畫面：他做的事伺服器上早就做完了；演完才讓雇人那支換成伺服器那份重開（after），不然重開會把他演到一半收掉。
// 他的樣子：房間那支 ClawdPortrait 畫一格（照他在宿舍衣櫃換的打扮，DormPanel.wearOf）；房間沒載到是一顆圓點。
// ============================================================
(function () {
    'use strict';

    var BASE = { dan: 'crab', aluo: 'lorde', keyu: 'crab' };
    var LIVE_S = 10 * 60;              // 做完多久內打開還會補演
    var KEY = 'aurelia_farm_worker_played';
    // 做每一步頭上冒的圖示（跟她自己做事、做客重播同一套）
    var VERB_ICON = {
        water: 'fa-droplet', plant: 'fa-seedling', harvest: 'fa-basket-shopping', fertilize: 'fa-poop',
        fill: 'fa-bottle-water', take: 'fa-hand', drop: 'fa-hand', ship: 'fa-box-open', unship: 'fa-box-open',
        feed: 'fa-wheat-awn', feedall: 'fa-wheat-awn', refill: 'fa-droplet', milk: 'fa-bucket', shear: 'fa-scissors',
        medicine: 'fa-syringe', collect: 'fa-egg', collectall: 'fa-egg', clean: 'fa-broom', cleanall: 'fa-broom',
        pull: 'fa-seedling', pullall: 'fa-seedling', pet: 'fa-heart', bowl: 'fa-bowl-food', honey: 'fa-jar'
    };
    // 每一區的門：enter＝第一次走進來、收工走出去那裡；other＝通往另一區的那個門
    var DOORS = {
        yard: { enter: { x: 50, y: 84 }, other: { x: 87, y: 41 } },
        ranch: { enter: { x: 50, y: 85 }, other: { x: 50, y: 85 } }
    };

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function fa(icon) { return '<i class="fa-solid ' + icon + '"></i>'; }
    function now() { return Date.now() / 1000; }

    // 演到哪：{ 單子 id: { n: 演過幾步, out: 收工走掉了沒 } }（這個分頁裡；換場景、重開都還在）
    var PLAYED = {};
    try { PLAYED = JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch (e) { PLAYED = {}; }
    function savePlayed() { try { sessionStorage.setItem(KEY, JSON.stringify(PLAYED)); } catch (e) {} }

    // 他的樣子畫一次就記著（每個場景都會再要）
    var LOOKS = {};
    function lookOf(id) {
        if (LOOKS[id]) return LOOKS[id];
        var CP = window.ClawdPortrait;
        if (!CP || !CP.renderStill) return Promise.resolve('');
        var D = window.DormPanel;
        var wearP = (D && D.wearOf) ? Promise.resolve(D.wearOf(id)).catch(function () { return null; }) : Promise.resolve(null);
        LOOKS[id] = wearP.then(function (wear) {
            var paint = function (w) {
                var cv = document.createElement('canvas');
                return Promise.resolve(CP.renderStill(cv, w, 'idle', 0, BASE[id] || 'crab')).then(function () { return CP.crop ? CP.crop(cv) : cv.toDataURL(); });
            };
            return paint(wear).catch(function () { return paint(null); });
        }).catch(function () { return ''; });
        return LOOKS[id];
    }

    // opts：{ world（場景那層）, scene: 'yard'|'ranch', state(), onPlot(i, plot)（後院才給：田換成他做完那樣） }
    function create(opts) {
        var here = opts.scene, world = opts.world;
        var dead = false, walkers = {}, afters = {};
        var WC = window.FarmWalkCore;

        function planner() { return window.FarmWalkStage.planner(here, opts.state()); }

        // ── 一個人 ─────────────────────────────────────
        function makeWalker(job) {
            var pos = document.createElement('div');
            pos.className = 'fw-pos fk-pos';
            var el = document.createElement('div');
            el.className = 'fw-player fv-host fk-worker is-loading';
            el.innerHTML = '<div class="fw-body"></div><span class="fw-doing"></span><span class="fv-name">' + esc(job.name) + '</span><span class="fv-say" hidden></span>';
            pos.appendChild(el);
            world.appendChild(pos);
            var bodyEl = el.querySelector('.fw-body'), doingEl = el.querySelector('.fw-doing'), sayEl = el.querySelector('.fv-say');
            lookOf(job.worker).then(function (url) {
                if (dead) return;
                if (!url) { el.classList.add('is-dot'); el.classList.remove('is-loading'); return; }
                var img = new Image();
                img.className = 'fw-img';
                img.alt = '';
                img.onload = function () { if (!dead) { bodyEl.appendChild(img); el.classList.remove('is-loading'); } };
                img.src = url;
            });
            // scene：他現在在哪一區（'out'＝還沒進來或已經走了）
            var w = { job: job, queue: [], busy: false, scene: 'out', x: DOORS[here].enter.x, y: DOORS[here].enter.y,
                path: [], dest: null, cb: null, walking: false, flip: false, drawn: {}, doingT: 0, sayT: 0, pos: pos, el: el };

            w.place = function () {
                var d = w.drawn, tf = 'translate(' + w.x.toFixed(3) + '%,' + w.y.toFixed(3) + '%)';
                if (d.tf !== tf) { pos.style.transform = tf; d.tf = tf; }
                var hide = w.scene !== here;
                if (d.hide !== hide) { pos.hidden = hide; d.hide = hide; }
                if (d.walking !== w.walking) { el.classList.toggle('is-walking', w.walking); d.walking = w.walking; }
                if (d.flip !== w.flip) { el.classList.toggle('is-flip', w.flip); d.flip = w.flip; }
            };
            w.walkTo = function (x, y, cb) {
                w.path = planner().plan(w.x, w.y, x, y);
                w.dest = w.path.shift();
                w.cb = cb || null;
                if (!w.dest) { w.cb = null; if (cb) cb(); }
            };
            w.arrive = function () {
                var cb = w.cb;
                w.dest = null; w.cb = null; w.path = []; w.walking = false;
                w.place();
                if (cb) cb();
            };
            w.step = function (dt) {
                if (!w.dest) { if (w.walking) { w.walking = false; w.place(); } return; }
                var vx = w.dest.x - w.x, vy = (w.dest.y - w.y) * WC.ASPECT, d = Math.hypot(vx, vy);
                if (d < .4) {
                    w.x = w.dest.x; w.y = w.dest.y;
                    if (w.path.length) w.dest = w.path.shift(); else { w.arrive(); return; }
                    vx = w.dest.x - w.x; vy = (w.dest.y - w.y) * WC.ASPECT; d = Math.hypot(vx, vy) || 1;
                }
                var sp = window.FarmWalkStage.SPEED * dt / 1000;
                if (sp >= d) { w.x = w.dest.x; w.y = w.dest.y; }
                else { w.x += vx / d * sp; w.y += vy / d * sp / WC.ASPECT; }
                if (Math.abs(vx) > .05) w.flip = vx > 0;
                w.walking = true;
                w.place();
            };
            // 走到某一步站的地方：在別區就走進這一區通往那邊的門（看不到他了）；從別區回來就從那個門走出來
            w.go = function (s, cb) {
                if (s.s !== here) {
                    if (w.scene !== here) { w.scene = s.s; cb(); return; }
                    var o = DOORS[here].other;
                    w.walkTo(o.x, o.y, function () { w.scene = s.s; w.place(); cb(); });
                    return;
                }
                if (w.scene !== here) {
                    var from = w.scene === 'out' ? DOORS[here].enter : DOORS[here].other;
                    w.scene = here; w.x = from.x; w.y = from.y; w.place();
                }
                w.walkTo(s.x, s.y, cb);
            };
            w.doing = function (icon) {
                doingEl.innerHTML = fa(icon);
                el.classList.add('is-doing');
                clearTimeout(w.doingT);
                w.doingT = setTimeout(function () { el.classList.remove('is-doing'); }, 700);
            };
            w.say = function (text, ms) {
                sayEl.textContent = text;
                sayEl.hidden = false;
                clearTimeout(w.sayT);
                w.sayT = setTimeout(function () { sayEl.hidden = true; }, ms || 4200);
            };
            w.remove = function () { clearTimeout(w.doingT); clearTimeout(w.sayT); if (pos.parentNode) pos.parentNode.removeChild(pos); };
            w.place();
            return w;
        }

        // ── 演 ───────────────────────────────────────
        function rec(id) { return PLAYED[id] || (PLAYED[id] = { n: 0, out: false }); }
        function finished(job) { return job.status === 'done' || job.status === 'refunded'; }
        function next(w) {
            if (dead) return;
            var job = w.job, r = rec(job.id), steps = (job.trail && job.trail.steps) || [];
            if (r.n < steps.length) {
                var s = steps[r.n];
                w.busy = true;
                w.go(s, function () {
                    if (dead) return;
                    r.n += 1;
                    savePlayed();
                    if (s.s === here) {
                        if (opts.onPlot && s.p && s.i != null) opts.onPlot(s.i, s.p);
                        if (VERB_ICON[s.v]) w.doing(VERB_ICON[s.v]);
                    }
                    setTimeout(function () { next(w); }, s.v === 'go' ? 150 : 650);
                });
                return;
            }
            if (finished(job) && !r.out) {
                // 收工：講他那句、從下面走出去（人在別區就直接算走了）
                w.busy = true;
                var leave = function () {
                    var e = DOORS[here].enter;
                    var bye = function () { r.out = true; savePlayed(); w.scene = 'out'; w.place(); done(w); };
                    if (w.scene !== here) { bye(); return; }
                    w.walkTo(e.x, e.y, bye);
                };
                if (job.note && w.scene === here) { w.say(job.note, 5200); setTimeout(leave, 4200); }
                else leave();
                return;
            }
            w.busy = false;   // 還在做（伺服器那邊還沒送新的步驟來）：站在原地等
        }
        function done(w) {
            var id = w.job.id;
            w.busy = false;
            w.remove();
            delete walkers[id];
            var list = afters[id] || [];
            delete afters[id];
            list.forEach(function (fn) { try { fn(); } catch (e) {} });
        }
        // 這張單子要不要演：在做的、十分鐘內做完的才演；更早的當作看過了
        function wanted(job) {
            if (!job || !job.trail || !job.trail.steps) return false;
            var r = PLAYED[job.id];
            if (!r) {
                if (job.status !== 'working' && !(finished(job) && job.doneAt && now() - job.doneAt < LIVE_S)) {
                    PLAYED[job.id] = { n: job.trail.steps.length, out: true };
                    savePlayed();
                    return false;
                }
                r = rec(job.id);
            }
            return r.n < job.trail.steps.length || (finished(job) && !r.out);
        }
        function update(list) {
            if (dead) return;
            (list || []).forEach(function (job) {
                if (!wanted(job)) return;
                var w = walkers[job.id];
                if (!w) w = walkers[job.id] = makeWalker(job);
                w.job = job;
                if (!w.busy) next(w);
            });
        }
        // 從頭再演一次：田先換回他來之前的樣子
        function replay(job) {
            if (dead || !job || !job.trail || !job.trail.steps || !job.trail.steps.length) return false;
            if (walkers[job.id]) return false;
            PLAYED[job.id] = { n: 0, out: false };
            savePlayed();
            if (opts.onPlot && job.trail.start && job.trail.start.plots) job.trail.start.plots.forEach(function (p, i) { opts.onPlot(i, p); });
            update([job]);
            return true;
        }
        // 雇人那支要換成伺服器那份重開前問一下：還在演就等演完
        function after(id, fn) {
            if (!walkers[id]) { fn(); return; }
            (afters[id] = afters[id] || []).push(fn);
        }

        // 一個迴圈帶所有人（同她那支：rAF＋背景時用計時器補，一步最多 60 毫秒）
        var last = performance.now(), raf = 0;
        function advance(t) {
            var left = Math.min(2000, t - last);
            last = t;
            while (left > 0 && !dead) {
                var dt = Math.min(60, left);
                Object.keys(walkers).forEach(function (k) { walkers[k].step(dt); });
                left -= 60;
            }
        }
        function tick(t) { if (dead) return; advance(t); raf = requestAnimationFrame(tick); }
        raf = requestAnimationFrame(tick);
        var backup = setInterval(function () { var t = performance.now(); if (!dead && t - last > 200) advance(t); }, 100);

        return {
            update: update,
            replay: replay,
            after: after,
            playing: function (id) { return !!walkers[id]; },
            destroy: function () {
                dead = true;
                cancelAnimationFrame(raf);
                clearInterval(backup);
                Object.keys(walkers).forEach(function (k) { walkers[k].remove(); });
                walkers = {};
                // 還在等演完的那幾件（換場景）：照樣做，不然雇人那支一直等
                Object.keys(afters).forEach(function (k) { (afters[k] || []).forEach(function (fn) { try { fn(); } catch (e) {} }); });
                afters = {};
            }
        };
    }

    window.FarmWorkers = { create: create };
})();
