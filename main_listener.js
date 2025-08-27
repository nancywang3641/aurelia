/**
 * 主面板監聽器 - v1.1 (新架构优化版)
 * 接收主面板處理器的數據並更新UI顯示
 * 架構：Main面板（接收數據並顯示）
 */

(function() {
    console.log('[主面板監聽器] 已啟動 v1.1 (新架构优化版)');

    // ===== 配置項 =====
    const CONFIG = {
        DEBUG: true,
        AUTO_UPDATE: true,
        UPDATE_DELAY: 100
    };

    // ===== 數據存儲 =====
    let currentMainData = {
        area: { current: '', time: '', day: '' },
        scene: { date: '', time: '', location: '', prompt: '' },
        mainRole: { name: '', reputation: '', level: '', statusBtn: '', levelBtn: '' },
        schedules: [],
        reminder: '',
        teammates: [],
        action: ''
    };

    // ===== 增強的消息監聽器 =====
    
    // 方式1: 監聽直接消息 (來自酒館AI環境)
    window.addEventListener('message', function(event) {
        try {
            if (event.data && event.data.type === 'MAIN_PANEL_DATA') {
                currentMainData = event.data.data;
                updateMainPanelUI();
            }
        } catch (error) {
            console.error('[主面板監聽器] 處理直接消息失敗:', error);
        }
    });

    // 方式2: 監聽自定義事件 (來自main_panel.html轉發)
    window.addEventListener('MAIN_PANEL_DATA_RECEIVED', function(event) {
        try {
            if (event.detail && event.detail.type === 'MAIN_PANEL_DATA') {
                currentMainData = event.detail.data;
                updateMainPanelUI();
            }
        } catch (error) {
            console.error('[主面板監聽器] 處理轉發消息失敗:', error);
        }
    });

    // 方式3: 暴露處理函數給main_panel.html調用
    window.mainListener = {
        handleMainPanelData: function(data) {
            try {
                currentMainData = data.data;
                updateMainPanelUI();
                return { success: true, timestamp: Date.now() };
            } catch (error) {
                console.error('[主面板監聽器] 處理主面板數據失敗:', error);
                return { success: false, error: error.message };
            }
        },
        
        getCurrentData: function() {
            return currentMainData;
        },
        
        forceUpdateUI: function() {
            updateMainPanelUI();
        }
    };

    // ===== UI更新函數 =====
    function updateMainPanelUI() {
        try {
            if (CONFIG.DEBUG) {
                console.log('[主面板監聽器] 🔄 开始更新UI，当前数据:', currentMainData);
            }

            // 更新區域信息
            updateAreaInfo();
            
            // 更新場景信息
            updateSceneInfo();
            
            // 更新主角信息
            updateMainRoleInfo();
            
            // 更新日程安排
            updateSchedules();
            
            // 更新隊友狀態
            updateTeammatesStatus();
            
            // 更新行動描述
            updateAction();

            if (CONFIG.DEBUG) {
                console.log('[主面板監聽器] ✅ UI更新完成');
            }
        } catch (error) {
            console.error('[主面板監聽器] ❌ UI更新失敗:', error);
        }
    }

    // ===== 更新區域信息 =====
    function updateAreaInfo() {
        try {
            // 更新日期时间信息
            const datetimeInfo = document.querySelector('.datetime-info');
            if (datetimeInfo) {
                if (currentMainData.scene.date && currentMainData.scene.time) {
                    datetimeInfo.textContent = `${currentMainData.scene.date}|${currentMainData.scene.time}`;
                    if (CONFIG.DEBUG) console.log('[主面板監聽器] ✅ 更新日期时间:', datetimeInfo.textContent);
                }
            } else if (CONFIG.DEBUG) {
                console.log('[主面板監聽器] ⚠️ 未找到 .datetime-info 元素');
            }

            // 更新位置信息
            const locationInfo = document.querySelector('.location-info');
            if (locationInfo) {
                if (currentMainData.area.current) {
                    const location = currentMainData.scene.location || '';
                    locationInfo.textContent = `${currentMainData.area.current}${location ? ' | ' + location : ''}`;
                    if (CONFIG.DEBUG) console.log('[主面板監聽器] ✅ 更新位置信息:', locationInfo.textContent);
                }
            } else if (CONFIG.DEBUG) {
                console.log('[主面板監聽器] ⚠️ 未找到 .location-info 元素');
            }

        } catch (error) {
            console.error('[主面板監聽器] 更新区域信息失败:', error);
        }
    }

    // ===== 更新場景信息 =====
    function updateSceneInfo() {
        try {
            // 场景信息主要已在updateAreaInfo中处理
            if (CONFIG.DEBUG && currentMainData.scene.prompt) {
                console.log('[主面板監聽器] 场景提示:', currentMainData.scene.prompt);
            }
        } catch (error) {
            console.error('[主面板監聽器] 更新场景信息失败:', error);
        }
    }

    // ===== 更新主角信息 =====
    function updateMainRoleInfo() {
        try {
            // 更新主角姓名
            const userName = document.getElementById('userName');
            if (userName && currentMainData.mainRole.name) {
                userName.textContent = currentMainData.mainRole.name;
                if (CONFIG.DEBUG) console.log('[主面板監聽器] ✅ 更新用户名:', userName.textContent);
            } else if (CONFIG.DEBUG) {
                console.log('[主面板監聽器] ⚠️ 未找到 #userName 元素或没有用户名数据');
            }

            // 更新狀態按鈕
            const statusBtn = document.getElementById('statusBtn');
            if (statusBtn && currentMainData.mainRole.statusBtn) {
                statusBtn.textContent = currentMainData.mainRole.statusBtn;
                if (CONFIG.DEBUG) console.log('[主面板監聽器] ✅ 更新状态按钮:', statusBtn.textContent);
            } else if (CONFIG.DEBUG) {
                console.log('[主面板監聽器] ⚠️ 未找到 #statusBtn 元素或没有状态数据');
            }

            // 更新等級按鈕
            const levelBtn = document.getElementById('levelBtn');
            if (levelBtn && currentMainData.mainRole.levelBtn) {
                levelBtn.textContent = currentMainData.mainRole.levelBtn;
                if (CONFIG.DEBUG) console.log('[主面板監聽器] ✅ 更新等级按钮:', levelBtn.textContent);
            } else if (CONFIG.DEBUG) {
                console.log('[主面板監聽器] ⚠️ 未找到 #levelBtn 元素或没有等级数据');
            }

        } catch (error) {
            console.error('[主面板監聽器] 更新主角信息失败:', error);
        }
    }

    // ===== 更新日程安排 =====
    function updateSchedules() {
        try {
            // 更新日程表模态窗口的内容
            const scheduleModal = document.getElementById('scheduleModal');
            if (!scheduleModal) {
                return;
            }

            // 找到今日剩余行程的容器
            const todayScheduleSection = scheduleModal.querySelector('.schedule-section:first-child');
            if (!todayScheduleSection) {
                return;
            }

            // 找到活动列表容器（第一個schedule-item之後的所有schedule-item）
            const scheduleItems = todayScheduleSection.querySelectorAll('.schedule-item');
            
            // 移除所有現有的日程項目（包括預設的）
            scheduleItems.forEach(item => {
                item.remove();
            });

            // 根據實際數據添加新的日程項目
            if (currentMainData.schedules && currentMainData.schedules.length > 0) {
                currentMainData.schedules.forEach((schedule, index) => {
                    // 創建新的日程項目
                    const newItem = document.createElement('div');
                    newItem.className = 'schedule-item';
                    newItem.style.cssText = 'display: flex !important; align-items: center !important; margin-bottom: 12px !important; padding: 10px !important; background: rgba(76, 175, 80, 0.1) !important; border-radius: 8px !important; border-left: 4px solid #4CAF50 !important;';
                    
                    // 創建時間槽
                    const timeSlot = document.createElement('div');
                    timeSlot.className = 'time-slot';
                    timeSlot.style.cssText = 'font-size: 12px !important; font-weight: bold !important; color: #4CAF50 !important; min-width: 80px !important; margin-right: 10px !important;';
                    timeSlot.textContent = `${schedule.startTime}-${schedule.endTime}`;
                    
                    // 創建活動內容
                    const activity = document.createElement('div');
                    activity.className = 'activity';
                    activity.style.cssText = 'font-size: 13px !important; color: #333 !important; flex: 1 !important;';
                    activity.textContent = schedule.activity;
                    
                    // 組裝項目
                    newItem.appendChild(timeSlot);
                    newItem.appendChild(activity);
                    
                    // 添加到容器
                    todayScheduleSection.appendChild(newItem);
                });
            } else {
                // 如果沒有日程數據，顯示"今日無行程安排"
                const noScheduleMessage = document.createElement('div');
                noScheduleMessage.className = 'schedule-item';
                noScheduleMessage.style.cssText = 'text-align: center !important; padding: 10px !important; color: #888 !important; font-style: italic !important; background: rgba(76, 175, 80, 0.1) !important; border-radius: 8px !important; border-left: 4px solid #4CAF50 !important;';
                noScheduleMessage.textContent = '今日無行程安排';
                todayScheduleSection.appendChild(noScheduleMessage);
            }

            // 更新近期重要安排
            const reminderSection = scheduleModal.querySelector('.schedule-section:last-child');
            if (reminderSection) {
                const importantEvent = reminderSection.querySelector('.important-event');
                if (importantEvent) {
                    const eventTitle = importantEvent.querySelector('.event-title');
                    if (eventTitle) {
                        if (currentMainData.reminder) {
                            eventTitle.textContent = currentMainData.reminder;
                            importantEvent.style.display = ''; // 显示提醒区域
                        } else {
                            eventTitle.textContent = '';
                            importantEvent.style.display = 'none'; // 隐藏提醒区域
                        }
                    }
                }
            }

        } catch (error) {
            console.error('[主面板監聽器] 更新日程安排失败:', error);
        }
    }



    // ===== 更新隊友狀態 =====
    function updateTeammatesStatus() {
        try {
            if (CONFIG.DEBUG) {
                console.log('[主面板監聽器] 🔍 檢查隊友數據:', currentMainData.teammates);
            }
            
            // 更新主面板的队友按钮
            const teammateButtons = document.querySelectorAll('.teammate-btn');
            
            if (CONFIG.DEBUG) {
                console.log('[主面板監聽器] 🔍 找到隊友按鈕數量:', teammateButtons.length);
            }
            
            if (teammateButtons.length > 0 && currentMainData.teammates && currentMainData.teammates.length > 0) {
                currentMainData.teammates.forEach((teammate, index) => {
                    if (index < teammateButtons.length) {
                        const button = teammateButtons[index];
                        const nameElement = button.querySelector('.teammate-name');
                        if (nameElement) {
                            const teammateName = teammate.name || `角色名${String.fromCharCode(65 + index)}`;
                            nameElement.textContent = teammateName;
                            if (CONFIG.DEBUG) console.log(`[主面板監聽器] ✅ 更新队友${index + 1}:`, teammateName);
                        }
                    }
                });
                
                // 更新隊友數據到全局變量，供模態窗口使用
                if (typeof window.updateTeammateData === 'function') {
                    window.updateTeammateData(currentMainData.teammates);
                    if (CONFIG.DEBUG) console.log('[主面板監聽器] ✅ 更新隊友數據到全局變量');
                }
                
                // 更新 window.teammateData 對象，供 showTeammateInfo 函數使用
                if (window.teammateData) {
                    currentMainData.teammates.forEach((teammate, index) => {
                        const teammateId = String.fromCharCode(65 + index); // A, B, C, D
                        const avatarUrl = window.getTeammateAvatar ? window.getTeammateAvatar(teammate.name) : `https://i.pravatar.cc/150?img=${Math.abs(teammate.name.charCodeAt(0)) % 10 + 1}`;
                        
                        window.teammateData[teammateId] = {
                            name: teammate.name,
                            avatar: avatarUrl,
                            title: `${teammate.role} | #${teammate.tag} | ${teammate.location} | ${teammate.level}`,
                            tag: teammate.tag,
                            favor: teammate.favor,
                            cp: teammate.cp,
                            status: teammate.status,
                            mood: teammate.mood,
                            outfit: teammate.outfit
                        };
                    });
                    
                    if (CONFIG.DEBUG) {
                        console.log('[主面板監聽器] ✅ 更新 window.teammateData:', window.teammateData);
                    }
                }
                
                // 直接更新隊友模態窗口內容（不管是否打開）
                if (currentMainData.teammates.length > 0) {
                    // 更新第一個隊友的信息到模態窗口
                    updateTeammateModalContent(currentMainData.teammates[0]);
                    if (CONFIG.DEBUG) console.log('[主面板監聽器] ✅ 更新隊友模態窗口內容');
                }
            } else {
                if (CONFIG.DEBUG) {
                    if (teammateButtons.length === 0) {
                        console.log('[主面板監聽器] ⚠️ 未找到隊友按鈕');
                    }
                    if (!currentMainData.teammates || currentMainData.teammates.length === 0) {
                        console.log('[主面板監聽器] ⚠️ 沒有隊友數據');
                    }
                }
            }

        } catch (error) {
            console.error('[主面板監聽器] 更新队友状态失败:', error);
        }
    }
    
    // ===== 更新隊友模態窗口內容 =====
    function updateTeammateModalContent(teammate) {
        try {
            // 更新頭像
            const avatarElement = document.getElementById('teammateModalAvatar');
            if (avatarElement) {
                // 使用隊友頭像系統獲取頭像
                const avatarUrl = window.getTeammateAvatar ? window.getTeammateAvatar(teammate.name) : `https://i.pravatar.cc/150?img=${Math.abs(teammate.name.charCodeAt(0)) % 10 + 1}`;
                avatarElement.src = avatarUrl;
            }
            
            // 更新標題和角色信息
            const titleElement = document.getElementById('teammateModalTitle');
            if (titleElement) {
                const roleElement = titleElement.querySelector('.teammate-role');
                const detailsElement = titleElement.querySelector('.teammate-details');
                
                if (roleElement) {
                    roleElement.textContent = teammate.role || '練習生';
                }
                
                if (detailsElement) {
                    const tagElement = detailsElement.querySelector('.teammate-tag');
                    const locationElement = detailsElement.querySelector('.teammate-location');
                    const levelElement = detailsElement.querySelector('.teammate-level');
                    
                    if (tagElement) tagElement.textContent = `#${teammate.tag || '待定'}`;
                    if (locationElement) locationElement.textContent = teammate.location || '居住地';
                    if (levelElement) levelElement.textContent = `评级${teammate.level || '待定级'}`;
                }
            }
            
            // 更新詳細信息
            const tagElement = document.getElementById('teammateTag');
            const favorElement = document.getElementById('teammateFavor');
            const cpElement = document.getElementById('teammateCP');
            const statusElement = document.getElementById('teammateStatus');
            const moodElement = document.getElementById('teammateMood');
            const outfitElement = document.getElementById('teammateOutfit');
            
            if (tagElement) tagElement.textContent = teammate.tag || '待定';
            if (favorElement) favorElement.textContent = teammate.favor || '0';
            if (cpElement) cpElement.textContent = teammate.cp || '0';
            if (statusElement) statusElement.textContent = teammate.status || '待定';
            if (moodElement) moodElement.textContent = teammate.mood || '待定';
            if (outfitElement) outfitElement.textContent = teammate.outfit || '待定';
        } catch (error) {
            console.error('[主面板監聽器] 更新隊友模態窗口內容失敗:', error);
        }
    }

    // ===== 更新行動描述 =====
    function updateAction() {
        try {
            // 更新主面板的行动描述
            const userAction = document.getElementById('userAction');
            if (userAction && currentMainData.action) {
                userAction.textContent = currentMainData.action;
            }

        } catch (error) {
            console.error('[主面板監聽器] 更新行动描述失败:', error);
        }
    }

    // ===== 创建UI元素 =====
    function createMainPanelUI() {
        // 不再创建独立的数据窗口，直接更新主面板
    }

    // ===== 切换UI显示 =====
    window.toggleMainPanelData = function() {
        // 不再需要切换独立窗口，因为我们直接更新主面板
        console.log('[主面板監聽器] 主面板数据已直接更新到界面');
        console.log('[主面板監聽器] 当前数据状态:', currentMainData);
    };





    // ===== 初始化 =====
    function initializeMainListener() {
        try {
            // 创建UI
            createMainPanelUI();
            
            // 初始化更新
            updateMainPanelUI();

            // 向父窗口发送准备就绪信号
            try {
                window.parent.postMessage({
                    type: 'MAIN_LISTENER_READY',
                    timestamp: Date.now(),
                    source: 'main_listener'
                }, '*');
            } catch (e) {
                // 忽略跨域错误
            }

            if (CONFIG.DEBUG) {
                console.log('[主面板監聽器] ✅ 初始化完成');
            }
        } catch (error) {
            console.error('[主面板監聽器] ❌ 初始化失敗:', error);
        }
    }

    // ===== 自動初始化 =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeMainListener);
    } else {
        initializeMainListener();
    }

})();