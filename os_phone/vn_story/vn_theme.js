// ----------------------------------------------------------------
// [檔案] vn_theme.js
// 路徑：os_phone/vn_story/vn_theme.js
// 職責：VN 劇情面板「自訂 CSS」— 像酒館的自訂樣式框。
//       每個世界(chatId)存一段 free CSS，注入 <style id="vn-theme-css"> 套到頁面。
//       作者/AI 寫好 CSS 貼進創作室「🎨 主題」框即可。
// 暴露：window.VN_Theme
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[PhoneOS] 載入 VN 自訂 CSS 模組 (vn_theme.js)...');
    const win = window.parent || window;

    function _curWorld() {
        try { const VC = win.VN_Cache || window.VN_Cache; if (VC && VC.getCurrentWorld) return VC.getCurrentWorld(); } catch (e) {}
        try { const ctx = win.SillyTavern && win.SillyTavern.getContext && win.SillyTavern.getContext(); if (ctx && ctx.chatId) return String(ctx.chatId); } catch (e) {}
        return 'lobby_default';
    }
    function _key(chatId) { return 'vn_theme_css::' + (chatId || 'lobby_default'); }

    const VN_Theme = {
        getCurrentWorld: _curWorld,
        getCss(chatId) { try { return localStorage.getItem(_key(chatId || _curWorld())) || ''; } catch (e) { return ''; } },
        setCss(chatId, css) {
            const id = chatId || _curWorld();
            const ok = win.AUI.lsSet(_key(id), css || '', '劇情面板的自訂樣式');
            // 沒存成也先套上剛給的這份：apply 是回存檔讀，讀到的會是舊樣式，畫面就退回去了
            if (ok) this.apply(id); else this._paint(css || '');
            return ok;
        },
        clear(chatId) {
            const id = chatId || _curWorld();
            try { localStorage.removeItem(_key(id)); } catch (e) {}
            this.apply(id);
        },
        // 把該世界的自訂 CSS 注入 <style id="vn-theme-css">（沒有就清空 → 回預設黑金）
        apply(chatId) { this._paint(this.getCss(chatId || _curWorld())); },
        _paint(css) {
            const doc = (win.document || document);
            let st = doc.getElementById('vn-theme-css');
            if (!st) { st = doc.createElement('style'); st.id = 'vn-theme-css'; (doc.head || doc.documentElement).appendChild(st); }
            st.textContent = css;
        }
    };

    win.VN_Theme = VN_Theme;
    window.VN_Theme = VN_Theme;
})();
