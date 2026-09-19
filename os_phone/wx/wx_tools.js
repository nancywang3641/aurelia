// ----------------------------------------------------------------
// [檔案] wx_tools.js — 聊天 app 的「工具」（上網搜尋那種）
// 路徑：os_phone/wx/wx_tools.js
//
// 她看到 TauriTavern 新版有 MCP 那塊，問聊天 app 能不能也裝。酒館裝的工具傳不到聊天 app
// （聊天 app 不走酒館送出那條路），所以奧瑞亞自己接：
//   ・工具清單大家共用，只裝一次（OS_DB app_data，不分故事）。
//   ・每間聊天室自己勾這間用哪幾個（chat.tools = [工具 id]）；聊天設置「可以用工具」那個開關打開就跳小窗勾。
//   ・工具走 MCP 的網址那種（https://…），瀏覽器直接叫，不用伺服器——酒館版、手機 PWA、朋友那邊都能用。
//     要在電腦上跑一支程式的那種 MCP 這裡裝不了（手機沒地方跑）。
//
// 🚨 角色怎麼叫工具：不用模型自己的「工具呼叫」（很多中轉站、模型不支援，換個模型就沒反應），
//    改成跟換頭像、朋友圈一樣，在回覆裡寫一個固定的英文標籤：
//      <tool_call name="工具名">{"參數": "值"}</tool_call>
//    wx_core 在拆訊息之前抽掉它（extract）、畫完這一輪的泡泡後去跑（run），結果存在 chat.toolLog，
//    再自動叫一次回覆，這一輪把結果交給它（resultsBlock）。結果只整段送一次，之後只送一行重點。
//
// 暴露：window.WX_TOOLS
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const d = win.document;

    const APP_ID = 'wx_tools';
    const SEED_KEY = 'wx_tools_seeded';
    const CALL_TIMEOUT = 25000;
    const RESULT_MAX = 3000;     // 一次結果整段送給模型的上限（字）
    const LOG_KEEP = 8;          // 每間留幾筆用過的紀錄
    const MAX_CALLS = 3;         // 一輪最多跑幾個

    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    function _db() { return win.OS_DB || window.OS_DB; }
    function _toast(t) { try { const A = win.AUI || window.AUI; if (A && A.toast) A.toast(t); } catch (e) {} }
    function _confirm(msg) {
        try { const A = win.AUI || window.AUI; if (A && A.confirm) return Promise.resolve(A.confirm(msg)); } catch (e) {}
        return Promise.resolve(win.confirm ? win.confirm(msg) : true);
    }

    // ================================================================
    // 內建工具：不是 MCP，程式自己做（網頁做得到、又真的有用的才放）
    //   ・天氣：手機的位置（或她在小窗填的城市）→ 天氣。座標不給模型，只給地名。
    //     地名→座標用 OpenStreetMap（中文地名認得準；Open-Meteo 自己的查地名認不得「台北」）；
    //     座標→地名用 BigDataCloud；天氣用 Open-Meteo。三個都免金鑰、網頁直接叫得到。
    // ================================================================
    const WMO = { 0: '晴', 1: '大致晴朗', 2: '局部多雲', 3: '陰', 45: '霧', 48: '霧', 51: '毛毛雨', 53: '毛毛雨', 55: '較大的毛毛雨',
        56: '凍毛毛雨', 57: '凍毛毛雨', 61: '小雨', 63: '中雨', 65: '大雨', 66: '凍雨', 67: '凍雨', 71: '小雪', 73: '中雪', 75: '大雪',
        77: '雪粒', 80: '陣雨', 81: '較強的陣雨', 82: '猛烈陣雨', 85: '陣雪', 86: '較大的陣雪', 95: '雷雨', 96: '雷雨夾冰雹', 99: '雷雨夾冰雹' };
    async function _getJson(url) {
        const ac = new AbortController();
        const timer = setTimeout(function () { ac.abort(); }, 12000);
        try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error(String(r.status)); return await r.json(); }
        finally { clearTimeout(timer); }
    }
    async function _geocode(q) {
        try {
            const j = await _getJson('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=zh-TW&q=' + encodeURIComponent(q));
            if (j && j[0]) return { lat: +j[0].lat, lon: +j[0].lon, place: q };
        } catch (e) {}
        try {
            const j = await _getJson('https://geocoding-api.open-meteo.com/v1/search?count=1&language=zh&name=' + encodeURIComponent(q));
            const r = j && j.results && j.results[0];
            if (r) return { lat: r.latitude, lon: r.longitude, place: [r.name, r.admin1, r.country].filter(Boolean).join('，') };
        } catch (e) {}
        return null;
    }
    let _pos = null;   // { lat, lon, at }：手機位置留 30 分鐘，不用每次都問
    function _myPos() {
        if (_pos && Date.now() - _pos.at < 30 * 60 * 1000) return Promise.resolve(_pos);
        const geo = (win.navigator && win.navigator.geolocation) || (navigator && navigator.geolocation);
        if (!geo) return Promise.reject(new Error('這台裝置拿不到位置'));
        return new Promise(function (ok, no) {
            geo.getCurrentPosition(function (p) {
                _pos = { lat: p.coords.latitude, lon: p.coords.longitude, at: Date.now() };
                ok(_pos);
            }, function (e) {
                no(new Error(e && e.code === 1 ? '沒有給位置' : '這次拿不到位置'));
            }, { timeout: 10000, maximumAge: 30 * 60 * 1000 });
        });
    }
    async function _placeName(lat, lon) {
        try {
            const j = await _getJson('https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=zh&latitude=' + lat + '&longitude=' + lon);
            return [j.city || j.locality, j.principalSubdivision !== (j.city || j.locality) ? j.principalSubdivision : '', j.countryName].filter(Boolean).join('，');
        } catch (e) { return ''; }
    }
    async function _weather(args, srv) {
        const asked = String((args && args.city) || '').trim();
        const q = asked || String((srv && srv.city) || '').trim();
        let lat, lon, place;
        if (q) {
            const g = await _geocode(q);
            if (!g) throw new Error('找不到「' + q + '」這個地方');
            lat = g.lat; lon = g.lon; place = g.place + (asked ? '' : '（對方住的地方）');
        } else {
            let pos;
            try { pos = await _myPos(); }
            catch (e) {
                _toast('天氣要用手機的位置：' + e.message + '。也可以在聊天設置「可以用工具」裡替天氣填一個城市');
                throw new Error('對方' + e.message + '，不知道對方在哪裡');
            }
            lat = pos.lat; lon = pos.lon;
            place = ((await _placeName(lat, lon)) || '對方所在的地方') + '（對方現在的位置）';
        }
        const la = (+lat).toFixed(2), lo = (+lon).toFixed(2);
        const f = await _getJson('https://api.open-meteo.com/v1/forecast?latitude=' + la + '&longitude=' + lo
            + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m'
            + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3');
        const c = f.current || {}, dly = f.daily || {};
        const rd = function (v) { return Math.round(+v); };
        const lines = ['地點：' + place];
        lines.push('現在（當地 ' + String(c.time || '').slice(11, 16) + '）：' + (WMO[c.weather_code] || '—') + '，' + rd(c.temperature_2m) + '°C（體感 ' + rd(c.apparent_temperature) + '°C），濕度 '
            + rd(c.relative_humidity_2m) + '%，風 ' + rd(c.wind_speed_10m) + ' km/h' + (+c.precipitation > 0 ? '，正在下（' + c.precipitation + ' mm）' : ''));
        ['今天', '明天', '後天'].forEach(function (lab, i) {
            if (!dly.time || dly.time[i] == null) return;
            lines.push(lab + '：' + (WMO[dly.weather_code[i]] || '—') + '，' + rd(dly.temperature_2m_min[i]) + '～' + rd(dly.temperature_2m_max[i]) + '°C'
                + (dly.precipitation_probability_max && dly.precipitation_probability_max[i] != null ? '，降雨機率 ' + dly.precipitation_probability_max[i] + '%' : ''));
        });
        return lines.join('\n');
    }
    const BUILTIN = {
        weather: {
            id: 'tl_weather', name: '天氣',
            tools: [{ name: 'get_weather', description: '查現在的天氣和接下來三天的預報。不填地點就是對方現在所在的地方。',
                inputSchema: { type: 'object', properties: { city: { type: 'string', description: '要查的地方（城市名）；問對方那邊的天氣就不要填' } } } }],
            run: _weather
        }
    };

    // ================================================================
    // 清單（共用）
    // ================================================================
    let _list = null;   // [{ id, name, url, key, paused, tools:[{name, description, inputSchema}], err, at }]
    async function load() {
        if (_list) return _list;
        const db = _db();
        if (!db || !db.getAppData) return [];   // 資料庫還沒起來：這次先當沒有，別記住空的
        try { const v = await db.getAppData(APP_ID, 'list', null); _list = Array.isArray(v) ? v : []; }
        catch (e) { return []; }
        // 第一次打開：先裝好上網搜尋（她說「搜尋那個先幫你裝好」）。存進去了才記「裝過」，刪掉就不會再自己長回來。
        let seeded = true;
        try { seeded = !!localStorage.getItem(SEED_KEY); } catch (e) {}
        if (!seeded && !_list.length) {
            _list.push({ id: 'tl_search', name: '上網搜尋', url: 'https://mcp.exa.ai/mcp', key: '', paused: false, tools: [], err: '', at: 0 });
            if (await _save()) { try { localStorage.setItem(SEED_KEY, '1'); } catch (e) {} }
        } else if (!seeded) {
            try { localStorage.setItem(SEED_KEY, '1'); } catch (e) {}
        }
        let added = false;
        Object.keys(BUILTIN).forEach(function (k) {
            if (_list.some(function (x) { return x.builtin === k; })) return;
            _list.push({ id: BUILTIN[k].id, name: BUILTIN[k].name, builtin: k, city: '', paused: false });
            added = true;
        });
        if (added) await _save();
        return _list;
    }
    async function _save() {
        const db = _db();
        if (!db || !db.saveAppData) return false;
        try { await db.saveAppData(APP_ID, 'list', _list || [], null); return true; }
        catch (e) { console.warn('[工具] 存不進去', e); _toast('存不進去，再試一次'); return false; }
    }
    function _byId(id) { return (_list || []).find(function (s) { return s.id === id; }) || null; }

    // 這一間能用的（勾了、沒暫停、清單裡還在）
    function enabledFor(chat) {
        if (!chat || !Array.isArray(chat.tools) || !chat.tools.length || !_list) return [];
        return _list.filter(function (s) { return !s.paused && chat.tools.indexOf(s.id) !== -1; });
    }

    // ================================================================
    // MCP（網址那種：POST JSON-RPC，回 JSON 或 text/event-stream）
    // ================================================================
    let _rid = 0;
    const _sids = {};   // 工具 id → 連線編號（有的伺服器要，有的不用）
    async function _rpc(srv, method, params, sid, isNotice) {
        const body = { jsonrpc: '2.0', method: method };
        if (!isNotice) body.id = ++_rid;
        if (params) body.params = params;
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
        if (srv.key) headers['Authorization'] = 'Bearer ' + srv.key;
        if (sid) headers['Mcp-Session-Id'] = sid;
        const ac = new AbortController();
        const timer = setTimeout(function () { ac.abort(); }, CALL_TIMEOUT);
        let r;
        try { r = await fetch(srv.url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ac.signal }); }
        catch (e) { throw new Error(ac.signal.aborted ? '太久沒回應' : '連不上（這個網址可能不讓網頁直接呼叫）'); }
        finally { clearTimeout(timer); }
        const sid2 = r.headers.get('mcp-session-id') || sid || '';
        if (isNotice) return { sid: sid2 };
        if (!r.ok) { const e = new Error(r.status === 401 || r.status === 403 ? '需要金鑰，或金鑰不對' : '對方回了錯誤（' + r.status + '）'); e.status = r.status; throw e; }
        const text = await r.text();
        let msgs = [];
        if (/^\s*(?:event|data|id|:)/.test(text)) {
            // text/event-stream：一段一段 data: 行
            text.split(/\r?\n\r?\n/).forEach(function (blk) {
                const data = blk.split(/\r?\n/).filter(function (l) { return /^data:/.test(l); }).map(function (l) { return l.replace(/^data:\s?/, ''); }).join('\n');
                if (!data) return;
                try { msgs.push(JSON.parse(data)); } catch (e) {}
            });
        } else {
            try { const j = JSON.parse(text); msgs = Array.isArray(j) ? j : [j]; } catch (e) {}
        }
        const msg = msgs.find(function (m) { return m && m.id === body.id; }) || msgs.find(function (m) { return m && (m.result || m.error); });
        if (!msg) throw new Error('看不懂對方回的東西');
        if (msg.error) throw new Error(String(msg.error.message || '對方回了錯誤').slice(0, 120));
        return { result: msg.result || {}, sid: sid2 };
    }
    async function _session(srv) {
        if (_sids[srv.id] !== undefined) return _sids[srv.id];
        try {
            const r = await _rpc(srv, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'Aurelia', version: '1.0' } });
            _sids[srv.id] = r.sid || '';
            try { await _rpc(srv, 'notifications/initialized', null, r.sid, true); } catch (e) {}
        } catch (e) {
            if (e && (e.status === 401 || e.status === 403)) throw e;
            _sids[srv.id] = '';   // 有的伺服器不用先打招呼，直接叫也行
        }
        return _sids[srv.id];
    }
    // 連線編號過期時伺服器回 404：清掉重來一次
    async function _withSession(srv, method, params) {
        try { return await _rpc(srv, method, params, await _session(srv)); }
        catch (e) {
            if (e && e.status === 404 && _sids[srv.id]) { delete _sids[srv.id]; return await _rpc(srv, method, params, await _session(srv)); }
            throw e;
        }
    }
    // 問它有哪些功能（測試也是這個）
    async function refresh(srv) {
        delete _sids[srv.id];
        try {
            const r = await _withSession(srv, 'tools/list', {});
            srv.tools = (r.result.tools || []).filter(function (t) { return t && t.name; }).map(function (t) {
                return { name: String(t.name), description: String(t.description || '').slice(0, 600), inputSchema: t.inputSchema || {} };
            });
            srv.err = srv.tools.length ? '' : '接上了，但它沒有提供任何功能';
        } catch (e) {
            srv.err = (e && e.message) || '連不上';
        }
        srv.at = Date.now();
        await _save();
        return !srv.err;
    }
    async function _callTool(srv, name, args) {
        const r = await _withSession(srv, 'tools/call', { name: name, arguments: args || {} });
        const parts = (r.result.content || []).map(function (c) {
            if (!c) return '';
            if (c.type === 'text') return c.text || '';
            if (c.type === 'resource' && c.resource) return c.resource.text || '';
            return '';
        }).filter(Boolean);
        const text = parts.join('\n\n').trim();
        if (r.result.isError) throw new Error(text.slice(0, 160) || '工具回了錯誤');
        return text || '（沒有結果）';
    }

    // ================================================================
    // 給模型看的：有哪些工具、怎麼叫；拿到的結果
    // ================================================================
    // 這一間能用的功能 → 名字對到哪個工具（名字撞了就在後面加編號）
    function _toolMap(chat) {
        const map = {};
        enabledFor(chat).forEach(function (srv) {
            ((srv.builtin && BUILTIN[srv.builtin]) ? BUILTIN[srv.builtin].tools : (srv.tools || [])).forEach(function (t) {
                let key = t.name, n = 2;
                while (map[key]) key = t.name + '_' + (n++);
                map[key] = { srv: srv, tool: t };
            });
        });
        return map;
    }
    function _paramLines(schema) {
        const props = (schema && schema.properties) || {};
        const req = (schema && schema.required) || [];
        return Object.keys(props).slice(0, 12).map(function (k) {
            const p = props[k] || {};
            const bits = [k + '（' + (req.indexOf(k) !== -1 ? '必填，' : '') + (p.type || '文字') + '）'];
            if (p.description) bits.push(String(p.description).replace(/\s+/g, ' ').slice(0, 160));
            if (Array.isArray(p.enum)) bits.push('只能是：' + p.enum.slice(0, 8).join('／'));
            return '    ' + bits.join('：');
        });
    }
    // 工具那幾個還沒問過有哪些功能（剛裝、或上次連不上）→ 送出前先問一次
    async function prepare(chat) {
        await load();
        const need = enabledFor(chat).filter(function (s) { return !s.builtin && !(s.tools && s.tools.length); });
        for (const s of need) { try { await refresh(s); } catch (e) {} }
    }
    function promptBlock(chat, charName) {
        const map = _toolMap(chat);
        const keys = Object.keys(map);
        if (!keys.length) return '';
        const who = charName || '你';
        const lines = [
            '【你可以用的工具】',
            who + '的手機可以用下面這些工具。聊到需要查的東西（你不確定的事實、最新的消息、對方問你的問題），可以先用工具再回。',
            '要用的時候，在回覆裡單獨一行寫：',
            '<tool_call name="工具名">{"參數名": "值"}</tool_call>',
            '大括號裡要是正確的 JSON，參數照下面每個工具列的寫。標籤名照抄英文，不要翻譯、不要改寫。這一行對方看不到。',
            '寫了之後這一輪就先停，工具的結果會在下一輪交給你，你再接著回。想先跟對方說一句（例如說你去查一下）就照平常的格式寫，不想說就只寫那一行。',
            '不需要就不要用；上面已經查過的事，直接用查到的內容，不要再查一次。一次最多用 ' + MAX_CALLS + ' 個。',
            '工具：'
        ];
        keys.forEach(function (k) {
            const t = map[k].tool;
            lines.push('・' + k + (t.description ? '：' + String(t.description).replace(/\s+/g, ' ').slice(0, 300) : ''));
            _paramLines(t.inputSchema).forEach(function (l) { lines.push(l); });
        });
        return lines.join('\n');
    }
    // 拿到的結果：還沒給它看過的整段給一次，看過的只留一行
    function resultsBlock(chat) {
        const log = (chat && Array.isArray(chat.toolLog)) ? chat.toolLog : [];
        if (!log.length) return '';
        const fresh = log.filter(function (x) { return !x.sent; });
        const old = log.filter(function (x) { return x.sent; }).slice(-4);
        const out = [];
        if (fresh.length) {
            out.push('【你剛才用工具拿到的結果】這些是你自己查的，對方看不到，要讓對方知道就用你自己的話講，不要整段照貼。');
            fresh.forEach(function (x, i) {
                out.push('── 結果 ' + (i + 1) + '：' + x.label + '（' + _argsText(x.args) + '）');
                out.push(x.ok ? String(x.text || '').slice(0, RESULT_MAX) : ('沒有成功：' + x.text + '。不要假裝查到了。'));
                x.sent = true;
            });
        }
        if (old.length) {
            out.push('【你之前用工具查過的】');
            old.forEach(function (x) {
                out.push('・' + x.label + '（' + _argsText(x.args) + '）：' + (x.ok ? String(x.text || '').replace(/\s+/g, ' ').slice(0, 200) + '…' : '沒有成功'));
            });
        }
        return out.join('\n');
    }
    function _argsText(args) {
        if (!args || typeof args !== 'object') return '';
        // 只顯示它寫的字（查什麼、哪個網址），幾筆、上限那種數字不顯示
        const vals = Object.keys(args).map(function (k) { const v = args[k]; return typeof v === 'string' ? v : (Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }).join('、') : ''); }).filter(Boolean);
        return String(vals[0] || '').slice(0, 80);   // 第一個就是查什麼（搜尋字、網址），後面多半是補充說明
    }

    // ================================================================
    // 抽標籤、跑工具
    // ================================================================
    const CALL_RE = /[<＜]\s*tool_call\b([^>＞]*)[>＞]([\s\S]*?)[<＜]\s*\/\s*tool_call\s*[>＞]/gi;
    const LONE_RE = /[<＜]\s*\/?\s*tool_call\b[^>＞]*[>＞]/gi;
    function strip(text) { return String(text == null ? '' : text).replace(CALL_RE, '').replace(LONE_RE, ''); }
    function extract(text) {
        const calls = [];
        const out = String(text == null ? '' : text).replace(CALL_RE, function (_, attrs, body) {
            const m = String(attrs || '').match(/name\s*=\s*["'“”]?([^"'“”\s>＞]+)/i);
            if (m) calls.push({ name: m[1], body: String(body || '').trim() });
            return '';
        }).replace(LONE_RE, '');
        return { text: out, calls: calls };
    }
    function _parseArgs(body, schema) {
        const t = String(body || '').replace(/^```(?:json)?\s*|```\s*$/g, '').trim();
        if (!t) return {};
        try { const j = JSON.parse(t); if (j && typeof j === 'object' && !Array.isArray(j)) return j; } catch (e) {}
        // 沒寫成 JSON：只有一個必填的文字參數時，整段當那個參數
        const req = (schema && schema.required) || Object.keys((schema && schema.properties) || {});
        if (req.length) { const o = {}; o[req[0]] = t; return o; }
        return {};
    }
    // 跑完回傳這一輪有沒有東西要交給它（有就該再回一次）
    async function run(chat, calls, onNotice) {
        if (!chat || !Array.isArray(calls) || !calls.length) return false;
        await load();
        const map = _toolMap(chat);
        if (!Object.keys(map).length) return false;
        if (!Array.isArray(chat.toolLog)) chat.toolLog = [];
        let any = false;
        for (const c of calls.slice(0, MAX_CALLS)) {
            const hit = map[c.name] || map[Object.keys(map).find(function (k) { return k.toLowerCase() === String(c.name).toLowerCase(); })];
            const entry = { label: hit ? hit.srv.name : String(c.name), tool: c.name, args: {}, ok: false, text: '', at: Date.now(), sent: false };
            if (!hit) {
                entry.text = '沒有叫做「' + c.name + '」的工具';
            } else {
                entry.args = _parseArgs(c.body, hit.tool.inputSchema);
                try { if (onNotice) onNotice(hit.srv.name, _argsText(entry.args)); } catch (e) {}
                try {
                    entry.text = (hit.srv.builtin && BUILTIN[hit.srv.builtin])
                        ? await BUILTIN[hit.srv.builtin].run(entry.args, hit.srv)
                        : await _callTool(hit.srv, hit.tool.name, entry.args);
                    entry.ok = true;
                }
                catch (e) { entry.text = (e && e.message) || '失敗'; }
            }
            chat.toolLog.push(entry);
            any = true;
        }
        if (chat.toolLog.length > LOG_KEEP) chat.toolLog = chat.toolLog.slice(-LOG_KEEP);
        return any;
    }

    // ================================================================
    // 小窗：這間用哪幾個 ＋ 新增工具
    // ================================================================
    let _root = null, _chat = null, _onDone = null, _adding = false, _busy = '';
    function _injectCss() {
        if (d.getElementById('wx-tools-style')) return;
        const s = d.createElement('style');
        s.id = 'wx-tools-style';
        s.textContent = CSS;
        (d.head || d.body).appendChild(s);
    }
    // 🚨 這個小窗自己的顏色寫死、不吃聊天 app 主題（跟主題頁一樣：套了壞主題也要看得清楚）
    const CSS = `
        .wxtl-mask { position:absolute; inset:0; z-index:560; display:flex; align-items:center; justify-content:center;
            padding:24px 16px; background:rgba(0,0,0,.42); animation:wxtl-fade .15s ease; }
        @keyframes wxtl-fade { from { opacity:0; } to { opacity:1; } }
        .wxtl-box { width:100%; max-width:360px; max-height:100%; display:flex; flex-direction:column; border-radius:16px;
            background:#f4f3f1; color:#26241f; overflow:hidden; box-shadow:0 12px 36px rgba(0,0,0,.28);
            font-family:-apple-system,'PingFang TC','Noto Sans TC','Microsoft JhengHei',sans-serif; }
        .wxtl-head { display:flex; align-items:center; padding:14px 16px 8px; flex-shrink:0; }
        .wxtl-title { flex:1; font-size:16px; font-weight:700; letter-spacing:.04em; }
        .wxtl-done { border:none; background:none; color:#2f8a4c; font-size:15px; font-weight:700; cursor:pointer; padding:4px 2px; }
        .wxtl-scroll { flex:1; min-height:0; overflow-y:auto; padding:4px 14px 14px; }
        .wxtl-list { border-radius:12px; background:#fff; overflow:hidden; box-shadow:0 1px 3px rgba(38,36,31,.07); }
        .wxtl-row { display:flex; align-items:center; gap:10px; min-height:58px; padding:8px 6px 8px 12px; border-top:1px solid rgba(38,36,31,.07); }
        .wxtl-row:first-child { border-top:none; }
        .wxtl-row.is-paused .wxtl-row-t { opacity:.45; }
        .wxtl-pick { flex-shrink:0; width:24px; height:24px; border-radius:7px; border:1.5px solid rgba(38,36,31,.28); background:#fff;
            color:#fff; font-size:13px; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0; }
        .wxtl-pick.is-on { background:#2f8a4c; border-color:#2f8a4c; }
        .wxtl-pick:disabled { opacity:.35; cursor:default; }
        .wxtl-row-t { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; cursor:pointer; }
        .wxtl-row-t b { font-size:15px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .wxtl-row-t span { font-size:11.5px; color:rgba(38,36,31,.5); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .wxtl-row-t span.is-bad { color:#c2410c; }
        .wxtl-ic { flex-shrink:0; width:34px; height:34px; border:none; background:none; border-radius:50%;
            color:rgba(38,36,31,.5); font-size:14px; cursor:pointer; }
        .wxtl-ic:active { background:rgba(38,36,31,.08); }
        .wxtl-ic:disabled { opacity:.4; cursor:default; }
        .wxtl-ic-pad { flex-shrink:0; width:34px; height:34px; }
        .wxtl-empty { padding:22px 16px; text-align:center; font-size:13px; line-height:1.6; color:rgba(38,36,31,.5); }
        .wxtl-add { margin-top:10px; width:100%; height:42px; border-radius:21px; border:1.5px dashed rgba(38,36,31,.25);
            background:transparent; color:#26241f; font-size:14px; font-weight:700; cursor:pointer;
            display:flex; align-items:center; justify-content:center; gap:7px; }
        .wxtl-form { margin-top:10px; padding:12px; border-radius:12px; background:#fff; display:flex; flex-direction:column; gap:8px;
            box-shadow:0 1px 3px rgba(38,36,31,.07); }
        .wxtl-form label { font-size:12px; color:rgba(38,36,31,.55); }
        .wxtl-in { width:100%; box-sizing:border-box; height:38px; padding:0 11px; border-radius:9px;
            border:1px solid rgba(38,36,31,.16) !important; background:#faf9f7 !important; color:#26241f !important;
            font-size:14px; outline:none; }
        .wxtl-in:focus { border-color:#2f8a4c !important; }
        .wxtl-form-bar { display:flex; gap:8px; margin-top:4px; }
        .wxtl-btn { flex:1; height:38px; border-radius:19px; border:1.5px solid rgba(38,36,31,.16); background:#fff; color:#26241f;
            font-size:13.5px; font-weight:700; cursor:pointer; }
        .wxtl-btn.is-main { flex:2; border-color:#2f8a4c; background:#2f8a4c; color:#fff; }
        .wxtl-btn:disabled { opacity:.5; cursor:default; }
    `;

    function _subText(s) {
        if (_busy === s.id) return { t: '連線中…', bad: false };
        if (s.paused) return { t: '已暫停', bad: false };
        if (s.builtin === 'weather') return { t: s.city ? '查：' + s.city : '用你手機的位置', bad: false };
        if (s.err) return { t: s.err, bad: true };
        if (s.tools && s.tools.length) return { t: s.tools.length + ' 個功能', bad: false };
        return { t: '還沒連過，第一次用時會自己連', bad: false };
    }
    function _render() {
        if (!_root) return;
        const on = (_chat && Array.isArray(_chat.tools)) ? _chat.tools : [];
        const rows = (_list || []).map(function (s) {
            const sub = _subText(s);
            const picked = on.indexOf(s.id) !== -1;
            return '<div class="wxtl-row' + (s.paused ? ' is-paused' : '') + '">'
                + '<button class="wxtl-pick' + (picked ? ' is-on' : '') + '" type="button" data-act="pick" data-id="' + esc(s.id) + '" aria-label="這間用這個"' + (s.paused ? ' disabled' : '') + '>'
                + (picked ? '<i class="fa-solid fa-check"></i>' : '') + '</button>'
                + '<div class="wxtl-row-t" data-act="pick" data-id="' + esc(s.id) + '"><b>' + esc(s.name) + '</b><span class="' + (sub.bad ? 'is-bad' : '') + '">' + esc(sub.t) + '</span></div>'
                + (s.builtin
                    ? '<button class="wxtl-ic" type="button" data-act="city" data-id="' + esc(s.id) + '" title="查哪裡"><i class="fa-solid fa-location-dot"></i></button>'
                    : '<button class="wxtl-ic" type="button" data-act="test" data-id="' + esc(s.id) + '" title="重新連一次"' + (_busy ? ' disabled' : '') + '><i class="fa-solid fa-rotate"></i></button>')
                + '<button class="wxtl-ic" type="button" data-act="pause" data-id="' + esc(s.id) + '" title="' + (s.paused ? '繼續使用' : '暫停') + '"><i class="fa-solid ' + (s.paused ? 'fa-play' : 'fa-pause') + '"></i></button>'
                + (s.builtin ? '<span class="wxtl-ic-pad"></span>' : '<button class="wxtl-ic" type="button" data-act="del" data-id="' + esc(s.id) + '" title="刪掉"><i class="fa-solid fa-trash-can"></i></button>')
                + '</div>';
        }).join('');
        const list = rows ? '<div class="wxtl-list">' + rows + '</div>' : '<div class="wxtl-empty">還沒有裝任何工具。</div>';
        const form = _adding
            ? '<div class="wxtl-form">'
                + '<label>名字</label><input class="wxtl-in" data-f="name" maxlength="20" placeholder="例如：上網搜尋">'
                + '<label>網址</label><input class="wxtl-in" data-f="url" inputmode="url" placeholder="https://">'
                + '<label>金鑰（有的才要填）</label><input class="wxtl-in" data-f="key" type="password" autocomplete="off">'
                + '<div class="wxtl-form-bar"><button class="wxtl-btn" type="button" data-act="cancel">取消</button>'
                + '<button class="wxtl-btn is-main" type="button" data-act="save"' + (_busy ? ' disabled' : '') + '>' + (_busy === '_new' ? '連線中…' : '連線並加入') + '</button></div>'
                + '</div>'
            : '<button class="wxtl-add" type="button" data-act="add"><i class="fa-solid fa-plus"></i>新增工具</button>';
        const keep = _adding ? _formVals() : null;
        _root.innerHTML = '<div class="wxtl-box">'
            + '<div class="wxtl-head"><div class="wxtl-title">這間可以用的工具</div><button class="wxtl-done" type="button" data-act="done">完成</button></div>'
            + '<div class="wxtl-scroll">' + list + form + '</div></div>';
        if (keep) _root.querySelectorAll('[data-f]').forEach(function (el) { el.value = keep[el.getAttribute('data-f')] || ''; });
    }
    function _formVals() {
        const o = {};
        if (_root) _root.querySelectorAll('[data-f]').forEach(function (el) { o[el.getAttribute('data-f')] = el.value; });
        return o;
    }
    function _saveChat() {
        const app = win.wxApp || window.wxApp;
        try { if (app && app.saveChats) app.saveChats(); } catch (e) {}
        try { if (_chat && win.OS_DB && win.OS_DB.saveApiChat) win.OS_DB.saveApiChat(_chat.id, _chat); } catch (e) {}
    }
    async function _onClick(e) {
        if (e.target === _root) { close(); return; }   // 點外面那層＝完成
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const act = b.getAttribute('data-act');
        const id = b.getAttribute('data-id');
        const s = id ? _byId(id) : null;
        if (act === 'done') { close(); return; }
        if (act === 'pick' && s && !s.paused && _chat) {
            if (!Array.isArray(_chat.tools)) _chat.tools = [];
            const i = _chat.tools.indexOf(s.id);
            if (i === -1) _chat.tools.push(s.id); else _chat.tools.splice(i, 1);
            _saveChat(); _render();
            return;
        }
        if (act === 'pause' && s) { s.paused = !s.paused; await _save(); _render(); return; }
        if (act === 'city' && s) {
            const A = win.AUI || window.AUI;
            const v = (A && A.prompt) ? await A.prompt('天氣查哪裡（空白＝用你手機的位置）', s.city || '') : win.prompt('天氣查哪裡（空白＝用你手機的位置）', s.city || '');
            if (v == null) return;
            s.city = String(v).trim().slice(0, 40);
            await _save(); _render();
            return;
        }
        if (act === 'del' && s) {
            if (!(await _confirm('刪掉「' + s.name + '」？所有聊天室都會一起拿掉這個工具。'))) return;
            _list = _list.filter(function (x) { return x.id !== s.id; });
            await _save();
            if (_chat && Array.isArray(_chat.tools)) { _chat.tools = _chat.tools.filter(function (x) { return x !== s.id; }); _saveChat(); }
            _render();
            return;
        }
        if (act === 'test' && s && !_busy) {
            _busy = s.id; _render();
            const ok = await refresh(s);
            _busy = ''; _render();
            _toast(ok ? '連上了' : '連不上：' + s.err);
            return;
        }
        if (act === 'add') { _adding = true; _render(); const f = _root.querySelector('[data-f="name"]'); if (f) f.focus({ preventScroll: true }); return; }
        if (act === 'cancel') { _adding = false; _render(); return; }
        if (act === 'save' && !_busy) {
            const v = _formVals();
            const url = String(v.url || '').trim();
            if (!/^https:\/\/\S+$/i.test(url)) { _toast('網址要是 https:// 開頭的那種'); return; }
            const srv = { id: 'tl' + Date.now().toString(36), name: String(v.name || '').trim().slice(0, 20) || '工具', url: url, key: String(v.key || '').trim(), paused: false, tools: [], err: '', at: 0 };
            _busy = '_new'; _render();
            const ok = await refresh(srv);
            _busy = '';
            if (!ok) { _render(); _toast('連不上：' + srv.err); return; }
            _list.push(srv);
            if (_chat) { if (!Array.isArray(_chat.tools)) _chat.tools = []; _chat.tools.push(srv.id); _saveChat(); }
            await _save();
            _adding = false; _render();
            _toast('裝好了，這間已經勾上');
        }
    }
    // host：放小窗的那一層（聊天設置那頁的父層）；onDone(chat) 關掉時叫
    async function open(chat, host, onDone) {
        if (!chat || !host) return false;
        close();
        _injectCss();
        await load();
        if (!_list) { _toast('還在準備，等一下再開'); return false; }
        _chat = chat; _onDone = onDone || null; _adding = false; _busy = '';
        _root = d.createElement('div');
        _root.className = 'wxtl-mask';
        _root.addEventListener('click', _onClick);
        host.appendChild(_root);
        _render();
        return true;
    }
    function close() {
        if (!_root) return;
        try { _root.remove(); } catch (e) {}
        _root = null;
        const c = _chat, cb = _onDone;
        _chat = null; _onDone = null;
        if (cb) { try { cb(c); } catch (e) {} }
    }
    // 聊天設置那格要顯示的字（勾了哪幾個）
    function summary(chat) {
        return enabledFor(chat).map(function (s) { return s.name; }).join('、');
    }

    const API = { load, enabledFor, refresh, prepare, promptBlock, resultsBlock, extract, strip, run, open, close, summary };
    win.WX_TOOLS = API;
    window.WX_TOOLS = API;
})();
