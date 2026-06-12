// ----------------------------------------------------------------
// [檔案] os_control_room.js
// 職責：「控制室」手機 App — 監控/遙控 桌面控制塔（SoVITS + ComfyUI）
//   • 每 4 秒輪詢 http://127.0.0.1:9890/status（控制塔自帶 CORS header，跨埠 OK）
//   • 狀態燈 🟢🟡🔴、GPU/VRAM、生圖佇列
//   • 按鈕對接 /start /stop /restart /open
// 控制塔本體：tools/aurelia_tower.ps1（桌面捷徑「奧瑞亞控制塔」）
// ----------------------------------------------------------------
(function() {
    'use strict';
    const win = window.parent || window;
    const TOWER = 'http://127.0.0.1:9890';

    const ControlRoom = {
        _timer: null,
        _starting: { sovits: 0, comfy: 0 },   // 按下啟動後的「啟動中」黃燈窗口（timestamp）

        launchApp(container) {
            container.innerHTML = `
                <div class="cr-root">
                    <div class="cr-header">
                        <div class="cr-title">🎛️ 控制室</div>
                        <div class="cr-sub">SoVITS ＋ ComfyUI 都在這裡管，不用看黑窗</div>
                    </div>
                    <div id="cr-tower-down" class="cr-tower-down hidden">
                        🔴 控制塔未啟動<br>
                        <span class="cr-tower-hint">雙擊桌面的「奧瑞亞控制塔」捷徑，這裡就會亮起來</span>
                    </div>
                    <div id="cr-cards">
                        <div class="cr-card" id="cr-card-sovits">
                            <div class="cr-card-head">
                                <span class="cr-dot" id="cr-dot-sovits">🔴</span>
                                <span class="cr-card-name">🎙️ 語音引擎</span>
                                <span class="cr-card-tag">SoVITS · 9880</span>
                            </div>
                            <div class="cr-card-body" id="cr-info-sovits">—</div>
                            <div class="cr-card-btns">
                                <button class="cr-btn" data-act="start" data-svc="sovits">啟動</button>
                                <button class="cr-btn" data-act="restart" data-svc="sovits">重啟</button>
                                <button class="cr-btn cr-btn-danger" data-act="stop" data-svc="sovits">停止</button>
                            </div>
                        </div>
                        <div class="cr-card" id="cr-card-comfy">
                            <div class="cr-card-head">
                                <span class="cr-dot" id="cr-dot-comfy">🔴</span>
                                <span class="cr-card-name">🎨 生圖引擎</span>
                                <span class="cr-card-tag">ComfyUI · 8188</span>
                            </div>
                            <div class="cr-card-body" id="cr-info-comfy">—</div>
                            <div class="cr-vram hidden" id="cr-vram-wrap">
                                <div class="cr-vram-label" id="cr-vram-label">VRAM</div>
                                <div class="cr-vram-track"><div class="cr-vram-bar" id="cr-vram-bar"></div></div>
                            </div>
                            <div class="cr-card-btns">
                                <button class="cr-btn" data-act="start" data-svc="comfy">啟動</button>
                                <button class="cr-btn" data-act="restart" data-svc="comfy">重啟</button>
                                <button class="cr-btn cr-btn-danger" data-act="stop" data-svc="comfy">停止</button>
                                <button class="cr-btn" id="cr-free-vram" title="卸載快取的模型、清空顯存（不重啟；下次生圖會重載模型，多花十幾秒）">🧹 釋顯存</button>
                                <button class="cr-btn" id="cr-open-web">開網頁</button>
                            </div>
                        </div>
                    </div>
                    <div class="cr-all-btns">
                        <button class="cr-btn cr-btn-big" data-act="start" data-svc="all">▶ 全部啟動</button>
                        <button class="cr-btn cr-btn-big cr-btn-danger" data-act="stop" data-svc="all">■ 全部停止</button>
                    </div>
                    <div class="cr-foot" id="cr-foot">連線中…</div>
                </div>`;

            container.querySelectorAll('.cr-btn[data-act]').forEach(btn => {
                btn.onclick = () => this._act(btn.dataset.act, btn.dataset.svc, container);
            });
            const openBtn = container.querySelector('#cr-open-web');
            if (openBtn) openBtn.onclick = () => { this._post('/open'); };
            const freeBtn = container.querySelector('#cr-free-vram');
            if (freeBtn) freeBtn.onclick = async () => {
                const foot = container.querySelector('#cr-foot');
                if (foot) foot.textContent = '🧹 正在卸載模型、釋放顯存…';
                await this._post('/free');
                setTimeout(() => this._tick(container), 1200);   // 稍等再刷，VRAM 條會看到掉下來
            };

            this._startPolling(container);
        },

        async _post(path) {
            try { await fetch(TOWER + path, { method: 'POST' }); } catch (e) {}
        },

        async _act(act, svc, container) {
            if (act === 'start' || act === 'restart') {
                if (svc === 'sovits' || svc === 'all') this._starting.sovits = Date.now();
                if (svc === 'comfy'  || svc === 'all') this._starting.comfy  = Date.now();
            }
            await this._post('/' + act + '?svc=' + svc);
            this._tick(container);   // 立刻刷一次
        },

        _startPolling(container) {
            if (this._timer) clearInterval(this._timer);
            this._tick(container);
            this._timer = setInterval(() => {
                if (!container.isConnected || !container.querySelector('.cr-root')) {
                    clearInterval(this._timer); this._timer = null; return;   // App 已關閉 → 停止輪詢
                }
                this._tick(container);
            }, 4000);
        },

        async _tick(container) {
            const $ = (id) => container.querySelector(id);
            let st = null;
            try {
                const r = await fetch(TOWER + '/status', { signal: (AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined) });
                st = await r.json();
            } catch (e) {}

            const downEl = $('#cr-tower-down');
            const cards = $('#cr-cards');
            if (!st || !st.tower) {
                if (downEl) downEl.classList.remove('hidden');
                if (cards) cards.classList.add('cr-dim');
                const foot = $('#cr-foot'); if (foot) foot.textContent = '找不到控制塔（127.0.0.1:9890）';
                return;
            }
            if (downEl) downEl.classList.add('hidden');
            if (cards) cards.classList.remove('cr-dim');

            const dot = (up, key) => {
                if (up) { this._starting[key] = 0; return '🟢'; }
                if (this._starting[key] && (Date.now() - this._starting[key]) < 120000) return '🟡';   // 啟動中（兩分鐘窗口）
                return '🔴';
            };

            const ds = $('#cr-dot-sovits'); if (ds) ds.textContent = dot(st.sovits?.up, 'sovits');
            const is_ = $('#cr-info-sovits');
            if (is_) is_.textContent = st.sovits?.up ? '運作中，語音隨叫隨到' : (this._starting.sovits ? '啟動中…（載入語音模型要一陣子）' : '未啟動');

            const dc = $('#cr-dot-comfy'); if (dc) dc.textContent = dot(st.comfy?.up, 'comfy');
            const ic = $('#cr-info-comfy');
            const vramWrap = $('#cr-vram-wrap');
            if (st.comfy?.up) {
                const run = st.comfy.queue_running || 0, pend = st.comfy.queue_pending || 0;
                if (ic) ic.textContent = (run > 0 ? `🔥 生圖中（佇列還有 ${pend} 張排隊）` : (pend > 0 ? `排隊 ${pend} 張` : '待命中，佇列乾淨'));
                if (vramWrap && st.comfy.vram_total) {
                    vramWrap.classList.remove('hidden');
                    const used = Math.max(0, st.comfy.vram_total - (st.comfy.vram_free || 0));
                    const pct = Math.min(100, Math.round(used / st.comfy.vram_total * 100));
                    const label = $('#cr-vram-label');
                    if (label) label.textContent = `VRAM ${used.toFixed(1)} / ${st.comfy.vram_total} GB${st.comfy.gpu ? '　' + st.comfy.gpu : ''}`;
                    const bar = $('#cr-vram-bar');
                    if (bar) { bar.style.width = pct + '%'; bar.classList.toggle('cr-vram-hot', pct > 85); }
                }
            } else {
                if (ic) ic.textContent = this._starting.comfy ? '啟動中…（第一次要 30~60 秒）' : '未啟動';
                if (vramWrap) vramWrap.classList.add('hidden');
            }

            const foot = $('#cr-foot');
            if (foot) foot.textContent = '控制塔連線正常 · 每 4 秒更新';
        }
    };

    function install() {
        if (win.PhoneSystem) {
            win.PhoneSystem.install('控制室', '🎛️', '#0a0906', (c) => ControlRoom.launchApp(c));
            console.log('[PhoneOS] 🎛️ 控制室已安裝');
        } else { setTimeout(install, 1000); }
    }
    install();

    win.OS_CONTROL_ROOM = ControlRoom;
})();
