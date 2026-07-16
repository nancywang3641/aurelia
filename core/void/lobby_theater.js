// ----------------------------------------------------------------
// [檔案] lobby_theater.js — 大廳 NPC 環境小劇場（2026-07-16 自 lobby_stage.js 拆出）
// 職責：配對事件（純視覺零 API）→ 頭頂泡泡/右上「小劇場」窗口（正在對話/回顧）
//       → 查看=偷窺 Loading 遮罩（視覺分身演出，不動地圖 NPC）→ VoidTerminal.playDuoScene 生成接 VN。
// 依賴：window.LobbyStage._b 橋（S 狀態/placeActor/場景表/窗口互斥登記）；載入順序必須在 lobby_stage.js 之後。
// 呈現分流接口 _presentTheater(mode)：現只 'overlay'；未來 'world'（NPC 尋路集合）/'auto' 從這裡分流、失敗退 overlay。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const LS = window.LobbyStage;
    if (!LS || !LS._b) { console.warn('[LobbyTheater] LobbyStage 橋不存在，小劇場停用'); return; }
    const _b = LS._b;
    const S = _b.S;

    // ── 🎬 小劇場窗口（右上按鈕/頭頂泡泡進入；「正在對話」=當前配對、「回顧」=記事，含編輯/刪除/重壓縮/清空）──
    function _thl() { const vt = window.VoidTerminal || (window.parent || window).VoidTerminal; return vt && vt.theaterLog; }
    function _thlTime(ts) {
        if (!ts) return '';
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60) return '剛剛';
        const m = Math.floor(s / 60); if (m < 60) return m + ' 分前';
        const h = Math.floor(m / 60); if (h < 24) return h + ' 時前';
        return Math.floor(h / 24) + ' 天前';
    }
    function _closeTheaterWin() { S.twEl?.remove(); S.twEl = null; }
    // 角色視覺分身（不掛地圖、不碰真 NPC）：走路圖取中幀、單張立姿整張。facing: 'front'|'left'|'right'
    function _actorCloneEl(n, h, facing) {
        if (n && n.sheet && n.el) {
            const ratio = (n.frameW && n.frameH) ? n.frameW / n.frameH : 0.8;
            const w = Math.round(h * ratio);
            const d = document.createElement('div');
            d.className = 'ltov-clone';
            d.style.width = w + 'px'; d.style.height = h + 'px';
            d.style.backgroundImage = n.el.style.backgroundImage;
            d.style.backgroundSize = (w * 3) + 'px ' + (h * 4) + 'px';
            const dir = facing === 'left' ? 1 : (facing === 'right' ? 2 : 0);   // 3×4 列序：0下 1左 2右 3上
            d.style.backgroundPosition = (-1 * w) + 'px ' + (-dir * h) + 'px';   // 中幀=立定
            return d;
        }
        const img = document.createElement('img');
        img.className = 'ltov-clone';
        img.style.height = h + 'px';
        img.src = (n && n.el && n.el.src) || (n && typeof n.defaultSrc === 'string' ? n.defaultSrc : '');
        if (facing === 'right') img.classList.add('flip');   // 單張立姿原圖朝左，朝右=鏡像（同 placeActor flip）
        return img;
    }
    // 方形小頭像：小框裁分身上半身（頭在框頂）
    function _actorMiniEl(n) {
        const box = document.createElement('div');
        box.className = 'ltw-ava';
        const inner = _actorCloneEl(n, 74, 'front');
        inner.classList.add('ltw-ava-img');
        box.appendChild(inner);
        return box;
    }
    function _twRender() {
        const box = S.twEl; if (!box) return;
        box.querySelectorAll('.ltw-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === S.twTab));
        const body = box.querySelector('.ltw-body');
        body.innerHTML = '';
        if (S.twTab === 'live') _renderTwLive(body); else _renderTwReview(body);
    }
    function _renderTwLive(body) {
        const t = S.theater;
        if (!t || t.playing) {
            const d = document.createElement('div'); d.className = 'lsh-empty';
            d.textContent = t ? '正在偷窺中……' : '現在沒有人湊在一起聊天';
            const hint = document.createElement('div'); hint.className = 'ltw-hint';
            hint.textContent = '兩位角色偶爾會湊在一起閒聊，出現時這裡會亮起。';
            body.append(d, hint);
            return;
        }
        const sub = document.createElement('div'); sub.className = 'ltw-sub'; sub.textContent = '1 組未查看';
        const card = document.createElement('div'); card.className = 'ltw-card';
        const row = document.createElement('div'); row.className = 'ltw-pairrow';
        row.append(_actorMiniEl(t.a), _actorMiniEl(t.b));
        const info = document.createElement('div'); info.className = 'ltw-info';
        const name = document.createElement('div'); name.className = 'ltw-name';
        name.textContent = t.a.name + ' 和 ' + t.b.name;
        const loc = document.createElement('div'); loc.className = 'ltw-loc';
        loc.innerHTML = '<i class="fa-solid fa-location-dot"></i> ';
        loc.append(document.createTextNode((_b.SCENE_HEADER[S.scene] || {}).badge || ''));
        const desc = document.createElement('div'); desc.className = 'ltw-desc'; desc.textContent = '似乎正在談論某件事……';
        info.append(name, loc, desc);
        row.appendChild(info);
        const watch = document.createElement('button');
        watch.className = 'lep-btn lep-done ltw-watch';
        watch.innerHTML = '<i class="fa-solid fa-eye"></i> 查看';
        watch.addEventListener('click', () => { _closeTheaterWin(); _presentTheater(); });
        card.append(row, watch);
        const note = document.createElement('div'); note.className = 'ltw-note'; note.textContent = '查看後將移至回顧';
        body.append(sub, card, note);
    }
    function _renderTwReview(body) {
        let logs = [];
        try { const db = _thl(); logs = (db && db.getAll) ? db.getAll() : []; } catch (e) {}
        const sub = document.createElement('div'); sub.className = 'ltw-sub';
        sub.textContent = '小劇場回顧 · ' + logs.length + ' 條';
        const list = document.createElement('div'); list.className = 'lsh-list ltw-list';
        if (!logs.length) list.innerHTML = '<div class="lsh-empty">── 還沒有看過的小劇場 ──</div>';
        logs.forEach(log => {
            const row = document.createElement('button');
            row.className = 'ltw-row' + (log.merged ? ' merged' : '');
            const ic = document.createElement('i');
            ic.className = 'fa-solid ' + (log.merged ? 'fa-compress' : 'fa-masks-theater') + ' ltw-row-ic';
            const tx = document.createElement('span'); tx.className = 'ltw-row-tx';
            const tt = document.createElement('span'); tt.className = 'ltw-row-title';
            tt.textContent = log.merged ? '往期綜述' : (log.pair || '小劇場');   // textContent 防注入
            const sb = document.createElement('span'); sb.className = 'ltw-row-sub';
            sb.textContent = _thlTime(log.ts) + (log.brief ? ' · ' + log.brief : '');
            tx.append(tt, sb);
            const arrow = document.createElement('i'); arrow.className = 'fa-solid fa-chevron-right ltw-row-arrow';
            row.append(ic, tx, arrow);
            row.addEventListener('click', () => _renderTwEntry(log));
            list.appendChild(row);
        });
        const acts = document.createElement('div'); acts.className = 'ltl-actions';
        acts.innerHTML =
            '<button class="lep-btn" data-act="recompress"><i class="fa-solid fa-compress"></i> 重壓縮</button>' +
            '<button class="lep-btn lep-danger" data-act="clear"><i class="fa-solid fa-trash"></i> 清空全部</button>';
        acts.querySelector('[data-act="clear"]').addEventListener('click', () => {
            if (!window.confirm('清空全部小劇場記事？不可復原。')) return;
            try { _thl()?.clear?.(); } catch (e) {}
            _twRender();
        });
        acts.querySelector('[data-act="recompress"]').addEventListener('click', async (ev) => {
            const btn = ev.currentTarget;
            const vt = window.VoidTerminal || (window.parent || window).VoidTerminal;
            if (!vt || !vt.recompressTheaterLog) return;
            const old = btn.innerHTML; btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 整理中…';
            let res = { ok: false, msg: '整理失敗' };
            try { res = await vt.recompressTheaterLog(); } catch (e) {}
            btn.disabled = false; btn.innerHTML = old;
            _twRender();
            try { const T = window.toastr || (window.parent || window).toastr; T?.[res.ok ? 'success' : 'info']?.(res.msg); } catch (e) {}
        });
        const hint = document.createElement('div'); hint.className = 'ltw-hint';
        hint.textContent = '摘要會保留為歷史對話，之後的小劇場會記得。記事變多時「重壓縮」會把往期併成一段綜述。';
        body.append(sub, list, acts, hint);
    }
    // 回顧單條操作頁（兩層換頁：列表→這裡；可改字/刪除）
    function _renderTwEntry(log) {
        const box = S.twEl; if (!box) return;
        const body = box.querySelector('.ltw-body'); body.innerHTML = '';
        const head = document.createElement('div'); head.className = 'ltw-entry-head';
        const back = document.createElement('button'); back.className = 'ltw-back';
        back.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        back.addEventListener('click', _twRender);
        const tt = document.createElement('span'); tt.className = 'ltw-entry-title';
        tt.textContent = log.merged ? '往期綜述' : (log.pair || '小劇場');
        const time = document.createElement('span'); time.className = 'ltl-time'; time.textContent = _thlTime(log.ts);
        head.append(back, tt, time);
        const label = document.createElement('div'); label.className = 'ltw-sub';
        label.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> 摘要';
        const ta = document.createElement('textarea'); ta.className = 'ltl-text'; ta.rows = 6; ta.value = log.brief || '';
        ta.addEventListener('change', () => {   // blur 自動存
            try { _thl()?.save?.({ id: log.id, pair: log.pair, npcKeys: log.npcKeys, brief: ta.value.trim(), merged: log.merged, ts: log.ts }); log.brief = ta.value.trim(); } catch (e) {}
        });
        const hint = document.createElement('div'); hint.className = 'ltw-hint';
        hint.textContent = '可直接改字，離開輸入框自動保存。';
        const del = document.createElement('button'); del.className = 'lep-btn lep-danger';
        del.innerHTML = '<i class="fa-solid fa-trash"></i> 刪除這條';
        del.addEventListener('click', () => { try { _thl()?.remove?.(log.id); } catch (e) {} _twRender(); });
        body.append(head, label, ta, hint, del);
    }
    function _openTheaterWin(tab) {
        _b.closeWins();   // 互斥：關掉裝扮室/對話紀錄/設置等其他小窗（含自己的舊窗）
        const box = document.createElement('div');
        box.className = 'lstage-dress lstage-theater-win';
        box.innerHTML =
            '<div class="ltw-head">' +
              '<span class="lsd-title"><i class="fa-solid fa-clapperboard"></i> 小劇場</span>' +
              '<button class="ltw-close" title="關閉"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<div class="ltw-tabs">' +
              '<button class="ltw-tab" data-tab="live">正在對話</button>' +
              '<button class="ltw-tab" data-tab="review">回顧</button>' +
            '</div>' +
            '<div class="ltw-body"></div>';
        S.root.appendChild(box);
        S.twEl = box;
        S.twTab = (tab === 'review') ? 'review' : 'live';
        box.querySelector('.ltw-close').addEventListener('click', _closeTheaterWin);
        box.querySelectorAll('.ltw-tab').forEach(b => b.addEventListener('click', () => { S.twTab = b.dataset.tab; _twRender(); }));
        _twRender();
    }

    // ── 🎭 配對事件（Phase A：純視覺零 API）──
    const THEATER_FREQ = { low: 0.08, mid: 0.18, high: 0.35 };
    function _theaterOn()   { try { return localStorage.getItem('lobby_theater_on') !== '0'; } catch (e) { return true; } }
    function _theaterFreq() { try { return THEATER_FREQ[localStorage.getItem('lobby_theater_freq')] || THEATER_FREQ.mid; } catch (e) { return THEATER_FREQ.mid; } }
    function _theaterEligible() { return S.npcs.filter(n => n && n !== S.player && n.name && !n.follow); }   // 跟隨玩家中的客人不抓來配對（免打斷跟隨、也免 follow 態被凍結卡住）
    function _theaterFace(a, b) {
        const L = a.x <= b.x ? a : b, R = a.x <= b.x ? b : a;
        if (L.sheet) L.dir = 2; else L.flip = true;    // 左者面朝右
        if (R.sheet) R.dir = 1; else R.flip = false;   // 右者面朝左
        a._theaterFrozen = b._theaterFrozen = true;
    }
    function _startTheater() {
        const CFG = _b.CFG;
        if (!CFG || !CFG.points) return;
        const pool = _theaterEligible();
        if (pool.length < 2) return;
        // 配對去重：記最近幾對，從「當前所有可能配對」排掉最近用過的再抽 → 強制輪完其他組合(AC/BC/AD…)才回頭同一對。
        //   maxRecent 留至少一個新選擇(=possiblePairs-1，上限4)；純視覺、無 API。
        const _sig = (x, y) => [x.key || x.name, y.key || y.name].sort().join('|');
        const possible = pool.length * (pool.length - 1) / 2;
        const recent = S._recentPairs || (S._recentPairs = []);
        const maxRecent = Math.max(1, Math.min(possible - 1, 4));
        const cands = [];
        for (let x = 0; x < pool.length; x++) for (let y = x + 1; y < pool.length; y++) {
            const s = _sig(pool[x], pool[y]);
            if (!recent.includes(s)) cands.push([pool[x], pool[y], s]);
        }
        let a, b, sig;
        if (cands.length) { const c = cands[Math.floor(Math.random() * cands.length)]; a = c[0]; b = c[1]; sig = c[2]; }
        else {   // 全被排掉(人太少/組合用盡)→退隨機
            const i = Math.floor(Math.random() * pool.length);
            let j = Math.floor(Math.random() * (pool.length - 1)); if (j >= i) j++;
            a = pool[i]; b = pool[j]; sig = _sig(a, b);
        }
        recent.push(sig); while (recent.length > maxRecent) recent.shift();
        // 🎬 呈現與內容分離：配對＝純資料事件＋頭頂泡泡，不動任何 NPC 座標（原地立定、面向彼此）。
        //   過場/播放交給 _presentTheater 的 overlay 分身演出；未來 world 模式（尋路集合）也從那裡分流。
        a.dest = null; b.dest = null;
        _theaterFace(a, b);
        [a, b].forEach(n => { n.walking = false; if (n.sheet) { n.frame = 1; n.animT = 0; } _b.placeActor(n); });
        const mkIcon = (n) => {
            const icon = document.createElement('button');
            icon.className = 'lstage-theater-icon lstage-float';
            icon.innerHTML = '<i class="fa-solid fa-comments"></i>';
            icon.style.left = Math.round(n.x) + 'px';
            icon.style.top  = Math.round(n.y - n.h - 24) + 'px';
            icon.addEventListener('click', (e) => { e.stopPropagation(); _openTheaterWin('live'); });
            S.world.appendChild(icon);
            return icon;
        };
        S.theater = { a, b, iconA: mkIcon(a), iconB: mkIcon(b), playing: false };
        _updateTheaterBadge();
        if (S.twEl) _twRender();   // 列表窗開著→「正在對話」即時亮起
    }
    // 🎬 呈現分流接口：mode 現只有 'overlay'（偷窺 Loading＋分身演出）；未來 'world'（NPC 真尋路集合）/'auto' 從這裡分流，world 失敗退 overlay。
    async function _presentTheater(mode) {
        const t = S.theater; if (!t || t.playing) return;
        t.playing = true;
        const a = t.a, b = t.b;
        _endTheater();   // 配對事件收場（清泡泡+解凍），地圖 NPC 照常過日子；演出全在 overlay 分身上
        const ov = _theaterOverlayShow(a, b);
        S._theaterPresenting = true;
        let ok = false;
        try { ok = !!(await (window.VoidTerminal && window.VoidTerminal.playDuoScene && window.VoidTerminal.playDuoScene(a, b))); } catch (e) {}
        S._theaterPresenting = false;
        _theaterOverlayHide(ov);
        if (!ok) { try { (window.toastr || (window.parent || window).toastr)?.warning?.('偷聽失敗了，他們先散場，稍後再試'); } catch (e) {} }
    }
    // 偷窺 Loading 遮罩：全屏半透明黑；中央小舞台＝當前場景底圖裁一塊＋兩位視覺分身左右滑入面對面、頭頂表情圖示輕跳；底部白點循環。
    function _theaterOverlayShow(a, b) {
        const ov = document.createElement('div');
        ov.className = 'ltov';
        const stage = document.createElement('div'); stage.className = 'ltov-stage';
        const mapImg = S.root && S.root.querySelector('.lstage-map');
        let bgPos = null;
        if (mapImg && mapImg.src) {
            const bg = document.createElement('img'); bg.className = 'ltov-bg'; bg.src = mapImg.src;
            stage.appendChild(bg);
            bgPos = { img: bg, midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
        }
        const EMOTES = ['fa-heart', 'fa-droplet', 'fa-music', 'fa-bolt', 'fa-ellipsis', 'fa-fire'];
        const pick = () => EMOTES.splice(Math.floor(Math.random() * EMOTES.length), 1)[0];
        const mkSlot = (n, side) => {
            const slot = document.createElement('div'); slot.className = 'ltov-slot ltov-' + side;
            const bub = document.createElement('div'); bub.className = 'ltov-bub';
            bub.innerHTML = '<i class="fa-solid ' + pick() + '"></i>';
            slot.appendChild(bub);
            slot.appendChild(_actorCloneEl(n, 150, side === 'l' ? 'right' : 'left'));   // 左邊那位面朝右、右邊面朝左
            return slot;
        };
        stage.append(mkSlot(a, 'l'), mkSlot(b, 'r'));
        const load = document.createElement('div'); load.className = 'ltov-load';
        load.innerHTML = '<span class="ltov-dots"><i></i><i></i><i></i></span><span class="ltov-txt">正在偷窺中…請稍等</span>';
        ov.append(stage, load);
        document.body.appendChild(ov);
        // 底圖對準兩人位置：放大裁切、配對中點對到舞台中心偏下（貼齊邊界防露黑邊）
        if (bgPos) {
            const r = stage.getBoundingClientRect();
            const scale = (r.width / _b.MAP_W) * 2.4;
            const iw = _b.MAP_W * scale, ih = _b.MAP_H * scale;
            let left = r.width / 2 - bgPos.midX * scale, top = r.height * 0.72 - bgPos.midY * scale;
            left = Math.min(0, Math.max(r.width - iw, left));
            top  = Math.min(0, Math.max(r.height - ih, top));
            bgPos.img.style.width = iw + 'px';
            bgPos.img.style.left = left + 'px';
            bgPos.img.style.top = top + 'px';
        }
        return ov;
    }
    function _theaterOverlayHide(ov) {
        if (!ov) return;
        ov.classList.add('out');
        setTimeout(() => ov.remove(), 400);
    }
    function _updateTheaterBadge() {
        const bd = S.root && S.root.querySelector('.ltb-badge');
        if (!bd) return;
        const on = !!(S.theater && !S.theater.playing);
        bd.classList.toggle('on', on);
        bd.textContent = on ? '1' : '';
    }
    function _endTheater() {
        const t = S.theater; if (!t) { S._theaterCd = Date.now(); return; }
        if (t.iconA) t.iconA.remove();
        if (t.iconB) t.iconB.remove();
        if (t.a) t.a._theaterFrozen = false;
        if (t.b) t.b._theaterFrozen = false;
        S.theater = null;
        S._theaterCd = Date.now();
        _updateTheaterBadge();
        if (S.twEl) _twRender();
    }
    function _theaterTick() {
        if (!S.active || !_theaterOn()) return;
        if (S.theater || S.talkTarget || S.transitioning || S._theaterPresenting) return;
        if (Date.now() - (S._theaterCd || 0) < 90000) return;   // cooldown 90 秒
        if (_theaterEligible().length < 2) return;
        if (Math.random() < _theaterFreq()) _startTheater();
    }

    _b.regWin(_closeTheaterWin);   // 加入窗口互斥圈：別人開窗會順手關掉小劇場窗，反之亦然
    window.LobbyTheater = {
        tick: _theaterTick,          // lobby_stage 的 15s 輪詢呼叫
        end: _endTheater,            // 收掉進行中配對（unmount/跟當事人開聊時核心呼叫）
        openWin: _openTheaterWin,    // 右上按鈕/頭頂泡泡入口
        closeWin: _closeTheaterWin,
        updateBadge: _updateTheaterBadge,
        present: _presentTheater,    // 呈現分流入口（未來 world 模式從這擴充）
    };
})();
