// core/void/app_runtime.js
// 把一份「完整 HTML app」跑進 iframe，並把酒館 API 橋接進去。
// 商店預覽與手機桌面開啟共用同一個 mountAppIframe —— 唯一負責 iframe + API 橋接的地方。
(function () {
    'use strict';
    const win = window;

    // 注入到 app HTML 最前面的橋接 bootstrap：在 app 自身 script 之前跑，
    // 從 window.parent 把酒館 API 補進 iframe 全域（srcdoc 同源、可讀 parent）。
    // generateRaw 多來源容錯：主頁全域 → 酒館助手 → 原生 getContext()。
    function _bridgeScript(preview) {
        return '<scr' + 'ipt>(function(){'
            + 'var P; try { P = window.parent; } catch(e){ return; }'
            + 'try {'
            +   'window.__IS_PREVIEW = ' + (preview ? 'true' : 'false') + ';'
            // generateRaw：呼叫當下即時解析(避時序)。優先序＝酒館助手(object-form，PANEL_DEV_GUIDE 用的就是它) →
            // 原生 → getContext → 最後妥協才用奧瑞亞 OS_API.chat(把 ordered_prompts 的 content 串成 prompt)。
            +   'if (!window.generateRaw) window.generateRaw = function(cfg){'
            +     'var Q = window.parent;'
            +     'if (Q && Q.TavernHelper && typeof Q.TavernHelper.generateRaw === "function") return Q.TavernHelper.generateRaw(cfg);'
            +     'if (Q && typeof Q.generateRaw === "function") return Q.generateRaw(cfg);'
            +     'try { var ctx = Q.SillyTavern.getContext(); if (ctx && typeof ctx.generateRaw === "function") return ctx.generateRaw(cfg); } catch(e){}'
            +     'if (Q && Q.OS_API && typeof Q.OS_API.chat === "function") {'
            +       'var t = "";'
            +       'if (typeof cfg === "string") t = cfg;'
            +       'else if (cfg) { if (Array.isArray(cfg.ordered_prompts)) cfg.ordered_prompts.forEach(function(p){ if (p && typeof p === "object" && p.content) t += p.content + "\\n"; }); if (cfg.user_input && String(cfg.user_input).trim()) t += "\\n" + cfg.user_input; }'
            +       'var conf = (Q.OS_SETTINGS && Q.OS_SETTINGS.getConfig && Q.OS_SETTINGS.getConfig()) || {};'
            +       'return new Promise(function(res, rej){ Q.OS_API.chat([{role:"user",content:t||" "}], conf, null, res, rej, {disableTyping:true}); });'
            +     '}'
            +     'return Promise.reject(new Error("找不到可用的 AI 後端(generateRaw/OS_API)"));'
            +   '};'
            +   'window.OS_IMAGE_MANAGER = window.OS_IMAGE_MANAGER || (P && P.OS_IMAGE_MANAGER) || null;'
            +   'window.OS_API           = window.OS_API           || (P && P.OS_API) || null;'
            +   'window.TavernHelper     = window.TavernHelper     || (P && P.TavernHelper) || null;'
            +   'window.SillyTavern      = window.SillyTavern      || (P && P.SillyTavern) || null;'
            + '} catch(e) { console.warn("[app bridge]", e); }'
            + '})();</scr' + 'ipt>';
    }

    // container: 掛載容器；html: 完整 HTML 字串；opts.preview: true=預覽(生圖走佔位、不燒額度)
    // 回傳 cleanup()。手機殼清空容器時 iframe 會一併被移除，cleanup 為保險。
    function mountAppIframe(container, html, opts) {
        opts = opts || {};
        if (!container) return function () {};
        container.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.className = 'app-iframe';
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals');
        // 橋接 bootstrap 要在 app 自身 script 前跑，且不能擠在 <!DOCTYPE> 之前(會觸發 quirks mode 壞版面)；
        // 有 <head> 就插進 head 開頭、否則退回最前面。
        const boot = _bridgeScript(!!opts.preview);
        const src = String(html == null ? '' : html);
        iframe.srcdoc = /<head[^>]*>/i.test(src) ? src.replace(/<head[^>]*>/i, function (m) { return m + boot; }) : (boot + src);
        container.appendChild(iframe);
        return function cleanup() { try { iframe.remove(); } catch (e) {} };
    }

    win.AppRuntime = { mountAppIframe: mountAppIframe };
    console.log('✅ AppRuntime（app iframe 執行器）模組就緒');
})();
