// ----------------------------------------------------------------
// [檔案] vn_sticker.js
// 路徑：os_phone/vn_story/vn_sticker.js
// 職責：VN 劇情手機的表情包「查圖」——正文裡寫了 [表情包: 名字]，這裡把名字換成圖片網址。
// 🚨 劇情手機只是展示正文，不是給她打字發訊息的：以前這裡有一整套「＋」選圖面板、匯入、管理，
//    表情包庫併進微信那一份之後那個面板把微信的包全攤出來、而且排版全疊在一起（她：「怎麼在這裡XDDD」）。
//    現在只剩查圖。表情包匯入與管理在微信；這個故事的角色用哪一包，在劇情手機的「···」→ 表情包。
// 依賴：無（讀 localStorage 的 os_sticker_libs，跟微信 WX_STICKER 同一份）
// 暴露：window.VN_Sticker = { init, lookup }（vn_core 開機叫 init；vn_phone／wx_view 查圖叫 lookup）
// ----------------------------------------------------------------
(function () {
    'use strict';

    const LIBS_KEY = 'os_sticker_libs';
    let _raw = null;     // 上次讀到的原字串：沒變就不重新 parse（每顆表情泡泡都會查一次）
    let _libs = [];

    function _load() {
        let raw = '';
        try { raw = localStorage.getItem(LIBS_KEY) || '[]'; } catch (e) { raw = '[]'; }
        if (raw === _raw) return _libs;
        _raw = raw;
        try { const v = JSON.parse(raw); _libs = Array.isArray(v) ? v : []; } catch (e) { _libs = []; }
        return _libs;
    }

    function _resolveUrl(lib, file) {
        if (!file) return '';
        if (/^https?:\/\//i.test(file)) return file;
        return (lib.baseUrl || '').replace(/\/?$/, '/') + file;
    }

    const VN_Sticker = {
        // 開機一次：以前 VN 自己存 vn_sticker_libs，併進共用那一份就把舊鍵拿掉
        init() {
            try {
                const old = JSON.parse(localStorage.getItem('vn_sticker_libs') || '[]');
                if (Array.isArray(old) && old.length) {
                    const libs = _load().slice();
                    old.forEach(l => { if (l && l.name && !libs.some(x => x.name === l.name)) libs.push(l); });
                    localStorage.setItem(LIBS_KEY, JSON.stringify(libs));
                    console.log('[VN_Sticker] 舊的 VN 表情包庫已併進共用那一份');
                }
                localStorage.removeItem('vn_sticker_libs');
            } catch (e) {}
            _load();
        },

        // 名字或檔名 → 完整網址；查不到回 null（呼叫端自己決定要不要退回 stickerBase 拼）
        lookup(name) {
            const n = String(name || '');
            const key = n.replace(/\.(gif|jpg|jpeg|png|webp)$/i, '').toLowerCase();
            for (const lib of _load()) {
                for (const s of (lib.stickers || [])) {
                    if (String(s.name || '').toLowerCase() === key
                        || String(s.file || '').replace(/\.(gif|jpg|jpeg|png|webp)$/i, '').toLowerCase() === key)
                        return _resolveUrl(lib, s.file);
                }
                if (lib.baseUrl && /\.(gif|jpg|jpeg|png|webp)$/i.test(n)) return _resolveUrl(lib, n);
            }
            return null;
        }
    };

    window.VN_Sticker = VN_Sticker;
})();
