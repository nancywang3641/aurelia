// ----------------------------------------------------------------
// [檔案] vn_styles.js
// 路徑：os_phone/vn_story/vn_styles.js
// 職責：VN 播放器 - UI 樣式定義 & HTML 模板
// ⚠️ 此檔案必須在 vn_core.js 之前載入
// ----------------------------------------------------------------
(function () {
    // === CSS 樣式 ===


    // === HTML 模板 ===
    const vnHTML = `
    <div class="vn-root">
        <div class="vn-container">
            <div id="page-game" class="page hidden">
                <button id="btn-home" onclick="window.VN_PLAYER.stopGame()" title="Home">退出</button>
                <button id="btn-settings" onclick="window.VN_PLAYER.openGameSettings()" title="Config">設定</button>
                <button id="btn-reader" onclick="window.VN_PLAYER.showReaderPanel()" title="劇情閱讀器">📖</button>
                <div id="stream-header" class="hidden">
                    <div id="stream-live-badge"><div class="stream-live-dot"></div><span id="stream-live-text">LIVE</span></div>
                    <span id="stream-title-text"></span>
                    <div class="stream-divider"></div>
                    <span id="stream-host-text"></span>
                    <div id="stream-stats">
                        <span class="stream-stat"><span class="stream-stat-icon">👁</span><span class="stream-stat-val" id="stream-viewers"></span></span>
                        <span class="stream-stat"><span class="stream-stat-icon">❤</span><span class="stream-stat-val" id="stream-followers"></span></span>
                        <span class="stream-stat"><span class="stream-stat-icon">🏆</span><span class="stream-rank-val" id="stream-rank"></span></span>
                    </div>
                </div>
                <div id="stream-rank-panel" class="hidden">
                    <div id="stream-rank-header">🎖 粉絲榜</div>
                    <div class="stream-rank-row">
                        <span class="stream-rank-medal">🥇</span>
                        <div class="stream-rank-info">
                            <span class="stream-rank-name" id="sr-name-1"></span>
                            <span class="stream-rank-title" id="sr-title-1"></span>
                        </div>
                        <span class="stream-rank-score">▲<span id="sr-score-1"></span></span>
                    </div>
                    <div class="stream-rank-row">
                        <span class="stream-rank-medal">🥈</span>
                        <div class="stream-rank-info">
                            <span class="stream-rank-name" id="sr-name-2"></span>
                            <span class="stream-rank-title" id="sr-title-2"></span>
                        </div>
                        <span class="stream-rank-score">▲<span id="sr-score-2"></span></span>
                    </div>
                    <div class="stream-rank-row">
                        <span class="stream-rank-medal">🥉</span>
                        <div class="stream-rank-info">
                            <span class="stream-rank-name" id="sr-name-3"></span>
                            <span class="stream-rank-title" id="sr-title-3"></span>
                        </div>
                        <span class="stream-rank-score">▲<span id="sr-score-3"></span></span>
                    </div>
                    <div id="stream-scene-row" class="hidden">
                        <span id="stream-scene-icon">📍</span>
                        <span id="stream-scene-label"></span>
                    </div>
                </div>
                <div id="game-bg"></div>
                <div id="game-char-container"><img id="game-char" src="" alt="character" onerror="window.VN_Core.handleImgError(this)"></div>
                <div id="scene-cg-overlay" onclick="window.VN_Core.next()"><img id="scene-cg-img" src="" alt="scene cg"></div>

                <div id="top-badge"></div>
                <div id="danmu-container"></div>
                <img id="char-portrait" src="" alt="">

                <div id="text-panel-wrapper" onclick="window.VN_Core.handlePanelClick()">
                    <div id="text-panel">
                        <div id="speaker-name">System</div>

                        <div id="vn-panel-controls">
                            <div id="vn-ctx-popup" onclick="event.stopPropagation()">
                                <div class="ctx-title">📊 上下文</div>
                                <div class="ctx-bar-wrap">
                                    <div class="ctx-bar-track"><div class="ctx-bar-fill" id="ctx-bar-fill"></div></div>
                                    <div class="ctx-usage-text" id="ctx-usage-text">—</div>
                                </div>
                                <div class="ctx-row"><span class="ctx-label">↑ 發送 Tokens</span><span class="ctx-val" id="ctx-tokens">—</span></div>
                                <div class="ctx-row"><span class="ctx-label">↑ 發送 Chars</span><span class="ctx-val" id="ctx-chars">—</span></div>
                                <div class="ctx-row"><span class="ctx-label">↓ 回應 Tokens</span><span class="ctx-val" id="ctx-recv-tokens">—</span></div>
                                <div class="ctx-row"><span class="ctx-label">↓ 回應 Chars</span><span class="ctx-val" id="ctx-recv-chars">—</span></div>
                                <div class="ctx-row"><span class="ctx-label">訊息數</span><span class="ctx-val" id="ctx-msgs">—</span></div>
                                <div id="ctx-breakdown" class="ctx-breakdown">
                                    <div class="ctx-bd-head">上下文組成</div>
                                    <div class="ctx-bd-item" id="ctx-bd-i-system"><span class="ctx-bd-label">系統提示</span><span class="ctx-bd-bar"><span class="ctx-bd-fill" id="ctx-bd-bar-system"></span></span><span class="ctx-bd-val" id="ctx-bd-system">—</span></div>
                                    <div class="ctx-bd-item" id="ctx-bd-i-character"><span class="ctx-bd-label">角色卡</span><span class="ctx-bd-bar"><span class="ctx-bd-fill" id="ctx-bd-bar-character"></span></span><span class="ctx-bd-val" id="ctx-bd-character">—</span></div>
                                    <div class="ctx-bd-item" id="ctx-bd-i-world"><span class="ctx-bd-label">世界資訊</span><span class="ctx-bd-bar"><span class="ctx-bd-fill" id="ctx-bd-bar-world"></span></span><span class="ctx-bd-val" id="ctx-bd-world">—</span></div>
                                    <div class="ctx-bd-item" id="ctx-bd-i-examples"><span class="ctx-bd-label">對話範例</span><span class="ctx-bd-bar"><span class="ctx-bd-fill" id="ctx-bd-bar-examples"></span></span><span class="ctx-bd-val" id="ctx-bd-examples">—</span></div>
                                    <div class="ctx-bd-item" id="ctx-bd-i-chat"><span class="ctx-bd-label">聊天記錄</span><span class="ctx-bd-bar"><span class="ctx-bd-fill" id="ctx-bd-bar-chat"></span></span><span class="ctx-bd-val" id="ctx-bd-chat">—</span></div>
                                    <div class="ctx-bd-item" id="ctx-bd-i-persona"><span class="ctx-bd-label">使用者角色</span><span class="ctx-bd-bar"><span class="ctx-bd-fill" id="ctx-bd-bar-persona"></span></span><span class="ctx-bd-val" id="ctx-bd-persona">—</span></div>
                                    <div class="ctx-bd-item" id="ctx-bd-i-note"><span class="ctx-bd-label">作者備註</span><span class="ctx-bd-bar"><span class="ctx-bd-fill" id="ctx-bd-bar-note"></span></span><span class="ctx-bd-val" id="ctx-bd-note">—</span></div>
                                    <div class="ctx-bd-item" id="ctx-bd-i-inject"><span class="ctx-bd-label">注入/擴充</span><span class="ctx-bd-bar"><span class="ctx-bd-fill" id="ctx-bd-bar-inject"></span></span><span class="ctx-bd-val" id="ctx-bd-inject">—</span></div>
                                    <div class="ctx-bd-total"><span class="ctx-bd-label">合計</span><span class="ctx-bd-val" id="ctx-bd-total-val">—</span></div>
                                </div>
                                <div class="ctx-limit-row">
                                    <span class="ctx-limit-label">⚠️ 警戒 Tokens</span>
                                    <input class="ctx-limit-input" id="ctx-limit-input" type="number" min="1000" max="2000000" value="50000" onchange="window.VN_Core._saveCtxLimit(this.value)" />
                                </div>
                                <div class="ctx-time" id="ctx-time">尚未偵測到數據</div>

                                <div id="ctx-summary-wrap" style="display:none; margin-top:9px; border-top:1px solid rgba(246,173,85,0.2); padding-top:9px;">
                                    <div style="font-size:10px; color:#888; margin-bottom:6px; letter-spacing:0.5px;">Token 已達警戒，建議執行大總結</div>
                                    <button id="ctx-summary-btn" onclick="window.VN_Summary.generate(); event.stopPropagation();" style="width:100%; padding:7px 4px; background:rgba(246,173,85,0.08); border:1px solid rgba(246,173,85,0.35); border-radius:4px; color:#f6ad55; font-size:11px; cursor:pointer; font-family:inherit; letter-spacing:1px; transition:0.2s;">📝 大總結</button>
                                </div>

                            </div>
                            <button class="vn-panel-btn" id="vn-btn-log" onclick="window.VN_Core.showLog(); event.stopPropagation();">LOG</button>
                            <button class="vn-panel-btn" id="vn-btn-think" onclick="window.VN_PLAYER.showThinkPopup(); event.stopPropagation();" title="本章思考鏈">COT</button>
                            <button class="vn-panel-btn" id="vn-btn-skip" onclick="window.VN_Core.toggleSkip(); event.stopPropagation();">SKIP</button>
                            <button class="vn-panel-btn" id="vn-btn-ctx" onclick="window.VN_Core.toggleCtx(); event.stopPropagation();">CTX</button>
                            <button class="vn-panel-btn" id="vn-btn-regen" style="display:none;color:#f6ad55;" onclick="window.VN_Core.regenCurrentTTS(); event.stopPropagation();" title="清除快取並重新生成當前語音">↺ TTS</button>
                        </div>

                        <div id="dialogue-text">讀取中...</div>
                        <div class="hint-text">▼</div>
                    </div>
                </div>

                <div id="vn-end-overlay">
                    <button id="vn-end-btn-data">資料中心</button>
                </div>

                <div id="vn-log-overlay">
                    <div id="vn-log-header">
                        <div id="vn-log-title">對話紀錄</div>
                        <div class="vn-log-close" onclick="window.VN_Core.hideLog()">✕</div>
                    </div>
                    <div id="vn-log-content"></div>
                </div>

                <!-- 📝 大總結 overlay -->
                <div id="vn-summary-overlay">
                    <div id="vn-summary-header">
                        <div id="vn-summary-title">📝 大總結</div>
                        <div class="vn-log-close" onclick="window.VN_Summary.hideResult()">✕</div>
                    </div>
                    <div id="vn-summary-content"></div>
                </div>

                <!-- 💭 思考鏈小窗 -->
                <div id="vn-think-popup">
                    <div id="vn-think-popup-header">
                        <span id="vn-think-popup-title">本章思考鏈</span>
                        <span id="vn-think-popup-close" onclick="window.VN_PLAYER.hideThinkPopup()">✕</span>
                    </div>
                    <div id="vn-think-popup-body"></div>
                </div>

                <!-- 📖 劇情閱讀器（迷你酒館）-->
                <div id="vn-reader-overlay">
                    <div id="vn-reader-header">
                        <div id="vn-reader-title">📖 劇情閱讀器</div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <div id="vn-reader-summary-btn" onclick="window.VN_PLAYER.showSummaryEditor()" title="查看/編輯大總結" style="color:#888;font-size:0.78rem;cursor:pointer;padding:3px 8px;border:1px solid rgba(212,175,55,0.2);border-radius:4px;transition:all 0.2s;" onmouseover="this.style.color='#d4af37';this.style.borderColor='rgba(212,175,55,0.5)'" onmouseout="this.style.color='#888';this.style.borderColor='rgba(212,175,55,0.2)'">📝 大總結</div>
                            <div id="vn-reader-close" onclick="window.VN_PLAYER.hideReaderPanel()">✕</div>
                        </div>
                    </div>
                    <div id="vn-reader-tabs" style="display:none"></div>
                    <div id="vn-reader-body"></div>
                </div>

                <div id="sys-overlay" onclick="window.VN_Core.next()">
                    <div id="sys-box">
                        <div id="sys-title"></div>
                        <div id="sys-text"></div>
                    </div>
                </div>

                <div id="quest-overlay" onclick="window.VN_Core.next()">
                    <div id="quest-card">
                        <div id="quest-header">✦ Quest ✦</div>
                        <div id="quest-title"></div>
                        <div id="quest-requester">委託人 · <span id="quest-requester-name"></span></div>
                        <div id="quest-desc"></div>
                        <div id="quest-reward-row">
                            <span id="quest-reward-label">🏆 Reward</span>
                            <span id="quest-reward"></span>
                        </div>
                        <button id="quest-confirm" onclick="window.VN_Core.next(); event.stopPropagation();">接受委託</button>
                    </div>
                </div>

                <div id="trans-overlay" onclick="window.VN_Core.next()">
                    <div id="trans-text"></div>
                </div>

                <div id="item-overlay">
                    <div id="item-card">
                        <div class="item-close" onclick="window.VN_Core.next()">✕</div>
                        <div id="item-icon-box"><img id="item-img" src=""></div>
                        <div id="item-title"></div>
                        <div id="item-desc"></div>
                        <button id="item-btn" onclick="window.VN_Core.next()">確認</button>
                    </div>
                </div>

                <div id="achievement-overlay" onclick="window.VN_Core.dismissAchievement()">
                    <div id="achievement-card">
                        <div id="achievement-icon">🏆</div>
                        <div id="achievement-body">
                            <div id="achievement-label">ACHIEVEMENT UNLOCKED</div>
                            <div id="achievement-name"></div>
                            <div id="achievement-desc"></div>
                        </div>
                        <div id="achievement-dismiss">✕</div>
                    </div>
                </div>

                <div id="vn-bgm-toast">
                    <div id="vn-bgm-card">
                        <div id="vn-bgm-icon">🎵</div>
                        <div id="vn-bgm-body">
                            <div id="vn-bgm-label">NOW PLAYING</div>
                            <div id="vn-bgm-name"></div>
                        </div>
                    </div>
                </div>

                <div id="phone-overlay">
                    <div id="phone-device">
                        <div id="phone-chat" class="hidden" onclick="window.VN_Core.next()">
                            <img id="chat-bg-img" src="" style="display:none;">
                            <div id="chat-header">
                                <span style="font-size: 1.2rem; cursor:pointer;" onclick="window.VN_Core.closeChat(); event.stopPropagation()">&lt;</span>
                                <span id="chat-title" style="font-weight:bold; font-size: 1.1rem;">Name</span>
                                <button id="chat-more-btn" onclick="window.VN_PLAYER.openChatBgPanel(); event.stopPropagation()">···</button>
                            </div>
                            <div id="chat-body"></div>

                            <!-- 表情包面板 -->
                            <!-- 表情包面板：tabs + grid only，管理移至系統設置 -->
                            <div id="sticker-panel" onclick="event.stopPropagation()">
                                <div id="sticker-tabs-row">
                                    <div id="sticker-tabs"></div>
                                </div>
                                <div id="sticker-grid"></div>
                            </div>

                            <div id="chat-footer" onclick="event.stopPropagation()">
                                <button id="chat-plus-btn" onclick="window.VN_Sticker.togglePanel(); event.stopPropagation()">+</button>
                                <div id="chat-input-wrap">
                                    <input type="text" id="chat-input" placeholder="發送消息..." readonly>
                                </div>
                                <button id="chat-mic-btn">🎤</button>
                            </div>

                            <div id="chat-bg-panel" onclick="event.stopPropagation()">
                                <div id="chat-bg-window">
                                    <div id="chat-bg-titlebar">
                                        <div id="chat-bg-title">聊天背景</div>
                                        <button id="chat-bg-close" onclick="window.VN_PLAYER.closeChatBgPanel()">✕</button>
                                    </div>
                                    <div id="chat-bg-grid">
                                        <input type="file" id="chat-bg-file" accept="image/*" style="display:none;" onchange="window.VN_PLAYER.handleChatBgFile(this)">
                                        <div class="chat-bg-add" onclick="document.getElementById('chat-bg-file').click()">+</div>
                                    </div>
                                    <div id="chat-bg-url-row">
                                        <input type="text" id="chat-bg-url-input" placeholder="輸入圖片 URL...">
                                        <button id="chat-bg-url-btn" onclick="window.VN_PLAYER.applyChatBgUrl()">確定</button>
                                    </div>
                                    <button id="chat-bg-clear-btn" onclick="window.VN_PLAYER.clearChatBg()">清除背景</button>
                                </div>
                            </div>
                        </div>
                        <div id="phone-call" class="hidden">
                            <div id="call-status">來電</div>
                            <img id="call-avatar" src="" onerror="window.VN_Core.handleImgError(this)">
                            <div id="call-name">Name</div>

                            <div id="call-subtitle-box" class="hidden" onclick="window.VN_Core.next()">
                                <div id="call-sub-name"></div>
                                <div id="call-sub-text"></div>
                            </div>

                            <div class="call-btn-group" id="call-incoming-btns">
                                <div class="call-btn-wrap">
                                    <button class="c-btn btn-red" onclick="window.VN_Core.rejectCall()">✕</button>
                                </div>
                                <div class="call-btn-wrap">
                                    <button class="c-btn btn-green" onclick="window.VN_Core.answerCall()">📞</button>
                                </div>
                            </div>
                            <div class="call-btn-group hidden" id="call-active-btns">
                                <div class="call-btn-wrap">
                                    <button class="c-btn btn-gray" onclick="window.VN_Core.next()">🔇</button>
                                </div>
                                <div class="call-btn-wrap">
                                    <button class="c-btn btn-gray" onclick="window.VN_Core.next()">📢</button>
                                </div>
                                <div class="call-btn-wrap">
                                    <button class="c-btn btn-red" onclick="window.VN_Core.hangUpCall()">✕</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <audio id="bgm-player" loop></audio>

                <!-- 第三方插件 HTML block 展示層 -->
                <div id="html-block-overlay" style="display:none;"></div>

                <div id="game-settings-overlay">
                    <div id="game-settings-window">
                        <div id="gs-titlebar">
                            <span class="gs-title">設定</span>
                            <button class="gs-close" onclick="window.VN_PLAYER.closeGameSettings()">✕</button>
                        </div>
                        <div id="gs-body">
                            <div class="gs-section-title">⚙ 基礎設置</div>
                            <div class="gs-row"><span class="gs-label">字體大小</span><input type="range" class="gs-slider" id="gs-font-size" min="12" max="24" value="19" oninput="window.VN_Settings.applyFontSize(this.value)"><span class="gs-val" id="gs-font-size-val">19px</span></div>
                            <div class="gs-row"><span class="gs-label">打字速度</span><input type="range" class="gs-slider" id="gs-tw-speed" min="10" max="100" value="30" oninput="window.VN_Settings.applyTwSpeed(this.value)"><span class="gs-val" id="gs-tw-speed-val">30ms</span></div>
                            <div class="gs-row"><span class="gs-label">彈幕速度</span><input type="range" class="gs-slider" id="gs-danmu-speed" min="6" max="30" value="18" oninput="window.VN_Settings.applyDanmuSpeed(this.value)"><span class="gs-val" id="gs-danmu-speed-val">18s</span></div>
                            <div class="gs-row"><span class="gs-label">BGM 音量</span><input type="range" class="gs-slider" id="gs-bgm-vol" min="0" max="100" value="10" oninput="window.VN_Settings.applyBgmVol(this.value)"><span class="gs-val" id="gs-bgm-vol-val">10%</span></div>
                            <div class="gs-row"><span class="gs-label">音效音量</span><input type="range" class="gs-slider" id="gs-sfx-vol" min="0" max="100" value="50" oninput="window.VN_Settings.applySfxVol(this.value)"><span class="gs-val" id="gs-sfx-vol-val">50%</span></div>
                            <div class="gs-row"><span class="gs-label">語音音量</span><input type="range" class="gs-slider" id="gs-tts-vol" min="0" max="100" value="80" oninput="window.VN_Settings.applyTtsVol(this.value)"><span class="gs-val" id="gs-tts-vol-val">80%</span></div>
                            <div class="gs-row" style="margin-top:4px;">
                                <button class="gs-reset-btn" style="width:100%; text-align:center;" onclick="window.VN_PLAYER.closeGameSettings(); (window.AureliaLoader?.openPhoneApp?.('設置') || window.AureliaControlCenter?.showOsApp?.('設置'));">⚙ 開啟語音 / 圖片主設置</button>
                            </div>
                            <hr class="gs-divider">
                            <div class="gs-section-title">🎨 字體顏色設置</div>
                            <div class="gs-color-row"><span class="gs-color-label">文章字體顏色</span><input type="color" class="gs-color-input" id="gs-text-color" value="#dcd8d0" oninput="window.VN_Settings.applyTextColor(this.value)"></div>
                            <div class="gs-color-row"><span class="gs-color-label">內心獨白顏色</span><input type="color" class="gs-color-input" id="gs-inner-color" value="#d4af37" oninput="window.VN_Settings.applyInnerColor(this.value)"></div>
                            <div class="gs-color-row"><span class="gs-color-label">名稱標籤字體顏色</span><input type="color" class="gs-color-input" id="gs-name-color" value="#d4af37" oninput="window.VN_Settings.applyNameColor(this.value)"></div>
                            <hr class="gs-divider">
                            <button class="gs-reset-btn" onclick="window.VN_Settings.resetColors()">重置為默認顏色</button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="chapter-overlay">
                <div class="ch-table-bg"></div>
                <div class="ch-canvas">
                <div id="chapter-window">
                    <div class="ch-book-spread">
                        <div class="ch-page ch-page-left"></div>
                        <div class="ch-book-spine"></div>
                        <div class="ch-page ch-page-right"></div>
                    </div>
                    <button class="ch-close" onclick="window.VN_PLAYER.closeChapterPanel()"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg></button>
                    <div class="ch-nb-inner">
                        <div class="ch-header">
                            <div class="ch-hdr-left">
                                <div class="ch-title-main">章節選擇</div>
                                <div class="ch-title-sub">Chapter Select</div>
                            </div>
                            <div class="ch-hdr-divider"></div>
                            <div class="ch-hdr-right">
                                <div class="ch-src-zh" id="chapter-subheader">酒館數據庫</div>
                                <div class="ch-src-en">Story Archive</div>
                            </div>
                        </div>
                        <div class="ch-cards-area">
                            <div class="ch-cards-viewport">
                                <button class="ch-nav-arrow ch-nav-prev" id="ch-nav-prev"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="8,2 4,6 8,10"/></svg></button>
                                <div id="chapter-list" class="ch-cards-container"></div>
                                <button class="ch-nav-arrow ch-nav-next" id="ch-nav-btn"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="4,2 8,6 4,10"/></svg></button>
                            </div>
                            <div class="ch-carousel-dots" id="ch-dots"></div>
                        </div>
                        <div class="ch-bottom-panel">
                            <div class="ch-quote-sec">
                                <div class="ch-quote-text">「故事還在繼續，而我們也在。」</div>
                                <div class="ch-quote-signature" aria-label="Yingying"></div>
                            </div>
                            <div class="ch-bottom-close" onclick="window.VN_PLAYER.closeChapterPanel()">
                                <div class="ch-close-zh">關閉</div>
                                <div class="ch-close-en">CLOSE</div>
                                <div class="ch-close-arrow">›</div>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </div>

            <div id="vn-gen-overlay">
                <div id="vn-gen-window">
                    <div id="vn-gen-titlebar">
                        <span class="gen-title">✨ AI 生成劇情</span>
                        <button class="gen-close" onclick="window.VN_PLAYER.closeGeneratePanel()">✕</button>
                    </div>
                    <div id="vn-gen-columns">
                        <details id="vn-gen-body" class="vn-collapse-group" open>
                            <summary class="vn-gen-col-hd">
                                <span>✍️ 自由生成</span>
                                <span class="collapse-icon">▼</span>
                            </summary>
                            <div class="collapse-content">
                                <label>開場白標題 <span style="color:rgba(255,255,255,0.3); font-size:0.75rem; letter-spacing:0;">(選填，填了才會儲存/覆蓋)</span></label>
                                <input id="vn-gen-title" type="text" placeholder="例：雨天咖啡廳初見" autocomplete="off" />
                                <label>劇情指引 <span style="color:rgba(255,255,255,0.3); font-size:0.75rem; letter-spacing:0;">(選填，留空則 AI 自由發揮)</span></label>
                                <textarea id="vn-gen-request" placeholder="例：繼續上次在咖啡廳的相遇，加入一段雨天的邂逅...&#10;&#10;或留空讓 AI 自由創作"></textarea>
                                <button id="vn-gen-submit" onclick="window.VN_PLAYER.generateStory()">🚀 開始生成</button>
                                <div id="vn-gen-presets-wrap">
                                    <div class="vn-gen-presets-hd">
                                        <span>📂 已儲存的開場白</span>
                                        <span id="vn-gen-presets-count"></span>
                                    </div>
                                    <div id="vn-gen-presets"></div>
                                </div>
                            </div>
                        </details>

                        <details id="vn-gen-card-col" class="vn-collapse-group" open>
                            <summary class="vn-gen-col-hd">
                                <span>📚 書架角色卡</span>
                                <span class="collapse-icon">▼</span>
                            </summary>
                            <div class="collapse-content">
                                <div id="vn-gen-card-list"></div>
                                <button id="vn-gen-card-dive" onclick="window.VN_PLAYER.diveSelectedCard()">🎭 與TA相遇</button>
                            </div>
                        </details>
                    </div>
                    <div id="vn-gen-status"></div>
                </div>
            </div>
        </div>
    </div>
    `;

    // === 導出供 vn_core.js 使用 ===
    window.VN_STYLES = { vnHTML };

    console.log('[PhoneOS] vn_styles.js 已載入 (完美層次黑金版 + SFX 音效 + 主頁背景音樂支援)');
})();