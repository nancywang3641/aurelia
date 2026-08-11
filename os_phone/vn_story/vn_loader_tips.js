// ----------------------------------------------------------------
// [檔案] vn_loader_tips.js — 開場 Loading 的世界觀小提示（零 API）
// 路徑：os_phone/vn_story/vn_loader_tips.js
// 職責：從這局所在的視差世界檔案裡切出可以印在 loading 上的短句，交給校準艙輪播。
//       只負責「給我一批句子」，畫面與輪播是 vn_loader_chamber 的事。
//
// 為什麼不叫模型生：世界門展開一次已經跑掉好幾分鐘與好幾支 API，提示不該再燒一支；
//   而且切句是純前端的，展開在這功能之前的舊世界一樣吃得到。
//
// 🚨 節名是模型當場寫出來的，序號與用詞都會變 → 絕不能綁「第五節」這種位置。
//    改成比對標題行的關鍵詞，而且先判黑名單。
// 🚨 劇透守門：勢力的「真正想要的」、核心人物的「掌握的秘密／最害怕失去什麼」是玩家
//    自己該挖出來的底牌，印在 loading 上等於開局先爆雷 → 那幾節整段不收。
// 🚨 跨卡守衛：沒進視差就沒有世界檔案，回空陣列。別人的角色卡一個字都不碰。
// ----------------------------------------------------------------
(function () {
    if (window.VN_LoaderTips) return;

    const BOOK_PARA = '【奧瑞亞-視差】';
    const ENTRY_PREFIX = '【世界檔案-';

    // 🚨 三層判定，因為節名是模型當場取的、白名單永遠追不上它的創意：
    //    ①命中 DENY → 整段丟 ②命中 ALLOW → 整段收 ③兩邊都沒中 → 只收條列項與引號短句。
    //    第③層是重點：一份把「社會常識」寫成「風土人情」的世界檔案，靠白名單會整節消失，
    //    只剩物價那節有東西——提示看起來就變成一本價目表。散文段落在這層不切，
    //    因為沒被 DENY 認出來的節最可能是人物或勢力，條列項相對安全。
    const DENY = /總覽|地圖|降生|初始|勢力|邦交|人物|角色|要角|NPC|名人|正史|歷史|紀元|事件|自己在轉|機會|麻煩|旅人|同行|幕後|秘密|陰謀|伏筆|劇情|任務|委託|離開這個世界|帶走/i;
    const ALLOW = /社會|常識|禮儀|禁忌|俗諺|諺語|規矩|風俗|習俗|風土|人情|民情|日常|生活|起居|飲食|經濟|物價|貨幣|行情|交易|市集|階級|身分|法律|刑罰|職業|行當|信仰|宗教|語言|行話|稱呼|須知|指南|生存/;

    // 寫給主持 AI 的話、或指涉檔案本身的句子，玩家看了只會出戲
    const META = /玩家|主持|模型|世界檔案|不得混入|題材|如下|見下|上述|前者|後者|第[一二三四五六七八九十]節/;
    // 句子級的底牌守門：節名沒攔住的話，這道還能擋。誤殺要小心——「實際上堵塞了孔道」是好提示，
    // 所以只擋明確在講內幕的說法，不擋一般轉折詞。
    const SPOILER = /真正想要|真正的目的|真實身分|掌握的秘密|不為人知|最害怕|底牌|暗中|私下|內鬥|暗鬥|背叛|其實是/;
    // 承接句抽出來就變孤兒（「他因此……」是誰？）→ 開頭是這些字一律丟
    const ORPHAN = /^(其中|這|那|此|他|她|它|牠|因此|所以|但|不過|而且|另外|此外|同時|於是|然後|例如|比如|至於|反之|否則)/;

    // 中文字數。太短沒資訊；上限抓兩行印得下的量——設 46 時「導流孔刺痛而不是微癢＝飛太低了」
    // 這種最像遊戲提示的長句剛好差一點被濾掉，52 才收得到。
    const MIN = 12, MAX = 52;

    // 一次 loading 只播得完四五條，每次都從頭洗牌重挑的話，同一條隔幾局又跳出來——
    // 玩家的體感是「怎麼一直是這句」。記住最近看過的，下次排到後面去。
    const RECENT_KEY = 'vn_loader_tips_recent';
    const RECENT_MAX = 24;      // 池子通常四五十條，記一半左右：夠新鮮，又不會把整池排空

    let _cache = null;          // { key, raw, groups }
    let _recent = null;

    function _key(s) { return String(s).replace(/[，。、！？：:（）()\s]/g, ''); }

    function _recentList() {
        if (_recent) return _recent;
        try {
            const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
            _recent = Array.isArray(v) ? v : [];
        } catch (e) { _recent = []; }
        return _recent;
    }

    // 顯示端每印一條就回報一次
    function seen(tip) {
        if (!tip) return;
        const k = _key(tip);
        const r = _recentList().filter(x => x !== k);
        r.push(k);
        while (r.length > RECENT_MAX) r.shift();
        _recent = r;
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch (e) {}
    }

    function _th() {
        return window.TavernHelper || (window.parent && window.parent.TavernHelper) || null;
    }

    function _len(s) { return [...String(s)].length; }

    // markdown 記號剝乾淨；條列符號一併去掉（條列項本身就是一條提示）
    function _clean(s) {
        return String(s == null ? '' : s)
            .replace(/^\s*[-–—•*+]\s+/, '')
            .replace(/\*\*/g, '')
            .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
            .replace(/[`_~]+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // 依標題行切段。她們的檔案是 ## 一、社會常識 這種寫法，但沒有 # 的純粗體標題也收得到
    function _sections(text) {
        const secs = [];
        let cur = { title: '', body: [] };
        secs.push(cur);
        String(text == null ? '' : text).split(/\r?\n/).forEach(raw => {
            const line = raw.replace(/\s+$/, '');
            const m = /^\s*#{1,6}\s*(.+)$/.exec(line);
            if (m) { cur = { title: _clean(m[1]), body: [] }; secs.push(cur); return; }
            cur.body.push(line);
        });
        return secs.map(s => ({ title: s.title, body: s.body.join('\n') }));
    }

    // 段落開頭的分類標籤（「禁忌：」「危險徵兆：」）剝掉，只留正文。
    // 🚨 但物價那種「一晚吊鋪（老鉚釘客棧）：一核」整行就是一條提示，剝掉冒號前面等於把它毀了——
    //    所以只在「冒號後面還有完整句子（帶句號）」時才當標籤剝。
    function _stripLabel(p) {
        const m = /^([^：:\n]{1,14})[：:]\s*(.+)$/.exec(p);
        if (!m) return p;
        const rest = m[2];
        return (/[。！？]/.test(rest) && _len(rest) >= MIN) ? rest : p;
    }

    function _splitSentences(p) {
        const parts = String(p).split(/([。！？])/);
        const out = [];
        for (let i = 0; i < parts.length; i += 2) {
            const s = ((parts[i] || '') + (parts[i + 1] || '')).trim();
            if (s) out.push(s);
        }
        return out;
    }

    function _usable(s) {
        if (!s) return false;
        const n = _len(s);
        if (n < MIN || n > MAX) return false;
        if (META.test(s)) return false;
        if (SPOILER.test(s)) return false;
        if (ORPHAN.test(s)) return false;
        if (/^[（(【\[]/.test(s)) return false;         // 補述括號開頭的殘句
        if (!/[一-龥]/.test(s)) return false;   // 沒中文＝多半是殘留的記號行
        return true;
    }

    // 行首就是引號的短句＝俗諺（「翅膀乾淨的人不怕風」——意為問心無愧者不怕檢查），整行收
    function _quoted(line) {
        return /^[「『"“][^」』"”]{2,24}[」』"”]/.test(line) ? [line] : [];
    }

    // 世界檔案正文 → 依段落分組的提示池。分組是為了之後交錯輪播，不然同一節的句子會連著出現。
    function extractGroups(text) {
        const dedupe = new Set(), groups = [];
        _sections(text).forEach(sec => {
            if (!sec.title) return;                 // 頁首那幾行（世界名／一句話／核心法則）不當提示
            if (DENY.test(sec.title)) return;
            const mode = ALLOW.test(sec.title) ? 'full' : 'item';
            const tips = [];
            sec.body.split(/\n/).forEach(rawLine => {
                const isItem = /^\s*[-–—•*+]\s+/.test(rawLine);
                const line = _clean(rawLine);
                if (!line) return;
                // 條列項整行收（「一晚吊鋪：一核」拆句就沒意義了）；散文段落只有認得的節才切句
                const cands = isItem ? [line]
                    : (mode === 'full' ? _splitSentences(_stripLabel(line)) : _quoted(line));
                cands.forEach(c => {
                    const s = c.trim();
                    if (!_usable(s)) return;
                    const k = _key(s);
                    if (dedupe.has(k)) return;
                    dedupe.add(k);
                    tips.push(s);
                });
            });
            if (tips.length) groups.push({ title: sec.title, mode, tips });
        });
        return groups;
    }

    function _shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    // 各節輪流出一條（每輪連節的順序都重洗）。純粹全部洗在一起的話，條數多的那節會連著中，
    // 玩家看三條全是價目表，體感就是「這東西只會講物價」。
    function _interleave(groups) {
        const pools = groups.map(g => _shuffle(g.tips.slice())).filter(p => p.length);
        const out = [];
        while (pools.length) {
            _shuffle(pools.slice()).forEach(p => {
                const v = p.pop();
                if (v !== undefined) out.push(v);
            });
            for (let i = pools.length - 1; i >= 0; i--) if (!pools[i].length) pools.splice(i, 1);
        }
        return out;
    }

    // 最近看過的整批排到後面（順序內部仍是交錯的）。池子小於記憶量時最多退化成原本的隨機，不會變空。
    function _freshFirst(list) {
        const rec = new Set(_recentList());
        const fresh = [], old = [];
        list.forEach(t => (rec.has(_key(t)) ? old : fresh).push(t));
        return fresh.concat(old);
    }

    // 對外仍給一條平順的最終順序（除錯用；正式路徑走 load()）
    function extract(text) { return _interleave(extractGroups(text)); }

    // 撈這局的世界檔案條目。撤離時條目會被刪掉，所以「撈得到」本身就代表人還在世界裡。
    async function _entryText() {
        try {
            if (!window.AURELIA_WORLDGATE || !window.AURELIA_WORLDGATE.isInParallax()) return null;
            const TH = _th();
            if (!TH || typeof TH.getLorebookEntries !== 'function') return null;
            const entries = await TH.getLorebookEntries(BOOK_PARA);
            const hit = (entries || []).filter(e =>
                e && e.enabled !== false && typeof e.comment === 'string' && e.comment.indexOf(ENTRY_PREFIX) === 0);
            if (!hit.length) return null;
            // 理論上同時只會有一條（DIVE 寫、撤離刪）；真的有殘留就取內容最長的那條
            hit.sort((a, b) => String(b.content || '').length - String(a.content || '').length);
            return { key: hit[0].comment, text: String(hit[0].content || '') };
        } catch (e) {
            console.warn('[LoaderTips] 讀世界檔案失敗，這次不顯示提示', e);
            return null;
        }
    }

    // 回傳交錯過的提示；沒有世界檔案／切不出東西就回空陣列（呼叫端負責整條不顯示，不硬塞）
    // 🚨 每次 load 都重新交錯：快取只留分組結果，順序不快取，不然每局開頭都是同幾條。
    async function load() {
        const src = await _entryText();
        if (!src) return [];
        if (_cache && _cache.key === src.key && _cache.raw === src.text.length) return _freshFirst(_interleave(_cache.groups));
        const groups = extractGroups(src.text);
        _cache = { key: src.key, raw: src.text.length, groups };
        // 哪一節被收、收了幾條、用哪種收法都印出來：換一個世界如果提示變單調，看這行就知道是哪節被跳過
        console.log('[LoaderTips] 《' + src.key.replace(/^【世界檔案-|】$/g, '') + '》共 '
            + groups.reduce((n, g) => n + g.tips.length, 0) + ' 條 ← '
            + (groups.map(g => g.title + '(' + g.tips.length + (g.mode === 'item' ? '/僅條列' : '') + ')').join('、') || '無'));
        return _freshFirst(_interleave(groups));
    }

    function invalidate() { _cache = null; }

    window.VN_LoaderTips = { load, invalidate, seen, extract, extractGroups };
    console.log('📜 [VN LoaderTips] 世界觀提示切句器就緒');
})();
