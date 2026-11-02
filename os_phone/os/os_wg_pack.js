// ----------------------------------------------------------------
// [檔案] os_wg_pack.js
// 路徑：os_phone/os/os_wg_pack.js
// 職責：🧳 從視差世界撤離前的「回程行李」頁，跟收下來的東西放去哪（10-30 她說好的，11-02 定細節）。
//   撤離前跳一頁：這一趟拿到的東西每件選「不帶／留紀念／換 PT」，同行旅人可以勾「留聯絡」；都不選也能直接走。
//   ・留紀念＝收進紀念品清單（帶道具圖的縮圖），「我的家」布置房間時可以當包裹擺出來（os_landlord_room.js）
//   ・換 PT＝交給白兔先生，交易所「戰利品估值」那張卡估價入帳（os_pt.js 的 addLoot／evaluateLootPT）
//   ・留聯絡＝加進聊天 app 通訊錄，人設寫他在奧瑞亞是誰、跟她一起去過哪個世界
//   世界書寫明那個世界的東西帶不回奧瑞亞：實物留在那邊，帶回來的是照片、紀錄或錢。
//   這頁不叫模型。資料由世界門給（os_worldgate.js 的 _leaveWorld：這趟的 [Item|…]、入隊的旅人），
//   這裡只畫頁面、收她選的，撤離成功後再寫進各自的地方（settle）。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const d = win.document;
    const APP_ID = 'wg_pack';
    const K_SOUV = 'souvenirs';   // [{id,name,desc,look,world,thumb,at}] 跨聊天室（她的家只有一間）

    function _db() { return win.OS_DB || window.OS_DB; }
    function _VC() { return win.VN_Cache || window.VN_Cache; }
    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function _toast(msg) { try { const A = win.AUI || window.AUI; if (A && A.toast) A.toast(msg); } catch (e) {} }

    async function souvenirs() {
        try { const db = _db(); const v = db && db.getAppData ? await db.getAppData(APP_ID, K_SOUV) : null; return Array.isArray(v) ? v : []; }
        catch (e) { return []; }
    }

    // 道具圖（劇情彈窗生過的那張，VN_Cache item_cache）／旅人頭像（avatar_cache）。沒生過就回空字串
    async function _itemUrl(name) {
        try { const rec = await _VC().get('item_cache', name); return (rec && rec.url && !String(rec.url).startsWith('blob:')) ? rec.url : ''; }
        catch (e) { return ''; }
    }
    async function _faceUrl(name) {
        try { const V = _VC(); const rec = await V.get('avatar_cache', name); return V.headOf ? V.headOf(rec) : ((rec && rec.url) || ''); }
        catch (e) { return ''; }
    }
    // 紀念品只存縮圖：清單是跨世界一直累積的，整張道具圖存進去幾件就很大（聊天室刪掉時原圖也會跟著被清）
    function _thumb(url, max) {
        return new Promise(res => {
            if (!url) { res(''); return; }
            const im = new Image();
            im.onload = () => {
                try {
                    const k = Math.min(1, (max || 160) / Math.max(im.naturalWidth || 1, im.naturalHeight || 1));
                    const c = d.createElement('canvas');
                    c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
                    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
                    res(c.toDataURL('image/webp', 0.82));
                } catch (e) { res(''); }
            };
            im.onerror = () => res('');
            im.src = url;
        });
    }
    async function _blobOf(url) {
        try { return await (await fetch(url)).blob(); } catch (e) { return null; }
    }

    function _helpBtn() {
        const A = win.AUI || window.AUI;
        if (!A || !A.registerHelp || !A.helpBtn) return '';
        A.registerHelp({ wg_pack: { title: '回程行李', body:
            '那個世界的東西帶不回奧瑞亞，實物都會留在那邊。每件可以選：\n\n' +
            '留紀念：帶回它的照片和紀錄。在「我的家」按「布置這間房」，可以把它當包裹擺進房裡。\n\n' +
            '換 PT：交給白兔先生收購。到交易所的「戰利品估值」按一下，他估好價就入帳。\n\n' +
            '不帶：就留在那個世界。\n\n' +
            '同行旅人按「留聯絡」：回奧瑞亞後他會在聊天 app 的通訊錄裡，可以傳訊息給他。\n\n' +
            '全部不選也可以直接出發。' } });
        return A.helpBtn('wg_pack');
    }

    // 回程行李頁。opts：{ world, items:[{name,desc,look}], travelers:[旅人物件] }
    //   回 Promise：出發＝{ items:[{name,desc,look,mode:'keep'|'pt'}], contacts:[旅人物件] }；再待一下＝null
    function open(opts) {
        const o = opts || {};
        const items = (o.items || []).filter(x => x && x.name);
        const trav = (o.travelers || []).filter(t => t && t.name);
        d.getElementById('wgpk')?.remove();
        const mode = items.map(() => '');
        const keep = trav.map(() => false);
        const ov = d.createElement('div');
        ov.id = 'wgpk';
        ov.className = 'wgpk';
        const itemRows = items.length
            ? items.map((it, i) =>
                '<div class="wgpk-row" data-i="' + i + '">' +
                  '<span class="wgpk-thumb"><i class="fa-solid fa-box"></i></span>' +
                  '<div class="wgpk-tx"><b>' + _esc(it.name) + '</b>' + (it.desc ? '<small>' + _esc(it.desc) + '</small>' : '') + '</div>' +
                  '<div class="wgpk-seg" role="radiogroup" aria-label="' + _esc(it.name) + '">' +
                    '<button type="button" class="on" data-m="" aria-pressed="true">不帶</button>' +
                    '<button type="button" data-m="keep" aria-pressed="false">留紀念</button>' +
                    '<button type="button" data-m="pt" aria-pressed="false">換 PT</button>' +
                  '</div>' +
                '</div>').join('')
            : '<div class="wgpk-empty">這一趟沒拿到東西。</div>';
        const travRows = trav.length
            ? trav.map((t, i) =>
                '<div class="wgpk-row" data-t="' + i + '">' +
                  '<span class="wgpk-thumb face">' + _esc(String(t.name).slice(0, 1)) + '</span>' +
                  '<div class="wgpk-tx"><b>' + _esc(t.name) + '</b>' + (t.job ? '<small>' + _esc(t.job) + '</small>' : '') + '</div>' +
                  '<button type="button" class="wgpk-tog" aria-pressed="false"><i class="fa-regular fa-address-book"></i>留聯絡</button>' +
                '</div>').join('')
            : '<div class="wgpk-empty">這一趟沒有同行旅人。</div>';
        ov.innerHTML =
            '<div class="wgpk-paper" role="dialog" aria-label="回程行李">' +
              '<div class="wgpk-hd">' +
                '<span class="wgpk-ic"><i class="fa-solid fa-suitcase-rolling"></i></span>' +
                '<div class="wgpk-tt"><b>回程行李</b><small>' + _esc(o.world || '') + '</small></div>' +
                _helpBtn() +
              '</div>' +
              '<div class="wgpk-body">' +
                '<div class="wgpk-sec"><span>這趟拿到的東西</span>' + (items.length ? '<em>' + items.length + ' 件</em>' : '') + '</div>' +
                itemRows +
                '<div class="wgpk-sec"><span>同行旅人</span></div>' +
                travRows +
              '</div>' +
              '<div class="wgpk-ft">' +
                '<button type="button" class="wgpk-btn ghost" data-k="stay">再待一下</button>' +
                '<button type="button" class="wgpk-btn" data-k="go"><i class="fa-solid fa-person-walking-arrow-right"></i>出發</button>' +
              '</div>' +
            '</div>';
        d.body.appendChild(ov);

        ov.querySelectorAll('.wgpk-row[data-i]').forEach(row => {
            const i = +row.dataset.i;
            row.querySelectorAll('.wgpk-seg button').forEach(b => b.addEventListener('click', () => {
                mode[i] = b.dataset.m;
                row.querySelectorAll('.wgpk-seg button').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
            }));
        });
        ov.querySelectorAll('.wgpk-row[data-t]').forEach(row => {
            const i = +row.dataset.t;
            const b = row.querySelector('.wgpk-tog');
            b.addEventListener('click', () => {
                keep[i] = !keep[i];
                b.classList.toggle('on', keep[i]);
                b.setAttribute('aria-pressed', keep[i] ? 'true' : 'false');
                b.innerHTML = keep[i] ? '<i class="fa-solid fa-check"></i>留聯絡' : '<i class="fa-regular fa-address-book"></i>留聯絡';
            });
        });
        // 圖慢慢補上：道具圖、旅人頭像都只讀已經有的，沒有就維持圖示／名字第一個字
        items.forEach((it, i) => _itemUrl(it.name).then(u => {
            const box = u && ov.querySelector('.wgpk-row[data-i="' + i + '"] .wgpk-thumb');
            if (box) { const im = d.createElement('img'); im.alt = ''; im.src = u; box.replaceChildren(im); }
        }));
        trav.forEach((t, i) => _faceUrl(t.name).then(u => {
            const box = u && ov.querySelector('.wgpk-row[data-t="' + i + '"] .wgpk-thumb');
            if (box) { const im = d.createElement('img'); im.alt = ''; im.src = u; box.replaceChildren(im); }
        }));

        return new Promise(resolve => {
            let done = false;
            const finish = r => {
                if (done) return;
                done = true;
                d.removeEventListener('keydown', onKey, true);
                ov.querySelectorAll('img').forEach(im => { im.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; });
                ov.remove();
                resolve(r);
            };
            const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); finish(null); } };
            d.addEventListener('keydown', onKey, true);
            ov.querySelector('[data-k="stay"]').addEventListener('click', () => finish(null));
            ov.querySelector('[data-k="go"]').addEventListener('click', () => finish({
                items: items.map((it, i) => Object.assign({}, it, { mode: mode[i] })).filter(it => it.mode),
                contacts: trav.filter((t, i) => keep[i]),
            }));
        });
    }

    // 撤離成功之後才寫：留紀念進紀念品清單、換 PT 交給白兔、留聯絡加進通訊錄。回 { keep, pt, contacts } 各幾筆
    async function settle(worldName, pack, endName) {
        const out = { keep: 0, pt: 0, contacts: 0 };
        if (!pack) return out;
        const world = String(worldName || '');
        const keepList = (pack.items || []).filter(it => it.mode === 'keep');
        const ptList = (pack.items || []).filter(it => it.mode === 'pt');
        if (keepList.length) {
            try {
                const list = await souvenirs();
                for (const it of keepList) {
                    if (list.some(s => s.world === world && s.name === it.name)) continue;   // 同一個世界同一件已經帶過
                    list.push({ id: 'sv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                        name: String(it.name), desc: String(it.desc || ''), look: String(it.look || ''), world,
                        thumb: await _thumb(await _itemUrl(it.name), 160), at: Date.now() });
                    out.keep++;
                }
                await _db().saveAppData(APP_ID, K_SOUV, list);
            } catch (e) { console.warn('[回程行李] 紀念品沒存成', e); out.keep = 0; }
        }
        if (ptList.length) {
            try {
                const PT = win.OS_PT || window.OS_PT;
                if (PT && PT.addLoot) out.pt = await PT.addLoot(ptList.map(it => ({ name: it.name, desc: it.desc || '', world })));
            } catch (e) { console.warn('[回程行李] 戰利品沒交給白兔', e); }
        }
        for (const t of (pack.contacts || [])) {
            try { if (await _addContact(t, world, endName)) out.contacts++; } catch (e) { console.warn('[回程行李] 通訊錄沒加成', t && t.name, e); }
        }
        return out;
    }

    // 旅人加進聊天 app 通訊錄。人設是寫給聊天模型看的：他在奧瑞亞是誰、跟對方一起去過哪
    //   （視差裡的外觀是那個世界改造過的，不寫；頭像先用那趟的臉，她要換自己換）
    async function _addContact(t, world, endName) {
        const C = win.WX_CONTACTS || window.WX_CONTACTS;
        if (!C || !C.addContactToStorage || !C.getAllCustomContacts) return false;
        const name = String(t.name || '').trim();
        if (!name) return false;
        if (C.getAllCustomContacts().some(c => c && !c.isGroup && (c.name === name || c.realName === name))) return false;   // 已經有這個人：不另開一個
        const persona = name + (t.age ? '，' + t.age + ' 歲' : '') + (t.job ? '，在奧瑞亞的工作是' + t.job : '') + '。' +
            (t.persona ? '\n性格：' + t.persona : '') + (t.origin ? '\n來歷：' + t.origin : '') + (t.skill ? '\n擅長：' + t.skill : '') +
            '\n不久前你戴頸環潛進視差世界「' + world + '」，現在跟你傳訊息的這個人是那一趟同隊的旅伴' +
            (endName ? '，那一趟走到的結局是「' + endName + '」' : '') + '。撤離回純白大廳時你們交換了聯絡方式。' +
            '那個世界的人和東西都留在那邊；那一趟發生的事是你們兩個共同的經歷。';
        let avatarId = null;
        const face = await _faceUrl(name);
        const blob = face ? await _blobOf(face) : null;
        const WD = win.WX_DB || window.WX_DB;
        if (blob && WD && WD.saveImage) { try { avatarId = await WD.saveImage('avt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), blob); } catch (e) { avatarId = null; } }
        const c = { id: 'char_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name,
            desc: '視差同行・' + world, avatarId, isGroup: false, persona };
        C.addContactToStorage(c);
        // 聊天 app 已經開過的話，它手上那份也補一間（沒開過不用：打開時會從通訊錄重建）
        try {
            const W = win.wxApp;
            if (W && W.GLOBAL_CHATS && !W.GLOBAL_CHATS[c.id]) {
                W.GLOBAL_CHATS[c.id] = { id: c.id, name: c.name, desc: c.desc, customAvatar: c.avatarId, persona: c.persona, isGroup: false, members: [c.id], messages: [], lastTime: '', unread: false };
            }
        } catch (e) {}
        return true;
    }

    win.OS_WG_PACK = window.OS_WG_PACK = { open, settle, souvenirs };
    console.log('[回程行李] 模組就緒');
})();
