// ----------------------------------------------------------------
// [檔案] os_settings_backup.js — 系統設置「備份」分頁的按鈕（2026-11-17 自 os_settings.js 拆出）
// 職責：備份分頁上的匯出／匯入、雲端備份、通知、保持連線、托管、用量等按鈕（畫面在 os_settings_page.js）。
//       備份本體的規則（要收哪些 key、分哪幾塊）在 os_backup.js，這支只管按鈕。
// 依賴：只用全域（AUI、OS_BACKUP、OS_DB…），不吃 launchApp 的閉包變數。
//       入口＝window.OS_SETTINGS_BACKUP.bind(container)；載入順序排 os_settings.js 之後，開頁時才呼叫。
// ----------------------------------------------------------------
(function () {
    'use strict';

    const _lsSet = (key, value, what) => (window.parent || window).AUI.lsSet(key, value, what);

    function bindBackupTab(container) {
        const win = window.parent || window;
        const BACKUP = win.OS_BACKUP;
        const isStandaloneNow = () => { try { return !!(win.OS_API && win.OS_API.isStandalone && win.OS_API.isStandalone()); } catch (e) { return false; } };

        const elStatus    = container.querySelector('#bk-status');

        function setStatus(msg, color) {
            if (elStatus) { elStatus.textContent = msg; elStatus.style.color = color || 'rgba(var(--os-ink-rgb, 26, 28, 40), 0.40)'; }
        }
        // 忙完還原成原本的樣子（含圖示）：第一次變忙時先記下原本的 HTML
        function setBtnLoading(btn, text) { if (btn) { if (btn.__html0 == null) btn.__html0 = btn.innerHTML; btn.textContent = text; btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none'; } }
        function setBtnDone(btn, text) { if (btn) { if (btn.__html0 != null) btn.innerHTML = btn.__html0; else btn.textContent = text; btn.style.opacity = '1'; btn.style.pointerEvents = ''; } }

        // ── 📡 回覆交給伺服器跑（請求托管）：實際的送出與收回在 os_relay.js ──
        (function wireRelay() {
            const q = id => container.querySelector('#' + id);
            if (!q('relay-group') || !win.OS_RELAY) return;
            const elUrl = q('relay-url'), elTok = q('relay-token'), elState = q('relay-state');
            const say = (msg) => { if (elState) elState.textContent = msg; };
            const cfg = win.OS_RELAY.cfg();
            if (elUrl) elUrl.value = cfg.url || '';
            if (elTok) elTok.value = cfg.token || '';
            say(win.OS_RELAY.enabled() ? '開著：' + win.OS_RELAY.base() : '還沒開。');

            const btn = q('relay-save-btn');
            if (btn) btn.onclick = async () => {
                const url = (elUrl && elUrl.value || '').trim();
                const token = (elTok && elTok.value || '').trim();
                if (!url || !token) { say('網址跟通行碼都要填。'); return; }
                if (!win.OS_RELAY.setCfg({ url: url, token: token, on: true })) { say('沒存下來（本機空間滿了）。'); return; }
                say('測試中…');
                try {
                    await win.OS_RELAY.test();
                    say('可以用了：' + win.OS_RELAY.base());
                } catch (e) {
                    win.OS_RELAY.setCfg({ on: false });
                    say('連不上或通行碼不對：' + ((e && e.message) || e));
                }
            };
            const off = q('relay-off-btn');
            if (off) off.onclick = () => { if (win.OS_RELAY.setCfg({ on: false })) say('關掉了，回覆改回手機自己跑。'); };
        })();

        // ── 一般分頁裡的小分頁：面板／素材／上下文／後台 ──
        //   面板只有酒館有、後台只有手機版有，所以預設停在「第一個看得見的」，不寫死。
        (function wireGenTabs() {
            const tabs = Array.prototype.slice.call(container.querySelectorAll('.gen-subtab'));
            if (!tabs.length) return;
            const go = function (which) {
                container.querySelectorAll('.gen-subview').forEach(function (v) {
                    v.style.display = (v.id === 'gview-' + which) ? '' : 'none';
                });
                tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.gentab === which); });
            };
            tabs.forEach(function (t) { t.onclick = function () { go(t.dataset.gentab); }; });
            const first = tabs.find(function (t) { return t.style.display !== 'none'; }) || tabs[0];
            go(first.dataset.gentab);
        })();

        // ── 沒有伺服器的守候：三招各自開關 ＋ 通知 ＋ 現在到底有沒有在守 ──
        (function wireKeepAlive() {
            const q = function (id) { return container.querySelector('#' + id); };
            const box = q('ka-group');
            if (!box || !win.OS_KEEPALIVE) return;
            const K = win.OS_KEEPALIVE;
            const caps = K.caps();

            // 這台做不到的那一招：整列淡掉、開關按不動、下面寫一行原因
            const mark = function (itemId, whyId, ok) {
                const it = q(itemId);
                if (it) it.classList.toggle('ka-unsupported', !ok);
                const w = q(whyId);
                if (w) w.classList.toggle('hidden', !!ok);
            };
            mark('ka-item-wake', 'ka-why-wake', caps.wake);
            mark('ka-item-pip', 'ka-why-pip', caps.pip);
            mark('ka-item-notify', 'ka-why-notify', caps.notify);

            const cAudio = q('ka-audio'), cWake = q('ka-wake'), cNotify = q('ka-notify');
            const cur = K.cfg();
            if (cAudio) cAudio.checked = !!cur.audio;
            if (cWake) cWake.checked = !!cur.wake;
            if (cNotify) cNotify.checked = !!(cur.notify && caps.notify);

            const stateBox = q('ka-state');
            const pipBtn = q('ka-pip-btn');
            const row = function (k, on, yes, no) {
                return '<div class="ka-state-row"><span>' + k + '</span>'
                     + '<span class="' + (on ? 'on' : 'off') + '">' + (on ? yes : no) + '</span></div>';
            };
            const refresh = function () {
                if (!stateBox) return;
                const st = K.state();
                let html = '';
                if (st.relay) html += '<div class="ka-note">托管開著，切出去那一輪本來就由伺服器跑完，下面這幾招其實用不到。</div>';
                html += row('當成在放音樂', st.audio, '正在守著',
                            st.audioWant ? '等你碰一下畫面才開始' : '沒開');
                html += row('螢幕不要自己關', st.wake, '鎖著不關',
                            st.wakeWant ? (caps.wake ? '畫面看不見時系統會收回' : '這台做不到') : '沒開');
                html += row('小窗', st.pip, '開著', '沒開');
                html += row('通知', st.notifyPerm === 'granted', '可以叮你',
                            st.notifyPerm === 'denied' ? '你拒絕過，要去手機的設定裡改' : '還沒允許');
                stateBox.innerHTML = html;
                if (pipBtn) pipBtn.textContent = st.pip ? '收起小窗' : '開小窗';
            };
            refresh();

            if (cAudio) cAudio.onchange = function () { K.setCfg({ audio: cAudio.checked }); refresh(); };
            if (cWake) cWake.onchange = function () {
                if (!caps.wake) { cWake.checked = false; return; }
                K.setCfg({ wake: cWake.checked });
                refresh();
            };
            // 🚨 要權限必須在這個手勢裡直接呼叫，前面不准 await 任何東西（iOS 會判定不是手勢）
            if (cNotify) cNotify.onchange = function () {
                if (!cNotify.checked) { K.setCfg({ notify: false }); refresh(); return; }
                if (!caps.notify) { cNotify.checked = false; return; }
                K.askNotify().then(function () {
                    cNotify.checked = !!K.cfg().notify;
                    refresh();
                });
            };
            if (pipBtn) pipBtn.onclick = function () {
                if (!caps.pip) return;
                K.pipToggle().then(refresh);
            };

            // 開著設置頁的時候讓狀態自己跟上；她離開設置頁、這一塊被拆掉就停
            //   🚨 要看容器還在不在畫面上（isConnected）：整份設置被拆下來時，容器裡的 #ka-state 還找得到，
            //   只查它的話計時器永遠不停，還把整份設置畫面抓在記憶體裡（10-20 量到每開一次設置多 6,500 個節點、229 個監聽）
            const timer = setInterval(function () {
                if (!container.isConnected || !container.querySelector('#ka-state')) { clearInterval(timer); return; }
                refresh();
            }, 2000);
        })();

        // ── 手機通知：只有「加到主畫面」啟動的 PWA 收得到，Safari 分頁不行 ──
        (function wirePush() {
            const q = id => container.querySelector('#' + id);
            if (!q('push-group')) return;
            const LS = 'aurelia_push_cfg';
            const elUrl = q('push-url'), elKey = q('push-key'), elState = q('push-state');

            const say = (msg, kind) => {
                if (!elState) return;
                elState.textContent = msg;
                elState.className = 'push-state' + (kind ? ' ' + kind : '');
            };
            const load = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (_) { return {}; } };
            const save = c => _lsSet(LS, JSON.stringify(c), '通知設定');

            // 貼整條聊天用的網址也行，剝到主機就好
            const norm = raw => {
                let u = String(raw || '').trim().replace(/\s+/g, '');
                if (!u) return '';
                if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
                return u.replace(/\/+$/, '')
                        .replace(/\/v1\/(chat\/completions|board|models|messages).*$/i, '')
                        .replace(/\/v1$/i, '');
            };
            const b64 = str => {
                const pad = '='.repeat((4 - str.length % 4) % 4);
                const raw = atob((str + pad).replace(/-/g, '+').replace(/_/g, '/'));
                const out = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
                return out;
            };
            const api = (base, key, path, body) => fetch(base + path, {
                method: body ? 'POST' : 'GET',
                headers: Object.assign({ 'Authorization': 'Bearer ' + key },
                                       body ? { 'Content-Type': 'application/json' } : {}),
                body: body ? JSON.stringify(body) : undefined,
            }).then(r => r.text().then(t => {
                let data = null;
                try { data = JSON.parse(t); } catch (_) {}
                if (!r.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + r.status));
                return data || {};
            }));
            const swReady = () => navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready);

            const cfg = load();
            if (elUrl && cfg.url) elUrl.value = cfg.url;
            if (elKey && cfg.key) elKey.value = cfg.key;

            const standalone = window.matchMedia('(display-mode: standalone)').matches
                            || window.navigator.standalone === true;
            const gate = q('push-gate');
            if (!standalone && gate) gate.classList.remove('hidden');

            const supported = ('serviceWorker' in navigator) && ('PushManager' in window);
            if (!supported) say('這個瀏覽器不支援通知。iOS 要 16.4 以上，而且要從主畫面開。', 'bad');

            // 已經開過就講一聲，免得她不知道現在是什麼狀態
            if (supported) {
                navigator.serviceWorker.getRegistration()
                    .then(reg => reg && reg.pushManager.getSubscription())
                    .then(sub => { if (sub) say('已經開著，這台收得到。', 'good'); })
                    .catch(() => {});
            }

            const btnOn = q('push-on-btn');
            if (btnOn) btnOn.addEventListener('click', () => {
                if (!supported) return;
                const base = norm(elUrl && elUrl.value);
                const key = ((elKey && elKey.value) || '').trim();
                if (!base || !key) { say('網址跟密鑰都要填。', 'bad'); return; }
                save({ url: base, key: key });
                say('正在問系統要通知權限…');
                // 這行一定要留在點擊的手勢裡；先 await 別的再叫，iOS 會直接拒絕
                Notification.requestPermission().then(perm => {
                    if (perm !== 'granted') throw new Error('沒有允許通知（' + perm + '）。');
                    return api(base, key, '/v1/push/key');
                }).then(res => {
                    if (!res.publicKey) throw new Error('橋那邊還沒有金鑰，先重啟橋。');
                    return swReady().then(reg => reg.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: b64(res.publicKey),
                    }));
                }).then(sub => api(base, key, '/v1/push/subscribe', { subscription: sub.toJSON() }))
                  .then(res => say('開好了，' + (res.subscribers || 1) + ' 台裝置在收。按「測試一下」看看。', 'good'))
                  .catch(e => say('沒開成：' + (e && e.message ? e.message : e), 'bad'));
            });

            const btnTest = q('push-test-btn');
            if (btnTest) btnTest.addEventListener('click', () => {
                const c = load();
                if (!c.url || !c.key) { say('先按「開啟通知」。', 'bad'); return; }
                say('發送中…');
                api(c.url, c.key, '/v1/push/test', {})
                    .then(res => say((res.sent > 0)
                        ? '推出去了，等一下就會跳出來。'
                        : ('一台都沒推成（失敗 ' + (res.failed || 0) + '、失效 ' + (res.dropped || 0) + '）。'),
                        res.sent > 0 ? 'good' : 'bad'))
                    .catch(e => say('發不出去：' + (e && e.message ? e.message : e), 'bad'));
            });

            const btnOff = q('push-off-btn');
            if (btnOff) btnOff.addEventListener('click', () => {
                const c = load();
                say('取消中…');
                swReady().then(reg => reg.pushManager.getSubscription()).then(sub => {
                    if (!sub) { say('本來就沒開。'); return null; }
                    const ep = sub.endpoint;
                    return sub.unsubscribe()
                        .then(() => (c.url && c.key) ? api(c.url, c.key, '/v1/push/unsubscribe', { endpoint: ep }) : null)
                        .then(() => say('關掉了，這台不會再收到。', 'good'));
                }).catch(e => say('關不掉：' + (e && e.message ? e.message : e), 'bad'));
            });
        })();

        const btnScan = container.querySelector('#bk-scan-btn');
        const elStorageInfo = container.querySelector('#bk-storage-info');
        if (btnScan) btnScan.addEventListener('click', async () => {
            if (!BACKUP) { if (elStorageInfo) elStorageInfo.textContent = 'OS_BACKUP 未載入'; return; }
            btnScan.textContent = '掃描中...';
            try {
                const info = await BACKUP.estimateSize();
                const _size = kb => kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB';
                const lines = Object.entries(info).map(([k, v]) =>
                    `<div class="bk-row"><span class="bk-row-name">${k}${v.note ? `<small>${v.note}</small>` : ''}</span>
                        <span class="bk-row-num">${v.count} ${v.unit || '筆'}${v.kb != null ? `<small>${_size(v.kb)}</small>` : ''}</span></div>`
                ).join('');
                if (elStorageInfo) elStorageInfo.innerHTML = lines || '（無資料）';
            } catch(e) { if (elStorageInfo) elStorageInfo.textContent = '讀不到：' + e.message; }
            btnScan.textContent = '看各佔多少';
            _paintUsage();
        });

        // 用量條＋資料有沒有受保護（開這頁就畫，不用按）
        const elUsage = container.querySelector('#bk-usage'), elProtect = container.querySelector('#bk-protect');
        const _gb = n => n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : Math.max(1, Math.round(n / 1048576)) + ' MB';
        async function _paintUsage() {
            if (!BACKUP || !BACKUP.storageStatus || !elUsage) return;
            const st = await BACKUP.storageStatus();
            if (!st.supported) { elUsage.textContent = '這個瀏覽器不告訴網頁用了多少空間。'; }
            else {
                const pct = Math.min(100, Math.round(st.ratio * 100));
                const lv = st.ratio >= 0.8 ? ' is-high' : (st.ratio >= 0.5 ? ' is-mid' : '');
                elUsage.innerHTML = `<div class="bk-usage-nums"><b>${_gb(st.usage)}</b><span>／瀏覽器最多給 ${_gb(st.quota)}</span><em>${pct}%</em></div>
                    <div class="bk-usage-bar${lv}"><i></i></div>`;
                const fill = elUsage.querySelector('.bk-usage-bar i'); if (fill) fill.style.width = Math.max(pct, st.usage ? 1 : 0) + '%';
            }
            if (!elProtect) return;
            if (st.persisted === true) elProtect.innerHTML = '<span class="bk-protect-say is-on"><i class="fa-solid fa-shield-halved"></i> 資料已受保護：瀏覽器不會自己清掉</span>';
            else if (st.persisted === false) {
                elProtect.innerHTML = '<span class="bk-protect-say"><i class="fa-solid fa-shield"></i> 資料還沒受保護：空間吃緊時瀏覽器可能整個清掉</span><span class="btn-test bk-scan-btn" id="bk-persist-btn">申請保護</span>';
                const b = elProtect.querySelector('#bk-persist-btn');
                if (b) b.onclick = async () => {
                    b.textContent = '申請中…';
                    const ok = await BACKUP.requestPersist();
                    await _paintUsage();
                    if (!ok && window.AUI) window.AUI.alert('瀏覽器這次沒有答應。\n通常要先把奧瑞亞「加到主畫面」、或允許它的通知之後再申請才會過。\n沒過之前，記得定期按下面的「匯出完整備份」。');
                };
            } else elProtect.textContent = '';
        }
        _paintUsage();

        const btnExport = container.querySelector('#bk-export-btn');
        // 🖼 「帶圖片」：預設勾；手機匯出到一半整頁重開（記憶體撐不住）時她可以取消再匯一次。記在這台（備份設定）
        const chkImg = container.querySelector('#bk-export-img');
        if (chkImg && BACKUP) {
            chkImg.checked = BACKUP.getSettings().exportImages !== false;
            chkImg.addEventListener('change', () => { const s = BACKUP.getSettings(); s.exportImages = chkImg.checked; BACKUP.saveSettings(s); });
        }
        // 🔑 帶不帶 API 金鑰：預設不帶（11-17），勾了記在這台
        const chkSecrets = container.querySelector('#bk-export-secrets');
        if (chkSecrets && BACKUP) {
            chkSecrets.checked = BACKUP.getSettings().exportSecrets === true;
            chkSecrets.addEventListener('change', () => { const s = BACKUP.getSettings(); s.exportSecrets = chkSecrets.checked; BACKUP.saveSettings(s); });
        }
        // 要匯出哪幾塊：跟雲端備份同一份名冊，酒館裡只列奧瑞亞自己管的（BACKUP.partsHere）；勾的記在這台
        const elParts = container.querySelector('#bk-parts');
        if (elParts && BACKUP && BACKUP.partsHere) {
            const cur = BACKUP.exportPartsGet();
            const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
            elParts.innerHTML = BACKUP.partsHere().map(p => '<label class="cloudbk-part"><input type="checkbox" data-part="' + p.k + '"' + (cur[p.k] ? ' checked' : '') + '><span>' + esc(p.label) + '</span></label>').join('');
            elParts.addEventListener('change', (e) => {
                const t = e.target;
                if (t && t.dataset && t.dataset.part) BACKUP.exportPartsSave({ [t.dataset.part]: t.checked });
            });
        }
        const _pickedParts = () => {
            const out = {};
            if (elParts) elParts.querySelectorAll('input[data-part]').forEach(i => { out[i.dataset.part] = i.checked; });
            return out;
        };
        if (btnExport) btnExport.addEventListener('click', async () => {
            if (!BACKUP) { setStatus('OS_BACKUP 模組未載入', '#fc8181'); return; }
            const parts = elParts ? _pickedParts() : undefined;
            if (parts && !Object.keys(parts).some(k => parts[k])) { setStatus('一塊都沒勾', '#fc8181'); return; }
            const withSecrets = chkSecrets ? chkSecrets.checked : false;
            if (withSecrets && BACKUP.confirmSecrets && !await BACKUP.confirmSecrets(parts || BACKUP.exportPartsGet())) return;
            setBtnLoading(btnExport, '準備中...');
            setStatus('正在打包資料...', 'rgba(var(--os-ink-rgb, 26, 28, 40), 0.25)');
            try {
                const sizeKB = await BACKUP.exportLocal({ images: chkImg ? chkImg.checked : undefined, parts: parts, secrets: withSecrets });
                const L = BACKUP.lastExport;
                // 酒館（Tauri）下載不會跳任何東西，要講檔案去哪了
                setStatus('匯出完成（' + sizeKB + ' KB' + (L && L.images ? '，含圖片和語音 ' + L.images + ' 張' : '') + '）' + (isStandaloneNow() ? '，請儲存至安全位置' : '，檔案在「下載」資料夾'), 'rgba(var(--os-ink-rgb, 26, 28, 40), 0.25)');
            } catch(e) { setStatus('匯出失敗：' + e.message, '#fc8181'); }
            setBtnDone(btnExport, '匯出備份 JSON');
        });

        const btnImport = container.querySelector('#bk-import-btn');
        const fileInput = container.querySelector('#bk-file-input');
        if (btnImport) btnImport.addEventListener('click', () => fileInput?.click());
        if (fileInput) fileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file || !BACKUP) return;
            if (!await AUI.confirm('用這份備份還原？會跟這台現有的資料合併，同一筆以備份那份為準。還原完會自己重新整理。', { okText: '還原', title: '從備份檔還原' })) return;
            setStatus('正在匯入...', 'rgba(var(--os-ink-rgb, 26, 28, 40), 0.25)');
            try {
                const result = await BACKUP.importLocal(file);
                BACKUP.afterRestore(result, '從備份檔還原');   // 馬上重整：開著的畫面還是舊的，不重整會被寫回去（os_backup.js 那段）
                return;
            } catch(e) { setStatus('匯入失敗：' + e.message, '#fc8181'); }
            e.target.value = '';
        });

        // ☁️ 自動備份到托管伺服器：開關、勾哪幾塊、上次結果、現在備份、雲端那幾份與還原
        (function wireCloudBackup() {
            const box = container.querySelector('#cloudbk-group');
            if (!box || !BACKUP || !BACKUP.autoGet) return;
            const $ = (s) => box.querySelector(s);
            const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
            const fmtT = (t) => { const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
            const fmtS = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((n || 0) / 1024)) + ' KB';
            const toast = (m) => { try { if (window.AUI && AUI.toast) AUI.toast(m); } catch (e) {} };
            function paint() {
                const a = BACKUP.autoGet(), gh = a.dest === 'github';
                $('#cloudbk-on').checked = !!a.on;
                box.querySelectorAll('.cloudbk-dest-btn').forEach(b => b.classList.toggle('on', b.dataset.dest === (gh ? 'github' : 'relay')));
                $('#cloudbk-gh').classList.toggle('hidden', !gh);
                if (gh) { const g = BACKUP.ghGet(); if (document.activeElement !== $('#cloudbk-gh-repo')) $('#cloudbk-gh-repo').value = g.repo; if (document.activeElement !== $('#cloudbk-gh-token')) $('#cloudbk-gh-token').value = g.token; }
                $('#cloudbk-parts').innerHTML = BACKUP.PARTS.map(p => '<label class="cloudbk-part"><input type="checkbox" data-part="' + p.k + '"' + (a.parts[p.k] ? ' checked' : '') + '><span>' + esc(p.label) + '</span></label>').join('');
                let st;
                if (!BACKUP.destReady(a)) st = gh ? '填好倉庫和金鑰。' : '先在上面「回覆交給伺服器跑」填好網址和通行碼。';
                else if (a.lastErr) st = '上次沒成功：' + a.lastErr + (a.lastAt ? '（最後成功 ' + fmtT(a.lastAt) + '）' : '');
                else if (a.lastAt) st = '上次備份 ' + fmtT(a.lastAt) + '・' + fmtS(a.lastSize);
                else st = a.on ? '還沒備份過。' : '還沒開。';
                $('#cloudbk-state').textContent = st;
            }
            async function run(force) {
                const b = $('#cloudbk-now');
                b.textContent = '備份中…';
                try { const r = await BACKUP.cloudBackup({ force: force }); toast(r.same ? '內容沒變，不用再傳' : '備份好了'); }
                catch (e) { toast('備份沒成功：' + e.message); }
                b.textContent = '現在備份';
                paint();
            }
            // 換地方：下次一定要傳（lastHash 清掉），列表也收起來（列的是另一邊的）
            box.addEventListener('click', (e) => {
                const b = e.target.closest('.cloudbk-dest-btn');
                if (!b) return;
                BACKUP.autoSave({ dest: b.dataset.dest, lastHash: '', lastErr: '' });
                $('#cloudbk-list').textContent = '';
                paint();
            });
            box.addEventListener('change', (e) => {
                const t = e.target;
                if (t.id === 'cloudbk-gh-repo' || t.id === 'cloudbk-gh-token') {
                    BACKUP.ghSave(t.id === 'cloudbk-gh-repo' ? { repo: t.value } : { token: t.value });
                    BACKUP.autoSave({ lastHash: '', lastErr: '' });
                    paint(); return;
                }
                if (t.id === 'cloudbk-on') { BACKUP.autoSave({ on: t.checked }); if (t.checked && BACKUP.destReady()) run(false); paint(); return; }
                if (t.dataset && t.dataset.part) {
                    const a = BACKUP.autoGet(); a.parts[t.dataset.part] = t.checked;
                    BACKUP.autoSave({ parts: a.parts, lastHash: '' });   // 勾的變了，下次一定要傳
                }
            });
            $('#cloudbk-now').addEventListener('click', () => run(true));
            $('#cloudbk-list-btn').addEventListener('click', async () => {
                const L = $('#cloudbk-list');
                L.textContent = '讀取中…';
                try {
                    const items = await BACKUP.cloudList();
                    L.innerHTML = items.length ? items.map(it => '<div class="cloudbk-row"><span class="cloudbk-row-tx">' + fmtT(it.at * 1000) + (it.size ? '・' + fmtS(it.size) : '') + (it.device ? '・' + esc(it.device) : '') + '</span><span class="btn-test cloudbk-restore" data-id="' + esc(it.id) + '">還原</span></div>').join('')
                        : '雲端還沒有備份。';
                } catch (e) { L.textContent = e.message; }
            });
            $('#cloudbk-list').addEventListener('click', async (e) => {
                const b = e.target.closest('[data-id]');
                if (!b) return;
                if (!await AUI.confirm('用這一份還原？會跟手機上現有的資料合併，同一筆以備份那份為準。還原完會自己重新整理。', { okText: '還原', title: '從雲端還原' })) return;
                b.textContent = '還原中…';
                try {
                    const res = await BACKUP.applyData(await BACKUP.cloudGet(b.dataset.id));
                    BACKUP.afterRestore(res, '從雲端還原');   // 以前問「現在重新整理？」可以按不要：不重整的話開著的畫面會把舊的寫回去
                    return;
                } catch (e2) { AUI.alert('還原沒成功：' + e2.message); }
                b.textContent = '還原';
            });
            paint();
        })();

        // 🔥 新增：一鍵格式化邏輯
        const btnFormat = container.querySelector('#bk-format-btn');
        if (btnFormat) {
            btnFormat.addEventListener('click', async () => {
                const firstConfirm = await AUI.confirm('警告：即將清空所有系統數據！這將徹底刪除你的所有劇情、對話、變數和設定！\n\n確定要繼續嗎？');
                if (!firstConfirm) return;
                
                const secondConfirm = await AUI.confirm('最終防線：資料刪除後無法恢復（宛如物理超渡）。\n請確保你已經匯出了備份檔。\n\n真的要徹底格式化嗎？');
                if (!secondConfirm) return;

                setBtnLoading(btnFormat, '格式化中...');
                setStatus('正在執行全系統格式化，請勿關閉網頁...', '#fc8181');
                
                try {
                    // 清除 LocalStorage
                    localStorage.clear();
                    
                    // 呼叫 OS_DB 的核彈接口
                    const win = window.parent || window;
                    if (win.OS_DB && typeof win.OS_DB.factoryReset === 'function') {
                        await win.OS_DB.factoryReset();
                    } else {
                        console.warn('[PhoneOS] 找不到 OS_DB.factoryReset，僅執行 localStorage 清理');
                    }
                    
                    setStatus('格式化完成！系統即將重生...', '#b8ffcb');
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } catch (e) {
                    setStatus('格式化失敗：' + e.message, '#fc8181');
                    setBtnDone(btnFormat, '格式化並清空所有數據');
                }
            });
        }
    }

    window.OS_SETTINGS_BACKUP = { bind: bindBackupTab };
})();
