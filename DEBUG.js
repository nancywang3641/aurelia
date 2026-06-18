(function(){'use strict';
var W=window.parent||window,D=W.document;
if(W.__SDBG__){if(W.SDBG)W.SDBG.show();return;}
W.__SDBG__=true;
var LOG=[],EXP={},SEQ=0,MAX=500,open=false,panel=null,body=null,btn=null,tab='console',SECEXP={},refreshTimer=null;
function tfmt(ms){try{return new Date(ms).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch(e){return'';}}
function fmt(a){if(typeof a==='string')return a;if(a instanceof Error)return a.message+(a.stack?('\n'+a.stack):'');try{return JSON.stringify(a);}catch(e){return String(a);}}
function now(){try{return new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch(e){return'';}}
function push(ty,ar){try{LOG.push({id:++SEQ,ty:ty,t:now(),m:Array.prototype.map.call(ar,fmt).join(' ')});if(LOG.length>MAX){var d=LOG.shift();if(d)delete EXP[d.id];}render();}catch(e){}}
['log','warn','error','info'].forEach(function(k){var o=(W.console[k]&&W.console[k].bind)?W.console[k].bind(W.console):function(){};W.console[k]=function(){try{o.apply(null,arguments);}catch(e){}push(k,arguments);};});
W.addEventListener('error',function(e){push('error',['[err] '+(e.message||'')+' @ '+(e.filename||'')+':'+(e.lineno||'')]);});
W.addEventListener('unhandledrejection',function(e){var r=e&&e.reason;push('error',['[reject] '+((r&&r.message)||fmt(r))]);});
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function st(){if(D.getElementById('sdbg-style'))return;var s=D.createElement('style');s.id='sdbg-style';s.textContent='#sdbg-btn{position:fixed;right:8px;bottom:8px;z-index:2147483647;width:34px;height:34px;border-radius:50%;background:rgba(20,20,25,.88);border:1px solid rgba(120,200,120,.6);color:#fff;font-size:17px;display:flex;align-items:center;justify-content:center;cursor:pointer;line-height:1}#sdbg-panel{position:fixed;right:8px;bottom:48px;z-index:2147483647;width:min(94vw,560px);height:min(62vh,440px);background:rgba(8,8,10,.97);border:1px solid rgba(120,200,120,.5);border-radius:6px;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.75);overflow:hidden}#sdbg-bar{display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.1)}#sdbg-bar .t{color:#a8e8a8;font-size:12px;letter-spacing:1px;font-family:monospace}#sdbg-bar .sp{flex:1}#sdbg-bar .tab{background:transparent;border:1px solid rgba(120,200,120,.25);color:#8aa88a;font-size:11px;padding:3px 9px;cursor:pointer;border-radius:4px}#sdbg-bar .tab.on{background:rgba(120,200,120,.28);color:#cfeecf;border-color:rgba(120,200,120,.6)}#sdbg-bar button{background:rgba(120,200,120,.15);border:1px solid rgba(120,200,120,.4);color:#a8e8a8;border-radius:4px;font-size:12px;padding:3px 10px;cursor:pointer}#sdbg-body{flex:1;overflow:auto;padding:6px 8px;font:11px/1.5 monospace;color:#cfcfcf}#sdbg-body .row{padding:1px 0;white-space:pre-wrap;word-break:break-all;border-bottom:1px solid rgba(255,255,255,.04)}#sdbg-body .col{cursor:pointer}#sdbg-body .col:hover{background:rgba(255,255,255,.05)}#sdbg-body .ar{color:#7aa}#sdbg-body .mo{color:#888}#sdbg-body .e{color:#ff8080}#sdbg-body .w{color:#f6c177}#sdbg-body .i{color:#80c0ff}#sdbg-body .sec-ok{color:#a8e8a8}#sdbg-body .sec-err{color:#ff8080}#sdbg-body .sec-run{color:#f6c177}#sdbg-body .sec-meta{color:#888}#sdbg-body .sec-prompt{color:#8fb0b0;margin-top:4px;padding-top:4px;border-top:1px dashed rgba(255,255,255,.14)}';D.head.appendChild(s);}
function ui(){if(panel||!D.body)return;st();
btn=D.createElement('div');btn.id='sdbg-btn';btn.textContent='🐛';btn.onclick=function(){open?hide():show();};
panel=D.createElement('div');panel.id='sdbg-panel';panel.style.display='none';
var bar=D.createElement('div');bar.id='sdbg-bar';var t=D.createElement('span');t.className='t';t.textContent='DEBUG';bar.appendChild(t);
var tabC=D.createElement('button');tabC.className='tab on';tabC.textContent='Console';
var tabS=D.createElement('button');tabS.className='tab';tabS.textContent='副模型';
tabC.onclick=function(){tab='console';tabC.className='tab on';tabS.className='tab';render();};
tabS.onclick=function(){tab='sec';tabS.className='tab on';tabC.className='tab';render();};
bar.appendChild(tabC);bar.appendChild(tabS);
var sp=D.createElement('span');sp.className='sp';bar.appendChild(sp);
var c=D.createElement('button');c.textContent='複製';c.onclick=function(){var tx;if(tab==='sec'){tx=(W.AURELIA_SEC_LOG||[]).map(function(r){return '['+tfmt(r.t)+'] '+(r.ok===null?'進行中…':(r.ok?('OK '+r.ms+'ms'):('ERR '+(r.err||''))))+'\n'+(r.ok?String(r.raw||''):'')+(r.prompt?('\n--- 送出 prompt ---\n'+r.prompt):'');}).join('\n\n────────\n\n');}else{tx=LOG.map(function(l){return '['+l.t+']['+l.ty+'] '+l.m;}).join('\n');}try{navigator.clipboard.writeText(tx);c.textContent='已複製';setTimeout(function(){c.textContent='複製';},1500);}catch(e){c.textContent='失敗';}};
var cl=D.createElement('button');cl.textContent='清空';cl.onclick=function(){if(tab==='sec'){if(W.AURELIA_SEC_LOG)W.AURELIA_SEC_LOG.length=0;SECEXP={};}else{LOG.length=0;EXP={};}render();};
var x=D.createElement('button');x.textContent='✕';x.onclick=hide;bar.appendChild(c);bar.appendChild(cl);bar.appendChild(x);
body=D.createElement('div');body.id='sdbg-body';
body.addEventListener('click',function(ev){var r=ev.target&&ev.target.closest?ev.target.closest('.col'):null;if(!r)return;var sid=r.getAttribute('data-sec');if(sid){if(SECEXP[sid])delete SECEXP[sid];else SECEXP[sid]=1;render();return;}var id=r.getAttribute('data-id');if(EXP[id])delete EXP[id];else EXP[id]=1;render();});
panel.appendChild(bar);panel.appendChild(body);D.body.appendChild(btn);D.body.appendChild(panel);}
function renderSec(){var A=(W.AURELIA_SEC_LOG||[]);if(!A.length)return '<div class="row mo">（還沒有副模型輸出。觸發一次記憶抽取／場景插圖後就會出現。每筆可點開看完整輸出＋送出的 prompt）</div>';
return A.map(function(r){var k=String(r.id!=null?r.id:r.t);var tm='['+tfmt(r.t)+'] ';
var stat=r.ok===null?'<span class="sec-run">⏳ 進行中…</span>':(r.ok?'<span class="sec-ok">✓ '+r.ms+'ms</span>':'<span class="sec-err">✗ '+esc(r.err||'錯誤')+'</span>');
var out=r.ok?String(r.raw||''):'';var inLen=r.prompt?String(r.prompt).length:0;var meta=' <span class="sec-meta">(送 '+inLen+'字 → 回 '+out.length+'字)</span>';
if(!SECEXP[k]){var prev=out.replace(/\s+/g,' ').slice(0,120);return '<div class="row col" data-sec="'+k+'">'+esc(tm)+stat+meta+'<span class="ar"> ▶</span>'+(prev?('\n'+esc(prev)):'')+'</div>';}
var pb=r.prompt?('<div class="sec-prompt">📤 送出 prompt：\n'+esc(String(r.prompt))+'</div>'):'';
return '<div class="row col" data-sec="'+k+'">'+esc(tm)+stat+meta+'<span class="ar"> ▼</span>\n'+esc(out)+pb+'</div>';}).join('');}
function render(){if(!body||!open)return;var atB=body.scrollTop+body.clientHeight>=body.scrollHeight-30;
if(tab==='sec'){body.innerHTML=renderSec();if(atB)body.scrollTop=body.scrollHeight;return;}
body.innerHTML=LOG.map(function(l){var cls=l.ty==='error'?'e':(l.ty==='warn'?'w':(l.ty==='info'?'i':''));var head='['+l.t+'] ';var big=l.m.length>180||l.m.indexOf('\n')>=0;
if(!big)return '<div class="row '+cls+'">'+esc(head+l.m)+'</div>';
if(EXP[l.id])return '<div class="row col '+cls+'" data-id="'+l.id+'">'+esc(head)+'<span class="ar">▼ </span>'+esc(l.m)+'</div>';
var prev=l.m.replace(/\s+/g,' ').slice(0,120);return '<div class="row col '+cls+'" data-id="'+l.id+'">'+esc(head)+'<span class="ar">▶ </span>'+esc(prev)+'<span class="mo">… ('+l.m.length+'字)</span></div>';}).join('');
if(atB)body.scrollTop=body.scrollHeight;}
function show(){ui();open=true;if(panel)panel.style.display='flex';render();if(!refreshTimer)refreshTimer=setInterval(function(){if(open&&tab==='sec')render();},1000);}
function hide(){open=false;if(panel)panel.style.display='none';if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null;}}
W.SDBG={show:show,hide:hide,clear:function(){LOG.length=0;EXP={};render();},get:function(){return LOG.slice();}};
if(D.body)ui();else W.addEventListener('DOMContentLoaded',ui);
W.console.log('[SDBG] 獨立螢幕 console 就緒（長訊息可點開）');})();