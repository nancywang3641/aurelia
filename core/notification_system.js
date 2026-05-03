/**
 * ========================
 * Aurelia Notification System
 * 通知系統模塊
 * ========================
 * 
 * 職責：
 * - 通知欄創建與管理
 * - 通知顯示/隱藏/排隊
 * - 任務通知監聽
 * - AI輸出通知監聽
 * - 響應式通知設計
 * 
 * @version 1.0.0
 */

(function() {
    'use strict';

    // ========================
    // 獲取核心依賴
    // ========================
    const getCore = () => window.AureliaCore;
    const getLogger = () => getCore()?.logger || console;
    const getPanelManager = () => window.AureliaPanelManager;

    // ========================
    // 狀態管理
    // ========================
    let notificationBar = null;
    let notificationQueue = [];
    let notificationTimeout = null;
    let isNotificationVisible = false;
    let isNotificationClickHidden = false;

    // ========================
    // 配置
    // ========================
    const NOTIFICATION_CONFIG = {
        AUTO_HIDE_DURATION: {
            MOBILE: 6000,
            DESKTOP: 5000
        },
        Z_INDEX: 99999999,
        ANIMATION: {
            SLIDE_IN: 'transform 0.6s ease, opacity 0.4s ease',
            SLIDE_OUT: 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s ease'
        }
    };

    // ========================
    // 設備檢測
    // ========================
    const DeviceDetector = {
        isMobile() {
            return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        },

        isNarrow() {
            return window.innerWidth < 768;
        }
    };

    // ========================
    // 通知欄創建器
    // ========================
    const NotificationBarCreator = {
        /**
         * 創建通知欄
         */
        create() {
            const doc = document;
            
            // 移除已存在的通知欄
            const existing = doc.getElementById('aurelia-notification-bar');
            if (existing) {
                existing.remove();
            }

            const isMobile = DeviceDetector.isMobile();
            getLogger().info('創建通知欄，移動端:', isMobile);

            // 創建通知欄元素
            notificationBar = doc.createElement('div');
            notificationBar.id = 'aurelia-notification-bar';
            notificationBar.innerHTML = `
                <div class="notification-content">
                    <div class="notification-icon">📋</div>
                    <div class="notification-text">
                        <div class="notification-title">新任務</div>
                        <div class="notification-subtitle">點擊查看詳情</div>
                    </div>
                </div>
            `;

            // 應用樣式
            if (isMobile) {
                this._applyMobileStyles(notificationBar, doc);
            } else {
                this._applyDesktopStyles(notificationBar, doc);
            }

            // 設置內容樣式
            this._setupContentStyles(notificationBar);

            // 添加事件監聽器
            notificationBar.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                NotificationController.handleClick();
            });

            getLogger().info('✅ 通知欄已創建');
            return notificationBar;
        },

        /**
         * 應用移動端樣式
         */
        _applyMobileStyles(bar, doc) {
            const styles = {
                position: 'fixed',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%) translateY(-120%)',
                width: '90%',
                maxWidth: '400px',
                background: 'rgba(255, 255, 255, 0.96)',
                color: '#1d1d1f',
                padding: '16px 20px',
                zIndex: NOTIFICATION_CONFIG.Z_INDEX.toString(),
                transition: NOTIFICATION_CONFIG.ANIMATION.SLIDE_IN,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
                cursor: 'pointer',
                userSelect: 'none',
                touchAction: 'manipulation',
                borderRadius: '20px',
                fontSize: '16px',
                opacity: '0',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255, 255, 255, 0.6)',
                minHeight: '72px',
                pointerEvents: 'none'
            };

            Object.assign(bar.style, styles);
            doc.body.appendChild(bar);
            getLogger().info('📱 移動端通知欄已添加到body');
        },

        /**
         * 應用桌面端樣式
         */
        _applyDesktopStyles(bar, doc) {
            const styles = {
                position: 'fixed',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%) translateY(-120%)',
                width: '90%',
                maxWidth: '500px',
                background: 'rgba(255, 255, 255, 0.95)',
                color: '#1d1d1f',
                padding: '16px 20px',
                zIndex: NOTIFICATION_CONFIG.Z_INDEX.toString(),
                transition: NOTIFICATION_CONFIG.ANIMATION.SLIDE_IN,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                cursor: 'pointer',
                userSelect: 'none',
                touchAction: 'manipulation',
                borderRadius: '16px',
                fontSize: '15px',
                opacity: '0',
                backdropFilter: 'blur(20px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                minHeight: '64px',
                pointerEvents: 'none'
            };

            Object.assign(bar.style, styles);
            doc.body.appendChild(bar);
            getLogger().info('🖥️ 桌面端通知欄已添加到body');
        },

        /**
         * 設置內容樣式
         */
        _setupContentStyles(bar) {
            const isMobile = DeviceDetector.isMobile();

            const content = bar.querySelector('.notification-content');
            if (content) {
                Object.assign(content.style, {
                    display: 'flex',
                    alignItems: 'center',
                    gap: isMobile ? '16px' : '12px',
                    width: '100%'
                });
            }

            const icon = bar.querySelector('.notification-icon');
            if (icon) {
                Object.assign(icon.style, {
                    fontSize: isMobile ? '22px' : '18px',
                    flexShrink: '0',
                    opacity: '0.8'
                });
            }

            const text = bar.querySelector('.notification-text');
            if (text) {
                Object.assign(text.style, {
                    flex: '1',
                    minWidth: '0'
                });
            }

            const title = bar.querySelector('.notification-title');
            if (title) {
                Object.assign(title.style, {
                    fontSize: isMobile ? '16px' : '14px',
                    fontWeight: '600',
                    marginBottom: '2px',
                    lineHeight: '1.3',
                    color: '#1d1d1f'
                });
            }

            const subtitle = bar.querySelector('.notification-subtitle');
            if (subtitle) {
                Object.assign(subtitle.style, {
                    fontSize: isMobile ? '14px' : '12px',
                    opacity: '0.7',
                    lineHeight: '1.3',
                    color: '#1d1d1f'
                });
            }
        }
    };

    // ========================
    // 通知控制器
    // ========================
    const NotificationController = {
        /**
         * 顯示通知
         */
        show(title, subtitle) {
            getLogger().debug('顯示通知:', { title, subtitle, 
                hasBar: !!notificationBar, 
                isVisible: isNotificationVisible, 
                queueLength: notificationQueue.length 
            });

            // 確保通知欄存在
            if (!notificationBar) {
                getLogger().info('通知欄不存在，正在創建...');
                NotificationBarCreator.create();
            }

            if (!notificationBar) {
                getLogger().error('通知欄創建失敗，無法顯示通知');
                return;
            }

            // 清理舊的定時器
            if (notificationTimeout) {
                clearTimeout(notificationTimeout);
                notificationTimeout = null;
            }

            // 添加到隊列
            notificationQueue.push({ title, subtitle });

            // 如果當前沒有顯示通知，則顯示
            if (!isNotificationVisible) {
                this._displayNext();
            }
        },

        /**
         * 顯示下一個通知
         */
        _displayNext() {
            if (notificationQueue.length === 0 || isNotificationVisible) {
                return;
            }

            if (isNotificationClickHidden) {
                getLogger().info('通知欄已被用戶點擊隱藏，跳過顯示');
                return;
            }

            const notification = notificationQueue.shift();
            isNotificationVisible = true;

            if (!notificationBar) {
                NotificationBarCreator.create();
                setTimeout(() => this._displayNext(), 300);
                return;
            }

            // 更新內容
            const titleEl = notificationBar.querySelector('.notification-title');
            const subtitleEl = notificationBar.querySelector('.notification-subtitle');

            if (titleEl) titleEl.textContent = notification.title || '新通知';
            if (subtitleEl) subtitleEl.textContent = notification.subtitle || '點擊查看詳情';

            // 重置位置和交互狀態
            const isMobile = DeviceDetector.isMobile();
            notificationBar.style.top = '20px';
            notificationBar.style.transform = 'translateX(-50%) translateY(-120%)';
            notificationBar.style.pointerEvents = 'auto';

            // 滑入動畫
            requestAnimationFrame(() => {
                notificationBar.style.opacity = '1';
                notificationBar.style.transform = 'translateX(-50%) translateY(0)';
            });

            getLogger().info('✅ 通知欄已顯示 (移動端:', isMobile, ')');

            // 設置自動隱藏
            const duration = isMobile ? 
                NOTIFICATION_CONFIG.AUTO_HIDE_DURATION.MOBILE : 
                NOTIFICATION_CONFIG.AUTO_HIDE_DURATION.DESKTOP;

            notificationTimeout = setTimeout(() => {
                if (isNotificationVisible && !isNotificationClickHidden) {
                    this.hide();
                }
            }, duration);
        },

        /**
         * 隱藏通知
         */
        hide() {
            if (!notificationBar) return;

            // 清理定時器
            if (notificationTimeout) {
                clearTimeout(notificationTimeout);
                notificationTimeout = null;
            }

            isNotificationVisible = false;

            // 完全隱藏並不可點擊
            notificationBar.style.opacity = '0';
            notificationBar.style.pointerEvents = 'none';

            const isMobile = DeviceDetector.isMobile();
            if (isMobile) {
                notificationBar.style.transform = 'translateX(-50%) translateY(-200px)';
                notificationBar.style.top = '-100px';
            } else {
                notificationBar.style.transform = 'translateX(-50%) translateY(-150%)';
            }

            // 檢查是否還有其他通知
            setTimeout(() => {
                if (notificationQueue.length > 0 && !isNotificationClickHidden) {
                    this._displayNext();
                }
            }, 400);
        },

        /**
         * 點擊後隱藏（不自動顯示下一條）
         */
        hideAfterClick() {
            if (!notificationBar) return;

            getLogger().info('點擊後隱藏通知欄');

            // 設置點擊隱藏標記
            isNotificationClickHidden = true;

            // 清理自動隱藏定時器
            if (notificationTimeout) {
                clearTimeout(notificationTimeout);
                notificationTimeout = null;
            }

            // 強制隱藏
            isNotificationVisible = false;
            notificationBar.style.opacity = '0';
            notificationBar.style.pointerEvents = 'none';

            const isMobile = DeviceDetector.isMobile();
            if (isMobile) {
                notificationBar.style.transform = 'translateX(-50%) translateY(-200px)';
                notificationBar.style.top = '-100px';
            } else {
                notificationBar.style.transform = 'translateX(-50%) translateY(-150%)';
            }

            // 1秒後允許新通知
            setTimeout(() => {
                isNotificationClickHidden = false;
                getLogger().info('✅ 通知欄點擊隱藏狀態已重置');
            }, 1000);
        },

        /**
         * 處理通知點擊
         */
        handleClick() {
            getLogger().info('通知欄被點擊');

            // 防止重複點擊
            if (window.notificationClickInProgress) return;
            window.notificationClickInProgress = true;

            try {
                // 自動打開任務面板
                const panelManager = getPanelManager();
                if (panelManager && !panelManager.isPanelVisible('TASK')) {
                    panelManager.showPanel('TASK');
                }

                // 隱藏通知
                this.hideAfterClick();

                getLogger().info('✅ 通知欄已正確處理');
            } catch (error) {
                getLogger().error('處理通知欄點擊失敗:', error);
            } finally {
                setTimeout(() => window.notificationClickInProgress = false, 500);
            }
        }
    };

    // ========================
    // 事件監聽器設置
    // ========================
    const EventListenerSetup = {
        /**
         * 設置任務通知監聽器
         */
        setupTaskListener() {
            if (typeof window.eventOn === 'function') {
                window.eventOn('TASK_NEW_AVAILABLE', this._handleNewTask.bind(this));
                window.eventOn('TASK_STATUS_CHANGED', this._handleTaskStatus.bind(this));
                getLogger().info('✅ 任務通知監聽器已設置');
            } else {
                getLogger().warn('事件系統未就緒，延遲設置任務通知監聽器');
                setTimeout(() => this.setupTaskListener(), 2000);
            }
        },

        /**
         * 設置AI輸出通知監聽器
         */
        setupAIOutputListener() {
            if (typeof window.eventOn === 'function') {
                // 監聽各種面板的AI輸出事件
                window.eventOn('INVENTORY_WORLDBOOK_UPDATED', () => this._handleAIOutput('🎒', '背包'));
                window.eventOn('SHOP_WORLDBOOK_UPDATED', () => this._handleAIOutput('🛒', '商城'));
                window.eventOn('TASK_WORLDBOOK_UPDATED', () => this._handleAIOutput('📋', '任務'));
                window.eventOn('IDCARD_WORLDBOOK_UPDATED', () => this._handleAIOutput('🪪', '名片'));
                window.eventOn('MAP_WORLDBOOK_UPDATED', () => this._handleAIOutput('🗺️', '地圖'));
                window.eventOn('ECHO_WORLDBOOK_UPDATED', () => this._handleAIOutput('📢', 'Echo'));
                window.eventOn('FORUM_WORLDBOOK_UPDATED', () => this._handleAIOutput('📋', '論壇'));
                window.eventOn('LIVESTREAM_WORLDBOOK_UPDATED', () => this._handleAIOutput('📺', '直播'));
                window.eventOn('CHAT_WORLDBOOK_UPDATED', () => this._handleAIOutput('💬', '聊天'));
                window.eventOn('VN_WORLDBOOK_UPDATED', () => this._handleAIOutput('📖', 'VN'));
                
                getLogger().info('✅ AI輸出通知監聽器已設置');
            } else {
                getLogger().warn('事件系統未就緒，延遲設置AI輸出通知監聽器');
                setTimeout(() => this.setupAIOutputListener(), 2000);
            }
        },

        /**
         * 處理新任務通知
         */
        _handleNewTask(taskData) {
            try {
                if (!taskData || !taskData.name) return;

                getLogger().info('收到新任務通知:', taskData);

                // 檢查重複
                const isDuplicate = notificationQueue.some(n => 
                    n.title && n.title.includes(taskData.name)
                );

                if (isDuplicate) {
                    getLogger().info('發現重複任務通知，跳過顯示');
                    return;
                }

                // 顯示通知
                NotificationController.show(
                    `📋 新任務：${taskData.name}`,
                    `獎勵：${taskData.reward || '未知'}`
                );
            } catch (error) {
                getLogger().error('處理新任務通知失敗:', error);
            }
        },

        /**
         * 處理任務狀態變更通知
         */
        _handleTaskStatus(taskData) {
            try {
                if (!taskData || !taskData.name || !taskData.status) return;

                getLogger().info('收到任務狀態變更通知:', taskData);

                let title, subtitle;

                switch (taskData.status) {
                    case 'active':
                        title = `⚡ 任務已接受：${taskData.name}`;
                        subtitle = '任務正在進行中';
                        break;
                    case 'completed':
                        title = `🏆 任務完成：${taskData.name}`;
                        subtitle = '任務已完成！';
                        break;
                    case 'failed':
                        title = `❌ 任務失敗：${taskData.name}`;
                        subtitle = '任務已標記為失敗';
                        break;
                    default:
                        return;
                }

                NotificationController.show(title, subtitle);
            } catch (error) {
                getLogger().error('處理任務狀態變更通知失敗:', error);
            }
        },

        /**
         * 處理AI輸出通知
         */
        _handleAIOutput(icon, name) {
            try {
                getLogger().info(`收到${name}AI輸出通知`);
                NotificationController.show(
                    `${icon} ${name}已更新`,
                    `AI已更新${name}內容`
                );
            } catch (error) {
                getLogger().error(`處理${name}AI輸出通知失敗:`, error);
            }
        }
    };

    // ========================
    // 測試工具
    // ========================
    const TestUtilities = {
        /**
         * 測試通知
         */
        testNotification() {
            NotificationController.show(
                '🧪 測試通知',
                '這是一個測試通知，點擊查看效果'
            );
            getLogger().info('已觸發測試通知');
        }
    };

    // ========================
    // 初始化
    // ========================
    function init() {
        getLogger().info('通知系統初始化...');

        try {
            // 創建通知欄
            NotificationBarCreator.create();

            // 設置事件監聽器
            EventListenerSetup.setupTaskListener();
            EventListenerSetup.setupAIOutputListener();

            getLogger().info('✅ 通知系統初始化完成');
        } catch (error) {
            getLogger().error('通知系統初始化失敗:', error);
        }
    }

    // ========================
    // 導出 API
    // ========================
    window.AureliaNotificationSystem = {
        // 核心方法
        show: (title, subtitle) => NotificationController.show(title, subtitle),
        hide: () => NotificationController.hide(),
        
        // 測試方法
        testNotification: () => TestUtilities.testNotification(),

        // 狀態查詢
        isVisible: () => isNotificationVisible,
        getQueueLength: () => notificationQueue.length,

        // 初始化
        init
    };

    getLogger().info('AureliaNotificationSystem 模塊已加載');

})();
