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

    // 命中就整段丟（先判）：底牌、劇情鉤子、以及對正在玩的人來說是廢話的開場說明
    const DENY = /總覽|地圖|降生|初始|勢力|邦交|人物|正史|歷史|紀元|自己在轉|機會|麻煩|旅人|同行|離開這個世界/;
    // 命中才收：常識、規矩、物價這種「短、實用、有世界味」的段落，正是 loading 提示要的東西
    const ALLOW = /社會|常識|禮儀|禁忌|俗諺|諺語|規矩|風俗|日常|生活|經濟|物價|貨幣|行情|階級|法律|職業|信仰/;

    // 寫給主持 AI 的話、或指涉檔案本身的句子，玩家看了只會出戲
    const META = /玩家|主持|模型|世界檔案|不得混入|題材|如下|見下|上述|前者|後者|第[一二三四五六七八九十]節/;
    // 承接句抽出來就變孤兒（「他因此……」是誰？）→ 開頭是這些字一律丟
    const ORPHAN = /^(其中|這|那|此|他|她|它|牠|因此|所以|但|不過|而且|另外|此外|同時|於是|然後|例如|比如|至於|反之|否則)/;

    // 中文字數。太短沒資訊；上限抓兩行印得下的量——設 46 時「導流孔刺痛而不是微癢＝飛太低了」
    // 這種最像遊戲提示的長句剛好差一點被濾掉，52 才收得到。
    const MIN = 12, MAX = 52;

    let _cache = null;          // { key, tips }

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
        if (ORPHAN.test(s)) return false;
        if (/^[（(【\[]/.test(s)) return false;         // 補述括號開頭的殘句
        if (!/[一-龥]/.test(s)) return false;   // 沒中文＝多半是殘留的記號行
        return true;
    }

    // 世界檔案正文 → 提示池
    function extract(text) {
        const seen = new Set(), tips = [];
        _sections(text).forEach(sec => {
            if (!sec.title || DENY.test(sec.title) || !ALLOW.test(sec.title)) return;
            sec.body.split(/\n/).forEach(rawLine => {
                const isItem = /^\s*[-–—•*+]\s+/.test(rawLine);
                const line = _clean(rawLine);
                if (!line) return;
                // 條列項整行收（「一晚吊鋪：一核」拆句就沒意義了）；段落才切句
                const cands = isItem ? [line] : _splitSentences(_stripLabel(line));
                cands.forEach(c => {
                    const s = c.trim();
                    if (!_usable(s)) return;
                    const k = s.replace(/[，。、！？：:（）()\s]/g, '');
                    if (seen.has(k)) return;
                    seen.add(k);
                    tips.push(s);
                });
            });
        });
        return tips;
    }

    function _shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

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

    // 回傳洗過牌的提示；沒有世界檔案／切不出東西就回空陣列（呼叫端負責整條不顯示，不硬塞）
    async function load() {
        const src = await _entryText();
        if (!src) return [];
        if (_cache && _cache.key === src.key && _cache.raw === src.text.length) return _shuffle(_cache.tips.slice());
        const tips = extract(src.text);
        _cache = { key: src.key, raw: src.text.length, tips };
        console.log('[LoaderTips] 從《' + src.key.replace(/^【世界檔案-|】$/g, '') + '》切出 ' + tips.length + ' 條提示');
        return _shuffle(tips.slice());
    }

    function invalidate() { _cache = null; }

    window.VN_LoaderTips = { load, invalidate, extract };
    console.log('📜 [VN LoaderTips] 世界觀提示切句器就緒');
})();
