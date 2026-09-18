// ----------------------------------------------------------------
// [檔案] os_phone_events.js
// 路徑：os_phone/os/os_phone_events.js
// 職責：手機事件簿（每個故事一本）。上一段劇情之後、她下一句話之前，手機上發生了什麼，
//       送正文時只拿「上次送完之後」的那幾筆，排在她那句話前面，只送這一次。
//       酒館（os_app_memory_inject 插在她那句前面）與 PWA（os_api_engine 組 vn_story 那包時放在她那句前面）
//       拿法一模一樣，只是塞進去的地方不同。
//
//   兩種來源：
//     ・讀取型 addSource(id, fn)：資料本來就存在別處的（微信的聊天記錄），送的時候去讀「那個時間點之後」的。
//       fn(故事id, from) → Promise<[{ name, last, lines:[…] }]>
//     ・記一筆型 record({ room, line })：沒有自己的記錄可讀的（之後的創作室 app、分享…），往這本裡記。
//
//   送出流程：build(mode) 組這一輪要送的 → 正文真的回來了 commit() 才記成送過（失敗或按停，下一輪再送）。
//     mode 'redo'＝重新生成／換一個回覆：送上一次那一批；'skip'＝續寫之類不是她說了一句話的：不送。
//   按故事分：OS_DB.currentChatId()（酒館＝聊天 id、PWA＝storyId，同一支）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    const APP = 'wx_to_story';          // 沿用第一版（只做微信那時）的存法，已經送過的不會重送
    const FIRST_HOURS = 3;              // 這個故事第一次用：只往回看這麼久，免得把很久以前的全倒進去
    const MAX_RECORDS = 300;
    const H = 3600 * 1000;

    const _sources = [];
    let _pending = null;

    function _cid() { try { return (win.OS_DB && win.OS_DB.currentChatId) ? win.OS_DB.currentChatId() : null; } catch (e) { return null; } }
    function _userName() {
        let n = '';
        try { if (win.OS_API && win.OS_API.getGlobalUserName) n = win.OS_API.getGlobalUserName() || ''; } catch (e) {}
        n = String(n).replace(/\*+/g, '').trim();
        return n || '你';
    }
    async function _get(key, cid) { try { return await win.OS_DB.getAppData(APP, key, cid); } catch (e) { return null; } }
    async function _put(key, v, cid) { try { await win.OS_DB.saveAppData(APP, key, v, cid); } catch (e) {} }

    function addSource(id, fn) {
        for (let i = _sources.length - 1; i >= 0; i--) if (_sources[i].id === id) _sources.splice(i, 1);
        _sources.push({ id: id, fn: fn });
    }

    // 記一筆：room＝這筆算在哪一格底下（app 名、聊天室名），line＝發生了什麼（一句話）
    async function record(ev) {
        const cid = _cid();
        if (cid == null || !ev || !String(ev.line || '').trim()) return false;
        const list = (await _get('events', cid)) || [];
        list.push({ at: Date.now(), room: String(ev.room || '手機').trim(), line: String(ev.line).trim() });
        while (list.length > MAX_RECORDS) list.shift();
        await _put('events', list, cid);
        return true;
    }
    async function _recorded(cid, from) {
        const list = (await _get('events', cid)) || [];
        const by = {};
        list.forEach(function (e) {
            if (!e || !(e.at > from)) return;
            const r = (by[e.room] = by[e.room] || { name: e.room, last: 0, lines: [] });
            r.lines.push('・' + e.line);
            r.last = Math.max(r.last, e.at);
        });
        return Object.keys(by).map(function (k) { return by[k]; });
    }

    function _format(rooms) {
        if (!rooms.length) return '';
        const me = _userName();
        return '上一段劇情之後、' + me + '接下來這句話之前，' + me + '在手機上：\n'
            + rooms.map(function (r) { return '〔' + r.name + '〕\n' + r.lines.join('\n'); }).join('\n')
            + '\n這些都已經發生過了。劇情從' + me + '接下來這句話接著寫，可以自然帶到手機上的事，但不要把這些對話再演一遍。';
    }

    // 回傳 { text, from }：text＝這一輪要送的（空＝沒有），from＝從哪個時間點算起
    //   （手機記憶那塊回顧要排除 from 之後的，免得同一句出現兩次）
    async function build(mode) {
        _pending = null;
        const cid = _cid();
        if (cid == null || !win.OS_DB || !win.OS_DB.getAppData) return { text: '', from: 0 };
        const st = (await _get('state', cid)) || {};
        if (mode === 'redo') return { text: st.lastText || '', from: st.lastFrom || st.lastEnd || 0 };
        if (mode === 'skip') return { text: '', from: st.lastEnd || 0 };
        const now = Date.now();
        const from = st.lastEnd || (now - FIRST_HOURS * H);
        let rooms = [];
        for (let i = 0; i < _sources.length; i++) {
            try { const r = await _sources[i].fn(cid, from); if (Array.isArray(r)) rooms = rooms.concat(r); }
            catch (e) { console.warn('[手機事件簿] 「' + _sources[i].id + '」讀不到：', (e && e.message) || e); }
        }
        rooms = rooms.concat(await _recorded(cid, from)).filter(function (r) { return r && r.lines && r.lines.length; });
        rooms.sort(function (a, b) { return (a.last || 0) - (b.last || 0); });   // 先聊完的排前面
        const text = _format(rooms);
        _pending = { cid: cid, from: from, until: now, text: text };
        return { text: text, from: from };
    }
    // 正文真的回來了：把這一批記成送過
    async function commit() {
        const p = _pending;
        _pending = null;
        if (!p) return;
        await _put('state', { lastEnd: p.until, lastFrom: p.from, lastText: p.text }, p.cid);
    }
    function cancel() { _pending = null; }

    const API = { addSource: addSource, record: record, build: build, commit: commit, cancel: cancel };
    win.OS_PHONE_EVENTS = API;
    window.OS_PHONE_EVENTS = API;
})();
