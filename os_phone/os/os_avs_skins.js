// ----------------------------------------------------------------
// [檔案] os_avs_skins.js — 視差通用預設的兩張面板皮
// 路徑：os_phone/os/os_avs_skins.js
// 職責：只放「視差紀錄」面板的 HTML/CSS 兩套外觀，給 os_avs.js 的視差預設按鈕取用。
//       同一份資料結構、同一個版面骨架，只換皮 —— 兩張皮的佔位符必須完全一致，
//       否則在展廳切換樣式時會有欄位突然消失。
//
// 裝飾素材：黑底生成圖經 unpremultiply 還原成透明 PNG，放 sound-files repo。
//   稜鏡＝發光金屬（走亮度曲線，保留光暈與框內中空）
//   柴郡＝實心紙貼紙（走模糊輪廓判定，紙張紋理不透光）
//
// ⚠️ CSS 一律用根容器前綴（.pxa- / .cxa-）起頭，不准出現裸的菜市場名 class —— 面板是插進
//    酒館訊息裡的，全域樣式表會互相蓋（.section-title 被 settings_manager.css 蓋白字的前例）。
// ⚠️ 佔位符只有 {{變數}}、{{變數.子欄位}}、{{#each}}/{{@key}}/{{@avatar}} 這幾種，
//    引擎沒有 {{#if}} —— 所以任何「有值才顯示」的設計都做不到，欄位一律給得出值。
// ----------------------------------------------------------------
(function () {
    const CDN = 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/avs_ui';
    const P = CDN + '/prism', C = CDN + '/cheshire';

    // ── 共用骨架：兩張皮的 HTML 只差 class 前綴與裝飾節點，資料欄位完全相同 ──
    const body = (p) => ''
        + `<div class="${p}-title"><b>視差紀錄</b><small>PARALLAX FIELD RECORD</small></div>`
        + `<div class="${p}-hud">`
        +   `<div class="h"><span class="k">所在世界</span><span class="v">{{所在世界}}</span></div>`
        +   `<div class="h"><span class="k">隨身</span><span class="v ${p}-coin"><span class="n">{{貨幣.持有}}</span><span class="u">{{貨幣.單位}}</span></span></div>`
        +   `<div class="h wide"><span class="k">本趟目標</span><span class="v">{{本趟目標}}</span></div>`
        + `</div>`
        + `<div class="${p}-div">${p === 'cxa' ? '<span></span>' : ''}</div>`
        + `<div class="${p}-sec"><b>同行與相識</b></div>`
        + `<div class="${p}-grid">{{#each 角色狀態}}`
        +   `<div class="${p}c">`
        +     (p === 'pxa' ? '<span class="pxac-cnr ul"></span><span class="pxac-cnr ur"></span><span class="pxac-cnr ll"></span><span class="pxac-cnr lr"></span>' : '')
        +     `<div class="${p}c-fav">{{好感度}}</div>`
        +     `<div class="${p}c-hd">`
        +       `<span class="${p}c-ring">`
        +         (p === 'cxa' ? '<i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i>' : '')
        +         `<img class="${p}c-ava" src="{{@avatar}}">`
        +       `</span>`
        +       `<span class="${p}c-nm"><b>{{@key}}</b><small>{{身分}}</small></span>`
        +     `</div>`
        +     `<div class="${p}c-form"><span class="k">形態</span><span class="v">{{形態}}</span></div>`
        +     `<div class="${p}c-rows">`
        +       `<span class="k">髮色</span><span class="v">{{髮色}}</span>`
        +       `<span class="k">眼色</span><span class="v">{{眼色}}</span>`
        +       `<span class="k">體型</span><span class="v">{{體型}}</span>`
        +     `</div>`
        +   `</div>`
        + `{{/each}}</div>`;

    // ══════════════ 稜鏡（量子白）══════════════
    const PRISM_HTML =
        '<div class="pxa">'
        + '<span class="pxa-cnr ll"></span><span class="pxa-cnr lr"></span>'
        + '<div class="pxa-top"></div><div class="pxa-bottom"></div>'
        + body('pxa')
        + '</div>';

    const PRISM_CSS = [
        '.pxa{position:relative;box-sizing:border-box;background:linear-gradient(180deg,rgba(250,252,254,.98),rgba(235,241,248,.98));',
        'border:1px solid rgba(201,162,39,.42);border-radius:14px;padding:62px 20px 40px;color:#2c3c52;',
        'font-family:-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;box-shadow:0 10px 34px rgba(15,22,35,.18);}',
        '.pxa *,.pxa *::before,.pxa *::after{box-sizing:border-box;}',
        '.pxa::before,.pxa::after,.pxa .pxa-cnr{position:absolute;content:"";width:58px;height:58px;background-size:contain;background-repeat:no-repeat;pointer-events:none;}',
        '.pxa::before{top:-6px;left:-6px;background-image:url(' + P + '/corner-ul.png);}',
        '.pxa::after{top:-6px;right:-6px;background-image:url(' + P + '/corner-ur.png);}',
        '.pxa .pxa-cnr.ll{bottom:-6px;left:-6px;background-image:url(' + P + '/corner-ll.png);}',
        '.pxa .pxa-cnr.lr{bottom:-6px;right:-6px;background-image:url(' + P + '/corner-lr.png);}',
        // 頂飾上緣突出面板外；上內距 62 是讓過它的下緣（top:-46 + 高 101 = 55）
        '.pxa .pxa-top{position:absolute;top:-46px;left:50%;transform:translateX(-50%);width:252px;height:101px;',
        'background:url(' + P + '/top.png) center/contain no-repeat;pointer-events:none;}',
        '.pxa .pxa-bottom{position:absolute;bottom:-26px;left:50%;transform:translateX(-50%);width:190px;height:78px;',
        'background:url(' + P + '/bottom.png) center/contain no-repeat;pointer-events:none;}',
        '.pxa .pxa-title{text-align:center;margin-bottom:16px;}',
        '.pxa .pxa-title b{display:block;font-size:15px;letter-spacing:.34em;font-weight:700;}',
        '.pxa .pxa-title small{display:block;margin-top:4px;font-size:8px;letter-spacing:.3em;color:#95a3b4;font-weight:800;}',
        '.pxa .pxa-hud{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;}',
        '.pxa .pxa-hud .h{background:rgba(255,255,255,.72);border:1px solid rgba(46,143,201,.16);border-radius:10px;padding:9px 12px;}',
        '.pxa .pxa-hud .h.wide{grid-column:1/-1;}',
        '.pxa .pxa-hud .k{display:block;font-size:8px;letter-spacing:.22em;color:#95a3b4;font-weight:800;margin-bottom:3px;}',
        '.pxa .pxa-hud .v{display:block;font-size:13px;line-height:1.5;font-weight:600;}',
        '.pxa .pxa-coin .n{font-size:19px;font-weight:800;color:#c9a227;}',
        '.pxa .pxa-coin .u{font-size:11px;color:#63748a;font-weight:700;margin-left:5px;}',
        '.pxa .pxa-div{height:38px;margin:2px 0 4px;background:url(' + P + '/divider.png) center/auto 100% no-repeat;}',
        '.pxa .pxa-sec{margin:0 2px 10px;}',
        '.pxa .pxa-sec b{font-size:11px;letter-spacing:.2em;font-weight:800;}',
        '.pxa .pxa-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;}',
        '.pxa .pxac{position:relative;background:rgba(255,255,255,.94);border:1px solid rgba(46,143,201,.16);border-radius:11px;',
        'padding:12px 13px 11px;box-shadow:0 2px 9px rgba(40,60,85,.07);}',
        // 🚨卡片四角的裝飾另立 class（pxac-cnr），不可跟卡片本體 .pxac 同名 ——
        //   同名的話一張卡會連同四個角一起吃到卡片的背景/邊框/內距，還得再寫一堆 reset 去清，很脆。
        '.pxa .pxac-cnr{position:absolute;width:19px;height:19px;background-size:contain;background-repeat:no-repeat;pointer-events:none;}',
        '.pxa .pxac-cnr.ul{top:-2px;left:-2px;background-image:url(' + P + '/inner-ul.png);}',
        '.pxa .pxac-cnr.ur{top:-2px;right:-2px;background-image:url(' + P + '/inner-ur.png);}',
        '.pxa .pxac-cnr.ll{bottom:-2px;left:-2px;background-image:url(' + P + '/inner-ll.png);}',
        '.pxa .pxac-cnr.lr{bottom:-2px;right:-2px;background-image:url(' + P + '/inner-lr.png);}',
        '.pxa .pxac-fav{position:absolute;top:11px;right:13px;font-size:10px;font-weight:800;color:#2e8fc9;}',
        '.pxa .pxac-hd{display:flex;align-items:center;gap:10px;padding-bottom:9px;margin-bottom:9px;border-bottom:1px dashed rgba(46,143,201,.16);}',
        // 環圖內圈只佔全寬約 63%，所以外徑 88 才裝得下 56 的頭像；環用 ::after 疊在頭像之上
        '.pxa .pxac-ring{position:relative;flex-shrink:0;width:88px;height:88px;display:grid;place-items:center;}',
        '.pxa .pxac-ring::after{content:"";position:absolute;inset:0;background:url(' + P + '/ring.png) center/contain no-repeat;pointer-events:none;}',
        '.pxa .pxac-ava{width:56px;height:56px;border-radius:50%;object-fit:cover;background:rgba(46,143,201,.10);}',
        '.pxa .pxac-nm{min-width:0;}',
        '.pxa .pxac-nm b{display:block;font-size:14px;font-weight:800;line-height:1.2;}',
        '.pxa .pxac-nm small{display:block;margin-top:2px;font-size:10px;color:#63748a;}',
        '.pxa .pxac-form{display:flex;align-items:center;gap:7px;margin-bottom:9px;padding:6px 9px;border-radius:8px;',
        'background:linear-gradient(90deg,rgba(46,143,201,.12),transparent);border-left:2px solid #2e8fc9;}',
        '.pxa .pxac-form .k{font-size:9px;letter-spacing:.16em;color:#95a3b4;font-weight:800;}',
        '.pxa .pxac-form .v{font-size:12px;font-weight:700;}',
        '.pxa .pxac-rows{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:11px;}',
        '.pxa .pxac-rows .k{color:#95a3b4;}',
        '.pxa .pxac-rows .v{font-weight:600;text-align:right;word-break:break-word;}',
    ].join('');

    // ══════════════ 柴郡（貼紙劫持）══════════════
    const CHESHIRE_HTML =
        '<div class="cxa">'
        + '<div class="cxa-head"></div><div class="cxa-bottom"></div>'
        + '<span class="cxa-stk cat"></span><span class="cxa-stk warn"></span>'
        + '<span class="cxa-stk ticket"></span><span class="cxa-stk barcode"></span><span class="cxa-stk tape"></span>'
        + body('cxa')
        + '</div>';

    const CHESHIRE_CSS = [
        '.cxa{position:relative;box-sizing:border-box;background:linear-gradient(180deg,#0d1211,#080b0a);',
        'border:1px solid rgba(145,255,24,.42);border-radius:6px;padding:104px 20px 42px;color:#dfffd5;',
        'font-family:-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;',
        'box-shadow:0 12px 40px rgba(0,0,0,.6),inset 0 0 0 1px rgba(145,255,24,.06);}',
        '.cxa *,.cxa *::before,.cxa *::after{box-sizing:border-box;}',
        '.cxa::before,.cxa::after{content:"";position:absolute;width:22px;height:22px;pointer-events:none;}',
        '.cxa::before{top:5px;left:5px;border-top:2px solid #91ff18;border-left:2px solid #91ff18;}',
        '.cxa::after{bottom:5px;right:5px;border-bottom:2px solid #91ff18;border-right:2px solid #91ff18;}',
        // 上內距 104 是讓過名牌下緣（top:-40 + 高 133 = 93），少了會把標題整個壓住
        '.cxa .cxa-head{position:absolute;top:-40px;left:50%;transform:translateX(-50%);width:266px;height:133px;',
        'background:url(' + C + '/header.png) center/contain no-repeat;pointer-events:none;}',
        '.cxa .cxa-bottom{position:absolute;bottom:-30px;left:50%;transform:translateX(-50%);width:210px;height:105px;',
        'background:url(' + C + '/bottom.png) center/contain no-repeat;pointer-events:none;}',
        // 貼紙刻意壓出框、帶角度：這批素材的設定就是事後貼上去劫持畫面，貼齊反而不對
        '.cxa .cxa-stk{position:absolute;background-size:contain;background-repeat:no-repeat;pointer-events:none;',
        'filter:drop-shadow(0 4px 10px rgba(0,0,0,.55));}',
        '.cxa .cxa-stk.cat{width:118px;height:118px;top:-40px;left:-34px;background-image:url(' + C + '/cat.png);transform:rotate(-9deg);}',
        '.cxa .cxa-stk.warn{width:104px;height:104px;top:-44px;right:-30px;background-image:url(' + C + '/warning-clip.png);transform:rotate(8deg);}',
        '.cxa .cxa-stk.ticket{width:116px;height:78px;bottom:-24px;left:-30px;background-image:url(' + C + '/ticket.png);transform:rotate(-6deg);}',
        '.cxa .cxa-stk.barcode{width:128px;height:86px;bottom:-26px;right:-28px;background-image:url(' + C + '/barcode.png);transform:rotate(5deg);}',
        // 膠帶的用途是把貼紙固定在面板上，所以壓在貓貼右下緣，不要單獨浮在版面中間
        '.cxa .cxa-stk.tape{width:92px;height:32px;top:62px;left:58px;background-image:url(' + C + '/tape.png);transform:rotate(-38deg);opacity:.95;}',
        '.cxa .cxa-title{text-align:center;margin-bottom:18px;}',
        '.cxa .cxa-title b{display:block;font-size:14px;letter-spacing:.34em;font-weight:800;color:#91ff18;}',
        '.cxa .cxa-title small{display:block;margin-top:4px;font-size:8px;letter-spacing:.3em;color:#6f8272;font-weight:800;}',
        '.cxa .cxa-hud{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px;}',
        '.cxa .cxa-hud .h{background:rgba(3,6,4,.6);border:1px solid rgba(145,255,24,.20);border-left:2px solid #91ff18;border-radius:3px;padding:9px 12px;}',
        '.cxa .cxa-hud .h.wide{grid-column:1/-1;}',
        '.cxa .cxa-hud .k{display:block;font-size:8px;letter-spacing:.22em;color:#6f8272;font-weight:800;margin-bottom:3px;}',
        '.cxa .cxa-hud .v{display:block;font-size:13px;line-height:1.5;font-weight:600;}',
        '.cxa .cxa-coin .n{font-size:19px;font-weight:800;color:#91ff18;}',
        '.cxa .cxa-coin .u{font-size:11px;color:#9fb3a4;font-weight:700;margin-left:5px;}',
        '.cxa .cxa-div{position:relative;height:44px;margin:6px 0 2px;}',
        '.cxa .cxa-div::before{content:"";position:absolute;top:50%;left:6%;right:6%;height:1px;background:rgba(145,255,24,.42);}',
        '.cxa .cxa-div span{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-2deg);width:158px;height:79px;',
        'background:url(' + C + '/grin.png) center/contain no-repeat;filter:drop-shadow(0 3px 8px rgba(0,0,0,.5));}',
        '.cxa .cxa-sec{margin:0 2px 10px;}',
        '.cxa .cxa-sec b{font-size:11px;letter-spacing:.2em;font-weight:800;color:#91ff18;}',
        '.cxa .cxa-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;}',
        '.cxa .cxac{position:relative;background:rgba(8,13,13,.92);border:1px solid rgba(145,255,24,.20);border-radius:4px;padding:12px 13px 11px;}',
        '.cxa .cxac::before,.cxa .cxac::after{content:"";position:absolute;width:12px;height:12px;pointer-events:none;}',
        '.cxa .cxac::before{top:3px;left:3px;border-top:1px solid rgba(145,255,24,.42);border-left:1px solid rgba(145,255,24,.42);}',
        '.cxa .cxac::after{bottom:3px;right:3px;border-bottom:1px solid rgba(145,255,24,.42);border-right:1px solid rgba(145,255,24,.42);}',
        '.cxa .cxac-fav{position:absolute;top:11px;right:13px;font-size:10px;font-weight:800;color:#91ff18;}',
        '.cxa .cxac-hd{display:flex;align-items:center;gap:10px;padding-bottom:9px;margin-bottom:9px;border-bottom:1px dashed rgba(145,255,24,.20);}',
        // 肖像圓框柴郡沒有素材（阿洛標明由程式繪製）→ 銀環＋四顆綠菱用 CSS 畫
        '.cxa .cxac-ring{position:relative;flex-shrink:0;width:88px;height:88px;display:grid;place-items:center;}',
        '.cxa .cxac-ring::before{content:"";position:absolute;inset:9px;border-radius:50%;border:2px solid rgba(190,205,195,.65);',
        'box-shadow:0 0 0 1px rgba(145,255,24,.22),inset 0 0 12px rgba(145,255,24,.10);}',
        '.cxa .cxac-ring i{position:absolute;width:13px;height:13px;background:linear-gradient(135deg,#e6ffd0,#91ff18);',
        'transform:rotate(45deg);box-shadow:0 0 7px rgba(145,255,24,.42);}',
        '.cxa .cxac-ring i.t{top:2px;left:calc(50% - 6.5px);}.cxa .cxac-ring i.b{bottom:2px;left:calc(50% - 6.5px);}',
        '.cxa .cxac-ring i.l{left:2px;top:calc(50% - 6.5px);}.cxa .cxac-ring i.r{right:2px;top:calc(50% - 6.5px);}',
        '.cxa .cxac-ava{width:56px;height:56px;border-radius:50%;object-fit:cover;background:rgba(145,255,24,.08);}',
        '.cxa .cxac-nm{min-width:0;}',
        '.cxa .cxac-nm b{display:block;font-size:14px;font-weight:800;line-height:1.2;}',
        '.cxa .cxac-nm small{display:block;margin-top:2px;font-size:10px;color:#9fb3a4;}',
        '.cxa .cxac-form{display:flex;align-items:center;gap:7px;margin-bottom:9px;padding:6px 9px;border-radius:3px;',
        'background:linear-gradient(90deg,rgba(145,255,24,.12),transparent);border-left:2px solid #91ff18;}',
        '.cxa .cxac-form .k{font-size:9px;letter-spacing:.16em;color:#6f8272;font-weight:800;}',
        '.cxa .cxac-form .v{font-size:12px;font-weight:700;}',
        '.cxa .cxac-rows{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:11px;}',
        '.cxa .cxac-rows .k{color:#6f8272;}',
        '.cxa .cxac-rows .v{font-weight:600;text-align:right;word-break:break-word;}',
    ].join('');

    window.OS_AVS_SKINS = {
        prism:    { key: 'prism',    label: '視差稜鏡', html: PRISM_HTML,    css: PRISM_CSS },
        cheshire: { key: 'cheshire', label: '柴郡貼紙', html: CHESHIRE_HTML, css: CHESHIRE_CSS },
    };
    console.log('🎴 [AVS Skins] 視差面板皮已就緒（稜鏡 / 柴郡）');
})();
