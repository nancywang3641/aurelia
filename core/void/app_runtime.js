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
        var wake = opts.wake ? 'true' : 'false';
        var appId = String(opts.appId || 'preview').replace(/[^a-zA-Z0-9_-]/g, '') || 'preview';
        // 生圖來源：app 記錄有指定才帶；沒指定就留空，讓 OS_IMAGE_MANAGER 照使用者的圖片設定按類型分桶（以前寫死退回 pollinations，等於無視她的設定）
        var provider = String(opts.provider || '').replace(/[^a-z0-9_-]/gi, '');
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
            // getChatId：酒館問聊天室；PWA 沒有酒館 → 問當前故事（OS_AVS_ADAPTER.getStoryId，全站唯一取法）。
            //   🚨 2026-09-16 以前 PWA 一律回 _nochat：scope:"chat" 的資料所有故事共用一份（Rae 選「可以綁」）。
            //   改綁故事之後，舊的 _nochat 那份不刪：這條故事還沒存過時，loadData/dbLoad 先讀它當起點，存一次就換成這條故事自己的。
            +   'window.getChatId = function(){ try { var ST=P.SillyTavern; if(ST&&typeof ST.getCurrentChatId==="function"){ var id=ST.getCurrentChatId(); if(id!=null&&id!=="") return String(id); } var c=ST&&ST.getContext&&ST.getContext(); if(c&&c.chatId!=null&&c.chatId!=="") return String(c.chatId); if(ST&&ST.chatId!=null) return String(ST.chatId); }catch(e){} try { var AD=P.OS_AVS_ADAPTER; var sid=AD&&AD.getStoryId&&AD.getStoryId(); if(sid) return String(sid); }catch(e){} return "_nochat"; };'
            +   'window.saveData = function(k, v, scope){ try { var pre="aurelia_appdata_"+window.__APP_ID__+"_"+(scope==="chat"?("chat_"+window.getChatId()+"_"):""); P.localStorage.setItem(pre+k, JSON.stringify(v)); } catch(e){} };'
            +   'window.loadData = function(k, scope){ try { var base="aurelia_appdata_"+window.__APP_ID__+"_"; var cid=window.getChatId(); var s=P.localStorage.getItem(base+(scope==="chat"?("chat_"+cid+"_"):"")+k); if(s==null&&scope==="chat"&&cid!=="_nochat") s=P.localStorage.getItem(base+"chat__nochat_"+k); return s==null?null:JSON.parse(s); } catch(e){ return null; } };'
            // ── DB 持久化（存進 OS_DB、不怕爆；async）。大量/長期累積資料用這個，scope:"chat" 綁聊天室（PWA 綁故事） ──
            +   'window.dbSave = async function(k, v, scope){ try { var DB=window.OS_DB||(P&&P.OS_DB); if(!DB||!DB.saveAppData) return false; return await DB.saveAppData(window.__APP_ID__, k, v, scope==="chat"?window.getChatId():null); } catch(e){ return false; } };'
            +   'window.dbLoad = async function(k, scope){ try { var DB=window.OS_DB||(P&&P.OS_DB); if(!DB||!DB.getAppData) return null; if(scope!=="chat") return await DB.getAppData(window.__APP_ID__, k, null); var cid=window.getChatId(); var v=await DB.getAppData(window.__APP_ID__, k, cid); if((v==null)&&cid!=="_nochat") v=await DB.getAppData(window.__APP_ID__, k, "_nochat"); return v; } catch(e){ return null; } };'
            // ── 通用記憶：角色對話型 app 記一筆到統一桶(app_memory)，跟預設應用一起被注入酒館(該 app 開關開時) ──
            +   'window.remember = async function(charName, speaker, text){ try { if(window.__IS_PREVIEW) return; if(!charName||!text) return; var DB = window.OS_DB || (P && P.OS_DB); if(!DB||!DB.saveAppMemory) return; await DB.saveAppMemory(window.__APP_ID__, String(charName), { speaker:String(speaker||""), text:String(text), time: Date.now() }); } catch(e){} };'
            // ── 把一段文字「貼回酒館對話框」（送出框 #send_textarea）。預設只貼、使用者自己按送出；{send:true} 直接幫送。 ──
            +   'window.toChat = function(text, opts){ try { opts=opts||{}; text=String(text==null?"":text); var pDoc=(P&&P.document)||document; var ta=pDoc.querySelector("#send_textarea"), btn=pDoc.querySelector("#send_but"); if(!ta){ try{ var T=window.top; if(T&&T.document){ ta=T.document.querySelector("#send_textarea"); btn=T.document.querySelector("#send_but"); } }catch(e){} } if(!ta) return false; ta.value=text; ta.dispatchEvent(new Event("input",{bubbles:true})); try{ta.focus();}catch(e){} if(opts.send && btn) btn.click(); return true; } catch(e){ console.error("[app toChat]",e); return false; } };'
            // ── 不經輸入框：直接把文字當「system 訊息」插進聊天成最新一則（旁白/系統公告式；使用者不用再按送出）。 ──
            +   'window.toSystem = function(text){ try { if(window.__IS_PREVIEW) return false; text=String(text==null?"":text); if(!text) return false; var ST=window.SillyTavern||(P&&P.SillyTavern); var ctx=ST&&ST.getContext&&ST.getContext(); if(!ctx||!ctx.chat||!ctx.addOneMessage) return false; var ts=(typeof ctx.getMessageTimeStamp==="function")?ctx.getMessageTimeStamp():new Date().toISOString(); var msg={ name:"System", is_user:false, is_system:true, mes:text, send_date:ts, extra:{} }; ctx.chat.push(msg); ctx.addOneMessage(msg,{scroll:true}); try{ if(typeof ctx.saveChat==="function") ctx.saveChat(); }catch(e){} return true; } catch(e){ console.error("[app toSystem]",e); return false; } };'
            // ── 記進手機事件簿：她在 app 裡做了劇情該知道的事，下次劇情接著寫時排在她那句話前面帶到一次（格子名＝app 名） ──
            +   'window.__appName = function(){ if(window.__APP_NAME_P) return window.__APP_NAME_P; window.__APP_NAME_P = (async function(){ try { var DB=window.OS_DB||(P&&P.OS_DB); var apps=(DB&&DB.getAllPhoneApps)?await DB.getAllPhoneApps():[]; var a=(apps||[]).filter(function(x){ return x&&String(x.id)===window.__APP_ID__; })[0]; return (a&&a.name)||""; } catch(e){ return ""; } })(); return window.__APP_NAME_P; };'
            +   'window.toStory = async function(text){ try { if(window.__IS_PREVIEW) return false; text=String(text==null?"":text).trim(); if(!text) return false; var B=P.OS_PHONE_EVENTS; if(!B||!B.record) return false; return await B.record({ room: (await window.__appName())||"手機", line: text }); } catch(e){ return false; } };'
            // ── 手機本身的東西（實作在 OS_APP_TOOLS）：故事時鐘、分享到聊天室、錢包、紅點、通知 ──
            +   'window.stClock = function(){ try { var T=P&&P.OS_APP_TOOLS; return T?T.clock():Promise.resolve({date:"",time:"",upcoming:[]}); } catch(e){ return Promise.resolve({date:"",time:"",upcoming:[]}); } };'
            +   'window.stShare = async function(id, title, text){ try { if(window.__IS_PREVIEW) return false; var T=P&&P.OS_APP_TOOLS; return T? await T.share((await window.__appName())||"App", id, title, text) : false; } catch(e){ return false; } };'
            +   'window.stBalance = function(){ try { var T=P&&P.OS_APP_TOOLS; return T?T.balance():Promise.resolve(0); } catch(e){ return Promise.resolve(0); } };'
            +   'window.stPay = async function(amount, why){ try { if(window.__IS_PREVIEW) return false; var T=P&&P.OS_APP_TOOLS; return T? await T.pay((await window.__appName())||"App", amount, why) : false; } catch(e){ return false; } };'
            +   'window.stBadge = function(n){ try { if(window.__IS_PREVIEW) return; var T=P&&P.OS_APP_TOOLS; if(T) T.badge(window.__APP_ID__, n); } catch(e){} };'
            +   'window.stNotify = async function(text){ try { if(window.__IS_PREVIEW) return false; var T=P&&P.OS_APP_TOOLS; return T? await T.notify((await window.__appName())||"奧瑞亞", text) : false; } catch(e){ return false; } };'
            // ── 自己動：app 用 onWake 登記「被叫醒時要做的事」。平常打開不會跑；只有 OS_APP_TOOLS 在背景叫醒（__WAKE）才跑，跑完回報收掉 ──
            +   'window.__WAKE = ' + wake + ';'
            +   'window.stOnWake = function(fn){ if(!window.__WAKE || typeof fn!=="function" || window.__WAKE_REG) return; window.__WAKE_REG = true; var done=function(ok){ try { var T=P&&P.OS_APP_TOOLS; if(T&&T.wakeDone) T.wakeDone(window.__APP_ID__, ok); } catch(e){} }; setTimeout(function(){ Promise.resolve().then(fn).then(function(){ done(true); }, function(e){ console.error("[app onWake]", e); done(false); }); }, 0); };'
            +   'if (window.__WAKE) window.addEventListener("load", function(){ setTimeout(function(){ if(!window.__WAKE_REG){ try { var T=P&&P.OS_APP_TOOLS; if(T&&T.wakeDone) T.wakeDone(window.__APP_ID__, false); } catch(e){} } }, 5000); });'
            // ── 生圖(預覽走佔位省額度) ──
            +   'window.genImg = async function(p, type, provider){ try { return window.__IS_PREVIEW ? ("https://api.dicebear.com/7.x/shapes/svg?seed="+encodeURIComponent(p)) : await window.OS_IMAGE_MANAGER.generate(p, type||"item", (provider || window.__APP_PROVIDER__) ? {provider: provider || window.__APP_PROVIDER__} : {}); } catch(e){ console.error("[app genImg]",e); return ""; } };'
            // ── 文字生成：走 OS_API.chat(直接打 API、不發酒館 GENERATION 事件→不觸發記憶/狀態抽取)。
            //    上下文手動組：角色卡 + 當前角色綁定世界書 + 最近劇情；不吃 preset、不吃全域世界書。
            // ── 選照片（st.pickPhoto）：跳相機／相簿，回縮好的 data 網址，取消回空字串 ──
            +   'window.stPickPhoto = function(o){ try { var PI = P.OS_PHONE_IMAGE; return (PI && PI.pickPhoto) ? PI.pickPhoto(o).catch(function(){ return ""; }) : Promise.resolve(""); } catch(e){ return Promise.resolve(""); } };'
            +   'window.callAI = async function(sys, opt){ try {'
            +     'var TH = P.TavernHelper, ST = P.SillyTavern, ctx = "";'
            +     'try { var c = ST && ST.getContext && ST.getContext(); if (c) {'
            +       'var ch = (c.characters && c.characters[c.characterId]) || null;'
            +       'if (ch) ctx += "【角色】" + (ch.name||"") + "\\n" + (ch.description||"") + "\\n" + (ch.personality||"") + "\\n" + (ch.scenario||"") + "\\n\\n";'
            +       'if (Array.isArray(c.chat)) { var CL = (P.VN_READER && P.VN_READER.clean) ? P.VN_READER.clean : function(x){return x||"";}; var ms = c.chat.filter(function(m){return m && !m.is_system;}).slice(-20).map(function(m){ return CL(m.mes||""); }).filter(function(t){return t && t.trim();}); if (ms.length) ctx += "【最近劇情(已洗成小說格式)】\\n" + ms.join("\\n\\n") + "\\n\\n"; }'
            +     '} } catch(e){}'
            +     'try { if (TH && TH.getCharWorldbookNames && TH.getWorldbook) { var nm = TH.getCharWorldbookNames("current"); var bks = []; if (nm) { if (nm.primary) bks.push(nm.primary); if (Array.isArray(nm.additional)) bks = bks.concat(nm.additional); } var lore=""; for (var i=0;i<bks.length;i++){ var es = await TH.getWorldbook(bks[i]); (es||[]).forEach(function(e){ if (e && e.enabled !== false && e.content) lore += e.content + "\\n"; }); } if (lore) { if (lore.length>4000) lore=lore.slice(0,4000); ctx += "【角色設定書】\\n" + lore + "\\n\\n"; } } } catch(e){}'
            // ── 劇情長期記憶：補酒館大總結壓縮版(工坊 APP 只吃最近20則+無總結→對被總結的舊劇情失憶)；關閉 localStorage sp_app_inject_summary=0 ──
            +     'try { if (P.localStorage.getItem("sp_app_inject_summary") !== "0") { var GS = P.OS_STORY_TOOLS; if (GS && GS.getCurrentInjectionPayload) { var sm = await GS.getCurrentInjectionPayload(); if (sm && sm.trim()) ctx += "【劇情總結(至今為止的長期記憶，延續勿矛盾)】\\n" + sm + "\\n\\n"; } } } catch(e){}'
            // PWA 沒有酒館，上面那三段全空 → 問引擎拿 PWA 自己的背景（人設、世界書、大總結、最近劇情），不然模型只看到一段任務
            +     'try { if (!ctx && P.OS_API && P.OS_API.appContextBlock) ctx = await P.OS_API.appContextBlock(); } catch(e){}'
            // 排法：背景一則 system、任務一則 user。曾試過借正文整包（一萬多字＋叫它寫視覺小說那批條目），那是為了追一顆壞掉的舊 app 才硬接的，退掉。
            // 附圖（st.callAI(提示, { images })）照設置「看圖」那格送：OS_PHONE_IMAGE.withImages
            +     'var __imgs = (opt && Array.isArray(opt.images)) ? opt.images : []; var __PI = P.OS_PHONE_IMAGE; if (__imgs.length && __PI && __PI.withImages) sys = await __PI.withImages(String(sys == null ? "" : sys), __imgs, "這是使用者在 app 裡附上的圖片。");'
            +     'var msgs = []; if (ctx) msgs.push({role:"system", content: ctx + "----\\n上面是背景參考；這次要做的事在下面那則訊息裡，請嚴格照它做。"}); msgs.push({role:"user", content: sys});'   // 那一則是指令還是使用者在 app 裡打的話，由 app 自己的指令寫清楚，引擎不標
            +     'var OS = window.OS_API; if (!OS || !OS.chat) throw new Error("OS_API 不可用");'
            +     'var cfg = (P.OS_SETTINGS && P.OS_SETTINGS.getConfig && P.OS_SETTINGS.getConfig()) || {};'
            +     'cfg = Object.assign({}, cfg, { usePresetPrompts:false, maxTokens: Math.max(parseInt(cfg.maxTokens)||0, 8192) });'   // 思考照主模型設定走；字數上限保底 8192 同正文那條（思考模型先吃上限，太小就回空）
            +     'return await new Promise(function(res, rej){ OS.chat(msgs, cfg, null, function(t){ res(typeof t==="string"?t:(t&&t.message)||""); }, rej, {task:"apps", disableTyping:true}); });'
            +   '} catch(e){ console.error("[app callAI]",e); return ""; } };'
            // ── 當前聊天室角色清單：[{name,count}]，做角色選單/搜尋用(繞懶載、不等大總結) ──
            +   'window.getCurrentChars = async function(){ try { var R = P && P.VN_READER; return (R && R.getCurrentChars) ? await R.getCurrentChars() : []; } catch(e){ console.error("[app getCurrentChars]",e); return []; } };'
            // ── 微信通訊錄（當前故事那本）：[{id,name,desc,avatar,isGroup}]，做選聯絡人清單用 ──
            +   'window.getContacts = async function(){ try { var F = P && P.VN_PANEL_FEED; return (F && F.contacts) ? await F.contacts() : []; } catch(e){ console.error("[app getContacts]",e); return []; } };'
            // ── 寫進／讀回當前世界書（同標題就改那條）；預覽不寫 ──
            +   'window.wbSave = async function(t,c,k){ try { if (window.__IS_PREVIEW) return true; var F = P && P.VN_PANEL_FEED; return (F && F.wbSave) ? await F.wbSave(t,c,k) : false; } catch(e){ console.error("[app wbSave]",e); return false; } };'
            +   'window.wbLoad = async function(t){ try { var F = P && P.VN_PANEL_FEED; return (F && F.wbLoad) ? await F.wbLoad(t) : ""; } catch(e){ console.error("[app wbLoad]",e); return ""; } };'
            // ── 讀當前劇情：回最近 n 條 [{name,text}]（共用面板「讀劇情顯示」用，不經 AI）──
            +   'window.getStory = function(n){ try { var ST=P.SillyTavern, c=ST&&ST.getContext&&ST.getContext(); if(!c||!Array.isArray(c.chat)) return []; var CL=(P.VN_READER&&P.VN_READER.clean)?P.VN_READER.clean:function(x){return x||"";}; return c.chat.filter(function(m){return m&&!m.is_system;}).slice(-(n||30)).map(function(m){return {name:String(m.name||(m.is_user?"我":"")), text:CL(m.mes||"")};}).filter(function(o){return o.text&&o.text.trim();}); } catch(e){ console.error("[app getStory]",e); return []; } };'
            // ── UI 小工具：toast/confirm/loading/esc（每個 app 共用、免重造；走掛載層→現有 app 也有、免重存）──
            +   'window.stEsc = function(s){ try{ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }catch(e){ return ""; } };'
            +   'window.stToast = function(msg, opts){ try{ if(P&&P.AUI) return P.AUI.toast(msg,opts); }catch(_e){} try{ opts=opts||{}; var d=document.createElement("div"); var bg=opts.color||(opts.type==="error"?"rgba(180,60,60,0.95)":"rgba(28,28,38,0.92)"); d.textContent=String(msg==null?"":msg); d.style.cssText="position:fixed;left:50%;bottom:32px;transform:translateX(-50%);max-width:80%;background:"+bg+";color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;line-height:1.4;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,0.25);opacity:0;transition:opacity .2s;pointer-events:none;text-align:center;"; document.body.appendChild(d); requestAnimationFrame(function(){ d.style.opacity="1"; }); setTimeout(function(){ d.style.opacity="0"; setTimeout(function(){ d.remove(); },250); }, opts.duration||2000); }catch(e){} };'
            +   'window.stConfirm = function(msg, opts){ try{ if(P&&P.AUI) return P.AUI.confirm(msg,opts); }catch(_e){} return new Promise(function(res){ try{ opts=opts||{}; var ov=document.createElement("div"); ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;"; var box=document.createElement("div"); box.style.cssText="background:#fff;color:#222;border-radius:14px;padding:18px;max-width:300px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,0.3);font-size:14px;line-height:1.5;"; var m=document.createElement("div"); m.textContent=String(msg==null?"":msg); m.style.cssText="margin-bottom:14px;white-space:pre-wrap;"; var row=document.createElement("div"); row.style.cssText="display:flex;gap:8px;justify-content:flex-end;"; var no=document.createElement("button"); no.textContent=opts.cancelText||"取消"; no.style.cssText="padding:8px 14px;border:1px solid rgba(0,0,0,0.2);background:#fff;color:#333;border-radius:8px;font-size:13px;cursor:pointer;"; var yes=document.createElement("button"); yes.textContent=opts.okText||"確定"; yes.style.cssText="padding:8px 14px;border:0;background:"+(opts.danger?"#c0392b":"#1A1C28")+";color:#fff;border-radius:8px;font-size:13px;cursor:pointer;"; no.onclick=function(){ ov.remove(); res(false); }; yes.onclick=function(){ ov.remove(); res(true); }; ov.onclick=function(e){ if(e.target===ov){ ov.remove(); res(false); } }; row.appendChild(no); row.appendChild(yes); box.appendChild(m); box.appendChild(row); ov.appendChild(box); document.body.appendChild(ov); }catch(e){ res(false); } }); };'
            +   'window.stLoading = function(target, on, text){ try{ var host=(typeof target==="string")?document.querySelector(target):(target||document.body); if(!host) return; if(on===false){ if(host.__stLoad){ host.__stLoad.remove(); host.__stLoad=null; } return; } if(host.__stLoad) return; if(getComputedStyle(host).position==="static") host.style.position="relative"; var ov=document.createElement("div"); ov.style.cssText="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(0,0,0,0.25);z-index:50;"; var sp=document.createElement("div"); sp.style.cssText="width:28px;height:28px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:__stspin .8s linear infinite;"; ov.appendChild(sp); if(text){ var t=document.createElement("div"); t.textContent=text; t.style.cssText="color:#fff;font-size:12px;"; ov.appendChild(t); } if(!document.getElementById("__stspin_kf")){ var k=document.createElement("style"); k.id="__stspin_kf"; k.textContent="@keyframes __stspin{to{transform:rotate(360deg)}}"; document.head.appendChild(k); } host.__stLoad=ov; host.appendChild(ov); }catch(e){} };'
            // ── generateRaw 仍橋接(進階 app 指名要它才用；預設請用 callAI) ──
            +   'if (!window.generateRaw) window.generateRaw = function(cfg){ var Q=window.parent; if (Q && Q.TavernHelper && Q.TavernHelper.generateRaw) return Q.TavernHelper.generateRaw(cfg); if (Q && Q.generateRaw) return Q.generateRaw(cfg); return Promise.reject(new Error("no generateRaw")); };'
            // ── 版面：強制 app 撐滿手機螢幕。修「面板用 min-height:100% 但 #app-root 無確定高度→百分比解析不到→底下露白」。
            //    🚨 撐滿那條只給「整個 app 包在同一個根容器裡」的那種（:only-child）。
            //    以前寫成「最外層每個區塊都平均長高」，結果 app 把標題列／內容／底部三段平鋪時，
            //    三段被拉成一樣高——標題列變成一大塊、內容擠在中間，就是她說的「創作室做的應用打開就是塌的」。
            //    而且那條是 id 選擇器，權重壓過面板自己寫的「標題列不要被拉長」，面板寫對了也沒用。
            //    創作室預覽那邊沒有這條，所以預覽好好的、裝成 app 才壞，兩邊對不起來。
            //    DOMContentLoaded 後補(排在 app 自己 style 之後→同 specificity 後者贏)，所有現有 app 自動套、免重存。
            +   'document.addEventListener("DOMContentLoaded", function(){ try { var _s=document.createElement("style"); _s.textContent="html,body{height:100%;}#app-root{display:flex;flex-direction:column;height:100%;box-sizing:border-box;}#app-root>:only-child{flex:1 1 auto;min-height:0;}*{scrollbar-width:thin;scrollbar-color:rgba(140,140,140,0.5) transparent;}::-webkit-scrollbar{width:8px;height:8px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(140,140,140,0.45);border-radius:4px;}::-webkit-scrollbar-thumb:hover{background:rgba(140,140,140,0.7);}"; document.head.appendChild(_s); } catch(e){} });'
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
        if (opts.appId) iframe.dataset.appId = String(opts.appId);   // 「自己動」要知道她是不是正開著這個 app
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals');
        // 橋接 bootstrap 要在 app 自身 script 前跑，且不能擠在 <!DOCTYPE> 之前(會觸發 quirks mode 壞版面)；
        // 有 <head> 就插進 head 開頭、否則退回最前面。
        const boot = _bridgeScript(opts);
        const src = String(html == null ? '' : html);
        iframe.srcdoc = /<head[^>]*>/i.test(src) ? src.replace(/<head[^>]*>/i, function (m) { return m + boot; }) : (boot + src);
        // 手機桌面開的 app 會整頁被推到狀態列底下（見 phone_shell.css），上面讓出來那一條要有顏色，
        // 不然時間訊號電池會坐在一條跟 app 完全無關的白上。進去抄 app 自己的底色塗回外框。
        iframe.addEventListener('load', function () {
            try {
                if (!container.classList || !container.classList.contains('aps-mount')) return;
                const d = iframe.contentDocument;
                if (!d || !d.body) return;
                const bg = win.getComputedStyle(d.body).backgroundColor;
                const m = String(bg).match(/[\d.]+/g);
                if (m && (m[3] === undefined || parseFloat(m[3]) > 0.5)) container.style.background = bg;
            } catch (e) {}
        });
        container.appendChild(iframe);
        return function cleanup() { try { iframe.remove(); } catch (e) {} };
    }

    win.AppRuntime = { mountAppIframe: mountAppIframe };
    console.log('✅ AppRuntime（app iframe 執行器）模組就緒');
})();
