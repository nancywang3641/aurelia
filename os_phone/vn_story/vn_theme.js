// ----------------------------------------------------------------
// [檔案] vn_theme.js
// 路徑：os_phone/vn_story/vn_theme.js
// 職責：VN 劇情面板「自訂 CSS」— 像酒館的自訂樣式框。
//       每個世界(chatId)存一段 free CSS，注入 <style id="vn-theme-css"> 套到頁面。
//       作者/AI 寫好 CSS 貼進創作室「🎨 主題」框即可。
//       🌍 視差世界有自己那份（世界門生結束畫面時一起生的，存在世界檔案的 vnTheme）：
//       人在那個世界裡＝換成它那份，撤離＝回到這本故事原本那份。世界門用 setWorld 告訴這裡現在在哪。
// 暴露：window.VN_Theme
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[PhoneOS] 載入 VN 自訂 CSS 模組 (vn_theme.js)...');
    const win = window.parent || window;

    // 現在人在的那個視差世界，而且它有自己的主題：{ id, css, save(css) }；不在世界裡或那個世界沒有主題＝null。
    //   🚨只有「有主題的世界」才接管：舊世界沒有自己那份，照舊用這本故事的主題，進去前後長得一樣。
    let _wt = null;
    const WG_PFX = 'wg::';
    function _chatWorld() {
        try { const VC = win.VN_Cache || window.VN_Cache; if (VC && VC.getCurrentWorld) return VC.getCurrentWorld(); } catch (e) {}
        try { const ctx = win.SillyTavern && win.SillyTavern.getContext && win.SillyTavern.getContext(); if (ctx && ctx.chatId) return String(ctx.chatId); } catch (e) {}
        return 'lobby_default';
    }
    // 創作室、小機拿這個當「這份主題是誰的」：在有主題的世界裡就是那個世界，改的是世界那份、對話紀錄也分開記
    function _curWorld() { return _wt ? WG_PFX + _wt.id : _chatWorld(); }
    function _isWg(id) { return !!(_wt && id === WG_PFX + _wt.id); }
    function _key(chatId) { return 'vn_theme_css::' + (chatId || 'lobby_default'); }
    function _storyCss(chatId) { try { return localStorage.getItem(_key(chatId)) || ''; } catch (e) { return ''; } }

    const VN_Theme = {
        getCurrentWorld: _curWorld,
        // 世界那份被清空時退回這本故事的，不是退回預設黑金（跟沒有世界主題時一樣）
        getCss(chatId) {
            const id = chatId || _curWorld();
            if (_isWg(id)) return _wt.css || _storyCss(_chatWorld());
            if (String(id).indexOf(WG_PFX) === 0) return _storyCss(_chatWorld());   // 已經撤離的世界：別讀出一份不存在的鑰匙
            return _storyCss(id);
        },
        setCss(chatId, css) {
            const id = chatId || _curWorld();
            if (_isWg(id)) {
                _wt.css = css || '';
                try { _wt.save(_wt.css); } catch (e) { console.warn('[VN_Theme] 世界主題存檔失敗', e); }
                this.apply(id);
                return true;
            }
            const ok = win.AUI.lsSet(_key(id), css || '', '劇情面板的自訂樣式');
            // 沒存成也先套上剛給的這份：apply 是回存檔讀，讀到的會是舊樣式，畫面就退回去了
            if (ok) this.apply(id); else this._paint(css || '');
            return ok;
        },
        clear(chatId) {
            const id = chatId || _curWorld();
            if (_isWg(id)) { this.setCss(id, ''); return; }
            try { localStorage.removeItem(_key(id)); } catch (e) {}
            this.apply(id);
        },
        // 把該世界的自訂 CSS 注入 <style id="vn-theme-css">（沒有就清空 → 回預設黑金）
        apply(chatId) { this._paint(this.getCss(chatId || _curWorld())); },
        // 世界門呼叫：進世界、撤離、換聊天室、重做結束畫面之後。w＝{ id, css, save } 或 null
        setWorld(w) {
            _wt = (w && w.id && w.css) ? { id: String(w.id), css: String(w.css), save: (typeof w.save === 'function' ? w.save : () => {}) } : null;
            this.apply();
        },
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
