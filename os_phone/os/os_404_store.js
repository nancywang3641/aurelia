// ----------------------------------------------------------------
// [檔案] os_404_store.js (V1.0)
// 路徑：os_phone/os/os_404_store.js
// 職責：柴郡 404 號房黑市商店
//   - 成就估值：批次呼叫 Cheshire API 評估待兌換成就，返回 shards
//   - 商店目錄：5 件永久道具，各含關鍵字供世界書觸發
//   - 全域狀態：shards 餘額、已購/啟用狀態均存 localStorage（不綁 chatId）
//
// 接口：
//   OS_404_STORE.launch()               — 由 VoidTerminal 呼叫，開啟 404 面板
//   OS_404_STORE.evaluateAchievements() — 批次評估待兌換成就
//   OS_404_STORE.getShards()            — 返回當前碎片餘額
//   OS_404_STORE.getActiveKeywords()    — 返回已啟用道具的關鍵字陣列
//   OS_404_STORE.buyItem(id)            — 購買道具
//   OS_404_STORE.toggleItem(id)         — 切換道具啟用狀態
// ----------------------------------------------------------------
(function() {
    console.log('[OS_404_STORE] 柴郡黑市 V1.0 載入中...');
    const win = window.parent || window;

    // ================================================================
    // 常數：商店目錄
    // ================================================================
    const SHOP_CATALOG = [
        {
            id:      'observer_mode',
            name:    '觀測者模組',
            price:   500,
            keyword: '【觀測者模式啟動】',
            desc:    '取得完全隱身資格。進入任何場景時，NPC 無法察覺你的存在，可偷觀獨處時的秘密行動與內心獨白。',
            icon:    'fa-eye'
        },
        {
            id:      'cheshire_prank',
            name:    '柴郡的惡作劇',
            price:   200,
            keyword: '【柴郡干擾訊號已注入】',
            desc:    '下次劇情中，柴郡會悄悄植入一段搞亂官方劇情的異常代碼，強制引發一場隱藏支線。效果一次性。',
            icon:    'fa-face-grin-tongue-wink'
        },
        {
            id:      'logic_bomb',
            name:    '邏輯炸彈',
            price:   350,
            keyword: '【邏輯炸彈預埋中】',
            desc:    '在劇情中預埋一顆邏輯炸彈。當敘事出現矛盾或 NPC 撒謊時，炸彈引爆，強制揭露隱藏真相。',
            icon:    'fa-bomb'
        },
        {
            id:      'black_pass',
            name:    '黑市偽造證件',
            price:   150,
            keyword: '【黑市通行證持有者】',
            desc:    '偽造一份足以通過絕大多數門檻的身份文件，可無視等級與會員卡條件強制進入受限區域。',
            icon:    'fa-id-card'
        },
        {
            id:      'abyss_extractor',
            name:    '深淵提取器',
            price:   300,
            keyword: '【深淵頻率共鳴中】',
            desc:    '與底層異常代碼共鳴，使劇情朝向更黑暗、更混沌的走向傾斜。適合想體驗 Bad End 路線的玩家。',
            icon:    'fa-hurricane'
        }
    ];

    // ================================================================
    // localStorage 鍵名（全域，不綁 chatId）
    // ================================================================
    const KEY_SHARDS  = 'cheshire_shards';   // Number
    const KEY_ITEMS   = 'cheshire_items';    // JSON: { [id]: { owned, active } }

    // ================================================================
    // Lorebook 備份常數（換裝置時可從世界書恢復數據）
    // ================================================================
    const LORE_COMMENT = '[Cheshire_Shards]';
    const LORE_KEYS    = ['碎片', 'shards', 'cheshire', '柴郡', '黑市'];

    // ================================================================
    // 工具：讀寫 shards
    // ================================================================
    function getShards() {
        return parseInt(localStorage.getItem(KEY_SHARDS) || '0', 10);
    }
    // 寫進去才算數：空間滿了 lsSet 自己跳「碎片餘額沒存下來」，回 false 讓呼叫端別報成功
    //   （以前裸 setItem，一丟錯整支中斷：買了東西卻沒記到）
    function setShards(n) {
        return win.AUI.lsSet(KEY_SHARDS, String(Math.max(0, Math.floor(n))), '碎片餘額');
    }
    function addShards(n) {
        if (!setShards(getShards() + n)) return false;
        console.log(`[OS_404_STORE] 💎 +${n} shards → 餘額 ${getShards()}`);
        scheduleSyncToLorebook();
        return true;
    }
    function spendShards(n) {
        const cur = getShards();
        if (cur < n) return false;
        if (!setShards(cur - n)) return false;
        console.log(`[OS_404_STORE] 💸 -${n} shards → 餘額 ${getShards()}`);
        scheduleSyncToLorebook();
        return true;
    }

    // ================================================================
    // 工具：讀寫道具狀態
    // ================================================================
    function getItemsState() {
        try { return JSON.parse(localStorage.getItem(KEY_ITEMS) || '{}'); }
        catch(e) { return {}; }
    }
    function saveItemsState(state) {
        return win.AUI.lsSet(KEY_ITEMS, JSON.stringify(state), '黑市道具');
    }
    function getItemState(id) {
        const s = getItemsState();
        return s[id] || { owned: false, active: false };
    }

    // ================================================================
    // 核心：購買道具
    // ================================================================
    function buyItem(id) {
        const item = SHOP_CATALOG.find(i => i.id === id);
        if (!item) return { ok: false, msg: '未知道具' };

        const state = getItemsState();
        if (state[id] && state[id].owned) {
            return { ok: false, msg: '已購買' };
        }
        const before = getShards();
        if (before < item.price) {
            return { ok: false, msg: `碎片不足（需要 ${item.price}，現有 ${before}）` };
        }
        if (!spendShards(item.price)) return { ok: false, msg: '碎片沒扣成，這次沒買' };

        state[id] = { owned: true, active: false };
        if (!saveItemsState(state)) {
            setShards(before);   // 道具沒記上：碎片退回去，不能扣了錢卻沒東西
            return { ok: false, msg: '道具沒記上，碎片已退回' };
        }
        scheduleSyncToLorebook();
        console.log(`[OS_404_STORE] ✅ 購買: ${item.name}`);
        return { ok: true };
    }

    // ================================================================
    // 核心：切換道具啟用狀態
    // ================================================================
    function toggleItem(id) {
        const item = SHOP_CATALOG.find(i => i.id === id);
        if (!item) return { ok: false, msg: '未知道具' };

        const state = getItemsState();
        if (!state[id] || !state[id].owned) {
            return { ok: false, msg: '尚未購買' };
        }

        state[id].active = !state[id].active;
        if (!saveItemsState(state)) return { ok: false, msg: '沒存下來' };
        scheduleSyncToLorebook();
        const status = state[id].active ? '啟用' : '停用';
        console.log(`[OS_404_STORE] 🔄 ${item.name} → ${status}`);
        return { ok: true, active: state[id].active };
    }

    // ================================================================
    // Lorebook 備份：sync 與 recover
    // ================================================================
    let _syncTimer = null;
    function scheduleSyncToLorebook() {
        clearTimeout(_syncTimer);
        _syncTimer = setTimeout(syncToLorebook, 1200);
    }

    async function syncToLorebook() {
        if (!win.TavernHelper) return;
        const bookName = win.TavernHelper.getCurrentCharPrimaryLorebook();
        if (!bookName) return;

        const shards     = getShards();
        const itemsState = getItemsState();
        const ownedItems  = SHOP_CATALOG.filter(i => itemsState[i.id]?.owned);
        const activeItems = ownedItems.filter(i => itemsState[i.id]?.active);

        const content =
`[柴郡黑市 - 數位碎片帳戶]
持有碎片：${shards} 
已購道具：${ownedItems.length ? ownedItems.map(i => i.name).join('、') : '無'}
啟用中道具：${activeItems.length ? activeItems.map(i => `${i.name}（${i.keyword}）`).join('、') : '無'}
最後更新：${new Date().toLocaleString()}
---BACKUP_JSON---
${JSON.stringify({ shards, items: itemsState })}`;

        try {
            const entries = await win.TavernHelper.getLorebookEntries(bookName);
            const exist   = entries.find(e => e.comment === LORE_COMMENT);
            const entryData = {
                comment:  LORE_COMMENT,
                keys:     LORE_KEYS,
                content,
                constant: true,
                enabled:  true,
                position: 'before_char_defs',
                order:    91
            };
            if (exist) {
                await win.TavernHelper.updateLorebookEntriesWith(bookName, list =>
                    list.map(e => e.comment === LORE_COMMENT ? { ...e, ...entryData } : e));
            } else {
                await win.TavernHelper.createLorebookEntries(bookName, [entryData]);
            }
            console.log(`[OS_404_STORE] 📚 Lorebook 備份完成（${shards} 碎片）`);
        } catch(e) { console.error('[OS_404_STORE] Lorebook sync 失敗:', e); }
    }

    async function loadFromLorebook() {
        if (!win.TavernHelper) return false;
        try {
            const bookName = win.TavernHelper.getCurrentCharPrimaryLorebook();
            if (!bookName) return false;
            const entries = await win.TavernHelper.getLorebookEntries(bookName);
            const entry   = entries.find(e => e.comment === LORE_COMMENT);
            if (!entry || !entry.content) return false;

            const jsonMatch = entry.content.match(/---BACKUP_JSON---\s*\n([\s\S]*)/);
            if (!jsonMatch) return false;

            const backup = JSON.parse(jsonMatch[1].trim());
            if (typeof backup.shards === 'number' && !setShards(backup.shards)) return false;
            if (backup.items && typeof backup.items === 'object' && !saveItemsState(backup.items)) return false;

            console.log(`[OS_404_STORE] 🔄 從 Lorebook 恢復：${backup.shards} 碎片`);
            return true;
        } catch(e) {
            console.error('[OS_404_STORE] Lorebook 恢復失敗:', e);
            return false;
        }
    }

    // ================================================================
    // 核心：返回已啟用道具的關鍵字陣列（供 VN 觸發世界書）
    // ================================================================
    function getActiveKeywords() {
        const state = getItemsState();
        return SHOP_CATALOG
            .filter(item => state[item.id] && state[item.id].active)
            .map(item => item.keyword);
    }

    // ================================================================
    // 核心：批次評估待兌換成就（呼叫 Cheshire API）
    // 分工：柴郡只收「異常系」成就(emotion 歸屬=cheshire)；其餘歸白兔交易所(os_pt 換 PT)。
    // list 可指定要兌換哪幾個(收藏冊單票領取用)；不給=撈全部異常系 pending。
    // ================================================================
    function _cheshirePending() {
        const vp = window.VoidPanels || win.VoidPanels;
        const all = win.OS_ACHIEVEMENT ? win.OS_ACHIEVEMENT.getPending() : [];
        if (!vp || !vp.emotionOwner) return all;   // 分流表沒載到→照舊全收，別把兌換卡死
        return all.filter(a => vp.emotionOwner(a.emotion) === 'cheshire');
    }
    async function evaluateAchievements(list) {
        const pending = (Array.isArray(list) && list.length) ? list : _cheshirePending();
        if (!pending.length) return { ok: false, msg: '目前沒有柴郡要收的成就' };

        if (!win.OS_API) return { ok: false, msg: 'API 尚未初始化' };

        // 組裝 Cheshire 口吻的評估提示詞
        const achList = pending.map((a, i) =>
            `${i + 1}. 成就名稱：「${a.name}」\n   描述：${a.desc || '（無描述）'}`
        ).join('\n');

        const systemPrompt = `你是柴郡（Cheshire），一個住在 404 號房的異常代碼體，懶散、傲慢，但對奇怪的事情充滿興趣。
你的工作是幫玩家「估值」他們在各種劇情中解鎖的成就，然後換算成「數位碎片（Shards）」作為黑市貨幣。
評分標準：越罕見、越詭異、越高風險的成就，值越高。普通打醬油的成就值 10~30 碎片，高風險或 Bad End 成就值 50~150 碎片，傳說級隱藏成就可達 200 碎片。
請以 JSON 陣列格式回覆，每筆格式如下：
{"name":"成就名稱","shards":整數,"comment":"柴郡的吐槽（一句話）"}
只回傳 JSON 陣列，不要加任何 markdown 或說明文字。`;

        const userPrompt = `以下是待估值的成就清單：\n${achList}\n\n請逐一估值並回傳 JSON 陣列。`;

        try {
            // 同白兔估值：工具型呼叫只送成就清單，不走 buildContext（否則人設+劇情歷史+AVS 全帶上）
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userPrompt },
            ];

            const config = win.OS_SETTINGS ? { ...win.OS_SETTINGS.getConfig(), route: 'cheshire_eval' } : { route: 'cheshire_eval' };

            const raw = await new Promise((res, rej) =>
                win.OS_API.chat(messages, config, null, res, rej, { task: 'store404' })
            );

            // 解析 JSON
            let results = null;
            try {
                const jsonMatch = raw.match(/\[[\s\S]*\]/);
                results = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
            } catch(e) {
                console.error('[OS_404_STORE] JSON 解析失敗:', e, raw);
                return { ok: false, msg: 'API 回傳格式錯誤，柴郡今天心情不好' };
            }

            if (!results || !Array.isArray(results)) {
                return { ok: false, msg: '柴郡沒有回應...' };
            }

            // 對成就跟白兔那份（os_pt.evaluateAchievementsPT）同一套：名字一樣 → 洗掉空白標點再比 → 筆數一樣時照順序對；
            //   每個成就只配一次。以前只照名字 find，模型把同一個成就列兩次就發兩次碎片、標兩次已兌換。
            //   單筆不封頂（白兔那邊有封頂）——碎片給多少是玩法，照提示詞的 10～200 讓柴郡自己估
            const _nk = (s) => String(s || '').replace(/[\s「」『』""''、，。,.!！?？:：]/g, '').toLowerCase();
            const used = new Set(), picks = [];
            results.forEach((r, i) => {
                if (!r) return;
                let a = pending.find(x => !used.has(x) && x.name === r.name)
                    || pending.find(x => !used.has(x) && _nk(x.name) === _nk(r.name));
                if (!a && results.length === pending.length && pending[i] && !used.has(pending[i])) a = pending[i];
                if (!a) return;
                used.add(a);
                picks.push({ a: a, shards: Math.max(0, parseInt(r.shards) || 0), comment: r.comment });
            });
            const totalShards = picks.reduce((s, p) => s + p.shards, 0);
            // 先入帳、成功了才把成就標成已兌換（跟白兔那份同順序）：入帳失敗的話成就留著，下次再估
            if (totalShards > 0 && !addShards(totalShards)) return { ok: false, msg: '碎片沒存下來，成就先留著，下次再找柴郡' };
            for (const p of picks) await win.OS_ACHIEVEMENT.markRedeemed(p.a.id, p.shards, 'shards', p.comment);

            console.log(`[OS_404_STORE] 評估完成，共兌換 ${totalShards} 碎片`);
            return { ok: true, results, totalShards };

        } catch(e) {
            console.error('[OS_404_STORE] evaluateAchievements 失敗:', e);
            return { ok: false, msg: '系統異常：' + (e.message || e) };
        }
    }

    // ================================================================
    // UI：渲染 404 商店面板內容
    // ================================================================
    // 🧩 小機（宿舍的 API 小機，os_xiaoji.js）：第一隻是宿舍門口的箱子，第二隻以後在這裡買。
    //    碎片在宿舍那頁「付碎片帶走」時才扣（取名、選接口之後）；沒裝房間（宿舍）就不出現。
    function _xjRow(shards) {
        const XT = win.XiaojiTrain || window.XiaojiTrain, L = win.OS_XIAOJI_LESSONS || window.OS_XIAOJI_LESSONS;
        if (!XT || !L || !(win.OS_XIAOJI || window.OS_XIAOJI)) return '';
        const can = shards >= L.ADOPT_PRICE;
        return `
<div class="store-item" data-id="xiaoji">
    <div class="store-item-icon"><i class="fa-solid fa-microchip"></i></div>
    <div class="store-item-info">
        <div class="store-item-name">小機</div>
        <div class="store-item-desc">我拼的，沒登記。帶回宿舍養，要學什麼自己帶它去上課。</div>
    </div>
    <div class="store-item-action">
        <button class="store-buy-btn ${can ? '' : 'disabled'}" data-action="xiaoji" ${can ? '' : 'disabled'}><i class="fa-solid fa-gem"></i> ${L.ADOPT_PRICE}</button>
    </div>
</div>`;
    }

    function renderStorePanel(container) {
        if (!container) return;

        const shards   = getShards();

        // 同步更新 header 碎片顯示
        const shardsDisplay = container.closest?.('#store-panel-overlay')?.querySelector('#store-shards-display');
        if (shardsDisplay) shardsDisplay.innerHTML = `<i class="fa-solid fa-gem"></i> ${shards} FRAGMENTS`;
        const itemsState = getItemsState();
        const pendingCount = _cheshirePending().length;   // 黑市只數異常系

        container.innerHTML = `
${ pendingCount > 0 ? `
<div class="store-eval-bar">
    <span><i class="fa-solid fa-clipboard"></i> ${pendingCount} 個異常成就待估值</span>
    <button class="store-eval-btn" id="cheshire-eval-btn">找柴郡估值</button>
</div>` : `
<div class="store-eval-bar empty">
    <span><i class="fa-solid fa-circle-check"></i> 沒有待估值的異常成就</span>
</div>`}

<div class="store-item-list">
${ SHOP_CATALOG.map(item => {
    const s = itemsState[item.id] || { owned: false, active: false };
    const ownedClass  = s.owned  ? 'owned'  : '';
    const activeClass = s.active ? 'active' : '';
    const canAfford   = shards >= item.price;
    return `
<div class="store-item ${ownedClass} ${activeClass}" data-id="${item.id}">
    <div class="store-item-icon"><i class="fa-solid ${item.icon}"></i></div>
    <div class="store-item-info">
        <div class="store-item-name">${item.name}
            ${ s.owned  ? '<span class="store-badge owned-badge">已購買</span>' : '' }
            ${ s.active ? '<span class="store-badge active-badge">啟用中</span>' : '' }
        </div>
        <div class="store-item-desc">${item.desc}</div>
        <div class="store-item-keyword"><i class="fa-solid fa-key"></i> 關鍵字：<code>${item.keyword}</code></div>
    </div>
    <div class="store-item-action">
        ${ !s.owned
            ? `<button class="store-buy-btn ${ canAfford ? '' : 'disabled'}"
                       data-action="buy" data-id="${item.id}"
                       ${ canAfford ? '' : 'disabled'}>
                   <i class="fa-solid fa-gem"></i> ${item.price}
               </button>`
            : `<button class="store-toggle-btn ${ s.active ? 'active' : ''}"
                       data-action="toggle" data-id="${item.id}">
                   ${ s.active ? '停用' : '啟用' }
               </button>`
        }
    </div>
</div>`;
}).join('')}
${ _xjRow(shards) }
</div>

<div class="store-footer">
    <span><i class="fa-solid fa-triangle-exclamation"></i> 購買後永久保留 · 啟用道具關鍵字將傳入劇情提示詞</span>
</div>`;

        // 綁定事件
        container.querySelectorAll('[data-action="xiaoji"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const XT = win.XiaojiTrain || window.XiaojiTrain, CW = win.ChatWindow || window.ChatWindow;
                if (!XT || !CW) return;
                XT.mode = 'adopt';
                if (CW.openDorm) CW.openDorm();
                if (CW.openSubPanel) CW.openSubPanel('xiaoji_box');
            });
        });
        container.querySelectorAll('[data-action="buy"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const res = buyItem(id);
                if (!res.ok) {
                    _showMsg(container, `${res.msg}`);
                } else {
                    _showMsg(container, `購買成功！`);
                    renderStorePanel(container);
                }
            });
        });

        container.querySelectorAll('[data-action="toggle"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const res = toggleItem(id);
                if (res.ok) renderStorePanel(container);
            });
        });

        const evalBtn = container.querySelector('#cheshire-eval-btn');
        if (evalBtn) {
            evalBtn.addEventListener('click', async () => {
                evalBtn.disabled = true;
                evalBtn.textContent = '估值中...';
                const res = await evaluateAchievements();
                if (res.ok) {
                    _showMsg(container, `兌換成功！獲得 ${res.totalShards} 碎片`);
                    renderStorePanel(container);
                    // 觸發柴郡對話
                    const comment = res.results?.[0]?.comment;
                    if (win.VoidTerminal?.cheshireSay) {
                        win.VoidTerminal.cheshireSay(comment || `哼，${res.totalShards} 碎片。別以為我在誇你。`);
                    }
                } else {
                    _showMsg(container, `${res.msg}`);
                    evalBtn.disabled = false;
                    evalBtn.textContent = '找柴郡估值';
                }
            });
        }
    }

    function _showMsg(container, text) {
        let msg = container.querySelector('.store-msg');
        if (!msg) {
            msg = document.createElement('div');
            msg.className = 'store-msg';
            container.prepend(msg);
        }
        msg.textContent = text;
        msg.style.opacity = '1';
        clearTimeout(msg._timer);
        msg._timer = setTimeout(() => { msg.style.opacity = '0'; }, 3000);
    }

    // ================================================================
    // 公開 API
    // ================================================================
    win.OS_404_STORE = {
        launch:               () => { if (win.VoidTerminal?.openStorePanel) win.VoidTerminal.openStorePanel(); },
        evaluateAchievements,
        getShards,
        addShards,
        spendShards,
        getActiveKeywords,
        buyItem,
        toggleItem,
        getCatalog:           () => [...SHOP_CATALOG],
        renderStorePanel
    };

    // 啟動時：若 localStorage 沒有碎片數據，嘗試從 Lorebook 恢復（換裝置情境）
    if (!localStorage.getItem(KEY_SHARDS) && !localStorage.getItem(KEY_ITEMS)) {
        setTimeout(() => loadFromLorebook().then(recovered => {
            if (recovered) console.log('[OS_404_STORE] ✅ Lorebook 恢復成功');
        }).catch(() => {}), 1500);
    }

    console.log('[OS_404_STORE] ✅ 就緒');
})();
