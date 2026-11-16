// ----------------------------------------------------------------
// [檔案] os_settings_page.js — 系統設置整頁的畫面（HTML 範本）（2026-11-17 自 os_settings.js 拆出）
// 職責：只組出設置頁整頁的 HTML 字串，不綁任何事件；綁事件、讀值、存檔照舊在 os_settings.js 的 launchApp。
// 依賴：參數注入 ctx＝launchApp 的閉包變數（跟 os_settings_comfyui.js 同一套）。
//       🚨 範本裡要多用一個 launchApp 的變數，就要在 launchApp 呼叫 html(...) 那行的 ctx 也多傳一個，
//          否則開設置頁會直接報「xxx is not defined」。
//       入口＝window.OS_SETTINGS_PAGE.html(ctx)；載入順序排 os_settings.js 之後（index.js PHONE_FILES），開頁時才呼叫。
// ----------------------------------------------------------------
(function () {
    'use strict';

    function html(ctx) {
        const { llmConfig, secLlmConfig, imgConfig, minimaxConfig, vnD, voiceCast, elConfig, elModels, tavernExt, isStandalone, stHide, pwaOnly, primaryProfileOpts, secondaryProfileOpts, _vcEsc, _charModelName, _isGptChar, _capiEsc, _imgNodeOptionsHTML, _nodeVal } = ctx;
        return `
            <div class="set-container">
                <div class="set-header sysh">
                    <div class="set-back-btn sysh-back" id="nav-home">‹</div>
                    <div class="set-title sysh-title">系統設置</div>
                    <div style="width:32px"></div>
                </div>
                
                <div class="set-tabs">
                    <div class="set-tab active" data-tab="api">API</div>
                    <div class="set-tab" data-tab="img">圖片</div>
                    <div class="set-tab" data-tab="voice">語音</div>
                    <div class="set-tab" data-tab="vn">一般</div>
                    <!-- ⛔ 「記憶向量」分頁已移除：它跟 📝 記憶（變數工坊→記憶）是同一個系統、同一份 os_vector_config，
                         但欄位少了本地模型/記憶來源/主模型只注入近期那幾個，而它存檔是整份覆蓋 →
                         每按一次「保存所有設定」就把那幾個設定清掉（本地模型的勾會自己不見就是這個）。 -->
                    <div class="set-tab" data-tab="sys">系統/備份</div>
                </div>

                <div class="set-content">

                    <div id="view-api" class="tab-view active">
                        <div class="api-subtab-row">
                            <div class="api-subtab active" data-apitab="llm" onclick="window._switchApiTab && window._switchApiTab('llm')">主模型</div>
                            <div class="api-subtab" data-apitab="sec-llm" onclick="window._switchApiTab && window._switchApiTab('sec-llm')">副模型</div>
                            <div class="api-subtab" data-apitab="chan" onclick="window._switchApiTab && window._switchApiTab('chan')">通道</div>
                            <div class="api-subtab" data-apitab="jev" onclick="window._switchApiTab && window._switchApiTab('jev')">決策模型</div>
                        </div>
                    <div id="view-llm" class="api-subview">
                        <div class="set-group"${stHide}>
                            <div class="set-label">
                                <span><i class="fa-solid fa-link"></i> 用酒館的連線${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1249') : ''}</span>
                                <label class="toggle-switch"><input type="checkbox" id="os-system-api" ${llmConfig.useSystemApi ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div id="st-profile-group" class="${llmConfig.useSystemApi ? '' : 'hidden'}" style="margin-top:10px; border-top:1px solid rgba(var(--os-ink-rgb), 0.10); padding-top:10px;">
                                <div class="set-label">選擇連接預設</div>
                                <select class="set-select" id="os-st-profile">${primaryProfileOpts}</select>
                                <div id="st-profile-info" style="margin-top:6px; font-size:11px; color:rgba(var(--os-ink-rgb), 0.72); word-break:break-all; line-height:1.6;"></div>
                            </div>
                        </div>

                        <div class="set-group" id="manual-api-group">
                            <div><div class="set-label">手動 API 地址</div><input class="set-input" id="os-api-url" placeholder="http://..." value="${_capiEsc(llmConfig.url)}"></div>
                            <div style="margin-top:10px;"><div class="set-label">API Key</div><input class="set-input" id="os-api-key" type="password" value="${_capiEsc(llmConfig.key)}"></div>
                        </div>

                        <!-- 請求格式：OpenAI 相容（多數站）／Gemini 原生（打 /v1beta/models/…:generateContent，附安全過濾全關；接 Gemini CLI 的公益站要用這個） -->
                        <div class="set-group" id="api-format-group">
                            <div class="set-label">請求格式${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1269') : ''}</div>
                            <select class="set-select" id="os-api-format">
                                <option value="openai" ${(llmConfig.apiFormat || 'openai') === 'openai' ? 'selected' : ''}>OpenAI 相容（多數站）</option>
                                <option value="gemini" ${llmConfig.apiFormat === 'gemini' ? 'selected' : ''}>Gemini 原生／Vertex</option>
                                <option value="anthropic" ${llmConfig.apiFormat === 'anthropic' ? 'selected' : ''}>Claude 原生（有緩存）</option>
                            </select>
                        </div>

                        <!-- 主模型的自訂前置指令：以前藏在「用酒館的連線」那格底下，PWA 沒有酒館整格不顯示、直連也沒吃到；
                             現在跟副模型一樣自己一格，酒館連線時每個連接預設各記各的，自己填網址時只有一份。 -->
                        <div class="set-group">
                            <details>
                                <summary style="cursor:pointer; user-select:none; font-size:13px; color:var(--os-ink);" title="以 system 角色插在主模型所有訊息最前面；直連、托管、酒館連線都生效。用酒館連線時每個連接預設各記各的。"><i class="fa-solid fa-pen-to-square"></i> 自訂前置指令${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1278') : ''}</summary>
                                <textarea class="set-input" id="os-custom-cot" rows="7" placeholder="貼上要放在主模型訊息最前面的 system 指令" style="margin-top:8px; width:100%; resize:vertical; line-height:1.5; min-height:120px;">${(llmConfig.customCot || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
                            </details>
                        </div>

                        <div class="set-group">
                            <div class="set-label">選擇模型</div>
                            <div id="model-system-notice" class="${llmConfig.useSystemApi ? '' : 'hidden'}" style="background:rgba(var(--os-ink-rgb), 0.06); padding:10px; border-radius:4px; font-size:12px; color:var(--os-ink); border:1px solid rgba(var(--os-ink-rgb), 0.15);">
                                <i class="fa-solid fa-link"></i> 模型由酒館決定，在酒館切換即可。
                            </div>
                            <div class="model-row ${llmConfig.useSystemApi ? 'hidden' : ''}" id="model-row">
                                <select class="set-select" id="os-api-model"><option value="${_capiEsc(llmConfig.model)}">${_capiEsc(llmConfig.model)} (當前)</option></select>
                                <div class="btn-fetch" id="os-fetch-btn" title="${isStandalone ? '拉取模型清單' : '從酒館同步'}">${isStandalone ? '<i class="fa-solid fa-microchip"></i>' : '<i class="fa-solid fa-rotate"></i>'}</div>
                            </div>
                        </div>

                        <div class="set-group"${stHide}>
                            <div class="set-label" title="把指定 Preset 的自訂條目當系統提示詞注入（排除佔位符）。需安裝 TavernHelper 插件。">
                                <span><i class="fa-solid fa-clipboard"></i> 注入 Preset 自訂條目${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1298') : ''}</span>
                                <label class="toggle-switch"><input type="checkbox" id="os-use-preset-prompts" ${llmConfig.usePresetPrompts ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div id="os-preset-name-group" style="margin-top:10px; display:${llmConfig.usePresetPrompts ? 'flex' : 'none'}; gap:8px; align-items:center;">
                                <select class="set-select" id="os-preset-name" style="flex:1;">
                                    <option value="">（使用當前 in_use Preset）</option>
                                </select>
                                <div class="btn-fetch" id="os-preset-refresh-btn" title="重新整理 Preset 列表" style="flex-shrink:0;"><i class="fa-solid fa-rotate"></i></div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-slider-container">
                                <div class="set-label"><span>Max Tokens</span></div>
                                <input type="number" min="100" max="200000" step="100" value="${_capiEsc(llmConfig.maxTokens)}" class="set-input" id="os-max-tokens" style="margin-top:6px; width:100%;">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Temperature</span><span class="set-slider-val" id="val-temp">${llmConfig.temperature}</span></div>
                                <input type="range" min="0" max="2" step="0.05" value="${_capiEsc(llmConfig.temperature)}" class="set-slider" id="os-temperature">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Top P</span><span class="set-slider-val" id="val-topp">${llmConfig.top_p ?? 1.0}</span></div>
                                <input type="range" min="0" max="1" step="0.01" value="${_capiEsc(llmConfig.top_p ?? 1.0)}" class="set-slider" id="os-top-p">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Frequency Penalty</span><span class="set-slider-val" id="val-freq">${llmConfig.frequency_penalty ?? 0}</span></div>
                                <input type="range" min="-2" max="2" step="0.01" value="${_capiEsc(llmConfig.frequency_penalty ?? 0)}" class="set-slider" id="os-freq-penalty">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Presence Penalty</span><span class="set-slider-val" id="val-pres">${llmConfig.presence_penalty ?? 0}</span></div>
                                <input type="range" min="-2" max="2" step="0.01" value="${_capiEsc(llmConfig.presence_penalty ?? 0)}" class="set-slider" id="os-pres-penalty">
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label" title="讓模型回傳思考過程。需模型支援（Gemini 2.5 / Claude 3.5+）；開啟後 Temperature 自動設為 1。">
                                <span><i class="fa-solid fa-comment-dots"></i> 請求模型思維鏈</span>
                                <label class="toggle-switch"><input type="checkbox" id="os-enable-thinking" ${llmConfig.enableThinking ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div style="margin-top:10px;" id="thinking-budget-group" class="${llmConfig.enableThinking ? '' : 'hidden'}">
                                <div class="set-label"><span>思考預算</span><span class="set-slider-val" id="val-think-budget">${llmConfig.thinkingBudget || 8000}</span></div>
                                <input type="range" min="1000" max="32000" step="1000" value="${_capiEsc(llmConfig.thinkingBudget || 8000)}" class="set-slider" id="os-thinking-budget">
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label"><i class="fa-solid fa-plug"></i> 測試 API 連線</div>
                            <div class="btn-test" id="os-test-btn">發送測試訊息</div>
                            <div id="os-test-result" style="display:none; margin-top:10px; background:rgba(var(--os-tint-rgb), 0.90); border-radius:4px; padding:12px; font-size:12px; color:var(--os-ink-soft); font-family:monospace; white-space:pre-wrap; word-break:break-all; max-height:120px; overflow-y:auto;"></div>
                        </div>
                    </div>

                    <div id="view-sec-llm" class="api-subview" style="display:none;">
                        <div class="set-group"${stHide}>
                            <div class="set-label">
                                <span><i class="fa-solid fa-link"></i> 用酒館的連線${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1354') : ''}</span>
                                <label class="toggle-switch"><input type="checkbox" id="sec-system-api" ${secLlmConfig.useSystemApi ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div id="sec-st-profile-group" class="${secLlmConfig.useSystemApi ? '' : 'hidden'}" style="margin-top:10px; border-top:1px solid rgba(var(--os-ink-rgb), 0.10); padding-top:10px;">
                                <div class="set-label">選擇連接預設</div>
                                <select class="set-select" id="sec-st-profile">${secondaryProfileOpts}</select>
                                <div id="sec-st-profile-info" style="margin-top:6px; font-size:11px; color:rgba(var(--os-ink-rgb), 0.72); word-break:break-all; line-height:1.6;"></div>
                            </div>
                        </div>

                        <div class="set-group" id="sec-sync-primary-group" style="${secLlmConfig.useSystemApi ? 'display:none;' : ''}">
                             <div class="set-label" title="自動共用主模型的 API 地址與密鑰，模型仍可獨立選擇。">
                                <span><i class="fa-solid fa-link"></i> 同步主模型 URL 與 Key${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1367') : ''}</span>
                                <label class="toggle-switch"><input type="checkbox" id="sec-sync-primary" ${secLlmConfig.syncWithPrimary ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                        </div>

                        <div class="set-group" id="sec-manual-api-group" style="${(secLlmConfig.useSystemApi || secLlmConfig.syncWithPrimary) ? 'display:none;' : 'display:flex;'}">
                            <div><div class="set-label">手動 API 地址</div><input class="set-input" id="sec-api-url" placeholder="http://..." value="${_capiEsc(secLlmConfig.url)}"></div>
                            <div style="margin-top:10px;"><div class="set-label">API Key</div><input class="set-input" id="sec-api-key" type="password" value="${_capiEsc(secLlmConfig.key)}"></div>
                        </div>

                        <div class="set-group" id="sec-api-format-group" style="${(secLlmConfig.useSystemApi || secLlmConfig.syncWithPrimary) ? 'display:none;' : ''}">
                            <div class="set-label">請求格式${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1381') : ''}</div>
                            <select class="set-select" id="sec-api-format">
                                <option value="openai" ${(secLlmConfig.apiFormat || 'openai') === 'openai' ? 'selected' : ''}>OpenAI 相容（多數站）</option>
                                <option value="gemini" ${secLlmConfig.apiFormat === 'gemini' ? 'selected' : ''}>Gemini 原生／Vertex</option>
                                <option value="anthropic" ${secLlmConfig.apiFormat === 'anthropic' ? 'selected' : ''}>Claude 原生（有緩存）</option>
                            </select>
                        </div>

                        <div class="set-group">
                            <div class="set-label">選擇模型</div>
                            <div id="sec-model-system-notice" class="${secLlmConfig.useSystemApi ? '' : 'hidden'}" style="background:rgba(var(--os-ink-rgb), 0.06); padding:10px; border-radius:4px; font-size:12px; color:var(--os-ink); border:1px solid rgba(var(--os-ink-rgb), 0.15);">
                                <i class="fa-solid fa-link"></i> 模型由酒館決定，在酒館切換即可。
                            </div>
                            <div class="model-row ${secLlmConfig.useSystemApi ? 'hidden' : ''}" id="sec-model-row">
                                <select class="set-select" id="sec-api-model"><option value="${_capiEsc(secLlmConfig.model)}">${_capiEsc(secLlmConfig.model)} (當前)</option></select>
                                <div class="btn-fetch" id="sec-fetch-btn" title="${isStandalone ? '拉取模型清單' : '從端點同步'}">${isStandalone ? '<i class="fa-solid fa-microchip"></i>' : '<i class="fa-solid fa-rotate"></i>'}</div>
                            </div>
                        </div>

                        <!-- ⛔ 副模型的「僅讀取摘要」已移除：沒有任何程式讀 os_secondary_llm_config.enableSummaryOnly，
                             它從頭到尾只是一顆存得起來、但誰也不看的開關。歷史用量控制在主模型那格。 -->

                        <div class="set-group">
                            <details>
                                <summary style="cursor:pointer; user-select:none; font-size:13px; color:var(--os-ink);" title="以 system 角色插在副模型所有訊息最前面；不分派發路徑（直連／跟隨酒館／）都生效。"><i class="fa-solid fa-pen-to-square"></i> 自訂前置指令${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1402') : ''}</summary>
                                <textarea class="set-input" id="sec-custom-cot" rows="7" placeholder="貼上要放在副模型訊息最前面的 system 指令" style="margin-top:8px; width:100%; resize:vertical; line-height:1.5; min-height:120px;">${(secLlmConfig.customCot || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
                            </details>
                        </div>

                        <div class="set-group"${stHide}>
                            <div class="set-label">
                                <span><i class="fa-solid fa-clipboard"></i> 注入 Preset 自訂條目</span>
                                <label class="toggle-switch"><input type="checkbox" id="sec-use-preset-prompts" ${secLlmConfig.usePresetPrompts ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div id="sec-preset-name-group" style="margin-top:10px; display:${secLlmConfig.usePresetPrompts ? 'flex' : 'none'}; gap:8px; align-items:center;">
                                <select class="set-select" id="sec-preset-name" style="flex:1;">
                                    <option value="">（使用當前 in_use Preset）</option>
                                </select>
                                <div class="btn-fetch" id="sec-preset-refresh-btn" title="重新整理 Preset 列表" style="flex-shrink:0;"><i class="fa-solid fa-rotate"></i></div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-slider-container">
                                <div class="set-label"><span>Max Tokens</span></div>
                                <input type="number" min="100" max="200000" step="100" value="${_capiEsc(secLlmConfig.maxTokens)}" class="set-input" id="sec-max-tokens" style="margin-top:6px; width:100%;">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Temperature</span><span class="set-slider-val" id="sec-val-temp">${secLlmConfig.temperature}</span></div>
                                <input type="range" min="0" max="2" step="0.05" value="${_capiEsc(secLlmConfig.temperature)}" class="set-slider" id="sec-temperature">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Top P</span><span class="set-slider-val" id="sec-val-topp">${secLlmConfig.top_p ?? 1.0}</span></div>
                                <input type="range" min="0" max="1" step="0.01" value="${_capiEsc(secLlmConfig.top_p ?? 1.0)}" class="set-slider" id="sec-top-p">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Frequency Penalty</span><span class="set-slider-val" id="sec-val-freq">${secLlmConfig.frequency_penalty ?? 0}</span></div>
                                <input type="range" min="-2" max="2" step="0.01" value="${_capiEsc(secLlmConfig.frequency_penalty ?? 0)}" class="set-slider" id="sec-freq-penalty">
                            </div>
                            <div class="set-slider-container" style="margin-top:10px;">
                                <div class="set-label"><span>Presence Penalty</span><span class="set-slider-val" id="sec-val-pres">${secLlmConfig.presence_penalty ?? 0}</span></div>
                                <input type="range" min="-2" max="2" step="0.01" value="${_capiEsc(secLlmConfig.presence_penalty ?? 0)}" class="set-slider" id="sec-pres-penalty">
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label"><i class="fa-solid fa-plug"></i> 測試 API 連線</div>
                            <div class="btn-test" id="sec-test-btn">發送測試訊息</div>
                            <div id="sec-test-result" style="display:none; margin-top:10px; background:rgba(var(--os-tint-rgb), 0.90); border-radius:4px; padding:12px; font-size:12px; color:var(--os-ink-soft); font-family:monospace; white-space:pre-wrap; word-break:break-all; max-height:120px; overflow-y:auto;"></div>
                        </div>
                    </div>

                    <div id="view-chan" class="api-subview" style="display:none;">
                        <div class="set-group" id="vision-group">
                            <div class="set-label"><i class="fa-solid fa-eye"></i> 看圖${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1452') : ''}</div>
                            <div id="vision-mode-box"></div>
                        </div>

                        <div class="set-group" id="route-group">
                            <div class="set-label"><i class="fa-solid fa-shuffle"></i> 哪件事走哪個模型${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1458') : ''}</div>
                            <div id="route-table"></div>
                        </div>

                        <div class="set-group" id="channel-group">
                            <div class="set-label"><i class="fa-solid fa-plug-circle-plus"></i> 我的通道${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1464') : ''}</div>
                            <div id="channel-list"></div>
                            <div class="btn-test" id="channel-add-btn" style="margin-top:10px;"><i class="fa-solid fa-plus"></i> 加一條通道</div>
                        </div>
                    </div>

                    <!-- 🎲 決策模型（Jev 那種）：網址、模型、鑰匙三格，直接寫存檔（os_jev_conn.js），不跟「保存所有設定」綁 -->
                    <div id="view-jev" class="api-subview" style="display:none;">
                        <div class="set-group" id="jev-group">
                            <div class="set-label"><span><i class="fa-solid fa-dice"></i> 決策模型${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_jev') : ''}</span></div>
                            <div class="jev-field"><div class="set-label">網址</div><input class="set-input" id="jev-url" autocomplete="off"></div>
                            <div class="jev-field"><div class="set-label">模型</div><input class="set-input" id="jev-model" autocomplete="off"></div>
                            <div class="jev-field"><div class="set-label">鑰匙</div><input class="set-input" id="jev-key" type="password" autocomplete="off"></div>
                            <div class="btn-test" id="jev-test-btn"><i class="fa-solid fa-plug"></i> 測試</div>
                            <div class="set-desc jev-test-result hidden" id="jev-test-result"></div>
                        </div>
                    </div>
                    </div><!-- /view-api -->

                    <div id="view-img" class="tab-view hidden">
                        <div class="gal-subtab-row">
                            <div class="gal-subtab active" data-galtab="api"    onclick="_switchOsGalTab(this,'api')">圖片設置</div>
                            <div class="gal-subtab" data-galtab="avatar" onclick="_switchOsGalTab(this,'avatar')">頭像</div>
                            <div class="gal-subtab" data-galtab="bg"     onclick="_switchOsGalTab(this,'bg')">背景</div>
                            <div class="gal-subtab" data-galtab="scene"  onclick="_switchOsGalTab(this,'scene')">插圖</div>
                            ${((window.OS_CHAT_TIDY || (window.parent && window.parent.OS_CHAT_TIDY)) || { available: () => false }).available() ? `<button class="act-open-chip" type="button" onclick="var T=window.OS_CHAT_TIDY||(window.parent&&window.parent.OS_CHAT_TIDY);if(T)T.open({from:this});"><i class="fa-solid fa-broom"></i><span>整理聊天與圖</span></button>` : ''}
                        </div>
                        <div id="view-img-api" class="img-subtab-view">

                        <!-- ── 分頁照接口分（她 09-24 定的）：前五頁只管連線、存成一組一組；「畫風」頁放每個要生圖的地方用哪組、哪個畫風、多大。
                             跟 API 頁「我的通道＋哪件事走哪個模型」同一套。由 _switchImgTab 切。── -->
                        <div class="img-srctab-row img-conn-tabs">
                            <div class="img-srctab" data-imgtab="style" onclick="window._switchImgTab && window._switchImgTab('style')">畫風</div>
                            <div class="img-srctab" data-imgtab="novelai" onclick="window._switchImgTab && window._switchImgTab('novelai')">NAI</div>
                            <div class="img-srctab" data-imgtab="comfyui_direct" onclick="window._switchImgTab && window._switchImgTab('comfyui_direct')">ComfyUI</div>
                            <div class="img-srctab" data-imgtab="tavern_sd" onclick="window._switchImgTab && window._switchImgTab('tavern_sd')">酒館</div>
                            <div class="img-srctab" data-imgtab="custom_api" onclick="window._switchImgTab && window._switchImgTab('custom_api')">自訂接口</div>
                        </div>

                        <!-- ── 🎨 畫風：每個地方一列（_renderImgUses 照 OS_IMAGE_MANAGER.USES 畫）── -->
                        <div id="img-tab-style" class="img-srctab-body">
                            <div class="set-group" id="img-use-block">
                                <div class="set-label"><i class="fa-solid fa-table-list"></i> 每個地方用什麼${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_img_uses') : ''}</div>
                                <div id="img-use-table" class="img-use-table"></div>
                            </div>
                            <div class="set-group" id="img-sprite-opts">
                                <div class="set-label">立繪模式${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1519') : ''}</div>
                                <label class="set-check"><input type="checkbox" id="vncfg-sprite-direct" ${vnD.spriteDirect ? 'checked' : ''}> 跳過頭像，角色直接生全身立繪</label>
                                <!-- 🎯 一次幾個：把幾個角色擠進同一張寬圖生出來再切開。
                                     🚨🚨 這一格永遠能選，判斷只拿來寫底下那行字、不准拿來鎖。
                                        我第一版是「認不出官方就整格不顯示」（她找不到，問「在哪開?」），
                                        第二版改成變灰（她回「什麼鬼? 我就是拿官方的」——判斷猜錯了）。
                                        判斷條件是她定的：自訂接口 ＋ 型號名帶 GPT。我原本寫死成網址 api.openai.com
                                        或型號含 gpt-image，兩條都比她的寫法窄，所以她的設定一直判不中。 -->
                                <div id="vncfg-sprite-batch-row" style="margin-top:10px;">
                                    <div class="set-label" title="幾個角色擠進同一張寬圖一次生完再切開。畫風一致、也省呼叫次數。">一次生幾個角色</div>
                                    <select class="set-select" id="vncfg-sprite-batch" style="font-size:12px;">
                                        <option value="1" ${!(vnD.spriteBatch > 1) ? 'selected' : ''}>一個一個生</option>
                                        <option value="2" ${vnD.spriteBatch === 2 ? 'selected' : ''}>兩個一起（每個 768×1024）</option>
                                        <option value="3" ${vnD.spriteBatch === 3 ? 'selected' : ''}>三個一起（每個 512×1024）</option>
                                    </select>
                                    <div class="set-desc">湊滿就一起生；劇情只冒出一個角色時照樣單獨生，不會等。<br>${_isGptChar(imgConfig)
                                        ? '你現在頭像接的是 <b>' + _charModelName(imgConfig) + '</b>，就是它擅長的事。'
                                        : '會照指令把畫面分成等寬直欄的是 GPT、Gemini（NanoBanana）那幾種；畫風鬆散的接口可能把幾個角色糊在一起。'}</div>
                                </div>
                                <!-- 🎴 一次生三種（她 2026-10-05：「做一個勾選打開這種模式?」）：一張三格圖切成立繪／頭像／Q版。
                                     勾選跟立繪模式一樣按底部保存才存；提示詞那格打了就存（同立繪工作室的前後綴）。 -->
                                <div class="trio-row">
                                    <label class="set-check"><input type="checkbox" id="vncfg-sprite-trio" ${vnD.spriteTrio ? 'checked' : ''} onchange="window._trioToggle && window._trioToggle(this.checked)"> 一次生三種：立繪＋頭像＋Q版${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_trio') : ''}</label>
                                    <div id="vncfg-trio-body" class="${vnD.spriteTrio ? '' : 'hidden'}">
                                        <!-- 11-15 分兩格（她：「好，分兩格」）：兩種接口各存各的。11-16 起兩格內建的都是畫一隻站立 Q版（自訂接口那格試過內建三面小人，畫風會被整張的畫風帶走，改回）。用哪格看「立繪」那列接的接口（VN_Image.trioTplKey）。 -->
                                        <div class="set-label">三格的提示詞：接自訂接口時用</div>
                                        <textarea class="set-textarea trio-tpl" id="trio-tpl-gpt" rows="9" oninput="window._trioTplSave && window._trioTplSave(this.value, 'custom_api')"></textarea>
                                        <div class="btn-test trio-reset" onclick="window._trioTplReset && window._trioTplReset('custom_api')">還原預設提示詞</div>
                                        <div class="set-label">三格的提示詞：接其他接口時用</div>
                                        <textarea class="set-textarea trio-tpl" id="trio-tpl" rows="9" oninput="window._trioTplSave && window._trioTplSave(this.value, '')"></textarea>
                                        <div class="btn-test trio-reset" onclick="window._trioTplReset && window._trioTplReset('')">還原預設提示詞</div>
                                        <div class="set-desc">用哪一格看上面「立繪」那列接的是什麼（ComfyUI、NAI 那些算其他接口）。【角色外觀】會換成角色的長相；畫風照「立繪」那列。</div>
                                    </div>
                                </div>
                            </div>
                            <div class="set-group" id="img-room-style-block"></div>
                            <!-- 🚪 世界門旅人畫風：展開世界後，大廳那四個旅人的小人自動用這個畫風生出來（不選＝維持剪影） -->
                            <div class="set-group" id="img-wg-sprite-block">
                                <div class="set-label" title="展開世界後，大廳的旅人小人會自動用這個畫風生成，不用一個一個進裝扮室。"><i class="fa-solid fa-door-open"></i> 世界門旅人${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1616') : ''}</div>
                                <select class="set-select" id="img-wg-sprite" onchange="window._saveWgSpritePack && window._saveWgSpritePack(this.value)">
                                    ${(() => {
                                        const _w = window.parent || window;
                                        const _LD = _w.LobbyDress || window.LobbyDress;
                                        let cur = {};
                                        try { cur = JSON.parse(_w.localStorage.getItem('wg_sprite_pack_v1') || '{}') || {}; } catch (e) {}
                                        const _esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
                                        let html = '<option value="">不自動生成（維持剪影）</option>';
                                        if (!_LD || !_LD.listPresets) return html;
                                        [['comfyui_direct', 'ComfyUI'], ['novelai', 'NAI']].forEach(([src, label]) => {
                                            (_LD.listPresets(src) || []).forEach(p => {
                                                const k = _LD.presetKeyOf(p);
                                                if (!k) return;
                                                const v = src + '|' + k;
                                                const sel = (cur.src === src && cur.key === k) ? ' selected' : '';
                                                html += '<option value="' + _esc(v) + '"' + sel + '>' + label + '｜' + _esc(p.name || '未命名') + '</option>';
                                            });
                                        });
                                        return html;
                                    })()}
                                </select>
                            </div>
                            <!-- 🎭 大廳的小人（11-16 角色中心第二步）：裝扮頁「生成單張立姿圖／生成走路圖」用哪個預設包。以前是裝扮室裡每個角色都看得到的兩個下拉，搬到這裡設一次 -->
                            <div class="set-group" id="img-dress-pack-block">
                                <div class="set-label"><i class="fa-solid fa-shirt"></i> 大廳的小人${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_dress_pack') : ''}</div>
                                ${(() => {
                                    const _w = window.parent || window;
                                    const _LD = _w.LobbyDress || window.LobbyDress;
                                    const _esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
                                    const one = (kind, label) => {
                                        let opts = '', any = false;
                                        const cur = (_LD && _LD.packOf) ? _LD.packOf(kind) : null;
                                        if (_LD && _LD.listPresets) [['comfyui_direct', 'ComfyUI'], ['novelai', 'NAI']].forEach(([src, name]) => {
                                            (_LD.listPresets(src) || []).forEach(p => {
                                                const k = _LD.presetKeyOf(p);
                                                if (!k) return;
                                                any = true;
                                                opts += '<option value="' + _esc(src + '|' + k) + '"' + ((cur && cur.src === src && cur.key === k) ? ' selected' : '') + '>' + name + '｜' + _esc(p.name || '未命名') + '</option>';
                                            });
                                        });
                                        const head = cur ? '' : '<option value="" selected disabled>' + (any ? '還沒選' : '還沒有預設包') + '</option>';
                                        return '<div class="set-label">' + label + '</div>'
                                             + '<select class="set-select" id="img-dress-pack-' + kind + '" onchange="window._saveDressPack && window._saveDressPack(\'' + kind + '\', this.value)">' + head + opts + '</select>';
                                    };
                                    return one('img', '生成單張立姿圖用') + one('sheet', '生成走路圖用');
                                })()}
                                <div class="set-label">不倒翁小人的提示詞：接自訂接口時用</div>
                                <textarea class="set-textarea trio-tpl" id="doll-tpl" rows="9" oninput="window._dollTplSave && window._dollTplSave(this.value)"></textarea>
                                <div class="btn-test trio-reset" onclick="window._dollTplReset && window._dollTplReset()">還原預設提示詞</div>
                            </div>
                            <div class="set-group" id="img-scene-extract-block" style="border-top:1px dashed rgba(var(--os-ink-rgb), 0.10); padding-top:14px; margin-top:14px;">
                            <div style="display:flex; align-items:center; justify-content:space-between;" title="開啟後：每輪「記憶抽取（AVS＋向量）」那次副模型呼叫會順便依正文吐 2 張插圖 prompt → 自動生圖、貼進對應訊息。不勞主模型、不多花 API。其它觸發：主模型直接吐 [Scene|]（世界書開規則，最省）。">
                                <span><i class="fa-solid fa-image"></i> 自動插圖${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2125') : ''}</span>
                                <label class="toggle-switch"><input type="checkbox" id="img-scene-extract-enabled" ${imgConfig.sceneGen?.extractEnabled ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:12px;" title="開啟：副模型寫插圖 prompt 時只用 ##角色名##（或 ##代號##）代表角色，外觀由系統用該角色頭像生成詞自動填入（沒頭像退 AVS 簡易形象、再沒有留原名）。副模型 prompt 不用塞整塊外觀、不會越積越肥，外觀又跟頭像一致。關閉＝改回把近期角色外觀整塊塞給副模型。">
                                <span><i class="fa-solid fa-tag"></i> 角色名佔位${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2130') : ''}</span>
                                <label class="toggle-switch"><input type="checkbox" id="img-scene-name-placeholder" ${imgConfig.sceneGen?.useNamePlaceholder !== false ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <div class="set-desc img-looks-moved"><i class="fa-solid fa-user-pen"></i> 每個角色的長相搬到「角色」裡了：手機主畫面「角色」→ 點他 →「裝扮」→ 最下面「他的長相」，在那裡改、照它重畫。</div>
                            <!-- 插圖指令：每個插圖來源一份，點進去整頁改（_openScenePromptPage） -->
                            <button type="button" class="vncfg-lp-open img-scene-prompt-open" data-scene-page="extract">
                                <i class="fa-solid fa-list-ul"></i><span class="vncfg-lp-open-t">插圖指令</span><span class="vncfg-lp-open-n">每個插圖來源一份</span><i class="fa-solid fa-chevron-right"></i>
                            </button>
                            <div class="set-desc">附加在記憶副模型指令後面，叫它順便寫插圖；切到哪個插圖來源就用那份。</div>

                            <!-- 🎯 獨立插圖副模型：另開一通 chatSecondary、只吃規範、不背 AVS/記憶 -->
                            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:14px; border-top:1px dashed rgba(var(--os-ink-rgb), 0.10); padding-top:12px;" title="開啟：插圖改走「獨立一通副模型」(用 API 設定區的副模型接口)、只吃下方規範、不背 AVS/記憶，插圖更準。關閉＝走上面搭便車路(跟記憶/AVS 同一通)。">
                                <span><i class="fa-solid fa-bullseye"></i> 獨立插圖副模型${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2144') : ''}</span>
                                <label class="toggle-switch"><input type="checkbox" id="img-scene-standalone-enabled" ${imgConfig.sceneGen?.standaloneEnabled ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                            <button type="button" class="vncfg-lp-open img-scene-prompt-open" data-scene-page="standalone">
                                <i class="fa-solid fa-list-ul"></i><span class="vncfg-lp-open-t">獨立插圖規範</span><span class="vncfg-lp-open-n"></span><i class="fa-solid fa-chevron-right"></i>
                            </button>
                        </div>
                            <div class="set-group">
                            <div class="set-label"><i class="fa-solid fa-flask"></i> 試畫一張${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_img_test') : ''}</div>
                            <select class="set-select" id="img-test-use"></select>
                            <input class="set-input" id="img-test-prompt" type="text" placeholder="輸入描述…" value="a handsome man holding a rose">
                            <div class="btn-test" id="img-test-btn" style="margin-top:10px;"><i class="fa-solid fa-palette"></i> 生成預覽</div>
                            <div id="img-test-preview" style="margin-top:15px; display:none; text-align:center;">
                                <img id="img-test-image" style="max-width:100%; border-radius:4px; border:1px solid rgba(var(--os-ink-rgb), 0.15);" />
                                <div id="img-test-url" style="font-size:11px; color:rgba(var(--os-ink-rgb), 0.72); margin-top:8px; word-break:break-all;"></div>
                            </div>
                        </div>
                            <div class="set-group" id="img-pixabay-block" style="border-top:1px dashed rgba(var(--os-ink-rgb), 0.10); padding-top:14px; margin-top:14px;">
                            <div class="set-label" title="主來源卡住或逾時時，自動從 Pixabay 抓相符照片當背景，套玻璃磨砂遮罩。"><i class="fa-solid fa-life-ring"></i> 退路圖庫</div>
                            <div class="set-desc" style="margin-bottom:8px;">免費註冊 → <a href="https://pixabay.com/api/docs/" target="_blank" style="color:var(--os-ink);">pixabay.com/api/docs</a></div>
                            <input class="set-input" id="img-pixabay-key" type="password" placeholder="Pixabay API Key（空白 = 不啟用退路）" value="${_capiEsc(imgConfig.pixabayKey || '')}">
                            <div style="margin-top:10px; display:flex; align-items:center; gap:8px;">
                                <label class="toggle-switch"><input type="checkbox" id="img-fallback-force" ${imgConfig.fallbackForce ? 'checked' : ''}><span class="slider"></span></label>
                                <span style="font-size:12px; color:var(--os-ink);"><i class="fa-solid fa-flask"></i> 強制走退路圖庫（測試用，不去生圖接口）</span>
                            </div>
                        </div>
                            <!-- 三個尺寸下拉照舊在這裡組好（存檔讀它們），_renderImgUses 再把它們搬進對應那一列 -->
                            <div id="img-size-parking" hidden>
                                <select class="set-select" id="img-avatar-size" style="font-size:12px;">
                                    <option value=""          ${!(imgConfig.avatarSize) ? 'selected':''}>跟各接口預設（ComfyUI＝預設包尺寸）</option>
                                    <option value="512x768"   ${imgConfig.avatarSize==='512x768'   ? 'selected':''}>512×768（直式小圖，舊預設）</option>
                                    <option value="512x512"   ${imgConfig.avatarSize==='512x512'   ? 'selected':''}>512×512（方形）</option>
                                    <option value="768x768"   ${imgConfig.avatarSize==='768x768'   ? 'selected':''}>768×768</option>
                                    <option value="1024x1024" ${imgConfig.avatarSize==='1024x1024' ? 'selected':''}>1024×1024（清晰）</option>
                                    <option value="832x1216"  ${imgConfig.avatarSize==='832x1216'  ? 'selected':''}>832×1216（NAI 直幅）</option>
                                </select>
                                <select class="set-select" id="img-scene-size" style="font-size:12px;" onchange="document.getElementById('img-scene-size-custom').style.display=(this.value==='custom')?'':'none';">
                                        <option value="512x512"   ${(imgConfig.sceneGen?.size||'1024x1024')==='512x512'   ? 'selected':''}>512×512（最快最省，較糊）</option>
                                        <option value="768x768"   ${(imgConfig.sceneGen?.size||'1024x1024')==='768x768'   ? 'selected':''}>768×768（平衡）</option>
                                        <option value="1024x1024" ${(imgConfig.sceneGen?.size||'1024x1024')==='1024x1024' ? 'selected':''}>1024×1024（清晰，推薦）</option>
                                        <option value="1024x768"  ${(imgConfig.sceneGen?.size||'1024x1024')==='1024x768'  ? 'selected':''}>1024×768（橫幅）</option>
                                        <option value="768x1024"  ${(imgConfig.sceneGen?.size||'1024x1024')==='768x1024'  ? 'selected':''}>768×1024（直幅）</option>
                                        <option value="1216x832"  ${(imgConfig.sceneGen?.size||'1024x1024')==='1216x832'  ? 'selected':''}>1216×832（NAI 橫幅）</option>
                                        <option value="832x1216"  ${(imgConfig.sceneGen?.size||'1024x1024')==='832x1216'  ? 'selected':''}>832×1216（NAI 直幅）</option>
                                        <option value="custom"    ${!['512x512','768x768','1024x1024','1024x768','768x1024','1216x832','832x1216'].includes(imgConfig.sceneGen?.size||'1024x1024') ? 'selected':''}>自訂…</option>
                                    </select>
                                <input class="set-input" id="img-scene-size-custom" type="text" placeholder="寬x高，例如 1020x1020" value="${!['512x512','768x768','1024x1024','1024x768','768x1024','1216x832','832x1216'].includes(imgConfig.sceneGen?.size||'1024x1024') ? (imgConfig.sceneGen?.size||'') : ''}" style="font-size:12px; margin-top:6px; display:${!['512x512','768x768','1024x1024','1024x768','768x1024','1216x832','832x1216'].includes(imgConfig.sceneGen?.size||'1024x1024') ? '' : 'none'};">
                                <select class="set-select" id="img-bg-size" style="font-size:12px;">
                                    <option value="1024x768"  ${(imgConfig.bgSize||'1024x768')==='1024x768'  ? 'selected':''}>1024×768（橫幅 4:3，預設）</option>
                                    <option value="1216x832"  ${(imgConfig.bgSize||'1024x768')==='1216x832'  ? 'selected':''}>1216×832（寬幅 3:2）</option>
                                    <option value="1344x768"  ${(imgConfig.bgSize||'1024x768')==='1344x768'  ? 'selected':''}>1344×768（寬螢幕 16:9）</option>
                                    <option value="1024x1024" ${(imgConfig.bgSize||'1024x768')==='1024x1024' ? 'selected':''}>1024×1024（方形）</option>
                                    <option value="832x1216"  ${(imgConfig.bgSize||'1024x768')==='832x1216'  ? 'selected':''}>832×1216（豎版 2:3）</option>
                                    <option value="768x1344"  ${(imgConfig.bgSize||'1024x768')==='768x1344'  ? 'selected':''}>768×1344（直立，手機全螢幕）</option>
                                </select>
                            </div>
                        </div>

                        <!-- ── 各接口的連線設定：一頁一個，由 _switchImgTab 切 ── -->
                        <div id="img-iface-groups">

                            <div id="img-group-comfyui" class="${((imgConfig.serviceInanimate || imgConfig.service) === 'comfyui_direct' || (imgConfig.serviceChar || imgConfig.serviceLiving || imgConfig.service) === 'comfyui_direct' || (imgConfig.serviceScene || imgConfig.serviceLiving || imgConfig.service) === 'comfyui_direct') ? '' : 'hidden'}">
                                <div class="iface-section-title is-first"><i class="fa-solid fa-plug"></i> 連線設定（連接你電腦上的 ComfyUI）</div>
                                <div class="set-group">
                                    <div class="set-label">ComfyUI 網址</div>
                                    <div style="display:flex; gap:8px;">
                                        <input class="set-input" id="img-cfd-url" type="text" placeholder="http://127.0.0.1:8188" value="${_capiEsc(imgConfig.comfyuiDirect?.url || 'http://127.0.0.1:8188')}" style="flex:1;">
                                        <button class="set-btn" id="img-cfd-test" type="button" style="white-space:nowrap;"><i class="fa-solid fa-plug"></i> 測試 / 抓清單</button>
                                    </div>
                                    <div class="set-desc" id="img-cfd-status" style="margin-top:6px;"></div>
                                </div>
                                <div class="set-group" id="img-cfd-edit-group">
                                    <div class="set-label"><i class="fa-solid fa-box"></i> 預設包${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_cfd_edit') : ''}</div>
                                    <div class="cfd-pack-pick-row">
                                        <select class="set-select" id="img-cfd-edit-sel"></select>
                                        <button class="set-btn" id="img-cfd-preset-open" type="button" onclick="window._cfdPreset.open()"><i class="fa-solid fa-table-cells-large"></i> 看圖挑 · ${(imgConfig.comfyuiDirect?.presets || []).length}</button>
                                    </div>
                                    <div class="set-room-style-btns">
                                        <button class="set-btn" type="button" onclick="window._cfdEdit && window._cfdEdit.saveBack()"><i class="fa-solid fa-floppy-disk"></i> 存回這個包</button>
                                        <button class="set-btn" type="button" onclick="window._cfdEdit && window._cfdEdit.saveAs()"><i class="fa-solid fa-plus"></i> 另存新的包</button>
                                    </div>
                                    <div class="set-desc" id="img-cfd-edit-status"></div>
                                </div>
                                <!-- 預設包 modal（可視化卡片牆） -->
                                <div id="img-cfd-preset-modal" class="cfd-pack-modal">
                                    <div class="cfd-pack-box">
                                        <div class="cfd-pack-head">
                                            <div class="cfd-pack-title"><i class="fa-solid fa-box"></i> 預設包<span class="cfd-pack-count" id="img-cfd-preset-count"></span></div>
                                            <button type="button" class="cfd-pack-close" title="關閉" onclick="window._cfdPreset.close()"><i class="fa-solid fa-xmark"></i></button>
                                        </div>
                                        <div class="cfd-pack-body">
                                        <div class="cfd-pack-pv-label"><i class="fa-solid fa-palette"></i> 預覽測試詞（每個包都用這句生縮圖，只比風格差異）</div>
                                        <input id="img-cfd-preview-prompt" class="set-input cfd-pack-pv-input" value="${(imgConfig.comfyuiDirect?.previewPrompt || '1 person, upper body portrait, looking at viewer, simple background').replace(/"/g,'&quot;')}">
                                        <div id="img-cfd-preset-grid" class="cfd-pack-grid"></div>
                                        <div class="cfd-wf-restore">
                                            <div class="cfd-wf-restore-drop" id="img-cfd-wf-drop"><i class="fa-solid fa-image"></i> 拖一張以前用 ComfyUI 生的圖進來（或點這裡選檔）<br>自動把模型／LoRA／採樣器／提示詞拆進一張預設卡，套用後每格都能調</div>
                                            <input type="file" id="img-cfd-wf-img" accept="image/png" class="cfd-pack-file-hidden">
                                            <div class="cfd-wf-restore-status" id="img-cfd-wf-status"></div>
                                        </div>
                                        <div class="cfd-pack-io-row">
                                            <button class="set-btn" type="button" onclick="window._cfdPreset.importPack()"><i class="fa-solid fa-download"></i> 匯入預設包檔</button>
                                            <button class="set-btn" type="button" onclick="window._cfdPreset.exportPack()"><i class="fa-solid fa-upload"></i> 匯出全部</button>
                                            <button class="set-btn cfd-pack-clear" type="button" onclick="window._cfdPreset.clearAll()"><i class="fa-solid fa-trash-can"></i> 清空</button>
                                            <input type="file" id="img-cfd-preset-file" accept=".json,application/json" class="cfd-pack-file-hidden">
                                        </div>
                                        <div class="cfd-pack-io-hint">拿到別人分享的畫風包檔，按「匯入」讀進來；「匯出」會把整面卡片牆存成一個檔，可以分享給朋友。匯入時會問你要「覆蓋同名」還是「全部新增」。「清空」把整牆清掉（要按底部保存才真的生效）。</div>
                                        <div id="img-cfd-import-choice" class="cfd-import-choice" style="display:none;">
                                            <div class="cfd-import-choice-msg" id="img-cfd-import-msg"></div>
                                            <div class="cfd-import-choice-btns">
                                                <button class="set-btn" type="button" onclick="window._cfdPreset._applyImport('overwrite')">覆蓋同名</button>
                                                <button class="set-btn" type="button" onclick="window._cfdPreset._applyImport('append')">全部新增</button>
                                                <button class="set-btn cfd-import-cancel" type="button" onclick="window._cfdPreset._cancelImport()">取消</button>
                                            </div>
                                        </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="set-group">
                                    <div class="set-label">模型類型</div>
                                    <select class="set-select" id="img-cfd-type">
                                        <option value="checkpoint" ${(imgConfig.comfyuiDirect?.modelType||'checkpoint')==='checkpoint'?'selected':''}>標準 Checkpoint（SDXL/Illustrious/Pony…）</option>
                                        <option value="flux" ${imgConfig.comfyuiDirect?.modelType==='flux'?'selected':''}>Flux（單體，需 clip_l/t5xxl/ae）</option>
                                        <option value="anima" ${imgConfig.comfyuiDirect?.modelType==='anima'?'selected':''}>Anima（自然語言動漫，需 qwen 編碼器＋VAE）</option>
                                    </select>
                                    <div class="set-label cfd-sublabel">模型</div>
                                    <select class="set-select" id="img-cfd-model">
                                        <option value="${_capiEsc(imgConfig.comfyuiDirect?.model || '')}" selected>${_capiEsc(imgConfig.comfyuiDirect?.model || '（先按上面「測試 / 抓清單」）')}</option>
                                    </select>
                                </div>
                                <div class="set-group ${imgConfig.comfyuiDirect?.modelType==='flux'?'':'hidden'}" id="img-cfd-flux-fields">
                                    <div class="set-desc" title="檔名一般跟你下載的一致，不用改。">Flux 專用搭配檔${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1733') : ''}</div>
                                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px;">
                                        <div><div class="set-label" style="font-size:11px;">clip_l</div><input class="set-input" id="img-cfd-clipl" value="${_capiEsc(imgConfig.comfyuiDirect?.fluxClipL || 'clip_l.safetensors')}"></div>
                                        <div><div class="set-label" style="font-size:11px;">t5xxl</div><input class="set-input" id="img-cfd-t5xxl" value="${_capiEsc(imgConfig.comfyuiDirect?.fluxT5 || 't5xxl_fp8_e4m3fn.safetensors')}"></div>
                                        <div><div class="set-label" style="font-size:11px;">ae VAE</div><input class="set-input" id="img-cfd-ae" value="${_capiEsc(imgConfig.comfyuiDirect?.fluxAe || 'ae.safetensors')}"></div>
                                        <div><div class="set-label" style="font-size:11px;" title="建議 3.5。">Guidance</div><input class="set-input" id="img-cfd-guidance" type="number" step="0.1" min="0" max="10" value="${_capiEsc(imgConfig.comfyuiDirect?.guidance ?? 3.5)}"></div>
                                    </div>
                                </div>
                                <div class="set-group ${imgConfig.comfyuiDirect?.modelType==='anima'?'':'hidden'}" id="img-cfd-anima-fields">
                                    <div class="set-desc" title="檔名跟你下載的一致，通常不用改。">Anima 專用搭配檔${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1741') : ''}</div>
                                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px;">
                                        <div><div class="set-label" style="font-size:11px;" title="qwen 編碼器。">文字編碼器</div><input class="set-input" id="img-cfd-anima-clip" value="${_capiEsc(imgConfig.comfyuiDirect?.animaClip || 'qwen_3_06b_base.safetensors')}"></div>
                                        <div><div class="set-label" style="font-size:11px;" title="qwen VAE。">VAE</div><input class="set-input" id="img-cfd-anima-vae" value="${_capiEsc(imgConfig.comfyuiDirect?.animaVae || 'qwen_image_vae.safetensors')}"></div>
                                    </div>
                                </div>
                                <div class="set-group">
                                    <div class="set-label">基本參數</div>
                                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px;">
                                        <div><div class="set-label" style="font-size:11px;">採樣器</div><select class="set-select" id="img-cfd-sampler">${['euler','euler_ancestral','euler_cfg_pp','dpmpp_2m','dpmpp_2m_sde','dpmpp_3m_sde','dpmpp_sde','dpmpp_2s_ancestral','heun','dpm_2','lms','ddim','uni_pc','uni_pc_bh2','lcm','res_multistep','er_sde'].map(s => `<option value="${s}"${(imgConfig.comfyuiDirect?.sampler||'euler')===s?' selected':''}>${s}</option>`).join('')}</select></div>
                                        <div><div class="set-label" style="font-size:11px;">排程器</div><select class="set-select" id="img-cfd-scheduler">${['normal','karras','exponential','sgm_uniform','simple','ddim_uniform','beta','linear_quadratic','kl_optimal'].map(s => `<option value="${s}"${(imgConfig.comfyuiDirect?.scheduler||'normal')===s?' selected':''}>${s}</option>`).join('')}</select></div>
                                        <div><div class="set-label" style="font-size:11px;">步數</div><input class="set-input" id="img-cfd-steps" type="number" min="1" max="60" value="${_capiEsc(imgConfig.comfyuiDirect?.steps ?? 28)}"></div>
                                        <div><div class="set-label" style="font-size:11px;">CFG</div><input class="set-input" id="img-cfd-cfg" type="number" step="0.1" min="1" max="20" value="${_capiEsc(imgConfig.comfyuiDirect?.cfg ?? 6.5)}"></div>
                                        <div><div class="set-label" style="font-size:11px;">寬度</div><input class="set-input" id="img-cfd-width" type="number" step="64" value="${_capiEsc(imgConfig.comfyuiDirect?.width ?? 1024)}"></div>
                                        <div><div class="set-label" style="font-size:11px;">高度</div><input class="set-input" id="img-cfd-height" type="number" step="64" value="${_capiEsc(imgConfig.comfyuiDirect?.height ?? 1024)}"></div>
                                        <div><div class="set-label" style="font-size:11px;" title="-1 為隨機。">種子</div><input class="set-input" id="img-cfd-seed" type="number" value="${_capiEsc(imgConfig.comfyuiDirect?.seed ?? -1)}"></div>
                                        <div><div class="set-label" style="font-size:11px;" title="0 為關閉。">CLIP skip</div><input class="set-input" id="img-cfd-clipskip" type="number" min="0" max="4" value="${_capiEsc(imgConfig.comfyuiDirect?.clipSkip ?? 0)}"></div>
                                        <div style="grid-column:1 / -1;"><div class="set-label" style="font-size:11px;" title="空＝模型內建。">VAE</div><select class="set-select" id="img-cfd-vae"><option value=""${!imgConfig.comfyuiDirect?.vae?' selected':''}>（內建 VAE）</option>${imgConfig.comfyuiDirect?.vae?`<option value="${_capiEsc(imgConfig.comfyuiDirect.vae)}" selected>${_capiEsc(imgConfig.comfyuiDirect.vae)}</option>`:''}</select></div>
                                    </div>
                                </div>
                                <div class="set-group">
                                    <div class="set-label" title="開關 ☑ + 名字 + 模型/CLIP 強度。LoRA 要跟模型同架構（SDXL 配 SDXL）。名字可下拉選或手打檔名。">LoRA</div>
                                    <datalist id="img-cfd-lora-list"></datalist>
                                    <div id="img-cfd-loras"></div>
                                    <button class="set-btn" id="img-cfd-add-lora" type="button" style="margin-top:6px;"><i class="fa-solid fa-plus"></i> 加 LoRA</button>
                                </div>
                                <div class="set-group">
                                    <div class="set-label" title="只在「場景插圖」自動套用，頭像不套；會變慢。"><i class="fa-solid fa-image"></i> 場景插圖品質${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1777') : ''}</div>
                                    <div class="cfd-scene-row">
                                        <label class="cfd-scene-chk">
                                            <input type="checkbox" id="img-cfd-scene-hires" ${imgConfig.comfyuiDirect?.sceneHires !== false ? 'checked' : ''}><i class="fa-solid fa-microscope"></i> 高清修復
                                        </label>
                                        <select class="set-select cfd-scene-scale" id="img-cfd-scene-hires-scale">
                                            <option value="1.5" ${String(imgConfig.comfyuiDirect?.sceneHiresScale ?? 1.5)==='1.5'?'selected':''}>1.5x</option>
                                            <option value="2" ${String(imgConfig.comfyuiDirect?.sceneHiresScale)==='2'?'selected':''}>2x</option>
                                        </select>
                                        <label class="cfd-scene-chk">
                                            <input type="checkbox" id="img-cfd-scene-facedetailer" ${imgConfig.comfyuiDirect?.sceneFaceDetailer !== false ? 'checked' : ''}><i class="fa-solid fa-bullseye"></i> FaceDetailer 修臉
                                        </label>
                                    </div>
                                </div>
                                <div class="iface-section-title"><i class="fa-solid fa-pen-to-square"></i> 提示詞（底詞）</div>
                                <div class="set-group">
                                    <div class="field-row">
                                        <div class="set-label" title="選填，可空。">底詞</div>
                                        <textarea class="set-textarea" id="img-cfd-base">${_capiEsc(imgConfig.comfyuiDirect?.basePrompt || '')}</textarea>
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label" title="選填。">負面提示詞</div>
                                        <textarea class="set-textarea" id="img-cfd-neg">${_capiEsc(imgConfig.comfyuiDirect?.negPrompt || '')}</textarea>
                                    </div>
                                </div>
                                <div class="iface-section-title"><i class="fa-solid fa-gear"></i> 進階：自訂工作流</div>
                                <div class="set-group">
                                    <div class="set-label" title="想用自己的工作流再開，否則不用碰。">工作流模式${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1809') : ''}</div>
                                    <select class="set-select" id="img-cfd-wfmode">
                                        <option value="auto" ${(imgConfig.comfyuiDirect?.workflowMode||'auto')!=='custom'?'selected':''}>自動（推薦，用上面的設定就好）</option>
                                        <option value="custom" ${imgConfig.comfyuiDirect?.workflowMode==='custom'?'selected':''}>自訂（貼自己的工作流）</option>
                                    </select>
                                    <div id="img-cfd-custom-wf" class="${imgConfig.comfyuiDirect?.workflowMode==='custom'?'':'hidden'}" style="margin-top:8px;">
                                        <textarea class="set-textarea" id="img-cfd-custom-wf-text" style="min-height:120px; font-family:monospace; font-size:11px; white-space:pre;" placeholder='貼 ComfyUI「API 格式」工作流，例如 { "3": {...}, "4": {...} }'>${_capiEsc(imgConfig.comfyuiDirect?.customWorkflow || '')}</textarea>
                                        <div class="set-desc" style="margin-top:4px;" title="貼 ComfyUI API 格式工作流（設定開 Dev mode → Save (API Format) 匯出）。只有這幾個變數會被注入，其餘（LoRA、採樣器、放大、修臉…）請寫死在工作流裡；上面的 LoRA/參數欄在自訂模式不生效。">
                                            可用變數：<code>"%prompt%"</code>　<code>"%negative%"</code>　<code>"%model%"</code>　<code>"%seed%"</code>　<code>"%width%"</code>　<code>"%height%"</code>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div id="img-group-tavernsd" class="${((imgConfig.serviceInanimate || imgConfig.service) === 'tavern_sd' || (imgConfig.serviceChar || imgConfig.serviceLiving || imgConfig.service) === 'tavern_sd' || (imgConfig.serviceScene || imgConfig.serviceLiving || imgConfig.service) === 'tavern_sd') ? '' : 'hidden'}">
                                <div class="iface-section-title is-first"><i class="fa-solid fa-plug"></i> 連線設定${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_tavern_sd') : ''}</div>
                                <div class="set-group">
                                    <div class="field-row">
                                        <div class="set-label">酒館那邊用的</div>
                                        <div class="img-tavern-src" id="img-tavern-src"></div>
                                    </div>
                                </div>
                            </div>


                            <div id="img-group-customapi" class="${[(imgConfig.serviceInanimate || imgConfig.service), (imgConfig.serviceChar || imgConfig.serviceLiving || imgConfig.service), (imgConfig.serviceScene || imgConfig.serviceLiving || imgConfig.service), (imgConfig.serviceMap || imgConfig.serviceInanimate || imgConfig.service)].includes('custom_api') ? '' : 'hidden'}">
                                <div class="iface-section-title is-first"><i class="fa-solid fa-plug"></i> 連線設定</div>
                                <div class="set-group">
                                    <div class="field-row">
                                        <div class="set-label" title="位址、Key、模型三格存成一個節點，換站時下拉選一下就整組換過去。">節點</div>
                                        <div class="capi-pack-row img-node-row">
                                            <select class="set-select" id="img-capi-node">${_imgNodeOptionsHTML('capi', { url: imgConfig.customApi?.url || '', apiKey: imgConfig.customApi?.apiKey || '', model: imgConfig.customApi?.model || '', refImages: _nodeVal(imgConfig.customApi?.refImages) })}</select>
                                            <button class="set-btn" id="img-capi-node-save" type="button" title="把下面位址、Key、模型三格存成一個節點" aria-label="存成節點"><i class="fa-solid fa-floppy-disk"></i><span class="img-node-btn-text"> 存成節點</span></button>
                                            <button class="set-btn" id="img-capi-node-del" type="button" title="刪掉選中的節點（下面的格子不會動）"><i class="fa-solid fa-trash"></i></button>
                                        </div>
                                        <div class="set-desc" id="img-capi-node-status"></div>
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label" title="站方給的那條位址，通常以 /v1 結尾。整條貼進來也可以。">接口位址${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_capi_url') : ''} <span class="lbl-req">(必填)</span></div>
                                        <input class="set-input" id="img-capi-url" type="text" placeholder="https://……/v1" value="${(imgConfig.customApi?.url || '').replace(/"/g,'&quot;')}">
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label">Key</div>
                                        <input class="set-input" id="img-capi-key" type="password" placeholder="站方給你的那把" value="${_capiEsc(imgConfig.customApi?.apiKey || '')}">
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label" title="照站方寫的型號名一字不差地填。每個站支援的型號都不一樣，所以這裡不給清單。網址帶 /sdapi 的站不用填，它自己決定。">模型</div>
                                        <input class="set-input" id="img-capi-model" type="text" placeholder="例：nano-banana-2" value="${(imgConfig.customApi?.model || '').replace(/"/g,'&quot;')}">
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label" title="只有支援分檔的型號會照這個送，其他站一律不送、由站方自己決定。">畫質</div>
                                        <select class="set-select" id="img-capi-quality">
                                            <option value="low" ${(imgConfig.customApi?.quality || 'medium') === 'low' ? 'selected' : ''}>低</option>
                                            <option value="medium" ${(imgConfig.customApi?.quality || 'medium') === 'medium' ? 'selected' : ''}>中</option>
                                            <option value="high" ${(imgConfig.customApi?.quality || 'medium') === 'high' ? 'selected' : ''}>高</option>
                                        </select>
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label"><span><i class="fa-solid fa-images"></i> 帶參考圖${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1878') : ''}</span><label class="toggle-switch"><input type="checkbox" id="img-capi-ref" ${_nodeVal(imgConfig.customApi?.refImages) ? 'checked' : ''}><span class="slider"></span></label></div>
                                    </div>
                                    <div class="field-row">
                                        <button class="set-btn" id="img-capi-test" type="button"><i class="fa-solid fa-plug"></i> 測試</button>
                                        <div class="set-desc" id="img-capi-status"></div>
                                    </div>
                                </div>
                                <!-- 🎨 我的畫風：2026-11-17 從「畫風」頁搬來。只有選了自訂接口的地方才用得到（NAI、ComfyUI 的長相在它們自己的預設包裡） -->
                                <div class="set-group" id="img-style-list-block">
                                    <div class="set-label"><i class="fa-solid fa-palette"></i> 我的畫風${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_img_styles') : ''}</div>
                                    <div id="img-style-list" class="img-style-list"></div>
                                    <button class="set-btn" type="button" id="img-style-add" onclick="window._imgStyle && window._imgStyle.add()"><i class="fa-solid fa-plus"></i> 新增畫風</button>
                                </div>
                            </div>

                            <div id="img-group-nai" class="${((imgConfig.serviceInanimate || imgConfig.service) === 'novelai' || (imgConfig.serviceChar || imgConfig.serviceLiving || imgConfig.service) === 'novelai' || (imgConfig.serviceScene || imgConfig.serviceLiving || imgConfig.service) === 'novelai') ? '' : 'hidden'}">
                                <div class="iface-section-title is-first"><i class="fa-solid fa-plug"></i> 連線設定</div>
                                <div class="set-group">
                                    <div class="field-row">
                                        <div class="set-label" title="網址和 Token 存成一個節點，換站時下拉選一下就整組換過去。">節點</div>
                                        <div class="capi-pack-row img-node-row">
                                            <select class="set-select" id="img-nai-node">${_imgNodeOptionsHTML('nai', { url: imgConfig.novelai.url || '', token: imgConfig.novelai.token || '' })}</select>
                                            <button class="set-btn" id="img-nai-node-save" type="button" title="把下面網址和 Token 存成一個節點" aria-label="存成節點"><i class="fa-solid fa-floppy-disk"></i><span class="img-node-btn-text"> 存成節點</span></button>
                                            <button class="set-btn" id="img-nai-node-del" type="button" title="刪掉選中的節點（下面的格子不會動）"><i class="fa-solid fa-trash"></i></button>
                                        </div>
                                        <div class="set-desc" id="img-nai-node-status"></div>
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label" title="用 NovelAI 官方就不用改。換成 NovelAI 同款的站，貼站方給的位址，只給到 /api/novelai 也可以。">網址</div>
                                        <input class="set-input" id="img-nai-url" type="text" placeholder="https://image.novelai.net" value="${_capiEsc(imgConfig.novelai.url || '')}">
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label">Token <span class="lbl-req">(必填)</span></div>
                                        <input class="set-input" id="img-nai-token" type="password" placeholder="pst-..." value="${_capiEsc(imgConfig.novelai.token)}">
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label" title="開啟＝NAI 生圖超過 1024×1024（Opus 免 Anlas 上限）自動等比縮回，防誤設大圖扣點數。想花 Anlas 出大圖再關。"><span><i class="fa-solid fa-shield-halved"></i> 防超免費尺寸${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_1919') : ''}</span><label class="toggle-switch"><input type="checkbox" id="img-nai-cap-free" ${imgConfig.novelai.capFreeSize !== false ? 'checked' : ''}><span class="slider"></span></label></div>
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label">模型版本</div>
                                        <select class="set-select" id="img-nai-model">
                                            <option value="nai-diffusion-3" ${imgConfig.novelai.model === 'nai-diffusion-3' ? 'selected' : ''}>V3 Anime（最省 Anlas）</option>
                                            <option value="nai-diffusion-4-curated-preview" ${imgConfig.novelai.model === 'nai-diffusion-4-curated-preview' ? 'selected' : ''}>V4 Curated（動漫精選）</option>
                                            <option value="nai-diffusion-4-full" ${imgConfig.novelai.model === 'nai-diffusion-4-full' ? 'selected' : ''}>V4 Full（開放風格）</option>
                                            <option value="nai-diffusion-4-5-full" ${imgConfig.novelai.model === 'nai-diffusion-4-5-full' ? 'selected' : ''}>V4.5 Full（最新/寫實佳）</option>
                                        </select>
                                    </div>
                                    <div class="nai-adv">
                                        <div class="nai-adv-head" onclick="this.closest('.nai-adv').classList.toggle('open')">
                                            <span title="不懂可不動，預設跟官方一致。"><i class="fa-solid fa-gear"></i> 進階參數</span>
                                            <span class="nai-adv-arrow"></span>
                                        </div>
                                        <div class="nai-adv-body">
                                            <div class="field-grid-2">
                                                <div>
                                                    <div class="set-label">Sampler</div>
                                                    <select class="set-select" id="img-nai-sampler">
                                                        <option value="k_euler_ancestral" ${(imgConfig.novelai.sampler||'k_euler_ancestral')==='k_euler_ancestral'?'selected':''}>k_euler_ancestral（預設）</option>
                                                        <option value="k_euler" ${imgConfig.novelai.sampler==='k_euler'?'selected':''}>k_euler</option>
                                                        <option value="k_dpmpp_2m" ${imgConfig.novelai.sampler==='k_dpmpp_2m'?'selected':''}>k_dpmpp_2m（V4.5 推薦）</option>
                                                        <option value="k_dpmpp_2s_ancestral" ${imgConfig.novelai.sampler==='k_dpmpp_2s_ancestral'?'selected':''}>k_dpmpp_2s_ancestral</option>
                                                        <option value="k_dpmpp_sde" ${imgConfig.novelai.sampler==='k_dpmpp_sde'?'selected':''}>k_dpmpp_sde</option>
                                                        <option value="k_dpmpp_2m_sde" ${imgConfig.novelai.sampler==='k_dpmpp_2m_sde'?'selected':''}>k_dpmpp_2m_sde（底板C）</option>
                                                        <option value="ddim_v3" ${imgConfig.novelai.sampler==='ddim_v3'?'selected':''}>ddim_v3（V4 限定）</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <div class="set-label" title="建議 4~9。">CFG Scale</div>
                                                    <input class="set-input" type="number" id="img-nai-scale" min="1" max="20" step="0.5" value="${_capiEsc(imgConfig.novelai.scale ?? 5)}">
                                                </div>
                                                <div>
                                                    <div class="set-label" title="建議 28~40。">Steps</div>
                                                    <input class="set-input" type="number" id="img-nai-steps" min="1" max="50" step="1" value="${_capiEsc(imgConfig.novelai.steps ?? 28)}">
                                                </div>
                                                <div>
                                                    <div class="set-label" title="負詞預設。">UC Preset</div>
                                                    <select class="set-select" id="img-nai-uc-preset">
                                                        <option value="0" ${(imgConfig.novelai.ucPreset??1)===0?'selected':''}>0 - 輕量</option>
                                                        <option value="1" ${(imgConfig.novelai.ucPreset??1)===1?'selected':''}>1 - 標準（推薦）</option>
                                                        <option value="2" ${(imgConfig.novelai.ucPreset??1)===2?'selected':''}>2 - 人形強化</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div class="nai-adv-checks">
                                                <label>
                                                    <input type="checkbox" id="img-nai-quality-toggle" ${imgConfig.novelai.qualityToggle!==false?'checked':''}>
                                                    <span class="chk-label">Quality Toggle</span>
                                                </label>
                                                <label id="img-nai-smea-group" class="nai-smea-toggle${imgConfig.novelai.model==='nai-diffusion-3'?'':' is-disabled'}" title="V3 專屬。">
                                                    <input type="checkbox" id="img-nai-smea" ${imgConfig.novelai.smea!==false?'checked':''}>
                                                    <span class="chk-label">SMEA</span>
                                                </label>
                                                <label id="img-nai-smea-dyn-group" class="nai-smea-toggle${imgConfig.novelai.model==='nai-diffusion-3'?'':' is-disabled'}">
                                                    <input type="checkbox" id="img-nai-smea-dyn" ${imgConfig.novelai.smeaDyn?'checked':''}>
                                                    <span class="chk-label">SMEA Dynamic</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="iface-section-title"><i class="fa-solid fa-pen-to-square"></i> 提示詞（底詞）</div>
                                <div class="set-group">
                                    <div class="nai-preset-box">
                                        <div class="nai-preset-head">
                                            <div class="set-label" title="含底詞、負詞、Sampler、Scale。"><i class="fa-solid fa-clipboard"></i> 提示詞預設</div>
                                        </div>
                                        <div class="row-inline">
                                            <select id="img-nai-preset-sel" class="set-select">
                                                <option value="">-- 選擇預設 --</option>
                                                ${(imgConfig.novelai.naiPresets || []).map((p, i) => `<option value="${i}">${_capiEsc(p.name)}</option>`).join('')}
                                            </select>
                                            <span class="nai-mini-btn" onclick="window._naiPreset.apply()">套用</span>
                                            <span class="nai-mini-btn" onclick="window._naiPreset.save()">另存</span>
                                            <span class="nai-mini-btn is-danger" onclick="window._naiPreset.del()">刪除</span>
                                        </div>
                                        <div class="row-inline nai-pack-open-row">
                                            <span class="nai-pack-open-btn" onclick="window._naiPreset.open()"><i class="fa-solid fa-box"></i> 拖圖生預設・看預覽圖</span>
                                        </div>
                                        <div id="img-nai-preset-name-row" class="nai-preset-name-row">
                                            <div class="row-inline">
                                                <input id="img-nai-preset-name-input" class="set-input" placeholder="輸入預設名稱（如：底板A - ge_tianzun）">
                                                <span class="nai-mini-btn" onclick="window._naiPreset.confirmSave()">確認</span>
                                                <span class="nai-mini-btn is-ghost" onclick="window._naiPreset.cancelSave()">取消</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 📦 NAI 拖圖預設包 modal 已移到本檔最外層（見 set-footer 前）：
                                         🚨 它是 position:fixed 的滿版遮罩，但 .set-group 有 backdrop-filter ——
                                         backdrop-filter 跟 transform 一樣會給子孫的 fixed 建立包含塊，
                                         放在 set-group 裡會讓整個 modal 縮到那一格設定的框裡（畫面上就是「被鎖在小窗」、右半截被裁掉）。 -->

                                    <div class="field-row">
                                        <div class="set-label" title="Danbooru tag 格式，逗號分隔。"><i class="fa-solid fa-palette"></i> 角色底詞</div>
                                        <textarea class="set-textarea" id="img-nai-char-base">${_capiEsc(imgConfig.novelai.charBasePrompt || '')}</textarea>
                                        <div class="field-reset"><span onclick="document.getElementById('img-nai-char-base').value='masterpiece, best quality, very aesthetic, absurdres, anime style, detailed face'">[重置]</span></div>
                                    </div>
                                    <div class="field-row">
                                        <div class="set-label"><i class="fa-solid fa-ban"></i> 角色負詞</div>
                                        <textarea class="set-textarea" id="img-nai-char-neg">${_capiEsc(imgConfig.novelai.charNegPrompt || '')}</textarea>
                                        <div class="field-reset"><span onclick="document.getElementById('img-nai-char-neg').value='nsfw, lowres, bad anatomy, bad hands, extra fingers, missing fingers, worst quality, low quality, jpeg artifacts, signature, watermark, blurry'">[重置]</span></div>
                                    </div>
                                    <div id="img-nai-item-block" class="nai-item-stack">
                                        <div class="field-row">
                                            <div class="set-label"><i class="fa-solid fa-box"></i> 物品底詞</div>
                                            <textarea class="set-textarea" id="img-nai-item-base">${_capiEsc(imgConfig.novelai.itemBasePrompt || '')}</textarea>
                                            <div class="field-reset"><span onclick="document.getElementById('img-nai-item-base').value='masterpiece, best quality, white background, simple background, no background, product image, detailed'">[重置]</span></div>
                                        </div>
                                        <div class="field-row">
                                            <div class="set-label"><i class="fa-solid fa-ban"></i> 物品負詞</div>
                                            <textarea class="set-textarea" id="img-nai-item-neg">${_capiEsc(imgConfig.novelai.itemNegPrompt || '')}</textarea>
                                            <div class="field-reset"><span onclick="document.getElementById('img-nai-item-neg').value='person, human, character, body, face, hands, worst quality, low quality, blurry, watermark, text'">[重置]</span></div>
                                        </div>
                                    </div>
                                </div>

                                <div class="iface-section-title"><i class="fa-solid fa-palette"></i> 氛圍轉印（Vibe Transfer）</div>
                                <div class="set-group">
                                    <div id="img-nai-vibe-drop" class="nai-vibe-drop">
                                        <div class="nai-pack-drop-hint">把 NovelAI 匯出的 <b>.naiv4vibe</b> 檔拖進來（或點這裡選檔）<br>生圖就會帶上那張參考圖的色調氛圍，可同時掛多個</div>
                                        <input type="file" id="img-nai-vibe-file" class="nai-pack-file-hidden" accept=".naiv4vibe,.naiv4vibebundle,.json" multiple>
                                    </div>
                                    <div id="img-nai-vibe-status" class="nai-pack-status"></div>
                                    <div id="img-nai-vibe-list" class="nai-vibe-list"></div>
                                    <div class="row-inline nai-vibe-scope-row">
                                        <span class="set-label">套用到：</span>
                                        <label class="nai-smea-toggle"><input type="checkbox" id="img-nai-vibe-sc-char" ${imgConfig.novelai.vibeScope?.char === true ? 'checked' : ''}><span class="chk-label">頭像</span></label>
                                        <label class="nai-smea-toggle"><input type="checkbox" id="img-nai-vibe-sc-scene" ${imgConfig.novelai.vibeScope?.scene !== false ? 'checked' : ''}><span class="chk-label">插圖</span></label>
                                        <label class="nai-smea-toggle"><input type="checkbox" id="img-nai-vibe-sc-bg" ${imgConfig.novelai.vibeScope?.bg !== false ? 'checked' : ''}><span class="chk-label">背景・其他</span></label>
                                    </div>
                                    <div class="field-hint">強度越高畫面越靠向參考圖的氛圍，太高會蓋過劇情描述（NovelAI 預設 0.6）。只有 V4 系列模型吃得到；vibe 檔是按模型算的，跟上面選的模型對不上會自動跳過。用現成 vibe 檔生圖不扣 Anlas，但同時開超過 4 顆、第 5 顆起每張圖扣 2 → 「防超免費尺寸」開著時自動只用前 4 顆。</div>
                                </div>
                            </div>
                        </div>


                        </div><!-- /view-img-api -->
                        <div id="view-img-avatar" class="img-subtab-view" style="display:none;">
                            <!-- 內層子 tab：頭像快取 vs 角色立繪；最後一顆「角色中心」是開窗口，不是切分頁 -->
                            <div style="display:flex;gap:6px;padding:0 0 10px;border-bottom:1px solid rgba(var(--os-ink-rgb), 0.06);margin-bottom:10px;">
                                <div class="av-sub active" data-avsub="cache"  style="cursor:pointer;padding:4px 10px;font-size:12px;color:var(--os-ink);border:1px solid rgba(var(--os-ink-rgb), 0.25);border-radius:4px;background:rgba(var(--os-ink-rgb), 0.06);" onclick="_switchAvatarSub(this,'cache')"><i class="fa-solid fa-box"></i> 頭像快取</div>
                                <div class="av-sub"        data-avsub="sprite" style="cursor:pointer;padding:4px 10px;font-size:12px;color:rgba(var(--os-ink-rgb), 0.72);border:1px solid rgba(var(--os-ink-rgb), 0.25);border-radius:4px;"                              onclick="_switchAvatarSub(this,'sprite')"><i class="fa-solid fa-palette"></i> 角色立繪</div>
                                <button class="acg-open-chip" type="button" onclick="var G=window.OS_CHAR_GALLERY||(window.parent&&window.parent.OS_CHAR_GALLERY);if(G)G.open(null,{from:this});"><i class="fa-solid fa-address-book"></i><span>角色中心</span></button>
                            </div>

                            <!-- 子: 頭像快取 -->
                            <div id="avatar-sub-cache" class="avatar-sub-view">
                                <div class="set-group">
                                    <div class="set-label" title="防重複生圖。"><i class="fa-solid fa-masks-theater"></i> 角色頭像快取${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2188') : ''}</div>
                                    <div id="vncfg-avatar-mgr-list" style="margin-top:8px;"></div>
                                    <button class="set-btn" type="button" onclick="window.VN_PLAYER && window.VN_PLAYER.backupAvatarsToWorldbook && window.VN_PLAYER.backupAvatarsToWorldbook(this)"><i class="fa-solid fa-floppy-disk"></i> 備份頭像到角色世界書</button>
                                </div>
                            </div>

                            <!-- 子: 角色立繪（去背工作室）-->
                            <div id="avatar-sub-sprite" class="avatar-sub-view" style="display:none;">
                                <div class="set-group">
                                    <div class="set-label" title="點角色 → 生立繪 → 去背 → 存。只顯示當前世界。"><i class="fa-solid fa-palette"></i> 從頭像快取轉立繪</div>

                                    <div id="sprite-picker-list" style="margin-top:10px;max-height:300px;overflow-y:auto;">載入中...</div>

                                    <div id="sprite-sel-bar" class="vng-studio-sel" style="display:none;">
                                        <div class="vng-studio-sel-name" id="sprite-selected-info">尚未選擇角色</div>
                                        <textarea id="sprite-sel-prompt" class="vng-studio-prompt" placeholder="立繪 prompt（已清洗，可微調）"></textarea>
                                        <div class="vng-studio-sel-row">
                                            <select id="sprite-base-size" class="set-select" style="width:auto;flex:0 0 auto;min-width:0;" title="立繪比例：鎧甲/壯角色選寬一點、瘦角色窄的就夠；都在 NAI 免費尺寸內">
                                                <option value="512x896">512×896（窄·瘦）</option>
                                                <option value="640x896">640×896（標準）</option>
                                                <option value="704x896">704×896（寬·鎧甲）</option>
                                                <option value="768x896">768×896（超寬·厚甲）</option>
                                            </select>
                                            <select id="sprite-upscale-ratio" class="set-select" style="width:auto;flex:0 0 auto;min-width:0;" title="立繪精緻度：直接用大解析度生，治小模型的糊。立繪一次性存檔，不怕慢。">
                                                <option value="1">標準 1x（512×896）</option>
                                                <option value="1.5" selected>精緻 1.5x（768×1344）</option>
                                                <option value="2">高清 2x（1024×1792）</option>
                                            </select>
                                            <label id="sprite-hires-row" style="display:none;align-items:center;gap:4px;font-size:11px;color:var(--os-ink);white-space:nowrap;cursor:pointer;" title="ComfyUI 直連專屬：base 生完→潛空間放大→二次低重繪採樣，真的補出細節（比單純放大清晰）。較慢。">
                                                <input type="checkbox" id="sprite-hires" style="margin:0;"><i class="fa-solid fa-microscope"></i> 高清修復
                                            </label>
                                            <button class="vng-studio-gen" id="sprite-gen-btn"><i class="fa-solid fa-wand-magic-sparkles"></i> 生立繪</button>
                                            <details class="vng-studio-tpl">
                                                <summary title="立繪 prompt 的前綴與後綴。"><i class="fa-solid fa-scroll"></i> Prompt 模板</summary>
                                                <div class="set-label" style="margin-top:8px;font-size:11px;">前綴</div>
                                                <textarea class="set-input" id="sprite-tpl-prefix" style="margin-top:4px;min-height:48px;font-family:inherit;font-size:12px;"></textarea>
                                                <div class="set-label" style="margin-top:8px;font-size:11px;">後綴</div>
                                                <textarea class="set-input" id="sprite-tpl-suffix" style="margin-top:4px;min-height:48px;font-family:inherit;font-size:12px;"></textarea>
                                                <div class="set-label" style="margin-top:8px;font-size:11px;">負詞</div>
                                                <textarea class="set-input" id="sprite-tpl-neg" style="margin-top:4px;min-height:48px;font-family:inherit;font-size:12px;" placeholder="不想要的東西，逗號分隔（例：shadow, dramatic lighting）"></textarea>
                                                <button class="btn-test" id="sprite-tpl-reset" style="margin-top:6px;padding:4px 10px;font-size:11px;">↻ 還原預設</button>
                                            </details>
                                        </div>
                                    </div>

                                    <div id="sprite-preview" class="vng-studio-preview"><span style="color:var(--os-ink-soft);font-size:11px;">生立繪後在這裡預覽、去背</span></div>

                                    <div class="vng-studio-bar">
                                        <button class="vng-studio-act" id="sprite-removebg-canvas-btn" style="opacity:0.5;pointer-events:none;"><i class="fa-solid fa-scissors"></i> 純色去背</button>
                                        <button class="vng-studio-act" id="sprite-removebg-btn" style="opacity:0.5;pointer-events:none;"><i class="fa-solid fa-wand-magic-sparkles"></i> AI 去背</button>
                                        <button class="vng-studio-act primary" id="sprite-save-btn" style="opacity:0.5;pointer-events:none;"><i class="fa-solid fa-floppy-disk"></i> 存立繪</button>
                                    </div>
                                    <div class="vng-studio-strength">
                                        <span>純色去背強度</span>
                                        <input type="range" id="sprite-bg-strength" min="0" max="100" value="50" class="set-slider">
                                        <span class="vng-studio-hint">背景有漸層調高</span>
                                    </div>
                                    <div id="sprite-status" class="vng-studio-status"></div>
                                </div>

                                <div class="set-group" style="margin-top:14px;">
                                    <div class="set-label"><i class="fa-solid fa-book"></i> 已存立繪${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2250') : ''}</div>
                                    <div id="sprite-list" style="margin-top:8px;">載入中...</div>
                                </div>

                            </div>
                        </div>
                        <div id="view-img-bg" class="img-subtab-view" style="display:none;">
                            <div class="set-group">
                                <div class="set-label" title="防重複生圖。"><i class="fa-solid fa-mountain-sun"></i> 場景背景快取</div>
                                <div id="vncfg-bg-mgr-list" style="margin-top:8px;"></div>
                            </div>
                        </div>
                        <div id="view-img-scene" class="img-subtab-view" style="display:none;">
                            <div class="set-group">
                                <div class="set-label" title="劇情全螢幕 CG；「⋯」可看大圖 / 編輯重生 / 刪除。提示詞在「⋯ → 編輯重生」裡查看與修改。"><i class="fa-solid fa-clapperboard"></i> 場景插圖快取</div>
                                <div id="vncfg-scene-mgr-list" style="margin-top:8px;"></div>
                            </div>
                        </div>
                    </div>

                    <div id="view-voice" class="tab-view hidden">

                        <!-- 🎙 她講話 → 變成字（OS_VOICE_INPUT）。跟下面「角色說話的聲音」是兩件事，選單在 wireChannels 的 paintVoice 畫 -->
                        <div class="set-group" id="voice-engine-group">
                            <div class="set-label"><i class="fa-solid fa-microphone"></i> 語音轉文字${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2272') : ''}</div>
                            <div id="voice-engine-box"></div>
                        </div>

                        <div class="set-group">
                            <div class="vcast-master-row">
                                <div class="set-label"><i class="fa-solid fa-volume-high"></i> 角色說話的聲音${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_vc_master') : ''}</div>
                                <label class="toggle-switch"><input type="checkbox" id="vcast-on" ${voiceCast.on ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                        </div>

                        <div class="api-subtab-row">
                            <div class="api-subtab vcast-subtab" data-vctab="cast">角色配音</div>
                            <div class="api-subtab vcast-subtab" data-vctab="cloud">雲端</div>
                            <div class="api-subtab vcast-subtab" data-vctab="local">本機</div>
                        </div>

                        <!-- 角色配音：誰用哪個聲音、沒在名單上的人怎麼辦、旁白與系統音 -->
                        <div id="vcview-cast" class="vcast-subview">
                            <div class="set-group">
                                <div class="set-label"><i class="fa-solid fa-masks-theater"></i> 角色配音${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2349') : ''}</div>
                                <div id="vcast-cast-list" class="vcast-cast-list"></div>
                                <div class="btn-test" id="vcast-add-btn"><i class="fa-solid fa-plus"></i> 加角色</div>
                            </div>
                            <div class="set-group">
                                <div class="set-label"><i class="fa-solid fa-users"></i> 沒在名單上的人${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_vc_others') : ''}</div>
                                <div class="vcast-seg" id="vcast-others">
                                    <div data-v="local" class="${voiceCast.others === 'local' ? 'active' : ''}">本機念</div>
                                    <div data-v="none" class="${voiceCast.others === 'none' ? 'active' : ''}">不念</div>
                                </div>
                            </div>
                            <!-- 旁白·系統（vn_tts_panel 注入；旁白與系統音預設都關） -->
                            <div id="vn-narr-inline-root" class="vcast-narr-root"></div>
                        </div>

                        <!-- 雲端：每一家一個小分頁，放金鑰、抓自己的聲音、試聽 -->
                        <div id="vcview-cloud" class="vcast-subview">
                            <div class="vcast-seg vcast-cloud-seg">
                                <div data-vccloud="minimax">Minimax</div>
                                <div data-vccloud="elevenlabs">ElevenLabs</div>
                            </div>

                            <div id="vccloud-minimax" class="vcast-cloudview">


                        <!-- mm-enabled 跟著上面的總開關（保存時寫回 os_minimax_config.enabled） -->
                        <input type="checkbox" id="mm-enabled" hidden ${voiceCast.on ? 'checked' : ''}>

                        <div class="set-group">
                            <div class="set-label">服務區域</div>
                            <select class="set-select" id="mm-provider">
                                <option value="cn" ${minimaxConfig.provider === 'cn' ? 'selected' : ''}>🇨🇳 國內版 (api.minimaxi.com)</option>
                                <option value="io" ${minimaxConfig.provider === 'io' ? 'selected' : ''}>海外版 (api.minimax.io)</option>
                            </select>
                        </div>

                        <div class="set-group">
                            <div class="set-label">Group ID <span style="font-size:11px; color:#fc8181;">(必填)</span>${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2308') : ''}</div>
                            <input class="set-input" id="mm-group-id" type="text" placeholder="請輸入 Minimax Group ID..." value="${_capiEsc(minimaxConfig.groupId || '')}">
                        </div>

                        <div class="set-group">
                            <div class="set-label">API Key <span style="font-size:11px; color:#fc8181;">(必填)</span></div>
                            <input class="set-input" id="mm-api-key" type="password" placeholder="請輸入 Minimax API Key..." value="${_capiEsc(minimaxConfig.apiKey || '')}">
                        </div>

                        <div class="set-group">
                            <div class="set-label">語音模型</div>
                            <select class="set-select" id="mm-speech-model">
                                <option value="speech-2.8-hd"    ${minimaxConfig.speechModel === 'speech-2.8-hd'    ? 'selected' : ''}>speech-2.8-hd (支援語氣詞)</option>
                                <option value="speech-2.8-turbo" ${minimaxConfig.speechModel === 'speech-2.8-turbo' ? 'selected' : ''}>speech-2.8-turbo (支援語氣詞)</option>
                                <option value="speech-2.6-hd"    ${minimaxConfig.speechModel === 'speech-2.6-hd'    ? 'selected' : ''}>speech-2.6-hd</option>
                                <option value="speech-2.6-turbo" ${minimaxConfig.speechModel === 'speech-2.6-turbo' ? 'selected' : ''}>speech-2.6-turbo</option>
                                <option value="speech-02-hd"     ${minimaxConfig.speechModel === 'speech-02-hd'     ? 'selected' : ''}>speech-02-hd</option>
                                <option value="speech-02-turbo"  ${minimaxConfig.speechModel === 'speech-02-turbo'  ? 'selected' : ''}>speech-02-turbo (預設)</option>
                                <option value="speech-01-turbo"  ${minimaxConfig.speechModel === 'speech-01-turbo'  ? 'selected' : ''}>speech-01-turbo</option>
                            </select>
                        </div>

                        <div class="set-group">
                            <div class="set-slider-container">
                                <div class="set-label"><span>預設語速</span><span class="set-slider-val" id="mm-speed-val">${(minimaxConfig.defaultSpeed ?? 1.0).toFixed(1)}</span></div>
                                <input type="range" min="0.5" max="2" step="0.1" value="${_capiEsc(minimaxConfig.defaultSpeed ?? 1.0)}" class="set-slider" id="mm-speed">
                            </div>
                            <div style="margin-top:15px;">
                                <div class="set-label">語言增強</div>
                                <select class="set-select" id="mm-lang-boost">
                                    <option value=""          ${ !minimaxConfig.defaultLanguageBoost          ? 'selected' : ''}>無（自動判斷）</option>
                                    <option value="auto"      ${minimaxConfig.defaultLanguageBoost==='auto'      ? 'selected' : ''}>自動判斷</option>
                                    <option value="Chinese"   ${minimaxConfig.defaultLanguageBoost==='Chinese'   ? 'selected' : ''}>中文普通話</option>
                                    <option value="Cantonese" ${minimaxConfig.defaultLanguageBoost==='Cantonese' ? 'selected' : ''}>粵語</option>
                                    <option value="Japanese"  ${minimaxConfig.defaultLanguageBoost==='Japanese'  ? 'selected' : ''}>日文</option>
                                    <option value="English"   ${minimaxConfig.defaultLanguageBoost==='English'   ? 'selected' : ''}>英文</option>
                                </select>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label"><i class="fa-solid fa-user-astronaut"></i> 我的聲音${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_mm_mine') : ''}</div>
                            <div id="mm-mine-list" class="vcast-voice-list"></div>
                            <div class="vcast-row">
                                <div class="btn-test vcast-grow" id="mm-mine-btn"><i class="fa-solid fa-rotate"></i> 抓我的聲音</div>
                                <div class="btn-test vcast-grow" id="mm-browse-voices-btn"><i class="fa-solid fa-magnifying-glass"></i> 瀏覽官方音色庫</div>
                            </div>
                            <div class="vcast-result" id="mm-mine-result"></div>
                        </div>

                        <div id="mm-voice-modal" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(26,13,10,0.85); align-items:center; justify-content:center;">
                            <div style="background:rgba(var(--os-tint-rgb), 0.97); border:1px solid rgba(var(--os-ink-rgb), 0.20); border-radius:8px; padding:16px; width:92%; max-width:480px; max-height:calc(100% - 24px); display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.6);">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                    <div style="font-weight:bold; color:var(--os-ink); font-size:14px;"><i class="fa-solid fa-music"></i> 官方音色庫 <span id="mm-voice-count" style="font-size:11px; color:rgba(var(--os-ink-rgb), 0.72); font-weight:normal;"></span></div>
                                    <span id="mm-voice-modal-close" style="cursor:pointer; color:var(--os-ink); font-size:20px; line-height:1; padding:0 4px;">✕</span>
                                </div>
                                <input id="mm-voice-search" class="set-input" placeholder="搜尋 voice_id 或描述..." style="margin-bottom:8px;">
                                <div id="mm-voice-list" style="overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:6px; padding-right:4px;"></div>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label"><i class="fa-solid fa-plug"></i> 測試語音</div>
                            <div style="display:flex; gap:8px; margin-bottom:10px;">
                                <input class="set-input" id="mm-test-voice-id" type="text" placeholder="語音 ID，例如：male-01" style="flex:1;">
                            </div>
                            <input class="set-input" id="mm-test-text" type="text" placeholder="測試文字" value="你好，我是AI語音助手，測試一下。" style="margin-bottom:10px;">
                            <div class="btn-test" id="mm-test-btn"><i class="fa-solid fa-music"></i> 播放測試語音</div>
                            <div class="btn-test" id="mm-stop-btn" style="margin-top:8px; display:none;"><i class="fa-solid fa-stop"></i> 停止播放</div>
                            <div id="mm-test-result" style="display:none; margin-top:10px; background:rgba(var(--os-tint-rgb), 0.90); border-radius:4px; padding:12px; font-size:12px; color:var(--os-ink); font-family:monospace; word-break:break-all;"></div>
                        </div>

                            </div><!-- /vccloud-minimax -->

                            <div id="vccloud-elevenlabs" class="vcast-cloudview">
                                <div class="set-group">
                                    <div class="set-label">金鑰${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_el_key') : ''}</div>
                                    <input class="set-input" id="el-api-key" type="password" autocomplete="off" value="${_vcEsc(elConfig.apiKey)}">
                                    <div class="set-label">模型${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_el_model') : ''}</div>
                                    <select class="set-select" id="el-model">
                                        ${elModels.map(m => `<option value="${_capiEsc(m.id)}" ${elConfig.modelId === m.id ? 'selected' : ''}>${_vcEsc(m.name)}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="set-group">
                                    <div class="set-label"><i class="fa-solid fa-user-astronaut"></i> 我的聲音</div>
                                    <div id="el-voice-list" class="vcast-voice-list"></div>
                                    <div class="btn-test" id="el-fetch-btn"><i class="fa-solid fa-rotate"></i> 抓我的聲音</div>
                                    <div class="vcast-result" id="el-fetch-result"></div>
                                </div>
                                <div class="set-group">
                                    <div class="set-label"><i class="fa-solid fa-plug"></i> 測試語音</div>
                                    <select class="set-select" id="el-test-voice"></select>
                                    <input class="set-input" id="el-test-text" type="text" value="你好，聽得到我的聲音嗎？">
                                    <div class="vcast-row">
                                        <div class="btn-test vcast-grow" id="el-test-btn"><i class="fa-solid fa-play"></i> 播放測試語音</div>
                                        <div class="btn-test vcast-grow vcast-off" id="el-stop-btn"><i class="fa-solid fa-stop"></i> 停止</div>
                                    </div>
                                    <div class="vcast-result" id="el-test-result"></div>
                                </div>
                            </div><!-- /vccloud-elevenlabs -->
                        </div><!-- /vcview-cloud -->

                        <!-- 本機：SoVITS／IndexTTS（vn_tts_panel inline 注入點，第一次切進來才畫） -->
                        <div id="vcview-local" class="vcast-subview">
                            <div id="vn-tts-inline-root"></div>
                        </div>
                    </div>

                    <!-- ── 一般：酒館那兩格 + 素材目錄與章節（由 vn_settings.js 提供） ── -->
                    <div id="view-vn" class="tab-view hidden">
                        <!-- 一般裡面本來四件不相干的事全疊在一頁（酒館面板、素材目錄、上下文、後台），
                             切成小分頁；面板那頁只有酒館有，後台那頁只有手機版有，所以兩顆各自會藏。 -->
                        <div class="api-subtab-row">
                            <div class="api-subtab gen-subtab" data-gentab="panel"${stHide}>面板</div>
                            <div class="api-subtab gen-subtab" data-gentab="asset">素材</div>
                            <div class="api-subtab gen-subtab" data-gentab="ctx">上下文</div>
                            <div class="api-subtab gen-subtab" data-gentab="foreign">外語</div>
                            <div class="api-subtab gen-subtab" data-gentab="back"${!isStandalone ? ' style="display:none"' : ''}>後台</div>
                        </div>

                        <div id="gview-panel" class="gen-subview"${stHide}>
                        <div class="set-group">
                            <div class="set-label"><i class="fa-solid fa-chess-rook"></i> 顯示位置${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2413') : ''}</div>
                            <select class="set-select" id="mp-mount-selector">
                                <option value="#sheld" ${(tavernExt.mount?.selector || '#sheld') === '#sheld' ? 'selected' : ''}>整個對話框（推薦）</option>
                                <option value="#chat" ${(tavernExt.mount?.selector || '#sheld') === '#chat' ? 'selected' : ''}>只在訊息區</option>
                            </select>

                            <div class="set-label" style="margin-top:14px;">高度${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2420') : ''}</div>
                            <div class="mp-height-row">
                                <input class="set-input" type="number" id="mp-panel-height" min="30" max="100" step="5" placeholder="100" value="${_capiEsc(tavernExt.panelHeight ?? '')}">
                                <span class="mp-height-unit">%</span>
                            </div>
                        </div>

                        <div class="set-group">
                            <div class="set-label">
                                <span><i class="fa-solid fa-file-lines"></i> 訊息可收合${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2428') : ''}</span>
                                <label class="toggle-switch"><input type="checkbox" id="mp-message-collapse" ${tavernExt.messageCollapse !== false ? 'checked' : ''}><span class="slider"></span></label>
                            </div>
                        </div>
                        </div><!-- /gview-panel -->

                        <div id="gview-asset" class="gen-subview" style="display:none;">
                        ${window.VN_SETTINGS_PANEL ? window.VN_SETTINGS_PANEL.getAssetHTML() : '<div class="set-desc" style="padding:20px; text-align:center;"><i class="fa-solid fa-triangle-exclamation"></i> vn_settings.js 尚未載入</div>'}
                        </div>

                        <div id="gview-foreign" class="gen-subview" style="display:none;">${(window.parent || window).OS_VN_FOREIGN ? (window.parent || window).OS_VN_FOREIGN.html() : ''}</div>
                        <div id="gview-ctx" class="gen-subview" style="display:none;">
                        ${window.VN_SETTINGS_PANEL ? window.VN_SETTINGS_PANEL.getCtxHTML() : '<div class="set-desc" style="padding:20px; text-align:center;"><i class="fa-solid fa-triangle-exclamation"></i> vn_settings.js 尚未載入</div>'}
                        </div>

                        <div id="gview-back" class="gen-subview" style="display:none;">
                        <div class="set-group" id="relay-group">
                            <div class="set-label"><i class="fa-solid fa-satellite-dish"></i> 回覆交給伺服器跑${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2443') : ''}</div>
                            <input class="set-input" id="relay-url" placeholder="托管網址" />
                            <input class="set-input" id="relay-token" type="password" placeholder="通行碼" style="margin-top:8px;" />
                            <div style="display:flex; gap:8px; margin-top:10px;">
                                <div class="btn-save" id="relay-save-btn" style="flex:1; padding:12px; font-size:13px;">開啟並測試</div>
                                <div class="btn-test" id="relay-off-btn" style="flex:1; padding:12px; font-size:13px;">關掉</div>
                            </div>
                            <div id="relay-state" style="font-size:12px; color:var(--os-ink); margin-top:8px;">還沒開。</div>
                        </div>

                        <!-- ☁️ 自動備份（os_backup.js 的 cloudBackup）：托管伺服器用上面那組網址與通行碼；GitHub 用自己的私人倉庫 -->
                        <div class="set-group" id="cloudbk-group">
                            <div class="set-label">
                                <span><i class="fa-solid fa-cloud-arrow-up"></i> 自動備份${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_cloudbk') : ''}</span>
                                <label class="toggle-switch"><input type="checkbox" id="cloudbk-on"><span class="slider"></span></label>
                            </div>
                            <div class="cloudbk-dest" id="cloudbk-dest">
                                <button type="button" class="cloudbk-dest-btn" data-dest="relay">托管伺服器</button>
                                <button type="button" class="cloudbk-dest-btn" data-dest="github">GitHub 私人倉庫</button>
                            </div>
                            <div class="cloudbk-gh" id="cloudbk-gh">
                                <div class="cloudbk-gh-lab">倉庫與金鑰${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_cloudbk_gh') : ''}</div>
                                <input class="set-input" id="cloudbk-gh-repo" placeholder="帳號/倉庫名" autocomplete="off" />
                                <input class="set-input cloudbk-gh-token" id="cloudbk-gh-token" type="password" placeholder="金鑰" autocomplete="off" />
                            </div>
                            <div class="cloudbk-parts" id="cloudbk-parts"></div>
                            <div class="cloudbk-state" id="cloudbk-state"></div>
                            <div class="cloudbk-bar">
                                <div class="btn-save cloudbk-btn" id="cloudbk-now">現在備份</div>
                                <div class="btn-test cloudbk-btn" id="cloudbk-list-btn">雲端的備份</div>
                            </div>
                            <div class="cloudbk-list" id="cloudbk-list"></div>
                        </div>

                            <div class="set-group" id="ka-group">
                                <div class="set-label"><i class="fa-solid fa-mug-saucer"></i> 沒有伺服器的守候${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2455') : ''}</div>

                                <div class="ka-item" id="ka-item-audio">
                                    <div class="set-label" style="margin-top:12px;">
                                        <span><i class="fa-solid fa-music"></i> 當成在放音樂${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2462') : ''}</span>
                                        <label class="toggle-switch"><input type="checkbox" id="ka-audio"><span class="slider"></span></label>
                                    </div>
                                </div>

                                <div class="ka-item" id="ka-item-wake">
                                    <div class="set-label" style="margin-top:12px;">
                                        <span><i class="fa-solid fa-lightbulb"></i> 螢幕不要自己關${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2470') : ''}</span>
                                        <label class="toggle-switch"><input type="checkbox" id="ka-wake"><span class="slider"></span></label>
                                    </div>
                                    <div class="ka-why hidden" id="ka-why-wake">這台做不到這一招</div>
                                </div>

                                <div class="ka-item" id="ka-item-pip">
                                    <div class="set-label" style="margin-top:12px;"><span><i class="fa-solid fa-clone"></i> 開一個小窗守著${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2476') : ''}</span></div>
                                    <div class="ka-btns"><div class="btn-test" id="ka-pip-btn">開小窗</div></div>
                                    <div class="ka-why hidden" id="ka-why-pip">這台做不到這一招</div>
                                </div>

                                <div class="ka-item" id="ka-item-notify">
                                    <div class="set-label" style="margin-top:12px;">
                                        <span><i class="fa-solid fa-bell"></i> 有人找妳就通知${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2486') : ''}</span>
                                        <label class="toggle-switch"><input type="checkbox" id="ka-notify"><span class="slider"></span></label>
                                    </div>
                                    <div class="ka-why hidden" id="ka-why-notify">這台做不到這一招</div>
                                </div>

                                <div class="ka-state" id="ka-state">—</div>
                            </div>
                        </div><!-- /gview-back -->
                    </div>

                    <div id="view-sys" class="tab-view hidden">

                        <div class="set-group${pwaOnly}" id="push-group">
                            <div class="set-label"><i class="fa-solid fa-bell"></i> 手機通知${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2499') : ''}</div>
                            <div class="push-gate hidden" id="push-gate">
                                要從主畫面開啟才收得到——分享鈕 → 加入主畫面，再從那顆圖示進來。
                            </div>
                            <input class="set-input" id="push-url" placeholder="橋的網址，不含 https://">
                            <input class="set-input push-key-input" id="push-key" type="password" placeholder="密鑰，跟房間設定那把一樣">
                            <div class="push-row">
                                <div class="btn-save" id="push-on-btn">開啟通知</div>
                                <div class="btn-test" id="push-test-btn">測試一下</div>
                            </div>
                            <div class="btn-test push-off" id="push-off-btn">關掉通知</div>
                            <div class="push-state" id="push-state">還沒開。</div>
                        </div>

                        <!-- 借接口給電腦上的 AI：裡面整格由 os_keyrun.js 畫（下面 mount） -->
                        <div class="set-group keyrun-group" id="keyrun-group"></div>

                        <div class="set-group${pwaOnly}">
                            <div class="set-label" title="在 iOS 加到主畫面時，若動態島或瀏海遮擋頂部 UI，可選「強制下移」。"><i class="fa-solid fa-desktop"></i> 介面佈局${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('ss_2515') : ''}</div>
                            <select class="set-select" id="os-layout-mode">
                                <option value="auto" ${localStorage.getItem('aurelia_layout_mode') !== 'pad-ios' ? 'selected' : ''}>自動適配 (Auto/預設)</option>
                                <option value="pad-ios" ${localStorage.getItem('aurelia_layout_mode') === 'pad-ios' ? 'selected' : ''}>強制下移 (iOS 動態島/瀏海)</option>
                            </select>
                        </div>

                        <div class="set-group">
                            <div class="set-label">
                                <span><i class="fa-solid fa-chart-simple"></i> 這台裝置上的空間${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('bk_storage') : ''}</span>
                                <span class="btn-test bk-scan-btn" id="bk-scan-btn">看各佔多少</span>
                            </div>
                            <div class="bk-usage" id="bk-usage"></div>
                            <div class="bk-protect" id="bk-protect"></div>
                            <div class="bk-storage-info" id="bk-storage-info"></div>
                        </div>

                        <div class="set-group">
                            <div class="set-label"><i class="fa-solid fa-floppy-disk"></i> ${isStandalone ? '本地備份' : '奧瑞亞的資料備份'}${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn(isStandalone ? 'ss_2549' : 'bk_local_st') : ''}</div>
                            <div class="cloudbk-parts" id="bk-parts"></div>
                            <div class="btn-save" id="bk-export-btn" style="padding:12px; font-size:13px;"><i class="fa-solid fa-upload"></i> 匯出備份 JSON</div>
                            <label class="bk-opt"><input type="checkbox" id="bk-export-img" checked><span>帶圖片</span>${(window.AUI && window.AUI.helpBtn) ? window.AUI.helpBtn('bk_export_img') : ''}</label>
                            <div class="btn-test" id="bk-import-btn" style="margin-top:8px;"><i class="fa-solid fa-download"></i> 從本地 JSON 還原</div>
                            <input type="file" id="bk-file-input" accept=".json" style="display:none;" />
                        </div>

                        <div class="danger-zone${pwaOnly}">
                            <h3><i class="fa-solid fa-triangle-exclamation"></i> 危險區域：一鍵格式化</h3>
                            <p>此操作將徹底刪除所有本地資料庫（包含角色、對話、長線劇情、變數工坊與系統設定）。操作後將自動重整網頁。請務必先進行備份！</p>
                            <div class="btn-danger" id="bk-format-btn"><i class="fa-solid fa-burst"></i> 格式化並清空所有數據</div>
                        </div>

                        <div id="bk-status" style="font-size:12px; color:rgba(var(--os-ink-rgb), 0.72); text-align:center; padding:10px 0; min-height:20px;"></div>
                    </div>

                </div>
                <!-- 📦 NAI 拖圖預設包 modal：拖圖→解析內嵌配方→存預設(縮圖進 IndexedDB) -->
                <div id="img-nai-pack-modal" class="nai-pack-modal">
                    <div class="nai-pack-box">
                        <div class="nai-pack-head">
                            <div class="nai-pack-title"><i class="fa-solid fa-box"></i> NAI 預設包（拖圖生成・含預覽）</div>
                            <button type="button" class="nai-pack-close" onclick="window._naiPreset.close()">✕</button>
                        </div>
                        <div class="nai-pack-io">
                            <div class="cfd-pack-io-row">
                                <button type="button" class="set-btn" onclick="window._naiPreset.importPack()"><i class="fa-solid fa-download"></i> 匯入預設包檔</button>
                                <button type="button" class="set-btn" onclick="window._naiPreset.exportPack()"><i class="fa-solid fa-upload"></i> 匯出全部</button>
                                <button type="button" class="set-btn cfd-pack-clear" onclick="window._naiPreset.clearAll()"><i class="fa-solid fa-trash-can"></i> 清空</button>
                                <input type="file" id="img-nai-pack-import-file" accept="application/json,.json" class="nai-pack-file-hidden">
                            </div>
                            <div class="cfd-pack-io-hint">匯出會把整牆預設（含預覽圖）存成一個檔分享；匯入時會問你要「覆蓋同名」還是「全部新增」。「清空」把整牆清掉（要按底部「保存」才生效）。</div>
                            <div id="img-nai-import-choice" class="cfd-import-choice" style="display:none;">
                                <div class="cfd-import-choice-msg" id="img-nai-import-msg"></div>
                                <div class="cfd-import-choice-btns">
                                    <button class="set-btn" type="button" onclick="window._naiPreset._applyImport('overwrite')">覆蓋同名</button>
                                    <button class="set-btn" type="button" onclick="window._naiPreset._applyImport('append')">全部新增</button>
                                    <button class="set-btn cfd-import-cancel" type="button" onclick="window._naiPreset._cancelImport()">取消</button>
                                </div>
                            </div>
                        </div>
                        <div id="img-nai-pack-drop" class="nai-pack-drop">
                            <input type="file" id="img-nai-pack-file" accept="image/png,image/webp,image/*" multiple class="nai-pack-file-hidden">
                            <div class="nai-pack-drop-hint">把下載的 <b>NAI 原圖</b>拖進來（可一次多張），或 <span class="nai-pack-pick" onclick="document.getElementById('img-nai-pack-file').click()">點此選圖</span><br>自動讀出底詞 / 負詞 / sampler / CFG / steps，存成預設，並用這張圖當預覽。<br><span class="nai-pack-warn"><i class="fa-solid fa-triangle-exclamation"></i> 要原圖，截圖或被轉成 JPG 的讀不到。</span></div>
                        </div>
                        <div id="img-nai-pack-status" class="nai-pack-status"></div>
                        <div id="img-nai-pack-grid" class="nai-pack-grid"></div>
                    </div>
                </div>

                <div class="set-footer">
                    <div class="btn-save" id="os-save-btn">保存所有設定</div>
                    <div class="set-status" id="os-status"></div>
                </div>
            </div>
        `;
    }

    window.OS_SETTINGS_PAGE = { html: html };
})();
