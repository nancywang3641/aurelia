// ===================================================================
// JCY API 模塊
// 包含所有API相關的功能：聊天API、圖像生成API、設置管理等
// ===================================================================

// 全局變量引用（需要從主文件傳入）
let state;
let db;

// 初始化函數，接收主文件的全局變量
function initAPIModule(mainState, mainDB) {
    state = mainState;
    db = mainDB;
    console.log('[JCY-API] API模塊已初始化');
}

// ===================================================================
// API設置管理
// ===================================================================

function renderApiSettings() { 
    // API服务商设置
    document.getElementById('api-provider').value = state.apiConfig.provider || 'custom';
    document.getElementById('proxy-url').value = state.apiConfig.proxyUrl || ''; 
    document.getElementById('api-key').value = state.apiConfig.apiKey || ''; 
    
    // 根据选中的服务商更新界面
    updateApiProviderUI();
    
    // 其他设置
    document.getElementById('background-activity-switch').checked = state.globalSettings.enableBackgroundActivity || false;
    document.getElementById('background-interval-input').value = state.globalSettings.backgroundActivityInterval || 60;
    document.getElementById('block-cooldown-input').value = state.globalSettings.blockCooldownHours || 1;
    
    // 圖像生成設置
    document.getElementById('image-model-select').value = state.imageConfig.model || '';
    document.getElementById('image-api-url').value = state.imageConfig.apiUrl || '';
    document.getElementById('image-api-key').value = state.imageConfig.apiKey || '';
    document.getElementById('auto-generate-images').checked = state.imageConfig.autoGenerate || false;
    document.getElementById('ai-image-generation').checked = state.imageConfig.aiImageGeneration || false;
    document.getElementById('image-generation-frequency').value = state.imageConfig.imageGenerationFrequency || 'medium';
    document.getElementById('image-quality-select').value = state.imageConfig.quality || 'standard';
    document.getElementById('image-size-select').value = state.imageConfig.size || '1024x1024';
    
    // 根據選中的生圖模型更新界面
    updateImageModelUI();
}

// 圖像模型相關函數
function updateImageModelUI() {
    const model = document.getElementById('image-model-select').value;
    const apiGroup = document.getElementById('image-api-group');
    const keyGroup = document.getElementById('image-api-key-group');
    const urlInput = document.getElementById('image-api-url');
    
    if (!model) {
        // 不使用圖像生成
        apiGroup.style.display = 'none';
        keyGroup.style.display = 'none';
    } else if (model === 'pollinations') {
        // Pollinations.ai - 完全免費，不需要API key
        apiGroup.style.display = 'block';
        keyGroup.style.display = 'none';
        urlInput.value = 'https://image.pollinations.ai/prompt';
        urlInput.disabled = true;
    } else if (model === 'huggingface') {
        // Hugging Face - 免費額度，需要token
        apiGroup.style.display = 'block';
        keyGroup.style.display = 'block';
        urlInput.value = 'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1';
        urlInput.disabled = true;
        document.querySelector('label[for="image-api-key"]').textContent = 'Hugging Face Token (免費註冊獲取)';
    } else if (model === 'deepai') {
        // DeepAI - 免費額度
        apiGroup.style.display = 'block';
        keyGroup.style.display = 'block';
        urlInput.value = 'https://api.deepai.org/api/stable-diffusion';
        urlInput.disabled = true;
        document.querySelector('label[for="image-api-key"]').textContent = 'DeepAI API Key (免費註冊獲取)';
    } else if (model === 'prodia') {
        // Prodia - 免費額度
        apiGroup.style.display = 'block';
        keyGroup.style.display = 'block';
        urlInput.value = 'https://api.prodia.com/v1/sd/generate';
        urlInput.disabled = true;
        document.querySelector('label[for="image-api-key"]').textContent = 'Prodia API Key (免費註冊獲取)';
    } else if (model === 'dalle3') {
        // DALL-E 3 使用 OpenAI API
        apiGroup.style.display = 'block';
        keyGroup.style.display = 'block';
        urlInput.value = 'https://api.openai.com/v1/images/generations';
        urlInput.disabled = true;
        document.querySelector('label[for="image-api-key"]').textContent = 'OpenAI API Key';
    } else if (model === 'custom') {
        // 自定義模型
        apiGroup.style.display = 'block';
        keyGroup.style.display = 'block';
        urlInput.disabled = false;
        document.querySelector('label[for="image-api-key"]').textContent = '圖像生成API密鑰';
    } else {
        // 其他預設模型
        apiGroup.style.display = 'block';
        keyGroup.style.display = 'block';
        urlInput.disabled = false;
        document.querySelector('label[for="image-api-key"]').textContent = 'API Key';
        
        // 根據模型設置預設API地址
        const presetUrls = {
            'flux': 'https://api.replicate.com/v1/predictions',
            'midjourney': 'https://api.midjourney.com/v1/imagine',
            'stable-diffusion': 'https://api.stability.ai/v1/generation'
        };
        
        if (presetUrls[model]) {
            urlInput.value = presetUrls[model];
        }
    }
}

// API服务商相关函数
function updateApiProviderUI() {
    const provider = document.getElementById('api-provider').value;
    const urlInput = document.getElementById('proxy-url');
    const urlLabel = document.querySelector('label[for="proxy-url"]');
    
    // 预设的API地址
    const apiUrls = {
        'gemini': 'https://generativelanguage.googleapis.com',
        'deepseek': 'https://api.deepseek.com',
        'claude': 'https://api.anthropic.com',
        'openai': 'https://api.openai.com',
        'custom': ''
    };
    
    // 更新API地址
    if (provider !== 'custom' && apiUrls[provider]) {
        urlInput.value = apiUrls[provider];
        urlInput.disabled = true;
        urlLabel.textContent = 'API 地址 (官方)';
    } else {
        urlInput.disabled = false;
        urlLabel.textContent = 'API 地址 (后缀不需添加/v1)';
    }
    
    // 更新密钥提示
    const keyInput = document.getElementById('api-key');
    const keyPlaceholders = {
        'gemini': 'AIza...',
        'deepseek': 'sk-...',
        'claude': 'sk-ant-...',
        'openai': 'sk-...',
        'custom': 'sk-...'
    };
    
    keyInput.placeholder = keyPlaceholders[provider] || 'sk-...';
}

// ===================================================================
// 統一API調用函數
// ===================================================================

// 統一API調用函數 - 支援多種服務商
async function callApiUnified(messages, temperature = 0.8) {
    // 處理COT內容
    if (window.JCYCOTProcessor && window.JCYCOTProcessor.isEnabled()) {
        const cotProcessor = window.JCYCOTProcessor;
        const processedData = cotProcessor.processCOTForAPI({ messages });
        messages = processedData.messages;
        console.log('[JCY-API] COT內容已處理並添加到API調用中');
    }
    
    const provider = state.apiConfig.provider || 'custom';
    const apiKey = state.apiConfig.apiKey;
    const proxyUrl = state.apiConfig.proxyUrl;
    const model = state.apiConfig.model || 'gpt-3.5-turbo';
    
    console.log('[JCY-API] 開始API調用:', {
        provider,
        model,
        hasApiKey: !!apiKey,
        proxyUrl: proxyUrl ? '已設置' : '未設置',
        messageCount: messages.length,
        cotEnabled: window.JCYCOTProcessor ? window.JCYCOTProcessor.isEnabled() : false
    });
    
    if (!apiKey || !proxyUrl) {
        console.error('[JCY-API] API配置錯誤:', { apiKey: !!apiKey, proxyUrl: !!proxyUrl });
        throw new Error('請先配置API密鑰和地址');
    }
    
    try {
        if (provider === 'gemini') {
            // Gemini API格式
            const geminiMessages = messages.map(msg => {
                if (msg.role === 'system') {
                    return { role: 'user', parts: [{ text: `系統提示：${msg.content}` }] };
                }
                return { 
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                };
            });
            
            const response = await fetch(`${proxyUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: geminiMessages,
                    generationConfig: { temperature: temperature }
                })
            });
            
            if (!response.ok) throw new Error(`Gemini API錯誤: ${response.status}`);
            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
            
        } else if (provider === 'claude') {
            // Claude API格式
            const systemMessage = messages.find(m => m.role === 'system');
            const otherMessages = messages.filter(m => m.role !== 'system');
            
            const claudeBody = {
                model: model,
                max_tokens: 4000,
                temperature: temperature,
                messages: otherMessages
            };
            
            if (systemMessage) {
                claudeBody.system = systemMessage.content;
            }
            
            const response = await fetch(`${proxyUrl}/v1/messages`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify(claudeBody)
            });
            
            if (!response.ok) throw new Error(`Claude API錯誤: ${response.status}`);
            const data = await response.json();
            return data.content[0].text;
            
        } else {
            // 標準OpenAI格式 (OpenAI, DeepSeek, 自定義)
            const response = await fetch(`${proxyUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${apiKey}` 
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    temperature: temperature
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: { message: '未知錯誤' } }));
                throw new Error(`API錯誤: ${response.status} - ${errorData.error?.message || '未知錯誤'}`);
            }
            
            const data = await response.json();
            return data.choices[0].message.content;
        }
    } catch (error) {
        console.error('API調用失敗:', error);
        throw error;
    }
}

// ===================================================================
// 圖像生成API
// ===================================================================

// ▼▼▼ 圖像生成核心功能 ▼▼▼
async function generateImage(prompt, config = {}) {
    try {
        const model = config.model || state.imageConfig.model;
        const apiUrl = config.apiUrl || state.imageConfig.apiUrl;
        const apiKey = config.apiKey || state.imageConfig.apiKey;
        const quality = config.quality || state.imageConfig.quality || 'standard';
        const size = config.size || state.imageConfig.size || '1024x1024';
        
        console.log('[圖像生成] 開始生成圖像:', { model, prompt, quality, size });
        
        if (!model || !apiUrl) {
            throw new Error('圖像生成配置不完整：缺少模型或API地址');
        }
        
        // 檢查需要API Key的模型
        const modelsNeedingKey = ['huggingface', 'deepai', 'prodia', 'dalle3', 'flux'];
        if (modelsNeedingKey.includes(model) && !apiKey) {
            throw new Error('此模型需要API密鑰，請先填寫');
        }
        
        let response, imageUrl = null;
        
        if (model === 'pollinations') {
            // Pollinations.ai - 直接通過URL生成，無需API請求
            const encodedPrompt = encodeURIComponent(prompt);
            const sizeParam = size.split('x');
            const width = sizeParam[0] || '1024';
            const height = sizeParam[1] || '1024';
            imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${Date.now()}`;
            console.log('[圖像生成] Pollinations URL:', imageUrl);
            return imageUrl;
            
        } else if (model === 'huggingface') {
            // Hugging Face Inference API
            const requestBody = { inputs: prompt };
            const headers = {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            };
            
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });
            
            if (response.ok) {
                const blob = await response.blob();
                imageUrl = URL.createObjectURL(blob);
            }
            
        } else if (model === 'deepai') {
            // DeepAI API
            const formData = new FormData();
            formData.append('text', prompt);
            
            const headers = {
                'api-key': apiKey
            };
            
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: formData
            });
            
            if (response.ok) {
                const data = await response.json();
                imageUrl = data.output_url;
            }
            
        } else if (model === 'prodia') {
            // Prodia API
            const requestBody = {
                prompt: prompt,
                model: "sd_xl_base_1.0.safetensors [be9edd61]",
                steps: 20,
                cfg_scale: 7,
                seed: -1,
                upscale: false,
                sampler: "DPM++ 2M Karras",
                aspect_ratio: "square"
            };
            
            const headers = {
                'Content-Type': 'application/json',
                'X-Prodia-Key': apiKey
            };
            
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.job) {
                    // Prodia需要輪詢結果
                    const jobUrl = `https://api.prodia.com/v1/job/${data.job}`;
                    let attempts = 0;
                    while (attempts < 30) { // 最多等待30次
                        await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
                        const jobResponse = await fetch(jobUrl, { headers: { 'X-Prodia-Key': apiKey } });
                        const jobData = await jobResponse.json();
                        if (jobData.status === 'succeeded') {
                            imageUrl = jobData.imageUrl;
                            break;
                        } else if (jobData.status === 'failed') {
                            throw new Error('Prodia生成失敗');
                        }
                        attempts++;
                    }
                }
            }
            
        } else if (model === 'dalle3') {
            // DALL-E 3 API
            const requestBody = {
                model: "dall-e-3",
                prompt: prompt,
                n: 1,
                size: size,
                quality: quality
            };
            
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            };
            
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });
            
            if (response.ok) {
                const data = await response.json();
                imageUrl = data.data?.[0]?.url;
            }
            
        } else if (model === 'flux') {
            // FLUX API (Replicate格式)
            const requestBody = {
                version: "schnell",
                input: {
                    prompt: prompt,
                    go_fast: true,
                    megapixels: "1",
                    num_outputs: 1,
                    aspect_ratio: size === '1024x1024' ? '1:1' : (size === '1792x1024' ? '16:9' : '9:16'),
                    output_format: "webp",
                    output_quality: quality === 'hd' ? 90 : 80
                }
            };
            
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiKey}`
            };
            
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });
            
            if (response.ok) {
                const data = await response.json();
                imageUrl = data.output?.[0] || data.urls?.[0];
            }
            
        } else {
            // 自定義或其他模型的通用格式
            const requestBody = {
                prompt: prompt,
                size: size,
                quality: quality,
                n: 1
            };
            
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            };
            
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });
            
            if (response.ok) {
                const data = await response.json();
                imageUrl = data.data?.[0]?.url || data.images?.[0]?.url || data.url;
            }
        }
        
        // 統一錯誤處理
        if (!imageUrl && response && !response.ok) {
            const errorText = await response.text();
            throw new Error(`API請求失敗: ${response.status} - ${errorText}`);
        }
        
        if (!imageUrl) {
            console.error('[圖像生成] 無法從響應中提取圖像URL:', data);
            throw new Error('無法從API響應中獲取圖像URL');
        }
        
        console.log('[圖像生成] 成功生成圖像:', imageUrl);
        return imageUrl;
        
    } catch (error) {
        console.error('[圖像生成] 生成失敗:', error);
        throw error;
    }
}

// 處理AI圖像消息的生成
async function processAiImageMessage(description) {
    try {
        if (!state.imageConfig.model) {
            console.log('[圖像生成] 未配置生圖模型，使用預設圖像');
            return 'https://i.postimg.cc/KYr2qRCK/1.jpg'; // 後備圖像
        }
        
        const imageUrl = await generateImage(description);
        return imageUrl;
        
    } catch (error) {
        console.error('[圖像生成] 處理AI圖像消息失敗:', error);
        return 'https://i.postimg.cc/KYr2qRCK/1.jpg'; // 失敗時使用後備圖像
    }
}

// 處理後端生成的圖片URL，轉換為聊天訊息
async function processBackendGeneratedImage(imageUrl, originalPrompt, chatId) {
    try {
        console.log('[後端圖片處理] 接收到後端生成的圖片:', imageUrl);
        
        // 創建圖片訊息對象
        const imageMessage = {
            role: 'assistant',
            type: 'ai_image',
            content: originalPrompt,
            timestamp: Date.now(),
            senderName: state.chats[chatId]?.name || 'AI',
            imageUrl: imageUrl // 添加圖片URL
        };
        
        // 添加到聊天歷史
        const chat = state.chats[chatId];
        if (chat) {
            chat.history.push(imageMessage);
            await db.chats.put(chat);
            
            // 如果當前正在查看這個聊天，立即顯示圖片
            if (state.activeChatId === chatId && document.getElementById('chat-interface-screen').classList.contains('active')) {
                appendMessage(imageMessage, chat);
            }
        }
        
        console.log('[後端圖片處理] 圖片訊息已添加到聊天歷史');
        
    } catch (error) {
        console.error('[後端圖片處理] 處理失敗:', error);
    }
}

// 全局函數，供後端調用
window.handleBackendGeneratedImage = async function(imageUrl, originalPrompt, chatId) {
    await processBackendGeneratedImage(imageUrl, originalPrompt, chatId);
};

// 通知後端需要生成圖片
window.notifyBackendImageGeneration = function(prompt, chatId) {
    // 這裡可以通過WebSocket、HTTP請求或其他方式通知後端
    console.log('[後端通知] 圖片生成請求:', { prompt, chatId });
    
    // 示例：如果後端有WebSocket連接
    if (window.backendWebSocket && window.backendWebSocket.readyState === WebSocket.OPEN) {
        window.backendWebSocket.send(JSON.stringify({
            type: 'generate_image',
            prompt: prompt,
            chatId: chatId
        }));
    }
};

// ===================================================================
// 圖像生成輔助函數
// ===================================================================

// 解析AI回應中的圖片prompt
function extractImagePromptFromResponse(aiResponse) {
    try {
        if (typeof aiResponse === 'string') {
            // 檢查是否有 [IMAGE_PROMPT:...] 標記
            const promptMatch = aiResponse.match(/\[IMAGE_PROMPT:(.*?)\]/);
            if (promptMatch) {
                return {
                    prompt: promptMatch[1].trim(),
                    cleanResponse: aiResponse.replace(/\[IMAGE_PROMPT:.*?\]/, '').trim()
                };
            }
        } else if (typeof aiResponse === 'object' && aiResponse.imagePrompt) {
            return {
                prompt: aiResponse.imagePrompt,
                cleanResponse: aiResponse,
                needsImageGeneration: true
            };
        }
        
        return null;
    } catch (error) {
        console.error('[圖片prompt解析] 解析失敗:', error);
        return null;
    }
}

// AI智能生圖功能 - 修改為輸出prompt供後端處理
async function processAIResponseForImageGeneration(aiResponse, chatContext) {
    try {
        // 檢查是否啟用AI智能生圖
        if (!state.imageConfig.aiImageGeneration || !state.imageConfig.model) {
            return aiResponse;
        }
        
        console.log('[AI智能生圖] 開始分析AI回應是否需要生成圖片');
        
        // 分析AI回應內容，判斷是否需要生成圖片
        const shouldGenerateImage = analyzeResponseForImageGeneration(aiResponse, chatContext);
        
        if (shouldGenerateImage) {
            console.log('[AI智能生圖] 檢測到需要生成圖片，生成prompt供後端處理...');
            
            // 生成圖片描述
            const imagePrompt = generateImagePromptFromResponse(aiResponse, chatContext);
            
            if (imagePrompt) {
                // 不直接生成圖片，而是返回包含prompt的回應供後端處理
                const enhancedResponse = addImagePromptToResponse(aiResponse, imagePrompt);
                console.log('[AI智能生圖] 已生成prompt供後端處理:', imagePrompt);
                return enhancedResponse;
            }
        }
        
        return aiResponse;
        
    } catch (error) {
        console.error('[AI智能生圖] 處理失敗:', error);
        return aiResponse; // 失敗時返回原始回應
    }
}

// 分析AI回應是否需要生成圖片
function analyzeResponseForImageGeneration(aiResponse, chatContext) {
    try {
        const responseText = typeof aiResponse === 'string' ? aiResponse : JSON.stringify(aiResponse);
        const contextText = chatContext ? JSON.stringify(chatContext) : '';
        const fullText = responseText + ' ' + contextText;
        
        // 頻率控制
        const frequency = state.imageConfig.imageGenerationFrequency;
        const random = Math.random();
        let frequencyThreshold = 0.1; // 低頻
        
        if (frequency === 'medium') {
            frequencyThreshold = 0.3;
        } else if (frequency === 'high') {
            frequencyThreshold = 0.6;
        }
        
        if (random > frequencyThreshold) {
            console.log('[AI智能生圖] 頻率控制：跳過本次生成');
            return false;
        }
        
        // 關鍵詞檢測
        const imageKeywords = [
            '圖片', '照片', '圖像', '畫', '繪畫', '插圖', '截圖', '自拍', '風景', '美食',
            'picture', 'image', 'photo', 'drawing', 'painting', 'illustration', 'screenshot',
            'selfie', 'landscape', 'food', 'art', 'design', 'visual', 'graphic'
        ];
        
        const hasImageKeywords = imageKeywords.some(keyword => 
            fullText.toLowerCase().includes(keyword.toLowerCase())
        );
        
        // 情感和描述性詞彙檢測
        const descriptiveKeywords = [
            '美麗', '漂亮', '可愛', '帥氣', '壯觀', '驚人', '有趣', '溫馨', '浪漫',
            'beautiful', 'pretty', 'cute', 'handsome', 'amazing', 'wonderful', 'interesting',
            'warm', 'romantic', 'stunning', 'gorgeous', 'magnificent'
        ];
        
        const hasDescriptiveKeywords = descriptiveKeywords.some(keyword => 
            fullText.toLowerCase().includes(keyword.toLowerCase())
        );
        
        // 場景描述檢測
        const sceneKeywords = [
            '這裡', '那邊', '場景', '地方', '環境', '氛圍', '天氣', '季節',
            'here', 'there', 'scene', 'place', 'environment', 'atmosphere', 'weather', 'season'
        ];
        
        const hasSceneKeywords = sceneKeywords.some(keyword => 
            fullText.toLowerCase().includes(keyword.toLowerCase())
        );
        
        // 決定是否生成圖片
        const shouldGenerate = hasImageKeywords || (hasDescriptiveKeywords && hasSceneKeywords);
        
        console.log('[AI智能生圖] 分析結果:', {
            hasImageKeywords,
            hasDescriptiveKeywords,
            hasSceneKeywords,
            frequency,
            shouldGenerate
        });
        
        return shouldGenerate;
        
    } catch (error) {
        console.error('[AI智能生圖] 分析失敗:', error);
        return false;
    }
}

// 從AI回應生成圖片提示詞
function generateImagePromptFromResponse(aiResponse, chatContext) {
    try {
        const responseText = typeof aiResponse === 'string' ? aiResponse : JSON.stringify(aiResponse);
        
        // 提取關鍵描述詞
        const descriptions = extractDescriptionsFromText(responseText);
        
        if (descriptions.length === 0) {
            return null;
        }
        
        // 選擇最相關的描述
        const bestDescription = descriptions[0];
        
        // 根據生圖模型優化提示詞
        const model = state.imageConfig.model;
        let optimizedPrompt = bestDescription;
        
        if (model === 'pollinations') {
            optimizedPrompt = `${bestDescription}, digital art, high quality, detailed`;
        } else if (model === 'huggingface') {
            optimizedPrompt = `${bestDescription}, beautiful, artistic`;
        } else if (model === 'dalle3') {
            optimizedPrompt = `${bestDescription}, high quality, detailed, artistic`;
        }
        
        console.log('[AI智能生圖] 生成的提示詞:', optimizedPrompt);
        return optimizedPrompt;
        
    } catch (error) {
        console.error('[AI智能生圖] 生成提示詞失敗:', error);
        return null;
    }
}

// 從文本中提取描述
function extractDescriptionsFromText(text) {
    const descriptions = [];
    
    // 提取引號內的內容
    const quotedMatches = text.match(/[""]([^""]+)[""]/g);
    if (quotedMatches) {
        quotedMatches.forEach(match => {
            const content = match.replace(/[""]/g, '');
            if (content.length > 5 && content.length < 100) {
                descriptions.push(content);
            }
        });
    }
    
    // 提取括號內的內容
    const bracketMatches = text.match(/[（(]([^）)]+)[）)]/g);
    if (bracketMatches) {
        bracketMatches.forEach(match => {
            const content = match.replace(/[（()）]/g, '');
            if (content.length > 5 && content.length < 100) {
                descriptions.push(content);
            }
        });
    }
    
    // 提取包含關鍵詞的句子
    const sentences = text.split(/[。！？.!?]/);
    sentences.forEach(sentence => {
        const trimmed = sentence.trim();
        if (trimmed.length > 10 && trimmed.length < 200) {
            const imageKeywords = ['圖片', '照片', '圖像', '畫', '美麗', '漂亮', '風景', '美食'];
            const hasKeyword = imageKeywords.some(keyword => trimmed.includes(keyword));
            if (hasKeyword) {
                descriptions.push(trimmed);
            }
        }
    });
    
    return descriptions;
}

// 將圖片prompt添加到AI回應中（供後端處理）
function addImagePromptToResponse(aiResponse, imagePrompt) {
    try {
        // 如果AI回應是字符串，添加圖片prompt標記
        if (typeof aiResponse === 'string') {
            return `${aiResponse}\n\n[IMAGE_PROMPT:${imagePrompt}]`;
        }
        
        // 如果AI回應是對象，添加圖片prompt屬性
        if (typeof aiResponse === 'object') {
            return {
                ...aiResponse,
                imagePrompt: imagePrompt,
                needsImageGeneration: true
            };
        }
        
        return aiResponse;
    } catch (error) {
        console.error('[AI智能生圖] 添加圖片prompt失敗:', error);
        return aiResponse;
    }
}

// 將圖片添加到AI回應中（保留原函數供其他用途）
function addImageToResponse(aiResponse, imageUrl, imagePrompt) {
    try {
        // 如果AI回應是字符串，直接添加圖片描述
        if (typeof aiResponse === 'string') {
            return `${aiResponse}\n\n[AI生成了圖片：${imagePrompt}]`;
        }
        
        // 如果AI回應是對象，添加圖片屬性
        if (typeof aiResponse === 'object') {
            return {
                ...aiResponse,
                generatedImage: {
                    url: imageUrl,
                    prompt: imagePrompt,
                    timestamp: Date.now()
                }
            };
        }
        
        return aiResponse;
        
    } catch (error) {
        console.error('[AI智能生圖] 添加圖片到回應失敗:', error);
        return aiResponse;
    }
}

// ===================================================================
// 導出函數
// ===================================================================

// 將所有API相關函數暴露到全局作用域
window.JCYAPIModule = {
    init: initAPIModule,
    callApiUnified,
    generateImage,
    processAiImageMessage,
    processBackendGeneratedImage,
    renderApiSettings,
    updateApiProviderUI,
    updateImageModelUI,
    extractImagePromptFromResponse,
    processAIResponseForImageGeneration,
    analyzeResponseForImageGeneration,
    generateImagePromptFromResponse,
    extractDescriptionsFromText,
    addImagePromptToResponse,
    addImageToResponse
};

// 為了向後兼容，也直接暴露主要函數
window.callApiUnified = callApiUnified;
window.generateImage = generateImage;
window.renderApiSettings = renderApiSettings;
window.updateApiProviderUI = updateApiProviderUI;
window.updateImageModelUI = updateImageModelUI;

console.log('[JCY-API] API模塊已加載完成');

// 如果主應用已經準備好，立即初始化
if (window.state && window.db) {
    initAPIModule(window.state, window.db);
    console.log('[JCY-API] 自動初始化完成');
}
