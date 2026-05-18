// ----------------------------------------------------------------
// [檔案] vn_sticker.js
// 路徑：os_phone/vn_story/vn_sticker.js
// 職責：VN 視覺小說播放器 - 表情包模組（聊天面板貼圖庫）
// 自 vn_core.js V8.6 拆分出獨立模組
// 依賴：(運行期) VN_Phone, VN_Core
// 暴露：window.VN_Sticker
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[PhoneOS] 載入 VN 表情包模組 (vn_sticker.js)...');

    const VN_Sticker = {
        // lib 結構: { id, name, baseUrl, stickers:[{name, file}] }
        // file = 檔名（如 IMG-5034.gif），完整 URL = baseUrl + file
        // 若 file 本身已是完整 URL (https://...) 則直接用
        _libs: [],
        _currentLib: null,
        _panelOpen: false,

        init() {
            try { this._libs = JSON.parse(localStorage.getItem('vn_sticker_libs') || '[]'); } catch(e) { this._libs = []; }
            this._currentLib = this._libs[0]?.id || null;
            this.renderTabs();
            this.renderSettingsLibs();
            if (this._currentLib) this.renderGrid(this._currentLib);
        },

        _save() { localStorage.setItem('vn_sticker_libs', JSON.stringify(this._libs)); },

        // 取完整 URL：file 若已是完整 URL 直接返回，否則拼 baseUrl
        _resolveUrl(lib, file) {
            if (!file) return '';
            if (/^https?:\/\//i.test(file)) return file;
            const base = (lib.baseUrl || '').replace(/\/?$/, '/');
            return base + file;
        },

        // 解析 TXT，value 可以是檔名或完整 URL
        _parseText(text) {
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            let libName = '表情包';
            const stickers = [];
            lines.forEach((line, i) => {
                if (i === 0 && line.startsWith('library:')) { libName = line.slice(8).trim(); return; }
                const sep = line.indexOf(':');
                if (sep > 0) {
                    const name = line.slice(0, sep).trim();
                    const file = line.slice(sep + 1).trim();
                    if (name && file) stickers.push({ name, file });
                }
            });
            return { name: libName, stickers };
        },

        // 方式一：URL → fetch TXT 內容 → 建庫（onblur，不需按鈕）
        async addLibFromUrl(val) {
            const url = val.trim();
            if (!url) return;
            const statusEl = document.getElementById('stk-url-status');
            if (statusEl) { statusEl.textContent = '載入中...'; statusEl.style.color = '#aaa'; }
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.text();
                const data = this._parseText(text);
                const baseUrl = url.replace(/\/[^\/]*$/, '/');
                // 若已有同 sourceUrl 就更新
                const existing = this._libs.find(l => l.sourceUrl === url);
                if (existing) {
                    existing.name = data.name; existing.stickers = data.stickers;
                    this._currentLib = existing.id;
                } else {
                    const id = 'lib_' + Date.now();
                    this._libs.push({ id, name: data.name, baseUrl, stickers: data.stickers, sourceUrl: url });
                    this._currentLib = id;
                }
                this._save(); this.renderSettingsLibs(); this.renderTabs(); this.renderGrid(this._currentLib);
                if (statusEl) { statusEl.textContent = `✓ 已載入 ${data.stickers.length} 張`; statusEl.style.color = '#2ecc71'; }
            } catch(e) {
                if (statusEl) { statusEl.textContent = `✗ 失敗：${e.message}`; statusEl.style.color = '#e74c3c'; }
            }
        },

        // 庫列表行內 URL 自動存
        updateLibBaseUrl(id, val) {
            const lib = this._libs.find(l => l.id === id);
            if (!lib) return;
            lib.baseUrl = val.trim().replace(/\/?$/, val.trim() ? '/' : '');
            this._save();
        },

        // 設置頁：上傳 TXT，套用到當前庫（或建新庫）
        importFromFile(inputEl) {
            const file = inputEl.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = this._parseText(e.target.result);
                if (this._currentLib) {
                    // 更新當前庫的名稱和貼圖列表
                    const lib = this._libs.find(l => l.id === this._currentLib);
                    if (lib) { lib.name = data.name; lib.stickers = data.stickers; }
                } else {
                    // 沒有當前庫，建新庫（無 baseUrl）
                    const id = 'lib_' + Date.now();
                    this._libs.push({ id, name: data.name, baseUrl: '', stickers: data.stickers });
                    this._currentLib = id;
                }
                this._save();
                this.renderSettingsLibs();
                this.renderTabs();
                this.renderGrid(this._currentLib);
            };
            reader.readAsText(file, 'utf-8');
            inputEl.value = '';
        },

        deleteLib(id) {
            this._libs = this._libs.filter(l => l.id !== id);
            if (this._currentLib === id) this._currentLib = this._libs[0]?.id || null;
            this._save(); this.renderSettingsLibs(); this.renderTabs();
            const grid = document.getElementById('sticker-grid');
            if (this._currentLib) this.renderGrid(this._currentLib);
            else if (grid) grid.innerHTML = '';
        },

        // 查找貼圖：用名字或檔名查，返回完整 URL
        lookup(name) {
            const key = name.replace(/\.(gif|jpg|jpeg|png)$/i, '').toLowerCase();
            for (const lib of this._libs) {
                for (const s of lib.stickers) {
                    if (s.name.toLowerCase() === key || s.file.replace(/\.(gif|jpg|jpeg|png)$/i,'').toLowerCase() === key)
                        return this._resolveUrl(lib, s.file);
                }
                // fallback：若有 baseUrl，直接用名字+副檔名嘗試
                if (lib.baseUrl && name.match(/\.(gif|jpg|jpeg|png)$/i))
                    return this._resolveUrl(lib, name);
            }
            return null;
        },

        togglePanel() { this._panelOpen ? this.closePanel() : this.openPanel(); },

        openPanel() {
            const p = document.getElementById('sticker-panel');
            if (!p) return;
            p.classList.add('open');
            this._panelOpen = true;
            this.renderTabs();
            if (this._currentLib) this.renderGrid(this._currentLib);
        },

        closePanel() {
            const p = document.getElementById('sticker-panel');
            if (p) p.classList.remove('open');
            this._panelOpen = false;
        },

        switchLib(id) { this._currentLib = id; this.renderTabs(); this.renderGrid(id); },

        renderTabs() {
            const el = document.getElementById('sticker-tabs');
            if (!el) return;
            el.innerHTML = this._libs.map(lib =>
                `<button class="sticker-tab${lib.id === this._currentLib ? ' active' : ''}" onclick="window.VN_Sticker.switchLib('${lib.id}')">${lib.name}</button>`
            ).join('');
        },

        renderGrid(id) {
            const lib = this._libs.find(l => l.id === id);
            const grid = document.getElementById('sticker-grid');
            if (!grid) return;
            if (!lib || !lib.stickers.length) {
                grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#aaa;font-size:0.8rem;padding:20px;">尚無表情包，請至系統設置匯入</div>`; return;
            }
            grid.innerHTML = lib.stickers.map(s => {
                const url = this._resolveUrl(lib, s.file);
                const safeUrl = url.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                return `<div class="sticker-item" title="${s.name}" onclick="window.VN_Sticker.sendSticker('${s.name}','${safeUrl}')"><img src="${url}" alt="${s.name}" loading="lazy" onerror="this.parentNode.style.opacity='0.3'"></div>`;
            }).join('');
        },

        renderSettingsLibs() {
            const el = document.getElementById('sticker-mgr-list');
            if (!el) return;
            if (!this._libs.length) { el.innerHTML = `<div style="color:#666;font-size:0.8rem;">尚無表情包庫</div>`; return; }
            el.innerHTML = this._libs.map(lib =>
                `<div class="stk-lib-row">
                    <div class="stk-lib-top">
                        <span class="stk-lib-name">${lib.name}</span>
                        <span class="stk-lib-count">${lib.stickers.length} 張</span>
                        <button class="stk-lib-del" onclick="window.VN_Sticker.deleteLib('${lib.id}')">✕</button>
                    </div>
                    <input class="stk-lib-url-input" type="text" placeholder="圖片資料夾 URL（選填）"
                        value="${lib.baseUrl || ''}"
                        oninput="window.VN_Sticker.updateLibBaseUrl('${lib.id}', this.value)">
                </div>`
            ).join('');
        },

        sendSticker(name, url) {
            const chatBody = document.getElementById('chat-body');
            if (!chatBody || !window.VN_Phone) return;
            const me = window.VN_Phone.chatParticipants?.[0] || '我';
            chatBody.innerHTML += window.VN_Phone._buildChatBubbleHTML(me, `[表情包:${url}]`, true, window.VN_Core);
            window.VN_Phone.scrollChat();
            this.closePanel();
        },
    };

    window.VN_Sticker = VN_Sticker;
})();
