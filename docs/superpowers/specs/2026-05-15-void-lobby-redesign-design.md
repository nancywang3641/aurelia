# 大廳視覺改版設計 spec（2026-05-15）

## 目標
把**大廳（瀅瀅）**和 **404 房間（柴郡）**改成「2087 復古未來 OS 儀表板」風。
參考圖：`aseets/ying_畫面參考.png`、`aseets/cheshire_畫面參考.png`（GPT 概念圖，當方向不當像素規格）。

## 範圍
- 兩個場景共用同一套 dashboard 骨架，靠**既有 `mode-404` class 換皮**。
- 瀅瀅 = 預設皮膚（霧白咖啡館）；柴郡 = `mode-404` 皮膚（暗黑賽博綠）。
- **Claude 房間（`mode-claude`）這次不動。**

## 結構方案（已選方案 B）
- 新增 **`core/void/lobby.css`** — 整套新大廳 dashboard 樣式集中於此。
- `index.html`（PWA）＋ `index.js`（酒館）各加一行載入 `lobby.css`。
- 舊的 `.void-*` 大廳樣式從 `aurelia_core.css` ＋ `aurelia_core_st.css` **刪除**。
- PWA／酒館差異（容器定位、安全區、字級）用既有 `#aurelia-standalone-root` 標記，在 `lobby.css` 內分支，不開兩份、不靠載入順序。
- HTML 模板重寫，**留在 `void_terminal.js` 的 `createTab`**（不抽出）。

## 版面骨架（四區，上→下）
1. **頂部狀態列** `void-top-bar`
2. **左欄角色面板**
3. **右欄 MAIN MENU**
4. **底部列** `void-chat-bar`

## 各區細節

### 1. 頂部狀態列
- **左**：`LOGO.png` 紋章 ＋ chatId 標籤 —— 維持現有 `#home-chat-title` 與寫死字「NEXUS PARALLAX // LUNA-VII」，**不動**（GPT 畫的 "AURELIS CORE" 不採用）。
- **中**：SYSTEM TIME／CURRENT DATE／WEATHER（接 `time_manager.js` `getGameTimeSettings()`）＋ USER（persona 名）。
- **右**：3 控制 = 房間切換（`room-portal-btn` ⬡404 ＋ `claude-portal-btn` 🦀Claude）＋ 全屏（`aurelia-fullscreen-btn`）＋ 喇叭（`lobby-bgm-toggle`）。沿用既有控制項，不採用 GPT 畫的信箱/盾/齒齒輪。

### 2. 左欄角色面板
- 用合成立繪圖（人物＋背景同一張）：瀅瀅 `aseets/yingying.png` / 柴郡 `aseets/cheshire.png`。
- **隱藏舊的 `.void-char-area` / `.void-char-img`** 系統。
- 疊上 HTML 文字：角色名＋副標、簽名圖（`yingying_signature.png` / `cheshire_signature.png`）、對話框（沿用 `iris-dialogue-box` 功能與打字機，只換樣式）。

### 3. 右欄 MAIN MENU（3 入口，換皮）
柴郡選單 = 瀅瀅選單換標籤換背景圖，**同 3 個功能**。

| # | 瀅瀅標籤 | 柴郡標籤 | 背景圖（瀅瀅 / 柴郡） | 既有 handler | 連到 |
|---|---|---|---|---|---|
| 01 | 藏書 | 禁庫 | `藏書_ying.png` / `禁庫_cheshire.png` | `void-quest-btn` | 館藏功能 — **PWA/酒館雙邏輯，原樣保留不碰** |
| 02 | 章節選擇 | 異常記錄 | `章節選擇_ying.png` / `異常紀錄_cheshire.png` | `void-chapter-btn` | `showVnPanel('chapter')` |
| 03 | 出門 | 墜入404 | `出門_ying.png` / `墜入404_cheshire.png` | `void-exit-btn` | `showOsApp('map')` |

- **踏入故事（`void-story-btn`）**：設計圖只有 3 格，酒館版原本就隱藏它，PWA 版才顯示。決定：保留功能、移出主選單三格；PWA 下暫掛底部 APP 列。→ 待決點，Rae 可改。

### 4. 底部列
- **NEWS FEED 跑馬燈**：先固定文字，以後再說。
- **TODAY'S SPECIAL**：先固定，以後再說。
- **點數**：瀅瀅 = 額度（`os_spend_panel`）／柴郡 = 成就點數（`OS_ACHIEVEMENT`）—— 接真資料。
- **APP 圖標列 ＋ 聊天輸入框**：維持原排列（APP 列在上、輸入框在下），不採用 GPT 畫錯的版本。

## 真資料接線
- 時間／日期／天氣 ← `time_manager.js` `getGameTimeSettings()`（天氣目前預設「晴天」，是可設定值）。
- 點數 ← `os_spend_panel`（瀅瀅）／ `OS_ACHIEVEMENT.getAll()`（柴郡）。
- USER ← persona 名（`os_persona`）。

## 明確不碰
- 藏書 PWA/酒館雙路徑邏輯。
- Claude 房間。
- 對話框、設定齒輪、APP 列各按鈕的**功能**（只換樣式）。
- 既有 responsive 斷點機制（沿用）。

## 風險／測試
- 4 組合都要目視：PWA×瀅瀅、PWA×柴郡、酒館×瀅瀅、酒館×柴郡。
- 回歸重點：藏書雙邏輯、房間切換（404/Claude）、全屏、喇叭、對話打字機。

## 待決（不阻塞，Rae 看 spec 時可回）
- 踏入故事按鈕的最終去處。
- 左上 chatId 標籤要不要真的接 `SillyTavern.getContext().chatId`（目前是寫死字）。
