// ----------------------------------------------------------------
// [檔案] lobby_dress.js — 大廳角色右鍵選單＋裝扮室＋對話紀錄窗（2026-07-16 自 lobby_stage.js 拆出）
// 職責：右鍵/長按角色→下拉單（裝扮室/跟隨/對話紀錄/整理記憶）
//       → 裝扮室（換單張立姿/3×4走路圖＋內建生成小小人/走路圖調框預覽）
//       → NPC 對話紀錄小面板（查看/逐條刪/清空徹底遺忘；歷史「資料」存取仍在核心）。
// 依賴：window.LobbyStage._b 橋（S 狀態/skins/pixelify/askImage/idb/NPC歷史/窗口互斥登記）；載入順序必須在 lobby_stage.js 之後。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const LS = window.LobbyStage;
    if (!LS || !LS._b) { console.warn('[LobbyDress] LobbyStage 橋不存在，裝扮室停用'); return; }
    const _b = LS._b;
    const S = _b.S;
    // 角色名字（書卡客人、常客、世界門旅人都是模型或角色卡給的）、生圖接口回來的網址：塞進 HTML 前轉義，五個都轉
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

    // ── 右鍵角色→下拉單 ──
    function _closeActorMenu() { S.menuEl?.remove(); S.menuEl = null; document.removeEventListener('pointerdown', _menuOutside); }
    function _openActorMenu(a, cx, cy) {
        _b.closeWins();
        const rr = S.root.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'lstage-actor-menu';
        const isPlayer = (a.key === 'player');   // 玩家不給「跟隨我」（跟自己很怪）
        menu.innerHTML = '<div class="lam-title">' + _esc(a.name || '角色') + '</div>' +
            (a.onProfile ? '<button class="lam-item" data-act="idcard"><i class="fa-solid fa-id-card"></i> 身分卡</button>' : '') +   // 🌌 世界門旅人掛 onProfile 才出現
            '<button class="lam-item" data-act="dress"><i class="fa-solid fa-shirt"></i> 裝扮室</button>' +
            (isPlayer ? '' : '<button class="lam-item" data-act="follow"><i class="fa-solid fa-person-walking-arrow-right"></i> ' + (a.follow ? '取消跟隨' : '跟隨我') + '</button>') +
            (isPlayer ? '' : '<button class="lam-item" data-act="history"><i class="fa-solid fa-comment-dots"></i> 對話紀錄</button>') +
            (isPlayer ? '' : '<button class="lam-item" data-act="recompact"><i class="fa-solid fa-brain"></i> 整理記憶</button>');
        menu.style.left = Math.max(6, Math.min(cx - rr.left, rr.width - 150)) + 'px';
        menu.style.top = Math.max(6, Math.min(cy - rr.top, rr.height - ((isPlayer ? 90 : 192) + (a.onProfile ? 34 : 0)))) + 'px';
        S.root.appendChild(menu);
        S.menuEl = menu;
        menu.querySelector('[data-act="idcard"]')?.addEventListener('click', () => { _closeActorMenu(); try { a.onProfile(a); } catch (e) {} });
        menu.querySelector('[data-act="dress"]').addEventListener('click', () => { _closeActorMenu(); _openDress(a); });
        menu.querySelector('[data-act="follow"]')?.addEventListener('click', () => {
            a.follow = !a.follow;
            a.dest = null;   // 清掉漫步目標，交給跟隨邏輯接手
            S.followers = S.followers.filter(x => x !== a);   // 先移除，維持佇列無重複
            if (a.follow) S.followers.push(a);   // 加到隊尾：越晚跟的排越後面（串成一列不重疊）
            else { a.walking = false; if (a.sheet) { a.dir = 0; a.frame = 1; a.animT = 0; } else if (a.views) a.dir = 0; }   // 取消跟隨=立定+轉回正面(第1列朝下)
            _closeActorMenu();
        });
        menu.querySelector('[data-act="history"]')?.addEventListener('click', () => {
            _closeActorMenu();
            _openNpcHistory(a);
        });
        menu.querySelector('[data-act="recompact"]')?.addEventListener('click', () => {
            _closeActorMenu();
            window.VoidTerminal?.recompactNpcMemory?.(a.key, a.name);
        });
        // 🚨 不用 once：點在選單裡（標題、空白處）也會把那一次用掉，之後點外面就關不掉。一直聽，選單收掉時才拿掉
        setTimeout(() => { if (S.menuEl === menu) document.addEventListener('pointerdown', _menuOutside); }, 0);
    }
    function _menuOutside(e) { if (S.menuEl && !S.menuEl.contains(e.target)) _closeActorMenu(); }
    // 裝扮室面板
    //   🎭 11-16 起裝扮室的內容搬進角色中心的「裝扮」那一頁（os_char_gallery.js 叫 mountInto）：同一份按鈕、同一套接法。
    //     她：「發現我裝扮室和圖鑑需要歸類嗎?總感覺我每次前端這邊做一點那邊做一點，到處零散的感覺」。
    //     大廳對角色按右鍵的「裝扮室」改開角色中心那一頁（_openDress）；角色中心還沒載到（酒館的手機那批比大廳晚到）才退回下面這個小窗。
    //   a＝大廳的小人物件，或角色中心給的那一份 { key, name, avatarPrompt, avatarCacheKey }（人不在場也能換：造型照 key 存）。
    //     沒有 key＝這個角色還沒進過大廳，小人那幾顆不出，只留立繪。
    function _closeDressRoom() { S.dressEl?.remove(); S.dressEl = null; }
    function _openDress(a) {
        const G = window.OS_CHAR_GALLERY || (window.parent || window).OS_CHAR_GALLERY;
        if (G && G.dressOk && typeof G.open === 'function') {
            try { _b.closeWins(); G.open(a.name, { actor: a, tab: 'dress' }); return; } catch (e) { console.warn('[LobbyDress] 角色中心沒開成，退回小窗', e); }
        }
        _openDressRoom(a);
    }
    const _DRESS_HINT = '<div class="lsd-hint">單張圖＝站立像+走路彈跳；走路圖＝3×4格圖（第1列朝下、第2列朝左、第3列朝右、第4列朝上，每列3幀）</div>';
    function _dressSmallHtml(a) {
        return _DRESS_HINT +
            '<button class="lep-btn" data-act="img"><i class="fa-solid fa-image"></i> 換單張立姿圖</button>' +
            '<button class="lep-btn" data-act="sheet"><i class="fa-solid fa-person-walking"></i> 換走路圖（3×4）</button>' +
            _dressGenHtml(a);
    }
    function _dressResetHtml(a) {
        return '<button class="lep-btn" data-act="reset"' + (_b.skins()[a.key] ? '' : ' disabled') + '><i class="fa-solid fa-rotate-left"></i> 還原預設</button>';
    }
    // 按鈕接上去。done＝做完一件事之後：小窗＝關掉；角色中心那頁＝重畫（目前的小人、還原預設那顆跟著變）
    function _dressBind(box, a, done) {
        box._done = done;
        _wireDressGen(box, a);
        _wireDressSprite(box, a);
        box.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (!act) return;
            if (act === 'img' || act === 'sheet') {
                _b.askImage(async (ref, dataUrl) => {
                    // 🧊 單張立姿可選「壓成像素小小人」：格點化+單色背景變透明（取消=原圖直接用；走路圖不處理）
                    if (act === 'img' && await AUI.confirm('要幫這張圖壓成像素小小人嗎？\n會變成大顆粒的復古小人，單色背景也會自動變透明。', { okText: '壓成小小人', cancelText: '原圖直接用', danger: false })) {
                        try {
                            const src = dataUrl || await _b.resolveRef(ref);
                            const out = src ? await _b.pixelify(src) : null;
                            if (out) {
                                const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                                await _b.idbPut(id, out);
                                ref = { idb: id };
                            } else {
                                AUI.alert('這張圖處理不了（多半是圖床不給讀），先原圖直接用。');
                            }
                        } catch (e) { console.warn('[LobbyDress] 小小人壓製失敗，改用原圖', e); }
                    }
                    _b.saveSkin(a.key, { kind: act === 'sheet' ? 'sheet' : 'img', ref });
                    _b.applySkin(a, a.key);
                    done();
                });
            } else if (act === 'reset') {
                _b.saveSkin(a.key, null);
                // 人在大廳：當場換回沒換造型時的樣子。角色中心那頁知道他有跟立繪一起畫的 Q版就換回那張（以前一律換成預設那張，要重進大廳才對）
                const base = box._look && box._look.base;
                if (a.el && base && base.src && !base.sheet) _b.swapActorSrc(a, base.views ? { views: base.views } : base.src);
                else if (a.defaultSrc && a.el) _b.swapActorSrc(a, a.defaultSrc);
                done();
            } else if (act === 'close') done();
        });
    }
    function _openDressRoom(a) {
        _closeDressRoom();
        const box = document.createElement('div');
        box.className = 'lstage-dress';
        box.innerHTML =
            '<div class="lsd-title"><i class="fa-solid fa-shirt"></i> 裝扮室 — ' + _esc(a.name || '角色') + '</div>' +
            _dressSmallHtml(a) + _dressSpriteHtml(a) + _dressResetHtml(a) +
            '<button class="lep-btn lep-done" data-act="close"><i class="fa-solid fa-check"></i> 關閉</button>';
        S.root.appendChild(box);
        S.dressEl = box;
        _dressBind(box, a, _closeDressRoom);
    }
    // 🎭 角色中心的「裝扮」那一頁（os_char_gallery.js 叫）：畫進 host，不是浮在大廳上的小窗。
    //   11-16 第一版是把小窗的內容原樣搬進來（一排滿寬按鈕＋格式說明），她：「怎麼設計介面不那麼像控制室? 太開發者了，不喜歡」。
    //   重做成（小樣：參考資料/CHAR_HUB_DRESS_LAB.html，她「好照這個」）：
    //     左＝展示台放他現在的樣子（三面的可以點正面／側面／背面），下面切「大廳的小人／劇情的立繪」，換過造型才有「換回原本的小人」；
    //     右＝「幫他畫一個新的小人」三張卡（不倒翁／Q版小人／會走路的小人）＋「或是用自己的圖」兩張卡；切到立繪是重畫立繪的卡。
    //     卡片上只寫換完會變怎樣；格式說明、去哪裡選接口收進標題旁的小問號。
    //   做事的還是原本那幾支（_dressBind／_wireDressGen／_wireDressSprite 照 class 和 data-act 認）：卡片就是那幾顆按鈕換了長相。
    //   樣式在 css/os_char_gallery.css 的 .acg-dress .lsd-*（照那個窗的顏色）。
    //   opts.previewHost＝生成完那張預覽／調框窗要蓋在誰上面（角色中心自己那個窗；不給就蓋在大廳舞台上，角色中心開著會被擋住）
    //   opts.spriteOf＝問角色中心「劇情舞台現在會用哪張立繪」（它那邊認得本地上傳、世界書）；沒給或問不到就看立繪庫、頭像快取、大廳那張
    //   opts.onChange＝這一頁換了圖（角色中心那邊把記著的素材丟掉重讀）；opts.view＝一開始看哪一邊（'doll'／'sprite'）
    //   opts.lookKey＝他的外觀描述存在頭像快取的哪一筆（角色中心算好給）：有給，最下面就多一格「他的長相」可以直接改、照它重畫；
    //     沒給（管理員、別的故事來的客人）就沒有那一格。
    //     🏷 11-16 從 設置 → 圖片 的「角色外觀登記表」搬過來（她：「或許角色表應該放到這個舞台上? 這樣就可以說圖片那邊是畫風和key設置，
    //       和調用開關，人物外型放進舞台這裡?」）。讀寫的還是同一筆（頭像快取那一筆的 prompt），劇情插圖的 ##角色名## 也是展開這一段。
    function _dressCard(cls, icon, title, desc, attrs) {
        return '<button class="lsd-card ' + cls + '" type="button"' + (attrs || '') + '><span class="lsd-ic"><i class="fa-solid ' + icon + '"></i></span>' +
            '<span class="lsd-tx"><span class="lsd-t">' + title + '</span><span class="lsd-d">' + desc + '</span></span></button>';
    }
    function mountInto(host, a, opts) {
        opts = opts || {};
        if (!host || !a) return;
        const A = window.AUI || (window.parent || window).AUI;
        try {
            if (A && A.registerHelp) A.registerHelp({ lsd_dress: { title: '幫他換小人', body: '不倒翁、Q版小人、會走路的小人：照他的長相畫一張，先給你看過，按套用才換上。\n\n用哪組接口來畫，在「設置 → 圖片 → 畫風」選：不倒翁是最上面那張表的「不倒翁小人」那一列，另外兩種是「大廳的小人」那兩格。\n\n放一張圖：一張站著的圖，他走路時會一跳一跳、左右轉身。\n\n放一組走路圖：一張圖裡排好十二格，三格一排、共四排，由上到下是朝下、朝左、朝右、朝上。' } });
        } catch (e) {}
        const help = (A && A.helpBtn) ? A.helpBtn('lsd_dress') : '';
        const VN = window.VN_Core || (window.parent || window).VN_Core;
        const trio = !!(VN && typeof VN._trioOn === 'function' && VN._trioOn() && typeof VN.regenTrio === 'function');
        const lk = (typeof opts.lookKey === 'string') ? opts.lookKey : '';
        try {
            if (A && A.registerHelp) A.registerHelp({ lsd_look: { title: '他的長相', body: '畫他的時候照這一段畫：小人、立繪、頭像，還有劇情插圖裡的他。\n\n劇情第一次寫到他時會自動記下來，多半是英文的畫圖用詞，可以直接改；改完點一下別的地方就存好了。\n\n照這段重畫：把劇情自動幫他畫的那張圖照現在這段重畫一張，蓋掉舊的。' } });
        } catch (e) {}
        // 要畫的那幾張卡：沒有長相就畫不出來，卡是暗的、寫原因（下面那格一寫好就亮，見 syncLook）
        const noLook = lk ? '先在下面寫他的長相' : '還不知道他長什麼樣，畫不出來';
        const d = (text) => text;
        const off = ' data-d="1"';
        const box = document.createElement('div');
        box.className = 'lsd-embed';
        box.innerHTML =
            '<div class="lsd-left">' +
                '<div class="lsd-stage"><span class="lsd-badge" hidden></span><div class="lsd-stage-pic" hidden></div><div class="lsd-stage-none" hidden></div></div>' +
                '<div class="lsd-turn" hidden></div>' +
                '<div class="lsd-seg">' +
                    '<button type="button" data-view="doll"><i class="fa-solid fa-person"></i>大廳的小人</button>' +
                    '<button type="button" data-view="sprite"><i class="fa-solid fa-image-portrait"></i>劇情的立繪</button>' +
                '</div>' +
                '<button class="lsd-undo" type="button" data-act="reset" hidden><i class="fa-solid fa-rotate-left"></i>換回原本的小人</button>' +
            '</div>' +
            '<div class="lsd-right">' +
                '<div class="lsd-pane" data-pane="doll" hidden>' + (a.key ? (
                    '<div class="lsd-h">幫他畫一個新的小人' + help + '</div>' +
                    '<div class="lsd-cards">' +
                        _dressCard('lsd-gen-btn-doll is-main', 'fa-egg', '不倒翁', d('圓滾滾的一隻，有小手小腳，走路會踏步'), off) +
                        _dressCard('lsd-gen-btn', 'fa-child-reaching', 'Q版小人', d('站著的一張，走路會彈跳'), off) +
                        _dressCard('lsd-gen-btn-sheet', 'fa-person-walking', '會走路的小人', d('四個方向都有走路的樣子'), off) +
                    '</div>' +
                    '<div class="lsd-sub">或是用自己的圖</div>' +
                    '<div class="lsd-cards">' +
                        _dressCard('', 'fa-image', '放一張圖', '一張站著的圖', ' data-act="img"') +
                        _dressCard('', 'fa-table-cells', '放一組走路圖', '十二格排好的那種', ' data-act="sheet"') +
                    '</div>') : '') +
                '</div>' +
                '<div class="lsd-pane" data-pane="sprite" hidden>' +
                    '<div class="lsd-h">幫他重畫立繪</div>' +
                    '<div class="lsd-cards">' +
                        _dressCard('lsd-sprite-btn is-main', 'fa-image-portrait', '只重畫立繪', d('劇情裡那張大圖，照現在的畫風'), off) +
                        (trio ? _dressCard('lsd-trio-btn', 'fa-layer-group', '立繪、頭像、Q版一起', d('三種整組重畫'), off) : '') +
                    '</div>' +
                '</div>' +
            '</div>' +
            (lk ? ('<div class="lsd-look">' +
                '<div class="lsd-h">他的長相' + ((A && A.helpBtn) ? A.helpBtn('lsd_look') : '') + '</div>' +
                '<textarea class="lsd-look-text" rows="4" placeholder="還沒有他的長相。在這裡寫下來，之後畫他都照這段"></textarea>' +
                '<div class="lsd-look-foot"><span class="lsd-look-tip" aria-live="polite"></span>' +
                    '<button class="lsd-look-redo" type="button"><i class="fa-solid fa-rotate"></i><span>照這段重畫</span></button></div>' +
            '</div>') : '');
        host.innerHTML = '';
        host.appendChild(box);
        // 卡片亮不亮跟著「現在有沒有長相」：改那一格不重畫整頁（重畫會把她正要按的那張卡換掉，那一下就按空了）
        const syncLook = () => box.querySelectorAll('.lsd-card[data-d]').forEach((c) => {
            const t = c.querySelector('.lsd-d');
            if (c.dataset.d === '1') c.dataset.d = t.textContent;
            c.disabled = !a.avatarPrompt;
            t.textContent = a.avatarPrompt ? c.dataset.d : noLook;
        });
        syncLook();
        if (lk) _wireDressLook(box, a, lk, syncLook);
        box._pvHost = opts.previewHost || null;
        box._a = a;
        box._view = (opts.view === 'sprite' || opts.view === 'doll') ? opts.view : (a.key ? 'doll' : 'sprite');
        box._face = 'front';
        _dressBind(box, a, () => {
            try { if (typeof opts.onChange === 'function') opts.onChange(); } catch (e) {}
            if (box.isConnected) mountInto(host, a, Object.assign({}, opts, { view: box._view }));
        });
        box.querySelector('.lsd-seg').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) _dressShow(box, b.dataset.view); });
        box.querySelector('.lsd-turn').addEventListener('click', (e) => { const b = e.target.closest('[data-face]'); if (b) { box._face = b.dataset.face; _dressShow(box, box._view); } });
        _dressShow(box, box._view);   // 圖還在讀：先把切換和卡片排好
        _dressLook(a, opts).then((L) => { if (box.isConnected) { box._look = L; _dressShow(box, box._view); } }).catch(() => {});
    }
    // 🏷 「他的長相」那一格：lk＝頭像快取那一筆的鑰匙（只有名字＝這個故事的；帶「那一輪::」的＝照寫）。
    //   改完離開那一格就存（只換 prompt，圖和其他欄位照舊）；清空＝他沒有長相了（劇情插圖也不再展開他）。
    //   大總結猜的那種（src:'summary'，劇情正式寫到他時會被換掉）她親手改過就拿掉記號，不然她改的會被蓋回去。
    //   「照這段重畫」＝設置那張表原本的「重畫」：劇情自動畫的那張（頭像；開著立繪模式是立繪；開著一次生三種是三種一起）照這段重生、蓋掉舊的。
    function _wireDressLook(box, a, lk, syncLook) {
        const VC = window.VN_Cache || (window.parent || window).VN_Cache;
        const ta = box.querySelector('.lsd-look-text'), tipEl = box.querySelector('.lsd-look-tip'), redo = box.querySelector('.lsd-look-redo');
        if (!ta || !VC) return;
        const tip = (t) => { tipEl.textContent = t; setTimeout(() => { if (tipEl.textContent === t) tipEl.textContent = ''; }, 2200); };
        let saved = String(a.avatarPrompt || '');
        ta.value = saved;
        // 小人身上那份可能是舊的：以存著的那一筆為準（她還沒動手打字才換）
        VC.get('avatar_cache', lk).then((rec) => {
            if (!box.isConnected || !rec || ta.value !== saved) return;
            saved = String(rec.prompt || '');
            ta.value = saved; a.avatarPrompt = saved; syncLook();
        }).catch(() => {});
        const save = async () => {
            const v = ta.value.trim();
            if (v === saved) return true;
            a.avatarPrompt = v; syncLook();   // 先讓卡片跟上：她可能正從這一格直接點去按卡
            try {
                const cur = await VC.get('avatar_cache', lk);
                if (cur || v) {
                    const rec = Object.assign({}, cur || {}, { prompt: v });
                    delete rec.src;
                    await VC.set('avatar_cache', lk, rec);
                }
                saved = v;
                if (box.isConnected) tip(v ? '存好了' : '清掉了');
                return true;
            } catch (e) { AUI.alert('沒存到：' + ((e && e.message) || e)); return false; }
        };
        ta.addEventListener('blur', save);
        let busy = false;
        redo.addEventListener('click', async () => {
            if (busy) return;
            const desc = ta.value.trim();
            if (!desc) { AUI.alert('先寫下他的長相再重畫。'); return; }
            const VN = window.VN_Core || (window.parent || window).VN_Core;
            if (!VN || typeof VN._makeCharImage !== 'function' || typeof VN._charRec !== 'function') { AUI.alert('劇情引擎還沒載入，稍等一下再按。'); return; }
            busy = true; redo.disabled = true;
            const lab = redo.querySelector('span'), orig = lab.textContent;
            lab.textContent = '畫圖中…';
            let done = false;
            try {
                if (!(await save())) return;
                const img = await VN._makeCharImage(desc, 'Neutral', true);   // force：不拿記著的舊圖，也不排「幾個角色湊一張」的隊
                if (!img || !img.dataUrl) throw new Error('沒有畫出來（看一下圖片接口和額度）');
                const cur = (await VC.get('avatar_cache', lk)) || {};
                await VC.set('avatar_cache', lk, VN._charRec(desc, img, cur));
                const bare = lk.indexOf('::') >= 0 ? lk.slice(lk.indexOf('::') + 2) : lk;
                try { delete VN._avatarMemCache[bare]; delete VN._faceMemCache[bare]; } catch (e) {}   // 這一輪記著的舊圖也丟掉，不然畫面上還是舊那張
                done = true;
            } catch (e) { AUI.alert('重畫沒成功：' + ((e && e.message) || e)); }
            finally {
                busy = false; redo.disabled = false; lab.textContent = orig;
                if (done && box.isConnected && box._done) box._done();   // 整頁重畫：展示台換成新的
            }
        });
    }
    // 他現在的樣子：{ doll:{ label, src, views?, sheet?, own? }|null, base:{ src, views? }|null（沒換造型時的樣子，「換回原本的」當場換回它）, sprite:'' }
    async function _dressLook(a, opts) {
        const VC = window.VN_Cache || (window.parent || window).VN_Cache;
        const key = a.avatarCacheKey || a.name;
        let rec = null, sp = null;
        try { if (VC && key) { rec = await VC.get('avatar_cache', key); sp = await VC.get('sprite_cache', key); } } catch (e) {}
        const out = { doll: null, base: null, sprite: '' };
        if (a.key) {
            // 沒換造型時：跟立繪一起畫的 Q版（三面的連側面背面）→ 預設那張
            if (rec && rec.chibi) out.base = { label: 'Q版', src: rec.chibi, views: (rec.chibiSide && rec.chibiBack) ? { front: rec.chibi, side: rec.chibiSide, back: rec.chibiBack } : null };
            else {
                const ds = a.defaultSrc;
                if (typeof ds === 'string' && ds) out.base = { label: '預設的小人', src: ds };
                else if (ds && ds.views && ds.views.front) out.base = { label: '預設的小人', src: ds.views.front, views: ds.views };
                else if (ds && ds.sheet) out.base = { label: '預設的小人', src: ds.sheet, sheet: true };
            }
            const skin = _b.skins()[a.key];
            if (skin) {
                let src = '';
                try { src = (await _b.resolveRef(skin.ref)) || ''; } catch (e) {}
                if (src && skin.kind === 'views') {
                    let side = '', back = '';
                    try { side = (await _b.resolveRef(skin.side)) || ''; back = (await _b.resolveRef(skin.back)) || ''; } catch (e) {}
                    out.doll = { label: '不倒翁小人', src: src, views: (side && back) ? { front: src, side: side, back: back } : null, own: true };
                } else if (src && skin.kind === 'sheet' && skin.doll) {   // 接好手腳的不倒翁：存的是走路圖，切站著的三格出來看
                    if (skin.doll === 1) {   // ✊ 11-17 之前接的小圓手：先換成衣櫥的拳頭（換不成就照舊那張）
                        try { const up = await _dollRefist(a.key, skin); if (up) src = (await _b.resolveRef(up.ref)) || src; } catch (e) {}
                    }
                    let v = null;
                    try { v = await _dollCells(src); } catch (e) {}
                    out.doll = v ? { label: '不倒翁小人', src: v.front, views: v, own: true } : { label: '不倒翁小人', src: src, sheet: true, own: true };
                } else if (src) out.doll = { label: skin.kind === 'sheet' ? '走路圖' : '換過的小人', src: src, sheet: skin.kind === 'sheet', own: true };
            }
            if (!out.doll) out.doll = out.base;
        }
        let s2 = '';
        try { if (typeof opts.spriteOf === 'function') s2 = (await opts.spriteOf()) || ''; } catch (e) {}
        out.sprite = s2 || (sp && sp.url) || (rec && rec.isSprite && rec.url) || a.portrait || '';
        return out;
    }
    // 展示台和右邊那一塊照「現在看哪一邊」畫
    function _dressShow(box, view) {
        const a = box._a, L = box._look || null;
        box._view = view = (view === 'sprite') ? 'sprite' : 'doll';
        const q = (sel) => box.querySelector(sel);
        box.querySelectorAll('.lsd-seg [data-view]').forEach(b => b.classList.toggle('is-on', b.dataset.view === view));
        q('[data-pane="doll"]').hidden = !(view === 'doll' && a.key);
        q('[data-pane="sprite"]').hidden = (view !== 'sprite');
        const stage = q('.lsd-stage'), badge = q('.lsd-badge'), pic = q('.lsd-stage-pic'), none = q('.lsd-stage-none'), turn = q('.lsd-turn'), undo = q('.lsd-undo');
        const say = (icon, html) => { none.innerHTML = '<i class="fa-solid ' + icon + '"></i>' + html; none.hidden = false; };
        badge.hidden = true; pic.hidden = true; none.hidden = true; turn.hidden = true; undo.hidden = true;
        stage.classList.remove('is-sprite');
        if (view === 'doll' && !a.key) { say('fa-door-closed', '他還沒來過大廳<br>等他來了再幫他換小人'); return; }
        if (!L) return;   // 圖還沒讀到
        if (view === 'sprite') {
            if (!L.sprite) { say('fa-image-portrait', '他還沒有立繪'); return; }
            stage.classList.add('is-sprite');
            badge.textContent = '目前：立繪'; badge.hidden = false;
            pic.innerHTML = '<img src="' + _esc(L.sprite) + '" alt="">'; pic.hidden = false;
            return;
        }
        const D = L.doll;
        if (!D || !D.src) { say('fa-person', '還沒有小人'); return; }
        badge.textContent = '目前：' + D.label; badge.hidden = false;
        const face = (D.views && D.views[box._face]) ? box._face : 'front';
        if (D.sheet) {   // 走路圖：只露正面站著那一格
            pic.innerHTML = '<div class="lsd-stage-cell"></div>';
            pic.firstChild.style.backgroundImage = 'url("' + String(D.src).replace(/["\\\n\r]/g, m => '\\' + m) + '")';
        } else pic.innerHTML = '<img src="' + _esc(D.views ? D.views[face] : D.src) + '" alt="">';
        pic.hidden = false;
        if (D.views) {
            turn.innerHTML = [['front', '正面'], ['side', '側面'], ['back', '背面']].map(v =>
                '<button type="button" data-face="' + v[0] + '"' + (v[0] === face ? ' class="is-on"' : '') + '><img src="' + _esc(D.views[v[0]]) + '" alt="">' + v[1] + '</button>').join('');
            turn.hidden = false;
        }
        undo.hidden = !D.own;
    }

    // ── 💬 NPC 對話紀錄小面板（舞台上，仿裝扮室：查看/逐條刪/清空徹底遺忘）──
    function _closeNpcHistory() { S.histEl?.remove(); S.histEl = null; }
    function _renderNpcHistoryBody(box, a) {
        const hist = _b.getNpcHistory(a.key);
        const cnt = box.querySelector('.lsh-count');
        if (cnt) cnt.textContent = hist.length + ' 條';
        const list = box.querySelector('.lsh-list');
        if (!list) return;
        if (!hist.length) { list.innerHTML = '<div class="lsh-empty">── 還沒有對話 ──</div>'; return; }
        list.innerHTML = '';
        hist.forEach((m, i) => {
            const isMe = m.role === 'user';
            // 一則回覆常有好幾句 [Char|名|表情|「…」]：每一句都列出來（10-13 她：「只給第一句」——以前只抓第一個「」）
            const qs = String(m.content || '').match(/「[\s\S]*?」/g);
            const plain = (qs ? qs.map(q => q.slice(1, -1).trim()).filter(Boolean).join('\n') : String(m.content || '').replace(/\[[^\]]*\]/g, '').replace(/<[^>]*>/g, '')).trim();
            const row = document.createElement('div');
            row.className = 'lsh-row' + (isMe ? ' me' : '');
            row.innerHTML = '<span class="lsh-who"></span><div class="lsh-text"></div>'
                + '<button class="lsh-del" title="刪除這條"><i class="fa-solid fa-xmark"></i></button>';
            row.querySelector('.lsh-who').textContent = isMe ? '訪客' : (a.name || '角色');
            row.querySelector('.lsh-text').textContent = plain || '（無內容）';
            row.querySelector('.lsh-del').addEventListener('click', () => {
                const arr = _b.getNpcHistory(a.key); arr.splice(i, 1); _b.setNpcHistory(a.key, arr); _renderNpcHistoryBody(box, a);
            });
            list.appendChild(row);
        });
        list.scrollTop = list.scrollHeight;
    }
    function _openNpcHistory(a) {
        _closeNpcHistory(); _closeDressRoom();
        // 兩種模式兩套長相，紀錄內容（_renderNpcHistoryBody）共用：
        //   舞台＝走路畫面上的深色小窗（原樣）。
        //   對話模式（沒有舞台，S.root 是 null）＝跟霧白右欄同一套的大卡，蓋一層遮罩在大廳上。
        //   🚨 以前對話模式直接借舞台那個 300px 深色小窗，在桌面上又小又黑、跟整個主畫面不搭。
        const flat = !S.root;
        // 舞台那種也掛在 .lobby-left（跟對話立繪同一層）：舞台那層自己是一整層（z-index:1），掛在裡面的窗再高都蓋不過立繪。
        //   10-13 起輸入框旁的紀錄鈕在舞台上也開這個窗，跟誰聊著的時候立繪正站在那裡，會把紀錄窗蓋掉一半
        const host = document.querySelector('.lobby-left') || S.root;
        if (!host) return;
        let box, root;
        if (flat) {
            root = document.createElement('div');
            root.className = 'lsh-pv';
            root.innerHTML =
                '<div class="lsh-pv-card" role="dialog">' +
                  '<div class="lsh-pv-hd">' +
                    '<span class="lsh-pv-title"><i class="fa-solid fa-comment-dots"></i> <span class="lsh-pv-name"></span> 的對話紀錄</span>' +
                    '<span class="lsh-count"></span>' +
                    '<button class="lsh-pv-x" data-act="close" type="button" aria-label="關閉"><i class="fa-solid fa-xmark"></i></button>' +
                  '</div>' +
                  '<div class="lsh-list"></div>' +
                  '<div class="lsh-pv-ft"><button class="lsh-pv-clear" data-act="clear" type="button"><i class="fa-solid fa-trash"></i> 清空（徹底遺忘）</button></div>' +
                '</div>';
            root.querySelector('.lsh-pv-name').textContent = a.name || '這位';
            box = root.querySelector('.lsh-pv-card');
            // 點遮罩（卡片外面）＝關掉
            root.addEventListener('click', (e) => { if (e.target === root) _closeNpcHistory(); });
        } else {
            root = box = document.createElement('div');
            box.className = 'lstage-dress lstage-history';
            box.innerHTML =
                '<div class="lsd-title"><i class="fa-solid fa-comment-dots"></i> 對話紀錄 — ' + _esc(a.name || '角色') + '<span class="lsh-count"></span></div>' +
                '<div class="lsh-list"></div>' +
                '<button class="lep-btn lep-danger" data-act="clear"><i class="fa-solid fa-trash"></i> 清空（徹底遺忘）</button>' +
                '<button class="lep-btn lep-done" data-act="close"><i class="fa-solid fa-check"></i> 關閉</button>';
        }
        host.appendChild(root);
        S.histEl = root;
        _renderNpcHistoryBody(box, a);
        box.addEventListener('click', async (e) => {
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'close') { _closeNpcHistory(); return; }
            if (act === 'clear') {
                if (!(await AUI.confirm('清空跟' + (a.name || '這位') + '的紀錄？\n連長期記憶一起清空，不可復原。', { okText: '清空' }))) return;
                _b.setNpcHistory(a.key, []);
                try { (window.OS_DB || (window.parent || window).OS_DB)?.saveNpcMemory?.(a.key, { name: a.name || '', summary: '', lastCompactAt: 0 }); } catch (e) {}
                _renderNpcHistoryBody(box, a);
            }
        });
    }

    // ── ✨ 裝扮室內建生成：選接口(ComfyUI/NAI)＋選預設包 → 用「角色頭像 prompt」直接生小小人 ──
    //   prompt=avatar_cache 存的頭像生成詞(外觀 ground truth，日誌客人撈頭像時順手釘上)。
    //   實際生圖那段在下面的 _renderSpriteImage（與世界門旅人自動補圖共用同一條管線）。
    const DRESS_GEN_KEY = 'lstage_dress_gen_v1';   // 記上次選的接口/預設包
    function _dressGenCfg() {
        try { const o = JSON.parse(localStorage.getItem(DRESS_GEN_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
    }
    function _dressGenSave(patch) {
        return AUI.lsSet(DRESS_GEN_KEY, JSON.stringify(Object.assign(_dressGenCfg(), patch)), '大廳小人用哪個預設包');
    }
    function _imgMgr() { return window.OS_IMAGE_MANAGER || (window.parent || window).OS_IMAGE_MANAGER || null; }
    // 頭像 prompt → 小人 prompt：[Avatar] 規範的「(表情, 服裝, 簡單背景)」括號組拆開，
    //   只拔 background 類 tag（背景交給預設包的底詞，不然 simple indoor background 會打架、去背也髒），
    //   表情/服裝保留——那件標誌性大衣就是角色識別，跟場景插圖的剝法(連服裝剝)刻意不同。
    function _spritePromptOf(p) {
        let s = String(p || '').replace(/[（(]([^（()]*)[)）]/g, (m, inner) => ', ' + inner + ', ');
        return s.split(',').map(t => t.trim())
            .filter(t => t && !/background$/i.test(t) && !/^background\b/i.test(t))
            .join(', ');
    }
    // 單張立姿圖＝只有一個人、全身、站著：這幾個字由這裡補，不靠預設包寫。
    //   沒寫的時候 Anima 把「chibi」配上一段大人外觀畫成角色設定表（一個正常比例的大人＋旁邊幾個小Q版）：
    //   10-29 她的「Q版人物」包連生 13 張都是這樣；同一套模型補了這幾個字（她的包、換一個角色各 4 張），8 張裡 7 張只剩一個Q版、1 張畫成兩個。
    //   背景：預設包底詞寫了就聽包的，沒寫才補白底（沒寫時常給灰漸層或角色殘影，去背也髒）。
    //   走路圖（3×4）不經過這裡：一張裡本來就有十二個他。
    function _standeePromptOf(prompt, base) {
        const p = String(prompt || '').trim(), b = String(base || '');
        const has = (re) => re.test(p) || re.test(b);
        const head = [];
        if (!has(/\bsolo\b/i)) head.push('solo');
        if (!has(/\bfull[\s_-]?body\b/i)) head.push('full body');
        if (!has(/\bstanding\b/i)) head.push('standing');
        const tail = has(/background/i) ? [] : ['simple background', 'white background'];
        return head.concat(p ? [p] : [], tail).join(', ');
    }
    function _dressPresetsOf(src) {
        const M = _imgMgr();
        if (!M?.config) return [];
        if (src === 'novelai') return (M.config.novelai?.naiPresets || []);
        return (M.config.comfyuiDirect?.presets || []);
    }
    // 預設包身分：id 沒有就用 name（ComfyUI 包常沒 id 欄——只認 id 會「每次都要重選」）
    function _dressPresetKey(p) { return (p && (p.id || p.name)) || ''; }
    function _dressSavedKey(src) {
        const c = _dressGenCfg();
        return src === 'novelai' ? (c.naiPreset || c.naiPresetId || '') : (c.comfyPreset || c.comfyPresetId || '');
    }
    // 🎭 用哪個預設包畫（11-16 角色中心第二步）：以前是裝扮室裡的兩個下拉（接口、預設包），每個角色頁都看得到、
    //   單張和走路圖共用一個選擇（要生走路圖得先把包換成會畫 3×4 的那個）。現在搬到 設置 → 圖片 → 畫風 的「大廳的小人」，
    //   單張立姿、走路圖各選一包，角色頁只剩按鈕（她：「好多那種設置按鍵，會不會讓人看起來像開發者面板」）。
    //   存在同一把鑰匙裡：{ img:{src,key}, sheet:{src,key} }；舊的 { src, comfyPreset, naiPreset }（以前在裝扮室選的那一個）
    //   在新的還沒選時照舊拿來用——她原本選好的那包不用重選。回 { src, key, preset }；沒選、或那包已經被刪掉回 null。
    function _dressPackOf(kind) {
        const c = _dressGenCfg();
        const k = kind === 'sheet' ? 'sheet' : 'img';
        let pick = (c[k] && c[k].key) ? { src: c[k].src === 'novelai' ? 'novelai' : 'comfyui_direct', key: c[k].key } : null;
        if (!pick) {
            const src = c.src === 'novelai' ? 'novelai' : 'comfyui_direct';
            const key = _dressSavedKey(src);
            if (key) pick = { src, key };
        }
        if (!pick) return null;
        const preset = _dressPresetsOf(pick.src).find(p => _dressPresetKey(p) === pick.key);
        return preset ? { src: pick.src, key: pick.key, preset } : null;
    }
    // 設置頁選了就存：v＝「接口|預設包」。回 false＝沒存到（空間滿）
    function _dressSetPack(kind, v) {
        const i = String(v || '').indexOf('|');
        const patch = {};
        patch[kind === 'sheet' ? 'sheet' : 'img'] = (i > 0) ? { src: String(v).slice(0, i), key: String(v).slice(i + 1) } : null;
        return _dressGenSave(patch);
    }
    function _dressGenHtml(a) {
        return '<div class="lsd-gen">' +
            '<div class="lsd-gen-title"><i class="fa-solid fa-wand-magic-sparkles"></i> 生成小小人（用這位的頭像外觀）</div>' +
            '<button class="lep-btn lsd-gen-btn-doll"' + (a.avatarPrompt ? '' : ' disabled title="這位還沒有頭像資料（劇情裡生成過頭像才有外觀依據）"') + '><i class="fa-solid fa-egg"></i> 生成不倒翁小人</button>' +
            '<button class="lep-btn lsd-gen-btn"' + (a.avatarPrompt ? '' : ' disabled title="這位還沒有頭像資料（劇情裡生成過頭像才有外觀依據）"') + '><i class="fa-solid fa-wand-magic-sparkles"></i> 生成單張立姿圖</button>' +
            '<button class="lep-btn lsd-gen-btn-sheet"' + (a.avatarPrompt ? '' : ' disabled title="這位還沒有頭像資料（劇情裡生成過頭像才有外觀依據）"') + '><i class="fa-solid fa-person-walking"></i> 生成走路圖（3×4）</button>' +
        '</div>';
    }
    function _dressSpriteHtml(a) {
        return '<button class="lep-btn lsd-sprite-btn"' + (a.avatarPrompt ? '' : ' disabled title="這位還沒有頭像資料（劇情裡生成過頭像才有外觀依據）"') + '><i class="fa-solid fa-image-portrait"></i> 生成立繪</button>' +
        '<div class="lsd-hint">立繪＝對話框裡的角色大圖，跟上面的小人是兩回事；走劇情角色卡「一鍵生立繪」同一套，生完劇情那邊共用同一張。</div>';
    }
    // 把邊界內的3×4逐格畫進目標畫布（flips[r]=該列左右鏡像；共用於即時預覽與最終重切）
    function _paintSheet(ctx, img, b, flips, dcw, dch) {
        const natW = img.naturalWidth || 1, natH = img.naturalHeight || 1;
        const gl = b.left * natW, gr = b.right * natW, gt = b.top * natH, gb = b.bottom * natH;
        const cw = (gr - gl) / 3, ch = (gb - gt) / 4;
        ctx.imageSmoothingEnabled = false;
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
            const sx = gl + c * cw, sy = gt + r * ch;
            if (flips && flips[r]) {   // 鏡像：翻轉整格像素，走路幀序不變（左走鏡像＝右走）
                ctx.save(); ctx.translate((c + 1) * dcw, r * dch); ctx.scale(-1, 1);
                ctx.drawImage(img, sx, sy, cw, ch, 0, 0, dcw, dch); ctx.restore();
            } else ctx.drawImage(img, sx, sy, cw, ch, c * dcw, r * dch, dcw, dch);
        }
    }
    // 依邊界+翻轉把原始3×4重切成乾淨等格(消除AI隨機留白/位移、修LoRA朝向錯的列)
    function _resliceSheet(img, b, flips) {
        const natW = img.naturalWidth || 1, natH = img.naturalHeight || 1;
        const ocw = Math.max(1, Math.round((b.right - b.left) * natW / 3));
        const och = Math.max(1, Math.round((b.bottom - b.top) * natH / 4));
        const cv = document.createElement('canvas'); cv.width = ocw * 3; cv.height = och * 4;
        _paintSheet(cv.getContext('2d'), img, b, flips, ocw, och);
        return cv.toDataURL('image/png');
    }
    function _lgpSlider(label, key, min, max, val) {
        return '<label class="lgp-srow"><span>' + label + '</span>' +
            '<input class="lgp-slider" data-k="' + key + '" type="range" min="' + min + '" max="' + max + '" value="' + val + '" step="0.5"></label>';
    }
    // 生成預覽：套用前先看圖。走路圖=可拖邊界的調框器（生成隨機→逐張把紅格對準每格角色含腳）＋每列翻轉（修LoRA朝向錯的列，如右列鏡像自左列）＋即時結果
    function _showGenPreview(dataUrl, kind, h, host) {
        const isSheet = (kind === 'sheet');
        const isViews = (kind === 'views');   // 🧸 不倒翁小人三面：dataUrl＝{ front, side, back }
        const wrap = document.createElement('div');
        wrap.className = 'lstage-genprev';
        wrap.innerHTML =
            '<div class="lgp-box">' +
                '<div class="lgp-title">' + (isSheet ? '走路圖調框（3×4）' : (isViews ? '不倒翁小人預覽' : '單張立姿預覽')) + '</div>' +
                (isViews
                    ? '<div class="lgp-views">' + [['front', '正面'], ['side', '側面'], ['back', '背面']].map(v =>
                        '<figure class="lgp-view"><img class="lgp-img" src="' + _esc(dataUrl[v[0]]) + '" alt=""><figcaption>' + v[1] + '</figcaption></figure>').join('') + '</div>'
                    : isSheet
                    ? '<div class="lgp-sheetwrap"><img class="lgp-img lgp-sheetimg" src="' + _esc(dataUrl) + '"><canvas class="lgp-grid"></canvas></div>' +
                      '<div class="lgp-sliders">' +
                        _lgpSlider('上', 'top', 0, 40, 0) + _lgpSlider('下', 'bottom', 60, 100, 100) +
                        _lgpSlider('左', 'left', 0, 40, 0) + _lgpSlider('右', 'right', 60, 100, 100) +
                      '</div>' +
                      '<div class="lgp-flips"><span>翻轉列</span>' +
                        ['下', '左', '右', '上'].map((d, i) => '<button class="lgp-flip" data-r="' + i + '"><i class="fa-solid fa-left-right"></i>' + d + '</button>').join('') +
                      '</div>' +
                      '<div class="lgp-reslabel">套用後（重切＋翻轉）</div>' +
                      '<canvas class="lgp-result"></canvas>'
                    : '<img class="lgp-img" src="' + _esc(dataUrl) + '">') +
                '<div class="lgp-hint">' + (isSheet ? '紅格對準每格角色含腳；某列朝向錯就按「翻轉列」左右鏡像（右列常可鏡像自左列）' : (isViews ? '三隻是不是同一個人、側面是不是臉朝右，看過再套用' : '看去背乾不乾淨、有沒有缺手缺腳再套用')) + '</div>' +
                '<div class="lgp-btns">' +
                    '<button class="lep-btn lgp-apply"><i class="fa-solid fa-check"></i> 套用</button>' +
                    '<button class="lep-btn lgp-retry"><i class="fa-solid fa-rotate"></i> 重新生成</button>' +
                    '<button class="lep-btn lgp-cancel"><i class="fa-solid fa-xmark"></i> 取消</button>' +
                '</div>' +
            '</div>';
        (host || S.root).appendChild(wrap);   // host＝角色中心那個窗（從那一頁生的，蓋在大廳舞台上會被它擋住）
        const close = () => wrap.remove();
        let getFinal = () => dataUrl;   // 單張立姿：原樣套用
        if (isSheet) {
            const img = wrap.querySelector('.lgp-sheetimg');
            const cvs = wrap.querySelector('.lgp-grid');
            const result = wrap.querySelector('.lgp-result');
            const flips = [false, false, false, false];
            const sl = {}; wrap.querySelectorAll('.lgp-slider').forEach(s => { sl[s.dataset.k] = s; });
            const bounds = () => ({ top: +sl.top.value / 100, bottom: +sl.bottom.value / 100, left: +sl.left.value / 100, right: +sl.right.value / 100 });
            const redraw = () => {
                const b = bounds(), w = img.clientWidth, hh = img.clientHeight;
                if (!w || !hh) return;
                // 紅格疊在原圖上
                cvs.width = w; cvs.height = hh;
                const ctx = cvs.getContext('2d');
                ctx.clearRect(0, 0, w, hh);
                ctx.strokeStyle = 'rgba(255,70,70,.92)'; ctx.lineWidth = 1;
                const gl = b.left * w, gr = b.right * w, gt = b.top * hh, gb = b.bottom * hh;
                const cw = (gr - gl) / 3, ch = (gb - gt) / 4;
                for (let c = 0; c <= 3; c++) { const x = gl + c * cw; ctx.beginPath(); ctx.moveTo(x, gt); ctx.lineTo(x, gb); ctx.stroke(); }
                for (let r = 0; r <= 4; r++) { const y = gt + r * ch; ctx.beginPath(); ctx.moveTo(gl, y); ctx.lineTo(gr, y); ctx.stroke(); }
                // 即時結果（重切＋翻轉後）
                result.width = w; result.height = hh;
                const rctx = result.getContext('2d');
                rctx.clearRect(0, 0, w, hh);
                _paintSheet(rctx, img, b, flips, w / 3, hh / 4);
            };
            wrap.querySelectorAll('.lgp-slider').forEach(s => s.addEventListener('input', redraw));
            wrap.querySelectorAll('.lgp-flip').forEach(btn => btn.addEventListener('click', () => {
                const r = +btn.dataset.r; flips[r] = !flips[r]; btn.classList.toggle('on', flips[r]); redraw();
            }));
            if (img.complete) redraw(); else img.addEventListener('load', redraw);
            getFinal = () => _resliceSheet(img, bounds(), flips);
        }
        wrap.querySelector('.lgp-apply').addEventListener('click', async () => { const out = await getFinal(); close(); h.apply && h.apply(out); });
        wrap.querySelector('.lgp-retry').addEventListener('click', () => { close(); h.retry && h.retry(); });
        wrap.querySelector('.lgp-cancel').addEventListener('click', () => { close(); h.cancel && h.cancel(); });
    }
    // ── 🎨 生圖→去背像素化→可存的 dataURL（裝扮室按鈕與世界門自動補圖共用這一段）──
    //   ComfyUI 走 previewComfyPreset(吃預設包、不碰全域設定)；NAI 走快照→套包→生成→finally 還原
    //   （transient 鐵律，跟 profile 切換同款）。kind='sheet' 只去背，跳過會毀 3×4 網格的掃碎片/裁切。
    //   只回圖、不落地：要不要存皮膚、要不要先給人看過，由呼叫方決定。
    async function _renderSpriteImage(prompt, src, preset, kind) {
        const M = _imgMgr();
        if (!M) throw new Error('生圖引擎還沒載入');
        if (kind !== 'sheet') {
            const base = src === 'novelai'
                ? (preset.charBasePrompt !== undefined ? preset.charBasePrompt : (M.config.novelai || {}).charBasePrompt)
                : (preset.basePrompt != null ? preset.basePrompt : (M.config.comfyuiDirect || {}).basePrompt);
            prompt = _standeePromptOf(prompt, base);
        }
        let imgUrl = '';
        if (src === 'novelai') {
            const nai = M.config.novelai || (M.config.novelai = {});
            const KEYS = ['charBasePrompt', 'charNegPrompt', 'sampler', 'scale', 'steps', 'ucPreset'];
            const snap = {}; KEYS.forEach(k => { snap[k] = nai[k]; });
            KEYS.forEach(k => { if (preset[k] !== undefined) nai[k] = preset[k]; });
            try {
                // 尺寸只聽包：拖圖進包時有存原圖尺寸；包沒存(手存舊包)就交給引擎預設，不自己塞數字
                imgUrl = await M.generate(prompt, 'char', { provider: 'novelai', width: preset.width, height: preset.height });
            } finally { KEYS.forEach(k => { nai[k] = snap[k]; }); }
        } else {
            imgUrl = await M.previewComfyPreset(preset, prompt, { packSize: true });   // 尺寸用包裡調的 width/height
        }
        if (!imgUrl) throw new Error('接口沒回圖（檢查連線/預設包）');
        let final = await _b.pixelify(imgUrl, { noGrid: true, sheet: kind === 'sheet' });
        if (!final) {
            // blob:/http 網址不能直接進 IDB（重整就死/會失連）→ 轉 dataURL 再存
            if (/^(blob:|https?:)/i.test(String(imgUrl))) {
                try {
                    const b = await (await fetch(imgUrl)).blob();
                    final = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
                } catch (e) { throw new Error('圖拿到了但存不下來（轉檔失敗）'); }
            } else final = imgUrl;
        }
        return final;
    }
    async function _saveSpriteSkin(key, data, kind) {
        const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await _b.idbPut(id, data);
        // 只存大廳小人皮膚，不碰對話立繪(a.portrait)——那是另一套東西(Rae定案 2026-07-17)
        const ok = _b.saveSkin(key, { kind: kind === 'sheet' ? 'sheet' : 'img', ref: { idb: id } });
        // 索引沒寫進去(localStorage 滿了)就把剛落地的圖收回來：留著也沒人引用得到，
        //   只會在 IndexedDB 裡變成孤兒，而且下一輪重生又會再堆一張。
        if (ok === false) { try { await _b.idbDel(id); } catch (e) {} return false; }
        return true;
    }

    // ── 🧸 不倒翁小人（11-16 角色中心第三步）──
    //   她：一次生三種把小人跟立繪擠在同一張，畫風是加在整張上的，小人被立繪的畫風帶走（「怎麼畫風全一樣了」）
    //   →「想做不倒翁到裝扮室?」：小人在這裡單獨生一張，走名冊自己那一列（OS_IMAGE_MANAGER.USES 的 doll），
    //     用哪組接口、加不加畫風都在 設置 → 圖片 → 畫風「每個地方用什麼」的「不倒翁小人」那列選，不跟立繪共用。
    //   接自訂接口（GPT 那種讀句子的）：照下面這段畫一張三隻（正面／側面／背面並排），原樣送（raw：接口那格底詞常寫著她的畫風，不接），再附一張樣張（_dollRef）。
    //   接其他的（ComfyUI、NAI…吃標籤的）：外觀標籤＋「一個人、全身、站著」，畫風交給那組自己的底詞（她的小人 LoRA 包）；通常是一隻。
    //   出來的圖去背後看是不是三隻並排（VN_Core._chibiViews，同一次生三種那套）：是＝切三張、接上鞋和手拼成走路圖（_dollAttach）；不是＝一張。
    //   🚨 側面寫死「臉朝右」：大廳（lobby_stage.js 的 placeActor）當它朝右，往左走才鏡像；改這裡那邊要一起改。
    //   🚨 沒手沒腳要明講（11-16 她：「你有沒有告知他不准有手和腳? 因為你的 api image 會跑出手」）：
    //     原本只正面講「只有兩個形狀：頭＋蛋形身體」、不寫 no arms／no legs（那是吃標籤的模型看不懂否定句的教訓），
    //     但這段只送給讀句子的自訂接口，它看得懂否定；長相裡寫著袖子、手套、鞋，它就照著長出手來。下面 DOLL_TPL 和樣張那段說法（DOLL_REF_LEAD）都寫了。
    //   👀 眼睛照角色走、不抄樣張（11-19 她：「GPT生成的眼睛都依樣……他現在就是照著抄參考圖的眼睛，但不是每個角色都是可愛角色阿」）：
    //     以前 DOLL_TPL 寫死 large round eyes＋腮紅、樣張那段叫它「眼睛和臉的畫法照原圖」只准換眼睛顏色 → 每個人都是樣張那雙圓眼。
    //     現在眼睛、眉毛、嘴、腮紅都算「要換的」，照長相描述寫的（沒寫就照年紀、氣質）；照原圖留的只剩頭身輪廓、耳朵、線條和平塗。
    const DOLL_LOOK = '【角色外觀】';
    const DOLL_TPL_KEY = 'os_doll_tpl';
    const DOLL_TPL = 'a turnaround sheet of one small round-bottomed tumbler toy doll, drawn in a flat, simple mascot style; the doll is this character: 【角色外觀】;\n\n'
        + 'the same doll appears three times side by side in one row, all three the same size and resting on the same ground line, on one continuous plain white background: on the left seen from the front, in the middle in full profile with its face pointing to the right, on the right seen from behind;\n\n'
        + 'each doll is made of only two solid shapes, an oversized round head resting directly on a small smooth egg-shaped body with a rounded bottom; the doll has no arms, no hands, no legs and no feet, and nothing sticks out of the egg-shaped body; the head keeps the character\'s hairstyle, hair color and eye color; the eyes, eyebrows and mouth show this particular character\'s own look and temperament, not a generic cute face: take the eye shape, eye size, gaze and expression from the description (for example narrow sharp eyes, sleepy half-closed eyes, a stern frown, a calm faint smile, a cold stare), and when the description says nothing about them, choose ones that fit the character\'s age, mood and style; add blush on the cheeks only if it suits the character; the character\'s outfit is painted flat onto the surface of the egg-shaped body, and the doll seen from behind shows the back of the hair and the back of the outfit;\n\n'
        + 'flat colors, thin clean outlines; the image contains only these three dolls, evenly spaced with clear white gaps between them and clear white margin around them;';
    function _dollTpl() {
        let t = null;
        try { t = localStorage.getItem(DOLL_TPL_KEY); } catch (e) {}
        return (t && t.trim()) ? t : DOLL_TPL;
    }
    // 🖼 樣張（11-16 她：「畫風怎麼感覺還是不對，怎麼沒參考圖嗎」→ 貼了一張她要的小人三面圖「拿這張」）：
    //   接自訂接口、而且那組收得到圖時，每次都把這張當參考圖一起送（走 _layoutRef：不看節點上「帶參考圖」那個開關，那個只管插圖帶角色立繪）。
    //   圖在素材庫 doll_ref_v1/，鎖 commit 抓、抓不到換 raw（同 lobby_cafe_regulars.js 的 DOLL_REF）。換樣張＝傳新圖、換下面這個 commit。
    //   🚨 樣張的側面是臉朝右，跟 DOLL_TPL、大廳 placeActor 同一個方向；換圖時側面也要朝右。
    //   🚨 樣張要跟出圖同一個比例（3:2，1536×1024）：她第一次生出來「感覺有被故意拉長了，可能尺寸不對???」——
    //     那時樣張是原圖的扁長條（2010×782），出圖是 3:2，它照樣張的排法填滿畫面就把小人往上拉。現在這張是原圖縮到 1536 寬、上下補白到 1024。
    //   抓不到樣張就不畫（丟錯），不退成只送文字：只送文字畫出來就是她說畫風不對的那種，白花一張。
    const DOLL_REF_URL = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@00c3d185eeff0787fc05ee2a7ebdc04b1878bf9c/doll_ref_v1/tumbler_sheet_3x2.webp';
    //   說法照「直接改這張」寫、把「只改什麼」和「照原圖留著什麼」分開（11-16 她轉來阿洛試出來的：參考圖只帶得動外觀，鎖不住「沒有手」的結構；
    //     當成樣張叫它照著畫，它換衣服時會順手補出普通小人的身體。直接改這隻、固定外輪廓、衣服只畫在原本身體裡，才留得住）。
    const DOLL_REF_LEAD = 'Edit the doll sheet in image {n} directly: keep its three dolls and turn them into the character described below.\n'
        + 'Change only: the hairstyle and hair color, anything worn on the head or face, the eyes, the eyebrows, the mouth and the blush, and the colors and patterns painted on the body, so that they match that character.\n'
        + 'The eyes in image {n} are only a placeholder; do not copy them. Give this character their own eyes and expression: '
        + 'take the eye shape, eye size, eye color, gaze, eyebrows and mouth from the description (for example narrow sharp eyes, sleepy half-closed eyes, a stern frown, a calm faint smile, a cold stare), '
        + 'and when the description says nothing about them, choose ones that fit the character\'s age, mood and style. Not every character is cute; a serious, cold, tired or fierce character gets a face that shows it. '
        + 'Keep the blush only if it suits the character.\n'
        + 'Keep exactly as in image {n}: the proportion between head and body, the outline of the head and the outline of the body, the chin sitting directly on the body, '
        + 'the way the ears are drawn, the thin outlines and flat coloring, the plain white background, '
        + 'the size and position of the three dolls on the canvas with the same empty white space above and below them, '
        + 'and the three views: front view on the left, side view with the face pointing to the right in the middle, back view on the right.\n'
        + 'The body stays one complete, short, round egg shape whose left and right outlines are smooth and unbroken. '
        + 'Every detail of the outfit, such as a collar, buttons, pockets or an apron, is painted flat inside that egg outline. '
        + 'The doll has no shoulders, no arms, no sleeves, no cuffs, no hands, no fingers, no legs and no feet; '
        + 'where the description mentions them, or gloves, shoes or something held in the hand, leave them out. '
        + 'It stays this tumbler doll and does not turn into an ordinary chibi figure wearing clothes.';
    let _dollRefBlob = null;
    async function _dollRef() {
        if (!_dollRefBlob) {
            const grab = async (u) => {
                const r = await fetch(u);
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const b = await r.blob();
                if (!/^image\//i.test(b.type)) throw new Error('拿到的不是圖');
                return b;
            };
            try { _dollRefBlob = await grab(DOLL_REF_URL); }
            catch (e) {
                const alt = _b.sfMirror ? _b.sfMirror(DOLL_REF_URL) : null;
                if (!alt) throw e;
                _dollRefBlob = await grab(alt);
            }
        }
        return { name: 'the sample doll sheet', kind: 'layout', lead: DOLL_REF_LEAD, blob: _dollRefBlob };
    }
    const _blobToData = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });
    // 🦶 接鞋和手（11-16 她生成功之後：「但面板上還是沒手沒腳」→ 看過小樣「好，接上」）：
    //   圖故意畫成沒手沒腳，手腳由這裡接：鞋＝衣櫥那雙（素材庫 doll_ref_v1/shoes.png，六隻拼一張：正面兩隻、背面兩隻、側面近／遠，側面朝右），
    //   手＝照他臉上的膚色畫的小圓。接好拼成 3×4 走路圖（列：往下／往左／往右／往上；欄：踏一步／站著／踏另一步，同書咖常客那種），
    //   存成造型 kind:'sheet'＋doll:2（1＝11-17 之前接的小圓手，進大廳或開裝扮頁時會換成衣櫥的拳頭，見 _dollRefist）——大廳本來就認走路圖，走路時腳會踏步；預覽、展示台從這張切站著的三格出來看（_dollCells）。
    //   位置的數字是接鞋小樣（本機 lora-train 那邊）的單位：那邊正面身體寬 278，鞋的左上角相對「圓底中心、圓底最低點」，這裡照他正面身體多寬等比縮。
    //   鞋子圖抓不到＝這次不接、講明（圖已經花錢畫好了，不整張作廢），照舊存三面；之後進大廳會再補接一次（_dollUpgrade）。
    const DOLL_SHOES_URL = 'https://cdn.jsdelivr.net/gh/nancywang3641/sound-files@dd66662b70a412a39ac940c6d75950fbf64f924a/doll_ref_v1/shoes.png';
    // ✊ 拳頭＝衣櫥那顆，形狀、大小、位置都照衣櫥（11-17 她：「這小拳頭是怎麼回事...請認真去隔壁衣櫥看一下尺寸」）。
    //   11-16 第一版是我自己估的小圓（半徑 33、貼在身體邊上），寬只有身體的兩成多；衣櫥的拳頭寬是身體的六成多、離身體一小段懸著。
    //   數字的來源：衣櫥 mochi-wardrobe.js 的 FIST_D（中心 92.5,301，約 60×57）、DEFAULT.fist { x:100.06, y:318, s:1.0345 }、
    //   身體中線 190、身體最低點 337.62。衣櫥一單位＝這裡 2.71（本機 參考資料/CUT_FIX_LAB.html 11-15 量的那把尺，鞋也是照它縮的）。
    //   衣櫥在哪：C:\Users\<她>\.codex\visualizations\2026\10\18\01a1501a-…\ember-wardrobe（桌面捷徑「小火苗衣櫥」）。
    const DOLL_FIST = {
        d: 'M91 274 C77 272 65 284 64 296 C60 313 72 326 88 328 C103 331 119 320 121 307 C124 290 108 275 96 275Z',
        thumb: 'M102 304 Q94 304 94 314 L90 327', gloss: 'M74 285 Q82 278 90 279', cx: 92.5, cy: 301,
    };
    const DOLL_LIMB = {
        bodyW: 278, below: 50, cellH: 420,
        fistK: 2.803,     // 拳頭那條外框放大幾倍：1.0345 × 2.71
        fistX: 243.7,     // 拳頭中心離身體中線：(190 − 100.06) × 2.71
        fistUp: 53.2,     // 拳頭中心比圓底最低點高多少：(337.62 − 318) × 2.71
        fistSideX: 29,    // 側面那顆在身體中線前面一點（衣櫥側面站著時量的 10.8 單位）
        fistHalf: 88,     // 拳頭半寬含外框（算格子要多寬用）
        // 每隻鞋：在 shoes.png 的哪一塊 [x, y, w, h]＋左上角相對圓底 (dx, dy)；陣列裡先寫的先畫（在後面）
        front: [{ r: [0, 0, 113, 69], dx: -117.5, dy: -20 }, { r: [113, 0, 113, 69], dx: 0.5, dy: -20 }],
        back:  [{ r: [226, 0, 113, 69], dx: -119.5, dy: -20 }, { r: [339, 0, 113, 69], dx: -1.5, dy: -20 }],
        side:  [{ r: [549, 0, 97, 79], dx: -55, dy: -46 }, { r: [452, 0, 97, 80], dx: -31, dy: -30 }],   // 遠的那隻先畫
        // 三欄的姿勢（跳的高度換到大廳畫面上大約 6px，跟單張小人走路的彈跳一樣）：body＝整隻往上多少；shoe[i]＝那隻鞋偏多少 [dx, dy]；fist＝手偏多少 [dx, dy]
        hop:     [{ body: -22, shoe: [[0, -30], [0, -12]], fist: [0, -6] }, { body: 0, shoe: [[0, 0], [0, 0]], fist: [0, 0] }, { body: -22, shoe: [[0, -12], [0, -30]], fist: [0, -6] }],
        walk:    [{ body: -8, shoe: [[18, -9], [-16, 0]], fist: [-16, 0] }, { body: 0, shoe: [[0, 0], [0, 0]], fist: [0, 0] }, { body: -8, shoe: [[-16, 0], [18, -9]], fist: [16, 0] }],
    };
    function _loadImg(src, cors) {
        return new Promise((res, rej) => { const im = new Image(); if (cors) im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => rej(new Error('圖讀不進來')); im.src = src; });
    }
    let _dollShoesImg = null;
    async function _dollShoes() {
        if (_dollShoesImg) return _dollShoesImg;
        try { _dollShoesImg = await _loadImg(DOLL_SHOES_URL, true); }
        catch (e) {
            const alt = _b.sfMirror ? _b.sfMirror(DOLL_SHOES_URL) : null;
            if (!alt) throw e;
            _dollShoesImg = await _loadImg(alt, true);
        }
        return _dollShoesImg;
    }
    // 量一面：不透明的範圍、圓底中心（cx）和最低點（bot）、身體多寬（bw）
    function _dollMeasure(img) {
        const W = img.naturalWidth, H = img.naturalHeight;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, W, H).data;
        const on = (x, y) => d[(y * W + x) * 4 + 3] >= 40;
        let top = -1, bot = -1, left = W, right = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) { if (top < 0) top = y; bot = y; if (x < left) left = x; if (x > right) right = x; }
        if (top < 0) return null;
        const dh = bot - top + 1;
        const med = (arr) => { const a = arr.slice().sort((p, q) => p - q); return a.length ? a[a.length >> 1] : null; };
        // 一排裡最寬的那一段（旁邊垂下來的髮尾是另一段，不算）
        const widest = (y) => { let best = null, s = -1; for (let x = 0; x <= W; x++) { const v = x < W && on(x, y); if (v && s < 0) s = x; if (!v && s >= 0) { if (!best || x - s > best[1] - best[0] + 1) best = [s, x - 1]; s = -1; } } return best; };
        const mids = [];
        for (let y = bot - Math.round(dh * 0.06); y <= bot - Math.round(dh * 0.01); y++) { const r = widest(y); if (r) mids.push((r[0] + r[1]) / 2); }
        const cx = med(mids);
        if (cx == null) return null;
        // 身體寬：圓底往上一成到兩成二那一帶，穿過中心的那一段
        const widths = [], X = Math.round(cx);
        for (let y = bot - Math.round(dh * 0.22); y <= bot - Math.round(dh * 0.10); y++) {
            if (!on(X, y)) continue;
            let a = X, b = X; while (a > 0 && on(a - 1, y)) a--; while (b < W - 1 && on(b + 1, y)) b++;
            widths.push(b - a + 1);
        }
        const bw = Math.max(dh * 0.24, Math.min(dh * 0.5, med(widths) || dh * 0.36));
        return { img: img, W: W, data: d, top: top, bot: bot, left: left, right: right, dh: dh, cx: cx, bw: bw };
    }
    // 手的顏色：正面臉中間那一帶最多的顏色；外框＝同一個顏色壓深
    function _dollSkin(m) {
        const cnt = new Map(); let best = null, bn = 0;
        const x0 = Math.max(0, Math.round(m.cx - m.dh * 0.12)), x1 = Math.min(m.W - 1, Math.round(m.cx + m.dh * 0.12));
        for (let y = m.top + Math.round(m.dh * 0.40); y <= m.top + Math.round(m.dh * 0.58); y += 2) for (let x = x0; x <= x1; x += 2) {
            const i = (y * m.W + x) * 4;
            if (m.data[i + 3] < 200) continue;
            const k = (m.data[i] >> 3) + ',' + (m.data[i + 1] >> 3) + ',' + (m.data[i + 2] >> 3);
            const n = (cnt.get(k) || 0) + 1; cnt.set(k, n);
            if (n > bn) { bn = n; best = k; }
        }
        return _dollSkinOf(best ? best.split(',').map(v => (+v << 3) + 4) : [250, 222, 198]);
    }
    // 膚色 [r,g,b] → 拳頭用的三個顏色：底色、外框和拇指線（壓深）、手背那道亮線（提亮）
    function _dollSkinOf(p) {
        const dark = [0.82, 0.68, 0.6];
        return {
            rgb: p,
            fill: 'rgb(' + p.join(',') + ')',
            line: 'rgb(' + p.map((v, i) => Math.round(v * dark[i])).join(',') + ')',
            gloss: 'rgb(' + p.map(v => Math.round(v + (255 - v) * 0.6)).join(',') + ')',
        };
    }
    // 畫一顆衣櫥的拳頭：中心在 (x, y)，k＝外框放大幾倍；mirror＝左右翻（畫面右邊那隻、朝右的側面）
    let _dollFistP = null;
    function _dollFist(g, x, y, k, mirror, skin) {
        if (!_dollFistP) _dollFistP = { d: new Path2D(DOLL_FIST.d), thumb: new Path2D(DOLL_FIST.thumb), gloss: new Path2D(DOLL_FIST.gloss) };
        const P = _dollFistP, w = 1 / 1.0345;   // 線寬照衣櫥的單位：外框 2、拇指線 2.2、亮線 2.6
        g.save();
        g.translate(x, y); g.scale(mirror ? -k : k, k); g.translate(-DOLL_FIST.cx, -DOLL_FIST.cy);
        g.lineJoin = 'round'; g.lineCap = 'round';
        g.fillStyle = skin.fill; g.fill(P.d);
        g.strokeStyle = skin.line; g.lineWidth = 2 * w; g.stroke(P.d);
        g.lineWidth = 2.2 * w; g.stroke(P.thumb);
        g.strokeStyle = skin.gloss; g.lineWidth = 2.6 * w; g.stroke(P.gloss);
        g.restore();
    }
    // 三面（去背好的 dataURL）→ { sheet: 3×4 走路圖, views: 站著的三格（接好手腳的正面／側面／背面） }
    async function _dollAttach(views) {
        const L = DOLL_LIMB, shoes = await _dollShoes(), M = {};
        for (const k of ['front', 'side', 'back']) {
            M[k] = _dollMeasure(await _loadImg(views[k]));
            if (!M[k]) throw new Error('量不到小人的位置');
        }
        const s = M.front.bw / L.bodyW, skin = _dollSkin(M.front);   // 三面同一個比例：照正面的身體
        let half = 0, up = 0;
        for (const k in M) {
            const m = M[k];
            half = Math.max(half, m.cx - m.left, m.right - m.cx, k === 'side' ? 0 : (L.fistX + L.fistHalf) * s);   // 正面、背面要放得下兩邊懸著的拳頭
            up = Math.max(up, m.bot - m.top);
        }
        half += 20 * s;                                       // 踏步、手前後擺要的寬
        const ch0 = up * 1.01 + (L.below + 26) * s;           // 上面留跳起來的高（hop 的 body 最多 -22）
        const k0 = Math.min(1, L.cellH / ch0);
        const cw = Math.ceil(half * 2 * k0), ch = Math.ceil(ch0 * k0);
        const cv = document.createElement('canvas'); cv.width = cw * 3; cv.height = ch * 4;
        const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
        const cell = (col, row, key, pose, mirror) => {
            const m = M[key];
            g.save();
            g.beginPath(); g.rect(col * cw, row * ch, cw, ch); g.clip();
            if (mirror) { g.translate(col * cw + cw, row * ch); g.scale(-1, 1); } else g.translate(col * cw, row * ch);
            g.translate(cw / 2, ch - 1); g.scale(k0, k0); g.translate(0, -L.below * s);   // 原點＝圓底中心、圓底最低點；格底＝鞋底
            L[key].forEach((o, i) => { const p = pose.shoe[i]; g.drawImage(shoes, o.r[0], o.r[1], o.r[2], o.r[3], (o.dx + p[0]) * s, (o.dy + p[1]) * s, o.r[2] * s, o.r[3] * s); });
            const by = pose.body * s, fy = (pose.body + pose.fist[1] - L.fistUp) * s, fx = L.fistX * s, sw = pose.fist[0] * s;
            const fist = (x, flip) => _dollFist(g, x, fy, L.fistK * s, flip, skin);
            if (key === 'back') { fist(-fx, false); fist(fx, true); }       // 背面：手在身體後面
            g.drawImage(m.img, -m.cx, by - m.bot);
            if (key === 'front') { fist(-fx, false); fist(fx, true); }
            if (key === 'side') fist(L.fistSideX * s + sw, true);           // 這格朝右，衣櫥的側面朝左，所以翻過來
            g.restore();
        };
        for (let c = 0; c < 3; c++) {
            cell(c, 0, 'front', L.hop[c]);          // 往下：正面一跳一跳
            cell(c, 1, 'side', L.walk[c], true);    // 往左：側面翻過來
            cell(c, 2, 'side', L.walk[c]);          // 往右：側面踏步
            cell(c, 3, 'back', L.hop[c]);           // 往上：背面一跳一跳
        }
        const cut = (row) => { const o = document.createElement('canvas'); o.width = cw; o.height = ch; o.getContext('2d').drawImage(cv, cw, row * ch, cw, ch, 0, 0, cw, ch); return o.toDataURL('image/png'); };
        return { sheet: cv.toDataURL('image/png'), views: { front: cut(0), side: cut(2), back: cut(3) } };
    }
    // 接好的走路圖 → 站著的三格（展示台的正面／側面／背面用）；同一張只切一次
    const _dollCellMemo = new Map();
    async function _dollCells(sheetSrc) {
        if (_dollCellMemo.has(sheetSrc)) return _dollCellMemo.get(sheetSrc);
        const im = await _loadImg(sheetSrc), cw = Math.floor(im.naturalWidth / 3), ch = Math.floor(im.naturalHeight / 4);
        const cut = (row) => { const o = document.createElement('canvas'); o.width = cw; o.height = ch; o.getContext('2d').drawImage(im, cw, row * ch, cw, ch, 0, 0, cw, ch); return o.toDataURL('image/png'); };
        const v = { front: cut(0), side: cut(2), back: cut(3) };
        if (_dollCellMemo.size > 8) _dollCellMemo.clear();
        _dollCellMemo.set(sheetSrc, v);
        return v;
    }
    // 接手腳之前存的三面造型（kind:'views'）→ 補接、改存成走路圖；大廳套造型時叫（lobby_stage.js 的 _applySkin）。接不成回 null＝照舊三面
    const _dollUpBusy = new Map();
    function _dollUpgrade(key, skin) {
        if (_dollUpBusy.has(key)) return _dollUpBusy.get(key);
        const p = (async () => {
            try {
                const v = { front: await _b.resolveRef(skin.ref), side: await _b.resolveRef(skin.side), back: await _b.resolveRef(skin.back) };
                if (!v.front || !v.side || !v.back) return null;
                const lim = await _dollAttach(v);
                const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                await _b.idbPut(id, lim.sheet);
                const next = { kind: 'sheet', ref: { idb: id }, doll: 2 };
                if (_b.saveSkin(key, next) === false) { try { await _b.idbDel(id); } catch (e) {} return null; }
                for (const r of [skin.ref, skin.side, skin.back]) { if (r && r.idb) { try { await _b.idbDel(r.idb); } catch (e) {} } }
                return next;
            } catch (e) { console.warn('[LobbyDress] 舊的不倒翁補接手腳沒成', e); return null; }
        })();
        _dollUpBusy.set(key, p);
        p.then(() => _dollUpBusy.delete(key), () => _dollUpBusy.delete(key));
        return p;
    }
    // ✊ 11-17 之前接好的不倒翁（doll:1）：手是我估的小圓。當時沒手沒腳的原圖沒留，沒辦法重接，所以直接改那張走路圖：
    //   找出舊的小圓（整片同一個顏色）→ 從它的位置反推當時的比例 → 擦掉 → 照衣櫥畫新的拳頭 → 存回去記 doll:2。
    //   認不出兩顆小圓（顏色、大小、左右、高度對不上）就不動、回 null：寧可留著小拳頭，也不亂塗她花錢生的圖。
    const _dollRefistBusy = new Map(), _dollRefistNo = new Set();
    function _dollRefist(key, skin) {
        if (!skin || skin.kind !== 'sheet' || skin.doll !== 1 || _dollRefistNo.has(key)) return Promise.resolve(null);
        if (_dollRefistBusy.has(key)) return _dollRefistBusy.get(key);
        const p = (async () => {
            try {
                const src = await _b.resolveRef(skin.ref);
                const fixed = src ? await _dollRefistSheet(src) : null;
                if (!fixed) { _dollRefistNo.add(key); return null; }   // 這次開著就不再試（每次套造型都會經過這裡）
                const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                await _b.idbPut(id, fixed);
                const next = { kind: 'sheet', ref: { idb: id }, doll: 2 };
                if (_b.saveSkin(key, next) === false) { try { await _b.idbDel(id); } catch (e) {} return null; }
                if (skin.ref && skin.ref.idb) { try { await _b.idbDel(skin.ref.idb); } catch (e) {} }
                return next;
            } catch (e) { console.warn('[LobbyDress] 舊的小圓手沒換成', e); _dollRefistNo.add(key); return null; }
        })();
        _dollRefistBusy.set(key, p);
        p.then(() => _dollRefistBusy.delete(key), () => _dollRefistBusy.delete(key));
        return p;
    }
    // 舊的走路圖（dataURL）→ 換好拳頭的走路圖（dataURL）；認不出來回 null
    //   舊的畫法（11-16）：手＝半徑 33 的圓，中心離身體中線 139＋0.35×33＝150.55、比圓底最低點高 105；
    //   正面畫在身體上面、背面畫在身體後面、側面畫在身體中線前面 12。單位都是「正面身體寬＝278」那把尺，下面的 u＝這張圖上一單位幾 px。
    async function _dollRefistSheet(sheetSrc) {
        const L = DOLL_LIMB, im = await _loadImg(sheetSrc);
        const cw = Math.floor(im.naturalWidth / 3), ch = Math.floor(im.naturalHeight / 4);
        if (cw < 40 || ch < 40) return null;
        const c0 = document.createElement('canvas'); c0.width = cw * 3; c0.height = ch * 4;
        const g0 = c0.getContext('2d', { willReadFrequently: true }); g0.drawImage(im, 0, 0);
        // 1. 站著的正面那格（中間那欄、第一列）下半找舊的手：一整片同一個顏色的兩顆圓。
        //    手的底色每個數字除以 8 都餘 4（_dollSkin 的算法）；鞋子、衣服也可能剛好有這種顏色，所以照多到少一個一個試，
        //    要「左右各一顆實心圓、一樣大、一樣高、離中線一樣遠、大小和高度對得上舊的畫法」才算
        const d = g0.getImageData(cw, 0, cw, ch).data, y0 = Math.floor(ch * 0.45), cnt = new Map();
        for (let y = y0; y < ch; y++) for (let x = 0; x < cw; x++) {
            const i = (y * cw + x) * 4;
            if (d[i + 3] !== 255 || (d[i] & 7) !== 4 || (d[i + 1] & 7) !== 4 || (d[i + 2] & 7) !== 4) continue;
            const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
            cnt.set(k, (cnt.get(k) || 0) + 1);
        }
        const disc = (o) => {   // 是不是一顆實心圓：實心圓的點在兩個方向的散開程度都是半徑的一半
            if (o.n < 40) return null;
            const x = o.sx / o.n, y = o.sy / o.n, R = Math.sqrt(o.n / Math.PI);
            const dx = Math.sqrt(Math.max(0, o.sxx / o.n - x * x)), dy = Math.sqrt(Math.max(0, o.syy / o.n - y * y));
            return (dx > R * 0.38 && dx < R * 0.62 && dy > R * 0.38 && dy < R * 0.62) ? { x: x, y: y, R: R } : null;
        };
        let rgb = null, u = 0, yb = 0;
        for (const [k] of Array.from(cnt.entries()).sort((p1, p2) => p2[1] - p1[1]).slice(0, 8)) {
            const c3 = [k >> 16, (k >> 8) & 255, k & 255];
            const two = [0, 1].map(() => ({ n: 0, sx: 0, sy: 0, sxx: 0, syy: 0 }));
            for (let y = y0; y < ch; y++) for (let x = 0; x < cw; x++) {
                const i = (y * cw + x) * 4;
                if (d[i + 3] !== 255 || d[i] !== c3[0] || d[i + 1] !== c3[1] || d[i + 2] !== c3[2]) continue;
                const o = two[x < cw / 2 ? 0 : 1]; o.n++; o.sx += x; o.sy += y; o.sxx += x * x; o.syy += y * y;
            }
            const a = disc(two[0]), b = disc(two[1]);
            if (!a || !b) continue;
            const Dl = cw / 2 - a.x, Dr = b.x - cw / 2, Rm = (a.R + b.R) / 2, uu = (Dl + Dr) / 2 / 150.55;
            if (!(uu > 0.05) || Math.abs(Dl - Dr) > Rm * 0.5 || Math.abs(a.y - b.y) > Rm * 0.5 || Math.abs(a.R - b.R) > Rm * 0.3) continue;
            if (Rm < 26 * uu || Rm > 36 * uu) continue;                           // 舊的手半徑 33，框線吃掉外面一圈
            const bottom = (a.y + b.y) / 2 + 105 * uu;                            // 圓底最低點在這格的哪一排
            if (Math.abs(bottom + L.below * uu - (ch - 1)) > 6 * uu + 2) continue;   // 鞋底應該貼著格子底
            rgb = c3; u = uu; yb = bottom;
            break;
        }
        if (!rgb) return null;

        // 2. 格子加寬到放得下新的拳頭，舊圖照原樣搬到每格正中間
        const cw2 = Math.max(cw, Math.ceil((L.fistX + L.fistHalf + 6) * u) * 2), ox = Math.floor((cw2 - cw) / 2);
        const cv = document.createElement('canvas'); cv.width = cw2 * 3; cv.height = ch * 4;
        const g = cv.getContext('2d', { willReadFrequently: true });
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.drawImage(c0, c * cw, r * ch, cw, ch, c * cw2 + ox, r * ch, cw, ch);
        const W = cv.width, H = cv.height, I = g.getImageData(0, 0, W, H), p = I.data;
        const skin = _dollSkinOf(rgb), lineRgb = rgb.map((v, i) => Math.round(v * [0.82, 0.68, 0.6][i]));
        const at = (x, y) => (y * W + x) * 4;
        const isFill = (i) => p[i + 3] === 255 && p[i] === rgb[0] && p[i + 1] === rgb[1] && p[i + 2] === rgb[2];
        const nearFist = (i) => {   // 顏色落在「手的底色到框線色」那條線附近（框線、邊緣的半透明）
            const v = [lineRgb[0] - rgb[0], lineRgb[1] - rgb[1], lineRgb[2] - rgb[2]], q = [p[i] - rgb[0], p[i + 1] - rgb[1], p[i + 2] - rgb[2]];
            const t = Math.max(0, Math.min(1, (q[0] * v[0] + q[1] * v[1] + q[2] * v[2]) / ((v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1)));
            const e0 = q[0] - t * v[0], e1 = q[1] - t * v[1], e2 = q[2] - t * v[2];
            return e0 * e0 + e1 * e1 + e2 * e2 < 900;
        };
        const band = Math.ceil(3 * u) + 2, Rout = 35 * u + 2;
        // 擦掉一顆舊的手：圓裡整片同色的點＋往外一圈框線。how＝它當時怎麼畫的：
        //   'edge'（正面）：畫在身體上面、蓋住身體的邊 → 那一圈全擦，再把身體的邊補回來；
        //   'mid'（側面）：畫在身體中間 → 全擦，洞用左右兩邊的顏色橫著補（衣服的條紋多半是橫的）；新的拳頭會蓋住大半，只有上緣露一點；
        //   'behind'（背面）：身體蓋著它 → 只擦顏色像手的，身體一點都不碰
        const wipe = (cx, cy, how, inner) => {
            const onTop = how !== 'behind';
            const x0 = Math.max(0, Math.floor(cx - Rout - band)), x1 = Math.min(W - 1, Math.ceil(cx + Rout + band));
            const y0b = Math.max(0, Math.floor(cy - Rout - band)), y1 = Math.min(H - 1, Math.ceil(cy + Rout + band));
            const bw = x1 - x0 + 1, bh = y1 - y0b + 1, core = new Uint8Array(bw * bh), mask = new Uint8Array(bw * bh);
            let any = false;
            for (let y = y0b; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > Rout * Rout) continue;
                if (isFill(at(x, y))) { core[(y - y0b) * bw + (x - x0)] = 1; any = true; }
            }
            if (!any) return;
            for (let y = y0b; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const m = (y - y0b) * bw + (x - x0);
                if (core[m]) { mask[m] = 1; continue; }
                let hit = false;
                for (let yy = Math.max(y0b, y - band); yy <= Math.min(y1, y + band) && !hit; yy++) for (let xx = Math.max(x0, x - band); xx <= Math.min(x1, x + band); xx++) {
                    if (core[(yy - y0b) * bw + (xx - x0)] && (xx - x) * (xx - x) + (yy - y) * (yy - y) <= band * band) { hit = true; break; }
                }
                if (hit && (onTop || p[at(x, y) + 3] < 255 || nearFist(at(x, y)))) mask[m] = 1;
            }
            let top = -1, bot = -1;
            for (let y = y0b; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mask[(y - y0b) * bw + (x - x0)]) { if (top < 0) top = y; bot = y; p[at(x, y) + 3] = 0; }
            if (!onTop || top < 0) return;
            if (how === 'mid') {
                for (let y = top; y <= bot; y++) {
                    let x = x0;
                    while (x <= x1) {
                        if (!mask[(y - y0b) * bw + (x - x0)]) { x++; continue; }
                        let xe = x; while (xe + 1 <= x1 && mask[(y - y0b) * bw + (xe + 1 - x0)]) xe++;
                        const li = x - 1 >= 0 ? at(x - 1, y) : -1, ri = xe + 1 < W ? at(xe + 1, y) : -1;
                        const lo = li >= 0 && p[li + 3] >= 200, ro = ri >= 0 && p[ri + 3] >= 200;
                        if (lo || ro) for (let xx = x; xx <= xe; xx++) {
                            const t = (lo && ro) ? (xx - x + 1) / (xe - x + 2) : (lo ? 0 : 1), i = at(xx, y);
                            const A = lo ? li : ri, B = ro ? ri : li;
                            p[i] = Math.round(p[A] * (1 - t) + p[B] * t); p[i + 1] = Math.round(p[A + 1] * (1 - t) + p[B + 1] * t); p[i + 2] = Math.round(p[A + 2] * (1 - t) + p[B + 2] * t); p[i + 3] = 255;
                        }
                        x = xe + 1;
                    }
                }
                return;
            }
            // 補身體的邊：被擦掉那塊的上面一排、下面一排各找身體的邊在哪，中間照直線連過去；每排從身體那一側把顏色往外抹到邊，最外面兩點用邊線的顏色
            const dir = inner > 0 ? -1 : 1;                      // 往外走的方向：inner＝身體在這顆手的哪一邊（+1 右邊、−1 左邊）
            const start = Math.round(cx + inner * (Rout + 139 * u * 0.4));   // 身體裡面的一點
            const edgeAt = (y) => {
                if (y < 0 || y >= H || start < 0 || start >= W || p[at(start, y) + 3] < 128) return null;
                let x = start; while (x + dir >= 0 && x + dir < W && p[at(x + dir, y) + 3] >= 128) x += dir;
                return x;
            };
            const eT = edgeAt(top - 2), eB = edgeAt(bot + 2);
            if (eT == null && eB == null) return;
            const rowT = eT != null ? top - 2 : bot + 2, colT = eT != null ? eT : eB;
            const edgeCol = [0, 1].map(k => { const i = at(colT - dir * k, rowT); return [p[i], p[i + 1], p[i + 2], p[i + 3]]; });
            for (let y = top; y <= bot; y++) {
                const t = (bot === top) ? 0 : (y - top) / (bot - top);
                const e = Math.round((eT != null ? eT : eB) * (1 - t) + (eB != null ? eB : eT) * t);
                // 這一排被擦掉的範圍裡，最靠身體的那一點再往身體走一點＝拿來抹的顏色
                let xin = null;
                for (let x = (inner > 0 ? x1 : x0); inner > 0 ? x >= x0 : x <= x1; x -= inner) if (mask[(y - y0b) * bw + (x - x0)]) { xin = x + inner; break; }
                if (xin == null || xin < 0 || xin >= W) continue;
                const si = at(Math.max(0, Math.min(W - 1, xin + inner)), y);
                if (p[si + 3] < 200) continue;                   // 這一排旁邊沒有身體（手的上下緣凸出身體外）
                for (let x = xin - inner; (dir > 0 ? x <= e : x >= e); x += dir) {
                    if (x < x0 || x > x1 || !mask[(y - y0b) * bw + (x - x0)]) continue;
                    const i = at(x, y), k = Math.abs(e - x), col = k < 2 ? edgeCol[k] : [p[si], p[si + 1], p[si + 2], 255];
                    p[i] = col[0]; p[i + 1] = col[1]; p[i + 2] = col[2]; p[i + 3] = col[3];
                }
            }
        };
        const cellX = (c) => c * cw2 + ox + cw / 2, cellY = (r) => r * ch + yb;   // 每格的身體中線、圓底最低點
        for (let c = 0; c < 3; c++) for (const r of [0, 3]) {
            const pose = L.hop[c], fy = cellY(r) + (pose.body + pose.fist[1] - 105) * u;
            wipe(cellX(c) - 150.55 * u, fy, r === 0 ? 'edge' : 'behind', +1);
            wipe(cellX(c) + 150.55 * u, fy, r === 0 ? 'edge' : 'behind', -1);
        }
        for (let c = 0; c < 3; c++) for (const r of [1, 2]) {   // 側面：舊的手在身體中線前面 12，跟著擺手前後動；往左那列是往右那列左右翻
            const pose = L.walk[c], off = (12 + pose.fist[0]) * u;
            wipe(cellX(c) + (r === 2 ? off : -off), cellY(r) + (pose.body + pose.fist[1] - 105) * u, 'mid', 0);
        }
        g.putImageData(I, 0, 0);
        // 3. 畫新的拳頭（位置、大小跟 _dollAttach 現在的畫法一樣；側面那兩列新的拳頭比舊的大一圈，直接蓋上去）
        g.imageSmoothingQuality = 'high';
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
            const pose = (r === 0 || r === 3) ? L.hop[c] : L.walk[c];
            const fy = cellY(r) + (pose.body + pose.fist[1] - L.fistUp) * u, k = L.fistK * u, X = cellX(c);
            g.save();
            g.beginPath(); g.rect(c * cw2, r * ch, cw2, ch); g.clip();
            if (r === 0 || r === 3) { _dollFist(g, X - L.fistX * u, fy, k, false, skin); _dollFist(g, X + L.fistX * u, fy, k, true, skin); }
            else if (r === 2) _dollFist(g, X + (L.fistSideX + pose.fist[0]) * u, fy, k, true, skin);     // 往右
            else _dollFist(g, X - (L.fistSideX + pose.fist[0]) * u, fy, k, false, skin);                 // 往左＝往右那格左右翻
            g.restore();
        }
        return cv.toDataURL('image/png');
    }
    // 回 { views:{front,side,back}, sheet? } 或 { img }（都是 dataURL）；三隻的會接上鞋和手（sheet＝拼好的走路圖，views＝站著的三格）；接口沒回圖丟錯（字是給她看的）
    async function _genDoll(a) {
        const M = _imgMgr();
        if (!M) throw new Error('生圖引擎還沒載入');
        const look = _spritePromptOf(a.avatarPrompt);
        const svc = (typeof M.serviceForUse === 'function') ? M.serviceForUse('doll') : '';
        const opts = { use: 'doll', force: true };
        let prompt;
        if (svc === 'custom_api') {
            const tpl = _dollTpl();
            prompt = tpl.indexOf(DOLL_LOOK) >= 0 ? tpl.split(DOLL_LOOK).join(look) : (tpl + ' ' + look);
            opts.raw = true; opts.width = 1536; opts.height = 1024;
            if (typeof M.takesRefImages === 'function' && M.takesRefImages('doll')) {
                try { opts._layoutRef = await _dollRef(); }
                catch (e) { console.warn('[LobbyDress] 小人樣張抓不到', e); throw new Error('小人的樣張抓不到（多半是網路），這次沒有畫。等一下再按一次。'); }
            }
        } else {
            prompt = _standeePromptOf(look, '');
        }
        const url = await M.generate(prompt, 'char', opts);
        if (!url && opts._layoutRef && /不收參考圖/.test((M._lastCustomApiError || {}).msg || '')) {
            throw new Error('這組接口不收參考圖，不倒翁沒辦法照樣張畫。到 設置 → 圖片 → 畫風，把「不倒翁小人」那列換成收得到圖的那組。');
        }
        if (!url) throw new Error('接口沒回圖（到 設置 → 圖片 → 畫風 看「不倒翁小人」那列用的是哪組）');
        let blob = null;
        try { blob = await (await fetch(url)).blob(); } catch (e) { throw new Error('圖拿到了但讀不進來'); }
        // 去背：跟一次生三種同一套（AI 認人形，白色的衣服、眼白不會被當成背景挖掉）；劇情那支沒載到才退成掃白底
        const V = window.VN_Core || (window.parent || window).VN_Core;
        let cut = null;
        if (V && typeof V._stripSpriteBgAI === 'function') {
            try { cut = await V._stripSpriteBgAI(blob); } catch (e) {}
            if (cut && typeof V._keepMainPiece === 'function') { try { cut = (await V._keepMainPiece(cut)) || cut; } catch (e) {} }
        }
        if (!cut) {
            const d = await _b.pixelify(await _blobToData(blob), { noGrid: true, sheet: true });
            if (d) cut = await (await fetch(d)).blob();
        }
        if (!cut) cut = blob;
        let views = null;
        if (V && typeof V._chibiViews === 'function') { try { views = await V._chibiViews(cut); } catch (e) {} }
        if (views) {
            const v3 = { front: await _blobToData(views[0]), side: await _blobToData(views[1]), back: await _blobToData(views[2]) };
            try { const lim = await _dollAttach(v3); return { views: lim.views, sheet: lim.sheet }; }
            catch (e) {
                console.warn('[LobbyDress] 鞋和手沒接上', e);
                try { AUI.toastr && AUI.toastr.warning('鞋子圖抓不到（多半是網路），這張先沒接手和腳；套用後下次進大廳會再補接一次。', '不倒翁小人', { timeOut: 8000 }); } catch (e2) {}
                return { views: v3 };
            }
        }
        return { img: await _blobToData(cut) };
    }
    // 存成這個小人的造型：三面＝三張各自落地，鑰匙那筆記 kind:'views'；一張＝跟「生成單張立姿圖」同一種
    async function _saveDollSkin(key, r) {
        if (!r.views) return await _saveSpriteSkin(key, r.img, 'img');
        if (r.sheet) {   // 接好手腳的：一張走路圖，doll:2＝展示台照不倒翁那樣給正面／側面／背面看、大廳縮小時平滑
            const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            await _b.idbPut(id, r.sheet);
            const ok = _b.saveSkin(key, { kind: 'sheet', ref: { idb: id }, doll: 2 });
            if (ok === false) { try { await _b.idbDel(id); } catch (e) {} return false; }
            return true;
        }
        const ids = [];
        try {
            for (const k of ['front', 'side', 'back']) {
                const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + k.charAt(0);
                await _b.idbPut(id, r.views[k]);
                ids.push(id);
            }
        } catch (e) { for (const id of ids) { try { await _b.idbDel(id); } catch (e2) {} } return false; }
        const ok = _b.saveSkin(key, { kind: 'views', ref: { idb: ids[0] }, side: { idb: ids[1] }, back: { idb: ids[2] } });
        if (ok === false) { for (const id of ids) { try { await _b.idbDel(id); } catch (e) {} } return false; }
        return true;
    }

    // ── 🤖 無人值守版立姿生成（世界門旅人自動補圖）──
    //   跟按鈕版唯一的差別：不開預覽窗、生完直接落地。失敗就靜靜回 false，讓小人維持預設圖。
    //   prompt 直接給英文外觀詞（旅人是展開世界時一起產的，沒有頭像 prompt 可拆）。
    async function genSpriteInto(key, prompt, opts) {
        opts = opts || {};
        if (!key || !prompt || !_imgMgr()) return false;
        const src = (opts.src === 'novelai') ? 'novelai' : 'comfyui_direct';
        const preset = opts.preset || _dressPresetsOf(src).find(p => _dressPresetKey(p) === _dressSavedKey(src)) || _dressPresetsOf(src)[0];
        if (!preset) return false;
        let final;
        try { final = await _renderSpriteImage(prompt, src, preset, 'img'); } catch (e) { return false; }
        if (!final) return false;
        // 存不下要照實回 false：以前不管存成功沒都回 true，呼叫端就以為「這位已經有圖了」，
        //   下次進大廳一查又沒有，於是再燒一輪 —— 生成重複、畫面剪影，兩個症狀都從這裡來。
        return await _saveSpriteSkin(key, final, 'img');   // 只負責生成＋存皮膚；要不要立刻換裝由呼叫方決定
    }

    function _wireDressGen(box, a) {
        const btn = box.querySelector('.lsd-gen-btn');
        const btnSheet = box.querySelector('.lsd-gen-btn-sheet');
        if (!btn) return;
        // kind='img'→單張立姿圖(去背+掃碎片+裁切)；kind='sheet'→3×4走路圖(只去背，跳過會毀網格的掃碎片/裁切)
        const doGen = (kind, btn) => (async () => {
            if (btn.disabled) return;
            const M = _imgMgr();
            if (!M) { AUI.alert('生圖引擎還沒載入，稍等一下再按。'); return; }
            const pk = _dressPackOf(kind);   // 用哪一包畫：設置 → 圖片 → 畫風 的「大廳的小人」（單張、走路圖各一格）
            if (!pk) { AUI.alert('還沒選' + (kind === 'sheet' ? '走路圖' : '單張立姿圖') + '要用哪個預設包來畫。\n到「設置 → 圖片 → 畫風」的「大廳的小人」選好，再回來按。'); return; }
            if (!a.avatarPrompt) { AUI.alert('這位還沒有頭像資料。'); return; }
            const label = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-hourglass-half"></i> 生成中…';
            try {
                const prompt = _spritePromptOf(a.avatarPrompt);   // 拔掉頭像自帶的 simple xxx background，背景聽預設包的
                // 不壓縮（畫風交給預設包）：單張立姿去背+掃碎片+裁切；走路圖只去背（掃碎片/裁切會毀12格網格）
                const final = await _renderSpriteImage(prompt, pk.src, pk.preset, kind);
                // 先預覽再套用：讓 Rae 檢查去背/網格對不對（走路圖尤其要看 4 列朝向、腳有沒有被切）
                btn.innerHTML = label; btn.disabled = false;
                _showGenPreview(final, kind, {
                    apply: async (out) => {
                        await _saveSpriteSkin(a.key, out || final, kind);   // 走路圖=調框重切後的圖；單張立姿=原圖
                        _b.applySkin(a, a.key);
                        btn.innerHTML = '<i class="fa-solid fa-check"></i> 已套用';
                        setTimeout(() => { btn.innerHTML = label; btn.disabled = false; if (box._pvHost && box._done) box._done(); }, 1600);   // 角色中心那頁：「目前用的」跟著換
                    },
                    retry: () => doGen(kind, btn),
                    cancel: () => {},
                }, box._pvHost);
            } catch (e) {
                console.warn('[LobbyDress] 裝扮室生成失敗', e);
                AUI.alert('生成失敗：' + (e && e.message || e));
                btn.innerHTML = label; btn.disabled = false;
            }
        })();
        btn.addEventListener('click', () => doGen('img', btn));
        if (btnSheet) btnSheet.addEventListener('click', () => doGen('sheet', btnSheet));
        // 🧸 生成不倒翁小人：叫一次生圖，先預覽再套用
        const btnDoll = box.querySelector('.lsd-gen-btn-doll');
        const doDoll = async () => {
            if (btnDoll.disabled) return;
            if (!a.avatarPrompt) { AUI.alert('這位還沒有頭像資料。'); return; }
            const label = btnDoll.innerHTML;
            btnDoll.disabled = true; btnDoll.innerHTML = '<i class="fa-solid fa-hourglass-half"></i> 生成中…';
            try {
                const r = await _genDoll(a);
                btnDoll.innerHTML = label; btnDoll.disabled = false;
                _showGenPreview(r.views || r.img, r.views ? 'views' : 'img', {
                    apply: async () => {
                        const ok = await _saveDollSkin(a.key, r);
                        if (!ok) { AUI.alert('存不下來（本機空間滿了），這次沒有換上。'); return; }
                        _b.applySkin(a, a.key);
                        btnDoll.innerHTML = '<i class="fa-solid fa-check"></i> 已套用';
                        setTimeout(() => { btnDoll.innerHTML = label; btnDoll.disabled = false; if (box._pvHost && box._done) box._done(); }, 1600);
                    },
                    retry: () => doDoll(),
                    cancel: () => {},
                }, box._pvHost);
            } catch (e) {
                console.warn('[LobbyDress] 不倒翁小人沒生成', e);
                AUI.alert('生成失敗：' + (e && e.message || e));
                btnDoll.innerHTML = label; btnDoll.disabled = false;
            }
        };
        if (btnDoll) btnDoll.addEventListener('click', doDoll);
    }
    function _wireDressSprite(box, a) {
        // ── 🖼️ 生成立繪（對話框角色大圖）：直接呼叫 VN 劇情角色卡「一鍵生立繪」現成接口 ──
        //   管線全在 VN_Core.autoGenSprite（studio 模板+清洗+isnet 去背+存 sprite_cache，進度字樣它自己管）；
        //   key 用 avatarCacheKey(那輪chatId::名 複合鍵)→prompt 撈得到原頭像、立繪存回同鍵，掛載時 lobby_npcs 撈回當對話立繪。
        const btnSprite = box.querySelector('.lsd-sprite-btn');
        if (btnSprite) {
            let busy = false;   // autoGenSprite 自己 1.5s/2.6s 後解鎖按鈕，這閂擋解鎖到圖標蓋回之間的重複點擊
            btnSprite.addEventListener('click', async () => {
                if (busy || btnSprite.disabled) return;
                const VN = window.VN_Core || (window.parent || window).VN_Core;
                if (!VN || typeof VN.autoGenSprite !== 'function') { AUI.alert('劇情引擎還沒載入，稍等一下再按。'); return; }
                busy = true;
                const orig = btnSprite.innerHTML;
                const key = a.avatarCacheKey || a.name;
                try {
                    await VN.autoGenSprite(key, btnSprite);
                    const VC = window.VN_Cache || (window.parent || window).VN_Cache;
                    const sp = VC ? await VC.get('sprite_cache', key) : null;
                    if (sp && sp.url) { a.portrait = sp.url; a.portraitKind = 'sprite'; }   // 即時接上對話立繪(貼底)，不必等重新掛載
                } finally {
                    setTimeout(() => { btnSprite.innerHTML = orig; btnSprite.disabled = false; busy = false; if (box._pvHost && box._done) box._done(); }, 2700);   // autoGenSprite 還原純文字後把含圖標版蓋回；角色中心那頁重畫（展示台換成新的）
                }
            });
        }
        // 🎴 立繪、頭像、Q版一起重畫（開著一次生三種才有這張卡）：劇情角色卡那顆同一支 VN_Core.regenTrio
        const btnTrio = box.querySelector('.lsd-trio-btn');
        if (btnTrio) {
            let busy = false;
            btnTrio.addEventListener('click', async () => {
                if (busy || btnTrio.disabled) return;
                const VN = window.VN_Core || (window.parent || window).VN_Core;
                if (!VN || typeof VN.regenTrio !== 'function') { AUI.alert('劇情引擎還沒載入，稍等一下再按。'); return; }
                busy = true;
                try { await VN.regenTrio(a.avatarCacheKey || a.name, btnTrio); }
                finally { setTimeout(() => { busy = false; if (box._done) box._done(); }, 2700); }   // regenTrio 自己會把按鈕的字還原，還原完再重畫
            });
        }
    }

    // 三小窗加入互斥圈（誰要開窗先 closeWins 全關）
    _b.regWin(_closeActorMenu);
    _b.regWin(_closeDressRoom);
    _b.regWin(_closeNpcHistory);

    window.LobbyDress = {
        openMenu: _openActorMenu,       // 右鍵/長按角色→下拉單（lobby_stage tryMount 呼叫）
        openRoom: _openDress,           // 裝扮室（LobbyStage.openDressRoom 轉呼叫）：開角色中心的「裝扮」頁，沒載到才是小窗
        mountInto,                      // 🎭 角色中心「裝扮」頁：同一份內容畫進那一頁（os_char_gallery.js）
        openHistory: _openNpcHistory,   // NPC 對話紀錄窗（對話模式沒有舞台時掛在 .lobby-left）
        closeHistory: _closeNpcHistory, // 對話模式換地點時收掉（不然會留著上一位的紀錄）
        genSpriteInto,                  // 無人值守生立姿（世界門旅人自動補圖；與裝扮室同一條管線）
        listPresets: _dressPresetsOf,   // 給設置頁列預設包（免得那邊再抄一份取法）
        packOf: _dressPackOf,           // 設置頁「大廳的小人」那兩格現在選的是哪一包（kind＝'img'／'sheet'）
        dollRefist: _dollRefist,                      // ✊ 11-17 之前接的小圓手換成衣櫥的拳頭（lobby_stage.js 套造型時叫）
        dollRefistSheet: _dollRefistSheet, dollAttach: _dollAttach,   // 本機測試用
        dollUpgrade: _dollUpgrade,                    // 🦶 舊的三面不倒翁補接手腳（lobby_stage.js 套造型時叫）
        DOLL_TPL, DOLL_TPL_KEY, dollTpl: _dollTpl,   // 🧸 不倒翁小人的提示詞（接自訂接口時用）：設置頁那格讀寫
        setPack: _dressSetPack,         // 設置頁選了就存
        presetKeyOf: _dressPresetKey,
    };
})();
