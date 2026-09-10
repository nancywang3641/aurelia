// ----------------------------------------------------------------
// [檔案] wx_cards.js — 紅包／禮物／轉帳的狀態，一個聊天室一本帳
// 路徑：os_phone/wx/wx_cards.js
//
// 🚨🚨為什麼要有這一支：舊做法是把「已領取／已接收」寫在 localStorage 最外層，
//    鍵名就是模型隨手編的那串單號（ID_Gft_999、wx_transfer_Txn_88、wx_redpacket_rp_001）。
//    那串字是模型寫的，不保證唯一也不保證換一次對話就換一個：
//      ・清空聊天只清訊息，狀態原封不動 → 重測時卡片一出現就是「已接收」（Rae 實測）
//      ・不同聊天室用到同一個單號 → 共用同一份狀態
//      ・程式自己補的 ID 只有三位數（rp_000~rp_999），撞到既有的還會直接繼承舊紅包的資料
//      ・每張卡一個鍵，永遠不刪 → 一路累積到 localStorage 的上限
//
// 現在：每個聊天室一本帳（一個 localStorage 鍵），帳裡每張卡有程式發的 key（c1、c2…）。
//    模型寫的單號只當「別名」用來查找，查不到就退回「最近一張還沒處理的」。
//    群聊裡 A 發一個 B 發一個、同一人連發兩個同金額的，都是不同的卡，天然分得開。
//
// 為什麼帳本不直接掛在 chat 物件上：跑團同步那條路每次都從酒館正文整份重建訊息，
//    掛在物件上會被沖掉。存成一室一鍵，兩種模式都保得住，清空時也只要刪一個鍵。
//
// 暴露：window.WX_CARDS
// ----------------------------------------------------------------
(function () {
    'use strict';
    console.log('[WeChat] 載入卡片狀態帳本 (wx_cards.js)...');
    const win = window.parent || window;

    const KEY = (chatId) => 'wx_cards_' + (chatId || 'unknown');
    const KINDS = ['redpacket', 'gift', 'transfer'];

    function load(chatId) {
        try {
            const raw = localStorage.getItem(KEY(chatId));
            const b = raw ? JSON.parse(raw) : null;
            if (!b || !Array.isArray(b.list)) return { seq: 0, list: [] };
            return { seq: Number(b.seq) || 0, list: b.list };
        } catch (e) { return { seq: 0, list: [] }; }
    }
    function save(chatId, book) {
        try { localStorage.setItem(KEY(chatId), JSON.stringify(book)); return true; }
        catch (e) { console.warn('[WX_CARDS] 存不進去（空間可能滿了）', e); return false; }
    }

    // 模型寫的單號拿來比對前先正規化：大小寫、前後空白、ID_ 前綴都不算數
    const norm = (s) => String(s == null ? '' : s).trim().replace(/^ID_/i, '').toLowerCase();

    const API = {
        KINDS,
        load, save,
        clear(chatId) { try { localStorage.removeItem(KEY(chatId)); } catch (e) {} },

        // 發一張卡。alias 是模型寫的單號（可有可無）。
        // 同一個別名如果已經有一張「還沒處理完」的，視為同一張（模型常在同一輪重複提到同一個紅包）；
        // 已經處理完的就另開一張——同一個人連發兩個同單號的紅包是兩件事。
        attach(chatId, kind, alias, data) {
            const book = load(chatId);
            const a = norm(alias);
            if (a) {
                const live = book.list.find(c => c.kind === kind && norm(c.alias) === a && c.status === 'pending');
                if (live) return live;
            }
            book.seq += 1;
            const card = {
                key: 'c' + book.seq,
                seq: book.seq,
                kind,
                alias: String(alias == null ? '' : alias).trim(),
                status: 'pending',
                at: Date.now(),
                data: data || {}
            };
            book.list.push(card);
            save(chatId, book);
            return card;
        },

        // 找一張卡。ref 可以是模型寫的單號、程式發的 key、或「3」「#3」「3號」這種序號。
        // 都對不上就退回「最近一張還沒處理完的」——模型指涉不清時，指的幾乎都是剛剛那張。
        find(chatId, kind, ref) {
            const book = load(chatId);
            const mine = book.list.filter(c => c.kind === kind);
            if (!mine.length) return null;
            const r = norm(ref);
            if (r) {
                const byAlias = mine.filter(c => norm(c.alias) === r);
                if (byAlias.length) return byAlias.find(c => c.status === 'pending') || byAlias[byAlias.length - 1];
                const byKey = mine.find(c => norm(c.key) === r);
                if (byKey) return byKey;
                const m = r.match(/^#?(\d+)\s*(?:號|号)?$/);
                if (m) { const bySeq = mine.find(c => c.seq === Number(m[1])); if (bySeq) return bySeq; }
            }
            const pending = mine.filter(c => c.status === 'pending');
            return pending.length ? pending[pending.length - 1] : null;
        },

        // 只認單號，對不上就是沒有。畫卡片時用這個——退回「最近一張」會把別人的紅包認成自己的。
        findByAlias(chatId, kind, alias) {
            const a = norm(alias);
            if (!a) return null;
            const mine = load(chatId).list.filter(c => c.kind === kind && norm(c.alias) === a);
            if (!mine.length) return null;
            return mine.find(c => c.status === 'pending') || mine[mine.length - 1];
        },

        // 畫卡片時用：這張卡在帳本裡就拿出來，不在就開一張。
        // 每次重畫都會經過這裡，所以一定要走嚴格比對，不然重畫一次就多一張。
        findOrAttach(chatId, kind, alias, data) {
            return this.findByAlias(chatId, kind, alias) || this.attach(chatId, kind, alias, data);
        },

        // 同上，但第一次見到這張卡時把舊世界的狀態接過來（legacyStatus 傳舊的全域鍵讀到的值）。
        // 遷移就發生在畫卡片的那一刻——只有真的出現在畫面上的卡才需要狀態，
        // 不必先跑一輪全量搬家，也不會把別室的東西拖進來。
        adopt(chatId, kind, alias, data, legacyStatus) {
            const found = this.findByAlias(chatId, kind, alias);
            if (found) return found;
            const card = this.attach(chatId, kind, alias, data);
            if (legacyStatus && legacyStatus !== 'pending') {
                return this.update(chatId, card.key, { status: String(legacyStatus) }) || card;
            }
            return card;
        },

        // 刪掉指定單號的那幾張（刪部分訊息時用；整室清空直接 clear）
        removeByAliases(chatId, aliases) {
            const set = new Set((aliases || []).map(norm).filter(Boolean));
            if (!set.size) return 0;
            const book = load(chatId);
            const before = book.list.length;
            book.list = book.list.filter(c => !set.has(norm(c.alias)));
            const n = before - book.list.length;
            if (n) save(chatId, book);
            return n;
        },

        get(chatId, key) { return load(chatId).list.find(c => c.key === key) || null; },

        // 改狀態／改內容。傳 patch 進來合併進 data。
        update(chatId, key, patch) {
            const book = load(chatId);
            const card = book.list.find(c => c.key === key);
            if (!card) return null;
            if (patch && patch.status) card.status = patch.status;
            if (patch && patch.data) card.data = Object.assign({}, card.data, patch.data);
            save(chatId, book);
            return card;
        },

        // 還沒處理完的（要給模型看的清單就是這個，通常 0~2 張）
        pending(chatId, kind) {
            return load(chatId).list.filter(c => c.status === 'pending' && (!kind || c.kind === kind));
        },

        // 🚨舊資料搬家：把散在 localStorage 最外層那些搬進這個聊天室的帳本。
        //    只搬「這個聊天室的訊息裡真的提到過」的單號，不然會把別室的狀態也拖進來。
        //    搬完不刪舊鍵（別的聊天室可能還在用同一個單號），改由清空／刪訊息那條路去清。
        migrate(chatId, messages) {
            const book = load(chatId);
            if (book.migrated) return 0;
            let n = 0;
            const seen = new Set();
            (messages || []).forEach(m => {
                const text = String((m && (m.content || m.raw)) || '');
                const ids = text.match(/(?:Gft|Gift|rp|RedPacket|Txn|Tnx|Transfer)[_-][A-Za-z0-9_]+/gi) || [];
                ids.forEach(id => {
                    if (seen.has(id)) return;
                    seen.add(id);
                    const lower = id.toLowerCase();
                    const kind = /^(?:rp|redpacket)/.test(lower) ? 'redpacket'
                        : /^(?:gft|gift)/.test(lower) ? 'gift' : 'transfer';
                    let status = 'pending', data = {};
                    try {
                        const st = localStorage.getItem('ID_' + id);
                        if (st) status = st;
                        const rp = localStorage.getItem('wx_redpacket_' + id);
                        if (rp) data = Object.assign(data, JSON.parse(rp));
                        const tx = localStorage.getItem('wx_transfer_' + id);
                        if (tx) { const t = JSON.parse(tx); data = Object.assign(data, t); if (t.status) status = t.status; }
                    } catch (e) {}
                    if (book.list.some(c => norm(c.alias) === norm(id))) return;
                    book.seq += 1;
                    book.list.push({ key: 'c' + book.seq, seq: book.seq, kind, alias: id, status, at: Date.now(), data });
                    n++;
                });
            });
            book.migrated = true;
            save(chatId, book);
            if (n) console.log('[WX_CARDS] ' + chatId + ' 搬進 ' + n + ' 張舊卡');
            return n;
        }
    };

    win.WX_CARDS = API;
    window.WX_CARDS = API;
})();
