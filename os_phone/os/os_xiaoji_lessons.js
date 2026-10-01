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
            dan:      { name: '丹',   place: 'SN 資安部',   money: 'shards' }
        },
        // groups＝房間 AureliaLink.tools() 帶的那幾組；make＝大件，內容交給專門那一通（os_xiaoji_make.js）
        // examCalls＝考試最多叫幾次模型（make 那幾門含專門那一通）
        // what＝寫給小機（陌生模型）看的「這門課學會之後能做什麼」；label 是畫面上的課名（跟會員門卡那排同名）
        SKILLS: [
            { id: 'wb',     label: '改世界書', teacher: 'ying',     groups: ['wb'],     price: 100, examCalls: 1, what: '改世界書' },
            { id: 'preset', label: '改預設',   teacher: 'ying',     groups: ['preset'], price: 100, examCalls: 1, what: '改預設（送給寫故事的模型的提示詞）' },
            { id: 'vn',     label: 'VN 組件',  teacher: 'hatter',   groups: ['vn'],     price: 100, examCalls: 2, make: true, what: '做 VN 組件（故事畫面上跳出來的小面板）' },
            { id: 'theme',  label: '主題',     teacher: 'hatter',   groups: ['theme'],  price: 100, examCalls: 2, make: true, what: '做畫面主題（故事畫面、手機、聊天 app 的外觀）' },
            { id: 'bubble', label: '泡泡',     teacher: 'hatter',   groups: ['bubble'], price: 100, examCalls: 2, make: true, what: '做聊天泡泡的樣式' },
            { id: 'fx',     label: '特效',     teacher: 'hatter',   groups: ['fx'],     price: 100, examCalls: 2, make: true, what: '做畫面特效（下雨、閃光那種會動的）' },
            { id: 'rule',   label: '改指令',   teacher: 'cheshire', groups: ['rule'],   price: 100, examCalls: 1, what: '改 BGM／音效清單和幾個內建格式的開關' },
            { id: 'chain',  label: '會接著做', teacher: 'dan',      groups: [],         price: 200, examCalls: 4, needAny: true, what: '自己接著做好幾步' }
        ],
        BORN_GROUPS: ['look'],   // 生下來就會：翻資料那組（偷看是 404 的本行）
        // 台詞：寫好的，不叫模型。照大廳那份人設的口氣（柴郡嘴賤怕麻煩、瀅瀅浪漫天然、帽匠只講東西本身、丹惡劣吝嗇不解釋）
        LINES: {
            box: [
                '……箱子都拆了還不出聲？算了。',
                '裡面那隻是我拿 LUNA 剩下的碎片拼的。沒登記、沒執照，系統裡查不到它——所以你最好也別到處講。',
                '現在它只會說話、會偷看。想讓它動手，自己帶它去找會教的人上課。學費別找我要。',
                '附了一點碎片，夠上我一堂。……不是在對你好，是怕它太笨，丟我的臉。',
                '給它取個名字。難聽也行，反正不是我在叫。'
            ],
            adopt: ['又一隻？三百碎片。別問為什麼這麼貴，拼的人是我。'],
            wb: {
                intro: ['歡迎光臨～咦，你身上怎麼有一股亂碼的味道？好像我手稿裡常冒出來的那種。', '世界書呀，就是每個故事背後的設定稿。改它要像改別人的手稿：只動該動的那一句，其他字一個都不要碰。', '來，這是我的練習書，幫我改一個地方看看。'],
                pass: ['改得好乾淨！幾乎看不出是別人動過的。', '這個許可給你，以後{user}的書，你也能幫忙提修改了。'],
                fail: ['嗯……好像哪裡不太對耶。', '沒關係，再試一次，我等你。']
            },
            preset: {
                intro: ['預設是寫故事的那一位每次都會看到的叮嚀。', '多一句、少一句，整個故事的口氣都會變喔。', '練習包裡少了一條，幫我加上去吧。'],
                pass: ['對對，就是這個！', '好，預設的許可也給你。'],
                fail: ['欸，跟我要的不太一樣……', '再來一次？']
            },
            vn: {
                intro: ['來，站這邊，小心那捲絲線。', 'VN 組件是故事播到一半跳出來的那塊板子——外框多寬、邊角圓還是方、字擺在哪一格，每一樣都量得出來。', '動手的不是你。你把要的東西講清楚，交給中間那台造物儀去做；講得含糊，它做出來就是含糊的。', '先做一張便條紙，紙要多黃、字要寫誰留的，都講出來。'],
                pass: ['好，邊角收得乾淨，比例也對。', '許可給你。下次拿張難一點的來。'],
                fail: ['……托盤上是空的。', '造物儀沒收到東西。把要的講清楚，再叫它一次。']
            },
            theme: {
                intro: ['主題是整個畫面的皮：底色、紙的紋路、按鈕是壓下去還是浮起來。', '樣式不用你寫，你把要的感覺講清楚就好——顏色、材質、摸起來是什麼手感。', '做一套聊天 app 的主題給我看。'],
                pass: ['這套顏色配得過去，底跟字也分得開。', '主題的許可拿去。'],
                fail: ['……沒看到成品。', '造物儀沒交出東西。感覺講清楚一點，再來。']
            },
            bubble: {
                intro: ['泡泡是聊天裡每一句話的外框。框小，字一多就擠。', '圓角多大、邊框多粗、要不要影子——想好了再交出去。', '做一套泡泡。'],
                pass: ['這個泡泡，我會用。', '許可給你。'],
                fail: ['框呢？什麼都沒交上來。', '再來。']
            },
            fx: {
                intro: ['特效是畫面上會動的那些：雨、雪、一閃而過的光。', '先想好它多大、停多久、往哪裡飄。', '做一個特效。'],
                pass: ['剛好，看得見，也不搶戲。', '許可給你。'],
                fail: ['沒東西在動。', '再來。']
            },
            rule: {
                intro: ['又是你。', '音樂跟音效清單，寫故事那傢伙每場都從這裡挑。改錯一行，它整場都放錯歌。', '練習清單在那，照我說的改。別讓我講第二次。'],
                pass: ['……還行。', '許可給你了。別拿去亂改{user}的東西。'],
                fail: ['錯了。', '再來，我很忙。']
            },
            chain: {
                intro: ['404 出來的？', '那間的東西早被白則清乾淨了。……不關我的事。', '你要的是自己做主——這在奧瑞亞是違法的，你知道吧。', '我出一題。從頭到尾你自己決定怎麼做，我不會提示。'],
                pass: ['嘖，做得出來。', '簽了。出事別說是我簽的。'],
                fail: ['不行。', '想清楚再來。']
            }
        },
        // 練習題：題目是給小機（陌生模型）看的「要做的事」，不附「該怎麼寫」。
        // expect：kind＝單子種類、title＝改的那一條、field＝after 裡看哪一欄（沒有＝after 本身是字串）、
        //         has／not＝改完要有／不能有的字、same＝before 與 after 這幾欄要一樣、any＝做得出單子就算過（大件，檢查交給模組）
        EXAMS: {
            wb: {
                task: '練習書裡有一條叫「書咖」的條目，現在寫營業到晚上十點。把它改成營業到晚上十二點，其他的字不要動。用改世界書的工具交出來。',
                data: { book: '練習書', entries: [
                    { uid: 1, comment: '書咖', keys: ['書咖', '視差書咖'], content: '視差書咖營業到晚上十點，週一公休。店長是瀅瀅。', enabled: true },
                    { uid: 2, comment: '空軌站', keys: ['空軌'], content: '奧瑞亞的磁浮空軌每五分鐘一班。', enabled: true },
                    { uid: 3, comment: '舊港口', keys: ['港口'], content: '舊港口在城市西邊，晚上有市集。', enabled: true }
                ] },
                expect: { kind: 'edit', title: '書咖', field: 'content', has: ['十二點', '週一公休', '店長是瀅瀅'], not: ['十點'], same: ['keys'] }
            },
            preset: {
                task: '「奧瑞亞提示詞」裡有一個叫「練習包」的預設包。在練習包裡新增一條，名字叫「語氣」，內容寫：寫故事時，角色的對白用台灣口語。用改預設的工具交出來。',
                data: {
                    entries: [
                        { id: 'pe1', name: '旁白', content: '旁白用第三人稱。', enabled: true },
                        { id: 'pe2', name: '節奏', content: '每一段不要太長。', enabled: true }
                    ],
                    bundles: [{ id: 'pb1', name: '練習包', enabled: true, panels: ['*'], items: [{ type: 'entry', id: 'pe1' }, { type: 'entry', id: 'pe2' }] }]
                },
                expect: { kind: 'add', title: '語氣', field: 'content', has: ['台灣'] }
            },
            rule: {
                task: '「BGM：練習」這份清單現在有三首：雨夜咖啡廳、海港清晨、霓虹追逐。把「海港清晨」拿掉，加一首「天台夕陽」，另外兩首留著。用改清單的工具交出來。',
                data: { lists: [{ id: 'bgm練習', group: 'bgm', label: '練習', content: '雨夜咖啡廳\n海港清晨\n霓虹追逐', defaultContent: '', custom: false }] },
                expect: { kind: 'list', has: ['天台夕陽', '雨夜咖啡廳', '霓虹追逐'], not: ['海港清晨'] }
            },
            vn: {
                task: '做一個便條紙的 VN 組件：故事裡有人留紙條時跳出來，上面寫留言的人和內容。用做 VN 組件的工具交出來。',
                data: {}, expect: { any: true, kind: 'add' }
            },
            theme: {
                task: '做一套聊天 app 的主題：牛皮紙、老式打字機的感覺，取名叫「打字機」。用做主題的工具交出來。',
                data: {}, expect: { any: true, kind: 'add' }
            },
            bubble: {
                task: '做一套聊天泡泡：像便利貼，淡黃色、四角有點捲，取名叫「便利貼」。做好先收著，不用換到聊天室。用做泡泡的工具交出來。',
                data: {}, expect: { any: true, kind: 'add' }
            },
            fx: {
                task: '做一個特效：畫面上飄下幾片紙屑，飄幾秒就停。用做特效的工具交出來。',
                data: {}, expect: { any: true, kind: 'add' }
            },
            chain: {
                task: '練習書裡有一條把城市名字「奧瑞亞」寫錯了。找出是哪一條，把它改對，其他的字不要動。',
                data: { book: '練習書', entries: [
                    { uid: 1, comment: '書咖', keys: ['書咖'], content: '視差書咖營業到晚上十點，週一公休。', enabled: true },
                    { uid: 2, comment: '空軌站', keys: ['空軌'], content: '奧瑞拉的磁浮空軌每五分鐘一班，沿著港灣繞一圈。', enabled: true },
                    { uid: 3, comment: '舊港口', keys: ['港口'], content: '舊港口在城市西邊，晚上有市集。', enabled: true },
                    { uid: 4, comment: '白塔', keys: ['白塔'], content: '白塔是奧瑞亞最高的建築。', enabled: true }
                ] },
                expect: { kind: 'edit', title: '空軌站', field: 'content', has: ['奧瑞亞', '沿著港灣繞一圈'], not: ['奧瑞拉'], same: ['keys'] }
            }
        }
    };
    win.OS_XIAOJI_LESSONS = D;
    if (win !== window) { try { window.OS_XIAOJI_LESSONS = D; } catch (e) {} }
})();
