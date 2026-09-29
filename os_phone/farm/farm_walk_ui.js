// ============================================================
// farm_walk_ui.js — 後院／牧場共用的「自己走」舞台（照大廳 lobby_stage.js 的操作）
// ------------------------------------------------------------
// 走路：方向鍵／WASD；手機左下搖桿；點地板走過去；點東西＝走到它旁邊（不會自己動手）。
// 做事：走到東西旁邊，下面冒出一排能做的事；按鈕或 E／空白鍵（第一個）、數字鍵（第幾個）。
// 鏡頭：畫面放大到小人看得清楚，跟著小人走（桌機多半整張放得下，不會動）。
// 規則全在 farm_walk_core.js（走路扣體力、搆不搆得到、手上拿什麼），這支只負責畫面；
// 走路時每 SYNC_MS 把位置交給規則記一次（她自己走不扣體力，帶 free；AI 下指令走路才扣，見 farm_walk_core 的 ②）。
// 走的人是她自己：大廳裡「你」那個小人（裝扮室換過的樣子跟著來），opts.look() 給圖。
// 🚨 每一格會動的東西（小人、鏡頭、頭上小窗）一律只改 transform，不改 left/top：
//    酒館裡聊天記錄的 DOM 很肥，left/top 每格一改就整頁重排版面，走路會一頓一頓（大廳舞台 placeSheetActor 同一條教訓）。
// ============================================================
(function () {
    'use strict';

    var MAP_W = 1672, MAP_H = 941;
    var BODY_H = 15;        // 小人佔底圖高的 %（牛身長 12% 寬，人站旁邊差不多高）
    var SPEED = 19;         // 每秒走「底圖寬」的幾 %
    var SYNC_MS = 300;
    var ZOOM_MAX = 2.4;     // 手機直拿時最多放大到「整張塞滿寬度」的幾倍
    var WALK_FRAMES = [0, 1, 2, 1], WALK_FRAME_MS = 150;   // 走路圖（3×4）的幀序，跟大廳一樣

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    // 量單張圖腳底下還有多少透明（跟大廳 _measureActorBounds 同一招）：讓看得到的腳踩在站的位置，不是圖的底邊
    function measureFootPad(img) {
        try {
            var sw = 80, sh = Math.max(1, Math.round(img.naturalHeight * 80 / img.naturalWidth));
            var cv = document.createElement('canvas'); cv.width = sw; cv.height = sh;
            var c = cv.getContext('2d', { willReadFrequently: true });
            c.drawImage(img, 0, 0, sw, sh);
            var d = c.getImageData(0, 0, sw, sh).data;
            for (var y = sh - 1; y >= 0; y--) for (var x = 0; x < sw; x++) if (d[(y * sw + x) * 4 + 3] >= 40) return (sh - 1 - y) / sh;
        } catch (e) { /* 跨網域讀不到：就用圖的底邊 */ }
        return 0;
    }

    // ── 繞路：點地板／點東西時，先在 1%×1% 的格子上算一條避開擋路東西的路，再一段一段走 ──
    // 以前只有「撞到就沿著滑」：東西正好擋在中間時，每一格往旁邊挪一點點、永遠走不到（出貨箱第一次放上去就卡住）。
    // 門口那塊不當路走（免得繞路經過門口就換區），除非目的地就在門裡。
    // 一區一個（格子只算一次）：她自己走、做客時看到的住戶走，都用這一份
    var GW = 101, PLANNERS = {};
    function planner(scene) {
        if (PLANNERS[scene]) return PLANNERS[scene];
        var WC = window.FarmWalkCore, S = WC.SCENES[scene], ASPECT = WC.ASPECT;
        var GRID = null;
        function inDoor(x, y) { var d = S.door; return !!d && x > d.x1 && x < d.x2 && y > d.y1 && y < d.y2; }
        function grid() {
            if (GRID) return GRID;
            GRID = new Uint8Array(GW * GW);
            // 一格要連四周 0.7 都能站才算路：貼著箱子邊的格子不走，不然從格子走到格子時會擦過箱子的角被擋下來
            var M = .7;
            var ok = function (x, y) {
                return WC.walkable(scene, x, y) && WC.walkable(scene, x - M, y) && WC.walkable(scene, x + M, y) &&
                    WC.walkable(scene, x, y - M) && WC.walkable(scene, x, y + M);
            };
            for (var y = 0; y < GW; y++) for (var x = 0; x < GW; x++) {
                GRID[y * GW + x] = ok(x, y) ? (inDoor(x, y) ? 2 : 1) : 0;
            }
            return GRID;
        }
        function cellOk(x, y, door) {
            if (x < 0 || y < 0 || x >= GW || y >= GW) return false;
            var v = grid()[y * GW + x];
            return v === 1 || (v === 2 && door);
        }
        function nearestCell(x, y, door) {
            var cx = Math.round(x), cy = Math.round(y);
            for (var r = 0; r <= 8; r++) for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                if (cellOk(cx + dx, cy + dy, door)) return [cx + dx, cy + dy];
            }
            return null;
        }
        function lineClear(a, b, door) {
            var n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / .4);
            for (var i = 1; i <= n; i++) {
                var x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n;
                if (!WC.walkable(scene, x, y) || (!door && inDoor(x, y))) return false;
            }
            return true;
        }
        // 從 (fx,fy) 走到 (tx,ty)：回一串轉折點（最後一個是目的地）
        function plan(fx, fy, tx, ty) {
            var door = inDoor(tx, ty), from = { x: fx, y: fy }, to = { x: tx, y: ty };
            if (lineClear(from, to, door)) return [to];
            var s0 = nearestCell(fx, fy, true), g0 = nearestCell(tx, ty, door);
            if (!s0 || !g0) return [to];
            var N = GW * GW, start = s0[1] * GW + s0[0], goal = g0[1] * GW + g0[0];
            var gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), done = new Uint8Array(N);
            var heap = [];   // [f, 格子]，f 小的在上面
            function push(f, i) {
                heap.push([f, i]);
                for (var k = heap.length - 1; k > 0;) {
                    var q = Math.floor((k - 1) / 2);
                    if (heap[q][0] <= heap[k][0]) break;
                    var t = heap[q]; heap[q] = heap[k]; heap[k] = t; k = q;
                }
            }
            function pop() {
                var top = heap[0], last = heap.pop();
                if (heap.length) {
                    heap[0] = last;
                    for (var k = 0; ;) {
                        var l = k * 2 + 1, r = l + 1, m = k;
                        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
                        if (m === k) break;
                        var t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m;
                    }
                }
                return top[1];
            }
            function h(i) { return Math.hypot(i % GW - g0[0], (Math.floor(i / GW) - g0[1]) * ASPECT); }
            gs[start] = 0;
            push(h(start), start);
            var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
            while (heap.length) {
                var cur = pop();
                if (cur === goal) break;
                if (done[cur]) continue;
                done[cur] = 1;
                var cx = cur % GW, cy = Math.floor(cur / GW);
                for (var k = 0; k < 8; k++) {
                    var nx = cx + DIRS[k][0], ny = cy + DIRS[k][1];
                    if (!cellOk(nx, ny, door)) continue;
                    // 斜著走不能切過擋路東西的角
                    if (DIRS[k][0] && DIRS[k][1] && (!cellOk(cx + DIRS[k][0], cy, door) || !cellOk(cx, cy + DIRS[k][1], door))) continue;
                    var ni = ny * GW + nx, ng = gs[cur] + Math.hypot(DIRS[k][0], DIRS[k][1] * ASPECT);
                    if (ng < gs[ni]) { gs[ni] = ng; came[ni] = cur; push(ng + h(ni), ni); }
                }
            }
            if (came[goal] < 0 && goal !== start) return [to];
            var cells = [];
            for (var c = goal; c >= 0 && c !== start; c = came[c]) cells.push({ x: c % GW, y: Math.floor(c / GW) });
            cells.reverse();
            if (WC.walkable(scene, tx, ty)) cells.push(to);
            // 拉直：能直直走到的就跳過中間那些格子
            var out = [], at = from, i = 0;
            while (i < cells.length) {
                var j = cells.length - 1;
                while (j > i && !lineClear(at, cells[j], door)) j--;
                out.push(cells[j]);
                at = cells[j];
                i = j + 1;
            }
            return out.length ? out : [to];
        }
        return (PLANNERS[scene] = { plan: plan, inDoor: inDoor });
    }

    // opts：{ app, world, scene, state(), targets(), onChange(), onStamina(), onDoor(to), toast(text), look(): Promise<{src}|{sheet}>, zFixed }
    function create(opts) {
        var WC = window.FarmWalkCore;
        var S = WC.SCENES[opts.scene];
        var P = planner(opts.scene);
        var app = opts.app, world = opts.world;
        var ASPECT = WC.ASPECT;

        app.classList.add('fw-on');
        var st = opts.state();
        // 存檔裡人在別區：從這區門口走進來（照規則扣走到門口那段）
        if (st.walk.scene !== opts.scene) {
            WC.moveTo(st, opts.scene, S.gate.x, S.gate.y, { free: true });
            if (opts.onChange) opts.onChange();
        }
        var p = { x: st.walk.x, y: st.walk.y, dest: null, destKey: null, lockKey: null, walking: false, cb: null };
        // 存檔裡站在門裡（不該發生，但舊的存檔有）：放到門口外面，不然要先走出去一次門才會生效
        if (S.door && inDoor(p.x, p.y)) { p.x = S.gate.x; p.y = S.gate.y; st.walk.x = p.x; st.walk.y = p.y; }
        var doorArmed = true;

        // ── 小人（她自己）─────────────────────────────
        // 外面那層 fw-pos 跟底圖一樣大，translate 的 % 就等於底圖的 %；小人本身掛在它左上角、腳底對準那一點
        var pos = document.createElement('div');
        pos.className = 'fw-pos';
        pos.style.setProperty('--fw-h', BODY_H + '%');
        var el = document.createElement('div');
        el.className = 'fw-player is-loading';
        el.innerHTML = '<div class="fw-body"></div><span class="fw-hand" hidden></span><span class="fw-doing"></span>';
        pos.appendChild(el);
        world.appendChild(pos);
        var bodyEl = el.querySelector('.fw-body');
        var handEl = el.querySelector('.fw-hand');
        var doingEl = el.querySelector('.fw-doing');
        // 做成一件事：小人開心跳一下
        var cheerTimer = 0;
        function cheer() {
            el.classList.add('is-happy');
            clearTimeout(cheerTimer);
            cheerTimer = setTimeout(function () { el.classList.remove('is-happy'); }, 600);
        }
        // 長相：單張立姿（原圖朝左，往右走鏡像＋一跳一跳）或 3×4 走路圖（列＝下/左/右/上，欄＝左步/立/右步）
        var look = { sheet: false, flip: false, dir: 0, frame: 1, animT: 0 };
        function showLook(got) {
            if (dead) return;
            var src = got && (got.sheet || got.src);
            if (!src) { el.classList.add('is-dot'); el.classList.remove('is-loading'); return; }
            var probe = new Image();
            if (!/^(data|blob):/.test(src)) probe.crossOrigin = 'anonymous';   // 要讀透明度量腳底
            probe.onload = function () {
                if (dead) return;
                if (got.sheet) {
                    look.sheet = true;
                    el.classList.add('is-sheet');
                    bodyEl.innerHTML = '<div class="fw-sheet"></div>';
                    var sh = bodyEl.firstChild;
                    sh.style.aspectRatio = (probe.naturalWidth / 3) + ' / ' + (probe.naturalHeight / 4);
                    sh.style.backgroundImage = 'url("' + src + '")';
                } else {
                    bodyEl.innerHTML = '';
                    probe.className = 'fw-img';
                    probe.alt = '';
                    bodyEl.appendChild(probe);
                    el.style.setProperty('--fw-pad', (measureFootPad(probe) * 100).toFixed(2) + '%');
                }
                el.classList.remove('is-loading');
                drawLook(true);
            };
            probe.onerror = function () { el.classList.add('is-dot'); el.classList.remove('is-loading'); };
            probe.src = src;
        }
        Promise.resolve(opts.look ? opts.look() : null).then(showLook, function () { showLook(null); });

        var drawn = {};
        function drawLook(force) {
            if (look.sheet) {
                var sh = bodyEl.firstChild;
                var bg = (look.frame * 50) + '% ' + (look.dir * 100 / 3).toFixed(3) + '%';
                if (sh && (force || drawn.bg !== bg)) { sh.style.backgroundPosition = bg; drawn.bg = bg; }
            } else if (force || drawn.flip !== look.flip) {
                el.classList.toggle('is-flip', look.flip); drawn.flip = look.flip;
            }
        }
        // 走的方向（每格 step 給這一格真的挪了多少）
        function faceTo(mx, my, dt) {
            if (look.sheet) {
                if (mx || my) {
                    look.dir = Math.abs(mx) >= Math.abs(my * ASPECT) ? (mx < 0 ? 1 : 2) : (my < 0 ? 3 : 0);
                    look.animT += dt;
                    look.frame = WALK_FRAMES[Math.floor(look.animT / WALK_FRAME_MS) % WALK_FRAMES.length];
                } else { look.frame = 1; look.animT = 0; }
            } else if (mx) look.flip = mx > 0;
            drawLook(false);
        }

        // 只在變了的時候寫（寫一樣的值也會讓瀏覽器重算樣式）
        function placePlayer() {
            var tf = 'translate(' + p.x.toFixed(3) + '%,' + p.y.toFixed(3) + '%)';
            if (drawn.tf !== tf) { pos.style.transform = tf; drawn.tf = tf; }
            var z = String(opts.zFixed != null ? opts.zFixed : Math.round(p.y) + 1);
            if (drawn.z !== z) { pos.style.zIndex = z; drawn.z = z; }
            var tired = (opts.state().stamina || 0) <= 0;
            if (drawn.walking !== p.walking) { el.classList.toggle('is-walking', p.walking); drawn.walking = p.walking; }
            if (drawn.tired !== tired) { el.classList.toggle('is-tired', tired); drawn.tired = tired; }
        }
        function renderHand() {
            var w = opts.state().walk;
            var t = w.hand && WC.TOOLS[w.hand];
            handEl.hidden = !t;
            if (t) handEl.innerHTML = '<i class="fa-solid ' + t.icon + '"></i>' + (w.hand === 'can' ? '<b>' + w.can + '</b>' : '');
            handEl.title = t ? '手上：' + t.name : '';
        }

        // ── 鏡頭 ─────────────────────────────────────
        var scale = 1;
        function layout() {
            var vw = app.clientWidth, vh = app.clientHeight;
            if (!vw || !vh) return;
            var fit = vw / MAP_W;
            scale = Math.max(fit, Math.min(vh / MAP_H, fit * ZOOM_MAX));
            world.style.width = (MAP_W * scale) + 'px';
            world.style.height = (MAP_H * scale) + 'px';
            camera();
        }
        function camera() {
            var ww = MAP_W * scale, wh = MAP_H * scale, vw = app.clientWidth, vh = app.clientHeight;
            var tx = ww <= vw ? (vw - ww) / 2 : clamp(vw / 2 - p.x / 100 * ww, vw - ww, 0);
            var ty = wh <= vh ? (vh - wh) / 2 : clamp(vh / 2 - p.y / 100 * wh, vh - wh, 0);
            var tf = 'translate(' + Math.round(tx) + 'px,' + Math.round(ty) + 'px)';
            if (drawn.cam !== tf) { world.style.transform = tf; drawn.cam = tf; }
            placeBar();
        }
        window.addEventListener('resize', layout);

        // ── 輸入 ─────────────────────────────────────
        var keys = {}, joy = null;
        function typing() {
            var t = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
            return t === 'input' || t === 'textarea' || t === 'select';
        }
        // 🚨 酒館本體綁了 ↑＝編輯訊息、←→＝swipe（會重新生成＝花她的錢）：走路用的鍵一律在捕獲階段整條攔死（同大廳舞台）
        var MOVE_KEYS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'];
        function swallow(e) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
        function onKey(e) {
            // 農場被藏起來（關掉了、換成別的 app）就不接任何按鍵：方向鍵要還給大廳和酒館
            if (!app.isConnected || app.offsetParent === null) return;
            if (typing()) return;
            var k = e.key.toLowerCase();
            var move = MOVE_KEYS.indexOf(k) >= 0;
            // 背包、出貨箱、結算單、看板打開時：按鍵不讓底下的小人走動或做事（方向鍵照樣攔住，不漏給酒館）
            if (document.querySelector('[data-fw-modal]:not([hidden])')) { keys = {}; if (move) swallow(e); return; }
            if (move) {
                keys[k] = e.type === 'keydown';
                swallow(e);
                return;
            }
            if (e.type !== 'keydown' || e.repeat) return;
            if (k === 'e' || k === ' ' || k === 'enter') { if (runAction(0)) swallow(e); return; }
            if (/^[1-9]$/.test(k)) { if (runAction(Number(k) - 1)) swallow(e); }
        }
        function onBlur() { keys = {}; }
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('keyup', onKey, true);
        window.addEventListener('blur', onBlur);

        // 點地板走過去；點到東西（帶 data-fw-key）走到它旁邊
        world.addEventListener('click', function (e) {
            var hit = e.target.closest('[data-fw-key]');
            if (hit) { e.stopPropagation(); approach(hit.getAttribute('data-fw-key')); return; }
            var r = world.getBoundingClientRect();
            if (!r.width) return;
            setDest((e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100, null, null);
        });

        // 手機：左下搖桿（跟大廳同一種）
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
            var base = document.createElement('div');
            base.className = 'fw-joy';
            base.innerHTML = '<div class="fw-joy-knob"></div>';
            app.appendChild(base);
            var knob = base.firstChild, R = 38, DEAD = 7, active = false;
            var setKnob = function (x, y) { knob.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
            var move = function (e) {
                if (!active) return;
                var r = base.getBoundingClientRect();
                var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
                var d = Math.hypot(dx, dy);
                if (d > R) { dx = dx / d * R; dy = dy / d * R; }
                setKnob(dx, dy);
                joy = Math.hypot(dx, dy) < DEAD ? null : { x: dx / R, y: dy / R };
            };
            base.addEventListener('pointerdown', function (e) { active = true; base.setPointerCapture(e.pointerId); move(e); e.preventDefault(); });
            base.addEventListener('pointermove', move);
            var up = function () { active = false; joy = null; setKnob(0, 0); };
            base.addEventListener('pointerup', up);
            base.addEventListener('pointercancel', up);
        }

        // ── 走路 ─────────────────────────────────────
        var syncT = 0;
        function sync() {
            var st2 = opts.state();
            var before = st2.stamina;
            WC.moveTo(st2, opts.scene, p.x, p.y, { free: true });
            if (st2.stamina === before) return;
            // 走路扣體力只換那個數字：整片重畫（田、快捷列、小窗）在酒館肥 DOM 裡每次都是一整頁重排
            if (opts.onStamina) opts.onStamina(); else if (opts.onChange) opts.onChange();
        }
        function inDoor(x, y) { return P.inDoor(x, y); }
        function tryMove(nx, ny) {
            if (WC.walkable(opts.scene, nx, ny)) { p.x = nx; p.y = ny; return true; }
            return false;
        }
        function arrive() {
            var cb = p.cb;
            if (p.destKey) p.lockKey = p.destKey;
            p.dest = null; p.destKey = null; p.cb = null; p.path = [];
            sync();
            if (cb) cb();
        }

        function setDest(x, y, key, cb) {
            p.path = P.plan(p.x, p.y, x, y);
            p.dest = p.path.shift();
            p.destKey = key;
            p.cb = cb || null;
        }
        function step(dt) {
            var dx = 0, dy = 0;
            if (keys.arrowleft || keys.a) dx -= 1;
            if (keys.arrowright || keys.d) dx += 1;
            if (keys.arrowup || keys.w) dy -= 1;
            if (keys.arrowdown || keys.s) dy += 1;
            if (joy) { dx = joy.x; dy = joy.y; }
            var manual = !!(dx || dy);
            if (manual) { p.dest = null; p.destKey = null; p.cb = null; p.lockKey = null; p.path = []; }
            else if (p.dest) {
                // 目標距離用「看起來的」長度算：上下的百分比要乘回扁的比例
                var vx = p.dest.x - p.x, vy = (p.dest.y - p.y) * ASPECT, d = Math.hypot(vx, vy);
                if (d < .5) {
                    // 走到一個轉折點：換下一段；最後一段走完才算到
                    if (p.path && p.path.length) {
                        p.dest = p.path.shift();
                        vx = p.dest.x - p.x; vy = (p.dest.y - p.y) * ASPECT; d = Math.hypot(vx, vy) || 1;
                        dx = vx / d; dy = vy / d;
                    } else arrive();
                }
                else { dx = vx / d; dy = vy / d; }
            }
            var len = Math.hypot(dx, dy);
            var moved = false, ox = p.x, oy = p.y;
            if (len > 0) {
                var tired = (opts.state().stamina || 0) <= 0;
                var sp = SPEED * (tired ? .6 : 1) * dt / 1000 * Math.min(1, len);
                var ux = dx / len, uy = dy / len;
                var stepX = ux * sp, stepY = uy * sp / ASPECT;
                if (p.dest) {
                    // 別走過頭
                    var remain = Math.hypot(p.dest.x - p.x, (p.dest.y - p.y) * ASPECT);
                    if (sp > remain) { stepX = p.dest.x - p.x; stepY = p.dest.y - p.y; }
                }
                // 自己按方向走：撞到東西沿著滑。照算好的路走：不滑（滑一點點會在原地抖、永遠走不到），擋住就停。
                moved = tryMove(p.x + stepX, p.y + stepY) || (!p.dest && (tryMove(p.x + stepX, p.y) || tryMove(p.x, p.y + stepY)));
                if (!moved && p.dest) arrive();
            }
            if (moved !== p.walking) {
                p.walking = moved;
                if (!moved) sync();
            }
            if (moved) {
                syncT += dt;
                if (syncT >= SYNC_MS) { syncT = 0; sync(); }
            }
            faceTo(p.x - ox, p.y - oy, dt);
            placePlayer();
            camera();
            // 門：走進去才算；剛進場站在門裡的，要先走出來一次
            if (S.door) {
                if (inDoor(p.x, p.y)) {
                    if (doorArmed) { doorArmed = false; sync(); p.dest = null; p.path = []; if (opts.onDoor) opts.onDoor(S.door.to); if (dead) return; }
                } else doorArmed = true;
            }
            updateFocus();
        }

        // ── 搆得到的東西＋下面那排按鈕 ─────────────────
        var bar = document.createElement('div');
        bar.className = 'fw-bar';
        bar.hidden = true;
        app.appendChild(bar);
        var focus = null, focusKey = null, barActs = [];
        function targetList() { return (opts.targets && opts.targets()) || []; }
        function findTarget(key) { return targetList().find(function (t) { return t.key === key; }) || null; }
        function reachOf(t) { return t.reach || 8; }
        function d2(t) { return Math.hypot(t.x - p.x, (t.y - p.y) * ASPECT); }
        function updateFocus() {
            var list = targetList();
            var best = null, bestD = Infinity;
            // 點過去的那個優先（還搆得到的話）
            if (p.lockKey) {
                var lk = list.find(function (t) { return t.key === p.lockKey; });
                if (lk && d2(lk) <= reachOf(lk) + 2) best = lk;
                else p.lockKey = null;
            }
            if (!best) list.forEach(function (t) {
                var d = d2(t);
                if (d <= reachOf(t) && d < bestD) { bestD = d; best = t; }
            });
            var key = best ? best.key : null;
            if (key === focusKey) return;
            if (focus) { if (focus.el) focus.el.classList.remove('fw-focus'); if (focus.release) focus.release(); }
            focus = best; focusKey = key;
            if (focus) { if (focus.el) focus.el.classList.add('fw-focus'); if (focus.hold) focus.hold(); }
            renderBar();
        }
        function renderBar() {
            if (!focus) { bar.hidden = true; barActs = []; return; }
            var t = findTarget(focusKey) || focus;
            barActs = (t.actions ? t.actions() : []) || [];
            var info = t.info ? t.info() : '';
            bar.innerHTML = '<div class="fw-bar-head"><strong>' + esc(t.title ? t.title() : '') + '</strong>' + (info ? '<span>' + esc(info) + '</span>' : '') + '</div>' +
                '<div class="fw-bar-acts">' + barActs.map(function (a, i) {
                    return '<button type="button" data-i="' + i + '"' + (a.disabled ? ' disabled' : '') + (a.cls ? ' class="' + a.cls + '"' : '') + '>' +
                        '<kbd>' + (i === 0 ? 'E' : i + 1) + '</kbd><i class="fa-solid ' + (a.icon || 'fa-hand') + '"></i><span>' + esc(a.label) + '</span>' +
                        (a.sub != null ? '<small>' + esc(a.sub) + '</small>' : '') + '</button>';
                }).join('') + '</div>';
            bar.hidden = false;
            placeBar();
        }
        // 小窗浮在那個東西頭上（照星露谷、大廳那種：點哪個、窗就出在哪個上面），尾巴指著它；
        // 上面放不下（被上面那排資訊擋到）就放到它下面。每一格畫面都跟著它（動物會走、鏡頭會動）。
        var TOP_SAFE = 58;
        function placeBar() {
            if (!bar || bar.hidden || !focus) return;
            var t = findTarget(focusKey) || focus;
            var a = app.getBoundingClientRect();
            var anchor = t.anchor ? t.anchor() : t.el;
            var r = anchor && anchor.isConnected ? anchor.getBoundingClientRect() : null;
            var cx, top, bottom;
            if (r && r.width) { cx = r.left + r.width / 2 - a.left; top = r.top - a.top; bottom = r.bottom - a.top; }
            else {
                var wr = world.getBoundingClientRect();
                cx = wr.left - a.left + t.x / 100 * wr.width;
                bottom = wr.top - a.top + t.y / 100 * wr.height;
                top = bottom - wr.width * .05;
            }
            var bw = bar.offsetWidth, bh = bar.offsetHeight, pad = 8, gap = 12;
            var left = clamp(cx - bw / 2, pad, app.clientWidth - bw - pad);
            var y = top - bh - gap, below = false;
            if (y < TOP_SAFE) { y = bottom + gap; below = true; }
            y = clamp(y, TOP_SAFE, app.clientHeight - bh - pad);
            // 位置走 transform（見開頭 🚨）；尾巴位置、上下翻面很少變，變了才寫
            var tf = 'translate(' + Math.round(left) + 'px,' + Math.round(y) + 'px)';
            if (drawn.bar !== tf) { bar.style.transform = tf; drawn.bar = tf; }
            var tail = Math.round(clamp(cx - left, 16, bw - 16)) + 'px';
            if (drawn.tail !== tail) { bar.style.setProperty('--tail', tail); drawn.tail = tail; }
            if (drawn.below !== below) { bar.classList.toggle('is-below', below); drawn.below = below; }
        }
        bar.addEventListener('click', function (e) {
            e.stopPropagation();
            var b = e.target.closest('button[data-i]');
            if (b && !b.disabled) runAction(Number(b.getAttribute('data-i')));
        });
        function runAction(i) {
            if (!focus) return false;
            var a = barActs[i];
            if (!a) return false;
            if (a.disabled) { if (a.why && opts.toast) opts.toast(a.why); return true; }
            sync();   // 先把走到這裡的路算進去，再判斷搆不搆得到
            var out = a.run();
            doing(a.icon);
            if (out && out.message && opts.toast) opts.toast(out.message);
            if (out && out.ok) cheer();
            if (opts.onChange) opts.onChange();
            return true;
        }
        var doingTimer = 0;
        function doing(icon) {
            doingEl.innerHTML = '<i class="fa-solid ' + (icon || 'fa-hand') + '"></i>';
            el.classList.add('is-doing');
            clearTimeout(doingTimer);
            doingTimer = setTimeout(function () { el.classList.remove('is-doing'); }, 600);
        }

        // ── 給外面用：走到某個東西旁邊／某一點 ─────────
        function approach(key, cb) {
            var t = findTarget(key);
            if (!t) return false;
            var s = t.stand ? t.stand() : { x: t.x, y: t.y };
            setDest(s.x, s.y, key, cb);
            return true;
        }
        function walkTo(x, y, cb) { setDest(x, y, null, cb); }

        // ── 主迴圈 ───────────────────────────────────
        var last = performance.now(), raf = 0;
        // 落後多少就分幾小步補回來（一步最多 60 毫秒，免得一步跨太遠穿過東西）；最多補 2 秒。
        // 預覽窗在背景、手機切出去再回來時，瀏覽器會把畫面更新壓得很慢，只補 60 毫秒的話小人會走得像烏龜。
        // 🚨 拆掉之後（換場景、關掉）一律不再走：走進門那一格會在 step 裡當場換場景＝拆掉自己，
        //    拆完 tick 還會替自己排下一格——沒有這個旗標，舊場景的小人就在背景一直走、把位置寫回舊的那一區
        var dead = false;
        function advance(now) {
            var left = Math.min(2000, now - last);
            last = now;
            while (left > 0 && !dead) { step(Math.min(60, left)); left -= 60; }
        }
        function tick(now) {
            if (dead) return;
            advance(now);
            if (!dead) raf = requestAnimationFrame(tick);
        }
        layout();
        placePlayer();
        renderHand();
        raf = requestAnimationFrame(tick);
        // 預覽窗藏起來時 rAF 不跑：用計時器補（位置照樣會前進）
        var backup = setInterval(function () {
            var now = performance.now();
            if (!dead && now - last > 200) advance(now);
        }, 100);

        return {
            refresh: function () { renderHand(); placePlayer(); renderBar(); },
            approach: approach,
            walkTo: walkTo,
            pos: function () { return { x: p.x, y: p.y }; },
            focusKey: function () { return focusKey; },
            busy: function () { return !!p.dest; },
            teleport: function (x, y) { p.x = x; p.y = y; p.dest = null; p.cb = null; p.path = []; placePlayer(); camera(); },
            sync: sync,
            happy: cheer,
            doing: doing,
            layout: layout,
            // 關掉農場、換到另一區時叫：迴圈、計時器、全域監聽全部收掉（畫面元素跟著整個場景一起丟）
            destroy: function () {
                dead = true;
                cancelAnimationFrame(raf); clearInterval(backup); clearTimeout(doingTimer); clearTimeout(cheerTimer);
                window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
                window.removeEventListener('blur', onBlur); window.removeEventListener('resize', layout);
                if (focus && focus.release) focus.release();
                keys = {};
            }
        };
    }

    window.FarmWalkStage = { create: create, planner: planner, measureFootPad: measureFootPad, BODY_H: BODY_H, SPEED: SPEED };
})();
