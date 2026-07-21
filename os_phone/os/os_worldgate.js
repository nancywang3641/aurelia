// ----------------------------------------------------------------
// [檔案] os_worldgate.js — 🌌 視差世界門③：愛麗絲的面板（2026-07-22）
// 職責：世界檔案庫（瀏覽頁）⇄ 種子抽選/世界詳情（操作頁）。
//   抽種子(燒1次副模型) → 展開世界+旅人候選(燒1次) → 條目落地【奧瑞亞-視差】書
//   → 旅人像素小人入大廳(走現有NPC對話軌道) → DIVE=切書+開場指令注入聊天。
//   重進舊世界=0次API(條目還在,直接DIVE)。
// 儲存：OS_DB app_data(appId=worldgate,不動schema)。
// 依賴：OS_DB/OS_API/OS_SETTINGS、AURELIA_WORLDGATE(②切書)、TavernHelper(寫世界書)、
//       LobbyStage._b(旅人小人,可缺=只是不出小人)。
// 入口：lobby_stage.startTalk 愛麗絲鉤子 → OS_WORLDGATE.openGate()；離開對話 closeGate()。
// 設計書：docs/parallax_worldgate_design.md
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[Worldgate③] 載入世界門面板...');
    const win = window.parent || window;
    const APP_ID = 'worldgate';
    const K_WORLDS = 'worlds';   // [{id,name,concept,style,lure,danger,crisis,keys,travelers:[{name,job,persona,origin,skill,recruited}],visits,ts}]
    const BOOK_PARA = '【奧瑞亞-視差】';
    const MAX_TRAVELER_SPAWN = 4;

    function _db() { return win.OS_DB || window.OS_DB; }
    async function _get(k, dflt) {
        try { const db = _db(); if (!db?.getAppData) return dflt; const v = await db.getAppData(APP_ID, k); return (v === undefined || v === null) ? dflt : v; }
        catch (e) { return dflt; }
    }
    async function _set(k, v) {
        try { const db = _db(); if (!db?.saveAppData) return; await db.saveAppData(APP_ID, k, v); } catch (e) { console.warn('[Worldgate③] 存檔失敗', k, e); }
    }
    function _th() { return win.TavernHelper || window.TavernHelper; }
    function _gate() { return win.AURELIA_WORLDGATE || window.AURELIA_WORLDGATE; }
    function _mkId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

    // ── 副模型呼叫(仿 os_cafe:優先副模型 config,失敗回 null 讓 UI 給重試) ──
    function _extractJSON(raw) {
        try { const m = String(raw || '').match(/[\[{][\s\S]*[\]}]/); return m ? JSON.parse(m[0]) : null; }
        catch (e) { return null; }
    }
    async function _callAI(prompt, label, route) {
        const api = win.OS_API || window.OS_API;
        if (!api || !api.chat) return null;
        try {
            let config = {};
            const OS = win.OS_SETTINGS || window.OS_SETTINGS;
            if (OS) {
                const sec = OS.getSecondaryConfig ? OS.getSecondaryConfig() : null;
                config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : OS.getConfig();
            }
            config = config || {};
            config.route = route;
            const raw = await new Promise((resolve, reject) => {
                api.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { label, keepCodeFences: true });
            });
            return _extractJSON(raw);
        } catch (e) { console.warn('[Worldgate③] ' + label + ' 失敗', e); return null; }
    }

    // ── 種子抽選(1次API→4顆種子;hint=玩家偏好詞可空) ──
    async function _drawSeeds(hint) {
        const prompt =
            '你是視差系統(NEXUS PARALLAX)的世界生成引擎。請生成 4 個彼此題材、核心規則、玩法差異明顯的虛擬世界種子。只回傳純 JSON 陣列:\n' +
            '[{"name":"{世界名,不超過8字,有記憶點}","concept":"{一句話概念,不超過25字}","style":"{視覺風格,不超過10字}","lure":"{玩家前往的理由/可獲得什麼,不超過20字}","danger":"{主要危險,不超過15字}","crisis":"{世界目前正在發生的危機,不超過20字}"}]\n' +
            (hint ? '玩家偏好參考(不必全照做):' + hint + '\n' : '') +
            '世界必須適合多目的探索(可戰鬥/解謎/交易/採集/調查/純閒逛),不要設計成單一主線。語言:繁體中文。';
        const arr = await _callAI(prompt, '世界門抽種子', 'worldgate_seeds');
        return (Array.isArray(arr) ? arr : []).filter(s => s && s.name).slice(0, 5);
    }

    // ── 展開世界+旅人候選(1次API) ──
    async function _expandWorld(seed) {
        const prompt =
            '你是視差系統的世界建構引擎。請把以下世界種子擴寫成可跑團的濃縮世界檔案,並生成在純白大廳等待組隊前往該世界的旅人候選人。只回傳純 JSON:\n' +
            '{"entry":"{世界設定正文600~900字:依序包含 入口區域/3~4個主要區域(各自的景觀與危險)/2~3個勢力或重要NPC/世界目前的危機/撤離方式。分段書寫,不要條列符號堆砌}",' +
            '"keys":["{觸發關鍵字3~5個,第一個必須是世界名}"],' +
            '"travelers":[{"name":"{旅人名}","job":"{職業/定位,不超過6字}","persona":"{一句話性格}","origin":"{一句話來歷}","skill":"{一句話擅長}"}]}\n' +
            '旅人固定 4 名,彼此定位互補、性格差異明顯;他們是視差玩家(來自奧瑞亞的普通人),不是該世界的NPC。\n' +
            '【世界種子】' + JSON.stringify(seed) + '\n' +
            '語言:繁體中文。';
        return await _callAI(prompt, '世界門展開世界', 'worldgate_expand');
    }

    // ── 世界條目落地【奧瑞亞-視差】書 ──
    function _entryComment(w) { return '【世界檔案-' + w.name + '】'; }
    function _entryContent(w, entryText) {
        const trav = (w.travelers || []).map(t => '- ' + t.name + '(' + t.job + '):' + t.persona + ' ' + t.origin).join('\n');
        return '# 視差世界檔案:' + w.name + '\n' +
            '一句話:' + w.concept + '(風格:' + w.style + ')\n\n' + entryText +
            (trav ? '\n\n## 本世界的同行旅人候選(視差玩家,非本世界NPC)\n' + trav : '');
    }
    async function _writeEntry(w, entryText) {
        const TH = _th();
        if (!TH || !TH.getLorebookEntries) return false;
        try {
            const entryData = {
                comment: _entryComment(w),
                keys: (w.keys && w.keys.length ? w.keys : [w.name]),
                content: _entryContent(w, entryText),
                enabled: true,
                position: 'before_char_defs',
                order: 95,
            };
            const entries = await TH.getLorebookEntries(BOOK_PARA);
            const exist = (entries || []).find(e => e.comment === entryData.comment);
            if (exist) {
                await TH.updateLorebookEntriesWith(BOOK_PARA, list =>
                    list.map(e => e.comment === entryData.comment ? { ...e, ...entryData } : e));
            } else {
                await TH.createLorebookEntries(BOOK_PARA, [entryData]);
            }
            return true;
        } catch (e) { console.error('[Worldgate③] 世界條目寫入失敗', e); return false; }
    }
    async function _deleteEntry(w) {
        const TH = _th();
        if (!TH || !TH.updateLorebookEntriesWith) return;
        try { await TH.updateLorebookEntriesWith(BOOK_PARA, list => list.filter(e => e.comment !== _entryComment(w))); }
        catch (e) { console.warn('[Worldgate③] 世界條目刪除失敗', e); }
    }

    // ── 旅人像素小人(大廳限定;LobbyStage._b 缺席=優雅跳過) ──
    // 「同一個伺服器」感:展開世界/點開世界=旅人自動陸續上線大廳,不用按鈕召喚(Rae 定案 2026-07-22)
    let _travNpcs = [];
    let _travWorldId = null;
    let _travGen = 0;   // 世代閂:清場後殘留的錯峰 setTimeout 不准再刷人
    function _stage() { const LS = win.LobbyStage || window.LobbyStage; return (LS && LS._b) ? LS._b : null; }
    function _clearTravelers() {
        _travGen++;
        _travWorldId = null;
        const b = _stage();
        _travNpcs.forEach(n => {
            try {
                n.el?.remove(); n.tag?.remove(); n.hint?.remove();
                if (b) { const i = b.S.npcs.indexOf(n); if (i >= 0) b.S.npcs.splice(i, 1); }
            } catch (e) {}
        });
        _travNpcs = [];
    }
    function _travelerPersona(t, worldName) {
        return '你現在扮演「' + t.name + '」——視差純白大廳裡等待組隊的玩家旅人(來自奧瑞亞的普通人,不是NPC)。' +
            '定位:' + t.job + '。性格:' + t.persona + '。來歷:' + t.origin + '。擅長:' + t.skill + '。' +
            '你正打算前往世界「' + worldName + '」,在大廳物色隊友;聊得投機可以表達願意同行。輕鬆對話為主,不推進正式劇情。';
    }
    function _spawnTravelers(w) {
        const b = _stage();
        if (!b || b.S.scene !== 'hall') return false;
        if (_travWorldId === w.id && _travNpcs.some(n => b.S.npcs.indexOf(n) >= 0)) return true;   // 同世界且人還活著(勾隊友重渲染別閃人;換過場景回來=物件已死→重新上線)
        _clearTravelers();
        _travWorldId = w.id;
        const alice = b.S.npcs.find(n => n.key === 'alice');
        const ax = alice ? alice.x : 1000, ay = alice ? alice.y : 400;
        const Z = { x: Math.max(60, ax - 620), y: ay + 150, w: 640, h: 280 };   // 愛麗絲前方偏左的開闊區,rollSpot 會避開家具
        const taken = [];
        const rollSpot = () => {
            let best = null, bestScore = -1;
            for (let t = 0; t < 24; t++) {
                const x = Z.x + Math.random() * Z.w, y = Z.y + Math.random() * Z.h;
                try { if (b.blocked && b.blocked(x, y)) continue; } catch (e) {}
                let score = 0.5;
                try { if (b.whiteRatio) score = b.whiteRatio(x, y, 70); } catch (e) {}
                if (taken.some(p => Math.hypot(p.x - x, p.y - y) < 120)) score -= 0.5;
                if (score > bestScore) { bestScore = score; best = { x, y }; }
            }
            const p = best || { x: Z.x + Z.w / 2, y: Z.y + Z.h / 2 };
            taken.push(p);
            return p;
        };
        const gen = _travGen;
        (w.travelers || []).slice(0, MAX_TRAVELER_SPAWN).forEach((t, i) => {
            const sp = rollSpot();   // 站位先佔好(彼此保持距離),上線時間錯開=玩家陸續登入的感覺
            setTimeout(() => {
                if (gen !== _travGen) return;   // 期間清過場(換世界/DIVE/關窗)就別再冒出來
                const b2 = _stage();
                if (!b2 || b2.S.scene !== 'hall') return;
                const npc = b2.addNpc({
                    key: 'wg_' + w.id + '_' + i, name: t.name,
                    personaFull: _travelerPersona(t, w.name),
                    subTitle: '旅人・' + t.job,
                    x: sp.x, y: sp.y,
                    src: (i % 2 === 0) ? b2.ASSET.mcM : b2.ASSET.mcF,
                    noWander: true, avoidBlocks: true, homeRect: Z,
                });
                _travNpcs.push(npc);
            }, 350 + i * 750);
        });
        return true;
    }

    // ── DIVE:切書→開場指令注入聊天→收面板 ──
    function _toChat(text) {
        try {
            const doc = win.document;
            const ta = doc.querySelector('#send_textarea'), btn = doc.querySelector('#send_but');
            if (!ta) return false;
            ta.value = text;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            try { ta.focus(); } catch (e) {}
            if (btn) setTimeout(() => btn.click(), 150);
            return true;
        } catch (e) { console.error('[Worldgate③] 注入聊天失敗', e); return false; }
    }
    function _divePrompt(w) {
        const team = (w.travelers || []).filter(t => t.recruited);
        const teamStr = team.length
            ? team.map(t => '- ' + t.name + '(' + t.job + '):' + t.persona + ';擅長' + t.skill).join('\n')
            : '(單人行動)';
        return '🌌 NEXUS PARALLAX · 世界啟動\n' +
            '━━━━━━━━━━━━━━━━━━━━━\n' +
            '[System:玩家從純白大廳進入視差世界「' + w.name + '」]\n' +
            '世界概念:' + w.concept + '(風格:' + w.style + ')\n' +
            '同行旅人:\n' + teamStr + '\n\n' +
            '【指令】\n' +
            '1. 以「' + w.name + '」的世界檔案為準,從入口區域開場,描寫玩家(與同行旅人)抵達時的所見所感。\n' +
            '2. 遵循視差跑團主持規範:不強推主線、只描述可感知資訊、事件制推進。\n' +
            '3. 開場結尾給出眼前可見的幾個方向或機會,然後停下等待玩家行動。\n' +
            '━━━━━━━━━━━━━━━━━━━━━';
    }
    async function _dive(w) {
        const gate = _gate();
        if (!gate) return { ok: false, msg: '切書模組不可用' };
        const r = await gate.enterParallax();
        if (!r.ok) return r;
        const sent = _toChat(_divePrompt(w));
        if (!sent) { await gate.exitParallax(); return { ok: false, msg: '找不到酒館輸入框,已切回主世界' }; }
        w.visits = (w.visits || 0) + 1;
        const worlds = await _get(K_WORLDS, []);
        const i = worlds.findIndex(x => x.id === w.id);
        if (i >= 0) worlds[i] = w;
        await _set(K_WORLDS, worlds);
        _clearTravelers();
        return { ok: true, msg: '已進入「' + w.name + '」' };
    }

    // ════════════════════════════════════════════════════════
    // UI:量子白停靠窗(仿書咖 dock 幾何;兩層換頁:檔案庫⇄種子/詳情)
    // ════════════════════════════════════════════════════════
    function _ensureStyle(doc) {
        if (doc.getElementById('os-wg-style')) return;
        const st = doc.createElement('style');
        st.id = 'os-wg-style';
        st.textContent =
            /* 🌌 量子白:純白大廳配色(白霧面板+墨藍字+銀光點綴),跟愛麗絲站在一起不突兀 */
            '.wg-win{position:absolute;right:max(2.2%,calc(50% - 410px));top:50%;transform:translateY(-50%);z-index:3350;width:400px;max-width:52%;min-height:min(500px,74%);max-height:80%;display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(rgba(250,251,255,.97),rgba(238,240,246,.97));border:1px solid rgba(26,28,40,.16);border-radius:16px;color:#1A1C28;font-size:13px;box-shadow:0 14px 40px rgba(26,28,40,.28),inset 0 0 0 3px rgba(255,255,255,.5);backdrop-filter:blur(8px);}' +
            '.wg-head{display:flex;align-items:center;gap:10px;padding:11px 13px;border-bottom:1px solid rgba(26,28,40,.1);background:rgba(255,255,255,.55);}' +
            '.wg-brand{display:flex;align-items:center;gap:9px;min-width:0;}.wg-brand-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:#1A1C28;color:#fff;font-size:16px;box-shadow:0 3px 9px rgba(26,28,40,.22);}' +
            '.wg-brand-copy{display:flex;flex-direction:column;line-height:1.05;white-space:nowrap;}.wg-brand-copy b{font-size:15px;letter-spacing:.06em;}.wg-brand-copy small{margin-top:4px;color:#8a8ea6;font-size:8px;letter-spacing:.18em;font-weight:700;}' +
            '.wg-mode-pill{margin-left:auto;display:flex;align-items:center;gap:5px;padding:5px 9px;border:1px solid rgba(26,28,40,.14);border-radius:8px;background:rgba(255,255,255,.6);color:#5a5e75;font-size:10px;font-weight:700;white-space:nowrap;}' +
            '.wg-mode-pill.para{background:#1A1C28;color:#EAF2FF;border-color:#1A1C28;}' +
            '.wg-head .wg-close{background:none;border:none;color:#4a4e66;cursor:pointer;font-size:15px;padding:5px 6px;border-radius:8px;}.wg-head .wg-close:hover{background:rgba(26,28,40,.08);}' +
            '.wg-body{overflow-y:auto;padding:11px 13px 14px;flex:1;display:flex;flex-direction:column;scrollbar-color:rgba(26,28,40,.25) transparent;scrollbar-width:thin;}' +
            '.wg-empty{margin:auto;color:#8a8ea6;padding:24px 6px;text-align:center;line-height:1.8;}.wg-empty i{display:block;margin-bottom:8px;color:#b9bed4;font-size:28px;}' +
            '.wg-section-head{display:flex;align-items:center;justify-content:space-between;margin:0 1px 8px;color:#3a3e56;}.wg-section-title{font-weight:800;font-size:13px;letter-spacing:.04em;}.wg-section-note{color:#8a8ea6;font-size:10px;}' +
            '.wg-card{margin-bottom:8px;padding:10px 12px;border:1px solid rgba(26,28,40,.13);border-radius:12px;background:rgba(255,255,255,.72);box-shadow:0 2px 7px rgba(26,28,40,.05);}' +
            '.wg-card.click{cursor:pointer;transition:transform .15s,background .15s,border-color .15s;}.wg-card.click:hover{transform:translateY(-1px);background:#fff;border-color:rgba(26,28,40,.3);}' +
            '.wg-card.sel{border-color:#1A1C28;box-shadow:0 0 0 1px #1A1C28;background:#fff;}' +
            '.wg-card-title{display:flex;align-items:center;gap:6px;font-weight:800;color:#22263c;}.wg-card-title .wg-visits{margin-left:auto;color:#8a8ea6;font-size:9px;font-weight:700;white-space:nowrap;}' +
            '.wg-card-sub{color:#5a5e75;font-size:11px;margin-top:3px;line-height:1.5;}' +
            '.wg-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;}.wg-tag{padding:1px 6px;border-radius:9px;background:rgba(26,28,40,.06);color:#5a5e75;font-size:9px;border:1px solid rgba(26,28,40,.08);}' +
            '.wg-tag.warn{background:rgba(180,80,60,.08);color:#a05040;border-color:rgba(180,80,60,.2);}' +
            '.wg-btn{width:100%;margin-top:10px;background:#1A1C28;border:1px solid #1A1C28;color:#fff;font-weight:800;border-radius:11px;padding:10px 0;cursor:pointer;font-size:12px;box-shadow:0 4px 10px rgba(26,28,40,.2);}' +
            '.wg-btn:disabled{opacity:.4;cursor:default;box-shadow:none;}' +
            '.wg-btn.ghost{background:rgba(255,255,255,.6);color:#3a3e56;border:1px solid rgba(26,28,40,.18);box-shadow:none;}' +
            '.wg-btn.danger{background:rgba(180,80,60,.1);color:#a05040;border:1px solid rgba(180,80,60,.3);box-shadow:none;}' +
            '.wg-btn-row{display:flex;gap:7px;}.wg-btn-row .wg-btn{flex:1;}' +
            '.wg-note{color:#8a8ea6;font-size:10px;text-align:center;margin-top:7px;line-height:1.5;}' +
            '.wg-loading{margin:auto;display:flex;flex-direction:column;align-items:center;gap:12px;color:#8a8ea6;font-size:11px;letter-spacing:2px;font-weight:700;}' +
            '.wg-spinner{width:26px;height:26px;border:2px solid rgba(26,28,40,.15);border-top-color:#1A1C28;border-radius:50%;animation:wgSpin 1s linear infinite;}' +
            '@keyframes wgSpin{to{transform:rotate(360deg)}}' +
            '.wg-input{width:100%;box-sizing:border-box;margin-top:8px;background:rgba(255,255,255,.8);border:1px solid rgba(26,28,40,.16);border-radius:9px;color:#1A1C28;padding:8px 10px;font-size:11px;}' +
            '.wg-input::placeholder{color:#a0a4ba;}' +
            '.wg-trav{display:flex;align-items:center;gap:9px;margin-bottom:6px;padding:8px 10px;border:1px solid rgba(26,28,40,.12);border-radius:10px;background:rgba(255,255,255,.65);cursor:pointer;transition:.15s;}' +
            '.wg-trav:hover{background:#fff;}.wg-trav.on{border-color:#1A1C28;background:#fff;box-shadow:0 0 0 1px #1A1C28;}' +
            '.wg-trav-avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:rgba(26,28,40,.07);color:#3a3e56;font-size:13px;flex:none;}' +
            '.wg-trav-main{min-width:0;flex:1;}.wg-trav-name{font-weight:800;color:#22263c;font-size:12px;}.wg-trav-name small{color:#8a8ea6;font-weight:700;font-size:9px;margin-left:5px;}' +
            '.wg-trav-sub{color:#5a5e75;font-size:10px;margin-top:2px;line-height:1.45;}' +
            '.wg-trav-check{color:#1A1C28;font-weight:900;font-size:13px;}' +
            '.wg-entry-text{color:#3a3e56;font-size:11px;line-height:1.7;white-space:pre-wrap;}' +
            '@media (max-width:760px){.wg-win{right:10px;left:10px;width:auto;max-width:none;max-height:76%;}.wg-brand-copy small{display:none}.void-dock-open #iris-avatar{opacity:.22;filter:brightness(.55) blur(1px);transition:opacity .25s;}}';
        doc.head.appendChild(st);
    }

    let _winEl = null;
    let _seeds = [];        // 本次抽出的種子(暫存,不落盤)
    let _busy = false;
    function _toast(msg) {
        try { win.toastr?.info(msg, '🌌 世界門'); } catch (e) {}
        console.log('[Worldgate③]', msg);
    }
    function closeGate() {
        _winEl?.remove(); _winEl = null;
        try { win.document.querySelector('.lobby-left')?.classList.remove('void-dock-open'); } catch (e) {}
    }
    async function openGate() {
        closeGate();
        const doc = win.document;
        _ensureStyle(doc);
        const host = doc.querySelector('.lobby-left') || doc.body;
        host.classList.add('void-dock-open');
        const box = doc.createElement('div');
        box.className = 'wg-win';
        box.innerHTML =
            '<div class="wg-head">' +
              '<div class="wg-brand"><span class="wg-brand-icon"><i class="fa-solid fa-globe"></i></span>' +
                '<span class="wg-brand-copy"><b>世界門</b><small>WORLD GATE PLAZA</small></span></div>' +
              '<span class="wg-mode-pill" data-wg-mode><i class="fa-solid fa-city"></i> 主世界</span>' +
              '<button class="wg-close" title="關閉"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="wg-body"></div>';
        host.appendChild(box);
        _winEl = box;
        box.querySelector('.wg-close').addEventListener('click', closeGate);
        _refreshModePill();
        _renderList();
    }
    function _refreshModePill() {
        if (!_winEl) return;
        const pill = _winEl.querySelector('[data-wg-mode]');
        if (!pill) return;
        const inPara = !!_gate()?.isInParallax?.();
        pill.classList.toggle('para', inPara);
        pill.innerHTML = inPara
            ? '<i class="fa-solid fa-bolt"></i> 視差進行中'
            : '<i class="fa-solid fa-city"></i> 主世界';
    }
    function _body() { return _winEl ? _winEl.querySelector('.wg-body') : null; }
    function _loading(text) {
        const b = _body();
        if (b) b.innerHTML = '<div class="wg-loading"><div class="wg-spinner"></div><span>' + text + '</span></div>';
    }

    // ── P1 世界檔案庫 ──
    async function _renderList() {
        const b = _body(); if (!b) return;
        const worlds = await _get(K_WORLDS, []);
        const inPara = !!_gate()?.isInParallax?.();
        b.innerHTML =
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-book-atlas"></i> 世界檔案庫</span><span class="wg-section-note">' + worlds.length + ' 個世界</span></div>' +
            (worlds.length
                ? worlds.map(w =>
                    '<div class="wg-card click" data-id="' + w.id + '">' +
                      '<div class="wg-card-title"><i class="fa-solid fa-earth-asia"></i> ' + _esc(w.name) +
                        '<span class="wg-visits">進入 ' + (w.visits || 0) + ' 次</span></div>' +
                      '<div class="wg-card-sub">' + _esc(w.concept) + '</div>' +
                      '<div class="wg-tags"><span class="wg-tag">' + _esc(w.style) + '</span>' +
                        '<span class="wg-tag">' + _esc(w.lure) + '</span>' +
                        '<span class="wg-tag warn">' + _esc(w.danger) + '</span></div>' +
                    '</div>').join('')
                : '<div class="wg-empty"><i class="fa-solid fa-globe"></i>檔案庫還是空的。<br>請愛麗絲為你調出新的世界。</div>') +
            '<button class="wg-btn" data-act="draw"><i class="fa-solid fa-dice"></i> 請愛麗絲調出新世界</button>' +
            '<div class="wg-note">調出新世界會呼叫 AI(抽選+展開共兩次);重進已有世界不呼叫。</div>' +
            (inPara ? '<button class="wg-btn danger" data-act="leave"><i class="fa-solid fa-door-open"></i> 撤離視差,返回主世界</button>' : '');
        b.querySelectorAll('.wg-card.click').forEach(el => el.addEventListener('click', async () => {
            const worlds2 = await _get(K_WORLDS, []);
            const w = worlds2.find(x => x.id === el.dataset.id);
            if (w) _renderDetail(w);
        }));
        b.querySelector('[data-act="draw"]')?.addEventListener('click', _renderSeedPage);
        b.querySelector('[data-act="leave"]')?.addEventListener('click', async () => {
            const r = await _gate()?.exitParallax?.();
            _toast(r?.msg || '已返回主世界');
            _refreshModePill(); _renderList();
        });
    }

    // ── P2 種子抽選 ──
    async function _renderSeedPage() {
        const b = _body(); if (!b) return;
        b.innerHTML =
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-dice"></i> 世界種子</span><span class="wg-section-note">此頁功能會呼叫 AI</span></div>' +
            '<div class="wg-empty" data-wg-seedhint><i class="fa-solid fa-wand-magic-sparkles"></i>告訴愛麗絲你想要什麼樣的世界,<br>或直接抽一把碰運氣。</div>' +
            '<input class="wg-input" data-wg-hint maxlength="30" placeholder="想玩的題材/氛圍(可留空)">' +
            '<div class="wg-btn-row">' +
              '<button class="wg-btn ghost" data-act="back">返回</button>' +
              '<button class="wg-btn" data-act="roll"><i class="fa-solid fa-dice"></i> 抽世界種子</button>' +
            '</div>';
        b.querySelector('[data-act="back"]').addEventListener('click', _renderList);
        b.querySelector('[data-act="roll"]').addEventListener('click', () => _rollSeeds());
        if (_seeds.length) _renderSeedCards();   // 上次抽的還在就直接顯示(不重燒)
    }
    async function _rollSeeds() {
        if (_busy) return;
        _busy = true;
        const hint = _body()?.querySelector('[data-wg-hint]')?.value?.trim() || '';
        _loading('愛麗絲正在調閱世界庫…');
        _seeds = await _drawSeeds(hint);
        _busy = false;
        if (!_seeds.length) {
            const b = _body(); if (!b) return;
            _renderSeedPage();
            const hintEl = b.querySelector('[data-wg-seedhint]');
            if (hintEl) hintEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>世界庫沒有回應,請再試一次。';
            return;
        }
        _renderSeedCards();
    }
    function _renderSeedCards() {
        const b = _body(); if (!b) return;
        b.innerHTML =
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-dice"></i> 選一個世界展開</span><span class="wg-section-note">' + _seeds.length + ' 顆種子</span></div>' +
            _seeds.map((s, i) =>
                '<div class="wg-card click" data-i="' + i + '">' +
                  '<div class="wg-card-title"><i class="fa-solid fa-seedling"></i> ' + _esc(s.name) + '</div>' +
                  '<div class="wg-card-sub">' + _esc(s.concept) + '</div>' +
                  '<div class="wg-card-sub">' + _esc(s.crisis || '') + '</div>' +
                  '<div class="wg-tags"><span class="wg-tag">' + _esc(s.style) + '</span>' +
                    '<span class="wg-tag">' + _esc(s.lure) + '</span>' +
                    '<span class="wg-tag warn">' + _esc(s.danger) + '</span></div>' +
                '</div>').join('') +
            '<div class="wg-btn-row">' +
              '<button class="wg-btn ghost" data-act="back">返回</button>' +
              '<button class="wg-btn ghost" data-act="reroll"><i class="fa-solid fa-rotate-right"></i> 重抽一把</button>' +
            '</div>' +
            '<div class="wg-note">點選種子後會展開成完整世界並存進檔案庫(呼叫一次 AI)。</div>';
        b.querySelector('[data-act="back"]').addEventListener('click', _renderSeedPage);
        b.querySelector('[data-act="reroll"]').addEventListener('click', () => { _seeds = []; _renderSeedPage(); });
        b.querySelectorAll('.wg-card.click').forEach(el => el.addEventListener('click', () => _pickSeed(Number(el.dataset.i))));
    }
    async function _pickSeed(i) {
        if (_busy) return;
        const seed = _seeds[i];
        if (!seed) return;
        _busy = true;
        _loading('正在建構「' + _esc(seed.name) + '」…');
        const r = await _expandWorld(seed);
        _busy = false;
        if (!r || !r.entry) { _toast('世界建構失敗,請重試'); _renderSeedCards(); return; }
        const w = {
            id: _mkId(), name: seed.name, concept: seed.concept, style: seed.style,
            lure: seed.lure, danger: seed.danger, crisis: seed.crisis,
            keys: (Array.isArray(r.keys) && r.keys.length) ? r.keys.map(String) : [seed.name],
            travelers: (Array.isArray(r.travelers) ? r.travelers : []).slice(0, 4).map(t => ({
                name: String(t.name || '無名旅人'), job: String(t.job || '旅人'),
                persona: String(t.persona || ''), origin: String(t.origin || ''), skill: String(t.skill || ''),
                recruited: false,
            })),
            visits: 0, ts: Date.now(),
        };
        const wrote = await _writeEntry(w, String(r.entry));
        if (!wrote) { _toast('世界條目寫入失敗(確認已匯入' + BOOK_PARA + ')'); _renderSeedCards(); return; }
        const worlds = await _get(K_WORLDS, []);
        worlds.unshift(w);
        await _set(K_WORLDS, worlds);
        _seeds = [];
        _toast('「' + w.name + '」已存入檔案庫');
        _renderDetail(w);
    }

    // ── P3 世界詳情(旅人招募+DIVE) ──
    let _delArm = 0;   // 刪除兩段式確認(不用 window.confirm,Tauri 會攔)
    async function _renderDetail(w) {
        const b = _body(); if (!b) return;
        _delArm = 0;
        let entryText = '';
        try {
            const entries = await _th()?.getLorebookEntries?.(BOOK_PARA);
            const e = (entries || []).find(x => x.comment === _entryComment(w));
            entryText = e ? e.content : '';
        } catch (e) {}
        const travHtml = (w.travelers || []).map((t, i) =>
            '<div class="wg-trav' + (t.recruited ? ' on' : '') + '" data-i="' + i + '">' +
              '<span class="wg-trav-avatar"><i class="fa-solid fa-user"></i></span>' +
              '<span class="wg-trav-main"><span class="wg-trav-name">' + _esc(t.name) + '<small>' + _esc(t.job) + '</small></span>' +
                '<span class="wg-trav-sub">' + _esc(t.persona) + ' ' + _esc(t.origin) + '</span></span>' +
              (t.recruited ? '<span class="wg-trav-check"><i class="fa-solid fa-check"></i></span>' : '') +
            '</div>').join('');
        b.innerHTML =
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-earth-asia"></i> ' + _esc(w.name) + '</span><span class="wg-section-note">進入 ' + (w.visits || 0) + ' 次</span></div>' +
            '<div class="wg-card"><div class="wg-card-sub">' + _esc(w.concept) + '</div>' +
              '<div class="wg-tags"><span class="wg-tag">' + _esc(w.style) + '</span><span class="wg-tag">' + _esc(w.lure) + '</span><span class="wg-tag warn">' + _esc(w.danger) + '</span></div></div>' +
            (entryText ? '<div class="wg-card"><div class="wg-entry-text">' + _esc(entryText.length > 600 ? entryText.slice(0, 600) + '…' : entryText) + '</div></div>' : '') +
            '<div class="wg-section-head"><span class="wg-section-title"><i class="fa-solid fa-users"></i> 旅人候選</span><span class="wg-section-note">點選=邀入隊</span></div>' +
            (travHtml || '<div class="wg-empty">這個世界沒有旅人候選。</div>') +
            (travHtml ? '<div class="wg-note"><i class="fa-solid fa-person-walking"></i> 旅人們已陸續上線大廳,走過去可以搭話。</div>' : '') +
            '<button class="wg-btn" data-act="dive"><i class="fa-solid fa-bolt"></i> DIVE·進入世界</button>' +
            '<div class="wg-btn-row">' +
              '<button class="wg-btn ghost" data-act="back">返回</button>' +
              '<button class="wg-btn danger" data-act="del"><i class="fa-solid fa-trash-can"></i> 刪除世界</button>' +
            '</div>';
        b.querySelectorAll('.wg-trav').forEach(el => el.addEventListener('click', async () => {
            const t = w.travelers[Number(el.dataset.i)];
            if (!t) return;
            t.recruited = !t.recruited;
            const worlds = await _get(K_WORLDS, []);
            const idx = worlds.findIndex(x => x.id === w.id);
            if (idx >= 0) { worlds[idx] = w; await _set(K_WORLDS, worlds); }
            _renderDetail(w);
        }));
        _spawnTravelers(w);   // 點開世界=旅人自動陸續上線(非大廳場景時靜默跳過)
        b.querySelector('[data-act="dive"]').addEventListener('click', async () => {
            if (_busy) return;
            _busy = true;
            _loading('正在同步量子行李…');
            const r = await _dive(w);
            _busy = false;
            _toast(r.msg);
            if (r.ok) { _refreshModePill(); closeGate(); }
            else _renderDetail(w);
        });
        b.querySelector('[data-act="back"]').addEventListener('click', _renderList);
        b.querySelector('[data-act="del"]').addEventListener('click', async (ev) => {
            if (_delArm === 0) {
                _delArm = 1;
                ev.currentTarget.innerHTML = '<i class="fa-solid fa-trash-can"></i> 再按一次確認刪除';
                return;
            }
            await _deleteEntry(w);
            const worlds = await _get(K_WORLDS, []);
            await _set(K_WORLDS, worlds.filter(x => x.id !== w.id));
            _clearTravelers();
            _toast('「' + w.name + '」已從檔案庫移除');
            _renderList();
        });
    }

    win.OS_WORLDGATE = window.OS_WORLDGATE = { openGate, closeGate };
    console.log('[Worldgate③] 世界門面板就緒');
})();
