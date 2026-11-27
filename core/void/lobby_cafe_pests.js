// ----------------------------------------------------------------
// [檔案] core/void/lobby_cafe_pests.js
// 職責：🐀🪳 大廳書咖畫出店況（11-25 起：老鼠、蟑螂、髒汙）。
//   照書咖存檔的 shop.hyg（os_cafe_hire.js 的 HYG：髒度 0～100、pest＝rat／roach）：
//   - 髒汙：髒度 30 起地上開始有碎屑、腳印；越髒越多，60 起有打翻的咖啡，80 起有倒掉的紙杯、揉爛的紙巾和繞著垃圾飛的蒼蠅。
//     位置照編號固定（同一塊污漬不會每次換地方），清乾淨就整片消失。
//   - 有老鼠：一兩隻在家具底邊之間竄、停下來嗅、鑽進家具底下一陣子；有蟑螂：兩三隻短距離亂爬。
//     主角走近會逃；點牠跳一行提示（去員工頁叫清潔公司）。
//   全部是向量小圖＋CSS 過場，不烤圖、不跑每幀迴圈（一隻一個計時器，換一段路才寫一次 transform）。
//   客人被嚇跑的動作不在這裡：小人的動作一律照衣櫥（之後在衣櫥加「嚇到逃跑」）。
// 依賴：window.LobbyStage._b（S、CFG、blocked）、OS_CAFE._b.get；lobby_cafe_regulars.js 的 mount 順便叫 mount(world)。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const W = window.parent || window;

    // ── 向量小圖（朝右；往左走整個翻過來）──
    const RAT = '<svg viewBox="0 0 64 32" width="100%" height="100%"><path class="lcp-tail" d="M12 21 C4 22 2 14 6 9" fill="none" stroke="#d6a3a0" stroke-width="2.2" stroke-linecap="round"/>' +
        '<ellipse cx="27" cy="20" rx="17" ry="9.5" fill="#8d857e" stroke="#4d443e" stroke-width="1.4"/><ellipse cx="29" cy="24" rx="11" ry="4" fill="#a9a199"/>' +
        '<path d="M38 13 C46 11 54 16 58 21 C54 24 46 26 40 25 Z" fill="#958d86" stroke="#4d443e" stroke-width="1.4" stroke-linejoin="round"/>' +
        '<circle cx="41" cy="11" r="5" fill="#e6b9b3" stroke="#4d443e" stroke-width="1.3"/><circle cx="41" cy="11.5" r="2.4" fill="#d09592"/>' +
        '<circle cx="49" cy="17.5" r="1.6" fill="#1f1a17"/><circle cx="58.2" cy="21" r="1.7" fill="#d98b8f"/>' +
        '<path d="M55 20 L62 17 M55 21.5 L63 21.5 M55 23 L61 25.5" stroke="#5d544e" stroke-width=".6" stroke-linecap="round"/>' +
        '<g class="lcp-legs"><ellipse cx="18" cy="29" rx="3.4" ry="1.8" fill="#d6a3a0"/><ellipse cx="36" cy="29" rx="3.4" ry="1.8" fill="#d6a3a0"/></g></svg>';
    const ROACH = '<svg viewBox="0 0 30 16" width="100%" height="100%"><g class="lcp-legs" stroke="#3d2412" stroke-width="1" stroke-linecap="round" fill="none">' +
        '<path d="M10 5 L6 1 M14 4.5 L13 0.5 M18 5 L21 1"/><path d="M10 11 L6 15 M14 11.5 L13 15.5 M18 11 L21 15"/></g>' +
        '<path d="M24 6 C27 3 28.5 1.5 29.5 0.8 M24 10 C27 13 28.5 14.5 29.5 15.2" stroke="#3d2412" stroke-width=".7" fill="none"/>' +
        '<ellipse cx="13.5" cy="8" rx="9.5" ry="4.8" fill="#6e3f1d" stroke="#3a210f" stroke-width=".9"/><path d="M5 8 L22 8" stroke="#4a2914" stroke-width=".7"/>' +
        '<ellipse cx="11" cy="6.4" rx="5" ry="1.4" fill="#9a6338" opacity=".7"/><ellipse cx="23.5" cy="8" rx="2.6" ry="2.4" fill="#3a210f"/></svg>';
    const STAIN = {
        crumbs: { w: 30, h: 12, svg: '<svg viewBox="0 0 30 12" width="100%" height="100%"><g fill="#b98d5c"><ellipse cx="4" cy="7" rx="1.8" ry="1.1"/><ellipse cx="10" cy="4" rx="1.3" ry=".9"/><ellipse cx="14" cy="9" rx="2.2" ry="1.3"/><ellipse cx="21" cy="5" rx="1.5" ry="1"/><ellipse cx="26" cy="8.5" rx="1.2" ry=".8"/></g><g fill="#8e6a43"><ellipse cx="8" cy="9.5" rx="1" ry=".7"/><ellipse cx="18" cy="6.5" rx=".9" ry=".6"/></g></svg>' },
        smudge: { w: 42, h: 16, svg: '<svg viewBox="0 0 42 16" width="100%" height="100%"><path d="M3 9 C8 3 20 4 27 6 C34 8 40 7 39 11 C37 15 22 14 14 13 C7 12 0 13 3 9 Z" fill="rgba(92,78,66,.2)"/><path d="M9 9 C15 8 24 9 31 10" stroke="rgba(80,66,55,.22)" stroke-width="2" fill="none" stroke-linecap="round"/></svg>' },
        prints: { w: 46, h: 14, svg: '<svg viewBox="0 0 46 14" width="100%" height="100%"><g fill="rgba(96,78,62,.28)"><ellipse cx="5" cy="9" rx="3.4" ry="2"/><ellipse cx="15" cy="5" rx="3.4" ry="2"/><ellipse cx="26" cy="9.5" rx="3.4" ry="2"/><ellipse cx="37" cy="5.5" rx="3.4" ry="2"/></g></svg>' },
        spill: { w: 58, h: 22, svg: '<svg viewBox="0 0 58 22" width="100%" height="100%"><path d="M5 12 C3 6 14 3 22 5 C30 2 44 3 50 8 C57 11 54 18 45 18 C38 21 26 20 19 18 C10 20 2 18 5 12 Z" fill="rgba(104,62,32,.5)"/><path d="M13 11 C17 8 28 8 36 9 C42 10 44 13 38 15 C30 16 18 16 13 11 Z" fill="rgba(140,88,48,.38)"/><ellipse cx="20" cy="9" rx="5" ry="1.4" fill="rgba(255,255,255,.28)"/><circle cx="52" cy="5" r="1.6" fill="rgba(104,62,32,.45)"/></svg>' },
        napkin: { w: 18, h: 14, svg: '<svg viewBox="0 0 18 14" width="100%" height="100%"><path d="M2 8 L4 3 L9 1.5 L14 2.5 L16.5 7 L14 12 L8 13 L3.5 11.5 Z" fill="#f3eee4" stroke="#b8ab97" stroke-width=".9" stroke-linejoin="round"/><path d="M5 5 L9 7 L12 4 M7 10 L10 8 L13 10" stroke="#c9bda9" stroke-width=".8" fill="none"/></svg>' },
        cup: { w: 38, h: 20, svg: '<svg viewBox="0 0 38 20" width="100%" height="100%"><path d="M17 14 C20 18 33 19 36 16 C38 13 30 12 25 13 Z" fill="rgba(104,62,32,.45)"/><path d="M3 6 L19 3 L21 14 L6 15 Z" fill="#faf6ee" stroke="#9d8f7c" stroke-width="1" stroke-linejoin="round"/><path d="M10 4.6 L11.6 14.6" stroke="#b98a5e" stroke-width="3"/><ellipse cx="20" cy="8.5" rx="2" ry="5.5" fill="#e9e1d3" stroke="#9d8f7c" stroke-width=".9"/></svg>' },
    };
    // 上面的寬高是向量圖的原尺寸；書咖人物縮 0.7、整個畫面又縮一半，照原尺寸畫在手機上只有幾 px，統一放大
    const STAIN_K = 2.4;
    for (const k of Object.keys(STAIN)) { STAIN[k].w *= STAIN_K; STAIN[k].h *= STAIN_K; }
    // 髒度 → 幾塊、哪幾種
    function _stainPlan(dirt) {
        if (dirt < 30) return [];
        const n = dirt < 45 ? 2 : dirt < 60 ? 4 : dirt < 80 ? 7 : 11;
        const kinds = [];
        for (let i = 0; i < n; i++) {
            if (dirt >= 80 && (i === 3 || i === 7)) kinds.push('cup');
            else if (dirt >= 80 && (i === 5 || i === 9 || i === 10)) kinds.push('napkin');
            else if (dirt >= 60 && (i === 2 || i === 6)) kinds.push('spill');
            else kinds.push(['crumbs', 'smudge', 'prints'][i % 3]);
        }
        return kinds;
    }
    // 固定亂數：同一個編號每次都同一個位置
    function _rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

    let _live = null;
    function stop() { if (_live) { _live.stop(); _live = null; } }
    function mount(world) {
        stop();
        const LS = window.LobbyStage, _b = LS && LS._b;
        const CAFE = W.OS_CAFE || window.OS_CAFE;
        if (!_b || !CAFE || !CAFE._b || !world) return false;
        const S = _b.S;
        const alive = () => S.active && S.scene === 'cafe' && S.world === world && world.isConnected;
        const stains = [], pests = [];
        let hyg = null, refT = null, pollT = null, dead = false;
        const zone = () => _b.CFG.points.npcZone || { x: 160, y: 527, w: 1346, h: 392 };
        const floorOk = (x, y) => { try { return !_b.blocked(x, y); } catch (e) { return true; } };
        // 家具底邊（老鼠蟑螂躲的地方）：吧台、櫃檯、書櫃、展示櫃、盆栽、沙發、推車的底邊中間附近
        const hides = () => {
            const out = [];
            for (const o of (_b.CFG.layout || [])) {
                if (o.layer === 'floor' || o._plotOff || !/(bar|counter|shelf|cabinet|plant|sofa|cart|console|table)_/.test(String(o.file || ''))) continue;
                const s = o.s || 1, w = o.w * s, h = o.h * s;
                const y = o.y + h + (o.zb || 0) - 4, x = o.x + w * (0.25 + Math.random() * 0.5);
                out.push({ x, y });
            }
            const Z = zone();
            return out.filter(p => p.y > Z.y - 60 && p.y < Z.y + Z.h + 40);
        };
        const el = (cls, html, w, h) => {
            const d = document.createElement('div');
            d.className = cls; d.innerHTML = html;
            d.style.width = w + 'px'; d.style.height = h + 'px';
            world.appendChild(d);
            return d;
        };
        const put = (node, x, y, w, h, z) => {
            node.style.transform = 'translate3d(' + (x - w / 2) + 'px,' + (y - h) + 'px,0)';
            if (z != null) node.style.zIndex = String(z);
        };

        // ── 髒汙 ──
        function paintStains() {
            const kinds = hyg ? _stainPlan(hyg.dirt || 0) : [];
            while (stains.length > kinds.length) { const s = stains.pop(); s.el.remove(); }
            const Z = zone();
            for (let i = 0; i < kinds.length; i++) {
                if (stains[i] && stains[i].kind === kinds[i]) continue;
                if (stains[i]) { stains[i].el.remove(); }
                const k = STAIN[kinds[i]], r = _rng(7919 * (i + 1));
                let x = 0, y = 0;
                for (let t = 0; t < 30; t++) {
                    x = Z.x + 40 + r() * (Z.w - 80); y = Z.y + 30 + r() * (Z.h - 60);
                    if (floorOk(x, y)) break;
                }
                const node = el('lcp-stain lcp-' + kinds[i], k.svg + (kinds[i] === 'cup' || kinds[i] === 'napkin' ? '<i class="lcp-fly"></i><i class="lcp-fly lcp-fly2"></i>' : ''), k.w, k.h);
                put(node, x, y + k.h / 2, k.w, k.h, 2);
                node.classList.toggle('lcp-flies', (hyg.dirt || 0) >= 80);
                stains[i] = { kind: kinds[i], el: node };
            }
            stains.forEach(s => s.el.classList.toggle('lcp-flies', !!hyg && (hyg.dirt || 0) >= 80));
        }

        // ── 老鼠、蟑螂 ──
        const SPEC = {
            rat: { n: 2, w: 84, h: 42, speed: 0.30, svg: RAT, hop: [140, 360], pause: [700, 2600], hideP: 0.3, tip: '有老鼠在店裡竄……太髒才會跑出來，去員工頁叫清潔公司吧。' },
            roach: { n: 3, w: 38, h: 20, speed: 0.16, svg: ROACH, hop: [40, 140], pause: [300, 1600], hideP: 0.2, tip: '地上有蟑螂在爬……太髒才會跑出來，去員工頁叫清潔公司吧。' },
        };
        function makePest(kind, i) {
            const sp = SPEC[kind];
            const node = el('lcp-pest lcp-' + kind, '<div class="lcp-flip">' + sp.svg + '</div>', sp.w, sp.h);
            const h0 = hides(), start = h0.length ? h0[i % h0.length] : { x: zone().x + 100, y: zone().y + 100 };
            const p = { kind, sp, el: node, x: start.x, y: start.y, t: null, hidden: true, busyUntil: 0 };
            node.style.opacity = '0';
            put(node, p.x, p.y, sp.w, sp.h, 2 + Math.round(p.y));
            node.addEventListener('click', (ev) => {
                ev.stopPropagation();
                try { (W.AUI || window.AUI).toast(sp.tip); } catch (e) {}
                flee(p, S.player || { x: p.x - 1, y: p.y });
            });
            pests.push(p);
            p.t = setTimeout(() => step(p), 400 + i * 900 + Math.random() * 1500);
            return p;
        }
        const rand = (a) => a[0] + Math.random() * (a[1] - a[0]);
        function runTo(p, x, y, fast, then) {
            const sp = p.sp, d = Math.hypot(x - p.x, y - p.y);
            const ms = Math.max(120, d / (sp.speed * (fast ? 1.8 : 1)));
            const left = x < p.x;
            p.el.classList.toggle('lcp-left', left);
            p.el.classList.add('lcp-running');
            p.el.style.transitionDuration = Math.round(ms) + 'ms';
            put(p.el, x, y, sp.w, sp.h, 2 + Math.round(Math.max(y, p.y)));   // 跑的途中照比較前面那端排，別被腳邊的家具蓋掉
            p.x = x; p.y = y; p.busyUntil = Date.now() + ms;
            clearTimeout(p.t);
            p.t = setTimeout(() => {
                if (dead) return;
                p.el.classList.remove('lcp-running');
                p.el.style.zIndex = String(2 + Math.round(y));
                then();
            }, ms);
        }
        // 往一個方向找一個地上的點（擋到就縮短）
        function pointToward(p, ang, dist) {
            const Z = zone();
            for (let t = 0; t < 8; t++) {
                const x = Math.max(Z.x, Math.min(Z.x + Z.w, p.x + Math.cos(ang) * dist)), y = Math.max(Z.y - 40, Math.min(Z.y + Z.h, p.y + Math.sin(ang) * dist * 0.6));
                if (floorOk(x, y)) return { x, y };
                ang += (Math.random() - 0.5) * 1.6; dist *= 0.75;
            }
            return null;
        }
        function step(p) {
            if (dead || !alive()) return;
            const sp = p.sp;
            if (p.hidden) {   // 從某件家具底下鑽出來
                const h = hides();
                const at = h.length ? h[Math.floor(Math.random() * h.length)] : { x: p.x, y: p.y };
                p.x = at.x; p.y = at.y;
                p.el.style.transitionDuration = '0ms';
                put(p.el, p.x, p.y, sp.w, sp.h, 2 + Math.round(p.y));
                p.el.style.opacity = '1';
                p.hidden = false;
                p.t = setTimeout(() => step(p), 300);
                return;
            }
            if (Math.random() < sp.hideP) {   // 鑽回家具底下躲一陣子
                const h = hides();
                const at = h.length ? h[Math.floor(Math.random() * h.length)] : null;
                if (at) {
                    runTo(p, at.x, at.y, false, () => {
                        p.el.style.opacity = '0'; p.hidden = true;
                        p.t = setTimeout(() => step(p), 4000 + Math.random() * 9000);
                    });
                    return;
                }
            }
            const to = pointToward(p, Math.random() * Math.PI * 2, rand(sp.hop));
            if (!to) { p.t = setTimeout(() => step(p), 800); return; }
            runTo(p, to.x, to.y, false, () => {
                p.el.classList.add('lcp-sniff');
                p.t = setTimeout(() => { p.el.classList.remove('lcp-sniff'); step(p); }, rand(sp.pause));
            });
        }
        function flee(p, from) {
            if (p.hidden || dead) return;
            const ang = Math.atan2(p.y - from.y, p.x - from.x) + (Math.random() - 0.5) * 0.8;
            const to = pointToward(p, ang, p.sp.hop[1] * 1.2);
            if (!to) return;
            p.el.classList.remove('lcp-sniff');
            runTo(p, to.x, to.y, true, () => {
                p.el.style.opacity = '0'; p.hidden = true;   // 逃掉就躲起來
                p.t = setTimeout(() => step(p), 5000 + Math.random() * 8000);
            });
        }
        function syncPests() {
            const kind = hyg && hyg.pest && SPEC[hyg.pest] ? hyg.pest : null;
            for (let i = pests.length - 1; i >= 0; i--) {
                if (pests[i].kind === kind) continue;
                clearTimeout(pests[i].t); pests[i].el.remove(); pests.splice(i, 1);
            }
            if (!kind) return;
            const want = SPEC[kind].n;
            for (let i = pests.length; i < want; i++) makePest(kind, i);
        }
        // 主角走近：還在外面、沒在跑的逃走
        function poll() {
            if (!alive()) { stopAll(); return; }
            const pl = S.player;
            if (!pl || !pests.length) return;
            const now = Date.now();
            for (const p of pests) if (!p.hidden && now > p.busyUntil && Math.hypot(pl.x - p.x, pl.y - p.y) < (p.kind === 'rat' ? 150 : 90)) flee(p, pl);
        }
        async function refresh() {
            if (!alive()) { stopAll(); return; }
            let h = null;
            try { const shop = await CAFE._b.get('shop', null); h = shop && shop.hyg ? shop.hyg : null; } catch (e) {}
            if (dead || !alive()) return;
            hyg = h;
            paintStains();
            syncPests();
        }
        function stopAll() {
            if (dead) return;
            dead = true;
            clearInterval(refT); clearInterval(pollT);
            pests.forEach(p => { clearTimeout(p.t); p.el.remove(); });
            stains.forEach(s => s.el.remove());
            pests.length = 0; stains.length = 0;
        }
        refT = setInterval(refresh, 30000);
        pollT = setInterval(poll, 500);
        refresh();
        _live = { stop: stopAll, refresh, pests, stains, hyg: () => hyg };
        return true;
    }

    window.LobbyCafePests = {
        mount, stop,
        refresh: () => { if (_live) _live.refresh(); },   // 書咖叫完清潔公司馬上換畫面
        _live: () => _live,   // console 診斷用
    };
})();
