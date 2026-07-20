// ----------------------------------------------------------------
// [檔案] os_pt.js
// 路徑：os_phone/os/os_pt.js
// 職責：視差城市「PT 正派經濟」——錢包存取層 + 大總結結算估值 + VN 結算卡 + 交易所面板 + 地塊 built 狀態。
//   PT ＝交易區的正派貨幣，跟柴郡黑市的💎碎片(os_404_store)完全分開、互不換算。
//   賺＝每份大總結生成後跑一次結算(副模型直連估值，不發 GENERATION_*、不觸發 AVS)。
//   花＝走到城市交易所建築彈面板買房。存 OS_DB app_data store(不動 schema、免升版 deadlock)。
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[PT] 載入交易區經濟系統...');
    const win = window.parent || window;

    // ── 可調參數集中一處 ─────────────────────────────────
    const PT_CFG = {
        caps: { base: 40, progress: 30, goal: 30, event: 20, achv: 20 },   // 估值每格上限
        totalCap: 140,          // 單章總額上限
        fallbackPerK: 2,        // 解析失敗退機械底：每 1000 字給 2 PT
        fallbackCap: 20,        // 機械底(字數部分)上限
        housePrice: 1000,       // 玩家房價
        ledgerCap: 100,         // ledger 保留筆數
    };

    const APP_ID = 'pt_wallet';   // OS_DB app_data 命名空間
    const K_BALANCE = 'balance';
    const K_LEDGER = 'ledger';
    const K_SETTLED = 'settled';  // 每卡已結算到的最高 summaryCount：settled::<chatId>
    const K_PLOT = 'plot';        // 地塊 built 狀態：plot::<plotId> = true

    function _db() { return win.OS_DB || (window.OS_DB); }

    // ── 錢包存取層 ───────────────────────────────────────
    async function getPT() {
        try {
            const db = _db();
            if (!db?.getAppData) return 0;
            const v = await db.getAppData(APP_ID, K_BALANCE);   // global scope：跨劇情共用一份
            const n = Number(v);
            return isFinite(n) && n > 0 ? Math.floor(n) : 0;
        } catch (e) { console.warn('[PT] getPT 失敗', e); return 0; }
    }

    async function _setPT(n) {
        const db = _db();
        if (!db?.saveAppData) throw new Error('OS_DB.saveAppData 不存在');
        await db.saveAppData(APP_ID, K_BALANCE, Math.max(0, Math.floor(n)));
    }

    async function getLedger() {
        try {
            const db = _db();
            if (!db?.getAppData) return [];
            const v = await db.getAppData(APP_ID, K_LEDGER);
            return Array.isArray(v) ? v : [];
        } catch (e) { return []; }
    }

    async function _pushLedger(entry) {
        try {
            const db = _db();
            if (!db?.saveAppData) return;
            const list = await getLedger();
            list.unshift(entry);                        // 最新在前
            if (list.length > PT_CFG.ledgerCap) list.length = PT_CFG.ledgerCap;
            await db.saveAppData(APP_ID, K_LEDGER, list);
        } catch (e) { console.warn('[PT] 寫 ledger 失敗', e); }
    }

    // 加 PT（reason 進 ledger；items＝結算明細，給 VN 卡攤開）
    async function addPT(n, meta) {
        n = Math.floor(Number(n) || 0);
        if (n <= 0) return await getPT();
        const cur = await getPT();
        const next = cur + n;
        await _setPT(next);
        await _pushLedger({ ts: _now(), delta: n, reason: (meta && meta.reason) || '結算', items: (meta && meta.items) || null, balanceAfter: next });
        return next;
    }

    // 花 PT：夠才扣，回傳 { ok, balance, short }
    async function spendPT(n, reason) {
        n = Math.floor(Number(n) || 0);
        const cur = await getPT();
        if (n <= 0) return { ok: false, balance: cur, short: 0 };
        if (cur < n) return { ok: false, balance: cur, short: n - cur };
        const next = cur - n;
        await _setPT(next);
        await _pushLedger({ ts: _now(), delta: -n, reason: reason || '消費', balanceAfter: next });
        return { ok: true, balance: next, short: 0 };
    }

    function _now() { try { return Date.now(); } catch (e) { return 0; } }

    // ── 地塊 built 狀態 ──────────────────────────────────
    async function getPlotBuilt(plotId) {
        try {
            const db = _db();
            if (!db?.getAppData) return false;
            const v = await db.getAppData(APP_ID, K_PLOT + '::' + String(plotId || 'player'));
            return v === true || v === 1 || v === 'true';
        } catch (e) { return false; }
    }
    async function setPlotBuilt(plotId, built) {
        const db = _db();
        if (!db?.saveAppData) throw new Error('OS_DB.saveAppData 不存在');
        await db.saveAppData(APP_ID, K_PLOT + '::' + String(plotId || 'player'), !!built);
    }

    // ── JSON 三段式容錯解析（仿 state_runtime.extractJSON）──
    function _extractJSON(text) {
        if (!text) return null;
        try { return JSON.parse(text); } catch (e) {}
        const fence = String(text).match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fence) { try { return JSON.parse(fence[1]); } catch (e) {} }
        const brace = String(text).match(/\{[\s\S]*\}/);
        if (brace) { try { return JSON.parse(brace[0]); } catch (e) {} }
        return null;
    }

    // ── 估值 prompt（結構化，只寫規則+佔位，不塞任何範例故事）──
    function _buildValuationPrompt(text) {
        const c = PT_CFG.caps;
        return [
            '你是「交易區」的經濟監管系統。以下三引號內是一名玩家近期經歷的「大總結」全文。',
            '請以系統監管、客觀第三方的角度，估算這段經歷值多少「正派貨幣 PT」。只輸出 JSON，不要任何解說文字。',
            '',
            '評分分五個區塊，各有上限；超過上限一律以上限計，沒有對應內容就給 0：',
            `- base：只要這段有實質推進就給的基礎值，固定 ${c.base}`,
            `- progress：劇情整體推進的幅度，0 ~ ${c.progress}`,
            `- goal：明確目標或任務的達成程度，0 ~ ${c.goal}`,
            `- event：關係轉折或重要事件的份量，0 ~ ${c.event}`,
            `- achv：這段期間達成成就的紅利，0 ~ ${c.achv}`,
            '',
            '嚴格只輸出這個 JSON 結構（數字自行依內容填）：',
            '{"base":0,"progress":0,"goal":0,"event":0,"achv":0}',
            '',
            '大總結全文：',
            '"""',
            String(text || '').slice(0, 8000),
            '"""',
        ].join('\n');
    }

    // 機械底退路：只給 base + 依字數的小額（封頂）
    function _mechanicalFallback(text) {
        const words = String(text || '').length;
        const bonus = Math.min(PT_CFG.fallbackCap, Math.floor(words / 1000) * PT_CFG.fallbackPerK);
        return { base: PT_CFG.caps.base, progress: bonus, goal: 0, event: 0, achv: 0, _fallback: true };
    }

    // clamp 每格 + 加總封頂，回傳 { items:{...}, total }
    function _scoreToTotal(raw) {
        const c = PT_CFG.caps;
        const clamp = (v, cap) => Math.max(0, Math.min(cap, Math.floor(Number(v) || 0)));
        const items = {
            base: clamp(raw.base, c.base),
            progress: clamp(raw.progress, c.progress),
            goal: clamp(raw.goal, c.goal),
            event: clamp(raw.event, c.event),
            achv: clamp(raw.achv, c.achv),
        };
        let total = items.base + items.progress + items.goal + items.event + items.achv;
        total = Math.min(PT_CFG.totalCap, total);
        return { items, total };
    }

    // ── 副模型直連估值（仿 _summarizeTheater：不發 GENERATION_*、不觸發 AVS/總結）──
    async function _valuate(text) {
        const api = win.OS_API || window.OS_API;
        if (!api || !api.chat) return _mechanicalFallback(text);
        try {
            let config = {};
            const OS = win.OS_SETTINGS || window.OS_SETTINGS;
            if (OS) {
                const sec = OS.getSecondaryConfig ? OS.getSecondaryConfig() : null;
                config = (sec && (sec.key || (sec.useSystemApi && sec.stProfileId))) ? sec : OS.getConfig();
            }
            config = config || {};
            config.route = 'pt_valuation';
            const prompt = _buildValuationPrompt(text);
            const raw = await new Promise((resolve, reject) => {
                api.chat([{ role: 'system', content: prompt }], config, null, resolve, reject, { label: 'PT結算估值', keepCodeFences: true });
            });
            const json = _extractJSON(raw);
            if (!json || typeof json !== 'object') { console.warn('[PT] 估值回傳無法解析，退機械底'); return _mechanicalFallback(text); }
            return json;
        } catch (e) {
            console.warn('[PT] 估值 API 失敗，退機械底', e);
            return _mechanicalFallback(text);
        }
    }

    // ── 結算入口：每份大總結生成後由 os_story_tools fire-and-forget 呼叫 ──
    let _settling = false;
    async function settleSummary(finalContent, ctx) {
        ctx = ctx || {};
        const chatId = String(ctx.chatId || '');
        const summaryCount = Number(ctx.summaryCount || 0);
        if (!chatId || !summaryCount) { console.warn('[PT] 結算缺 chatId/summaryCount，跳過'); return; }
        if (_settling) return;   // 併發閂：同時只結算一份
        _settling = true;
        try {
            const db = _db();
            // 去重：同一份大總結(chatId+summaryCount)只結算一次
            const settledKey = K_SETTLED + '::' + chatId;
            let lastSettled = 0;
            try { lastSettled = Number(await db.getAppData(APP_ID, settledKey)) || 0; } catch (e) {}
            if (summaryCount <= lastSettled) { console.log('[PT] 第' + summaryCount + '份已結算過，跳過'); return; }

            const raw = await _valuate(finalContent);
            const { items, total } = _scoreToTotal(raw);
            const balance = await addPT(total, { reason: '本章結算(第' + summaryCount + '份)', items });
            await db.saveAppData(APP_ID, settledKey, summaryCount);   // 標記已結算
            console.log('[PT] ✅ 第' + summaryCount + '份結算 +' + total + ' PT（餘額 ' + balance + '）', items);
            try { _showSettleCard({ items, total, balance, fallback: !!raw._fallback }); } catch (e) { console.warn('[PT] 結算卡失敗', e); }
        } catch (e) {
            console.error('[PT] 結算失敗', e);
        } finally {
            _settling = false;
        }
    }

    // ── 樣式注入（一次；classes，不用 inline style=）──
    function _injectStyle() {
        if (document.getElementById('os-pt-style')) return;
        const s = document.createElement('style');
        s.id = 'os-pt-style';
        s.textContent = [
            '.os-pt-card{position:fixed;left:50%;bottom:36px;transform:translateX(-50%) translateY(20px);',
            'z-index:2147483600;min-width:280px;max-width:min(92vw,420px);opacity:0;pointer-events:auto;',
            'background:linear-gradient(160deg,#2a2340,#1b1830);color:#f3eefe;border:1px solid rgba(180,150,255,.35);',
            'border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.5);padding:16px 18px;font-size:14px;',
            'transition:opacity .35s ease,transform .35s ease;font-family:inherit;}',
            '.os-pt-card.on{opacity:1;transform:translateX(-50%) translateY(0);}',
            '.os-pt-card-head{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;margin-bottom:10px;color:#e9dcff;}',
            '.os-pt-card-head i{color:#c9a6ff;}',
            '.os-pt-card-close{margin-left:auto;cursor:pointer;opacity:.6;padding:2px 6px;border-radius:8px;}',
            '.os-pt-card-close:hover{opacity:1;background:rgba(255,255,255,.1);}',
            '.os-pt-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;color:#cfc4e6;}',
            '.os-pt-row .v{font-variant-numeric:tabular-nums;color:#b9f6c8;}',
            '.os-pt-row.zero .v{color:#8a8298;}',
            '.os-pt-total{display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:10px;',
            'border-top:1px solid rgba(180,150,255,.25);font-weight:700;font-size:16px;}',
            '.os-pt-total .v{color:#ffe28a;font-variant-numeric:tabular-nums;}',
            '.os-pt-bal{margin-top:8px;text-align:right;font-size:12px;color:#9d94b5;}',
            '.os-pt-bal i{color:#ffe28a;margin-right:4px;}',
            '.os-pt-note{margin-top:6px;font-size:11px;color:#8a8298;font-style:italic;}',
            // 交易所面板：白色系、貼遊戲畫面右內側（跟白兔對話時浮出）
            '.os-pt-dock{position:absolute;right:max(4%, calc(50% - 360px));top:50%;transform:translateY(-50%);z-index:80;width:min(38%,320px);max-height:68%;overflow:auto;',   /* 寬螢幕貼近中間+垂直置中;窄螢幕退回貼邊 */
            'opacity:0;transform:translateX(24px);transition:opacity .28s ease,transform .28s ease;}',
            '.os-pt-dock.on{opacity:1;transform:translateX(0);}',
            '@media (max-width:680px){' +
              '.os-pt-dock{right:12px;left:12px;width:auto;top:7%;bottom:auto;max-height:72%;}' +   /* 📱 面板站前排放大 */
              '.void-dock-open #iris-avatar{opacity:.25;filter:brightness(.55) blur(1px);transition:opacity .25s;}' +   /* 立繪退後變暗 */
            '}',
            '.os-pt-shop{width:100%;background:rgba(255,255,255,.95);',
            'border:1px solid rgba(120,150,210,.35);border-radius:18px;box-shadow:0 16px 44px rgba(40,60,110,.26);',
            'padding:18px 18px 15px;color:#2b3652;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}',
            '.os-pt-shop-head{display:flex;align-items:center;gap:9px;margin-bottom:4px;}',
            '.os-pt-shop-head i{color:#5b7fd0;}',
            '.os-pt-shop-head .t{font-size:18px;font-weight:800;letter-spacing:.5px;color:#233152;}',
            '.os-pt-shop-head .x{margin-left:auto;cursor:pointer;opacity:.5;font-size:18px;padding:4px 8px;border-radius:10px;color:#5a6784;}',
            '.os-pt-shop-head .x:hover{opacity:1;background:rgba(70,100,170,.1);}',
            '.os-pt-shop-sub{font-size:12px;color:#6d7791;margin-bottom:14px;}',
            '.os-pt-wallet{display:flex;align-items:center;gap:8px;justify-content:center;margin:6px 0 16px;',
            'padding:12px;border-radius:14px;background:linear-gradient(120deg,rgba(255,208,110,.18),rgba(120,160,230,.12));border:1px solid rgba(220,180,90,.4);}',
            '.os-pt-wallet i{color:#e0a52e;font-size:20px;}',
            '.os-pt-wallet .n{font-size:25px;font-weight:800;color:#c98a1e;font-variant-numeric:tabular-nums;}',
            '.os-pt-wallet .u{font-size:13px;color:#7a86a0;align-self:flex-end;margin-bottom:3px;}',
            '.os-pt-item{display:flex;align-items:center;gap:12px;padding:13px;border-radius:15px;',
            'background:rgba(90,130,210,.07);border:1px solid rgba(120,150,210,.22);margin-bottom:10px;}',
            '.os-pt-item .ic{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;',
            'background:rgba(90,130,210,.14);color:#4f74c8;font-size:21px;flex:0 0 auto;}',
            '.os-pt-item .body{flex:1;min-width:0;}',
            '.os-pt-item .body .n{font-weight:700;font-size:15px;color:#28324c;}',
            '.os-pt-item .body .d{font-size:12px;color:#6d7791;margin-top:2px;}',
            '.os-pt-buy{flex:0 0 auto;border:none;cursor:pointer;border-radius:12px;padding:9px 15px;font-size:14px;font-weight:700;',
            'font-family:inherit;background:linear-gradient(135deg,#6a9be0,#4a78d8);color:#fff;transition:filter .2s,opacity .2s;box-shadow:0 4px 12px rgba(74,120,216,.35);}',
            '.os-pt-buy:hover{filter:brightness(1.08);}',
            '.os-pt-buy:disabled{cursor:default;opacity:.5;filter:grayscale(.3);box-shadow:none;}',
            '.os-pt-buy.owned{background:rgba(90,180,120,.16);color:#2e8a52;box-shadow:none;}',
            '.os-pt-shop-msg{min-height:18px;text-align:center;font-size:12.5px;margin-top:6px;color:#d3475f;}',
            '.os-pt-shop-msg.ok{color:#2e8a52;}',
        ].join('');
        document.head.appendChild(s);
    }

    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    // ── VN 結算卡（自建浮層：不走 _showDomBlock 以免觸發 VN next() 續播）──
    function _showSettleCard(data) {
        _injectStyle();
        const old = document.getElementById('os-pt-settle-card');
        if (old) old.remove();
        const it = data.items || {};
        const rows = [
            { k: 'base', label: '基礎', icon: 'fa-seedling' },
            { k: 'progress', label: '推進', icon: 'fa-arrow-trend-up' },
            { k: 'goal', label: '目標', icon: 'fa-bullseye' },
            { k: 'event', label: '事件', icon: 'fa-bolt' },
            { k: 'achv', label: '成就', icon: 'fa-trophy' },
        ];
        const rowHtml = rows.map(r => {
            const v = Math.floor(Number(it[r.k]) || 0);
            return '<div class="os-pt-row' + (v === 0 ? ' zero' : '') + '">' +
                '<span><i class="fa-solid ' + r.icon + '"></i>&nbsp;' + r.label + '</span>' +
                '<span class="v">+' + v + '</span></div>';
        }).join('');
        const card = document.createElement('div');
        card.id = 'os-pt-settle-card';
        card.className = 'os-pt-card';
        card.innerHTML =
            '<div class="os-pt-card-head"><i class="fa-solid fa-chart-line"></i><span>本章結算</span>' +
            '<span class="os-pt-card-close" title="關閉"><i class="fa-solid fa-xmark"></i></span></div>' +
            rowHtml +
            '<div class="os-pt-total"><span>合計</span><span class="v">+' + Math.floor(data.total || 0) + ' PT</span></div>' +
            '<div class="os-pt-bal"><i class="fa-solid fa-coins"></i>餘額 ' + Math.floor(data.balance || 0) + ' PT</div>' +
            (data.fallback ? '<div class="os-pt-note">（估值離線，以基準值結算）</div>' : '');
        document.body.appendChild(card);
        requestAnimationFrame(() => card.classList.add('on'));
        let closed = false;
        const close = () => {
            if (closed) return; closed = true;
            card.classList.remove('on');
            setTimeout(() => card.remove(), 400);
        };
        card.querySelector('.os-pt-card-close').addEventListener('click', close);
        setTimeout(close, 9000);   // 自動收
    }

    // ── 交易所面板 ───────────────────────────────────────
    let _shopOpen = false;
    async function openExchange() {
        if (_shopOpen) return;
        _shopOpen = true;
        _injectStyle();
        const old = document.getElementById('os-pt-shop-dock');
        if (old) old.remove();

        const host = document.querySelector('.lobby-left') || document.body;   // 掛進遊戲容器→貼遊戲畫面內側(非整個視窗，才不會跑到黑邊)
        host.classList.add('void-dock-open');   // 📱 手機:立繪退後變暗、面板站前排
        const dock = document.createElement('div');
        dock.id = 'os-pt-shop-dock';
        dock.className = 'os-pt-dock';
        dock.innerHTML =
            '<div class="os-pt-shop" role="dialog" aria-label="交易所">' +
            '<div class="os-pt-shop-head"><i class="fa-solid fa-store"></i>' +
            '<span class="t">交易所</span><span class="x" title="關閉"><i class="fa-solid fa-xmark"></i></span></div>' +
            '<div class="os-pt-shop-sub">用交易區的 PT，兌換屬於你的一席之地。</div>' +
            '<div class="os-pt-wallet"><i class="fa-solid fa-coins"></i><span class="n" id="os-pt-shop-bal">…</span><span class="u">PT</span></div>' +
            '<div id="os-pt-shop-items"></div>' +
            '<div class="os-pt-shop-msg" id="os-pt-shop-msg"></div>' +
            '</div>';
        host.appendChild(dock);
        requestAnimationFrame(() => dock.classList.add('on'));
        dock.querySelector('.x').addEventListener('click', () => {
            try { if (window.LobbyStage && window.LobbyStage.endTalk) window.LobbyStage.endTalk(); } catch (e) {}   // ✕=離開白兔對話（連帶關面板）
            closeExchange();
        });

        await _renderShopBody(dock);
    }
    // 收起交易所面板（endTalk 時由 lobby_stage 呼叫）
    function closeExchange() {
        _shopOpen = false;
        try { document.querySelector('.lobby-left')?.classList.remove('void-dock-open'); } catch (e) {}
        const el = document.getElementById('os-pt-shop-dock');
        if (el) { el.classList.remove('on'); setTimeout(() => { try { el.remove(); } catch (e) {} }, 250); }
    }

    async function _renderShopBody(mask) {
        const balEl = mask.querySelector('#os-pt-shop-bal');
        const itemsEl = mask.querySelector('#os-pt-shop-items');
        const msgEl = mask.querySelector('#os-pt-shop-msg');
        const bal = await getPT();
        if (balEl) balEl.textContent = String(bal);

        const built = await getPlotBuilt('player');
        const price = PT_CFG.housePrice;
        const canBuy = !built && bal >= price;

        const btn = built
            ? '<button class="os-pt-buy owned" disabled><i class="fa-solid fa-check"></i>&nbsp;已擁有</button>'
            : '<button class="os-pt-buy" id="os-pt-buy-house"' + (canBuy ? '' : ' disabled') + '>' + price + ' PT</button>';

        itemsEl.innerHTML =
            '<div class="os-pt-item">' +
            '<div class="ic"><i class="fa-solid fa-house-chimney"></i></div>' +
            '<div class="body"><div class="n">蓋你的房</div>' +
            '<div class="d">在視差城市擁有一間屬於自己的房子。</div></div>' +
            btn + '</div>';

        if (msgEl) { msgEl.className = 'os-pt-shop-msg'; msgEl.textContent = built ? '' : (canBuy ? '' : ('還差 ' + (price - bal) + ' PT')); }

        const buyBtn = mask.querySelector('#os-pt-buy-house');
        if (buyBtn) buyBtn.addEventListener('click', async () => {
            buyBtn.disabled = true;
            const r = await spendPT(price, '購買玩家房');
            if (!r.ok) {
                if (msgEl) { msgEl.className = 'os-pt-shop-msg'; msgEl.textContent = '還差 ' + r.short + ' PT'; }
                buyBtn.disabled = false;
                return;
            }
            await setPlotBuilt('player', true);
            if (msgEl) { msgEl.className = 'os-pt-shop-msg ok'; msgEl.textContent = '入手了！你在城市有家了。'; }
            try { window.dispatchEvent(new CustomEvent('os-pt-plot-changed', { detail: { plotId: 'player', built: true } })); } catch (e) {}
            await _renderShopBody(mask);   // 重繪：餘額↓、按鈕→已擁有
        });
    }

    // ── 對外 API ─────────────────────────────────────────
    win.OS_PT = {
        getPT, addPT, spendPT, getLedger,
        getPlotBuilt, setPlotBuilt,
        settleSummary,
        openExchange, closeExchange,
        _cfg: PT_CFG,
    };
    if (win !== window) { try { window.OS_PT = win.OS_PT; } catch (e) {} }

    // 城市交易所門觸發 → 開面板（lobby_stage 走門時 dispatch）
    window.addEventListener('lstage-open-exchange', () => { try { openExchange(); } catch (e) { console.warn('[PT] 開交易所失敗', e); } });

    console.log('[PT] ✅ 交易區經濟系統就緒');
})();
