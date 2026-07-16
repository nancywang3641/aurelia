// ----------------------------------------------------------------
// [檔案] os_settings_voice.js — 系統設置 🎵 語音清單（2026-07-17 自 os_settings.js 拆出）
// 職責：Minimax 音色檔案卡（makeAliasChip/makeProfileCard＋初始渲染＋新增鈕）；
//       官方音色庫 modal（renderVoiceList＋/v1/get_voice 抓清單＋搜尋過濾＋填入測試/新增檔案）；
//       測試語音播放/停止（mm-test-btn/mm-stop-btn，經 window.parent.OS_MINIMAX 播）。
// 依賴：參數注入 ctx = { container, minimaxConfig }（都是 os_settings.js launchApp 的閉包變數，開面板時組好傳入）；
//       入口＝window.OS_SETTINGS_VOICE.wire(ctx)。不發布任何窗口函式——搬走的符號沒有外部呼叫點；
//       存檔流程（voiceProfiles 收集）在核心直接讀 .mm-profile-card DOM，跟本模組零耦合。
//       mm-speed 語速 slider 同步與 _switchTtsMode 模式切換留在核心（render 後即掛的雜項區，跟 SoVITS 分頁纏著）。
//       載入順序排 os_settings.js 之後（index.js PHONE_FILES）；wire 在 launchApp 執行期才被呼叫。
// ----------------------------------------------------------------
(function () {
    'use strict';

    function wire(ctx) {
        const container = ctx.container;         // 設定面板根 DOM
        const minimaxConfig = ctx.minimaxConfig; // launchApp 的 loadMinimaxConfig() 結果（os_minimax_config）

        const mmProfileList = container.querySelector('#mm-profile-list');
        const mmAddProfileBtn = container.querySelector('#mm-add-profile-btn');

        function makeAliasChip(alias) {
            const chip = document.createElement('span');
            chip.className = 'mm-alias-chip';
            chip.dataset.alias = alias;
            chip.style.cssText = 'display:inline-flex; align-items:center; gap:4px; background:rgba(228,232,245,0.96); border:1px solid rgba(26,28,40,0.20); border-radius:20px; padding:3px 10px; font-size:12px; color:#1A1C28; margin:2px;';
            chip.innerHTML = `${alias} <span style="cursor:pointer; color:rgba(26,28,40,0.72); font-size:14px; line-height:1;" title="移除">×</span>`;
            chip.querySelector('span').onclick = () => chip.remove();
            return chip;
        }

        function makeProfileCard(profile = {}, expanded = false) {
            const card = document.createElement('div');
            card.className = 'mm-profile-card';
            card.style.cssText = 'background:rgba(228,232,245,0.60); border:1px solid rgba(26,28,40,0.15); border-radius:8px; overflow:hidden;';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex; align-items:center; gap:8px; padding:10px 14px; cursor:pointer; user-select:none;';
            header.innerHTML = `
                <span class="mm-p-arrow" style="color:rgba(26,28,40,0.72); font-size:12px; transition:transform 0.2s; flex-shrink:0;">${expanded ? '▼' : '▶'}</span>
                <span class="mm-p-name-display" style="flex:1; font-weight:600; color:#1A1C28; font-size:14px;">${profile.label || '（未命名）'}</span>
                <span style="flex-shrink:0; cursor:pointer; color:#fc8181; font-size:18px; padding:2px 4px;" title="刪除此音色">🗑</span>
            `;
            header.querySelector('span[title]').onclick = (e) => { e.stopPropagation(); card.remove(); };
            card.appendChild(header);

            const body = document.createElement('div');
            body.style.cssText = `padding:0 14px 14px; display:flex; flex-direction:column; gap:10px; ${expanded ? '' : 'display:none;'}`;
            body.style.display = expanded ? 'flex' : 'none';

            const nameRow = document.createElement('div');
            nameRow.innerHTML = `<div class="set-label" style="font-size:12px; margin-bottom:4px;">角色名稱</div>
                <input class="set-input mm-p-label" type="text" placeholder="如：愛麗絲" value="${profile.label || ''}" style="font-weight:600; color:#1A1C28;">`;
            const labelInput = nameRow.querySelector('.mm-p-label');
            const nameDisplay = header.querySelector('.mm-p-name-display');
            labelInput.addEventListener('input', () => {
                nameDisplay.textContent = labelInput.value.trim() || '（未命名）';
            });
            body.appendChild(nameRow);

            const idRow = document.createElement('div');
            idRow.innerHTML = `<div class="set-label" style="font-size:12px; margin-bottom:4px;">Minimax 音色ID</div>
                <input class="set-input mm-p-id" type="text" placeholder="例如：female-shaonv" value="${profile.id || ''}">`;
            body.appendChild(idRow);

            const aliasSection = document.createElement('div');
            aliasSection.innerHTML = `<div class="set-label" style="font-size:12px; margin-bottom:6px;">別名 <span style="color:rgba(26,28,40,0.72); font-weight:normal;">（大小寫不敏感）</span></div>`;
            const chipContainer = document.createElement('div');
            chipContainer.style.cssText = 'display:flex; flex-wrap:wrap; gap:2px; min-height:28px; background:rgba(228,232,245,0.90); border:1px solid rgba(26,28,40,0.10); border-radius:4px; padding:6px; margin-bottom:6px;';
            (profile.aliases || []).forEach(a => chipContainer.appendChild(makeAliasChip(a)));

            const aliasAddRow = document.createElement('div');
            aliasAddRow.style.cssText = 'display:flex; gap:6px;';
            aliasAddRow.innerHTML = `
                <input class="set-input mm-p-alias-input" type="text" placeholder="輸入別名後按 Enter 或 ＋" style="flex:1; font-size:13px;">
                <div class="btn-fetch mm-p-alias-add" title="新增別名" style="font-size:18px; flex-shrink:0;">＋</div>
            `;
            const aliasInput = aliasAddRow.querySelector('.mm-p-alias-input');
            const aliasAdd   = aliasAddRow.querySelector('.mm-p-alias-add');
            function addAlias() {
                const v = aliasInput.value.trim();
                if (!v) return;
                chipContainer.appendChild(makeAliasChip(v));
                aliasInput.value = '';
            }
            aliasAdd.onclick = addAlias;
            aliasInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } });

            aliasSection.appendChild(chipContainer);
            aliasSection.appendChild(aliasAddRow);
            body.appendChild(aliasSection);
            card.appendChild(body);

            header.onclick = (e) => {
                if (e.target.title === '刪除此音色') return;
                const isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : 'flex';
                header.querySelector('.mm-p-arrow').textContent = isOpen ? '▶' : '▼';
            };

            return card;
        }

        if (mmProfileList) {
            (minimaxConfig.voiceProfiles || []).forEach(p => {
                mmProfileList.appendChild(makeProfileCard(p, false));
            });
        }

        if (mmAddProfileBtn && mmProfileList) {
            mmAddProfileBtn.onclick = () => {
                const card = makeProfileCard({}, true);
                mmProfileList.appendChild(card);
                card.querySelector('.mm-p-label')?.focus();
            };
        }

        const mmBrowseBtn  = container.querySelector('#mm-browse-voices-btn');
        const mmVoiceModal = container.querySelector('#mm-voice-modal');
        const mmVoiceList  = container.querySelector('#mm-voice-list');
        const mmVoiceSearch= container.querySelector('#mm-voice-search');
        const mmVoiceCount = container.querySelector('#mm-voice-count');
        let _fetchedVoices = [];

        function renderVoiceList(voices) {
            if (!mmVoiceList) return;
            mmVoiceList.innerHTML = '';
            voices.forEach(v => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; align-items:flex-start; gap:8px; background:rgba(228,232,245,0.90); border:1px solid rgba(26,28,40,0.10); border-radius:4px; padding:10px 12px; cursor:default;';
                const desc = Array.isArray(v.description) ? v.description[0] : (v.description || '');
                row.innerHTML = `
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:13px; color:#1A1C28;">${desc || v.voice_id}</div>
                        <div style="font-size:10px; color:rgba(26,28,40,0.72); font-family:monospace; margin-top:3px; word-break:break-all;">${v.voice_id}</div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px; flex-shrink:0;">
                        <button class="mm-v-use"   style="font-size:11px; background:rgba(228,232,245,0.80); border:1px solid rgba(26,28,40,0.15); color:#1A1C28; border-radius:4px; padding:4px 8px; cursor:pointer; white-space:nowrap;">填入測試</button>
                        <button class="mm-v-add"   style="font-size:11px; background:rgba(26,28,40,0.08); border:1px solid rgba(26,28,40,0.25); color:#1A1C28; border-radius:4px; padding:4px 8px; cursor:pointer; white-space:nowrap;">新增檔案</button>
                    </div>`;
                row.querySelector('.mm-v-use').onclick = () => {
                    const el = container.querySelector('#mm-test-voice-id');
                    if (el) { el.value = v.voice_id; el.dispatchEvent(new Event('input')); }
                    mmVoiceModal.style.display = 'none';
                };
                row.querySelector('.mm-v-add').onclick = () => {
                    const card = makeProfileCard({ id: v.voice_id, label: '' }, true);
                    mmProfileList.appendChild(card);
                    card.querySelector('.mm-p-label')?.focus();
                    mmVoiceModal.style.display = 'none';
                };
                mmVoiceList.appendChild(row);
            });
        }

        if (mmBrowseBtn && mmVoiceModal) {
            mmBrowseBtn.onclick = async () => {
                const groupId = (container.querySelector('#mm-group-id')?.value || '').trim();
                const apiKey  = (container.querySelector('#mm-api-key')?.value  || '').trim();
                const provider = container.querySelector('#mm-provider')?.value || 'cn';
                if (!groupId || !apiKey) {
                    alert('請先填寫 Group ID 與 API Key');
                    return;
                }
                mmVoiceModal.style.display = 'flex';
                mmVoiceList.innerHTML = '<div style="text-align:center; color:rgba(26,28,40,0.72); padding:20px;">⏳ 載入中...</div>';
                mmVoiceSearch.value = '';
                if (mmVoiceCount) mmVoiceCount.textContent = '';

                const baseUrl = provider === 'io' ? 'https://api.minimax.io' : 'https://api.minimaxi.com';
                try {
                    const res = await fetch(`${baseUrl}/v1/get_voice`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ voice_type: 'system' })
                    });
                    const data = await res.json();
                    if (!res.ok || data.base_resp?.status_code !== 0) {
                        throw new Error(data.base_resp?.status_msg || res.statusText);
                    }
                    _fetchedVoices = data.system_voice || [];
                    if (mmVoiceCount) mmVoiceCount.textContent = `（共 ${_fetchedVoices.length} 個）`;
                    renderVoiceList(_fetchedVoices);
                } catch(err) {
                    mmVoiceList.innerHTML = `<div style="color:#fc8181; padding:10px;">❌ 載入失敗：${err.message}</div>`;
                }
            };

            mmVoiceSearch?.addEventListener('input', () => {
                const q = mmVoiceSearch.value.toLowerCase();
                const filtered = _fetchedVoices.filter(v => {
                    const desc = Array.isArray(v.description) ? v.description.join(' ') : (v.description || '');
                    return v.voice_id.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
                });
                renderVoiceList(filtered);
            });

            container.querySelector('#mm-voice-modal-close')?.addEventListener('click', () => {
                mmVoiceModal.style.display = 'none';
            });
            mmVoiceModal.addEventListener('click', (e) => {
                if (e.target === mmVoiceModal) mmVoiceModal.style.display = 'none';
            });
        }

        const mmTestBtn  = container.querySelector('#mm-test-btn');
        const mmStopBtn  = container.querySelector('#mm-stop-btn');
        const mmResult   = container.querySelector('#mm-test-result');
        if (mmTestBtn) {
            mmTestBtn.onclick = async () => {
                const voiceId = (container.querySelector('#mm-test-voice-id')?.value || '').trim();
                const text    = (container.querySelector('#mm-test-text')?.value || '').trim();
                const groupId = (container.querySelector('#mm-group-id')?.value || '').trim();
                const apiKey  = (container.querySelector('#mm-api-key')?.value || '').trim();
                const provider = container.querySelector('#mm-provider')?.value || 'cn';
                const model   = container.querySelector('#mm-speech-model')?.value || 'speech-01-turbo';

                if (!groupId || !apiKey) {
                    mmResult.style.display = 'block';
                    mmResult.style.color = '#fc8181';
                    mmResult.textContent = '❌ 請先填寫 Group ID 與 API Key';
                    return;
                }
                if (!voiceId) {
                    mmResult.style.display = 'block';
                    mmResult.style.color = '#fc8181';
                    mmResult.textContent = '❌ 請輸入語音 ID（如 male-01）';
                    return;
                }

                mmTestBtn.style.opacity = '0.5';
                mmTestBtn.textContent = '⏳ 合成中...';
                mmResult.style.display = 'block';
                mmResult.style.color = 'rgba(26,28,40,0.40)';
                mmResult.textContent = '⏳ 正在呼叫 Minimax TTS API...';

                const win = window.parent || window;
                if (win.OS_MINIMAX) {
                    const existingCfg = win.OS_MINIMAX.getConfig ? win.OS_MINIMAX.getConfig() : {};
                    win.OS_MINIMAX.saveConfig({ ...existingCfg, groupId, apiKey, provider, speechModel: model });
                    const ok = await win.OS_MINIMAX.play(text, voiceId);
                    if (ok) {
                        mmResult.style.color = 'rgba(26,28,40,0.25)';
                        mmResult.textContent = '✅ 語音播放中...';
                        if (mmStopBtn) mmStopBtn.style.display = 'block';
                    } else {
                        mmResult.style.color = '#fc8181';
                        mmResult.textContent = '❌ 播放失敗，請檢查 Group ID / API Key / 語音 ID 是否正確';
                    }
                } else {
                    mmResult.style.color = '#fc8181';
                    mmResult.textContent = '❌ OS_MINIMAX 模組尚未載入，請確認 os_minimax.js 已加入載入列表';
                }
                mmTestBtn.style.opacity = '1';
                mmTestBtn.textContent = '🎵 播放測試語音';
            };
        }
        if (mmStopBtn) {
            mmStopBtn.onclick = () => {
                const win = window.parent || window;
                if (win.OS_MINIMAX) win.OS_MINIMAX.stop();
                mmStopBtn.style.display = 'none';
                if (mmResult) { mmResult.style.color = 'rgba(26,28,40,0.40)'; mmResult.textContent = '已停止播放'; }
            };
        }
    }

    window.OS_SETTINGS_VOICE = { wire: wire };
})();
