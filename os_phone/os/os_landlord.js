// ----------------------------------------------------------------
// [檔案] os_landlord.js
// 路徑：os_phone/os/os_landlord.js
// 職責：包租婆系統①地基——物業/租客資料、離線補算收租、招租與定調、app 主畫面。
//   成本哲學同書咖：日常收租全本地零 API；只有「租客定調(每人一次)」燒 API 且有本地退路。
//   設計書 docs/landlord_design.md
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const LL_CFG = {
        initialUnits: 2,        // ①期固定 2 戶
        baseRent: 12,           // 每戶每天固定基礎租金(PT)——①期不接係數
        catchUpDays: 7,         // 離線補算上限
        initialTypes: ['cozy', 'deep'],   // 初始兩戶的房型
    };

    const APP_ID = 'landlord';
    const K_STATE = 'state';
    const K_TUNE = 'tune';      // tune::<npcKey>

    function _db() { return win.OS_DB || window.OS_DB; }
    function _now() { try { return Date.now(); } catch (e) { return 0; } }
    // 以「天」為刻度(本地日期)，跟書咖同一招
    function _dayNum(ts) { return Math.floor(ts / 86400000); }

    function _defaultState() {
        const units = [];
        for (let i = 0; i < LL_CFG.initialUnits; i++) {
            units.push({
                id: 'u' + (i + 1),
                roomTypeKey: LL_CFG.initialTypes[i] || 'standard',
                tenantKey: null, tenantName: null,
                rent: LL_CFG.baseRent,
                movedInAt: null,
            });
        }
        return { units: units, lastSettleDay: null, createdAt: _now() };
    }

    // 🚨區分「查無資料」與「讀取失敗」：前者安全(建預設值並寫入),後者危險(絕不可寫入,一律往外拋)。
    //   OS_DB.getAppData 的合約是:記錄真的不存在時回傳 null/undefined,讀取本身出錯則 reject。
    async function getState() {
        const db = _db();
        if (!db?.getAppData) throw new Error('OS_DB.getAppData 不存在');
        let v;
        try {
            v = await db.getAppData(APP_ID, K_STATE);
        } catch (e) {
            console.warn('[Landlord] getState 讀取失敗,拒絕以預設值覆蓋,原樣往外拋', e);
            throw e;
        }
        if (v && Array.isArray(v.units) && v.units.length) return v;
        // 走到這裡代表「查無資料」(讀取本身沒出錯,只是還沒有記錄)→ 安全,建立預設值並寫入
        const fresh = _defaultState();
        await saveState(fresh);
        return fresh;
    }

    async function saveState(state) {
        const db = _db();
        if (!db?.saveAppData) throw new Error('OS_DB.saveAppData 不存在');
        await db.saveAppData(APP_ID, K_STATE, state);
    }

    async function getTuning(npcKey) {
        try {
            const db = _db();
            if (!db?.getAppData) return null;
            return (await db.getAppData(APP_ID, K_TUNE + '::' + String(npcKey))) || null;
        } catch (e) { return null; }
    }

    async function saveTuning(npcKey, tuning) {
        const db = _db();
        if (!db?.saveAppData) return;
        await db.saveAppData(APP_ID, K_TUNE + '::' + String(npcKey), tuning);
    }

    // ── 離線補算(旅行青蛙式)：純函式,不碰 DB/DOM,好驗 ──
    function settleCore(state, todayDay) {
        const s = JSON.parse(JSON.stringify(state));
        if (s.lastSettleDay === null || s.lastSettleDay === undefined) {
            s.lastSettleDay = todayDay;
            return { state: s, days: 0, earned: 0, perUnit: [] };
        }
        let days = todayDay - s.lastSettleDay;
        if (days <= 0) return { state: s, days: 0, earned: 0, perUnit: [] };
        if (days > LL_CFG.catchUpDays) days = LL_CFG.catchUpDays;   // 封頂,防久未開啟爆量

        const perUnit = [];
        let earned = 0;
        s.units.forEach(function (u) {
            if (!u.tenantKey) return;                 // 空戶不收租
            const amount = (u.rent || 0) * days;
            if (amount <= 0) return;
            earned += amount;
            perUnit.push({ unitId: u.id, tenantName: u.tenantName || '房客', amount: amount });
        });
        s.lastSettleDay = todayDay;
        return { state: s, days: days, earned: earned, perUnit: perUnit };
    }

    // ── 招租：候選名冊(沿用書咖的顧客名冊來源) ──
    async function listCandidates() {
        let roster = [];
        try {
            const ln = win.LobbyNpcs || window.LobbyNpcs;
            if (ln && typeof ln.cafeRoster === 'function') roster = (await ln.cafeRoster()) || [];
        } catch (e) { console.warn('[Landlord] 讀名冊失敗', e); }
        const out = [];
        for (const r of roster) {
            if (!r || !r.key) continue;
            out.push({ key: r.key, name: r.name || '無名', persona: r.persona || '', tuned: _isValidTuning(await getTuning(r.key)) });
        }
        return out;
    }

    // 本地退路：沒 API 或解析失敗時,依名字雜湊穩定挑一款房型(同一人每次結果一致)
    function _fallbackTuning(npc) {
        const keys = Object.keys((win.OS_ROOM_SVG && win.OS_ROOM_SVG.ROOM_TYPES) || { standard: 1 });
        const name = String((npc && npc.key) || (npc && npc.name) || '');
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
        return { idealTypeKey: keys[h % keys.length], rentTolerance: 0.6, habitTags: [] };
    }

    // ── 快取有效性判斷（修正#2）──
    // 檢查：t 存在、idealTypeKey 有值、房型清單存在時該 key 必須在清單內
    // 房型清單尚未載入時不判定為無效，防止重複燒 API
    function _isValidTuning(t) {
        if (!t || !t.idealTypeKey) return false;
        const RT = (win.OS_ROOM_SVG && win.OS_ROOM_SVG.ROOM_TYPES);
        if (!RT) return true;  // 房型清單還沒載入，保守判定為有效(不重複燒 API)
        return !!RT[t.idealTypeKey];
    }

    function _tuneMessages(npc) {
        const RT = (win.OS_ROOM_SVG && win.OS_ROOM_SVG.ROOM_TYPES) || {};
        const list = Object.keys(RT).map(k => '    ' + k + '　＝　' + (RT[k].desc || '')).join('\n');
        const sys = [
            '你是租客分析器。讀一份角色人設，判斷這位角色會想住哪一種房，只回傳純 JSON、不要解釋、不要 markdown：',
            '{"idealTypeKey":"<從下面清單挑一個 KEY>","rentTolerance":<0到1的小數，越高越付得起房租>,"habitTags":["<兩三個生活習性標籤>"]}',
            '房型清單（只准從中挑一個 KEY）：',
            list,
        ].join('\n');
        return [
            { role: 'system', content: sys },
            { role: 'user', content: '角色人設：\n' + String((npc && npc.persona) || (npc && npc.name) || '').slice(0, 800) },
        ];
    }

    // 定調：每人只燒一次 API；有快取先回快取；失敗一律回 fallback,不 throw
    async function tuneTenant(npc) {
        if (!npc || !npc.key) return _fallbackTuning(npc);
        const cached = await getTuning(npc.key);
        if (_isValidTuning(cached)) return cached;

        const api = win.OS_API || window.OS_API;
        const RT = (win.OS_ROOM_SVG && win.OS_ROOM_SVG.ROOM_TYPES) || {};
        let result = null;
        if (api && typeof api.chatSecondary === 'function' && npc.persona) {
            result = await new Promise(function (resolve) {
                let done = false;
                let timer = null;
                const finish = (v) => {
                    if (!done) {
                        done = true;
                        if (timer) clearTimeout(timer);
                        resolve(v);
                    }
                };
                // 修正#1：逾時保護（30秒）——防 chatSecondary 連線卡住招租流程
                timer = setTimeout(() => finish(null), 30000);
                try {
                    api.chatSecondary(_tuneMessages(npc), null,
                        function (text) {
                            try {
                                const t = String(text || '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
                                const m = t.match(/\{[\s\S]*\}/);
                                const o = m ? JSON.parse(m[0]) : null;
                                if (!o || !RT[o.idealTypeKey]) return finish(null);
                                let tol = parseFloat(o.rentTolerance);
                                if (!isFinite(tol)) tol = 0.6;
                                finish({
                                    idealTypeKey: o.idealTypeKey,
                                    rentTolerance: Math.max(0, Math.min(1, tol)),
                                    habitTags: Array.isArray(o.habitTags) ? o.habitTags.slice(0, 3).map(String) : [],
                                });
                            } catch (e) { finish(null); }
                        },
                        function () { finish(null); },
                        { label: '租客定調' });
                } catch (e) { finish(null); }
            });
        }
        const tuning = result || _fallbackTuning(npc);
        await saveTuning(npc.key, tuning);
        return tuning;
    }

    // 入住：純函式,回新 state
    function moveIn(state, unitId, npc) {
        // 修正#3：防 npc 為 null/undefined 導致拋錯
        if (!npc || !npc.key) {
            return JSON.parse(JSON.stringify(state));  // 無效 npc → 原樣回傳深拷貝
        }
        const s = JSON.parse(JSON.stringify(state));
        const u = s.units.find(x => x.id === unitId);
        if (!u || u.tenantKey) return s;                 // 找不到或已有人 → 原樣回
        u.tenantKey = npc.key; u.tenantName = npc.name || '房客'; u.movedInAt = _now();
        return s;
    }

    // ── 開 app：先補算離線收租,再畫主畫面 ──
    // 🚨入帳與存檔綁定：有租金時,唯有 addPT 真的成功才可以把 lastSettleDay 推進到今天。
    //   否則存檔會讓這筆房租永久消失(下次開 app 誤以為已收過)。
    // 修正#4：入帳成功後若存檔失敗,需重試一次後回傳 saveFailed 旗標,避免重複入帳
    // 防重複跑：連點入口鈕時,第二次呼叫回傳「同一個進行中的 promise」,而不是靜默 return
    //   (靜默 return 會讓連點時後一次呼叫的畫面容器沒東西可畫,出現空白面板;參考 os_cafe.js 的 _settling 閂寫法)
    let _settling = null;
    async function _openAndSettle() {
        if (_settling) return _settling;
        _settling = _openAndSettleInner().finally(() => { _settling = null; });
        return _settling;
    }
    async function _openAndSettleInner() {
        const state = await getState();
        const r = settleCore(state, _dayNum(_now()));
        if (r.earned > 0) {
            const pt = win.OS_PT || window.OS_PT;
            try {
                if (!pt || typeof pt.addPT !== 'function') throw new Error('包租戶錢包尚未就緒');
                await pt.addPT(r.earned, { reason: '房租收入', items: r.perUnit });
            } catch (e) {
                console.warn('[Landlord] 入帳失敗,本次房租暫不結算,下次開啟再補算', e);
                // 不存檔 → lastSettleDay 保持原樣,下次開 app 會重新補算這段期間
                return { state: state, days: r.days, earned: r.earned, perUnit: r.perUnit, payFailed: true };
            }
            // 入帳成功後,存檔帶重試保護（兩次都失敗才算失敗）
            let saveFailed = false;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    await saveState(r.state);
                    break;
                } catch (e) {
                    if (attempt === 0) {
                        console.warn('[Landlord] 存檔失敗,正在重試…', e);
                    } else {
                        console.warn('[Landlord] 存檔重試仍失敗,房租已入帳但結算紀錄未保存', e);
                        saveFailed = true;
                    }
                }
            }
            if (saveFailed) {
                return { state: r.state, days: r.days, earned: r.earned, perUnit: r.perUnit, saveFailed: true };
            }
        } else {
            // earned === 0 時正常存檔,無重試(維持既有行為)
            await saveState(r.state);
        }
        return { state: r.state, days: r.days, earned: r.earned, perUnit: r.perUnit, payFailed: false };
    }

    function _injectStyle() {
        const d = win.document;
        if (d.getElementById('ll-style')) return;
        const s = d.createElement('style'); s.id = 'll-style';
        s.textContent = [
            '.ll-wrap{padding:14px;color:#e7eaf1;font-family:inherit}',
            '.ll-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}',
            '.ll-title{font-size:15px;font-weight:700}',
            '.ll-purse{font-size:13px;color:#d9b06a}',
            '.ll-note{font-size:12px;color:#9aa1b0;margin-bottom:12px;line-height:1.6}',
            '.ll-units{display:flex;flex-direction:column;gap:10px}',
            '.ll-unit{border:1px solid #2c3140;border-radius:10px;padding:11px;background:#171a21}',
            '.ll-unit-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}',
            '.ll-unit-name{font-size:13px;font-weight:600}',
            '.ll-unit-sub{font-size:11px;color:#8b91a1}',
            '.ll-btn{padding:7px 12px;border-radius:8px;border:1px solid #2c3140;background:#20242e;color:#e7eaf1;font-size:12px;cursor:pointer}',
            '.ll-btn:hover{border-color:#d98fb0}',
            '.ll-empty{color:#7a8090}',
            '.ll-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}',
            '.ll-cand{display:flex;justify-content:space-between;align-items:center;border:1px solid #262b37;border-radius:9px;padding:9px}',
            '.ll-btn:disabled{opacity:.5;cursor:default}',
            '.ll-error{color:#e08a8a}',
        ].join('\n');
        (d.head || d.documentElement).appendChild(s);
    }

    // 🚨不要用布林旗標防連點：外層 control_center 每次啟動 app 都會清空容器、傳一個全新的 div 進來,
    //   連點時若靜默 return,後一次呼叫拿到的新容器會什麼都沒畫到,玩家看到空白面板。
    //   真正需要防重複的是「結算入帳」這個動作本身,那個閂下在 _openAndSettle(見上方 _settling)。
    //   這裡永遠把結果畫進「這次傳進來的容器」。
    async function launch(container) {
        const d = win.document;
        const root = container || d.body;
        _injectStyle();
        root.innerHTML = '<div class="ll-wrap"><div class="ll-note">正在整理房產…</div></div>';

        let res;
        try {
            res = await _openAndSettle();
        } catch (e) {
            console.warn('[Landlord] 開啟房產失敗', e);
            _renderError(root);
            return;
        }
        let purse = 0;
        try { const pt = win.OS_PT || window.OS_PT; if (pt && pt.getPT) purse = await pt.getPT(); } catch (e) {}

        const wrap = d.createElement('div'); wrap.className = 'll-wrap';
        const head = d.createElement('div'); head.className = 'll-head';
        head.innerHTML = '<span class="ll-title"><i class="fa-solid fa-building"></i> 我的房產</span>'
            + '<span class="ll-purse"><i class="fa-solid fa-coins"></i> ' + purse + '</span>';
        wrap.appendChild(head);

        const note = d.createElement('div'); note.className = 'll-note';
        note.textContent = res.payFailed
            ? '房租入帳暫時失敗，晚點再開一次房產就會自動重新結算。'
            : (res.saveFailed
                ? '房租已經收好了，這次的紀錄慢了一拍，下次打開房產時會重新整理一次。'
                : (res.days > 0 && res.earned > 0
                    ? ('你不在的這 ' + res.days + ' 天，收到房租 ' + res.earned + '。')
                    : (res.days > 0 ? ('過了 ' + res.days + ' 天，目前沒有房客繳租。') : '今天的房租已經收過了。')));
        wrap.appendChild(note);

        const units = d.createElement('div'); units.className = 'll-units';
        const RT = (win.OS_ROOM_SVG && win.OS_ROOM_SVG.ROOM_TYPES) || {};
        res.state.units.forEach(function (u) {
            const card = d.createElement('div'); card.className = 'll-unit';
            const label = (RT[u.roomTypeKey] && RT[u.roomTypeKey].label) || '未知房型';
            const top = d.createElement('div'); top.className = 'll-unit-top';
            const left = d.createElement('div');
            left.innerHTML = '<div class="ll-unit-name">' + label + '</div>'
                + '<div class="ll-unit-sub">' + (u.tenantName
                    ? ('房客：' + u.tenantName + '　每日租金 ' + u.rent)
                    : '<span class="ll-empty">空著</span>') + '</div>';
            top.appendChild(left);
            if (!u.tenantKey) {
                const btn = d.createElement('button'); btn.className = 'll-btn';
                btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> 招租';
                btn.onclick = function () { _renderRecruit(root, u.id); };
                top.appendChild(btn);
            }
            card.appendChild(top);
            units.appendChild(card);
        });
        wrap.appendChild(units);
        root.innerHTML = ''; root.appendChild(wrap);
    }

    // 開啟房產失敗時的畫面:給玩家一個看得懂的提示與重試入口,不讓畫面卡在載入中
    function _renderError(root) {
        const d = win.document;
        const wrap = d.createElement('div'); wrap.className = 'll-wrap';
        const note = d.createElement('div'); note.className = 'll-note ll-error';
        note.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 房產資料暫時讀不到，請稍後再試一次。';
        wrap.appendChild(note);
        const btn = d.createElement('button'); btn.className = 'll-btn';
        btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> 再試一次';
        btn.onclick = function () { launch(root); };
        wrap.appendChild(btn);
        root.innerHTML = ''; root.appendChild(wrap);
    }

    // 招租畫面：列名冊 → 選人 → 定調 → 入住 → 回主畫面
    async function _renderRecruit(root, unitId) {
        const d = win.document;
        root.innerHTML = '<div class="ll-wrap"><div class="ll-note">正在看看有誰想租…</div></div>';
        let cands, state;
        try {
            cands = await listCandidates();
            state = await getState();
        } catch (e) {
            console.warn('[Landlord] 招租時房產資料讀取失敗', e);
            _renderError(root);
            return;
        }
        const taken = {}; state.units.forEach(u => { if (u.tenantKey) taken[u.tenantKey] = 1; });
        const free = cands.filter(c => !taken[c.key]);

        const wrap = d.createElement('div'); wrap.className = 'll-wrap';
        const head = d.createElement('div'); head.className = 'll-head';
        head.innerHTML = '<span class="ll-title"><i class="fa-solid fa-user-plus"></i> 招租</span>';
        wrap.appendChild(head);
        const note = d.createElement('div'); note.className = 'll-note';
        note.textContent = free.length ? '挑一位讓他住進來。' : '目前沒有可以招的人。';
        wrap.appendChild(note);

        const list = d.createElement('div'); list.className = 'll-list';
        const allBtns = [];   // 防並發：點下任一候選人時,整批候選按鈕一起鎖住
        free.forEach(function (c) {
            const row = d.createElement('div'); row.className = 'll-cand';
            const nm = d.createElement('div'); nm.textContent = c.name;
            const btn = d.createElement('button'); btn.className = 'll-btn';
            btn.innerHTML = '<i class="fa-solid fa-key"></i> 讓他入住';
            allBtns.push(btn);
            btn.onclick = async function () {
                // 同步先鎖住整批按鈕,避免玩家快速連點不同候選人時兩條流程平行跑、互相覆蓋
                allBtns.forEach(function (b) { b.disabled = true; });
                btn.textContent = '安排中…';
                try {
                    await tuneTenant(c);                       // 每人只燒一次
                    const s = await getState();
                    const target = s.units.find(function (x) { return x.id === unitId; });
                    if (target && !target.tenantKey) {
                        await saveState(moveIn(s, unitId, c));
                    }
                    // 這戶已被別的候選人搶先入住 → 不覆蓋,直接回主畫面看目前狀態
                } catch (e) {
                    console.warn('[Landlord] 入住時房產資料讀取失敗', e);
                    // catch 中無需額外處理,finally 會回到主畫面
                } finally {
                    await launch(root);
                }
            };
            row.appendChild(nm); row.appendChild(btn);
            list.appendChild(row);
        });
        wrap.appendChild(list);

        const back = d.createElement('button'); back.className = 'll-btn';
        back.innerHTML = '<i class="fa-solid fa-arrow-left"></i> 回房產';
        back.onclick = function () { launch(root); };
        wrap.appendChild(back);

        root.innerHTML = ''; root.appendChild(wrap);
    }

    win.OS_LANDLORD = {
        _cfg: LL_CFG, _defaultState, getState, saveState, getTuning, saveTuning, _dayNum, settleCore,
        listCandidates, tuneTenant, moveIn, _fallbackTuning, launch, _openAndSettle,   // _openAndSettle=console 診斷用
    };
    if (win !== window) { try { window.OS_LANDLORD = win.OS_LANDLORD; } catch (e) {} }
    console.log('[Landlord] 包租婆系統已載入');
})();
