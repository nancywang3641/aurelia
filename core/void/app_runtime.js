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
            +   'if (!window.generateRaw) {'
            +     'var gr = null;'
            +     'if (P && P.generateRaw) gr = function(){ return P.generateRaw.apply(P, arguments); };'
            +     'else if (P && P.TavernHelper && P.TavernHelper.generateRaw) gr = function(){ return P.TavernHelper.generateRaw.apply(P.TavernHelper, arguments); };'
            +     'else { try { var c = P.SillyTavern.getContext(); if (c && c.generateRaw) gr = function(){ return c.generateRaw.apply(c, arguments); }; } catch(e){} }'
            +     'if (gr) window.generateRaw = gr;'
            +   '}'
            +   'window.OS_IMAGE_MANAGER = window.OS_IMAGE_MANAGER || (P && P.OS_IMAGE_MANAGER) || null;'
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
