// ----------------------------------------------------------------
// [檔案] tools/chat_remote.js — 聊天遙控器（獨立小工具，跟奧瑞亞分開）
// 職責：酒館聊天頁旁邊一個可拖動的小面板。三件事：
//   ① 刪掉最新一則　② 讓最新一則換一個寫法（swipe）　③ 小貼示：點亮的貼示會黏在選項後面
// ⚠️ 助手腳本會把這支丟進 iframe 沙盒跑 —— DOM 一律對 parent 做，別對 iframe 自己做。
// ----------------------------------------------------------------
(function () {
    'use strict';

    // 沙盒 iframe 裡的 window 不是酒館主頁：所有 DOM 與 API 都要對 parent 拿
    var W = (function () {
        try { if (window.parent && window.parent.document && window.parent !== window) return window.parent; } catch (e) {}
        return window;
    })();
    var D = W.document;
    if (W.__ARC_LOADED__) return;   // 助手重載時別掛第二顆
    W.__ARC_LOADED__ = true;

    var LS_POS = 'arc_pos_v1';      // 只存座標與收合狀態
    var LS_TIPS = 'arc_tips_v1';    // 只存貼示文字。兩個都是小資料，不放圖
    var root = null, tipsBox = null;

    // ── 資料 ──────────────────────────────────────────────
    function readJSON(k, dft) {
        try { var v = JSON.parse(W.localStorage.getItem(k) || 'null'); return v == null ? dft : v; }
        catch (e) { return dft; }
    }
    // 🚨寫入要看成敗：localStorage 是全站共用 5MB，滿了以後 setItem 會拋而且很多地方都用空 catch
    //   吞掉，症狀會出現在毫不相關的功能上。這裡只存文字所以幾乎不可能撐爆，但照樣要出聲。
    function writeJSON(k, v) {
        try { W.localStorage.setItem(k, JSON.stringify(v)); return true; }
        catch (e) { console.warn('[遙控器] 存不進去（本機空間滿了？）', k, e); toast('存不下來，本機空間可能滿了', 'error'); return false; }
    }
    function tips() { var a = readJSON(LS_TIPS, []); return Array.isArray(a) ? a : []; }
    function saveTips(a) { writeJSON(LS_TIPS, a); }
    function activeTipText() {
        var on = tips().filter(function (t) { return t && t.on && t.text; });
        return on.length ? ' ' + on.map(function (t) { return t.text; }).join(' ') : '';
    }

    function toast(msg, kind) {
        try {
            var T = W.toastr;
            if (T && T[kind || 'info']) { T[kind || 'info'](msg, '遙控器'); return; }
        } catch (e) {}
        console.log('[遙控器] ' + msg);
    }

    // ── 貼示黏在選項後面 ────────────────────────────────
    //  選擇器那支 regex 送選項的方式是 triggerSlash('/setinput 選項文字')（見它的 sendAction），
    //  所以包這一層就抓得準 —— 不必去猜使用者是不是自己在打字，也不會把手動輸入誤判成選項。
    function hookSetInput() {
        var orig = W.triggerSlash;
        if (typeof orig !== 'function' || orig.__arcWrapped) return false;
        var wrapped = function (cmd) {
            try {
                if (typeof cmd === 'string' && /^\/setinput(\s|$)/.test(cmd)) {
                    var tip = activeTipText();
                    // 已經帶著同一段貼示就不再疊（同一輪被呼叫兩次時不會變兩份）
                    if (tip && cmd.indexOf(tip) < 0) cmd = cmd + tip;
                }
            } catch (e) {}
            // 🚨要把改過的 cmd 傳出去，不能用 arguments：
            //   這支是 use strict，arguments 不跟參數連動，改了 cmd 也照樣送出原字串——
            //   包裝掛上了、邏輯也跑了，就是完全不生效。
            return orig.call(this, cmd);
        };
        wrapped.__arcWrapped = true;
        wrapped.__arcOrig = orig;
        W.triggerSlash = wrapped;
        // TavernHelper 那份是另一個引用，一起包才不會漏（選擇器用的是裸 triggerSlash，但別的腳本可能走 helper）
        try {
            var H = W.TavernHelper;
            if (H && typeof H.triggerSlash === 'function' && !H.triggerSlash.__arcWrapped) {
                var ho = H.triggerSlash;
                var hw = function (cmd) {
                    try {
                        if (typeof cmd === 'string' && /^\/setinput(\s|$)/.test(cmd)) {
                            var tip = activeTipText();
                            if (tip && cmd.indexOf(tip) < 0) cmd = cmd + tip;
                        }
                    } catch (e) {}
                    return ho.call(this, cmd);   // 同上：不能用 arguments
                };
                hw.__arcWrapped = true; hw.__arcOrig = ho;
                H.triggerSlash = hw;
            }
        } catch (e) {}
        return true;
    }

    // ── 三個動作 ──────────────────────────────────────────
    function lastMesEl() { return D.querySelector('#chat .mes.last_mes'); }

    async function actDelete() {
        var H = W.TavernHelper;
        try {
            if (H && typeof H.deleteChatMessages === 'function' && typeof H.getLastMessageId === 'function') {
                var id = H.getLastMessageId();
                if (id == null || id < 0) { toast('沒有可以刪的訊息', 'warning'); return; }
                await H.deleteChatMessages([id]);
                toast('刪掉第 ' + id + ' 樓');
                return;
            }
            // 沒有助手就走原生 slash
            var ts = W.triggerSlash;
            if (typeof ts === 'function') { await ts('/del 1'); toast('刪掉最新一則'); return; }
            toast('找不到酒館助手，刪不了', 'error');
        } catch (e) { toast('刪除失敗：' + ((e && e.message) || e), 'error'); }
    }

    // 換一個寫法＝點酒館自己的右箭頭。不自己組生成請求：
    //   那顆按鈕背後接的是 ST 原生的 swipe 流程（建分支、記 swipes、更新計數），自己重做一定會漏。
    function actSwipe() {
        var mes = lastMesEl();
        if (!mes) { toast('找不到最新訊息', 'warning'); return; }
        if (mes.getAttribute('is_user') === 'true') { toast('最新一則是你說的，沒得換', 'warning'); return; }
        var btn = mes.querySelector('.swipe_right');
        if (!btn) { toast('這則沒有換寫法的按鈕', 'warning'); return; }
        try { btn.click(); } catch (e) { toast('換寫法失敗：' + ((e && e.message) || e), 'error'); }
    }

    // ── 面板 ──────────────────────────────────────────────
    function css() {
        if (D.getElementById('arc-style')) return;
        var s = D.createElement('style');
        s.id = 'arc-style';
        s.textContent = [
            '.arc-root{position:fixed;z-index:2147483000;width:186px;',
            '  background:linear-gradient(180deg,#241d15,#17130e);color:#f3ead8;',
            '  border:1px solid rgba(243,234,216,.22);border-radius:14px;',
            '  box-shadow:0 10px 34px rgba(0,0,0,.55);font-family:inherit;font-size:13px;',
            '  user-select:none;overflow:hidden;}',
            '.arc-root *{box-sizing:border-box;}',
            /* 把手：整條可拖，右邊一顆收合 */
            '.arc-grip{display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:grab;',
            '  background:rgba(255,210,122,.1);border-bottom:1px solid rgba(243,234,216,.16);}',
            '.arc-root.arc-drag .arc-grip{cursor:grabbing;}',
            '.arc-grip i.fa-grip-lines{color:#c9b98f;font-size:11px;}',
            '.arc-ttl{flex:1;font-size:12px;letter-spacing:.08em;color:#ffd27a;}',
            '.arc-fold{background:transparent;border:0;color:#a99b7c;cursor:pointer;font-size:12px;padding:2px 4px;}',
            '.arc-fold:hover{color:#ffd27a;}',
            /* 收起：只留把手那條 */
            '.arc-root.arc-min{width:132px;}',
            '.arc-root.arc-min .arc-body{display:none;}',
            '.arc-body{padding:9px;display:flex;flex-direction:column;gap:9px;}',
            /* 動作鈕 */
            '.arc-acts{display:grid;grid-template-columns:1fr 1fr;gap:7px;}',
            '.arc-b{display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 4px;',
            '  border-radius:10px;border:1px solid rgba(243,234,216,.2);background:rgba(38,31,24,.85);',
            '  color:#f3ead8;font-family:inherit;font-size:12px;cursor:pointer;transition:all .15s ease;}',
            '.arc-b i{font-size:15px;color:#e5c07a;}',
            '.arc-b:hover{border-color:rgba(255,210,122,.6);background:rgba(58,46,32,.9);}',
            '.arc-b:active{transform:translateY(1px);}',
            /* 刪除的二次確認：按一下變紅字要你再按，2 秒沒動作自己復原 —— 比彈窗快，又不會手滑就沒了 */
            '.arc-b.arc-armed{border-color:#e0654f;background:rgba(96,40,32,.9);color:#ffd9cf;}',
            '.arc-b.arc-armed i{color:#ff9d8a;}',
            /* 貼示 */
            '.arc-sec{display:flex;align-items:center;gap:6px;font-size:11px;color:#a99b7c;letter-spacing:.06em;}',
            '.arc-sec .arc-line{flex:1;height:1px;background:rgba(243,234,216,.14);}',
            '.arc-chips{display:flex;flex-wrap:wrap;gap:5px;max-height:132px;overflow-y:auto;}',
            '.arc-chips::-webkit-scrollbar{width:0;}',
            '.arc-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:999px;',
            '  border:1px solid rgba(243,234,216,.22);background:rgba(243,234,216,.06);',
            '  color:#d8cdb4;font-size:11.5px;cursor:pointer;max-width:100%;}',
            '.arc-chip:hover{border-color:rgba(255,210,122,.5);}',
            /* 長亮＝這段會黏在選項後面 */
            '.arc-chip.on{background:rgba(255,210,122,.2);border-color:#ffd27a;color:#ffe1a0;',
            '  box-shadow:0 0 0 3px rgba(255,210,122,.1);}',
            '.arc-chip-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:104px;}',
            '.arc-chip-x{opacity:.5;font-size:10px;padding:0 1px;}',
            '.arc-chip-x:hover{opacity:1;color:#ff9d8a;}',
            '.arc-empty{font-size:11px;color:#8b8069;line-height:1.6;}',
            '.arc-add{display:flex;align-items:center;justify-content:center;gap:5px;padding:6px;',
            '  border-radius:9px;border:1px dashed rgba(243,234,216,.25);background:transparent;',
            '  color:#c9b98f;font-family:inherit;font-size:11.5px;cursor:pointer;}',
            '.arc-add:hover{border-color:rgba(255,210,122,.55);color:#ffd27a;}',
            /* 新增/編輯用的小表單，就地展開，不另開視窗 */
            '.arc-form{display:flex;flex-direction:column;gap:5px;}',
            '.arc-form input,.arc-form textarea{width:100%;padding:6px 8px;border-radius:8px;',
            '  border:1px solid rgba(243,234,216,.22);background:rgba(0,0,0,.32);color:#f3ead8;',
            '  font-family:inherit;font-size:12px;resize:vertical;}',
            '.arc-form textarea{min-height:54px;line-height:1.5;}',
            '.arc-form-row{display:flex;gap:5px;}',
            '.arc-form-row button{flex:1;padding:6px;border-radius:8px;border:1px solid rgba(243,234,216,.2);',
            '  background:rgba(38,31,24,.85);color:#f3ead8;font-family:inherit;font-size:11.5px;cursor:pointer;}',
            '.arc-form-row button.arc-ok{background:#ffd27a;border-color:#ffd27a;color:#241d15;font-weight:700;}',
        ].join('');
        D.head.appendChild(s);
    }

    function renderTips() {
        if (!tipsBox) return;
        var list = tips();
        if (!list.length) {
            tipsBox.innerHTML = '<div class="arc-empty">還沒有貼示。<br>加一個，點亮它，之後選的選項後面就會自動帶上這段話。</div>';
            return;
        }
        tipsBox.innerHTML = '';
        list.forEach(function (t, i) {
            var c = D.createElement('span');
            c.className = 'arc-chip' + (t.on ? ' on' : '');
            c.title = t.text || '';
            c.innerHTML = '<span class="arc-chip-nm"></span><i class="fa-solid fa-xmark arc-chip-x"></i>';
            c.querySelector('.arc-chip-nm').textContent = t.name || '(無名)';
            c.addEventListener('click', function (e) {
                if (e.target.classList.contains('arc-chip-x')) {
                    var all = tips(); all.splice(i, 1); saveTips(all); renderTips(); return;
                }
                var a = tips(); if (!a[i]) return;
                a[i].on = !a[i].on; saveTips(a); renderTips();
            });
            tipsBox.appendChild(c);
        });
    }

    function openForm(host, onDone) {
        var f = D.createElement('div');
        f.className = 'arc-form';
        f.innerHTML =
            '<input class="arc-f-nm" type="text" placeholder="貼示名（按鈕上顯示）" maxlength="20">' +
            '<textarea class="arc-f-tx" placeholder="貼示內容（會接在選項後面）"></textarea>' +
            '<div class="arc-form-row"><button class="arc-cancel">取消</button><button class="arc-ok">加上去</button></div>';
        host.appendChild(f);
        var nm = f.querySelector('.arc-f-nm'), tx = f.querySelector('.arc-f-tx');
        setTimeout(function () { try { nm.focus(); } catch (e) {} }, 30);
        // 輸入框在拖曳把手底下，打字時別讓面板跟著跑
        [nm, tx].forEach(function (el) {
            el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        });
        f.querySelector('.arc-cancel').addEventListener('click', function () { f.remove(); onDone && onDone(); });
        f.querySelector('.arc-ok').addEventListener('click', function () {
            var n = (nm.value || '').trim(), t = (tx.value || '').trim();
            if (!t) { toast('貼示內容不能空白', 'warning'); return; }
            var a = tips();
            a.push({ name: n || t.slice(0, 8), text: t, on: false });
            saveTips(a); renderTips();
            f.remove(); onDone && onDone();
        });
    }

    function build() {
        css();
        var el = D.createElement('div');
        el.className = 'arc-root';
        el.innerHTML =
            '<div class="arc-grip">' +
              '<i class="fa-solid fa-grip-lines"></i>' +
              '<span class="arc-ttl">遙控器</span>' +
              '<button class="arc-fold" type="button" title="收起"><i class="fa-solid fa-chevron-up"></i></button>' +
            '</div>' +
            '<div class="arc-body">' +
              '<div class="arc-acts">' +
                '<button class="arc-b arc-del" type="button"><i class="fa-solid fa-trash-can"></i><span>刪最新</span></button>' +
                '<button class="arc-b arc-swipe" type="button"><i class="fa-solid fa-rotate"></i><span>換一個</span></button>' +
              '</div>' +
              '<div class="arc-sec"><span>小貼示</span><span class="arc-line"></span></div>' +
              '<div class="arc-chips"></div>' +
              '<button class="arc-add" type="button"><i class="fa-solid fa-plus"></i>新增貼示</button>' +
            '</div>';
        D.body.appendChild(el);
        root = el;
        tipsBox = el.querySelector('.arc-chips');
        renderTips();

        // 位置：記住上次拖到哪。夾回可視範圍——換螢幕或轉向後別掉到畫面外變成再也點不到
        var pos = readJSON(LS_POS, null);
        var w = 186, h = 260;
        var x = pos && typeof pos.x === 'number' ? pos.x : (W.innerWidth - w - 18);
        var y = pos && typeof pos.y === 'number' ? pos.y : 96;
        x = Math.max(4, Math.min(x, W.innerWidth - 60));
        y = Math.max(4, Math.min(y, W.innerHeight - 40));
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        if (pos && pos.min) el.classList.add('arc-min');

        wireDrag(el);
        wireActs(el);
        return el;
    }

    function wireDrag(el) {
        var grip = el.querySelector('.arc-grip');
        var sx = 0, sy = 0, ox = 0, oy = 0, on = false;
        grip.addEventListener('pointerdown', function (e) {
            if (e.target.closest('.arc-fold')) return;   // 收合鈕不觸發拖曳
            on = true; el.classList.add('arc-drag');
            sx = e.clientX; sy = e.clientY;
            ox = parseFloat(el.style.left) || 0; oy = parseFloat(el.style.top) || 0;
            try { grip.setPointerCapture(e.pointerId); } catch (err) {}
            e.preventDefault();
        });
        grip.addEventListener('pointermove', function (e) {
            if (!on) return;
            var x = ox + (e.clientX - sx), y = oy + (e.clientY - sy);
            x = Math.max(4, Math.min(x, W.innerWidth - 60));
            y = Math.max(4, Math.min(y, W.innerHeight - 40));
            el.style.left = x + 'px'; el.style.top = y + 'px';
        });
        function stop() {
            if (!on) return;
            on = false; el.classList.remove('arc-drag');
            writeJSON(LS_POS, { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0, min: el.classList.contains('arc-min') });
        }
        grip.addEventListener('pointerup', stop);
        grip.addEventListener('pointercancel', stop);
    }

    function wireActs(el) {
        el.querySelector('.arc-fold').addEventListener('click', function () {
            el.classList.toggle('arc-min');
            var ic = el.querySelector('.arc-fold i');
            ic.className = 'fa-solid ' + (el.classList.contains('arc-min') ? 'fa-chevron-down' : 'fa-chevron-up');
            writeJSON(LS_POS, { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0, min: el.classList.contains('arc-min') });
        });

        // 刪除要按兩次：第一次只是上膛，2 秒內沒有第二次就自己解除。
        //   刪樓是回不去的，但彈窗確認在遙控器上太慢——這是兩者之間的折衷。
        var del = el.querySelector('.arc-del'), armed = false, armT = null;
        del.addEventListener('click', function () {
            if (!armed) {
                armed = true; del.classList.add('arc-armed');
                del.querySelector('span').textContent = '再按一次';
                armT = setTimeout(function () {
                    armed = false; del.classList.remove('arc-armed');
                    del.querySelector('span').textContent = '刪最新';
                }, 2000);
                return;
            }
            clearTimeout(armT); armed = false;
            del.classList.remove('arc-armed');
            del.querySelector('span').textContent = '刪最新';
            actDelete();
        });

        el.querySelector('.arc-swipe').addEventListener('click', actSwipe);

        var add = el.querySelector('.arc-add');
        add.addEventListener('click', function () {
            add.style.display = 'none';
            openForm(add.parentNode, function () { add.style.display = ''; });
        });
    }

    // ── 上線：等酒館的聊天介面出現再掛 ────────────────────
    var tries = 0;
    var timer = setInterval(function () {
        tries++;
        var ready = false;
        try { ready = !!(D.body && D.querySelector('#send_textarea')); } catch (e) {}
        if (ready) {
            clearInterval(timer);
            try { build(); } catch (e) { console.error('[遙控器] 面板建立失敗', e); return; }
            // triggerSlash 可能比這支晚出現（助手/擴展載入順序不定）→ 沒包到就再試，最多 20 秒
            if (!hookSetInput()) {
                var ht = setInterval(function () { if (hookSetInput()) clearInterval(ht); }, 500);
                setTimeout(function () { clearInterval(ht); }, 20000);
            }
            console.log('[遙控器] 就緒');
        } else if (tries > 120) {   // 60 秒還沒有聊天介面＝這頁不是酒館，安靜退場
            clearInterval(timer);
        }
    }, 500);
})();
