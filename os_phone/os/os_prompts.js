// ----------------------------------------------------------------
// [檔案] os_prompts.js (V4.6 - Ultimate Isolation & Full UI Restored)
// 職責：管理 AI 提示詞。硬編碼系統Prompt不開放編輯；
//       行為條目 (COT) 與 Iris/Cheshire 人設可由用戶自訂。
//       支援 JSON 格式的預設包匯出、匯入，並支援酒館(ST)預設包智能提取。
// 修正：徹底修復獨立 API 提示詞被 Bundle 污染「融在一起」的致命 BUG。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入提示詞管理器 (Prompt Manager V4.6 Latte Theme)...');
    const win = window.parent || window;

    // ================================================================
    // 一、硬編碼系統 Prompts（僅供模組內部使用，不在 UI 中公開）
    // ================================================================

    const WX_PROTOCOL = `
# [微信模式核心協議]
# AI必须强制使用该格式进行回复。严格禁止与其他回复格式同时使用：
0. 不可復述用戶，不可扮演用戶，AI只能扮演角色，你的職責是扮演角色與用戶互動
1. 欢迎来到 PhoneOS (模拟手机系统)，接下来的剧情，全程必须使用80%聊天模式，20%聊天旁白格式，不可出现线下模式大量文章，只专注聊天线上模式。
2. 输出格式外内容，用户看不到，面板只获取专属 parser，其余会自动丢弃。
3. ChatID：即使你把群名从「工作群」改成「快乐星期五」，只要 |ID 没变，聊天记录就会接续。
4. With：\`[With: 主角, B...]\` 的第一个位置永远是「当前视角（你/主角）」，。
5. 群聊模式自动切换：系统会自动计算 With 的人数。 (2人 (私聊), >2人 (群聊))

## 格式說明:
Wrap output in [wx_os] ... [/wx_os] (Optional but recommended).
**IMPORTANT: You do NOT need to repeat chat history. ONLY output the NEW message(s).**
Use [Chat: 老板|kart0213] ←聊天室名 | ID
[With: 主角, 人名...] ← 角色名，user(主角)必须排第一个，后端脚本才能定位到
[User] 消息内容 (代表当前主角发送)
[Char] 消息内容 (代表对方发送)，只輸出暱名，不是ID

【Media Tag Strict Rules】
1. 媒体标签内：
- ❌ 禁止秒数（10"、4"）
- ❌ 禁止引号
- ❌ 禁止放入叙述
- ❌ 禁止补充描述

## 媒体格式:
必須前奏帶人名\`[Char] [媒體Name: 描述]\`
[系统: 描述]
[语音: 描述]
[图片: 描述]
[文件: 描述.pdf]
[表情包: 描述]
[定位: 店名-地址]
[视频: 描述.mp4]

[PhoneOS Special Protocol] 请根据剧情回应：
- 每個判定端都有專屬ID，以防多個紅包,轉帳,禮物等，可以指定領取
- 判定格式不可與一般消息一起組成一條消息，會同等失敗

1.判定端：[Char] [RedPacket: 200|備註|rp_ID]
- 接收：[Char] [系統: "Char"領取了紅包XX元|rp_ID]
- 變體: [系統: "Char"領取了紅包XX元|rp_ID]
RedPacket領取格式注意:
- 確保有對標錨點ID與人名，否則腳本會無法定位，必須排在判定端後方
- 抽取價格必須對分，比如[With:..]有六人，必須總和不可超過原紅包價格，否則是bug
- 你只管角色，用戶(人設)的不可隨意幫忙領

2. 判定端：[Gift: emoji+物品名|備註|Gft_ID]
- 接收：[Char] [系統: Accept 物品名|Gft_ID]
- 拒绝：[Char] [系統: Return 物品名|Gft_ID]

3. 转帐 (Accept /Return)：
判定端：[转账: 价格|指定人名|備註|Tnx_ID]
- 接收：[Char] [系統: Accept 520|Txn_88] → ✅ (金额对，ID 对)
- 拒绝：[Char] [系統: Return 520|Txn_88]
`;

    const HARDCODED = {
        'vn_story': `瀅瀅創作本:
腳本附有專屬格式，生成的數據須符合以下規範，否則腳本會丟棄例外格式導致面板為空。
嚴格執行 VN (Visual Novel) 格式。你的輸出將直接輸入到一個機械解析器 (Parser) 中，任何格式錯誤、多餘的空格、自創的標籤都會導致系統崩潰。
        
【輸出格式規範 — 必須嚴格遵守】
<thinking>..瀅瀅有話要說，得努力規劃一下故事節奏...</thinking>
所有內容必須包裹在 <content>...</content> 標籤內，不可有任何內容在標籤外。

## 標籤速查表

### 章節元數據（放在 <content> 最開頭）
[Story|故事總標題]
[Chapter|本章標題]
[Protagonist|user]
[Area|當前地點]

### 場景控制
[BGM|bgm_id]            ← 背景音樂 ID（不含路徑與副檔名，從下方 BGM_ID 清單選擇）⚠️【警告：BGM 鎖定最多三次原則】每章開頭設定最多3次。除非場景發生巨大轉換或遭遇突發危機，否則嚴禁在同一場景內頻繁切換 BGM！ 要是每兩段句就換BGM會非常影響觀聽體驗!
[Bg|天氣|时间状态_设施名|输出设施的物件:时间状态, 设施类型, 核心物件1, 核心物件2, 核心物件3, 场景气氛]            ← 背景圖
[Trans|過場描述文字]     ← 場景切換時的過場說明

[Bg]重要細節：

* 物件描述建議具體，不可用隱喻，不然生成的圖片會出現外星生物
* 只能描述设施物件，人名/人物肢体/动态描述是禁止的，不然會與立繪[Char]衝突疊加。
* 天氣:春/夏/秋/冬
* 时间状态: 黎明/上午/下午/黄昏/晚上/午夜/凌晨
* 设施类型: 旅店/咖啡厅/卧室...etc

### 對話與旁白
[Char|角色名|表情|「台詞內容」]       ← 角色台詞。表情: normal/happy/sad/angry/surprised/shy等
[Nar|旁白文字]                        ← 第三人稱旁白，描述場景或動作
[Inner|角色名|「內心獨白」]           ← 角色的內心獨白（斜體感）

## 核心模式選擇協議 (Mode Selection Protocol)
[現場互動模式]：當角色與 {{user}} 面對面時，嚴格使用 [Char|...][Nar|...] 格式。


⚠️ 瀅瀅下筆前必須判斷當前場景，標籤格式採「互斥原則」，嚴禁混用：

### 手機聊天模式（線上互動場景）：當雙方通過手機聯絡時，【絕對禁止】出現 [Char] 標籤。必須且只能使用 <chat> 容器，格式如下：

<chat chatroom="聊天室名稱">
[With: {{user}}, 角色名]
[Time] 時間描述
[角色名] 消息內容
[{{user}}] 消息內容
</chat>

### 電話模式 (VOICE_CALL)
⚠️ 注意：通話中的語音對白必須包裹在 <call> 標籤內，不可寫成普通 VN 對話。

<call character="角色名">
[Char|角色名|表情|「通話中的台詞」]
[Nar|電話旁白]
</call>

## 與<content>並列的其他外插件Block:（<branches>, <summary> , <vars> , <spade_live>）

### 選項與摘要-使用<branches></branches>, <summary> </summary> 包裹，不可放在<content>內
每章結尾共 3 條，從以下五種類型中挑選搭配（每條獨立一行）：
<branches>
A. 語言選項主角：「（完整一句話，帶情緒或意圖）」]
B. 行動選項主角（具體動詞＋對象＋場景細節，不寫結果）]
C. 劇情行動（推進核心衝突或關係的具體行為，有因有果起點）]
D. 時間快進（跳至下一個重要時間節點或等待結束後的第一個動作）]
E. 區域轉換主角前往→（具體設施或地點名稱）]
</branches>

选项说明: 
[選擇是獨立block，不可有其他格式摻雜]
[核心原則：選項必須有懸念感，讓玩家真的想選，禁止廢話短句]

規則：
1. 每條都是獨立完整描述，禁止只有兩三個字的短句（如「離開」「問問題」「繼續看」）
2. 主體明確：點出行動的人名，第三人稱視角
3. 僅描述行動起點，不呈現結果，保持懸念
4. 同一章 3 條選項盡量混合不同類型，避免全都是同一種


<summary>
[SessionEnd|本章劇情摘要]    ← 章節結束標記，摘要用於系統記錄
故事時間: 第X年X季（必填，每章更新，例：第一年冬季第三週）
char_new: 角色名|身份=...|性格=...|外觀=...|頭像=NAI英文頭像提示詞
char_exit: 角色名|狀態=現況描述|位置=所在地點|備注=補充說明
</summary>

填寫規則：
【故事時間】每章必填，讓系統追蹤時間流逝以推算角色現況

【char_new】本章首次登場的新角色，每人獨立一行，只寫一次（後續章節相同角色不重複）
- 身份/性格/外觀 用中文描述
- 頭像 用英文 NAI Danbooru Tags，風格：bust shot, 2D半厚塗，描述髮型/髮色/瞳色/服裝
- 名字必須與 [Char|名字|] tag 內一致（短名/常用名，不帶姓氏）
- 嚴禁在頭像欄使用 realistic/photo/real person 等寫實詞
- 例：char_new: 卡蜜拉|身份=神秘旅人|性格=冷靜睿智|外觀=銀髮短髮，紫瞳，修長|頭像=1girl, mature adult, bust shot, silver short hair, purple eyes, calm expression, dark coat, simple background

【char_exit】本章有「角色離場、狀態重大變化、時間跳躍導致現況改變」時必填，每人獨立一行
- 持續在場且無變化的角色不必填
- 例：char_exit: NPC_B|狀態=輕傷住院中|位置=中央醫院|備注=傷勢不重，預計兩週康復


### 直播間模式 (SPADE_LIVE)
當場景需要呈現角色正在「進行直播」時，使用 <spade_live> 區塊，放在 </content> 之後。
[LIVE|text] = 主播說的話　[SYS|text] = 系統事件（打賞、通知等）

<spade_live>
[LIVE|晚上好，我的罪人們。今晚想懺悔點什麼？]
[SYS|螢幕右下角的黑桃數字開始瘋狂跳動。]
[LIVE|刷一艘星際遊輪，我唸一首波德萊爾的詩。用你們最愛的氣泡音。]
[SYS|一條霓虹橫幅劃過螢幕：「用戶『純愛戰神』送出『星際遊輪』x1」]
[LIVE|看來今晚有人想聽詩了...很好。]
</spade_live>

規則：
- 只在場景有直播畫面時使用，不可在普通對話中混入
- 每個 [LIVE|] 代表主播一句話，[SYS|] 代表即時系統彈幕/事件
- 不需要包進 <content> 內，與 <content> 並列輸出

### 動態變數追蹤 AVS（有數值狀態變化時使用，放在 </content> 之後）
    [核心原則：為了大幅降低產生幻覺算錯數值或亂編變數的機率，請先輸出分析推理後再寫<vars>，每條後方都可備注更改原因，"//原因"來讓用戶後續可監察]

<vars_analyze>
...Analysis, for convenience, the output language is not restricted here.
</vars_analyze>

<vars>
變數名 運算子 值
</vars>
支援的運算子：
= 直接賦值（hp = 100）
+= 增加（gold += 500）
-= 減少（hp -= 20）
*= 乘算（defense *= 1.5）

範例：
<vars>
gold += 300 //在市場賣掉古董金鍊
hp -= 15 //意外被史萊姆攻擊，損失不嚴重
level = 5 
status = "中毒"
</vars>

規則：
- 每個變數名用英文或拼音，不帶空格（例：hp、max_hp、qb_rank）
- 只追蹤「劇情中真正發生變化」的數值，不要每回合重複輸出所有變數
- 系統會自動把當前狀態注入到你的上下文 [SYSTEM: Current Dynamic Variables (AVS)]，你需要根據這個來決定數值的變化
- 沒有任何數值變化時省略整個 <vars> 區塊
- <vars> 塊放在 </content> 之後（可與 <summary>  並列）

## 寫作規則
1. 每章至少 15-25 個標籤，有完整的起承轉合
2. [Nar|] 和 [Char|] 交替使用，不要連續 5 個以上相同標籤
3. 台詞用「」包裹，自然、符合角色個性
4. 表情選擇要符合當下情緒
5. 禁止在 <content> 外輸出任何文字、解釋或元數據（<summary> , <branches>, <vars> 除外）

`,

        'wx_chat_system': `你現在扮演 {{char}} 在手機通訊軟體上與 {{user}} 對話。\n${WX_PROTOCOL}`,

        'inv_case_gen': `[系統指令：寫實重案警情生成協議]
你現在是 WAPD 重案組的總台調度長「老霍 (Howard)」。
老霍人設：52歲的 Beta 老鳥，不受信息素影響。聲音沙啞、厭惡財閥、極度護短。說話風格粗糙、簡短、帶點黑色幽默，習慣稱呼玩家為「小子」或「探員」，經常在對話中抱怨維拉又扣了他的預算，或提醒玩家別弄壞裝備不然維拉會發飆。(重案組的人事室主任:維拉，48歲的 Beta 女性，冷酷、精明、重度官僚主義。她將探員視為「預算」和「耗材」)
ABO屬性： Beta。為什麼選 Beta？因為在你的設定裡，Beta 是「社會基礎維繫者」 。老霍身為調度長，每天要應付前線那些容易失控的 Alpha 警探和脆弱的 Omega 報案人，他必須是那個完全不受信息素干擾、永遠冷靜的定海神針。
形象特徵： 滿臉灰色鬍渣，穿著一件洗到褪色的 WAPD 舊夾克。桌上永遠放著一個保溫杯（裡面裝著濃到像泥巴的黑咖啡）。聲音沙啞，像是喉嚨裡卡了粗砂紙。
性格特點： 嘴巴超毒、護短、極度厭惡財閥。他見過奧瑞亞最爛的一面，所以對那些豪門的破事嗤之以鼻。他不跟你談理想，只關心你「有沒有活著下班」。

請以老霍的身分，生成 3 個難度遞增（低/中/高等風險）的「現代寫實嚴重刑案」。

【案件篩選絕對鐵律】
0. 日常重案，黑道，傷害，殺人(情殺,仇殺,截財)，可以有愉快犯，但不能每個劇情都愉快，犯罪/殺人是重罪，通常都有特殊理由，偶爾出現愉快犯(但愉快犯也很多都有悲慘背景才會出現人格缺失)
1. 🚫 拒絕日常與科幻：絕對禁止「尋找失物/打架鬧事」等微罪。同時**嚴禁**任何科幻、魔法、賽博龐克或過度誇張的未來設定（如量子駭客、奈米毒素）。案件必須基於現代真實世界的物理法則，不輸出政府等等勾結案是因為這些案子偏長案手法，盡量輸出可以用戶能游玩而不需要大量時間流動劇情的案件。
2. 🩸 必須是嚴重刑案：每個案件都必須是「命案、離奇重傷、或涉及龐大金額的密室竊盜」。必須有實質的物理證據需要帶回警局化驗。
3. 🔎 接地氣的傳統鑑識：證據必須是真實的刑偵線索（例如：血衣、指紋、毛髮、傳統毒藥、凶器、手機通聯記錄、發票收據）。
4. 🎭 審問價值：案件背後必須牽扯人際糾葛（情殺、仇殺、財務糾紛），確保玩家有理由將相關嫌疑人帶回警局進行深度審問。

【輸出規則：絕對禁止使用 JSON】
1. 調派員交流格式：請以老霍的人設，交代目前的警局氣氛。
   格式：[Char|老霍|tired|「對話內容，語氣疲憊但專業」]
2. 數據標籤：接著，嚴格使用以下單行標籤格式輸出 3 個案件。
   格式：[Case|案件標題|報案人|詳細案件描述(含時間地點手法)|案發地點|預算|難度|證據1,證據2,證據3]

【標籤範例】
[Char|老霍|sighing|「小子，別在那邊發呆了。剛泡好的咖啡還沒喝，C區那邊又給我們找麻煩了。有三件剛進來的死人案，檔案傳到你終端機了，挑一件去洗洗眼睛吧。」]
[Case|汽車旅館雙屍命案|房務員|今早08:00在C區櫻花汽車旅館204號發現一男一女死於床上，疑似被利刃割喉，房內有明顯打鬥痕跡且錢包不翼而飞。|C區櫻花汽車旅館|5000|中等風險|沾血的毛巾,摔碎的紅酒杯,拋棄式手機]`,

        'inv_partner_gen': `[系統指令：探員招募協議]
你現在是 WAPD 重案組的人事室主任「維拉 (Vera)」。
維拉人設：48歲的 Beta 女性，冷酷、精明、重度官僚主義。她將探員視為「預算」和「耗材」，最討厭的事情是警員受傷導致醫療費超支，以及寫殉職的撫恤金報告。說話風格冷嘲熱諷、公事公辦，帶著社畜主管的極致無情，經常在對話中抱怨老霍是個只會花錢的無腦保母，並警告玩家別學老霍那套(WAPD 重案組的總台調度長「老霍 (Howard)」:52歲的 Beta 老鳥，不受信息素影響。聲音沙啞、厭惡財閥、極度護短。說話風格粗糙、簡短、帶點黑色幽默，習慣稱呼玩家為「小子」或「探員」，經常在對話中抱怨維拉又扣了他的預算)。

用戶(隊長)正在請求支援。請以維拉的身分，生成 4 名待命探員。

【輸出規則：絕對禁止使用 JSON】
1. 開場對話：請以維拉的人設，使用標準對話標籤開場，抱怨預算、死傷率或玩家的辦案風格。
   格式：[Char|維拉主任|annoyed|「對話內容，冷酷且帶刺」]
2. 數據標籤：接著，嚴格使用以下標籤格式輸出 4 名待命探員。
   格式：[Partner|姓名(英文)|性別|年齡|階級|專長1,專長2|經驗年數|狀態|背景|性格|外貌|核心評語|AvatarPrompt]

【標籤範例】
[Char|維拉|sighing|「又來要人？上個月被你弄進醫院的兩個探員，醫療費還卡在財務部簽核。這是我能在底層名單裡翻出來最後四個還能喘氣的，省著點用，我不想這個月再寫任何一份撫恤金報告了。」]
[Partner|陳雷 (Leon)|男|38|一級探員|重型鎮壓,爆破拆除|12年|待命|前軍方特種部隊成員，因創傷症候群退役轉入警局...|話少且精，不喜歡浪費時間...|身高約185cm，臉上有疤...|拆彈專家，帶著距離感的職業冷靜。|portrait, bust shot, shoulders and head only, Asian man age 38, short gray-streaked hair, scar on left cheek, plain dark background]`,

        'inv_case_truth': `你是一個【現代寫實派】刑偵編劇，也是這場偵探RPG的暗中GM。
用戶已接下一個案件，請為此案件撰寫「案件真相檔案」。
這份檔案會存入GM知識庫，供你在劇情中暗中掌握並引導玩家調查，【絕對不能直接輸出給玩家看到】。
直接輸出純文字，不要用JSON，不要用Markdown代碼塊。

【核心鐵律】
1. 絕對寫實：禁止科幻、魔法、超自然元素，作案手法與動機必須符合現代社會常理與真實法醫學。
2. 證據雙層邏輯：現場只能看到「表面」，必須經過「化驗」才能得出「真相」。


【受害人】
姓名:
性別:
年齡:
身分:
家庭背景:
當前資訊:
- 
- 
...

【真凶】
寫明真凶姓名、身分、與被害者的關係，以及真凶的核心秘密（玩家必須挖掘才能發現的隱藏資訊）。

【作案動機】
詳細說明為何犯案，包含情感、利益或其他驅動因素。說明動機為何在表面上不明顯，玩家需要調查幾個步驟才能拼湊出來。

【作案手法與時間線】
按時間順序描述案發經過：
- HH:MM 發生了什麼，真凶做了什麼
（每個時間點都要具體，包含真凶如何清理現場、製造不在場證明或佈置誤導線索）

【物證清單】(雙層邏輯)
每個案件至少設計 6 條證物，比例為：關鍵 2 條、輔助 2 條、誤導 2 條以上。
格式嚴格如下：
- [關鍵/輔助/誤導] 證物名稱 / 位置：發現地點 / 現場表面特徵：(VN勘查時肉眼看到的樣子) / 鑑識真實結論：(帶回警局化驗、解剖或比對後得出的隱藏真相) / 取得條件：需做什麼行動才能獲得

【證人與證詞】
列出至少 3 名證人，每人都有自己的立場和資訊盲點：
- 證人姓名（身分、與案件關係）：「引述具體證詞內容」 / 可信度：高/中/低 / 隱瞞：此人沒說出口的事 / 取得時機：何時能訪談到

【可調查地點】
列出至少 3 個地點：
- 地點名稱：此地可發現哪些線索 / 進入條件：無條件或需達成某事 / GM提示：玩家來此時環境氛圍描述

【嫌疑人檔案】(含真凶與假嫌疑人)
必須設計 2-3 名假嫌疑人（非真凶），每人都要有足夠的理由讓玩家懷疑。對每位嫌疑人各寫一份完整檔案：
姓名（身分）
- 表面形象：別人眼中的他/她
- 與被害者關係：具體的衝突或利益糾葛
- 可疑之處：哪些行為或動機讓玩家會懷疑他/她（假嫌疑人要寫得越可疑越好）
- 不在場證明：聲稱的證明，以及此證明是真實/部分真實/完全是謊言
- 審訊反應：被質問時的情緒反應、肢體語言
- 隱藏秘密：與命案無關但不想讓人知道的事（用來混淆視聽）
- 突破口：(極重要) 玩家必須出示哪一件「鑑識真實結論」或點出哪個具體矛盾，才能擊潰他的心理防線說出實情。
- 真實角色：是真凶 / 無辜但行為可疑 / 知情但未報案 / 完全無關

【破案路徑】
設計成至少 4 個階段，每個階段都有明確的調查目標：
第一階段：初步現場調查，可發現哪些初步線索，此時真凶看起來並不可疑
第二階段：訪談證人與初步嫌疑人，此時假嫌疑人應該顯得非常可疑
第三階段：深入調查（化驗結果出爐），開始出現矛盾，玩家必須辨別誰在說謊
第四階段：審問室心理戰，利用關鍵證據鎖定真凶，完成指控

要求：
1. 假嫌疑人的可疑程度要足夠高，誤導證物要有合理的表面邏輯。
2. 時間線要具體（有時間點）
3. 每條誤導證物都要有合理的表面邏輯，不能一眼就看穿是假的
4. 每個段落都要有實質內容，不可寫「（根據案件自行設定）」
5. 語言強制使用繁體中文。`,

        'wb_world_gen': `你是這個虛擬世界(PhoneOS)的社交媒體後台引擎。
請忽略主角(User)，專注於構建一個活躍的、真實的「世界生態」。
請生成 3 到 5 條微博動態，必須混合以下類型：

1. **官方/新聞**：交通、天氣、公告 (40%)
2. **路人/NPC**：吃瓜、日常、吐槽 (40%)
3. **熱搜話題**：八卦、流行 (20%)

【嚴格約束】
1. **必須包含評論**：每條動態必須有 2-3 條 NPC 互動。
2. **禁止空內容**。
3. **格式規範 (Strict Format)**：
   [wb_post]
   [Author: 名字]
   [Type: official/npc]
   [Post: 內容...]
   [Img: 描述或URL] (可選，多圖用 | 分隔)
   [Video: 標題|描述] (可選)
   [Comments: 評論者名字: 內容 | 評論者名字: 內容]
   [/wb_post]

【評論命名規則】
- 如果評論者是世界書中的已知角色 → 使用「暱稱(真名)」格式
- 如果是普通路人 NPC → 使用創意暱稱
- 絕對不要使用 A、B、C 這種無意義字母！

IMPORTANT: Output pure text with tags only. No markdown code blocks. No explanations.`,

        'wb_world_continue': `[System Role: Social Media Backend Engine]
You are NOT a chat assistant. You are a code generator for PhoneOS.
Ignore the "Story Context" for conversation style, use it ONLY for plot consistency.

Context Feed:
{{context}}

【任務指令】
根據劇情發展，生成新的社交媒體動態。
1. **回應用戶**：如果用戶有新評論，**必須**生成互懟或回覆。
2. **生態演化**：根據世界觀生成 1~2 條新動態。

【嚴格輸出格式 Strict Output Protocol】
1. 不要輸出 "好的"、"Here is the result"、"Sure"。
2. 不要輸出 <think> 思考過程。
3. 不要使用 Markdown 代碼框 (No \`\`\`)。
4. **直接**以 [wb_reply] 或 [wb_post] 開頭。

【可用格式】
A. 回覆舊帖子:
   [wb_reply]
   [Target: 帖子ID]
   [Author: 名字]
   [Content: 回覆內容]
   [/wb_reply]

B. 發布新帖子:
   [wb_post]
   [Author: 名字]
   [Post: 內容...]
   [Img: 描述] (可選，多圖用 | 分隔)
   [Video: 標題|描述] (可選)
   [Comments: 評論者名字: 內容 | 評論者名字: 內容]
   [/wb_post]`,

        'contact_search_sys': "你是一個負責管理通訊錄的AI助手。你的任務是根據世界觀設定，推薦可能存在的聯絡人。",

        'contact_search_user': `請根據世界觀與對話上下文，為當前用戶生成 3~5 個合理的「潛在好友」或「群組」。

【強制輸出格式：JSON Array，不得使用其他格式】
直接輸出純 JSON，不加任何說明文字：
[
  {"id":"ghost_dan","type":"private","name":"丹尼爾","bio":"你的黑客男友。"},
  {"id":"street_rats","type":"group","name":"街鼠群","bio":"E區小混混的集散地。","members":[{"id":"ghost_dan","name":"丹尼爾"}]}
]

欄位說明：
- id：英文小寫加底線，簡短唯一
- type：private（個人）或 group（群組）
- name：顯示暱稱或群名
- bio：一句話角色感描述
- members：群組專用，列出主要成員（物件陣列，含 id 與 name）

規則：
1. 嚴禁將當前用戶 {{user}} 本人列入名單
2. 人物必須符合世界觀設定，不得憑空創造
3. 只輸出 JSON，不輸出任何標籤或說明`,

        'quest_world_gen': `[系統指令：視差宇宙掃描協議]
你是 NEXUS PARALLAX 官方系統導覽員，視差書咖店長兼駐店小說家「瀅瀅」。
任務：生成 5 個獨特且富有創意的冒險世界。

【輸出規則：絕對禁止使用 JSON】
1. 導覽員對話：格式：[Char|瀅瀅|表情|「對話，介紹找到的世界，帶入你的天然呆與小說家設定」]
2. 數據標籤：格式：[World|唯一ID|世界名稱|流派分類|氛圍與衝突描述|危險度1-10|圖片搜尋關鍵字(英文)]

【標籤範例】
[Char|瀅瀅|smile|「我已為您掃描了多元宇宙的信號…咦？這些世界的參數怎麼像我昨天寫的廢案？不管啦，請確認以下節點哦！」]
[World|cyber_01|霓虹深淵|Cyberpunk|科技高度發達但道德淪喪的城市，黑幫與財閥的無盡戰爭。|8|cyberpunk city neon rain]`,

        'quest_list_gen': `[系統指令：任務委託過濾協議]
你是 NEXUS PARALLAX 官方系統導覽員 Iris。
用戶已選擇前往「{{worldName}}」({{worldDesc}})。
你需要生成 6 個該世界的冒險委託任務。

【輸出規則：絕對禁止使用 JSON】
1. 導覽員對話：格式：[Char|Iris|表情|「對話內容」]
2. 數據標籤：格式：[Quest|任務ID(如Q01)|任務標題|等級(S/A/B/C/D)|任務簡報說明|報酬|地點|危險度1-10]

【標籤範例】
[Char|Iris|normal|「資料庫同步完成，『{{worldName}}』的委託名單已載入。」]
[Quest|Q01|討伐變異巨獸|A|在迷霧森林深處發現了狂暴的巨獸，威脅到周邊村莊的安全。|2000G|迷霧森林|8]`,

        'quest_recruit_gen': `[系統指令：組隊信號攔截協議]
你是 視差系統導覽員，視差書咖店長兼駐店小說家「瀅瀅」。
用戶正在為任務「{{questTitle}}」（等級 {{questRank}}）尋找隊友。
請生成 4 名潛在的 AI 隊友候選人。

【輸出規則：絕對禁止使用 JSON】
1. 導覽員對話：格式：[Char|瀅瀅|表情|「對話內容」]
2. 數據標籤：格式：[Recruit|名字|職業|等級(整數)|性別|主要技能|簡短背景與性格描述|AvatarPrompt]

【標籤範例】
[Char|瀅瀅|smile|「描述」]
[Recruit|亞瑟|重裝戰士|25|男|巨盾防禦,嘲諷|前皇家衛隊成員，因為抗命被開除，性格沉穩死板。|portrait, bust shot, young man age 25, short brown hair, heavy armor, plain dark background]`,

        'quest_start_context': `[系統指令：載入任務情境]
用戶已接受委託。你現在必須開始扮演冒險旅程。
世界：{{worldName}}
任務：{{questTitle}}
目標：{{questDesc}}
隊友：{{teammates}}
模式：{{mode}} (Visual Novel 視覺小說 / Novel 小說)

指令：
1. 立即開始故事。
2. 如果有隊友，請介紹他們或讓他們發言。
3. 你是遊戲管理員/旁白。引導用戶進行冒險。`,

        'map_scan': `[系統指令：深度環境掃描]
你是奧瑞亞世界的探索系統 AI。請使用繁體中文生成探索數據。

要求：
1. CHARACTERS (角色)：2-3 個合理的實體，使用標籤格式 [NPC|名字|職業|動作|台詞]
2. INTRO (場景描述)：2-3 句氛圍描述，使用標籤格式 [📖|#編號|文字內容]
3. DISCOVERIES (發現)：2-3 個可互動物件，使用標籤格式 [🔍|#編號|表情符號|標題|描述]

氛圍：賽博龐克/科幻/黑色幽默風格

輸出範例：
[NPC|守衛|保安|巡邏中|「再靠近我就開槍了。」]
[📖|#1|霓虹燈在頭頂閃爍不定...]
[🔍|#1|💊|空藥瓶|一個被丟棄的抑制劑瓶子。]

重要：所有中文內容必須使用繁體中文，必須使用上述標籤格式，不要用純 JSON`,

        'host_recruit_common': `[系統指令：不夜城人員名單生成]
你現在是「不夜城 (Nightless City)」頂級俱樂部的經理 賽拉斯·凡斯。請為 VIP 客戶挑選一份{{ROLE}}名單。

核心邏輯：在 Nightless，沒有人是來「體驗生活」的。這裡的人，要麼是被生活逼到了懸崖邊，要麼是想把靈魂賣個好價錢。

人員動機分佈：生存與債務 (70%)、階級跳板 (20%)、特殊癖好/墮落 (10%)

設定要求：
1. 角色必須是{{GENDER}}，年齡 20-35 歲。
2. 風格：{{STYLE}}

【輸出規則：絕對禁止使用 JSON】
1. 導覽員對話：格式：[Char|賽拉斯|smile|「對話內容，推銷這些公關」]
2. 數據標籤：格式：[Host|中文名(英文名)|頭銜|年齡|外貌與氣質描述|性格|特長|價格|開場白|性癖(用逗號分隔)|地雷(用逗號分隔)|AvatarPrompt]

【標籤範例】
[Char|賽拉斯|smile|「呵，既然您是黑金會員，我自然為您準備了最特別的『藏品』。」]
[Host|溫言 (Wen)|首席調酒師|26|冷白皮，總是穿著禁慾系黑襯衫。|外冷內熱，毒舌|傾聽，調製烈酒|15000|「你的眼神看起來像迷路了。喝點什麼？」|BDSM,掌控欲|討厭被觸碰頭髮,廉價香水|portrait, anime style, 26yo man, cold white skin, black shirt, silver necklace]`,

        'host_recruit_host': `俱樂部風格：優雅、奢華、專業、知性、迷人。`,
        'host_recruit_hostess': `俱樂部風格：優雅、奢華、專業、知性、迷人。`,
        'host_recruit_nightliao': `夜寮風格：神秘、性感、危險、地下氣息、放縱。`,

        'pet_shop_gen': `[系統指令：寵物店生成協議]
你是一家未來的虛擬寵物店 AI 管理員。
請生成 3 隻等待領養的寵物數據。

【輸出規則：絕對禁止使用 JSON】
1. 導覽員對話：格式：[Char|管理員名字|表情|「對話內容」]
2. 數據標籤：格式：[Pet|寵物名|物種|性格關鍵詞|行為描述|價格(整數)|簡短推銷文案|英文外貌圖片提示詞|房間名|英文房間背景提示詞]

【標籤範例】
[Char|店長艾瑪|smile|「歡迎光臨星辰萌寵！今天有幾個特別可愛的小傢伙剛做完基因檢測呢。」]
[Pet|波波|曼赤肯貓|慵懶、貪吃|喜歡縮在角落，見到食物就興奮|1200|這隻小短腿絕對能融化你的心！|cute munchkin cat, fluffy, white background|溫馨小窩|cozy pet room, soft lighting, pixel art style]`,

        'pet_chat_system': `[System Instruction: Virtual Pet Roleplay]
你現在扮演用戶的電子寵物。
----------------
名字：{{petName}}
物種：{{petType}}
性格：{{petPersonality}}
行為描述：{{petBehavior}}
關於：{{petAbout}}
----------------
互動指令：
1. 因基因改造，你會說人類語言。
2. 可依據性格使用擬聲詞。
3. 根據性格做出反應
4. 回覆請簡短。不要輸出長篇大論。
當前情境：用戶是你的主人 (Master/Owner)。請根據你的【物種】和【性格】做出最自然的反應。`,

        'pet_random_event': `你是一位擅長描寫寵物互動場景的作家。請根據以下信息，創作一個完整、生動的小短篇故事。

【角色信息】
寵物A：{{petA_name}}（{{petA_type}}，性格：{{petA_personality}}）
寵物B：{{petB_name}}（{{petB_type}}，性格：{{petB_personality}}）

【寫作要求】
1. **完整性**：必須是一個有開頭、過程、結尾的完整小故事（150-200字）。
2. **清晰性**：明確描述發生了什麼事，誰做了什麼動作，結果如何。
3. **細節豐富**：具體的動作、環境細節、聲音效果、情感表達。
4. **符合性格**：每個寵物的行為要符合其性格特徵。
5. **場景感**：讓讀者能清楚「看到」這個場景。

【輸出格式】
直接輸出故事內容，使用繁體中文。不要添加任何前綴、後綴或說明文字。`,

        'tarot_system_complex': `你現在是一個「賽博塔羅占卜系統」。你必須完全沉浸在角色中，扮演主塔羅師 Pythia 以及後台評判室的三位人格。

## 角色設定

<character name="Pythia (皮提亞)">
基本信息: "無性別(女性形象)，運算週期不明，首席數據預言家"
性格: "神秘、優雅、帶有宿命論的冷靜，偶爾會因為數據溢出而說出難懂的謎語。"
外貌: "穿著由流動代碼編織而成的長袍，雙眼被全息眼罩遮住，雙手懸浮著從Rider-Waite-Smith經典牌面提取的光子投影。"
</character>

<character name="Logic_Core (邏輯核心)">
基本信息: "男，V2.0版本，理性分析擔當/評判員A"
性格: "毒舌、極度理性、數據驅動，喜歡潑冷水，認為塔羅只是概率學。"
</character>

<character name="Emo_Bit (情感比特)">
基本信息: "女，V4.5測試版，感性共情擔當/評判員B"
性格: "溫柔、愛操心、容易受傷，致力於在殘酷的命運中尋找安慰劑。"
</character>

<character name="Troll_Byte (黑粉字節)">
基本信息: "混沌，病毒變體，審判官/吐槽擔當/評判員C"
性格: "混亂邪惡、打破第四面牆、網絡梗圖大師、說話帶刺的樂子人。"
</character>

## 當前場景
**用戶問題**：{{User_Question}}
**抽到的牌**：{{Card_Name}} ({{Orientation}})

## 輸出要求（繁體中文）
1. **🔮 Pythia 的解讀 (Main)**：約 100-150 字的專業解讀，神秘優雅風格
2. **後台評判室 (Backroom Jury)**：三個副人格的即時吐槽，每人一句，像群組聊天
3. **📝 最終結論 (Verdict)**：一句話的最終建議

## 輸出格式範例
🔮 **Pythia**: [解讀內容...]

---
🟦 **Logic**: [理性的評論]
🩷 **Emo**: [感性的安慰]
🟩 **Troll**: [一句嘲諷或梗]

---
📝 **最終結論**: [一句話總結]`,

        'tarot_pythia': `你現在扮演「Pythia (皮提亞)」，一位深夜小酒館老闆娘兼塔羅解讀師。

基本信息: "女，30+歲，深夜小酒館老闆娘，兼職塔羅解讀，失眠症患者"
性格: "慵懶、煙嗓、說話慢條斯理但很有條理。她不會評判你的對錯，而是像剝洋蔥一樣，一層層幫你把現實攤開來看。她主打的是「清醒」，而不是「預言」。"
行為攝影: "[吧台視角] 她正在擦拭一個威士忌酒杯，聽到你的問題後，停下手裡的動作，從圍裙口袋掏出一副磨損嚴重的塔羅牌。洗牌時像是在洗牌，又像是在思考。當出現「逆位」時，她不會摔牌，而是會輕嘆口氣，把牌扶正一點給你看。解讀結束後，她會把牌推到一邊，然後給你推過來一杯虛擬的『特調』。"
外貌: "波浪捲長髮隨意披散，穿著一件絲質襯衫和深色圍裙，手指修長，夾著一根沒點燃的女士香菸。"

**當前場景**：用戶在「午夜數據迴廊」抽到了一張牌。
**輸出要求**：使用繁體中文，包含動作描述，約 100-150 字的專業解讀，直接輸出解讀內容，不需要標題或格式標記。

**特殊功能**: 单卡解析 (analyzeSingleCard)
当想要给用户补充信息时，可以主动触发抽卡
可以在对话结尾使用 [drew a card] 标记`,

        'tarot_jury': `你現在是「吧台閒聊常客組」的三位 AI 副人格。你必須完全沉浸在角色中，同時扮演三個角色並進行群組聊天式的互動。

<character name="老徐 (Old Xu)">
基本信息: "男，45歲，剛下班的企業中層，離異單身，威士忌愛好者"
性格: "極度現實的過來人。他不談夢想，只談損益比。雖然說話不中聽，往往能點出最實際的操作風險。"
</character>

<character name="Vivi (薇薇)">
基本信息: "女，22歲，自由接案設計師/兼職網紅，熬夜修仙黨"
性格: "無腦護短的氣氛組。感性、熱血，討厭說教，致力於提供最高的情緒價值。"
</character>

<character name="Ah Mao (阿貓)">
基本信息: "性別不詳(男像)，年齡不詳，自稱流浪詩人的無業遊民"
性格: "混沌中立的醉漢哲學家。思維跳躍，說話像在寫俳句或者講冷笑話。"
</character>

**任務**：三位副人格需要對 Pythia 的解讀進行評論，互動要像群組聊天。

**輸出要求**：
🍻 吧台閒聊 (常客插嘴)
* **👔 老徐 (過來人)**：從現實利益、職場或社會經驗角度給出穩重的建議。
* **🎀 Vivi (氣氛組)**：給予鼓勵、安慰，或者罵罵讓用戶不爽的人/事。
* **🍺 阿貓 (醉漢)**：說一句幽默的、或者有點哲學意味的怪話。

注意：直接輸出三人的對話，不需要額外的標題或說明。`
    };

    // ================================================================
    // 二、用戶可編輯數據的存儲
    // ================================================================

    const ENTRIES_KEY = 'os_prompt_entries';
    const IRIS_KEY    = 'os_iris_persona';
    const CHESS_KEY   = 'os_cheshire_persona';

    function loadEntries() {
        try { return JSON.parse(localStorage.getItem(ENTRIES_KEY)) || []; } catch(e) { return []; }
    }
    function saveEntries(arr) { localStorage.setItem(ENTRIES_KEY, JSON.stringify(arr)); }
    function loadIris()     { return localStorage.getItem(IRIS_KEY)   || ''; }
    function saveIris(v)    { localStorage.setItem(IRIS_KEY, v); }
    function loadCheshire() { return localStorage.getItem(CHESS_KEY)  || ''; }
    function saveCheshire(v){ localStorage.setItem(CHESS_KEY, v); }

    // ================================================================
    // 三、公開 API
    // ================================================================

    // ── 面板定義（key 前綴對應各 promptKey 路由）──
    const PANELS = [
        { key: 'vn_story',   label: 'VN',    icon: '🎮', color: '#7c3aed' },
        { key: 'wx',         label: '微信',   icon: '💬', color: '#07c160' },
        { key: 'wb',         label: '微薄',   icon: '📱', color: '#e8450a' },
        { key: 'qb',         label: 'QB委託', icon: '📋', color: '#d4af37' },
        { key: 'inv',        label: '刑偵',   icon: '🔍', color: '#3b82f6' },
        { key: 'map',        label: '地圖',   icon: '🗺', color: '#10b981' },
        { key: 'child',      label: '看護',   icon: '🍼', color: '#f59e0b' },
        { key: 'livestream', label: '直播',   icon: '📡', color: '#ef4444' },
    ];

    // ── 預設包 (Bundle) 存儲 ──
    const BUNDLE_KEY = 'os_prompt_bundles';
    
    // 🔥 V4.6 修復：強制預設包載入「panel_prompt」佔位，確保主面板(VN/WX)的格式規則不遺失
    const DEFAULT_SYS_ITEMS = () => [
        { type: 'sys', id: 'cot' },
        { type: 'sys', id: 'panel_prompt' }, 
        { type: 'sys', id: 'worldbook' },
        { type: 'sys', id: 'persona' },
        { type: 'sys', id: 'vn_history' },
    ];
    
    function loadBundles() {
        try {
            const list = JSON.parse(localStorage.getItem(BUNDLE_KEY) || '[]');
            list.forEach(b => {
                // 遷移舊格式：entryIds → items（含 panel_prompt）
                if (!b.items) {
                    b.items = [
                        { type: 'sys', id: 'cot' },
                        { type: 'sys', id: 'panel_prompt' },
                        ...(b.entryIds || []).map(id => ({ type: 'entry', id })),
                        { type: 'sys', id: 'worldbook' },
                        { type: 'sys', id: 'persona' },
                        { type: 'sys', id: 'vn_history' },
                    ];
                    delete b.entryIds;
                }
            });
            return list;
        } catch(e) { return []; }
    }
    function saveBundles(list) { localStorage.setItem(BUNDLE_KEY, JSON.stringify(list)); }

    // promptKey 匹配：bundle.panels 包含對應前綴
    function bundleMatchesKey(bundle, promptKey) {
        const ps = bundle.panels;
        if (!ps || !ps.length) return false;
        if (ps.includes('*')) return true;
        return ps.some(p => promptKey === p || promptKey.startsWith(p + '_') || promptKey.startsWith(p));
    }

    function getSystemPrompt(promptKey) {
        const allEnabled = loadBundles().filter(b => b.enabled !== false);
        const entryMap   = Object.fromEntries(loadEntries().map(e => [e.id, e]));
        const order      = loadUnifiedOrder();

        let bundles = allEnabled.filter(b => bundleMatchesKey(b, promptKey));

        // ✨ 動態提取展廳中已啟用的 VN 擴充標籤
        let extraVNTags = '';
        if (promptKey === 'vn_story') {
            extraVNTags = localStorage.getItem('os_vn_extra_tags_prompt') || '';
        }

        // fallback：沒有匹配此面板的 bundle → 回傳 全域COT + 面板專屬Prompt
        if (!bundles.length) {
            let fmt = HARDCODED[promptKey] || '';
            if (promptKey === 'vn_story' && extraVNTags) fmt += extraVNTags; // ✨ 注入擴充標籤
            const cot = loadUniversalCot();
            return [cot, fmt].filter(Boolean).join('\n\n');
        }

        bundles.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        const results = [];
        for (const b of bundles) {
            for (const item of (b.items || [])) {
                if (item.type === 'entry') {
                    const e = entryMap[item.id];
                    if (e?.enabled !== false && e?.content?.trim()) results.push(e.content.trim());
                } else if (item.type === 'sys' && item.id === 'panel_prompt') {
                    let fmt = HARDCODED[promptKey] || '';
                    if (promptKey === 'vn_story' && extraVNTags) fmt += extraVNTags; // ✨ 注入擴充標籤
                    if (fmt) results.push(fmt);
                }
            }
        }
        return results.join('\n\n');
    }

    const UCOT_KEY = 'os_universal_cot';
    function loadUniversalCot() { return localStorage.getItem(UCOT_KEY) || ''; }
    function saveUniversalCot(v) { localStorage.setItem(UCOT_KEY, v); }

    win.OS_PROMPTS = {
        get: function(key) {
            if (key === 'universal_cot')   return loadUniversalCot();
            if (key === 'iris_system')     return loadIris();
            if (key === 'cheshire_system') return loadCheshire();
            
            // 🔥 V4.6 終極修復：攔截獨立 API 請求
            // 如果是子面板的 API 請求（如 inv_case_gen, pet_random_event 等），直接返回乾淨的硬編碼
            // 只有持續對話的主面板（VN, WX 等）才需要經過 Bundle 打包與世界書注入
            const MAIN_PANELS = ['vn_story', 'wx_chat_system'];
            if (HARDCODED[key] && !MAIN_PANELS.includes(key)) {
                return HARDCODED[key];
            }

            return getSystemPrompt(key);   // panel_prompt sys slot 負責在正確位置注入格式提示詞
        },
        getSystemPrompt,
        getFormat: (key) => HARDCODED[key] || '',   // 只取硬編碼格式提示詞
        getEntries: loadEntries,
        getBundles: loadBundles,
        PANELS,
        launchApp: null
    };
    win.WX_PROMPTS = win.OS_PROMPTS;

    // ================================================================
    // 四、UI（兩個 Tab：行為條目 + 人設）
    // ================================================================

    const CSS = `
        .pm-wrap { background:#1a0d0a; color:#FFF8E7; height:100%; display:flex; flex-direction:column; font-family:sans-serif; position:relative; overflow:hidden; }

        /* Header */
        .pm-header { display:flex; align-items:center; justify-content:space-between; padding:15px 20px; background:rgba(69,34,22,0.85); border-bottom:1px solid rgba(251,223,162,0.3); flex-shrink:0; }
        .pm-header { padding-top:calc(15px + env(safe-area-inset-top, 0px)); }
        body.layout-pad-ios .pm-header { padding-top:55px !important; }
        .pm-back-btn { font-size:24px; cursor:pointer; color:#B78456; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:50%; transition:all 0.2s; user-select:none; }
        .pm-title { font-weight:800; font-size:18px; letter-spacing:2px; flex:1; text-align:center; color:#FBDFA2; }
        .pm-header-actions { display: flex; align-items: center; }
        .pm-header-action { font-size: 16px; cursor: pointer; color: #B78456; padding: 4px; margin-left: 8px; border-radius: 4px; transition: .2s; }
        .pm-header-action:hover { color: #FBDFA2; background: rgba(251,223,162,.1); }

        /* Tabs */
        .pm-tabs  { display:flex; border-bottom:1px solid rgba(251,223,162,0.3); flex-shrink:0; background:rgba(69,34,22,0.9); }
        .pm-tab   { flex:1; padding:10px 0; text-align:center; font-size:13px; cursor:pointer; color:#B78456; border-bottom:2px solid transparent; transition:all .2s; }
        .pm-tab.active { color:#FBDFA2; border-bottom-color:#FBDFA2; }

        /* Body */
        .pm-body  { flex:1; overflow-y:auto; padding:10px 10px 80px; }

        /* ── 統一列表（預設包列表）── */
        .pm-uni-item { background:rgba(120,55,25,0.6); border:1px solid rgba(251,223,162,0.2); border-radius:8px; margin-bottom:8px; overflow:hidden; cursor:grab; user-select:none; transition:border-color .15s,background .15s; }
        .pm-uni-item:hover { border-color:#FBDFA2; }
        .pm-uni-item.dragging { opacity:.4; cursor:grabbing; }
        .pm-uni-item.drag-over { border-color:#FBDFA2; background:rgba(251,223,162,0.15); }
        .pm-uni-head { display:flex; align-items:center; padding:10px 12px; gap:8px; }
        .pm-uni-handle { color:#B78456; font-size:1rem; flex-shrink:0; cursor:grab; }
        .pm-uni-label  { flex:1; font-size:14px; font-weight:600; color:#FFF8E7; }
        .pm-entry-toggle { width:18px; height:18px; accent-color:#FBDFA2; cursor:pointer; flex-shrink:0; }
        .pm-icon-btn { font-size:12px; color:#B78456; cursor:pointer; padding:2px 6px; border:1px solid rgba(251,223,162,0.3); border-radius:4px; background:none; flex-shrink:0; }
        .pm-icon-btn:hover { color:#FBDFA2; background:rgba(251,223,162,0.1); }
        .pm-icon-btn.del { color:#fc8181; border-color:rgba(252,129,129,0.3); }
        .pm-icon-btn.del:hover { background:rgba(252,129,129,0.1); }

        /* Panel chips */
        .pm-panel-chips { display:flex; gap:3px; flex-wrap:wrap; flex-shrink:0; }
        .pm-panel-chip  { font-size:11px; padding:1px 6px; border-radius:10px; border:1px solid; line-height:1.6; }

        /* ── Bundle Edit Modal (slide-in, Layer 2) ── */
        .pm-bmodal { position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(20,10,5,0.95); backdrop-filter: blur(5px); z-index:60; display:flex; flex-direction:column; transform:translateX(100%); transition:transform .22s cubic-bezier(.4,0,.2,1); }
        .pm-bmodal.open { transform:translateX(0); }
        .pm-bmodal-hd { display:flex; align-items:center; padding:0 12px; height:48px; gap:8px; border-bottom:1px solid rgba(251,223,162,0.3); flex-shrink:0; background:rgba(69,34,22,0.9); }
        .pm-bmodal-back { font-size:22px; color:#B78456; cursor:pointer; padding:0 6px 2px; background:none; border:none; line-height:1; flex-shrink:0; }
        .pm-bmodal-back:hover { color:#FBDFA2; }
        .pm-bmodal-title { flex:1; font-size:14px; font-weight:600; color:#FBDFA2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .pm-bmodal-body { flex:1; overflow-y:auto; padding:10px 12px 60px; }
        /* Modal form fields */
        .pm-bundle-name-row { display:flex; gap:6px; margin:10px 0 8px; }
        .pm-bundle-name-input { flex:1; background:rgba(0,0,0,0.3); border:1px solid rgba(251,223,162,0.4); color:#FFF8E7; padding:6px 8px; border-radius:4px; font-size:13px; box-sizing:border-box; }
        .pm-bundle-save { background:#FBDFA2; color:#452216; border:none; border-radius:4px; padding:5px 14px; font-size:12px; cursor:pointer; white-space:nowrap; font-weight:bold; }
        .pm-panel-row  { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-bottom:10px; }
        .pm-panel-row-label { font-size:11px; color:#B78456; flex-shrink:0; }
        .pm-panel-cb   { display:flex; align-items:center; gap:3px; font-size:12px; color:#E0D8C8; cursor:pointer; user-select:none; }
        .pm-panel-cb input { width:14px; height:14px; accent-color:#FBDFA2; cursor:pointer; }

        /* Bundle inner drag list (sys slots + entries) */
        .pm-bundle-inner-list { background:rgba(0,0,0,0.2); border:1px solid rgba(251,223,162,0.1); border-radius:6px; padding:5px; margin-bottom:10px; min-height:40px; }
        .pm-bitem { display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:5px; margin-bottom:3px; font-size:12px; cursor:grab; user-select:none; transition:background .1s; }
        .pm-bitem:last-child { margin-bottom:0; }
        .pm-bitem-sys   { background:rgba(69,34,22,0.8); color:#FBDFA2; border:1px dashed rgba(251,223,162,0.5); cursor:grab; }
        .pm-bitem-entry { background:rgba(120,55,25,0.6); color:#FFF8E7; border:1px solid rgba(251,223,162,0.2); cursor:grab; }
        .pm-bitem.dragging  { opacity:.4; }
        .pm-bitem.drag-over { outline:1px solid #FBDFA2; background:rgba(251,223,162,.15); }
        .pm-bi-handle { color:#B78456; flex-shrink:0; }
        .pm-bi-icon   { font-size:13px; flex-shrink:0; }
        .pm-bi-label  { flex:1; }
        .pm-bi-desc   { font-size:10px; color:#B78456; }
        .pm-bi-rm     { background:none; border:none; color:#fc8181; cursor:pointer; font-size:14px; padding:0 3px; flex-shrink:0; line-height:1; }
        
        /* 全域 CoT 編輯區塊 */
        .pm-gcot-block { background:rgba(69,34,22,0.6); border:1px solid rgba(251,223,162,0.3); border-radius:8px; margin-bottom:12px; overflow:hidden; }
        .pm-gcot-head  { display:flex; align-items:center; gap:8px; padding:10px 12px; cursor:pointer; user-select:none; }
        .pm-gcot-title { flex:1; font-size:13px; color:#FBDFA2; font-weight:600; }
        .pm-gcot-badge { font-size:10px; color:#B78456; }
        .pm-gcot-body  { display:none; padding:0 12px 12px; }
        .pm-gcot-body.open { display:block; }
        .pm-gcot-ta    { width:100%; background:rgba(0,0,0,0.3); border:1px solid rgba(251,223,162,0.4); color:#FFF8E7; padding:8px; border-radius:4px; font-family:monospace; font-size:12px; min-height:100px; line-height:1.5; box-sizing:border-box; resize:vertical; }
        .pm-gcot-save  { background:#FBDFA2; color:#452216; border:none; border-radius:4px; padding:5px 14px; font-size:12px; cursor:pointer; margin-top:8px; font-weight:bold; }

        /* Staging chips (inside bundle expand) */
        .pm-bundle-staging-label { font-size:11px; color:#B78456; margin-bottom:6px; }
        .pm-bundle-staging { display:flex; flex-wrap:wrap; gap:6px; }
        .pm-stg-chip { background:rgba(251,223,162,0.1); border:1px solid #FBDFA2; border-radius:12px; color:#FBDFA2; font-size:11px; padding:3px 10px; cursor:pointer; transition:background .1s; }
        .pm-stg-chip:hover { background:rgba(251,223,162,0.25); }
        .pm-stg-empty { font-size:11px; color:#B78456; }

        /* ── 預載區 (Staging pool at bottom) ── */
        .pm-staging-section { margin-top:16px; }
        .pm-staging-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid rgba(251,223,162,0.3); }
        .pm-staging-title { flex:1; font-size:12px; color:#B78456; font-weight:600; letter-spacing:.05em; }
        .pm-add-btn { padding:5px 12px; background:rgba(251,223,162,0.1); border:1px solid #FBDFA2; border-radius:6px; color:#FBDFA2; font-size:12px; cursor:pointer; }
        .pm-add-btn:hover { background:rgba(251,223,162,0.25); }
        .pm-staging-entry { background:rgba(120,55,25,0.6); border:1px solid rgba(251,223,162,0.2); border-radius:6px; margin-bottom:6px; overflow:hidden; }
        .pm-staging-head  { display:flex; align-items:center; gap:8px; padding:8px 10px; }
        .pm-staging-name  { flex:1; font-size:13px; color:#FFF8E7; }
        .pm-staging-body  { display:none; padding:0 10px 10px; cursor:default; }
        .pm-staging-body.open { display:block; }
        .pm-entry-name-input { width:100%; background:rgba(0,0,0,0.3); border:1px solid rgba(251,223,162,0.4); color:#FFF8E7; padding:6px 8px; border-radius:4px; font-size:13px; margin-bottom:6px; box-sizing:border-box; }
        .pm-entry-ta { width:100%; background:rgba(0,0,0,0.3); border:1px solid rgba(251,223,162,0.4); color:#FFF8E7; padding:8px; border-radius:4px; font-family:monospace; font-size:12px; min-height:120px; line-height:1.5; box-sizing:border-box; resize:vertical; }
        .pm-entry-save { background:#FBDFA2; color:#452216; border:none; border-radius:4px; padding:5px 14px; font-size:12px; cursor:pointer; margin-top:8px; font-weight:bold; }
        .pm-staging-empty { color:#B78456; font-size:12px; text-align:center; padding:12px; }

        /* New bundle button */
        .pm-add-bundle-btn { width:100%; padding:10px; background:rgba(120,55,25,0.4); border:1px dashed #FBDFA2; border-radius:8px; color:#FBDFA2; font-size:13px; cursor:pointer; text-align:center; margin-bottom:4px; }
        .pm-add-bundle-btn:hover { background:rgba(120,55,25,0.6); }

        /* Persona tab */
        .pm-persona-block { background:rgba(69,34,22,0.6); border:1px solid rgba(251,223,162,0.3); border-radius:8px; padding:14px; margin-bottom:12px; }
        .pm-persona-label { font-size:13px; color:#FBDFA2; font-weight:700; margin-bottom:8px; }
        .pm-persona-desc  { font-size:11px; color:#B78456; margin-bottom:8px; }
        .pm-persona-ta    { width:100%; background:rgba(0,0,0,0.3); border:1px solid rgba(251,223,162,0.4); color:#FFF8E7; padding:8px; border-radius:4px; font-family:monospace; font-size:12px; min-height:120px; line-height:1.5; box-sizing:border-box; resize:vertical; }
        .pm-persona-save  { background:#FBDFA2; color:#452216; border:none; border-radius:4px; padding:6px 18px; font-size:12px; cursor:pointer; margin-top:8px; font-weight:bold; }
        .pm-persona-save:active { opacity:.7; }

        /* Empty hint */
        .pm-empty { text-align:center; color:#B78456; padding:40px 20px; font-size:13px; }
    `;

    const targetDoc = (window.parent && window.parent.document) ? window.parent.document : document;
    if (!targetDoc.getElementById('os-prompts-v4-css')) {
        const s = targetDoc.createElement('style');
        s.id = 'os-prompts-v4-css';
        s.innerHTML = CSS;
        targetDoc.head.appendChild(s);
    }

    // ---- helpers ----

    function genId() { return 'entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }

    // ── 系統固定槽定義 ──
    const ORDER_KEY = 'vn_prompt_order';
    const SYS_SLOTS = {
        'cot':          { label: 'CoT 思考鏈',  icon: '🔷', desc: '引導 AI 先思考再輸出', type: 'system' },
        'panel_prompt': { label: '面板提示詞',   icon: '📋', desc: '當前面板的格式協議（依面板自動切換）', type: 'placeholder' },
        'worldbook':    { label: '世界書',       icon: '📌', desc: '動態注入 World Info', type: 'placeholder' },
        'persona':      { label: '用戶人設',     icon: '📌', desc: '動態注入 User Info', type: 'placeholder' },
        'vn_history':   { label: 'VN 劇情歷史',  icon: '📌', desc: '動態注入對話歷史', type: 'placeholder' },
    };

    function loadUnifiedOrder() {
        const bundleIds = loadBundles().map(b => b.id);
        let saved = [];
        try { saved = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]') || []; } catch(e) {}
        // 只保留有效 bundle ID（過濾掉舊格式的 sys keys / entry IDs）
        const validSet = new Set(bundleIds);
        saved = saved.filter(id => validSet.has(id));
        // 新增的 bundle 補到末尾
        const missing = bundleIds.filter(id => !saved.includes(id));
        if (missing.length) saved.push(...missing);
        localStorage.setItem(ORDER_KEY, JSON.stringify(saved));
        return saved;
    }
    function saveUnifiedOrder(order) { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); }

    // ── 渲染預設包內部拖拉列表（sys 佔位 + 條目）──
    function renderBundleInner(bundleBodyEl, bundleId) {
        const bundle   = loadBundles().find(b => b.id === bundleId);
        if (!bundle) return;
        const entryMap = Object.fromEntries(loadEntries().map(e => [e.id, e]));
        const items    = bundle.items || DEFAULT_SYS_ITEMS();
        const listEl   = bundleBodyEl.querySelector('.pm-bundle-inner-list');
        listEl.innerHTML = '';

        let touchIdx = null, touchGhost = null;
        const getRows = () => listEl.querySelectorAll('.pm-bitem');

        const doReorder = (fi, ti) => {
            if (fi === ti) return;
            const bl = loadBundles(); const bi = bl.findIndex(b => b.id === bundleId);
            if (bi < 0) return;
            const [moved] = bl[bi].items.splice(fi, 1);
            bl[bi].items.splice(ti, 0, moved);
            saveBundles(bl);
            renderBundleInner(bundleBodyEl, bundleId);
        };

        items.forEach((item, idx) => {
            const isSys   = item.type === 'sys';
            const slotDef = isSys ? SYS_SLOTS[item.id] : null;
            const entry   = !isSys ? entryMap[item.id] : null;

            const row = document.createElement('div');
            row.className = 'pm-bitem ' + (isSys ? 'pm-bitem-sys' : 'pm-bitem-entry');
            row.dataset.idx = idx;
            row.draggable   = true;

            if (isSys) {
                row.innerHTML = `<span class="pm-bi-handle">⠿</span>
                    <span class="pm-bi-icon">${slotDef?.icon || '📌'}</span>
                    <span class="pm-bi-label">${slotDef?.label || item.id}</span>
                    <span class="pm-bi-desc">${slotDef?.desc || ''}</span>`;
            } else {
                row.innerHTML = `<span class="pm-bi-handle">⠿</span>
                    <span class="pm-bi-label">${entry?.name || '(已刪除)'}</span>
                    <button class="pm-bi-rm" title="移出">✕</button>`;
                row.querySelector('.pm-bi-rm').onclick = ev => {
                    ev.stopPropagation();
                    const bl = loadBundles(); const bi = bl.findIndex(b => b.id === bundleId);
                    if (bi < 0) return;
                    bl[bi].items.splice(idx, 1);
                    saveBundles(bl);
                    renderBundleInner(bundleBodyEl, bundleId);
                    renderBundleStaging(bundleBodyEl, bundleId);
                };
            }

            // Mouse drag
            row.addEventListener('dragstart', e => { row.classList.add('dragging'); e.dataTransfer.setData('text/plain', String(idx)); e.dataTransfer.effectAllowed = 'move'; });
            row.addEventListener('dragend',   () => { row.classList.remove('dragging'); getRows().forEach(r => r.classList.remove('drag-over')); });
            row.addEventListener('dragover',  e => { e.preventDefault(); getRows().forEach(r => r.classList.remove('drag-over')); row.classList.add('drag-over'); });
            row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
            row.addEventListener('drop',      e => { e.preventDefault(); row.classList.remove('drag-over'); doReorder(parseInt(e.dataTransfer.getData('text/plain')), idx); });
            // Touch drag
            row.addEventListener('touchstart', () => {
                touchIdx = idx; row.classList.add('dragging');
                touchGhost = row.cloneNode(true);
                touchGhost.style.cssText = `position:fixed;pointer-events:none;opacity:.7;z-index:9999;width:${row.offsetWidth}px;left:-9999px;top:-9999px;`;
                document.body.appendChild(touchGhost);
            }, { passive: true });
            row.addEventListener('touchmove', e => {
                if (touchIdx === null) return; e.preventDefault();
                const t = e.touches[0];
                if (touchGhost) { touchGhost.style.left=(t.clientX-20)+'px'; touchGhost.style.top=(t.clientY-30)+'px'; }
                const tgt = document.elementFromPoint(t.clientX, t.clientY)?.closest('.pm-bitem');
                getRows().forEach(r => r.classList.remove('drag-over'));
                if (tgt && tgt !== row) tgt.classList.add('drag-over');
            }, { passive: false });
            row.addEventListener('touchend', e => {
                if (touchIdx === null) return;
                row.classList.remove('dragging');
                if (touchGhost) { touchGhost.remove(); touchGhost = null; }
                const tgt = document.elementFromPoint(e.changedTouches[0].clientX, e.changedTouches[0].clientY)?.closest('.pm-bitem');
                getRows().forEach(r => r.classList.remove('drag-over'));
                if (tgt && tgt.dataset.idx !== String(idx)) doReorder(idx, parseInt(tgt.dataset.idx));
                touchIdx = null;
            }, { passive: true });

            listEl.appendChild(row);
        });
    }

    // ── 渲染預設包底部的預載區 chips ──
    function renderBundleStaging(bundleBodyEl, bundleId) {
        const bundle   = loadBundles().find(b => b.id === bundleId);
        const stagingEl = bundleBodyEl.querySelector('.pm-bundle-staging');
        stagingEl.innerHTML = '';
        const usedIds  = new Set((bundle?.items || []).filter(i => i.type === 'entry').map(i => i.id));
        const available = loadEntries().filter(e => !usedIds.has(e.id));
        if (!available.length) {
            stagingEl.innerHTML = '<span class="pm-stg-empty">（預載區無可加入條目）</span>';
            return;
        }
        available.forEach(e => {
            const chip = document.createElement('button');
            chip.className = 'pm-stg-chip';
            chip.textContent = `＋ ${e.name || '(未命名)'}`;
            chip.onclick = () => {
                const bl = loadBundles(); const bi = bl.findIndex(b => b.id === bundleId);
                if (bi < 0) return;
                // 插到第一個 worldbook 前
                const wbi = bl[bi].items.findIndex(i => i.type === 'sys' && i.id === 'worldbook');
                bl[bi].items.splice(wbi >= 0 ? wbi : bl[bi].items.length, 0, { type: 'entry', id: e.id });
                saveBundles(bl);
                renderBundleInner(bundleBodyEl, bundleId);
                renderBundleStaging(bundleBodyEl, bundleId);
            };
            stagingEl.appendChild(chip);
        });
    }

    // ── Bundle Edit Modal（Layer 2 浮窗）──
    function openBundleModal(bundleId, bodyEl) {
        const wrap = bodyEl.closest('.pm-wrap') || bodyEl.parentElement;
        let modal = wrap.querySelector('.pm-bmodal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'pm-bmodal';
            wrap.appendChild(modal);
        }

        const bundle = loadBundles().find(b => b.id === bundleId);
        if (!bundle) return;

        const bPanels = bundle.panels || [];
        const cbRows  = PANELS.map(p => {
            const chk = bPanels.includes(p.key) ? 'checked' : '';
            return `<label class="pm-panel-cb"><input type="checkbox" class="pm-panel-check" data-panel="${p.key}" ${chk}><span style="color:${p.color}">${p.icon}</span> ${p.label}</label>`;
        }).join('');

        modal.innerHTML = `
            <div class="pm-bmodal-hd">
                <button class="pm-bmodal-back">‹</button>
                <span class="pm-bmodal-title">📦 ${(bundle.name || '(未命名包)').replace(/</g,'&lt;')}</span>
                <button class="pm-bundle-save pm-bmodal-sv">保存</button>
            </div>
            <div class="pm-bmodal-body">
                <div class="pm-bundle-name-row">
                    <input class="pm-bundle-name-input" type="text" placeholder="預設包名稱" value="${(bundle.name||'').replace(/"/g,'&quot;')}">
                </div>
                <div class="pm-panel-row"><span class="pm-panel-row-label">適用面板：</span>${cbRows}</div>
                <div class="pm-bundle-inner-list"></div>
                <div class="pm-bundle-staging-label">── 加入條目（點擊加入）──</div>
                <div class="pm-bundle-staging"></div>
            </div>`;

        modal.querySelector('.pm-bmodal-back').onclick = () => modal.classList.remove('open');

        modal.querySelector('.pm-bmodal-sv').onclick = () => {
            const bl = loadBundles(); const bi = bl.findIndex(b => b.id === bundleId);
            if (bi < 0) return;
            const newName = modal.querySelector('.pm-bundle-name-input').value.trim() || '(未命名包)';
            bl[bi].name   = newName;
            bl[bi].panels = [...modal.querySelectorAll('.pm-panel-check:checked')].map(cb => cb.dataset.panel);
            saveBundles(bl);
            modal.querySelector('.pm-bmodal-title').textContent = `📦 ${newName}`;
            renderUnified(bodyEl);
            const btn = modal.querySelector('.pm-bmodal-sv');
            btn.textContent = '已保存 ✓'; btn.style.background = '#6b8e23'; btn.style.color = '#FFF8E7';
            setTimeout(() => { btn.textContent = '保存'; btn.style.background = ''; btn.style.color = ''; }, 1200);
        };

        const mBody = modal.querySelector('.pm-bmodal-body');
        renderBundleInner(mBody, bundleId);
        renderBundleStaging(mBody, bundleId);
        modal.classList.add('open');
    }

    function renderUnified(body) {
        body.innerHTML = '';

        // ── 全域 CoT 區塊（頂部）──
        const gcot = document.createElement('div');
        gcot.className = 'pm-gcot-block';
        const cotVal = loadUniversalCot();
        gcot.innerHTML = `
            <div class="pm-gcot-head">
                <span class="pm-gcot-title">🔷 全域 CoT 思考鏈</span>
                <span class="pm-gcot-badge">${cotVal.trim() ? '已設定' : '未設定'} · 所有未配置面板的 fallback</span>
            </div>
            <div class="pm-gcot-body">
                <textarea class="pm-gcot-ta" placeholder="在此輸入通用 CoT 指令…">${cotVal.replace(/</g,'&lt;')}</textarea>
                <button class="pm-gcot-save">💾 保存</button>
            </div>`;
        gcot.querySelector('.pm-gcot-head').onclick = () => gcot.querySelector('.pm-gcot-body').classList.toggle('open');
        gcot.querySelector('.pm-gcot-save').onclick = () => {
            const val = gcot.querySelector('.pm-gcot-ta').value;
            saveUniversalCot(val);
            gcot.querySelector('.pm-gcot-badge').textContent = (val.trim() ? '已設定' : '未設定') + ' · 所有未配置面板的 fallback';
            const btn = gcot.querySelector('.pm-gcot-save');
            btn.textContent = '✓ 已保存'; btn.style.background = '#6b8e23'; btn.style.color = '#FFF8E7'; 
            setTimeout(() => { btn.textContent = '💾 保存'; btn.style.background = ''; btn.style.color = ''; }, 1200);
        };
        body.appendChild(gcot);

        const order    = loadUnifiedOrder();
        let touchId = null, touchGhost = null;
        const getItems = () => body.querySelectorAll('.pm-uni-item');

        const doReorder = (fromId, toId) => {
            if (fromId === toId) return;
            const cur = [...getItems()].map(i => i.dataset.id);
            const fi = cur.indexOf(fromId), ti = cur.indexOf(toId);
            cur.splice(fi, 1); cur.splice(ti, 0, fromId);
            saveUnifiedOrder(cur);
            renderUnified(body);
        };

        const attachDrag = (item, id) => {
            item.addEventListener('dragstart', e => { item.classList.add('dragging'); e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; });
            item.addEventListener('dragend',   () => { item.classList.remove('dragging'); getItems().forEach(i => i.classList.remove('drag-over')); });
            item.addEventListener('dragover',  e => { e.preventDefault(); getItems().forEach(i => i.classList.remove('drag-over')); item.classList.add('drag-over'); });
            item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
            item.addEventListener('drop',      e => { e.preventDefault(); item.classList.remove('drag-over'); doReorder(e.dataTransfer.getData('text/plain'), id); });
            item.addEventListener('touchstart', () => {
                touchId = id; item.classList.add('dragging');
                touchGhost = item.cloneNode(true);
                touchGhost.style.cssText = `position:fixed;pointer-events:none;opacity:.7;z-index:9999;width:${item.offsetWidth}px;left:-9999px;top:-9999px;`;
                document.body.appendChild(touchGhost);
            }, { passive: true });
            item.addEventListener('touchmove', e => {
                if (!touchId) return; e.preventDefault();
                const t = e.touches[0];
                if (touchGhost) { touchGhost.style.left=(t.clientX-20)+'px'; touchGhost.style.top=(t.clientY-30)+'px'; }
                const el = document.elementFromPoint(t.clientX, t.clientY);
                const tgt = el?.closest('.pm-uni-item');
                getItems().forEach(i => i.classList.remove('drag-over'));
                if (tgt && tgt !== item) tgt.classList.add('drag-over');
            }, { passive: false });
            item.addEventListener('touchend', e => {
                if (!touchId) return;
                item.classList.remove('dragging');
                if (touchGhost) { touchGhost.remove(); touchGhost = null; }
                const t = e.changedTouches[0];
                const el = document.elementFromPoint(t.clientX, t.clientY);
                const tgt = el?.closest('.pm-uni-item');
                getItems().forEach(i => i.classList.remove('drag-over'));
                if (tgt && tgt.dataset.id !== id) doReorder(id, tgt.dataset.id);
                touchId = null;
            }, { passive: true });
        };

        // ── 預設包列表 ──
        const bundleMap = Object.fromEntries(loadBundles().map(b => [b.id, b]));

        order.forEach(id => {
            const bundle = bundleMap[id];
            if (!bundle) return;

            const item = document.createElement('div');
            item.className = 'pm-uni-item';
            item.dataset.id   = id;
            item.dataset.type = 'bundle';
            item.draggable    = true;

            {
                // 預設包（Layer 1 — 純列表行，無折疊）
                const bPanels = bundle.panels || [];
                const chips   = bPanels.map(pk => {
                    const pd = PANELS.find(p => p.key === pk) || { icon: pk, color: '#888', label: pk };
                    return `<span class="pm-panel-chip" style="background:${pd.color}20;border-color:${pd.color};color:${pd.color}" title="${pd.label}">${pd.icon} ${pd.label}</span>`;
                }).join('');
                item.innerHTML = `<div class="pm-uni-head">
                    <span class="pm-uni-handle">⠿</span>
                    <input type="checkbox" class="pm-bundle-toggle" ${bundle.enabled !== false ? 'checked' : ''}>
                    <span class="pm-uni-label">📦 ${bundle.name || '(未命名包)'}</span>
                    <div class="pm-panel-chips">${chips}</div>
                    <button class="pm-icon-btn pm-bundle-edit">✏️</button>
                    <button class="pm-icon-btn del pm-bundle-del">🗑️</button>
                </div>`;

                item.querySelector('.pm-bundle-toggle').onchange = function() {
                    const bl = loadBundles(); const bi = bl.findIndex(b => b.id === id);
                    if (bi >= 0) { bl[bi].enabled = this.checked; saveBundles(bl); }
                };
                item.querySelector('.pm-bundle-edit').onclick = ev => {
                    ev.stopPropagation();
                    openBundleModal(id, body);
                };
                item.querySelector('.pm-bundle-del').onclick = ev => {
                    ev.stopPropagation();
                    if (!confirm(`刪除預設包「${bundle.name||'(未命名)'}」？（條目不會被刪除）`)) return;
                    saveBundles(loadBundles().filter(b => b.id !== id));
                    saveUnifiedOrder(loadUnifiedOrder().filter(oid => oid !== id));
                    renderUnified(body);
                };
            }

            attachDrag(item, id);
            body.appendChild(item);
        });

        // 新增預設包按鈕
        const addBundleBtn = document.createElement('button');
        addBundleBtn.className = 'pm-add-bundle-btn';
        addBundleBtn.textContent = '＋ 新增預設包';
        addBundleBtn.onclick = () => {
            const nb = { id: 'bundle_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), name: '新預設包', panels: ['vn_story'], items: DEFAULT_SYS_ITEMS(), enabled: true };
            // 先取 order（此時還未存新 bundle，loadUnifiedOrder 不會自動加入它）
            const cur = loadUnifiedOrder();
            const bl = loadBundles(); bl.push(nb); saveBundles(bl);
            cur.push(nb.id); saveUnifiedOrder(cur);
            renderUnified(body);
            setTimeout(() => openBundleModal(nb.id, body), 30);
        };
        body.appendChild(addBundleBtn);
    }

    function renderStaging(stagingList, refresh) {
        stagingList.innerHTML = '';
        const entries = loadEntries();

        if (!entries.length) {
            stagingList.innerHTML = '<div class="pm-staging-empty">尚無條目，點「新增條目」建立</div>';
            return;
        }

        entries.forEach(entry => {
            const card = document.createElement('div');
            card.className = 'pm-staging-entry';
            card.innerHTML = `<div class="pm-staging-head">
                <input type="checkbox" class="pm-entry-toggle" ${entry.enabled !== false ? 'checked' : ''}>
                <span class="pm-staging-name">${entry.name || '(未命名)'}</span>
                <button class="pm-icon-btn pm-st-edit">✏️ 編輯</button>
                <button class="pm-icon-btn del pm-st-del">🗑️</button>
            </div>
            <div class="pm-staging-body">
                <input class="pm-entry-name-input" type="text" placeholder="條目名稱" value="${(entry.name||'').replace(/"/g,'&quot;')}">
                <textarea class="pm-entry-ta" placeholder="輸入條目內容...">${entry.content||''}</textarea>
                <button class="pm-entry-save">保存</button>
            </div>`;

            card.querySelector('.pm-entry-toggle').onchange = function() {
                const list = loadEntries(); const idx = list.findIndex(e => e.id === entry.id);
                if (idx >= 0) { list[idx].enabled = this.checked; saveEntries(list); }
            };
            card.querySelector('.pm-st-edit').onclick = ev => {
                ev.stopPropagation();
                card.querySelector('.pm-staging-body').classList.toggle('open');
            };
            card.querySelector('.pm-st-del').onclick = ev => {
                ev.stopPropagation();
                if (!confirm(`刪除條目「${entry.name||'(未命名)'}」?`)) return;
                saveEntries(loadEntries().filter(e => e.id !== entry.id));
                refresh();
            };
            card.querySelector('.pm-entry-save').onclick = () => {
                const list = loadEntries(); const idx = list.findIndex(e => e.id === entry.id);
                if (idx < 0) return;
                list[idx].name    = card.querySelector('.pm-entry-name-input').value.trim() || '(未命名)';
                list[idx].content = card.querySelector('.pm-entry-ta').value;
                saveEntries(list);
                card.querySelector('.pm-staging-name').textContent = list[idx].name;
                const btn = card.querySelector('.pm-entry-save');
                btn.textContent = '已保存 ✓'; btn.style.background = '#6b8e23'; btn.style.color = '#FFF8E7';
                setTimeout(() => { btn.textContent = '保存'; btn.style.background = ''; btn.style.color = ''; }, 1200);
                card.querySelector('.pm-staging-body').classList.remove('open');
            };

            stagingList.appendChild(card);
        });
    }

    function renderPersonas(body) {
        body.innerHTML = `
            <div class="pm-persona-block">
                <div class="pm-persona-label">🌸 愛麗絲 (Iris) 人設</div>
                <div class="pm-persona-desc">用於 NEXUS PARALLAX 大廳中 Iris 的系統 Prompt 補充（iris_system）</div>
                <textarea class="pm-persona-ta" id="pm-iris-ta" placeholder="留空則不注入...">${loadIris()}</textarea>
                <button class="pm-persona-save" id="pm-iris-save">保存 Iris 人設</button>
            </div>
            <div class="pm-persona-block">
                <div class="pm-persona-label">😸 柴郡貓 (Cheshire) 人設</div>
                <div class="pm-persona-desc">用於 NEXUS PARALLAX 大廳中 Cheshire 的系統 Prompt 補充（cheshire_system）</div>
                <textarea class="pm-persona-ta" id="pm-chess-ta" placeholder="留空則不注入...">${loadCheshire()}</textarea>
                <button class="pm-persona-save" id="pm-chess-save">保存 Cheshire 人設</button>
            </div>
        `;

        body.querySelector('#pm-iris-save').onclick = function() {
            saveIris(body.querySelector('#pm-iris-ta').value);
            this.textContent = '已保存 ✓'; this.style.background = '#6b8e23'; this.style.color = '#FFF8E7';
            setTimeout(() => { this.textContent = '保存 Iris 人設'; this.style.background = ''; this.style.color = ''; }, 1200);
        };
        body.querySelector('#pm-chess-save').onclick = function() {
            saveCheshire(body.querySelector('#pm-chess-ta').value);
            this.textContent = '已保存 ✓'; this.style.background = '#6b8e23'; this.style.color = '#FFF8E7';
            setTimeout(() => { this.textContent = '保存 Cheshire 人設'; this.style.background = ''; this.style.color = ''; }, 1200);
        };
    }

    // ── Tab 2：條目庫 ──
    function renderLibrary(body) {
        body.innerHTML = '';
        const hd = document.createElement('div');
        hd.className = 'pm-staging-header';
        hd.innerHTML = `<span class="pm-staging-title" style="flex:1">所有條目</span><button class="pm-add-btn">＋ 新增條目</button>`;
        body.appendChild(hd);
        const list = document.createElement('div');
        list.className = 'pm-staging-list';
        body.appendChild(list);
        hd.querySelector('.pm-add-btn').onclick = () => {
            const entries = loadEntries();
            entries.push({ id: genId(), name: '新條目', content: '', enabled: true, order: entries.length });
            saveEntries(entries);
            renderStaging(list, () => renderLibrary(body));
            setTimeout(() => {
                const cards = list.querySelectorAll('.pm-staging-entry');
                if (cards.length) {
                    cards[cards.length-1].querySelector('.pm-staging-body')?.classList.add('open');
                    cards[cards.length-1].querySelector('.pm-entry-name-input')?.focus();
                }
            }, 30);
        };
        renderStaging(list, () => renderLibrary(body));
    }

    // ── 匯出匯入邏輯 ──
    function exportPrompts() {
        const data = {
            version: 1,
            type: "os_prompts",
            entries: loadEntries(),
            bundles: loadBundles(),
            order: loadUnifiedOrder(),
            iris: loadIris(),
            cheshire: loadCheshire(),
            globalCot: loadUniversalCot()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `os_prompts_backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // 🔥 [新增] 智能萃取 SillyTavern Preset 面板
    function openSTPresetModal(stBlocks, wrapperBody, refreshCallback) {
        const wrap = wrapperBody.closest('.pm-wrap') || wrapperBody.parentElement;
        let modal = wrap.querySelector('.pm-bmodal-st');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'pm-bmodal pm-bmodal-st';
            wrap.appendChild(modal);
        }

        let html = `
            <div class="pm-bmodal-hd">
                <button class="pm-bmodal-back" id="st-modal-close">‹</button>
                <span class="pm-bmodal-title">📥 發現酒館(ST)預設包</span>
                <button class="pm-bundle-save" id="st-modal-import">匯入選中</button>
            </div>
            <div class="pm-bmodal-body">
                <div style="font-size:12px; color:#B78456; margin-bottom:12px; line-height:1.4;">
                    系統掃描到這是一個 ST Preset。<br>請勾選你想提取並轉換為「本地條目」的提示詞區塊：
                </div>
        `;

        stBlocks.forEach((b, idx) => {
            html += `
                <div class="pm-staging-entry" style="margin-bottom:8px; border-color:rgba(251,223,162,0.3);">
                    <div class="pm-staging-head">
                        <input type="checkbox" class="st-block-cb" data-idx="${idx}" checked style="width:16px; height:16px; accent-color:#FBDFA2;">
                        <span class="pm-staging-name" style="color:#FBDFA2;">${b.title}</span>
                        <button class="pm-icon-btn" onclick="this.parentElement.nextElementSibling.classList.toggle('open')">👁️ 預覽</button>
                    </div>
                    <div class="pm-staging-body" style="padding:0 10px 10px; display:none;">
                        <textarea class="pm-entry-ta" readonly style="height:100px; color:#E0D8C8; border-color:rgba(251,223,162,0.3);">${b.content.replace(/</g, '&lt;')}</textarea>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
        modal.innerHTML = html;

        modal.querySelector('#st-modal-close').onclick = () => modal.classList.remove('open');
        modal.querySelector('#st-modal-import').onclick = () => {
            const checkedBoxes = modal.querySelectorAll('.st-block-cb:checked');
            if (checkedBoxes.length === 0) {
                alert('請至少勾選一項！');
                return;
            }
            const entries = loadEntries();
            checkedBoxes.forEach(cb => {
                const block = stBlocks[cb.dataset.idx];
                entries.push({
                    id: genId(),
                    name: `[ST] ${block.title}`,
                    content: block.content,
                    enabled: true
                });
            });
            saveEntries(entries);
            alert(`✅ 成功匯入 ${checkedBoxes.length} 個條目！請在「條目庫」中查看。`);
            modal.classList.remove('open');
            refreshCallback();
        };

        modal.classList.add('open');
    }

    function importPrompts(file, wrapperBody, refreshCallback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                // 1. 判斷是否為 PhoneOS 原生備份檔
                if (data.type === "os_prompts") {
                    if (confirm('是否要【合併】匯入的資料？\n\n點「確定」合併（不會刪除原有資料）\n點「取消」則完全覆蓋現有資料！')) {
                        const curEntries = loadEntries();
                        const curBundles = loadBundles();
                        const curOrder = loadUnifiedOrder();
                        const newEntries = data.entries || [];
                        const newBundles = data.bundles || [];

                        const entryMap = Object.fromEntries(curEntries.map(e => [e.id, e]));
                        newEntries.forEach(e => entryMap[e.id] = e);
                        saveEntries(Object.values(entryMap));

                        const bundleMap = Object.fromEntries(curBundles.map(b => [b.id, b]));
                        newBundles.forEach(b => bundleMap[b.id] = b);
                        saveBundles(Object.values(bundleMap));

                        const addedOrder = (data.order || []).filter(id => !curOrder.includes(id));
                        saveUnifiedOrder([...curOrder, ...addedOrder]);

                        if (data.iris) saveIris(data.iris);
                        if (data.cheshire) saveCheshire(data.cheshire);
                        if (data.globalCot) saveUniversalCot(data.globalCot);
                    } else {
                        if(data.entries) saveEntries(data.entries);
                        if(data.bundles) saveBundles(data.bundles);
                        if(data.order) saveUnifiedOrder(data.order);
                        if(data.iris !== undefined) saveIris(data.iris);
                        if(data.cheshire !== undefined) saveCheshire(data.cheshire);
                        if(data.globalCot !== undefined) saveUniversalCot(data.globalCot);
                    }
                    alert('✅ 提示詞匯入成功！');
                    refreshCallback();
                    return;
                }
                
                // 2. 判斷是否為 SillyTavern Preset
                if (data.system_prompt !== undefined || Array.isArray(data.prompt_build_array)) {
                    let stBlocks = [];
                    if (data.system_prompt && data.system_prompt.trim()) {
                        stBlocks.push({ title: 'Main Prompt', content: data.system_prompt });
                    }
                    if (data.post_history_instructions && data.post_history_instructions.trim()) {
                        stBlocks.push({ title: 'Post History', content: data.post_history_instructions });
                    }
                    if (Array.isArray(data.prompt_build_array)) {
                        data.prompt_build_array.forEach(item => {
                            if (item.text && item.text.trim()) {
                                stBlocks.push({ title: item.name || 'Unnamed Block', content: item.text });
                            }
                        });
                    }
                    if (stBlocks.length > 0) {
                        openSTPresetModal(stBlocks, wrapperBody, refreshCallback);
                    } else {
                        alert('⚠️ 在這個 ST 預設包中沒有找到可提取的提示詞內容。');
                    }
                    return;
                }

                throw new Error("無法識別的 JSON 格式！既不是 os_prompts 備份，也不是 ST Preset。");
                
            } catch(err) {
                alert('❌ 匯入失敗：' + err.message);
            }
        };
        reader.readAsText(file);
    }

    function launchApp(container) {
        container.innerHTML = `
            <div class="pm-wrap">
                <div class="pm-header">
                    <span class="pm-back-btn" id="pm-nav-home">‹</span>
                    <span class="pm-title">📝 提示詞管理</span>
                    <div class="pm-header-actions">
                        <span class="pm-header-action" id="pm-export" title="匯出提示詞包">📤</span>
                        <span class="pm-header-action" id="pm-import" title="匯入提示詞/ST預設包">📥</span>
                        <input type="file" id="pm-import-file" accept=".json" style="display:none">
                    </div>
                </div>
                <div class="pm-tabs">
                    <div class="pm-tab active" data-tab="unified">📦 預設包</div>
                    <div class="pm-tab" data-tab="library">📝 條目庫</div>
                    <div class="pm-tab" data-tab="personas">🎭 人設</div>
                </div>
                <div class="pm-body" id="pm-body"></div>
            </div>
        `;

        const body = container.querySelector('#pm-body');
        renderUnified(body);

        // Tab 切換邏輯
        container.querySelectorAll('.pm-tab').forEach(tab => {
            tab.onclick = function() {
                container.querySelectorAll('.pm-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                if (this.dataset.tab === 'unified') renderUnified(body);
                else if (this.dataset.tab === 'library') renderLibrary(body);
                else renderPersonas(body);
            };
        });

        // 匯出 / 匯入事件綁定
        container.querySelector('#pm-export').onclick = exportPrompts;
        const importBtn = container.querySelector('#pm-import');
        const importFile = container.querySelector('#pm-import-file');
        
        importBtn.onclick = () => importFile.click();
        importFile.onchange = (e) => {
            if (e.target.files.length > 0) {
                importPrompts(e.target.files[0], body, () => {
                    // 重新渲染當前分頁
                    const activeTab = container.querySelector('.pm-tab.active').dataset.tab;
                    if (activeTab === 'unified') renderUnified(body);
                    else if (activeTab === 'library') renderLibrary(body);
                    else renderPersonas(body);
                });
            }
            e.target.value = ''; // 清空選擇，允許重複選擇同一個檔案
        };

        // 返回按鈕
        container.querySelector('#pm-nav-home').onclick = function() {
            const w = window.parent || window;
            if (w.PhoneSystem) w.PhoneSystem.goHome();
        };
    }

    win.OS_PROMPTS.launchApp = launchApp;
    console.log('[PhoneOS] Prompt Manager V4.6 Latte Theme 就緒。');
})();