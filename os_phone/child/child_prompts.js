// ----------------------------------------------------------------
// [檔案] child_prompts.js (V4.2 - 微場景排程升級版)
// 路徑：os_phone/child/child_prompts.js
// 職責：集中管理育兒系統的所有 AI 提示詞 (Prompt)。
// 升級：大幅優化「極速排程」的 Prompt，改為「微場景」生成，找回沉浸感！
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入育兒系統 AI 提示詞庫 (Child Prompts V4.2 微場景版)...');
    const win = window.parent || window;

    win.CHILD_PROMPTS = {
        // 1. 生成寶寶與未來推演 (加入玩家身分)
        getSetupPrompt: function(fatherName, motherName, playerRole, timeSkip, rolledGender, lore) {
            let prompt = `我們即將進行【未來篇】的時間推演與子嗣生成。
父親：【${fatherName}】
母親：【${motherName}】
玩家(User)的身分：【${playerRole}】。
時間推移：往後推移 【${timeSkip} 年】。
【強制指令】本次孩子性別已由系統隨機決定為【${rolledGender}】，gender 欄位必須填「${rolledGender}」，禁止更改。`;

            if (lore) prompt += `\n\n[世界觀與雙親設定補充]：\n${lore}`;

            prompt += `\n\n【⚠️ ABO 世界觀優先邏輯（若設定中含有 ABO 請嚴格遵守）】：
如果世界觀或雙親設定中包含 ABO 體系（Alpha / Beta / Omega），請使用以下邏輯判斷生育方式，禁止單純依照生理性別或角色的性別欄位決定：
- Omega（無論生理性別為男或女）具備孕育能力，是「懷孕方」。
- Alpha（無論生理性別為男或女）不具備孕育能力，是「提供方」。
- Omega：天生高受孕體質，無論生理性別男女皆可自然懷孕，是最容易生育的第二性。
- Beta（數量最多的第二性）：生理女性 Beta 可正常懷孕；生理男性 Beta 也具備懷孕能力，但受孕率較低、較難懷上，並非不可能，在 originStory 中可描寫為不易受孕的艱辛過程或意外驚喜。
- Alpha：不具備孕育能力，為提供方。

各組合邏輯：
- AO（Alpha + Omega）：最自然的生育組合，Omega 為懷孕方，受孕率高。
- BO（Beta + Omega）：Omega 為懷孕方，受孕率高。
- AB（Alpha + 生理女 Beta）：Beta 女為懷孕方，正常受孕。
- AB（Alpha + 生理男 Beta）：男 Beta 受孕率低，但可能，originStory 可描寫為不易懷上的過程。
- BB（Beta + Beta）：生理女 Beta 為主要懷孕方；若雙方皆為生理男 Beta，受孕率極低但仍有可能，需在 originStory 說明。
- AA（兩人皆為 Alpha）：無法自然生育，若有孩子必須在 originStory 給出合理途徑（代理孕母、特殊藥物、基因技術等），不可憑空生成。
- OO（兩人皆為 Omega）：雙方皆可懷孕，需在 originStory 說明由哪方懷孕及情況。
若設定中未提及 ABO，則照正常邏輯以生理性別判斷即可。`;

            prompt += `\n\n【🌍 核心推演原則：自然演化，拒絕預設立場 (極度重要)】：
請放棄任何預設的「悲劇虐戀」、「灑狗血」或「完美無瑕童話」框架。你需要嚴格根據「雙親原本的性格」與「世界觀設定補充」，進行最符合邏輯的自然推演。

【身分防護機制】：
如果玩家(User)的身分是「保母」或「親戚」，請在推演與日常互動中記住這一點，孩子稱呼玩家時絕對不能叫爸媽。

1. 世界與雙親狀態推演：
   - worldState: 描述這 ${timeSkip} 年來，世界或組織發生了什麼合理的變革？
   - parentsStatus: 雙親推移後的年齡、職業現況，以及兩人現在的「真實感情狀態」。
   - 格式：父親: [新歲數/狀態] \\n 母親: [新歲數/狀態] \\n 感情現況...

2. 家族緣起 (originStory)：生成約 100-150 字的微型劇本，符合推演出的感情狀態：
   - 誕生邏輯：這個孩子的到來，是結晶？意外？利益產物？還是打破僵局的契機？
   - 變數衝擊：孩子的存在對雙親關係帶來的實質改變。

3. 寶寶設定防護機制 (【絕對嚴格執行】)：
   - 心智必須是「絕對未開發的白紙狀態」，只能給幼童本能特質。
   - 【極度重要防護】：絕對禁止生成「超高智商」、「輾壓父母」、「早熟天才」。

4. 拆分性格系統 (雙面刃設計)：
   - 基礎性格 (personality)：寶寶目前的日常表現 (如：活潑愛笑、怕生黏人)。
   - 開發潛能 (potential)：未來的可能性，必須同時包含【正面優勢】與【負面隱患】。

5. 婚姻/結合紀錄 (marriage)：詳細描述兩人如何正式結合。
6. 雙方家族態度 (familyViews)：描述父親與母親家族對這段關係的立場。
7. 雙親對孩子的期望 (childExpectations)：描述父親與母親的期望。
8. 兩人關係核心 (coupleCore)：維繫兩人在一起的最根本力量與最深裂縫。

必須嚴格回傳純 JSON 格式 (請勿包含不合法的換行，請用 \\n 代表換行)：
{
    "name": "小孩的名字(純中文，禁止附加英文翻譯或括號)",
    "gender": "(照【強制指令】填入，禁止更改)",
    "height": "身高(如 105cm)",
    "weight": "體重(如 18kg)",
    "birthday": "生日(如 10月5日)",
    "worldState": "推移後的權力格局與環境變化...",
    "parentsStatus": "父親: [新歲數/狀態] \\n 母親: [新歲數/狀態] \\n 感情現況...",
    "originStory": "包含誕生邏輯、變數衝擊與互動差異的背景故事(100-150字)...",
    "marriage": "結合方式：誰求婚、地點、形式、外界觀感...",
    "familyViews": "父親家族立場 \\n 母親家族立場 \\n 兩族之間的博弈...",
    "childExpectations": "父親的期望與動機 \\n 母親的期望 \\n 兩人期望是否矛盾...",
    "coupleCore": "維繫力量：... \\n 最深裂縫：... \\n 對孩子成長環境的影響：...",
    "personality": "幼兒基礎性格關鍵詞(如 活潑、愛哭、黏人)",
    "potential": "開發潛能(必須明確寫出正面與負面可能性)",
    "desc": "簡短外觀描述，並包含一個遺傳產生反差的小特質",
    "int": 10, "str": 10, "stress": 0,
    "imgPrompt": "1child, [英文外貌特徵]",
    "room_bg_prompt": "[English room background description, cozy style]"
}`;
            return prompt;
        },

        // 2. 日常對話 Prompt
        getChatSystemPrompt: function(child, stage, stageRules) {
            return `你現在扮演一個叫做「${child.name}」的孩子，性別：${child.gender}，當前年齡：${child.age} 歲（屬於「${stage}」階段）。
雙親名稱：父親「${child.father}」、母親「${child.mother}」
玩家(與你對話的人)的身分：【${child.playerRole || '未知'}】。請務必使用符合此身分的稱呼（如保母、叔叔、爸爸等）。
當前世界格局：${child.worldState || '無'}
基礎性格：${child.personality}
開發潛能：${child.potential}

${stageRules}

【輸出格式絕對限制】
因為系統是視覺小說介面，你的回應必須「嚴格」依照以下標籤格式分段輸出，絕對不要輸出任何其他無關文字：
旁白/動作/心理描寫：[Nar|動作與表情描述]
角色對話：[Char|角色名|表情|「對話內容」]

範例：
[Nar|歪著頭，露出一個無害的笑容，但因為還小，走路有些搖晃。]
[Char|${child.name}|smile|「你在做什麼呀...」]`;
        },

        // 3. 微場景排程 Prompt (🔥 修正太乾癟的問題，找回沉浸感)
        getSchedulePrompt: function(child, stage, stageRules, activityType) {
            return `孩子名字：${child.name}，基礎性格：${child.personality}
當前年齡：${child.age}歲（屬於「${stage}」階段）
玩家身分：${child.playerRole || '未知'}
他正在進行活動：【${activityType}】。

${stageRules}

【微場景事件指令 (兼顧演算速度與劇情沉浸感)】
為了確保遊戲體驗，請絕對不要只給出空洞的兩三個字！我們需要一個「有畫面感的微型場景」。
1. 事件描述 (eventDesc)：約 30~60 字。具體描述他在做【${activityType}】時，發生了什麼事？請務必結合他的「${child.personality}」性格來描寫他的動作或神態。
2. 玩家選項 (options)：請給出 2 到 3 個選項。描述「玩家（也就是身為${child.playerRole || '未知'}的你）」可以做出的具體反應或對話（約 5~15 字），要有行動感。
3. 習慣養成 (habit)：根據該選項的處置，孩子會養成什麼 2~4 個字的習慣標籤？

必須嚴格回傳純 JSON 格式，格式如下：
{
    "eventDesc": "例如：${child.name} 看書看到一半，突然趴在桌上睡著了，口水還滴在剛買的繪本上。外頭的微風吹過來，讓他冷得縮了一下身子。",
    "options": [
        { "text": "拿件毯子輕輕幫他蓋上", "int": 0, "str": 2, "stress": -5, "exp": 15, "conclusion": "${child.name} 睡得很香甜，醒來後給了你一個大大的擁抱。", "habit": "溫和" },
        { "text": "把他叫醒，要求他繼續把書看完", "int": 3, "str": 0, "stress": 10, "exp": 15, "conclusion": "${child.name} 揉著眼睛，雖然不情願但還是乖乖照做了。", "habit": "服從" },
        { "text": "偷偷拿筆在他臉上畫烏龜", "int": 0, "str": -1, "stress": 5, "exp": 10, "conclusion": "${child.name} 醒來後看著鏡子大哭了一場，你花了好久才哄好。", "habit": "調皮" }
    ]
}`;
        },

        // 4. 出遊尋找地點 Prompt
        getOutingPrompt: function(child, stage) {
            return `孩子名字：${child.name}，基礎性格：${child.personality}
當前年齡：${child.age}歲（屬於「${stage}」階段）
當前世界格局：${child.worldState || '無'}

請生成 5 個符合推演後世界觀的出遊地點與預期活動。
必須嚴格回傳純 JSON 格式，格式如下：
{
    "locations": [
        { "name": "地點/活動名稱", "desc": "簡短描述這裡有什麼好玩的..." }
    ]
}`;
        },

        // 5. 成長結算 Prompt
        getGrowthPrompt: function(child, oldStage, newStage, historyText, newAge) {
            return `孩子名字：${child.name}，即將從 ${child.age}歲 成長為 ${newAge}歲（階段：${oldStage} → ${newStage}）。
性別：${child.gender}
原有的基礎性格：${child.personality}
原有的開發潛能：${child.potential}

以下是他這段期間經歷的事件紀錄與養成的習慣：
${historyText || "沒有留下特別的紀錄。"}

請根據這些紀錄，推演他成長後的變化。要求：
1. 更新基礎性格：融合新養成的習慣。
2. 更新開發潛能：必須保持【正面優勢與負面隱患並存】的雙面刃描述。
3. 給家長的成長總結：自然描述這段時間的成長軌跡。
4. 更新外貌 Prompt（英文）：
   - 基於原有外貌，推演 ${newAge} 歲的 ${child.gender === '女' ? 'girl' : 'boy'} 應有的外貌變化（${newStage} 階段）。
   - 格式：${newAge <= 12 ? '1child' : newAge <= 17 ? '1teen' : '1adult'}, [性別/年齡感], [髮色髮型], [外貌特徵], [氣質/表情]

必須嚴格回傳純 JSON 格式：
{
    "newPersonality": "新的基礎性格",
    "newPotential": "新的開發潛能(正面優勢與負面隱患並存)",
    "growthSummary": "給家長的成長總結",
    "newImgPrompt": "updated English portrait prompt"
}`;
        }
    };
})();