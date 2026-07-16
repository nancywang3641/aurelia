// ----------------------------------------------------------------
// [檔案] vn_core_stage.js
// 路徑：os_phone/vn_story/vn_core_stage.js
// 職責：VN 雙格立繪舞台＋角色卡（2026-07-17 自 vn_core.js 拆出）
//       站位記憶/燈光景深/滯留清掃/立繪解析鏈(fallbackToAI)/通話頭像/雙擊角色卡(CV鎖+一鍵生立繪去背)
// ⚠️ 方法搬家、Object.assign 掛回同一顆 VN_Core（this 語義不變）；必須在 vn_core.js 之後載入
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const VN = window.VN_Core;
    if (!VN) { console.warn('[VN_CoreStage] VN_Core 不存在，立繪舞台未掛載（vn_core.js 必須先載入）'); return; }

    // 與 vn_core.js 同源的 short-name 別名（vn_cache/vn_config 必須在本檔之前載入）
    const VN_Cache = window.VN_Cache;
    const VN_Config = window.VN_Config;

    Object.assign(VN, {
        // ===== 雙格立繪舞台 =====
        // _stage[0]=左格、_stage[1]=右格；各為 null 或 { name, exp, lastTick }
        _slotEl: function(idx) { return document.getElementById(idx === 0 ? 'game-char' : 'game-char-2'); },
        _stageInit: function() { if (!this._stage) { this._stage = [null, null]; this._stageTick = 0; } },
        // 📱 手機也用雙格（2026-07-02 改回）：左右各一格、中間稍微重疊，版位由 CSS 控制。永遠回 false=不強制單格。
        _singleSlot: function() { return false; },
        // 站位記憶：角色名 → 這場戲裡站的格子(0左/1右)。被五層清掃掃掉後再開口回老位置，
        // 治「AI 忘出 [Exit]、清掃後被『先左後右』塞去對面，一下左一下右」。
        // ⚠️ 只限同場景：換景(_stageClear)歸零——跨場景留著會兩人記到同一格、輪流搶位(更亂)。
        _slotMemory: {},
        _stageIndexFor: function(name) {
            this._stageInit();
            if (this._singleSlot()) return 0;   // 手機單格：說話者一律進左格(置中)
            for (let i = 0; i < 2; i++) if (this._stage[i] && this._stage[i].name === name) return i;   // 已在場 → 沿用原格
            const mem = this._slotMemory[name];
            if ((mem === 0 || mem === 1) && !this._stage[mem]) return mem;                               // 記得上次站哪邊且那格空 → 回老位置
            for (let i = 0; i < 2; i++) if (!this._stage[i]) return i;                                   // 沒站過 → 先左後右
            return (this._stage[0].lastTick <= this._stage[1].lastTick) ? 0 : 1;                         // 兩格滿 → 驅逐最久沒說話那格
        },
        // 這格的立繪目前「看得到」嗎（_showEl 顯示中）：隱形佔位（圖還在生/生失敗被藏）不算
        _slotShowing: function(i) {
            const el = this._slotEl(i);
            return !!(el && el.style.display === 'block' && el.style.opacity !== '0');
        },
        // 燈光：speakerIdx 那格亮、其餘在場變暗；speakerIdx=-1（旁白）全暗。
        // opts.grantSolo=idx：這格是「進場當下就是獨角」→ 授予置中。
        _applyStageLighting: function(speakerIdx, opts) {
            this._stageInit();
            this._lastLightIdx = speakerIdx;   // 給 _showEl 的「顯示即重打燈」沿用當下說話者
            // 置中/近遠判定看「看得到的格子」（說話者自己視同即將顯示）：另一格只剩隱形佔位
            //（圖還在生成/生成失敗）就不霸位——否則單人會先卡左位、等 5 輪過期清掉殘留才滑去中間。
            // 晚到的圖顯示那一刻 _showEl 重打燈，版位立即補正回雙格。
            const occ = [0, 1].filter(i => this._stage[i] && (i === speakerIdx || this._slotShowing(i)));
            const solo = (occ.length === 1) ? occ[0] : -1;   // 只有一個「看得到」的角色
            const both = occ.length === 2;
            const grant = (opts && typeof opts.grantSolo === 'number') ? opts.grantSolo : -1;
            for (let i = 0; i < 2; i++) {
                const el = this._slotEl(i);
                if (!el || !this._stage[i]) continue;
                el.classList.toggle('vn-dim', i !== speakerIdx);
                el.classList.toggle('vn-active', i === speakerIdx);
                // vn-solo（置中）：只在「進場當下就是獨角」授予（grant）；已置中的維持（旁白/晚到重打燈不摘）。
                // 中途變獨角（同伴離場/被清掃）不重新置中 → 倖存者釘在原側，不會滑來滑去（Rae：離場時別動）。
                if (i !== solo) el.classList.remove('vn-solo');
                else if (i === grant) el.classList.add('vn-solo');
                // 景深（黏住制）：雙人在場、有人說話時才重新分「近(說話者)/遠(對方)」；
                // 旁白(-1)不動近遠只變暗 → 尺寸不會每句彈跳，換人說話才平滑互換；獨角清掉交給 vn-solo。
                if (!both) el.classList.remove('vn-near', 'vn-far');
                else if (speakerIdx >= 0) {
                    el.classList.toggle('vn-near', i === speakerIdx);
                    el.classList.toggle('vn-far', i !== speakerIdx);
                }
            }
        },
        _stageDimAll: function() { this._applyStageLighting(-1); },
        // 旁白也算一個「場次」：推進 tick + 清滯留(連續在場 N 次沒說話就移除) + 全部變暗
        _stageNarr: function() { this._stageInit(); this._stageTick++; this._staleSweep(); this._applyStageLighting(-1); },
        _clearSlot: function(i) {
            this._stageInit();
            this._stage[i] = null;
            const el = this._slotEl(i);
            if (el) { this._hideEl(el); el.classList.remove('vn-dim', 'vn-active', 'vn-solo', 'vn-avatar', 'vn-far', 'vn-near'); }
        },
        _stageRemove: function(name) {
            this._stageInit();
            for (let i = 0; i < 2; i++) if (this._stage[i] && this._stage[i].name === name) this._clearSlot(i);
        },
        _stageClear: function() { this._stageInit(); this._clearSlot(0); this._clearSlot(1); this._slotMemory = {}; this._pendingLeave = []; },   // 換景=站位記憶歸零(跨場景的陳舊記憶會害兩人搶同一格)+清待離場
        // 滯留清除：某格角色超過 N tick 沒當說話者 → 自動移除（防殘留），N 預設 5、可由 localStorage 覆寫
        _staleSweep: function() {
            this._stageInit();
            let limit = parseInt(window.localStorage.getItem('vn_sprite_stale_limit'));
            if (isNaN(limit) || limit < 1) limit = 5;
            let removed = false;
            for (let i = 0; i < 2; i++) {
                const s = this._stage[i];
                if (s && (this._stageTick - s.lastTick) >= limit) { this._clearSlot(i); removed = true; }
            }
            // 清掃(擦屁股式移除)後只剩一位 → 補授予置中；明示離場([Exit]/|Leave)仍維持「倖存者釘原側」不走這裡。
            // 後續 _applyStageLighting 對已置中者只維持不摘(grant 規則)，不會被旁白重打燈洗掉。
            if (removed) {
                const occ = [0, 1].filter(i => this._stage[i]);
                if (occ.length === 1) { const el = this._slotEl(occ[0]); if (el) el.classList.add('vn-solo'); }
            }
        },

        // isStale：給雙格用的「這格還是不是同一角色」守衛；不給就退回舊的 currentName 守衛（通話模式用）
        _tryLoad: function(targetImg, urls, fallback, onSuccess, isStale) {
            const guardName0 = this.currentName;
            const _stale = isStale || (() => this.currentName !== guardName0);
            let i = 0;
            const tryNext = () => {
                if (i >= urls.length) { fallback(); return; }
                const url = urls[i++];
                const tempImg = new Image();
                tempImg.onload = () => {
                    if (_stale()) return;
                    if (targetImg.id !== 'call-avatar') this._showEl(targetImg, url); else targetImg.src = url;
                    if (onSuccess) onSuccess(targetImg);
                };
                tempImg.onerror = () => { if (_stale()) return; tryNext(); };
                tempImg.src = url;
            };
            tryNext();
        },

        // 公開入口（[Char]/[Inner] 呼叫）：把說話角色放上舞台、渲染、打燈、清滯留
        updateSprite: function(name, exp) {
            this._stageInit();
            this._stageTick++;
            if (this._singleSlot() && this._stage[1]) this._clearSlot(1);   // 📱 手機單格：清掉右格殘留(防桌面→手機切換留圖)
            const idx = this._stageIndexFor(name);
            const prev = this._stage[idx];
            const isNew = !prev || prev.name !== name;
            this._stage[idx] = { name, exp, lastTick: this._stageTick };
            this._slotMemory[name] = idx;   // 記住這個角色站哪邊，重進場回老位置
            this.currentName = name; this.currentExp = exp;   // 相容：通話/TTS/部分舊流程仍讀
            const el = this._slotEl(idx);
            // 換角色：先清掉舊角色的版型 class(浮起金框/置中/明暗) 並隱藏，避免「舊圖用舊版型閃一下」才換新圖
            if (el && isNew) { el.classList.remove('vn-avatar', 'vn-solo', 'vn-dim', 'vn-active', 'vn-far', 'vn-near'); this._hideEl(el); el.dataset.slideIn = '1'; }
            // 🎬 讓位過渡：對面正「獨角置中」、新角色要進場 → 先摘掉它的 vn-solo（0.32s 滑回自己那側），
            //   新立繪延遲到它走完位才現身——不是同時動（同時動看起來像被硬推開）
            let _madeWay = false;
            if (isNew && !this._singleSlot()) {
                const _oEl = this._slotEl(1 - idx);
                if (_oEl && this._stage[1 - idx] && _oEl.classList.contains('vn-solo')) { _oEl.classList.remove('vn-solo'); _madeWay = true; }
            }
            if (_madeWay) {
                const self = this;
                setTimeout(() => { if (self._stage[idx] && self._stage[idx].name === name) self._renderSlot(idx, name, exp); }, 380);
            } else {
                this._renderSlot(idx, name, exp);
            }
            this._staleSweep();                // 先清過期(防殘留) → 新進場獨角下一步打燈即時置中，不慢半拍
            this._applyStageLighting(idx, { grantSolo: isNew ? idx : -1 });   // 說話者亮、另一格變暗；置中只授予「進場當下就是獨角」的
        },

        // 單格圖片解析鏈（sprite_cache → spriteBase → fallbackToAI），守衛改用「這格還是不是同角色」
        _renderSlot: async function(idx, name, exp) {
            const img = this._slotEl(idx);
            if (!img) return;
            const _stale = () => !this._stage[idx] || this._stage[idx].name !== name;
            const triggerAnim = (target) => {
                if (_stale()) return;
                target.classList.remove('vn-avatar');   // 真立繪 → 貼地（移除頭像浮起樣式）
                target.classList.remove('sprite-shake', 'sprite-jumpscare', 'sprite-slide-in-right');
                void target.offsetWidth;
                if (target.dataset.slideIn === '1') { target.classList.add('sprite-slide-in-right'); delete target.dataset.slideIn; }
                else { if (exp === 'Surprised') target.classList.add('sprite-shake'); if (exp === 'JumpScare') target.classList.add('sprite-jumpscare'); }
            };
            // 最優先：sprite_cache（透明真立繪）
            for (const v of this._nameVariants(name)) {
                const cached = await VN_Cache.get('sprite_cache', v);
                if (cached?.url) { if (_stale()) return; this._swapImage(img, cached.url, false, _stale, () => triggerAnim(img)); return; }
            }
            if (VN_Config.data.spriteBase) {
                const urls = this._nameVariants(name).map(v => `${VN_Config.data.spriteBase}${v}_${exp}.png`);
                this._tryLoad(img, urls, () => this.handleImgError(img), triggerAnim, _stale);
            } else this.fallbackToAI(idx, name, exp);
        },
        
        updateCallAvatar: function(name) {
            this.currentName = name; this.currentExp = 'Neutral';
            const _init = document.getElementById('call-avatar-initial');
            if (_init) _init.textContent = (name || '?').trim().slice(0, 1);   // 佔位底座：沒頭像圖時顯示名字首字（有圖會蓋上去）
            const img = document.getElementById('call-avatar');
            if (VN_Config.data.spriteBase) {
                const urls = this._nameVariants(name).map(v => `${VN_Config.data.spriteBase}${v}_Neutral.png`);
                this._tryLoad(img, urls, () => this.handleImgError(img), null);
            } else this.fallbackToAI('call', name, 'Neutral');
        },

        handleImgError: function(img) {
            img.onerror = null;
            const isCall = img.id === 'call-avatar';
            const target = isCall ? 'call' : (img.id === 'game-char-2' ? 1 : 0);
            this._stageInit();
            const lockedName = isCall ? this.currentName : (this._stage[target] && this._stage[target].name);
            const lockedExp  = isCall ? this.currentExp  : (this._stage[target] && this._stage[target].exp);
            if (!lockedName) { this._hideEl(img); return; }
            const _stale = isCall ? (() => this.currentName !== lockedName)
                                  : (() => !this._stage[target] || this._stage[target].name !== lockedName);
            const base = VN_Config.data.charDefaultBase;

            const triggerAnim = (t) => {
                if (_stale()) return;
                t.classList.remove('vn-avatar');   // 預設立繪(presets) → 貼地
                t.classList.remove('sprite-shake', 'sprite-jumpscare', 'sprite-slide-in-right');
                void t.offsetWidth;
                if (t.dataset.slideIn === '1') { t.classList.add('sprite-slide-in-right'); delete t.dataset.slideIn; }
                else { if (lockedExp === 'Surprised') t.classList.add('sprite-shake'); if (lockedExp === 'JumpScare') t.classList.add('sprite-jumpscare'); }
            };

            if (base) {
                const urls = this._nameVariants(lockedName).map(v => `${base}${v}_presets.png`);
                this._tryLoad(img, urls, () => { if (_stale()) return; this.fallbackToAI(target, lockedName, lockedExp); }, isCall ? null : triggerAnim, _stale);
            } else {
                this.fallbackToAI(target, lockedName, lockedExp);
            }
        },
        
        // target：0/1 = 舞台格子；'call' = 通話頭像。雙格一律貼底立繪樣式(no-frame)，通話用 img.src
        fallbackToAI: async function(target, name, exp) {
            const isCall = (target === 'call');
            const img = isCall ? document.getElementById('call-avatar') : this._slotEl(target);
            if (!img) return;
            this._stageInit();
            const _stale = isCall ? (() => this.currentName !== name)
                                  : (() => !this._stage[target] || this._stage[target].name !== name);
            const showAvatar = (url) => {   // 頭像(世界書/AI生成/persona) → 浮起金框
                if (_stale()) return;
                if (isCall) { img.src = url; }
                else this._swapImage(img, url, true, _stale, () => this._applyAvatarAnim(img, exp));
            };
            const showSprite = (url) => {   // 立繪 / 剪影 → 貼地、不套框
                if (_stale()) return;
                if (isCall) { img.src = url; }
                else this._swapImage(img, url, false, _stale, () => this._applyAvatarAnim(img, exp));
            };
            // 立繪模式只改兩處：①顯示用貼地立繪(show) ②生成那一步換立繪 prompt+去背(_makeCharImage 內判斷)。
            //   底下整條解析鏈 / gate（世界書 → 快取 → persona → 無描述就剪影不生）完全共用，不另開路徑。
            const show = (VN_Config.data.spriteDirect === true) ? showSprite : showAvatar;

            // 世界書頭像
            if (!this._lorebookLoaded) { await this._loadLorebookAvatars(); this._lorebookLoaded = true; if (_stale()) return; }
            const lbUrl = this._lorebookAvatarCache[name] || this._lorebookAvatarCache[this._nameVariants(name).find(v => this._lorebookAvatarCache[v])];
            if (lbUrl) { show(lbUrl); return; }

            // 記憶體快取
            if (this._avatarMemCache[name]) { show(this._avatarMemCache[name]); return; }

            // 早鳥/預熱接力：早鳥走 _genAvatarToCache 登記在 _avatarInflight，這條晚路徑以前看不到它
            // → 同角色會被重發第二張。ComfyUI/本機 GPU 是串行佇列，重複發單＝首次登場等雙倍、早鳥提前量白費。
            // 改：發現早鳥正在生這張就「等它」、直接用結果，絕不再開第二張。
            if (this._avatarInflight[name]) {
                try { await this._avatarInflight[name]; } catch(e) {}
                if (_stale()) return;
                if (this._avatarMemCache[name]) { show(this._avatarMemCache[name]); return; }
            }

            // 並發鎖：同角色生成中 → 等它
            if (this._pendingAvatars[name]) {
                await this._pendingAvatars[name];
                if (_stale()) return;
                if (this._avatarMemCache[name]) show(this._avatarMemCache[name]);
                return;
            }
            let _resolvePending;
            this._pendingAvatars[name] = new Promise(r => { _resolvePending = r; });
            try {
                const cached = await VN_Cache.get('avatar_cache', name);
                let url;
                if (cached && cached.url && !cached.url.startsWith('blob:')) {
                    const objUrl = await this._toObjectUrl(cached.url);
                    url = objUrl || cached.url; this._avatarMemCache[name] = url;
                } else {
                    let d = this._resolveAvatarPrompt(name);
                    // none 路人（有聲線無外觀）：只有立繪模式才合成 prompt 生全身；一般頭像模式往下走剪影
                    if (!d && VN_Config.data.spriteDirect === true && this._isNoneChar(name)) d = await this._buildNonePrompt(name);
                    if (!d) {
                        const pf = this._getPersonaFallback(name);
                        if (pf?.url) { url = pf.url; this._avatarMemCache[name] = url; }
                        else if (pf?.prompt) { d = pf.prompt; }
                        else {
                            const fb = VN_Config.data.finalFallbackSprite;
                            if (fb) showSprite(fb); else if (!_stale()) this._hideEl(img);
                            return;
                        }
                    }
                    if (!url && !d) return;
                    if (!url) {   // 還沒拿到圖才生成（pf.url 直接用）；立繪模式由 _makeCharImage 內部換立繪 prompt + 去背
                        const img2 = await this._makeCharImage(d, exp);
                        if (!img2) return;
                        url = img2.objUrl; this._avatarMemCache[name] = img2.objUrl;
                        if (img2.dataUrl) { try { await VN_Cache.set('avatar_cache', name, VN_Config.data.spriteDirect === true ? { prompt: d, url: img2.dataUrl, isSprite: true } : { prompt: d, url: img2.dataUrl }); } catch(e) {} }
                    }
                }
                if (!url) { const fb = VN_Config.data.finalFallbackSprite; if (fb) showSprite(fb); else if (!_stale()) this._hideEl(img); return; }
                show(url);
            } finally {
                _resolvePending();
                delete this._pendingAvatars[name];
            }
        },

        _applyAvatarAnim: function(el, exp) {
            if (!el) return;
            const _exp = (exp !== undefined) ? exp : this.currentExp;
            el.classList.remove('sprite-shake', 'sprite-jumpscare');
            void el.offsetWidth;
            if (_exp === 'Surprised') el.classList.add('sprite-shake');
            if (_exp === 'JumpScare') el.classList.add('sprite-jumpscare');
        },

        // ===== 雙擊立繪 → 角色卡（名 / 一鍵生立繪+去背 / 當前CV+保存 / 形象 / 身分 / 好感度）=====
        _readCharState: function(name) {
            try {
                const cur = win._AVS_ENGINE?.read?.() || {};
                const box = cur['角色狀態'] || cur['角色状态'] || {};
                return box[name] || null;
            } catch (e) { return null; }
        },
        _charCV: function(name) {
            try {
                const T = win.VN_TTS;
                if (!T || !T.config) return null;
                const manual = T.config.charMappings && T.config.charMappings[name];
                const locked = (typeof T._cardLocks === 'function') ? T._cardLocks()[name] : null;
                const id = manual || locked || (T._npcSessionCache && T._npcSessionCache[name]) || null;
                if (!id) return null;
                const model = T.config.models && T.config.models[id];
                // source：manual=面板手動綁(全域) / cardlock=本卡NPC鎖(立繪save) / session=本局抽到還沒鎖
                const source = manual ? 'manual' : (locked ? 'cardlock' : 'session');
                return { id, name: (model && model.name) || id, source, bound: !!manual };
            } catch (e) { return null; }
        },
        // 立繪 save CV → 寫「本卡 NPC 聲線鎖」(per-卡，與面板手動綁定分流)，不污染全域 charMappings
        saveCharCV: function(name, btn) {
            try {
                const cv = this._charCV(name);
                if (!cv) { alert('這個角色目前沒有語音可保存'); return; }
                const T = win.VN_TTS;
                if (typeof T.lockNpcVoice === 'function') T.lockNpcVoice(name, cv.id);
                if (btn) { btn.textContent = '已鎖定 ✓'; btn.disabled = true; }
            } catch (e) { alert('保存失敗：' + (e?.message || e)); }
        },
        unlockCharCV: function(name, btn) {
            try {
                const T = win.VN_TTS;
                if (typeof T.unlockNpcVoice === 'function') T.unlockNpcVoice(name);
                if (btn) { btn.textContent = '已解除 ✓'; btn.disabled = true; }
            } catch (e) { alert('解除失敗：' + (e?.message || e)); }
        },
        // 真懶人：用角色頭像提示詞 → 生 512×896 立繪 → AI 模型去背 → 存 sprite_cache → 立繪即時換上
        autoGenSprite: async function(name, btn) {
            const orig = btn ? btn.textContent : '';
            const setT = (t) => { if (btn) btn.textContent = t; };
            try {
                if (btn) btn.disabled = true;
                setT('🎨 生成中…');
                // 跟頭像 tab 的🎨同一套：套「全身框」前後綴(full body…) + 剝掉頭像特寫詞，512×896 直立全身比例
                const DEF_PREFIX = 'straight posturing, solo, (facing viewer:1.2), (cowboy shot:1.2), front view, clothes and pants, standing, ';
                const DEF_SUFFIX = 'simple bright background, straight view, no shading';
                const pfx = localStorage.getItem('os_sprite_tpl_prefix') || DEF_PREFIX;
                const sfx = localStorage.getItem('os_sprite_tpl_suffix') || DEF_SUFFIX;
                // 跟工作檯同邏輯：優先用「這張頭像當初存的 prompt」(avatar_cache)→立繪跟頭像同一個人；沒有才退回腳本描述
                let rawP = '';
                try { const _av = await win.VN_Cache?.get?.('avatar_cache', name); if (_av && _av.prompt) rawP = String(_av.prompt); } catch (e) {}
                if (this._isNoneDesc(rawP)) rawP = '';   // 舊快取可能存過字串 'none'（舊版把它當外觀）→ 當作沒有
                if (!rawP) {
                    let d = this._resolveAvatarPrompt(name);
                    // none 路人（有聲線無外觀）：一鍵生立繪不分模式都合成 prompt（標題+角色名翻英文＋聲線性別）
                    if (!d && this._isNoneChar(name)) d = await this._buildNonePrompt(name);
                    rawP = String(d || name);
                }
                // 完整清洗（同工作檯 stripPromptForSprite）：剝掉構圖/背景/燈光/視角詞(from behind/side/front…)→不再生出背面、側面、亂加背景
                rawP = rawP
                    .replace(/\bbust(\s+|-)?shot\b/gi, '').replace(/\bportrait\b/gi, '').replace(/\bheadshot\b/gi, '').replace(/\bhead\s+shot\b/gi, '')
                    .replace(/\bclose[\s-]?up\b/gi, '').replace(/\bcowboy(\s+|-)?shot\b/gi, '')
                    .replace(/\bupper(\s+|-)?body\b/gi, '').replace(/\bfull(\s+|-)?body\b/gi, '')
                    .replace(/\bhead\s+and\s+shoulders\b/gi, '').replace(/\bwaist[\s-]?up\b/gi, '').replace(/\bchest[\s-]?up\b/gi, '')
                    .replace(/\blooking\s+at\s+viewer\b/gi, '').replace(/\bface\s+focus\b/gi, '')
                    .replace(/\b[a-z]*\s*background\b/gi, '').replace(/\bisolated\b/gi, '').replace(/\bno\s+bg\b/gi, '')
                    .replace(/\bsoft\s+lighting\b/gi, '').replace(/\bstudio\s+lighting\b/gi, '').replace(/\bflat\s+lighting\b/gi, '')
                    .replace(/\bfrom\s+(above|below|side|behind|front)\b/gi, '')
                    .replace(/\s*,\s*,+/g, ', ').replace(/^\s*,+/, '').replace(/,+\s*$/, '').replace(/\s+/g, ' ').trim();
                const prompt = pfx + rawP + sfx;
                if (!win.OS_IMAGE_MANAGER || typeof win.OS_IMAGE_MANAGER.generate !== 'function') throw new Error('生圖引擎未就緒');
                const imCfg = win.OS_IMAGE_MANAGER.config;
                const _spriteSvc = (typeof win.OS_IMAGE_MANAGER.serviceFor === 'function') ? win.OS_IMAGE_MANAGER.serviceFor('char') : (imCfg && imCfg.service);
                const useNAI = !!(_spriteSvc === 'novelai' && imCfg && imCfg.novelai && imCfg.novelai.token);
                let _bw = 512, _bh = 896;
                try { const _bp = String(localStorage.getItem('os_sprite_size') || '512x896').split('x').map(Number); if (_bp[0] && _bp[1]) { _bw = _bp[0]; _bh = _bp[1]; } } catch(e) {}
                // 立繪負詞（studio「負詞」框 os_sprite_tpl_neg，三條立繪路徑共用）：接在各接口既有負詞後面。空＝不送。
                let _spriteNeg = null; try { _spriteNeg = localStorage.getItem('os_sprite_tpl_neg'); } catch(e) {}
                _spriteNeg = (_spriteNeg && _spriteNeg.trim()) ? _spriteNeg.trim() : undefined;
                const url = await win.OS_IMAGE_MANAGER.generate(prompt, 'char', { force: true, width: _bw, height: _bh, raw: !useNAI, extraNegative: _spriteNeg });
                if (!url) throw new Error('生圖回傳空');
                const blob = await (await fetch(url)).blob();
                setT('🪄 去背中…');
                const m = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm');
                const removed = await m.removeBackground(blob, { model: 'isnet_fp16', output: { format: 'image/png', quality: 1.0 } });
                const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(removed); });
                if (!win.VN_Cache) throw new Error('VN_Cache 未就緒');
                await win.VN_Cache.set('sprite_cache', name, { url: dataUrl, isRemoved: true, createdAt: Date.now() });
                // 立繪即時換上：該角色所在格重渲染
                this._stageInit();
                for (let i = 0; i < 2; i++) { if (this._stage[i] && this._stage[i].name === name) { const el = this._slotEl(i); if (el) el.classList.remove('vn-avatar'); this._renderSlot(i, name, this._stage[i].exp); } }
                setT('✅ 完成');
                setTimeout(() => { setT(orig); if (btn) btn.disabled = false; }, 1500);
            } catch (e) {
                console.error('[CharCard] 一鍵生立繪失敗:', e);
                setT('❌ ' + (e && e.message ? e.message : '失敗'));
                setTimeout(() => { setT(orig); if (btn) btn.disabled = false; }, 2600);
            }
        },
        // 📱 觸控雙擊偵測 → 開角色卡（手機沒有 dblclick；桌機仍走 ondblclick）
        // 單擊不攔截（保留點立繪推進劇情）；只有第二擊命中才 preventDefault 並開卡片
        _spriteTap: function(idx, ev) {
            const now = Date.now();
            if (this._lastSpriteTapIdx === idx && (now - (this._lastSpriteTapT || 0)) < 350) {
                this._lastSpriteTapIdx = -1; this._lastSpriteTapT = 0;
                if (ev && ev.preventDefault)  ev.preventDefault();   // 第二擊不推進劇情
                if (ev && ev.stopPropagation) ev.stopPropagation();
                this.openCharCard(idx);
            } else {
                this._lastSpriteTapIdx = idx;
                this._lastSpriteTapT   = now;
            }
        },
        openCharCard: function(idx) {
            this._stageInit();
            const slot = this._stage[idx];
            if (!slot || !slot.name) return;
            const name = slot.name;
            const st = this._readCharState(name) || {};
            const cv = this._charCV(name);
            const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

            let card = document.getElementById('vn-char-card');
            if (!card) { card = document.createElement('div'); card.id = 'vn-char-card'; (document.getElementById('page-game') || document.body).appendChild(card); }
            card.className = 'vn-cc ' + (idx === 0 ? 'vn-cc-left' : 'vn-cc-right');
            const affRaw = st['好感度'];
            const aff = (affRaw === null || affRaw === undefined || affRaw === '') ? '—' : affRaw;
            const _cvTag = cv ? (cv.source === 'manual' ? '（已綁定·全域）' : (cv.source === 'cardlock' ? '（本卡已鎖）' : '')) : '';
            const cvText = cv ? (esc(cv.name) + _cvTag) : '—';
            // session=還沒鎖→「💾保存(本卡)」；cardlock=已鎖→「🔓解除」；manual=全域綁定→面板管、這裡不出按鈕
            let _cvBtn = '';
            if (cv && cv.source === 'session') _cvBtn = '<button class="vn-cc-mini" id="vn-cc-cv-save">💾 保存</button>';
            else if (cv && cv.source === 'cardlock') _cvBtn = '<button class="vn-cc-mini" id="vn-cc-cv-unlock">🔓 解除</button>';
            card.innerHTML =
                '<div class="vn-cc-head"><span class="vn-cc-name"></span></div>' +
                '<button class="vn-cc-btn" id="vn-cc-gen">🎨 一鍵生立繪（去背）</button>' +
                '<div class="vn-cc-row"><span class="vn-cc-k">當前 CV</span><span class="vn-cc-v">' + cvText + '</span>' + _cvBtn + '</div>' +
                '<div class="vn-cc-row"><span class="vn-cc-k">形象</span><span class="vn-cc-v">' + esc(st['形象'] || '—') + '</span></div>' +
                '<div class="vn-cc-row"><span class="vn-cc-k">身分</span><span class="vn-cc-v">' + esc(st['身分'] || st['身份'] || '—') + '</span></div>' +
                '<div class="vn-cc-row"><span class="vn-cc-k">好感度</span><span class="vn-cc-v">' + esc(aff) + '</span></div>';
            card.querySelector('.vn-cc-name').textContent = name;
            card.querySelector('#vn-cc-gen').onclick = (e) => this.autoGenSprite(name, e.currentTarget);
            const cvSaveBtn = card.querySelector('#vn-cc-cv-save');
            if (cvSaveBtn) cvSaveBtn.onclick = (e) => this.saveCharCV(name, e.currentTarget);
            const cvUnlockBtn = card.querySelector('#vn-cc-cv-unlock');
            if (cvUnlockBtn) cvUnlockBtn.onclick = (e) => this.unlockCharCV(name, e.currentTarget);
            card.style.display = 'block';
            this._ccIdx = idx;
            // 點卡片外面自動關（延遲一拍掛載，避免開卡這次的點擊立刻把它關掉）
            if (this._ccOutside) document.removeEventListener('pointerdown', this._ccOutside, true);
            this._ccOutside = (ev) => { const c = document.getElementById('vn-char-card'); if (c && c.style.display !== 'none' && !c.contains(ev.target)) this.closeCharCard(); };
            setTimeout(() => { document.addEventListener('pointerdown', this._ccOutside, true); }, 0);
        },
        closeCharCard: function() {
            const card = document.getElementById('vn-char-card');
            if (card) card.style.display = 'none';
            for (let i = 0; i < 2; i++) { const el = this._slotEl ? this._slotEl(i) : null; if (el) el.classList.remove('vn-cc-shift-l', 'vn-cc-shift-r'); }
            if (this._ccOutside) { document.removeEventListener('pointerdown', this._ccOutside, true); this._ccOutside = null; }
            this._ccIdx = null;
        }
    });
})();
