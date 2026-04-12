// ----------------------------------------------------------------
// [檔案] os_user_center.js (V4.0 - Correct ST API)
// 路徑：os_phone/os/os_user_center.js
// 職責：用戶中心 (系統級)。
// V4.0 修正：
// 1. 使用正確 ST 資料結構：
//    - power_user.personas = { "avatar.png": "名字" }  (value 是字串)
//    - power_user.persona_descriptions = { "avatar.png": { description: "..." } }
//    - win.user_avatar = 當前激活的 avatar 檔名
// 2. 可一次讀取全部人設，不受 DOM 分頁限制
// 3. 移除已失效的 persona_selected / postMessage 依賴
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入用戶中心 (V4.0)...');
    const win = window.parent || window;
    const doc = win.document;

    let LAST_DATA_HASH = "";

    // 核心數據
    let CURRENT_USER = {
        name: 'User',
        id: 'wxid_USER',
        avatar: '',
        desc: '讀取中...',
    };

    // --- 1. CSS ---
    const osUserStyle = `
        .os-modal-overlay {
            position: fixed; top: 10px; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); z-index: 10000000;
            display: none; align-items: center; justify-content: center;
            backdrop-filter: blur(2px); animation: osFadeIn 0.2s;
        }
        .os-modal-overlay.show { display: flex; }
        .os-modal-box {
            background: #ffffff; width: 85%; max-width: 320px;
            border-radius: 12px; padding: 0;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            color: #333; display: flex; flex-direction: column;
            max-height: 80vh; overflow: hidden;
            animation: osPopIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            font-family: sans-serif;
        }
        .os-header { padding: 15px; border-bottom: 1px solid #eee; font-weight: bold; text-align: center; font-size: 16px; background: #f9f9f9; }
        .os-body { overflow-y: auto; padding: 0; }
        .os-footer { padding: 10px; border-top: 1px solid #eee; text-align: center; background: #fff; }

        .os-p-item { display: flex; align-items: center; padding: 12px 15px; border-bottom: 1px solid #f0f0f0; cursor: pointer; transition: background 0.1s; }
        .os-p-item:active { background: #f0f0f0; }
        .os-p-item.active { background: #f0f9f0; }
        .os-p-avatar { width: 40px; height: 40px; border-radius: 4px; background-size: cover; background-position: center; margin-right: 15px; background-color: #eee; border: 1px solid #ddd; flex-shrink: 0; }
        .os-p-check { color: #07c160; font-weight: bold; font-size: 18px; margin-left: auto; }

        .os-btn { border: none; background: #f2f2f2; color: #333; padding: 10px 30px; border-radius: 6px; font-size: 14px; cursor: pointer; }
        .os-btn:hover { background: #e6e6e6; }
        .os-btn-primary { background: #07c160; color: white; }

        @keyframes osFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes osPopIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    `;

    if (!doc.getElementById('os-user-css')) {
        const s = doc.createElement('style'); s.id = 'os-user-css'; s.innerHTML = osUserStyle; doc.head.appendChild(s);
    }

    // --- 2. Modal DOM ---
    function initModalDOM() {
        if (doc.getElementById('os-user-modal')) return;
        const div = doc.createElement('div');
        div.id = 'os-user-modal';
        div.className = 'os-modal-overlay';
        div.innerHTML = `
            <div class="os-modal-box">
                <div class="os-header" id="os-modal-title">標題</div>
                <div class="os-body" id="os-modal-body">內容...</div>
                <div class="os-footer" id="os-modal-footer">
                    <button class="os-btn" onclick="document.getElementById('os-user-modal').classList.remove('show')">關閉</button>
                </div>
            </div>
        `;
        doc.body.appendChild(div);
    }

    // --- 3. 核心：從 ST Context 讀取人設資料 ---
    function getSTData() {
        try {
            const ctx = win.SillyTavern && win.SillyTavern.getContext ? win.SillyTavern.getContext() : null;
            const pu = ctx && ctx.powerUserSettings;
            const currentAvatar = ctx && ctx.userAvatar;
            return { pu, currentAvatar };
        } catch(e) { return { pu: null, currentAvatar: null }; }
    }

    // --- 4. 主邏輯 ---
    win.OS_USER = {
        init: function() {
            initModalDOM();
            this.syncFromST();
            setInterval(() => this.syncFromST(), 1500);
        },

        // 從 power_user 同步當前人設資料
        syncFromST: function() {
            try {
                const { pu, currentAvatar } = getSTData();
                if (!pu || !currentAvatar) return;

                // personas[avatar] = "名字" (純字串)
                const newName = pu.personas?.[currentAvatar] || currentAvatar;
                // persona_descriptions[avatar] = { description: "..." }
                const newDesc = (pu.persona_descriptions?.[currentAvatar]?.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
                const newAvatar = `User Avatars/${currentAvatar}`;

                if (CURRENT_USER.name !== newName) {
                    CURRENT_USER.name = newName;
                    CURRENT_USER.id = 'wxid_' + newName.replace(/\s+/g, '_');
                    console.log(`[OS_USER] 身分切換: ${newName} (${currentAvatar})`);
                }
                CURRENT_USER.desc = newDesc;
                CURRENT_USER.avatar = newAvatar;

                this.refreshUI();
            } catch(e) { console.warn('[OS_USER] syncFromST failed', e); }
        },

        // 取得全部人設列表（直接從記憶體，不分頁）
        getAllPersonaList: function() {
            try {
                const { pu, currentAvatar } = getSTData();
                if (!pu || !pu.personas) return [];

                return Object.keys(pu.personas).map(avatar => ({
                    id: avatar,
                    name: pu.personas[avatar] || avatar,
                    description: pu.persona_descriptions?.[avatar]?.description || '',
                    avatar: `User Avatars/${avatar}`,
                    isCurrent: avatar === currentAvatar,
                    isDefault: pu.default_persona === avatar,
                }));
            } catch(e) {
                console.warn('[OS_USER] getAllPersonaList failed', e);
                return [];
            }
        },

        // --- 功能 A: 顯示完整人設描述 ---
        showFullInfo: function() {
            const modal = doc.getElementById('os-user-modal');
            if (!modal) return;
            doc.getElementById('os-modal-title').innerText = '📜 當前人設詳情';
            const safeDesc = (CURRENT_USER.desc || '暫無內容')
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
            doc.getElementById('os-modal-body').innerHTML = `<div style="padding:15px; font-size:14px; line-height:1.6; color:#333; user-select:text;">${safeDesc}</div>`;
            modal.classList.add('show');
        },

        // --- 功能 B: 打開人設選擇器（透過 bridge API，取全部） ---
        openPersonaList: function() {
            const modal = doc.getElementById('os-user-modal');
            if (!modal) return;
            doc.getElementById('os-modal-title').innerText = '切換使用者身分';
            doc.getElementById('os-modal-body').innerHTML = `<div style="padding:40px; text-align:center; color:#999;">⏳ 讀取中...</div>`;
            modal.classList.add('show');

            // 透過 bridge 呼叫 /api/avatars/get（取全部，不分頁）
            const onResponse = (event) => {
                if (!event.data || event.data.type !== 'USER_PERSONA_LIST_RESPONSE') return;
                window.removeEventListener('message', onResponse);
                const list = event.data.data?.personas || [];
                if (list.length > 0) {
                    this.renderSelectionList(list);
                } else {
                    doc.getElementById('os-modal-body').innerHTML = `<div style="padding:40px; text-align:center; color:#999;">⚠️ 無法讀取人設列表</div>`;
                }
            };
            window.addEventListener('message', onResponse);
            win.postMessage({ type: 'REQUEST_USER_PERSONA_LIST', source: 'PHONE_OS' }, '*');

            // 5 秒 timeout 保險
            setTimeout(() => window.removeEventListener('message', onResponse), 5000);
        },

        renderSelectionList: function(list) {
            const body = doc.getElementById('os-modal-body');
            if (!body) return;

            let html = '';
            list.forEach(p => {
                const isActive = p.isCurrent || p.isSelected;
                const activeClass = isActive ? 'active' : '';
                const checkMark = isActive ? '✔' : '';
                const defaultBadge = p.isDefault ? ' <span style="font-size:10px;color:#aaa;">(預設)</span>' : '';
                const avatarStyle = `background-image:url('${p.avatar}')`;
                const safeName = p.name.replace(/'/g, "\\'");
                const safeId = p.id.replace(/'/g, "\\'");

                html += `
                    <div class="os-p-item ${activeClass}" onclick="window.OS_USER.switchPersona('${safeId}', '${safeName}')">
                        <div class="os-p-avatar" style="${avatarStyle}"></div>
                        <div style="flex:1;">
                            <div style="font-weight:bold; font-size:15px;">${p.name}${defaultBadge}</div>
                        </div>
                        <div class="os-p-check">${checkMark}</div>
                    </div>
                `;
            });
            body.innerHTML = html || '<div style="padding:20px;text-align:center;color:#999;">無人設</div>';
        },

        // --- 功能 C: 切換身分 ---
        switchPersona: function(personaId, personaName) {
            console.log(`[OS_USER] 切換中: ${personaId} (${personaName})`);

            // 樂觀更新
            CURRENT_USER.name = personaName;
            CURRENT_USER.id = 'wxid_' + personaName.replace(/\s+/g, '_');
            CURRENT_USER.desc = '讀取中...';

            win.postMessage({ type: 'REQUEST_SWITCH_USER_PERSONA', source: 'PHONE_OS', personaId: personaId }, '*');
            doc.getElementById('os-user-modal').classList.remove('show');

            // 切換後重新同步幾次
            let count = 0;
            const syncer = setInterval(() => {
                this.syncFromST();
                count++;
                if (count > 8) clearInterval(syncer);
            }, 300);
        },

        // --- 供 App 調用 ---
        getInfo: function() {
            let avatar = CURRENT_USER.avatar;
            if (!avatar) {
                avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(CURRENT_USER.name)}&backgroundColor=e6e6e6`;
            }
            return {
                name: CURRENT_USER.name,
                id: CURRENT_USER.id,
                desc: CURRENT_USER.desc || '',
                avatar: avatar,
            };
        },

        getHash: function() {
            return CURRENT_USER.name + '|' + CURRENT_USER.avatar + '|' + (CURRENT_USER.desc ? CURRENT_USER.desc.length : 0);
        },

        refreshUI: function() {
            const newHash = this.getHash();
            if (newHash === LAST_DATA_HASH) return;
            LAST_DATA_HASH = newHash;

            try {
                const activeTabEl = doc.querySelector('.wx-tab.active .wx-tab-txt');
                if (activeTabEl && activeTabEl.innerText.includes('我') && win.wxApp) {
                    console.log('[OS_USER] 偵測到 "我" 分頁，執行 UI 刷新');
                    win.wxApp.render();
                }
            } catch(e) {}
        }
    };

    win.WX_USER = win.OS_USER;
    setTimeout(() => win.OS_USER.init(), 1000);
})();
