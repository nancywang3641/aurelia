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
                const long = parts.body.length > 90 || /[•・●]/.test(parts.body) || parts.body.split('\n').length > 3;
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
                    f[(i + (ev.shiftKey ? f.length - 1 : 1)) % f.length].focus();
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
                if (input) { input.focus(); input.select(); }
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

    window.AUI = { __v: 1, toast, alert, confirm, prompt, toastr };
})();
