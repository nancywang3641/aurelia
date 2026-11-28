// ----------------------------------------------------------------
// [檔案] os_avs_rules.js（條件規則引擎）
// 路徑：os_phone/os/os_avs_rules.js
// 職責：1. 根據 AVS 變數狀態，動態注入行為規範。
//       2. 支援一般條件規則 (綁定 worldId / packId)。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const LSKEY = 'avs_condition_rules';   // 保留作 PWA fallback

    // ================================================================
    // 一、資料存取與同步（V1.4：規則 storage 走 adapter）
    //   PWA：adapter 讀 'avs_condition_rules'（原行為）
    //   酒館：adapter 讀 'aurelia_rules_tavern'（跨 chat 共用）
    // ================================================================

    function _loadRules() {
        if (win.OS_AVS_ADAPTER?.loadRules) return win.OS_AVS_ADAPTER.loadRules();
        try { return JSON.parse(localStorage.getItem(LSKEY) || '[]'); } catch(e) { return []; }
    }

    // 回傳有沒有存成功（兩條路失敗時都會自己跳提示）
    function _saveRules(rules) {
        if (win.OS_AVS_ADAPTER?.saveRules) return win.OS_AVS_ADAPTER.saveRules(rules) !== false;
        return win.AUI.lsSet(LSKEY, JSON.stringify(rules), '條件規則');
    }


    function _newId() {
        return 'avsr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    }

    // ================================================================
    // 二、條件求值 (供 API 引擎呼叫)
    // ================================================================

    function _getVal(state, path) {
        const keys = path.split('.');
        let cur = state;
        for (const k of keys) {
            if (cur == null || typeof cur !== 'object') return undefined;
            cur = cur[k];
        }
        return cur;
    }

    function _evalRule(rule, state) {
        const actual = _getVal(state, rule.path);
        if (actual === undefined) return false;

        const expected = rule.value;
        const aNum = parseFloat(actual),  eNum = parseFloat(expected);
        const bothNum = !isNaN(aNum) && !isNaN(eNum);

        switch (rule.op) {
            case '=':  case '==':
                return bothNum ? aNum === eNum : String(actual) === String(expected);
            case '!=':
                return bothNum ? aNum !== eNum : String(actual) !== String(expected);
            case '>':  return bothNum && aNum >  eNum;
            case '<':  return bothNum && aNum <  eNum;
            case '>=': return bothNum && aNum >= eNum;
            case '<=': return bothNum && aNum <= eNum;
            default:   return false;
        }
    }

    // ================================================================
    // 三、公開 API
    // ================================================================

    // 名字比對用：簡繁折成同一種、不分大小寫（狀態裡是「张伟」，正文可能寫「張偉」）
    function _fold(s) {
        let t = String(s == null ? '' : s);
        try { if (win.OS_ZH?.toSimp) t = win.OS_ZH.toSimp(t); } catch (e) {}
        return t.toLowerCase();
    }
    // 規則綁的是哪個角色：path 是「容器.名字.屬性」、而且狀態裡那個容器底下真的有這個名字＝綁人；其他（場域風險、劇情目標…）回 ''
    function _ruleWho(r, state) {
        const seg = String(r.path || '').split('.');
        if (seg.length < 3) return '';
        const box = state && state[seg[0]];
        if (!box || typeof box !== 'object' || Array.isArray(box)) return '';
        const one = box[seg[1]];
        return (one && typeof one === 'object') ? seg[1] : '';
    }

    // opts.sceneText：給了就只送「這段文字裡提到的人」的規則（不綁人的規則照送）；opts.keep：不管在不在場都送的名字。
    //   10-07 起：以前不看誰在場，場上只有主角跟角色甲，每輪照送另外四個角色的四條，還要 AI「嚴格遵循」，
    //   其中一條是角色乙「叫角色丙把人弄走」——等於每輪把不在場的人往劇情裡拉。keep＝角色卡上設成「想靠近」的人（要 AI 帶他出場，得知道走到哪一步）。
    //   沒給 sceneText（舊的叫法）＝照舊全送。
    function getActiveContext(state, activePackIds = null, opts = null) {
        if (!state || typeof state !== 'object') return '';

        // V1.4：worldId 走 adapter（酒館：當前 chatId / PWA：vn_current_world_id）
        const currentWorldId = win.OS_AVS_ADAPTER?.getWorldId?.() || localStorage.getItem('vn_current_world_id') || '';

        const rules = _loadRules().filter(r => {
            if (r.enabled === false) return false;
            // V3：規則綁 packId（酒館用）→ caller 傳入當前 chat 對應的 pack IDs，filter 通過才生效
            if (r.packId && Array.isArray(activePackIds)) {
                return activePackIds.includes(r.packId);
            }
            // 沒 packId → 退回原 worldId filter（PWA / 舊資料）
            if (!r.worldId) return true;
            return r.worldId === currentWorldId;
        });

        let matched = rules
            .filter(r => r.path && r.op && r.content && _evalRule(r, state))
            .sort((a, b) => (a.priority || 50) - (b.priority || 50));
        if (opts && typeof opts.sceneText === 'string') {
            const scene = _fold(opts.sceneText);
            const keep = new Set((opts.keep || []).map(_fold).filter(Boolean));
            matched = matched.filter(r => {
                const who = _fold(_ruleWho(r, state));
                return !who || keep.has(who) || scene.indexOf(who) !== -1;
            });
        }

        if (!matched.length) return '';
        const body = matched
            .map(r => `【${r.name || r.path}】\n${r.content}`)
            .join('\n\n');
        return `<behavior_rules>\n以下行為規範當前生效，請在回應中嚴格遵循，不要在 <content> 中提及規則本身：\n\n${body}\n</behavior_rules>`;
    }

    // 這段聊天／這本故事用得到哪些變數包：綁這段的＋沒綁任何一段的（全域）。getActiveContext 的 activePackIds 就是要這份。
    //   🚨 不傳＝不認包、只剩 worldId 過濾；規則窗口和「想靠近」生的規則 worldId 都是空的 → 別本故事的規則也跟著注入。
    //   PWA 的變數包 chatId＝那本故事的 storyId（見 os_avs_adapter getCurrentChatId），兩端同一套比法。
    async function activePackIds(chatId) {
        if (!win.OS_DB?.getAllVarPacks) return null;
        const cid = (chatId != null) ? String(chatId) : (win.OS_AVS_ADAPTER?.getCurrentChatId?.() || '');
        const all = (await win.OS_DB.getAllVarPacks()) || [];
        return all.filter(p => p && (!p.chatId || p.chatId === cid)).map(p => p.id);
    }

    // only：{ name, path }＝只替這一個人生三條好感規則（角色卡設「想靠近」時用），生好就換掉這個檔案裡他原本那幾條同 path 的
    // extra：接在提示詞最後的另一件事（角色卡「想靠近」順便排過去年表，lobby_memory.js 的 lifeAsk）；onRaw(回覆原文)：那件事自己從回覆裡拿
    async function generateRulesForWorld({ worldId, packId, worldTitle, worldDesc, variables, callApi, only, extra, onRaw }) {
        if (!callApi || (!worldId && !packId) || !variables?.length) return 0;
        try {
            const varList = variables.map(v => `· ${v.name}${v.desc ? '：' + v.desc : (v.defaultValue !== undefined && v.defaultValue !== '' ? '（預設 ' + v.defaultValue + '）' : '')}`).join('\n');
            const onlyLine = only && only.name && only.path
                ? `\n\n這次只替「${only.name}」一個人寫：<plan> 只想他一個人，規則只寫他的好感度三條，變數路徑一律寫 ${only.path}；其他角色、其他變數都不用寫。`
                : '';
            // 🧠 10-07 改：先在 <plan> 裡替每個重要角色想一遍（參考 Ako 預設「讀卡情感推演」問的那幾題，用自己的話寫、不搬條目），再寫規則。
            //   改之前高檔寫的是「曖昧→戀人那種／把主角放第幾位、佔有與否」→ 惡劣的角色好感一高全變成更用力的佔有、
            //   掌控、排他，不然就是對主角百依百順（惡劣之人好感度高只會變成更激烈的惡劣情感）。
            //   🚨 這段別塞範例角色或例句：模型會照那個口氣寫每一個人（舊版 state_schema 的兩個示範角色就是這樣）。
            const prompt = `世界觀：「${worldDesc}」
追蹤的變數：
${varList}

任務：為這些變數設計「條件規則」——當變數到某個門檻，角色跟主角的關係與相處方式跟著改變。這些規則之後會在劇情進行中送給寫正文的 AI，讓它知道這個人現在跟主角走到哪一步。${onlyLine}

【先想再寫】
寫規則之前，先在 <plan></plan> 裡替每個重要角色（主要登場、跟主角有關係線的人，通常 2～6 人；一次性路人不算）各想一遍。依據是你手上的世界書、人物關係、角色設定與目前狀態：
1. 他跟主角之間能走的是哪一種關係？用平常人會說的話講，照設定與目前狀態判斷，不要預設。
2. 他的過去和處境，怎麼影響他看待一個靠近自己的人？
3. 他心裡真正想從別人身上得到什麼？
4. 跟主角走近以後，他會對主角收起哪些原本會做的事？有什麼是他無論如何都不會做的？
5. 他在意一個人的時候怎麼表現，或怎麼藏住？
每人幾句就好。<plan> 裡不要出現 | 符號。

【好感度規則（只要追蹤的變數裡有「好感度」就一定要做）】
好感度通常在「角色狀態」這類 object 容器裡、每個角色一份。path 用點記法：容器名.角色名.好感度；容器名和角色名照目前狀態裡的寫法一字不差。
- 每個重要角色「正好 3 條」，沿好感度由低到高分三檔；每條先點明這一檔是什麼關係階段，再寫這個階段他怎麼對待主角：
   · 低檔（例 <=30）：他對一般外人的樣子，照他的本性。
   · 中檔（例 50～70）：沿第 1 題那條關係往前走一步。
   · 高檔（最後一條，例 >=85）：那條關係走到深處。
- 好感度量的是他跟主角走得多近，不是情緒有多強。他的本性、他對其他人的樣子，不會因為好感高而改變；高檔要寫的是第 4、5 題的答案：他對主角收起了什麼、讓主角看見了什麼、怎麼表現或藏住在意。把原本的態度加大力度不算走近；走近之後他還是他自己，有自己的判斷和底線，也會跟主角意見不合。
- 主角MC／{{user}} 本人不生規則（其好感度為 null）。

【其他變數（選配）】
其他有意義的數值或狀態，可沿高低各給 2～4 條漸進規則：同一變數由淺入深、彼此不矛盾、貼著世界觀最自然的走向。

【行為說明寫法】要能直接演出來：先寫關係定位，再寫神態、語氣、肢體分寸、對待主角的方式；別只丟形容詞。

【輸出格式】先輸出 <plan>…</plan>，接著每行一條規則，嚴格 5 欄、以 | 分隔；規則行以外不要任何文字（不要標題、不要說明）：
名稱 | 變數路徑 | 運算子 | 比較值 | 行為說明
- 變數路徑：一般變數照原樣填；object 容器內屬性用點記法（容器名.角色名.屬性）。運算子只能用 >= <= > < = !=
- 名稱與行為說明都用繁體中文純文字，禁止任何 Markdown 或裝飾符號
- 行為說明約 40～90 字、單行、不可換行、其中不可出現 | 符號
- 每個重要角色的好感度正好 3 條；其他變數各 2～4 條` + (extra ? '\n\n════════\n\n' + extra : '');

            const raw = await callApi('general_assistant', prompt) || '';
            if (onRaw) { try { await onRaw(raw); } catch (e) { console.warn('[AVS Rules] 另外那件事沒收到', e); } }
            const newRules = [];
            // 先拿掉 <plan> 那段思考：它只是寫規則前的草稿，不存；extra 那件事的兩塊（年表）也拿掉，那裡的 | 不是規則
            String(raw).replace(/<plan>[\s\S]*?<\/plan>/gi, '').replace(/<life_plan>[\s\S]*?(?:<\/life_plan>|$)/gi, '').replace(/<past>[\s\S]*?(?:<\/past>|$)/gi, '').split('\n').forEach(line => {
                const parts = line.split('|').map(s => s.trim());
                if (parts.length < 5) return;
                const [name, path, op, rawVal, content] = parts;
                if (!path || !op || !content) return;
                if (!/^(>=|<=|>|<|==?|!=)$/.test(op)) return;   // 模型偶爾回述「名稱 | 變數路徑 | 運算子…」表頭，那行不是規則
                const n = parseFloat(rawVal);
                newRules.push({
                    id:      _newId(),
                    worldId: worldId || '',
                    packId:  packId || '',   // 綁變數包（規則窗口按 packId 過濾顯示）
                    name:    _stripMd(name || path),
                    enabled: true,
                    path:    _stripMd(path).trim(),
                    op:      op.trim(),
                    value:   isNaN(n) ? _stripMd(rawVal) : n,
                    // 開頭那個關係階段有時會被包成 [臭味相投]／【…】，規則窗口裡就看到括號：拆成「階段。說明」
                    content: _stripMd(content).replace(/^[\[【]([^\]】]{1,16})[\]】]\s*/, '$1。'),
                    priority: 50
                });
            });

            // 只替一個人生：別人的、別的變數的一律不收（模型偶爾順手多寫），path 統一成指定那條（簡繁寫法不同也算他的）
            if (only && only.path) {
                const want = _fold(only.path);
                const mine = newRules.filter(r => _fold(r.path) === want);
                mine.forEach(r => { r.path = only.path; });
                newRules.splice(0, newRules.length, ...mine);
            }

            if (newRules.length > 0) {
                let existing = _loadRules();
                if (only && only.path) {
                    const want = _fold(only.path);
                    existing = existing.filter(r => !((r.packId || '') === (packId || '') && (r.worldId || '') === (worldId || '') && _fold(r.path) === want));
                }
                if (!_saveRules([...existing, ...newRules])) return 0;   // 沒存下來就不報「生好 N 條」（存檔那邊已經跳過提示）
                console.log(`[AVS Rules] 自動生成 ${newRules.length} 條規則（世界：${worldTitle}）`);
            }
            return newRules.length;
        } catch(e) {
            console.warn('[AVS Rules] 自動生成規則失敗:', e);
            return 0;
        }
    }

    function _stripMd(s) {
        return String(s)
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g,     '$1')
            .replace(/`([^`]+)`/g,     '$1')
            .replace(/^#+\s*/gm,       '')
            .replace(/^[*\-]\s+/gm,    '')
            .replace(/^\d+\.\s+/gm,    '')
            .replace(/[「」『』]/g,    '')
            .trim();
    }


    // ================================================================
    // 六、掛載
    // ================================================================

    // 對外 CRUD（給其他 UI 用，例如酒館 STATE tab 的 Rules 子 tab）
    function addRule(rule) {
        const rules = _loadRules();
        const r = {
            id: rule.id || _newId(),
            name: rule.name || rule.path || '未命名規則',
            enabled: rule.enabled !== false,
            path: rule.path || '',
            op: rule.op || '>=',
            value: rule.value,
            content: rule.content || '',
            worldId: rule.worldId || '',
            packId: rule.packId || '',   // V3：規則綁變數包（酒館用，PWA 規則 packId 留空）
            priority: rule.priority ?? 50,
            folder: rule.folder || ''
        };
        rules.push(r);
        if (!_saveRules(rules)) return null;   // 沒存下來：呼叫端拿 null 就別收掉表單
        return r;
    }
    function updateRule(id, patch) {
        const rules = _loadRules();
        const idx = rules.findIndex(r => r.id === id);
        if (idx < 0) return false;
        rules[idx] = { ...rules[idx], ...patch };
        return _saveRules(rules);
    }
    function deleteRule(id) {
        const rules = _loadRules().filter(r => r.id !== id);
        return _saveRules(rules);
    }
    function toggleRule(id) {
        const rules = _loadRules();
        const r = rules.find(x => x.id === id);
        if (!r) return false;
        r.enabled = r.enabled === false ? true : false;
        _saveRules(rules);
        return r.enabled;
    }

    // ── 角色卡「主角對他：想靠近」：替這一個人生三條好感規則 ─────────────
    // 回 { pack, path, existing }；這個故事沒有放角色的狀態欄位、或他的狀態裡沒有好感度 → null
    async function affinityTarget(name) {
        name = String(name || '').trim();
        if (!name || !win.OS_DB?.getAllVarPacks) return null;
        let st = {};
        try { st = win.OS_AVS_ADAPTER?.readState?.() || win._AVS_ENGINE?.read?.() || {}; } catch (e) {}
        const boxName = Object.keys(st).find(k => /^角色[狀状]態$|^角色状态$/.test(k) && st[k] && typeof st[k] === 'object' && st[k][name] && typeof st[k][name] === 'object');
        if (!boxName || !Object.prototype.hasOwnProperty.call(st[boxName][name], '好感度')) return null;
        const chatId = win.OS_AVS_ADAPTER?.getCurrentChatId?.() || '';
        const packs = ((await win.OS_DB.getAllVarPacks()) || [])
            .filter(p => p && (!p.chatId || p.chatId === chatId) && (p.variables || []).some(v => v && _fold(v.name) === _fold(boxName)))
            .sort((a, b) => ((b.chatId === chatId) - (a.chatId === chatId)) || String(b.id).localeCompare(String(a.id)));   // 綁這個聊天的優先、再來最新建的
        const pack = packs[0];
        if (!pack) return null;
        const path = boxName + '.' + name + '.好感度';
        const want = _fold(path);
        const existing = _loadRules().filter(r => r.packId === pack.id && _fold(r.path) === want).length;
        return { pack, path, existing };
    }
    // opts：{ extra, onRaw }＝同一通順便做的另一件事（見 generateRulesForWorld）
    async function generateAffinityFor(name, target, opts) {
        const t = target || await affinityTarget(name);
        if (!t || !win.OS_API_ENGINE?.generateText) return 0;
        return generateRulesForWorld({
            packId: t.pack.id, worldId: '', worldTitle: t.pack.name || '', worldDesc: t.pack.notes || t.pack.name || '',
            variables: t.pack.variables, only: { name: String(name).trim(), path: t.path },
            extra: opts && opts.extra, onRaw: opts && opts.onRaw,
            callApi: (k, p) => win.OS_API_ENGINE.generateText(k, p, { task: 'avs_design' })   // 跟規則窗口那顆同一條路（主模型）
        });
    }

    win.OS_AVS_RULES = {
        getActiveContext, activePackIds, generateRulesForWorld, 
        affinityTarget, generateAffinityFor,
        // CRUD（V1.4 加入，給外部 UI 用）
        loadRules: _loadRules,
        saveRules: _saveRules,
        addRule, updateRule, deleteRule, toggleRule,
        newId: _newId
    };
    console.log('[AVS Rules] ✅ 條件規則引擎就緒');
})();