# VN 劇情面板可換主題 — 設計

2026-06-03

## 目標
VN 劇情（遊戲）面板不要永遠黑金模板。能依劇情類型（古代/奇幻/賽博/和風…）換樣式，由劇情自帶的 `[World|]` 驅動自動切換，並可手動鎖；主題在「靈感創作室」管理。

## 核心：主題 = 一組 CSS 變數
VN 面板（`css/vn_styles.css`）目前對話框底色/邊框、立繪畫框、強調金、字體、背景壓膜是寫死的。把這些抽成 CSS 變數，**預設值 = 現在的黑金**（不選主題時長相不變）：
`--vn-dialog-bg`、`--vn-accent`、`--vn-frame`、`--vn-font`、`--vn-scrim`、`--text-color`、`--em-color`、`--name-color`（後三個已存在）。

一套主題 = `{ id, name, builtin?, vars:{ '--vn-…': 值 } }`。套用＝JS 把 vars `setProperty` 到 `#page-game`；切回黑金＝清掉所有 `--vn-*` 覆蓋（吃 CSS fallback）。用 JS 套（非寫死 class）→ 創作室能自訂主題。

## 內建主題包（先 4–5 套）
黑金(預設) / 奇幻(羊皮紙暖棕襯線) / 賽博(暗底霓虹青洋紅等寬字) / 和風(米白墨色毛筆感)。

## 驅動：`[World|]` → 主題（不另設 [Theme|]）
- **World→主題 對照表**（創作室編，存 localStorage `vn_world_theme_map`）：`{ 古代:'gold', 奇幻:'fantasy', 赛博:'cyber', 现代:'minimal' }`。
- AI 劇情輸出 `[World|古代]`（本來就會輸出，用來觸發 ST 世界書 BGM）→ VN 引擎查表套主題。**關鍵字與 BGM 用途共用、零衝突**。
- 砍掉獨立 `[Theme|]` 指令。

## 選擇優先序（每 chatId 記憶）
`loadScript` 時解析 `[World|X]`，依序解析該世界(chatId)該套哪個主題：
1. **手動鎖**（創作室給此 chatId 指定的主題，存 `vn_theme_by_chat[chatId]`）
2. **`[World|X]` 對照表**命中
3. **預設黑金**

手動「跟隨劇情(自動)」選項 = 清掉該 chatId 的手動鎖，回到 [World|] 自動。

## 元件 / 檔案
- `css/vn_styles.css`：寫死黑金值改 `var(--vn-…, 現值)`。
- `os_phone/vn_story/vn_theme.js`（新）：`VN_Theme` — 內建主題、`apply(theme)`、`getAll()`(內建+自訂)、自訂主題 CRUD(localStorage `vn_themes_custom`)、world-map 讀寫、`resolveForWorld(chatId, worldKeyword)`、手動鎖讀寫。註冊進 index.js `PHONE_FILES` + index.html。
- `os_phone/vn_story/vn_core.js`：`loadScript` 解析 `[World|]` → `VN_Theme.resolveAndApply(chatId, X)`；VN 開播套當前世界主題。
- `os_phone/os/os_studio.js`：新增「🎨 劇情面板主題」區 — 主題清單+預覽、設當前世界主題(手動/自動)、World→主題對照表編輯、自訂主題(顏色/字體選擇器)。
- 樣式放 `css/vn_gallery.css`（已兩邊載入）。

## 範圍 / YAGNI
做：抽變數 + 內建主題包 + 創作室主題區 + `[World|]` 套用 + 每 chatId 記憶。
之後：把可用主題名注入 AI prompt、主題匯出入、DB 化（目前 localStorage 夠）。
