// ----------------------------------------------------------------
// [檔案] os_settings_voice.js — 系統設置 🔊 角色說話的聲音（2026-07-17 自 os_settings.js 拆出；2026-10 改成三個小分頁）
// 職責：
//   總開關／「沒在名單上的人」→ 當場寫進 OS_VOICE_CAST（不用按保存）
//   角色配音：一個角色一張卡（名字、聲音下拉選單、別名、試聽）；保存時 os_settings.js 呼叫 collectCast() 收卡片
//   雲端 → Minimax：抓我的聲音、官方音色庫（加進名單）、測試播放
//   雲端 → ElevenLabs：抓我的聲音（官方預覽免費聽）、測試播放；金鑰／模型保存時才存
//   本機：第一次切進來才叫 VN_TTS_Panel.initInline 畫
// 依賴：參數注入 ctx = { container, minimaxConfig }（os_settings.js launchApp 的閉包變數）；
//       入口＝window.OS_SETTINGS_VOICE.wire(ctx)、collectCast(container)。
//       mm-speed 語速 slider 同步留在核心。載入順序排 os_settings.js 之後（index.js PHONE_FILES）。
// ----------------------------------------------------------------
(function () {
    'use strict';

    const W = window.parent || window;
    const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const CUSTOM_MM = 'minimax:__custom';
    const TRY_TEXT = '你好，聽得到我的聲音嗎？';
    const TRY_BY_LANG = { en: 'Hey, can you hear me?', ja: 'もしもし、聞こえる？', ko: '안녕, 내 목소리 들려?' };
    const LANG_NAMES = { any: '不限', zh: '中文', en: '英文', ja: '日文', ko: '韓文' };
    const EL_CATEGORY = { premade: '內建', cloned: '複製', generated: '設計', professional: '專業複製', famous: '名人', high_quality: '精選' };

    function V() { return W.OS_VOICE_CAST; }
    function EL() { return W.OS_ELEVENLABS; }
    function MM() { return W.OS_MINIMAX; }
    function toast(msg, type) { try { if (W.AUI && W.AUI.toast) W.AUI.toast(msg, type ? { type } : undefined); } catch (e) {} }
    function say(el, msg, isErr) {
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('is-error', !!isErr);
    }

    // ── 下拉選單裡有哪些聲音 ──
    function elVoices() { const E = EL(); return (E && E.getConfig().voices) || []; }
    function mmVoices() { const M = MM(); return (M && M.getConfig().myVoices) || []; }

    // 一張卡的聲音選單：ElevenLabs 我的聲音／Minimax 我的聲音／Minimax 填 ID
    // 卡片原本綁的聲音不在清單裡（還沒抓、或官方音色庫的）也要列出來，不然一打開就被換掉
    function voiceOptionsHtml(src, id, name) {
        const cur = src && id ? `${src}:${id}` : '';
        let html = `<option value="" ${cur ? '' : 'selected'}>選一個聲音</option>`;
        const el = elVoices();
        html += '<optgroup label="ElevenLabs">';
        if (!el.length) html += '<option value="" disabled>先到「雲端 → ElevenLabs」抓聲音</option>';
        let hit = false;
        el.forEach(v => {
            const val = `elevenlabs:${v.id}`;
            if (val === cur) hit = true;
            html += `<option value="${esc(val)}" data-name="${esc(v.name)}" ${val === cur ? 'selected' : ''}>${esc(v.name)}</option>`;
        });
        if (src === 'elevenlabs' && id && !hit) html += `<option value="${esc(cur)}" data-name="${esc(name || id)}" selected>${esc(name || id)}</option>`;
        html += '</optgroup><optgroup label="Minimax">';
        hit = false;
        mmVoices().forEach(v => {
            const val = `minimax:${v.id}`;
            if (val === cur) hit = true;
            html += `<option value="${esc(val)}" data-name="${esc(v.name)}" ${val === cur ? 'selected' : ''}>${esc(v.name)}</option>`;
        });
        if (src === 'minimax' && id && !hit) html += `<option value="${esc(cur)}" data-name="${esc(name || id)}" selected>${esc(name || id)}</option>`;
        html += `<option value="${CUSTOM_MM}">填音色 ID…</option></optgroup>`;
        return html;
    }

    // 卡片目前選到的聲音 → { src, voiceId, voiceName }
    function cardVoice(card) {
        const sel = card.querySelector('.vcast-voice');
        const val = sel ? sel.value : '';
        if (val === CUSTOM_MM) {
            const id = (card.querySelector('.vcast-mmid')?.value || '').trim();
            return { src: 'minimax', voiceId: id, voiceName: '' };
        }
        const i = val.indexOf(':');
        if (i < 0) return { src: '', voiceId: '', voiceName: '' };
        const opt = sel.options[sel.selectedIndex];
        return { src: val.slice(0, i), voiceId: val.slice(i + 1), voiceName: (opt && opt.dataset.name) || '' };
    }
    function voiceSummary(card) {
        const v = cardVoice(card);
        if (!v.voiceId) return '還沒選聲音';
        const lang = card.querySelector('.vcast-lang')?.value || 'any';
        return (v.src === 'elevenlabs' ? 'ElevenLabs' : 'Minimax') + ' · ' + (v.voiceName || v.voiceId) + (lang !== 'any' ? ' · ' + LANG_NAMES[lang] : '');
    }

    function aliasChip(alias) {
        const chip = document.createElement('span');
        chip.className = 'vcast-alias-chip';
        chip.dataset.alias = alias;
        chip.innerHTML = `${esc(alias)}<i class="fa-solid fa-xmark" title="移除"></i>`;
        chip.querySelector('i').onclick = () => chip.remove();
        return chip;
    }

    function makeCard(entry, expanded) {
        entry = entry || {};
        const card = document.createElement('div');
        card.className = 'vcast-card' + (expanded ? '' : ' is-collapsed');
        card.innerHTML = `
            <div class="vcast-card-head">
                <i class="fa-solid fa-caret-right vcast-card-caret"></i>
                <span class="vcast-card-name"></span>
                <span class="vcast-card-voice"></span>
                <span class="vcast-card-del" title="從名單拿掉"><i class="fa-solid fa-trash-can"></i></span>
            </div>
            <div class="vcast-card-body">
                <div class="set-label vcast-sub">角色名稱</div>
                <input class="set-input vcast-label" type="text" value="${esc(entry.label)}">
                <div class="set-label vcast-sub">聲音</div>
                <select class="set-select vcast-voice">${voiceOptionsHtml(entry.src, entry.voiceId, entry.voiceName)}</select>
                <input class="set-input vcast-mmid vcast-off" type="text" placeholder="Minimax 音色 ID">
                <div class="set-label vcast-sub">念哪種語言</div>
                <select class="set-select vcast-lang">${Object.keys(LANG_NAMES).map(k => `<option value="${k}" ${(entry.lang || 'any') === k ? 'selected' : ''}>${LANG_NAMES[k]}</option>`).join('')}</select>
                <div class="set-label vcast-sub">別名</div>
                <div class="vcast-chips"></div>
                <div class="vcast-alias-row">
                    <input class="set-input vcast-alias-input" type="text" placeholder="輸入別名後按 Enter">
                    <div class="btn-fetch vcast-alias-add" title="加別名"><i class="fa-solid fa-plus"></i></div>
                </div>
                <div class="btn-test vcast-try"><i class="fa-solid fa-play"></i> 試聽</div>
            </div>`;
        const q = (c) => card.querySelector(c);
        const nameEl = q('.vcast-card-name'), voiceEl = q('.vcast-card-voice');
        const label = q('.vcast-label'), sel = q('.vcast-voice'), mmid = q('.vcast-mmid');
        const chips = q('.vcast-chips'), aliasIn = q('.vcast-alias-input');
        (entry.aliases || []).forEach(a => chips.appendChild(aliasChip(a)));

        const paint = () => {
            nameEl.textContent = label.value.trim() || '（還沒取名）';
            voiceEl.textContent = voiceSummary(card);
            mmid.classList.toggle('vcast-off', sel.value !== CUSTOM_MM);
        };
        label.addEventListener('input', paint);
        sel.addEventListener('change', () => { paint(); if (sel.value === CUSTOM_MM) mmid.focus({ preventScroll: true }); });
        mmid.addEventListener('input', paint);
        q('.vcast-lang').addEventListener('change', paint);
        paint();

        const addAlias = () => {
            const v = aliasIn.value.trim();
            if (!v) return;
            chips.appendChild(aliasChip(v));
            aliasIn.value = '';
        };
        q('.vcast-alias-add').onclick = addAlias;
        aliasIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } });

        q('.vcast-card-head').onclick = (e) => {
            if (e.target.closest('.vcast-card-del')) return;
            card.classList.toggle('is-collapsed');
        };
        q('.vcast-card-del').onclick = (e) => { e.stopPropagation(); card.remove(); };
        q('.vcast-try').onclick = () => tryVoice(card);
        return card;
    }

    // 卡片的試聽：先把「雲端」分頁現在填的金鑰存進去，再用這張卡選的聲音念一句（會花一次錢）
    let _ctx = null;
    async function tryVoice(card) {
        const v = cardVoice(card);
        if (!v.voiceId) { toast('先選一個聲音'); return; }
        const tryText = TRY_BY_LANG[card.querySelector('.vcast-lang')?.value] || TRY_TEXT;
        stashCloudInputs();
        const btn = card.querySelector('.vcast-try');
        btn.classList.add('is-busy');
        let ok = false;
        try {
            if (v.src === 'elevenlabs') ok = EL() ? await EL().speakVoice(v.voiceId, tryText) : false;
            else ok = MM() ? await MM().play(tryText, v.voiceId) : false;
        } catch (e) { ok = false; }
        btn.classList.remove('is-busy');
        if (!ok) toast(v.src === 'elevenlabs' ? '念不出來：檢查 ElevenLabs 金鑰跟聲音' : '念不出來：檢查 Minimax 的 Group ID、金鑰跟音色 ID', 'error');
    }
    // 試聽前把雲端分頁現在填的值存進各自的設定（跟原本 Minimax 測試鈕一樣，不必先按保存）
    function stashCloudInputs() {
        if (!_ctx) return;
        const c = _ctx.container;
        const val = (id) => (c.querySelector('#' + id)?.value || '').trim();
        if (EL()) EL().saveConfig({ apiKey: val('el-api-key'), modelId: val('el-model') || 'eleven_v4' });
        if (MM()) MM().saveConfig({ ...MM().getConfig(), groupId: val('mm-group-id'), apiKey: val('mm-api-key'), provider: val('mm-provider') || 'cn', speechModel: val('mm-speech-model') || 'speech-02-turbo' });
    }

    // 抓到新聲音之後：每張卡的下拉選單重畫（保留原本選的）
    function refreshCardSelects(container) {
        container.querySelectorAll('.vcast-card').forEach(card => {
            const v = cardVoice(card);
            const sel = card.querySelector('.vcast-voice');
            const wasCustom = sel.value === CUSTOM_MM;
            sel.innerHTML = voiceOptionsHtml(wasCustom ? '' : v.src, wasCustom ? '' : v.voiceId, v.voiceName);
            if (wasCustom) sel.value = CUSTOM_MM;
            sel.dispatchEvent(new Event('change'));
        });
    }

    function collectCast(container) {
        const out = [];
        container.querySelectorAll('.vcast-card').forEach(card => {
            const label = (card.querySelector('.vcast-label')?.value || '').trim();
            const v = cardVoice(card);
            const aliases = [];
            card.querySelectorAll('.vcast-alias-chip').forEach(ch => { if (ch.dataset.alias) aliases.push(ch.dataset.alias); });
            const lang = card.querySelector('.vcast-lang')?.value || 'any';
            if (label && v.voiceId && v.src) out.push({ label, aliases, src: v.src, voiceId: v.voiceId, voiceName: v.voiceName, lang });
        });
        return out;
    }

    function wire(ctx) {
        _ctx = ctx;
        const container = ctx.container;
        const q = (id) => container.querySelector('#' + id);

        // ── 小分頁：角色配音／雲端／本機 ──
        const tabs = Array.prototype.slice.call(container.querySelectorAll('.vcast-subtab'));
        let localDrawn = false;
        const go = (which) => {
            container.querySelectorAll('.vcast-subview').forEach(v => v.classList.toggle('vcast-off', v.id !== 'vcview-' + which));
            tabs.forEach(t => t.classList.toggle('active', t.dataset.vctab === which));
            if (which === 'local' && !localDrawn && W.VN_TTS_Panel?.initInline) {
                localDrawn = true;
                W.VN_TTS_Panel.initInline('vn-tts-inline-root');
            }
        };
        tabs.forEach(t => { t.onclick = () => go(t.dataset.vctab); });
        go('cast');

        // 雲端裡的兩家
        const cloudChips = Array.prototype.slice.call(container.querySelectorAll('[data-vccloud]'));
        const goCloud = (which) => {
            container.querySelectorAll('.vcast-cloudview').forEach(v => v.classList.toggle('vcast-off', v.id !== 'vccloud-' + which));
            cloudChips.forEach(c => c.classList.toggle('active', c.dataset.vccloud === which));
        };
        cloudChips.forEach(c => { c.onclick = () => goCloud(c.dataset.vccloud); });
        const mmCfg = MM() ? MM().getConfig() : {};
        const elCfg = EL() ? EL().getConfig() : {};
        goCloud(!mmCfg.apiKey && elCfg.apiKey ? 'elevenlabs' : 'minimax');

        // ── 總開關、沒在名單上的人：當場生效 ──
        const syncHidden = (r) => {
            const mmEn = q('mm-enabled'); if (mmEn) mmEn.checked = !!r.on;
            const vt = container.querySelector('#vtts-enabled'); if (vt) vt.checked = !!(r.on && r.others === 'local');
        };
        const onBox = q('vcast-on');
        if (onBox) onBox.onchange = () => { if (V()) syncHidden(V().saveRoster({ on: onBox.checked })); };
        const others = q('vcast-others');
        if (others) others.querySelectorAll('[data-v]').forEach(b => {
            b.onclick = () => {
                others.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('active', x === b));
                if (V()) syncHidden(V().saveRoster({ others: b.dataset.v }));
            };
        });

        // ── 角色配音名單 ──
        const list = q('vcast-cast-list');
        const roster = V() ? V().getRoster() : { entries: [] };
        if (list) roster.entries.forEach(e => list.appendChild(makeCard(e, false)));
        const addCard = (entry) => {
            const card = makeCard(entry || {}, true);
            list.appendChild(card);
            go('cast');
            card.querySelector('.vcast-label')?.focus({ preventScroll: true });
            card.scrollIntoView({ block: 'nearest' });
            return card;
        };
        const addBtn = q('vcast-add-btn');
        if (addBtn && list) addBtn.onclick = () => addCard({});

        // 「加進名單」：從聲音清單直接開一張新卡
        const voiceRow = (name, sub, actions) => {
            const row = document.createElement('div');
            row.className = 'vcast-voice-row';
            row.innerHTML = `<div class="vcast-voice-name">${esc(name)}${sub ? `<div class="vcast-voice-cat">${esc(sub)}</div>` : ''}</div>`;
            actions.forEach(a => {
                const b = document.createElement('div');
                b.className = 'vcast-icon-btn';
                b.title = a.title;
                b.innerHTML = `<i class="fa-solid ${a.icon}"></i>`;
                b.onclick = a.run;
                row.appendChild(b);
            });
            return row;
        };

        // ── Minimax：我的聲音 ──
        const mmMine = q('mm-mine-list'), mmMineRes = q('mm-mine-result');
        const paintMmMine = () => {
            if (!mmMine) return;
            mmMine.innerHTML = '';
            const vs = mmVoices();
            if (!vs.length) { mmMine.innerHTML = '<div class="vcast-empty">還沒抓過</div>'; return; }
            vs.forEach(v => mmMine.appendChild(voiceRow(v.name, v.name !== v.id ? v.id : '', [
                { icon: 'fa-user-plus', title: '加進名單', run: () => addCard({ src: 'minimax', voiceId: v.id, voiceName: v.name }) }
            ])));
        };
        paintMmMine();
        const mmBase = () => (q('mm-provider')?.value === 'io' ? 'https://api.minimax.io' : 'https://api.minimaxi.com');
        const mmMineBtn = q('mm-mine-btn');
        if (mmMineBtn) mmMineBtn.onclick = async () => {
            const apiKey = (q('mm-api-key')?.value || '').trim();
            if (!apiKey) { say(mmMineRes, '先填 API Key', true); return; }
            say(mmMineRes, '抓取中…');
            try {
                const res = await fetch(`${mmBase()}/v1/get_voice`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ voice_type: 'all' })
                });
                const data = await res.json();
                if (!res.ok || data.base_resp?.status_code !== 0) throw new Error(data.base_resp?.status_msg || res.statusText);
                const pick = (v) => {
                    const d = Array.isArray(v.description) ? v.description[0] : v.description;
                    return { id: v.voice_id, name: (v.voice_name || d || v.voice_id) };
                };
                const mine = [].concat(data.voice_cloning || [], data.voice_generation || []).filter(v => v && v.voice_id).map(pick);
                if (MM()) MM().saveConfig({ ...MM().getConfig(), myVoices: mine });
                paintMmMine();
                refreshCardSelects(container);
                say(mmMineRes, mine.length ? `抓到 ${mine.length} 個` : '帳號裡沒有自己複製或設計的聲音');
            } catch (err) {
                say(mmMineRes, '抓不到：' + err.message, true);
            }
        };

        // ── Minimax：官方音色庫 ──
        const mmBrowseBtn  = q('mm-browse-voices-btn');
        const mmVoiceModal = q('mm-voice-modal');
        const mmVoiceList  = q('mm-voice-list');
        const mmVoiceSearch= q('mm-voice-search');
        const mmVoiceCount = q('mm-voice-count');
        let _fetchedVoices = [];

        function renderVoiceList(voices) {
            if (!mmVoiceList) return;
            mmVoiceList.innerHTML = '';
            voices.forEach(v => {
                const desc = Array.isArray(v.description) ? v.description[0] : (v.description || '');
                const row = document.createElement('div');
                row.className = 'vcast-voice-row';
                row.innerHTML = `
                    <div class="vcast-voice-name">${esc(desc || v.voice_id)}<div class="vcast-voice-cat vcast-mono">${esc(v.voice_id)}</div></div>
                    <div class="vcast-modal-btns">
                        <button class="vcast-mini-btn mm-v-use" type="button">填入測試</button>
                        <button class="vcast-mini-btn mm-v-add" type="button">加進名單</button>
                    </div>`;
                row.querySelector('.mm-v-use').onclick = () => {
                    const el = q('mm-test-voice-id');
                    if (el) { el.value = v.voice_id; el.dispatchEvent(new Event('input')); }
                    mmVoiceModal.style.display = 'none';
                };
                row.querySelector('.mm-v-add').onclick = () => {
                    mmVoiceModal.style.display = 'none';
                    addCard({ src: 'minimax', voiceId: v.voice_id, voiceName: desc || v.voice_id });
                };
                mmVoiceList.appendChild(row);
            });
        }

        if (mmBrowseBtn && mmVoiceModal) {
            mmBrowseBtn.onclick = async () => {
                const apiKey = (q('mm-api-key')?.value || '').trim();
                if (!apiKey) { W.AUI ? W.AUI.alert('請先填寫 API Key') : null; return; }
                mmVoiceModal.style.display = 'flex';
                mmVoiceList.innerHTML = '<div class="vcast-empty"><i class="fa-solid fa-hourglass-half"></i> 載入中...</div>';
                mmVoiceSearch.value = '';
                if (mmVoiceCount) mmVoiceCount.textContent = '';
                try {
                    const res = await fetch(`${mmBase()}/v1/get_voice`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ voice_type: 'system' })
                    });
                    const data = await res.json();
                    if (!res.ok || data.base_resp?.status_code !== 0) throw new Error(data.base_resp?.status_msg || res.statusText);
                    _fetchedVoices = data.system_voice || [];
                    if (mmVoiceCount) mmVoiceCount.textContent = `（共 ${_fetchedVoices.length} 個）`;
                    renderVoiceList(_fetchedVoices);
                } catch (err) {
                    mmVoiceList.innerHTML = `<div class="vcast-empty is-error"><i class="fa-solid fa-circle-xmark"></i> 載入失敗：${esc(err.message)}</div>`;
                }
            };
            mmVoiceSearch?.addEventListener('input', () => {
                const s = mmVoiceSearch.value.toLowerCase();
                renderVoiceList(_fetchedVoices.filter(v => {
                    const desc = Array.isArray(v.description) ? v.description.join(' ') : (v.description || '');
                    return v.voice_id.toLowerCase().includes(s) || desc.toLowerCase().includes(s);
                }));
            });
            q('mm-voice-modal-close')?.addEventListener('click', () => { mmVoiceModal.style.display = 'none'; });
            mmVoiceModal.addEventListener('click', (e) => { if (e.target === mmVoiceModal) mmVoiceModal.style.display = 'none'; });
        }

        // ── Minimax：測試語音 ──
        const mmTestBtn = q('mm-test-btn'), mmStopBtn = q('mm-stop-btn'), mmResult = q('mm-test-result');
        if (mmTestBtn) {
            mmTestBtn.onclick = async () => {
                const voiceId = (q('mm-test-voice-id')?.value || '').trim();
                const text    = (q('mm-test-text')?.value || '').trim();
                const groupId = (q('mm-group-id')?.value || '').trim();
                const apiKey  = (q('mm-api-key')?.value || '').trim();
                mmResult.style.display = 'block';
                if (!groupId || !apiKey) { mmResult.style.color = '#fc8181'; mmResult.textContent = '請先填寫 Group ID 與 API Key'; return; }
                if (!voiceId) { mmResult.style.color = '#fc8181'; mmResult.textContent = '請輸入語音 ID（如 male-01）'; return; }
                mmTestBtn.style.opacity = '0.5';
                mmTestBtn.textContent = '合成中...';
                mmResult.style.color = 'rgba(26,28,40,0.40)';
                mmResult.textContent = '正在呼叫 Minimax TTS API...';
                if (MM()) {
                    stashCloudInputs();
                    const ok = await MM().play(text, voiceId);
                    if (ok) {
                        mmResult.style.color = 'rgba(26,28,40,0.25)';
                        mmResult.textContent = '語音播放中...';
                        if (mmStopBtn) mmStopBtn.style.display = 'block';
                    } else {
                        mmResult.style.color = '#fc8181';
                        mmResult.textContent = '播放失敗，請檢查 Group ID / API Key / 語音 ID 是否正確';
                    }
                }
                mmTestBtn.style.opacity = '1';
                mmTestBtn.textContent = '播放測試語音';
            };
        }
        if (mmStopBtn) mmStopBtn.onclick = () => {
            if (MM()) MM().stop();
            mmStopBtn.style.display = 'none';
            if (mmResult) { mmResult.style.color = 'rgba(26,28,40,0.40)'; mmResult.textContent = '已停止播放'; }
        };

        // ── ElevenLabs：我的聲音 ──
        const elList = q('el-voice-list'), elRes = q('el-fetch-result'), elTestSel = q('el-test-voice');
        let _elPreviews = {};   // 這次抓到的官方預覽網址（免費聽，不存）
        let _previewAudio = null;
        const paintElTestSel = () => {
            if (!elTestSel) return;
            const keep = elTestSel.value;
            const vs = elVoices();
            elTestSel.innerHTML = vs.length ? vs.map(v => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('') : '<option value="">先抓聲音</option>';
            if (keep && vs.some(v => v.id === keep)) elTestSel.value = keep;
        };
        const paintElList = () => {
            if (!elList) return;
            elList.innerHTML = '';
            const vs = elVoices();
            if (!vs.length) { elList.innerHTML = '<div class="vcast-empty">還沒抓過</div>'; return; }
            vs.forEach(v => {
                const acts = [];
                if (_elPreviews[v.id]) acts.push({ icon: 'fa-headphones', title: '聽官方預覽（不花錢）', run: () => {
                    try { if (_previewAudio) _previewAudio.pause(); _previewAudio = new Audio(_elPreviews[v.id]); _previewAudio.play(); } catch (e) {}
                } });
                acts.push({ icon: 'fa-user-plus', title: '加進名單', run: () => addCard({ src: 'elevenlabs', voiceId: v.id, voiceName: v.name }) });
                elList.appendChild(voiceRow(v.name, EL_CATEGORY[v.category] || '', acts));
            });
        };
        paintElList();
        paintElTestSel();
        const elFetch = q('el-fetch-btn');
        if (elFetch) elFetch.onclick = async () => {
            const key = (q('el-api-key')?.value || '').trim();
            if (!key) { say(elRes, '先填金鑰', true); return; }
            if (!EL()) return;
            say(elRes, '抓取中…');
            try {
                const vs = await EL().listVoices(key);
                _elPreviews = {};
                vs.forEach(v => { if (v.preview) _elPreviews[v.id] = v.preview; });
                paintElList();
                paintElTestSel();
                refreshCardSelects(container);
                say(elRes, `抓到 ${vs.length} 個`);
            } catch (err) {
                say(elRes, err.message === 'NO_KEY' ? '先填金鑰' : '抓不到：' + err.message, true);
            }
        };

        // ── ElevenLabs：測試語音 ──
        const elTest = q('el-test-btn'), elStop = q('el-stop-btn'), elTestRes = q('el-test-result');
        if (elTest) elTest.onclick = async () => {
            const voiceId = elTestSel ? elTestSel.value : '';
            const text = (q('el-test-text')?.value || '').trim();
            if (!(q('el-api-key')?.value || '').trim()) { say(elTestRes, '先填金鑰', true); return; }
            if (!voiceId) { say(elTestRes, '先抓聲音、選一個', true); return; }
            if (!EL()) return;
            stashCloudInputs();
            elTest.classList.add('is-busy');
            say(elTestRes, '合成中…');
            const ok = await EL().speakVoice(voiceId, text || TRY_TEXT);
            elTest.classList.remove('is-busy');
            if (ok) { say(elTestRes, '播放中…'); if (elStop) elStop.classList.remove('vcast-off'); }
            else say(elTestRes, '播放失敗：檢查金鑰、模型跟聲音', true);
        };
        if (elStop) elStop.onclick = () => {
            if (EL()) EL().stop();
            elStop.classList.add('vcast-off');
            say(elTestRes, '已停止');
        };
    }

    window.OS_SETTINGS_VOICE = { wire: wire, collectCast: collectCast };
})();
