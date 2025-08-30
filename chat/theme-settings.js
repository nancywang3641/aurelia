// 主題設置窗口邏輯
(function(){
  // 主題設置窗口 HTML
  function injectThemeSettingsModal() {
    if (document.getElementById('themeSettingsModal')) return;
    const modal = document.createElement('div');
    modal.id = 'themeSettingsModal';
    modal.className = 'modal-overlay hidden';
    modal.innerHTML = `
      <div class="modal-content theme-settings-modal">
        <div class="modal-header">
          <h3>🎨 主題樣式設置</h3>
        </div>
        <div class="modal-body">
          <div class="settings-container">
                                            <!-- 基礎顏色設置 -->
                                <div class="settings-section">
                                    <h4 class="section-title collapsible" onclick="toggleSection(this)">
                                        🎯 基礎顏色 <span class="toggle-icon">▼</span>
                                    </h4>
                                    <div class="section-content">
              <div class="setting-item">
                <label>主題顏色</label>
                <div class="color-input-group">
                  <input type="color" id="mainThemeColorInput" value="#1a1a1a">
                  <span class="color-preview" id="mainThemeColorPreview"></span>
                </div>
              </div>
              <div class="setting-item">
                <label>角色泡泡顏色</label>
                <div class="color-input-group">
                  <input type="color" id="themeColorInput" value="#d32f2f">
                  <span class="color-preview" id="themeColorPreview"></span>
                </div>
              </div>
              <div class="setting-item">
                <label>用戶泡泡顏色</label>
                <div class="color-input-group">
                  <input type="color" id="userBubbleColorInput" value="#23272e">
                  <span class="color-preview" id="userBubbleColorPreview"></span>
                </div>
                                                  </div>
                                    </div>
                                </div>

                                <!-- 內容區域設置 -->
                                <div class="settings-section">
                                    <h4 class="section-title collapsible" onclick="toggleSection(this)">
                                        📄 內容區域 <span class="toggle-icon">▼</span>
                                    </h4>
                                    <div class="section-content">
              <div class="setting-item">
                <label>背景色</label>
                <div class="color-input-group">
                  <input type="color" id="contentBgColorInput" value="#f7f7f7">
                  <span class="color-preview" id="contentBgColorPreview"></span>
                </div>
              </div>
              <div class="setting-item">
                <label>字體顏色</label>
                <div class="color-input-group">
                  <input type="color" id="contentTextColorInput" value="#222222">
                  <span class="color-preview" id="contentTextColorPreview"></span>
                </div>
                                                  </div>
                                    </div>
                                </div>

                                <!-- 模態窗口設置 -->
                                <div class="settings-section">
                                    <h4 class="section-title collapsible" onclick="toggleSection(this)">
                                        🪟 模態窗口 <span class="toggle-icon">▼</span>
                                    </h4>
                                    <div class="section-content">
                                    <div class="setting-item">
                                        <label>主要文字顏色</label>
                                        <div class="color-input-group">
                                            <input type="color" id="modalTextColorInput" value="#333333">
                                            <span class="color-preview" id="modalTextColorPreview"></span>
                                        </div>
                                    </div>
                                    <div class="setting-item">
                                        <label>次要文字顏色</label>
                                        <div class="color-input-group">
                                            <input type="color" id="modalSecondaryTextColorInput" value="#666666">
                                            <span class="color-preview" id="modalSecondaryTextColorPreview"></span>
                                        </div>
                                    </div>
                                    <div class="setting-item">
                                        <label>提示文字顏色</label>
                                        <div class="color-input-group">
                                            <input type="color" id="modalHintTextColorInput" value="#888888">
                                            <span class="color-preview" id="modalHintTextColorPreview"></span>
                                        </div>
                                    </div>
                                    </div>
                                </div>

                                <!-- Footer設置 -->
                                <div class="settings-section">
                                    <h4 class="section-title collapsible" onclick="toggleSection(this)">
                                        📱 Footer <span class="toggle-icon">▼</span>
                                    </h4>
                                    <div class="section-content">
                                    <div class="setting-item">
                                        <label>主要文字顏色</label>
                                        <div class="color-input-group">
                                            <input type="color" id="footerTextColorInput" value="#ffffff">
                                            <span class="color-preview" id="footerTextColorPreview"></span>
                                        </div>
                                    </div>
                                    <div class="setting-item">
                                        <label>次要文字顏色</label>
                                        <div class="color-input-group">
                                            <input type="color" id="footerSecondaryTextColorInput" value="#cccccc">
                                            <span class="color-preview" id="footerSecondaryTextColorPreview"></span>
                                        </div>
                                    </div>
                                    <div class="setting-item">
                                        <label>提示文字顏色</label>
                                        <div class="color-input-group">
                                            <input type="color" id="footerHintTextColorInput" value="#aaaaaa">
                                            <span class="color-preview" id="footerHintTextColorPreview"></span>
                                        </div>
                                    </div>
                                    <div class="setting-item">
                                        <label>輸入框邊框顏色</label>
                                        <div class="color-input-group">
                                            <input type="color" id="inputBorderColorInput" value="#d32f2f">
                                            <span class="color-preview" id="inputBorderColorPreview"></span>
                                        </div>
                                    </div>
                                    <div class="setting-item">
                                        <label>輸入框聚焦邊框顏色</label>
                                        <div class="color-input-group">
                                            <input type="color" id="inputBorderColorFocusInput" value="#b71c1c">
                                            <span class="color-preview" id="inputBorderColorFocusPreview"></span>
                                        </div>
                                    </div>
                                    </div>
                                </div>

                                <!-- 功能選單設置 -->
                                <div class="settings-section">
                                    <h4 class="section-title collapsible" onclick="toggleSection(this)">
                                        🎯 功能選單 <span class="toggle-icon">▼</span>
                                    </h4>
                                    <div class="section-content">
                                    <div class="setting-item">
                                        <label>容器背景顏色</label>
                                        <div class="color-input-group">
                                            <input type="color" id="functionMenuBgInput" value="#ffffff">
                                            <span class="color-preview" id="functionMenuBgPreview"></span>
                                        </div>
                                    </div>
                                    <div class="setting-item">
                                        <label>容器邊框顏色</label>
                                        <div class="color-input-group">
                                            <input type="color" id="functionMenuBorderInput" value="#e0e0e0">
                                            <span class="color-preview" id="functionMenuBorderPreview"></span>
                                        </div>
                                    </div>
                                    <div class="setting-item">
                                        <label>容器陰影顏色</label>
                                        <div class="color-input-group">
                                            <input type="color" id="functionMenuShadowInput" value="#000000">
                                            <span class="color-preview" id="functionMenuShadowPreview"></span>
                                        </div>
                                    </div>
                                    <div class="setting-item">
                                        <label>文字顏色</label>
                                        <div class="color-input-group">
                                            <input type="color" id="functionMenuTextColorInput" value="#333333">
                                            <span class="color-preview" id="functionMenuTextColorPreview"></span>
                                        </div>
                                    </div>
                                    </div>
                                </div>

            <!-- 字體和樣式設置 -->
            <div class="settings-section">
              <h4 class="section-title collapsible" onclick="toggleSection(this)">
                🔤 字體與樣式 <span class="toggle-icon">▼</span>
              </h4>
              <div class="section-content">
              <div class="setting-item">
                <label>字體選擇</label>
                <select id="themeFontInput" class="styled-select">
            <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, '思源黑體', '苹方', '微軟雅黑', sans-serif">默認/系統字體</option>
            <option value="'思源黑體', 'Source Han Sans', sans-serif">思源黑體</option>
            <option value="'苹方', 'PingFang SC', sans-serif">苹方</option>
            <option value="'微軟雅黑', 'Microsoft YaHei', sans-serif">微軟雅黑</option>
            <option value="'Noto Sans TC', '思源黑體', sans-serif">Noto Sans TC</option>
            <option value="'Noto Sans SC', '思源黑體', sans-serif">Noto Sans SC</option>
            <option value="'ZCOOL KuaiLe', '微軟正黑體', Arial, sans-serif">ZCOOL KuaiLe 快樂體</option>
            <option value="'Zs570', '微軟正黑體', Arial, sans-serif">Zeoseven 570</option>
          </select>
              </div>
              <div class="setting-item">
                <label>泡泡立體樣式</label>
                <select id="bubbleStyleInput" class="styled-select">
            <option value="style-classic">經典立體</option>
            <option value="style-emboss">浮雕</option>
            <option value="style-neon">霓虹</option>
            <option value="style-glass">玻璃</option>
            <option value="style-metal">金屬</option>
            <option value="style-soft">軟陰影</option>
            <option value="">無（純色）</option>
          </select>
              </div>
              </div>
            </div>

            <!-- 按鈕顏色設置 -->
            <div class="settings-section">
              <h4 class="section-title collapsible" onclick="toggleSection(this)">
                🔘 按鈕顏色 <span class="toggle-icon">▼</span>
              </h4>
              <div class="section-content">
                <div class="setting-item">
                  <label>取消類型按鈕背景色</label>
                  <div class="color-input-group">
                    <input type="color" id="cancelButtonBgInput" value="#6c757d">
                    <span class="color-preview" id="cancelButtonBgPreview"></span>
                  </div>
                </div>
                <div class="setting-item">
                  <label>取消類型按鈕文字色</label>
                  <div class="color-input-group">
                    <input type="color" id="cancelButtonTextInput" value="#ffffff">
                    <span class="color-preview" id="cancelButtonTextPreview"></span>
                  </div>
                </div>
                <div class="setting-item">
                  <label>確定類型按鈕背景色</label>
                  <div class="color-input-group">
                    <input type="color" id="confirmButtonBgInput" value="#007bff">
                    <span class="color-preview" id="confirmButtonBgPreview"></span>
                  </div>
                </div>
                <div class="setting-item">
                  <label>確定類型按鈕文字色</label>
                  <div class="color-input-group">
                    <input type="color" id="confirmButtonTextInput" value="#ffffff">
                    <span class="color-preview" id="confirmButtonTextPreview"></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 浮動助手設置 -->
            <div class="settings-section">
              <h4 class="section-title collapsible" onclick="toggleSection(this)">
                🤖 浮動助手 <span class="toggle-icon">▼</span>
              </h4>
              <div class="section-content">
              <div class="setting-item">
                <label>圖示 URL</label>
                <input type="text" id="floatingAssistantIconUrlInput" placeholder="https://..." class="styled-input">
              </div>
              
              <div style="margin-top: 20px; text-align: center;">
                <div style="color: var(--modal-text-color); margin-bottom: 8px;">或</div>
              </div>
              
              <div class="setting-item">
                <label>上傳圖示</label>
                <div class="floating-assistant-upload-section">
                  <input type="file" id="floatingAssistantIconUpload" accept="image/*" style="display: none;">
                  <button type="button" class="floating-assistant-upload-btn" onclick="document.getElementById('floatingAssistantIconUpload').click()">
                    <img id="floatingAssistantIconPreview" src="https://files.catbox.moe/ew2nex.png" alt="圖示預覽" class="floating-assistant-icon-preview">
                    <span class="floating-assistant-upload-text">選擇圖示</span>
                  </button>
                </div>
              </div>
              
              <div id="floatingAssistantUploadedIconsList" style="margin-top: 15px; display: none;">
                <label style="color: var(--modal-text-color); margin-bottom: 8px; display: block;">已上傳的圖示:</label>
                <div id="floatingAssistantUploadedIconsContainer" class="floating-assistant-uploaded-icons-container">
                  <!-- 已上傳的圖示將在這裡顯示 -->
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="window.closeThemeSettingsModal()">取消</button>
          <button class="btn-primary" onclick="window.applyThemeSettings()">應用設定</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // 添加樣式
    const style = document.createElement('style');
    style.textContent = `
      .theme-settings-modal {
        max-width: 480px !important;
        max-height: 80vh !important;
        width: 90% !important;
      }
      
      .theme-settings-modal .modal-content {
        max-height: 80vh !important;
        display: flex !important;
        flex-direction: column !important;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        border-radius: 16px !important;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3) !important;
        overflow: hidden !important;
      }
      
      .theme-settings-modal .modal-header {
        background: var(--header-bg) !important;
        border-bottom: 1px solid rgba(255,255,255,0.2) !important;
        padding: 20px 24px !important;
        margin: 0 !important;
      }
      
      .theme-settings-modal .modal-header h3 {
        color: var(--panel-text-color) !important;
        font-size: 20px !important;
        font-weight: 600 !important;
        margin: 0 !important;
      }
      

      
      .theme-settings-modal .modal-body {
        flex: 1 !important;
        overflow-y: auto !important;
        padding: 0 !important;
        background: rgba(255,255,255,0.95) !important;
        backdrop-filter: blur(10px) !important;
      }
      
      .settings-container {
        padding: 20px !important;
      }
      
      .settings-section {
        margin-bottom: 24px !important;
        background: white !important;
        border-radius: 12px !important;
        padding: 16px !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
        border: 1px solid rgba(0,0,0,0.05) !important;
      }
      
      .section-title {
        color: #333 !important;
        font-size: 16px !important;
        font-weight: 600 !important;
        margin: 0 0 16px 0 !important;
        padding-bottom: 8px !important;
        border-bottom: 2px solid #667eea !important;
        cursor: pointer !important;
        user-select: none !important;
        transition: all 0.3s ease !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
      }
      
      .section-title:hover {
        color: #667eea !important;
        border-bottom-color: #4facfe !important;
      }
      
      .section-title.collapsed {
        border-bottom: none !important;
        margin-bottom: 0 !important;
      }
      
      .section-title.collapsed .toggle-icon {
        transform: rotate(-90deg) !important;
      }
      
      .toggle-icon {
        font-size: 12px !important;
        transition: transform 0.3s ease !important;
        color: #667eea !important;
      }
      
      .section-content {
        overflow: hidden !important;
        transition: all 0.3s ease !important;
        max-height: 500px !important;
        opacity: 1 !important;
      }
      
      .section-content.collapsed {
        max-height: 0 !important;
        opacity: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      
      .setting-item {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        margin-bottom: 12px !important;
        padding: 8px 0 !important;
      }
      
      .setting-item:last-child {
        margin-bottom: 0 !important;
      }
      
      .setting-item label {
        color: #555 !important;
        font-size: 14px !important;
        font-weight: 500 !important;
        flex: 1 !important;
        margin: 0 !important;
      }
      
      .color-input-group {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
      }
      
      .color-input-group input[type="color"] {
        width: 40px !important;
        height: 40px !important;
        border: none !important;
        border-radius: 8px !important;
        cursor: pointer !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
        transition: all 0.3s ease !important;
      }
      
      .color-input-group input[type="color"]:hover {
        transform: scale(1.05) !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
      }
      
      .color-preview {
        width: 24px !important;
        height: 24px !important;
        border-radius: 6px !important;
        border: 2px solid #ddd !important;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.1) !important;
      }
      
      .styled-select, .styled-input {
        padding: 8px 12px !important;
        border: 2px solid #999 !important;
        border-radius: 8px !important;
        font-size: 14px !important;
        background: white !important;
        color: #333 !important;
        transition: all 0.3s ease !important;
        min-width: 120px !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.15) !important;
      }
      
      .styled-select:focus, .styled-input:focus {
        outline: none !important;
        border-color: #667eea !important;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2), 0 2px 6px rgba(0,0,0,0.15) !important;
      }
      
      .styled-input {
        width: 200px !important;
      }
      
      .theme-settings-modal .modal-footer {
        background: rgba(255,255,255,0.1) !important;
        backdrop-filter: blur(10px) !important;
        border-top: 1px solid rgba(255,255,255,0.2) !important;
        padding: 16px 24px !important;
        margin: 0 !important;
        display: flex !important;
        justify-content: flex-end !important;
        gap: 12px !important;
      }
      
      .btn-primary, .btn-secondary {
        padding: 10px 20px !important;
        border: none !important;
        border-radius: 8px !important;
        font-size: 14px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: all 0.3s ease !important;
        min-width: 80px !important;
      }
      
      .btn-primary {
        background: var(--confirm-button-bg, #007bff) !important;
        color: var(--confirm-button-text, #ffffff) !important;
        box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3) !important;
      }
      
      .btn-primary:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 6px 16px rgba(0, 123, 255, 0.4) !important;
        filter: brightness(1.1) !important;
      }
      
      .btn-secondary {
        background: var(--cancel-button-bg, #6c757d) !important;
        color: var(--cancel-button-text, #ffffff) !important;
        border: 1px solid var(--cancel-button-bg, #6c757d) !important;
      }
      
      .btn-secondary:hover {
        filter: brightness(1.1) !important;
        transform: translateY(-1px) !important;
      }
      
      /* 滾動條樣式 */
      .theme-settings-modal .modal-body::-webkit-scrollbar {
        width: 6px !important;
      }
      
      .theme-settings-modal .modal-body::-webkit-scrollbar-track {
        background: rgba(255,255,255,0.1) !important;
        border-radius: 3px !important;
      }
      
      .theme-settings-modal .modal-body::-webkit-scrollbar-thumb {
        background: rgba(102, 126, 234, 0.6) !important;
        border-radius: 3px !important;
        transition: all 0.3s ease !important;
      }
      
      .theme-settings-modal .modal-body::-webkit-scrollbar-thumb:hover {
        background: rgba(102, 126, 234, 0.8) !important;
      }
      
      /* 響應式設計 */
      @media (max-width: 480px) {
        .theme-settings-modal {
          width: 95% !important;
          max-height: 85vh !important;
        }
        
        .setting-item {
          flex-direction: column !important;
          align-items: flex-start !important;
          gap: 8px !important;
        }
        
        .styled-input {
          width: 100% !important;
        }
      }
      
      /* 浮動助手上傳樣式 */
      .floating-assistant-upload-section {
        display: flex;
        justify-content: center;
        margin-bottom: 15px;
      }
      
      .floating-assistant-upload-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 20px;
        border: 2px dashed #999;
        border-radius: 12px;
        background: #f8f9fa;
        cursor: pointer;
        transition: all 0.3s ease;
        min-width: 120px;
        min-height: 120px;
      }
      
      .floating-assistant-upload-btn:hover {
        border-color: #667eea;
        background: #f0f2ff;
      }
      
      .floating-assistant-icon-preview {
        width: 60px;
        height: 60px;
        border-radius: 8px;
        object-fit: cover;
        margin-bottom: 8px;
        border: 1px solid #ddd;
      }
      
      .floating-assistant-upload-text {
        font-size: 14px;
        color: #666;
        font-weight: 500;
      }
      
      .floating-assistant-uploaded-icons-container {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
        gap: 10px;
        max-height: 200px;
        overflow-y: auto;
        padding: 10px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        background: #f8f9fa;
      }
      
      .floating-assistant-uploaded-icon-item {
        position: relative;
        cursor: pointer;
        border-radius: 8px;
        overflow: hidden;
        transition: all 0.3s ease;
      }
      
      .floating-assistant-uploaded-icon-item:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      }
      
      .floating-assistant-uploaded-icon-item img {
        width: 100%;
        height: 80px;
        object-fit: cover;
        border-radius: 8px;
      }
      
      .floating-assistant-uploaded-icon-item .delete-btn {
        position: absolute;
        top: 2px;
        right: 2px;
        background: rgba(255, 0, 0, 0.8);
        color: white;
        border: none;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .floating-assistant-uploaded-icon-item .delete-btn:hover {
        background: rgba(255, 0, 0, 1);
      }
    `;
    document.head.appendChild(style);
    
    // 設置顏色預覽
    setTimeout(() => {
      updateColorPreviews();
    }, 100);
    
    // 初始化浮動助手上傳功能
    initFloatingAssistantUpload();
  }

  // 打開/關閉窗口
  window.openThemeSettingsModal = function() {
    injectThemeSettingsModal();
    // 初始化顏色/字體/立體樣式
    const mainThemeColor = localStorage.getItem('mainThemeColor') || '#1a1a1a';
    document.getElementById('mainThemeColorInput').value = mainThemeColor.trim().replace(/^#|0x/, '#');
    const color = localStorage.getItem('themeColor') || getComputedStyle(document.documentElement).getPropertyValue('--main-color') || '#d32f2f';
    document.getElementById('themeColorInput').value = color.trim().replace(/^#|0x/, '#');
    const userBubbleColor = localStorage.getItem('userBubbleColor') || getComputedStyle(document.documentElement).getPropertyValue('--user-bubble-color') || '#23272e';
    document.getElementById('userBubbleColorInput').value = userBubbleColor.trim().replace(/^#|0x/, '#');
    const contentBgColor = localStorage.getItem('contentBgColor') || getComputedStyle(document.documentElement).getPropertyValue('--content-bg') || '#f7f7f7';
    document.getElementById('contentBgColorInput').value = contentBgColor.trim().replace(/^#|0x/, '#');
    const contentTextColor = localStorage.getItem('contentTextColor') || getComputedStyle(document.documentElement).getPropertyValue('--content-text-color') || '#222222';
    document.getElementById('contentTextColorInput').value = contentTextColor.trim().replace(/^#|0x/, '#');
    const modalTextColor = localStorage.getItem('modalTextColor') || '#333333';
    document.getElementById('modalTextColorInput').value = modalTextColor.trim().replace(/^#|0x/, '#');
    const modalSecondaryTextColor = localStorage.getItem('modalSecondaryTextColor') || '#666666';
    document.getElementById('modalSecondaryTextColorInput').value = modalSecondaryTextColor.trim().replace(/^#|0x/, '#');
    const modalHintTextColor = localStorage.getItem('modalHintTextColor') || '#888888';
    document.getElementById('modalHintTextColorInput').value = modalHintTextColor.trim().replace(/^#|0x/, '#');
    const footerTextColor = localStorage.getItem('footerTextColor') || '#ffffff';
    document.getElementById('footerTextColorInput').value = footerTextColor.trim().replace(/^#|0x/, '#');
    const footerSecondaryTextColor = localStorage.getItem('footerSecondaryTextColor') || '#cccccc';
    document.getElementById('footerSecondaryTextColorInput').value = footerSecondaryTextColor.trim().replace(/^#|0x/, '#');
    const footerHintTextColor = localStorage.getItem('footerHintTextColor') || '#aaaaaa';
    document.getElementById('footerHintTextColorInput').value = footerHintTextColor.trim().replace(/^#|0x/, '#');
    const functionMenuBg = localStorage.getItem('functionMenuBg') || '#ffffff';
    document.getElementById('functionMenuBgInput').value = functionMenuBg.trim().replace(/^#|0x/, '#');
    const functionMenuBorder = localStorage.getItem('functionMenuBorder') || '#e0e0e0';
    document.getElementById('functionMenuBorderInput').value = functionMenuBorder.trim().replace(/^#|0x/, '#');
    const functionMenuShadow = localStorage.getItem('functionMenuShadow') || '#000000';
    document.getElementById('functionMenuShadowInput').value = functionMenuShadow.trim().replace(/^#|0x/, '#');
    const functionMenuTextColor = localStorage.getItem('functionMenuTextColor') || '#333333';
    document.getElementById('functionMenuTextColorInput').value = functionMenuTextColor.trim().replace(/^#|0x/, '#');
    const cancelButtonBg = localStorage.getItem('cancelButtonBg') || '#6c757d';
    document.getElementById('cancelButtonBgInput').value = cancelButtonBg.trim().replace(/^#|0x/, '#');
    const cancelButtonText = localStorage.getItem('cancelButtonText') || '#ffffff';
    document.getElementById('cancelButtonTextInput').value = cancelButtonText.trim().replace(/^#|0x/, '#');
    const confirmButtonBg = localStorage.getItem('confirmButtonBg') || '#007bff';
    document.getElementById('confirmButtonBgInput').value = confirmButtonBg.trim().replace(/^#|0x/, '#');
    const confirmButtonText = localStorage.getItem('confirmButtonText') || '#ffffff';
    document.getElementById('confirmButtonTextInput').value = confirmButtonText.trim().replace(/^#|0x/, '#');
    const inputBorderColor = localStorage.getItem('inputBorderColor') || '#d32f2f';
    document.getElementById('inputBorderColorInput').value = inputBorderColor.trim().replace(/^#|0x/, '#');
    const inputBorderColorFocus = localStorage.getItem('inputBorderColorFocus') || '#b71c1c';
    document.getElementById('inputBorderColorFocusInput').value = inputBorderColorFocus.trim().replace(/^#|0x/, '#');
    const font = localStorage.getItem('themeFont') || getComputedStyle(document.documentElement).getPropertyValue('--font-family');
    document.getElementById('themeFontInput').value = font.trim();
    const bubbleStyle = localStorage.getItem('bubbleStyle') || 'style-classic';
    document.getElementById('bubbleStyleInput').value = bubbleStyle;
    // 新增：浮動助手圖示 URL
    const iconUrl = localStorage.getItem('floating_assistant_icon_url') || '';
    document.getElementById('floatingAssistantIconUrlInput').value = iconUrl;
    
    // 嘗試從 IndexedDB 載入設置圖示
    if (typeof getFloatingAssistantSettingIcon === 'function') {
        getFloatingAssistantSettingIcon().then(settingIcon => {
            if (settingIcon) {
                document.getElementById('floatingAssistantIconUrlInput').value = settingIcon;
                const preview = document.getElementById('floatingAssistantIconPreview');
                if (preview) {
                    preview.src = settingIcon;
                }
            }
        }).catch(error => {
            console.error('[浮動助手] 載入設置圖示失敗:', error);
        });
    }
    
    // 設置顏色預覽
    updateColorPreviews();
    
    // 添加顏色變更事件監聽器
    setupColorChangeListeners();
    
    // 初始化摺疊狀態（預設展開第一個，其他摺疊）
    const sections = document.querySelectorAll('.settings-section');
    sections.forEach((section, index) => {
      const title = section.querySelector('.section-title');
      const content = section.querySelector('.section-content');
      if (index === 0) {
        // 第一個區塊保持展開
        content.classList.remove('collapsed');
        title.classList.remove('collapsed');
      } else {
        // 其他區塊預設摺疊
        content.classList.add('collapsed');
        title.classList.add('collapsed');
      }
    });
    
    document.getElementById('themeSettingsModal').classList.remove('hidden');
  };
  window.closeThemeSettingsModal = function() {
    document.getElementById('themeSettingsModal').classList.add('hidden');
  };

  // 工具函數：根據主色自動生成亮色/暗色
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    const num = parseInt(hex, 16);
    return [num >> 16, (num >> 8) & 0xff, num & 0xff];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  function lighten(hex, percent = 0.3) {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(
      Math.min(255, Math.round(r + (255 - r) * percent)),
      Math.min(255, Math.round(g + (255 - g) * percent)),
      Math.min(255, Math.round(b + (255 - b) * percent))
    );
  }
  function darken(hex, percent = 0.3) {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(
      Math.max(0, Math.round(r * (1 - percent))),
      Math.max(0, Math.round(g * (1 - percent))),
      Math.max(0, Math.round(b * (1 - percent)))
    );
  }

  // 新增：切換泡泡立體樣式時同步所有泡泡
  function applyBubbleStyleClass(styleClass) {
    window.currentBubbleStyle = styleClass;
    const styleClasses = ['style-classic', 'style-emboss', 'style-neon', 'style-glass', 'style-metal', 'style-soft'];
    const allBubbles = document.querySelectorAll('.sent-bubble, .received-bubble');
    allBubbles.forEach(bubble => {
      styleClasses.forEach(cls => bubble.classList.remove(cls));
      if (styleClass) bubble.classList.add(styleClass);
    });
  }
  window.applyBubbleStyleClass = applyBubbleStyleClass;

  function ensureFontLoaded(fontValue) {
    // ZCOOL KuaiLe
    if (fontValue.includes('ZCOOL KuaiLe')) {
      if (!document.getElementById('font-link-zcool')) {
        const link = document.createElement('link');
        link.id = 'font-link-zcool';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&display=swap';
        document.head.appendChild(link);
      }
    }
    // Zeoseven 570
    if (fontValue.includes('Zs570')) {
      if (!document.getElementById('font-link-zs570')) {
        const style = document.createElement('style');
        style.id = 'font-link-zs570';
        style.innerText = "@import url('https://fontsapi.zeoseven.com/570/main/result.css');";
        document.head.appendChild(style);
      }
    }
  }

  function getContrastYIQ(hexcolor){
    hexcolor = hexcolor.replace('#', '');
    var r = parseInt(hexcolor.substr(0,2),16);
    var g = parseInt(hexcolor.substr(2,2),16);
    var b = parseInt(hexcolor.substr(4,2),16);
    var yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 180) ? '#222' : '#fff';
  }

  // 更新顏色預覽
  function updateColorPreviews() {
    const colorInputs = [
      { input: 'mainThemeColorInput', preview: 'mainThemeColorPreview' },
      { input: 'themeColorInput', preview: 'themeColorPreview' },
      { input: 'userBubbleColorInput', preview: 'userBubbleColorPreview' },
      { input: 'contentBgColorInput', preview: 'contentBgColorPreview' },
      { input: 'contentTextColorInput', preview: 'contentTextColorPreview' },
      { input: 'modalTextColorInput', preview: 'modalTextColorPreview' },
      { input: 'modalSecondaryTextColorInput', preview: 'modalSecondaryTextColorPreview' },
      { input: 'modalHintTextColorInput', preview: 'modalHintTextColorPreview' },
      { input: 'footerTextColorInput', preview: 'footerTextColorPreview' },
      { input: 'footerSecondaryTextColorInput', preview: 'footerSecondaryTextColorPreview' },
      { input: 'footerHintTextColorInput', preview: 'footerHintTextColorPreview' },
      { input: 'functionMenuBgInput', preview: 'functionMenuBgPreview' },
      { input: 'functionMenuBorderInput', preview: 'functionMenuBorderPreview' },
      { input: 'functionMenuShadowInput', preview: 'functionMenuShadowPreview' },
      { input: 'functionMenuTextColorInput', preview: 'functionMenuTextColorPreview' },
      { input: 'cancelButtonBgInput', preview: 'cancelButtonBgPreview' },
      { input: 'cancelButtonTextInput', preview: 'cancelButtonTextPreview' },
      { input: 'confirmButtonBgInput', preview: 'confirmButtonBgPreview' },
      { input: 'confirmButtonTextInput', preview: 'confirmButtonTextPreview' },
      { input: 'inputBorderColorInput', preview: 'inputBorderColorPreview' },
      { input: 'inputBorderColorFocusInput', preview: 'inputBorderColorFocusPreview' }
    ];

    colorInputs.forEach(({ input, preview }) => {
      const inputElement = document.getElementById(input);
      const previewElement = document.getElementById(preview);
      if (inputElement && previewElement) {
        const color = inputElement.value;
        previewElement.style.backgroundColor = color;
        previewElement.style.borderColor = color;
      }
    });
  }

  // 摺疊功能
  window.toggleSection = function(element) {
    const section = element.closest('.settings-section');
    const content = section.querySelector('.section-content');
    const isCollapsed = content.classList.contains('collapsed');
    
    if (isCollapsed) {
      // 展開
      content.classList.remove('collapsed');
      element.classList.remove('collapsed');
    } else {
      // 摺疊
      content.classList.add('collapsed');
      element.classList.add('collapsed');
    }
  };

  // 設置顏色變更事件監聽器
  function setupColorChangeListeners() {
    const colorInputs = [
      'mainThemeColorInput', 'themeColorInput', 'userBubbleColorInput',
      'contentBgColorInput', 'contentTextColorInput', 'modalTextColorInput',
      'modalSecondaryTextColorInput', 'modalHintTextColorInput',
      'footerTextColorInput', 'footerSecondaryTextColorInput', 'footerHintTextColorInput',
      'functionMenuBgInput', 'functionMenuBorderInput', 'functionMenuShadowInput', 'functionMenuTextColorInput',
      'cancelButtonBgInput', 'cancelButtonTextInput', 'confirmButtonBgInput', 'confirmButtonTextInput',
      'inputBorderColorInput', 'inputBorderColorFocusInput'
    ];

    colorInputs.forEach(inputId => {
      const input = document.getElementById(inputId);
      if (input) {
        input.addEventListener('input', updateColorPreviews);
        input.addEventListener('change', updateColorPreviews);
      }
    });
  }

  // 應用主題設置
  window.applyThemeSettings = async function() {
    const mainThemeColor = document.getElementById('mainThemeColorInput').value;
    const themeColor = document.getElementById('themeColorInput').value;
    const userBubbleColor = document.getElementById('userBubbleColorInput').value;
    const contentBgColor = document.getElementById('contentBgColorInput').value;
    const contentTextColor = document.getElementById('contentTextColorInput').value;
    const modalTextColor = document.getElementById('modalTextColorInput').value;
    const modalSecondaryTextColor = document.getElementById('modalSecondaryTextColorInput').value;
    const modalHintTextColor = document.getElementById('modalHintTextColorInput').value;
    const footerTextColor = document.getElementById('footerTextColorInput').value;
    const footerSecondaryTextColor = document.getElementById('footerSecondaryTextColorInput').value;
    const footerHintTextColor = document.getElementById('footerHintTextColorInput').value;
    const functionMenuBg = document.getElementById('functionMenuBgInput').value;
    const functionMenuBorder = document.getElementById('functionMenuBorderInput').value;
    const functionMenuShadow = document.getElementById('functionMenuShadowInput').value;
    const functionMenuTextColor = document.getElementById('functionMenuTextColorInput').value;
    const cancelButtonBg = document.getElementById('cancelButtonBgInput').value;
    const cancelButtonText = document.getElementById('cancelButtonTextInput').value;
    const confirmButtonBg = document.getElementById('confirmButtonBgInput').value;
    const confirmButtonText = document.getElementById('confirmButtonTextInput').value;
    const inputBorderColor = document.getElementById('inputBorderColorInput').value;
    const inputBorderColorFocus = document.getElementById('inputBorderColorFocusInput').value;
    const font = document.getElementById('themeFontInput').value;
    const bubbleStyle = document.getElementById('bubbleStyleInput').value;
    // 主題色（自動生成漸變）
    document.documentElement.style.setProperty('--header-bg', `linear-gradient(90deg, ${mainThemeColor} 60%, #1a1a1a 100%)`);
    // 自動設置面板字體顏色
    document.documentElement.style.setProperty('--panel-text-color', getContrastYIQ(mainThemeColor));
    // 角色泡泡顏色
    document.documentElement.style.setProperty('--bubble-color', themeColor);
    document.documentElement.style.setProperty('--bubble-color-light', lighten(themeColor, 0.25));
    document.documentElement.style.setProperty('--bubble-color-dark', darken(themeColor, 0.18));
    // 用戶泡泡顏色
    document.documentElement.style.setProperty('--user-bubble-color', userBubbleColor);
    document.documentElement.style.setProperty('--user-bubble-color-light', lighten(userBubbleColor, 0.25));
    document.documentElement.style.setProperty('--user-bubble-color-dark', darken(userBubbleColor, 0.18));
    // 內容區背景色
    document.documentElement.style.setProperty('--content-bg', contentBgColor);
    // 內容區字體顏色
    document.documentElement.style.setProperty('--content-text-color', contentTextColor);
    // 模態窗口文字顏色
    document.documentElement.style.setProperty('--modal-text-color', modalTextColor);
    document.documentElement.style.setProperty('--modal-secondary-text-color', modalSecondaryTextColor);
    document.documentElement.style.setProperty('--modal-hint-text-color', modalHintTextColor);
    document.documentElement.style.setProperty('--footer-text-color', footerTextColor);
    document.documentElement.style.setProperty('--footer-secondary-text-color', footerSecondaryTextColor);
    document.documentElement.style.setProperty('--footer-hint-text-color', footerHintTextColor);
    document.documentElement.style.setProperty('--function-menu-bg', functionMenuBg);
    document.documentElement.style.setProperty('--function-menu-border', functionMenuBorder);
    document.documentElement.style.setProperty('--function-menu-shadow', functionMenuShadow + '1a'); // 添加透明度
    document.documentElement.style.setProperty('--function-menu-text-color', functionMenuTextColor);
    document.documentElement.style.setProperty('--cancel-button-bg', cancelButtonBg);
    document.documentElement.style.setProperty('--cancel-button-text', cancelButtonText);
    document.documentElement.style.setProperty('--confirm-button-bg', confirmButtonBg);
    document.documentElement.style.setProperty('--confirm-button-text', confirmButtonText);
    document.documentElement.style.setProperty('--input-border-color', inputBorderColor);
    document.documentElement.style.setProperty('--input-border-color-focus', inputBorderColorFocus);
    // 字體
    document.documentElement.style.setProperty('--font-family', font);
    ensureFontLoaded(font);
    // 泡泡立體樣式
    window.applyBubbleStyleClass(bubbleStyle);
    // 浮動助手圖示 URL
    const iconUrl = document.getElementById('floatingAssistantIconUrlInput').value.trim();
    
    try {
      // 檢查是否為 base64 數據（通常以 data:image 開頭）
      if (iconUrl.startsWith('data:image')) {
        // 如果是 base64 數據，存儲到 IndexedDB
        await saveFloatingAssistantIconToDB(iconUrl);
        // 🆕 清除 localStorage 中的舊 URL，避免衝突
        localStorage.removeItem('floating_assistant_icon_url');
        console.log('[浮動助手] 已清除 localStorage 中的舊 URL');
      } else {
        // 如果是普通 URL，存儲到 localStorage
        localStorage.setItem('floating_assistant_icon_url', iconUrl);
        // 🆕 清除 IndexedDB 中的設置圖示
        if (typeof clearFloatingAssistantSettingIcon === 'function') {
          await clearFloatingAssistantSettingIcon();
        }
      }
      
      if (typeof window.updateFloatingAssistantIcon === 'function') {
        await window.updateFloatingAssistantIcon();
      }
    } catch (error) {
      console.error('[浮動助手] 保存圖示失敗:', error);
      alert('保存圖示失敗，請重試！');
      return;
    }
    // localStorage
    localStorage.setItem('mainThemeColor', mainThemeColor);
    localStorage.setItem('themeColor', themeColor);
    localStorage.setItem('userBubbleColor', userBubbleColor);
    localStorage.setItem('contentBgColor', contentBgColor);
    localStorage.setItem('contentTextColor', contentTextColor);
    localStorage.setItem('modalTextColor', modalTextColor);
    localStorage.setItem('modalSecondaryTextColor', modalSecondaryTextColor);
    localStorage.setItem('modalHintTextColor', modalHintTextColor);
    localStorage.setItem('footerTextColor', footerTextColor);
    localStorage.setItem('footerSecondaryTextColor', footerSecondaryTextColor);
    localStorage.setItem('footerHintTextColor', footerHintTextColor);
    localStorage.setItem('functionMenuBg', functionMenuBg);
    localStorage.setItem('functionMenuBorder', functionMenuBorder);
    localStorage.setItem('functionMenuShadow', functionMenuShadow);
    localStorage.setItem('functionMenuTextColor', functionMenuTextColor);
    localStorage.setItem('cancelButtonBg', cancelButtonBg);
    localStorage.setItem('cancelButtonText', cancelButtonText);
    localStorage.setItem('confirmButtonBg', confirmButtonBg);
    localStorage.setItem('confirmButtonText', confirmButtonText);
    localStorage.setItem('inputBorderColor', inputBorderColor);
    localStorage.setItem('inputBorderColorFocus', inputBorderColorFocus);
    localStorage.setItem('themeFont', font);
    localStorage.setItem('bubbleStyle', bubbleStyle);
    window.closeThemeSettingsModal();
  };

  // 頁面加載時自動應用 localStorage 主題
  // 初始化時自動載入 localStorage
  (function() {
    const mainThemeColor = localStorage.getItem('mainThemeColor');
    const themeColor = localStorage.getItem('themeColor');
    const userBubbleColor = localStorage.getItem('userBubbleColor');
    const contentBgColor = localStorage.getItem('contentBgColor');
    const contentTextColor = localStorage.getItem('contentTextColor');
    const modalTextColor = localStorage.getItem('modalTextColor');
    const modalSecondaryTextColor = localStorage.getItem('modalSecondaryTextColor');
    const modalHintTextColor = localStorage.getItem('modalHintTextColor');
    const footerTextColor = localStorage.getItem('footerTextColor');
    const footerSecondaryTextColor = localStorage.getItem('footerSecondaryTextColor');
    const footerHintTextColor = localStorage.getItem('footerHintTextColor');
    const functionMenuBg = localStorage.getItem('functionMenuBg');
    const functionMenuBorder = localStorage.getItem('functionMenuBorder');
    const functionMenuShadow = localStorage.getItem('functionMenuShadow');
    const functionMenuTextColor = localStorage.getItem('functionMenuTextColor');
    const cancelButtonBg = localStorage.getItem('cancelButtonBg');
    const cancelButtonText = localStorage.getItem('cancelButtonText');
    const confirmButtonBg = localStorage.getItem('confirmButtonBg');
    const confirmButtonText = localStorage.getItem('confirmButtonText');
    const inputBorderColor = localStorage.getItem('inputBorderColor');
    const inputBorderColorFocus = localStorage.getItem('inputBorderColorFocus');
    const font = localStorage.getItem('themeFont');
    const bubbleStyle = localStorage.getItem('bubbleStyle');
    if (mainThemeColor) {
      document.documentElement.style.setProperty('--header-bg', `linear-gradient(90deg, ${mainThemeColor} 60%, #1a1a1a 100%)`);
      document.documentElement.style.setProperty('--panel-text-color', getContrastYIQ(mainThemeColor));
    }
    if (themeColor) {
      document.documentElement.style.setProperty('--bubble-color', themeColor);
      document.documentElement.style.setProperty('--bubble-color-light', lighten(themeColor, 0.25));
      document.documentElement.style.setProperty('--bubble-color-dark', darken(themeColor, 0.18));
    }
    if (userBubbleColor) {
      document.documentElement.style.setProperty('--user-bubble-color', userBubbleColor);
      document.documentElement.style.setProperty('--user-bubble-color-light', lighten(userBubbleColor, 0.25));
      document.documentElement.style.setProperty('--user-bubble-color-dark', darken(userBubbleColor, 0.18));
    }
    if (contentBgColor) {
      document.documentElement.style.setProperty('--content-bg', contentBgColor);
    }
    if (contentTextColor) {
      document.documentElement.style.setProperty('--content-text-color', contentTextColor);
    }
    if (modalTextColor) {
      document.documentElement.style.setProperty('--modal-text-color', modalTextColor);
    }
    if (modalSecondaryTextColor) {
      document.documentElement.style.setProperty('--modal-secondary-text-color', modalSecondaryTextColor);
    }
    if (modalHintTextColor) {
      document.documentElement.style.setProperty('--modal-hint-text-color', modalHintTextColor);
    }
    if (footerTextColor) {
      document.documentElement.style.setProperty('--footer-text-color', footerTextColor);
    }
    if (footerSecondaryTextColor) {
      document.documentElement.style.setProperty('--footer-secondary-text-color', footerSecondaryTextColor);
    }
    if (footerHintTextColor) {
      document.documentElement.style.setProperty('--footer-hint-text-color', footerHintTextColor);
    }
    if (functionMenuBg) {
      document.documentElement.style.setProperty('--function-menu-bg', functionMenuBg);
    }
    if (functionMenuBorder) {
      document.documentElement.style.setProperty('--function-menu-border', functionMenuBorder);
    }
    if (functionMenuShadow) {
      document.documentElement.style.setProperty('--function-menu-shadow', functionMenuShadow + '1a');
    }
    if (functionMenuTextColor) {
      document.documentElement.style.setProperty('--function-menu-text-color', functionMenuTextColor);
    }
    if (cancelButtonBg) {
      document.documentElement.style.setProperty('--cancel-button-bg', cancelButtonBg);
    }
    if (cancelButtonText) {
      document.documentElement.style.setProperty('--cancel-button-text', cancelButtonText);
    }
    if (confirmButtonBg) {
      document.documentElement.style.setProperty('--confirm-button-bg', confirmButtonBg);
    }
    if (confirmButtonText) {
      document.documentElement.style.setProperty('--confirm-button-text', confirmButtonText);
    }
    if (inputBorderColor) {
      document.documentElement.style.setProperty('--input-border-color', inputBorderColor);
    }
    if (inputBorderColorFocus) {
      document.documentElement.style.setProperty('--input-border-color-focus', inputBorderColorFocus);
    }
    if (font) {
      document.documentElement.style.setProperty('--font-family', font);
      ensureFontLoaded(font);
    }
    if (bubbleStyle) {
      window.applyBubbleStyleClass(bubbleStyle);
    }
  })();
})();

// =======================================================================
//                          浮動助手圖示上傳功能
// =======================================================================

let floatingAssistantDB = null; // IndexedDB 數據庫實例

/**
 * 初始化浮動助手 IndexedDB 數據庫
 */
async function initFloatingAssistantDB() {
    return new Promise((resolve, reject) => {
        console.log('[浮動助手] 開始初始化 IndexedDB');
        
        const request = indexedDB.open('FloatingAssistantIconsDB', 1);
        
        request.onerror = () => {
            console.error('[浮動助手] IndexedDB 打開失敗:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            floatingAssistantDB = request.result;
            console.log('[浮動助手] IndexedDB 初始化成功，數據庫:', floatingAssistantDB);
            resolve(floatingAssistantDB);
        };
        
        request.onupgradeneeded = (event) => {
            console.log('[浮動助手] IndexedDB 需要升級');
            const db = event.target.result;
            
            // 創建浮動助手圖示存儲
            if (!db.objectStoreNames.contains('floatingAssistantIcons')) {
                const store = db.createObjectStore('floatingAssistantIcons', { keyPath: 'id', autoIncrement: true });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('name', 'name', { unique: false });
                console.log('[浮動助手] 創建 objectStore: floatingAssistantIcons');
            }
        };
    });
}

/**
 * 保存浮動助手圖示到 IndexedDB
 */
async function saveFloatingAssistantIcon(file) {
    if (!floatingAssistantDB) {
        await initFloatingAssistantDB();
    }
    
    // 先將文件轉換為 base64
    const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
    
    // 然後在事務中保存數據
    return new Promise((resolve, reject) => {
        const transaction = floatingAssistantDB.transaction(['floatingAssistantIcons'], 'readwrite');
        const store = transaction.objectStore('floatingAssistantIcons');
        
        const iconData = {
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64Data,
            timestamp: Date.now()
        };
        
        const request = store.add(iconData);
        
        request.onsuccess = () => {
            console.log('[浮動助手] 圖示保存成功，ID:', request.result);
            resolve(request.result);
        };
        
        request.onerror = () => {
            console.error('[浮動助手] 圖示保存失敗:', request.error);
            reject(request.error);
        };
        
        transaction.onerror = () => {
            console.error('[浮動助手] 事務失敗:', transaction.error);
            reject(transaction.error);
        };
    });
}

/**
 * 從 IndexedDB 獲取所有浮動助手圖示
 */
async function getAllFloatingAssistantIcons() {
    if (!floatingAssistantDB) {
        await initFloatingAssistantDB();
    }
    
    return new Promise((resolve, reject) => {
        const transaction = floatingAssistantDB.transaction(['floatingAssistantIcons'], 'readonly');
        const store = transaction.objectStore('floatingAssistantIcons');
        const request = store.getAll();
        
        request.onsuccess = () => {
            console.log('[浮動助手] 獲取到', request.result.length, '個圖示');
            resolve(request.result);
        };
        
        request.onerror = () => {
            console.error('[浮動助手] 獲取圖示失敗:', request.error);
            reject(request.error);
        };
    });
}

/**
 * 從 IndexedDB 刪除浮動助手圖示
 */
async function deleteFloatingAssistantIcon(id) {
    if (!floatingAssistantDB) {
        await initFloatingAssistantDB();
    }
    
    return new Promise((resolve, reject) => {
        const transaction = floatingAssistantDB.transaction(['floatingAssistantIcons'], 'readwrite');
        const store = transaction.objectStore('floatingAssistantIcons');
        const request = store.delete(id);
        
        request.onsuccess = () => {
            console.log('[浮動助手] 圖示刪除成功，ID:', id);
            resolve();
        };
        
        request.onerror = () => {
            console.error('[浮動助手] 圖示刪除失敗:', request.error);
            reject(request.error);
        };
    });
}

/**
 * 初始化浮動助手圖示上傳功能
 */
async function initFloatingAssistantUpload() {
    const fileInput = document.getElementById('floatingAssistantIconUpload');
    if (!fileInput) {
        console.warn('[浮動助手] 找不到文件輸入元素');
        return;
    }
    
    // 移除舊的事件監聽器（如果有的話）
    fileInput.removeEventListener('change', handleFloatingAssistantIconUpload);
    // 添加新的事件監聽器
    fileInput.addEventListener('change', handleFloatingAssistantIconUpload);
    
    console.log('[浮動助手] 上傳功能初始化完成');
    
    // 載入已上傳的圖示
    try {
        await loadUploadedFloatingAssistantIcons();
    } catch (error) {
        console.error('[浮動助手] 載入已上傳圖示失敗:', error);
    }
}

/**
 * 處理浮動助手圖示上傳
 */
async function handleFloatingAssistantIconUpload(event) {
    console.log('[浮動助手] 文件選擇事件觸發');
    
    const file = event.target.files[0];
    if (!file) {
        console.log('[浮動助手] 沒有選擇文件');
        return;
    }
    
    console.log('[浮動助手] 選擇的文件:', file.name, '大小:', file.size, '類型:', file.type);
    
    // 檢查文件類型
    if (!file.type.startsWith('image/')) {
        alert('請選擇圖片文件！');
        return;
    }
    
    // 檢查文件大小 (限制為 2MB)
    if (file.size > 2 * 1024 * 1024) {
        alert('圖片大小不能超過 2MB！');
        return;
    }
    
    try {
        console.log('[浮動助手] 開始上傳圖示:', file.name);
        
        // 保存到 IndexedDB
        const iconId = await saveFloatingAssistantIcon(file);
        
        // 更新預覽
        updateFloatingAssistantIconPreview(file);
        
        // 重新載入已上傳的圖示列表
        await loadUploadedFloatingAssistantIcons();
        
        console.log('[浮動助手] 圖示上傳完成，ID:', iconId);
        
        // 清空文件輸入
        event.target.value = '';
        
    } catch (error) {
        console.error('[浮動助手] 上傳失敗:', error);
        alert('圖示上傳失敗，請重試！');
    }
}

/**
 * 更新浮動助手圖示預覽
 */
function updateFloatingAssistantIconPreview(file) {
    const preview = document.getElementById('floatingAssistantIconPreview');
    if (!preview) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        preview.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/**
 * 載入已上傳的浮動助手圖示
 */
async function loadUploadedFloatingAssistantIcons() {
    try {
        const icons = await getAllFloatingAssistantIcons();
        const container = document.getElementById('floatingAssistantUploadedIconsContainer');
        const listContainer = document.getElementById('floatingAssistantUploadedIconsList');
        
        if (!container || !listContainer) return;
        
        if (icons.length === 0) {
            listContainer.style.display = 'none';
            return;
        }
        
        listContainer.style.display = 'block';
        container.innerHTML = '';
        
        icons.forEach(icon => {
            const iconItem = document.createElement('div');
            iconItem.className = 'floating-assistant-uploaded-icon-item';
            iconItem.innerHTML = `
                <img src="${icon.data}" alt="${icon.name}" onclick="selectFloatingAssistantIcon('${icon.data}')">
                <button class="delete-btn" onclick="deleteFloatingAssistantIconFromList(${icon.id})" title="刪除">×</button>
            `;
            container.appendChild(iconItem);
        });
        
        console.log('[浮動助手] 已載入', icons.length, '個圖示');
        
    } catch (error) {
        console.error('[浮動助手] 載入圖示列表失敗:', error);
    }
}

/**
 * 保存浮動助手圖示到 IndexedDB（用於設置）
 */
async function saveFloatingAssistantIconToDB(iconData) {
    if (!floatingAssistantDB) {
        await initFloatingAssistantDB();
    }
    
    return new Promise((resolve, reject) => {
        const transaction = floatingAssistantDB.transaction(['floatingAssistantIcons'], 'readwrite');
        const store = transaction.objectStore('floatingAssistantIcons');
        
        // 先清除舊的設置圖示
        const clearRequest = store.clear();
        
        clearRequest.onsuccess = () => {
            // 保存新的設置圖示
            const iconDataObj = {
                name: 'floating_assistant_icon',
                type: 'image/png',
                size: iconData.length,
                data: iconData,
                timestamp: Date.now(),
                isSetting: true // 標記為設置圖示
            };
            
            const request = store.add(iconDataObj);
            
            request.onsuccess = () => {
                console.log('[浮動助手] 設置圖示保存成功，ID:', request.result);
                resolve(request.result);
            };
            
            request.onerror = () => {
                console.error('[浮動助手] 設置圖示保存失敗:', request.error);
                reject(request.error);
            };
        };
        
        clearRequest.onerror = () => {
            console.error('[浮動助手] 清除舊設置圖示失敗:', clearRequest.error);
            reject(clearRequest.error);
        };
        
        transaction.onerror = () => {
            console.error('[浮動助手] 事務失敗:', transaction.error);
            reject(transaction.error);
        };
    });
}

/**
 * 從 IndexedDB 獲取浮動助手設置圖示
 */
async function getFloatingAssistantSettingIcon() {
    if (!floatingAssistantDB) {
        await initFloatingAssistantDB();
    }
    
    return new Promise((resolve, reject) => {
        const transaction = floatingAssistantDB.transaction(['floatingAssistantIcons'], 'readonly');
        const store = transaction.objectStore('floatingAssistantIcons');
        const request = store.getAll();
        
        request.onsuccess = () => {
            const icons = request.result;
            const settingIcon = icons.find(icon => icon.isSetting);
            if (settingIcon) {
                console.log('[浮動助手] 找到設置圖示');
                resolve(settingIcon.data);
            } else {
                console.log('[浮動助手] 沒有找到設置圖示');
                resolve(null);
            }
        };
        
        request.onerror = () => {
            console.error('[浮動助手] 獲取設置圖示失敗:', request.error);
            reject(request.error);
        };
    });
}

/**
 * 清除浮動助手設置圖示
 */
async function clearFloatingAssistantSettingIcon() {
    if (!floatingAssistantDB) {
        await initFloatingAssistantDB();
    }
    
    return new Promise((resolve, reject) => {
        const transaction = floatingAssistantDB.transaction(['floatingAssistantIcons'], 'readwrite');
        const store = transaction.objectStore('floatingAssistantIcons');
        const request = store.clear();
        
        request.onsuccess = () => {
            console.log('[浮動助手] 設置圖示已清除');
            resolve();
        };
        
        request.onerror = () => {
            console.error('[浮動助手] 清除設置圖示失敗:', request.error);
            reject(request.error);
        };
    });
}

/**
 * 選擇浮動助手圖示
 */
function selectFloatingAssistantIcon(iconData) {
    // 設置到輸入框
    const urlInput = document.getElementById('floatingAssistantIconUrlInput');
    if (urlInput) {
        urlInput.value = iconData;
    }
    
    // 更新預覽
    const preview = document.getElementById('floatingAssistantIconPreview');
    if (preview) {
        preview.src = iconData;
    }
    
    console.log('[浮動助手] 圖示已選擇');
}

/**
 * 從列表中刪除浮動助手圖示
 */
async function deleteFloatingAssistantIconFromList(iconId) {
    if (!confirm('確定要刪除這個圖示嗎？')) return;
    
    try {
        await deleteFloatingAssistantIcon(iconId);
        await loadUploadedFloatingAssistantIcons();
        console.log('[浮動助手] 圖示刪除成功');
    } catch (error) {
        console.error('[浮動助手] 刪除失敗:', error);
        alert('刪除失敗，請重試！');
    }
}

// 將函數設為全局可用
window.selectFloatingAssistantIcon = selectFloatingAssistantIcon;
window.deleteFloatingAssistantIconFromList = deleteFloatingAssistantIconFromList;
window.getFloatingAssistantSettingIcon = getFloatingAssistantSettingIcon;
window.clearFloatingAssistantSettingIcon = clearFloatingAssistantSettingIcon; 