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
        caps: { base: 40, progress: 30, goal: 30, event: 20 },   // 估值每格上限（achv 格已退役：成就改白兔櫃檯逐筆兌換，免雙重計價）
        totalCap: 120,          // 單章總額上限
        achvCaps: { normal: 15, great: 40, legend: 100 },   // 白兔成就估值量級（普通/亮眼/值得紀念）
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
            '',
            '嚴格只輸出這個 JSON 結構（數字自行依內容填）：',
            '{"base":0,"progress":0,"goal":0,"event":0}',
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
        return { base: PT_CFG.caps.base, progress: bonus, goal: 0, event: 0, _fallback: true };
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
        };
        let total = items.base + items.progress + items.goal + items.event;
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
            // 🚨 別放畫面底部中央：那裡是 VN 的對話框與 LOG/COT/SKIP 那排，結算卡會整個壓上去。
            //    改成右上角、退出鈕下面那塊空白；窄螢幕(手機)退回頂部橫幅，不去擠立繪。
            // 🚨 position:fixed=釘整個瀏覽器視窗——PWA滿版沒差,酒館裡VN是窗口→卡片飄到窗口外。
            //    掛進 #page-game 時改 absolute 貼舞台右上(設定/退出鈕下方);找不到舞台才退回 fixed。
            '#page-game .os-pt-card{position:absolute;top:110px;right:14px;}',
            '.os-pt-card{position:fixed;right:16px;top:84px;transform:translateY(-12px);',
            'z-index:2147483600;min-width:240px;max-width:min(86vw,340px);opacity:0;pointer-events:auto;',
            'background:linear-gradient(160deg,#2a2340,#1b1830);color:#f3eefe;border:1px solid rgba(180,150,255,.35);',
            'border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.5);padding:16px 18px;font-size:14px;',
            'transition:opacity .35s ease,transform .35s ease;font-family:inherit;}',
            '.os-pt-card.on{opacity:1;transform:translateY(0);}',
            '@media(max-width:620px){.os-pt-card{right:8px;left:8px;top:64px;max-width:none;min-width:0;}}',
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
            // 交易所面板的樣式在 css/os_exchange.css（阿洛拆件版），這裡只留 VN 結算卡
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
        (document.getElementById('page-game') || document.body).appendChild(card);
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

    // ── 白兔成就估值：正派櫃檯收「非異常系」成就，換 PT ──────
    // 分工：異常系(emotion 歸屬=cheshire)歸 404 柴郡換碎片(os_404_store)；其餘全歸這裡。
    // list 可指定要兌換哪幾個(收藏冊單票領取用)；不給=撈全部白兔側 pending。
    function _rabbitPending() {
        const vp = window.VoidPanels || win.VoidPanels;
        const ach = win.OS_ACHIEVEMENT || window.OS_ACHIEVEMENT;
        const all = ach && ach.getPending ? ach.getPending() : [];
        if (!vp || !vp.emotionOwner) return all;   // 分流表沒載到→照舊全收，別把兌換卡死
        return all.filter(a => vp.emotionOwner(a.emotion) !== 'cheshire');
    }
    async function evaluateAchievementsPT(list) {
        const pending = (Array.isArray(list) && list.length) ? list : _rabbitPending();
        if (!pending.length) return { ok: false, msg: '目前沒有白兔要收的成就' };
        const api = win.OS_API || window.OS_API;
        if (!api) return { ok: false, msg: 'API 尚未初始化' };

        const cc = PT_CFG.achvCaps;
        const achList = pending.map((a, i) =>
            `${i + 1}. 成就名稱：「${a.name}」\n   描述：${a.desc || '（無描述）'}`
        ).join('\n');
        // 白兔的人格（點評口吻）：跟大廳那份同一個人，這裡只取估值櫃檯用得到的部分。
        // 使用者在「大廳設置 → 人設 → 白兔先生」填的補充，兩邊共用同一槽。
        const rabbitExtra = (() => {
            try { return (win.OS_PROMPTS?.loadRabbit?.() || '').trim(); } catch (e) { return ''; }
        })();
        const RABBIT_VOICE =
            '你不擺架子、不勸說、不奉承，只把價碼算清楚攤在客人面前。' +
            '點評一句話講完：精算、守時、帶一點看戲的興味；漂亮的操作你不吝於承認，蠢事你也會禮貌地記上一筆。' +
            '難聽的話要包成客氣的提醒，但不要因此說得含糊。';
        const systemPrompt = '你是「白兔先生 (Mr. White Rabbit)」——交易區「交易所」的職員，斯文、守時、照章辦事。' +
            RABBIT_VOICE + (rabbitExtra ? `\n【補充人設】\n${rabbitExtra}\n` : '') +
            `你的工作是替客人「估值」他們在故事中達成的成就，換算成正派貨幣「PT」。` +
            `評分標準：日常小事 5~${cc.normal} PT，亮眼表現 ${cc.normal + 5}~${cc.great} PT，值得紀念的里程碑 ${cc.great + 10}~${cc.legend} PT。` +
            '請以 JSON 陣列格式回覆，每筆格式如下：' +
            '{"name":"成就名稱","pt":整數,"comment":"白兔先生的一句話點評"}' +
            '只回傳 JSON 陣列，不要加任何 markdown 或說明文字。';
        const userPrompt = `以下是待估值的成就清單：\n${achList}\n\n請逐一估值並回傳 JSON 陣列。`;

        try {
            // 估值是工具型呼叫：只送成就清單，不走 buildContext。
            // buildContext 會把人設、整段劇情歷史、AVS 變數全塞進來（單次三萬多 token），
            // 而待估值的成就是跨卡累積的，當前這張卡的劇情反而對不上多數成就。
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userPrompt },
            ];
            const OS = win.OS_SETTINGS || window.OS_SETTINGS;
            const config = OS ? { ...OS.getConfig(), route: 'rabbit_eval' } : { route: 'rabbit_eval' };
            const raw = await new Promise((res, rej) => api.chat(messages, config, null, res, rej));

            let results = null;
            try {
                const jsonMatch = String(raw || '').match(/\[[\s\S]*\]/);
                results = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
            } catch (e) {
                console.error('[PT] 白兔估值 JSON 解析失敗:', e, raw);
                return { ok: false, msg: 'API 回傳格式錯誤，白兔先生先去對錶了' };
            }
            if (!results || !Array.isArray(results)) return { ok: false, msg: '白兔先生沒有回應…' };

            const achApi = win.OS_ACHIEVEMENT || window.OS_ACHIEVEMENT;
            let totalPT = 0;
            for (const r of results) {
                const a = pending.find(x => x.name === r.name);
                if (!a) continue;
                const pt = Math.max(0, Math.min(cc.legend + 20, parseInt(r.pt) || 0));   // 單筆封頂防暴走
                await achApi.markRedeemed(a.id, pt, 'pt', r.comment);
                totalPT += pt;
            }
            if (totalPT > 0) await addPT(totalPT, { reason: '成就兌換（交易所）' });
            console.log(`[PT] 白兔估值完成，共兌換 ${totalPT} PT`);
            return { ok: true, results, totalPT };
        } catch (e) {
            console.error('[PT] evaluateAchievementsPT 失敗:', e);
            return { ok: false, msg: '系統異常：' + (e.message || e) };
        }
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
        dock.className = 'osx-dock';
        dock.innerHTML =
            '<div class="osx-frame" role="dialog" aria-label="量子交易所">' +
              '<div class="osx-plate"></div>' +
              '<button class="osx-close" type="button" title="關閉"><i class="fa-solid fa-xmark"></i></button>' +
              '<div class="osx-title"><span class="zh">量子交易所</span>' +
                '<span class="en">AURELIA PARALLAX EXCHANGE</span></div>' +
              '<div class="osx-bal"><span class="osx-bal-coin"></span>' +
                '<span class="osx-bal-n" id="os-pt-shop-bal">…</span><span class="osx-bal-u">PT</span></div>' +
              '<div class="osx-stage"></div>' +
              '<div class="osx-cards" id="os-pt-shop-items"></div>' +
              '<div class="osx-rail"><span class="osx-rail-ic"><i class="fa-solid fa-hourglass-half"></i></span>' +
                '<span class="osx-rail-tx"><span class="t">交易所狀態</span>' +
                '<span class="m" id="os-pt-shop-msg">白兔先生在櫃檯，隨時可以替你估值。</span></span></div>' +
            '</div>';
        host.appendChild(dock);
        requestAnimationFrame(() => dock.classList.add('on'));
        dock.querySelector('.osx-close').addEventListener('click', () => {
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

        const houseBtn = built
            ? '<button class="osx-card-btn owned" disabled>已擁有</button>'
            : '<button class="osx-card-btn" id="os-pt-buy-house"' + (canBuy ? '' : ' disabled') + '>' + price + ' PT</button>';

        // 成就兌換：白兔只收「非異常系」成就，估值換 PT（異常系歸 404 柴郡換碎片）
        const pendingN = _rabbitPending().length;
        const achBtn = pendingN
            ? '<button class="osx-card-btn gold" id="os-pt-redeem-ach">兌換 ' + pendingN + ' 個</button>'
            : '<button class="osx-card-btn locked" disabled>沒有待估值</button>';

        itemsEl.innerHTML =
            '<div class="osx-card left" title="在視差城市擁有一間屬於自己的房子。">' +
              '<span class="osx-node">1</span>' +
              '<span class="osx-card-name">蓋你的房</span>' + houseBtn +
            '</div>' +
            '<div class="osx-card center" title="異常成就請找 404 號房的柴郡">' +
              '<span class="osx-node">2</span>' +
              '<span class="osx-card-name">成就兌換</span>' + achBtn +
            '</div>' +
            '<div class="osx-card right locked" title="之後會開">' +
              '<span class="osx-node">3</span>' +
              '<span class="osx-card-name">限時商品</span>' +
              '<button class="osx-card-btn locked" disabled>敬請期待</button>' +
            '</div>';

        if (msgEl) {
            msgEl.className = 'm';
            msgEl.textContent = built
                ? (pendingN ? ('白兔先生的櫃檯上有 ' + pendingN + ' 個成就等著估值。') : '白兔先生在櫃檯，隨時可以替你估值。')
                : (canBuy ? '餘額足夠蓋房，隨時可以簽約。' : ('離蓋房還差 ' + (price - bal) + ' PT。'));
        }

        const buyBtn = mask.querySelector('#os-pt-buy-house');
        if (buyBtn) buyBtn.addEventListener('click', async () => {
            buyBtn.disabled = true;
            const r = await spendPT(price, '購買玩家房');
            if (!r.ok) {
                if (msgEl) { msgEl.className = 'm bad'; msgEl.textContent = '還差 ' + r.short + ' PT。'; }
                buyBtn.disabled = false;
                return;
            }
            await setPlotBuilt('player', true);
            if (msgEl) { msgEl.className = 'm ok'; msgEl.textContent = '簽約完成，你在視差城市有家了。'; }
            try { window.dispatchEvent(new CustomEvent('os-pt-plot-changed', { detail: { plotId: 'player', built: true } })); } catch (e) {}
            await _renderShopBody(mask);   // 重繪：餘額↓、按鈕→已擁有
        });

        const redeemBtn = mask.querySelector('#os-pt-redeem-ach');
        if (redeemBtn) redeemBtn.addEventListener('click', async () => {
            redeemBtn.disabled = true;
            redeemBtn.textContent = '估值中…';
            if (msgEl) { msgEl.className = 'm'; msgEl.textContent = '白兔先生正在替你的成就估值，稍等…'; }
            const r = await evaluateAchievementsPT();
            if (!r.ok) {
                if (msgEl) { msgEl.className = 'm bad'; msgEl.textContent = r.msg || '估值失敗，再試一次'; }
                redeemBtn.disabled = false;
                redeemBtn.textContent = '兌換';
                return;
            }
            try { window.VoidPanels?.refreshAchievement?.(); } catch (e) {}
            await _renderShopBody(mask);   // 先重繪(會清 msg、更新錢包)再寫結果，成功訊息才留得住
            const _m = mask.querySelector('#os-pt-shop-msg');
            if (_m) { _m.className = 'm ok'; _m.textContent = '蓋章完成，入帳 ' + r.totalPT + ' PT。點評寫在成就票券上了。'; }
        });
    }

    // ── 對外 API ─────────────────────────────────────────
    win.OS_PT = {
        getPT, addPT, spendPT, getLedger,
        getPlotBuilt, setPlotBuilt,
        settleSummary,
        evaluateAchievementsPT,
        openExchange, closeExchange,
        _cfg: PT_CFG,
        _showSettleCard,   // 診斷用：不跑結算也能把卡叫出來看位置
    };
    if (win !== window) { try { window.OS_PT = win.OS_PT; } catch (e) {} }

    // 城市交易所門觸發 → 開面板（lobby_stage 走門時 dispatch）
    window.addEventListener('lstage-open-exchange', () => { try { openExchange(); } catch (e) { console.warn('[PT] 開交易所失敗', e); } });

    console.log('[PT] ✅ 交易區經濟系統就緒');
})();
