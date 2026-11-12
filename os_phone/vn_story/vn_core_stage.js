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
            if (this._mouthRun && this._mouthRun.img === this._slotEl(i)) this._mouthHalt();   // 正在講話的那格要撤：先換回原圖
            this._stage[i] = null;
            const el = this._slotEl(i);
            const fb = this._faceBase(el); if (fb) el.src = fb;   // 眨眼眨到一半也換回原圖
            if (this._blinks) this._blinks[i] = null;
            if (el) { this._hideEl(el); el.classList.remove('vn-dim', 'vn-active', 'vn-solo', 'vn-avatar', 'vn-far', 'vn-near'); }
        },
        _stageRemove: function(name) {
            this._stageInit();
            for (let i = 0; i < 2; i++) if (this._stage[i] && this._stage[i].name === name) this._clearSlot(i);
        },
        // 🎭 Jev 排的收立繪時間表（os_jev_stage.js 的 plan → this._jevStage.removals：{name, line, occ}）
        //   line/occ＝「從這段起不在」那一段在劇本裡的原文＋同樣原文前面出現過幾次；比原文不比行號，劇本中途被插進插圖行也對得上
        _jevStageOcc: function(idx) {
            const l = this.script[idx]; let n = 0;
            for (let i = 0; i < idx; i++) if (this.script[i] === l) n++;
            return n;
        },
        // next() 走到第 idx 行、還沒演之前叫：這行是誰的「從這段起不在」就收他
        _jevStageHit: function(idx) {
            const pl = this._jevStage; if (!pl || !pl.removals) return;
            const l = this.script[idx]; if (typeof l !== 'string') return;
            let occ = -1;
            pl.removals.forEach(r => {
                if (r.done || r.line !== l) return;
                if (occ < 0) occ = this._jevStageOcc(idx);
                if (r.occ !== occ) return;
                r.done = 1;
                this._stageRemove(r.name);
            });
        },
        // 時間表晚到（Jev 回來時已經播過幾段）：已經播過的收立繪點，那個人之後沒再開口的，現在補收
        _jevStageCatchUp: function() {
            const pl = this._jevStage; if (!pl || !pl.removals) return;
            const cur = this.index;
            pl.removals.forEach(r => {
                if (r.done) return;
                let n = -1, at = -1;
                for (let i = 0; i < this.script.length; i++) if (this.script[i] === r.line && ++n === r.occ) { at = i; break; }
                if (at < 0 || at > cur) return;
                r.done = 1;
                for (let i = at; i <= cur; i++) {
                    const l = this.script[i];
                    if (typeof l === 'string' && (l.indexOf('[Char|' + r.name + '|') === 0 || /^\[Bg\|/i.test(l))) return;   // 又開口了、或已經換場（換場本來就清空）
                }
                this._stageRemove(r.name);
            });
        },
        // 🎵 Jev 排的音效／音樂時間表（os_jev_sfx.js 的 plan → this._jevSfx：{ sfx:[{line,occ,id}], bgm:[{line,occ,id}] }）
        //   跟立繪一樣比原文＋第幾次出現。next() 走到第 idx 行、還沒演之前叫：
        //   這格有音效 → 記在 _jevSfxNow 給旁白播；這格是一場的開頭有音樂 → 回一行 [BGM|曲|jev] 讓 next() 先插進去播
        _jevSfxHit: function(idx) {
            const pl = this._jevSfx; if (!pl) return null;
            const l = this.script[idx]; if (typeof l !== 'string') return null;
            let occ = -1, bgmLine = null;
            const occOf = () => { if (occ < 0) occ = this._jevStageOcc(idx); return occ; };
            (pl.sfx || []).forEach(r => { if (r.done || r.line !== l || r.occ !== occOf()) return; r.done = 1; this._jevSfxNow = r.id; });
            (pl.bgm || []).forEach(r => { if (r.done || r.line !== l || r.occ !== occOf()) return; r.done = 1; bgmLine = '[BGM|' + r.id + '|jev]'; });
            return bgmLine;
        },
        // 旁白要播哪個音效：這章聽 Jev 就只播 Jev 排的（AI 寫的 #音效# 不理）；沒有就照舊（行內的優先，再來尾格的）
        _sfxFor: function(inline, tail) {
            if (this._jevSfx) { const j = this._jevSfxNow; this._jevSfxNow = null; return j || 'NA'; }
            return (inline && inline !== 'NA') ? inline : (tail || 'NA');
        },
        // 時間表晚到（已經播了幾格）：這一場的音樂如果還沒放，現在補放；已經播過的格的音效就算了（音效是一瞬間的事）
        _jevSfxCatchUp: function() {
            const pl = this._jevSfx; if (!pl || !pl.bgm) return;
            const cur = this.index;
            // 🎵 09-26 她：「章節卡出來時有個 BGM，關掉章節卡開始第一句又換 BGM」——卡上那首其實是上一章還在放的，
            //    Jev 塞車、時間表在卡片出來之後才到，第一場那首一到就換。改成：已經開始的那一場、或卡片已經出來，
            //    而且正在放音樂 → Jev 晚到的這首不插隊，這一場照放；下一場開頭才照 Jev 換。
            //    整章一首都沒問到 → 沒在放就接著放上一首。
            if (!pl.bgm.length) { this._bgmResumeLast(); return; }
            const playing = this._bgmPlaying && this._bgmPlaying();
            const cardShown = this._ccShownSeq === this._jevStageSeq;
            // 「開始讀了」＝播過一句旁白或台詞（章節卡片那幾行都是 <…>／[…] 標籤，不算）
            const started = this.script.slice(0, cur + 1).some(l => { l = String(l || '').trim(); return (l && !/^[<\[]/.test(l)) || /^\[(?:Char|Nar)\|/.test(l); });
            const hold = playing && (started || cardShown);   // 她已經聽著一首在讀了 → 晚到的不插隊
            let firstSeg = null;
            try { const ST = window.OS_JEV_STAGE || (window.parent && window.parent.OS_JEV_STAGE); firstSeg = ST && ST._parse ? ST._parse(this.script).segs[0] : null; } catch (e) {}
            const isFirstScene = (r) => !!(firstSeg && r.line === firstSeg.line && r.occ === firstSeg.occ);
            let best = null, bestAt = -1;
            pl.bgm.forEach(r => {
                if (r.done) return;
                let n = -1, at = -1;
                for (let i = 0; i < this.script.length; i++) if (this.script[i] === r.line && ++n === r.occ) { at = i; break; }
                if (at < 0 || at > cur) return;
                r.done = 1;
                if (at > bestAt) { bestAt = at; best = r; }
            });
            // 還停在章節卡片（一句台詞旁白都還沒演）：第一場的音樂現在就放，卡片跟第一場是同一首，關掉卡片不會再換歌
            if (!best) {
                const first = !started && pl.bgm.find(r => !r.done);
                if (!first || !isFirstScene(first)) { if (!playing) this._bgmResumeLast(); return; }   // 第一場沒問到：先放上一首，下一場那首留給它自己的開頭
                if (hold) { first.done = 1; return; }   // 卡片已經在放上一首：第一場不換
                first.done = 1;
                if (this._ccOpen) { this._playBgm(first.id); this._ccSetBgm(first.id); }   // 卡片已經開著在等她按：現在就放，卡上的曲名也換成這首
                else this.script.splice(cur + 1, 0, '[BGM|' + first.id + '|jev]');
                return;
            }
            // 已經換到下一場了，別放上一場的。🚨 從那一場開頭的「下一行」算：一場常常就是從 [Bg|] 開始的（章節卡片裡那行），
            //    以前從開頭那行本身算，永遠判成換場了 → 時間表晚到的章，第一場的音樂一首都不放。
            //    🚨 章節卡片裡面那行 [Bg|] 不算換場（Jev 分場時 <ChapterCard> 整塊算一格，裡面的 [Bg|] 不算）：
            //    以前算進去，卡片開著時時間表才到 → 判成第一場已經過了 → 第一場那首永遠不放（09-26 修）。
            let inCard = false;
            for (let i = 0; i <= cur; i++) {
                const l = String(this.script[i] || '').trim();
                if (/^<chaptercard\b/i.test(l)) { inCard = true; continue; }
                if (/^<\/chaptercard>/i.test(l)) { inCard = false; continue; }
                if (i > bestAt && !inCard && /^\[Bg\|/i.test(l)) return;
            }
            if (hold) return;   // 這一場已經開始（或卡片已經在放）、正在放音樂：晚到的不中途換歌
            if (this._ccOpen) { this._playBgm(best.id); this._ccSetBgm(best.id); return; }   // 卡片開著在等她按：現在就放
            this.script.splice(cur + 1, 0, '[BGM|' + best.id + '|jev]');   // 下一次推進就播
        },
        _stageClear: function() { this._stageInit(); this._clearSlot(0); this._clearSlot(1); this._slotMemory = {}; this._pendingLeave = []; },   // 換景=站位記憶歸零(跨場景的陳舊記憶會害兩人搶同一格)+清待離場
        // 滯留清除：某格角色超過 N tick 沒當說話者 → 自動移除（防殘留），N 預設 5、可由 localStorage 覆寫
        _staleSweep: function() {
            this._stageInit();
            // 🎭 這章聽 Jev（os_jev_stage.js）就不做：考卷上這條收對 0 次、人還在就收掉 32 次；誰什麼時候走交給 Jev 的時間表
            if (this._jevStage) return;
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
        // 單張探測：載得動才算數（給 fallbackToAI 的世界書頭像用，死連結不落地）
        _probeImg: function(url) {
            return new Promise(res => { const t = new Image(); t.onload = () => res(true); t.onerror = () => res(false); t.src = url; });
        },

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
            this._mouthHalt();   // 👄 上一句還在動嘴：先換回原圖，下面換圖時才認得是同一張、不會重淡入
            this._blinkStart();  // 👁 有人上場就開始眨眼（兩格都沒人自己停）
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

        // 單格圖片解析鏈（圖鑑本地上傳(表情) → 表情立繪條目 → spriteBase → 意思最近的表情(本地上傳、條目) → 圖鑑本地上傳(預設) → 預設立繪條目 → charDefaultBase → sprite_cache → fallbackToAI），
        // 順序只有一份，圖鑑 os_char_gallery.js 照抄；改這裡要一起改那邊。
        // 條目層＝世界書【素材-角色表情立繪】/【素材-角色預設立繪素材】（重構前的老邏輯，2026-08-26 接回）；守衛改用「這格還是不是同角色」
        // 🔴 2026-09-14 她定：自備圖（世界書條目／網址庫）一律最先。「會放上去都是因為我做好才放上去的，不可能反過來」。
        //    手動生的立繪（sprite_cache）以前排第一，會把她放的圖整個蓋掉；現在排在自備圖之後、AI 生成之前（在 handleImgError 裡）。
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
            // 世界書【素材-角色表情立繪】(名字_表情→URL) → spriteBase 拼檔名；全走探測制，掛一個自動下一個
            if (!this._lorebookLoaded) { await this._loadLorebookAvatars(); this._lorebookLoaded = true; if (_stale()) return; }
            const urls = [];
            // 小劇場（大廳、地圖番外、小機培養室）裡的管理員：奧瑞亞官方立繪排最前（不是小劇場、不是管理員就回空的）。
            //   圖鑑的 resolveChar 不照抄這層：圖鑑看的是她的故事，官方那幾位在圖鑑另外一區。
            const off = this._officialSprite ? this._officialSprite(name) : '';
            if (off) urls.push(off);
            // 角色圖鑑的本地上傳最先（她在圖鑑裡親手放的）
            const _cg = win.OS_CHAR_GALLERY;
            if (_cg && _cg.localUrl) { const lu = await _cg.localUrl(name, exp); if (_stale()) return; if (lu) urls.push(lu); }
            this._nameVariants(name).forEach(v => { const u = this._lorebookExpCache[`${v}_${exp}`]; if (u && !urls.includes(u)) urls.push(u); });
            if (VN_Config.data.spriteBase) this._nameVariants(name).forEach(v => urls.push(`${VN_Config.data.spriteBase}${v}_${exp}.png`));
            // 寫的表情沒有那張：照意思找最近的（Smiling→Happy、Furious→Angry），圖鑑「生一組表情」做的那幾張靠這個接上
            const near = (_cg && _cg.nearExp) ? _cg.nearExp(exp) : '';
            if (near && near !== exp) {
                const ln = await _cg.localUrl(name, near); if (_stale()) return;
                if (ln && !urls.includes(ln)) urls.push(ln);
                this._nameVariants(name).forEach(v => { const u = this._lorebookExpCache[`${v}_${near}`]; if (u && !urls.includes(u)) urls.push(u); });
            }
            if (urls.length) this._tryLoad(img, urls, () => this.handleImgError(img), triggerAnim, _stale);
            else this.handleImgError(img);   // 沒有表情層來源 → 直接進預設立繪層（重構前行為：條目層不依賴 spriteBase 有沒有填）
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

            // 自備圖全沒有 → 手動做的立繪（sprite_cache：一鍵生立繪／裝扮室／相簿設為立繪／立繪工作室）→ 還是沒有才 AI 生成。
            //   通話頭像照舊不看立繪庫（以前就沒看，全身去背立繪塞不進通話那顆圓頭像）。
            const toSpriteOrAI = async () => {
                if (_stale()) return;
                if (!isCall) {
                    for (const v of this._nameVariants(lockedName)) {
                        const cached = await VN_Cache.get('sprite_cache', v);
                        if (_stale()) return;
                        if (cached?.url) { this._swapImage(img, cached.url, false, _stale, () => triggerAnim(img)); return; }
                    }
                }
                this.fallbackToAI(target, lockedName, lockedExp);
            };
            // 世界書【素材-角色預設立繪素材】(名字→URL) → charDefaultBase 拼檔名；掛了才往下找立繪庫／AI 生成
            const proceed = async () => {
                if (_stale()) return;
                const urls = [];
                // 角色圖鑑「預設」格的本地上傳最先
                const _cg = win.OS_CHAR_GALLERY;
                if (_cg && _cg.localUrl) { const lu = await _cg.localUrl(lockedName, 'default'); if (_stale()) return; if (lu) urls.push(lu); }
                this._nameVariants(lockedName).forEach(v => { const u = this._lorebookSpriteCache[v]; if (u && !urls.includes(u)) urls.push(u); });
                if (base) this._nameVariants(lockedName).forEach(v => urls.push(`${base}${v}_presets.png`));
                if (urls.length) this._tryLoad(img, urls, () => { if (_stale()) return; toSpriteOrAI(); }, isCall ? null : triggerAnim, _stale);
                else toSpriteOrAI();
            };
            if (!this._lorebookLoaded) {
                this._loadLorebookAvatars().then(() => { this._lorebookLoaded = true; proceed(); });
            } else proceed();
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
            if (lbUrl) {
                // 探測後才用：catbox 這類圖床時好時壞，死連結直接跳過往下走，別釘在畫面上變破圖標
                if (await this._probeImg(lbUrl)) { if (_stale()) return; show(lbUrl); return; }
                if (_stale()) return;
            }

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
                    if (cached.face) this._faceMemCache[name] = cached.face;
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
                        // 🚨 生成失敗不要在這裡 return —— 人物圖已經不回退 Pollinations（畫風不相容，
                        //    退了比沒有更糟），所以失敗是真的會發生的事。直接 return 會繞過下面那條
                        //    「最終預設立繪」，畫面上什麼都不會出現，看起來像卡住。讓 url 保持空的往下走。
                        if (img2) {
                            url = img2.objUrl; this._avatarMemCache[name] = img2.objUrl;
                            if (img2.face) this._faceMemCache[name] = img2.face;
                            if (img2.dataUrl) { try { await VN_Cache.set('avatar_cache', name, this._charRec(d, img2)); } catch(e) {} }
                        }
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
                const k = this._nameIn(box, name);   // 簡繁寫法不同也是同一個人
                return k != null ? box[k] : null;
            } catch (e) { return null; }
        },
        // 在「名字 → 資料」的表裡找這個人（先一字不差，再簡繁折成同一把鑰匙；見 os_zh_fold.js 的 pick）
        _nameIn: function(obj, name) {
            if (!obj || typeof obj !== 'object') return null;
            const Z = win.OS_ZH || window.OS_ZH;
            if (Z && Z.pick) return Z.pick(obj, name);
            return Object.prototype.hasOwnProperty.call(obj, name) ? name : null;
        },
        _charCV: function(name) {
            try {
                const T = win.VN_TTS;
                if (!T || !T.config) return null;
                const at = (obj) => { const k = this._nameIn(obj, name); return k != null ? obj[k] : null; };
                const manual = at(T.config.charMappings);
                const locked = (typeof T._cardLocks === 'function') ? at(T._cardLocks()) : null;
                const id = manual || locked || at(T._npcSessionCache) || null;
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
                if (!cv) { AUI.alert('這個角色目前沒有語音可保存'); return; }
                const T = win.VN_TTS;
                if (typeof T.lockNpcVoice === 'function') T.lockNpcVoice(name, cv.id);
                if (btn) { btn.textContent = '已鎖定 ✓'; btn.disabled = true; }
            } catch (e) { AUI.alert('保存失敗：' + (e?.message || e)); }
        },
        unlockCharCV: function(name, btn) {
            try {
                const T = win.VN_TTS;
                if (typeof T.unlockNpcVoice === 'function') T.unlockNpcVoice(name);
                if (btn) { btn.textContent = '已解除 ✓'; btn.disabled = true; }
            } catch (e) { AUI.alert('解除失敗：' + (e?.message || e)); }
        },
        // 真懶人：用角色頭像提示詞 → 生 512×896 立繪 → AI 模型去背 → 存 sprite_cache → 立繪即時換上
        autoGenSprite: async function(name, btn) {
            const orig = btn ? btn.textContent : '';
            const setT = (t) => { if (btn) btn.textContent = t; };
            try {
                if (btn) btn.disabled = true;
                setT('生成中…');
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
                // 前後綴、清洗、補下身、尺寸、帶翼加寬、負詞全交給 VN_Image.getSprite（劇情裡自動生立繪走的就是它）：
                //   以前這裡自己抄一份，空前綴當預設、還多剝 looking at viewer，同一個人兩邊生出來的構圖不一樣。force＝這顆就是要重生
                if (!win.OS_IMAGE_MANAGER || typeof win.OS_IMAGE_MANAGER.generate !== 'function') throw new Error('生圖引擎未就緒');
                const url = await (win.VN_Image || window.VN_Image).getSprite(rawP, true);   // vn_config 只把 VN_Image 掛在 window（其他 VN 檔都這樣拿）
                if (!url) throw new Error('生圖回傳空');
                const blob = await (await fetch(url)).blob();
                setT('去背中…');
                const removed = await this._stripSpriteBgAI(blob);   // 共用那支（顯卡、一張一張排隊；見 vn_core.js）
                if (!removed) throw new Error('去背失敗');
                const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(removed); });
                if (!win.VN_Cache) throw new Error('VN_Cache 未就緒');
                await win.VN_Cache.set('sprite_cache', name, { url: dataUrl, isRemoved: true, createdAt: Date.now() });
                // 立繪即時換上：該角色所在格重渲染
                this._stageInit();
                for (let i = 0; i < 2; i++) { if (this._stage[i] && this._stage[i].name === name) { const el = this._slotEl(i); if (el) el.classList.remove('vn-avatar'); this._renderSlot(i, name, this._stage[i].exp); } }
                setT('完成');
                setTimeout(() => { setT(orig); if (btn) btn.disabled = false; }, 1500);
            } catch (e) {
                console.error('[CharCard] 一鍵生立繪失敗:', e);
                setT(e && e.message ? e.message : '失敗');
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
        openCharCard: async function(idx) {
            this._stageInit();
            const slot = this._stage[idx];
            if (!slot || !slot.name) return;
            const name = slot.name;
            const st = this._readCharState(name) || {};
            const cv = this._charCV(name);
            const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            // 狀態面板煉過角色卡的話，這張卡就長成面板裡那個角色的樣子（面板有的欄位都在卡上，下面只接固定按鈕與 CV）
            const SCOPE = '#vn-char-card .vn-cc-avs-body';
            let avsCard = null;
            try { avsCard = win.OS_AVS && typeof win.OS_AVS.renderEntityCard === 'function' ? await win.OS_AVS.renderEntityCard(name, SCOPE) : null; } catch (e) { avsCard = null; }
            if (!this._stage[idx] || this._stage[idx].name !== name) return;   // 等的這一下換人了

            let card = document.getElementById('vn-char-card');
            if (!card) { card = document.createElement('div'); card.id = 'vn-char-card'; (document.getElementById('page-game') || document.body).appendChild(card); }
            card.className = 'vn-cc ' + (idx === 0 ? 'vn-cc-left' : 'vn-cc-right') + (avsCard ? ' vn-cc-avs' : '');
            const affRaw = st['好感度'];
            const aff = (affRaw === null || affRaw === undefined || affRaw === '') ? '—' : affRaw;
            const _cvTag = cv ? (cv.source === 'manual' ? '（已綁定·全域）' : (cv.source === 'cardlock' ? '（本卡已鎖）' : '')) : '';
            const cvText = cv ? (esc(cv.name) + _cvTag) : '—';
            // session=還沒鎖→「💾保存(本卡)」；cardlock=已鎖→「🔓解除」；manual=全域綁定→面板管、這裡不出按鈕
            let _cvBtn = '';
            if (cv && cv.source === 'session') _cvBtn = '<button class="vn-cc-mini" id="vn-cc-cv-save"><i class="fa-solid fa-floppy-disk"></i> 保存</button>';
            else if (cv && cv.source === 'cardlock') _cvBtn = '<button class="vn-cc-mini" id="vn-cc-cv-unlock"><i class="fa-solid fa-lock-open"></i> 解除</button>';
            const cvRow = '<div class="vn-cc-row"><span class="vn-cc-k">當前 CV</span><span class="vn-cc-v">' + cvText + '</span>' + _cvBtn + '</div>';
            const btns =
                '<button class="vn-cc-btn" id="vn-cc-gen"><i class="fa-solid fa-palette"></i> 一鍵生立繪（去背）</button>' +
                '<button class="vn-cc-btn" id="vn-cc-gallery"><i class="fa-solid fa-address-book"></i> 角色圖鑑</button>';
            const A = win.AUI || window.AUI;
            if (A && A.registerHelp) A.registerHelp({ vn_cc_lean: { title: '主角對他', body: '想靠近：你想攻略這個人，主角對他也有好感。寫劇情的 AI 會讓他照自己的日子過、在合理的場合出現在主角身邊，不讓他消失或只當路人。第一次選的時候會替他生三條好感規則（叫一次模型），存進狀態面板這個故事的條件規則裡，規則窗口看得到、改得動。\n\n疏遠：主角對他的好感在往下掉，寫到兩人互動時照這個心意。\n\n普通：都不提。\n\n每個故事各記各的。' } });
            const leanRow = this._isMcName(name) ? '' : '<div class="vn-cc-lean"><span class="vn-cc-k">主角對他</span><div class="vn-cc-seg">' +
                '<button type="button" data-s="near"><i class="fa-solid fa-heart"></i> 想靠近</button>' +
                '<button type="button" data-s="">普通</button>' +
                '<button type="button" data-s="far"><i class="fa-solid fa-heart-crack"></i> 疏遠</button>' +
                '</div>' + (A && A.helpBtn ? A.helpBtn('vn_cc_lean') : '') + '</div>';
            if (avsCard) {
                // 狀態面板那張卡＝AI 煉的模板＋劇情寫進去的數值（名字、形象這些是模型寫的，套模板時沒有轉義）
                //   → 面板 HTML 過 AUI.safeHtml（樣式、radio 分頁、<details> 照留，會跑的拿掉）；
                //   模板的 CSS 用 textContent 放進 <style>（照原樣、連 @import 字體都留，但跳不出 <style>）；
                //   下面那排按鈕是程式自己的（有 onclick），放在消毒外面
                const _A = win.AUI || window.AUI;
                card.innerHTML =
                    '<div class="vn-cc-avs-body"><style></style>' + (_A && _A.safeHtml ? _A.safeHtml(avsCard.html) : esc(String(avsCard.html || '').replace(/<[^>]+>/g, ' '))) + '</div>' +
                    '<div class="vn-cc-tools">' + leanRow + btns + cvRow + '</div>';
                card.querySelector('.vn-cc-avs-body > style').textContent = avsCard.css || '';
            } else {
                card.innerHTML =
                    '<div class="vn-cc-head"><span class="vn-cc-name"></span></div>' + leanRow + btns + cvRow +
                    '<div class="vn-cc-row"><span class="vn-cc-k">形象</span><span class="vn-cc-v">' + esc(st['形象'] || '—') + '</span></div>' +
                    '<div class="vn-cc-row"><span class="vn-cc-k">身分</span><span class="vn-cc-v">' + esc(st['身分'] || st['身份'] || '—') + '</span></div>' +
                    '<div class="vn-cc-row"><span class="vn-cc-k">好感度</span><span class="vn-cc-v">' + esc(aff) + '</span></div>';
                card.querySelector('.vn-cc-name').textContent = name;
            }
            card.querySelector('#vn-cc-gen').onclick = (e) => this.autoGenSprite(name, e.currentTarget);
            card.querySelector('#vn-cc-gallery').onclick = (e) => {
                const from = e.currentTarget;   // 劇情可能跑在浮動手機裡，也可能在主窗口：按鈕在哪就開在哪
                this.closeCharCard();
                const CG = win.OS_CHAR_GALLERY;
                if (CG) CG.open(name, { from });
            };
            const cvSaveBtn = card.querySelector('#vn-cc-cv-save');
            if (cvSaveBtn) cvSaveBtn.onclick = (e) => this.saveCharCV(name, e.currentTarget);
            const cvUnlockBtn = card.querySelector('#vn-cc-cv-unlock');
            if (cvUnlockBtn) cvUnlockBtn.onclick = (e) => this.unlockCharCV(name, e.currentTarget);
            card.querySelectorAll('.vn-cc-seg button').forEach(b => { b.onclick = () => this._pickLean(name, b.getAttribute('data-s') || '', card); });
            this._paintLean(card, name);
            card.style.display = 'block';
            this._ccIdx = idx;
            // 點卡片外面自動關（延遲一拍掛載，避免開卡這次的點擊立刻把它關掉）；按卡片叫出來的確認窗不算外面
            if (this._ccOutside) document.removeEventListener('pointerdown', this._ccOutside, true);
            this._ccOutside = (ev) => {
                const c = document.getElementById('vn-char-card');
                if (ev.target && ev.target.closest && ev.target.closest('.aud-mask')) return;
                if (c && c.style.display !== 'none' && !c.contains(ev.target)) this.closeCharCard();
            };
            setTimeout(() => { document.addEventListener('pointerdown', this._ccOutside, true); }, 0);
        },
        // 主角自己的卡不出「主角對他」那排（名字可能帶 **、簡繁不同）
        _isMcName: function(name) {
            let mc = '';
            try { mc = String(win.OS_PERSONA?.getName?.() || win.OS_API?.getGlobalUserName?.() || '').replace(/[*_`]/g, '').trim(); } catch (e) {}
            if (!mc || mc === 'User') return false;
            const k = s => { const t = String(s == null ? '' : s).replace(/[*_`]/g, '').trim(); try { if (win.OS_ZH?.key) return win.OS_ZH.key(t); } catch (e) {} return t.toLowerCase(); };
            return k(mc) === k(name);
        },
        // 💗 主角對他（想靠近／普通／疏遠）：存在線索帳那本，送出時接在〈線索帳〉裡（見 story_threads.js 的 setLean）
        _paintLean: async function(card, name) {
            const T = win.OS_STORY_THREADS;
            const row = card && card.querySelector('.vn-cc-lean');
            if (!row) return;
            if (!T || !T.getLean) { row.remove(); return; }   // 線索帳那支沒載到＝存不了，別擺一排按了沒反應的鈕
            let s = '';
            try { s = await T.getLean(name); } catch (e) {}
            row.querySelectorAll('.vn-cc-seg button').forEach(b => b.classList.toggle('on', (b.getAttribute('data-s') || '') === s));
        },
        _pickLean: async function(name, s, card) {
            const T = win.OS_STORY_THREADS;
            const R = win.OS_AVS_RULES;
            const A = win.AUI || window.AUI;
            if (!T || !T.setLean) return;
            const btns = card.querySelectorAll('.vn-cc-seg button');
            let cur = '';
            try { cur = await T.getLean(name); } catch (e) {}
            if (s === cur) return;
            let gen = false, target = null;
            if (s === 'near') {
                try { target = R && R.affinityTarget ? await R.affinityTarget(name) : null; } catch (e) { target = null; }
                let ok;
                if (!target) {
                    ok = await A.confirm('把' + name + '當成可攻略角色？\n\n寫劇情的 AI 會知道你想攻略他。他在狀態面板裡沒有好感度，所以不會生好感規則。', { title: '想靠近' });
                } else if (target.existing) {
                    // 已經有好感規則：問要不要照新寫法重生；不要也照樣設成想靠近
                    gen = await A.confirm('把' + name + '當成可攻略角色？\n\n他已經有 ' + target.existing + ' 條好感規則。要照新寫法重新生三條、換掉原本那幾條嗎？（叫一次模型）', { title: '想靠近', okText: '重新生成', cancelText: '照用原本的' });
                    ok = true;
                } else {
                    ok = gen = await A.confirm('把' + name + '當成可攻略角色？\n\n會替他生三條好感規則，存進這個故事的條件規則（叫一次模型）。', { title: '想靠近' });
                }
                if (!ok) return;
            }
            const saved = await T.setLean(name, s);
            if (!saved) { A.toastr.error('沒存起來：找不到目前這個故事，或存檔失敗'); return; }
            this._paintLean(card, name);
            if (!gen) return;
            const nearBtn = card.querySelector('.vn-cc-seg button[data-s="near"]');
            const orig = nearBtn ? nearBtn.innerHTML : '';
            btns.forEach(b => { b.disabled = true; });
            if (nearBtn) nearBtn.textContent = '生成中…';
            let n = 0;
            try { n = await R.generateAffinityFor(name, target); } catch (e) { console.warn('[CharCard] 生好感規則失敗', e); }
            btns.forEach(b => { b.disabled = false; });
            if (nearBtn) nearBtn.innerHTML = orig;
            if (n > 0) A.toastr.success('已替' + name + '生好 ' + n + ' 條好感規則');
            else A.toastr.warning('這次沒生出規則；想靠近已經設好了，可以到狀態面板的規則窗口再生一次');
        },
        closeCharCard: function() {
            const card = document.getElementById('vn-char-card');
            if (card) card.style.display = 'none';
            for (let i = 0; i < 2; i++) { const el = this._slotEl ? this._slotEl(i) : null; if (el) el.classList.remove('vn-cc-shift-l', 'vn-cc-shift-r'); }
            if (this._ccOutside) { document.removeEventListener('pointerdown', this._ccOutside, true); this._ccOutside = null; }
            this._ccIdx = null;
        },

        // ===== 👄 講話動嘴（11-04）／👁 眨眼（11-05）=====
        //   角色圖鑑「生表情」會替每張圖存嘴（微張、張開）和閉眼的小塊（OS_CHAR_GALLERY.faceFor 認得出是哪張；自己沒有的借同一類表情的）。
        //   這格現在那張對得上，就疊成幾份完整的圖（object URL）：嘴微張、嘴張開、閉眼、閉眼＋嘴微張、閉眼＋嘴張開。
        //   講話時（字還在打、配音還在響）嘴在三種之間換；平常隔幾秒閉一下眼（0.1 秒，偶爾連眨兩下），講話時照樣眨。
        //   嘴、眼各自只改狀態，該顯示哪一份由 _faceApply 算。
        //   🚨 只直接換 img.src，不走 _showEl／_swapImage（那兩支會重跑淡入）；舞台要換圖之前先 _mouthHalt 換回原圖，
        //      _showEl／_swapImage 也會用 _faceBase 認出「這是原圖疊出來的那幾份」，當作同一張、不重淡入。
        _mouthTok: 0,
        _mouthRun: null,
        // 這格現在顯示的是疊出來的哪一份 → 回原圖網址；不是疊出來的回空字串
        _faceBase: function(el) {
            const s = el && el.getAttribute && el.getAttribute('src');
            return (s && this._frameBase && this._frameBase.get(s)) || '';
        },
        // 照嘴、眼現在的狀態換成該顯示的那一份
        _faceApply: function(img) {
            if (!img) return;
            const run = (this._mouthRun && this._mouthRun.img === img) ? this._mouthRun : null;
            const b = (this._blinks || []).find(x => x && x.img === img) || null;
            const base = run ? run.base : (b ? b.base : '');
            const fr = run ? run.fr : (b ? b.fr : null);
            if (!base || !fr) return;
            const cur = img.getAttribute('src') || '';
            if (cur !== base && this._faceBase(img) !== base) return;   // 舞台已經換了別張：不碰
            const m = run ? run.mouth : 'closed';
            const shut = !!(b && b.shut && b.base === base && fr.shut);
            let url = base;
            if (shut) url = m === 'closed' ? fr.shut : (fr[m === 'half' ? 'shutHalf' : 'shutOpen'] || fr[m] || fr.shut);
            else if (m !== 'closed' && fr[m]) url = fr[m];
            if (cur !== url) img.src = url;
        },
        _mouthHalt: function() {
            this._mouthTok++;
            this._mouthRun = null;
            // 講話的那格、眨眼眨到一半的那格：都換回原圖
            (this._blinks || []).forEach(b => { if (b) b.shut = false; });
            for (let i = 0; i < 2; i++) { const el = this._slotEl(i), base = this._faceBase(el); if (base) el.src = base; }
        },
        _voiceBusy: function() {
            try { const VC = win.OS_VOICE_CAST; if (VC && VC.isPlaying && VC.isPlaying()) return true; } catch (e) {}
            try { const a = win.VN_TTS && win.VN_TTS._currentAudio; if (a && !a.paused && !a.ended) return true; } catch (e) {}
            return false;
        },
        // 這張圖疊好的那幾份：{ half, open, shut, shutHalf, shutOpen }（沒有的那樣不在；嘴、眼都沒有回 null）。
        //   exp＝劇情寫的表情：這張圖自己沒有時，圖鑑借同一個人同一類表情的（講話就要動嘴，跟表情無關）
        //   講話時、眨眼時同一張圖同時來問，只疊一次
        _mouthFramesFor: async function(name, img, base, exp) {
            const cache = this._mouthFrameCache || (this._mouthFrameCache = new Map());
            const pend = this._mouthFramePend || (this._mouthFramePend = new Map());
            const fb = this._frameBase || (this._frameBase = new Map());
            const G = win.OS_CHAR_GALLERY || window.OS_CHAR_GALLERY;
            // 鍵帶圖鑑的嘴版號：先看過劇情（記了「這張沒有嘴」）、才去圖鑑做嘴，回來要重問，不能等整頁重整
            const key = name + '｜' + (exp || '') + '｜' + (G && G.mouthRev ? G.mouthRev() : 0) + '｜' + base.length + base.slice(-64);
            if (cache.has(key)) return cache.get(key);
            if (pend.has(key)) return pend.get(key);
            const job = (async () => {
                let fr = null;
                try {
                    const load = (s, cors) => new Promise((res, rej) => { const i = new Image(); if (cors) i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = s; });
                    // 🚨 網址圖（世界書立繪放在 GitHub Pages、catbox 那種）：舞台那張 <img> 是普通讀法，畫進畫布會被瀏覽器擋，
                    //   比對、疊嘴都做不了（11-04 她：「還是沒動」）。另外用跨站讀法載一份同樣的圖來用；圖鑑做嘴時也是這樣讀的，讀得到才做得出嘴
                    const pic = /^https?:/i.test(base) ? await load(base, true) : img;
                    // 這張是哪一筆：圖鑑做嘴時記了照哪一筆做的，一字不差最準（11-04 她酒館裡只靠縮圖比，重生過的那張分不清）。
                    //   AI 生的立繪在舞台上是轉出來的 blob 網址：照名字找回頭像快取裡原本那筆
                    let sk = (G && G.srcKey) ? G.srcKey(base) : '';
                    if (!sk && /^blob:/.test(base) && VN_Cache) {
                        for (const v of this._nameVariants(name)) {
                            if (this._avatarMemCache && this._avatarMemCache[v] === base) { const c = await VN_Cache.get('avatar_cache', v); if (c && c.url) sk = G.srcKey(c.url); break; }
                        }
                    }
                    const F = (G && G.faceFor) ? await G.faceFor(name, pic, sk, exp)
                        : { mouth: (G && G.mouthFor) ? await G.mouthFor(name, pic, sk, exp) : null, eyes: null };
                    const M = F.mouth, E = (F.eyes && F.eyes.eye) ? F.eyes : null;
                    if (M || E) {
                        const W = pic.naturalWidth, H = pic.naturalHeight;
                        const lm = M ? { half: await load(M.half), open: await load(M.open) } : null;
                        const le = E ? await load(E.shut) : null;
                        const make = async (m, shut) => {
                            const c = document.createElement('canvas'); c.width = W; c.height = H;
                            const g = c.getContext('2d'); g.drawImage(pic, 0, 0);
                            if (m) g.drawImage(lm[m], M.box.x, M.box.y, M.box.w, M.box.h);
                            if (shut) g.drawImage(le, E.eye.x, E.eye.y, E.eye.w, E.eye.h);
                            const blob = await new Promise(r => c.toBlob(r, 'image/png'));
                            const u = URL.createObjectURL(blob);
                            fb.set(u, base);
                            return u;
                        };
                        fr = {};
                        // 呼吸分頭和身體用（_breathNeck）：臉圈底下再一點＝脖子（圖高的幾成）
                        const FE = M || E;
                        if (FE && FE.face && (FE.h || H)) fr.neck = Math.min(0.95, (FE.face.y + FE.face.h * 1.1) / (FE.h || H));
                        if (lm) { fr.half = await make('half', false); fr.open = await make('open', false); }
                        if (le) fr.shut = await make(null, true);
                        // 閉眼＋講話那兩份背後再疊：講話剛好眨眼才用得到，還沒好那一下就照樣換嘴、先不閉
                        if (lm && le) (async () => {
                            try {
                                for (const m of ['half', 'open']) {
                                    const u = await make(m, true);
                                    if (fr._gone) { try { URL.revokeObjectURL(u); } catch (e) {} fb.delete(u); return; }
                                    fr[m === 'half' ? 'shutHalf' : 'shutOpen'] = u;
                                }
                            } catch (e) {}
                        })();
                    }
                } catch (err) { fr = null; }   // 跨站也讀不到的網址圖 → 這張不動嘴、不眨眼
                pend.delete(key);
                cache.set(key, fr);
                if (cache.size > 6) {   // 最多留 6 張圖疊好的（一張五份），舊的放掉（還在畫面上、還在用的不放）；手機記憶體有限
                    const k0 = cache.keys().next().value, v0 = cache.get(k0);
                    cache.delete(k0);
                    if (v0) {
                        const urls = ['half', 'open', 'shut', 'shutHalf', 'shutOpen'].map(k => v0[k]).filter(Boolean);
                        const shown = [0, 1].map(i => { const el = this._slotEl(i); return el ? el.getAttribute('src') : ''; });
                        const busy = (this._mouthRun && this._mouthRun.fr === v0) || (this._blinks || []).some(b => b && b.fr === v0) || urls.some(u => shown.indexOf(u) >= 0);
                        if (!busy) { v0._gone = true; urls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} fb.delete(u); }); }
                    }
                }
                return fr;
            })();
            pend.set(key, job);
            return job;
        },
        // ===== 👁 眨眼：舞台兩格各自隔幾秒閉一下眼 =====
        //   有圖上場（_showEl、updateSprite）就開始跑；兩格都沒人就停。畫面在背景、圖還沒淡入完的時候不眨
        _blinks: null,
        _blinkTimer: 0,
        _blinkStart: function() {
            if (this._blinkTimer) return;
            const tick = () => {
                this._blinkTimer = 0;
                let busy = false;
                try { busy = this._blinkTick(); } catch (e) {}
                if (busy !== null) this._blinkTimer = setTimeout(tick, busy ? 120 : 1000);
            };
            this._blinkTimer = setTimeout(tick, 120);
        },
        // 回 true＝有圖在畫面上（下一下 0.12 秒後）、false＝人在場但看不到（1 秒後再看）、null＝兩格都沒人（停）
        _blinkTick: function() {
            this._stageInit();
            const bl = this._blinks || (this._blinks = [null, null]);
            const G = win.OS_CHAR_GALLERY || window.OS_CHAR_GALLERY;
            const rev = G && G.mouthRev ? G.mouthRev() : 0;
            const now = Date.now();
            let anyone = false, shown = false;
            for (let i = 0; i < 2; i++) {
                const st = this._stage[i], img = this._slotEl(i);
                if (!st || !img || !img.isConnected) { bl[i] = null; continue; }
                anyone = true;
                let b = bl[i];
                if (!b || b.img !== img || b.name !== st.name) b = bl[i] = { img, name: st.name, base: '', exp: '', rev: -1, fr: null, shut: false, next: now + 1500 + Math.random() * 2500 };
                if (document.hidden || img.style.display === 'none' || img.style.opacity !== '1' || !img.getClientRects().length || !img.complete || !img.naturalWidth) continue;
                shown = true;
                try { this._breathTick(img, st); } catch (e) {}   // 🫁 停穩了就把頭跟身體分開呼吸（頭不拉長）
                const base = this._faceBase(img) || img.getAttribute('src') || '';
                const exp = String(st.exp || '');
                if (!base) continue;
                if (b.base !== base || b.exp !== exp || b.rev !== rev) {   // 換了張圖（或圖鑑剛做了新的）：問這張有沒有閉眼
                    b.base = base; b.exp = exp; b.rev = rev; b.fr = null; b.shut = false;
                    this._mouthFramesFor(st.name, img, base, exp).then(fr => { if (b.base === base && b.exp === exp) b.fr = fr; }, () => {});
                    continue;
                }
                if (!b.fr || !b.fr.shut || b.shut || now < b.next) continue;
                // 閉 0.1 秒左右；兩成機率接著再眨一下
                b.shut = true; b.next = Infinity;
                this._faceApply(img);
                const again = Math.random() < 0.2;
                setTimeout(() => {
                    b.shut = false;
                    this._faceApply(img);
                    b.next = Date.now() + (again ? 160 : 2500 + Math.random() * 3500);
                }, 100 + Math.random() * 40);
            }
            return anyone ? shown : null;
        },
        // ===== 🫁 呼吸時頭不拉長（11-06）=====
        //   CSS 的 vnBreath 是整張以屁股那條線為準上下伸縮，頭也跟著被拉長一點（她：「脖子上能不能也衰減一下，不然頭有拉伸感」）。
        //   圖停穩的時候，在這格上面疊一張一樣的圖（.vn-breath-head）只露脖子以上、跟著脖子那一點平移不伸縮，蓋住底下被拉長的頭。
        //   這格自己不動（照舊整張伸縮、影子也由它出）；頭那張不帶影子。脖子在哪：圖鑑記的臉圈（做過動嘴、眨眼的）→
        //   去背輪廓頭底下最窄那排再往下到開始變寬（肩膀）那排 → 都認不出就不疊（照舊整張伸縮）。
        //   講話、眨眼換的那幾份（_faceBase 認得的）只照抄過去，不收。
        //   🚨 兩張都帶影子、各剪一半的做法試過（11-06）：換手那條線上影子會疊兩次或缺一塊，背景上看得到一條線，所以影子只留一份
        // ── 疊上去、收起來那一下不能跳（11-13 她：「校準前一秒露餡…替換固定頭部的圖插入有高低差，我眼睛看的到」）──
        //   兩張只在吸氣時不一樣（吸滿時頭頂差 1～2 點）。以前一有變化（換說話的人變暗、手機換近遠大小）就當場收起來、
        //   停穩 0.3 秒再在呼吸的隨便哪一刻蓋回去：收那下頭掉一截、蓋回那下又跳上來，每換一次人抖一次。現在：
        //   ① 蓋上去那一格，頭那張先跟底下那張一模一樣（一起伸縮），1.2 秒內再慢慢變成頭不拉長（_breathRamp），看不出換手；
        //      算不出呼吸曲線的話退回等吐氣到底（兩張完全疊在一起）那一格才蓋
        //   ② 變暗變亮、換近遠大小、換位置、左右搖晃、視窗大小變了：不收，頭那張照抄底下那張的位置、大小、明暗，
        //      還在過渡就每一格照抄（_breathSync、_breathFollow）
        //   ③ 還是得收的只剩：換別張圖（會先整張淡出再淡入）、撤下、嚇一跳（有放大）、頭像框——那一下整張圖本來就在變
        _breathSt: null,
        _breathSig: function(img) {   // 這格的樣子（class＋行內樣式）：變了就重新對一次
            //   空白全拿掉：同樣的樣式瀏覽器排出來的字，尾巴有時多一個空格
            return img.className + '|' + String(img.style.cssText || '').replace(/\s+/g, '');
        },
        _breathOf: function(img) {
            const S = this._breathSt || (this._breathSt = new Map());
            let s = S.get(img);
            if (s) return s;
            s = { img, head: null, on: false, wait: false, busy: false, base: '', neck: null, sig: this._breathSig(img), changed: Date.now(), anim: null, ramp: null, kfKey: '', tok: 0, follow: false };
            S.set(img, s);
            new MutationObserver(recs => {
                let other = false, src = false;
                recs.forEach(r => { if (r.attributeName === 'src') src = true; else other = true; });
                if (src && (s.on || s.wait)) {
                    const base = this._faceBase(img) || img.getAttribute('src') || '';
                    if (base !== s.base) { s.changed = Date.now(); this._breathOff(s); return; }   // 換了別張圖
                    if (s.head) s.head.src = img.getAttribute('src');   // 講話、眨眼換的那幾份：頭那張跟著換（同一輪、畫面上不會差一格）
                }
                if (other) {
                    const sig = this._breathSig(img);
                    if (sig === s.sig) return;
                    s.sig = sig; s.changed = Date.now();
                    if (s.on) this._breathSync(s);   // 疊著：當場跟上（跟不上的才收）
                    else this._breathOff(s);         // 還在等吐氣到底：這次先不疊，停穩再重來
                }
            }).observe(img, { attributes: true, attributeFilter: ['src', 'class', 'style'] });
            if (!this._breathWatch) {   // 視窗、劇情畫面大小變了：疊著的當場重算位置（同一格畫面），還在等的取消
                this._breathWatch = true;
                const re = () => { (this._breathSt || new Map()).forEach(x => { x.changed = Date.now(); if (x.on) this._breathSync(x); else this._breathOff(x); }); };
                try { (img.ownerDocument.defaultView || window).addEventListener('resize', re); } catch (e) {}
                try { const box = img.parentNode, RO = (img.ownerDocument.defaultView || window).ResizeObserver; if (box && RO) new RO(re).observe(box); } catch (e) {}
            }
            return s;
        },
        _breathOff: function(s) {
            if (!s) return;
            s.tok++;   // 還在等吐氣到底的那次也一起取消
            if (!s.on) return;
            s.on = false;
            if (s.anim) { try { s.anim.cancel(); } catch (e) {} s.anim = null; }
            if (s.ramp) { try { s.ramp.anim.cancel(); } catch (e) {} s.ramp = null; }
            s.kfKey = '';
            if (s.head) s.head.style.display = 'none';
        },
        // 眨眼那邊每 0.12 秒巡一次（圖在畫面上才叫）
        _breathTick: function(img, st) {
            const s = this._breathOf(img);
            if (s.on) { if (!s.follow) this._breathSync(s); return; }   // 疊著：順便對一次（漏接的變化也補上）
            if (s.busy) return;
            if (Date.now() - s.changed < 300) return;
            if (img.style.display !== 'block' || img.style.opacity !== '1' || !img.complete || !img.naturalWidth) return;
            if (!img.getAnimations) return;
            const anims = img.getAnimations();
            const br = anims.find(a => a.animationName === 'vnBreath');
            if (!br || br.playState !== 'running' || br.startTime == null) return;   // 不呼吸（頭像框、減少動態）就不用分
            if (anims.some(a => a !== br && a.playState === 'running')) return;      // 淡入、換位置、搖晃還在跑
            const base = this._faceBase(img) || img.getAttribute('src') || '';
            if (!base) return;
            const C = this._breathNeckCache || (this._breathNeckCache = new Map());
            s.busy = true;
            const done = () => { s.busy = false; };
            if (!C.has(base)) { this._breathNeck(img, base, st).then(done, done); return; }
            const neck = C.get(base);
            if (!neck) { done(); return; }   // 認不出脖子：照舊整張伸縮
            this._breathSplit(s, br, base, neck).then(done, () => { done(); this._breathOff(s); });
        },
        // 脖子：{ frac＝在圖高的幾成, spans＝那一排人身上（不透明）的幾段 [左, 右]（圖寬的幾成）}；認不出記 null
        //   要讀得到這張圖的點才分（接縫要知道哪裡是人）：別的網站沒開放的圖照舊整張伸縮
        _breathNeck: async function(img, base, st) {
            const C = this._breathNeckCache || (this._breathNeckCache = new Map());
            let out = null;
            try {
                const fr = st ? await this._mouthFramesFor(st.name, img, base, String(st.exp || '')) : null;
                const pic = /^https?:/i.test(base)
                    ? await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = base; })
                    : await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = base; });
                out = this._breathSilNeck(pic, fr && fr.neck);
            } catch (e) { out = null; }
            C.set(base, out);
            if (C.size > 24) C.delete(C.keys().next().value);
        },
        // 去背輪廓：每排有幾點不透明。頭最寬那排往下找最窄那排，再往下到「開始變寬」（肩膀）那排＝脖子。
        //   最窄那排不一定是脖子：肩膀高、頭微低的人，下巴旁邊就是肩膀，最窄的是嘴巴那排（11-06 測試員就是）。
        //   given＝圖鑑臉圈推的（做過動嘴、眨眼的），有就用它，這裡只算那排的人在哪幾段。沒去背、長髮蓋住脖子（不變窄）→ null
        _breathSilNeck: function(pic, given) {
            const nh = pic.naturalHeight, nw = pic.naturalWidth;
            if (!nh || !nw) return null;
            const H0 = 240, W0 = Math.max(8, Math.round(nw * H0 / nh));
            const c = document.createElement('canvas'); c.width = W0; c.height = H0;
            const g = c.getContext('2d', { willReadFrequently: true });
            g.drawImage(pic, 0, 0, W0, H0);
            let d;
            try { d = g.getImageData(0, 0, W0, H0).data; } catch (e) { return null; }   // 別的網站的圖讀不到
            const A = (x, y) => d[(y * W0 + x) * 4 + 3];
            const w = new Array(H0).fill(0);
            let clear = 0;
            for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) { if (A(x, y) > 40) w[y]++; else clear++; }
            if (clear < W0 * H0 * 0.05) return null;
            let ny = -1;
            if (given > 0 && given < 1) ny = Math.min(H0 - 1, Math.floor(given * H0));
            else {
                let top = w.findIndex(v => v > 0), bot = H0 - 1;
                if (top < 0) return null;
                while (bot > top && !w[bot]) bot--;
                const F = bot - top;
                if (F < 40) return null;
                const sm = w.map((v, i) => ((w[i - 1] != null ? w[i - 1] : v) + v + (w[i + 1] != null ? w[i + 1] : v)) / 3);
                let hy = top, hmax = 0;
                for (let y = top; y <= top + F * 0.25; y++) if (sm[y] > hmax) { hmax = sm[y]; hy = y; }
                let nmin = Infinity, my = -1;
                for (let y = hy + 1; y <= top + F * 0.45; y++) if (sm[y] < nmin) { nmin = sm[y]; my = y; }
                if (my < 0 || nmin > hmax * 0.8) return null;
                for (let y = my + 1; y <= Math.min(bot, my + F * 0.2); y++) if (sm[y] > nmin * 1.3) { ny = y - 1; break; }
                if (ny < 0) return null;
            }
            // 那一排人身上的幾段（不透明＞一半）
            const spans = [];
            let a = -1;
            for (let x = 0; x <= W0; x++) {
                const on = x < W0 && A(x, ny) > 128;
                if (on && a < 0) a = x;
                if (!on && a >= 0) { spans.push([a / W0, x / W0]); a = -1; }
            }
            if (!spans.length) return null;
            return { frac: (ny + 0.5) / H0, spans };
        },
        // 底下那張現在畫在哪、多大、什麼明暗、呼吸到哪（sy）：頭那張照抄用。
        //   跟不上的回 null：看不到、半透明（淡入淡出時兩張疊著，頭會比身體實）、有放大旋轉的效果（嚇一跳）、沒在呼吸。
        //   moving＝還有別的效果或過渡在跑（變暗那 0.35 秒、換近遠那 0.32 秒、搖晃那 0.4 秒），要每一格跟
        _breathGeom: function(s) {
            const img = s.img, neck = s.neck;
            if (!neck || !img.isConnected || img.style.display !== 'block' || img.style.opacity !== '1' || !img.complete || !img.naturalWidth || !img.getAnimations) return null;
            const view = img.ownerDocument.defaultView || window;
            const anims = img.getAnimations();
            const br = anims.find(a => a.animationName === 'vnBreath');
            // 呼吸被暫停（目前沒有地方會停，測試凍結畫面時會）：頭那張跟著停在同一刻，不收
            if (!br || !(br.playState === 'running' ? br.startTime != null : br.playState === 'paused' && br.currentTime != null)) return null;
            const cs = view.getComputedStyle(img);
            if (cs.display === 'none' || cs.visibility === 'hidden' || !(parseFloat(cs.opacity) >= 0.999)) return null;
            // 別的效果只跟得上平移（左右搖晃）：嚇一跳那種有放大的，脖子對不齊
            let tx = 0, tf = 'none';
            const m = String(cs.transform || 'none');
            if (m !== 'none') {
                const v = (m.match(/^matrix\(([^)]*)\)$/) || [])[1];
                const n = v ? v.split(',').map(Number) : [];
                if (n.length !== 6 || Math.abs(n[0] - 1) > 1e-6 || Math.abs(n[1]) > 1e-6 || Math.abs(n[2]) > 1e-6 || Math.abs(n[3] - 1) > 1e-6) return null;
                tx = n[4]; tf = 'translate(' + n[4] + 'px, ' + n[5] + 'px)';
            }
            if (String(cs.rotate || 'none') !== 'none' || String(cs.translate || 'none') !== 'none') return null;
            const W = parseFloat(cs.width), H = parseFloat(cs.height), nw = img.naturalWidth, nh = img.naturalHeight;
            if (!(W > 0 && H > 0)) return null;
            // 圖畫在框裡的哪裡（object-fit: contain＋object-position，靠底）
            let dw = W, dh = H;
            if (cs.objectFit === 'contain') { const k = Math.min(W / nw, H / nh); dw = nw * k; dh = nh * k; }
            const op = String(cs.objectPosition || '50% 50%').split(/\s+/);
            const at = (v, free) => /%$/.test(v || '') ? free * parseFloat(v) / 100 : (parseFloat(v) || 0);
            const top = at(op[1] || '50%', H - dh);
            const neckY = top + neck.frac * dh;
            const oy = parseFloat(String(cs.transformOrigin).split(/\s+/)[1]);
            if (!(oy > neckY)) return null;
            // 左右照實際位置（有小數；呼吸只拉高度，左右不受影響；搖晃的平移另外照抄，這裡扣掉），上下照框（靠底）
            const parent = img.offsetParent || img.parentNode;
            const r = img.getBoundingClientRect(), pr = parent.getBoundingClientRect();
            const left = r.left - pr.left - (parent.clientLeft || 0) - tx;
            const topPx = (cs.bottom && cs.bottom !== 'auto') ? (parent.clientHeight - parseFloat(cs.bottom) - H) : img.offsetTop;
            const sp = String(cs.scale || 'none').trim().split(/\s+/);
            const sy = sp[0] === 'none' ? 1 : (parseFloat(sp[1] || sp[0]) || 1);
            // 影子只由這格自己出（它不剪，整張照舊伸縮）：頭那張不帶影子，只蓋在上面。
            //   兩張各帶影子的話，換手那條線上影子會疊兩次或缺一塊，背景上看得到一條線（11-06 試過剪齊、只在人身上重疊都還在）
            const f = String(cs.filter || '').replace(/drop-shadow\((?:[^()]|\([^()]*\))*\)/g, '').trim();
            return { br, sy, W, H, left, top: topPx, neckY, oy, span: neck.frac * dh, fit: cs.objectFit, pos: cs.objectPosition, origin: cs.transformOrigin,
                     filter: f || 'none', z: cs.zIndex, tf, moving: anims.some(a => a !== br && a.playState === 'running') };
        },
        // 頭那張的動畫：照 CSS 那份關鍵影格逐格換算（scale: 1 sy → 脖子那點往上移多少；d＝轉軸到脖子幾點），時間跟這格的呼吸對齊
        _breathHeadKf: function(br, d) {
            return br.effect.getKeyframes().map(k => {
                const p = String(k.scale || '1').trim().split(/\s+/), sy = parseFloat(p[1] || p[0]) || 1;
                // 🚨 scale 那格不能省：動畫有 scale 的圖，瀏覽器對齊像素的方式跟只有 translate 的不一樣，
                //   省掉的話頭那張會跟底下那張差 0.2～0.4 點，邊緣有重影（11-06 三種螢幕量過，帶上就剛好疊在一起）。
                //   每格都寫 1 1 的話瀏覽器當它沒在動、照樣不對齊，所以吸氣那格多一點點（十萬分之一，600 點高差不到 0.01 點）
                return { offset: k.computedOffset, easing: k.easing || 'linear', scale: sy === 1 ? '1 1' : '1 1.00001', translate: '0px ' + (-(sy - 1) * d).toFixed(3) + 'px' };
            });
        },
        // 頭那張照 _breathGeom 量到的擺好；呼吸動畫跟這格的呼吸同一個起點（大小變了、轉軸到脖子的距離變了就換關鍵影格，起點不動）
        _breathApply: function(s, g) {
            const h = s.head, hs = h.style;
            hs.left = g.left + 'px'; hs.top = g.top + 'px'; hs.width = g.W + 'px'; hs.height = g.H + 'px';
            hs.objectFit = g.fit; hs.objectPosition = g.pos; hs.transformOrigin = g.origin; hs.transform = g.tf;
            hs.filter = g.filter; hs.zIndex = g.z; hs.opacity = '1';
            hs.clipPath = 'polygon(-50% -50%, 150% -50%, 150% ' + g.neckY.toFixed(2) + 'px, -50% ' + g.neckY.toFixed(2) + 'px)';
            const t = g.br.effect.getTiming(), d = g.oy - g.neckY, key = d.toFixed(3);
            if (!s.anim) {
                s.anim = h.animate(this._breathHeadKf(g.br, d), { duration: t.duration, delay: t.delay || 0, iterations: Infinity, fill: 'both' });
                s.kfKey = key;
            } else {
                if (s.kfKey !== key) { s.anim.effect.setKeyframes(this._breathHeadKf(g.br, d)); s.kfKey = key; }
                const ht = s.anim.effect.getTiming();
                if (ht.duration !== t.duration || (ht.delay || 0) !== (t.delay || 0)) s.anim.effect.updateTiming({ duration: t.duration, delay: t.delay || 0 });
            }
            if (g.br.playState === 'paused') {   // 底下那張停住：頭那張停在同一刻（慢慢變那段照時間走、停不住，直接變完）
                if (s.ramp) { try { s.ramp.anim.cancel(); } catch (e) {} s.ramp = null; }
                if (s.anim.playState !== 'paused') s.anim.pause();
                if (Math.abs((s.anim.currentTime || 0) - g.br.currentTime) > 0.01) s.anim.currentTime = g.br.currentTime;
                return;
            }
            if (s.anim.playState === 'paused') s.anim.play();
            if (s.anim.startTime == null || Math.abs(s.anim.startTime - g.br.startTime) > 0.01) s.anim.startTime = g.br.startTime;
            if (s.ramp) {   // 剛蓋上去、還在慢慢變的那段：變完就拆；大小或呼吸起點變了，剩下那段照新的重算（變到哪照舊接著）
                const now = this._breathNow(s);
                if (now == null || now >= s.ramp.t0 + s.ramp.R - 1) { try { s.ramp.anim.cancel(); } catch (e) {} s.ramp = null; }
                else if (s.ramp.key !== key || Math.abs(s.ramp.st - g.br.startTime) > 0.01) this._breathRamp(s, g, s.ramp.t0, s.ramp.R);
            }
        },
        _breathNow: function(s) {
            const tl = s.img.ownerDocument.timeline;
            return tl && tl.currentTime != null ? tl.currentTime : null;
        },
        // 剛蓋上去那段：頭那張從「跟底下那張一模一樣（整張伸縮）」在 R 毫秒內慢慢變成「頭整塊跟著脖子走」。
        //   t0＝開始變的那一刻（時間軸上），變到哪＝(現在−t0)/R 再抹平頭尾；每 33 毫秒算一格，格跟格之間直線接
        _breathRamp: function(s, g, t0, R, fn) {
            if (s.ramp) { try { s.ramp.anim.cancel(); } catch (e) {} s.ramp = null; }
            const now = this._breathNow(s);
            fn = fn || this._breathCurve(g.br);
            if (now == null || !fn) return;
            if (t0 == null) t0 = now;
            if (!R) R = 1200;
            const end = t0 + R;
            if (end - now < 30) return;
            const d = g.oy - g.neckY, N = Math.max(4, Math.ceil((end - now) / 33)), kf = [];
            for (let i = 0; i <= N; i++) {
                const t = now + (end - now) * i / N;
                const x = Math.min(1, Math.max(0, (t - t0) / R)), w = x * x * (3 - 2 * x);
                const sy = fn(t);
                // 底下那張伸縮多少（sy），頭那張就剩 (1−w) 那麼多跟著伸縮、其餘 w 換成整塊平移；吸氣那邊照 _breathHeadKf 留十萬分之一
                const S = 1 + (1 - w) * (sy - 1) + (Math.abs(sy - 1) > 1e-9 ? w * 0.00001 : 0);
                kf.push({ offset: i / N, easing: 'linear', scale: '1 ' + S.toFixed(7), translate: '0px ' + (-w * (sy - 1) * d).toFixed(3) + 'px' });
            }
            const a = s.head.animate(kf, { duration: end - now, fill: 'none' });
            a.startTime = now;
            s.ramp = { anim: a, t0, R, key: d.toFixed(3), st: g.br.startTime };
        },
        // 這格呼吸在時間軸 t 那一刻上下伸縮幾倍：照 CSS 那份關鍵影格＋每段的緩動自己算（跟瀏覽器畫的一樣）；看不懂的寫法回 null
        _breathCurve: function(br) {
            const eff = br.effect, tm = eff.getTiming(), D = tm.duration, delay = tm.delay || 0, rate = br.playbackRate || 1;
            if (!(D > 0) || br.startTime == null || (tm.easing && tm.easing !== 'linear') || (tm.direction && tm.direction !== 'normal') || tm.iterationStart) return null;
            const ks = eff.getKeyframes().map(k => { const p = String(k.scale || '1').trim().split(/\s+/); return { o: k.computedOffset, v: parseFloat(p[1] || p[0]) || 1, e: this._breathEase(k.easing) }; });
            if (ks.length < 2 || ks.some(k => !k.e)) return null;
            const st = br.startTime;
            return (t) => {
                const at = (t - st) * rate - delay;
                let p = (at % D) / D; if (p < 0) p += 1;
                let i = 0; while (i < ks.length - 2 && p >= ks[i + 1].o) i++;
                const a = ks[i], b = ks[i + 1], span = b.o - a.o;
                const x = span > 0 ? Math.min(1, Math.max(0, (p - a.o) / span)) : 0;
                return a.v + (b.v - a.v) * a.e(x);
            };
        },
        // CSS 緩動（linear、ease、ease-in、ease-out、ease-in-out、cubic-bezier(…)）→ 函式；看不懂的回 null
        _breathEase: function(e) {
            const s = String(e || 'linear').trim();
            if (s === 'linear') return (x) => x;
            const named = { ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
            let c = named[s];
            if (!c) { const m = s.match(/^cubic-bezier\(([^)]*)\)$/); if (!m) return null; c = m[1].split(',').map(Number); if (c.length !== 4 || c.some(v => isNaN(v))) return null; }
            const x1 = c[0], y1 = c[1], x2 = c[2], y2 = c[3];
            const B = (t, a, b) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
            const dB = (t, a, b) => 3 * a * (1 - t) * (1 - t) + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t * t;
            return (x) => {
                if (x <= 0) return 0;
                if (x >= 1) return 1;
                let t = x;
                for (let i = 0; i < 8; i++) { const dd = dB(t, x1, x2); if (Math.abs(dd) < 1e-7) break; t -= (B(t, x1, x2) - x) / dd; }
                if (!(t >= 0 && t <= 1) || Math.abs(B(t, x1, x2) - x) > 1e-7) { let lo = 0, hi = 1; for (let i = 0; i < 50; i++) { t = (lo + hi) / 2; if (B(t, x1, x2) < x) lo = t; else hi = t; } }
                return B(t, y1, y2);
            };
        },
        // 疊著的時候底下那張變了：頭那張當場跟上（同一格畫面）；還在過渡就每一格跟。跟不上的才收
        _breathSync: function(s) {
            if (!s || !s.on) return;
            const g = this._breathGeom(s);
            if (!g) { s.changed = Date.now(); this._breathOff(s); return; }
            this._breathApply(s, g);
            if (g.moving && !s.follow) this._breathFollow(s);
        },
        _breathFollow: function(s) {
            const view = s.img.ownerDocument.defaultView || window;
            s.follow = true;
            const step = () => {
                if (!s.on) { s.follow = false; return; }
                const g = this._breathGeom(s);
                if (!g) { s.follow = false; s.changed = Date.now(); this._breathOff(s); return; }
                this._breathApply(s, g);
                if (g.moving) view.requestAnimationFrame(step); else s.follow = false;
            };
            view.requestAnimationFrame(step);
        },
        // 準備好頭那張，下一格畫面蓋上去（_breathRamp 從跟底下那張一模一樣開始，蓋上去那一下看不出來）。
        //   退路：算不出呼吸曲線就等吐氣到底（兩張疊在一起、頭頂差不到 0.05 點）那一格才蓋——
        //   離那一刻還遠就先睡（最多睡 0.25 秒就起來看一次有沒有被取消），近了逐格看；中途有變化（_breathOff）就作廢
        _breathSplit: async function(s, br, base, neck) {
            const img = s.img, doc = img.ownerDocument, view = doc.defaultView || window;
            const tok = ++s.tok;
            let h = s.head;
            if (!h || !h.isConnected) {
                h = s.head = doc.createElement('img');
                h.className = 'vn-breath-head'; h.alt = ''; h.draggable = false; h.setAttribute('aria-hidden', 'true');
                img.after(h);
            }
            const cur = img.getAttribute('src');
            if (h.getAttribute('src') !== cur) h.src = cur;
            if (!h.complete || !h.naturalWidth) { try { await h.decode(); } catch (e) { return; } }
            const ok = () => s.tok === tok && !s.on && (this._faceBase(img) || img.getAttribute('src')) === base;
            if (!ok()) return;
            s.base = base; s.neck = neck; s.wait = true;
            const frame = () => new Promise(r => view.requestAnimationFrame(() => r()));
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            try {
                for (let n = 0; n < 600; n++) {
                    await frame();   // 在畫面要畫之前看、之前蓋：看到的那格就是畫出來的那格
                    if (!ok()) return;
                    const g = this._breathGeom(s);
                    if (!g || g.moving) return;
                    // 平常現在就蓋（_breathRamp 從一模一樣慢慢變）；算出來的曲線跟畫面上的對不上，才等吐氣到底那一格
                    const now = this._breathNow(s), fn = this._breathCurve(g.br);
                    const flat = Math.abs(g.sy - 1) * g.span <= 0.05;
                    const ramp = !flat && !!fn && now != null && Math.abs(fn(now) - g.sy) * g.span <= 0.05;
                    if (flat || ramp) {
                        h.src = img.getAttribute('src');   // 等的時候講話、眨眼換過：用現在這份
                        this._breathApply(s, g);
                        if (ramp) this._breathRamp(s, g, now, 1200, fn);
                        h.style.display = 'block';
                        s.on = true;
                        return;
                    }
                    const ct = g.br.effect.getComputedTiming();
                    const ms = (1 - (ct.progress || 0)) * (ct.duration || g.br.effect.getTiming().duration) / Math.abs(g.br.playbackRate || 1);
                    if (ms > 150) await sleep(Math.min(250, ms - 100));
                }
            } finally { s.wait = false; }
        },
        // text＝這句台詞：嘴至少動完「大約唸完這句」的時間（一個字 90ms、最少 0.6 秒、最多 5 秒），
        //   字一下就跑完（打字快、她點了跳過）也看得到在講；下一句一開始就停
        // 🚨 換表情的那句，新圖比這裡晚到（_swapImage 先預載才換）：以前抓到舊那張就做嘴，新圖一上來就整句放棄，
        //   結果「只要換表情那句嘴就不動」（11-05 她：「為什麼常常不動嘴」）。現在一路跟著這格現在那張：換了圖就換那張的嘴接著動
        _mouthTalk: async function(name, text) {
            this._mouthHalt();
            const tok = this._mouthTok;
            if (!name) return;
            this._blinkStart();
            const said = String(text || '').replace(/<[^>]+>/g, '').replace(/[\s「」『』“”"*（）()]/g, '').length;
            const talkMs = Math.max(800, Math.min(5000, said * 90));
            const t0 = Date.now();
            let talkUntil = 0;   // 從嘴真的開始動才算（等圖、疊嘴那段不算進去）
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            const live = () => tok === this._mouthTok;
            let run = null, noMouth = '', last = 'closed', quiet = 0;
            const drop = () => {   // 這張不講了：嘴閉上（眼睛照眨眼那邊的狀態）
                if (run) {
                    run.mouth = 'closed';
                    if (this._mouthRun === run) { this._faceApply(run.img); this._mouthRun = null; }
                }
                run = null;
            };
            // 閉 → 微 → 開 → 微…，偶爾跳一格、間隔有快有慢，不要像節拍器
            const NEXT = { closed: () => (Math.random() < 0.7 ? 'half' : 'open'), half: () => (Math.random() < 0.6 ? 'open' : 'closed'), open: () => 'half' };
            while (live()) {
                const idx = (this._stage || []).findIndex(s => s && s.name === name);
                const img = idx >= 0 ? this._slotEl(idx) : null;
                const exp = idx >= 0 ? String(this._stage[idx].exp || '') : '';
                // 這格「本來」那張：正在顯示疊出來的那幾份（講話、眨眼）的話是它的原圖
                const base = img ? (this._faceBase(img) || img.getAttribute('src') || '') : '';
                const ready = !!(img && base && img.complete && img.naturalWidth && img.style.opacity === '1');
                // 還沒動過就先等新圖上來（最多多等 2 秒）
                const speaking = !!this._twTimer || this._voiceBusy() || Date.now() < (talkUntil || (t0 + talkMs + 2000));
                if (!speaking) {
                    quiet = quiet || Date.now();
                    if (Date.now() - quiet > 180 || !run) { drop(); return; }
                } else quiet = 0;
                if (speaking && ready && base !== noMouth && (!run || run.img !== img || run.base !== base)) {
                    drop();   // 換了張圖：上一張的嘴收掉，換這張的
                    const fr = await this._mouthFramesFor(name, img, base, exp);
                    if (!live()) return;
                    if ((this._faceBase(img) || img.getAttribute('src')) !== base) continue;   // 等的時候又換了圖：重來
                    if (!fr || !fr.half) { noMouth = base; continue; }
                    run = this._mouthRun = { img, base, fr, mouth: 'closed' };
                    if (!talkUntil) talkUntil = Date.now() + talkMs;
                    last = 'closed';
                }
                if (run && run.img === img && run.base === base) {   // 舞台換圖換到一半（base 跟 run 不同）不碰
                    last = (speaking && !quiet) ? NEXT[last]() : 'closed';
                    run.mouth = last;
                    this._faceApply(img);
                }
                await sleep(80 + Math.random() * 70);
            }
        }
    });
})();
