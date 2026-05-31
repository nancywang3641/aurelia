// ----------------------------------------------------------------
// [檔案] core/debug_console.js
// 職責：螢幕上的 console —— 攔截 console.log/warn/error/info + 全域錯誤，
//        顯示在一個可開關、可複製的浮窗裡。給「沒有 devtools」的環境用
//        （TauriTavern Rust 版、手機 PWA…），截圖即可拿到控制台資料。
// 暴露：window.AureliaDebug { log, show, hide, get, clear }
// 開關：localStorage 'aurelia_debug' = '0' → 隱藏 🐛 按鈕（仍持續攔截，可程式呼叫 show()）
// ----------------------------------------------------------------
(function () {
    'use strict';
    if (window.__AURELIA_DEBUG_CONSOLE__) return;   // 防重複注入
    window.__AURELIA_DEBUG_CONSOLE__ = true;

    var LOG = [];
    var MAX = 400;
    var open = false;
    var btn = null, panel = null, body = null;

    function fmt(a) {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.message + (a.stack ? ('\n' + a.stack) : '');
        try { return JSON.stringify(a); } catch (e) { return String(a); }
    }
    function nowStr() {
        try { return new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
        catch (e) { return ''; }
    }
    function push(type, args) {
        try {
            LOG.push({ type: type, t: nowStr(), msg: Array.prototype.map.call(args, fmt).join(' ') });
            if (LOG.length > MAX) LOG.shift();
            render();
        } catch (e) {}
    }

    // 攔截 console（鏈式：仍呼叫原本的）
    ['log', 'warn', 'error', 'info'].forEach(function (k) {
        var orig = (console[k] && console[k].bind) ? console[k].bind(console) : function () {};
        console[k] = function () { try { orig.apply(null, arguments); } catch (e) {} push(k, arguments); };
    });
    // 全域錯誤
    window.addEventListener('error', function (e) {
        push('error', ['[onerror] ' + (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || '')]);
    });
    window.addEventListener('unhandledrejection', function (e) {
        var r = e && e.reason; push('error', ['[unhandledrejection] ' + ((r && r.message) || fmt(r))]);
    });

    function injectStyle() {
        if (document.getElementById('aurelia-dbg-style')) return;
        var s = document.createElement('style');
        s.id = 'aurelia-dbg-style';
        s.textContent = [
            '#aurelia-dbg-btn{position:fixed;right:8px;bottom:8px;z-index:2147483647;width:34px;height:34px;border-radius:50%;',
            'background:rgba(20,20,25,0.85);border:1px solid rgba(212,175,55,0.55);color:#fff;font-size:17px;',
            'display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;line-height:1;}',
            '#aurelia-dbg-panel{position:fixed;right:8px;bottom:48px;z-index:2147483647;width:min(94vw,560px);height:min(62vh,440px);',
            'background:rgba(8,8,10,0.97);border:1px solid rgba(212,175,55,0.5);border-radius:6px;flex-direction:column;',
            'box-shadow:0 8px 30px rgba(0,0,0,0.75);overflow:hidden;}',
            '#aurelia-dbg-bar{display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.1);flex:0 0 auto;}',
            '#aurelia-dbg-bar .ttl{color:#e8d9a8;font-size:12px;letter-spacing:1px;margin-right:auto;font-family:monospace;}',
            '#aurelia-dbg-bar button{background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.4);color:#e8d9a8;',
            'border-radius:4px;font-size:12px;padding:3px 10px;cursor:pointer;font-family:inherit;}',
            '#aurelia-dbg-body{flex:1 1 auto;overflow:auto;padding:8px;font:11px/1.5 monospace;color:#cfcfcf;',
            'white-space:pre-wrap;word-break:break-all;}',
            '#aurelia-dbg-body .l-error{color:#ff8080;}',
            '#aurelia-dbg-body .l-warn{color:#f6c177;}',
            '#aurelia-dbg-body .l-info{color:#80c0ff;}'
        ].join('');
        document.head.appendChild(s);
    }

    function ensureUI() {
        if (btn || !document.body) return;
        injectStyle();

        btn = document.createElement('div');
        btn.id = 'aurelia-dbg-btn';
        btn.textContent = '🐛';
        btn.title = 'Debug Console';
        // 預設隱藏（不打擾朋友）；要顯示：localStorage.setItem('aurelia_debug','1') 後重載，
        // 或直接呼叫 window.AureliaDebug.show()（log 一直在背景攔截，隨時可叫出來）。
        if (localStorage.getItem('aurelia_debug') !== '1') btn.style.display = 'none';
        btn.addEventListener('click', function () { open ? hide() : show(); });

        panel = document.createElement('div');
        panel.id = 'aurelia-dbg-panel';
        panel.style.display = 'none';

        var bar = document.createElement('div');
        bar.id = 'aurelia-dbg-bar';
        var ttl = document.createElement('span'); ttl.className = 'ttl'; ttl.textContent = 'DEBUG'; bar.appendChild(ttl);
        var bCopy = document.createElement('button'); bCopy.textContent = '複製';
        bCopy.addEventListener('click', function () {
            var text = LOG.map(function (l) { return '[' + l.t + '][' + l.type + '] ' + l.msg; }).join('\n');
            try { navigator.clipboard.writeText(text); bCopy.textContent = '已複製'; setTimeout(function () { bCopy.textContent = '複製'; }, 1500); }
            catch (e) { bCopy.textContent = '失敗'; }
        });
        var bClear = document.createElement('button'); bClear.textContent = '清空';
        bClear.addEventListener('click', function () { LOG.length = 0; render(); });
        var bClose = document.createElement('button'); bClose.textContent = '✕';
        bClose.addEventListener('click', hide);
        bar.appendChild(bCopy); bar.appendChild(bClear); bar.appendChild(bClose);

        body = document.createElement('div');
        body.id = 'aurelia-dbg-body';

        panel.appendChild(bar); panel.appendChild(body);
        document.body.appendChild(btn);
        document.body.appendChild(panel);
    }

    function render() {
        if (!body || !open) return;
        var html = LOG.map(function (l) {
            var cls = l.type === 'error' ? 'l-error' : (l.type === 'warn' ? 'l-warn' : (l.type === 'info' ? 'l-info' : ''));
            var line = '[' + l.t + '] ' + l.msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return cls ? '<span class="' + cls + '">' + line + '</span>' : line;
        }).join('\n');
        body.innerHTML = html;
        body.scrollTop = body.scrollHeight;
    }

    function show() { ensureUI(); open = true; if (btn) btn.style.display = ''; if (panel) panel.style.display = 'flex'; render(); }
    function hide() { open = false; if (panel) panel.style.display = 'none'; }

    window.AureliaDebug = {
        log: function () { push('log', arguments); },
        show: show, hide: hide,
        get: function () { return LOG.slice(); },
        clear: function () { LOG.length = 0; render(); }
    };

    if (document.body) ensureUI();
    else window.addEventListener('DOMContentLoaded', ensureUI);

    console.log('[AureliaDebug] 螢幕 console 就緒（點右下 🐛 開啟）');
})();
