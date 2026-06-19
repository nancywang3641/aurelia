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
// ★ 時機（實測修正 2026-06-11）：extractOnce(副模型)常「比 VN loadScript 先跑完」
//   → 派發時 VN.script 還空的。所以改「排隊制」：
//     fromExtract → 把 scenes 排隊(_pending[msgId]) + 立刻預熱生圖；
//     vn_core.loadScript 載入該則時 → 呼叫 applyPending(msgId) 才 splice 進劇本。
//     兩個方向都接：若 scenes 反而比 loadScript 晚到、且 VN 已停在該則 → 立刻插。
//
// 防 desync / 冪等：
//   • 排隊認 msgId；applyPending 只插「VN 現在正停的那則」(_currentMessageId)。
//   • loadScript 每次會重建 this.script → 同一份劇本用「scene-id 是否已存在」做冪等，
//     避免重複插；重載/捲回重播時(新 this.script)會重新插 → 場景不會只出現一次。
//   • _pending 不消費(留著供重播)，只 cap 最近 6 則防累積。
//   • VN 場景顯示關閉(vn_scene_enabled==='0')/劇本未載入 → 跳過。
// ============================================================================
(function (win) {
    'use strict';

    const VN_SceneInsert = {
        _pending: {},  // msgId(str) → { chatId, entries:[{cacheId,prompt,after,idx}] }
        _order: [],    // msgId 進場順序，給 cap 用

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

                if (!this._pending[msgId]) this._order.push(msgId);
                this._pending[msgId] = { chatId: chatId, entries: entries };
                while (this._order.length > 6) { const old = this._order.shift(); if (old !== msgId) delete this._pending[old]; }
                console.log('[VN_SceneInsert] msg#' + msgId + ' 排隊 ' + entries.length + ' 張(已預熱)，等 VN 載入該則即插');

                // scenes 比 loadScript 晚到 → 看 VN 現在停在哪則
                const VN = win.VN_Core;
                const _curMid = (VN && VN._currentMessageId != null) ? String(VN._currentMessageId) : null;
                const _hasScript = !!(VN && Array.isArray(VN.script) && VN.script.length);
                const _vnLen = (VN && Array.isArray(VN.script)) ? VN.script.length : -1;
                if (_hasScript && _curMid === msgId) {
                    // 正常：VN 正停在該則 → 立刻插
                    console.log('[VN_SceneInsert🔎] msg#' + msgId + ' 即時插：VN當前則=' + _curMid + ' script長=' + _vnLen);
                    this.applyPending(msgId);
                } else if (_hasScript && _curMid != null) {
                    // 副模型抽取太慢、VN 已往前走到別則 → 場景會孤兒(loadScript 不會再為舊則跑)。
                    // 改補插到「現在正播的這則」：晚幾秒順流補上、不讓它默默消失（圖同一個 cacheId、已生好）。
                    console.log('[VN_SceneInsert🔎] msg#' + msgId + ' 已過期(VN在#' + _curMid + ' script長=' + _vnLen + ')→補插到當前則');
                    if (!this._pending[_curMid]) this._order.push(_curMid);
                    this._pending[_curMid] = { chatId: chatId, entries: entries };
                    while (this._order.length > 6) { const old = this._order.shift(); if (old !== _curMid && old !== msgId) delete this._pending[old]; }
                    this.applyPending(_curMid);
                } else {
                    // VN 還沒載入任何劇本 → 留佇列，等 loadScript 該則時補插
                    console.log('[VN_SceneInsert🔎] msg#' + msgId + ' 不即插→等 loadScript：VN當前則=' + (_curMid || 'null') + ' script長=' + _vnLen);
                }
            } catch (e) {
                console.warn('[VN_SceneInsert] fromExtract 失敗:', (e && e.message) || e);
            }
        },

        // 由 vn_core.loadScript 尾端呼叫（也被 fromExtract 在 VN 已停在該則時呼叫）
        applyPending: function (msgIdRaw) {
            try {
                if (msgIdRaw == null) return;
                const msgId = String(msgIdRaw);
                const pend = this._pending[msgId];
                if (!pend || !pend.entries || !pend.entries.length) { console.log('[VN_SceneInsert🔎] applyPending msg#' + msgId + ' 跳過：佇列空（已被清/重載）'); return; }
                if (localStorage.getItem('vn_scene_enabled') === '0') { console.log('[VN_SceneInsert🔎] applyPending msg#' + msgId + ' 跳過：場景顯示關(vn_scene_enabled=0)'); return; }

                const VN = win.VN_Core;
                if (!VN || !Array.isArray(VN.script) || !VN.script.length) { console.log('[VN_SceneInsert🔎] applyPending msg#' + msgId + ' 跳過：劇本未載入/空 script長=' + (VN && Array.isArray(VN.script) ? VN.script.length : 'N/A')); return; }
                // 只插「VN 現在正停的那則」
                if (VN._currentMessageId != null && String(VN._currentMessageId) !== msgId) { console.log('[VN_SceneInsert🔎] applyPending msg#' + msgId + ' 跳過：VN當前停在 ' + VN._currentMessageId + ' 非本則'); return; }

                let cursor = (typeof VN.index === 'number') ? VN.index : -1;
                let inserted = 0;

                for (let k = 0; k < pend.entries.length; k++) {
                    const e = pend.entries[k];
                    const idTag = 'scene-id: ' + e.cacheId;
                    if (VN.script.indexOf(idTag) >= 0) continue; // 這份劇本已含 → 冪等跳過

                    // 找錨點(正規化容錯)；找不到 or 已播過 → 平均分散，別全擠末尾
                    const aIdx = e.after ? this._findAnchor(VN.script, e.after) : -1;
                    let pos;
                    if (aIdx >= 0 && aIdx + 1 > cursor) {
                        pos = aIdx + 1; // 錨點行之後
                    } else {
                        const denom = pend.entries.length + 1;       // 2 張 → 1/3、2/3 處
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

                if (inserted) console.log('[VN_SceneInsert] msg#' + msgId + '：splice ' + inserted + ' 張進劇本，往下點即播');
            } catch (e) {
                console.warn('[VN_SceneInsert] applyPending 失敗:', (e && e.message) || e);
            }
        }
    };

    win.VN_SceneInsert = VN_SceneInsert;
})(window);
