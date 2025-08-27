
// 🎯 簡化的初始化邏輯
document.addEventListener('DOMContentLoaded', function() {
    console.log('[地圖面板] DOM 載入完成，開始初始化...');
    
    // 直接顯示地圖容器
    const mapContainer = document.getElementById('mapContainer');
    if (mapContainer) {
        mapContainer.classList.remove('hidden');
        console.log('[地圖面板] 地圖容器已顯示');
    }
    
    // 🎯 初始化時隱藏主頁按鈕
    const homeButton = document.getElementById('homeButton');
    if (homeButton) {
        console.log('[地圖面板] 初始化時隱藏主頁按鈕');
        homeButton.style.display = 'none';
        homeButton.style.visibility = 'hidden';
        homeButton.style.opacity = '0';
    } else {
        console.log('[地圖面板] 初始化時找不到主頁按鈕元素 (ID: homeButton)');
    }
    
    // 按順序初始化模塊，確保不互相干擾
    setTimeout(() => {
        if (window.MapHome && typeof window.MapHome.init === 'function') {
            window.MapHome.init();
            console.log('[地圖面板] MapHome 已初始化');
        }
    }, 50);
    
    setTimeout(() => {
        if (window.MapArea && typeof window.MapArea.init === 'function') {
            window.MapArea.init();
            console.log('[地圖面板] MapArea 已初始化');
        }
    }, 100);
    
    setTimeout(() => {
        if (window.MapUtils && typeof window.MapUtils.init === 'function') {
            window.MapUtils.init();
            console.log('[地圖面板] MapUtils 已初始化');
        }
    }, 150);
});

// 🎯 按鈕控制函數
function toggleView() {
    console.log('[地圖面板] 返回按鈕被點擊');
    
    // 檢查當前視圖狀態
    if (window.MapArea && window.MapArea.getCurrentView) {
        const currentView = window.MapArea.getCurrentView();
        console.log('[地圖面板] 當前視圖:', currentView);
        
        if (currentView === 'facility') {
            // 設施地圖：返回地圖頁面
            console.log('[地圖面板] 從設施地圖返回地圖頁面');
            if (window.MapArea && window.MapArea.toggleView) {
                window.MapArea.toggleView();
            }
        } else if (currentView === 'location') {
            // 單一設施地點：返回設施地圖
            console.log('[地圖面板] 從單一設施地點返回設施地圖');
            if (window.MapArea && window.MapArea.toggleView) {
                window.MapArea.toggleView();
            }
        } else if (currentView === 'map') {
            // 地圖頁面：返回主頁
            console.log('[地圖面板] 從地圖頁面返回主頁');
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'CLOSE_MAP_PANEL',
                    source: 'MAP_PANEL_RETURN_BUTTON',
                    timestamp: Date.now()
                }, '*');
            }
        } else {
            // 其他情況：返回主頁
            console.log('[地圖面板] 其他情況，返回主頁');
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'CLOSE_MAP_PANEL',
                    source: 'MAP_PANEL_RETURN_BUTTON',
                    timestamp: Date.now()
                }, '*');
            }
        }
    } else {
        // 如果無法獲取視圖狀態，默認返回主頁
        console.log('[地圖面板] 無法獲取視圖狀態，返回主頁');
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'CLOSE_MAP_PANEL',
                source: 'MAP_PANEL_RETURN_BUTTON',
                timestamp: Date.now()
            }, '*');
        }
    }
}

function goHome() {
    console.log('[地圖面板] 主頁按鈕被點擊');
    // 發送消息給父面板（main_panel.html）
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: 'GO_TO_MAIN_HOME',
            source: 'MAP_PANEL_HOME_BUTTON',
            timestamp: Date.now()
        }, '*');
    }
}

// 🎯 監聽來自父面板和map_processor的消息
window.addEventListener('message', function(event) {
    const { data } = event;
    
    if (!data || !data.type) return;
    
    console.log('[地圖面板] 收到消息:', data.type);
    
    switch (data.type) {
        case 'SHOW_HOME_BUTTON':
            // 顯示主頁按鈕（只在設施地圖顯示時）
            const homeButton = document.getElementById('homeButton');
            if (homeButton) {
                console.log('[地圖面板] 顯示主頁按鈕');
                homeButton.style.display = 'block';
                homeButton.style.visibility = 'visible';
                homeButton.style.opacity = '1';
                homeButton.style.zIndex = '1000';
                homeButton.style.position = 'relative';
            } else {
                console.log('[地圖面板] 找不到主頁按鈕元素 (ID: homeButton)');
            }
            break;
            
        case 'HIDE_HOME_BUTTON':
            // 隱藏主頁按鈕
            const homeBtn = document.getElementById('homeButton');
            if (homeBtn) {
                console.log('[地圖面板] 隱藏主頁按鈕');
                homeBtn.style.display = 'none';
                homeBtn.style.visibility = 'hidden';
                homeBtn.style.opacity = '0';
            } else {
                console.log('[地圖面板] 找不到主頁按鈕元素 (ID: homeButton)');
            }
            break;
            
        case 'RESET_MAP_PANEL':
            // 重置地圖面板到初始狀態
            console.log('[地圖面板] 收到重置消息，重置到初始狀態');
            resetMapPanelToInitialState();
            break;
            
        // 🆕 處理來自map_processor.js的消息
        case 'MAP_LOCATION_DATA':
            console.log('[地圖面板] 收到地圖位置數據:', data.data);
            handleMapLocationData(data.data);
            break;
            
        case 'NEWS_BROADCAST_DATA':
            console.log('[地圖面板] 收到新聞播報數據:', data.data);
            handleNewsBroadcastData(data.data);
            break;
            
        case 'STORY_OPTIONS_DATA':
            console.log('[地圖面板] 收到故事選項數據:', data.data);
            handleStoryOptionsData(data.data);
            break;
            
        case 'MAP_PROCESSOR_READY':
            console.log('[地圖面板] Map Processor已準備就緒:', data.version);
            
            // 檢查所有模塊是否已經初始化
            const modulesStatus = {
                MapCore: !!(window.MapCore && typeof window.MapCore.updateCharacterData === 'function'),
                MapArea: !!(window.MapArea && typeof window.MapArea.init === 'function'),
                MapUtils: !!(window.MapUtils && typeof window.MapUtils.init === 'function')
            };
            
            console.log('[地圖面板] 模塊初始化狀態:', modulesStatus);
            
            // 發送確認消息給處理器
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'MAP_PANEL_READY',
                    source: 'MAP_PANEL',
                    version: '2.0',
                    modulesStatus: modulesStatus,
                    timestamp: Date.now()
                }, '*');
                console.log('[地圖面板] 已發送準備就緒確認消息');
            }
            break;
    }
});

// 🆕 處理地圖位置數據
function handleMapLocationData(locationData) {
    try {
        // 更新MapCore數據
        if (window.MapCore && typeof window.MapCore.updateCharacterData === 'function') {
            window.MapCore.updateCharacterData(locationData);
            console.log('[地圖面板] MapCore數據已更新');
        }
        
        // 更新設施顯示
        if (window.MapArea && typeof window.MapArea.updateCurrentFacilityDisplay === 'function') {
            window.MapArea.updateCurrentFacilityDisplay();
            console.log('[地圖面板] 設施顯示已更新');
        }
        
        // 顯示通知
        if (window.MapUtils && typeof window.MapUtils.showNotification === 'function') {
            const characterCount = Object.keys(locationData.characterLocations || {}).length;
            window.MapUtils.showNotification(`地圖數據已更新，共 ${characterCount} 個角色`);
        }
    } catch (error) {
        console.error('[地圖面板] 處理地圖位置數據時出錯:', error);
    }
}

// 🆕 處理新聞播報數據
function handleNewsBroadcastData(newsData) {
    try {
        // 這裡可以添加新聞顯示邏輯
        console.log('[地圖面板] 處理新聞數據:', newsData);
        
        // 顯示通知
        if (window.MapUtils && typeof window.MapUtils.showNotification === 'function') {
            const newsCount = newsData.items ? newsData.items.length : 0;
            window.MapUtils.showNotification(`收到 ${newsCount} 條新聞播報`);
        }
    } catch (error) {
        console.error('[地圖面板] 處理新聞播報數據時出錯:', error);
    }
}

// 🆕 處理故事選項數據
function handleStoryOptionsData(storyData) {
    try {
        console.log('[地圖面板] 處理故事選項數據:', storyData);
        
        // 這裡可以添加故事選項顯示邏輯
        if (window.MapUtils && typeof window.MapUtils.showNotification === 'function') {
            const optionsCount = storyData.options ? storyData.options.length : 0;
            window.MapUtils.showNotification(`收到 ${optionsCount} 個故事選項`);
        }
    } catch (error) {
        console.error('[地圖面板] 處理故事選項數據時出錯:', error);
    }
}

// 🎯 重置地圖面板到初始狀態
function resetMapPanelToInitialState() {
    // 重置地圖區域核心的視圖狀態
    if (window.MapArea) {
        // 重置到地圖頁面
        if (window.MapArea.getCurrentView && window.MapArea.getCurrentView() !== 'map') {
            console.log('[地圖面板] 重置視圖狀態到地圖頁面');
            // 強制重置到地圖頁面
            const mapView = document.getElementById('mapView');
            const facilityView = document.getElementById('facilityView');
            
            if (mapView) mapView.classList.add('active');
            if (facilityView) facilityView.classList.remove('active');
            
            // 隱藏主頁按鈕
            const homeBtn = document.getElementById('homeButton');
            if (homeBtn) {
                homeBtn.style.display = 'none';
            }
        }
    }
}

// 🎯 測試主頁按鈕顯示（開發用）
function testHomeButton() {
    console.log('[地圖面板] 測試主頁按鈕顯示');
    const homeButton = document.getElementById('homeButton');
    if (homeButton) {
        console.log('[地圖面板] 找到主頁按鈕，設置為顯示');
        homeButton.style.display = 'block';
        homeButton.style.visibility = 'visible';
        homeButton.style.opacity = '1';
        homeButton.style.zIndex = '1000';
        homeButton.style.position = 'relative';
    } else {
        console.log('[地圖面板] 找不到主頁按鈕元素 (ID: homeButton)');
    }
}

// 在控制台中可以調用 testHomeButton() 來測試
window.testHomeButton = testHomeButton;

// 🆕 測試map_processor通信的函數
function testMapProcessorCommunication() {
    console.log('[地圖面板] 測試map_processor通信...');
    
    // 模擬接收地圖位置數據
    const testLocationData = {
        mainCharacter: '測試角色',
        characterLocations: {
            '艾迪': {
                location: 'A區_Stellar_Nexus',
                facility: 'Stellar_Nexus',
                bgTag: 'A區_Stellar_Nexus',
                status: '工作中',
                activity: '開會',
                district: 'A',
                timestamp: Date.now()
            },
            '雷伊': {
                location: 'B區_LUXA_DOME_路克萨巨蛋',
                facility: 'LUXA_DOME',
                bgTag: 'B區_LUXA_DOME_路克萨巨蛋',
                status: '休閒',
                activity: '看表演',
                district: 'B',
                timestamp: Date.now()
            }
        },
        facilityOccupancy: {
            'Stellar_Nexus': [
                { character: '艾迪', status: '工作中', activity: '開會' }
            ],
            'LUXA_DOME': [
                { character: '雷伊', status: '休閒', activity: '看表演' }
            ]
        },
        timestamp: Date.now()
    };
    
    // 模擬接收新聞數據
    const testNewsData = {
        items: [
            {
                category: '科技新聞',
                content: '測試新聞內容',
                timestamp: Date.now(),
                id: 'test_news_1'
            }
        ],
        timestamp: Date.now()
    };
    
    // 模擬接收故事選項數據
    const testStoryData = {
        options: [
            {
                title: '測試故事選項',
                atmosphere: '緊張',
                timeAndLocation: '晚上|A區',
                characters: '艾迪,雷伊',
                summary: '測試故事概要',
                developments: '可能的發展方向'
            }
        ],
        messageId: 'test_message_1',
        isNewMessage: true
    };
    
    // 依次測試各種數據類型
    setTimeout(() => {
        console.log('[地圖面板] 測試地圖位置數據...');
        handleMapLocationData(testLocationData);
    }, 1000);
    
    setTimeout(() => {
        console.log('[地圖面板] 測試新聞播報數據...');
        handleNewsBroadcastData(testNewsData);
    }, 2000);
    
    setTimeout(() => {
        console.log('[地圖面板] 測試故事選項數據...');
        handleStoryOptionsData(testStoryData);
    }, 3000);
    
    console.log('[地圖面板] 測試完成，請查看控制台輸出');
}

// 暴露測試函數到全局
window.testMapProcessorCommunication = testMapProcessorCommunication;
