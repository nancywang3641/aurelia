/**
 * core/void/login.js — 登入畫面 + 存檔管理
 * 從 void_terminal.js 抽出。橋：loadLobbyHistory / saveLobbyHistory / applyLoadedLobbyState
 *   / getChatId / applyLayoutMode / setCurrentChatId / setUserName / resetActiveHistory。
 */
(function (VoidLogin) {
    'use strict';

    function _b() { return window.VoidTerminal._bridge; }

    function _truncateId(id) {
        if (!id) return '—';
        const base = id.replace(/\.jsonl?$/i, '').split('/').pop().split('\\').pop();
        return base.length > 28 ? base.substring(0, 25) + '...' : base;
    }

    function _formatSessionTime(ts) {
        if (!ts) return '';
        const diff = Date.now() - ts;
        if (diff < 60000)    return '剛才';
        if (diff < 3600000)  return Math.floor(diff / 60000) + ' 分鐘前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小時前';
        const d = new Date(ts);
        return d.getFullYear() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0');
    }

    // 注入登入/Session 畫面 CSS（全套瀅瀅專屬色票風格）已移至 aurelia_core.css
    function _injectLoginCss() {
        // CSS 已抽離至 aurelia_core.css，此函數保留為空以相容舊有調用
    }

    async function showLoginScreen(tab) {
        if (!tab) return;
        _injectLoginCss();
        const currentId = _b().getChatId();
        _b().setCurrentChatId(currentId);

        // 嘗試預先讀取看看有沒有已儲存的名字
        const db = window.OS_DB || (window.parent && window.parent.OS_DB);
        let savedName = '';
        if (db && db.getLobbyHistory) {
            try {
                const d = await db.getLobbyHistory(currentId);
                if (d && d.userName) savedName = d.userName;
            } catch(e) {}
        }

        const ov = document.createElement('div');
        ov.id = 'void-login-overlay';
        ov.className = 'void-login-overlay';
        ov.innerHTML = `
            <div class="void-login-container">
                <div class="void-login-brand">LUNA-VII // 視差書咖</div>
                <div class="void-login-box">
                    <div class="void-login-title">LOGIN</div>
                    <div class="void-login-desc">請輸入您的委託人代號以建立神經連結。</div>
                    <div class="void-login-input-group">
                        <label>委託人代號 (USER NAME)</label>
                        <div class="void-login-name-row">
                            <input type="text" id="void-login-name" value="${savedName}" placeholder="例如: 約翰" autocomplete="off">
                            <button class="void-persona-pick-btn" id="void-layout-btn" title="介面佈局與人設設定">⚙️</button>
                        </div>
                        <div id="void-layout-dropdown" class="void-persona-dropdown"></div>
                    </div>
                    <button class="void-login-btn" id="void-login-submit">▶ 進入書咖</button>
                    <button class="void-login-alt-btn" id="void-login-sessions">📂 管理歷史素材</button>
                </div>
            </div>
            <div id="void-session-manager" style="display:none; width:100%; height:100%;"></div>
        `;
        tab.appendChild(ov);

        const inputEl = ov.querySelector('#void-login-name');
        const submitBtn = ov.querySelector('#void-login-submit');
        const sessionBtn = ov.querySelector('#void-login-sessions');

        const doLogin = async () => {
            const val = inputEl.value.trim();
            if (!val) {
                inputEl.style.borderColor = '#fc8181';
                setTimeout(() => inputEl.style.borderColor = 'rgba(251,223,162,0.4)', 1000);
                return;
            }
            submitBtn.disabled = true;
            submitBtn.textContent = '連線中...';

            // 先設定名字
            _b().setUserName(val);

            // 嘗試載入該 ChatId 的舊有歷史紀錄
            await _b().loadLobbyHistory(currentId);

            // 重新確保 userName 是剛剛輸入的 (避免被舊存檔覆蓋)
            _b().setUserName(val);

            // 🔥 強制馬上存入資料庫，防止使用者馬上按 F5 導致資料遺失！
            await _b().saveLobbyHistory();

            closeLoginScreen(tab);
        };

        submitBtn.onclick = doLogin;
        inputEl.onkeypress = (e) => { if(e.key === 'Enter') doLogin(); };

        sessionBtn.onclick = () => {
            renderSessionManager(ov.querySelector('#void-session-manager'), currentId, tab);
        };

        // ── 人設選擇器 / 佈局設定器 ──
        const layoutBtn  = ov.querySelector('#void-layout-btn');
        const dropdown = ov.querySelector('#void-layout-dropdown');

        // 同 os_tavern_bridge.js 邏輯：API 取全列表 → DOM fallback
        async function _fetchPersonaList() {
            const win = window.parent || window;
            try {
                const ctx = win.SillyTavern?.getContext?.();
                const headers = ctx?.getRequestHeaders?.() || {};
                const res = await fetch('/api/avatars/get', {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' }
                });
                if (res.ok) {
                    const allAvatars = await res.json();
                    const pu = ctx?.powerUserSettings;
                    const currentAvatar = ctx?.userAvatar;
                    if (Array.isArray(allAvatars) && allAvatars.length) {
                        return allAvatars.map(av => ({
                            name: (pu?.personas?.[av]) || av.replace(/\.[^.]+$/, ''),
                            isSelected: av === currentAvatar
                        }));
                    }
                }
            } catch(e) { console.warn('[VoidTerminal] /api/avatars/get 失敗，改用 DOM', e); }

            // DOM fallback（分頁限制，只能看到當前頁）
            const list = [];
            try {
                win.document.querySelectorAll('#user_avatar_block .avatar-container').forEach(block => {
                    const name = block.querySelector('.ch_name.flex1')?.textContent.trim();
                    if (name) list.push({ name, isSelected: block.classList.contains('selected') });
                });
            } catch(e) {}
            return list;
        }

        async function _renderDropdown() {
            dropdown.innerHTML = '<div class="void-persona-empty">⏳ 讀取中...</div>';
            dropdown.style.display = 'block';

            const isStandalone = !(window.parent || window).SillyTavern;
            let html = '';

            // 佈局設定區塊 (iOS 解決方案)
            const currentMode = localStorage.getItem('aurelia_layout_mode') || 'auto';
            html += `<div style="padding: 8px 12px; font-size: 10px; font-weight: bold; color: #B78456; background: rgba(69,34,22,0.9);">🖥️ 介面佈局 (解決頂部遮擋)</div>`;
            html += `<div class="void-persona-item ${currentMode === 'auto' ? 'is-selected' : ''}" data-layout="auto"><span>📱 自動適配 (Auto/預設)</span></div>`;
            html += `<div class="void-persona-item ${currentMode === 'pad-ios' ? 'is-selected' : ''}" data-layout="pad-ios"><span>🍎 強制下移 (iOS 動態島/瀏海)</span></div>`;

            // 角色切換區塊 (僅酒館模式顯示)
            if (!isStandalone) {
                html += `<div style="padding: 8px 12px; font-size: 10px; font-weight: bold; color: #B78456; background: rgba(69,34,22,0.9); margin-top: 5px;">👤 酒館人設 (Persona)</div>`;
                const list = await _fetchPersonaList();
                if (!list.length) {
                    html += '<div class="void-persona-empty">⚠ 未找到酒館人設</div>';
                } else {
                    list.forEach(p => {
                        html += `<div class="void-persona-item persona-pick ${p.isSelected ? 'is-selected' : ''}" data-name="${p.name}">
                            <span>${p.name}</span>${p.isSelected ? '<span class="vpick-badge">使用中</span>' : ''}
                        </div>`;
                    });
                }
            } else {
                html += `<div style="padding: 8px 12px; font-size: 10px; font-weight: bold; color: #B78456; background: rgba(69,34,22,0.9); margin-top: 5px;">👤 獨立模式</div>`;
                html += `<div class="void-persona-empty" style="padding:8px 14px;">獨立 API 模式下，請直接在上方輸入您的代號。</div>`;
            }

            dropdown.innerHTML = html;

            // 綁定點擊事件
            dropdown.querySelectorAll('.void-persona-item').forEach(item => {
                item.onclick = (e) => {
                    e.stopPropagation();
                    if (item.dataset.layout) {
                        localStorage.setItem('aurelia_layout_mode', item.dataset.layout);
                        _b().applyLayoutMode();
                        _renderDropdown(); // 重新渲染以更新打勾狀態
                    } else if (item.dataset.name) {
                        inputEl.value = item.dataset.name;
                        dropdown.style.display = 'none';
                        inputEl.focus();
                    }
                };
            });
        }

        layoutBtn.onclick = (e) => {
            e.stopPropagation();
            if (dropdown.style.display === 'block') { dropdown.style.display = 'none'; return; }
            _renderDropdown();
        };

        document.addEventListener('click', function _closeDropdown(e) {
            if (!dropdown.contains(e.target) && e.target !== layoutBtn) {
                dropdown.style.display = 'none';
            }
        }, { capture: true });

        // 自動 Focus 輸入框
        setTimeout(() => inputEl.focus(), 300);
    }

    async function renderSessionManager(container, currentId, tab) {
        container.style.display = 'block';
        const loginContainer = tab.querySelector('.void-login-container');
        if (loginContainer) loginContainer.style.display = 'none';

        container.innerHTML = `
            <div class="void-session-manager-inner">
                <div class="void-session-topbar">
                    <div style="min-width:0;flex:1;">
                        <div class="void-session-brand">歷史素材管理</div>
                        <div class="void-session-chatid">${_truncateId(currentId)}</div>
                    </div>
                    <button class="void-session-back-btn">‹ 返回登入</button>
                </div>
                <div class="void-session-body">
                    <div id="vss-list"><div class="void-session-spinner">⚙ 載入存檔...</div></div>
                </div>
            </div>
        `;

        container.querySelector('.void-session-back-btn').onclick = () => {
            container.style.display = 'none';
            if (loginContainer) loginContainer.style.display = 'flex';
        };

        const db = window.OS_DB || (window.parent && window.parent.OS_DB);
        const listEl = container.querySelector('#vss-list');
        if (!db || !db.getAllLobbyHistories) {
            listEl.innerHTML = '<div class="void-session-empty">資料庫未就緒，無法管理存檔。</div>';
            return;
        }
        try {
            const sessions = await db.getAllLobbyHistories();
            sessions.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
            _renderSessionList(listEl, sessions, currentId, tab, db);
        } catch(e) {
            listEl.innerHTML = '<div class="void-session-empty">載入存檔失敗</div>';
        }
    }

    function closeLoginScreen(tab) {
        const t = tab || document.getElementById('aurelia-home-tab');
        const ov = t ? t.querySelector('#void-login-overlay') : document.getElementById('void-login-overlay');
        if (!ov) return;
        ov.style.transition = 'opacity 0.25s'; ov.style.opacity = '0';
        setTimeout(() => { ov.remove(); _b().applyLoadedLobbyState(); }, 260);
    }

    function _renderSessionList(listEl, sessions, currentId, tab, db) {
        if (sessions.length === 0) { listEl.innerHTML = '<div class="void-session-empty">尚無存檔記錄</div>'; return; }
        listEl.innerHTML = '';
        sessions.forEach(s => {
            const isCur = s.id === currentId;
            const card = document.createElement('div');
            card.className = 'void-session-card' + (isCur ? ' is-current' : '');

            // 如果存檔裡有 userName，顯示出來
            const nameBadge = s.userName ? `<span style="color:#FBDFA2;">[${s.userName}]</span> ` : '';

            card.innerHTML = `
                <div class="void-session-card-info">
                    <div class="void-session-card-id">${nameBadge}${_truncateId(s.id)}${isCur ? '<span class="void-session-card-cur-tag">● 當前</span>' : ''}</div>
                    <div class="void-session-card-preview">${s.preview || '(尚無對話)'}</div>
                    <div class="void-session-card-meta">${s.msgCount || 0} 條訊息 · ${_formatSessionTime(s.lastUpdated)}</div>
                </div>
                <div class="void-session-card-actions">
                    ${!isCur ? '<button class="void-session-load-btn">載入</button>' : ''}
                    <button class="void-session-del-btn">×</button>
                </div>
            `;
            const loadBtn = card.querySelector('.void-session-load-btn');
            if (loadBtn) loadBtn.onclick = async e => {
                e.stopPropagation(); loadBtn.disabled = true; loadBtn.textContent = '...';
                await _b().loadLobbyHistory(s.id);
                closeLoginScreen(tab);
            };
            const delBtn = card.querySelector('.void-session-del-btn');
            delBtn.onclick = async e => {
                e.stopPropagation(); card.style.opacity = '0.4'; card.style.pointerEvents = 'none';
                if (db && db.deleteLobbyHistory) await db.deleteLobbyHistory(s.id).catch(() => {});
                card.remove();
                const remaining = listEl.querySelectorAll('.void-session-card').length;
                if (remaining === 0) listEl.innerHTML = '<div class="void-session-empty">尚無存檔記錄</div>';
                if (isCur) { _b().resetActiveHistory(); }
            };
            listEl.appendChild(card);
        });
    }

    VoidLogin.showLoginScreen  = showLoginScreen;
    VoidLogin.closeLoginScreen = closeLoginScreen;

    console.log('✅ VoidLogin（登入 + 存檔管理）模組就緒');
})(window.VoidLogin = window.VoidLogin || {});
