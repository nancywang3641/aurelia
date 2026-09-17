// ----------------------------------------------------------------
// [檔案] vn_settings.js  (VN 系統設置面板模組)
// 職責：管理 VN 面板的路徑、Prompt 設置，供 os_settings.js 外接調用。
//       資料存於 localStorage['vn_cfg_v4']，與 vn_core.js VN_Config 同一鍵。
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[PhoneOS] 載入 VN 設置面板模組...');

    const STORAGE_KEY = 'vn_cfg_v4';

    const DEFAULTS = {
        bgm:                 '',
        sfx:                 '',
        spriteBase:          '',
        spriteDirect:        false,
        stickerBase:         '',
        charDefaultBase:     '',
        finalFallbackSprite: 'https://files.catbox.moe/9je7j2.png',
        avatarBasePrompt:    '',
        avatarNegPrompt:     'bad anatomy, extra limbs, disfigured, blurry, low quality, worst quality, watermark, text',
        avatarBasePromptTavern: '',
        avatarNegPromptTavern:  '',
        bgBasePrompt:        '',
        bgNegPrompt:         'people, person, man, woman, child, crowd, character, pedestrian, anime screencap, cel shading, flat color, simple lines, sketch, low quality, worst quality, blurry, overexposed, photography, photorealistic, 3d render',
        itemBasePrompt:      'item only, product shot, no background, white background, clean illustration, high quality',
        itemNegPrompt:       'person, human, character, body, face, hands, people, crowd, bad anatomy, blurry, low quality, worst quality, watermark, text',
        ctxChapters:         5
    };

    const VN_SETTINGS_PANEL = {

        // ── 讀取設定 ─────────────────────────────────────────────
        load() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : { ...DEFAULTS };
            } catch (e) { return { ...DEFAULTS }; }
        },

        // ── 儲存設定（從 os_settings 的 container 讀取） ─────────
        save(container) {
            const g  = (id) => (container.querySelector(`#vncfg-${id}`)?.value || '').trim();
            const gi = (id, def) => parseInt(container.querySelector(`#vncfg-${id}`)?.value || def) || def;

            const data = {
                bgm:                 g('bgm'),
                sfx:                 g('sfx'),
                spriteBase:          g('sprite'),
                spriteDirect:        container.querySelector('#vncfg-sprite-direct')?.checked === true,
                spriteBatch:         gi('sprite-batch', 1),   // 幾個角色擠一張寬圖一起生（只有官方那顆撐得住，見設置那格）
                stickerBase:         g('sticker'),
                charDefaultBase:     g('char-default-base'),
                finalFallbackSprite: g('final-fallback') || DEFAULTS.finalFallbackSprite,
                avatarBasePrompt:    g('avatar-prompt'),
                avatarNegPrompt:     g('avatar-neg'),
                avatarBasePromptTavern: g('avatar-prompt-tavern'),
                avatarNegPromptTavern:  g('avatar-neg-tavern'),
                bgBasePrompt:        g('bg-prompt'),
                bgNegPrompt:         g('bg-neg'),
                itemBasePrompt:      g('item-prompt'),
                itemNegPrompt:       g('item-neg'),
                ctxChapters:         (() => {                       // 0 要留得住、清空要能表達「全送」
                    const el = container.querySelector('#vncfg-ctx-chapters');
                    if (!el || el.value.trim() === '') return null;      // null＝全送不限制
                    const n = parseInt(el.value);
                    return isNaN(n) ? 5 : Math.max(0, n);
                })()
            };

            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

            // 摘要標記存回 VN_READER 讀的那兩個 key（全系統抓摘要都走它）——留空＝恢復預設 <summary>
            try {
                const so = (container.querySelector('#vncfg-sum-open')?.value || '').trim();
                const sc = (container.querySelector('#vncfg-sum-close')?.value || '').trim();
                if (so && sc) { localStorage.setItem('vn_reader_sum_open', so); localStorage.setItem('vn_reader_sum_close', sc); }
                else { localStorage.removeItem('vn_reader_sum_open'); localStorage.removeItem('vn_reader_sum_close'); }
            } catch (e) {}

            // 若 VN_Config 正在運行，即時同步（下次開啟 VN 時也會重新 load）
            try { if (window.VN_Config?.load) window.VN_Config.load(); } catch (e) {}

            return data;
        },

        // ── 輸出 HTML 字串（供 os_settings launchApp 嵌入）──────
        //   設置 → 一般 拆成小分頁之後，素材目錄與上下文是兩頁，所以分兩支給。
        //   getHTML() 保留＝兩段接起來，給任何還想要一整包的地方用。
        getAssetHTML(d) { return this._build(d).asset; },
        getCtxHTML(d)   { return this._build(d).ctx; },
        getHTML(d)      { const b = this._build(d); return b.asset + b.ctx; },
        _build(d) {
            d = d || this.load();

            // 「Context 保留最近幾章全文」僅獨立(PWA)版本有意義；酒館版由酒館自己管 prompt 注入，隱藏這個設定
            const isStandalone = !!(window.OS_API?.isStandalone?.());
            const _sumDef = (window.VN_READER?.sumDefaults?.()) || { open: '<summary>', close: '</summary>' };
            const _sumNow = (window.VN_READER?.sumMarks?.()) || { open: _sumDef.open, close: _sumDef.close };
            const _sumEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            // 🚨 全系統就這一格：劇情面板與手機 app（微信/微薄/電話/通訊錄）共用同一個數字，
            //    別再為 app 另開一格。幾百輪的量本來就不可能吃全文，預設就是「幾層之後轉摘要」。
            const ctxChaptersBlock = `
        <div class="set-group">
            <div class="set-label"><i class="fa-solid fa-book"></i> 保留最近幾章全文 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">更舊的自動縮成摘要</span></div>
            <input class="set-input" type="number" id="vncfg-ctx-chapters" min="0" max="50" placeholder="5" value="${d.ctxChapters ?? 5}" style="width:120px;">
            <div class="set-desc">建議 3–6 章。手機 app 讀劇情時也吃這一格。設 0 ＝ 全部只讀摘要（最省）；清空 ＝ 全送不限制（很吃 Token）。</div>
        </div>
        <div class="set-group">
            <div class="set-label"><i class="fa-solid fa-bookmark"></i> 摘要標記 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">換了別家 preset 之後填新的</span></div>
            <div class="set-desc" style="margin-bottom:8px;">上面那格要「縮成摘要」時，是靠這對標記把摘要從正文裡撈出來。用別人的 preset 時標籤常常不是 &lt;summary&gt;（有的叫 &lt;meow_FM&gt;、有的叫 &lt;draft&gt;），填錯就撈不到。</div>
            <label class="set-label" style="font-size:11px;">開頭</label>
            <input class="set-input" type="text" id="vncfg-sum-open" spellcheck="false" placeholder="${_sumDef.open}" value="${_sumEsc(_sumNow.open)}" oninput="window.VN_SETTINGS_PANEL.trySum()">
            <label class="set-label" style="font-size:11px; margin-top:8px;">結尾</label>
            <input class="set-input" type="text" id="vncfg-sum-close" spellcheck="false" placeholder="${_sumDef.close}" value="${_sumEsc(_sumNow.close)}" oninput="window.VN_SETTINGS_PANEL.trySum()">
            <div class="set-label" style="font-size:11px; margin-top:8px;">拿最新一章試抓</div>
            <div id="vncfg-sum-preview" class="set-desc" style="min-height:34px; padding:8px 10px; border:1px dashed rgba(26,28,40,0.22); border-radius:6px; white-space:pre-wrap; word-break:break-word;">按上面的欄位就會試抓</div>
        </div>`;

            // BGM／音效清單：素材是自己的，資料夾裡有哪些檔名就寫哪些（AI 只從清單挑）。內容存在 VN 指令（os_vn_rules）。
            //   這裡只放一條入口；清單很長，塞在這一頁裡格子太小改不動 → 點進去是整頁編輯（openLists）。
            const listRow = (group, title) => {
                const VR = this._VR();
                if (!VR || !VR.getLists || !VR.getLists(group).length) return '';
                return `
        <button type="button" class="vncfg-lp-open" data-vr-group="${group}" onclick="window.VN_SETTINGS_PANEL.openLists(this, '${group}')">
            <i class="fa-solid fa-list-ul"></i><span class="vncfg-lp-open-t">${title}</span><span class="vncfg-lp-open-n">${this._listNote(group)}</span><i class="fa-solid fa-chevron-right"></i>
        </button>`;
            };

            const assetHTML = /* html */`
<div style="padding-bottom:4px;">
    <div class="set-group">
        <div class="set-label"><i class="fa-solid fa-music"></i> 遊戲 BGM 目錄</div>
        <input class="set-input" id="vncfg-bgm" placeholder="./bgm/" value="${d.bgm}">
        ${listRow('bgm', 'BGM 清單')}
    </div>

    <div class="set-group">
        <div class="set-label"><i class="fa-solid fa-volume-high"></i> 音效目錄</div>
        <input class="set-input" id="vncfg-sfx" placeholder="./sfx/" value="${d.sfx}">
        ${listRow('sfx', '音效清單')}
    </div>

    <div class="set-group">
        <div class="set-label"><i class="fa-solid fa-image"></i> 立繪目錄</div>
        <input class="set-input" id="vncfg-sprite" placeholder="./sprites/" value="${d.spriteBase}">
    </div>

    <div class="set-group">
        <div class="set-label"><i class="fa-solid fa-face-laugh"></i> 表情包資料夾</div>
        <input class="set-input" id="vncfg-sticker" placeholder="https://cdn.com/stickers/ 或 ./stickers/" value="${d.stickerBase}">
    </div>

    <div class="set-group">
        <div class="set-label"><i class="fa-solid fa-person"></i> 角色預設圖目錄 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">Fallback 1 — 自動拼接 角色名_presets.png</span></div>
        <input class="set-input" id="vncfg-char-default-base" placeholder="./presets/" value="${d.charDefaultBase}">
    </div>

    <div class="set-group">
        <div class="set-label"><i class="fa-solid fa-moon"></i> 最終預設立繪 <span style="font-weight:normal; color:rgba(26,28,40,0.72); font-size:11px;">Fallback 2 — 所有渠道失敗時顯示</span></div>
        <input class="set-input" id="vncfg-final-fallback" placeholder="https://files.catbox.moe/9je7j2.png" value="${d.finalFallbackSprite}">
        <div class="set-desc">建議用透明背景 PNG 剪影。</div>
    </div>
</div>`;
            return { asset: assetHTML, ctx: ctxChaptersBlock };
        },

        // 摘要標記的「試抓」：拿目前欄位去撈最新一章，當場看得到撈不撈得到
        async trySum() {
            const box = document.getElementById('vncfg-sum-preview');
            if (!box) return;
            const o = (document.getElementById('vncfg-sum-open')?.value || '').trim();
            const c = (document.getElementById('vncfg-sum-close')?.value || '').trim();
            if (!window.VN_READER?.sumTry) { box.textContent = '閱讀器模組還沒載入'; return; }
            const r = await window.VN_READER.sumTry(o, c);
            if (r.state === 'ok')            box.textContent = r.text.length > 140 ? r.text.slice(0, 140) + '…' : r.text;
            else if (r.state === 'empty')    box.textContent = '撈到了，但裡面是空的';
            else if (r.state === 'nosample') box.textContent = '目前沒有章節可以試抓';
            else                             box.textContent = '最新一章撈不到 —— 標記填的跟正文對不上';
        },

        // ── BGM／音效清單 ─────────────────────────────────────────
        _VR() { return window.OS_VN_RULES || (window.parent && window.parent.OS_VN_RULES) || null; },
        _listNote(group) {
            const VR = this._VR();
            if (!VR || !VR.getLists) return '';
            const n = VR.getLists(group).filter(l => l.custom).length;
            return n ? '改過 ' + n + ' 份' : '';
        },
        // 一行算一個檔名：空行、# 分組名、<標籤>、### 標題不算
        _countIds(text) {
            return String(text || '').split(/\r?\n/).map(s => s.trim())
                .filter(s => s && s[0] !== '#' && !/^<\/?[^>]*>$/.test(s)).length;
        },
        // 清單編輯頁：蓋在系統設置上面的一整頁（清單很長，要大格子），自己有保存鈕，不跟「保存所有設定」綁。
        //   切換清單時改到一半的留著；有沒存的就按返回，先問一聲。
        openLists(btn, group) {
            try {
                const VR = this._VR();
                if (!VR || !VR.getLists) return;
                const lists = VR.getLists(group);
                if (!lists.length) return;
                const setc = btn.closest('.set-container');
                const host = (setc && setc.parentElement) || btn.ownerDocument.body;
                const doc = host.ownerDocument || document;
                if (getComputedStyle(host).position === 'static') host.classList.add('vncfg-lp-host');
                host.querySelectorAll(':scope > .vncfg-lp').forEach(p => p.remove());

                const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                const norm = s => String(s == null ? '' : s).replace(/\r\n/g, '\n').trim();
                const drafts = {};
                lists.forEach(l => { drafts[l.id] = l.content; });
                let cur = lists[0].id;

                const page = doc.createElement('div');
                page.className = 'vncfg-lp';
                page.innerHTML = `
                    <div class="set-header sysh">
                        <div class="set-back-btn sysh-back vncfg-lp-back">‹</div>
                        <div class="set-title sysh-title">${group === 'bgm' ? 'BGM 清單' : '音效清單'}</div>
                        <div class="sysh-acts"><button type="button" class="vncfg-lp-save">保存</button></div>
                    </div>
                    <div class="vncfg-lp-tabs">${lists.map(l => `<button type="button" class="vncfg-lp-tab" data-id="${l.id}">${esc(l.label)}</button>`).join('')}</div>
                    <div class="vncfg-lp-bar"><span class="vncfg-lp-count"></span><button type="button" class="set-btn vncfg-lp-reset">還原預設</button></div>
                    <textarea class="vncfg-lp-ta" spellcheck="false"></textarea>
                    <div class="vncfg-lp-hint">一行一個檔名，不用加 .mp3，要跟資料夾裡的檔案對得上。</div>`;
                host.appendChild(page);

                const ta = page.querySelector('.vncfg-lp-ta');
                const byId = id => lists.find(l => l.id === id);
                const paint = () => {
                    page.querySelectorAll('.vncfg-lp-tab').forEach(t => {
                        const l = byId(t.dataset.id);
                        t.classList.toggle('is-on', t.dataset.id === cur);
                        t.classList.toggle('is-changed', norm(drafts[l.id]) !== norm(l.defaultContent));
                    });
                    page.querySelector('.vncfg-lp-count').textContent = this._countIds(drafts[cur]) + ' 個檔名';
                };
                const refreshRow = () => {
                    try { doc.querySelectorAll('.vncfg-lp-open[data-vr-group="' + group + '"] .vncfg-lp-open-n').forEach(n => { n.textContent = this._listNote(group); }); } catch (e) {}
                };
                ta.value = drafts[cur];
                paint();

                ta.addEventListener('input', () => { drafts[cur] = ta.value; paint(); });
                page.querySelector('.vncfg-lp-tabs').addEventListener('click', ev => {
                    const t = ev.target.closest('.vncfg-lp-tab');
                    if (!t || t.dataset.id === cur) return;
                    drafts[cur] = ta.value;
                    cur = t.dataset.id;
                    ta.value = drafts[cur];
                    ta.scrollTop = 0;
                    paint();
                });
                page.querySelector('.vncfg-lp-reset').onclick = () => {
                    ta.value = byId(cur).defaultContent;
                    drafts[cur] = ta.value;
                    paint();
                };
                page.querySelector('.vncfg-lp-save').onclick = () => {
                    drafts[cur] = ta.value;
                    let ok = true;
                    lists.forEach(l => {
                        if (!VR.setList(l.id, drafts[l.id])) ok = false;
                        else l.content = drafts[l.id];
                    });
                    const b = page.querySelector('.vncfg-lp-save');
                    if (ok) { b.textContent = '已保存 ✓'; setTimeout(() => { b.textContent = '保存'; }, 1200); }
                    refreshRow();
                };
                page.querySelector('.vncfg-lp-back').onclick = async () => {
                    try {
                        drafts[cur] = ta.value;
                        if (lists.some(l => drafts[l.id] !== l.content)) {
                            const A = window.AUI || (window.parent && window.parent.AUI);
                            if (A && A.confirm && !(await A.confirm('還沒保存，確定要離開嗎？'))) return;
                        }
                        page.remove();
                        refreshRow();
                    } catch (e) { console.warn('[VN設置] 關閉清單頁失敗:', e); page.remove(); }
                };
            } catch (e) { console.warn('[VN設置] 打開清單頁失敗:', e); }
        }
    };

    window.VN_SETTINGS_PANEL = VN_SETTINGS_PANEL;

})();
