# 群聊區 — Markdown 渲染 + 圖片附件 — 設計文件

> 日期：2026-05-22
> 狀態：設計待 Rae 審閱
> 前置：群聊區（`2026-05-22-claude-codex-group-chat-design.md`）已上線

## 一、背景與動機

群聊區 v1 為求精簡，沒把單人房間（Claude / Codex 的房間）兩個既有功能移植過來：

1. **Markdown 渲染** —— 群聊氣泡用 `textContent` 純文字塞，AI 回覆裡的 `**粗體**`、清單、程式碼框、表格全變生文字。單人房間有 `_claudeMarkdownToSafeHtml`（showdown → DOMPurify → hljs）把它渲染好。
2. **圖片 / 附件** —— 群聊 `ChatGroup.sendUserMessage` 只收一個 `text` 參數，沒有附件管線；輸入列那顆 📎 在群聊模式是裝飾。

本功能把這兩個補齊，讓群聊跟單人房間平手。

## 二、需求決策（已與 Rae 對齊）

| 項目 | 決定 |
|---|---|
| Markdown 來源 | 重用單人房間 `_claudeMarkdownToSafeHtml`，從 `chat_room.js` export，不重寫 |
| 使用者訊息渲染 | Rae 的氣泡維持純文字（同單人房間，使用者訊息不渲染 markdown） |
| streaming 期間 | 維持純文字，串流結束最後一次才轉 markdown（每 chunk 重渲染會閃） |
| 圖片顯示 | 氣泡內**直接顯示縮圖**，點一下放大；非圖片檔顯示 📎 chip |
| 圖片儲存 | base64 縮圖（≤720px）存進 transcript —— 重載後仍在、不動 cc-bridge |
| 附件範圍 | 任何檔案（沿用單人房間管線：圖 / pdf / 程式碼 / 文字…），圖檔多做縮圖 |
| AI 收附件 | 兩個 AI 都收得到（cc-bridge claude / codex 路徑都已處理 `attachments`） |

## 三、Part 1：Markdown 渲染

### 3.1 重用單人房間的渲染器

`chat_room.js` 的 `_claudeMarkdownToSafeHtml(text)` 目前是 IIFE 內私有函式。**export 成 `VoidClaudeRoom.markdownToSafeHtml`**。它的行為：showdown 轉 HTML → DOMPurify sanitize → 後處理（input 只留 disabled checkbox、hljs 套語法高亮）→ 回安全 HTML 字串；showdown / DOMPurify 沒載入則回 `null`。

### 3.2 群聊套用

群聊 `chat_group.js` 新增一個共用 helper `_setBubbleContent(bubbleEl, speaker, content)`：

- `speaker === 'rae'` → `bubbleEl.textContent = _stripForDisplay(content)`（純文字）。
- AI（claude / codex）→ 若 `window.VoidClaudeRoom.markdownToSafeHtml` 可用且回非 null → `bubbleEl.innerHTML = <該 HTML>` 並加 class `cg-bubble-md`；否則 fallback `textContent`。
- 餵進去的 content 一律先過 `_stripForDisplay`（剝 panel / 遊戲標記）再渲染。

套用點兩處：

1. **`_renderBubble`** —— 目前 `b.textContent = _stripForDisplay(content)` 改成呼叫 `_setBubbleContent(b, speaker, content)`。涵蓋 hydrate（重進群聊時整條 transcript 重渲染）。
2. **`_runTurn` 的最終渲染** —— 串流期間 `onProgress` 維持 `bubbleEl.textContent = _stripForDisplay(acc)`（純文字、不變）；串流結束、要落定 `displayText` 那一步，改成 `_setBubbleContent(bubbleEl, provider, result.reply)`。

### 3.3 CSS

`chat_window.css` 補 `.cg-bubble-md` 底下 markdown 元素的樣式（`h1~h6` / `ul ol li` / `pre code` / `table` / `blockquote` / `a`），對齊單人房間 `.claude-bubble-md` 的觀感。實作時可重用單人房間既有規則（共用 class 或複製選擇器），細節留實作計畫。

## 四、Part 2：圖片 / 附件

### 4.1 待送附件狀態

`chat_group.js` 新增模組變數 `_pendingAttachments = []`。每筆：

```
{ path, filename, mime, size, thumb }   // thumb：圖檔才有，base64 data URL
{ _uploading:true, filename, mime, size }   // 上傳中的 placeholder
```

### 4.2 選檔 → 上傳 → 縮圖

`ChatGroup.handleFilePick(fileList)`：

1. 每個檔先 push 一筆 `_uploading` placeholder、渲染 chip 列。
2. 呼叫 `window.ClaudeTerminal.uploadFiles(fileList)`（沿用單人房間用的同一個上傳接口 → cc-bridge `/v1/upload`，回 `{path, filename, mime, size}`）。
3. 圖檔（`mime` 以 `image/` 開頭）→ 用 `<canvas>` 把原圖縮到長邊 ≤720px、`toDataURL('image/jpeg', 0.82)` 產 base64 縮圖，填進該筆的 `thumb`。
4. 用 server 回傳的真實 metadata 取代 placeholder，重渲染 chip 列。
5. 上傳失敗 → 拔掉該 placeholder + 一行錯誤系統提示。

### 4.3 輸入框上方的待送附件列

群聊輸入列上方一條 `#cg-attach-row`（沿用單人房間 `.claude-attach-chips` 不會撞 —— 群聊用獨立 id / class）：

- 圖檔 → 小縮圖（`<img src=thumb>`，≤56px 高）+ × 移除鈕。
- 非圖檔 → `📎 檔名` chip + × 移除鈕。

### 4.4 送出

`ChatGroup.sendUserMessage` 簽名改為 `sendUserMessage(text, attachments)`，`attachments` 省略時為空：

- 送出時快照 `_pendingAttachments` 裡「有 `path`」的（排除上傳中 placeholder），清空 pending、重渲染空 chip 列。
- 允許「只有附件、沒文字」也能送（`text` 空但有附件 → 照送）。
- Rae 的 transcript entry 帶上 `attachments`：`{speaker:'rae', content:text, ts, attachments:[{path,filename,mime,size,thumb}]}`。

### 4.5 氣泡顯示附件

`_renderBubble` 在文字氣泡之後，若該 entry 有 `attachments`：

- `mime` 以 `image/` 開頭且有 `thumb` → `<img class="cg-attach-img" src=thumb>`，點擊 → 簡單全螢幕 overlay 放大顯示該縮圖。
- 否則 → `📎 檔名` chip（沿用 `_attachIcon` 風格）。

hydrate 時整條 transcript 重渲染 → 圖片從存下來的 `thumb` 顯示（重載後仍在）。

### 4.6 把附件傳給 AI

關鍵：傳話人 / 增量模型下，附件要隨「增量」送到 AI。

- 新增 `_collectDeltaAttachments(provider)` —— 跟 `_buildDelta` 同樣的範圍（`_seen[provider]+1 .. transcript 末端`、非該 provider 自己的 entry），把所有 `rae` entry 的 `attachments` 收集成一個扁平陣列，**每筆只取 `{path, filename, mime, size}`（去掉 `thumb`，cc-bridge 不需要 base64）**。
- `_runTurn` 呼叫 `sendGroup` 時，多帶 `attachments: _collectDeltaAttachments(provider)`。
- `claude_terminal.js` 的 `sendGroup` 簽名加 `opts.attachments`；若非空 → `body.attachments = opts.attachments`。cc-bridge 的 `/v1/chat/completions` 本來就讀 `body.get("attachments")`，claude 與 codex 兩條路徑都會把附件路徑注入 prompt（「Rae 附了以下檔案，請用 Read 讀取」）。
- 因為 `_seen` 每輪前進，同一個附件對同一個 AI 只會在它第一次涵蓋到的回合送一次，不重送。
- 遊戲進行中 Rae 發圖 → `sendUserMessage` 的 `if (_game)` 分支照樣把帶附件的 entry 推進 transcript，跑著的遊戲迴圈下個 AI 回合的 `_collectDeltaAttachments` 自然帶到。

## 五、程式結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `core/chat_room.js` | 修改 | export `VoidClaudeRoom.markdownToSafeHtml`（既有 `_claudeMarkdownToSafeHtml`） |
| `core/chat_group.js` | 修改 | `_setBubbleContent`（markdown）；`_pendingAttachments` + `handleFilePick` + 縮圖；chip 列渲染；`sendUserMessage(text, attachments)`；transcript 存附件；`_collectDeltaAttachments`；`_renderBubble` 顯示附件；放大 overlay |
| `core/claude_terminal.js` | 修改 | `sendGroup` 加 `opts.attachments` → `body.attachments` |
| `core/chat_window.js` | 修改 | 群聊模式把 📎 按鈕接到 `ChatGroup.handleFilePick`；顯示 `#cg-attach-row` |
| `css/chat_window.css` | 修改 | `.cg-bubble-md` markdown 樣式；`.cg-attach-row` / `.cg-attach-img` / 附件 chip / 放大 overlay 樣式 |

## 六、錯誤處理

- 上傳失敗 → 拔 placeholder + 一行系統提示，不影響已在 pending 的其他檔。
- `markdownToSafeHtml` 回 `null`（showdown / DOMPurify 未載入）→ fallback 純文字，不報錯。
- 縮圖失敗（壞圖 / canvas 例外）→ 該筆不帶 `thumb`，氣泡退回 📎 chip 顯示；附件仍照常上傳給 AI。
- 圖片 `thumb` 絕不送進 cc-bridge（只送 `path`）—— 避免 base64 灌爆請求。

## 七、不在本次範圍

- AI 主動發圖到聊天（它們已有畫布 `LP.image`）
- 原圖全尺寸存 transcript（只存 ≤720px 縮圖，省 IndexedDB）
- 圖片編輯 / 裁切 / 多圖拼貼
- 拖放上傳、貼上上傳（v1 只走 📎 點選；之後可加）
- 單人房間附件改動（單人房間維持現狀）

## 八、風險與注意

- **IndexedDB 肥大**：縮圖 base64 進 transcript，每張約 50–150KB。長期累積會長，但對個人工具可接受；真的太肥再做清理 / 降畫質。
- **群聊 vs 單人房間的 DOM id**：附件列 / chip 用群聊專屬 id / class（`cg-` 前綴），不可撞單人房間的 `claude-attach-*`。
- **markdown 與標記剝離順序**：一律先 `_stripForDisplay` 剝乾淨，再餵 markdown —— 避免 `[MOVE]` 之類殘留被當成文字渲染。
- **streaming 期間純文字**：串流中若直接渲染 markdown 會逐字閃爍，必須維持「串流純文字、結束才 markdown」。
- **附件去重**：`_collectDeltaAttachments` 依賴 `_seen` 正確前進；`_seen` 算錯會讓附件漏送或重送。
