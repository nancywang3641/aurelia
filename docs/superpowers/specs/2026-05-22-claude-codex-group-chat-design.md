# Claude × Codex 群聊區 — 設計文件

> 日期：2026-05-22
> 狀態：設計待 Rae 審閱
> 前置：建立在 `2026-05-22-claude-codex-floating-window-design.md`（浮窗系統）之上

## 一、背景與動機

目前 Claude 房間、Codex 房間是兩個各自獨立的浮窗,一次只開一個 —— 你只能單獨跟其中一個聊。Rae 想要一個「群聊區」:把你、Claude、Codex 三方放進同一個聊天室,Claude 跟 Codex **看得到彼此的話、可以接話互相討論**。

定位上跟「🛠️ 工作檯」不同 —— 工作檯是任務協作(Claude 指導 / Codex 執行 / Rae 把關),群聊區是**單純三方聊天**。

## 二、需求決策（已與 Rae 對齊）

| 項目 | 決定 |
|---|---|
| 回話方式 | 兩個 AI 都回、而且**看得到彼此**(能接話、互相討論) |
| 回話節奏 | 「偽機率」—— 骰子決定誰拿發言權,拿到的 AI 自己決定要講還是 `[PASS]`(略過) |
| 每則訊息回幾輪 | 最多一輪:你發 → 第一個拿發言權 → 第二個拿發言權 → 停。不做自動多輪 |
| Session | Claude、Codex **各自獨立 session**,不共用。群聊區當「傳話人」轉述 |
| 入口 | 💬 啟動選單第三項「👥 群聊區」 |
| 設置 | 沿用現有 `os_claude_room_config`(Claude 用 Claude preset、Codex 用 Codex preset) |
| 多會話 | v1 只做單一條群聊,Recents 多會話以後再加 |

## 三、核心機制

### 3.1 傳話人模型（session 不共用）

Claude 和 Codex 各有**一條群聊專屬 session**（跟它們各自單房間的 session 完全分開）。兩條 session 永遠各自獨立。

群聊區扮演「傳話人」:某個 AI 講完一句,協調器把那句話標上講者、當成 user 訊息**轉述進另一個 AI 的 session**。每個 AI 的 session 從頭到尾還是 100% 它自己的,只是內容裡多了幾句「轉述他人說過的話」。

**講者標記**:轉述時每句前面標 `[Rae]:` / `[Claude]:` / `[Codex]:`,讓收到的 AI 知道誰說的。

**只送增量(保留 resume / 省訂閱額度)**:每輪只把「自從這個 AI 上次拿到發言權以來、新增的別人說的話」打包成一則 user 訊息,`--resume` 接續它的 session。它自己之前的回覆已經在自己 session 裡,不重送。

**增量追蹤**:協調器維護一條共享的群聊逐字稿(transcript),並給每個 AI 記一個 `seenIndex`(它已經知道到第幾則)。輪到某 AI 時:
- 送出的內容 = `transcript[(seenIndex+1) .. 現在]` 裡**非它自己**的訊息,標講者、合成一則 user 訊息。
- 它回正常話 → 該回覆 append 進 transcript;它的 `seenIndex` 更新到自己這則。
- 它回 `[PASS]` → transcript 不變;它的 `seenIndex` 仍更新到當前末端(它看過了、只是沒講)。

第一次(session 還沒建)→ 不帶 sid 開新 session;之後都 resume。

### 3.2 回合編排（偽機率 + PASS）

```
你發一則訊息 → append 進 transcript
  ↓
🎲 擲骰：誰先拿發言權（Claude / Codex 各 50%）
  ↓
把增量轉述給第一位 + 系統提示「沒話補充就只回 [PASS]」→ resume 它的 session
  ↓
它回正常話 → 渲染氣泡（標講者）
它回 [PASS]  → 不渲染（靜默）
  ↓
🎲 擲骰：另一位要不要也拿發言權（約 70%）
   例外：若第一位 [PASS] 了 → 第二位 100% 拿到（不冷場）
  ↓
（拿到的話）把增量轉述給第二位 → 同上：回話 or [PASS]
  ↓
停，等你下一則
```

結果分佈:兩個都講 / 只一個講 / 偶爾兩個都 PASS（罕見）；順序不固定 —— 夠隨性、又有明確上限(每則訊息最多 2 次 AI 呼叫),不會無限跑、不會爆額度。

### 3.3 `[PASS]` 暗號

群聊系統提示告訴 AI:「沒什麼好補充時,只輸出 `[PASS]`」。協調器收到回覆後:
- 整則回覆 trim 後**就是** `[PASS]`（大小寫不拘）→ 視為略過,不渲染氣泡、不進 transcript。
- 否則 → 正常渲染（即使內文剛好提到 PASS 也照渲染）。

沿用專案既有的 marker 慣例(`[ASK|...]` 已有同類處理)。

### 3.4 群聊系統提示

每個 AI 進群聊用的 system prompt 跟單房間不同,需說明:
- 你在一個群聊裡,成員有使用者 Rae、以及另一個 AI（Claude 對 Codex 說明對方是 Codex,反之亦然）。
- 別人的發言會標 `[名字]:` 前綴。
- 可以正常回應、可以接對方的話;沒什麼好補充就只回 `[PASS]`。
- 預設繁體中文。

放在 `claude_terminal.js`,跟現有的 `CLAUDE_ROOM_SYSTEM_PROMPT` / `CODEX_ROOM_SYSTEM_PROMPT` 並列,新增 `GROUP_*` 版本。

## 四、UI 設計

### 4.1 入口

`ui_utilities.js` 的 💬 啟動選單加第三項「👥 群聊區」（在 🦀 Claude / 🔷 Codex 下面）。點了 → `ChatWindow.open('group')`。

### 4.2 浮窗 group 模式

`ChatWindow` 的 `_provider` 目前是 `'claude'|'codex'`,擴充 `'group'`：
- 標題列身份：「👥 群聊區」。
- 配色:中性深色(不偏暖橘、不偏冷藍)。
- **立繪區隱藏** —— 群聊容不下單一大立繪;chat-stream 撐滿窗身。
- **inline picker 橫條隱藏** —— 群聊牽涉兩個 provider,model/effort 快切在這裡會太複雜;v1 用各自預設值,要調去 ⚙️。
- 工具列:保留 ⚙️ 設置;🕘 Recents 在 group 模式停用(v1 單一群聊);🛠️/💰 維持。

### 4.3 三方氣泡

chat-stream 裡三種氣泡,一眼能分誰是誰:
- **你(Rae)**：右側,既有使用者氣泡樣式。
- **🦀 Claude**：左側,暖橘邊 + 氣泡頂標「🦀 Claude」。
- **🔷 Codex**：左側,冷藍邊 + 氣泡頂標「🔷 Codex」。

某 AI 被送出、等回覆時 → 顯示「🦀 Claude 正在輸入…」之類的 typing 指示。回覆可沿用既有 streaming 漸進渲染。

## 五、資料儲存

- **群聊逐字稿**:一條獨立歷史(三方混排,每則記 `speaker` 欄位:`rae`/`claude`/`codex`)。存 IndexedDB(沿用 `OS_DB` studio_chats,key 如 `group_chat_main`)。
- **兩條群聊 session_id**:`claude` 群聊 sid、`codex` 群聊 sid,存 localStorage(如 `group_claude_sid` / `group_codex_sid`)。
- **每個 AI 的 `seenIndex`**:可由 transcript 長度推算,或一起存。
- v1 單一條群聊;清空 = 清 transcript + 清兩條 sid + 重置 seenIndex。

## 六、程式結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `core/chat_group.js` | 新建 | `window.ChatGroup` —— 群聊協調器:骰子編排、傳話/增量追蹤、`[PASS]` 解析、三方氣泡渲染、transcript 持久化 |
| `core/chat_window.js` | 修改 | `_provider` 加 `'group'`;group 模式的身份/配色/隱藏立繪與 picker/工具列調整;`open('group')` 委派給 `ChatGroup` |
| `core/claude_terminal.js` | 修改 | 新增 `GROUP_CLAUDE_SYSTEM_PROMPT` / `GROUP_CODEX_SYSTEM_PROMPT`;提供群聊用的送訊息入口(指定 provider + session_id + 訊息,不綁多會話 conv 系統) |
| `core/ui_utilities.js` | 修改 | 💬 選單加「👥 群聊區」 |
| `css/chat_window.css` | 修改 | group 模式配色、三方氣泡標頭、typing 指示 |

`chat_group.js` 渲染氣泡可重用 `chat_room.js` 既有的 markdown / 氣泡 helper(若不易重用就在 `chat_group.js` 自帶簡版)—— 細節留實作計畫。

## 七、錯誤處理

- 某個 AI 送出失敗(連線錯誤等)→ 為該講者渲染一則錯誤氣泡,**不中斷另一個** —— 編排照常輪到第二位。
- session resume 失效(cc-bridge 重啟等)→ 沿用單房間既有處理:退回新 session、提示一句。
- 兩個都 PASS → 罕見,可顯示一行很淡的「(沒人接話)」或就靜默,實作時定。

## 八、不在本次範圍

- 群聊多會話 / Recents —— v1 單一條群聊
- AI 自動多輪互聊(你不發話它們自己一直聊)—— 每則訊息最多一輪
- 工作檯式的任務執行(規畫/改檔)—— 那是 🛠️ 工作檯,本功能只是聊天
- 群聊裡切 model / effort 的 inline picker —— v1 用預設值
- 第三方以上(再加別的 AI)—— 只 Claude + Codex 兩個

## 九、風險與注意

- **傳話增量追蹤**是最容易出錯的地方:`seenIndex` 算錯 → AI 漏看或重複看到訊息。需仔細測「PASS 後指標也要前進」。
- 群聊 session 與單房間 session 必須用**不同的 session_id 儲存鍵**,不可互相污染。
- `[PASS]` 判定要寬容(AI 可能回 `[PASS]` 前後帶空白/標點),但也別把正常回覆裡剛好提到 PASS 的誤判 —— 以「整則 trim 後就是 `[PASS]`」為準。
- 每則訊息最多 2 次 cc-bridge 呼叫,訂閱額度可控;但若 Rae 狂發訊息仍會累積 —— 屬正常用量。
