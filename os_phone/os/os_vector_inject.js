// ----------------------------------------------------------------
// [檔案] os_vector_inject.js (V1)
// 路徑：os_phone/os/os_vector_inject.js
// 職責：酒館版「向量記憶召回」注入器。
//       PWA 端的記憶召回寫在 os_api_engine._buildStandaloneContext（已有）；
//       但酒館 VN 走 SillyTavern 原生生成，不經過那段 → 改用 injectPrompts 在每輪生成前塞。
//       做法完全照 os_phone/rpg/blacklist_injector.js：
//         GENERATION_STARTED → search 相關記憶 → injectPrompts({once:true})
//       只在「酒館（非獨立）+ 記憶開啟」時跑；PWA 不碰（避免重複召回）。
// 依賴：window.OS_VECTOR_ENGINE.search/isEnabled、window.TavernHelper.injectPrompts/getChatMessages
//       window.VN_Core._currentStoryId / window.OS_AVS_ADAPTER.getStoryId
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('🧠 [Vector Memory Injector] 載入');
    const win = window.parent || window;

    const INJECT_ID = 'aurelia_vn_memory';
    let _lastUninject = null;
    let _lastRecall = null;   // 給 CTX 面板「記憶召回」行讀：{ text, count }

    function _storyId() {
        return (win.VN_Core && win.VN_Core._currentStoryId)
            || win.OS_AVS_ADAPTER?.getStoryId?.()
            || localStorage.getItem('vn_current_story_id') || '';
    }

    // 召回不開副模型「挑」(省一通)：只把「全部記憶的 tags 關鍵詞索引」注入主模型(不丟完整內文)，
    // 主模型看得到全部記憶的存在與主題→不漏，但 prompt 大幅縮水(原本丟 90 字內文×全部 244 條 → 爆到 1.1 萬 token)。
    const MEM_TAG_MAX = 6;       // 每條最多列幾個 tag
    const MEM_FALLBACK_MAX = 30; // 無 tag 的記憶才退回極短內文，幾字以內

    async function injectMemories() {
        try {
            // 撤上次（避免疊加 / 切 chat 殘留）
            try { _lastUninject?.(); } catch (e) {}
            _lastUninject = null;
            _lastRecall = null;   // 每輪先歸零；成功召回才填回（給 CTX 面板顯示）

            // 正在跑大總結（os_story_tools 的 generateRaw）→ 別把記憶召回摻進總結 prompt
            if (win.__AURELIA_SUMMARIZING) return;

            // 只在酒館跑；PWA 走 buildContext 已有召回
            if (win.OS_API?.isStandalone?.()) return;
            if (!win.TavernHelper?.injectPrompts) return;
            if (win.OS_VECTOR_ENGINE?.isEnabled?.() !== true) return;

            const storyId = _storyId();
            if (!storyId) return;                 // 沒有當前 VN 故事就不注入
            if (!win.OS_DB?.getAllVnMemories) return;

            const all = (await win.OS_DB.getAllVnMemories(storyId)) || [];
            if (!all.length) return;
            all.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));   // 時序穩定(舊→新)

            // 只丟 tags 關鍵詞當索引(不丟完整內文)；主模型看得到全部記憶的主題→不漏存在，prompt 大幅縮水。
            // 無 tag 的記憶才退回極短內文，避免空行。
            const _line = (m) => {
                const tags = (m.tags || []).filter(Boolean);
                if (tags.length) return `・${tags.slice(0, MEM_TAG_MAX).join('、')}`;
                let t = String(m.text || '').replace(/\s+/g, ' ').trim();
                if (t.length > MEM_FALLBACK_MAX) t = t.slice(0, MEM_FALLBACK_MAX) + '…';
                return t ? `・${t}` : '';
            };
            const facts = all.filter(m => m.type !== 'dialogue');
            const voice = all.filter(m => m.type === 'dialogue');
            let block = `[記憶索引｜下列每行是一段「過往已發生記憶」的關鍵詞，提醒你這些事都發生過：寫作時保持連貫、勿與之矛盾，需要細節時依關鍵詞回想]\n`;
            block += facts.map(_line).filter(Boolean).join('\n');
            if (voice.length) {
                block += `\n\n【角色語氣索引｜下列關鍵詞代表各角色的性格與說話風格，延續一致、勿 OOC】\n`;
                block += voice.map(_line).filter(Boolean).join('\n');
            }

            const result = win.TavernHelper.injectPrompts([{
                id: INJECT_ID,
                content: block.trim(),
                position: 'in_chat',
                depth: 1,
                role: 'system'
            }], { once: true });
            _lastUninject = result?.uninject || null;
            _lastRecall = { text: block.trim(), count: all.length };   // 給 CTX 面板「記憶召回」行
            console.log(`🧠 [Vector Memory Injector] 注入記憶 tags 索引 ${all.length} 條（只丟關鍵詞、不丟內文，prompt 大幅縮水）`);
        } catch (e) {
            console.warn('[Vector Memory Injector] 失敗:', e?.message || e);
        }
    }

    // ── 酒館原生生成結束 → 直接 ingest（酒館不走 saveVnChapter，VN_CHAPTER_SAVED 不會發，
    //    所以這裡補上：拿剛生成的 AI 劇情丟給引擎提取記憶）──
    let _lastIngestSig = null;
    let _pendingMemory = null;   // 結合觸發：狀態系統開著時，待 state_runtime 那通副模型一起抽的記憶內容
    async function ingestLatest() {
        try {
            if (win.__AURELIA_SUMMARIZING) return;                     // 大總結生成不是劇情，別記成記憶
            if (win.OS_API?.isStandalone?.()) return;                 // 酒館 only（PWA 走 saveVnChapter→VN_CHAPTER_SAVED）
            if (win.OS_VECTOR_ENGINE?.isEnabled?.() !== true) return;
            if (typeof win.OS_VECTOR_ENGINE?.ingest !== 'function') return;
            const storyId = _storyId();
            if (!storyId) return;
            if (!win.TavernHelper?.getChatMessages) return;

            const last = await win.TavernHelper.getChatMessages(-1);
            if (!last || !last[0]) return;
            const m = last[0];
            if (m.is_user) return;                                     // 只記 AI 回覆
            const id = String(m.message_id ?? m.id ?? '');
            const content = (m.message || m.mes || m.content || '').trim();
            if (!content) return;
            // 只記「VN 劇情」回覆 —— 認 <content> 標籤即可（它裡面就是全文）；
            // 不依賴 [Chapter|/[Story| 等特定 tag（用戶 tag 很多又持續新增，照 tag 走會漏）。
            if (!/<content>[\s\S]*?<\/content>/i.test(content)) return;

            // 去重用「內容簽章」而非只看 id：同則同內容才跳過；重 roll/重生換了內容 → 重新記
            // （ingest 端會先清掉同一則(id)的舊記憶再寫新的 → 自動替換、不殘留舊分支）
            const sig = id + '#' + content.length + '#' + content.slice(0, 40);
            if (sig === _lastIngestSig) return;
            _lastIngestSig = sig;
            const cid = id || ('msg_' + Date.now());
            // 結合觸發：狀態系統開著 → 把該記的內容掛成 pending，交給 state_runtime 那一通副模型一起抽(每回合省一通)；
            //           狀態系統沒開 → 照舊自己抽一通(降級不變)。
            if (win.OS_STATE_RUNTIME?.isEnabled?.()) {
                _pendingMemory = { content, storyId, chapterId: cid };
            } else {
                win.OS_VECTOR_ENGINE.ingest(content, storyId, cid);
            }
        } catch (e) { console.warn('[Vector Memory Injector] ingestLatest 失敗:', e?.message || e); }
    }

    function init() {
        if (!win.eventOn || !win.tavern_events) { setTimeout(init, 1000); return; }
        if (win.tavern_events.GENERATION_STARTED) win.eventOn(win.tavern_events.GENERATION_STARTED, injectMemories);
        if (win.tavern_events.GENERATION_ENDED) win.eventOn(win.tavern_events.GENERATION_ENDED, ingestLatest);
        // 刪訊息 → 自動清掉那一則的記憶（記憶跟著現存劇情走，不用手動管）
        if (win.tavern_events.MESSAGE_DELETED) win.eventOn(win.tavern_events.MESSAGE_DELETED, (mesId) => {
            try {
                if (win.OS_API?.isStandalone?.()) return;
                const id = (mesId !== undefined && mesId !== null) ? String(mesId) : '';
                if (id && win.OS_DB?.deleteVnMemoriesByChapter) win.OS_DB.deleteVnMemoriesByChapter(id, _storyId());
            } catch (e) {}
        });
        if (win.tavern_events.CHAT_CHANGED) win.eventOn(win.tavern_events.CHAT_CHANGED, () => { try { _lastUninject?.(); _lastUninject = null; } catch (e) {} _lastIngestSig = null; _lastRecall = null; });
        console.log('🧠 [Vector Memory Injector] Ready（召回 + 酒館 ingest）');
    }

    win.OS_VECTOR_INJECT = {
        injectMemories, ingestLatest,
        get _lastRecall() { return _lastRecall; },
        // 結合觸發：state_runtime 取走待處理記憶內容(取走即清，避免重複)
        consumePendingMemory() { const p = _pendingMemory; _pendingMemory = null; return p; },
        hasPendingMemory() { return !!_pendingMemory; },
    };
    init();
})();
