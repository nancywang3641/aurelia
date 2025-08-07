// JCY VN面板集成脚本
// 用于在JCY主系统中集成VN面板功能

class JCYVNIntegration {
    constructor() {
        this.vnPanel = null;
        this.vnIframe = null;
        this.isVNActive = false;
        this.vnSettings = {
            typeSpeed: 50,
            autoPlayDelay: 3000,
            bgmVolume: 70,
            sfxVolume: 80
        };
        
        this.init();
    }

    init() {
        console.log('[JCY VN集成] 初始化VN集成模块');
        this.loadSettings();
        this.bindEvents();
    }

    // 绑定事件
    bindEvents() {
        // 监听来自VN面板的消息
        window.addEventListener('message', (event) => {
            this.handleVNMessage(event);
        });
    }

    // 处理VN面板消息
    handleVNMessage(event) {
        const { type, data, choice, index } = event.data || {};

        switch (type) {
            case 'VN_REQUEST_DATA':
                this.handleVNDataRequest();
                break;
            case 'VN_REQUEST_CHARACTERS':
                this.handleVNCharactersRequest();
                break;
            case 'VN_CHOICE_SELECTED':
                this.handleChoiceSelected(choice, index);
                break;
            case 'VN_STORY_ENDED':
                this.handleStoryEnded();
                break;
            case 'VN_CLOSE':
            case 'VN_PANEL_CLOSED':
                this.handlePanelClosed();
                break;
            case 'VN_OPEN_SETTINGS':
                this.openVNSettings();
                break;
        }
    }

    // 打开VN面板
    openVNPanel(vnData = null) {
        if (this.isVNActive) {
            console.warn('[JCY VN集成] VN面板已打开');
            return;
        }

        console.log('[JCY VN集成] 打开VN面板');

        // 创建iframe容器
        this.createVNIframe();

        // 等待iframe加载完成后发送数据
        this.vnIframe.onload = () => {
            if (vnData) {
                this.sendVNData(vnData);
            } else {
                this.requestVNDataFromAI();
            }
        };

        this.isVNActive = true;
    }

    // 创建VN iframe
    createVNIframe() {
        // 移除现有的iframe
        if (this.vnIframe) {
            this.vnIframe.remove();
        }

        // 创建新的iframe
        this.vnIframe = document.createElement('iframe');
        this.vnIframe.src = './JCY_VN_Panel.html';
        this.vnIframe.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            border: none;
            z-index: 9999;
            background: #1a1a2e;
        `;

        document.body.appendChild(this.vnIframe);
        this.vnPanel = this.vnIframe.contentWindow;
    }

    // 关闭VN面板
    closeVNPanel() {
        if (!this.isVNActive) {
            return;
        }

        console.log('[JCY VN集成] 关闭VN面板');

        if (this.vnIframe) {
            this.vnIframe.remove();
            this.vnIframe = null;
        }

        this.vnPanel = null;
        this.isVNActive = false;
    }

    // 发送VN数据到面板
    sendVNData(vnData) {
        if (!this.vnPanel) {
            console.error('[JCY VN集成] VN面板未初始化');
            return;
        }

        this.vnPanel.postMessage({
            type: 'VN_DATA',
            data: vnData
        }, '*');

        console.log('[JCY VN集成] 已发送VN数据');
    }

    // 从AI请求VN数据
    async requestVNDataFromAI() {
        console.log('[JCY VN集成] 请求AI生成VN数据');

        try {
            // 使用JCY的AI系统生成VN数据
            const prompt = this.generateVNPrompt();
            const response = await this.callJCYAI(prompt);
            
            if (response) {
                const vnData = this.parseAIResponse(response);
                this.sendVNData(vnData);
            } else {
                console.error('[JCY VN集成] AI响应为空');
                this.showError('AI生成VN数据失败');
            }
        } catch (error) {
            console.error('[JCY VN集成] 请求AI数据失败:', error);
            this.showError('AI请求失败，请检查网络连接');
        }
    }

    // 生成VN提示词
    generateVNPrompt() {
        return `请生成一个视觉小说剧情，使用以下格式：

<info>
[main_perspective]:主角
[current_scene_characters]:主角, 角色A
</info>

<charadata>
[主角|角色A|💙友 75]
[角色A|主角|💙友 80]
</charadata>

<dialogues>
[Story|随机剧情]
[Area|AREA_A_DAY]
[BGM|calm_day]
[Scene|2025-01-01|14:30|classroom|教室]

[Narrator|故事开始...|none]
[角色A|校服|smile|你好！|none]
[主角|便服|主角_微笑|你好，很高兴见到你！|none]
[Narrator|你们开始了愉快的对话...|none]
</dialogues>

<choices>
[1️⃣ [继续聊天] | 继续与角色A聊天 | 加深友谊关系]
[2️⃣ [询问背景] | 询问角色A的背景故事 | 了解更多信息]
[3️⃣ [结束对话] | 礼貌地结束对话 | 保持礼貌距离]
</choices>

请确保：
1. 剧情有趣且引人入胜
2. 角色对话自然流畅
3. 包含适当的场景描述
4. 提供有意义的选择项
5. 严格按照AI_output.md格式输出`;
    }

    // 调用JCY AI系统
    async callJCYAI(prompt) {
        // 这里需要根据JCY的实际AI调用方式来实现
        // 暂时返回模拟数据
        return this.getMockVNData();
    }

    // 解析AI响应
    parseAIResponse(response) {
        try {
            // 如果响应是JSON格式
            if (typeof response === 'object') {
                return response;
            }

            // 如果响应是字符串格式，尝试解析
            if (typeof response === 'string') {
                return this.parseVNFormat(response);
            }

            throw new Error('无效的AI响应格式');
        } catch (error) {
            console.error('[JCY VN集成] 解析AI响应失败:', error);
            return this.getMockVNData();
        }
    }

    // 解析VN格式文本
    parseVNFormat(text) {
        const lines = text.split('\n').filter(line => line.trim());
        const result = {
            dialogues: [],
            choices: [],
            characters: [],
            info: {}
        };

        let currentSection = '';

        for (const line of lines) {
            const trimmedLine = line.trim();

            // 检测区块
            if (trimmedLine.startsWith('<') && trimmedLine.endsWith('>')) {
                currentSection = trimmedLine.slice(1, -1);
                continue;
            }

            // 解析对话
            if (currentSection === 'dialogues' || currentSection === '') {
                // 角色对话 [角色名|服装|表情|对话|音效]
                const dialogueMatch = trimmedLine.match(/^\[([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\]$/);
                if (dialogueMatch) {
                    result.dialogues.push({
                        type: 'dialogue',
                        character: dialogueMatch[1].trim(),
                        costume: dialogueMatch[2].trim(),
                        expression: dialogueMatch[3].trim(),
                        content: dialogueMatch[4].trim(),
                        soundEffect: dialogueMatch[5].trim(),
                        timestamp: Date.now()
                    });
                    continue;
                }

                // 旁白 [Narrator|内容|音效]
                const narratorMatch = trimmedLine.match(/^\[Narrator\|([^|]*)\|([^|]*)\]$/);
                if (narratorMatch) {
                    result.dialogues.push({
                        type: 'narrator',
                        content: narratorMatch[1].trim(),
                        soundEffect: narratorMatch[2].trim(),
                        timestamp: Date.now()
                    });
                    continue;
                }

                // 场景设置 [Scene|日期|时间|背景|地点]
                const sceneMatch = trimmedLine.match(/^\[Scene\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\]$/);
                if (sceneMatch) {
                    result.dialogues.push({
                        type: 'scene',
                        date: sceneMatch[1].trim(),
                        time: sceneMatch[2].trim(),
                        background: sceneMatch[3].trim(),
                        location: sceneMatch[4].trim(),
                        timestamp: Date.now()
                    });
                    continue;
                }
            }

            // 解析选择项
            if (currentSection === 'choices') {
                const choiceMatch = trimmedLine.match(/^\[([^|]+)\s*\[([^\]]+)\]\s*\|\s*([^|]*)\s*\|\s*([^|]*)\]$/);
                if (choiceMatch) {
                    result.choices.push({
                        emoji: choiceMatch[1].trim(),
                        text: choiceMatch[2].trim(),
                        description: choiceMatch[3].trim(),
                        result: choiceMatch[4].trim(),
                        timestamp: Date.now()
                    });
                }
            }
        }

        return result;
    }

    // 处理选择项选择
    handleChoiceSelected(choice, index) {
        console.log('[JCY VN集成] 用户选择:', choice);

        // 这里可以根据选择结果进行相应的处理
        // 比如更新角色关系、触发新剧情等

        // 发送选择结果到JCY主系统
        this.notifyJCYMainSystem('VN_CHOICE_SELECTED', {
            choice: choice,
            index: index,
            timestamp: Date.now()
        });
    }

    // 处理剧情结束
    handleStoryEnded() {
        console.log('[JCY VN集成] 剧情结束');

        // 发送剧情结束通知到JCY主系统
        this.notifyJCYMainSystem('VN_STORY_ENDED', {
            timestamp: Date.now()
        });

        // 延迟关闭面板
        setTimeout(() => {
            this.closeVNPanel();
        }, 2000);
    }

    // 处理面板关闭
    handlePanelClosed() {
        console.log('[JCY VN集成] VN面板已关闭');
        this.isVNActive = false;
    }

    // 打开VN设置
    openVNSettings() {
        console.log('[JCY VN集成] 打开VN设置');
        
        // 这里可以打开设置界面
        // 暂时使用简单的prompt方式
        this.showVNSettingsDialog();
    }

    // 显示VN设置对话框
    showVNSettingsDialog() {
        const settings = prompt(
            'VN设置 (JSON格式):\n' +
            JSON.stringify(this.vnSettings, null, 2)
        );

        if (settings) {
            try {
                const newSettings = JSON.parse(settings);
                this.updateVNSettings(newSettings);
            } catch (error) {
                console.error('[JCY VN集成] 设置格式错误:', error);
                this.showError('设置格式错误');
            }
        }
    }

    // 更新VN设置
    updateVNSettings(newSettings) {
        this.vnSettings = { ...this.vnSettings, ...newSettings };
        this.saveSettings();
        
        // 发送设置更新到VN面板
        if (this.vnPanel) {
            this.vnPanel.postMessage({
                type: 'VN_SETTINGS',
                settings: this.vnSettings
            }, '*');
        }

        console.log('[JCY VN集成] VN设置已更新');
    }

    // 加载设置
    loadSettings() {
        const settings = localStorage.getItem('jcy_vn_integration_settings');
        if (settings) {
            try {
                this.vnSettings = { ...this.vnSettings, ...JSON.parse(settings) };
            } catch (error) {
                console.error('[JCY VN集成] 加载设置失败:', error);
            }
        }
    }

    // 保存设置
    saveSettings() {
        localStorage.setItem('jcy_vn_integration_settings', JSON.stringify(this.vnSettings));
    }

    // 通知JCY主系统
    notifyJCYMainSystem(type, data) {
        // 这里可以根据JCY主系统的实际通信方式来实现
        console.log('[JCY VN集成] 通知主系统:', type, data);
        
        // 示例：触发自定义事件
        const event = new CustomEvent('jcy_vn_event', {
            detail: { type, data }
        });
        window.dispatchEvent(event);
    }

    // 显示错误信息
    showError(message) {
        console.error('[JCY VN集成] 错误:', message);
        
        // 这里可以使用JCY的错误显示方式
        if (typeof showError === 'function') {
            showError(message);
        } else {
            alert(`VN错误: ${message}`);
        }
    }

    // 获取模拟VN数据（用于测试）
    getMockVNData() {
        return {
            dialogues: [
                {
                    type: 'scene',
                    date: '2025-01-01',
                    time: '14:30',
                    background: 'classroom',
                    location: '教室',
                    timestamp: Date.now()
                },
                {
                    type: 'narrator',
                    content: '阳光透过窗户洒进教室，你坐在座位上，等待着新学期的开始。',
                    soundEffect: 'none',
                    timestamp: Date.now()
                },
                {
                    type: 'dialogue',
                    character: '小明',
                    costume: '校服',
                    expression: 'smile',
                    content: '你好！我是小明，很高兴认识你！',
                    soundEffect: 'none',
                    timestamp: Date.now()
                },
                {
                    type: 'dialogue',
                    character: '主角',
                    costume: '便服',
                    expression: '主角_微笑',
                    content: '你好小明！我也很高兴认识你！',
                    soundEffect: 'none',
                    timestamp: Date.now()
                },
                {
                    type: 'narrator',
                    content: '你们开始了愉快的对话，教室里充满了欢声笑语。',
                    soundEffect: 'none',
                    timestamp: Date.now()
                }
            ],
            choices: [
                {
                    emoji: '1️⃣',
                    text: '继续聊天',
                    description: '继续与小明聊天，了解更多关于他的事情',
                    result: '加深友谊关系',
                    timestamp: Date.now()
                },
                {
                    emoji: '2️⃣',
                    text: '询问背景',
                    description: '询问小明的家庭背景和学习情况',
                    result: '了解更多信息',
                    timestamp: Date.now()
                },
                {
                    emoji: '3️⃣',
                    text: '结束对话',
                    description: '礼貌地结束对话，准备上课',
                    result: '保持礼貌距离',
                    timestamp: Date.now()
                }
            ],
            characters: ['主角', '小明'],
            info: {
                main_perspective: '主角',
                current_scene_characters: '主角, 小明'
            }
        };
    }

    // 处理VN数据请求
    handleVNDataRequest() {
        console.log('[JCY VN集成] 处理VN数据请求');
        this.requestVNDataFromAI();
    }

    // 处理VN角色请求
    async handleVNCharactersRequest() {
        console.log('[JCY VN集成] 处理VN角色请求');
        
        try {
            // 从JCY主系统获取角色数据
            const characters = await this.getCharactersFromJCY();
            
            // 发送角色数据到VN面板
            if (this.vnPanel) {
                this.vnPanel.postMessage({
                    type: 'VN_CHARACTERS_DATA',
                    data: { characters: characters }
                }, '*');
            }
            
            console.log('[JCY VN集成] 已发送角色数据到VN面板:', characters.length, '个角色');
        } catch (error) {
            console.error('[JCY VN集成] 处理VN角色请求失败:', error);
        }
    }

    // 从JCY主系统获取角色数据
    async getCharactersFromJCY() {
        // 这里需要根据JCY主系统的实际实现来获取角色数据
        // 暂时返回模拟数据
        return [
            {
                id: 'char_1',
                name: '小明',
                personality: '活泼开朗的学生，喜欢交朋友',
                avatar: 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg'
            },
            {
                id: 'char_2',
                name: '小红',
                personality: '温柔善良的女孩，学习成绩优秀',
                avatar: 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg'
            },
            {
                id: 'char_3',
                name: '老师',
                personality: '经验丰富的教师，关心学生成长',
                avatar: 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg'
            }
        ];
    }

    // 公共API方法
    // 启动VN剧情
    startVN(vnData = null) {
        this.openVNPanel(vnData);
    }

    // 停止VN剧情
    stopVN() {
        this.closeVNPanel();
    }

    // 获取VN状态
    getVNStatus() {
        return {
            isActive: this.isVNActive,
            settings: this.vnSettings
        };
    }

    // 更新VN设置
    updateSettings(settings) {
        this.updateVNSettings(settings);
    }
}

// 全局VN集成实例
window.JCYVNIntegration = new JCYVNIntegration();

// 导出给其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = JCYVNIntegration;
}

console.log('[JCY VN集成] 模块已加载'); 