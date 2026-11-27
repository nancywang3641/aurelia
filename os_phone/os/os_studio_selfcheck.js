// ----------------------------------------------------------------
// [檔案] os_studio_selfcheck.js — 創作室 VN 面板「做完自己驗一輪」引擎（2026-09-09 新增）
// 職責：模型吐完面板（首版整包／diff 修補／整包重做）之後，程式在預覽裡跑一組檢查，
//       把結果寫成一段修改要求；核心 os_studio.js 用它決定要不要自動再送一通修正。
//       這裡只有純檢查邏輯，不呼叫 API、不動聊天歷史、不碰 currentParsedData。
// 檢查什麼：解析結果的必要欄位、預覽有沒有真的畫出東西、面板 js 執行有沒有炸
//       （同步錯誤由核心預覽層記下、非同步錯誤在這裡監聽一段時間）、返回鈕有沒有綁 onComplete、
//       三種類型各自的鐵律（純展示禁生成、共用要 isBlock+demoFormat+st.feed+st.callAI）、
//       CSS 有沒有跑出 .vn-dynamic-panel-<tagId> 作用域、禁用的 position:fixed／100vw／100vh、
//       js 裡的 $1 字面與 document.getElementById。
// 依賴：window.OS_STUDIO._b 橋（lastPreviewJsError getter）；載入順序在 os_studio.js 之後（index.js PHONE_FILES／index.html）。
// 入口＝win.OS_STUDIO_CHECK.run(opts) → Promise<{ issues: [{ key, msg }] }>；win.OS_STUDIO_CHECK.describe(issues) → 給模型的修改要求。
// ----------------------------------------------------------------
(function () {
    'use strict';
    const win = window.parent || window;
    const ST = win.OS_STUDIO;
    if (!ST || !ST._b) { console.warn('[StudioCheck] OS_STUDIO 橋不存在，自檢引擎停用'); return; }
    const _b = ST._b;

    const ASYNC_WATCH_MS = 900;   // 預覽層 50ms 後才跑面板 js，再留時間給 st.feed 之類的非同步初始化

    function _safeTag(tagId) { return String(tagId || '').replace(/[^a-zA-Z0-9_-]/g, ''); }

    // ── 靜態檢查：只看資料本身 ──
    function staticIssues(data, panelType) {
        const issues = [];
        const push = (key, msg) => issues.push({ key, msg });
        const tagId = String(data.tagId || '').trim();
        const js = String(data.js || '');
        const html = String(data.html || '');
        const css = String(data.css || '');
        const type = panelType || '純展示';

        if (!tagId) push('tagId', '沒有 tagId');
        else if (_safeTag(tagId) !== tagId) push('tagId', 'tagId「' + tagId + '」含英數、底線、連字號以外的字元，引擎會認不出來');
        if (!html.trim()) push('html', 'html 是空的');

        if (!js.trim()) push('onComplete', '沒有 js：返回／關閉鈕沒有綁 onComplete，使用者回不去主畫面');
        else if (!/onComplete/.test(js)) push('onComplete', 'js 裡沒有綁 onComplete：返回／關閉鈕按了不會關，使用者回不去主畫面');

        if (data.isBlock && !String(data.demoFormat || '').trim()) push('demoFormat', 'isBlock 是 true 但沒有 demoFormat，劇本 AI 不知道怎麼在正文寫這個區塊');

        if (type === '純展示') {
            if (/st\.callAI\s*\(|st\.setImage\s*\(/.test(js)) push('type', '純展示面板不能用 st.callAI／st.setImage，只做純前端互動');
        } else if (type === '共用') {
            if (data.isBlock !== true) push('type', '共用面板的 isBlock 必須是 true');
            if (!String(data.demoFormat || '').trim()) push('type', '共用面板必須有 demoFormat');
            if (!/st\.feed\s*\(/.test(js)) push('type', '共用面板沒有從 st.feed() 讀資料，兩條進料合併後的清單面板拿不到');
            if (!/st\.callAI\s*\(/.test(js)) push('type', '共用面板缺生成鈕：沒有任何地方呼叫 st.callAI 產新內容');
        }

        if (js.indexOf('$1') !== -1) push('js', 'js 裡有字串字面 $1，引擎的正則層會把它當 capture group 切掉，整段 js 會炸；改用 callback 形式的 replace');
        if (/document\.getElementById\s*\(/.test(js)) push('js', 'js 用了 document.getElementById，多實例會撞；改用 container.querySelector');

        cssIssues(css, _safeTag(tagId)).forEach(m => push('css', m));
        return issues;
    }

    // ── CSS 作用域與禁用寫法：用可建構樣式表解析，環境不支援就跳過 ──
    function cssIssues(css, safeTag) {
        const out = [];
        if (!css.trim()) return out;
        const prefix = 'vn-dynamic-panel-' + safeTag;
        let sheet;
        try { sheet = new CSSStyleSheet(); sheet.replaceSync(css); } catch (e) { return out; }
        const leaked = [];
        let fixedSel = null, vwSel = null;
        const walk = (rules) => {
            for (let i = 0; i < rules.length; i++) {
                const r = rules[i];
                if (!(r instanceof CSSStyleRule)) {
                    // 群組規則（@media／@supports／@container）往裡走；@keyframes 裡的 from/to 不是選擇器，跳過
                    if (r.cssRules && !(r instanceof CSSKeyframesRule)) walk(r.cssRules);
                    continue;
                }
                // 注意：支援 CSS 巢狀的瀏覽器裡 CSSStyleRule 自己也有 cssRules，所以先判型別再看群組，否則樣式規則會被當群組略過
                const sel = String(r.selectorText || '');
                const parts = sel.split(',').map(s => s.trim()).filter(Boolean);
                if (parts.some(p => p.indexOf(prefix) === -1)) leaked.push(sel);
                const txt = String(r.style.cssText || '');
                if (!fixedSel && /position\s*:\s*fixed/i.test(txt)) fixedSel = sel;
                if (!vwSel && /100vw|100vh/i.test(txt)) vwSel = sel;
            }
        };
        try { walk(sheet.cssRules); } catch (e) { return out; }
        if (leaked.length) out.push('CSS 有選擇器沒掛在 .' + prefix + ' 底下，會外洩到整個畫面：' + leaked.slice(0, 4).join('、') + (leaked.length > 4 ? '…共 ' + leaked.length + ' 條' : ''));
        if (fixedSel) out.push('CSS 用了 position:fixed（在 ' + fixedSel + '），面板內禁用');
        if (vwSel) out.push('CSS 用了 100vw／100vh（在 ' + vwSel + '），面板內禁用');
        return out;
    }

    // ── 執行期檢查：預覽有沒有畫出東西、js 有沒有炸 ──
    function watchAsyncErrors(ms) {
        const errs = [];
        const isPanelStack = (s) => { s = String(s || ''); return !s || /<anonymous>/.test(s); };   // new Function 跑的程式碼在堆疊裡是 <anonymous>；別家檔案的錯不算
        const onErr = (e) => { try { const err = e && e.error; if (isPanelStack(err && err.stack)) errs.push(String((err && err.message) || e.message || err || '')); } catch (x) {} };
        const onRej = (e) => { try { const r = e && e.reason; if (isPanelStack(r && r.stack)) errs.push(String((r && r.message) || r || '')); } catch (x) {} };
        window.addEventListener('error', onErr);
        window.addEventListener('unhandledrejection', onRej);
        return new Promise(res => setTimeout(() => {
            window.removeEventListener('error', onErr);
            window.removeEventListener('unhandledrejection', onRej);
            res(errs.filter(Boolean));
        }, ms));
    }

    async function run(opts) {
        opts = opts || {};
        const data = opts.data;
        if (!data || Array.isArray(data)) return { issues: [] };
        const asyncP = watchAsyncErrors(opts.watchMs || ASYNC_WATCH_MS);
        const issues = staticIssues(data, opts.panelType);
        const asyncErrs = await asyncP;

        const syncErr = _b.lastPreviewJsError;
        if (syncErr) issues.push({ key: 'runtime', msg: 'js 一執行就出錯：' + syncErr });
        [...new Set(asyncErrs)].slice(0, 3).forEach(m => issues.push({ key: 'runtime', msg: 'js 執行中出錯：' + m }));

        const root = opts.previewRoot;
        if (root && String(data.html || '').trim()) {
            const box = root.querySelector('.vn-dynamic-panel-' + _safeTag(data.tagId));
            if (!box) issues.push({ key: 'render', msg: '預覽裡找不到面板根節點，面板沒有畫出來' });
            else if (box.childElementCount === 0) issues.push({ key: 'render', msg: '面板根節點是空的，一個元素都沒畫出來' });
        }
        return { issues };
    }

    function describe(issues) {
        const list = (issues || []).map((it, i) => (i + 1) + '. ' + it.msg).join('\n');
        return '做完自己檢查了一遍，發現下面這些問題。逐條修正，沒列到的地方一律不動：\n' + list;
    }

    win.OS_STUDIO_CHECK = { run, describe, staticIssues, cssIssues };
})();
