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

        // 在 script 行裡找錨點：正規化 substring；找不到再用前 6 字找一次。回傳行索引或 -1
        _findAnchor: function (script, after) {
            const a = this._norm(after);
            if (!a) return -1;
            for (let i = 0; i < script.length; i++) {
                if (this._norm(script[i]).indexOf(a) >= 0) return i;
            }
            if (a.length >= 6) {
                const c = a.slice(0, 6);
                for (let i = 0; i < script.length; i++) {
                    if (this._norm(script[i]).indexOf(c) >= 0) return i;
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
                    // 立刻預熱生圖（in-flight dedup，等播到時秒出）
                    try { if (win.VN_Core && win.VN_Core._safeFetchScene) win.VN_Core._safeFetchScene(cacheId, prompt); } catch (e) {}
                });
                if (!entries.length) return;

                if (!this._pending[msgId]) this._order.push(msgId);
                this._pending[msgId] = { chatId: chatId, entries: entries };
                while (this._order.length > 6) { const old = this._order.shift(); if (old !== msgId) delete this._pending[old]; }
                console.log('[VN_SceneInsert] msg#' + msgId + ' 排隊 ' + entries.length + ' 張(已預熱)，等 VN 載入該則即插');

                // scenes 比 loadScript 晚到、且 VN 已停在這則 → 立刻插
                const VN = win.VN_Core;
                if (VN && Array.isArray(VN.script) && VN.script.length &&
                    VN._currentMessageId != null && String(VN._currentMessageId) === msgId) {
                    this.applyPending(msgId);
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
                if (!pend || !pend.entries || !pend.entries.length) return;
                if (localStorage.getItem('vn_scene_enabled') === '0') return;

                const VN = win.VN_Core;
                if (!VN || !Array.isArray(VN.script) || !VN.script.length) return;
                // 只插「VN 現在正停的那則」
                if (VN._currentMessageId != null && String(VN._currentMessageId) !== msgId) return;

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
                    try { VN._safeFetchScene(e.cacheId, e.prompt); } catch (_) {}
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
