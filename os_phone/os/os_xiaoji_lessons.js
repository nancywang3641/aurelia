// ----------------------------------------------------------------
// [檔案] os_xiaoji_lessons.js — API 小機的課程資料（2026-10-01）
// 純資料：技能表、價錢、老師、台詞、練習題。引擎（os_xiaoji.js）與培養室畫面照這份跑；價錢要調只改這裡。
// 台詞與練習題是給人看、給模型看的字：改了要派小弟冷讀（不准變成範例）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const D = {
        BOX_GIFT: 100,       // 開箱附的碎片：剛好一堂柴郡
        ADOPT_PRICE: 300,    // 第二隻以後在 404 黑市買（碎片）
        TEACHERS: {
            ying:     { name: '瀅瀅', place: '視差書咖',   money: 'pt' },
            hatter:   { name: '帽匠', place: '奇想工坊',   money: 'pt' },
            cheshire: { name: '柴郡', place: '404 號房',   money: 'shards' },
            dan:      { name: '丹',   place: 'SN 七十三樓', money: 'shards' }
        },
        // groups＝房間 AureliaLink.tools() 帶的那幾組；make＝大件，內容交給專門那一通（os_xiaoji_make.js）
        // examCalls＝考試最多叫幾次模型（make 那幾門含專門那一通）
        SKILLS: [
            { id: 'wb',     label: '改世界書', teacher: 'ying',     groups: ['wb'],     price: 100, examCalls: 1 },
            { id: 'preset', label: '改預設',   teacher: 'ying',     groups: ['preset'], price: 100, examCalls: 1 },
            { id: 'vn',     label: 'VN 組件',  teacher: 'hatter',   groups: ['vn'],     price: 100, examCalls: 2, make: true },
            { id: 'theme',  label: '主題',     teacher: 'hatter',   groups: ['theme'],  price: 100, examCalls: 2, make: true },
            { id: 'bubble', label: '泡泡',     teacher: 'hatter',   groups: ['bubble'], price: 100, examCalls: 2, make: true },
            { id: 'fx',     label: '特效',     teacher: 'hatter',   groups: ['fx'],     price: 100, examCalls: 2, make: true },
            { id: 'rule',   label: '改指令',   teacher: 'cheshire', groups: ['rule'],   price: 100, examCalls: 1 },
            { id: 'chain',  label: '會接著做', teacher: 'dan',      groups: [],         price: 200, examCalls: 4, needAny: true }
        ],
        BORN_GROUPS: ['look'],   // 生下來就會：翻資料那組（偷看是 404 的本行）
        LINES: {},               // Task 8
        EXAMS: {}                // Task 8
    };
    win.OS_XIAOJI_LESSONS = D;
    if (win !== window) { try { window.OS_XIAOJI_LESSONS = D; } catch (e) {} }
})();
