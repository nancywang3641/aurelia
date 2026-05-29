# 午夜怪談電台 UI 重設計 — 設計規格

**日期**: 2026-05-29  
**對象**: `參考資料/panel/regex-horror_start.json` 內嵌 HTML  
**方案**: C（混合）— 關鍵質感用圖片，卡片與架構用 CSS/SVG

---

## 1. 容器規格

| 屬性 | 值 |
|------|-----|
| 寬度 | 100%，max-width: 480px |
| 高度 | 520px |
| 背景 | `aseets/鐵盒素材.png` cover |
| 外框陰影 | `0 10px 40px rgba(0,0,0,0.7)` |
| overflow | hidden |

原設計稿畫布 1205×1306，與目標 480×520 長寬比幾乎相同（都是 0.923），**百分比座標可直接沿用**。

---

## 2. 頁面結構

### 2.1 單頁合併架構

舊版三頁切換（radio → stories → dream）改為：

- **page-main**：Header + CRT + 檔案庫 + 三卡 + Footer（Page1+Page2 合一）
- **page-dream**：故事詳情 + DIVE（Page3，保留，視覺翻新）

### 2.2 狀態機

```
[初始] CRT=OFFLINE，卡片=空殼，進入怪談 disabled
   ↓ 點「重新收訊」→ startBroadcast()
[廣播中] CRT 打字動畫，卡片保持空殼
[廣播完] 三卡填入資料，「進入怪談」變 active
   ↓ 點卡片 → 選中（發光邊框）
[已選] selectedStoryIdx 設定
   ↓ 點「進入怪談」→ openDream(selectedIdx) → showPage('page-dream')
[Page-dream] 故事詳情 + DIVE 按鈕 → diveIntoStory()
```

---

## 3. 版面分區（480×520px）

| 區域 | 高度 | 實作 |
|------|------|------|
| Header | 48px | 純 CSS，鐵盒素材底 |
| CRT 電視框 | 180px | `hr_crt_frame.png` 作為 background-image |
| 螢幕內 SVG 層 | 絕對定位蓋在 CRT 內 | inline SVG |
| 檔案庫標題條 | 28px | 純 CSS |
| 三張故事卡 | 168px | CSS grid 3 欄，各卡用獨立 background |
| Footer 按鈕列 | 60px | 三個圖片按鈕 |
| 間距 | 餘下 ~36px | padding / gap |

---

## 4. Header（48px）

```
[● REC]  [午夜怪談電台 / MIDNIGHT FREQ // ON AIR]  [▊▊▊ 訊號良好]
```

- 左：SVG `circle` r=5 紅色，CSS `hrBlink` 動畫；旁 "REC" 文字
- 中：中文大標（Noto Serif TC）+ 英文副標（VT323 字型）
- 右：4 格 SVG bar（前3填滿）+ "訊號良好" 文字
- 背景：`鐵盒素材.png` 疊 `rgba(0,0,0,0.55)` 遮罩

---

## 5. CRT 電視框（180px）

### 5.1 外框

- `background-image: url(aseets/hr_crt_frame.png)` cover
- 螢幕可視區（綠色部分）：approximately `left:8.5% top:9% width:80% height:75%`（實測微調）
- 螢幕上再疊 `噪點素材.png`，`mix-blend-mode: screen`，opacity 0.25

### 5.2 螢幕內 inline SVG（動態）

SVG 座標系：100%×100% viewBox，貼齊螢幕可視區

| 元件 | 規格 |
|------|------|
| `頻率 FM` 標籤 | 左上，9px VT323，綠色 |
| `午夜時段 HH:MM` | 右上，動態時鐘，9px VT323 |
| `99.7` 大字 | 左中，80px VT323，`#4ade80`，glow filter |
| 波形動畫 | 右中，16 根 `<rect>` 各自 `<animate>` height |
| 頻率刻度尺 | 中下，`<line>` + `<text>` 88/92/96/100/104/108，指針在 99.7 |
| SIGNAL LOCKED | 左下，`<rect>` 綠邊框 + `<text>` |
| 訊號強度格 | 右下，7 個 `<rect>`，前5 填 `#4ade80`，後2 填 `rgba(74,222,128,0.2)` |

### 5.3 右側旋鈕（裝飾）

- 圓形 SVG，絕對定位於 CRT 框右外緣
- 同心圓 + 放射刻度線，不可互動

---

## 6. 檔案庫標題條（28px）

```
[📁 icon]  本台檔案庫          [⚠] 未經澄實·請謹慎收聽
```

- 背景：`rgba(0,0,0,0.6)` + 上下 1px 綠色邊線
- ⚠ 用 SVG 三角形

---

## 7. 三張故事卡（168px，CSS grid 3欄）

### 7.1 卡片底圖

- `#card-1`: `background-image: url(aseets/hr_card_1.png)`
- `#card-2`: `background-image: url(aseets/hr_card_2.png)`
- `#card-3`: `background-image: url(aseets/hr_card_3.png)`
- `background-size: cover`

### 7.2 卡片內部結構（從上到下）

```
[上端 8px] 空（#00X 已在底圖上）
[photo area 70px] 暗漸層 + 噪點 overlay（CSS）
  └── NEW 印章（SVG 斜橢圓，絕對定位右上角）
[分隔線]
[標題 20px] Noto Serif TC，深墨色
[meta 16px] 性別｜年齡｜身份，小字
[危險度 20px] "危險度" 文字 + 5格 SVG 方塊（動態填色）
```

### 7.3 互動狀態

| 狀態 | 樣式 |
|------|------|
| 空殼（未廣播）| photo area 更暗，無標題/meta/危險度 |
| 已填入 | 正常顯示，hover 微陰影 |
| 已選中 | `box-shadow: 0 0 12px #dc2626`，紅色外發光 |

### 7.4 NEW 印章 SVG

```svg
<g transform="rotate(-15)">
  <ellipse rx="18" ry="10" fill="none" stroke="#dc2626" stroke-width="1.5"/>
  <text font-size="8" fill="#dc2626" text-anchor="middle" dy="3">NEW</text>
</g>
```

---

## 8. Footer 按鈕列（60px）

| 位置 | 元素 | 實作 |
|------|------|------|
| 左 1/3 | 警告牌 | `hr_btn_warning.png` + `background-size:cover` |
| 中 1/3 | 重新收訊 | `hr_btn_refresh.png` 按鈕，`onclick=startBroadcast()` |
| 右 1/3 | 進入怪談 | `hr_btn_enter.png` 按鈕，`onclick=enterSelected()`，初始 `opacity:0.45 + pointer-events:none` |

**`enterSelected()` 定義**（新增函式）：
```js
let selectedStoryIdx = null;

function selectCard(idx) {
  selectedStoryIdx = idx;
  // 移除所有卡片選中狀態，給第 idx 張加 .selected class
  document.querySelectorAll('.hr-card').forEach((c, i) => c.classList.toggle('selected', i === idx));
  // 啟用「進入怪談」按鈕
  const btn = document.getElementById('btn-enter');
  if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
}

function enterSelected() {
  if (selectedStoryIdx === null) return;
  openDream(selectedStoryIdx);
  showPage('page-dream');
}
```

---

## 8.5 renderStories() 改寫重點

原函式將卡片渲染到 `#stories-body`（舊 page-stories），新版改為更新三個固定卡片槽：

- DOM 結構：三個 `<div class="hr-card" id="card-slot-0/1/2">` 預先存在 page-main
- `renderStories()` 呼叫後，遍歷 `STATE.stories`，將資料填入對應 `card-slot-{i}`
- 卡片點擊事件：`onclick="selectCard(${i})"`（取代舊版 `onclick="openDream(${i})"` 直接跳頁）
- 廣播完成後才顯示 NEW 印章、標題、meta、危險度；此前卡片只顯示底圖

---

## 9. Page-dream（故事詳情）

視覺翻新，結構不動：
- 背景：`鐵盒素材.png`
- 各 detail card 改用 `舊紙張素材.png` 底
- DIVE 按鈕沿用 `hr_btn_enter.png` 樣式
- JS 函式不改：`openDream(idx)` / `diveIntoStory()`

---

## 10. 素材搬移計劃

實作前需執行：

```
參考資料/.../part_005.png → aseets/hr_crt_frame.png
參考資料/.../part_006.png → aseets/hr_btn_warning.png
參考資料/.../part_007.png → aseets/hr_btn_refresh.png
參考資料/.../part_008.png → aseets/hr_btn_enter.png
參考資料/.../part_001.png → aseets/hr_card_1.png
參考資料/.../part_002.png → aseets/hr_card_2.png
參考資料/.../part_003.png → aseets/hr_card_3.png
```

HTML 引用路徑：`/scripts/extensions/third-party/my-tavern-extension/aseets/xxx.png`

---

## 11. CSS 變數

```css
--hr-bg:        #0a0a0e
--hr-crt:       #4ade80
--hr-crt-dim:   rgba(74,222,128,0.65)
--hr-warn:      #dc2626
--hr-paper:     #f4e8d0
--hr-ink:       #2a1f10
--hr-line:      rgba(74,222,128,0.18)
```

---

## 12. 字型

| 用途 | 字型 |
|------|------|
| CRT 數字/英文 UI | VT323（Google Fonts） |
| 中文標題 | Noto Serif TC |
| 中文內文/meta | Noto Sans TC |

---

## 12.5 CRT 螢幕可視區微調方法

`part_005.png` 的螢幕框位置在實作時需目視微調。初始估算：

```css
.hr-screen-inner {
  position: absolute;
  left: 8.5%; top: 9%;
  width: 80%; height: 75%;
}
```

若偏移，調整這四個值直到 SVG 內容對齊螢幕玻璃區即可。

---

## 13. 不在此次範圍內

- Page-dream 的完整 UI 重設計（只做最低限度視覺翻新）
- 角色卡 photo 真實圖片（保留純 CSS 暗漸層佔位）
- 音效 / Web Audio API
