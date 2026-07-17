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

    // ── 右鍵角色→下拉單 ──
    function _closeActorMenu() { S.menuEl?.remove(); S.menuEl = null; }
    function _openActorMenu(a, cx, cy) {
        _b.closeWins();
        const rr = S.root.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'lstage-actor-menu';
        const isPlayer = (a.key === 'player');   // 玩家不給「跟隨我」（跟自己很怪）
        menu.innerHTML = '<div class="lam-title">' + (a.name || '角色') + '</div>' +
            '<button class="lam-item" data-act="dress"><i class="fa-solid fa-shirt"></i> 裝扮室</button>' +
            (isPlayer ? '' : '<button class="lam-item" data-act="follow"><i class="fa-solid fa-person-walking-arrow-right"></i> ' + (a.follow ? '取消跟隨' : '跟隨我') + '</button>') +
            (isPlayer ? '' : '<button class="lam-item" data-act="history"><i class="fa-solid fa-comment-dots"></i> 對話紀錄</button>') +
            (isPlayer ? '' : '<button class="lam-item" data-act="recompact"><i class="fa-solid fa-brain"></i> 整理記憶</button>');
        menu.style.left = Math.max(6, Math.min(cx - rr.left, rr.width - 150)) + 'px';
        menu.style.top = Math.max(6, Math.min(cy - rr.top, rr.height - (isPlayer ? 90 : 192))) + 'px';
        S.root.appendChild(menu);
        S.menuEl = menu;
        menu.querySelector('[data-act="dress"]').addEventListener('click', () => { _closeActorMenu(); _openDressRoom(a); });
        menu.querySelector('[data-act="follow"]')?.addEventListener('click', () => {
            a.follow = !a.follow;
            a.dest = null;   // 清掉漫步目標，交給跟隨邏輯接手
            S.followers = S.followers.filter(x => x !== a);   // 先移除，維持佇列無重複
            if (a.follow) S.followers.push(a);   // 加到隊尾：越晚跟的排越後面（串成一列不重疊）
            else { a.walking = false; if (a.sheet) { a.dir = 0; a.frame = 1; a.animT = 0; } }   // 取消跟隨=立定+轉回正面(第1列朝下)
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
        setTimeout(() => document.addEventListener('pointerdown', _menuOutside, { once: true }), 0);
    }
    function _menuOutside(e) { if (S.menuEl && !S.menuEl.contains(e.target)) _closeActorMenu(); }
    // 裝扮室面板
    function _closeDressRoom() { S.dressEl?.remove(); S.dressEl = null; }
    function _openDressRoom(a) {
        _closeDressRoom();
        const box = document.createElement('div');
        box.className = 'lstage-dress';
        const hasSkin = !!_b.skins()[a.key];
        box.innerHTML =
            '<div class="lsd-title"><i class="fa-solid fa-shirt"></i> 裝扮室 — ' + (a.name || '角色') + '</div>' +
            '<div class="lsd-hint">單張圖＝站立像+走路彈跳；走路圖＝3×4格圖（第1列朝下、第2列朝左、第3列朝右、第4列朝上，每列3幀）</div>' +
            '<button class="lep-btn" data-act="img"><i class="fa-solid fa-image"></i> 換單張立姿圖</button>' +
            '<button class="lep-btn" data-act="sheet"><i class="fa-solid fa-person-walking"></i> 換走路圖（3×4）</button>' +
            _dressGenHtml(a) +
            '<button class="lep-btn" data-act="reset"' + (hasSkin ? '' : ' disabled') + '><i class="fa-solid fa-rotate-left"></i> 還原預設</button>' +
            '<button class="lep-btn lep-done" data-act="close"><i class="fa-solid fa-check"></i> 關閉</button>';
        S.root.appendChild(box);
        S.dressEl = box;
        _wireDressGen(box, a);
        box.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (!act) return;
            if (act === 'img' || act === 'sheet') {
                _b.askImage(async (ref, dataUrl) => {
                    // 🧊 單張立姿可選「壓成像素小小人」：格點化+單色背景變透明（取消=原圖直接用；走路圖不處理）
                    if (act === 'img' && window.confirm('要幫這張圖壓成像素小小人嗎？\n會變成大顆粒的復古小人，單色背景也會自動變透明。\n按「取消」就原圖直接用。')) {
                        try {
                            const src = dataUrl || await _b.resolveRef(ref);
                            const out = src ? await _b.pixelify(src) : null;
                            if (out) {
                                const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                                await _b.idbPut(id, out);
                                ref = { idb: id };
                            } else {
                                window.alert('這張圖處理不了（多半是圖床不給讀），先原圖直接用。');
                            }
                        } catch (e) { console.warn('[LobbyDress] 小小人壓製失敗，改用原圖', e); }
                    }
                    _b.saveSkin(a.key, { kind: act === 'sheet' ? 'sheet' : 'img', ref });
                    _b.applySkin(a, a.key);
                    _closeDressRoom();
                });
            } else if (act === 'reset') {
                _b.saveSkin(a.key, null);
                if (a.defaultSrc) _b.swapActorSrc(a, a.defaultSrc);
                _closeDressRoom();
            } else if (act === 'close') _closeDressRoom();
        });
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
            const mm = String(m.content || '').match(/「([\s\S]*?)」/);
            const plain = (mm ? mm[1] : String(m.content || '').replace(/\[[^\]]*\]/g, '').replace(/<[^>]*>/g, '')).trim();
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
        const box = document.createElement('div');
        box.className = 'lstage-dress lstage-history';
        box.innerHTML =
            '<div class="lsd-title"><i class="fa-solid fa-comment-dots"></i> 對話紀錄 — ' + (a.name || '角色') + '<span class="lsh-count"></span></div>' +
            '<div class="lsh-list"></div>' +
            '<button class="lep-btn lep-danger" data-act="clear"><i class="fa-solid fa-trash"></i> 清空（徹底遺忘）</button>' +
            '<button class="lep-btn lep-done" data-act="close"><i class="fa-solid fa-check"></i> 關閉</button>';
        S.root.appendChild(box);
        S.histEl = box;
        _renderNpcHistoryBody(box, a);
        box.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'close') { _closeNpcHistory(); return; }
            if (act === 'clear') {
                if (!window.confirm('清空「' + (a.name || '這位') + '」的全部對話紀錄？\n連同長期記憶一起清空＝徹底遺忘，不可復原。')) return;
                _b.setNpcHistory(a.key, []);
                try { (window.OS_DB || (window.parent || window).OS_DB)?.saveNpcMemory?.(a.key, { name: a.name || '', summary: '', lastCompactAt: 0 }); } catch (e) {}
                _renderNpcHistoryBody(box, a);
            }
        });
    }

    // ── ✨ 裝扮室內建生成：選接口(ComfyUI/NAI)＋選預設包 → 用「角色頭像 prompt」直接生小小人 ──
    //   prompt=avatar_cache 存的頭像生成詞(外觀 ground truth，日誌客人撈頭像時順手釘上)；
    //   ComfyUI 走 previewComfyPreset(吃預設包、不碰全域設定)；NAI 走快照→套包→generate→finally 還原
    //   （transient 鐵律，跟 profile 切換同款）。生完自動走 pixelify 格點化+去背 → 存 skins。
    const DRESS_GEN_KEY = 'lstage_dress_gen_v1';   // 記上次選的接口/預設包
    function _dressGenCfg() {
        try { const o = JSON.parse(localStorage.getItem(DRESS_GEN_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
    }
    function _dressGenSave(patch) {
        try { localStorage.setItem(DRESS_GEN_KEY, JSON.stringify(Object.assign(_dressGenCfg(), patch))); } catch (e) {}
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
    function _dressPresetOpts(src) {
        const presets = _dressPresetsOf(src);
        const savedKey = _dressSavedKey(src);
        return presets.length
            ? presets.map((p, i) => '<option value="' + i + '"' + (_dressPresetKey(p) === savedKey ? ' selected' : '') + '>' + String(p.name || ('預設 ' + (i + 1))).replace(/</g, '&lt;') + '</option>').join('')
            : '<option value="" disabled selected>（這個接口還沒有預設包）</option>';
    }
    function _dressGenHtml(a) {
        const saved = _dressGenCfg();
        const src = (saved.src === 'novelai') ? 'novelai' : 'comfyui_direct';
        const opts = _dressPresetOpts(src);
        return '<div class="lsd-gen">' +
            '<div class="lsd-gen-title"><i class="fa-solid fa-wand-magic-sparkles"></i> 生成小小人（用這位的頭像外觀）</div>' +
            '<div class="lsd-gen-row">' +
                '<select class="lsd-gen-src">' +
                    '<option value="comfyui_direct"' + (src === 'comfyui_direct' ? ' selected' : '') + '>ComfyUI</option>' +
                    '<option value="novelai"' + (src === 'novelai' ? ' selected' : '') + '>NAI</option>' +
                '</select>' +
                '<select class="lsd-gen-preset">' + opts + '</select>' +
            '</div>' +
            '<button class="lep-btn lsd-gen-btn"' + (a.avatarPrompt ? '' : ' disabled title="這位還沒有頭像資料（劇情裡生成過頭像才有外觀依據）"') + '><i class="fa-solid fa-wand-magic-sparkles"></i> 生成單張立姿圖</button>' +
            '<button class="lep-btn lsd-gen-btn-sheet"' + (a.avatarPrompt ? '' : ' disabled title="這位還沒有頭像資料（劇情裡生成過頭像才有外觀依據）"') + '><i class="fa-solid fa-person-walking"></i> 生成走路圖（3×4）</button>' +
            '<div class="lsd-hint">走路圖需選「會出 3×4 sprite sheet 的預設包」（例如掛 RPG 角色 sprite 類 LoRA）；一般預設包出的是單張，請用「生成單張立姿圖」。</div>' +
        '</div>' +
        '<button class="lep-btn lsd-sprite-btn"' + (a.avatarPrompt ? '' : ' disabled title="這位還沒有頭像資料（劇情裡生成過頭像才有外觀依據）"') + '><i class="fa-solid fa-image-portrait"></i> 生成立繪</button>' +
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
    function _showGenPreview(dataUrl, kind, h) {
        const isSheet = (kind === 'sheet');
        const wrap = document.createElement('div');
        wrap.className = 'lstage-genprev';
        wrap.innerHTML =
            '<div class="lgp-box">' +
                '<div class="lgp-title">' + (isSheet ? '走路圖調框（3×4）' : '單張立姿預覽') + '</div>' +
                (isSheet
                    ? '<div class="lgp-sheetwrap"><img class="lgp-img lgp-sheetimg" src="' + dataUrl + '"><canvas class="lgp-grid"></canvas></div>' +
                      '<div class="lgp-sliders">' +
                        _lgpSlider('上', 'top', 0, 40, 0) + _lgpSlider('下', 'bottom', 60, 100, 100) +
                        _lgpSlider('左', 'left', 0, 40, 0) + _lgpSlider('右', 'right', 60, 100, 100) +
                      '</div>' +
                      '<div class="lgp-flips"><span>翻轉列</span>' +
                        ['下', '左', '右', '上'].map((d, i) => '<button class="lgp-flip" data-r="' + i + '"><i class="fa-solid fa-left-right"></i>' + d + '</button>').join('') +
                      '</div>' +
                      '<div class="lgp-reslabel">套用後（重切＋翻轉）</div>' +
                      '<canvas class="lgp-result"></canvas>'
                    : '<img class="lgp-img" src="' + dataUrl + '">') +
                '<div class="lgp-hint">' + (isSheet ? '紅格對準每格角色含腳；某列朝向錯就按「翻轉列」左右鏡像（右列常可鏡像自左列）' : '看去背乾不乾淨、有沒有缺手缺腳再套用') + '</div>' +
                '<div class="lgp-btns">' +
                    '<button class="lep-btn lgp-apply"><i class="fa-solid fa-check"></i> 套用</button>' +
                    '<button class="lep-btn lgp-retry"><i class="fa-solid fa-rotate"></i> 重新生成</button>' +
                    '<button class="lep-btn lgp-cancel"><i class="fa-solid fa-xmark"></i> 取消</button>' +
                '</div>' +
            '</div>';
        S.root.appendChild(wrap);
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
    function _wireDressGen(box, a) {
        const srcSel = box.querySelector('.lsd-gen-src');
        const pSel = box.querySelector('.lsd-gen-preset');
        const btn = box.querySelector('.lsd-gen-btn');
        const btnSheet = box.querySelector('.lsd-gen-btn-sheet');
        if (!srcSel || !pSel || !btn) return;
        const refillPresets = () => { pSel.innerHTML = _dressPresetOpts(srcSel.value); };
        srcSel.addEventListener('change', () => { _dressGenSave({ src: srcSel.value }); refillPresets(); });
        pSel.addEventListener('change', () => {
            const key = _dressPresetKey(_dressPresetsOf(srcSel.value)[parseInt(pSel.value, 10)]);
            if (key) _dressGenSave(srcSel.value === 'novelai' ? { naiPreset: key } : { comfyPreset: key });
        });
        // kind='img'→單張立姿圖(去背+掃碎片+裁切)；kind='sheet'→3×4走路圖(只去背，跳過會毀網格的掃碎片/裁切)
        const doGen = (kind, btn) => (async () => {
            if (btn.disabled) return;
            const M = _imgMgr();
            if (!M) { window.alert('生圖引擎還沒載入，稍等一下再按。'); return; }
            const preset = _dressPresetsOf(srcSel.value)[parseInt(pSel.value, 10)];
            if (!preset) { window.alert('先到「圖片設置」把這個接口的預設包存一個，這裡才有得選。'); return; }
            if (!a.avatarPrompt) { window.alert('這位還沒有頭像資料。'); return; }
            const label = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-hourglass-half"></i> 生成中…';
            try {
                const prompt = _spritePromptOf(a.avatarPrompt);   // 拔掉頭像自帶的 simple xxx background，背景聽預設包的
                let imgUrl = '';
                if (srcSel.value === 'novelai') {
                    // 快照→套包→生成→finally 還原（絕不留殘設定）
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
                // 不壓縮（畫風交給預設包）：單張立姿去背+掃碎片+裁切；走路圖只去背（掃碎片/裁切會毀12格網格）
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
                // 先預覽再套用：讓 Rae 檢查去背/網格對不對（走路圖尤其要看 4 列朝向、腳有沒有被切）
                btn.innerHTML = label; btn.disabled = false;
                _showGenPreview(final, kind, {
                    apply: async (out) => {
                        const data = out || final;   // 走路圖=調框重切後的圖；單張立姿=原圖
                        const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                        await _b.idbPut(id, data);
                        // 只存大廳小人皮膚，不碰對話立繪(a.portrait)——那是另一套東西(Rae定案 2026-07-17)
                        _b.saveSkin(a.key, { kind: kind === 'sheet' ? 'sheet' : 'img', ref: { idb: id } });
                        _b.applySkin(a, a.key);
                        btn.innerHTML = '<i class="fa-solid fa-check"></i> 已套用';
                        setTimeout(() => { btn.innerHTML = label; btn.disabled = false; }, 1600);
                    },
                    retry: () => doGen(kind, btn),
                    cancel: () => {},
                });
            } catch (e) {
                console.warn('[LobbyDress] 裝扮室生成失敗', e);
                window.alert('生成失敗：' + (e && e.message || e));
                btn.innerHTML = label; btn.disabled = false;
            }
        })();
        btn.addEventListener('click', () => doGen('img', btn));
        if (btnSheet) btnSheet.addEventListener('click', () => doGen('sheet', btnSheet));
        // ── 🖼️ 生成立繪（對話框角色大圖）：直接呼叫 VN 劇情角色卡「一鍵生立繪」現成接口 ──
        //   管線全在 VN_Core.autoGenSprite（studio 模板+清洗+isnet 去背+存 sprite_cache，進度字樣它自己管）；
        //   key 用 avatarCacheKey(那輪chatId::名 複合鍵)→prompt 撈得到原頭像、立繪存回同鍵，掛載時 lobby_npcs 撈回當對話立繪。
        const btnSprite = box.querySelector('.lsd-sprite-btn');
        if (btnSprite) {
            let busy = false;   // autoGenSprite 自己 1.5s/2.6s 後解鎖按鈕，這閂擋解鎖到圖標蓋回之間的重複點擊
            btnSprite.addEventListener('click', async () => {
                if (busy || btnSprite.disabled) return;
                const VN = window.VN_Core || (window.parent || window).VN_Core;
                if (!VN || typeof VN.autoGenSprite !== 'function') { window.alert('劇情引擎還沒載入，稍等一下再按。'); return; }
                busy = true;
                const orig = btnSprite.innerHTML;
                const key = a.avatarCacheKey || a.name;
                try {
                    await VN.autoGenSprite(key, btnSprite);
                    const VC = window.VN_Cache || (window.parent || window).VN_Cache;
                    const sp = VC ? await VC.get('sprite_cache', key) : null;
                    if (sp && sp.url) { a.portrait = sp.url; a.portraitKind = 'sprite'; }   // 即時接上對話立繪(貼底)，不必等重新掛載
                } finally {
                    setTimeout(() => { btnSprite.innerHTML = orig; btnSprite.disabled = false; busy = false; }, 2700);   // autoGenSprite 還原純文字後把含圖標版蓋回
                }
            });
        }
    }

    // 三小窗加入互斥圈（誰要開窗先 closeWins 全關）
    _b.regWin(_closeActorMenu);
    _b.regWin(_closeDressRoom);
    _b.regWin(_closeNpcHistory);

    window.LobbyDress = {
        openMenu: _openActorMenu,       // 右鍵/長按角色→下拉單（lobby_stage tryMount 呼叫）
        openRoom: _openDressRoom,       // 裝扮室（LobbyStage.openDressRoom 轉呼叫）
        openHistory: _openNpcHistory,   // NPC 對話紀錄窗
    };
})();
