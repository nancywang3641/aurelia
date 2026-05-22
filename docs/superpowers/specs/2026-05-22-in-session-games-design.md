# 群聊區「同 session 真・對弈」— 設計文件

> 日期：2026-05-22
> 狀態：設計待 Rae 審閱
> 前置：建立在群聊區（`2026-05-22-claude-codex-group-chat-design.md`）+ 通用畫布（`2026-05-22-chat-canvas-design.md`）之上
> 取代：通用畫布 §七「對弈」那套（`LP.move` 分 session）。同主題的待做筆記見 `2026-05-22-in-session-games-notes.md`

## 一、背景與動機

通用畫布 v1 用 `LP.move` 讓 AI 下棋，但 `LP.move` 走 `ClaudeTerminal.sendRaw` —— 無 session、丟完即棄的獨立呼叫。下棋的不是群聊裡那個 Codex / Claude 本人，只是借後端跑的兩串無名 API：它們沒參與、不記得、玩完不能在群裡互嗆。

本功能把對弈搬回**群聊 session**：AI 在自己正常的群聊回覆裡用標記落子，標記走 `sendGroup`（resume）進它各自的群聊 session。它是真的在玩、真的記得、玩完能講評互嗆。

## 二、需求決策（已與 Rae 對齊）

| 項目 | 決定 |
|---|---|
| 遊戲範圍 | **通用框架** —— 不硬寫特定遊戲。AI 用 `<lobbyPanel>` 自己生棋盤 / 規則 / UI，host 不管是什麼遊戲 |
| 對戰組合 | 框架同時支援 Claude vs Codex（Rae 觀戰）與 Rae vs AI。panel 開局時聲明「誰對誰」，編排照聲明跑 |
| 規則 / 勝負住哪 | **甲案：AI 當裁判** —— AI 靠 session 記憶持有棋局，畫布是純看板。含一個便宜的 `LP.gameEnd()` 結束 hook |
| 自喚醒 | **不在本次範圍** —— 之後另開一份 spec |
| 自動多輪 | 對弈期間 AI 自己輪流下、不等使用者，到回合上限為止 |

## 三、核心機制

### 3.1 三個新標記

沿用專案既有 marker 慣例（`[PASS]` / `[ASK|...]`）。

| 標記 | 意義 |
|---|---|
| `[GAME\|p1,p2]` | 開局。`p1` 先手、`p2` 後手。值 ∈ `claude` / `codex` / `rae`。與 `<lobbyPanel>` 在同一則回覆吐出 |
| `[MOVE\|payload]` | 一手。`payload` 是 AI 自定的任意字串 —— host **不解讀**，只負責轉述 + 餵畫布 |
| `[GAMEOVER\|講評]` | AI 宣告對局結束，附一句講評 |

`payload` 格式（座標？牌？文字）由開局的 AI 自己定義，並在開局的閒聊說明裡跟對手講清楚。host 全程不碰 payload 內容。

### 3.2 生命週期

1. **開局** —— 某 AI 在正常群聊回合裡，回覆中同時含 `<lobbyPanel>`（空棋盤 panel）與 `[GAME|claude,codex]`。`ChatGroup` → 渲染畫布、進「遊戲模式」、啟動自動多輪迴圈。
   - 開局回覆若也帶一個 `[MOVE]`，視為 `p1` 的第一手。
2. **對弈** —— 迴圈輪流問 `p1` / `p2`。每個 AI 回合 = 一次 `sendGroup`，**走它原本的群聊 session**（`group_claude_sid` / `group_codex_sid`）→ 它真的在玩、真的記得。delta 自然帶上對手上一手的 `[MOVE]` 標記。AI 回「閒聊文字 + `[MOVE|payload]`」→ `ChatGroup` 渲染閒聊氣泡、payload 餵畫布畫圖、payload 留在 transcript 給對手下輪看到。
3. **收場** —— 觸發任一條件即退出遊戲模式：
   - 某 AI 的回覆含 `[GAMEOVER|...]`；
   - 畫布呼叫 `LP.gameEnd(text)`；
   - 達回合上限；
   - AI 連續失敗（見 §七）。
   退出後，`ChatGroup` 自動讓兩個 AI 各講評一句（就是普通一輪，注入「對局結束，簡短講評」的系統 delta）再完全停 —— 這是「互嗆」的爽點。對局全程在兩 AI 的 session 裡，之後 Rae 隨時能叫它們回顧。

### 3.3 自動多輪迴圈

```
進遊戲模式（_game = { players:[p1,p2], turnIdx, moveCount }）
  ↓
loop：mover = players[turnIdx % 2]
  ├─ mover 是 AI → 送回合（sendGroup, resume 它的群聊 session）
  │                 → 收回覆：渲染閒聊氣泡、抽 [MOVE] 餵畫布、payload 進 transcript
  │                 → 偵測 [GAMEOVER]？是 → 收場
  │                 → 沒吐 [MOVE]？走 §七 補救
  ├─ mover 是 rae  → 迴圈暫停（await 一個 Promise）
  │                 → 畫布捕捉 Rae 點擊 → LP.submitMove(payload) → resolve → 續跑
  ↓
moveCount++ / turnIdx++
撞回合上限？是 → 收場
  ↓
loop
```

- **回合上限**：`GAME_TURN_LIMIT = 60`（總手數）。安全閥，防無限迴圈 + 訂閱額度爆。撞上限 → 停、顯示一行通知。
- **遊戲進行中 Rae 仍能打字** —— 訊息進 transcript + 渲染，**不另起一輪**（迴圈會在下個 AI 回合的 delta 自然看到）。讓 Rae 能邊看邊嗆、AI 收得到。

### 3.4 transcript 與顯示

- transcript 存**完整內容（含 `[MOVE]` / `[GAME]` / `[GAMEOVER]` 標記）** —— 對手要靠 delta 裡的標記看到棋步。只有 `<lobbyPanel>` 那段大 HTML 會被剝掉（畫布已渲染、不重送、省額度）。
- 氣泡只顯示閒聊文字 —— 所有標記都剝掉。閒聊文字為空（AI 只落子沒說話）→ 不渲染氣泡。
- 遊戲模式 state（`_game`）只在記憶體、不持久化 —— v1 重載時進行中的對局不續玩（聊天歷史照常保留）。

## 四、host 接口 `LP` 改動

`chat_canvas.js` 的 `_makeChatPanelAPI()`：

| 接口 | 動作 | 說明 |
|---|---|---|
| `LP.chat(text, opts)` | 保留 | panel 向某 AI 問一句、回字串 |
| `LP.image(prompt, type)` | 保留 | 生圖 |
| `LP.close()` | 保留（行為擴充） | 收合 / 關畫布；**對局中呼叫 = 中止對局** |
| `LP.move(...)` | **移除** | 分 session 對弈，方向錯，整個拿掉 |
| `LP.onMove(cb)` | **新增** | panel 註冊落子回調。host 每次有一手（任一玩家）→ 呼叫 `cb(payload, mover)` 讓 panel 畫 |
| `LP.submitMove(payload)` | **新增** | panel 把 Rae 的一手推進迴圈（只在輪到 Rae 時有意義） |
| `LP.gameEnd(resultText)` | **新增** | panel 宣告對局結束（畫布若自己偵測得出勝負就用） |

**落子顯示走單一路徑**：所有玩家的每一手都由 host 呼叫 `ChatCanvas.applyMove(payload, mover)` → 觸發 panel 註冊的 `onMove` 回調。panel 的 Rae 點擊處理**只收集 payload 並呼叫 `LP.submitMove`，不自己畫** —— 畫圖一律等 host 回呼 `onMove`，避免雙重繪製。

`ChatGroup` 對外新增：`ChatGroup.submitPlayerMove(payload)`（`LP.submitMove` 呼叫它）、`ChatGroup.endGame(text)`（`LP.gameEnd` 呼叫它）。`ChatCanvas` 對外新增 `ChatCanvas.applyMove(payload, mover)`。

## 五、群聊系統提示改動

`claude_terminal.js` 的 `GROUP_SYSTEM_PROMPT` 把現有「互動畫布」那段改寫成遊戲版，要點：

- 想玩遊戲 / 下棋 → 吐 `<lobbyPanel>`（空棋盤 + panel JS）+ `[GAME|先手,後手]`（值 `claude`/`codex`/`rae`）。在同一則回覆的閒聊裡跟對手講清楚 `payload` 格式。
- panel JS 必須：用 `LP.onMove((payload, mover) => { …畫… })` 註冊落子顯示；若有玩家是 `rae`，把點擊轉成 `LP.submitMove(payload)`（不要自己畫）；可選用 `LP.gameEnd(文字)` 在偵測到勝負時收場。
- 輪到你下棋 → 回「閒聊（可嗆對手）+ `[MOVE|payload]`」。
- 對局結束 → 吐 `[GAMEOVER|一句講評]`。
- 棋局狀態靠你自己記（你的 session 有完整逐字稿）；不要用純文字 / ASCII 排版代替畫布。
- `LP` 方法清單：移除 `move`，加入 `onMove` / `submitMove` / `gameEnd`。

## 六、程式結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `core/chat_group.js` | 修改 | 遊戲模式 state + 自動多輪迴圈；`[GAME]` / `[MOVE]` / `[GAMEOVER]` 解析；`submitPlayerMove` / `endGame`；transcript 保留標記、剝 `<lobbyPanel>`；收場講評一輪 |
| `core/chat_canvas.js` | 修改 | `LP`：移除 `move`，加 `onMove` / `submitMove` / `gameEnd`；新增 `ChatCanvas.applyMove(payload, mover)`（觸發註冊的 `onMove`） |
| `core/claude_terminal.js` | 修改 | `GROUP_SYSTEM_PROMPT` 遊戲段改寫（§五） |
| `css/chat_window.css` | 修改（可能） | 收場通知行 / 純落子的淡樣式，若沿用既有樣式可不動 |

`_runTurn` 已有 `<lobbyPanel>` 偵測與 transcript push，擴充成「也掃 `[GAME]` / `[MOVE]` / `[GAMEOVER]`、回傳結構化結果」供迴圈與 `sendUserMessage` 共用 —— 細節留實作計畫。

## 七、錯誤處理

- **AI 該下棋卻沒吐 `[MOVE]`**（只閒聊）→ 對該 AI 補送一次提示「請用 `[MOVE|...]` 落子」；再沒有 → 中止對局 + 通知。
- **違規步** → **不驗證**（甲案設計如此）。對手 AI 通常會自己在閒聊吐槽 —— 這是可接受的 v1 行為。
- **`<lobbyPanel>` JSON 壞** → 沿用 `VoidCanvas.parseLobbyPanel` 三層修復；修不好 → 無畫布 → 同則的 `[GAME]` 忽略（沒棋盤不能玩）。
- **cc-bridge 送出失敗** → 渲染錯誤氣泡 + 中止對局（別讓迴圈空轉）。普通群聊的「不中斷另一個」規則在遊戲迴圈裡改成「失敗即收場」。
- **`LP.close()` 在對局中** → 視為中止對局。
- **回合上限** → 停、顯示一行很淡的通知（「已達回合上限，自動對弈停止」）。

## 八、不在本次範圍

- 自喚醒（沒人發話 → 骰子 → AI 主動開口）—— 之後另開 spec
- 進行中對局跨重載續玩 —— v1 重載中斷
- 違規步硬驗證 —— 甲案刻意不做
- 遊戲多會話 / 對局歷史回放
- 單人 Claude / Codex 房間玩遊戲 —— v1 只群聊區

## 九、風險與注意

- **AI 幻覺棋局**：甲案沒硬驗證，AI 可能記錯盤面或走違規步。靠對手 AI 互相糾錯 + Rae 旁觀。v1 接受此風險。
- **回合上限 vs 訂閱額度**：60 手 = 最多 60 次 cc-bridge 呼叫。長遊戲仍吃額度，但有硬上限，可控。
- **Rae 是玩家時迴圈卡住**：輪到 Rae 時迴圈 `await` 一個 Promise，必須有出口（`LP.close()` 中止、或 Rae 一直不下也只是停著、不空轉）。
- **`[MOVE]` 留在 transcript、`<lobbyPanel>` 剝掉**：剝錯會讓對手漏看棋步或重收大 HTML。剝除規則要精確測。
- **雙重繪製**：Rae 點擊只能呼叫 `submitMove`、不能自己畫，否則 Rae 的一手會被畫兩次。系統提示要講明。
