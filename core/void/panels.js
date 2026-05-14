/**
 * core/void/panels.js — 成就面板 + 404 商店面板
 * 從 void_terminal.js 抽出。零橋接：只摸 DOM + window.OS_*。
 */
(function (VoidPanels) {
    'use strict';

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

    function renderAchievementList() {
        const listEl  = document.getElementById('ach-list');
        const statsEl = document.getElementById('ach-stats');
        const achBtn  = document.getElementById('achievement-hist-btn');
        if (!listEl) return;

        const achievements = (window.OS_ACHIEVEMENT && window.OS_ACHIEVEMENT.getAll)
            ? window.OS_ACHIEVEMENT.getAll() : [];
        const pending  = achievements.filter(a => !a.redeemed);
        const redeemed = achievements.filter(a =>  a.redeemed);

        if (statsEl) statsEl.textContent = `${achievements.length} 個成就 · ${pending.length} 個待兌換`;

        // 清空按鈕：有成就才顯示，並只綁一次事件
        const clearBtn = document.getElementById('ach-clear-btn');
        if (clearBtn) clearBtn.style.display = achievements.length > 0 ? '' : 'none';
        if (clearBtn && !clearBtn._bound) {
            clearBtn._bound = true;
            clearBtn.onclick = async () => {
                if (!confirm(`確定要清空全部 ${achievements.length} 筆成就？此動作無法復原。`)) return;
                if (window.OS_DB && window.OS_DB.clearAchievements) await window.OS_DB.clearAchievements();
                if (window.OS_ACHIEVEMENT && window.OS_ACHIEVEMENT.load) await window.OS_ACHIEVEMENT.load();
                renderAchievementList();
            };
        }

        // 更新按鈕 "待兌換" 小圓點
        if (achBtn) {
            if (pending.length > 0) achBtn.classList.add('has-pending');
            else                    achBtn.classList.remove('has-pending');
        }

        if (achievements.length === 0) {
            listEl.innerHTML = '<div class="ach-empty">── 尚無成就記錄 ──<br><span style="font-size:10px;color:#B78456;font-weight:normal;">在 VN 劇情中觸發特殊選擇以解鎖成就</span></div>';
            return;
        }

        listEl.innerHTML = '';
        // 待兌換優先顯示
        [...pending, ...redeemed].forEach(ach => {
            const item = document.createElement('div');
            item.className = 'ach-item' + (ach.redeemed ? ' redeemed' : '');

            const d = new Date(ach.timestamp);
            const dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;

            const safeName = ach.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const safeDesc = (ach.desc || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const badgeText = ach.redeemed
                ? `💠 ${ach.shards || '—'} 碎片<br>✨ ${ach.exp || 0} EXP`
                : '待兌換';

            item.innerHTML = `
                <div class="ach-item-icon">${ach.redeemed ? '✅' : '🏆'}</div>
                <div class="ach-item-body">
                    <div class="ach-item-name">${safeName}</div>
                    ${safeDesc ? `<div class="ach-item-desc">${safeDesc}</div>` : ''}
                    <div class="ach-item-meta">${dateStr}</div>
                </div>
                <div class="ach-item-badge">${badgeText}</div>
            `;
            listEl.appendChild(item);
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
    function refreshAchievement() {
        const overlay = document.getElementById('achievement-panel-overlay');
        if (overlay && overlay.style.display !== 'none') renderAchievementList();
        const achBtn = document.getElementById('achievement-hist-btn');
        if (achBtn && window.OS_ACHIEVEMENT) {
            const hasPending = window.OS_ACHIEVEMENT.getPending().length > 0;
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
