# 群聊區通用畫布 — 設計文件

> 日期：2026-05-22
> 狀態：設計待 Rae 審閱
> 前置：建立在群聊區（`2026-05-22-claude-codex-group-chat-design.md`）+ 浮窗系統之上

## 一、背景與動機

Rae 想要群聊區能玩互動的東西 —— 跟 Claude/Codex 下棋、看它們對弈、讓它們展示 HTML 網頁、以後各種小工具。重點是**通用化**:不要一個一個硬寫功能,而是綁好一組 host 接口,AI 直接生 HTML 來調用 —— 「以後有什麼,它們直接出就好」。

關鍵發現:這套機制專案**已有雛形** —— 大廳的 `VoidCanvas` / `LobbyPanelAPI`。AI 在回覆裡吐 `<lobbyPanel>{html,css,js}</lobbyPanel>` → 引擎渲染、跑 JS、注入一個 `LP` host 物件供調用。本功能 = 把這套搬進群聊區,並把 `LP` 後端從計費 API 改路由到**訂閱**(cc-bridge)。

## 二、需求決策（已與 Rae 對齊）

| 項目 | 決定 |
|---|---|
| 畫布位置 | 群聊浮窗的**上方容器**（單人房間那塊放背景+立繪;群聊本來空著）。可收合 |
| 收合行為 | 平常收起 → 聊天串撐滿;AI 產出畫布內容 → 上方展開、聊天串縮下面 |
| AI 怎麼產畫布 | 沿用大廳 marker:回覆裡放 `<lobbyPanel>{title,html,css,js}</lobbyPanel>` |
| host 接口 `LP` | 形狀照大廳（chat / move / image / close），後端改走**訂閱 cc-bridge** |
| 對弈 | `LP.move` 可指定 Claude / Codex 走 → Claude vs Codex 對棋,Rae 觀戰 |
| 範圍 v1 | **只群聊區**。單人房間維持立繪,以後再說 |
| 通用性 | 未來要新能力 → 加一個 `LP.xxx`,AI 的 HTML 即可調用 |

## 三、畫布區（UI）

群聊浮窗 `#cw-body` 的最上方加一個畫布區 `#cw-canvas`（單人房間模式不顯示 —— 它們用立繪區）。

- **收合狀態**（預設、無畫布時）：`#cw-canvas` 隱藏,`#claude-chat-stream` 撐滿整個窗身。
- **展開狀態**（有畫布時）：`#cw-canvas` 顯示在頂部（佔約 45% 窗高,內含畫布內容），聊天串縮到下半。
- 畫布區頂端一條 bar:標題 + 「收合」鈕(縮回收合狀態,內容保留)+「✕ 關閉」(清掉畫布)。收合後留一條細 tab,點了重新展開。
- 同時只有一個畫布(v1 不做多畫布堆疊)。新畫布取代舊的。

## 四、AI 產畫布的流程

1. AI（Claude / Codex）在群聊回覆裡吐 `<lobbyPanel>{ "title", "html", "css", "js" }</lobbyPanel>`。
2. `chat_group.js` 收到回覆後,用 `VoidCanvas.parseLobbyPanel()`（已匯出、可共用）解析。
3. 解析到 → 把 marker 從氣泡文字剝掉(氣泡只顯示 AI 的對話文字)→ 把 panelData 交給 `ChatCanvas.render(panelData)`。
4. `ChatCanvas` 渲染:注入 CSS、`innerHTML` 塞 HTML、`new Function('container','LP', js)` 跑 JS、`rewireOnclicks` 重綁 onclick —— 跟 `VoidCanvas` 同一套(解析器與 rewire 直接共用 `VoidCanvas` 匯出的)。
5. 畫布區展開。

群聊系統提示加一段「畫布能力說明」:告訴 AI 可以用 `<lobbyPanel>` 產互動畫布、panel 的 JS 能調用哪些 `LP` 方法、以及 marker 格式。

## 五、host 接口 `LP`（綁好的接口）

`chat_canvas.js` 自己做一個 `_makeChatPanelAPI()`,形狀對齊大廳 `LobbyPanelAPI`,但**後端換成訂閱**:

| 接口 | 行為 | 後端 |
|---|---|---|
| `LP.chat(text, opts)` | panel 向 AI 問一句、回純文字 | cc-bridge 訂閱(`opts.provider` 指定 claude/codex,預設 claude) |
| `LP.move(board2d, opts)` | 回合制棋盤落子,回 `{row,col,line}` | cc-bridge 訂閱;`opts.provider` 指定哪個 AI 走 |
| `LP.image(prompt, type)` | 生圖,回圖片 URL | `OS_IMAGE_MANAGER`（圖片 API,與訂閱無關） |
| `LP.close()` | 收合 / 關閉畫布 | — |

- `LP.chat` / `LP.move` 走一個**通用 cc-bridge 送訊息入口**（見 §六:`ClaudeTerminal.sendRaw`）—— 指定 provider + 自帶的 messages（含各自的 system prompt:`LP.move` 自己組「棋局 + 落子格式」prompt,跟群聊 prompt 無關），不綁多會話 conv 系統。
- `LP.move` / `LP.chat` 預設**無狀態**:每次呼叫獨立(棋局狀態靠傳入的 board 帶,不需 session resume)。簡單、夠用。
- 未來要加能力(例如 `LP.search`、`LP.saveState`)→ 加進 `_makeChatPanelAPI`,AI 的 HTML 立即可調用。

## 六、程式結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `core/chat_canvas.js` | 新建 | `window.ChatCanvas` —— 畫布區 UI（收合/展開）+ 渲染（共用 `VoidCanvas` 解析器）+ 訂閱版 `LP` |
| `core/chat_window.js` | 修改 | 群聊模式 `#cw-body` 頂部加 `#cw-canvas` 容器;收合/展開狀態管理 |
| `core/chat_group.js` | 修改 | AI 回覆後偵測 `<lobbyPanel>` marker → 剝掉 + 交給 `ChatCanvas.render` |
| `core/claude_terminal.js` | 修改 | `GROUP_SYSTEM_PROMPT` 加畫布能力說明;新增 `ClaudeTerminal.sendRaw(provider, messages, onProgress)` —— 通用 cc-bridge 送訊息（不綁 conv、不強制 system prompt） |
| `css/chat_window.css` | 修改 | 畫布區收合/展開、bar、內容區樣式 |
| `index.js` / `index.html` | 修改 | 登記 `chat_canvas.js` |

`sendRaw` 是 `sendGroup` 的通用化版本（任意 messages、任意 provider）。實作時:`sendGroup` 可改成呼叫 `sendRaw`（DRY），或 `sendRaw` 獨立、`sendGroup` 不動 —— 視改動風險定。

## 七、對弈（Claude vs Codex 觀戰）

棋盤 panel 的 JS 自己跑對弈迴圈:`LP.move(board, {provider:'claude'})` 拿 Claude 的一步 → 落子 → `LP.move(board, {provider:'codex'})` 拿 Codex 的一步 → 落子 → 輪流。Rae 在群聊看。

玩家換位（Rae vs Claude、Rae vs Codex、Claude vs Codex）= panel 自己決定哪一方由 `LP.move` 代打、哪一方等 Rae 點棋盤。host 不綁死,panel 的 JS 控制。

## 八、不在本次範圍

- 單人 Claude / Codex 房間的畫布 —— v1 只群聊
- 多畫布同時並存 / 畫布歷史 —— v1 單一畫布,新的取代舊的
- JSX / React 畫布（需瀏覽器內 transpile）—— v1 只純 HTML/CSS/JS
- 畫布狀態跨重載持久化 —— v1 重載畫布消失（聊天歷史保留）
- 新增 `LP` 以外的能力接口（search 等）—— 以後按需加

## 九、風險與注意

- **`new Function` 跑 AI 生成的 JS** —— 這是 `VoidCanvas` 既有的運作方式,大廳已接受此信任假設（Rae 自己的 AI、自己用）。群聊畫布同理,不是 bug,是這套的本質。沿用、不額外加沙箱。
- `LP.move` 的 provider 路由:群聊裡要明確指定 claude / codex,別讓兩個都跑或跑錯。
- `<lobbyPanel>` JSON 常被 AI 寫壞 —— `VoidCanvas.parseLobbyPanel` 已有三層修復(直接 parse → 修換行 → 正則拆欄位),共用它即可。
- 畫布區展開時聊天串變矮 —— 確保聊天串仍可捲動、輸入列不被擠掉。
- `sendRaw` 與 `sendGroup`／`_sendCcBridge` 不可互相污染 session 或 conv 狀態。
