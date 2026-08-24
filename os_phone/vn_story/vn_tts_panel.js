'use strict';
// VN_TTS_Panel — TTS 設定面板（模型庫 / 角色對應 / NPC 配音）
(function () {

// ── 面板 CSS ────────────────────────────────────────────────────────────────

// ── HTML 模板 ────────────────────────────────────────────────────────────────
function buildPanelHTML() {
    return `
<div id="vn-tts-overlay" class="hidden">
  <div class="vtts-header">
    <h2>🎙 語音配置</h2>
    <button class="vtts-close" onclick="VN_TTS_Panel.close()">✕</button>
  </div>

  <div id="vtts-nav"></div>

  <div class="vtts-body" id="vtts-body"></div>
  <div class="vtts-toast" id="vtts-toast"></div>
</div>`;
}



// 這一頁該看見哪些音色。兩個引擎的清單永遠不混在一起。
function ttsPick(models, eng) {
    const out = {};
    for (const [id, m] of Object.entries(models || {})) {
        const isIdx = m.engine === 'index';
        if (!eng || (eng === 'index') === isIdx) out[id] = m;
    }
    return out;
}

// ── 分頁結構 ──────────────────────────────────────────────────────────────
// 上層：引擎二選一（顯存只夠一套，本來就該擇一）
// 下層：選中引擎自己的頁，兩邊永遠不會同時出現在畫面上
const TTS_ENGINES = [
    { id: 'index',  label: '🎙️ IndexTTS', tabs: [['main','服務'], ['voices','音色'], ['chars','角色'], ['npc','NPC']] },
    { id: 'sovits', label: '📡 SoVITS',   tabs: [['main','連線'], ['voices','模型'], ['chars','角色'], ['npc','NPC']] },
];

function renderEngineBar(engine) {
    return `
<div class="vtts-engine-bar">
  ${TTS_ENGINES.map(e => `
  <button class="vtts-engine-btn${e.id === engine ? ' active' : ''}" onclick="VN_TTS_Panel.switchEngine('${e.id}')">${e.label}</button>`).join('')}
</div>`;
}

function renderSubTabs(engine, tab) {
    const def = TTS_ENGINES.find(e => e.id === engine) || TTS_ENGINES[0];
    return `
<div class="vtts-tabs">
  ${def.tabs.map(([k, label]) => `
  <button class="vtts-tab${k === tab ? ' active' : ''}" data-tab="${k}" onclick="VN_TTS_Panel.switchTab('${k}')">${label}</button>`).join('')}
</div>`;
}

// ── 各分頁內容 ───────────────────────────────────────────────────────────────

function renderBasic(cfg) {
    return `
<!-- 「啟用 TTS 語音」開關已由語音面板頂端三選一(MINIMAX/SoVITS/全關閉)取代，藏卡片但保留 #vtts-enabled 供 _switchTtsMode 同步與 saveBasic 存檔 -->
<input type="checkbox" id="vtts-enabled" style="display:none" ${cfg.enabled ? 'checked' : ''}>

<div class="vtts-card">
  <div class="vtts-card-title">📡 GPT-SoVITS 連線</div>
  <div class="vtts-field">
    <label class="vtts-label">API 地址</label>
    <input class="vtts-input" id="vtts-server" type="text" value="${esc(cfg.serverUrl)}" placeholder="http://127.0.0.1:9880">
    <div class="vtts-hint">GPT-SoVITS 推理服務的 API 地址</div>
  </div>
  
  <div class="vtts-field">
    <label class="vtts-label">SillyTavern 根目錄</label>
    <input class="vtts-input" id="vtts-st-root" type="text" value="${esc(cfg.stRoot || '')}" placeholder="例：D:\\SillyTavern">
    <div class="vtts-hint">必填！用於補全模型掃描與試聽時的正確路徑。</div>
  </div>
  </div>

<div class="vtts-card">
  <div class="vtts-card-title">🗣 語音基礎參數</div>
  <div class="vtts-field">
    <label class="vtts-label">預設語言</label>
    <select class="vtts-input" id="vtts-lang">
      <option value="zh" ${cfg.textLang==='zh'?'selected':''}>中文</option>
      <option value="ja" ${cfg.textLang==='ja'?'selected':''}>日語</option>
      <option value="en" ${cfg.textLang==='en'?'selected':''}>英語</option>
    </select>
  </div>
  <div class="vtts-field">
    <label class="vtts-label">音量 <span id="vtts-vol-val">${Math.round(cfg.volume*100)}%</span></label>
    <input class="vtts-input" id="vtts-vol" type="range" min="0" max="1" step="0.05"
           value="${cfg.volume}" oninput="document.getElementById('vtts-vol-val').textContent=Math.round(this.value*100)+'%'">
  </div>
</div>

<div class="vtts-card">
  <div class="vtts-card-title">🎭 情緒張力控制 (WebUI 參數)</div>
  <div class="vtts-field">
    <label class="vtts-label">語速 (Speed) <span id="vtts-spd-val">${cfg.speed ?? 1}</span></label>
    <input class="vtts-input" id="vtts-spd" type="range" min="0.5" max="2" step="0.1"
           value="${cfg.speed ?? 1}" oninput="document.getElementById('vtts-spd-val').textContent=this.value">
    <div class="vtts-hint">調整整體語速，高為更快。預設 1。</div>
  </div>
  <div class="vtts-field">
    <label class="vtts-label">Top_K <span id="vtts-topk-val">${cfg.topK ?? 15}</span></label>
    <input class="vtts-input" id="vtts-topk" type="range" min="1" max="100" step="1"
           value="${cfg.topK ?? 15}" oninput="document.getElementById('vtts-topk-val').textContent=this.value">
    <div class="vtts-hint">控制情緒穩定度。無參考文本時不要太低。預設 15。</div>
  </div>
  <div class="vtts-field">
    <label class="vtts-label">Top_P <span id="vtts-topp-val">${cfg.topP ?? 1}</span></label>
    <input class="vtts-input" id="vtts-topp" type="range" min="0.1" max="1" step="0.05"
           value="${cfg.topP ?? 1}" oninput="document.getElementById('vtts-topp-val').textContent=this.value">
    <div class="vtts-hint">控制語調豐富度。預設 1。</div>
  </div>
  <div class="vtts-field">
    <label class="vtts-label">Temperature <span id="vtts-temp-val">${cfg.temperature ?? 1}</span></label>
    <input class="vtts-input" id="vtts-temp" type="range" min="0.1" max="2" step="0.05"
           value="${cfg.temperature ?? 1}" oninput="document.getElementById('vtts-temp-val').textContent=this.value">
    <div class="vtts-hint">控制情緒張力和隨機性。數值越大越奔放。預設 1。</div>
  </div>
  <div class="vtts-field">
    <label class="vtts-label">Sample Steps <span id="vtts-steps-val">${cfg.sampleSteps ?? 32}</span>
      <span style="color:rgba(26,28,40,0.55);font-weight:normal;margin-left:6px;">（V3 / V4 專屬，V1/V2 忽略）</span>
    </label>
    <input class="vtts-input" id="vtts-steps" type="range" min="4" max="100" step="4"
           value="${cfg.sampleSteps ?? 32}" oninput="document.getElementById('vtts-steps-val').textContent=this.value">
    <div class="vtts-hint">Flow Matching 推理步數。越高音質越好但速度越慢。推薦 32（平衡）或 64（追求音質）。</div>
  </div>
</div>

<div class="vtts-card">
  <div class="vtts-card-title">💾 跨裝置轉移 (備份與還原)</div>
  <div class="vtts-row">
    <button class="vtts-btn vtts-btn-ghost" onclick="VN_TTS_Panel.exportConfig()">📤 匯出目前配置</button>
    <button class="vtts-btn vtts-btn-cyan" onclick="document.getElementById('vtts-import-file').click()">📥 從檔案匯入</button>
    <input type="file" id="vtts-import-file" style="display:none" accept=".json" onchange="VN_TTS_Panel.importConfig(this)">
  </div>
  <div class="vtts-hint">將此處下載的 .json 傳到手機上，再從手機端匯入，即可無縫繼承所有的模型與角色綁定。</div>
</div>

<div class="vtts-save-bar">
  <button class="vtts-btn vtts-btn-ghost" onclick="VN_TTS_Panel.testConnection()">🔗 測試連線</button>
  <button class="vtts-btn vtts-btn-primary" onclick="VN_TTS_Panel.saveBasic()">儲存</button>
</div>`;
}

// IndexTTS 專用分頁。刻意跟 SoVITS 那頁完全分開：
// 那頁的連線位址、Top_K、Temperature 這些參數 IndexTTS 一個都不吃，
// 混在一起只會讓人以為每一欄都要填。
function renderIndexTab(cfg) {
    const models = Object.values(cfg.models || {}).filter(m => m.engine === 'index');
    // 網址是存在每個音色裡的（幾百個音色就幾百份），這裡給一個統一入口
    const url = (models[0] && models[0].url) || (cfg.narratorIndex && cfg.narratorIndex.url) || 'http://127.0.0.1:8881';
    return `
<div class="vtts-card">
  <div class="vtts-card-title">🎙️ 語音服務</div>
  <div class="vtts-field">
    <label class="vtts-label">服務網址</label>
    <input class="vtts-input" id="vtts-index-url" type="text" value="${esc(url)}" placeholder="http://127.0.0.1:8881">
    <div class="vtts-hint">語音服務跑起來後的位址。改了要按「套用」才會寫進每個音色。</div>
  </div>
  <div class="vtts-row">
    <button class="vtts-btn vtts-btn-ghost" onclick="VN_TTS_Panel.testIndexUrl()">🔗 測試連線</button>
    <button class="vtts-btn vtts-btn-primary" onclick="VN_TTS_Panel.applyIndexUrl()">套用到全部音色</button>
  </div>
</div>

<div class="vtts-card">
  <div class="vtts-card-title">🗣 播放與語氣</div>
  <div class="vtts-field">
    <label class="vtts-label">播放音量 <span id="vtts-vol-val">${Math.round((cfg.volume ?? 1)*100)}%</span></label>
    <input class="vtts-input" id="vtts-vol" type="range" min="0" max="1" step="0.05"
           value="${cfg.volume ?? 1}" oninput="document.getElementById('vtts-vol-val').textContent=Math.round(this.value*100)+'%'">
  </div>
  <div class="vtts-field">
    <label class="vtts-label">語氣強度 <span id="vtts-idxemo-val">${Math.round((cfg.indexEmoAlpha ?? 0.5)*100)}%</span></label>
    <input class="vtts-input" id="vtts-idxemo" type="range" min="0" max="1" step="0.05"
           value="${cfg.indexEmoAlpha ?? 0.5}" oninput="document.getElementById('vtts-idxemo-val').textContent=Math.round(this.value*100)+'%'">
    <div class="vtts-hint">劇本寫了表情時，說話起伏要跟到多滿。往上調戲會多，但調過頭會開始聽起來像另一個人 —— 低沉的聲音特別容易被拉高。覺得太平就往上一格一格試。</div>
  </div>
  <div class="vtts-save-bar">
    <button class="vtts-btn vtts-btn-primary" onclick="VN_TTS_Panel.saveBasic()">儲存</button>
  </div>
</div>

<div class="vtts-card">
  <div class="vtts-card-title">💾 跨裝置轉移</div>
  <div class="vtts-row">
    <button class="vtts-btn vtts-btn-ghost" onclick="VN_TTS_Panel.exportConfig()">📤 匯出目前配置</button>
    <button class="vtts-btn vtts-btn-cyan" onclick="document.getElementById('vtts-import-file-idx').click()">📥 從檔案匯入</button>
    <input type="file" id="vtts-import-file-idx" class="vtts-file-hidden" accept=".json" onchange="VN_TTS_Panel.importConfig(this)">
  </div>
  <div class="vtts-hint">音色與角色綁定都在裡面，換裝置時匯出再匯入即可。</div>
</div>`;
}

// IndexTTS 的音色頁：只列 IndexTTS 音色，SoVITS 的模型不會混進來
function renderIndexVoices(cfg) {
    const idx = Object.entries(cfg.models || {}).filter(([, m]) => m.engine === 'index');
    const emoTotal = idx.reduce((n, [, m]) => n + Object.keys(m.emotions || {}).length, 0);
    const rows = idx.map(([id, m]) => {
        const ec = Object.keys(m.emotions || {}).length;
        return `
<div class="vtts-model-card vtts-model-card-compact">
  <div class="vtts-model-card-head">
    <span class="vtts-model-name">${esc(m.name || id)}${ec ? ` <span class="vtts-model-emo-badge">${ec} 情緒</span>` : ''}</span>
    <div class="vtts-model-actions">
      <button class="vtts-btn vtts-btn-ghost" onclick="VN_TTS_Panel.playNpcModel('${escJs(id)}')">▶ 試聽</button>
      <button class="vtts-btn vtts-btn-danger" onclick="VN_TTS_Panel.deleteModel('${escJs(id)}')">刪除</button>
    </div>
  </div>
</div>`;
    }).join('');
    return `
<div class="vtts-card">
  <div class="vtts-card-title">🎨 音色</div>
  <div class="vtts-row">
    <button class="vtts-btn vtts-btn-primary" onclick="VN_TTS_Panel.importIndexVoices()">🔄 從服務匯入音色</button>
  </div>
  <div class="vtts-hint">把音檔丟進語音服務的 voices 資料夾，再按這裡就會出現。檔名就是音色名，不用練模型。</div>
</div>
${idx.length
  ? `<div class="vtts-card-subtitle">${idx.length} 個音色，共 ${emoTotal} 條情緒對應</div>${rows}`
  : '<div class="vtts-empty">還沒有音色。先開語音服務，再按上面的按鈕匯入。</div>'}`;
}

function renderModels(cfg, eng) {
    const models = ttsPick(cfg.models, eng);
    const ids = Object.keys(models);
    const cards = ids.length ? ids.map(id => renderModelCard(id, models[id])).join('') :
        `<div class="vtts-empty">尚無模型，點擊下方按鈕新增</div>`;
    return `
<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
  <button class="vtts-btn vtts-btn-cyan" onclick="VN_TTS_Panel.addModel()">＋ 新增模型</button>
  <button class="vtts-btn vtts-btn-primary" onclick="VN_TTS_Panel.loadLocalConfig()" title="執行 scan_models.py 後點此，從 models/tts_models.json 批次匯入所有模型">📥 載入配置</button>
  <button class="vtts-btn vtts-btn-primary" onclick="VN_TTS_Panel.importIndexVoices()" title="從 IndexTTS 服務把所有音色抓進來，情緒自動掛好">🎙️ 匯入 IndexTTS 音色</button>
  <button class="vtts-btn vtts-btn-danger" onclick="VN_TTS_Panel.deleteAllModels()">🗑 一鍵清空</button>
</div>
<div style="font-size:11px;color:rgba(26,28,40,0.55);margin-bottom:10px;">💡 有多個模型？先執行擴展目錄裡的 <code style="color:rgba(26,28,40,0.55)">scan_models.bat</code>，再點「載入配置」一次匯入全部。</div>
${cards}`;
}

// 外層只給精簡卡（名稱 + 編輯/刪除），細節 GPT/SoVITS/音頻/情緒都收進內層（編輯頁），免一攤平就很長
function renderModelCard(id, m) {
    const emoCount = Object.keys(m.emotions || {}).length;
    // IndexTTS 音色不走 SoVITS 的編輯表單（那張表存的是 gptPath 那些欄位，一存就把 engine 洗掉）。
    // 要改音色就去服務的資料夾換檔案，再按一次匯入。
    if (m.engine === 'index') {
        return `
<div class="vtts-model-card vtts-model-card-compact" id="vtts-mc-${esc(id)}">
  <div class="vtts-model-card-head">
    <span class="vtts-model-name">🎙️ ${esc(m.name || id)}${emoCount ? ` <span class="vtts-model-emo-badge">${emoCount} 情緒</span>` : ''}</span>
    <div class="vtts-model-actions">
      <button class="vtts-btn vtts-btn-ghost" onclick="VN_TTS_Panel.playNpcModel('${escJs(id)}')">▶ 試聽</button>
      <button class="vtts-btn vtts-btn-danger" onclick="VN_TTS_Panel.deleteModel('${escJs(id)}')">刪除</button>
    </div>
  </div>
</div>`;
    }
    return `
<div class="vtts-model-card vtts-model-card-compact" id="vtts-mc-${esc(id)}" onclick="VN_TTS_Panel.editModel('${escJs(id)}')">
  <div class="vtts-model-card-head">
    <span class="vtts-model-name">${esc(m.name || id)}${emoCount ? ` <span class="vtts-model-emo-badge">${emoCount} 情緒</span>` : ''}</span>
    <div class="vtts-model-actions">
      <button class="vtts-btn vtts-btn-ghost" onclick="event.stopPropagation();VN_TTS_Panel.editModel('${escJs(id)}')">編輯</button>
      <button class="vtts-btn vtts-btn-danger" onclick="event.stopPropagation();VN_TTS_Panel.deleteModel('${escJs(id)}')">刪除</button>
    </div>
  </div>
</div>`;
}

function renderEmotionBlock(emoKey, emData) {
    emoKey = emoKey || '';
    emData = emData || {};
    return `
    <div class="vtts-emo-block" style="border-left: 2px solid rgba(26,28,40,0.25); padding-left: 10px; margin-bottom: 12px; background: rgba(26,28,40,0.04); padding: 8px;">
      <div class="vtts-row" style="margin-bottom: 8px;">
        <span style="font-size: 12px; color: #1A1C28; white-space: nowrap;">🎭 觸發標籤：</span>
        <input class="vtts-input vtts-emo-key" type="text" value="${esc(emoKey)}" placeholder="例：Surprise, 哭腔, 撒嬌">
        <button class="vtts-btn vtts-btn-danger" onclick="this.closest('.vtts-emo-block').remove()" style="padding: 4px 8px;" title="刪除此情緒">✕</button>
      </div>
      
      <div class="vtts-row" style="margin-bottom: 4px;">
        <input class="vtts-input vtts-emo-path" type="text" value="${esc(emData.refAudioPath||'')}" placeholder="參考音頻路徑 (.wav)">
        <button class="vtts-btn vtts-btn-ghost" style="padding: 6px 10px; flex-shrink: 0;" onclick="VN_TTS_Panel.playRefAudio(this.previousElementSibling.value)">▶ 試聽</button>
      </div>
      <div class="vtts-row" style="margin-top:4px;">
        <input class="vtts-input vtts-emo-txt" type="text" value="${esc(emData.refText||'')}" placeholder="對應參考文字">
        <select class="vtts-input vtts-emo-lang" style="width:65px; flex:none;">
          <option value="zh" ${(emData.refLang||'zh')==='zh'?'selected':''}>中</option>
          <option value="ja" ${emData.refLang==='ja'?'selected':''}>日</option>
          <option value="en" ${emData.refLang==='en'?'selected':''}>英</option>
        </select>
      </div>
    </div>`;
}

function renderModelForm(id, m) {
    const isNew = !id;
    m = m || {};
    const emObj = m.emotions || {};
    const emoHTML = Object.keys(emObj).map(k => renderEmotionBlock(k, emObj[k])).join('');

    return `
<div class="vtts-card">
  <div class="vtts-card-title">${isNew ? '➕ 新增模型' : '✏️ 編輯模型'}</div>
  <div class="vtts-field">
    <label class="vtts-label">模型 ID（唯一識別碼）</label>
    <input class="vtts-input" id="vtts-mf-id" type="text" value="${esc(id||'')}" ${isNew?'':'readonly'} placeholder="例：雷伊">
  </div>
  <div class="vtts-field">
    <label class="vtts-label">顯示名稱</label>
    <input class="vtts-input" id="vtts-mf-name" type="text" value="${esc(m.name||'')}" placeholder="例：雷伊">
  </div>
  <div class="vtts-field">
    <label class="vtts-label">GPT 權重路徑（.ckpt）</label>
    <input class="vtts-input" id="vtts-mf-gpt" type="text" value="${esc(m.gptPath||'')}" placeholder="D:\\...\\model.ckpt">
  </div>
  <div class="vtts-field">
    <label class="vtts-label">SoVITS 權重路徑（.pth）</label>
    <input class="vtts-input" id="vtts-mf-sovits" type="text" value="${esc(m.sovitsPath||'')}" placeholder="D:\\...\\model.pth">
  </div>
  
  <div style="margin-top:20px; margin-bottom:8px; border-bottom: 1px solid rgba(26,28,40,0.10); padding-bottom: 4px;">
    <span style="font-size: 13px; color: #1A1C28; font-weight: 600;">🔈 預設參考音頻（必填）</span>
  </div>
  <div class="vtts-field">
    <label class="vtts-label">預設參考音頻路徑（.wav）</label>
    <input class="vtts-input" id="vtts-mf-ref" type="text" value="${esc(m.refAudioPath||'')}" placeholder="D:\\...\\reference.wav">
  </div>
  <div class="vtts-field">
    <label class="vtts-label">預設參考文字</label>
    <input class="vtts-input" id="vtts-mf-rtext" type="text" value="${esc(m.refText||'')}" placeholder="對應參考音頻的文字">
  </div>
  <div class="vtts-field">
    <label class="vtts-label">預設參考語言</label>
    <select class="vtts-input" id="vtts-mf-rlang">
      <option value="zh" ${(m.refLang||'zh')==='zh'?'selected':''}>中文</option>
      <option value="ja" ${m.refLang==='ja'?'selected':''}>日語</option>
      <option value="en" ${m.refLang==='en'?'selected':''}>英語</option>
    </select>
  </div>

  <div style="margin-top:24px; margin-bottom:12px; border-bottom: 1px solid rgba(26,28,40,0.10); padding-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-end;">
    <div>
        <span style="font-size: 13px; color: #1A1C28; font-weight: 600;">✨ 自訂多情緒語音（選填）</span>
        <div style="font-size: 11px; color: rgba(26,28,40,0.55); margin-top: 4px;">當腳本表情與「觸發標籤」一致時自動替換。<br>留空或無匹配時將使用上方預設音頻。</div>
    </div>
    <button class="vtts-btn vtts-btn-cyan" onclick="VN_TTS_Panel.addEmotionSlot()" style="padding: 5px 12px; font-size: 11px; flex-shrink: 0;">＋ 新增情緒</button>
  </div>
  
  <div id="vtts-mf-emotions-container">
    ${emoHTML}
  </div>

  <div class="vtts-save-bar">
    <button class="vtts-btn vtts-btn-ghost" onclick="VN_TTS_Panel.cancelModelForm()">取消</button>
    <button class="vtts-btn vtts-btn-primary" onclick="VN_TTS_Panel.saveModel('${escJs(id||'')}')">儲存模型</button>
  </div>
</div>`;
}

function renderVoice(cfg) {
    const modelOptions = Object.entries(cfg.models)
        .map(([id, m]) => `<option value="${esc(id)}">${esc(m.name || id)}</option>`)
        .join('');

    const sysRows = Object.entries(cfg.systemMappings || {}).map(([sname, mid]) => {
        const label = sname === '' ? '（預設系統音）' : esc(sname);
        return `
<div class="vtts-char-row" style="display:flex;align-items:center;gap:8px;">
  <span class="vtts-char-name" style="flex:0 0 auto;">🖥️ ${label}</span>
  <select class="vtts-input" onchange="VN_TTS_Panel.updateSystemMapping('${escJs(sname)}',this.value)" style="flex:1;">
    <option value="">（未綁定）</option>
    ${Object.entries(cfg.models).map(([id,m]) =>
        `<option value="${esc(id)}" ${mid===id?'selected':''}>${esc(m.name||id)}</option>`
    ).join('')}
  </select>
  <button class="vtts-btn vtts-btn-danger" onclick="VN_TTS_Panel.deleteSystemMapping('${escJs(sname)}')">✕</button>
</div>`;
    }).join('');

    const kcfg = cfg.narratorKokoro || {};
    const mcfg = cfg.narratorMinimax || {};
    const icfg = cfg.narratorIndex || {};
    const narrVal = icfg.enabled ? '__index__'
                  : kcfg.enabled ? '__kokoro__'
                  : mcfg.enabled ? '__minimax__'
                  : (cfg.narratorModel || '');
    // 音色清單是按「讀取音色」時從服務抓回來存著的（render 是同步的，不能在這裡 await）
    const iVoices = Array.isArray(icfg.voices) ? icfg.voices : [];
    const iEmos   = Array.isArray(icfg.emotions) ? icfg.emotions : [];
    const iCur    = String(icfg.voice || '');
    const iCurV   = iCur.split(':')[0] || '';
    const iCurE   = iCur.indexOf(':') >= 0 ? iCur.split(':')[1] : '';
    const mmVoices = [['audiobook_female_1','旁白女'],['audiobook_male_1','旁白男'],['female-tianmei','甜美女'],['female-yujie','御姐女'],['female-shaonv','少女'],['male-qn-qingse','青年男'],['presenter_female','主持女']];

    return `
<div class="vtts-card">
  <div class="vtts-card-title">📜 旁白音色</div>
  <select class="vtts-input" onchange="VN_TTS_Panel.updateNarratorSource(this.value)">
    <option value="" ${narrVal===''?'selected':''}>不念旁白</option>
    <option value="__minimax__" ${narrVal==='__minimax__'?'selected':''}>🔊 MiniMax</option>
    <option value="__kokoro__" ${narrVal==='__kokoro__'?'selected':''}>🐦 Kokoro</option>
    <option value="__index__" ${narrVal==='__index__'?'selected':''}>🎙️ IndexTTS</option>
    ${Object.entries(cfg.models).map(([id,m]) =>
        `<option value="${esc(id)}" ${narrVal===id?'selected':''}>SoVITS：${esc(m.name||id)}</option>`
    ).join('')}
  </select>
  ${narrVal==='__minimax__' ? `
  <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
    <select class="vtts-input" onchange="VN_TTS_Panel.updateMinimaxNarrVoice(this.value)">
      ${mmVoices.map(([v,label]) => `<option value="${v}" ${(mcfg.voice||'audiobook_female_1')===v?'selected':''}>${v}（${label}）</option>`).join('')}
    </select>
    <button class="vtts-btn vtts-btn-cyan" onclick="VN_TTS_Panel.testMinimax()" style="align-self:flex-start;">🔊 試聽</button>
    <div class="vtts-hint">SoVITS 對白＋MiniMax 旁白：先切 MiniMax 模式填好 key，再切回 SoVITS（key 會留著）。</div>
  </div>` : ''}
  ${narrVal==='__kokoro__' ? `
  <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
    <input class="vtts-input" type="text" placeholder="http://127.0.0.1:8880" value="${esc(kcfg.url||'')}" onchange="VN_TTS_Panel.updateKokoroUrl(this.value)">
    <select class="vtts-input" onchange="VN_TTS_Panel.updateKokoroVoice(this.value)">
      ${['zf_xiaoxiao','zf_xiaobei','zf_xiaoni','zf_xiaoyi','zm_yunxi','zm_yunjian','zm_yunxia','zm_yunyang'].map(v => `<option value="${v}" ${(kcfg.voice||'zf_xiaoxiao')===v?'selected':''}>${v}${v.indexOf('zf_')===0?'（女）':'（男）'}</option>`).join('')}
    </select>
    <button class="vtts-btn vtts-btn-cyan" onclick="VN_TTS_Panel.testKokoro()" style="align-self:flex-start;">🔊 試聽</button>
  </div>` : ''}
  ${narrVal==='__index__' ? `
  <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
    <input class="vtts-input" type="text" placeholder="http://127.0.0.1:8881" value="${esc(icfg.url||'')}" onchange="VN_TTS_Panel.updateIndexUrl(this.value)">
    <div class="vtts-row">
      <select class="vtts-input" onchange="VN_TTS_Panel.updateIndexVoice(this.value)">
        ${iVoices.length
            ? iVoices.map(v => `<option value="${esc(v)}" ${iCurV===v?'selected':''}>${esc(v)}</option>`).join('')
            : `<option value="">（先按右邊讀取音色）</option>`}
      </select>
      <button class="vtts-btn vtts-btn-ghost" onclick="VN_TTS_Panel.loadIndexVoices()" style="flex-shrink:0">↻ 讀取音色</button>
    </div>
    ${iEmos.length ? `
    <select class="vtts-input" onchange="VN_TTS_Panel.updateIndexEmotion(this.value)">
      <option value="" ${iCurE===''?'selected':''}>（不指定情緒）</option>
      ${iEmos.map(e => `<option value="${esc(e)}" ${iCurE===e?'selected':''}>${esc(e)}</option>`).join('')}
    </select>` : ''}
    <button class="vtts-btn vtts-btn-cyan" onclick="VN_TTS_Panel.testIndex()" style="align-self:flex-start;">🔊 試聽</button>
    <div class="vtts-hint">音色＝服務資料夾裡的檔名，丟一段人聲進去就多一個音色，不用練模型。</div>
  </div>` : ''}
</div>
<div class="vtts-card">
  <div class="vtts-card-title">🖥️ 系統語音</div>
  <div class="vtts-row">
    <input class="vtts-input" id="vtts-new-sys" type="text" placeholder="系統名（留空＝預設）">
    <select class="vtts-input" id="vtts-new-sys-model">
      <option value="">選擇模型</option>
      ${modelOptions}
    </select>
    <button class="vtts-btn vtts-btn-cyan" onclick="VN_TTS_Panel.addSystemMapping()" style="flex-shrink:0">新增</button>
  </div>
  ${sysRows ? `<div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">${sysRows}</div>` : '<div class="vtts-empty" style="margin-top:10px;">尚無系統語音</div>'}
</div>`;
}

function renderChars(cfg, eng) {
    const pick = ttsPick(cfg.models, eng);
    const modelOptions = Object.entries(pick)
        .map(([id, m]) => `<option value="${esc(id)}">${esc(m.name || id)}</option>`)
        .join('');

    const rows = Object.entries(cfg.charMappings).filter(([, mid]) => !mid || pick[mid]).map(([char, mid]) => {
        const aliases = (cfg.charAliases && Array.isArray(cfg.charAliases[char])) ? cfg.charAliases[char] : [];
        const chipStyle = 'display:inline-flex;align-items:center;gap:5px;background:rgba(26,28,40,0.06);border:1px solid rgba(26,28,40,0.20);color:#1A1C28;padding:3px 9px;border-radius:11px;font-size:11px;line-height:1.2;';
        const chipXStyle = 'cursor:pointer;color:rgba(26,28,40,0.55);font-size:11px;line-height:1;padding:0 1px;';
        const chips = aliases.map(a =>
            `<span style="${chipStyle}">${esc(a)}<span style="${chipXStyle}" onclick="VN_TTS_Panel.removeAlias('${escJs(char)}','${escJs(a)}')" title="移除別名">✕</span></span>`
        ).join('');

        return `
<div class="vtts-char-row" id="vtts-cr-${esc(char)}" style="display:flex;flex-direction:column;align-items:stretch;gap:8px;">
  <div style="display:flex;align-items:center;gap:8px;">
    <span class="vtts-char-name" style="flex:0 0 auto;">${esc(char)}</span>
    <select class="vtts-input" id="vtts-cs-${esc(char)}" onchange="VN_TTS_Panel.updateCharMapping('${escJs(char)}',this.value)" style="flex:1;">
      <option value="">（未綁定）</option>
      ${Object.entries(pick).map(([id,m]) =>
          `<option value="${esc(id)}" ${mid===id?'selected':''}>${esc(m.name||id)}</option>`
      ).join('')}
    </select>
    <button class="vtts-btn vtts-btn-danger" onclick="VN_TTS_Panel.deleteCharMapping('${escJs(char)}')">✕</button>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding-left:8px;">
    <span style="font-size:11px;color:rgba(26,28,40,0.55);letter-spacing:1px;">別名</span>
    ${chips || '<span style="font-size:11px;color:rgba(26,28,40,0.55);">（無，AI 流口水時會對不上）</span>'}
    <input id="vtts-alias-input-${esc(char)}" type="text" placeholder="+ 新增別名（按 Enter）" style="flex:1;min-width:140px;background:#EEF0F6;border:1px dashed rgba(26,28,40,0.30);color:#1A1C28;padding:4px 8px;border-radius:3px;font-size:11px;outline:none;" onkeypress="if(event.key==='Enter'){event.preventDefault();VN_TTS_Panel.addAlias('${escJs(char)}',this.value);this.value='';}">
  </div>
</div>`;
    }).join('');

    return `
<div class="vtts-card">
  <div class="vtts-card-title">➕ 新增角色對應</div>
  <div class="vtts-row">
    <input class="vtts-input" id="vtts-new-char" type="text" placeholder="角色名稱（與腳本 [Char|名稱|...] 一致）">
    <select class="vtts-input" id="vtts-new-char-model">
      <option value="">選擇模型</option>
      ${modelOptions}
    </select>
    <button class="vtts-btn vtts-btn-cyan" onclick="VN_TTS_Panel.addCharMapping()" style="flex-shrink:0">新增</button>
  </div>
</div>
<div class="vtts-card">
  <div class="vtts-card-title">📋 角色對應列表</div>
  ${rows || '<div class="vtts-empty">尚無角色對應</div>'}
</div>
${(() => {
    const T = (window.parent || window).VN_TTS;
    const locks = (T && typeof T._cardLocks === 'function') ? T._cardLocks() : {};
    const keys = Object.keys(locks);
    const lockRows = keys.map(char => {
        const mid = locks[char];
        const mname = (cfg.models[mid] && cfg.models[mid].name) || mid;
        return `<div style="display:flex;align-items:center;gap:8px;">
      <span class="vtts-char-name" style="flex:1;">${esc(char)}</span>
      <span style="flex:0 0 auto;font-size:11px;color:rgba(26,28,40,0.6);">${esc(mname)}</span>
      <button class="vtts-btn vtts-btn-danger" onclick="VN_TTS_Panel.unlockNpc('${escJs(char)}')">🔓 解除</button>
    </div>`;
    }).join('');
    return `
<div class="vtts-card">
  <div class="vtts-card-title">🔒 本卡 NPC 聲線鎖${keys.length ? ` <button class="vtts-btn vtts-btn-danger" style="float:right;" onclick="VN_TTS_Panel.clearCardLocks()">清空本卡</button>` : ''}</div>
  <div style="font-size:11px;color:rgba(26,28,40,0.55);margin-bottom:8px;">立繪雙擊「💾 保存 CV」鎖住的 NPC 音；只在這張卡有效、換卡自動回歸抽池、同卡重玩還在。與上面的手動對應分開、互不干擾。</div>
  ${lockRows || '<div class="vtts-empty">本卡尚無 NPC 聲線鎖</div>'}
</div>`;
})()}`;
}

// NPC 分類用下拉選：只顯示選中的一張卡、其餘隱藏（分類一多就不會疊得很長）
let _npcSel = null;
function renderNpc(cfg, eng) {
    const pick = ttsPick(cfg.models, eng);
    const cats = cfg.npcCategories || [];
    if (!cats.length) {
        return `
<div class="vtts-empty">尚無 NPC 分類，點擊下方按鈕新增</div>
<div style="text-align:center;margin-top:8px;">
  <button class="vtts-btn vtts-btn-cyan" onclick="VN_TTS_Panel.addNpcCategory()">＋ 新增分類</button>
</div>`;
    }
    // 選中的分類不存在時（初次進入／剛刪除）退回第一個
    if (!_npcSel || !cats.find(c => c.id === _npcSel)) _npcSel = cats[0].id;
    const sel  = cats.find(c => c.id === _npcSel);
    // 自訂下拉（native select 在縮小視窗會爆出畫面外，改成限高捲動容器）
    const ddOpts = cats.map(c => `<div class="vtts-dd-opt${c.id === _npcSel ? ' active' : ''}" onclick="VN_TTS_Panel.selectNpcCategory('${escJs(c.id)}')">${esc(c.name)}</div>`).join('');
    return `
<div class="vtts-field">
  <label class="vtts-label">選擇 NPC 分類（只顯示選中的一張，新增的會出現在這裡）</label>
  <div class="vtts-row">
    <div class="vtts-dd" id="vtts-npc-dd">
      <div class="vtts-dd-cur" onclick="VN_TTS_Panel.toggleNpcDropdown(event)">${esc(sel.name)}<span class="vtts-dd-arrow">▾</span></div>
      <div class="vtts-dd-list" id="vtts-npc-dd-list">${ddOpts}</div>
    </div>
    <button class="vtts-btn vtts-btn-cyan" onclick="VN_TTS_Panel.addNpcCategory()">＋ 新增</button>
  </div>
</div>
${renderNpcCard(sel, pick)}`;
}

function renderNpcCard(cat, models) {
    const tags = (cat.tags || []).map(t => `
<span class="vtts-tag">${esc(t)}
  <span class="vtts-tag-del" onclick="VN_TTS_Panel.removeNpcTag('${escJs(cat.id)}','${escJs(t)}')">✕</span>
</span>`).join('');

    // 已指派的也要過濾：另一個引擎的音色不屬於這一頁，留著會變成一串看不懂的 id
    const chips = (cat.modelIds || []).filter(mid => models[mid]).map(mid => {
        const m = models[mid];
        const nm = esc(m.name || mid);
        return `<span class="vtts-model-chip" data-mid="${esc(mid)}">${nm}
  <span class="vtts-model-chip-play" onclick="VN_TTS_Panel.playNpcModel('${escJs(mid)}')" title="試聽">▶</span>
  <span class="vtts-model-chip-del" onclick="VN_TTS_Panel.removeNpcModel('${escJs(cat.id)}','${escJs(mid)}')">✕</span>
</span>`;
    }).join('');

    // 模型池：尚未加入此分類的模型，點一下即加入（搭配上方搜尋過濾，免滾長下拉、免一個個選）
    const addedSet = new Set(cat.modelIds || []);
    const pool = Object.entries(models)
        .filter(([id]) => !addedSet.has(id))
        .map(([id, m]) => {
            const nm = esc(m.name || id);
            const lname = esc(String(m.name || id).toLowerCase());
            return `<span class="vtts-pool-chip" data-mid="${esc(id)}" data-name="${lname}" onclick="VN_TTS_Panel.addNpcModel('${escJs(cat.id)}','${escJs(id)}')" title="點一下加入">
  <span class="vtts-pool-play" onclick="event.stopPropagation();VN_TTS_Panel.playNpcModel('${escJs(id)}')" title="試聽">▶</span>${nm}</span>`;
        }).join('');

    return `
<div class="vtts-npc-card" id="vtts-npc-${esc(cat.id)}">
  <div class="vtts-npc-head">
    <span class="vtts-npc-label">🗂 ${esc(cat.name)}</span>
    <button class="vtts-btn vtts-btn-danger" onclick="VN_TTS_Panel.deleteNpcCategory('${escJs(cat.id)}')">刪除分類</button>
  </div>

  <div style="margin-bottom:10px;">
    <div class="vtts-label">模糊匹配別名（角色名稱含有以下標籤時隨機套用此分類）</div>
    <div class="vtts-tag-list" id="vtts-tags-${esc(cat.id)}">${tags || '<span style="color:rgba(26,28,40,0.55);font-size:11px">尚無標籤</span>'}</div>
    <div class="vtts-row" style="margin-top:7px;">
      <input class="vtts-input" id="vtts-tag-input-${esc(cat.id)}" type="text" placeholder="新標籤（如：大嬸、長髮女孩）"
             onkeydown="if(event.key==='Enter')VN_TTS_Panel.addNpcTag('${escJs(cat.id)}')">
      <button class="vtts-btn vtts-btn-ghost" onclick="VN_TTS_Panel.addNpcTag('${escJs(cat.id)}')">新增</button>
    </div>
  </div>

  <div>
      <div class="vtts-label">套用模型（隨機抽選其中一個）· 點下方卡片即加入、▶ 試聽</div>
      <div class="vtts-model-chips" id="vtts-chips-${esc(cat.id)}">${chips || '<span class="vtts-pool-empty">尚未指定模型</span>'}</div>
      <input class="vtts-input vtts-pool-search" id="vtts-pool-search-${esc(cat.id)}" type="text" placeholder="🔍 搜尋模型加入（如：青年、女、角色名）" oninput="VN_TTS_Panel.filterNpcPool('${escJs(cat.id)}')">
      <div class="vtts-model-pool" id="vtts-pool-${esc(cat.id)}">${pool || '<span class="vtts-pool-empty">模型庫是空的，先到「模型庫」加語音</span>'}</div>
  </div>
  </div>`;
}

function renderNpcForm() {
    return `
<div class="vtts-card">
  <div class="vtts-card-title">➕ 新增 NPC 分類</div>
  <div class="vtts-field">
    <label class="vtts-label">分類 ID（唯一）</label>
    <input class="vtts-input" id="vtts-nf-id" type="text" placeholder="例：old_woman">
  </div>
  <div class="vtts-field">
    <label class="vtts-label">顯示名稱</label>
    <input class="vtts-input" id="vtts-nf-name" type="text" placeholder="例：大嬸">
  </div>
  <div class="vtts-save-bar">
    <button class="vtts-btn vtts-btn-ghost" onclick="VN_TTS_Panel.cancelNpcForm()">取消</button>
    <button class="vtts-btn vtts-btn-primary" onclick="VN_TTS_Panel.saveNpcCategory()">建立</button>
  </div>
</div>`;
}

// ── 工具函數 ─────────────────────────────────────────────────────────────────
function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escJs(s) {
    return String(s || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

// ── 面板控制器 ────────────────────────────────────────────────────────────────
const VN_TTS_Panel = {
    _currentTab:    'main',
    _engine:        null,    // 'index' | 'sovits'；null = 還沒決定，看設定與音色自動選
    _modelFormMode: null,   
    _npcFormMode:   false,
    _bodyId:        'vtts-body',   
    _toastId:       'vtts-toast',  
    _refPlayer: null, // 用來裝載試聽聲音的容器
    _savedListScroll: 0, // 👈 新增這行，用來記住高度

    // 目前是哪個引擎：選過就用選過的，沒選過就看實際有哪種音色
    _eng() {
        if (this._engine) return this._engine;
        const cfg = this._cfg() || {};
        if (cfg.localEngine === 'index' || cfg.localEngine === 'sovits') {
            this._engine = cfg.localEngine;
            return this._engine;
        }
        const models = Object.values(cfg.models || {});
        this._engine = models.length && models.every(m => m.engine === 'index') ? 'index'
                     : models.some(m => m.engine === 'index') && !models.some(m => m.engine !== 'index') ? 'index'
                     : models.some(m => m.engine === 'index') ? 'index' : 'sovits';
        return this._engine;
    },

    switchEngine(id) {
        if (id !== 'index' && id !== 'sovits') return;
        this._engine = id;
        this._currentTab = 'main';
        const tts = this._tts();
        if (tts) { tts.config.localEngine = id; tts.save(); }
        this._renderNav();
        this._renderBody('main');
    },

    _renderNav() {
        const nav = document.getElementById('vtts-nav');
        if (nav) nav.innerHTML = renderEngineBar(this._eng()) + renderSubTabs(this._eng(), this._currentTab);
    },

    initInline(containerId) {
        const root = document.getElementById(containerId);
        if (!root) return;
        this._bodyId  = 'vtts-inline-body';
        this._toastId = 'vtts-inline-toast';
        root.innerHTML = `
<div class="vtts-inline-root">
  <div id="vtts-nav"></div>
  <div class="vtts-toast" id="vtts-inline-toast"></div>
  <div id="vtts-inline-body"></div>
</div>`;
        this._renderNav();
        this._renderBody(this._currentTab);
    },

    _cfg() { return (window.parent || window).VN_TTS?.config || {}; },
    _tts() { return (window.parent || window).VN_TTS; },

    _toast(msg, duration = 2000) {
        const el = document.getElementById(this._toastId);
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), duration);
    },



    playRefAudio(path) {
        if (!path) {
            this._toast('✗ 沒有設定音頻路徑，你想聽什麼？空氣嗎？');
            return;
        }
        
        let url = path.replace(/\\/g, '/');
        
        // 修正路徑的流動性與防呆攔截
        if (url.includes('public/')) {
            url = '/' + url.split('public/')[1];
        } else if (url.includes('scripts/')) {
            url = '/' + url.substring(url.indexOf('scripts/')); 
        } else if (/^[a-zA-Z]:\//.test(url)) {
            // 🌟 攔截絕對路徑：瀏覽器沙盒限制，禁止直讀硬碟
            this._toast('✗ 瀏覽器無權直讀硬碟！請把模型資料夾移進 ST 的 public 資料夾內。');
            console.error('[VN_TTS] 沙盒限制：無法透過網頁請求直接讀取絕對路徑 ->', url);
            return;
        } else if (!url.includes('/')) {
            this._toast('✗ 路徑殘缺！請先在「基礎配置」填寫 ST 根目錄，然後重新掃描！');
            return;
        } else {
            if (!url.startsWith('/')) url = '/' + url; 
        }

        if (this._refPlayer) {
            this._refPlayer.pause();
            this._refPlayer.currentTime = 0;
        }
        
        this._refPlayer = new Audio(url);
        this._refPlayer.volume = 0.6;
        
        this._refPlayer.play().then(() => {
            this._toast('🎵 試聽播放中...');
        }).catch(e => {
            console.error('[VN_TTS] 試聽失敗:', e);
            this._toast('✗ 播放失敗：路徑對不上或格式不對');
        });
    },

    playNpcSelectedModel(catId) {
        const tts = this._tts();
        if (!tts) return;
        const sel = document.getElementById(`vtts-chip-sel-${catId}`);
        const mid = sel?.value;
        
        // 🌟 如果選回空白選項，就安靜地結束，不要破壞氣氛
        if (!mid) return; 

        const m = tts.config.models[mid];
        if (!m || !m.refAudioPath) { 
            this._toast('✗ 這聲音連靈魂（參考音頻）都沒有，你要我播什麼？'); 
            return; 
        }
        this.playRefAudio(m.refAudioPath);
    },

    switchTab(tab) {
        this._currentTab = tab;
        this._renderNav();
        this._renderBody(tab);
    },

    _renderBody(tab) {
        const body = document.getElementById(this._bodyId);
        if (!body) return;
        const cfg = this._cfg();
        const eng = this._eng();

        if (tab === 'main') {
            // SoVITS 的設定頁沿用原本那份，一個字都沒改
            body.innerHTML = (eng === 'index') ? renderIndexTab(cfg) : renderBasic(cfg);
            return;
        }
        if (tab === 'voices') {
            if (eng === 'index') { body.innerHTML = renderIndexVoices(cfg); return; }
            if (this._modelFormMode === 'add') body.innerHTML = renderModelForm(null, null);
            else if (this._modelFormMode)      body.innerHTML = renderModelForm(this._modelFormMode, cfg.models[this._modelFormMode]);
            else                               body.innerHTML = renderModels(cfg, eng);
            return;
        }
        if (tab === 'chars') { body.innerHTML = renderChars(cfg, eng); return; }
        if (tab === 'npc') {
            if (this._npcFormMode) body.innerHTML = renderNpcForm();
            else                   body.innerHTML = renderNpc(cfg, eng);
        }
    },

    addEmotionSlot() {
        const container = document.getElementById('vtts-mf-emotions-container');
        if (container) {
            container.insertAdjacentHTML('beforeend', renderEmotionBlock('', {}));
        }
    },

    // ── 儲存配置，新增了動態抓取四大參數的邏輯 ────────────────────────────
    // 欄位分散在不同分頁，不在畫面上的就跳過不動（不能假設全都在，會 null）
    saveBasic() {
        const tts = this._tts();
        if (!tts) return;
        const el  = (id) => document.getElementById(id);
        const str = (id, key) => { const e = el(id); if (e) tts.config[key] = e.value.trim(); };
        const num = (id, key, fn) => { const e = el(id); if (e) { const v = fn(e.value); if (!isNaN(v)) tts.config[key] = v; } };
        const F = parseFloat, I = (v) => parseInt(v, 10);

        const en = el('vtts-enabled'); if (en) tts.config.enabled = en.checked;
        str('vtts-server',  'serverUrl');
        str('vtts-st-root', 'stRoot');
        const lang = el('vtts-lang'); if (lang) tts.config.textLang = lang.value;

        num('vtts-spd',   'speed',       F);
        num('vtts-topk',  'topK',        I);
        num('vtts-topp',  'topP',        F);
        num('vtts-temp',  'temperature', F);
        num('vtts-steps', 'sampleSteps', I);
        const vol = el('vtts-vol'); if (vol) tts.config.volume = F(vol.value);
        num('vtts-idxemo', 'indexEmoAlpha', F);   // IndexTTS 頁才有這顆，SoVITS 頁沒有就跳過

        tts.save();
        this._toast('✓ 已儲存');
    },

    async testConnection() {
        const url = document.getElementById('vtts-server')?.value || this._cfg().serverUrl;
        
        try {
            const targetUrl = url.endsWith('/') ? url : `${url}/`;
            const r = await fetch(targetUrl, { 
                method: 'GET',
                mode: 'cors',
                signal: AbortSignal.timeout(3000) 
            });
            
            if (r.ok) {
                this._toast('✓ 連線成功');
                console.log("[TTS] 伺服器連線測試成功");
            } else {
                this._toast(`✗ 伺服器回應異常: ${r.status}`);
            }
        } catch(e) {
            console.error("[TTS] 測試連線被拒絕:", e);
            this._toast('✗ 無法連線 (請確認黑畫面有開)');
        }
    },

    // ── 匯出/匯入配置 ────────────────────────────
    exportConfig() {
        const tts = this._tts();
        if (!tts) return;
        const data = JSON.stringify(tts.config, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vn_tts_config_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this._toast('✓ 配置已完美匯出');
    },

    importConfig(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const tts = this._tts();
                if (tts) {
                    // 將檔案內容與目前的配置合併
                    Object.assign(tts.config, data);
                    tts.save();
                    this._toast('✓ 配置已成功匯入');
                    this._renderBody(this._currentTab);
                }
            } catch (err) {
                this._toast('✗ 檔案格式錯誤，這不是對的靈魂');
                console.error('[VN_TTS_Panel] 匯入失敗', err);
            }
        };
        reader.readAsText(file);
        input.value = ''; // 歸零，允許重複匯入同一個檔案
    },

    addModel() {
        const body = document.getElementById(this._bodyId);
        if (body) this._savedListScroll = body.scrollTop;
        this._modelFormMode = 'add';
        this._renderBody('models');
    },

    cancelModelForm() {
        this._modelFormMode = null;
        this._renderBody('models');
        this._restoreListScroll(); // 👈 取消時恢復高度
    },

    // 👈 新增這個輔助函數
    _restoreListScroll() {
        requestAnimationFrame(() => {
            const body = document.getElementById(this._bodyId);
            if (body) body.scrollTop = this._savedListScroll || 0;
        });
    },

    // ── 掃描選取的資料夾（<input webkitdirectory> 回調）─────────────────
    onDirPicked(input) {
        const tts = this._tts();
        if (!tts || !input.files.length) return;

        const stRoot   = tts.config.stRoot || '';
        const EXT_REL  = 'public\\scripts\\extensions\\third-party\\' + (window.AURELIA_EXT_NAME || 'my-tavern-extension') + '\\models';
        const basePath = stRoot ? `${stRoot}\\${EXT_REL}` : '';

        // 把 FileList 按第一層子資料夾分組
        // webkitRelativePath 格式：「選取的資料夾名/子資料夾/檔名」
        const byFolder = {};
        for (const file of input.files) {
            const parts = file.webkitRelativePath.split('/');
            if (parts.length < 2) continue;          // 根目錄檔案跳過
            const sub = parts[parts.length - 2];     // 直屬父資料夾 = 模型名
            if (!byFolder[sub]) byFolder[sub] = [];
            byFolder[sub].push(file);
        }

        let imported = 0;
        for (const [folderName, files] of Object.entries(byFolder)) {
            if (tts.config.models[folderName]) continue; // 已存在跳過

            let gptFile = '', sovitsFile = '', refFile = '', refText = '';
            const emotions = {};

            for (const file of files) {
                const lower = file.name.toLowerCase();

                if (lower.endsWith('.ckpt') && !gptFile)    gptFile    = file.name;
                if (lower.endsWith('.pth')  && !sovitsFile) sovitsFile = file.name;

                if (lower.endsWith('.wav') || lower.endsWith('.mp3')) {
                    const base = file.name.replace(/\.[^.]+$/, '');
                    const m    = base.match(/^([^_]+)_(.+)$/);
                    const emo  = m ? m[1] : 'default';
                    const txt  = m ? m[2] : base;
                    const full = basePath ? `${basePath}\\${folderName}\\${file.name}` : file.name;

                    if (emo === 'default' && !refFile) {
                        refFile = file.name; refText = txt;
                    } else {
                        emotions[emo] = { refAudioPath: full, refText: txt, refLang: 'zh' };
                        if (!refFile) { refFile = file.name; refText = txt; }
                    }
                }
            }

            if (!gptFile && !sovitsFile) continue;

            const p = f => basePath ? `${basePath}\\${folderName}\\${f}` : f;

            tts.config.models[folderName] = {
                name:         folderName,
                gptPath:      gptFile    ? p(gptFile)    : '',
                sovitsPath:   sovitsFile ? p(sovitsFile) : '',
                refAudioPath: refFile    ? p(refFile)    : '',
                refText,
                refLang:      'zh',
                emotions
            };
            imported++;
        }

        input.value = ''; // 重置，允許再次選同一資料夾
        tts.save();

        if (!imported) {
            this._toast('⚠️ 未找到模型（子資料夾需含 .ckpt 或 .pth）');
        } else if (!basePath) {
            this._toast(`✓ 已新增 ${imported} 個模型（請在基礎配置填根目錄以補全路徑）`);
        } else {
            this._toast(`✓ 已新增 ${imported} 個模型，路徑已自動補全`);
        }
        this._modelFormMode = null;
        this._renderBody('models');
    },

    // ── 從 models/tts_models.json 批次載入（配合 scan_models.py 使用）──────
    async loadLocalConfig() {
        const tts = this._tts();
        if (!tts) return;

        // 固定 URL：SillyTavern 會把 public/ 下的內容直接 serve
        const url = '/scripts/extensions/third-party/' + (window.AURELIA_EXT_NAME || 'my-tavern-extension') + '/models/tts_models.json';
        let data;
        try {
            const resp = await fetch(`${url}?_=${Date.now()}`); // 繞過瀏覽器快取
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            data = await resp.json();
        } catch (e) {
            this._toast('✗ 找不到 tts_models.json，請先執行 scan_models.py');
            console.error('[VN_TTS_Panel] 載入配置失敗', e);
            return;
        }

        if (!data.models || typeof data.models !== 'object') {
            this._toast('✗ 格式錯誤：缺少 models 欄位');
            return;
        }

        let newCount = 0, updateCount = 0;

        // 合併 models：新項目直接加入；已存在的更新 name 與路徑，但保留使用者自訂的 emotions
        for (const [id, model] of Object.entries(data.models)) {
            const existing = tts.config.models[id];
            if (existing) {
                const merged = { ...existing, ...model };
                if (existing.emotions && Object.keys(existing.emotions).length) {
                    merged.emotions = existing.emotions; // 保留使用者自訂情緒，不被 JSON 的空物件蓋掉
                }
                tts.config.models[id] = merged;
                updateCount++;
            } else {
                tts.config.models[id] = model;
                newCount++;
            }
        }

        // 合併 charMappings（同樣不覆蓋）
        for (const [char, mid] of Object.entries(data.charMappings || {})) {
            if (!tts.config.charMappings[char]) tts.config.charMappings[char] = mid;
        }

        // 合併 systemMappings（同樣不覆蓋；空字串 key = 預設系統音）
        if (!tts.config.systemMappings) tts.config.systemMappings = {};
        for (const [sname, mid] of Object.entries(data.systemMappings || {})) {
            if (tts.config.systemMappings[sname] === undefined) tts.config.systemMappings[sname] = mid;
        }

        // 合併 npcCategories（以 id 去重）
        const existingIds = new Set((tts.config.npcCategories || []).map(c => c.id));
        for (const cat of (data.npcCategories || [])) {
            if (!existingIds.has(cat.id)) tts.config.npcCategories.push(cat);
        }

        tts.save();
        this._modelFormMode = null;
        this._renderBody('models');

        if (newCount === 0 && updateCount === 0) {
            this._toast('⚠️ 配置檔內無模型資料');
        } else {
            this._toast(`✓ 新增 ${newCount} 個、更新 ${updateCount} 個模型`, 3000);
        }
    },

    editModel(id) {
        const body = document.getElementById(this._bodyId);
        if (body) this._savedListScroll = body.scrollTop;
        this._modelFormMode = id;
        this._renderBody('models');
    },

    saveModel(originalId) {
        const tts   = this._tts();
        if (!tts) return;
        const newId = document.getElementById('vtts-mf-id').value.trim();
        if (!newId) { this._toast('✗ 請填寫模型 ID'); return; }

        const emotions = {};
        const bodyEl = document.getElementById(this._bodyId);
        if (bodyEl) {
            const blocks = bodyEl.querySelectorAll('.vtts-emo-block');
            blocks.forEach(block => {
                const key = block.querySelector('.vtts-emo-key')?.value.trim();
                const rPath = block.querySelector('.vtts-emo-path')?.value.trim();
                const rTxt = block.querySelector('.vtts-emo-txt')?.value.trim();
                const rLang = block.querySelector('.vtts-emo-lang')?.value;
                
                if (key && rPath) {
                    emotions[key] = { refAudioPath: rPath, refText: rTxt, refLang: rLang };
                }
            });
        }

        const model = {
            name:         document.getElementById('vtts-mf-name').value.trim() || newId,
            gptPath:      document.getElementById('vtts-mf-gpt').value.trim(),
            sovitsPath:   document.getElementById('vtts-mf-sovits').value.trim(),
            refAudioPath: document.getElementById('vtts-mf-ref').value.trim(),
            refText:      document.getElementById('vtts-mf-rtext').value.trim(),
            refLang:      document.getElementById('vtts-mf-rlang').value,
            emotions:     emotions 
        };

        if (originalId && originalId !== newId) {
            delete tts.config.models[originalId];
            Object.keys(tts.config.charMappings).forEach(c => {
                if (tts.config.charMappings[c] === originalId) tts.config.charMappings[c] = newId;
            });
            tts.config.npcCategories.forEach(cat => {
                cat.modelIds = cat.modelIds.map(m => m === originalId ? newId : m);
            });
        }

        tts.config.models[newId] = model;
        tts.save();
        this._modelFormMode = null;
        this._toast('✓ 模型已儲存');
        this._renderBody('models');
        this._restoreListScroll(); // 👈 儲存後恢復高度
    },

    deleteAllModels() {
        const tts = this._tts();
        if (!tts) return;
        const modelCount = Object.keys(tts.config.models).length;
        
        if (modelCount === 0) {
            this._toast('⚠️ 已經沒有模型可以刪除了');
            return;
        }
        
        if (!confirm(`確定要「一鍵清空」所有 ${modelCount} 個模型嗎？\n注意：這會同時清空所有角色的語音綁定！`)) return;
        
        // 記住當下高度
        const body = document.getElementById(this._bodyId);
        const currentScroll = body ? body.scrollTop : 0;

        // 核心：清空模型與關聯數據
        tts.config.models = {};
        tts.config.charMappings = {};
        tts.config.npcCategories.forEach(cat => {
            cat.modelIds = [];
        });
        
        tts.save();
        this._renderBody('models');
        
        // 原地恢復高度
        requestAnimationFrame(() => {
            const b = document.getElementById(this._bodyId);
            if (b) b.scrollTop = currentScroll;
        });
        
        this._toast('✓ 所有模型已清空');
    },

    // ── 🖥️ 系統語音對應 ────────────────────────────────────────────────
    addSystemMapping() {
        const tts = this._tts();
        if (!tts) return;
        if (!tts.config.systemMappings) tts.config.systemMappings = {};
        const name = document.getElementById('vtts-new-sys').value.trim();
        const mid  = document.getElementById('vtts-new-sys-model').value;
        if (!mid) { this._toast('✗ 請選擇模型'); return; }
        tts.config.systemMappings[name] = mid;   // name 可為空 ＝ 預設系統音
        tts.save();
        this._toast(name ? `✓ 已新增系統音：${name}` : '✓ 已設定預設系統音');
        this._renderNarr();
    },

    updateSystemMapping(sysName, modelId) {
        const tts = this._tts();
        if (!tts) return;
        if (!tts.config.systemMappings) tts.config.systemMappings = {};
        if (modelId) tts.config.systemMappings[sysName] = modelId;
        else         delete tts.config.systemMappings[sysName];
        tts.save();
    },

    // 旁白·系統選擇器：掛到「模式切換下方」永遠顯示的容器（os_settings 的 vn-narr-inline-root），跨模式都看得到
    mountNarration(id) { this._narrRootId = id || 'vn-narr-inline-root'; this._renderNarr(); },
    _renderNarr() { const el = document.getElementById(this._narrRootId || 'vn-narr-inline-root'); if (el) el.innerHTML = renderVoice(this._cfg()); },

    // ── 📜 旁白音色（單一選擇器：不念 / Kokoro / 任一 SoVITS 模型）──────
    updateNarratorSource(val) {
        const tts = this._kok();
        if (!tts) return;
        if (!tts.config.narratorMinimax) tts.config.narratorMinimax = { enabled:false, voice:'audiobook_female_1' };
        if (!tts.config.narratorIndex) tts.config.narratorIndex = { enabled:false, url:'http://127.0.0.1:8881', voice:'', speed:1 };
        tts.config.narratorKokoro.enabled  = (val === '__kokoro__');
        tts.config.narratorMinimax.enabled = (val === '__minimax__');
        tts.config.narratorIndex.enabled   = (val === '__index__');
        if (val !== '__kokoro__' && val !== '__minimax__' && val !== '__index__') tts.config.narratorModel = val || '';
        tts.save();
        this._renderNarr();
    },
    updateMinimaxNarrVoice(voice) {
        const tts = this._tts(); if (!tts) return;
        if (!tts.config.narratorMinimax) tts.config.narratorMinimax = { enabled:false, voice:'audiobook_female_1' };
        tts.config.narratorMinimax.voice = voice || 'audiobook_female_1';
        tts.save();
    },
    testMinimax() {
        const W = (window.parent || window);
        const voice = (this._cfg().narratorMinimax || {}).voice || 'audiobook_female_1';
        if (W.OS_MINIMAX && W.OS_MINIMAX.play) { W.OS_MINIMAX.play('這是旁白語音的試聽，聽聽聲音和速度。', voice); this._toast('🔊 試聽中…（需先設定 MiniMax API key）'); }
        else this._toast('✗ MiniMax 未載入');
    },

    _kok() { const tts = this._tts(); if (!tts) return null; if (!tts.config.narratorKokoro) tts.config.narratorKokoro = { enabled:false, url:'http://127.0.0.1:8880', voice:'zf_xiaoxiao' }; return tts; },
    updateKokoroUrl(url) {
        const tts = this._kok(); if (!tts) return;
        tts.config.narratorKokoro.url = (url || '').trim();
        tts.save();
    },
    updateKokoroVoice(voice) {
        const tts = this._kok(); if (!tts) return;
        tts.config.narratorKokoro.voice = voice || 'zf_xiaoxiao';
        tts.save();
    },
    testKokoro() {
        const tts = this._tts(); if (!tts) return;
        if (typeof tts._speakKokoro === 'function') { tts._speakKokoro('這是旁白語音的試聽，聽聽聲音和速度。'); this._toast('🔊 試聽中…（服務沒開會沒聲音）'); }
    },

    // ── IndexTTS 服務網址（配置頁；音色各自存一份，這裡統一改）─────────
    testIndexUrl() {
        const el = document.getElementById('vtts-index-url');
        const base = String(el ? el.value : '').trim().replace(/\/+$/, '');
        if (!base) { this._toast('✗ 先填網址'); return; }
        this._toast('測試中…');
        fetch(base + '/health')
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(d => this._toast(d.ready ? `✓ 連上了，${(d.voices || []).length} 個音色` : '△ 連上了，模型還在載入'))
            .catch(e => this._toast('✗ 連不上（服務沒開？）'));
    },
    applyIndexUrl() {
        const tts = this._tts(); if (!tts) return;
        const el = document.getElementById('vtts-index-url');
        const base = String(el ? el.value : '').trim().replace(/\/+$/, '');
        if (!base) { this._toast('✗ 先填網址'); return; }
        let n = 0;
        for (const m of Object.values(tts.config.models || {})) {
            if (m.engine === 'index') { m.url = base; n++; }
        }
        // 旁白如果也用 IndexTTS，一起帶著改，免得只改一半
        if (tts.config.narratorIndex) tts.config.narratorIndex.url = base;
        tts.save();
        this._renderBody('basic');
        this._toast(`✓ ${n} 個音色都改成 ${base}`);
    },

    // ── IndexTTS 旁白 ───────────────────────────────────────────────────
    _idx() {
        const tts = this._tts(); if (!tts) return null;
        if (!tts.config.narratorIndex) tts.config.narratorIndex = { enabled:false, url:'http://127.0.0.1:8881', voice:'', speed:1 };
        return tts;
    },
    updateIndexUrl(url) {
        const tts = this._idx(); if (!tts) return;
        tts.config.narratorIndex.url = (url || '').trim();
        tts.save();
    },
    // 音色與情緒分開存，但送出時合成 '音色:情緒' 一個字串（服務端就吃這個格式）
    updateIndexVoice(voice) {
        const tts = this._idx(); if (!tts) return;
        const cur = String(tts.config.narratorIndex.voice || '');
        const emo = cur.indexOf(':') >= 0 ? cur.split(':')[1] : '';
        tts.config.narratorIndex.voice = emo ? `${voice}:${emo}` : (voice || '');
        tts.save();
    },
    updateIndexEmotion(emo) {
        const tts = this._idx(); if (!tts) return;
        const cur = String(tts.config.narratorIndex.voice || '');
        const v = cur.split(':')[0] || '';
        tts.config.narratorIndex.voice = emo ? `${v}:${emo}` : v;
        tts.save();
    },
    async loadIndexVoices() {
        const tts = this._idx(); if (!tts) return;
        const base = String(tts.config.narratorIndex.url || '').replace(/\/+$/, '');
        if (!base) { this._toast('✗ 先填服務網址'); return; }
        this._toast('讀取中…');
        try {
            const resp = await fetch(base + '/v1/voices');
            if (!resp.ok) { this._toast('✗ 服務回應異常 ' + resp.status); return; }
            const data = await resp.json();
            const voices = (data.voices || []).map(v => v.id);
            tts.config.narratorIndex.voices   = voices;
            tts.config.narratorIndex.emotions = data.emotions || [];
            // 還沒選過音色就自動選第一個，省一次點擊
            if (!tts.config.narratorIndex.voice && voices.length) tts.config.narratorIndex.voice = voices[0];
            tts.save();
            this._renderNarr();
            this._toast(`✓ 找到 ${voices.length} 個音色`);
        } catch (e) {
            this._toast('✗ 連不上服務（沒開？）');
        }
    },
    testIndex() {
        const tts = this._tts(); if (!tts) return;
        if (typeof tts._speakIndex === 'function') { tts._speakIndex('這是旁白語音的試聽，聽聽聲音和速度。'); this._toast('🔊 試聽中…（服務沒開會沒聲音）'); }
    },

    // 腳本的表情會先被轉成這六個基礎情緒，這裡把它們接到服務端對應的情緒檔上
    _INDEX_EMO_ALIAS: {
        happy: 'Happy', sad: 'Sad', angry: 'Angry',
        surprise: 'Surprised', scare: 'JumpScare', hate: 'Dissatisfied'
    },

    // 把服務上的音色整批變成模型，每個音色自帶全套情緒；角色分頁即可直接指派
    async importIndexVoices() {
        const tts = this._idx(); if (!tts) return;
        const base = String(tts.config.narratorIndex.url || '').replace(/\/+$/, '');
        if (!base) { this._toast('✗ 先到「配置」頁填語音服務網址'); return; }
        this._toast('讀取中…');
        let data;
        try {
            const resp = await fetch(base + '/v1/voices');
            if (!resp.ok) { this._toast('✗ 服務回應異常 ' + resp.status); return; }
            data = await resp.json();
        } catch (e) { this._toast('✗ 連不上服務（沒開？）'); return; }

        const voices = (data.voices || []).map(v => v.id);
        if (!voices.length) { this._toast('✗ 服務上沒有音色'); return; }
        const srvEmos = data.emotions || [];

        // 三種寫法都掛上：原樣(Smirk)、小寫(smirk)、基礎情緒別名(angry→Angry)
        const emotions = {};
        for (const e of srvEmos) {
            emotions[e] = { emo: e };
            if (e.toLowerCase() !== e) emotions[e.toLowerCase()] = { emo: e };
        }
        for (const [alias, srv] of Object.entries(this._INDEX_EMO_ALIAS)) {
            if (srvEmos.indexOf(srv) >= 0) emotions[alias] = { emo: srv };
        }

        let added = 0, updated = 0;
        for (const v of voices) {
            const id = 'idx_' + v;
            const exists = !!tts.config.models[id];
            // emoAlpha 0.5：情緒參考音檔會把音色往它自己的方向拉，0.5 以下不受影響
            tts.config.models[id] = {
                name: v, engine: 'index', url: base, voice: v, speed: 1, emoAlpha: 0.5,
                emotions: JSON.parse(JSON.stringify(emotions))
            };
            exists ? updated++ : added++;
        }
        tts.save();
        this._renderBody('models');
        this._toast(`✓ 音色 ${added} 新增／${updated} 更新，各帶 ${srvEmos.length} 種情緒`);
    },

    deleteSystemMapping(sysName) {
        const tts = this._tts();
        if (!tts) return;
        if (tts.config.systemMappings) delete tts.config.systemMappings[sysName];
        tts.save();
        this._renderNarr();
    },

    addCharMapping() {
        const tts  = this._tts();
        if (!tts) return;
        const name = document.getElementById('vtts-new-char').value.trim();
        const mid  = document.getElementById('vtts-new-char-model').value;
        if (!name) { this._toast('✗ 請填寫角色名稱'); return; }
        if (!mid)  { this._toast('✗ 請選擇模型'); return; }
        tts.config.charMappings[name] = mid;
        tts.save();
        this._toast(`✓ 已新增：${name}`);
        this._renderBody('chars');
    },

    updateCharMapping(charName, modelId) {
        const tts = this._tts();
        if (!tts) return;
        if (modelId) tts.config.charMappings[charName] = modelId;
        else         delete tts.config.charMappings[charName];
        tts.save();
    },

    deleteCharMapping(charName) {
        const tts = this._tts();
        if (!tts) return;
        delete tts.config.charMappings[charName];
        if (tts.config.charAliases) delete tts.config.charAliases[charName];
        tts.save();
        this._renderBody('chars');
    },

    // 本卡 NPC 聲線鎖（立繪 save CV）：解除單個 / 清空本卡
    unlockNpc(charName) {
        const tts = this._tts();
        if (!tts || typeof tts.unlockNpcVoice !== 'function') return;
        tts.unlockNpcVoice(charName);
        this._renderBody('chars');
    },
    clearCardLocks() {
        const tts = this._tts();
        if (!tts || typeof tts.clearCardLocks !== 'function') return;
        tts.clearCardLocks();
        this._toast('✓ 已清空本卡 NPC 聲線鎖');
        this._renderBody('chars');
    },

    // 新增別名（AI 用全名/小名都能對到同一個模型）
    addAlias(charName, alias) {
        const tts = this._tts();
        if (!tts) return;
        const a = String(alias || '').trim();
        if (!a) return;
        if (!tts.config.charAliases || typeof tts.config.charAliases !== 'object') tts.config.charAliases = {};
        if (!Array.isArray(tts.config.charAliases[charName])) tts.config.charAliases[charName] = [];
        const list = tts.config.charAliases[charName];
        const lc = a.toLowerCase();
        if (String(charName).toLowerCase() === lc) { this._toast('✗ 別名不能跟主名相同'); return; }
        if (list.some(x => String(x).toLowerCase() === lc)) { this._toast('✗ 此別名已存在'); return; }
        // 跨角色衝突檢查（同一別名指向兩個主名會混亂）
        for (const [other, otherList] of Object.entries(tts.config.charAliases)) {
            if (other === charName) continue;
            if (Array.isArray(otherList) && otherList.some(x => String(x).toLowerCase() === lc)) {
                this._toast(`✗ 別名「${a}」已被「${other}」使用`);
                return;
            }
        }
        list.push(a);
        tts.save();
        this._renderBody('chars');
    },

    removeAlias(charName, alias) {
        const tts = this._tts();
        if (!tts || !tts.config.charAliases) return;
        const list = tts.config.charAliases[charName];
        if (!Array.isArray(list)) return;
        const lc = String(alias).toLowerCase();
        tts.config.charAliases[charName] = list.filter(a => String(a).toLowerCase() !== lc);
        if (!tts.config.charAliases[charName].length) delete tts.config.charAliases[charName];
        tts.save();
        this._renderBody('chars');
    },

    toggleNpcDropdown(e) {
        if (e) e.stopPropagation();
        const list = document.getElementById('vtts-npc-dd-list');
        if (!list) return;
        const willOpen = !list.classList.contains('open');
        list.classList.toggle('open', willOpen);
        if (willOpen) {
            const close = (ev) => {
                const dd = document.getElementById('vtts-npc-dd');
                if (!dd || !dd.contains(ev.target)) {
                    list.classList.remove('open');
                    document.removeEventListener('click', close, true);
                }
            };
            setTimeout(() => document.addEventListener('click', close, true), 0);
        }
    },

    selectNpcCategory(id) {
        _npcSel = id;
        this._renderBody('npc');
    },

    addNpcCategory() {
        this._npcFormMode = true;
        this._renderBody('npc');
    },

    cancelNpcForm() {
        this._npcFormMode = false;
        this._renderBody('npc');
    },

    saveNpcCategory() {
        const tts  = this._tts();
        if (!tts) return;
        const id   = document.getElementById('vtts-nf-id').value.trim();
        const name = document.getElementById('vtts-nf-name').value.trim();
        if (!id || !name) { this._toast('✗ ID 與名稱必填'); return; }
        if (tts.config.npcCategories.find(c => c.id === id)) {
            this._toast('✗ 此 ID 已存在'); return;
        }
        tts.config.npcCategories.push({ id, name, tags: [], modelIds: [] });
        tts.save();
        _npcSel = id;   // 新建後自動選中、只顯示這張卡
        this._npcFormMode = false;
        this._toast(`✓ 已建立分類：${name}`);
        this._renderBody('npc');
    },

    deleteNpcCategory(id) {
        const tts = this._tts();
        if (!tts) return;
        if (!confirm('確定刪除此 NPC 分類？')) return;
        tts.config.npcCategories = tts.config.npcCategories.filter(c => c.id !== id);
        tts.save();
        this._renderBody('npc');
    },

    addNpcTag(catId) {
        const tts = this._tts();
        if (!tts) return;
        const inp = document.getElementById(`vtts-tag-input-${catId}`);
        const tag = inp?.value.trim();
        if (!tag) return;
        const cat = tts.config.npcCategories.find(c => c.id === catId);
        if (!cat) return;
        if (!cat.tags.includes(tag)) { cat.tags.push(tag); tts.save(); }
        inp.value = '';
        this._renderBody('npc');
    },

    removeNpcTag(catId, tag) {
        const tts = this._tts();
        if (!tts) return;
        const cat = tts.config.npcCategories.find(c => c.id === catId);
        if (!cat) return;
        cat.tags = cat.tags.filter(t => t !== tag);
        tts.save();
        this._renderBody('npc');
    },

    addNpcModel(catId, mid) {
        const tts = this._tts();
        if (!tts || !mid) return;
        const cat = tts.config.npcCategories.find(c => c.id === catId);
        if (!cat) return;
        if (cat.modelIds.includes(mid)) return;   // 已加過
        cat.modelIds.push(mid); tts.save();
        // 就地更新：池子移除該卡、加進已選 chips（不整頁重繪→不跳頁、搜尋不重置，可連點多個）
        const pool = document.getElementById(`vtts-pool-${catId}`);
        if (pool) { const pc = Array.prototype.find.call(pool.querySelectorAll('.vtts-pool-chip'), c => c.getAttribute('data-mid') === mid); if (pc) pc.remove(); }
        const box = document.getElementById(`vtts-chips-${catId}`);
        if (box) {
            if (!box.querySelector('.vtts-model-chip')) box.innerHTML = '';   // 清掉「尚未指定」placeholder
            const m = tts.config.models[mid];
            const nm = esc(m ? (m.name || mid) : mid);
            box.insertAdjacentHTML('beforeend',
                `<span class="vtts-model-chip" data-mid="${esc(mid)}">${nm}<span class="vtts-model-chip-play" onclick="VN_TTS_Panel.playNpcModel('${escJs(mid)}')" title="試聽">▶</span><span class="vtts-model-chip-del" onclick="VN_TTS_Panel.removeNpcModel('${escJs(catId)}','${escJs(mid)}')">✕</span></span>`);
        }
    },

    removeNpcModel(catId, modelId) {
        const tts = this._tts();
        if (!tts) return;
        const cat = tts.config.npcCategories.find(c => c.id === catId);
        if (!cat) return;
        cat.modelIds = cat.modelIds.filter(m => m !== modelId);
        tts.save();
        // 就地：移除已選 chip、把模型放回池子（套用目前搜尋）
        const box = document.getElementById(`vtts-chips-${catId}`);
        if (box) { const ch = Array.prototype.find.call(box.querySelectorAll('.vtts-model-chip'), c => c.getAttribute('data-mid') === modelId); if (ch) ch.remove(); }
        const pool = document.getElementById(`vtts-pool-${catId}`);
        if (pool) {
            const m = tts.config.models[modelId];
            const nm = esc(m ? (m.name || modelId) : modelId);
            const lname = esc(String(m ? (m.name || modelId) : modelId).toLowerCase());
            pool.insertAdjacentHTML('beforeend',
                `<span class="vtts-pool-chip" data-mid="${esc(modelId)}" data-name="${lname}" onclick="VN_TTS_Panel.addNpcModel('${escJs(catId)}','${escJs(modelId)}')" title="點一下加入"><span class="vtts-pool-play" onclick="event.stopPropagation();VN_TTS_Panel.playNpcModel('${escJs(modelId)}')" title="試聽">▶</span>${nm}</span>`);
            this.filterNpcPool(catId);
        }
    },

    // 搜尋過濾模型池：依名稱即時 show/hide，免滾長清單
    filterNpcPool(catId) {
        const q = (document.getElementById(`vtts-pool-search-${catId}`)?.value || '').trim().toLowerCase();
        const pool = document.getElementById(`vtts-pool-${catId}`);
        if (!pool) return;
        pool.querySelectorAll('.vtts-pool-chip').forEach(ch => {
            const nm = ch.getAttribute('data-name') || '';
            ch.classList.toggle('vtts-pool-hide', !!q && nm.indexOf(q) === -1);
        });
    },

    // 試聽單一模型（給池子卡片 / 已選 chip 的 ▶ 用）
    playNpcModel(modelId) {
        const tts = this._tts();
        if (!tts) return;
        const m = tts.config.models[modelId];
        if (!m) { this._toast('✗ 找不到這個聲音'); return; }
        // IndexTTS 音色沒有參考音頻可放，直接合成一句來聽
        if (m.engine === 'index') {
            tts._speakWithModel({ id: modelId, ...m }, '這是這個角色的聲音試聽。', '');
            this._toast('🔊 試聽中…（服務沒開會沒聲音）');
            return;
        }
        if (!m.refAudioPath) { this._toast('✗ 這聲音沒有參考音頻，沒得播'); return; }
        this.playRefAudio(m.refAudioPath);
    },
};


// ── 掛到 window ───────────────────────────────────────────────────────────────
window.VN_TTS_Panel = VN_TTS_Panel;
console.log('[VN_TTS_Panel] 已載入');

})();