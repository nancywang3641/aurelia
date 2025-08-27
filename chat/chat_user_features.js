/**
 * 聊天用户功能系统 - 模态窗口和标签管理
 * 处理图片、语音、转账、时间调节等功能的用户交互
 */

// =======================================================================
//                           全局变量
// =======================================================================
let currentAttachments = []; // 存储当前输入框中的附件标签
let modalContainer = null;   // 模态窗口容器
let backgroundDB = null;     // IndexedDB数据库实例
window.currentAttachments = currentAttachments;

// =======================================================================
//                         初始化模态窗口HTML
// =======================================================================

/**
 * 初始化所有模态窗口的HTML结构
 */
function initializeModals() {
    if (modalContainer) return; // 避免重复初始化
    
    modalContainer = document.createElement('div');
    modalContainer.id = 'userFunctionModals';
    modalContainer.innerHTML = `
        <!-- 图片功能模态窗口 -->
        <div id="photoModal" class="function-modal hidden">
            <div class="function-modal-content">
                <div class="function-modal-header">
                    <h3>📷 添加图片</h3>
                </div>
                <div class="function-modal-body">
                    <label for="photoDescription">图片描述:</label>
                    <textarea id="photoDescription" placeholder="请描述这张图片..." maxlength="200" rows="4" style="resize: vertical; min-height: 80px;"></textarea>
                    <div class="function-modal-hint">
                        💡 提示：详细的描述有助于其他人理解图片内容
                    </div>
                </div>
                <div class="function-modal-footer">
                    <button onclick="confirmPhoto()" class="function-btn-confirm">確定</button>
                    <button onclick="closeFunctionModal('photoModal')" class="function-btn-cancel">取消</button>
                </div>
            </div>
        </div>

        <!-- 时间调节模态窗口 -->
        <div id="timeAdjustmentModal" class="function-modal hidden">
            <div class="function-modal-content">
                <div class="function-modal-header">
                    <h3>⏰ 调节时间</h3>
                </div>
                <div class="function-modal-body">
                    <div class="time-mode-selector">
                        <label>
                            <input type="radio" name="timeMode" value="time_only" checked>
                            仅时间 (同一天内)
                        </label>
                        <label>
                            <input type="radio" name="timeMode" value="full_datetime">
                            完整日期时间 (跨天)
                        </label>
                    </div>
                    
                    <div class="time-input-section">
                        <label for="timeInput">时间:</label>
                        <input type="time" id="timeInput" value="14:30">
                        
                        <label for="dateInput" id="dateLabel" style="display: none;">日期:</label>
                        <input type="date" id="dateInput" style="display: none;">
                    </div>
                    

                    
                    <div class="function-modal-hint">
                        提示：选择"仅时间"表示同一天内的时间跳跃，选择"完整日期时间"表示跨天的时间跳跃
                    </div>
                </div>
                <div class="function-modal-footer">
                    <button onclick="confirmTimeAdjustment()" class="function-btn-confirm">調節時間</button>
                    <button onclick="closeFunctionModal('timeAdjustmentModal')" class="function-btn-cancel">取消</button>
                </div>
            </div>
        </div>

        <!-- 視訊通話模态窗口 -->
        <div id="videoCallModal" class="function-modal hidden">
            <div class="function-modal-content">
                <div class="function-modal-header">
                    <h3>📹 視訊通話</h3>
                </div>
                <div class="function-modal-body">
                    <label for="callDuration">通話時長 (分鐘):</label>
                    <input type="number" id="callDuration" placeholder="5" min="1" max="120" value="5">
                    <label for="callNote">通話備註:</label>
                    <input type="text" id="callNote" placeholder="通話內容備註..." maxlength="50">
                </div>
                <div class="function-modal-footer">
                    <button onclick="confirmVideoCall()" class="function-btn-confirm">添加視訊通話記錄</button>
                    <button onclick="closeFunctionModal('videoCallModal')" class="function-btn-cancel">取消</button>
                </div>
            </div>
        </div>

        <!-- 位置分享模态窗口 -->
        <div id="locationModal" class="function-modal hidden">
            <div class="function-modal-content">
                <div class="function-modal-header">
                    <h3>📍 分享位置</h3>
                </div>
                <div class="function-modal-body">
                    <label for="locationName">位置名称:</label>
                    <input type="text" id="locationName" placeholder="如：星巴克咖啡店、家里、公司..." maxlength="50">
                </div>
                <div class="function-modal-footer">
                    <button onclick="confirmLocation()" class="function-btn-confirm">分享位置</button>
                    <button onclick="closeFunctionModal('locationModal')" class="function-btn-cancel">取消</button>
                </div>
            </div>
        </div>

        <!-- 红包模态窗口 -->
        <div id="redEnvelopeModal" class="function-modal hidden">
            <div class="function-modal-content">
                <div class="function-modal-header">
                    <h3>🧧 发红包</h3>
                </div>
                <div class="function-modal-body">
                    <label for="redEnvelopeAmount">红包金额:</label>
                    <input type="number" id="redEnvelopeAmount" placeholder="100" min="1" max="10000" step="0.01">
                    <label for="redEnvelopeMessage">祝福语:</label>
                    <input type="text" id="redEnvelopeMessage" placeholder="恭喜发财，大吉大利！" maxlength="30">
                    <div class="red-envelope-presets">
                        <button onclick="setRedEnvelopePreset(6.66, '666')" class="preset-btn">💰 6.66</button>
                        <button onclick="setRedEnvelopePreset(8.88, '发发发')" class="preset-btn">💰 8.88</button>
                        <button onclick="setRedEnvelopePreset(66.66, '顺顺顺')" class="preset-btn">💰 66.66</button>
                        <button onclick="setRedEnvelopePreset(88.88, '发财了')" class="preset-btn">💰 88.88</button>
                    </div>
                </div>
                <div class="function-modal-footer">
                    <button onclick="confirmRedEnvelope()" class="function-btn-confirm">發紅包</button>
                    <button onclick="closeFunctionModal('redEnvelopeModal')" class="function-btn-cancel">取消</button>
                </div>
            </div>
        </div>

        <!-- 转账模态窗口 -->
        <div id="transferModal" class="function-modal hidden">
            <div class="function-modal-content">
                <div class="function-modal-header">
                    <h3>💰 转账</h3>
                </div>
                <div class="function-modal-body">
                    <label for="transferAmount">转账金额:</label>
                    <input type="number" id="transferAmount" placeholder="50.00" min="0.01" step="0.01">
                    <label for="transferNote">转账说明:</label>
                    <input type="text" id="transferNote" placeholder="餐费、路费、借款..." maxlength="30">
                    <label for="transferReceiver">接收者:</label>
                    <select id="transferReceiver" style="width: 100%; padding: 8px; margin-bottom: 15px;">
                        <option value="">選擇接收者...</option>
                        <!-- 動態填充選項 -->
                    </select>
                    <div class="function-modal-hint">
                        💡 提示：私聊時會自動顯示角色，群組時可選擇成員
                    </div>
                </div>
                <div class="function-modal-footer">
                    <button onclick="confirmTransfer()" class="function-btn-confirm">轉賬</button>
                    <button onclick="closeFunctionModal('transferModal')" class="function-btn-cancel">取消</button>
                </div>
            </div>
        </div>

        <!-- 语音输入模态窗口 -->
        <div id="voiceInputModal" class="function-modal hidden">
            <div class="function-modal-content">
                <div class="function-modal-header">
                    <h3>🎤 语音输入</h3>
                </div>
                <div class="function-modal-body">
                    <label for="voiceContent">语音内容:</label>
                    <textarea id="voiceContent" placeholder="请输入语音转文字的内容..." maxlength="200" rows="4"></textarea>
                    <div class="function-modal-hint">
                        🎤 模拟语音输入 - 请输入语音消息的文字内容
                    </div>
                </div>
                <div class="function-modal-footer">
                    <button onclick="confirmVoiceInput()" class="function-btn-confirm">添加語音</button>
                    <button onclick="closeFunctionModal('voiceInputModal')" class="function-btn-cancel">取消</button>
                </div>
            </div>
        </div>

        <!-- 表情包模态窗口 -->
        <div id="stickerModal" class="function-modal hidden">
            <div class="function-modal-content">
                <div class="function-modal-header">
                    <h3>😊 自定義表情包</h3>
                </div>
                <div class="function-modal-body">
                    <div class="custom-sticker">
                        <label for="customStickerName">表情包檔名:</label>
                        <input type="text" id="customStickerName" placeholder="請輸入表情包檔名..." maxlength="300">
                        <button onclick="addCustomStickerName()" class="function-btn-confirm" style="margin-top:8px;width:100%;">添加表情</button>
                    </div>
                    <div id="customStickerList" class="custom-sticker-list" style="margin-top:18px;"></div>
                </div>
                <div class="function-modal-footer">
                    <button onclick="closeFunctionModal('stickerModal')" class="function-btn-cancel">取消</button>
                </div>
            </div>
        </div>

        <!-- 劇情指示模态窗口 -->
        <div id="userStoryModal" class="function-modal hidden">
            <div class="function-modal-content">
                <div class="function-modal-header">
                    <h3>📖 劇情指示</h3>
                </div>
                <div class="function-modal-body">
                    <label for="storyDirectionType">指示類型:</label>
                    <select id="storyDirectionType" style="width: 100%; padding: 8px; margin-bottom: 15px;">
                        <option value="角色行動">角色行動</option>
                        <option value="劇情轉折">劇情轉折</option>
                        <option value="場景變化">場景變化</option>
                        <option value="角色關係">角色關係</option>
                        <option value="背景設定">背景設定</option>
                        <option value="時間推進">時間推進</option>
                    </select>
                    
                    <label for="userStoryDirection">劇情指示內容:</label>
                    <textarea id="userStoryDirection" placeholder="例如：&#10;• 主角決定主動找X角色談話&#10;• 突然有新角色出現&#10;• 場景轉移到學校圖書館&#10;• 揭露X和Y的真實關係&#10;• 時間跳躍到第二天早上" rows="6" maxlength="300"></textarea>
                    
                    <div class="function-modal-hint">
                        💡 提示：你提供劇情發展方向，AI會根據你的指示來編寫具體的劇情內容和對話
                    </div>
                </div>
                <div class="function-modal-footer">
                    <button onclick="confirmUserStory()" class="function-btn-confirm">發送指示</button>
                    <button onclick="closeFunctionModal('userStoryModal')" class="function-btn-cancel">取消</button>
                </div>
            </div>
        </div>

        <!-- 系统指令模态窗口 -->
        <div id="systemActionModal" class="function-modal hidden">
            <div class="function-modal-content">
                <div class="function-modal-header">
                    <h3>⚙️ 系統指令</h3>
                </div>
                <div class="function-modal-body">
                    <label for="systemActionSelect">選擇動作:</label>
                    <select id="systemActionSelect" style="width: 100%; padding: 8px; margin-bottom: 15px;" onchange="updateSystemActionInputs()">
                        <option value="add">添加成員</option>
                        <option value="kick">移除成員</option>
                        <option value="mute">成員禁言 (小黑屋)</option>
                        <option value="block">拉黑成員</option>
                        <option value="broadcast">發送廣播</option>
                        <option value="leave">離開群組</option>
                        <option value="disband">解散群組</option>
                    </select>
                    <div id="systemActionInputs">
                        <!-- 動態渲染input -->
                    </div>
                </div>
                <div class="function-modal-footer">
                    <button onclick="confirmSystemAction()" class="function-btn-confirm">執行指令</button>
                    <button onclick="closeFunctionModal('systemActionModal')" class="function-btn-cancel">取消</button>
                </div>
            </div>
        </div>

        <!-- 信封功能模态窗口 -->
        <div id="letterModal" class="function-modal hidden">
            <div class="function-modal-content">
                <div class="function-modal-header">
                    <h3>✉️ 寫信</h3>
                </div>
                <div class="function-modal-body">
                    <label for="letterTo">收件人:</label>
                    <select id="letterTo" style="width: 100%; padding: 8px; box-sizing: border-box;">
                        <option value="">選擇收件人...</option>
                    </select>
                    
                    <label for="letterContent">信件內容:</label>
                    <textarea id="letterContent" placeholder="請輸入信件內容..." maxlength="500" rows="6" style="width: 100%; padding: 8px; box-sizing: border-box; resize: vertical;"></textarea>
                    
                    <label for="letterDate">日期:</label>
                    <input type="date" id="letterDate" style="width: 100%; padding: 8px; box-sizing: border-box;">
                    
                    <div class="function-modal-hint">
                        💡 提示：寄件人將自動使用您的用戶名稱
                    </div>
                </div>
                <div class="function-modal-footer">
                    <button onclick="confirmLetter()" class="function-btn-confirm">發送信件</button>
                    <button onclick="closeFunctionModal('letterModal')" class="function-btn-cancel">取消</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modalContainer);
    console.log('[用户功能] 模态窗口已初始化');
}

// =======================================================================
//                         模态窗口控制函数
// =======================================================================

/**
 * 打开指定的功能模态窗口
 */
function openFunctionModal(modalId) {
    if (!modalContainer) {
        initializeModals();
    }
    
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('show');
        
        // 聚焦到第一个输入框
        const firstInput = modal.querySelector('input, textarea');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
        
        console.log(`[用户功能] 打开模态窗口: ${modalId}`);
    }
}

/**
 * 关闭指定的功能模态窗口
 */
function closeFunctionModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('show');
        
        // 清空输入框
        const inputs = modal.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            if (input.type !== 'number' && input.type !== 'radio') {
                input.value = '';
            }
        });
        
        console.log(`[用户功能] 关闭模态窗口: ${modalId}`);
    }
}

// =======================================================================
//                         功能确认处理函数
// =======================================================================

/**
 * 确认添加图片
 */
function confirmPhoto() {
    const description = document.getElementById('photoDescription').value.trim();
    if (!description) {
        alert('请输入图片描述');
        return;
    }
    
    addAttachmentTag('photo', description, '📷');
    closeFunctionModal('photoModal');
}

/**
 * ⏰ 时间调节功能 - 处理时间模式切换
 */
function setupTimeAdjustmentModal() {
    const timeOnlyRadio = document.querySelector('input[name="timeMode"][value="time_only"]');
    const fullDatetimeRadio = document.querySelector('input[name="timeMode"][value="full_datetime"]');
    const dateInput = document.getElementById('dateInput');
    const dateLabel = document.getElementById('dateLabel');
    
    function toggleDateInput() {
        if (fullDatetimeRadio && fullDatetimeRadio.checked) {
            dateInput.style.display = 'block';
            dateLabel.style.display = 'block';
            // 设置默认日期为明天
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            dateInput.value = tomorrow.toISOString().split('T')[0];
        } else {
            dateInput.style.display = 'none';
            dateLabel.style.display = 'none';
        }
    }
    
    if (timeOnlyRadio && fullDatetimeRadio) {
        timeOnlyRadio.addEventListener('change', toggleDateInput);
        fullDatetimeRadio.addEventListener('change', toggleDateInput);
        
        // 初始化状态
        toggleDateInput();
    }
}



/**
 * ⏰ 确认时间调节
 */
function confirmTimeAdjustment() {
    const timeMode = document.querySelector('input[name="timeMode"]:checked');
    const timeValue = document.getElementById('timeInput').value;
    const dateValue = document.getElementById('dateInput').value;
    
    if (!timeValue) {
        alert('请选择时间');
        return;
    }
    
    // 构建系统时间消息 - 使用统一的消息格式，不显示"时间调整"前缀
    let systemTimeContent;
    if (timeMode && timeMode.value === 'full_datetime' && dateValue) {
        // 完整日期时间格式 - 直接显示日期时间
        systemTimeContent = `${dateValue} ${timeValue}`;
    } else {
        // 仅时间格式 - 直接显示时间
        systemTimeContent = `${timeValue}`;
    }
    
    console.log('[时间调节] 准备发送系统时间:', systemTimeContent);
    
    // 🔥 使用统一的消息格式：#ID|系統|内容
    sendSystemMessage(systemTimeContent);
    
    closeFunctionModal('timeAdjustmentModal');
}

/**
 * 获取当前日期 (YYYY-MM-DD 格式)
 */
function getCurrentDate() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * 获取当前时间 (HH:MM 格式) - 修复版本：优先使用系统时间
 */
function getCurrentTime() {
    // 🔥 优先检查是否存在系统时间设置
    if (typeof lastSystemTime !== 'undefined' && lastSystemTime) {
        const parts = lastSystemTime.split(' ');
        let timePart = '';
        
        // 处理只有时间 "HH:MM" 的情况
        if (parts.length === 1 && /^\d{2}:\d{2}$/.test(parts[0])) {
            timePart = parts[0];
        } 
        // 处理 "YYYY-MM-DD HH:MM" 的情况
        else if (parts.length > 1 && /^\d{2}:\d{2}$/.test(parts[1])) {
            timePart = parts[1];
        }
        
        if (timePart) {
            // 🔥 如果设置了时间偏移量，应用偏移
            if (typeof systemTimeOffset !== 'undefined' && systemTimeOffset !== 0) {
                try {
                    const [hours, minutes] = timePart.split(':').map(Number);
                    const systemDate = new Date();
                    systemDate.setHours(hours, minutes, 0, 0);
                    
                    // 应用偏移量
                    const adjustedDate = new Date(systemDate.getTime() + (systemTimeOffset * 60 * 1000));
                    return `${String(adjustedDate.getHours()).padStart(2, '0')}:${String(adjustedDate.getMinutes()).padStart(2, '0')}`;
                } catch (error) {
                    console.error('[时间] 应用偏移量时出错:', error);
                    return timePart; // 出错时返回原时间
                }
            }
            
            return timePart;
        }
    }
    
    // 🔥 如果没有系统时间设置，则使用现实时间
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 获取下一个消息ID (与聊天核心兼容)
 */
async function getNextMessageId() {
    try {
        // 方法1：通过iframe调用聊天面板的函数
        const iframe = findChatPanelIframe();
        if (iframe?.contentWindow?.getNextMessageId) {
            return await iframe.contentWindow.getNextMessageId();
        }
        
        // 方法2：从当前聊天数据估算 (如果存在)
        if (currentChat && currentChat.id && typeof chatData !== 'undefined') {
            const chatStore = currentChat.type === 'story' ? chatData.storyChats :
                            currentChat.type === 'group' ? chatData.groupChats : 
                            chatData.dmChats;
            
            if (chatStore && chatStore[currentChat.id] && chatStore[currentChat.id].messages) {
                const messages = chatStore[currentChat.id].messages;
                if (messages.length > 0) {
                    const maxId = Math.max(...messages.map(m => {
                        const id = parseInt(m.id);
                        return isNaN(id) ? 0 : id;
                    }));
                    return maxId + 1;
                }
            }
        }
        
        // 方法3：从聊天面板DOM中获取最大ID
        const chatIframe = findChatPanelIframe();
        if (chatIframe?.contentWindow?.document) {
            const messageElements = chatIframe.contentWindow.document.querySelectorAll('[data-message-id]');
            if (messageElements.length > 0) {
                const maxId = Math.max(...Array.from(messageElements).map(el => {
                    const id = parseInt(el.dataset.messageId);
                    return isNaN(id) ? 0 : id;
                }));
                return maxId + 1;
            }
        }
        
        // 方法4：默认从1开始
        return 1;
        
    } catch (error) {
        console.error('[用户功能] 获取下一个消息ID时出错:', error);
        return Date.now() % 1000; // 备用：使用时间戳
    }
}

/**
 * 查找聊天面板iframe
 */
function findChatPanelIframe() {
    try {
        // 尝试通过父窗口查找
        if (window.parent?.document) {
            const mapPanelIframe = window.parent.document.querySelector('iframe.map-panel-iframe');
            if (mapPanelIframe?.contentWindow?.document) {
                return mapPanelIframe.contentWindow.document.getElementById('chatPanelIframe');
            }
        }
        return null;
    } catch (error) {
        console.error('[用户功能] 查找聊天面板iframe失败:', error);
        return null;
    }
}

/**
 * 🔥 核心函数：发送系统消息 (统一格式) - 修复鸡蛋问题：正确处理时间消息的时间戳
 */
async function sendSystemMessage(systemContent, type = 'text') {
    console.log('[系統消息] 🕐 開始發送系統消息:', systemContent);

    // 檢查是否存在當前聊天
    if (!currentChat || !currentChat.id) {
        alert('錯誤：找不到當前的聊天對象，無法發送系統消息。');
        console.error('[系統消息] 錯誤：currentChat 物件無效。');
        return;
    }

    try {
        // 🔥 关键修复：检查是否是时间设置消息，如果是则提前设置时间
        let shouldUseSpecificTime = false;
        let specificTime = null;
        
        // 检查是否是纯时间格式（HH:MM）或日期时间格式
        if (/^\d{1,2}:\d{2}$/.test(systemContent.trim())) {
            // 纯时间格式：12:00
            shouldUseSpecificTime = true;
            specificTime = systemContent.trim();
            // 临时设置lastSystemTime，这样getCurrentTime就会返回正确时间
            if (typeof lastSystemTime !== 'undefined') {
                lastSystemTime = specificTime;
            }
        } else if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(systemContent.trim())) {
            // 日期时间格式：2024-01-01 12:00
            shouldUseSpecificTime = true;
            const parts = systemContent.trim().split(' ');
            specificTime = parts[1]; // 只取时间部分
            // 临时设置lastSystemTime
            if (typeof lastSystemTime !== 'undefined') {
                lastSystemTime = systemContent.trim();
            }
        }

        console.log('[系統消息] 🕐 检测到时间消息，specificTime:', specificTime);

        // 🔥 修复：构建系统消息内容（保持原有格式）
        const fullSystemContent = `[system:${systemContent}]`;
        
        // 🔥 使用你原有的buildWrappedMessage机制（保持补标头逻辑）
        let wrappedMessage;
        if (typeof buildWrappedMessage === 'function') {
            // 🔥 临时设置sender为"系統"来构建系统消息
            const originalProtagonist = protagonistName;
            protagonistName = '系統'; // 临时修改
            
            try {
                wrappedMessage = await buildWrappedMessage(fullSystemContent, 'system');
                
                // 🔥 关键修复：如果是时间消息，手动替换时间戳部分
                if (shouldUseSpecificTime && specificTime) {
                    // 新格式没有时间字段，不需要替换
                    console.log('[系統消息] 🔧 新格式已省token，无需时间戳替换');
                }
            } finally {
                protagonistName = originalProtagonist; // 恢复原值
            }
        } else {
            // 备用方案：如果没有buildWrappedMessage函数
            const nextMessageId = await getNextMessageId();
            wrappedMessage = `[${nextMessageId}|${currentChat.id}|系統|${fullSystemContent}]`;
        }
        
        console.log('[系統消息] 📦 構建的系統消息:', wrappedMessage);

        // 發送到酒館AI主環境
        const tavernWindow = findTavernMainWindow();
        if (!tavernWindow) {
            throw new Error('找不到酒館AI主環境');
        }

        const stInput = tavernWindow.document.querySelector('#send_textarea');
        const sendButton = tavernWindow.document.querySelector('#send_but');

        if (!stInput || !sendButton) {
            throw new Error('找不到酒館AI的發送元素');
        }

        // 🔥 發送系統消息
        stInput.value = wrappedMessage;
        stInput.dispatchEvent(new Event('input', { bubbles: true }));

        setTimeout(() => {
            sendButton.click();
            console.log('[系統消息] ✅ 系統消息已發送');
        }, 100);

    } catch (error) {
        console.error('[系統消息] ❌ 發送失败:', error);
        throw error;
    }
}


/**
 * 确认视讯通话
 */
function confirmVideoCall() {
    const duration = document.getElementById('callDuration').value;
    const note = document.getElementById('callNote').value.trim();
    
    if (!duration || duration <= 0) {
        alert('請輸入有效的通話時長');
        return;
    }
    
    // 生成視訊通話邀請格式（显示为視訊通話邀請卡片）
    const callInvitation = `發起視訊通話邀請: ${note || '視訊通話'}`;
    addAttachmentTag('call_invitation', callInvitation, '📹');
    
    closeFunctionModal('videoCallModal');
}

/**
 * 确认位置分享
 */
function confirmLocation() {
    const locationName = document.getElementById('locationName').value.trim();
    if (!locationName) {
        alert('请输入位置名称');
        return;
    }
    
    addAttachmentTag('location', locationName, '📍');
    closeFunctionModal('locationModal');
}

/**
 * 确认红包
 */
function confirmRedEnvelope() {
    const amount = document.getElementById('redEnvelopeAmount').value;
    const message = document.getElementById('redEnvelopeMessage').value.trim();
    
    if (!amount || amount <= 0) {
        alert('请输入有效的红包金额');
        return;
    }
    
    // ✅ 修复：统一使用繁体"星幣"，确保与后续处理一致
    const description = `${message || '红包祝福'} ${amount} 星幣`;
    addAttachmentTag('red_envelope', description, '🧧');
    closeFunctionModal('redEnvelopeModal');
}

/**
 * 确认转账
 */
function confirmTransfer() {
    const amount = document.getElementById('transferAmount').value;
    const note = document.getElementById('transferNote').value.trim();
    const receiver = document.getElementById('transferReceiver').value.trim();
    
    if (!amount || amount <= 0) {
        alert('请输入有效的转账金额');
        return;
    }
    
    // 檢查是否選擇了接收者（群聊時必須選擇）
    if (currentChat && (currentChat.type === 'group' || currentChat.type === 'group_chat') && !receiver) {
        alert('請選擇接收者！');
        return;
    }
    
    // 使用逗號分隔的格式：轉賬ID,接收者,描述,金額,貨幣
    const currencyOptions = ['星幣', '星币', 'Star Coins'];
    const randomCurrency = currencyOptions[Math.floor(Math.random() * currencyOptions.length)];
    
    // 生成簡短的轉賬ID（3位數字）
    const transferId = Math.floor(Math.random() * 900) + 100; // 100-999
    
    // 使用逗號分隔符的格式
    const transferNote = note || '轉賬';
    const transferReceiver = receiver || '未知';
    const description = `[transfer:${transferId},${transferReceiver},${transferNote},${amount},${randomCurrency}]`;
    
    addAttachmentTag('transfer', description, '💰');
    closeFunctionModal('transferModal');
}

/**
 * 确认语音输入
 */
function confirmVoiceInput() {
    const content = document.getElementById('voiceContent').value.trim();
    if (!content) {
        alert('请输入语音内容');
        return;
    }
    
    addAttachmentTag('voice', content, '🎤');
    closeFunctionModal('voiceInputModal');
}

/**
 * 选择预设表情包
 */
function selectSticker(stickerName) {
    addAttachmentTag('sticker', stickerName, '😊');
    closeFunctionModal('stickerModal');
}


/**
 * 确认自定义表情包
 */
function confirmCustomSticker() {
    const customName = document.getElementById('customStickerName').value.trim();
    if (!customName) {
        alert('请输入表情包名称');
        return;
    }
    
    addAttachmentTag('sticker', customName, '😊');
    closeFunctionModal('stickerModal');
}


/**
 * 確認劇情指示并直接发送
 */
async function confirmUserStory() {
    const directionType = document.getElementById('storyDirectionType').value;
    const direction = document.getElementById('userStoryDirection').value.trim();
    
    if (!direction) {
        alert('請輸入劇情指示內容');
        return;
    }
    
    if (!currentChat || !currentChat.id) {
        alert('錯誤：找不到當前聊天室');
        return;
    }
    
    try {
        // 🔥 使用统一的系统消息格式
        const systemContent = `📖 ${directionType}：${direction}`;
        await sendSystemMessage(systemContent);
        
        closeFunctionModal('userStoryModal');
        
    } catch (error) {
        console.error('[劇情指示] ❌ 发送失败:', error);
        alert('劇情指示发送失败');
    }
}

// =======================================================================
//                         预设值设置函数
// =======================================================================

function setLocationPreset(location) {
    document.getElementById('locationName').value = location;
}

function setRedEnvelopePreset(amount, message) {
    document.getElementById('redEnvelopeAmount').value = amount;
    document.getElementById('redEnvelopeMessage').value = message;
}

// =======================================================================
//                         視訊通話功能
// =======================================================================

/**
 * 启动视讯通话界面
 */
function startVideoCall(callInfo) {
    console.log('[視訊通話] 啟動通話界面:', callInfo);
    
    // 创建視訊通話面板iframe
    const callIframe = document.createElement('iframe');
    callIframe.id = 'videoCallPanel';
    callIframe.src = 'call/call_panel.html';
    callIframe.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: none;
        z-index: 10000;
        background: #1a1a1a;
    `;
    
    // 添加到页面
    document.body.appendChild(callIframe);
    
    // 等待iframe加载完成后初始化通话
    callIframe.onload = function() {
        setTimeout(() => {
            callIframe.contentWindow.postMessage({
                type: 'INIT_CALL',
                callInfo: {
                    ...callInfo,
                    isIncoming: callInfo.isIncoming || false
                }
            }, '*');
        }, 100);
    };

    
    // 监听通话面板发出的关闭请求和消息发送请求
    window.addEventListener('message', function handleCallPanelMessages(event) {
        // 处理通话面板关闭请求
        if (event.data && event.data.type === 'CALL_PANEL_CLOSED' && event.data.source === 'call_panel') {
            
            console.log('[Chat Panel] 收到關閉請求，原始卡片ID:', event.data.originalCallId);

            // 1. 移除視訊通話面板
            const panel = document.getElementById('videoCallPanel');
            if (panel) {
                panel.remove();
            }
            
            // ★★★【新增邏輯：根據回傳的ID更新卡片】★★★
            if (event.data.originalCallId) {
                const cardToUpdate = document.querySelector(`[data-call-id="${event.data.originalCallId}"]`);
                if (cardToUpdate) {
                    console.log('[Chat Panel] 找到對應的通話卡片，正在更新狀態...');
                    // 移除按鈕
                    const actions = cardToUpdate.querySelector('.call-invitation-actions');
                    if (actions) actions.remove();
                    
                    // 新增「通話已結束」的提示
                    const note = cardToUpdate.querySelector('.call-invitation-note');
                    if (note) {
                        note.textContent = '通話已結束';
                        note.style.color = '#999';
                    }

                    // 改變圖標顏色
                     const icon = cardToUpdate.querySelector('.call-invitation-icon');
                    if (icon) {
                        icon.style.color = '#999';
                    }
                }
            }
            
            // 2. 清理監聽器
            window.removeEventListener('message', handleCallPanelMessages);
        }
        // 🔥 新增：处理通话结束消息发送请求
        else if (event.data && event.data.type === 'SEND_CALL_ENDED_MESSAGE' && event.data.source === 'call_panel') {
            console.log('[Chat Panel] 收到通话结束消息发送请求:', event.data.message);
            
            // 发送通话结束消息到聊天室
            sendCallEndedMessageToChat(event.data.message, event.data.messageType);
        }
        // 🔥 新增：处理实际用户名请求
        else if (event.data && event.data.type === 'REQUEST_ACTUAL_USERNAME' && event.data.source === 'call_panel') {
            console.log('[Chat Panel] 收到实际用户名请求');
            
            // 获取当前聊天室的实际用户名
            getCurrentChatActualUserName().then(actualUserName => {
                // 回应给通话面板
                event.source.postMessage({
                    type: 'ACTUAL_USERNAME_RESPONSE',
                    source: 'chat_panel',
                    userName: actualUserName,
                    timestamp: Date.now()
                }, '*');
                
                console.log('[Chat Panel] 已回应实际用户名:', actualUserName);
            }).catch(error => {
                console.error('[Chat Panel] 获取实际用户名失败:', error);
                // 使用默认用户名
                event.source.postMessage({
                    type: 'ACTUAL_USERNAME_RESPONSE',
                    source: 'chat_panel',
                    userName: '用戶',
                    timestamp: Date.now()
                }, '*');
            });
        }
    });
}

/**
 * 🔥 发送通话结束消息到聊天室
 */
async function sendCallEndedMessageToChat(message, messageType) {
    try {
        console.log(`[Chat Panel] 正在发送通话结束消息: ${message}`);
        
        // 查找酒馆窗口
        const tavernWindow = findTavernMainWindow();
        if (!tavernWindow) {
            console.error('[Chat Panel] 无法找到酒馆主窗口');
            return;
        }
        
        // 获取酒馆的输入框和发送按钮
        const stInput = tavernWindow.document.querySelector('#send_textarea');
        const sendButton = tavernWindow.document.querySelector('#send_but');
        
        if (!stInput || !sendButton) {
            console.error('[Chat Panel] 无法找到酒馆的输入框或发送按钮');
            return;
        }
        
        // 构建包装后的消息
        let wrappedMessage;
        if (typeof buildWrappedMessage === 'function') {
            // 🔥 修正：對於通話結束消息，使用系統作為發送者
            if (messageType === 'call_ended') {
                const nextMessageId = await getNextMessageId();
                const messageLine = `[${nextMessageId}|${currentChat.id}|系統|${message}]`;
                
                // 判斷是否為新聊天室
                let isFirstMessage = false;
                let chatStore = currentChat.type === 'dm' ? chatData.dmChats : 
                                currentChat.type === 'story' ? chatData.storyChats :
                                chatData.groupChats;
                if (chatStore && chatStore[currentChat.id] && Array.isArray(chatStore[currentChat.id].messages)) {
                    isFirstMessage = chatStore[currentChat.id].messages.length === 0;
                } else {
                    isFirstMessage = true;
                }
                
                if (isFirstMessage) {
                    // 新聊天室，補標頭
                    const chatName = currentChat.name || '';
                    const admin = currentChat.admin || '';
                    const members = currentChat.members || '';
                    const chatInfo = `${currentChat.id}|${chatName}|${admin}|${members}`;
                    wrappedMessage = `[Chat|${chatInfo}]\n${messageLine}`;
                } else {
                    // 已有聊天室，只發送消息
                    wrappedMessage = messageLine;
                }
                
                console.log('[Chat Panel] 構建系統消息:', wrappedMessage);
            } else {
                wrappedMessage = await buildWrappedMessage(message, messageType);
            }
        } else {
            // 备用方案：直接使用消息
            wrappedMessage = message;
        }
        
        // 发送消息
        stInput.value = wrappedMessage;
        stInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        setTimeout(() => {
            sendButton.click();
            console.log(`[Chat Panel] 通话结束消息已发送: ${message}`);
        }, 100);
        
    } catch (error) {
        console.error('[Chat Panel] 发送通话结束消息失败:', error);
    }
}

/**
 * 🔥 获取当前聊天室的实际用户名
 */
async function getCurrentChatActualUserName() {
    try {
        let actualUserName = '{{user}}';
        
        // 1. 從私聊設置中獲取用戶名
        if (currentChat && currentChat.type === 'dm') {
            const actualName = getPrivateChatActualUserName(currentChat.id);
            if (actualName && actualName !== '{{user}}') {
                actualUserName = actualName;
            }
        }
        // 2. 從群組成員管理器中獲取用戶名
        else if (currentChat && currentChat.type === 'group' && window.groupMemberManager) {
            try {
                // 嘗試從群組成員管理器中獲取用戶名
                const members = await window.groupMemberManager.getGroupMembers(currentChat.id);
                if (members && members.length > 0) {
                    // 尋找用戶角色或群組管理員
                    const userMember = members.find(m => m.role === 'user') || 
                                     members.find(m => m.name === currentChat.admin) || 
                                     members[0];
                    if (userMember && userMember.name) {
                        actualUserName = userMember.name;
                        console.log('[獲取實際用戶名] 從群組成員管理器獲取:', actualUserName);
                    }
                }
            } catch (error) {
                console.warn('[獲取實際用戶名] 從群組成員管理器獲取用戶名失敗:', error);
            }
        }
        
        // 3. 如果沒有找到，使用 protagonistName
        if (actualUserName === '{{user}}' && protagonistName && protagonistName !== '{{user}}') {
            actualUserName = protagonistName;
        }
        
        // 4. 如果還是占位符，使用默認值
        if (actualUserName === '{{user}}') {
            actualUserName = '用戶';
        }
        
        console.log('[獲取實際用戶名] 結果:', { actualUserName, protagonistName, currentChatId: currentChat?.id });
        return actualUserName;
        
    } catch (error) {
        console.error('[獲取實際用戶名] 失敗:', error);
        return '用戶';
    }
}

// =======================================================================
//                         标签管理系统
// =======================================================================

/**
 * 添加附件标签到输入框
 */
function addAttachmentTag(type, content, icon) {
    const userInput = document.getElementById('userInput');
    if (!userInput) {
        console.error('[用户功能] 找不到输入框元素');
        return;
    }
    
    // 创建附件对象
    const attachment = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        type: type,
        content: content,
        icon: icon
    };
    
    // 添加到附件列表
    currentAttachments.push(attachment);
    window.currentAttachments = currentAttachments;
    
    // 更新输入框显示
    updateInputDisplay();
    
    // 聚焦输入框
    userInput.focus();
    
    console.log(`[用户功能] 添加附件标签: ${type} - ${content}`);
}

/**
 * 移除附件标签
 */
function removeAttachmentTag(attachmentId) {
    currentAttachments = currentAttachments.filter(att => att.id !== attachmentId);
    window.currentAttachments = currentAttachments;
    updateInputDisplay();
    console.log(`[用户功能] 移除附件标签: ${attachmentId}`);
}

/**
 * 更新输入框显示
 */
function updateInputDisplay() {
    const userInput = document.getElementById('userInput');
    if (!userInput) return;
    
    // 移除现有的标签容器
    let tagContainer = document.getElementById('attachmentTags');
    if (tagContainer) {
        tagContainer.remove();
    }
    
    // 如果有附件，创建标签容器
    if (currentAttachments.length > 0) {
        tagContainer = document.createElement('div');
        tagContainer.id = 'attachmentTags';
        tagContainer.className = 'attachment-tags';
        
        currentAttachments.forEach(attachment => {
            const tag = document.createElement('span');
            tag.className = 'attachment-tag';
            
            // 🆕 根據附件類型獲取對應的圖標URL
            let iconUrl = '';
            switch(attachment.type) {
                case 'photo':
                    iconUrl = window.ICON_CONFIG?.ICON_URL_PHOTO || '📷';
                    break;
                case 'voice':
                    iconUrl = window.ICON_CONFIG?.ICON_URL_VOICE_INPUT || '🎤';
                    break;
                case 'sticker':
                    iconUrl = window.ICON_CONFIG?.ICON_URL_STICKER || '😊';
                    break;
                case 'red_envelope':
                    iconUrl = window.ICON_CONFIG?.ICON_URL_RED_ENVELOPE || '🧧';
                    break;
                case 'location':
                    iconUrl = window.ICON_CONFIG?.ICON_URL_LOCATION || '📍';
                    break;
                case 'transfer':
                    iconUrl = window.ICON_CONFIG?.ICON_URL_TRANSFER || '💰';
                    break;
                case 'call':
                case 'call_invitation':
                    iconUrl = window.ICON_CONFIG?.ICON_URL_VIDEO_CALL || '📹';
                    break;
                case 'letter':
                    iconUrl = window.ICON_CONFIG?.ICON_URL_LETTER || '✉️';
                    break;
                case 'gift':
                    iconUrl = window.ICON_CONFIG?.ICON_URL_GIFT || '🎁';
                    break;
                case 'quote':
                    iconUrl = '💬'; // 引用消息的圖標
                    break;
                default:
                    iconUrl = attachment.icon || '📎';
            }
            
            // 🆕 創建圖標元素
            const iconElement = iconUrl.startsWith('http') ? 
                `<img src="${iconUrl}" alt="${attachment.type}" class="attachment-tag-icon">` :
                `<span class="attachment-tag-emoji">${iconUrl}</span>`;
            
            // 所有tag使用統一的樣式
            tag.innerHTML = `
                ${iconElement}
                <span class="tag-remove" onclick="removeAttachmentTag('${attachment.id}')">&times;</span>
            `;
            tagContainer.appendChild(tag);
        });
        
        // 插入到输入框前面
        userInput.parentNode.insertBefore(tagContainer, userInput);
    }
}

/**
 * 清空所有附件标签
 */
function clearAllAttachments() {
    currentAttachments = [];
    window.currentAttachments = currentAttachments;
    updateInputDisplay();
    console.log('[用户功能] 清空所有附件标签');
}

// =======================================================================
//                         发送消息处理
// =======================================================================

/**
 * 处理发送消息 - 将附件标签转换为正确格式
 */
function processMessageForSending(userMessage) {
    if (currentAttachments.length === 0) {
        return {
            message: userMessage,
            type: 'none'
        };
    }
    
    // 取第一个附件作为主要类型（目前只支持单个附件）
    const mainAttachment = currentAttachments[0];
    let processedMessage = userMessage;
    let messageType = mainAttachment.type;
    
    // 根据附件类型处理消息格式
    switch (mainAttachment.type) {
        case 'photo':
            processedMessage += `[photo:${mainAttachment.content}]`;
            messageType = 'photo';
            break;
            
        case 'voice':
            processedMessage += `[voice:${mainAttachment.content}]`;
            messageType = 'voice';
            break;
            
        case 'sticker':
            processedMessage += `[sticker:${mainAttachment.content}]`;
            messageType = 'sticker';
            break;
            
        case 'red_envelope':
            // ✅ 修复：支持简体和繁体货币单位
            const redEnvelopeParts = mainAttachment.content.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s+(星幣|星币)$/);
            if (redEnvelopeParts) {
                const message = redEnvelopeParts[1];
                const amount = redEnvelopeParts[2];
                // ✅ 确保格式包含🧧符号，统一使用繁体"星幣"
                processedMessage += `${message} 🧧${amount} 星幣[未領取]`;
            } else {
                // 🔧 fallback：强制添加🧧符号
                const fallbackMatch = mainAttachment.content.match(/(\d+(?:\.\d+)?)/);
                if (fallbackMatch) {
                    const amount = fallbackMatch[1];
                    processedMessage += ` 🧧${amount} 星幣[未領取]`;
                } else {
                    processedMessage += ` 🧧${mainAttachment.content}`;
                }
            }
            messageType = 'red_envelope';
            break;
            
        case 'transfer':
            // 新的轉帳格式：[transfer:描述$金額] 或 [transfer:$金額]
            processedMessage += mainAttachment.content;
            messageType = 'transfer';
            break;
            
        case 'location': // 標準化位置格式
            processedMessage += `[location:${mainAttachment.content}]`;
            messageType = 'location';
            break;
            
        case 'call_invitation': // 🆕 新增：視訊通話邀請格式
            processedMessage += `[call_invitation:${mainAttachment.content}]`;
            messageType = 'call_invitation';
            break;
            
        case 'call': // 標準化視訊通話記錄格式
            processedMessage += `[call:${mainAttachment.content}]`;
            messageType = 'call';
            break;
            
        case 'story': // 新增：劇情格式
            processedMessage += `[story:${mainAttachment.content}]`;
            messageType = 'story';
            break;
            
        case 'letter': // 🆕 新增：信件格式
            processedMessage += `[letter:${mainAttachment.content}]`;
            messageType = 'letter';
            break;
            
        case 'gift': // 🆕 新增：禮物格式
            // 直接使用字符串格式，不需要JSON解析
            processedMessage += mainAttachment.content;
            messageType = 'gift';
            break;
            
        case 'quote': // 🔥 新增：引用消息格式
            // 在消息前面添加引用内容，使用分隔符隔開
            // 🔥 修正：確保用戶有輸入回應內容
            if (processedMessage && processedMessage.trim()) {
                processedMessage = mainAttachment.content + ' | ' + processedMessage;
                messageType = 'quote';
            } else {
                // 如果用戶沒有輸入回應內容，提示用戶
                Logger.warn('引用消息缺少回應內容，請輸入回應內容');
                // 保持原始消息格式，不處理為引用類型
                messageType = 'none';
            }
            break;
            
        default:
            // 對於未知類型，保持 'none'
            messageType = 'none';
    }
    
    return {
        message: processedMessage,
        type: messageType
    };
}

// =======================================================================
//                         工具函数
// =======================================================================

/**
 * 查找酒馆AI主环境窗口 (复用现有逻辑)
 */
function findTavernMainWindow() {
    try {
        console.log('[时间调节] 开始查找酒馆AI主环境...');
        
        let currentWindow = window;
        let depth = 0;
        
        while (currentWindow.parent && currentWindow.parent !== currentWindow && depth < 5) {
            currentWindow = currentWindow.parent;
            depth++;
            
            console.log(`[时间调节] 向上查找第${depth}层:`, {
                hasDocument: !!currentWindow.document,
                hasTextarea: !!(currentWindow.document && currentWindow.document.querySelector('#send_textarea')),
                hasTitle: currentWindow.document ? currentWindow.document.title : 'unknown'
            });
            
            if (currentWindow.document && 
                currentWindow.document.querySelector('#send_textarea') && 
                currentWindow.document.querySelector('#send_but')) {
                console.log(`[时间调节] ✅ 找到酒馆AI主环境 (深度: ${depth})`);
                return currentWindow;
            }
        }
        
        console.error('[时间调节] ❌ 未找到酒馆AI主环境');
        return null;
        
    } catch (error) {
        console.error('[时间调节] 查找酒馆AI主环境时出错:', error);
        return null;
    }
}

/**
 * 通知处理器检查新消息 (复用现有逻辑)
 */
function notifyProcessorToCheck() {
    try {
        if (window.parent) {
            window.parent.postMessage({ 
                type: 'REQUEST_PROCESSOR_CHECK',
                timestamp: Date.now()
            }, '*');
            console.log('[时间调节] 已通知处理器检查新消息');
        }
    } catch (error) {
        console.error('[时间调节] 通知处理器失败:', error);
    }
}

// =======================================================================
//                         全局函数导出
// =======================================================================

// 导出功能选择函数，供现有代码调用
window.selectFunctionWithModal = function(functionType) {
    console.log(`[用户功能] 选择功能: ${functionType}`);
    
    switch (functionType) {
        case 'photo':
            openFunctionModal('photoModal');
            break;
        case 'time_adjustment':
            openFunctionModal('timeAdjustmentModal');
            // 设置时间模式切换监听器
            setTimeout(setupTimeAdjustmentModal, 100);
            break;
        case 'video_call':
            openFunctionModal('videoCallModal');
            break;
        case 'location':
            openFunctionModal('locationModal');
            break;
        case 'red_envelope':
            openFunctionModal('redEnvelopeModal');
            break;
        case 'transfer':
            openFunctionModal('transferModal');
            // 設置接收者選項
            setTimeout(setupTransferModal, 100);
            break;
        case 'voice_input':
            openFunctionModal('voiceInputModal');
            break;
        case 'sticker':
            openFunctionModal('stickerModal');
            break;
        case 'user_story':
            openFunctionModal('userStoryModal');
            break;
        case 'system_action': 
        openFunctionModal('systemActionModal');
        break;
        case 'letter':
            openFunctionModal('letterModal');
            // 設置接收者選項和默認日期
            setTimeout(() => {
                setupLetterModal();
                const letterDateInput = document.getElementById('letterDate');
                if (letterDateInput) {
                    letterDateInput.value = getCurrentDate();
                }
            }, 100);
            break;
        case 'gift':
            openFunctionModal('giftModal');
            // 設置接收者選項
            setTimeout(setupGiftModal, 100);
            break;
        default:
            alert(`功能 ${functionType} 开发中...`);
    }
};

// 导出其他需要的函数
window.processMessageForSending = processMessageForSending;
window.clearAllAttachments = clearAllAttachments;
window.removeAttachmentTag = removeAttachmentTag;
window.addAttachmentTag = addAttachmentTag; // 🔥 新增：暴露addAttachmentTag到全局
window.closeFunctionModal = closeFunctionModal;
window.startVideoCall = startVideoCall;

window.confirmTimeAdjustment = confirmTimeAdjustment;
window.setupTimeAdjustmentModal = setupTimeAdjustmentModal;
window.sendSystemMessage = sendSystemMessage;
window.confirmUserStory = confirmUserStory;
window.confirmGift = confirmGift;
window.setupGiftModal = setupGiftModal;
window.setupTransferModal = setupTransferModal;
window.setupLetterModal = setupLetterModal;

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeModals);
} else {
    initializeModals();
}

console.log('[用户功能] chat-user-features.js 已加载完成 (包含时间调节功能)');

// =======================================================================
//                       (新增) 群聊設置功能
// =======================================================================

/**
 * 打開群聊設置的彈出視窗
 */
async function openGroupSettingsModal() {
    document.getElementById('chatOptionsMenu').classList.add('hidden'); // 關閉選項菜單
    
    // 🆕 添加調試信息
    console.log('[群聊設置] 檢查當前聊天:', currentChat);
    console.log('[群聊設置] currentChat.type:', currentChat?.type);
    
    // 檢查是否在群聊中
    if (!currentChat) {
        console.warn('[群聊設置] 沒有當前聊天');
        alert('請先選擇一個聊天室！');
        return;
    }
    
    // 🆕 更寬鬆的群聊檢查：允許 'group' 和 'group_chat' 類型
    const isGroupChat = currentChat.type === 'group' || currentChat.type === 'group_chat';
    if (!isGroupChat) {
        console.warn('[群聊設置] 不是群聊，當前聊天類型:', currentChat.type);
        alert('此功能僅適用於群聊！');
        return;
    }
    
    const groupSettingsModal = document.getElementById('groupSettingsModal');
    
    // 🆕 先顯示模態窗口，再載入設置
    groupSettingsModal.classList.remove('hidden'); // 顯示彈出視窗
    
    // 載入當前群聊的設置
    await loadCurrentGroupSettings();
}

/**
 * 關閉群聊設置的彈出視窗
 */
function closeGroupSettingsModal() {
    document.getElementById('groupSettingsModal').classList.add('hidden');
}

/**
 * 載入當前群聊的設置
 */
async function loadCurrentGroupSettings() {
    if (!currentChat || !currentChat.id) {
        console.error('[群聊設置] 找不到當前聊天室');
        return;
    }
    
    try {
        // 🆕 嘗試從多個來源獲取群組信息
        let groupInfo = null;
        
        // 1. 從 PresetChatManager 獲取（預設群組）
        if (window.PresetChatManager && window.PresetChatManager.presetChats) {
            groupInfo = window.PresetChatManager.presetChats.find(chat => chat.id === currentChat.id);
            if (groupInfo) {
                console.log('[群聊設置] 從 PresetChatManager 獲取群組信息:', groupInfo);
            }
        }
        
        // 2. 從臨時群組列表獲取（臨時群組）
        if (!groupInfo && window.temporaryGroups) {
            groupInfo = window.temporaryGroups.find(chat => chat.id === currentChat.id);
            if (groupInfo) {
                console.log('[群聊設置] 從臨時群組列表獲取群組信息:', groupInfo);
            }
        }
        
        // 載入群組基本信息
        const groupNameInput = document.getElementById('groupSettingsNameInput');
        const adminNameInput = document.getElementById('groupSettingsAdminInput');
        const dateInput = document.getElementById('groupSettingsDateInput');
        const timeInput = document.getElementById('groupSettingsTimeInput');
        
        // 🆕 優先使用獲取到的群組信息，否則使用當前聊天室信息
        if (groupInfo) {
            groupNameInput.value = groupInfo.name || '';
            adminNameInput.value = groupInfo.admin || '';
        } else {
            groupNameInput.value = currentChat.name || '';
            adminNameInput.value = currentChat.admin || '';
        }
        
        // 設置日期和時間（如果有）
        if (currentChat.createdDate) {
            dateInput.value = currentChat.createdDate;
        }
        if (currentChat.createdTime) {
            timeInput.value = currentChat.createdTime;
        }
        
        // 載入群組頭像
        await loadGroupSettingsGroupAvatar();
        
        // 載入群組創建者頭像
        await loadGroupSettingsAdminAvatar();
        
        // 載入群組成員
        await loadGroupSettingsMembers();
        
        // 設置頭像上傳監聽器
        setupGroupSettingsGroupAvatarUpload();
        setupGroupSettingsAdminAvatarUpload();
        
    } catch (error) {
        console.error('[群聊設置] 載入設置失敗:', error);
        alert('載入群聊設置失敗');
    }
}

/**
 * 載入群組頭像
 */
async function loadGroupSettingsGroupAvatar() {
    const groupAvatarPreview = document.getElementById('groupSettingsGroupAvatarPreview');
    
    if (!currentChat?.id) {
        console.warn('[群聊設置] 無法載入群組頭像：缺少聊天ID');
        return;
    }
    
    try {
        console.log('[群聊設置] 開始載入群組頭像，聊天ID:', currentChat.id);
        
        // 🆕 從群組配置中獲取群組頭像
        let groupInfo = null;
        
        // 1. 直接從 user_preset_chats 獲取（預設群組）
        const userPresets = JSON.parse(localStorage.getItem('user_preset_chats') || '[]');
        groupInfo = userPresets.find(chat => chat.id === currentChat.id && chat.type === 'group');
        
        // 2. 從 PresetChatManager 獲取（備用方案）
        if (!groupInfo && window.PresetChatManager && window.PresetChatManager.presetChats) {
            groupInfo = window.PresetChatManager.presetChats.find(chat => chat.id === currentChat.id);
        }
        
        // 3. 從臨時群組列表獲取（臨時群組）
        if (!groupInfo && window.temporaryGroups) {
            groupInfo = window.temporaryGroups.find(chat => chat.id === currentChat.id);
        }
        
        // 4. 從聊天列表中獲取（最後備用方案）
        if (!groupInfo && chatData.chatList) {
            groupInfo = chatData.chatList.find(chat => chat.id === currentChat.id && chat.type === 'group');
        }
        
        console.log('[群聊設置] 群組信息查找結果:', {
            foundGroupInfo: !!groupInfo,
            groupInfoSource: groupInfo ? 'found' : 'not found',
            hasGroupAvatar: groupInfo ? !!groupInfo.groupAvatar : false,
            groupAvatarLength: groupInfo && groupInfo.groupAvatar ? groupInfo.groupAvatar.length : 0
        });
        
        if (groupInfo && groupInfo.groupAvatar) {
            console.log('[群聊設置] 載入群組頭像:', groupInfo.groupAvatar.substring(0, 50) + '...');
            groupAvatarPreview.src = groupInfo.groupAvatar;
            window.groupSettingsGroupAvatarData = groupInfo.groupAvatar;
        } else {
            console.warn('[群聊設置] 群組頭像為空');
            groupAvatarPreview.src = 'https://files.catbox.moe/ew2nex.png';
            window.groupSettingsGroupAvatarData = null;
        }
        
    } catch (error) {
        console.warn('[群聊設置] 載入群組頭像失敗:', error);
        groupAvatarPreview.src = 'https://files.catbox.moe/ew2nex.png';
        window.groupSettingsGroupAvatarData = null;
    }
}

/**
 * 載入群組創建者頭像
 */
async function loadGroupSettingsAdminAvatar() {
    const adminAvatarPreview = document.getElementById('groupSettingsAdminAvatarPreview');
    const adminName = currentChat.admin;
    
    console.log('[群聊設置] 開始載入群組創建者頭像:', { adminName, chatId: currentChat?.id });
    
    if (adminName && window.groupMemberManager && currentChat && currentChat.id) {
        try {
            const member = await window.groupMemberManager.getMember(adminName, currentChat.id);
            console.log('[群聊設置] 載入群組創建者信息:', member);
            
            if (member && member.avatar) {
                console.log('[群聊設置] 設置群組創建者頭像，元素:', adminAvatarPreview);
                adminAvatarPreview.src = member.avatar;
                window.groupSettingsAdminAvatarData = member.avatar;
                console.log('[群聊設置] 群組創建者頭像已設置:', member.avatar.substring(0, 50) + '...');
            } else {
                console.warn('[群聊設置] 群組創建者頭像為空:', member);
                // 🆕 如果沒有頭像，設置預設頭像
                adminAvatarPreview.src = 'https://files.catbox.moe/ew2nex.png';
            }
        } catch (error) {
            console.warn('[群聊設置] 載入群組創建者頭像失敗:', error);
            // 🆕 如果出錯，設置預設頭像
            adminAvatarPreview.src = 'https://files.catbox.moe/ew2nex.png';
        }
    } else {
        console.warn('[群聊設置] 無法載入群組創建者頭像：缺少必要參數');
    }
}

/**
 * 載入群組成員
 */
async function loadGroupSettingsMembers() {
    if (!currentChat.id || !window.groupMemberManager) {
        console.warn('[群聊設置] 無法載入成員：缺少聊天ID或成員管理器');
        return;
    }
    
    try {
        console.log('[群聊設置] 正在載入群組成員，聊天ID:', currentChat.id);
        const allMembers = await window.groupMemberManager.getGroupMembers(currentChat.id);
        console.log('[群聊設置] 從 IndexedDB 載入的所有成員:', allMembers);
        
        // 🆕 排除群組創建者，只顯示其他成員
        const adminName = currentChat.admin;
        const otherMembers = allMembers.filter(member => member.name !== adminName);
        console.log('[群聊設置] 過濾後的群組成員（排除創建者）:', otherMembers);
        
        window.groupSettingsCurrentMembers = otherMembers || [];
        updateGroupSettingsMemberAvatarDisplay();
    } catch (error) {
        console.warn('[群聊設置] 載入群組成員失敗:', error);
        window.groupSettingsCurrentMembers = [];
    }
}

/**
 * 更新群組設置中的成員頭像顯示
 */
function updateGroupSettingsMemberAvatarDisplay() {
    const memberAvatarList = document.getElementById('groupSettingsMemberAvatarList');
    const members = window.groupSettingsCurrentMembers || [];
    
    memberAvatarList.innerHTML = '';
    
    members.forEach(member => {
        console.log(`[群聊設置] 顯示成員頭像: ${member.name}, 頭像: ${member.avatar ? '有' : '無'}`);
        const memberItem = document.createElement('div');
        memberItem.className = 'member-avatar-item';
        memberItem.innerHTML = `
            <img src="${member.avatar || 'https://files.catbox.moe/ew2nex.png'}" alt="${member.name}" 
                 onclick="editGroupSettingsMember('${member.name}')">
            <span class="member-avatar-name">${member.displayName || member.name}</span>
            <span class="member-avatar-remove" onclick="removeGroupSettingsMember('${member.name}')">&times;</span>
        `;
        memberAvatarList.appendChild(memberItem);
    });
}

/**
 * 設置群組設置中的群組頭像上傳監聽器
 */
function setupGroupSettingsGroupAvatarUpload() {
    const groupAvatarInput = document.getElementById('groupSettingsGroupAvatarInput');
    const groupAvatarPreview = document.getElementById('groupSettingsGroupAvatarPreview');
    
    groupAvatarInput.onchange = function(event) {
        const file = event.target.files[0];
        if (file) {
            try {
                // 驗證文件
                if (window.groupMemberManager) {
                    window.groupMemberManager.validateImageFile(file);
                }
                
                // 創建預覽
                const reader = new FileReader();
                reader.onload = function(e) {
                    groupAvatarPreview.src = e.target.result;
                    // 保存到全局變量
                    window.groupSettingsGroupAvatarData = e.target.result;
                };
                reader.readAsDataURL(file);
                
            } catch (error) {
                alert(error.message);
                groupAvatarInput.value = '';
            }
        }
    };
}

/**
 * 設置群組設置中的群組創建者頭像上傳監聽器
 */
function setupGroupSettingsAdminAvatarUpload() {
    const adminAvatarInput = document.getElementById('groupSettingsAdminAvatarInput');
    const adminAvatarPreview = document.getElementById('groupSettingsAdminAvatarPreview');
    
    adminAvatarInput.onchange = function(event) {
        const file = event.target.files[0];
        if (file) {
            try {
                // 驗證文件
                if (window.groupMemberManager) {
                    window.groupMemberManager.validateImageFile(file);
                }
                
                // 創建預覽
                const reader = new FileReader();
                reader.onload = function(e) {
                    adminAvatarPreview.src = e.target.result;
                    window.groupSettingsAdminAvatarData = e.target.result;
                };
                reader.readAsDataURL(file);
                
            } catch (error) {
                alert(error.message);
                adminAvatarInput.value = '';
            }
        }
    };
}

/**
 * 打開群組設置的成員管理器
 */
function openGroupSettingsMemberManager() {
    // 使用現有的成員管理器，但設置特殊標記
    window.isGroupSettingsMode = true;
    openMemberManager();
}

/**
 * 編輯群組設置中的成員
 */
function editGroupSettingsMember(name) {
    window.isGroupSettingsMode = true;
    window.editingMemberName = name;
    openMemberManager();
}

/**
 * 移除群組設置中的成員
 */
function removeGroupSettingsMember(name) {
    if (confirm(`確定要移除成員 "${name}" 嗎？`)) {
        window.groupSettingsCurrentMembers = window.groupSettingsCurrentMembers.filter(
            member => member.name !== name
        );
        updateGroupSettingsMemberAvatarDisplay();
    }
}

/**
 * 應用群聊設置
 */
async function applyGroupSettings() {
    const groupName = document.getElementById('groupSettingsNameInput').value.trim();
    const adminName = document.getElementById('groupSettingsAdminInput').value.trim();
    
    if (!groupName || !adminName) {
        alert('請填寫群組名稱和群組創建者名稱！');
        return;
    }
    
    if (!currentChat || !currentChat.id) {
        alert('錯誤：找不到當前聊天室');
        return;
    }
    
    try {
        // 更新當前聊天室的基本信息
        currentChat.name = groupName;
        currentChat.admin = adminName;
        
        // 保存群組創建者頭像
        if (window.groupSettingsAdminAvatarData && window.groupMemberManager) {
            await window.groupMemberManager.addMember(
                currentChat.id,
                adminName,
                window.groupSettingsAdminAvatarData,
                adminName
            );
        }
        
        // 保存群組成員
        if (window.groupSettingsCurrentMembers && window.groupMemberManager) {
            for (const member of window.groupSettingsCurrentMembers) {
                await window.groupMemberManager.addMember(
                    currentChat.id,
                    member.name,
                    member.avatar,
                    member.displayName
                );
            }
        }
        
        // 🆕 更新預設聊天室（如果存在）
        if (currentChat.isPreset) {
            const presetConfig = {
                ...currentChat,
                name: groupName,
                admin: adminName,
                groupAvatar: window.groupSettingsGroupAvatarData || null, // 🆕 保存群組頭像
                adminAvatar: window.groupSettingsAdminAvatarData || null,
                members: window.groupSettingsCurrentMembers.map(m => m.name)
            };
            await PresetChatManager.updatePresetChat(currentChat.id, presetConfig);
        }
        
        // 🆕 更新臨時群組（如果存在）
        if (window.temporaryGroups) {
            const tempGroupIndex = window.temporaryGroups.findIndex(chat => chat.id === currentChat.id);
            if (tempGroupIndex !== -1) {
                window.temporaryGroups[tempGroupIndex] = {
                    ...window.temporaryGroups[tempGroupIndex],
                    name: groupName,
                    admin: adminName,
                    groupAvatar: window.groupSettingsGroupAvatarData || null, // 🆕 保存群組頭像
                    adminAvatar: window.groupSettingsAdminAvatarData || null,
                    members: window.groupSettingsCurrentMembers.map(m => m.name)
                };
                console.log('[群聊設置] 已更新臨時群組信息:', window.temporaryGroups[tempGroupIndex]);
            }
        }
        
        // 更新聊天列表顯示
        updateChatListView();
        
        showSuccessToast(`群聊設置已更新！`);
        closeGroupSettingsModal();
        
    } catch (error) {
        console.error('[群聊設置] 保存設置失敗:', error);
        alert('保存群聊設置失敗');
    }
}

// 將新函數設為全域可用
window.openGroupSettingsModal = openGroupSettingsModal;
window.closeGroupSettingsModal = closeGroupSettingsModal;
window.applyGroupSettings = applyGroupSettings;
window.openGroupSettingsMemberManager = openGroupSettingsMemberManager;
window.editGroupSettingsMember = editGroupSettingsMember;
window.removeGroupSettingsMember = removeGroupSettingsMember;
window.setupGroupSettingsGroupAvatarUpload = setupGroupSettingsGroupAvatarUpload;

// =======================================================================
//                       (新增) 私聊設置功能
// =======================================================================

/**
 * 打開私聊設置的彈出視窗
 */
async function openPrivateChatSettingsModal() {
    document.getElementById('chatOptionsMenu').classList.add('hidden'); // 關閉選項菜單
    
    // 🆕 添加調試信息
    console.log('[私聊設置] 檢查當前聊天:', currentChat);
    console.log('[私聊設置] currentChat.type:', currentChat?.type);
    
    // 檢查是否在私聊中
    if (!currentChat) {
        console.warn('[私聊設置] 沒有當前聊天');
        alert('請先選擇一個聊天室！');
        return;
    }
    
    // 🆕 檢查是否為私聊
    const isPrivateChat = currentChat.type === 'dm' || currentChat.type === 'dm_chat';
    if (!isPrivateChat) {
        console.warn('[私聊設置] 不是私聊，當前聊天類型:', currentChat.type);
        alert('此功能僅適用於私聊！');
        return;
    }
    
    const privateChatSettingsModal = document.getElementById('privateChatSettingsModal');
    
    // 🆕 先顯示模態窗口，再載入設置
    privateChatSettingsModal.classList.remove('hidden'); // 顯示彈出視窗
    
    // 載入當前私聊的設置
    await loadCurrentPrivateChatSettings();
}

/**
 * 關閉私聊設置的彈出視窗
 */
function closePrivateChatSettingsModal() {
    document.getElementById('privateChatSettingsModal').classList.add('hidden');
}

/**
 * 載入當前私聊的設置
 */
async function loadCurrentPrivateChatSettings() {
    if (!currentChat || !currentChat.id) {
        console.error('[私聊設置] 找不到當前聊天室');
        return;
    }
    
    try {
        // 🆕 嘗試從多個來源獲取私聊信息
        let privateChatInfo = null;
        
        // 1. 從 PresetChatManager 獲取（預設私聊）
        if (window.PresetChatManager && window.PresetChatManager.presetChats) {
            privateChatInfo = window.PresetChatManager.presetChats.find(chat => chat.id === currentChat.id);
            if (privateChatInfo) {
                console.log('[私聊設置] 從 PresetChatManager 獲取私聊信息:', privateChatInfo);
            }
        }
        
        // 2. 從臨時私聊列表獲取（臨時私聊）
        if (!privateChatInfo && window.temporaryPrivateChats) {
            privateChatInfo = window.temporaryPrivateChats.find(chat => chat.id === currentChat.id);
            if (privateChatInfo) {
                console.log('[私聊設置] 從臨時私聊列表獲取私聊信息:', privateChatInfo);
            }
        }
        
        // 載入私聊基本信息
        const chatNameInput = document.getElementById('privateChatSettingsNameInput');
        const userInput = document.getElementById('privateChatSettingsUserInput');
        const characterInput = document.getElementById('privateChatSettingsCharacterInput');
        const dateInput = document.getElementById('privateChatSettingsDateInput');
        const timeInput = document.getElementById('privateChatSettingsTimeInput');
        
        // 🆕 優先使用獲取到的私聊信息，否則使用當前聊天室信息
        if (privateChatInfo) {
            chatNameInput.value = privateChatInfo.name || '';
            userInput.value = privateChatInfo.participant1 || '';
            characterInput.value = privateChatInfo.participant2 || '';
        } else {
            chatNameInput.value = currentChat.name || '';
            
            // 🔥 修正：獲取實際的用戶名稱，而不是占位符
            let actualUserName = currentChat.participant1;
            if (!actualUserName || actualUserName === '{{user}}') {
                // 嘗試從IndexedDB獲取實際用戶名
                try {
                    if (window.privateChatManager) {
                        const participants = await window.privateChatManager.getChatParticipants(currentChat.id);
                        const userParticipant = participants.find(p => p.role === 'user');
                        if (userParticipant && userParticipant.name && userParticipant.name !== '{{user}}') {
                            actualUserName = userParticipant.name;
                            console.log('[私聊設置] 從IndexedDB獲取實際用戶名:', actualUserName);
                        }
                    }
                } catch (error) {
                    console.warn('[私聊設置] 獲取實際用戶名失敗:', error);
                }
                
                // 如果還是沒有，使用全局protagonistName
                if (!actualUserName || actualUserName === '{{user}}') {
                    actualUserName = protagonistName && protagonistName !== '{{user}}' ? protagonistName : '{{user}}';
                    console.log('[私聊設置] 使用全局用戶名:', actualUserName);
                }
            }
            
            userInput.value = actualUserName;
            characterInput.value = currentChat.participant2 || '';
        }
        
        // 設置日期和時間（如果有）
        if (currentChat.createdDate) {
            dateInput.value = currentChat.createdDate;
        }
        if (currentChat.createdTime) {
            timeInput.value = currentChat.createdTime;
        }
        
        // 載入用戶頭像
        await loadPrivateChatSettingsUserAvatar();
        
        // 載入角色頭像
        await loadPrivateChatSettingsCharacterAvatar();
        
        // 設置頭像上傳監聽器
        setupPrivateChatSettingsAvatarUploads();
        
        console.log('[私聊設置] 設置載入完成');
        
    } catch (error) {
        console.error('[私聊設置] 載入設置失敗:', error);
        alert('載入私聊設置失敗');
    }
}

/**
 * 載入私聊設置中的用戶頭像
 */
async function loadPrivateChatSettingsUserAvatar() {
    const userAvatarPreview = document.getElementById('privateChatSettingsUserAvatarPreview');
    const userName = document.getElementById('privateChatSettingsUserInput').value;
    
    if (!userName || !currentChat?.id) {
        console.warn('[私聊設置] 無法載入用戶頭像：缺少必要參數');
        return;
    }
    
    try {
        console.log('[私聊設置] 開始載入用戶頭像:', { userName, chatId: currentChat.id });
        
        const participant = await window.privateChatManager.getParticipant(userName, currentChat.id, 'user');
        
        if (participant && participant.avatar) {
            console.log('[私聊設置] 載入用戶信息:', participant);
            userAvatarPreview.src = participant.avatar;
            console.log('[私聊設置] 設置用戶頭像，元素:', userAvatarPreview);
            window.privateChatSettingsUserAvatarData = participant.avatar;
            console.log('[私聊設置] 用戶頭像已設置:', participant.avatar.substring(0, 50) + '...');
        } else {
            console.warn('[私聊設置] 用戶頭像為空:', participant);
            userAvatarPreview.src = 'https://files.catbox.moe/ew2nex.png';
            window.privateChatSettingsUserAvatarData = null;
        }
        
    } catch (error) {
        console.warn('[私聊設置] 載入用戶頭像失敗:', error);
        userAvatarPreview.src = 'https://files.catbox.moe/ew2nex.png';
        window.privateChatSettingsUserAvatarData = null;
    }
}

/**
 * 載入私聊設置中的角色頭像
 */
async function loadPrivateChatSettingsCharacterAvatar() {
    const characterAvatarPreview = document.getElementById('privateChatSettingsCharacterAvatarPreview');
    const characterName = document.getElementById('privateChatSettingsCharacterInput').value;
    
    if (!characterName || !currentChat?.id) {
        console.warn('[私聊設置] 無法載入角色頭像：缺少必要參數');
        return;
    }
    
    try {
        console.log('[私聊設置] 開始載入角色頭像:', { characterName, chatId: currentChat.id });
        
        const participant = await window.privateChatManager.getParticipant(characterName, currentChat.id, 'character');
        
        if (participant && participant.avatar) {
            console.log('[私聊設置] 載入角色信息:', participant);
            characterAvatarPreview.src = participant.avatar;
            console.log('[私聊設置] 設置角色頭像，元素:', characterAvatarPreview);
            window.privateChatSettingsCharacterAvatarData = participant.avatar;
            console.log('[私聊設置] 角色頭像已設置:', participant.avatar.substring(0, 50) + '...');
        } else {
            console.warn('[私聊設置] 角色頭像為空:', participant);
            characterAvatarPreview.src = 'https://files.catbox.moe/ew2nex.png';
            window.privateChatSettingsCharacterAvatarData = null;
        }
        
    } catch (error) {
        console.warn('[私聊設置] 載入角色頭像失敗:', error);
        characterAvatarPreview.src = 'https://files.catbox.moe/ew2nex.png';
        window.privateChatSettingsCharacterAvatarData = null;
    }
}

/**
 * 設置私聊設置中的頭像上傳監聽器
 */
function setupPrivateChatSettingsAvatarUploads() {
    // 設置用戶頭像上傳監聽器
    const userAvatarInput = document.getElementById('privateChatSettingsUserAvatarInput');
    const userAvatarPreview = document.getElementById('privateChatSettingsUserAvatarPreview');
    
    userAvatarInput.onchange = function(event) {
        const file = event.target.files[0];
        if (file) {
            try {
                // 驗證文件
                if (window.privateChatManager) {
                    window.privateChatManager.validateImageFile(file);
                }
                
                // 創建預覽
                const reader = new FileReader();
                reader.onload = function(e) {
                    userAvatarPreview.src = e.target.result;
                    // 保存到全局變量
                    window.privateChatSettingsUserAvatarData = e.target.result;
                };
                reader.readAsDataURL(file);
                
            } catch (error) {
                alert(error.message);
                userAvatarInput.value = '';
            }
        }
    };
    
    // 設置角色頭像上傳監聽器
    const characterAvatarInput = document.getElementById('privateChatSettingsCharacterAvatarInput');
    const characterAvatarPreview = document.getElementById('privateChatSettingsCharacterAvatarPreview');
    
    characterAvatarInput.onchange = function(event) {
        const file = event.target.files[0];
        if (file) {
            try {
                // 驗證文件
                if (window.privateChatManager) {
                    window.privateChatManager.validateImageFile(file);
                }
                
                // 創建預覽
                const reader = new FileReader();
                reader.onload = function(e) {
                    characterAvatarPreview.src = e.target.result;
                    // 保存到全局變量
                    window.privateChatSettingsCharacterAvatarData = e.target.result;
                };
                reader.readAsDataURL(file);
                
            } catch (error) {
                alert(error.message);
                characterAvatarInput.value = '';
            }
        }
    };
}

/**
 * 應用私聊設置
 */
async function applyPrivateChatSettings() {
    const chatName = document.getElementById('privateChatSettingsNameInput').value.trim();
    const userName = document.getElementById('privateChatSettingsUserInput').value.trim();
    const characterName = document.getElementById('privateChatSettingsCharacterInput').value.trim();
    const date = document.getElementById('privateChatSettingsDateInput').value;
    const time = document.getElementById('privateChatSettingsTimeInput').value;
    
    if (!chatName || !userName || !characterName) {
        alert('請填寫聊天名稱、用戶名稱和角色名稱！');
        return;
    }
    
    try {
        // 🆕 保存頭像到IndexedDB
        if (window.privateChatManager) {
            // 保存用戶頭像
            if (window.privateChatSettingsUserAvatarData) {
                await window.privateChatManager.updateParticipant(
                    currentChat.id,
                    userName,
                    window.privateChatSettingsUserAvatarData,
                    'user',
                    userName
                );
            }
            
            // 保存角色頭像
            if (window.privateChatSettingsCharacterAvatarData) {
                await window.privateChatManager.updateParticipant(
                    currentChat.id,
                    characterName,
                    window.privateChatSettingsCharacterAvatarData,
                    'character',
                    characterName
                );
            }
        }
        
        // 🆕 更新預設聊天室配置
        if (window.PresetChatManager && window.PresetChatManager.presetChats) {
            const presetIndex = window.PresetChatManager.presetChats.findIndex(chat => chat.id === currentChat.id);
            if (presetIndex !== -1) {
                window.PresetChatManager.presetChats[presetIndex] = {
                    ...window.PresetChatManager.presetChats[presetIndex],
                    name: chatName,
                    participant1: userName,
                    participant2: characterName,
                    userAvatar: window.privateChatSettingsUserAvatarData || null,
                    characterAvatar: window.privateChatSettingsCharacterAvatarData || null,
                    createdDate: date,
                    createdTime: time
                };
                console.log('[私聊設置] 已更新預設私聊信息:', window.PresetChatManager.presetChats[presetIndex]);
            }
        }
        
        // 🆕 更新臨時私聊信息
        if (window.temporaryPrivateChats) {
            const tempIndex = window.temporaryPrivateChats.findIndex(chat => chat.id === currentChat.id);
            if (tempIndex !== -1) {
                window.temporaryPrivateChats[tempIndex] = {
                    ...window.temporaryPrivateChats[tempIndex],
                    name: chatName,
                    participant1: userName,
                    participant2: characterName,
                    userAvatar: window.privateChatSettingsUserAvatarData || null,
                    characterAvatar: window.privateChatSettingsCharacterAvatarData || null,
                    createdDate: date,
                    createdTime: time
                };
                console.log('[私聊設置] 已更新臨時私聊信息:', window.temporaryPrivateChats[tempIndex]);
            }
        }
        
        // 🆕 更新當前聊天對象
        currentChat.name = chatName;
        currentChat.participant1 = userName;
        currentChat.participant2 = characterName;
        currentChat.createdDate = date;
        currentChat.createdTime = time;
        
        // 🔥 修正：同步更新到 chatData.chatList
        if (chatData && chatData.chatList) {
            const chatIndex = chatData.chatList.findIndex(chat => chat.id === currentChat.id);
            if (chatIndex !== -1) {
                chatData.chatList[chatIndex] = {
                    ...chatData.chatList[chatIndex],
                    name: chatName,
                    participant1: userName,
                    participant2: characterName,
                    createdDate: date,
                    createdTime: time
                };
                console.log('[私聊設置] 已同步更新聊天列表:', chatData.chatList[chatIndex]);
            }
        }
        
        // 🔥 修正：同步更新到 chatData.dmChats
        console.log('[私聊設置] 檢查 chatData.dmChats:', {
            hasChatData: !!chatData,
            hasDmChats: !!(chatData && chatData.dmChats),
            chatId: currentChat.id,
            hasChatInDmChats: !!(chatData && chatData.dmChats && chatData.dmChats[currentChat.id]),
            currentDmChats: chatData && chatData.dmChats ? Object.keys(chatData.dmChats) : []
        });
        
        if (chatData && chatData.dmChats && chatData.dmChats[currentChat.id]) {
            chatData.dmChats[currentChat.id] = {
                ...chatData.dmChats[currentChat.id],
                name: chatName,
                participant1: userName,
                participant2: characterName,
                createdDate: date,
                createdTime: time
            };
            console.log('[私聊設置] 已同步更新私聊存儲:', chatData.dmChats[currentChat.id]);
        } else {
            console.warn('[私聊設置] 無法找到 chatData.dmChats 中的聊天對象:', currentChat.id);
        }
        
        // 🔥 修正：更新私聊ID映射
        if (window.privateChatIdMap) {
            const oldKey1 = `${currentChat.participant1}⇆${currentChat.participant2}`;
            const oldKey2 = `${currentChat.participant2}⇆${currentChat.participant1}`;
            const newKey1 = `${userName}⇆${characterName}`;
            const newKey2 = `${characterName}⇆${userName}`;
            
            // 如果參與者信息有變化，更新ID映射
            if (oldKey1 !== newKey1) {
                const chatId = currentChat.id;
                
                // 刪除舊的映射
                delete window.privateChatIdMap[oldKey1];
                delete window.privateChatIdMap[oldKey2];
                
                // 添加新的映射
                window.privateChatIdMap[newKey1] = chatId;
                window.privateChatIdMap[newKey2] = chatId;
                
                // 保存到 localStorage
                localStorage.setItem('privateChatIdMap', JSON.stringify(window.privateChatIdMap));
                
                console.log('[私聊設置] 已更新ID映射:', {
                    oldKey1, oldKey2, newKey1, newKey2, chatId
                });
            }
        }
        
        // 🆕 立即更新 UI
        updateChatListView();
        
        // 🔥 新增：立即更新聊天室頭部的角色頭像
        await updateChatHeaderAvatar();
        
        showSuccessToast(`私聊設置已更新！`);
        closePrivateChatSettingsModal();
        
    } catch (error) {
        console.error('[私聊設置] 保存設置失敗:', error);
        alert('保存私聊設置失敗');
    }
}

/**
 * 🔥 新增：立即更新聊天室頭部的角色頭像
 */
async function updateChatHeaderAvatar() {
    try {
        console.log('[私聊設置] 開始更新聊天室頭部頭像');
        
        // 檢查是否在私聊中
        if (!currentChat || currentChat.type !== 'dm') {
            console.log('[私聊設置] 不是私聊，跳過頭像更新');
            return;
        }
        
        // 獲取私聊頭部元素
        const privateHeader = document.getElementById('privateChatHeader');
        if (!privateHeader) {
            console.log('[私聊設置] 找不到私聊頭部元素');
            return;
        }
        
        // 獲取角色頭像元素
        const avatarImg = document.getElementById('privateHeaderAvatarImg');
        if (!avatarImg) {
            console.log('[私聊設置] 找不到角色頭像元素');
            return;
        }
        
        // 獲取角色名稱
        const characterName = currentChat.participant2;
        if (!characterName) {
            console.log('[私聊設置] 找不到角色名稱');
            return;
        }
        
        console.log('[私聊設置] 嘗試更新角色頭像:', { characterName, chatId: currentChat.id });
        
        // 從IndexedDB獲取最新的角色頭像
        if (window.privateChatManager) {
            const participant = await window.privateChatManager.getParticipant(characterName, currentChat.id, 'character');
            if (participant && participant.avatar) {
                avatarImg.src = participant.avatar;
                console.log('[私聊設置] 已更新聊天室頭部角色頭像:', participant.avatar.substring(0, 50) + '...');
            } else {
                console.log('[私聊設置] 沒有找到角色頭像，使用預設頭像');
                avatarImg.src = 'https://files.catbox.moe/ew2nex.png';
            }
        } else {
            console.warn('[私聊設置] privateChatManager 不可用');
        }
        
    } catch (error) {
        console.error('[私聊設置] 更新聊天室頭部頭像失敗:', error);
    }
}

// 將私聊設置函數設為全域可用
window.openPrivateChatSettingsModal = openPrivateChatSettingsModal;
window.closePrivateChatSettingsModal = closePrivateChatSettingsModal;
window.applyPrivateChatSettings = applyPrivateChatSettings;
window.updateChatHeaderAvatar = updateChatHeaderAvatar;

/**
 * 🆕 確認發送信件
 */
async function confirmLetter() {
    const to = document.getElementById('letterTo').value.trim();
    const content = document.getElementById('letterContent').value.trim();
    const date = document.getElementById('letterDate').value;
    
    if (!to) {
        alert('請輸入收件人姓名');
        return;
    }
    
    if (!content) {
        alert('請輸入信件內容');
        return;
    }
    
    if (!date) {
        alert('請選擇日期');
        return;
    }
    
    if (!currentChat || !currentChat.id) {
        alert('錯誤：找不到當前聊天室');
        return;
    }
    
    try {
        // 🔥 根據聊天類型選擇寄件人
        let from;
        if (currentChat.type === 'group') {
            // 群聊使用群組創建者名稱
            from = currentChat.admin || '{{user}}';
        } else {
            // 其他聊天使用全局用戶名
            from = protagonistName && protagonistName.trim() !== '' ? protagonistName : '{{user}}';
        }
        
        // 🔥 直接構造一條角色名發送的信件訊息
        const nextMessageId = await getNextMessageId();
        const chatTypeForProcessor = currentChat.type === 'group' ? 'group_chat' : 
                                   currentChat.type === 'story' ? 'story' : 'dm';
        let participantsInfo = '';
        if (currentChat.type === 'group') {
            const admin = currentChat.admin || '未知管理員';
            const members = currentChat.members ? currentChat.members.join(',') : '';
            participantsInfo = `${admin}|${members}`;
        } else if (currentChat.type === 'story') {
            participantsInfo = currentChat.narrator || '{{POV}}';
        } else { // dm
            participantsInfo = `${currentChat.participant1 || '{{user}}'}⇆${currentChat.participant2 || '{{char}}'}`;
        }
        
        // 🔥 修改：使用私聊ID映射機制生成標頭
        let chatHeader;
        if (currentChat.type === 'dm') {
            // 對於私聊，使用 generatePrivateChatHeader 函數
            const participant1 = currentChat.participant1 || '{{user}}';
            const participant2 = currentChat.participant2 || '{{char}}';
            chatHeader = window.generatePrivateChatHeader(participant1, participant2);
        } else {
            // 對於其他類型，使用原有邏輯
            chatHeader = `[Chat|${currentChat.id}|${currentChat.name}|${participantsInfo}]`;
        }
        const letterContent = `[letter: From:${from} To:${to} 內容:${content} 日期:${date}]`;
        // 🔥 新格式：這裡sender用from（當前用戶名）
        const messageLine = `[${nextMessageId}|${currentChat.id}|${from}|${letterContent}]`;
        const fullMessage = `${chatHeader}\n${messageLine}`;
        
        const tavernMainWindow = findTavernMainWindow();
        if (!tavernMainWindow) throw new Error('找不到酒館AI主環境');
        const stInput = tavernMainWindow.document.querySelector('#send_textarea');
        const sendButton = tavernMainWindow.document.querySelector('#send_but');
        if (stInput && sendButton) {
            stInput.value = fullMessage;
            stInput.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(() => { sendButton.click(); }, 100);
            setTimeout(() => { notifyProcessorToCheck(); }, 500);
        } else {
            throw new Error('找不到發送按鈕');
        }
        closeFunctionModal('letterModal');
    } catch (error) {
        console.error('[信件功能] ❌ 发送失败:', error);
        alert('信件发送失败');
    }
}

// 設為全域可用
window.confirmLetter = confirmLetter;


/**
 * (新增) 執行並發送系統指令 (v2.1)
 */
async function confirmSystemAction() {
    const action = document.getElementById('systemActionSelect').value;
    let operator = '', target = '', value = '';
    if (action === 'leave') {
        target = document.getElementById('systemActionTarget').value.trim();
    } else if (action === 'disband') {
        operator = document.getElementById('systemActionOperator').value.trim();
    } else {
        operator = document.getElementById('systemActionOperator').value.trim();
        target = document.getElementById('systemActionTarget').value.trim();
        value = document.getElementById('systemActionValue').value.trim();
    }
    console.log('[系統指令] 📋 收集到的参数:', { action, operator, target, value });
    if (!action) {
        alert('請選擇一個動作！');
        return;
    }
    if (["add", "kick", "mute", "block"].includes(action)) {
        if (!operator) {
            alert('請輸入操作者！');
            return;
        }
        if (!target) {
            alert('請指定目標角色！');
            return;
        }
    }
    if (action === 'leave' && !target) {
        alert('請輸入角色名稱！');
        return;
    }
    if (action === 'disband' && !operator) {
        alert('請輸入操作者！');
        return;
    }
    if (!currentChat || !currentChat.id) {
        alert('錯誤：找不到當前聊天室！');
        return;
    }
    let systemContent = '', systemType = 'text';
    switch (action) {
        case 'add':
            systemContent = `➕「${target}」已被「${operator}」加入群組`;
            break;
        case 'kick':
            systemContent = `🚫「${target}」已被「${operator}」移出群組`;
            break;
        case 'mute':
            const duration = value || '10分钟';
            systemContent = `🔇「${target}」已被「${operator}」禁言 ${duration}`;
            break;
        case 'block':
            systemContent = `⚫「${target}」已被「${operator}」拉黑`;
            break;
        case 'broadcast':
            systemContent = `📢 系统广播：${value || '系统广播'}`;
            break;
        case 'leave':
            systemContent = `➖「${target}」已退出群組`;
            systemType = 'member_leave';
            break;
        case 'disband':
            systemContent = `解散群組：「${operator}」已解散本群組`;
            systemType = 'group_disband';
            break;
        default:
            systemContent = `❓ 未知系统指令：${action}`;
    }
    console.log(`[系統指令] 🎯 準備發送系統消息: ${systemContent}`);
    try {
        await sendSystemMessage(systemContent, systemType);
        showSuccessToast(`系統指令已執行: ${action} ${target || operator || ''}`);
    } catch (error) {
        console.error('[系統指令] ❌ 發送失败:', error);
        alert(`系統指令發送失败: ${error.message}`);
    }
    closeFunctionModal('systemActionModal');
}
window.confirmSystemAction = confirmSystemAction;
window.getCurrentDate = getCurrentDate;
window.getCurrentTime = getCurrentTime;
window.getNextMessageId = getNextMessageId;

// 動態渲染系統指令 input 欄位
function updateSystemActionInputs() {
    const action = document.getElementById('systemActionSelect').value;
    const container = document.getElementById('systemActionInputs');
    if (!container) return;
    if (action === 'leave') {
        container.innerHTML = `
            <label for="systemActionTarget">角色名稱:</label>
            <input type="text" id="systemActionTarget" placeholder="例如：陳思芳">
        `;
    } else if (action === 'disband') {
        container.innerHTML = `
            <label for="systemActionOperator">操作者:</label>
            <input type="text" id="systemActionOperator" placeholder="執行解散的角色名稱">
        `;
    } else {
        container.innerHTML = `
            <label for="systemActionOperator">操作者:</label>
            <input type="text" id="systemActionOperator" placeholder="執行此操作的角色名稱">
            <label for="systemActionTarget">目標角色:</label>
            <input type="text" id="systemActionTarget" placeholder="例如：陳思芳 (廣播時可留空)">
            <label for="systemActionValue">附加參數:</label>
            <input type="text" id="systemActionValue" placeholder="例如：1h 或 廣播內容">
        `;
    }
}
// 頁面載入時初始化一次
if (typeof window !== 'undefined') {
    setTimeout(updateSystemActionInputs, 200);
}

// ===================== 自定義表情包邏輯（檔名模式） =====================

const CUSTOM_STICKER_KEY = 'custom_sticker_names';
const STICKER_BASE_URL = 'https://nancywang3641.github.io/sound-files/sticker/';

function getCustomStickers() {
    try {
        const data = localStorage.getItem(CUSTOM_STICKER_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function saveCustomStickers(list) {
    localStorage.setItem(CUSTOM_STICKER_KEY, JSON.stringify(list));
}

function addCustomStickerName() {
    const nameInput = document.getElementById('customStickerName');
    const name = nameInput.value.trim();
    if (!name) {
        alert('請輸入表情包檔名');
        return;
    }
    if (/[^\w\u4e00-\u9fa5]/.test(name)) {
        // 允許中英文、數字、下劃線
        alert('檔名只能包含中英文、數字、下劃線');
        return;
    }
    let stickers = getCustomStickers();
    if (stickers.includes(name)) {
        alert('這個表情已存在');
        return;
    }
    stickers.push(name);
    saveCustomStickers(stickers);
    nameInput.value = '';
    renderCustomStickerList();
}

function removeCustomStickerName(name) {
    let stickers = getCustomStickers();
    stickers = stickers.filter(n => n !== name);
    saveCustomStickers(stickers);
    renderCustomStickerList();
}

function renderCustomStickerList() {
    const listDiv = document.getElementById('customStickerList');
    if (!listDiv) return;
    const stickers = getCustomStickers();
    if (stickers.length === 0) {
        listDiv.innerHTML = '<div style="color:#aaa;text-align:center;">暫無自定義表情，請添加檔名</div>';
        return;
    }
    listDiv.innerHTML = stickers.map(name => {
        const url = `${STICKER_BASE_URL}${encodeURIComponent(name)}.jpg`;
        return `
        <div class="custom-sticker-item" style="display:flex;align-items:center;margin-bottom:10px;gap:10px;">
            <img src="${url}" alt="sticker" style="width:48px;height:48px;border-radius:8px;object-fit:cover;cursor:pointer;border:1px solid #eee;" onclick="selectCustomSticker('${encodeURIComponent(name)}')">
            <span style="flex:1;word-break:break-all;font-size:13px;color:#888;">${name}</span>
            <button onclick="removeCustomStickerName('${name}')" style="background:#eee;color:#888;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;">刪除</button>
        </div>
        `;
    }).join('');
}

function selectCustomSticker(nameEnc) {
    const name = decodeURIComponent(nameEnc);
    addAttachmentTag('sticker', name, '😊');
    closeFunctionModal('stickerModal');
}

// 打開表情包面板時自動刷新自定義表情
const oldOpenFunctionModal = window.openFunctionModal;
window.openFunctionModal = function(modalId) {
    oldOpenFunctionModal(modalId);
    if (modalId === 'stickerModal') {
        setTimeout(renderCustomStickerList, 100);
    }
};

// =======================================================================
//                          世界書管理功能
// =======================================================================

/**
 * 世界書管理器
 */
const LorebookManager = {
    /**
     * 獲取所有世界書列表
     */
    async getAllLorebooks() {
        try {
            const lorebooks = await TavernAPI.call('getLorebooks');
            return lorebooks;
        } catch (error) {
            console.error('[世界書管理器] 獲取世界書列表失敗:', error);
            return [];
        }
    },

    /**
     * 創建新世界書
     */
    async createLorebook(name) {
        try {
            const success = await TavernAPI.call('createLorebook', name);
            if (success) {
                showSuccessToast(`世界書 "${name}" 創建成功！`);
                return true;
            } else {
                showErrorToast(`世界書 "${name}" 創建失敗，可能已存在同名世界書`);
                return false;
            }
        } catch (error) {
            console.error('[世界書管理器] 創建世界書失敗:', error);
            showErrorToast(`創建世界書失敗: ${error.message}`);
            return false;
        }
    },

    /**
     * 刪除世界書
     */
    async deleteLorebook(name) {
        try {
            const success = await TavernAPI.call('deleteLorebook', name);
            if (success) {
                showSuccessToast(`世界書 "${name}" 刪除成功！`);
                return true;
            } else {
                showErrorToast(`世界書 "${name}" 刪除失敗`);
                return false;
            }
        } catch (error) {
            console.error('[世界書管理器] 刪除世界書失敗:', error);
            showErrorToast(`刪除世界書失敗: ${error.message}`);
            return false;
        }
    },

    /**
     * 獲取當前角色卡綁定的世界書
     */
    async getCurrentCharLorebooks() {
        try {
            const lorebooks = await TavernAPI.call('getCharLorebooks');
            return lorebooks;
        } catch (error) {
            console.error('[世界書管理器] 獲取角色世界書失敗:', error);
            return { primary: null, additional: [] };
        }
    },

    /**
     * 設置當前角色卡綁定的世界書
     */
    async setCurrentCharLorebooks(lorebooks) {
        try {
            await TavernAPI.call('setCurrentCharLorebooks', lorebooks);
            showSuccessToast('角色世界書設置成功！');
            return true;
        } catch (error) {
            console.error('[世界書管理器] 設置角色世界書失敗:', error);
            showErrorToast(`設置角色世界書失敗: ${error.message}`);
            return false;
        }
    },

    /**
     * 獲取當前聊天綁定的世界書
     */
    async getCurrentChatLorebook() {
        try {
            const lorebook = await TavernAPI.call('getChatLorebook');
            return lorebook;
        } catch (error) {
            console.error('[世界書管理器] 獲取聊天世界書失敗:', error);
            return null;
        }
    },

    /**
     * 設置當前聊天綁定的世界書
     */
    async setCurrentChatLorebook(lorebookName) {
        try {
            await TavernAPI.call('setChatLorebook', lorebookName);
            showSuccessToast(`聊天世界書已綁定到 "${lorebookName}"`);
            return true;
        } catch (error) {
            console.error('[世界書管理器] 設置聊天世界書失敗:', error);
            showErrorToast(`設置聊天世界書失敗: ${error.message}`);
            return false;
        }
    },

    /**
     * 獲取世界書條目
     */
    async getLorebookEntries(lorebookName) {
        try {
            const entries = await TavernAPI.call('getLorebookEntries', lorebookName);
            return entries;
        } catch (error) {
            console.error('[世界書管理器] 獲取世界書條目失敗:', error);
            return [];
        }
    },

    /**
     * 創建世界書條目
     */
    async createLorebookEntry(lorebookName, entryData) {
        try {
            const result = await TavernAPI.call('createLorebookEntries', lorebookName, [entryData]);
            showSuccessToast(`條目創建成功！新條目ID: ${result.new_uids[0]}`);
            return result.new_uids[0];
        } catch (error) {
            console.error('[世界書管理器] 創建條目失敗:', error);
            showErrorToast(`創建條目失敗: ${error.message}`);
            return null;
        }
    }
};

/**
 * 打開世界書管理模態窗口（新版：標籤頁）
 */
function openLorebookManagerModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow: visible;">
            <div class="modal-header">
                <h3>世界書管理器</h3>
                <span class="close-btn" onclick="closeLorebookManagerModal()">&times;</span>
            </div>
            <div class="modal-tab-bar">
                <button class="modal-tab-btn active" data-tab="lorebook-list-tab" onclick="switchLorebookTab('lorebook-list-tab', this)">世界書列表</button>
                <button class="modal-tab-btn" data-tab="char-lorebook-tab" onclick="switchLorebookTab('char-lorebook-tab', this)">當前角色</button>
                <button class="modal-tab-btn" data-tab="chat-lorebook-tab" onclick="switchLorebookTab('chat-lorebook-tab', this)">當前聊天</button>
            </div>
            <div class="modal-body">
                <div id="lorebook-list-tab" class="modal-tab-content" style="display:block;">
                    <div class="lorebook-section">
                        <h4>世界書列表</h4>
                        <div id="lorebookList" class="lorebook-list"></div>
                        <div class="lorebook-actions">
                            <input type="text" id="newLorebookName" placeholder="新世界書名稱" style="width: 200px;">
                            <button onclick="createNewLorebook()" class="btn-primary">創建世界書</button>
                        </div>
                    </div>
                </div>
                <div id="char-lorebook-tab" class="modal-tab-content" style="display:none;">
                    <div class="lorebook-section">
                        <h4>當前角色世界書</h4>
                        <div id="charLorebookInfo"></div>
                        <div class="lorebook-actions">
                            <select id="charPrimaryLorebook">
                                <option value="">選擇主要世界書</option>
                            </select>
                            <button onclick="updateCharLorebooks()" class="btn-primary">更新角色世界書</button>
                        </div>
                    </div>
                </div>
                <div id="chat-lorebook-tab" class="modal-tab-content" style="display:none;">
                    <div class="lorebook-section">
                        <h4>當前聊天世界書</h4>
                        <div id="chatLorebookInfo"></div>
                        <div class="lorebook-actions">
                            <select id="chatLorebook">
                                <option value="">選擇聊天世界書</option>
                            </select>
                            <button onclick="updateChatLorebook()" class="btn-primary">更新聊天世界書</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    loadLorebookManagerData();
}

/**
 * 切換世界書管理器標籤頁
 */
window.switchLorebookTab = function(tabId, btn) {
    // 隱藏所有內容
    document.querySelectorAll('.modal-tab-content').forEach(el => el.style.display = 'none');
    // 顯示當前內容
    document.getElementById(tabId).style.display = 'block';
    // 標籤高亮
    document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

/**
 * 關閉世界書管理模態窗口
 */
function closeLorebookManagerModal() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
}

/**
 * 載入世界書管理數據
 */
async function loadLorebookManagerData() {
    try {
        // 載入世界書列表
        const lorebooks = await LorebookManager.getAllLorebooks();
        const lorebookList = document.getElementById('lorebookList');
        lorebookList.innerHTML = lorebooks.map(lorebook => `
            <div class="lorebook-item">
                <span>${lorebook}</span>
                <div style="display:flex;gap:6px;">
                    <button onclick="openLorebookEntriesModal('${lorebook}')" class="btn-primary" style="font-size:12px;">查看條目</button>
                    <button onclick="deleteLorebook('${lorebook}')" class="btn-danger">刪除</button>
                </div>
            </div>
        `).join('');

        // 更新選擇框選項
        const charSelect = document.getElementById('charPrimaryLorebook');
        const chatSelect = document.getElementById('chatLorebook');
        const options = lorebooks.map(lorebook => `<option value="${lorebook}">${lorebook}</option>`).join('');
        charSelect.innerHTML = '<option value="">選擇主要世界書</option>' + options;
        chatSelect.innerHTML = '<option value="">選擇聊天世界書</option>' + options;

        // 載入角色世界書信息
        const charLorebooks = await LorebookManager.getCurrentCharLorebooks();
        document.getElementById('charLorebookInfo').innerHTML = `
            <p>主要世界書: ${charLorebooks.primary || '無'}</p>
            <p>附加世界書: ${charLorebooks.additional.join(', ') || '無'}</p>
        `;
        if (charLorebooks.primary) {
            charSelect.value = charLorebooks.primary;
        }

        // 載入聊天世界書信息
        const chatLorebook = await LorebookManager.getCurrentChatLorebook();
        document.getElementById('chatLorebookInfo').innerHTML = `
            <p>綁定世界書: ${chatLorebook || '無'}</p>
        `;
        if (chatLorebook) {
            chatSelect.value = chatLorebook;
        }

    } catch (error) {
        console.error('[世界書管理器] 載入數據失敗:', error);
        showErrorToast('載入世界書數據失敗');
    }
}

/**
 * 創建新世界書
 */
async function createNewLorebook() {
    const nameInput = document.getElementById('newLorebookName');
    const name = nameInput.value.trim();
    
    if (!name) {
        showErrorToast('請輸入世界書名稱');
        return;
    }
    
    const success = await LorebookManager.createLorebook(name);
    if (success) {
        nameInput.value = '';
        await loadLorebookManagerData();
    }
}

/**
 * 刪除世界書
 */
async function deleteLorebook(name) {
    if (!confirm(`確定要刪除世界書 "${name}" 嗎？`)) {
        return;
    }
    
    const success = await LorebookManager.deleteLorebook(name);
    if (success) {
        await loadLorebookManagerData();
    }
}

/**
 * 更新角色世界書
 */
async function updateCharLorebooks() {
    const primarySelect = document.getElementById('charPrimaryLorebook');
    const primary = primarySelect.value || null;
    
    const success = await LorebookManager.setCurrentCharLorebooks({
        primary: primary,
        additional: [] // 暫時不處理附加世界書
    });
    
    if (success) {
        await loadLorebookManagerData();
    }
}

/**
 * 更新聊天世界書
 */
async function updateChatLorebook() {
    const chatSelect = document.getElementById('chatLorebook');
    const lorebookName = chatSelect.value || null;
    
    const success = await LorebookManager.setCurrentChatLorebook(lorebookName);
    
    if (success) {
        await loadLorebookManagerData();
    }
}

// 添加CSS樣式
const lorebookStyles = `
<style>
.lorebook-section {
    margin-bottom: 20px;
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
}

.lorebook-section h4 {
    margin: 0 0 10px 0;
    color: #333;
}

.lorebook-list {
    max-height: 200px;
    overflow-y: auto;
    margin-bottom: 10px;
}

.lorebook-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    border-bottom: 1px solid #eee;
}

.lorebook-item:last-child {
    border-bottom: none;
}

.lorebook-actions {
    display: flex;
    gap: 10px;
    align-items: center;
}

.btn-primary {
    background: #007bff;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
}

.btn-danger {
    background: #dc3545;
    color: white;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}

.btn-primary:hover {
    background: #0056b3;
}

.btn-danger:hover {
    background: #c82333;
}
</style>
`;

// 注入樣式
document.head.insertAdjacentHTML('beforeend', lorebookStyles);

// ========== 世界書條目編輯功能 ==========

/**
 * 打開條目列表視窗
 */
async function openLorebookEntriesModal(lorebookName) {
    const entries = await LorebookManager.getLorebookEntries(lorebookName);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal-lorebook-entries';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; max-height: 80vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>世界書條目 - ${lorebookName}</h3>
                <span class="close-btn" onclick="closeLorebookEntriesModal()">&times;</span>
            </div>
            <div class="modal-body">
                <button onclick="openAddLorebookEntryModal('${lorebookName}')" class="btn-primary" style="width:100%;margin-bottom:12px;">＋ 新增條目</button>
                <div id="lorebookEntriesList">
                    ${entries.length === 0 ? '<div style=\'color:#888;text-align:center;\'>暫無條目</div>' :
                        entries.map(entry => `
                        <div class=\'lorebook-entry-item\' style=\'border-bottom:1px solid #eee;padding:8px 0;display:flex;align-items:center;justify-content:space-between;\'>
                            <div style=\'flex:1;overflow:hidden;\'>
                                <div style=\'font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\'>
                                    <b>${entry.comment || '(無標題)'}</b>
                                </div>
                                <div style=\'font-size:12px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\'>
                                    ${entry.keys ? entry.keys.join(', ') : ''}
                                </div>
                            </div>
                            <button onclick=\'openEditLorebookEntryModal("${lorebookName}",${entry.uid})\' style=\'margin-left:10px;padding:2px 8px;font-size:12px;\'>編輯</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}
window.openLorebookEntriesModal = openLorebookEntriesModal;

// 新增條目視窗
window.openAddLorebookEntryModal = function(lorebookName) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal-lorebook-edit';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>新增條目</h3>
                <span class="close-btn" onclick="closeEditLorebookEntryModal()">&times;</span>
            </div>
            <div class="modal-body">
                <label>標題/備註：</label>
                <input type="text" id="editEntryComment" value="" style="width:100%;margin-bottom:8px;">
                <label>關鍵詞（逗號分隔）：</label>
                <input type="text" id="editEntryKeys" value="" style="width:100%;margin-bottom:8px;">
                <label>內容：</label>
                <textarea id="editEntryContent" rows="4" style="width:100%;margin-bottom:8px;"></textarea>
                <label>啟用：</label>
                <input type="checkbox" id="editEntryEnabled" checked>
                <button onclick="saveAddLorebookEntry('${lorebookName}')" class="btn-primary" style="width:100%;margin-top:16px;">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}
window.saveAddLorebookEntry = async function(lorebookName) {
    const comment = document.getElementById('editEntryComment').value.trim();
    const keys = document.getElementById('editEntryKeys').value.split(',').map(k=>k.trim()).filter(Boolean);
    const content = document.getElementById('editEntryContent').value;
    const enabled = document.getElementById('editEntryEnabled').checked;
    try {
        await LorebookManager.createLorebookEntry(lorebookName, { comment, keys, content, enabled });
        showSuccessToast('條目已新增');
        closeEditLorebookEntryModal();
        closeLorebookEntriesModal();
        setTimeout(()=>openLorebookEntriesModal(lorebookName), 200);
    } catch (e) {
        showErrorToast('新增失敗: '+e.message);
    }
}

function closeLorebookEntriesModal() {
    const modal = document.querySelector('.modal-lorebook-entries');
    if (modal) modal.remove();
}

/**
 * 打開單條目編輯視窗
 */
async function openEditLorebookEntryModal(lorebookName, uid) {
    const entries = await LorebookManager.getLorebookEntries(lorebookName);
    const entry = entries.find(e => e.uid === uid);
    if (!entry) {
        alert('找不到條目');
        return;
    }
    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal-lorebook-edit';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>編輯條目</h3>
                <span class="close-btn" onclick="closeEditLorebookEntryModal()">&times;</span>
            </div>
            <div class="modal-body">
                <label>標題/備註：</label>
                <input type="text" id="editEntryComment" value="${entry.comment || ''}" style="width:100%;margin-bottom:8px;">
                <label>關鍵詞（逗號分隔）：</label>
                <input type="text" id="editEntryKeys" value="${entry.keys ? entry.keys.join(',') : ''}" style="width:100%;margin-bottom:8px;">
                <label>內容：</label>
                <textarea id="editEntryContent" rows="4" style="width:100%;margin-bottom:8px;">${entry.content || ''}</textarea>
                <label>啟用：</label>
                <input type="checkbox" id="editEntryEnabled" ${entry.enabled ? 'checked' : ''}>
                <button onclick="saveEditLorebookEntry('${lorebookName}',${uid})" class="btn-primary" style="width:100%;margin-top:16px;">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}
window.openEditLorebookEntryModal = openEditLorebookEntryModal;

function closeEditLorebookEntryModal() {
    const modal = document.querySelector('.modal-lorebook-edit');
    if (modal) modal.remove();
}

/**
 * 保存條目編輯
 */
async function saveEditLorebookEntry(lorebookName, uid) {
    const comment = document.getElementById('editEntryComment').value.trim();
    const keys = document.getElementById('editEntryKeys').value.split(',').map(k=>k.trim()).filter(Boolean);
    const content = document.getElementById('editEntryContent').value;
    const enabled = document.getElementById('editEntryEnabled').checked;
    try {
        await TavernAPI.call('setLorebookEntries', lorebookName, [{ uid, comment, keys, content, enabled }]);
        showSuccessToast('條目已保存');
        closeEditLorebookEntryModal();
        closeLorebookEntriesModal();
        // 重新打開條目列表
        setTimeout(()=>openLorebookEntriesModal(lorebookName), 200);
    } catch (e) {
        showErrorToast('保存失敗: '+e.message);
    }
}
window.saveEditLorebookEntry = saveEditLorebookEntry;

// ========== 世界書管理器樣式優化 ========== 
const improvedLorebookStyles = `
<style>
.modal-content {
    background: #fff;
    border-radius: 18px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    padding: 0;
    overflow: visible;
    position: relative;
}
.modal-header {
    padding: 18px 24px 10px 24px;
    border-bottom: 1px solid #f0f0f0;
    border-radius: 18px 18px 0 0;
    background: #f8f9fa;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.modal-header h3 {
    font-size: 18px;
    font-weight: 700;
    margin: 0;
    color: #222;
}
.close-btn {
    font-size: 22px;
    color: #888;
    cursor: pointer;
    transition: color 0.2s;
}
.close-btn:hover { color: #e74c3c; }

.modal-tab-bar {
    display: flex;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f9fa;
    border-radius: 0 0 0 0;
    padding: 0 24px;
    margin-bottom: 0;
    gap: 0;
}
.modal-tab-btn {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    font-size: 15px;
    font-weight: 600;
    color: #666;
    padding: 14px 0 10px 0;
    cursor: pointer;
    border-bottom: 2.5px solid transparent;
    transition: color 0.18s, border-bottom 0.18s;
}
.modal-tab-btn.active {
    color: #2d5be3;
    border-bottom: 2.5px solid #2d5be3;
    background: #fff;
}

.modal-body {
    padding: 18px 24px 24px 24px;
    background: #fff;
    border-radius: 0 0 18px 18px;
    max-height: 80vh;
    overflow: hidden;
}

.lorebook-section {
    margin-bottom: 22px;
    padding: 14px 12px 12px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #fafbfc;
    box-shadow: 0 2px 8px rgba(0,0,0,0.03);
    /* max-height/overflow 已移除，讓內層滾動條生效 */
}
.lorebook-section h4 {
    margin: 0 0 10px 0;
    color: #333;
    font-size: 15px;
    font-weight: 600;
}

.lorebook-list {
    max-height: 48vh;
    overflow-y: auto;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    padding: 4px 0;
}
.lorebook-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0 8px 4px;
    border-bottom: 1px solid #f0f0f0;
    font-size: 15px;
}
.lorebook-item:last-child { border-bottom: none; }
.lorebook-item span {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.lorebook-actions {
    display: flex;
    gap: 10px;
    align-items: center;
}
.btn-primary {
    background: linear-gradient(90deg,#4f8cff 0%,#6ed0fa 100%);
    color: white;
    border: none;
    padding: 7px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    font-size: 14px;
    transition: background 0.2s;
    box-shadow: 0 2px 8px rgba(79,140,255,0.08);
}
.btn-primary:hover { background: linear-gradient(90deg,#357ae8 0%,#4fc3f7 100%); }
.btn-danger {
    background: #f44336;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    margin-left: 2px;
    transition: background 0.2s;
}
.btn-danger:hover { background: #c82333; }

#lorebookEntriesList {
    max-height: 48vh;
    overflow-y: auto;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    padding: 2px 0;
}
.lorebook-entry-item {
    border-bottom: 1px solid #f0f0f0;
    padding: 10px 0 10px 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 14px;
}
.lorebook-entry-item:last-child { border-bottom: none; }
.lorebook-entry-item b {
    color: #2d5be3;
    font-weight: 600;
}

.modal-body label {
    font-size: 13px;
    color: #555;
    margin-bottom: 2px;
    display: block;
}
.modal-body input[type="text"],
.modal-body textarea {
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 7px 10px;
    font-size: 14px;
    width: 100%;
    margin-bottom: 10px;
    background: #f9f9fa;
    box-sizing: border-box;
}
.modal-body textarea {
    min-height: 70px;
    resize: vertical;
}
.modal-body input[type="checkbox"] {
    margin-right: 6px;
}

@media (max-width: 600px) {
    .modal-content {
        max-width: 98vw !important;
        min-width: 0;
        padding: 0;
    }
    .modal-header, .modal-body {
        padding-left: 10px;
        padding-right: 10px;
    }
    .modal-tab-bar { padding-left: 10px; padding-right: 10px; }
    .lorebook-section { padding: 10px 4px 8px 4px; }
    .lorebook-list, #lorebookEntriesList { max-height: 36vh; }
}

.modal-overlay {
    z-index: 9999;
}
.modal-overlay::before {
    content: '';
    position: fixed;
    left: 0; top: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.18);
    z-index: -1;
}
#advancedFields {
    max-height: 36vh;
    overflow-y: auto;
}
</style>
`;
document.head.insertAdjacentHTML('beforeend', improvedLorebookStyles);

// 點擊遮罩區域關閉彈窗（只針對世界書管理器/條目彈窗）
document.addEventListener('mousedown', function(e) {
    const overlays = document.querySelectorAll('.modal-overlay');
    if (overlays.length > 0) {
        const topModal = overlays[overlays.length-1];
        if (e.target === topModal) topModal.remove();
    }
});

// 編輯條目彈窗（含進階欄位）
async function openEditLorebookEntryModal(lorebookName, uid) {
    const entries = await LorebookManager.getLorebookEntries(lorebookName);
    const entry = entries.find(e => e.uid === uid);
    if (!entry) {
        alert('找不到條目');
        return;
    }
    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal-lorebook-edit';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>編輯條目</h3>
                <span class="close-btn" onclick="closeEditLorebookEntryModal()">&times;</span>
            </div>
            <div class="modal-body">
                <label>標題/備註：</label>
                <input type="text" id="editEntryComment" value="${entry.comment || ''}" style="width:100%;margin-bottom:8px;">
                <label>關鍵詞（逗號分隔）：</label>
                <input type="text" id="editEntryKeys" value="${entry.keys ? entry.keys.join(',') : ''}" style="width:100%;margin-bottom:8px;">
                <label>內容：</label>
                <textarea id="editEntryContent" rows="4" style="width:100%;margin-bottom:8px;">${entry.content || ''}</textarea>
                <label>啟用：</label>
                <input type="checkbox" id="editEntryEnabled" ${entry.enabled ? 'checked' : ''}>
                <button type="button" id="toggleAdvancedBtn" class="btn-primary" style="width:100%;margin:12px 0 0 0;">展開進階</button>
                <div id="advancedFields" style="display:none;margin-top:10px;">
                    <label>插入位置：</label>
                    <select id="editEntryPosition" style="width:100%;margin-bottom:8px;">
                        <option value="after_author_note">作者備註之後</option>
                        <option value="before_author_note">作者備註之前</option>
                        <option value="after_character_definition">角色定義之後</option>
                        <option value="before_character_definition">角色定義之前</option>
                        <option value="after_example_messages">對話範例之後</option>
                        <option value="before_example_messages">對話範例之前</option>
                        <option value="at_depth_as_system">在系統深度</option>
                        <option value="at_depth_as_assistant">在AI深度</option>
                        <option value="at_depth_as_user">在用戶深度</option>
                    </select>
                    <label>深度：</label>
                    <input type="number" id="editEntryDepth" value="${entry.depth !== undefined && entry.depth !== null ? entry.depth : ''}" style="width:100%;margin-bottom:8px;">
                    <label>順序：</label>
                    <input type="number" id="editEntryOrder" value="${entry.order !== undefined ? entry.order : ''}" style="width:100%;margin-bottom:8px;">
                    <label>機率(0-100)：</label>
                    <input type="number" id="editEntryProbability" value="${entry.probability !== undefined ? entry.probability : 100}" min="0" max="100" style="width:100%;margin-bottom:8px;">
                    <label>群組：</label>
                    <input type="text" id="editEntryGroup" value="${entry.group || ''}" style="width:100%;margin-bottom:8px;">
                </div>
                <button onclick="saveEditLorebookEntry('${lorebookName}',${uid})" class="btn-primary" style="width:100%;margin-top:16px;">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    // 設定進階欄位初始值
    document.getElementById('editEntryPosition').value = entry.position || 'after_author_note';
    // 展開/收起進階
    document.getElementById('toggleAdvancedBtn').onclick = function() {
        const adv = document.getElementById('advancedFields');
        if (adv.style.display === 'none') {
            adv.style.display = 'block';
            this.textContent = '收起進階';
        } else {
            adv.style.display = 'none';
            this.textContent = '展開進階';
        }
    };
}
window.openEditLorebookEntryModal = openEditLorebookEntryModal;

// 保存編輯（帶進階欄位）
async function saveEditLorebookEntry(lorebookName, uid) {
    const comment = document.getElementById('editEntryComment').value.trim();
    const keys = document.getElementById('editEntryKeys').value.split(',').map(k=>k.trim()).filter(Boolean);
    const content = document.getElementById('editEntryContent').value;
    const enabled = document.getElementById('editEntryEnabled').checked;
    // 進階欄位
    const adv = document.getElementById('advancedFields');
    let position, depth, order, probability, group;
    if (adv && adv.style.display !== 'none') {
        position = document.getElementById('editEntryPosition').value;
        depth = document.getElementById('editEntryDepth').value;
        order = document.getElementById('editEntryOrder').value;
        probability = document.getElementById('editEntryProbability').value;
        group = document.getElementById('editEntryGroup').value.trim();
    }
    try {
        await TavernAPI.call('setLorebookEntries', lorebookName, [{
            uid, comment, keys, content, enabled,
            ...(adv && adv.style.display !== 'none' ? {
                position,
                depth: depth === '' ? null : Number(depth),
                order: order === '' ? undefined : Number(order),
                probability: probability === '' ? undefined : Number(probability),
                group: group || undefined
            } : {})
        }]);
        showSuccessToast('條目已保存');
        closeEditLorebookEntryModal();
        closeLorebookEntriesModal();
        setTimeout(()=>openLorebookEntriesModal(lorebookName), 200);
    } catch (e) {
        showErrorToast('保存失敗: '+e.message);
    }
}
window.saveEditLorebookEntry = saveEditLorebookEntry;

// 新增條目彈窗（含進階欄位）
window.openAddLorebookEntryModal = function(lorebookName) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal-lorebook-edit';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>新增條目</h3>
                <span class="close-btn" onclick="closeEditLorebookEntryModal()">&times;</span>
            </div>
            <div class="modal-body">
                <label>標題/備註：</label>
                <input type="text" id="editEntryComment" value="" style="width:100%;margin-bottom:8px;">
                <label>關鍵詞（逗號分隔）：</label>
                <input type="text" id="editEntryKeys" value="" style="width:100%;margin-bottom:8px;">
                <label>內容：</label>
                <textarea id="editEntryContent" rows="4" style="width:100%;margin-bottom:8px;"></textarea>
                <label>啟用：</label>
                <input type="checkbox" id="editEntryEnabled" checked>
                <button type="button" id="toggleAdvancedBtn" class="btn-primary" style="width:100%;margin:12px 0 0 0;">展開進階</button>
                <div id="advancedFields" style="display:none;margin-top:10px;">
                    <label>插入位置：</label>
                    <select id="editEntryPosition" style="width:100%;margin-bottom:8px;">
                        <option value="after_author_note">作者備註之後</option>
                        <option value="before_author_note">作者備註之前</option>
                        <option value="after_character_definition">角色定義之後</option>
                        <option value="before_character_definition">角色定義之前</option>
                        <option value="after_example_messages">對話範例之後</option>
                        <option value="before_example_messages">對話範例之前</option>
                        <option value="at_depth_as_system">在系統深度</option>
                        <option value="at_depth_as_assistant">在AI深度</option>
                        <option value="at_depth_as_user">在用戶深度</option>
                    </select>
                    <label>深度：</label>
                    <input type="number" id="editEntryDepth" value="" style="width:100%;margin-bottom:8px;">
                    <label>順序：</label>
                    <input type="number" id="editEntryOrder" value="" style="width:100%;margin-bottom:8px;">
                    <label>機率(0-100)：</label>
                    <input type="number" id="editEntryProbability" value="100" min="0" max="100" style="width:100%;margin-bottom:8px;">
                    <label>群組：</label>
                    <input type="text" id="editEntryGroup" value="" style="width:100%;margin-bottom:8px;">
                </div>
                <button onclick="saveAddLorebookEntry('${lorebookName}')" class="btn-primary" style="width:100%;margin-top:16px;">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('editEntryPosition').value = 'after_author_note';
    document.getElementById('toggleAdvancedBtn').onclick = function() {
        const adv = document.getElementById('advancedFields');
        if (adv.style.display === 'none') {
            adv.style.display = 'block';
            this.textContent = '收起進階';
        } else {
            adv.style.display = 'none';
            this.textContent = '展開進階';
        }
    };
}
window.saveAddLorebookEntry = async function(lorebookName) {
    const comment = document.getElementById('editEntryComment').value.trim();
    const keys = document.getElementById('editEntryKeys').value.split(',').map(k=>k.trim()).filter(Boolean);
    const content = document.getElementById('editEntryContent').value;
    const enabled = document.getElementById('editEntryEnabled').checked;
    // 進階欄位
    const adv = document.getElementById('advancedFields');
    let position, depth, order, probability, group;
    if (adv && adv.style.display !== 'none') {
        position = document.getElementById('editEntryPosition').value;
        depth = document.getElementById('editEntryDepth').value;
        order = document.getElementById('editEntryOrder').value;
        probability = document.getElementById('editEntryProbability').value;
        group = document.getElementById('editEntryGroup').value.trim();
    }
    try {
        await LorebookManager.createLorebookEntry(lorebookName, {
            comment, keys, content, enabled,
            ...(adv && adv.style.display !== 'none' ? {
                position,
                depth: depth === '' ? null : Number(depth),
                order: order === '' ? undefined : Number(order),
                probability: probability === '' ? undefined : Number(probability),
                group: group || undefined
            } : {})
        });
        showSuccessToast('條目已新增');
        closeEditLorebookEntryModal();
        closeLorebookEntriesModal();
        setTimeout(()=>openLorebookEntriesModal(lorebookName), 200);
    } catch (e) {
        showErrorToast('新增失敗: '+e.message);
    }
}

// 監聽來自通話面板的 CALL_USER_MESSAGE
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'CALL_USER_MESSAGE') {
        const text = event.data.content;
        const stInput = document.querySelector('#send_textarea');
        const sendButton = document.querySelector('#send_but');
        if (stInput && sendButton) {
            stInput.value = text;
            stInput.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(() => { sendButton.click(); }, 100);
        }
    }
});

// =======================================================================
//                         送禮功能實現
// =======================================================================

/**
 * 設置送禮模態窗口
 */
function setupGiftModal() {
    const recipientSelect = document.getElementById('giftRecipient');
    if (!recipientSelect) return;
    
    // 清空現有選項
    recipientSelect.innerHTML = '<option value="">選擇接收者...</option>';
    
    // 檢查當前聊天類型
    if (!currentChat) {
        console.warn('[送禮功能] 沒有當前聊天');
        return;
    }
    
    if (currentChat.type === 'group' || currentChat.type === 'group_chat') {
        // 群聊：獲取群組成員
        console.log('[送禮功能] 群聊模式，獲取成員列表');
        loadGroupMembersForGift();
    } else if (currentChat.type === 'dm' || currentChat.type === 'dm_chat') {
        // 私聊：顯示角色名稱
        console.log('[送禮功能] 私聊模式，顯示角色');
        const characterName = currentChat.participant2 || '角色';
        const option = document.createElement('option');
        option.value = characterName;
        option.textContent = characterName;
        recipientSelect.appendChild(option);
    } else {
        console.warn('[送禮功能] 未知聊天類型:', currentChat.type);
    }
}

/**
 * 為送禮功能載入群組成員
 */
async function loadGroupMembersForGift() {
    const recipientSelect = document.getElementById('giftRecipient');
    if (!recipientSelect) return;
    
    if (!currentChat.id || !window.groupMemberManager) {
        console.warn('[送禮功能] 無法載入成員：缺少聊天ID或成員管理器');
        return;
    }
    
    try {
        console.log('[送禮功能] 正在載入群組成員，聊天ID:', currentChat.id);
        const allMembers = await window.groupMemberManager.getGroupMembers(currentChat.id);
        console.log('[送禮功能] 從 IndexedDB 載入的所有成員:', allMembers);
        
        // 排除群組創建者，只顯示其他成員
        const adminName = currentChat.admin;
        const otherMembers = allMembers.filter(member => member.name !== adminName);
        console.log('[送禮功能] 過濾後的群組成員（排除創建者）:', otherMembers);
        
        otherMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member.name;
            option.textContent = member.displayName || member.name;
            recipientSelect.appendChild(option);
        });
        
        // 如果沒有成員，嘗試從temporaryGroups獲取
        if (otherMembers.length === 0 && window.temporaryGroups && window.temporaryGroups[currentChat.id]) {
            const tempGroup = window.temporaryGroups[currentChat.id];
            if (tempGroup.members) {
                tempGroup.members.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member.name;
                    option.textContent = member.name;
                    recipientSelect.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('[送禮功能] 載入群組成員失敗:', error);
    }
}

/**
 * 確認送禮
 */
function confirmGift() {
    const recipient = document.getElementById('giftRecipient').value.trim();
    const giftName = document.getElementById('giftName').value.trim();
    const giftDescription = document.getElementById('giftDescription').value.trim();
    const giftValue = document.getElementById('giftValue').value.trim();
    
    // 驗證輸入
    if (!recipient) {
        alert('請選擇接收者！');
        return;
    }
    
    if (!giftName) {
        alert('請輸入禮物名稱！');
        return;
    }
    
    if (!giftValue || isNaN(parseFloat(giftValue))) {
        alert('請輸入有效的禮物價值！');
        return;
    }
    
    // 生成簡短的禮物ID（3位數字）
    const giftId = Math.floor(Math.random() * 900) + 100; // 100-999
    
    // 使用逗號分隔的格式：禮物ID,接收者,禮物名稱,描述,價值
    const giftDesc = giftDescription || '禮物';
    const description = `[gift:${giftId},${recipient},${giftName},${giftDesc},${giftValue}]`;
    
    // 添加到附件列表
    addAttachmentTag('gift', description, '🎁');
    
    // 關閉模態窗口
    closeFunctionModal('giftModal');
    
    // 清空輸入框
    document.getElementById('giftRecipient').value = '';
    document.getElementById('giftName').value = '';
    document.getElementById('giftDescription').value = '';
    document.getElementById('giftValue').value = '';
    
    console.log('[送禮功能] 禮物已添加:', description);
}

// =======================================================================
//                         轉賬功能優化
// =======================================================================

/**
 * 設置轉賬模態窗口
 */
function setupTransferModal() {
    const receiverSelect = document.getElementById('transferReceiver');
    if (!receiverSelect) return;
    
    // 清空現有選項
    receiverSelect.innerHTML = '<option value="">選擇接收者...</option>';
    
    // 檢查當前聊天類型
    if (!currentChat) {
        console.warn('[轉賬功能] 沒有當前聊天');
        return;
    }
    
    if (currentChat.type === 'group' || currentChat.type === 'group_chat') {
        // 群聊：獲取群組成員
        console.log('[轉賬功能] 群聊模式，獲取成員列表');
        loadGroupMembersForTransfer();
    } else if (currentChat.type === 'dm' || currentChat.type === 'dm_chat') {
        // 私聊：顯示角色名稱
        console.log('[轉賬功能] 私聊模式，顯示角色');
        const characterName = currentChat.participant2 || '角色';
        const option = document.createElement('option');
        option.value = characterName;
        option.textContent = characterName;
        receiverSelect.appendChild(option);
    } else {
        console.warn('[轉賬功能] 未知聊天類型:', currentChat.type);
    }
}

/**
 * 🆕 設置信封模態窗口
 */
function setupLetterModal() {
    const recipientSelect = document.getElementById('letterTo');
    if (!recipientSelect) return;
    
    // 清空現有選項
    recipientSelect.innerHTML = '<option value="">選擇收件人...</option>';
    
    // 檢查當前聊天類型
    if (!currentChat) {
        console.warn('[信封功能] 沒有當前聊天');
        return;
    }
    
    if (currentChat.type === 'group' || currentChat.type === 'group_chat') {
        // 群聊：獲取群組成員
        console.log('[信封功能] 群聊模式，獲取成員列表');
        loadGroupMembersForLetter();
    } else if (currentChat.type === 'dm' || currentChat.type === 'dm_chat') {
        // 私聊：顯示角色名稱
        console.log('[信封功能] 私聊模式，顯示角色');
        const characterName = currentChat.participant2 || '角色';
        const option = document.createElement('option');
        option.value = characterName;
        option.textContent = characterName;
        recipientSelect.appendChild(option);
    } else {
        console.warn('[信封功能] 未知聊天類型:', currentChat.type);
    }
}

/**
 * 🆕 為信封功能載入群組成員
 */
async function loadGroupMembersForLetter() {
    const recipientSelect = document.getElementById('letterTo');
    if (!recipientSelect) return;
    
    if (!currentChat.id || !window.groupMemberManager) {
        console.warn('[信封功能] 無法載入成員：缺少聊天ID或成員管理器');
        return;
    }
    
    try {
        console.log('[信封功能] 正在載入群組成員，聊天ID:', currentChat.id);
        const allMembers = await window.groupMemberManager.getGroupMembers(currentChat.id);
        console.log('[信封功能] 從 IndexedDB 載入的所有成員:', allMembers);
        
        // 排除群組創建者，只顯示其他成員
        const adminName = currentChat.admin;
        const otherMembers = allMembers.filter(member => member.name !== adminName);
        console.log('[信封功能] 過濾後的群組成員（排除創建者）:', otherMembers);
        
        otherMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member.name;
            option.textContent = member.displayName || member.name;
            recipientSelect.appendChild(option);
        });
        
        // 如果沒有成員，嘗試從temporaryGroups獲取
        if (otherMembers.length === 0 && window.temporaryGroups && window.temporaryGroups[currentChat.id]) {
            const tempGroup = window.temporaryGroups[currentChat.id];
            if (tempGroup.members) {
                tempGroup.members.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member.name;
                    option.textContent = member.name;
                    recipientSelect.appendChild(option);
                });
            }
        }
        
        console.log('[信封功能] 收件人選項已設置完成');
    } catch (error) {
        console.error('[信封功能] 載入成員失敗:', error);
    }
}

/**
 * 為轉賬功能載入群組成員
 */
async function loadGroupMembersForTransfer() {
    const receiverSelect = document.getElementById('transferReceiver');
    if (!receiverSelect) return;
    
    if (!currentChat.id || !window.groupMemberManager) {
        console.warn('[轉賬功能] 無法載入成員：缺少聊天ID或成員管理器');
        return;
    }
    
    try {
        console.log('[轉賬功能] 正在載入群組成員，聊天ID:', currentChat.id);
        const allMembers = await window.groupMemberManager.getGroupMembers(currentChat.id);
        console.log('[轉賬功能] 從 IndexedDB 載入的所有成員:', allMembers);
        
        // 排除群組創建者，只顯示其他成員
        const adminName = currentChat.admin;
        const otherMembers = allMembers.filter(member => member.name !== adminName);
        console.log('[轉賬功能] 過濾後的群組成員（排除創建者）:', otherMembers);
        
        otherMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member.name;
            option.textContent = member.displayName || member.name;
            receiverSelect.appendChild(option);
        });
        
        // 如果沒有成員，嘗試從temporaryGroups獲取
        if (otherMembers.length === 0 && window.temporaryGroups && window.temporaryGroups[currentChat.id]) {
            const tempGroup = window.temporaryGroups[currentChat.id];
            if (tempGroup.members) {
                tempGroup.members.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member.name;
                    option.textContent = member.name;
                    receiverSelect.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('[轉賬功能] 載入群組成員失敗:', error);
    }
}

// =======================================================================
//                          IndexedDB 背景圖片管理
// =======================================================================

/**
 * 初始化 IndexedDB 数据库
 */
async function initBackgroundDB() {
    return new Promise((resolve, reject) => {
        console.log('[背景圖片] 開始初始化 IndexedDB');
        
        const request = indexedDB.open('BackgroundImagesDB', 1);
        
        request.onerror = () => {
            console.error('[背景圖片] IndexedDB 打開失敗:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            backgroundDB = request.result;
            console.log('[背景圖片] IndexedDB 初始化成功，數據庫:', backgroundDB);
            resolve(backgroundDB);
        };
        
        request.onupgradeneeded = (event) => {
            console.log('[背景圖片] IndexedDB 需要升級');
            const db = event.target.result;
            
            // 創建背景圖片存儲
            if (!db.objectStoreNames.contains('backgroundImages')) {
                const store = db.createObjectStore('backgroundImages', { keyPath: 'id', autoIncrement: true });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('name', 'name', { unique: false });
                console.log('[背景圖片] 創建 objectStore: backgroundImages');
            }
        };
    });
}

/**
 * 保存背景圖片到 IndexedDB
 */
async function saveBackgroundImage(file) {
    if (!backgroundDB) {
        await initBackgroundDB();
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
        const transaction = backgroundDB.transaction(['backgroundImages'], 'readwrite');
        const store = transaction.objectStore('backgroundImages');
        
        const imageData = {
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64Data,
            timestamp: Date.now()
        };
        
        const request = store.add(imageData);
        
        request.onsuccess = () => {
            console.log('[背景圖片] 圖片保存成功，ID:', request.result);
            resolve(request.result);
        };
        
        request.onerror = () => {
            console.error('[背景圖片] 圖片保存失敗:', request.error);
            reject(request.error);
        };
        
        transaction.onerror = () => {
            console.error('[背景圖片] 事務失敗:', transaction.error);
            reject(transaction.error);
        };
    });
}

/**
 * 從 IndexedDB 獲取所有背景圖片
 */
async function getAllBackgroundImages() {
    if (!backgroundDB) {
        await initBackgroundDB();
    }
    
    return new Promise((resolve, reject) => {
        const transaction = backgroundDB.transaction(['backgroundImages'], 'readonly');
        const store = transaction.objectStore('backgroundImages');
        const request = store.getAll();
        
        request.onsuccess = () => {
            console.log('[背景圖片] 獲取到', request.result.length, '張圖片');
            resolve(request.result);
        };
        
        request.onerror = () => {
            console.error('[背景圖片] 獲取圖片失敗:', request.error);
            reject(request.error);
        };
    });
}

/**
 * 從 IndexedDB 刪除背景圖片
 */
async function deleteBackgroundImage(id) {
    if (!backgroundDB) {
        await initBackgroundDB();
    }
    
    return new Promise((resolve, reject) => {
        const transaction = backgroundDB.transaction(['backgroundImages'], 'readwrite');
        const store = transaction.objectStore('backgroundImages');
        const request = store.delete(id);
        
        request.onsuccess = () => {
            console.log('[背景圖片] 圖片刪除成功，ID:', id);
            resolve();
        };
        
        request.onerror = () => {
            console.error('[背景圖片] 圖片刪除失敗:', request.error);
            reject(request.error);
        };
    });
}

// =======================================================================
//                          背景圖片上傳功能
// =======================================================================

/**
 * 初始化背景圖片上傳功能
 */
async function initBackgroundUpload() {
    const fileInput = document.getElementById('backgroundImageUpload');
    if (!fileInput) {
        console.warn('[背景圖片] 找不到文件輸入元素');
        return;
    }
    
    // 移除舊的事件監聽器（如果有的話）
    fileInput.removeEventListener('change', handleBackgroundImageUpload);
    // 添加新的事件監聽器
    fileInput.addEventListener('change', handleBackgroundImageUpload);
    
    console.log('[背景圖片] 上傳功能初始化完成');
    
    // 載入已上傳的圖片
    try {
        await loadUploadedBackgroundImages();
    } catch (error) {
        console.error('[背景圖片] 載入已上傳圖片失敗:', error);
    }
}

/**
 * 處理背景圖片上傳
 */
async function handleBackgroundImageUpload(event) {
    console.log('[背景圖片] 文件選擇事件觸發');
    
    const file = event.target.files[0];
    if (!file) {
        console.log('[背景圖片] 沒有選擇文件');
        return;
    }
    
    console.log('[背景圖片] 選擇的文件:', file.name, '大小:', file.size, '類型:', file.type);
    
    // 檢查文件類型
    if (!file.type.startsWith('image/')) {
        alert('請選擇圖片文件！');
        return;
    }
    
    // 檢查文件大小 (限制為 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('圖片大小不能超過 5MB！');
        return;
    }
    
    try {
        console.log('[背景圖片] 開始上傳圖片:', file.name);
        
        // 保存到 IndexedDB
        const imageId = await saveBackgroundImage(file);
        
        // 更新預覽
        updateBackgroundImagePreview(file);
        
        // 重新載入已上傳的圖片列表
        await loadUploadedBackgroundImages();
        
        console.log('[背景圖片] 圖片上傳完成，ID:', imageId);
        
        // 清空文件輸入
        event.target.value = '';
        
    } catch (error) {
        console.error('[背景圖片] 上傳失敗:', error);
        alert('圖片上傳失敗，請重試！');
    }
}

/**
 * 更新背景圖片預覽
 */
function updateBackgroundImagePreview(file) {
    const preview = document.getElementById('backgroundImagePreview');
    if (!preview) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        preview.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/**
 * 載入已上傳的背景圖片
 */
async function loadUploadedBackgroundImages() {
    try {
        const images = await getAllBackgroundImages();
        const container = document.getElementById('uploadedImagesContainer');
        const listContainer = document.getElementById('uploadedImagesList');
        
        if (!container || !listContainer) return;
        
        if (images.length === 0) {
            listContainer.style.display = 'none';
            return;
        }
        
        listContainer.style.display = 'block';
        container.innerHTML = '';
        
        images.forEach(image => {
            const imageItem = document.createElement('div');
            imageItem.className = 'uploaded-image-item';
            imageItem.innerHTML = `
                <img src="${image.data}" alt="${image.name}" onclick="selectBackgroundImage('${image.data}')">
                <button class="delete-btn" onclick="deleteBackgroundImageFromList(${image.id})" title="刪除">×</button>
            `;
            container.appendChild(imageItem);
        });
        
        console.log('[背景圖片] 已載入', images.length, '張圖片');
        
    } catch (error) {
        console.error('[背景圖片] 載入圖片列表失敗:', error);
    }
}

/**
 * 選擇背景圖片
 */
function selectBackgroundImage(imageData) {
    if (!currentChat) {
        alert('錯誤：沒有當前聊天室！');
        return;
    }

    const chatBody = document.querySelector('#chatDetailScreen .chat-body');
    if (!chatBody) {
        console.error('[背景圖片] 找不到聊天室背景元素');
        return;
    }

    // 設置聊天室背景
    chatBody.style.backgroundImage = `url(${imageData})`;
    chatBody.style.backgroundSize = 'cover';
    chatBody.style.backgroundPosition = 'center';
    chatBody.style.backgroundRepeat = 'no-repeat';
    
    // 使用 localStorage 保存背景，key 與聊天室 ID 綁定
    const storageKey = `chat_bg_${currentChat.id}`;
    localStorage.setItem(storageKey, imageData);
    
    console.log('[背景圖片] 聊天室背景圖片已設置，聊天ID:', currentChat.id);
    
    // 關閉模態窗口
    closeBackgroundModal();
}

/**
 * 從列表中刪除背景圖片
 */
async function deleteBackgroundImageFromList(imageId) {
    if (!confirm('確定要刪除這張圖片嗎？')) return;
    
    try {
        await deleteBackgroundImage(imageId);
        await loadUploadedBackgroundImages();
        console.log('[背景圖片] 圖片刪除成功');
    } catch (error) {
        console.error('[背景圖片] 刪除失敗:', error);
        alert('刪除失敗，請重試！');
    }
}

/**
 * 修改背景設置確認函數
 */
function applyBackgroundChange() {
    if (!currentChat) {
        alert('錯誤：沒有當前聊天室！');
        return;
    }

    const chatBody = document.querySelector('#chatDetailScreen .chat-body');
    if (!chatBody) {
        console.error('[背景設置] 找不到聊天室背景元素');
        return;
    }

    const urlInput = document.getElementById('backgroundUrlInput');
    const url = urlInput.value.trim();
    
    // 使用 localStorage 保存背景，key 與聊天室 ID 綁定
    const storageKey = `chat_bg_${currentChat.id}`;
    
    if (url) {
        // 設置聊天室背景圖片
        chatBody.style.backgroundImage = `url(${url})`;
        chatBody.style.backgroundSize = 'cover';
        chatBody.style.backgroundPosition = 'center';
        chatBody.style.backgroundRepeat = 'no-repeat';
        
        // 保存到 localStorage
        localStorage.setItem(storageKey, url);
        
        console.log('[背景設置] URL背景已設置，聊天ID:', currentChat.id, 'URL:', url);
    } else {
        // 如果 URL 為空，則移除背景
        chatBody.style.backgroundImage = 'none';
        localStorage.removeItem(storageKey);
        console.log('[背景設置] 背景已移除，聊天ID:', currentChat.id);
    }
    
    closeBackgroundModal();
}

/**
 * 初始化背景設置
 */
function initBackgroundSettings() {
    // 初始化上傳功能
    initBackgroundUpload();
}

/**
 * 載入聊天室背景圖片
 */
function loadChatBackground() {
    if (!currentChat) return;
    
    const chatBody = document.querySelector('#chatDetailScreen .chat-body');
    if (!chatBody) return;
    
    // 載入保存的背景圖片，key 與聊天室 ID 綁定
    const storageKey = `chat_bg_${currentChat.id}`;
    const savedBackground = localStorage.getItem(storageKey);
    
    if (savedBackground) {
        chatBody.style.backgroundImage = `url(${savedBackground})`;
        chatBody.style.backgroundSize = 'cover';
        chatBody.style.backgroundPosition = 'center';
        chatBody.style.backgroundRepeat = 'no-repeat';
        console.log('[背景設置] 載入聊天室背景，聊天ID:', currentChat.id);
    } else {
        // 如果沒有保存的背景，清除背景
        chatBody.style.backgroundImage = 'none';
    }
}

// =======================================================================
//                          初始化
// =======================================================================

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', () => {
    initBackgroundSettings();
});

// 將函數設為全局可用
window.selectBackgroundImage = selectBackgroundImage;
window.deleteBackgroundImageFromList = deleteBackgroundImageFromList;
window.initBackgroundUpload = initBackgroundUpload;
window.loadChatBackground = loadChatBackground;