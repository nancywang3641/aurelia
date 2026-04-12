// ----------------------------------------------------------------
// [檔案 3] phone_system.js (V3.6 - Glassmorphism UI & Dark Mask Wallpaper)
// ----------------------------------------------------------------
(function() {
    console.log('=== 模擬手機系統 (PhoneOS V3.6) 啟動 ===');
    
    // --- 1. 定義手機外觀 (與 App 無關的硬體層) ---
    const phoneStyle = `
        /* 手機本體 */
        .phone-frame {
            position: fixed; top: 50%; left: 50%;
            width: 400px; height: 720px;
            border-radius: 40px;
            border: 2px solid #333;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6);
            display: flex; flex-direction: column;
            overflow: hidden; z-index: 9999;
            transform: translate(-50%, -50%) scale(0.9);
            opacity: 0; pointer-events: none;
            transition: opacity 0.3s, transform 0.3s;
        }
        @media (max-width: 768px) {
            .phone-frame { 
                width: 100% !important; 
                height: 85vh !important; 
                
                /* 1. 關鍵：取消頂部定位，改為貼底 */
                bottom: 0 !important; 
                
                /* 2. 確保左右滿版 */
                left: 0 !important;
                right: 0 !important;
                
                /* 3. 核心修正：強制移除 JS 產生的居中位移 (-50%, -50%) 
                   如果不加這行，視窗會因為原本的居中邏輯而往上飄 */
                transform: none !important; 
                
                border-radius: 20px 20px 0 0; 
            }
        }
        
        /* 狀態列 (系統級) */
        .phone-status-bar {
            height: 32px; background: #000; width: 100%;
            display: flex; justify-content: space-between; align-items: center;
            padding: 0 22px; box-sizing: border-box; color: #fff; font-size: 12px;
            font-family: sans-serif; font-weight: 600; cursor: move; user-select: none; z-index: 100;
        }
        .phone-island { width: 90px; height: 24px; background: #000; border-radius: 12px; position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 101; pointer-events: none; }

        /* 螢幕顯示區 */
        .phone-screen { flex: 1; width: 100%; position: relative; overflow: hidden; background: #000; border-radius: 0 0 32px 32px; }

        /* OS 主畫面 */
        .os-home-screen {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: linear-gradient(135deg, #1c1c1e, #2c2c2e); /* 預設深色桌布 */
            background-size: cover; background-position: center;
            display: flex; flex-direction: column; padding: 40px 20px 20px; box-sizing: border-box;
            transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s;
            z-index: 10;
        }
        .os-home-screen.hidden { transform: scale(0.9); opacity: 0; pointer-events: none; }

        /* 毛玻璃質感使用者名片 */
        .os-profile-card {
            background: rgba(30, 30, 30, 0.4); 
            backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px);
            border-radius: 20px; padding: 15px; margin-bottom: 20px;
            border: 1px solid rgba(255,255,255,0.15); 
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            display: flex; align-items: center; gap: 12px; color: #fff;
            transition: transform 0.2s, background 0.2s;
        }
        .os-profile-card:hover { background: rgba(40, 40, 40, 0.5); }
        .os-profile-avatar {
            width: 50px; height: 50px; border-radius: 50%; 
            background: #ccc; background-size: cover; background-position: center;
            border: 2px solid rgba(255,255,255,0.5); cursor: pointer; flex-shrink: 0;
        }
        .os-profile-info { flex: 1; overflow: hidden; cursor: pointer; }
        .os-profile-name { font-size: 16px; font-weight: bold; font-family: sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
        .os-profile-desc { font-size: 12px; opacity: 0.8; font-family: sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 4px; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
        
        /* 操作按鈕區 (更換桌布、同步) */
        .os-profile-actions { display: flex; gap: 8px; }
        .os-action-btn {
            width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.2);
            display: flex; align-items: center; justify-content: center; font-size: 16px;
            cursor: pointer; transition: background 0.2s, transform 0.1s; 
            border: 1px solid rgba(255,255,255,0.1);
            backdrop-filter: blur(5px);
        }
        .os-action-btn:hover { background: rgba(255,255,255,0.3); }
        .os-action-btn:active { transform: scale(0.9); }
        
        /* App Grid */
        .os-app-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 25px 15px; margin-top: 10px; }
        .os-app-icon-wrapper { display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; transition: transform 0.1s; }
        .os-app-icon-wrapper:active { transform: scale(0.9); }
        .os-app-icon { width: 60px; height: 60px; border-radius: 14px; background: #fff; display: flex; align-items: center; justify-content: center; font-size: 32px; box-shadow: 0 2px 10px rgba(0,0,0,0.3); overflow: hidden; }
        .os-app-name { font-size: 12px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.8); font-family: sans-serif; }

        /* App 運行容器 (所有 App 都在這裡跑) */
        .os-app-container {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: #fff; z-index: 20;
            transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex; flex-direction: column;
        }
        .os-app-container.active { transform: translateX(0); }

        /* 底部 Home 條 (物理按鍵模擬) */
        .phone-home-bar {
            position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
            width: 130px; height: 5px; background: #fff; border-radius: 3px;
            opacity: 0.5; cursor: pointer; z-index: 1000; transition: opacity 0.2s, width 0.2s;
        }
        .phone-home-bar:hover { opacity: 1; width: 140px; }
        .phone-home-bar:active { transform: translateX(-50%) scale(0.9); }

        /* 關閉按鈕 */
        .phone-close-btn {
            width: 24px; height: 24px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            color: #fff; font-size: 18px; transition: opacity 0.2s, transform 0.2s;
            user-select: none;
        }
        .phone-close-btn:hover { opacity: 0.7; transform: scale(1.1); }
        .phone-close-btn:active { transform: scale(0.9); }
    `;

    // --- 2. 注入系統樣式（追加嵌入模式樣式）---
    const targetDoc = (window.parent && window.parent.document) ? window.parent.document : document;
    if (!targetDoc.getElementById('phone-os-style')) {
        const style = targetDoc.createElement('style');
        style.id = 'phone-os-style';
        style.innerHTML = phoneStyle + `
        /* 嵌入模式：手機殼在控制中心 TAB 內顯示 */
        .phone-frame-embedded {
            position: relative !important;
            top: auto !important; left: auto !important;
            width: 360px !important;
            height: 100% !important;
            max-height: 680px !important;
            border-radius: 28px !important;
            transform: none !important;
            opacity: 1 !important;
            pointer-events: auto !important;
            margin: auto !important;
            flex-shrink: 0 !important;
        }
        @media (max-width: 768px) {
            .phone-frame-embedded {
                width: 100% !important;
                height: 100% !important;
                max-height: 100% !important;
                border-radius: 0 !important;
            }
        }
        `;
        targetDoc.head.appendChild(style);
    }

    // --- 3. 系統核心邏輯 ---
    let phoneEl = null, isVisible = false, isMoved = false;
    let isEmbeddedMode = false; // 🔥 新增：是否嵌入在控制中心
    let installedApps = []; // 這裡存著微信、微博等 App
    const globalWin = window.parent || window;

    function initHardware() {
        if (targetDoc.getElementById('phone-frame-hardware')) return;

        // 🔥 偵測是否有嵌入宿主（控制中心的 #aurelia-phone-host）
        const embeddedHost = targetDoc.getElementById('aurelia-phone-host');
        isEmbeddedMode = !!embeddedHost && !embeddedHost.dataset.phoneEmbedded;

        phoneEl = targetDoc.createElement('div');
        phoneEl.id = 'phone-frame-hardware';
        // 嵌入模式用 phone-frame-embedded，浮窗模式用 phone-frame
        phoneEl.className = isEmbeddedMode ? 'phone-frame phone-frame-embedded' : 'phone-frame';
        phoneEl.innerHTML = `
            <div class="phone-status-bar" id="phone-drag-handle">
                <span id="os-clock">12:00</span>
                <div class="phone-island"></div>
                <span style="display:flex; gap:6px; align-items:center;">
                    <span>5G 🔋</span>
                    <div class="phone-close-btn" id="phone-close-btn" title="關閉">✕</div>
                </span>
            </div>
            <div class="phone-screen">
                <div class="os-home-screen" id="os-home">
                    <div class="os-profile-card">
                        <div class="os-profile-avatar" id="os-home-avatar" onclick="(window.parent.OS_USER || window.OS_USER).openPersonaList()"></div>
                        <div class="os-profile-info" onclick="(window.parent.OS_USER || window.OS_USER).openPersonaList()">
                            <div class="os-profile-name" id="os-home-name">讀取中...</div>
                            <div class="os-profile-desc" id="os-home-desc">點擊切換身分</div>
                        </div>
                        <div class="os-profile-actions">
                            <div class="os-action-btn" title="更換桌布" onclick="document.getElementById('os-wallpaper-upload').click()">🖼️</div>
                            <div class="os-action-btn" title="同步對話紀錄" onclick="(window.parent.OS_SYNC || window.OS_SYNC).run()">🔄</div>
                        </div>
                        <input type="file" id="os-wallpaper-upload" accept="image/*" style="display:none;" onchange="(window.parent.PhoneSystem || window.PhoneSystem).uploadWallpaper(event)">
                    </div>
                    
                    <div class="os-app-grid" id="os-grid"></div>
                </div>
                <div class="os-app-container" id="os-app-layer"></div>
            </div>
            <div class="phone-home-bar" id="os-home-btn" title="Home"></div>
        `;
        if (isEmbeddedMode) {
            // 嵌入到控制中心的 [手機] TAB 宿主裡
            embeddedHost.dataset.phoneEmbedded = 'true';
            embeddedHost.appendChild(phoneEl);
            // 嵌入模式不需要拖曳，關閉按鈕改為回到主頁
            const closeBtn = phoneEl.querySelector('#phone-close-btn');
            if (closeBtn) {
                closeBtn.title = '回主頁';
                closeBtn.innerHTML = '🏠';
                closeBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (window.AureliaControlCenter) window.AureliaControlCenter.switchPage('nav-home');
                };
            }
        } else {
            // 浮窗模式（fallback）
            targetDoc.body.appendChild(phoneEl);
            makeDraggable(phoneEl, phoneEl.querySelector('#phone-drag-handle'));
            // 關閉按鈕
            phoneEl.querySelector('#phone-close-btn').onclick = (e) => { e.stopPropagation(); hidePhone(); };
        }
        
        // Home 鍵：強制回到桌面
        phoneEl.querySelector('#os-home-btn').onclick = (e) => { e.stopPropagation(); goHome(); };

        // 時鐘更新
        setInterval(() => {
            const now = new Date();
            const time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
            const el = phoneEl.querySelector('#os-clock'); if(el) el.innerText = time;
        }, 1000);

        // 定期更新名片資訊
        setInterval(updateProfileCard, 1000);
        
        // 讀取系統桌布
        loadWallpaper();

        // --- 對外公開接口 (SDK) ---
        globalWin.PhoneSystem = {
            // App 安裝接口：(App名, 圖標HTML, 背景色, 點擊回調)
            install: installApp,
            // 系統操作
            goHome: goHome,
            // 依名稱開啟 App
            openByName: (name) => {
                const app = installedApps.find(a => a.name === name);
                if (app) openApp(app.id);
            },
            show: showPhone,
            hide: hidePhone,
            // 獲取 App 運行層 DOM
            getAppLayer: () => phoneEl ? phoneEl.querySelector('#os-app-layer') : null,
            // 桌布上傳接口
            uploadWallpaper: handleWallpaperUpload,
            // 🔥 [新] 供 control_center 的重試機制呼叫（initHardware 已處理嵌入邏輯）
            _initEmbedded: (hostEl) => {
                if (!phoneEl) initHardware();
            }
        };
        
        console.log('[PhoneOS] 系統啟動就緒');
        // 處理緩存的安裝請求
        if (window.__PENDING_APPS) {
            window.__PENDING_APPS.forEach(app => installApp(app.name, app.icon, app.color, app.onOpen));
            window.__PENDING_APPS = null;
        }
    }

    // --- UI 狀態更新邏輯 ---
    function updateProfileCard() {
        const userSys = globalWin.OS_USER;
        if (userSys && userSys.getInfo) {
            const info = userSys.getInfo();
            const avatarEl = phoneEl.querySelector('#os-home-avatar');
            const nameEl = phoneEl.querySelector('#os-home-name');
            const descEl = phoneEl.querySelector('#os-home-desc');
            
            if (avatarEl && info.avatar) avatarEl.style.backgroundImage = `url('${info.avatar}')`;
            if (nameEl && info.name) nameEl.innerText = info.name;
            if (descEl && info.id) descEl.innerText = 'ID: ' + info.id; 
        }
    }

    // --- 桌布存取邏輯 (依賴 OS_DB) ---
    async function loadWallpaper() {
        const dbSys = globalWin.OS_DB;
        if (dbSys && dbSys.getImage) {
            try {
                const imgUrl = await dbSys.getImage('system_wallpaper');
                if (imgUrl) {
                    const homeScreen = phoneEl.querySelector('#os-home');
                    // 🔥 自動在圖片上疊加一層黑色半透明的漸層遮罩 (RGBA 0.4 不透明度)
                    if (homeScreen) homeScreen.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url('${imgUrl}')`;
                }
            } catch(e) { console.log('[PhoneOS] 使用預設桌布'); }
        }
    }

    async function handleWallpaperUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const dbSys = globalWin.OS_DB;
        if (dbSys && dbSys.saveImage) {
            try {
                await dbSys.saveImage('system_wallpaper', file);
                const homeScreen = phoneEl.querySelector('#os-home');
                const imgUrl = URL.createObjectURL(file);
                // 🔥 自動在圖片上疊加一層黑色半透明的漸層遮罩 (RGBA 0.4 不透明度)
                if (homeScreen) homeScreen.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url('${imgUrl}')`;
                console.log('[PhoneOS] 桌布更新成功');
            } catch(e) { console.error('[PhoneOS] 桌布更新失敗', e); }
        } else {
            alert('系統資料庫未準備好，無法儲存桌布');
        }
        // 重置 input，允許重複上傳同一張
        event.target.value = '';
    }

    // --- App 管理 ---
    // 手機面板只保留這三個 App，其餘入口已移至大廳 app tray
    const PHONE_APP_WHITELIST = ['微信', '微博', '電子錢包'];

    function installApp(name, iconHtml, bgColor, onOpenCallback) {
        if (!phoneEl) {
            if (!window.__PENDING_APPS) window.__PENDING_APPS = [];
            window.__PENDING_APPS.push({name, iconHtml, color: bgColor, onOpen: onOpenCallback});
            return;
        }
        // 只允許白名單內的 App
        if (!PHONE_APP_WHITELIST.includes(name)) return;
        // 避免重複安裝
        if (installedApps.find(a => a.name === name)) return;

        const grid = phoneEl.querySelector('#os-grid');
        const appId = 'app-' + installedApps.length;
        installedApps.push({ id: appId, name, callback: onOpenCallback });

        const iconDiv = targetDoc.createElement('div');
        iconDiv.className = 'os-app-icon-wrapper';
        iconDiv.innerHTML = `<div class="os-app-icon" style="background: ${bgColor}; color: white;">${iconHtml}</div><div class="os-app-name">${name}</div>`;
        iconDiv.onclick = () => openApp(appId);
        grid.appendChild(iconDiv);
    }

    function openApp(appId) {
        const app = installedApps.find(a => a.id === appId);
        if (!app) return;
        // 切換 UI 到 App 層
        phoneEl.querySelector('#os-home').classList.add('hidden');
        phoneEl.querySelector('#os-app-layer').classList.add('active');
        // 執行 App 啟動回調
        if (app.callback) app.callback(phoneEl.querySelector('#os-app-layer'));
    }

    function goHome() {
        phoneEl.querySelector('#os-app-layer').classList.remove('active');
        phoneEl.querySelector('#os-home').classList.remove('hidden');
    }

    // --- 視窗控制 ---
    function togglePhone() { isVisible ? hidePhone() : showPhone(); }
    function showPhone() {
        if (isEmbeddedMode) {
            // 嵌入模式：切換到控制中心的 [手機] TAB
            if (window.AureliaControlCenter) {
                if (!window.AureliaControlCenter.isVisible()) window.AureliaControlCenter.show();
                window.AureliaControlCenter.switchPage('nav-phone');
            }
            isVisible = true;
            return;
        }
        // 浮窗模式
        if(!phoneEl) initHardware();
        isVisible = true; phoneEl.style.display = 'flex'; phoneEl.style.pointerEvents = 'auto';
        setTimeout(() => { phoneEl.style.opacity = '1'; phoneEl.style.transform = isMoved ? 'scale(1)' : 'translate(-50%, -50%) scale(1)'; }, 10);
    }
    function hidePhone() {
        if (isEmbeddedMode) {
            // 嵌入模式：切換回主頁
            if (window.AureliaControlCenter) window.AureliaControlCenter.switchPage('nav-home');
            isVisible = false;
            return;
        }
        // 浮窗模式
        if(!phoneEl) return;
        isVisible = false; phoneEl.style.opacity = '0'; phoneEl.style.transform = isMoved ? 'scale(0.9)' : 'translate(-50%, -50%) scale(0.9)'; phoneEl.style.pointerEvents = 'none';
        setTimeout(() => { phoneEl.style.display = 'none'; }, 300);
    }
    
    function makeDraggable(element, handle = element) {
        let isDragging = false, startX, startY;
        handle.addEventListener('mousedown', (e) => {
            if(e.target.tagName==='INPUT'||e.target.onclick)return;
            isDragging=true; startX=e.clientX; startY=e.clientY;
            const rect = element.getBoundingClientRect();
            if(element===phoneEl) { 
                isMoved=true; 
                element.style.transition='none'; 
                element.style.transform='none'; 
                element.style.left=rect.left+'px'; 
                element.style.top=rect.top+'px'; 
            }
            targetDoc.addEventListener('mousemove', drag); 
            targetDoc.addEventListener('mouseup', dragEnd);
        });
        function drag(e) { 
            if(!isDragging)return; 
            e.preventDefault(); 
            element.style.left=`${parseFloat(element.style.left)+(e.clientX-startX)}px`; 
            element.style.top=`${parseFloat(element.style.top)+(e.clientY-startY)}px`; 
            startX=e.clientX; startY=e.clientY; 
        }
        function dragEnd() { 
            isDragging=false; 
            targetDoc.removeEventListener('mousemove', drag); 
            targetDoc.removeEventListener('mouseup', dragEnd); 
            if(element===phoneEl && isVisible) element.style.transform='scale(1)'; 
        }
    }

    setTimeout(initHardware, 500);
})();