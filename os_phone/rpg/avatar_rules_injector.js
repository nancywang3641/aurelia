// ----------------------------------------------------------------
// [檔案] avatar_rules_injector.js (V1)
// 路徑：os_phone/rpg/avatar_rules_injector.js
// 職責：每輪主模型生成前，依「頭像產圖器」選的服務(pollinations / novelai /
//       tavern_sd)，把對應的「頭像提示詞規則書」用 injectPrompts({once:true})
//       注入 system prompt。取代過去手動在世界書開關 3 條規則的做法。
//
// 規則書文字：預設值寫在本檔(DEFAULT_RULES)；使用者可在 手機設定→畫廊→生成服務
//   各 service 子區的 textarea 改寫，按「保存」存進 localStorage['os_image_config'].avatarRules。
//   某服務沒自訂(空字串)→ 自動退回預設。
// 產圖器選擇也讀同一份 os_image_config.service（pollinations / novelai / tavern_sd）。
// 只做酒館版(靠 TavernHelper.injectPrompts)；PWA 走 buildContext 不在此。
// ----------------------------------------------------------------
(function() {
    console.log('🪪 [Avatar Rules Injector] V1 載入');
    const win = window.parent || window;

    const INJECT_ID = 'aurelia_avatar_rules';
    const CFG_KEY   = 'os_image_config';   // os_settings 畫廊圖片設定（service + avatarRules 都存這）
    let _lastUninject = null;

    // ── 3 份規則書「預設值」（= 使用者原本放在世界書的版本）──
    const DEFAULT_RULES = {
        pollinations: `# 🪪 底部状态栏-AVATAR詳細說明篇 - 每輪"必須"輸出

- 位置要求: 必須每次在</status>....</status>內輸出
- 此規則是"pollinations ai" 專用規則書

[頭像]
<avatar>
角色名(AVATAR_ID): 2D, [boy/girl/man/woman], [child/teenager/mature adult/elderly], [male/female],詳細描述髮型,髮色,裝飾,否則會生成大同小異圖...,[CAMERA], [LIGHTING], [BACKGROUND].

* 範例：
AVATAR_ID: 描述...
小明: 2D, boy/mature, child, male, clear face, detailed eyes, messy hair, t-shirt, looking at viewerl, ow angle shot, triangular composition, side lighting, blurred, blurred city lights.

</avatar>

[頭像規範]:
0. 判斷當前場景中，哪些角色是「重要且在場」的。
1. ⚠️ 去重：僅在角色第一次正式介紹時觸發。
2. 必須是「頭像」風格：
   * 不可有任何真人描寫
   * 構圖範圍：確保臉部清晰，不描寫到肩部以下導致生成畫面偏移
   * 視角允許：slight low angle / slight high angle / 3/4 view / Dutch tilt
3. 描述細節：必須包含五官特徵(瞳色/眼型)、髮型髮色、獨特配飾及上衣款式。
4. ⛔ 格式強制：冒號前角色名必須與[角色]名字同步。
5. 🚫 絕對禁止生成：❌環境角色 ❌一次性角色 ❌群體角色`,

        novelai: `# 🪪 底部状态栏-AVATAR詳細說明篇 - 每輪"必須"輸出

- 位置要求: 必須每次在</status>....</status>輸出底部状态栏
- 此規則是"novel ai"  專用規則書

[頭像]
<avatar>
角色名: [1woman/1man], [mature/young], [bust shot], [body type], [skin color], [eye color], [eye shape], [long/mediem/short hair] , [hair style] , [bangs type],  [distinct feature], [1-2個服裝標籤], [表情標籤], [簡單背景標籤]

* 範例：
小明: 1 boy, handsome, bust shot, slim body type, light skin tone,  black eye, round eyes, medium hair, slightly wavy hair, parted bangs, wearing casual winter clothes, neutral expression, simple indoor background
..
</avatar>

[頭像規範]:
0. 判斷當前場景中，哪些角色是「重要且在場」的。
1. ⚠️ 去重：僅在角色第一次正式介紹時觸發。
2. ⛔ 格式強制：冒號前角色名必須與[角色]名字同步。
3. 必須是 NAI 標籤風格 (Danbooru Tags)：
   * 絕對禁止使用自然語言長句，必須用「英文單字 + 逗號」隔開。
   * 開頭必須是 1girl 或 1boy，絕對禁止出現 full body 或腿部、鞋子的描述。
4. 描述細節：必須且僅限包含髮型、髮色、瞳色、一件上衣款式與當下表情。
5. 🚫 絕對禁止生成：❌環境角色 ❌一次性角色 ❌群體角色 (如 2girls, multiple boys)。`,

        tavern_sd: `# 🪪 底部状态栏-AVATAR詳細說明篇 - 每輪"必須"輸出

- 位置要求: 必須每次在</status>....</status>輸出底部状态栏
- 此規則是"ComfyUI"  專用規則書

[頭像]
<avatar>
角色名: [1girl/1boy], [mature/young], [bust shot], [body type], [skin color], [eye color], [eye shape], [long/mediem/short hair] , [hair style] , [bangs type],  [distinct feature], [1-2個UPPER部位服飾標籤], [表情標籤], [簡單背景標籤]

* 範例：
1 boy, handsome, bust shot, slim body type, light skin tone,  black eye, round eyes, medium hair, slightly wavy hair, parted bangs, wearing casual winter clothes, soft smile, simple indoor background
..
</avatar>

[頭像規範]:

##男性重要守則##:
- ComfyUI模型對男性角色吃力，請一定不可以輸出teen/child，會導致幼太化
- 因為大多本地模型素材都是女性化，所以>15歲男性請一定要使用"handsome"來壓制女化

0. 判斷當前場景中，哪些角色是「重要且在場」的。
1. ⚠️ 去重：僅在角色第一次正式介紹時觸發。
2. ⛔ 格式強制：冒號前角色名必須與[角色]名字同步。
3. 必須是 ComfyUI 標籤風格 (Danbooru Tags)：
   * 絕對禁止使用自然語言長句，必須用「英文單字 + 逗號」隔開。
   * 開頭必須是 1girl 或 1boy, 絕對禁止出現 full body 或腿部、鞋子的描述，會失去focus。
4. 描述細節：必須且僅限包含髮型、髮色、瞳色、一件上衣款式與當下表情。
5. 🚫 絕對禁止生成：❌環境角色 ❌一次性角色 ❌群體角色 (如 2girls, multiple boys)。`,
    };

    // ComfyUI 直連與「酒館原生(ComfyUI/SD)」都是 ComfyUI/danbooru tag 後端，共用同一份規則預設
    DEFAULT_RULES.comfyui_direct = DEFAULT_RULES.tavern_sd;

    const SERVICE_LABEL = { pollinations: 'Pollinations', novelai: 'NovelAI', tavern_sd: '酒館接口 (ComfyUI/SD)', comfyui_direct: 'ComfyUI 直連' };
    const SERVICES = ['pollinations', 'novelai', 'tavern_sd', 'comfyui_direct'];

    // os_settings 畫廊圖片設定（service = 選的產圖器；avatarRules = 使用者自訂的 3 份規則）
    function _imgCfg() {
        try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; }
        catch (e) { return {}; }
    }

    function getDefault(service) { return DEFAULT_RULES[service] || ''; }
    // 有效規則：使用者在設定面板自訂(非空)優先，否則退回預設
    function getRule(service) {
        const custom = ((_imgCfg().avatarRules || {})[service] || '').trim();
        return custom || getDefault(service);
    }

    // 目前選的頭像產圖器服務
    function _currentService() {
        return _imgCfg().service || 'pollinations';
    }

    async function injectAvatarRules() {
        try {
            // 撤上次的（避免疊加 / 切 chat 殘留）
            try { _lastUninject?.(); } catch (e) {}
            _lastUninject = null;

            const service = _currentService();
            const hasInject = !!win.TavernHelper?.injectPrompts;
            const rule = (getRule(service) || '').trim();
            console.log(`🪪 [Avatar Rules] 觸發：service=${service}、injectPrompts可用=${hasInject}、規則長度=${rule.length}`);

            if (!hasInject) { console.warn('🪪 [Avatar Rules] ⛔ TavernHelper.injectPrompts 不存在（酒館助手沒啟用？）→ 全跳過'); return; }
            if (!rule) { console.warn(`🪪 [Avatar Rules] ⛔ service="${service}" 查無規則 → 跳過`); return; }

            // 學 commit d043334（修「主模型完全無視記憶/AVS」）：硬約束必須「XML 標籤框 + 命令式語氣」，
            // 記憶/AVS 就是靠這層框才被主模型吃進去。裸注入規則書原文會被當聊天雜訊忽略 → 每輪要人工提醒。
            const content = `<頭像規則 規則="權威指令·每輪必須執行·不得省略或改格式">\n以下是「角色頭像」的強制輸出規範，由系統依當前產圖器自動載入。你每一輪回覆都必須嚴格遵守：在 </status> 區塊內、為「重要且首次正式登場」的角色，依下列格式輸出 <avatar> 標籤，不得省略、不得更改格式。\n${rule}\n</頭像規則>`;

            const result = win.TavernHelper.injectPrompts([{
                id: INJECT_ID,
                content,
                position: 'in_chat',
                depth: 0,
                role: 'system'
            }], { once: true });
            _lastUninject = result?.uninject || null;
            console.log(`🪪 [Avatar Rules] ✅ 已注入 depth0/system（內容長 ${content.length}、可撤=${!!_lastUninject}）`);
        } catch (e) {
            console.warn('[Avatar Rules Injector] inject 失敗:', e?.message || e);
        }
    }

    function init() {
        if (!win.eventOn || !win.tavern_events) {
            setTimeout(init, 1000);
            return;
        }
        if (win.tavern_events.GENERATION_STARTED) {
            win.eventOn(win.tavern_events.GENERATION_STARTED, injectAvatarRules);
        }
        if (win.tavern_events.CHAT_CHANGED) {
            win.eventOn(win.tavern_events.CHAT_CHANGED, () => {
                try { _lastUninject?.(); _lastUninject = null; } catch (e) {}
            });
        }
        console.log('🪪 [Avatar Rules Injector] Ready');
    }

    // 對外：面板讀寫規則書 + 即時重注（雖然下一輪 GENERATION_STARTED 本來就會讀新值）
    win.OS_AVATAR_RULES_INJECTOR = {
        injectAvatarRules,
        reinject: injectAvatarRules,
        getDefault, getRule,
        SERVICE_LABEL, SERVICES,
    };

    init();
})();
