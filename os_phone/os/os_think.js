// ----------------------------------------------------------------
// [檔案] os_think.js
// 職責：把 AI 的思考過程（<think>…</think>、原生推理欄位）記下來，給別的畫面拿最新一筆。
//       os_api_engine 整理回覆時自動 push；劇情的「COT」小窗、聊天 app 的思考摺疊用 getLatest() 拿。
//       以前這支還自帶一顆浮鈕和滑出來的面板，要掛在手機外框（#phone-frame-hardware）上；
//       那個外框早就拿掉了，浮鈕從來沒出現過，11-19 連同面板、樣式一起拿掉，只留紀錄這一半。
// ----------------------------------------------------------------
(function() {
    const win = window.parent || window;
    const MAX_ENTRIES = 50;
    const STORAGE_KEY = 'os_think_log';

    let _ctx = null; // 當前 API 呼叫的 context，由 setContext() 設定
    let entries  = [];

    // ── 持久化 ──────────────────────────────────────────────────────────
    function loadFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) entries = JSON.parse(raw);
        } catch(e) { entries = []; }
    }
    function saveToStorage() {
        win.AUI.lsSet(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)), '思考過程記錄');   // 空間滿了會跳提示（以前靜靜吞掉）
    }
    loadFromStorage();

    function formatTime(d) {
        const p = n => String(n).padStart(2,'0');
        return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }

    // ── Public API ────────────────────────────────────────────────────
    win.OS_THINK = {
        /**
         * 在 API 呼叫前設定 context，讓 push() 知道是哪個面板、用戶輸入什麼
         * @param {{ panel: string, userInput?: string }} ctx
         */
        setContext(ctx) { _ctx = ctx || null; },

        /**
         * 推入思考記錄（由 os_api_engine.cleanRawOutput 自動呼叫）
         * 帶入當前 _ctx（panel + userInput）一起存檔
         * @param {string} content - <think> 內容
         * @param {string} [rawOutput] - AI 完整原始輸出（選填）
         */
        push(content, rawOutput) {
            if (!content || !String(content).trim()) return;
            const entry = {
                content:   String(content).trim(),
                rawOutput: rawOutput ? String(rawOutput).trim() : '',
                time:      formatTime(new Date()),
                timestamp: Date.now(),
                panel:     _ctx?.panel     || '',
                userInput: _ctx?.userInput || ''
            };
            entries.unshift(entry);
            if (entries.length > MAX_ENTRIES) entries.pop();
            saveToStorage();
        },
        /** 取最新一筆思考記錄（給 VN 小窗 / 存檔用） */
        getLatest() { return entries[0] || null; }
    };
})();
