// ============================================================
// ranch_draw.js — 牧場動物用程式畫（局外 LAB）
// ------------------------------------------------------------
// FarmAnimalDraw.svg({ kind }) → '<svg …>'，一律面朝右（往左走時外層水平翻過來）。
//   kind：chicken 雞 / sheep 羊 / cow 牛 / cat 寵物貓
//   腳分 a、b 兩組，走路時交替擺動（class ra-leg-a / ra-leg-b）；身體有一點上下晃（ra-body）。
//   陰影畫在最底下，不跟著晃。
// ============================================================
(function (root) {
    'use strict';

    var uid = 0;

    var CSS = [
        '.ra-leg-a,.ra-leg-b{transform-box:fill-box;transform-origin:50% 0;}',
        '.ra-body{transform-box:view-box;}',
        '.ra-walk .ra-leg-a{animation:ra-step .42s ease-in-out infinite alternate;}',
        '.ra-walk .ra-leg-b{animation:ra-step .42s ease-in-out infinite alternate-reverse;}',
        '.ra-walk .ra-body{animation:ra-bob .21s ease-in-out infinite alternate;}',
        '.ra-idle .ra-head{transform-box:fill-box;transform-origin:30% 90%;animation:ra-peck 3.2s ease-in-out infinite;}',
        '.ra-idle .ra-tail{transform-box:fill-box;transform-origin:90% 20%;animation:ra-wag 2.4s ease-in-out infinite;}',
        '@keyframes ra-step{from{transform:rotate(-16deg)}to{transform:rotate(16deg)}}',
        '@keyframes ra-bob{from{transform:translateY(0)}to{transform:translateY(-1.2px)}}',
        '@keyframes ra-peck{0%,70%,100%{transform:rotate(0)}78%{transform:rotate(14deg)}86%{transform:rotate(0)}}',
        '@keyframes ra-wag{0%,100%{transform:rotate(0)}50%{transform:rotate(-10deg)}}',
        // 狗的尾巴：不管走著停著都在搖，搖得比較快
        '.ra-wag-fast{transform-box:fill-box;transform-origin:90% 90%;animation:ra-wagf .32s ease-in-out infinite alternate!important;}',
        '@keyframes ra-wagf{from{transform:rotate(-14deg)}to{transform:rotate(12deg)}}',
        '@media (prefers-reduced-motion:reduce){.ra-walk *,.ra-idle *{animation:none!important;}}'
    ].join('');

    function ensureCss(doc) {
        doc = doc || (typeof document !== 'undefined' ? document : null);
        if (!doc || doc.getElementById('ra-style')) return;
        var st = doc.createElement('style');
        st.id = 'ra-style';
        st.textContent = CSS;
        (doc.head || doc.documentElement).appendChild(st);
    }

    function grad(id, a, b) {
        return '<radialGradient id="' + id + '" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></radialGradient>';
    }
    function leg(x, y1, y2, w, fill, hoof, cls) {
        return '<g class="' + cls + '"><rect x="' + (x - w / 2) + '" y="' + y1 + '" width="' + w + '" height="' + (y2 - y1) + '" rx="' + (w / 2) + '" fill="' + fill + '"/>' +
            (hoof ? '<rect x="' + (x - w / 2) + '" y="' + (y2 - 2.4) + '" width="' + w + '" height="2.6" rx="1" fill="' + hoof + '"/>' : '') + '</g>';
    }

    // 一團毛的外形：沿著橢圓繞一圈，每一段往外拱一點（大小不一），裡面不畫線。
    // n＝拱幾段、amp＝拱多高（0 幾乎是平滑的橢圓）、seed＝固定亂數，同一隻每次長一樣。
    function cloudPath(cx, cy, rx, ry, n, amp, seed) {
        var s = seed || 1;
        var rnd = function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
        var ph = -Math.PI / 2 + .3;
        var at = function (t, grow) { return [cx + (rx + grow) * Math.cos(t), cy + (ry + grow) * Math.sin(t)]; };
        var f = function (p) { return p[0].toFixed(2) + ' ' + p[1].toFixed(2); };
        var d = 'M' + f(at(ph, 0));
        for (var i = 0; i < n; i++) {
            var t0 = ph + i / n * Math.PI * 2, t1 = ph + (i + 1) / n * Math.PI * 2;
            var p0 = at(t0, 0), p1 = at(t1, 0), top = at((t0 + t1) / 2, amp * (.65 + .7 * rnd()));
            // 二次曲線的中點＝(p0＋2C＋p1)/4，要它剛好落在 top：C＝2·top－(p0＋p1)/2
            d += 'Q' + f([2 * top[0] - (p0[0] + p1[0]) / 2, 2 * top[1] - (p0[1] + p1[1]) / 2]) + ' ' + f(p1);
        }
        return d + 'Z';
    }
    // 羊毛：棉花糖——邊幾乎是平滑的，靠一塊高光和底下的陰影做出蓬鬆感（09-29 她在三種裡挑的 B）
    function sheepWool(W, id) {
        var d = cloudPath(45, 37, 25, 16, 18, 1.1, 5);
        return '<path d="' + d + '" fill="' + W + '" stroke="#d6ccb8" stroke-width="1"/><path d="' + d + '" fill="url(#' + id + 'ws)"/>' +
            '<ellipse cx="38" cy="29" rx="11" ry="5" transform="rotate(-8 38 29)" fill="#fff" opacity=".6"/>';
    }

    var DRAW = {
        // 雞：白身、紅冠、黃嘴，尾巴翹起來
        chicken: function (id) {
            return {
                vb: '0 0 60 60',
                body:
                    '<g class="ra-leg-a"><path d="M27 44L26 54M26 54l-3 1M26 54l3 1" stroke="#e3962c" stroke-width="1.8" stroke-linecap="round" fill="none"/></g>' +
                    '<g class="ra-leg-b"><path d="M33 44L34 54M34 54l-3 1M34 54l3 1" stroke="#e3962c" stroke-width="1.8" stroke-linecap="round" fill="none"/></g>' +
                    '<g class="ra-body">' +
                    '<g class="ra-tail"><path d="M18 32C9 26 8 15 13 12C15 19 18 22 22 25C20 18 21 13 25 11C25 19 26 24 28 28Z" fill="#fbf8f2" stroke="#c9c1b4" stroke-width="1"/></g>' +
                    '<ellipse cx="31" cy="36" rx="15" ry="11" fill="url(#' + id + 'b)" stroke="#c9c1b4" stroke-width="1"/>' +
                    '<path d="M22 34C27 30 34 31 37 36C33 41 26 42 22 38Z" fill="#efe8dc" stroke="#d3cabb" stroke-width=".8"/>' +
                    '<g class="ra-head"><circle cx="42" cy="24" r="7.5" fill="url(#' + id + 'b)" stroke="#c9c1b4" stroke-width="1"/>' +
                    '<path d="M37 18.5C37 14 40 13 41 16C41.5 12 45 12 45 16C46 13.5 49 14.5 47.5 18.5Z" fill="#e0413a" stroke="#a82a25" stroke-width=".7"/>' +
                    '<path d="M48.5 22.5L55 24.8L48.5 27Z" fill="#f2b233" stroke="#b97a17" stroke-width=".6"/>' +
                    '<ellipse cx="47.5" cy="29.5" rx="1.6" ry="2.6" fill="#e0413a"/>' +
                    '<circle cx="44.5" cy="22" r="1.3" fill="#2a2522"/><circle cx="44.9" cy="21.6" r=".4" fill="#fff"/></g>' +
                    '</g>',
                defs: grad(id + 'b', '#ffffff', '#e9e2d6'),
                shadow: '<ellipse cx="30" cy="55" rx="14" ry="3" fill="rgba(40,50,25,.28)"/>'
            };
        },
        // 羊：一團米白羊毛、黑臉黑腳
        // 09-29 她：「那個泡泡的毛，我不太喜歡…有點起雞皮」——舊版是八顆小圓各自描邊疊起來，一顆顆輪廓＝泡泡群。
        // 改成一整團毛：邊幾乎平滑，裡面不畫一圈一圈的線（見 sheepWool）。
        sheep: function (id) {
            var W = 'url(#' + id + 'w)';
            return {
                vb: '0 0 90 70',
                body:
                    leg(30, 44, 63, 4.2, '#3b342f', '#1f1a17', 'ra-leg-a') + leg(38, 45, 63, 4.2, '#3b342f', '#1f1a17', 'ra-leg-b') +
                    leg(55, 45, 63, 4.2, '#3b342f', '#1f1a17', 'ra-leg-b') + leg(63, 44, 63, 4.2, '#3b342f', '#1f1a17', 'ra-leg-a') +
                    '<g class="ra-body">' + sheepWool(W, id) +
                    '<g class="ra-tail"><path d="' + cloudPath(18, 34, 5, 4.4, 6, .8, 3) + '" fill="' + W + '" stroke="#d6ccb8" stroke-width=".9"/></g>' +
                    '<g class="ra-head"><ellipse cx="72" cy="31" rx="8" ry="10.5" transform="rotate(18 72 31)" fill="#3b342f"/>' +
                    '<ellipse cx="64.5" cy="25" rx="5" ry="2.4" transform="rotate(-25 64.5 25)" fill="#2e2824"/>' +
                    '<path d="' + cloudPath(70, 20.5, 6.2, 3.6, 5, .8, 9) + '" fill="' + W + '" stroke="#d6ccb8" stroke-width=".8"/>' +
                    '<circle cx="74.5" cy="28" r="1.8" fill="#fff"/><circle cx="75" cy="28.3" r="1" fill="#1b1714"/>' +
                    '<ellipse cx="77.5" cy="37" rx="2.2" ry="1.4" fill="#5a4f48"/></g>' +
                    '</g>',
                defs: grad(id + 'w', '#fffdf6', '#e8dfcb') +
                    '<linearGradient id="' + id + 'ws" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#e4d9c3" stop-opacity="0"/><stop offset="1" stop-color="#d6c8ad" stop-opacity=".9"/></linearGradient>',
                shadow: '<ellipse cx="46" cy="64" rx="26" ry="4" fill="rgba(40,50,25,.28)"/>'
            };
        },
        // 牛：白底黑斑、粉鼻子、小角，肚子下一點粉紅
        cow: function (id) {
            return {
                vb: '0 0 110 80',
                body:
                    leg(30, 50, 74, 6, '#f4f1ea', '#3a302a', 'ra-leg-a') + leg(40, 51, 74, 6, '#f4f1ea', '#3a302a', 'ra-leg-b') +
                    leg(66, 51, 74, 6, '#f4f1ea', '#3a302a', 'ra-leg-b') + leg(76, 50, 74, 6, '#f4f1ea', '#3a302a', 'ra-leg-a') +
                    '<g class="ra-body">' +
                    '<g class="ra-tail"><path d="M24 32C17 38 16 48 17 55" stroke="#e8e2d6" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M15 53c1 4 4 5 5 1z" fill="#3a302a"/></g>' +
                    '<clipPath id="' + id + 'c"><rect x="22" y="26" width="62" height="32" rx="15"/></clipPath>' +
                    '<rect x="22" y="26" width="62" height="32" rx="15" fill="url(#' + id + 'h)" stroke="#cfc7b8" stroke-width="1.1"/>' +
                    '<g clip-path="url(#' + id + 'c)" fill="#2f2926"><path d="M30 24C40 26 42 36 36 42C30 46 24 40 22 34Z"/><path d="M52 30C60 28 66 34 62 40C58 44 50 42 49 36Z"/><path d="M70 46C76 44 84 48 84 58L68 58C66 52 66 48 70 46Z"/></g>' +
                    '<ellipse cx="48" cy="58" rx="6" ry="3.4" fill="#f2b3b0" stroke="#d98c88" stroke-width=".8"/>' +
                    '<g class="ra-head">' +
                    '<path d="M86 20L84 13M97 20L100 14" stroke="#efe3c6" stroke-width="2.6" stroke-linecap="round"/>' +
                    '<ellipse cx="80.5" cy="24" rx="5" ry="2.6" transform="rotate(-20 80.5 24)" fill="#2f2926"/>' +
                    '<rect x="81" y="17" width="20" height="26" rx="9" fill="url(#' + id + 'h)" stroke="#cfc7b8" stroke-width="1.1"/>' +
                    '<path d="M81 26C85 20 92 19 94 24C92 28 86 30 81 30Z" fill="#2f2926"/>' +
                    '<ellipse cx="94" cy="39" rx="8.5" ry="6" fill="#f2b3b0" stroke="#d98c88" stroke-width=".9"/>' +
                    '<ellipse cx="91.5" cy="39.5" rx="1.3" ry="1.8" fill="#b86a66"/><ellipse cx="96.5" cy="39.5" rx="1.3" ry="1.8" fill="#b86a66"/>' +
                    '<circle cx="93" cy="28" r="1.9" fill="#1b1714"/><circle cx="93.5" cy="27.4" r=".6" fill="#fff"/></g>' +
                    '</g>',
                defs: grad(id + 'h', '#ffffff', '#ece6da'),
                shadow: '<ellipse cx="54" cy="75" rx="33" ry="4.5" fill="rgba(40,50,25,.28)"/>'
            };
        },
        // 寵物：一隻橘色虎斑貓，尾巴豎起來
        cat: function (id) {
            return {
                vb: '0 0 64 52',
                body:
                    leg(22, 32, 46, 3.6, '#e8913c', '#f6e2c8', 'ra-leg-a') + leg(28, 33, 46, 3.6, '#e8913c', '#f6e2c8', 'ra-leg-b') +
                    leg(40, 33, 46, 3.6, '#e8913c', '#f6e2c8', 'ra-leg-b') + leg(46, 32, 46, 3.6, '#e8913c', '#f6e2c8', 'ra-leg-a') +
                    '<g class="ra-body">' +
                    '<g class="ra-tail"><path d="M17 28C9 24 8 14 12 8" stroke="#e8913c" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M10.5 13l3 1M9.5 18l3.4.6" stroke="#c46a22" stroke-width="1.4" stroke-linecap="round"/></g>' +
                    '<ellipse cx="33" cy="30" rx="16" ry="8.5" fill="url(#' + id + 'f)" stroke="#c46a22" stroke-width="1"/>' +
                    '<path d="M26 22.5v5M32 22v6M38 22.5v5" stroke="#c46a22" stroke-width="1.5" stroke-linecap="round"/>' +
                    '<g class="ra-head"><path d="M42 16L44 7L49 13L55 13L59 7L60 17Z" fill="#e8913c" stroke="#c46a22" stroke-width="1" stroke-linejoin="round"/>' +
                    '<path d="M45 11l1-2 2 3zM58 11l-.6-2-2 3z" fill="#f6b6a8"/>' +
                    '<circle cx="51.5" cy="21" r="9" fill="url(#' + id + 'f)" stroke="#c46a22" stroke-width="1"/>' +
                    '<path d="M48 13.5v3M51.5 13v3.4M55 13.5v3" stroke="#c46a22" stroke-width="1.2" stroke-linecap="round"/>' +
                    '<ellipse cx="47.8" cy="21" rx="1.4" ry="1.9" fill="#2a2522"/><ellipse cx="55.2" cy="21" rx="1.4" ry="1.9" fill="#2a2522"/>' +
                    '<path d="M50.4 24.6h2.2l-1.1 1.2z" fill="#e0706a"/><path d="M51.5 25.8q-1.6 1.8 -3 .6M51.5 25.8q1.6 1.8 3 .6" stroke="#8a4a22" stroke-width=".8" fill="none"/>' +
                    '<path d="M44 24.5l-4-.8M44 26l-4 .6M59 24.5l4-.8M59 26l4 .6" stroke="#fff" stroke-width=".6" opacity=".85"/></g>' +
                    '</g>',
                defs: grad(id + 'f', '#ffc07a', '#e8913c'),
                shadow: '<ellipse cx="34" cy="47" rx="17" ry="3" fill="rgba(40,50,25,.28)"/>'
            };
        }
    };

    // 寵物二號：咖啡色小土狗，垂耳朵、米色口鼻、紅項圈，尾巴一直搖
    DRAW.dog = function (id) {
        return {
            vb: '0 0 72 58',
            body:
                leg(24, 34, 51, 4.2, '#8f5f3b', '#f1dfc2', 'ra-leg-a') + leg(31, 35, 51, 4.2, '#8f5f3b', '#f1dfc2', 'ra-leg-b') +
                leg(44, 35, 51, 4.2, '#8f5f3b', '#f1dfc2', 'ra-leg-b') + leg(51, 34, 51, 4.2, '#8f5f3b', '#f1dfc2', 'ra-leg-a') +
                '<g class="ra-body">' +
                // 尾巴：月牙形往前捲到背上（貓是一根直直豎起來的，狗要捲），淺色毛在捲過來的尖端
                '<g class="ra-tail ra-wag-fast">' +
                '<path d="M21 31C10 28 8 11 20 6.5Q26 4.5 28.5 9.5C22 9 16.5 13 17.5 20C18 24 20 26 22.5 27Z" fill="url(#' + id + 'd)" stroke="#6e4527" stroke-width="1"/>' +
                '<path d="M20 6.5Q26 4.5 28.5 9.5C25.5 9.3 22.5 10.2 20.5 12C19.2 10.5 19 8.2 20 6.5Z" fill="#f1dfc2"/>' +
                '</g>' +
                '<ellipse cx="36" cy="31" rx="18" ry="10" fill="url(#' + id + 'd)" stroke="#6e4527" stroke-width="1"/>' +
                '<path d="M43 36C47 40 53 39 55 33C52 36 47 36 43 36Z" fill="#f1dfc2"/>' +
                '<g class="ra-head">' +
                '<path d="M49 29.5C53 32 58 31.5 61 29" stroke="#d6453c" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
                '<circle cx="56.5" cy="33" r="2" fill="#f2c14a" stroke="#b98a1f" stroke-width=".6"/>' +
                '<circle cx="56" cy="20" r="10" fill="url(#' + id + 'd)" stroke="#6e4527" stroke-width="1"/>' +
                '<ellipse cx="63.5" cy="24.5" rx="6.5" ry="4.8" fill="#f1dfc2" stroke="#caa87c" stroke-width=".8"/>' +
                '<ellipse cx="68.4" cy="22.6" rx="2.3" ry="1.8" fill="#2a2320"/>' +
                '<path d="M64 27.8q1.5 3.2 3.6 .4" fill="#e77f8a" stroke="#b9545f" stroke-width=".5"/>' +
                '<circle cx="59.5" cy="17.5" r="1.6" fill="#1f1a17"/><circle cx="60" cy="17" r=".5" fill="#fff"/>' +
                // 垂耳：形狀照原本那片，只從耳根往外抬一點（rotate 以耳根為軸），下半截離開臉頰留一條小縫。
                //   她說過：不要尖耳、不要翹起來，就是垂耳，只是別貼頭皮
                '<path d="M50 12C45 13 44 22 47 26C50 25 52 19 53 14Z" transform="rotate(22 52 13)" fill="#6e4527" stroke="#5a3820" stroke-width=".7"/>' +
                '</g>' +
                '</g>',
            defs: grad(id + 'd', '#c58e5f', '#8f5f3b'),
            shadow: '<ellipse cx="38" cy="52" rx="19" ry="3.2" fill="rgba(40,50,25,.28)"/>'
        };
    };

    function svg(opts) {
        opts = opts || {};
        ensureCss(opts.doc);
        var id = 'ra' + (++uid) + '_';
        var d = (DRAW[opts.kind] || DRAW.chicken)(id);
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + d.vb + '" class="ra-animal" aria-hidden="true">' +
            '<defs>' + d.defs + '</defs>' + d.shadow + d.body + '</svg>';
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
        }
    };
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

    root.FarmAnimalDraw = { svg: svg, productSvg: productSvg, litterSvg: litterSvg, troughHaySvg: troughHaySvg, KINDS: ['chicken', 'sheep', 'cow', 'cat', 'dog'] };
})(typeof window !== 'undefined' ? window : this);
