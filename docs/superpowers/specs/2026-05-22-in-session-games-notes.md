# 群聊區「真・對弈」/ 同 session 遊戲 — 待做設計筆記

> 日期：2026-05-22（記錄,待下個 session 接手）
> 狀態：方向已與 Rae 對齊,尚未 brainstorm / 實作

## 為什麼有這份筆記

今天做完了浮窗系統 → 群聊區 → 通用畫布（都已 commit 在 main）。畫布裡用 `LP.move`
讓 Claude/Codex 下棋 —— 但 `LP.move` 走的是 `ClaudeTerminal.sendRaw`,**無 session、
丟完即棄的獨立呼叫**。

Rae 的判斷（正確）:**不同 session 玩棋根本沒意義** —— 那盤棋不是群聊裡那個會嘴人的
Codex、會裝深沉的丹本人在下,只是借 claude/codex 後端跑的兩串無名 API。它們沒參與、
不記得、玩完也不能在群裡互嗆。

所以「畫布 v1」的 `LP.move` 那套（分 session 對弈）方向錯了,要重做。

## 對齊好的方向：遊戲在群聊 session 裡

1. **棋步用標記、走群聊 session。** AI 在自己**正常的群聊回覆**裡吐 `[MOVE|7,7]` 之類的
   標記（同 `[PASS]` / `[ASK]` / `<lobbyPanel>` 的機制）。標記透過 `sendGroup`（resume）
   進它們各自的群聊 session → 它們真的在玩、真的記得、玩完能在群裡講評互嗆。
2. **畫布變被動 viewer。** `ChatGroup` 解析 `[MOVE]` 標記 → 餵給畫布顯示棋盤。
   畫布不再自己跑 AI 迴圈（現在的 `LP.move` 那套移除）。
3. **群聊需要「自動多輪」。** 一盤棋二三十步,不可能要 Rae 打二十次字。遊戲開始後,
   Claude/Codex 要**自己輪流下、不等使用者**,直到遊戲結束。必須有**回合上限**
   （安全閥,防無限迴圈 + 訂閱額度爆掉）。
4. **遊戲起訖**:某個 AI 吐 `<lobbyPanel>`（棋盤）+ 一個「開局」信號啟動;結束時 AI 發
   結束信號（標記 / 或停止吐 move）→ 退出自動多輪、回到一般群聊,AI 可講評（它們記得這盤棋）。

## 保留 / 替換

- **保留可用**:`sendGroup` / `sendRaw` / `_ccBridgePost`(+ 排隊)、畫布渲染引擎
  （`chat_canvas.js` 的 render + 共用 `VoidCanvas` 解析）、`LP.chat` / `LP.image` /
  `LP.close`、畫布區 UI（`#cw-canvas` 收合/展開）。
- **替換 / 移除**:`LP.move`（分 session 對弈）→ 改成標記驅動。
- 之前提的「小橋 `LP.report`」**收回** —— 那只是給沒意義的東西貼成績單,治標。

## 相關：自喚醒（也擱著）

「自喚醒」（沒人發話時,骰子 → AI 主動開口）跟「自動多輪」是同一家族的編排問題。
兩個可以一起設計。

## 下個 session 怎麼接

1. `git status` 看殘局（Rae 常多 session 平行做事）。
2. 讀這份筆記 + 今天的兩份設計文件:
   - `docs/superpowers/specs/2026-05-22-claude-codex-group-chat-design.md`
   - `docs/superpowers/specs/2026-05-22-chat-canvas-design.md`
3. 正式 brainstorm「同 session 真・對弈」（標記驅動 + 自動多輪 + 回合上限）→ spec → plan → 實作。
4. 相關檔案:`core/chat_group.js`（編排）、`core/chat_canvas.js`（畫布）、
   `core/claude_terminal.js`（`sendGroup` / `sendRaw`）。

## 今天已完成（都在 main）

- 浮窗系統(Claude/Codex 獨立浮窗 + 子面板)、群聊區、通用畫布 —— 全部 commit 完。
- 群聊畫布 v1 可用:AI 吐 `<lobbyPanel>` 產互動 HTML、`LP` 接口走訂閱。
  純 HTML 展示 / 工具仍 OK;只有「分 session 對弈」這塊待重做。
