# Claude / Codex 房間獨立浮窗 — 設計文件

> 日期：2026-05-22
> 狀態：設計待 Rae 審閱

## 一、背景與動機

目前 Claude 房間與 Codex 房間是「大廳的場景」——人在奧瑞亞大廳 (`VoidTerminal`)，點大廳頂部的傳送門按鈕（🦀 / 🔷），大廳 tab 靠 `mode-claude` / `mode-codex` CSS class「變裝」成聊天室。這造成兩個問題：

1. **AI 助手跟跑團攪在一起**。奧瑞亞是 VN 跑團，Claude/Codex 是寫程式的助手，兩種用途共用同一個 tab、同一套輸入框，體感混亂。
2. **耦合**。聊天室沒有自己的 UI——它跟大廳瀅瀅共用 `iris-input`（輸入框）、`iris-send-btn`（送出鈕）、立繪區，歷史也是借用大廳的 `IRIS_STATE.history` 來回搬 backup。

Rae 希望分成兩個視窗：**奧瑞亞跑團一個窗**，**Claude/Codex 助手另成一套獨立浮窗**。

## 二、現況纏繞點（動手前必須知道）

| 元件 | 現在住哪 | 拆出去要處理什麼 |
|---|---|---|
| Claude/Codex 房間 UI | `core/void_terminal.js` 的大廳 tab 模板 + `mode-claude` CSS | 整套搬進浮窗 |
| 輸入框 / 送出鈕 | 跟大廳瀅瀅**共用** `iris-input` / `iris-send-btn` | 浮窗要有自己的輸入列 |
| 對話歷史 | 借用大廳 `IRIS_STATE.history`、進出場景時來回搬 backup | 浮窗改由 `claude_terminal.js` 多會話資料層直接驅動 |
| Recents 多會話 / 會話小卡 | `core/void_terminal.js` | 搬進浮窗 |
| Claude 設置（preset / 連線） | `os_phone/os/os_settings.js` 的「🦀 Claude 的房間」分頁 | 搬成浮窗的 ⚙️ 子面板 |
| 設定資料層 `loadClaudeRoomConfig` 等 | `os_settings.js` 匯出、被 `claude-room.js` / `claude_terminal.js` 引用 | 移進 `claude_terminal.js`，更新引用點 |
| 工作檯 / 額度入口 | `core/control_center.js` 的 `GAME_APP_MAP` + 大廳模板的 `data-app-launch` 按鈕 | 入口移進浮窗工具列 |

聊天室 UI 層已經有一個獨立檔 `core/void/claude-room.js`（`VoidClaudeRoom`：氣泡渲染 / markdown / 附件 / picker / send）、後端有 `core/claude_terminal.js`（`ClaudeTerminal`：API、多會話持久化）。真正把它綁死在大廳的是 `void_terminal.js` 的場景調度（`enterClaudeRoom` / `exitClaudeRoom`）跟 `createTab` 裡那段聊天室 HTML 模板。

## 三、需求決策（已與 Rae 對齊）

| 項目 | 決定 |
|---|---|
| 視窗形式 | 獨立浮窗（不是底部導覽分頁、不是獨立網頁） |
| Claude / Codex 關係 | **兩個窗**（各有自己的身份與配色），一次只開一個——開 Codex 窗會自動收掉 Claude 窗 |
| 浮窗 vs 奧瑞亞主面板 | 連動互斥——開浮窗時主面板隱藏，關浮窗回到大廳 |
| 拖拉行為 | 標題列可拖動；視窗**固定尺寸**（手機 / 桌面各一個適配值） |
| 工作檯 / 額度 | 當**聊天窗裡的子面板**（工具列按鈕點開，疊在窗內） |
| Claude 設置 | 從 `os_settings.js` 搬出，成為浮窗的 ⚙️ 子面板 |
| 工作檯 / 額度模組檔 | **留在原地**（`os_phone/os/`），只搬入口；它們是自帶 `.launch(容器)` 的獨立 app，搬檔要動載入順序、風險高 |

## 四、設計

### 4.1 浮窗外殼（新模組）

新增 `core/chat_window.js`，匯出 `window.ChatWindow`。職責：

- 建立、掛載、卸載浮動框（一個 `position:fixed` 的 DOM 容器）
- 標題列拖動邏輯（pointerdown 抓標題列 → 移動；視窗尺寸固定）
- 開 / 關 / 切換 provider：`ChatWindow.open(provider)`、`ChatWindow.close()`
- provider 狀態（`'claude'` | `'codex'`）
- 子面板路由（⚙️ 設置 / 🛠️ 工作檯 / 💰 額度 / 🕘 Recents）
- 跟奧瑞亞主面板的互斥：開窗時隱藏主面板、關窗時還原到大廳

**浮窗 DOM 結構**

```
#aurelia-chat-window  (position:fixed, 固定尺寸, 可拖動)
├─ .cw-titlebar         拖動把手
│  ├─ .cw-identity      🦀 Claude's Room / 🔷 Codex's Room
│  ├─ .cw-toolbar       ⚙️設置  🛠️工作檯  💰額度  🕘Recents
│  └─ .cw-close         ✕
├─ .cw-body
│  ├─ .cw-portrait      立繪區（Claude 立繪 / Codex spritesheet）
│  ├─ .cw-picker-bar    inline picker（model / effort / endpoint）
│  ├─ .cw-chat-stream   氣泡列
│  ├─ .cw-attach-chips  附件預覽列
│  └─ .cw-input-row     **自己的**輸入框 + 送出鈕
└─ .cw-subpanel         子面板浮層（設置 / 工作檯 / 額度 / Recents 疊這裡）
```

**尺寸**：手機與桌面各一組固定寬高（具體數值在實作計畫時定，桌面參考現有面板約 480px 寬）。版型適配當實作細節處理。

### 4.2 進出流程

- 大廳現有的 🦀 Claude / 🔷 Codex 兩顆傳送門按鈕保留，行為改成 `ChatWindow.open('claude' | 'codex')`
- 開窗 → 奧瑞亞主面板隱藏、浮窗出現
- 浮窗 `✕` → 關閉浮窗、奧瑞亞主面板還原到大廳
- 一次只開一個：`open('codex')` 時若 Claude 窗開著，先把它關掉
- 想從 Claude 換到 Codex：關窗回大廳、再點另一顆按鈕（不做窗內 toggle）

### 4.3 子面板（疊在浮窗內）

工具列四顆按鈕，各自開一個疊在 `.cw-subpanel` 的浮層：

| 按鈕 | 內容 | 來源 |
|---|---|---|
| ⚙️ 設置 | Claude preset 清單、連線（URL / Key）、maxTokens / temperature / top_p、測試連線 | 從 `os_settings.js` 的 `#view-claude-room` 搬來 |
| 🛠️ 工作檯 | `OS_WORKBENCH.launch(容器)` 開進子面板 | `os_workbench.js`（檔案留原地） |
| 💰 額度 | `OS_SPEND_PANEL.launch(容器)` 開進子面板 | `os_spend_panel.js`（檔案留原地） |
| 🕘 Recents | 多會話列表（會話切換 / 改名 / 刪除 / 新會話） | 從 `void_terminal.js` 搬來 |

### 4.4 解除跟大廳的共用

1. **輸入框 / 送出鈕**：浮窗 `.cw-input-row` 自己有一套，不再借 `iris-input` / `iris-send-btn`。`claude-room.js` 裡所有抓 `iris-input` / `iris-send-btn` 的地方改抓浮窗自己的元素。
2. **氣泡層**：浮窗自己的 `.cw-chat-stream`，取代目前散在大廳模板裡的 `claude-chat-stream`。
3. **歷史**：浮窗開窗時直接呼叫 `claude_terminal.js` 的多會話資料層（`loadConversation` 等）載入當前 conv 的訊息來渲染；送訊息 append 到當前 conv。不再經過 `IRIS_STATE.history` 跟 backup 搬移。
4. **設定資料層**：`loadClaudeRoomConfig` / `saveClaudeRoomConfig` / `getActivePreset`（及向下相容的 `getActiveClaudeEndpoint`）從 `os_settings.js` 移進 `claude_terminal.js`。更新引用點：`claude-room.js`、`claude_terminal.js` 內部、其他呼叫 `OS_SETTINGS.getClaudeRoomConfig` 之處。
5. **bridge**：`claude-room.js` 目前透過 `VoidTerminal._bridge` 借看大廳狀態（`activeHistory()` / `scheduleSave()` / `isClaudeRoom()` / `chatProvider()`）。改成跟 `ChatWindow` + `ClaudeTerminal` 直接溝通。檔案從 `core/void/claude-room.js` 移到 `core/chat_room.js`（不再是大廳子模組），更新 `index.js` 的 `MODULE_LOAD_ORDER` 與 `index.html` 的 `<script>`（兩處都要）。全域名稱 `window.VoidClaudeRoom` 維持不變，避免動到所有呼叫點。

### 4.5 清理

- **`core/void_terminal.js`**：移除 `enterClaudeRoom` / `exitClaudeRoom`、`isClaudeRoom` / `_chatProvider` 狀態、`_claudeHistoryBackup` / `_codexHistoryBackup`、`createTab` 裡的聊天室 HTML 模板、`mode-claude` / `mode-codex` 相關處理、Recents 視窗與會話小卡程式碼。大廳回歸單純 瀅瀅 + 柴郡(404)。預估瘦約 600+ 行。
- **`os_phone/os/os_settings.js`**：移除「🦀 Claude 的房間」設置分頁（`data-tab="claude-room"`、`#view-claude-room`、preset 清單渲染、相關 binding）。
- **`core/control_center.js`**：`GAME_APP_MAP` 移除 `workbench` / `spend` 兩條。
- **大廳模板**：移除 `data-app-launch="workbench"` / `data-app-launch="spend"` 按鈕（它們原本就在聊天室 UI 區，跟著聊天室一起走）。
- 相關 CSS：聊天室、`mode-claude/codex`、Recents 的樣式從大廳 CSS 抽出，集中到浮窗自己的 CSS 檔（遵守「不寫 inline style、CSS 進 css/ 集中區」慣例）。

## 五、實作階段（每階段完 commit 一次）

1. **Phase 1 — 浮窗外殼**：`core/chat_window.js`、可拖動固定尺寸的空浮框、跟主面板互斥、大廳 🦀/🔷 按鈕改成開關浮窗。先讓空殼能開能關能拖。
2. **Phase 2 — 搬房間 UI**：把聊天室 UI（氣泡 / picker / 附件 / 立繪）搬進浮窗，解除 `iris-input` / `iris-send-btn` 共用、改用浮窗自己的輸入列；歷史改直連 `claude_terminal.js` 多會話層；`claude-room.js` bridge 改接 `ChatWindow`、檔案移出 `void/`。
3. **Phase 3 — 搬子面板**：設置（含資料層移進 `claude_terminal.js`）、工作檯、額度、Recents 接進浮窗工具列。
4. **Phase 4 — 清理**：清 `void_terminal.js` / `os_settings.js` / `control_center.js`，大廳回歸 瀅瀅+柴郡，CSS 整理。

## 六、不在這次範圍

- 浮窗最小化 / 收成小泡泡 — 未提，不做
- 浮窗可縮放（拉角調大小）— Rae 選了「固定尺寸」，不做
- Claude 窗 ⇄ Codex 窗 的窗內快速切換 toggle — Rae 要兩個獨立窗、透過大廳進出，不做窗內 toggle
- 工作檯 / 額度模組檔案實體搬移 — 只搬入口，檔案留 `os_phone/os/`
- 工作檯 / 額度的功能本身改動 — 只搬入口，內部邏輯不動

## 七、風險與注意

- **共用 DOM 的解耦是最容易出 bug 的一步**（Phase 2）。`claude-room.js` 對 `iris-*` 元素的引用點要全部找出來改乾淨，漏一個就會送不出訊息或氣泡渲染到大廳殘留的元素上。
- 載入順序：`claude-room.js` 移出 `void/` 後，`index.js` `MODULE_LOAD_ORDER` 與 `index.html` `<script>` 兩處都要同步改。
- 設定資料層搬家後，所有 `OS_SETTINGS.getClaudeRoomConfig` 等呼叫點要改指到 `ClaudeTerminal`。
