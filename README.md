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
| 🛡️ RPG 狀態 | ✅ | ✅ | 角色狀態 / 屬性 / 頭像管理 |
| 💬 微信 (WX) | ✅ | ✅ | 偽微信對話介面 |
| 📱 微博 (WB) | ❌ | ✅ | 偽微博介面（PWA 限定） |
| 📚 QQ閱讀 (QB) | ❌ | ✅ | 偽小說閱讀介面（PWA 限定） |
| 🔮 賽博塔羅 | ✅ | ✅ | 抽塔羅小工具 |
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
    ├── wx/               微信（兩模式都載）
    ├── wb/               微博（PWA 限定）
    └── qb/               QQ閱讀（PWA 限定）
```

---

## 安裝 / 部署

### 🔵 酒館擴展模式

```bash
# 進到你的 SillyTavern 第三方擴展資料夾
cd <your-sillytavern>/public/scripts/extensions/third-party/
git clone <this-repo>.git
# 重啟 SillyTavern
```

之後要更新只要：
```bash
cd <your-sillytavern>/public/scripts/extensions/third-party/aurelia/
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

### 重構整理
- 刪除：寵物系統 (`pet/`)、電子錢包 (`os_economy.js`)、廢棄的 `server.js`
- 已從 `index.html` 移除上述模組的 script 引用
- 整合過時的多個 README 為單一文件

### 之前已刪除的舊面板
Chat、Echo、Forum、Map、Inventory、Shop、Task、IdCard、Livestream

---

## 已知 TODO

- [ ] `manifest.json` 的 `display_name` 跟 `description` 還是舊的，要更新
- [ ] `core/translation_manager.js` 跟 `os_phone/os/translation_manager.js` 重複，要合併
- [ ] `index.js` 跟 `index.html` 的 boot 流程跟 app 註冊邏輯有差異，可整理成共用函式
