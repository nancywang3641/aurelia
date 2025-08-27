// =======================================================================
//                          功能按鈕圖標配置
// =======================================================================
// 
// 使用說明：
// 1. 將你的圖片文件放在適當的目錄中（建議放在 /images/icons/ 目錄）
// 2. 將下面的 ICON_URL_XXX 替換為你的實際圖片URL
// 3. 支持的圖片格式：PNG, JPG, SVG, WebP
// 4. 建議圖片尺寸：64x64px 或 128x128px
// 5. 如果圖片載入失敗，會自動顯示emoji備用圖標
// 6. 最終fallback：如果所有圖片都失敗，使用預設圖片
//
// 圖片URL格式範例：
// - 本地文件：'./images/icons/photo.png'
// - 網絡圖片：'https://example.com/icons/photo.png'
// - 相對路徑：'../assets/icons/photo.png'
//
// =======================================================================

// 🆕 最終fallback圖片URL
const FALLBACK_ICON_URL = 'https://files.catbox.moe/ew2nex.png';

const ICON_CONFIG = {
    // 📷 照片功能
    ICON_URL_PHOTO: 'https://files.catbox.moe/0mwfho.png', // 請替換為你的照片圖標URL
    
    // ⏰ 時間功能  
    ICON_URL_TIME: 'https://files.catbox.moe/9ziwgn.png', // 請替換為你的時間圖標URL
    
    // 📹 視訊通話功能
    ICON_URL_VIDEO_CALL: 'https://files.catbox.moe/9dh2gw.png', // 請替換為你的視訊通話圖標URL
    
    // 📍 位置功能
    ICON_URL_LOCATION: 'https://files.catbox.moe/j3w9n2.png', // 請替換為你的位置圖標URL
    
    // 🧧 紅包功能
    ICON_URL_RED_ENVELOPE: 'https://files.catbox.moe/b8zlv1.png', // 請替換為你的紅包圖標URL
    
    // 💰 轉賬功能
    ICON_URL_TRANSFER: 'https://files.catbox.moe/jeoe1l.png', // 請替換為你的轉賬圖標URL
    
    // 🎤 語音輸入功能
    ICON_URL_VOICE_INPUT: 'https://files.catbox.moe/vsdtgj.png', // 請替換為你的語音輸入圖標URL
    
    // 😊 表情包功能
    ICON_URL_STICKER: 'https://files.catbox.moe/alx3ou.png', // 請替換為你的表情包圖標URL
    
    // 📖 劇情功能
    ICON_URL_USER_STORY: 'https://files.catbox.moe/qndoqu.png', // 請替換為你的劇情圖標URL
    
    // ⚙️ 系統功能
    ICON_URL_SYSTEM_ACTION: 'https://files.catbox.moe/1qh7xk.png', // 請替換為你的系統圖標URL
    
    // ✉️ 信封功能
    ICON_URL_LETTER: 'https://files.catbox.moe/op34fv.png', // 請替換為你的信封圖標URL
    
    // 📚 世界書功能
    ICON_URL_LOREBOOK: 'https://files.catbox.moe/vfcri3.png', // 請替換為你的世界書圖標URL
    
    // 🎁 送禮功能
    ICON_URL_GIFT: 'https://files.catbox.moe/knhd9d.png' // 請替換為你的送禮圖標URL
};

// =======================================================================
//                          自動替換圖標URL
// =======================================================================

function replaceIconUrls() {
    console.log('[圖標配置] 開始替換功能按鈕圖標...');
    
    // 替換所有功能按鈕的圖片URL
    Object.keys(ICON_CONFIG).forEach(key => {
        const url = ICON_CONFIG[key];
        // 🆕 修復：查找src屬性等於key字符串的元素
        const elements = document.querySelectorAll(`img[src="${key}"]`);
        
        elements.forEach(element => {
            // 🆕 跳過帶有 data-no-replace 屬性的圖片（如浮動助手圖示）
            if (element.hasAttribute('data-no-replace')) {
                console.log(`[圖標配置] 跳過受保護的圖片: ${key}`);
                return;
            }
            
            if (url !== key) { // 如果不是預設的佔位符
                // 🆕 移除原有的 onerror 處理器，防止觸發 fallback
                element.onerror = null;
                
                // 🆕 確保圖片可見
                element.style.display = 'block';
                
                // 🆕 隱藏 fallback 符號
                const fallbackElement = element.nextElementSibling;
                if (fallbackElement && fallbackElement.classList.contains('function-icon-fallback')) {
                    fallbackElement.style.display = 'none';
                }
                
                // 🆕 設置新的圖片URL
                element.src = url;
                console.log(`[圖標配置] 已替換 ${key} -> ${url}`);
                
                // 🆕 添加新的錯誤處理
                element.onerror = function() {
                    console.warn(`[圖標配置] 圖標載入失敗: ${this.src}`);
                    if (this.src !== FALLBACK_ICON_URL) {
                        console.log(`[圖標配置] 嘗試使用fallback圖標`);
                        this.src = FALLBACK_ICON_URL;
                    } else {
                        console.error(`[圖標配置] 連fallback圖標也載入失敗，顯示符號`);
                        // 如果連fallback都失敗，顯示符號
                        this.style.display = 'none';
                        const fallbackElement = this.nextElementSibling;
                        if (fallbackElement && fallbackElement.classList.contains('function-icon-fallback')) {
                            fallbackElement.style.display = 'flex';
                        }
                    }
                };
                
                // 🆕 添加載入成功處理
                element.onload = function() {
                    console.log(`[圖標配置] 圖標載入成功: ${this.src}`);
                    this.style.display = 'block';
                    const fallbackElement = this.nextElementSibling;
                    if (fallbackElement && fallbackElement.classList.contains('function-icon-fallback')) {
                        fallbackElement.style.display = 'none';
                    }
                };
            }
        });
    });
    
    // 🆕 添加：手動觸發替換，以防自動替換失敗
    setTimeout(() => {
        console.log('[圖標配置] 執行手動替換檢查...');
        Object.keys(ICON_CONFIG).forEach(key => {
            const url = ICON_CONFIG[key];
            const elements = document.querySelectorAll(`img[src="${key}"]`);
            
            if (elements.length > 0) {
                console.log(`[圖標配置] 發現 ${elements.length} 個需要替換的元素: ${key}`);
                elements.forEach(element => {
                    // 🆕 跳過帶有 data-no-replace 屬性的圖片（如浮動助手圖示）
                    if (element.hasAttribute('data-no-replace')) {
                        console.log(`[圖標配置] 手動檢查：跳過受保護的圖片: ${key}`);
                        return;
                    }
                    
                    if (url !== key) {
                        // 🆕 移除原有的 onerror 處理器
                        element.onerror = null;
                        element.style.display = 'block';
                        
                        // 🆕 隱藏 fallback 符號
                        const fallbackElement = element.nextElementSibling;
                        if (fallbackElement && fallbackElement.classList.contains('function-icon-fallback')) {
                            fallbackElement.style.display = 'none';
                        }
                        
                        element.src = url;
                        console.log(`[圖標配置] 手動替換 ${key} -> ${url}`);
                    }
                });
            }
        });
    }, 500);
    
    console.log('[圖標配置] 圖標URL替換完成');
}

// =======================================================================
//                          初始化函數
// =======================================================================

// 頁面載入完成後自動執行
document.addEventListener('DOMContentLoaded', function() {
    // 延遲執行，確保所有元素都已載入
    setTimeout(replaceIconUrls, 100);
});

// 導出配置供其他腳本使用
window.ICON_CONFIG = ICON_CONFIG;
window.FALLBACK_ICON_URL = FALLBACK_ICON_URL;
window.replaceIconUrls = replaceIconUrls;

// 🆕 添加手動觸發函數
window.manualReplaceIcons = function() {
    console.log('[圖標配置] 手動觸發圖標替換...');
    replaceIconUrls();
};

// 🆕 添加檢查函數
window.checkIconStatus = function() {
    console.log('[圖標配置] 檢查圖標狀態...');
    Object.keys(ICON_CONFIG).forEach(key => {
        const url = ICON_CONFIG[key];
        const elements = document.querySelectorAll(`img[src="${key}"]`);
        console.log(`[圖標配置] ${key}: ${elements.length} 個元素, URL: ${url}`);
    });
};

// =======================================================================
//                          使用範例
// =======================================================================
/*
// 範例1：替換單個圖標
ICON_CONFIG.ICON_URL_PHOTO = './images/icons/camera.png';

// 範例2：批量替換所有圖標
Object.keys(ICON_CONFIG).forEach(key => {
    ICON_CONFIG[key] = `./images/icons/${key.toLowerCase().replace('icon_url_', '')}.png`;
});

// 範例3：使用網絡圖片
ICON_CONFIG.ICON_URL_PHOTO = 'https://cdn.example.com/icons/camera.png';

// 範例4：動態替換
function updateIcon(iconKey, newUrl) {
    ICON_CONFIG[iconKey] = newUrl;
    replaceIconUrls();
}

// 使用：updateIcon('ICON_URL_PHOTO', './new-icon.png');
*/
