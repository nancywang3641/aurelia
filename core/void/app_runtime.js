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
            +   'window.getChatId = function(){ try { var ST=P.SillyTavern; if(ST&&typeof ST.getCurrentChatId==="function"){ var id=ST.getCurrentChatId(); if(id!=null&&id!=="") return String(id); } var c=ST&&ST.getContext&&ST.getContext(); if(c&&c.chatId!=null&&c.chatId!=="") return String(c.chatId); if(ST&&ST.chatId!=null) return String(ST.chatId); }catch(e){} return "_nochat"; };'
            +   'window.saveData = function(k, v, scope){ try { var pre="aurelia_appdata_"+window.__APP_ID__+"_"+(scope==="chat"?("chat_"+window.getChatId()+"_"):""); P.localStorage.setItem(pre+k, JSON.stringify(v)); } catch(e){} };'
            +   'window.loadData = function(k, scope){ try { var pre="aurelia_appdata_"+window.__APP_ID__+"_"+(scope==="chat"?("chat_"+window.getChatId()+"_"):""); var s=P.localStorage.getItem(pre+k); return s==null?null:JSON.parse(s); } catch(e){ return null; } };'
            // ── DB 持久化（存進 OS_DB、不怕爆；async）。大量/長期累積資料用這個，scope:"chat" 綁聊天室 ──
            +   'window.dbSave = async function(k, v, scope){ try { var DB=window.OS_DB||(P&&P.OS_DB); if(!DB||!DB.saveAppData) return false; return await DB.saveAppData(window.__APP_ID__, k, v, scope==="chat"?window.getChatId():null); } catch(e){ return false; } };'
            +   'window.dbLoad = async function(k, scope){ try { var DB=window.OS_DB||(P&&P.OS_DB); if(!DB||!DB.getAppData) return null; return await DB.getAppData(window.__APP_ID__, k, scope==="chat"?window.getChatId():null); } catch(e){ return null; } };'
            // ── 通用記憶：角色對話型 app 記一筆到統一桶(app_memory)，跟預設應用一起被注入酒館(該 app 開關開時) ──
            +   'window.remember = async function(charName, speaker, text){ try { if(window.__IS_PREVIEW) return; if(!charName||!text) return; var DB = window.OS_DB || (P && P.OS_DB); if(!DB||!DB.saveAppMemory) return; await DB.saveAppMemory(window.__APP_ID__, String(charName), { speaker:String(speaker||""), text:String(text), time: Date.now() }); } catch(e){} };'
            // ── 聊天室：打字→AI 扮角色回一句→存對話(chat-scope)。對話自動被「記憶回傳酒館」抓回劇情(開關開時)。app 只管 UI。 ──
            +   'window.roomReply = async function(charName, userText, opts){ try { opts=opts||{}; charName=String(charName||"對方"); userText=String(userText==null?"":userText); var key="__room_"+charName; var hist=[]; try{ hist=(await window.dbLoad(key,"chat"))||[]; }catch(e){} if(!Array.isArray(hist)) hist=[]; if(userText) hist.push({me:true,text:userText,t:Date.now()}); var recent=hist.slice(-12).map(function(m){return (m.me?"我":charName)+"："+m.text;}).join("\\n"); var sys="你現在是【"+charName+"】，正在用手機聊天 app 跟「我」私訊。依當前劇情中 "+charName+" 的人設、與我的關係、最近發生的事來回。\\n最近對話：\\n"+recent+"\\n\\n用 "+charName+" 的口吻回一句（口語、像在傳訊息；只回對話內容，不要旁白、不要格式符號、不要替我說話）。"; if(opts.extra) sys+="\\n"+String(opts.extra); var reply=""; try{ reply=await window.callAI(sys); }catch(e){} reply=String(reply||"").trim(); if(reply) hist.push({me:false,name:charName,text:reply,t:Date.now()}); try{ await window.dbSave(key,hist,"chat"); }catch(e){} return {reply:reply,history:hist}; } catch(e){ console.error("[app roomReply]",e); return {reply:"",history:[]}; } };'
            +   'window.roomHistory = async function(charName){ try { return (await window.dbLoad("__room_"+String(charName||"對方"),"chat"))||[]; } catch(e){ return []; } };'
            +   'window.roomClear = async function(charName){ try { return await window.dbSave("__room_"+String(charName||"對方"),[],"chat"); } catch(e){ return false; } };'
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
            // ── 劇情長期記憶：補酒館大總結壓縮版(工坊 APP 只吃最近20則+無總結→對被總結的舊劇情失憶)；關閉 localStorage sp_app_inject_summary=0 ──
            +     'try { if (P.localStorage.getItem("sp_app_inject_summary") !== "0") { var GS = P.OS_STORY_TOOLS; if (GS && GS.getCurrentInjectionPayload) { var sm = await GS.getCurrentInjectionPayload(); if (sm && sm.trim()) ctx += "【劇情總結(至今為止的長期記憶，延續勿矛盾)】\\n" + sm + "\\n\\n"; } } } catch(e){}'
            +     'var full = (ctx ? (ctx + "----\\n以下是你這次的任務指令，請嚴格遵守(上面只是背景參考)：\\n") : "") + sys;'
            +     'var OS = window.OS_API; if (!OS || !OS.chat) throw new Error("OS_API 不可用");'
            +     'var cfg = (P.OS_SETTINGS && P.OS_SETTINGS.getConfig && P.OS_SETTINGS.getConfig()) || {};'
            +     'cfg = Object.assign({}, cfg, { usePresetPrompts:false, enableThinking:false });'
            +     'return await new Promise(function(res, rej){ OS.chat([{role:"system",content:full}], cfg, null, function(t){ res(typeof t==="string"?t:(t&&t.message)||""); }, rej, {disableTyping:true}); });'
            +   '} catch(e){ console.error("[app callAI]",e); return ""; } };'
            // ── 當前聊天室角色清單：[{name,count}]，做角色選單/搜尋用(繞懶載、不等大總結) ──
            +   'window.getCurrentChars = async function(){ try { var R = P && P.VN_READER; return (R && R.getCurrentChars) ? await R.getCurrentChars() : []; } catch(e){ console.error("[app getCurrentChars]",e); return []; } };'
            // ── 讀當前劇情：回最近 n 條 [{name,text}]（共用面板「讀劇情顯示」用，不經 AI）──
            +   'window.getStory = function(n){ try { var ST=P.SillyTavern, c=ST&&ST.getContext&&ST.getContext(); if(!c||!Array.isArray(c.chat)) return []; var CL=(P.VN_READER&&P.VN_READER.clean)?P.VN_READER.clean:function(x){return x||"";}; return c.chat.filter(function(m){return m&&!m.is_system;}).slice(-(n||30)).map(function(m){return {name:String(m.name||(m.is_user?"我":"")), text:CL(m.mes||"")};}).filter(function(o){return o.text&&o.text.trim();}); } catch(e){ console.error("[app getStory]",e); return []; } };'
            // ── UI 小工具：toast/confirm/loading/esc（每個 app 共用、免重造；走掛載層→現有 app 也有、免重存）──
            +   'window.stEsc = function(s){ try{ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }catch(e){ return ""; } };'
            +   'window.stToast = function(msg, opts){ try{ opts=opts||{}; var d=document.createElement("div"); var bg=opts.color||(opts.type==="error"?"rgba(180,60,60,0.95)":"rgba(28,28,38,0.92)"); d.textContent=String(msg==null?"":msg); d.style.cssText="position:fixed;left:50%;bottom:32px;transform:translateX(-50%);max-width:80%;background:"+bg+";color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;line-height:1.4;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,0.25);opacity:0;transition:opacity .2s;pointer-events:none;text-align:center;"; document.body.appendChild(d); requestAnimationFrame(function(){ d.style.opacity="1"; }); setTimeout(function(){ d.style.opacity="0"; setTimeout(function(){ d.remove(); },250); }, opts.duration||2000); }catch(e){} };'
            +   'window.stConfirm = function(msg, opts){ return new Promise(function(res){ try{ opts=opts||{}; var ov=document.createElement("div"); ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;"; var box=document.createElement("div"); box.style.cssText="background:#fff;color:#222;border-radius:14px;padding:18px;max-width:300px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,0.3);font-size:14px;line-height:1.5;"; var m=document.createElement("div"); m.textContent=String(msg==null?"":msg); m.style.cssText="margin-bottom:14px;white-space:pre-wrap;"; var row=document.createElement("div"); row.style.cssText="display:flex;gap:8px;justify-content:flex-end;"; var no=document.createElement("button"); no.textContent=opts.cancelText||"取消"; no.style.cssText="padding:8px 14px;border:1px solid rgba(0,0,0,0.2);background:#fff;color:#333;border-radius:8px;font-size:13px;cursor:pointer;"; var yes=document.createElement("button"); yes.textContent=opts.okText||"確定"; yes.style.cssText="padding:8px 14px;border:0;background:"+(opts.danger?"#c0392b":"#1A1C28")+";color:#fff;border-radius:8px;font-size:13px;cursor:pointer;"; no.onclick=function(){ ov.remove(); res(false); }; yes.onclick=function(){ ov.remove(); res(true); }; ov.onclick=function(e){ if(e.target===ov){ ov.remove(); res(false); } }; row.appendChild(no); row.appendChild(yes); box.appendChild(m); box.appendChild(row); ov.appendChild(box); document.body.appendChild(ov); }catch(e){ res(false); } }); };'
            +   'window.stLoading = function(target, on, text){ try{ var host=(typeof target==="string")?document.querySelector(target):(target||document.body); if(!host) return; if(on===false){ if(host.__stLoad){ host.__stLoad.remove(); host.__stLoad=null; } return; } if(host.__stLoad) return; if(getComputedStyle(host).position==="static") host.style.position="relative"; var ov=document.createElement("div"); ov.style.cssText="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(0,0,0,0.25);z-index:50;"; var sp=document.createElement("div"); sp.style.cssText="width:28px;height:28px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:__stspin .8s linear infinite;"; ov.appendChild(sp); if(text){ var t=document.createElement("div"); t.textContent=text; t.style.cssText="color:#fff;font-size:12px;"; ov.appendChild(t); } if(!document.getElementById("__stspin_kf")){ var k=document.createElement("style"); k.id="__stspin_kf"; k.textContent="@keyframes __stspin{to{transform:rotate(360deg)}}"; document.head.appendChild(k); } host.__stLoad=ov; host.appendChild(ov); }catch(e){} };'
            // ── generateRaw 仍橋接(進階 app 指名要它才用；預設請用 callAI) ──
            +   'if (!window.generateRaw) window.generateRaw = function(cfg){ var Q=window.parent; if (Q && Q.TavernHelper && Q.TavernHelper.generateRaw) return Q.TavernHelper.generateRaw(cfg); if (Q && Q.generateRaw) return Q.generateRaw(cfg); return Promise.reject(new Error("no generateRaw")); };'
            // ── 版面：強制 app 撐滿手機螢幕。修「面板用 min-height:100% 但 #app-root 無確定高度→百分比解析不到→底下露白」。
            //    DOMContentLoaded 後補(排在 app 自己 style 之後→同 specificity 後者贏)，所有現有 app 自動套、免重存。
            +   'document.addEventListener("DOMContentLoaded", function(){ try { var _s=document.createElement("style"); _s.textContent="html,body{height:100%;}#app-root{display:flex;flex-direction:column;height:100%;box-sizing:border-box;}#app-root>*{flex:1 1 auto;min-height:0;}*{scrollbar-width:thin;scrollbar-color:rgba(140,140,140,0.5) transparent;}::-webkit-scrollbar{width:8px;height:8px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(140,140,140,0.45);border-radius:4px;}::-webkit-scrollbar-thumb:hover{background:rgba(140,140,140,0.7);}"; document.head.appendChild(_s); } catch(e){} });'
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
