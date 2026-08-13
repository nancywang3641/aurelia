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

    /** 分類：異常(柴郡)/故事(瀅瀅)/日常(中性+舊資料)——收藏冊 tab 跟兌換分流都用這個 */
    function catOf(a) {
        const o = EMOTION_TO_CHAR[a.emotion];
        if (o === 'cheshire') return 'anomaly';
        if (o === 'yingying') return 'story';
        return 'daily';
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

    // ── 成就收藏冊（單本共用：tab 分類取代舊「雙皮膚各看各的」；兌換按票券類型分流）──
    let _achTab = 'all';

    function _achMsg(text, ok) {
        const el = document.getElementById('achv2-msg');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('ok', !!ok);
        clearTimeout(el._t);
        if (text) el._t = setTimeout(() => { el.textContent = ''; }, 6000);
    }

    function _achDate(ts) {
        const d = new Date(ts || 0);
        return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    }

    // 單張票券：異常=404 黑卡、其餘=白票券；待兌換給「領取」鈕（白票→白兔換PT、黑卡→柴郡換碎片）
    function _achTicketEl(a) {
        const cat = catOf(a);
        const anomaly = cat === 'anomaly';
        const tk = document.createElement('div');
        tk.className = 'achv2-tk ' + (anomaly ? 'anomaly' : 'std') + (a.redeemed ? ' redeemed' : '');
        tk.title = a.name + (a.desc ? ' — ' + a.desc : '');

        const stub = document.createElement('div');
        stub.className = 'achv2-tk-stub';
        stub.textContent = anomaly ? 'ANOMALY FILE' : (a.redeemed ? 'MEMORY SAVED' : 'UNCLAIMED');

        const main = document.createElement('div');
        main.className = 'achv2-tk-main';
        const head = document.createElement('div');
        head.className = 'achv2-tk-head';
        const badge = document.createElement('div');
        badge.className = 'achv2-tk-badge';
        badge.innerHTML = '<i class="fa-solid ' + (anomaly ? 'fa-cat' : (cat === 'story' ? 'fa-feather' : 'fa-star')) + '"></i>';
        const name = document.createElement('div');
        name.className = 'achv2-tk-name';
        name.textContent = a.name || '未命名成就';   // textContent 防注入
        head.append(badge, name);
        const desc = document.createElement('div');
        desc.className = 'achv2-tk-desc';
        desc.textContent = a.desc || '';
        // 估值當下的那句點評（白兔／柴郡）：兌換後蓋在票上，滑過看全文
        let note = null;
        if (a.redeemed && a.comment) {
            note = document.createElement('div');
            note.className = 'achv2-tk-note';
            note.title = a.comment;
            const nico = document.createElement('i');
            nico.className = 'fa-solid ' + (anomaly ? 'fa-cat' : 'fa-stamp');
            const ntxt = document.createElement('span');
            ntxt.textContent = a.comment;   // textContent 防注入
            note.append(nico, ntxt);
        }
        const foot = document.createElement('div');
        foot.className = 'achv2-tk-foot';
        const status = document.createElement('span');
        status.className = 'achv2-tk-status';
        if (a.redeemed) {
            status.innerHTML = a.currency === 'pt'
                ? '<i class="fa-solid fa-coins"></i> ' + (a.shards || 0) + ' PT'
                : '<i class="fa-solid fa-gem"></i> ' + (a.shards || 0);
        } else {
            status.innerHTML = '<i class="fa-regular fa-hourglass-half"></i> 待兌換';
        }
        const date = document.createElement('span');
        date.className = 'achv2-tk-date';
        date.textContent = _achDate(a.timestamp);
        foot.append(status, date);
        if (!a.redeemed) {
            const claim = document.createElement('button');
            claim.className = 'achv2-tk-claim';
            claim.textContent = '領取';
            claim.addEventListener('click', async () => {
                if (claim.disabled) return;
                claim.disabled = true;
                claim.textContent = '估值中…';
                let r = { ok: false, msg: '兌換窗口沒開' };
                try {
                    r = anomaly
                        ? await window.OS_404_STORE.evaluateAchievements([a])
                        : await window.OS_PT.evaluateAchievementsPT([a]);
                } catch (e) { r = { ok: false, msg: '系統異常' }; }
                if (r.ok) {
                    const gain = anomaly ? (r.totalShards + ' 碎片') : (r.totalPT + ' PT');
                    const say = (r.results && r.results[0] && r.results[0].comment) ? '「' + r.results[0].comment + '」' : '';
                    _achMsg((anomaly ? '柴郡收下了，' : '白兔先生蓋章，') + '+' + gain + ' ' + say, true);
                    refreshAchievement();
                    renderAchievementList();
                } else {
                    _achMsg(r.msg || '估值失敗，再試一次', false);
                    claim.disabled = false;
                    claim.textContent = '領取';
                }
            });
            foot.appendChild(claim);
        }
        // 高額紀念：兌換值 ≥100 貼稀有星星
        if (a.redeemed && (a.shards || 0) >= 100) {
            const star = document.createElement('div');
            star.className = 'achv2-tk-star';
            tk.appendChild(star);
        }
        main.append(head, desc);
        if (note) main.appendChild(note);
        main.appendChild(foot);
        tk.append(stub, main);
        return tk;
    }

    function renderAchievementList() {
        const listEl = document.getElementById('ach-list');
        const achBtn = document.getElementById('achievement-hist-btn');
        if (!listEl) return;

        const all = (window.OS_ACHIEVEMENT && window.OS_ACHIEVEMENT.getAll)
            ? window.OS_ACHIEVEMENT.getAll() : [];
        const pendingAll = all.filter(a => !a.redeemed);

        const countEl = document.getElementById('achv2-count');
        const pendEl  = document.getElementById('achv2-pending');
        if (countEl) countEl.textContent = String(all.length);
        if (pendEl)  pendEl.textContent  = String(pendingAll.length);

        // 分類 tab（只綁一次）
        const tabsEl = document.getElementById('achv2-tabs');
        if (tabsEl && !tabsEl._bound) {
            tabsEl._bound = true;
            tabsEl.addEventListener('click', (e) => {
                const b = e.target.closest('.achv2-tab');
                if (!b) return;
                _achTab = b.dataset.cat || 'all';
                renderAchievementList();
            });
        }
        if (tabsEl) tabsEl.querySelectorAll('.achv2-tab').forEach(b => b.classList.toggle('on', (b.dataset.cat || 'all') === _achTab));

        // 清空（只綁一次）
        const clearBtn = document.getElementById('ach-clear-btn');
        if (clearBtn) clearBtn.style.display = all.length > 0 ? '' : 'none';
        if (clearBtn && !clearBtn._bound) {
            clearBtn._bound = true;
            clearBtn.onclick = async () => {
                const n = (window.OS_ACHIEVEMENT?.getAll?.() || []).length;
                if (!confirm(`確定要清空全部 ${n} 筆成就？此動作無法復原。`)) return;
                if (window.OS_DB && window.OS_DB.clearAchievements) await window.OS_DB.clearAchievements();
                if (window.OS_ACHIEVEMENT && window.OS_ACHIEVEMENT.load) await window.OS_ACHIEVEMENT.load();
                renderAchievementList();
            };
        }

        // 一鍵全兌：白兔跟柴郡各跑一輪（只綁一次）
        const redeemBtn = document.getElementById('ach-redeem-btn');
        if (redeemBtn) redeemBtn.style.display = pendingAll.length > 0 ? '' : 'none';
        if (redeemBtn && !redeemBtn._bound) {
            redeemBtn._bound = true;
            redeemBtn.onclick = async () => {
                if (redeemBtn.disabled) return;
                redeemBtn.disabled = true;
                const old = redeemBtn.innerHTML;
                redeemBtn.textContent = '估值中…';
                let pt = 0, shards = 0, fail = '';
                try {
                    const r1 = await window.OS_PT?.evaluateAchievementsPT?.();
                    if (r1?.ok) pt = r1.totalPT || 0; else if (r1 && !/沒有/.test(r1.msg || '')) fail = r1.msg || '';
                } catch (e) {}
                try {
                    const r2 = await window.OS_404_STORE?.evaluateAchievements?.();
                    if (r2?.ok) shards = r2.totalShards || 0; else if (r2 && !fail && !/沒有/.test(r2.msg || '')) fail = r2.msg || '';
                } catch (e) {}
                redeemBtn.disabled = false;
                redeemBtn.innerHTML = old;
                if (pt || shards) {
                    const parts = [];
                    if (pt) parts.push('+' + pt + ' PT');
                    if (shards) parts.push('+' + shards + ' 碎片');
                    _achMsg('兌換完成！' + parts.join('、'), true);
                    window.VoidUiSfx?.play('unlock');
                } else {
                    _achMsg(fail || '沒有成功兌換任何成就', false);
                    window.VoidUiSfx?.play('error');
                }
                refreshAchievement();
                renderAchievementList();
            };
        }

        // 入口紅點（全域 pending，不再按皮膚分）
        if (achBtn) achBtn.classList.toggle('has-pending', pendingAll.length > 0);
        const dockAch = document.getElementById('lb-dock-ach');
        if (dockAch) dockAch.classList.toggle('has-pending', pendingAll.length > 0);

        // 過濾 + 排序：待兌換優先、新的在前
        const show = all
            .filter(a => _achTab === 'all' || catOf(a) === _achTab)
            .sort((x, y) => (x.redeemed - y.redeemed) || ((y.timestamp || 0) - (x.timestamp || 0)));

        listEl.innerHTML = '';
        if (!show.length) {
            const hint = _achTab === 'anomaly'
                ? '異常紀錄為零。把人玩崩了它們就會出現。'
                : '還沒有這一類的收藏。';
            listEl.innerHTML = `<div class="achv2-empty">── 這一頁還是空白 ──<br><span class="achv2-empty-hint">${_escapeHtml(hint)}</span></div>`;
            return;
        }
        show.forEach(a => listEl.appendChild(_achTicketEl(a)));
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
    // 收藏冊制：紅點按全域 pending 算（分類靠冊內 tab，不再按皮膚分）
    function refreshAchievement() {
        const overlay = document.getElementById('achievement-panel-overlay');
        if (overlay && overlay.style.display !== 'none') renderAchievementList();
        const achBtn = document.getElementById('achievement-hist-btn');
        const dockAch = document.getElementById('lb-dock-ach');
        if ((achBtn || dockAch) && window.OS_ACHIEVEMENT) {
            const hasPending = window.OS_ACHIEVEMENT.getPending().length > 0;
            if (achBtn) achBtn.classList.toggle('has-pending', hasPending);
            if (dockAch) dockAch.classList.toggle('has-pending', hasPending);
        }
    }

    VoidPanels.openAchievement       = openAchievementPanel;
    VoidPanels.closeAchievement      = closeAchievementPanel;
    VoidPanels.renderAchievementList = renderAchievementList;
    VoidPanels.refreshAchievement    = refreshAchievement;
    // 成就歸屬（兌換分流用）：'cheshire'=異常→404黑市換碎片；'yingying'=其餘(含中性/舊資料)→白兔交易所換PT
    VoidPanels.emotionOwner = (emotion) => (EMOTION_TO_CHAR[emotion] === 'cheshire' ? 'cheshire' : 'yingying');
    VoidPanels.openStore             = openStorePanel;
    VoidPanels.closeStore            = closeStorePanel;

    console.log('✅ VoidPanels（成就 + 商店面板）模組就緒');
})(window.VoidPanels = window.VoidPanels || {});
