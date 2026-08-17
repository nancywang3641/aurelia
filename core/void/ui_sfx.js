/**
 * core/void/ui_sfx.js — 大廳介面音效（點擊／滑過／開關／面板開合）
 *
 * 作法：事件委派掛在 document（capture 階段），只認 #aurelia-home-tab 內、
 * 且命中白名單選擇器的元素 —— 不逐一改按鈕，也不會外洩到酒館原生 UI 或手機 App。
 * 開關／音量：大廳設置 → 選項（localStorage lobby_ui_sfx_on / lobby_ui_sfx_vol）。
 * 音檔在 sound-files 的 aseets/sfx/ui-*.mp3。
 */
(function (VoidUiSfx) {
    'use strict';

    const BASE = 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/sfx/';
    const FILES = {
        click:  'ui-click',        // 一般按鈕（含 dock 開面板：開場音跟點擊音色不搭，已退掉）
        hover:  'ui-hover',        // 滑過
        confirm:'ui-confirm',      // 送出／保存
        cancel: 'ui-cancel',       // 返回上一層
        error:  'ui-error',        // 清空／刪除
        slide:  'ui-hover',        // 章節卡片左右翻頁（跟滑過同一顆音，但當點擊回饋用，音量給足）
        close:  'ui-panel_close',  // 關面板
        toggle: 'ui-toggle',       // 開關／分頁切換
        ping:   'ui-ping',         // 世界頻道新訊息
        unlock: 'ui-unlock',       // 兌換成功
        // 書類紙質音：故事日誌那套書裝介面用，由 os_journal.js 直接點播（不走下面的點擊委派）
        book_open:  'ui-book_open',    // 翻開書（打開日誌）
        book_close: 'ui-book_close',   // 闔上書（關閉日誌）
        page_turn:  'Flip_paper',      // 翻一頁（換故事線）
        book_riffle:'ui-book_riffle',  // 快速翻書（切書籤）
        paper_slide:'ui-paper_slide',  // 紙張輕滑（備用：目前沒有介面在用，書籤頁籤刻意不給滑過音）
        card_pick:  'ui-card_pick',    // 抽卡片（滑過目錄條目——那排長得就像一張張書籤卡）
        pen_write:  'ui-pen_write',    // 落筆（開編輯器）
        book_stamp: 'ui-stamp',        // 書放到桌上（保存成功）
        paper_tear: 'ui-paper_tear',   // 撕頁（清空劇情）
    };
    // 各音效的相對音量：滑過最輕，提示音最響（總音量之外再乘一層）
    const GAIN = {
        hover: 0.4, slide: 0.7, click: 0.75, toggle: 0.8, cancel: 0.8, close: 0.8,
        error: 0.9, confirm: 1, ping: 1, unlock: 1,
        // 紙質音本身錄得比介面音小聲，整體往上帶；滑過那顆維持最輕
        paper_slide: 0.55, card_pick: 0.6, page_turn: 0.9, book_riffle: 0.9, pen_write: 1,
        book_open: 1, book_close: 1, book_stamp: 0.9, paper_tear: 0.9,
    };

    // 大廳 tab 之外，只多放行章節選擇面板 —— 它是 VN 層的全屏 overlay，不在大廳 tab 裡
    const ROOT_SEL = '#aurelia-home-tab, #chapter-overlay';

    // 點擊規則：由上往下比對，第一個命中的勝
    const CLICK_RULES = [
        ['.chx-nav, .lcp-nav', 'slide'],   // 章節選擇的左右翻頁（量子白廳 chx／舊筆記本 lcp）：滑過音當翻卡聲
        ['[data-act="close"], #ach-close-btn, #hist-close-btn, #lca-close, #close-bookshelf-btn, .lsd-close, .lstage-win-close', 'close'],
        ['[data-act="back"], .lset-back, .lb-back-btn', 'cancel'],
        ['#iris-send-btn, #iris-retry-btn, [data-act="save"], .lep-done, .hist-edit-confirm-btn', 'confirm'],
        ['.danger, #hist-clear-btn, #ach-clear-btn, #hist-del-sel', 'error'],
        ['#lobby-bgm-toggle, #lstage-toggle, #aurelia-fullscreen-btn, .lset-tab, .achv2-tab, .ltheater-freq-btn, .lset-chk, .hist-edit-cancel-btn', 'toggle'],
        ['.lb-dock-btn, .lstage-set-btn, .lstage-edit-btn, .lstage-theater-btn, .lstage-city-btn, .lset-item, #lb-top-user, #iris-hist-btn, #cheshire-hist-btn, [data-app-launch], [data-os-launch], [data-proxy], .void-btn, .void-hist-btn, .lb-icon-btn, .hist-icon-btn, .hist-action-btn, .lep-btn, .lb-persona-item', 'click'],
    ];
    const HOVER_SEL = '.lb-dock-btn, .lb-icon-btn, .lstage-set-btn, .lstage-edit-btn, .lstage-theater-btn, .lstage-city-btn, .void-hist-btn, .void-btn, .lset-item, .lset-tab, .achv2-tab';

    // ===== 開關／音量 =====
    // 這兩個 key 每次點擊都會讀 → 讀不到（沙箱/隱私模式擋 localStorage）也不能讓事件處理器炸掉
    const _mem = {};
    function _get(k) { try { const v = localStorage.getItem(k); return v === null ? _mem[k] : v; } catch (_) { return _mem[k]; } }
    function _set(k, v) { _mem[k] = v; try { localStorage.setItem(k, v); } catch (_) {} }

    function isOn() { return _get('lobby_ui_sfx_on') !== '0'; }
    function setOn(on) { _set('lobby_ui_sfx_on', on ? '1' : '0'); }
    function getVol() {
        const v = parseInt(_get('lobby_ui_sfx_vol'), 10);
        return isNaN(v) ? 0.35 : Math.max(0, Math.min(1, v / 100));
    }
    function setVol(pct) { _set('lobby_ui_sfx_vol', String(Math.round(pct))); }

    // ===== 播放 =====
    const _pool = {};
    function _audio(kind) {
        let a = _pool[kind];
        if (!a) { a = _pool[kind] = new Audio(BASE + FILES[kind] + '.mp3'); a.preload = 'auto'; }
        return a;
    }
    function play(kind) {
        if (!FILES[kind] || !isOn()) return;
        let a = _audio(kind);
        // 上一聲還在響 → 另開一條疊上去，避免連點被截斷（來源同 URL，走瀏覽器快取不重抓）
        if (!a.paused && a.currentTime > 0.02) a = new Audio(a.src);
        a.volume = Math.max(0, Math.min(1, getVol() * (GAIN[kind] || 1)));
        try { a.currentTime = 0; } catch (_) {}
        a.play().catch(() => {});
    }

    // ===== 事件委派 =====
    function _kindOf(el) {
        for (const [sel, kind] of CLICK_RULES) if (el.closest(sel)) return kind;
        return null;
    }

    let _hoverEl = null, _hoverAt = 0;
    function _bind() {
        document.addEventListener('click', (e) => {
            if (!isOn()) return;
            const t = e.target;
            if (!t || !t.closest || !t.closest(ROOT_SEL)) return;
            const kind = _kindOf(t);
            if (kind) play(kind);
        }, true);

        // 滑過音只給真滑鼠：觸控裝置的 tap 會補一次 mouseover，會變成兩聲
        if (window.matchMedia && !window.matchMedia('(hover: hover)').matches) return;
        document.addEventListener('mouseover', (e) => {
            if (!isOn()) return;
            const t = e.target;
            if (!t || !t.closest || !t.closest(ROOT_SEL)) return;
            const el = t.closest(HOVER_SEL);
            if (!el || el === _hoverEl) return;
            const now = Date.now();
            if (now - _hoverAt < 120) { _hoverEl = el; return; }   // 掃過一排按鈕不要連環響
            _hoverEl = el; _hoverAt = now;
            play('hover');
        }, true);
        document.addEventListener('mouseout', (e) => {
            if (_hoverEl && e.target === _hoverEl) _hoverEl = null;
        }, true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _bind);
    else _bind();

    VoidUiSfx.play = play;
    VoidUiSfx.isOn = isOn;
    VoidUiSfx.setOn = setOn;
    VoidUiSfx.getVol = getVol;
    VoidUiSfx.setVol = setVol;
    VoidUiSfx.IDS = FILES;

})(window.VoidUiSfx = window.VoidUiSfx || {});
