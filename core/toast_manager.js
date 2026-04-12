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

            // 添加样式
            this.injectStyles(targetDoc);
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
        injectStyles(targetDoc) {
            const styleId = 'aurelia-toast-styles';
            if (targetDoc.getElementById(styleId)) return;

            const style = targetDoc.createElement('style');
            style.id = styleId;
            style.textContent = `
                /* 提示容器样式 */
                .aurelia-toast-container {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 100000;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    pointer-events: none;
                    max-width: 400px;
                }

                .aurelia-toast {
                    background: #1a1a1a;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 16px 20px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    pointer-events: auto;
                    animation: toastSlideIn 0.3s ease-out;
                    min-width: 300px;
                    max-width: 400px;
                }

                @keyframes toastSlideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }

                @keyframes toastSlideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }

                .aurelia-toast.slide-out {
                    animation: toastSlideOut 0.3s ease-in;
                }

                .aurelia-toast-icon {
                    font-size: 24px;
                    flex-shrink: 0;
                }

                .aurelia-toast-content {
                    flex: 1;
                    color: #ffffff;
                    font-size: 14px;
                    line-height: 1.5;
                    word-wrap: break-word;
                }

                /* 不同类型提示的样式 */
                .aurelia-toast.success {
                    border-left: 4px solid #4caf50;
                }

                .aurelia-toast.success .aurelia-toast-icon {
                    color: #4caf50;
                }

                .aurelia-toast.error {
                    border-left: 4px solid #f44336;
                }

                .aurelia-toast.error .aurelia-toast-icon {
                    color: #f44336;
                }

                .aurelia-toast.warning {
                    border-left: 4px solid #ff9800;
                }

                .aurelia-toast.warning .aurelia-toast-icon {
                    color: #ff9800;
                }

                .aurelia-toast.info {
                    border-left: 4px solid #2196f3;
                }

                .aurelia-toast.info .aurelia-toast-icon {
                    color: #2196f3;
                }

                /* 确认对话框样式 */
                .aurelia-confirm-dialog {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 100001;
                    align-items: center;
                    justify-content: center;
                }

                .aurelia-confirm-dialog.show {
                    display: flex;
                }

                .aurelia-confirm-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(4px);
                }

                .aurelia-confirm-content {
                    position: relative;
                    background: #1a1a1a;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 24px;
                    max-width: 400px;
                    width: 90%;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                    animation: confirmFadeIn 0.3s ease-out;
                }

                @keyframes confirmFadeIn {
                    from {
                        opacity: 0;
                        transform: scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }

                .aurelia-confirm-icon {
                    font-size: 48px;
                    text-align: center;
                    margin-bottom: 16px;
                }

                .aurelia-confirm-title {
                    color: #ffffff;
                    font-size: 20px;
                    font-weight: 600;
                    text-align: center;
                    margin-bottom: 12px;
                }

                .aurelia-confirm-message {
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 14px;
                    line-height: 1.6;
                    text-align: center;
                    margin-bottom: 24px;
                    word-wrap: break-word;
                }

                .aurelia-confirm-buttons {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                }

                .aurelia-confirm-btn {
                    flex: 1;
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .aurelia-confirm-cancel {
                    background: rgba(255, 255, 255, 0.1);
                    color: #ffffff;
                }

                .aurelia-confirm-cancel:hover {
                    background: rgba(255, 255, 255, 0.2);
                }

                .aurelia-confirm-ok {
                    background: #2196f3;
                    color: #ffffff;
                }

                .aurelia-confirm-ok:hover {
                    background: #1976d2;
                }
            `;
            targetDoc.head.appendChild(style);
        },

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

