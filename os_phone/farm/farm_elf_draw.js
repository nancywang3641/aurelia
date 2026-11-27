// ============================================================
// farm_elf_draw.js — 小精靈的樣子（11-23，程式畫的 SVG）
// ------------------------------------------------------------
// 丹和阿洛雇的小精靈（規則在 VPS garden_elves.js）。照小斐整理的企劃：同一套身形，靠換色和一個小配件分個性——
//   勤奮＝頭巾、偷懶＝叼著草、怪癖＝歪歪的怪帽子。
// 姿勢：work（站著，畫面上會一彈一彈）、sit（坐著打瞌睡，眼睛閉起來）、sleep（夜裡縮成一團）。
// FarmElfDraw.svg({ color, acc, pose }) → SVG 字串（viewBox 0 -4 40 56，腳底在下緣）
// 做客畫面共用（11-23 起牧場也畫小精靈）：後院（farm_visit.js）和牧場（farm_ranch.js 做客模式）
//   照同一套決定牠現在在哪、什麼樣子——FarmElfDraw.view(e, log, day, night, hasRanch) → { pose, where, rec }、say()、node()。
// ============================================================
(function () {
    'use strict';

    // 顏色來自伺服器（#rrggbb）：只認這種格式，別的換成預設綠
    function safeColor(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? c : '#7fb069'; }
    function shade(hex, k) {
        var n = parseInt(hex.slice(1), 16);
        var r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
        return 'rgb(' + Math.min(255, r) + ',' + Math.min(255, g) + ',' + Math.min(255, b) + ')';
    }

    function svg(opt) {
        var o = opt || {}, col = safeColor(o.color), dark = shade(col, 0.72), pose = o.pose || 'work';
        var sit = pose === 'sit' || pose === 'sleep';
        var bodyY = sit ? 30 : 26, bodyRy = sit ? 13 : 15;
        var headY = sit ? 21 : 17;
        var out = '<svg class="fe-svg" viewBox="0 -4 40 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
        // 腳（站著才看得到）
        if (!sit) out += '<rect x="13" y="40" width="5" height="9" rx="2.5" fill="' + dark + '"/><rect x="22" y="40" width="5" height="9" rx="2.5" fill="' + dark + '"/>';
        // 身體
        out += '<ellipse cx="20" cy="' + (bodyY + 8) + '" rx="12" ry="' + bodyRy * 0.75 + '" fill="' + col + '"/>';
        // 尖耳朵
        out += '<path d="M7 ' + headY + ' L1 ' + (headY - 6) + ' L9 ' + (headY - 3) + 'Z" fill="#f3d9b8"/><path d="M33 ' + headY + ' L39 ' + (headY - 6) + ' L31 ' + (headY - 3) + 'Z" fill="#f3d9b8"/>';
        // 頭
        out += '<circle cx="20" cy="' + headY + '" r="11" fill="#f6e2c6"/>';
        // 臉
        if (sit) {
            out += '<path d="M14 ' + (headY + 1) + ' q2 2 4 0 M22 ' + (headY + 1) + ' q2 2 4 0" stroke="#4a3322" stroke-width="1.3" fill="none" stroke-linecap="round"/>';
        } else {
            out += '<circle cx="16" cy="' + (headY + 1) + '" r="1.6" fill="#3a2a1c"/><circle cx="24" cy="' + (headY + 1) + '" r="1.6" fill="#3a2a1c"/>';
            out += '<path d="M17.5 ' + (headY + 5) + ' q2.5 2 5 0" stroke="#7a4a32" stroke-width="1.1" fill="none" stroke-linecap="round"/>';
        }
        out += '<circle cx="13.5" cy="' + (headY + 4) + '" r="1.8" fill="#f2a7a0" opacity=".6"/><circle cx="26.5" cy="' + (headY + 4) + '" r="1.8" fill="#f2a7a0" opacity=".6"/>';
        // 配件
        if (o.acc === 'scarf') {
            out += '<path d="M9 ' + (headY - 5) + ' Q20 ' + (headY - 11) + ' 31 ' + (headY - 5) + ' L31 ' + (headY - 1) + ' Q20 ' + (headY - 7) + ' 9 ' + (headY - 1) + 'Z" fill="#d9534f"/>';
            out += '<path d="M30 ' + (headY - 3) + ' l5 -2 l-1 5Z" fill="#b8403c"/>';
        } else if (o.acc === 'straw') {
            out += '<path d="M23 ' + (headY + 5) + ' L35 ' + (headY + 1) + '" stroke="#d8b65a" stroke-width="1.4" stroke-linecap="round"/>';
            out += '<path d="M35 ' + (headY + 1) + ' l2 -2 M35 ' + (headY + 1) + ' l2.4 0.6" stroke="#c9a346" stroke-width="1" stroke-linecap="round"/>';
        } else if (o.acc === 'hat') {
            out += '<path d="M8 ' + (headY - 6) + ' L33 ' + (headY - 8) + ' L26 ' + (headY - 18) + ' Q24 ' + (headY - 21) + ' 21 ' + (headY - 17) + 'Z" fill="#6c4ab6"/>';
            out += '<circle cx="21" cy="' + (headY - 17) + '" r="2.2" fill="#f6c945"/>';
            out += '<rect x="7" y="' + (headY - 8) + '" width="27" height="3.5" rx="1.6" fill="#4f3590" transform="rotate(-4 20 ' + (headY - 6) + ')"/>';
        }
        // 手
        out += sit ? '<ellipse cx="9" cy="' + (bodyY + 9) + '" rx="3" ry="2.4" fill="' + dark + '"/><ellipse cx="31" cy="' + (bodyY + 9) + '" rx="3" ry="2.4" fill="' + dark + '"/>'
                   : '<ellipse cx="8" cy="' + (bodyY + 6) + '" rx="2.6" ry="3.4" fill="' + dark + '"/><ellipse cx="32" cy="' + (bodyY + 6) + '" rx="2.6" ry="3.4" fill="' + dark + '"/>';
        return out + '</svg>';
    }

    // ── 做客畫面：牠現在在哪 ──
    var SLOTN = { am: '早班', pm: '晚班' };
    // 一班裡做的事分兩邊：牧場那幾樣、後院那幾樣（伺服器那邊的 rec.did，見 VPS garden_elves.js 的 DID）
    var RANCH_DID = ['feed', 'refill', 'collect', 'milk', 'shear', 'clean', 'pull', 'pet', 'shelter'];
    var YARD_DID = ['water', 'harvest', 'plant', 'rush', 'honey', 'ship', 'tie'];
    function seedOf(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }
    function todayRec(e, log, day) {
        var list = (log || []).filter(function (r) { return r.kind === 'shift' && r.elf === e.id && r.day === day; });
        return list[list.length - 1] || null;
    }
    // pose：夜裡 sleep；今天還沒上過班 wait（工具棚邊等）；請假 away（不在）；做到一半打瞌睡 sit；其他 work
    // where：sleep／wait 在後院工具棚邊；怕動物那種、他家沒牧場的一律後院；這班只做了牧場的事＝牧場，兩邊都做了＝每個鐘頭換一邊
    function view(e, log, day, night, hasRanch) {
        var rec = todayRec(e, log, day), pose;
        if (night) pose = 'sleep';
        else if (!rec) pose = 'wait';
        else if (rec.status === 'absent' || rec.status === 'rest' || rec.status === 'quit') pose = 'away';   // 請假、放假、辭職：不在
        else pose = rec.slept ? 'sit' : 'work';
        var where = 'yard';
        if ((pose === 'work' || pose === 'sit') && hasRanch && !/不肯進牧場/.test(e.quirk || '')) {
            var did = (rec && rec.did) || {};
            var r = RANCH_DID.some(function (k) { return did[k]; }), y = YARD_DID.some(function (k) { return did[k]; });
            var hour = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
            if (r && !y) where = 'ranch';
            else if (r && y) where = seedOf(e.id + ':' + day + ':' + hour) % 2 ? 'ranch' : 'yard';
        }
        return { pose: pose, where: where, rec: rec };
    }
    function say(e, v) {
        if (v.pose === 'sleep') return '夜裡在工具棚邊睡覺';
        if (v.pose === 'wait') return '今天' + SLOTN[e.slot] + '還沒上（' + (e.slot === 'am' ? '09:00' : '15:00') + '開始）';
        return v.rec && v.rec.text ? v.rec.text.replace(/^第 \d+ 日/, '今天') : '';
    }
    function escName(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    // 畫面上那一隻：外層 fw-pos 跟底圖一樣大（translate 的 % ＝底圖的 %），樣式在 farm.css 的 .fv-elf
    function node(e, pose, at) {
        var pos = document.createElement('div');
        pos.className = 'fw-pos fv-elf-pos';
        pos.style.transform = 'translate(' + at.x.toFixed(2) + '%,' + at.y.toFixed(2) + '%)';
        var el = document.createElement('div');
        var lie = pose === 'sit' || pose === 'sleep';
        el.className = 'fw-player fv-elf is-' + pose + ' k-' + e.kind;
        el.setAttribute('data-fw-key', 'elf:' + e.id);   // 點牠＝走到牠旁邊（走路那支認這個）
        el.innerHTML = '<div class="fw-body">' + svg({ color: e.color, acc: e.acc, pose: lie ? 'sit' : 'work' }) + '</div>' +
            (lie ? '<span class="fv-zzz" aria-hidden="true"><i>z</i><i>z</i><i>z</i></span>' : '') +
            '<span class="fv-name">' + escName(e.name) + '</span>';
        pos.appendChild(el);
        return { pos: pos, el: el };
    }
    function title(e) { return '小精靈' + e.name + '（' + e.kindName + '・' + SLOTN[e.slot] + '）'; }

    window.FarmElfDraw = { svg: svg, safeColor: safeColor, view: view, say: say, node: node, title: title, seedOf: seedOf, SLOTN: SLOTN };
})();
