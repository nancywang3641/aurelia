# 奧瑞亞 Aurelia ｜ 多功能面板系統

> SillyTavern 第三方擴展 + 獨立 PWA 雙形態
> 版本：4.3.x（精簡版）　／　License：MIT

---

## 這是什麼？

一個跑在 SillyTavern 上的多功能面板擴展，**同一份程式碼可以兩種跑法**：

1. **酒館擴展** — 作為 SillyTavern 第三方擴展掛載（給 PC / VPS 用）
2. **獨立 PWA** — 部署 Netlify 用瀏覽器直接開（給 iOS 等不能跑酒館的裝置用）

兩種模式共用 70% 程式碼，差異只在功能列表（PWA 補了酒館原生插件提供的東西）。

---

## 演進脈絡

```
酒館擴展（原版）
    ↓ iOS 不能跑酒館
獨立 PWA（Netlify 過渡版）
    ↓ 自己接 Minimax API
    ↓ 走 GitHub → Netlify
    ↓ 補回酒館插件的功能（WB / QB）
    ↓
回到酒館（自架伺服器後）
    ↓ 兩個版本並存
```

---

## 功能模組

| 模組 | 酒館版 | PWA版 | 說明 |
|---|:---:|:---:|---|
| 📖 VN 視覺小說 | ✅ | ✅ | 把 AI 對話渲染成視覺小說，含 TTS 播放 |
| 📚 劇情閱讀器 | ✅ | ✅ | 章節長 scroll 閱讀器，可隱藏酒館對話框防卡頓 |
| 🛡️ RPG 狀態 | ✅ | ✅ | 角色狀態 / 屬性 / 頭像管理 |
| 💬 微信 (WX) | ✅ | ✅ | 偽微信對話介面 |
| 📱 微博 (WB) | ❌ | ✅ | 偽微博介面（PWA 限定） |
| 📚 QQ閱讀 (QB) | ❌ | ✅ | 偽小說閱讀介面（PWA 限定） |
| 🔮 賽博塔羅 | ✅ | ✅ | 抽塔羅小工具 |
| 🗺️ 動態世界地圖 | ✅ | 部分 | 多世界 + 角色排程 + 隨機事件，依當前 chatId 自動切換 |
| 🌐 翻譯 / 🏆 成就 / 💾 備份 / 📗 世界書 | 部分 | ✅ | 輔助系統 |

> **為什麼 WB/QB 只在 PWA 有？**
> 因為酒館本身已經有更強的官方插件做這些事，重複做會打架，所以酒館版直接交給原生插件處理。WB/QB 只在 PWA 上才需要補。

---

## 目錄結構

```
my-tavern-extension/
├── index.js              ← 🔵 酒館擴展入口
├── index.html            ← 🟢 PWA 入口（Netlify）
├── manifest.json         ← 酒館擴展 metadata
├── settings.html         ← 擴展設定頁
├── pwa.json + sw.js      ← PWA manifest + Service Worker
├── aurelia_core.css      ← PWA 樣式
├── aurelia_core_st.css   ← 酒館模式樣式
│
├── core/                 ← 核心模組（兩模式共用）
│   ├── control_center.js     大廳 / 控制中心
│   ├── void_terminal.js      終端介面
│   ├── panel_manager.js      面板管理器
│   ├── tavern_bridge.js      酒館 API 橋接
│   ├── html_extractor.js     HTML 抽取
│   ├── story_extractor.js    故事抽取
│   ├── aurelia_regex_bridge.js
│   ├── vn_dom_bridge.js
│   └── ui_utilities.js / loader_core.js / ...
│
└── os_phone/             ← 主體面板程式
    ├── os/               系統層（DB / persona / 世界書 / API / 備份 / TTS / 翻譯 …）
    ├── vn_story/         VN 視覺小說（兩模式都載）
    ├── rpg/              RPG 狀態（兩模式都載）
    ├── map/              動態世界地圖
    │   ├── map_data.js          奧瑞亞預設世界資料（5 區固定圖庫）
    │   ├── world_runtime.js     世界容器層（chatId / 預覽 / liveStates / patches / 動態地點）
    │   ├── world_generator.js   Stage 1：AI 讀世界書生成 zones+facilities+背景圖
    │   ├── schedule_engine.js   Stage 2：AI 生 24h 角色排程 + 骰子引擎
    │   ├── vn_bridge.js         VN ↔ Map 對接（副模型抽劇情位置 → patch 快照）
    │   └── map_core.js          地圖 UI / 事件系統 / 設施頁 / 設置面板
    ├── wx/               微信（兩模式都載）
    ├── wb/               微博（PWA 限定）
    └── qb/               QQ閱讀（PWA 限定）
```

---

## 🗺️ 動態世界地圖（v5.x）

### 設計

地圖跟著「當前 chatId」走：每張角色卡的每個聊天室都是一個獨立世界，可由 AI 根據世界書動態生成，含區域、設施、背景圖、角色排程。

```
chatId（酒館 SillyTavern.getContext().chatId）
   ↓
worldId（直接綁，每個聊天室一份地圖）
   ↓
查 OS_DB
   ├─ 有 → 載入 zones / facilities / schedules
   └─ 無 → 顯示「INITIALIZE WORLD / USE AUREALIS」二選一
              ↓
          INITIALIZE → AI 兩階段生成
              ├─ Stage 1: 讀世界書 → JSON zones+facilities → pollinations 出設施背景
              └─ Stage 2: 讀 [Character_Profiles] → JSON 24h 排程
```

### 預設世界 vs 動態世界

| | 預設（奧瑞亞）| 動態世界 |
|---|---|---|
| 觸發 | 沒 chatId / 主動選擇 | 有 chatId 且按下初始化 |
| 區數 | 5（A-E）固定 | AI 生 2-3 區 |
| 設施圖 | 固定 GitHub 圖庫 | pollinations 動態生 + LoremFlickr fallback |
| 排程 | 純記憶體（不持久化） | 跟世界一起存 OS_DB |

### 角色排程系統

**七時段定義**（依《視差世界觀》策畫書）：
黎明 05-08 / 上午 08-12 / 下午 12-17 / 黃昏 17-19 / 晚上 19-23 / 午夜 23-02 / 凌晨 02-05

**每個時段最多 3 條分支**，prob (機率) 加總必須等於 100；category 分 Work / Home / Outing；location_id 必須是地圖實際 sceneId（Home 例外，但若地圖有對應住宅設施會自動綁進去）。

**角色來源**（雙層）：
- **常駐**：從 `[Character_Profiles] - <chatId>` 條目 parse 表格抽角色（RPG 系統累積，需先跑劇情）
- **臨時路人**：「探索此地」按鈕走 Hybrid Tag Protocol 即時掃出 NPC

**骰子引擎**：進設施時 → `getCharsAtFacility(zoneId, facKey)` → 遍歷所有角色排程 → `Math.random() * total` 命中分支 → 命中此設施 location_id 的角色渲染為金邊 ⭐ 小人。

### 多世界管理

標題列「🌐」按鈕打開管理面板：
- 列出所有已生成世界（含區/設施/排程數、生成時間）
- ⭐ 標記「當前 chatId 對應」
- 「👁️ 切換顯示」進**預覽模式**（純看，互動全鎖）
- 「🗑️ 刪除」單一世界 / 「🧹 清空所有動態世界」（保留奧瑞亞）

### 預覽模式

切到別的世界看時間表時，互動操作（情報/排程/接任務/搭話/探索）全部阻擋，因為**酒館訊息只會發給當前 chatId 對應的角色卡**——不同角色卡是獨立世界書，發了 AI 也看不懂。預覽中切聊天會強制退出預覽。

### IndexedDB Key 規則

複用 `map_data` store，加 `__world__<chatId>` 前綴區分世界資料 vs 設施快取（路人掃描）。

```
map_data store
├── <zoneId>_<facKey>            ← 設施快取（路人掃描資料，舊有）
└── __world__<chatId>            ← 動態世界
                                   ├ zones（區/設施/背景圖）
                                   ├ schedules（角色 24h 排程）
                                   ├ statePatches（VN 即時抽取的快照）
                                   ├ liveStates（patches 計算後的當下狀態）
                                   └ timestamp
```

---

## 🔄 VN ↔ Map 即時對接（v5.x）

「Schedule 是平常作息範本，VN 是當下事實。」 動態世界地圖 v5 加了一條後台管線：副模型 (flash) 監聽 AI 寫完正文，自動把劇情中的角色位置變化抽出來，覆蓋到 Schedule 上。

### 設計

```
酒館 AI 寫完訊息 (GENERATION_ENDED)
   ↓ 防抖
TavernHelper.getChatMessages 撈最近 N 條
   ↓
OS_API.chatSecondary（副模型 flash）
   ↓ Stage 2 prompt：抽取角色位置變化
JSON {moves: [{character, location_id, action, dialogue, until_period}, ...]}
   ↓
寫入 statePatches[msgId]
   ↓ recomputeLiveStates 重算
liveStates = 把所有 patches 依 msgId 順序 apply 出來的累積狀態
```

### 三層覆蓋順序

```
liveStates (VN 即時，最優先)
   ↓ 沒命中時
schedule (24h 平常作息範本)
   ↓ 沒命中時
無資料（地圖該設施空著）
```

### Patch 快照系統（解決 reroll/swipe/delete 錯位）

每條訊息綁一個 patch，訊息變動時 patch 跟著動：

| 你做的事 | 酒館事件 | 自動動作 |
|---|---|---|
| AI 寫完訊息 | `GENERATION_ENDED(msgId)` | 抽取 → 寫 `patches[msgId]` |
| 刪訊息 | `MESSAGE_DELETED(msgId)` | 砍 `patches[msgId]` → 重算 liveStates |
| swipe / reroll | `MESSAGE_SWIPED / UPDATED` | 砍舊 patch，新生成觸發新 patch |
| 編輯訊息 | `MESSAGE_EDITED` | 砍 patch（下次抽取重寫）|

容量管理：超過 50 條 patches 自動刪最舊（依 msgId 排序）。

### 動態地點（DYNAMIC: 處理）

當劇情提到地圖容器外的地點（例：劇情寫「南郊馬場二號關卡」，但 Stage 1 生地圖時沒生到）：

1. flash 標記 `location_id: "DYNAMIC:馬場二號關卡"`
2. `vn_bridge` 偵測 `DYNAMIC:` 前綴 → 呼叫 `WORLD_RUNTIME.addDynamicFacility()`
3. 自動加進虛擬區 `Z_DYNAMIC`（顯示為「🌀 DRIFT」），用 LoremFlickr 出圖（不浪費 pollinations）
4. 沒人引用時自動清掉（`cleanOrphanDynamics`）

### MC 過濾（主角不會被當 NPC 抽進去）

三層 fallback 識別主角名：
1. 從劇情抓 `[Protagonist|名字]` 標籤（VN 系統格式，最權威）
2. `OS_USER` / `WX_USER` / 酒館 `ctx.name1`
3. 都沒有 → 不過濾

抽到後：prompt 段「禁止抽取主角」+ 已知 NPC 名單排除主角 + applyMoves 雙保險過濾。

### GUI 設置面板

地圖標題列「⚙️」按鈕：

- **總開關**：啟用即時抽取（預設關，避免新使用者亂打副 API）
- **TRIGGER**：防抖延遲 / 歷史訊息數
- **FALLBACK**：重試次數 / 超時 / 失敗策略（靜默 vs Toast）
- **TOOLS**：「🧪 立即跑一次」「🧹 清空所有 patch」
- 設定存 `localStorage.aurelia_map_vn_bridge`，重整自動恢復

時刻表查看器（標題列「📋 排程」按鈕）會在頂部顯示「📡 即時狀態」橘紅框，列出當下所有 liveStates 的角色與動作對白。

---

## 安裝 / 部署

### 🔵 酒館擴展模式

```bash
# 進到你的 SillyTavern 第三方擴展資料夾
cd <your-sillytavern>/public/scripts/extensions/third-party/
# ⚠️ clone 時必須指定資料夾名為 my-tavern-extension（index.js 內路徑寫死的）
git clone <this-repo>.git my-tavern-extension
# 重啟 SillyTavern
```

之後要更新只要：
```bash
cd <your-sillytavern>/public/scripts/extensions/third-party/my-tavern-extension/
git pull
# 重啟 SillyTavern
```

### 🟢 獨立 PWA 模式（Netlify）

1. 把這個 repo 連到 Netlify
2. Build settings 留空（純靜態網站）
3. Publish directory：根目錄 `/`
4. 部署完用瀏覽器開 → 加到主畫面變 PWA

---

## 不在這個 repo 裡的東西

以下大型本地資源**沒傳 GitHub**（已 `.gitignore`）：

| 路徑 | 大小 | 用途 |
|---|---|---|
| `models/` | 26GB | 本地 Sovits TTS 模型 |
| `wav/` | 1.2GB | TTS 樣本音檔 |
| `@types.txt` | 168KB | 酒館型別參考 |
| `slash_command.txt` | 60KB | 酒館 slash 指令參考 |
| `tts_models.json` / `scan_models.bat` / `scan_models.py` | - | 本地 TTS 模型管理工具 |
| `_archive/` | - | 封存的舊文件 / 廢棄程式碼 |

> VPS 與 Netlify 上的語音都走內建 **Minimax API**，不依賴本地 TTS 模型。

---

## 變更紀錄

### 2026-05 — 動態世界地圖

**Map V5：VN ↔ Map 即時對接**
- 新增 `vn_bridge.js`：監聽酒館 `GENERATION_ENDED` → 副模型 (flash) 抽劇情角色位置變化 → 寫 `statePatches`
- 三層覆蓋：liveStates (VN 即時) > schedule (平常作息) > 無資料
- Patch 快照系統：每條訊息一份 patch，`MESSAGE_DELETED/SWIPED/EDITED/UPDATED` 自動清對應 patch，reroll/swipe/刪訊息不再錯位（容量上限 50，自動刪最舊）
- 動態地點 `Z_DYNAMIC`：劇情提到地圖外地點 → flash 標 `DYNAMIC:` → 自動加成虛擬區的 facility（🌀 虛線框，LoremFlickr 出圖），沒人用就自動清
- MC 過濾三層 fallback：`[Protagonist|名字]` 標籤 > OS_USER > ctx.name1
- GUI 設置面板（標題列「⚙️」）：總開關 / 防抖 / 歷史數 / 重試 / 超時 / 失敗策略 / 立即跑一次 / 清空 patch；存 `localStorage.aurelia_map_vn_bridge`
- 時刻表查看器頂部加「📡 即時狀態」區（橘紅）顯示當下 liveStates；設施頁的常駐 ⭐ 金邊 / VN 即時 📡 橘紅雙色區分

**Map V4：靜態奧瑞亞 → 多世界動態生成**
- `map_data.js` 拆分：奧瑞亞保留為「預設世界」，新增 `world_runtime.js` 容器層
- `world_generator.js`（Stage 1）：讀世界書 → AI 出 2-3 區 / 3-5 設施 JSON → pollinations 跑設施背景圖（LoremFlickr 保底）→ 存 OS_DB
- `schedule_engine.js`（Stage 2）：parse `[Character_Profiles]` 抓角色 → AI 一次生 7 時段 × ≤3 分支 × prob=100 排程 → 骰子函數選分支
- 設施頁雙層角色顯示：常駐排程角色（⭐ 金邊）+ 臨時掃描路人並存
- 標題列加「📋 排程」按鈕：有資料 → 七時段時刻表查看器（當前時段高亮）；無 → 走生成流程
- 標題列加「🌐 世界」按鈕：多世界管理面板，列出 / 切換預覽 / 刪除 / 全清
- 預覽模式：可看其他 chatId 的世界，但所有互動操作（情報/排程/接任務/搭話/探索）阻擋——因為訊息會發給當前角色卡，世界書不對應 AI 看不懂
- IndexedDB key 用 `__world__<chatId>` 前綴複用 `map_data` store，不需升級 DB version

### 2026-05 — 系統強化期

**設定面板大重組**（從亂到分類乾淨）
- 「圖片設置」改名「畫廊」+ 4 子 tab：圖片設置 / Prompt / 頭像 / 背景
- 「語音」做成三選一互斥開關：MINIMAX / SoVITS TTS / 全關閉，按下立即生效不用主保存
- VN tab 精簡到只剩 🗂️ 路徑（其他子 tab 都搬到對應主 tab）
- 酒館版隱藏 PWA-only 設定：記憶向量、系統/備份、Context 章節數

**劇情閱讀器（之前只 PWA 有）整合到酒館版**
- 透過 `TavernHelper.getChatMessages()` 讀酒館聊天歷史
- 加 `[BGM /  hide]` 工具列（觸發酒館 `/hide` 內建指令 + Janus CSS 技巧），保留最近 N 樓層其他全藏
- Status 顯示最後 #ID + 已隱藏範圍（連續 ID 自動合併成 range）
- 按鈕視覺反饋（⏳/✓/✗）+ 按鈕移到 bubble 上方
- 跨大廳 tab 切換自動隱藏，回到大廳自動恢復
- 兩套主題對齊主大廳：亮版 = 視差書咖（咖啡棕），暗版 = 404 終端風

**生圖系統強化**
- 背景快取存翻譯後 prompt（之前存原始中文，無法當參考）
- 退路圖庫 fallback chain：Pollinations 12s timeout → Pixabay (有 key) → LoremFlickr (永遠 work)
- Fallback 圖套 4px 玻璃磨砂遮罩，避免風格違和
- 強制走 fallback 測試 toggle（畫廊 → 圖片設置 內）

**BGM 模糊匹配 fallback**
- AI 寫錯 BGM 名（流口水）→ 從 GitHub Contents API 抓檔案清單 → 子字串/Jaccard 比對找最像
- 找不到夠像的就靜音（避免配錯氛圍）
- `bgm-global-collector.js` 整合進新版（記錄歷史 BGM）

**vn_tts 角色對應加別名標籤**
- 主名 → [別名陣列]，AI 用全名/小名都對到同一個語音模型
- 衝突檢查：跟主名相同、已存在、跨角色衝突都擋

**大廳 BG 時段切換**
- 06:00 / 18:00 / 21:00 三段精準切換（用 setTimeout 排到下個分界，一天只觸發 3 次）
- 拿 YingyingCafe_day / evening / night 三張圖

**story_extractor 樣式統一**
- 對齊主大廳「視差書咖」色板，不再黑白割裂

**寵物系統殘留清光**
- 設定面板的「寵物底詞 / 寵物負詞」、`type === 'pet'` 路由邏輯全清

### 早期重構
- 刪除：寵物系統 (`pet/`)、電子錢包 (`os_economy.js`)、廢棄的 `server.js`、主頁背景圖輪播設定
- 整合過時的多個 README 為單一文件

### 之前已刪除的舊面板
Chat、Echo、Forum、Map、Inventory、Shop、Task、IdCard、Livestream

---

## 已知 TODO

- [ ] `manifest.json` 的 `display_name` 跟 `description` 還是舊的，要更新
- [ ] `core/translation_manager.js` 跟 `os_phone/os/translation_manager.js` 重複，要合併
- [ ] `index.js` 跟 `index.html` 的 boot 流程跟 app 註冊邏輯有差異，可整理成共用函式
