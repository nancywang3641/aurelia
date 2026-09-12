// ----------------------------------------------------------------
// [手機] os_keepalive.js —— 沒有伺服器時，讓手機別把奧瑞亞凍起來
// 職責：
//   有填托管網址的人，切出去那一輪是伺服器替他跑完的（os_relay.js），手機可以睡。
//   沒有伺服器的人只能反過來：想辦法讓這個分頁「不要被系統凍結」，
//   角色主動找人的那個每分鐘掃描（os_heartbeat.js）才會繼續走。
//   三招各自一個開關，都是純前端、零伺服器：
//     ・靜音音訊＋鎖屏播放卡：刻一段全零的 WAV 循環播，系統以為在放音樂就不砍計時器
//     ・螢幕不自動關＋背景計時器：WakeLock ＋ 一支只負責 tick 的 Worker
//     ・畫中畫小窗：把一張 canvas 推成畫中畫；小窗在前景＝分頁不會被凍
//   加上一件無論哪招都要有的：背景有人開口時，發一則本機通知。
// 🚨 天花板就是「app 還在記憶體裡」。真的被系統回收就是斷，這點要跟人講清楚。
// 🚨 iOS 的第一次播放與要求通知權限都必須在她的手勢裡，所以：
//    ・音訊播不動就掛一次性的 pointerdown 重試
//    ・通知權限只在按鈕的處理器裡直接要，中間不准 await 別的東西
// 對外：OS_KEEPALIVE.cfg/setCfg/apply/caps/state/pipToggle/askNotify/notify
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const d = win.document;
    const CFG_KEY = 'aurelia_keepalive_cfg';

    const DEF = { audio: false, wake: false, notify: false };
    const ICON = 'https://files.catbox.moe/l5hl69.png';   // 跟 sw.js 的推播通知同一張，免得兩種通知長得不一樣

    function cfg() {
        try {
            const o = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
            return Object.assign({}, DEF, (o && typeof o === 'object') ? o : {});
        } catch (e) { return Object.assign({}, DEF); }
    }
    function setCfg(patch) {
        const next = Object.assign(cfg(), patch || {});
        try { localStorage.setItem(CFG_KEY, JSON.stringify(next)); } catch (e) {}
        apply();
        return next;
    }

    function caps() {
        let pip = false;
        try {
            pip = !!(d.pictureInPictureEnabled
                && typeof HTMLCanvasElement !== 'undefined'
                && HTMLCanvasElement.prototype.captureStream
                && HTMLVideoElement.prototype.requestPictureInPicture);
        } catch (e) {}
        let wake = false;
        try { wake = !!(win.navigator && win.navigator.wakeLock && win.navigator.wakeLock.request); } catch (e) {}
        let notify = false;
        try { notify = (typeof win.Notification !== 'undefined'); } catch (e) {}
        return { audio: true, wake: wake, pip: pip, notify: notify };
    }

    // ── 靜音音訊：現場刻一段 8kHz、兩秒、全零的 WAV（不外連任何檔案）──
    let _wavUrl = null;
    function silentWavUrl() {
        if (_wavUrl) return _wavUrl;
        const rate = 8000, secs = 2, n = rate * secs, total = 44 + n * 2;
        const buf = new ArrayBuffer(total), v = new DataView(buf);
        const ascii = function (off, s) { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
        ascii(0, 'RIFF');  v.setUint32(4, total - 8, true);
        ascii(8, 'WAVE');  ascii(12, 'fmt ');
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
        v.setUint16(32, 2, true); v.setUint16(34, 16, true);
        ascii(36, 'data'); v.setUint32(40, n * 2, true);
        _wavUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
        return _wavUrl;
    }

    let _audio = null, _audioWantPlay = false, _gestureHooked = false;
    function _mediaSession() {
        try {
            const ms = win.navigator && win.navigator.mediaSession;
            if (!ms) return;
            if (win.MediaMetadata) {
                ms.metadata = new win.MediaMetadata({
                    title: '奧瑞亞在背景等訊息', artist: '奧瑞亞', album: '後台守候'
                });
            }
            ms.playbackState = 'playing';
            // 鎖屏那張卡按下去不要真的把守候關掉；停止才當成她要關
            try { ms.setActionHandler('play', function () { _playAudio(); }); } catch (e) {}
            try { ms.setActionHandler('pause', function () { _playAudio(); }); } catch (e) {}
            try { ms.setActionHandler('stop', function () { setCfg({ audio: false }); }); } catch (e) {}
        } catch (e) {}
    }
    function _playAudio() {
        if (!_audio) return;
        const p = _audio.play();
        if (p && p.catch) {
            p.then(function () { _mediaSession(); }).catch(function () {
                // iOS：沒有手勢不准播 → 等她下一次碰畫面再試一次
                if (_gestureHooked) return;
                _gestureHooked = true;
                const once = function () {
                    d.removeEventListener('pointerdown', once, true);
                    _gestureHooked = false;
                    if (_audioWantPlay) _playAudio();
                };
                d.addEventListener('pointerdown', once, true);
            });
        } else { _mediaSession(); }
    }
    function audioOn() {
        _audioWantPlay = true;
        if (!_audio) {
            _audio = d.createElement('audio');
            _audio.className = 'ka-hidden-media';
            _audio.loop = true;
            _audio.setAttribute('playsinline', '');
            _audio.src = silentWavUrl();
            d.body.appendChild(_audio);
        }
        _playAudio();
    }
    function audioOff() {
        _audioWantPlay = false;
        if (_audio) { try { _audio.pause(); } catch (e) {} }
        try {
            const ms = win.navigator && win.navigator.mediaSession;
            if (ms) { ms.playbackState = 'none'; ms.metadata = null; }
        } catch (e) {}
    }

    // ── 螢幕不自動關 ＋ 一支只負責 tick 的 Worker ──
    //   WakeLock 只在畫面看得見的時候拿得住（規格就這樣），所以它擋的是「螢幕自己關掉」，
    //   Worker 擋的是「背景計時器被降速」。兩件事一起才有用，所以綁同一個開關。
    let _lock = null, _worker = null, _wakeWant = false;
    async function _askLock() {
        if (!_wakeWant || _lock) return;
        try {
            if (d.visibilityState !== 'visible') return;
            _lock = await win.navigator.wakeLock.request('screen');
            _lock.addEventListener('release', function () { _lock = null; });
        } catch (e) { _lock = null; }
    }
    function _startWorker() {
        if (_worker) return;
        try {
            const src = 'let n=0;setInterval(function(){n++;postMessage(n);},5000);';
            const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
            _worker = new Worker(url);
            // 主執行緒故意什麼都不做：存在的意義只是讓 worker 那支計時器不被節流
            _worker.onmessage = function () {};
        } catch (e) { _worker = null; }
    }
    function wakeOn() {
        _wakeWant = true;
        _startWorker();
        if (caps().wake) _askLock();
    }
    function wakeOff() {
        _wakeWant = false;
        if (_lock) { try { _lock.release(); } catch (e) {} _lock = null; }
        if (_worker) { try { _worker.terminate(); } catch (e) {} _worker = null; }
    }

    // ── 畫中畫小窗：canvas → captureStream → video → 畫中畫 ──
    //   🚨 畫面用 setInterval 重畫，不用 requestAnimationFrame：分頁一藏起來 rAF 就不 fire，
    //      而這扇窗存在的理由正好是「藏起來的時候還在動」。
    let _pipVideo = null, _pipCanvas = null, _pipTimer = null, _pipSince = 0;
    function _pipDraw() {
        if (!_pipCanvas) return;
        const c = _pipCanvas.getContext('2d');
        const W = _pipCanvas.width, H = _pipCanvas.height;
        const g = c.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#1b2a4a'); g.addColorStop(1, '#0f1728');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        const secs = Math.max(0, Math.round((Date.now() - _pipSince) / 1000));
        const mm = String(Math.floor(secs / 60)).padStart(2, '0');
        const ss = String(secs % 60).padStart(2, '0');
        c.fillStyle = '#e8eefb';
        c.font = '600 22px system-ui, sans-serif';
        c.textBaseline = 'middle';
        c.fillText('奧瑞亞守著', 26, 66);
        c.fillStyle = '#8fa8d8';
        c.font = '400 15px system-ui, sans-serif';
        c.fillText('已經守了 ' + mm + ':' + ss, 26, 100);
        // 呼吸的點：看得出這扇窗是活的
        const a = 0.35 + 0.45 * Math.abs(Math.sin(Date.now() / 700));
        c.beginPath(); c.arc(W - 34, 66, 7, 0, Math.PI * 2);
        c.fillStyle = 'rgba(224,189,116,' + a.toFixed(2) + ')'; c.fill();
    }
    function pipActive() {
        try { return !!(d.pictureInPictureElement); } catch (e) { return false; }
    }
    async function pipToggle() {
        if (!caps().pip) return false;
        if (pipActive()) {
            try { await d.exitPictureInPicture(); } catch (e) {}
            if (_pipTimer) { clearInterval(_pipTimer); _pipTimer = null; }
            return false;
        }
        if (!_pipCanvas) {
            _pipCanvas = d.createElement('canvas');
            _pipCanvas.width = 320; _pipCanvas.height = 180;
            _pipVideo = d.createElement('video');
            _pipVideo.className = 'ka-hidden-media';
            _pipVideo.muted = true;
            _pipVideo.setAttribute('playsinline', '');
            d.body.appendChild(_pipVideo);
        }
        _pipSince = Date.now();
        _pipDraw();
        if (!_pipTimer) _pipTimer = setInterval(_pipDraw, 1000);
        try {
            if (!_pipVideo.srcObject) _pipVideo.srcObject = _pipCanvas.captureStream(12);
            await _pipVideo.play();
            await _pipVideo.requestPictureInPicture();
            return true;
        } catch (e) {
            console.warn('[保活] 畫中畫開不起來:', (e && e.message) || e);
            if (_pipTimer) { clearInterval(_pipTimer); _pipTimer = null; }
            return false;
        }
    }

    // ── 本機通知（沒有伺服器也發得出來，但只有 app 還活著才發得出來）──
    // 🚨 權限一定要在按鈕的處理器裡直接要，前面不准 await 任何東西（iOS 會判定不是手勢）
    function askNotify() {
        try {
            if (typeof win.Notification === 'undefined') return Promise.resolve('unsupported');
            return win.Notification.requestPermission().then(function (perm) {
                setCfg({ notify: perm === 'granted' });
                return perm;
            });
        } catch (e) { return Promise.resolve('error'); }
    }
    async function notify(title, body, tag) {
        const c = cfg();
        if (!c.notify) return false;
        try {
            if (typeof win.Notification === 'undefined' || win.Notification.permission !== 'granted') return false;
        } catch (e) { return false; }
        const opts = {
            body: String(body || '').slice(0, 240),
            tag: tag || 'aurelia-local',
            icon: ICON,
            badge: ICON
        };
        // iOS 的 PWA 只認 Service Worker 那條，new Notification 會直接丟錯
        try {
            const reg = win.navigator.serviceWorker && await win.navigator.serviceWorker.getRegistration();
            if (reg && reg.showNotification) { await reg.showNotification(String(title || '奧瑞亞'), opts); return true; }
        } catch (e) {}
        try { new win.Notification(String(title || '奧瑞亞'), opts); return true; } catch (e) {}
        return false;
    }

    // ── 套用設定 ──
    function apply() {
        const c = cfg();
        if (c.audio) audioOn(); else audioOff();
        if (c.wake) wakeOn(); else wakeOff();
    }
    function state() {
        const c = cfg();
        let perm = 'default';
        try { perm = (typeof win.Notification !== 'undefined') ? win.Notification.permission : 'unsupported'; } catch (e) {}
        return {
            audio: !!(c.audio && _audio && !_audio.paused),
            audioWant: !!c.audio,
            wake: !!_lock,
            wakeWant: !!c.wake,
            worker: !!_worker,
            pip: pipActive(),
            notifyPerm: perm,
            relay: !!(win.OS_RELAY && win.OS_RELAY.enabled && win.OS_RELAY.enabled())
        };
    }

    try {
        d.addEventListener('visibilitychange', function () {
            if (d.visibilityState === 'visible') {
                // iOS 切走會把音訊暫停；WakeLock 也會被系統收回，回來都要再拿一次
                if (_audioWantPlay) _playAudio();
                if (_wakeWant) _askLock();
            }
        });
    } catch (e) {}
    setTimeout(apply, 1500);

    win.OS_KEEPALIVE = {
        cfg: cfg, setCfg: setCfg, apply: apply, caps: caps, state: state,
        pipToggle: pipToggle, pipActive: pipActive, askNotify: askNotify, notify: notify
    };
    if (win !== window) { try { window.OS_KEEPALIVE = win.OS_KEEPALIVE; } catch (e) {} }
    console.log('[PhoneOS] 載入後台守候 (OS_KEEPALIVE)');
})();
