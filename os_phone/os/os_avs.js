// ----------------------------------------------------------------
// [檔案] os_avs.js (V1.2 - Dual-Mode AVS Workshop)
// 路徑：os_phone/os/os_avs.js
// 職責：變數工坊 App。管理變數包與煉丹爐。支援酒館/獨立雙通向。
// ----------------------------------------------------------------
(function() {
    console.log('[PhoneOS] 載入 AVS 變數工坊系統 (V1.2)...');
    const win = window.parent || window; // 🔥 絕對保留雙通向核心

    // --- 樣式定義 ---

    if (!document.getElementById('avs-app-css')) {
    }

    let currentPacks = [];
    let currentTemplates = [];
    let activeEditingPack = null;

    async function launchApp(container) {
        container.innerHTML = `
            <div class="avs-container">
                <div class="avs-header">
                    <div class="avs-back-btn" id="avs-nav-home">‹</div>
                    <div class="avs-title">🎲 狀態檔案</div>
                    <div class="avs-back-btn" id="avs-btn-help" style="font-size:16px;font-weight:bold;">?</div>
                </div>
                <!-- 使用說明遮罩 -->
                <div id="avs-help-overlay" style="display:none;position:absolute;inset:0;background:rgba(26,13,10,0.97);z-index:200;overflow-y:auto;padding:20px 18px 80px;box-sizing:border-box;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                        <div style="font-size:16px;font-weight:bold;color:#1A1C28;">📖 使用說明</div>
                        <div id="avs-help-close" style="font-size:22px;color:rgba(26,28,40,0.25);cursor:pointer;padding:4px 8px;">✕</div>
                    </div>
                    <div style="font-size:13px;color:#ccc;line-height:1.9;">

                        <div style="color:#1A1C28;font-weight:bold;margin-bottom:6px;">🎲 狀態檔案是什麼？</div>
                        <p style="color:#aaa;margin:0 0 16px;">
                            狀態檔案讓你在跑團時，自動幫你記錄角色的各種數值，像是血量、金幣、好感度等等。<br>
                            AI 每次回覆時，會一起更新這些數字，你不用自己手動記。
                        </p>

                        <div style="color:#1A1C28;font-weight:bold;margin-bottom:6px;">📦 第一步：建立「檔案」</div>
                        <p style="color:#aaa;margin:0 0 6px;">先決定你的故事要追蹤哪些東西，給它們取個名字和初始值。</p>
                        <div style="background:rgba(212,175,55,0.07);border-left:3px solid rgba(26,28,40,0.30);padding:10px 12px;border-radius:4px;margin-bottom:16px;font-family:monospace;font-size:12px;color:#d4af37;">
                            hp = 100　　← 血量，從100開始<br>
                            gold = 0　　← 金幣，從0開始<br>
                            好感度 = 0　← 名字可以用中文
                        </div>

                        <div style="color:#1A1C28;font-weight:bold;margin-bottom:6px;">🔥 第二步：用「煉丹爐」做美化面板（可選）</div>
                        <p style="color:#aaa;margin:0 0 16px;">
                            選好檔案後，描述你想要的風格（例如「暗黑奇幻、血紅色」），讓 AI 自動幫你做一個好看的狀態面板。做好後到「展廳」開啟它，跑團時就會顯示漂亮的面板而不是純數字。
                        </p>

                        <div style="color:#1A1C28;font-weight:bold;margin-bottom:6px;">⚡ 第三步：設定「條件規則」（可選）</div>
                        <p style="color:#aaa;margin:0 0 6px;">
                            你可以設定「當某個數值達到某個條件時，自動告訴 AI 要怎麼做」。
                        </p>
                        <div style="background:rgba(212,175,55,0.07);border-left:3px solid rgba(26,28,40,0.30);padding:10px 12px;border-radius:4px;margin-bottom:6px;font-size:12px;color:#d4af37;">
                            好感度 ≥ 80 → 告訴 AI：「這個角色現在對你非常親密，說話語氣要溫柔」
                        </div>
                        <p style="color:#aaa;margin:0 0 16px;font-size:12px;">
                            這樣你就不用在每次對話裡重複解釋角色行為，系統會自動根據數值切換說明，省下很多字數。
                        </p>

                        <div style="color:#1A1C28;font-weight:bold;margin-bottom:6px;">📊 跑團中：看目前狀態</div>
                        <p style="color:#aaa;margin:0 0 16px;">
                            跑團時打開右側「資料中心」→「📊 狀態」，就可以看到目前所有數值，以及每一章改了什麼。<br>
                            如果 AI 這章亂改了數值，也可以點「↩ 回朔上一章節」撤銷。
                        </p>

                        <div style="color:#1A1C28;font-weight:bold;margin-bottom:6px;">💡 提示：告訴 AI 怎麼更新數值</div>
                        <p style="color:#aaa;margin:0 0 6px;">在你的 Prompt 裡加上這段說明，AI 就知道要輸出數值變化了：</p>
                        <div style="background:rgba(212,175,55,0.07);border-left:3px solid rgba(26,28,40,0.30);padding:10px 12px;border-radius:4px;font-family:monospace;font-size:12px;color:#d4af37;">
                            每次回覆結束後，如果有數值改變，請在最後加上：<br>
                            &lt;vars&gt;<br>
                            hp -= 20<br>
                            gold += 100<br>
                            好感度 += 5<br>
                            &lt;/vars&gt;
                        </div>

                    </div>
                </div>
                <div class="avs-tabs">
                    <div class="avs-tab active" data-tab="state">📊 目前狀態</div>
                    <div class="avs-tab" data-tab="packs">📦 檔案</div>
                    <div class="avs-tab" data-tab="modes">🎭 模式</div>
                    <div class="avs-tab" data-tab="memory">📝 記憶</div>
                </div>
                <div class="avs-content">
                    <div id="avs-view-state" class="avs-view active"></div>
                    <div id="avs-view-modes" class="avs-view"></div>
                    <div id="avs-view-memory" class="avs-view"></div>
                    <div id="avs-view-packs" class="avs-view">
                        <div style="display:flex; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                            <div class="avs-btn avs-btn-primary" id="avs-btn-new-pack" style="flex:1; min-width:140px;">＋ 創建新檔案</div>
                            <div class="avs-btn avs-btn-outline" id="avs-btn-preset-pack" style="flex:1; min-width:140px;">🪶 簡易預設</div>
                            <div class="avs-btn avs-btn-outline" id="avs-btn-ai-gen-pack" style="flex:1; min-width:140px; display:none;">🧬 AI 從世界生成</div>
                        </div>
                        <div id="avs-pack-list" style="display:flex; flex-direction:column; gap:10px;"></div>
                        <div id="avs-pack-editor" class="avs-card" style="display:none;">
                            <div class="avs-label">檔案名稱</div>
                            <input class="avs-input" id="avs-pack-name" style="margin-bottom:15px;">
                            <div class="avs-label">說明</div>
                            <textarea class="avs-textarea" id="avs-pack-notes" style="margin-bottom:15px;"></textarea>
                            <div id="avs-var-rows-container" style="margin-bottom:15px;"></div>
                            <div class="avs-btn avs-btn-outline" id="avs-btn-add-var" style="width:100%; margin-bottom:15px;">＋ 新增項目</div>
                            <div style="display:flex; gap:10px;">
                                <div class="avs-btn avs-btn-primary" id="avs-btn-save-pack" style="flex:1;">儲存</div>
                                <div class="avs-btn avs-btn-outline" id="avs-btn-cancel-pack" style="flex:1;">取消</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 🔥 煉丹爐 modal（從變數包 tab 頂部按鈕 / 卡片按鈕觸發）-->
                <div id="avs-furnace-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(5px); z-index:99999; padding:20px; box-sizing:border-box; align-items:center; justify-content:center; overflow-y:auto;">
                    <div style="max-width:600px; width:100%; background:#EEF0F6; border:1px solid rgba(26,28,40,0.25); border-radius:8px; padding:20px; box-shadow:0 0 40px rgba(26,28,40,0.10); margin:auto;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; padding-bottom:10px; border-bottom:1px solid rgba(26,28,40,0.15);">
                            <strong style="font-size:16px; color:#1A1C28;">🔥 煉丹爐 · 為檔案煉個 UI 面板</strong>
                            <div style="color:#1A1C28; cursor:pointer; font-size:20px;" id="avs-furnace-close">✕</div>
                        </div>
                        <div class="avs-card" id="furnace-card" style="background:transparent; border:none; padding:0;">
                            <!-- 預選 pack 顯示（煉丹爐永遠從變數包卡片進入，所以一定知道是哪個 pack）-->
                            <div id="furnace-pack-display" style="margin-bottom:15px; padding:10px 12px; background:rgba(26,28,40,0.08); border:1px solid rgba(26,28,40,0.15); border-radius:6px; font-size:13px; color:#1A1C28;">
                                正在為 <strong id="furnace-pack-display-name" style="color:#d4af37;">?</strong> 煉丹
                            </div>
                            <!-- 內部用的 hidden select，存當前 packId 供煉丹流程讀取 -->
                            <select id="furnace-pack-select" style="display:none;"></select>

                            <!-- 風格建議下拉（有建議時才顯示） -->
                            <div id="furnace-presets-wrap" style="display:none;margin-bottom:14px;">
                                <div class="avs-label" style="margin-bottom:6px;">💡 載入風格建議</div>
                                <div id="furnace-presets-list" style="display:flex;flex-direction:column;gap:6px;"></div>
                            </div>

                            <div class="avs-label">視覺風格要求</div>
                            <textarea class="avs-textarea" id="furnace-style-prompt" placeholder="例如：賽博龐克風格、霓虹發光、半透明玻璃&#10;或點上方「載入風格建議」快速填入" style="margin-bottom:15px;"></textarea>
                            <div class="avs-btn avs-btn-primary" id="furnace-start-btn" style="width:100%;">🔥 開始煉丹</div>
                            <div class="furnace-log" id="furnace-log-output" style="margin-top:15px;">等待點火...</div>
                        </div>
                    </div>
                </div>

                <!-- V3：條件規則 modal（從變數包卡片「⚡ 規則」按鈕觸發）-->
                <div id="avs-rules-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(5px); z-index:99999; padding:20px; box-sizing:border-box; overflow-y:auto;">
                    <div style="max-width:600px; margin:20px auto; background:#EEF0F6; border:1px solid rgba(26,28,40,0.25); border-radius:8px; padding:20px; box-shadow:0 0 40px rgba(26,28,40,0.10);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; padding-bottom:10px; border-bottom:1px solid rgba(26,28,40,0.15);">
                            <strong style="font-size:16px; color:#1A1C28;">⚡ <span id="avs-rules-modal-title">檔案</span> · 條件規則</strong>
                            <div style="color:#1A1C28; cursor:pointer; font-size:20px;" id="avs-rules-modal-close">✕</div>
                        </div>
                        <div style="font-size:11px; color:rgba(26,28,40,0.30); margin-bottom:12px; line-height:1.6;">
                            條件滿足時注入主模型 system prompt，引導劇情走向。<br>例：「好感度 ≥ 80 時對主角親暱稱呼」
                        </div>
                        <div id="avs-rules-modal-list" style="display:flex; flex-direction:column; gap:10px; max-height:60vh; overflow-y:auto; padding:4px;"></div>
                        <div style="display:flex; gap:10px; margin-top:15px;">
                            <div class="avs-btn avs-btn-primary" id="avs-rules-modal-add" style="flex:1;">＋ 添加規則</div>
                            <div class="avs-btn avs-btn-outline" id="avs-rules-modal-close-btn" style="flex:0 0 100px;">關閉</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.querySelector('#avs-nav-home').onclick = () => { if (win.PhoneSystem) win.PhoneSystem.goHome(); };

        const helpOverlay = container.querySelector('#avs-help-overlay');
        container.querySelector('#avs-btn-help').onclick  = () => { helpOverlay.style.display = 'block'; };
        container.querySelector('#avs-help-close').onclick = () => { helpOverlay.style.display = 'none'; };

        // V3：規則 modal 關閉 + 添加按鈕
        const rulesModalCloseBtn = container.querySelector('#avs-rules-modal-close');
        const rulesModalCloseBtn2 = container.querySelector('#avs-rules-modal-close-btn');
        const rulesModalAddBtn = container.querySelector('#avs-rules-modal-add');
        if (rulesModalCloseBtn)  rulesModalCloseBtn.onclick = () => closeRulesModal(container);
        if (rulesModalCloseBtn2) rulesModalCloseBtn2.onclick = () => closeRulesModal(container);
        if (rulesModalAddBtn) rulesModalAddBtn.onclick = () => {
            _editingRuleIdInModal = '__new__';
            renderRulesModalList(container);
        };

        const tabs = container.querySelectorAll('.avs-tab');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                container.querySelectorAll('.avs-view').forEach(v => v.classList.remove('active'));
                tab.classList.add('active');
                container.querySelector(`#avs-view-${tab.dataset.tab}`).classList.add('active');
                if (tab.dataset.tab === 'state') renderStateView(container);
                // V3：條件規則 tab 砍掉，改在「📦 變數包」每張卡片內當「⚡ 條件規則」子按鈕
                if (tab.dataset.tab === 'modes') win.OS_AVS_RULES?.renderModesTab?.(container);
                if (tab.dataset.tab === 'memory') win.OS_AVS_MEMORY?.renderInto?.(container.querySelector('#avs-view-memory'));
            };
        });

        // 🔥 煉丹爐 modal 關閉（開啟由變數包卡片內按鈕觸發，沒有獨立頂部入口）
        const furnaceModal = container.querySelector('#avs-furnace-modal');
        const closeFurnaceBtn = container.querySelector('#avs-furnace-close');
        if (closeFurnaceBtn) closeFurnaceBtn.onclick = () => closeFurnaceModal(container);
        // 點空白處關閉 modal
        if (furnaceModal) furnaceModal.onclick = (e) => {
            if (e.target === furnaceModal) closeFurnaceModal(container);
        };

        await loadAllData(container);
        bindPackEditorEvents(container);
        bindFurnaceEvents(container);
        renderStateView(container); // 預設顯示目前狀態

        // 監聽 AVS 更新事件，自動刷新狀態頁
        win.addEventListener('AVS_VARS_UPDATED', () => {
            const stateView = container.querySelector('#avs-view-state');
            if (stateView && stateView.classList.contains('active')) renderStateView(container);
        });
    }

    // 🧬 共用：AI 生成 schema → 轉變數 → 存變數包 → 存規則 → 同步世界書 → 觸發初始填充。
    // 兩個入口共用（變數包「AI 從世界生成」按鈕 + AVS 狀態「開始追蹤狀態」按鈕）；UI 更新由各呼叫端自己做。
    // 回傳 { pack, ruleCount } 成功 / null 失敗（generate 內部已 toast 失敗訊息）。
    async function _aiGenerateAndSavePack() {
        if (!win.OS_STATE_SCHEMA?.generate) {
            alert('OS_STATE_SCHEMA 不可用（請確認 state_schema.js 已載入）');
            return null;
        }
        const result = await win.OS_STATE_SCHEMA.generate({ skipInitialFill: true });
        const schema = result?.fields || result;   // 向前兼容舊版只返回 fields
        const aiRules = Array.isArray(result?.rules) ? result.rules : [];
        if (!schema || !Object.keys(schema).length) return null;
        const variables = Object.entries(schema).map(([name, def]) => {
            const init = def?.init;
            const t = def?.type || 'string';
            let defaultValue;
            if (t === 'list') {
                if (Array.isArray(init)) {
                    defaultValue = JSON.stringify(init);
                } else if (typeof init === 'string' && init.trim()) {
                    try {
                        const parsed = JSON.parse(init);
                        defaultValue = Array.isArray(parsed) ? JSON.stringify(parsed) : '[]';
                    } catch(e) {
                        defaultValue = '[]';
                    }
                } else {
                    defaultValue = '[]';
                }
            } else if (init === undefined || init === null || init === '') {
                defaultValue = t === 'number' ? 0 : '';
            } else if (typeof init === 'object') {
                try { defaultValue = JSON.stringify(init); } catch(e) { defaultValue = ''; }
            } else {
                defaultValue = init;
            }
            return { name, defaultValue, desc: def?.desc || '', type: t };
        });
        const title = win.OS_AVS_ADAPTER?.getStoryTitle?.() || '新世界';
        const currentChatId = win.OS_AVS_ADAPTER?.getCurrentChatId?.() || '';
        const pack = {
            id: 'pack_' + Date.now(),
            name: `${title} (AI 生成)`,
            notes: '由主模型讀世界書 + 角色卡 + 開頭劇情自動生成。可手動編輯增/減/改變數。',
            variables,
            chatId: currentChatId
        };
        await win.OS_DB.saveVarPack(pack);
        let savedRuleCount = 0;
        if (aiRules.length && win.OS_AVS_RULES?.addRule) {
            for (const r of aiRules) {
                if (!r || !r.path || !r.op || !r.content) continue;
                let val = r.value;
                const n = parseFloat(val);
                if (!isNaN(n) && String(n) === String(val)) val = n;
                win.OS_AVS_RULES.addRule({
                    name: r.name || `${r.path} ${r.op} ${r.value}`,
                    path: String(r.path).trim(),
                    op: String(r.op).trim(),
                    value: val,
                    content: String(r.content).trim(),
                    enabled: true,
                    packId: pack.id
                });
                savedRuleCount++;
            }
        }
        await syncVarPackToLorebook();
        if (win.toastr) win.toastr.success(`✅ 已生成「${pack.name}」（${variables.length} 個項目 / ${savedRuleCount} 條規則），世界書已同步`);
        if (win.OS_STATE_RUNTIME?.extractOnce) {
            setTimeout(() => {
                try { win.OS_STATE_RUNTIME.extractOnce(); } catch(e) {
                    console.warn('[AVS] 觸發副模型初始填充失敗:', e);
                }
            }, 500);
        }
        return { pack, ruleCount: savedRuleCount };
    }

    async function loadAllData(container) {
        if (!win.OS_DB) return;
        currentPacks = await win.OS_DB.getAllVarPacks();
        currentTemplates = await win.OS_DB.getAllUITemplates();
        renderPackList(container);
    }

    // === 同步變數包定義到酒館世界書（讓酒館主模型寫劇情時看到變數說明）===
    // 觸發時機：AI 生成 / 編輯儲存 / 刪除變數包 之後
    // PWA 不需要（PWA 的主模型走自家機制，不靠酒館世界書）
    async function syncVarPackToLorebook() {
        if (win.OS_API?.isStandalone?.()) return;
        if (!win.TavernHelper?.getLorebookEntries) return;

        const chatId = win.OS_AVS_ADAPTER?.getCurrentChatId?.() || '';
        if (!chatId) return;

        const bookName = win.TavernHelper.getCurrentCharPrimaryLorebook?.()
            || win.TavernHelper.getCharWorldbookNames?.('current')?.primary;
        if (!bookName) {
            console.warn('[AVS Sync] 未綁定世界書，跳過同步');
            return;
        }

        const targetComment = `[本世界狀態變數說明書] - ${chatId}`;

        try {
            const allPacks = await win.OS_DB.getAllVarPacks();
            // 只用「沒綁 chatId（全域 pack）」或「綁定當前 chatId」的 pack
            // 跨角色卡 / 跨 chat 的 pack 不應該混進當前 chat 的世界書
            const packs = (allPacks || []).filter(p => !p.chatId || p.chatId === chatId);
            const allVars = [];
            for (const pack of packs) {
                if (!Array.isArray(pack.variables)) continue;
                for (const v of pack.variables) {
                    if (v.name) allVars.push(v);
                }
            }

            const entries = await win.TavernHelper.getLorebookEntries(bookName);
            const existing = entries.find(e => e.comment === targetComment);

            // 沒任何變數 → 刪掉舊條目（避免殘留誤導 AI）
            if (allVars.length === 0) {
                if (existing) {
                    await win.TavernHelper.updateLorebookEntriesWith(bookName, list =>
                        list.filter(e => e.comment !== targetComment)
                    );
                    console.log('[AVS Sync] 變數包已清空，刪除世界書條目');
                }
                return;
            }

            // 組變數說明書內容
            const lines = allVars.map(v => {
                const typeStr = v.type ? ` (${v.type})` : '';
                const descStr = v.desc ? `：${v.desc}` : '';
                return `- ${v.name}${typeStr}${descStr}`;
            });
            const content = `[本世界狀態變數說明書]
本世界劇情中追蹤的狀態變數定義。劇情演進時請依各變數的描述與範圍合理推進，不要違反枚舉值範圍或數值上下限。

${lines.join('\n')}

註：變數的「當前值」會由系統另行注入，本條目僅是變數定義說明書。`;

            const entryData = {
                comment: targetComment,
                keys: [],
                content,
                constant: true,
                enabled: true,
                position: 'at_depth_as_system',
                depth: 1,
                order: 9990
            };

            if (existing) {
                await win.TavernHelper.updateLorebookEntriesWith(bookName, list =>
                    list.map(e => e.comment === targetComment ? { ...e, ...entryData } : e)
                );
            } else {
                await win.TavernHelper.createLorebookEntries(bookName, [entryData]);
            }
            console.log(`📖 [AVS Sync] 變數說明書已同步到世界書: ${targetComment} (${allVars.length} 變數)`);
        } catch(e) {
            console.warn('[AVS Sync] 同步世界書失敗:', e);
        }
    }

    // 🔥 開煉丹爐 modal（永遠帶 packId，從變數包卡片內按鈕進入）
    function openFurnaceModal(container, packId) {
        if (!packId) { console.warn('[AVS] openFurnaceModal 需要 packId'); return; }
        const modal = container.querySelector('#avs-furnace-modal');
        const displayName = container.querySelector('#furnace-pack-display-name');
        const select = container.querySelector('#furnace-pack-select');

        refreshFurnacePackSelect(container); // 填 hidden select 的 option

        const pack = currentPacks.find(p => p.id === packId);
        if (displayName) displayName.textContent = pack ? pack.name : '?';
        if (select) select.value = packId;
        if (modal) modal.style.display = 'flex';
    }

    function closeFurnaceModal(container) {
        const modal = container.querySelector('#avs-furnace-modal');
        if (modal) modal.style.display = 'none';
    }

    function renderPackList(container) {
        const listEl = container.querySelector('#avs-pack-list');
        listEl.innerHTML = '';
        const allRules = win.OS_AVS_RULES?.loadRules?.() || [];

        if (currentPacks.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; padding:30px 20px; color:rgba(26,28,40,0.20); font-size:13px;">尚無檔案<br><br>點上方「＋ 創建新檔案」開始</div>';
            return;
        }

        // 排序顯示：當前卡綁定的排最上(正常)，其他卡的 / 全域的折疊起來、暗著只供檢視
        const _curCid = win.OS_AVS_ADAPTER?.getCurrentChatId?.() || '';
        const _otherWrap = document.createElement('div');
        _otherWrap.style.opacity = '0.5';
        let _otherCount = 0;

        currentPacks.forEach(pack => {
            const rulesCount = allRules.filter(r => r.packId === pack.id).length;
            // 找此 pack 的 UI 面板（只看屬於 AVS 的：有 packId + 沒 VN 標記）
            const packTpls = currentTemplates.filter(t => t.packId === pack.id && !t.isVNTag && !t.isBlock && !t.tagId);
            const activeTpl = packTpls.find(t => t.isActive) || packTpls[0] || null;

            const card = document.createElement('div');
            card.className = 'avs-card';
            card.innerHTML = `
                <strong style="color:#1A1C28;">${pack.name}</strong>
                <p style="font-size:12px; color:rgba(26,28,40,0.25);">${pack.variables.length} 個項目${rulesCount ? ` · ${rulesCount} 條規則` : ''}</p>
                <div style="font-size:11px; margin:1px 0 2px;">${pack.chatId ? `🔒 <span style="color:#2e9e6b;">綁定此卡</span> <span style="color:rgba(26,28,40,0.45);">${String(pack.chatId).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>` : `🌐 <span style="color:#c9920f;">全域 · 所有卡共用 ⚠️</span>`}</div>
                <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                    <div class="avs-btn avs-btn-outline btn-edit" style="flex:1; min-width:60px; padding:6px;">編輯</div>
                    <div class="avs-btn avs-btn-outline btn-rules" style="flex:1; min-width:90px; padding:6px;">⚡ 規則${rulesCount ? ` (${rulesCount})` : ''}</div>
                    <div class="avs-btn avs-btn-danger btn-del" style="padding:6px 12px;">刪除</div>
                </div>
                <div class="pack-ui-area" style="margin-top:14px; padding-top:12px; border-top:1px dashed rgba(26,28,40,0.10);"></div>
            `;

            // === 嵌入 UI 面板區（取代原本獨立「展廳」tab）===
            const uiArea = card.querySelector('.pack-ui-area');
            if (!activeTpl) {
                uiArea.innerHTML = `
                    <div style="font-size:12px; color:rgba(26,28,40,0.25); margin-bottom:8px;">🖼️ UI 面板：<span style="color:#888;">無</span></div>
                    <div class="avs-btn avs-btn-outline btn-go-furnace" style="width:100%; padding:8px; font-size:12px;">✨ 為這個檔案煉個 UI 面板</div>
                `;
                uiArea.querySelector('.btn-go-furnace').onclick = () => openFurnaceModal(container, pack.id);
            } else {
                // 用當前狀態 + 預設值替換佔位符做預覽（支援 object 型 {{#each}} 迴圈）
                const previewState = win._AVS_ENGINE?.read?.() || {};
                const fmt = win.OS_AVS_ADAPTER?.formatVarValue || (v => String(v ?? ''));
                const _avMem = (win.VN_PLAYER || win.VN_Core)?._avatarMemCache || {};   // 預覽用記憶體頭像(best-effort)
                let previewHtml = _avsRenderTemplate(activeTpl.htmlContent || '', previewState, pack.variables || [], fmt, _avMem);

                const scopeId = `pack-tpl-preview-${activeTpl.id}`;
                let scopedCssText = '';
                if (activeTpl.cssContent) {
                    scopedCssText = activeTpl.cssContent.replace(/([^{}@][^{}]*)\{/g, (m, selector) => {
                        const scoped = selector.trim().split(',').map(s => `#${scopeId} ${s.trim()}`).join(', ');
                        return `${scoped} {`;
                    });
                }

                uiArea.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-size:12px; color:rgba(26,28,40,0.68);">🖼️ UI 面板：<span style="color:#d4af37;">已煉</span>${activeTpl.isActive ? '<span style="font-size:10px;color:#2ecc71;border:1px solid #2ecc71;padding:1px 6px;border-radius:3px;margin-left:6px;">啟用中</span>' : ''}</span>
                    </div>
                    ${scopedCssText ? `<style>${scopedCssText}</style>` : ''}
                    <div id="${scopeId}" style="margin-bottom:10px; padding:10px; background:rgba(0,0,0,0.3); border-radius:6px; min-height:60px; overflow:hidden;">
                        ${previewHtml || '<span style="color:rgba(26,28,40,0.20);font-size:12px;">（無預覽內容）</span>'}
                    </div>
                    <div style="display:flex; gap:8px;">
                        <div class="avs-btn avs-btn-outline btn-toggle-active" style="flex:1; padding:6px; font-size:12px;">${activeTpl.isActive ? '✓ 取消啟用' : '設為啟用'}</div>
                        <div class="avs-btn avs-btn-outline btn-refurnace" style="flex:1; padding:6px; font-size:12px;">🔄 重新煉丹</div>
                        <div class="avs-btn avs-btn-danger btn-del-tpl" style="padding:6px 12px; font-size:12px;">🗑</div>
                    </div>
                `;

                uiArea.querySelector('.btn-toggle-active').onclick = async () => {
                    // 同一個 pack 只能有一個 active
                    if (!activeTpl.isActive) {
                        const otherActive = currentTemplates.find(t => t.packId === activeTpl.packId && t.isActive && t.id !== activeTpl.id);
                        if (otherActive) {
                            otherActive.isActive = false;
                            await win.OS_DB.saveUITemplate(otherActive);
                        }
                    }
                    activeTpl.isActive = !activeTpl.isActive;
                    await win.OS_DB.saveUITemplate(activeTpl);
                    currentTemplates = await win.OS_DB.getAllUITemplates();
                    updateActiveTemplatesCache();
                    renderPackList(container);
                };
                uiArea.querySelector('.btn-refurnace').onclick = () => openFurnaceModal(container, pack.id);
                uiArea.querySelector('.btn-del-tpl').onclick = async () => {
                    if (!confirm(`刪除這個檔案對應的 UI 面板？檔案本身保留。`)) return;
                    await win.OS_DB.deleteUITemplate(activeTpl.id);
                    currentTemplates = await win.OS_DB.getAllUITemplates();
                    updateActiveTemplatesCache();
                    renderPackList(container);
                };
            }

            card.querySelector('.btn-edit').onclick = () => openPackEditor(container, pack);
            card.querySelector('.btn-rules').onclick = () => openRulesModal(container, pack);
            card.querySelector('.btn-del').onclick = async () => {
                // 列出此 pack 綁定的展廳 UI 模板 + 條件規則（讓用戶看清楚會連帶刪什麼）
                const tplsAll = await win.OS_DB.getAllUITemplates();
                const orphanedTpls = (tplsAll || []).filter(t => t.packId === pack.id);
                const orphanedRules = (win.OS_AVS_RULES?.loadRules?.() || []).filter(r => r.packId === pack.id);

                const warn = [];
                if (orphanedTpls.length)  warn.push(`${orphanedTpls.length} 個展廳 UI 模板`);
                if (orphanedRules.length) warn.push(`${orphanedRules.length} 條條件規則`);
                const tplWarning = warn.length ? `\n\n⚠️ 同時會刪除這個檔案對應的：\n  · ${warn.join('\n  · ')}` : '';
                if (!confirm(`刪除檔案「${pack.name}」？${tplWarning}\n\n世界書內狀態說明條目會自動更新（沒其他項目時也會被刪）。`)) return;

                // 1. 刪變數包本體
                await win.OS_DB.deleteVarPack(pack.id);
                // 2. 刪所有綁此 packId 的展廳 UI 模板
                for (const tpl of orphanedTpls) {
                    try { await win.OS_DB.deleteUITemplate(tpl.id); } catch(e) {}
                }
                // 3. 刪所有綁此 packId 的條件規則
                for (const r of orphanedRules) {
                    try { win.OS_AVS_RULES?.deleteRule?.(r.id); } catch(e) {}
                }
                // 4. reload UI + sync 世界書（沒變數時 sync 會自動刪世界書條目）
                await loadAllData(container);
                await syncVarPackToLorebook();
                console.log(`[AVS] 已刪除變數包「${pack.name}」+ ${orphanedTpls.length} 模板 + ${orphanedRules.length} 規則`);
            };
            if (pack.chatId && pack.chatId === _curCid) { listEl.appendChild(card); }
            else { _otherWrap.appendChild(card); _otherCount++; }
        });

        if (_otherCount) {
            const det = document.createElement('details');
            det.style.marginTop = '6px';
            det.innerHTML = `<summary style="cursor:pointer;color:rgba(26,28,40,0.45);font-size:12px;padding:10px 2px;list-style:none;">▸ 其他檔案（${_otherCount}）· 非當前卡 / 全域，僅供檢視</summary>`;
            det.appendChild(_otherWrap);
            listEl.appendChild(det);
        }
    }

    // ================================================================
    // V3：條件規則 modal（每個變數包自己一份規則）
    // ================================================================
    let _currentRulesPack = null;        // 當前開啟 modal 的 pack
    let _editingRuleIdInModal = null;    // null / ruleId / '__new__'

    function openRulesModal(container, pack) {
        _currentRulesPack = pack;
        _editingRuleIdInModal = null;
        container.querySelector('#avs-rules-modal-title').textContent = pack.name;
        container.querySelector('#avs-rules-modal').style.display = 'block';
        renderRulesModalList(container);
    }

    function closeRulesModal(container) {
        _currentRulesPack = null;
        _editingRuleIdInModal = null;
        container.querySelector('#avs-rules-modal').style.display = 'none';
        // 規則數可能變了，刷新 pack 列表（重新計算 N 條規則徽章）
        loadAllData(container);
    }

    const RULE_OPS = ['>=', '<=', '>', '<', '=', '!='];

    function renderRuleEditForm(pack, rule, isNew) {
        const id = isNew ? '__new__' : rule.id;
        const safeId = String(id).replace(/'/g, '&#39;');
        const fieldNames = (pack.variables || []).map(v => v.name).filter(Boolean);
        const curPath = rule?.path || fieldNames[0] || '';
        const curOp = rule?.op || '>=';
        const curVal = rule?.value !== undefined ? String(rule.value) : '';
        const curName = rule?.name || '';
        const curContent = rule?.content || '';

        return `<div class="avs-card" data-rule-edit="${id}" style="background:rgba(228,232,245,0.97); border-color:#1A1C28;">
            <div style="margin-bottom:8px;"><span style="font-size:11px; color:rgba(26,28,40,0.35);">名稱</span>
                <input class="avs-input" data-rule-key="name" value="${escapeAttr(curName)}" placeholder="例：高好感親密化 / 末日緊張感">
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px;">
                <div style="flex:2;"><span style="font-size:11px; color:rgba(26,28,40,0.35);">項目</span>
                    <select class="avs-select" data-rule-key="path">
                        ${fieldNames.length === 0
                          ? '<option value="">（檔案無項目）</option>'
                          : fieldNames.map(n => `<option value="${escapeAttr(n)}" ${n === curPath ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:0 0 70px;"><span style="font-size:11px; color:rgba(26,28,40,0.35);">運算</span>
                    <select class="avs-select" data-rule-key="op">
                        ${RULE_OPS.map(o => `<option value="${o}" ${o === curOp ? 'selected' : ''}>${o}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:1;"><span style="font-size:11px; color:rgba(26,28,40,0.35);">值</span>
                    <input class="avs-input" data-rule-key="value" value="${escapeAttr(curVal)}" placeholder="例 80">
                </div>
            </div>
            <div style="margin-bottom:8px;"><span style="font-size:11px; color:rgba(26,28,40,0.35);">注入內容（給主模型看的指示）</span>
                <textarea class="avs-textarea" data-rule-key="content" style="min-height:60px;" placeholder="條件滿足時主模型該怎麼寫劇情。例：對主角的稱呼從「你」改為親暱稱呼，對話帶撒嬌語氣">${escapeHtml(curContent)}</textarea>
            </div>
            <div style="display:flex; gap:8px; justify-content:flex-end;">
                <div class="avs-btn avs-btn-outline" onclick="window.OS_AVS?._cancelEditRule?.()">取消</div>
                <div class="avs-btn avs-btn-primary" onclick="window.OS_AVS?._saveEditRule?.('${safeId}')">${isNew ? '新增' : '儲存'}</div>
            </div>
        </div>`;
    }

    function renderRulesModalList(container) {
        if (!_currentRulesPack) return;
        const listEl = container.querySelector('#avs-rules-modal-list');
        if (!listEl) return;
        const pack = _currentRulesPack;
        const allRules = win.OS_AVS_RULES?.loadRules?.() || [];
        const packRules = allRules.filter(r => r.packId === pack.id);

        let html = '';
        for (const r of packRules) {
            if (_editingRuleIdInModal === r.id) {
                html += renderRuleEditForm(pack, r, false);
                continue;
            }
            const enabled = r.enabled !== false;
            html += `<div class="avs-card" style="${!enabled ? 'opacity:0.5;' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <strong style="color:#1A1C28; font-size:13px;">${escapeHtml(r.name || '未命名規則')}</strong>
                    <div style="display:flex; gap:6px; flex-shrink:0;">
                        <div class="avs-btn avs-btn-outline" style="padding:4px 10px; font-size:11px;" onclick="window.OS_AVS?._toggleRule?.('${escapeAttr(r.id)}')">${enabled ? '啟用' : '停用'}</div>
                        <div class="avs-btn avs-btn-outline" style="padding:4px 10px; font-size:11px;" onclick="window.OS_AVS?._editRule?.('${escapeAttr(r.id)}')">編輯</div>
                        <div class="avs-btn avs-btn-danger" style="padding:4px 10px; font-size:11px;" onclick="window.OS_AVS?._delRule?.('${escapeAttr(r.id)}')">✖</div>
                    </div>
                </div>
                <div style="font-size:12px; margin-top:6px; color:rgba(26,28,40,0.68); font-family:monospace;">
                    ${escapeHtml(r.path || '?')} <span style="color:#1A1C28; margin:0 4px;">${r.op}</span> <span style="color:#1A1C28;">${escapeHtml(String(r.value ?? ''))}</span>
                </div>
                <div style="font-size:12px; margin-top:6px; color:rgba(255,248,231,0.85); line-height:1.6;">${escapeHtml(r.content || '（無注入內容）')}</div>
            </div>`;
        }
        if (_editingRuleIdInModal === '__new__') {
            html += renderRuleEditForm(pack, null, true);
        }
        if (!packRules.length && _editingRuleIdInModal !== '__new__') {
            html = `<div style="text-align:center; padding:40px 20px; color:rgba(26,28,40,0.20); font-size:12px;">
                這個檔案還沒設規則。點下方「＋ 添加規則」開始。
            </div>` + html;
        }
        listEl.innerHTML = html;
    }

    // escape helpers（os_avs.js 內未必有，定義一下）
    function escapeHtml(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function escapeAttr(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function bindPackEditorEvents(container) {
        const btnNew = container.querySelector('#avs-btn-new-pack');
        const btnSave = container.querySelector('#avs-btn-save-pack');
        const btnCancel = container.querySelector('#avs-btn-cancel-pack');
        const btnAddVar = container.querySelector('#avs-btn-add-var');
        const rowsContainer = container.querySelector('#avs-var-rows-container');

        btnNew.onclick = () => openPackEditor(container, null);
        btnCancel.onclick = () => { container.querySelector('#avs-pack-editor').style.display = 'none'; container.querySelector('#avs-pack-list').style.display = 'flex'; btnNew.style.display = 'inline-flex'; };
        btnAddVar.onclick = () => addVarRow(rowsContainer, '', '', '', 'string');

        // 酒館特有：AI 從世界書/角色卡/開頭劇情生成變數包（PWA 有 VN_STORY_STARTED 自動觸發，不需此按鈕）
        const btnAiGen = container.querySelector('#avs-btn-ai-gen-pack');
        const isTavern = !(win.OS_API?.isStandalone?.());
        if (btnAiGen && isTavern) {
            btnAiGen.style.display = 'inline-flex';
            btnAiGen.onclick = async () => {
                const original = btnAiGen.textContent;
                btnAiGen.textContent = '🧬 AI 分析中...';
                btnAiGen.style.pointerEvents = 'none';
                try {
                    const r = await _aiGenerateAndSavePack();
                    if (r) await loadAllData(container);
                } catch(e) {
                    console.error('[AVS] AI 生成變數包失敗:', e);
                    alert('生成失敗：' + (e?.message || e));
                } finally {
                    btnAiGen.textContent = original;
                    btnAiGen.style.pointerEvents = '';
                }
            };
        }

        // 🪶 簡易預設：一鍵套「角色狀態(形象/身分/好感度)」，跳過 AI 生成。可選、不強制——朋友想簡單就點這個
        const btnPreset = container.querySelector('#avs-btn-preset-pack');
        if (btnPreset) {
            btnPreset.onclick = async () => {
                if (!confirm('套用「簡易預設」檔案？\n每個角色追蹤：形象(髮色/眼色/體型)、身分、好感度。\n適合只想簡單跑劇情；想複雜可改走「AI 從世界生成」。')) return;
                const original = btnPreset.textContent;
                btnPreset.textContent = '套用中...'; btnPreset.style.pointerEvents = 'none';
                try {
                    const currentChatId = win.OS_AVS_ADAPTER?.getCurrentChatId?.() || '';
                    // 已有「簡易預設」就沿用同 id 覆蓋(不另建重複包)；重套＝更新結構，不重置已記錄的角色資料
                    let _existingId = '';
                    try { const _all = await win.OS_DB.getAllVarPacks() || []; const _e = _all.find(p => (p.name || '').includes('簡易預設') && (!p.chatId || p.chatId === currentChatId)); if (_e) _existingId = _e.id; } catch(e) {}
                    const pack = {
                        id: _existingId || ('pack_' + Date.now()),
                        name: '簡易預設（形象/身分/好感度）',
                        notes: '輕量預設：每個角色追蹤 形象(髮色/眼色/體型)、身分、好感度。新角色登場自動套這組。適合只想簡單跑劇情；想複雜可改走「AI 從世界生成」。',
                        // 物件型必須給「縮排結構範本」(parseTree 解析)，副模型才看得到固定子欄位、不會每輪亂編結構而導致覆蓋。外層用變數名包裝當範本(會被剝掉)。
                        variables: [{
                            name: '角色狀態',
                            type: 'object',
                            defaultValue: '角色狀態:\n  髮色: 待定\n  眼色: 待定\n  體型: 待定\n  身分: 待定\n  好感度: 0',
                            desc: '每個「有意義的具名角色」的即時狀態。固定基礎屬性(每個角色同一組、全部平鋪不要再分層、順序一致)：髮色、眼色、體型、身分、好感度(0-100，對主角MC的好感，純數字不加符號)。'
                                + '【更新方式】用點記法只更新有變化的「單一屬性」，固定三層「角色狀態.角色名.屬性」(例：角色狀態.愛麗絲.好感度、角色狀態.愛麗絲.髮色)，不要再多包一層、不要整包重寫、沒變的別動，避免洗掉其他角色與屬性。'
                                + '【誰要記】只記有名字、對劇情有份量的人物角色；雜魚/怪獸/野生動物/路人敵兵這類不要當角色(除非是有劇情份量的具名角色)。'
                                + '【主角MC例外】主角 / MC / {{user}} 本人「不要好感度」→ 好感度欄填 null，其餘欄照記。'
                                + '新角色登場時按固定基礎屬性組補齊每一欄初值。'
                        }],
                        chatId: currentChatId
                    };
                    await win.OS_DB.saveVarPack(pack);
                    // 把現有資料的舊「形象」巢狀一併攤平(形象.髮色 → 髮色)，跟新的平結構對齊、不丟角色
                    try {
                        const _eng = win._AVS_ENGINE; const _st = _eng?.read?.();
                        if (_st && _st['角色狀態'] && typeof _st['角色狀態'] === 'object') {
                            for (const _ent of Object.values(_st['角色狀態'])) {
                                if (_ent && typeof _ent === 'object' && _ent['形象'] && typeof _ent['形象'] === 'object') {
                                    for (const [_k, _v] of Object.entries(_ent['形象'])) if (_ent[_k] === undefined) _ent[_k] = _v;
                                    delete _ent['形象'];
                                }
                            }
                            _eng.write(_st);
                        }
                    } catch(e) {}
                    // 附一個「內建簡單面板」：沒有美化面板時自動裝+啟用，朋友/測試期不用每次叫 AI 生（有 AI 面板就不搶）
                    try {
                        const _DEF_HTML = '<div class="avsdef-wrap"><div class="avsdef-title">📋 角色狀態</div><div class="avsdef-grid">{{#each 角色狀態}}<div class="avsdef-card"><div class="avsdef-hd"><img class="avsdef-ava" src="{{@avatar}}"><div class="avsdef-name">{{@key}}</div></div><div class="avsdef-row"><span class="avsdef-k">身分</span><span class="avsdef-v">{{身分}}</span></div><div class="avsdef-row"><span class="avsdef-k">好感度</span><span class="avsdef-v avsdef-fav">{{好感度}}</span></div><div class="avsdef-sep"></div><div class="avsdef-row"><span class="avsdef-k">髮色</span><span class="avsdef-v">{{髮色}}</span></div><div class="avsdef-row"><span class="avsdef-k">眼色</span><span class="avsdef-v">{{眼色}}</span></div><div class="avsdef-row"><span class="avsdef-k">體型</span><span class="avsdef-v">{{體型}}</span></div></div>{{/each}}</div></div>';
                        const _DEF_CSS = '.avsdef-wrap{font-family:-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;padding:4px 0;}.avsdef-title{font-size:15px;font-weight:700;color:#7a5fb0;letter-spacing:1px;margin:0 0 10px 2px;}.avsdef-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;}.avsdef-card{background:#fff;border:1px solid rgba(120,90,160,0.18);border-radius:14px;padding:12px 14px;box-shadow:0 2px 8px rgba(120,90,160,0.08);}.avsdef-hd{display:flex;align-items:center;gap:9px;margin-bottom:8px;border-bottom:1px dashed rgba(120,90,160,0.25);padding-bottom:8px;}.avsdef-ava{width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;background:rgba(120,90,160,0.08);border:1px solid rgba(120,90,160,0.2);}.avsdef-name{font-size:15px;font-weight:800;color:#5a4a78;}.avsdef-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:3px 0;font-size:12px;}.avsdef-k{color:#9a90b0;flex-shrink:0;}.avsdef-v{color:#3a3450;font-weight:600;text-align:right;word-break:break-word;}.avsdef-fav{color:#e0608a;}.avsdef-sep{height:1px;background:rgba(120,90,160,0.10);margin:5px 0;}';
                        const _allTpls = (await win.OS_DB.getAllUITemplates?.()) || [];
                        const _mine = _allTpls.filter(t => t.packId === pack.id);
                        const _hasActive = _mine.some(t => t.isActive);
                        const _defId = 'tpl_default_' + pack.id;
                        if (!_mine.some(t => t.id === _defId)) {
                            await win.OS_DB.saveUITemplate({
                                id: _defId, packId: pack.id, packName: pack.name,
                                cssContent: _DEF_CSS, htmlContent: _DEF_HTML,
                                isActive: !_hasActive, isDefault: true, createdAt: Date.now()
                            });
                            const _all2 = (await win.OS_DB.getAllUITemplates?.()) || [];
                            localStorage.setItem('avs_active_ui_templates', JSON.stringify(_all2.filter(t => t.isActive)));
                        }
                    } catch(e) { console.warn('[AVS] 內建簡單面板安裝失敗:', e); }
                    await loadAllData(container);
                    await syncVarPackToLorebook();
                    if (win.toastr) win.toastr.success('✅ 已套用簡易預設檔案');
                    if (win.OS_STATE_RUNTIME?.extractOnce) {
                        setTimeout(() => { try { win.OS_STATE_RUNTIME.extractOnce(); } catch (e) {} }, 500);
                    }
                } catch (e) {
                    console.error('[AVS] 套用簡易預設失敗:', e);
                    alert('套用失敗：' + (e?.message || e));
                } finally {
                    btnPreset.textContent = original; btnPreset.style.pointerEvents = '';
                }
            };
        }

        btnSave.onclick = async () => {
            const name = container.querySelector('#avs-pack-name').value;
            if (!name) return;
            const variables = [];
            rowsContainer.querySelectorAll('.avs-var-row').forEach(row => {
                const vn = row.querySelector('.var-name').value;
                if (!vn) return;
                const vtype = row.querySelector('.var-type')?.value || 'string';
                // 物件型的預設值來自大文字框（var-default-obj），其餘來自單行 input
                const defVal = vtype === 'object'
                    ? (row.querySelector('.var-default-obj')?.value || '')
                    : (row.querySelector('.var-default')?.value || '');
                variables.push({
                    name: vn,
                    defaultValue: defVal,
                    desc: row.querySelector('.var-desc')?.value || '',
                    type: vtype
                });
            });
            const pack = activeEditingPack ? { ...activeEditingPack } : { id: 'pack_' + Date.now() };
            pack.name = name; pack.notes = container.querySelector('#avs-pack-notes').value; pack.variables = variables;
            await win.OS_DB.saveVarPack(pack);
            btnCancel.onclick(); await loadAllData(container);
            await syncVarPackToLorebook();
        };
    }

    // ================================================================
    // UI 模板渲染引擎：{{變數}} 佔位符 + {{#each 容器}}...{{/each}} 迴圈
    //   迴圈用於 object 型變數（如「角色狀態」），對每個實體重複渲染卡片
    //   迴圈內可用 {{@key}}（實體名）與 {{屬性名}}（該實體的屬性值）
    //   → 跑團新增的角色會自動長出卡片，不必重煉
    // ================================================================
    function _avsGetByPath(obj, path) {
        const keys = String(path).split('.');
        let cur = obj;
        for (const k of keys) {
            if (cur == null || typeof cur !== 'object') return undefined;
            cur = cur[k];
        }
        return cur;
    }
    function _avsRenderTemplate(html, state, packVars, fmt, avatarMap) {
        const f = fmt || (v => String(v == null ? '' : v));
        const _AV = avatarMap || {};
        const _TPX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';   // 透明 1px：沒頭像時用，避免破圖 icon
        let out = String(html || '');
        // 1. {{#each 容器}}...{{/each}} 迴圈塊（object 型變數用）
        const _avsDeepMerge = (base, over) => {
            if (over == null) return base;
            if (typeof base !== 'object' || typeof over !== 'object' || Array.isArray(base) || Array.isArray(over)) return over;
            const o = { ...base };
            for (const k of Object.keys(over)) o[k] = _avsDeepMerge(base[k], over[k]);
            return o;
        };
        // 把一層巢狀攤平：{形象:{髮色,眼色}} → {髮色,眼色}（相容舊的「形象」分層資料，讓 {{髮色}} 讀得到）
        const _avsFlatObj = (o) => { const r = {}; for (const [k, v] of Object.entries(o || {})) { if (v && typeof v === 'object' && !Array.isArray(v)) { for (const [k2, v2] of Object.entries(v)) r[k2] = v2; } else r[k] = v; } return r; };
        out = out.replace(/\{\{#each\s+([^\s{}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (m, containerPath, innerTpl) => {
            const container = _avsGetByPath(state, containerPath);
            // 取「每實體範本」(剝掉自包裝)，逐實體補初值；不再把整個 {變數名:範本} 灌進容器(那正是多出鬼實體的原因)
            let entTpl = {};
            const pv = (packVars || []).find(v => v.name === containerPath && v.type === 'object');
            if (pv) {
                try {
                    const tree = win._AVS_ENGINE?.parseTree?.(pv.defaultValue) || {};
                    const tk = Object.keys(tree);
                    entTpl = _avsFlatObj((tk.length === 1 && tk[0] === containerPath) ? tree[containerPath] : tree);
                } catch(e) {}
            }
            if (!container || typeof container !== 'object') return '';
            let blocks = '';
            for (const [entityKey, entityValRaw] of Object.entries(container)) {
                if (entityKey === containerPath) continue;                       // 跳過自包裝範本鍵(鬼實體)
                if (!entityValRaw || typeof entityValRaw !== 'object') continue; // 非實體(範本殘留純值)跳過
                const entityVal = { ...entTpl, ..._avsFlatObj(entityValRaw) };   // 範本當底 + 攤平實體(舊「形象」巢狀也攤平)
                let block = innerTpl;
                block = block.split('{{@key}}').join(entityKey);
                block = block.split('{{@avatar}}').join(_AV[entityKey] || _TPX);   // 角色頭像：用角色名去頭像庫撈，沒有就透明
                for (const [ak, av] of Object.entries(entityVal)) {
                    const sv = (av && typeof av === 'object') ? JSON.stringify(av) : f(av);
                    block = block.split(`{{${ak}}}`).join(sv);
                }
                // 剩餘 {{x}} / {{x.y}}：用點記法在「原始(未攤平)實體」上找 → 相容 AI 生的巢狀佔位符(如 {{形象.體型}})，找不到才 —
                block = block.replace(/\{\{([^{}]+)\}\}/g, (mm, expr) => {
                    const key = String(expr).trim();
                    if (key === '@key') return entityKey;
                    if (key === '@avatar') return _AV[entityKey] || _TPX;
                    const val = _avsGetByPath(entityValRaw, key);
                    return (val === undefined || val === null) ? '—' : (typeof val === 'object' ? JSON.stringify(val) : f(val));
                });
                blocks += block;
            }
            return blocks;
        });
        // 2. 一般佔位符 {{變數}}（扁平變數；object 型已由 each 處理，跳過）
        Object.entries(state || {}).forEach(([k, v]) => {
            if (v && typeof v === 'object') return;
            out = out.split(`{{${k}}}`).join(f(v));
        });
        (packVars || []).forEach(v => {
            if (v.type === 'object') return;
            out = out.split(`{{${v.name}}}`).join(f(v.defaultValue == null ? '0' : v.defaultValue));
        });
        // 3. 殘留佔位符 → —
        out = out.replace(/\{\{[^{}]+\}\}/g, '—');
        return out;
    }

    // 預撈出場角色頭像：{角色名 → 頭像URL}，給模板的 {{@avatar}} 用。async(VN_Cache 是 IndexedDB)。
    async function _avsBuildAvatarMap(state, packVars) {
        const map = {};
        try {
            if (!win.VN_Cache?.get) return map;
            const names = new Set();
            (packVars || []).forEach(v => {
                if (v.type !== 'object') return;
                const c = state && state[v.name];
                if (c && typeof c === 'object') Object.keys(c).forEach(k => { if (k !== v.name) names.add(k); });
            });
            for (const n of names) {
                try { const av = await win.VN_Cache.get('avatar_cache', n); if (av && av.url) map[n] = av.url; } catch (e) {}
            }
        } catch (e) {}
        return map;
    }

    // ================================================================
    // 物件型變數的「遞迴資料夾樹」GUI（小白友善，免手寫 JSON）
    //   📁 資料夾 = 容器，底下可遞迴放東西；🏷️ 數值 = 葉節點（名稱=值）
    //   GUI 任何改動即時 serialize 寫回隱藏 textarea（.var-default-obj）
    // ================================================================
    function _avsCoerceVal(raw) {
        const s = String(raw == null ? '' : raw).trim();
        if (s === '' || s === '{}') return {};
        if (s === '[]') return [];
        if (s === 'true')  return true;
        if (s === 'false') return false;
        if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
        if (/^".*"$/.test(s) || /^'.*'$/.test(s)) return s.slice(1, -1);
        return s;
    }
    function _avsValToStr(v) {
        if (v == null) return '';
        if (typeof v === 'object') return Array.isArray(v) ? '[]' : '{}';
        return String(v);
    }
    // 讀 DOM 樹 → JS 物件
    function _avsSerializeTree(childrenEl) {
        const obj = {};
        for (const node of childrenEl.children) {
            if (node.classList.contains('avs-obj-folder')) {
                const ki = node.querySelector('.avs-obj-folder-head .avs-obj-key');
                const key = ki ? ki.value.trim() : '';
                if (!key) continue;
                const childEl = node.querySelector('.avs-obj-children');
                obj[key] = childEl ? _avsSerializeTree(childEl) : {};
            } else if (node.classList.contains('avs-obj-leaf')) {
                const ki = node.querySelector('.avs-obj-key');
                const key = ki ? ki.value.trim() : '';
                if (!key) continue;
                const vi = node.querySelector('.avs-obj-val');
                obj[key] = _avsCoerceVal(vi ? vi.value : '');
            }
        }
        return obj;
    }
    // 把整棵樹 serialize 寫回該 row 的隱藏 textarea
    function _avsSyncTree(anyEl) {
        const row = anyEl.closest('.avs-var-row');
        if (!row) return;
        const rootChildren = row.querySelector('.var-obj-gui > .avs-obj-children');
        const ta = row.querySelector('.var-default-obj');
        if (rootChildren && ta) {
            try { ta.value = JSON.stringify(_avsSerializeTree(rootChildren), null, 2); } catch(e) {}
        }
    }
    // 葉節點：名稱 = 值
    function _avsMakeLeaf(key, val) {
        const el = document.createElement('div');
        el.className = 'avs-obj-leaf';
        el.style.cssText = 'display:flex; gap:6px; align-items:center; margin:3px 0;';
        el.innerHTML = `
            <span style="flex-shrink:0;">🏷️</span>
            <input class="avs-input avs-obj-key" placeholder="名稱" style="flex:1; font-size:12px;">
            <span style="flex-shrink:0; color:#888;">=</span>
            <input class="avs-input avs-obj-val" placeholder="值（數字/文字/{}）" style="flex:1; font-size:12px;">
            <span class="avs-obj-del" style="cursor:pointer; color:#e74c3c; flex-shrink:0; padding:0 4px;">✖</span>
        `;
        el.querySelector('.avs-obj-key').value = key != null ? String(key) : '';
        el.querySelector('.avs-obj-val').value = _avsValToStr(val);
        el.querySelector('.avs-obj-key').addEventListener('input', () => _avsSyncTree(el));
        el.querySelector('.avs-obj-val').addEventListener('input', () => _avsSyncTree(el));
        el.querySelector('.avs-obj-del').addEventListener('click', () => { const p = el.parentElement; el.remove(); if (p) _avsSyncTree(p); });
        return el;
    }
    // 資料夾節點：底下可遞迴
    function _avsMakeFolder(key, dataObj) {
        const el = document.createElement('div');
        el.className = 'avs-obj-folder';
        el.style.cssText = 'margin:4px 0; border:1px solid rgba(26,28,40,0.10); border-radius:4px; padding:4px 6px; background:rgba(0,0,0,0.15);';
        el.innerHTML = `
            <div class="avs-obj-folder-head" style="display:flex; gap:6px; align-items:center;">
                <span style="flex-shrink:0;">📁</span>
                <input class="avs-input avs-obj-key" placeholder="項目名" style="flex:1; font-size:12px; font-weight:600;">
                <span class="avs-obj-del" style="cursor:pointer; color:#e74c3c; flex-shrink:0; padding:0 4px;">✖</span>
            </div>
            <div class="avs-obj-children" style="margin-left:14px; border-left:1px solid rgba(26,28,40,0.08); padding-left:8px; margin-top:2px;"></div>
        `;
        const headKey = el.querySelector('.avs-obj-folder-head .avs-obj-key');
        headKey.value = key != null ? String(key) : '';
        headKey.addEventListener('input', () => _avsSyncTree(el));
        el.querySelector('.avs-obj-folder-head .avs-obj-del').addEventListener('click', () => { const p = el.parentElement; el.remove(); if (p) _avsSyncTree(p); });
        _avsRenderTree(el.querySelector('.avs-obj-children'), dataObj || {});
        return el;
    }
    // 「+ 新增」工具列
    function _avsMakeAddBar(childrenEl) {
        const bar = document.createElement('div');
        bar.className = 'avs-obj-addbar';
        bar.style.cssText = 'display:flex; gap:6px; margin:4px 0;';
        bar.innerHTML = `
            <button type="button" class="avs-obj-add-folder" style="font-size:11px; padding:2px 8px; background:rgba(26,28,40,0.12); border:1px solid rgba(26,28,40,0.15); color:#1A1C28; border-radius:3px; cursor:pointer;">+ 📁 資料夾</button>
            <button type="button" class="avs-obj-add-leaf" style="font-size:11px; padding:2px 8px; background:rgba(26,28,40,0.12); border:1px solid rgba(26,28,40,0.15); color:#1A1C28; border-radius:3px; cursor:pointer;">+ 🏷️ 數值</button>
        `;
        bar.querySelector('.avs-obj-add-folder').addEventListener('click', () => {
            childrenEl.insertBefore(_avsMakeFolder('', {}), bar);
            _avsSyncTree(childrenEl);
        });
        bar.querySelector('.avs-obj-add-leaf').addEventListener('click', () => {
            childrenEl.insertBefore(_avsMakeLeaf('', ''), bar);
            _avsSyncTree(childrenEl);
        });
        return bar;
    }
    // 遞迴渲染：JS 物件 → 樹，最後補一條 addbar
    function _avsRenderTree(childrenEl, dataObj) {
        childrenEl.innerHTML = '';
        for (const [k, v] of Object.entries(dataObj || {})) {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                childrenEl.appendChild(_avsMakeFolder(k, v));
            } else {
                childrenEl.appendChild(_avsMakeLeaf(k, v));
            }
        }
        childrenEl.appendChild(_avsMakeAddBar(childrenEl));
    }

    function addVarRow(container, name, val, desc, type) {
        const row = document.createElement('div');
        row.className = 'avs-var-row';
        // 用 column flex，name+value+刪除 一行、desc 一行（折疊式：focus 才高展開）
        row.style.cssText = 'flex-direction:column; align-items:stretch;';
        row.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center; width:100%;">
                <input class="avs-input var-name" placeholder="項目名" style="flex:2;">
                <input class="avs-input var-default" placeholder="預設值" style="flex:1;">
                <select class="avs-select var-type" style="flex:0 0 90px; font-size:12px;">
                    <option value="string">字串</option>
                    <option value="number">數字</option>
                    <option value="list">陣列</option>
                    <option value="enum">枚舉</option>
                    <option value="object">物件（巢狀結構）</option>
                </select>
                <div style="color:#e74c3c; cursor:pointer; flex-shrink:0; padding:0 4px;" onclick="this.closest('.avs-var-row').remove()">✖</div>
            </div>
            <div class="var-obj-gui" style="display:none; margin-top:6px; padding:6px; background:rgba(0,0,0,0.2); border-radius:4px;">
                <div class="avs-obj-children"></div>
            </div>
            <details class="var-obj-adv" style="display:none; margin-top:4px;">
                <summary style="cursor:pointer; color:rgba(26,28,40,0.72); font-size:11px;">▸ 進階：直接編 JSON（老手用，平常不用碰）</summary>
                <textarea class="avs-textarea var-default-obj" placeholder="{}" style="font-size:11px; min-height:80px; font-family:monospace; white-space:pre; line-height:1.4; margin-top:4px;"></textarea>
            </details>
            <textarea class="avs-textarea var-desc" placeholder="📝 說明（AI 跑團看這個約束這個項目，例：好感度 0-100，互動正面 +1~5）" style="font-size:12px; min-height:40px; opacity:0.7;" onfocus="this.style.opacity=1; this.style.minHeight='60px';" onblur="this.style.opacity=0.7;"></textarea>
        `;
        const typeSel  = row.querySelector('.var-type');
        const defInput = row.querySelector('.var-default');
        const objGui   = row.querySelector('.var-obj-gui');
        const objAdv   = row.querySelector('.var-obj-adv');
        const objArea  = row.querySelector('.var-default-obj');
        const objChildren = row.querySelector('.var-obj-gui > .avs-obj-children');

        // 物件型：隱藏單行 input，顯示資料夾樹 GUI + 進階 JSON 摺疊
        const syncTypeUI = () => {
            const isObj = typeSel.value === 'object';
            defInput.style.display = isObj ? 'none' : '';
            objGui.style.display   = isObj ? 'block' : 'none';
            objAdv.style.display   = isObj ? 'block' : 'none';
        };
        typeSel.addEventListener('change', () => {
            syncTypeUI();
            // 切成 object 且 GUI 還空 → 依 textarea 初始化
            if (typeSel.value === 'object' && !objChildren.children.length) {
                let data = {};
                try { data = objArea.value.trim() ? JSON.parse(objArea.value) : {}; } catch(e) {}
                _avsRenderTree(objChildren, data);
                _avsSyncTree(objChildren);
            }
        });
        // 進階 textarea 手動編輯 → blur 重繪 GUI（JSON 壞了不重繪，保留編輯）
        objArea.addEventListener('blur', () => {
            let data;
            try { data = objArea.value.trim() ? JSON.parse(objArea.value) : {}; } catch(e) { return; }
            _avsRenderTree(objChildren, data);
        });

        row.querySelector('.var-name').value = name != null ? String(name) : '';
        row.querySelector('.var-desc').value = desc != null ? String(desc) : '';
        if (type) typeSel.value = type;

        if (typeSel.value === 'object') {
            // 載入既有資料：val 通常是 JSON 字串；舊縮排格式則 fallback 走 parseTree
            let data = {};
            if (val != null && String(val).trim()) {
                try { data = JSON.parse(String(val)); }
                catch(e) {
                    try { data = win._AVS_ENGINE?.parseTree?.(String(val)) || {}; } catch(e2) { data = {}; }
                }
            }
            objArea.value = JSON.stringify(data, null, 2);
            _avsRenderTree(objChildren, data);
        } else {
            defInput.value = val != null ? String(val) : '';
        }
        syncTypeUI();
        container.appendChild(row);
    }

    function openPackEditor(container, pack) {
        activeEditingPack = pack;
        container.querySelector('#avs-pack-list').style.display = 'none';
        container.querySelector('#avs-btn-new-pack').style.display = 'none';
        const editor = container.querySelector('#avs-pack-editor');
        editor.style.display = 'block';
        container.querySelector('#avs-pack-name').value = pack ? pack.name : '';
        // 修 PWA「undefined」bug：notes 沒填時用空字串而不是 undefined → 字串
        container.querySelector('#avs-pack-notes').value = (pack && pack.notes) || '';
        const rows = container.querySelector('#avs-var-rows-container');
        rows.innerHTML = '';
        if (pack) pack.variables.forEach(v => addVarRow(rows, v.name, v.defaultValue, v.desc, v.type));
        else addVarRow(rows, '', '', '', 'string');
    }

    function refreshFurnacePackSelect(container) {
        const select = container.querySelector('#furnace-pack-select');
        select.innerHTML = currentPacks.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }

    // 更新煉丹爐風格建議列表（根據選中的 packId）
    function _refreshFurnacePresets(container, packId) {
        const wrap = container.querySelector('#furnace-presets-wrap');
        const list = container.querySelector('#furnace-presets-list');
        const styleInput = container.querySelector('#furnace-style-prompt');
        if (!wrap || !list) return;

        let presets = [];
        try { presets = JSON.parse(localStorage.getItem('avs_furnace_presets') || '[]'); } catch(e) {}
        const matched = presets.filter(p => p.packId === packId);

        if (matched.length === 0) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'block';
        list.innerHTML = matched.map(p => `
            <div data-preset-id="${p.id}" style="
                display:flex;align-items:flex-start;gap:8px;
                background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.18);
                border-radius:6px;padding:9px 10px;cursor:pointer;
                transition:background 0.15s;" class="furnace-preset-card">
                <div style="flex:1;font-size:12px;color:rgba(255,248,231,0.8);line-height:1.5;">
                    ${p.suggestion}
                </div>
                <button data-del-preset="${p.id}" style="
                    background:none;border:none;color:rgba(26,28,40,0.20);cursor:pointer;
                    font-size:13px;padding:0 2px;flex-shrink:0;"
                    title="刪除建議">✕</button>
            </div>
        `).join('');

        // 點卡片 → 填入風格輸入框
        list.querySelectorAll('.furnace-preset-card').forEach(card => {
            card.onclick = (e) => {
                if (e.target.closest('[data-del-preset]')) return;
                styleInput.value = card.querySelector('div').textContent.trim();
                card.style.border = '1px solid rgba(212,175,55,0.5)';
                card.style.background = 'rgba(212,175,55,0.12)';
                setTimeout(() => {
                    card.style.border = '1px solid rgba(212,175,55,0.18)';
                    card.style.background = 'rgba(212,175,55,0.06)';
                }, 600);
            };
        });

        // 刪除建議
        list.querySelectorAll('[data-del-preset]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.dataset.delPreset;
                let all = [];
                try { all = JSON.parse(localStorage.getItem('avs_furnace_presets') || '[]'); } catch(e) {}
                localStorage.setItem('avs_furnace_presets', JSON.stringify(all.filter(p => p.id !== id)));
                _refreshFurnacePresets(container, packId);
            };
        });
    }

    function bindFurnaceEvents(container) {
        // 選包時更新風格建議列表
        const packSelect = container.querySelector('#furnace-pack-select');
        packSelect.onchange = () => _refreshFurnacePresets(container, packSelect.value);
        // 初始載入
        _refreshFurnacePresets(container, packSelect.value);

        container.querySelector('#furnace-start-btn').onclick = async () => {
            const packId = container.querySelector('#furnace-pack-select').value;
            const pack = currentPacks.find(p => p.id === packId);
            if (!pack) return;
            const log = container.querySelector('#furnace-log-output');
            const stylePromptVal = container.querySelector('#furnace-style-prompt').value.trim();
            if (!stylePromptVal) { log.innerHTML = '⚠️ 請先填寫風格要求'; return; }

            log.innerHTML = '🔥 火力全開，煉製中…';
            const btn = container.querySelector('#furnace-start-btn');
            btn.disabled = true;

            try {
                const flatVars = pack.variables.filter(v => v.type !== 'object');
                const objVars  = pack.variables.filter(v => v.type === 'object');
                // 解析 object 型變數的結構，列出實體屬性給 AI 看
                const objVarDesc = objVars.map(v => {
                    let struct = {};
                    try { struct = win._AVS_ENGINE?.parseTree?.(v.defaultValue) || {}; } catch(e) {}
                    const firstEntity = Object.values(struct)[0];
                    const attrs = (firstEntity && typeof firstEntity === 'object') ? Object.keys(firstEntity) : [];
                    return `  - 「${v.name}」內含多個實體，每個實體屬性：${attrs.join('、') || '（動態）'}`;
                }).join('\n');

                let fullPrompt =
                    `你是一個頂級 UI 設計師。嚴格遵守以下規則，不得輸出任何解釋或說明文字，只輸出指定格式。\n\n` +
                    `輸出格式（不得更改標籤名稱，不得輸出標籤外的任何內容）：\n` +
                    `<ui_template>\n` +
                    `<style>\n/* 所有 CSS，父類必須是 .custom-status-panel */\n</style>\n` +
                    `<!-- HTML 結構 -->\n` +
                    `</ui_template>\n\n` +
                    `風格要求：${stylePromptVal}\n\n` +
                    `【一般變數】用 {{變數名}} 當佔位符：\n` +
                    (flatVars.map(v => `  - {{${v.name}}}`).join('\n') || '  （無）');
                if (objVars.length) {
                    fullPrompt +=
                        `\n\n【物件型變數】內含多個實體（如多個角色），**必須用迴圈渲染，禁止直接寫 {{變數名}}**：\n` +
                        objVarDesc + `\n` +
                        `迴圈語法：{{#each 變數名}} ...單一實體的卡片HTML... {{/each}}\n` +
                        `迴圈內可用：{{@key}} = 實體名（如角色名）；{{@avatar}} = 該角色頭像圖URL（放進 <img src="{{@avatar}}">，沒頭像時會自動帶透明圖、不破版）；{{屬性名}} = 該實體的屬性值\n` +
                        `範例（含頭像）：\n` +
                        `{{#each ${objVars[0].name}}}\n` +
                        `  <div class="char-card"><img class="ava" src="{{@avatar}}"><h4>{{@key}}</h4><span>HP：{{HP}}</span></div>\n` +
                        `{{/each}}\n` +
                        `（建議放一張圓形小頭像，CSS 自行設計；沒頭像的角色不會破版）\n` +
                        `★ 迴圈會對每個實體自動重複，跑團新增的角色也會自動出現，**絕對不要寫死角色名**`;
                }

                // 使用與其他模組一致的 generateText 介面
                const full = await (
                    win.OS_API_ENGINE?.generateText?.('general_assistant', fullPrompt) ||
                    Promise.reject(new Error('API 引擎未就緒'))
                );

                if (!full) throw new Error('AI 回傳空白');

                // 提取 <ui_template> block（AI 可能在前面輸出 COT，用 greedy 找最後一個完整塊）
                const matches = [...full.matchAll(/<ui_template>([\s\S]*?)<\/ui_template>/gi)];
                const raw = matches.length ? matches[matches.length - 1][1] : null;

                // fallback：若沒有 <ui_template> 標籤，嘗試直接抓 HTML 內容
                const htmlFallback = !raw && full.includes('<div') ? full : null;
                const content = raw || htmlFallback;

                if (!content) throw new Error('AI 未輸出 <ui_template> 格式，請重試');

                const styleMatch = content.match(/<style>([\s\S]*?)<\/style>/i);
                await win.OS_DB.saveUITemplate({
                    id: 'tpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                    packId: pack.id,
                    packName: pack.name,
                    stylePrompt: stylePromptVal,
                    cssContent: styleMatch ? styleMatch[1].trim() : '',
                    htmlContent: content.replace(/<style>[\s\S]*?<\/style>/gi, '').trim(),
                    isActive: false,
                    createdAt: Date.now(),
                });

                log.innerHTML = '🎉 煉丹完成！已嵌入到檔案卡片中。';

                // 刷新變數包列表（卡片底部 UI 面板區會自動顯示新煉的）
                win.OS_DB.getAllUITemplates().then(tpls => {
                    currentTemplates = tpls || [];
                    renderPackList(container);
                });
                // 1.5 秒後自動關閉 modal
                setTimeout(() => closeFurnaceModal(container), 1500);
            } catch (e) {
                console.error('[AVS Furnace]', e);
                log.innerHTML = `❌ 炸鍋了：${e.message}`;
            } finally {
                btn.disabled = false;
            }
        };
    }

    function renderStateView(container) {
        const el = container.querySelector('#avs-view-state');
        if (!el) return;

        // 整個「目前狀態」分頁由 os_avs_state.js 統一渲染（亮色系 + 人性化狀態 + 進階摺疊）
        try { win.OS_AVS_STATE?.renderInto?.(el, { packs: currentPacks }); }
        catch (e) { console.warn('[AVS] OS_AVS_STATE.renderInto 失敗', e); el.innerHTML = '<div class="avs-st-err">狀態模組載入失敗，請重載一次。</div>'; }
    }

    // DEPRECATED：原獨立「展廳」tab 的渲染函數，現已內嵌到變數包卡片內。
    // 保留簽名 alias 到 renderPackList，避免內部其他地方還有 ref 時崩潰。
    function renderTemplateList(container) {
        return renderPackList(container);
    }
    // === 以下舊邏輯保留為死代碼（不會被呼叫），下版本清理 ===
    function _DEPRECATED_renderTemplateList_old(container) {
        const list = container.querySelector('#avs-template-list');
        if (!list) return;
        list.innerHTML = '';
        currentTemplates.forEach(tpl => {
            // 🛡️ 只渲染真正屬於 AVS 變數包系統的模板（有 packId）
            // VN 煉丹爐的標籤模板（有 tagId / isBlock / isVNTag）跟外部模板一律跳過
            if (!tpl.packId) return;
            if (tpl.isVNTag || tpl.isBlock || tpl.tagId) return;

            const pack = currentPacks.find(p => p.id === tpl.packId);
            const card = document.createElement('div');
            card.className = 'avs-card';
            card.style.borderColor = tpl.isActive ? 'rgba(26,28,40,0.40)' : 'rgba(26,28,40,0.15)';

            // 用當前狀態（或假值）替換佔位符做預覽
            // 用 OS_AVS_ADAPTER.formatVarValue 共用 formatter（list 顯示用頓號，避免 JSON 醜樣）
            const previewState = win._AVS_ENGINE?.read?.() || {};
            let previewCss  = tpl.cssContent  || '';
            const fmt = win.OS_AVS_ADAPTER?.formatVarValue || (v => String(v ?? ''));
            // 渲染（支援 object 型 {{#each}} 迴圈）
            let previewHtml = _avsRenderTemplate(tpl.htmlContent || '', previewState, pack ? (pack.variables || []) : [], fmt);

            const scopeId = `tpl-preview-${tpl.id}`;
            // 逐條 selector 前綴 #scopeId，避免 CSS nesting 問題
            let scopedCssText = '';
            if (previewCss) {
                scopedCssText = previewCss.replace(/([^{}@][^{}]*)\{/g, (match, selector) => {
                    const scoped = selector.trim().split(',')
                        .map(s => `#${scopeId} ${s.trim()}`).join(', ');
                    return `${scoped} {`;
                });
            }
            const scopedCss = scopedCssText ? `<style>${scopedCssText}</style>` : '';

            card.innerHTML = `
                ${scopedCss}
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <strong style="font-size:13px;color:#d4af37;">${pack ? pack.name : (tpl.packName || '已刪除的檔案')} - 面板</strong>
                    ${tpl.isActive ? '<span style="font-size:10px;color:#1A1C28;border:1px solid rgba(26,28,40,0.20);padding:2px 7px;border-radius:3px;">啟用中</span>' : ''}
                </div>
                <div id="${scopeId}" style="margin-bottom:12px;padding:10px;background:rgba(0,0,0,0.3);border-radius:6px;min-height:60px;overflow:hidden;">
                    ${previewHtml || '<span style="color:rgba(26,28,40,0.20);font-size:12px;">（無預覽內容）</span>'}
                </div>
                <div style="display:flex; gap:10px;">
                    <div class="avs-btn avs-btn-primary btn-toggle" style="flex:1;">${tpl.isActive ? '取消啟用' : '設為啟用'}</div>
                    <div class="avs-btn avs-btn-danger btn-del">✖</div>
                </div>
            `;
            
            card.querySelector('.btn-toggle').onclick = async () => {
                // 如果是啟用操作，確保同一包的舊模板被取消
                if (!tpl.isActive) {
                    const samePackActive = currentTemplates.find(t => t.packId === tpl.packId && t.isActive && t.id !== tpl.id);
                    if (samePackActive) {
                        samePackActive.isActive = false;
                        await win.OS_DB.saveUITemplate(samePackActive);
                    }
                }
                
                tpl.isActive = !tpl.isActive;
                await win.OS_DB.saveUITemplate(tpl);
                currentTemplates = await win.OS_DB.getAllUITemplates();
                
                updateActiveTemplatesCache();
                renderTemplateList(container);
            };

            card.querySelector('.btn-del').onclick = async () => {
                if (confirm('確定要銷毀這個精美的 UI 模板嗎？')) {
                    await win.OS_DB.deleteUITemplate(tpl.id); 
                    currentTemplates = await win.OS_DB.getAllUITemplates();
                    updateActiveTemplatesCache();
                    renderTemplateList(container);
                }
            };
            list.appendChild(card);
        });
    }

    function updateActiveTemplatesCache() {
        const activeTpls = currentTemplates.filter(t => t.isActive);
        localStorage.setItem('avs_active_ui_templates', JSON.stringify(activeTpls));
        console.log('[AVS] 已更新全域活動模板快取。');
    }

    /**
     * 依 packId 自動啟用對應的 UI 模板（供角色卡進入故事時呼叫）
     * 若該包已有 isActive 的模板則不重複操作。
     */
    async function activateTemplateForPack(packId) {
        if (!packId || !win.OS_DB) return;
        try {
            const allTpls = await win.OS_DB.getAllUITemplates?.() || [];
            const packTpls = allTpls.filter(t => t.packId === packId);
            if (!packTpls.length) return;                           // 此包無模板
            if (packTpls.some(t => t.isActive)) return;            // 已有啟用的，不覆蓋

            // 取最新的模板（createdAt 最大）啟用
            packTpls.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            packTpls[0].isActive = true;
            await win.OS_DB.saveUITemplate(packTpls[0]);

            // 更新 localStorage 快取
            const updated = await win.OS_DB.getAllUITemplates?.() || [];
            localStorage.setItem('avs_active_ui_templates', JSON.stringify(updated.filter(t => t.isActive)));
            console.log(`[AVS] 自動啟用展廳面板：packId=${packId}`);
        } catch(e) {
            console.warn('[AVS] activateTemplateForPack 失敗:', e);
        }
    }

    // V3：規則 modal 內 inline onclick 呼叫的 helper
    function _ruleModalContainer() {
        // modal 在 launchApp container 內，但 id 唯一，用 document 抓即可
        return document.querySelector('#avs-rules-modal')?.closest('.avs-container') || document;
    }
    function _editRule(id) { _editingRuleIdInModal = id; renderRulesModalList(_ruleModalContainer()); }
    function _cancelEditRule() { _editingRuleIdInModal = null; renderRulesModalList(_ruleModalContainer()); }
    function _toggleRule(id) {
        win.OS_AVS_RULES?.toggleRule?.(id);
        renderRulesModalList(_ruleModalContainer());
    }
    function _delRule(id) {
        if (!confirm('刪除這條規則？')) return;
        win.OS_AVS_RULES?.deleteRule?.(id);
        if (_editingRuleIdInModal === id) _editingRuleIdInModal = null;
        renderRulesModalList(_ruleModalContainer());
    }
    function _saveEditRule(id) {
        const pack = _currentRulesPack;
        if (!pack) return;
        const card = document.querySelector(`.avs-card[data-rule-edit="${id}"]`);
        if (!card) return;
        const isNew = id === '__new__';
        const name = (card.querySelector('[data-rule-key="name"]')?.value || '').trim();
        const path = (card.querySelector('[data-rule-key="path"]')?.value || '').trim();
        const op = (card.querySelector('[data-rule-key="op"]')?.value || '>=').trim();
        const rawVal = (card.querySelector('[data-rule-key="value"]')?.value || '').trim();
        const content = (card.querySelector('[data-rule-key="content"]')?.value || '').trim();
        if (!path) { alert('請選擇項目'); return; }
        if (!content) { alert('請填注入內容'); return; }
        const n = parseFloat(rawVal);
        const value = (!isNaN(n) && String(n) === rawVal) ? n : rawVal;
        const data = { name: name || path, path, op, value, content, enabled: true, packId: pack.id };
        if (isNew) {
            win.OS_AVS_RULES?.addRule?.(data);
        } else {
            win.OS_AVS_RULES?.updateRule?.(id, data);
        }
        _editingRuleIdInModal = null;
        renderRulesModalList(_ruleModalContainer());
    }

    win.OS_AVS = {
        launch: launchApp,
        renderTemplate: _avsRenderTemplate,   // 共用渲染引擎：給 vn_inspect 資訊中心共用，保證兩邊一致
        buildAvatarMap: _avsBuildAvatarMap,   // 預撈角色頭像(async) 給 {{@avatar}} 用
        syncVarPackToLorebook,   // 對外暴露，方便其他模組或手動觸發
        generateAndSaveSchema: _aiGenerateAndSavePack,   // AVS 狀態面板「開始追蹤狀態」按鈕共用此核心（生成+存+同步）
        // V3：規則 modal helper（給 inline onclick 呼叫）
        _editRule, _cancelEditRule, _toggleRule, _delRule, _saveEditRule,
        activateTemplateForPack,
        /** 還原上一個 AVS 快照（可在 reroll/重試 時外部呼叫） */
        restoreSnapshot: () => win._AVS_ENGINE?.restore?.() ?? null,
        /** 取當前故事的 AVS 狀態 */
        getState: () => win._AVS_ENGINE?.read?.() ?? {},
        /** 以指定 pack 初始化當前故事狀態 */
        initFromPack: (pack) => win._AVS_ENGINE?.initFromPack?.(pack),
    };
})();