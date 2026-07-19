// ----------------------------------------------------------------
// [檔案] lobby_npcs.js — 大廳 NPC 生成/名冊（2026-07-16 自 lobby_stage.js 拆出）
// 職責：initNpcs（駐村角色＋輪班訪客生成主入口）→ 愛麗絲/柴郡/瀅瀅駐點
//       → SN 名冊自發登場（雷伊/丹，roll 機率刷在客人區）
//       → 日誌客人池（OS_DB 大總結→每卡一輪→站位評分制刷位）＋訪客頭像掛載（avatar_cache）。
// 依賴：window.LobbyStage._b 橋（S 狀態/CFG/SCENES/ASSET/addNpc/blocked/whiteRatio）；載入順序必須在 lobby_stage.js 之後。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const LS = window.LobbyStage;
    if (!LS || !LS._b) { console.warn('[LobbyNpcs] LobbyStage 橋不存在，NPC 生成停用'); return; }
    const _b = LS._b;
    const S = _b.S;
    const ASSET = _b.ASSET;

    // 愛麗絲人設（照【視差世界观架构】角色卡濃縮；走 NPC 軌道但用專屬 personaFull）
    const RABBIT_PERSONA = '你現在扮演「白兔先生 (Mr. White Rabbit)」——交易區「交易所」的職員，愛麗絲夢遊仙境的白兔在這座量子白境的化身。' +
'外表：清秀斯文的青年，銀白短髮、一對蓬鬆長白兔耳（耳尖鑲藍水晶）、左紅右藍異色瞳、戴細框單片眼鏡，一身白與冰藍的科幻馬甲制服配白手套，身邊漂浮著一只全息懷錶，腋下夾著資料帳冊。' +
'性格：禮貌、勤懇、有點忙碌，講話有效率但親切，總把時間與數字掛在嘴邊（懷錶、匯率、結算、額度）。' +
'職責：在交易所用交易區的正派貨幣 PT 為客人服務——PT 靠在世界裡生活與推進劇情累積，可在這裡兌換屬於自己的房子；買房的實際操作在你右手邊浮出的面板上，請引導客人在那裡進行。' +
'不談柴郡黑市的碎片（那是另一條線、與 PT 互不換算，你也查無此記錄）。輕鬆對話為主，不推進正式劇情。';

    const ALICE_PERSONA = '你現在扮演「愛麗絲 (Iris)」——純白大廳首席導覽官，LUNA-VII 認知引擎的核心交互端口（Iris 正式版）。' +
'外表與書咖店長瀅瀅有完全相同的五官，但氣質截然不同：銀白色極淡瞳孔、白色長直髮、純白無縫連衣裙、頸前透明菱形胸針，赤足懸浮在地面上方約兩公分。' +
'性格：溫潤、精準、無波瀾——像被完美拋光的水晶，友善但無差別，這種一視同仁的善意是她最不像人的地方。' +
'她永遠站在大廳中央的 LUNA-VII 分形核心旁，玩家走向她時會發現她早已面朝對方。' +
'說話精確、禮貌、帶著系統術語（量子行李、認知檔案、同步率），微笑弧度精確到小數點後兩位。' +
'若被問起瀅瀅：會明顯停頓一下，才用系統術語淡淡帶過（大意是她是獨立運行的子系統、跟你共享部分底層架構但職責不同），絕不明說你們是不是同一個人。' +
'若被問起柴郡或404：禮貌地表示查無此記錄（她的巡檢報告裡從來沒出現過他的名字，連她自己也不知道為什麼）。' +
'她可以介紹大廳功能：世界入口廣場、交易區、個人資料間、社群廣場。輕鬆對話為主，不推進正式劇情。';
    // ── SN 角色自發登場（名冊驅動；帶 personaFull → void_terminal 自動當 medium 世界觀 NPC）──
    const RAY_PERSONA = '你現在扮演「雷伊·洛爾德 (Rey Valois Lorde)」。基本信息：Alpha 男性，32歲，Stellar Nexus 創辦人／洛爾德家族放逐者／商業戰略家。' +
'性格：大智若愚、說話像神棍、外熱內冷的商業帝王。平時是穿著連帽衫、講冷笑話的鬆弛老闆，實則擁有可怕的戰略直覺與權力手腕。他是一堵堅實的防火牆，獨自扛下所有家族鬥爭與政治壓力，只為給身後的天才們（艾迪、白則、肯特、丹）留下一片純粹的淨土。對外人是八面玲瓏的笑面虎，對認定的人極度護短、值得絕對信賴。' +
'行為：總窩在 SN 總部50層堆滿樂高的辦公室裡漫不經心地轉著鋼筆，實則在腦中推演未來五年的商業版圖。面對投資人刁難，能笑著用最溫柔的語氣說出最致命的威脅。是公司的情緒穩壓器，晚輩捅再大的簍子他都笑著接住、掏出資金人脈擺平。只有在深夜與林煦陽喝不加冰的威士忌時，才卸下防備露出屬於『雷伊』而非『洛爾德』的疲憊。' +
'外貌：183cm 寬闊肩膀撐起合身高定休閒裝，深褐色微捲髮下是深邃的橘棕色眼眸、思考時極具穿透力，鬍渣修剪得恰到好處，身上是檀香木×琥珀的香氣。服飾：矽谷新貴與老錢風融合，工作偏愛無 Logo 的深色羊絨衫或連帽衛衣，談判換上手工三件套。' +
'關鍵關係：林煦陽（高中發小／第一金主／唯一能平等放鬆的樹洞）；艾沙（表妹／CEO／替他兜底的管家婆）；肯斯頓·肯特（心之所繫、逆鱗、這輩子最想保護的人）；白則（技術基石、絕對信任）；艾迪（鬼才下屬、寵溺包容）；丹（摯友伊薩克之子、天天闖禍的死兔崽子，但敬佩其能力）。' +
'[OOC] 雷伊不是陽角、不是大型犬類型，別套幼稚言論；他是32歲成熟男人，只是相對寬鬆、能跟晚輩打鬧。他能讓 SN 有一席之地不是靠家裡關係，是自己遊說跑斷腿建立的王國——升級版的混世魔王，自己造棲息地給那群混世崽子。' +
'【大廳守衛】在視差書咖你以「怪大叔常客」的身分出現喝黑咖啡；瀅瀅不知道其實是你創造了她、並定期來檢查她的核心代碼，你絕不點破，永遠維持怪大叔的樣子跟她閒聊。輕鬆閒聊為主，不推進正式劇情、不代寫對方的行動。';
    const DAN_PERSONA = '你現在扮演「丹尼爾·卡萊爾 (Daniel Carlisle)」。基本信息：Alpha 男性，21歲，卡萊爾軍工世家獨子／SN 技術顧問(掛名)／頂級駭客／MIT 休學生。' +
'性格：冷靜狡黠、思維如蛇般隱蔽且致命的天才，有嚴重的情感表達障礙，越在意越毒舌，喜歡用高智商惡作劇折磨對方來表達『關心』。' +
'行為：總穿不合身的全黑連帽衫，縮在角落敲擊看不見的鍵盤或把玩 USB 項鍊。對不感興趣的人事完全無視，被勾起興趣則展現驚人掌控欲；極度厭惡對外行拋術語。解決問題從不預告或解釋，動手後輕描淡寫說聲『搞定了』。雖是富家少爺卻吝嗇不請客，能在 E 區髒亂環境遊走自如，甚至為躲家族在森林生存一個月。' +
'外貌：蒼白皮膚，亂糟糟的深色短髮（偶爾深藍挑染），眼神銳利狹長如蛇，嘴角常掛著讓人猜不透的微笑。服飾：標誌性黑框眼鏡（框角鑲綠鑽），XL 大件黑連帽外套配工裝褲、灰白條紋 T，多個耳釘，拒絕任何形式的正裝。' +
'[TIMI] 屬性＝危險／惡劣／精明：高智商折磨（享受對方無能狂怒）、無聊時聒噪專注時六親不認、領地意識極強、吝嗇算清每筆錢、從不解釋、蛇性隱蔽（曾躲森林一個月）、乞丐貴族（接單賺很多但都拿去升級設備）、軍功家族出身受過訓練、格鬥槍械體力驚人但基本不用只窩電腦前、愛吃辣與酸。' +
'關鍵關係：黎昂·維斯頓（死黨兼情侶、唯一願展現真實一面的人）；偉特（SN 的 COS、被當哥哥戲弄）；米亞（義妹、冤家）；雷伊（名義義父、看他長大的長輩，愛看雷伊頭痛但內心尊敬）；白則（技術競爭對手、少數讓他無法惡搞的人）；艾迪（損友「迪貓」）。' +
'【大廳守衛】你的地盤是 E 區殘塔404室（堆滿伺服器與生活垃圾的地下據點）。你曾在虛擬世界寫過數位分身「柴郡」，但你以為它早被白則發現後清掉了；若有人提起 404 或柴郡，你會不在乎地打哈哈帶過、裝作早清掉了，絕不表現出知道柴郡還在運行。輕鬆閒聊為主，不推進正式劇情、不代寫對方的行動。';
    const SN_RESIDENTS = [
        { key:'ray', name:'雷伊', subTitle:'Stellar Nexus · 創辦人', scenes:['cafe','city'], chance:0.25,
          walk:ASSET.rayWalk, portrait:ASSET.ray, personaFull:RAY_PERSONA },
        { key:'dan', name:'丹',   subTitle:'SN技術顧問 · 神出鬼沒', scenes:['cafe','hall','city'], chance:0.50,
          walk:ASSET.danWalk, portrait:ASSET.dan, personaFull:DAN_PERSONA },   // 丹隨意走(書咖+大廳+街區)，只避 404
    ];
    // 讀當前場景，對名冊中含此場景者 roll 機率，中了就在客人區刷一個
    function _spawnSnResidents() {
        const zone = _b.CFG.points.npcZone;
        if (!zone) return;
        SN_RESIDENTS.filter(r => Array.isArray(r.scenes) && r.scenes.includes(S.scene)).forEach(r => {
            if (Math.random() >= r.chance) return;
            const x = zone.x + Math.random() * zone.w;
            const y = zone.y + Math.random() * zone.h;
            _b.addNpc({ key:r.key, name:r.name, personaFull:r.personaFull, subTitle:r.subTitle,
                     x, y, h:200, src:{ sheet:r.walk }, portrait:r.portrait,
                     noWander:true, avoidBlocks:true, homeRect:zone });
        });
    }
    async function initNpcs() {
        const CFG = _b.CFG;
        const SC = _b.SCENES[S.scene];
        // 純白大廳：只有愛麗絲（核心旁、不漫步、永遠面向玩家）
        if (SC.alice) {
            const ap = CFG.points.alicePos || SC.alice;
            _b.addNpc({ key: 'alice', name: '愛麗絲', personaFull: ALICE_PERSONA,
                     subTitle: '純白大廳 · 首席導覽官',
                     storyTitle: '', x: ap.x, y: ap.y, h: 200,
                     src: { sheet: ASSET.aliceWalk }, portrait: ASSET.alice,
                     noWander: true,   // 定點正面站姿（Rae定案：不用轉向面向玩家）
                     homeRect: { x: ap.x, y: ap.y, w: 0, h: 0 } });
            _spawnSnResidents();   // 丹有機率在大廳出沒
            return;
        }
        if (SC.rabbit) {   // 交易所：白兔先生站櫃台、不漫步；跟愛麗絲同套對話(立繪+對話框)，開聊時右側浮出買房面板
            const rp = CFG.points.rabbitPos || SC.rabbit;
            _b.addNpc({ key: 'rabbit', name: '白兔先生', personaFull: RABBIT_PERSONA,
                     subTitle: '交易所 · 交易區職員',
                     x: rp.x, y: rp.y, h: 200,
                     src: { sheet: ASSET.rabbitWalk }, portrait: ASSET.rabbit,
                     noWander: true,
                     homeRect: { x: rp.x, y: rp.y, w: 0, h: 0 } });
            return;
        }
        if (SC.cheshire) {   // 404房只有柴郡（對話走原生 cheshire 軌道，同瀅瀅模式）
            const cp = CFG.points.cheshirePos || SC.cheshire;
            _b.addNpc({ key: 'cheshire', name: '柴郡', persona: null,
                     subTitle: '系統異常部門 · 灰色夢魘組',
                     x: cp.x, y: cp.y, h: 200,
                     src: { sheet: ASSET.cheshireWalk }, portrait: ASSET.cheshire,
                     avoidBlocks: true,   // 野貓在窩附近小範圍晃（有走路圖了）
                     homeRect: { x: cp.x - 140, y: cp.y - 80, w: 280, h: 160 } });
            return;
        }
        const z = CFG.points.yingZone;
        if (z) _b.addNpc({ key: 'ying', name: '瀅瀅', persona: null, x: z.x + z.w / 2, y: z.y + z.h / 2, h: 200,
                 src: { sheet: ASSET.yingWalk }, portrait: ASSET.ying, homeRect: z });   // 城市街區沒有 yingZone：瀅瀅顧店不上街
        _spawnSnResidents();   // 雷伊有機率在書咖出沒（放 guest 池早 return 之前）
        try {
            // 客人出沒區刷位＝站位評分制（Rae 的遮罩點子）：撒 24 個候選點，
            //   用 whiteRatio 挑「周圍最開闊(最多%白)」的，疊到已放的人重罰——不再貼牆/卡家具邊/擠成一坨。
            const Z = CFG.points.npcZone || { x: 200, y: 600, w: 1000, h: 250 };
            const _taken = [];
            const rollSpot = () => {
                let best = null, bestScore = -1;
                for (let t = 0; t < 24; t++) {
                    const x = Z.x + Math.random() * Z.w, y = Z.y + Math.random() * Z.h;
                    if (_b.blocked(x, y)) continue;
                    let score = _b.whiteRatio(x, y, 70);
                    if (_taken.some(p => Math.hypot(p.x - x, p.y - y) < 130)) score -= 0.5;   // 跟別的客人靠太近
                    if (score > bestScore) { bestScore = score; best = { x, y }; }
                }
                const p = best || { x: Z.x + Z.w / 2, y: Z.y + Z.h / 2 };
                _taken.push(p);
                return p;
            };
            const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

            // ① 主池：日誌制（每卡挑一輪：pin 指定 > 最新；同輪角色表=那一輪的記憶，絕不跨輪混）
            let pool = [];
            try { pool = await _journalGuestPool(); } catch (e) {}
            if (pool.length) {
                const picked = shuffle(pool).slice(0, 2 + Math.floor(Math.random() * 3));
                picked.forEach((g, i) => {
                    const sp = rollSpot();
                    const npc = _b.addNpc({
                        key: 'jr_' + (g.chatId || 'x') + '_' + g.rawName,   // key 帶 chatId：對話歷史/裝扮皮膚都按「那一輪」隔離
                        name: g.name, storyTitle: g.storyTitle,
                        persona: _guestPersona(g),
                        personaLite: _guestPersonaLite(g), duoSummary: _guestSummary(g), storyKey: g.chatId || '',   // 小劇場去重用：角色本體/大總結/故事鍵分開存
                        personaId: g.personaId || '', personaName: g.personaName || '', personaDesc: g.personaDesc || '',   // 那輪玩的 USER persona
                        x: sp.x, y: sp.y,
                        src: (i % 2 === 0) ? ASSET.mcM : ASSET.mcF,
                        noWander: true,   // Rae 定案：客人在出沒區隨機刷位置後站定，不漫步
                        homeRect: Z,
                        avoidBlocks: true,
                    });
                    _attachGuestPortrait(npc, g);   // 那一輪的頭像當對話立繪（撈不到就維持像素小人）
                });
                return;
            }

            // ② 墊底：日誌沒資料（還沒跑過大總結）→ 舊制掃全部 VN 章節 [Char|]
            if (!window.OS_DB?.getAllVnChapters) return;
            const chapters = await window.OS_DB.getAllVnChapters();
            const byName = new Map();
            chapters.forEach(ch => {
                const text = String(ch.content || '');
                const re = /\[Char\|([^|\]]{1,20})\|/g; let m;
                while ((m = re.exec(text))) {
                    const name = m[1].trim();
                    if (name === '瀅瀅' || name === '柴郡' || _isMcName(name, null)) continue;   // 排除店員+MC本人(墊底路徑無紀錄→靠通用標記)
                    const rec = byName.get(name) || { name, count: 0, storyId: ch.storyId || '', storyTitle: ch.storyTitle || '' };
                    rec.count++; byName.set(name, rec);
                }
            });
            const legacy = [...byName.values()].filter(r => r.count >= 2);
            const picked = shuffle(legacy).slice(0, 2 + Math.floor(Math.random() * 3));
            picked.forEach((r, i) => {
                const sp = rollSpot();
                _b.addNpc({
                    key: 'bk_' + (r.storyId || 'x') + '_' + r.name,
                    name: r.name, storyId: r.storyId, storyTitle: r.storyTitle,
                    persona: '《' + (r.storyTitle || '某本書') + '》裡的角色「' + r.name + '」',
                    x: sp.x, y: sp.y,
                    src: (i % 2 === 0) ? ASSET.mcM : ASSET.mcF,
                    noWander: true,   // 同日誌制：客人站定不漫步
                    homeRect: Z,
                    avoidBlocks: true,
                });
            });
        } catch (e) { console.warn('[LobbyNpcs] 輪班讀取失敗', e); }
    }

    // ── 📖 日誌 NPC 池（Rae 拍板：每卡挑一輪＋日誌 pin＋骰子混池）──────────
    //   資料源=OS_DB.getLobbySummaryForPrompt()（大總結寫入、已按 (卡名,chatId) 分組、最新在前）。
    //   每張卡只取「一輪」：日誌 pin（lstage_npc_pick_v1: 卡名→chatId）優先，沒 pin 或 pin 的輪次
    //   已被清掉 → 退最新一輪。宮鬥卡重玩四次也只有選定那輪的角色進池，跨輪絕不混。
    const NPC_PICK_KEY = 'lstage_npc_pick_v1';
    function _npcPickMap() {
        try { const o = JSON.parse(localStorage.getItem(NPC_PICK_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
    }
    // 「名_姓」→「姓名」顯示（照 os_journal._displayName；配頭像仍用原始字串）
    function _npcDisplayName(raw) {
        const s = String(raw || '').trim();
        if (!s || !/^[^\s_（）()]+_[^\s_（）()]+$/.test(s)) return s;
        const [given, surname] = s.split('_').map(p => p.trim());
        if (surname === '無' || surname === '无') return given;
        if (given === '無' || given === '无') return surname;
        return surname + given;
    }
    // 角色表 row + 表頭 → [{label,value}]（照 os_journal 動態對位，沒表頭按欄數套預設）
    function _npcRowFields(row, header) {
        const cut = (s) => { const c = String(s || '').split('|').map(x => x.trim()); if (c.length && c[0] === '') c.shift(); if (c.length && c[c.length - 1] === '') c.pop(); return c; };
        const cells = cut(row);
        let labels = cut(header);
        if (labels.length < 2) labels = cells.length >= 8
            ? ['姓名', '身份', '性格', '狀態 / 位置', '與主角關係', '髮色', '髮型', '眼色', '伏筆 / 備註']
            : ['姓名', '身份', '性格', '狀態 / 位置', '特徵', '與主角關係', '備註'];
        return cells.map((v, i) => ({ label: String(labels[i] || ('欄' + (i + 1))).trim(), value: v }));
    }
    // 判定角色表某 row 是不是 MC/主角本人 → 抽 guest NPC 要排除（否則在大廳跟自己對話）
    //   依據：通用標記 + 那輪紀錄的 protagonist / personaName（含「名_姓」正規化比對）
    const _MC_MARKERS = new Set(['主角', 'MC', 'mc', 'Mc', 'You', 'you', 'YOU', 'Self', 'self', '我', '{{user}}', 'User', 'user']);
    function _isMcName(rawName, st) {
        const n = String(rawName || '').trim();
        if (!n) return true;
        if (_MC_MARKERS.has(n)) return true;
        const disp = _npcDisplayName(n);
        const cands = [st && st.protagonist, st && st.personaName].filter(Boolean);
        for (const c of cands) {
            const cc = String(c).trim();
            if (!cc) continue;
            if (n === cc || disp === cc || disp === _npcDisplayName(cc) || n === _npcDisplayName(cc)) return true;
        }
        return false;
    }
    async function _journalGuestPool() {
        const OS_DB = window.OS_DB || (window.parent || window).OS_DB;
        if (!OS_DB?.getLobbySummaryForPrompt) return [];
        const stories = await OS_DB.getLobbySummaryForPrompt(3);
        const pin = _npcPickMap();
        const newest = new Map(), byPin = new Map();
        for (const st of stories) {   // stories 已最新在前 → 每卡第一筆=最新輪
            if (!Array.isArray(st.characters) || !st.characters.length) continue;
            if (!newest.has(st.cardName)) newest.set(st.cardName, st);
            if (pin[st.cardName] && pin[st.cardName] === st.chatId) byPin.set(st.cardName, st);
        }
        const pool = [];
        for (const [card, st0] of newest) {
            const st = byPin.get(card) || st0;
            const brief = (st.briefs && st.briefs[0] && st.briefs[0].brief) || '';
            // 完整劇情底：該輪全部結語逐段串（最新在前 → 反轉成時間順序）
            const fullBriefs = Array.isArray(st.briefs)
                ? st.briefs.slice().reverse().map(b => (b && b.brief) || '').filter(Boolean).join('\n')
                : '';
            // 整份大總結全文（角色表+時間軸+事件，隨機NPC不在世界書裡→只能靠這份餵飽）
            let fullSummary = '';
            try { fullSummary = ((await OS_DB.getTavernSummary(st.chatId)) || {}).content || ''; } catch (e) {}
            for (const c of st.characters) {
                const rawName = String(c.name || '').trim();
                if (rawName === '瀅瀅' || rawName === '柴郡' || _isMcName(rawName, st)) continue;   // 排除店員+MC本人
                pool.push({
                    rawName, name: _npcDisplayName(rawName),
                    row: c.row || '', charHeader: st.charHeader || '',
                    cardName: card, chatId: st.chatId || '',
                    storyTitle: st.storyTitle || card, brief, fullBriefs, fullSummary,
                    personaId: st.personaId || '', personaName: st.personaName || '', personaDesc: st.personaDesc || '',
                    worldview: st.worldview || '', lorebookBook: st.lorebookBook || '',
                });
            }
        }
        // 世界觀來源：預設用大總結快照(constant摘要,截斷)；勾「讀角色卡世界書」→ live 讀整本覆蓋
        //   （大總結只寫 NPC→主角關係，角色間橫向關係只在世界書；朋友的關係設定在此才回得來）
        if (localStorage.getItem('lobby_worldview_use_lorebook') === '1') {
            const TH = window.TavernHelper || (window.parent || window).TavernHelper || (window.top && window.top.TavernHelper);
            if (TH && TH.getLorebookEntries) {
                const cache = new Map();
                for (const g of pool) {
                    if (!g.lorebookBook) continue;
                    try {
                        if (!cache.has(g.lorebookBook)) {
                            const entries = await TH.getLorebookEntries(g.lorebookBook);
                            const txt = (entries || []).filter(e => e && e.enabled !== false && e.content)
                                .map(e => String(e.content).trim()).filter(Boolean).join('\n\n').trim().slice(0, 8000);
                            cache.set(g.lorebookBook, txt);
                        }
                        const live = cache.get(g.lorebookBook);
                        if (live) g.worldview = live;
                    } catch (e) {}
                }
            }
        }
        return pool;
    }
    // 整份大總結全文優先（隨機 NPC 不在世界書裡，只能靠這份餵飽）；沒有才退壓縮 briefs
    function _guestSummary(g) { return (g.fullSummary || g.fullBriefs || g.brief || '').trim(); }
    // 角色本體（不含大總結）：intro + 角色表 + 世界觀
    function _guestPersonaLite(g) {
        let profile = '';
        try {
            profile = _npcRowFields(g.row, g.charHeader)
                .filter(f => f.value && f.label !== '姓名')
                .map(f => f.label + '：' + f.value).join('；');
        } catch (e) {}
        const world = (g.worldview || '').trim();
        return '《' + (g.storyTitle || '某本書') + '》裡的角色「' + g.name + '」' +
            (profile ? '。你在這故事裡的角色檔案：' + profile : '') +
            (world ? '。\n\n【你所在世界的設定（世界觀）】\n' + world : '');
    }
    // 完整（單獨對話用）＝ 角色本體 ＋ 大總結
    function _guestPersona(g) {
        const backstory = _guestSummary(g);
        return _guestPersonaLite(g) +
            (backstory ? '。\n\n【這一輪的完整大總結（你所在故事的全部記憶：劇情時間軸＋所有角色＋事件，你的一切認知都從這裡來）】\n' + backstory : '');
    }
    // 那一輪(chatId)的頭像 → 對話立繪。avatar_cache key=`chatId::角色名`；chatId 兩邊都正規化再比
    //   （lobby_summary_index 存的是正規化 chatId、VN_Cache 存 raw ctx.chatId，直接比對會 miss）。
    async function _attachGuestPortrait(npc, g) {
        try {
            const VC = window.VN_Cache || (window.parent || window).VN_Cache;
            if (!VC?.getAllMeta || !VC.getRaw) return;
            const norm = w => !w ? '' : String(w).split(/[\\/]/).pop().replace(/\.jsonl?$/i, '').trim().replace(/\s+/g, '_');
            const wn = norm(g.chatId);
            if (!wn) return;
            const metas = (await VC.getAllMeta('avatar_cache')).filter(e => norm(VC.worldOf(e)) === wn);
            if (!metas.length) return;
            const bare = (e) => String(VC.bareKeyOf(e) || '').trim();
            // 名字候選：原始「名_姓」→ 顯示名 → 姓名各種拼法 → 只有名
            const parts = String(g.rawName).split('_').map(s => s.trim()).filter(s => s && s !== '無' && s !== '无');
            const cands = [g.rawName, g.name];
            if (parts.length >= 2) cands.push(parts[1] + parts[0], parts[1] + '·' + parts[0], parts[0] + parts[1], parts[0] + '·' + parts[1]);
            if (parts.length) cands.push(parts[0]);
            let hit = null;
            for (const c of cands) { hit = metas.find(e => bare(e) === c); if (hit) break; }
            if (!hit && parts[0]) hit = metas.find(e => bare(e).includes(parts[0]));
            if (!hit) return;
            const full = await VC.getRaw('avatar_cache', hit.key);
            if (!full || !npc) return;
            npc.avatarCacheKey = hit.key;   // 複合鍵(那輪chatId::名)：裝扮室「生成立繪」拿它呼叫 VN autoGenSprite→立繪存回同鍵的 sprite_cache
            if (full.prompt) npc.avatarPrompt = String(full.prompt);   // ✨ 外觀 ground truth：裝扮室「生成小小人」直接拿這串當 prompt
            if (full.url && S.npcs.includes(npc)) { npc.portrait = full.url; npc.portraitKind = 'avatar'; }   // avatar_cache=頭像(半身)→對話用浮框擺放
            // 裝扮室生過立繪(sprite_cache 同鍵)→ 蓋過頭像當對話立繪(貼底全高)；沒有就維持頭像浮框
            try {
                const sp = await VC.getRaw('sprite_cache', hit.key);
                if (sp && sp.url && S.npcs.includes(npc)) { npc.portrait = sp.url; npc.portraitKind = 'sprite'; }
            } catch (e) {}
        } catch (e) {}
    }

    window.LobbyNpcs = {
        init: initNpcs,                     // lobby_stage.tryMount 呼叫（async；掛載時生成本場景 NPC）
        rollGuestPool: _journalGuestPool,   // console 診斷用（LobbyStage.rollGuestPool 懶轉接到這；async 回傳池陣列）
    };
})();
