/**
 * core/void/panels.js — 成就面板 + 404 商店面板
 * 從 void_terminal.js 抽出。零橋接：只摸 DOM + window.OS_*。
 *
 * V1.4 (2026-05-16): 雙皮膚 + 情緒分流（資料共享，按大廳模式各看各的）
 *   - 預設模式 (瀅瀅票根)：顯示瀅瀅 emotion + 中性
 *   - .mode-404 (柴郡卡帶)：顯示柴郡 emotion + 中性
 *   - 中性 emotion 兩邊都看得到（避免成就懸空）
 *   - 無 emotion 的舊資料：兩邊都顯示
 *   - 商店之後另開分支
 */
(function (VoidPanels) {
    'use strict';

    // ────────────────────────────────────────────────
    // emotion → 角色分流表（情緒分配規則，與《規範》表情清單對齊）
    // 'cheshire' / 'yingying' / 'both'
    // ────────────────────────────────────────────────
    const EMOTION_TO_CHAR = {
        // 柴郡：異常觀察 → 黑市
        Smirk: 'cheshire', Annoyed: 'cheshire', Angry: 'cheshire', Teasing: 'cheshire',
        JumpScare: 'cheshire', Sex: 'cheshire', Dissatisfied: 'cheshire',
        // 瀅瀅：故事素材 → 菜單
        Happy: 'yingying', Excited: 'yingying', Sad: 'yingying', Embarrassed: 'yingying',
        Awkward: 'yingying', Sleepy: 'yingying', Amazed: 'yingying', Pout: 'yingying',
        // 中性：兩邊都收
        Neutral: 'both', Think: 'both', Surprised: 'both', Craving: 'both',
        Laughing: 'both', Tired: 'both', Confused: 'both', Distressed: 'both',
        Unhappy: 'both', Sighing: 'both'
    };

    /** 偵測當前大廳模式對應哪個角色看面板 */
    function getCurrentChar() {
        const tab = document.querySelector('.void-tab');
        if (tab && tab.classList.contains('mode-404')) return 'cheshire';
        // claude 房間 / 預設大廳 → 都走瀅瀅皮（票根）
        return 'yingying';
    }

    /** 此成就是否該在當前角色面板顯示 */
    function shouldShowForChar(emotion, currentChar) {
        if (!emotion) return true;                       // 舊資料無 emotion：兩邊都顯示
        const owner = EMOTION_TO_CHAR[emotion];
        if (!owner) return true;                          // 未知 emotion：兩邊都顯示，避免懸空
        if (owner === 'both') return true;                // 中性：兩邊都顯示
        return owner === currentChar;
    }

    // VN 立繪 25 個 emotion 的貼紙張數 (與 aseets/achievements/ 資料夾對齊)
    // V1.3 改用立繪 emotion 同步後，原 Mock_xxx 等 PNG 暫時 orphan，等 Rae 重命名
    // 加新貼紙時：把對應 emotion 數字 +1
    const STICKER_MANIFEST = {
        Neutral: 0, Happy: 0, Think: 0, Surprised: 0, JumpScare: 0,
        Annoyed: 0, Angry: 0, Sighing: 0, Awkward: 0, Embarrassed: 0,
        Excited: 0, Sad: 0, Dissatisfied: 0, Distressed: 0, Confused: 0,
        Tired: 0, Craving: 0, Pout: 0, Laughing: 0, Sleepy: 0,
        Unhappy: 0, Smirk: 0, Amazed: 0, Teasing: 0, Sex: 0
    };
    /**
     * 依 emotion 分類隨機抽一張貼紙
     * @param {string|null} emotion - VN 寫進來的分類
     * @returns {string|null}       - sticker key (例如 "Smirk_002") 或 null = 用 default
     *
     * 編號純粹只是「同分類第幾張」，沒有語義 — AI 寫 emotion 後從池中隨機抽。
     * URL 由 CSS [data-sticker="..."] 規則解析，避免酒館 document 根目錄錯位。
     */
    function pickStickerKey(emotion) {
        if (!emotion || !STICKER_MANIFEST[emotion]) return null;
        const count = STICKER_MANIFEST[emotion];
        if (count <= 0) return null;
        const idx = Math.floor(Math.random() * count) + 1;
        const num = String(idx).padStart(3, '0');
        return `${emotion}_${num}`;
    }

    // ===== 成就面板 =====
    function openAchievementPanel() {
        const overlay = document.getElementById('achievement-panel-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        renderAchievementList();
    }

    function closeAchievementPanel() {
        const overlay = document.getElementById('achievement-panel-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    function _escapeHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function renderAchievementList() {
        const listEl  = document.getElementById('ach-list');
        const statsEl = document.getElementById('ach-stats');
        const achBtn  = document.getElementById('achievement-hist-btn');
        if (!listEl) return;

        const allAchievements = (window.OS_ACHIEVEMENT && window.OS_ACHIEVEMENT.getAll)
            ? window.OS_ACHIEVEMENT.getAll() : [];

        // V1.4: 按當前模式情緒分流
        const currentChar = getCurrentChar();
        const achievements = allAchievements.filter(a => shouldShowForChar(a.emotion, currentChar));
        const pending  = achievements.filter(a => !a.redeemed);
        const redeemed = achievements.filter(a =>  a.redeemed);

        if (statsEl) statsEl.textContent = `${achievements.length} 個成就 · ${pending.length} 個待兌換`;

        // 清空按鈕：有成就才顯示（按未過濾總數判斷），並只綁一次事件
        const clearBtn = document.getElementById('ach-clear-btn');
        if (clearBtn) clearBtn.style.display = allAchievements.length > 0 ? '' : 'none';
        if (clearBtn && !clearBtn._bound) {
            clearBtn._bound = true;
            clearBtn.onclick = async () => {
                if (!confirm(`確定要清空全部 ${allAchievements.length} 筆成就？此動作無法復原。`)) return;
                if (window.OS_DB && window.OS_DB.clearAchievements) await window.OS_DB.clearAchievements();
                if (window.OS_ACHIEVEMENT && window.OS_ACHIEVEMENT.load) await window.OS_ACHIEVEMENT.load();
                renderAchievementList();
            };
        }

        // 更新按鈕 "待兌換" 小圓點（按當前模式可看到的 pending 算）
        if (achBtn) {
            if (pending.length > 0) achBtn.classList.add('has-pending');
            else                    achBtn.classList.remove('has-pending');
        }

        // 切換成卡帶 grid 模式
        listEl.classList.add('relic-grid-mode');

        if (achievements.length === 0) {
            listEl.classList.remove('relic-grid-mode');
            // 依當前模式給不同空狀態文案
            const hint = currentChar === 'cheshire'
                ? '異常紀錄為零。把人玩崩了她就會出現。'
                : '尚無故事素材。瀅瀅還在等你帶委託來。';
            listEl.innerHTML = `<div class="ach-empty">── 尚無成就記錄 ──<br><span class="ach-empty-hint">${hint}</span></div>`;
            return;
        }

        listEl.innerHTML = '';
        // 待兌換優先顯示
        [...pending, ...redeemed].forEach((ach, idx) => {
            const safeName    = _escapeHtml(ach.name);
            const safeDesc    = _escapeHtml(ach.desc || '');
            const safeEmotion = _escapeHtml(ach.emotion || '');
            const stickerKey  = pickStickerKey(ach.emotion);
            const d = new Date(ach.timestamp);
            const dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
            const statusText = ach.redeemed
                ? `💠 ${ach.shards || 0}`
                : '待兌換';
            const titleAttr = safeEmotion
                ? `[${safeEmotion}] ${safeName}${safeDesc ? ' — ' + safeDesc : ''}`
                : `${safeName}${safeDesc ? ' — ' + safeDesc : ''}`;

            const wrap = document.createElement('div');
            wrap.className = 'relic-card-wrap' + (ach.redeemed ? ' redeemed' : '');
            wrap.title = titleAttr;
            // 貼紙 key 用 data-sticker 屬性，URL 由 CSS [data-sticker="..."] 解析。
            // 沒 emotion 或分類不存在 → 不設屬性，CSS fallback 到 achievements_default.png
            const stickerAttr = stickerKey ? ` data-sticker="${_escapeHtml(stickerKey)}"` : '';
            // 螢幕區：名稱 + 描述（純文字疊在卡帶黑螢幕上）
            // 貼紙：絕對定位在卡帶角落，傾斜，會超出邊界（真實「貼上去」的姿態）
            wrap.innerHTML = `
                <div class="relic-card">
                    <div class="relic-card-screen">
                        <div class="relic-screen-name">${safeName}</div>
                        ${safeDesc ? `<div class="relic-screen-desc">${safeDesc}</div>` : ''}
                    </div>
                    <div class="relic-card-sticker"${stickerAttr}></div>
                    <div class="relic-card-status">${statusText}</div>
                </div>
                <div class="relic-card-info">
                    <div class="relic-card-meta">${dateStr}</div>
                </div>
            `;
            listEl.appendChild(wrap);
        });
    }

    // ===== 404 商店面板 =====
    function openStorePanel() {
        const overlay = document.getElementById('store-panel-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        _renderStoreContent(overlay);
    }

    function closeStorePanel() {
        const overlay = document.getElementById('store-panel-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    function _renderStoreContent(overlay) {
        // 更新碎片顯示
        const shardsDisplay = overlay.querySelector('#store-shards-display');
        if (shardsDisplay && window.OS_404_STORE) {
            shardsDisplay.textContent = `💎 ${window.OS_404_STORE.getShards()} FRAGMENTS`;
        }
        // 渲染商品列表
        const body = overlay.querySelector('#store-panel-body') || overlay;
        if (window.OS_404_STORE && window.OS_404_STORE.renderStorePanel) {
            // renderStorePanel 在 store-header 下方寫入內容
            // 先找到或建立內容容器
            let contentArea = overlay.querySelector('.store-content-area');
            if (!contentArea) {
                contentArea = document.createElement('div');
                contentArea.className = 'store-content-area';
                contentArea.style.cssText = 'display:contents;';
                overlay.appendChild(contentArea);
            }
            window.OS_404_STORE.renderStorePanel(contentArea);
            // 同步碎片顯示（renderStorePanel 可能更新）
            if (shardsDisplay) {
                shardsDisplay.textContent = `💎 ${window.OS_404_STORE.getShards()} FRAGMENTS`;
            }
        }
    }

    // refreshAchievement：原 VoidTerminal.refreshAchievementPanel 的函式體（render + 按鈕圓點）
    // V1.4: 按鈕圓點按「當前模式 visible 的 pending」算，避免在瀅瀅模式時顯示柴郡 emotion 的紅點
    function refreshAchievement() {
        const overlay = document.getElementById('achievement-panel-overlay');
        if (overlay && overlay.style.display !== 'none') renderAchievementList();
        const achBtn = document.getElementById('achievement-hist-btn');
        if (achBtn && window.OS_ACHIEVEMENT) {
            const currentChar = getCurrentChar();
            const hasPending = window.OS_ACHIEVEMENT.getPending()
                .some(a => shouldShowForChar(a.emotion, currentChar));
            if (hasPending) achBtn.classList.add('has-pending');
            else            achBtn.classList.remove('has-pending');
        }
    }

    VoidPanels.openAchievement       = openAchievementPanel;
    VoidPanels.closeAchievement      = closeAchievementPanel;
    VoidPanels.renderAchievementList = renderAchievementList;
    VoidPanels.refreshAchievement    = refreshAchievement;
    VoidPanels.openStore             = openStorePanel;
    VoidPanels.closeStore            = closeStorePanel;

    console.log('✅ VoidPanels（成就 + 商店面板）模組就緒');
})(window.VoidPanels = window.VoidPanels || {});
