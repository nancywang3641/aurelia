// ----------------------------------------------------------------
// [檔案] os_settings_claude.js — 系統設置 🦀 Claude 的房間（2026-07-17 自 os_settings.js 拆出）
// 職責：Claude 的房間綁定（Temperature/Top-P slider 同步＋測試當前預設連線，Anthropic 直連/cc-bridge 兩式）；
//       Claude Presets 渲染清單＋CRUD（新增/刪除/改欄位/radio 切 active，經 hidden field 與核心存檔交接）。
// 依賴：參數注入 ctx = { container }（os_settings.js launchApp 的閉包變數，開面板時組好傳入）；
//       入口＝window.OS_SETTINGS_CLAUDE.wire(ctx)。另發布 window._claudeNormalizeChatUrl 給核心存檔
//       normalize preset URL（_normalizeChatUrl 原是 launchApp 閉包函式）。
//       設定資料本體（loadClaudeRoomConfig/saveClaudeRoomConfig/getActivePreset、localStorage 鍵
//       os_claude_room_config）留在 os_settings.js 核心——OS_SETTINGS 對外 API 與底部存檔都在用。
//       載入順序排 os_settings.js 之後（index.js PHONE_FILES）；wire 在 launchApp 執行期才被呼叫。
// ----------------------------------------------------------------
(function () {
    'use strict';

    function wire(ctx) {
        const container = ctx.container;   // 設定面板根 DOM

        // === Claude 的房間（獨立 Claude 接口）binding：slider 同步 + 測試連線 ===
        const elClaudeRoomTemp = container.querySelector('#claude-room-temperature');
        const elClaudeRoomTopP = container.querySelector('#claude-room-top-p');
        const elClaudeRoomValTemp = container.querySelector('#claude-room-val-temp');
        const elClaudeRoomValTopP = container.querySelector('#claude-room-val-topp');
        if (elClaudeRoomTemp && elClaudeRoomValTemp) {
            elClaudeRoomTemp.oninput = () => { elClaudeRoomValTemp.textContent = elClaudeRoomTemp.value; };
        }
        if (elClaudeRoomTopP && elClaudeRoomValTopP) {
            elClaudeRoomTopP.oninput = () => { elClaudeRoomValTopP.textContent = elClaudeRoomTopP.value; };
        }

        const claudeRoomTestBtn = container.querySelector('#claude-room-test-btn');
        const claudeRoomTestResult = container.querySelector('#claude-room-test-result');
        // URL 兼容處理：用戶可填 base URL / /v1 / 完整 URL，自動補成 /v1/chat/completions
        function _normalizeChatUrl(raw) {
            let u = (raw || '').trim().replace(/\/+$/, '');
            if (!u) return '';
            // Anthropic 直連格式：保留 /v1/messages 不變
            if (/api\.anthropic\.com/i.test(u) || u.endsWith('/v1/messages')) {
                if (u.endsWith('/v1/messages')) return u;
                if (u.endsWith('/v1')) return u + '/messages';
                if (/api\.anthropic\.com$/i.test(u)) return u + '/v1/messages';
                return u;
            }
            // OpenAI / cc-bridge 兼容：補 /v1/chat/completions
            if (u.endsWith('/chat/completions')) return u;
            if (u.endsWith('/v1')) return u + '/chat/completions';
            return u + '/v1/chat/completions';
        }

        // 判斷 URL 是不是 Anthropic 直連
        function _isAnthropicDirectUrl(u) {
            if (!u) return false;
            return /api\.anthropic\.com/i.test(u) || u.endsWith('/v1/messages');
        }

        // ===== Claude Presets：渲染清單 + CRUD =====
        const presetsListEl = container.querySelector('#claude-presets-list');
        const presetsHiddenEl = container.querySelector('#claude-presets-json');
        const activePresetIdEl = container.querySelector('#claude-active-preset-id');
        let _presets = [];
        let _activeId = '';
        try { _presets = JSON.parse(presetsHiddenEl?.value || '[]') || []; } catch(e) {}
        _activeId = activePresetIdEl?.value || (_presets[0]?.id || '');

        function _persistPresets() {
            if (presetsHiddenEl) presetsHiddenEl.value = JSON.stringify(_presets);
            if (activePresetIdEl) activePresetIdEl.value = _activeId;
        }

        function _renderPresets() {
            if (!presetsListEl) return;
            presetsListEl.innerHTML = '';
            _presets.forEach((p, idx) => {
                const card = document.createElement('div');
                card.style.cssText = 'background:rgba(228,232,245,0.4); border:1px solid rgba(26,28,40,0.10); border-radius:6px; padding:10px; margin-bottom:8px;';
                card.innerHTML = `
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:bold; color:#1A1C28;">
                        <input type="radio" name="claude-active-preset" value="${p.id}" ${p.id === _activeId ? 'checked' : ''}>
                        <input class="set-input" data-field="name" placeholder="預設名稱" value="${(p.name || '').replace(/"/g,'&quot;')}" style="flex:1; min-width:0;">
                        <button class="claude-preset-del" title="刪除預設" style="background:rgba(217,81,34,0.2); color:#D95122; border:1px solid rgba(217,81,34,0.4); border-radius:4px; padding:2px 8px; cursor:pointer;">✕</button>
                    </label>
                    <div style="margin-top:8px;">
                        <input class="set-input" data-field="url" placeholder="https://api.anthropic.com/v1/messages 或 cc-bridge URL" value="${(p.url || '').replace(/"/g,'&quot;')}">
                    </div>
                    <div style="margin-top:6px;">
                        <input class="set-input" data-field="key" type="password" placeholder="API Key（sk-ant-... 或 cc_bridge_token）" value="${(p.key || '').replace(/"/g,'&quot;')}">
                    </div>
                `;
                // radio
                card.querySelector('input[type="radio"]').onchange = (e) => {
                    if (e.target.checked) { _activeId = p.id; _persistPresets(); }
                };
                // 三個欄位 input 監聽（即時更新 _presets）
                card.querySelectorAll('input[data-field]').forEach(inp => {
                    inp.oninput = () => {
                        _presets[idx][inp.dataset.field] = inp.value;
                        _persistPresets();
                    };
                });
                // 刪除
                card.querySelector('.claude-preset-del').onclick = () => {
                    if (_presets.length <= 1) { alert('至少要留一組預設'); return; }
                    if (!confirm(`刪除預設「${p.name || p.id}」？`)) return;
                    _presets.splice(idx, 1);
                    if (_activeId === p.id) _activeId = _presets[0].id;
                    _persistPresets();
                    _renderPresets();
                };
                presetsListEl.appendChild(card);
            });
        }

        _renderPresets();

        const presetAddBtn = container.querySelector('#claude-preset-add-btn');
        if (presetAddBtn) {
            presetAddBtn.onclick = () => {
                const id = 'p' + Date.now().toString(36);
                _presets.push({ id, name: '新預設', url: 'https://api.anthropic.com/v1/messages', key: '' });
                _activeId = id;
                _persistPresets();
                _renderPresets();
            };
        }

        if (claudeRoomTestBtn && claudeRoomTestResult) {
            claudeRoomTestBtn.onclick = async () => {
                const active = _presets.find(p => p.id === _activeId) || _presets[0];
                if (!active) {
                    claudeRoomTestResult.style.display = 'block';
                    claudeRoomTestResult.textContent = '❌ 沒有任何預設，請先新增';
                    return;
                }
                const url = _normalizeChatUrl(active.url);
                const key = (active.key || '').trim();
                const model = container.querySelector('#claude-room-model').value.trim() || 'claude-opus-4-7';
                if (!url || !key) {
                    claudeRoomTestResult.style.display = 'block';
                    claudeRoomTestResult.textContent = `❌ 「${active.name || active.id}」沒填完整 URL+密鑰`;
                    return;
                }
                const isAnthropic = _isAnthropicDirectUrl(url);
                claudeRoomTestBtn.textContent = '⏳ 測試中（首次可能 10-30 秒）…';
                claudeRoomTestResult.style.display = 'block';
                claudeRoomTestResult.textContent = `⏳ 打 ${url}\n（${isAnthropic ? 'Anthropic 直連' : 'cc-bridge / OpenAI 兼容'}）…`;
                try {
                    let resp, data;
                    if (isAnthropic) {
                        resp = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-api-key': key,
                                'anthropic-version': '2023-06-01',
                                'anthropic-dangerous-direct-browser-access': 'true',
                            },
                            body: JSON.stringify({
                                model,
                                max_tokens: 100,
                                messages: [{ role: 'user', content: '用一句繁中說「Claude 的房間連線測試成功」' }],
                            }),
                        });
                        data = await resp.json();
                        if (resp.ok && data.content) {
                            const txt = (data.content.find(b => b.type === 'text') || {}).text || '';
                            claudeRoomTestResult.textContent = `✅ 連線成功\n\n回覆：${txt}`;
                        } else {
                            claudeRoomTestResult.textContent = `❌ ${(data.error && data.error.message) || '未知錯誤'}\nstatus: ${resp.status}`;
                        }
                    } else {
                        resp = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${key}`,
                            },
                            body: JSON.stringify({
                                model,
                                messages: [{ role: 'user', content: '用一句繁中說「Claude 的房間連線測試成功」' }],
                                stream: false,
                                max_tokens: 100,
                            }),
                        });
                        data = await resp.json();
                        if (resp.ok && data.choices && data.choices[0]) {
                            claudeRoomTestResult.textContent = `✅ 連線成功\n\n回覆：${data.choices[0].message.content}`;
                        } else {
                            claudeRoomTestResult.textContent = `❌ ${(data.error && data.error.message) || '未知錯誤'}\nstatus: ${resp.status}`;
                        }
                    }
                } catch (e) {
                    claudeRoomTestResult.textContent = `❌ 網路錯誤：${e.message}`;
                } finally {
                    claudeRoomTestBtn.textContent = '🔍 測試當前預設的連線';
                }
            };
        }

        // 給核心存檔 normalize preset URL：_normalizeChatUrl 原是 launchApp 閉包函式，拆檔後核心經這個窗口拿
        window._claudeNormalizeChatUrl = _normalizeChatUrl;
    }

    window.OS_SETTINGS_CLAUDE = { wire: wire };
})();
