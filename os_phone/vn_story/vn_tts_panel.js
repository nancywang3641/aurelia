'use strict';
// VN_TTS_Panel — TTS 設定面板（模型庫 / 角色對應 / NPC 配音）
(function () {

// ── 面板 CSS ────────────────────────────────────────────────────────────────
const PANEL_CSS = `
#vn-tts-overlay {
    position: absolute; inset: 0; z-index: 9000;
    background: rgba(0,0,0,0.96);
    display: flex; flex-direction: column;
    font-family: 'Microsoft JhengHei', sans-serif;
    color: #e0e0e0;
    overflow: hidden;
}
#vn-tts-overlay.hidden { display: none !important; }

.vtts-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 18px;
    border-bottom: 1px solid rgba(212,175,55,0.25);
    background: rgba(0,0,0,0.6);
    flex-shrink: 0;
}
.vtts-header h2 {
    margin: 0; font-size: 16px; color: #d4af37;
    letter-spacing: 2px; font-weight: 600;
}
.vtts-close {
    background: none; border: 1px solid #444; color: #aaa;
    width: 28px; height: 28px; border-radius: 4px;
    cursor: pointer; font-size: 16px; line-height: 1;
    transition: all .2s;
}
.vtts-close:hover { border-color: #d4af37; color: #d4af37; }

/* ── 分頁 ── */
.vtts-tabs {
    display: flex; gap: 0; flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    background: rgba(10,10,15,0.8);
}
.vtts-tab {
    padding: 10px 18px; font-size: 13px; cursor: pointer;
    border: none; background: none; color: #888;
    border-bottom: 2px solid transparent;
    transition: all .2s;
}
.vtts-tab:hover { color: #d4af37; }
.vtts-tab.active { color: #d4af37; border-bottom-color: #d4af37; }

/* ── 內容區 ── */
.vtts-body {
    flex: 1; overflow-y: auto; padding: 16px 18px;
    scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.vtts-body::-webkit-scrollbar { width: 4px; }
.vtts-body::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

/* ── 通用表單元件 ── */
.vtts-field { margin-bottom: 16px; }
.vtts-label {
    display: block; font-size: 12px; color: #aaa;
    margin-bottom: 5px; letter-spacing: .5px;
}
.vtts-input {
    width: 100%; box-sizing: border-box;
    background: #0f0f14; border: 1px solid #333;
    color: #e0e0e0; padding: 8px 10px; font-size: 13px;
    border-radius: 4px; transition: border-color .2s;
    font-family: inherit;
}
.vtts-input:focus { outline: none; border-color: #d4af37; }
select.vtts-input { cursor: pointer; }
.vtts-hint { font-size: 11px; color: #666; margin-top: 4px; }

.vtts-row { display: flex; gap: 10px; align-items: center; }
.vtts-row .vtts-input { flex: 1; }

/* ── Toggle ── */
.vtts-switch-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 0;
}
.vtts-switch-label { font-size: 13px; color: #ccc; }
.vtts-toggle-wrap { position: relative; width: 40px; height: 22px; }
.vtts-toggle-wrap input { opacity: 0; width: 0; height: 0; }
.vtts-toggle-slider {
    position: absolute; inset: 0; border-radius: 22px;
    background: #333; cursor: pointer; transition: .3s;
}
.vtts-toggle-slider::before {
    content: ''; position: absolute;
    width: 16px; height: 16px; border-radius: 50%;
    left: 3px; top: 3px; background: #888; transition: .3s;
}
.vtts-toggle-wrap input:checked + .vtts-toggle-slider { background: #d4af37; }
.vtts-toggle-wrap input:checked + .vtts-toggle-slider::before {
    transform: translateX(18px); background: #000;
}

/* ── 按鈕 ── */
.vtts-btn {
    padding: 7px 14px; font-size: 12px; cursor: pointer;
    border-radius: 4px; border: none; font-family: inherit;
    transition: all .2s; white-space: nowrap;
}
.vtts-btn-primary {
    background: #d4af37; color: #000; font-weight: 600;
}
.vtts-btn-primary:hover { background: #f3e5ab; }
.vtts-btn-ghost {
    background: transparent; color: #888; border: 1px solid #444;
}
.vtts-btn-ghost:hover { border-color: #d4af37; color: #d4af37; }
.vtts-btn-danger {
    background: transparent; color: #e55; border: 1px solid #633;
}
.vtts-btn-danger:hover { background: #300; }
.vtts-btn-cyan {
    background: #00d2d3; color: #000; font-weight: 600;
}
.vtts-btn-cyan:hover { background: #00f0f1; }

.vtts-save-bar {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 12px 0 4px; border-top: 1px solid rgba(255,255,255,0.06);
    margin-top: 12px;
}

/* ── 卡片 ── */
.vtts-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; padding: 14px; margin-bottom: 12px;
}
.vtts-card-title {
    font-size: 13px; color: #00d2d3; font-weight: 600;
    margin-bottom: 12px; letter-spacing: .5px;
}
.vtts-card-subtitle {
    font-size: 11px; color: #666; margin-top: -8px; margin-bottom: 10px;
}

/* ── 模型庫卡片 ── */
.vtts-model-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px; padding: 12px; margin-bottom: 10px;
}
.vtts-model-card-head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px;
}
.vtts-model-name { font-size: 14px; color: #00d2d3; font-weight: 600; }
.vtts-model-actions { display: flex; gap: 6px; }
.vtts-model-fields { display: grid; gap: 6px; }

/* ── 角色對應 ── */
.vtts-char-row {
    display: flex; gap: 8px; align-items: center;
    padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
}
.vtts-char-name {
    min-width: 90px; font-size: 13px; color: #d4af37; flex-shrink: 0;
}

/* ── NPC 分類 ── */
.vtts-npc-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px; padding: 12px; margin-bottom: 10px;
}
.vtts-npc-head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px;
}
.vtts-npc-label { font-size: 14px; color: #f6ad55; font-weight: 600; }
.vtts-tag-list {
    display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px;
}
.vtts-tag {
    background: rgba(212,175,55,0.12); border: 1px solid rgba(212,175,55,0.3);
    color: #d4af37; padding: 2px 8px; border-radius: 12px; font-size: 11px;
    display: flex; align-items: center; gap: 4px; cursor: default;
}
.vtts-tag-del {
    color: #888; cursor: pointer; font-size: 12px; line-height: 1;
}
.vtts-tag-del:hover { color: #e55; }

/* ── 模型選擇 chips ── */
.vtts-model-chips {
    display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px;
}
.vtts-model-chip {
    background: rgba(0,210,211,0.1); border: 1px solid rgba(0,210,211,0.3);
    color: #00d2d3; padding: 2px 8px; border-radius: 12px; font-size: 11px;
    display: flex; align-items: center; gap: 4px;
}
.vtts-model-chip-del { color: #888; cursor: pointer; }
.vtts-model-chip-del:hover { color: #e55; }

/* ── 空白提示 ── */
.vtts-empty {
    text-align: center; color: #555; padding: 30px 0; font-size: 13px;
}

/* ── 狀態提示 ── */
.vtts-toast {
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #d4af37; color: #000; padding: 8px 18px; border-radius: 20px;
    font-size: 12px; font-weight: 600; opacity: 0; pointer-events: none;
    transition: opacity .3s; z-index: 100;
}
.vtts-toast.show { opacity: 1; }
`;

// ── HTML 模板 ────────────────────────────────────────────────────────────────
function buildPanelHTML() {
    return `
<div id="vn-tts-overlay" class="hidden">
  <div class="vtts-header">
    <h2>🎙 語音配置</h2>
    <button class="vtts-close" onclick="VN_TTS_Panel.close()">✕</button>
  </div>

  <div class="vtts-tabs">
    <button class="vtts-tab active" data-tab="basic"   onclick="VN_TTS_Panel.switchTab('basic')">基礎配置</button>
    <button class="vtts-tab"        data-tab="models"  onclick="VN_TTS_Panel.switchTab('models')">模型庫</button>
    <button class="vtts-tab"        data-tab="chars"   onclick="VN_TTS_Panel.switchTab('chars')">角色對應</button>
    <button class="vtts-tab"        data-tab="npc"     onclick="VN_TTS_Panel.switchTab('npc')">NPC 配音</button>
  </div>

  <div class="vtts-body" id="vtts-body"></div>
  <div class="vtts-toast" id="vtts-toast"></div>
</div>`;
}

// ── 各分頁內容 ───────────────────────────────────────────────────────────────

function renderBasic(cfg) {
    return `
<div class="vtts-card">
  <div class="vtts-card-title">🔌 系統狀態</div>
  <div class="vtts-switch-row">
    <span class="vtts-switch-label">啟用 TTS 語音</span>
    <label class="vtts-toggle-wrap">
      <input type="checkbox" id="vtts-enabled" ${cfg.enabled ? 'checked' : ''}>
      <span class="vtts-toggle-slider"></span>
    </label>
  </div>
</div>

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
      <span style="color:#555;font-weight:normal;margin-left:6px;">（V3 / V4 專屬，V1/V2 忽略）</span>
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

function renderModels(cfg) {
    const ids = Object.keys(cfg.models);
    const cards = ids.length ? ids.map(id => renderModelCard(id, cfg.models[id])).join('') :
        `<div class="vtts-empty">尚無模型，點擊下方按鈕新增</div>`;
    return `
<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
  <button class="vtts-btn vtts-btn-cyan" onclick="VN_TTS_Panel.addModel()">＋ 新增模型</button>
  <button class="vtts-btn vtts-btn-primary" onclick="VN_TTS_Panel.loadLocalConfig()" title="執行 scan_models.py 後點此，從 models/tts_models.json 批次匯入所有模型">📥 載入配置</button>
  <button class="vtts-btn vtts-btn-danger" onclick="VN_TTS_Panel.deleteAllModels()">🗑 一鍵清空</button>
</div>
<div style="font-size:11px;color:#555;margin-bottom:10px;">💡 有多個模型？先執行擴展目錄裡的 <code style="color:#888">scan_models.bat</code>，再點「載入配置」一次匯入全部。</div>
${cards}`;
}

function renderModelCard(id, m) {
    return `
<div class="vtts-model-card" id="vtts-mc-${esc(id)}">
  <div class="vtts-model-card-head">
    <span class="vtts-model-name">🔹 ${esc(m.name || id)}</span>
    <div class="vtts-model-actions">
      <button class="vtts-btn vtts-btn-ghost" onclick="VN_TTS_Panel.editModel('${escJs(id)}')">編輯</button>
      <button class="vtts-btn vtts-btn-danger" onclick="VN_TTS_Panel.deleteModel('${escJs(id)}')">刪除</button>
    </div>
  </div>
  <div style="font-size:11px;color:#666;line-height:1.8;">
    <div>GPT: ${esc(m.gptPath||'（未設定）')}</div>
    <div>SoVITS: ${esc(m.sovitsPath||'（未設定）')}</div>
    
    <div style="display:flex; align-items:center; gap: 8px;">
      預設音頻: ${esc(m.refAudioPath||'（未設定）')}
      ${m.refAudioPath ? `<button class="vtts-btn vtts-btn-ghost" style="padding: 2px 8px; font-size: 10px; border-color: rgba(212,175,55,0.4);" onclick="VN_TTS_Panel.playRefAudio('${escJs(m.refAudioPath)}')">▶ 試聽</button>` : ''}
    </div>
    
    <div>預設文字: ${esc(m.refText||'')}</div>
    <div style="color:#d4af37; margin-top: 4px;">自訂情緒數量: ${Object.keys(m.emotions || {}).length} 組</div>
  </div>
</div>`;
}

function renderEmotionBlock(emoKey, emData) {
    emoKey = emoKey || '';
    emData = emData || {};
    return `
    <div class="vtts-emo-block" style="border-left: 2px solid rgba(212,175,55,0.4); padding-left: 10px; margin-bottom: 12px; background: rgba(0,0,0,0.2); padding: 8px;">
      <div class="vtts-row" style="margin-bottom: 8px;">
        <span style="font-size: 12px; color: #f6ad55; white-space: nowrap;">🎭 觸發標籤：</span>
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
  
  <div style="margin-top:20px; margin-bottom:8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
    <span style="font-size: 13px; color: #00d2d3; font-weight: 600;">🔈 預設參考音頻（必填）</span>
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

  <div style="margin-top:24px; margin-bottom:12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-end;">
    <div>
        <span style="font-size: 13px; color: #00d2d3; font-weight: 600;">✨ 自訂多情緒語音（選填）</span>
        <div style="font-size: 11px; color: #888; margin-top: 4px;">當腳本表情與「觸發標籤」一致時自動替換。<br>留空或無匹配時將使用上方預設音頻。</div>
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

function renderChars(cfg) {
    const modelOptions = Object.entries(cfg.models)
        .map(([id, m]) => `<option value="${esc(id)}">${esc(m.name || id)}</option>`)
        .join('');

    const rows = Object.entries(cfg.charMappings).map(([char, mid]) => `
<div class="vtts-char-row" id="vtts-cr-${esc(char)}">
  <span class="vtts-char-name">${esc(char)}</span>
  <select class="vtts-input" id="vtts-cs-${esc(char)}" onchange="VN_TTS_Panel.updateCharMapping('${escJs(char)}',this.value)">
    <option value="">（未綁定）</option>
    ${Object.entries(cfg.models).map(([id,m]) =>
        `<option value="${esc(id)}" ${mid===id?'selected':''}>${esc(m.name||id)}</option>`
    ).join('')}
  </select>
  <button class="vtts-btn vtts-btn-danger" onclick="VN_TTS_Panel.deleteCharMapping('${escJs(char)}')">✕</button>
</div>`).join('');

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
</div>`;
}

function renderNpc(cfg) {
    const cats = cfg.npcCategories;
    const cards = cats.length ? cats.map(cat => renderNpcCard(cat, cfg.models)).join('') :
        `<div class="vtts-empty">尚無 NPC 分類，點擊下方按鈕新增</div>`;

    return `
${cards}
<div style="text-align:center;margin-top:8px;">
  <button class="vtts-btn vtts-btn-cyan" onclick="VN_TTS_Panel.addNpcCategory()">＋ 新增分類</button>
</div>`;
}

function renderNpcCard(cat, models) {
    const tags = (cat.tags || []).map(t => `
<span class="vtts-tag">${esc(t)}
  <span class="vtts-tag-del" onclick="VN_TTS_Panel.removeNpcTag('${escJs(cat.id)}','${escJs(t)}')">✕</span>
</span>`).join('');

    const chips = (cat.modelIds || []).map(mid => {
        const m = models[mid];
        return `<span class="vtts-model-chip">${esc(m ? m.name||mid : mid)}
  <span class="vtts-model-chip-del" onclick="VN_TTS_Panel.removeNpcModel('${escJs(cat.id)}','${escJs(mid)}')">✕</span>
</span>`;
    }).join('');

    const modelOpts = Object.entries(models)
        .map(([id, m]) => `<option value="${esc(id)}">${esc(m.name||id)}</option>`)
        .join('');

    return `
<div class="vtts-npc-card" id="vtts-npc-${esc(cat.id)}">
  <div class="vtts-npc-head">
    <span class="vtts-npc-label">🗂 ${esc(cat.name)}</span>
    <button class="vtts-btn vtts-btn-danger" onclick="VN_TTS_Panel.deleteNpcCategory('${escJs(cat.id)}')">刪除分類</button>
  </div>

  <div style="margin-bottom:10px;">
    <div class="vtts-label">模糊匹配別名（角色名稱含有以下標籤時隨機套用此分類）</div>
    <div class="vtts-tag-list" id="vtts-tags-${esc(cat.id)}">${tags || '<span style="color:#555;font-size:11px">尚無標籤</span>'}</div>
    <div class="vtts-row" style="margin-top:7px;">
      <input class="vtts-input" id="vtts-tag-input-${esc(cat.id)}" type="text" placeholder="新標籤（如：大嬸、長髮女孩）"
             onkeydown="if(event.key==='Enter')VN_TTS_Panel.addNpcTag('${escJs(cat.id)}')">
      <button class="vtts-btn vtts-btn-ghost" onclick="VN_TTS_Panel.addNpcTag('${escJs(cat.id)}')">新增</button>
    </div>
  </div>

  <div>
      <div class="vtts-label">套用模型（隨機抽選其中一個）</div>
      <div class="vtts-model-chips" id="vtts-chips-${esc(cat.id)}">${chips || '<span style="color:#555;font-size:11px">尚未指定模型</span>'}</div>
      <div class="vtts-row" style="margin-top:7px;">
        <select class="vtts-input" id="vtts-chip-sel-${esc(cat.id)}" onchange="VN_TTS_Panel.playNpcSelectedModel('${escJs(cat.id)}')">
          <option value="">選擇模型</option>
          ${modelOpts}
        </select>
        
        <button class="vtts-btn vtts-btn-ghost" style="padding: 6px 10px; border-color: rgba(212,175,55,0.4);" onclick="VN_TTS_Panel.playNpcSelectedModel('${escJs(cat.id)}')">▶ 重播</button>
        <button class="vtts-btn vtts-btn-ghost" onclick="VN_TTS_Panel.addNpcModel('${escJs(cat.id)}')">新增</button>
      </div>
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
    _currentTab:    'basic',
    _modelFormMode: null,   
    _npcFormMode:   false,
    _bodyId:        'vtts-body',   
    _toastId:       'vtts-toast',  
    _refPlayer: null, // 用來裝載試聽聲音的容器
    _savedListScroll: 0, // 👈 新增這行，用來記住高度

    initInline(containerId) {
        const root = document.getElementById(containerId);
        if (!root) return;
        this._bodyId  = 'vtts-inline-body';
        this._toastId = 'vtts-inline-toast';
        root.innerHTML = `
<div style="position:relative;">
  <div class="vtts-tabs" style="margin:0 -4px 12px;border-bottom:1px solid rgba(255,255,255,0.08);">
    <button class="vtts-tab ${this._currentTab==='basic'  ?'active':''}" data-tab="basic"   onclick="VN_TTS_Panel.switchTab('basic')">基礎配置</button>
    <button class="vtts-tab ${this._currentTab==='models' ?'active':''}" data-tab="models"  onclick="VN_TTS_Panel.switchTab('models')">模型庫</button>
    <button class="vtts-tab ${this._currentTab==='chars'  ?'active':''}" data-tab="chars"   onclick="VN_TTS_Panel.switchTab('chars')">角色對應</button>
    <button class="vtts-tab ${this._currentTab==='npc'    ?'active':''}" data-tab="npc"     onclick="VN_TTS_Panel.switchTab('npc')">NPC 配音</button>
  </div>
  <div id="vtts-inline-body"></div>
  <div class="vtts-toast" id="vtts-inline-toast"></div>
</div>`;
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
        document.querySelectorAll('.vtts-tab').forEach(t =>
            t.classList.toggle('active', t.dataset.tab === tab)
        );
        this._renderBody(tab);
    },

    _renderBody(tab) {
        const body = document.getElementById(this._bodyId);
        if (!body) return;
        const cfg = this._cfg();
        if (tab === 'basic')  body.innerHTML = renderBasic(cfg);
        if (tab === 'models') {
            if (this._modelFormMode === 'add') body.innerHTML = renderModelForm(null, null);
            else if (this._modelFormMode)      body.innerHTML = renderModelForm(this._modelFormMode, cfg.models[this._modelFormMode]);
            else                               body.innerHTML = renderModels(cfg);
        }
        if (tab === 'chars')  body.innerHTML = renderChars(cfg);
        if (tab === 'npc') {
            if (this._npcFormMode) body.innerHTML = renderNpcForm();
            else                   body.innerHTML = renderNpc(cfg);
        }
    },

    addEmotionSlot() {
        const container = document.getElementById('vtts-mf-emotions-container');
        if (container) {
            container.insertAdjacentHTML('beforeend', renderEmotionBlock('', {}));
        }
    },

    // ── 儲存配置，新增了動態抓取四大參數的邏輯 ────────────────────────────
    saveBasic() {
        const tts = this._tts();
        if (!tts) return;
        tts.config.enabled     = document.getElementById('vtts-enabled').checked;
        tts.config.serverUrl   = document.getElementById('vtts-server').value.trim();
        tts.config.stRoot      = document.getElementById('vtts-st-root').value.trim(); // 🌟 補上這行，讓系統記住根目錄！
        tts.config.textLang    = document.getElementById('vtts-lang').value;
        
        // 儲存新的情緒靈魂參數
        tts.config.speed       = parseFloat(document.getElementById('vtts-spd').value);
        tts.config.topK        = parseInt(document.getElementById('vtts-topk').value, 10);
        tts.config.topP        = parseFloat(document.getElementById('vtts-topp').value);
        tts.config.temperature  = parseFloat(document.getElementById('vtts-temp').value);
        tts.config.sampleSteps  = parseInt(document.getElementById('vtts-steps').value, 10);

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
        const EXT_REL  = 'public\\scripts\\extensions\\third-party\\my-tavern-extension\\models';
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
        const url = '/scripts/extensions/third-party/my-tavern-extension/models/tts_models.json';
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

        let newCount = 0, skipCount = 0;

        // 合併 models（不覆蓋已有的，讓使用者手動刪除再匯入才更新）
        for (const [id, model] of Object.entries(data.models)) {
            if (tts.config.models[id]) { skipCount++; continue; }
            tts.config.models[id] = model;
            newCount++;
        }

        // 合併 charMappings（同樣不覆蓋）
        for (const [char, mid] of Object.entries(data.charMappings || {})) {
            if (!tts.config.charMappings[char]) tts.config.charMappings[char] = mid;
        }

        // 合併 npcCategories（以 id 去重）
        const existingIds = new Set((tts.config.npcCategories || []).map(c => c.id));
        for (const cat of (data.npcCategories || [])) {
            if (!existingIds.has(cat.id)) tts.config.npcCategories.push(cat);
        }

        tts.save();
        this._modelFormMode = null;
        this._renderBody('models');

        if (newCount === 0 && skipCount === 0) {
            this._toast('⚠️ 配置檔內無模型資料');
        } else if (newCount === 0) {
            this._toast(`✓ 全部 ${skipCount} 個模型已存在，無新增`);
        } else {
            this._toast(`✓ 已匯入 ${newCount} 個模型（跳過 ${skipCount} 個已存在的）`, 3000);
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
        tts.save();
        this._renderBody('chars');
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

    addNpcModel(catId) {
        const tts = this._tts();
        if (!tts) return;
        const sel = document.getElementById(`vtts-chip-sel-${catId}`);
        const mid = sel?.value;
        if (!mid) { this._toast('✗ 請選擇模型'); return; }
        const cat = tts.config.npcCategories.find(c => c.id === catId);
        if (!cat) return;
        if (!cat.modelIds.includes(mid)) { cat.modelIds.push(mid); tts.save(); }
        this._renderBody('npc');
    },

    removeNpcModel(catId, modelId) {
        const tts = this._tts();
        if (!tts) return;
        const cat = tts.config.npcCategories.find(c => c.id === catId);
        if (!cat) return;
        cat.modelIds = cat.modelIds.filter(m => m !== modelId);
        tts.save();
        this._renderBody('npc');
    },
};

// ── 注入 CSS ─────────────────────────────────────────────────────────────────
const styleEl = document.createElement('style');
styleEl.textContent = PANEL_CSS;
document.head.appendChild(styleEl);

// ── 掛到 window ───────────────────────────────────────────────────────────────
window.VN_TTS_Panel = VN_TTS_Panel;
console.log('[VN_TTS_Panel] 已載入');

})();