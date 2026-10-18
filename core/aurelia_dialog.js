/**
 * ========================
 * [檔案] core/aurelia_dialog.js
 * 職責：全站統一的提示條與對話窗，取代瀏覽器原生 alert / confirm / prompt。
 *   - 酒館（Tauri）會攔掉 window.confirm，原生確認框在那邊按了等於沒按。
 *   - 原生框長相跟著瀏覽器走，跟奧瑞亞的畫面不搭。
 *
 * 用法（全部回 Promise，confirm/prompt 要 await）：
 *   AUI.toast('已保存')                         → 上方一條，自己消失
 *   AUI.alert('很長的說明…')                    → 短的一行自動變 toast；長的／多行開對話窗
 *   await AUI.confirm('刪除這條？')             → true / false
 *   await AUI.prompt('新名稱', '舊名')          → 字串；取消回 null
 *
 * opts：
 *   toast   { type:'success'|'error'|'warn'|'info', duration }
 *   confirm { title, okText, cancelText, danger, dismissible }
 *   prompt  { title, placeholder, hint, okText, multiline }
 *
 * 訊息開頭的 ✅ ❌ ⚠️ 之類符號會拿去決定圖示後剝掉（畫面一律用 Font Awesome）。
 * 樣式在 css/aurelia_dialog.css。
 * ========================
 */
(function () {
    'use strict';
    if (window.AUI && window.AUI.__v) return;

    const LEAD_RE = /^[\s\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]+/u;
    const ERR_MARK = /^[\s]*(❌|⛔|🛑|✖|💥|🚫)/;
    const WARN_MARK = /^[\s]*(⚠|🚨|❗|❓)/;
    const OK_MARK = /^[\s]*(✅|✔|🎉|✨|💾|📋)/;
    const DANGER_RE = /刪|清空|清除|清掉|銷毀|覆蓋|格式化|永久|復原|恢復|撤銷|移除|卸載|重置/;

    const ICON = {
        success: 'fa-solid fa-circle-check',
        error: 'fa-solid fa-circle-exclamation',
        warn: 'fa-solid fa-triangle-exclamation',
        info: 'fa-solid fa-circle-info',
    };

    function _text(msg) {
        if (msg == null) return '';
        if (msg instanceof Error) return msg.message || String(msg);
        return String(msg);
    }

    // 從原訊息猜類型（開頭符號優先，其次字面），並剝掉開頭符號
    function _classify(raw, forced) {
        const s = _text(raw);
        let type = forced || '';
        if (!type) {
            if (ERR_MARK.test(s)) type = 'error';
            else if (WARN_MARK.test(s)) type = 'warn';
            else if (OK_MARK.test(s)) type = 'success';
            else if (/失敗|錯誤|出錯|異常|error|failed/i.test(s)) type = 'error';
            else if (/請先|不能|無法|不可|找不到|沒有|不支援|尚未|還沒/.test(s)) type = 'warn';
            else if (/成功|完成|已(保存|儲存|存|匯出|匯入|導出|導入|複製|套用|更新|刪除|清|建立|新增|加入|還原|同步|送出|上傳|下載|生成|寫入|重置|設定|設為|開啟|關閉)/.test(s)) type = 'success';
            else type = 'info';
        }
        return { type, text: s.replace(LEAD_RE, '').trim() };
    }

    // 多行訊息：第一行夠短就當標題
    function _split(text, title) {
        if (title) return { title, body: text };
        const i = text.indexOf('\n');
        if (i > 0) {
            const head = text.slice(0, i).trim();
            const rest = text.slice(i + 1).replace(/^\n+/, '');
            if (head.length <= 32 && rest.trim()) return { title: head, body: rest };
        }
        if (text.length <= 32) return { title: text, body: '' };
        return { title: '', body: text };
    }

    function _el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    // ---------- toast ----------
    let _toastHost = null;
    function _getToastHost() {
        if (_toastHost && _toastHost.isConnected) return _toastHost;
        _toastHost = _el('div', 'aud-toast-host');
        _toastHost.setAttribute('aria-live', 'polite');
        document.body.appendChild(_toastHost);
        return _toastHost;
    }

    function toast(msg, opts) {
        opts = opts || {};
        const c = _classify(msg, opts.type);
        if (!c.text) return Promise.resolve();
        const host = _getToastHost();
        const t = _el('div', 'aud-toast aud-t-' + c.type);
        const ic = _el('i', (ICON[c.type] || ICON.info) + ' aud-toast-ic');
        t.appendChild(ic);
        t.appendChild(_el('div', 'aud-toast-tx', c.text));
        host.appendChild(t);
        while (host.children.length > 3) host.firstElementChild.remove();
        void t.offsetWidth; t.classList.add('on');   // 不用 rAF：分頁沒合成時 rAF 不會跑
        const dur = opts.duration || Math.min(4200, 1800 + c.text.length * 45);
        const kill = () => { t.classList.remove('on'); setTimeout(() => t.remove(), 260); };
        const tm = setTimeout(kill, dur);
        t.onclick = () => { clearTimeout(tm); kill(); };
        return Promise.resolve();
    }

    // ---------- 對話窗（一次一個，排隊） ----------
    let _chain = Promise.resolve();
    function _queue(fn) {
        const p = _chain.then(() => new Promise(fn));
        _chain = p.catch(() => {});
        return p;
    }

    function _modal(kind, msg, opts) {
        opts = opts || {};
        return _queue((resolve) => {
            const c = _classify(msg, opts.type);
            const parts = _split(c.text, opts.title);
            const danger = kind === 'confirm' && (opts.danger != null ? !!opts.danger : DANGER_RE.test(c.text));
            const dismissible = opts.dismissible !== false;

            const mask = _el('div', 'aud-mask');
            const card = _el('div', 'aud-card aud-k-' + kind + (danger ? ' aud-danger' : ''));
            card.setAttribute('role', kind === 'alert' ? 'alertdialog' : 'dialog');
            card.setAttribute('aria-modal', 'true');

            if (kind === 'alert' || danger) {
                const t = danger ? 'warn' : c.type;
                const ic = _el('div', 'aud-ic aud-t-' + t);
                ic.appendChild(_el('i', ICON[t] || ICON.info));
                card.appendChild(ic);
            }
            if (parts.title) card.appendChild(_el('div', 'aud-title', parts.title));
            if (parts.body) {
                // 短的置中；長文、條列、超過三行才靠左比較好讀
                const long = !!opts.left || parts.body.length > 90 || /[•・●]/.test(parts.body) || parts.body.split('\n').length > 3;
                card.appendChild(_el('div', 'aud-body' + (long ? ' aud-body-long' : ''), parts.body));
            }

            let input = null;
            if (kind === 'prompt') {
                input = _el(opts.multiline ? 'textarea' : 'input', 'aud-input');
                if (!opts.multiline) input.type = 'text';
                input.value = opts.value != null ? String(opts.value) : '';
                if (opts.placeholder) input.placeholder = opts.placeholder;
                card.appendChild(input);
                if (opts.hint) card.appendChild(_el('div', 'aud-hint', opts.hint));
            }

            const row = _el('div', 'aud-btns');
            let okBtn, cancelBtn = null;
            if (kind !== 'alert') {
                cancelBtn = _el('button', 'aud-btn aud-btn-ghost', opts.cancelText || '取消');
                cancelBtn.type = 'button';
                row.appendChild(cancelBtn);
            }
            okBtn = _el('button', 'aud-btn ' + (danger ? 'aud-btn-danger' : 'aud-btn-main'), opts.okText || (kind === 'alert' ? '知道了' : '確定'));
            okBtn.type = 'button';
            row.appendChild(okBtn);
            card.appendChild(row);
            mask.appendChild(card);

            const prevFocus = document.activeElement;
            let closed = false;
            const close = (val) => {
                if (closed) return;
                closed = true;
                document.removeEventListener('keydown', onKey, true);
                mask.classList.remove('on');
                setTimeout(() => mask.remove(), 180);
                try { prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true }); } catch (e) {}
                resolve(val);
            };
            const okVal = () => kind === 'prompt' ? input.value : (kind === 'confirm' ? true : undefined);
            const noVal = kind === 'prompt' ? null : (kind === 'confirm' ? false : undefined);

            const onKey = (ev) => {
                if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); if (dismissible || kind === 'alert') close(noVal); }
                else if (ev.key === 'Enter' && !(input && opts.multiline)) {
                    if (document.activeElement === cancelBtn) return;
                    ev.preventDefault(); ev.stopPropagation(); close(okVal());
                }
                else if (ev.key === 'Tab') {
                    const f = [input, cancelBtn, okBtn].filter(Boolean);
                    const i = f.indexOf(document.activeElement);
                    ev.preventDefault();
                    f[(i + (ev.shiftKey ? f.length - 1 : 1)) % f.length].focus({ preventScroll: true });
                }
            };
            okBtn.onclick = (ev) => { ev.stopPropagation(); close(okVal()); };
            if (cancelBtn) cancelBtn.onclick = (ev) => { ev.stopPropagation(); close(noVal); };
            mask.addEventListener('pointerdown', (ev) => { if (ev.target === mask) mask.__downOnMask = true; });
            mask.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (ev.target === mask && mask.__downOnMask && (dismissible || kind === 'alert')) close(noVal);
                mask.__downOnMask = false;
            });
            // 不讓點擊漏到底下的面板（很多面板在 document 上聽「點外面就關」）
            ['mousedown', 'touchstart', 'pointerdown'].forEach(n => card.addEventListener(n, ev => ev.stopPropagation()));

            document.body.appendChild(mask);
            document.addEventListener('keydown', onKey, true);
            void mask.offsetWidth;
            mask.classList.add('on');
            try {
                if (input) { input.focus({ preventScroll: true }); input.select(); }
                else (danger && cancelBtn ? cancelBtn : okBtn).focus({ preventScroll: true });
            } catch (e) {}
        });
    }

    function alert(msg, opts) {
        opts = opts || {};
        const c = _classify(msg, opts.type);
        if (!opts.modal && !opts.title && c.text.length <= 40 && c.text.indexOf('\n') < 0) return toast(msg, opts);
        return _modal('alert', msg, opts);
    }
    function confirm(msg, opts) { return _modal('confirm', msg, opts); }
    function prompt(msg, value, opts) {
        if (value && typeof value === 'object' && !opts) { opts = value; value = opts.value; }
        opts = Object.assign({}, opts || {}, { value: value });
        return _modal('prompt', msg, opts);
    }

    // 跟酒館 toastr 同樣的叫法（舊程式碼一行換掉就好）；第二個參數的標題不顯示，PWA 沒有 toastr 也照樣會出來
    const _tr = (type) => (msg, _title, o) => toast(msg, { type, duration: o && o.timeOut });
    const toastr = { success: _tr('success'), info: _tr('info'), warning: _tr('warn'), error: _tr('error') };

    // ❔ 設定項旁邊的小問號：面板上不掛說明文字，點問號才開「標題＋說明＋關閉」小窗（跟酒館助手一樣）。
    //   用法：先 AUI.registerHelp({ 鍵: { title, body } })，畫面上放 AUI.helpBtn('鍵')。
    //   問號常放在 <label> 開關裡：點它要擋掉預設動作，不然開關會跟著被切。
    const _help = {};
    function registerHelp(map) { Object.assign(_help, map || {}); }
    function helpBtn(key) { return '<button type="button" class="aui-help" data-help="' + String(key).replace(/"/g, '') + '" title="說明"><i class="fa-regular fa-circle-question"></i></button>'; }
    function _onHelp(e) {
        const b = e.target && e.target.closest && e.target.closest('.aui-help');
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        const h = _help[b.getAttribute('data-help')];
        if (h) alert(h.body, { title: h.title, modal: true, left: true, type: 'info' });
    }
    [document, (function () { try { return window.parent && window.parent.document; } catch (e) { return null; } })()]
        .filter((d, i, a) => d && a.indexOf(d) === i)
        .forEach(d => d.addEventListener('click', _onHelp, true));

    // ⏎ 這一下 Enter 要不要當「送出」：有實體鍵盤的才算（Shift+Enter 換行、選字中不算）。
    //   手機螢幕鍵盤上那顆是「換行」，她在 iPhone 上按它是要換行，一按就送出去是錯的；手機上送出一律按送出鍵。
    function isTouchKeyboard() {
        try {
            const w = window.parent || window;
            return !!(w.matchMedia && w.matchMedia('(hover: none) and (pointer: coarse)').matches);
        } catch (e) { return false; }
    }
    function enterSends(e) {
        if (!e || e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return false;
        return !isTouchKeyboard();
    }

    // ⌨️ 手機螢幕鍵盤升起來：撐滿螢幕的那層縮到鍵盤上面（輸入框貼著鍵盤、上面的標題不被推走）
    //   10-13 她：小機聊天室在電腦上很舒服，手機上就卡卡的；Claude、ChatGPT 的 app 聊起來很順。
    //   原因是 iPhone 叫出鍵盤時不把畫面縮矮，而是把整頁往上推：標題被推出畫面，
    //   最底下讓給 iPhone 橫條的那段空白夾在輸入框和鍵盤中間，收鍵盤時整頁再掉回來。
    //   這裡照「看得到的那塊」（visualViewport）把那層釘在鍵盤上面：掛上 .aui-kb-open，頂和高放在
    //   --aui-kb-top／--aui-kb-h，怎麼用由那層自己的 CSS 決定（底部讓位收掉之類）；
    //   本來捲在最底下的那一格（聊天訊息區）縮的時候一直貼著最底。
    //   會跟著走的層登記在 KB_LAYERS。電腦沒有螢幕鍵盤，量出來的差是 0，什麼都不做。
    //   🚨 鍵盤上那條「上、下、打勾」是 iPhone 給網頁加的，網頁拿不掉。
    const KB_LAYERS = [
        '#aurelia-phone-shell',                               // 手機殼：css/phone_shell.css（只有 ≤768px 撐滿螢幕那版有規則）
        '#aurelia-chat-window.cw-window:not(.cw-embedded)'    // 小機聊天室 PWA 全屏那份：core/void/lobby.css
    ].join(',');
    const KB_SLIDE_MS = 220;   // 跟各層 CSS 的 .aui-kb-slide 同一個數
    let _kbReset = function () {};
    (function _bindKeyboard() {
        const vv = window.visualViewport;
        if (!vv) return;
        let raf = 0, layer = null, pinUntil = 0, pinRaf = 0, keep = [];
        const editable = (el) => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA'
            || (el.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|range|color|file|image|hidden)$/i.test(el.type || '')));
        // 從打字那格往上找，旁邊「本來就捲在最底下」的格子（聊天訊息區）記下來，縮的時候一直貼著最底
        const bottomScrollers = (a, L) => {
            const out = [];
            for (let p = a.parentElement; p && p !== L.parentElement; p = p.parentElement) {
                for (const c of p.children) {
                    if (c === a || c.scrollHeight <= c.clientHeight + 2) continue;
                    const oy = getComputedStyle(c).overflowY;
                    if ((oy === 'auto' || oy === 'scroll') && c.scrollHeight - c.scrollTop - c.clientHeight < 24) out.push(c);
                }
            }
            return out;
        };
        const pin = () => {
            pinRaf = 0;
            keep.forEach(c => { c.scrollTop = c.scrollHeight; });
            if (performance.now() < pinUntil) pinRaf = requestAnimationFrame(pin);
        };
        const reset = () => {
            if (!layer) return;
            const L = layer;
            layer = null; keep = [];
            L.classList.remove('aui-kb-open', 'aui-kb-slide');
            L.style.removeProperty('--aui-kb-top');
            L.style.removeProperty('--aui-kb-h');
        };
        _kbReset = reset;
        const apply = () => {
            raf = 0;
            const a = document.activeElement;
            const L = editable(a) ? a.closest(KB_LAYERS) : null;
            // 版面視窗高（鍵盤出來不會變）減掉看得到的高＝鍵盤加上面那條；平常三個數一樣（index.html 頭上量過）
            const full = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
            if (!L || full - vv.height < 100 || !L.getClientRects().length) return reset();
            if (layer && layer !== L) reset();
            keep = bottomScrollers(a, L);
            if (!layer) {
                // 第一次：先停在現在的位置（頂 0、整個視窗高），下一格再滑到鍵盤上面，才滑得起來
                layer = L;
                L.style.setProperty('--aui-kb-top', '0px');
                L.style.setProperty('--aui-kb-h', full + 'px');
                L.classList.add('aui-kb-open');
                void L.offsetHeight;
                L.classList.add('aui-kb-slide');
            }
            L.style.setProperty('--aui-kb-top', vv.offsetTop + 'px');
            L.style.setProperty('--aui-kb-h', vv.height + 'px');
            pinUntil = performance.now() + KB_SLIDE_MS + 60;
            if (!pinRaf) pin();
        };
        const kick = () => { if (!raf) raf = requestAnimationFrame(apply); };
        vv.addEventListener('resize', kick);
        vv.addEventListener('scroll', kick);
        document.addEventListener('focusin', kick, true);
        // 點送出鍵之類的會先失焦、程式再把焦點放回輸入框；晚一點再看，不然版面會閃一下
        document.addEventListener('focusout', () => setTimeout(kick, 150), true);
    })();
    function kbReset() { _kbReset(); }

    // 💾 寫 localStorage：AUI.lsSet(key, 字串, '提示詞') → true / false
    //   整站共用約 5MB，滿了 setItem 會丟 QuotaExceeded：裸寫會讓整條流程斷在那一行、後面步驟都不做；
    //   包空 catch 又是靜靜沒存到，重整才發現不見。一律走這支：不往外丟，回傳成不成功，
    //   失敗時跳一句「○○沒存下來」（十秒內只跳一次，免得一批寫入洗版），console 列出最大的幾個 key 方便查是誰吃掉空間。
    //   呼叫端拿 false 決定要不要往下走：「已保存」這類提示要等它回 true 才報。
    let _lsWarnAt = 0;
    function _lsFull(e) {
        return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014 || /quota/i.test(e.message || ''));
    }
    function _lsTop(n) {
        const out = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                out.push([k, (localStorage.getItem(k) || '').length]);
            }
        } catch (e) {}
        return out.sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, len]) => k + ' ' + Math.round(len / 1024) + 'KB').join('、');
    }
    function lsSet(key, value, what) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            const full = _lsFull(e);
            console.warn('[AUI.lsSet] ' + key + ' 寫不進去' + (full ? '（本機空間滿了，最大的幾個：' + _lsTop(8) + '）' : '') + '：', e);
            const now = Date.now();
            if (now - _lsWarnAt > 10000) {
                _lsWarnAt = now;
                toast((full ? '本機儲存空間滿了，' : '') + (what ? what + '沒存下來' : '這次的修改沒存下來'), { type: 'error' });
            }
            return false;
        }
    }

    window.AUI = { __v: 1, toast, alert, confirm, prompt, toastr, registerHelp, helpBtn, enterSends, isTouchKeyboard, kbReset, lsSet };
})();
