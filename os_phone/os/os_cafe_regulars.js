// ----------------------------------------------------------------
// [檔案] os_cafe_regulars.js
// 路徑：os_phone/os/os_cafe_regulars.js
// 職責：📖☕ 書咖的 12 位常客（只有資料，規則在 os_cafe.js 的結算）。
//   兩層：「類型」決定幾點來、偏愛哪類口味、多常來；「習性」決定賣完了改點還是走、挑什麼。
//   全照腳本跑，不叫模型。名字是一般名字，不是任何人的遊玩內容。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    // 幾點來（分鐘）、偏愛的兩個口味標籤（要在書咖的標籤池裡）、多常來
    const TYPES = {
        senior:    { label: '熟齡常客',   from: 9 * 60,  to: 11 * 60,   tags: ['茶香', '苦韻'], freq: 0.7 },
        office_f:  { label: '女上班族',   from: 9 * 60,  to: 10 * 60,   tags: ['苦韻', '清爽'], freq: 0.55 },
        civil_m:   { label: '男公務人員', from: 12 * 60, to: 13 * 60 + 30, tags: ['苦韻', '辛暖'], freq: 0.55 },
        freelance: { label: '自由工作者', from: 13 * 60, to: 18 * 60,   tags: ['綿密', '甜'],   freq: 0.55 },
        student_f: { label: '女學生',     from: 16 * 60, to: 19 * 60,   tags: ['花香', '果酸'], freq: 0.55 },
        student_m: { label: '男學生',     from: 16 * 60, to: 20 * 60,   tags: ['甜', '酥脆'],   freq: 0.45 },
    };

    // 習性：只放這版機制（庫存、菜單、價錢）咬得到的
    //   loyal 有了本命就只點那杯，賣完直接走／novelty 沒喝過的優先、賣完多半改點／thrifty 偏便宜的
    //   picky 只點對口味的、比較快喝膩／social 有時揪另一位常客一起來／moody 每天想喝的口味不一樣
    const TRAITS = {
        loyal:   { label: '固定派' },
        novelty: { label: '愛嚐鮮' },
        thrifty: { label: '省錢' },
        picky:   { label: '挑剔' },
        social:  { label: '愛揪人' },
        moody:   { label: '看心情' },
    };

    // look＝在大廳書咖裡長什麼樣（三視圖長條圖的檔名，放在素材庫 cafe_guests_v1/）
    //   同類型兩位挑不一樣的圖：沒用到的 fashion-man、street-woman、trades-man、trades-woman、traveler-man、wealthy-woman 留給以後的新客人
    const PEOPLE = [
        { key: 'g_lin',      name: '林伯伯',   type: 'senior',    traits: ['loyal'], look: 'retired-man' },
        { key: 'g_xiuqin',   name: '秀琴阿姨', type: 'senior',    traits: ['social', 'thrifty'], look: 'retired-woman' },
        { key: 'g_yijun',    name: '怡君',     type: 'office_f',  traits: ['loyal'], look: 'office-woman' },
        { key: 'g_peishan',  name: '佩珊',     type: 'office_f',  traits: ['novelty', 'picky'], look: 'fashion-woman' },
        { key: 'g_zhiming',  name: '志明',     type: 'civil_m',   traits: ['thrifty'], look: 'office-man' },
        { key: 'g_junhong',  name: '俊宏',     type: 'civil_m',   traits: ['loyal', 'social'], look: 'wealthy-man' },
        { key: 'g_azhe',     name: '阿哲',     type: 'freelance', traits: ['moody'], look: 'creative-man' },
        { key: 'g_xiaokui',  name: '小葵',     type: 'freelance', traits: ['novelty'], look: 'creative-woman' },
        { key: 'g_yating',   name: '雅婷',     type: 'student_f', traits: ['social', 'novelty'], look: 'student-girl' },
        { key: 'g_shihan',   name: '詩涵',     type: 'student_f', traits: ['picky'], look: 'traveler-woman' },
        { key: 'g_guanyu',   name: '冠宇',     type: 'student_m', traits: ['thrifty', 'social'], look: 'student-boy' },
        { key: 'g_jiahao',   name: '家豪',     type: 'student_m', traits: ['moody'], look: 'street-man' },
    ];

    // 訪客手札上的句子（{want} 想點的、{item} 點到的、{friend} 一起來的那位）
    const LINES = {
        soldSwitch: '想點{want},賣完了,改點了{item}。',
        soldLeave:  '想點{want},賣完了,看了看就走了。',
        loyalLeave: '只想喝{want},今天沒有,轉身就走了。',
        pickyNone:  '把菜單從頭看到尾,沒有想喝的,走了。',
        bring:      '帶著{friend}一起來。',
        brought:    '被{friend}拉來的。',
        devotion:   ['「{item}」已經是我每次來必點的了。', '{item}要一直賣下去喔,我會再來。'],
        dropout:    ['{item}最近喝太多次了,想換換口味。', '{item}有點喝膩了,下次試試別的。'],
    };

    win.OS_CAFE_REGULARS = window.OS_CAFE_REGULARS = { TYPES, TRAITS, PEOPLE, LINES };
})();
