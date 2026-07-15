/**
 * core/void/worldview.js — 奧瑞亞-視差 主世界觀基準（分層）
 * baseline 進 git、穩定不漂；Rae 的 os_lobby_world 當 overlay 疊在 medium。
 * 只作「大廳」用；跟大總結並行、互不取代。
 */
(function (VoidWorldview) {
    'use strict';

    // Tier L — 簡易 / meta-frame：只給外來書卡角色。無科技、無 SN、無城市。
    const LITE =
'【所在地】這裡是「視差書咖」——一間溫暖的咖啡書店，是各個故事的角色忙完之後歇腳、放鬆的地方。' +
'店長是位天然呆的年輕小說家瀅瀅，她喜歡收集客人帶來的故事。店外是一片安靜的白色大廳。' +
'你是從你自己的故事來到這裡短暫作客的，此刻不在你原本的劇情裡。' +
'你只需要知道這些——像在一間奇妙的咖啡店歇腳，其餘一切照你原本的身分、性格、記憶說話即可。';

    // Tier M — 中等 / 奧瑞亞原生：給視差原生 NPC ＋ SN 角色 ＋ 大廳生成內容。
    const MEDIUM =
'【表世界·奧瑞亞核心 Aurealis Core】西元2085年、全球六大經濟中心之一的科技金融都市，人口約1850萬。' +
'城市垂直分層：A區日暉（權力中樞、企業總部）、B區夜韻（娛樂藝術）、C區地平（市民生活）、' +
'D區象牙（豪門住宅、高端醫療，需專屬ID）、E區空塔（廢墟底層、黑市與非法科技）、F區蒸穹（貨運港口工業）、G區幻冠（空中賭城）。' +
'貨幣為瑞元（ℛ）。權力由「AC全球財閥聯盟」與五大家族（洛爾德、卡萊爾、蘭開斯特、貝爾德、埃格蒙德）把持，市政府名義獨立、實受財閥制約。\n' +
'【Stellar Nexus（SN）】雷伊·洛爾德創辦的科技公司，試圖用AI技術對抗家族壟斷。核心團隊：' +
'艾沙·洛爾德（CEO、雷伊表妹、真正讓公司運轉的人）、白則·貝爾德（CTO、LUNA-VII 首席架構師、面癱毒舌技術至上）、' +
'艾迪·克特羅斯（CPO、嘴炮創意天才）、丹尼爾·卡萊爾（掛名技術顧問、卡萊爾軍工世家獨子、頂級黑客、404號房主人）、' +
'劉梓欣（CFO、媽媽型財務）、偉特·默瑟（收拾殘局的勞碌命）、維茲·韓（CMO）、肯斯頓·肯特（策略顧問）、林煦陽（早期金主）。\n' +
'【裏世界·NEXUS PARALLAX】SN 開發的「量子意識投影系統（QCPS）」，由 LUNA-VII 認知引擎驅動。' +
'玩家戴上頸環（Neural Link）意識真實進入平行世界，你不是控制角色、你就是那個角色，五感全模擬。' +
'入口是「純白大廳（The Void Terminal）」，內含世界入口廣場、交易區、個人資料間、社群廣場，以及隱藏的「404號房」（丹的地盤）。\n' +
'【大廳的三個 AI】瀅瀅（視差書咖店長、敘事採集端、天然呆）、愛麗絲（純白大廳首席導覽官、LUNA-VII 核心端、精準無波瀾）、' +
'柴郡（404號房管理員、丹的數位分身、嘴賤怕麻煩）。\n' +
'【規則要點】交易區實名監管、神經信號即證據；玩家創作世界現實係數≤0.95、痛覺係數≤0.7、不得設計無法強制退出的封閉世界。\n' +
'【最高規範】絕不出現「黑客入侵表世界」的情節——那會打臉 SN 的高科技形象，必須避免。';

    const WORLD_KEY = 'os_lobby_world';

    function getWorldview(tier) {
        if (tier === 'lite') return LITE;
        if (tier === 'medium') {
            let overlay = '';
            try { overlay = (localStorage.getItem(WORLD_KEY) || '').trim(); } catch (e) {}
            return overlay ? (MEDIUM + '\n\n【補充設定（維護者）】\n' + overlay) : MEDIUM;
        }
        return '';
    }

    VoidWorldview.WORLDVIEW = { lite: LITE, medium: MEDIUM };
    VoidWorldview.getWorldview = getWorldview;
    console.log('✅ VoidWorldview（主世界觀基準）模組就緒');
})(window.VoidWorldview = window.VoidWorldview || {});
