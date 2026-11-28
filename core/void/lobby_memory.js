// ----------------------------------------------------------------
// [檔案] lobby_memory.js — 紫薇的記憶吧檯：占卜＋記憶迴廊（2026-11-26，window.LobbyMemory）
// 原本是記憶吧檯右邊的回憶展示櫃點了開。整段 11-25～26 一格一格定的：
//   11-26 起占卜也搬進來（個人占卜和記憶占卜併一起，舊的個人占卜 UI 刪除）：吧檯「入座」開這裡
//   ① 詢問（影片放一次）：「又見面了。今天想問問自己的事，還是想聽一段別人的往事？」（11-26 Gemini 生的開口版）
//   ② 等待（影片循環）：四周暗下來、浮出「問問自己的事」「聽一段別人的往事」「改天吧」
//      問問自己的事＝個人占卜：寫下問題 → 紫薇挑牌陣 → 從扇形牌堆挑牌 → 翻開 → 紫薇解讀、可以追問、她提議時補抽一張
//        （_toSelf 那段；牌、牌陣、解牌的規矩在 os_tarot.js）；聽一段別人的往事＝記憶迴廊（下面 ③～⑦）
//      改天吧＝整片往下滑出去、暗掉，字幕＋「也好。有些事，不急著知道。」，收起來回吧檯
//   ③ 選人：想看誰的記憶（這個故事裡見過的人，名單照人物檔案 OS_NPC_DOSSIER 的登場帳）
//      11-26 起要有「往事線索」才抽得了（主線露過的過去，_attachPasts）：沒有＝還不熟、變灰；舊故事第一次打開補一次（_backfill）
//   ④ 抽卡（影片）：同時在背景請副模型抽牌面（哪一段），一拿到就請主模型照牌面寫劇本（11-26 拆兩步：一通寫完翻牌要等很久）
//      這個人是奧瑞亞的人就帶奧瑞亞的書和世界觀，人在世界門另一邊也一樣（_worldFor）
//   ⑤ 真牌：影片最後一格換成空桌面＋一張真的牌（星象蝕刻質感，跟滑鼠傾斜，點了翻開）→ 正面是這段回憶的名字
//   ⑥ 走進這段回憶：借 VN 播放器當小劇場播（故事編號 memory_theater，不存章節、不動主線），演完回到吧檯
//      11-26 起分三幕（起、轉、收）：每幕演完使用者替那時候的他選，下一幕照選的寫（_play／_actsUi）
//   ⑦ 展示櫃：抽過的牌一張一筆收著（app_data draws），等待那步「看收過的牌」→ 再走一次／接著走
// 11-26 選定的玩法：角色過去的某個節點（不是一日遊、不是同一件事換眼睛看）。
// 小樣：參考資料/ZHIWEI_CARD_END_LAB.html；素材（影片、聲音、牌背、記憶圖）在 sound-files 的 zhiwei_draw_v1/
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;

    // 素材鎖在 sound-files 那一版（影片走 GitHub raw：jsDelivr 不給 mp4；鎖版本才不會被快取搞混）
    const RAW = 'https://raw.githubusercontent.com/nancywang3641/sound-files/c9b13545efd3c807932f1d5fecf64bc08a1948ca/zhiwei_draw_v1/zhiwei_draw_v1/';
    // 詢問 11-26 換成 Gemini 生的開口版（「又見面了…」）：原檔 1.5 秒起切，畫面、聲音照舊分兩支（一起播畫面會抖）
    //   聲音同晚換成學姐（MiniMax danya_xuejie），三段各自對到嘴巴開始動的秒數（0.71／2.55／5.21）。
    //   🚨 不加 emotion：抽卡那四句是不帶情緒念的（音高約 220～240Hz）；加 happy 會高到 258Hz、亮一截，聽起來不像同一個人。
    //   最後一版＝骰十次挑第 8 個：斷句改成「又见面了……今天，想问问自己的事？还是，想听一段别人的往事？」，7.9 秒講完（影片 8.05 秒才交棒給等待，不會被切）；十個的試看在本機 tmp/zhiwei/pick/
    const RAW2 = 'https://raw.githubusercontent.com/nancywang3641/sound-files/c159eb263aaa7b40b297c1116d27fb812a2daaef/zhiwei_draw_v2/';
    // 翻牌、走進回憶拉近的兩個音效（11-27 生成）：剪掉前後空白、音量對齊 chime，本機 tmp/zhiwei/sfx/
    const RAW3 = 'https://raw.githubusercontent.com/nancywang3641/sound-files/1ae6f80b38b117afa261268c544b802ad00f2701/zhiwei_draw_v2/';
    const A = {
        ask: RAW2 + 'ask.mp4', askVoice: RAW2 + 'ask_voice_xuejie3.m4a', wait: RAW + 'wait.mp4', draw: RAW + 'draw.mp4',
        bgm: RAW + 'bgm.mp3', chime: RAW + 'chime.mp3', leave: RAW + 'leave.mp3',
        flip: RAW3 + 'card_flip.mp3', zoom: RAW3 + 'zoom_in.mp3',
        plate: RAW + 'plate.webp', back: RAW + 'card_back.webp',
        mem: [1, 2, 3, 4, 5, 6].map(i => RAW + 'mem' + i + '.webp'),
    };
    const APP = 'memory_bar';               // OS_DB app_data：global::meta（看過完整版沒）、chat:<故事>::draws（抽過的回憶）
    const THEATER = 'memory_theater';       // vn_core.js 的 THEATER_ID 認得這個：播完換回原本的故事
    const BGM = { full: .32, duck: .2 };
    const DRAW_SKIP_AT = 9;                 // 略過抽卡：跳到倒數幾秒（推牌那段）
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    let R = null;   // 開著時的那一份（DOM、計時器、狀態）

    // 🚨 影片、聲音先整支抓成 blob、自己標上類型再播：GitHub raw 給的類型是 application/octet-stream，
    //    有的瀏覽器（iPhone 尤其）直接當 <video src> 不播（lobby_places.js 會動的立繪那段踩過）。
    //    抓過的留著，下次再開不用重抓（三支影片加起來約 12MB）
    const _blobs = new Map();
    function _blob(url, type) {
        if (_blobs.has(url)) return _blobs.get(url);
        const job = fetch(url, { mode: 'cors' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
            .then(buf => URL.createObjectURL(new Blob([buf], { type })))
            .catch(e => { _blobs.delete(url); throw e; });
        _blobs.set(url, job);
        return job;
    }
    const _vid = (url) => _blob(url, 'video/mp4');
    const _aud = (url) => _blob(url, url.endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg');

    // ── 見過誰：跨故事（11-26：直接拿大廳的，大廳本來就是全域拿角色）──
    //   ① 大廳的客人池 LobbyNpcs.memoryRoster：每個故事最新那一輪大總結角色表裡的人（主角、管理員已擋掉，放行照大廳設置「不會刷成客人的名字」）
    //   ② 這段聊天的人物檔案（劇情裡出現過的 [Char|名字]）：還沒寫大總結的人也在；名字照大廳那份擋名單濾
    //   同一個故事裡同一個人只留一筆：名字折過一樣（简繁、間隔號）、或一個是另一個前面那截（黎昂／黎昂·维斯顿）就併成長的那個；
    //   不同故事不併——撞名的各列在自己的故事底下，牌上也記著是哪個故事的他
    const _normChat = (w) => !w ? '' : String(w).split(/[\\/]/).pop().replace(/\.jsonl?$/i, '').trim().replace(/\s+/g, '_');
    function _nameKey(n) {
        const L = win.LobbyNpcs || window.LobbyNpcs;
        if (L && L.nameKey) return L.nameKey(n);
        const Z = win.OS_ZH || window.OS_ZH;
        const t = String(n || '').trim();
        return Z && Z.key ? Z.key(t) : t.replace(/[\s·・•．.\-_]/g, '').toLowerCase();
    }
    function _fold(list) {
        const out = [];
        list.forEach(p => {
            const k = _nameKey(p.name);
            const hit = out.find(o => { const ok = o._k; return ok === k || (k.length >= 2 && ok.length >= 2 && (ok.startsWith(k) || k.startsWith(ok))); });
            if (!hit) { out.push(Object.assign({ _k: k }, p)); return; }
            const longer = k.length > hit._k.length;
            Object.keys(p).forEach(f => { if (p[f] && !hit[f]) hit[f] = p[f]; });
            if (longer) { hit.name = p.name; hit._k = k; }
            hit.n = Math.max(hit.n || 0, p.n || 0); hit.last = Math.max(hit.last || 0, p.last || 0);
        });
        return out;
    }
    async function _people() {
        const here = _normChat(_storyId());
        let roster = { people: [], blocked: [] };
        try { const L = win.LobbyNpcs || window.LobbyNpcs; if (L && L.memoryRoster) roster = (await L.memoryRoster()) || roster; } catch (e) { console.warn('[LobbyMemory] 讀大廳名冊失敗', e); }
        const blocked = new Set(roster.blocked || []);
        const ok = (n) => n && !blocked.has(_nameKey(n));
        const hook = (profile) => { const f = String(profile || '').split('；')[0] || ''; return f.replace(/^[^：]*：/, '').slice(0, 26); };
        const mine = [];
        try {
            const D = win.OS_NPC_DOSSIER || window.OS_NPC_DOSSIER;
            const d = D && D.dump ? await D.dump() : null;
            const chars = (d && d.ledger && d.ledger.chars) || {};
            const dos = (d && d.dossiers) || {};
            Object.keys(chars).forEach(name => {
                if (!ok(name)) return;
                const c = chars[name] || {};
                const key = dos[name] ? name : Object.keys(dos).find(k => k.split('＠')[0] === name);
                const f = key ? dos[key] : null;
                mine.push({ name, n: c.n || 0, last: c.lastAt || 0, hook: (f && f.hook) || '', file: (f && f.file) || '', here: true });
            });
        } catch (e) { console.warn('[LobbyMemory] 讀人物檔案失敗', e); }
        const groups = new Map();   // 故事 → 人
        (roster.people || []).forEach(p => {
            if (!ok(p.name)) return;
            const isHere = !!here && _normChat(p.chatId) === here;
            const g = isHere ? '\u0000here' : (p.story || '別的故事');
            if (!groups.has(g)) groups.set(g, { story: p.story || '', here: isHere, list: [] });
            groups.get(g).list.push(Object.assign({}, p, { here: isHere, hook: hook(p.profile) }));
        });
        const cur = groups.get('\u0000here') || { story: '', here: true, list: [] };
        groups.delete('\u0000here');
        cur.list = _fold(mine.sort((a, b) => (b.last - a.last) || (b.n - a.n)).concat(cur.list)).slice(0, 16);
        cur.list.forEach(p => { if (!p.story) p.story = cur.story; });
        const out = cur.list.length ? [cur] : [];
        groups.forEach(g => { g.list = _fold(g.list).slice(0, 12); if (g.list.length) out.push(g); });
        return out;
    }
    // 名單攤平（畫按鈕、找人用）
    const _flat = (groups) => groups.reduce((a, g) => a.concat(g.list), []);

    // ── 往事線索（11-26：沒有線索＝跟這個角色接觸不深、形同陌生人，不該窺探他的過去）──
    //   主線每輪那通副模型順手記（npc_dossier.js 的 npcPasts，存在那個故事的 state_data）
    //   ＋舊故事第一次打開時補一次（_backfill：從大總結、人物檔案挑，好幾個故事併一通，存 app_data pasts）
    //   抽牌從還沒用過的線索挑一條當題目；用過＝展示櫃裡有一張照這條抽的牌（丟掉那張就又能抽）
    //   一條都沒有＝還不熟 → 名單上變灰、抽不了
    const _same = (a, b) => { const x = _nameKey(a), y = _nameKey(b); return !!x && !!y && (x === y || (x.length >= 2 && y.length >= 2 && (x.startsWith(y) || y.startsWith(x)))); };
    const _pk = (t) => _nameKey(String(t || '').replace(/[，。、！？…「」『』\s,.!?]/g, ''));
    const _gChat = (g) => g.here ? _storyId() : ((g.list.find(p => p.chatId) || {}).chatId || '');
    async function _statePasts(g) {
        const D = win.OS_NPC_DOSSIER || window.OS_NPC_DOSSIER;
        if (!D || !D.pastsOf) return {};
        if (g.here) return (await D.pastsOf()) || {};
        const cid = _gChat(g);
        if (!cid) return {};
        for (const c of [...new Set([cid, String(cid).split(/[\\/]/).pop().replace(/\.jsonl?$/i, '').trim()])]) {
            const v = await D.pastsOf(c); if (v && Object.keys(v).length) return v;
        }
        return {};
    }
    // 補線索的版本：2＝認得世界門的旅人（11-26 晚）；之前補的那批可能把旅人在世界裡的身分當成過去 → 重補一次
    const FILL_V = 2;
    async function _loadFill() { try { const v = win.OS_DB ? await win.OS_DB.getAppData(APP, 'pasts') : null; return (v && typeof v === 'object') ? v : {}; } catch (e) { return {}; } }
    // 每個人掛上 pasts（全部線索）、fresh（還沒抽過的）
    async function _attachPasts(groups) {
        const fill = await _loadFill();
        const life = await _loadLife();
        const draws = (await _loadDraws()).map(_norm);
        for (const g of groups) {
            g._key = _normChat(_gChat(g));
            let st = {}; try { st = await _statePasts(g); } catch (e) {}
            const bf = (fill[g._key] && fill[g._key].list) || {};
            g._filled = !!(fill[g._key] && fill[g._key].v >= FILL_V);
            g.list.forEach(p => {
                const all = [];
                const add = (t) => { t = String(t || '').trim(); if (t && !all.some(x => _pk(x) === _pk(t))) all.push(t); };
                Object.keys(st).forEach(n => { if (_same(n, p.name)) (st[n] || []).forEach(x => add(x && x.t)); });
                Object.keys(bf).forEach(n => { if (_same(n, p.name)) (bf[n] || []).forEach(add); });
                const used = new Set(draws.filter(d => d.hint && _same(d.name, p.name) && (!d.story || !p.story || d.story === p.story)).map(d => _pk(d.hint)));
                p.pasts = all;
                // 有過去年表的人：題目從年表挑（一行一個），往事線索照樣當資料給模型看；沒年表的照舊從線索挑
                const L = _lifeOf(life, g._key, p.name);
                p.life = (L && L.rows && L.rows.length) ? L.rows : null;
                p.fresh = p.life ? p.life.map(r => r.what).filter(t => !used.has(_pk(t))) : all.filter(t => !used.has(_pk(t)));
            });
        }
    }
    // 舊故事要補的：還沒補過、手上有大總結／角色表／人物檔案的（一通最多 6 個故事，其餘下次打開再補）
    function _fillNeed(groups) {
        return groups.filter(g => g._key && !g._filled).map(g => {
            const sum = (g.list.find(p => p.summary) || {}).summary || '';
            return { g, sum, ppl: g.list.filter(p => sum || p.file || p.profile) };
        }).filter(x => x.ppl.length).slice(0, 6);
    }
    async function _backfill(need) {
        let trav = [];
        try { const G = win.OS_WORLDGATE || window.OS_WORLDGATE; trav = (G && G.travelers) ? (await G.travelers()) || [] : []; } catch (e) {}
        const isTrav = (n) => trav.some(t => _same(t.name, n));
        const body = need.map((x, i) => [
            '【S' + (i + 1) + '】' + (x.g.story ? '《' + x.g.story + '》' : '這個故事'),
            x.sum ? '大總結：\n' + String(x.sum).slice(0, 5000) : '',
            '人物：\n' + x.ppl.map(p => '・' + p.name + (isTrav(p.name) ? '（世界門的旅人）' : '') + (p.profile ? '｜角色表：' + String(p.profile).slice(0, 300) : '') + (p.file ? '｜人物檔案：' + String(p.file).slice(0, 400) : '')).join('\n'),
        ].filter(Boolean).join('\n')).join('\n\n');
        const sys = [
            '你在替一個互動故事整理「往事線索」。下面有幾個故事的資料，每個故事列了幾個人。',
            '替每個人挑出資料裡寫到、或明顯透露的「故事開始以前」的事：身上的舊傷或疤、提到過去的誰（家人、故人、死去的人）、從哪裡來、以前做過什麼、某個習慣或忌諱的由來、不肯提的事。',
            '規則：',
            '- 只寫資料裡有的，不要編；資料裡看不出他的過去，那個人就不列。',
            '- 要是他以前的事；故事裡正在發生的事、他跟主角之間這段日子的事不算。',
            '- 一條一句、三十字以內，寫事實不寫猜測。每人最多四條。',
            '- 標「世界門的旅人」的人本來是奧瑞亞的普通人，資料裡他在那個世界的身分、種族、樣子是進門後被改造的，不算他的過去；只記他在奧瑞亞時候的事（例如以前做什麼工作、家裡的事、為什麼報名）。',
            '只輸出 JSON，不要任何說明：',
            '{ "S1": [ { "name": "人名", "hint": "一句話" } ], "S2": [] }',
        ].join('\n');
        const raw = await _ask([{ role: 'system', content: sys }, { role: 'user', content: body }], 'memory_pasts', true);
        const m = String(raw || '').match(/\{[\s\S]*\}/);
        let obj = null; try { obj = m ? JSON.parse(m[0]) : null; } catch (e) {}
        if (!obj || typeof obj !== 'object') throw new Error('沒整理出來');
        const job = _saveQ.then(async () => {
            const fill = await _loadFill();
            need.forEach((x, i) => {
                const list = {};
                (Array.isArray(obj['S' + (i + 1)]) ? obj['S' + (i + 1)] : []).forEach(h => {
                    const p = x.ppl.find(pp => _same(pp.name, h && h.name));
                    const t = String((h && h.hint) || '').replace(/\s+/g, ' ').trim().slice(0, 40);
                    if (!p || t.length < 3) return;
                    const arr = list[p.name] || (list[p.name] = []);
                    if (arr.length < 4 && !arr.some(y => _pk(y) === _pk(t))) arr.push(t);
                });
                fill[x.g._key] = { at: Date.now(), list, v: FILL_V };
            });
            await win.OS_DB.saveAppData(APP, 'pasts', fill);
        });
        _saveQ = job.catch(() => {});
        await job;
    }

    // ── 過去年表（11-28）：劇情裡雙擊立繪、角色卡按「想靠近」時，替他排一份故事開始以前的經歷（5～7 個轉折點）──
    //   記憶迴廊抽他時從年表挑一行還沒演過的當題目，抽牌、寫幕都帶整份年表，幾段回憶才是同一段人生；沒年表的人照舊用往事線索。
    //   叫模型：他狀態裡有好感度＝接在「生三條好感規則」那通後面（lifeAsk → os_avs_rules.js 的 extra／onRaw），沒有＝單獨一通（lifeMake，task memory_life）。
    //   存 app_data memory_bar::life＝{ 故事: { 名字鑰匙: { name, rows: [{ age, who, what, mark, src }], at } } }；src＝設定／劇情／補的
    const LIFE_SRC = ['設定', '劇情', '補的'];
    async function _loadLife() { try { const v = win.OS_DB ? await win.OS_DB.getAppData(APP, 'life') : null; return (v && typeof v === 'object') ? v : {}; } catch (e) { return {}; } }
    function _lifeOf(all, key, name) {
        const box = (all && key && all[key]) || {};
        const k = Object.keys(box).find(x => box[x] && _same(box[x].name, name));
        return k ? box[k] : null;
    }
    // 給模型看的年表（抽牌、寫幕）
    function _lifeText(rows) {
        return (rows || []).map((r, i) => (i + 1) + '. ' + r.age + '・' + r.who + '：' + r.what + (r.mark ? '（留到現在的：' + r.mark + '）' : '')).join('\n');
    }
    // 要模型排年表的字。merged＝接在別的那通後面（前面那件事有自己的輸出規定，這裡說明這兩塊另外寫）
    function _lifePrompt(name, merged) {
        return [
            merged ? '【另外一件事：替「' + name + '」排過去年表】\n前面的事全部寫完以後，再照下面寫 <life_plan> 和 <past> 兩塊（前面說「以外不要任何文字」的規定不管這兩塊）。他的資料在最後面。\n' : '',
            '你要替「' + name + '」排一份他在故事開始以前的經歷年表。之後別的功能會從這份年表挑一件事，把那段往事演出來；所以年表要前後一致、跟設定和劇情對得上，演出來的回憶才不會互相打架。',
            '',
            '【你手上有的】' + (merged ? '最後面' : '下面') + '那份「他的資料」：他是哪裡的人、人物檔案、角色表、世界書裡的他、他那個世界的設定、故事到目前為止的大總結、他現在的狀態、主線裡露出過的過去。有的人資料比較少，照有的寫。',
            '',
            '【先想再寫】先在 <life_plan></life_plan> 裡想清楚：',
            '1. 哪些是確定的：設定寫明的、劇情露出的。逐條列出，後面不能改。',
            '2. 他現在身上有哪些看得到的痕跡（傷、習慣、忌諱、對某種人的態度、手藝、口頭禪），各自是哪一段過去留下的？設定和劇情沒交代來處的，要在年表裡給它一個來處。',
            '3. 從他現在的年紀往回推：各個年紀他大概在哪裡、是什麼身分？跟世界觀的時代、地點對得上嗎？',
            '4. 哪幾件事一路影響到他現在的樣子？只挑轉折，平淡的日子不列。',
            '<life_plan> 裡不要出現 | 符號。',
            '',
            '【年表規則】',
            '・5～7 行，照年紀從小排到大；最後一行停在故事開始之前，劇情裡已經發生的事不寫。',
            '・每一行是一個轉折點：這件事之前和之後，他不太一樣。',
            '・確定的事照原樣放進去，不改、不加油添醋；只有沒交代的空白由你補。補的要能解釋第 2 題那些痕跡，不能跟確定的事打架。',
            '・主角不出現在年表裡，除非設定或劇情寫明他們以前就認識。',
            '・寫看得到的事實：在哪、跟誰、發生什麼、結果怎樣。不寫「他內心深處……」這類評語。',
            '',
            '【輸出格式】先 <life_plan>…</life_plan>，接著 <past> 裡每行一件事，嚴格 5 欄、以 | 分隔' + (merged ? '' : '，<past> 外面不要任何字') + '：',
            '<past>',
            '幾歲 | 那時候的身分與處境 | 發生的事 | 留到現在的痕跡 | 依據',
            '</past>',
            '・幾歲：寫數字，或「約十歲」這種寫法。',
            '・依據只能填：設定／劇情／補的。',
            '・每格單行、不可換行、不可出現 | 符號；「發生的事」60 字內，其他格 25 字內。',
        ].filter(s => s !== '').join('\n');
    }
    function _parseLife(raw) {
        const m = String(raw || '').match(/<past>([\s\S]*?)(?:<\/past>|$)/i);
        if (!m) return null;
        const rows = [];
        m[1].split('\n').forEach(line => {
            const ps = line.replace(/<[^>]+>/g, '').replace(/^\s*(?:[-*・•]|\d+[.、)）])\s*/, '').split(/[|｜]/).map(s => s.trim());
            if (ps.length < 5) return;
            const [age, who, what, mark, src] = ps;
            if (!what || what === '發生的事' || age === '幾歲') return;   // 模型回述表頭
            rows.push({ age: age.slice(0, 12), who: who.slice(0, 40), what: what.slice(0, 120), mark: mark.slice(0, 40), src: LIFE_SRC.find(s => src.indexOf(s) >= 0) || '補的' });
        });
        return rows.length >= 3 ? rows.slice(0, 8) : null;
    }
    // 他的資料：這個故事名單裡的他（人物檔案、角色表、大總結、往事線索）＋世界書＋狀態面板裡他那一格
    async function _lifeData(name) {
        let person = null;
        try {
            const g = (await _people()).find(x => x.here);
            if (g) { await _attachPasts([g]); person = g.list.find(p => _same(p.name, name)) || null; }
        } catch (e) { console.warn('[LobbyMemory] 排年表：名單沒讀到', e); }
        person = Object.assign({ name, here: true, story: '' }, person || {}, { life: null });   // 重排：舊年表不給它看
        const w = await _worldFor(person);
        let st = '';
        try {
            const S = win.OS_AVS_ADAPTER || window.OS_AVS_ADAPTER;
            const s = (S && S.readState && S.readState()) || {};
            Object.keys(s).some(k => {
                const box = s[k];
                if (!box || typeof box !== 'object' || Array.isArray(box)) return false;
                const kk = Object.keys(box).find(x => _same(x, name));
                if (!kk || !box[kk] || typeof box[kk] !== 'object') return false;
                st = JSON.stringify(box[kk]).slice(0, 800);
                return true;
            });
        } catch (e) {}
        return [_userBlock(person, w, []), st ? '他現在的狀態：' + st : ''].filter(Boolean).join('\n');
    }
    function _saveLife(name, rows) {
        const key = _normChat(_storyId());
        if (!key || !win.OS_DB) return Promise.resolve(false);
        const job = _saveQ.then(async () => {
            const all = await _loadLife();
            const box = all[key] || (all[key] = {});
            Object.keys(box).forEach(k => { if (box[k] && _same(box[k].name, name)) delete box[k]; });
            box[_nameKey(name)] = { name, rows, at: Date.now() };
            await win.OS_DB.saveAppData(APP, 'life', all);
            return true;
        });
        _saveQ = job.catch(() => {});
        return job;
    }
    // 這個故事裡他有沒有年表
    async function lifeHas(name) {
        const l = _lifeOf(await _loadLife(), _normChat(_storyId()), name);
        return !!(l && l.rows && l.rows.length);
    }
    // 接在別的那通後面：{ extra（接在那通提示詞最後）, take(那通的回覆) → 存了幾行，0＝沒排出來 }
    async function lifeAsk(name) {
        const data = await _lifeData(name);
        return {
            extra: _lifePrompt(name, true) + '\n\n【' + name + '的資料】\n' + data,
            take: async (raw) => { const rows = _parseLife(raw); return rows && await _saveLife(name, rows) ? rows.length : 0; },
        };
    }
    // 單獨叫一通排年表 → 存了幾行，0＝沒排出來
    async function lifeMake(name) {
        const data = await _lifeData(name);
        const raw = await _ask([{ role: 'system', content: _lifePrompt(name, false) }, { role: 'user', content: data + '\n\n替' + name + '排過去年表。' }], 'memory_life', false);
        const rows = _parseLife(raw);
        return rows && await _saveLife(name, rows) ? rows.length : 0;
    }

    function _storyId() {
        try { const S = win.OS_AVS_ADAPTER || window.OS_AVS_ADAPTER; return (S && S.getStoryId && S.getStoryId()) || ''; } catch (e) { return ''; }
    }
    // 牌收在同一個展示櫃（11-26 起跨故事：牌上記著是哪個故事的他）；sid 參數留著不用（舊呼叫照寫）
    async function _loadDraws() {
        try { const v = win.OS_DB ? await win.OS_DB.getAppData(APP, 'draws') : null; return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    // 11-26 之前每個故事各收各的（app_data chat:<故事>::draws）：打開時把這個故事那份搬進共用的櫃子
    async function _migrateDraws(sid) {
        if (!sid || !win.OS_DB) return;
        await (_saveQ = _saveQ.then(async () => {
            const old = await win.OS_DB.getAppData(APP, 'draws', sid);
            if (!Array.isArray(old) || !old.length) return;
            const list = (await _loadDraws()).map(_norm);
            old.map(_norm).forEach(d => { if (!list.some(x => x.id === d.id)) list.push(d); });
            list.sort((a, b) => (a.at || 0) - (b.at || 0));
            await win.OS_DB.saveAppData(APP, 'draws', list.slice(-120));
            await win.OS_DB.saveAppData(APP, 'draws', [], sid);
        }).catch(e => console.warn('[LobbyMemory] 舊的牌沒搬過來', e)));
    }
    // 抽過的牌＝收進展示櫃的牌：一張一筆，三幕寫到哪存到哪（同一張照 id 蓋回原位）
    //   11-26 一幕版存的是 content 一整段：當成演完的一幕版（_norm）
    function _norm(rec) {
        if (rec && !Array.isArray(rec.acts)) { rec.acts = rec.content ? [{ content: rec.content, choices: [], pick: '' }] : []; rec.done = !!rec.content; }
        if (rec && !rec.id) rec.id = 'm' + (rec.at || 0).toString(36);
        return rec;
    }
    let _saveQ = Promise.resolve();
    function _saveDraw(sid, rec) {
        if (!win.OS_DB) return Promise.resolve();
        const keep = {}; Object.keys(rec).forEach(k => { if (k[0] !== '_') keep[k] = rec[k]; });
        delete keep.content;
        _saveQ = _saveQ.then(async () => {
            const list = (await _loadDraws(sid)).map(_norm);
            const at = list.findIndex(d => d.id === keep.id);
            if (at >= 0) list[at] = keep; else list.push(keep);
            await win.OS_DB.saveAppData(APP, 'draws', list.slice(-120));
        }).catch(e => console.warn('[LobbyMemory] 回憶沒存到', e));
        return _saveQ;
    }
    async function _seen() { try { const m = win.OS_DB ? await win.OS_DB.getAppData(APP, 'meta') : null; return !!(m && m.seen); } catch (e) { return false; } }
    function _markSeen() { try { win.OS_DB && win.OS_DB.saveAppData(APP, 'meta', { seen: 1 }); } catch (e) {} }

    // ── 這個人是哪個世界的人、世界書裡的他 ──
    //   🚨 世界門開著時（人在視差裡的異世界）酒館把【奧瑞亞世界】和【奧瑞亞-人物核心】收起來了，
    //      只看這段聊天掛著的書會找不到奧瑞亞的熟人、模型也不知道他住在哪個世界（11-26 抽黎昂抽出一段莫名其妙的）。
    //      → 先到奧瑞亞自己的書裡找（不管現在掛沒掛）；找到＝奧瑞亞的人，帶奧瑞亞的世界觀。
    //        找不到才看這段聊天掛著的書；人在異世界的話，那個世界的設定一起帶。
    const BOOK_MAIN = '【奧瑞亞世界】', BOOK_CORE = '【奧瑞亞-人物核心】';
    function _isPwa() { try { const A = win.OS_API || window.OS_API; return !!(A && A.isStandalone && A.isStandalone()); } catch (e) { return false; } }
    async function _worldFor(person) {
        const T = win.OS_AURELIA_TOOLS || window.OS_AURELIA_TOOLS, ST = win.OS_STORY_TOOLS || window.OS_STORY_TOOLS;
        const pick = (list) => { try { return (ST && ST.personEntry) ? (ST.personEntry(list || [], person.name, T, 5000) || '') : ''; } catch (e) { return ''; } };
        let inPara = false;
        try { const G = win.AURELIA_WORLDGATE || window.AURELIA_WORLDGATE; inPara = !!(G && G.isInParallax && G.isInParallax()); } catch (e) {}
        const out = { lore: '', world: '', where: '', inPara, home: false, trav: null };
        // ⓪ 世界門召集的旅人（11-26 修：旅人的背景被誤當成世界門那邊的角色背景，他們都來自奧瑞亞）：
        //   他們是奧瑞亞來的普通人，劇情裡那副樣子、那個身分是進門後被世界改造的 → 過去一律在奧瑞亞，帶他的旅人身分卡
        try { const G = win.OS_WORLDGATE || window.OS_WORLDGATE; const list = (G && G.travelers) ? await G.travelers() : []; out.trav = list.find(t => _same(t.name, person.name)) || null; } catch (e) {}
        // ① 奧瑞亞自己的書（世界觀那段：書裡有他、或他是旅人才帶）
        let aw = '';
        try {
            if (_isPwa()) {
                const B = win.OS_BUILTIN_LORE || window.OS_BUILTIN_LORE;
                let wid = ''; try { wid = localStorage.getItem('vn_current_world_id') || ''; } catch (e) {}
                if (B && B.AURELIA && B.isAureliaBook && (out.trav || (B.isAureliaBook && B.isAureliaBook(wid)))) {
                    out.lore = pick(B.AURELIA.map(e => ({ title: e.title, keys: (e.keys || []).join(','), content: e.text })));
                    const w = B.AURELIA.find(e => !(e.keys && e.keys.length)); aw = w ? w.text : '';
                }
            } else {
                const TH = win.TavernHelper || window.TavernHelper;
                if (TH && TH.getLorebookEntries) {
                    const books = {};
                    for (const b of [BOOK_CORE, BOOK_MAIN]) { try { books[b] = (await TH.getLorebookEntries(b)) || []; } catch (e) { books[b] = []; } }
                    const list = [];
                    [BOOK_CORE, BOOK_MAIN].forEach(b => books[b].forEach(e => { if (e && e.enabled !== false && e.content) list.push({ title: e.comment || '', keys: (e.keys || []).join(','), content: e.content }); }));
                    out.lore = pick(list);
                    aw = books[BOOK_MAIN].filter(e => e && e.enabled !== false && e.type === 'constant' && e.content)
                        .map(e => String(e.content).trim()).filter(Boolean).join('\n\n').slice(0, 2400);
                }
            }
        } catch (e) { console.warn('[LobbyMemory] 讀奧瑞亞的書失敗', e); }
        if (out.lore || out.trav) { out.home = true; out.where = '奧瑞亞（Aurealis Core）'; out.world = aw; return out; }
        // ①.5 別的故事的人：照大廳記著的書名去讀那個故事的世界書（沒掛上也讀得到）；讀不到就用大廳存的世界觀
        if (person.story && !person.here) {
            out.where = '《' + person.story + '》那個故事';
            try {
                const TH = win.TavernHelper || window.TavernHelper;
                if (person.book && TH && TH.getLorebookEntries) {
                    const ents = ((await TH.getLorebookEntries(person.book)) || []).filter(e => e && e.enabled !== false && e.content);
                    out.lore = pick(ents.map(e => ({ title: e.comment || '', keys: (e.keys || []).join(','), content: e.content })));
                    out.world = ents.filter(e => e.type === 'constant').map(e => String(e.content).trim()).filter(Boolean).join('\n\n').slice(0, 2400);
                }
            } catch (e) { console.warn('[LobbyMemory] 讀那個故事的書失敗', person.book, e); }
            if (!out.world) out.world = String(person.worldview || '').slice(0, 2400);
            return out;
        }
        // ② 這段聊天現在掛著的書
        try { if (T && T.entries) out.lore = pick(((await T.entries(false)) || {}).list); } catch (e) {}
        if (inPara) {
            try {
                const WG = win.OS_WORLDGATE || window.OS_WORLDGATE;
                const W = WG && WG.getCurrentWorld ? await WG.getCurrentWorld() : null;
                if (W) {
                    out.where = W.name || '';
                    out.world = [W.genre && '類型：' + W.genre, W.concept, W.entryText].filter(Boolean).join('\n').slice(0, 2400);
                }
            } catch (e) {}
        }
        return out;
    }

    // ── 叫模型（生成期間擋狀態、記憶、人物檔案的抽取：它們都查 __AURELIA_SUMMARIZING） ──
    // withPreset：寫劇本的那幾通帶上使用者的預設（11-26：沒有酒館預設，AI 寫出的劇本摸不著頭腦）
    //   酒館＝走 OS_API 現成那條「注入預設檔自訂條目」（usePresetPrompts：正在用的那份，或使用者在設置指定的那份；佔位條目不帶），不管全域開關開沒開；
    //   網頁版＝提示詞頁裡正文那幾包使用者開著的條目（不帶面板格式那格，格式由這裡自己給）。抽牌那通不帶：只要短短一張牌。
    async function _ask(msgs, task, secondary, withPreset) {
        const API = win.OS_API || window.OS_API;
        if (!API || typeof API.chat !== 'function') throw new Error('沒有接模型');
        let cfg = (win.OS_SETTINGS && win.OS_SETTINGS.getConfig) ? win.OS_SETTINGS.getConfig() : {};
        if (withPreset) {
            if (_isPwa()) {
                try {
                    const P = win.OS_PROMPTS || window.OS_PROMPTS;
                    const pre = P && P.getSystemPrompt ? String(P.getSystemPrompt('vn_story', { entriesOnly: true }) || '').trim() : '';
                    if (pre) msgs = [{ role: 'system', content: pre }].concat(msgs);
                } catch (e) { console.warn('[LobbyMemory] 網頁版預設沒帶上', e); }
            } else cfg = Object.assign({}, cfg, { usePresetPrompts: true });
        }
        const prev = win.__AURELIA_SUMMARIZING;
        win.__AURELIA_SUMMARIZING = true;
        try {
            const raw = await new Promise((resolve, reject) => {
                if (secondary && typeof API.chatSecondary === 'function') API.chatSecondary(msgs, null, resolve, reject, { task });
                else API.chat(msgs, cfg, null, resolve, reject, { task });
            });
            return String(raw || '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        } finally { setTimeout(() => { win.__AURELIA_SUMMARIZING = prev; }, 4000); }
    }
    function _userBlock(person, w, before) {
        return [
            '【' + person.name + '】',
            w.where ? '他是' + w.where + '的人。' : '',
            w.trav ? _travCard(w.trav) : '',
            person.file ? '人物檔案' + (w.trav ? '（劇情裡、進門後的他）' : '') + '：' + person.file : '',
            person.profile ? '角色表：' + person.profile : '',
            person.summary ? '他那個故事到目前為止的大總結（用來看現在的他是什麼樣子）：\n' + String(person.summary).slice(0, 6000) : '',
            w.lore ? '世界書裡的他：\n' + w.lore : '',
            w.world ? '他那個世界的設定：\n' + w.world : '',
            person.pasts && person.pasts.length ? '主線裡他露出過的過去（寫的時候都要對得上）：\n' + person.pasts.map(t => '・' + t).join('\n') : '',
            person.life && person.life.length ? '他已經定好的過去（年表，照年紀排；寫的時候都要對得上，不能演出跟它矛盾的事）：\n' + _lifeText(person.life) : '',
            !person.file && !w.lore && !person.profile && !person.summary ? '（沒有其他資料，照名字和這個故事的氣氛去想）' : '',
            before.length ? '已經看過的回憶（這次換一段不一樣的）：\n' + before.join('\n') : '',
        ].filter(Boolean).join('\n');
    }
    // ── 主角不在這段回憶裡（11-26：這是別人的記憶，排除用戶人設，免得 AI 又寫進主角）──
    //   使用者的人設本來就沒送（酒館預設的「使用者角色」那格不帶、網頁版也不帶），但模型還是認得出主角：
    //   大總結通篇在寫他、預設和 VN 指令裡的 {{user}} 會被換成他的名字。光寫「主角不在」模型不知道是誰 → 點名
    //   名字：那一輪記下的主角（大總結的 [Protagonist|]、那一輪用的人設名），這個故事的人再加上現在用的人設名
    function _mcNames(person) {
        const out = [];
        const add = (n) => { const t = String(n || '').trim(); if (t && t.length <= 24 && !out.some(x => _nameKey(x) === _nameKey(t)) && _nameKey(t) !== _nameKey(person.name)) out.push(t); };
        (person.mc || []).forEach(add);
        if (person.here || !person.story) {
            try { const P = win.OS_PERSONA || window.OS_PERSONA; const c = P && P.getCurrent ? P.getCurrent() : null; if (c && c.name) add(c.name); } catch (e) {}
            try { const A = win.OS_API || window.OS_API; if (A && A.getGlobalUserName) add(A.getGlobalUserName()); } catch (e) {}
        }
        return out.filter(n => !/^(user|使用者|玩家|主角|你)$/i.test(n)).slice(0, 4);
    }
    function _mcLine(person) {
        const ns = _mcNames(person);
        return '- 故事的主角（玩家' + (ns.length ? '，也就是' + ns.map(n => '「' + n + '」').join('／') : '') + '）不在這段回憶裡：他不出場、沒有他的台詞和動作，也不從他的角度寫。'
            + '資料裡寫到他的地方只是讓你知道現在的' + person.name + '是什麼樣子；預設裡要你描寫、回應主角的那些，這次都用不上。';
    }
    // VN 指令裡寫著 {{user}} 的那幾條（禁止事項、節奏與收尾）都在講「跟主角互動」，外傳用不上、只會把主角帶進來：整條不帶
    function _protocolForMemory(text) {
        return String(text || '').split('\n\n──────\n\n').filter(c => !/\{\{\s*user\s*\}\}/i.test(c)).join('\n\n──────\n\n');
    }
    function _whereLine(w) {
        if (!w.where) return '';
        if (w.trav) return '- 他是跟主角一起穿過世界門的旅人：本來是奧瑞亞的普通人' + (w.trav.world ? '，「' + w.trav.world + '」那個世界' : '，那個世界') +
            '裡的樣子、身分、種族都是進門後被世界改造的。這段回憶發生在他進門之前、在奧瑞亞，照奧瑞亞的設定和他的旅人身分卡寫；' +
            '人物檔案、大總結、往事線索裡寫的是進門後的他，只拿來看他是什麼樣的人，裡面那個世界的人事物、地名、身分不要寫進這段回憶。';
        return '- 這段回憶發生在' + w.where + '，照那個世界的設定寫。' +
            (w.inPara && w.home ? '玩家現在人在視差裡的另一個世界，那跟這段回憶無關，不要把那個世界的人事物寫進來。' : '');
    }
    // 旅人身分卡：在純白大廳報名時的他（奧瑞亞的他）
    function _travCard(t) {
        return '他的旅人身分卡（報名時、在奧瑞亞的他）：' + [
            t.age ? t.age + '歲' : '', t.job ? '本行：' + t.job : '', t.origin ? '來歷：' + t.origin : '', t.persona ? '性格：' + t.persona : '',
            t.look ? '外貌：' + t.look : '', t.record ? '視差資歷：' + t.record : '',
        ].filter(Boolean).join('；');
    }

    // ① 抽牌：副模型定好「哪一段」（名字、那時候的他、發生什麼），抽卡影片演完前就有牌面
    //   11-26：第一次抽先用副模型抽主題，後面再寫劇本，不然翻牌那邊卡很久
    async function _drawCard(person, sid) {
        const w = await _worldFor(person);
        // 看過的每段多帶一句牌上的「起」：只給名字和年紀，標題換個說法模型就認不出是同一件事。丟掉的牌已經從櫃子刪了，不算看過
        const _cut = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
        const before = (await _loadDraws()).filter(d => d.name === person.name && (!d.story || !person.story || d.story === person.story))
            .map(d => '・' + d.title + (d.when ? '（' + d.when + '）' : '') + (d.open ? '：' + _cut(d.open, 70) : ''));
        // 題目：從還沒抽過的往事線索挑一條（主線露過的那一點，這張牌把它背後的事寫出來）
        const fresh = person.fresh || [];
        const hint = fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : '';
        // 有年表的人：題目是年表裡的一行（年紀、身分都定了），挑法那幾條用不上
        const row = (hint && person.life) ? person.life.find(r => _pk(r.what) === _pk(hint)) || null : null;
        const pr = _cardPicRule(person, w);
        const sys = [
            '你要替一個互動故事抽一張「記憶牌」：從角色「' + person.name + '」過去的人生裡挑一段，之後會照這張牌寫成一段從他眼睛看出去的短劇。',
            row ? '這張牌的題目已經定了：' + person.name + '過去年表裡的這一行——' + row.age + '，' + row.who + '：「' + row.what + '」' + (row.mark ? '（留到現在的：' + row.mark + '）' : '') + '。把這件事寫成一段有頭有尾的往事；整份年表在資料裡，不能跟其他行矛盾。<when> 照這一行的年紀和身分寫。'
                : hint ? '這張牌的題目已經定了：主線裡' + person.name + '露出過這一點過去——「' + hint + '」。挑的就是這件事背後的那段往事，把它的來龍去脈寫出來，不能跟這句、也不能跟資料裡其他露過的過去矛盾。' : '',
            '',
            // 11-26：要抽核心過去（抽到一年前的小事看不懂）→ 挑轉捩點、離現在要有距離
            row ? '寫法：' : '挑法：',
            row ? '' : '- 先從資料讀出現在的他：幾歲、什麼身分；他身上有哪些東西是過去留下來的——性格、習慣、身上的傷、心結、跟誰的關係、守著的秘密、為什麼離開家或走上現在這條路、為什麼看重某些事。',
            row ? '' : '- 挑「造成其中一樣的那一件事」：他人生的轉捩點，看完會明白「原來他是因為這樣才變成現在這樣」。不要挑日常小事、不要挑只是「很像他會做的事」的片段。',
            row ? '' : '- 時間點要離現在有明顯距離：通常是好幾年前，少年、童年或剛踏進這條路的時候。只有資料寫明他最近一年發生了改變人生的大事，才挑最近的。',
            row ? '- 年表那一行只寫了骨架：當時在場的人、地點、細節可以補，不能跟年表、資料矛盾。' : '- 從手上的資料去推他從哪裡來、經歷過什麼；資料沒寫到的可以補，不能跟資料矛盾。',
            _whereLine(w),
            _mcLine(person),
            '- 這件事要有頭有尾：怎麼開始、中間在哪裡轉了、最後怎麼收（他做了什麼決定，或失去了、留下了什麼）。',
            // 同一件事在主線被記成兩條說法不同的往事線索時，第二條會被當成新題目抽到：看過的是同一件事就換一段
            (before.length && !row) ? '- 資料最後列了「已經看過的回憶」，每段有名字、那時候的他、事情怎麼開始。這次的題目如果跟其中一段是同一件事（換了說法、換了角度也算），不要再講那一段：改挑這件事之前或之後的另一個轉捩點；<when> 寫的那時候也不要跟看過的那一段落在同一段年紀。' : '',
            '',
            '只輸出這一塊：',
            '<memory_card>',
            '<title>這段回憶的名字，十二個字以內</title>',
            '<when>那時候的他：幾歲、什麼身分，十個字以內</when>',
            '<open>起：時間、地點、在場的人，事情怎麼開始。一到兩句。</open>',
            '<turn>轉：中間發生了什麼讓事情變了。一到兩句。</turn>',
            '<close>收：最後一幕，這件事怎麼落下來。一到兩句。</close>',
            '<after>後來：這件事接到現在的他身上的是什麼，一句話，二十個字以內，寫成旁人淡淡交代的口吻（例：那道疤，他一直沒去掉。）</after>',
            pr ? '<scene>牌面畫：給生圖模型的提示詞（寫法見下面）</scene>' : '',
            '</memory_card>',
            pr ? '\n' + pr : '',
        ].filter(s => s !== '').join('\n');
        const raw = await _ask([{ role: 'system', content: sys }, { role: 'user', content: _userBlock(person, w, before) + '\n\n替' + person.name + '抽一張記憶牌。' }], 'memory_card', true);
        const card = (raw.match(/<memory_card>([\s\S]*?)(<\/memory_card>|$)/i) || [])[1] || raw;
        const tag = (t, n) => { const m = card.match(new RegExp('<' + t + '>([\\s\\S]*?)(</' + t + '>|$)', 'i')); return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, n) : ''; };
        const open = tag('open', 300), turn = tag('turn', 300), close = tag('close', 300), seed = tag('seed', 600);
        if (!open && !close && !seed) throw new Error('沒抽出牌面');
        const sm = pr ? card.match(/<scene>([\s\S]*?)(<\/scene>|$)/i) : null;   // 生圖提示詞：標籤裡的逗號、括號照原樣留
        const scene = sm ? sm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 1500) : '';
        return { id: 'm' + Date.now().toString(36), name: person.name, story: person.story || '', chatId: person.chatId || '', hint, title: tag('title', 24) || person.name + '的回憶', when: tag('when', 24), open, turn, close: close || seed, after: tag('after', 40),
            scene, acts: [], done: false, at: Date.now(), _w: w, life: row ? person.life : null };   // life：照年表抽的牌把整份年表跟著存，之後重看／接著演寫幕時還帶得到
    }

    // ── 牌面畫（11-26）──
    //   抽牌那通副模型順便寫一段畫面提示詞（不多叫文字模型），牌出來後在背景畫一張（圖片設置的用途「記憶牌面」，沒改過＝跟插圖同一組接口）；
    //   畫好前照舊是那六張現成的圖，畫好換上去、存進圖庫（OS_DB images，lmem_<牌>），展示櫃、演完收牌那段都用它。
    //   沒接生圖接口＝不寫、不畫（不跳提示）。寫法照使用者的插圖規範（設置 → 圖片 → 插圖那格），只照它「怎麼寫畫面」，JSON 那些格式不管
    const PIC_USE = 'memory_card';
    function _cardPicRule(person, w) {
        const IM = win.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER;
        let svc = '';
        try { svc = (IM && IM.serviceForUse && IM.serviceForUse(PIC_USE)) || ''; } catch (e) {}
        if (!svc) return '';
        let rules = '';
        try {
            const S = win.OS_STATE_RUNTIME || window.OS_STATE_RUNTIME;
            if (IM.serviceForUse('scene') === svc && S && S.scenePrompt) rules = String(S.scenePrompt() || '').trim().slice(0, 3000);
        } catch (e) {}
        return [
            '牌面畫（<scene> 那一格）：畫這段回憶裡最關鍵的那一刻，直式構圖，畫面裡不要有字。',
            svc === 'novelai' ? '- 用英文 Danbooru 標籤，逗號分隔。' : '- 用英文寫成一段畫面描述。',
            '- 畫的是那時候的' + person.name + '：照資料寫出那個年紀的樣子、髮色、眼色、體型、穿著，寫完整；不要用 ## 代號、不要寫名字。主角不在畫面裡。',
            (w && w.trav) ? '- 他是世界門的旅人，那時候還在奧瑞亞、是普通人類：照旅人身分卡的外貌畫' + (w.trav.sprite ? '（他的外觀詞：' + w.trav.sprite + '，年紀照那時候改）' : '') + '，不要畫成進門後那個世界裡的樣子、種族、服裝。' : '',
            '- 寫清楚他在做什麼、表情、場景、光線、鏡頭。',
            rules ? '- 其他照她的插圖規範寫畫面（規範裡要 JSON、after_paragraph、summary 這些格式的部分不用管，只要那一段提示詞）：\n' + rules : '',
        ].filter(Boolean).join('\n');
    }
    async function _picOf(rec) {
        if (!rec) return '';
        if (rec._picUrl) return rec._picUrl;
        if (!rec.pic || !win.OS_DB || !win.OS_DB.getImage) return '';
        try { rec._picUrl = (await win.OS_DB.getImage(rec.pic)) || ''; } catch (e) { rec._picUrl = ''; }
        return rec._picUrl;
    }
    // 牌的正面：先放現成那張，有畫好的再換上（R.result 換了別張就不動）
    function _setFront(rec) {
        const front = R.q('.lmem-face.front');
        if (rec.img == null) rec.img = Math.floor(Math.random() * A.mem.length);
        front.style.backgroundImage = "url('" + (rec._picUrl || A.mem[rec.img]) + "')";
        if (!rec._picUrl && rec.pic) _picOf(rec).then(u => { if (u && R && R.result === rec) front.style.backgroundImage = "url('" + u + "')"; });
    }
    async function _paintCard(rec, sid) {
        const IM = win.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER;
        if (!rec || !rec.scene || !IM || !IM.generate) return;
        let url = '';
        try { url = (await IM.generate(rec.scene, 'scene', { width: 832, height: 1216, use: PIC_USE })) || ''; } catch (e) { console.warn('[LobbyMemory] 牌面沒畫出來', e); }
        if (!url) return;
        // 存進圖庫：之後換成 blob 網址（data 網址太大放進 CSS 會整片黑）
        try {
            const blob = await (await fetch(url)).blob();
            if (blob && blob.size && win.OS_DB && win.OS_DB.saveImage) {
                await win.OS_DB.saveImage('lmem_' + rec.id, blob);
                rec.pic = 'lmem_' + rec.id;
                rec._picUrl = URL.createObjectURL(blob);
                _saveDraw(sid, rec);
            }
        } catch (e) { console.warn('[LobbyMemory] 牌面沒存進圖庫（這次照樣顯示）', e); }
        if (!rec._picUrl && !/^data:/.test(url)) rec._picUrl = url;
        if (!rec._picUrl || !R || R.result !== rec) return;
        const front = R.q('.lmem-face.front');
        if (front) front.style.backgroundImage = "url('" + rec._picUrl + "')";
    }

    // 外傳只演回憶：主線才有的狀態欄、血量、任務、選項、結局這些標籤剝掉（11-26 黎昂那段結尾混了一塊劇情狀況：HP、日曆約定）
    const _MAINLINE = /^\s*\[(?:HP|Buff|Quest|Achievement|Item|Event|EventText|Branch|Ending|Dive|Choice|Date|Protagonist|Story|World)\|[^\n]*$/gim;
    function _stripMainline(content) {
        return String(content || '')
            .replace(/<(os_status|status|statusblock|summary|branches|details)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
            .replace(_MAINLINE, '')
            .replace(/\n{3,}/g, '\n\n');
    }

    // ② 寫劇本：一段回憶分三幕（起、轉、收），一幕一通主模型
    //   11-26：只有一章太短，延長成小短劇（像委託卡那樣）→ 每幕演完停在他要做決定的那一刻，
    //   使用者替那時候的他選（或自己打一句），下一幕照選的寫；「收」是已經發生過的事，終點不變，變的是怎麼走到那裡。
    //   第一幕在牌一出來就背景寫（翻牌、按「走進這段回憶」時多半寫好了），後兩幕選了才寫。
    const ACTS = [
        { name: '起', goal: '演牌上的「起」：把那時候的他、在場的人、事情怎麼開始交代出來，一路演到事情開始不對勁、他得做一個決定的那一刻，停在那裡。' },
        { name: '轉', goal: '演牌上的「轉」：接著上一幕他選的那條路演下去，事情在這裡變了、變得更重；演到他得做下一個決定的那一刻，停在那裡。' },
        { name: '收', goal: '演牌上的「收」：接著上一幕他選的那條路，一路演到收那一幕，演完這段回憶就結束了。' },
    ];
    const ACT_MAX = ACTS.length;
    // 幕和幕之間的選項擺成三張塔羅牌（11-26，用塔羅牌寓意的卡）：
    //   模型替每條路挑一張寓意對得上的大阿爾克那（同一通裡一起給，不多叫一次）；牌面用畫的（金框＋羅馬數字＋符號＋牌名），
    //   不借占卜小屋那套外站圖：sacred-texts 11-26 已經擋外連（403），選項不能靠別人的網站
    const ARCANA = ['愚者', '魔術師', '女祭司', '皇后', '皇帝', '教皇', '戀人', '戰車', '力量', '隱士', '命運之輪', '正義', '倒吊人', '死神', '節制', '惡魔', '高塔', '星星', '月亮', '太陽', '審判', '世界'];
    const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
    const GLYPH = ['✧', '∞', '☾', '♀', '♔', '✠', '♡', '⟁', '♌', '✶', '☸', '⚖', '⊥', '✝', '⧗', '♄', '⚡', '★', '☽', '☀', '♆', '⊕'];   // 後面一律加 U+FE0E：iPhone 別畫成彩色 emoji
    function _cardOf(line) {   // 「戀人｜回去找那個人」→ { n: 6, text: '回去找那個人' }；沒寫牌名＝n -1
        const L = String(line);
        const m = L.match(/^[【\[「（(]\s*([^】\]」）)]{1,10}?)\s*[】\]」）)]\s*[｜|:：]?\s*(.+)$/) || L.match(/^([^｜|:：]{1,10}?)\s*[｜|:：]\s*(.+)$/);
        if (m) {
            const name = m[1].replace(/^[0-9IVXivx]+[.、\s]*/, '').replace(/牌$/, '').trim();
            const n = name ? ARCANA.findIndex(a => a === name || name.includes(a)) : -1;
            if (n >= 0) return { n, text: m[2].trim() };
        }
        return { n: -1, text: String(line).trim() };
    }
    function _actsSoFar(rec, upto) {   // 前面演過的幾幕（太長就留後面那段：最靠近這一幕的最要緊）
        const parts = [];
        for (let k = 0; k < upto; k++) {
            const a = rec.acts[k]; if (!a) break;
            const body = String(a.content || '').replace(/<\/?content>/gi, '').trim();
            parts.push('── 第' + (k + 1) + '幕・' + ACTS[k].name + ' ──\n' + body + (a.pick ? '\n（演到這裡，他選了：' + a.pick + '）' : ''));
        }
        const s = parts.join('\n\n');
        return s.length > 9000 ? '……（前面省略）\n' + s.slice(-9000) : s;
    }

    // ── 小時候的立繪、那時候的叫法 ──
    //   立繪只有現在的樣子：回憶演到他小時候，舞台不能放大人的臉。寫每一幕那通先寫一塊設定 <memory_setup> 再寫劇本
    //   （先推論再寫，同一通，不多叫）：when＝人生哪個節點、focus＝主軸、cast＝每個出場的人一行，
    //   劇本標籤用的名字｜幾歲｜那時候怎麼被叫｜身分｜樣子跟現在差多少｜差很大的才寫英文外表標籤。
    //   只有「差很大」的人才換角色中心「小時候」那格（OS_CHAR_GALLERY 的 young）、沒有那張就問／不放；
    //   只看歲數不準（十幾歲跟現在差不多的照舊用現在那張）。這塊從劇本拿掉、不演出來；解析不到＝照舊播、沒有人換立繪。
    //   行首標籤認不到也照長相認：cast 行＝用｜隔開三欄以上的那幾行。
    const YOUNG_USE = 'sprite_young';   // 生圖用途名冊那一列（os_image_manager.js 的 USES）
    function _cnAge(s) {
        const D = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
        const m = s.match(/([一二兩三四五六七八九])?十([一二三四五六七八九幾])?/);
        if (m) return (m[1] ? D[m[1]] : 1) * 10 + (m[2] === '幾' ? 5 : (m[2] ? D[m[2]] : 0));
        const one = s.match(/[一二兩三四五六七八九]/);
        return one ? D[one[0]] : null;
    }
    // 一段寫年紀的字 → { age, young }；看不出來回 null。strict＝這段字不是專門寫年紀的（記憶牌「那時候的他」），數字後面要有「歲」才算
    function _ageOf(s, strict) {
        s = String(s || '');
        let age = null;
        const d = strict ? s.match(/(\d{1,2})\s*(?:歲|岁)/) : (s.match(/(\d{1,2})\s*(?:歲|岁)/) || s.match(/(?:^|[^\d])(\d{1,2})(?![\d年月日])/));
        if (d) age = +d[1];
        if (age == null) {
            const c = s.match(/([一二兩三四五六七八九十幾]{1,3})\s*(?:歲|岁)/) || (strict ? null : s.match(/^\s*([一二兩三四五六七八九十幾]{1,3})\s*$/));
            if (c) age = _cnAge(c[1]);
        }
        if (age != null && age > 0 && age < 120) return { age, young: age < 18 };
        if (/小時候|童年|幼年|兒時|幼時|小孩|孩子|孩童|小學|國小|國中|初中|高中|少年|少女|十幾/.test(s)) return { age: null, young: true };
        if (/成年|大人|青年|中年|老年|大學|二十|三十|四十/.test(s)) return { age: null, young: false };
        return null;
    }
    const _SETUP_CUT = /<memory_setup>[\s\S]*?(?:<\/memory_setup>|(?=<content>)|(?=<\/content>)|$)/gi;
    function _stripSetup(s) { return String(s || '').replace(_SETUP_CUT, ''); }
    // 樣子跟現在差多少那欄：只有「很大」這一類才算（一點、幾乎沒變、不大都不算）；模型常寫簡體，繁簡都認
    function _bigChange(s) { s = String(s || ''); return /很大|差很多|完全(?:不同|不一樣|不一样|認不出|认不出)/.test(s) && !/不大|沒有很大|没有很大|不算大/.test(s); }
    // 同一種標籤出現好幾組時挑哪組：思考裡常提到標籤字樣（「接著寫 <content>...</content>」），第一組常是那種字樣。
    //   只看收好尾的整組，內容只有點點、空的不算，挑內容最長的那組；沒有就回 null（呼叫的人再看沒收尾的）
    const _TRIVIAL = /^[\s.…。·・\-_]*$/;
    function _best(text, tag) {
        const re = new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>', 'gi');
        let best = null, m;
        while ((m = re.exec(String(text || '')))) {
            const inner = m[1].trim();
            if (_TRIVIAL.test(inner)) continue;
            if (best == null || inner.length > best.length) best = inner;
        }
        return best;
    }
    // 沒收尾的那組：從最後一個開頭標籤起算（理由同上）；stop＝從哪裡以後不算
    function _lastOpen(text, tag, stop) {
        const t = String(text || ''), i = t.toLowerCase().lastIndexOf('<' + tag + '>');
        if (i < 0) return null;
        let body = t.slice(i + tag.length + 2);
        if (stop) body = body.replace(stop, '');
        body = body.trim();
        return _TRIVIAL.test(body) ? null : body;
    }
    // 模型回的整段 → { when, focus, cast: { 名字鑰匙: { name, age, call, role, change, big, look } }, text }；沒有那塊回 null
    function _setupOf(raw) {
        const body = _best(raw, 'memory_setup') || _lastOpen(raw, 'memory_setup', /<content>[\s\S]*$/i);
        if (!body) return null;
        const m = [null, body];
        const out = { when: '', focus: '', cast: {}, text: body.slice(0, 1500) };
        const row = (L) => {
            const c = L.split(/\s*[｜|]\s*/).map(x => x.replace(/^[\u4e00-\u9fff]{1,6}[:：]\s*/, '').trim());   // 欄位前面自己加了中文欄名的拿掉
            if (c.length < 3) return;
            const name = c[0].replace(/^[【\[「（(]+|[】\]」）)]+$/g, '').trim();
            if (!name || name.length > 20) return;
            const a = _ageOf(c[1] || '', false);
            const ci = c.findIndex((x, n) => n >= 2 && x.length <= 12 && /很大|差很多|一點|一点|幾乎沒變|几乎没变|沒變|没变|差不多|不大|完全/.test(x));
            const change = ci >= 0 ? c[ci] : '';
            const tags = ci >= 0 ? c.slice(ci + 1).filter(Boolean).join(', ') : '';
            out.cast[_nameKey(name)] = { name, age: a ? a.age : null, call: c[2] || '', role: c[3] && c[3] !== change ? c[3] : '', change, big: _bigChange(change), look: /[a-z]/i.test(tags) ? tags.slice(0, 400) : '' };
        };
        m[1].split('\n').forEach(line => {
            const L = line.replace(/<[^>]+>/g, '').replace(/^\s*(?:[-*・•]|\d+[.、)）])\s+/, '').trim();
            if (!L) return;
            const lab = L.match(/^(when|focus|cast)\s*[:：]\s*(.*)$/i);
            if (!lab) { row(L); return; }
            const k = lab[1].toLowerCase();
            if (k === 'cast') { if (lab[2].trim()) row(lab[2]); } else out[k] = lab[2].trim();
        });
        return (Object.keys(out.cast).length || out.when || out.focus) ? out : null;
    }
    // 演到第 k 幕時誰要換小時候那張：前面幾幕的設定合起來（同一個人照最近那幕），只挑樣子差很大的
    function _youngList(rec, k) {
        const all = {};
        for (let j = 0; j <= k; j++) { const a = rec.acts && rec.acts[j]; if (a && a.setup && a.setup.cast) Object.assign(all, a.setup.cast); }
        return Object.keys(all).map(x => all[x]).filter(y => y && y.big);
    }
    // 同一個人：名字折過一樣，或一個是另一個前面那截（只寫名、沒寫姓），跟 _fold 同一套
    function _sameKey(a, b) { return a === b || (a.length >= 2 && b.length >= 2 && (a.startsWith(b) || b.startsWith(a))); }
    // 正在演的那一幕：{ 名字鑰匙: 小時候那張網址（''＝不放立繪）}；沒在演記憶迴廊＝null
    let _youngNow = null;
    // 舞台問（vn_core_stage.js 的 _youngSprite）：undefined＝不是小時候、照舊；''＝小時候但沒有那張，不放；網址＝放這張
    function youngSprite(name) {
        if (!_youngNow) return undefined;
        const k = _nameKey(name);
        const hit = Object.keys(_youngNow).find(x => _sameKey(x, k));
        return hit === undefined ? undefined : _youngNow[hit];
    }
    // 開演前：小時候的人有沒有那張；沒有、畫得出來（有長相描述、接了生圖）、這張牌還沒說過不畫的 → 問一次（一個按鈕，畫幾張講清楚）
    async function _youngAsk(rec, k, sid) {
        const plan = { map: {}, paint: [] };
        const list = _youngList(rec, k);
        if (!list.length) return plan;
        const G = win.OS_CHAR_GALLERY || window.OS_CHAR_GALLERY;
        const M = win.OS_IMAGE_MANAGER || window.OS_IMAGE_MANAGER;
        const no = Array.isArray(rec.noYoung) ? rec.noYoung : [];
        let svc = '';
        try { svc = M && M.serviceForUse ? M.serviceForUse(M.youngUse ? M.youngUse() : YOUNG_USE) : ''; } catch (e) {}
        const ask = [];
        for (const y of list) {
            const key = _nameKey(y.name);
            let url = '';
            try { url = (G && G.youngUrl) ? await G.youngUrl(y.name) : ''; } catch (e) {}
            plan.map[key] = url || '';
            if (url || !svc || no.indexOf(key) >= 0 || !(G && G.youngMake)) continue;
            let look = '';
            try { look = G.lookPrompt ? await G.lookPrompt(y.name) : ''; } catch (e) {}
            if (look) ask.push(y);   // 沒有長相描述：畫不出他小時候，這段不放立繪
        }
        if (!ask.length) return plan;
        const A = win.AUI || window.AUI;
        const names = ask.map(y => '「' + y.name + '」').join('、');
        const ok = !!(A && A.confirm && await A.confirm(
            '這段回憶裡，' + names + '還是小時候的樣子。\n\n要照' + (ask.length > 1 ? '他們' : '他') + '的長相，畫' + (ask.length > 1 ? '各一張' : '一張') + '小時候的立繪嗎？'
            + '（' + ask.length + ' 張，會花 ' + ask.length + ' 次生圖的錢。畫好存在角色中心「小時候」那格，之後的回憶都用這張。）\n\n不畫的話，這段回憶裡小時候的' + (ask.length > 1 ? '他們' : '他') + '不放立繪。'));
        if (ok) plan.paint = ask;
        else { rec.noYoung = no.concat(ask.map(y => _nameKey(y.name))); _saveDraw(sid, rec); }
        return plan;
    }
    // 照 _youngAsk 的決定畫：一個人一張；畫不出來（接口出錯、去背失敗也照存原圖）就這段不放，這張牌不再問
    async function _youngPaint(plan, rec, sid, onLabel) {
        const G = win.OS_CHAR_GALLERY || window.OS_CHAR_GALLERY;
        const failed = [];
        for (const y of plan.paint) {
            const key = _nameKey(y.name);
            if (onLabel) onLabel('正在畫' + y.name + '小時候的樣子…');
            let url = '';
            try { url = await G.youngMake(y.name, y.age, { role: y.role, look: y.look }); } catch (e) { console.warn('[LobbyMemory] 小時候的立繪沒畫出來', e); }
            plan.map[key] = url || '';
            if (!url) failed.push(key);
        }
        plan.paint = [];
        if (failed.length) {
            rec.noYoung = (Array.isArray(rec.noYoung) ? rec.noYoung : []).concat(failed);
            _saveDraw(sid, rec);
            try { (win.AUI || window.AUI).toast('小時候的立繪沒畫出來，這段回憶裡先不放他的立繪'); } catch (e) {}
        }
        return plan;
    }
    async function _writeAct(person, rec, i) {
        const w = rec._w || await _worldFor(person);
        const last = i >= ACT_MAX - 1;
        let protocol = '';
        try { const VT = window.VoidTerminal || win.VoidTerminal; protocol = VT && VT.getVnProtocol ? _protocolForMemory(await VT.getVnProtocol()) : ''; } catch (e) {}
        const sys = [
            '你要替一個互動故事寫一篇「記憶外傳」：讓玩家走進角色「' + person.name + '」過去的某一段，從他自己的眼睛看出去。要寫哪一段已經抽好了，照下面那張記憶牌寫。',
            '這段回憶分三幕演：起、轉、收。每幕演完，玩家替那時候的他選接下來怎麼做，下一幕照玩家選的寫。這次只寫第' + (i + 1) + '幕（' + ACTS[i].name + '）。',
            '',
            '寫法：',
            '- ' + ACTS[i].goal,
            '- 照記憶牌上的時間、地點、人和事寫；牌上沒寫的細節可以補，不能跟牌、資料和前面演過的矛盾。',
            _whereLine(w),
            '- 全程是他的視角，他只知道當時知道的事：可以誤會、可以記錯，也可以有說不出口的話；他不知道之後會發生什麼。',
            _mcLine(person),
            '- 旁白和其他人怎麼叫在場的每個人，照這段回憶發生的那時候：那時候還沒有的姓、還沒當上的頭銜、還沒有的稱號都不用，照設定裡「那時候別人怎麼叫他」那一欄寫；不確定那時候怎麼叫，就用不帶姓的叫法。劇本標籤 [Char|名字|…] 裡的名字照舊寫現在的名字（程式靠它認人），換的只有台詞和旁白裡的叫法。',
            i > 0 ? '- 開頭直接接上一幕他選的那條路，不要重講前面演過的。' : '',
            '- 這一幕一到兩個場景，長度大約三十到四十五行。',
            last
                ? '- 牌上的「收」是已經發生過的事：玩家前面選的路讓過程不一樣，但終點照牌上走。🚨 一定要演到「收」那一幕，演完那一幕這段回憶才算結束：不能停在半路、不能停在「接下來會怎樣」的懸念上。收的地方不講道理、不替他下結論，用一個動作或一句話落下來。'
                : '- 🚨 停在他要做決定的那一刻，不要替他做決定、不要把下一幕演掉。',
            '- 這是一段私人的回憶，只用得到台詞、旁白、內心話、換背景、音樂和音效這幾種標籤；VN 指令裡其他的玩法這裡都用不上（不要寫選項標籤）。',
            // 預設要模型先在回覆裡寫思考（<thinking> 這類標籤，不是接口的推理欄位）：照寫，OS_API 的 cleanRawOutput 跟主線同一支剝下來記進這一通（rec.think），劇情的 COT 才看得到。
            //   以前這行叫它「其他區塊都不寫」、輸出順序又只列設定和劇本，模型就連思考一起省掉
            '- 前面若有一份寫作預設：文風、筆法、描寫、對白怎麼寫照那份。那份若要你動筆前先在思考標籤裡想過一遍，照樣先想：用那份規定的思考標籤包好，放在回覆最前面（程式會把它收起來，不會演出來）。除了思考，這次要輸出什麼照這裡——那份要求的摘要、狀態欄、選項、小劇場、其他區塊這次都不寫。',
            '',
            '先想清楚再寫：預設要你寫的思考放最前面，接著先輸出設定，再輸出劇本。' + (last ? '思考之後輸出兩塊，照這個順序：' : '思考之後輸出三塊，照這個順序：'),
            '<memory_setup>',
            '（這一塊給程式看、不會演出來。行首的 when:、focus:、cast: 照原樣寫英文，程式靠它們認行）',
            'when: 這段回憶發生在他人生的哪個時間點、那時候他走到人生的哪一步',
            'focus: 這段回憶的主軸要講什麼',
            'cast:',
            '（這一幕出場的每個人一行，六欄用｜隔開：劇本標籤裡用的名字｜那時候幾歲，寫阿拉伯數字｜那時候別人怎麼叫他｜那時候的身分、在過什麼樣的日子｜樣子跟現在差多少，只寫「很大」「一點」「幾乎沒變」其中一個｜樣子差很大的才寫這欄：那時候的外表，用英文畫圖標籤寫年紀、身形和穿著；穿著一定要寫，照那時候的身分和過的日子寫他會穿什麼，不沿用他現在的衣服、裝備和配件；其他人這欄空著）',
            '</memory_setup>',
            '<content>',
            '（VN 劇本，格式照下面的 VN 指令）',
            '</content>',
            last ? '' : '<choices>\n兩到三行，一行一個他接下來可能怎麼做，寫成「牌名｜做法」：\n- 做法從他的角度寫、一句話、十八個字以內；各自會走出不一樣的過程，但都還走得到牌上的「收」。\n- 牌名從這二十二張大阿爾克那挑一張寓意對得上這條路的（例：豁出去＝愚者、躲起來＝隱士、選了某個人＝戀人、硬撐＝力量、一切崩掉＝高塔），同一幕的牌不重複，照寫牌名、不加說明：' + ARCANA.join('、') + '\n</choices>',
            protocol ? '\n' + protocol : '\n台詞寫成 [Char|名字|表情|「台詞」]，旁白寫成 [Nar|旁白]，換場景寫 [Bg|季節|時段_地點|英文場景描述|]。',
        ].filter(s => s !== '').join('\n');
        const before = _actsSoFar(rec, i);
        const user = [
            _userBlock((person && person.life) || !rec.life ? person : Object.assign({}, person, { life: rec.life }), w, []),   // 從展示櫃接著演時名單上的他可能沒掛年表：用牌上存的那份
            '',
            '記憶牌：',
            '名字：' + rec.title,
            rec.when ? '那時候的他：' + rec.when : '',
            rec.open ? '起：' + rec.open : '',
            rec.turn ? '轉：' + rec.turn : '',
            '收' + (last ? '（一定要演到）' : '') + '：' + (rec.close || rec.seed || ''),
            before ? '\n前面演過的：\n' + before : '',
            (i > 0 && rec.acts[i - 1] && rec.acts[i - 1].setup && rec.acts[i - 1].setup.text) ? '\n上一幕的設定（照著寫；這一幕有新出場的人再補上）：\n' + rec.acts[i - 1].setup.text : '',
            '',
            '寫第' + (i + 1) + '幕（' + ACTS[i].name + '）。',
        ].filter(s => s !== '').join('\n');
        const out = await _ask([{ role: 'system', content: sys }, { role: 'user', content: user }], 'memory', false, true);
        const raw = _stripSetup(out);   // 設定那塊先拿掉，下面照舊找劇本和選項
        // 劇本、選項：同一種標籤好幾組時挑內容最長的那組（_best），不拿第一組
        const _cb = _best(raw, 'content') || _lastOpen(raw, 'content', /<choices>[\s\S]*$/i);   // 後者＝收尾被截掉
        let content = _cb ? '<content>\n' + _cb + '\n</content>' : '';
        if (!content && /\[(Char|Nar|Bg)\|/i.test(raw)) content = '<content>\n' + raw.replace(/<choices>[\s\S]*$/i, '') + '\n</content>';   // 忘了包 <content>
        if (!content) throw new Error('沒寫出劇本');
        let choices = [], cards = [];
        if (!last) {
            const cb = _best(raw, 'choices') || _lastOpen(raw, 'choices') || '';
            cb.split('\n').map(s => s.replace(/<[^>]+>/g, '').replace(/^\s*(?:[-*・•]|\d+[.、)）]|[A-Ca-c][.、)）])\s*/, '').trim()).forEach(s => {
                if (!s || choices.length >= 3) return;
                const c = _cardOf(s);
                if (c.text && c.text.length <= 40) { choices.push(c.text); cards.push(cards.includes(c.n) ? -1 : c.n); }
            });
        }
        return { content: _stripMainline(content), choices, cards, pick: '', setup: _setupOf(out) };
    }

    // ── 畫面 ──
    function _html() {
        return '<div class="lmem-frame">' +
            '<div class="lmem-cam">' +
              '<video class="lmem-v on" data-v="ask" playsinline preload="auto" muted></video>' +
              '<video class="lmem-v" data-v="wait" playsinline preload="auto" muted loop></video>' +
              '<video class="lmem-v" data-v="draw" playsinline preload="auto"></video>' +
            '</div>' +
            '<div class="lmem-vig"></div>' +
            '<div class="lmem-pop lmem-choice"><div class="lmem-choice-row"><button type="button" class="lmem-btn breathe" data-act="self">問問自己的事</button><button type="button" class="lmem-btn breathe" data-act="pick">聽一段別人的往事</button></div>' +
              '<div class="lmem-choice-row"><button type="button" class="lmem-link" data-act="shelf" hidden>看收過的牌</button><button type="button" class="lmem-link" data-act="later">改天吧</button></div></div>' +
            '<div class="lmem-pop lmem-ask"><div class="lmem-pick-box"><p class="lmem-pick-title">想問自己什麼？</p>' +
              '<textarea class="lmem-ask-in" rows="2" maxlength="200" placeholder="把想問的事寫在這裡"></textarea>' +
              '<div class="lmem-pick-foot lmem-ask-foot"><button type="button" class="lmem-btn" data-act="self-go">就問這個</button><button type="button" class="lmem-link" data-act="back">返回</button></div></div></div>' +
            '<div class="lmem-pop lmem-shelf"><div class="lmem-pick-box"><p class="lmem-pick-title">收過的牌</p><div class="lmem-shelf-list"></div><div class="lmem-shelf-act"></div>' +
              '<div class="lmem-pick-foot"><button type="button" class="lmem-link" data-act="back">返回</button></div></div></div>' +
            '<div class="lmem-pop lmem-pick"><div class="lmem-pick-box"><p class="lmem-pick-title">想看誰的記憶？</p><div class="lmem-pick-list"></div><p class="lmem-pick-note" hidden></p>' +
              '<div class="lmem-pick-foot"><button type="button" class="lmem-link" data-act="back">返回</button></div></div></div>' +
            '<img class="lmem-plate" alt="">' +
            '<div class="lmem-slot">' +
              '<div class="lmem-halo"></div><div class="lmem-shadow"></div>' +
              '<div class="lmem-tilt"><div class="lmem-card"><div class="lmem-face back"><div class="lmem-later"></div></div><div class="lmem-face front"><div class="lmem-name"><b></b><span></span></div></div></div></div>' +
            '</div>' +
            '<div class="lmem-wait-note">牌面還沒浮上來……</div>' +
            '<div class="lmem-pop lmem-after"><button type="button" class="lmem-btn breathe" data-act="enter">走進這段回憶</button><button type="button" class="lmem-link" data-act="close">收起來</button></div>' +
            '<div class="lmem-out"></div><div class="lmem-sub"></div>' +
            '<div class="lmem-corner"><button type="button" class="lmem-mini" data-act="skip" hidden>略過</button><button type="button" class="lmem-mini lmem-close" data-act="close" title="關閉">✕</button></div>' +
        '</div>';
    }

    function _mount() {
        const vnPanel = document.getElementById('aurelia-vn-panel');
        const host = (vnPanel && vnPanel.parentElement) || document.querySelector('#aurelia-phone-screen') || document.body;
        const root = document.createElement('div');
        root.className = 'lmem';
        root.innerHTML = _html() + _tarotLayer();
        host.appendChild(root);
        const q = (s) => root.querySelector(s);
        const v = { ask: q('[data-v="ask"]'), wait: q('[data-v="wait"]'), draw: q('[data-v="draw"]') };
        q('.lmem-plate').src = A.plate;
        q('.lmem-face.back').style.backgroundImage = "url('" + A.back + "')";
        R = {
            root, q, v, step: '', tok: 0, timers: [], live: false, endAt: 0, fx: 0, lift: 0, cx: 0, cy: 0, tx: 0, ty: 0, near: 0,
            bgm: new Audio(), askVoice: new Audio(), chime: new Audio(), leave: new Audio(), flip: new Audio(), zoom: new Audio(),
            bgmGoal: 0, zTop: 1, job: null, result: null, person: null, sid: _storyId(), seen: false, raf: 0, vnObs: null,
        };
        R.bgm.loop = true; R.bgm.volume = 0; R.chime.volume = .7; R.flip.volume = .85; R.zoom.volume = .8;
        // 大廳自己的背景音樂先停（紫薇這邊有自己的），收起來再接回去
        const lb = document.getElementById('lobby-bgm-player');
        R.lobbyBgm = (lb && !lb.paused) ? lb : null;
        if (R.lobbyBgm) try { R.lobbyBgm.pause(); } catch (e) {}
        R.volTimer = setInterval(() => { if (R) R.bgm.volume = Math.max(0, Math.min(1, R.bgm.volume + (R.bgmGoal - R.bgm.volume) * .15)); }, 50);
        root.addEventListener('click', _onClick);
        _bindCard();
    }
    function open() {
        if (R) return;
        _mount();
        const v = R.v;
        const tok = R.tok;
        const set = (el, p) => p.then(u => { if (R && R.tok === tok) el.src = u; return u; });
        // 等待、抽卡、牌出來的聲音：背景先抓著
        R.ready = {
            wait: set(v.wait, _vid(A.wait)), draw: set(v.draw, _vid(A.draw)),
            chime: set(R.chime, _aud(A.chime)), leave: set(R.leave, _aud(A.leave)),
            flip: set(R.flip, _aud(A.flip)), zoom: set(R.zoom, _aud(A.zoom)),
        };
        Object.values(R.ready).forEach(p => p.catch(() => {}));
        // 這個故事收過的牌：有才露出「看收過的牌」
        _migrateDraws(R.sid).then(() => _loadDraws()).then(list => { if (!R || R.tok !== tok) return; R.draws = list.map(_norm).reverse(); R.q('[data-act="shelf"]').hidden = !R.draws.length; });
        Promise.all([set(v.ask, _vid(A.ask)), set(R.askVoice, _aud(A.askVoice)), set(R.bgm, _aud(A.bgm)), _seen()])
            .then(r => { if (R && R.tok === tok) { R.seen = r[3]; _toAsk(); } })
            .catch(e => {
                console.warn('[LobbyMemory] 影片抓不到', e);
                if (!R || R.tok !== tok) return;
                const s = R.q('.lmem-sub'); s.textContent = '吧檯的燈暗著，晚點再來吧。'; s.classList.add('on');
                _later(() => close(), 2600);
            });
    }

    // 音效：從頭播；many＝一張接一張翻（占卜的牌陣）時另開一份，前一張的聲音不會被切掉
    function _sfx(a, many) {
        try {
            if (!a || !a.src) return;
            if (many) { const c = new Audio(a.src); c.volume = a.volume; c.play().catch(() => {}); return; }
            a.currentTime = 0; a.play().catch(() => {});
        } catch (e) {}
    }
    function _later(fn, ms) { const t = R.tok; const id = setTimeout(() => { if (R && t === R.tok) fn(); }, ms); R.timers.push(id); }
    function _show(which) {
        const el = R.v[which]; el.style.zIndex = String(++R.zTop); el.classList.add('on');
        _later(() => { Object.keys(R.v).forEach(k => { const x = R.v[k]; if (x !== el && +x.style.zIndex < +el.style.zIndex) x.classList.remove('on'); }); }, 450);
    }
    function _skipBtn(on) { const b = R.q('[data-act="skip"]'); if (b) b.hidden = !on; }

    function _toAsk() {
        R.step = 'ask';
        R.v.ask.currentTime = 0; _show('ask');
        const p = R.v.ask.play(); if (p && p.catch) p.catch(() => {});
        try { R.askVoice.currentTime = 0; R.askVoice.play().catch(() => {}); } catch (e) {}
        try { R.bgm.currentTime = 0; R.bgm.play().catch(() => {}); } catch (e) {}
        R.bgmGoal = BGM.duck;
        _skipBtn(R.seen);
        // 快播完就交棒給等待（跟影片自己的時間走，畫面在背景也照跑）
        const watch = () => {
            if (!R || R.step !== 'ask') { R && R.v.ask.removeEventListener('timeupdate', watch); return; }
            if (R.v.ask.ended || (R.v.ask.duration && R.v.ask.currentTime >= R.v.ask.duration - .45)) { R.v.ask.removeEventListener('timeupdate', watch); _toWait(); }
        };
        R.v.ask.addEventListener('timeupdate', watch); R.v.ask.addEventListener('ended', watch);
    }
    function _toWait() {
        R.step = 'wait'; _skipBtn(false);
        try { R.askVoice.pause(); } catch (e) {}
        const tok = R.tok;
        R.ready.wait.then(() => { if (R && R.tok === tok && R.step === 'wait') { R.v.wait.currentTime = 0; const p = R.v.wait.play(); if (p && p.catch) p.catch(() => {}); } }).catch(() => {});
        _show('wait'); R.bgmGoal = BGM.full;
        _later(() => { if (R.v.ask) R.v.ask.pause(); }, 450);
        _later(() => { if (R.step === 'wait') R.q('.lmem-vig').classList.add('on'); }, 900);
        _later(() => { if (R.step === 'wait') R.q('.lmem-choice').classList.add('on'); }, 1800);
    }
    async function _toPick() {
        if (R.step !== 'wait') return;
        R.step = 'pick';
        R.q('.lmem-choice').classList.remove('on');
        const list = R.q('.lmem-pick-list');
        list.innerHTML = '<div class="lmem-pick-empty">……</div>';
        R.q('.lmem-pick').classList.add('on');
        _pickNote('');
        const tok = R.tok;
        const groups = await _people();
        if (!R || R.tok !== tok || R.step !== 'pick') return;
        if (!_flat(groups).length) {
            list.innerHTML = '<div class="lmem-pick-empty">這個故事裡還沒有認識的人。<br>先去故事裡走一走，回來再看吧。</div>';
            return;
        }
        try { await _attachPasts(groups); } catch (e) { console.warn('[LobbyMemory] 往事線索沒讀到', e); }
        if (!R || R.tok !== tok || R.step !== 'pick') return;
        R.groups = groups;
        _renderPick();
        // 舊故事第一次打開：補一次往事線索（好幾個故事併一通副模型）
        const need = _fillNeed(groups);
        if (!need.length) return;
        R.filling = true;
        _pickNote('紫薇在翻你們過去的事……');
        let err = '';
        try { await _backfill(need); await _attachPasts(groups); } catch (e) { err = (e && e.message) || '沒翻到'; console.warn('[LobbyMemory] 舊故事的往事線索沒補到', e); }
        if (!R || R.tok !== tok) return;
        R.filling = false;
        if (R.step !== 'pick') return;
        _renderPick();
        _pickNote(err ? '翻不到你們過去的事（' + err + '），晚點再來看看。' : '');
    }
    // 名單：每個故事裡抽得了的排前面，沒線索的變灰排後面（R.people 照畫出來的順序，data-i 對得上）
    function _renderPick() {
        const people = [];
        R.q('.lmem-pick-list').innerHTML = R.groups.map(g => {
            const list = g.list.filter(p => p.fresh && p.fresh.length).concat(g.list.filter(p => !(p.fresh && p.fresh.length)));
            return '<p class="lmem-pick-group">' + (g.here ? '這個故事' + (g.story ? '・《' + esc(g.story) + '》' : '') : '《' + esc(g.story || '別的故事') + '》') + '</p>' +
                list.map(p => {
                    const off = !(p.fresh && p.fresh.length);
                    const why = !off ? '' : (p.pasts && p.pasts.length) ? '他讓你看見的過去都翻過了' : '還不熟';
                    return '<button type="button" class="lmem-who' + (off ? ' off' : '') + '" data-i="' + (people.push(p) - 1) + '"><b>' + esc(p.name) + '</b>' +
                        (p.hook ? '<span>' + esc(p.hook) + '</span>' : '') + (off ? '<em>' + why + '</em>' : '') + '</button>';
                }).join('');
        }).join('');
        R.people = people;
    }
    function _pickNote(t) { const n = R && R.q('.lmem-pick-note'); if (n) { n.textContent = t; n.hidden = !t; } }
    // 點到灰的：紫薇說為什麼抽不了
    function _pickOff(p) {
        if (R.filling) { _pickNote('等我一下，還在翻。'); return; }
        _pickNote(p.pasts && p.pasts.length ? '「他讓你看見的過去，我都翻過了。再多相處一陣子吧。」' : '「你們還不夠熟，我翻不到' + p.name + '的過去。」');
    }
    function _backToWait() {
        R.step = 'wait';
        R.q('.lmem-pick').classList.remove('on'); R.q('.lmem-shelf').classList.remove('on'); R.q('.lmem-ask').classList.remove('on');
        _later(() => { if (R.step === 'wait') R.q('.lmem-choice').classList.add('on'); }, 300);
    }
    // ── 展示櫃：這個故事收過的牌（一段回憶一張）。演完的「再走一次」、走到一半的「接著走」，都不叫模型重寫已經有的幕 ──
    function _toShelf() {
        if (R.step !== 'wait' || !(R.draws && R.draws.length)) return;
        R.step = 'shelf'; R.sel = null;
        R.q('.lmem-choice').classList.remove('on');
        R.q('.lmem-shelf-list').innerHTML = R.draws.map((d, i) => {
            const st = d.done ? '收好了' : d.acts.length ? '走到第' + '一二三'[Math.min(d.acts.length, ACT_MAX) - 1] + '幕' : '還沒走進去';
            return '<button type="button" class="lmem-keep" data-i="' + i + '" style="--img:url(' + A.mem[d.img == null ? 0 : d.img] + ')">' +
                '<b>' + esc(d.title) + '</b><span>' + esc(d.name + (d.when ? '・' + d.when : '')) + '</span>' + (d.story ? '<i>《' + esc(d.story) + '》</i>' : '') + '<em' + (d.done ? '' : ' class="go"') + '>' + st + '</em></button>';
        }).join('');
        R.q('.lmem-shelf-act').innerHTML = '';
        R.q('.lmem-shelf').classList.add('on');
        // 有畫過牌面的換上那張（存在圖庫，讀出來是 blob 網址）
        const tok = R.tok;
        R.draws.forEach((d, i) => { if (d.pic) _picOf(d).then(u => {
            if (!u || !R || R.tok !== tok || R.step !== 'shelf') return;
            const b = R.q('.lmem-keep[data-i="' + i + '"]'); if (b) b.style.setProperty('--img', 'url(' + u + ')');
        }); });
    }
    function _shelfPick(i) {
        const d = R.draws[i]; if (!d) return;
        R.sel = d;
        R.q('.lmem-shelf-list').querySelectorAll('.lmem-keep').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
        const btns = d.done ? [['replay', '再走一次']] : d.acts.length > 1 ? [['resume', '接著走'], ['replay', '從頭看']] : [['resume', d.acts.length ? '接著走' : '走進這段回憶']];
        R.q('.lmem-shelf-act').innerHTML = (d.after && d.done ? '<p class="lmem-shelf-after">' + esc(d.after) + '</p>' : '') +
            btns.map(b => '<button type="button" class="lmem-btn" data-act="' + b[0] + '">' + b[1] + '</button>').join('') +
            '<button type="button" class="lmem-link lmem-drop" data-act="drop">丟掉這張</button>';
    }
    // 丟掉一張（11-26，清掉測試抽的牌用）：這張連三幕一起刪，找不回來，先問
    async function _dropCard() {
        const d = R && R.sel; if (!d || R.step !== 'shelf') return;
        const tok = R.tok, sid = R.sid;
        const U = win.AUI || window.AUI;
        const ok = U && U.confirm ? await U.confirm('「' + d.title + '」這張牌丟掉就找不回來了（裡面演過的幾幕一起刪）。要丟嗎？', { okText: '丟掉', cancelText: '留著', danger: true }) : false;
        if (!ok || !R || R.tok !== tok) return;
        await (_saveQ = _saveQ.then(async () => {
            const all = (await _loadDraws()).map(_norm);
            const pic = ((all.find(x => x.id === d.id) || {}).pic) || d.pic;
            await win.OS_DB.saveAppData(APP, 'draws', all.filter(x => x.id !== d.id));
            if (pic && win.OS_DB.deleteCharImage) await win.OS_DB.deleteCharImage(pic).catch(() => {});   // 牌面畫一起丟
        }).catch(e => console.warn('[LobbyMemory] 牌沒丟掉', e)));
        if (!R || R.tok !== tok) return;
        R.draws = R.draws.filter(x => x.id !== d.id);
        R.q('[data-act="shelf"]').hidden = !R.draws.length;
        if (!R.draws.length) { _backToWait(); return; }
        R.step = 'wait'; _toShelf();
    }
    async function _fromShelf(mode) {
        const d = R && R.sel; if (!d || R.step !== 'shelf') return;
        R.step = 'entering';
        try { const gs = await _people(); try { await _attachPasts(gs); } catch (e) {} const all = _flat(gs); d._person =all.find(p => p.name === d.name && (!d.story || p.story === d.story)) || all.find(p => p.name === d.name) || { name: d.name, story: d.story || '' }; } catch (e) { d._person = { name: d.name, story: d.story || '' }; }
        if (!R) return;
        R.q('.lmem-shelf').classList.remove('on'); R.q('.lmem-vig').classList.add('deep');
        R.result = d;
        const from = mode === 'replay' ? 0 : Math.max(0, d.acts.length - 1);
        _zoomInto(() => _play(d, from, true));
    }

    function _toDraw(person) {
        if (R.step !== 'pick') return;
        R.step = 'drawing'; R.person = person;
        const tok = R.tok;
        R.ready.draw.then(() => { if (R && R.tok === tok) _startDraw(person); }).catch(() => {
            if (!R || R.tok !== tok) return;
            const s = R.q('.lmem-sub'); s.textContent = '牌沒拿穩，晚點再來吧。'; s.classList.add('on');
            _later(() => close(), 2600);
        });
    }
    function _startDraw(person) {
        R.step = 'draw'; R.result = null; R.failed = null;
        R.q('.lmem-pick').classList.remove('on'); R.q('.lmem-vig').classList.remove('on');
        R.v.draw.currentTime = 0; const p = R.v.draw.play(); if (p && p.catch) p.catch(() => {});
        _show('draw'); R.bgmGoal = BGM.duck;
        _later(() => { R.v.wait.pause(); }, 450);
        _skipBtn(R.seen);
        const onEnd = () => { R && R.v.draw.removeEventListener('ended', onEnd); if (R && R.step === 'draw') _toCard(); };
        R.v.draw.addEventListener('ended', onEnd);
        // 背景先抽牌面（副模型，抽卡演完前就有），一拿到就接著寫劇本（主模型）
        const sid = R.sid, myTok = R.tok;
        R.job = _drawCard(person, sid).then(rec => {
            if (!R || R.tok !== myTok) return;
            R.result = rec; rec._person = person;
            rec.img = Math.floor(Math.random() * A.mem.length);
            _saveDraw(sid, rec);   // 牌抽出來就收進展示櫃（第一幕寫壞了也看得到，之後接著走）
            _cardReady();
            _startScript(person, rec, sid);
            _paintCard(rec, sid);   // 牌面畫：背景畫，畫好換上
        }).catch(e => {
            console.warn('[LobbyMemory] 牌面沒抽出來', e);
            if (!R || R.tok !== myTok) return;
            R.failed = (e && e.message) || '沒寫出來';
            _cardReady();
        });
    }
    // 寫劇本：收起來了也照樣寫完存進抽過的回憶（錢已經花了，之後回憶清單看得到）
    function _startScript(person, rec, sid) {
        rec._job = _writeAct(person, rec, 0).then(act => {
            rec.acts[0] = act; rec._err = '';
            _saveDraw(sid, rec);
        }).catch(e => {
            console.warn('[LobbyMemory] 劇本沒寫出來', e);
            rec._err = (e && e.message) || '沒寫出來';
        });
    }
    function _skip() {
        if (R.step === 'ask') _toWait();   // 詢問那支自己的 timeupdate 看到 step 換了會自己拆掉
        else if (R.step === 'draw' && R.v.draw.duration) R.v.draw.currentTime = Math.max(0, R.v.draw.duration - DRAW_SKIP_AT);
    }

    // ── 問問自己的事：個人占卜（11-26 從舊的賽博塔羅浮窗搬進來；牌、牌陣、解牌的規矩都在 os_tarot.js，這裡只畫） ──
    //   問題 → 紫薇挑牌陣（一通）→ 扇形牌堆挑牌 → 翻開 → 解讀（一通）→ 追問（一問一通）／她提議時補抽一張（一通）
    //   畫面在 .lmem-tarot：橫的螢幕疊在影片上（人在上面、牌擺在吧檯上）；直的螢幕影片靠上、牌和解讀放在影片下面
    const FAN = 22;   // 扇形攤開幾張（整副洗過，從最上面攤）
    function _tarotLayer() {
        return '<div class="lmem-tarot" style="--back:url(' + A.back + ')">' +
            '<p class="lmem-tt-note"></p>' +
            '<div class="lmem-tt-slots"></div>' +
            '<div class="lmem-tt-fan"></div>' +
            '<div class="lmem-tt-act"><button type="button" class="lmem-btn breathe" data-act="self-flip">翻開</button></div>' +
            '<div class="lmem-read"><div class="lmem-read-log"></div>' +
              '<div class="lmem-read-in"><input type="text" maxlength="200" placeholder="還想問什麼？"><button type="button" class="lmem-mini" data-act="self-ask">問</button></div>' +
              '<div class="lmem-read-foot"><button type="button" class="lmem-link" data-act="self-again">再問一個問題</button><button type="button" class="lmem-link" data-act="close">收起來</button></div>' +
            '</div>' +
        '</div>';
    }
    const _T = () => win.OS_TAROT || window.OS_TAROT;
    function _rich(t) {   // 紫薇（模型）寫的字：照格式顯示、什麼都不准跑
        const U = win.AUI || window.AUI;
        const h = String(t == null ? '' : t).replace(/\n/g, '<br>');
        return U && U.safeHtml ? U.safeHtml(h) : esc(t).replace(/\n/g, '<br>');
    }
    function _toSelf() {
        if (R.step !== 'wait') return;
        if (!_T() || !_T().pickSpread) {
            const s = R.q('.lmem-sub'); s.classList.add('low'); s.textContent = '牌還沒擺上來，晚點再來吧。'; s.classList.add('on');
            _later(() => s.classList.remove('on'), 2600);
            return;
        }
        R.step = 'self-ask';
        R.q('.lmem-choice').classList.remove('on');
        R.q('.lmem-ask').classList.add('on');
        const ta = R.q('.lmem-ask-in');
        if (!ta.dataset.bound) {
            ta.dataset.bound = '1';
            ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); _selfGo(); } });
        }
        _later(() => { try { ta.focus({ preventScroll: true }); } catch (e) {} }, 500);
    }
    function _selfGo() {
        if (R.step !== 'self-ask') return;
        const ta = R.q('.lmem-ask-in');
        const q = ta.value.trim();
        if (!q) { ta.classList.remove('nudge'); void ta.offsetWidth; ta.classList.add('nudge'); return; }
        R.step = 'self-spread';
        R.q('.lmem-ask').classList.remove('on');
        R.q('.lmem-vig').classList.add('deep');
        R.root.classList.add('self');
        const note = R.q('.lmem-tt-note');
        note.textContent = '……'; note.classList.add('on');
        const tok = R.tok;
        _T().pickSpread(q).then(p => {
            if (!R || R.tok !== tok || R.step !== 'self-spread') return;
            R.self = { sess: _T().session(q, p.spread), deck: _T().newDeck(), cards: [], need: p.spread.count, busy: false };
            note.textContent = p.note || (p.spread.name + '，' + p.spread.count + '張。');
            _laySlots(p.spread.positions);
            _layFan();
            R.step = 'self-pick';
        });
    }
    function _slotHtml(pos) {
        return '<div class="lmem-ts"><span class="lmem-ts-pos">' + esc(pos || '') + '</span>' +
            '<div class="lmem-tcd"><div class="lmem-tcd-in"><div class="lmem-tcd-f lmem-tcd-back"></div><div class="lmem-tcd-f lmem-tcd-front"><span class="lmem-tcd-img"></span></div></div></div>' +
            '<span class="lmem-ts-name"></span></div>';
    }
    function _laySlots(positions) {
        R.q('.lmem-tt-slots').innerHTML = positions.map(_slotHtml).join('');
        R.q('.lmem-tarot').style.setProperty('--n', String(positions.length));
    }
    function _layFan() {
        const fan = R.q('.lmem-tt-fan');
        const n = Math.min(FAN, R.self.deck.length);
        fan.style.setProperty('--m', String((n - 1) / 2));
        fan.innerHTML = Array.from({ length: n }, (_, i) => '<button type="button" class="lmem-fc" data-i="' + i + '" style="--i:' + i + '" aria-label="一張牌"></button>').join('');
        fan.classList.remove('on'); void fan.offsetWidth; fan.classList.add('on');
    }
    // 從扇形抽一張：放進下一個空位（還沒翻）；補抽那張抽了就直接翻
    function _selfPick(fc) {
        const S = R.self;
        if (!S || (R.step !== 'self-pick' && R.step !== 'self-pick1') || fc.classList.contains('gone')) return;
        if (S.cards.length >= S.need) return;
        const card = S.deck[+fc.dataset.i];
        fc.classList.add('gone');
        const k = S.cards.length;
        S.cards.push(card);
        const slot = R.q('.lmem-tt-slots').children[k];
        const T = _T();
        slot.querySelector('.lmem-tcd-img').style.backgroundImage = "url('" + T.imgOf(card) + "')";
        slot.querySelector('.lmem-ts-name').textContent = T.zhName(card) + (card.isReversed ? '・逆位' : '');
        if (card.isReversed) slot.classList.add('rev');
        slot.classList.add('in');
        if (S.cards.length < S.need) return;
        R.q('.lmem-tt-fan').classList.remove('on');
        if (R.step === 'self-pick1') {
            R.step = 'self-flip';
            _later(() => { slot.classList.add('up'); _later(() => _selfAddRead(card), 900); }, 500);
            return;
        }
        R.step = 'self-ready';
        _later(() => R.q('.lmem-tt-act').classList.add('on'), 400);
    }
    function _selfFlip() {
        if (R.step !== 'self-ready') return;
        R.step = 'self-flip';
        R.q('.lmem-tt-act').classList.remove('on');
        const slots = [...R.q('.lmem-tt-slots').children];
        slots.forEach((el, i) => _later(() => {
            el.classList.add('up');
            _sfx(R.flip, true);
            if (i === 0) try { R.chime.currentTime = 0; R.chime.play().catch(() => {}); } catch (e) {}
        }, i * 520));
        _later(() => _selfRead(), slots.length * 520 + 700);
    }
    function _logAdd(cls, html) {
        const log = R.q('.lmem-read-log');
        const d = document.createElement('div');
        d.className = 'lmem-rl ' + cls;
        d.innerHTML = html;
        log.appendChild(d);
        log.scrollTop = log.scrollHeight;
        return d;
    }
    // 叫模型解讀／追問／補抽都走這支：紫薇那塊先出「……」，字邊寫邊出來；她提議補抽＝下面多一顆「抽一張」
    function _selfTalk(job) {
        const S = R.self, tok = R.tok;
        S.busy = true;
        const box = _logAdd('zw', '<span class="lmem-rl-wait">……</span>');
        const log = R.q('.lmem-read-log');
        const onText = (t) => { if (!R || R.tok !== tok || !t) return; box.innerHTML = _rich(t); log.scrollTop = log.scrollHeight; };
        return job(onText).then(res => {
            if (!R || R.tok !== tok) return;
            box.innerHTML = _rich(res.text || '……');
            if (res.more) _logAdd('more', '<button type="button" class="lmem-btn" data-act="self-more">抽一張</button>');
            log.scrollTop = log.scrollHeight;
        }).catch(e => {
            console.warn('[LobbyMemory] 紫薇沒讀出來', e);
            if (!R || R.tok !== tok) return;
            box.innerHTML = '<span class="lmem-rl-err">牌面今天有點模糊……再問一次看看。</span>';
        }).finally(() => { if (R && R.tok === tok && R.self === S) S.busy = false; });
    }
    function _selfRead() {
        const S = R.self; if (!S) return;
        R.step = 'self-read';
        R.root.classList.add('reading');
        R.q('.lmem-tt-note').classList.remove('on');
        _logAdd('you', esc(S.sess.question));
        _bindReadInput();
        _selfTalk((onText) => _T().read(S.sess, S.cards, onText));
    }
    function _bindReadInput() {
        const inp = R.q('.lmem-read-in input');
        if (inp.dataset.bound) return;
        inp.dataset.bound = '1';
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); _selfAsk(); } });
    }
    function _selfAsk() {
        const S = R.self;
        if (!S || R.step !== 'self-read' || S.busy) return;
        const inp = R.q('.lmem-read-in input');
        const t = inp.value.trim(); if (!t) return;
        inp.value = '';
        _logAdd('you', esc(t));
        _selfTalk((onText) => _T().ask(S.sess, t, onText));
    }
    // 她提議補抽：扇形再攤一次（已經攤開的牌不在裡面），多一格「補抽」，抽了直接翻、紫薇讀那一張
    function _selfMore() {
        const S = R.self;
        if (!S || R.step !== 'self-read' || S.busy) return;
        R.q('.lmem-read-log').querySelectorAll('.lmem-rl.more').forEach(x => x.remove());
        R.step = 'self-pick1';
        R.root.classList.remove('reading');
        const box = R.q('.lmem-tt-slots');
        box.insertAdjacentHTML('beforeend', _slotHtml('補抽'));
        R.q('.lmem-tarot').style.setProperty('--n', String(box.children.length));
        S.need = S.cards.length + 1;
        const used = new Set(S.cards.map(c => c.id));
        S.deck = _T().newDeck().filter(c => !used.has(c.id));
        const note = R.q('.lmem-tt-note'); note.textContent = '再抽一張。'; note.classList.add('on');
        _layFan();
    }
    function _selfAddRead(card) {
        const S = R.self; if (!S) return;
        R.step = 'self-read';
        R.root.classList.add('reading');
        R.q('.lmem-tt-note').classList.remove('on');
        _logAdd('you', '補抽：' + esc(_T().zhName(card) + (card.isReversed ? '・逆位' : '')));
        _selfTalk((onText) => _T().addCard(S.sess, card, onText));
    }
    // 再問一個問題：桌面收乾淨，回到寫問題那格
    function _selfAgain() {
        if (!R.self || R.self.busy) return;
        R.self = null;
        R.root.classList.remove('reading', 'self');
        R.q('.lmem-tt-slots').innerHTML = ''; R.q('.lmem-tt-fan').innerHTML = ''; R.q('.lmem-tt-fan').classList.remove('on');
        R.q('.lmem-read-log').innerHTML = ''; R.q('.lmem-tt-note').classList.remove('on'); R.q('.lmem-tt-act').classList.remove('on');
        R.q('.lmem-vig').classList.remove('deep');
        R.q('.lmem-ask-in').value = '';
        R.step = 'wait';
        _toSelf();
    }

    // ── 真牌 ──
    function _toCard() {
        R.step = 'card'; R.live = true; R.endAt = performance.now(); _skipBtn(false);
        R.root.classList.add('end'); R.bgmGoal = BGM.full;
        if (!R.seen) { R.seen = true; _markSeen(); }
        try { R.chime.currentTime = 0; R.chime.play().catch(() => {}); } catch (e) {}
        _cardReady();
    }
    function _cardReady() {
        if (!R || R.step !== 'card') return;
        const slot = R.q('.lmem-slot'), note = R.q('.lmem-wait-note');
        const ready = !!(R.result || R.failed);
        slot.classList.toggle('wait', !ready);
        note.classList.toggle('on', !ready);
        if (!ready) return;
        const front = R.q('.lmem-face.front');
        if (R.result) {
            _setFront(R.result);
            R.q('.lmem-name b').textContent = R.result.title;
            R.q('.lmem-name span').textContent = R.result.name + (R.result.when ? '・' + R.result.when : '');
        } else {
            front.style.backgroundImage = "url('" + A.mem[0] + "')";
            R.q('.lmem-name b').textContent = '這張牌今天讀不出來';
            R.q('.lmem-name span').textContent = '改天再試試';
        }
    }
    function _flip() {
        if (R.step !== 'card' || !(R.result || R.failed)) return;
        const card = R.q('.lmem-card');
        if (card.classList.contains('flipped')) return;
        card.classList.add('flipped');
        _sfx(R.flip);
        R.step = 'flipped';
        _later(() => {
            const enter = R.q('[data-act="enter"]');
            enter.hidden = !R.result;
            R.q('.lmem-after').classList.add('on');
        }, 900);
    }
    function _bindCard() {
        const slot = R.q('.lmem-slot');
        // 光效的星點、光層：每一面塞一組
        const LAYERS = ['lmem-foil2', 'lmem-foil', 'lmem-etch', 'lmem-glare', 'lmem-sweep', 'lmem-rim'];
        const ANCHORS = { back: [[50, 50], [50, 8], [50, 92], [13, 50], [87, 50], [11, 7], [89, 93]], front: [[10, 6], [90, 6], [10, 94], [90, 94], [50, 5]] };
        R.sparks = [];
        [['back', R.q('.lmem-face.back')], ['front', R.q('.lmem-face.front')]].forEach(([k, face]) => {
            LAYERS.forEach(c => { const d = document.createElement('div'); d.className = 'lmem-l ' + c; face.appendChild(d); });
            ANCHORS[k].forEach(a => { const s = document.createElement('div'); s.className = 'lmem-spark'; s.style.setProperty('--ax', a[0] + '%'); s.style.setProperty('--ay', a[1] + '%'); face.appendChild(s); R.sparks.push({ el: s, x: a[0], y: a[1], mirror: k === 'front' }); });
        });
        (function speck() {
            const S = 320, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
            let seed = 20261120; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
            for (let i = 0; i < 240; i++) {
                const x = rnd() * S, y = rnd() * S, r = .6 + rnd() * rnd() * 2, a = .35 + rnd() * .65;
                g.fillStyle = 'rgba(255,' + (225 + (rnd() * 30 | 0)) + ',' + (190 + (rnd() * 65 | 0)) + ',' + a.toFixed(2) + ')';
                g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
                if (r > 1.5) { g.fillRect(x - r * 3.2, y - .3, r * 6.4, .6); g.fillRect(x - .3, y - r * 3.2, .6, r * 6.4); }
            }
            c.toBlob(b => { if (b && R) { R.speckUrl = URL.createObjectURL(b); slot.style.setProperty('--speck', "url('" + R.speckUrl + "')"); } });
        })();
        R.root.addEventListener('pointermove', (e) => {
            const r = slot.getBoundingClientRect(); if (!r.width) return;
            const px = (e.clientX - (r.left + r.width / 2)) / (r.width * .75), py = (e.clientY - (r.top + r.height / 2)) / (r.height * .75);
            R.tx = Math.max(-1, Math.min(1, px)); R.ty = Math.max(-1, Math.min(1, py));
            R.near = Math.max(0, 1 - (Math.hypot(px, py) - .6) / 1.2);
        });
        R.root.addEventListener('pointerleave', () => { if (R) R.near = 0; });
        let downAt = null;
        slot.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
        slot.addEventListener('pointerup', (e) => { const d = downAt; downAt = null; if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 8) _flip(); });
        const frame = (now) => {
            if (!R) return;
            R.raf = requestAnimationFrame(frame);
            // 牌沒出來就什麼都不寫（寫了＝底下的影片每格重算、會閃）
            if (!R.live) return;
            const t = (now - R.endAt) / 1000;
            R.fx += (Math.min(1, Math.max(0, (t - .3) / 1.1)) - R.fx) * .12;
            R.lift += (R.near - R.lift) * .08;
            const th = now / 5200 * Math.PI * 2, idle = 1 - R.near;
            const gx = R.tx * R.near + Math.sin(th) * .35 * idle * R.fx, gy = R.ty * R.near + Math.sin(th + 1.9) * .28 * idle * R.fx;
            R.cx += (gx - R.cx) * .1; R.cy += (gy - R.cy) * .1;
            const st = slot.style, tilt = .25 + R.lift * .75;
            st.setProperty('--ry', (R.cx * 14 * tilt).toFixed(2) + 'deg');
            st.setProperty('--rx', (-R.cy * 9 * tilt).toFixed(2) + 'deg');
            st.setProperty('--mx', (50 + R.cx * 50).toFixed(2) + '%');
            st.setProperty('--my', (50 + R.cy * 50).toFixed(2) + '%');
            st.setProperty('--hyp', Math.min(1, Math.hypot(R.cx, R.cy)).toFixed(3));
            st.setProperty('--lift', R.lift.toFixed(3));
            st.setProperty('--fx', R.fx.toFixed(3));
            st.setProperty('--pulse', ((Math.sin(now / 900) + 1) / 2).toFixed(3));
            const lx = 50 + R.cx * 50, ly = 50 + R.cy * 50;
            for (const s of R.sparks) {
                const sx = s.mirror ? 100 - lx : lx, d = Math.hypot(sx - s.x, (ly - s.y) * 1.3) / 100, o = Math.max(0, 1 - d / .36);
                s.el.style.setProperty('--o', (o * o).toFixed(3));
            }
        };
        R.raf = requestAnimationFrame(frame);
    }

    // ── 改天吧：整片往下滑出去、暗掉，字幕在中間、紫薇說一句，收起來 ──
    function _leave() {
        if (R.step !== 'wait') return;
        R.step = 'leave';
        R.q('.lmem-choice').classList.remove('on'); R.q('.lmem-vig').classList.add('deep');
        R.q('.lmem-cam').classList.add('down'); R.q('.lmem-out').classList.add('on'); R.bgmGoal = .12;
        _later(() => { const s = R.q('.lmem-sub'); s.textContent = '也好。有些事，不急著知道。'; s.classList.add('on'); try { R.leave.currentTime = 0; R.leave.play().catch(() => {}); } catch (e) {} }, 1300);
        _later(() => { R.q('.lmem-sub').classList.remove('on'); R.bgmGoal = 0; }, 1300 + 3100 + 900);
        _later(() => close(), 1300 + 3100 + 900 + 900);
    }

    // ── 走進這段回憶：鏡頭朝牌推進去 → 借 VN 播放器當小劇場播，演完回吧檯 ──
    //   11-26：zoom in 後直接進 VN 的 loading → 劇本還沒寫好也不在吧檯乾等：
    //   推進去、進劇情頁蓋上 loading（「回憶正在浮現…」），寫好由劇情自己的開場 loading 接手；寫壞了退回大廳說一聲。
    function _enter() {
        const rec = R && R.result;
        if (!rec) return;
        if (!rec.acts[0] && rec._err) { rec._err = ''; _startScript(R.person, rec, R.sid); }   // 剛才寫壞了：這一按重寫一次（一按一通）
        _zoomInto(() => _play(rec, 0, false));
    }
    function _zoomInto(fn) {
        R.step = 'entering';
        R.q('.lmem-after').classList.remove('on');
        R.root.classList.add('zoom');
        _sfx(R.zoom);   // close() 不停它：牌拉近到進劇情是一口氣的
        R.bgmGoal = 0;
        _later(() => R.q('.lmem-out').classList.add('on'), 450);
        _later(fn, 1150);
    }

    // 三幕一幕一幕播：每幕演完 vn_core.js 交回來（__AURELIA_SIDE_STORY_END）→
    //   後面那幕已經寫好（選過、或是在展示櫃重看）＝直接接著播；還沒寫＝跳選項，選了才寫；三幕演完＝回吧檯收尾。
    //   from＝從第幾幕開始播；replay＝展示櫃重看（幕和幕之間先亮一下「那時候，他選了」）
    // 先問小時候的立繪再進劇情：要演的那一幕已經寫好的話，大廳還開著時就問（畫的時候在劇情的幕布下等）
    function _play(rec, from, replay) {
        const sid = (R && R.sid) || _storyId();
        if (R && R._busy) return;
        if (!rec.acts[from]) { _playVn(rec, from, replay, sid, null); return; }
        if (R) R._busy = true;
        const r0 = R;
        _youngAsk(rec, from, sid).catch(e => { console.warn('[LobbyMemory] 小時候的立繪沒問成', e); return { map: {}, paint: [] }; })
            .then(plan => { if (r0) r0._busy = false; _playVn(rec, from, replay, sid, plan); });
    }
    function _playVn(rec, from, replay, sid, plan0) {
        close({ toVn: true });
        const V = window.VN_Core || win.VN_Core;
        const CC = win.AureliaControlCenter || window.AureliaControlCenter;
        const P = () => window.VN_PLAYER || win.VN_PLAYER;
        const person = rec._person || { name: rec.name };
        const title = '記憶迴廊・' + rec.title;
        const panel = () => document.getElementById('aurelia-vn-panel');
        const shown = () => { const p = panel(); return !!(p && p.style.display !== 'none'); };
        let at = from, dead = false;
        // 收場一律走劇情自己「退出」那顆（VN_PLAYER.stopGame）：背景音樂停、演完的這段清掉、面板收起、故事編號換回原本那個。
        //   🚨 只叫 hideVnPanel 的話音樂還在播，之後開章節窗口再關會掉回這段外傳空掉的結束畫面（11-26 踩到）
        const leave = () => {
            dead = true; _actsUi(null); _youngNow = null;
            if (mine()) win.__AURELIA_SIDE_STORY_END = null;
            try { V._hideWriterCurtain(); } catch (e) {}
            const p = P();
            try { if (p && p.stopGame) { p.stopGame(); return; } } catch (e) {}
            try { const b = document.getElementById('bgm-player'); if (b) { b.pause(); b.currentTime = 0; } } catch (e) {}
            try { CC.hideVnPanel(); } catch (e) {}
        };
        // 演完不出章末那排（繼續、重新生成都是主線的）：vn_core.js 看到這個就直接交回來
        const hook = () => { win.__AURELIA_SIDE_STORY_END = null; if (!dead) { win.__AURELIA_SIDE_STORY_END = idle; _actEnd(); } };
        // 幕和幕之間（選項開著、在寫下一幕）：劇情停在末尾，這時按到空白鍵也只會叫到這個，不會掉進主線章末那排
        const idle = () => { if (!dead) win.__AURELIA_SIDE_STORY_END = idle; };
        const mine = () => win.__AURELIA_SIDE_STORY_END === hook || win.__AURELIA_SIDE_STORY_END === idle;
        // 每一幕開演前：誰是小時候、有沒有那張（沒有就問、畫），舞台照 _youngNow 換圖或不放
        const playAct = (k) => {
            if (dead) return;
            _youngAsk(rec, k, sid)
                .then(plan => plan.paint.length ? (curtain('正在畫小時候的樣子…'), _youngPaint(plan, rec, sid, curtainLabel)) : plan)
                .catch(e => { console.warn('[LobbyMemory] 小時候的立繪沒問成', e); return { map: {} }; })
                .then(plan => { if (!dead) { _youngNow = plan.map; startAct(k); } });
        };
        const startAct = (k) => {
            if (dead) return;
            at = k;
            win.__AURELIA_SIDE_STORY_END = hook;
            const c = rec.acts[k].content;
            const p = P(); if (p && p.switchPage) p.switchPage('page-game');
            try { V.earlybirdFromText(c); } catch (e) {}
            V._startWithLoader(c, null, { replay: true });   // 開場 loading 接手幕布（沒圖可等就直接收掉開演）
        };
        const curtain = (label) => {
            const t0 = Date.now();
            const go = () => {
                if (dead) return;
                const p = P();
                if (!(p && p.switchPage && document.getElementById('page-game') && V && V._showWriterCurtain)) {
                    if (Date.now() - t0 < 5000) setTimeout(go, 120);
                    return;
                }
                p.switchPage('page-game');
                V._showWriterCurtain();
                curtainLabel(label || '回憶正在浮現…');
            };
            go();
        };
        const curtainLabel = (t) => { const lb = document.getElementById('vn-start-loader-label'); if (lb) lb.textContent = t; };
        const finish = () => {
            rec.done = true; _saveDraw(sid, rec);
            leave();
            try { _epilogue(rec); } catch (e) { console.warn('[LobbyMemory] 收尾沒演起來', e); }
        };
        const _actEnd = () => {
            const k = at, act = rec.acts[k] || {};
            if (rec.acts[k + 1] && (replay || act.pick)) {
                if (replay && act.pick) _actsUi({ said: act.pick, card: act.pickCard, onDone: () => playAct(k + 1) });
                else playAct(k + 1);
                return;
            }
            if (rec.done || k >= ACT_MAX - 1) { finish(); return; }
            choose(k, '');
        };
        // 這一幕演完，使用者替那時候的他選（或自己寫一句）→ 寫下一幕
        const choose = (k, err) => {
            const act = rec.acts[k];
            _actsUi({
                kicker: '第' + '一二三'[k] + '幕・' + ACTS[k].name, choices: act.choices || [], cards: act.cards || [], err,
                onPick: (text, card) => {
                    act.pick = text; act.pickCard = card == null ? -1 : card; _saveDraw(sid, rec);
                    _actsUi(null);
                    curtain('回憶正在浮現…');
                    _writeAct(person, rec, k + 1).then(a => {
                        rec.acts[k + 1] = a; rec.acts.length = k + 2;
                        _saveDraw(sid, rec);   // 半路離開也照樣存，下次從展示櫃接著走
                        if (!dead && shown()) playAct(k + 1);
                    }).catch(e => {
                        console.warn('[LobbyMemory] 下一幕沒寫出來', e);
                        act.pick = ''; _saveDraw(sid, rec);
                        if (dead || !shown()) return;
                        try { V._hideWriterCurtain(); } catch (x) {}
                        choose(k, '這一幕沒能浮上來，再選一次吧');
                    });
                },
                onLeave: () => {
                    leave();
                    try { (win.AUI || window.AUI).toast('這張牌收在展示櫃裡，下次可以從這裡接著走'); } catch (e) {}
                },
            });
        };
        try {
            if (V && V._enterTheater) V._enterTheater(THEATER, title);
            if (rec.acts[from] && plan0 && !plan0.paint.length) {
                at = from;
                _youngNow = plan0.map;
                win.__AURELIA_SIDE_STORY_END = hook;
                window._lobbyPendingChapter = { title, storyId: THEATER, storyTitle: '記憶迴廊', content: rec.acts[from].content, createdAt: Date.now() };
                if (CC && CC.showVnPanel) CC.showVnPanel('autoload');
                else startAct(from);
            } else if (rec.acts[from]) {
                // 問過、要畫小時候的立繪：先開劇情頁、蓋上幕布畫，畫好才演
                window._lobbyPendingChapter = null;
                if (CC && CC.showVnPanel) CC.showVnPanel();
                curtain('正在畫小時候的樣子…');
                _youngPaint(plan0, rec, sid, curtainLabel).catch(() => plan0).then(plan => { if (!dead && shown()) { _youngNow = plan.map; startAct(from); } });
            } else {
                // 第一幕還在寫（或剛才寫壞了、在展示櫃按接著走）：先開劇情頁、蓋上 loading 等它
                window._lobbyPendingChapter = null;
                if (CC && CC.showVnPanel) CC.showVnPanel();
                curtain('回憶正在浮現…');
                const job = rec._job || (rec._job = _writeAct(person, rec, 0).then(a => { rec.acts[0] = a; _saveDraw(sid, rec); }).catch(e => { rec._err = (e && e.message) || '沒寫出來'; }));
                job.then(() => {
                    if (dead || !shown()) return;   // 等的時候按了退出：劇本照樣存進展示櫃，不硬播
                    if (rec.acts[0]) playAct(0);
                    else {
                        rec._job = null;
                        leave();
                        try { (win.AUI || window.AUI).toast('這段回憶沒能浮上來，晚點再請紫薇試一次吧'); } catch (e) {}
                    }
                });
            }
            // 半路按「退出」回大廳：把交回來的那個鉤子、選項拿掉，免得下一章主線演完被它攔走
            const p = panel();
            if (p) {
                const ob = new MutationObserver(() => {
                    if (p.style.display !== 'none') return;
                    ob.disconnect(); dead = true; _actsUi(null); _youngNow = null;
                    if (mine()) win.__AURELIA_SIDE_STORY_END = null;
                });
                setTimeout(() => { if (!dead) ob.observe(p, { attributes: true, attributeFilter: ['style'] }); }, 1500);
            }
        } catch (e) { console.warn('[LobbyMemory] 回憶播不起來', e); win.__AURELIA_SIDE_STORY_END = null; }
    }

    // ── 幕和幕之間：選項（使用者替那時候的他選）／重看時的「那時候，他選了」──
    //   蓋在劇情頁上（#page-game，跟劇情的 loading 同一層），演完的那一幕背景還留著
    let _actsEl = null, _actsTimer = 0;
    // 大阿爾克那第 n 張的牌面圖：問 OS_TAROT（占卜那支，兩邊同一套圖、同一個網址）；那支沒載到就直接拼同一個網址
    const MAJOR_ART = 'https://raw.githubusercontent.com/nancywang3641/sound-files/eb7cb0d514bdcce82a8e4dcfcb16490091902c6d/zhiwei_tarot_v1/';
    function _majorArt(n) {
        const T = win.OS_TAROT;
        if (T && T.majorArt) return T.majorArt(n);
        return MAJOR_ART + String(n).padStart(2, '0') + '.webp';
    }
    function _tarotHtml(n, text, i) {   // 一張塔羅牌：背面＝紫薇的牌背，正面＝大阿爾克那（沒對到牌名＝只畫框和那條路）
        const has = n >= 0 && n < ARCANA.length;
        const tag = i >= 0 ? 'button type="button"' : 'div';
        return '<' + tag + ' class="lmem-tc' + (i < 0 ? ' up solo' : '') + '"' + (i >= 0 ? ' data-i="' + i + '"' : '') + '>' +
            '<span class="lmem-tc-in">' +
                '<span class="lmem-tc-face lmem-tc-back" style="background-image:url(' + A.back + ')"></span>' +
                // 有牌＝紫薇那套彩繪玻璃牌面（OS_TAROT.majorArt，跟占卜同一套），底下一條牌名；沒對到牌名＝照舊只畫框和符號
                (has
                    ? '<span class="lmem-tc-face lmem-tc-front art" style="background-image:url(' + _majorArt(n) + ')">' +
                          '<span class="lmem-tc-name">' + ARCANA[n] + '</span>' +
                      '</span>'
                    : '<span class="lmem-tc-face lmem-tc-front blank">' +
                          '<span class="lmem-tc-num"></span><span class="lmem-tc-glyph">✦︎</span><span class="lmem-tc-name"></span>' +
                      '</span>') +
            '</span>' +
            (text ? '<span class="lmem-tc-text">' + esc(text) + '</span>' : '') +
        '</' + tag.split(' ')[0] + '>';
    }
    function _actsUi(o) {
        clearTimeout(_actsTimer);
        if (_actsEl) { try { _actsEl.remove(); } catch (e) {} _actsEl = null; }
        if (!o) return;
        const host = document.getElementById('page-game') || document.getElementById('aurelia-vn-panel');
        if (!host) { if (o.onDone) o.onDone(); return; }
        const el = document.createElement('div');
        el.className = 'lmem-acts' + (o.said != null ? ' said' : '');
        if (o.said != null) {
            el.innerHTML = '<div class="lmem-acts-box"><p class="lmem-acts-kicker">那時候，他選了</p>' +
                (o.card >= 0 ? '<div class="lmem-tc-solo">' + _tarotHtml(o.card, '', -1) + '</div>' : '') +
                '<p class="lmem-acts-said">' + esc(o.said) + '</p></div>';
            const go = () => { if (_actsEl !== el) return; _actsUi(null); o.onDone(); };
            el.addEventListener('click', go);
            _actsTimer = setTimeout(go, 2600);
        } else {
            el.innerHTML = '<div class="lmem-acts-box">' +
                '<p class="lmem-acts-kicker">' + esc(o.kicker) + '</p>' +
                '<p class="lmem-acts-q">那時候的他，接下來……</p>' +
                '<div class="lmem-tcards">' + o.choices.map((c, i) => _tarotHtml((o.cards || [])[i], c, i)).join('') + '</div>' +
                '<div class="lmem-acts-own"><input type="text" maxlength="60" placeholder="或者，寫下他做了什麼"><button type="button" class="lmem-acts-go">就這樣</button></div>' +
                (o.err ? '<p class="lmem-acts-err">' + esc(o.err) + '</p>' : '') +
                '<button type="button" class="lmem-link" data-x="leave">先離開這段回憶</button>' +
            '</div>';
            let sent = false;
            const pick = (t, card) => { t = String(t || '').trim(); if (!t || sent) return; sent = true; o.onPick(t, card); };
            const inp = el.querySelector('input');
            // 翻牌、推進的聲音同吧檯那兩個（音量也一樣）。演到幕間時吧檯已經收了（R＝null），不能借 R.flip／R.zoom：
            //   這裡自己開一份；先拿快取好的那份（_aud），還沒好就直接用網址
            const snd = {};
            ['flip', 'zoom'].forEach(k => { _aud(A[k]).then(u => { snd[k] = u; }).catch(() => {}); });
            const play = (k, vol) => { try { const a = new Audio(snd[k] || A[k]); a.volume = vol; a.play().catch(() => {}); } catch (x) {} };
            // 三張牌背朝上發下來，選項寫在牌下面；點一張＝那張才翻開露出是哪張塔羅、另外兩張淡掉，
            //   翻的同時那張牌移到畫面正中間、放大，翻完鏡頭從正中間推進去、暗掉，接下一幕的幕布。
            //   鏡頭不跟著跑去旁邊那張：牌自己走到中間，推進才是正對著它。翻牌、推進的曲線照吧檯開頭那張真牌（.lmem-card.flipped、.lmem.zoom）
            el.addEventListener('click', (e) => {
                const b = e.target.closest('.lmem-tc');
                if (b && !sent && !el.classList.contains('chosen')) {
                    const i = +b.dataset.i;
                    // 量好再動：牌（不含底下那行字）的中心移到整層的中心，放大到約六成畫面高
                    const box = el.querySelector('.lmem-acts-box'), c = b.querySelector('.lmem-tc-in');
                    const re = el.getBoundingClientRect(), rc = c.getBoundingClientRect(), rb = box.getBoundingClientRect();
                    const cx = re.left + re.width / 2, cy = re.top + re.height / 2;
                    const s = Math.max(1, Math.min(2.4, re.height * 0.62 / (rc.height || 1), re.width * 0.5 / (rc.width || 1)));
                    // 縮放中心定在牌的正中間，移動量就是兩個中心的差
                    const ox = rc.left + rc.width / 2, oy = rc.top + rc.height / 2;
                    const tb = b.getBoundingClientRect();
                    b.style.transformOrigin = (ox - tb.left).toFixed(1) + 'px ' + (oy - tb.top).toFixed(1) + 'px';
                    el.classList.add('chosen'); b.classList.add('pick', 'up');
                    b.style.transform = 'translate(' + (cx - ox).toFixed(1) + 'px,' + (cy - oy).toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';
                    // 鏡頭的中心＝畫面正中間（牌已經走到那裡）
                    if (rb.width && rb.height) box.style.transformOrigin = ((cx - rb.left) / rb.width * 100).toFixed(2) + '% ' + ((cy - rb.top) / rb.height * 100).toFixed(2) + '%';
                    play('flip', .85);
                    setTimeout(() => {
                        if (_actsEl !== el) return;
                        el.classList.add('zoom');
                        play('zoom', .8);
                        setTimeout(() => { if (_actsEl === el) pick(o.choices[i], (o.cards || [])[i]); }, 1150);
                    }, 1150);
                    return;
                }
                if (e.target.closest('.lmem-acts-go')) { pick(inp.value); return; }
                if (e.target.closest('[data-x="leave"]') && !sent) { sent = true; o.onLeave(); }
            });
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); pick(inp.value); } });
        }
        host.appendChild(el);
        _actsEl = el;
        requestAnimationFrame(() => { if (_actsEl === el) el.classList.add('on'); });
    }

    // ── 外傳演完回到吧檯的收尾（11-26：以前演完會突然跳回吧檯，很突兀）──
    //   空桌面上那張牌正面朝上停在面前 → 翻回背面，浮出牌面抽的那句「後來」→ 紫薇一句（字幕）→ 牌滑向右邊的回憶展示櫃 → 暗掉回吧檯。
    //   不叫模型；點畫面任何地方直接收進展示櫃。紫薇的話照定稿那幾句的口吻：有距離感、不熱絡（試稿）
    const ZHIWEI_END = ['這一張，我替妳收著。', '記得的人不說，不代表沒發生過。', '他大概從沒跟誰說過這件事。'];
    function _epilogue(rec) {
        if (R || !rec) return;
        _mount();
        const tok = R.tok;
        R.step = 'epi'; R.result = rec;
        R.root.classList.add('end');
        R.q('.lmem-out').classList.add('on');                       // 先全黑，再亮起空桌面
        _setFront(rec);
        R.q('.lmem-name b').textContent = rec.title || '';
        R.q('.lmem-name span').textContent = (rec.name || '') + (rec.when ? '・' + rec.when : '');
        R.q('.lmem-later').textContent = rec.after || '';
        R.q('.lmem-card').classList.add('flipped');                  // 正面朝上
        _aud(A.bgm).then(u => { if (R && R.tok === tok) { R.bgm.src = u; R.bgm.play().catch(() => {}); R.bgmGoal = BGM.full; } }).catch(() => {});
        _aud(A.chime).then(u => { if (R && R.tok === tok) R.chime.src = u; }).catch(() => {});
        _aud(A.flip).then(u => { if (R && R.tok === tok) R.flip.src = u; }).catch(() => {});
        _later(() => { R.q('.lmem-out').classList.remove('on'); R.live = true; R.endAt = performance.now(); }, 120);
        if (rec.after) {
            _later(() => { R.q('.lmem-card').classList.remove('flipped'); _sfx(R.flip); try { R.chime.currentTime = 0; R.chime.play().catch(() => {}); } catch (e) {} }, 1700);
            _later(() => R.q('.lmem-later').classList.add('on'), 2300);
        }
        const at = rec.after ? 3400 : 1900;
        _later(() => { const s = R.q('.lmem-sub'); s.classList.add('low'); s.textContent = ZHIWEI_END[Math.floor(Math.random() * ZHIWEI_END.length)]; s.classList.add('on'); }, at);
        _later(() => _stow(), at + 4200);
    }
    function _stow() {
        if (!R || R.step !== 'epi') return;
        R.step = 'stow';
        R.q('.lmem-sub').classList.remove('on');
        R.root.classList.add('stow');
        _later(() => { R.q('.lmem-out').classList.add('on'); R.bgmGoal = 0; }, 900);
        _later(() => close(), 2300);
    }

    function _onClick(e) {
        if (!R) return;
        if (R.step === 'epi' && !e.target.closest('[data-act="close"]')) { _stow(); return; }
        const fc = e.target.closest('.lmem-fc');
        if (fc) { _selfPick(fc); return; }
        const b = e.target.closest('[data-act], .lmem-who, .lmem-keep');
        if (!b) return;
        if (b.classList.contains('lmem-who')) { const p = R.people && R.people[+b.dataset.i]; if (p && R.step === 'pick') { if (p.fresh && p.fresh.length) _toDraw(p); else _pickOff(p); } return; }
        if (b.classList.contains('lmem-keep')) { if (R.step === 'shelf') _shelfPick(+b.dataset.i); return; }
        const act = b.dataset.act;
        if (act === 'self') _toSelf();
        else if (act === 'self-go') _selfGo();
        else if (act === 'self-flip') _selfFlip();
        else if (act === 'self-ask') _selfAsk();
        else if (act === 'self-more') _selfMore();
        else if (act === 'self-again') _selfAgain();
        else if (act === 'pick') _toPick();
        else if (act === 'shelf') _toShelf();
        else if (act === 'replay' || act === 'resume') _fromShelf(act);
        else if (act === 'drop') _dropCard();
        else if (act === 'later') _leave();
        else if (act === 'back') _backToWait();
        else if (act === 'skip') _skip();
        else if (act === 'enter') { if (R.step === 'flipped') _enter(); }
        else if (act === 'close') close();
    }

    function close(opt) {
        if (!R) return;
        const r = R; R = null;
        r.tok++;
        r.timers.forEach(clearTimeout); clearInterval(r.volTimer); cancelAnimationFrame(r.raf);
        [r.bgm, r.askVoice, r.chime, r.leave, r.flip].forEach(a => { try { a.pause(); a.src = ''; } catch (e) {} });
        Object.keys(r.v).forEach(k => { try { r.v[k].pause(); r.v[k].removeAttribute('src'); r.v[k].load(); } catch (e) {} });
        if (r.speckUrl) try { URL.revokeObjectURL(r.speckUrl); } catch (e) {}
        try { r.root.remove(); } catch (e) {}
        // 要去播回憶的話大廳音樂不接回（VN 自己有）；回大廳時 resumeLobbyActivity 會接
        if (r.lobbyBgm && !(opt && opt.toVn)) try { r.lobbyBgm.play().catch(() => {}); } catch (e) {}
    }

    const api = { open, close, isOpen: () => !!R, epilogue: _epilogue, youngSprite, lifeHas, lifeAsk, lifeMake };   // life*：角色卡「想靠近」替他排過去年表（vn_core_stage.js 的 _pickLean）   // youngSprite(名字)：舞台問這個人現在是不是小時候、放哪張   // epilogue(抽過的那筆)：之後回憶清單重看收尾也走這支
    window.LobbyMemory = api;
    try { if (win !== window) win.LobbyMemory = api; } catch (e) {}
})();
