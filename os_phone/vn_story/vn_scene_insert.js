// ============================================================================
// VN_SceneInsert — 副模型場景插圖渲染器（[3/3]）
// ----------------------------------------------------------------------------
// 由 rpg/state_runtime.js 的 extractOnce 呼叫：fromExtract(scenes, {chatId, msgId})。
// scenes = [{ after:"正文短語(錨點)", prompt:"Danbooru tags" }]（最多取 2 張）。
//
// 做法（對齊使用者選擇「VN 劇情畫面，同主模型」）：
//   把每張 scene 當作 <scene>…</scene> block，splice 進「正在播放的 VN 劇本」
//   (VN_Core.script)，插在當前 index 之後／錨點之後 → 玩家往下點就順流跳出
//   全螢幕 CG（重用 vn_core 既有的 <scene> handler + _safeFetchScene + overlay），
//   就是「晚幾秒才出現」的效果。同時預熱生圖，播到時秒出。
//
// 防 desync（對齊先前討論）：
//   • 認 message_id：VN 已離開這則訊息(_currentMessageId !== msgId) → scenes 過時 → 跳過。
//   • 只插在當前 index「之後」的位置 → 不會動到已播過的內容。
//   • 去重：同一 (chatId,msgId,場景序號) 只插一次，extractOnce 重觸發不會疊圖。
//   • VN 場景顯示關閉(vn_scene_enabled==='0') 或劇本未載入 → 跳過。
// ============================================================================
(function (win) {
    'use strict';

    const VN_SceneInsert = {
        // 去重表：key = chatId|msgId|sceneIdx
        _done: {},

        _hash: function (str) {
            let h = 0;
            for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
            return Math.abs(h).toString(36);
        },

        fromExtract: function (scenes, ctx) {
            try {
                if (!Array.isArray(scenes) || !scenes.length) return;
                const VN = win.VN_Core;
                if (!VN || !Array.isArray(VN.script) || !VN.script.length) {
                    console.log('[VN_SceneInsert] VN 劇本未載入，跳過');
                    return;
                }
                if (localStorage.getItem('vn_scene_enabled') === '0') {
                    console.log('[VN_SceneInsert] VN 場景顯示已關閉，跳過');
                    return;
                }

                ctx = ctx || {};
                const msgId  = (ctx.msgId != null) ? String(ctx.msgId) : null;
                const chatId = (ctx.chatId != null) ? String(ctx.chatId) : '';

                // 防 desync：VN 已切到別則訊息 → 這批 scenes 已過時，別插（避免貼到錯訊息）
                const curMid = (VN._currentMessageId != null) ? String(VN._currentMessageId) : null;
                if (msgId != null && curMid != null && curMid !== msgId) {
                    console.log('[VN_SceneInsert] VN 已離開 msg#' + msgId + '(現在 ' + curMid + ')，scenes 過時，跳過');
                    return;
                }

                const list = scenes.slice(0, 2); // 最多 2 張
                let cursor = (typeof VN.index === 'number') ? VN.index : -1;
                let inserted = 0;

                for (let idx = 0; idx < list.length; idx++) {
                    const s = list[idx];
                    if (!s || !s.prompt) continue;

                    // prompt 收成單行（<scene> block 一行一段；避免換行打亂 block 解析）
                    const prompt = String(s.prompt).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
                    if (!prompt) continue;

                    const dedupKey = chatId + '|' + msgId + '|' + idx;
                    if (this._done[dedupKey]) continue;

                    const cacheId = 'ext_' + this._hash(chatId + '_' + msgId + '_' + idx + '_' + prompt);

                    // 找錨點：在 cursor「之後」的行裡找含 after 的行（只插還沒播到的位置）
                    let pos = -1;
                    const after = s.after ? String(s.after).trim() : '';
                    if (after) {
                        for (let i = Math.max(cursor + 1, 0); i < VN.script.length; i++) {
                            if (VN.script[i].indexOf(after) >= 0) { pos = i + 1; break; } // 錨點行「之後」
                        }
                    }
                    // 錨點沒命中／已播過 → 插在目前位置後一格（盡快、但在當前行之後跳出）
                    if (pos < 0) pos = Math.min(cursor + 1, VN.script.length);
                    if (pos < 0) pos = VN.script.length;

                    const block = ['<scene>', 'scene-id: ' + cacheId, prompt, '</scene>'];
                    VN.script.splice(pos, 0, block[0], block[1], block[2], block[3]);
                    // 我們只在 index 之後插 → 不該動到已播位置；保險：若插點 <= index 補正
                    if (pos <= VN.index) VN.index += block.length;
                    cursor = pos + block.length - 1;
                    this._done[dedupKey] = true;
                    inserted++;

                    // 預熱生圖（與現場 [Scene|] 共用 in-flight promise，播到時秒出、不重生）
                    try { VN._safeFetchScene(cacheId, prompt); } catch (e) {}
                    console.log('[VN_SceneInsert] 插入場景 #' + idx + ' @script[' + pos + '] cacheId=' + cacheId);
                }

                if (inserted) {
                    console.log('[VN_SceneInsert] msg#' + msgId + '：live 插入 ' + inserted + ' 張場景，往下點即播');
                }
            } catch (e) {
                console.warn('[VN_SceneInsert] fromExtract 失敗:', (e && e.message) || e);
            }
        }
    };

    win.VN_SceneInsert = VN_SceneInsert;
})(window);
