// ============================================================
// farm_walk_ui.js — 後院／牧場共用的「自己走」舞台（照大廳 lobby_stage.js 的操作）
// ------------------------------------------------------------
// 走路：方向鍵／WASD；手機左下搖桿；點地板走過去；點東西＝走到它旁邊（不會自己動手）。
// 做事：走到東西旁邊，下面冒出一排能做的事；按鈕或 E／空白鍵（第一個）、數字鍵（第幾個）。
// 鏡頭：畫面放大到小機看得清楚，跟著小機走（桌機多半整張放得下，不會動）。
// 規則全在 farm_walk_core.js（走路扣體力、搆不搆得到、手上拿什麼），這支只負責畫面；
// 走路時每 SYNC_MS 把位置交給規則算一次體力，所以她自己走和 AI 下指令扣的是同一套。
// 小機的樣子借房間的 ClawdPortrait（claude-codex-room/core/clawd_portrait.js）：跟房間同一副身體。
// ============================================================
(function () {
    'use strict';

    var MAP_W = 1672, MAP_H = 941;
    var BODY_W = 12;        // 小機的畫布佔底圖寬的 %（畫布 32×24 格，身體在中間約一半寬）
    var SPEED = 19;         // 每秒走「底圖寬」的幾 %
    var SYNC_MS = 300;
    var ZOOM_MAX = 2.4;     // 手機直拿時最多放大到「整張塞滿寬度」的幾倍
    var FEET = 22 / 24;     // 畫布裡腳底那一列

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    // opts：{ app, world, scene, state(), targets(), onChange(), onDoor(to), toast(text), body: { base, wear }, zFixed }
    function create(opts) {
        var WC = window.FarmWalkCore;
        var S = WC.SCENES[opts.scene];
        var app = opts.app, world = opts.world;
        var ASPECT = WC.ASPECT;

        app.classList.add('fw-on');
        var st = opts.state();
        // 存檔裡人在別區：從這區門口走進來（照規則扣走到門口那段）
        if (st.walk.scene !== opts.scene) {
            WC.moveTo(st, opts.scene, S.gate.x, S.gate.y);
            if (opts.onChange) opts.onChange();
        }
        var p = { x: st.walk.x, y: st.walk.y, dest: null, destKey: null, lockKey: null, walking: false, cb: null };
        // 存檔裡站在門裡（不該發生，但舊的存檔有）：放到門口外面，不然要先走出去一次門才會生效
        if (S.door && inDoor(p.x, p.y)) { p.x = S.gate.x; p.y = S.gate.y; st.walk.x = p.x; st.walk.y = p.y; }
        var doorArmed = true;

        // ── 小機 ─────────────────────────────────────
        var el = document.createElement('div');
        el.className = 'fw-player';
        el.innerHTML = '<canvas width="256" height="192"></canvas><span class="fw-hand" hidden></span><span class="fw-doing"></span>';
        world.appendChild(el);
        var canvas = el.querySelector('canvas');
        var handEl = el.querySelector('.fw-hand');
        var doingEl = el.querySelector('.fw-doing');
        var frame = 0, happyUntil = 0, drawing = false;
        function drawBody() {
            var CP = window.ClawdPortrait;
            if (!CP || !CP.renderStill) {
                // 房間那支沒載到：畫一顆圓，至少看得到人在哪
                var c = canvas.getContext('2d');
                c.clearRect(0, 0, 256, 192);
                c.fillStyle = '#28364c'; c.beginPath(); c.arc(128, 130, 44, 0, Math.PI * 2); c.fill();
                return;
            }
            if (drawing) return;
            drawing = true;
            var happy = performance.now() < happyUntil;
            var action = happy ? 'happy' : 'idle';
            var f = p.walking && !happy ? 0 : frame;
            Promise.resolve(CP.renderStill(canvas, (opts.body && opts.body.wear) || null, action, f, (opts.body && opts.body.base) || 'lorde'))
                .catch(function () {}).then(function () { drawing = false; });
        }
        var bodyTimer = setInterval(function () { frame = (frame + 1) % 16; drawBody(); }, 125);
        drawBody();

        function placePlayer() {
            el.style.setProperty('--x', p.x + '%');
            el.style.setProperty('--y', p.y + '%');
            el.style.zIndex = opts.zFixed != null ? opts.zFixed : Math.round(p.y) + 1;
            el.classList.toggle('is-walking', p.walking);
            el.classList.toggle('is-tired', (opts.state().stamina || 0) <= 0);
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
            world.style.transform = 'translate(' + Math.round(tx) + 'px,' + Math.round(ty) + 'px)';
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
            // 背包、出貨箱、結算單、看板打開時：按鍵不讓底下的小機走動或做事（方向鍵照樣攔住，不漏給酒館）
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
            WC.moveTo(st2, opts.scene, p.x, p.y);
            if (st2.stamina !== before && opts.onChange) opts.onChange();
        }
        function inDoor(x, y) { var d = S.door; return d && x > d.x1 && x < d.x2 && y > d.y1 && y < d.y2; }
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

        // ── 繞路：點地板／點東西時，先在 1%×1% 的格子上算一條避開擋路東西的路，再一段一段走 ──
        // 以前只有「撞到就沿著滑」：東西正好擋在中間時，每一格往旁邊挪一點點、永遠走不到（出貨箱第一次放上去就卡住）。
        // 門口那塊不當路走（免得繞路經過門口就換區），除非目的地就在門裡。
        var GW = 101, GRID = null;
        function grid() {
            if (GRID) return GRID;
            GRID = new Uint8Array(GW * GW);
            // 一格要連四周 0.7 都能站才算路：貼著箱子邊的格子不走，不然從格子走到格子時會擦過箱子的角被擋下來
            var M = .7;
            var ok = function (x, y) {
                return WC.walkable(opts.scene, x, y) && WC.walkable(opts.scene, x - M, y) && WC.walkable(opts.scene, x + M, y) &&
                    WC.walkable(opts.scene, x, y - M) && WC.walkable(opts.scene, x, y + M);
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
                if (!WC.walkable(opts.scene, x, y) || (!door && inDoor(x, y))) return false;
            }
            return true;
        }
        function planPath(tx, ty) {
            var door = inDoor(tx, ty), from = { x: p.x, y: p.y }, to = { x: tx, y: ty };
            if (lineClear(from, to, door)) return [to];
            var s0 = nearestCell(p.x, p.y, true), g0 = nearestCell(tx, ty, door);
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
            if (WC.walkable(opts.scene, tx, ty)) cells.push(to);
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
        function setDest(x, y, key, cb) {
            p.path = planPath(x, y);
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
            var moved = false;
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
            bar.style.setProperty('--bx', Math.round(left) + 'px');
            bar.style.setProperty('--by', Math.round(y) + 'px');
            bar.style.setProperty('--tail', clamp(cx - left, 16, bw - 16) + 'px');
            bar.classList.toggle('is-below', below);
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
            if (out && out.ok) happyUntil = performance.now() + 900;
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
        // 預覽窗在背景、手機切出去再回來時，瀏覽器會把畫面更新壓得很慢，只補 60 毫秒的話小機會走得像烏龜。
        // 🚨 拆掉之後（換場景、關掉）一律不再走：走進門那一格會在 step 裡當場換場景＝拆掉自己，
        //    拆完 tick 還會替自己排下一格——沒有這個旗標，舊場景的小機就在背景一直走、把位置寫回舊的那一區
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
            happy: function () { happyUntil = performance.now() + 900; },
            doing: doing,
            layout: layout,
            // 關掉農場、換到另一區時叫：迴圈、計時器、全域監聽全部收掉（畫面元素跟著整個場景一起丟）
            destroy: function () {
                dead = true;
                cancelAnimationFrame(raf); clearInterval(backup); clearInterval(bodyTimer); clearTimeout(doingTimer);
                window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
                window.removeEventListener('blur', onBlur); window.removeEventListener('resize', layout);
                if (focus && focus.release) focus.release();
                keys = {};
            }
        };
    }

    window.FarmWalkStage = { create: create };
})();
