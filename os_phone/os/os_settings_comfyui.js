// ----------------------------------------------------------------
// [檔案] os_settings_comfyui.js — 系統設置 🧩 ComfyUI 直連設定（2026-07-17 自 os_settings.js 拆出）
// 職責：LoRA 行＋測試連線/抓模型清單；預設包（modal/grid/另存/覆蓋/匯出入/清空/風格預覽/拖圖還原工作流）；
//       char/scene/bg/map 四桶各自設定＋切換（包庫全域一份）。
// 依賴：參數注入 ctx = { imgConfig, container }（都是 os_settings.js launchApp 的閉包變數，開面板時組好傳入）；
//       入口＝window.OS_SETTINGS_COMFY.wire(ctx)。對外照舊發布 window._cfdPreset/_cfdSwitchBucket/
//       _cfdSetActivePreset/_cfdCollectBuckets（HTML onclick 與核心存檔/測試呼叫點不變），
//       另加 window._cfdGetPresets 給核心存檔收包庫（cfdPresets 原是閉包變數）。
//       載入順序排 os_settings.js 之後（index.js PHONE_FILES）；wire 在 launchApp 執行期才被呼叫。
// ----------------------------------------------------------------
(function () {
    'use strict';

    function wire(ctx) {
        const imgConfig = ctx.imgConfig;   // launchApp 的 loadImageConfig() 結果（os_image_config）
        const container = ctx.container;   // 設定面板根 DOM

        // ===== ComfyUI 直連：LoRA 行 + 測試連線 =====
        let cfdPresets = [...((imgConfig.comfyuiDirect && imgConfig.comfyuiDirect.presets) || [])];
        // 🧷 包庫＝全域一份（Rae 鐵則：各桶可以各記「套用哪個包」，但包庫本身絕不分家）。
        //   舊版「每桶各自包庫」把庫拆成四份副本 → 在插圖桶加的包別桶看不到＝「加了幾條發現不見」。
        //   遷移：啟動時把四桶裡散落的包全部併回同一庫（id/名字去重），之後桶不再自帶包庫。
        (function(){
            try {
                const bk = imgConfig.comfyuiDirect && imgConfig.comfyuiDirect.buckets;
                if (!bk || typeof bk !== 'object') return;
                const keyOf = p => (p && (p.id || p.name)) || '';
                const seen = new Set(cfdPresets.map(keyOf).filter(Boolean));
                Object.values(bk).forEach(b => {
                    (b && Array.isArray(b.presets) ? b.presets : []).forEach(p => {
                        const k = keyOf(p);
                        if (!k || seen.has(k)) return;
                        seen.add(k); cfdPresets.push(p);
                    });
                });
            } catch (e) {}
        })();
        (function setupComfyDirect(){
            const cfd = (imgConfig && imgConfig.comfyuiDirect) || ((window.parent || window).OS_IMAGE_MANAGER && (window.parent || window).OS_IMAGE_MANAGER.config && (window.parent || window).OS_IMAGE_MANAGER.config.comfyuiDirect) || {};
            const lorasBox = container.querySelector('#img-cfd-loras');
            function escAttr(s){ return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
            // 模型類型（標準/Flux）：切換 Flux 欄位 + 依類型過濾模型下拉（checkpoint vs UNet）
            let lastModels = null;
            function curType(){ const t = container.querySelector('#img-cfd-type'); return (t && t.value) || 'checkpoint'; }
            function refreshModels(){
                if (!Array.isArray(lastModels)) return;
                const isUnet = (curType() === 'flux' || curType() === 'anima');
                const arr = lastModels.filter(function(x){ const t = (x && x.text) || ''; return isUnet ? /^UNet:/i.test(t) : !/^(UNet|GGUF):/i.test(t); });
                const sel = container.querySelector('#img-cfd-model');
                if (!sel) return;
                const cur = sel.value;
                let opts = arr.map(function(x){ return (x && x.value != null) ? x.value : x; });
                if (cur && opts.indexOf(cur) === -1) opts.push(cur);
                sel.innerHTML = opts.map(function(v){ return '<option value="' + escAttr(v) + '"' + (v === cur ? ' selected' : '') + '>' + escAttr(v) + '</option>'; }).join('');
            }
            const typeSel = container.querySelector('#img-cfd-type');
            if (typeSel) typeSel.addEventListener('change', function(){
                const ff = container.querySelector('#img-cfd-flux-fields');
                if (ff) ff.classList.toggle('hidden', typeSel.value !== 'flux');
                const af = container.querySelector('#img-cfd-anima-fields');
                if (af) af.classList.toggle('hidden', typeSel.value !== 'anima');
                refreshModels();
            });
            // 工作流模式：自訂時顯示貼上框
            const wfModeSel = container.querySelector('#img-cfd-wfmode');
            if (wfModeSel) wfModeSel.addEventListener('change', function(){
                const box = container.querySelector('#img-cfd-custom-wf');
                if (box) box.classList.toggle('hidden', wfModeSel.value !== 'custom');
            });
            function makeLoraRow(L){
                L = L || { on: true, name: '', strengthModel: 1, strengthClip: 1 };
                const row = document.createElement('div');
                row.className = 'cfd-lora-row';
                // 兩行式（手機窄屏友善）：第一行 勾選+名字(拉滿)+刪除；第二行 模型/CLIP 強度帶中文標籤。靠 row 的 flex-wrap + 第二行 100% 寬強制換行
                row.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px 6px; align-items:center; margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed rgba(26,28,40,0.12);';
                row.innerHTML =
                    '<input type="checkbox" class="cfd-lora-on" ' + (L.on !== false ? 'checked' : '') + ' title="啟用" style="margin:0 2px; flex:0 0 auto;">' +
                    '<input type="text" class="cfd-lora-name set-input" list="img-cfd-lora-list" placeholder="LoRA 檔名" value="' + escAttr(L.name) + '" style="flex:1 1 0; min-width:0;">' +
                    '<button type="button" class="cfd-lora-del" title="刪除" style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:18px;padding:0 4px; flex:0 0 auto;">✕</button>' +
                    '<div style="flex:1 1 100%; display:flex; gap:6px; align-items:center; padding-left:24px;">' +
                        '<span style="font-size:11px; color:rgba(26,28,40,0.7); white-space:nowrap;">模型</span>' +
                        '<input type="number" class="cfd-lora-sm set-input" step="0.1" min="0" max="2" value="' + (L.strengthModel != null ? L.strengthModel : 1) + '" title="模型強度" style="width:60px; flex:0 0 auto;">' +
                        '<span style="font-size:11px; color:rgba(26,28,40,0.7); white-space:nowrap; margin-left:6px;">CLIP</span>' +
                        '<input type="number" class="cfd-lora-sc set-input" step="0.1" min="0" max="2" value="' + (L.strengthClip != null ? L.strengthClip : 1) + '" title="CLIP強度" style="width:60px; flex:0 0 auto;">' +
                    '</div>';
                row.querySelector('.cfd-lora-del').addEventListener('click', function(){ row.remove(); });
                return row;
            }
            if (lorasBox) {
                lorasBox.innerHTML = '';
                (Array.isArray(cfd.loras) ? cfd.loras : []).forEach(function(L){ lorasBox.appendChild(makeLoraRow(L)); });
            }
            const addBtn = container.querySelector('#img-cfd-add-lora');
            if (addBtn) addBtn.addEventListener('click', function(){ if (lorasBox) lorasBox.appendChild(makeLoraRow()); });

            const testBtn = container.querySelector('#img-cfd-test');
            const statusEl = container.querySelector('#img-cfd-status');
            if (testBtn) testBtn.addEventListener('click', async function(){
                const url = (container.querySelector('#img-cfd-url')?.value || '').trim();
                if (!url) { if (statusEl) statusEl.textContent = '請先填網址'; return; }
                if (statusEl) statusEl.textContent = '⏳ 連線中…';
                const W = window.parent || window;
                const IM = W.OS_IMAGE_MANAGER;
                if (!IM || !IM.fetchComfyLists) { if (statusEl) statusEl.textContent = '❌ 圖片引擎未載入'; return; }
                const fillDatalist = function(id, arr, useValue){
                    const dl = container.querySelector('#' + id);
                    if (!dl || !Array.isArray(arr)) return 0;
                    dl.innerHTML = arr.map(function(x){ const v = useValue ? (x && x.value != null ? x.value : x) : x; return '<option value="' + escAttr(v) + '">'; }).join('');
                    return arr.length;
                };
                const fillSelect = function(id, arr, useValue, addEmpty){
                    const sel = container.querySelector('#' + id);
                    if (!sel || !Array.isArray(arr)) return 0;
                    const cur = sel.value;
                    let opts = arr.map(function(x){ return useValue ? (x && x.value != null ? x.value : x) : x; });
                    if (addEmpty) opts.unshift('');
                    if (cur && opts.indexOf(cur) === -1) opts.push(cur);
                    sel.innerHTML = opts.map(function(v){ const lbl = (v === '' ? '（內建 VAE）' : v); return '<option value="' + escAttr(v) + '"' + (v === cur ? ' selected' : '') + '>' + escAttr(lbl) + '</option>'; }).join('');
                    return arr.length;
                };
                let models = null, samplers = null, schedulers = null, vaes = null, loras = null;
                try {
                    const lists = await IM.fetchComfyLists(url);
                    models = lists.models; samplers = lists.samplers; schedulers = lists.schedulers; vaes = lists.vaes; loras = lists.loras;
                } catch (e) {
                    if (statusEl) statusEl.textContent = '❌ 連不上：' + (e.message || e) + '（瀏覽器直連需 ComfyUI 開 --enable-cors-header）';
                    return;
                }
                if (models === null && samplers === null) { if (statusEl) statusEl.textContent = '❌ 連不上（檢查網址、ComfyUI 開著沒）'; return; }
                lastModels = models || [];
                refreshModels();
                const mc = (Array.isArray(models) ? models.length : 0);
                if (samplers) fillSelect('img-cfd-sampler', samplers, false, false);
                if (schedulers) fillSelect('img-cfd-scheduler', schedulers, false, false);
                if (vaes) fillSelect('img-cfd-vae', vaes, false, true);
                const lc = fillDatalist('img-cfd-lora-list', loras || [], false);
                if (statusEl) statusEl.textContent = '✅ 連上！模型 ' + mc + ' 個' + (loras ? ('、LoRA ' + lc + ' 個可下拉') : '（LoRA 清單酒館未提供→手打檔名）');
            });

            // ── 預設包：modal + grid + 風格預覽縮圖 ──
            const setVal = function(id, v){ const el = container.querySelector(id); if (el && v !== undefined) el.value = v; };
            const setSelectVal = function(id, v){ // select：值不在選項就先補一個 option 再選
                const sel = container.querySelector(id); if (!sel || v == null) return;
                if (![].slice.call(sel.options).some(function(o){ return o.value === String(v); })) {
                    const o = document.createElement('option'); o.value = v; o.textContent = (v === '' ? '（內建 VAE）' : v); sel.appendChild(o);
                }
                sel.value = v;
            };
            // 從面板目前欄位打包一個預設包物件（另存 / 覆蓋 共用）
            function buildCfdPreset(name){
                const g  = function(id){ return (container.querySelector(id)?.value || '').trim(); };
                const gi = function(id, d){ const v = parseInt(container.querySelector(id)?.value ?? d); return isNaN(v) ? d : v; };
                const gf = function(id, d){ const v = parseFloat(container.querySelector(id)?.value ?? d); return isNaN(v) ? d : v; };
                return {
                    name: name,
                    modelType: g('#img-cfd-type') || 'checkpoint',
                    model:     g('#img-cfd-model'),
                    vae:       g('#img-cfd-vae'),
                    sampler:   g('#img-cfd-sampler') || 'euler',
                    scheduler: g('#img-cfd-scheduler') || 'normal',
                    steps:     gi('#img-cfd-steps', 28),
                    cfg:       gf('#img-cfd-cfg', 6.5),
                    width:     gi('#img-cfd-width', 1024),
                    height:    gi('#img-cfd-height', 1024),
                    clipSkip:  gi('#img-cfd-clipskip', 0),
                    basePrompt:g('#img-cfd-base'),
                    negPrompt: g('#img-cfd-neg'),
                    fluxClipL: g('#img-cfd-clipl') || 'clip_l.safetensors',
                    fluxT5:    g('#img-cfd-t5xxl') || 't5xxl_fp8_e4m3fn.safetensors',
                    fluxAe:    g('#img-cfd-ae') || 'ae.safetensors',
                    guidance:  gf('#img-cfd-guidance', 3.5),
                    animaClip: g('#img-cfd-anima-clip') || 'qwen_3_06b_base.safetensors',
                    animaVae:  g('#img-cfd-anima-vae') || 'qwen_image_vae.safetensors',
                    loras: Array.from(container.querySelectorAll('#img-cfd-loras .cfd-lora-row')).map(function(r){ return {
                        on:   r.querySelector('.cfd-lora-on')?.checked ?? true,
                        name: (r.querySelector('.cfd-lora-name')?.value || '').trim(),
                        strengthModel: parseFloat(r.querySelector('.cfd-lora-sm')?.value ?? 1),
                        strengthClip:  parseFloat(r.querySelector('.cfd-lora-sc')?.value ?? 1)
                    }; }).filter(function(l){ return l.name; }),
                    // 自訂模式時把整份工作流也存進預設包（拖圖還原的卡靠這個攜帶）
                    customWorkflow: (g('#img-cfd-wfmode') === 'custom') ? g('#img-cfd-custom-wf-text') : ''
                };
            }
            function getPreviewPrompt(){
                const el = container.querySelector('#img-cfd-preview-prompt');
                return (el && el.value.trim()) || '1 person, upper body portrait, looking at viewer, simple background';
            }
            // 把 ComfyUI API 工作流「拆解」成面板可編輯的預設卡欄位（模型/LoRA/採樣器/步數/CFG/尺寸/正負提示詞…）
            // → 載入後每一格都能在奧瑞亞面板調，不丟工作流。認得標準 KSampler + Checkpoint/Flux/Anima 三種載入法。
            // 回傳 { preset, parsed:{model,sampler,prompt,...哪些抓到了} }；抓不到的欄位留合理預設。
            function parseComfyApiToPreset(api, fallbackName){
                const g = api || {};
                const get = function(id){ return g[id]; };
                const idOf = function(ref){ return (Array.isArray(ref) && ref.length) ? String(ref[0]) : null; };
                const byType = function(types){
                    const ids = Object.keys(g);
                    for (let i = 0; i < ids.length; i++){ const n = g[ids[i]]; if (n && types.indexOf(n.class_type) >= 0) return { id: ids[i], node: n }; }
                    return null;
                };
                const p = {
                    name: fallbackName || 'ComfyUI', modelType: 'checkpoint', model: '', vae: '',
                    sampler: 'euler', scheduler: 'normal', steps: 28, cfg: 6.5,
                    width: 1024, height: 1024, clipSkip: 0, basePrompt: '', negPrompt: '',
                    fluxClipL: '', fluxT5: '', fluxAe: '', guidance: 3.5,
                    animaClip: '', animaVae: '', loras: [], customWorkflow: ''
                };
                const parsed = { model:false, sampler:false, prompt:false, size:false, loras:0 };
                // 沿提示詞鏈往回找 CLIPTextEncode 的文字（可能中間隔 FluxGuidance/Conditioning* 節點）
                function extractText(startId){
                    let id = startId, hop = 0;
                    while (id && hop++ < 6){
                        const n = get(id); if (!n) break;
                        if (n.class_type === 'CLIPTextEncode') return String((n.inputs && n.inputs.text) || '');
                        const inp = n.inputs || {};
                        id = idOf(inp.conditioning || inp.conditioning_1 || inp.cond);
                    }
                    return '';
                }
                // 沿 model 鏈往回：收集 LoraLoader，走到底層 Checkpoint/UNET 載入器
                function walkModel(startId){
                    let id = startId, hop = 0;
                    while (id && hop++ < 16){
                        const n = get(id); if (!n) break;
                        const ct = n.class_type, inp = n.inputs || {};
                        if (ct === 'LoraLoader' || ct === 'LoraLoaderModelOnly'){
                            p.loras.push({ on:true, name:String(inp.lora_name||''),
                                strengthModel:(typeof inp.strength_model==='number'?inp.strength_model:1),
                                strengthClip:(typeof inp.strength_clip==='number'?inp.strength_clip:1) });
                            id = idOf(inp.model); continue;
                        }
                        if (ct === 'CheckpointLoaderSimple'){ p.modelType='checkpoint'; p.model=String(inp.ckpt_name||''); parsed.model=true; break; }
                        if (ct === 'UNETLoader'){ p.model=String(inp.unet_name||''); parsed.model=true; break; }
                        id = idOf(inp.model);  // 未知中繼(ModelSamplingFlux 等)→繼續往回
                    }
                    p.loras.reverse();  // 由近到遠→還原載入順序
                }
                // 取樣器：抓步數/CFG/採樣器/排程 + 提示詞 + 尺寸 + model 鏈
                const samp = byType(['KSampler','KSamplerAdvanced']);
                if (samp){
                    const inp = samp.node.inputs || {};
                    if (typeof inp.steps === 'number'){ p.steps = inp.steps; parsed.sampler = true; }
                    if (typeof inp.cfg === 'number') p.cfg = inp.cfg;
                    if (inp.sampler_name){ p.sampler = String(inp.sampler_name); parsed.sampler = true; }
                    if (inp.scheduler) p.scheduler = String(inp.scheduler);
                    p.basePrompt = extractText(idOf(inp.positive));
                    p.negPrompt  = extractText(idOf(inp.negative));
                    if (p.basePrompt || p.negPrompt) parsed.prompt = true;
                    const latN = get(idOf(inp.latent_image));
                    if (latN && latN.inputs){ if (typeof latN.inputs.width==='number'){ p.width=latN.inputs.width; parsed.size=true; } if (typeof latN.inputs.height==='number'){ p.height=latN.inputs.height; parsed.size=true; } }
                    walkModel(idOf(inp.model));
                }
                // 模型類型 + 專用檔（Flux=UNET+DualCLIP、Anima=UNET+單CLIPLoader）
                const unet = byType(['UNETLoader']), dual = byType(['DualCLIPLoader']), single = byType(['CLIPLoader']);
                if (unet){
                    if (dual){ p.modelType='flux'; p.fluxClipL=String(dual.node.inputs.clip_name1||''); p.fluxT5=String(dual.node.inputs.clip_name2||''); }
                    else if (single){ p.modelType='anima'; p.animaClip=String(single.node.inputs.clip_name||''); }
                    else p.modelType='flux';
                }
                // 沒經取樣器 model 鏈也補抓一次底層載入器
                if (!p.model){
                    const ck = byType(['CheckpointLoaderSimple']);
                    if (ck){ p.modelType='checkpoint'; p.model=String(ck.node.inputs.ckpt_name||''); parsed.model=true; }
                    else if (unet){ p.model=String(unet.node.inputs.unet_name||''); parsed.model=true; }
                }
                // clipSkip（CLIPSetLastLayer 的 stop_at_clip_layer 是負數 → 取絕對值）
                const csl = byType(['CLIPSetLastLayer']);
                if (csl && typeof csl.node.inputs.stop_at_clip_layer==='number') p.clipSkip = Math.abs(csl.node.inputs.stop_at_clip_layer);
                // FluxGuidance
                const fg = byType(['FluxGuidance']);
                if (fg && typeof fg.node.inputs.guidance==='number') p.guidance = fg.node.inputs.guidance;
                // VAE：依模型類型放對欄位
                const vae = byType(['VAELoader']);
                if (vae && vae.node.inputs.vae_name){
                    const vn = String(vae.node.inputs.vae_name);
                    if (p.modelType==='flux') p.fluxAe = vn; else if (p.modelType==='anima') p.animaVae = vn; else p.vae = vn;
                }
                p.loras = p.loras.filter(function(l){ return l.name; });
                parsed.loras = p.loras.length;
                return { preset: p, parsed: parsed };
            }
            // File → dataURL（給拖圖預覽縮圖用）
            function fileToDataUrl(file){
                return new Promise(function(resolve, reject){
                    const r = new FileReader();
                    r.onload = function(){ resolve(String(r.result)); };
                    r.onerror = function(){ reject(new Error('讀檔失敗')); };
                    r.readAsDataURL(file);
                });
            }
            // 把預設包填回面板（套用）
            function applyPresetToPanel(p){
                if (!p) return;
                const mt = p.modelType || 'checkpoint';
                setVal('#img-cfd-type', mt);
                const ff = container.querySelector('#img-cfd-flux-fields');
                if (ff) ff.classList.toggle('hidden', mt !== 'flux');
                const af = container.querySelector('#img-cfd-anima-fields');
                if (af) af.classList.toggle('hidden', mt !== 'anima');
                refreshModels();
                setSelectVal('#img-cfd-model', p.model || '');
                setSelectVal('#img-cfd-vae', p.vae || '');
                setSelectVal('#img-cfd-sampler', p.sampler || 'euler');
                setSelectVal('#img-cfd-scheduler', p.scheduler || 'normal');
                setVal('#img-cfd-steps', p.steps != null ? p.steps : 28);
                setVal('#img-cfd-cfg', p.cfg != null ? p.cfg : 6.5);
                setVal('#img-cfd-width', p.width != null ? p.width : 1024);
                setVal('#img-cfd-height', p.height != null ? p.height : 1024);
                setVal('#img-cfd-clipskip', p.clipSkip != null ? p.clipSkip : 0);
                setVal('#img-cfd-base', p.basePrompt || '');
                setVal('#img-cfd-neg', p.negPrompt || '');
                setVal('#img-cfd-clipl', p.fluxClipL || 'clip_l.safetensors');
                setVal('#img-cfd-t5xxl', p.fluxT5 || 't5xxl_fp8_e4m3fn.safetensors');
                setVal('#img-cfd-ae', p.fluxAe || 'ae.safetensors');
                setVal('#img-cfd-guidance', p.guidance != null ? p.guidance : 3.5);
                setVal('#img-cfd-anima-clip', p.animaClip || 'qwen_3_06b_base.safetensors');
                setVal('#img-cfd-anima-vae', p.animaVae || 'qwen_image_vae.safetensors');
                if (lorasBox) { lorasBox.innerHTML = ''; (Array.isArray(p.loras) ? p.loras : []).forEach(function(L){ lorasBox.appendChild(makeLoraRow(L)); }); }
                // 工作流模式：優先尊重 p.workflowMode（桶會明確帶）；沒帶才用「有無 customWorkflow」推斷(拖圖還原的卡)
                const wfSel = container.querySelector('#img-cfd-wfmode');
                const wfBox = container.querySelector('#img-cfd-custom-wf');
                const wfTa  = container.querySelector('#img-cfd-custom-wf-text');
                const _wantCustom = (p.workflowMode != null) ? (p.workflowMode === 'custom') : !!p.customWorkflow;
                if (_wantCustom) {
                    if (wfTa)  wfTa.value = p.customWorkflow || '';
                    if (wfSel) wfSel.value = 'custom';
                    if (wfBox) wfBox.classList.remove('hidden');
                } else {
                    if (wfTa)  wfTa.value = p.customWorkflow || '';   // 留著內容但不切自訂（auto 桶通常已清空）
                    if (wfSel) wfSel.value = 'auto';
                    if (wfBox) wfBox.classList.add('hidden');
                }
            }
            // 把生成的圖縮成 ~256px JPEG 縮圖（避免 localStorage 爆肥）
            function toThumb(dataUrl){
                return new Promise(function(resolve){
                    try {
                        const img = new Image();
                        img.onload = function(){
                            const max = 256; let w = img.width, h = img.height;
                            if (w >= h) { if (w > max){ h = Math.round(h*max/w); w = max; } }
                            else { if (h > max){ w = Math.round(w*max/h); h = max; } }
                            const c = document.createElement('canvas'); c.width = w; c.height = h;
                            c.getContext('2d').drawImage(img, 0, 0, w, h);
                            resolve(c.toDataURL('image/jpeg', 0.7));
                        };
                        img.onerror = function(){ resolve(dataUrl); };
                        img.src = dataUrl;
                    } catch(e){ resolve(dataUrl); }
                });
            }
            function cardStatus(i, msg){
                const el = container.querySelector('.cfd-card-status[data-idx="' + i + '"]');
                if (el) el.textContent = msg || '';
            }
            function renderPresetGrid(){
                const grid = container.querySelector('#img-cfd-preset-grid');
                if (!grid) return;
                const openBtn = container.querySelector('#img-cfd-preset-open');
                if (openBtn) openBtn.textContent = '📦 打開預設包（' + cfdPresets.length + ' 個）';
                if (!cfdPresets.length) { grid.innerHTML = '<div style="grid-column:1/-1; color:rgba(26,28,40,0.5); font-size:12px; padding:20px; text-align:center;">還沒有預設包。把面板調好後，按下面「➕ 從目前設定另存」。</div>'; return; }
                grid.innerHTML = cfdPresets.map(function(p, i){
                    const thumb = p.preview
                        ? '<img src="' + p.preview + '" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:6px; background:#0001;">'
                        : '<div style="width:100%; aspect-ratio:1; border-radius:6px; background:rgba(26,28,40,0.06); display:flex; align-items:center; justify-content:center; color:rgba(26,28,40,0.4); font-size:11px; text-align:center; line-height:1.5;">尚無預覽<br>點 🖼️ 生成</div>';
                    return '<div style="border:1px solid rgba(26,28,40,0.15); border-radius:8px; padding:8px; background:#fff;">' +
                        thumb +
                        '<div style="font-size:12px; font-weight:600; color:#1A1C28; margin:6px 0 4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="' + escAttr(p.name) + (p.customWorkflow ? '（自帶工作流）' : '') + '">' + (p.customWorkflow ? '⚙️ ' : '') + escAttr(p.name) + '</div>' +
                        '<div style="display:flex; gap:3px;">' +
                          '<span style="flex:1; text-align:center; font-size:11px; cursor:pointer; padding:4px 0; border:1px solid rgba(26,28,40,0.2); border-radius:4px; background:rgba(26,28,40,0.05);" onclick="window._cfdPreset.applyIdx(' + i + ')">套用</span>' +
                          '<span style="font-size:12px; cursor:pointer; padding:4px 7px; border:1px solid rgba(26,28,40,0.2); border-radius:4px; background:rgba(26,28,40,0.05);" title="生成風格預覽" onclick="window._cfdPreset.genPreviewIdx(' + i + ')">🖼️</span>' +
                          '<span style="font-size:12px; cursor:pointer; padding:4px 7px; border:1px solid #2b6cb0; border-radius:4px; background:rgba(43,108,176,0.1);" title="用目前面板設定覆蓋（會清掉預覽）" onclick="window._cfdPreset.overwriteIdx(' + i + ')">🔄</span>' +
                          '<span style="font-size:12px; cursor:pointer; padding:4px 7px; border:1px solid #fc8181; border-radius:4px; background:rgba(252,129,129,0.1);" title="刪除" onclick="window._cfdPreset.delIdx(' + i + ')">🗑️</span>' +
                        '</div>' +
                        '<div class="cfd-card-status" data-idx="' + i + '" style="font-size:10px; color:rgba(26,28,40,0.55); margin-top:3px; min-height:13px;"></div>' +
                      '</div>';
                }).join('');
            }
            window._cfdPreset = {
                open: function(){ const m = container.querySelector('#img-cfd-preset-modal'); if (m) m.style.display = 'flex'; this._cancelImport(); renderPresetGrid(); },
                close: function(){ const m = container.querySelector('#img-cfd-preset-modal'); if (m) m.style.display = 'none'; },
                applyIdx: function(i){
                    const p = cfdPresets[i]; if (!p) return;
                    applyPresetToPanel(p);
                    try { if (window._cfdSetActivePreset) window._cfdSetActivePreset(p.name || ''); } catch(e){}   // 狀態列顯示目前套用的預設名
                    this.close();
                    if (statusEl) statusEl.textContent = '✅ 已套用預設包「' + (p.name || '') + '」（要正式生圖記得按底部保存）';
                },
                saveNew: function(){
                    const ni = container.querySelector('#img-cfd-preset-newname');
                    const name = ni && ni.value.trim();
                    if (!name) { alert('請先輸入新預設包名稱'); if (ni) ni.focus(); return; }
                    cfdPresets.push(buildCfdPreset(name));
                    if (ni) ni.value = '';
                    renderPresetGrid();
                },
                // 🖼️ 拖/選一張以前 ComfyUI 生的圖 → 讀出當初工作流 → 直接變成一張帶工作流的預設包卡（原圖當預覽縮圖）
                importImage: function(){
                    const fi = container.querySelector('#img-cfd-wf-img');
                    if (fi) { fi.value = ''; fi.click(); }
                },
                _setImgStatus: function(msg, err){
                    const st = container.querySelector('#img-cfd-wf-status');
                    if (st) { st.textContent = msg || ''; st.classList.toggle('is-err', !!err); }
                },
                _handleImage: async function(file){
                    if (!file) return;
                    const self = this;
                    const W = window.parent || window;
                    const RECIPE = W.NAI_RECIPE || window.NAI_RECIPE;
                    if (!RECIPE || !RECIPE.extractComfyWorkflow){ self._setImgStatus('解析模組未就緒（重進一次設定再試）', true); return; }
                    self._setImgStatus('⏳ 讀取圖片工作流…');
                    let res; try { res = await RECIPE.extractComfyWorkflow(file); } catch(e){ res = { ok:false, error: String((e && e.message) || e) }; }
                    if (!res || !res.ok){ self._setImgStatus('❌ ' + ((res && res.error) || '讀不到工作流'), true); return; }
                    // 預設名：檔名去副檔名；同名自動加序號
                    let base = String(file.name || 'ComfyUI').replace(/\.[a-z0-9]+$/i, '').trim() || 'ComfyUI';
                    let name = base, n = 2;
                    while (cfdPresets.some(function(p){ return p.name === name; })) { name = base + ' ' + (n++); }
                    // 把工作流「拆解」進面板可編輯欄位（模型/LoRA/採樣器/提示詞…）
                    const r = parseComfyApiToPreset(res.api, name);
                    const preset = r.preset, pd = r.parsed;
                    // 原圖 → 縮圖當預覽（拖進來的那張圖就是它的預覽）
                    try { preset.preview = await toThumb(await fileToDataUrl(file)); } catch(e){}
                    cfdPresets.push(preset);
                    renderPresetGrid();
                    // 報告抓到哪些（讓她知道有沒有漏、要不要手動補）
                    const got = [];
                    if (pd.model) got.push('模型'); if (pd.loras) got.push('LoRA×' + pd.loras);
                    if (pd.sampler) got.push('採樣器/步數/CFG'); if (pd.prompt) got.push('正負提示詞'); if (pd.size) got.push('尺寸');
                    const miss = !pd.model && !pd.sampler && !pd.prompt;
                    self._setImgStatus(miss
                        ? '⚠️ 已建卡「' + name + '」，但這張圖的工作流結構特殊、只抓到少數欄位 → 套用後請自己在面板核對補齊。記得按底部「保存」。'
                        : '✅ 已拆進預設卡「' + name + '」：' + (got.join('、') || '基本設定') + '。點「套用」就能在面板逐格微調，改完按底部「保存」。', miss);
                },
                overwriteIdx: function(i){
                    const old = cfdPresets[i]; if (!old) return;
                    if (!confirm('用目前面板的設定覆蓋預設包「' + old.name + '」？\n（舊預覽圖會清掉，需重新生成）')) return;
                    cfdPresets[i] = buildCfdPreset(old.name);  // 沿用原名、預覽清空
                    renderPresetGrid();
                },
                delIdx: function(i){
                    const old = cfdPresets[i]; if (!old) return;
                    if (!confirm('刪除預設包「' + old.name + '」？')) return;
                    cfdPresets.splice(i, 1);
                    renderPresetGrid();
                },
                genPreviewIdx: async function(i){
                    const p = cfdPresets[i]; if (!p) return;
                    const W = window.parent || window;
                    const mgr = W.OS_IMAGE_MANAGER;
                    if (!mgr || typeof mgr.previewComfyPreset !== 'function') { cardStatus(i, '生圖模組未就緒'); return; }
                    cardStatus(i, '⏳ 生成中…(15-40秒)');
                    try {
                        const url = await mgr.previewComfyPreset(p, getPreviewPrompt());
                        if (!url) { cardStatus(i, '❌ 失敗（檢查 ComfyUI 連線/模型）'); return; }
                        const thumb = await toThumb(url);
                        if (cfdPresets[i]) cfdPresets[i].preview = thumb;
                        renderPresetGrid();
                        cardStatus(i, '✅ 完成（記得按底部保存）');
                    } catch(e){ cardStatus(i, '❌ ' + (e && e.message || e)); }
                },
                exportPack: function(){
                    if (!cfdPresets.length) { alert('還沒有預設包可以匯出。'); return; }
                    const data = { type: 'aurelia_image_presets', version: 1, presets: cfdPresets };
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    const d = new Date();
                    a.download = '生圖預設包_' + d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '.json';
                    a.click();
                    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
                },
                importPack: function(){
                    const fi = container.querySelector('#img-cfd-preset-file');
                    if (fi) { fi.value = ''; fi.click(); }
                },
                // 把外來 JSON 收斂成乾淨的預設包物件（只留認識的欄位，缺的補預設值）
                _sanitizePreset: function(p){
                    const num = function(v, d){ const n = parseFloat(v); return isNaN(n) ? d : n; };
                    const int = function(v, d){ const n = parseInt(v); return isNaN(n) ? d : n; };
                    const s = function(v){ return (v == null) ? '' : String(v).trim(); };
                    return {
                        name: s(p.name),
                        modelType: ['checkpoint','flux','anima'].indexOf(p.modelType) >= 0 ? p.modelType : 'checkpoint',
                        model: s(p.model), vae: s(p.vae),
                        sampler: s(p.sampler) || 'euler', scheduler: s(p.scheduler) || 'normal',
                        steps: int(p.steps, 28), cfg: num(p.cfg, 6.5),
                        width: int(p.width, 1024), height: int(p.height, 1024),
                        clipSkip: int(p.clipSkip, 0),
                        basePrompt: s(p.basePrompt), negPrompt: s(p.negPrompt),
                        fluxClipL: s(p.fluxClipL) || 'clip_l.safetensors',
                        fluxT5: s(p.fluxT5) || 't5xxl_fp8_e4m3fn.safetensors',
                        fluxAe: s(p.fluxAe) || 'ae.safetensors',
                        guidance: num(p.guidance, 3.5),
                        animaClip: s(p.animaClip) || 'qwen_3_06b_base.safetensors',
                        animaVae: s(p.animaVae) || 'qwen_image_vae.safetensors',
                        loras: (Array.isArray(p.loras) ? p.loras : []).map(function(L){
                            return { on: !!(L && L.on !== false), name: s(L && L.name),
                                     strengthModel: num(L && L.strengthModel, 1), strengthClip: num(L && L.strengthClip, 1) };
                        }).filter(function(L){ return L.name; }),
                        customWorkflow: s(p.customWorkflow),
                        preview: (typeof p.preview === 'string' && p.preview.indexOf('data:image') === 0) ? p.preview : ''
                    };
                },
                _importFile: function(file){
                    const self = this;
                    const reader = new FileReader();
                    reader.onload = function(){
                        try {
                            const j = JSON.parse(String(reader.result));
                            const arr = Array.isArray(j) ? j : (Array.isArray(j.presets) ? j.presets : null);
                            if (!arr || !arr.length) { alert('❌ 這個檔案裡找不到預設包，確認拿到的是畫風包檔（.json）再試一次。'); return; }
                            // 收斂＋濾掉沒名字的，暫存等使用者選「覆蓋同名 / 全部新增」
                            const clean = arr.filter(function(p){ return p && String(p.name || '').trim(); }).map(function(p){ return self._sanitizePreset(p); });
                            if (!clean.length) { alert('❌ 檔案裡的預設包都沒有名稱，讀不進來。'); return; }
                            self._pendingImport = clean;
                            // 牆上還沒有任何包 → 不用問，直接全部加
                            if (!cfdPresets.length) { self._applyImport('append'); return; }
                            const msg = container.querySelector('#img-cfd-import-msg');
                            if (msg) msg.textContent = '讀到 ' + clean.length + ' 個預設包。要怎麼放進現有的 ' + cfdPresets.length + ' 個裡？';
                            const box = container.querySelector('#img-cfd-import-choice');
                            if (box) box.style.display = 'block';
                        } catch(e) { alert('❌ 這個檔案讀不出來，確認是畫風包檔（.json）再試一次。'); }
                    };
                    reader.readAsText(file);
                },
                _cancelImport: function(){
                    this._pendingImport = null;
                    const box = container.querySelector('#img-cfd-import-choice');
                    if (box) box.style.display = 'none';
                },
                // mode='overwrite'：同名更新、其餘新增；mode='append'：全部當新的加（同名自動加序號避免混淆）
                _applyImport: function(mode){
                    const clean = this._pendingImport;
                    const box = container.querySelector('#img-cfd-import-choice');
                    if (box) box.style.display = 'none';
                    if (!clean || !clean.length) { this._pendingImport = null; return; }
                    const norm = function(s){ return String(s || '').trim(); };
                    let added = 0, updated = 0;
                    clean.forEach(function(c){
                        if (mode === 'overwrite') {
                            const idx = cfdPresets.findIndex(function(x){ return norm(x.name) === norm(c.name); });
                            if (idx >= 0) {
                                if (!c.preview && cfdPresets[idx].preview) c.preview = cfdPresets[idx].preview; // 沒帶縮圖就沿用舊的
                                cfdPresets[idx] = c; updated++; return;
                            }
                            cfdPresets.push(c); added++;
                        } else {
                            // 全部新增：同名就加序號，讓兩份都在、不互蓋
                            let nm = c.name, n = 2;
                            while (cfdPresets.some(function(x){ return norm(x.name) === norm(nm); })) { nm = c.name + ' ' + (n++); }
                            c.name = nm; cfdPresets.push(c); added++;
                        }
                    });
                    this._pendingImport = null;
                    renderPresetGrid();
                    alert('✅ 匯入完成：新增 ' + added + ' 個' + (updated ? ('、覆蓋更新 ' + updated + ' 個') : '') + '。\n記得按底部「保存」才會真的存住。');
                },
                clearAll: function(){
                    if (!cfdPresets.length) { alert('目前沒有預設包可以清空。'); return; }
                    if (!confirm('確定清空全部 ' + cfdPresets.length + ' 個預設包？\n（要按底部「保存」後才真的生效；沒保存前重進設定就會復原）')) return;
                    cfdPresets.length = 0;
                    renderPresetGrid();
                    if (statusEl) statusEl.textContent = '🗑️ 預設包已清空（記得按底部「保存」才會真的存住）';
                }
            };
            // 匯入用的隱藏檔案選擇器
            (function(){
                const fi = container.querySelector('#img-cfd-preset-file');
                if (fi) fi.addEventListener('change', function(){
                    const f = fi.files && fi.files[0];
                    if (f) window._cfdPreset._importFile(f);
                });
            })();
            // 🖼️ 拖圖還原工作流 → 建預設包卡：拖放 + 點擊選檔
            (function(){
                const drop = container.querySelector('#img-cfd-wf-drop');
                const fi = container.querySelector('#img-cfd-wf-img');
                if (!drop || !fi) return;
                drop.addEventListener('click', function(){ window._cfdPreset.importImage(); });
                fi.addEventListener('change', function(){ const f = fi.files && fi.files[0]; if (f) window._cfdPreset._handleImage(f); });
                drop.addEventListener('dragover', function(e){ e.preventDefault(); drop.classList.add('is-over'); });
                drop.addEventListener('dragleave', function(){ drop.classList.remove('is-over'); });
                drop.addEventListener('drop', function(e){ e.preventDefault(); drop.classList.remove('is-over'); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) window._cfdPreset._handleImage(f); });
            })();

            // ===== ComfyUI 每桶各自一份設定＋預設包（char/scene/bg/map）=====
            //   面板同一塊 DOM，靠「編輯桶」下拉切換：切換時存目前桶、載入目標桶。連線網址(url)四桶共用、不進桶。
            //   沒設過的桶 → 用你現有設定當起點(_flatSeed)，切過去改完保存就各自獨立、絕不弄丟。
            let _cfdBucket = 'char';
            const _CFD_BUCKETS = ['char','scene','bg','map'];
            const _comfyBuckets = { char:null, scene:null, bg:null, map:null };
            (function(){
                const sb = cfd.buckets && typeof cfd.buckets === 'object' ? cfd.buckets : null;
                if (sb) _CFD_BUCKETS.forEach(function(b){ if (sb[b] && typeof sb[b] === 'object') _comfyBuckets[b] = sb[b]; });
            })();
            // 你現有扁平設定 → 一份桶起點（沒獨立設過的桶用它，等於「複製進四桶」）
            function _flatSeed(){
                const n = function(v,d){ const x=parseFloat(v); return isNaN(x)?d:x; };
                const i = function(v,d){ const x=parseInt(v); return isNaN(x)?d:x; };
                const s = function(v){ return (v==null)?'':String(v); };
                return {
                    modelType: s(cfd.modelType)||'checkpoint', model: s(cfd.model), vae: s(cfd.vae),
                    sampler: s(cfd.sampler)||'euler', scheduler: s(cfd.scheduler)||'normal',
                    steps: i(cfd.steps,28), cfg: n(cfd.cfg,6.5), width: i(cfd.width,1024), height: i(cfd.height,1024),
                    clipSkip: i(cfd.clipSkip,0), basePrompt: s(cfd.basePrompt), negPrompt: s(cfd.negPrompt),
                    fluxClipL: s(cfd.fluxClipL)||'clip_l.safetensors', fluxT5: s(cfd.fluxT5)||'t5xxl_fp8_e4m3fn.safetensors',
                    fluxAe: s(cfd.fluxAe)||'ae.safetensors', guidance: n(cfd.guidance,3.5),
                    animaClip: s(cfd.animaClip)||'qwen_3_06b_base.safetensors', animaVae: s(cfd.animaVae)||'qwen_image_vae.safetensors',
                    loras: Array.isArray(cfd.loras)?cfd.loras.slice():[],
                    workflowMode: (s(cfd.workflowMode)==='custom') ? 'custom' : 'auto',
                    customWorkflow: (s(cfd.workflowMode)==='custom') ? s(cfd.customWorkflow) : '',
                    activePreset: ''   // 包庫是全域一份(cfdPresets)，桶只記「套用哪個包」
                };
            }
            // 桶正規化：一定要有 workflowMode（舊桶沒存過 → 當 auto 並清掉殘留 customWorkflow，治「全變自訂」）
            function _normBucket(cfg){ cfg = cfg || {}; if (cfg.workflowMode == null) { cfg.workflowMode = 'auto'; cfg.customWorkflow = ''; } if (cfg.workflowMode !== 'custom') cfg.customWorkflow = ''; return cfg; }
            // 讀目前面板 → 桶物件（重用 buildCfdPreset 的欄位讀取 + 明確 workflowMode；包庫不進桶——全域一份）
            function _readPanelBucket(){ const c = buildCfdPreset(''); delete c.name; c.workflowMode = (container.querySelector('#img-cfd-wfmode')?.value || 'auto'); c.activePreset = _cfdActivePreset[_cfdBucket] || ''; return c; }
            const _BUCKET_LABEL = { char:'角色', scene:'插圖', bg:'背景', map:'小地圖' };
            const _cfdActivePreset = { char:'', scene:'', bg:'', map:'' };   // 各桶「目前套用哪個預設包」
            function _updateBucketHeader(){
                const cur = container.querySelector('#img-cfd-bucket-cur'); if (cur) cur.textContent = _BUCKET_LABEL[_cfdBucket] || _cfdBucket;
                const pc = container.querySelector('#img-cfd-preset-cur');
                if (pc) { const nm = _cfdActivePreset[_cfdBucket]; pc.textContent = nm ? ('　·　預設：' + nm) : '　·　（未套用預設）'; }
            }
            window._cfdSetActivePreset = function(name){ _cfdActivePreset[_cfdBucket] = name || ''; _updateBucketHeader(); };
            function _switchBucket(nb){
                if (!_comfyBuckets.hasOwnProperty(nb) || nb === _cfdBucket) return;
                _comfyBuckets[_cfdBucket] = _readPanelBucket();                 // 存目前桶
                _cfdBucket = nb;
                const cfg = _normBucket(_comfyBuckets[nb] || _flatSeed());      // 目標桶（沒設過退你現有設定）
                applyPresetToPanel(cfg);                                        // 灌回面板（模型/LoRA/參數/自訂工作流…）
                // 包庫(cfdPresets)不隨桶切換——全域同一份，四桶看到的牆永遠一樣
                _cfdActivePreset[nb] = cfg.activePreset || '';
                _updateBucketHeader();
            }
            window._cfdSwitchBucket = _switchBucket;   // 給分頁切換連動
            // 給存檔用：收齊四桶（先把目前面板存進當前桶），沒獨立設過的桶用你現有設定
            //   桶物件一律剝掉 presets 殘留（舊存檔的桶內副本已在啟動時併回全域庫，別再寫回去分家）
            window._cfdCollectBuckets = function(){
                _comfyBuckets[_cfdBucket] = _readPanelBucket();
                const out = {};
                _CFD_BUCKETS.forEach(function(b){
                    const o = Object.assign({}, _comfyBuckets[b] || _flatSeed());
                    delete o.presets;
                    out[b] = o;
                });
                return out;
            };
            // 初始對齊：扁平面板可能是上次存檔時「別的桶」→ 強制載入 char 桶，確保 _cfdBucket='char' 跟面板一致
            //   （包庫不動：cfdPresets 開頁時已載入全域一份＋併回四桶散落的）
            if (_comfyBuckets.char) {
                const _c0 = _normBucket(_comfyBuckets.char);
                applyPresetToPanel(_c0);
                _cfdActivePreset.char = _c0.activePreset || '';
            }
            _updateBucketHeader();   // 狀態列顯示當前桶＋目前套用的預設名
        })();

        // 給核心存檔收包庫：cfdPresets 原是 launchApp 閉包變數，拆檔後核心經這個窗口拿（同一個陣列引用、形狀不變）
        window._cfdGetPresets = function(){ return cfdPresets; };
    }

    window.OS_SETTINGS_COMFY = { wire: wire };
})();
