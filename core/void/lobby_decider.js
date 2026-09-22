// [檔案] lobby_decider.js — 大廳裡「自己決定下一步」的 NPC（2026-09-23 自 lobby_stage.js 拆出）
// 職責：書咖的丹（帶 decider:true 的 NPC）站著倒數，時間到就問 NPC_DECIDE（npc_decide.js）接下來做什麼，
//       照答案挑一個目的地、找路走過去；小劇場抓到他就走去對方旁邊；她跟他說話時給一行「他此刻在店裡的狀況」；
//       大廳設置→選項最下面那三格也在這裡。
// 拆出來的原因：她要這塊能整支拿掉。拿掉這支檔，大廳照常，丹回到以前那樣站著不動
//   （lobby_stage 裡只剩「有 LobbyDecider 就交給它」那幾行，全部是 ?. 呼叫）。
// 靠 LobbyStage._b 拆檔橋借核心狀態與工具 → 載入順序必須排在 lobby_stage.js 後面。
(function () {
    'use strict';
    const LS = window.LobbyStage;
    if (!LS || !LS._b) { console.warn('[LobbyDecider] LobbyStage 還沒載入，略過'); return; }
    const _b = LS._b;
    const S = _b.S;

    // ── 🎲 自己決定下一步的 NPC（書咖的丹）──────────────────
    //    站著的時候倒數，時間到就問 NPC_DECIDE「接下來做什麼」，照答案挑一個目的地走過去；
    //    走到了（或撞到走不過去）就再站一會兒，然後再問。分頁在背景時不問（省錢）。
    //    家具位置照擺設讀（她在擺設模式挪了書櫃，去書櫃的點跟著挪）。
    const DEC_ACTIONS = {
        approach_player: '走到玩家身邊',
        go_table: '走到一張桌子旁邊待著',
        go_shelf: '走去書櫃前看書',
        wander: '在店裡隨意走走',
        leave: '離開書咖',
    };
    const DEC_LEAVE_AFTER_MS = 5 * 60 * 1000;   // 進店滿五分鐘才把「離開」放進選項，免得一進門就走
    // 開關直接讀存檔（跟 npc_decide.js 的 isOn、lobby_npcs.js 刷人那裡同一格），不等 npc_decide.js 載好：大廳可能比它先建出來
    function _decOn() { try { return localStorage.getItem('npc_decide_on') !== '0'; } catch (e) { return true; } }
    // 她放置不管（常常幾個小時）時不問：5 分鐘沒碰滑鼠／鍵盤／觸控就停在原地，一碰就接著想。
    //   視窗縮小或切走本來就不問（document.hidden），這條管的是「視窗開在螢幕上、人不在」。
    const DEC_IDLE_MS = 5 * 60 * 1000;
    // 多久想一次＝她在大廳設置填的分鐘數（跟微信「他會主動找我」多久來一次同一種格子），預設 3 分鐘
    const DEC_MINS_MIN = 1, DEC_MINS_MAX = 1440;
    function _decMins() {
        let m = 3;
        try { const v = parseInt(localStorage.getItem('npc_decide_mins'), 10); if (isFinite(v)) m = v; } catch (e) {}
        return Math.max(DEC_MINS_MIN, Math.min(DEC_MINS_MAX, m));
    }
    let _decLastInput = Date.now();
    ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
        document.addEventListener(ev, () => { _decLastInput = Date.now(); }, { passive: true, capture: true }));
    // 走路用的身體寬度：取「她的小人」和「他自己」比較窄的那個。寬度是照各自的圖量的，
    //   換過裝的 NPC 常比她寬，她擠得過的桌椅縫他過不去 → 在她擺的書咖裡出生就被圍死（09-23 她實測卡住）。
    //   她走得過的地方他就要走得過。
    function _decHw(n) {
        const ph = S.player && S.player.hw;
        return ph ? Math.min(n.hw || ph, ph) : n.hw;
    }
    function _decObjs(word) {
        const CFG = _b.CFG;
        return ((CFG && CFG.layout) || []).filter(o => o && o.file && o.file.indexOf(word) >= 0 && !o.plot && !o.plotFrame);
    }
    function _decSpotBelow(o) {
        const fr = _b.footRect(o);
        return _b.findFreeSpot(fr.x + fr.w / 2 + (Math.random() - 0.5) * fr.w * 0.5, fr.y + fr.h + 26);
    }
    function _decActions(n, D) {
        const CFG = _b.CFG;
        const A = Object.assign({}, DEC_ACTIONS);
        if (!_decObjs('obj_table').length) delete A.go_table;
        if (!_decObjs('obj_shelf').length) delete A.go_shelf;
        if (!S.player) delete A.approach_player;
        if (!(CFG && CFG.doors && CFG.doors.length) || Date.now() - D.bornAt < DEC_LEAVE_AFTER_MS) delete A.leave;
        return A;
    }
    function _decDistWord(a, b) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        return d < 140 ? '就在旁邊' : d < 420 ? '幾步外' : '在店的另一頭';
    }
    function _decPersonaBrief(n) {
        const t = String(n.personaFull || '');
        const i = t.indexOf('行為：');
        const s = i >= 0 ? t.slice(i + 3) : '';
        const cut = s.split('。').slice(0, 2).join('。');
        return (cut ? cut + '。' : '') || n.subTitle || '';
    }
    function _decState(n, D) {
        const now = new Date();
        const hh = now.getHours(), mm = String(now.getMinutes()).padStart(2, '0');
        const p = S.player;
        const others = S.npcs.filter(o => o !== n && o.name).map(o => o.name + '（' + _decDistWord(n, o) + '）');
        const H = _b.SCENE_HEADER;
        return {
            name: n.name,
            personality: _decPersonaBrief(n),
            place: (H[S.scene] && H[S.scene].badge) || S.scene,
            place_detail: '有書櫃、幾組桌椅、沙發和點心櫃檯的咖啡書店',
            time: hh + ':' + mm + '（' + (_b.isNightNow() ? '晚上' : '白天') + '）',
            minutes_in_shop: Math.round((Date.now() - D.bornAt) / 60000),
            mood: D.mood || '還不知道',
            last_action: D.last === 'chat' ? ('剛跟' + (D.chatName || '別人') + '聊完天') : D.last ? DEC_ACTIONS[D.last] : '剛走進店裡',
            player: p ? {
                distance: _decDistWord(n, p),
                doing: S.talkTarget ? ('正在跟' + (S.talkTarget.name || '別人') + '說話') : (p.walking ? '在走動' : '站著'),
            } : null,
            nearby: others,
        };
    }
    function _decApply(n, D, r) {
        D.last = r.action;
        if (r.mood) D.mood = r.mood;
        if (r.talk != null) D.talk = r.talk;
        D.facePlayer = false; D.leaving = false; n.dest = null;
        // 下一次想＝她填的分鐘數，上下晃兩成免得像鬧鐘（走到那裡的時間不算在裡面）
        D.waitT = _decMins() * 60000 * (0.8 + Math.random() * 0.4);
        let t = null;
        if (r.action === 'approach_player' && S.player) {
            const p = S.player, ang = Math.atan2(n.y - p.y, n.x - p.x);
            t = _b.findFreeSpot(p.x + Math.cos(ang) * 80, p.y + Math.sin(ang) * 40);
            D.facePlayer = true;
        } else if (r.action === 'go_table') {
            const ts = _decObjs('obj_table'); t = _decSpotBelow(ts[Math.floor(Math.random() * ts.length)]);
        } else if (r.action === 'go_shelf') {
            t = _decSpotBelow(_decObjs('obj_shelf')[0]);
        } else if (r.action === 'wander') {
            const R = n.homeRect;
            if (R) t = _b.findFreeSpot(R.x + Math.random() * R.w, R.y + Math.random() * R.h);
        } else if (r.action === 'leave') {
            const dr = _b.CFG.doors[0];
            t = { x: dr.x + dr.w / 2, y: dr.y + dr.h / 2 }; D.leaving = true;
        }
        if (t) {
            D.goal = t; D.replans = 0;
            D.path = _decPath(n, t);
            n.dest = D.path.shift() || null; D.walkT = 0;
        }
    }
    // 找路：直直走會被桌椅擋住就放棄，所以先在 16px 的格子上找一條走得通的路，
    //   再把路上「直線看得到」的點省掉，只留轉彎處。目的地走不到就停在找得到的最近那格。
    function _decPath(n, t) {
        const C = 16, W = Math.ceil(_b.MAP_W / C), H = Math.ceil(_b.MAP_H / C), hw = _decHw(n);
        const sx = Math.round(n.x / C), sy = Math.round(n.y / C);
        const tx = Math.round(t.x / C), ty = Math.round(t.y / C);
        const inMap = (cx, cy) => cx >= 0 && cy >= 0 && cx < W && cy < H;
        const free = new Int8Array(W * H);   // 0=還沒量 1=能走 2=擋住
        const ok = (cx, cy) => {
            const i = cy * W + cx;
            if (!free[i]) free[i] = _b.blocked(cx * C, cy * C, hw) ? 2 : 1;
            return free[i] === 1;
        };
        const prev = new Int32Array(W * H).fill(-1);
        const start = sy * W + sx;
        if (!inMap(sx, sy) || !inMap(tx, ty)) return [t];
        prev[start] = start;
        const q = [start];
        let best = start, bestD = Infinity;
        const NB = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        for (let h = 0; h < q.length; h++) {
            const i = q[h], cx = i % W, cy = (i - cx) / W;
            const dd = Math.abs(cx - tx) + Math.abs(cy - ty);
            if (dd < bestD) { bestD = dd; best = i; }
            if (dd === 0) break;
            for (const [dx, dy] of NB) {
                const nx = cx + dx, ny = cy + dy;
                if (!inMap(nx, ny)) continue;
                const j = ny * W + nx;
                if (prev[j] !== -1 || !ok(nx, ny)) continue;
                if (dx && dy && !(ok(cx + dx, cy) && ok(cx, cy + dy))) continue;   // 斜著走不准擦過桌角
                prev[j] = i; q.push(j);
            }
        }
        const cells = [];
        for (let i = best; i !== start; i = prev[i]) cells.push(i);
        cells.reverse();
        const pts = cells.map(i => ({ x: (i % W) * C, y: Math.floor(i / W) * C }));
        if (best === ty * W + tx) pts[pts.length - 1] = { x: t.x, y: t.y };   // 走得到就停在真正的目的地
        const out = [];
        let from = { x: n.x, y: n.y }, k = 0;
        while (k < pts.length) {
            let far = k;
            for (let m = pts.length - 1; m > k; m--) { if (!_b.blockedPath(from.x, from.y, pts[m].x, pts[m].y, hw)) { far = m; break; } }
            out.push(pts[far]); from = pts[far]; k = far + 1;
        }
        return out;
    }
    function _decAsk(n, D) {
        D.busy = true;
        const scene = S.scene;
        window.NPC_DECIDE.decide(_decState(n, D), _decActions(n, D))
            .then(r => { if (S.scene === scene && S.npcs.indexOf(n) >= 0 && !D.chatWith) _decApply(n, D, r); })   // 問到一半被小劇場抓走→這次答案作廢
            // 沒決定成（Jev 沒回應又關了副模型頂替、或副模型也失敗）→ 站著，照她填的時間之後再試
            .catch(e => { console.warn('[NPC決策] 這次沒決定成', e); D.waitT = _decMins() * 60000; })
            .finally(() => { D.busy = false; });
    }
    // 跟他說話時帶一行「他此刻在店裡的狀況」：不帶的話，他自己走到她旁邊、她一開口，他會當成是她來找他；
    //   剛跟瀅瀅聊完、剛在書櫃前翻書也都不知道。只帶現在這一刻，不帶整份走動紀錄（會變流水帳）。
    //   寫給模型看的：「對方」＝【對話對象】那一段寫的人。
    const DEC_WHERE = {
        approach_player: '對方身邊', go_table: '一張桌子旁邊', go_shelf: '書櫃前', wander: '店裡', leave: '門口',
    };
    function _decTalkCtx(n) {
        const D = n && n.decider && n._dec;
        if (!D) return '';
        const lines = [];
        const H = _b.SCENE_HEADER;
        const place = (H[S.scene] && H[S.scene].badge) || '店裡';
        if (D.chatWith) lines.push('你正站在' + (D.chatWith.name || '別人') + '旁邊跟對方聊天。');
        else if (D.last === 'chat') lines.push('你剛跟' + (D.chatName || '別人') + '聊完天。');
        else if (D.last === 'approach_player') lines.push(n.dest ? '你正自己走向對方。' : '是你自己走到對方身邊的，不是對方來找你。');
        else if (D.last) lines.push(n.dest ? ('你正走向' + (DEC_WHERE[D.last] || '店裡某處') + '。') : ('你在' + place + '的' + (DEC_WHERE[D.last] || '店裡') + '，剛才' + DEC_ACTIONS[D.last] + '。'));
        else lines.push('你剛走進' + place + '。');
        if (D.mood) lines.push('你現在的心情：' + D.mood + '。');
        return lines.join('');
    }
    function _decRemove(n) {
        [n.el, n.tag, n.hint].forEach(el => { try { el && el.remove(); } catch (e) {} });
        const i = S.npcs.indexOf(n); if (i >= 0) S.npcs.splice(i, 1);
        const f = S.followers.indexOf(n); if (f >= 0) S.followers.splice(f, 1);
    }
    function _deciderStep(n, dt) {
        if (!n._dec) {
            // 客人是在出沒框裡隨機刷的，框角會超出店的可走範圍（書咖右下角就是牆外）；站著的客人看不出來，
            // 要走路的一出生卡在牆外，每一步都被擋 → 先挪回最近的地板
            if (_b.blocked(n.x, n.y, _decHw(n))) { const sp = _b.findFreeSpot(n.x, n.y); n.x = sp.x; n.y = sp.y; }
            // 刷在家具圍起來的小角落（走不到她那裡）→ 改放到她旁邊的空地
            if (S.player) {
                const pth = _decPath(n, S.player), end = pth[pth.length - 1] || n;
                if (Math.hypot(end.x - S.player.x, end.y - S.player.y) > 60) {
                    const sp = _b.findFreeSpot(S.player.x + (Math.random() < 0.5 ? -1 : 1) * 110, S.player.y);
                    n.x = sp.x; n.y = sp.y;
                }
            }
        }
        const D = n._dec || (n._dec = { waitT: 2500 + Math.random() * 2500, bornAt: Date.now(), busy: false });
        // 🎭 小劇場把他跟別人配成一對：走到對方旁邊、面對面站著，等她點泡泡偷聽完（散場）才回去自己決定
        const T = S.theater;
        const partner = (n._theaterFrozen && T) ? (T.a === n ? T.b : T.a) : null;
        if (partner && D.chatWith !== partner) {
            D.chatWith = partner; D.facePlayer = false; D.leaving = false;
            const side = n.x < partner.x ? -1 : 1;   // 站在對方靠自己這一側
            const t = _b.findFreeSpot(partner.x + side * 70, partner.y);
            D.goal = t; D.replans = 0; D.walkT = 0;
            D.path = _decPath(n, t);
            n.dest = D.path.shift() || null;
        } else if (!partner && D.chatWith) {
            D.last = 'chat'; D.chatName = D.chatWith.name; D.chatWith = null;
            D.waitT = 3000 + Math.random() * 3000;
        }
        const WF = _b.WALK_FRAMES, WMS = _b.WALK_FRAME_MS;
        if (n.dest) {
            const vx = n.dest.x - n.x, vy = n.dest.y - n.y, d = Math.hypot(vx, vy);
            D.walkT = (D.walkT || 0) + dt;
            if (D.path && D.path.length && (d < 6 || (d < 14 && !_b.blockedPath(n.x, n.y, D.path[0].x, D.path[0].y, _decHw(n))))) { n.dest = D.path.shift(); _b.placeActor(n); _b.placeNpcExtras(n); _b.npcNearCheck(n); return; }   // 到了轉彎處，換下一段
            const body = { x: n.x, y: n.y, hw: _decHw(n) };
            const moved = d >= 6 && D.walkT < 25000 && _b.slideMove(body, vx / d, vy / d, Math.min(d, 0.12 * dt));
            if (moved) { n.x = body.x; n.y = body.y; }
            if (moved) {
                n.walking = true;
                if (n.sheet) {
                    n.dir = Math.abs(vx) >= Math.abs(vy) ? (vx < 0 ? 1 : 2) : (vy < 0 ? 3 : 0);
                    n.animT = (n.animT || 0) + dt;
                    n.frame = WF[Math.floor(n.animT / WMS) % WF.length];
                } else if (vx) n.flip = vx > 0;
            } else if (d >= 6 && D.goal && (D.replans || 0) < 2 && D.walkT < 25000) {   // 半路被桌角卡住：從現在的位置重找一次路
                D.replans = (D.replans || 0) + 1;
                D.path = _decPath(n, D.goal);
                n.dest = D.path.shift() || null;
            } else {   // 到了，或重找兩次還是卡住（25 秒還沒到也算），就地停下
                n.dest = null; n.walking = false; D.path = null;
                if (n.sheet) { n.frame = 1; n.animT = 0; }
                if (D.leaving && S.talkTarget !== n) { _decRemove(n); return; }
            }
        } else {
            n.walking = false;
            const face = D.chatWith || (D.facePlayer && S.player);
            if (face) {
                const vx = face.x - n.x, vy = face.y - n.y;
                if (n.sheet) { n.dir = Math.abs(vx) >= Math.abs(vy) ? (vx < 0 ? 1 : 2) : (vy < 0 ? 3 : 0); n.frame = 1; }
                else if (vx) n.flip = vx > 0;
            }
            if (!D.chatWith) D.waitT -= dt;   // 聊天中不想下一步
            if (D.waitT <= 0 && !D.chatWith && !D.busy && !document.hidden && window.NPC_DECIDE
                && Date.now() - _decLastInput < DEC_IDLE_MS) _decAsk(n, D);   // 還沒載好就先站著，載好下一幀就問
        }
        _b.placeActor(n); _b.placeNpcExtras(n); _b.npcNearCheck(n);
    }

    // ── 大廳設置→選項最下面三格（lobby_stage 的設置頁有這支才畫、才綁）──
    const _help = (k) => (window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn(k) : '';
    if (window.AUI && window.AUI.registerHelp) window.AUI.registerHelp({
        lset_npcdec: { title: '書咖的丹自己決定去哪', body: '打開以後，每次進書咖丹都會在，而且會自己走動：站一會兒就決定下一步，可能走去書櫃、走到桌子旁、走過來找你、在店裡晃，或待在原地；待滿五分鐘後也可能離開書咖。\n\n關掉就跟以前一樣，偶爾出現、站著不動。\n\n切換後會重新進一次這個地方。' },
        lset_npckey: { title: '決策模型鑰匙', body: '填 Vercel AI Gateway 的鑰匙，丹就用決策模型 Jev 決定下一步，一次不到台幣 0.001 元。多久想一次照下面那格填的分鐘數。\n\n沒填，或那一次 Jev 沒回應時怎麼辦，看下面「Jev 不能用時改問副模型」那格。\n\n你 5 分鐘沒碰滑鼠、鍵盤或螢幕，他就停在原地不想；一碰就繼續。視窗縮小或切走時也不想。\n\n鑰匙只存在這台裝置上，電腦和手機要各填一次。' },
        lset_npcfb: { title: 'Jev 不能用時改問副模型', body: '沒填鑰匙、額度用完（例如你在 Vercel 設的每月上限到了，或 Jev 漲價用得比較快）、或那一次 Jev 沒回應時：\n\n打開＝丹改問你的副模型，照樣會走。每一次都是一通正常的副模型呼叫，算在你副模型那邊的帳上。\n\n關掉＝丹就站在原地，照「多久想一次」的時間之後再試 Jev，不會花副模型的錢。\n\n這格只存在這台裝置上。' },
    });
    function settingsHtml() {
        const ND = window.NPC_DECIDE;
        return '<label class="lset-row"><span class="lset-tx">書咖的丹自己決定去哪' + _help('lset_npcdec') + '</span>' +
              '<input type="checkbox" class="lset-chk lset-npcdec" data-k="npcdec"' + (_decOn() ? ' checked' : '') + '></label>' +
            '<div class="lset-row"><span class="lset-tx">決策模型鑰匙' + _help('lset_npckey') + '</span>' +
              '<input type="password" class="lset-key" autocomplete="off" placeholder="貼上鑰匙" value="' + String(ND ? ND.getKey() : '').replace(/[&"<>]/g, '') + '"></div>' +
            '<label class="lset-row"><span class="lset-tx">Jev 不能用時改問副模型' + _help('lset_npcfb') + '</span>' +
              '<input type="checkbox" class="lset-chk lset-npcfb" data-k="npcfb"' + (!ND || ND.getFallback() ? ' checked' : '') + '></label>' +
            '<div class="lset-row"><span class="lset-tx">多久想一次下一步</span>' +
              '<span class="lset-numwrap"><input type="number" class="lset-num" inputmode="numeric" min="' + DEC_MINS_MIN + '" max="' + DEC_MINS_MAX + '" step="1" value="' + _decMins() + '">' +
              '<span class="lset-unit">分鐘</span></span></div>';
    }
    function bindSettings(box) {
        box.querySelector('.lset-npcdec')?.addEventListener('change', (e) => {
            try { localStorage.setItem('npc_decide_on', e.target.checked ? '1' : '0'); } catch (_) {}
            if (S.scene === 'cafe') _b.remount();
        });
        box.querySelector('.lset-key')?.addEventListener('input', (e) => { window.NPC_DECIDE?.setKey(e.target.value); });
        box.querySelector('.lset-npcfb')?.addEventListener('change', (e) => { window.NPC_DECIDE?.setFallback(e.target.checked); });
        box.querySelector('.lset-num')?.addEventListener('change', (e) => {
            const v = Math.max(DEC_MINS_MIN, Math.min(DEC_MINS_MAX, parseInt(e.target.value, 10) || 3));
            e.target.value = v;
            try { localStorage.setItem('npc_decide_mins', String(v)); } catch (_) {}
            // 已經在等的那一次也跟著縮短（改長不動它，免得她改完要等很久才看到效果）
            S.npcs.forEach(n => { if (n._dec && n._dec.waitT > v * 60000) n._dec.waitT = v * 60000 * (0.8 + Math.random() * 0.4); });
        });
    }

    window.LobbyDecider = {
        // lobby_stage 主迴圈每幀每個 NPC 問一次：這個人歸我管嗎？歸我管就由我走完這一幀（回 true）
        step(n, dt) {
            if (!n || !n.decider || !_decOn()) return false;
            _deciderStep(n, dt);
            return true;
        },
        // 小劇場凍人前問：這個人要不要例外（不凍，交給 step 走過去找對方）
        exemptFromFreeze: (n) => !!(n && n.decider && _decOn()),
        talkCtx: _decTalkCtx,       // void_terminal 組人設時帶
        settingsHtml, bindSettings, // lobby_stage 的大廳設置→選項
    };
})();
