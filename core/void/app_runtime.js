// core/void/app_runtime.js
// 把一份「完整 HTML app」跑進 iframe，並把酒館 API 橋接進去。
// 商店預覽與手機桌面開啟共用同一個 mountAppIframe —— 唯一負責 iframe + API 橋接的地方。
(function () {
    'use strict';
    const win = window;

    // 注入到 app HTML 最前面的橋接 bootstrap：在 app 自身 script 之前跑，從 window.parent 把酒館 API
    // 與一組「給 app 用的 helper」補進 iframe 全域（srcdoc 同源、可讀 parent）。
    // helper(callAI/genImg/goBack/saveData/loadData)集中在這裡 → 之後改 helper 不必重生 app。
    // opts: { preview, appId, provider }
    function _bridgeScript(opts) {
        opts = opts || {};
        var preview = opts.preview ? 'true' : 'false';
        var appId = String(opts.appId || 'preview').replace(/[^a-zA-Z0-9_-]/g, '') || 'preview';
        var provider = (opts.provider === 'novelai') ? 'novelai' : 'pollinations';
        return '<scr' + 'ipt>(function(){'
            + 'var P; try { P = window.parent; } catch(e){ return; }'
            + 'try {'
            +   'window.__IS_PREVIEW = ' + preview + ';'
            +   'window.__APP_ID__ = "' + appId + '";'
            +   'window.__APP_PROVIDER__ = "' + provider + '";'
            // ── 原始全域橋接 ──
            +   'window.OS_IMAGE_MANAGER = window.OS_IMAGE_MANAGER || (P && P.OS_IMAGE_MANAGER) || null;'
            +   'window.OS_API           = window.OS_API           || (P && P.OS_API) || null;'
            +   'window.OS_DB            = window.OS_DB            || (P && P.OS_DB) || null;'
            +   'window.TavernHelper     = window.TavernHelper     || (P && P.TavernHelper) || null;'
            +   'window.SillyTavern      = window.SillyTavern      || (P && P.SillyTavern) || null;'
            // ── 返回主畫面 ──
            +   'window.goBack = function(){ try { var V = (P && P.VoidPhoneShell) || window.VoidPhoneShell; if (V && V.home) V.home(); } catch(e){} };'
            // ── 持久化(存主頁 localStorage，用 app 專屬命名空間，跨關閉/重開保留) ──
            +   'window.saveData = function(k, v){ try { P.localStorage.setItem("aurelia_appdata_"+window.__APP_ID__+"_"+k, JSON.stringify(v)); } catch(e){} };'
            +   'window.loadData = function(k){ try { var s = P.localStorage.getItem("aurelia_appdata_"+window.__APP_ID__+"_"+k); return s==null?null:JSON.parse(s); } catch(e){ return null; } };'
            // ── 通用記憶：角色對話型 app 記一筆到統一桶(app_memory)，跟預設應用一起被注入酒館(該 app 開關開時) ──
            +   'window.remember = async function(charName, speaker, text){ try { if(window.__IS_PREVIEW) return; if(!charName||!text) return; var DB = window.OS_DB || (P && P.OS_DB); if(!DB||!DB.saveAppMemory) return; await DB.saveAppMemory(window.__APP_ID__, String(charName), { speaker:String(speaker||""), text:String(text), time: Date.now() }); } catch(e){} };'
            // ── 生圖(預覽走佔位省額度) ──
            +   'window.genImg = async function(p, type, provider){ try { return window.__IS_PREVIEW ? ("https://api.dicebear.com/7.x/shapes/svg?seed="+encodeURIComponent(p)) : await window.OS_IMAGE_MANAGER.generate(p, type||"item", {provider: provider || window.__APP_PROVIDER__}); } catch(e){ console.error("[app genImg]",e); return ""; } };'
            // ── 文字生成：走 OS_API.chat(直接打 API、不發酒館 GENERATION 事件→不觸發記憶/狀態抽取)。
            //    上下文手動組：角色卡 + 當前角色綁定世界書 + 最近劇情；不吃 preset、不吃全域世界書。
            +   'window.callAI = async function(sys){ try {'
            +     'var TH = P.TavernHelper, ST = P.SillyTavern, ctx = "";'
            +     'try { var c = ST && ST.getContext && ST.getContext(); if (c) {'
            +       'var ch = (c.characters && c.characters[c.characterId]) || null;'
            +       'if (ch) ctx += "【角色】" + (ch.name||"") + "\\n" + (ch.description||"") + "\\n" + (ch.personality||"") + "\\n" + (ch.scenario||"") + "\\n\\n";'
            +       'if (Array.isArray(c.chat)) { var CL = (P.VN_READER && P.VN_READER.clean) ? P.VN_READER.clean : function(x){return x||"";}; var ms = c.chat.filter(function(m){return m && !m.is_system;}).slice(-20).map(function(m){ return CL(m.mes||""); }).filter(function(t){return t && t.trim();}); if (ms.length) ctx += "【最近劇情(已洗成小說格式)】\\n" + ms.join("\\n\\n") + "\\n\\n"; }'
            +     '} } catch(e){}'
            +     'try { if (TH && TH.getCharWorldbookNames && TH.getWorldbook) { var nm = TH.getCharWorldbookNames("current"); var bks = []; if (nm) { if (nm.primary) bks.push(nm.primary); if (Array.isArray(nm.additional)) bks = bks.concat(nm.additional); } var lore=""; for (var i=0;i<bks.length;i++){ var es = await TH.getWorldbook(bks[i]); (es||[]).forEach(function(e){ if (e && e.enabled !== false && e.content) lore += e.content + "\\n"; }); } if (lore) { if (lore.length>4000) lore=lore.slice(0,4000); ctx += "【角色設定書】\\n" + lore + "\\n\\n"; } } } catch(e){}'
            +     'var full = (ctx ? (ctx + "----\\n以下是你這次的任務指令，請嚴格遵守(上面只是背景參考)：\\n") : "") + sys;'
            +     'var OS = window.OS_API; if (!OS || !OS.chat) throw new Error("OS_API 不可用");'
            +     'var cfg = (P.OS_SETTINGS && P.OS_SETTINGS.getConfig && P.OS_SETTINGS.getConfig()) || {};'
            +     'cfg = Object.assign({}, cfg, { usePresetPrompts:false, enableThinking:false });'
            +     'return await new Promise(function(res, rej){ OS.chat([{role:"system",content:full}], cfg, null, function(t){ res(typeof t==="string"?t:(t&&t.message)||""); }, rej, {disableTyping:true}); });'
            +   '} catch(e){ console.error("[app callAI]",e); return ""; } };'
            // ── 當前聊天室角色清單：[{name,count}]，做角色選單/搜尋用(繞懶載、不等大總結) ──
            +   'window.getCurrentChars = async function(){ try { var R = P && P.VN_READER; return (R && R.getCurrentChars) ? await R.getCurrentChars() : []; } catch(e){ console.error("[app getCurrentChars]",e); return []; } };'
            // ── generateRaw 仍橋接(進階 app 指名要它才用；預設請用 callAI) ──
            +   'if (!window.generateRaw) window.generateRaw = function(cfg){ var Q=window.parent; if (Q && Q.TavernHelper && Q.TavernHelper.generateRaw) return Q.TavernHelper.generateRaw(cfg); if (Q && Q.generateRaw) return Q.generateRaw(cfg); return Promise.reject(new Error("no generateRaw")); };'
            + '} catch(e) { console.warn("[app bridge]", e); }'
            + '})();</scr' + 'ipt>';
    }

    // container: 掛載容器；html: 完整 HTML 字串；opts.preview: true=預覽(生圖走佔位、不燒額度)
    // 回傳 cleanup()。手機殼清空容器時 iframe 會一併被移除，cleanup 為保險。
    function mountAppIframe(container, html, opts) {
        opts = opts || {};
        if (!container) return function () {};
        container.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.className = 'app-iframe';
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals');
        // 橋接 bootstrap 要在 app 自身 script 前跑，且不能擠在 <!DOCTYPE> 之前(會觸發 quirks mode 壞版面)；
        // 有 <head> 就插進 head 開頭、否則退回最前面。
        const boot = _bridgeScript(opts);
        const src = String(html == null ? '' : html);
        iframe.srcdoc = /<head[^>]*>/i.test(src) ? src.replace(/<head[^>]*>/i, function (m) { return m + boot; }) : (boot + src);
        container.appendChild(iframe);
        return function cleanup() { try { iframe.remove(); } catch (e) {} };
    }

    win.AppRuntime = { mountAppIframe: mountAppIframe };
    console.log('✅ AppRuntime（app iframe 執行器）模組就緒');
})();
