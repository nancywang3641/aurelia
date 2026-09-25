# 奧瑞亞程式碼健檢報告（雲端，只讀）

- 基準版本：`main` @ `a3b1ae4`
- 範圍：全部 `.js`，共 188 個檔、約 129,000 行（根目錄、`core/`、`core/void/`、`os_phone/` 底下全部）
- **這次沒有改任何程式碼**，只新增了這一份報告。

## 怎麼查的

1. **每一個檔都從頭讀到尾**：9 個子代理分頭讀，每份都附上已讀檔案清單。碰到跨模組呼叫，就去對方檔案確認函式真的存在。
2. **機械式全掃**：用 ESLint 找沒定義的變數、重複的 key、重複宣告、沒用到的變數；用語法樹掃出每一個 `localStorage.setItem`、`innerHTML +=`、`.focus()`、`scrollIntoView()`、`addEventListener`，加上 IndexedDB 的 `getAll()`；再用全倉庫比對名字的方式找出沒人呼叫的函式。
3. **抽查**：每份子報告挑最嚴重的幾條，我自己回頭對過原始碼。對不上的已經刪掉或降級了。

**確定度**
- **確定**：程式路徑讀得很清楚，符合條件就一定會出錯。
- **可能**：要剛好碰上某個時序或某種資料才會出錯。
- **懷疑**：看起來不對，但要看執行環境或外部 API 的實際行為才知道。

**嚴重度分級**：🔴 資料遺失 ＞ 🟠 畫面整個壞掉 ＞ 🟡 功能失效（按了沒反應，或靜靜地沒生效）＞ ⚪ 小問題

依照要求不寫行號，只寫檔案和函式名稱，在檔案裡搜尋函式名就找得到。

---

## 目錄

- [總覽：最該先修的 15 條](#總覽最該先修的-15-條)
- [第 1 類：明顯 bug（依嚴重度）](#第-1-類明顯-bug依嚴重度)
  - [🔴 資料遺失](#-資料遺失)
  - [🟠 畫面壞掉](#-畫面壞掉)
  - [🟡 功能失效](#-功能失效)
  - [⚪ 小問題](#-小問題)
- [第 2 類：IndexedDB 圖片 store 用 getAll() 一次讀全部](#第-2-類indexeddb-圖片-store-用-getall-一次讀全部)
- [第 3 類：localStorage.setItem 沒包 try/catch](#第-3-類localstoragesetitem-沒包-trycatch)
- [第 4 類：innerHTML += 追加](#第-4-類innerhtml--追加)
- [第 5 類：focus() / scrollIntoView() 沒防捲動](#第-5-類focus--scrollintoview-沒防捲動)
- [第 6 類：同一件事寫了好幾份、內容已經不一致](#第-6-類同一件事寫了好幾份內容已經不一致)
- [第 7 類：死碼（只列出，沒刪）](#第-7-類死碼只列出沒刪)

---

## 總覽：最該先修的 15 條

| # | 檔案 · 函式 | 一句話 | 確定度 |
|---|---|---|---|
| D1 | `os_phone/rpg/state_runtime.js` ＋ `os_db.js` · `saveStateData` | `base` 從來沒存進 DB，超過 80 輪或按過深度整理之後，一刪樓或 swipe，狀態欄位就整個被刪掉 | 確定 |
| D2 | `os_phone/wx/wx_core.js` · `triggerReply` | AI 回覆還沒回來就切到別間聊天室，A 間的整份紀錄會蓋掉 B 間 | 確定 |
| D3 | `os_phone/os/os_phone_image.js` · `generate` | NovelAI 生的圖存成 `blob:` 網址，重整後變破圖，而且原本的描述已經被蓋掉 | 確定 |
| D4 | `os_phone/os/os_vector_engine.js` · `ingestEntries` | 副模型失敗時，那一章的舊記憶已經先刪掉，新的也沒寫進去 | 確定 |
| D5 | `os_phone/os/os_backup.js` · `LS_BACKUP_KEYS` | 備份清單列的是沒人用的舊 key，真正的書架、人設、書包、條件規則都沒備份到 | 確定 |
| D6 | `core/void_terminal.js` · `_currentChatId` | 換了聊天室，大廳還是上一間的瀅瀅對話，一開口就把新聊天室的紀錄蓋掉 | 確定 |
| D7 | `os_phone/wx/wx_message_manager.js` ＋ `wx_cards.js` | 刪掉中間一則訊息，後面已收款的紅包和轉帳都變回待收，可以再收一次錢 | 確定 |
| D8 | `os_phone/os/os_db.js` · 大部分寫入 | 交易只設了 `oncomplete`，空間滿或資料庫升版時 await 永遠卡住，也沒有錯誤提示 | 確定（卡住）／可能（觸發） |
| F1 | `os_phone/os/os_studio.js` · `_studioConfirmRetry` | 出錯就立刻自動重試，沒有上限，金鑰錯或斷網時會一直燒額度 | 確定 |
| F2 | `core/void_terminal.js` · `renderHistoryList` | `isClaude` 沒有定義，瀅瀅／柴郡的對話歷史碰到第一則 AI 回覆就停住 | 確定 |
| F3 | `os_phone/rpg/blacklist_injector.js` | 讀寫兩邊的 chatId 規則不一樣，酒館版黑名單從來沒注入過 | 確定 |
| F4 | `core/void/lobby_stage.js` · `_loadCfg` | 廣場上鎖時，占卜小屋和帽匠工坊唯一的門被濾掉，走不出去 | 確定 |
| F5 | `os_phone/os/os_dialer.js` · `_afterCall` | 從微信撥號後掛斷，電話還會繼續打 API、念台詞，甚至在背景開麥克風 | 確定 |
| F6 | `os_phone/vn_story/vn_tts_panel.js` | 分頁改名後 `_renderBody('models')` 沒有對應的分支，「＋新增模型」按了沒反應 | 確定 |
| F7 | `os_phone/os/os_api_engine.js` · `_wxLoreEntryText` | 呼叫不存在的 `OS_WORLDBOOK.getEnabledEntries`，PWA 版私聊人設選的世界書條目永遠送不出去 | 確定 |

---

## 第 1 類：明顯 bug（依嚴重度）

### 🔴 資料遺失

**D1. 狀態資料庫從來不存 `base`，回溯時欄位被整個刪掉**
- 檔案：`os_phone/rpg/state_runtime.js`（`trimPatches`、`deepConsolidate`、`_migratePatches`、`_rollbackPatches`）＋ `os_phone/os/os_db.js`（`saveStateData`）
- 什麼情況：patches 超過 80 筆時，最舊的幾筆會折進 `base`；「深度整理」會把整份狀態搬進 `base`，再清空 patches。問題是 `saveStateData` 組存檔物件時只收 `schema/patches/current/npcLedger/npcDossiers/director` 六欄，**沒有 `base`**。之後刪樓或 swipe 觸發 `_rollbackPatches`，拿 `data.base`（undefined）當基準重算，某個欄位的舊值如果只存在 base 裡，程式會判斷成「這個 patch 第一次引入這個欄位」，把它 `_deleteDeep` 掉。
- 使用者會看到：跑了很多輪或按過深度整理之後，刪一則訊息或 swipe，金錢、角色狀態這類欄位直接消失，而不是退回上一輪的值。
- 確定度：**確定**（抽查過 `saveStateData` 的存檔物件，確實沒有 base）

**D2. 微信 AI 回覆還沒回來就切聊天室，會蓋掉另一間的紀錄**
- 檔案：`os_phone/wx/wx_core.js`（`triggerReply` 裡的 `onFinishReply`、`onQueued`；`parseAndProcess`、`_parseRoomLines`）
- 什麼情況：存檔寫的是 `saveApiChat(GLOBAL_ACTIVE_ID, currentChat)`，用的是「當下」開著的那間，不是這一輪發話的那間。`openChat` 沒有被 `IS_STREAMING_REPLY` 擋住。托管那條路（`_applyRelayReply`）有先借用 id、用完還回去，這條路沒有。
- 使用者會看到：送出訊息後切到 B 間，A 間的整份紀錄會寫進 B 的存檔位置，B 原本的紀錄就沒了，A 的泡泡也畫進 B 的畫面。如果是退回聊天列表（id 是 null），put 會失敗，A 這輪的回覆沒存到，重整就不見了。
- 確定度：**確定**

**D3. NovelAI 插圖存成 `blob:` 網址，重整後變破圖，而且生不回來**
- 檔案：`os_phone/os/os_phone_image.js`（`makeUrl`、`generate`）＋ `os_phone/os/os_image_manager.js`（`_genNovelAI`）；寫回的地方在 `wx_core` 的 `setImageUrl`、`wx_moments` 的 `onDone('wxmo')`、`wb_core` 的 `setImageUrl`
- 什麼情況：`_genNovelAI` 回傳的是 `URL.createObjectURL(...)`，`generate` 原樣交給各 app 寫回資料庫：微信是把 `[图片:描述]` 換成網址，微博和朋友圈是把 `src` 換掉。
- 使用者會看到：插圖接口是 NovelAI 時，重新整理後圖全破。`isUrl` 認得 `blob:`，所以不會退回「展開圖片」卡片，原本的描述也已經被網址蓋掉，沒辦法再生一次。
- 確定度：**確定**（前提是插圖接口選 NovelAI）

**D4. 向量記憶：重抽失敗時，那一章的記憶整段消失**
- 檔案：`os_phone/os/os_vector_engine.js`（`ingest` → `ingestEntries`，搭配 `_extractMemories`）
- 什麼情況：`ingestEntries` 一開頭就 `deleteVnMemoriesByChapter`，之後才檢查 `entries.length`。而 `_extractMemories` 在副模型報錯、逾時或 JSON 解析失敗時一律回 `[]`。
- 使用者會看到：改稿、重生或重 roll 某一章時，只要副模型出錯一次，那一章的劇情記憶就整段沒了，之後召回也找不到。
- 確定度：**確定**

**D5. 備份清單列錯 key，真正的資料沒備份到**
- 檔案：`os_phone/os/os_backup.js`（`LS_BACKUP_KEYS`、`collectDB`）
- 什麼情況：清單裡的 `os_worldbook_cats`、`os_persona_data`、`os_economy_data`，全倉庫沒有任何程式在讀寫。真正在用、卻沒被備份的有：`os_worldbook_books`（書包清單）、`os_personas`（人設）、`aurelia_custom_worlds`（書架上的書）、`avs_condition_rules`、`aurelia_rules_tavern`，以及每本故事的 `avs_state_<storyId>`。IndexedDB 那邊也漏了 `state_data`、`vn_memories`、`phone_apps`、`app_data`。檔頭卻寫著「100% 包含 AVS」。
- 使用者會看到：在新裝置用全量備份還原後，書架、人設、世界書書包、條件規則、各故事的狀態數值、向量記憶、創作室做的 app 全部不見。
- 確定度：**確定**（抽查過，那三個 key 全倉庫只出現在備份清單裡）

**D6. 大廳換了聊天室還是舊對話，一開口就把新聊天室的紀錄蓋掉**
- 檔案：`core/void_terminal.js`（`_currentChatId`、`onShow`、`saveLobbyHistory`、`createTab`）
- 什麼情況：`_currentChatId` 只有在讀到大廳存檔時才會被設定。唯一另一個會設定它的是 `core/void/login.js` 的 `showLoginScreen`，但全倉庫沒有人呼叫這個函式。所以第一個聊天室如果沒有大廳存檔，它就一直是 null，而 `onShow` 判斷換聊天室的條件 `if (_currentChatId && ...)` 永遠不成立。`saveLobbyHistory` 存檔時又用 `_currentChatId || getChatId()`，存到的是新的 chatId。
- 使用者會看到：在 A 聊天室跟瀅瀅聊過，切到 B 再打開，看到的還是 A 的對話。接著一講話，A 的歷史就寫進 B，B 原本的大廳紀錄被蓋掉。
- 確定度：**確定**（觸發條件：第一個打開的聊天室本來沒有大廳存檔）

**D7. 刪一則訊息，後面已收款的紅包和轉帳都變回待收**
- 檔案：`os_phone/wx/wx_message_manager.js`（`deleteSelectedMessages`、`purgeProtocolState`）＋ `os_phone/wx/wx_cards.js`（`findByAlias`、`removeByAliases`）＋ `wx_view.js` 的 `_CARDS.adopt(..., msgIndex)`
- 什麼情況：卡片的 slot 綁的是「第幾則訊息」（msgIndex）。刪掉中間一則，後面每則的 index 都少 1，`findByAlias` 找不到對應的卡，就 attach 一張新的待處理卡。另外，`removeByAliases` 會把同一個單號的卡全部刪掉，包括畫面上還留著的那幾則。
- 使用者會看到：刪訊息之後，後面已收款或已領完的卡又變回「待收款」「領取紅包」，可以再按一次收款讓錢包再加一次錢；模型的待處理清單也會重新列出這些卡。
- 確定度：**確定**

**D8. os_db 大部分寫入在失敗時會讓 await 永遠卡住**
- 檔案：`os_phone/os/os_db.js`
- 什麼情況，分三種：
  - **甲**：寫入只設了 `tx.oncomplete`，沒有 `onerror` 也沒有 `onabort`。包括 `saveApiChat`、`deleteApiChat`、`saveWbPost`、`saveWorldData`、`saveLobbyHistory`、`saveWorldbookEntry`、`saveVnChapter`、`saveGrandSummary`、`saveVnMemory`、`saveVarPack`、`deleteVn*ByStoryId`、`deleteVnMemoriesByChapter`，還有其他幾十支。
  - **乙**：有 `onerror` 但沒有 `onabort`。包括 `saveStateData`、`saveAppData`、`saveImage`、`saveTavernSummary`、`savePhoneApp`、`deleteAllByChatId` 裡的 `_purge` 等。空間滿（QuotaExceeded）通常是以 abort 結束交易，只設 onerror 接不到。
  - **丙**：讀取只設了 `req.onsuccess`。
  - 全檔只有 `saveUITemplate` 和 `deleteUITemplate` 寫了 `tx.onerror = tx.onabort`。
- 使用者會看到：空間滿，或另一個分頁升級了資料庫版本時，存檔的 Promise 永遠不會結束。呼叫端寫的 `try { await ... } catch {}` 等不到錯誤，await 後面的程式整段不跑，畫面也沒有任何提示。日誌的「清空這段劇情」會永遠停在「清除中…」。
- 另外：`deleteAllByChatId` 呼叫的 `self.clearInvestigationState` 在 os_db 裡不存在，那一項報告顯示「ok」，其實什麼都沒清。
- 確定度：卡住是**確定**的；觸發條件（空間滿、版本升級）是**可能**

**D9. 狀態追蹤和 NPC 檔案並行寫入，互相蓋掉（PWA）**
- 檔案：`os_phone/rpg/state_runtime.js`（`extractOnce`）＋ `os_phone/rpg/npc_dossier.js`（`_pwaExtract`、`commit`）
- 什麼情況：同一個 `VN_CHAPTER_SAVED` 事件，800ms 後 npc_dossier 發一通副模型，1200ms 後 extractOnce 發另一通。extractOnce 在呼叫副模型**之前**就讀好 `data`，等 10 到 60 秒後，用這份舊 data 展開存回去。
- 使用者會看到：NPC 登場次數卡在舊值，NPC 檔案建不起來，或剛建好就消失。
- 確定度：可能

**D10. 抽取狀態時刪樓，回溯的結果被蓋回去（酒館版）**
- 檔案：`os_phone/rpg/state_runtime.js`（`extractOnce` 對 `_reconcilePatches`、`_rollbackPatches`）
- 什麼情況：原因跟 D9 一樣，extractOnce 手上拿的是抽取前的 `data.patches`。導演模式下抽取最長要 360 秒，這段時間內發生的回滾會被覆蓋掉。
- 使用者會看到：刪樓或 swipe 之後，狀態看起來回溯了，下一刻又跳回沒回溯的樣子。
- 確定度：可能

**D11. 世界書匯入同一個檔、換個名字，會把原本的書包搬空**
- 檔案：`os_phone/os/os_worldbook.js`（`importJSON`，奧瑞亞自家格式那條分支）
- 什麼情況：`entries.map(e => ({ ...e, book: newBookName }))` 保留了原本的 id，只有沒有 id 的條目才補新的。`saveWorldbookEntry` 用同一個 id 存，就把原條目蓋掉了。
- 使用者會看到：想用新名字複製一份書包時，原書包的條目全部被搬到新書包，原書包變空。
- 確定度：**確定**

**D12. 微信「AI 搜尋加好友」推薦到已經在的人，會用空紀錄蓋掉原本的聊天**
- 檔案：`os_phone/wx/wx_contacts.js`（`openSearchWindow` 成功回呼的最後一段）
- 什麼情況：`getOrCreateContactID` 回傳既有的 id 之後，程式還是無條件執行 `saveApiChat(chat.id, { messages: [] ... })`。GLOBAL_CHATS 那邊有先判斷「沒有才建」，DB 這段沒有判斷。
- 使用者會看到：那個人的聊天紀錄在 DB 裡被清空。記憶體裡的那份還在的話，下次存檔會補回來；但在那之前重整，紀錄就沒了。
- 確定度：**確定**（DB 被覆寫一定會發生，最後有沒有真的遺失要看時機）

**D13. 心跳和大總結拿舊副本整份寫回，蓋掉電話 app 剛寫的內容**
- 檔案：`os_phone/os/os_heartbeat.js`（`tickNow`）、`os_phone/wx/wx_summary.js`（`summarizeChat`、`_save`），對照 `os_phone/os/os_dialer.js`
- 什麼情況：心跳拿的是 `wxApp.GLOBAL_CHATS` 裡的記憶體副本，fire 之後 `saveApiChat(id, chats[id])` 整份覆寫。wx_summary 等副模型回覆（可能很久）之後，也是整份寫回。電話 app 是直接寫 DB，從來不更新 GLOBAL_CHATS。
- 使用者會看到：跟某人通過電話之後，那個人主動傳訊息或正好在做大總結，通話紀錄和 AI 對那通電話的記憶就不見了。
- 確定度：可能

**D14. 書架直接寫 `aurelia_custom_worlds`，寫入失敗時靜靜吞掉**
- 檔案：`os_phone/qb/qb_bookshelf.js`（`createCustomWorld`、`_saveWbPacks`、`_saveGreetings`、`_confirmDeleteWorld`），對照 `os_phone/os/os_card_import.js`（`_saveWorlds`）
- 什麼情況：同一個 key 有兩套寫法。card_import 碰到空間不足會先把封面縮小再重寫；書架這四處是 `try { setItem } catch(e) {}`，失敗就算了。角色卡封面很大，很容易撞到空間上限。
- 使用者會看到：新寫的書、剛改的開場白、剛掛上的館藏，當下看起來存好了，重新整理後就不見，完全沒有提示。
- 確定度：可能

**D15. 總結合併時，簡體標題的「注意规范」被當成普通文字，只留最新一輪**
- 檔案：`os_phone/os/os_story_tools.js`（`_mergeSection` 的 `MERGEKEY`）
- 什麼情況：MERGEKEY 有「注意規範」、繁簡兩版的「注意規範/記憶事項表」，就是沒有簡體的「注意规范」。所以簡體標題會掉到最後的「取新」分支，而增量總結的要求本來就是「只寫這次新增的部分」。舊的「關鍵狀態/記憶」區塊也是一樣的下場。
- 使用者會看到：累積下來的世界規範，每合併一次就被這一輪的幾條取代，之前確立的都不見了。
- 確定度：可能（要模板或 AI 輸出用簡體標題才會觸發）

**D16. 世界門背景流程拿著舊副本存檔，會蓋掉入隊、成就和生好的圖**
- 檔案：`os_phone/os/os_worldgate.js`（`_saveWorld` 是整份 `worlds[i] = w` 覆寫；`_fillArt`、「再召集」的 onOk、`_scanLaunchArt`、`_genLaunchArt`，對上 `joinTeam`、`_scanAchv`、`_dive`）
- 使用者會看到：已入隊的旅人又變回候選、世界成就沒記到、概念圖或方位圖不見。
- 確定度：可能（兩個流程時間重疊才會發生）

**D17. 世界門用名字找世界書條目，同名的世界會互相蓋掉或一起被刪**
- 檔案：`os_phone/os/os_worldgate.js`（`_writeEntry`、`_deleteEntry`、`_healthCheck`）
- 什麼情況：新世界還沒有 `entryUid` 時，用 comment 名稱去找條目；刪除也只按 comment 過濾。註解裡自己寫了「要用 uid」。
- 使用者會看到：出現同名世界時，舊世界的條目被新世界覆寫；刪掉其中一個，另一個的條目也跟著消失。
- 確定度：可能

**D18. 通話記憶用訊息 id 去重，同一則訊息裡的第二段通話被跳過**
- 檔案：`os_phone/vn_story/vn_phone.js`（`_flushCallMemory`）
- 什麼情況：去重鍵是 `_vnCallMsgId === msgId`。AI 把一通電話拆成兩個 `<call>`，或同一章跟同一個人打第二通，第二段都會被跳過。PWA 的 msgId 是 null，完全不去重，所以每重播一次章節就多寫一遍。
- 使用者會看到：酒館版的通話紀錄少了後半段；PWA 版同一通電話越重播越多。
- 確定度：**確定**

**D19. 書咖結算時寫回舊的菜單和紀錄**
- 檔案：`os_phone/os/os_cafe.js`（`_settleInner`）
- 什麼情況：一開始就讀出 menu、logs、npcs，中途 await 好幾通 API，最後整份寫回。結算在背景跑，這時窗口已經可以操作。
- 使用者會看到：結算還沒跑完時上架的新飲品、剛聽完的留言，結算一寫回就消失。
- 確定度：可能

**D20. 包租婆等副模型回覆後，用舊的 state 寫回**
- 檔案：`os_phone/os/os_landlord.js`（`hearViewing`、`hearMoveOut`）
- 使用者會看到：等待回覆期間按的「租給他」「送走」、改的招租設定，被整份蓋回去。
- 確定度：可能

**D21. 藍圖讀取失敗時當成空的，之後買東西會把整份清掉**
- 檔案：`os_phone/os/os_blueprints.js`（`_read` → `buy`、`makeCustom`、`migrateFurniture`）
- 什麼情況：`getAppData` 拋錯時回傳 `{ owned: [], custom: [] }`，呼叫端 push 一筆之後整份寫回。
- 使用者會看到：剛好讀取失敗的那一次買藍圖，之前買的和訂製的藍圖全部不見。
- 確定度：可能

**D22. PT 兌換先標記成已兌換，才入帳**
- 檔案：`os_phone/os/os_pt.js`（`evaluateAchievementsPT`、`settleSummary`、`addPT`）
- 什麼情況：
  - 先逐筆 `markRedeemed` 再 `addPT`，addPT 失敗時成就已經被標記了。
  - 用名字對應成就，名字稍有不同就對不上。
  - `settleSummary` 在 `_settling` 為真時直接 return，那一份之後也不會補結算。
- 使用者會看到：成就被收走了，PT 卻沒加；某一章大總結永遠沒有結算。
- 確定度：可能

**D23. 故事開場白含隨機巨集時，第 0 樓的 swipe 會越補越多（會寫進酒館存檔）**
- 檔案：`core/story_extractor.js`（`_refreshSwipeBar`）
- 什麼情況：每次 scanAndRender 都會把 first_mes 和 alternate_greetings 跑過 `substituteParams`，再拿去跟第 0 樓現有的 swipes 比對，缺的就補上並寫檔。開場白如果有 `{{random}}`、`{{time}}`、`{{roll}}`，每次代換出來的內容都不一樣，永遠比對不到。
- 使用者會看到：第 0 樓的開場數一直變多，出現重複的開場。
- 確定度：可能

**D24. 沒裝酒館助手時，世界書位置 5、6（範例訊息前後）讀寫會跑掉**
- 檔案：`core/aurelia_api.js`（`_POS_TH2ST`、`_POS_ST2TH`、`_st2th`）
- 什麼情況：讀取的對照表沒有 5 和 6，一律當成 before_character_definition；寫入時又把 example 前後對應成 0 和 1。
- 使用者會看到：走 native 備用路徑整筆寫回時，原本放在「範例訊息前後」的條目被搬到角色定義前。
- 確定度：可能

**D25. 其他比較小的資料遺失**
- `core/void_terminal.js` 的 `editHistoryItem`：保存時沒呼叫 `debouncedSave()`，改完沒再聊天就重整，修改會消失。textarea 只轉義 `<` 和 `>`，沒轉 `&`，原文裡的 `&amp;` 存回去會變樣。確定。
- `core/void_terminal.js` 的 `_compactNpcMemory`：壓縮時先 slice 出要壓的範圍，等副模型回來後再 `slice(-6)`。這段期間新聊的訊息會擠掉還沒被壓縮的幾條。可能。
- `core/void/lobby_editor.js` 的 `exitEdit`：寫入失敗被空 catch 吞掉，接著照樣重新掛載，於是從 localStorage 讀回舊存檔。空間滿時，剛擺好的家具會一按完成就彈回原位。可能。
- `core/void/lobby_stage.js` 的 `pushNpcHistory`、`setNpcHistory`：寫入失敗被空 catch 吞掉，NPC 下次就忘了。可能。
- `os_phone/vn_story/vn_panel_feed.js` 的 `add`（以及 update、remove）：不看 `_saveEntries` 回傳的 false，面板顯示新增成功，其實沒存進去。可能。
- `os_phone/os/os_settings.js` 的 `_naiPreset.del`、`delIdx`、`clearAll`、`_naiVibe.del`：縮圖和 vibe 當下就從 IndexedDB 刪掉，清單卻要按「保存」才更新。沒保存就離開的話，清單項目還在，但預覽和 vibe 都沒了。確定。
- `os_phone/os/os_card_import.js` 的 `reclaimCoverSpace` 和 `backfillWbPacks`：開機時兩支對同一個 key 做讀、改、寫，會互相蓋掉。封面縮圖還沒做完就按「開始匯入」，書會沒有封面。可能。
- `os_phone/wx/wx_theme_pack.js` 的 `load`：DB 暫時失敗時把空清單快取起來，之後 add 會用空清單加一筆整份蓋掉，apply 也會清掉正在使用的主題。wx_tools 的 load 有防這個情況，這支沒有。懷疑。
- `os_phone/os/os_studio_worldbook.js` 的 `_wbApply`：新增成功、修改或刪除失敗時，`_wbPending` 沒有清，再按一次套用會把條目重複新增。確定。

### 🟠 畫面壞掉

**S1. 瀅瀅／柴郡的對話歷史碰到第一則 AI 回覆就停住**
- 檔案：`core/void_terminal.js`（`renderHistoryList`）
- 什麼情況：組 badgeStyle 時用到 `isClaude`，全倉庫沒有任何地方定義它，這個 IIFE 又開了 strict 模式。只要遇到第一則 role 不是 user 的訊息，就丟 ReferenceError，forEach 中斷。刪除、回退、編輯保存之後的重畫也會壞在同一個地方。
- 使用者會看到：歷史面板通常只顯示第一條使用者訊息，上方計數卻是全部的條數。AI 那幾條的編輯和回退按鈕根本出不來。刪除或回退之後，清單不會更新。
- 確定度：**確定**（ESLint 抓到的，抽查也確認過）

**S2. 注入酒館的面板少了 `st.esc` 等函式，一執行就報錯**
- 檔案：`os_phone/os/os_studio.js`（`generateRegexReplacement` 裡的 st）
- 什麼情況：酒館正則版的 st 缺了 `esc`、`toast`、`confirm`、`loading`、`callAI`、`pickPhoto`、`dbSave`、`dbLoad`、`getStory`、`getChatId`、`toChat`、`toSystem`、`remember`。但說明書要求面板文字一律先過 `st.esc()`。
- 使用者會看到：面板在預覽和手機 app 裡都正常，按「注入酒館」之後，聊天裡顯示「⚠️ 面板腳本錯誤: st.esc is not a function」。
- 確定度：**確定**（函式確實缺；實際會不會出錯，要看面板有沒有用到這些函式）

**S3. 地圖切到還沒初始化的世界時，按鈕點不動、背景殘留**
- 檔案：`os_phone/map/map_core.js`（`renderHome` 的 needsInit 分支）
- 什麼情況：這個分支只換了 innerHTML，沒有移除 `am-marker-mode`。這個 class 帶有 `pointer-events:none`，會繼承給子元素。背景圖也沒有清。
- 使用者會看到：「生成此世界地圖」和「使用奧瑞亞預設城市」按鈕點不動，背景還是上一個世界的地圖。
- 確定度：**確定**

**S4. 微信兩份 showModal 共用同一個小窗，內容互相殘留**
- 檔案：`os_phone/wx/wx_contacts.js`（`showModal`、`createModalContainer`）和 `os_phone/wx/wx_bubble_settings.js`（`showModal`），加上 `wx_core.js` 的 `action`、`closeModal`
- 什麼情況：氣泡設定那份有 MutationObserver，關窗時會把內容還原；通訊錄那份沒有。兩份都沒處理 `#wxModalSelect` 和 `#wxModalPick`。
- 使用者會看到：開「邀請成員」後按取消，再按＋→轉帳，小窗裡同時出現邀請名單和輸入框。反過來操作，氣泡設定頂上會多出收款人下拉選單。
- 確定度：**確定**

**S5. 404 黑市用自己的 ✕ 關掉後，留下一個空窗格**
- 檔案：`core/void/lobby_places.js`（`_mountFloating`），對照 `core/void/panels.js`（`closeStorePanel`）
- 什麼情況：_mountFloating 是靠「元素離開容器」來偵測面板關掉了；黑市關閉時只是 `display:none`，元素還在。
- 確定度：**確定**

**S6. 卡片 CSS 被剝掉範圍，套到整個介面**
- 檔案：`core/aurelia_regex_bridge.js`（`syncRegexStyles`）
- 什麼情況：把 `#chat` 裡的 `<style>` 收集起來，刪掉 `.mes_text ` 和 `#chat ` 前綴後，注入到 head 成為全域樣式。
- 使用者會看到：用了某些帶美化正則的卡之後，酒館和奧瑞亞面板的字色、排版被卡片的 `p{}`、`div{}` 規則污染。
- 確定度：可能（要看卡片的 CSS 寫法）

**S7. 煉丹爐的正則結尾寫成 `<\/script>`，不是真正的結束標籤**
- 檔案：`st_studio_regex.js`
- 什麼情況：replaceString 結尾的 `<\\/script>` 實際存進去的是 `<\/script>`，HTML 不會把它當成 script 結束。另外 `th.builtin.uuidv4()` 沒有防呆，倉庫裡其他三處都有。
- 使用者會看到：面板所在那則訊息，面板後面的正文消失；或者按「注入」沒有反應。
- 確定度：前者可能；uuidv4 那條是懷疑

**S8. boot.js 每次執行都把「已初始化」旗標重設**
- 檔案：`boot.js`
- 什麼情況：每次執行都把 `__AURELIA_INITIALIZED__` 和 `__AURELIA_BOOTSTRAPPED__` 設回 false，index.js 的單實例守衛就失效了。另外 `import()` 回傳的 Promise 沒有接 catch。
- 使用者會看到：助手重跑腳本時，整個擴展初始化第二次，按鈕和面板重複、事件觸發兩次；index.js 載入失敗時沒有任何提示。
- 確定度：可能

**S9. VN 背景下載失敗時，把錯誤頁當成正式圖存起來**
- 檔案：`os_phone/vn_story/vn_core_images.js`（`_doFetchBg`、`_doFetchScene`）
- 什麼情況：`!fetchRes.ok` 只印一句警告，照樣轉成 dataURL，以 fallback:false 存進 bg_cache。`_doFetchScene` 完全沒有檢查 ok。
- 使用者會看到：那個場景的背景或插圖一直是空白或破圖，之後也不會重新生成。
- 確定度：可能

**S10. VN 圖片快取寫入沒處理 abort，空間滿時卡住**
- 檔案：`os_phone/vn_story/vn_cache.js`（`_txSet`、`_txDel`）；`core/void/lobby_stage.js`（`idbPut`、`idbDel`）也有一樣的問題
- 什麼情況：只接了 onerror，沒接 onabort。同一個檔案裡的 `_metaPut` 有接。
- 使用者會看到：空間滿時背景永遠是黑的，開場 loading 停在「圖片繪製中」直到 5 分鐘上限；裝扮室「套用」沒反應。
- 確定度：可能

**S11. 大廳 NPC 出現在錯的場景**
- 檔案：`core/void/lobby_npcs.js`（`initNpcs`）
- 什麼情況：await 讀客人名單回來之後，沒檢查場景是不是已經換了。
- 使用者會看到：書咖的客人站在大廳或交易所裡。
- 確定度：可能

### 🟡 功能失效

**F1. 創作室出錯後自動重試，沒有上限**
- 檔案：`os_phone/os/os_studio.js`（`_studioConfirmRetry`，呼叫端有主題工坊的 `send`，還有 `os_studio_persona.js`）
- 什麼情況：函式直接 `retryFn()`，沒有次數上限、沒有間隔，也不問使用者。錯誤如果一直在（金鑰錯、斷網、上游 5xx），就會一直重送。沒填 URL 時 onError 是同步呼叫的，會變成同步遞迴，直到 stack overflow。傳進來的 fallbackFn 永遠用不到。
- 使用者會看到：「正在重試…」一直跳，對話泡泡一直疊加，畫面卡住，額度一直在燒。
- 確定度：**確定**（抽查過函式本體）

**F2. 酒館版黑名單從來沒注入過**
- 檔案：`os_phone/rpg/blacklist_injector.js`（`normalizeChatId`），對照 `os_phone/os/os_story_tools.js`（`getChatIdentifier`、`_blTitle`）
- 什麼情況：寫入端把 chatId 裡的空白換成底線，讀取端沒有換。酒館的 chatId 通常帶空白。
- 使用者會看到：名單上的角色照樣出場；面板上看得到名單，因為面板跟寫入端用的是同一套規則。
- 確定度：**確定**

**F3. 占卜小屋和帽匠工坊走不出去**
- 檔案：`core/void/lobby_stage.js`（`_loadCfg`、`update` 的過門判定）
- 什麼情況：廣場上鎖時（預設就是鎖的），`to:'city'` 的門整扇被濾掉，只有 room 場景例外。這兩間唯一的門都是 to:'city'，所以 update 裡特地為它們寫的出口分支永遠跑不到。
- 使用者會看到：走到門口的踏墊沒反應，只能用快轉地圖離開。
- 確定度：**確定**

**F4. 微信撥號掛斷後，電話還在繼續**
- 檔案：`os_phone/os/os_dialer.js`（`_afterCall` 的 `_exitTo` 分支）
- 什麼情況：這個分支只呼叫 f() 就 return，沒有清 `_timer`、`_ringToken`、`_pendingSay`。
- 使用者會看到：已經掛掉的電話還在打 API、念台詞；微信紀錄多出沒有結束的「通話開始」。如果上次開過「直接說話」，麥克風會在背景開著，聽到的內容還會送給模型。
- 確定度：**確定**（麥克風那段要看之前的偏好設定）

**F5. 電話 app 響鈴中掛斷再撥，新的一通永遠響不停**
- 檔案：`os_phone/os/os_dialer.js`（`_say` 的看門狗、錯誤回呼、catch，以及 `_hangUp`、`_remoteHangUp`）
- 什麼情況：
  - `_sayBusy` 沒有重設。
  - 看門狗和錯誤回呼不比對 token，舊那通的「沒接通」會蓋掉新那通的畫面。
  - `_root` 從來不會被清成 null，掛斷後才回來的回覆照樣念出來。
- 使用者會看到：新電話一直停在「響鈴中…」，或畫面突然跳成上一個人的「沒接通」。
- 確定度：**確定**

**F6. 語音面板「＋新增模型」按了沒反應**
- 檔案：`os_phone/vn_story/vn_tts_panel.js`（`addModel`、`editModel`、`cancelModelForm`、`saveModel`、`onDirPicked`、`loadLocalConfig`、`deleteAllModels`、`importIndexVoices`、`applyIndexUrl`）
- 什麼情況：這些函式呼叫 `_renderBody('models')` 或 `_renderBody('basic')`，但分頁已經改名成 main、voices、chars、npc，_renderBody 裡找不到對應的分支。
- 使用者會看到：新增或編輯模型的表單不出現；儲存、匯入、清空之後清單不更新，要自己切一次分頁才看得到。
- 確定度：**確定**（抽查到 8 處呼叫 'models'）

**F7. PWA 版私聊人設和群聊備註選的世界書條目，永遠送不出去**
- 檔案：`os_phone/os/os_api_engine.js`（`_wxLoreEntryText`）、`os_phone/wx/wx_chat_settings.js`、`os_phone/wx/wx_contacts.js`
- 什麼情況：這幾處呼叫 `OS_WORLDBOOK.getEnabledEntries()`，但全倉庫沒有定義這個函式。呼叫前有 typeof 守衛，所以不會報錯，只是安靜地回傳空字串。
- 確定度：**確定**

**F8. 微信人設的世界書 uid 型別不一致**
- 檔案：`os_phone/wx/wx_chat_settings.js`（人設設置、備註設置的保存鈕），對照 `os_api_engine.js`
- 什麼情況：人設存的是字串 uid，讀取端 `e.uid === uid` 用嚴格比對，而酒館條目的 uid 是數字。群聊備註則是 `parseInt`，PWA 條目的 id 是 `'wb_…'`，轉完變 NaN。
- 使用者會看到：酒館版私聊選了世界書人設，AI 拿不到；重開設置時那一條沒勾起來，這時再按保存，原本的選擇也被洗掉。
- 確定度：**確定**（前提是酒館的 uid 是 number）

**F9. 微信新增聯絡人時填的人設，酒館模式下模型收不到**
- 檔案：`os_phone/os/os_api_engine.js`（`buildContext` 的私聊人設段），對照 `chatNoteOf`、`_buildStandaloneContext` 的 `_notesOf`
- 什麼情況：酒館版不讀舊的 `apiChat.persona` 欄位，但 wx_contacts 新增聯絡人時正是存在這一欄。另外，條目讀不到時，同一段文字會被送兩次。
- 確定度：**確定**

**F10. 改了跑團私聊的備註名，下次同步就拆成兩間**
- 檔案：`os_phone/wx/wx_chat_settings.js`（btn-save 的 `updateContactInfo`），對照 `wx_core.js` 的 `_storySyncNow`
- 什麼情況：跑團同步是用名字找聯絡人的，改了名字就找不到，於是再建一個新的。另外，名字清空也照樣寫進通訊錄。
- 使用者會看到：同一個人出現兩間聊天室，自己打的話和劇情訊息被拆到兩邊。
- 確定度：**確定**

**F11. 紅包和轉帳記到錯的聊天室，還會多出幽靈紅包**
- 檔案：`os_phone/wx/wx_core.js`（`processRedPacketGrab`、`_storySyncNow` 的 moneyEvents 和 pays、`_parseRoomLines`）
- 什麼情況：
  - processRedPacketGrab 最後又呼叫一次 `saveRedPacketData(packetId, data)`，packetId 是號碼（例如 '1'），找不到就另外開一張別名叫 "1" 的新卡。
  - 跑團同步的金流用 `_txnLoad(null, …)`，最後落到 `_cardChat(null)`，也就是當下開著的那間。
- 使用者會看到：帳本多出一模一樣的幽靈紅包；劇情裡收的轉帳記到別間，原本那間的卡一直停在待收款，可以手動再收一次。
- 確定度：幽靈卡**確定**；重複入帳是可能

**F12. 關閉小劇場時，灰掉的是音量列**
- 檔案：`core/void/lobby_stage.js`（`_openLobbySettings` 的 `_bindOpts`）
- 什麼情況：`box.querySelector('.ltheater-freq')` 抓到的第一個是「音效音量」那列。
- 使用者會看到：關掉小劇場後，音量的小／中／大點不了，頻率那列反而還能點。
- 確定度：**確定**

**F13. 「我的家」看板娘選了又被清掉**
- 檔案：`core/void/lobby_places.js`（`_mountHomeGuest`）
- 什麼情況：每次 go('app') 都對同一個容器再綁一個 click 監聽，從來沒有移除。監聽數是偶數時，一個設上、下一個又清掉。
- 確定度：**確定**

**F14. 拉模型清單時網址多了一層 /v1，回 404**
- 檔案：`os_phone/os/os_settings.js`（`btnFetch.onclick`、`secFetch.onclick`）
- 什麼情況：一律在網址後面接 `'/v1/models'`，網址本來就以 /v1 結尾時就變成 /v1/v1/models。`chat()` 和 `runApiTest` 都有處理這種情況，只有這兩處沒有。
- 使用者會看到：「同步失敗: API 錯誤: 404」。大多數站台給的網址都是 …/v1 結尾。
- 確定度：**確定**

**F15. 設置診斷每次都失敗**
- 檔案：`os_phone/os/os_monitor.js`（`runDiagnostics`）
- 什麼情況：用到沒定義的 `isSummaryOn`，是舊版留下來的，現在已經改用 `getSummaryStatus()`。
- 使用者會看到：「數據橋接」區塊變成「讀取失敗 isSummaryOn is not defined」，歷史預覽永遠出不來。
- 確定度：**確定**

**F16. 狀態面板被背景事件踢回首頁，改到一半的數值不見**
- 檔案：`os_phone/os/os_avs.js`（`launchApp` 的 AVS_VARS_UPDATED 監聽），加上 `os_avs_state.js` 的 `renderInto`
- 什麼情況：renderInto 會把 `_page` 重設成 'home'，`_editingValues` 重設成 false。註解說背景事件應該走 `refresh()`，這裡卻呼叫 renderInto。
- 使用者會看到：按儲存或還原之後被踢回首頁；正在改數值時，背景剛好抽取完一輪，手上改的格子全部不見。
- 確定度：**確定**

**F17. AVS 自己建的狀態檔案看不到，卻套到每一本故事**
- 檔案：`os_phone/os/os_avs.js`（`bindPackEditorEvents` 的 btnSave、`openNewPackEditor`）
- 什麼情況：新包沒有帶 chatId。清單只列 chatId 相符的包，但 state_runtime 會把沒有 chatId 的包當成全域的。
- 確定度：**確定**

**F18. AVS 寫入沒有 await，狀態寫入的時序是亂的**
- 檔案：`os_phone/os/os_avs_engine.js`（`_avsWrite`）
- 什麼情況：酒館模式下 `OS_AVS_ADAPTER.writeState` 是 async，但這裡沒有 await 也沒有 return。state_runtime 那邊的 `await write()` 其實沒在等，事件也比快取更新先發出去。
- 使用者會看到：狀態面板偶爾顯示舊值；一則回覆有好幾個 `<vars>` 時，前面那塊的改動會被後面蓋掉。
- 確定度：沒 await 是**確定**的；後果是可能

**F19. 預設包勾了電話、微博、地圖、塔羅，都不會生效**
- 檔案：`os_phone/os/os_prompts.js`（`OS_PROMPTS.get`、`PANELS`）
- 什麼情況：`if (HARDCODED[key] && !MAIN_PANELS.includes(key)) return HARDCODED[key];`，這四個面板的 key 直接回傳寫死的內容。另外，`os_api_engine` 的 vn_story 自己又寫了一份比對，不認 `'*'`。
- 確定度：**確定**

**F20. 地圖：已經生成過的世界顯示「尚未生成」，再按一次會把原本的蓋掉**
- 檔案：`os_phone/map/map_core.js`（WORLD_RUNTIME.onChange → `renderHome`），加上 `os_phone/map/world_runtime.js`（`switchTo`）
- 什麼情況：地圖 DOM 已經被別的 app 清掉，但 `STATE.container` 不是 null。renderHome 對 null 的 `am-bg` 設 style 時丟錯，這個錯誤被 switchTo 的 catch 當成「讀 DB 失敗」，於是 `currentWorld = null`。
- 確定度：**確定**

**F21. 地圖生成卡在 GENERATING**
- 檔案：`os_phone/map/world_generator.js`（`generateForCurrentChat`）、`os_phone/map/schedule_engine.js`（`generateSchedules`）
- 什麼情況：程式以為完成回呼會被呼叫很多次，所以文字短於 100 字（排程是 200 字）或沒有 `}` 時只 return，等下一次。但 `OS_API.chat` 的完成回呼只呼叫一次。
- 使用者會看到：AI 拒答或回很短時，畫面永遠卡住。
- 確定度：**確定**

**F22. 探索失敗一次後，「探索此地」按鈕按不動**
- 檔案：`os_phone/map/map_core.js`（`scanForCharacters`、`renderScanResults`）
- 什麼情況：錯誤回呼傳的是 null，失敗時完成回呼永遠不會被呼叫。之後 renderScanResults 只把按鈕文字改回來，沒有解除 disabled。
- 確定度：**確定**

**F23. 地圖的「情報員」對話永遠不會播**
- 檔案：`os_phone/map/map_core.js`（`generateWorldEvents`、`scanForCharacters`）
- 什麼情況：呼叫 `win.AureliaControlCenter.playIrisSequence`，這個函式不存在；對外公開的名字是 `VoidTerminal.playSequence`。呼叫前有存在檢查，所以只是靜靜地跳過。
- 確定度：**確定**

**F24. 本機模型模式下，一次失敗就不再重試**
- 檔案：`os_phone/os/os_vector_engine.js`（`_loadTF`、`_getLocalPipe`）；`os_phone/os/os_voice_input.js`（`sensevoice.unload`、`prepare`）
- 什麼情況：
  - 被 reject 的 Promise 一直留在快取裡，之後每次都直接拿到這個失敗的結果。
  - 語音那邊，unload 沒有 reject 還在等的 `_pending`，也沒有清 `_preparing`，之後每次 prepare 都拿到一個永遠卡住的 Promise。
- 使用者會看到：本地向量一直算不出來；本機語音轉字一直轉圈。都要重整頁面才會恢復。
- 確定度：**確定**

**F25. 本機安裝時，只要一支模組載入失敗，整個擴展就沒有入口**
- 檔案：`index.js`（`initializeExtension`、`loadModule`）
- 什麼情況：本機模式下 loadModule 失敗時是 reject，外層 for 迴圈就中斷了。CDN 那條路是 resolve(false) 加重試，兩邊不一致。
- 使用者會看到：沒有 🏰 按鈕，console 只有一行「啟動錯誤」。
- 確定度：**確定**

**F26. 訊息收合功能：換聊天室就失效，收合狀態還會跨聊天室套用**
- 檔案：`core/ui_utilities.js`（`MessageCollapser.addCollapseButton`、`processedIds`、`init`、`reinitializeCollapse`）
- 什麼情況：
  - 用樓層號去重，而且沒有人清這份紀錄。
  - storage key 沒有帶 chatId。
  - 每次 reinit 都多掛一個 MutationObserver。
- 使用者會看到：換聊天室後沒有收合鈕；A 聊天室收起第 3 樓，B 聊天室的第 3 樓也被收起；在設定裡關掉再打開收合，按鈕不會回來。
- 確定度：**確定**

**F27. 從酒館備份還原到 PWA 後，所有 AI 功能都失敗**
- 檔案：`os_phone/os/os_api_engine.js`（`OS_API.chat` 的獨立模式切換）
- 什麼情況：只關掉了 `useSystemApi`，沒關 `useGenerateRaw`。
- 使用者會看到：要到 PWA 設置頁按一次保存才會恢復。
- 確定度：可能

**F28. 戰鬥解析不到敵人時，劇情卡住**
- 檔案：`os_phone/vn_story/vn_battle.js`（`start`）＋ `os_phone/vn_story/vn_core.js`（`_runBattle`）
- 什麼情況：沒有敵人時 return null，也不呼叫 onEnd。但 `_runBattle` 在這之前已經把劇本截斷，也把後面的正文剪掉了。
- 確定度：**確定**（程式邏輯）；多常發生是可能

**F29. 「↺ TTS」重新生成念錯內容**
- 檔案：`os_phone/vn_story/vn_core.js`（`regenCurrentTTS`）＋ `vn_tts.js`（`clearCache`、`play`）
- 什麼情況：用原文呼叫，沒有經過 `_cleanTextForSoVITS`，也沒帶 typeHint。
- 使用者會看到：舊的快取清不掉；旁白和括號裡的動作也被念出來；音色可能換掉。
- 確定度：**確定**

**F30. 心跳：切一次分頁，角色最多沉默 12 小時以上**
- 檔案：`os_phone/os/os_heartbeat.js`（`scheduleAhead`、`clearAhead`）
- 什麼情況：切到背景時把 `hbLast` 推到未來的預約時間，回到前景取消預約時沒有還原。另外，fire 裡 `applyIncoming(...).then()` 沒有接 catch。
- 確定度：**確定**

**F31. 其他功能失效（中等）**
- `os_phone/os/os_cafe.js`：創想品滿 3 款時提示「去菜單頁下架」，但菜單頁沒有下架功能，之後永遠不能再上架。確定。
- `os_phone/os/os_minimax.js`（`play`）：沒有序號機制，快速點下一句時，晚回來的會蓋掉音源，念成舊台詞。`canplay` 失敗時 Promise 永遠不結束。可能。
- `os_phone/os/os_worldbook.js` 的 `importFromST`，對照 `os_card_import.js` 內嵌的轉換：後者不看 `constant`，卡片裡的常駐條目只要有填 keys，就變成要打到關鍵字才注入。可能。
- `os_phone/qb/qb_bookshelf.js`（`openCover`）：`greetings` 抓的是舊陣列的參照，用「取代」改完開場白後按「與TA相遇」，送出去的是取代前的舊內容。確定。
- `os_phone/map/map_core.js`（`interactChar`）：`createChatMessages` 傳的是 `content`，同一個檔案其他地方都傳 `message`，裝了酒館助手時插入的會是空訊息。可能。
- `os_phone/wx/wx_core.js`（`_afterTools`）：wx_tools 還沒 load 時 `enabledFor` 回 []，角色寫了 tool_call，工具卻沒跑，也沒有下一輪回覆。可能。
- `core/vn_free_mode.js`（`set`、`applyForCurrent`）：切換模式剛好碰上 `_applying` 時被忽略，VN 總綱沒有跟著切換；`_rxState` 在 await 之前就設好，寫入失敗之後永遠不會再試。可能。
- `os_phone/os/os_vn_rules_data.js`（`avatar_comfyui`）：年齡規則寫反了，寫成「>15 只能用 teen，<15 必須用 adult」，跟 `avatar_capi` 和 `scene_rules` 互相矛盾。確定。
- `os_phone/os/os_avs_rules.js`（`getActiveContext`）：PWA 呼叫時沒傳 activePackIds，別的故事的條件規則也可能注入進來。可能。
- `os_phone/vn_story/vn_panels.js`（`_vngCardMenu` 的刪除）：清的是 `window.VN_PLAYER._avatarMemCache`，但快取其實在 VN_Core 上。刪掉頭像後，這一局還是顯示舊圖。確定。
- `os_phone/os/os_tavern_bridge.js`（REQUEST_SWITCH_USER_PERSONA）：catch 之後照樣回 `success:true`，畫面說切好了，實際沒換。確定。
- `os_phone/wx/wx_contacts.js`（`deleteContact`）：呼叫不存在的 `wxApp.goBack`（應該是 `onBack`），刪到正開著的那間時，後續步驟全部不做。確定，但觸發條件很少見。
- `os_phone/wx/wx_moments.js`（`pi.onDone('wxmo')`）：用 `scope()` 而不是 `_scopeOfPost`，大廳角色的朋友圈生圖不會存回去。確定。
- `os_phone/wx/wx_view.js` ＋ `wx_core.js`（`openTransfer`）：沒判斷 isMe，點自己發的轉帳可以自己收款，錢包會加錢。確定。

### ⚪ 小問題

- `os_phone/wx/wx_chat_settings.js`（清空聊天）：呼叫不存在的 `app.saveChats()`，會丟 TypeError。畫面已經重畫，所以看不出來。確定。
- `os_phone/wx/wx_chat_settings.js`：呼叫不存在的 `WX_THEME.applyChatSettings`，這行永遠不會執行。確定。
- `os_phone/wb/wb_core.js`（`checkUserUpdate`）：呼叫不存在的 `OS_USER.getHash`，每秒輪詢一次卻什麼都不做。確定。
- `os_phone/wx/wx_theme.js`：`@import url('https: //fonts…')` 網址中間多了空格，Noto Sans SC 永遠載不到。確定。
- `os_phone/os/os_tarot.js`：世界牌寫成 `'XX1. The World'`，應該是 XXI，這個名字也會送進 AI 提示詞。確定。
- `os_phone/wx/wx_contacts.js`：新建聊天室時寫入 `lastTime: Date.now()`，聊天列表會直接印出 13 位數字。確定。
- `os_phone/wx/wx_profile.js`（`_resolve`）：讀的是 `c.customAvatar`，通訊錄裡的欄位叫 `avatarId`，只在群組裡的人會沒有頭像。確定。
- `os_phone/wx/wx_contacts.js`（`openAddWindow`）：填的人設只放在記憶體，重整之後 openChat 重建時沒抄回來。確定。
- `os_phone/wx/wx_core.js`（confirmModal 轉帳）：單號 `Txn` 加兩位數，只有 90 種，而且沒有底線；清除用的正則要求 `[_-]`，對不到。可能。
- `core/void/lobby_stage.js`：`SCENE_HEADER` 沒有 tarot，占卜小屋的名牌顯示「視差書咖／瀅瀅」。確定。
- `core/void/lobby_stage.js`（`_regWin`）：只增不減，舊的 close 反覆執行，會拿掉 `void-dock-open`。確定／可能。
- `core/void/lobby_stage.js`（`_loadCfg`）：門的座標依序號存、依序號套，上鎖狀態改變時會錯位。可能。
- `core/void/lobby_dress.js`（`_menuOutside`）：`once:true` 被選單內的點擊用掉，之後點外面關不掉選單。確定。
- `core/void/lobby_places.js`（`_mountFloating` 的 tick）：沒有取消機制，快速連點時，晚到的面板會被塞進錯的格子。懷疑。
- `core/ui_utilities.js`（`IconManager.moveToInputBox`）：提早 return，沒有恢復 display，桌機縮放視窗後 🏰 會消失。確定。
- `core/void_terminal.js`（`sendIrisMessage` 的 catch）：不分 NPC 軌道一律 pop，也沒設 `lastFailedInput`，打的字會消失。確定。
- `core/tavern_bridge.js`（message 監聽）：不驗證來源，任何 iframe 都能送 `DELETE_VN_HISTORIES` 刪除樓層。懷疑。
- `index.js`（`setupEventBridge`）：`retryTimer` 的 setInterval 永遠不會清掉。確定。
- `os_phone/os/os_dialer.js`（`_dialEnd`）：從微信撥號時，結束畫面還是顯示假號碼。確定。
- `os_phone/os/os_dialer.js`：`_gapFor` 重複宣告，但兩份等價，沒有影響。確定。
- `os_phone/os/os_minimax.js`：物件有重複的 key（吸鼻子、咂嘴、哼唱），值相同，沒有影響。確定。
- `os_phone/wx/wx_tavern_api_bridge.js`：`poll` key 重複，兩份相同。整支 bridge 永遠不會啟動（見第 7 類）。確定。
- `os_phone/os/os_journal.js`：briefs 最多取 5 筆，卻拿來當章數，超過 5 章一律顯示「第 5 章」。確定。
- `os_phone/os/os_journal.js`：四個彈窗的 keydown 監聽只有按 Esc 才會移除，會越積越多。確定。
- `os_phone/os/os_photo_viewer.js`（`close`）：延遲 300ms 的 `_destroy` 會把這段時間內新開的看圖器關掉。確定。
- `os_phone/os/os_prompts.js`（`exportPrompts`）：漏了 Alice、白兔、紫薇、帽匠、大廳世界觀；textarea 只轉義 `<`。確定。
- `os_phone/os/os_persona.js`（`syncFromST`）：換到沒有描述的人設時，沿用上一個人設的描述。可能。
- `os_phone/os/os_phone_theme.js`（`_solidOf`）：判斷透明的正則漏掉 `rgba(…,0)`。確定。
- `os_phone/os/os_image_manager.js`：NAI 失敗退到 Pollinations 時沒帶 options，尺寸和負詞都沒了；ComfyUI 預覽傳入的 AbortController 是 null，會無限輪詢。確定／可能。
- `os_phone/os/os_keepalive.js`（`pipToggle`）：沒聽 `leavepictureinpicture`，用小窗自己的 X 關掉後，interval 還一直在跑。確定。
- `os_phone/os/os_landlord_room.js`（`_startBlock`）：全域吃掉 Enter 和 Backspace，只有 end() 會移除。懷疑。
- `os_phone/os/os_relay.js`：pending 只有被 collect 撈到才會刪，可能永遠每 5 秒輪詢一次；handler 丟錯時照樣 ack，那則回覆就收不回來了。可能。
- `os_phone/os/os_usage.js`（`flush`）：讀、改、寫分在兩個交易，並發時會少算。懷疑。
- `os_phone/os/os_settings.js`（`runApiTest`）：不看 apiFormat，Gemini 原生格式測試會失敗，實際卻能用。確定。
- `os_phone/os/os_studio.js`：`[LATEST_PANEL_STATE]` 的 role 是 system，被 `_studioSave` 過濾掉了，快取不見時修改會退回初版。確定。
- `os_phone/os/os_studio.js`、`os_studio_persona.js`、`os_worldgate.js`：沒帶 `options.task`，或實際用的模型跟分流表不符。確定。
- `os_phone/os/os_app_tools.js`（`setWakeCfg`）：重新打開時沿用舊的 last，下一分鐘就可能被叫醒。確定。
- `os_phone/os/os_control_room.js`：啟動失敗後，文字一直顯示「啟動中…」。確定。
- `os_phone/os/app_store.js`：卸載沒有 await，清單會出現重複。可能。「換圖標」時如果 `a.emoji` 是 undefined 會丟 TypeError。懷疑。
- `os_phone/vn_story/vn_nav.js`：`#nv-step` 的 `dataset.filled` 從來沒清，第二趟導航還殘留上一趟的內容。確定。
- `os_phone/vn_story/vn_scene_insert.js`：`_writeBackToMessage` 插入後沒有重算行號，第二張以後的插圖會錯位；`applyLatestFresh` 在重播舊章時也被呼叫。確定／可能。
- `os_phone/vn_story/vn_tts.js`（`_playStreamingOgg`）：被打斷時還是把半截的音檔存進快取。可能。
- `os_phone/vn_story/vn_dynamic_parser.js`（`_renderInline`）：連點兩下會跳過下一句。可能。
- `os_phone/vn_story/vn_end_panel.js`（`render`）：await 回來後沒比對 `_gen`，內容可能疊兩層。懷疑。
- `os_phone/map/map_core.js`（`scanForCharacters`）：接上的小地圖規則寫著「只輸出 scene-map」，跟探索要的格式矛盾。懷疑。
- `os_phone/map/world_runtime.js`（`setSchedules`、`saveFacilitySceneMap`）：漏了 statePatches，整筆 put 會把它清掉。確定（目前影響很小）。
- `os_phone/qb/os_404_chaos.js`（`fireEvent`）：catch 裡沒有還原按鈕，按鈕一直停在「發送中…」。確定。
- `os_phone/qb/qb_bookshelf.js`（`openCover`）：`${w.title}` 沒有轉義。可能。
- `os_phone/wb/wb_core.js`（`shareToWx`）：讀的是 OS_CONTACTS，關注列表讀的卻是 WX_CONTACTS，名單可能混到別張卡的人。可能。
- `os_phone/os/os_api_engine.js`（`analyzeSceneInserts`）：用到沒宣告的 `options`，不過整支函式都沒人呼叫（見第 7 類）。確定。
- `os_phone/os/os_settings.js` 開頭：`appStyle` 沒有定義，只有 `#os-settings-css` 已經存在時才會讓整個模組中斷，目前不會觸發。確定。
- `os_phone/os/os_settings.js`（`_spriteRawFor`）：`win` 沒有定義，但被前面的守衛擋住了，目前不會觸發。確定。

---

## 第 2 類：IndexedDB 圖片 store 用 getAll() 一次讀全部

**結論：真正存圖片的 store 都沒有直接用 `getAll()`，這部分已經修好了。** 下面是逐一確認的結果：

- `vn_player_db` 的 `bg_cache`、`avatar_cache`、`item_cache`、`scene_cache`、`sprite_cache`：清單一律走 `VN_Cache.getAllMeta`，也就是「鑰匙加小帳」，不讀圖。
- OS_DB 的 `images`：只有依 id 的 get、put、delete。
- `lobby_stage_assets.imgs`：只用 get、put。
- `os_backup.js`：估算大小時，圖片也只算張數。

**剩下要注意的：**

1. **`os_phone/vn_story/vn_panels.js` → `_refreshChatBgThumbs`** 呼叫 `VN_Cache.getAll('chat_bg')`。字面上不是 `getAll()`，而是用 openCursor 把每一筆完整的值都收進陣列，效果一樣。`chat_bg` 不在 IMAGE_STORES 裡，沒有小帳；使用者從相簿上傳的聊天背景是用 `readAsDataURL` 整張存的。上傳的背景越多，每次打開聊天背景面板，就會把全部原圖一次讀進記憶體。確定度：可能（要看使用者存了多少張）。
2. **`os_phone/os/os_db.js`**：以下幾支為了刪或過濾，會先 getAll 整個 store：`deleteVnMemoriesByChapter`、`deleteVnMemoriesByStoryId`、`deleteVnChaptersByStoryId`、`clearAchievements`。`vn_memories` 每筆都帶向量，而 `deleteVnMemoriesByChapter` 每次入庫都會跑。這不是圖片，但記憶庫大了之後，每存一章都有一次記憶體尖峰。確定度：懷疑。
3. **`getAllPhoneApps`**：每筆都帶完整的 html。`os_app_memory_inject.js` 在組提示詞時會呼叫它，app 多的時候每一輪都要全讀一次。確定度：懷疑。

---

## 第 3 類：localStorage.setItem 沒包 try/catch

用語法樹掃了全部 **262 處** `setItem`，其中 **60 處不在任何 try 區塊裡**。空間滿的時候，setItem 會丟 QuotaExceededError：沒包 try 的，會讓整個函式在那一行中斷，後面的步驟都不做。

> 注意：這裡看的是「呼叫本身有沒有被 try 包住」。有幾處的外層呼叫端可能有包，但出錯時一樣會打斷流程。

**優先處理：寫入量大的，或寫在流程中間、失敗會讓後面步驟斷掉的**

| 檔案 · 函式 | 寫什麼 | 失敗的後果 |
|---|---|---|
| `os_phone/wx/wx_contacts.js` · `_writeAll` | 整份通訊錄（兩個 key） | 通訊錄沒存，後面的流程中斷 |
| `os_phone/wx/wx_core.js` · `WX_STICKER._save` | 表情包庫 `os_sticker_libs` | 新增的表情包沒存 |
| `os_phone/os/os_prompts.js` · `saveEntries`、`saveBundles`、`saveIris` 等 13 支 | 提示詞條目和預設包（可能很長） | 提示詞改了沒存，而且畫面沒提示 |
| `os_phone/os/os_worldbook.js` · `saveBooks` | 書包清單 | 同上 |
| `os_phone/os/os_card_import.js` · `write` | `aurelia_custom_worlds`（含封面） | 這一支沒包；`_saveWorlds` 有縮圖重試 |
| `os_phone/os/os_persona.js` · `saveLocalPersonas`、`saveCurrentId` | 人設清單 | 人設沒存 |
| `os_phone/os/os_avs_rules.js` · `_saveRules` | 條件規則 | 規則沒存 |
| `os_phone/os/os_settings.js` · `saveConfig` | 主模型、副模型、圖片、MiniMax 設定 | 前一個 key 成功、後一個失敗時，設定會半新半舊，後面同步到 OS_IMAGE_MANAGER 的步驟也不做 |
| `os_phone/os/os_backup.js` · 還原的 `forEach(setItem)` | 還原整批 localStorage | 還原到一半中斷，IndexedDB 已經還原、localStorage 只還原了一部分 |
| `os_phone/os/os_backup.js` · `saveSettings` | 備份設定 | 同上 |
| `os_phone/os/os_api_engine.js` · `startStandaloneStory` | 目前故事的 id 和標題 | 故事開不起來 |
| `os_phone/vn_story/vn_core.js` · `_setStoryId` | 同上 | 同上 |
| `os_phone/vn_story/vn_settings.js` · `save`、`vn_panels.js` · `save`、`vn_config.js` · `saveOrder` | VN 設定 | 設定沒存 |
| `os_phone/wx/wx_bubble_settings.js` · `saveConfig` | 氣泡設定 | 同上 |
| `os_phone/os/os_404_store.js` · `saveItemsState`、`setShards` | 道具和碎片 | 買了東西卻沒記到 |
| `os_phone/os/os_minimax.js` · `saveConfig` | 語音設定 | 設定沒存 |
| `os_phone/os/os_avs.js` · 刪除 furnace preset | 預設清單 | 刪不掉 |
| `core/void/phone_shell.js` · `_saveTheme`、`_saveIconFolder` | 手機主題 | 同一個檔案裡另一處有包 try，這兩處沒有 |

**影響小的：開關、數字這類旗標（空間滿時一樣會打斷該函式）**

`rpg/state_runtime.js` 的 `setEnabled`、`wx_core.js` 的 `toggleDarkMode`、`vn_generator.js` 的 `runCardDive`、`vn_monitor.js` 的 `saveLimit`、`qb_bookshelf.js` 的 `btn.onclick`（寫 vn_current_world_id）、`os_settings.js` 的立繪前後綴、尺寸、比例、hires 各 onchange、`os_story_tools.js` 的 `saveSummaryTemplate`、`os_studio_worldbook.js` 的 swb_model、`os_avs_state.js` 的 toggle、`wb_core.js` 的 `toggleDarkMode`、`ui_utilities.js` 的 `toggle`、`story_extractor.js` 的 `saveTheme`、`void/ambient.js` 的 `toggleLobbyBgm`、`void/login.js` 的 layout。

**比沒包 try 更麻煩的：包了 try，但失敗時什麼都不做**

`qb_bookshelf.js` 那四處（見 D14）、`lobby_editor.js` 的 `exitEdit`、`lobby_stage.js` 的 `pushNpcHistory` 和 `setNpcHistory`（見 D25）。這幾處失敗時使用者完全不會知道，資料卻已經沒存到。

---

## 第 4 類：innerHTML += 追加

全倉庫共 **15 處**，逐一看過：

**有風險：追加前容器裡的內容已經綁了事件**

| 檔案 · 函式 | 情況 | 確定度 |
|---|---|---|
| `os_phone/vn_story/vn_dynamic_parser.js` · `_renderBlock` | 組件 JS 跑到一半出錯時，在 panel 後面追加錯誤訊息。這時 JS 前半段已經在 panel 裡綁好的按鈕，監聽全部消失 | 確定（錯誤路徑） |
| `core/void/canvas.js` · `_renderLobbyPanel`、`_detectAndRenderVNBlock` | 跟上一條一樣，面板 JS 出錯時追加錯誤訊息。後面有 `_rewireOnclicks` 會重綁 onclick 屬性，但用 addEventListener 綁的就沒了 | 確定（錯誤路徑） |
| `os_phone/vn_story/vn_ui_workshop.js` · `renderPreview` | 同上，只影響預覽 | 確定（錯誤路徑） |

以上四處還有一個共同點：`${e.message}` 沒有轉義就塞進 HTML。

**沒有監聽會掉，但寫法不好**

- `os_phone/os/os_settings.js`：拉模型清單的 4 處都是 `models.forEach(... elModel.innerHTML += <option>)`。每加一項就把整個 select 重建一次，OpenRouter 這種幾百個模型的清單會跑成 O(n²)；id 也沒轉義。
- `os_phone/os/os_tarot.js`（快照）、`os_phone/qb/os_404_chaos.js`（renderLists）、`os_phone/wx/wx_core.js`（action 的 selectEl）、`os_phone/os/os_persona.js`（加勾勾圖示）：容器是新建的，或本來就只有純文字，不會掉監聽。
- `os_phone/wx/wx_contacts.js` 的 `showMenu`：先追加內容，之後才綁 onclick，順序是對的。狀態文字那 2 處是純文字，也沒問題。

---

## 第 5 類：focus() / scrollIntoView() 沒防捲動

**focus()**：共 53 處，只有 4 處帶了 `{ preventScroll: true }`，分別在 `wx_tools.js` 的 `_onClick`、`os_prompts.js`、`aurelia_dialog.js` 的兩處。

**最可能在面板滑入時造成外層捲動卡住的**（都是「開窗或開面板」之後立刻 focus）：

| 檔案 · 函式 | 說明 |
|---|---|
| `core/aurelia_dialog.js` · prompt 開啟時的 `input.focus()` | **同一個 try 裡，下一行的按鈕 focus 有加 preventScroll，這行沒加**。全站的 AUI.prompt 都會經過這裡 |
| `core/aurelia_dialog.js` · `onKey` 的 Tab 循環 | 沒加 |
| `os_phone/os/os_worldgate.js` · `_openWgModal` | 共用的 modal，開啟時 focus |
| `os_phone/wx/wx_core.js` · `action`（input1）、`quoteMsg`、編輯訊息的 ta | 微信的小窗和輸入框 |
| `os_phone/wx/wx_moments.js` · `_startInput` | 朋友圈留言 |
| `os_phone/vn_story/vn_panels.js`、`vn_inspect.js`（`b.onclick`）、`vn_reader.js`（`_editChapter`） | VN 面板 |
| `os_phone/qb/qb_bookshelf.js`：`doCreate`、reqInput 那一串共 8 處 | 書架 |
| `os_phone/os/os_landlord_room.js` · `_openEditor`、`os_landlord_book.js` · `go.onclick` | 包租婆 |
| `os_phone/os/os_studio.js`：`handleSend`、`_capturePreviewToPending`、`otherBtn.onclick`、`handleDiffVNRefine`、`#vth-gal-add` | 創作室 |
| `os_phone/os/os_dialer.js` · `_enableSay`、`os_avs_state.js` · `_addBtn`、`os_char_gallery.js` · `onClick`、`os_settings_comfyui.js` · `renameIdx` 和 `saveNew`、`os_settings_voice.js` 兩處、`os_studio_worldbook.js` · `toggle`、`os_settings.js` 三處、`os_dashboard.js` 兩處 | 各個設定頁 |
| `os_phone/wb/wb_core.js` · `_renderCompose`、`inp.onkeydown` | 微博 |
| `core/void/login.js` · `showLoginScreen`（300ms 後）、`core/void_terminal.js` · `editHistoryItem`、`core/story_entry_wizard.js` 兩處 | 大廳 |

`sw.js` 的 `w.focus()` 是 Service Worker 的 WindowClient.focus，跟捲動無關，不用處理。

**scrollIntoView()**：共 8 處，全部都帶了 options，但**沒有一處能防止外層容器捲動**（scrollIntoView 本來就會捲動所有祖先容器）。

| 檔案 · 函式 | 參數 | 風險 |
|---|---|---|
| `os_phone/os/os_studio.js` · 編輯卡片的 onclick | `smooth, center` | 會把外層面板也捲動 |
| `os_phone/os/os_studio.js` · `otherBtn.onclick` | `smooth, nearest` | 同上 |
| `os_phone/os/os_avs.js` · `openNewPackEditor` | `smooth, start` | 剛打開編輯器就捲動，風險最高 |
| `os_phone/os/os_worldgate.js` | `nearest` | 較低 |
| `os_phone/vn_story/vn_browser.js` · `_addResult`、`_addParagraph`、`_addImage` | `nearest` | 較低 |
| `core/html_extractor.js` · `push` | `end` | 較低 |

---

## 第 6 類：同一件事寫了好幾份、內容已經不一致

| # | 什麼事 | 各份在哪裡 | 哪裡不一樣 | 後果 | 確定度 |
|---|---|---|---|---|---|
| 6-1 | 黑名單條目的 chatId 正規化 | `os_story_tools.js`，對照 `rpg/blacklist_injector.js` | 一邊把空白換成底線，一邊沒換 | 酒館版黑名單永遠不注入（見 F2） | 確定 |
| 6-2 | `aurelia_custom_worlds` 的寫入 | `os_card_import._saveWorlds`，對照 `qb_bookshelf` 的四處 | 一邊空間滿會縮圖重試，一邊空 catch | 書架寫入失敗沒有任何提示（見 D14） | 確定 |
| 6-3 | 酒館世界書條目轉成 PWA 條目 | `os_worldbook.importFromST`、`os_card_import` 內嵌、`os_worldbook.importFromCard`（死碼） | constant 判斷、預設 order（0 或 50）、讀 keys 還是 keyword | 常駐條目變成要打關鍵字才觸發 | 可能 |
| 6-4 | VN 指令總綱 | `os_vn_rules_data.js` 的 `core_format` 和 `core_format_free` | Bg 風格寫法（`Modern style,` 還是 `modern`，另有古风前綴）；成就每三輪一次這條只有固定版有；Trade 標籤只有自由版有 | 切換自由模式時，不只拿掉表情格，其他規則也一起變 | 確定 |
| 6-5 | 頭像的年齡規則 | `os_vn_rules_data.js` 的 `avatar_comfyui`、`avatar_capi`、`scene_rules` | comfyui 那份寫反了 | ComfyUI 頭像把成年角色標成 teen | 確定 |
| 6-6 | 立繪的前綴、後綴、清洗規則 | `vn_story/vn_config.js`（`getSprite`、`getSpriteSheet`）、`vn_core_stage.js`（`autoGenSprite`）、`os_settings.js`（立繪 studio） | 空字串是否退回預設（`== null` 還是 `\|\|`）；autoGenSprite 多剝了 looking at viewer 和 face focus；getSpriteSheet 又複製了一份預設字串 | 清空前綴後，studio 生的圖和劇情裡自動生的立繪構圖不一樣 | 確定 |
| 6-7 | 共用面板的 `st` API | `os_studio.js` 的 `_buildPreviewSt`、`_templateToPhoneHtml`、`generateRegexReplacement` | 正則版缺十幾個函式；st.md 的規則三份不同（showdown＋DOMPurify 還是純正則） | 注入酒館後面板報錯（見 S2） | 確定 |
| 6-8 | 組件 JS 的執行參數 | `vn_dynamic_parser._renderBlock`（4 個參數），對照 `vn_ui_workshop` 的 `loadGallery`、`renderPreview`（3 個）、`generateRegexReplacement`（連 onComplete 都沒有） | 參數數量不同 | 用了 st.* 的組件在展廳預覽報「st is not defined」 | 確定 |
| 6-9 | app 取 chatId 和 dbSave 的鍵 | `core/void/app_runtime.js`（getChatId，最後退到 `"_nochat"`）、`os_app_memory_inject._appChatId`（退到 `''`）、`vn_dynamic_parser._buildSt`（只問 getCurrentChatId，拿不到就是 null） | 退路和後備來源都不一樣 | 同一個面板在劇情裡和手機 app 裡存的資料分成兩份，記憶回傳也讀不到 | 確定（差異）／可能（影響） |
| 6-10 | wx 聊天室 id 對照表的 key | `wx_core._wxRemapChatId`（寫），對照 `os_app_memory_inject`（讀） | 取 chatId 的方式不同 | 「整理聊天室」的對照表套不進注入內容 | 可能 |
| 6-11 | 用世界書當聊天室人設 | 酒館版 `buildContext`，對照 `chatNoteOf`、`_notesOf` | 一邊讀舊的 persona 欄位，一邊不讀 | 見 F9 | 確定 |
| 6-12 | 模型清單的網址組法 | `os_settings` 的 btnFetch、secFetch，對照 `runApiTest`、`OS_API.chat` | 有沒有處理 /v1 結尾 | 見 F14 | 確定 |
| 6-13 | MiniMax 預設語音模型 | `os_settings.loadMinimaxConfig`（speech-01-turbo），對照 `os_minimax`（speech-02-turbo） | 預設值不同 | 按一次保存就被降級成 01 | 確定 |
| 6-14 | 內心獨白和文字顏色的預設值 | `vn_panels` 的 `VN_Settings.defaults`（#c9aaff、#dddddd）、`vn_styles.js` 的 input value（#d4af37、#dcd8d0）、`css/vn_styles.css`（#d4af37） | 顏色不同 | 面板寫的預設是金色，按「重置」卻變成紫色 | 確定 |
| 6-15 | TTS 音量 | `vn_game_settings.ttsVolume`，對照 `vn_tts_v1.volume` | 存在兩個地方，`VN_Settings.load` 每次都用前者覆寫後者 | 語音面板調好的音量，下次開 VN 就被蓋掉 | 確定 |
| 6-16 | 下一句 TTS 預取的文字 | `vn_core.next()` 的 prefetch，對照 `vn_phone`、`_prewarmSoVITS`、`vn_avatar_earlybird` | 預取沒有經過 `_normCharParts` 和 `_extractInlineSFX` | 自由模式下預取的是「Stay」這個字，等於白白多打一次 API | 確定 |
| 6-17 | 配圖來源的白名單 | `vn_ui_workshop` 的 `requestAIGeneration`（5 種），對照 `bindEvents`（2 種） | 認得的選項數量不同 | 重開後又變回 POLL | 確定 |
| 6-18 | 時段判斷 | `map/map_image.js`（故事時鐘，19 點到 1 點算夜晚）、`schedule_engine.js`（真實時間）、`map_core.getHomeBackground`（真實時間，18 點算夜晚） | 時間來源和分界點都不同；註解說三份是「同一種判斷」 | 地圖是夜景，時刻表卻是早上的班表 | 確定 |
| 6-19 | 換日的算法 | `os_landlord._dayNum`（UTC），對照 `os_cafe._dayNum`（本地時區） | 註解說是「同一招」，實際不同 | 包租婆那邊台灣早上 8 點才換日 | 確定 |
| 6-20 | 成就獎勵的結算 | `os_404_store.evaluateAchievements`（沒封頂），對照 `os_pt.evaluateAchievementsPT`（有封頂） | 有沒有單筆上限 | 碎片可能暴增，同名成就發兩次 | 確定 |
| 6-21 | 副模型的 `_ask` | `os_jev_sfx`、`os_jev_stage`（重試 4 次、30 秒）、`os_jev_shadow`（3 次、25 秒）、`core/void/npc_decide`（8 秒） | 重試次數和逾時都不同；最後一次失敗後還多睡一輪 | 最多白等 10 秒 | 確定 |
| 6-22 | 通訊錄來源 | `wb_core` 的 `shareToWx`（讀 OS_CONTACTS），對照 `followList`（讀 WX_CONTACTS） | 資料來源不同 | 轉發名單混到別張卡的人 | 可能 |
| 6-23 | 地圖世界的存檔物件 | `world_runtime` 的 `persistFullWorld`，對照 `setSchedules`、`saveFacilitySceneMap` | 後兩者漏了 statePatches | 存一次就被清掉 | 確定 |
| 6-24 | 微信的 showModal | `wx_contacts.showModal`，對照 `wx_bubble_settings.showModal` | 一個關窗時會還原內容，一個不會 | 見 S4 | 確定 |
| 6-25 | theme pack 和 tools 的 load | `wx_theme_pack.load`，對照 `wx_tools.load` | 一個會把空清單記住，一個不會 | 見 D25 | 懷疑 |
| 6-26 | Token 估算 | `os_api_engine._estTok`，對照 chat 裡的 totalTokens | 公式不同 | 兩個面板顯示的數字不一樣 | 確定 |
| 6-27 | 擴展設定的讀取（5 份） | `index.js`、`ui_utilities.js`、`control_center.js`、`story_extractor.js`、`html_extractor.js`，外加 `loader_core.js` 的 ConfigManager | 有沒有退回讀 localStorage；loader_core 的 key 名稱多了「(精簡版)」 | 重新整理後，抽取器判斷錯掛載點 | 可能 |
| 6-28 | `#form_sheld` 劫持和 fixIframes | `story_extractor`，對照 `html_extractor` | html 版不處理已經載完的 iframe；兩份都沒防重入 | 分頁高度不對；重複呼叫 show() 時，酒館輸入框會不見 | 懷疑 |
| 6-29 | 世界頻道訊息的轉義 | `void_terminal` 的 `addFeedEntry`（沒轉義），對照 `_paintFeed`（有轉義） | 一個轉、一個沒轉 | AI 回的內容帶 `<` 時，泡泡壞掉，清單裡卻正常 | 確定 |
| 6-30 | **HTML 轉義函式，全倉庫約 60 份** | 各檔自己寫的 `_esc`、`esc`、`escHtml`、`escapeHtml`、`escAttr` | 有的不轉引號、有的不轉 `&`（`os_studio` 的兩份 `_esc`）、有的只轉 `"`（`os_settings_comfyui` 的 `escAttr` 卻拿去轉文字內容）、有的只轉 `<`（`wx_view`、`vn_phone`）。不轉引號卻用在屬性裡的有：`core/void/phone_shell.js`（`value="…"`、`data-css`）、`os_dialer.js`（`data-id`）、`os_studio.js`（`data-fx-chip`、`data-id`、`placeholder`）、`vn_panels.js`（`data-id`）。`wx_view.js` 更是把名字直接放進 inline onclick：`'${c.name}'` | 名字或網址裡有 `'`、`"`、`<`、`&` 時，屬性被截斷、點擊沒反應、版面亂掉 | 確定（差異）／可能（要有特殊字元） |

---

## 第 7 類：死碼（只列出，沒刪）

找法：先收集所有具名函式、`const x = function`、物件方法，再到全倉庫的 js 和 html 裡比對同一個名字（含字串，例如 `onclick="foo()"`）。只出現在定義處的就列進來。

> 注意：`OS_DB`、`aurelia_api`、`OS_WORLDBOOK` 這類對外 API 上的方法，有可能是給角色卡腳本或創作室產生的 app 呼叫的，倉庫裡找不到呼叫不代表一定沒用，刪之前請先想一下。

**整支模組或整段流程都沒人用**
- `core/void/login.js`：`showLoginScreen` 沒有任何地方呼叫，整個登入畫面等於是死的。它也是唯一會呼叫 `setCurrentChatId` 的地方（這跟 D6 有關）。
- `os_phone/wx/wx_tavern_api_bridge.js`：wx_core 載入時把 `directMode` 強制設成 true，`WX_TAVERN_API_BRIDGE.start()` 永遠不會執行。`checkChatChanged`、`poll` 都沒人用。
- `core/void/canvas.js`：`_detectAndRenderVNBlock` 沒人呼叫。
- `core/vn_dom_bridge.js` 的 `getVnBlocks`、`core/aurelia_regex_bridge.js` 的 `getLatestTerminalData`：終端數據擷取，沒人呼叫。
- `os_phone/os/os_api_engine.js`：`analyzeSceneInserts`、`startStandaloneStory`。

**具名函式（名字只出現在定義處）**
- `os_phone/os/os_avs.js`：`_DEPRECATED_renderTemplateList_old`
- `os_phone/os/os_404_store.js`：`getItemState`、`getCatalog`
- `os_phone/os/os_minimax.js`：`hexToBlobUrl`
- `os_phone/os/os_studio.js`：`safeStreamHtml`
- `os_phone/os/os_settings.js`：`refreshScenePresetRef`、`applyPreset`
- `os_phone/os/os_card_import.js`：`_stripMd`
- `os_phone/os/os_dialer.js`：`_isRefusal`；第一份 `_gapFor`（被第二份蓋掉）
- `os_phone/os/os_widgets.js`：`sizeOf`
- `os_phone/os/os_pt.js`：`_esc`
- `os_phone/vn_story/vn_tts_panel.js`：`buildPanelHTML`、`playNpcSelectedModel`、`onDirPicked`
- `os_phone/wx/wx_core.js`：`cleanHtmlToText`、`revealRecall`、`forgetMyAvatar`、`storySync`、`reloadApiChats`、`bigImg`
- `core/void/phone_shell.js`：`_editMoodText`、`removeUserTheme`、`currentThemeId`
- `core/control_center.js`：`_extractPeek`
- `core/loader_core.js`：`safeExecute`（整個 ConfigManager 也沒人用）
- `core/panel_manager.js`：`hidePanel`（**同一個物件裡定義了兩次**）、`hideAllPanels`
- `index.js`：`hidePhoneModal`、`openPhoneApp`

**對外 API 上沒人呼叫的方法**（可能是留給外部腳本用的）
- `core/aurelia_api.js`：`updateWorldbookWith`、`replaceLorebookEntries`、`createWorldbookEntries`
- `os_phone/os/os_db.js`：`getLobbySummaryBriefs`、`deleteAppDataByChat`、`saveChildBg`、`getChildBg`、`deleteChildBg`、`clearWbPosts`、`getWorldbookEntriesByCategory`、`saveStudioDraft`、`getStudioDraftsByCategory`、`deleteStudioDraftsByCategory`、`clearStudioDrafts`、`deleteGrandSummary`、`deleteLobbySummaryIndex`
- `os_phone/os/os_image_manager.js`：`waitVoiceIdle`、`waitImagesIdle`、`connList`、`lastImgSent`、`generateBackground`、`setApiKey`
- `os_phone/os/os_worldbook.js`：`isGlobalPack`、`setGlobalPack`、`importFromCard`
- `os_phone/map/world_runtime.js`：`getSchedules`、`getAllLiveStates`、`getAllPatches`
- `os_phone/os/os_avs_adapter.js`：`getCache`、`refreshCache`
- `os_phone/os/os_contacts.js`：`getOrCreate`、`updateWxData`
- 其他：`os_achievement.getRedeemed`、`os_lorebook.getActiveList`、`os_persona.openPersonaList`、`os_room_gen._setFigure`、`os_vector_engine.cleanForExtract`、`os_vector_inject.hasPendingMemory`、`os_vn_rules.lastInjected`、`rpg/mc_status.resetCache`、`vn_battle._debug`、`vn_config.getOrder` 和 `saveOrder`、`vn_core.avatarPendingStatus` 和 `resetPromptOrder`、`vn_fx.getGroup`、`vn_inspect._mdToHtml`、`wx_contacts.tagsOf` 和 `isLobby`、`wx_view.generateHash`

**賦值了卻沒用到的變數**（ESLint 抓的，大多是殘留，有幾個看起來像是功能沒接上）
- `os_api_engine.js`：`enableStreaming` 讀出來後沒用到，串流設定可能根本沒被參考。
- `os_story_tools.js` 的 `executeMergeSummaries`：`prompt` 組好了卻沒用到，是舊流程的殘留；新流程另外把 userNote 帶進去了，所以沒有功能影響。
- `vn_config.js`：`_useNAI`。
- `vn_core.js`：`VN_BgmIndex`、`VN_Summary`、`_truncMsgId`。
- `os_vector_inject.js`：`_injSeq`、`_pendingSecCount`、`_pendingKwCount`。
- 其他約 40 個常數或局部變數（`STYLE_ID`、`BASE_IMG_URL`、`DEFAULT_WORLDMAP_BASEPLATE`、`PANEL_KEYS`、`_LATE_SYS_SLOTS` 等），都是單純沒用到。

`os_voice_input.js` 的 `locateFile`、`print`、`printErr`、`onAbort` 是 Emscripten 的 Module 回呼，由外部程式庫呼叫，**不算死碼**。

---

*報告結束。建議先從總覽那 15 條開始，一條一條對照原始碼確認後再修。*
