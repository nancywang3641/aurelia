/**
 * 藏書入場精靈(白金視差風)
 * 兩幕:入場規劃(選 圖庫立繪/自由生成)→ 開場預覽(切開場)→ 進入故事
 * 只在第 0 樓(故事未推進)出現;蓋在藏書面板上,收起後即現有閱讀畫面,渲染管線不碰。
 * 版型:橫式=照 manifest 座標絕對定位拼回原稿;直式(手機/手機殼容器)=同素材改直欄流式。
 *      判定看「容器」長寬比不是視窗(藏書常開在直式手機容器裡),JS 掛 .sew-portrait。
 * 素材:sound-files/aseets/story_entry/;定位在 css/story_entry_wizard.css
 */

(function () {
    'use strict';

    const CDN = 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/story_entry/';
    const CANVAS_W = 1253.438;
    const PORTRAIT_REF_W = 430;   // 直式一欄的參考寬(canvas 單位),--sew-u 換算用

    // 同一張聊天按過「進入故事」後,這輪 session 內不再彈(避免每次開藏書都重走)
    const _entered = new Set();

    const StoryEntryWizard = {
        _resizeOb: null,

        _chatKey() {
            try { return window.SillyTavern?.getContext?.()?.chatId || window.TavernHelper?.getCharData?.('current')?.name || '_'; }
            catch (e) { return '_'; }
        },

        maybeShow(rootWrapper) {
            try {
                const TH = window.TavernHelper;
                if (!TH?.getLastMessageId || !TH?.getChatMessages || !TH?.setChatMessages) return;
                if (TH.getLastMessageId() !== 0) return;          // 劇情已推進 → 不打擾
                if (_entered.has(this._chatKey())) return;        // 這輪已按過進入故事
                if (!rootWrapper || rootWrapper.querySelector('#sew-root')) return;
                this._build(rootWrapper);
            } catch (e) { console.warn('[StoryEntryWizard] maybeShow 失敗:', e); }
        },

        // ── 組裝 ─────────────────────────────────────────────
        _build(rootWrapper) {
            const img = (name, extra = '') => `<img class="sew-piece sew-p-${name}${extra ? ' ' + extra : ''}" src="${CDN}${name}.webp" alt="">`;
            // 群組內小件:座標相對群組殼(rel% 在 CSS)
            const rimg = (name) => `<img class="sew-piece sew-r-${name}" src="${CDN}${name}.webp" alt="">`;

            const root = document.createElement('div');
            root.id = 'sew-root';
            root.innerHTML = `
                <div class="sew-bg"></div>
                <div class="sew-stage">
                    ${img('panel-shell')}${img('corner-tl')}${img('corner-tr')}
                    ${img('rail-left')}${img('rail-right')}${img('deco-right')}

                    <div class="sew-g sew-g-title">
                        ${rimg('title-banner')}
                        <div class="sew-title">視差入場規劃</div>
                    </div>
                    <div class="sew-g sew-g-close" id="sew-close" title="關閉">
                        ${rimg('close-x')}
                    </div>

                    <div class="sew-screen" id="sew-screen-plan">
                        <div class="sew-g sew-g-badge">
                            ${rimg('badge-bar')}${rimg('badge-icon')}
                            <div class="sew-badge-text">已識別:<b id="sew-card-name"></b></div>
                        </div>
                        <div class="sew-g sew-g-card sew-g-lib" id="sew-pick-lib">
                            ${rimg('card-lib-shell')}${rimg('card-lib-diamond')}${rimg('card-lib-deco-l')}${rimg('card-lib-deco-r')}${rimg('card-lib-icon')}${rimg('card-lib-divider')}
                            <div class="sew-card-title">圖庫立繪</div>
                            <div class="sew-card-sub">使用角色卡原有的立繪與視覺素材</div>
                        </div>
                        <div class="sew-g sew-g-card sew-g-free" id="sew-pick-free">
                            ${rimg('card-free-shell')}${rimg('card-free-diamond')}${rimg('card-free-deco-l')}${rimg('card-free-deco-r')}${rimg('card-free-icon')}${rimg('card-free-divider')}
                            <div class="sew-card-title">自由生成</div>
                            <div class="sew-card-sub">由系統生成風格貼合的視覺立繪</div>
                        </div>
                        <div class="sew-g sew-g-info">
                            ${rimg('info-bar')}${rimg('info-icon-person')}${rimg('info-div-1')}${rimg('info-icon-palette')}${rimg('info-div-2')}${rimg('info-icon-book')}
                            <div class="sew-info-col sew-info-1">角色來源<small>自動識別</small></div>
                            <div class="sew-info-col sew-info-2">視覺方案<small>由你選擇</small></div>
                            <div class="sew-info-col sew-info-3">開場內容<small>保持原樣</small></div>
                        </div>
                        ${img('spark-1')}${img('spark-2')}${img('spark-3')}
                        <div class="sew-g sew-g-cta" id="sew-go-preview">
                            ${rimg('cta-shell')}${rimg('cta-arrow')}
                            <div class="sew-cta-text">預覽開場</div>
                        </div>
                    </div>

                    <div class="sew-screen sew-hidden" id="sew-screen-preview">
                        <div class="sew-g sew-g-badge sew-g-chip2">
                            ${rimg('badge-bar')}${rimg('badge-icon')}
                            <div class="sew-preview-chip-text">開場預覽</div>
                        </div>
                        <div class="sew-preview-frame">
                            <div class="sew-preview-head">
                                <button class="sew-swipe-btn" id="sew-swipe-prev" type="button" title="上一個開場"><i class="fa-solid fa-chevron-left"></i></button>
                                <span id="sew-swipe-label">開場</span>
                                <button class="sew-swipe-btn" id="sew-swipe-next" type="button" title="下一個開場"><i class="fa-solid fa-chevron-right"></i></button>
                            </div>
                            <div class="sew-preview-body" id="sew-preview-body"></div>
                        </div>
                        <div class="sew-btn-row">
                            <button class="sew-btn-outline sew-btn-back" id="sew-back" type="button"><i class="fa-solid fa-chevron-left"></i><span>上一步</span></button>
                            <button class="sew-btn-outline sew-btn-replan" id="sew-replan" type="button"><span>重新規劃</span></button>
                            <div class="sew-g sew-g-enter" id="sew-enter">
                                ${rimg('cta-shell')}
                                <div class="sew-cta-text">進入故事</div>
                            </div>
                        </div>
                    </div>
                </div>`;

            rootWrapper.appendChild(root);
            this._watchScale(root);
            this._wire(root);
            console.log('[StoryEntryWizard] ✅ 入場精靈已展開');
        },

        // --sew-u = 1 canvas 單位的實際 px;容器直式(比例<1)切 .sew-portrait 直欄版
        // 橫式舞台尺寸由 JS 算「等比放到最大」——CSS aspect-ratio 撞上 max-width/height 會變形
        _watchScale(root) {
            const AR = 1253.438 / 705.469;
            const apply = () => {
                const w = root.clientWidth, h = root.clientHeight;
                if (!w || !h) return;
                const portrait = (w / h) < 1;
                root.classList.toggle('sew-portrait', portrait);
                const stage = root.querySelector('.sew-stage');
                let u;
                if (portrait) {
                    if (stage) { stage.style.width = ''; stage.style.height = ''; }
                    u = w / PORTRAIT_REF_W;
                } else {
                    const sw = Math.min(w, h * AR);
                    if (stage) { stage.style.width = sw + 'px'; stage.style.height = (sw / AR) + 'px'; }
                    u = sw / CANVAS_W;
                }
                root.style.setProperty('--sew-u', u + 'px');
                root.style.setProperty('--sew-h', h + 'px');
            };
            try {
                this._resizeOb?.disconnect();
                this._resizeOb = new ResizeObserver(apply);
                this._resizeOb.observe(root);
            } catch (e) { /* 舊核心沒 ResizeObserver 就吃初始值 */ }
            apply();
        },

        // ── 接線 ─────────────────────────────────────────────
        _wire(root) {
            const $ = (sel) => root.querySelector(sel);
            const FM = window.VN_FREE_MODE;
            const fmReady = !!(FM && FM.storyId && FM.storyId());

            // 徽章:卡名
            try {
                const name = window.TavernHelper?.getCharData?.('current')?.name || '角色卡';
                $('#sew-card-name').textContent = `「${name}」`;
            } catch (e) { $('#sew-card-name').textContent = '「角色卡」'; }

            // 雙選卡:預設亮 FM 記住的模式(拿不到 FM 就預設圖庫、選了也只是視覺)
            let picked = (fmReady && FM.isFree()) ? 'free' : 'lib';
            const libHit = $('#sew-pick-lib'), freeHit = $('#sew-pick-free');
            const paint = () => {
                libHit.classList.toggle('sew-sel', picked === 'lib');
                freeHit.classList.toggle('sew-sel', picked === 'free');
            };
            libHit.onclick = () => { picked = 'lib'; paint(); };
            freeHit.onclick = () => { picked = 'free'; paint(); };
            paint();

            // 關閉 = 收掉整個藏書(跟工具列返回同款)
            $('#sew-close').onclick = () => {
                this.dismiss(root);
                try { window.StoryExtractor?.hide?.(); } catch (e) { }
            };

            // 預覽開場:套用模式 → 幕二
            $('#sew-go-preview').onclick = async () => {
                if (fmReady && FM.isFree() !== (picked === 'free')) {
                    try {
                        await FM.set(picked === 'free');
                        window.StoryExtractor?._refreshModeBar?.();   // 底下閱讀面板的模式列跟上
                    } catch (e) { console.warn('[StoryEntryWizard] 套用模式失敗:', e); }
                }
                $('#sew-screen-plan').classList.add('sew-hidden');
                $('#sew-screen-preview').classList.remove('sew-hidden');
                this._renderPreview(root);
            };

            // 幕二:上一步 / 重新規劃(回開場1再回幕一)/ 進入故事
            $('#sew-back').onclick = () => {
                $('#sew-screen-preview').classList.add('sew-hidden');
                $('#sew-screen-plan').classList.remove('sew-hidden');
            };
            $('#sew-replan').onclick = async () => {
                try { await window.TavernHelper.setChatMessages([{ message_id: 0, swipe_id: 0 }]); } catch (e) { }
                try { window.StoryExtractor?._scheduleRender?.(300); } catch (e) { }
                $('#sew-screen-preview').classList.add('sew-hidden');
                $('#sew-screen-plan').classList.remove('sew-hidden');
            };
            $('#sew-enter').onclick = () => {
                _entered.add(this._chatKey());
                this.dismiss(root);
            };

            $('#sew-swipe-prev').onclick = () => this._switch(root, -1);
            $('#sew-swipe-next').onclick = () => this._switch(root, +1);
        },

        // ── 幕二資料 ──────────────────────────────────────────
        _swipes() {
            const TH = window.TavernHelper;
            const m0 = (TH.getChatMessages(0, { include_swipes: true }) || [])[0];
            if (!m0) return { list: [''], cur: 0 };
            const list = (Array.isArray(m0.swipes) && m0.swipes.length) ? m0.swipes : [String(m0.message || '')];
            return { list, cur: m0.swipe_id || 0 };
        },

        _renderPreview(root) {
            try {
                const { list, cur } = this._swipes();
                const multi = list.length > 1;
                root.querySelector('#sew-swipe-label').textContent = multi ? `開場 ${cur + 1} / ${list.length}` : '開場';
                const prev = root.querySelector('#sew-swipe-prev'), next = root.querySelector('#sew-swipe-next');
                prev.style.visibility = next.style.visibility = multi ? 'visible' : 'hidden';
                prev.disabled = cur <= 0;
                next.disabled = cur >= list.length - 1;

                const body = root.querySelector('#sew-preview-body');
                body.innerHTML = '';
                for (const line of this._plainLines(list[cur])) {
                    const p = document.createElement('p');
                    p.textContent = line;
                    body.appendChild(p);
                }
                if (!body.childNodes.length) {
                    const p = document.createElement('p');
                    p.textContent = '(這個開場是純視覺內容,進入故事後可見完整版面)';
                    body.appendChild(p);
                }
                body.scrollTop = 0;
            } catch (e) { console.warn('[StoryEntryWizard] 預覽渲染失敗:', e); }
        },

        // 開場原文 → 純文字段落(code fence / style / script / 標籤全剝;DOMParser 惰性解析不觸發資源載入)
        _plainLines(src) {
            let t = String(src || '');
            t = t.replace(/```[\s\S]*?```/g, '');
            t = t.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
            try { t = new DOMParser().parseFromString(t, 'text/html').body.textContent || ''; } catch (e) { }
            return t.split(/\n+/).map(s => s.trim()).filter(Boolean);
        },

        async _switch(root, dir) {
            try {
                const { list, cur } = this._swipes();
                const idx = Math.min(Math.max(cur + dir, 0), list.length - 1);
                if (idx === cur) return;
                await window.TavernHelper.setChatMessages([{ message_id: 0, swipe_id: idx }]);   // 官方切換:真改第 0 樓+存檔
                try { window.StoryExtractor?._scheduleRender?.(300); } catch (e) { }             // 底下面板跟著換
                this._renderPreview(root);
            } catch (e) { console.warn('[StoryEntryWizard] 切換開場失敗:', e); }
        },

        // ── 收場 ─────────────────────────────────────────────
        dismiss(root) {
            const el = root || document.getElementById('sew-root');
            if (!el) return;
            try { this._resizeOb?.disconnect(); this._resizeOb = null; } catch (e) { }
            el.classList.add('sew-leaving');
            setTimeout(() => el.remove(), 320);
        },
    };

    window.StoryEntryWizard = StoryEntryWizard;
    console.log('[StoryEntryWizard] 模組已載入');
})();
