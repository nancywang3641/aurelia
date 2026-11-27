/**
 * ==========================================
 * Aurelia Regex Bridge & CSS Catcher (正則 CSS 捕捉與數據橋接器)
 * ==========================================
 * 專門解決：酒館正則「拆分注入」導致的 CSS 遺失問題，以及自動抓取終端機面板數據供 VN 面板使用。
 */
(function() {
    'use strict';

    console.log('✅ [Aurelia Bridge] 啟動正則 CSS 捕捉與數據橋接器...');

    // 1. 全局 CSS 捕捉器：抓取聊天室內所有的 <style>，同步到全局，確保移動到其他 TAB 也能正常顯示
    const SCOPE = '#ue-content-area';
    // 一個選擇器清單照逗號切（括號裡的逗號不切：:is(a, b)）
    function _splitSel(s) {
        const out = []; let depth = 0, cur = '';
        for (const ch of String(s)) {
            if (ch === '(' || ch === '[') depth++;
            else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
            if (ch === ',' && !depth) { out.push(cur); cur = ''; continue; }
            cur += ch;
        }
        out.push(cur);
        return out.map(x => x.trim()).filter(Boolean);
    }
    function _scopeSelector(sel, scope) {
        return _splitSel(sel).map(one => {
            let s = one.replace(/(^|\s)#chat(?=[\s.:#[>+~]|$)/g, '$1').replace(/(^|\s)\.mes_text(?=[\s.:#[>+~]|$)/g, '$1').trim();
            if (!s || /^(html|body|:root)$/i.test(s)) return scope;
            s = s.replace(/^(html|body|:root)\s+/i, '');
            return scope + ' ' + s;
        }).join(', ');
    }
    function _scopeRules(rules, scope) {
        let out = '';
        for (const r of Array.from(rules || [])) {
            if (r.type === 1 && r.selectorText != null) {                     // 一般規則：套上範圍
                out += _scopeSelector(r.selectorText, scope) + ' { ' + r.style.cssText + ' }\n';
            } else if (r.cssRules && (r.type === 4 || r.type === 12)) {        // @media／@supports：裡面照套
                const head = r.cssText.slice(0, r.cssText.indexOf('{')).trim();
                out += head + ' {\n' + _scopeRules(r.cssRules, scope) + '}\n';
            } else {
                out += r.cssText + '\n';                                        // @keyframes、@font-face 這些不分範圍
            }
        }
        return out;
    }
    function _scopeCss(cssText, scope) {
        try {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(String(cssText || '').replace(/@import[^;]+;/g, ''));
            return _scopeRules(sheet.cssRules, scope);
        } catch (e) { return ''; }   // 解析不了就不套，絕不退回全站樣式
    }

    const _scopedCache = new Map();   // 原始 style 字 → 換好範圍的字
    function syncRegexStyles() {
        const chatContainer = document.getElementById('chat');
        if (!chatContainer) return;

        // 抓取聊天室內所有被正則注入的 style
        const chatStyles = chatContainer.querySelectorAll('style');
        let combinedCSS = '/* Aurelia Auto-Captured Regex Styles */\n';

        // 同一份美化每一樓都帶一份 <style>：80 樓＝80 份一樣的字。只抄一次，
        //   不然全頁多出 80 份同樣的規則，每次畫面變動都要比對 80 遍（11-25 玩久了章節越開越卡）。
        //   換好範圍的結果也記住，新訊息進來只解析新出現的那幾份。
        //   重複的留最後出現的位置（跟原本一樣，後面的蓋前面的）
        const seen = new Set();
        const lastOf = new Map();   // 字 → 最後一個帶這份字的 <style>
        chatStyles.forEach(style => {
            const raw = style.innerHTML;
            if (!raw) return;
            seen.delete(raw);
            seen.add(raw);
            lastOf.set(raw, style);
        });
        // 聊天裡一模一樣的 <style> 只讓最後一份生效、其他停用（元素留著，酒館照樣管它）：
        //   酒館的美化正則只套最後幾樓，可是不會回頭重畫舊樓 → 玩一整晚每章都留著一份，
        //   重開酒館才剩幾份。全頁每次重算樣式都要比對每一份，所以越玩越卡、重開就順。
        //   同一份字效果完全一樣，停掉重複的畫面不會變。樓被刪、被重畫時觀察者會再跑一次，換下一份接手。
        chatStyles.forEach(style => {
            const raw = style.innerHTML;
            const off = !!raw && lastOf.get(raw) !== style;
            try { if (style.sheet && style.sheet.disabled !== off) style.sheet.disabled = off; } catch (e) {}
        });
        seen.forEach(raw => {
            // 讓 CSS 在檔案庫（html_extractor 的 #ue-content-area）也生效：
            //   🚨 以前是把 .mes_text／#chat 範圍剝掉直接當全站樣式 → 卡片的 p{}、div{} 把酒館跟奧瑞亞面板一起染色。
            //      現在改成把範圍換成檔案庫那一格
            let scoped = _scopedCache.get(raw);
            if (scoped == null) { scoped = _scopeCss(raw, SCOPE); _scopedCache.set(raw, scoped); }
            combinedCSS += scoped + '\n';
        });
        // 記住的只留這次還在聊天裡的（換聊天室、刪樓後放掉）
        for (const k of _scopedCache.keys()) if (!seen.has(k)) _scopedCache.delete(k);

        // 注入到網頁頭部
        let globalStyleTag = document.getElementById('aurelia-regex-global-styles');
        if (!globalStyleTag) {
            globalStyleTag = document.createElement('style');
            globalStyleTag.id = 'aurelia-regex-global-styles';
            document.head.appendChild(globalStyleTag);
        }

        // 只有當 CSS 有變動時才更新，避免效能浪費
        if (globalStyleTag.innerHTML !== combinedCSS) {
            globalStyleTag.innerHTML = combinedCSS;
        }
    }

    // 2.（10-20 拿掉）以前這裡照某一張卡的面板欄位抓資料給 VN 面板，欄位名寫死了那張卡的內容；
    //   全專案沒有地方讀它，repo 又是公開的，整段拿掉。對外那支 getLatestTerminalData 留著、一律回 null，免得有卡片腳本叫它出錯。

    // 3. 設立自動監聽器
    //    防抖：AI 串流吐字時 #chat subtree mutation 連發，每批各排一個 timer 會疊著重跑同樣的全 DOM 掃描
    //    → 收斂成單一 pending timer（新 mutation 進來就重新計時，安靜 300ms 才掃一次）
    let _pendingSync = null;
    const observer = new MutationObserver((mutations) => {
        let hasNewNodes = false;
        for (const mut of mutations) {
            // 拿掉的也算：生效的那份 <style> 跟著樓被刪掉時，要換下一份接手
            if (mut.addedNodes.length > 0 || mut.removedNodes.length > 0) { hasNewNodes = true; break; }
        }
        if (hasNewNodes) {
            if (_pendingSync) clearTimeout(_pendingSync);
            _pendingSync = setTimeout(() => {
                _pendingSync = null;
                syncRegexStyles();
            }, 300);
        }
    });

    function initObserver() {
        const chat = document.getElementById('chat');
        if (chat) {
            observer.observe(chat, { childList: true, subtree: true });
            syncRegexStyles(); // 啟動時先抓取一次
        } else {
            // 如果聊天室還沒加載，1秒後重試
            setTimeout(initObserver, 1000);
        }
    }

    // 啟動監聽器
    initObserver();

    // 開放 API 給其他面板使用
    window.AureliaRegexBridge = {
        forceSyncCss: syncRegexStyles,
        getLatestTerminalData: () => null
    };

})();