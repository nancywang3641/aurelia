/**
 * 奧瑞亞檔案庫 - VN DOM 橋接器 (VN DOM Bridge)
 * 專治：第三方插件 (sd-ui, 各種正則美化面板) 渲染後 DOM 與純文本脫鉤的問題。
 * * 【修復日誌】：
 * - 修正跨則數污染問題（例如第12則的DOM跑到第6則）。
 * - 嚴格綁定 `messageId`，強制只在當前訊息框內搜尋 DOM，徹底阻斷全域污染。
 * - 增強對 `<p>` 標籤包裹 `<div class="sd-ui-container">` 或 `<details>` 的解包能力。
 */

(function() {
    'use strict';

    const VNDomBridge = {
        init() {
            console.log('🔗 [VNDomBridge] 模組已啟動，準備將第三方 DOM 橋接回 VN 劇情流。');
            window.VNDomBridge = this;
        },

        /**
         * 步驟一：preprocessContent 掃原始文字
         * 找出原始文本中哪些 tag+class 曾經出現過，並記下它們的 index 位置
         * @param {string} rawText - 原始未渲染的文本
         * @returns {Array} 記錄每個區塊標籤特徵的陣列
         */
        preprocessContent(rawText) {
            const blocks = [];
            // 抓取所有帶有 class 的 HTML 開頭標籤，例如 <div class="sd-ui-block">
            // 甚至兼容只寫了 HTML 標籤但被插件後續渲染的起點
            const tagRegex = /<([a-zA-Z0-9\-]+)([^>]*class=["']([^"']+)["'][^>]*)>/g;
            let match;
            while ((match = tagRegex.exec(rawText)) !== null) {
                blocks.push({
                    tag: match[1].toUpperCase(),
                    className: match[3],
                    index: match.index
                });
            }
            
            // 捕捉無 class 的 <details> 標籤 (例如作者寫的 Profile 折疊面板)
            const detailsRegex = /<details[^>]*>/gi;
            while ((match = detailsRegex.exec(rawText)) !== null) {
                blocks.push({
                    tag: 'DETAILS',
                    className: '',
                    index: match.index
                });
            }
            
            // 依據在文本中出現的順序排序
            return blocks.sort((a, b) => a.index - b.index);
        },

        /**
         * 步驟二：enrichMapFromDom 獲取真實 DOM
         * 【重大修復】：強制限制抓取範圍為 messageId 容器，防止抓到其他則數的 DOM。
         * @param {string|number} messageId - 訊息 ID
         * @param {Array} features - 文本掃描出的特徵
         * @returns {Array} 擷取出的 DOM 結構
         */
        enrichMapFromDom(messageId, features) {
            const finalDomBlocks = [];
            
            // 【核心修復點】：限制搜索範圍！絕對不可以全域搜索 document。
            // 鎖定當前這則訊息的容器。SillyTavern 通常使用 .mes[mesid="ID"] 或 data-mesid
            const container = document.querySelector(`.mes[mesid="${messageId}"] .mes_text`) || 
                              document.querySelector(`.mes[data-mesid="${messageId}"] .mes_text`) ||
                              document.querySelector(`div[mesid="${messageId}"] .mes_text`);

            if (!container) {
                console.warn(`[VNDomBridge] 找不到訊息 ${messageId} 的容器，無法獲取 DOM。可能尚未渲染完成。`);
                return finalDomBlocks;
            }

            // 定義我們需要抓取的面板結構標籤
            const ALLOWED_TAGS = ['DIV', 'DETAILS', 'FIGURE', 'ASIDE', 'SECTION', 'IFRAME', 'TABLE', 'UL', 'OL'];
            
            // 遍歷該訊息容器內的所有子節點
            const childNodes = Array.from(container.children);
            let domIndex = 0;

            childNodes.forEach((child) => {
                let targetEl = child;
                
                // 如果被 P 包裹，嘗試解包看裡面有沒有我們需要的 DOM (解決酒館 Markdown 自動加 p 的問題)
                if (child.tagName === 'P') {
                    // 找尋 p 內部是否有複雜標籤 (例如 sd-ui-container 或 details)
                    const complexChild = child.querySelector(ALLOWED_TAGS.join(','));
                    if (complexChild) {
                        targetEl = complexChild;
                    } else {
                        // 這是一個純文本段落，屬於 VN 正文，不是我們要抓的美化面板，直接略過
                        return;
                    }
                }

                const tag = targetEl.tagName.toUpperCase();
                
                // 排除單純的 P 或 SPAN，只抓取結構性的面板或帶有樣式的區塊
                if (ALLOWED_TAGS.includes(tag) || (targetEl.classList && targetEl.classList.length > 0)) {
                    
                    // 防禦機制：避免同一個元素被重複擷取導致無限迴圈或重複顯示
                    if (targetEl.dataset.vnBridged === 'true') return;
                    targetEl.dataset.vnBridged = 'true';

                    // 嘗試與 rawText 中的特徵匹配 (按出現順序)
                    let matchedFeature = features[domIndex];
                    let originalIndex = 999999; // 漏網之魚因為找不到原始位置，預設給一個極大值讓它排在最後面

                    if (matchedFeature) {
                        originalIndex = matchedFeature.index;
                        domIndex++;
                    }

                    // 把準備好的 DOM 與其排序基準推入陣列
                    finalDomBlocks.push({
                        outerHTML: targetEl.outerHTML,
                        originalIndex: originalIndex, 
                        source: 'dom_fallback',
                        tag: tag
                    });
                }
            });

            return finalDomBlocks;
        },

        /**
         * 【VN 面板專用整合 API】
         * 讓 vn_core.js 直接呼叫這個。
         * @param {string|number} messageId - 酒館聊天室的訊息 ID
         * @param {string} rawText - 該訊息的原始未渲染純文字
         * @returns {Array} 依原文字出現順序排列的 HTML 區塊陣列
         */
        getVnBlocks(messageId, rawText) {
            // 只掃 <content> 內的文字，排除正文外的面板特徵（摘要、狀態列等）
            const _cm = rawText.match(/<content>([\s\S]*?)<\/content>/i);
            const storyText = _cm ? _cm[1] : rawText;

            // 1. 知道有哪些特徵與它們在故事裡的順序
            const features = this.preprocessContent(storyText);
            
            // 2. 嚴格根據 messageId 獲取該則訊息「獨有」的 DOM，並跟文字順序對齊
            const blocks = this.enrichMapFromDom(messageId, features);
            
            // 3. 排序，確保面板在 VN 播放器裡出現的位置完全符合文本原本的穿插結構
            return blocks.sort((a, b) => a.originalIndex - b.originalIndex);
        }
    };

    VNDomBridge.init();
})();