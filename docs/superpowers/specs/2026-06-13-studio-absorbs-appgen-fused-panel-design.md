# 創作室吃下「AI 生成應用」· 面板可展示＋可生成

> 日期：2026-06-13
> 一句話：商店「AI 生成應用」入口改導向 🎨 創作室；**創作室的生成 prompt 加上「面板也能 call API 生成」的授權 + 掛上 API 接口**。產物進**一個庫、兩個視窗**（展廳＝全部 / 我的應用＝只勾手機的那些），用**掛載開關**（劇情 / 手機，**手機 opt-in、預設不勾**）+ **能力自動小標**（展示/生成/兩者）管理，**不分死類別**。純展示的東西不進手機。其餘接線、不動架構。

---

## 1. 範圍（刻意做小）

**做**
- 「AI 生成應用」入口 → 開創作室（對話式來回改取代一次性生成）。
- 創作室生成 prompt **加一段**：告訴 AI 它做的面板**除了展示，也能 `callAI`/`genImg` 觸發 API 生成新內容**；執行環境把這組接口掛上（商店那組 helper 已現成）。
- 產物存進統一庫（一筆記錄，兩個視窗：展廳全部 / 我的應用只勾手機的），帶兩個掛載旗標 + 一個能力標。**手機旗標 opt-in、預設不勾**——不算應用 / 純展示的東西只掛劇情、不進手機。

**不做（YAGNI）**
- 不分「VN組件 / 應用 / 組合版」死類別——一個面板是什麼是**能力**不是類型，自動打標即可（拆牆別又砌回去）。
- **不寫入酒館全局正則**——見 §3，VN 系統直接讀展廳模板，自己的面板不需轉酒館。
- 不重造框架、不動 VN_Core 播放管線 / AVS。
- 劇情正文不塞 JSON；內容由面板自己 call AI 即時生（聊天室即資料庫、無狀態）。
- 商店其餘 tab（📥 匯入 / 設定）維持原樣。

---

## 2. 核心改動：創作室 = 應用生成器

商店首頁「AI 生成應用」點下去 → 開創作室、進製作流程。創作室原本就會對話式做面板（展示那半），本次只加**功能那半的授權**：

- **生成 prompt 加料**：在現有規範上明確告訴 AI——
  - 面板可 `callAI(systemPrompt)`（自動帶角色卡/世界書/最近劇情）、`genImg(prompt,type)`、`saveData/loadData`、`goBack`（沿用 `app_store.js:267-273` 既有 helper 文案）。
  - 面板可選擇「純展示 / 純生成 / 兩者」——由需求決定，框架不強制。
  - 規範：`#app-root` 隔離、`window.x || window.parent?.x` 雙寫法、call AI 帶 `chat_history`、**禁在 prompt 塞具體主題/名詞範例**（只給結構＋佔位變數）。
- **接口掛上**：創作室執行環境提供上述 helper（商店已有 → 共用；`callAI` 走**副模型**：snapshot→switch→call→finally restore，用完切回呼叫前狀態）。
- **製作流程**：沿用創作室既有 chat loop（`saveStudioChat/getStudioChat`、歷史快照、重新設計）→ 對話式來回改。
- **產物組裝**：沿用商店 `_parseGen` / `_assembleApp`（分段 `<app_meta/css/html/js>` → 完整 HTML），不重寫。
- **預覽**：`AppRuntime.mountAppIframe(..., {preview:true})`（生圖佔位、不燒額度）。

---

## 3. 掛載：兩個旗標，不轉酒館

產物存一筆，帶兩個掛載開關：

### `☑ 劇情彈出`（inline）
- **VN 系統直接讀展廳已啟用模板**——現成機制，不寫酒館正則：
  - `vn_core.js:272`「重抓創作室（展廳）已啟用模板」
  - `vn_core.js:556`「先吃創作室（展廳）已啟用模板，沒命中才去酒館正則」
- 勾劇情＝這筆在展廳設為啟用；AI 在劇情寫觸發詞 → VN 系統從 DB 撈來 inline 彈出。inline 時 `window.parent` 即 ST，雙寫法自然取到 API。
- 酒館全局正則那條**只是給別人角色卡自帶的卡片**當 fallback，自己的面板不經過它（本次不碰）。

### `☑ 手機 app`
- 勾手機＝走商店現成 `_install()`：OS_DB `phone_apps` + `phone_shell.addApp` → 桌面圖標 → `AppRuntime.mountAppIframe(..., {preview:false})`。

> 同一筆記錄、兩個旗標——勾哪個就在哪個出口出現，不存兩份、不分兩類。
>
> **預設：劇情 ON、手機 OFF。** 手機是 opt-in，要當 app 用才額外勾。純展示 / 不算應用的東西保持手機不勾，永遠不在桌面長圖標。

---

## 4. 一個庫、兩個視窗

同一個庫、一筆記錄，兩個視窗只是不同 filter：
- **展廳（全部）**：所有面板都在這。純展示組件住這裡，管理掛載開關。
- **我的應用（手機）**：**只列 `mounts.phone===true` 的**。不算應用 / 沒勾手機的東西**不會出現在這**——直接解掉「有些不需要 app」。

- 每筆：
  ```js
  {
    id, name, emoji,
    html: '<!DOCTYPE html>…',          // _assembleApp 產物
    caps: 'display' | 'gen' | 'both',  // 能力自動標（AI 生成時判定，純顯示用）
    mounts: { story: bool, phone: bool },
    trigger: 'XXX_OPEN',               // 勾劇情時的觸發詞（AI 建議、可改）
    createdAt
  }
  ```
- **能力小標自動判定**：生成時看面板有沒有用 `callAI/genImg`（有=能含 gen），有沒有讀正文顯示（有=含 display）→ 標 display/gen/both。不丟選擇題給使用者。
- 儲存沿用既有 store（傾向 `saveVNTagTemplate` + 上述欄位，或 OS_DB 既有面板庫加欄），避免再開一套 CRUD。
- 列表渲染：圖標+名稱+能力小標+兩個掛載開關+刪除/改名。勾「劇情」即同步設為展廳啟用模板；勾「手機」即同步裝/卸桌面圖標。

---

## 5. 重用 / 新增 / 收掉

**重用（幾乎全是接線）**
- 創作室：chat loop、歷史快照、重新設計、`saveStudioChat`、展廳啟用→VN 直讀。
- 商店：`_parseGen`、`_assembleApp`、helper（callAI/genImg/saveData/goBack）、`AppRuntime.mountAppIframe`、`_install`/`phone_shell.addApp`。

**新增**
- 創作室生成 prompt 加「可 call API 生成」授權段 + 接口掛上（含副模型 transient）。
- 產物 `caps`（自動標）/`mounts`（兩開關）/`trigger` 欄。
- 統一庫清單的兩個掛載開關 UI（勾劇情↔展廳啟用、勾手機↔裝桌面）。

**收掉（依「搬完清舊」規矩）**
- 商店 `_bindWorkshop`/`_wsPrompt` 的一次性工坊 UI：入口導向創作室後退役，不留兩套應用生成器。
- `index.js`/`index.html` 兩條載入線對應清乾淨。

---

## 6. 資料流

**生成 → 發佈**
1. 商店點「AI 生成應用」→ 開創作室製作流程。
2. 描述需求 → 對話式生成 → `_assembleApp` → iframe 預覽（佔位省額度）→ 不滿意接著對話改 / 歷史快照 / 重新設計。
3. 滿意 → 命名/emoji →（自動標好 caps）→ 勾掛載：劇情 / 手機 / 兩者 → 存統一庫，依勾選同步「展廳啟用」與「桌面安裝」。

**運行**
- 劇情：AI 寫觸發詞 → VN 系統從展廳直讀 → inline 彈出 → 面板自己讀正文顯示 +（若有）按鈕 call 副模型生成 → 就貼回聊天室。
- 手機：點圖標 → iframe 開同一份 HTML → 同行為。

---

## 7. 影響檔案（預估）

- 改：`os_phone/os/os_studio.js`（生成 prompt 加 API 授權段、接口掛上、製作流程接「AI 生成應用」入口、產物欄位、清單掛載開關）。
- 改：`os_phone/os/app_store.js`（「AI 生成應用」入口改導向創作室；退役一次性工坊）。
- 改：`os_phone/os/os_db.js`（產物 `caps/mounts/trigger` 欄；沿用既有 store）。
- 改/重用：橋接層 helper（`callAI/genImg` 已現成；inline 端確認同樣掛上）。
- 改：`index.js` / `index.html`（載入線清理）。

---

## 8. 開放問題（皆有預設）

- **儲存 store**：沿用既有面板庫 + 加欄（預設）vs 新 store。傾向沿用。
- **觸發詞來源**：AI 生成時建議一個、可改（預設）。
- **「讀正文顯示」的範圍**：`callAI` 本就帶最近劇情；若某面板要全局讀整個聊天室，得避開 TauriTavern 懶載入只回半截（走 `getChatHistoryDetail`/`/api/chats/get`）——這是**單一面板自己的邏輯**，框架不綁，實作該面板時再處理。

---

## 9. 測試要點（手動）

- 商店點「AI 生成應用」→ 確實開創作室、可對話式來回改、歷史快照可回退。
- 生成一個會 call API 的面板：預覽裡按鈕能 call 副模型生成（佔位不燒額度）；副模型用完 profile 切回呼叫前。
- caps 小標自動標對（純展示 / 純生成 / 兩者）。
- 勾「劇情」→ 該面板在展廳變啟用 → 劇情寫觸發詞能 inline 彈出（**不需任何酒館正則操作**）。
- 勾「手機」→ 桌面長圖標、點開同行為。勾兩者 → 兩處都在。
- 刷新頁面後庫記錄、展廳啟用態、桌面圖標都還在。
