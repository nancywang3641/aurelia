/**
 * 藏書入場精靈(白金視差風)
 * 兩幕:入場規劃(選 圖庫立繪/自由生成)→ 開場預覽(切開場)→ 進入故事
 * 只在第 0 樓(故事未推進)出現;蓋在藏書面板上,收起後即現有閱讀畫面,渲染管線不碰。
 * 視覺:框/鈕/線全 CSS(縮放銳利),只留「畫」用圖——背景大廳、卡片圖案x2、盾徽;
 *      符號類圖標一律 FontAwesome。直橫共用一套 flex 流式,直式(.sew-portrait)只調參數。
 * 素材:sound-files/aseets/story_entry/;樣式在 css/story_entry_wizard.css
 */

(function () {
    'use strict';

    const CDN = 'https://raw.githubusercontent.com/nancywang3641/sound-files/main/aseets/story_entry/';
    const CANVAS_W = 1253.438, CANVAS_H = 705.469;
    const PORTRAIT_REF_W = 430;   // 直式一欄的參考寬(單位換算用)

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
            const root = document.createElement('div');
            root.id = 'sew-root';
            root.innerHTML = `
                <div class="sew-bg"></div>
                <div class="sew-stage">
                    <div class="sew-panel">
                        <button class="sew-close" id="sew-close" type="button" title="關閉"><i class="fa-solid fa-xmark"></i></button>
                        <div class="sew-title-row">
                            <span class="sew-wing"></span>
                            <h2 class="sew-title">視差入場規劃</h2>
                            <span class="sew-wing"></span>
                        </div>

                        <div class="sew-screen" id="sew-screen-plan">
                            <div class="sew-badge">
                                <img class="sew-badge-icon" src="${CDN}badge-icon.webp" alt="">
                                <span class="sew-badge-text">已識別:<b id="sew-card-name"></b></span>
                            </div>
                            <div class="sew-cards">
                                <div class="sew-card" id="sew-pick-lib">
                                    <div class="sew-dia-row">
                                        <span class="sew-dia-deco"></span>
                                        <div class="sew-diamond"><img src="${CDN}card-lib-icon.webp" alt=""></div>
                                        <span class="sew-dia-deco sew-dia-deco-r"></span>
                                    </div>
                                    <div class="sew-card-title">圖庫立繪</div>
                                    <div class="sew-card-sub">使用角色卡原有的立繪與視覺素材</div>
                                    <div class="sew-card-divider"></div>
                                </div>
                                <div class="sew-card" id="sew-pick-free">
                                    <div class="sew-dia-row">
                                        <span class="sew-dia-deco"></span>
                                        <div class="sew-diamond"><img class="sew-icon-crystal" src="${CDN}card-free-icon.webp" alt=""></div>
                                        <span class="sew-dia-deco sew-dia-deco-r"></span>
                                    </div>
                                    <div class="sew-card-title">自由生成</div>
                                    <div class="sew-card-sub">由系統生成風格貼合的視覺立繪</div>
                                    <div class="sew-card-divider"></div>
                                </div>
                            </div>
                            <div class="sew-info">
                                <div class="sew-info-col"><i class="fa-solid fa-user"></i><div class="sew-info-txt">角色來源<small>自動識別</small></div></div>
                                <span class="sew-info-sep"></span>
                                <div class="sew-info-col"><i class="fa-solid fa-palette"></i><div class="sew-info-txt">視覺方案<small>由你選擇</small></div></div>
                                <span class="sew-info-sep"></span>
                                <div class="sew-info-col"><i class="fa-solid fa-book-open"></i><div class="sew-info-txt">開場內容<small>保持原樣</small></div></div>
                            </div>
                            <button class="sew-cta" id="sew-go-preview" type="button"><span>預覽開場</span><i class="fa-solid fa-chevron-right"></i></button>
                        </div>

                        <div class="sew-screen sew-hidden" id="sew-screen-preview">
                            <div class="sew-badge">
                                <img class="sew-badge-icon" src="${CDN}badge-icon.webp" alt="">
                                <span class="sew-badge-text sew-chip2-text">開場預覽</span>
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
                                <button class="sew-btn-outline" id="sew-back" type="button"><i class="fa-solid fa-chevron-left"></i><span>上一步</span></button>
                                <button class="sew-btn-outline" id="sew-replan" type="button"><span>重新規劃</span></button>
                                <button class="sew-cta sew-enter" id="sew-enter" type="button"><span>進入故事</span></button>
                            </div>
                        </div>

                        <div class="sew-screen sew-hidden" id="sew-screen-embark">
                            <div class="sew-badge">
                                <img class="sew-badge-icon" src="${CDN}badge-icon.webp" alt="">
                                <span class="sew-badge-text sew-chip2-text">啟程</span>
                            </div>
                            <div class="sew-embark-frame">
                                <div class="sew-embark-hint">寫下你踏入故事的第一步——行動、對白或心聲都可以</div>
                                <textarea class="sew-embark-input" id="sew-embark-input" placeholder="在這裡寫下你的第一句…"></textarea>
                            </div>
                            <div class="sew-btn-row">
                                <button class="sew-btn-outline" id="sew-embark-back" type="button"><i class="fa-solid fa-chevron-left"></i><span>上一步</span></button>
                                <button class="sew-cta sew-enter" id="sew-embark-go" type="button"><span>啟 程</span><i class="fa-solid fa-feather"></i></button>
                            </div>
                        </div>
                    </div>
                </div>`;

            rootWrapper.appendChild(root);
            this._watchScale(root);
            this._wire(root);
            console.log('[StoryEntryWizard] ✅ 入場精靈已展開');
        },

        // --sew-u = 版面單位 px(限制邊決定);容器直式(比例<1)切 .sew-portrait
        _watchScale(root) {
            const apply = () => {
                const w = root.clientWidth, h = root.clientHeight;
                if (!w || !h) return;
                const portrait = (w / h) < 1;
                root.classList.toggle('sew-portrait', portrait);
                const u = portrait ? (w / PORTRAIT_REF_W) : Math.min(w / CANVAS_W, h / CANVAS_H);
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
            // 進入故事 = 到「啟程」輸入幕;整條流程不再露出舊閱讀面板
            $('#sew-enter').onclick = () => {
                $('#sew-screen-preview').classList.add('sew-hidden');
                $('#sew-screen-embark').classList.remove('sew-hidden');
                setTimeout(() => { try { $('#sew-embark-input').focus(); } catch (e) { } }, 60);
            };
            $('#sew-embark-back').onclick = () => {
                $('#sew-screen-embark').classList.add('sew-hidden');
                $('#sew-screen-preview').classList.remove('sew-hidden');
            };
            // 啟程:把第一句塞進酒館輸入框直接送出;精靈留在原地當底,
            // 生成開始後 story_extractor 的「故事撰寫中」等待室蓋上來(z-index 已抬高),
            // 完成後 hide() 整包收掉直接進 VN——舊面板全程不露臉
            $('#sew-embark-go').onclick = () => {
                const ta = document.getElementById('send_textarea');
                const btn = document.getElementById('send_but');
                const txt = ($('#sew-embark-input').value || '').trim();
                if (!txt) { $('#sew-embark-input').focus(); return; }
                if (ta && btn) {
                    try {
                        ta.value = txt;
                        ta.dispatchEvent(new Event('input', { bubbles: true }));
                        btn.click();
                        _entered.add(this._chatKey());
                        $('#sew-embark-go').disabled = true;
                    } catch (e) {
                        console.warn('[StoryEntryWizard] 送出失敗:', e);
                        this.dismiss(root);   // 送不出去就讓路給原本的輸入流程
                    }
                } else {
                    // 找不到酒館輸入框(特殊掛載)→ 退回原路:收精靈露出面板自己打
                    _entered.add(this._chatKey());
                    try { root.closest('#se-root-wrapper')?.classList.add('sew-planned'); } catch (e) { }
                    this.dismiss(root);
                }
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
