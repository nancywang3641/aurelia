# 創作室吃下「AI 生成應用」· 融合面板 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把商店「AI 生成應用」入口導向創作室；給創作室的 VN UI 模板執行環境加上 `callAI` 文字生成接口 + prompt 授權，讓同一塊面板能「讀正文顯示 ＋ 觸發 API 生成」；產物進展廳，手機掛載 opt-in。

**Architecture:** 不新增 pipeline。沿用創作室既有「對話式生成 `<json>{tagId,html,css,js…}</json>` → 預覽 → saveVNTagTemplate(isActive) → 展廳 → VN 系統直讀」全鏈。核心改動＝在每個建 `st` 物件的執行環境加 `callAI` 方法（生圖 `setImage` 已現成），並改 vn_ui 生成 prompt 告訴 AI 可調用。手機掛載＝把 template 包成 iframe app 存 `phone_apps`（opt-in）。

**Tech Stack:** 純前端 JS（IIFE 模組、IndexedDB via OS_DB、`new Function` 模板執行、iframe srcdoc 橋接）。無自動測試框架 → 每個任務以**手動驗證**收尾（在 PWA/酒館實跑、看 console、看面板行為）。

---

## ⚠️ 實作前必讀：三個已確認的架構約束

1. **酒館正文 inline 是純展示**：`vn_core._showDomBlock`（vn_core.js:629-796）只渲染 template 的 HTML/CSS、**不跑 js**。所以「按鈕 call API」這種互動只在 **PWA 劇情（vn_dynamic_parser）＋創作室預覽＋手機 iframe** 有效；酒館正文 inline 的融合面板退化為純展示。→ 互動型面板主打 PWA。（可選 Task 8 補酒館。）
2. **副模型未接線**：現有 app `callAI`（app_runtime.js:37-50）用當前設定模型、不切 profile。本計畫 v1 的 `st.callAI` 比照辦理（當前模型）。副模型 transient 切換列為**可選 Task 7**。
3. **兩套執行契約並存**：模板走 `new Function(container, lines, onComplete, st, js)`；iframe app 走全域 `callAI/genImg`。手機掛載需 adapter 把模板包成 iframe（Task 6）。

---

## 檔案結構

| 檔案 | 動作 | 責任 |
|---|---|---|
| `os_phone/os/os_studio.js` | 改 | `_buildPreviewSt` 加 `callAI`；vn_ui 生成 prompt + st 能力說明加 `callAI`；展廳卡片加「裝手機」開關 + caps 自動標 |
| `os_phone/vn_story/vn_dynamic_parser.js` | 改 | PWA inline 的 st（:90-130）加 `callAI`（與 `_buildPreviewSt` 同步） |
| `os_phone/os/app_store.js` | 改 | 首頁「AI 生成應用」入口改開創作室；退役一次性工坊 |
| `os_phone/os/os_db.js` | 改 | `saveVNTagTemplate` 結構容納 `caps`；（手機掛載）沿用 `phone_apps` CRUD |
| `index.js` / `index.html` | 改 | 確認 OS_STUDIO 在商店點擊時可用；清理退役工坊的載入線 |

**共用契約（鎖死，後續任務都依此）**
- `st.callAI(systemPrompt: string) → Promise<string>`：預覽態（`window.__IS_PREVIEW===true`）回固定示範字串、不燒額度；正式態走 `OS_API.chat`。
- 展廳記錄新增欄位 `caps: 'display' | 'gen' | 'both'`（生成時自動判定；純顯示用，不影響既有讀取）。

---

## Task 1：給創作室預覽的 `st` 加 `callAI`

**Files:**
- Modify: `os_phone/os/os_studio.js:1560-1600`（`_buildPreviewSt`）

- [ ] **Step 1：在 `_buildPreviewSt` 回傳物件裡加 `callAI` 方法**

在 `os_studio.js` `_buildPreviewSt` 回傳的物件中（`setImage` 之後、`}` 之前）加入：

```javascript
            ,
            async callAI(systemPrompt) {
                // 預覽不燒額度：給固定示範字串
                if (window.__IS_PREVIEW) {
                    return '（預覽模式示範回覆）這是 AI 生成的內容會出現的位置。';
                }
                try {
                    const OS = window.OS_API || (window.parent && window.parent.OS_API);
                    if (!OS || !OS.chat) throw new Error('OS_API 不可用');
                    const S = window.OS_SETTINGS || (window.parent && window.parent.OS_SETTINGS);
                    let cfg = (S && S.getConfig && S.getConfig()) || {};
                    cfg = Object.assign({}, cfg, { usePresetPrompts: false, enableThinking: false });
                    return await new Promise((res, rej) => {
                        OS.chat([{ role: 'system', content: String(systemPrompt || '') }], cfg, null,
                            t => res(typeof t === 'string' ? t : (t && t.message) || ''), rej,
                            { disableTyping: true });
                    });
                } catch (e) { console.error('[st.callAI]', e); return ''; }
            }
```

- [ ] **Step 2：手動驗證（創作室預覽）**

在 PWA 開創作室 → 隨便生成一個 vn_ui 面板 → 在預覽框打開 devtools console，手動執行（或在生成的 js 裡臨時加一行）`st.callAI('測試')`。
Expected：預覽態回「（預覽模式示範回覆）…」字串，不發真實 API 請求（network 無新請求）。

- [ ] **Step 3：Commit**

```bash
git add os_phone/os/os_studio.js
git commit -m "feat(studio): 預覽 st 加 callAI 接口（預覽態走示範字串不燒額度）"
```

---

## Task 2：給 PWA 劇情 inline 的 `st` 加 `callAI`（與預覽同步）

**Files:**
- Modify: `os_phone/vn_story/vn_dynamic_parser.js:90-130`（st 建構處）

- [ ] **Step 1：在 vn_dynamic_parser 的 st 物件加同款 `callAI`**

`vn_dynamic_parser.js` 的 st 目前有 `md/parse/setImage`（:90-130）。在 `setImage` 後加入**與 Task 1 完全相同簽名**的 `callAI`（正式播放態 `__IS_PREVIEW` 非 true → 走真實 `OS_API.chat`）：

```javascript
            ,
            async callAI(systemPrompt) {
                if (window.__IS_PREVIEW) return '（預覽模式示範回覆）';
                try {
                    const OS = window.OS_API || (window.parent && window.parent.OS_API);
                    if (!OS || !OS.chat) throw new Error('OS_API 不可用');
                    const S = window.OS_SETTINGS || (window.parent && window.parent.OS_SETTINGS);
                    let cfg = (S && S.getConfig && S.getConfig()) || {};
                    cfg = Object.assign({}, cfg, { usePresetPrompts: false, enableThinking: false });
                    return await new Promise((res, rej) => {
                        OS.chat([{ role: 'system', content: String(systemPrompt || '') }], cfg, null,
                            t => res(typeof t === 'string' ? t : (t && t.message) || ''), rej,
                            { disableTyping: true });
                    });
                } catch (e) { console.error('[vn st.callAI]', e); return ''; }
            }
```

- [ ] **Step 2：手動驗證（PWA 劇情）**

在展廳手動建一個帶 `<button id="g">生成</button>` 且 js 內 `root.querySelector` 綁定點擊 `const r = await st.callAI('寫一句話'); container...textContent = r;` 的 template，設 isActive → 在 PWA 劇情觸發該 tag → 點按鈕。
Expected：overlay 內按鈕點下去能拿到真實 AI 回覆並顯示；console 無 `st.callAI is not a function`。

- [ ] **Step 3：Commit**

```bash
git add os_phone/vn_story/vn_dynamic_parser.js
git commit -m "feat(vn): PWA 劇情 inline st 加 callAI，與預覽同步"
```

---

## Task 3：vn_ui 生成 prompt 告訴 AI「面板可 call API 生成」

**Files:**
- Modify: `os_phone/os/os_studio.js:331`（st 能力說明）與 `:111-363`（Eddie 生成 prompt 的能力/輸出規範段）

- [ ] **Step 1：擴充 st 能力清單**

在 `os_studio.js:331` 那段「你的 JS 腳本會被 `new Function('container','lines','onComplete','st', tpl.js)` 包裝執行。可用變數：」之後的 st 能力列表，補上 `callAI`：

```
- st.callAI(systemPrompt) → Promise<string>：呼叫 AI 生成「文字」並回傳純文字。systemPrompt 寫清楚你要的內容與輸出格式即可（它會自動帶上角色卡/最近劇情/角色世界書當背景，不必重述設定）。用於「按鈕觸發即時生成新內容」這類功能。每次 await 包 try/catch、生成中顯示 loading。
- st.setImage(imgEl, prompt, type) → 既有：生圖塞進 <img>（預覽自動佔位、不燒額度）。
```

- [ ] **Step 2：在生成規範段加入「面板可以是功能型」的授權**

在 Eddie prompt 的設計理念/輸出規範段（`:111-363` 內，緊接輸出格式 `<json>` 說明之前）插入一段（**禁寫具體主題/名詞範例，只給結構**）：

```
【面板能力（重要）】你做的面板不限於「展示劇情已寫好的內容」。它也可以是「功能型」：在 js 裡用 st.callAI(systemPrompt) 主動向 AI 要新內容、用 st.setImage 生圖，把結果 render 進 container。例如面板上放一顆按鈕，點下去呼叫 st.callAI 生成一段內容再顯示——這完全允許且鼓勵。請依使用者需求判斷這塊面板是「純展示 / 純功能 / 兩者兼具」，自由運用 lines（劇情已寫的資料）與 st.callAI（即時生成）兩種來源。
```

- [ ] **Step 3：手動驗證（生成）**

開創作室 vn_ui mode → 描述「一個有按鈕、點了會生成一句話顯示出來的小面板」→ 送出。
Expected：AI 回的 `<json>` 裡 `js` 含 `st.callAI(` 呼叫、`html` 有按鈕；預覽點按鈕走示範字串。

- [ ] **Step 4：Commit**

```bash
git add os_phone/os/os_studio.js
git commit -m "feat(studio): vn_ui 生成 prompt 授權面板用 st.callAI 即時生成（含 st 能力說明）"
```

---

## Task 4：caps 自動標（展示/生成/兩者）

**Files:**
- Modify: `os_phone/os/os_studio.js:364-376`（vn_ui mode `onSave`）

- [ ] **Step 1：onSave 存檔前自動判定 caps**

在 `os_studio.js` vn_ui mode `onSave` 內、`await win.OS_DB.saveVNTagTemplate(data)` 之前插入：

```javascript
            // caps 自動標：看 js 有沒有用 st.callAI / st.setImage（=能生成），有沒有用 lines / container 顯示（=能展示）
            (function(){
                var js = String(data.js || '');
                var canGen = /st\.callAI\s*\(|st\.setImage\s*\(/.test(js);
                var canShow = /\blines\b/.test(js) || /container/.test(js);
                data.caps = canGen && canShow ? 'both' : (canGen ? 'gen' : 'display');
            })();
```

- [ ] **Step 2：手動驗證**

生成一個「純展示」面板存檔 → 看 IndexedDB（devtools → Application → IndexedDB → ui_templates）該筆 `caps` 應為 `display`；生成一個有按鈕 callAI 的 → `caps` 應為 `gen` 或 `both`。

- [ ] **Step 3：Commit**

```bash
git add os_phone/os/os_studio.js
git commit -m "feat(studio): 存檔自動標 caps(display/gen/both)"
```

---

## Task 5：商店「AI 生成應用」入口改開創作室

**Files:**
- Modify: `os_phone/os/app_store.js:59`（首頁卡片）、`:114-138`（launch/`_go`）

- [ ] **Step 1：把首頁「AI 生成應用」卡片改成開創作室**

`app_store.js:59` 的卡片目前 `data-go="workshop"`。改為一個會開創作室的 action。最小改動：保留卡片、把它的點擊行為改成呼叫 `OS_STUDIO.launch`。在 `app_store.js` `launch(c)` 內綁定 `data-go` 的迴圈（:122-124）後，加一段攔截：

```javascript
        // 「AI 生成應用」→ 改開創作室（取代一次性工坊）
        var aiCard = c.querySelector('.ws-card-ai');
        if (aiCard) {
            aiCard.setAttribute('data-go', '');               // 解除舊路由
            aiCard.addEventListener('click', function (e) {
                e.stopPropagation();
                var host = c.closest('#aps-app-body') || c.parentNode || document.body;
                if (win.OS_STUDIO && win.OS_STUDIO.launch) win.OS_STUDIO.launch(host);
                else _toast(c, '❌ 創作室未載入');
            });
        }
```

> 註：`OS_STUDIO.launch(container)`（os_studio.js:428-442）會把創作室渲染進 container 並預設進 vn_ui mode。host 取手機殼當前 app body。

- [ ] **Step 2：手動驗證**

手機開應用商店 → 點「AI 生成應用」→ 應開出創作室（🎨 標題、可對話），不再是舊的一次性工坊輸入框。

- [ ] **Step 3：Commit**

```bash
git add os_phone/os/app_store.js
git commit -m "feat(store): 「AI 生成應用」入口改開創作室"
```

- [ ] **Step 4：退役一次性工坊（清舊路徑）**

確認沒有其他地方依賴 `workshop` view 後，移除 `app_store.js` 一次性工坊相關死碼：`_bindWorkshop`(:308-359)、`_wsPrompt`(:263-283)、`_parseGen`(:299-306)、`_assembleApp`(:286-297)、`launch` 內 `_bindWorkshop(c)` 呼叫、HTML 裡 `data-view="workshop"` 整段（:64-78）。`_install`/匯入/我的應用**保留**（手機掛載 Task 6 要用）。

```bash
git add os_phone/os/app_store.js
git commit -m "chore(store): 退役一次性工坊死碼（入口已導向創作室）"
```

---

## Task 6（opt-in 手機掛載）：展廳卡片加「裝手機」開關

**Files:**
- Modify: `os_phone/os/os_studio.js:1920-2080`（`loadStudioGallery` 卡片）
- Reuse: `os_db.savePhoneApp/deletePhoneApp`（os_db.js:1063/1096）、`VoidPhoneShell.addApp/removeApp`（phone_shell.js:255/260）、`mountAppIframe`（app_runtime.js:59）

- [ ] **Step 1：template → iframe app HTML 的 adapter**

在 `os_studio.js` 加一個把模板包成 iframe-app 完整 HTML 的函數（讓模板 js 在 iframe 內也拿到 `container/lines/onComplete/st`，st 走橋接）。放在 `_buildPreviewSt` 附近：

```javascript
    // 把展廳模板包成可在手機 iframe 跑的完整 HTML（lines 給空，靠 st.callAI 生成）
    function _templateToPhoneHtml(tpl) {
        var css = String(tpl.css || '');
        var html = String(tpl.html || '');
        var js = String(tpl.js || '');
        return '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8">'
            + '<style>html,body{margin:0;padding:0;height:100%;}#app-root{box-sizing:border-box;width:100%;min-height:100%;}'
            + css + '</style></head><body><div id="app-root">' + html + '</div>'
            + '<scr' + 'ipt>(function(){var container=document.getElementById("app-root");var lines=[];'
            + 'var st={md:function(t){return t||"";},parse:function(){return {};},'
            + 'setImage:async function(el,p,type){try{if(el&&window.genImg){el.src=await window.genImg(p,type||"scene");}}catch(e){}},'
            + 'callAI:async function(s){try{return window.callAI?await window.callAI(s):"";}catch(e){return "";}}};'
            + 'var onComplete=function(){if(window.goBack)window.goBack();};'
            + '(async function(){try{' + js + '}catch(e){console.error("[phone tpl]",e);}})();'
            + '})();</scr' + 'ipt></body></html>';
    }
```

> 橋接的 `window.callAI/genImg/goBack` 由 `mountAppIframe`(_bridgeScript, app_runtime.js:12-55) 注入。st 在 iframe 內轉接到這些全域。

- [ ] **Step 2：展廳卡片加「裝手機 / 移除」開關（預設未裝）**

在 `loadStudioGallery` 每張卡片（:1936-2062）的按鈕列，加一顆 toggle。狀態以「該 tpl 是否已有對應 phone_app」判斷（用 `phone_apps` 裡 `srcTplId===tpl.id` 比對）：

```javascript
        // 裝手機開關（opt-in、預設未裝）
        var apps = (win.OS_DB.getAllPhoneApps ? await win.OS_DB.getAllPhoneApps() : []) || [];
        var phoneRec = apps.find(function(a){ return a.srcTplId === tpl.id; });
        var phoneBtn = document.createElement('div');
        phoneBtn.className = 'sgc-btn btn-phone';
        phoneBtn.textContent = phoneRec ? '📱 已裝手機' : '📱 裝到手機';
        phoneBtn.onclick = async function(){
            if (phoneRec) {
                await win.OS_DB.deletePhoneApp(phoneRec.id);
                if (win.VoidPhoneShell && win.VoidPhoneShell.removeApp) win.VoidPhoneShell.removeApp(phoneRec.id);
            } else {
                var id = await win.OS_DB.savePhoneApp({
                    name: tpl.tagId || '面板', emoji: '🧩', iconUrl: '',
                    html: _templateToPhoneHtml(tpl), source: 'studio', srcTplId: tpl.id
                });
                if (win.VoidPhoneShell && win.VoidPhoneShell.addApp) win.VoidPhoneShell.addApp({ id: id, name: tpl.tagId || '面板', emoji: '🧩', iconUrl: '' });
            }
            loadStudioGallery();
        };
        // append 進該卡片按鈕列容器
```

- [ ] **Step 3：手動驗證**

展廳一個融合面板 → 點「裝到手機」→ 手機桌面長出 🧩 圖標 → 點開，iframe 內按鈕 call API 能生成。再點「已裝手機」→ 圖標消失。純展示面板**不主動裝**（保持未勾）。

- [ ] **Step 4：Commit**

```bash
git add os_phone/os/os_studio.js
git commit -m "feat(studio): 展廳卡片加 opt-in 裝手機開關（template→iframe app）"
```

---

## Task 7（可選）：`callAI` 改走副模型 transient 切換

**Files:**
- Modify: `os_phone/os/os_studio.js`（Task 1 的 callAI）、`os_phone/vn_story/vn_dynamic_parser.js`（Task 2 的 callAI）

- [ ] **Step 1：定位現有副模型切換 API**

搜尋專案內副模型/profile 切換既有實作（記憶指向 `state_runtime.extractOnce` 走副模型）：

Run: `grep -rn "extractOnce\|secondaryProfile\|副模型\|switchProfile" os_phone/ core/`
找到「snapshot → switch → call → finally restore」的既有 helper。

- [ ] **Step 2：把 callAI 的 `OS.chat` 包進副模型切換**

依找到的 API，在兩處 callAI 的 `OS.chat` 呼叫外包一層 transient 切換（fire-and-forget restore），不假設方向、finally 切回呼叫前狀態。（實作碼依 Step 1 結果填入。）

- [ ] **Step 3：手動驗證**：生成時確認用的是副模型設定，呼叫結束後主設定/profile 已切回。

- [ ] **Step 4：Commit** `feat: callAI 走副模型 transient 切換`

---

## Task 8（可選）：酒館正文 inline 也能跑融合面板 js

**Files:**
- Modify: `os_phone/vn_story/vn_core.js:629-796`（`_showDomBlock`）

- [ ] **Step 1：在 overlay 渲染後執行 template js**

目前 `_showDomBlock` 只塞 HTML/CSS。若要酒館正文也支援互動融合面板，需在 overlay body 注入後，依命中的 template 取其 `js`，以 `new Function('container','lines','onComplete','st', js)` 在 overlay body 上執行（st 同 Task 1/2）。**注意**：酒館端 lines 來源與 PWA 不同，需從 `_block` 解析；此任務牽動播放契約，獨立評估後再做。

- [ ] **Step 2：手動驗證**：酒館正文觸發融合面板 → 按鈕 call API 能動。

- [ ] **Step 3：Commit** `feat(vn): 酒館正文 inline 支援融合面板 js 執行`

---

## Self-Review

**Spec 覆蓋**
- 入口改創作室 → Task 5 ✅
- 創作室加 API 接口（prompt + st.callAI）→ Task 1/2/3 ✅
- 產物進展廳（沿用既有 saveVNTagTemplate 鏈）→ 不需新任務（既有）✅
- caps 自動標、不分死類別 → Task 4 ✅
- 手機 opt-in、純展示不進手機 → Task 6（預設未裝，純展示不主動裝）✅
- 掛劇情走展廳直讀、不轉酒館正則 → 既有 isActive 鏈（Task 2 驗證）✅
- 副模型 → Task 7（可選，已據實標記 v1 用當前模型）✅

**Placeholder 掃描**：Task 7 Step 2 / Task 8 Step 1 的實作碼依「定位結果」填入——這兩個是**明確標記的可選任務**且前置 Step 給了確切 grep/評估方法，非核心路徑。核心 Task 1-6 皆有完整可貼程式碼。

**型別一致**：`st.callAI(systemPrompt)→Promise<string>` 三處（預覽/PWA/iframe adapter）簽名一致；`caps` 欄位字串 `'display'|'gen'|'both'` 全程一致；`srcTplId` 在 Task 6 存取一致。

**已知偏離 spec（待 Rae 拍板）**
- 酒館正文 inline 融合面板＝純展示（約束 1）→ 互動主打 PWA。
- 副模型 v1 未切（約束 2）→ Task 7 可選補上。
