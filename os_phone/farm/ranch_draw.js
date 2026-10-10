// ============================================================
// ranch_draw.js — 牧場動物用程式畫
// ------------------------------------------------------------
// FarmAnimalDraw.svg({ kind }) → '<svg …>'，一律面朝右（往左走時外層水平翻過來），腳底在畫面 92% 的高度。
//   kind：chicken 雞 / chick 小雞（小的雞用這張）/ sheep 羊 / cow 牛 / cat 貓 / dog 狗
// 10-11 照阿洛那張 Q 版參考表重畫：頭大腳短、大眼睛兩點高光、腮紅、暖棕描線（她：「可愛多了」）。
//   羊毛照 09-29 她挑的棉花糖（邊幾乎平滑）；狗是垂耳、離臉一點。
// 動作掛在外層（.ranch-animal）的 class，一次只掛一個：
//   ra-idle 站著（呼吸、眨眼、抬頭看看）／ra-walk 走路／ra-run 跑／ra-eat 低頭吃
//   ra-happy 開心（蹦、瞇眼、冒愛心）／ra-sleep 睡覺（腳收起來趴著、閉眼、冒 z）
// 🚨 給 CSS 動的那個元素本身不能有 transform 屬性（會被 CSS 蓋掉）：愛心、zzz 外面包一層 g 放位置就是為這個。
// 另外：產出（蛋／毛／奶）、地上的雜草糞便、飼料槽的乾草、狗屋、野狼來過的痕跡。
// ============================================================
(function (root) {
    'use strict';

    var uid = 0;
    var OL = '#5b3c2c';      // 描線：暖深棕
    var EYE = '#2a1912';

    var CSS = [
        '.ra-animal .ra-leg-a,.ra-animal .ra-leg-b{transform-box:fill-box;transform-origin:50% 0;}',
        '.ra-animal .ra-all,.ra-animal .ra-body{transform-box:view-box;transform-origin:50% 92%;}',
        '.ra-animal .ra-shadow{transform-box:fill-box;transform-origin:50% 50%;}',
        '.ra-animal .ra-head{transform-box:fill-box;transform-origin:var(--ho,30% 90%);}',
        '.ra-animal .ra-tail{transform-box:fill-box;transform-origin:var(--to,90% 20%);}',
        '.ra-animal .ra-eo{transform-box:fill-box;transform-origin:50% 50%;}',
        '.ra-animal .ra-fx-heart,.ra-animal .ra-fx-z{transform-box:fill-box;transform-origin:50% 50%;}',
        '.ra-animal .ra-eh,.ra-animal .ra-es,.ra-animal .ra-fx-heart,.ra-animal .ra-fx-z{display:none;}',
        // 站著：呼吸、眨眼、偶爾抬頭看看
        '.ra-idle .ra-animal .ra-body{animation:ra-breathe 2.4s ease-in-out infinite;}',
        '.ra-idle .ra-animal .ra-head{animation:ra-look 6.5s ease-in-out infinite;}',
        '.ra-idle .ra-animal .ra-tail{animation:ra-wag 2.4s ease-in-out infinite;}',
        '.ra-idle .ra-animal .ra-eo,.ra-walk .ra-animal .ra-eo,.ra-eat .ra-animal .ra-eo,.ra-run .ra-animal .ra-eo{animation:ra-blink 4.6s infinite;}',
        // 走路：腳交替、身體一顛一顛
        '.ra-walk .ra-animal .ra-leg-a{animation:ra-step .36s ease-in-out infinite alternate;}',
        '.ra-walk .ra-animal .ra-leg-b{animation:ra-step .36s ease-in-out infinite alternate-reverse;}',
        '.ra-walk .ra-animal .ra-body{animation:ra-bob .18s ease-in-out infinite alternate;}',
        '.ra-walk .ra-animal .ra-tail{animation:ra-wag .6s ease-in-out infinite;}',
        // 跑：腳甩更開、身體往前傾
        '.ra-run .ra-animal .ra-leg-a{animation:ra-stride .2s linear infinite alternate;}',
        '.ra-run .ra-animal .ra-leg-b{animation:ra-stride .2s linear infinite alternate-reverse;}',
        '.ra-run .ra-animal .ra-all{animation:ra-gallop .2s ease-in-out infinite alternate;}',
        '.ra-run .ra-animal .ra-tail{animation:ra-wag .3s ease-in-out infinite;}',
        // 吃：低頭啃幾口
        '.ra-eat .ra-animal .ra-head{animation:ra-eat var(--eatd,1.4s) ease-in-out infinite;}',
        '.ra-eat .ra-animal .ra-body{animation:ra-breathe 2.4s ease-in-out infinite;}',
        '.ra-eat .ra-animal .ra-tail{animation:ra-wag 1.2s ease-in-out infinite;}',
        // 開心：原地蹦、瞇眼、冒愛心
        '.ra-happy .ra-animal .ra-all{animation:ra-hop .6s ease-in-out infinite;}',
        '.ra-happy .ra-animal .ra-shadow{animation:ra-shadow .6s ease-in-out infinite;}',
        '.ra-happy .ra-animal .ra-tail{animation:ra-wag .3s ease-in-out infinite;}',
        '.ra-happy .ra-animal .ra-eo,.ra-sleep .ra-animal .ra-eo{display:none;}',
        '.ra-happy .ra-animal .ra-eh{display:inline;}',
        '.ra-happy .ra-animal .ra-fx-heart{display:inline;animation:ra-float 1.2s ease-out infinite;}',
        // 睡覺：腳收起來趴著、閉眼、慢慢呼吸、冒 z
        '.ra-sleep .ra-animal .ra-leg-a,.ra-sleep .ra-animal .ra-leg-b{transform:scaleY(.22);}',
        '.ra-sleep .ra-animal .ra-all{transform:translateY(var(--sit,4px));}',
        '.ra-sleep .ra-animal .ra-body{animation:ra-breathe 3.2s ease-in-out infinite;}',
        '.ra-sleep .ra-animal .ra-head{transform:rotate(var(--nod,6deg));}',
        '.ra-sleep .ra-animal .ra-es{display:inline;}',
        '.ra-sleep .ra-animal .ra-fx-z{display:inline;animation:ra-z 2.4s ease-out infinite;}',
        '.ra-sleep .ra-animal .ra-fx-z.z2{animation-delay:.8s;}',
        '.ra-sleep .ra-animal .ra-fx-z.z3{animation-delay:1.6s;}',
        '.ra-sleep .ra-animal .ra-shadow{transform:scale(1.08,.9);}',
        // 狗尾巴：醒著就一直搖
        '.ra-animal .ra-wag-fast{animation:ra-wagf .3s ease-in-out infinite alternate!important;}',
        '.ra-sleep .ra-animal .ra-wag-fast{animation:none!important;}',
        '@keyframes ra-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.012,1.03)}}',
        '@keyframes ra-blink{0%,93%,100%{transform:scaleY(1)}95.5%{transform:scaleY(.08)}}',
        '@keyframes ra-look{0%,40%,100%{transform:rotate(0)}48%,68%{transform:rotate(-6deg)}76%{transform:rotate(3deg)}84%{transform:rotate(0)}}',
        '@keyframes ra-step{from{transform:rotate(-22deg)}to{transform:rotate(22deg)}}',
        '@keyframes ra-stride{from{transform:rotate(-36deg)}to{transform:rotate(36deg)}}',
        '@keyframes ra-bob{from{transform:translateY(0)}to{transform:translateY(calc(var(--bob,1.5px) * -1))}}',
        '@keyframes ra-gallop{from{transform:translateY(0) rotate(0)}to{transform:translateY(calc(var(--bob,1.5px) * -2.2)) rotate(5deg)}}',
        '@keyframes ra-wag{0%,100%{transform:rotate(0)}50%{transform:rotate(-12deg)}}',
        '@keyframes ra-wagf{from{transform:rotate(-16deg)}to{transform:rotate(14deg)}}',
        '@keyframes ra-eat{0%,100%{transform:rotate(0)}22%,78%{transform:rotate(var(--eat,24deg))}36%,64%{transform:rotate(calc(var(--eat,24deg) - 6deg))}50%{transform:rotate(var(--eat,24deg))}}',
        '@keyframes ra-hop{0%,100%{transform:translateY(0) scale(1.05,.94)}15%{transform:translateY(0) scale(1,1)}45%{transform:translateY(calc(var(--jump,8px) * -1)) scale(.97,1.04)}75%{transform:translateY(0) scale(1.04,.95)}}',
        '@keyframes ra-shadow{0%,15%,75%,100%{transform:scale(1);opacity:1}45%{transform:scale(.72);opacity:.6}}',
        '@keyframes ra-float{0%{transform:translateY(0) scale(.4);opacity:0}25%{transform:translateY(-3px) scale(1.12);opacity:1}100%{transform:translateY(-13px) scale(1);opacity:0}}',
        '@keyframes ra-z{0%{transform:translate(0,0) scale(.5);opacity:0}30%{opacity:1}100%{transform:translate(6px,-11px) scale(1.15);opacity:0}}',
        '@media (prefers-reduced-motion:reduce){.ra-animal *{animation:none!important;}}'
    ].join('');

    function ensureCss(doc) {
        doc = doc || (typeof document !== 'undefined' ? document : null);
        if (!doc || doc.getElementById('ra-style')) return;
        var st = doc.createElement('style');
        st.id = 'ra-style';
        st.textContent = CSS;
        (doc.head || doc.documentElement).appendChild(st);
    }

    function n(v) { return Math.round(v * 100) / 100; }
    // 有描線的形狀
    function o(sw) { return ' class="o" stroke="' + OL + '" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="round"'; }
    function lg(id, a, b) {
        return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>';
    }
    // 產出圖示用的圓形漸層（亮面在左上）
    function grad(id, a, b) {
        return '<radialGradient id="' + id + '" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></radialGradient>';
    }
    // 好幾塊疊成一隻（頭＋身體）：先畫一層加粗的描線色、再蓋一層填色＝只有外圍一圈線，接縫看不到
    function merge(shapes, fill, sw) {
        return '<g class="ra-ol" fill="' + OL + '" stroke="' + OL + '" stroke-width="' + (sw * 2) + '" stroke-linejoin="round">' + shapes + '</g>' +
            '<g fill="' + fill + '">' + shapes + '</g>';
    }
    // 眼睛：睜開（兩點高光）／開心瞇眼 ∩／睡著 ∪
    function eyes(list, sw, col, shut) {
        col = col || EYE;
        shut = shut || col;
        var open = '', happy = '', sleep = '';
        list.forEach(function (e) {
            var x = e[0], y = e[1], rx = e[2], ry = e[3];
            open += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + col + '"/>' +
                '<ellipse cx="' + n(x + rx * .28) + '" cy="' + n(y - ry * .36) + '" rx="' + n(rx * .44) + '" ry="' + n(ry * .37) + '" fill="#fff"/>' +
                '<circle cx="' + n(x - rx * .32) + '" cy="' + n(y + ry * .44) + '" r="' + n(rx * .19) + '" fill="#fff" opacity=".85"/>';
            happy += '<path d="M' + n(x - rx * 1.05) + ' ' + n(y + ry * .3) + 'Q' + x + ' ' + n(y - ry * 1.05) + ' ' + n(x + rx * 1.05) + ' ' + n(y + ry * .3) + '"/>';
            sleep += '<path d="M' + n(x - rx * 1.05) + ' ' + n(y - ry * .05) + 'Q' + x + ' ' + n(y + ry * .85) + ' ' + n(x + rx * 1.05) + ' ' + n(y - ry * .05) + '"/>';
        });
        var st = ' fill="none" stroke="' + shut + '" stroke-width="' + n(sw * 1.25) + '" stroke-linecap="round"';
        return '<g class="ra-eo">' + open + '</g><g class="ra-eh"' + st + '>' + happy + '</g><g class="ra-es"' + st + '>' + sleep + '</g>';
    }
    function blush(list) {
        return list.map(function (b) {
            return '<ellipse cx="' + b[0] + '" cy="' + b[1] + '" rx="' + b[2] + '" ry="' + b[3] + '" fill="#ff8a8a" opacity=".5"/>';
        }).join('');
    }
    // 頭頂冒的東西：愛心、zzz（外面包一層 g 放位置，裡面那個才給 CSS 動，不然 transform 會被蓋掉）
    function fx(x, y, s) {
        return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')">' +
            '<path class="ra-fx-heart" d="M0 3.2C-1.6 -.6 -6.4 -.4 -6.4 3.4C-6.4 6.6 -2.6 8.6 0 11C2.6 8.6 6.4 6.6 6.4 3.4C6.4 -.4 1.6 -.6 0 3.2Z" fill="#ff6f86" stroke="#c43c56" stroke-width=".9"/>' +
            '<g font-family="Arial Rounded MT Bold,Arial,sans-serif" font-weight="900" fill="#8193d6" stroke="#fff" stroke-width="1.2" paint-order="stroke">' +
            '<text class="ra-fx-z z1" x="-2" y="8" font-size="7">z</text>' +
            '<text class="ra-fx-z z2" x="3" y="3" font-size="8.5">z</text>' +
            '<text class="ra-fx-z z3" x="8.5" y="-3" font-size="10">Z</text></g></g>';
    }
    function leg(x, y1, y2, w, fill, foot, sw, cls) {
        return '<g class="' + cls + '"><rect x="' + n(x - w / 2) + '" y="' + y1 + '" width="' + w + '" height="' + n(y2 - y1) + '" rx="' + n(w / 2) + '" fill="' + fill + '"' + o(sw) + '/>' +
            (foot ? '<path d="M' + n(x - w / 2 + sw / 2) + ' ' + n(y2 - w * .55) + 'h' + n(w - sw) + 'v' + n(w * .3) + 'a' + n(w / 2 - sw / 2) + ' ' + n(w * .25) + ' 0 0 1 -' + n(w - sw) + ' 0z" fill="' + foot + '"/>' : '') + '</g>';
    }
    // 羊毛的外形：沿著橢圓繞一圈、每段往外拱一點（09-29 她挑的棉花糖：邊幾乎平滑，裡面不畫一圈一圈的線）
    function cloudPath(cx, cy, rx, ry, segs, amp, seed) {
        var s = seed || 1;
        var rnd = function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
        var ph = -Math.PI / 2 + .3;
        var at = function (t, grow) { return [cx + (rx + grow) * Math.cos(t), cy + (ry + grow) * Math.sin(t)]; };
        var f = function (p) { return p[0].toFixed(2) + ' ' + p[1].toFixed(2); };
        var d = 'M' + f(at(ph, 0));
        for (var i = 0; i < segs; i++) {
            var t0 = ph + i / segs * Math.PI * 2, t1 = ph + (i + 1) / segs * Math.PI * 2;
            var p0 = at(t0, 0), p1 = at(t1, 0), top = at((t0 + t1) / 2, amp * (.65 + .7 * rnd()));
            d += 'Q' + f([2 * top[0] - (p0[0] + p1[0]) / 2, 2 * top[1] - (p0[1] + p1[1]) / 2]) + ' ' + f(p1);
        }
        return d + 'Z';
    }

    var DRAW = {};

    // ── 雞：白色圓滾滾一團、紅冠三顆、黃嘴、紅肉垂、一隻大眼睛 ──
    DRAW.chicken = function (id) {
        var sw = 1.5;
        var blob = '<circle cx="40" cy="21" r="12.5"/><ellipse cx="31" cy="39.5" rx="18.5" ry="14.5"/>';
        var comb = '<circle cx="34.6" cy="10.4" r="3.5"/><circle cx="39.6" cy="8" r="4"/><circle cx="45" cy="10" r="3.4"/>';
        return {
            vb: '0 0 64 64', vars: '--ho:50% 95%;--to:80% 90%;--bob:1.6px;--jump:7px;--sit:4.6px;--eat:30deg;--eatd:.9s;--nod:8deg',
            defs: lg(id + 'b', '#ffffff', '#ece4d8') + lg(id + 'c', '#ff6a5e', '#de3d3a'),
            shadow: '<ellipse class="ra-shadow" cx="31" cy="59" rx="15" ry="3.2" fill="rgba(52,64,24,.26)"/>',
            legs:
                '<g class="ra-leg-a"><path d="M27 51.5V57.5M27 57.5l-3.2 1.4M27 57.5l3.4 1.2" stroke="#e48c1f" stroke-width="2.3" stroke-linecap="round" fill="none"/></g>' +
                '<g class="ra-leg-b"><path d="M35 51.5V57.5M35 57.5l-3.2 1.4M35 57.5l3.4 1.2" stroke="#e48c1f" stroke-width="2.3" stroke-linecap="round" fill="none"/></g>',
            body:
                '<g class="ra-tail"><path d="M15 36C8 32 6 23 9.5 17C12.5 20.5 15 22.5 18 24C16 18 18 13 22.5 10.5C23.5 17 24.5 21.5 27 25.5Z" fill="url(#' + id + 'b)"' + o(sw) + '/></g>' +
                '<g class="ra-head">' +
                merge(comb, 'url(#' + id + 'c)', sw) +
                merge(blob, 'url(#' + id + 'b)', sw) +
                '<path d="M21 37.5C25.5 33.5 34.5 33.5 38.5 38.5C37.5 44.5 32.5 48 27 47.2C24 46.8 22.6 44.6 24.4 42.6C21.4 42.4 20 40 21 37.5Z" fill="#f2ebe1"' + o(sw * .8) + '/>' +
                '<path d="M27 40.5q4 1.6 7.5 -.2M26.6 43.6q3.4 1.2 6 0" stroke="#d9cfc0" stroke-width="1" fill="none" stroke-linecap="round"/>' +
                '<ellipse cx="51.6" cy="27.6" rx="2.3" ry="3.1" fill="url(#' + id + 'c)"' + o(sw * .8) + '/>' +
                '<path d="M51.2 18.4Q58 20.2 59 22Q58 24 51.2 25Z" fill="#f7b02e"' + o(sw * .85) + '/>' +
                '<path d="M52.4 22h5.2" stroke="#d98a1a" stroke-width=".8" stroke-linecap="round"/>' +
                eyes([[45.6, 18.4, 2.6, 3.2]], sw) +
                blush([[46.4, 24.6, 3, 1.7]]) +
                '</g>' +
                fx(50, 1, .9)
        };
    };

    // ── 小雞：一顆黃色毛球、頭頂兩根毛 ──
    DRAW.chick = function (id) {
        var sw = 1.3;
        var blob = '<circle cx="27" cy="19.5" r="9.5"/><ellipse cx="23" cy="29" rx="12.5" ry="11"/>';
        return {
            vb: '0 0 48 48', vars: '--ho:50% 95%;--to:80% 90%;--bob:1.4px;--jump:6px;--sit:2.4px;--eat:28deg;--eatd:.8s;--nod:8deg',
            defs: lg(id + 'y', '#ffe680', '#f6c331'),
            shadow: '<ellipse class="ra-shadow" cx="23" cy="44.2" rx="11" ry="2.6" fill="rgba(52,64,24,.26)"/>',
            legs:
                '<g class="ra-leg-a"><path d="M20.5 39.5V43.2M20.5 43.2l-2.4 1M20.5 43.2l2.6 .9" stroke="#e48c1f" stroke-width="1.9" stroke-linecap="round" fill="none"/></g>' +
                '<g class="ra-leg-b"><path d="M26.5 39.5V43.2M26.5 43.2l-2.4 1M26.5 43.2l2.6 .9" stroke="#e48c1f" stroke-width="1.9" stroke-linecap="round" fill="none"/></g>',
            body:
                '<g class="ra-tail"><path d="M11.5 27.5C8 25.5 7.4 21.6 9 19.4C10.5 21.6 12.4 22.6 14.4 23Z" fill="url(#' + id + 'y)"' + o(sw) + '/></g>' +
                '<g class="ra-head">' +
                '<path d="M26 10.5C25 7 26.5 5.2 28.5 5M27.4 10.2C28.4 7.6 30.6 6.8 32 7.4" stroke="' + OL + '" stroke-width="' + sw + '" fill="none" stroke-linecap="round" class="o"/>' +
                merge(blob, 'url(#' + id + 'y)', sw) +
                '<path d="M14.5 28.5C17.5 25.8 23.5 26 26 29.6C25 33.6 21.2 35.6 17.6 34.6C15.4 33.8 14 31.4 14.5 28.5Z" fill="#ffd650"' + o(sw * .8) + '/>' +
                '<path d="M35.6 17.6Q40.6 19 41.2 20.2Q40.6 21.6 35.6 22.4Z" fill="#f79b22"' + o(sw * .85) + '/>' +
                eyes([[31.4, 16.6, 2.2, 2.7]], sw) +
                blush([[32.4, 22, 2.6, 1.5]]) +
                '</g>' +
                fx(33, 0, .8)
        };
    };

    // ── 羊：棉花糖一大團、臉黑黑的朝前、頭頂一撮毛、耳朵往兩邊 ──
    DRAW.sheep = function (id) {
        var sw = 1.6;
        var W = 'url(#' + id + 'w)';
        var wool = cloudPath(40, 38, 27, 18.5, 18, 1.4, 5);
        var face = '#4b4240';
        return {
            vb: '0 0 92 72', vars: '--ho:20% 80%;--to:80% 50%;--bob:1.8px;--jump:8px;--sit:9.5px;--eat:22deg;--eatd:1.6s;--nod:7deg',
            defs: lg(id + 'w', '#fffbf2', '#eadcc2') + lg(id + 'f', '#5a504d', '#3a3230') +
                '<linearGradient id="' + id + 'ws" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#e2d4b8" stop-opacity="0"/><stop offset="1" stop-color="#d2c09f" stop-opacity=".95"/></linearGradient>',
            shadow: '<ellipse class="ra-shadow" cx="44" cy="66.2" rx="29" ry="4.4" fill="rgba(52,64,24,.26)"/>',
            legs:
                leg(25, 50, 66, 6, '#45393a', '#2a2221', sw, 'ra-leg-a') + leg(34, 51, 66, 6, '#45393a', '#2a2221', sw, 'ra-leg-b') +
                leg(50, 51, 66, 6, '#45393a', '#2a2221', sw, 'ra-leg-b') + leg(59, 50, 66, 6, '#45393a', '#2a2221', sw, 'ra-leg-a'),
            body:
                '<g class="ra-tail"><path d="' + cloudPath(13.5, 33, 5.4, 4.8, 6, .9, 3) + '" fill="' + W + '"' + o(sw) + '/></g>' +
                '<path d="' + wool + '" fill="' + W + '"' + o(sw) + '/><path d="' + wool + '" fill="url(#' + id + 'ws)"/>' +
                '<ellipse cx="31" cy="28" rx="13" ry="5.4" transform="rotate(-8 31 28)" fill="#fff" opacity=".65"/>' +
                '<g class="ra-head">' +
                '<ellipse cx="55.5" cy="33.5" rx="7" ry="3.4" transform="rotate(-22 55.5 33.5)" fill="' + face + '"' + o(sw) + '/>' +
                '<ellipse cx="55.2" cy="33.8" rx="4" ry="1.5" transform="rotate(-22 55.2 33.8)" fill="#e9a3a0"/>' +
                '<ellipse cx="85.5" cy="33.5" rx="7" ry="3.4" transform="rotate(22 85.5 33.5)" fill="' + face + '"' + o(sw) + '/>' +
                '<ellipse cx="85.8" cy="33.8" rx="4" ry="1.5" transform="rotate(22 85.8 33.8)" fill="#e9a3a0"/>' +
                '<ellipse cx="70.5" cy="39" rx="13" ry="13.6" fill="url(#' + id + 'f)"' + o(sw) + '/>' +
                '<path d="' + cloudPath(70.5, 26.5, 10.5, 6, 7, 1.1, 9) + '" fill="' + W + '"' + o(sw) + '/>' +
                '<ellipse cx="67" cy="24.6" rx="4.6" ry="2" fill="#fff" opacity=".7"/>' +
                eyes([[65.4, 38.4, 2.7, 3.3], [75.6, 38.4, 2.7, 3.3]], sw, '#120c0a', '#f1e6dd') +
                blush([[62, 44, 2.8, 1.5], [79, 44, 2.8, 1.5]]) +
                '<path d="M70.5 44.2v1.6M68.4 46.6q2.1 1.6 4.2 0" stroke="#8d7b77" stroke-width="1" fill="none" stroke-linecap="round"/>' +
                '</g>' +
                fx(80, 10, 1.1)
        };
    };

    // ── 牛：白底咖啡斑、大頭朝前、粉鼻子、奶油色小角、紅項圈金鈴鐺 ──
    DRAW.cow = function (id) {
        var sw = 1.7;
        var BR = '#9a6240';
        return {
            vb: '0 0 112 86', vars: '--ho:25% 85%;--to:90% 8%;--bob:1.8px;--jump:9px;--sit:12px;--eat:22deg;--eatd:1.8s;--nod:6deg',
            defs: lg(id + 'h', '#ffffff', '#eee4d6') + lg(id + 'm', '#ffc4bd', '#f29a95') + lg(id + 'g', '#ffe27a', '#e7ad2a') +
                '<clipPath id="' + id + 'c"><rect x="15" y="36" width="66" height="32" rx="16"/></clipPath>' +
                '<clipPath id="' + id + 'hc"><ellipse cx="84" cy="37" rx="17" ry="16"/></clipPath>',
            shadow: '<ellipse class="ra-shadow" cx="52" cy="79.2" rx="38" ry="5" fill="rgba(52,64,24,.26)"/>',
            legs:
                leg(27, 61, 79, 8, 'url(#' + id + 'h)', '#7a5543', sw, 'ra-leg-a') + leg(38, 62, 79, 8, 'url(#' + id + 'h)', '#7a5543', sw, 'ra-leg-b') +
                leg(59, 62, 79, 8, 'url(#' + id + 'h)', '#7a5543', sw, 'ra-leg-b') + leg(70, 61, 79, 8, 'url(#' + id + 'h)', '#7a5543', sw, 'ra-leg-a'),
            body:
                '<g class="ra-tail">' +
                '<path d="M17 43C11 47 9 54 10.5 61" stroke="' + OL + '" stroke-width="' + (2.4 + sw * 2) + '" fill="none" stroke-linecap="round" class="o"/>' +
                '<path d="M17 43C11 47 9 54 10.5 61" stroke="#f6f1e8" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
                '<ellipse cx="10.8" cy="63" rx="3" ry="4" fill="' + BR + '"' + o(sw) + '/></g>' +
                '<rect x="15" y="36" width="66" height="32" rx="16" fill="url(#' + id + 'h)"' + o(sw) + '/>' +
                '<ellipse cx="40" cy="40.6" rx="14" ry="2.6" fill="#fff" opacity=".7"/>' +
                '<g clip-path="url(#' + id + 'c)" fill="' + BR + '">' +
                '<path d="M24 33C38 32 43 45 35 52C29 57 20 51 17 44Z"/>' +
                '<path d="M50 41C58 37 67 42 63.5 49C60 54.5 51.5 52 49.5 47Z"/>' +
                '<ellipse cx="40" cy="69" rx="8" ry="4"/></g>' +
                                '<ellipse cx="50" cy="68.4" rx="5.4" ry="2.8" fill="url(#' + id + 'm)"' + o(sw * .8) + '/>' +
                '<path d="M66 51Q76 59 90 54" stroke="' + OL + '" stroke-width="' + (3.8 + sw * 2) + '" fill="none" stroke-linecap="round" class="o"/>' +
                '<path d="M66 51Q76 59 90 54" stroke="#e04a48" stroke-width="3.8" fill="none" stroke-linecap="round"/>' +
                '<g class="ra-head">' +
                '<ellipse cx="66.5" cy="31" rx="7.6" ry="3.8" transform="rotate(-18 66.5 31)" fill="' + BR + '"' + o(sw) + '/>' +
                '<ellipse cx="67" cy="31.3" rx="4.4" ry="1.7" transform="rotate(-18 67 31.3)" fill="#f2aaa5"/>' +
                '<ellipse cx="101.5" cy="31" rx="7.6" ry="3.8" transform="rotate(18 101.5 31)" fill="' + BR + '"' + o(sw) + '/>' +
                '<ellipse cx="101" cy="31.3" rx="4.4" ry="1.7" transform="rotate(18 101 31.3)" fill="#f2aaa5"/>' +
                '<ellipse cx="76.5" cy="20.5" rx="2.6" ry="4.2" transform="rotate(-22 76.5 20.5)" fill="#f7e7bf"' + o(sw) + '/>' +
                '<ellipse cx="91.5" cy="20.5" rx="2.6" ry="4.2" transform="rotate(22 91.5 20.5)" fill="#f7e7bf"' + o(sw) + '/>' +
                '<ellipse cx="84" cy="37" rx="17" ry="16" fill="url(#' + id + 'h)"' + o(sw) + '/>' +
                '<g clip-path="url(#' + id + 'hc)"><path d="M66 31C67 21 78 18 84 24C83 30 76 34 68 34Z" fill="' + BR + '"/></g>' +
                '<path d="M81 22.5c1.5-3 4.5-3.2 5.6-.8c-1.6-.6-2.8 0-3 1.6" fill="' + BR + '"' + o(sw * .7) + '/>' +
                '<ellipse cx="84" cy="46.5" rx="12.6" ry="8" fill="url(#' + id + 'm)"' + o(sw) + '/>' +
                '<ellipse cx="79.6" cy="46" rx="1.5" ry="2.1" fill="#c96d69"/><ellipse cx="88.4" cy="46" rx="1.5" ry="2.1" fill="#c96d69"/>' +
                '<path d="M81.4 50.4Q84 52.4 86.6 50.4" stroke="#b7605d" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
                '<ellipse cx="80" cy="42" rx="4" ry="1.4" fill="#fff" opacity=".5"/>' +
                eyes([[77, 34.6, 2.9, 3.5], [91, 34.6, 2.9, 3.5]], sw) +
                blush([[72.4, 41, 3.1, 1.6], [95.6, 41, 3.1, 1.6]]) +
                '</g>' +
                '<circle cx="77" cy="59" r="3.8" fill="url(#' + id + 'g)"' + o(sw * .9) + '/>' +
                '<path d="M75.2 59.6h3.6M77 60.2v1.8" stroke="#9c6a12" stroke-width=".9" stroke-linecap="round"/>' +
                fx(98, 8, 1.2)
        };
    };

    // ── 貓：橘色虎斑、白口鼻、大頭三分之二朝前、尾巴豎起來捲一下 ──
    DRAW.cat = function (id) {
        var sw = 1.4;
        var OR = '#e9853a', ST = '#cf6a24';
        return {
            vb: '0 0 70 58', vars: '--ho:30% 88%;--to:85% 95%;--bob:1.4px;--jump:7px;--sit:6px;--eat:20deg;--eatd:1.4s;--nod:8deg',
            defs: lg(id + 'f', '#ffbf6e', '#ee8c3a') +
                '<clipPath id="' + id + 'b"><ellipse cx="34" cy="40" rx="17" ry="10"/></clipPath>',
            shadow: '<ellipse class="ra-shadow" cx="35" cy="53.4" rx="19" ry="3.2" fill="rgba(52,64,24,.26)"/>',
            legs:
                leg(23.5, 42, 53.4, 5.2, 'url(#' + id + 'f)', '#fff6ea', sw, 'ra-leg-a') + leg(29.5, 43, 53.4, 5.2, 'url(#' + id + 'f)', '#fff6ea', sw, 'ra-leg-b') +
                leg(40, 43, 53.4, 5.2, 'url(#' + id + 'f)', '#fff6ea', sw, 'ra-leg-b') + leg(46, 42, 53.4, 5.2, 'url(#' + id + 'f)', '#fff6ea', sw, 'ra-leg-a'),
            body:
                '<g class="ra-tail">' +
                '<path d="M19 38C10 35 6.5 25 10 17.5C11.6 14 15.6 13.8 16.4 16.6" stroke="' + OL + '" stroke-width="' + (5.4 + sw * 2) + '" fill="none" stroke-linecap="round" class="o"/>' +
                '<path d="M19 38C10 35 6.5 25 10 17.5C11.6 14 15.6 13.8 16.4 16.6" stroke="' + OR + '" stroke-width="5.4" fill="none" stroke-linecap="round"/>' +
                '<path d="M8.2 26.5l4.2.4M8.6 21.4l3.8 1.2" stroke="' + ST + '" stroke-width="1.5" stroke-linecap="round"/></g>' +
                '<ellipse cx="34" cy="40" rx="17" ry="10" fill="url(#' + id + 'f)"' + o(sw) + '/>' +
                '<g clip-path="url(#' + id + 'b)"><ellipse cx="46" cy="45" rx="7" ry="7" fill="#fff6ea"/>' +
                '<path d="M25 30.5v5.5M30.5 30v6M36 30.5v5.5" stroke="' + ST + '" stroke-width="1.6" stroke-linecap="round"/></g>' +
                '<g class="ra-head">' +
                '<path d="M40.5 19.5L41.6 6.2L50.4 14Z" fill="url(#' + id + 'f)"' + o(sw) + '/>' +
                '<path d="M43 14.6L43.6 9.6L47.4 13.2Z" fill="#ffb1a4"/>' +
                '<path d="M54 14L62.4 6.4L63.4 19.5Z" fill="url(#' + id + 'f)"' + o(sw) + '/>' +
                '<path d="M57 13.2L60.8 9.8L61.2 14.6Z" fill="#ffb1a4"/>' +
                '<ellipse cx="52" cy="25" rx="14.2" ry="12.6" fill="url(#' + id + 'f)"' + o(sw) + '/>' +
                '<path d="M48 13.8l.4 3.6M52 13.2v3.8M56 13.8l-.4 3.6" stroke="' + ST + '" stroke-width="1.4" stroke-linecap="round"/>' +
                '<ellipse cx="52.4" cy="31" rx="6.6" ry="4.6" fill="#fff6ea"/>' +
                eyes([[46.4, 25.4, 2.5, 3.1], [58, 25.4, 2.5, 3.1]], sw) +
                blush([[43.2, 30, 2.6, 1.4], [61.4, 30, 2.6, 1.4]]) +
                '<path d="M51.2 28.6h2.4l-1.2 1.3z" fill="#f2737c" stroke="#c4505a" stroke-width=".5" stroke-linejoin="round"/>' +
                '<path d="M50 31.2Q51.2 32.9 52.4 31.4Q53.6 32.9 54.8 31.2" stroke="#8a4a2a" stroke-width=".9" fill="none" stroke-linecap="round"/>' +
                '<path d="M44.5 31l-4.4-.6M44.6 32.6l-4.2.9M60.4 31l4.4-.6M60.3 32.6l4.2.9" stroke="#8a4a2a" stroke-width=".55" opacity=".7" stroke-linecap="round"/>' +
                '</g>' +
                fx(60, 2, .9)
        };
    };

    // ── 狗：咖啡色、米白口鼻、深色垂耳（離開臉一點，不貼頭皮）、紅項圈金牌、吐舌頭 ──
    DRAW.dog = function (id) {
        var sw = 1.4;
        var BR = '#c98a52', EAR = '#8a5533', CR = '#fff1dc';
        return {
            vb: '0 0 76 62', vars: '--ho:28% 88%;--to:85% 90%;--bob:1.6px;--jump:8px;--sit:6.5px;--eat:22deg;--eatd:1.2s;--nod:8deg',
            defs: lg(id + 'd', '#dca36b', '#b87742') +
                '<clipPath id="' + id + 'b"><ellipse cx="36" cy="42" rx="19" ry="11"/></clipPath>',
            shadow: '<ellipse class="ra-shadow" cx="38" cy="57" rx="21" ry="3.4" fill="rgba(52,64,24,.26)"/>',
            legs:
                leg(24.5, 45, 57, 5.8, 'url(#' + id + 'd)', CR, sw, 'ra-leg-a') + leg(31, 46, 57, 5.8, 'url(#' + id + 'd)', CR, sw, 'ra-leg-b') +
                leg(43, 46, 57, 5.8, 'url(#' + id + 'd)', CR, sw, 'ra-leg-b') + leg(49.5, 45, 57, 5.8, 'url(#' + id + 'd)', CR, sw, 'ra-leg-a'),
            body:
                '<g class="ra-tail ra-wag-fast">' +
                '<path d="M19.5 38C12 35 9.5 26 12 19.5" stroke="' + OL + '" stroke-width="' + (5 + sw * 2) + '" fill="none" stroke-linecap="round" class="o"/>' +
                '<path d="M19.5 38C12 35 9.5 26 12 19.5" stroke="' + BR + '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
                '<path d="M11 24.5C10.6 22.4 11 20.8 12 19.5" stroke="' + CR + '" stroke-width="5" fill="none" stroke-linecap="round"/></g>' +
                '<ellipse cx="36" cy="42" rx="19" ry="11" fill="url(#' + id + 'd)"' + o(sw) + '/>' +
                '<g clip-path="url(#' + id + 'b)"><ellipse cx="42" cy="51.5" rx="13" ry="5" fill="' + CR + '"/><ellipse cx="49" cy="44" rx="6" ry="8" fill="' + CR + '"/></g>' +
                '<g class="ra-head">' +
                '<path d="M64.5 16C69 17 70.5 23 69 28C67 28.6 65.4 25 64 21Z" fill="' + EAR + '"' + o(sw) + '/>' +
                '<path d="M44 37.5Q51.5 43 60 40" stroke="' + OL + '" stroke-width="' + (3.4 + sw * 2) + '" fill="none" stroke-linecap="round" class="o"/>' +
                '<path d="M44 37.5Q51.5 43 60 40" stroke="#e04a48" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
                '<circle cx="51.6" cy="43.6" r="2.7" fill="#ffd257" stroke="#a87418" stroke-width=".8"/>' +
                '<ellipse cx="54.5" cy="26.5" rx="14" ry="13" fill="url(#' + id + 'd)"' + o(sw) + '/>' +
                '<path d="M54 14.2C56.4 18 56.6 22.4 56 26.5L52.5 26.5C52.4 22 52.5 17.6 54 14.2Z" fill="' + CR + '"/>' +
                '<ellipse cx="60.5" cy="32" rx="9.4" ry="6.6" fill="' + CR + '"' + o(sw) + '/>' +
                '<ellipse cx="66.6" cy="29.2" rx="3" ry="2.2" fill="#3a2620"/><ellipse cx="65.8" cy="28.4" rx="1" ry=".6" fill="#fff" opacity=".8"/>' +
                '<path d="M62.4 35.8Q63 40.8 65.4 40.4Q67 39.6 66 35.2Z" fill="#ff8e9b" stroke="#c9505f" stroke-width=".8" stroke-linejoin="round"/>' +
                '<path d="M60 34.4Q63.2 37.4 67.4 34" stroke="#6b3f2a" stroke-width="1" fill="none" stroke-linecap="round"/>' +
                eyes([[50.6, 24.8, 2.5, 3.1], [60.2, 23.8, 2.5, 3.1]], sw) +
                blush([[47.4, 30.6, 2.6, 1.4]]) +
                '<path d="M46.5 14.5C40 14.8 37.4 22.5 38.6 30C39.2 33.8 43 34.6 44.6 31.4C46.2 27.6 47.6 21 49.6 16.4Z" fill="' + EAR + '"' + o(sw) + '/>' +
                '</g>' +
                fx(64, 3, 1)
        };
    };

    function svg(opts) {
        opts = opts || {};
        ensureCss(opts.doc);
        var id = 'ra' + (++uid) + '_';
        var kind = DRAW[opts.kind] ? opts.kind : 'chicken';
        var d = DRAW[kind](id);
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + d.vb + '" class="ra-animal rk-' + kind + '" style="' + d.vars + '" aria-hidden="true">' +
            '<defs>' + d.defs + '</defs>' + d.shadow + '<g class="ra-all">' + d.legs + '<g class="ra-body">' + d.body + '</g></g></svg>';
    }

    // ── 產出：雞蛋／羊毛／牛奶。上等的多一顆金色小星星、顏色暖一點 ──
    function sparkle(x, y, r) {
        return '<path d="M' + x + ' ' + (y - r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) +
            'Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'Z" fill="#ffd54a" stroke="#c9921a" stroke-width=".6"/>';
    }
    var PRODUCT = {
        egg: function (id, good) {
            return grad(id + 'e', good ? '#fff6dc' : '#ffffff', good ? '#f0d49a' : '#e6ddcf') +
                '<ellipse cx="32" cy="58" rx="13" ry="3" fill="rgba(40,50,25,.25)"/>' +
                '<path d="M32 18C43 18 48 36 46 46C44 55 38 58 32 58C26 58 20 55 18 46C16 36 21 18 32 18Z" fill="url(#' + id + 'e)" stroke="' + (good ? '#c9a45c' : '#bfb4a2') + '" stroke-width="1.6"/>' +
                '<ellipse cx="26" cy="32" rx="3.5" ry="6" transform="rotate(-18 26 32)" fill="#fff" opacity=".8"/>';
        },
        // 羊毛團：跟羊身上同一種棉花糖畫法（邊幾乎平滑、一塊高光），不再是一堆小圓泡泡
        wool: function (id, good) {
            var d = cloudPath(32, 43, 17, 12, 12, 1, 4);
            return grad(id + 'w', '#ffffff', good ? '#f3e6c4' : '#e8dfcb') +
                '<ellipse cx="33" cy="58" rx="18" ry="3" fill="rgba(40,50,25,.25)"/>' +
                '<path d="' + d + '" fill="url(#' + id + 'w)" stroke="' + (good ? '#d9c79c' : '#d6ccb8') + '" stroke-width="1.2"/>' +
                '<ellipse cx="27" cy="37" rx="7.5" ry="3.4" transform="rotate(-10 27 37)" fill="#fff" opacity=".7"/>';
        },
        milk: function (id, good) {
            return '<ellipse cx="32" cy="59" rx="12" ry="2.8" fill="rgba(40,50,25,.25)"/>' +
                '<path d="M26 16H38V22C38 24 44 28 44 34V54C44 57 42 58 40 58H24C22 58 20 57 20 54V34C20 28 26 24 26 22Z" fill="#dff1fb" stroke="#7fa6bd" stroke-width="1.4" opacity=".95"/>' +
                '<path d="M21.5 36H42.5V54C42.5 56 41 56.6 40 56.6H24C23 56.6 21.5 56 21.5 54Z" fill="#fffdf6"/>' +
                '<rect x="25" y="10" width="14" height="7" rx="2" fill="' + (good ? '#e8b53a' : '#5a9bd4') + '" stroke="' + (good ? '#a8761a' : '#2f6a9e') + '" stroke-width="1"/>' +
                '<path d="M25 30v20" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>';
        },
        // 蜂蜜（10-11 蜂箱）：玻璃罐裝琥珀色的蜜，布蓋綁繩、罐口流下一滴、標籤上一格蜂巢
        honey: function (id, good) {
            return '<ellipse cx="32" cy="59" rx="14" ry="3" fill="rgba(40,50,25,.25)"/>' +
                '<path d="M19 26C19 23 21 22 23 22H41C43 22 45 23 45 26V53C45 56 43 57 41 57H23C21 57 19 56 19 53Z" fill="#fbe7b4" stroke="#b07a2a" stroke-width="1.5"/>' +
                '<path d="M20.5 31H43.5V53C43.5 55 42.4 55.6 41 55.6H23C21.6 55.6 20.5 55 20.5 53Z" fill="' + (good ? '#f5a623' : '#eda733') + '"/>' +
                '<path d="M20.5 31H43.5V35C36 37 28 33 20.5 36Z" fill="#f7c35a" opacity=".8"/>' +
                '<path d="M23.5 34v17" stroke="#fff6dc" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>' +
                '<path d="M17 21C17 16 22 14 32 14S47 16 47 21C47 23 45 24 43 24H21C19 24 17 23 17 21Z" fill="#e8d2a6" stroke="#a87a44" stroke-width="1.3"/>' +
                '<path d="M19 22.5C24 25 40 25 45 22.5" stroke="#b0783a" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
                '<path d="M40 24C40 27 41.5 28 41.5 30C41.5 31.5 40 32 39.2 31C38.6 30 39 28 40 24Z" fill="#eda733" stroke="#b07a2a" stroke-width=".8"/>' +
                '<rect x="26" y="39" width="12" height="10" rx="2.2" fill="#fffaf0" stroke="#b07a2a" stroke-width="1"/>' +
                '<path d="M32 41.2L34.3 42.5V45.1L32 46.4L29.7 45.1V42.5Z" fill="#eda733" stroke="#a8761a" stroke-width=".8"/>';
        }
    };
    // 蜜蜂（蜂箱旁邊飛來飛去的那幾隻）：圓滾滾黃身體兩條黑紋、兩片透明翅膀
    function beeSvg() {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 20" class="ra-bee" aria-hidden="true">' +
            '<ellipse cx="9" cy="6" rx="5" ry="4" fill="rgba(235,248,255,.85)" stroke="#7fa6bd" stroke-width=".8"/>' +
            '<ellipse cx="14" cy="5.5" rx="4" ry="3.4" fill="rgba(235,248,255,.85)" stroke="#7fa6bd" stroke-width=".8"/>' +
            '<ellipse cx="12" cy="12.5" rx="7.5" ry="5.5" fill="#f6c443" stroke="#4a3418" stroke-width="1.3"/>' +
            '<path d="M10 7.6Q8.6 12.5 10 17.4M14 7.4Q15.4 12.5 14 17.6" stroke="#3a2a14" stroke-width="2.2" fill="none"/>' +
            '<circle cx="18.2" cy="11.4" r="1.1" fill="#3a2a14"/></svg>';
    }
    function productSvg(product, quality) {
        var id = 'rp' + (++uid) + '_';
        var good = quality === 'good';
        var body = (PRODUCT[product] || PRODUCT.egg)(id, good);
        var defs = '';
        body = body.replace(/<radialGradient[\s\S]*?<\/radialGradient>/g, function (m) { defs += m; return ''; });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="ra-product" aria-hidden="true"><defs>' + defs + '</defs>' +
            body + (good ? sparkle(48, 16, 7) + sparkle(14, 26, 4) : '') + '</svg>';
    }

    // ── 地上的雜物：雜草一叢、糞便一坨（圓滾滾的，不要畫得噁心）──
    var LITTER = {
        weed: function () {
            var blades = [[-22, 22], [-10, 26], [2, 28], [14, 25], [26, 21], [-30, 16], [34, 15]].map(function (b, i) {
                return '<path d="M32 54Q' + (32 + b[0] * 0.3) + ' ' + (54 - b[1] * 0.6) + ' ' + (32 + b[0] * 0.55) + ' ' + (54 - b[1]) + '" stroke="' + (i % 2 ? '#4f8a2e' : '#6aa83a') + '" stroke-width="3.2" fill="none" stroke-linecap="round"/>';
            }).join('');
            return '<ellipse cx="32" cy="55" rx="16" ry="3.2" fill="rgba(40,50,25,.25)"/>' + blades +
                '<circle cx="24" cy="30" r="2.6" fill="#fff4b0"/><circle cx="24" cy="30" r="1.1" fill="#e8b53a"/>' +
                '<circle cx="42" cy="34" r="2.2" fill="#fff"/><circle cx="42" cy="34" r=".9" fill="#e8b53a"/>';
        },
        poop: function () {
            return '<ellipse cx="32" cy="55" rx="15" ry="3.2" fill="rgba(40,50,25,.25)"/>' +
                '<path d="M17 52C15 46 21 43 25 44C23 39 28 35 32 37C31 32 35 29 38 31C42 33 41 38 39 40C44 40 47 45 45 49C49 50 48 55 43 55H21C18 55 17 54 17 52Z" fill="#8a5a36" stroke="#5e3b20" stroke-width="1.4" stroke-linejoin="round"/>' +
                '<path d="M24 47q8 3 16 -1M28 41q5 2 9 -1" stroke="#6e4527" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
                '<ellipse cx="29" cy="45" rx="2.4" ry="1.2" fill="#b07a4e" opacity=".8"/>' +
                '<path d="M40 22q2 -3 4 0M22 26q2 -3 4 0" stroke="#7a8a5a" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".7"/>';
        }
    };
    function litterSvg(kind) {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="ra-litter ra-litter-' + kind + '" aria-hidden="true">' +
            (LITTER[kind] || LITTER.weed)() + '</svg>';
    }

    // ── 飼料槽裡的乾草 ─────────────────────────────
    // 疊在阿洛那張空飼料槽（ranch_obj_trough_v1.png，768×768）正上方，座標就是那張圖的像素。
    // amount 0～1：0＝空槽；少＝槽底散幾撮；多＝堆高，蓋過後面那片槽壁、冒出槽口一點。
    // 草只畫在槽口裡面（clipPath），不會蓋到前面那片木板。同一個 amount 每次長一樣（固定亂數）。
    var TROUGH = {
        FL: [244, 497], FR: [656, 284],        // 前面那片木板的上緣（草不能超過這條線往下）
        BBL: [138, 437], BBR: [563, 235],      // 後面槽壁跟槽底的交界
        BTL: [122, 405], BTR: [546, 150]       // 後面槽壁上緣再高一點（堆滿時冒出槽口）
    };
    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    function troughHaySvg(amount) {
        var a = Math.max(0, Math.min(1, Number(amount) || 0));
        var out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 768" class="ra-trough-hay" aria-hidden="true">';
        if (a <= 0) return out + '</svg>';
        var T = TROUGH;
        var seed = 7;
        var rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
        // 草堆的上緣：從槽底那條往上升到槽口上面
        var h = .12 + a * .88;
        var L = lerp(T.BBL, T.BTL, h), R = lerp(T.BBR, T.BTR, h);
        // 只擋前面那片木板與左邊那片端板（離我們近的兩面）；後壁、右端的內側會被草堆蓋住
        var clip = 'M' + [T.FL, T.FR, [T.BTR[0] + 30, T.BTR[1] - 40], [T.BTL[0] + 16, T.BTL[1] - 26]].map(function (p) { return p.join(' '); }).join('L') + 'Z';
        out += '<defs><clipPath id="raTroughClip"><path d="' + clip + '"/></clipPath>' +
            '<linearGradient id="raHayG" gradientUnits="userSpaceOnUse" x1="0" y1="150" x2="0" y2="500"><stop offset="0" stop-color="#efd489"/><stop offset=".55" stop-color="#d4aa55"/><stop offset="1" stop-color="#a87a36"/></linearGradient></defs>' +
            '<g clip-path="url(#raTroughClip)">';
        var P = function (q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); };
        // 草堆底色：沒有描邊的一整片，上緣用一小段一小段往上拱的弧，毛毛的
        var topPts = [];
        if (a > .25) {
            var N = 16, d = 'M' + P(T.FL) + 'L' + P(T.FR) + 'L' + P(R);
            for (var i = 1; i <= N; i++) {
                var p0 = lerp(R, L, (i - 1) / N), p1 = lerp(R, L, i / N);
                var lift = (6 + rnd() * 12) * (.5 + a);
                var mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - lift];
                d += 'Q' + P(mid) + ' ' + P(p1);
                topPts.push(mid);
            }
            out += '<path d="' + d + 'Z" fill="url(#raHayG)"/>';
        }
        // 草絲：三層——底下暗的、中間的、上面亮的；方向大多順著槽子（往右上 27 度），亂一點
        var AX = Math.atan2(T.FR[1] - T.FL[1], T.FR[0] - T.FL[0]);
        function spot(lowOnly) {
            var u = rnd(), v = rnd();
            var f = lerp(T.FL, T.FR, u);
            var t = a <= .25 || lowOnly ? lerp(T.BBL, T.BBR, u) : lerp(L, R, u);
            if (a <= .25) v = .1 + v * .8;
            return [f[0] + (t[0] - f[0]) * v, f[1] + (t[1] - f[1]) * v, v];
        }
        function strand(x, y, ang, len, col, w) {
            var x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
            var bend = (rnd() - .5) * len * .35;
            return '<path d="M' + x.toFixed(1) + ' ' + y.toFixed(1) + 'Q' + ((x + x2) / 2 - Math.sin(ang) * bend).toFixed(1) + ' ' + ((y + y2) / 2 + Math.cos(ang) * bend).toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1) +
                '" stroke="' + col + '" stroke-width="' + w.toFixed(1) + '"/>';
        }
        var LAYERS = [
            { n: 30 + a * 150, col: ['#9e6f2e', '#b0823a', '#8f6327'], w: 2.6, len: [18, 38], spread: .9 },
            { n: 20 + a * 220, col: ['#d1a54f', '#dcb35e', '#c7963f'], w: 2.3, len: [20, 44], spread: .8 },
            { n: 10 + a * 150, col: ['#f3dc96', '#fbecbc', '#ead08a'], w: 2, len: [16, 36], spread: .7, high: true }
        ];
        var strands = '';
        LAYERS.forEach(function (Ly) {
            for (var k = 0; k < Math.round(Ly.n); k++) {
                var s0 = spot();
                if (Ly.high && s0[2] < .35 && a > .25) s0 = spot();   // 亮的多落在上面
                var ang = AX + (rnd() - .5) * Math.PI * Ly.spread;
                strands += strand(s0[0], s0[1], ang, Ly.len[0] + rnd() * (Ly.len[1] - Ly.len[0]), Ly.col[Math.floor(rnd() * Ly.col.length)], Ly.w + rnd() * .8);
            }
        });
        // 上緣亂翹的草：從草堆頂往上戳
        topPts.forEach(function (q) {
            for (var j = 0; j < 3; j++) {
                var ang2 = -Math.PI / 2 + (rnd() - .5) * 1.8;
                strands += strand(q[0] + (rnd() - .5) * 20, q[1] + 4, ang2, 12 + rnd() * 18, ['#e6c46a', '#f3dc96', '#d1a54f'][j], 1.9);
            }
        });
        out += '<g fill="none" stroke-linecap="round">' + strands + '</g>';
        // 靠前緣一條陰影，看起來草是塞在槽裡
        out += '<path d="M' + P(T.FL) + 'L' + P(T.FR) + '" stroke="rgba(92,58,24,.4)" stroke-width="9"/>';
        return out + '</g></svg>';
    }

    // ── 狗屋：紅屋頂、木牆、拱門、門牌一個腳印，門口右邊一個飯碗（bowl＝今天裝過了，裡面有飼料）──
    // 腳底在 viewBox 的 y 88（92%）。夜裡狗睡在門口、貓睡在屋頂（位置在 farm_ranch.js）
    function doghouseSvg(opts) {
        opts = opts || {};
        var id = 'rh' + (++uid) + '_', sw = 1.6;
        var kib = opts.bowl ? [[92.6, 80.4], [96, 79.6], [99.6, 80.2], [97.8, 81.6], [94.4, 81.8], [101.4, 81.4]].map(function (k) {
            return '<circle cx="' + k[0] + '" cy="' + k[1] + '" r="1.6" fill="#c7854c" stroke="#7a4a28" stroke-width=".6"/>';
        }).join('') : '';
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 96" class="ra-doghouse" aria-hidden="true"><defs>' +
            lg(id + 'w', '#f7d6a0', '#dca566') + lg(id + 'r', '#f27667', '#d6463d') + lg(id + 'b', '#ff8173', '#d9443c') + '</defs>' +
            '<ellipse cx="54" cy="88.4" rx="47" ry="5.4" fill="rgba(52,64,24,.26)"/>' +
            '<rect x="17" y="44" width="66" height="44.4" rx="4" fill="url(#' + id + 'w)"' + o(sw) + '/>' +
            '<path d="M18.5 66H81.5M18.5 77.5H81.5" stroke="#c48a4e" stroke-width="1.2" opacity=".75"/>' +
            '<path d="M29 54.5v11.5M71 54.5v11.5M33 66.5v11M67 66.5v11M27 78v10M73 78v10" stroke="#c48a4e" stroke-width="1" opacity=".55"/>' +
            '<path d="M38 88.4V74Q38 64 50 64Q62 64 62 74V88.4Z" fill="#4b3024"' + o(sw) + '/>' +
            '<path d="M41.6 87V74.4Q41.6 67.6 50 67.6" stroke="#6e4838" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>' +
            '<rect x="42.5" y="55.6" width="15" height="6.8" rx="2.2" fill="#fff6e4"' + o(sw * .8) + '/>' +
            '<g fill="#c48a4e"><ellipse cx="50" cy="60.2" rx="1.9" ry="1.4"/><circle cx="47.8" cy="58.2" r=".8"/><circle cx="49.3" cy="57.4" r=".8"/><circle cx="50.7" cy="57.4" r=".8"/><circle cx="52.2" cy="58.2" r=".8"/></g>' +
            '<path d="M5.6 49L50 12.6L94.4 49Q96 53.6 91.4 54.2H8.6Q4 53.6 5.6 49Z" fill="url(#' + id + 'r)"' + o(sw) + '/>' +
            '<path d="M20.5 42.4H79.5M32.5 32.6H67.5M43 24H57" stroke="#bd3a32" stroke-width="1.2" opacity=".55" stroke-linecap="round"/>' +
            '<path d="M16 46.4L50 18.6" stroke="#fff" stroke-width="2.2" opacity=".35" stroke-linecap="round"/>' +
            '<circle cx="50" cy="13" r="3.1" fill="#ffd257"' + o(sw * .8) + '/>' +
            '<path d="M87 81.6H107L104.2 88.6Q103.6 90.2 102 90.2H92Q90.4 90.2 89.8 88.6Z" fill="url(#' + id + 'b)"' + o(sw) + '/>' +
            '<ellipse cx="97" cy="81.6" rx="10" ry="2.6" fill="' + (opts.bowl ? '#a5673a' : '#7d3a33') + '"' + o(sw * .8) + '/>' + kib +
            '<path d="M93 86h8" stroke="#fff" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>' +
            '</svg>';
    }

    // ── 野狼來過、叼走了雞：一撮雞毛＋一串腳印往圍欄去（那一天才擺）──
    function wolfSignSvg() {
        var feather = function (x, y, r, s) {
            return '<g transform="translate(' + x + ' ' + y + ') rotate(' + r + ') scale(' + s + ')">' +
                '<path d="M-7 0C-3 -3.2 4 -3.4 8 0C4 3.2 -3 3 -7 0Z" fill="#fffdf8" stroke="#cfc4b4" stroke-width=".8"/>' +
                '<path d="M-8.5 .4L7 0" stroke="#d9cfc0" stroke-width=".7" stroke-linecap="round"/></g>';
        };
        var paw = function (x, y, r) {
            return '<g transform="translate(' + x + ' ' + y + ') rotate(' + r + ')" fill="rgba(92,70,48,.5)">' +
                '<ellipse cx="0" cy="1.6" rx="2.4" ry="1.9"/><ellipse cx="-2.6" cy="-1.6" rx=".9" ry="1.2"/><ellipse cx="-.9" cy="-2.7" rx=".9" ry="1.2"/>' +
                '<ellipse cx=".9" cy="-2.7" rx=".9" ry="1.2"/><ellipse cx="2.6" cy="-1.6" rx=".9" ry="1.2"/></g>';
        };
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40" class="ra-wolfsign" aria-hidden="true">' +
            paw(38, 30, 70) + paw(50, 24, 64) + paw(62, 19, 70) + paw(73, 13, 64) +
            feather(12, 26, -20, 1) + feather(22, 31, 25, .85) + feather(17, 34, 160, .7) + feather(28, 25, -60, .75) + feather(8, 32, 100, .6) +
            '</svg>';
    }

    root.FarmAnimalDraw = { svg: svg, productSvg: productSvg, beeSvg: beeSvg, litterSvg: litterSvg, troughHaySvg: troughHaySvg, doghouseSvg: doghouseSvg, wolfSignSvg: wolfSignSvg, KINDS: ['chicken', 'chick', 'sheep', 'cow', 'cat', 'dog'] };
})(typeof window !== 'undefined' ? window : this);
