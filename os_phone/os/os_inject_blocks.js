// ----------------------------------------------------------------
// [檔案] os_inject_blocks.js
// 路徑：os_phone/os/os_inject_blocks.js
// 職責：奧瑞亞每一種注入都包成一塊帶名字的 <名字>…</名字>（跟 <人物名冊> 一樣），
//       送出去那一大包系統提示裡看得出哪一段是誰；上下文面板「逐段看」也照這些名字切。
//       酒館助手 injectPrompts 在這裡統一包；直接用 setExtensionPrompt 的那幾支自己叫 wrap。
//       已經自己包好一塊的（<劇情總結>、<人物名冊>…）原樣不動。
// 🚨 新增一種 aurelia_* 注入：在 NAMES 加一行，不然它不會被包、面板也認不出來。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    // id（開頭符合即可，VN 指令會帶 _d4_system 這種尾巴）→ 那一塊的名字
    const NAMES = {
        aurelia_vn_rules_pre: 'VN指令開頭',
        aurelia_vn_rules: 'VN指令',
        aurelia_grand_summary: '劇情總結',
        aurelia_vn_memory: '劇情記憶',
        aurelia_app_memory: '手機記憶',
        aurelia_phone_now: '手機上剛發生的事',
        aurelia_app_data: '應用資料',
        aurelia_sticker_list: '表情包清單',
        aurelia_vn_tags: 'VN組件說明',
        aurelia_fx_list: '畫面特效清單',
        aurelia_wx_chatroom_ids: '聊天室代號對照',
        aurelia_map_theater: '地圖小劇場',
        aurelia_state_brief: '狀態面板',
        aurelia_avs_rules: '狀態面板規則',
        aurelia_avatar_reminder: '頭像提醒',
        aurelia_achv_reminder: '成就提醒',
        aurelia_director_brief: '導演提示',
        aurelia_npc_dossier: '人物名冊',
        aurelia_mc_status: '主角狀態',
        aurelia_blacklist: '黑名單'
    };
    // 自己包好、名字跟上面不同的那幾塊（面板認塊時也要認得）
    const EXTRA_TAGS = ['人物檔案'];

    function nameOf(id) {
        id = String(id || '');
        let best = '';
        Object.keys(NAMES).forEach(function (k) {
            if ((id === k || id.indexOf(k + '_') === 0) && k.length > best.length) best = k;
        });
        return best ? NAMES[best] : '';
    }

    // 已經是「一塊或好幾塊 <X>…</X>」就不再包
    function _alreadyBlock(t) {
        return /^<([^\s>\/]+)[^>]*>/.test(t) && /<\/[^\s>]+>$/.test(t);
    }
    function wrap(id, text) {
        const name = nameOf(id);
        const t = String(text == null ? '' : text).trim();
        if (!name || !t || _alreadyBlock(t)) return text;
        return '<' + name + '>\n' + t + '\n</' + name + '>';
    }
    function tagNames() {
        const out = {};
        Object.keys(NAMES).forEach(function (k) { out[NAMES[k]] = 1; });
        EXTRA_TAGS.forEach(function (n) { out[n] = 1; });
        return Object.keys(out);
    }

    // 酒館助手的 injectPrompts：奧瑞亞的那幾種進來時包好再交出去
    (function hook(n) {
        const th = win.TavernHelper;
        if (th && typeof th.injectPrompts === 'function') {
            if (th.injectPrompts._aureliaBlocks) return;
            const orig = th.injectPrompts;
            const wrapped = function (prompts) {
                try {
                    if (Array.isArray(prompts)) {
                        prompts = prompts.map(function (p) {
                            if (!p || !p.id || typeof p.content !== 'string') return p;
                            const c = wrap(p.id, p.content);
                            return c === p.content ? p : Object.assign({}, p, { content: c });
                        });
                    }
                } catch (e) {}
                const args = Array.prototype.slice.call(arguments);
                args[0] = prompts;
                return orig.apply(this, args);
            };
            wrapped._aureliaBlocks = true;
            try { th.injectPrompts = wrapped; } catch (e) {}
            return;
        }
        if (n > 0) setTimeout(function () { hook(n - 1); }, 1000);
    })(30);

    const API = { NAMES: NAMES, nameOf: nameOf, wrap: wrap, tagNames: tagNames };
    win.AURELIA_BLOCK = API;
    window.AURELIA_BLOCK = API;
})();
