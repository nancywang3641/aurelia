/**
 * 藏書入場精靈(白金視差風)
 * 兩幕:入場規劃(選 圖庫立繪/自由生成)→ 開場預覽(切開場)→ 進入故事
 * 只在第 0 樓(故事未推進)出現;蓋在藏書面板上,收起後即現有閱讀畫面,渲染管線不碰。
 * 視覺:框/鈕/線全 CSS(縮放銳利),裝飾圖案全部 inline SVG(向量銳利、不走 CDN);
 *      只剩滿版背景大廳 bg.webp 仍是圖(寫實場景,見 css)。
 * 樣式在 css/story_entry_wizard.css;翼線/分隔線是 CSS data-URI SVG
 */

(function () {
    'use strict';

    // ── 面板裝飾圖案(手繪 SVG,白金視差風:深藍 #1c3260 系 + 金 #d0a95c 系)──
    // 注意:重複使用的圖案(盾徽/箭頭)不放 <defs> 漸層,避免同頁 id 撞名
    const SVG = {
        // 關閉X:雙弧交叉筆畫
        closeX: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g stroke="#1e3a76" stroke-width="13" stroke-linecap="round" fill="none"><path d="M15 17 C36 33 64 61 85 83"/><path d="M85 17 C64 33 36 61 15 83"/></g></svg>`,

        // 盾徽:深藍硬幣+金細環+四向星芒+層疊盾牌+書籤鑰匙孔(用 3 次,全平塗無 defs)
        badge: `<svg class="sew-badge-icon" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="60" cy="60" r="57" fill="#1d3468" stroke="#0e1c3c" stroke-width="1.5"/>
            <ellipse cx="60" cy="38" rx="44" ry="26" fill="#2e4f96" opacity="0.5"/>
            <circle cx="60" cy="60" r="48.5" fill="none" stroke="#e3cf96" stroke-width="1.6"/>
            <g fill="#eee0b4">
                <path d="M60 5.5 q1.2 4.8 6 6 q-4.8 1.2 -6 6 q-1.2 -4.8 -6 -6 q4.8 -1.2 6 -6"/>
                <path d="M60 96.5 q1.2 4.8 6 6 q-4.8 1.2 -6 6 q-1.2 -4.8 -6 -6 q4.8 -1.2 6 -6"/>
                <path d="M5.5 60 q4.8 -1.2 6 -6 q1.2 4.8 6 6 q-4.8 1.2 -6 6 q-1.2 -4.8 -6 -6"/>
                <path d="M96.5 60 q4.8 -1.2 6 -6 q1.2 4.8 6 6 q-4.8 1.2 -6 6 q-1.2 -4.8 -6 -6"/>
            </g>
            <g transform="translate(60 63) scale(1.08) translate(-60 -63)">
                <path d="M40 34 L80 34 Q88 34 88 42 L88 82 Q88 89 81 91 L60 97 L39 91 Q32 89 32 82 L32 42 Q32 34 40 34 Z" fill="#1c3260" stroke="#e6d5a4" stroke-width="4"/>
                <path d="M40 34 L80 34 Q88 34 88 42 L88 82 Q88 89 81 91 L60 97 L39 91 Q32 89 32 82 L32 42 Q32 34 40 34 Z" fill="#24407a" stroke="#e6d5a4" stroke-width="2.6" transform="translate(60 63) scale(0.76) translate(-60 -63)"/>
                <circle cx="60" cy="55" r="7.5" fill="#f2e7c4"/>
                <path d="M53.5 60 h13 v20 l-6.5 -6 l-6.5 6 z" fill="#f2e7c4"/>
            </g>
        </svg>`,

        // 圖庫立繪卡:相框山景(藍日+金星+雙峰)
        cardLib: `<svg viewBox="0 0 300 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs><clipPath id="sewLibClip"><rect x="26" y="26" width="248" height="208" rx="12"/></clipPath></defs>
            <rect x="6" y="6" width="288" height="248" rx="26" fill="#26418f"/>
            <rect x="26" y="26" width="248" height="208" rx="12" fill="#ffffff"/>
            <g clip-path="url(#sewLibClip)">
                <circle cx="92" cy="88" r="27" fill="#7d9ede" stroke="#4a6bbd" stroke-width="3"/>
                <circle cx="83" cy="79" r="9" fill="#adc6f1" opacity="0.85"/>
                <polygon points="196,102 100,234 196,234" fill="#3a57ad"/>
                <polygon points="196,102 196,234 288,234" fill="#22397e"/>
                <polygon points="97,138 4,234 97,234" fill="#2f4d9f"/>
                <polygon points="97,138 97,234 186,234" fill="#1f3577"/>
            </g>
            <path d="M184 52 q2.4 11.6 14 14 q-11.6 2.4 -14 14 q-2.4 -11.6 -14 -14 q11.6 -2.4 14 -14" fill="#e6b053"/>
            <path d="M184 60 q1.6 5.4 6 7 q-5.4 1.6 -6 6 q-1.6 -5.4 -6 -6 q5.4 -1.6 6 -7" fill="#f5d68a"/>
        </svg>`,

        // 自由生成卡:藍水晶+金色軌道環+星芒(單次使用,defs id 加 sewFree 前綴)
        cardFree: `<svg class="sew-icon-crystal" viewBox="0 0 340 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id="sewFreeLight" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9db8f2"/><stop offset="1" stop-color="#3b5bc4"/></linearGradient>
                <linearGradient id="sewFreeMid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4d6fd6"/><stop offset="1" stop-color="#22389b"/></linearGradient>
                <linearGradient id="sewFreeDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e3184"/><stop offset="1" stop-color="#0a1440"/></linearGradient>
                <linearGradient id="sewFreeDeep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16255e"/><stop offset="1" stop-color="#060d2e"/></linearGradient>
                <linearGradient id="sewFreeGold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f5d47a"/><stop offset="0.5" stop-color="#eda23f"/><stop offset="1" stop-color="#d9731f"/></linearGradient>
            </defs>
            <g transform="rotate(-18 170 138)"><path d="M -148 0 A 148 44 0 0 1 148 0" transform="translate(170 138)" fill="none" stroke="url(#sewFreeGold)" stroke-width="8" stroke-linecap="round" opacity="0.9"/></g>
            <g stroke="#0a1440" stroke-width="1" stroke-linejoin="round">
                <polygon points="170,8 92,98 146,98" fill="url(#sewFreeLight)"/>
                <polygon points="170,8 146,98 194,98" fill="url(#sewFreeMid)"/>
                <polygon points="170,8 194,98 248,98" fill="url(#sewFreeDark)"/>
                <polygon points="92,98 146,98 170,250" fill="url(#sewFreeMid)"/>
                <polygon points="146,98 194,98 170,250" fill="url(#sewFreeDeep)"/>
                <polygon points="194,98 248,98 170,250" fill="url(#sewFreeDark)"/>
            </g>
            <polygon points="170,8 152,82 168,62" fill="#cfdcfa" opacity="0.8"/>
            <g transform="rotate(-18 170 138)"><path d="M -148 0 A 148 44 0 0 0 148 0" transform="translate(170 138)" fill="none" stroke="url(#sewFreeGold)" stroke-width="13" stroke-linecap="round"/></g>
            <path d="M306 42 q2.4 12.6 15 15 q-12.6 2.4 -15 15 q-2.4 -12.6 -15 -15 q12.6 -2.4 15 -15" fill="#eda23f"/>
            <path d="M34 74 q1.6 8.4 10 10 q-8.4 1.6 -10 10 q-1.6 -8.4 -10 -10 q8.4 -1.6 10 -10" fill="#f0c060"/>
        </svg>`,

        // CTA 箭頭:金邊奶白粗夾角(用 2 次,無 defs)
        chevron: `<svg class="sew-cta-ico" viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M16 14 L47 50 L16 86" fill="none" stroke="#ddc294" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M16 14 L47 50 L16 86" fill="none" stroke="#fdf9ec" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
    };
    // 橫式版面基準:面板 880u + 舞台左右留白 32u,寬基準壓到 950u 讓面板吃滿容器寬(約 93%)
    // 高基準 705u 只當溢出保護(最高的一幕內容約 629u),不夠高時才改由高度決定單位
    const CANVAS_W = 950, CANVAS_H = 705.469;
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
                        <button class="sew-close" id="sew-close" type="button" title="關閉">${SVG.closeX}</button>
                        <div class="sew-title-row">
                            <span class="sew-wing"></span>
                            <h2 class="sew-title">視差入場規劃</h2>
                            <span class="sew-wing"></span>
                        </div>

                        <div class="sew-screen" id="sew-screen-plan">
                            <div class="sew-badge">
                                ${SVG.badge}
                                <span class="sew-badge-text">已識別:<b id="sew-card-name"></b></span>
                            </div>
                            <div class="sew-cards">
                                <div class="sew-card" id="sew-pick-lib">
                                    <div class="sew-dia-row">
                                        <span class="sew-dia-deco"></span>
                                        <div class="sew-diamond">${SVG.cardLib}</div>
                                        <span class="sew-dia-deco sew-dia-deco-r"></span>
                                    </div>
                                    <div class="sew-card-title">圖庫立繪</div>
                                    <div class="sew-card-sub">使用角色卡原有的立繪與視覺素材</div>
                                    <div class="sew-card-divider"></div>
                                </div>
                                <div class="sew-card" id="sew-pick-free">
                                    <div class="sew-dia-row">
                                        <span class="sew-dia-deco"></span>
                                        <div class="sew-diamond">${SVG.cardFree}</div>
                                        <span class="sew-dia-deco sew-dia-deco-r"></span>
                                    </div>
                                    <div class="sew-card-title">自由生成</div>
                                    <div class="sew-card-sub">由系統生成風格貼合的視覺立繪</div>
                                    <div class="sew-card-divider"></div>
                                </div>
                            </div>
                            <div class="sew-info">
                                <div class="sew-info-col"><span class="sew-info-ring"><i class="fa-solid fa-user"></i></span><div class="sew-info-txt">角色來源<small>自動識別</small></div></div>
                                <span class="sew-info-sep"></span>
                                <div class="sew-info-col"><span class="sew-info-ring"><i class="fa-solid fa-palette"></i></span><div class="sew-info-txt">視覺方案<small>由你選擇</small></div></div>
                                <span class="sew-info-sep"></span>
                                <div class="sew-info-col"><span class="sew-info-ring"><i class="fa-solid fa-book-open"></i></span><div class="sew-info-txt">開場內容<small>保持原樣</small></div></div>
                            </div>
                            <button class="sew-cta" id="sew-go-preview" type="button"><span>預覽開場</span>${SVG.chevron}</button>
                        </div>

                        <div class="sew-screen sew-hidden" id="sew-screen-preview">
                            <div class="sew-badge">
                                ${SVG.badge}
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
                                ${SVG.badge}
                                <span class="sew-badge-text sew-chip2-text">啟程</span>
                            </div>
                            <div class="sew-embark-frame">
                                <div class="sew-embark-hint">寫下你踏入故事的第一步——行動、對白或心聲都可以</div>
                                <textarea class="sew-embark-input" id="sew-embark-input" placeholder="在這裡寫下你的第一句…"></textarea>
                            </div>
                            <div class="sew-btn-row">
                                <button class="sew-btn-outline" id="sew-embark-back" type="button"><i class="fa-solid fa-chevron-left"></i><span>上一步</span></button>
                                <button class="sew-cta sew-enter" id="sew-embark-go" type="button"><span>啟 程</span>${SVG.chevron}</button>
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
                this._screen(root, 'preview');
                this._renderPreview(root);
            };

            // 幕二:上一步 / 重新規劃(回開場1再回幕一)/ 進入故事
            $('#sew-back').onclick = () => this._screen(root, 'plan');
            $('#sew-replan').onclick = async () => {
                try { await window.TavernHelper.setChatMessages([{ message_id: 0, swipe_id: 0 }]); } catch (e) { }
                try { window.StoryExtractor?._scheduleRender?.(300); } catch (e) { }
                this._screen(root, 'plan');
            };
            // 進入故事 = 到「啟程」輸入幕;整條流程不再露出舊閱讀面板
            $('#sew-enter').onclick = () => {
                this._screen(root, 'embark');
                setTimeout(() => { try { $('#sew-embark-input').focus(); } catch (e) { } }, 60);
            };
            $('#sew-embark-back').onclick = () => this._screen(root, 'preview');
            // 啟程:把第一句塞進酒館輸入框直接送出;精靈留著當底。
            // 🚨 不可以在這裡 StoryExtractor.hide():第0樓劇情頁還沒開,hide() 會連整個 VN 面板收掉回主頁;
            //    而 VN 的撰寫幕布掛在劇情頁裡、此刻也看不到 → 統一 loading 由藏書等待室「借校準艙殼」來演
            //    (story_extractor._showFlowOverlay),故事就緒後殼還回劇情頁給開場閘門無縫接手。
            $('#sew-embark-go').onclick = () => {
                const ta = document.getElementById('send_textarea');
                const btn = document.getElementById('send_but');
                const txt = ($('#sew-embark-input').value || '').trim();
                if (!txt) { $('#sew-embark-input').focus(); return; }
                if (ta && btn) {
                    try {
                        ta.value = txt;
                        ta.dispatchEvent(new Event('input', { bubbles: true }));
                        _entered.add(this._chatKey());
                        btn.click();
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

        // 切幕:只有開場預覽那幕走沉浸態(面板殼/標題/徽章全退場,開場白鋪滿舞台——框著看代入不進去)
        _screen(root, name) {
            const MAP = { plan: '#sew-screen-plan', preview: '#sew-screen-preview', embark: '#sew-screen-embark' };
            for (const [key, sel] of Object.entries(MAP)) {
                root.querySelector(sel)?.classList.toggle('sew-hidden', key !== name);
            }
            root.classList.toggle('sew-immersive', name === 'preview');
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
                // 預覽＝閱讀畫面同一套渲染:作者的 HTML 美化面板照原樣上牆(以前自己剝成純文字,美化面板整個不見)
                let blocks = 0;
                try {
                    blocks = window.StoryExtractor?.renderOpeningInto?.(body) || 0;
                    // 預覽框是固定高的框:整頁式卡片(100vh)搬進來會在框底留一大段空白 → 放掉那層高度
                    if (blocks) window.StoryExtractor?.deflateFullPageBlocks?.(body);
                } catch (e) { blocks = 0; }
                if (!blocks) {
                    // 刮不到已渲染的第 0 樓(掛載特殊/尚未上牆)→ 退回原文純文字,至少讀得到內容
                    body.innerHTML = '';
                    for (const line of this._plainLines(list[cur])) {
                        const p = document.createElement('p');
                        p.textContent = line;
                        body.appendChild(p);
                    }
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
                // 預覽刮的是酒館第 0 樓已渲染的 DOM,切 swipe 後那邊要幾拍才重繪 → 補渲染一次拿最終態
                setTimeout(() => this._renderPreview(root), 400);
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
