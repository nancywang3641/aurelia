/**
 * ===== 统一提示容器管理器 =====
 * 替代浏览器原生的 alert/confirm，提供统一的提示样式
 * 支持：成功、错误、警告、信息、确认对话框
 * 可被所有面板使用
 */

(function() {
    'use strict';

    const logger = {
        info: (msg, ...args) => console.log(`[提示容器] ${msg}`, ...args),
        warn: (msg, ...args) => console.warn(`[提示容器] ${msg}`, ...args),
        error: (msg, ...args) => console.error(`[提示容器] ${msg}`, ...args)
    };

    /**
     * 提示容器管理器
     */
    const ToastManager = {
        // 提示容器元素
        container: null,
        // 当前显示的提示列表
        toasts: [],
        // 确认对话框相关
        confirmDialog: null,
        confirmResolve: null,

        /**
         * 初始化
         */
        init() {
            this.createContainer();
            this.createConfirmDialog();
            logger.info('提示容器管理器已初始化');
        },

        /**
         * 创建提示容器
         */
        createContainer() {
            if (this.container) return;

            // 尝试从主窗口创建（如果是 iframe）
            const targetDoc = (window.parent && window.parent !== window) 
                ? window.parent.document 
                : document;

            // 检查是否已存在
            let existing = targetDoc.getElementById('aurelia-toast-container');
            if (existing) {
                this.container = existing;
                return;
            }

            // 创建容器
            this.container = targetDoc.createElement('div');
            this.container.id = 'aurelia-toast-container';
            this.container.className = 'aurelia-toast-container';
            targetDoc.body.appendChild(this.container);
        },

        /**
         * 创建确认对话框
         */
        createConfirmDialog() {
            const targetDoc = (window.parent && window.parent !== window) 
                ? window.parent.document 
                : document;

            let existing = targetDoc.getElementById('aurelia-confirm-dialog');
            if (existing) {
                this.confirmDialog = existing;
                return;
            }

            this.confirmDialog = targetDoc.createElement('div');
            this.confirmDialog.id = 'aurelia-confirm-dialog';
            this.confirmDialog.className = 'aurelia-confirm-dialog';
            this.confirmDialog.innerHTML = `
                <div class="aurelia-confirm-overlay"></div>
                <div class="aurelia-confirm-content">
                    <div class="aurelia-confirm-icon">⚠️</div>
                    <div class="aurelia-confirm-title">确认</div>
                    <div class="aurelia-confirm-message"></div>
                    <div class="aurelia-confirm-buttons">
                        <button class="aurelia-confirm-btn aurelia-confirm-cancel">取消</button>
                        <button class="aurelia-confirm-btn aurelia-confirm-ok">确定</button>
                    </div>
                </div>
            `;
            targetDoc.body.appendChild(this.confirmDialog);

            // 绑定事件
            const cancelBtn = this.confirmDialog.querySelector('.aurelia-confirm-cancel');
            const okBtn = this.confirmDialog.querySelector('.aurelia-confirm-ok');
            const overlay = this.confirmDialog.querySelector('.aurelia-confirm-overlay');

            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => this.hideConfirm(false));
            }
            if (okBtn) {
                okBtn.addEventListener('click', () => this.hideConfirm(true));
            }
            if (overlay) {
                overlay.addEventListener('click', () => this.hideConfirm(false));
            }
        },

        /**
         * 注入样式
         */

        /**
         * 显示提示
         * @param {string} message - 提示消息
         * @param {string} type - 类型: success, error, warning, info
         * @param {number} duration - 显示时长（毫秒），0 表示不自动关闭
         */
        show(message, type = 'info', duration = 3000) {
            if (!this.container) {
                this.createContainer();
            }

            const icons = {
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: 'ℹ️'
            };

            const toast = document.createElement('div');
            toast.className = `aurelia-toast ${type}`;
            toast.innerHTML = `
                <div class="aurelia-toast-icon">${icons[type] || icons.info}</div>
                <div class="aurelia-toast-content">${this.escapeHtml(message)}</div>
            `;

            this.container.appendChild(toast);
            this.toasts.push(toast);

            // 自动关闭
            if (duration > 0) {
                setTimeout(() => {
                    this.removeToast(toast);
                }, duration);
            }

            return toast;
        },

        /**
         * 移除提示
         */
        removeToast(toast) {
            if (!toast || !toast.parentNode) return;

            toast.classList.add('slide-out');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                const index = this.toasts.indexOf(toast);
                if (index > -1) {
                    this.toasts.splice(index, 1);
                }
            }, 300);
        },

        /**
         * 显示成功提示
         */
        success(message, duration = 3000) {
            return this.show(message, 'success', duration);
        },

        /**
         * 显示错误提示
         */
        error(message, duration = 4000) {
            return this.show(message, 'error', duration);
        },

        /**
         * 显示警告提示
         */
        warning(message, duration = 3000) {
            return this.show(message, 'warning', duration);
        },

        /**
         * 显示信息提示
         */
        info(message, duration = 3000) {
            return this.show(message, 'info', duration);
        },

        /**
         * 显示确认对话框
         * @param {string} message - 确认消息
         * @param {string} title - 标题（可选）
         * @returns {Promise<boolean>} - true 表示确认，false 表示取消
         */
        confirm(message, title = '确认') {
            return new Promise((resolve) => {
                if (!this.confirmDialog) {
                    this.createConfirmDialog();
                }

                const messageEl = this.confirmDialog.querySelector('.aurelia-confirm-message');
                const titleEl = this.confirmDialog.querySelector('.aurelia-confirm-title');

                if (messageEl) {
                    messageEl.textContent = message;
                }
                if (titleEl) {
                    titleEl.textContent = title;
                }

                this.confirmResolve = resolve;
                this.confirmDialog.classList.add('show');
            });
        },

        /**
         * 隐藏确认对话框
         */
        hideConfirm(result) {
            if (this.confirmDialog) {
                this.confirmDialog.classList.remove('show');
            }
            if (this.confirmResolve) {
                this.confirmResolve(result);
                this.confirmResolve = null;
            }
        },

        /**
         * HTML 转义
         */
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    // 暴露到全局
    window.ToastManager = ToastManager;

    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ToastManager.init());
    } else {
        ToastManager.init();
    }

    logger.info('统一提示容器管理器已载入');

})();

