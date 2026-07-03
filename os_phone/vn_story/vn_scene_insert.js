// ============================================================================
// VN_SceneInsert — 副模型場景插圖渲染器（[3/3]）
// ----------------------------------------------------------------------------
// 由 rpg/state_runtime.js 的 extractOnce 呼叫：fromExtract(scenes, {chatId, msgId})。
// scenes = [{ after:"正文短語(錨點)", prompt:"Danbooru tags" }]（最多取 2 張）。
//
// 顯示（對齊使用者選擇「VN 劇情畫面，同主模型」）：把每張 scene 當作
// <scene>…</scene> block，splice 進「正在播放的 VN 劇本」(VN_Core.script)，
// 插在當前 index 之後／錨點之後 → 玩家往下點就順流跳出全螢幕 CG
// （重用 vn_core 既有 <scene> handler + _safeFetchScene + #scene-cg-overlay）。
//
// ★ 時機：extractOnce(副模型)常「比 VN loadScript 先跑完」→ 派發時 VN.script 還空的。
//   所以 fromExtract 只「記下最新這輪的圖(_latest)」+ 立刻預熱生圖；真正 splice 在 VN 載 script 時。
//
// ★ 對位（2026-06-29 重構 7cf5731/8b96593/此次）：★不靠 msgId 數字★——TauriTavern 懶載「窗口號」
//   每輪都撞同一個 key、跟 VN/磁碟號還會漂移，靠 ID 對位時好時壞、回放還會誤撈最新圖。改用「語意」：
//     ① 最新這輪：vn_core.loadScript 尾端呼叫 applyLatestFresh() → 插 _latest(用完即清)。
//        VN 因「生成結束自動偵測」載的就是最新這輪；回放舊章節時 _latest 已是 null → 不會誤插。
//     ② 回放舊章節：圖在生成時就由 _persistToLatestChapter 寫回該章存檔的 scenes 欄；
//        vn_panels 章節卡 loadScript 後呼叫 applyChapterScenes(ch.scenes) → 用同套錨點插回。
//
// 冪等 / 防呆：
//   • 同一份 script 用「scene-id 是否已存在」做冪等，避免重複插。
//   • _latest 用完即清 → 下一個「沒出圖的輪」載 script 時是 null、不會把舊圖誤插進新劇本。
//   • VN 場景顯示關閉(vn_scene_enabled==='0')/劇本未載入 → 跳過。
// ============================================================================
(function (win) {
    'use strict';

    const VN_SceneInsert = {
        _latest: null, // 最新一次 fromExtract 的 { chatId, entries }（「最新這輪」直插用，不靠 ID；用完即清）

        // 預熱場景CG並掛進 VN_Core 的圖片總進度（loading 面板/語音延後靠它判斷「圖都好了沒」）。
        // 同 cacheId 與 vn_core._prewarmScenes 共用 in-flight promise，重複計數只多算進度分母、不會重複生圖。
        _sceneFetchChain: Promise.resolve(),  // 預熱生圖序列鏈：一張完成才生下一張，源頭杜絕場景插圖併發（下游 _naiQueue mutex 是第二道閘）
        _fetchSceneCounted: function (cacheId, prompt) {
            const VN = win.VN_Core;
            if (!VN || !VN._safeFetchScene) return;
            const run = function () {
                if (typeof VN._imgJobStart === 'function') {
                    VN._imgJobStart();
                    return Promise.resolve(VN._safeFetchScene(cacheId, prompt))
                        .then(function () {}, function () {})
                        .then(function () { VN._imgJobEnd(); });
                }
                return Promise.resolve(VN._safeFetchScene(cacheId, prompt)).then(function () {}, function () {});
            };
            // 串行：上一張預熱完才生下一張 → 場景插圖永遠不會兩張同時打生圖
            this._sceneFetchChain = this._sceneFetchChain.then(run, run);
        },

        _hash: function (str) {
            let h = 0;
            for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
            return Math.abs(h).toString(36);
        },

        // ══ ID 標籤寫回正文（治「重啟 TauriTavern 插圖就不見」）═══════════════════
        // Rae 的架構：正文在酒館、奧瑞亞只是展示層 → 插圖資訊就該住在正文裡。
        // 生成後把 ID-only 標籤「[Scene|cacheId]」寫進最新樓正文的錨點位置：
        //   • 不帶 prompt/數據 → 不污染 AI 上下文、幾乎不吃 token；
        //   • 圖已存相簿(scene_cache 按 cacheId)，播放時 ID 直接對相簿撈圖（vn_core [Scene| handler）；
        //   • 位置釘死在正文行裡 → 重啟/回放/章節卡永遠原位，不再掉位置。
        // 樓層守衛：TauriTavern 懶載樓號會漂，不信 ctx.msgId——取 -1(最新樓)＋必須是
        // assistant 樓＋含 <content>＋（有錨點時）至少一個錨點在正文命中，才動筆；否則放棄不寫。
        _writeBackToMessage: async function (entries) {
            try {
                if (!Array.isArray(entries) || !entries.length) return;
                const TH = win.TavernHelper;
                if (!TH || !TH.getChatMessages || !TH.setChatMessages) return;   // 獨立版沒有酒館樓層 → 走既有 ch.scenes 路
                const msgs = TH.getChatMessages(-1);
                const m = Array.isArray(msgs) ? msgs[0] : null;
                if (!m || m.role !== 'assistant' || typeof m.message !== 'string') { console.log('[VN_SceneInsert🔎] 寫回正文跳過：最新樓非 assistant 劇情樓'); return; }
                const text = m.message;
                if (text.indexOf('<content>') < 0) { console.log('[VN_SceneInsert🔎] 寫回正文跳過：最新樓沒有 <content>'); return; }

                const lines = text.split('\n');
                // <content> 區塊邊界（標籤可能跟正文擠同行，只求行號範圍）。
                // 從最後一個 </thinking> 之後開始找：CoT 裡「提到」<content> 字樣不算正文開始，免得 ID 標籤插進思考區被剝掉
                let scanFrom = 0;
                for (let i = 0; i < lines.length; i++) if (/<\/think(?:ing)?>/i.test(lines[i])) scanFrom = i + 1;
                let cStart = -1, cEnd = lines.length;
                for (let i = scanFrom; i < lines.length; i++) {
                    if (cStart < 0 && lines[i].indexOf('<content>') >= 0) cStart = i;
                    if (cStart >= 0 && lines[i].indexOf('</content>') >= 0) { cEnd = i; break; }
                }
                if (cStart < 0) return;

                const todo = entries.filter(e => e && e.cacheId && text.indexOf(e.cacheId) < 0);   // 冪等：正文已有這 ID 就不重寫
                if (!todo.length) return;
                // 錨點守衛：這批插圖若帶錨點，至少要有一個能在這樓正文命中——命不中代表 -1 樓不是本輪那樓（樓號漂/使用者又發話了）
                const withAnchor = todo.filter(e => e.after);
                const hits = {};
                withAnchor.forEach(e => { hits[e.cacheId] = this._findAnchor(lines, e.after); });
                if (withAnchor.length && !withAnchor.some(e => hits[e.cacheId] >= 0)) { console.log('[VN_SceneInsert🔎] 寫回正文放棄：錨點全都對不上最新樓（不是本輪那樓，絕不改錯樓）'); return; }

                let written = 0;
                todo.forEach(e => {
                    const aIdx = (e.after && hits[e.cacheId] !== undefined) ? hits[e.cacheId] : (e.after ? this._findAnchor(lines, e.after) : -1);
                    let pos;
                    if (aIdx > cStart && aIdx < cEnd) pos = aIdx + 1;                     // 錨點行之後
                    else pos = Math.min(cEnd, cStart + 1 + Math.round((cEnd - cStart - 1) * ((e.idx || 0) + 1) / (todo.length + 1)));   // 沒錨點/命中在區塊外 → 區塊內平均分散
                    lines.splice(pos, 0, '[Scene|' + e.cacheId + ']');
                    if (pos <= cEnd) cEnd++;
                    written++;
                });
                if (!written) return;
                await TH.setChatMessages([{ message_id: m.message_id, message: lines.join('\n') }], { refresh: 'none' });   // 不重渲染，避免觸發別的 handler 連鎖
                console.log('[VN_SceneInsert] ID 標籤寫回正文 ✅ 樓#' + m.message_id + ' +' + written + ' 張 → 重啟/回放直接對相簿撈圖');
            } catch (e) { console.warn('[VN_SceneInsert] 寫回正文失敗:', (e && e.message) || e); }
        },

        // 正規化：去掉空白(含全形)、標點、符號，小寫 → 讓錨點比對容忍標點/空白/全形差異
        _norm: function (s) {
            try { return String(s).toLowerCase().replace(/[\s　\p{P}\p{S}]+/gu, ''); }
            catch (e) { return String(s).toLowerCase().replace(/\s+/g, ''); }
        },

        // 在 script 行裡找錨點。副模型常「改寫」after 沒逐字抄、且它看的是含標籤/截斷的原始訊息
        // ≠ VN 清洗後的劇本行 → 精確比對對不上。故用「最長逐字片段」：正規化後，由長到短切
        // after 的連續片段，只要某行含 5+ 字的逐字重疊就算命中該行。回傳行索引或 -1。
        _findAnchor: function (script, after) {
            const a = this._norm(after);
            if (!a) return -1;
            const lines = [];
            for (let i = 0; i < script.length; i++) lines.push(this._norm(script[i]));
            if (a.length < 5) {
                for (let i = 0; i < lines.length; i++) if (lines[i].indexOf(a) >= 0) return i;
                return -1;
            }
            for (let len = a.length; len >= 5; len--) {
                for (let start = 0; start + len <= a.length; start++) {
                    const sub = a.slice(start, start + len);
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].indexOf(sub) >= 0) return i;
                    }
                }
            }
            return -1;
        },

        // extractOnce 派發進來：建立排隊 + 預熱生圖；若 VN 此刻就停在該則就立刻插
        fromExtract: function (scenes, ctx) {
            try {
                if (!Array.isArray(scenes) || !scenes.length) return;
                ctx = ctx || {};
                const msgId = (ctx.msgId != null) ? String(ctx.msgId) : null;
                if (msgId == null) return;
                const chatId = (ctx.chatId != null) ? String(ctx.chatId) : '';

                const entries = [];
                scenes.slice(0, 2).forEach((s, idx) => {
                    if (!s || !s.prompt) return;
                    const prompt = String(s.prompt).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
                    if (!prompt) return;
                    const cacheId = 'ext_' + this._hash(chatId + '_' + msgId + '_' + idx + '_' + prompt);
                    entries.push({ cacheId: cacheId, prompt: prompt, after: s.after ? String(s.after).trim() : '', idx: idx });
                    // 立刻預熱生圖（in-flight dedup，等播到時秒出）；掛進 VN 圖片總進度，loading/語音延後才看得到它
                    try { this._fetchSceneCounted(cacheId, prompt); } catch (e) {}
                });
                if (!entries.length) return;

                // 「最新這輪」直插用：記下這次的圖。VN 因「生成結束」載最新 script 時(loadScript 尾端 applyLatestFresh)直接插、不靠 ID 數字。
                this._latest = { chatId: chatId, entries: entries };
                console.log('[VN_SceneInsert] 已記最新這輪 ' + entries.length + ' 張(已預熱) msg#' + msgId);

                // ★持久化主力：把 ID-only [Scene|cacheId] 標籤寫回酒館正文錨點位置（fire-and-forget）。
                //   正文=唯一資料源 → 重啟/回放/章節卡載到同一則正文就原位播、ID 直接對相簿撈圖。
                try { this._writeBackToMessage(entries); } catch (e) {}

                // ordering B：圖比 loadScript 晚到、VN 已有載著的劇本 → 直接插「最新這輪」；VN 還沒載 → 等 loadScript 尾端的 applyLatestFresh
                const VN = win.VN_Core;
                const _vnLen = (VN && Array.isArray(VN.script)) ? VN.script.length : -1;
                if (VN && Array.isArray(VN.script) && VN.script.length) {
                    console.log('[VN_SceneInsert🔎] 圖晚到→直插最新這輪(script長=' + _vnLen + ')');
                    this.applyLatestFresh();
                } else {
                    console.log('[VN_SceneInsert🔎] 排隊等 loadScript(VN script長=' + _vnLen + ')');
                }
            } catch (e) {
                console.warn('[VN_SceneInsert] fromExtract 失敗:', (e && e.message) || e);
            }
        },

        // 把一組 entries splice 進「VN 現在載著的那份 script」（冪等靠 scene-id）。
        //   ★呼叫端負責保證「現在這份 script 就是該插的那則」——本函式不管 ID，只管插。回傳插入張數。
        _spliceInto: function (entries) {
            const VN = win.VN_Core;
            if (!VN || !Array.isArray(VN.script) || !VN.script.length) { console.log('[VN_SceneInsert🔎] _spliceInto 跳過：劇本未載入/空'); return 0; }
            if (localStorage.getItem('vn_scene_enabled') === '0') { console.log('[VN_SceneInsert🔎] _spliceInto 跳過：場景顯示關(vn_scene_enabled=0)'); return 0; }
            let cursor = (typeof VN.index === 'number') ? VN.index : -1;
            let inserted = 0;
            for (let k = 0; k < entries.length; k++) {
                const e = entries[k];
                const idTag = 'scene-id: ' + e.cacheId;
                if (VN.script.indexOf(idTag) >= 0) continue; // 這份劇本已含 → 冪等跳過
                // 正文已寫回 [Scene|cacheId] 標籤（寫回比 loadScript 先完成的順序）→ 劇本自帶、不再疊插
                if (VN.script.some(l => typeof l === 'string' && l.indexOf('[Scene|' + e.cacheId) === 0)) continue;

                // 找錨點(正規化容錯)；找不到 or 已播過 → 平均分散，別全擠末尾
                const aIdx = e.after ? this._findAnchor(VN.script, e.after) : -1;
                let pos;
                if (aIdx >= 0 && aIdx + 1 > cursor) {
                    pos = aIdx + 1; // 錨點行之後
                } else {
                    const denom = entries.length + 1;       // 2 張 → 1/3、2/3 處
                    pos = Math.round(VN.script.length * (e.idx + 1) / denom);
                    if (pos <= cursor) pos = cursor + 1;
                    if (pos > VN.script.length) pos = VN.script.length;
                }
                console.log('[VN_SceneInsert] 錨點 "' + (e.after || '(無)') + '" → ' +
                    (aIdx >= 0 ? '命中 line ' + aIdx : '未命中→分散') + '，pos ' + pos + '/' + VN.script.length);

                VN.script.splice(pos, 0, '<scene>', idTag, e.prompt, '</scene>');
                if (pos <= VN.index) VN.index += 4;
                cursor = pos + 3;
                inserted++;
                try { this._fetchSceneCounted(e.cacheId, e.prompt); } catch (_) {}
                console.log('[VN_SceneInsert] 插入場景 #' + e.idx + ' @script[' + pos + '] cacheId=' + e.cacheId);
            }
            return inserted;
        },

        // 🎯 最新這輪：由 vn_core 的「生成結束自動偵測」載完最新 script 後呼叫——直接插剛排隊的最新插圖，★不靠 ID 數字。
        //   為什麼安全：只有「生成結束」那條路會載最新這輪的 script；重播舊章節/捲回走別的路、不呼叫本函式 → 新圖不會污染舊則。
        applyLatestFresh: function () {
            try {
                const L = this._latest;
                if (!L || !L.entries || !L.entries.length) { return; }   // 圖還沒生好(VN 先載)→不動，等晚到那條(fromExtract 即時插)補
                const n = this._spliceInto(L.entries);
                if (n) console.log('[VN_SceneInsert] 最新這輪：直接 splice ' + n + ' 張(不靠ID)，往下點即播');
                // 寫回「最新這章」存檔（章節選擇/重整後回放也看得到，不丟）；圖檔本就在硬碟，只補「插哪一段」的資訊
                this._persistToLatestChapter(L.entries);
                // ★用完即清：下一個「沒出插圖的輪」載 script 時 _latest 會是 null → 不會把這張舊圖誤插進新劇本
                this._latest = null;
            } catch (e) {
                console.warn('[VN_SceneInsert] applyLatestFresh 失敗:', (e && e.message) || e);
            }
        },

        // 把插圖 entries 寫回「最新一章」存檔的 scenes 欄（不動原始正文）；回放時 applyChapterScenes 用同一套錨點插回。
        _persistToLatestChapter: async function (entries) {
            try {
                if (!Array.isArray(entries) || !entries.length) return;
                if (!win.OS_DB || !win.OS_DB.getAllVnChapters || !win.OS_DB.saveVnChapter) return;
                const all = await win.OS_DB.getAllVnChapters();
                if (!Array.isArray(all) || !all.length) return;
                let latest = all[0];
                for (let i = 1; i < all.length; i++) if ((all[i].createdAt || 0) > (latest.createdAt || 0)) latest = all[i];
                if (!latest) return;
                // 守衛：最新章節必須是「剛存的」(2分鐘內)——否則多半是本輪章節還沒存好，別把新圖誤掛到上一章
                if (Date.now() - (latest.createdAt || 0) > 120000) { console.log('[VN_SceneInsert🔎] 寫回章節跳過：最新章節非近期(本輪可能還沒存)'); return; }
                const saved = Array.isArray(latest.scenes) ? latest.scenes.slice() : [];
                const have = {}; saved.forEach(s => { if (s && s.cacheId) have[s.cacheId] = 1; });
                let added = 0;
                entries.forEach(e => { if (e && e.cacheId && !have[e.cacheId]) { saved.push({ cacheId: e.cacheId, prompt: e.prompt, after: e.after || '', idx: e.idx }); added++; } });
                if (!added) return;
                latest.scenes = saved;
                await win.OS_DB.saveVnChapter(latest);   // put = upsert，同 id 覆寫
                console.log('[VN_SceneInsert] 插圖寫回章節存檔 #' + latest.id + '(+' + added + '張)，回放/重整後可見');
            } catch (e) { console.warn('[VN_SceneInsert] 寫回章節失敗:', (e && e.message) || e); }
        },

        // 回放(章節選擇)用：把該章存檔的 scenes splice 進剛載的 script（同一套錨點邏輯）。圖檔在硬碟、不重生。
        applyChapterScenes: function (scenes) {
            try {
                if (!Array.isArray(scenes) || !scenes.length) return;
                const entries = scenes.filter(s => s && s.cacheId && s.prompt)
                    .map((s, i) => ({ cacheId: s.cacheId, prompt: s.prompt, after: s.after || '', idx: (typeof s.idx === 'number' ? s.idx : i) }));
                if (!entries.length) return;
                const n = this._spliceInto(entries);
                if (n) console.log('[VN_SceneInsert] 回放章節：splice ' + n + ' 張存檔插圖');
            } catch (e) { console.warn('[VN_SceneInsert] applyChapterScenes 失敗:', (e && e.message) || e); }
        }
        // (已移除 applyPending / _pending：舊「靠 msgId 精確比對」路——窗口號每輪撞 key、回放會誤撈最新圖。
        //  現由 _latest+applyLatestFresh(最新這輪) 與 ch.scenes+applyChapterScenes(回放) 兩條不靠 ID 的路取代。)
    };

    win.VN_SceneInsert = VN_SceneInsert;
})(window);
