// 主题管理模块
class ThemeManager {
    constructor() {
        this.themePresets = {
            idol: {
                title: '偶像练习生',
                subtitle: '追梦舞台，闪耀时刻',
                project: 'Idol Project X',
                status: '⭐ 待定',
                level: '待定级',
                description: '接下来纳斯"狗勾"的玩笑，同时开始认真观察即将登场的导师和节目主持人，为初评级集关键信息。',
                members: ['Lian', 'Sereno', 'Alex', 'Linus']
            },
            gaming: {
                title: '电竞战队',
                subtitle: '竞技巅峰，荣耀时刻',
                project: 'Gaming Team X',
                status: '🎮 在线',
                level: '职业级',
                description: '正在为即将到来的比赛进行紧张训练，团队配合和战术策略都在不断优化中。',
                members: ['队长', '打野', '中单', '射手']
            },
            business: {
                title: '商务管理',
                subtitle: '专业高效，成就未来',
                project: 'Business Project',
                status: '💼 工作中',
                level: '经理级',
                description: '正在处理重要的商务文件，协调各部门工作，确保项目顺利进行。',
                members: ['财务', '人事', '技术', '市场']
            },
            school: {
                title: '学生管理',
                subtitle: '学习成长，知识殿堂',
                project: 'School System',
                status: '📚 学习中',
                level: '学生级',
                description: '正在认真听讲，积极参与课堂讨论，为期末考试做充分准备。',
                members: ['班长', '学习委员', '体育委员', '文艺委员']
            }
        };
        
        this.init();
    }

    init() {
        // 绑定全局函数
        window.applyTheme = this.applyTheme.bind(this);
        window.applyCustomSettings = this.applyCustomSettings.bind(this);
        window.saveNameSettings = this.saveNameSettings.bind(this);
        window.loadNameSettings = this.loadNameSettings.bind(this);
        window.switchTab = this.switchTab.bind(this);
    }

    // 应用主题
    applyTheme(themeName) {
        const theme = this.themePresets[themeName];
        if (!theme) return;
        
        // 更新页面内容
        document.getElementById('mainTitle').textContent = theme.title;
        document.getElementById('mainSubtitle').textContent = theme.subtitle;
        document.getElementById('projectTitle').textContent = theme.project;
        document.getElementById('statusBtn').textContent = theme.status;
        document.getElementById('levelBtn').textContent = theme.level;
        document.getElementById('userDescription').textContent = theme.description;
        
        // 更新成员名称
        document.getElementById('memberA').textContent = theme.members[0];
        document.getElementById('memberB').textContent = theme.members[1];
        document.getElementById('memberC').textContent = theme.members[2];
        document.getElementById('memberD').textContent = theme.members[3];
        
        // 更新输入框的值
        document.getElementById('customTitle').value = theme.title;
        document.getElementById('customSubtitle').value = theme.subtitle;
        document.getElementById('customProject').value = theme.project;
        
        // 保存设置
        this.saveNameSettings();
        
        this.showNotification(`已套用${this.getThemeDisplayName(themeName)}主题 ✨`);
    }

    // 获取主题显示名称
    getThemeDisplayName(themeName) {
        const displayNames = {
            'idol': '偶像',
            'gaming': '电竞',
            'business': '商务',
            'school': '学校'
        };
        return displayNames[themeName] || themeName;
    }

    // 应用自定义设置
    applyCustomSettings() {
        const title = document.getElementById('customTitle').value;
        const subtitle = document.getElementById('customSubtitle').value;
        const project = document.getElementById('customProject').value;
        
        // 更新页面内容
        document.getElementById('mainTitle').textContent = title;
        document.getElementById('mainSubtitle').textContent = subtitle;
        document.getElementById('projectTitle').textContent = project;
        
        // 保存设置
        this.saveNameSettings();
        
        this.showNotification('自定义设置已应用 ✨');
    }

    // 保存名称设置
    saveNameSettings() {
        const settings = {
            title: document.getElementById('mainTitle').textContent,
            subtitle: document.getElementById('mainSubtitle').textContent,
            project: document.getElementById('projectTitle').textContent,
            status: document.getElementById('statusBtn').textContent,
            level: document.getElementById('levelBtn').textContent,
            description: document.getElementById('userDescription').textContent,
            members: [
                document.getElementById('memberA').textContent,
                document.getElementById('memberB').textContent,
                document.getElementById('memberC').textContent,
                document.getElementById('memberD').textContent
            ]
        };
        localStorage.setItem('idolTraineeNames', JSON.stringify(settings));
    }

    // 加载名称设置
    loadNameSettings() {
        try {
            const saved = localStorage.getItem('idolTraineeNames');
            if (saved) {
                const settings = JSON.parse(saved);
                
                // 更新页面内容
                document.getElementById('mainTitle').textContent = settings.title || '通用面板';
                document.getElementById('mainSubtitle').textContent = settings.subtitle || '多功能界面，自定义体验';
                document.getElementById('projectTitle').textContent = settings.project || '项目信息';
                document.getElementById('statusBtn').textContent = settings.status || '⭐ 待定';
                document.getElementById('levelBtn').textContent = settings.level || '待定级';
                document.getElementById('userDescription').textContent = settings.description || '这里是用户描述区域，可以自定义显示内容。';
                
                // 更新成员名称
                if (settings.members && settings.members.length === 4) {
                    document.getElementById('memberA').textContent = settings.members[0] || '成员A';
                    document.getElementById('memberB').textContent = settings.members[1] || '成员B';
                    document.getElementById('memberC').textContent = settings.members[2] || '成员C';
                    document.getElementById('memberD').textContent = settings.members[3] || '成员D';
                }
                
                // 更新输入框的值
                document.getElementById('customTitle').value = settings.title || '通用面板';
                document.getElementById('customSubtitle').value = settings.subtitle || '多功能界面，自定义体验';
                document.getElementById('customProject').value = settings.project || '项目信息';
                
                console.log('已加载保存的名称设置:', settings);
                return true;
            }
        } catch (error) {
            console.error('加载名称设置失败:', error);
        }
        return false;
    }

    // 标签页切换功能
    switchTab(tabName) {
        // 隐藏所有标签页内容
        document.getElementById('styleTab').style.display = 'none';
        document.getElementById('nameTab').style.display = 'none';
        
        // 移除所有标签按钮的active类
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // 显示选中的标签页
        document.getElementById(tabName + 'Tab').style.display = 'block';
        
        // 为选中的标签按钮添加active类
        event.target.classList.add('active');
    }

    // 显示通知
    showNotification(message) {
        const notification = document.getElementById('notification');
        if (notification) {
            notification.textContent = message;
            notification.classList.add('show');
            
            setTimeout(() => {
                notification.classList.remove('show');
            }, 2500);
        }
    }

    // 添加新主题
    addTheme(themeName, themeData) {
        this.themePresets[themeName] = themeData;
    }

    // 获取所有主题
    getAllThemes() {
        return this.themePresets;
    }

    // 删除主题
    removeTheme(themeName) {
        if (this.themePresets[themeName]) {
            delete this.themePresets[themeName];
            return true;
        }
        return false;
    }
}

// 创建全局主题管理器实例
const themeManager = new ThemeManager();

// 导出模块（如果支持ES6模块）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeManager;
}
